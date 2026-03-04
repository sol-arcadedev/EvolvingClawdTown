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
export const BASE_BUILD_RATE = parseFloat(process.env.BASE_BUILD_RATE || '100');
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

// Holding duration bonus thresholds (in ms)
const HOLD_BONUS_1_MS = parseInt(process.env.HOLD_BONUS_1_MS || '60000');   // +1 tier after 60s
const HOLD_BONUS_2_MS = parseInt(process.env.HOLD_BONUS_2_MS || '180000');  // +2 tier after 180s
const MAX_TIER = 5;

export function getEffectiveTier(baseTier: number, holdingDurationMs: number): number {
  let bonus = 0;
  if (holdingDurationMs >= HOLD_BONUS_2_MS) bonus = 2;
  else if (holdingDurationMs >= HOLD_BONUS_1_MS) bonus = 1;
  return Math.min(MAX_TIER, baseTier + bonus);
}

// Cyberpunk-friendly hue bands (skip greens 50-160 and dull yellows 35-50)
const CYBER_HUES = [
  [170, 210],  // cyan / teal
  [210, 270],  // blue / indigo
  [270, 330],  // purple / magenta
  [330, 360],  // pink / hot pink
  [0, 35],     // red / warm red
];
// Total span of usable hues
const CYBER_TOTAL = CYBER_HUES.reduce((s, [a, b]) => s + (b - a), 0); // 225°

export function colorHueFromAddress(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  // Map hash to a position within the cyberpunk hue bands
  let pos = ((hash % CYBER_TOTAL) + CYBER_TOTAL) % CYBER_TOTAL;
  for (const [start, end] of CYBER_HUES) {
    const span = end - start;
    if (pos < span) return start + pos;
    pos -= span;
  }
  return 200; // fallback: blue
}
