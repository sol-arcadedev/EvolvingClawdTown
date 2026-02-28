// ── Town Action API ────────────────────────────────────────────────

import {
  TownState, TownAction, TownStats, TileCoord, Plot,
  DistrictSummary, Building,
  TERRAIN_WATER,
  DISTRICT_NONE, DISTRICT_NAMES,
  DISTRICT_CIVIC, DISTRICT_RESIDENTIAL_HIGH, DISTRICT_RESIDENTIAL_LOW,
  DISTRICT_COMMERCIAL, DISTRICT_PARK,
  TAG_NEAR_CENTER, TAG_NEAR_MAIN_ROAD, TAG_EDGE_OF_TOWN,
  inBounds,
} from './types.js';
import { computeStats, computeTags, placeBuilding } from './town.js';
import { getArchetypeForTier } from './archetypes.js';
import { astarPath } from './layout.js';

// ── Apply a town action ────────────────────────────────────────────

export function applyAction(
  state: TownState,
  action: TownAction,
): { success: boolean; error?: string; building?: Building } {
  switch (action.type) {
    case 'ADD_ROAD_SEGMENT':
      return applyAddRoad(state, action.from, action.to, action.roadType);

    case 'GROW_DISTRICT':
      return applyGrowDistrict(state, action.district, action.amount);

    case 'PLACE_BUILDING_ON_PLOT':
      return applyPlaceBuilding(state, action.plotId, action.archetypeId, action.ownerAddress, action.buildingName);

    case 'REPLACE_BUILDING':
      return applyReplaceBuilding(state, action.buildingId, action.newArchetypeId);

    case 'CREATE_PARK_IN_AREA':
      return applyCreatePark(state, action.center, action.radius);

    default:
      return { success: false, error: 'Unknown action type' };
  }
}

function applyAddRoad(
  state: TownState,
  from: TileCoord,
  to: TileCoord,
  roadType: string,
): { success: boolean; error?: string } {
  const { map } = state;
  const roadVal = roadType === 'main' ? 1 : roadType === 'secondary' ? 2 : 3;

  const costFn = (tile: import('./types.js').Tile) => {
    if (tile.terrain === TERRAIN_WATER) return -1;
    if (tile.road > 0) return 0.5;
    return 1;
  };

  const path = astarPath(map, from, to, costFn);
  if (!path) return { success: false, error: 'No valid path between points' };

  for (const p of path) {
    const idx = p.y * map.width + p.x;
    if (map.tiles[idx].terrain !== TERRAIN_WATER) {
      map.tiles[idx].road = roadVal;
    }
  }

  computeTags(map);
  state.stats = computeStats(state);
  return { success: true };
}

function applyGrowDistrict(
  state: TownState,
  districtName: string,
  amount: number,
): { success: boolean; error?: string } {
  const { map } = state;
  const distIdx = DISTRICT_NAMES.indexOf(districtName as any);
  if (distIdx < 0) return { success: false, error: `Unknown district: ${districtName}` };

  // Find tiles at the edge of this district type and expand
  let expanded = 0;
  const candidates: number[] = [];

  for (let i = 0; i < map.tiles.length; i++) {
    const t = map.tiles[i];
    if (t.terrain === TERRAIN_WATER) continue;
    if (t.district !== DISTRICT_NONE) continue;

    // Check if adjacent to target district
    const x = i % map.width, y = (i - x) / map.width;
    let adjacent = false;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = x + dx, ny = y + dy;
      if (inBounds(map, nx, ny)) {
        if (map.tiles[ny * map.width + nx].district === distIdx) {
          adjacent = true; break;
        }
      }
    }
    if (adjacent) candidates.push(i);
  }

  // Expand up to 'amount' tiles
  for (let i = 0; i < Math.min(amount, candidates.length); i++) {
    map.tiles[candidates[i]].district = distIdx;
    expanded++;
  }

  if (expanded === 0) return { success: false, error: 'No room to grow district' };

  computeTags(map);
  state.stats = computeStats(state);
  return { success: true };
}

function applyPlaceBuilding(
  state: TownState,
  plotId: string,
  archetypeId: string,
  ownerAddress?: string,
  buildingName?: string,
): { success: boolean; error?: string; building?: Building } {
  const plot = state.plots.get(plotId);
  if (!plot) return { success: false, error: `Plot not found: ${plotId}` };
  if (plot.occupied) return { success: false, error: `Plot already occupied: ${plotId}` };

  const arch = state.archetypes.get(archetypeId);
  if (!arch) return { success: false, error: `Archetype not found: ${archetypeId}` };

  const building = placeBuilding(state, plot, archetypeId, ownerAddress || null, buildingName || null);
  if (!building) return { success: false, error: 'Failed to place building' };

  state.stats = computeStats(state);
  return { success: true, building };
}

