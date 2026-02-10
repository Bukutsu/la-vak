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

## 📖 Step-by-Step Usage Guide

### Step 1: Start the Backend Engine

Open a **terminal** on the machine you want to use for file sharing.

```bash
cd server
npm install      # only needed the first time
node index.js
```

You should see this output confirming everything is running:

```
[Security] ✓ Key pair ready
[Transport] ✓ TLS server on port 59532
[Discovery] Listening on 239.255.42.99:41234

╔══════════════════════════════════════════╗
║          🏘  La-Vak (ละแวก)               ║
║   Secure P2P File Sync for the LAN       ║
╠══════════════════════════════════════════╣
║  HTTP API:   http://localhost:3001       ║
║  Transport:  TLS on port 59532           ║
║  Discovery:  UDP 239.255.42.99:41234      ║
║  Device:     your-hostname               ║
║  Local IP:   192.168.x.x                ║
╚══════════════════════════════════════════╝
```

> **Note:** The TLS port number is random each time. The Discovery and HTTP ports are fixed.

**Keep this terminal open.** The engine must keep running while you use the app.

---

### Step 2: Start the Web Dashboard

Open a **second terminal** on the same machine:

```bash
cd client
npm install      # only needed the first time
npm run dev
```

You should see:

```
VITE ready in XXX ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

### Step 3: Open the Dashboard in Your Browser

Open your web browser and go to:

```
http://localhost:5173
```

You will see the La-Vak dashboard with these sections:

| Section | What You'll See |
| :--- | :--- |
| **Header (top bar)** | "🏘 La-Vak ละแวก" on the left. On the right, a green "● Engine Connected" badge and your device name + IP address. |
| **Neighborhood (left panel)** | A "📡 Scanning neighborhood..." animation with 3 bouncing dots. This means the engine is actively looking for other devices on your LAN. |
| **Send File (left panel, below)** | A dashed box saying "Drop a file here or click to browse" and a grayed-out button saying "Select a peer first". |
| **Transfers (right panel)** | "No transfers yet" — this is where file transfer progress will appear later. |

> **If "Engine Connected" shows as red "Disconnected":** Make sure the backend engine (Step 1) is still running in the other terminal.

---

### Step 4: Set Up a Second Device

To transfer files, you need **another device on the same Wi-Fi / LAN** also running La-Vak.

On the **second machine**, repeat Steps 1 and 2:

```bash
# Terminal 1 on Machine B
cd server
npm install
node index.js

# Terminal 2 on Machine B
cd client
npm install
npm run dev
```

Open `http://localhost:5173` on Machine B's browser.

**Within ~3 seconds**, both dashboards will automatically discover each other:
- Machine A's **Neighborhood** panel will show Machine B as a card (with its hostname, IP, and a platform icon like 🍎 for macOS).
- Machine B's **Neighborhood** panel will show Machine A.
- The server terminals will log: `[Discovery] + Peer joined: <hostname>`

> **No manual configuration needed!** La-Vak uses UDP Multicast to find peers automatically.

---

### Step 5: Sending a File (From Machine A → Machine B)

On **Machine A's dashboard**:

1. **Select the target peer** — Click on Machine B's card in the **Neighborhood** panel. It will highlight with a purple border glow.

2. **Choose a file** — Either:
   - **Drag and drop** a file from your Finder/Explorer onto the dashed drop zone, OR
   - **Click** the drop zone to open a file picker and select a file.

   After selecting, you'll see a preview showing the file name and size (e.g., "📄 report.pdf — 2.1 MB").

3. **Click "Send to \<Device Name\>"** — The purple button at the bottom will show the target device name. Click it.

4. **Wait for acceptance** — The file is now waiting for Machine B to accept.

---

### Step 6: Receiving a File (On Machine B)

On **Machine B's dashboard**:

1. **An "Incoming File" popup appears** showing:
   - File name
   - File size
   - Sender's IP address

2. **Click "Accept"** to receive the file, or **"Reject"** to decline.

3. **Watch the progress** — Both dashboards show a live progress bar in the **Transfers** panel:
   - Status goes through: `Connecting…` → `Key exchange…` → `Transferring…` → `Verifying SHA-256…` → `Completed ✓`
   - A percentage counter (e.g., `47%`) updates in real time.

