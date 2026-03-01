// ── Noise-based terrain generation ─────────────────────────────────
// Embedded 2D simplex noise + multi-octave terrain with island bias.

import { PRNG } from './prng';
import {
  TownMap, Tile,
  TERRAIN_WATER, TERRAIN_LAND, TERRAIN_HILL, TERRAIN_FOREST,
  Cluster, TileCoord,
} from './types';

// ── Simplex noise (self-contained, no deps) ────────────────────────

const F2 = 0.5 * (Math.sqrt(3) - 1);
const G2 = (3 - Math.sqrt(3)) / 6;
const GRAD: [number, number][] = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
];

function buildPerm(rng: PRNG): Uint8Array {
  const p = new Uint8Array(512);
  const base = new Uint8Array(256);
  for (let i = 0; i < 256; i++) base[i] = i;
  // shuffle
  for (let i = 255; i > 0; i--) {
    const j = rng.nextInt(0, i + 1);
    const tmp = base[i]; base[i] = base[j]; base[j] = tmp;
  }
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  return p;
}

function simplex2d(x: number, y: number, perm: Uint8Array): number {
  const s = (x + y) * F2;
  const i = Math.floor(x + s);
  const j = Math.floor(y + s);
  const t = (i + j) * G2;
  const X0 = i - t, Y0 = j - t;
  const x0 = x - X0, y0 = y - Y0;

  const i1 = x0 > y0 ? 1 : 0;
  const j1 = x0 > y0 ? 0 : 1;
  const x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
  const x2 = x0 - 1 + 2 * G2, y2 = y0 - 1 + 2 * G2;

  const ii = i & 255, jj = j & 255;

  let n0 = 0, n1 = 0, n2 = 0;
  let t0 = 0.5 - x0 * x0 - y0 * y0;
  if (t0 > 0) {
    t0 *= t0;
    const g = GRAD[perm[ii + perm[jj]] & 7];
    n0 = t0 * t0 * (g[0] * x0 + g[1] * y0);
  }
  let t1 = 0.5 - x1 * x1 - y1 * y1;
  if (t1 > 0) {
    t1 *= t1;
    const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7];
    n1 = t1 * t1 * (g[0] * x1 + g[1] * y1);
  }
  let t2 = 0.5 - x2 * x2 - y2 * y2;
  if (t2 > 0) {
    t2 *= t2;
    const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7];
    n2 = t2 * t2 * (g[0] * x2 + g[1] * y2);
  }

  return 70 * (n0 + n1 + n2); // range ~ [-1, 1]
}

// ── Multi-octave noise ─────────────────────────────────────────────

function fractalNoise(
  x: number, y: number, perm: Uint8Array,
  octaves: number, lacunarity: number, persistence: number,
): number {
  let value = 0, amplitude = 1, frequency = 1, max = 0;
  for (let o = 0; o < octaves; o++) {
    value += amplitude * simplex2d(x * frequency, y * frequency, perm);
    max += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return value / max; // normalized [-1, 1]
}

// ── Generate terrain ───────────────────────────────────────────────

export function generateTerrain(width: number, height: number, rng: PRNG): TownMap {
  const perm = buildPerm(rng);
  const tiles: Tile[] = new Array(width * height);
  const cx = width / 2, cy = height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);

  // Generate elevation with island bias
  const elevations = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width, ny = y / height;
      let e = fractalNoise(nx * 4, ny * 4, perm, 5, 2.0, 0.5);
      e = (e + 1) / 2; // normalize to [0, 1]

      // Circular island bias: higher at center, lower at edges
      const dx = (x - cx) / cx, dy = (y - cy) / cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const islandBias = 1 - Math.pow(dist, 1.8);
      e = e * 0.6 + islandBias * 0.4;
      e = Math.max(0, Math.min(1, e));

      elevations[y * width + x] = e;
    }
  }

  // Find water threshold (~30th percentile of land)
  const sorted = Float32Array.from(elevations).sort();
  const waterThreshold = sorted[Math.floor(sorted.length * 0.30)];
  const hillThreshold = sorted[Math.floor(sorted.length * 0.80)];

  // Secondary noise for forest vs land
  const perm2 = buildPerm(rng);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const e = elevations[idx];
      const elev = Math.floor(e * 255);

      let terrain: number;
      if (e < waterThreshold) {
        terrain = TERRAIN_WATER;
      } else if (e > hillThreshold) {
        terrain = TERRAIN_HILL;
      } else {
        // Use second noise layer for forest patches
        const forestNoise = simplex2d(x / 20, y / 20, perm2);
        terrain = forestNoise > 0.3 ? TERRAIN_FOREST : TERRAIN_LAND;
      }

      tiles[idx] = {
        terrain,
        elevation: elev,
        district: 0,  // DISTRICT_NONE
        road: 0,
        buildingId: 0,
        tags: 0,
        clusterId: -1,
      };
    }
  }

  return { width, height, tiles };
}

