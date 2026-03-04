// ── Tile sprite atlas: textured isometric diamond tiles ─────────
// Loads pre-generated tile texture PNGs and draws them instead of
// flat-colored procedural diamonds. Falls back to procedural if
// textures haven't loaded yet.

import { TILE_W, TILE_H, getTileColor } from './TilemapRenderer';
import type { DecodedTile } from './TilemapRenderer';

// ── Texture definitions ────────────────────────────────────────

const TILE_TEXTURE_KEYS = [
  'grass', 'grass-2', 'grass-3', 'grass-dark',
  'grass-yellow', 'grass-flowers', 'field', 'dirt',
  'water', 'hill', 'forest', 'forest-2',
  'road-main', 'road-secondary', 'road-local',
  'park', 'plot', 'sand', 'garden',
] as const;

type TileTextureKey = typeof TILE_TEXTURE_KEYS[number];

// All ground variants — green-dominant with occasional accent patches
const GRASS_VARIANTS: TileTextureKey[] = [
  'grass', 'grass', 'grass', 'grass', 'grass',  // 5/16 base green
  'grass-2', 'grass-2', 'grass-2',               // 3/16 lime-yellow
  'grass-3', 'grass-3',                           // 2/16 deep emerald
  'grass-dark',                                    // 1/16 dark shaded
  'grass-yellow',                                  // 1/16 sun-bleached
  'grass-flowers',                                 // 1/16 wildflowers
  'grass-flowers',                                 // 1/16 wildflowers
  'field',                                         // 1/16 farmland
  'dirt',                                          // 1/16 bare earth
];
const FOREST_VARIANTS: TileTextureKey[] = ['forest', 'forest-2'];

// Simple hash for deterministic variant selection by tile position
function tileHash(tx: number, ty: number): number {
  let h = (tx * 374761393 + ty * 668265263) | 0;
  h = ((h ^ (h >> 13)) * 1274126177) | 0;
  return (h ^ (h >> 16)) >>> 0;
}

const TEXTURE_BASE_PATH = '/assets/tiles/';

// Loaded texture images keyed by name
const textures = new Map<TileTextureKey, HTMLImageElement>();
let texturesLoaded = false;
let textureLoadAttempted = false;
const loadListeners: Array<() => void> = [];

/** Register a callback for when tile textures finish loading. */
export function onTileTexturesLoaded(cb: () => void): void {
  if (texturesLoaded) { cb(); return; }
  loadListeners.push(cb);
}

// ── Preload textures ───────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load: ${src}`));
    img.src = src;
  });
}

/** Preload all tile textures. Safe to call multiple times. */
export async function preloadTileTextures(): Promise<void> {
  if (textureLoadAttempted) return;
  textureLoadAttempted = true;

  const results = await Promise.allSettled(
    TILE_TEXTURE_KEYS.map(async (key) => {
      const img = await loadImage(`${TEXTURE_BASE_PATH}${key}.png`);
      textures.set(key, img);
    }),
  );

  const loaded = results.filter(r => r.status === 'fulfilled').length;
  texturesLoaded = loaded === TILE_TEXTURE_KEYS.length;

  if (!texturesLoaded) {
    console.warn(`Tile textures: ${loaded}/${TILE_TEXTURE_KEYS.length} loaded. Using procedural fallback for missing tiles.`);
  }

  // Rebuild sprite cache now that textures are available
  if (loaded > 0) {
    tileCache.clear();
    for (const cb of loadListeners) cb();
    loadListeners.length = 0;
  }
}

// Kick off preloading immediately on module load
preloadTileTextures();

// ── Tile → texture mapping ─────────────────────────────────────

function getTextureKey(tile: DecodedTile, tx: number = 0, ty: number = 0): TileTextureKey | null {
  // Road takes priority
  if (tile.road === 1) return 'road-main';
  if (tile.road === 2) return 'road-secondary';
  if (tile.road === 3) return 'road-local';

  // Building plot — brown dirt ground
  if (tile.hasBuilding) return 'plot';

  // Park district — use garden variant for some park tiles
  if (tile.district === 6) {
    const h = tileHash(tx, ty);
    return (h % 5 === 0) ? 'garden' : 'park';
  }

  // Harbor district near water — sandy beach
  if (tile.district === 7 && tile.terrain === 1) {
    const h = tileHash(tx, ty);
    return (h % 3 === 0) ? 'sand' : GRASS_VARIANTS[h % GRASS_VARIANTS.length];
  }

  // District-biased ground selection for grass terrain
  if (tile.terrain === 1 && tile.district > 0) {
    const h = tileHash(tx, ty);
    // Civic district — more flowers
    if (tile.district === 5) {
      const civicPool: TileTextureKey[] = ['grass', 'grass-2', 'grass-flowers', 'grass-flowers', 'grass-flowers', 'grass-yellow', 'grass-3'];
      return civicPool[h % civicPool.length];
    }
    // Residential — occasional field/garden patches
    if (tile.district === 1 || tile.district === 2) {
      const resPool: TileTextureKey[] = ['grass', 'grass', 'grass', 'grass-2', 'grass-2', 'grass-3', 'grass-yellow', 'grass-flowers', 'field'];
      return resPool[h % resPool.length];
    }
    // Industrial — slightly more dirt/dark
    if (tile.district === 4) {
      const indPool: TileTextureKey[] = ['grass', 'grass', 'grass-dark', 'grass-dark', 'grass-3', 'grass-2', 'dirt'];
      return indPool[h % indPool.length];
    }
  }

  // Terrain-based with variants
  switch (tile.terrain) {
    case 0: return 'water';
    case 1: {
      const h = tileHash(tx, ty);
      return GRASS_VARIANTS[h % GRASS_VARIANTS.length];
    }
    case 2: {
      // Hills: mix sand with regular hill
      const h = tileHash(tx, ty);
      return (h % 4 === 0) ? 'sand' : 'hill';
    }
    case 3: {
      const h = tileHash(tx, ty);
      return FOREST_VARIANTS[h % FOREST_VARIANTS.length];
    }
    default: return null;
  }
}

