import { useState, useCallback } from 'react';
import { useTownStore } from '../hooks/useTownStore';

const TOKEN_MINT = import.meta.env.VITE_TOKEN_MINT || import.meta.env.VITE_TOKEN_MINT || '';
const PUMP_FUN_URL = TOKEN_MINT
  ? `https://pump.fun/coin/${TOKEN_MINT}`
  : 'https://pump.fun';

export default function BottomBar() {
  const connected = useTownStore((s) => s.connected);
  const [copied, setCopied] = useState(false);

  const copyContract = useCallback(() => {
    if (!TOKEN_MINT) return;
    navigator.clipboard.writeText(TOKEN_MINT).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, []);

  const truncated = TOKEN_MINT
    ? `${TOKEN_MINT.slice(0, 6)}...${TOKEN_MINT.slice(-4)}`
    : '';

  return (
    <div className="bottom-bar">
      {truncated && (
        <span
          className="contract-addr"
          onClick={copyContract}
          style={{ cursor: 'pointer' }}
          title="Click to copy"
        >
          {copied ? 'Copied!' : `CA: ${truncated}`}
        </span>
      )}

      <a href={PUMP_FUN_URL} target="_blank" rel="noopener noreferrer">
        pump.fun
      </a>

      <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span
          className={`status-dot ${connected ? 'live' : 'offline'}`}
          style={{ width: 5, height: 5 }}
        />
        <span style={{ fontSize: 9 }}>
          {connected ? 'Connected' : 'Disconnected'}
        </span>
      </span>
    </div>
  );
}
