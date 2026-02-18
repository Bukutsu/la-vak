export interface Peer {
    id: string;
    hostname: string;
    remoteAddress: string;
    lastSeen?: number;
    isSelf?: boolean;
}

export interface ServerStatus {
    status: string;
    publicKey: string;
    serverIp?: string;
}
