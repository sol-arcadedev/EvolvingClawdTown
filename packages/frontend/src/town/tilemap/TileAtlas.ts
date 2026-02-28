// ── Tile sprite atlas: pre-renders isometric diamond tiles ─────
// ~60 variants (terrain × district × road combos), 32x16px each.

import { TILE_W, TILE_H, getTileColor } from './TilemapRenderer';
import type { DecodedTile } from './TilemapRenderer';

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

// Cache of pre-rendered tile sprites keyed by visual variant
const tileCache = new Map<number, CanvasImageSource>();

// Encode tile visual key: terrain(2b) | district(3b) | road(2b) = 7 bits = 128 variants
function tileKey(tile: DecodedTile): number {
  return (tile.terrain & 0x03) | ((tile.district & 0x07) << 2) | ((tile.road & 0x03) << 5);
}

function renderTileSprite(key: number): CanvasImageSource {
  const cvs = makeCanvas(TILE_W, TILE_H);
  const ctx = cvs.getContext('2d') as CanvasRenderingContext2D | null;
  if (!ctx) return cvs;

  const tile: DecodedTile = {
    terrain: key & 0x03,
    district: (key >> 2) & 0x07,
    road: (key >> 5) & 0x03,
    hasBuilding: false,
    elevation: 0,
    buildingId: 0,
  };

  const color = getTileColor(tile);
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;

  // Draw isometric diamond
  ctx.beginPath();
  ctx.moveTo(hw, 0);        // top
  ctx.lineTo(TILE_W, hh);   // right
  ctx.lineTo(hw, TILE_H);   // bottom
  ctx.lineTo(0, hh);        // left
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();

  // Subtle edge highlight for depth
  ctx.strokeStyle = 'rgba(255,255,255,0.08)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(hw, 0);
  ctx.lineTo(TILE_W, hh);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.beginPath();
  ctx.moveTo(TILE_W, hh);
  ctx.lineTo(hw, TILE_H);
  ctx.lineTo(0, hh);
  ctx.stroke();

  return cvs;
}

export function getTileSprite(tile: DecodedTile): CanvasImageSource {
  const key = tileKey(tile);
  let sprite = tileCache.get(key);
  if (!sprite) {
    sprite = renderTileSprite(key);
    tileCache.set(key, sprite);
  }
  return sprite;
}

export function drawTile(
  ctx: CanvasRenderingContext2D,
  tile: DecodedTile,
  screenX: number,
  screenY: number,
): void {
  const sprite = getTileSprite(tile);
  ctx.drawImage(sprite, screenX - TILE_W / 2, screenY - TILE_H / 2, TILE_W, TILE_H);
}
