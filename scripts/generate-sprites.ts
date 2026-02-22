/**
 * Cyberpunk Pixel Art Sprite Generator for Claude Town — HD Edition
 *
 * Generates all required spritesheets as PNGs:
 * - houses.png   (5 tiers: shack → megastructure)
 * - construction.png (4 frames)
 * - damage_overlay.png (3 frames)
 * - props.png (4 frames)
 *
 * Each frame is 192×288px (64×96 base pixels at 3× scale).
 */

import { createCanvas, Canvas } from 'canvas';
import fs from 'fs';
import path from 'path';

const SCALE = 3;
const BASE_W = 64;
const BASE_H = 96;
const FRAME_W = BASE_W * SCALE; // 192
const FRAME_H = BASE_H * SCALE; // 288

const OUT_DIR = path.resolve(__dirname, '../packages/frontend/src/assets/sprites');

// ─── Color Palette ───────────────────────────────────────────────────
const C = {
  // Walls / structure
  darkBase:     '#06061a',
  wallDark:     '#0c0c22',
  wallDark2:    '#0e0e28',
  wallMid:      '#14143a',
  wallMid2:     '#181844',
  wallLight:    '#1e1e50',
  wallAccent:   '#24245a',
  wallHighlight:'#2c2c6a',
  wallEdge:     '#080818',

  // Roofs
  roofDark:     '#161636',
  roofMid:      '#1e1e4a',
  roofLight:    '#26265a',
  roofHighlight:'#303070',

  // Neon colors (multiple for variety)
  nCyan:        '#00fff5',
  nCyanDim:     '#00ccbb',
  nCyanGlow:    '#55fffa',
  nCyanBright:  '#aafffc',
  nPink:        '#ff2d95',
  nPinkDim:     '#cc2277',
  nPinkGlow:    '#ff66bb',
  nPurple:      '#bb55ff',
  nPurpleDim:   '#8833dd',
  nGold:        '#ffcc00',
  nGoldDim:     '#cc9900',
  nOrange:      '#ff7722',
  nOrangeDim:   '#cc5511',
  nRed:         '#ff2244',
  nRedDim:      '#cc1133',
  nGreen:       '#00ff88',
  nGreenDim:    '#00cc66',
  nBlue:        '#4488ff',
  nBlueDim:     '#3366cc',
  nWhite:       '#ddeeff',

  // Windows
  wDark:        '#080814',
  wOff:         '#0c0c1a',
  wLit:         '#5599ee',
  wWarm:        '#ffcc44',
  wPink:        '#ff55aa',
  wGreen:       '#44ff99',
  wPurple:      '#9955ff',
  wOrange:      '#ff8833',
  wRed:         '#ff3355',
  wBlue:        '#3388ff',
  wWhite:       '#ccddff',
  wCyan:        '#44dddd',

  // Construction
  concrete:     '#3a3a58',
  concreteDk:   '#2a2a44',
  concreteLt:   '#4a4a68',
  scaffold:     '#556688',
  scaffoldDk:   '#445577',
  scaffoldLt:   '#6677aa',
  crane:        '#5577aa',
  craneDk:      '#446699',

  // Damage
  crack:        '#ffaa22',
  crackDk:      '#aa7711',
  fire:         '#ff4400',
  fireGlow:     '#ff8800',
  fireBright:   '#ffdd33',
  fireCore:     '#ffffaa',
  smoke:        '#444466',
  smokeDk:      '#333355',
  smokeLt:      '#555577',
  rubble:       '#333355',
  rubbleDk:     '#222244',
  rubbleLt:     '#444466',

  // Props
  lampPost:     '#4a5a6e',
  treeTrunk:    '#2a2a44',
  treeLeaf:     '#00cc77',
  treeGlow:     '#44ffaa',
  billboard:    '#0a0a20',
  roadDark:     '#0c0c18',
  roadLine:     '#1a1a33',
  roadYellow:   '#cc9922',

  // Ground
  groundDk:     '#08081a',
  groundMid:    '#0c0c22',
  groundLine:   '#050512',
};

// ─── Drawing primitives ──────────────────────────────────────────────
type Ctx = CanvasRenderingContext2D;

function px(c: Ctx, x: number, y: number, col: string, s = 1) {
  c.fillStyle = col;
  c.fillRect(x * SCALE, y * SCALE, s * SCALE, s * SCALE);
}

function rect(c: Ctx, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col;
  c.fillRect(x * SCALE, y * SCALE, w * SCALE, h * SCALE);
}

function vline(c: Ctx, x: number, y1: number, y2: number, col: string) {
  for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) px(c, x, y, col);
}

function hline(c: Ctx, y: number, x1: number, x2: number, col: string) {
  for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) px(c, x, y, col);
}

function glow(c: Ctx, x: number, y: number, w: number, h: number, col: string, r = 1, a = 0.2) {
  c.save(); c.globalAlpha = a; c.fillStyle = col;
  c.fillRect((x - r) * SCALE, (y - r) * SCALE, (w + r * 2) * SCALE, (h + r * 2) * SCALE);
  c.restore();
}

function neonH(c: Ctx, y: number, x1: number, x2: number, col: string, glowR = 1, glowA = 0.2) {
  glow(c, x1, y, x2 - x1, 1, col, glowR, glowA);
  hline(c, y, x1, x2 - 1, col);
}

function neonV(c: Ctx, x: number, y1: number, y2: number, col: string, glowR = 1, glowA = 0.2) {
  glow(c, x, y1, 1, y2 - y1, col, glowR, glowA);
  vline(c, x, y1, y2 - 1, col);
}

// Window colors for variety
const WCOLORS = [C.wLit, C.wWarm, C.wPink, C.wGreen, C.wPurple, C.wOrange, C.wBlue, C.wCyan, C.wWhite, C.wRed];

function drawWin(c: Ctx, x: number, y: number, w: number, h: number, seed: number, lit = true) {
  rect(c, x, y, w, h, C.wDark);
  if (!lit) return;
  const col = WCOLORS[seed % WCOLORS.length];
  // Lit fill with subtle depth
  c.save(); c.globalAlpha = 0.9; rect(c, x, y, w - 1, h - 1, col); c.restore();
  c.save(); c.globalAlpha = 0.5; px(c, x + w - 1, y + h - 1, col); c.restore();
  // Bright corner highlight
  c.save(); c.globalAlpha = 1.0; px(c, x, y, col); c.restore();
}

// Row of windows
function winRow(c: Ctx, y: number, x1: number, x2: number, ww: number, wh: number, gap: number, seedBase: number, litPct = 0.8) {
  let x = x1;
  let i = 0;
  while (x + ww <= x2) {
    const lit = ((seedBase + i * 7 + y * 3) % 100) < litPct * 100;
    drawWin(c, x, y, ww, wh, seedBase + i, lit);
    x += ww + gap;
    i++;
  }
}

// ─── Ground ──────────────────────────────────────────────────────────
function drawGround(c: Ctx) {
  rect(c, 2, 88, 60, 8, C.groundDk);
  rect(c, 3, 88, 58, 1, C.groundMid);
  for (let x = 4; x < 60; x += 3) px(c, x, 90, C.groundLine);
  for (let x = 5; x < 59; x += 4) px(c, x, 92, C.groundLine);
  // Subtle neon reflection on ground
  c.save(); c.globalAlpha = 0.04;
  rect(c, 10, 89, 44, 3, C.nCyan);
  c.restore();
}

// ─── TIER 0: Ramshackle Cyberpunk Shanty ─────────────────────────────
function drawTier0(c: Ctx) {
  drawGround(c);
  const bx = 14, by = 62, bw = 36, bh = 26;

  // Main body
  rect(c, bx, by, bw, bh, C.wallDark);
  rect(c, bx, by, 1, bh, C.wallMid);           // left highlight
  rect(c, bx + bw - 1, by, 1, bh, C.wallEdge); // right shadow
  // Wall texture — horizontal planks
  for (let row = 0; row < 4; row++) {
    hline(c, by + 2 + row * 6, bx + 1, bx + bw - 2, C.wallDark2);
  }

  // Corrugated roof
  rect(c, bx - 4, by - 4, bw + 8, 4, C.roofDark);
  rect(c, bx - 3, by - 4, bw + 6, 1, C.roofMid);
  for (let x = bx - 3; x < bx + bw + 3; x += 2) px(c, x, by - 4, C.roofLight);
  // Roof overhang shadow
  c.save(); c.globalAlpha = 0.3; rect(c, bx - 3, by, bw + 6, 1, '#000000'); c.restore();
  // Ridge detail
  for (let x = bx - 2; x < bx + bw + 2; x += 3) px(c, x, by - 5, C.roofHighlight);

  // Windows — 2 small
  drawWin(c, bx + 3, by + 8, 5, 4, 0);
  drawWin(c, bx + 3, by + 14, 5, 4, 3);

  // Another window, right side, partially boarded
  drawWin(c, bx + 22, by + 8, 5, 4, 5);
  rect(c, bx + 22, by + 10, 5, 1, C.scaffoldDk); // board
  drawWin(c, bx + 22, by + 14, 5, 4, 2);

  // Door
  rect(c, bx + 12, by + 16, 6, 10, C.wDark);
  rect(c, bx + 13, by + 17, 4, 8, '#0a0a16');
  px(c, bx + 16, by + 22, C.nGold);
  // Neon door strip
  neonH(c, by + 16, bx + 12, bx + 18, C.nCyan);

  // Neon sign on roof — "OPEN" vibe
  glow(c, bx + 8, by - 8, 20, 3, C.nPink, 2, 0.15);
  rect(c, bx + 9, by - 8, 18, 3, '#0a0a1a');
  hline(c, by - 7, bx + 10, bx + 26, C.nPink);
  // Sign characters (abstract)
  for (let i = 0; i < 4; i++) px(c, bx + 11 + i * 4, by - 7, C.nPinkGlow);

  // Antenna with blinking light
  vline(c, bx + 30, by - 4, by - 14, C.scaffold);
  px(c, bx + 30, by - 14, C.nRed);
  glow(c, bx + 30, by - 14, 1, 1, C.nRed, 2, 0.3);
  // Crossbar
  hline(c, by - 10, bx + 28, bx + 32, C.scaffoldDk);

  // Satellite dish (left side)
  rect(c, bx - 3, by - 6, 4, 3, C.scaffoldDk);
  px(c, bx - 2, by - 7, C.scaffold);
  px(c, bx - 1, by - 7, C.scaffold);
  px(c, bx - 1, by - 8, C.scaffoldLt);

  // Exposed wiring / pipes on right wall
  vline(c, bx + bw, by + 4, by + bh - 2, C.scaffoldDk);
  vline(c, bx + bw + 1, by + 6, by + bh - 4, C.scaffoldDk);
  px(c, bx + bw, by + 8, C.nGreen);
  px(c, bx + bw, by + 16, C.nGreenDim);
  px(c, bx + bw + 1, by + 12, C.nOrange);

  // Puddle near base
  c.save(); c.globalAlpha = 0.15;
  rect(c, bx + 2, by + bh, 10, 2, C.nCyan);
  c.restore();

  // Crate / junk near door
  rect(c, bx + 30, by + 22, 4, 4, C.concreteDk);
  rect(c, bx + 30, by + 22, 4, 1, C.concrete);
}

