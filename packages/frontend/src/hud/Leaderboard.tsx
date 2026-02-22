import { useState, useEffect } from 'react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const TIER_LABELS = ['None', 'Shack', 'Small', 'Medium', 'Tower', 'Mega'];

interface LeaderboardEntry {
  address: string;
  houseTier: number;
  buildProgress: number;
  damagePct: number;
  colorHue: number;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: 'rgba(0, 0, 0, 0.7)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 100,
  fontFamily: "'Courier New', monospace",
};

const modalStyle: React.CSSProperties = {
  background: '#0d0d14',
  border: '1px solid #222',
  borderRadius: 8,
  padding: '20px 24px',
  width: 380,
  maxWidth: '90vw',
  maxHeight: '80vh',
  overflow: 'auto',
  color: '#ccc',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  padding: '6px 0',
  borderBottom: '1px solid #1a1a2e',
  fontSize: 11,
};

const barBg: React.CSSProperties = {
  flex: 1,
  height: 5,
  background: '#1a1a2e',
  borderRadius: 3,
  overflow: 'hidden',
};

export default function Leaderboard({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_URL}/api/leaderboard`)
      .then((r) => r.json())
      .then((data) => setEntries(data.leaderboard || []))
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [open]);

  if (!open) return null;

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={modalStyle} onClick={(e) => e.stopPropagation()}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <span style={{ fontWeight: 'bold', color: '#00fff5', fontSize: 14 }}>
            LEADERBOARD
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#666',
              cursor: 'pointer',
              fontSize: 16,
              fontFamily: 'monospace',
            }}
          >
            X
          </button>
        </div>

        {loading && <div style={{ color: '#555', padding: 20, textAlign: 'center' }}>Loading...</div>}

        {!loading && entries.length === 0 && (
          <div style={{ color: '#555', padding: 20, textAlign: 'center' }}>No builders yet</div>
        )}

        {/* Column headers */}
        {!loading && entries.length > 0 && (
          <div style={{ ...rowStyle, color: '#555', fontSize: 9, borderBottom: '1px solid #333' }}>
            <span style={{ width: 24 }}>#</span>
            <span style={{ width: 80 }}>WALLET</span>
            <span style={{ width: 44 }}>TIER</span>
            <span style={{ flex: 1 }}>BUILD</span>
            <span style={{ width: 40, textAlign: 'right' }}>DMG</span>
          </div>
        )}

        {entries.map((entry, i) => (
          <div key={entry.address} style={rowStyle}>
            <span style={{ width: 24, color: i < 3 ? '#ffcc00' : '#555' }}>
              {i + 1}
            </span>
            <span style={{ width: 80, color: '#888' }}>
              {entry.address.slice(0, 4)}...{entry.address.slice(-4)}
            </span>
            <span
              style={{
                width: 44,
                color: `hsl(${entry.colorHue}, 80%, 65%)`,
                fontSize: 10,
              }}
            >
              {TIER_LABELS[entry.houseTier]}
            </span>
            <div style={barBg}>
              <div
                style={{
                  width: `${entry.buildProgress}%`,
                  height: '100%',
                  background: '#00ff88',
                  borderRadius: 3,
                }}
              />
            </div>
            <span
              style={{
                width: 40,
                textAlign: 'right',
                color: entry.damagePct > 33 ? '#ff4444' : '#666',
                fontSize: 10,
              }}
            >
              {entry.damagePct > 0 ? `${entry.damagePct.toFixed(0)}%` : '-'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
