import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import Redis from 'ioredis';
import { DB } from '../db/queries';

export interface WsMessage {
  type: 'snapshot' | 'wallet_update' | 'tick' | 'trade';
  [key: string]: any;
}

const HEARTBEAT_INTERVAL = 30000; // 30s ping
const CLIENT_TIMEOUT = 45000; // kill after 45s with no pong

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

export class TownWebSocketServer {
  private wss: WebSocketServer;
  private redisSub: Redis;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    server: HttpServer,
    private db: DB,
    redisUrl: string
  ) {
    this.wss = new WebSocketServer({ server, path: '/ws' });
    this.redisSub = new Redis(redisUrl);

    this.setupRedisSubscription();
    this.setupConnectionHandler();
    this.startHeartbeat();
  }

  private setupRedisSubscription(): void {
    this.redisSub.subscribe('town:updates', 'town:tick', 'town:trade');

    this.redisSub.on('message', (channel: string, message: string) => {
      let wsMessage: WsMessage;

      try {
        switch (channel) {
          case 'town:updates':
            wsMessage = { type: 'wallet_update', wallet: JSON.parse(message) };
            break;
          case 'town:tick':
            wsMessage = { type: 'tick', ...JSON.parse(message) };
            break;
          case 'town:trade':
            wsMessage = { type: 'trade', event: JSON.parse(message) };
            break;
          default:
            return;
        }
        this.broadcast(wsMessage);
      } catch (err) {
        console.error('Error processing Redis message:', err);
      }
    });

    this.redisSub.on('error', (err) => {
      console.error('Redis subscriber error:', err);
    });
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', async (ws: WebSocket) => {
      const extWs = ws as ExtWebSocket;
      extWs.isAlive = true;

      console.log(`WebSocket client connected (total: ${this.wss.clients.size})`);

      extWs.on('pong', () => {
        extWs.isAlive = true;
      });

      // Send full snapshot on connect
      try {
        const wallets = await this.db.getAllWallets();
        const snapshot: WsMessage = {
          type: 'snapshot',
          wallets: wallets.map((w) => ({
            address: w.address,
            tokenBalance: w.token_balance,
            plotX: w.plot_x,
            plotY: w.plot_y,
            houseTier: w.house_tier,
            buildProgress: parseFloat(w.build_progress),
            damagePct: parseFloat(w.damage_pct),
            buildSpeedMult: parseFloat(w.build_speed_mult),
            boostExpiresAt: w.boost_expires_at?.toISOString() ?? null,
            colorHue: w.color_hue,
          })),
        };
        extWs.send(JSON.stringify(snapshot));
      } catch (err) {
        console.error('Error sending snapshot:', err);
      }

      extWs.on('close', () => {
        console.log(`WebSocket client disconnected (total: ${this.wss.clients.size})`);
      });

      extWs.on('error', (err) => {
        console.error('WebSocket client error:', err);
      });
    });
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        const extWs = ws as ExtWebSocket;
        if (!extWs.isAlive) {
          extWs.terminate();
          return;
        }
        extWs.isAlive = false;
        extWs.ping();
      });
    }, HEARTBEAT_INTERVAL);
  }

  private broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  getClientCount(): number {
    return this.wss.clients.size;
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.redisSub.disconnect();
    this.wss.close();
  }
}