// ── Small island generation for dynamic town ─────────────────────
// Creates a minimal island with castle platform, moat, and town land.

export function generateSmallIsland(width: number, height: number): TownMap {
  const tiles: Tile[] = new Array(width * height);
  const cx = Math.floor(width / 2);
  const cy = Math.floor(height / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let terrain: number;
      let elevation: number;
      let district: number = 0; // DISTRICT_NONE

      if (dist <= 2) {
        // Castle platform — hill at center
        terrain = TERRAIN_HILL;
        elevation = 180;
      } else if (dist <= 4) {
        // Moat ring — water
        terrain = TERRAIN_WATER;
        elevation = 40;
      } else if (dist <= 14) {
        // Town land — gentle variation
        terrain = TERRAIN_LAND;
        elevation = 100 + Math.floor((14 - dist) / 10 * 20); // 100-120
      } else {
        // Ocean — void
        terrain = TERRAIN_WATER;
        elevation = 20;
      }

      tiles[idx] = {
        terrain,
        elevation,
        district,
        road: 0,
        buildingId: 0,
        tags: 0,
        clusterId: -1,
      };
    }
  }

  return { width, height, tiles };
}

// ── Cellular automaton clustering ──────────────────────────────────
// Groups contiguous land tiles into clusters using flood-fill + CA smoothing.

export function clusterLand(map: TownMap, rng: PRNG): Cluster[] {
  const { width, height, tiles } = map;

  // Assign initial random cluster IDs to land tiles
  const targetClusters = rng.nextInt(10, 16); // 10-15 clusters
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].terrain !== TERRAIN_WATER) {
      tiles[i].clusterId = rng.nextInt(0, targetClusters);
    }
  }

  // CA iterations: each land tile adopts the most common cluster in its neighborhood
  for (let iter = 0; iter < 5; iter++) {
    const next = new Int16Array(tiles.length);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (tiles[idx].terrain === TERRAIN_WATER) { next[idx] = -1; continue; }

        const counts = new Map<number, number>();
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
            const nIdx = ny * width + nx;
            const cid = tiles[nIdx].clusterId;
            if (cid >= 0) counts.set(cid, (counts.get(cid) || 0) + 1);
          }
        }

        let best = tiles[idx].clusterId, bestCount = 0;
        for (const [cid, cnt] of counts) {
          if (cnt > bestCount) { best = cid; bestCount = cnt; }
        }
        next[idx] = best;
      }
    }

    for (let i = 0; i < tiles.length; i++) {
      if (tiles[i].terrain !== TERRAIN_WATER) {
        tiles[i].clusterId = next[i];
      }
    }
  }

  // Build cluster objects
  const cx = width / 2, cy = height / 2;
  const clusterMap = new Map<number, TileCoord[]>();
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cid = tiles[y * width + x].clusterId;
      if (cid < 0) continue;
      let arr = clusterMap.get(cid);
      if (!arr) { arr = []; clusterMap.set(cid, arr); }
      arr.push({ x, y });
    }
  }

  const clusters: Cluster[] = [];
  for (const [id, tileList] of clusterMap) {
    if (tileList.length < 20) continue; // skip tiny clusters

    let sumX = 0, sumY = 0;
    let hasWaterNeighbor = false;
    for (const t of tileList) {
      sumX += t.x; sumY += t.y;
      // Check if near water
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = t.x + dx, ny = t.y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (tiles[ny * width + nx].terrain === TERRAIN_WATER) {
            hasWaterNeighbor = true;
          }
        }
      }
    }

    const centX = Math.round(sumX / tileList.length);
    const centY = Math.round(sumY / tileList.length);

    clusters.push({
      id,
      tiles: tileList,
      centroid: { x: centX, y: centY },
      distFromCenter: Math.sqrt((centX - cx) ** 2 + (centY - cy) ** 2),
      nearWater: hasWaterNeighbor,
      district: 0,
    });
  }

  // Sort by distance from center
  clusters.sort((a, b) => a.distFromCenter - b.distFromCenter);
  return clusters;
}
