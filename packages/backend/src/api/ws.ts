import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import zlib from 'zlib';
import Redis from 'ioredis';
import { DB } from '../db/queries';
import { log } from '../utils/logger';
import { TownState, createTownSnapshot } from '../town-sim/index';

export interface WsMessage {
  type: 'snapshot' | 'wallet_update' | 'tick' | 'trade' | 'console_line'
    | 'clawd_decision' | 'building_image_update'
    | 'town_snapshot' | 'building_placed' | 'road_added' | 'district_grown';
  [key: string]: any;
}

const HEARTBEAT_INTERVAL = 30000; // 30s ping
const CLIENT_TIMEOUT = 45000; // kill after 45s with no pong

interface ExtWebSocket extends WebSocket {
  isAlive: boolean;
}

export class TownWebSocketServer {
  private wss: WebSocketServer;
  private redisSub: Redis | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private consoleLines: string[] = [];
  private getTownState: () => TownState | null;

  constructor(
    server: HttpServer,
    private db: DB,
    redisUrl: string | null,
    getTownState: () => TownState | null = () => null,
  ) {
    this.getTownState = getTownState;
    this.wss = new WebSocketServer({ server, path: '/ws' });

    if (redisUrl) {
      this.setupRedisSubscription(redisUrl);
    }
    this.setupConnectionHandler();
    this.startHeartbeat();
  }

  private setupRedisSubscription(redisUrl: string): void {
    try {
      this.redisSub = new Redis(redisUrl, {
        retryStrategy: (times) => {
          if (times > 3) return null; // stop retrying
          return Math.min(times * 500, 3000);
        },
        maxRetriesPerRequest: 1,
        lazyConnect: true,
      });

      this.redisSub.on('error', (err) => {
        log.warn('Redis subscriber unavailable, running without pub/sub');
        this.redisSub?.disconnect();
        this.redisSub = null;
      });

      this.redisSub.connect().then(() => {
        this.redisSub?.subscribe('town:updates', 'town:tick', 'town:trade', 'town:console', 'town:clawd_decision', 'town:building_image');
        log.info('Redis pub/sub connected');
      }).catch(() => {
        log.warn('Redis connection failed, running without pub/sub');
        this.redisSub = null;
      });

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
            case 'town:console': {
              const parsed = JSON.parse(message);
              this.consoleLines.push(parsed.line);
              if (this.consoleLines.length > 14) this.consoleLines = this.consoleLines.slice(-14);
              wsMessage = { type: 'console_line', line: parsed.line };
              break;
            }
            case 'town:clawd_decision':
              wsMessage = { type: 'clawd_decision', ...JSON.parse(message) };
              break;
            case 'town:building_image':
              wsMessage = { type: 'building_image_update', ...JSON.parse(message) };
              break;
            default:
              return;
          }
          this.broadcast(wsMessage);
        } catch (err) {
          log.error('Error processing Redis message:', err);
        }
      });
    } catch {
      log.warn('Redis setup failed, running without pub/sub');
      this.redisSub = null;
    }
  }

  private setupConnectionHandler(): void {
    this.wss.on('connection', async (ws: WebSocket) => {
      const extWs = ws as ExtWebSocket;
      extWs.isAlive = true;

      log.info(`WebSocket client connected (total: ${this.wss.clients.size})`);

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
            firstSeenAt: w.first_seen_at.toISOString(),
            customImageUrl: w.custom_image_url ?? null,
            buildingName: w.building_name ?? null,
            architecturalStyle: w.architectural_style ?? null,
            clawdComment: w.clawd_comment ?? null,
          })),
          consoleLines: this.consoleLines,
          tokenMint: process.env.TOKEN_MINT_ADDRESS ?? '',
        };
        extWs.send(JSON.stringify(snapshot));

        // Send town tilemap snapshot (binary, gzipped)
        const state = this.getTownState();
        if (state) {
          const townSnap = createTownSnapshot(state);
          const tilemapGz = zlib.gzipSync(townSnap.tilemap);
          const townMsg = JSON.stringify({
            type: 'town_snapshot',
            width: townSnap.width,
            height: townSnap.height,
            buildings: townSnap.buildings,
            decorations: townSnap.decorations,
            seed: townSnap.seed,
            tilemapSize: townSnap.tilemap.length,
          });
          extWs.send(townMsg);
          extWs.send(tilemapGz);
          log.debug(`Sent town snapshot: ${tilemapGz.length} bytes (gzipped from ${townSnap.tilemap.length})`);
        }
      } catch (err) {
        log.error('Error sending snapshot:', err);
      }

      // Handle incoming messages — relay broadcasts from internal tools (e.g. simulator)
      extWs.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'relay' && msg.payload) {
            this.broadcastToOthers(extWs, msg.payload);
          }
        } catch {
          // Ignore malformed messages
        }
      });

      extWs.on('close', () => {
        log.info(`WebSocket client disconnected (total: ${this.wss.clients.size})`);
      });

      extWs.on('error', (err) => {
        log.error('WebSocket client error:', err);
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

  /** Broadcast directly (used when Redis is unavailable) */
  broadcastMessage(message: WsMessage): void {
    this.broadcast(message);
  }

  private broadcast(message: WsMessage): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /** Broadcast to all clients except the sender */
  private broadcastToOthers(sender: WebSocket, message: WsMessage): void {
    const data = JSON.stringify(message);
    this.wss.clients.forEach((client) => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  /** Push a console line to all clients and store it for new connections */
  pushConsoleLine(line: string): void {
    this.consoleLines.push(line);
    if (this.consoleLines.length > 14) {
      this.consoleLines = this.consoleLines.slice(-14);
    }
    this.broadcast({ type: 'console_line', line });
  }

  /** Re-send full gzipped tilemap to all connected clients */
  broadcastTilemapUpdate(): void {
    const state = this.getTownState();
    if (!state) return;

    const townSnap = createTownSnapshot(state);
    const tilemapGz = zlib.gzipSync(townSnap.tilemap);
    const townMsg = JSON.stringify({
      type: 'town_snapshot',
      width: townSnap.width,
      height: townSnap.height,
      buildings: townSnap.buildings,
      decorations: townSnap.decorations,
      seed: townSnap.seed,
      tilemapSize: townSnap.tilemap.length,
    });

    this.wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(townMsg);
        client.send(tilemapGz);
      }
    });

    log.debug(`Broadcast tilemap update: ${tilemapGz.length} bytes to ${this.wss.clients.size} clients`);
  }

  /** Terminate all connected clients so they reconnect fresh */
  disconnectAllClients(): void {
    for (const client of this.wss.clients) {
      client.terminate();
    }
    log.info(`Disconnected all WebSocket clients`);
  }

  getClientCount(): number {
    return this.wss.clients.size;
  }

  async close(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.redisSub?.disconnect();
    this.wss.close();
  }
}