// ─── TIER 1: Small Apartment Building ────────────────────────────────
function drawTier1(c: Ctx) {
  drawGround(c);
  const bx = 10, by = 42, bw = 44, bh = 46;

  // Main body — gradient
  for (let i = 0; i < bh; i++) {
    const v = 12 + Math.floor((i / bh) * 8);
    rect(c, bx, by + i, bw, 1, `rgb(${v},${v},${v + 26})`);
  }
  rect(c, bx, by, 2, bh, C.wallMid);             // left edge highlight
  rect(c, bx + bw - 2, by, 2, bh, C.wallEdge);   // right shadow

  // Floor bands
  for (let i = 1; i <= 4; i++) hline(c, by + i * 9, bx, bx + bw - 1, C.wallAccent);

  // Windows — 4 floors × 5 cols
  for (let row = 0; row < 4; row++) {
    const wy = by + 4 + row * 9;
    winRow(c, wy, bx + 4, bx + bw - 3, 4, 4, 4, row * 17, 0.75);
  }

  // Balconies on 2nd and 3rd floor
  for (const row of [1, 2]) {
    const wy = by + 4 + row * 9 + 4;
    for (let col = 0; col < 3; col++) {
      const bxc = bx + 6 + col * 14;
      hline(c, wy, bxc, bxc + 6, C.scaffoldDk);
      vline(c, bxc, wy, wy + 2, C.scaffoldDk);
      vline(c, bxc + 6, wy, wy + 2, C.scaffoldDk);
      // Railing
      hline(c, wy + 1, bxc, bxc + 6, C.scaffold);
    }
  }

  // Door — centered, neon framed
  const dx = bx + 17, dy = by + 38;
  rect(c, dx, dy, 10, 10, C.wDark);
  rect(c, dx + 1, dy + 1, 8, 8, '#06060e');
  neonH(c, dy, dx, dx + 10, C.nPink);
  neonV(c, dx, dy, dy + 10, C.nPinkDim);
  neonV(c, dx + 9, dy, dy + 10, C.nPinkDim);
  glow(c, dx, dy, 10, 10, C.nPink, 2, 0.08);
  // Door handle
  px(c, dx + 7, dy + 5, C.nGold);

  // Roof
  rect(c, bx - 2, by - 2, bw + 4, 2, C.roofDark);
  rect(c, bx - 1, by - 3, bw + 2, 1, C.roofMid);
  rect(c, bx, by - 4, bw, 1, C.roofLight);

  // Neon roofline
  neonH(c, by - 1, bx, bx + bw, C.nCyan);

  // Rooftop AC units
  rect(c, bx + 2, by - 6, 6, 3, C.scaffoldDk);
  rect(c, bx + 2, by - 6, 6, 1, C.scaffold);
  px(c, bx + 4, by - 6, C.scaffoldLt);
  rect(c, bx + 34, by - 7, 8, 4, C.scaffoldDk);
  rect(c, bx + 34, by - 7, 8, 1, C.scaffold);
  // Fan detail
  px(c, bx + 37, by - 6, C.scaffoldLt);
  px(c, bx + 39, by - 6, C.scaffoldLt);

  // Rooftop neon sign
  glow(c, bx + 12, by - 10, 20, 4, C.nCyan, 2, 0.15);
  rect(c, bx + 13, by - 10, 18, 4, C.billboard);
  neonH(c, by - 10, bx + 13, bx + 31, C.nCyan);
  neonH(c, by - 7, bx + 13, bx + 31, C.nCyanDim);
  // "Text"
  for (let i = 0; i < 5; i++) {
    px(c, bx + 15 + i * 3, by - 9, C.nCyanGlow);
    px(c, bx + 15 + i * 3, by - 8, C.nCyanDim);
  }

  // Fire escape on right side
  for (let i = 0; i < 3; i++) {
    const fy = by + 8 + i * 12;
    hline(c, fy, bx + bw, bx + bw + 4, C.scaffoldDk);
    vline(c, bx + bw + 4, fy, fy + 10, C.scaffoldDk);
    // Ladder
    for (let ly = fy + 2; ly < fy + 10; ly += 2) {
      hline(c, ly, bx + bw + 3, bx + bw + 5, C.scaffold);
    }
  }

  // Side pipe with neon accents
  vline(c, bx - 1, by + 6, by + bh, C.scaffoldDk);
  px(c, bx - 1, by + 14, C.nGreen);
  px(c, bx - 1, by + 30, C.nGreen);
}

// ─── Holographic drawing helpers ─────────────────────────────────────

/** Floating holographic panel with scan lines, border glow, and content */
function holoPanel(c: Ctx, x: number, y: number, w: number, h: number, borderColor: string, bgAlpha = 0.12, contentFn?: (c: Ctx, x: number, y: number, w: number, h: number) => void) {
  // Outer glow
  glow(c, x, y, w, h, borderColor, 3, 0.12);
  // Semi-transparent background
  c.save(); c.globalAlpha = bgAlpha;
  rect(c, x, y, w, h, '#0808ff');
  c.restore();
  // Neon border
  neonH(c, y, x, x + w, borderColor, 1, 0.25);
  neonH(c, y + h - 1, x, x + w, borderColor, 1, 0.15);
  neonV(c, x, y, y + h, borderColor, 1, 0.2);
  neonV(c, x + w - 1, y, y + h, borderColor, 1, 0.2);
  // Scan lines
  c.save(); c.globalAlpha = 0.06;
  for (let sy = y + 1; sy < y + h - 1; sy += 2) rect(c, x + 1, sy, w - 2, 1, '#ffffff');
  c.restore();
  // Content
  if (contentFn) contentFn(c, x, y, w, h);
}

/** Vertical holographic data stream — falling characters */
function holoStream(c: Ctx, x: number, y1: number, y2: number, col: string, density = 0.4) {
  for (let y = y1; y < y2; y++) {
    const hash = (x * 31 + y * 17) & 0xff;
    if (hash < density * 256) {
      c.save();
      c.globalAlpha = 0.15 + (hash / 256) * 0.25;
      px(c, x, y, col);
      c.restore();
    }
  }
}

/** Holographic ring / halo (horizontal oval seen from slight angle) */
function holoRing(c: Ctx, cx: number, cy: number, rx: number, ry: number, col: string, alpha = 0.35) {
  c.save(); c.globalAlpha = alpha;
  // Draw pixel approximation of ellipse
  for (let angle = 0; angle < 360; angle += 6) {
    const rad = (angle * Math.PI) / 180;
    const px_ = Math.round(cx + Math.cos(rad) * rx);
    const py_ = Math.round(cy + Math.sin(rad) * ry);
    px(c, px_, py_, col);
  }
  c.restore();
  // Brighter cardinal points
  c.save(); c.globalAlpha = alpha * 1.5;
  px(c, cx - rx, cy, col);
  px(c, cx + rx, cy, col);
  px(c, cx, cy - ry, col);
  px(c, cx, cy + ry, col);
  c.restore();
}

// ─── 3D depth helpers ────────────────────────────────────────────────

/** Draw a 3D "side face" on the right edge of a building section (darker, angled) */
function sideface(c: Ctx, x: number, y: number, depth: number, h: number, col: string) {
  for (let i = 0; i < h; i++) {
    const v = Math.max(0, parseInt(col.slice(1, 3), 16) - 8);
    const darken = Math.floor(i * 0.3);
    const r = Math.max(0, v - darken), g = Math.max(0, v - darken), b = Math.max(0, v + 12 - darken);
    rect(c, x, y + i, depth, 1, `rgb(${r},${g},${b})`);
  }
}

/** Draw a roof/top face (lighter, to suggest looking down at the top) */
function topface(c: Ctx, x: number, y: number, w: number, depth: number, col: string) {
  for (let i = 0; i < depth; i++) {
    c.save(); c.globalAlpha = 0.7 - i * 0.15;
    rect(c, x + i, y + i, w, 1, col);
    c.restore();
  }
}

