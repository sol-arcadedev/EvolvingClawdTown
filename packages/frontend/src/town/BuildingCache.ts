/**
 * OffscreenCanvas sprite cache for isometric buildings.
 * Pre-renders each unique (tier, quantizedHue) combo so the main
 * draw loop only calls ctx.drawImage() once per building.
 */

import { PLOT_STRIDE, TIER_SCALE, COL_CYAN, COL_MAGENTA, COL_GREEN } from './constants';

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

// ── MAINFRAME SPRITE ────────────────────────────────────────

const MF_SIZE = PLOT_STRIDE * 1.8; // 518.4
const MF_U = MF_SIZE / 16;         // 32.4 world units per iso unit
const MF_PPU = 16;                  // pixels per iso unit (large sprite)
const MF_BBOX = { minX: -18, minY: -27, maxX: 18, maxY: 18 };
const TAU = Math.PI * 2;

function hexRGBA(hex: number, a: number): string {
  return `rgba(${(hex >> 16) & 0xff},${(hex >> 8) & 0xff},${hex & 0xff},${a})`;
}

function isoBoxMF(
  c: Ctx,
  ox: number, oy: number,
  bw: number, bd: number, bh: number,
  topHex: number, leftHex: number, rightHex: number,
  faceA: number,
  strokeHex: number, strokeA: number, strokeW: number,
) {
  const [x0, y0] = iso(ox, oy, 0);
  const [x1, y1] = iso(ox + bw, oy, 0);
  const [x3, y3] = iso(ox, oy + bd, 0);
  const [x4, y4] = iso(ox, oy, bh);
  const [x5, y5] = iso(ox + bw, oy, bh);
  const [x6, y6] = iso(ox + bw, oy + bd, bh);
  const [x7, y7] = iso(ox, oy + bd, bh);

  const ss = hexRGBA(strokeHex, strokeA);
  c.lineWidth = strokeW;

  c.beginPath();
  c.moveTo(x4, y4); c.lineTo(x5, y5); c.lineTo(x6, y6); c.lineTo(x7, y7);
  c.closePath(); c.fillStyle = hexRGBA(topHex, faceA); c.fill();
  c.strokeStyle = ss; c.stroke();

  c.beginPath();
  c.moveTo(x0, y0); c.lineTo(x3, y3); c.lineTo(x7, y7); c.lineTo(x4, y4);
  c.closePath(); c.fillStyle = hexRGBA(leftHex, faceA); c.fill();
  c.strokeStyle = ss; c.stroke();

  c.beginPath();
  c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x5, y5); c.lineTo(x4, y4);
  c.closePath(); c.fillStyle = hexRGBA(rightHex, faceA); c.fill();
  c.strokeStyle = ss; c.stroke();
}

