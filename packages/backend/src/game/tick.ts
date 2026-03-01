import { DB, WalletRow, WalletStateUpdate } from '../db/queries';
import { BASE_BUILD_RATE, REPAIR_RATE_PER_TICK, getTier, walletPctOfSupply } from './rules';

export function applyTickToWallet(wallet: WalletRow, totalSupply: bigint): WalletStateUpdate {
  let buildProgress = parseFloat(wallet.build_progress);
  let damagePct = parseFloat(wallet.damage_pct);
  let buildSpeedMult = parseFloat(wallet.build_speed_mult);
  let boostExpiresAt = wallet.boost_expires_at;
  let houseTier = wallet.house_tier;
  const balance = BigInt(wallet.token_balance);

  // Skip wallets with zero balance
  if (balance <= 0n) {
    return {
      address: wallet.address,
      token_balance: balance,
      house_tier: houseTier,
      build_progress: buildProgress,
      damage_pct: damagePct,
      build_speed_mult: buildSpeedMult,
      boost_expires_at: boostExpiresAt,
    };
  }

  // Compute max tier (ceiling) and balance % for build speed scaling
  const pct = walletPctOfSupply(balance, totalSupply);
  const maxTier = getTier(pct);

  // Expire boost
  if (boostExpiresAt && new Date() > boostExpiresAt) {
    buildSpeedMult = 1.0;
    boostExpiresAt = null;
  }

  // Build progress — whales build ~2-3x faster via balance % scaling
  if (buildProgress < 100) {
    const effectiveRate = BASE_BUILD_RATE * buildSpeedMult * (1 + pct * 0.5);
    buildProgress = Math.min(100, buildProgress + effectiveRate);
  }

  // Tier evolution: when fully built and can upgrade
  if (buildProgress >= 100 && houseTier < maxTier) {
    houseTier += 1;
    buildProgress = 0;
  }
  // Cap at 100 if at max tier (fully built, no more upgrades available)

  // Repair damage over time
  if (damagePct > 0) {
    damagePct = Math.max(0, damagePct - REPAIR_RATE_PER_TICK);
  }

  return {
    address: wallet.address,
    token_balance: balance,
    house_tier: houseTier,
    build_progress: Math.round(buildProgress * 100) / 100,
    damage_pct: Math.round(damagePct * 100) / 100,
    build_speed_mult: Math.round(buildSpeedMult * 100) / 100,
    boost_expires_at: boostExpiresAt,
  };
}

export class TickRunner {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private db: DB,
    private onTick: (updatedCount: number) => void,
    private intervalMs: number = 30000
  ) {}

  start(): void {
    console.log(`Tick runner started (interval: ${this.intervalMs}ms)`);
    this.intervalId = setInterval(() => this.runTick(), this.intervalMs);
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      console.log('Tick runner stopped');
    }
  }

  async runTick(): Promise<void> {
    try {
      const wallets = await this.db.getAllActiveWallets();
      const totalSupply = await this.db.getTotalSupply();
      const updates: WalletStateUpdate[] = [];

      for (const wallet of wallets) {
        const update = applyTickToWallet(wallet, totalSupply);
        // Only include if something changed
        if (
          update.house_tier !== wallet.house_tier ||
          update.build_progress !== parseFloat(wallet.build_progress) ||
          update.damage_pct !== parseFloat(wallet.damage_pct) ||
          update.build_speed_mult !== parseFloat(wallet.build_speed_mult)
        ) {
          updates.push(update);
        }
      }

      if (updates.length > 0) {
        await this.db.batchUpdateWallets(updates);
      }

      this.onTick(updates.length);
    } catch (err) {
      console.error('Tick error:', err);
    }
  }
}
