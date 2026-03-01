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
import {
  initializeTown, initializeSmallTown, findPlotForHolder, applyAction, getArchetypeForTier,
  createTownSnapshot, TownState, DISTRICT_NAMES, computeTags, computeStats,
  getAllArchetypes, Plot,
} from './town-sim/index';
import { planBuildingPlacement, executePlacementPlan } from './ai/town-planner';

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
    // Skip Clawd HQ address — already seeded separately
    if (ownerAddress === CLAWD_HQ_ADDRESS) continue;
    const pct = walletPctOfSupply(balance, totalSupply);
    const tier = getTier(pct);
    const hue = colorHueFromAddress(ownerAddress);
    // Find plot on tilemap if available, fallback to old spiral
    let plotX = 0, plotY = 0;
    if (townState) {
      let tmPlot = findPlotForHolder(townState, tier);

      // If no plots available, use town planner to expand
      if (!tmPlot) {
        const plan = planBuildingPlacement(townState, tier);
        if (plan) {
          const planResult = executePlacementPlan(townState, plan);
          if (planResult.success && planResult.plotId) {
            tmPlot = townState.plots.get(planResult.plotId) || null;
          }
        }
      }

      if (tmPlot && !tmPlot.occupied) {
        plotX = tmPlot.originX;
        plotY = tmPlot.originY;
        const archetype = getArchetypeForTier(1);
        applyAction(townState, {
          type: 'PLACE_BUILDING_ON_PLOT',
          plotId: tmPlot.id,
          archetypeId: archetype.id,
          ownerAddress,
        });
      } else if (tmPlot) {
        plotX = tmPlot.originX;
        plotY = tmPlot.originY;
      } else {
        const fallback = await db.getNextPlotForTier(tier);
        plotX = fallback.x;
        plotY = fallback.y;
      }
    } else {
      const fallback = await db.getNextPlotForTier(tier);
      plotX = fallback.x;
      plotY = fallback.y;
    }
    try {
      await db.createWallet(ownerAddress, balance, plotX, plotY, 1, hue);
      // Existing holders start at T1 with full progress — ready to evolve on next ticks
      await db.updateWallet(ownerAddress, { build_progress: 100 });
      created++;
      if (created % 50 === 0) log.info(`  Seeded ${created} / ${sorted.length} wallets...`);
    } catch (err: any) {
      log.warn(`Failed to seed wallet ${ownerAddress.slice(0, 8)}...: ${err.message}`);
    }
  }

  log.info(`Seed complete — created ${created} wallets`);
}

async function seedClawdHQ(db: DB) {
  const existing = await db.getWallet(CLAWD_HQ_ADDRESS);
  if (existing) return;

  // The castle is already placed at center by initializeSmallTown()
  // Just find where it is
  let plotX = Math.floor(256 / 2), plotY = Math.floor(256 / 2);
  if (townState) {
    // Look for the castle plot at center
    const cx = Math.floor(townState.map.width / 2);
    const cy = Math.floor(townState.map.height / 2);
    const castlePlot = townState.plots.get(`p_${cx}_${cy}`);
    if (castlePlot) {
      plotX = castlePlot.originX;
      plotY = castlePlot.originY;
      log.info(`Clawd HQ at castle plot (${plotX}, ${plotY})`);
    } else {
      // Fallback: find any tier-5 plot
      const hqPlot = findPlotForHolder(townState, 5);
      if (hqPlot) {
        plotX = hqPlot.originX;
        plotY = hqPlot.originY;
        if (!hqPlot.occupied) {
          applyAction(townState, {
            type: 'PLACE_BUILDING_ON_PLOT',
            plotId: hqPlot.id,
            archetypeId: 'holder_tier5',
            ownerAddress: CLAWD_HQ_ADDRESS,
            buildingName: 'Clawd Architect HQ',
          });
        }
        log.info(`Clawd HQ placed on tilemap at plot ${hqPlot.id} (${plotX}, ${plotY})`);
      }
    }
  }

  log.info(`Seeding Clawd Architect HQ at plot (${plotX},${plotY})...`);
  await db.createWallet(CLAWD_HQ_ADDRESS, 0n, plotX, plotY, 5, 180);
  await db.updateWallet(CLAWD_HQ_ADDRESS, { build_progress: 100 });
  log.info('Clawd HQ wallet created');
}

