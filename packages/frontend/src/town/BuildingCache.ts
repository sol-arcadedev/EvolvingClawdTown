/**
 * OffscreenCanvas sprite cache for isometric buildings.
 * Pre-renders each unique (tier, quantizedHue) combo so the main
 * draw loop only calls ctx.drawImage() once per building.
 */

import { PLOT_STRIDE, TIER_SCALE } from './constants';

// Pixels per iso unit in sprite — balances quality vs memory.
// At default zoom (0.45) this exceeds screen resolution; at max zoom (3)
// sprites upscale ~3x which is acceptable for flat-color geometry.
const SPRITE_PPU = 32;
const HUE_QUANT = 5; // quantize hue to nearest 5 degrees → 72 buckets

// ── ISO PROJECTION ──────────────────────────────────────────────
function iso(bx: number, by: number, bz: number): [number, number] {
  return [bx - by, (bx + by) * 0.5 - bz];
}

// ── CACHED HSL (Step 5) ─────────────────────────────────────────
const _hslCache = new Map<string, string>();
export function hsl(h: number, s: number, l: number, a = 1): string {
  const key = `${h},${s},${l},${a}`;
  let v = _hslCache.get(key);
  if (!v) {
    v = a < 1 ? `hsla(${h},${s}%,${l}%,${a})` : `hsl(${h},${s}%,${l}%)`;
    _hslCache.set(key, v);
  }
  return v;
}

// ── DRAWING PRIMITIVES ──────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

function isoBox(
  c: Ctx,
  ox: number, oy: number,
  bw: number, bd: number, bh: number,
  top: string, left: string, right: string,
) {
  const [x0, y0] = iso(ox, oy, 0);
  const [x1, y1] = iso(ox + bw, oy, 0);
  const [x3, y3] = iso(ox, oy + bd, 0);
  const [x4, y4] = iso(ox, oy, bh);
  const [x5, y5] = iso(ox + bw, oy, bh);
  const [x6, y6] = iso(ox + bw, oy + bd, bh);
  const [x7, y7] = iso(ox, oy + bd, bh);

  c.beginPath();
  c.moveTo(x4, y4); c.lineTo(x5, y5); c.lineTo(x6, y6); c.lineTo(x7, y7);
  c.closePath(); c.fillStyle = top; c.fill();
  c.beginPath();
  c.moveTo(x0, y0); c.lineTo(x3, y3); c.lineTo(x7, y7); c.lineTo(x4, y4);
  c.closePath(); c.fillStyle = left; c.fill();
  c.beginPath();
  c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x5, y5); c.lineTo(x4, y4);
  c.closePath(); c.fillStyle = right; c.fill();
}

function winR(
  c: Ctx,
  ox: number, oy: number, bw: number,
  wy: number, wz: number, ww: number, wh: number,
  color: string,
) {
  const [a, ay] = iso(ox + bw, oy + wy, wz);
  const [b, by] = iso(ox + bw, oy + wy, wz + wh);
  const [d, dy] = iso(ox + bw, oy + wy + ww, wz + wh);
  const [e, ey] = iso(ox + bw, oy + wy + ww, wz);
  c.beginPath(); c.moveTo(a, ay); c.lineTo(b, by); c.lineTo(d, dy); c.lineTo(e, ey);
  c.closePath(); c.fillStyle = color; c.fill();
}

function winL(
  c: Ctx,
  ox: number, oy: number, bd: number,
  wx: number, wz: number, ww: number, wh: number,
  color: string,
) {
  const [a, ay] = iso(ox + wx, oy + bd, wz);
  const [b, by] = iso(ox + wx, oy + bd, wz + wh);
  const [d, dy] = iso(ox + wx + ww, oy + bd, wz + wh);
  const [e, ey] = iso(ox + wx + ww, oy + bd, wz);
  c.beginPath(); c.moveTo(a, ay); c.lineTo(b, by); c.lineTo(d, dy); c.lineTo(e, ey);
  c.closePath(); c.fillStyle = color; c.fill();
}

