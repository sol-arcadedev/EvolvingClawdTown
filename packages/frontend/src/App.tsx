import TownMap from './town/TownMap';
import HUD from './hud/HUD';
import { useWebSocket } from './hooks/useWebSocket';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';

export default function App() {
  useWebSocket(`${WS_URL}/ws`);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <TownMap />
      <HUD />
    </div>
  );
}
