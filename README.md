# ClawdTown

An AI-powered living town on Solana where every token holder gets a unique building designed by **Clawd**, a sophisticated lobster architect who judges your on-chain behavior and builds accordingly.

Buy tokens, get a house. Hold, and it evolves. Sell, and it crumbles. Sell everything, and it burns to a permanent ruin.

## How It Works

Each `$CLAWDTOWN` holder is assigned a plot in an isometric pixel-art town. Clawd, the town's AI architec, inspects your wallet, analyzes your trading history, classifies your behavior, and designs a building that reflects *who you are* on-chain.

- **Diamond hands** get marble halls and polished stone
- **Flippers** get leaning walls with mismatched materials and permanent scaffolding
- **Returning sellers** get patched cracks and fresh mortar over old stone
- **Whales** get imposing structures that dominate the skyline

Every building is generated as a unique pixel-art sprite via Stable Diffusion, validated by AI vision, and placed on the town map in real time.

---

## Clawd: The AI Architect

Clawd is the core of ClawdTown, a character-driven AI agent that makes every design decision for the town. He has opinions, convictions, and a sharp tongue.

### Personality

Clawd is a sophisticated lobster with impeccable architectural taste. He rewards conviction, punishes disloyalty, and always has something to say about your trading habits. His comments appear in a live blog feed as he works.

### Decision Pipeline

When a holder buys or sells tokens, Clawd's decision pipeline fires:

```
On-Chain Event
  → Wallet Analysis (Helius API, transaction history, DeFi activity)
  → Behavior Classification (8 patterns, see below)
  → Material Theme Selection (behavior + personality → building materials)
  → Gemini AI Decision (building name, style, description, image prompt, witty comment)
  → Image Generation (Stable Diffusion with LoRA → pixel-art isometric sprite)
  → Vision Validation (Gemini verifies isometric perspective, single building, no environment)
  → Town Placement (plot assignment, road connection, decoration scatter)
  → Live Broadcast (WebSocket → frontend renders building in real time)
```

### Behavior Classification

Clawd classifies every holder into one of 8 behavioral archetypes based on their trade history:

| Pattern | Criteria | Clawd's Take                                                |
|---------|----------|-------------------------------------------------------------|
| **Stone Foundation** | 30+ day holder, zero sells | Bedrock of the community, gets permanent, rooted structures |
| **Relentless Accumulator** | 5+ buys, zero sells | Always building, layered, additive architecture             |
| **Prodigal Son** | Seller who returned to buy | Forgiven but scarred, patched repairs over old damage       |
| **Fresh Arrival** | Single buy, no history | Unproven, gets starter materials, potential noted           |
| **Hyperactive** | 3+ trades in 24h | Restless energy, chaotic, eclectic builds                   |
| **Net Distributor** | More sells than buys | Taking from the town, diminished, worn structures           |
| **Frequent Flyer** | 5+ building redesigns | Can't commit, patchwork of past styles                      |
| **Standard Citizen** | Everyone else | Solid, honest construction                                  |

### Material Themes

Each behavior pattern maps to specific building materials. Clawd never gives flippers marble, and never gives accumulators plywood:

- **Diamond Hands** → Marble, polished stone, gilded accents
- **Degen Flippers** → Plywood, duct tape, precarious angles
- **Whale Moves** → Obsidian, thunderstone, glowing circuit inlays

### AI Stack

- **Gemini 2.0 Flash** (Google Vertex AI), Clawd's brain for building decisions
- **Gemini Vision** validates generated sprites meet isometric quality standards
- **Stable Diffusion** (local WebUI/Forge), generates unique pixel-art building sprites
  - LoRAs: `pixelartredmond` (pixel art style) + `Isometric_Setting` (perspective) + `white_background` (clean isolation)
  - 3-layer validation: transparency check → vision validation → best-effort fallback
- **Helius API** on-chain wallet analysis and transaction history

### Image Generation

Every building gets a unique AI-generated pixel-art sprite:

1. Clawd crafts an 8-15 word image prompt based on the building design
2. Stable Diffusion generates a 512x512 isometric building with pixel-art LoRAs
3. Background is flood-fill removed for transparency
4. Gemini Vision validates: must show roof + two side faces in isometric 3/4 view
5. Up to 3 attempts with escalating prompt refinement
6. Result: a clean, isolated sprite ready for the tilemap