function accentLine(
  c: Ctx,
  ox: number, oy: number, bw: number, bd: number, z: number,
  color: string, width: number,
) {
  const [a, ay] = iso(ox - 0.2, oy, z);
  const [b, by] = iso(ox + bw + 0.2, oy, z);
  const [d, dy] = iso(ox + bw + 0.2, oy + bd, z);
  c.beginPath(); c.moveTo(a, ay); c.lineTo(b, by); c.lineTo(d, dy);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

// ── TIER DRAWERS ────────────────────────────────────────────────

function drawTier1(c: Ctx, h: number) {
  const bw = 4, bd = 4, bh = 3, ox = -2, oy = -2;
  isoBox(c, ox, oy, bw, bd, bh, hsl(h,15,14), hsl(h,15,8), hsl(h,15,11));
  winR(c, ox, oy, bw, 1.2, 0.8, 1.5, 1.5, hsl(h,80,60,0.7));
  winL(c, ox, oy, bd, 1.2, 0.8, 1.5, 1.5, hsl(h,70,50,0.5));
}

function drawTier2(c: Ctx, h: number) {
  const bw = 5, bd = 5, bh = 6, ox = -2.5, oy = -2.5;
  isoBox(c, ox, oy, bw, bd, bh, hsl(h,15,15), hsl(h,15,9), hsl(h,15,12));
  winR(c, ox, oy, bw, 1.5, 1.0, 1.5, 1.5, hsl(h,80,60,0.7));
  winR(c, ox, oy, bw, 1.5, 3.5, 1.5, 1.5, hsl(h,80,60,0.3));
  winL(c, ox, oy, bd, 1.5, 1.0, 1.5, 1.5, hsl(h,70,50,0.5));
  winL(c, ox, oy, bd, 1.5, 3.5, 1.5, 1.5, hsl(h,70,50,0.25));
  accentLine(c, ox, oy, bw, bd, 3.5, hsl(h,90,55,0.5), 0.15);
}

function drawTier3(c: Ctx, h: number) {
  const ox = -3, oy = -3;
  isoBox(c, ox, oy, 6, 6, 4, hsl(h,15,16), hsl(h,15,9), hsl(h,15,12));
  isoBox(c, ox+0.8, oy+0.8, 4.4, 4.4, 5, hsl(h,15,18), hsl(h,15,10), hsl(h,15,13));
  winR(c, ox, oy, 6, 0.8, 0.8, 1.2, 1.5, hsl(h,80,60,0.7));
  winR(c, ox, oy, 6, 2.8, 0.8, 1.2, 1.5, hsl(h,80,60,0.3));
  winL(c, ox, oy, 6, 1.2, 0.8, 1.2, 1.5, hsl(h,70,50,0.5));
  winR(c, ox+0.8, oy+0.8, 4.4, 1.0, 5.0, 1.2, 1.5, hsl(h,80,60,0.6));
  winL(c, ox+0.8, oy+0.8, 4.4, 1.0, 5.0, 1.2, 1.5, hsl(h,70,50,0.4));
  accentLine(c, ox, oy, 6, 6, 4, hsl(h,90,55,0.6), 0.18);
}

function drawTier4(c: Ctx, h: number) {
  const ox = -3.5, oy = -3.5;
  isoBox(c, ox+1, oy+1, 5, 5, 14, hsl(h,15,15), hsl(h,15,8), hsl(h,15,11));
  isoBox(c, ox-1, oy+1.5, 2, 4, 7, hsl(h,15,13), hsl(h,15,7), hsl(h,15,10));
  winR(c, ox+1, oy+1, 5, 1.5, 2, 1.2, 1.2, hsl(h,80,60,0.7));
  winR(c, ox+1, oy+1, 5, 1.5, 5, 1.2, 1.2, hsl(h,80,60,0.35));
  winR(c, ox+1, oy+1, 5, 1.5, 8, 1.2, 1.2, hsl(h,80,60,0.6));
  winR(c, ox+1, oy+1, 5, 1.5, 11, 1.2, 1.2, hsl(h,80,60,0.25));
  winL(c, ox+1, oy+1, 5, 1.5, 3, 1.2, 1.2, hsl(h,70,50,0.5));
  winL(c, ox+1, oy+1, 5, 1.5, 7, 1.2, 1.2, hsl(h,70,50,0.6));
  accentLine(c, ox+1, oy+1, 5, 5, 7, hsl(h,90,55,0.5), 0.12);
  const [sx, sy] = iso(0, 0, 14);
  const [tx, ty] = iso(0, 0, 18);
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx, ty);
  c.strokeStyle = hsl(h,80,55,0.6); c.lineWidth = 0.15; c.stroke();
  c.beginPath(); c.arc(tx, ty, 0.4, 0, Math.PI*2);
  c.fillStyle = hsl(h,80,65,0.8); c.fill();
}

function drawTier5(c: Ctx, h: number) {
  const ox = -4, oy = -4;
  isoBox(c, ox, oy, 8, 8, 6, hsl(h,15,16), hsl(h,15,8), hsl(h,15,12));
  isoBox(c, ox+1.2, oy+1.2, 5.6, 5.6, 6, hsl(h,15,18), hsl(h,15,10), hsl(h,15,13));
  isoBox(c, ox+2.2, oy+2.2, 3.6, 3.6, 6, hsl(h,15,15), hsl(h,15,8), hsl(h,15,11));
  winR(c, ox, oy, 8, 1.5, 1.5, 1.2, 1.2, hsl(h,80,60,0.7));
  winR(c, ox, oy, 8, 4.0, 1.5, 1.2, 1.2, hsl(h,80,60,0.35));
  winR(c, ox, oy, 8, 1.5, 3.5, 1.2, 1.2, hsl(h,80,60,0.5));
  winL(c, ox, oy, 8, 2.0, 2.0, 1.2, 1.2, hsl(h,70,50,0.45));
  winR(c, ox+1.2, oy+1.2, 5.6, 1.5, 7.5, 1.2, 1.5, hsl(h,80,60,0.6));
  winR(c, ox+1.2, oy+1.2, 5.6, 1.5, 10, 1.2, 1.5, hsl(h,80,60,0.3));
  winL(c, ox+1.2, oy+1.2, 5.6, 1.5, 8, 1.2, 1.5, hsl(h,70,50,0.4));
  winR(c, ox+2.2, oy+2.2, 3.6, 1.0, 14, 1.2, 1.5, hsl(h,80,60,0.7));
  accentLine(c, ox, oy, 8, 8, 6, hsl(h,90,55,0.5), 0.15);
  const [sx, sy] = iso(0, 0, 18);
  const [tx, ty] = iso(0, 0, 23);
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx, ty);
  c.strokeStyle = hsl(h,80,55,0.6); c.lineWidth = 0.15; c.stroke();
  c.beginPath(); c.arc(tx, ty, 0.5, 0, Math.PI*2);
  c.fillStyle = hsl(h,80,65,0.8); c.fill();
}

