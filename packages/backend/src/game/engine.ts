import { DB, WalletRow, WalletStateUpdate } from '../db/queries';
import {
  getTier,
  walletPctOfSupply,
  calcDamage,
  calcBuildSpeedBoost,
  calcTierDowngradeProgress,
  colorHueFromAddress,
  BUY_BOOST_DURATION_MS,
} from './rules';
import { log } from '../utils/logger';
import { TownState, findPlotForHolder, applyAction, getArchetypeForTier, DISTRICT_NAMES } from '../town-sim/index';

const PROBATION_MS = parseInt(process.env.BOT_PROBATION_MS || '30000');

/** Wallets on probation: address → expiry timestamp. Exported for decision-queue. */
export const probationMap = new Map<string, number>();

export interface GameEvent {
  type: 'buy' | 'sell';
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
  private townState: TownState | null = null;

  constructor(private db: DB) {}

  setTownState(state: TownState): void {
    this.townState = state;
  }

  async processEvent(event: GameEvent): Promise<ProcessedUpdate | null> {
    let wallet = await this.db.getWallet(event.walletAddress);
    let isNew = false;

    // New wallet — create first so trade_events FK is satisfied
    if (!wallet) {
      const hue = colorHueFromAddress(event.walletAddress);
      const totalSupply = await this.db.getTotalSupply();
      const effectiveSupply = totalSupply + event.newBalance; // include this wallet's new balance
      const pct = walletPctOfSupply(event.newBalance, effectiveSupply);
      const maxTier = getTier(pct); // used for plot selection (whales get central plots)

      // Try tilemap plot first, fall back to spiral grid
      let plotX = 0, plotY = 0;
      if (this.townState) {
        const tmPlot = findPlotForHolder(this.townState, maxTier);
        if (tmPlot) {
          plotX = tmPlot.originX;
          plotY = tmPlot.originY;
          const archetype = getArchetypeForTier(1);
          applyAction(this.townState, {
            type: 'PLACE_BUILDING_ON_PLOT',
            plotId: tmPlot.id,
            archetypeId: archetype.id,
            ownerAddress: event.walletAddress,
          });
        } else {
          const fallback = await this.db.getNextPlotForTier(maxTier);
          plotX = fallback.x;
          plotY = fallback.y;
        }
      } else {
        const fallback = await this.db.getNextPlotForTier(maxTier);
        plotX = fallback.x;
        plotY = fallback.y;
      }

      // Always start at tier 1 — progression happens via ticks
      wallet = await this.db.createWallet(
        event.walletAddress,
        event.newBalance,
        plotX,
        plotY,
        1,
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
          house_tier: 1,
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

    // Bot detection: if wallet sells while still on probation, flag it
    if (
      event.type === 'sell' &&
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
    const maxTier = getTier(pct); // ceiling — tier only goes UP via tick progression
    const currentTier = wallet.house_tier;

    let buildProgress = parseFloat(wallet.build_progress);
    let damagePct = parseFloat(wallet.damage_pct);
    let buildSpeedMult = parseFloat(wallet.build_speed_mult);
    let boostExpiresAt = wallet.boost_expires_at;
    let houseTier = currentTier;

    switch (event.type) {
      case 'buy': {
        // Boost build speed — tier stays the same, progression via ticks
        buildSpeedMult = calcBuildSpeedBoost(buildSpeedMult);
        boostExpiresAt = new Date(Date.now() + BUY_BOOST_DURATION_MS);
        break;
      }

      case 'sell': {
        const absDelta = event.tokenAmountDelta < 0n ? -event.tokenAmountDelta : event.tokenAmountDelta;
        const damage = calcDamage(absDelta, event.previousBalance);

        damagePct = Math.min(100, damagePct + damage);

        // If fully destroyed, reset
        if (damagePct >= 100) {
          damagePct = 0;
          buildProgress = 0;
        }

        // Sell downgrade — if maxTier dropped below current tier, force downgrade
        if (maxTier < currentTier) {
          buildProgress = calcTierDowngradeProgress(currentTier, maxTier, buildProgress);
          houseTier = maxTier;
        }
        break;
      }
    }

    // Zero balance — destroyed (tier 0)
    if (event.newBalance <= 0n) {
      houseTier = 0;
      buildProgress = 0;
      damagePct = 0;
      buildSpeedMult = 1;
      boostExpiresAt = null;
    }

    const update: WalletStateUpdate = {
      address: event.walletAddress,
      token_balance: event.newBalance,
      house_tier: houseTier,
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
