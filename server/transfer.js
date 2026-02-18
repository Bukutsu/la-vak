const net = require('net');
const security = require('./security');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const EventEmitter = require('events');

const TRANSFER_PORT = 41235;

class TransferManager extends EventEmitter {
    constructor() {
        super();
        this.server = null;
        this.downloadDir = path.join(__dirname, '..', 'downloads');

        if (!fs.existsSync(this.downloadDir)) {
            fs.mkdirSync(this.downloadDir, { recursive: true });
        }
    }

    start() {
        this.server = net.createServer((socket) => {
            this._handleConnection(socket);
        });

        this.server.listen(TRANSFER_PORT, () => {
            console.log(`[Transfer] Listening on TCP ${TRANSFER_PORT}`);
        });

        this.server.on('error', (err) => {
            console.error(`[Transfer] Server error:`, err);
        });
    }

    /**
     * Handles incoming file reception
     */
    async _handleConnection(socket) {
        const remoteAddress = socket.remoteAddress;
        console.log(`[Transfer] Incoming TCP connection from ${remoteAddress}`);

        let sessionKey = null;
        let fileStream = null;
        let buffer = Buffer.alloc(0);
        let expectedHash = null;
        let receivedFilePath = null;
        let transferCompleted = false; // Flag to ensure EOF is processed only once

        socket.on('data', async (chunk) => {
            buffer = Buffer.concat([buffer, chunk]);

            while (buffer.length >= 4 && !transferCompleted) {
                const msgLen = buffer.readUInt32BE(0);
                if (buffer.length < 4 + msgLen) break; // Wait for more data

                // Extract message
                const msgBuf = buffer.slice(4, 4 + msgLen);
                buffer = buffer.slice(4 + msgLen);

                try {
                    const msg = JSON.parse(msgBuf.toString());
                    
                    switch (msg.type) {
                        case 'HELLO':
                            console.log(`[Transfer] Handshake initiated by ${remoteAddress}`);
                            const pubKey = security.getPublicKey();
                            this._sendFrame(socket, { type: 'PUBLIC_KEY', key: pubKey });
                            break;

                        case 'SESSION_KEY':
                            try {
                                const encryptedKey = Buffer.from(msg.key, 'base64');
                                sessionKey = security.decryptAsymmetric(encryptedKey);
                                console.log(`[Transfer] Session key established.`);
                                this._sendFrame(socket, { type: 'READY' });
                            } catch (e) {
                                console.error('[Transfer] Failed to decrypt session key:', e.message);
                                throw new Error('Failed to establish session key');
                            }
                            break;

                        case 'METADATA':
                            if (!sessionKey) throw new Error('Protocol error: METADATA received before SESSION_KEY');
                            
                            const decryptedMetaBuf = security.decryptSymmetric(msg.payload, sessionKey);
                            const metadata = JSON.parse(decryptedMetaBuf.toString());
                            
                            console.log(`[Transfer] Receiving file: ${metadata.filename} (${metadata.size} bytes)`);
                            this.emit('transfer:start', { filename: metadata.filename, size: metadata.size, remoteAddress });

                            expectedHash = metadata.hash;
                            receivedFilePath = path.join(this.downloadDir, metadata.filename);
                            fileStream = fs.createWriteStream(receivedFilePath);
                            
                            fileStream.on('error', (err) => {
                                console.error(`[Transfer] File stream error: ${err.message}`);
                                socket.destroy();
                            });

                            this._sendFrame(socket, { type: 'ACK' });
                            break;

                        case 'CHUNK':
                            if (!sessionKey || !fileStream) throw new Error('Protocol error: CHUNK received in invalid state');
                            const chunkData = security.decryptSymmetric(msg.payload, sessionKey);
                            fileStream.write(chunkData);
                            break;

                        case 'EOF':
                            console.log(`[Transfer] File transfer complete. Verifying integrity...`);
                            transferCompleted = true; // Mark transfer as completed to stop processing further chunks
                            if (fileStream) {
                                fileStream.end(async () => {
                                    if (expectedHash && receivedFilePath) {
                                        try {
                                            const actualHash = await security.hashFile(receivedFilePath);
                                            
                                            if (actualHash === expectedHash) {
                                                console.log('[Transfer] Integrity Check: PASSED (SHA-256 matched)');
                                                this.emit('transfer:complete', { remoteAddress, status: 'success' });
                                            } else {
                                                console.error('[Transfer] Integrity Check: FAILED! Hash mismatch for', receivedFilePath);
                                                // Optional: Delete corrupted file
                                                if (fs.existsSync(receivedFilePath)) {
                                                    fs.unlinkSync(receivedFilePath);
                                                }
                                                this.emit('transfer:complete', { remoteAddress, status: 'error', message: 'Hash mismatch' });
                                            }
                                        } catch (hashErr) {
                                            console.error('[Transfer] Error during hash verification:', hashErr.message);
                                            this.emit('transfer:complete', { remoteAddress, status: 'error', message: 'Hash verification error' });
                                        }
                                    } else {
                                        this.emit('transfer:complete', { remoteAddress, status: 'success', message: 'No hash provided' });
                                    }
                                    socket.end(); // End socket after file stream and verification are complete
                                });
                            } else {
                                console.warn('[Transfer] EOF received but no fileStream was active.');
                                this.emit('transfer:complete', { remoteAddress, status: 'error', message: 'EOF without active file stream' });
                                socket.end();
                            }
                            break;
                            
                        default:
                            console.warn(`[Transfer] Unknown message type: ${msg.type}`);
                            throw new Error(`Unknown message type: ${msg.type}`);
                    }
                } catch (err) {
                    console.error(`[Transfer] Error processing message:`, err);
                    socket.destroy(); // Destroy socket on protocol error
                }
            }
        });

        socket.on('end', () => {
            console.log('[Transfer] Connection closed by remote end');
            if (fileStream && !transferCompleted) { // If stream was open but EOF not received
                console.warn('[Transfer] Transfer ended prematurely, cleaning up incomplete file.');
                fileStream.end();
                if (receivedFilePath && fs.existsSync(receivedFilePath)) {
                    fs.unlinkSync(receivedFilePath);
                }
                this.emit('transfer:complete', { remoteAddress, status: 'error', message: 'Connection closed prematurely' });
            }
        });

        socket.on('error', (err) => {
            console.error(`[Transfer] Socket error from ${remoteAddress}:`, err.message);
            if (fileStream && !fileStream.writableEnded) {
                console.warn('[Transfer] File stream still open during socket error, attempting to clean up.');
                fileStream.end();
                if (receivedFilePath && fs.existsSync(receivedFilePath)) {
                    fs.unlinkSync(receivedFilePath); // Clean up partial file
                }
            }
            this.emit('transfer:complete', { remoteAddress, status: 'error', message: `Socket error: ${err.message}` });
        });
    }

