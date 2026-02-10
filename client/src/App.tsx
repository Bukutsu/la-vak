import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import './index.css';
import socketService from './services/socket';
import { api } from './services/api';
import type { Peer, ServerStatus } from './types';
import PeerList from './components/PeerList';

function App() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [connected, setConnected] = useState(false);
  const [transfers, setTransfers] = useState<{ id: string, filename: string, url: string, timestamp: number }[]>([]);

  useEffect(() => {
    // ... same fetch ...
    api.getStatus().then(setStatus).catch(console.error);
    api.getPeers().then(setPeers).catch(console.error);

    socketService.connect();

    socketService.socket.on('connect', () => {
      setConnected(true);
      
      let webId = localStorage.getItem('lavak_web_id');
      if (!webId) {
        webId = 'web-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('lavak_web_id', webId);
      }
      
      const isMobile = /Android|iPhone/i.test(navigator.userAgent);
      const hostname = isMobile ? 'Android Phone' : 'Web Browser';
      
      socketService.socket.emit('peer:register', {
        id: webId,
        hostname: hostname
      });
    });

    socketService.socket.on('disconnect', () => {
      setConnected(false);
    });

    socketService.socket.on('peers:update', (updatedPeers: Peer[]) => {
      setPeers(updatedPeers);
    });

    socketService.socket.on('transfer:incoming', (data: { filename: string, size: number }) => {
      console.log('Incoming TCP transfer:', data.filename);
    });

    socketService.socket.on('transfer:success', () => {
      alert('File received and saved to downloads folder!');
    });

    socketService.socket.on('transfer:web_request', (data: { filename: string, url: string }) => {
        setTransfers(prev => {
            // Prevent duplicates if the same URL is received twice
            if (prev.some(t => t.url === data.url)) return prev;
            
            const transferId = Math.random().toString(36).substr(2, 9);
            return [{
                id: transferId,
                filename: data.filename,
                url: data.url,
                timestamp: Date.now()
            }, ...prev];
        });
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

  const handleDownload = (transferId: string, url: string, filename: string) => {
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    
    // Remove from list after download
    setTransfers(prev => prev.filter(t => t.id !== transferId));
  };

  return (
    <div className="container">
      {transfers.length > 0 && (
        <div style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '350px'
        }}>
          {transfers.map(t => (
            <div key={t.id} className="glass-panel" style={{
              background: '#38bdf8',
              color: 'white',
              padding: '1rem',
              borderRadius: '12px',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
              animation: 'slideIn 0.3s ease'
            }}>
              <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Incoming File</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {t.filename}
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }}>
                <button 
                  onClick={() => handleDownload(t.id, t.url, t.filename)}
                  style={{
                    background: 'white',
                    color: '#0369a1',
                    border: 'none',
                    padding: '6px 15px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  Save File
                </button>
                <button 
                  onClick={() => setTransfers(prev => prev.filter(item => item.id !== t.id))}
                  style={{
                    background: 'rgba(255,255,255,0.2)',
                    color: 'white',
                    border: 'none',
                    padding: '6px 12px',
                    borderRadius: '6px',
                    fontSize: '0.85rem',
                    cursor: 'pointer'
                  }}
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <header style={{ marginBottom: '3rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
          <ShieldCheck size={48} color="#38bdf8" />
          <h1>La-Vak</h1>
        </div>
        <p style={{ fontSize: '1.2rem', opacity: 0.8, maxWidth: '600px', margin: '0 auto' }}>
          Secure, zero-configuration P2P file synchronization for your local neighborhood.
        </p>

        <div style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.8rem' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', background: 'rgba(0,0,0,0.3)', padding: '0.5rem 1rem', borderRadius: '50px' }}>
            <div className={`status-dot ${connected ? '' : 'offline'}`}></div>
            <span style={{ fontSize: '0.9rem', fontWeight: 500 }}>
              {connected ? 'System Online' : 'Connecting to Core...'}
            </span>
          </div>
          {status && (
            <div style={{ fontSize: '0.75rem', opacity: 0.5, fontStyle: 'italic' }}>
              Security initialized: {status.publicKey}
            </div>
          )}
        </div>
      </header>

      <main>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2>Available Devices ({peers.length})</h2>
        </div>

        <PeerList peers={peers} />
      </main>
    </div>
  );
}

export default App;