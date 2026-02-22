# CLAUDE TOWN — Full Project Brief for Claude Code

> **Read this entire document before writing a single line of code.**
> This is the canonical reference for every architectural decision, data model, game mechanic, and technical requirement in the project.

---

## 1. Project Overview

**Claude Town** is a live, browser-based game tied to a Solana memecoin launched on pump.fun. Every wallet that holds the token automatically owns a plot of land in a shared cyberpunk pixel-art city. The city evolves in real time based on on-chain activity — buying tokens builds your house faster, selling damages it, and simply holding determines how large it can grow.

The goal is to create a compelling meta-game layer on top of a token that keeps holders engaged, rewards long-term holding, and creates social/community pressure around selling (because everyone can *see* your house get damaged).

### Core Value Proposition
- **For holders:** Their wallet has a visible, evolving presence in a shared world.
- **For the token:** A reason to hold beyond speculation. Selling has a visible, social cost.
- **For virality:** The town is a shareable, always-live URL anyone can visit to see the current state of the community.

---

## 2. Tech Stack

| Layer | Technology | Notes |
|---|---|---|
| Blockchain | Solana | Token deployed via pump.fun |
| On-chain indexing | Helius RPC (websocket) | Stream real-time token account changes |
| Backend / Game Server | Node.js + TypeScript | Express + WebSocket server |
| Database | PostgreSQL | Persistent wallet/house state |
| Cache / Pub-Sub | Redis | Real-time event broadcasting |
| Frontend | React + TypeScript | Vite build tool |
| Canvas Rendering | PixiJS v8 | 2D WebGL renderer for the town map |
| Pixel Assets | Pre-generated PNG spritesheets | See Section 7 for asset spec |
| Hosting | Railway or Render (backend), Vercel (frontend) | Can be revised |
| Wallet Auth | Solana wallet adapter (Phantom, Backpack) | Optional — for plot claiming |

---

## 3. Repository Structure

```
claude-town/
├── README.md                    ← this file
├── .env.example
├── packages/
│   ├── backend/                 ← Node.js game server
│   │   ├── src/
│   │   │   ├── index.ts         ← entry point
│   │   │   ├── chain/
│   │   │   │   ├── listener.ts  ← Helius websocket listener
│   │   │   │   └── parser.ts    ← parse raw tx → game events
│   │   │   ├── game/
│   │   │   │   ├── engine.ts    ← core game loop / state machine
│   │   │   │   ├── rules.ts     ← all game mechanic constants
│   │   │   │   └── tick.ts      ← periodic state update scheduler
│   │   │   ├── db/
│   │   │   │   ├── schema.sql
│   │   │   │   ├── queries.ts
│   │   │   │   └── migrations/
│   │   │   ├── api/
│   │   │   │   ├── rest.ts      ← REST endpoints
│   │   │   │   └── ws.ts        ← WebSocket server
│   │   │   └── utils/
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── frontend/                ← React app
│       ├── src/
│       │   ├── main.tsx
│       │   ├── App.tsx
│       │   ├── town/
│       │   │   ├── TownMap.tsx       ← main PixiJS canvas component
│       │   │   ├── HouseSprite.ts    ← sprite logic per house
│       │   │   ├── Camera.ts         ← pan/zoom camera
│       │   │   └── renderer.ts       ← PixiJS setup
│       │   ├── hud/
│       │   │   ├── HUD.tsx           ← overlay UI
│       │   │   ├── WalletPanel.tsx   ← "your house" info
│       │   │   └── ActivityFeed.tsx  ← live trade events
│       │   ├── hooks/
│       │   │   ├── useWebSocket.ts
│       │   │   └── useWallet.ts
│       │   ├── assets/
│       │   │   └── sprites/          ← all PNG spritesheets
│       │   └── types/
│       │       └── index.ts          ← shared types (copy from backend)
│       ├── public/
│       ├── package.json
│       └── vite.config.ts
├── scripts/
│   └── seed-test-wallets.ts     ← populate DB with fake wallets for dev
└── docker-compose.yml           ← Postgres + Redis for local dev
```

