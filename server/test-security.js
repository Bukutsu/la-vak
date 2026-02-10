const security = require('./security');
const assert = require('assert');

async function runTests() {
    console.log('--- Testing Security Kernel ---');

    // 1. Key Generation
    console.log('1. Generating Keys...');
    const start = Date.now();
    await security.initialize();
    console.log(`   Keys generated in ${(Date.now() - start) / 1000}s`);

    const pubKey = security.getPublicKey();
    assert(pubKey.includes('BEGIN PUBLIC KEY'), 'Public Key format invalid');
    console.log('   [PASS] Key Generation');

    // 2. Asymmetric Encryption (RSA)
    console.log('2. Asymmetric Encryption (RSA-OAEP)...');
    const secretMessage = 'Hello La-Vak Secret Handshake';
    const encryptedSecret = security.encryptAsymmetric(secretMessage, pubKey);
    const decryptedSecret = security.decryptAsymmetric(encryptedSecret);
    assert.strictEqual(decryptedSecret.toString(), secretMessage);
    console.log('   [PASS] RSA Encrypt/Decrypt');

    // 3. Symmetric Encryption (AES-GCM)
    console.log('3. Symmetric Encryption (AES-256-GCM)...');
    const sessionKey = security.generateSessionKey();
    const fileData = Buffer.from('Huge file content simulation needed here but text works too.');

    const encryptedPacket = security.encryptSymmetric(fileData, sessionKey);
    assert(encryptedPacket.iv, 'Missing IV');
    assert(encryptedPacket.authTag, 'Missing AuthTag');

    const decryptedData = security.decryptSymmetric(encryptedPacket, sessionKey);
    assert.strictEqual(decryptedData.toString(), fileData.toString());
    console.log('   [PASS] AES Encrypt/Decrypt');

    // 4. Hashing
    console.log('4. SHA-256 Hashing...');
    const hash = await security.hashData('test');
    assert.strictEqual(hash, '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    console.log('   [PASS] SHA-256 Hash');

    console.log('\nAll Security Tests Passed!');
}

runTests().catch(err => {
    console.error('Test Failed:', err);
    process.exit(1);
});