async function migrateWalletsToTilemap(db: DB) {
  if (!townState) return;

  const wallets = await db.getAllWallets();
  if (wallets.length === 0) return;

  // Check if wallets are already on tilemap coords:
  // Old spiral coords use negative numbers; tilemap coords are always 0-255
  const hasNegativeCoords = wallets.some(w => w.plot_x < 0 || w.plot_y < 0);
  const allInTilemapRange = wallets.every(w =>
    w.plot_x >= 0 && w.plot_x < 256 && w.plot_y >= 0 && w.plot_y < 256
  );
  // Also check if coords map to actual tilemap plots
  const sampleWallet = wallets[0];
  const samplePlot = townState.plots.get(`p_${sampleWallet.plot_x}_${sampleWallet.plot_y}`);
  if (!hasNegativeCoords && allInTilemapRange && samplePlot) {
    log.info('Wallets appear to already use tilemap coordinates — skipping migration');
    return;
  }

  log.info(`Migrating ${wallets.length} wallets from spiral grid to tilemap plots...`);

  // Sort by tier descending (whales first → best plots)
  const sorted = [...wallets].sort((a, b) => b.house_tier - a.house_tier);

  let migrated = 0;
  for (const w of sorted) {
    // Try existing plots first
    let plot = findPlotForHolder(townState, w.house_tier);

    // If no plots available, use town planner to expand and create one
    if (!plot) {
      const plan = planBuildingPlacement(townState, w.house_tier);
      if (plan) {
        const planResult = executePlacementPlan(townState, plan);
        if (planResult.success && planResult.plotId) {
          plot = townState.plots.get(planResult.plotId) || null;
        }
      }
    }

    if (!plot) {
      log.warn(`No tilemap plot available for ${w.address.slice(0, 8)}... (tier ${w.house_tier})`);
      continue;
    }

    if (!plot.occupied) {
      const archetype = getArchetypeForTier(1);
      applyAction(townState, {
        type: 'PLACE_BUILDING_ON_PLOT',
        plotId: plot.id,
        archetypeId: archetype.id,
        ownerAddress: w.address,
        buildingName: w.building_name || undefined,
      });
    }

    await db.updateWallet(w.address, { plot_x: plot.originX, plot_y: plot.originY } as any);
    migrated++;
  }

  // Save tilemap after migration since we likely expanded it
  if (migrated > 0) {
    await db.saveTilemap(townState);
    log.info('Tilemap saved after migration');
  }

  log.info(`Migration complete — ${migrated} wallets moved to tilemap plots`);
}

const startedAt = Date.now();

// Module-level town state — initialized on startup, shared across systems
let townState: TownState | null = null;
export function getTownState(): TownState | null { return townState; }

// Tilemap save scheduler — set during main()
let _scheduleTilemapSave: (() => void) | null = null;

