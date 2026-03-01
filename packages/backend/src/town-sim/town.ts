// ── Town initialization, stats, and tagging ────────────────────────

import { PRNG } from './prng';
import { generateTerrain, clusterLand, generateSmallIsland } from './terrain';
import { assignDistricts, generateRoads, createPlots, astarPath } from './layout';
import { getAllArchetypes, getArchetypeForDistrict, ARCHETYPES } from './archetypes';
import {
  TownState, TownMap, TownStats, Tile, Building, Plot, TileCoord,
  TERRAIN_WATER, TERRAIN_LAND,
  DISTRICT_NONE, DISTRICT_CIVIC, DISTRICT_RESIDENTIAL_LOW, DISTRICT_NAMES,
  TAG_NEAR_CENTER, TAG_NEAR_WATER, TAG_NEAR_MAIN_ROAD,
  TAG_NEAR_SEC_ROAD, TAG_HIGH_ELEVATION, TAG_LOW_ELEVATION, TAG_EDGE_OF_TOWN,
  inBounds,
} from './types';

// ── Initialize a complete town from seed ───────────────────────────

export function initializeTown(seed: number, width = 256, height = 256): TownState {
  const rng = new PRNG(seed);

  // 1. Generate terrain
  const map = generateTerrain(width, height, rng);

  // 2. Cluster land tiles
  const clusters = clusterLand(map, rng);

  // 3. Assign districts
  assignDistricts(map, clusters, rng);

  // 4. Generate roads
  generateRoads(map, clusters, rng);

  // 5. Create plots
  const plots = createPlots(map, rng);

  // 6. Compute tags
  computeTags(map);

  // 7. Build state
  const state: TownState = {
    map,
    plots,
    buildings: [createNullBuilding()], // index 0 is unused sentinel
    archetypes: getAllArchetypes(),
    stats: emptyStats(),
    seed,
  };

  // 8. Place starter NPC buildings
  placeStarterBuildings(state, rng);

  // 9. Compute initial stats
  state.stats = computeStats(state);

  return state;
}

// ── Initialize a small starting town for dynamic growth ──────────

export function initializeSmallTown(seed: number, width = 256, height = 256): TownState {
  const rng = new PRNG(seed);

  // 1. Generate small island (ocean + circular land)
  const map = generateSmallIsland(width, height);

  // 2. Assign districts: inner = CIVIC, outer = RESIDENTIAL_LOW
  assignSmallTownDistricts(map);

  // 3. Generate 4 stone road spokes from castle bridge outward (N/E/S/W)
  generateInitialRoads(map);

  // 4. Create plots adjacent to roads
  const plots = createPlots(map, rng);

  // 5. Compute tags
  computeTags(map);

  // 6. Build state
  const state: TownState = {
    map,
    plots,
    buildings: [createNullBuilding()], // index 0 is unused sentinel
    archetypes: getAllArchetypes(),
    stats: emptyStats(),
    seed,
  };

  // 7. Place castle at center for CLAWD
  placeCastleAtCenter(state);

  // 8. Compute initial stats (no starter NPC buildings)
  state.stats = computeStats(state);

  return state;
}

function assignSmallTownDistricts(map: TownMap): void {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = y * map.width + x;
      const tile = map.tiles[idx];
      if (tile.terrain === TERRAIN_WATER) continue;

      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= 8) {
        tile.district = DISTRICT_CIVIC;
      } else if (dist <= 14) {
        tile.district = DISTRICT_RESIDENTIAL_LOW;
      }
    }
  }
}

function generateInitialRoads(map: TownMap): void {
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  // 4 road spokes: N, E, S, W — from moat bridge to town edge
  const directions: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  for (const [ddx, ddy] of directions) {
    // Start from just outside moat (radius 5) to town edge (radius 14)
    for (let r = 5; r <= 14; r++) {
      const x = cx + ddx * r;
      const y = cy + ddy * r;
      if (!inBounds(map, x, y)) continue;
      const idx = y * map.width + x;
      if (map.tiles[idx].terrain !== TERRAIN_WATER) {
        map.tiles[idx].road = 1; // main road
      }
    }
    // Bridge across moat (radius 3-4)
    for (let r = 3; r <= 4; r++) {
      const x = cx + ddx * r;
      const y = cy + ddy * r;
      if (!inBounds(map, x, y)) continue;
      const idx = y * map.width + x;
      // Convert moat tile to land for the bridge
      map.tiles[idx].terrain = TERRAIN_LAND;
      map.tiles[idx].elevation = 100;
      map.tiles[idx].road = 1;
    }
  }
}

