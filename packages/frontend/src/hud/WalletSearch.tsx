import { useState, useCallback } from 'react';
import { useTownStore } from '../hooks/useTownStore';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const TIER_LABELS = ['None', 'Shack', 'Small', 'Medium', 'Tower', 'Mega'];

interface WalletResult {
  address: string;
  houseTier: number;
  buildProgress: number;
  damagePct: number;
  tokenBalance: string;
  colorHue: number;
  plotX: number;
  plotY: number;
}

function formatBalance(raw: string): string {
  const num = Number(raw);
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

export default function WalletSearch({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<WalletResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const locateHouse = useTownStore((s) => s.locateHouse);

  const search = useCallback(() => {
    const addr = query.trim();
    if (!addr) return;

    // First try the local store
    const local = useTownStore.getState().wallets.get(addr);
    if (local) {
      setResult({
        address: local.address,
        houseTier: local.houseTier,
        buildProgress: local.buildProgress,
        damagePct: local.damagePct,
        tokenBalance: local.tokenBalance,
        colorHue: local.colorHue,
        plotX: local.plotX,
        plotY: local.plotY,
      });
      setError('');
      return;
    }

    // Fall back to API
    setLoading(true);
    setError('');
    fetch(`${API_URL}/api/wallet/${addr}`)
      .then((r) => {
        if (!r.ok) throw new Error('Not found');
        return r.json();
      })
      .then((data) => {
        setResult(data.wallet || data);
      })
      .catch(() => {
        setResult(null);
        setError('Wallet not found');
      })
      .finally(() => setLoading(false));
  }, [query]);

  const handleLocate = useCallback(() => {
    if (!result) return;
    locateHouse?.(result.address);
  }, [result, locateHouse]);

  const hue = result?.colorHue ?? 180;
  const accentColor = `hsl(${hue}, 80%, 65%)`;

  return (
    <div className="wallet-search-panel">
      <div className="ws-header">
        <span className="ws-title">Wallet Search</span>
        <button className="ws-close" onClick={onClose}>✕</button>
      </div>

      <div className="ws-input-row">
        <input
          className="ws-input"
          placeholder="Paste wallet address..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && search()}
        />
        <button className="ws-search-btn" onClick={search}>
          GO
        </button>
      </div>

      <div className="ws-result">
        {loading && (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 20, fontSize: 11 }}>
            Searching...
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--pink)', textAlign: 'center', padding: 20, fontSize: 11 }}>
            {error}
          </div>
        )}

        {!loading && !error && result && (
          <div className="ws-result-card">
            <div style={{ color: 'var(--text-muted)', fontSize: 10, wordBreak: 'break-all' }}>
              {result.address}
            </div>

            <div className="ws-stat-row">
              <span className="ws-stat-label">Tier</span>
              <span
                className="tier-badge"
                style={{
                  color: accentColor,
                  background: `hsla(${hue}, 80%, 65%, 0.12)`,
                  border: `1px solid hsla(${hue}, 80%, 65%, 0.3)`,
                }}
              >
                {TIER_LABELS[result.houseTier]}
              </span>
            </div>

            <div>
              <div className="ws-stat-row" style={{ marginBottom: 4 }}>
                <span className="ws-stat-label">Build Progress</span>
                <span className="ws-stat-value">{result.buildProgress.toFixed(0)}%</span>
              </div>
              <div className="ws-progress-track">
                <div
                  className="ws-progress-fill"
                  style={{
                    width: `${result.buildProgress}%`,
                    background: `linear-gradient(90deg, ${accentColor}, var(--green))`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="ws-stat-row" style={{ marginBottom: 4 }}>
                <span className="ws-stat-label">Damage</span>
                <span
                  className="ws-stat-value"
                  style={{ color: result.damagePct > 33 ? 'var(--red)' : undefined }}
                >
                  {result.damagePct > 0 ? `${result.damagePct.toFixed(0)}%` : 'None'}
                </span>
              </div>
              {result.damagePct > 0 && (
                <div className="ws-progress-track">
                  <div
                    className="ws-progress-fill"
                    style={{
                      width: `${result.damagePct}%`,
                      background: `linear-gradient(90deg, var(--orange), var(--red))`,
                    }}
                  />
                </div>
              )}
            </div>

            <div className="ws-stat-row">
              <span className="ws-stat-label">Balance</span>
              <span className="ws-stat-value">{formatBalance(result.tokenBalance)}</span>
            </div>

            <button className="ws-locate-btn" onClick={handleLocate}>
              Locate on Map
            </button>
          </div>
        )}

        {!loading && !error && !result && (
          <div style={{ color: 'var(--text-dim)', textAlign: 'center', padding: 30, fontSize: 11 }}>
            Enter a wallet address to search
          </div>
        )}
      </div>
    </div>
  );
}
