import { useTownStore } from '../hooks/useTownStore';

const TIER_LABELS = ['None', 'Shack', 'Small', 'Medium', 'Tower', 'Mega'];

function formatBalance(raw: string): string {
  const num = Number(raw);
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

export default function HouseTooltip() {
  const selectedHouse = useTownStore((s) => s.selectedHouse);
  const wallet = useTownStore((s) => (s.selectedHouse ? s.wallets.get(s.selectedHouse) : undefined));

  if (!selectedHouse || !wallet) return null;

  const hue = wallet.colorHue;
  const accentColor = `hsl(${hue}, 80%, 65%)`;

  return (
    <div
      className="house-tooltip"
      style={{
        top: 64,
        left: '50%',
        transform: 'translateX(-50%)',
        borderColor: `hsla(${hue}, 80%, 65%, 0.35)`,
        boxShadow: `0 0 20px hsla(${hue}, 80%, 65%, 0.1), 0 8px 24px rgba(0,0,0,0.4)`,
        pointerEvents: 'auto',
        cursor: 'default',
      }}
    >
      <div className="ht-address">
        {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
        <button
          onClick={() => useTownStore.getState().setSelectedHouse(null)}
          style={{
            float: 'right',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-dim)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 12,
          }}
        >
          ✕
        </button>
      </div>

      <div className="ht-row">
        <span className="ht-label">Tier</span>
        <span
          className="tier-badge"
          style={{
            color: accentColor,
            background: `hsla(${hue}, 80%, 65%, 0.12)`,
            border: `1px solid hsla(${hue}, 80%, 65%, 0.3)`,
            fontSize: 9,
            padding: '1px 6px',
          }}
        >
          {TIER_LABELS[wallet.houseTier]}
        </span>
      </div>

      <div className="ht-row">
        <span className="ht-label">Build</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div className="ws-progress-track" style={{ width: 60 }}>
            <div
              className="ws-progress-fill"
              style={{
                width: `${wallet.buildProgress}%`,
                background: `linear-gradient(90deg, ${accentColor}, var(--green))`,
              }}
            />
          </div>
          <span style={{ fontSize: 9, color: 'var(--text-muted)' }}>{wallet.buildProgress.toFixed(0)}%</span>
        </div>
      </div>

      <div className="ht-row">
        <span className="ht-label">Damage</span>
        <span style={{ color: wallet.damagePct > 33 ? 'var(--red)' : 'var(--text-muted)', fontSize: 10 }}>
          {wallet.damagePct > 0 ? `${wallet.damagePct.toFixed(0)}%` : 'None'}
        </span>
      </div>

      <div className="ht-row">
        <span className="ht-label">Balance</span>
        <span style={{ color: 'var(--text-primary)', fontSize: 10 }}>
          {formatBalance(wallet.tokenBalance)}
        </span>
      </div>
    </div>
  );
}
