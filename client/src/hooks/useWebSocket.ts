import { useState, useEffect, useRef, useCallback } from 'react';

export interface Peer {
    id: string;
    deviceName: string;
    ip: string;
    httpPort: number;
    transportPort: number;
    platform: string;
}

export interface Transfer {
    id: string;
    direction: 'send' | 'receive';
    fileName: string;
    fileSize: number;
    bytesTransferred: number;
    status: 'connecting' | 'handshake' | 'transferring' | 'verifying' | 'completed' | 'error' | 'rejected' | 'pending';
    peerIp?: string;
    error?: string;
    startTime: number;
}

export interface IncomingRequest {
    transferId: string;
    fileName: string;
    fileSize: number;
    peerIp: string;
}

export interface DeviceInfo {
    id: string;
    deviceName: string;
    platform: string;
    httpPort: number;
    transportPort: number;
    ip: string;
}

interface WSMessage {
    event: string;
    data: unknown;
}

const WS_URL = `ws://${window.location.hostname}:3001`;
const RECONNECT_DELAY = 2000;

export function useWebSocket() {
    const [peers, setPeers] = useState<Peer[]>([]);
    const [transfers, setTransfers] = useState<Transfer[]>([]);
    const [incoming, setIncoming] = useState<IncomingRequest | null>(null);
    const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
    const [connected, setConnected] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            console.log('[WS] Connected to La-Vak engine');
        };

        ws.onmessage = (e) => {
            try {
                const msg: WSMessage = JSON.parse(e.data);

                switch (msg.event) {
                    case 'peers-updated':
                        setPeers(msg.data as Peer[]);
                        break;
                    case 'transfers-updated':
                        setTransfers(msg.data as Transfer[]);
                        break;
                    case 'transfer-progress':
                        setTransfers((prev) => {
                            const t = msg.data as Transfer;
                            const idx = prev.findIndex((x) => x.id === t.id);
                            if (idx >= 0) {
                                const next = [...prev];
                                next[idx] = t;
                                return next;
                            }
                            return [...prev, t];
                        });
                        break;
                    case 'transfer-complete':
                    case 'transfer-error':
                        setTransfers((prev) => {
                            const t = msg.data as Transfer;
                            const idx = prev.findIndex((x) => x.id === t.id);
                            if (idx >= 0) {
                                const next = [...prev];
                                next[idx] = t;
                                return next;
                            }
                            return [...prev, t];
                        });
                        break;
                    case 'incoming-request':
                        setIncoming(msg.data as IncomingRequest);
                        break;
                    case 'device-info':
                        setDeviceInfo(msg.data as DeviceInfo);
                        break;
                }
            } catch {
                // ignore malformed
            }
        };

        ws.onclose = () => {
            setConnected(false);
            wsRef.current = null;
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY);
        };

        ws.onerror = () => {
            ws.close();
        };
    }, []);

    useEffect(() => {
        connect();
        return () => {
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, [connect]);

    const dismissIncoming = useCallback(() => setIncoming(null), []);

    return {
        peers,
        transfers,
        incoming,
        dismissIncoming,
        deviceInfo,
        connected,
    };
}
