// =============================================================
// La-Vak — transport.js
// TCP/TLS File Streaming with E2EE (AES-256-GCM over TLS)
// =============================================================
'use strict';

const tls = require('tls');
const fs = require('fs');
const path = require('path');
const os = require('os');
const EventEmitter = require('events');
const security = require('./security');

const CHUNK_SIZE = 64 * 1024; // 64 KB
const DOWNLOADS_DIR = path.join(os.homedir(), 'Downloads', 'la-vak');

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// ---------------------------------------------------------------
// Wire protocol helpers
// Each message is: [4-byte BE length][JSON header][binary payload]
// ---------------------------------------------------------------

function encodeMessage(header, payload) {
    const headerBuf = Buffer.from(JSON.stringify(header));
    const headerLenBuf = Buffer.alloc(4);
    headerLenBuf.writeUInt32BE(headerBuf.length);

    const parts = [headerLenBuf, headerBuf];
    if (payload && payload.length > 0) {
        parts.push(payload);
    }

    const totalBuf = Buffer.concat(parts);
    const frameLenBuf = Buffer.alloc(4);
    frameLenBuf.writeUInt32BE(totalBuf.length);
    return Buffer.concat([frameLenBuf, totalBuf]);
}

/**
 * Buffered message reader — accumulates data from a stream and
 * yields complete framed messages.
 */
class MessageReader {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    /** Push data, returns array of parsed { header, payload } */
    push(data) {
        this.buffer = Buffer.concat([this.buffer, data]);
        const messages = [];

        while (this.buffer.length >= 4) {
            const frameLen = this.buffer.readUInt32BE(0);
            if (this.buffer.length < 4 + frameLen) break;

            const frame = this.buffer.subarray(4, 4 + frameLen);
            this.buffer = this.buffer.subarray(4 + frameLen);

            // Parse header
            const headerLen = frame.readUInt32BE(0);
            const headerBuf = frame.subarray(4, 4 + headerLen);
            const payload = frame.subarray(4 + headerLen);

            try {
                const header = JSON.parse(headerBuf.toString());
                messages.push({ header, payload });
            } catch {
                // skip malformed
            }
        }

        return messages;
    }
}

// ---------------------------------------------------------------
// Transport — manages TLS server (receive) and client (send)
// ---------------------------------------------------------------

class Transport extends EventEmitter {
    constructor() {
        super();
        this.server = null;
        this.port = 0;
        this.transfers = new Map(); // transferId -> transfer state
        this._tlsCreds = null;
        this._pendingIncoming = new Map(); // transferId -> { resolve, socket, meta, ... }
    }

    /** Start TLS server on a random port. Returns the port number. */
    start() {
        return new Promise((resolve, reject) => {
            this._tlsCreds = security.generateSelfSignedCert();

            this.server = tls.createServer(
                {
                    key: this._tlsCreds.key,
                    cert: this._tlsCreds.cert,
                    rejectUnauthorized: false,
                },
                (socket) => this._handleIncoming(socket),
            );

            this.server.listen(0, () => {
                this.port = this.server.address().port;
                console.log(`[Transport] TLS server listening on port ${this.port}`);
                resolve(this.port);
            });

            this.server.on('error', reject);
        });
    }

    /** Stop the TLS server. */
    stop() {
        if (this.server) this.server.close();
    }

    /** Get the port the TLS server is listening on. */
    getPort() {
        return this.port;
    }

    /** Get all transfers. */
    getTransfers() {
        return Array.from(this.transfers.values());
    }

    /**
     * Accept or reject an incoming transfer request.
     * @param {string} transferId
     * @param {boolean} accepted
     */
    respondToIncoming(transferId, accepted) {
        const pending = this._pendingIncoming.get(transferId);
        if (!pending) return false;

        if (accepted) {
            pending.resolve(true);
        } else {
            pending.resolve(false);
        }
        return true;
    }

    // ---------------------------------------------------------------
    // SENDING SIDE
    // ---------------------------------------------------------------

