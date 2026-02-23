// ═══════════════════════════════════════════════════════════════════
// CityLayout — Static layout: neighborhoods, plot metadata, street hierarchy
// Pre-computed once at load. Deterministic from seeded noise.
// ═══════════════════════════════════════════════════════════════════

import { PLOT_W, PLOT_H } from './HouseSprite';

// ── Shared utilities ──

export const hash = (x: number, y: number, seed: number) =>
  Math.abs(((x * 73856093) ^ (y * 19349663) ^ (seed * 83492791)) % 1000) / 1000;

export function smoothNoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  const tx = fx * fx * (3 - 2 * fx);
  const ty = fy * fy * (3 - 2 * fy);
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty;
}

export function terrainHeight(px: number, py: number): number {
  const scale1 = 0.15, scale2 = 0.3, scale3 = 0.6;
  const n1 = smoothNoise(px * scale1, py * scale1, 42) * 0.5;
  const n2 = smoothNoise(px * scale2, py * scale2, 137) * 0.3;
  const n3 = smoothNoise(px * scale3, py * scale3, 251) * 0.2;
  return n1 + n2 + n3;
}

export function modulateColor(color: number, factor: number): number {
  let r = (color >> 16) & 0xff;
  let g = (color >> 8) & 0xff;
  let b = color & 0xff;
  r = Math.min(255, Math.max(0, Math.round(r * factor)));
  g = Math.min(255, Math.max(0, Math.round(g * factor)));
  b = Math.min(255, Math.max(0, Math.round(b * factor)));
  return (r << 16) | (g << 8) | b;
}

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (g << 8) | bl;
}

// ── Constants ──

export const RANGE = 12;
export const SIDEWALK = 7;
export const CURB = 1;

// ── 10 Neighborhoods ──

export type NeighborhoodId =
  | 'neon_core'
  | 'corporate'
  | 'tech_district'
  | 'entertainment'
  | 'market'
  | 'old_town'
  | 'industrial'
  | 'residential'
  | 'waterfront'
  | 'wasteland';

export interface NeighborhoodPalette {
  groundColor: number;
  sidewalkColor: number;
  roadColor: number;
  accentColor: number;
  curbColor: number;
  tilePattern: 'circuit' | 'grid' | 'brick' | 'metal' | 'cracked' | 'plank';
  neonIntensity: number;   // 0..1
  treeDensity: number;     // 0..1
  propDensity: number;     // 0..1
  tileSize: number;
}

