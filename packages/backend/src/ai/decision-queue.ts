import { DB, WalletRow } from '../db/queries';
import { makeClawdDecision, isAIEnabled, HolderProfile, ClawdDecision } from './clawd-agent';
import { generateBuildingImage, isImageGenEnabled } from './image-generator';
import { analyzeWallet } from './wallet-analyzer';
import { classifyBehaviorPattern, getBehaviorTheme } from './clawd-prompt';
import { walletPctOfSupply } from '../game/rules';
import { probationMap } from '../game/engine';
import { log } from '../utils/logger';
import { CLAWD_HQ_ADDRESS } from '../constants';
import { TownState, applyAction, findPlotForHolder, getArchetypeForTier, DISTRICT_NAMES } from '../town-sim/index';
import { planBuildingPlacement, executePlacementPlan } from './town-planner';

export interface DecisionRequest {
  walletAddress: string;
  eventType: 'buy' | 'sell';
  isNewHolder: boolean;
  walletRow: WalletRow;
  totalSupply: bigint;
  tokenAmountDelta: bigint;
}

export interface HolderProfileSummary {
  walletAddress: string;
  tier: number;
  supplyPercent: number;
  eventType: string;
  tradingPersonality: string;
  behaviorPattern: string;
  behaviorTheme: string;
  tradeStats: { buys: number; sells: number; volume: number };
  isNewHolder: boolean;
  existingBuildingName: string | null;
}

export interface DecisionResult {
  walletAddress: string;
  eventType: string;
  decision: ClawdDecision;
  imageUrl: string | null;
  holderProfile: HolderProfileSummary;
}

type DecisionCallback = (result: DecisionResult) => void;
type ProgressCallback = (line: string) => void;

/** Simple async mutex for serializing town state mutations */
class AsyncMutex {
  private locked = false;
  private waiters: (() => void)[] = [];

  async acquire(): Promise<void> {
    while (this.locked) {
      await new Promise<void>(resolve => this.waiters.push(resolve));
    }
    this.locked = true;
  }

  release(): void {
    this.locked = false;
    const next = this.waiters.shift();
    if (next) next();
  }
}

// How many decisions to process concurrently (AI calls in parallel,
// town placement serialized after). Higher = faster throughput during surges.
const BATCH_SIZE = parseInt(process.env.DECISION_BATCH_SIZE || '5');

// When the queue depth exceeds this, generate images in background instead of inline.
const IMAGE_DEFER_THRESHOLD = parseInt(process.env.IMAGE_DEFER_THRESHOLD || '10');

// Max concurrent background image generations to avoid overwhelming SD.
const MAX_BG_IMAGE_WORKERS = parseInt(process.env.MAX_BG_IMAGE_WORKERS || '2');

export class DecisionQueue {
  private queue: DecisionRequest[] = [];
  private processing = false;
  private onDecision: DecisionCallback | null = null;
  private onProgress: ProgressCallback | null = null;
  private onTilemapUpdate: (() => void) | null = null;
  private onTilemapSave: (() => void) | null = null;
  private db: DB;
  private townState: TownState | null = null;
  /** Addresses that had image gen deferred during surge — will be retried later */
  private deferredImageAddresses: string[] = [];
  /** Mutex for serializing town state mutations (placement) while AI calls run in parallel */
  private placementMutex = new AsyncMutex();
  /** Background image generation queue and active count */
  private bgImageQueue: Array<{ address: string; prompt: string; buildingName: string }> = [];
  private bgImageActive = 0;

  constructor(db: DB) {
    this.db = db;
  }

  setTownState(state: TownState): void {
    this.townState = state;
  }

  setOnDecision(callback: DecisionCallback): void {
    this.onDecision = callback;
  }