/** Protruding balcony/ledge with visible side and bottom */
function balcony(c: Ctx, x: number, y: number, w: number, depth: number) {
  // Top surface
  rect(c, x, y, w, 1, C.wallLight);
  // Front face
  rect(c, x, y + 1, w, depth - 1, C.wallAccent);
  // Bottom edge (dark)
  hline(c, y + depth, x, x + w - 1, C.wallEdge);
  // Side face (right)
  rect(c, x + w, y, 2, depth + 1, C.wallEdge);
  // Railing
  hline(c, y, x, x + w - 1, C.scaffold);
  for (let rx = x + 2; rx < x + w; rx += 3) vline(c, rx, y - 2, y, C.scaffoldDk);
}

// ─── TIER 2: L-Shaped Commercial Building with Depth ─────────────────
function drawTier2(c: Ctx) {
  drawGround(c);

  // This building has an L-shape: a taller left section + shorter right wing
  // with visible side faces for 3D depth
  const SD = 4; // side depth in pixels

  // ── LEFT TOWER (taller section) ──
  const lx = 6, ly = 20, lw = 30, lh = 68;
  // Front face gradient
  for (let i = 0; i < lh; i++) {
    const v = 9 + Math.floor((i / lh) * 14);
    rect(c, lx, ly + i, lw, 1, `rgb(${v},${v},${v + 30})`);
  }
  // Right side face (3D depth)
  sideface(c, lx + lw, ly, SD, lh, '#060618');
  // Top face
  topface(c, lx, ly - 2, lw + SD, 2, C.roofMid);
  // Left edge highlight
  rect(c, lx, ly, 2, lh, C.wallLight);

  // Floor bands — left tower
  for (let i = 1; i <= 9; i++) {
    const fy = ly + i * 7;
    if (fy < ly + lh) hline(c, fy, lx, lx + lw + SD - 1, C.wallAccent);
  }
  // Windows — left tower
  for (let row = 0; row < 9; row++) {
    const wy = ly + 3 + row * 7;
    if (wy + 3 >= ly + lh - 8) break;
    winRow(c, wy, lx + 3, lx + lw - 1, 3, 3, 3, row * 23 + 7, 0.8);
  }

  // ── RIGHT WING (shorter, protruding forward) ──
  const rx = lx + lw + SD, ry = ly + 24, rw = 20, rh = lh - 24;
  // Front face
  for (let i = 0; i < rh; i++) {
    const v = 11 + Math.floor((i / rh) * 12);
    rect(c, rx, ry + i, rw, 1, `rgb(${v + 2},${v + 2},${v + 32})`);
  }
  // Right side face
  sideface(c, rx + rw, ry, SD - 1, rh, '#050514');
  // Top face of right wing
  topface(c, rx, ry - 2, rw + SD - 1, 2, C.roofLight);
  // Floor bands
  for (let i = 1; i <= 6; i++) {
    const fy = ry + i * 7;
    if (fy < ry + rh) hline(c, fy, rx, rx + rw + SD - 2, C.wallAccent);
  }
  // Windows — right wing
  for (let row = 0; row < 6; row++) {
    const wy = ry + 3 + row * 7;
    if (wy + 3 >= ry + rh - 8) break;
    winRow(c, wy, rx + 3, rx + rw - 1, 3, 3, 3, row * 17 + 50, 0.75);
  }

  // ── Protruding balconies on left tower ──
  for (const brow of [2, 4, 6]) {
    const by_ = ly + 4 + brow * 7;
    if (by_ < ly + lh - 10) balcony(c, lx - 4, by_, 6, 3);
  }

  // ── Recessed entrance section (cut-in at base) ──
  const ex = lx + 8, ey = ly + lh - 12, ew = 16, eh = 12;
  rect(c, ex, ey, ew, eh, '#050510'); // deep recess
  rect(c, ex, ey, ew, 1, C.wallAccent); // top of recess
  rect(c, ex, ey, 1, eh, C.wallMid);    // left inner wall
  rect(c, ex + ew - 1, ey, 1, eh, C.wallEdge); // right inner wall
  // Lobby glow inside recess
  c.save(); c.globalAlpha = 0.25; rect(c, ex + 2, ey + 3, ew - 4, eh - 4, C.nGold); c.restore();
  neonH(c, ey, ex, ex + ew, C.nGold, 1, 0.3);
  neonV(c, ex, ey, ey + eh, C.nGoldDim);
  neonV(c, ex + ew - 1, ey, ey + eh, C.nGoldDim);

  // ── Awning over entrance (protruding) ──
  rect(c, ex - 3, ey - 3, ew + 6, 2, C.roofDark);
  rect(c, ex - 3, ey - 1, ew + 6, 1, C.wallEdge); // underside shadow
  neonH(c, ey - 3, ex - 3, ex + ew + 3, C.nGold);

  // ── Neon edges ──
  neonV(c, lx, ly, ly + lh, C.nCyan, 2, 0.22);
  neonV(c, lx + lw - 1, ly, ly + lh, C.nPinkDim, 1, 0.15);
  neonV(c, rx + rw - 1, ry, ry + rh, C.nPink, 2, 0.2);
  // Horizontal neon bands
  neonH(c, ly + 14, lx + 3, lx + lw - 1, C.nCyan);
  neonH(c, ly + 35, lx + 3, rx + rw - 1, C.nPink);
  neonH(c, ly + 56, lx + 3, rx + rw - 1, C.nGold);
  // Junction neon where two sections meet
  neonV(c, lx + lw + SD - 1, ry, ry + rh, C.nPurpleDim, 1, 0.12);

  // ── Roof neon ──
  neonH(c, ly - 1, lx, lx + lw + SD, C.nCyan, 2, 0.3);
  neonH(c, ry - 1, rx, rx + rw + SD - 1, C.nPink, 2, 0.25);

  // ── Holographic billboard floating off the right wing ──
  holoPanel(c, rx + rw + SD + 1, ry + 4, 10, 20, C.nPink, 0.14, (c, x, y) => {
    rect(c, x + 2, y + 3, 6, 3, C.nPink);
    c.save(); c.globalAlpha = 0.8; rect(c, x + 2, y + 3, 6, 1, C.nPinkGlow); c.restore();
    rect(c, x + 2, y + 8, 4, 2, C.nGold);
    rect(c, x + 2, y + 12, 6, 2, C.nGreen);
    rect(c, x + 2, y + 16, 3, 2, C.nBlue);
  });
  // Projector beams
  c.save(); c.globalAlpha = 0.06;
  for (let i = 0; i < 3; i++) hline(c, ry + 8 + i * 6, rx + rw + SD - 1, rx + rw + SD + 1, C.nPink);
  c.restore();

  // ── Holographic company sign above left tower ──
  holoPanel(c, lx + 4, ly - 14, 24, 10, C.nCyan, 0.1, (c, x, y) => {
    c.save(); c.globalAlpha = 0.7;
    px(c, x + 5, y + 2, C.nCyanGlow); px(c, x + 4, y + 3, C.nCyan);
    px(c, x + 6, y + 3, C.nCyan); px(c, x + 5, y + 4, C.nCyanGlow);
    hline(c, y + 3, x + 10, x + 20, C.nCyanDim);
    hline(c, y + 5, x + 10, x + 18, C.nCyanDim);
    hline(c, y + 7, x + 10, x + 16, C.nCyanDim);
    c.restore();
  });

  // ── Rooftop equipment on left tower ──
  rect(c, lx + 3, ly - 5, 7, 3, C.scaffoldDk);
  rect(c, lx + 3, ly - 5, 7, 1, C.scaffold);
  vline(c, lx + 20, ly - 2, ly - 10, C.scaffold);
  px(c, lx + 20, ly - 10, C.nCyan);
  glow(c, lx + 20, ly - 10, 1, 1, C.nCyan, 2, 0.35);

  // Rooftop equipment on right wing
  rect(c, rx + 6, ry - 5, 6, 3, C.scaffoldDk);
  rect(c, rx + 6, ry - 5, 6, 1, C.scaffold);
  px(c, rx + 8, ry - 5, C.scaffoldLt);

  // ── Shopfronts at base ──
  rect(c, lx + 3, ly + lh - 7, 6, 5, C.wDark);
  c.save(); c.globalAlpha = 0.2; rect(c, lx + 3, ly + lh - 6, 6, 3, C.nGreen); c.restore();
  neonH(c, ly + lh - 7, lx + 3, lx + 9, C.nGreen);
  rect(c, rx + 3, ry + rh - 7, 10, 5, C.wDark);
  c.save(); c.globalAlpha = 0.2; rect(c, rx + 3, ry + rh - 6, 10, 3, C.nOrange); c.restore();
  neonH(c, ry + rh - 7, rx + 3, rx + 13, C.nOrange);

  // ── Ground reflections ──
  c.save(); c.globalAlpha = 0.05;
  rect(c, lx, ly + lh, lw, 4, C.nCyan);
  rect(c, rx + rw + SD + 1, ry + 22, 10, 2, C.nPink);
  c.restore();
}

