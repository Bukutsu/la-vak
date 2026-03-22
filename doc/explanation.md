## สถาปัตยกรรมฝั่งเซิร์ฟเวอร์ของ La-Vak: เจาะลึกทางเทคนิค

สวัสดีทุกท่านครับ วันนี้เราจะมาสำรวจส่วนประกอบหลักของฝั่งเซิร์ฟเวอร์ของ La-Vak โดยเน้นที่วิธีการจัดการการค้นหาเพียร์ (peer discovery), ความปลอดภัยทางเข้ารหัส (cryptographic security) และการถ่ายโอนไฟล์อย่างปลอดภัย

---

### 1. ผู้ควบคุม: `server/index.js` - ฟังก์ชัน `start()`

หัวใจของการทำงานของเซิร์ฟเวอร์คือฟังก์ชัน `start()` ใน `server/index.js` (บรรทัดที่ 255-297) ซึ่งทำหน้าที่เป็นผู้ควบคุมหลักในการปลุกโมดูลอื่นๆ ทั้งหมดให้ทำงาน

```javascript
async function start() {
    console.log('--- La-Vak Server Starting ---');
    
    // 1. Initialize Security (RSA Key Pair Generation)
    await security.initialize();

    // 2. Initialize Peer Discovery
    discovery.on('peer:discovered', (peer) => {
        console.log(`[Discovery] New Peer: ${peer.hostname} (${peer.id})`);
        io.emit('peers:update', getFormattedPeers());
    });
    discovery.on('peer:left', (peer) => {
        console.log(`[Discovery] Peer Left: ${peer.id}`);
        io.emit('peers:update', getFormattedPeers());
    });
    discovery.start();

    // 3. Initialize File Transfer System
    Transfer.on('transfer:start', (data) => {
        console.log(`[Transfer] Broadcast start: ${data.filename}`);
        io.emit('transfer:incoming', data);
    });
    Transfer.on('transfer:complete', (data) => {
        console.log(`[Transfer] Broadcast complete`);
        io.emit('transfer:success', data);
    });
    Transfer.start();

    // 4. Start HTTP & WebSocket Server
    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.error(`[API] Port ${PORT} is already in use.`);
            process.exit(1);
        }
    });
    server.listen(PORT, () => {
        console.log(`[API] Server running on http://localhost:${PORT}`);
    });
}

