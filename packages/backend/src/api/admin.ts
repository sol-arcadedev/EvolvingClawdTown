import { Router, Request, Response, NextFunction } from 'express';
import { DB } from '../db/queries';
import { TownWebSocketServer } from './ws';
import { ChainListener } from '../chain/listener';
import { TickRunner } from '../game/tick';
import { GameEvent } from '../game/engine';
import { DecisionQueue } from '../ai/decision-queue';
import { log } from '../utils/logger';

export interface AdminDeps {
  db: DB;
  wsServer: TownWebSocketServer;
  getChainListener: () => ChainListener | null;
  setChainListener: (cl: ChainListener | null) => void;
  tickRunner: TickRunner;
  handleGameEvent: (event: GameEvent) => void;
  seedHolders: (force?: boolean) => Promise<void>;
  seedClawdHQ: () => Promise<void>;
  decisionQueue: DecisionQueue;
  startedAt: number;
}

function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const password = req.headers['x-admin-password'] as string | undefined;
  if (!process.env.ADMIN_PASSWORD) {
    res.status(500).json({ error: 'ADMIN_PASSWORD not configured on server' });
    return;
  }
  if (!password || password !== process.env.ADMIN_PASSWORD) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const DRIP_DELAY_MS = 80;

// Abort controller for cancelling in-flight drip broadcasts
let activeDripAbort: AbortController | null = null;

async function broadcastWalletsDrip(deps: AdminDeps, tokenMint: string) {
  // Cancel any in-flight drip from a previous set-token/reseed
  if (activeDripAbort) {
    activeDripAbort.abort();
  }
  const abort = new AbortController();
  activeDripAbort = abort;

  const wallets = await deps.db.getAllWallets();

  // Clear the board first
  deps.wsServer.broadcastMessage({
    type: 'snapshot',
    wallets: [],
    consoleLines: [],
    tokenMint,
  });

  // Drip wallets in one by one in random order
  const shuffled = shuffle([...wallets]);
  for (const w of shuffled) {
    if (abort.signal.aborted) {
      log.info('[ADMIN] Drip broadcast cancelled');
      return;
    }
    deps.wsServer.broadcastMessage({
      type: 'wallet_update',
      wallet: {
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
        firstSeenAt: w.first_seen_at?.toISOString() ?? null,
        isNew: true,
      },
    });
    await new Promise((r) => setTimeout(r, DRIP_DELAY_MS));
  }
}

export function createAdminRouter(deps: AdminDeps): Router {
  const router = Router();
  router.use(authMiddleware);

  // Reset database
  router.post('/api/admin/reset-db', async (_req: Request, res: Response) => {
    try {
      await deps.db.resetAll();
      log.info('[ADMIN] Database reset');

      // Broadcast empty snapshot
      deps.wsServer.broadcastMessage({
        type: 'snapshot',
        wallets: [],
        consoleLines: [],
        tokenMint: process.env.TOKEN_MINT_ADDRESS ?? '',
      });

      res.json({ success: true, message: 'Database reset complete' });
    } catch (err) {
      log.error('[ADMIN] Reset DB failed:', err);
      res.status(500).json({ error: 'Failed to reset database' });
    }
  });

  // Change token CA
  router.post('/api/admin/set-token', async (req: Request, res: Response) => {
    const { mint } = req.body;
    if (!mint || typeof mint !== 'string') {
      res.status(400).json({ error: 'Missing or invalid mint address' });
      return;
    }

    try {
      // Stop existing chain listener
      const currentListener = deps.getChainListener();
      if (currentListener) {
        currentListener.stop();
        deps.setChainListener(null);
      }

      // Update env
      process.env.TOKEN_MINT_ADDRESS = mint;

      // Reset DB immediately
      await deps.db.resetAll();

      // Respond immediately — seed + chain listener run in background
      log.info(`[ADMIN] Token changed to ${mint}, seeding in background...`);
      res.json({ success: true, message: `Token changed to ${mint}. Seeding holders in background...` });

      // Background: seed, start chain listener, drip-feed
      (async () => {
        try {
          // Seed Clawd HQ at plot (0,0) before holders so (0,0) is taken
          await deps.seedClawdHQ();
          await deps.seedHolders(true);

          const rpcUrl = process.env.HELIUS_RPC_URL;
          if (rpcUrl) {
            const newListener = new ChainListener(rpcUrl, mint, deps.db, deps.handleGameEvent);
            await newListener.start();
            deps.setChainListener(newListener);
          }

          log.info(`[ADMIN] Seed complete for ${mint}`);
          await broadcastWalletsDrip(deps, mint);

          // Queue Clawd HQ first, then holder buildings
          deps.decisionQueue.queueClawdHQ();
          deps.decisionQueue.queueInitialBuildings();
        } catch (err) {
          log.error('[ADMIN] Background seed/listener failed:', err);
        }
      })();
    } catch (err) {
      log.error('[ADMIN] Set token failed:', err);
      res.status(500).json({ error: 'Failed to change token' });
    }
  });

  // Re-seed holders
  router.post('/api/admin/reseed', async (_req: Request, res: Response) => {
    try {
      await deps.seedClawdHQ();
      await deps.seedHolders(true);

      log.info('[ADMIN] Re-seed complete');
      res.json({ success: true, message: 'Re-seed complete' });

      // Drip-feed wallets one by one (after response sent)
      broadcastWalletsDrip(deps, process.env.TOKEN_MINT_ADDRESS ?? '').catch((err) =>
        log.error('[ADMIN] Drip broadcast failed:', err)
      );

      // Queue Clawd HQ first, then holder buildings
      deps.decisionQueue.queueClawdHQ();
      deps.decisionQueue.queueInitialBuildings();
    } catch (err) {
      log.error('[ADMIN] Re-seed failed:', err);
      res.status(500).json({ error: 'Failed to re-seed holders' });
    }
  });

  // Status
  router.get('/api/admin/status', async (_req: Request, res: Response) => {
    try {
      const stats = await deps.db.getStats();
      const chainListener = deps.getChainListener();
      const chainStats = chainListener?.getStats() ?? { subscriptionId: null, eventsProcessed: 0 };

      res.json({
        tokenMint: process.env.TOKEN_MINT_ADDRESS ?? '',
        holders: stats.totalHolders,
        activeBuilders: stats.activeBuilders,
        totalTrades: stats.totalTrades,
        chainListener: {
          active: chainListener !== null,
          subscriptionId: chainStats.subscriptionId,
          eventsProcessed: chainStats.eventsProcessed,
        },
        wsClients: deps.wsServer.getClientCount(),
        uptime: Math.floor((Date.now() - deps.startedAt) / 1000),
      });
    } catch (err) {
      log.error('[ADMIN] Status failed:', err);
      res.status(500).json({ error: 'Failed to get status' });
    }
  });

  return router;
}
