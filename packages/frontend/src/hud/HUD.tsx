import { useState, useCallback, useRef, useEffect } from 'react';
import { useTownStore } from '../hooks/useTownStore';
import { CURSOR_BLINK_SPEED } from '../town/constants';

const TOKEN_CA = 'TokenMintAddress111111111111111111111111111';

export default function HUD() {
  return (
    <>
      <Header />
      <WalletSearch />
      <MainframeConsole />
    </>
  );
}

// ── HEADER ──

function Header() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(TOKEN_CA).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  return (
    <div style={styles.header}>
      <div style={styles.titleRow}>
        <span style={styles.title}>EVOLVING CLAWD TOWN</span>
      </div>
      <div style={styles.caRow}>
        <span style={styles.caLabel}>CA:</span>
        <span style={styles.caAddress}>{TOKEN_CA.slice(0, 16)}...{TOKEN_CA.slice(-6)}</span>
        <button onClick={handleCopy} style={styles.copyBtn} title="Copy address">
          {copied ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00ff88" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#00fff5" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
          )}
        </button>
      </div>
    </div>
  );
}

// ── WALLET SEARCH ──

function WalletSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<{ address: string; tier: number }[]>([]);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const wallets = useTownStore((s) => s.wallets);
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
      for (const [addr, w] of wallets) {
        if (addr.toLowerCase().includes(q)) {
          matches.push({ address: addr, tier: w.houseTier });
          if (matches.length >= 8) break;
        }
      }
      setResults(matches);
      setOpen(matches.length > 0);
    },
    [wallets],
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

// ── MAINFRAME CONSOLE ──

function MainframeConsole() {
  const lines = useTownStore((s) => s.consoleLines);
  const [cursorVisible, setCursorVisible] = useState(true);
  const logRef = useRef<HTMLDivElement>(null);

  // Blink cursor
  useEffect(() => {
    const id = setInterval(() => setCursorVisible((v) => !v), CURSOR_BLINK_SPEED);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div style={styles.console}>
      <div style={styles.consoleHeader}>
        <div style={styles.consoleDots}>
          <span style={{ ...styles.dot, background: '#ff00c8' }} />
          <span style={{ ...styles.dot, background: '#00ff88' }} />
          <span style={{ ...styles.dot, background: '#00fff5' }} />
        </div>
        <span style={styles.consoleTitle}>MAINFRAME v3.0 — NEURAL CORE</span>
      </div>
      <div ref={logRef} style={styles.consoleBody}>
        {lines.map((line, i) => (
          <div key={i} style={styles.consoleLine}>
            <span style={{ color: '#00ff88' }}>{line}</span>
          </div>
        ))}
        <div style={styles.consoleLine}>
          <span style={{ color: '#00ff88', opacity: cursorVisible ? 1 : 0 }}>{'\u2588'}</span>
        </div>
      </div>
    </div>
  );
}

// ── STYLES ──

const styles: Record<string, React.CSSProperties> = {
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
    height: 280,
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
};
