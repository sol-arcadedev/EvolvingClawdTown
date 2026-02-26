import { useState, useCallback, useRef, useEffect } from 'react';
import { useTownStore } from '../hooks/useTownStore';

function cancelHoverClear() {
  if (typeof (window as any).__cancelHoverClear === 'function') {
    (window as any).__cancelHoverClear();
  }
}

export default function HUD() {
  return (
    <>
      <Header />
      <AboutLabel />
      <WalletSearch />
      <StatsBar />
      <MainframeConsole />
      <BuildingTooltip />
    </>
  );
}

// ── ABOUT LABEL ──

function AboutLabel() {
  const [show, setShow] = useState(false);

  return (
    <div style={styles.aboutContainer}>
      <span
        style={styles.aboutLabel}
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        ABOUT $CLAWDTOWN
      </span>
      {show && (
        <div style={styles.aboutTooltip}>
          <p style={styles.aboutText}>
            <strong style={{ color: '#00fff5' }}>$CLAWDTOWN</strong> is a living,
            evolving town built at the intersection of art and Claude AI. Every token
            holder is represented as a building — their trading activity, loyalty, and
            balance shape what gets built. The entire town is autonomously managed by
            Clawd: an AI agent that assigns plots, promotes buildings, rewards diamond
            hands, and punishes paper hands in real time. The result is an ever-changing
            on-chain artwork that grows and evolves with its community.
          </p>
        </div>
      )}
    </div>
  );
}

// ── HEADER ──

function Header() {
  const [copied, setCopied] = useState(false);
  const tokenMint = useTownStore((s) => s.tokenMint);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(tokenMint).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [tokenMint]);

  return (
    <div style={styles.header}>
      <div style={styles.titleRow}>
        <span style={styles.title}>EVOLVING CLAWD TOWN</span>
      </div>
      <div style={styles.caRow}>
        <span style={styles.caLabel}>CA:</span>
        <span style={styles.caAddress}>{tokenMint || '...'}</span>
        <button onClick={handleCopy} style={styles.copyBtn} title="Copy address">
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00fff5" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      </div>
      <div style={styles.linksRow}>
        <a href="https://x.com/i/communities/2026458921699889228" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
          X Community
        </a>
        <a href="https://x.com/ClawdTown_Sol" target="_blank" rel="noopener noreferrer" style={styles.linkBtn}>
          Official X
        </a>
      </div>
      <ConnectionStatus />
    </div>
  );
}

// ── WALLET SEARCH ──

function WalletSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ address: string; tier: number }[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Read wallets imperatively — no subscription, no re-renders from wallet updates
  const locateHouse = useTownStore((s) => s.locateHouse);

  const handleSearch = useCallback(
    (value: string) => {
      setQuery(value);
      if (value.length < 2) {
        setResults([]);
        setOpen(false);
        return;
      }
      const q = value.toLowerCase();
      const matches: { address: string; tier: number }[] = [];
      const wallets = useTownStore.getState().wallets;
      for (const [addr, w] of wallets) {
        if (addr.toLowerCase().includes(q)) {
          matches.push({ address: addr, tier: w.houseTier });
          if (matches.length >= 8) break;
        }
      }
      setResults(matches);
      setOpen(matches.length > 0);
    },
    [],
  );

  const handleSelect = useCallback(
    (address: string) => {
      setQuery('');
      setResults([]);
      setOpen(false);
      locateHouse?.(address);
    },
    [locateHouse],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && results.length > 0) {
        handleSelect(results[0].address);
      }
      if (e.key === 'Escape') {
        setQuery('');
        setResults([]);
        setOpen(false);
        inputRef.current?.blur();
      }
    },
    [results, handleSelect],
  );

  return (
    <div style={styles.searchContainer}>
      <div style={styles.searchBox}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00fff5" strokeWidth="2" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search wallet address..."
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          style={styles.searchInput}
        />
      </div>
      {open && (
        <div style={styles.dropdown}>
          {results.map((r) => (
            <button
              key={r.address}
              style={styles.dropdownItem}
              onMouseDown={() => handleSelect(r.address)}
            >
              <span style={styles.resultAddr}>
                {r.address.slice(0, 8)}...{r.address.slice(-6)}
              </span>
              <span style={styles.resultTier}>T{r.tier}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CONNECTION STATUS ──

function ConnectionStatus() {
  const connected = useTownStore((s) => s.connected);
  const reconnecting = useTownStore((s) => s.reconnecting);
  const [pulse, setPulse] = useState(true);

  useEffect(() => {
    const id = setInterval(() => setPulse((p) => !p), 800);
    return () => clearInterval(id);
  }, []);

  let color: string;
  let label: string;
  if (connected) {
    color = '#00ff88';
    label = 'LIVE';
  } else if (reconnecting) {
    color = '#ffaa44';
    label = 'RECONNECTING';
  } else {
    color = '#ff4466';
    label = 'OFFLINE';
  }

  return (
    <div style={styles.connectionStatus}>
      <span style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        display: 'inline-block',
        opacity: connected || reconnecting ? (pulse ? 1 : 0.3) : 1,
        boxShadow: `0 0 6px ${color}`,
        transition: 'opacity 0.3s',
      }} />
      <span style={{ ...styles.connectionLabel, color }}>{label}</span>
    </div>
  );
}

// ── STATS BAR ──

function StatsBar() {
  // Compute stats inside selector; custom equality prevents re-render when counts unchanged
  const stats = useTownStore(
    (s) => {
      let holders = 0;
      let builders = 0;
      for (const w of s.wallets.values()) {
        if (Number(w.tokenBalance) > 0) {
          holders++;
          if (w.buildProgress < 100) builders++;
        }
      }
      return { holders, builders };
    },
    (a, b) => a.holders === b.holders && a.builders === b.builders,
  );

  return (
    <div style={styles.statsBar}>
      <div style={styles.statItem}>
        <span style={styles.statLabel}>HOLDERS</span>
        <span style={styles.statValue}>{stats.holders}</span>
      </div>
      <span style={styles.statDivider}>|</span>
      <div style={styles.statItem}>
        <span style={styles.statLabel}>BUILDING</span>
        <span style={{ ...styles.statValue, color: stats.builders > 0 ? '#ffaa44' : '#556677' }}>
          {stats.builders}
        </span>
      </div>
    </div>
  );
}

// ── MAINFRAME CONSOLE ──

function ThinkingDots() {
  const [dotCount, setDotCount] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setDotCount((d) => (d + 1) % 4), 400);
    return () => clearInterval(id);
  }, []);

  return (
    <span style={{ color: '#00ff88', opacity: 0.5 }}>
      {'.'.repeat(dotCount)}
    </span>
  );
}

function MainframeConsole() {
  const lines = useTownStore((s) => s.consoleLines);
  const currentLine = lines.length > 0 ? lines[lines.length - 1] : '> Initializing...';

  return (
    <div style={styles.console}>
      <div style={styles.consoleHeader}>
        <div style={styles.consoleDots}>
          <span style={{ ...styles.dot, background: '#ff00c8' }} />
          <span style={{ ...styles.dot, background: '#00ff88' }} />
          <span style={{ ...styles.dot, background: '#00fff5' }} />
        </div>
        <span style={styles.consoleTitle}>CLAWD</span>
      </div>
      <div style={styles.consoleBody}>
        <div style={styles.consoleLine}>
          <span style={{ color: '#00ff88' }}>{currentLine}</span>
          <ThinkingDots />
        </div>
      </div>
    </div>
  );
}

// ── BUILDING TOOLTIP ──

const TIER_NAMES = ['Empty Plot', 'Data Node', 'Signal Relay', 'Processing Core', 'Network Hub', 'Megastructure'];

const TOKEN_DECIMALS = 6; // pump.fun tokens use 6 decimals

function formatBalance(balance: string): string {
  const raw = Number(balance);
  if (isNaN(raw) || raw === 0) return '0';
  const n = raw / 10 ** TOKEN_DECIMALS;
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  if (n >= 1) return n.toFixed(0);
  return n.toFixed(2);
}

function formatHoldTime(firstSeenAt?: string): string {
  if (!firstSeenAt) return '—';
  const ms = Date.now() - new Date(firstSeenAt).getTime();
  if (ms < 0) return '—';
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

function BuildingTooltip() {
  const hoveredHouse = useTownStore((s) => s.hoveredHouse);
  const hoverPos = useTownStore((s) => s.hoverPos);
  // Only subscribe to the specific hovered wallet, not the entire Map
  const w = useTownStore((s) => s.hoveredHouse ? s.wallets.get(s.hoveredHouse) ?? null : null);
  const [copied, setCopied] = useState(false);
  const [pinned, setPinned] = useState(false);
  const pinnedPos = useRef<{ x: number; y: number } | null>(null);
  const lastAddr = useRef<string | null>(null);

  // Reset copied state when hovering a different building
  if (hoveredHouse !== lastAddr.current) {
    lastAddr.current = hoveredHouse;
    if (copied) setCopied(false);
    if (!hoveredHouse) {
      setPinned(false);
      pinnedPos.current = null;
    }
  }

  const handleCopyAddr = useCallback(() => {
    if (!hoveredHouse) return;
    navigator.clipboard.writeText(hoveredHouse).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [hoveredHouse]);

  const handleMouseEnter = useCallback(() => {
    cancelHoverClear();
    setPinned(true);
    pinnedPos.current = hoverPos;
  }, [hoverPos]);

  const handleMouseLeave = useCallback(() => {
    setPinned(false);
    pinnedPos.current = null;
    useTownStore.getState().setHoveredHouse(null);
  }, []);

  if (!hoveredHouse || !hoverPos || !w) return null;

  const tier = Math.min(w.houseTier, 5);
  const tierName = TIER_NAMES[tier] ?? 'Unknown';
  const isBuilding = w.buildProgress < 100;

  // Use pinned position if mouse is on the tooltip, otherwise follow cursor
  const pos = pinned && pinnedPos.current ? pinnedPos.current : hoverPos;

  // Position tooltip offset from cursor, clamped to viewport
  const tooltipW = 240;
  const tooltipH = 160;
  let tx = pos.x + 16;
  let ty = pos.y - tooltipH / 2;
  if (tx + tooltipW > window.innerWidth - 8) tx = pos.x - tooltipW - 16;
  if (ty < 8) ty = 8;
  if (ty + tooltipH > window.innerHeight - 8) ty = window.innerHeight - tooltipH - 8;

  const accentHue = w.colorHue;
  const accentColor = `hsl(${accentHue}, 90%, 55%)`;
  const accentDim = `hsl(${accentHue}, 60%, 25%)`;

  return (
    <div
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        ...styles.tooltip,
        left: tx,
        top: ty,
        borderColor: accentDim,
        pointerEvents: 'auto',
      }}
    >
      {/* Header row */}
      <div style={styles.tooltipHeader}>
        <span style={{ ...styles.tooltipTier, color: accentColor, borderColor: accentDim }}>
          T{tier}
        </span>
        <span style={styles.tooltipTierName}>{tierName}</span>
        {isBuilding && <span style={styles.tooltipBuilding}>BUILDING</span>}
      </div>

      {/* Address with copy */}
      <div style={styles.tooltipAddrRow}>
        <span style={styles.tooltipAddr}>
          {hoveredHouse.slice(0, 6)}...{hoveredHouse.slice(-4)}
        </span>
        <button onClick={handleCopyAddr} style={styles.tooltipCopyBtn} title="Copy full address">
          {copied ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#556677" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      </div>

      {/* Stats grid */}
      <div style={styles.tooltipGrid}>
        <div style={styles.tooltipStat}>
          <span style={styles.tooltipStatLabel}>Balance</span>
          <span style={styles.tooltipStatValue}>{formatBalance(w.tokenBalance)}</span>
        </div>
        <div style={styles.tooltipStat}>
          <span style={styles.tooltipStatLabel}>Hold Time</span>
          <span style={styles.tooltipStatValue}>{formatHoldTime(w.firstSeenAt)}</span>
        </div>
        <div style={styles.tooltipStat}>
          <span style={styles.tooltipStatLabel}>Build</span>
          <span style={styles.tooltipStatValue}>{w.buildProgress.toFixed(0)}%</span>
        </div>
        <div style={styles.tooltipStat}>
          <span style={styles.tooltipStatLabel}>Damage</span>
          <span style={{
            ...styles.tooltipStatValue,
            color: w.damagePct > 50 ? '#ff4466' : w.damagePct > 20 ? '#ffaa44' : '#88ccaa',
          }}>
            {w.damagePct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Speed boost indicator */}
      {w.buildSpeedMult > 1 && (
        <div style={styles.tooltipBoost}>
          <span style={{ color: '#00ff88' }}>BOOST x{w.buildSpeedMult.toFixed(1)}</span>
        </div>
      )}
    </div>
  );
}

// ── STYLES ──

const styles: Record<string, React.CSSProperties> = {
  // About
  aboutContainer: {
    position: 'absolute',
    top: 14,
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: 15,
    pointerEvents: 'auto',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  aboutLabel: {
    fontFamily: '"Courier New", monospace',
    fontSize: 11,
    fontWeight: 700,
    color: '#00fff5',
    letterSpacing: 2,
    cursor: 'default',
    padding: '4px 12px',
    border: '1px solid rgba(0,255,245,0.3)',
    borderRadius: 4,
    background: 'rgba(10,14,20,0.85)',
    textShadow: '0 0 8px rgba(0,255,245,0.3)',
  },
  aboutTooltip: {
    marginTop: 8,
    width: 340,
    padding: '14px 16px',
    background: 'rgba(8,10,18,0.95)',
    border: '1px solid rgba(0,255,245,0.3)',
    borderRadius: 8,
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.6), 0 0 15px rgba(0,255,245,0.08)',
  },
  aboutText: {
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    lineHeight: '18px',
    color: '#99bbcc',
    margin: 0,
  },

  // Header
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    padding: '12px 20px 10px',
    background: 'linear-gradient(180deg, rgba(8,8,15,0.92) 0%, rgba(8,8,15,0.6) 80%, transparent 100%)',
    display: 'flex',
    flexDirection: 'column',
    gap: 4,
    pointerEvents: 'auto',
    zIndex: 10,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    justifyContent: 'space-between',
  },
  title: {
    fontFamily: '"Courier New", monospace',
    fontSize: 20,
    fontWeight: 700,
    color: '#00fff5',
    letterSpacing: 3,
    textShadow: '0 0 12px rgba(0,255,245,0.4), 0 0 24px rgba(0,255,245,0.15)',
  },
  caRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  caLabel: {
    fontFamily: '"Courier New", monospace',
    fontSize: 11,
    color: '#556677',
    fontWeight: 600,
  },
  caAddress: {
    fontFamily: '"Courier New", monospace',
    fontSize: 11,
    color: '#7799aa',
    letterSpacing: 0.5,
  },
  copyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '2px 4px',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.7,
  },

  // Links row
  linksRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  linkBtn: {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fontWeight: 600,
    color: '#00fff5',
    textDecoration: 'none',
    padding: '3px 8px',
    border: '1px solid rgba(0,255,245,0.3)',
    borderRadius: 4,
    background: 'rgba(0,255,245,0.06)',
    letterSpacing: 0.5,
    cursor: 'pointer',
  },

  // Connection status
  connectionStatus: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  connectionLabel: {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 1.5,
  },

  // Stats bar
  statsBar: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '8px 14px',
    background: 'rgba(10,14,20,0.92)',
    border: '1px solid rgba(0,255,245,0.2)',
    borderRadius: 8,
    pointerEvents: 'auto',
    zIndex: 10,
    backdropFilter: 'blur(6px)',
  },
  statItem: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: 2,
  },
  statLabel: {
    fontFamily: '"Courier New", monospace',
    fontSize: 8,
    fontWeight: 600,
    color: '#556677',
    letterSpacing: 1,
  },
  statValue: {
    fontFamily: '"Courier New", monospace',
    fontSize: 14,
    fontWeight: 700,
    color: '#00fff5',
    textShadow: '0 0 8px rgba(0,255,245,0.3)',
  },
  statDivider: {
    color: 'rgba(0,255,245,0.15)',
    fontSize: 16,
    userSelect: 'none' as const,
  },

  // Search
  searchContainer: {
    position: 'absolute',
    top: 12,
    right: 20,
    width: 260,
    zIndex: 20,
    pointerEvents: 'auto',
  },
  searchBox: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '7px 12px',
    background: 'rgba(10,14,20,0.9)',
    border: '1px solid rgba(0,255,245,0.25)',
    borderRadius: 6,
  },
  searchInput: {
    background: 'none',
    border: 'none',
    outline: 'none',
    color: '#cceeff',
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    width: '100%',
    caretColor: '#00fff5',
  },
  dropdown: {
    marginTop: 4,
    background: 'rgba(10,14,20,0.95)',
    border: '1px solid rgba(0,255,245,0.25)',
    borderRadius: 6,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    padding: '8px 12px',
    background: 'none',
    border: 'none',
    borderBottom: '1px solid rgba(0,255,245,0.08)',
    color: '#cceeff',
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    cursor: 'pointer',
    textAlign: 'left',
  },
  resultAddr: {
    color: '#99bbcc',
  },
  resultTier: {
    color: '#00fff5',
    fontSize: 10,
    fontWeight: 700,
    padding: '2px 6px',
    background: 'rgba(0,255,245,0.1)',
    borderRadius: 3,
  },

  // Mainframe console
  console: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    width: 380,
    background: 'rgba(10,14,20,0.92)',
    border: '1px solid rgba(0,255,136,0.25)',
    borderRadius: 8,
    overflow: 'hidden',
    pointerEvents: 'auto',
    zIndex: 10,
    display: 'flex',
    flexDirection: 'column',
  },
  consoleHeader: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 12px',
    background: 'rgba(12,20,32,0.9)',
    borderBottom: '1px solid rgba(0,255,136,0.15)',
    gap: 8,
    flexShrink: 0,
  },
  consoleDots: {
    display: 'flex',
    gap: 5,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: '50%',
    display: 'inline-block',
  },
  consoleTitle: {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    color: '#44ff88',
    letterSpacing: 1.5,
    flex: 1,
  },
  consoleBody: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 12px',
    scrollbarWidth: 'none',
  },
  consoleLine: {
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    lineHeight: '20px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },

  // Building tooltip
  tooltip: {
    position: 'absolute',
    width: 240,
    background: 'rgba(8,10,18,0.95)',
    border: '1px solid rgba(0,255,245,0.3)',
    borderRadius: 8,
    padding: '10px 14px',
    pointerEvents: 'none', // overridden to 'auto' when rendered
    zIndex: 50,
    backdropFilter: 'blur(8px)',
    boxShadow: '0 4px 20px rgba(0,0,0,0.6), 0 0 15px rgba(0,255,245,0.08)',
  },
  tooltipHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  tooltipTier: {
    fontFamily: '"Courier New", monospace',
    fontSize: 11,
    fontWeight: 700,
    padding: '2px 6px',
    border: '1px solid',
    borderRadius: 3,
  },
  tooltipTierName: {
    fontFamily: '"Courier New", monospace',
    fontSize: 12,
    fontWeight: 600,
    color: '#cceeff',
    flex: 1,
  },
  tooltipBuilding: {
    fontFamily: '"Courier New", monospace',
    fontSize: 9,
    fontWeight: 700,
    color: '#ffaa44',
    padding: '2px 5px',
    background: 'rgba(255,170,68,0.15)',
    borderRadius: 3,
    letterSpacing: 1,
  },
  tooltipAddrRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  tooltipAddr: {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    color: '#556677',
    letterSpacing: 0.5,
  },
  tooltipCopyBtn: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '1px 3px',
    display: 'flex',
    alignItems: 'center',
    opacity: 0.8,
  },
  tooltipGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '4px 12px',
  },
  tooltipStat: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '2px 0',
  },
  tooltipStatLabel: {
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    color: '#556677',
  },
  tooltipStatValue: {
    fontFamily: '"Courier New", monospace',
    fontSize: 11,
    fontWeight: 600,
    color: '#99ccdd',
  },
  tooltipBoost: {
    marginTop: 6,
    fontFamily: '"Courier New", monospace',
    fontSize: 10,
    fontWeight: 700,
    textAlign: 'center' as const,
    letterSpacing: 1,
  },
};
