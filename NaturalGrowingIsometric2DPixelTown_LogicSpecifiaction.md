# 🏙️ Natural Growing Isometric Town

A simulation engine for procedurally generating and organically growing isometric pixel-art towns. The core logic is UI-agnostic and designed to be driven by an AI agent (Clawd), with a clean separation between simulation, layout, and asset generation.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Data Model](#data-model)
- [Getting Started](#getting-started)
- [Core Modules](#core-modules)
  - [Terrain Generation](#terrain-generation)
  - [Layout & Roads](#layout--roads)
  - [Town Simulation](#town-simulation)
  - [Growth System](#growth-system)
- [Action API](#action-api)
- [Semantic Tags](#semantic-tags)
- [Stable Diffusion Integration](#stable-diffusion-integration)
- [Isometric Rendering](#isometric-rendering)
- [Implementation Roadmap](#implementation-roadmap)

---

## Overview

This project implements a **naturally growing town simulation** where districts, roads, and buildings evolve over discrete ticks according to configurable goals. The simulation is fully deterministic given a seed, making it reproducible and testable.

Key design goals:

- **Separation of concerns** — simulation logic, tilemap representation, and asset generation are fully decoupled
- **Agent-friendly API** — a compact action API allows an AI agent to inspect, guide, and evolve the town
- **Organic growth** — tile tagging, cluster-based district assignment, and scored placement produce layouts that look natural rather than grid-like
- **Stable Diffusion ready** — building archetypes carry prompt templates so sprites can be generated on demand

---

## Architecture

```
┌────────────────────────────────────────────────┐
│                   AI Agent (Clawd)             │
│   reads summaries → issues TownActions        │
└───────────────────┬────────────────────────────┘
                    │ applyAction / simulateTick
┌───────────────────▼────────────────────────────┐
│              core/town (TownState)             │
│  buildings · plots · stats · growth rules      │
├────────────────────────────────────────────────┤
│              core/layout                       │
│  districts · roads · plots                     │
├────────────────────────────────────────────────┤
│              core/terrain                      │
│  noise · elevation · water mask · clustering   │
└───────────────────┬────────────────────────────┘
                    │ getRenderTiles()
┌───────────────────▼────────────────────────────┐
│            Frontend / Renderer                 │
│  isometric draw order · pixel math · sprites   │
└───────────────────┬────────────────────────────┘
                    │ archetypeId → SD prompt
┌───────────────────▼────────────────────────────┐
│          assets / Stable Diffusion             │
│  BuildingArchetype · sdPromptTemplate          │
└────────────────────────────────────────────────┘
```

---

## Project Structure

```
project-root/
├── core/
│   ├── terrain/          # Noise, elevation, water/land masks, CA clustering
│   ├── layout/           # District assignment, road generation, plot creation
│   └── town/             # Buildings, growth rules, simulateTick, stats
├── assets/
│   └── archetypes/       # BuildingArchetype definitions + SD prompt templates
├── api/
│   └── actions.ts        # applyAction, getTownSummary, findCandidatePlots
├── render/
│   └── adapter.ts        # getRenderTiles() — converts TownState → RenderTile[]
└── tests/
    └── *.test.ts          # Deterministic unit tests (seed-based)
```

---

## Data Model

### Tiles & Map

Each position on the map is a `Tile` carrying terrain, district, road, and building information:

```ts
type TerrainType  = "water" | "land" | "hill" | "forest";
type DistrictType = "none" | "residential_low" | "residential_high"
                 | "commercial" | "industrial" | "civic" | "park" | "harbor";

interface Tile {
  coord:     { x: number; y: number };
  terrain:   TerrainType;
  elevation: number;           // integer height level
  district:  DistrictType;
  road:      boolean;
  roadType?: "main" | "secondary" | "local";
  buildingId?: string;
  tags:      Set<string>;      // e.g. near_center, near_water, edge_of_town
}

interface TownMap {
  width:  number;
  height: number;
  tiles:  Tile[][];            // indexed tiles[x][y]
}
```

### Buildings & Archetypes

Buildings are instances of reusable `BuildingArchetype` definitions:

```ts
interface BuildingArchetype {
  id:               string;
  name:             string;            // e.g. "brick_apartment_block"
  footprint:        { w: number; h: number };
  heightLevels:     number;
  allowedDistricts: DistrictType[];
  densityClass:     "low" | "medium" | "high";
  sdPromptTemplate: string;           // Stable Diffusion prompt template
  sdStyleTags:      string[];
}

interface Building {
  id:          string;
  archetypeId: string;
  origin:      { x: number; y: number };
  rotation:    0 | 90 | 180 | 270;
  district:    DistrictType;
}
```

### Town State

The complete simulation state at any point in time:

```ts
interface TownState {
  map:        TownMap;
  plots:      Map<string, Plot>;
  buildings:  Map<string, Building>;
  archetypes: Map<string, BuildingArchetype>;
  tick:       number;
  stats:      TownStats;
  seed:       number;
}

interface TownStats {
  population:     number;
  jobs:           number;
  commerceScore:  number;
  greeneryScore:  number;
  averageDensity: number;
}
```

---

## Getting Started

### Initialize a Town

```ts
import { initializeTown } from "./core/town";

const state = initializeTown(42); // seed = 42 for reproducibility
```

`initializeTown` will:

1. Generate a base terrain map using noise (elevation + water/land mask)
2. Run a cellular automaton to produce contiguous district clusters
3. Map clusters to district types based on location (center, coast, periphery)
4. Lay out a hierarchical road network (main → secondary → local)
5. Create plots along roads and place starter buildings

### Run a Simulation Tick

```ts
import { simulateTick } from "./core/town";

const goal = { targetPopulation: 5000, prioritizeDistricts: ["residential_high"] };
const nextState = simulateTick(state, goal);
```

---

## Core Modules

### Terrain Generation

- **Noise-based elevation** — Perlin or simplex noise produces a height map
- **Water/land mask** — tiles below a threshold become water
- **Cellular automaton clustering** — land tiles are grouped into contiguous regions that will become districts

### Layout & Roads

- **District assignment** — clusters are labelled hierarchically:
  - Central clusters → `residential_high`, `commercial`, `civic`
  - Peripheral clusters → `residential_low`, `industrial`, `park`
  - Coastal clusters → `harbor`, `park`
- **Road hierarchy** — main roads connect key clusters; secondary and local roads branch organically
- **Plot creation** — contiguous buildable tiles within a district are grouped into addressable plots

### Town Simulation

- Stats are recomputed each tick from building capacities and district coverage
- Tags are refreshed on every tile after each tick (see [Semantic Tags](#semantic-tags))
- Building placement uses a scoring function that weighs district type, tags, distance to center, and current stats

### Growth System

Each call to `simulateTick` follows this loop:

1. Recompute stats
2. Compare stats to the `GrowthGoal`
3. Select candidate districts to grow (biased by the goal)
4. Choose growth actions — road extension, densification, park insertion
5. Validate constraints — no building on water, industrial distance rules, map bounds
6. Apply actions and return the updated state with an incremented tick

---

## Action API

An external agent interacts with the simulation through a typed action API:

```ts
type TownAction =
  | { type: "ADD_ROAD_SEGMENT";       from: TileCoord; to: TileCoord; roadType: "main" | "secondary" | "local" }
  | { type: "GROW_DISTRICT";          district: DistrictType; amount: number }
  | { type: "PLACE_BUILDING_ON_PLOT"; plotId: string; archetypeId: string }
  | { type: "REPLACE_BUILDING";       buildingId: string; newArchetypeId: string }
  | { type: "CREATE_PARK_IN_AREA";    center: TileCoord; radius: number };

function applyAction(state: TownState, action: TownAction): TownState;
```

### Read-Only Helpers

```ts
function getTownSummary(state: TownState): TownStats;

function getDistrictSummaries(state: TownState): DistrictSummary[];

function findCandidatePlots(
  state: TownState,
  filters: { district?: DistrictType; emptyOnly?: boolean; nearRoadOnly?: boolean }
): Plot[];
```

A typical agent loop:

```
1. Read summaries → identify shortfall (e.g. low greenery in dense residential)
2. Find candidate plots near high-density tiles
3. Issue CREATE_PARK_IN_AREA or PLACE_BUILDING_ON_PLOT actions
4. Call simulateTick → observe updated stats
5. Repeat
```

---

## Semantic Tags

After each tick, every tile is re-tagged to enable context-aware placement decisions:

| Tag | Meaning |
|-----|---------|
| `near_center` | Within N tiles of the town's center of mass |
| `near_water` | Within N tiles of a water tile |
| `near_main_road` | Adjacent to or near a main road |
| `near_secondary_road` | Adjacent to or near a secondary road |
| `high_elevation` | Elevation above upper threshold |
| `low_elevation` | Elevation below lower threshold |
| `edge_of_town` | Adjacent to empty or unassigned area |

Tags drive the placement scoring function — for example, high-density residential scores higher near `near_center` + `near_main_road`, while industrial scores higher near `near_main_road` and away from dense residential.

---

## Stable Diffusion Integration

The core logic never calls the SD pipeline directly. Instead, `BuildingArchetype` definitions carry everything the asset layer needs:

```ts
sdPromptTemplate: "isometric 2.5d pixel art of a {district} {densityClass} building, "
                + "footprint {w}x{h} tiles, height {heightLevels}, "
                + "sunny lighting, game tileset, no background"

sdStyleTags: ["pixel art", "isometric", "2.5d", "game asset"]
```

**Starter archetype catalogue** (expand at runtime):

| ID | Name | Footprint | Density |
|----|------|-----------|---------|
| `small_house_wood_1` | Small wooden house | 1×1 | low |
| `apartment_brick_1` | Brick apartment block | 2×2 | medium |
| `commercial_shop_row_1` | Shop row | 2×1 | medium |
| `factory_small_1` | Small factory | 3×2 | high |
| `park_tile_1` | Park tile | 1×1 | — |

The agent can request new archetypes at runtime (e.g. "civic building, 3×3, height 3") — the simulation registers the new `BuildingArchetype` and the SD pipeline generates the sprite.

---

## Isometric Rendering

The render adapter converts `TownState` into a flat list of `RenderTile` objects for the frontend:

```ts
interface RenderTile {
  coord:       { x: number; y: number };
  elevation:   number;
  terrain:     TerrainType;
  district:    DistrictType;
  roadType?:   "main" | "secondary" | "local";
  buildingId?: string;
  archetypeId?: string;
}

function getRenderTiles(state: TownState): RenderTile[];
```

**Draw order:** sort tiles by `x + y + elevation` (painter's algorithm). Pixel math (tile width, height, skew, stacking) is handled entirely in the UI layer — the core never assumes screen coordinates.

---

## Implementation Roadmap

| Step | Module | Description |
|------|--------|-------------|
| 1 | `core/` | Core types and data structures |
| 2 | `core/terrain` | Seeded random utilities + noise-based terrain generation |
| 3 | `core/terrain` | Cellular automaton clustering + district assignment |
| 4 | `core/layout` | Road generation (main → secondary → local) |
| 5 | `core/layout` | Plot creation and initial building placement |
| 6 | `core/town` | Stats computation and tile tagging |
| 7 | `core/town` | Growth logic — `simulateTick`, scoring, constraint checking |
| 8 | `api/` | Action API and read-only query helpers |
| 9 | `render/` | `getRenderTiles` adapter + starter archetype catalogue |
| 10 | `tests/` | Deterministic unit tests (same seed → same layout) |

---

> **Reproducibility guarantee:** Given the same `seed`, `initializeTown` and all subsequent `simulateTick` / `applyAction` calls must produce identical results. All random operations must use the seeded PRNG.
