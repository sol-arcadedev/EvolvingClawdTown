import { DB, WalletRow, WalletStateUpdate } from '../db/queries';
import { BASE_BUILD_RATE, REPAIR_RATE_PER_TICK } from './rules';

export function applyTickToWallet(wallet: WalletRow): WalletStateUpdate {
  let buildProgress = parseFloat(wallet.build_progress);
  let damagePct = parseFloat(wallet.damage_pct);
  let buildSpeedMult = parseFloat(wallet.build_speed_mult);
  let boostExpiresAt = wallet.boost_expires_at;
  const balance = BigInt(wallet.token_balance);

  // Skip wallets with zero balance
  if (balance <= 0n) {
    return {
      address: wallet.address,
      token_balance: balance,
      house_tier: wallet.house_tier,
      build_progress: buildProgress,
      damage_pct: damagePct,
      build_speed_mult: buildSpeedMult,
      boost_expires_at: boostExpiresAt,
    };
  }

  // Expire boost
  if (boostExpiresAt && new Date() > boostExpiresAt) {
    buildSpeedMult = 1.0;
    boostExpiresAt = null;
  }

  // Build progress
  if (buildProgress < 100) {
    const effectiveRate = BASE_BUILD_RATE * buildSpeedMult;
    buildProgress = Math.min(100, buildProgress + effectiveRate);
  }

  // Repair damage over time
  if (damagePct > 0) {
    damagePct = Math.max(0, damagePct - REPAIR_RATE_PER_TICK);
  }

  return {
    address: wallet.address,
    token_balance: balance,
    house_tier: wallet.house_tier,
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
      const updates: WalletStateUpdate[] = [];

      for (const wallet of wallets) {
        const update = applyTickToWallet(wallet);
        // Only include if something changed
        if (
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
