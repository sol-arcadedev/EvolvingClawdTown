// ── Districts, roads, and plots ────────────────────────────────────

import { PRNG } from './prng.js';
import {
  TownMap, Tile, TileCoord, Cluster, Plot,
  TERRAIN_WATER,
  DISTRICT_NONE, DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH,
  DISTRICT_COMMERCIAL, DISTRICT_INDUSTRIAL, DISTRICT_CIVIC,
  DISTRICT_PARK, DISTRICT_HARBOR,
  inBounds,
} from './types.js';

// ── District assignment ────────────────────────────────────────────
// Labels clusters by position: central → civic/commercial/res_high,
// coastal → harbor/park, peripheral → res_low/industrial/park.

export function assignDistricts(map: TownMap, clusters: Cluster[], rng: PRNG): void {
  const cx = map.width / 2, cy = map.height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  // Sort by distance from center (should already be sorted)
  const sorted = [...clusters].sort((a, b) => a.distFromCenter - b.distFromCenter);

  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i];
    const normDist = c.distFromCenter / maxDist;

    if (normDist < 0.15) {
      // Very central — civic or commercial
      if (i === 0) {
        c.district = DISTRICT_CIVIC;
      } else {
        c.district = rng.chance(0.5) ? DISTRICT_COMMERCIAL : DISTRICT_RESIDENTIAL_HIGH;
      }
    } else if (normDist < 0.35) {
      // Inner ring — mixed high density
      if (c.nearWater && rng.chance(0.4)) {
        c.district = DISTRICT_HARBOR;
      } else {
        const roll = rng.next();
        if (roll < 0.4) c.district = DISTRICT_RESIDENTIAL_HIGH;
        else if (roll < 0.7) c.district = DISTRICT_COMMERCIAL;
        else c.district = DISTRICT_CIVIC;
      }
    } else if (normDist < 0.55) {
      // Mid ring — transition
      if (c.nearWater && rng.chance(0.5)) {
        c.district = DISTRICT_HARBOR;
      } else {
        const roll = rng.next();
        if (roll < 0.35) c.district = DISTRICT_RESIDENTIAL_HIGH;
        else if (roll < 0.6) c.district = DISTRICT_RESIDENTIAL_LOW;
        else if (roll < 0.8) c.district = DISTRICT_COMMERCIAL;
        else c.district = DISTRICT_PARK;
      }
    } else {
      // Outer ring — low density + industrial
      if (c.nearWater && rng.chance(0.3)) {
        c.district = DISTRICT_HARBOR;
      } else {
        const roll = rng.next();
        if (roll < 0.4) c.district = DISTRICT_RESIDENTIAL_LOW;
        else if (roll < 0.6) c.district = DISTRICT_INDUSTRIAL;
        else c.district = DISTRICT_PARK;
      }
    }

    // Apply district to all tiles in cluster
    for (const t of c.tiles) {
      map.tiles[t.y * map.width + t.x].district = c.district;
    }
  }
}

// ── A* pathfinding ─────────────────────────────────────────────────

