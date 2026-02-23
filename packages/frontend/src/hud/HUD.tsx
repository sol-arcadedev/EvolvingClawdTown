import { useState, useCallback } from 'react';
import { useTownStore } from '../hooks/useTownStore';
import ActivityFeed from './ActivityFeed';
import Leaderboard from './Leaderboard';
import WalletSearch from './WalletSearch';
import HouseTooltip from './HouseTooltip';
import BottomBar from './BottomBar';
import { useIsMobile } from '../hooks/useIsMobile';

const TOKEN_MINT = import.meta.env.VITE_TOKEN_MINT || import.meta.env.VITE_TOKEN_CONTRACT || '6X9bV5KHtQXErDPXQ13NEYmjf8mzMuLiXk2qgV1xpump';

function CopyIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ verticalAlign: 'middle', marginLeft: 4, opacity: 0.6 }}
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function useCopyToast() {
  const [show, setShow] = useState(false);
  const copy = useCallback((text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setShow(true);
      setTimeout(() => setShow(false), 1500);
    });
  }, []);
  return { show, copy };
}

export default function HUD() {
  const connected = useTownStore((s) => s.connected);
  const walletCount = useTownStore((s) => s.wallets.size);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [walletSearchOpen, setWalletSearchOpen] = useState(false);
  const isMobile = useIsMobile();
  const { show: toastVisible, copy } = useCopyToast();

  const activeBuilders = useTownStore((s) => {
    let count = 0;
    for (const [, w] of s.wallets) {
      if (BigInt(w.tokenBalance) > 0n && w.buildProgress < 100) count++;
    }
    return count;
  });

  const displayMint = TOKEN_MINT;

  return (
    <>
      {/* Top Bar */}
      <div className={`top-bar${isMobile ? ' mobile' : ''}`}>
        {/* Left: logo + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 14 }}>
          <span className={`logo-text${isMobile ? ' mobile' : ''}`}>CLAUDE TOWN</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span className={`status-dot ${connected ? 'live' : 'offline'}`} />
            <span style={{ fontSize: 9, color: connected ? 'var(--green)' : 'var(--red)', letterSpacing: 1 }}>
              {connected ? 'LIVE' : 'OFFLINE'}
            </span>
          </div>
        </div>

        {/* Center: mint address + stats */}
        <div className="stats-row">
          <div
            className="contract-addr"
            onClick={() => copy(TOKEN_MINT)}
            title="Click to copy token mint address"
            style={{ display: 'flex', alignItems: 'center', gap: 2 }}
          >
            <span style={{ color: 'var(--text-dim)', marginRight: 2 }}>CA:</span>
            <span>{displayMint}</span>
            <CopyIcon />
          </div>
          {!isMobile && (
            <>
              <div>
                <span className="stat-label">Holders</span>
                <span className="stat-value">{walletCount}</span>
              </div>
              <div>
                <span className="stat-label">Building</span>
                <span className="stat-value" style={{ color: 'var(--green)' }}>{activeBuilders}</span>
              </div>
            </>
          )}
        </div>

        {/* Right: action buttons */}
        <div style={{ display: 'flex', gap: 6 }}>
          {!isMobile && (
            <button
              className={`btn-cyber${walletSearchOpen ? ' active' : ''}`}
              onClick={() => setWalletSearchOpen((o) => !o)}
            >
              SEARCH
            </button>
          )}
          <button className="btn-cyber" onClick={() => setLeaderboardOpen(true)}>
            {isMobile ? 'LB' : 'LEADERBOARD'}
          </button>
        </div>
      </div>

      {/* Mobile stats bar */}
      {isMobile && (
        <div className="mobile-stats-bar">
          <span>
            <span className="stat-label">Holders </span>
            <span className="stat-value">{walletCount}</span>
          </span>
          <span>
            <span className="stat-label">Building </span>
            <span className="stat-value" style={{ color: 'var(--green)' }}>{activeBuilders}</span>
          </span>
        </div>
      )}

      {/* Activity Feed — right side (desktop only) */}
      {!isMobile && <ActivityFeed />}

      {/* Wallet Search Panel — left side (desktop only) */}
      {!isMobile && walletSearchOpen && (
        <WalletSearch onClose={() => setWalletSearchOpen(false)} />
      )}

      {/* Leaderboard Modal */}
      <Leaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />

      {/* House Tooltip */}
      <HouseTooltip />

      {/* Bottom Bar (desktop only) */}
      {!isMobile && <BottomBar />}

      {/* Copy toast */}
      {toastVisible && <div className="copy-toast">Copied to clipboard</div>}
    </>
  );
}
