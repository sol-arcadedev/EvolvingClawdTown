/**
 * Seed the database with current token holders fetched from Helius DAS API.
 * Usage: tsx scripts/seed-holders.ts
 */
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

import { Pool } from 'pg';
import { DB } from '../src/db/queries';
import { getTier, walletPctOfSupply, colorHueFromAddress } from '../src/game/rules';
import { log } from '../src/utils/logger';

const HELIUS_API_KEY = process.env.HELIUS_API_KEY;
const TOKEN_MINT = process.env.TOKEN_MINT_ADDRESS;
const DATABASE_URL = process.env.DATABASE_URL;

interface TokenAccount {
  address: string;       // token account address
  owner: string;         // wallet owner
  amount: number;        // token amount (raw)
}

async function fetchAllHolders(mint: string, apiKey: string): Promise<TokenAccount[]> {
  const url = `https://mainnet.helius-rpc.com/?api-key=${apiKey}`;
  let page = 1;
  let allAccounts: TokenAccount[] = [];

  log.info('Fetching token holders from Helius...');

  while (true) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: `holders-${page}`,
        method: 'getTokenAccounts',
        params: {
          mint,
          page,
          limit: 1000,
        },
      }),
    });

    const data = await response.json() as any;

    if (data.error) {
      throw new Error(`Helius API error: ${JSON.stringify(data.error)}`);
    }

    const accounts: TokenAccount[] = data.result?.token_accounts || [];
    if (accounts.length === 0) break;

    allAccounts = allAccounts.concat(accounts);
    log.info(`  Page ${page}: ${accounts.length} accounts (total: ${allAccounts.length})`);

    page++;

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 200));
  }

  return allAccounts;
}

async function main() {
  if (!HELIUS_API_KEY) {
    console.error('Missing HELIUS_API_KEY in .env');
    process.exit(1);
  }
  if (!TOKEN_MINT) {
    console.error('Missing TOKEN_MINT_ADDRESS in .env');
    process.exit(1);
  }
  if (!DATABASE_URL) {
    console.error('Missing DATABASE_URL in .env');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = new DB(pool);

  try {
    // Fetch all current holders
    const holders = await fetchAllHolders(TOKEN_MINT, HELIUS_API_KEY);
    log.info(`Found ${holders.length} token accounts`);

    // Filter out zero-balance accounts and deduplicate by owner
    const ownerMap = new Map<string, bigint>();
    for (const h of holders) {
      const amount = BigInt(h.amount);
      if (amount <= 0n) continue;
      const existing = ownerMap.get(h.owner) || 0n;
      ownerMap.set(h.owner, existing + amount);
    }

    log.info(`${ownerMap.size} unique holders with positive balance`);

    // Calculate total supply for tier assignment
    let totalSupply = 0n;
    for (const balance of ownerMap.values()) {
      totalSupply += balance;
    }
    log.info(`Total supply across holders: ${totalSupply.toString()}`);

    // Sort by balance descending so big holders get central plots
    const sorted = [...ownerMap.entries()].sort((a, b) => {
      if (b[1] > a[1]) return 1;
      if (b[1] < a[1]) return -1;
      return 0;
    });

    let created = 0;
    let skipped = 0;

    for (const [ownerAddress, balance] of sorted) {
      // Check if wallet already exists
      const existing = await db.getWallet(ownerAddress);
      if (existing) {
        skipped++;
        continue;
      }

      const pct = walletPctOfSupply(balance, totalSupply);
      const tier = getTier(pct);
      const hue = colorHueFromAddress(ownerAddress);
      const plot = await db.getNextPlot();

      await db.createWallet(ownerAddress, balance, plot.x, plot.y, tier, hue);
      created++;

      if (created % 50 === 0) {
        log.info(`  Created ${created} wallets...`);
      }
    }

    log.info(`Done! Created ${created} wallets, skipped ${skipped} existing.`);
  } catch (err) {
    log.error('Seed failed:', err);
    process.exit(1);
  } finally {
    await db.end();
  }
}

main();