    /**
     * Send a file to a peer.
     * @param {string} peerIp
     * @param {number} peerPort
     * @param {string} filePath
     * @param {string} fileName
     * @returns {Promise<string>} transferId
     */
    async sendFile(peerIp, peerPort, filePath, fileName) {
        const transferId = `send-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const fileSize = fs.statSync(filePath).size;
        const fileHash = await security.hashFile(filePath);

        const transfer = {
            id: transferId,
            direction: 'send',
            fileName,
            fileSize,
            bytesTransferred: 0,
            status: 'connecting',
            peerIp,
            startTime: Date.now(),
        };

        this.transfers.set(transferId, transfer);
        this.emit('transfer-progress', transfer);

        try {
            await this._doSend(transferId, peerIp, peerPort, filePath, fileName, fileSize, fileHash);
        } catch (err) {
            transfer.status = 'error';
            transfer.error = err.message;
            this.emit('transfer-error', transfer);
        }

        return transferId;
    }

    async _doSend(transferId, peerIp, peerPort, filePath, fileName, fileSize, fileHash) {
        const transfer = this.transfers.get(transferId);

        return new Promise((resolve, reject) => {
            const socket = tls.connect(
                { host: peerIp, port: peerPort, rejectUnauthorized: false },
                () => {
                    transfer.status = 'handshake';
                    this.emit('transfer-progress', transfer);

                    const reader = new MessageReader();
                    let sessionKey = null;
                    let sessionIv = null;

                    // Step 1: Send HELLO with our public key
                    const { publicKey } = security.getKeyPair();
                    socket.write(encodeMessage({ type: 'hello', publicKey, transferId }));

                    socket.on('data', (data) => {
                        const messages = reader.push(data);
                        for (const { header, payload } of messages) {
                            if (header.type === 'session') {
                                // Step 2: Received encrypted session key
                                const encKeyBuf = Buffer.from(header.encryptedKey, 'base64');
                                const ivBuf = Buffer.from(header.iv, 'base64');
                                sessionKey = security.decryptSessionKey(encKeyBuf);
                                sessionIv = ivBuf;

                                transfer.status = 'transferring';
                                this.emit('transfer-progress', transfer);

                                // Step 3: Send file metadata
                                socket.write(
                                    encodeMessage({
                                        type: 'meta',
                                        name: fileName,
                                        size: fileSize,
                                        hash: fileHash,
                                        transferId,
                                    }),
                                );

                                // Wait for acceptance
                            } else if (header.type === 'accepted') {
                                // Step 4: Stream encrypted file data
                                this._streamFile(socket, filePath, fileSize, sessionKey, sessionIv, transfer)
                                    .then(() => {
                                        transfer.status = 'completed';
                                        transfer.bytesTransferred = fileSize;
                                        this.emit('transfer-complete', transfer);
                                        socket.end();
                                        resolve();
                                    })
                                    .catch((err) => {
                                        reject(err);
                                        socket.destroy();
                                    });
                            } else if (header.type === 'rejected') {
                                transfer.status = 'rejected';
                                this.emit('transfer-error', transfer);
                                socket.end();
                                reject(new Error('Transfer rejected by peer'));
                            }
                        }
                    });

                    socket.on('error', (err) => reject(err));
                    socket.on('close', () => {
                        if (transfer.status === 'transferring') {
                            reject(new Error('Connection closed during transfer'));
                        }
                    });
                },
            );

            socket.on('error', (err) => reject(err));
        });
    }

    async _streamFile(socket, filePath, fileSize, key, iv, transfer) {
        return new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(filePath, { highWaterMark: CHUNK_SIZE });
            let chunkIndex = 0;

            readStream.on('data', (chunk) => {
                // Derive a per-chunk IV by incrementing
                const chunkIv = Buffer.alloc(12);
                iv.copy(chunkIv);
                chunkIv.writeUInt32BE(chunkIndex, 8);

                const { ciphertext, authTag } = security.encryptChunk(key, chunkIv, chunk);

                const msg = encodeMessage(
                    {
                        type: 'data',
                        index: chunkIndex,
                        authTag: authTag.toString('base64'),
                        chunkSize: ciphertext.length,
                    },
                    ciphertext,
                );

                const canWrite = socket.write(msg);
                if (!canWrite) {
                    readStream.pause();
                    socket.once('drain', () => readStream.resume());
                }

                transfer.bytesTransferred += chunk.length;
                chunkIndex++;

                this.emit('transfer-progress', { ...transfer });
            });

            readStream.on('end', () => {
                socket.write(encodeMessage({ type: 'done' }));
                resolve();
            });

            readStream.on('error', reject);
        });
    }

    // ---------------------------------------------------------------
    // RECEIVING SIDE
    // ---------------------------------------------------------------

    _handleIncoming(socket) {
        const reader = new MessageReader();
        let peerPublicKey = null;
        let sessionKey = null;
        let sessionIv = null;
        let fileMeta = null;
        let writeStream = null;
        let receivedBytes = 0;
        let transferId = null;

        socket.on('data', (data) => {
            const messages = reader.push(data);
            for (const { header, payload } of messages) {
                switch (header.type) {
                    case 'hello': {
                        // Step 1: Received peer's public key
                        peerPublicKey = header.publicKey;
                        transferId = header.transferId || `recv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

                        // Step 2: Generate session key, encrypt with peer's pubkey, send back
                        const sess = security.generateSessionKey();
                        sessionKey = sess.key;
                        sessionIv = sess.iv;

                        const encKey = security.encryptSessionKey(peerPublicKey, sessionKey);
                        socket.write(
                            encodeMessage({
                                type: 'session',
                                encryptedKey: encKey.toString('base64'),
                                iv: sessionIv.toString('base64'),
                            }),
                        );
                        break;
                    }

