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

function rankClass(i: number): string {
  if (i === 0) return 'lb-rank gold';
  if (i === 1) return 'lb-rank silver';
  if (i === 2) return 'lb-rank bronze';
  return 'lb-rank';
}

function rankLabel(i: number): string {
  if (i === 0) return '\u{1F947}';
  if (i === 1) return '\u{1F948}';
  if (i === 2) return '\u{1F949}';
  return String(i + 1);
}

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
    <div className="lb-overlay" onClick={onClose}>
      <div className="lb-modal" onClick={(e) => e.stopPropagation()}>
        <div className="lb-header">
          <span className="lb-title">LEADERBOARD</span>
          <button className="lb-close" onClick={onClose}>
            ✕
          </button>
        </div>

        {loading && (
          <div style={{ color: 'var(--text-dim)', padding: 24, textAlign: 'center' }}>
            Loading...
          </div>
        )}

        {!loading && entries.length === 0 && (
          <div style={{ color: 'var(--text-dim)', padding: 24, textAlign: 'center' }}>
            No builders yet
          </div>
        )}

        {!loading && entries.length > 0 && (
          <div className="lb-col-header">
            <span style={{ width: 28 }}>#</span>
            <span style={{ width: 80 }}>WALLET</span>
            <span style={{ width: 56 }}>TIER</span>
            <span style={{ flex: 1 }}>BUILD</span>
            <span style={{ width: 40, textAlign: 'right' }}>DMG</span>
          </div>
        )}

        {entries.map((entry, i) => {
          const hue = entry.colorHue;
          const tierColor = `hsl(${hue}, 80%, 65%)`;
          const tierBg = `hsla(${hue}, 80%, 65%, 0.12)`;
          const tierBorder = `hsla(${hue}, 80%, 65%, 0.3)`;

          return (
            <div key={entry.address} className="lb-row">
              <span className={rankClass(i)}>{rankLabel(i)}</span>
              <span className="lb-wallet">
                {entry.address.slice(0, 4)}...{entry.address.slice(-4)}
              </span>
              <span
                className="tier-badge"
                style={{
                  color: tierColor,
                  background: tierBg,
                  border: `1px solid ${tierBorder}`,
                }}
              >
                {TIER_LABELS[entry.houseTier]}
              </span>
              <div className="lb-bar-track">
                <div
                  className="lb-bar-fill"
                  style={{ width: `${entry.buildProgress}%` }}
                />
              </div>
              <span
                className="lb-damage"
                style={{ color: entry.damagePct > 33 ? 'var(--red)' : 'var(--text-dim)' }}
              >
                {entry.damagePct > 0 ? `${entry.damagePct.toFixed(0)}%` : '-'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