function drawMainframeBody(ctx: Ctx) {
  const u = MF_U;

  // ── GLOW RINGS (concentric, very low alpha) ──
  for (let ring = 5; ring >= 1; ring--) {
    const r = 16 * (0.3 + ring * 0.15); // iso units
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fillStyle = hexRGBA(COL_CYAN, 0.04);
    ctx.fill();
  }

  // ── BASE PLATFORM ──
  isoBoxMF(ctx, -8, -8, 16, 16, 1.5,
    0x0a1220, 0x060c16, 0x081018,
    0.95, COL_CYAN, 0.4, 1.5 / u);

  // Platform edge detail lines
  ctx.beginPath();
  ctx.strokeStyle = hexRGBA(COL_CYAN, 0.12);
  ctx.lineWidth = 0.3 / u;
  for (let i = -6; i <= 6; i += 3) {
    const [lx0, ly0] = iso(-8, i, 1.5);
    const [lx1, ly1] = iso(8, i, 1.5);
    ctx.moveTo(lx0, ly0); ctx.lineTo(lx1, ly1);
  }
  ctx.stroke();

  // ── MAIN BLOCK — lower section ──
  isoBoxMF(ctx, -5.5, -5.5, 11, 11, 6,
    0x101a2e, 0x080e1a, 0x0c1424,
    0.95, COL_CYAN, 0.3, 1 / u);

  // ── MIDDLE SETBACK ──
  isoBoxMF(ctx, -4, -4, 8, 8, 5,
    0x121e32, 0x0a1422, 0x0e1828,
    0.92, COL_CYAN, 0.35, 1 / u);

  // ── UPPER CORE ──
  isoBoxMF(ctx, -2.5, -2.5, 5, 5, 5,
    0x141f35, 0x080e1a, 0x0c1424,
    0.9, COL_CYAN, 0.45, 1.2 / u);

  // ── CROWN ──
  isoBoxMF(ctx, -1.5, -1.5, 3, 3, 2,
    0x0a2040, 0x081838, 0x091c3c,
    0.85, COL_CYAN, 0.6, 1.5 / u);

  // ── NEON DIVIDER LINES between sections ──
  const dividers = [
    { z: 1.5, hw: 8.2 },
    { z: 7.5, hw: 5.8 },
    { z: 12.5, hw: 4.3 },
    { z: 17.5, hw: 2.8 },
  ];
  for (const d of dividers) {
    const [da, day] = iso(-d.hw, -d.hw, d.z);
    const [db, dby] = iso(d.hw, -d.hw, d.z);
    const [dc, dcy] = iso(d.hw, d.hw, d.z);
    // Sharp line
    ctx.beginPath();
    ctx.moveTo(da, day); ctx.lineTo(db, dby); ctx.lineTo(dc, dcy);
    ctx.strokeStyle = hexRGBA(COL_CYAN, 0.7);
    ctx.lineWidth = 1.5 / u;
    ctx.stroke();
    // Glow
    ctx.beginPath();
    ctx.moveTo(da, day); ctx.lineTo(db, dby); ctx.lineTo(dc, dcy);
    ctx.strokeStyle = hexRGBA(COL_CYAN, 0.15);
    ctx.lineWidth = 5 / u;
    ctx.stroke();
  }

  // ── WINDOW GRIDS on right face of main block ──
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const wy = -5.5 + 1 + col * 1.9;
      const wz = 2.0 + row * 1.3;
      const [w0, w0y] = iso(5.5, wy, wz);
      const [w1, w1y] = iso(5.5, wy, wz + 0.8);
      const [w2, w2y] = iso(5.5, wy + 1.2, wz + 0.8);
      const [w3, w3y] = iso(5.5, wy + 1.2, wz);
      const lit = (row + col) % 3 === 0;
      const wColor = lit ? ((row + col) % 5 === 0 ? COL_MAGENTA : COL_CYAN) : COL_CYAN;
      ctx.beginPath();
      ctx.moveTo(w0, w0y); ctx.lineTo(w1, w1y); ctx.lineTo(w2, w2y); ctx.lineTo(w3, w3y);
      ctx.closePath();
      ctx.fillStyle = hexRGBA(wColor, lit ? 0.6 : 0.08);
      ctx.fill();
    }
  }

  // ── WINDOW GRIDS on left face ──
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      const wx = -5.5 + 1 + col * 1.9;
      const wz = 2.0 + row * 1.3;
      const [w0, w0y] = iso(wx, 5.5, wz);
      const [w1, w1y] = iso(wx, 5.5, wz + 0.8);
      const [w2, w2y] = iso(wx + 1.2, 5.5, wz + 0.8);
      const [w3, w3y] = iso(wx + 1.2, 5.5, wz);
      const lit = (row + col) % 4 === 0;
      ctx.beginPath();
      ctx.moveTo(w0, w0y); ctx.lineTo(w1, w1y); ctx.lineTo(w2, w2y); ctx.lineTo(w3, w3y);
      ctx.closePath();
      ctx.fillStyle = hexRGBA(lit ? COL_GREEN : COL_CYAN, lit ? 0.5 : 0.06);
      ctx.fill();
    }
  }

  // ── WINDOWS on middle section (right face) ──
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const wy = -4 + 0.8 + col * 2.2;
      const wz = 8.0 + row * 1.5;
      const [w0, w0y] = iso(4, wy, wz);
      const [w1, w1y] = iso(4, wy, wz + 1.0);
      const [w2, w2y] = iso(4, wy + 1.4, wz + 1.0);
      const [w3, w3y] = iso(4, wy + 1.4, wz);
      ctx.beginPath();
      ctx.moveTo(w0, w0y); ctx.lineTo(w1, w1y); ctx.lineTo(w2, w2y); ctx.lineTo(w3, w3y);
      ctx.closePath();
      ctx.fillStyle = hexRGBA(
        (row + col) % 2 === 0 ? COL_CYAN : COL_MAGENTA,
        (row + col) % 3 === 0 ? 0.7 : 0.1,
      );
      ctx.fill();
    }
  }

  // ── WINDOWS on upper core (right face) ──
  for (let row = 0; row < 2; row++) {
    const [w0, w0y] = iso(2.5, -1 + row * 2.5, 13.5 + row * 2);
    const [w1, w1y] = iso(2.5, -1 + row * 2.5, 14.5 + row * 2);
    const [w2, w2y] = iso(2.5, 0.5 + row * 2.5, 14.5 + row * 2);
    const [w3, w3y] = iso(2.5, 0.5 + row * 2.5, 13.5 + row * 2);
    ctx.beginPath();
    ctx.moveTo(w0, w0y); ctx.lineTo(w1, w1y); ctx.lineTo(w2, w2y); ctx.lineTo(w3, w3y);
    ctx.closePath();
    ctx.fillStyle = hexRGBA(COL_CYAN, row === 0 ? 0.8 : 0.3);
    ctx.fill();
  }

  // ── CORNER PYLONS on platform ──
  const pylonPositions: [number, number][] = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
  for (const [px, py] of pylonPositions) {
    isoBoxMF(ctx, px - 0.4, py - 0.4, 0.8, 0.8, 3,
      0x102030, 0x0a1520, 0x0c1825,
      0.8, COL_CYAN, 0.5, 0.8 / u);
    // Pylon tip light
    const [tipX, tipY] = iso(px, py, 3.5);
    ctx.beginPath();
    ctx.arc(tipX, tipY, 1.5 / u, 0, TAU);
    ctx.fillStyle = hexRGBA(COL_CYAN, 0.7);
    ctx.fill();
  }

  // ── SPIRE ──
  const [spBase, spBaseY] = iso(0, 0, 19.5);
  const [spTop, spTopY] = iso(0, 0, 25);
  ctx.beginPath();
  ctx.moveTo(spBase, spBaseY); ctx.lineTo(spTop, spTopY);
  ctx.strokeStyle = hexRGBA(COL_CYAN, 0.7);
  ctx.lineWidth = 1.8 / u;
  ctx.stroke();

  // Spire cross-arms
  const [la, lay] = iso(-1.5, 0, 22);
  const [ra, ray] = iso(1.5, 0, 22);
  ctx.beginPath();
  ctx.moveTo(la, lay); ctx.lineTo(ra, ray);
  ctx.strokeStyle = hexRGBA(COL_CYAN, 0.4);
  ctx.lineWidth = 0.8 / u;
  ctx.stroke();

  const [fa, fay] = iso(0, -1.5, 22);
  const [ba, bay] = iso(0, 1.5, 22);
  ctx.beginPath();
  ctx.moveTo(fa, fay); ctx.lineTo(ba, bay);
  ctx.strokeStyle = hexRGBA(COL_CYAN, 0.4);
  ctx.lineWidth = 0.8 / u;
  ctx.stroke();

  // ── ENERGY ORB at spire tip ──
  ctx.beginPath();
  ctx.arc(spTop, spTopY, 5 / u, 0, TAU);
  ctx.fillStyle = hexRGBA(COL_CYAN, 0.15);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(spTop, spTopY, 2.5 / u, 0, TAU);
  ctx.fillStyle = hexRGBA(COL_CYAN, 0.5);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(spTop, spTopY, 1 / u, 0, TAU);
  ctx.fillStyle = hexRGBA(0xffffff, 0.9);
  ctx.fill();
}

