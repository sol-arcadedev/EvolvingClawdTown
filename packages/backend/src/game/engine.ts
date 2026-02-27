import { DB, WalletRow, WalletStateUpdate } from '../db/queries';
import {
  getTier,
  getEffectiveTier,
  walletPctOfSupply,
  calcDamage,
  calcBuildSpeedBoost,
  calcTierDowngradeProgress,
  colorHueFromAddress,
  BUY_BOOST_DURATION_MS,
  TRANSFER_DAMAGE_MULT,
} from './rules';
import { log } from '../utils/logger';

const PROBATION_MS = parseInt(process.env.BOT_PROBATION_MS || '30000');

/** Wallets on probation: address → expiry timestamp. Exported for decision-queue. */
export const probationMap = new Map<string, number>();

export interface GameEvent {
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  walletAddress: string;
  tokenAmountDelta: bigint; // positive = incoming, negative = outgoing
  previousBalance: bigint;
  newBalance: bigint;
  txSignature: string;
  solAmount: bigint | null;
  timestamp: Date;
}

export interface ProcessedUpdate {
  walletState: WalletStateUpdate;
  walletRow: WalletRow;
  event: GameEvent;
  isNew: boolean;
}

export class GameEngine {
  constructor(private db: DB) {}

  async processEvent(event: GameEvent): Promise<ProcessedUpdate | null> {
    let wallet = await this.db.getWallet(event.walletAddress);
    let isNew = false;

    // New wallet — create first so trade_events FK is satisfied
    if (!wallet) {
      const plot = await this.db.getNextPlot();
      const hue = colorHueFromAddress(event.walletAddress);
      const totalSupply = await this.db.getTotalSupply();
      const effectiveSupply = totalSupply + event.newBalance; // include this wallet's new balance
      const pct = walletPctOfSupply(event.newBalance, effectiveSupply);
      const tier = getTier(pct);

      wallet = await this.db.createWallet(
        event.walletAddress,
        event.newBalance,
        plot.x,
        plot.y,
        tier,
        hue
      );
      isNew = true;

      // Put new wallet on probation — bots that sell quickly will be caught
      probationMap.set(event.walletAddress, Date.now() + PROBATION_MS);

      // Idempotency check — insert trade event after wallet exists
      const inserted = await this.db.insertTradeEvent(
        event.txSignature,
        event.walletAddress,
        event.type,
        event.tokenAmountDelta < 0n ? -event.tokenAmountDelta : event.tokenAmountDelta,
        event.solAmount
      );
      if (!inserted) return null; // duplicate

      return {
        walletState: {
          address: event.walletAddress,
          token_balance: event.newBalance,
          house_tier: tier,
          build_progress: 0,
          damage_pct: 0,
          build_speed_mult: 1,
          boost_expires_at: null,
        },
        walletRow: wallet,
        event,
        isNew,
      };
    }

    // Existing wallet — idempotency check
    const inserted = await this.db.insertTradeEvent(
      event.txSignature,
      event.walletAddress,
      event.type,
      event.tokenAmountDelta < 0n ? -event.tokenAmountDelta : event.tokenAmountDelta,
      event.solAmount
    );
    if (!inserted) return null; // duplicate

    // Bot detection: if wallet sells/transfers out while still on probation, flag it
    if (
      (event.type === 'sell' || event.type === 'transfer_out') &&
      probationMap.has(event.walletAddress)
    ) {
      const expiry = probationMap.get(event.walletAddress)!;
      if (Date.now() < expiry) {
        log.info(`Bot detected: ${event.walletAddress.slice(0, 8)}... sold during probation`);
        probationMap.delete(event.walletAddress);
      }
    }

    // Existing wallet — apply game rules
    const totalSupply = await this.db.getTotalSupply();
    const pct = walletPctOfSupply(event.newBalance, totalSupply);
    const baseTier = getTier(pct);
    const holdingDurationMs = Date.now() - wallet.first_seen_at.getTime();
    const newTier = getEffectiveTier(baseTier, holdingDurationMs);
    const oldTier = wallet.house_tier;

    let buildProgress = parseFloat(wallet.build_progress);
    let damagePct = parseFloat(wallet.damage_pct);
    let buildSpeedMult = parseFloat(wallet.build_speed_mult);
    let boostExpiresAt = wallet.boost_expires_at;

    switch (event.type) {
      case 'buy':
      case 'transfer_in': {
        // Boost build speed
        buildSpeedMult = calcBuildSpeedBoost(buildSpeedMult);
        boostExpiresAt = new Date(Date.now() + BUY_BOOST_DURATION_MS);
        break;
      }

      case 'sell':
      case 'transfer_out': {
        const absDelta = event.tokenAmountDelta < 0n ? -event.tokenAmountDelta : event.tokenAmountDelta;
        let damage = calcDamage(absDelta, event.previousBalance);

        if (event.type === 'transfer_out') {
          damage *= TRANSFER_DAMAGE_MULT;
        }

        damagePct = Math.min(100, damagePct + damage);

        // If fully destroyed, reset
        if (damagePct >= 100) {
          damagePct = 0;
          buildProgress = 0;
        }

        // Tier downgrade — clamp progress
        if (newTier < oldTier) {
          buildProgress = calcTierDowngradeProgress(oldTier, newTier, buildProgress);
        }
        break;
      }
    }

    // Zero balance — no house
    if (event.newBalance <= 0n) {
      buildProgress = 0;
      damagePct = 0;
      buildSpeedMult = 1;
      boostExpiresAt = null;
    }

    const update: WalletStateUpdate = {
      address: event.walletAddress,
      token_balance: event.newBalance,
      house_tier: newTier,
      build_progress: Math.round(buildProgress * 100) / 100,
      damage_pct: Math.round(damagePct * 100) / 100,
      build_speed_mult: Math.round(buildSpeedMult * 100) / 100,
      boost_expires_at: boostExpiresAt,
    };

    const updatedRow = await this.db.updateWallet(event.walletAddress, update);

    return {
      walletState: update,
      walletRow: updatedRow,
      event,
      isNew,
    };
  }
}
