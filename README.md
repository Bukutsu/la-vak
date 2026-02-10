# La-Vak (ละแวก)
### Secure, Zero-Configuration P2P File Synchronization for the Local Neighborhood.

**La-Vak** (Thai: *ละแวก* - /la.wɛ̂ːk/) is a high-performance, decentralized file transfer protocol built for high-trust environments. By eliminating reliance on centralized cloud infrastructure, La-Vak ensures that sensitive data remains within the physical boundaries of your local network (LAN) while providing a modern, reactive user experience.

---

## 📋 Overview

Developed as part of the **Data Encryption** curriculum (Course 02204352), La-Vak implements a hybrid cryptographic architecture to solve the "Local Discovery Problem" without sacrificing data integrity or confidentiality.

### Key Pillars
- **Zero-Config Discovery:** Instant peer identification via UDP Multicast (mDNS-inspired).
- **Privacy-by-Design:** End-to-End Encryption (E2EE) with no external metadata leakage.
- **Cross-Platform Accessibility:** A "Reactive Web" approach that bridges Desktop performance with Mobile browser convenience.

---

## 🏗 System Architecture

The system utilizes a **Hybrid P2P Engine** to bypass browser-based networking limitations:

| Component | Responsibility | Technology Stack |
| :--- | :--- | :--- |
| **Core Engine** | L2/L3 Networking, Cryptography, File I/O | Node.js (CommonJS) |
| **Dashboard** | Reactive UI/UX, State Management | React, TypeScript, Vite |
| **Protocol** | Peer Discovery & Health Checks | UDP Multicast (Port 41234) |
| **Transport** | High-speed Binary Data Streaming | TCP Sockets / TLS |

---

## 🔒 Security Specifications

La-Vak adheres to the strictly defined security requirements of the **02204352 Data Encryption** project:

### 1. Cryptographic Suite
- **Symmetric Encryption:** AES-256 in **GCM (Galois/Counter Mode)** for authenticated encryption, providing both confidentiality and built-in integrity verification.
- **Asymmetric Handshake:** **RSA-4096** for secure session key exchange between untrusted peers.
- **Hashing:** **SHA-256** for pre-transfer and post-transfer bit-level verification.

### 2. Threat Mitigation
- **MITM Protection:** Hybrid encryption ensures that passive listeners on the Wi-Fi cannot decrypt traffic.
- **Tamper Detection:** The GCM Auth Tag prevents unauthorized modification of data during transit.
- **Isolation:** Operates strictly on the Local Subnet; no WAN/Internet exit points.

---

## 📂 Project Structure

```text
la-vak/
├── client/           # Frontend Dashboard (React + TS)
├── server/           # Backend Engine (Discovery & Crypto Logic)
│   ├── discovery.js  # [P1] Peer Discovery Protocol
│   ├── security.js   # [P3] Cryptographic Implementations
│   └── index.js      # [P4] Orchestration & API Layer
└── doc/              # Academic Requirements & System Diagrams
```

---

## 🚀 Deployment

### Prerequisites
- Node.js Runtime (v20+)
- Active LAN connection (Wi-Fi or Ethernet)

### 1. Initialize Backend
```bash
cd server
npm install
node index.js
```

Expected output:
```
[Security] ✓ Key pair ready
[Transport] ✓ TLS server on port XXXXX
[Discovery] Listening on 239.255.42.99:41234

╔══════════════════════════════════════════╗
║          🏘  La-Vak (ละแวก)               ║
║   Secure P2P File Sync for the LAN       ║
╠══════════════════════════════════════════╣
║  HTTP API:   http://localhost:3001       ║
║  Transport:  TLS on port XXXXX           ║
║  Discovery:  UDP 239.255.42.99:41234      ║
╚══════════════════════════════════════════╝
```

### 2. Initialize Frontend
```bash
cd client
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

---

## 📖 Usage Guide

### Server-Side (Backend Engine)

The backend engine handles all low-level networking, security, and file streaming. It exposes a REST API + WebSocket interface for the frontend.

#### REST API Endpoints

| Method | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/device` | Get current device info | — |
| `GET` | `/api/peers` | List all discovered LAN peers | — |
| `GET` | `/api/transfers` | List all active/completed transfers | — |
| `POST` | `/api/send` | Send a file to a peer | `multipart/form-data`: `file`, `peerIp`, `peerPort` |
| `POST` | `/api/respond` | Accept/Reject an incoming transfer | `JSON`: `{ transferId, accepted }` |

#### WebSocket Events (pushed to connected clients)

| Event | Payload | When |
| :--- | :--- | :--- |
| `peers-updated` | `Peer[]` | A peer joins or leaves the LAN |
| `incoming-request` | `{ transferId, fileName, fileSize, peerIp }` | Another peer wants to send you a file |
| `transfer-progress` | `Transfer` | Bytes transferred updated |
| `transfer-complete` | `Transfer` | File fully received & verified |
| `transfer-error` | `Transfer` | Transfer failed or rejected |