const NEIGHBORHOOD_PALETTES: Record<NeighborhoodId, NeighborhoodPalette> = {
  neon_core: {
    groundColor: 0x151528, sidewalkColor: 0x38384e, roadColor: 0x222234, accentColor: 0x00fff5,
    curbColor: 0x4a4a65, tilePattern: 'circuit', neonIntensity: 1.0, treeDensity: 0.05,
    propDensity: 0.9, tileSize: 16,
  },
  corporate: {
    groundColor: 0x121225, sidewalkColor: 0x35355a, roadColor: 0x1e1e30, accentColor: 0x4488ff,
    curbColor: 0x484870, tilePattern: 'grid', neonIntensity: 0.7, treeDensity: 0.15,
    propDensity: 0.7, tileSize: 18,
  },
  tech_district: {
    groundColor: 0x0e1820, sidewalkColor: 0x2a3a3a, roadColor: 0x1a2828, accentColor: 0x00ff88,
    curbColor: 0x3a4a48, tilePattern: 'circuit', neonIntensity: 0.8, treeDensity: 0.1,
    propDensity: 0.75, tileSize: 16,
  },
  entertainment: {
    groundColor: 0x181020, sidewalkColor: 0x3a2a48, roadColor: 0x221830, accentColor: 0xff0080,
    curbColor: 0x4a3860, tilePattern: 'grid', neonIntensity: 0.9, treeDensity: 0.08,
    propDensity: 0.85, tileSize: 16,
  },
  market: {
    groundColor: 0x181410, sidewalkColor: 0x3a3428, roadColor: 0x222018, accentColor: 0xff8800,
    curbColor: 0x4a4438, tilePattern: 'brick', neonIntensity: 0.5, treeDensity: 0.12,
    propDensity: 0.8, tileSize: 12,
  },
  old_town: {
    groundColor: 0x161412, sidewalkColor: 0x383228, roadColor: 0x201e18, accentColor: 0xffaa44,
    curbColor: 0x484234, tilePattern: 'brick', neonIntensity: 0.3, treeDensity: 0.2,
    propDensity: 0.6, tileSize: 14,
  },
  industrial: {
    groundColor: 0x12100c, sidewalkColor: 0x2e2a22, roadColor: 0x1c1a14, accentColor: 0xff6600,
    curbColor: 0x3a3628, tilePattern: 'metal', neonIntensity: 0.2, treeDensity: 0.02,
    propDensity: 0.5, tileSize: 20,
  },
  residential: {
    groundColor: 0x0e1418, sidewalkColor: 0x283438, roadColor: 0x1a2226, accentColor: 0x44ccbb,
    curbColor: 0x384448, tilePattern: 'grid', neonIntensity: 0.3, treeDensity: 0.4,
    propDensity: 0.4, tileSize: 20,
  },
  waterfront: {
    groundColor: 0x0c1418, sidewalkColor: 0x283238, roadColor: 0x182028, accentColor: 0x44aadd,
    curbColor: 0x384048, tilePattern: 'plank', neonIntensity: 0.4, treeDensity: 0.15,
    propDensity: 0.5, tileSize: 10,
  },
  wasteland: {
    groundColor: 0x0a0a0e, sidewalkColor: 0x1e1e28, roadColor: 0x141418, accentColor: 0x555555,
    curbColor: 0x2a2a34, tilePattern: 'cracked', neonIntensity: 0.05, treeDensity: 0.03,
    propDensity: 0.15, tileSize: 24,
  },
};

export function getNeighborhoodPalette(id: NeighborhoodId): NeighborhoodPalette {
  return NEIGHBORHOOD_PALETTES[id];
}

// ── Neighborhood assignment: distance + angle + noise for irregular boundaries ──

export function getNeighborhood(px: number, py: number): NeighborhoodId {
  const dist = Math.sqrt(px * px + py * py);
  const angle = Math.atan2(py, px); // -PI..PI
  const noise = smoothNoise(px * 0.2, py * 0.2, 777) * 2.5; // boundary jitter

  // Waterfront: along the canal (row ≈ -2, within ±1.5)
  if (py >= -4 && py <= -1 && dist > 2) return 'waterfront';

  // Neon core: center d≤2 with noise
  if (dist + noise * 0.5 <= 2.8) return 'neon_core';

  // Ring 2-6 sectors based on angle
  if (dist + noise <= 6.5) {
    // North: angle roughly -PI/2 ± PI/4
    if (angle > -Math.PI * 0.75 && angle < -Math.PI * 0.25) return 'corporate';
    // NE: angle roughly -PI/4 to 0
    if (angle >= -Math.PI * 0.25 && angle < Math.PI * 0.15) return 'tech_district';
    // SE: angle roughly 0 to PI/2
    if (angle >= Math.PI * 0.15 && angle < Math.PI * 0.6) return 'entertainment';
    // SW: angle roughly PI/2 to 3PI/4
    if (angle >= Math.PI * 0.6 && angle < Math.PI * 0.85) return 'market';
    // NW: the rest
    return 'old_town';
  }

  // Ring 7-9
  if (dist + noise <= 9.5) {
    // South half → industrial
    if (angle > Math.PI * 0.25 && angle < Math.PI * 0.85) return 'industrial';
    // North/east → residential
    return 'residential';
  }

  // Ring 10+ → wasteland
  return 'wasteland';
}

// ── Street hierarchy ──

export type StreetType = 'highway' | 'boulevard' | 'street' | 'alley';

export function getStreetType(gridIndex: number, _isVertical: boolean, neighborhood: NeighborhoodId): StreetType {
  const absI = Math.abs(gridIndex);
  if (gridIndex === 0) return 'highway';
  if (absI % 4 === 0) return 'boulevard';
  // Alleys in wasteland/industrial ~25%
  if ((neighborhood === 'wasteland' || neighborhood === 'industrial') && hash(gridIndex, _isVertical ? 1 : 0, 888) < 0.25) {
    return 'alley';
  }
  return 'street';
}

