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
    '0,0', '-1,0', '0,-1', '-1,-1',     // Central 2×2 plaza
    '5,0', '5,-1',                        // East park
    '-6,0', '-6,-1',                      // West park
    '0,-6', '-1,-6',                      // North plaza
    '0,5', '-1,5',                        // South plaza
    '3,3', '-4,3', '3,-4', '-4,-4',      // Diagonal landmarks
    '7,4', '-8,4', '7,-5', '-8,-5',      // Outer landmarks
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

  async end(): Promise<void> {
    await this.pool.end();
  }
}
