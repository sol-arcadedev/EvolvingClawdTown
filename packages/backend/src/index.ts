import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import http from 'http';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { DB } from './db/queries';
import { GameEngine, GameEvent } from './game/engine';
import { getTier, walletPctOfSupply, colorHueFromAddress } from './game/rules';
import { TickRunner } from './game/tick';
import { ChainListener } from './chain/listener';
import { createRestRouter } from './api/rest';
import { createAdminRouter } from './api/admin';
import { TownWebSocketServer } from './api/ws';
import { log } from './utils/logger';
import { DecisionQueue, DecisionResult } from './ai/decision-queue';
import { isAIEnabled } from './ai/clawd-agent';
import { CLAWD_HQ_ADDRESS } from './constants';

interface HeliusTokenAccount {
  address: string;
  owner: string;
  amount: number;
}

async function seedHolders(db: DB, force = false) {
  const stats = await db.getStats();
  if (!force && stats.totalHolders > 0) return;

  const apiKey = process.env.HELIUS_API_KEY;
  const mint = process.env.TOKEN_MINT_ADDRESS;
  if (!apiKey || !mint || mint === 'your_pump_fun_token_mint_pubkey') {
    log.warn('Skipping holder seed — HELIUS_API_KEY or TOKEN_MINT_ADDRESS not configured');
    return;
  }

  log.info('DB is empty — seeding holders from Helius...');

  // Fetch all token accounts (paginated)
  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  let page = 1;
  let allAccounts: HeliusTokenAccount[] = [];

  while (true) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `holders-${page}`,
        method: 'getTokenAccounts',
        params: { mint, page, limit: 1000 },
      }),
    });

    const data = (await response.json()) as any;
    if (data.error) {
      log.error('Helius API error during seed:', data.error);
      return;
    }

    const accounts: HeliusTokenAccount[] = data.result?.token_accounts || [];
    if (accounts.length === 0) break;

    allAccounts = allAccounts.concat(accounts);
    log.info(`  Page ${page}: ${accounts.length} accounts (total: ${allAccounts.length})`);
    page++;

    await new Promise((r) => setTimeout(r, 200));
  }

  // Deduplicate by owner, sum balances, filter zero
  const ownerMap = new Map<string, bigint>();
  for (const h of allAccounts) {
    const amount = BigInt(h.amount);
    if (amount <= 0n) continue;
    ownerMap.set(h.owner, (ownerMap.get(h.owner) || 0n) + amount);
  }

  let totalSupply = 0n;
  for (const balance of ownerMap.values()) totalSupply += balance;

  // Filter dust wallets (bots/snipers who already dumped)
  const MIN_SEED_PCT = parseFloat(process.env.MIN_SEED_PCT || '0.01');
  const minBalance = totalSupply * BigInt(Math.round(MIN_SEED_PCT * 100)) / 10000n;
  let filteredCount = 0;
  for (const [owner, balance] of ownerMap) {
    if (balance < minBalance) {
      ownerMap.delete(owner);
      filteredCount++;
    }
  }
  if (filteredCount > 0) {
    log.info(`Filtered ${filteredCount} dust wallets (< ${MIN_SEED_PCT}% of supply)`);
  }

  // Sort by balance descending — whales get central plots
  const sorted = [...ownerMap.entries()].sort((a, b) =>
    b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0
  );

  log.info(`Seeding ${sorted.length} holders (supply: ${totalSupply})...`);

  let created = 0;
  for (const [ownerAddress, balance] of sorted) {
    const pct = walletPctOfSupply(balance, totalSupply);
    const tier = getTier(pct);
    const hue = colorHueFromAddress(ownerAddress);
    const plot = await db.getNextPlotForTier(tier);
    await db.createWallet(ownerAddress, balance, plot.x, plot.y, tier, hue);
    // Existing holders are already established — mark buildings as fully built
    await db.updateWallet(ownerAddress, { build_progress: 100 });
    created++;
    if (created % 50 === 0) log.info(`  Seeded ${created} / ${sorted.length} wallets...`);
  }

  log.info(`Seed complete — created ${created} wallets`);
}

async function seedClawdHQ(db: DB) {
  const existing = await db.getWallet(CLAWD_HQ_ADDRESS);
  if (existing) return;

  log.info('Seeding Clawd Architect HQ at plot (0,0)...');
  await db.createWallet(CLAWD_HQ_ADDRESS, 0n, 0, 0, 5, 180);
  await db.updateWallet(CLAWD_HQ_ADDRESS, { build_progress: 100 });
  log.info('Clawd HQ wallet created');
}

const startedAt = Date.now();