function applyReplaceBuilding(
  state: TownState,
  buildingId: number,
  newArchetypeId: string,
): { success: boolean; error?: string } {
  if (buildingId <= 0 || buildingId >= state.buildings.length) {
    return { success: false, error: 'Invalid building ID' };
  }

  const existing = state.buildings[buildingId];
  const newArch = state.archetypes.get(newArchetypeId);
  if (!newArch) return { success: false, error: `Archetype not found: ${newArchetypeId}` };

  existing.archetypeId = newArchetypeId;
  existing.imagePrompt = newArch.sdPromptTemplate;
  existing.buildingName = newArch.name;

  state.stats = computeStats(state);
  return { success: true };
}

function applyCreatePark(
  state: TownState,
  center: TileCoord,
  radius: number,
): { success: boolean; error?: string } {
  const { map } = state;
  let created = 0;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius) continue;
      const x = center.x + dx, y = center.y + dy;
      if (!inBounds(map, x, y)) continue;

      const idx = y * map.width + x;
      const t = map.tiles[idx];
      if (t.terrain === TERRAIN_WATER) continue;
      if (t.road > 0) continue;
      if (t.buildingId > 0) continue;

      t.district = DISTRICT_PARK;
      created++;
    }
  }

  if (created === 0) return { success: false, error: 'No valid tiles for park' };

  computeTags(map);
  state.stats = computeStats(state);
  return { success: true };
}

// ── Read-only helpers ──────────────────────────────────────────────

export function getTownSummary(state: TownState): TownStats {
  return state.stats;
}

export function getDistrictSummaries(state: TownState): DistrictSummary[] {
  const summaries: DistrictSummary[] = [];
  const districtTiles = new Map<number, number>();
  const districtBuildings = new Map<number, number>();
  const districtEmptyPlots = new Map<number, number>();

  for (const tile of state.map.tiles) {
    if (tile.district > 0) {
      districtTiles.set(tile.district, (districtTiles.get(tile.district) || 0) + 1);
    }
  }

  for (let i = 1; i < state.buildings.length; i++) {
    const b = state.buildings[i];
    districtBuildings.set(b.district, (districtBuildings.get(b.district) || 0) + 1);
  }

  for (const plot of state.plots.values()) {
    if (!plot.occupied) {
      districtEmptyPlots.set(plot.district, (districtEmptyPlots.get(plot.district) || 0) + 1);
    }
  }

  for (let d = 1; d < DISTRICT_NAMES.length; d++) {
    const tileCount = districtTiles.get(d) || 0;
    if (tileCount === 0) continue;
    const buildingCount = districtBuildings.get(d) || 0;
    const emptyPlots = districtEmptyPlots.get(d) || 0;

    summaries.push({
      type: DISTRICT_NAMES[d],
      tileCount,
      buildingCount,
      emptyPlots,
      density: tileCount > 0 ? buildingCount / tileCount : 0,
    });
  }

  return summaries;
}

export function findCandidatePlots(
  state: TownState,
  filters: { district?: string; emptyOnly?: boolean; nearRoadOnly?: boolean },
): Plot[] {
  const results: Plot[] = [];
  const distIdx = filters.district ? DISTRICT_NAMES.indexOf(filters.district as any) : -1;

  for (const plot of state.plots.values()) {
    if (filters.emptyOnly && plot.occupied) continue;
    if (distIdx >= 0 && plot.district !== distIdx) continue;
    if (filters.nearRoadOnly) {
      // Already guaranteed by plot creation algorithm
    }
    results.push(plot);
  }

  return results;
}

// ── Find best plot for a holder based on tier ──────────────────────

export function findPlotForHolder(state: TownState, tier: number): Plot | null {
  const { map, plots } = state;

  // Define preferred districts per tier
  const preferences: Record<number, number[]> = {
    5: [DISTRICT_CIVIC, DISTRICT_RESIDENTIAL_HIGH],
    4: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_COMMERCIAL],
    3: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_COMMERCIAL],
    2: [DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH],
    1: [DISTRICT_RESIDENTIAL_LOW],
  };

  const preferred = preferences[Math.max(1, Math.min(5, tier))] || [DISTRICT_RESIDENTIAL_LOW];

  // Score each empty plot
  let bestPlot: Plot | null = null;
  let bestScore = -Infinity;

  for (const plot of plots.values()) {
    if (plot.occupied) continue;

    let score = 0;

    // District preference
    const prefIdx = preferred.indexOf(plot.district);
    if (prefIdx === 0) score += 100;
    else if (prefIdx === 1) score += 50;
    else score -= 20;

    // Tag-based scoring
    const tileIdx = plot.originY * map.width + plot.originX;
    const tile = map.tiles[tileIdx];

    if (tier >= 4 && (tile.tags & TAG_NEAR_CENTER)) score += 30;
    if (tier >= 3 && (tile.tags & TAG_NEAR_MAIN_ROAD)) score += 20;
    if (tier <= 2 && (tile.tags & TAG_EDGE_OF_TOWN)) score += 15;
    if (tier === 1 && (tile.tags & TAG_EDGE_OF_TOWN)) score += 20;

    // Small random tiebreaker based on tile position
    score += ((plot.originX * 31 + plot.originY * 17) % 10) * 0.1;

    if (score > bestScore) {
      bestScore = score;
      bestPlot = plot;
    }
  }

  return bestPlot;
}
