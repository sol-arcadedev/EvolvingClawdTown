import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

import { Pool } from 'pg';
import { DB } from '../packages/backend/src/db/queries';
import { getTier, walletPctOfSupply, colorHueFromAddress } from '../packages/backend/src/game/rules';

// Generate a fake Solana-like base58 address
function fakeAddress(index: number): string {
  const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let addr = '';
  const seed = index * 7919 + 31337;
  for (let i = 0; i < 44; i++) {
    addr += chars[(seed * (i + 1) * 13) % chars.length];
  }
  return addr;
}

async function seed() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new DB(pool);

  console.log('Seeding test wallets...');

  // Clear existing data
  await pool.query('DELETE FROM trade_events');
  await pool.query('DELETE FROM plot_grid');
  await pool.query('DELETE FROM wallets');

  // Total supply = 1 billion tokens (raw units, 6 decimals = 1_000_000_000_000_000)
  const TOTAL_SUPPLY = 1_000_000_000_000_000n;

  const walletConfigs = [
    // Top holders — megastructures
    { pct: 25.0, buildProgress: 100, damagePct: 0, speedMult: 1.0 },
    { pct: 22.0, buildProgress: 85, damagePct: 5, speedMult: 2.0 },

    // Large towers
    { pct: 8.0, buildProgress: 100, damagePct: 0, speedMult: 1.0 },
    { pct: 6.0, buildProgress: 70, damagePct: 15, speedMult: 1.5 },
    { pct: 5.5, buildProgress: 45, damagePct: 30, speedMult: 3.0 },

    // Medium builds
    { pct: 3.0, buildProgress: 100, damagePct: 0, speedMult: 1.0 },
    { pct: 2.0, buildProgress: 60, damagePct: 0, speedMult: 1.0 },
    { pct: 1.5, buildProgress: 30, damagePct: 50, speedMult: 1.0 },
    { pct: 1.2, buildProgress: 100, damagePct: 80, speedMult: 1.0 },

    // Small houses
    { pct: 0.5, buildProgress: 100, damagePct: 0, speedMult: 1.0 },
    { pct: 0.3, buildProgress: 50, damagePct: 10, speedMult: 2.0 },
    { pct: 0.2, buildProgress: 20, damagePct: 0, speedMult: 1.0 },
    { pct: 0.15, buildProgress: 80, damagePct: 60, speedMult: 1.0 },
    { pct: 0.12, buildProgress: 100, damagePct: 0, speedMult: 1.5 },

    // Shacks — lots of small holders
    ...Array.from({ length: 36 }, (_, i) => ({
      pct: 0.001 + Math.random() * 0.09,
      buildProgress: Math.round(Math.random() * 100),
      damagePct: Math.round(Math.random() * 40),
      speedMult: 1.0 + Math.round(Math.random() * 20) / 10,
    })),
  ];

  for (let i = 0; i < walletConfigs.length; i++) {
    const cfg = walletConfigs[i];
    const address = fakeAddress(i);
    const balance = BigInt(Math.floor((cfg.pct / 100) * Number(TOTAL_SUPPLY)));
    const tier = getTier(cfg.pct);
    const hue = colorHueFromAddress(address);
    const plot = await db.getNextPlot();

    const boostExpires =
      cfg.speedMult > 1.0 ? new Date(Date.now() + 60 * 60 * 1000) : null;

    await db.createWallet(address, balance, plot.x, plot.y, tier, hue);
    await db.updateWallet(address, {
      address,
      token_balance: balance,
      house_tier: tier,
      build_progress: cfg.buildProgress,
      damage_pct: cfg.damagePct,
      build_speed_mult: cfg.speedMult,
      boost_expires_at: boostExpires,
    });

    console.log(
      `  [${i + 1}/${walletConfigs.length}] ${address.slice(0, 8)}... ` +
        `tier=${tier} build=${cfg.buildProgress}% dmg=${cfg.damagePct}% ` +
        `plot=(${plot.x},${plot.y})`
    );
  }

  console.log(`\nSeeded ${walletConfigs.length} test wallets.`);
  await db.end();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