4. **File is saved** — The decrypted file appears in:
   ```
   ~/Downloads/la-vak/<filename>
   ```

5. **Integrity verified** — The server terminal shows:
   ```
   [Transport] ✓ File verified: report.pdf
   ```
   This means the SHA-256 hash of the received file matches the original — no corruption occurred.

---

### Step 7: Verify the Transfer Worked

Check these indicators to confirm a successful transfer:

| Indicator | Where | What to Look For |
| :--- | :--- | :--- |
| **Dashboard status** | Transfers panel (both machines) | Status shows "Completed ✓" with 100% |
| **Server log** | Terminal running `node index.js` | `[Transport] ✓ File verified: <filename>` |
| **Downloaded file** | `~/Downloads/la-vak/` on Machine B | File exists with correct size and content |
| **SHA-256 hash** | Automatic | Hash verified by the engine (no manual action needed) |

---

### 📱 Using La-Vak from a Mobile Phone

You don't need to install anything on your phone. Just use the browser:

1. Make sure your **laptop** is running both the server and client (Steps 1-2).
2. Find your laptop's IP address (shown in the server startup banner, e.g., `192.168.100.92`).
3. On your phone (connected to the **same Wi-Fi**), open the browser and go to:
   ```
   http://192.168.100.92:5173
   ```
4. The La-Vak dashboard loads on your phone. You can send and receive files just like on a desktop.

> **Note:** For mobile access, start the client with `npm run dev -- --host` to expose Vite to the network.

---

### 🔧 Troubleshooting

| Problem | Solution |
| :--- | :--- |
| Dashboard shows **"Disconnected"** (red) | Make sure the server (`node index.js`) is running in another terminal. Check it's on port 3001. |
| **No peers appear** in Neighborhood | Both devices must be on the same Wi-Fi/LAN. Some networks (e.g., university, corporate) block UDP multicast. Try a personal hotspot. |
| **Send button is grayed out** | You need to both select a peer (click a card) AND choose a file first. |
| **Transfer stuck at "Waiting for approval"** | The receiver needs to click **Accept** on the incoming file popup on their dashboard. |
| **File not in Downloads** | Check `~/Downloads/la-vak/` (a subfolder is created automatically). |
| **"Connection refused" on mobile** | Run the client with `npm run dev -- --host` and use the laptop's LAN IP, not `localhost`. |

---

## 🔌 API Reference (For Developers)

### REST API Endpoints

| Method | Endpoint | Description | Body / Params |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/device` | Get current device info | — |
| `GET` | `/api/peers` | List all discovered LAN peers | — |
| `GET` | `/api/transfers` | List all active/completed transfers | — |
| `POST` | `/api/send` | Send a file to a peer | `multipart/form-data`: `file`, `peerIp`, `peerPort` |
| `POST` | `/api/respond` | Accept/Reject an incoming transfer | `JSON`: `{ transferId, accepted }` |

### WebSocket Events (pushed to connected clients)

| Event | Payload | When |
| :--- | :--- | :--- |
| `peers-updated` | `Peer[]` | A peer joins or leaves the LAN |
| `incoming-request` | `{ transferId, fileName, fileSize, peerIp }` | Another peer wants to send you a file |
| `transfer-progress` | `Transfer` | Bytes transferred updated |
| `transfer-complete` | `Transfer` | File fully received & verified |
| `transfer-error` | `Transfer` | Transfer failed or rejected |

### Key Server Modules

| Module | File | Responsibility |
| :--- | :--- | :--- |
| **Security** | `server/security.js` | RSA-4096 key pairs, AES-256-GCM encrypt/decrypt, SHA-256 hashing, self-signed TLS certificates |
| **Discovery** | `server/discovery.js` | UDP Multicast peer discovery (`LAVAK_HELLO` on `239.255.42.99:41234`) |
| **Transport** | `server/transport.js` | TLS-wrapped TCP file streaming with length-prefixed wire protocol |
| **Orchestration** | `server/index.js` | Express API, WebSocket bridge, module coordination |


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
