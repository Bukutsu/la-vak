import type { IncomingRequest } from '../hooks/useWebSocket';

interface IncomingModalProps {
    request: IncomingRequest;
    onRespond: (transferId: string, accepted: boolean) => void;
}

function formatSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export default function IncomingModal({ request, onRespond }: IncomingModalProps) {
    return (
        <div className="modal-overlay">
            <div className="modal-card">
                <div className="modal-icon">📨</div>
                <h2 className="modal-title">Incoming File</h2>
                <div className="modal-details">
                    <div className="modal-row">
                        <span className="modal-label">File</span>
                        <span className="modal-value">{request.fileName}</span>
                    </div>
                    <div className="modal-row">
                        <span className="modal-label">Size</span>
                        <span className="modal-value">{formatSize(request.fileSize)}</span>
                    </div>
                    <div className="modal-row">
                        <span className="modal-label">From</span>
                        <span className="modal-value">{request.peerIp}</span>
                    </div>
                </div>
                <div className="modal-actions">
                    <button
                        className="modal-btn reject"
                        onClick={() => onRespond(request.transferId, false)}
                    >
                        Reject
                    </button>
                    <button
                        className="modal-btn accept"
                        onClick={() => onRespond(request.transferId, true)}
                    >
                        Accept
                    </button>
                </div>
            </div>
        </div>
    );
}
