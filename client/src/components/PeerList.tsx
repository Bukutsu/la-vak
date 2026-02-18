import { Monitor, Wifi, Send } from 'lucide-react';
import { useRef, useState } from 'react';
import type { Peer } from '../types';
import { api } from '../services/api';

interface PeerListProps {
    peers: Peer[];
}

export default function PeerList({ peers }: PeerListProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const handlePeerClick = (peerIp: string) => {
        if (sending) return;
        setSelectedPeer(peerIp);
        fileInputRef.current?.click();
    };

    const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !selectedPeer) return;

        setSending(true);
        try {
            console.log(`Sending ${file.name} to ${selectedPeer}...`);
            await api.sendFile(selectedPeer, file);
            alert(`Successfully initiated transfer of ${file.name}!`);
        } catch (error: any) {
            console.error(error);
            alert(`Failed to send file: ${error.message}`);
        } finally {
            setSending(false);
            setSelectedPeer(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    if (peers.length === 0) {
        return (
            <div className="glass-panel" style={{ padding: '3rem', marginTop: '2rem' }}>
                <Wifi size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
                <h3>Scanning for devices...</h3>
                <p style={{ opacity: 0.7 }}>Make sure other devices are on the same network.</p>
            </div>
        );
    }

    return (
        <>
            <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                onChange={handleFileChange} 
            />
            
            <div className="peers-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem', marginTop: '2rem' }}>
                {peers.map((peer) => (
                    <div 
                        key={peer.id} 
                        className="card" 
                        onClick={() => handlePeerClick(peer.remoteAddress)}
                        style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '1rem', 
                            cursor: sending ? 'wait' : 'pointer',
                            opacity: sending ? 0.7 : 1,
                            transition: 'all 0.2s ease'
                        }}
                    >
                        <div style={{ background: 'rgba(56, 189, 248, 0.2)', padding: '12px', borderRadius: '12px' }}>
                            <Monitor size={24} color="#38bdf8" />
                        </div>
                        <div style={{ textAlign: 'left', flex: 1 }}>
                            <div style={{ fontWeight: 600, fontSize: '1.1rem' }}>{peer.hostname}</div>
                            <div style={{ fontSize: '0.85rem', opacity: 0.6 }}>{peer.remoteAddress}</div>
                        </div>
                        <Send size={18} style={{ opacity: 0.5 }} />
                    </div>
                ))}
            </div>
        </>
    );
}
