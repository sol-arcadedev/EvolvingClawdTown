import { DB, WalletRow } from '../db/queries';
import { makeClawdDecision, isAIEnabled, HolderProfile, ClawdDecision } from './clawd-agent';
import { generateBuildingImage, isSDEnabled } from './image-generator';
import { analyzeWallet } from './wallet-analyzer';
import { classifyBehaviorPattern, getBehaviorTheme } from './clawd-prompt';
import { walletPctOfSupply } from '../game/rules';
import { probationMap } from '../game/engine';
import { log } from '../utils/logger';

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

export class DecisionQueue {
  private queue: DecisionRequest[] = [];
  private processing = false;
  private onDecision: DecisionCallback | null = null;
  private onProgress: ProgressCallback | null = null;
  private db: DB;

  constructor(db: DB) {
    this.db = db;
  }

  setOnDecision(callback: DecisionCallback): void {
    this.onDecision = callback;
  }

  setOnProgress(callback: ProgressCallback): void {
    this.onProgress = callback;
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

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    while (this.queue.length > 0) {
      const request = this.queue.shift()!;
      try {
        await this.processDecision(request);
      } catch (err) {
        log.error(`Decision processing failed for ${request.walletAddress.slice(0, 8)}...:`, err);
      }
    }

    this.processing = false;
  }

  private async processDecision(request: DecisionRequest): Promise<void> {
    const { walletAddress, eventType, isNewHolder, walletRow, totalSupply, tokenAmountDelta } = request;

    // Check bot probation
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

    // Generate image (if SD is available)
    let imageUrl: string | null = null;
    if (isSDEnabled()) {
      // Stage 6: Image generation
      this.pushProgress(`> Rendering building image...`);
      imageUrl = await generateBuildingImage(decision.image_prompt, walletAddress);
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

  getQueueLength(): number {
    return this.queue.length;
  }

  isProcessing(): boolean {
    return this.processing;
  }
}
