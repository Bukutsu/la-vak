// =============================================================
// La-Vak — security.js
// Cryptographic utilities (RSA-4096, AES-256-GCM, SHA-256)
// =============================================================
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');

// --- RSA-4096 Key Pair (cached per process) ---

let _keyPair = null;

/**
 * Generate (or return cached) RSA-4096 key pair in PEM format.
 * @returns {{ publicKey: string, privateKey: string }}
 */
function getKeyPair() {
  if (_keyPair) return _keyPair;

  _keyPair = crypto.generateKeyPairSync('rsa', {
    modulusLength: 4096,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return _keyPair;
}

// --- RSA Session-Key Exchange ---

/**
 * Encrypt a session key with the peer's RSA public key (RSA-OAEP + SHA-256).
 * @param {string} publicKeyPem - Peer's public key in PEM.
 * @param {Buffer} sessionKey   - 32-byte AES key.
 * @returns {Buffer} Encrypted session key.
 */
function encryptSessionKey(publicKeyPem, sessionKey) {
  return crypto.publicEncrypt(
    {
      key: publicKeyPem,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    sessionKey,
  );
}

/**
 * Decrypt a session key with our RSA private key.
 * @param {Buffer} encryptedKey
 * @returns {Buffer} 32-byte AES key.
 */
function decryptSessionKey(encryptedKey) {
  const { privateKey } = getKeyPair();
  return crypto.privateDecrypt(
    {
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    encryptedKey,
  );
}

// --- AES-256-GCM ---

/**
 * Generate a random AES-256 session key + IV.
 * @returns {{ key: Buffer, iv: Buffer }}
 */
function generateSessionKey() {
  return {
    key: crypto.randomBytes(32), // 256 bits
    iv: crypto.randomBytes(12),  // 96 bits for GCM
  };
}

/**
 * Encrypt a buffer with AES-256-GCM.
 * @param {Buffer} key        - 32-byte key
 * @param {Buffer} iv         - 12-byte IV/nonce
 * @param {Buffer} plaintext
 * @returns {{ ciphertext: Buffer, authTag: Buffer }}
 */
function encryptChunk(key, iv, plaintext) {
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes
  return { ciphertext, authTag };
}

/**
 * Decrypt a buffer with AES-256-GCM.
 * @param {Buffer} key
 * @param {Buffer} iv
 * @param {Buffer} ciphertext
 * @param {Buffer} authTag
 * @returns {Buffer} plaintext
 */
function decryptChunk(key, iv, ciphertext, authTag) {
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

// --- SHA-256 File Hashing ---

/**
 * Compute SHA-256 hash of a file (streaming).
 * @param {string} filePath
 * @returns {Promise<string>} hex digest
 */
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

/**
 * Compute SHA-256 hash of a buffer.
 * @param {Buffer} data
 * @returns {string} hex digest
 */
function hashBuffer(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// --- Self-Signed TLS Certificate ---

/**
 * Generate an ephemeral self-signed certificate for TLS transport.
 * Uses the machine's hostname as CN.
 * @returns {{ cert: string, key: string }}
 */
function generateSelfSignedCert() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Use Node.js built-in X509Certificate (Node 15+) isn't enough to CREATE certs.
  // For purely built-in approach, we create a minimal self-signed cert via
  // the crypto module's sign capability with a DER structure.
  // However, for simplicity and reliability we'll store generated keys and use
  // tls.createSecureContext with raw keys + a placeholder approach.

  // Simpler approach: generate cert with crypto.X509Certificate is read-only.
  // We'll use a programmatic ASN.1 self-signed cert generator.
  const cert = createSelfSignedCert(privateKey, publicKey);

  return { cert, key: privateKey };
}

/**
 * Minimal self-signed X.509 certificate generator using pure Node.js crypto.
 * Creates a v1 certificate valid for 24 hours.
 */
function createSelfSignedCert(privateKeyPem, publicKeyPem) {
  // For a production app you'd use a library like selfsigned or forge.
  // Here we build a minimal DER-encoded X.509 v1 cert by hand.

  const hostname = os.hostname() || 'lavak-node';

  // Parse the public key to get SubjectPublicKeyInfo DER
  const pubKeyDer = pemToDer(publicKeyPem, 'PUBLIC KEY');

  // Build TBSCertificate
  const serialNumber = crypto.randomBytes(8);
  const now = new Date();
  const notAfter = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const tbsCert = buildTBSCertificate({
    serialNumber,
    issuerCN: hostname,
    subjectCN: hostname,
    notBefore: now,
    notAfter,
    publicKeyInfoDer: pubKeyDer,
  });

  // Sign TBSCertificate with SHA-256 + RSA
  const signer = crypto.createSign('SHA256');
  signer.update(tbsCert);
  const signature = signer.sign(privateKeyPem);

  // Build full Certificate
  const cert = buildCertificate(tbsCert, signature);

  return derToPem(cert, 'CERTIFICATE');
}

// --- ASN.1 DER helpers ---

function pemToDer(pem, label) {
  const b64 = pem
    .replace(`-----BEGIN ${label}-----`, '')
    .replace(`-----END ${label}-----`, '')
    .replace(/\s/g, '');
  return Buffer.from(b64, 'base64');
}

function derToPem(der, label) {
  const b64 = der.toString('base64');
  const lines = b64.match(/.{1,64}/g) || [];
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`;
}

function asn1Length(length) {
  if (length < 0x80) return Buffer.from([length]);
  if (length < 0x100) return Buffer.from([0x81, length]);
  return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
}

function asn1Sequence(contents) {
  const body = Buffer.concat(contents);
  return Buffer.concat([Buffer.from([0x30]), asn1Length(body.length), body]);
}

function asn1Set(contents) {
  const body = Buffer.concat(contents);
  return Buffer.concat([Buffer.from([0x31]), asn1Length(body.length), body]);
}

function asn1Integer(value) {
  let buf;
  if (Buffer.isBuffer(value)) {
    buf = value[0] & 0x80 ? Buffer.concat([Buffer.from([0x00]), value]) : value;
  } else {
    buf = Buffer.from([value]);
  }
  return Buffer.concat([Buffer.from([0x02]), asn1Length(buf.length), buf]);
}

function asn1BitString(data) {
  const body = Buffer.concat([Buffer.from([0x00]), data]); // 0 unused bits
  return Buffer.concat([Buffer.from([0x06 + 0x03 - 0x06]), asn1Length(body.length), body]);
  // 0x03 is BitString tag
}

function asn1BitStringRaw(data) {
  const body = Buffer.concat([Buffer.from([0x00]), data]);
  return Buffer.concat([Buffer.from([0x03]), asn1Length(body.length), body]);
}

function asn1OID(oidBytes) {
  return Buffer.concat([Buffer.from([0x06]), asn1Length(oidBytes.length), oidBytes]);
}

function asn1UTF8String(str) {
  const buf = Buffer.from(str, 'utf8');
  return Buffer.concat([Buffer.from([0x0c]), asn1Length(buf.length), buf]);
}

function asn1UTCTime(date) {
  const s =
    String(date.getUTCFullYear()).slice(-2) +
    String(date.getUTCMonth() + 1).padStart(2, '0') +
    String(date.getUTCDate()).padStart(2, '0') +
    String(date.getUTCHours()).padStart(2, '0') +
    String(date.getUTCMinutes()).padStart(2, '0') +
    String(date.getUTCSeconds()).padStart(2, '0') +
    'Z';
  const buf = Buffer.from(s, 'ascii');
  return Buffer.concat([Buffer.from([0x17]), asn1Length(buf.length), buf]);
}

// OID for sha256WithRSAEncryption: 1.2.840.113549.1.1.11
const OID_SHA256_RSA = Buffer.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]);
// OID for commonName: 2.5.4.3
const OID_CN = Buffer.from([0x55, 0x04, 0x03]);

function buildName(cn) {
  const atv = asn1Sequence([asn1OID(OID_CN), asn1UTF8String(cn)]);
  const rdn = asn1Set([atv]);
  return asn1Sequence([rdn]);
}

function buildAlgorithmIdentifier() {
  return asn1Sequence([asn1OID(OID_SHA256_RSA), Buffer.from([0x05, 0x00])]); // NULL params
}

function buildValidity(notBefore, notAfter) {
  return asn1Sequence([asn1UTCTime(notBefore), asn1UTCTime(notAfter)]);
}

function buildTBSCertificate({ serialNumber, issuerCN, subjectCN, notBefore, notAfter, publicKeyInfoDer }) {
  return asn1Sequence([
    asn1Integer(serialNumber),
    buildAlgorithmIdentifier(),
    buildName(issuerCN),
    buildValidity(notBefore, notAfter),
    buildName(subjectCN),
    publicKeyInfoDer, // SubjectPublicKeyInfo is already a SEQUENCE
  ]);
}

function buildCertificate(tbsCertDer, signatureDer) {
  return asn1Sequence([
    tbsCertDer,
    buildAlgorithmIdentifier(),
    asn1BitStringRaw(signatureDer),
  ]);
}

// --- Exports ---

module.exports = {
  getKeyPair,
  encryptSessionKey,
  decryptSessionKey,
  generateSessionKey,
  encryptChunk,
  decryptChunk,
  hashFile,
  hashBuffer,
  generateSelfSignedCert,
};