const STREET_BASE_WIDTHS: Record<StreetType, number> = {
  highway: 44,
  boulevard: 34,
  street: 24,
  alley: 14,
};

export function getStreetWidth(gridIndex: number, isVertical: boolean, neighborhood: NeighborhoodId): number {
  const type = getStreetType(gridIndex, isVertical, neighborhood);
  const base = STREET_BASE_WIDTHS[type];
  // Per-segment width noise (0.85-1.15x)
  const noise = 0.85 + hash(gridIndex, isVertical ? 1 : 0, 999) * 0.3;
  return Math.round(base * noise);
}

export function getStreetWidthByType(type: StreetType): number {
  return STREET_BASE_WIDTHS[type];
}

// ── Cul-de-sac / street fade system ──
export function shouldStreetFade(gridIndex: number, perpIndex: number, _isVertical: boolean): number {
  const absPerp = Math.abs(perpIndex);
  const absGrid = Math.abs(gridIndex);
  if (absGrid < 7 && absPerp < 7) return 1;
  const h = hash(gridIndex, _isVertical ? 1 : 0, 555);
  if (h > 0.35) return 1;
  const edgeDist = RANGE - absPerp;
  if (edgeDist <= 3) return Math.max(0, edgeDist / 3);
  return 1;
}

// ── Per-Plot Metadata ──

export interface PlotMeta {
  neighborhood: NeighborhoodId;
  visualOffsetX: number;    // -8..+8px jitter (ground rendering ONLY)
  visualOffsetY: number;    // -6..+6px jitter
  streetWidthN: number;     // north edge street width
  streetWidthW: number;     // west edge street width
  elevation: number;        // 0..1 terrain height
  vacantVariant: number;    // 0..5
  isReserved: boolean;
  rowStagger: number;       // horizontal shift for this row (±12px)
}

// ── Reserved plot positions ──
export const RESERVED_PLOT_SET = new Set([
  '0,0', '-1,0', '0,-1', '-1,-1',
  '5,0', '5,-1',
  '-6,0', '-6,-1',
  '0,-6', '-1,-6',
  '0,5', '-1,5',
  '3,3', '-4,3', '3,-4', '-4,-4',
  '7,4', '-8,4', '7,-5', '-8,-5',
  // Billboard plaza spaces — large open areas with giant holographic displays
  '6,-3', '6,-4',     // NE billboard plaza
  '-7,-3', '-7,-4',   // NW billboard plaza
  '6,3', '6,4',       // SE billboard plaza
  '-7,3', '-7,4',     // SW billboard plaza
  // Mid-ring billboard towers
  '3,-7',             // N billboard tower
  '-4,6',             // S billboard tower
  '9,0',              // E billboard tower
  '-10,0',            // W billboard tower
]);

export function isReservedPlot(px: number, py: number): boolean {
  return RESERVED_PLOT_SET.has(`${px},${py}`);
}

// ── Landmark definitions ──
export interface Landmark {
  cx: number; cy: number;
  spanX: number; spanY: number;
  type: 'plaza' | 'park' | 'billboard_cluster' | 'monument' | 'holographic_billboard';
}