---

## 4. Database Schema

### Table: `wallets`

Tracks every holder and their house state.

```sql
CREATE TABLE wallets (
  address           TEXT PRIMARY KEY,           -- Solana wallet pubkey (base58)
  token_balance     BIGINT NOT NULL DEFAULT 0,  -- raw token units (not UI amount)
  plot_x            INTEGER NOT NULL,            -- grid X position in town
  plot_y            INTEGER NOT NULL,            -- grid Y position in town
  house_tier        SMALLINT NOT NULL DEFAULT 0, -- 0=none, 1=shack, 2=small, 3=medium, 4=large, 5=mansion
  build_progress    NUMERIC(5,2) NOT NULL DEFAULT 0.00,  -- 0.00–100.00
  damage_pct        NUMERIC(5,2) NOT NULL DEFAULT 0.00,  -- 0.00–100.00 (100 = ruin)
  build_speed_mult  NUMERIC(4,2) NOT NULL DEFAULT 1.00,  -- multiplier from recent buys
  boost_expires_at  TIMESTAMPTZ,                -- when buy-speed boost expires
  color_hue         SMALLINT NOT NULL DEFAULT 0, -- 0-359, unique per wallet for neon tint
  first_seen_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Table: `trade_events`

Append-only log of every on-chain event that affects the game.

```sql
CREATE TABLE trade_events (
  id              BIGSERIAL PRIMARY KEY,
  tx_signature    TEXT NOT NULL UNIQUE,
  wallet_address  TEXT NOT NULL REFERENCES wallets(address),
  event_type      TEXT NOT NULL CHECK (event_type IN ('buy', 'sell', 'transfer_in', 'transfer_out')),
  token_amount    BIGINT NOT NULL,   -- absolute token units involved
  sol_amount      BIGINT,            -- lamports (nullable for transfers)
  processed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_trade_events_wallet ON trade_events(wallet_address);
CREATE INDEX idx_trade_events_processed_at ON trade_events(processed_at DESC);
```

### Table: `plot_grid`

Reserved grid slots. Populated lazily as new wallets appear.

```sql
CREATE TABLE plot_grid (
  x         INTEGER NOT NULL,
  y         INTEGER NOT NULL,
  address   TEXT REFERENCES wallets(address),
  PRIMARY KEY (x, y)
);
```

---

## 5. Game Mechanics — The Rules Engine

This is the heart of the project. All constants live in `packages/backend/src/game/rules.ts` and must be tunable without redeployment (load from env or a config table).

### 5.1 House Tier Thresholds

A wallet's tier is determined by its percentage of the **total circulating supply**. Tier determines the *maximum* house size — build progress fills toward that ceiling.

```typescript
// rules.ts
export const TIER_THRESHOLDS = [
  { tier: 0, minPct: 0,     label: 'None'         }, // no house yet (balance = 0)
  { tier: 1, minPct: 0.001, label: 'Shack'        }, // >0% up to 0.1%
  { tier: 2, minPct: 0.1,   label: 'Small House'  }, // 0.1% – 1%
  { tier: 3, minPct: 1.0,   label: 'Medium Build' }, // 1% – 5%
  { tier: 4, minPct: 5.0,   label: 'Large Tower'  }, // 5% – 20%
  { tier: 5, minPct: 20.0,  label: 'Megastructure'}, // top 20%+ of supply
];

export function getTier(walletPct: number): number {
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (walletPct >= TIER_THRESHOLDS[i].minPct) return TIER_THRESHOLDS[i].tier;
  }
  return 0;
}
```

**Important:** When a wallet's tier *increases* (they buy more), `build_progress` does NOT reset — the house simply unlocks new visual stages as it keeps building. When a wallet's tier *decreases* (they sell down), `build_progress` is clamped to `(new_tier / old_tier) * current_progress` — the house visually shrinks to match.

### 5.2 Build Progress

`build_progress` goes from `0.00` to `100.00`. The game tick runs every **30 seconds** and increments progress for all wallets.

```typescript
export const BASE_BUILD_RATE = 0.5;         // +0.5% progress per tick (= ~25 min to full build at base speed)
export const MAX_BUILD_SPEED_MULT = 5.0;    // cap on buy-boost multiplier
export const BUY_BOOST_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours
export const BUY_BOOST_PER_TRADE = 0.5;     // each buy event adds +0.5x to multiplier (stacks up to MAX)
```

**Tick logic (pseudocode):**
```
for each wallet with balance > 0 and build_progress < 100:
  effective_rate = BASE_BUILD_RATE * current_speed_mult(wallet)
  // Speed mult expires over time — interpolate toward 1.0 as boost_expires_at approaches
  wallet.build_progress = min(100.0, wallet.build_progress + effective_rate)
  
  if boost_expires_at < NOW():
    wallet.build_speed_mult = 1.0
