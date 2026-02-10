import { useCallback, useRef, useState } from 'react';
import type { Peer } from '../hooks/useWebSocket';

interface SendPanelProps {
    selectedPeer: Peer | null;
}

const API_BASE = `http://${window.location.hostname}:3001`;

export default function SendPanel({ selectedPeer }: SendPanelProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);
    const [sending, setSending] = useState(false);
    const [selectedFile, setSelectedFile] = useState<File | null>(null);

    const handleFile = useCallback((file: File) => {
        setSelectedFile(file);
    }, []);

    const handleDrop = useCallback(
        (e: React.DragEvent) => {
            e.preventDefault();
            setDragOver(false);
            const file = e.dataTransfer.files[0];
            if (file) handleFile(file);
        },
        [handleFile],
    );

    const handleSend = useCallback(async () => {
        if (!selectedFile || !selectedPeer) return;
        setSending(true);

        try {
            const formData = new FormData();
            formData.append('file', selectedFile);
            formData.append('peerIp', selectedPeer.ip);
            formData.append('peerPort', String(selectedPeer.transportPort));

            const res = await fetch(`${API_BASE}/api/send`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Send failed');
            }

            setSelectedFile(null);
        } catch (err) {
            console.error('Send error:', err);
            alert(`Send failed: ${(err as Error).message}`);
        } finally {
            setSending(false);
        }
    }, [selectedFile, selectedPeer]);

    const formatSize = (bytes: number): string => {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    };

    return (
        <div className="send-panel">
            <div
                className={`drop-zone ${dragOver ? 'drag-over' : ''} ${selectedFile ? 'has-file' : ''}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
            >
                <input
                    ref={fileInputRef}
                    type="file"
                    className="file-input-hidden"
                    onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleFile(file);
                    }}
                />

                {selectedFile ? (
                    <div className="file-preview">
                        <div className="file-icon">📄</div>
                        <div className="file-details">
                            <span className="file-name">{selectedFile.name}</span>
                            <span className="file-size">{formatSize(selectedFile.size)}</span>
                        </div>
                        <button
                            className="file-remove"
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedFile(null);
                            }}
                        >
                            ✕
                        </button>
                    </div>
                ) : (
                    <div className="drop-prompt">
                        <div className="drop-icon">
                            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                                <polyline points="17 8 12 3 7 8" />
                                <line x1="12" y1="3" x2="12" y2="15" />
                            </svg>
                        </div>
                        <p className="drop-text">Drop a file here or click to browse</p>
                    </div>
                )}
            </div>

            <button
                className="send-button"
                disabled={!selectedFile || !selectedPeer || sending}
                onClick={handleSend}
            >
                {sending ? (
                    <>
                        <span className="spinner" /> Sending...
                    </>
                ) : !selectedPeer ? (
                    'Select a peer first'
                ) : !selectedFile ? (
                    'Choose a file to send'
                ) : (
                    <>
                        Send to <strong>{selectedPeer.deviceName}</strong>
                    </>
                )}
            </button>
        </div>
    );
}