start().catch(err => {
    console.error('Failed to start server:', err);
});
```

**คำอธิบาย:**

| ส่วนงาน | โค้ด | บรรทัด | รายละเอียด |
|---------|------|--------|-------------|
| ระบบความปลอดภัย | `await security.initialize()` | 258 | สร้างคู่คีย์ RSA-4096 ที่เป็นเอกลักษณ์ของเซิร์ฟเวอร์ |
| ระบบค้นหาเพียร์ | `discovery.start()` | 269 | เริ่ม UDP multicast สำหรับการตรวจจับเพียร์ |
| ระบบถ่ายโอน | `Transfer.start()` | 280 | เริ่มต้นเซิร์ฟเวอร์ TCP สำหรับการถ่ายโอนไฟล์ |
| จัดการข้อผิดพลาด | `EADDRINUSE` | 283-288 | จัดการกรณีพอร์ตถูกใช้งานแล้ว |

---

### 2. การค้นหาเพื่อน: `server/discovery.js` - ระบบชื่อสัตว์

โมดูล `discovery.js` ช่วยให้ La-Vak อินสแตนซ์บนเครือข่ายท้องถิ่นค้นหากันได้โดยไม่ต้องมีไดเรกทอรีกลาง

**ตัวตนถาวร (บรรทัดที่ 14-53):**

```javascript
class PeerDiscovery extends EventEmitter {
    constructor() {
        super();
        this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });
        
        // Robust Persistent Identity
        const identity = this._loadIdentity();
        this.peerId = identity.id;
        this.friendlyName = identity.name; // "Ambitious Dolphin"
        this.hostname = os.hostname();
        
        this.peers = new Map();
        this.interval = null;
        this._setupSocket();
    }

    _loadIdentity() {
        const IDENTITY_PATH = path.join(__dirname, '.identity.json');
        try {
            if (fs.existsSync(IDENTITY_PATH)) {
                return JSON.parse(fs.readFileSync(IDENTITY_PATH, 'utf8'));
            }
        } catch (e) {
            console.warn('[Discovery] Failed to load identity:', e.message);
        }

        const newIdentity = {
            id: crypto.randomUUID(),
            name: generateName() // สร้างชื่อแบบ "Ambitious Dolphin"
        };

        try {
            fs.writeFileSync(IDENTITY_PATH, JSON.stringify(newIdentity), 'utf8');
            console.log(`[Discovery] Created identity: ${newIdentity.name}`);
        } catch (e) {
            console.error('[Discovery] Failed to save identity:', e.message);
        }
        return newIdentity;
    }
}
```

**UDP Heartbeat (บรรทัดที่ 95-123):**

```javascript
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
                        friendlyName: this.friendlyName,
                        remoteAddress: iface.address,
                        timestamp: Date.now()
                    });

                    try {
                        this.socket.setMulticastInterface(iface.address);
                        this.socket.send(message, PORT, MULTICAST_ADDR, (err) => {
                            if (err) console.error(`[Discovery] Send error:`, err.message);
                        });
                    } catch (e) {
                        console.error(`[Discovery] Interface error: ${e.message}`);
                    }
                }
            }
        }
        this._prunePeers();
    }, HEARTBEAT_INTERVAL);
}
```

**ตัวรับข้อความ (บรรทัดที่ 127-159):**

```javascript
_handleMessage(msg, rinfo) {
    try {
        const data = JSON.parse(msg.toString());

        // เพิกเฉยต่อข้อความจากตัวเอง
        if (data.id === this.peerId) return;

        if (data.type === 'HELLO') {
            const peerId = data.id;
            const isNew = !this.peers.has(peerId);
            const remoteAddr = data.remoteAddress || rinfo.address;

            this.peers.set(peerId, {
                info: data,
                remoteAddress: remoteAddr,
                lastSeen: Date.now(),
                isSelf: false
            });

            if (isNew) {
                console.log(`[Discovery] New Peer: ${data.hostname} at ${remoteAddr}`);
                this.emit('peer:discovered', { ...data, remoteAddress: remoteAddr, isSelf: false });
            }
        }
    } catch (e) {
        console.warn('[Discovery] Invalid JSON from', rinfo.address);
    }
}
```

**คำอธิบาย:**

| ฟังก์ชัน | บรรทัด | หน้าที่ |
|----------|--------|---------|
| `_loadIdentity()` | 31 | ตรวจสอบ/สร้าง `.identity.json` สำหรับตัวตนที่คงที่ |
| `generateName()` | 43 | สร้างชื่อสัตว์แบบสุ่ม เช่น "Ambitious Dolphin" |
| `_startHeartbeat()` | 95 | ส่งข้อความ HELLO ผ่าน UDP multicast เป็นระยะ |
| `_handleMessage()` | 127 | รับและประมวลผลข้อความ HELLO จากเพียร์อื่น |

---

### 3. โล่ป้องกัน: `server/security.js` - ชุดเครื่องมือเข้ารหัส

ความปลอดภัยเป็นสิ่งสำคัญยิ่งใน La-Vak และ `security.js` เป็นแกนหลักทางเข้ารหัส

**RSA-4096 Key Generation (บรรทัดที่ 12-53):**

```javascript
class SecurityKernel {
    constructor() {
        this.publicKey = null;
        this.privateKey = null;
        this.keyPairPromise = null;
    }

    async initialize() {
        if (this.keyPairPromise) return this.keyPairPromise;

        console.log('[Security] Generating RSA-4096 Key Pair...');
        this.keyPairPromise = new Promise((resolve, reject) => {
            crypto.generateKeyPair('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: { type: 'spki', format: 'pem' },
                privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
            }, (err, publicKey, privateKey) => {
                if (err) return reject(err);
                this.publicKey = publicKey;
                this.privateKey = privateKey;
                console.log('[Security] Key Pair Generated.');
                resolve({ publicKey, privateKey });
            });
        });
        return this.keyPairPromise;
    }

    encryptAsymmetric(data, recipientPublicKeyPem) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return crypto.publicEncrypt({
            key: recipientPublicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, buffer);
    }

    decryptAsymmetric(encryptedData) {
        if (!this.privateKey) throw new Error('Private key not initialized');
        return crypto.privateDecrypt({
            key: this.privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, encryptedData);
    }
}
```

**AES-256-GCM Encryption (บรรทัดที่ 83-111):**

```javascript
encryptSymmetric(data, key) {
    const iv = crypto.randomBytes(12); // 96-bit IV for GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    let encrypted = cipher.update(data);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        data: encrypted.toString('base64')
    };
}

