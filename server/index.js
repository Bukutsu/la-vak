const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const security = require('./security');
const Discovery = require('./discovery');
const Transfer = require('./transfer');

const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const PORT = 3000;

// Request Logger (Move to top)
app.use((req, res, next) => {
    console.log(`[HTTP] ${req.method} ${req.url} from ${req.ip}`);
    next();
});

// Middleware
app.use(cors());
app.use(express.json());

// Track active web sockets by peer ID
const webSockets = new Map();

// Configure Multer for temporary uploads
const uploadDir = path.join(__dirname, 'uploads');
const sharedDir = path.join(__dirname, 'shared'); // For web downloads

if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(sharedDir)) fs.mkdirSync(sharedDir, { recursive: true });

// Serve shared folder statically
app.use('/shared', express.static(sharedDir));

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir)
    },
    filename: function (req, file, cb) {
        // Keep original filename to preserve extension, etc.
        // In production, might want to randomize to avoid collisions.
        cb(null, Date.now() + '-' + file.originalname)
    }
});

const upload = multer({ storage: storage });

// API Routes
app.get('/api/status', (req, res) => {
    res.json({
        status: 'online',
        publicKey: security.getPublicKey() ? 'Loaded' : 'Initializing...'
    });
});

app.get('/api/peers', (req, res) => {
    // Convert Map to Array and flatten structure for frontend
    const isLocalhostRequest = req.hostname === 'localhost' || req.hostname === '127.0.0.1';

    const peers = Array.from(discovery.peers.values()).map(p => ({
        id: p.info.id,
        hostname: p.info.hostname + (p.isSelf ? ' (You)' : ''),
        remoteAddress: p.isSelf && isLocalhostRequest ? '127.0.0.1' : p.remoteAddress,
        isSelf: p.isSelf
    }));
    res.json(peers);
});

app.post('/api/send', upload.single('file'), async (req, res) => {
    if (!req.file || !req.body.peerIp) {
        console.error('[API] Missing file or peerIp', { hasFile: !!req.file, peerIp: req.body.peerIp });
        return res.status(400).json({ error: 'Missing file or peerIp' });
    }

    let { peerIp } = req.body;
    const filePath = req.file.path;
    const filename = req.file.originalname;

    console.log(`[API] Processing send request for ${filename} to ${peerIp}`);

    // Check if the target is a Web Peer (we find them by IP in the discovery map)
    const targetPeer = Array.from(discovery.peers.values()).find(p => p.remoteAddress === peerIp && p.isWeb);

    if (targetPeer) {
        console.log(`[API] Target is Web Peer. Relaying via WebSocket...`);
        const targetSocket = webSockets.get(targetPeer.info.id);
        
        if (targetSocket) {
            // Copy file to shared directory with a unique name
            const shareId = Math.random().toString(36).substr(2, 9);
            const shareName = `${shareId}-${filename}`;
            const sharePath = path.join(sharedDir, shareName);
            
            fs.copyFileSync(filePath, sharePath);

            // Use the host from the request headers
            // We need to be careful: if req.get('host') is 'localhost', it won't work for the phone.
            let host = req.get('host');
            
            // If the request came to 'localhost', we need to replace it with the actual IP
            if (host.includes('localhost') || host.includes('127.0.0.1')) {
                const interfaces = require('os').networkInterfaces();
                for (const name of Object.keys(interfaces)) {
                    for (const iface of interfaces[name]) {
                        if (iface.family === 'IPv4' && !iface.internal) {
                            host = host.replace(/localhost|127\.0\.0\.1/, iface.address);
                            break;
                        }
                    }
                }
            }

            const downloadUrl = `http://${host}/shared/${shareName}`;
            
            targetSocket.emit('transfer:web_request', {
                filename,
                url: downloadUrl
            });
            return res.json({ success: true, message: 'Web transfer initiated' });
        }
    }

    // Standard TCP transfer for full Engines
    // If the peer is 127.0.0.1 or matches one of our local IPs, use 'localhost'
    const interfaces = require('os').networkInterfaces();
    const localIps = ['127.0.0.1', 'localhost'];
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4') localIps.push(iface.address);
        }
    }

    if (localIps.includes(peerIp)) {
        console.log(`[API] Target IP ${peerIp} is local. Using localhost.`);
        peerIp = 'localhost';
    }

    console.log(`[API] Request to send ${req.file.originalname} to ${peerIp}`);

    try {
        await Transfer.sendFile(peerIp, filePath, req.file.originalname);
        res.json({ success: true, message: 'Transfer initiated' });
    } catch (err) {
        console.error('[API] Transfer failed:', err);
        res.status(500).json({ error: err.message });
    }
});