export const LANDMARKS: Landmark[] = [
  { cx: 0, cy: 0, spanX: 2, spanY: 2, type: 'plaza' },
  { cx: 5, cy: 0, spanX: 1, spanY: 2, type: 'park' },
  { cx: -6, cy: 0, spanX: 1, spanY: 2, type: 'park' },
  { cx: 0, cy: -6, spanX: 2, spanY: 1, type: 'billboard_cluster' },
  { cx: 0, cy: 5, spanX: 2, spanY: 1, type: 'billboard_cluster' },
  { cx: 3, cy: 3, spanX: 1, spanY: 1, type: 'monument' },
  { cx: -4, cy: 3, spanX: 1, spanY: 1, type: 'monument' },
  { cx: 3, cy: -4, spanX: 1, spanY: 1, type: 'monument' },
  { cx: -4, cy: -4, spanX: 1, spanY: 1, type: 'monument' },
  { cx: 7, cy: 4, spanX: 1, spanY: 1, type: 'park' },
  { cx: -8, cy: 4, spanX: 1, spanY: 1, type: 'park' },
  { cx: 7, cy: -5, spanX: 1, spanY: 1, type: 'park' },
  { cx: -8, cy: -5, spanX: 1, spanY: 1, type: 'park' },
  // Holographic billboard plazas — giant animated displays
  { cx: 6, cy: -3, spanX: 1, spanY: 2, type: 'holographic_billboard' },
  { cx: -7, cy: -3, spanX: 1, spanY: 2, type: 'holographic_billboard' },
  { cx: 6, cy: 3, spanX: 1, spanY: 2, type: 'holographic_billboard' },
  { cx: -7, cy: 3, spanX: 1, spanY: 2, type: 'holographic_billboard' },
  // Billboard towers
  { cx: 3, cy: -7, spanX: 1, spanY: 1, type: 'holographic_billboard' },
  { cx: -4, cy: 6, spanX: 1, spanY: 1, type: 'holographic_billboard' },
  { cx: 9, cy: 0, spanX: 1, spanY: 1, type: 'holographic_billboard' },
  { cx: -10, cy: 0, spanX: 1, spanY: 1, type: 'holographic_billboard' },
];

// ── Pre-computed plot metadata cache ──

const plotMetaCache = new Map<string, PlotMeta>();

export function getPlotMeta(px: number, py: number): PlotMeta {
  const key = `${px},${py}`;
  const cached = plotMetaCache.get(key);
  if (cached) return cached;

  const neighborhood = getNeighborhood(px, py);
  const meta: PlotMeta = {
    neighborhood,
    visualOffsetX: (hash(px, py, 100) - 0.5) * 16,  // -8..+8
    visualOffsetY: (hash(px, py, 101) - 0.5) * 12,   // -6..+6
    streetWidthN: getStreetWidth(py, false, neighborhood),
    streetWidthW: getStreetWidth(px, true, neighborhood),
    elevation: terrainHeight(px, py),
    vacantVariant: Math.floor(hash(px, py, 200) * 6),  // 0..5
    isReserved: isReservedPlot(px, py),
    rowStagger: (py % 2 === 0) ? 0 : (hash(0, py, 300) - 0.5) * 24,  // ±12px
  };

  plotMetaCache.set(key, meta);
  return meta;
}

// ── Roundabout system ──

export type RoundaboutVariant = 'none' | 'standard' | 'vegetation' | 'monument' | 'large';

export function getRoundaboutVariant(ix: number, iy: number, neighborhood: NeighborhoodId): RoundaboutVariant {
  const isMainAxis = ix === 0 || iy === 0;
  const dist = Math.sqrt(ix * ix + iy * iy);
  const nearInnerRing = Math.abs(dist - 4.5) < 1;
  const nearOuterRing = Math.abs(dist - 8) < 1;

  if (nearInnerRing || nearOuterRing) return 'large';
  if (isMainAxis && neighborhood !== 'wasteland' && neighborhood !== 'residential') return 'standard';

  const isInner = dist <= 6;
  if (isInner) {
    if (ix % 2 === 0 && iy % 2 === 0) {
      const h = hash(ix, iy, 777);
      return h < 0.4 ? 'vegetation' : h < 0.7 ? 'monument' : 'standard';
    }
    return 'none';
  }
  if (dist <= 9) {
    if (ix % 4 === 0 && iy % 4 === 0) {
      const h = hash(ix, iy, 778);
      return h < 0.5 ? 'vegetation' : 'standard';
    }
  }
  return 'none';
}

// ── Vehicle colors ──
export const VEHICLE_COLORS = [
  0xff0066, 0x00fff5, 0xff6600, 0x00ff88, 0xaa44ff,
  0xff3388, 0x44aaff, 0xffaa00, 0x66ff66, 0xff4444,
  0x00ccff, 0xff00aa, 0x88ff00, 0x6644ff, 0xff8800,
];
