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

### 2. Initialize Frontend
```bash
cd client
npm install
npm run dev
```
