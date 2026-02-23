import { useTownStore } from '../hooks/useTownStore';
import { TradeEvent } from '../types';

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
  const color = isBuy ? 'var(--cyan)' : 'var(--pink)';
  const icon = isBuy ? '\u25B2' : '\u25BC';

  return (
    <div className="trade-entry">
      <span className="trade-icon" style={{ color }}>{icon}</span>
      <div className="trade-details">
        <div>
          <span style={{ color, fontWeight: 'bold', fontSize: 10 }}>
            {trade.eventType.toUpperCase().replace('_', ' ')}
          </span>
          {' '}
          <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
            {trade.walletAddress.slice(0, 4)}...{trade.walletAddress.slice(-4)}
          </span>
        </div>
        <div style={{ color: 'var(--text-dim)', fontSize: 9, marginTop: 1 }}>
          {formatAmount(trade.tokenAmountDelta)} tokens
        </div>
      </div>
      <span className="trade-time">{formatTime(trade.timestamp)}</span>
    </div>
  );
}

export default function ActivityFeed() {
  const recentTrades = useTownStore((s) => s.recentTrades);
  const displayed = recentTrades.slice(0, 8);

  return (
    <div className="activity-panel">
      <div className="activity-title">
        <span
          className="status-dot live"
          style={{ width: 5, height: 5 }}
        />
        Live Activity
      </div>
      <div className="activity-list">
        {displayed.length === 0 && (
          <div className="trade-entry" style={{ color: 'var(--text-dim)', justifyContent: 'center' }}>
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