function getFormattedPeers(isLocalhostRequest = false) {
    let primaryNetworkIp = '';
    const os = require('os'); // Import os module here
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal && iface.address !== '127.0.0.1') {
                primaryNetworkIp = iface.address;
                break;
            }
        }
        if (primaryNetworkIp) break;
    }

    return Array.from(discovery.peers.values()).map(p => {
        let displayAddress = p.remoteAddress;
        // If it's the local peer and its address is 127.0.0.1, override with the actual network IP
        if (p.isSelf && displayAddress === '127.0.0.1' && primaryNetworkIp) {
            displayAddress = primaryNetworkIp;
        }
        return {
            id: p.info.id,
            hostname: p.info.hostname + (p.isSelf ? ' (You)' : ''),
            remoteAddress: displayAddress,
            isSelf: p.isSelf
        };
    });
}

// WebSocket Handling
io.on('connection', (socket) => {
    const remoteAddress = socket.handshake.address.replace('::ffff:', '');
    console.log(`[WS] Client connected from ${remoteAddress}`);

    // Determine if the connecting client is local
    const isLocalClient = remoteAddress === '127.0.0.1' || remoteAddress === '::1';

    // Allow the client to register as a "Web Peer"
    socket.on('peer:register', (data) => {
        if (data.id && data.hostname) {
            console.log(`[WS] Registering Web Peer: ${data.hostname} (${data.id})`);
            socket.peerId = data.id;
            webSockets.set(data.id, socket);
            discovery.addWebPeer(data.id, data.hostname, remoteAddress);
        }
    });

    // Send current peers immediately
    socket.emit('peers:update', getFormattedPeers(isLocalClient));

    socket.on('disconnect', () => {
        if (socket.peerId) {
            console.log(`[WS] Web Peer disconnected: ${socket.peerId}`);
            webSockets.delete(socket.peerId);
        } else {
            console.log('[WS] Client disconnected');
        }
    });
});

// Initialize Systems
const discovery = new Discovery();

async function start() {
    console.log('--- La-Vak Server Starting ---');

    // 1. Security Kernel
    await security.initialize();

    // 2. Discovery
    discovery.on('peer:discovered', (peer) => {
        console.log(`[Discovery] New Peer: ${peer.hostname} (${peer.id})`);
        // We need to emit for all clients, so we don't pass isLocalhostRequest here
        io.emit('peers:update', getFormattedPeers(false)); 
    });

    discovery.on('peer:left', (peer) => {
        console.log(`[Discovery] Peer Left: ${peer.id}`);
        io.emit('peers:update', getFormattedPeers(false));
    });

    discovery.start();

    // 3. Transfer Manager
    Transfer.on('transfer:start', (data) => {
        console.log(`[Transfer] Broadcast start: ${data.filename}`);
        io.emit('transfer:incoming', data);
    });

    Transfer.on('transfer:complete', (data) => {
        console.log(`[Transfer] Broadcast complete`);
        io.emit('transfer:success', data);
    });

    Transfer.start();

    // 4. API Server
    server.listen(PORT, () => {
        console.log(`[API] Server running on http://localhost:${PORT}`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
});
