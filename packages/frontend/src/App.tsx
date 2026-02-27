import { useState, useEffect } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import TownCanvas from './town/TownCanvas';
import HUD from './hud/HUD';
import AdminPage from './admin/AdminPage';
import ClawdBlog from './clawd/ClawdBlog';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export default function App() {
  const [page, setPage] = useState(window.location.hash);

  useEffect(() => {
    const onHashChange = () => setPage(window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useWebSocket(`${WS_URL}/ws`);

  if (page === '#clawd') return <ClawdBlog />;
  if (page === '#admin') return <AdminPage />;

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <TownCanvas />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <HUD />
      </div>
    </div>
  );
}