```

### 5.3 Damage System

When a wallet **sells** tokens, damage is applied immediately as a function of sell size relative to their own balance:

```typescript
export const DAMAGE_PER_PCT_SOLD = 2.0;    // sell 10% of your stack = +20% damage
export const MAX_DAMAGE_PER_SELL = 40.0;   // single sell can deal max 40% damage
export const REPAIR_RATE_PER_TICK = 0.3;   // damage repairs at 0.3% per tick while holding
export const REPAIR_STOPS_IF_SELL = true;  // selling resets repair timer
```

**Damage formula:**
```
pct_sold = tokens_sold / wallet_balance_before_sell * 100
damage_dealt = min(MAX_DAMAGE_PER_SELL, pct_sold * DAMAGE_PER_PCT_SOLD)
new_damage = min(100.0, current_damage + damage_dealt)
```

**Damage visual stages:**

| damage_pct | Visual State |
|---|---|
| 0 | Clean / pristine |
| 1–33 | Light cracks, broken window, sparks |
| 34–66 | Fire, shattered windows, heavy cracks |
| 67–99 | Ruin — partial walls, rubble, embers |
| 100 | Fully destroyed — empty lot (house must rebuild from 0) |

**If damage reaches 100:** `build_progress` resets to `0`, `damage_pct` resets to `0`, and the wallet starts rebuilding from scratch.

### 5.4 Construction Visual States

`build_progress` maps to construction frames while the house is being built:

| build_progress | Construction State |
|---|---|
| 0–10 | Empty lot |
| 11–33 | Foundation + poles (crane visible) |
| 34–66 | Framing — partial walls, scaffold |
| 67–99 | Finishing — scaffold on top only |
| 100 | Complete house (tier-appropriate sprite) |

### 5.5 Plot Assignment

When a new wallet is seen for the first time (any non-zero balance):
1. Find the next available `(x, y)` slot in the grid using a **spiral outward from (0,0)** algorithm — this keeps the town center dense and expands outward as more holders arrive.
2. Assign a `color_hue` value: hash the wallet address to a deterministic 0–359 integer. This hue is used to tint the neon colors on the house sprite, giving each wallet a visually unique look.
3. Insert into `wallets` and `plot_grid`.

---

## 6. Backend Architecture

### 6.1 Chain Listener (`chain/listener.ts`)

Use **Helius enhanced websockets** to subscribe to token account changes for the specific mint address.

```typescript
// Subscribe to all token accounts for our mint
helius.connection.onProgramAccountChange(
  TOKEN_PROGRAM_ID,
  (accountInfo, context) => {
    // filter by mint address in accountInfo.data
    // parse owner wallet, new balance
    // emit to game engine
  },
  { filters: [{ memcmp: { offset: 0, bytes: MINT_ADDRESS } }] }
)
```

For each update:
1. Parse the token account to extract `owner` (wallet address) and `amount` (new balance).
2. Look up the previous balance in the DB.
3. Determine event type: `buy` (amount increased), `sell` (amount decreased), `transfer_in/out` (amount changed but no SOL involved — detect via checking if there's a corresponding SOL movement in the transaction).
4. Emit a structured `GameEvent` to the engine.

**Important:** Helius may deliver duplicate events or events out of order. Always check `tx_signature` against `trade_events` for idempotency before processing.

### 6.2 Game Engine (`game/engine.ts`)

Handles all state transitions. Pure functions where possible, so they're easy to test.

```typescript
interface GameEvent {
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  walletAddress: string;
  tokenAmountDelta: bigint;      // positive = incoming, negative = outgoing
  previousBalance: bigint;
  newBalance: bigint;
  txSignature: string;
  timestamp: Date;
}

