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
  const [incomingFile, setIncomingFile] = useState<{ filename: string, url: string } | null>(null);

  useEffect(() => {
    // Initial fetch
    api.getStatus().then(setStatus).catch(console.error);
    api.getPeers().then(setPeers).catch(console.error);

    // Socket setup
    socketService.connect();

    socketService.socket.on('connect', () => {
      setConnected(true);
      
      // Persist the webId so refreshing doesn't create duplicate peers
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
      console.log('Peers updated:', updatedPeers);
      setPeers(updatedPeers);
    });

    socketService.socket.on('transfer:incoming', (data: { filename: string, size: number }) => {
      alert(`Incoming file: ${data.filename} (${(data.size / 1024).toFixed(2)} KB)`);
    });

    socketService.socket.on('transfer:success', () => {
      alert('File received successfully!');
    });

    socketService.socket.on('transfer:web_request', (data: { filename: string, url: string }) => {
        setIncomingFile(data);
    });

    return () => {
      socketService.disconnect();
    };
  }, []);

  const handleDownload = () => {
    if (!incomingFile) return;
    const link = document.createElement('a');
    link.href = incomingFile.url;
    link.setAttribute('download', incomingFile.filename);
    document.body.appendChild(link);
    link.click();
    link.remove();
    setIncomingFile(null);
  };

  return (
    <div className="container">
      {incomingFile && (
        <div style={{
          position: 'fixed',
          top: '20px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: '#38bdf8',
          color: 'white',
          padding: '1rem 2rem',
          borderRadius: '12px',
          boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.5rem',
          minWidth: '300px'
        }}>
          <div style={{ fontWeight: 'bold' }}>File Received!</div>
          <div style={{ fontSize: '0.9rem', opacity: 0.9 }}>{incomingFile.filename}</div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
            <button 
              onClick={handleDownload}
              style={{
                background: 'white',
                color: '#0369a1',
                border: 'none',
                padding: '8px 20px',
                borderRadius: '8px',
                fontWeight: 'bold',
                cursor: 'pointer'
              }}
            >
              Download Now
            </button>
            <button 
              onClick={() => setIncomingFile(null)}
              style={{
                background: 'transparent',
                color: 'white',
                border: '1px solid white',
                padding: '8px 20px',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
            >
              Dismiss
            </button>
          </div>
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