import { useState, useEffect } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API_BASE = WS_URL.replace(/^ws(s?):\/\//, 'http$1://');

interface HolderProfile {
  walletAddress: string;
  tier: number;
  supplyPercent: number;
  eventType: string;
  tradingPersonality: string;
  behaviorPattern: string;
  behaviorTheme: string;
  tradeStats: { buys: number; sells: number; volume: number };
  isNewHolder: boolean;
  existingBuildingName: string | null;
}

interface Decision {
  building_name: string;
  architectural_style: string;
  clawd_comment: string;
  description: string;
  evolution_hint: string;
  image_prompt?: string;
}

interface DecisionEntry {
  id: string;
  walletAddress: string;
  eventType: string;
  decision: Decision;
  holderProfile: HolderProfile | null;
  imageUrl: string | null;
  createdAt: string;
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const TIER_LABELS: Record<number, { label: string; color: string }> = {
  0: { label: 'EMPTY LOT', color: '#666' },
  1: { label: 'SHACK', color: '#888' },
  2: { label: 'HOUSE', color: '#4a9' },
  3: { label: 'MANSION', color: '#00fff5' },
  4: { label: 'SKYSCRAPER', color: '#ff00ff' },
  5: { label: 'MONUMENT', color: '#ffd700' },
};

const EVENT_COLORS: Record<string, string> = {
  buy: '#00ff88',
  sell: '#ff4466',
  transfer_in: '#00ccff',
  transfer_out: '#ff8844',
};

export default function ClawdBlog() {
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/clawd/log?limit=100`)
      .then((r) => {
        if (!r.ok) throw new Error(`${r.status}`);
        return r.json();
      })
      .then((data) => {
        setDecisions(data.decisions);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, []);

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={s.logo}>CLAWD</span>
            <span style={s.subtitle}>Decision Log</span>
          </div>
          <a href="#" style={s.backLink}>← Back to Town</a>
        </div>

        <p style={s.intro}>
          Every building in Claude Town is assigned by Clawd, an AI architect who
          analyzes each holder's wallet behavior and designs a structure that reflects
          their personality. Below is a log of every decision Clawd has made.
        </p>

        {loading && <div style={s.status}>Loading decisions...</div>}
        {error && <div style={{ ...s.status, color: '#ff4466' }}>Error: {error}</div>}
        {!loading && !error && decisions.length === 0 && (
          <div style={s.status}>No decisions yet. Clawd is waiting for activity.</div>
        )}

        {/* Decision Cards */}
        {decisions.map((entry) => (
          <DecisionCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function DecisionCard({ entry }: { entry: DecisionEntry }) {
  const { decision, holderProfile, imageUrl, createdAt, walletAddress, eventType } = entry;
  const tier = holderProfile?.tier ?? 0;
  const tierInfo = TIER_LABELS[tier] || TIER_LABELS[0];

  return (
    <div style={s.card}>
      {/* Card Header */}
      <div style={s.cardHeader}>
        <div style={{ flex: 1 }}>
          <div style={s.buildingName}>{decision.building_name || 'Unknown'}</div>
          <div style={s.archStyle}>{decision.architectural_style || '—'}</div>
        </div>
        <span style={{ ...s.tierBadge, borderColor: tierInfo.color, color: tierInfo.color }}>
          {tierInfo.label}
        </span>
      </div>

      {/* Wallet + Event */}
      <div style={s.walletRow}>
        <span style={s.walletAddr}>
          {holderProfile?.walletAddress || walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4)}
        </span>
        <span style={{ ...s.eventBadge, color: EVENT_COLORS[eventType] || '#aaa' }}>
          {eventType.toUpperCase().replace('_', ' ')}
        </span>
        {holderProfile?.isNewHolder && <span style={s.newBadge}>NEW</span>}
        <span style={s.timestamp}>{relativeTime(createdAt)}</span>
      </div>

      {/* Analysis Section */}
      {holderProfile && (
        <div style={s.analysisSection}>
          <div style={s.sectionLabel}>WALLET ANALYSIS</div>
          <div style={s.analysisGrid}>
            <div style={s.analysisPair}>
              <span style={s.analysisKey}>Personality</span>
              <span style={s.analysisVal}>{holderProfile.tradingPersonality}</span>
            </div>
            <div style={s.analysisPair}>
              <span style={s.analysisKey}>Pattern</span>
              <span style={s.analysisVal}>{holderProfile.behaviorPattern}</span>
            </div>
            <div style={s.analysisPair}>
              <span style={s.analysisKey}>Theme</span>
              <span style={{ ...s.analysisVal, color: '#ff00ff' }}>{holderProfile.behaviorTheme}</span>
            </div>
            <div style={s.analysisPair}>
              <span style={s.analysisKey}>Supply</span>
              <span style={s.analysisVal}>{holderProfile.supplyPercent.toFixed(2)}%</span>
            </div>
            <div style={s.analysisPair}>
              <span style={s.analysisKey}>Trades</span>
              <span style={s.analysisVal}>
                <span style={{ color: '#00ff88' }}>{holderProfile.tradeStats.buys}B</span>
                {' / '}
                <span style={{ color: '#ff4466' }}>{holderProfile.tradeStats.sells}S</span>
              </span>
            </div>
            {holderProfile.existingBuildingName && (
              <div style={s.analysisPair}>
                <span style={s.analysisKey}>Previous</span>
                <span style={s.analysisVal}>{holderProfile.existingBuildingName}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Clawd's Take */}
      <div style={s.clawdSection}>
        <div style={s.sectionLabel}>CLAWD'S TAKE</div>
        {decision.clawd_comment && (
          <div style={s.clawdComment}>"{decision.clawd_comment}"</div>
        )}
        {decision.description && (
          <div style={s.description}>{decision.description}</div>
        )}
        {decision.evolution_hint && (
          <div style={s.evolutionHint}>
            <span style={{ color: '#00fff5' }}>Next evolution:</span> {decision.evolution_hint}
          </div>
        )}
      </div>

      {/* Image */}
      {imageUrl && (
        <div style={s.imageContainer}>
          <img
            src={imageUrl}
            alt={decision.building_name}
            style={s.image}
            loading="lazy"
          />
        </div>
      )}
    </div>
  );
}

// ── Styles ──

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: '#0a0a0f',
    color: '#e0e0e0',
    fontFamily: 'monospace',
    boxSizing: 'border-box',
  },
  container: {
    maxWidth: 700,
    margin: '0 auto',
    padding: '24px 16px 64px',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logo: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#00fff5',
    letterSpacing: 2,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
  backLink: {
    color: '#666',
    fontSize: 13,
    textDecoration: 'none',
  },
  intro: {
    fontSize: 13,
    color: '#777',
    lineHeight: '1.5',
    marginBottom: 24,
    borderBottom: '1px solid #1a1a2a',
    paddingBottom: 20,
  },
  status: {
    textAlign: 'center' as const,
    color: '#888',
    padding: 40,
    fontSize: 14,
  },

  // Card
  card: {
    background: '#14141f',
    border: '1px solid #2a2a3a',
    borderRadius: 8,
    padding: 20,
    marginBottom: 16,
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  buildingName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#fff',
  },
  archStyle: {
    fontSize: 12,
    color: '#00fff5',
    marginTop: 2,
  },
  tierBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    border: '1px solid',
    borderRadius: 4,
    padding: '2px 8px',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
  },

  // Wallet row
  walletRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    fontSize: 12,
    marginBottom: 14,
    flexWrap: 'wrap' as const,
  },
  walletAddr: {
    color: '#aaa',
    background: '#1a1a2e',
    padding: '2px 8px',
    borderRadius: 3,
  },
  eventBadge: {
    fontWeight: 'bold',
    fontSize: 11,
  },
  newBadge: {
    fontSize: 10,
    fontWeight: 'bold',
    color: '#0a0a0f',
    background: '#00ff88',
    borderRadius: 3,
    padding: '1px 6px',
  },
  timestamp: {
    color: '#555',
    marginLeft: 'auto',
  },

  // Analysis
  analysisSection: {
    background: '#0f0f1a',
    border: '1px solid #1e1e30',
    borderRadius: 6,
    padding: 14,
    marginBottom: 14,
  },
  sectionLabel: {
    fontSize: 10,
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  analysisGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: 8,
  },
  analysisPair: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  analysisKey: {
    fontSize: 10,
    color: '#555',
    textTransform: 'uppercase' as const,
  },
  analysisVal: {
    fontSize: 13,
    color: '#ccc',
  },

  // Clawd section
  clawdSection: {
    marginBottom: 14,
  },
  clawdComment: {
    fontSize: 14,
    color: '#ff00ff',
    fontStyle: 'italic',
    marginBottom: 8,
    lineHeight: '1.4',
  },
  description: {
    fontSize: 13,
    color: '#bbb',
    lineHeight: '1.5',
    marginBottom: 8,
  },
  evolutionHint: {
    fontSize: 12,
    color: '#888',
    lineHeight: '1.4',
  },

  // Image
  imageContainer: {
    borderRadius: 6,
    overflow: 'hidden',
    border: '1px solid #2a2a3a',
  },
  image: {
    width: '100%',
    display: 'block',
  },
};