  setOnProgress(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  setOnTilemapUpdate(callback: () => void): void {
    this.onTilemapUpdate = callback;
  }

  setOnTilemapSave(callback: () => void): void {
    this.onTilemapSave = callback;
  }

  /** Clear all pending decisions (used on DB reset / reseed) */
  clearQueue(): void {
    const count = this.queue.length;
    this.queue = [];
    if (count > 0) log.info(`Decision queue cleared (${count} pending items removed)`);
  }

  private pushProgress(line: string): void {
    if (this.onProgress) this.onProgress(line);
  }

  enqueue(request: DecisionRequest): void {
    if (!isAIEnabled()) return;

    // Deduplicate: remove existing pending request for same wallet
    this.queue = this.queue.filter(r => r.walletAddress !== request.walletAddress);
    this.queue.push(request);
    log.info(`AI decision queued for ${request.walletAddress.slice(0, 8)}... (queue: ${this.queue.length})`);
    this.processNext();
  }

  enqueueBulk(requests: DecisionRequest[]): void {
    if (!isAIEnabled() || requests.length === 0) return;

    for (const request of requests) {
      // Deduplicate: skip if already queued for this wallet
      if (!this.queue.some(r => r.walletAddress === request.walletAddress)) {
        this.queue.push(request);
      }
    }
    log.info(`Bulk-queued ${requests.length} initial building decisions`);
    this.processNext();
  }

  /** Queue Clawd's own HQ design as the first item in the queue */
  queueClawdHQ(): void {
    if (!isAIEnabled()) return;
    (async () => {
      try {
        const wallet = await this.db.getWallet(CLAWD_HQ_ADDRESS);
        if (!wallet) {
          log.warn('Clawd HQ wallet not found — skipping HQ design');
          return;
        }
        if (wallet.building_name) {
          log.info('Clawd HQ already has a building — skipping');
          return;
        }
        log.info('Queuing Clawd HQ design (first priority)...');
        const request: DecisionRequest = {
          walletAddress: CLAWD_HQ_ADDRESS,
          eventType: 'buy',
          isNewHolder: true,
          walletRow: wallet,
          totalSupply: 0n,
          tokenAmountDelta: 0n,
        };
        // Prepend to front of queue so it's processed first
        this.queue.unshift(request);
        this.processNext();
      } catch (err) {
        log.error('Failed to queue Clawd HQ design:', err);
      }
    })();
  }

  /** Queue building designs for all holders that don't have buildings yet. Runs async, doesn't block. */
  queueInitialBuildings(): void {
    if (!isAIEnabled()) return;
    (async () => {
      try {
        const walletsWithoutBuildings = await this.db.getWalletsWithoutBuildings();
        if (walletsWithoutBuildings.length > 0) {
          log.info(`Queuing Clawd building designs for ${walletsWithoutBuildings.length} holders...`);
          const totalSupply = await this.db.getTotalSupply();
          const requests = walletsWithoutBuildings.map(wallet => ({
            walletAddress: wallet.address,
            eventType: 'buy' as const,
            isNewHolder: false,
            walletRow: wallet,
            totalSupply,
            tokenAmountDelta: BigInt(wallet.token_balance),
          }));
          this.enqueueBulk(requests);
        }
      } catch (err) {
        log.error('Failed to queue initial building designs:', err);
      }
    })();
  }

  /** Queue building designs for ALL holders (force regenerate, even those with existing buildings). */
  queueAllBuildings(): void {
    if (!isAIEnabled()) return;
    (async () => {
      try {
        const wallets = await this.db.getAllWallets();
        const holders = wallets.filter(w => w.token_balance !== '0' && w.address !== CLAWD_HQ_ADDRESS);
        if (holders.length === 0) {
          log.info('No holders to regenerate buildings for');
          return;
        }
        log.info(`Force-queuing building regeneration for ${holders.length} holders...`);
        const totalSupply = await this.db.getTotalSupply();
        const requests = holders.map(wallet => ({
          walletAddress: wallet.address,
          eventType: 'buy' as const,
          isNewHolder: false,
          walletRow: wallet,
          totalSupply,
          tokenAmountDelta: BigInt(wallet.token_balance),
        }));
        this.enqueueBulk(requests);
      } catch (err) {
        log.error('Failed to queue all building regenerations:', err);
      }
    })();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      // Take up to BATCH_SIZE items from the queue
      const batch = this.queue.splice(0, BATCH_SIZE);
      if (batch.length > 1) {
        log.info(`Processing batch of ${batch.length} decisions (${this.queue.length} remaining)`);
      }

      // Process all items in the batch concurrently
      const results = await Promise.allSettled(
        batch.map(request => this.processDecision(request))
      );

      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (result.status === 'rejected') {
          log.error(`Decision processing failed for ${batch[i].walletAddress.slice(0, 8)}...:`, result.reason);
        }
      }
    }