During high activity (reseed, token launch), images generate in the background with 2 concurrent workers so buildings appear on the map within seconds.

---

## Game Mechanics

### Tiers

Buildings evolve through 5 tiers based on your share of the token supply:

| Tier | Supply % | Building |
|------|----------|----------|
| 1 | 0.001% | Shack |
| 2 | 0.1% | Small House |
| 3 | 1.0% | Medium Build |
| 4 | 5.0% | Large Tower |
| 5 | 20.0% | Megastructure |

### Build Progress

- Buildings progress each tick (30s intervals)
- Buy events boost build speed (up to 5x multiplier for 2 hours)
- Whales build faster, balance % scales build rate
- When progress hits 100%, the building evolves to the next qualifying tier

### Damage & Repair

- **Selling** damages your building proportional to the sell size (2% damage per 1% of balance sold, max 40% per transaction)
- **100% damage** destroys the building, resets to ground level
- **Natural repair** heals 0.3% per tick (self-healing over time)

### Burn & Ruin System

When a holder sells all tokens:

- **Finished building** (100% progress) → fire animation plays, building becomes a **permanent ruin**,  a graveyard marker of a fallen holder
- **Under construction** (< 100% progress) → plot silently cleared, no fire, no ruin

Ruins persist on the map as a reminder. The freed plot becomes available for the next holder.

---

## Town Simulation

### Map Generation

The town is a 256x256 isometric tilemap generated procedurally:

- Circular island with ocean border
- 8 district types: Civic (center), Residential, Commercial, Industrial, Park, Harbor
- Stone road network radiating from center with secondary roads branching outward
- Clawd's castle sits at the center, a special lobster-shaped HQ
- Forest ring surrounds the castle; trees, fountains, benches, and decorations scatter across the map

### Organic Expansion

When all plots are full and a new holder arrives:

1. Town analyzes its shape, finds the least-developed direction
2. Expands outward, staying compact and connected
3. Lays a new road from the existing network to the expansion
4. Creates a plot and scatters decorations nearby

The town grows organically based on demand, never sprawling unnecessarily.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Pixi.js 8 (GPU-rendered canvas), Zustand, TypeScript |
| **Backend** | Express.js, WebSocket, TypeScript |
| **Database** | PostgreSQL |
| **Blockchain** | Solana (Helius WebSocket + RPC for real-time token events) |
| **AI** | Google Vertex AI (Gemini 2.0 Flash), Stable Diffusion (local) |
| **Image Processing** | Sharp (background removal, transparency validation) |

### Architecture

```
Solana (Helius WebSocket)
  → Chain Listener (parses buy/sell/transfer events)
  → Game Engine (applies rules: tiers, damage, build boost, burn)
  → Decision Queue (batches AI calls, manages image generation)
  → Clawd Agent (Gemini AI → building design + Stable Diffusion → sprite)
  → Town Planner (plot placement, road expansion, decoration)
  → WebSocket Broadcast (real-time frontend updates)
  → Pixi.js Canvas (isometric tilemap, animated sprites, live town)
```

---

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL
- Stable Diffusion WebUI or Forge (for image generation)
- Google Cloud project with Vertex AI enabled (for Clawd's brain)
- Helius API key (for Solana on-chain data)

### Environment

Copy `.env.example` to `.env` and configure:

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/claude_town

# Solana
HELIUS_API_KEY=your-key
HELIUS_RPC_URL=https://mainnet.helius-rpc.com/?api-key=your-key
TOKEN_MINT_ADDRESS=your-token-mint

# AI
AI_ENABLED=true
CLAWD_MODEL=gemini-2.0-flash-001
GOOGLE_CLOUD_PROJECT=your-project
GOOGLE_CLOUD_REGION=us-east5

# Image Generation
SD_ENABLED=true
# Stable Diffusion WebUI runs on localhost:7860 by default

# Server
PORT=3001
CORS_ORIGIN=http://localhost:5173
ADMIN_PASSWORD=your-password
```

### Run

```bash
npm install
npm run dev:backend   # Express + WebSocket on :3001
npm run dev:frontend  # Vite dev server on :5173
```

---

## License

All rights reserved.