// ── District tint overlay colors (semi-transparent) ────────────

const DISTRICT_TINT_COLORS: Record<number, string> = {
  1: 'rgba(128, 192, 96, 0.25)',   // residential_low — warm leafy
  2: 'rgba(212, 176, 96, 0.25)',   // residential_high — richer gold
  3: 'rgba(212, 144, 64, 0.25)',   // commercial — terracotta amber
  4: 'rgba(160, 144, 112, 0.25)',  // industrial — warm tan
  5: 'rgba(192, 168, 96, 0.25)',   // civic — warm gold
  // 6 = park — uses its own texture, no tint
  7: 'rgba(112, 184, 160, 0.25)',  // harbor — warm sandy-teal
};

// ── Canvas helpers ─────────────────────────────────────────────

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// ── Diamond path helper ────────────────────────────────────────

function diamondPath(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const hw = w / 2;
  const hh = h / 2;
  ctx.beginPath();
  ctx.moveTo(hw, 0);
  ctx.lineTo(w, hh);
  ctx.lineTo(hw, h);
  ctx.lineTo(0, hh);
  ctx.closePath();
}

// ── Sprite cache ───────────────────────────────────────────────

const tileCache = new Map<string, CanvasImageSource>();

// Encode tile visual key including position for variant selection
function tileCacheKey(tile: DecodedTile, tx: number, ty: number): string {
  const base = (tile.terrain & 0x03) | ((tile.district & 0x07) << 2) | ((tile.road & 0x03) << 5) | ((tile.hasBuilding ? 1 : 0) << 7);
  // For tiles with variants (grass, forest, park, hill, harbor), include variant index
  const needsVariant = tile.road === 0 && !tile.hasBuilding && (tile.terrain === 1 || tile.terrain === 3 || tile.terrain === 2 || tile.district === 6 || tile.district === 7);
  if (needsVariant) {
    const h = tileHash(tx, ty);
    return `${base}:${h % 16}`;
  }
  return `${base}`;
}

function renderTileSprite(tile: DecodedTile, tx: number, ty: number): CanvasImageSource {
  const cvs = makeCanvas(TILE_W, TILE_H);
  const ctx = cvs.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return cvs;

  const textureKey = getTextureKey(tile, tx, ty);
  const textureImg = textureKey ? textures.get(textureKey) : undefined;

  if (textureImg) {
    // Draw textured tile: clip to diamond, then draw texture image
    diamondPath(ctx, TILE_W, TILE_H);
    ctx.save();
    ctx.clip();
    ctx.drawImage(textureImg, 0, 0, TILE_W, TILE_H);

    // District tinting overlay (not for park=6 or no-district=0)
    const tint = DISTRICT_TINT_COLORS[tile.district];
    if (tint && tile.road === 0) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, TILE_W, TILE_H);
    }

    ctx.restore();
  } else {
    // Procedural fallback
    const color = getTileColor(tile);
    diamondPath(ctx, TILE_W, TILE_H);
    ctx.fillStyle = color;
    ctx.fill();
  }

  // Subtle edge highlights for depth
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(TILE_W / 2, 0);
  ctx.lineTo(TILE_W, TILE_H / 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.moveTo(TILE_W, TILE_H / 2);
  ctx.lineTo(TILE_W / 2, TILE_H);
  ctx.lineTo(0, TILE_H / 2);
  ctx.stroke();

  return cvs;
}

export function getTileSprite(tile: DecodedTile, tx: number = 0, ty: number = 0): CanvasImageSource {
  const key = tileCacheKey(tile, tx, ty);
  let sprite = tileCache.get(key);
  if (!sprite) {
    sprite = renderTileSprite(tile, tx, ty);
    tileCache.set(key, sprite);
  }
  return sprite;
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: DecodedTile,
  screenX: number,
  screenY: number,
  tileX: number = 0,
  tileY: number = 0,
): void {
  const sprite = getTileSprite(tile, tileX, tileY);
  ctx.drawImage(sprite, screenX - TILE_W / 2, screenY - TILE_H / 2, TILE_W, TILE_H);
}

/**
 * Call this after textures finish loading to rebuild the sprite cache.
 * ChunkCache should also invalidateAll() after this.
 */
export function rebuildTileCache(): void {
  tileCache.clear();
}
