import type { Peer } from '../hooks/useWebSocket';

interface PeerListProps {
    peers: Peer[];
    selectedPeer: Peer | null;
    onSelect: (peer: Peer) => void;
}

const platformIcons: Record<string, string> = {
    darwin: '🍎',
    win32: '🪟',
    linux: '🐧',
    android: '🤖',
    default: '💻',
};

function getPlatformIcon(platform: string): string {
    return platformIcons[platform] || platformIcons.default;
}

export default function PeerList({ peers, selectedPeer, onSelect }: PeerListProps) {
    if (peers.length === 0) {
        return (
            <div className="peer-list-empty">
                <div className="empty-icon">📡</div>
                <p className="empty-title">Scanning neighborhood...</p>
                <p className="empty-sub">
                    Devices on the same LAN will appear here automatically
                </p>
                <div className="scan-animation">
                    <span className="scan-dot" />
                    <span className="scan-dot" />
                    <span className="scan-dot" />
                </div>
            </div>
        );
    }

    return (
        <div className="peer-grid">
            {peers.map((peer) => (
                <button
                    key={peer.id}
                    className={`peer-card ${selectedPeer?.id === peer.id ? 'selected' : ''}`}
                    onClick={() => onSelect(peer)}
                >
                    <div className="peer-icon">{getPlatformIcon(peer.platform)}</div>
                    <div className="peer-info">
                        <span className="peer-name">{peer.deviceName}</span>
                        <span className="peer-ip">{peer.ip}</span>
                    </div>
                    <div className="peer-status-dot" />
                </button>
            ))}
        </div>
    );
}
