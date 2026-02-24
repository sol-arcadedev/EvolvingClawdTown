/**
 * Token Launch Simulator
 *
 * Simulates a realistic token launch by generating fake trade events
 * and feeding them through the real GameEngine pipeline.
 *
 * Usage:  npx tsx scripts/simulate-launch.ts [--reset]
 *
 * Flags:
 *   --reset           — wipe all existing wallets/trades/plots before starting
 *
 * Env vars:
 *   SIM_SPEED=1      — real-time (default), 2 = 2x faster, etc.
 *   SIM_HOLDERS=150   — target holder count
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { Pool } from 'pg';
import WebSocket from 'ws';
import { DB } from '../src/db/queries';
import { GameEngine, GameEvent } from '../src/game/engine';

// --------------- Config ---------------

const SIM_SPEED = parseFloat(process.env.SIM_SPEED || '1');
const SIM_HOLDERS = parseInt(process.env.SIM_HOLDERS || '200');
const TOTAL_SUPPLY = 1_000_000_000n; // 1B tokens

// --------------- Helpers ---------------

const BASE58_CHARS = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function randomBase58(len: number): string {
  let out = '';
  for (let i = 0; i < len; i++) {
    out += BASE58_CHARS[Math.floor(Math.random() * BASE58_CHARS.length)];
  }
  return out;
}

function randomWalletAddress(): string {
  return randomBase58(44);
}

function randomTxSignature(): string {
  return randomBase58(88);
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms / SIM_SPEED));
}

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomBigIntRange(min: bigint, max: bigint): bigint {
  const range = Number(max - min);
  return min + BigInt(Math.floor(Math.random() * range));
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function formatElapsed(startMs: number): string {
  const elapsed = Math.floor((Date.now() - startMs) / 1000);
  const m = Math.floor(elapsed / 60);
  const s = elapsed % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatTokens(amount: bigint): string {
  const n = Number(amount);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toString();
}

// --------------- Wallet Tracker ---------------

interface SimWallet {
  address: string;
  balance: bigint;
}

class WalletPool {
  wallets: SimWallet[] = [];

  createNew(): SimWallet {
    const w: SimWallet = { address: randomWalletAddress(), balance: 0n };
    this.wallets.push(w);
    return w;
  }

  getExisting(): SimWallet | null {
    const active = this.wallets.filter((w) => w.balance > 0n);
    return active.length > 0 ? pickRandom(active) : null;
  }

  getForSell(): SimWallet | null {
    const active = this.wallets.filter((w) => w.balance > 100_000n);
    return active.length > 0 ? pickRandom(active) : null;
  }

  get holderCount(): number {
    return this.wallets.filter((w) => w.balance > 0n).length;
  }
}

// --------------- Trade Generator ---------------

function generateBuyAmount(category: 'small' | 'medium' | 'large' | 'whale'): bigint {
  switch (category) {
    case 'small':
      return randomBigIntRange(10_000n, 100_000n);
    case 'medium':
      return randomBigIntRange(1_000_000n, 10_000_000n);
    case 'large':
      return randomBigIntRange(50_000_000n, 200_000_000n);
    case 'whale':
      return randomBigIntRange(200_000_000n, 500_000_000n);
  }
}

function pickBuyCategory(): 'small' | 'medium' | 'large' | 'whale' {
  const r = Math.random();
  if (r < 0.70) return 'small';
  if (r < 0.90) return 'medium';
  if (r < 0.98) return 'large';
  return 'whale';
}

// --------------- Main ---------------

async function main() {
  console.log('=== Claude Town Token Launch Simulator ===');
  console.log(`Speed: ${SIM_SPEED}x | Target holders: ${SIM_HOLDERS}`);
  console.log('');

  // Database
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new DB(pool);

  // Reset if requested
  const shouldReset = process.argv.includes('--reset');
  if (shouldReset) {
    console.log('[init] Resetting database (--reset flag)...');
    await pool.query('TRUNCATE wallets, trade_events, plot_grid RESTART IDENTITY CASCADE');
    console.log('[init] Database cleared');
  }

  // Connect to backend WebSocket for live relay to frontends
  const wsUrl = process.env.VITE_WS_URL || 'ws://localhost:3001';
  let ws: WebSocket | null = null;
  try {
    ws = await new Promise<WebSocket>((resolve, reject) => {
      const sock = new WebSocket(`${wsUrl}/ws`);
      const timeout = setTimeout(() => { sock.terminate(); reject(new Error('timeout')); }, 3000);
      sock.on('open', () => { clearTimeout(timeout); resolve(sock); });
      sock.on('error', (err) => { clearTimeout(timeout); reject(err); });
    });
    console.log('[init] WebSocket connected to backend — live updates enabled');
  } catch {
    console.log('[init] Could not connect to backend WS — no live broadcast (refresh frontend to see changes)');
    ws = null;
  }

  const engine = new GameEngine(db);
  const walletPool = new WalletPool();
  const startTime = Date.now();

  // Relay a message through the backend WS server to all frontend clients
  function relay(message: Record<string, any>) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'relay', payload: message }));
  }

  // Publish update to connected frontends (mirrors index.ts broadcast format)
  function publishUpdate(result: NonNullable<Awaited<ReturnType<typeof engine.processEvent>>>, event: GameEvent) {
    relay({
      type: 'wallet_update',
      wallet: {
        address: result.walletRow.address,
        tokenBalance: result.walletRow.token_balance,
        plotX: result.walletRow.plot_x,
        plotY: result.walletRow.plot_y,
        houseTier: result.walletRow.house_tier,
        buildProgress: parseFloat(result.walletRow.build_progress),
        damagePct: parseFloat(result.walletRow.damage_pct),
        buildSpeedMult: parseFloat(result.walletRow.build_speed_mult),
        boostExpiresAt: result.walletRow.boost_expires_at?.toISOString() ?? null,
        colorHue: result.walletRow.color_hue,
        firstSeenAt: result.walletRow.first_seen_at.toISOString(),
        isNew: result.isNew,
      },
    });
    relay({
      type: 'trade',
      event: {
        walletAddress: event.walletAddress,
        eventType: event.type,
        tokenAmountDelta: event.tokenAmountDelta.toString(),
        timestamp: event.timestamp.toISOString(),
      },
    });
  }

  // Process a single trade
  async function executeTrade(type: 'buy' | 'sell', wallet: SimWallet, amount: bigint) {
    const previousBalance = wallet.balance;
    let newBalance: bigint;
    let delta: bigint;

    if (type === 'buy') {
      newBalance = previousBalance + amount;
      delta = amount;
      wallet.balance = newBalance;
    } else {
      const sellAmount = amount > previousBalance ? previousBalance : amount;
      newBalance = previousBalance - sellAmount;
      delta = -sellAmount;
      wallet.balance = newBalance;
    }

    const event: GameEvent = {
      type,
      walletAddress: wallet.address,
      tokenAmountDelta: delta,
      previousBalance,
      newBalance,
      txSignature: randomTxSignature(),
      solAmount: null,
      timestamp: new Date(),
    };

    const result = await engine.processEvent(event);
    if (!result) return;

    publishUpdate(result, event);

    // Console output
    const elapsed = formatElapsed(startTime);
    const sign = type === 'buy' ? '+' : '-';
    const absAmount = delta < 0n ? -delta : delta;
    const addrShort = wallet.address.slice(0, 6) + '...';
    const tag = result.isNew ? '(NEW)' : type === 'buy' ? '(+)' : '';
    const tierLabel = `tier=${result.walletState.house_tier}`;
    const dmgLabel = result.walletState.damage_pct > 0 ? ` dmg=${result.walletState.damage_pct}%` : '';
    const whaleTag = result.walletState.house_tier >= 4 ? ' WHALE!' : '';

    console.log(
      `[${elapsed}] ${type.toUpperCase().padEnd(4)} ${sign}${formatTokens(absAmount).padEnd(8)} → ${addrShort} ${tag.padEnd(5)} ${tierLabel}${dmgLabel}${whaleTag} | holders: ${walletPool.holderCount}`
    );
  }

  // --------------- Phase definitions ---------------

  interface Phase {
    name: string;
    durationSec: number;
    minDelayMs: number;
    maxDelayMs: number;
    newWalletPct: number; // chance a trade goes to a new wallet
    sellChance: number;   // chance of sell vs buy
    buyCategories: () => 'small' | 'medium' | 'large' | 'whale';
  }

  const phases: Phase[] = [
    {
      // 0:00–0:30 — First buyers trickle in
      name: 'Early Snipers',
      durationSec: 30,
      minDelayMs: 1500,
      maxDelayMs: 3000,
      newWalletPct: 1.0,
      sellChance: 0,
      buyCategories: () => (Math.random() < 0.7 ? 'small' : 'medium'),
    },
    {
      // 0:30–1:30 — Word spreads, rapid buying
      name: 'FOMO Wave',
      durationSec: 60,
      minDelayMs: 400,
      maxDelayMs: 800,
      newWalletPct: 0.8,
      sellChance: 0.03,
      buyCategories: pickBuyCategory,
    },
    {
      // 1:30–2:15 — Early profit takers dump, holders dip
      name: 'Selloff Dip',
      durationSec: 45,
      minDelayMs: 500,
      maxDelayMs: 1200,
      newWalletPct: 0.15,
      sellChance: 0.55,
      buyCategories: () => (Math.random() < 0.6 ? 'small' : 'medium'),
    },
    {
      // 2:15–3:15 — Recovery, new buyers come in, some sells
      name: 'Recovery',
      durationSec: 60,
      minDelayMs: 400,
      maxDelayMs: 900,
      newWalletPct: 0.7,
      sellChance: 0.12,
      buyCategories: pickBuyCategory,
    },
    {
      // 3:15–4:00 — Second wave of selling, churn
      name: 'Consolidation',
      durationSec: 45,
      minDelayMs: 600,
      maxDelayMs: 1400,
      newWalletPct: 0.35,
      sellChance: 0.35,
      buyCategories: () => {
        const r = Math.random();
        if (r < 0.40) return 'small';
        if (r < 0.70) return 'medium';
        if (r < 0.90) return 'large';
        return 'whale';
      },
    },
    {
      // 4:00–5:00 — Final surge to 200 holders
      name: 'Final Surge',
      durationSec: 60,
      minDelayMs: 300,
      maxDelayMs: 700,
      newWalletPct: 0.85,
      sellChance: 0.05,
      buyCategories: pickBuyCategory,
    },
  ];

  // --------------- Run simulation ---------------

  let totalTrades = 0;

  for (const phase of phases) {
    console.log(`\n--- Phase: ${phase.name} (${phase.durationSec}s) ---\n`);
    const phaseEnd = Date.now() + (phase.durationSec * 1000) / SIM_SPEED;

    while (Date.now() < phaseEnd && walletPool.holderCount < SIM_HOLDERS) {
      const isSell = Math.random() < phase.sellChance;

      if (isSell) {
        const seller = walletPool.getForSell();
        if (seller) {
          const sellPct = randomBetween(0.1, 0.5);
          const sellAmount = BigInt(Math.floor(Number(seller.balance) * sellPct));
          await executeTrade('sell', seller, sellAmount);
          totalTrades++;
        }
      } else {
        const isNewWallet = Math.random() < phase.newWalletPct || walletPool.wallets.length === 0;
        let wallet: SimWallet;

        if (isNewWallet) {
          wallet = walletPool.createNew();
        } else {
          wallet = walletPool.getExisting() || walletPool.createNew();
        }

        const category = phase.buyCategories();
        const amount = generateBuyAmount(category);
        await executeTrade('buy', wallet, amount);
        totalTrades++;
      }

      const delay = randomBetween(phase.minDelayMs, phase.maxDelayMs);
      await sleep(delay);
    }

    if (walletPool.holderCount >= SIM_HOLDERS) {
      console.log(`\nTarget holder count (${SIM_HOLDERS}) reached!`);
      break;
    }
  }

  // --------------- Summary ---------------

  const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n=== Simulation Complete ===');
  console.log(`Duration: ${elapsedSec}s (wall clock)`);
  console.log(`Total trades: ${totalTrades}`);
  console.log(`Holders: ${walletPool.holderCount}`);

  const stats = await db.getStats();
  console.log(`DB stats: ${stats.totalHolders} holders, ${stats.totalTrades} trades`);

  // Cleanup
  ws?.close();
  await db.end();
  process.exit(0);
}

main().catch((err) => {
  console.error('Simulation failed:', err);
  process.exit(1);
});
