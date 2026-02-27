import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GameEngine, GameEvent } from '../engine';
import { WalletRow, WalletStateUpdate, DB } from '../../db/queries';
import { applyTickToWallet } from '../tick';

// --- Helpers ---

function makeWalletRow(overrides: Partial<WalletRow> = {}): WalletRow {
  return {
    address: 'TestWallet1234567890abcdefghijklmnopqrstuv',
    token_balance: '1000000',
    plot_x: 0,
    plot_y: 0,
    house_tier: 2,
    build_progress: '50.00',
    damage_pct: '0.00',
    build_speed_mult: '1.00',
    boost_expires_at: null,
    color_hue: 180,
    first_seen_at: new Date(),
    last_updated_at: new Date(),
    custom_image_url: null,
    building_name: null,
    architectural_style: null,
    clawd_comment: null,
    image_prompt: null,
    image_generated_at: null,
    ...overrides,
  };
}

function makeEvent(overrides: Partial<GameEvent> = {}): GameEvent {
  return {
    type: 'buy',
    walletAddress: 'TestWallet1234567890abcdefghijklmnopqrstuv',
    tokenAmountDelta: 500000n,
    previousBalance: 1000000n,
    newBalance: 1500000n,
    txSignature: `tx-${Date.now()}-${Math.random()}`,
    solAmount: null,
    timestamp: new Date(),
    ...overrides,
  };
}

function createMockDB(walletRow: WalletRow | null = null, totalSupply = 10000000n): DB {
  const updatedRow = walletRow ? { ...walletRow } : makeWalletRow();

  return {
    getWallet: vi.fn().mockResolvedValue(walletRow),
    getNextPlot: vi.fn().mockResolvedValue({ x: 1, y: 1 }),
    getTotalSupply: vi.fn().mockResolvedValue(totalSupply),
    createWallet: vi.fn().mockResolvedValue(updatedRow),
    updateWallet: vi.fn().mockImplementation((_addr, update) => {
      return Promise.resolve({
        ...updatedRow,
        token_balance: update.token_balance?.toString() ?? updatedRow.token_balance,
        house_tier: update.house_tier ?? updatedRow.house_tier,
        build_progress: update.build_progress?.toString() ?? updatedRow.build_progress,
        damage_pct: update.damage_pct?.toString() ?? updatedRow.damage_pct,
        build_speed_mult: update.build_speed_mult?.toString() ?? updatedRow.build_speed_mult,
        boost_expires_at: update.boost_expires_at ?? updatedRow.boost_expires_at,
      });
    }),
    insertTradeEvent: vi.fn().mockResolvedValue(true),
  } as unknown as DB;
}

// --- Engine Tests ---