// ─── TIER 3: Stepped Skyscraper with 3 Tiers of Setback ─────────────
function drawTier3(c: Ctx) {
  drawGround(c);
  const SD = 5; // side face depth

  // Building has 3 tiers stepping back: base → mid → top penthouse
  // Each tier is narrower and set back, creating a stepped pyramid silhouette

  // ── BASE SECTION (widest) ──
  const bx = 4, by3 = 48, bw = 52, bh = 40;
  for (let i = 0; i < bh; i++) {
    const v = 10 + Math.floor((i / bh) * 12);
    rect(c, bx, by3 + i, bw, 1, `rgb(${v},${v},${v + 30})`);
  }
  sideface(c, bx + bw, by3, SD, bh, '#060618');
  rect(c, bx, by3, 2, bh, C.wallLight);
  // Floor bands
  for (let i = 1; i <= 5; i++) hline(c, by3 + i * 7, bx, bx + bw + SD - 1, C.wallAccent);
  // Windows
  for (let row = 0; row < 5; row++) {
    const wy = by3 + 3 + row * 7;
    if (wy + 3 >= by3 + bh - 8) break;
    winRow(c, wy, bx + 3, bx + bw - 1, 3, 3, 2, row * 31 + 100, 0.78);
  }

  // ── MID SECTION (narrower, set back) ──
  const mi = 6; // inset from base
  const mx = bx + mi, my = 22, mw = bw - mi * 2 + 6, mh = by3 - 22;
  for (let i = 0; i < mh; i++) {
    const v = 8 + Math.floor((i / mh) * 11);
    rect(c, mx, my + i, mw, 1, `rgb(${v},${v},${v + 32})`);
  }
  sideface(c, mx + mw, my, SD, mh, '#050516');
  rect(c, mx, my, 2, mh, C.wallLight);
  // Floor bands
  for (let i = 1; i <= 4; i++) hline(c, my + i * 6, mx, mx + mw + SD - 1, C.wallAccent);
  // Windows
  for (let row = 0; row < 4; row++) {
    const wy = my + 2 + row * 6;
    winRow(c, wy, mx + 3, mx + mw - 1, 3, 3, 2, row * 31 + 50, 0.82);
  }

  // ── Ledge / terrace where mid meets base (visible top face) ──
  topface(c, bx, by3 - 2, mi + SD, 3, C.roofLight);
  topface(c, bx + bw - mi, by3 - 2, mi + SD, 3, C.roofLight);
  // Terrace railings
  for (let tx = bx + 1; tx < bx + mi - 1; tx += 3) {
    vline(c, tx, by3 - 4, by3 - 2, C.scaffoldDk);
  }
  for (let tx = bx + bw - mi + 1; tx < bx + bw - 1; tx += 3) {
    vline(c, tx, by3 - 4, by3 - 2, C.scaffoldDk);
  }
  hline(c, by3 - 4, bx, bx + mi - 1, C.scaffold);
  hline(c, by3 - 4, bx + bw - mi, bx + bw - 1, C.scaffold);
  // Terrace plants
  px(c, bx + 2, by3 - 5, C.treeLeaf); px(c, bx + 3, by3 - 5, C.treeGlow);
  px(c, bx + bw - mi + 2, by3 - 5, C.treeLeaf);

  // ── TOP PENTHOUSE (narrowest) ──
  const ti = 5;
  const tx_ = mx + ti, ty = 8, tw = mw - ti * 2 + 4, th = my - 8;
  for (let i = 0; i < th; i++) {
    const v = 7 + Math.floor((i / th) * 10);
    rect(c, tx_, ty + i, tw, 1, `rgb(${v},${v},${v + 34})`);
  }
  sideface(c, tx_ + tw, ty, SD - 1, th, '#040514');
  rect(c, tx_, ty, 2, th, C.wallHighlight);
  // Penthouse windows (bigger, panoramic)
  for (let row = 0; row < 2; row++) {
    const wy = ty + 3 + row * 6;
    winRow(c, wy, tx_ + 3, tx_ + tw - 1, 4, 3, 2, row * 11, 0.9);
  }

  // ── Ledge / terrace where top meets mid ──
  topface(c, mx, my - 2, ti + SD, 3, C.roofLight);
  topface(c, mx + mw - ti, my - 2, ti + SD, 3, C.roofLight);
  // Mini garden on mid terrace
  for (const gx of [mx + 2, mx + mw - ti + 2]) {
    rect(c, gx, my - 4, 2, 2, C.treeTrunk);
    rect(c, gx - 1, my - 6, 4, 2, C.treeLeaf);
    px(c, gx, my - 7, C.treeGlow);
  }

  // ── Protruding balconies on mid section ──
  for (const brow of [1, 3]) {
    balcony(c, mx - 5, my + 3 + brow * 6, 7, 3);
  }

  // ── Protruding bay window on base (right side) ──
  const bayX = bx + bw - 2, bayY = by3 + 10, bayW = SD + 4, bayH = 16;
  rect(c, bayX, bayY, bayW, bayH, C.wallMid);
  sideface(c, bayX + bayW, bayY, 2, bayH, '#040512');
  topface(c, bayX, bayY - 1, bayW + 2, 1, C.roofMid);
  rect(c, bayX, bayY + bayH, bayW + 2, 1, C.wallEdge);
  // Bay windows
  drawWin(c, bayX + 1, bayY + 3, 3, 3, 7);
  drawWin(c, bayX + 1, bayY + 9, 3, 3, 2);

  // ── Roof structure on penthouse ──
  topface(c, tx_, ty - 2, tw + SD - 1, 2, C.roofLight);
  neonH(c, ty - 1, tx_, tx_ + tw, C.nCyan, 2, 0.35);
  neonH(c, ty - 2, tx_ + 4, tx_ + tw - 4, C.nPink, 2, 0.25);

  // ── Neon bands (follow the stepped shape) ──
  neonV(c, bx, by3, by3 + bh, C.nCyan, 2, 0.22);
  neonV(c, mx, my, by3, C.nCyan, 2, 0.2);
  neonV(c, tx_, ty, my, C.nCyan, 2, 0.18);
  neonV(c, bx + bw + SD - 1, by3, by3 + bh, C.nPink, 2, 0.2);
  neonV(c, mx + mw + SD - 1, my, by3, C.nPink, 2, 0.18);
  neonV(c, tx_ + tw + SD - 2, ty, my, C.nPinkDim, 1, 0.15);

  const t3Neon = [C.nCyan, C.nPink, C.nPurple, C.nGold, C.nOrange, C.nGreen, C.nCyan, C.nPink];
  for (let i = 0; i < 8; i++) {
    const ny = ty + 5 + i * 9;
    if (ny >= by3 + bh - 4) break;
    const xl = ny < my ? tx_ + 3 : ny < by3 ? mx + 3 : bx + 3;
    const xr = ny < my ? tx_ + tw - 1 : ny < by3 ? mx + mw - 1 : bx + bw - 1;
    neonH(c, ny, xl, xr, t3Neon[i]);
  }

  // ── Holographic data streams ──
  for (let dx = 0; dx < 3; dx++) {
    holoStream(c, bx - 2 + dx, by3, by3 + bh, C.nCyan, 0.3);
    holoStream(c, bx + bw + SD + dx, by3, by3 + bh, C.nPink, 0.3);
  }

  // ── Holographic billboard (left) ──
  holoPanel(c, bx - 14, my + 4, 12, 22, C.nCyan, 0.15, (c, x, y) => {
    c.save(); c.globalAlpha = 0.7;
    const pts = [6, 4, 7, 3, 5, 2, 4, 6, 3, 5];
    for (let i = 0; i < pts.length - 1; i++) px(c, x + 1 + i, y + 3 + pts[i], C.nGreen);
    px(c, x + 9, y + 3, C.nGreen);
    hline(c, y + 12, x + 2, x + 9, C.nCyanDim);
    hline(c, y + 14, x + 2, x + 7, C.nCyanDim);
    for (let i = 0; i < 4; i++) {
      const h = 2 + (i * 3 + 5) % 5;
      rect(c, x + 2 + i * 2, y + 20 - h, 1, h, [C.nCyan, C.nPink, C.nGold, C.nGreen][i]);
    }
    c.restore();
  });

  // ── Spire with holographic rings ──
  const spX = tx_ + tw / 2;
  vline(c, spX, ty - 2, ty - 20, C.scaffold);
  vline(c, spX + 1, ty - 2, ty - 18, C.scaffoldDk);
  hline(c, ty - 12, spX - 2, spX + 3, C.scaffoldDk);
  glow(c, spX - 1, ty - 22, 3, 2, C.nCyan, 4, 0.4);
  px(c, spX, ty - 21, C.nCyanBright);
  px(c, spX, ty - 22, C.nCyan);
  holoRing(c, spX, ty - 14, 6, 2, C.nCyan, 0.35);
  holoRing(c, spX, ty - 18, 4, 1, C.nPink, 0.3);

  // ── Entrance (recessed into base) ──
  const edx = bx + 16, edy = by3 + bh - 12;
  rect(c, edx, edy, 18, 12, '#050510');
  rect(c, edx, edy, 18, 1, C.wallAccent);
  rect(c, edx, edy, 1, 12, C.wallMid);
  rect(c, edx + 17, edy, 1, 12, C.wallEdge);
  c.save(); c.globalAlpha = 0.25; rect(c, edx + 2, edy + 3, 14, 7, C.nGold); c.restore();
  neonH(c, edy, edx, edx + 18, C.nGold, 2, 0.3);
  neonV(c, edx, edy, edy + 12, C.nGoldDim);
  neonV(c, edx + 17, edy, edy + 12, C.nGoldDim);
  glow(c, edx, edy, 18, 12, C.nGold, 2, 0.1);
}

