export interface Peer {
    id: string;
    hostname: string;
    remoteAddress: string;
    lastSeen: number;
}

export interface ServerStatus {
    status: string;
    publicKey: string;
}