// Main entry point called by listener
async function processEvent(event: GameEvent): Promise<WalletStateUpdate>
```

The engine:
1. Loads current wallet state from DB (or creates new wallet record).
2. Applies game rules to produce a `WalletStateUpdate`.
3. Writes the new state to DB atomically (use a transaction).
4. Publishes the update to Redis pub/sub channel `town:updates`.
5. Logs the event to `trade_events`.

### 6.3 Game Tick (`game/tick.ts`)

Runs on a `setInterval` every 30 seconds. Processes all wallets in batches:

```typescript
async function runTick(): Promise<void> {
  const wallets = await db.getAllActiveWallets(); // balance > 0
  const updates: WalletStateUpdate[] = [];
  
  for (const wallet of wallets) {
    const update = applyTickToWallet(wallet); // pure function
    updates.push(update);
  }
  
  await db.batchUpdateWallets(updates);
  await redis.publish('town:tick', JSON.stringify({ updatedCount: updates.length, timestamp: Date.now() }));
}
```

### 6.4 WebSocket Server (`api/ws.ts`)

Clients connect via WebSocket and receive:
- Full town state snapshot on connect (`{ type: 'snapshot', wallets: [...] }`)
- Individual wallet updates as they happen (`{ type: 'wallet_update', wallet: {...} }`)
- Tick events (`{ type: 'tick', timestamp: ... }`)
- Activity feed events (`{ type: 'trade', event: {...} }`)

The server subscribes to Redis and fans out to all connected clients. Use `ws` (not `socket.io`) for simplicity.

### 6.5 REST API (`api/rest.ts`)

| Method | Path | Description |
|---|---|---|
| GET | `/api/town` | Full snapshot of all wallet states (for initial page load) |
| GET | `/api/wallet/:address` | Single wallet state + recent trade history |
| GET | `/api/leaderboard` | Top 20 wallets by build_progress |
| GET | `/api/stats` | Total holders, total volume, active builders count |
| GET | `/api/config` | Public game config (tier thresholds, etc.) |

---

## 7. Asset Specification

All sprites are pre-generated PNGs using a 16×16 base pixel grid, scaled up 4× for rendering (so each "pixel" is 4×4 screen pixels). PixiJS renders them with `SCALE_MODE.NEAREST` to keep crisp pixel art.

### Sprite Sheets Required

Each category is a single horizontal sprite sheet. Individual frame positions are referenced by pixel offset.

**File: `houses.png`** — all house tiers, 5 frames
Each frame: 96×144px (the largest tier, others padded to same size)

| Frame Index | Sprite |
|---|---|
| 0 | Tier 1 — Shack |
| 1 | Tier 2 — Small House |
| 2 | Tier 3 — Medium Building |
| 3 | Tier 4 — Large Tower |
| 4 | Tier 5 — Megastructure |

**File: `construction.png`** — 4 frames
`[empty lot, foundation+crane, framing, finishing]`

**File: `damage_overlay.png`** — 3 frames (rendered on top of house sprite)
`[light damage, critical, ruin]`

**File: `props.png`** — street lamp, holo-billboard, cyber tree, road tile

### Neon Hue Tinting

Each wallet has a unique `color_hue` (0–359). In PixiJS, apply a `ColorMatrixFilter` with a hue rotation to the house sprite to shift the neon cyan (#00fff5) to that wallet's unique color. The building structure color stays neutral — only the neon/glow elements shift.

### Sprite State Resolution Logic

```typescript
function resolveSprite(wallet: WalletState): SpriteConfig {
  const isBuilding = wallet.build_progress < 100;
  const damageStage = getDamageStage(wallet.damage_pct); // 0=clean, 1=light, 2=critical, 3=ruin
  
  if (wallet.token_balance === 0n) return { base: 'empty_lot' };
  if (isBuilding) return { base: `construction_${getConstructionFrame(wallet.build_progress)}` };
  
  return {
    base: `house_tier_${wallet.house_tier}`,
    overlay: damageStage > 0 ? `damage_${damageStage}` : null,
    hue: wallet.color_hue,
    animated: damageStage >= 2  // fire animation on critical/ruin
  };
}
```

---

## 8. Frontend Architecture

### 8.1 Town Map (`TownMap.tsx`)

The main canvas component. Uses PixiJS Application mounted inside a React ref.

**Camera:** Free pan (click+drag) and pinch/scroll zoom. Camera is centered on the player's own plot when they first connect their wallet.

**Grid layout:** Each plot is 32×48 screen pixels. The grid is infinite in theory but practically limited to ~100×100 (10,000 plots). Plots are arranged in a spiral from center.

**Rendering pipeline:**
1. On mount: fetch `/api/town` snapshot → populate all sprites.
2. Connect WebSocket → listen for `wallet_update` events → update only the affected sprite.
3. On tick event → run a brief shimmer/pulse animation across all building sprites.
4. On trade event → display a floating "+buy" or "-sell" text above the affected plot, then fade out.

**Performance:** Only render sprites in the current camera viewport + a 2-tile buffer. Use PixiJS `ParticleContainer` for the background city elements.

### 8.2 HUD Overlay (`HUD.tsx`)

Rendered in normal React DOM on top of the canvas (absolute positioned). Contains:

- **Top bar:** Token name, price (fetched from pump.fun API), total holders, total builds.
- **Activity feed (right side):** Last 10 trade events in real time. Each entry shows wallet (truncated), action (BUY/SELL), amount, and a tiny house thumbnail. Auto-scrolls. Selling events shown in neon pink, buying in neon cyan.
- **Your House panel (bottom left, only when wallet connected):** Shows your current tier, build progress bar, damage bar with repair timer, speed boost countdown if active, and a "Locate My House" button that pans the camera to your plot.
- **Leaderboard button (top right):** Modal showing top 20 builders.

### 8.3 WebSocket Hook (`useWebSocket.ts`)

```typescript
export function useWebSocket(url: string) {
  // Manages connection, reconnection with exponential backoff
  // Exposes: { connected, lastEvent, send }
  // On connect: requests snapshot
  // Dispatches events to a Zustand store
}
```

### 8.4 State Management

Use **Zustand** for global state. One store:

```typescript
interface TownStore {
  wallets: Map<string, WalletState>;   // keyed by address
  recentTrades: TradeEvent[];          // last 50
  connected: boolean;
  myAddress: string | null;
  