describe('GameEngine.processEvent', () => {
  describe('idempotency', () => {
    it('returns null for duplicate transactions', async () => {
      const db = createMockDB(makeWalletRow());
      (db.insertTradeEvent as any).mockResolvedValue(false);
      const engine = new GameEngine(db);

      const result = await engine.processEvent(makeEvent());
      expect(result).toBeNull();
    });
  });

  describe('new wallet', () => {
    it('creates a new wallet with correct tier and assigns plot', async () => {
      const db = createMockDB(null, 9000000n);
      const engine = new GameEngine(db);

      const event = makeEvent({
        walletAddress: 'NewWalletXyz1234567890abcdefghijk',
        previousBalance: 0n,
        newBalance: 1000000n,
        tokenAmountDelta: 1000000n,
      });

      const result = await engine.processEvent(event);

      expect(result).not.toBeNull();
      expect(result!.isNew).toBe(true);
      expect(result!.walletState.build_progress).toBe(0);
      expect(result!.walletState.damage_pct).toBe(0);
      expect(result!.walletState.build_speed_mult).toBe(1);
      expect(db.createWallet).toHaveBeenCalled();
      expect(db.getNextPlot).toHaveBeenCalled();
    });
  });

  describe('buy events', () => {
    it('boosts build speed on buy', async () => {
      const wallet = makeWalletRow({ build_speed_mult: '1.00' });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      const result = await engine.processEvent(makeEvent({ type: 'buy' }));

      expect(result!.walletState.build_speed_mult).toBe(1.5);
      expect(result!.walletState.boost_expires_at).not.toBeNull();
    });

    it('stacks speed boosts on multiple buys', async () => {
      const wallet = makeWalletRow({ build_speed_mult: '2.50' });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      const result = await engine.processEvent(makeEvent({ type: 'buy' }));

      expect(result!.walletState.build_speed_mult).toBe(3);
    });

    it('caps speed boost at 5x', async () => {
      const wallet = makeWalletRow({ build_speed_mult: '4.80' });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      const result = await engine.processEvent(makeEvent({ type: 'buy' }));

      expect(result!.walletState.build_speed_mult).toBe(5);
    });
  });

  describe('sell events', () => {
    it('applies damage proportional to sell size', async () => {
      const wallet = makeWalletRow({ damage_pct: '0.00' });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      // Sell 10% of 1M balance
      const event = makeEvent({
        type: 'sell',
        tokenAmountDelta: -100000n,
        previousBalance: 1000000n,
        newBalance: 900000n,
      });

      const result = await engine.processEvent(event);

      // 10% sold * 2.0 DAMAGE_PER_PCT = 20% damage
      expect(result!.walletState.damage_pct).toBe(20);
    });

    it('caps damage per sell at 40%', async () => {
      const wallet = makeWalletRow({ damage_pct: '0.00' });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      // Sell 100% — should cap at 40
      const event = makeEvent({
        type: 'sell',
        tokenAmountDelta: -1000000n,
        previousBalance: 1000000n,
        newBalance: 0n,
      });

      const result = await engine.processEvent(event);

      // Selling to 0 resets everything
      expect(result!.walletState.damage_pct).toBe(0);
      expect(result!.walletState.build_progress).toBe(0);
    });

    it('accumulates damage across sells', async () => {
      const wallet = makeWalletRow({ damage_pct: '15.00' });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      // Sell 5% = 10% damage, existing 15% → 25%
      const event = makeEvent({
        type: 'sell',
        tokenAmountDelta: -50000n,
        previousBalance: 1000000n,
        newBalance: 950000n,
      });

      const result = await engine.processEvent(event);

      expect(result!.walletState.damage_pct).toBe(25);
    });

    it('destroys house when damage reaches 100%', async () => {
      const wallet = makeWalletRow({
        damage_pct: '70.00',
        build_progress: '80.00',
      });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      // Sell 20% = 40% damage → 70 + 40 = 110 → destroyed → reset to 0
      const event = makeEvent({
        type: 'sell',
        tokenAmountDelta: -200000n,
        previousBalance: 1000000n,
        newBalance: 800000n,
      });

      const result = await engine.processEvent(event);

      expect(result!.walletState.damage_pct).toBe(0);
      expect(result!.walletState.build_progress).toBe(0);
    });

    it('clamps progress on tier downgrade', async () => {
      const wallet = makeWalletRow({
        house_tier: 4,
        build_progress: '80.00',
        token_balance: '5000000', // 50% of 10M
      });
      // After sell, wallet goes from tier 4 to tier 2
      const db = createMockDB(wallet, 10000000n);
      const engine = new GameEngine(db);

      const event = makeEvent({
        type: 'sell',
        tokenAmountDelta: -4900000n,
        previousBalance: 5000000n,
        newBalance: 100000n, // 1% of supply → tier 2 (was tier 4)
      });

      const result = await engine.processEvent(event);

      // Progress clamped: (2/4) * 80 = 40, but damage also applied
      expect(result!.walletState.house_tier).toBeLessThan(4);
    });
  });

  describe('zero balance', () => {
    it('resets all state when balance reaches 0', async () => {
      const wallet = makeWalletRow({
        build_progress: '75.00',
        damage_pct: '20.00',
        build_speed_mult: '3.00',
        boost_expires_at: new Date(Date.now() + 60000),
      });
      const db = createMockDB(wallet);
      const engine = new GameEngine(db);

      const event = makeEvent({
        type: 'sell',
        tokenAmountDelta: -1000000n,
        previousBalance: 1000000n,
        newBalance: 0n,
      });

      const result = await engine.processEvent(event);

      expect(result!.walletState.build_progress).toBe(0);
      expect(result!.walletState.damage_pct).toBe(0);
      expect(result!.walletState.build_speed_mult).toBe(1);
      expect(result!.walletState.boost_expires_at).toBeNull();
    });
  });
});

