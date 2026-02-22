import { useRef, useEffect } from 'react';
import { useTownStore } from '../hooks/useTownStore';
import { TradeEvent } from '../types';

const styles = {
  container: {
    position: 'absolute' as const,
    top: 56,
    right: 12,
    width: 220,
    maxHeight: 'calc(100vh - 80px)',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 4,
    zIndex: 10,
    pointerEvents: 'none' as const,
  },
  title: {
    fontSize: 10,
    fontWeight: 'bold' as const,
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: 1,
    marginBottom: 2,
  },
  list: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 3,
  },
  entry: {
    padding: '4px 8px',
    background: 'rgba(10, 10, 15, 0.85)',
    border: '1px solid #1a1a2e',
    borderRadius: 3,
    fontSize: 11,
    fontFamily: "'Courier New', monospace",
  },
};

function formatAmount(raw: string): string {
  const num = Math.abs(Number(raw));
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function TradeEntry({ trade }: { trade: TradeEvent }) {
  const isBuy = trade.eventType === 'buy' || trade.eventType === 'transfer_in';
  const color = isBuy ? '#00fff5' : '#ff0080';
  const label = trade.eventType.toUpperCase().replace('_', ' ');

  return (
    <div style={styles.entry}>
      <span style={{ color }}>{label}</span>
      {' '}
      <span style={{ color: '#888' }}>
        {trade.walletAddress.slice(0, 4)}...{trade.walletAddress.slice(-4)}
      </span>
      <br />
      <span style={{ color: '#555', fontSize: 10 }}>
        {formatAmount(trade.tokenAmountDelta)} tokens
        {' '}
        {formatTime(trade.timestamp)}
      </span>
    </div>
  );
}

export default function ActivityFeed() {
  const recentTrades = useTownStore((s) => s.recentTrades);
  const displayed = recentTrades.slice(0, 10);

  return (
    <div style={styles.container}>
      <div style={styles.title}>Live Activity</div>
      <div style={styles.list}>
        {displayed.length === 0 && (
          <div style={{ ...styles.entry, color: '#444' }}>
            Waiting for trades...
          </div>
        )}
        {displayed.map((trade, i) => (
          <TradeEntry key={`${trade.walletAddress}-${trade.timestamp}-${i}`} trade={trade} />
        ))}
      </div>
    </div>
  );
}