// ─── TIER 4: Multi-Wing Megastructure with Skybridge ─────────────────
function drawTier4(c: Ctx) {
  drawGround(c);
  const SD = 5;

  // Mega building: two tall towers connected by a skybridge,
  // with a wide podium base and a penthouse crown on the left tower

  // ── PODIUM BASE (wide, 3 floors) ──
  const px_ = 2, py = 68, pw = 58, ph = 20;
  for (let i = 0; i < ph; i++) {
    const v = 10 + Math.floor((i / ph) * 10);
    rect(c, px_, py + i, pw, 1, `rgb(${v},${v},${v + 28})`);
  }
  sideface(c, px_ + pw, py, SD, ph, '#050514');
  rect(c, px_, py, 2, ph, C.wallLight);
  topface(c, px_, py - 2, pw + SD, 2, C.roofMid);
  // Podium windows
  for (let row = 0; row < 2; row++) {
    winRow(c, py + 4 + row * 8, px_ + 4, px_ + pw - 1, 3, 3, 2, row * 37, 0.8);
  }
  // Podium shopfronts
  for (const [sx, sw, col] of [[px_ + 4, 12, C.nGreen], [px_ + 24, 10, C.nOrange], [px_ + 42, 12, C.nPink]] as [number, number, string][]) {
    rect(c, sx, py + ph - 6, sw, 4, C.wDark);
    c.save(); c.globalAlpha = 0.2; rect(c, sx + 1, py + ph - 5, sw - 2, 2, col); c.restore();
    neonH(c, py + ph - 6, sx, sx + sw, col);
  }

  // ── LEFT TOWER ──
  const lx = 3, ly = 8, lw = 26, lh = py - 8;
  for (let i = 0; i < lh; i++) {
    const v = 6 + Math.floor((i / lh) * 14);
    const b = v + 36 + Math.floor(Math.sin(i * 0.12) * 4);
    rect(c, lx, ly + i, lw, 1, `rgb(${v},${v},${b})`);
  }
  sideface(c, lx + lw, ly, SD, lh, '#040514');
  rect(c, lx, ly, 2, lh, C.wallHighlight);
  topface(c, lx, ly - 2, lw + SD, 2, C.roofLight);
  // Floor bands
  for (let i = 1; i <= 10; i++) {
    const fy = ly + i * 5 + 2;
    if (fy < ly + lh) hline(c, fy, lx, lx + lw + SD - 1, C.wallAccent);
  }
  // Windows
  for (let row = 0; row < 11; row++) {
    const wy = ly + 2 + row * 5;
    if (wy + 3 >= ly + lh - 4) break;
    winRow(c, wy, lx + 3, lx + lw - 1, 3, 3, 2, row * 41 + 13, 0.85);
  }

  // ── RIGHT TOWER ──
  const rrx = 34, rry = 16, rrw = 24, rrh = py - 16;
  for (let i = 0; i < rrh; i++) {
    const v = 7 + Math.floor((i / rrh) * 13);
    const b = v + 34 + Math.floor(Math.sin(i * 0.15) * 3);
    rect(c, rrx, rry + i, rrw, 1, `rgb(${v},${v},${b})`);
  }
  sideface(c, rrx + rrw, rry, SD, rrh, '#040512');
  rect(c, rrx, rry, 2, rrh, C.wallLight);
  topface(c, rrx, rry - 2, rrw + SD, 2, C.roofMid);
  // Floor bands
  for (let i = 1; i <= 9; i++) {
    const fy = rry + i * 5 + 2;
    if (fy < rry + rrh) hline(c, fy, rrx, rrx + rrw + SD - 1, C.wallAccent);
  }
  // Windows
  for (let row = 0; row < 10; row++) {
    const wy = rry + 2 + row * 5;
    if (wy + 3 >= rry + rrh - 4) break;
    winRow(c, wy, rrx + 3, rrx + rrw - 1, 3, 3, 2, row * 37 + 7, 0.83);
  }

  // ── Ledge between towers and podium ──
  topface(c, px_, py - 3, px_ + SD, 3, C.roofLight); // left overhang
  topface(c, px_ + pw - 8, py - 3, 12, 3, C.roofLight); // right overhang

  // ── SKYBRIDGE connecting the two towers ──
  const sbY = 36, sbH = 6;
  rect(c, lx + lw + SD, sbY, rrx - lx - lw - SD, sbH, C.wallMid);
  sideface(c, rrx, sbY, 0, sbH, C.wallEdge); // just a line
  rect(c, lx + lw + SD, sbY, rrx - lx - lw - SD, 1, C.wallLight); // top highlight
  rect(c, lx + lw + SD, sbY + sbH - 1, rrx - lx - lw - SD, 1, C.wallEdge); // bottom shadow
  // Skybridge windows
  for (let wx = lx + lw + SD + 1; wx < rrx - 2; wx += 4) {
    drawWin(c, wx, sbY + 2, 2, 2, wx);
  }
  // Skybridge neon
  neonH(c, sbY, lx + lw + SD, rrx, C.nGold);
  neonH(c, sbY + sbH - 1, lx + lw + SD, rrx, C.nGoldDim);

  // ── Protruding balconies on left tower ──
  for (const brow of [2, 5, 8]) {
    const aby = ly + 3 + brow * 5;
    if (aby < ly + lh - 8) balcony(c, lx - 5, aby, 7, 3);
  }

  // ── Bay windows protruding from right tower ──
  for (const brow of [1, 4, 7]) {
    const aby = rry + 3 + brow * 5;
    if (aby < rry + rrh - 8) {
      const bxx = rrx + rrw + SD;
      rect(c, bxx, aby, 4, 4, C.wallMid);
      sideface(c, bxx + 4, aby, 2, 4, '#040512');
      topface(c, bxx, aby - 1, 6, 1, C.roofMid);
      drawWin(c, bxx + 1, aby + 1, 2, 2, brow * 3);
    }
  }

  // ── Rainbow neon bands ──
  const megaNeon = [C.nCyan, C.nPink, C.nPurple, C.nGold, C.nOrange, C.nGreen, C.nBlue, C.nCyan, C.nPink, C.nPurple, C.nGold, C.nOrange, C.nGreen];
  for (let i = 0; i < 13; i++) {
    const ny = ly + 4 + i * 5 + 3;
    if (ny >= py + ph - 4) break;
    // Neon goes across whichever sections exist at this height
    if (ny >= py) {
      neonH(c, ny, px_ + 3, px_ + pw - 1, megaNeon[i]);
    } else if (ny >= rry && ny < ly + lh) {
      neonH(c, ny, lx + 3, lx + lw - 1, megaNeon[i]);
      neonH(c, ny, rrx + 3, rrx + rrw - 1, megaNeon[i]);
    } else if (ny < rry && ny < ly + lh) {
      neonH(c, ny, lx + 3, lx + lw - 1, megaNeon[i]);
    }
  }

  // Vertical neon on towers
  neonV(c, lx, ly, py, C.nCyan, 3, 0.28);
  neonV(c, lx + lw + SD - 1, ly, py, C.nPinkDim, 1, 0.15);
  neonV(c, rrx, rry, py, C.nCyanDim, 2, 0.2);
  neonV(c, rrx + rrw + SD - 1, rry, py, C.nPink, 3, 0.25);
  neonV(c, px_ + pw + SD - 1, py, py + ph, C.nPink, 2, 0.2);

  // ── Holographic data streams ──
  for (let dx = 0; dx < 4; dx++) {
    holoStream(c, lx - 3 + dx, ly + 4, py + ph, C.nCyan, 0.35);
    holoStream(c, rrx + rrw + SD + 2 + dx, rry + 4, py + ph, C.nPink, 0.35);
  }

  // ── Holographic display — left ──
  holoPanel(c, lx - 16, ly + 10, 13, 28, C.nCyan, 0.16, (c, x, y) => {
    c.save(); c.globalAlpha = 0.75;
    holoRing(c, x + 7, y + 6, 4, 3, C.nCyanGlow, 0.6);
    px(c, x + 7, y + 6, C.nCyanBright);
    hline(c, y + 12, x + 2, x + 10, C.nGreenDim);
    for (let i = 0; i < 5; i++) {
      const h = 2 + ((i * 7 + 3) % 6);
      rect(c, x + 2 + i * 2, y + 20 - h, 1, h, [C.nCyan, C.nPink, C.nGold, C.nGreen, C.nPurple][i]);
    }
    for (let row = 0; row < 3; row++) hline(c, y + 22 + row * 2, x + 2, x + 8 + row, C.nCyanDim);
    c.restore();
  });

  // ── Holographic display — right ──
  holoPanel(c, rrx + rrw + SD + 3, rry + 8, 12, 24, C.nPink, 0.16, (c, x, y) => {
    c.save(); c.globalAlpha = 0.75;
    rect(c, x + 3, y + 2, 6, 6, C.nPinkDim);
    px(c, x + 4, y + 3, C.nPinkGlow); px(c, x + 7, y + 3, C.nPinkGlow);
    hline(c, y + 6, x + 4, x + 7, C.nPink);
    for (let i = 0; i < 4; i++) {
      const w = 3 + ((i * 5 + 2) % 5);
      rect(c, x + 2, y + 11 + i * 3, w, 1, [C.nPink, C.nGold, C.nGreen, C.nBlue][i]);
    }
    c.restore();
  });

  // ── Holographic ticker ──
  const tickerY = 40;
  for (let x = lx + 3; x < lx + lw - 1; x++) {
    const col = [C.nCyan, C.nPink, C.nGold, C.nGreen, C.nPurple, C.nOrange, C.nBlue][(x * 3 + 5) % 7];
    c.save(); c.globalAlpha = 0.45 + ((x * 7) % 50) / 100;
    px(c, x, tickerY, col);
    px(c, x, tickerY + 1, col);
    c.restore();
  }
  glow(c, lx + 3, tickerY, lw - 4, 2, C.nCyan, 1, 0.06);

  // ── Spires ──
  // Left tower spire (taller)
  const lSpX = lx + lw / 2;
  vline(c, lSpX, ly - 2, ly - 28, C.scaffold);
  vline(c, lSpX + 1, ly - 2, ly - 26, C.scaffoldDk);
  glow(c, lSpX - 2, ly - 32, 5, 3, C.nGold, 6, 0.45);
  glow(c, lSpX - 1, ly - 31, 3, 2, '#ffffff', 3, 0.3);
  px(c, lSpX, ly - 30, '#ffffff');
  px(c, lSpX + 1, ly - 30, C.nGold);
  px(c, lSpX, ly - 31, C.nGold);
  // Beacon rays
  for (let r = 1; r <= 5; r++) {
    c.save(); c.globalAlpha = 0.18 / r;
    px(c, lSpX - r, ly - 30, C.nGold);
    px(c, lSpX + 1 + r, ly - 30, C.nGold);
    px(c, lSpX, ly - 30 - r, C.nGold);
    c.restore();
  }
  holoRing(c, lSpX, ly - 18, 7, 2, C.nGold, 0.4);
  holoRing(c, lSpX, ly - 22, 5, 2, C.nCyan, 0.35);
  holoRing(c, lSpX, ly - 26, 3, 1, C.nPink, 0.3);

  // Right tower spire (shorter)
  const rSpX = rrx + rrw / 2;
  vline(c, rSpX, rry - 2, rry - 18, C.scaffold);
  vline(c, rSpX + 1, rry - 2, rry - 16, C.scaffoldDk);
  glow(c, rSpX - 1, rry - 20, 3, 2, C.nPink, 4, 0.4);
  px(c, rSpX, rry - 19, C.nPinkGlow);
  px(c, rSpX, rry - 20, '#ffffff');
  holoRing(c, rSpX, rry - 12, 5, 2, C.nPink, 0.35);

  // ── Grand entrance (recessed into podium base) ──
  const edx = px_ + 18, edy = py + ph - 14;
  rect(c, edx, edy, 22, 14, '#040410');
  rect(c, edx, edy, 22, 1, C.wallAccent);
  rect(c, edx, edy, 1, 14, C.wallMid);
  rect(c, edx + 21, edy, 1, 14, C.wallEdge);
  c.save(); c.globalAlpha = 0.3; rect(c, edx + 2, edy + 3, 18, 9, C.nGold); c.restore();
  c.save(); c.globalAlpha = 0.12; rect(c, edx + 4, edy + 5, 14, 5, '#ffffff'); c.restore();
  neonH(c, edy, edx, edx + 22, C.nGold, 3, 0.35);
  neonV(c, edx, edy, edy + 14, C.nGoldDim, 2, 0.25);
  neonV(c, edx + 21, edy, edy + 14, C.nGoldDim, 2, 0.25);
  glow(c, edx, edy, 22, 14, C.nGold, 4, 0.12);
  // Holographic arch
  c.save(); c.globalAlpha = 0.25;
  for (let i = 0; i < 6; i++) {
    const ax = edx + 3 + i * 3;
    const ay = edy - 2 - Math.floor(Math.sin((i / 5) * Math.PI) * 3);
    px(c, ax, ay, C.nGold);
  }
  c.restore();

  // ── Ground reflections ──
  c.save(); c.globalAlpha = 0.06;
  rect(c, lx - 16, py + ph - 2, 13, 4, C.nCyan);
  rect(c, rrx + rrw + SD + 3, py + ph - 2, 12, 4, C.nPink);
  rect(c, edx, py + ph, 22, 4, C.nGold);
  c.restore();
}

