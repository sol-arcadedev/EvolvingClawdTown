import { useWebSocket } from './hooks/useWebSocket';
import TownCanvas from './town/TownCanvas';
import HUD from './hud/HUD';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export default function App() {
  useWebSocket(`${WS_URL}/ws`);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <TownCanvas />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <HUD />
      </div>
    </div>
  );
}
