import type { Transfer } from '../hooks/useWebSocket';

interface TransferListProps {
    transfers: Transfer[];
}

const statusLabels: Record<string, string> = {
    connecting: 'Connecting…',
    handshake: 'Key exchange…',
    transferring: 'Transferring…',
    verifying: 'Verifying SHA-256…',
    completed: 'Completed ✓',
    error: 'Failed ✗',
    rejected: 'Rejected',
    pending: 'Waiting for approval…',
};

const statusColors: Record<string, string> = {
    connecting: 'var(--color-warning)',
    handshake: 'var(--color-info)',
    transferring: 'var(--color-primary)',
    verifying: 'var(--color-info)',
    completed: 'var(--color-success)',
    error: 'var(--color-error)',
    rejected: 'var(--color-error)',
    pending: 'var(--color-warning)',
};

function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function TransferList({ transfers }: TransferListProps) {
    if (transfers.length === 0) {
        return (
            <div className="transfer-empty">
                <p>No transfers yet</p>
            </div>
        );
    }

    // Show newest first
    const sorted = [...transfers].reverse();

    return (
        <div className="transfer-list">
            {sorted.map((t) => {
                const progress = t.fileSize > 0 ? (t.bytesTransferred / t.fileSize) * 100 : 0;
                const isActive = ['connecting', 'handshake', 'transferring', 'verifying', 'pending'].includes(t.status);

                return (
                    <div key={t.id} className={`transfer-item ${t.status}`}>
                        <div className="transfer-direction">
                            {t.direction === 'send' ? '↑' : '↓'}
                        </div>
                        <div className="transfer-details">
                            <div className="transfer-top">
                                <span className="transfer-filename">{t.fileName}</span>
                                <span className="transfer-size">{formatSize(t.fileSize)}</span>
                            </div>
                            <div className="transfer-bottom">
                                <span
                                    className="transfer-status"
                                    style={{ color: statusColors[t.status] }}
                                >
                                    {statusLabels[t.status] || t.status}
                                </span>
                                {t.error && <span className="transfer-error">{t.error}</span>}
                            </div>
                            {isActive && (
                                <div className="progress-bar-container">
                                    <div
                                        className="progress-bar-fill"
                                        style={{ width: `${Math.min(progress, 100)}%` }}
                                    />
                                </div>
                            )}
                        </div>
                        <div className="transfer-percent">
                            {t.status === 'completed'
                                ? '100%'
                                : isActive
                                    ? `${Math.round(progress)}%`
                                    : ''}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