// ─── CONSTRUCTION STAGES ─────────────────────────────────────────────

function drawConst0(c: Ctx) {
  drawGround(c);
  // Empty lot with holographic blueprint
  rect(c, 8, 76, 48, 12, '#0a0a18');

  // Corner stakes with neon tips
  for (const [x, y] of [[8, 74], [55, 74], [8, 87], [55, 87]] as [number, number][]) {
    px(c, x, y, C.scaffold);
    px(c, x, y - 1, C.scaffoldDk);
    px(c, x, y - 2, C.nGold);
  }

  // Caution tape
  for (let x = 9; x < 55; x += 2) {
    px(c, x, 74, C.nGold);
    px(c, x + 1, 74, C.nOrange);
  }

  // Holographic building projection
  c.save(); c.globalAlpha = 0.08;
  rect(c, 14, 36, 36, 40, C.nCyan);
  c.restore();
  c.save(); c.globalAlpha = 0.2;
  // Outline
  rect(c, 14, 36, 36, 1, C.nCyan);
  rect(c, 14, 75, 36, 1, C.nCyanDim);
  vline(c, 14, 36, 75, C.nCyanDim);
  vline(c, 49, 36, 75, C.nCyanDim);
  // Grid lines
  for (let y = 42; y < 75; y += 6) hline(c, y, 15, 48, C.nCyanDim);
  for (let x = 20; x < 49; x += 6) vline(c, x, 37, 74, C.nCyanDim);
  c.restore();
  // Pulsing dots at blueprint corners
  for (const [x, y] of [[14, 36], [49, 36], [14, 75], [49, 75]] as [number, number][]) {
    glow(c, x, y, 1, 1, C.nCyan, 2, 0.3);
    px(c, x, y, C.nCyanGlow);
  }

  // Sign post
  vline(c, 5, 64, 76, C.scaffold);
  rect(c, 2, 60, 8, 4, C.billboard);
  neonH(c, 60, 2, 10, C.nPink);
  neonH(c, 63, 2, 10, C.nPinkDim);
  px(c, 4, 61, C.wWarm);
  px(c, 6, 62, C.nGreen);
}

function drawConst1(c: Ctx) {
  drawGround(c);
  // Foundation slab
  rect(c, 6, 76, 52, 12, C.concrete);
  rect(c, 6, 76, 52, 2, C.concreteLt);
  rect(c, 7, 78, 50, 1, C.concreteDk);

  // Vertical structural beams
  for (const x of [10, 20, 30, 40, 50]) {
    vline(c, x, 40, 76, C.scaffold);
    px(c, x, 40, C.scaffoldLt);
    // Base plate
    rect(c, x - 1, 75, 3, 1, C.scaffoldDk);
  }

  // Horizontal supports
  for (const y of [52, 64]) hline(c, y, 10, 50, C.scaffoldDk);

  // Rebar sticking up
  for (const x of [14, 24, 34, 44]) {
    vline(c, x, 76, 82, C.scaffoldDk);
    px(c, x, 76, C.crackDk); // rust
  }

  // Crane
  vline(c, 30, 16, 40, C.crane);
  vline(c, 31, 18, 40, C.craneDk);
  hline(c, 15, 16, 48, C.crane);
  px(c, 16, 15, C.scaffoldDk);
  px(c, 48, 15, C.scaffoldDk);
  // Crane tip light
  glow(c, 46, 13, 3, 2, C.nCyan, 3, 0.3);
  px(c, 47, 13, C.nCyanBright);
  px(c, 48, 14, C.nCyanGlow);
  // Dangling cable + block
  vline(c, 42, 15, 26, C.scaffoldDk);
  rect(c, 40, 26, 5, 4, C.concrete);
  rect(c, 40, 26, 5, 1, C.concreteLt);

  // Crane cabin
  rect(c, 28, 16, 5, 4, C.scaffoldDk);
  rect(c, 28, 16, 5, 1, C.scaffold);
  px(c, 29, 17, C.wLit);

  // Work light
  glow(c, 28, 14, 5, 1, C.nGold, 3, 0.2);
  px(c, 30, 14, C.nGold);

  // Ground equipment
  rect(c, 6, 82, 8, 4, C.scaffoldDk);
  rect(c, 6, 82, 8, 1, C.scaffold);
  px(c, 8, 83, C.nOrange);
  rect(c, 46, 82, 6, 4, C.concreteDk);
  rect(c, 46, 82, 6, 1, C.concrete);
}

function drawConst2(c: Ctx) {
  drawGround(c);
  const bx = 6, by = 34, bw = 52, bh = 54;

  // Partial walls
  rect(c, bx, by, bw, bh, C.wallDark);

  // Open sections
  rect(c, bx + 8, by + 4, 12, 10, '#04040c');
  rect(c, bx + 28, by + 6, 10, 8, '#04040c');
  rect(c, bx + 14, by + 24, 16, 8, '#04040c');
  rect(c, bx + 36, by + 30, 10, 6, '#04040c');

  // Scaffold grid — exterior
  for (let i = 0; i < 6; i++) hline(c, by + 2 + i * 8, bx - 2, bx + bw + 1, C.scaffold);
  vline(c, bx - 2, by, by + bh, C.scaffoldDk);
  vline(c, bx - 1, by, by + bh, C.scaffoldDk);
  vline(c, bx + bw + 1, by, by + bh, C.scaffoldDk);
  vline(c, bx + bw + 2, by, by + bh, C.scaffoldDk);

  // X-bracing
  for (let i = 0; i < 5; i++) {
    const sy = by + 2 + i * 8;
    c.save(); c.globalAlpha = 0.4;
    for (let d = 0; d < 7; d++) {
      px(c, bx - 2 + Math.floor(d * 0.5), sy + d, C.scaffoldDk);
      px(c, bx + bw + 2 - Math.floor(d * 0.5), sy + d, C.scaffoldDk);
    }
    c.restore();
  }

  // Some windows installed
  for (const [wx, wy, s] of [[bx + 4, by + 16, 0], [bx + 20, by + 16, 2], [bx + 36, by + 16, 4], [bx + 4, by + 36, 1], [bx + 20, by + 36, 5], [bx + 36, by + 40, 3]] as [number, number, number][]) {
    drawWin(c, wx, wy, 4, 3, s);
  }

  // Workers' string lights
  for (let x = bx; x < bx + bw; x += 4) {
    px(c, x, by + 2, C.nGold);
    glow(c, x, by + 2, 1, 1, C.nGold, 1, 0.12);
  }
  for (let x = bx + 2; x < bx + bw; x += 5) {
    px(c, x, by + 26, C.nGold);
  }

  // Partial neon being installed at top
  for (let x = bx + 3; x < bx + bw - 3; x += 3) {
    px(c, x, by, C.nCyanDim);
  }
  // Dangling wire end
  px(c, bx + bw - 5, by + 1, C.nCyan);
  px(c, bx + bw - 5, by + 2, C.nCyanDim);
  px(c, bx + bw - 4, by + 3, C.nCyanDim);

  // Rooftop crane
  vline(c, bx + 20, by - 10, by, C.crane);
  hline(c, by - 11, bx + 14, bx + 30, C.crane);
  px(c, bx + 28, by - 11, C.nRed);
  glow(c, bx + 28, by - 11, 1, 1, C.nRed, 2, 0.3);

  // Concrete mixer on ground
  rect(c, bx + 40, by + bh + 2, 8, 4, C.scaffoldDk);
  rect(c, bx + 40, by + bh + 2, 8, 1, C.scaffold);
  px(c, bx + 43, by + bh + 3, C.nOrange);
}