function placeCastleAtCenter(state: TownState): void {
  const cx = Math.floor(state.map.width / 2);
  const cy = Math.floor(state.map.height / 2);

  // Create a plot at the castle platform
  const plotId = `p_${cx}_${cy}`;
  const castlePlot: Plot = {
    id: plotId,
    originX: cx,
    originY: cy,
    width: 3,
    height: 2,
    district: DISTRICT_CIVIC,
    occupied: false,
    buildingId: 0,
  };
  state.plots.set(plotId, castlePlot);

  // Place holder_tier5 building for CLAWD
  placeBuilding(state, castlePlot, 'holder_tier5', null, 'Clawd Architect HQ');
}

function createNullBuilding(): Building {
  return {
    id: 0, archetypeId: '', originX: 0, originY: 0,
    rotation: 0, district: 0, plotId: '', ownerAddress: null,
    buildingName: null, customImageUrl: null, imagePrompt: null,
  };
}

// ── Compute semantic tags via BFS distance transforms ──────────────

export function computeTags(map: TownMap): void {
  const { width, height, tiles } = map;
  const N = width * height;

  // Reset all tags
  for (let i = 0; i < N; i++) tiles[i].tags = 0;

  // BFS helper: flood-fill from sources, tag tiles within radius
  const bfs = (sources: number[], maxDist: number, tag: number) => {
    const dist = new Int16Array(N).fill(-1);
    const queue: number[] = [];

    for (const s of sources) {
      dist[s] = 0;
      queue.push(s);
    }

    let head = 0;
    while (head < queue.length) {
      const idx = queue[head++];
      const d = dist[idx];
      if (d >= maxDist) continue;

      const x = idx % width, y = (idx - x) / width;
      const neighbors = [
        y > 0 ? idx - width : -1,
        y < height - 1 ? idx + width : -1,
        x > 0 ? idx - 1 : -1,
        x < width - 1 ? idx + 1 : -1,
      ];

      for (const n of neighbors) {
        if (n >= 0 && dist[n] < 0) {
          dist[n] = d + 1;
          queue.push(n);
        }
      }
    }

    for (let i = 0; i < N; i++) {
      if (dist[i] >= 0 && dist[i] <= maxDist) {
        tiles[i].tags |= tag;
      }
    }
  };

  // Collect sources for each tag type
  const waterSources: number[] = [];
  const mainRoadSources: number[] = [];
  const secRoadSources: number[] = [];
  const cx = Math.floor(width / 2), cy = Math.floor(height / 2);

  for (let i = 0; i < N; i++) {
    const t = tiles[i];
    if (t.terrain === TERRAIN_WATER) waterSources.push(i);
    if (t.road === 1) mainRoadSources.push(i);
    if (t.road === 2) secRoadSources.push(i);
  }

  // Center tag: within 40 tiles of center
  const centerSources = [cy * width + cx];
  bfs(centerSources, 40, TAG_NEAR_CENTER);

  // Water proximity: within 8 tiles
  bfs(waterSources, 8, TAG_NEAR_WATER);

  // Road proximity: within 3 tiles
  bfs(mainRoadSources, 3, TAG_NEAR_MAIN_ROAD);
  bfs(secRoadSources, 3, TAG_NEAR_SEC_ROAD);

  // Elevation tags
  for (let i = 0; i < N; i++) {
    if (tiles[i].elevation > 200) tiles[i].tags |= TAG_HIGH_ELEVATION;
    if (tiles[i].elevation < 60) tiles[i].tags |= TAG_LOW_ELEVATION;
  }

  // Edge of town: land tiles adjacent to water or undistricted
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (tiles[idx].terrain === TERRAIN_WATER) continue;
      if (tiles[idx].district === DISTRICT_NONE) continue;

      let isEdge = false;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) { isEdge = true; break; }
        const ni = ny * width + nx;
        if (tiles[ni].terrain === TERRAIN_WATER || tiles[ni].district === DISTRICT_NONE) {
          isEdge = true; break;
        }
      }
      if (isEdge) tiles[idx].tags |= TAG_EDGE_OF_TOWN;
    }
  }
}

// ── Compute town stats ─────────────────────────────────────────────