export interface MainframeSpriteInfo {
  src: CanvasImageSource;
  ox: number; oy: number; // world-unit offset from mainframe center
  w: number; h: number;   // world-unit dimensions
}

let mfSpriteCache: MainframeSpriteInfo | null = null;

export function getMainframeSprite(): MainframeSpriteInfo {
  if (mfSpriteCache) return mfSpriteCache;

  const pxW = Math.ceil((MF_BBOX.maxX - MF_BBOX.minX) * MF_PPU);
  const pxH = Math.ceil((MF_BBOX.maxY - MF_BBOX.minY) * MF_PPU);
  const cvs = makeCanvas(pxW, pxH);
  const c = cvs.getContext('2d') as CanvasRenderingContext2D;

  c.translate(-MF_BBOX.minX * MF_PPU, -MF_BBOX.minY * MF_PPU);
  c.scale(MF_PPU, MF_PPU);

  drawMainframeBody(c);

  mfSpriteCache = {
    src: cvs,
    ox: MF_BBOX.minX * MF_U,
    oy: MF_BBOX.minY * MF_U,
    w: (MF_BBOX.maxX - MF_BBOX.minX) * MF_U,
    h: (MF_BBOX.maxY - MF_BBOX.minY) * MF_U,
  };
  return mfSpriteCache;
}

export { TIER_BBOX, TIER_U };
