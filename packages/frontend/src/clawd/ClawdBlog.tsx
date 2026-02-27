import { useState, useEffect, useRef, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API_BASE = WS_URL.replace(/^ws(s?):\/\//, 'http$1://');

// ── Interfaces ──

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
  isNew?: boolean; // for entrance animation
}

// ── Helpers ──

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

const EVENT_LABELS: Record<string, { label: string; color: string }> = {
  buy: { label: 'BUY', color: '#00ff88' },
  sell: { label: 'SELL', color: '#ff4466' },
};

const PAGE_SIZE = 20;
let idCounter = 0;

// ── Main Component ──

export default function ClawdBlog() {
  const [decisions, setDecisions] = useState<DecisionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const [filter, setFilter] = useState<string>('all');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Allow scrolling on this page (body has overflow:hidden globally)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    html.style.overflow = 'auto';
    body.style.overflow = 'auto';
    if (root) root.style.overflow = 'auto';
    return () => {
      html.style.overflow = '';
      body.style.overflow = '';
      if (root) root.style.overflow = '';
    };
  }, []);

  // Fetch initial decisions
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

  // WebSocket for live updates
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(`${WS_URL}/ws`);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => {
      setConnected(false);
      reconnectTimer.current = setTimeout(connectWs, 3000);
    };
    ws.onerror = () => ws.close();

    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);

        if (msg.type === 'clawd_decision' && msg.decision) {
          const entry: DecisionEntry = {
            id: `live-${++idCounter}`,
            walletAddress: msg.walletAddress,
            eventType: msg.eventType || 'buy',
            decision: msg.decision,
            holderProfile: msg.holderProfile || null,
            imageUrl: msg.imageUrl || null,
            createdAt: new Date().toISOString(),
            isNew: true,
          };
          setDecisions((prev) => [entry, ...prev]);
        }

        if (msg.type === 'building_image_update') {
          setDecisions((prev) =>
            prev.map((d) =>
              d.walletAddress === msg.walletAddress
                ? { ...d, imageUrl: msg.imageUrl }
                : d
            )
          );
        }
      } catch { /* ignore parse errors */ }
    };
  }, []);

  useEffect(() => {
    connectWs();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connectWs]);

  // Update relative times every 30s
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);

  // Filter
  const filtered = filter === 'all'
    ? decisions
    : filter === 'images'
      ? decisions.filter((d) => d.imageUrl)
      : decisions.filter((d) => d.eventType === filter);

  const visible = filtered.slice(0, visibleCount);
  const hasMore = visibleCount < filtered.length;

  // Reset visible count when filter changes
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [filter]);

  // Stats
  const totalDecisions = decisions.length;
  const withImages = decisions.filter((d) => d.imageUrl).length;
  const uniqueWallets = new Set(decisions.map((d) => d.walletAddress)).size;

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <header style={s.header}>
          <div style={s.headerLeft}>
            <div style={s.logoRow}>
              <span style={s.logo}>CLAWD</span>
              <span style={s.logoDot} />
              <span style={s.subtitle}>AI Architect Log</span>
            </div>
            <p style={s.tagline}>
              Every building is designed by Clawd, who analyzes each holder's on-chain behavior
              and crafts a unique structure reflecting their personality.
            </p>
          </div>
          <div style={s.headerRight}>
            <a href="#" style={s.backLink}>Back to Town</a>
            <div style={{ ...s.connBadge, borderColor: connected ? '#00ff88' : '#ff4466' }}>
              <span style={{ ...s.connDot, background: connected ? '#00ff88' : '#ff4466' }} />
              {connected ? 'LIVE' : 'OFFLINE'}
            </div>
          </div>
        </header>

        {/* Stats Bar */}
        <div style={s.statsBar}>
          <div style={s.statItem}>
            <span style={s.statValue}>{totalDecisions}</span>
            <span style={s.statLabel}>DECISIONS</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statItem}>
            <span style={s.statValue}>{uniqueWallets}</span>
            <span style={s.statLabel}>WALLETS</span>
          </div>
          <div style={s.statDivider} />
          <div style={s.statItem}>
            <span style={s.statValue}>{withImages}</span>
            <span style={s.statLabel}>IMAGES</span>
          </div>
        </div>

        {/* Filter Tabs */}
        <div style={s.filterBar}>
          {[
            { key: 'all', label: 'All' },
            { key: 'buy', label: 'Buys' },
            { key: 'sell', label: 'Sells' },
            { key: 'images', label: 'With Images' },
          ].map(({ key, label }) => (
            <button
              key={key}
              style={filter === key ? { ...s.filterBtn, ...s.filterBtnActive } : s.filterBtn}
              onClick={() => setFilter(key)}
            >
              {label}
              {key === 'all' && <span style={s.filterCount}>{totalDecisions}</span>}
            </button>
          ))}
        </div>

        {/* Content */}
        {loading && <div style={s.status}>Loading decisions...</div>}
        {error && <div style={{ ...s.status, color: '#ff4466' }}>Error: {error}</div>}
        {!loading && !error && filtered.length === 0 && (
          <div style={s.emptyState}>
            <div style={s.emptyIcon}>{ }</div>
            <div style={s.emptyTitle}>No decisions yet</div>
            <div style={s.emptySubtitle}>Clawd is analyzing wallet behavior and designing buildings...</div>
            <div style={s.spinner} />
          </div>
        )}

        {/* Decision Cards */}
        <div style={s.cardList}>
          {visible.map((entry) => (
            <DecisionCard key={entry.id} entry={entry} />
          ))}
        </div>

        {/* Pagination */}
        {hasMore && (
          <div style={s.paginationBar}>
            <span style={s.paginationCount}>
              Showing {visible.length} of {filtered.length}
            </span>
            <button
              style={s.loadMoreBtn}
              onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            >
              Load More
            </button>
          </div>
        )}

        {!hasMore && filtered.length > PAGE_SIZE && (
          <div style={s.paginationBar}>
            <span style={s.paginationCount}>
              All {filtered.length} decisions shown
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Decision Card ──

function DecisionCard({ entry }: { entry: DecisionEntry }) {
  const { decision, holderProfile, imageUrl, createdAt, walletAddress, eventType } = entry;
  const tier = holderProfile?.tier ?? 0;
  const tierInfo = TIER_LABELS[tier] || TIER_LABELS[0];
  const eventInfo = EVENT_LABELS[eventType] || { label: eventType.toUpperCase(), color: '#aaa' };
  const [imgLoaded, setImgLoaded] = useState(false);

  // Clear isNew flag after animation
  const [animate, setAnimate] = useState(!!entry.isNew);
  useEffect(() => {
    if (animate) {
      const t = setTimeout(() => setAnimate(false), 600);
      return () => clearTimeout(t);
    }
  }, [animate]);

  return (
    <div style={{
      ...s.card,
      ...(animate ? s.cardNew : {}),
    }}>
      {/* Top Row: Image + Info side by side */}
      <div style={s.cardTop}>
        {/* Image Column */}
        {imageUrl && (
          <div style={s.cardImageCol}>
            <div style={s.imageWrapper}>
              {!imgLoaded && <div style={s.imagePlaceholder} />}
              <img
                src={imageUrl}
                alt={decision.building_name}
                style={{ ...s.cardImage, opacity: imgLoaded ? 1 : 0 }}
                loading="lazy"
                onLoad={() => setImgLoaded(true)}
              />
            </div>
          </div>
        )}

        {/* Info Column */}
        <div style={s.cardInfoCol}>
          {/* Building name + tier */}
          <div style={s.nameRow}>
            <div>
              <div style={s.buildingName}>{decision.building_name || 'Unknown'}</div>
              <div style={s.archStyle}>{decision.architectural_style || '-'}</div>
            </div>
            <span style={{ ...s.tierBadge, borderColor: tierInfo.color, color: tierInfo.color }}>
              {tierInfo.label}
            </span>
          </div>

          {/* Meta row */}
          <div style={s.metaRow}>
            <span style={s.walletAddr}>
              {holderProfile?.walletAddress || walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4)}
            </span>
            <span style={{ ...s.eventBadge, background: eventInfo.color + '18', color: eventInfo.color, borderColor: eventInfo.color + '44' }}>
              {eventInfo.label}
            </span>
            {holderProfile?.isNewHolder && <span style={s.newBadge}>NEW</span>}
            <span style={s.timestamp}>{relativeTime(createdAt)}</span>
          </div>

          {/* Clawd's comment */}
          {decision.clawd_comment && (
            <div style={s.clawdComment}>"{decision.clawd_comment}"</div>
          )}
        </div>
      </div>

      {/* Expandable Details */}
      <Details decision={decision} holderProfile={holderProfile} />
    </div>
  );
}

// ── Collapsible Details Section ──

function Details({ decision, holderProfile }: { decision: Decision; holderProfile: HolderProfile | null }) {
  const [open, setOpen] = useState(false);

  return (
    <div style={s.detailsWrapper}>
      <button style={s.detailsToggle} onClick={() => setOpen(!open)}>
        {open ? 'Hide details' : 'Show details'}
        <span style={{ ...s.detailsArrow, transform: open ? 'rotate(180deg)' : 'rotate(0)' }}>
          v
        </span>
      </button>

      {open && (
        <div style={s.detailsContent}>
          {/* Wallet Analysis */}
          {holderProfile && (
            <div style={s.analysisSection}>
              <div style={s.sectionLabel}>WALLET ANALYSIS</div>
              <div style={s.analysisGrid}>
                <AnalysisPair label="Personality" value={holderProfile.tradingPersonality} />
                <AnalysisPair label="Pattern" value={holderProfile.behaviorPattern} />
                <AnalysisPair label="Theme" value={holderProfile.behaviorTheme} color="#ff00ff" />
                <AnalysisPair label="Supply" value={`${holderProfile.supplyPercent.toFixed(2)}%`} />
                <AnalysisPair
                  label="Trades"
                  value={
                    <span>
                      <span style={{ color: '#00ff88' }}>{holderProfile.tradeStats.buys}B</span>
                      {' / '}
                      <span style={{ color: '#ff4466' }}>{holderProfile.tradeStats.sells}S</span>
                    </span>
                  }
                />
                {holderProfile.existingBuildingName && (
                  <AnalysisPair label="Previous" value={holderProfile.existingBuildingName} />
                )}
              </div>
            </div>
          )}

          {/* Description + Evolution */}
          {decision.description && (
            <div style={s.descriptionBlock}>
              <div style={s.sectionLabel}>BUILDING DESCRIPTION</div>
              <div style={s.description}>{decision.description}</div>
            </div>
          )}
          {decision.evolution_hint && (
            <div style={s.evolutionHint}>
              <span style={{ color: '#00fff5' }}>Next evolution:</span> {decision.evolution_hint}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnalysisPair({ label, value, color }: { label: string; value: React.ReactNode; color?: string }) {
  return (
    <div style={s.analysisPair}>
      <span style={s.analysisKey}>{label}</span>
      <span style={{ ...s.analysisVal, ...(color ? { color } : {}) }}>{value}</span>
    </div>
  );
}

// ── Styles ──

const CYAN = '#00fff5';
const BG_DARK = '#0a0a0f';
const BG_CARD = '#111119';
const BG_SECTION = '#0d0d16';
const BORDER = '#1e1e2e';

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    background: BG_DARK,
    color: '#e0e0e0',
    fontFamily: '"Courier New", monospace',
    overflowY: 'auto',
  },
  container: {
    maxWidth: 760,
    margin: '0 auto',
    padding: '24px 16px 80px',
  },

  // Header
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
    marginBottom: 20,
    paddingBottom: 16,
    borderBottom: `1px solid ${BORDER}`,
  },
  headerLeft: { flex: 1 },
  headerRight: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    marginBottom: 6,
  },
  logo: {
    fontSize: 26,
    fontWeight: 'bold',
    color: CYAN,
    letterSpacing: 3,
  },
  logoDot: {
    width: 4,
    height: 4,
    borderRadius: '50%',
    background: '#555',
  },
  subtitle: {
    fontSize: 13,
    color: '#666',
    letterSpacing: 1,
  },
  tagline: {
    fontSize: 12,
    color: '#555',
    lineHeight: '1.5',
    maxWidth: 460,
    margin: 0,
  },
  backLink: {
    color: '#556',
    fontSize: 12,
    textDecoration: 'none',
    letterSpacing: 0.5,
  },
  connBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1,
    color: '#aaa',
    border: '1px solid',
    borderRadius: 4,
    padding: '3px 10px',
  },
  connDot: {
    width: 6,
    height: 6,
    borderRadius: '50%',
  },

  // Stats Bar
  statsBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 0,
    background: BG_CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: '14px 0',
    marginBottom: 16,
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: CYAN,
  },
  statLabel: {
    fontSize: 9,
    color: '#555',
    letterSpacing: 1.5,
    textTransform: 'uppercase' as const,
  },
  statDivider: {
    width: 1,
    height: 28,
    background: BORDER,
  },

  // Filter Bar
  filterBar: {
    display: 'flex',
    gap: 6,
    marginBottom: 20,
    flexWrap: 'wrap' as const,
  },
  filterBtn: {
    background: 'transparent',
    border: `1px solid ${BORDER}`,
    borderRadius: 4,
    color: '#777',
    fontSize: 11,
    fontFamily: '"Courier New", monospace',
    padding: '5px 12px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 0.15s',
  },
  filterBtnActive: {
    borderColor: CYAN + '66',
    color: CYAN,
    background: CYAN + '0a',
  },
  filterCount: {
    fontSize: 10,
    color: '#555',
    background: '#1a1a2a',
    borderRadius: 3,
    padding: '1px 5px',
  },

  // Status / Empty
  status: {
    textAlign: 'center' as const,
    color: '#666',
    padding: 48,
    fontSize: 13,
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '60px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 12,
  },
  emptyIcon: { fontSize: 32 },
  emptyTitle: {
    fontSize: 16,
    color: '#888',
    fontWeight: 'bold',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#555',
    maxWidth: 340,
    lineHeight: '1.5',
  },
  spinner: {
    width: 20,
    height: 20,
    border: `2px solid ${BORDER}`,
    borderTop: `2px solid ${CYAN}`,
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginTop: 8,
  },

  // Card List
  cardList: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },

  // Card
  card: {
    background: BG_CARD,
    border: `1px solid ${BORDER}`,
    borderRadius: 8,
    padding: 16,
    transition: 'border-color 0.3s, box-shadow 0.3s',
  },
  cardNew: {
    borderColor: CYAN + '55',
    boxShadow: `0 0 20px ${CYAN}15, inset 0 0 20px ${CYAN}05`,
  },

  // Card Top Layout (image + info side by side)
  cardTop: {
    display: 'flex',
    gap: 16,
  },
  cardImageCol: {
    flexShrink: 0,
    width: 100,
  },
  imageWrapper: {
    width: 100,
    height: 100,
    borderRadius: 6,
    overflow: 'hidden',
    border: `1px solid ${BORDER}`,
    background: '#0a0a12',
    position: 'relative' as const,
  },
  imagePlaceholder: {
    position: 'absolute' as const,
    inset: 0,
    background: `repeating-linear-gradient(45deg, transparent, transparent 8px, ${BORDER} 8px, ${BORDER} 9px)`,
  },
  cardImage: {
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    transition: 'opacity 0.3s',
  },
  cardInfoCol: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 8,
  },

  // Name Row
  nameRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  buildingName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
    lineHeight: '1.2',
  },
  archStyle: {
    fontSize: 11,
    color: CYAN,
    marginTop: 2,
    opacity: 0.8,
  },
  tierBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    border: '1px solid',
    borderRadius: 3,
    padding: '2px 7px',
    whiteSpace: 'nowrap' as const,
    flexShrink: 0,
    letterSpacing: 0.5,
  },

  // Meta Row
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    fontSize: 11,
    flexWrap: 'wrap' as const,
  },
  walletAddr: {
    color: '#888',
    background: '#0e0e1a',
    padding: '2px 7px',
    borderRadius: 3,
    fontSize: 11,
    letterSpacing: 0.3,
  },
  eventBadge: {
    fontWeight: 'bold',
    fontSize: 9,
    letterSpacing: 0.5,
    border: '1px solid',
    borderRadius: 3,
    padding: '1px 6px',
  },
  newBadge: {
    fontSize: 9,
    fontWeight: 'bold',
    color: '#0a0a0f',
    background: '#00ff88',
    borderRadius: 3,
    padding: '1px 6px',
    letterSpacing: 0.5,
  },
  timestamp: {
    color: '#444',
    marginLeft: 'auto',
    fontSize: 11,
  },

  // Clawd Comment (inline in card)
  clawdComment: {
    fontSize: 12,
    color: '#c060d0',
    fontStyle: 'italic',
    lineHeight: '1.4',
    marginTop: 2,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical' as const,
  },

  // Collapsible Details
  detailsWrapper: {
    marginTop: 10,
    borderTop: `1px solid ${BORDER}`,
    paddingTop: 8,
  },
  detailsToggle: {
    background: 'transparent',
    border: 'none',
    color: '#555',
    fontSize: 11,
    fontFamily: '"Courier New", monospace',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '2px 0',
    letterSpacing: 0.5,
  },
  detailsArrow: {
    fontSize: 10,
    transition: 'transform 0.2s',
    display: 'inline-block',
  },
  detailsContent: {
    marginTop: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 12,
  },

  // Analysis Section
  analysisSection: {
    background: BG_SECTION,
    border: `1px solid ${BORDER}`,
    borderRadius: 6,
    padding: 12,
  },
  sectionLabel: {
    fontSize: 9,
    color: '#555',
    textTransform: 'uppercase' as const,
    letterSpacing: 1.5,
    marginBottom: 10,
  },
  analysisGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
    gap: 8,
  },
  analysisPair: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
  },
  analysisKey: {
    fontSize: 9,
    color: '#444',
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  analysisVal: {
    fontSize: 12,
    color: '#bbb',
  },

  // Description + Evolution
  descriptionBlock: {
    padding: 0,
  },
  description: {
    fontSize: 12,
    color: '#999',
    lineHeight: '1.5',
  },
  evolutionHint: {
    fontSize: 11,
    color: '#666',
    lineHeight: '1.4',
  },

  // Pagination
  paginationBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: '24px 0 16px',
    borderTop: `1px solid ${BORDER}`,
    marginTop: 16,
  },
  paginationCount: {
    fontSize: 11,
    color: '#555',
    letterSpacing: 0.5,
  },
  loadMoreBtn: {
    background: 'transparent',
    border: `1px solid ${CYAN}44`,
    borderRadius: 4,
    color: CYAN,
    fontSize: 12,
    fontFamily: '"Courier New", monospace',
    fontWeight: 'bold',
    padding: '8px 24px',
    cursor: 'pointer',
    letterSpacing: 1,
    transition: 'all 0.15s',
  },
};