decryptSymmetric(encryptedPackage, key) {
    const iv = Buffer.from(encryptedPackage.iv, 'base64');
    const authTag = Buffer.from(encryptedPackage.authTag, 'base64');
    const encryptedText = Buffer.from(encryptedPackage.data, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted;
}
```

**คำอธิบาย:**

| ฟังก์ชัน | บรรทัด | วิธีการเข้ารหัส | การใช้งาน |
|----------|--------|----------------|-----------|
| `initialize()` | 19 | RSA-4096 | สร้างคู่คีย์ RSA เมื่อเซิร์ฟเวอร์เริ่มทำงาน |
| `encryptAsymmetric()` | 47 | RSA-OAEP + SHA-256 | เข้ารหัส session key ด้วย RSA |
| `encryptSymmetric()` | 83 | AES-256-GCM | เข้ารหัสไฟล์และ metadata |
| `hashFile()` | 126 | SHA-256 | ตรวจสอบความสมบูรณ์ของไฟล์ |

---

### 4. ช่องทาง: `server/transfer.js` - การถ่ายโอนไฟล์อย่างปลอดภัย

โมดูล `transfer.js` จัดการการส่งและรับไฟล์ระหว่าง La-Vak อินสแตนซ์

**การส่งไฟล์ - `sendFile()` (บรรทัดที่ 196-267):**

```javascript
async sendFile(peerAddress, filePath, originalFilename) {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();
        let sessionKey = null;
        let fileStream = null;
        let buffer = Buffer.alloc(0);

        socket.connect(TRANSFER_PORT, peerAddress, () => {
            console.log(`[Transfer] Connected to ${peerAddress}`);
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
                            sessionKey = security.generateSessionKey();
                            const encryptedSessionKey = security.encryptAsymmetric(sessionKey, msg.key);
                            this._sendFrame(socket, { 
                                type: 'SESSION_KEY', 
                                key: encryptedSessionKey.toString('base64') 
                            });
                            break;
                        case 'READY':
                            console.log('[Transfer] Sending Metadata...');
                            const stats = fs.statSync(filePath);
                            const hash = await security.hashFile(filePath);
                            const metadata = JSON.stringify({
                                filename: originalFilename || path.basename(filePath),
                                size: stats.size,
                                hash: hash
                            });
                            const encryptedMeta = security.encryptSymmetric(Buffer.from(metadata), sessionKey);
                            this._sendFrame(socket, { type: 'METADATA', payload: encryptedMeta });
                            break;
                        case 'ACK':
                            console.log('[Transfer] Sending File...');
                            fileStream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
                            fileStream.on('data', (fileChunk) => {
                                const encryptedChunk = security.encryptSymmetric(fileChunk, sessionKey);
                                this._writeFrameWithBackpressure(socket, { type: 'CHUNK', payload: encryptedChunk });
                            });
                            fileStream.on('end', () => {
                                this._sendFrame(socket, { type: 'EOF' });
                                console.log('[Transfer] Finished.');
                                socket.end();
                                resolve();
                            });
                            break;
                    }
                } catch (err) { reject(err); socket.destroy(); }
            }
        });
        socket.on('error', (err) => { reject(err); });
    });
}
```

**การรับไฟล์ - `_handleConnection()` (บรรทัดที่ 42-119):**

```javascript
async _handleConnection(socket) {
    const remoteAddress = socket.remoteAddress;
    console.log(`[Transfer] Incoming from ${remoteAddress}`);

    let sessionKey = null;
    let fileStream = null;
    let buffer = Buffer.alloc(0);
    let expectedHash = null;
    let receivedFilePath = null;
    let transferCompleted = false;

    socket.on('data', async (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);
        while (buffer.length >= 4 && !transferCompleted) {
            const msgLen = buffer.readUInt32BE(0);
            if (buffer.length < 4 + msgLen) break;
            const msgBuf = buffer.slice(4, 4 + msgLen);
            buffer = buffer.slice(4 + msgLen);
            try {
                const msg = JSON.parse(msgBuf.toString());
                switch (msg.type) {
                    case 'HELLO':
                        const pubKey = security.getPublicKey();
                        this._sendFrame(socket, { type: 'PUBLIC_KEY', key: pubKey });
                        break;
                    case 'SESSION_KEY':
                        const encryptedKey = Buffer.from(msg.key, 'base64');
                        sessionKey = security.decryptAsymmetric(encryptedKey);
                        this._sendFrame(socket, { type: 'READY' });
                        break;
                    case 'METADATA':
                        const decryptedMetaBuf = security.decryptSymmetric(msg.payload, sessionKey);
                        const metadata = JSON.parse(decryptedMetaBuf.toString());
                        this.emit('transfer:start', { filename: metadata.filename, size: metadata.size, remoteAddress });
                        expectedHash = metadata.hash;
                        receivedFilePath = path.join(this.downloadDir, metadata.filename);
                        fileStream = fs.createWriteStream(receivedFilePath);
                        this._sendFrame(socket, { type: 'ACK' });
                        break;
                    case 'CHUNK':
                        const chunkData = security.decryptSymmetric(msg.payload, sessionKey);
                        fileStream.write(chunkData);
                        break;
                    case 'EOF':
                        transferCompleted = true;
                        if (fileStream) {
                            fileStream.end(async () => {
                                const actualHash = await security.hashFile(receivedFilePath);
                                if (actualHash === expectedHash) {
                                    console.log('[Transfer] Integrity Check: PASSED');
                                    this.emit('transfer:complete', { remoteAddress, status: 'success' });
                                } else {
                                    console.error('[Transfer] Integrity Check: FAILED');
                                }
                                socket.end();
                            });
                        }
                        break;
                }
            } catch (err) { console.error(`[Transfer] Error:`, err); socket.destroy(); }
        }
    });
}
```

**Flow การถ่ายโอนไฟล์:**

```
┌─────────────┐                    ┌─────────────┐
│   Sender    │                    │  Receiver   │
└──────┬──────┘                    └──────┬──────┘
       │                                │
       │───── HELLO ────────────────────>│
       │                                │
       │<──── PUBLIC_KEY ───────────────│
       │    (RSA Public Key)            │
       │                                │
       │───── SESSION_KEY ─────────────>│
       │    (AES Key, RSA encrypted)    │
       │                                │
       │<──── READY ────────────────────│
       │                                │
       │───── METADATA ────────────────>│
       │    (filename, size, hash)      │
       │    AES-256-GCM encrypted       │
       │                                │
       │<──── ACK ──────────────────────│
       │                                │
       │───── CHUNK x N ───────────────>│
       │    (64KB chunks)               │
       │    AES-256-GCM encrypted       │
       │                                │
       │───── EOF ──────────────────────>│
       │                                │
       │         [Verify SHA-256]        │
