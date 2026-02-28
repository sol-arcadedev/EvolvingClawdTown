// ── Town Simulation Types ──────────────────────────────────────────

export type TerrainType = 'water' | 'land' | 'hill' | 'forest';
export type DistrictType =
  | 'none'
  | 'residential_low'
  | 'residential_high'
  | 'commercial'
  | 'industrial'
  | 'civic'
  | 'park'
  | 'harbor';
export type RoadType = 'main' | 'secondary' | 'local';

export interface TileCoord {
  x: number;
  y: number;
}

// ── Bitmask tag constants ──────────────────────────────────────────
export const TAG_NEAR_CENTER     = 1 << 0;
export const TAG_NEAR_WATER      = 1 << 1;
export const TAG_NEAR_MAIN_ROAD  = 1 << 2;
export const TAG_NEAR_SEC_ROAD   = 1 << 3;
export const TAG_HIGH_ELEVATION  = 1 << 4;
export const TAG_LOW_ELEVATION   = 1 << 5;
export const TAG_EDGE_OF_TOWN    = 1 << 6;

// ── Terrain enum indices (2 bits) ──────────────────────────────────
export const TERRAIN_WATER  = 0;
export const TERRAIN_LAND   = 1;
export const TERRAIN_HILL   = 2;
export const TERRAIN_FOREST = 3;

export const TERRAIN_NAMES: TerrainType[] = ['water', 'land', 'hill', 'forest'];

// ── District enum indices (3 bits, 0-7) ────────────────────────────
export const DISTRICT_NONE            = 0;
export const DISTRICT_RESIDENTIAL_LOW = 1;
export const DISTRICT_RESIDENTIAL_HIGH = 2;
export const DISTRICT_COMMERCIAL      = 3;
export const DISTRICT_INDUSTRIAL      = 4;
export const DISTRICT_CIVIC           = 5;
export const DISTRICT_PARK            = 6;
export const DISTRICT_HARBOR          = 7;

export const DISTRICT_NAMES: DistrictType[] = [
  'none', 'residential_low', 'residential_high', 'commercial',
  'industrial', 'civic', 'park', 'harbor',
];

// ── Tile (flat struct for memory efficiency) ───────────────────────
export interface Tile {
  terrain: number;    // TERRAIN_* index (2 bits)
  elevation: number;  // 0-255
  district: number;   // DISTRICT_* index (3 bits)
  road: number;       // 0=none, 1=main, 2=secondary, 3=local
  buildingId: number; // 0 = no building, >0 = building list index
  tags: number;       // bitmask of TAG_* constants
  clusterId: number;  // used during generation
}

// ── TownMap ────────────────────────────────────────────────────────
export interface TownMap {
  width: number;
  height: number;
  tiles: Tile[]; // flat array, indexed y * width + x
}

export function tileAt(map: TownMap, x: number, y: number): Tile {
  return map.tiles[y * map.width + x];
}

export function setTile(map: TownMap, x: number, y: number, tile: Tile): void {
  map.tiles[y * map.width + x] = tile;
}

export function inBounds(map: TownMap, x: number, y: number): boolean {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

// ── Plot ───────────────────────────────────────────────────────────
export interface Plot {
  id: string;           // e.g. "p_32_48"
  originX: number;
  originY: number;
  width: number;        // 1-3
  height: number;       // 1-2
  district: number;     // DISTRICT_* index
  occupied: boolean;
  buildingId: number;   // 0 if unoccupied
}

// ── Building ───────────────────────────────────────────────────────
export interface Building {
  id: number;           // unique index (1-based, 0 = none)
  archetypeId: string;
  originX: number;
  originY: number;
  rotation: 0 | 90 | 180 | 270;
  district: number;
  plotId: string;
  ownerAddress: string | null;
  buildingName: string | null;
  customImageUrl: string | null;
  imagePrompt: string | null;
}

// ── Building Archetype ─────────────────────────────────────────────
export interface BuildingArchetype {
  id: string;
  name: string;
  footprint: { w: number; h: number };
  heightLevels: number;
  allowedDistricts: number[];   // DISTRICT_* indices
  densityClass: 'low' | 'medium' | 'high';
  sdPromptTemplate: string;
  sdStyleTags: string[];
}

// ── Town Stats ─────────────────────────────────────────────────────
export interface TownStats {
  population: number;
  jobs: number;
  commerceScore: number;
  greeneryScore: number;
  averageDensity: number;
  buildingCount: number;
  roadTileCount: number;
  districtCoverage: Record<string, number>;
}

export interface DistrictSummary {
  type: DistrictType;
  tileCount: number;
  buildingCount: number;
  emptyPlots: number;
  density: number;
}

// ── Town Actions ───────────────────────────────────────────────────
export type TownAction =
  | { type: 'ADD_ROAD_SEGMENT'; from: TileCoord; to: TileCoord; roadType: RoadType }
  | { type: 'GROW_DISTRICT'; district: DistrictType; amount: number }
  | { type: 'PLACE_BUILDING_ON_PLOT'; plotId: string; archetypeId: string; ownerAddress?: string; buildingName?: string }
  | { type: 'REPLACE_BUILDING'; buildingId: number; newArchetypeId: string }
  | { type: 'CREATE_PARK_IN_AREA'; center: TileCoord; radius: number };

// ── Town State ─────────────────────────────────────────────────────
export interface TownState {
  map: TownMap;
  plots: Map<string, Plot>;
  buildings: Building[];         // index 0 unused (0 = no building)
  archetypes: Map<string, BuildingArchetype>;
  stats: TownStats;
  seed: number;
}

// ── Render tile for frontend ───────────────────────────────────────
export interface RenderTile {
  x: number;
  y: number;
  elevation: number;
  terrain: number;
  district: number;
  road: number;
  buildingId: number;
}

// ── Cluster (used during generation) ───────────────────────────────
export interface Cluster {
  id: number;
  tiles: TileCoord[];
  centroid: TileCoord;
  distFromCenter: number;
  nearWater: boolean;
  district: number;
}