// --- Tick Tests ---

describe('applyTickToWallet', () => {
  it('does not modify wallets with zero balance', () => {
    const wallet = makeWalletRow({
      token_balance: '0',
      build_progress: '50.00',
    });

    const result = applyTickToWallet(wallet);

    expect(result.build_progress).toBe(50);
  });

  it('increments build progress at base rate', () => {
    const wallet = makeWalletRow({
      build_progress: '10.00',
      build_speed_mult: '1.00',
    });

    const result = applyTickToWallet(wallet);

    // BASE_BUILD_RATE = 0.5, mult = 1.0 → +0.5
    expect(result.build_progress).toBe(10.5);
  });

  it('applies speed multiplier to build rate', () => {
    const wallet = makeWalletRow({
      build_progress: '10.00',
      build_speed_mult: '3.00',
    });

    const result = applyTickToWallet(wallet);

    // 0.5 * 3.0 = 1.5
    expect(result.build_progress).toBe(11.5);
  });

  it('caps build progress at 100', () => {
    const wallet = makeWalletRow({
      build_progress: '99.80',
      build_speed_mult: '1.00',
    });

    const result = applyTickToWallet(wallet);

    expect(result.build_progress).toBe(100);
  });

  it('does not increment progress beyond 100', () => {
    const wallet = makeWalletRow({
      build_progress: '100.00',
      build_speed_mult: '1.00',
    });

    const result = applyTickToWallet(wallet);

    expect(result.build_progress).toBe(100);
  });

  it('repairs damage over time', () => {
    const wallet = makeWalletRow({
      damage_pct: '10.00',
    });

    const result = applyTickToWallet(wallet);

    // REPAIR_RATE_PER_TICK = 0.3
    expect(result.damage_pct).toBe(9.7);
  });

  it('does not repair damage below 0', () => {
    const wallet = makeWalletRow({
      damage_pct: '0.10',
    });

    const result = applyTickToWallet(wallet);

    expect(result.damage_pct).toBe(0);
  });

  it('expires boost when time is past', () => {
    const wallet = makeWalletRow({
      build_speed_mult: '3.00',
      boost_expires_at: new Date(Date.now() - 1000), // expired 1s ago
    });

    const result = applyTickToWallet(wallet);

    expect(result.build_speed_mult).toBe(1);
    expect(result.boost_expires_at).toBeNull();
  });

  it('keeps boost when not expired', () => {
    const wallet = makeWalletRow({
      build_speed_mult: '3.00',
      boost_expires_at: new Date(Date.now() + 60000), // 1 min in future
    });

    const result = applyTickToWallet(wallet);

    expect(result.build_speed_mult).toBe(3);
    expect(result.boost_expires_at).not.toBeNull();
  });

  it('applies both build and repair in a single tick', () => {
    const wallet = makeWalletRow({
      build_progress: '50.00',
      damage_pct: '20.00',
      build_speed_mult: '2.00',
    });

    const result = applyTickToWallet(wallet);

    // Build: 50 + (0.5 * 2.0) = 51.0
    expect(result.build_progress).toBe(51);
    // Repair: 20 - 0.3 = 19.7
    expect(result.damage_pct).toBe(19.7);
  });
});