                    case 'meta': {
                        // Step 3: Received file metadata — create incoming request
                        fileMeta = {
                            name: header.name,
                            size: header.size,
                            hash: header.hash,
                        };

                        const transfer = {
                            id: transferId,
                            direction: 'receive',
                            fileName: fileMeta.name,
                            fileSize: fileMeta.size,
                            bytesTransferred: 0,
                            status: 'pending',
                            startTime: Date.now(),
                        };

                        this.transfers.set(transferId, transfer);

                        // Emit incoming request and wait for user response
                        const responsePromise = new Promise((resolve) => {
                            this._pendingIncoming.set(transferId, { resolve, socket, meta: fileMeta });
                        });

                        this.emit('incoming-request', {
                            transferId,
                            fileName: fileMeta.name,
                            fileSize: fileMeta.size,
                            peerIp: socket.remoteAddress,
                        });

                        responsePromise.then((accepted) => {
                            this._pendingIncoming.delete(transferId);
                            const t = this.transfers.get(transferId);

                            if (accepted) {
                                t.status = 'transferring';
                                socket.write(encodeMessage({ type: 'accepted', transferId }));

                                // Prepare write stream
                                const safeName = path.basename(fileMeta.name);
                                const destPath = path.join(DOWNLOADS_DIR, safeName);
                                t.destPath = destPath;
                                writeStream = fs.createWriteStream(destPath);
                                this.emit('transfer-progress', { ...t });
                            } else {
                                t.status = 'rejected';
                                socket.write(encodeMessage({ type: 'rejected', transferId }));
                                socket.end();
                                this.emit('transfer-error', t);
                            }
                        });
                        break;
                    }

                    case 'data': {
                        // Step 4: Decrypt and write chunk
                        if (!writeStream) break;
                        const t = this.transfers.get(transferId);

                        const chunkIv = Buffer.alloc(12);
                        sessionIv.copy(chunkIv);
                        chunkIv.writeUInt32BE(header.index, 8);

                        try {
                            const authTag = Buffer.from(header.authTag, 'base64');
                            const plaintext = security.decryptChunk(sessionKey, chunkIv, payload, authTag);
                            writeStream.write(plaintext);
                            receivedBytes += plaintext.length;

                            if (t) {
                                t.bytesTransferred = receivedBytes;
                                this.emit('transfer-progress', { ...t });
                            }
                        } catch (err) {
                            console.error('[Transport] Decryption failed:', err.message);
                            if (t) {
                                t.status = 'error';
                                t.error = 'Decryption failed — possible tampering';
                                this.emit('transfer-error', t);
                            }
                            socket.destroy();
                        }
                        break;
                    }

                    case 'done': {
                        // Step 5: Verify integrity
                        if (writeStream) writeStream.end();

                        const t = this.transfers.get(transferId);
                        if (!t) break;

                        const destPath = t.destPath;
                        t.status = 'verifying';
                        this.emit('transfer-progress', { ...t });

                        // Verify SHA-256
                        setTimeout(async () => {
                            try {
                                const receivedHash = await security.hashFile(destPath);
                                if (receivedHash === fileMeta.hash) {
                                    t.status = 'completed';
                                    t.bytesTransferred = t.fileSize;
                                    console.log(`[Transport] ✓ File verified: ${fileMeta.name}`);
                                    this.emit('transfer-complete', t);
                                } else {
                                    t.status = 'error';
                                    t.error = 'SHA-256 mismatch — file corrupted';
                                    console.error(`[Transport] ✗ Hash mismatch for ${fileMeta.name}`);
                                    this.emit('transfer-error', t);
                                }
                            } catch (err) {
                                t.status = 'error';
                                t.error = err.message;
                                this.emit('transfer-error', t);
                            }
                        }, 100);
                        break;
                    }
                }
            }
        });

        socket.on('error', (err) => {
            console.error('[Transport] Socket error:', err.message);
            if (transferId) {
                const t = this.transfers.get(transferId);
                if (t && t.status !== 'completed') {
                    t.status = 'error';
                    t.error = err.message;
                    this.emit('transfer-error', t);
                }
            }
        });
    }
}

module.exports = Transport;
