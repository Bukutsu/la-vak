const dgram = require('dgram');
const EventEmitter = require('events');
const os = require('os');
const crypto = require('crypto');

const MULTICAST_ADDR = '239.1.1.1';
const PORT = 41234;
const HEARTBEAT_INTERVAL = 1000; // 1 second

class PeerDiscovery extends EventEmitter {
    constructor() {
        super();
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        this.peerId = crypto.randomUUID();
        this.hostname = os.hostname();
        this.peers = new Map(); // id -> { info, lastSeen }
        this.interval = null;

        this._setupSocket();
    }

    _setupSocket() {
        this.socket.on('error', (err) => {
            console.error(`[Discovery] Socket error:\n${err.stack}`);
            this.socket.close();
        });

        this.socket.on('message', (msg, rinfo) => {
            this._handleMessage(msg, rinfo);
        });

        this.socket.on('listening', () => {
            const address = this.socket.address();
            console.log(`[Discovery] Listening on ${address.address}:${address.port}`);

            this.socket.setMulticastLoopback(true);
            this.socket.setMulticastTTL(1);

            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4') {
                        try {
                            this.socket.addMembership(MULTICAST_ADDR, iface.address);
                            console.log(`[Discovery] Joined multicast group on ${iface.address} (${name})`);
                        } catch (e) {
                            console.warn(`[Discovery] Failed to join multicast on ${iface.address}: ${e.message}`);
                        }
                    }
                }
            }
        });
    }

    start() {
        this.socket.bind(PORT, () => {
            this._startHeartbeat();
        });
    }

    _startHeartbeat() {
        this.interval = setInterval(() => {
            const interfaces = os.networkInterfaces();
            for (const name of Object.keys(interfaces)) {
                for (const iface of interfaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        const message = JSON.stringify({
                            type: 'HELLO',
                            id: this.peerId,
                            hostname: this.hostname,
                            remoteAddress: iface.address, // Explicitly tell others our IP
                            timestamp: Date.now()
                        });

                        try {
                            this.socket.setMulticastInterface(iface.address);
                            this.socket.send(message, PORT, MULTICAST_ADDR, (err) => {
                                if (err) console.error('[Discovery] Failed to send heartbeat:', err);
                            });
                        } catch (e) {
                            // Ignore interface errors
                        }
                    }
                }
            }
            this._prunePeers();
        }, HEARTBEAT_INTERVAL);
    }

    _handleMessage(msg, rinfo) {
        try {
            const data = JSON.parse(msg.toString());

            if (data.type === 'HELLO') {
                const peerId = data.id;
                const isNew = !this.peers.has(peerId);

                // Add a flag to indicate if it's the local device
                const isSelf = data.id === this.peerId;
                
                // Use the reported address from the packet if available
                const remoteAddr = data.remoteAddress || rinfo.address;

                this.peers.set(peerId, {
                    info: data,
                    remoteAddress: remoteAddr,
                    lastSeen: Date.now(),
                    isSelf
                });

                if (isNew) {
                    this.emit('peer:discovered', { ...data, remoteAddress: remoteAddr, isSelf });
                }
            }
        } catch (e) {
            console.warn('[Discovery] Received invalid JSON:', msg.toString());
        }
    }

    _prunePeers() {
        const now = Date.now();
        for (const [id, peer] of this.peers.entries()) {
            // Prune UDP peers after 5 seconds, but give Web peers 30 seconds 
            // since they don't have a background heartbeat loop.
            const timeout = peer.isWeb ? 30000 : 5000;
            if (now - peer.lastSeen > timeout) {
                this.peers.delete(id);
                this.emit('peer:left', { id });
            }
        }
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
        try {
            this.socket.close();
        } catch (e) {
            // ignore if already closed
        }
    }

    /**
     * Manually registers a peer (e.g., a Web Client)
     */
    addWebPeer(id, hostname, remoteAddress) {
        if (id === this.peerId) return; // Ignore self

        const isNew = !this.peers.has(id);
        const info = {
            type: 'WEB',
            id: id,
            hostname: hostname,
            timestamp: Date.now()
        };

        this.peers.set(id, {
            info: info,
            remoteAddress: remoteAddress,
            lastSeen: Date.now(),
            isSelf: false,
            isWeb: true // Flag to identify web-only peers
        });

        if (isNew) {
            this.emit('peer:discovered', { ...info, remoteAddress, isSelf: false, isWeb: true });
        }
    }
}

module.exports = PeerDiscovery;
