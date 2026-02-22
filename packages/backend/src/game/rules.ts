// All game mechanic constants. Tunable via environment variables.

export const TIER_THRESHOLDS = [
  { tier: 0, minPct: 0, label: 'None' },
  { tier: 1, minPct: 0.001, label: 'Shack' },
  { tier: 2, minPct: 0.1, label: 'Small House' },
  { tier: 3, minPct: 1.0, label: 'Medium Build' },
  { tier: 4, minPct: 5.0, label: 'Large Tower' },
  { tier: 5, minPct: 20.0, label: 'Megastructure' },
];

export function getTier(walletPct: number): number {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (walletPct >= TIER_THRESHOLDS[i].minPct) return TIER_THRESHOLDS[i].tier;
  }
  return 0;
}

// Build progress
export const BASE_BUILD_RATE = parseFloat(process.env.BASE_BUILD_RATE || '0.5');
export const MAX_BUILD_SPEED_MULT = parseFloat(process.env.MAX_BUILD_SPEED_MULT || '5.0');
export const BUY_BOOST_DURATION_MS = parseInt(process.env.BUY_BOOST_DURATION_MS || String(2 * 60 * 60 * 1000));
export const BUY_BOOST_PER_TRADE = parseFloat(process.env.BUY_BOOST_PER_TRADE || '0.5');

// Damage
export const DAMAGE_PER_PCT_SOLD = parseFloat(process.env.DAMAGE_PER_PCT_SOLD || '2.0');
export const MAX_DAMAGE_PER_SELL = parseFloat(process.env.MAX_DAMAGE_PER_SELL || '40.0');
export const REPAIR_RATE_PER_TICK = parseFloat(process.env.REPAIR_RATE_PER_TICK || '0.3');

// Transfer damage is 50% of normal sell damage
export const TRANSFER_DAMAGE_MULT = 0.5;

export function calcDamage(tokensSold: bigint, balanceBefore: bigint): number {
  if (balanceBefore <= 0n) return 0;
  const pctSold = (Number(tokensSold) / Number(balanceBefore)) * 100;
  return Math.min(MAX_DAMAGE_PER_SELL, pctSold * DAMAGE_PER_PCT_SOLD);
}

export function calcBuildSpeedBoost(currentMult: number): number {
  return Math.min(MAX_BUILD_SPEED_MULT, currentMult + BUY_BOOST_PER_TRADE);
}

export function calcTierDowngradeProgress(
  oldTier: number,
  newTier: number,
  currentProgress: number
): number {
  if (newTier >= oldTier || oldTier === 0) return currentProgress;
  return (newTier / oldTier) * currentProgress;
}

export function walletPctOfSupply(balance: bigint, totalSupply: bigint): number {
  if (totalSupply <= 0n) return 0;
  return (Number(balance) / Number(totalSupply)) * 100;
}

export function colorHueFromAddress(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  return ((hash % 360) + 360) % 360;
}