    _sendFrame(socket, obj) {
        const json = JSON.stringify(obj);
        const buf = Buffer.from(json);
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(buf.length, 0);
        socket.write(Buffer.concat([lenBuf, buf]));
    }

    /**
     * Initiates a file transfer to a peer.
     */
    async sendFile(peerAddress, filePath, originalFilename) {
        console.log(`[Transfer] Attempting to send ${originalFilename} to ${peerAddress}`);
        return new Promise((resolve, reject) => {
            const socket = new net.Socket();
            let sessionKey = null;
            let fileStream = null;
            let buffer = Buffer.alloc(0);

            // Connect
            socket.connect(TRANSFER_PORT, peerAddress, () => {
                console.log(`[Transfer] TCP Connected to ${peerAddress}. Sending HELLO...`);
                this._sendFrame(socket, { type: 'HELLO' });
            });

            socket.on('data', async (chunk) => {
                buffer = Buffer.concat([buffer, chunk]);

                while (true) {
                    if (buffer.length < 4) break;
                    const msgLen = buffer.readUInt32BE(0);
                    if (buffer.length < 4 + msgLen) break;

                    const msgBuf = buffer.slice(4, 4 + msgLen);
                    buffer = buffer.slice(4 + msgLen);

                    try {
                        const msg = JSON.parse(msgBuf.toString());

                        switch (msg.type) {
                            case 'PUBLIC_KEY':
                                console.log('[Transfer] Received Peer Public Key');
                                // 1. Generate & Send Session Key
                                sessionKey = security.generateSessionKey();
                                const encryptedSessionKey = security.encryptAsymmetric(sessionKey, msg.key);
                                this._sendFrame(socket, { 
                                    type: 'SESSION_KEY', 
                                    key: encryptedSessionKey.toString('base64') 
                                });
                                break;

                            case 'READY':
                                console.log('[Transfer] Peer Ready. Sending Metadata...');
                                // 2. Send Metadata
                                try {
                                    const stats = fs.statSync(filePath);
                                    const hash = await security.hashFile(filePath);
                                    
                                    const metadata = JSON.stringify({
                                        filename: originalFilename || path.basename(filePath),
                                        size: stats.size,
                                        hash: hash
                                    });
                                    const encryptedMeta = security.encryptSymmetric(Buffer.from(metadata), sessionKey);
                                    this._sendFrame(socket, { type: 'METADATA', payload: encryptedMeta });
                                } catch (metaErr) {
                                    console.error('[Transfer] Failed to prepare metadata:', metaErr);
                                    socket.destroy();
                                    reject(metaErr);
                                }
                                break;

                            case 'ACK':
                                console.log('[Transfer] Metadata Acknowledged. Sending File...');
                                // 3. Stream File
                                fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 }); // 64KB chunks
                                
                                fileStream.on('data', (fileChunk) => {
                                    const encryptedChunk = security.encryptSymmetric(fileChunk, sessionKey);
                                    // Handle backpressure
                                    const ok = this._writeFrameWithBackpressure(socket, { type: 'CHUNK', payload: encryptedChunk });
                                    if (!ok) {
                                        fileStream.pause();
                                        socket.once('drain', () => fileStream.resume());
                                    }
                                });

                                fileStream.on('end', () => {
                                    this._sendFrame(socket, { type: 'EOF' });
                                    console.log('[Transfer] Finished sending file.');
                                    socket.end(); // We are done
                                    resolve();
                                });

                                fileStream.on('error', (err) => {
                                    reject(err);
                                });
                                break;
                        }
                    } catch (err) {
                        reject(err);
                        socket.destroy();
                    }
                }
            });

            socket.on('error', (err) => {
                reject(err);
            });
        });
    }

    _writeFrameWithBackpressure(socket, obj) {
        const json = JSON.stringify(obj);
        const buf = Buffer.from(json);
        const lenBuf = Buffer.alloc(4);
        lenBuf.writeUInt32BE(buf.length, 0);
        return socket.write(Buffer.concat([lenBuf, buf]));
    }
}

module.exports = new TransferManager();