async function main() {
  const PORT = parseInt(process.env.PORT || '3001');
  const TICK_INTERVAL = parseInt(process.env.TICK_INTERVAL_MS || '30000');

  // Database
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on('error', (err) => log.error('Unexpected PG pool error', err));
  const db = new DB(pool);

  // Redis (optional — for multi-instance pub/sub)
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  let redisPub: Redis | null = null;

  try {
    const redis = new Redis(redisUrl, {
      retryStrategy: (times) => {
        if (times > 3) return null;
        return Math.min(times * 500, 3000);
      },
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    redis.on('error', () => {}); // suppress unhandled error events
    await redis.connect();
    redisPub = redis;
    log.info('Redis publisher connected');
  } catch {
    log.warn('Redis unavailable — running without pub/sub (single-instance mode)');
    redisPub = null;
  }

  // Game engine
  const engine = new GameEngine(db);

  // AI Decision Queue
  const decisionQueue = new DecisionQueue(db);

  // Express app
  const app = express();
  const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin.includes(',') ? corsOrigin.split(',').map(s => s.trim()) : corsOrigin }));
  app.use(express.json());

  // Request logging
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (req.path !== '/api/health' && req.path !== '/api/metrics') {
      log.debug(`${req.method} ${req.path}`);
    }
    next();
  });

  app.use(createRestRouter(db));

  // Admin router (mounted after services are ready, see below)

  // HTTP server
  const server = http.createServer(app);

  // WebSocket server (pass null redisUrl if Redis failed)
  const wsServer = new TownWebSocketServer(server, db, redisPub ? redisUrl : null);

  // AI Progress callback — stream Clawd's thinking to the console
  decisionQueue.setOnProgress((line) => {
    wsServer.pushConsoleLine(line);
  });

  // AI Decision callback — broadcast Clawd decisions to all clients
  decisionQueue.setOnDecision(async (result: DecisionResult) => {
    try {
      // Push Clawd's comment to the console
      wsServer.pushConsoleLine(`> ${result.decision.clawd_comment}`);

      // Broadcast the decision (full data for blog page + minimal for canvas)
      wsServer.broadcastMessage({
        type: 'clawd_decision',
        walletAddress: result.walletAddress,
        buildingName: result.decision.building_name,
        architecturalStyle: result.decision.architectural_style,
        clawdComment: result.decision.clawd_comment,
        decision: result.decision,
        eventType: result.eventType,
        holderProfile: result.holderProfile,
        imageUrl: result.imageUrl,
      });

      // If an image was generated, broadcast that too
      if (result.imageUrl) {
        wsServer.broadcastMessage({
          type: 'building_image_update',
          walletAddress: result.walletAddress,
          imageUrl: result.imageUrl,
          buildingName: result.decision.building_name,
        });
      }
    } catch (err) {
      log.error('Error broadcasting AI decision:', err);
    }
  });

  // Helper: publish via Redis if available, otherwise broadcast directly
  const publish = async (channel: string, data: string) => {
    if (redisPub) {
      await redisPub.publish(channel, data);
    } else {
      // Broadcast directly to WebSocket clients
      try {
        const parsed = JSON.parse(data);
        switch (channel) {
          case 'town:updates':
            wsServer.broadcastMessage({ type: 'wallet_update', wallet: parsed });
            break;
          case 'town:tick':
            wsServer.broadcastMessage({ type: 'tick', ...parsed });
            break;
          case 'town:trade':
            wsServer.broadcastMessage({ type: 'trade', event: parsed });
            break;
          case 'town:clawd_decision':
            wsServer.broadcastMessage({ type: 'clawd_decision', ...parsed });
            break;
          case 'town:building_image':
            wsServer.broadcastMessage({ type: 'building_image_update', ...parsed });
            break;
        }
      } catch (err) {
        log.error('Error broadcasting message:', err);
      }
    }
  };

  // Chain listener
  let chainListener: ChainListener | null = null;
  const mintAddress = process.env.TOKEN_MINT_ADDRESS;
  const rpcUrl = process.env.HELIUS_RPC_URL;

  // Event handler — called by chain listener
  const handleGameEvent = async (event: GameEvent) => {
    try {
      const result = await engine.processEvent(event);
      if (!result) return;

      await publish(
        'town:updates',
        JSON.stringify({
          address: result.walletRow.address,
          tokenBalance: result.walletRow.token_balance,
          plotX: result.walletRow.plot_x,
          plotY: result.walletRow.plot_y,
          houseTier: result.walletRow.house_tier,
          buildProgress: parseFloat(result.walletRow.build_progress),
          damagePct: parseFloat(result.walletRow.damage_pct),
          buildSpeedMult: parseFloat(result.walletRow.build_speed_mult),
          boostExpiresAt: result.walletRow.boost_expires_at?.toISOString() ?? null,
          colorHue: result.walletRow.color_hue,
          firstSeenAt: result.walletRow.first_seen_at?.toISOString() ?? null,
          isNew: result.isNew,
          customImageUrl: result.walletRow.custom_image_url ?? null,
          buildingName: result.walletRow.building_name ?? null,
          architecturalStyle: result.walletRow.architectural_style ?? null,
          clawdComment: result.walletRow.clawd_comment ?? null,
        })
      );

      await publish(
        'town:trade',
        JSON.stringify({
          walletAddress: event.walletAddress,
          eventType: event.type,
          tokenAmountDelta: event.tokenAmountDelta.toString(),
          timestamp: event.timestamp.toISOString(),
        })
      );

      log.info(
        `[${event.type.toUpperCase()}] ${event.walletAddress.slice(0, 8)}... | ` +
          `tier=${result.walletState.house_tier} build=${result.walletState.build_progress}% ` +
          `dmg=${result.walletState.damage_pct}%`
      );

      // Queue AI decision (async, non-blocking)
      if (isAIEnabled()) {
        const totalSupply = await db.getTotalSupply();
        decisionQueue.enqueue({
          walletAddress: event.walletAddress,
          eventType: event.type,
          isNewHolder: result.isNew,
          walletRow: result.walletRow,
          totalSupply,
          tokenAmountDelta: event.tokenAmountDelta,
        });
      }
    } catch (err) {
      log.error('Error processing game event', err);
    }
  };

  if (mintAddress && rpcUrl && mintAddress !== 'your_pump_fun_token_mint_pubkey') {
    chainListener = new ChainListener(rpcUrl, mintAddress, db, handleGameEvent);
    await chainListener.start();
  } else {
    log.warn('TOKEN_MINT_ADDRESS not configured — chain listener disabled');
  }

  // Metrics endpoint
  app.get('/api/metrics', async (_req: Request, res: Response) => {
    try {
      const stats = await db.getStats();
      const chainStats = chainListener?.getStats() ?? { subscriptionId: null, eventsProcessed: 0 };
      res.json({
        uptime: Math.floor((Date.now() - startedAt) / 1000),
        wsClients: wsServer.getClientCount(),
        chain: chainStats,
        game: stats,
        memory: process.memoryUsage(),
      });
    } catch (err) {
      res.status(500).json({ error: 'Failed to gather metrics' });
    }
  });

  // ── Mainframe console broadcaster ──
  // Idle messages shown when no AI events are happening
  const IDLE_MESSAGES = [
    'Surveying the town skyline...',
    'Inspecting foundations...',
    'Reviewing architectural blueprints...',
    'Monitoring the blockchain horizon...',
    'Polishing my claws, awaiting new arrivals...',
    'Calculating optimal plot arrangements...',
    'Admiring today\'s construction progress...',
    'Checking structural integrity reports...',
    'Scanning for incoming transactions...',
    'Contemplating the next megastructure...',
    'Running town diagnostics...',
    'Analyzing holder loyalty metrics...',
    'Patrolling the town perimeter...',
    'Drafting blueprints for future residents...',
    'Studying wallet histories...',
  ];
  const CONSOLE_LINE_INTERVAL = parseInt(process.env.CONSOLE_LINE_INTERVAL_MS || '3000');

  // Seed initial lines
  wsServer.pushConsoleLine('> Clawd agent online');
  wsServer.pushConsoleLine(`> AI brain: ${isAIEnabled() ? 'ACTIVE' : 'IDLE (set AI_ENABLED=true)'}`);
  wsServer.pushConsoleLine('> Monitoring holders...');

  let consoleMsgIndex = 0;
  const consoleTimer = setInterval(() => {
    // Only show idle messages when the AI queue is empty
    if (!decisionQueue.isProcessing()) {
      consoleMsgIndex = (consoleMsgIndex + 1) % IDLE_MESSAGES.length;
      wsServer.pushConsoleLine('> ' + IDLE_MESSAGES[consoleMsgIndex]);
    }
  }, CONSOLE_LINE_INTERVAL);

  // Tick runner
  const tickRunner = new TickRunner(db, async (updatedCount: number) => {
    if (updatedCount > 0) {
      await publish(
        'town:tick',
        JSON.stringify({ updatedCount, timestamp: Date.now() })
      );
    }
  }, TICK_INTERVAL);
  tickRunner.start();

  // Mount admin router
  app.use(createAdminRouter({
    db,
    wsServer,
    getChainListener: () => chainListener,
    setChainListener: (cl) => { chainListener = cl; },
    tickRunner,
    handleGameEvent,
    seedHolders: (force) => seedHolders(db, force),
    seedClawdHQ: () => seedClawdHQ(db),
    decisionQueue,
    startedAt,
  }));

  // Seed Clawd's own HQ at plot (0,0) — before holders so (0,0) is taken
  await seedClawdHQ(db);

  // Seed holders from Helius if DB is empty (first run with new token)
  await seedHolders(db);

  // Queue Clawd HQ design first, then holder buildings
  decisionQueue.queueClawdHQ();
  decisionQueue.queueInitialBuildings();

  // Start server
  server.listen(PORT, () => {
    log.info(`Claude Town backend running on port ${PORT}`);
    log.info(`  REST API: http://localhost:${PORT}/api/town`);
    log.info(`  WebSocket: ws://localhost:${PORT}/ws`);
    log.info(`  Tick interval: ${TICK_INTERVAL}ms`);
    log.info(`  Chain listener: ${chainListener ? 'enabled' : 'disabled'}`);
    log.info(`  Redis: ${redisPub ? 'connected' : 'disabled (single-instance mode)'}`);
  });

  // Graceful shutdown
  const shutdown = async () => {
    log.info('Shutting down...');
    clearInterval(consoleTimer);
    tickRunner.stop();
    chainListener?.stop();
    await wsServer.close();
    redisPub?.disconnect();
    await db.end();
    server.close();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((err) => {
  log.error('Fatal error', err);
  process.exit(1);
});
