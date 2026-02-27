import { Router, Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { DB, WalletRow } from '../db/queries';
import { TIER_THRESHOLDS } from '../game/rules';

function walletToJson(w: WalletRow) {
  return {
    address: w.address,
    tokenBalance: w.token_balance,
    plotX: w.plot_x,
    plotY: w.plot_y,
    houseTier: w.house_tier,
    buildProgress: parseFloat(w.build_progress),
    damagePct: parseFloat(w.damage_pct),
    buildSpeedMult: parseFloat(w.build_speed_mult),
    boostExpiresAt: w.boost_expires_at?.toISOString() ?? null,
    colorHue: w.color_hue,
    firstSeenAt: w.first_seen_at.toISOString(),
    lastUpdatedAt: w.last_updated_at.toISOString(),
    // AI-generated fields
    customImageUrl: w.custom_image_url ?? null,
    buildingName: w.building_name ?? null,
    architecturalStyle: w.architectural_style ?? null,
    clawdComment: w.clawd_comment ?? null,
  };
}

export function createRestRouter(db: DB): Router {
  const router = Router();

  // Rate limiting: 60 requests per minute per IP
  const limiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later.' },
  });
  router.use(limiter);

  // Health check
  router.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  router.get('/api/town', async (_req: Request, res: Response) => {
    try {
      const wallets = await db.getAllWallets();
      res.json({ wallets: wallets.map(walletToJson) });
    } catch (err) {
      console.error('GET /api/town error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/wallet/:address', async (req: Request, res: Response) => {
    try {
      // Basic input validation
      const { address } = req.params;
      if (!address || address.length < 32 || address.length > 44) {
        res.status(400).json({ error: 'Invalid wallet address' });
        return;
      }

      const wallet = await db.getWallet(address);
      if (!wallet) {
        res.status(404).json({ error: 'Wallet not found' });
        return;
      }
      const trades = await db.getWalletTradeEvents(address);
      res.json({
        wallet: walletToJson(wallet),
        recentTrades: trades.map((t) => ({
          id: t.id,
          txSignature: t.tx_signature,
          eventType: t.event_type,
          tokenAmount: t.token_amount,
          solAmount: t.sol_amount,
          processedAt: t.processed_at.toISOString(),
        })),
      });
    } catch (err) {
      console.error('GET /api/wallet error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/leaderboard', async (_req: Request, res: Response) => {
    try {
      const wallets = await db.getLeaderboard();
      res.json({ leaderboard: wallets.map(walletToJson) });
    } catch (err) {
      console.error('GET /api/leaderboard error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/stats', async (_req: Request, res: Response) => {
    try {
      const stats = await db.getStats();
      res.json(stats);
    } catch (err) {
      console.error('GET /api/stats error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/clawd/log', async (_req: Request, res: Response) => {
    try {
      const decisions = await db.getRecentClawdDecisions(50);
      res.json({
        decisions: decisions.map((d) => ({
          id: d.id,
          walletAddress: d.wallet_address,
          eventType: d.event_type,
          decision: d.decision_json,
          imageUrl: d.image_url,
          createdAt: d.created_at.toISOString(),
        })),
      });
    } catch (err) {
      console.error('GET /api/clawd/log error:', err);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  router.get('/api/config', (_req: Request, res: Response) => {
    res.json({ tierThresholds: TIER_THRESHOLDS });
  });

  // Global error handler
  router.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('Unhandled API error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return router;
}
