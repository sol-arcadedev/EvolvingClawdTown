import { Pool, PoolClient } from 'pg';

export interface WalletRow {
  address: string;
  token_balance: string; // bigint comes as string from pg
  plot_x: number;
  plot_y: number;
  house_tier: number;
  build_progress: string;
  damage_pct: string;
  build_speed_mult: string;
  boost_expires_at: Date | null;
  color_hue: number;
  first_seen_at: Date;
  last_updated_at: Date;
  // AI-generated fields
  custom_image_url: string | null;
  building_name: string | null;
  architectural_style: string | null;
  clawd_comment: string | null;
  image_prompt: string | null;
  image_generated_at: Date | null;
}

export interface ClawdDecisionRow {
  id: string;
  wallet_address: string;
  event_type: string;
  decision_json: any;
  image_url: string | null;
  holder_profile: any;
  created_at: Date;
}

export interface TradeEventRow {
  id: string;
  tx_signature: string;
  wallet_address: string;
  event_type: string;
  token_amount: string;
  sol_amount: string | null;
  processed_at: Date;
}

export interface WalletTradeStats {
  totalBuys: number;
  totalSells: number;
  totalTokenBought: bigint;
  totalTokenSold: bigint;
  largestSingleBuy: bigint;
  largestSingleSell: bigint;
  tradesLast24h: number;
  tradesLast7d: number;
  decisionCount: number;
}

export interface WalletStateUpdate {
  address: string;
  token_balance: bigint;
  house_tier: number;
  build_progress: number;
  damage_pct: number;
  build_speed_mult: number;
  boost_expires_at: Date | null;
}

export class DB {
  constructor(private pool: Pool) {}

  async getWallet(address: string): Promise<WalletRow | null> {
    const { rows } = await this.pool.query<WalletRow>(
      'SELECT * FROM wallets WHERE address = $1',
      [address]
    );
    return rows[0] || null;
  }

  async getAllActiveWallets(): Promise<WalletRow[]> {
    const { rows } = await this.pool.query<WalletRow>(
      'SELECT * FROM wallets WHERE token_balance > 0'
    );
    return rows;
  }

  async getAllWallets(): Promise<WalletRow[]> {
    const { rows } = await this.pool.query<WalletRow>(
      'SELECT * FROM wallets ORDER BY plot_x, plot_y'
    );
    return rows;
  }

  // Grid positions reserved for decorative city features (plazas, parks, billboards)
  private static readonly RESERVED_PLOTS = new Set([
    // Central 4×4 mainframe zone (plots -2,-2 to 1,1)
    '-2,-2', '-1,-2', '0,-2', '1,-2',
    '-2,-1', '-1,-1', '0,-1', '1,-1',
    '-2,0',  '-1,0',  /* '0,0' reserved for Clawd HQ */  '1,0',
    '-2,1',  '-1,1',  '0,1',  '1,1',
    // Buffer ring around mainframe (1 plot gap)
    '-3,-3', '-2,-3', '-1,-3', '0,-3', '1,-3', '2,-3',
    '-3,-2', '2,-2',
    '-3,-1', '2,-1',
    '-3,0',  '2,0',
    '-3,1',  '2,1',
    '-3,2', '-2,2', '-1,2', '0,2', '1,2', '2,2',
  ]);

  private isReservedPlot(x: number, y: number): boolean {
    return DB.RESERVED_PLOTS.has(`${x},${y}`);
  }

  async getNextPlot(): Promise<{ x: number; y: number }> {
    // Spiral outward from (0,0), skipping reserved decorative positions
    const { rows } = await this.pool.query<{ max_dist: number }>(
      `SELECT COALESCE(MAX(GREATEST(ABS(x), ABS(y))), 0) AS max_dist FROM plot_grid`
    );
    const maxDist = rows[0].max_dist;

    // Try to find an open slot in the current spiral ring, then expand
    for (let ring = 0; ring <= maxDist + 2; ring++) {
      const slots = this.generateSpiralRing(ring);
      for (const slot of slots) {
        if (this.isReservedPlot(slot.x, slot.y)) continue;

        const { rows: existing } = await this.pool.query(
          'SELECT 1 FROM plot_grid WHERE x = $1 AND y = $2',
          [slot.x, slot.y]
        );
        if (existing.length === 0) {
          return slot;
        }
      }
    }

    // Fallback — shouldn't reach here
    return { x: maxDist + 1, y: 0 };
  }