interface AStarNode {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

export function astarPath(
  map: TownMap,
  from: TileCoord,
  to: TileCoord,
  costFn: (tile: Tile, x: number, y: number) => number,
): TileCoord[] | null {
  const { width, height, tiles } = map;
  const key = (x: number, y: number) => y * width + x;
  const gScore = new Float32Array(width * height).fill(Infinity);
  const closed = new Uint8Array(width * height);

  // Simple priority queue (binary heap would be better but this works for 256x256)
  const open: AStarNode[] = [];
  const heuristic = (x: number, y: number) =>
    Math.abs(x - to.x) + Math.abs(y - to.y);

  const startNode: AStarNode = {
    x: from.x, y: from.y, g: 0,
    f: heuristic(from.x, from.y), parent: null,
  };
  open.push(startNode);
  gScore[key(from.x, from.y)] = 0;

  const dirs = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

  while (open.length > 0) {
    // Find lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const curr = open[bestIdx];
    open[bestIdx] = open[open.length - 1];
    open.pop();

    if (curr.x === to.x && curr.y === to.y) {
      // Reconstruct path
      const path: TileCoord[] = [];
      let node: AStarNode | null = curr;
      while (node) { path.push({ x: node.x, y: node.y }); node = node.parent; }
      return path.reverse();
    }

    const ck = key(curr.x, curr.y);
    if (closed[ck]) continue;
    closed[ck] = 1;

    for (const [dx, dy] of dirs) {
      const nx = curr.x + dx, ny = curr.y + dy;
      if (!inBounds(map, nx, ny)) continue;
      const nk = key(nx, ny);
      if (closed[nk]) continue;

      const tile = tiles[nk];
      const cost = costFn(tile, nx, ny);
      if (cost < 0) continue; // impassable

      const ng = curr.g + cost;
      if (ng < gScore[nk]) {
        gScore[nk] = ng;
        open.push({
          x: nx, y: ny, g: ng,
          f: ng + heuristic(nx, ny),
          parent: curr,
        });
      }
    }
  }

  return null; // no path
}

// ── Road generation ────────────────────────────────────────────────

export function generateRoads(map: TownMap, clusters: Cluster[], rng: PRNG): void {
  const { width, height, tiles } = map;
  const cx = Math.floor(width / 2), cy = Math.floor(height / 2);

  // Cost function for A*: water is impassable, land tiles have base cost
  const roadCost = (tile: Tile, _x: number, _y: number): number => {
    if (tile.terrain === TERRAIN_WATER) return -1;
    if (tile.road > 0) return 0.5; // prefer existing roads
    return 1;
  };

  // 1. Main roads: connect cluster centroids to map center
  for (const cluster of clusters) {
    if (cluster.tiles.length < 30) continue;
    const path = astarPath(map, { x: cx, y: cy }, cluster.centroid, roadCost);
    if (path) {
      for (const p of path) {
        const idx = p.y * width + p.x;
        if (tiles[idx].terrain !== TERRAIN_WATER) {
          tiles[idx].road = 1; // main road
        }
      }
    }
  }

  // 2. Secondary roads: connect adjacent cluster centroids
  for (let i = 0; i < clusters.length; i++) {
    for (let j = i + 1; j < clusters.length; j++) {
      const ci = clusters[i], cj = clusters[j];
      const dist = Math.sqrt(
        (ci.centroid.x - cj.centroid.x) ** 2 +
        (ci.centroid.y - cj.centroid.y) ** 2,
      );
      if (dist < width * 0.3 && rng.chance(0.5)) {
        const path = astarPath(map, ci.centroid, cj.centroid, roadCost);
        if (path) {
          for (const p of path) {
            const idx = p.y * width + p.x;
            if (tiles[idx].terrain !== TERRAIN_WATER && tiles[idx].road === 0) {
              tiles[idx].road = 2; // secondary road
            }
          }
        }
      }
    }
  }

  // 3. Local roads: loose grid within each district every 4-6 tiles
  for (const cluster of clusters) {
    if (cluster.tiles.length < 40) continue;
    const spacing = rng.nextInt(4, 7);

    // Find bounding box
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (const t of cluster.tiles) {
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    }

    // Create a set for fast lookup
    const tileSet = new Set<number>();
    for (const t of cluster.tiles) tileSet.add(t.y * width + t.x);

    // Horizontal local roads
    for (let y = minY + rng.nextInt(1, spacing); y <= maxY; y += spacing) {
      for (let x = minX; x <= maxX; x++) {
        const idx = y * width + x;
        if (tileSet.has(idx) && tiles[idx].terrain !== TERRAIN_WATER && tiles[idx].road === 0) {
          tiles[idx].road = 3; // local road
        }
      }
    }

    // Vertical local roads
    for (let x = minX + rng.nextInt(1, spacing); x <= maxX; x += spacing) {
      for (let y = minY; y <= maxY; y++) {
        const idx = y * width + x;
        if (tileSet.has(idx) && tiles[idx].terrain !== TERRAIN_WATER && tiles[idx].road === 0) {
          tiles[idx].road = 3; // local road
        }
      }
    }
  }
}

// ── Plot creation ──────────────────────────────────────────────────
// Scan for road-adjacent land tiles and group into buildable plots.

export function createPlots(map: TownMap, rng: PRNG): Map<string, Plot> {
  const { width, height, tiles } = map;
  const plots = new Map<string, Plot>();
  const used = new Uint8Array(width * height);

  // Try larger plots first (3x2, 2x2, 2x1), then 1x1
  const sizes: [number, number][] = [[3, 2], [2, 2], [2, 1], [1, 1]];

  for (const [pw, ph] of sizes) {
    for (let y = 0; y < height - ph + 1; y++) {
      for (let x = 0; x < width - pw + 1; x++) {
        // Check all tiles in footprint
        let valid = true;
        let hasRoadNeighbor = false;
        let district = -1;

        for (let dy = 0; dy < ph && valid; dy++) {
          for (let dx = 0; dx < pw && valid; dx++) {
            const idx = (y + dy) * width + (x + dx);
            const tile = tiles[idx];

            if (used[idx]) { valid = false; break; }
            if (tile.terrain === TERRAIN_WATER) { valid = false; break; }
            if (tile.road > 0) { valid = false; break; } // don't build on roads

            if (district === -1) district = tile.district;
            else if (tile.district !== district) { valid = false; break; }

            if (district === DISTRICT_NONE) { valid = false; break; }

            // Check for adjacent road
            for (const [rdx, rdy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
              const nx = x + dx + rdx, ny = y + dy + rdy;
              if (inBounds(map, nx, ny) && tiles[ny * width + nx].road > 0) {
                hasRoadNeighbor = true;
              }
            }
          }
        }

        if (!valid || !hasRoadNeighbor || district <= 0) continue;

        const plotId = `p_${x}_${y}`;
        plots.set(plotId, {
          id: plotId,
          originX: x,
          originY: y,
          width: pw,
          height: ph,
          district,
          occupied: false,
          buildingId: 0,
        });

        // Mark tiles as used
        for (let dy = 0; dy < ph; dy++) {
          for (let dx = 0; dx < pw; dx++) {
            used[(y + dy) * width + (x + dx)] = 1;
          }
        }
      }
    }
  }

  return plots;
}
