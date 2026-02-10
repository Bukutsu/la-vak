const PeerDiscovery = require('./discovery');

console.log('--- La-Vak Peer Discovery Verifier ---');
console.log('Press Ctrl+C to exit.\n');

const discovery = new PeerDiscovery();

discovery.on('peer:discovered', (peer) => {
    console.log(`[+] Discovered Peer: ${peer.hostname} (${peer.remoteAddress}) [ID: ${peer.id}]`);
});

discovery.on('peer:left', (peer) => {
    console.log(`[-] Peer Left: ${peer.id}`);
});

discovery.start();