async function main() {
  const PORT = parseInt(process.env.PORT || '3001');
  const TICK_INTERVAL = parseInt(process.env.TICK_INTERVAL_MS || '30000');
  const TOWN_SEED = parseInt(process.env.TOWN_SEED || '42');

  // Database (needed before town init for tilemap persistence)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.on('error', (err) => log.error('Unexpected PG pool error', err));
  const db = new DB(pool);

  // Initialize town simulation — load from DB or create fresh
  log.info('Initializing town simulation...');
  const savedTilemap = await db.loadTilemap();
  if (savedTilemap) {
    log.info(`Loaded tilemap from DB (version ${savedTilemap.version}, ${savedTilemap.width}x${savedTilemap.height})`);
    const map = { width: savedTilemap.width, height: savedTilemap.height, tiles: savedTilemap.tiles };
    const plots = new Map<string, Plot>();
    for (const p of savedTilemap.plots) {
      plots.set(p.id, p);
    }
    // Rebuild TownState from saved data
    const nullBuilding = { id: 0, archetypeId: '', originX: 0, originY: 0, rotation: 0 as const, district: 0, plotId: '', ownerAddress: null, buildingName: null, customImageUrl: null, imagePrompt: null };
    townState = {
      map,
      plots,
      buildings: [nullBuilding],
      archetypes: getAllArchetypes(),
      stats: { population: 0, jobs: 0, commerceScore: 0, greeneryScore: 0, averageDensity: 0, buildingCount: 0, roadTileCount: 0, districtCoverage: {} },
      seed: TOWN_SEED,
    };
    // Recompute tags and stats from loaded data
    computeTags(map);
    townState.stats = computeStats(townState);
    log.info(`Town restored: ${plots.size} plots, ${townState.stats.roadTileCount} road tiles`);
  } else {
    log.info(`Creating fresh small town (seed: ${TOWN_SEED})...`);
    townState = initializeSmallTown(TOWN_SEED);
    log.info(`Small town created: ${townState.plots.size} plots, ${townState.buildings.length - 1} starter buildings, ${townState.stats.roadTileCount} road tiles`);
    // Save initial tilemap to DB
    await db.saveTilemap(townState);
    log.info('Initial tilemap saved to DB');
  }

  // Debounced tilemap save — coalesces rapid changes into a single write
  let tilemapSaveTimer: ReturnType<typeof setTimeout> | null = null;
  const TILEMAP_SAVE_DEBOUNCE = 30000; // 30s

  // Register the debounced tilemap save function globally
  _scheduleTilemapSave = () => {
    if (tilemapSaveTimer) return;
    tilemapSaveTimer = setTimeout(async () => {
      tilemapSaveTimer = null;
      if (townState) {
        try {
          await db.saveTilemap(townState);
          log.debug('Tilemap saved to DB (debounced)');
        } catch (err) {
          log.error('Failed to save tilemap:', err);
        }
      }
    }, TILEMAP_SAVE_DEBOUNCE);
  };

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
  if (townState) engine.setTownState(townState);

  // AI Decision Queue
  const decisionQueue = new DecisionQueue(db);
  if (townState) decisionQueue.setTownState(townState);

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

  app.use(createRestRouter(db, () => townState));

  // Admin router (mounted after services are ready, see below)

  // HTTP server
  const server = http.createServer(app);

  // WebSocket server (pass null redisUrl if Redis failed)
  const wsServer = new TownWebSocketServer(server, db, redisPub ? redisUrl : null, () => townState);

  // AI Progress callback — stream Clawd's thinking to the console
  decisionQueue.setOnProgress((line) => {
    wsServer.pushConsoleLine(line);
  });

  // Tilemap callbacks — save to DB and broadcast to clients
  decisionQueue.setOnTilemapSave(() => {
    _scheduleTilemapSave?.();
  });
  decisionQueue.setOnTilemapUpdate(() => {
    wsServer.broadcastTilemapUpdate();
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
    // Only start chain listener if there are existing holders in DB
    // (fresh/empty DB should wait for set-token or reseed to start listening)
    const stats = await db.getStats();
    if (stats.totalHolders > 0) {
      chainListener = new ChainListener(rpcUrl, mintAddress, db, handleGameEvent);
      await chainListener.start();
    } else {
      log.info('Empty DB — chain listener will start after set-token or reseed');
    }
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
    getTownState: () => townState,
    setTownState: (state) => {
      townState = state;
      engine.setTownState(state);
      decisionQueue.setTownState(state);
    },
  }));

  // Seed Clawd's own HQ at plot (0,0) — before holders so (0,0) is taken
  await seedClawdHQ(db);

  // Seed holders from Helius if DB is empty (first run with new token)
  await seedHolders(db);

  // Migrate existing wallets from spiral grid to tilemap plots
  await migrateWalletsToTilemap(db);

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
    if (tilemapSaveTimer) clearTimeout(tilemapSaveTimer);
    tickRunner.stop();
    chainListener?.stop();
    // Save tilemap immediately on shutdown
    if (townState) {
      try {
        await db.saveTilemap(townState);
        log.info('Tilemap saved on shutdown');
      } catch (err) {
        log.error('Failed to save tilemap on shutdown:', err);
      }
    }
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