const TIER_DRAW: Record<number, (c: Ctx, h: number) => void> = {
  1: drawTier1, 2: drawTier2, 3: drawTier3, 4: drawTier4, 5: drawTier5,
};

// ── TIER BOUNDING BOXES (iso units, with padding) ───────────────
// Analytically computed from each tier's geometry + 1-unit safety margin.
export interface TierBBox {
  minX: number; minY: number;
  maxX: number; maxY: number;
  isoDiv: number;
}

const TIER_BBOX: Record<number, TierBBox> = {
  1: { minX: -5, minY: -6, maxX: 5, maxY: 3, isoDiv: 6 },
  2: { minX: -6, minY: -10, maxX: 6, maxY: 4, isoDiv: 8 },
  3: { minX: -7, minY: -9, maxX: 7, maxY: 4, isoDiv: 10 },
  4: { minX: -8, minY: -20, maxX: 6, maxY: 4, isoDiv: 12 },
  5: { minX: -9, minY: -25, maxX: 9, maxY: 5, isoDiv: 14 },
};

// ── PRECOMPUTED WORLD-UNIT SCALE PER TIER ───────────────────────
// u = PLOT_STRIDE * TIER_SCALE[tier] / isoDiv
// Converts iso units to world units for drawImage sizing.
const TIER_U: Record<number, number> = {};
for (const t of [1, 2, 3, 4, 5]) {
  TIER_U[t] = PLOT_STRIDE * (TIER_SCALE[t] ?? 0.5) / TIER_BBOX[t].isoDiv;
}

// ── SPRITE CACHE ────────────────────────────────────────────────
const spriteCache = new Map<string, CanvasImageSource>();

function quantizeHue(hue: number): number {
  return Math.round(hue / HUE_QUANT) * HUE_QUANT;
}

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export interface SpriteInfo {
  src: CanvasImageSource;
  bbox: TierBBox;
  u: number; // world units per iso unit
}

export function getBuildingSprite(tier: number, hue: number): SpriteInfo {
  const bbox = TIER_BBOX[tier];
  const u = TIER_U[tier];
  const qh = quantizeHue(hue);
  const key = `${tier},${qh}`;

  let src = spriteCache.get(key);
  if (!src) {
    const w = Math.ceil((bbox.maxX - bbox.minX) * SPRITE_PPU);
    const h = Math.ceil((bbox.maxY - bbox.minY) * SPRITE_PPU);
    const cvs = makeCanvas(w, h);
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;

    // Transform: iso origin (0,0) maps to pixel (-minX*PPU, -minY*PPU)
    ctx.translate(-bbox.minX * SPRITE_PPU, -bbox.minY * SPRITE_PPU);
    ctx.scale(SPRITE_PPU, SPRITE_PPU);

    TIER_DRAW[tier](ctx, qh);

    src = cvs;
    spriteCache.set(key, src);
  }

  return { src, bbox, u };
}

// ── LIGHT SPRITES (pre-rendered glow dots) ──────────────────
// 1 drawImage per light instead of 3 beginPath+arc+fill
const LIGHT_PX = 30;
const LIGHT_R = LIGHT_PX / 2;
const lightCache = new Map<number, CanvasImageSource>();

export function getLightSprite(hue: number): CanvasImageSource {
  const qh = quantizeHue(hue);
  let src = lightCache.get(qh);
  if (src) return src;

  const cvs = makeCanvas(LIGHT_PX, LIGHT_PX);
  const c = cvs.getContext('2d') as CanvasRenderingContext2D;
  const cx = LIGHT_R, cy = LIGHT_R;
  c.fillStyle = `hsl(${qh},90%,60%)`;

  c.globalAlpha = 0.22;
  c.beginPath(); c.arc(cx, cy, LIGHT_R, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 0.44;
  c.beginPath(); c.arc(cx, cy, LIGHT_R * 0.6, 0, Math.PI * 2); c.fill();
  c.globalAlpha = 1;
  c.beginPath(); c.arc(cx, cy, LIGHT_R * 0.4, 0, Math.PI * 2); c.fill();

  lightCache.set(qh, cvs);
  return cvs;
}

export { TIER_BBOX, TIER_U };
