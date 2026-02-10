# LLM Context: La-Vak (ละแวก)

## 📌 Project Overview
- **Name:** La-Vak (ละแวก - Thai for "Neighborhood")
- **Purpose:** Secure P2P file sharing for a "Data Encryption" university course.
- **Goal:** Clone LocalSend functionality using a Web-first (Reactive) approach.
- **Constraints:** Must use UDP/mDNS for discovery, AES-256-GCM for encryption, and RSA for key exchange.

## 🛠 Tech Stack
- **Backend (Engine):** Node.js (CommonJS).
- **Frontend (Dashboard):** React + TypeScript (Vite) + Tailwind CSS.
- **Networking:** `dgram` (UDP) for discovery, `net` (TCP) for file streaming.
- **Security:** Node.js `crypto` (Built-in).

## 🏗 Architecture (P2P Hybrid)
- **Node.js Engine:** Runs on the machine. Handles the "raw" network (UDP/mDNS) and Encryption.
- **React UI:** Communicates with the local Engine via REST/WebSockets.
- **Mobile Support:** Mobile browsers connect to the Laptop's Engine IP to participate in the "Neighborhood."

## 📂 Key Files & State
- `server/discovery.js`: Implements P1 (Discovery). Uses UDP Multicast on port `41234`.
- `server/index.js`: (Pending) Main entry point, coordinates API and Networking.
- `client/`: (Pending) React UI implementation.
- `doc/`: Contains original university PDF requirements.

## 🔒 Security Protocol (PDF Reference)
1. **Discovery:** UDP Broadcast `LAVAK_HELLO`.
2. **Handshake:** RSA Key Exchange (Asymmetric).
3. **Encryption:** AES-256-GCM (Symmetric) for file data.
4. **Integrity:** SHA-256 hashing.

## 🤖 Instructions for LLMs
- **Maintain CommonJS** in the `server/` directory.
- **Use TypeScript** in the `client/` directory.
- **Strict Adherence:** Follow the Data Flow diagram on Page 11 of `doc/*.pdf`.
- **Naming:** Keep Thai context ("La-Vak") in the UI/Logs.
- **P2P Focus:** Ensure no external cloud services are introduced. All logic must be Local-Only.