```

**คำอธิบาย:**

| ขั้นตอน | ข้อความ | การเข้ารหัส | บรรทัด (ส่ง) | บรรทัด (รับ) |
|---------|---------|-------------|--------------|--------------|
| 1 | HELLO | ไม่มี | 205 | 65 |
| 2 | PUBLIC_KEY | ไม่มี (RSA สาธารณะ) | - | 66 |
| 3 | SESSION_KEY | RSA-OAEP | 223-226 | 70-71 |
| 4 | METADATA | AES-256-GCM | 238 | 78 |
| 5 | ACK | ไม่มี | - | 85 |
| 6 | CHUNK | AES-256-GCM | 250 | 90 |
| 7 | EOF | ไม่มี | 255 | 93 |

**Framing Protocol:**
- แต่ละข้อความนำหน้าด้วย 4 ไบต์ บอกความยาว (`_sendFrame`, บรรทัด 185-191)
- ช่วยให้แยกวิเคราะห์ JSON และข้อมูลที่เข้ารหัสได้อย่างน่าเชื่อถือผ่าน TCP streams

---

### สรุป

โค้ดฝั่งเซิร์ฟเวอร์ของ La-Vak เป็นระบบที่มีโครงสร้างดี:
- **การค้นหาเพียร์ที่แข็งแกร่ง** ด้วย UDP multicast และระบบชื่อสัตว์
- **การป้องกันทางเข้ารหัสที่แข็งแกร่ง** ใช้ RSA-4096 และ AES-256-GCM
- **โปรโตคอลการถ่ายโอนไฟล์ที่เชื่อถือได้** เข้ารหัสทั้งหมด พร้อมตรวจสอบ SHA-256

โดยมี `start()` ใน `index.js` เป็นผู้ควบคุมหลัก

ขอบคุณครับ 🙏