  private generateSpiralRing(ring: number): { x: number; y: number }[] {
    if (ring === 0) return [{ x: 0, y: 0 }];

    const slots: { x: number; y: number }[] = [];
    const n = ring;

    // Top edge: (x, -n) for x from -n to n
    for (let x = -n; x <= n; x++) slots.push({ x, y: -n });
    // Right edge: (n, y) for y from -n+1 to n
    for (let y = -n + 1; y <= n; y++) slots.push({ x: n, y });
    // Bottom edge: (x, n) for x from n-1 to -n
    for (let x = n - 1; x >= -n; x--) slots.push({ x, y: n });
    // Left edge: (-n, y) for y from n-1 to -n+1
    for (let y = n - 1; y >= -n + 1; y--) slots.push({ x: -n, y });

    return slots;
  }

  async createWallet(
    address: string,
    tokenBalance: bigint,
    plotX: number,
    plotY: number,
    houseTier: number,
    colorHue: number
  ): Promise<WalletRow> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const { rows } = await client.query<WalletRow>(
        `INSERT INTO wallets (address, token_balance, plot_x, plot_y, house_tier, color_hue)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [address, tokenBalance.toString(), plotX, plotY, houseTier, colorHue]
      );

      await client.query(
        `INSERT INTO plot_grid (x, y, address) VALUES ($1, $2, $3)`,
        [plotX, plotY, address]
      );

      await client.query('COMMIT');
      return rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateWallet(
    address: string,
    update: Partial<WalletStateUpdate>
  ): Promise<WalletRow> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    if (update.token_balance !== undefined) {
      setClauses.push(`token_balance = $${paramIdx++}`);
      values.push(update.token_balance.toString());
    }
    if (update.house_tier !== undefined) {
      setClauses.push(`house_tier = $${paramIdx++}`);
      values.push(update.house_tier);
    }
    if (update.build_progress !== undefined) {
      setClauses.push(`build_progress = $${paramIdx++}`);
      values.push(update.build_progress);
    }
    if (update.damage_pct !== undefined) {
      setClauses.push(`damage_pct = $${paramIdx++}`);
      values.push(update.damage_pct);
    }
    if (update.build_speed_mult !== undefined) {
      setClauses.push(`build_speed_mult = $${paramIdx++}`);
      values.push(update.build_speed_mult);
    }
    if (update.boost_expires_at !== undefined) {
      setClauses.push(`boost_expires_at = $${paramIdx++}`);
      values.push(update.boost_expires_at);
    }

    setClauses.push(`last_updated_at = NOW()`);
    values.push(address);

    const { rows } = await this.pool.query<WalletRow>(
      `UPDATE wallets SET ${setClauses.join(', ')} WHERE address = $${paramIdx} RETURNING *`,
      values
    );
    return rows[0];
  }

  async batchUpdateWallets(updates: WalletStateUpdate[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const update of updates) {
        await client.query(
          `UPDATE wallets SET
            build_progress = $1,
            damage_pct = $2,
            build_speed_mult = $3,
            boost_expires_at = $4,
            last_updated_at = NOW()
           WHERE address = $5`,
          [
            update.build_progress,
            update.damage_pct,
            update.build_speed_mult,
            update.boost_expires_at,
            update.address,
          ]
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async insertTradeEvent(
    txSignature: string,
    walletAddress: string,
    eventType: string,
    tokenAmount: bigint,
    solAmount: bigint | null
  ): Promise<boolean> {
    try {
      await this.pool.query(
        `INSERT INTO trade_events (tx_signature, wallet_address, event_type, token_amount, sol_amount)
         VALUES ($1, $2, $3, $4, $5)`,
        [txSignature, walletAddress, eventType, tokenAmount.toString(), solAmount?.toString() ?? null]
      );
      return true;
    } catch (err: any) {
      // Duplicate tx_signature — idempotent
      if (err.code === '23505') return false;
      throw err;
    }
  }

  async getRecentTradeEvents(limit = 50): Promise<TradeEventRow[]> {
    const { rows } = await this.pool.query<TradeEventRow>(
      'SELECT * FROM trade_events ORDER BY processed_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  }

  async getWalletTradeEvents(address: string, limit = 20): Promise<TradeEventRow[]> {
    const { rows } = await this.pool.query<TradeEventRow>(
      'SELECT * FROM trade_events WHERE wallet_address = $1 ORDER BY processed_at DESC LIMIT $2',
      [address, limit]
    );
    return rows;
  }

  async getLeaderboard(limit = 20): Promise<WalletRow[]> {
    const { rows } = await this.pool.query<WalletRow>(
      'SELECT * FROM wallets WHERE token_balance > 0 ORDER BY build_progress DESC LIMIT $1',
      [limit]
    );
    return rows;
  }

  async getStats(): Promise<{
    totalHolders: number;
    activeBuilders: number;
    totalTrades: number;
  }> {
    const [holders, builders, trades] = await Promise.all([
      this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM wallets WHERE token_balance > 0'),
      this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM wallets WHERE token_balance > 0 AND build_progress < 100'),
      this.pool.query<{ count: string }>('SELECT COUNT(*) as count FROM trade_events'),
    ]);
    return {
      totalHolders: parseInt(holders.rows[0].count),
      activeBuilders: parseInt(builders.rows[0].count),
      totalTrades: parseInt(trades.rows[0].count),
    };
  }

  async getTotalSupply(): Promise<bigint> {
    const { rows } = await this.pool.query<{ total: string }>(
      'SELECT COALESCE(SUM(token_balance), 0) AS total FROM wallets'
    );
    return BigInt(rows[0].total);
  }

  async updateWalletAI(
    address: string,
    fields: {
      custom_image_url?: string | null;
      building_name?: string | null;
      architectural_style?: string | null;
      clawd_comment?: string | null;
      image_prompt?: string | null;
      image_generated_at?: Date | null;
    }
  ): Promise<WalletRow> {
    const setClauses: string[] = [];
    const values: any[] = [];
    let paramIdx = 1;

    for (const [key, val] of Object.entries(fields)) {
      if (val !== undefined) {
        setClauses.push(`${key} = $${paramIdx++}`);
        values.push(val);
      }
    }

    if (setClauses.length === 0) {
      const w = await this.getWallet(address);
      return w!;
    }

    values.push(address);
    const { rows } = await this.pool.query<WalletRow>(
      `UPDATE wallets SET ${setClauses.join(', ')} WHERE address = $${paramIdx} RETURNING *`,
      values
    );
    return rows[0];
  }

  async insertClawdDecision(
    walletAddress: string,
    eventType: string,
    decisionJson: any,
    imageUrl: string | null = null,
    holderProfile: any = null
  ): Promise<ClawdDecisionRow> {
    const { rows } = await this.pool.query<ClawdDecisionRow>(
      `INSERT INTO clawd_decisions (wallet_address, event_type, decision_json, image_url, holder_profile)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [walletAddress, eventType, JSON.stringify(decisionJson), imageUrl, holderProfile ? JSON.stringify(holderProfile) : null]
    );
    return rows[0];
  }

  async getRecentClawdDecisions(limit = 20): Promise<ClawdDecisionRow[]> {
    const { rows } = await this.pool.query<ClawdDecisionRow>(
      'SELECT * FROM clawd_decisions ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return rows;
  }

  async getWalletTradeStats(address: string): Promise<WalletTradeStats> {
    const { rows } = await this.pool.query<{
      total_buys: string;
      total_sells: string;
      total_token_bought: string;
      total_token_sold: string;
      largest_single_buy: string;
      largest_single_sell: string;
      trades_last_24h: string;
      trades_last_7d: string;
      decision_count: string;
    }>(
      `SELECT
        COUNT(*) FILTER (WHERE event_type = 'buy') AS total_buys,
        COUNT(*) FILTER (WHERE event_type = 'sell') AS total_sells,
        COALESCE(SUM(token_amount::numeric) FILTER (WHERE event_type = 'buy'), 0) AS total_token_bought,
        COALESCE(SUM(token_amount::numeric) FILTER (WHERE event_type = 'sell'), 0) AS total_token_sold,
        COALESCE(MAX(token_amount::numeric) FILTER (WHERE event_type = 'buy'), 0) AS largest_single_buy,
        COALESCE(MAX(token_amount::numeric) FILTER (WHERE event_type = 'sell'), 0) AS largest_single_sell,
        COUNT(*) FILTER (WHERE processed_at > NOW() - INTERVAL '24 hours') AS trades_last_24h,
        COUNT(*) FILTER (WHERE processed_at > NOW() - INTERVAL '7 days') AS trades_last_7d,
        (SELECT COUNT(*) FROM clawd_decisions WHERE wallet_address = $1) AS decision_count
      FROM trade_events
      WHERE wallet_address = $1`,
      [address]
    );

    const row = rows[0];
    return {
      totalBuys: parseInt(row.total_buys),
      totalSells: parseInt(row.total_sells),
      totalTokenBought: BigInt(row.total_token_bought.split('.')[0]),
      totalTokenSold: BigInt(row.total_token_sold.split('.')[0]),
      largestSingleBuy: BigInt(row.largest_single_buy.split('.')[0]),
      largestSingleSell: BigInt(row.largest_single_sell.split('.')[0]),
      tradesLast24h: parseInt(row.trades_last_24h),
      tradesLast7d: parseInt(row.trades_last_7d),
      decisionCount: parseInt(row.decision_count),
    };
  }

  async getWalletsWithoutBuildings(): Promise<WalletRow[]> {
    const { rows } = await this.pool.query<WalletRow>(
      `SELECT * FROM wallets WHERE building_name IS NULL AND token_balance != '0' ORDER BY token_balance::numeric DESC`
    );
    return rows;
  }

  async resetAll(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('TRUNCATE clawd_decisions, trade_events, plot_grid, wallets');
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async end(): Promise<void> {
    await this.pool.end();
  }
}