  // Actions
  applySnapshot: (wallets: WalletState[]) => void;
  applyWalletUpdate: (update: WalletState) => void;
  addTradeEvent: (event: TradeEvent) => void;
}
```

PixiJS subscribes to store changes (outside React render cycle) using `store.subscribe()` to update sprites without re-rendering React.

---

## 9. Environment Variables

```bash
# .env (backend)
DATABASE_URL=postgresql://user:pass@localhost:5432/claude_town
REDIS_URL=redis://localhost:6379
HELIUS_API_KEY=your_helius_key
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=...
TOKEN_MINT_ADDRESS=your_pump_fun_token_mint_pubkey
TICK_INTERVAL_MS=30000
PORT=3001
CORS_ORIGIN=http://localhost:5173

# .env (frontend)
VITE_WS_URL=ws://localhost:3001
VITE_API_URL=http://localhost:3001
VITE_TOKEN_MINT=your_pump_fun_token_mint_pubkey
```

---

## 10. Local Development Setup

```bash
# 1. Start infrastructure
docker-compose up -d   # starts Postgres + Redis

# 2. Run DB migrations
cd packages/backend
npm run db:migrate

# 3. Seed with fake wallets for UI development (no real Solana connection needed)
npm run seed

# 4. Start backend
npm run dev