function drawConst3(c: Ctx) {
  drawGround(c);
  const bx = 6, by = 24, bw = 52, bh = 64;

  // Nearly complete building
  for (let i = 0; i < bh; i++) {
    const v = 11 + Math.floor((i / bh) * 10);
    rect(c, bx, by + i, bw, 1, `rgb(${v},${v},${v + 26})`);
  }
  rect(c, bx, by, 2, bh, C.wallMid);
  rect(c, bx + bw - 2, by, 2, bh, C.wallEdge);

  // Floor bands
  for (let i = 1; i <= 8; i++) {
    const fy = by + i * 7;
    if (fy < by + bh) hline(c, fy, bx, bx + bw - 1, C.wallAccent);
  }

  // Windows — most installed, some dark/missing
  for (let row = 0; row < 8; row++) {
    const wy = by + 3 + row * 7;
    if (wy + 3 >= by + bh - 8) break;
    const litPct = row < 2 ? 0.5 : 0.75; // top floors less finished
    winRow(c, wy, bx + 4, bx + bw - 3, 3, 3, 3, row * 19 + 7, litPct);
  }
  // Empty window holes on top floors
  for (const [wx, wy] of [[bx + 36, by + 3], [bx + 42, by + 3], [bx + 40, by + 10]] as [number, number][]) {
    rect(c, wx, wy, 4, 3, '#04040c');
  }

  // Neon strips — installed on most floors
  neonH(c, by + 14, bx + 3, bx + bw - 3, C.nCyan);
  neonH(c, by + 28, bx + 3, bx + bw - 3, C.nPink);
  neonH(c, by + 42, bx + 3, bx + bw - 3, C.nGold);
  // Partial neon on top
  neonH(c, by + 7, bx + 3, bx + Math.floor(bw * 0.6), C.nCyanDim);
  // Dangling end
  px(c, bx + Math.floor(bw * 0.6), by + 8, C.nCyan);
  px(c, bx + Math.floor(bw * 0.6) + 1, by + 9, C.nCyanDim);

  // Roof scaffold only (almost done)
  rect(c, bx - 2, by - 4, bw + 4, 4, C.scaffold);
  rect(c, bx - 2, by - 4, bw + 4, 1, C.scaffoldLt);
  vline(c, bx - 2, by - 4, by + 8, C.scaffoldDk);
  vline(c, bx + bw + 1, by - 4, by + 8, C.scaffoldDk);

  // Partial roofline neon
  neonH(c, by, bx, bx + bw, C.nCyanDim);

  // Door installed
  const dx = bx + 19, dy = by + bh - 10;
  rect(c, dx, dy, 12, 10, C.wDark);
  neonH(c, dy, dx, dx + 12, C.nGold);
  neonV(c, dx, dy, dy + 10, C.nGoldDim);
  neonV(c, dx + 11, dy, dy + 10, C.nGoldDim);
  glow(c, dx, dy, 12, 10, C.nGold, 1, 0.08);

  // Work light on scaffold
  glow(c, bx + 20, by - 6, 6, 1, C.nGold, 3, 0.25);
  px(c, bx + 23, by - 6, C.nGold);
  px(c, bx + 24, by - 6, C.nGoldDim);
}

// ─── DAMAGE OVERLAYS (transparent bg) ────────────────────────────────

function drawDmg1(c: Ctx) {
  // Light damage: cracks + sparks
  const cracks: [number, number, number, number][] = [
    [8, 20, 1, 1], [16, 40, 1, 1], [38, 24, -1, 1], [28, 56, 1, 1],
    [48, 16, -1, 1], [20, 70, 1, 1], [44, 50, -1, 1],
  ];
  for (const [sx, sy, dx, dy] of cracks) {
    for (let i = 0; i < 5; i++) {
      px(c, sx + i * dx, sy + i * dy, C.crack);
    }
    px(c, sx, sy, C.crackDk);
  }
  // Sparks
  for (const [sx, sy] of [[12, 26], [40, 30], [24, 62], [50, 20]] as [number, number][]) {
    px(c, sx, sy, C.fireBright);
    glow(c, sx, sy, 1, 1, C.fireGlow, 1, 0.15);
  }
  // Broken window cracks
  for (const [wx, wy] of [[18, 28], [36, 44], [10, 58]] as [number, number][]) {
    px(c, wx, wy, C.crackDk);
    px(c, wx + 1, wy, C.crack);
    px(c, wx, wy + 1, C.crack);
  }
  // Dust
  c.save(); c.globalAlpha = 0.25;
  for (const [dx, dy] of [[10, 18], [30, 36], [22, 50], [48, 28], [14, 72]] as [number, number][]) {
    px(c, dx, dy, C.smoke);
  }
  c.restore();
}

function drawDmg2(c: Ctx) {
  // Critical damage: heavy cracks + fire + smoke
  const cracks: [number, number, number, number][] = [
    [6, 14, 1, 1], [18, 8, 1, 1], [12, 36, 1, 1], [40, 30, -1, 1],
    [30, 50, 1, 1], [50, 20, -1, 1], [8, 60, 1, 1], [44, 58, -1, 1],
    [24, 72, 1, 1], [36, 16, -1, 1],
  ];
  for (const [sx, sy, dx, dy] of cracks) {
    for (let i = 0; i < 7; i++) {
      px(c, sx + i * dx, sy + i * dy, C.crack);
      if (i % 2 === 0) px(c, sx + i * dx + dx, sy + i * dy, C.crackDk);
      if (i === 4) {
        px(c, sx + i * dx + dx, sy + i * dy - 1, C.crack);
        px(c, sx + i * dx + dx * 2, sy + i * dy - 2, C.crackDk);
      }
    }
  }
  // Shattered windows
  for (const [wx, wy] of [[14, 20], [30, 14], [22, 42], [42, 34], [10, 56], [36, 60]] as [number, number][]) {
    rect(c, wx, wy, 4, 3, '#0a0408');
    px(c, wx, wy, C.crack);
    px(c, wx + 3, wy + 2, C.crackDk);
  }
  // Fire spots
  for (const [fx, fy] of [[16, 16], [34, 28], [12, 44], [44, 40], [24, 64], [48, 54]] as [number, number][]) {
    glow(c, fx - 2, fy - 2, 5, 5, C.fire, 2, 0.2);
    px(c, fx, fy - 1, C.fireBright);
    px(c, fx + 1, fy - 1, C.fireGlow);
    px(c, fx, fy, C.fire);
    px(c, fx + 1, fy, C.fireGlow);
    px(c, fx - 1, fy, C.fire);
    px(c, fx, fy + 1, C.nRed);
    px(c, fx + 1, fy + 1, C.nRedDim);
  }
  // Smoke wisps
  c.save(); c.globalAlpha = 0.3;
  for (const [sx, sy] of [[18, 12], [36, 24], [14, 40], [46, 36], [26, 60]] as [number, number][]) {
    px(c, sx, sy, C.smoke);
    px(c, sx - 1, sy - 1, C.smokeDk);
    px(c, sx + 1, sy - 2, C.smokeLt);
  }
  c.restore();
  // Exposed wiring sparks
  px(c, 28, 38, C.nCyan);
  px(c, 29, 39, C.nCyanDim);
  glow(c, 28, 38, 2, 2, C.nCyan, 1, 0.2);
}

function drawDmg3(c: Ctx) {
  // Ruin: mostly collapsed
  c.save(); c.globalAlpha = 0.5;
  rect(c, 2, 4, 60, 84, '#000008');
  c.restore();

  // Wall fragments
  c.save(); c.globalAlpha = 0.7;
  rect(c, 4, 42, 5, 28, C.wallDark);
  rect(c, 54, 50, 5, 20, C.wallDark);
  rect(c, 22, 30, 10, 8, C.wallMid);
  rect(c, 14, 54, 8, 12, C.wallDark);
  rect(c, 40, 44, 6, 10, C.wallDark2);
  c.restore();

  // Rubble heap
  for (let x = 3; x < 61; x++) {
    const h = 1 + Math.floor(Math.abs(Math.sin(x * 1.1 + 0.5)) * 6);
    const col = [C.rubble, C.rubbleDk, C.rubbleLt][x % 3];
    rect(c, x, 88 - h, 1, h, col);
  }
  // Scattered debris
  for (const [rx, ry] of [[8, 74], [18, 78], [30, 72], [42, 76], [52, 78], [14, 80], [36, 74], [26, 82], [48, 72]] as [number, number][]) {
    rect(c, rx, ry, 3, 2, C.rubble);
    px(c, rx, ry, C.rubbleDk);
  }

  // Embers & dying fires
  for (const [ex, ey] of [[10, 68], [24, 62], [40, 70], [18, 76], [34, 66], [50, 64], [28, 80], [44, 74]] as [number, number][]) {
    px(c, ex, ey, C.fireGlow);
    c.save(); c.globalAlpha = 0.3;
    px(c, ex, ey - 1, C.fire);
    px(c, ex + 1, ey, C.nRed);
    c.restore();
    glow(c, ex, ey, 1, 1, C.fireGlow, 1, 0.08);
  }

  // Smoke columns
  c.save(); c.globalAlpha = 0.18;
  for (const [sx, base] of [[12, 64], [30, 58], [44, 62], [22, 70]] as [number, number][]) {
    for (let y = base; y > base - 14; y--) {
      const drift = Math.floor(Math.sin(y * 0.6) * 2);
      px(c, sx + drift, y, C.smoke);
      if (y < base - 5) px(c, sx + drift + 1, y, C.smokeDk);
      if (y < base - 9) px(c, sx + drift - 1, y, C.smokeLt);
    }
  }
  c.restore();

  // Exposed neon remnants
  for (const [nx, ny] of [[6, 50], [56, 56], [24, 36], [42, 48]] as [number, number][]) {
    c.save(); c.globalAlpha = 0.35;
    px(c, nx, ny, C.nCyanDim);
    glow(c, nx, ny, 1, 1, C.nCyan, 1, 0.1);
    c.restore();
  }
}

