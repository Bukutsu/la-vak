// =============================================================
// La-Vak — index.js
// Main Orchestration: Express REST API + WebSocket bridge
// =============================================================
'use strict';

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { WebSocketServer } = require('ws');

const Discovery = require('./discovery');
const Transport = require('./transport');
const security = require('./security');

// --- Configuration ---
const HTTP_PORT = parseInt(process.env.PORT, 10) || 3001;
const UPLOAD_DIR = path.join(os.tmpdir(), 'lavak-uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// --- Express App ---
const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: UPLOAD_DIR });
const server = http.createServer(app);

// --- WebSocket ---
const wss = new WebSocketServer({ server });
const wsClients = new Set();

wss.on('connection', (ws) => {
    wsClients.add(ws);
    console.log('[WS] Client connected');

    // Send current state immediately
    ws.send(JSON.stringify({ event: 'peers-updated', data: discovery.getPeers() }));
    ws.send(JSON.stringify({ event: 'transfers-updated', data: transport.getTransfers() }));
    ws.send(
        JSON.stringify({
            event: 'device-info',
            data: getDeviceInfo(),
        }),
    );

    ws.on('close', () => {
        wsClients.delete(ws);
        console.log('[WS] Client disconnected');
    });
});

function broadcast(event, data) {
    const msg = JSON.stringify({ event, data });
    for (const ws of wsClients) {
        if (ws.readyState === 1 /* OPEN */) {
            ws.send(msg);
        }
    }
}

// --- Device Info ---
function getDeviceInfo() {
    return {
        id: discovery.getDeviceId(),
        deviceName: os.hostname(),
        platform: os.platform(),
        httpPort: HTTP_PORT,
        transportPort: transport.getPort(),
        ip: getLocalIP(),
    };
}

function getLocalIP() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

// --- Initialize Modules ---

const transport = new Transport();

// Discovery needs to know our transport port, so we start transport first
let discovery;

async function init() {
    // 1. Generate RSA keys (warm up)
    console.log('[Security] Generating RSA-4096 key pair...');
    security.getKeyPair();
    console.log('[Security] ✓ Key pair ready');

    // 2. Start TLS transport server
    const transportPort = await transport.start();
    console.log(`[Transport] ✓ TLS server on port ${transportPort}`);

    // 3. Start UDP discovery
    discovery = new Discovery({
        deviceName: os.hostname(),
        httpPort: HTTP_PORT,
        transportPort,
    });

    // Wire up discovery events → WebSocket broadcast
    discovery.on('peers-updated', (peers) => {
        broadcast('peers-updated', peers);
    });

    discovery.on('peer-joined', (peer) => {
        console.log(`[Discovery] + Peer joined: ${peer.deviceName} (${peer.ip})`);
    });

    discovery.on('peer-left', (peer) => {
        console.log(`[Discovery] - Peer left: ${peer.deviceName}`);
    });

    // Wire up transport events → WebSocket broadcast
    transport.on('transfer-progress', (transfer) => {
        broadcast('transfer-progress', transfer);
    });

    transport.on('transfer-complete', (transfer) => {
        broadcast('transfer-complete', transfer);
        broadcast('transfers-updated', transport.getTransfers());
    });

    transport.on('transfer-error', (transfer) => {
        broadcast('transfer-error', transfer);
        broadcast('transfers-updated', transport.getTransfers());
    });

    transport.on('incoming-request', (request) => {
        console.log(
            `[Transport] ← Incoming file request: ${request.fileName} (${formatBytes(request.fileSize)}) from ${request.peerIp}`,
        );
        broadcast('incoming-request', request);
    });

    discovery.start();

    // 4. Start HTTP server
    server.listen(HTTP_PORT, () => {
        console.log('');
        console.log('╔══════════════════════════════════════════╗');
        console.log('║          🏘  La-Vak (ละแวก)               ║');
        console.log('║   Secure P2P File Sync for the LAN       ║');
        console.log('╠══════════════════════════════════════════╣');
        console.log(`║  HTTP API:   http://localhost:${HTTP_PORT}       ║`);
        console.log(`║  Transport:  TLS on port ${transportPort}           ║`);
        console.log(`║  Discovery:  UDP 239.255.42.99:41234      ║`);
        console.log(`║  Device:     ${os.hostname().padEnd(27)}║`);
        console.log(`║  Local IP:   ${getLocalIP().padEnd(27)}║`);
        console.log('╚══════════════════════════════════════════╝');
        console.log('');
    });
}

// --- REST API Endpoints ---

// GET /api/device — Current device info
app.get('/api/device', (req, res) => {
    res.json(getDeviceInfo());
});

// GET /api/peers — List discovered peers
app.get('/api/peers', (req, res) => {
    res.json(discovery ? discovery.getPeers() : []);
});

// GET /api/transfers — List all transfers
app.get('/api/transfers', (req, res) => {
    res.json(transport.getTransfers());
});

// POST /api/send — Send file to peer (multipart upload)
app.post('/api/send', upload.single('file'), async (req, res) => {
    try {
        const { peerIp, peerPort } = req.body;
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file provided' });
        }
        if (!peerIp || !peerPort) {
            return res.status(400).json({ error: 'peerIp and peerPort are required' });
        }

        console.log(
            `[API] → Sending "${file.originalname}" (${formatBytes(file.size)}) to ${peerIp}:${peerPort}`,
        );

        const transferId = await transport.sendFile(
            peerIp,
            parseInt(peerPort, 10),
            file.path,
            file.originalname,
        );

        res.json({ transferId, status: 'started' });
    } catch (err) {
        console.error('[API] Send error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/respond — Accept or reject incoming transfer
app.post('/api/respond', (req, res) => {
    const { transferId, accepted } = req.body;

    if (!transferId || typeof accepted !== 'boolean') {
        return res.status(400).json({ error: 'transferId and accepted (boolean) are required' });
    }

    const ok = transport.respondToIncoming(transferId, accepted);
    if (!ok) {
        return res.status(404).json({ error: 'Transfer not found or already responded' });
    }

    res.json({ transferId, accepted });
});

// --- Helpers ---

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// --- Graceful Shutdown ---

process.on('SIGINT', () => {
    console.log('\n[La-Vak] Shutting down...');
    if (discovery) discovery.stop();
    transport.stop();
    server.close();
    process.exit(0);
});

// --- Start ---

init().catch((err) => {
    console.error('[La-Vak] Fatal:', err);
    process.exit(1);
});