#### Key Server Modules

| Module | File | Responsibility |
| :--- | :--- | :--- |
| **Security** | `server/security.js` | RSA-4096 key pairs, AES-256-GCM encrypt/decrypt, SHA-256 hashing, self-signed TLS certificates |
| **Discovery** | `server/discovery.js` | UDP Multicast peer discovery (`LAVAK_HELLO` on `239.255.42.99:41234`) |
| **Transport** | `server/transport.js` | TLS-wrapped TCP file streaming with length-prefixed wire protocol |
| **Orchestration** | `server/index.js` | Express API, WebSocket bridge, module coordination |

### Client-Side (React Dashboard)

The React dashboard communicates with the **local** backend engine via REST + WebSocket. No direct network access is needed from the browser.

#### Dashboard Sections

1. **Header** — Shows connection status (green = engine connected) and device info (hostname, local IP).
2. **Neighborhood** — Displays all discovered peers on the LAN as clickable cards. Shows a scanning animation when no peers are found.
3. **Send File** — Drag-and-drop zone (or click to browse). Select a peer from the Neighborhood, choose a file, and click **Send**.
4. **Transfers** — Live list of all active and completed transfers with progress bars, status labels, and SHA-256 verification results.
5. **Incoming Modal** — A popup appears when another peer wants to send you a file. Shows file name, size, and sender IP with **Accept** / **Reject** buttons.

#### How to Send a File

1. Start both the **server** and **client** on two machines connected to the same LAN.
2. Wait for the other machine to appear in the **Neighborhood** panel.
3. Click the peer card to select it (highlighted with purple border).
4. Drag a file onto the **drop zone** or click to browse.
5. Click the **Send** button.
6. On the receiving machine, an **Incoming File** modal will appear — click **Accept**.
7. The file is encrypted with AES-256-GCM, streamed over TLS, and saved to `~/Downloads/la-vak/`.
8. SHA-256 hash is verified automatically after transfer completes.

#### Mobile Access

Connect your phone's browser to `http://<laptop-ip>:5173` while on the same Wi-Fi. The dashboard is fully responsive.

---

## 🧪 Testing & Verification

### Quick Smoke Test

Run the automated test script to verify all subsystems:

```bash
cd server
node test.js
```

### Manual Test Cases

#### Test 1: Server Startup
```bash
cd server && node index.js
```
**Expected:** Console shows RSA key generation, TLS server port, UDP discovery binding, Express API listening on port 3001. No errors.

#### Test 2: Client Startup & WebSocket Connection
```bash
cd client && npm run dev
```
Open `http://localhost:5173`.
**Expected:** Dashboard loads with "Engine Connected" badge (green dot). Browser console shows `[WS] Connected to La-Vak engine`.

#### Test 3: API Health Check
With the server running:
```bash
curl http://localhost:3001/api/device
```
**Expected:** JSON response with `id`, `deviceName`, `platform`, `httpPort`, `transportPort`, `ip`.

```bash
curl http://localhost:3001/api/peers
```
**Expected:** JSON array (empty `[]` if alone on the network, populated if other La-Vak instances are running).

#### Test 4: Peer Discovery (2 Machines)
Start `node index.js` on two machines connected to the same LAN.
**Expected:** Within 3 seconds, each machine logs `[Discovery] + Peer joined: <hostname>`. The dashboard shows the other machine in the Neighborhood panel.

#### Test 5: File Transfer (2 Machines)
1. On Machine A's dashboard, select Machine B from the Neighborhood.
2. Drop a file and click Send.
3. On Machine B, accept the incoming file.
4. **Expected:**
   - Transfer progress bars appear on both dashboards.
   - Console shows `[Transport] ✓ File verified: <filename>`.
   - File appears in `~/Downloads/la-vak/` on Machine B.
   - SHA-256 hash matches (integrity verified).

#### Test 6: Loopback Transfer (Single Machine)
Use `curl` to simulate a self-send:
```bash
curl -X POST http://localhost:3001/api/send \
  -F "file=@/path/to/testfile.txt" \
  -F "peerIp=127.0.0.1" \
  -F "peerPort=<TRANSPORT_PORT>"
```
Replace `<TRANSPORT_PORT>` with the TLS port shown in the server startup log.
Then accept via:
```bash
curl -X POST http://localhost:3001/api/respond \
  -H "Content-Type: application/json" \
  -d '{"transferId":"<ID_FROM_INCOMING>","accepted":true}'
```
**Expected:** File is encrypted, transferred over TLS to self, decrypted, and saved to `~/Downloads/la-vak/`.

#### Test 7: Reject Incoming Transfer
Same as Test 6, but respond with `"accepted": false`.
**Expected:** Transfer status becomes `rejected`, no file is saved.

#### Test 8: Tamper Detection
Modify the transport to corrupt a byte mid-transfer.
**Expected:** AES-256-GCM decryption fails with "Unsupported state or unable to authenticate data" error, and the transfer status becomes `error`.
