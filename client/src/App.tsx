import { useState, useCallback } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import type { Peer } from './hooks/useWebSocket';
import { API_BASE } from './config';
import PeerList from './components/PeerList';
import SendPanel from './components/SendPanel';
import TransferList from './components/TransferList';
import IncomingModal from './components/IncomingModal';



function App() {
  const { peers, transfers, incoming, dismissIncoming, deviceInfo, connected } =
    useWebSocket();
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);

  const handleRespond = useCallback(
    async (transferId: string, accepted: boolean) => {
      try {
        await fetch(`${API_BASE}/api/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ transferId, accepted }),
        });
      } catch (err) {
        console.error('Respond error:', err);
      }
      dismissIncoming();
    },
    [dismissIncoming],
  );

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div className="header-left">
          <h1 className="logo-text">
            <span className="logo-icon">🏘</span> La-Vak
          </h1>
          <span className="logo-sub">ละแวก</span>
        </div>
        <div className="header-right">
          <div className={`connection-badge ${connected ? 'online' : 'offline'}`}>
            <span className="conn-dot" />
            {connected ? 'Engine Connected' : 'Disconnected'}
          </div>
          {deviceInfo && (
            <div className="device-badge">
              {deviceInfo.deviceName} · {deviceInfo.ip}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="main">
        {/* Left Column: Peers + Send */}
        <section className="panel peers-section">
          <div className="panel-header">
            <h2>Neighborhood</h2>
            <span className="badge">{peers.length}</span>
          </div>
          <PeerList
            peers={peers}
            selectedPeer={selectedPeer}
            onSelect={setSelectedPeer}
          />
          <div className="panel-header send-header">
            <h2>Send File</h2>
          </div>
          <SendPanel selectedPeer={selectedPeer} />
        </section>

        {/* Right Column: Transfers */}
        <section className="panel transfers-section">
          <div className="panel-header">
            <h2>Transfers</h2>
            <span className="badge">{transfers.length}</span>
          </div>
          <TransferList transfers={transfers} />
        </section>
      </main>

      {/* Incoming Modal */}
      {incoming && (
        <IncomingModal request={incoming} onRespond={handleRespond} />
      )}
    </div>
  );
}

export default App;