    // After queue drains, process deferred images in background
    if (this.deferredImageAddresses.length > 0) {
      const deferred = [...this.deferredImageAddresses];
      this.deferredImageAddresses = [];
      log.info(`Queue drained — generating ${deferred.length} deferred building images...`);
      this.processDeferredImages(deferred);
    }

    this.processing = false;
  }

  /** Generate images for buildings that were deferred during surge */
  private async processDeferredImages(addresses: string[]): Promise<void> {
    for (const address of addresses) {
      if (this.queue.length > 0) {
        // New items arrived — re-defer remaining and let processNext handle them
        this.deferredImageAddresses.push(...addresses.slice(addresses.indexOf(address)));
        return;
      }
      try {
        const wallet = await this.db.getWallet(address);
        if (!wallet || !wallet.image_prompt) continue;
        if (wallet.custom_image_url) continue; // already has an image

        this.pushProgress(`> Rendering deferred image for ${address.slice(0, 8)}...`);
        const imageUrl = await generateBuildingImage(wallet.image_prompt, address);
        if (imageUrl) {
          await this.db.updateWalletAI(address, {
            custom_image_url: imageUrl,
            image_generated_at: new Date(),
          });
          if (this.onDecision) {
            // Notify frontend of the new image
            this.onDecision({
              walletAddress: address,
              eventType: 'buy',
              decision: {
                building_name: wallet.building_name || '',
                architectural_style: wallet.architectural_style || '',
                clawd_comment: '',
                image_prompt: wallet.image_prompt,
                description: '',
                evolution_hint: '',
              },
              imageUrl,
              holderProfile: {
                walletAddress: address.slice(0, 4) + '...' + address.slice(-4),
                tier: wallet.house_tier,
                supplyPercent: 0,
                eventType: 'buy',
                tradingPersonality: '',
                behaviorPattern: '',
                behaviorTheme: '',
                tradeStats: { buys: 0, sells: 0, volume: 0 },
                isNewHolder: false,
                existingBuildingName: wallet.building_name,
              },
            });
          }
          log.info(`Deferred image generated for ${address.slice(0, 8)}...`);
        }
      } catch (err) {
        log.error(`Deferred image generation failed for ${address.slice(0, 8)}...:`, err);
      }
    }
  }

  /** Queue image generation to run in background without blocking AI decisions */
  private generateImageInBackground(address: string, prompt: string, buildingName: string): void {
    this.bgImageQueue.push({ address, prompt, buildingName });
    this.pumpBgImageQueue();
  }

  /** Process background image queue with concurrency limit */
  private pumpBgImageQueue(): void {
    while (this.bgImageActive < MAX_BG_IMAGE_WORKERS && this.bgImageQueue.length > 0) {
      const item = this.bgImageQueue.shift()!;
      this.bgImageActive++;
      this.processBgImage(item.address, item.prompt, item.buildingName)
        .finally(() => {
          this.bgImageActive--;
          this.pumpBgImageQueue();
        });
    }
  }

  private async processBgImage(address: string, prompt: string, buildingName: string): Promise<void> {
    try {
      const imageUrl = await generateBuildingImage(prompt, address);
      if (imageUrl) {
        await this.db.updateWalletAI(address, {
          custom_image_url: imageUrl,
          image_generated_at: new Date(),
        });
        log.info(`Background image generated for ${address.slice(0, 8)}...`);

        // Notify frontend of the new image
        if (this.onDecision) {
          const wallet = await this.db.getWallet(address);
          this.onDecision({
            walletAddress: address,
            eventType: 'buy',
            decision: {
              building_name: buildingName,
              architectural_style: wallet?.architectural_style || '',
              clawd_comment: '',
              image_prompt: prompt,
              description: '',
              evolution_hint: '',
            },
            imageUrl,
            holderProfile: {
              walletAddress: address.slice(0, 4) + '...' + address.slice(-4),
              tier: wallet?.house_tier ?? 1,
              supplyPercent: 0,
              eventType: 'buy',
              tradingPersonality: '',
              behaviorPattern: '',
              behaviorTheme: '',
              tradeStats: { buys: 0, sells: 0, volume: 0 },
              isNewHolder: false,
              existingBuildingName: buildingName,
            },
          });
        }
      }
    } catch (err) {
      log.error(`Background image generation failed for ${address.slice(0, 8)}...:`, err);
    }
  }

  private async processDecision(request: DecisionRequest): Promise<void> {
    const { walletAddress, eventType, isNewHolder, walletRow, totalSupply, tokenAmountDelta } = request;
    const isClawdHQ = walletAddress === CLAWD_HQ_ADDRESS;

    // Check bot probation (skip for Clawd HQ — no real wallet)
    if (isClawdHQ) {
      return this.processClawdHQDecision(request);
    }

    const probationExpiry = probationMap.get(walletAddress);
    if (probationExpiry !== undefined) {
      const remaining = probationExpiry - Date.now();
      if (remaining > 0) {
        // Still on probation — re-enqueue with delay
        log.info(`Wallet ${walletAddress.slice(0, 8)}... on probation, deferring AI decision ${Math.ceil(remaining / 1000)}s`);
        await new Promise(r => setTimeout(r, remaining));

        // After waiting, check if wallet sold during probation (removed from map)
        if (!probationMap.has(walletAddress)) {
          // Re-read wallet to check balance
          const freshWallet = await this.db.getWallet(walletAddress);
          if (!freshWallet || BigInt(freshWallet.token_balance) === 0n) {
            log.info(`Bot confirmed: ${walletAddress.slice(0, 8)}... sold during probation — skipping AI decision`);
            return;
          }
        }
        // Probation expired and wallet still holds — clear and proceed
        probationMap.delete(walletAddress);
      } else {
        // Probation expired — clear it
        probationMap.delete(walletAddress);
      }
    }

    // Stage 1: Inspecting wallet
    this.pushProgress(`> Inspecting wallet ${walletAddress.slice(0, 8)}...`);

    // Fetch wallet personality (Helius, cached 24h) and trade stats (local DB) in parallel
    const heliusApiKey = process.env.HELIUS_API_KEY;
    const [walletPersonality, tradeStats] = await Promise.all([
      analyzeWallet(walletAddress, heliusApiKey),
      this.db.getWalletTradeStats(walletAddress),
    ]);

    // Stage 2: Profile summary
    this.pushProgress(`> Profile: ${walletPersonality.personality} — ${tradeStats.totalBuys} buys, ${tradeStats.totalSells} sells`);

    // Build holder profile
    const tokenBalance = BigInt(walletRow.token_balance);
    const supplyPercent = Number(walletPctOfSupply(tokenBalance, totalSupply));
    const holdDurationMs = Date.now() - walletRow.first_seen_at.getTime();

    // Compute behavior pattern and theme from trade stats
    const behaviorPattern = classifyBehaviorPattern(tradeStats, eventType, holdDurationMs);
    const behaviorTheme = getBehaviorTheme(walletPersonality.personality, behaviorPattern, walletAddress);

    // Stage 3: Behavior classification
    this.pushProgress(`> Behavior: ${behaviorPattern} — Theme: ${behaviorTheme}`);

    const profile: HolderProfile = {
      walletAddress,
      tokenBalance,
      tier: walletRow.house_tier,
      supplyPercent,
      holdDurationMs,
      eventType,
      isNewHolder,
      tradingPersonality: walletPersonality.personality,
      existingBuildingName: walletRow.building_name,
      existingStyle: walletRow.architectural_style,
      damagePct: parseFloat(walletRow.damage_pct),
      tokenAmountThisTx: tokenAmountDelta < 0n ? -tokenAmountDelta : tokenAmountDelta,
      tradeStats,
      behaviorPattern,
      behaviorTheme,
    };

    // Stage 4: Consulting Gemini
    this.pushProgress(`> Consulting the blueprints...`);

    // Get Clawd's decision
    const decision = await makeClawdDecision(profile);

    // Stage 5: Verdict
    this.pushProgress(`> Verdict: "${decision.building_name}" (${decision.architectural_style})`);

    // Generate image — during surge, fire in background without blocking the queue
    let imageUrl: string | null = null;
    const surgeMode = this.queue.length >= IMAGE_DEFER_THRESHOLD;
    if (isImageGenEnabled() && !surgeMode) {
      this.pushProgress(`> Rendering building image...`);
      imageUrl = await generateBuildingImage(decision.image_prompt, walletAddress);
    } else if (isImageGenEnabled() && surgeMode) {
      this.pushProgress(`> Image queued in background (queue: ${this.queue.length})`);
      this.generateImageInBackground(walletAddress, decision.image_prompt, decision.building_name);
    }

    // Town planning — place building on tilemap (serialized via mutex)
    let plotX = walletRow.plot_x;
    let plotY = walletRow.plot_y;

    if (this.townState) {
      await this.placementMutex.acquire();
      try {
        this.pushProgress(`> Planning building placement...`);
        const plan = planBuildingPlacement(this.townState, walletRow.house_tier);

        if (plan) {
          const planResult = executePlacementPlan(this.townState, plan);
          if (planResult.success && planResult.plotId) {
            const plot = this.townState.plots.get(planResult.plotId);
            if (plot && !plot.occupied) {
              const archetype = getArchetypeForTier(walletRow.house_tier);
              const buildResult = applyAction(this.townState, {
                type: 'PLACE_BUILDING_ON_PLOT',
                plotId: planResult.plotId,
                archetypeId: archetype.id,
                ownerAddress: walletAddress,
                buildingName: decision.building_name,
              });
              if (buildResult.success) {
                plotX = plot.originX;
                plotY = plot.originY;
                this.pushProgress(`> Building placed at (${plotX}, ${plotY})`);

                // Update wallet plot coords
                await this.db.updateWallet(walletAddress, { plot_x: plotX, plot_y: plotY } as any);

                // Schedule tilemap save and broadcast update
                if (this.onTilemapSave) this.onTilemapSave();
                if (this.onTilemapUpdate) this.onTilemapUpdate();
              }
            }
          }
        }
      } finally {
        this.placementMutex.release();
      }
    }

    // Store decision in DB
    await this.db.updateWalletAI(walletAddress, {
      building_name: decision.building_name,
      architectural_style: decision.architectural_style,
      clawd_comment: decision.clawd_comment,
      image_prompt: decision.image_prompt,
      custom_image_url: imageUrl,
      image_generated_at: imageUrl ? new Date() : null,
    });

    // Build a profile summary for the blog
    const holderProfileSummary = {
      walletAddress: walletAddress.slice(0, 4) + '...' + walletAddress.slice(-4),
      tier: walletRow.house_tier,
      supplyPercent,
      eventType,
      tradingPersonality: walletPersonality.personality,
      behaviorPattern,
      behaviorTheme,
      tradeStats: {
        buys: tradeStats.totalBuys,
        sells: tradeStats.totalSells,
        volume: tradeStats.totalBuys + tradeStats.totalSells,
      },
      isNewHolder,
      existingBuildingName: walletRow.building_name,
    };

    await this.db.insertClawdDecision(walletAddress, eventType, decision, imageUrl, holderProfileSummary);

    log.info(
      `AI decision complete: "${decision.building_name}" for ${walletAddress.slice(0, 8)}... ` +
      `[image: ${imageUrl ? 'yes' : 'no'}]`
    );

    // Notify callback
    if (this.onDecision) {
      this.onDecision({
        walletAddress,
        eventType,
        decision,
        imageUrl,
        holderProfile: holderProfileSummary,
      });
    }
  }

  private async processClawdHQDecision(request: DecisionRequest): Promise<void> {
    const { walletAddress, walletRow } = request;

    this.pushProgress('> Clawd is designing his own Architect HQ...');

    // Place HQ on tilemap if not already placed
    if (this.townState) {
      const hqPlot = findPlotForHolder(this.townState, 5);
      if (hqPlot && !hqPlot.occupied) {
        applyAction(this.townState, {
          type: 'PLACE_BUILDING_ON_PLOT',
          plotId: hqPlot.id,
          archetypeId: 'holder_tier5',
          ownerAddress: walletAddress,
          buildingName: 'Clawd Architect HQ',
        });
        this.pushProgress(`> HQ placed on tilemap at plot ${hqPlot.id}`);
      }
    }

    const profile: HolderProfile = {
      walletAddress,
      tokenBalance: 0n,
      tier: 5,
      supplyPercent: 0,
      holdDurationMs: 0,
      eventType: 'buy',
      isNewHolder: true,
      tradingPersonality: 'Architect AI',
      existingBuildingName: null,
      existingStyle: null,
      damagePct: 0,
      tokenAmountThisTx: 0n,
      tradeStats: {
        totalBuys: 0, totalSells: 0,
        totalTokenBought: 0n, totalTokenSold: 0n,
        largestSingleBuy: 0n, largestSingleSell: 0n,
        tradesLast24h: 0, tradesLast7d: 0, decisionCount: 0,
      },
      behaviorPattern: 'Stone Foundation',
      behaviorTheme: 'obsidian command panels and glowing circuit inlays',
    };

    this.pushProgress('> Consulting the blueprints for the HQ...');
    const decision = await makeClawdDecision(profile);

    this.pushProgress(`> HQ Verdict: "${decision.building_name}" (${decision.architectural_style})`);

    // Use static asset for Clawd HQ — no SD generation needed
    const imageUrl = '/assets/clawd-hq.png';

    await this.db.updateWalletAI(walletAddress, {
      building_name: decision.building_name,
      architectural_style: decision.architectural_style,
      clawd_comment: decision.clawd_comment,
      image_prompt: decision.image_prompt,
      custom_image_url: imageUrl,
      image_generated_at: new Date(),
    });

    const holderProfileSummary: HolderProfileSummary = {
      walletAddress: 'Clawd HQ',
      tier: 5,
      supplyPercent: 0,
      eventType: 'buy',
      tradingPersonality: 'Architect AI',
      behaviorPattern: 'Stone Foundation',
      behaviorTheme: 'obsidian command panels and glowing circuit inlays',
      tradeStats: { buys: 0, sells: 0, volume: 0 },
      isNewHolder: true,
      existingBuildingName: null,
    };

    await this.db.insertClawdDecision(walletAddress, 'buy', decision, imageUrl, holderProfileSummary);

    log.info(`Clawd HQ design complete: "${decision.building_name}" [image: ${imageUrl ? 'yes' : 'no'}]`);

    if (this.onDecision) {
      this.onDecision({
        walletAddress,
        eventType: 'buy',
        decision,
        imageUrl,
        holderProfile: holderProfileSummary,
      });
    }
  }

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }
}
