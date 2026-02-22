import { describe, it, expect } from 'vitest';
import {
  getTier,
  calcDamage,
  calcBuildSpeedBoost,
  calcTierDowngradeProgress,
  walletPctOfSupply,
  colorHueFromAddress,
  MAX_DAMAGE_PER_SELL,
  MAX_BUILD_SPEED_MULT,
} from '../rules';

describe('getTier', () => {
  it('returns tier 0 for 0%', () => {
    expect(getTier(0)).toBe(0);
  });

  it('returns tier 1 for tiny holders (>= 0.001%)', () => {
    expect(getTier(0.001)).toBe(1);
    expect(getTier(0.05)).toBe(1);
    expect(getTier(0.099)).toBe(1);
  });

  it('returns tier 2 for 0.1% - 1%', () => {
    expect(getTier(0.1)).toBe(2);
    expect(getTier(0.5)).toBe(2);
    expect(getTier(0.99)).toBe(2);
  });

  it('returns tier 3 for 1% - 5%', () => {
    expect(getTier(1.0)).toBe(3);
    expect(getTier(3.0)).toBe(3);
    expect(getTier(4.99)).toBe(3);
  });

  it('returns tier 4 for 5% - 20%', () => {
    expect(getTier(5.0)).toBe(4);
    expect(getTier(10.0)).toBe(4);
    expect(getTier(19.99)).toBe(4);
  });

  it('returns tier 5 for >= 20%', () => {
    expect(getTier(20.0)).toBe(5);
    expect(getTier(50.0)).toBe(5);
    expect(getTier(100.0)).toBe(5);
  });

  it('returns tier 0 for negative values', () => {
    expect(getTier(-1)).toBe(0);
  });
});

describe('calcDamage', () => {
  it('returns 0 when balance before is 0', () => {
    expect(calcDamage(100n, 0n)).toBe(0);
  });

  it('returns 0 when balance before is negative', () => {
    expect(calcDamage(100n, -10n)).toBe(0);
  });

  it('calculates damage proportional to sell percentage', () => {
    // Selling 10% of 1000 = 10% * 2.0 = 20% damage
    const damage = calcDamage(100n, 1000n);
    expect(damage).toBe(20);
  });

  it('calculates damage for selling 50% of stack', () => {
    // 50% * 2.0 = 100 → capped at MAX_DAMAGE_PER_SELL (40)
    const damage = calcDamage(500n, 1000n);
    expect(damage).toBe(MAX_DAMAGE_PER_SELL);
  });

  it('caps damage at MAX_DAMAGE_PER_SELL', () => {
    // Selling 100% = 100 * 2.0 = 200 → capped at 40
    const damage = calcDamage(1000n, 1000n);
    expect(damage).toBe(MAX_DAMAGE_PER_SELL);
  });

  it('handles small sells correctly', () => {
    // Selling 1% of 10000 = 1% * 2.0 = 2%
    const damage = calcDamage(100n, 10000n);
    expect(damage).toBe(2);
  });
});

describe('calcBuildSpeedBoost', () => {
  it('adds 0.5x per trade from base', () => {
    expect(calcBuildSpeedBoost(1.0)).toBe(1.5);
  });

  it('stacks multiple boosts', () => {
    expect(calcBuildSpeedBoost(2.0)).toBe(2.5);
    expect(calcBuildSpeedBoost(3.5)).toBe(4.0);
  });

  it('caps at MAX_BUILD_SPEED_MULT', () => {
    expect(calcBuildSpeedBoost(4.8)).toBe(MAX_BUILD_SPEED_MULT);
    expect(calcBuildSpeedBoost(5.0)).toBe(MAX_BUILD_SPEED_MULT);
    expect(calcBuildSpeedBoost(10.0)).toBe(MAX_BUILD_SPEED_MULT);
  });
});

describe('calcTierDowngradeProgress', () => {
  it('returns current progress when tier stays the same', () => {
    expect(calcTierDowngradeProgress(3, 3, 80)).toBe(80);
  });

  it('returns current progress when tier increases', () => {
    expect(calcTierDowngradeProgress(2, 4, 60)).toBe(60);
  });

  it('scales progress proportionally on downgrade', () => {
    // Tier 4 → 2: (2/4) * 80 = 40
    expect(calcTierDowngradeProgress(4, 2, 80)).toBe(40);
  });

  it('scales to 0 when downgrading to tier 0', () => {
    expect(calcTierDowngradeProgress(3, 0, 100)).toBe(0);
  });

  it('returns current progress when old tier is 0', () => {
    expect(calcTierDowngradeProgress(0, 0, 50)).toBe(50);
  });

  it('handles tier 5 → tier 1 downgrade', () => {
    // (1/5) * 100 = 20
    expect(calcTierDowngradeProgress(5, 1, 100)).toBe(20);
  });
});

describe('walletPctOfSupply', () => {
  it('returns 0 when total supply is 0', () => {
    expect(walletPctOfSupply(100n, 0n)).toBe(0);
  });

  it('returns 0 when total supply is negative', () => {
    expect(walletPctOfSupply(100n, -1n)).toBe(0);
  });

  it('calculates correct percentage', () => {
    expect(walletPctOfSupply(1n, 100n)).toBe(1);
    expect(walletPctOfSupply(50n, 100n)).toBe(50);
    expect(walletPctOfSupply(100n, 100n)).toBe(100);
  });

  it('handles large bigint values', () => {
    const supply = 1_000_000_000_000_000n;
    const balance = 10_000_000_000_000n; // 1%
    expect(walletPctOfSupply(balance, supply)).toBe(1);
  });

  it('returns small fractions correctly', () => {
    const supply = 1_000_000_000n;
    const balance = 10_000n; // 0.001%
    expect(walletPctOfSupply(balance, supply)).toBeCloseTo(0.001, 4);
  });
});

describe('colorHueFromAddress', () => {
  it('returns a value between 0 and 359', () => {
    const hue = colorHueFromAddress('SomeWalletAddress123');
    expect(hue).toBeGreaterThanOrEqual(0);
    expect(hue).toBeLessThan(360);
  });

  it('is deterministic — same address always gives same hue', () => {
    const addr = 'AbCdEfGh12345678';
    expect(colorHueFromAddress(addr)).toBe(colorHueFromAddress(addr));
  });

  it('different addresses produce different hues', () => {
    const hue1 = colorHueFromAddress('WalletA');
    const hue2 = colorHueFromAddress('WalletB');
    expect(hue1).not.toBe(hue2);
  });

  it('handles empty string', () => {
    const hue = colorHueFromAddress('');
    expect(hue).toBe(0);
  });
});
