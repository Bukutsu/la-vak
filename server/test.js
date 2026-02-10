// =============================================================
// La-Vak — test.js
// Automated smoke tests for all subsystems
// =============================================================
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

const security = require('./security');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        failed++;
    }
}

async function testAsync(name, fn) {
    try {
        await fn();
        console.log(`  ✓ ${name}`);
        passed++;
    } catch (err) {
        console.log(`  ✗ ${name}`);
        console.log(`    Error: ${err.message}`);
        failed++;
    }
}

function assert(condition, message) {
    if (!condition) throw new Error(message || 'Assertion failed');
}

function assertEqual(actual, expected, message) {
    if (actual !== expected) {
        throw new Error(message || `Expected "${expected}" but got "${actual}"`);
    }
}

// =============================================================
// Test Suite
// =============================================================

async function runTests() {
    console.log('');
    console.log('🧪 La-Vak Test Suite');
    console.log('====================');

    // --- 1. Security: RSA Key Pair ---
    console.log('\n📦 Security Module');

    test('RSA-4096 key pair generation', () => {
        const { publicKey, privateKey } = security.getKeyPair();
        assert(publicKey.includes('BEGIN PUBLIC KEY'), 'Public key should be PEM format');
        assert(privateKey.includes('BEGIN PRIVATE KEY'), 'Private key should be PEM format');
    });

    test('RSA key pair is cached (same reference)', () => {
        const kp1 = security.getKeyPair();
        const kp2 = security.getKeyPair();
        assertEqual(kp1.publicKey, kp2.publicKey, 'Public keys should match');
    });

    // --- 2. Security: AES-256-GCM ---
    test('AES-256-GCM encrypt/decrypt round-trip', () => {
        const { key, iv } = security.generateSessionKey();
        const plaintext = Buffer.from('Hello, La-Vak! สวัสดีละแวก 🏘');
        const { ciphertext, authTag } = security.encryptChunk(key, iv, plaintext);

        assert(ciphertext.length > 0, 'Ciphertext should not be empty');
        assert(!ciphertext.equals(plaintext), 'Ciphertext should differ from plaintext');

        const decrypted = security.decryptChunk(key, iv, ciphertext, authTag);
        assertEqual(decrypted.toString(), plaintext.toString(), 'Decrypted should match original');
    });

    test('AES-256-GCM detects tampered ciphertext', () => {
        const { key, iv } = security.generateSessionKey();
        const plaintext = Buffer.from('Sensitive data');
        const { ciphertext, authTag } = security.encryptChunk(key, iv, plaintext);

        // Tamper with ciphertext
        ciphertext[0] ^= 0xff;

        let threw = false;
        try {
            security.decryptChunk(key, iv, ciphertext, authTag);
        } catch {
            threw = true;
        }
        assert(threw, 'Decryption should fail with tampered data');
    });

    test('AES-256-GCM detects tampered auth tag', () => {
        const { key, iv } = security.generateSessionKey();
        const plaintext = Buffer.from('Protected data');
        const { ciphertext, authTag } = security.encryptChunk(key, iv, plaintext);

        // Tamper with auth tag
        authTag[0] ^= 0xff;

        let threw = false;
        try {
            security.decryptChunk(key, iv, ciphertext, authTag);
        } catch {
            threw = true;
        }
        assert(threw, 'Decryption should fail with tampered auth tag');
    });

    // --- 3. Security: RSA Session Key Exchange ---
    test('RSA session key encrypt/decrypt round-trip', () => {
        const { key } = security.generateSessionKey();
        const { publicKey } = security.getKeyPair();

        const encrypted = security.encryptSessionKey(publicKey, key);
        assert(encrypted.length > 0, 'Encrypted key should not be empty');
        assert(!encrypted.equals(key), 'Encrypted key should differ from original');

        const decrypted = security.decryptSessionKey(encrypted);
        assert(decrypted.equals(key), 'Decrypted session key should match original');
    });

    // --- 4. Security: SHA-256 ---
    test('SHA-256 buffer hashing', () => {
        const hash = security.hashBuffer(Buffer.from('test'));
        assertEqual(
            hash,
            '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            'SHA-256 of "test" should match known digest',
        );
    });

    await testAsync('SHA-256 file hashing', async () => {
        const tmpFile = path.join(os.tmpdir(), 'lavak-test-hash.txt');
        fs.writeFileSync(tmpFile, 'test');
        const hash = await security.hashFile(tmpFile);
        assertEqual(
            hash,
            '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
            'File hash should match buffer hash',
        );
        fs.unlinkSync(tmpFile);
    });

    // --- 5. Security: Self-Signed TLS Certificate ---
    test('Self-signed TLS certificate generation', () => {
        const { cert, key } = security.generateSelfSignedCert();
        assert(cert.includes('BEGIN CERTIFICATE'), 'Should produce PEM certificate');
        assert(key.includes('BEGIN PRIVATE KEY'), 'Should produce PEM private key');
    });

    // --- 6. Security: Large data encryption ---
    test('AES-256-GCM with 1MB payload', () => {
        const { key, iv } = security.generateSessionKey();
        const plaintext = crypto.randomBytes(1024 * 1024); // 1 MB
        const { ciphertext, authTag } = security.encryptChunk(key, iv, plaintext);
        const decrypted = security.decryptChunk(key, iv, ciphertext, authTag);
        assert(decrypted.equals(plaintext), 'Large payload should round-trip correctly');
    });

    // --- 7. Discovery Module ---
    console.log('\n📡 Discovery Module');

    await testAsync('Discovery module instantiation and peer tracking', async () => {
        const Discovery = require('./discovery');
        const d = new Discovery({
            deviceName: 'test-node',
            httpPort: 3001,
            transportPort: 9999,
        });

        assert(typeof d.getPeers === 'function', 'Should have getPeers method');
        assert(typeof d.getDeviceId === 'function', 'Should have getDeviceId method');
        assert(Array.isArray(d.getPeers()), 'getPeers should return an array');
        assertEqual(d.getPeers().length, 0, 'Should start with no peers');

        const id = d.getDeviceId();
        assert(id.length > 0, 'Device ID should not be empty');
    });

    // --- 8. Transport Module ---
    console.log('\n🔌 Transport Module');

    await testAsync('Transport TLS server starts on a random port', async () => {
        const Transport = require('./transport');
        const t = new Transport();
        const port = await t.start();
        assert(port > 0, 'Port should be a positive number');
        assert(port < 65536, 'Port should be valid');
        assertEqual(t.getPort(), port, 'getPort() should return the listening port');
        t.stop();
    });

    await testAsync('Transport tracks transfers', async () => {
        const Transport = require('./transport');
        const t = new Transport();
        await t.start();
        const transfers = t.getTransfers();
        assert(Array.isArray(transfers), 'getTransfers should return an array');
        assertEqual(transfers.length, 0, 'Should start with no transfers');
        t.stop();
    });

    // --- 9. End-to-End: Loopback File Transfer ---
    console.log('\n🔄 End-to-End Loopback Transfer');

    await testAsync('Full encrypted file transfer over TLS (loopback)', async () => {
        const Transport = require('./transport');

        // Create receiver
        const receiver = new Transport();
        const port = await receiver.start();

        // Create a test file
        const testContent = 'La-Vak E2E Test 🏘 ' + crypto.randomBytes(256).toString('hex');
        const tmpFile = path.join(os.tmpdir(), 'lavak-e2e-test.txt');
        fs.writeFileSync(tmpFile, testContent);

        // Set up receiver to auto-accept
        receiver.on('incoming-request', (req) => {
            receiver.respondToIncoming(req.transferId, true);
        });

        // Wait for completion
        const result = await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error('Transfer timed out after 15s')), 15000);

            receiver.on('transfer-complete', (t) => {
                clearTimeout(timeout);
                resolve(t);
            });

            receiver.on('transfer-error', (t) => {
                clearTimeout(timeout);
                reject(new Error(`Transfer failed: ${t.error || t.status}`));
            });

            // Create sender and send
            const sender = new Transport();
            sender.start().then(() => {
                sender.sendFile('127.0.0.1', port, tmpFile, 'lavak-e2e-test.txt').catch(reject);
            });
        });

        // Verify
        assertEqual(result.status, 'completed', 'Transfer should complete successfully');
        assertEqual(result.fileName, 'lavak-e2e-test.txt', 'File name should match');

        const downloadsDir = path.join(os.homedir(), 'Downloads', 'la-vak');
        const receivedFile = path.join(downloadsDir, 'lavak-e2e-test.txt');
        assert(fs.existsSync(receivedFile), 'File should exist in ~/Downloads/la-vak/');

        const receivedContent = fs.readFileSync(receivedFile, 'utf8');
        assertEqual(receivedContent, testContent, 'Received file content should match original');

        // Cleanup
        fs.unlinkSync(tmpFile);
        fs.unlinkSync(receivedFile);
        receiver.stop();
    });

    // --- Summary ---
    console.log('\n====================');
    console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
    console.log(failed === 0 ? '✅ All tests passed!' : '❌ Some tests failed.');
    console.log('');

    process.exit(failed > 0 ? 1 : 0);
}

runTests().catch((err) => {
    console.error('Test runner error:', err);
    process.exit(1);
});
