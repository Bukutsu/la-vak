// =============================================================
// La-Vak — discovery.js
// UDP Multicast Peer Discovery (mDNS-inspired, port 41234)
// =============================================================
'use strict';

const dgram = require('dgram');
const os = require('os');
const EventEmitter = require('events');

const MULTICAST_ADDR = '239.255.42.99';
const MULTICAST_PORT = 41234;
const BROADCAST_INTERVAL = 3000;  // ms
const PEER_TIMEOUT = 10000;       // ms — evict stale peers

class Discovery extends EventEmitter {
    /**
     * @param {{ deviceName: string, httpPort: number, transportPort: number }} deviceInfo
     */
    constructor(deviceInfo) {
        super();
        this.deviceInfo = deviceInfo;
        this.peers = new Map(); // id -> { ...info, lastSeen }
        this.socket = null;
        this._broadcastTimer = null;
        this._cleanupTimer = null;
        this._id = `${os.hostname()}-${process.pid}`;
    }

    /** Start broadcasting and listening for peers. */
    start() {
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

        this.socket.on('message', (msg, rinfo) => {
            try {
                const data = JSON.parse(msg.toString());
                if (data.type !== 'LAVAK_HELLO') return;
                if (data.id === this._id) return; // ignore self

                const isNew = !this.peers.has(data.id);
                this.peers.set(data.id, {
                    id: data.id,
                    deviceName: data.deviceName,
                    ip: rinfo.address,
                    httpPort: data.httpPort,
                    transportPort: data.transportPort,
                    platform: data.platform,
                    lastSeen: Date.now(),
                });

                if (isNew) {
                    this.emit('peer-joined', this.peers.get(data.id));
                    this.emit('peers-updated', this.getPeers());
                }
            } catch {
                // ignore malformed packets
            }
        });

        this.socket.on('listening', () => {
            this.socket.addMembership(MULTICAST_ADDR);
            this.socket.setMulticastTTL(128);
            this.socket.setBroadcast(true);
            console.log(`[Discovery] Listening on ${MULTICAST_ADDR}:${MULTICAST_PORT}`);
        });

        this.socket.bind(MULTICAST_PORT, () => {
            this._startBroadcasting();
            this._startCleanup();
        });
    }

    /** Stop broadcasting and close socket. */
    stop() {
        if (this._broadcastTimer) clearInterval(this._broadcastTimer);
        if (this._cleanupTimer) clearInterval(this._cleanupTimer);
        if (this.socket) {
            try { this.socket.dropMembership(MULTICAST_ADDR); } catch { }
            this.socket.close();
        }
        this.peers.clear();
    }

    /** @returns {Array} List of currently known peers. */
    getPeers() {
        return Array.from(this.peers.values()).map(({ lastSeen, ...rest }) => rest);
    }

    /** Get our own device ID. */
    getDeviceId() {
        return this._id;
    }

    // --- Private ---

    _startBroadcasting() {
        const send = () => {
            const message = JSON.stringify({
                type: 'LAVAK_HELLO',
                id: this._id,
                deviceName: this.deviceInfo.deviceName,
                httpPort: this.deviceInfo.httpPort,
                transportPort: this.deviceInfo.transportPort,
                platform: os.platform(),
            });
            const buf = Buffer.from(message);
            this.socket.send(buf, 0, buf.length, MULTICAST_PORT, MULTICAST_ADDR);
        };

        send(); // immediate first broadcast
        this._broadcastTimer = setInterval(send, BROADCAST_INTERVAL);
    }

    _startCleanup() {
        this._cleanupTimer = setInterval(() => {
            const now = Date.now();
            let changed = false;
            for (const [id, peer] of this.peers) {
                if (now - peer.lastSeen > PEER_TIMEOUT) {
                    this.peers.delete(id);
                    this.emit('peer-left', peer);
                    changed = true;
                }
            }
            if (changed) {
                this.emit('peers-updated', this.getPeers());
            }
        }, PEER_TIMEOUT / 2);
    }
}

module.exports = Discovery;
