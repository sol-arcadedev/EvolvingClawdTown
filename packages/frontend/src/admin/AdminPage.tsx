import { useState, useEffect, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
const API_BASE = WS_URL.replace(/^ws(s?):\/\//, 'http$1://');

interface Status {
  tokenMint: string;
  holders: number;
  activeBuilders: number;
  totalTrades: number;
  chainListener: { active: boolean; subscriptionId: number | null; eventsProcessed: number };
  wsClients: number;
  uptime: number;
}

export default function AdminPage() {
  const [password, setPassword] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [status, setStatus] = useState<Status | null>(null);
  const [newMint, setNewMint] = useState('');
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [loading, setLoading] = useState('');

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    'x-admin-password': password,
  }), [password]);

  const showMsg = (text: string, error = false) => {
    setMessage({ text, error });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/status`, { headers: headers() });
      if (!res.ok) throw new Error(`${res.status}`);
      setStatus(await res.json());
    } catch {
      setStatus(null);
    }
  }, [headers]);

  const handleLogin = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/admin/status`, { headers: headers() });
      if (res.status === 401) {
        showMsg('Wrong password', true);
        return;
      }
      if (!res.ok) throw new Error(`${res.status}`);
      setLoggedIn(true);
      setStatus(await res.json());
    } catch (err: any) {
      showMsg(`Connection failed: ${err.message}`, true);
    }
  };

  useEffect(() => {
    if (!loggedIn) return;
    const interval = setInterval(fetchStatus, 10000);
    return () => clearInterval(interval);
  }, [loggedIn, fetchStatus]);

  const handleResetDb = async () => {
    if (!confirm('This will delete ALL data (wallets, plots, trades). Continue?')) return;
    setLoading('reset');
    try {
      const res = await fetch(`${API_BASE}/api/admin/reset-db`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg(data.message);
      await fetchStatus();
    } catch (err: any) {
      showMsg(err.message, true);
    }
    setLoading('');
  };

  const handleSetToken = async () => {
    if (!newMint.trim()) return;
    if (!confirm(`Change token to ${newMint}? This will reset the DB and re-seed.`)) return;
    setLoading('token');
    try {
      const res = await fetch(`${API_BASE}/api/admin/set-token`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ mint: newMint.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg(data.message);
      setNewMint('');
      await fetchStatus();
    } catch (err: any) {
      showMsg(err.message, true);
    }
    setLoading('');
  };

  const handleReseed = async () => {
    if (!confirm('Re-seed holders from Helius? This fetches all current token holders.')) return;
    setLoading('reseed');
    try {
      const res = await fetch(`${API_BASE}/api/admin/reseed`, { method: 'POST', headers: headers() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      showMsg(data.message);
      await fetchStatus();
    } catch (err: any) {
      showMsg(err.message, true);
    }
    setLoading('');
  };

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  };

  const s: Record<string, React.CSSProperties> = {
    page: {
      minHeight: '100vh', background: '#0a0a0f', color: '#e0e0e0',
      fontFamily: 'monospace', padding: 32, boxSizing: 'border-box',
    },
    card: {
      background: '#14141f', border: '1px solid #2a2a3a', borderRadius: 8,
      padding: 20, marginBottom: 16,
    },
    title: { fontSize: 24, fontWeight: 'bold', color: '#00ffcc', marginBottom: 24 },
    label: { fontSize: 12, color: '#888', textTransform: 'uppercase' as const, marginBottom: 4 },
    value: { fontSize: 18, fontWeight: 'bold', color: '#fff', marginBottom: 12 },
    input: {
      background: '#1a1a2e', border: '1px solid #333', borderRadius: 4,
      color: '#fff', padding: '8px 12px', fontSize: 14, outline: 'none',
      width: '100%', boxSizing: 'border-box' as const,
    },
    btn: {
      padding: '10px 20px', border: 'none', borderRadius: 4, cursor: 'pointer',
      fontFamily: 'monospace', fontSize: 14, fontWeight: 'bold',
    },
    btnPrimary: { background: '#00cc99', color: '#000' },
    btnDanger: { background: '#cc3344', color: '#fff' },
    btnBlue: { background: '#3366cc', color: '#fff' },
    msg: { padding: '10px 16px', borderRadius: 4, marginBottom: 16, fontSize: 13 },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 },
  };

  if (!loggedIn) {
    return (
      <div style={s.page}>
        <div style={{ maxWidth: 400, margin: '80px auto' }}>
          <div style={s.title}>Claude Town Admin</div>
          <div style={s.card}>
            <div style={s.label}>Password</div>
            <input
              type="password"
              style={{ ...s.input, marginBottom: 16 }}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              placeholder="Enter admin password"
              autoFocus
            />
            <button style={{ ...s.btn, ...s.btnPrimary, width: '100%' }} onClick={handleLogin}>
              Login
            </button>
          </div>
          {message && (
            <div style={{ ...s.msg, background: message.error ? '#331111' : '#113311', color: message.error ? '#ff6666' : '#66ff66' }}>
              {message.text}
            </div>
          )}
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <a href="#" style={{ color: '#666', fontSize: 12 }}>← Back to Town</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={{ maxWidth: 700, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div style={s.title}>Claude Town Admin</div>
          <a href="#" style={{ color: '#666', fontSize: 13 }}>← Back to Town</a>
        </div>

        {message && (
          <div style={{ ...s.msg, background: message.error ? '#331111' : '#113311', color: message.error ? '#ff6666' : '#66ff66' }}>
            {message.text}
          </div>
        )}

        {/* Status */}
        <div style={s.card}>
          <div style={{ ...s.label, marginBottom: 12 }}>Server Status</div>
          {status ? (
            <div style={s.grid}>
              <div>
                <div style={s.label}>Token CA</div>
                <div style={{ ...s.value, fontSize: 11, wordBreak: 'break-all' }}>{status.tokenMint || '—'}</div>
              </div>
              <div>
                <div style={s.label}>Holders</div>
                <div style={s.value}>{status.holders}</div>
              </div>
              <div>
                <div style={s.label}>Builders</div>
                <div style={s.value}>{status.activeBuilders}</div>
              </div>
              <div>
                <div style={s.label}>Trades</div>
                <div style={s.value}>{status.totalTrades}</div>
              </div>
              <div>
                <div style={s.label}>Chain Listener</div>
                <div style={{ ...s.value, color: status.chainListener.active ? '#66ff66' : '#ff6666' }}>
                  {status.chainListener.active ? 'Active' : 'Inactive'}
                </div>
              </div>
              <div>
                <div style={s.label}>WS Clients</div>
                <div style={s.value}>{status.wsClients}</div>
              </div>
              <div>
                <div style={s.label}>Events</div>
                <div style={s.value}>{status.chainListener.eventsProcessed}</div>
              </div>
              <div>
                <div style={s.label}>Uptime</div>
                <div style={s.value}>{formatUptime(status.uptime)}</div>
              </div>
            </div>
          ) : (
            <div style={{ color: '#666' }}>Loading...</div>
          )}
        </div>

        {/* Change Token */}
        <div style={s.card}>
          <div style={{ ...s.label, marginBottom: 8 }}>Change Token CA</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...s.input, flex: 1 }}
              value={newMint}
              onChange={(e) => setNewMint(e.target.value)}
              placeholder="New mint address..."
            />
            <button
              style={{ ...s.btn, ...s.btnPrimary, opacity: loading === 'token' ? 0.5 : 1 }}
              onClick={handleSetToken}
              disabled={!!loading}
            >
              {loading === 'token' ? 'Changing...' : 'Set Token'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={s.card}>
          <div style={{ ...s.label, marginBottom: 12 }}>Actions</div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              style={{ ...s.btn, ...s.btnBlue, opacity: loading === 'reseed' ? 0.5 : 1 }}
              onClick={handleReseed}
              disabled={!!loading}
            >
              {loading === 'reseed' ? 'Re-seeding...' : 'Re-seed Holders'}
            </button>
            <button
              style={{ ...s.btn, ...s.btnDanger, opacity: loading === 'reset' ? 0.5 : 1 }}
              onClick={handleResetDb}
              disabled={!!loading}
            >
              {loading === 'reset' ? 'Resetting...' : 'Reset Database'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