function emptyStats(): TownStats {
  return {
    population: 0, jobs: 0, commerceScore: 0, greeneryScore: 0,
    averageDensity: 0, buildingCount: 0, roadTileCount: 0,
    districtCoverage: {},
  };
}

export function computeStats(state: TownState): TownStats {
  const { map, buildings, archetypes } = state;
  const stats = emptyStats();
  const districtCounts: Record<string, number> = {};

  // Count district tiles and roads
  for (const tile of map.tiles) {
    if (tile.district > 0) {
      const name = DISTRICT_NAMES[tile.district];
      districtCounts[name] = (districtCounts[name] || 0) + 1;
    }
    if (tile.road > 0) stats.roadTileCount++;
  }
  stats.districtCoverage = districtCounts;

  // Count buildings and compute derived stats
  let totalDensity = 0;
  for (let i = 1; i < buildings.length; i++) {
    const b = buildings[i];
    const arch = archetypes.get(b.archetypeId);
    if (!arch) continue;

    stats.buildingCount++;

    const capacity = arch.footprint.w * arch.footprint.h * arch.heightLevels;
    const distName = DISTRICT_NAMES[b.district];

    if (distName === 'residential_low' || distName === 'residential_high') {
      stats.population += capacity * 4;
    }
    if (distName === 'commercial') {
      stats.jobs += capacity * 2;
      stats.commerceScore += capacity;
    }
    if (distName === 'industrial') {
      stats.jobs += capacity * 3;
    }
    if (distName === 'park') {
      stats.greeneryScore += capacity * 5;
    }
    if (distName === 'civic') {
      stats.jobs += capacity;
      stats.commerceScore += capacity;
    }

    totalDensity += arch.densityClass === 'high' ? 3 : arch.densityClass === 'medium' ? 2 : 1;
  }

  stats.averageDensity = stats.buildingCount > 0 ? totalDensity / stats.buildingCount : 0;
  return stats;
}

// ── Place starter NPC buildings ────────────────────────────────────

function placeStarterBuildings(state: TownState, rng: PRNG): void {
  const { plots } = state;

  // Place a few NPC buildings in each district to seed the town
  const plotsByDistrict = new Map<number, Plot[]>();
  for (const plot of plots.values()) {
    if (plot.occupied) continue;
    let arr = plotsByDistrict.get(plot.district);
    if (!arr) { arr = []; plotsByDistrict.set(plot.district, arr); }
    arr.push(plot);
  }

  for (const [district, distPlots] of plotsByDistrict) {
    if (district === DISTRICT_NONE) continue;

    rng.shuffle(distPlots);
    const count = Math.min(rng.nextInt(2, 5), distPlots.length);

    for (let i = 0; i < count; i++) {
      const plot = distPlots[i];
      // Find a matching archetype
      const arch = getArchetypeForDistrict(district, 'low') ||
                   getArchetypeForDistrict(district, 'medium');
      if (!arch) continue;

      // Check footprint fits
      if (arch.footprint.w > plot.width || arch.footprint.h > plot.height) continue;

      placeBuilding(state, plot, arch.id, null, `NPC ${arch.name}`);
    }
  }
}

// ── Place a building on a plot ─────────────────────────────────────

export function placeBuilding(
  state: TownState,
  plot: Plot,
  archetypeId: string,
  ownerAddress: string | null,
  buildingName: string | null,
): Building | null {
  const arch = state.archetypes.get(archetypeId);
  if (!arch) return null;
  if (plot.occupied) return null;

  const id = state.buildings.length;
  const building: Building = {
    id,
    archetypeId,
    originX: plot.originX,
    originY: plot.originY,
    rotation: 0,
    district: plot.district,
    plotId: plot.id,
    ownerAddress,
    buildingName,
    customImageUrl: null,
    imagePrompt: arch.sdPromptTemplate,
  };

  state.buildings.push(building);
  plot.occupied = true;
  plot.buildingId = id;

  // Mark tiles
  const { map } = state;
  for (let dy = 0; dy < Math.min(arch.footprint.h, plot.height); dy++) {
    for (let dx = 0; dx < Math.min(arch.footprint.w, plot.width); dx++) {
      const tx = plot.originX + dx, ty = plot.originY + dy;
      if (tx < map.width && ty < map.height) {
        map.tiles[ty * map.width + tx].buildingId = id;
      }
    }
  }

  return building;
}
