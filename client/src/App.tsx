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
      
      const register = () => {
        socketService.socket.emit('peer:register', {
          id: webId,
          hostname: hostname
        });
      };

      register();
      // Send heartbeat every 10 seconds to keep alive
      const interval = setInterval(register, 10000);
      return () => clearInterval(interval);
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
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '20px'
        }}>
          <div className="glass-panel" style={{
            background: 'rgba(30, 41, 59, 0.95)',
            border: '1px solid rgba(56, 189, 248, 0.3)',
            color: 'white',
            padding: '2.5rem',
            borderRadius: '24px',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
            width: '100%',
            maxWidth: '450px',
            textAlign: 'center',
            animation: 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            <div style={{ 
              background: 'rgba(56, 189, 248, 0.1)', 
              width: '80px', 
              height: '80px', 
              borderRadius: '20px', 
              display: 'flex', 
              justifyContent: 'center', 
              alignItems: 'center',
              margin: '0 auto 1.5rem'
            }}>
              <ShieldCheck size={40} color="#38bdf8" />
            </div>
            
            <h2 style={{ marginBottom: '0.5rem', fontSize: '1.5rem' }}>Incoming Transfer</h2>
            <p style={{ opacity: 0.7, marginBottom: '1.5rem' }}>A device in your neighborhood wants to send you a file.</p>
            
            <div style={{ 
              background: 'rgba(0, 0, 0, 0.2)', 
              padding: '1rem', 
              borderRadius: '12px', 
              marginBottom: '2rem',
              border: '1px dashed rgba(255, 255, 255, 0.1)'
            }}>
              <div style={{ fontWeight: 'bold', fontSize: '1.1rem', wordBreak: 'break-all' }}>
                {transfers[0].filename}
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
                onClick={() => handleDownload(transfers[0].id, transfers[0].url, transfers[0].filename)}
                style={{
                  background: '#38bdf8',
                  color: '#0f172a',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '12px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  transition: 'transform 0.2s ease'
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1)'}
              >
                Accept and Download
              </button>
              <button 
                onClick={() => setTransfers(prev => prev.filter(item => item.id !== transfers[0].id))}
                style={{
                  background: 'transparent',
                  color: 'rgba(255, 255, 255, 0.6)',
                  border: 'none',
                  padding: '10px',
                  borderRadius: '12px',
                  fontSize: '0.9rem',
                  cursor: 'pointer'
                }}
              >
                Decline Request
              </button>
            </div>
            
            {transfers.length > 1 && (
              <div style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.5 }}>
                +{transfers.length - 1} more pending requests
              </div>
            )}
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