# 5. Start frontend (separate terminal)
cd packages/frontend
npm run dev
```

The seed script creates ~50 fake wallets at various tiers, build progress levels, and damage states so the town map looks populated during development.

---

## 11. Key Design Decisions & Constraints

### Why off-chain game state?
All house/damage/progress state lives in Postgres, not on-chain. This avoids transaction fees for every game tick and keeps the system fast. The token balance is the *only* on-chain truth — everything else is derived from it by our server.

### Why PixiJS and not a game engine?
The town is 2D pixel art with a relatively simple update pattern (individual sprites updating, not a physics simulation). PixiJS gives us WebGL performance with a lightweight API. A full game engine (Phaser, Unity WebGL) would be overkill.

### Handling pump.fun's bonding curve
Pump.fun tokens have a bonding curve that affects price. The game only cares about **token balance relative to total supply** — not price. This means the tier system remains fair regardless of price volatility.

### What happens to destroyed houses?
When `damage_pct` hits 100, the house is destroyed and `build_progress` resets to 0. The wallet keeps its plot but must rebuild from scratch. This is intentional — it's the maximum penalty for selling all tokens.

### What if a wallet transfers (not sells) tokens?
`transfer_out` events apply reduced damage (50% of normal sell damage). `transfer_in` events are treated like buys for speed boost purposes. This discourages transfer-as-exit while still acknowledging that not all outflows are sells.

### Wallet claiming is optional
Wallets don't need to connect to the website for their house to exist and evolve. The house builds automatically based on on-chain activity. Connecting a wallet just unlocks the "Your House" HUD panel and the ability to see your plot highlighted.

---

## 12. Milestone Plan

### Milestone 1 — Core Infrastructure
- Postgres schema + migrations
- Helius listener parsing token account changes
- Basic game engine (buy/sell/tick rules)
- REST API returning wallet states

### Milestone 2 — Frontend Town Map
- PixiJS canvas with grid layout
- House sprites rendering by tier
- WebSocket live updates
- Camera pan/zoom

### Milestone 3 — Full Game Mechanics
- Construction animation states
- Damage overlay sprites
- Build speed boost UI
- Activity feed

### Milestone 4 — Polish
- Wallet connection + "Your House" panel
- Leaderboard
- Mobile responsiveness
- Error handling, reconnection logic, rate limiting

### Milestone 5 — Production Readiness
- Mainnet Solana connection
- Deployment pipeline (Railway + Vercel)
- Monitoring (Sentry, uptime checks)
- Load testing (simulate 1000 concurrent WebSocket clients)

---

## 13. Files to Create First

When starting, create these in order:

1. `docker-compose.yml` — Postgres + Redis
2. `packages/backend/src/db/schema.sql` — full schema
3. `packages/backend/src/game/rules.ts` — all game constants
4. `packages/backend/src/game/engine.ts` — state machine
5. `packages/backend/src/game/tick.ts` — periodic updater
6. `packages/backend/src/chain/listener.ts` — Helius watcher
7. `packages/backend/src/api/rest.ts` + `ws.ts`
8. `packages/backend/src/index.ts` — wires everything together
9. `packages/frontend/src/types/index.ts` — shared types
10. `packages/frontend/src/App.tsx` + `town/TownMap.tsx`

---

## 14. Testing Strategy

- **Unit tests** for `game/rules.ts` and `game/engine.ts` — these are pure functions and must have 100% coverage. Test every edge case: sell to 0, buy after destroy, tier upgrades/downgrades.
- **Integration tests** for the REST API using a test Postgres database.
- **WebSocket tests** using a mock Redis subscriber to verify broadcast behavior.
- **Manual E2E** using the seed script to simulate a full game session in dev.

---

*End of project brief. Questions? Check the rules engine first — 80% of product questions are answered by the game mechanics in Section 5.*