// ─── PROPS ───────────────────────────────────────────────────────────

function drawPropLamp(c: Ctx) {
  drawGround(c);
  // Pole
  vline(c, 10, 24, 88, C.lampPost);
  vline(c, 11, 26, 88, '#3a4a5e');
  // Base
  rect(c, 8, 86, 6, 2, C.scaffoldDk);

  // Arm
  hline(c, 24, 7, 15, C.lampPost);
  px(c, 7, 23, C.scaffoldDk);
  px(c, 15, 23, C.scaffoldDk);

  // Light housing
  rect(c, 5, 20, 12, 4, C.scaffoldDk);
  rect(c, 6, 21, 10, 2, C.scaffold);

  // Light — large bright glow
  glow(c, 3, 16, 16, 6, C.nCyan, 5, 0.25);
  glow(c, 5, 18, 12, 3, C.nCyanGlow, 3, 0.4);
  rect(c, 6, 20, 10, 1, C.nCyanBright);
  px(c, 10, 18, C.nCyanGlow);
  px(c, 11, 18, C.nCyan);
  px(c, 10, 19, C.nCyan);
  px(c, 11, 19, C.nCyanGlow);

  // Ground light pool
  c.save(); c.globalAlpha = 0.06;
  rect(c, 2, 88, 18, 5, C.nCyan);
  c.restore();
  c.save(); c.globalAlpha = 0.03;
  rect(c, 0, 90, 22, 3, C.nCyan);
  c.restore();
}

function drawPropBillboard(c: Ctx) {
  drawGround(c);
  // Support posts
  vline(c, 10, 42, 88, C.scaffold);
  vline(c, 11, 44, 88, C.scaffoldDk);
  vline(c, 52, 42, 88, C.scaffold);
  vline(c, 53, 44, 88, C.scaffoldDk);
  // Post bases
  rect(c, 8, 86, 6, 2, C.scaffoldDk);
  rect(c, 50, 86, 6, 2, C.scaffoldDk);

  // Billboard frame
  rect(c, 6, 16, 52, 26, C.billboard);

  // Neon border — multi-color
  neonH(c, 16, 6, 58, C.nCyan, 2);
  neonH(c, 41, 6, 58, C.nPink, 2);
  neonV(c, 6, 16, 42, C.nCyanDim);
  neonV(c, 57, 16, 42, C.nPinkDim);
  glow(c, 6, 16, 52, 26, C.nCyan, 2, 0.06);

  // Holographic content
  rect(c, 10, 20, 14, 6, C.nPink);
  rect(c, 10, 20, 14, 2, C.nPinkGlow);
  rect(c, 28, 19, 22, 4, C.nGold);
  rect(c, 28, 19, 22, 1, '#ffdd44');
  rect(c, 28, 25, 18, 3, C.nGreen);
  rect(c, 10, 29, 10, 4, C.nPurple);
  rect(c, 24, 29, 8, 4, C.nOrange);
  rect(c, 36, 29, 12, 4, C.nBlue);
  // Abstract text lines
  for (let x = 10; x < 48; x += 4) {
    px(c, x, 35, C.nWhite);
    px(c, x + 1, 36, C.nWhite);
  }

  // Scan lines
  c.save(); c.globalAlpha = 0.08;
  for (let y = 17; y < 41; y += 2) rect(c, 7, y, 50, 1, '#ffffff');
  c.restore();

  // Glitch artifact
  c.save(); c.globalAlpha = 0.25;
  rect(c, 16, 24, 20, 1, '#ffffff');
  rect(c, 22, 32, 12, 1, '#ffffff');
  c.restore();
}

function drawPropTree(c: Ctx) {
  drawGround(c);
  // Circuit-tree trunk
  rect(c, 28, 52, 6, 36, C.treeTrunk);
  rect(c, 29, 54, 4, 32, '#222244');
  // Trunk circuit lines
  for (let y = 56; y < 86; y += 6) {
    px(c, 29, y, '#1a1a3a');
    px(c, 32, y + 3, '#1a1a3a');
  }

  // Main branches — circuit board style
  const branches: [number, number, number, number][] = [
    [16, 44, 28, 44], [34, 40, 48, 40], [12, 34, 28, 34],
    [34, 28, 52, 28], [18, 22, 28, 22], [34, 18, 46, 18],
    [22, 14, 28, 14], [34, 10, 42, 10],
  ];
  for (const [x1, y1, x2, y2] of branches) {
    hline(c, y1, x1, x2, C.treeTrunk);
    // Vertical stubs connecting to trunk
    const ty = Math.min(y1, y2);
    vline(c, x1 < 28 ? 28 : 33, ty, ty + 4, C.treeTrunk);
  }

  // Glowing leaf/data nodes
  const leaves: [number, number, string][] = [
    [14, 42, C.treeGlow], [48, 38, C.nCyan], [10, 32, C.treeLeaf],
    [52, 26, C.nGreen], [16, 20, C.treeGlow], [46, 16, C.nCyan],
    [20, 12, C.treeLeaf], [42, 8, C.nGreen],
    [28, 6, C.treeGlow], [34, 4, C.nGreen],
  ];
  for (const [lx, ly, col] of leaves) {
    glow(c, lx - 1, ly - 1, 4, 4, col, 2, 0.15);
    rect(c, lx, ly, 3, 3, C.treeLeaf);
    px(c, lx, ly, col);
    px(c, lx + 2, ly + 2, col);
  }

  // Crown canopy
  glow(c, 24, 2, 14, 8, C.treeGlow, 4, 0.12);
  rect(c, 26, 3, 10, 6, C.treeLeaf);
  px(c, 28, 2, C.treeGlow);
  px(c, 32, 2, C.treeGlow);
  px(c, 30, 1, C.nGreen);
  px(c, 31, 1, C.nGreen);

  // Root circuits
  for (const [rx, ry] of [[22, 86], [36, 86], [18, 88], [40, 88]] as [number, number][]) {
    px(c, rx, ry, C.treeTrunk);
  }
  px(c, 20, 87, C.treeGlow);
  px(c, 38, 87, C.treeGlow);
}

function drawPropRoad(c: Ctx) {
  // Full road surface
  rect(c, 0, 0, BASE_W, BASE_H, C.roadDark);
  // Texture
  for (let y = 0; y < BASE_H; y += 4) {
    for (let x = 0; x < BASE_W; x += 6) {
      px(c, x + (y % 2), y, '#0a0a15');
    }
  }
  // Center dashed line
  for (let y = 1; y < BASE_H; y += 6) {
    rect(c, 30, y, 3, 4, C.roadYellow);
  }
  // Side lines
  for (let y = 0; y < BASE_H; y++) {
    px(c, 8, y, C.roadLine);
    px(c, 55, y, C.roadLine);
  }
  // Crosswalk / detail
  for (let x = 18; x < 28; x += 2) {
    rect(c, x, 70, 2, 10, C.roadLine);
  }
  // Drain
  rect(c, 16, 50, 6, 6, '#060610');
  for (let i = 0; i < 4; i++) {
    px(c, 16, 51 + i, C.roadLine);
    px(c, 21, 51 + i, C.roadLine);
  }
  // Neon reflections
  c.save(); c.globalAlpha = 0.03;
  for (let y = 2; y < BASE_H; y += 8) {
    rect(c, 9, y, 20, 2, C.nPink);
    rect(c, 35, y + 4, 18, 2, C.nCyan);
  }
  c.restore();
}

// ─── Sheet assembly & main ───────────────────────────────────────────

function createSheet(fns: ((c: Ctx) => void)[]): Canvas {
  const canvas = createCanvas(FRAME_W * fns.length, FRAME_H);
  const ctx = canvas.getContext('2d');
  for (let i = 0; i < fns.length; i++) {
    ctx.save();
    ctx.translate(i * FRAME_W, 0);
    fns[i](ctx);
    ctx.restore();
  }
  return canvas;
}

function save(canvas: Canvas, name: string) {
  const buf = canvas.toBuffer('image/png');
  const out = path.join(OUT_DIR, name);
  fs.writeFileSync(out, buf);
  console.log(`  ${name}: ${buf.length} bytes (${canvas.width}×${canvas.height})`);
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  console.log('Generating HD cyberpunk sprites (64×96 @ 3×)...\n');

  save(createSheet([drawTier0, drawTier1, drawTier2, drawTier3, drawTier4]), 'houses.png');
  save(createSheet([drawConst0, drawConst1, drawConst2, drawConst3]), 'construction.png');
  save(createSheet([drawDmg1, drawDmg2, drawDmg3]), 'damage_overlay.png');
  save(createSheet([drawPropLamp, drawPropBillboard, drawPropTree, drawPropRoad]), 'props.png');

  console.log(`\nDone! Saved to: ${OUT_DIR}`);
}

main();
