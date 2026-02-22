import { useState } from 'react';
import { useTownStore } from '../hooks/useTownStore';
import ActivityFeed from './ActivityFeed';
import Leaderboard from './Leaderboard';
import { useIsMobile } from '../hooks/useIsMobile';

export default function HUD() {
  const connected = useTownStore((s) => s.connected);
  const walletCount = useTownStore((s) => s.wallets.size);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const isMobile = useIsMobile();

  const activeBuilders = useTownStore((s) => {
    let count = 0;
    for (const [, w] of s.wallets) {
      if (BigInt(w.tokenBalance) > 0n && w.buildProgress < 100) count++;
    }
    return count;
  });

  return (
    <>
      {/* Top Bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: isMobile ? 40 : 44,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: isMobile ? '0 8px' : '0 16px',
          background: 'rgba(10, 10, 15, 0.9)',
          borderBottom: '1px solid #1a1a2e',
          fontFamily: "'Courier New', monospace",
          fontSize: isMobile ? 10 : 12,
          zIndex: 20,
        }}
      >
        {/* Left: title + status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 12 }}>
          <span style={{ fontWeight: 'bold', color: '#00fff5', fontSize: isMobile ? 12 : 14 }}>
            CLAUDE TOWN
          </span>
          <span style={{ color: connected ? '#0f0' : '#f44', fontSize: 10 }}>
            {connected ? 'LIVE' : 'OFFLINE'}
          </span>
        </div>

        {/* Center: stats (hidden on very small screens) */}
        {!isMobile && (
          <div style={{ display: 'flex', gap: 20, color: '#888' }}>
            <div>
              <span style={{ color: '#555' }}>Holders </span>
              <span style={{ color: '#ccc' }}>{walletCount}</span>
            </div>
            <div>
              <span style={{ color: '#555' }}>Building </span>
              <span style={{ color: '#00ff88' }}>{activeBuilders}</span>
            </div>
          </div>
        )}

        {/* Right: leaderboard */}
        <button
          onClick={() => setLeaderboardOpen(true)}
          style={{
            padding: isMobile ? '4px 8px' : '6px 12px',
            background: 'transparent',
            border: '1px solid #333',
            color: '#888',
            fontFamily: "'Courier New', monospace",
            fontSize: 10,
            cursor: 'pointer',
            borderRadius: 3,
          }}
        >
          {isMobile ? 'LB' : 'LEADERBOARD'}
        </button>
      </div>

      {/* Activity Feed — right side (hidden on mobile) */}
      {!isMobile && <ActivityFeed />}

      {/* Leaderboard Modal */}
      <Leaderboard open={leaderboardOpen} onClose={() => setLeaderboardOpen(false)} />

      {/* Mobile stats bar */}
      {isMobile && (
        <div
          style={{
            position: 'absolute',
            top: 40,
            left: 0,
            right: 0,
            display: 'flex',
            justifyContent: 'center',
            gap: 16,
            padding: '4px 0',
            background: 'rgba(10, 10, 15, 0.8)',
            borderBottom: '1px solid #111',
            fontSize: 10,
            fontFamily: "'Courier New', monospace",
            color: '#888',
            zIndex: 15,
          }}
        >
          <span>
            <span style={{ color: '#555' }}>Holders </span>
            <span style={{ color: '#ccc' }}>{walletCount}</span>
          </span>
          <span>
            <span style={{ color: '#555' }}>Building </span>
            <span style={{ color: '#00ff88' }}>{activeBuilders}</span>
          </span>
        </div>
      )}

      {/* Zoom hint — bottom right (desktop only) */}
      {!isMobile && (
        <div
          style={{
            position: 'absolute',
            bottom: 12,
            right: 12,
            padding: '6px 10px',
            background: 'rgba(10, 10, 15, 0.7)',
            border: '1px solid #1a1a2e',
            borderRadius: 4,
            fontSize: 11,
            color: '#444',
            pointerEvents: 'none',
            zIndex: 10,
            fontFamily: "'Courier New', monospace",
          }}
        >
          Drag to pan / Scroll to zoom
        </div>
      )}
    </>
  );
}
