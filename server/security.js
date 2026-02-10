const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SecurityKernel {
    constructor() {
        this.publicKey = null;
        this.privateKey = null;
        this.keyPairPromise = null;
    }

    /**
     * Generates RSA-4096 key pair asynchronously.
     * Call this on server startup.
     */
    async initialize() {
        if (this.keyPairPromise) return this.keyPairPromise;

        console.log('[Security] Generating RSA-4096 Key Pair (this may take a moment)...');
        this.keyPairPromise = new Promise((resolve, reject) => {
            crypto.generateKeyPair('rsa', {
                modulusLength: 4096,
                publicKeyEncoding: {
                    type: 'spki',
                    format: 'pem'
                },
                privateKeyEncoding: {
                    type: 'pkcs8',
                    format: 'pem'
                }
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

    getPublicKey() {
        return this.publicKey;
    }

    /**
     * Encrypts a small payload (metadata/keys) using the recipient's Public Key.
     * Uses RSA-OAEP with SHA-256.
     */
    encryptAsymmetric(data, recipientPublicKeyPem) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        return crypto.publicEncrypt({
            key: recipientPublicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, buffer);
    }

    /**
     * Decrypts a small payload using our Private Key.
     */
    decryptAsymmetric(encryptedData) {
        if (!this.privateKey) throw new Error('Private key not initialized');
        return crypto.privateDecrypt({
            key: this.privateKey,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        }, encryptedData);
    }

    /**
     * Generates a random 32-byte session key for AES-256.
     */
    generateSessionKey() {
        return crypto.randomBytes(32);
    }

    /**
     * Encrypts data using AES-256-GCM.
     * Returns { iv, authTag, encryptedData }
     */
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

    /**
     * Decrypts data using AES-256-GCM.
     */
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

    /**
     * Computes SHA-256 hash of a file stream or buffer.
     */
    async hashData(data) {
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Computes SHA-256 hash of a file at a given path using streams.
     */
    async hashFile(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(filePath);
            stream.on('data', (data) => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', (err) => reject(err));
        });
    }
}

module.exports = new SecurityKernel();
