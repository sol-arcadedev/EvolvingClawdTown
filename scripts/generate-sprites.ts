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

// ─── TIER 2: Medium Commercial Building + Holographic Ads ────────────
function drawTier2(c: Ctx) {
  drawGround(c);
  const bx = 6, by = 22, bw = 50, bh = 66;

  // Body gradient — three-panel glass facade effect
  for (let i = 0; i < bh; i++) {
    const v = 9 + Math.floor((i / bh) * 13);
    // Left panel
    rect(c, bx, by + i, Math.floor(bw / 3), 1, `rgb(${v},${v},${v + 30})`);
    // Center panel (slightly brighter — glass)
    rect(c, bx + Math.floor(bw / 3), by + i, Math.floor(bw / 3), 1, `rgb(${v + 2},${v + 2},${v + 34})`);
    // Right panel
    rect(c, bx + Math.floor(bw * 2 / 3), by + i, bw - Math.floor(bw * 2 / 3), 1, `rgb(${v - 1},${v - 1},${v + 26})`);
  }

  // Panel divider columns
  rect(c, bx, by, 2, bh, C.wallLight);
  rect(c, bx + bw - 2, by, 2, bh, C.wallEdge);
  rect(c, bx + Math.floor(bw / 3) - 1, by, 2, bh, C.wallAccent);
  rect(c, bx + Math.floor(bw * 2 / 3) - 1, by, 2, bh, C.wallAccent);

  // Floor bands
  for (let i = 1; i <= 8; i++) hline(c, by + i * 7 + 2, bx, bx + bw - 1, C.wallAccent);

  // Windows — 8 floors × varied
  for (let row = 0; row < 8; row++) {
    const wy = by + 3 + row * 7 + (row > 0 ? 2 : 0);
    if (wy + 4 > by + bh - 8) break;
    winRow(c, wy, bx + 3, bx + bw - 2, 3, 3, 3, row * 23 + 7, 0.8);
  }

  // Neon vertical edges — dual color glow
  neonV(c, bx, by, by + bh, C.nCyan, 2, 0.22);
  neonV(c, bx + 1, by, by + bh, C.nCyanDim, 1, 0.08);
  neonV(c, bx + bw - 1, by, by + bh, C.nPink, 2, 0.22);
  neonV(c, bx + bw - 2, by, by + bh, C.nPinkDim, 1, 0.08);
  // Center column neons
  neonV(c, bx + Math.floor(bw / 3) - 1, by, by + bh, C.nGoldDim, 1, 0.1);
  neonV(c, bx + Math.floor(bw * 2 / 3), by, by + bh, C.nPurpleDim, 1, 0.1);

  // Horizontal neon bands — multiple colors
  neonH(c, by + 11, bx + 3, bx + bw - 3, C.nCyan);
  neonH(c, by + 25, bx + 3, bx + bw - 3, C.nPink);
  neonH(c, by + 39, bx + 3, bx + bw - 3, C.nGold);
  neonH(c, by + 53, bx + 3, bx + bw - 3, C.nPurple);

  // ── Holographic floating billboard (right side) ──
  holoPanel(c, bx + bw + 2, by + 8, 10, 22, C.nPink, 0.14, (c, x, y, _w, _h) => {
    // Ad content: abstract shapes
    rect(c, x + 2, y + 3, 6, 3, C.nPink);
    c.save(); c.globalAlpha = 0.8;
    rect(c, x + 2, y + 3, 6, 1, C.nPinkGlow);
    c.restore();
    rect(c, x + 2, y + 8, 4, 2, C.nGold);
    rect(c, x + 2, y + 12, 6, 2, C.nGreen);
    rect(c, x + 2, y + 16, 3, 2, C.nBlue);
    rect(c, x + 6, y + 16, 3, 2, C.nOrange);
  });
  // Projector beams from building to holo-billboard
  c.save(); c.globalAlpha = 0.08;
  for (let i = 0; i < 3; i++) {
    const py = by + 12 + i * 6;
    hline(c, py, bx + bw, bx + bw + 2, C.nPink);
  }
  c.restore();

  // ── Holographic company logo (above roof) ──
  holoPanel(c, bx + 12, by - 14, 26, 10, C.nCyan, 0.1, (c, x, y) => {
    // Abstract logo: triangle + text lines
    c.save(); c.globalAlpha = 0.7;
    // Diamond shape
    px(c, x + 6, y + 2, C.nCyanGlow);
    px(c, x + 5, y + 3, C.nCyan);
    px(c, x + 7, y + 3, C.nCyan);
    px(c, x + 4, y + 4, C.nCyanDim);
    px(c, x + 8, y + 4, C.nCyanDim);
    px(c, x + 5, y + 5, C.nCyan);
    px(c, x + 7, y + 5, C.nCyan);
    px(c, x + 6, y + 6, C.nCyanGlow);
    // Text lines
    hline(c, y + 3, x + 12, x + 22, C.nCyanDim);
    hline(c, y + 5, x + 12, x + 20, C.nCyanDim);
    hline(c, y + 7, x + 12, x + 18, C.nCyanDim);
    c.restore();
  });

  // Door — grand with awning
  const dx = bx + 17, dy = by + bh - 10;
  rect(c, dx, dy, 14, 10, C.wDark);
  c.save(); c.globalAlpha = 0.2; rect(c, dx + 2, dy + 2, 10, 6, C.nGold); c.restore();
  neonH(c, dy, dx, dx + 14, C.nGold, 1, 0.3);
  neonV(c, dx, dy, dy + 10, C.nGoldDim);
  neonV(c, dx + 13, dy, dy + 10, C.nGoldDim);
  glow(c, dx, dy, 14, 10, C.nGold, 2, 0.1);
  // Awning
  rect(c, dx - 3, dy - 3, 20, 3, C.roofDark);
  neonH(c, dy - 3, dx - 3, dx + 17, C.nGold);

  // Roof structure
  rect(c, bx - 2, by - 2, bw + 4, 2, C.roofDark);
  neonH(c, by - 1, bx, bx + bw, C.nCyan, 2, 0.3);
  neonH(c, by - 2, bx + 4, bx + bw - 4, C.nPink);

  // Rooftop equipment
  rect(c, bx + 3, by - 6, 8, 4, C.scaffoldDk);
  rect(c, bx + 3, by - 6, 8, 1, C.scaffold);
  rect(c, bx + 38, by - 7, 8, 5, C.scaffoldDk);
  rect(c, bx + 38, by - 7, 8, 1, C.scaffold);
  px(c, bx + 41, by - 6, C.scaffoldLt);

  // Antenna with beacon
  vline(c, bx + 28, by - 2, by - 12, C.scaffold);
  px(c, bx + 28, by - 12, C.nCyan);
  glow(c, bx + 28, by - 12, 1, 1, C.nCyan, 2, 0.35);

  // Ground floor shopfronts with holographic displays
  rect(c, bx + 3, by + bh - 8, 14, 6, C.wDark);
  c.save(); c.globalAlpha = 0.2; rect(c, bx + 4, by + bh - 7, 12, 4, C.nGreen); c.restore();
  neonH(c, by + bh - 8, bx + 3, bx + 17, C.nGreen);
  rect(c, bx + 33, by + bh - 8, 14, 6, C.wDark);
  c.save(); c.globalAlpha = 0.2; rect(c, bx + 34, by + bh - 7, 12, 4, C.nOrange); c.restore();
  neonH(c, by + bh - 8, bx + 33, bx + 47, C.nOrange);

  // Ground neon reflection
  c.save(); c.globalAlpha = 0.06;
  rect(c, bx, by + bh, bw, 4, C.nCyan);
  rect(c, bx + bw + 2, by + 28, 10, 2, C.nPink);
  c.restore();
}

// ─── TIER 3: Skyscraper with Holographic Projections ─────────────────
function drawTier3(c: Ctx) {
  drawGround(c);

  const bx = 4, by = 8, bw = 56, bh = 80;
  const setbackY = by + 22;
  const inset = 5;

  // ── Building structure ──
  // Upper section (narrower, penthouse floors)
  for (let i = 0; i < setbackY - by; i++) {
    const v = 7 + Math.floor((i / (setbackY - by)) * 10);
    rect(c, bx + inset, by + i, bw - inset * 2, 1, `rgb(${v},${v},${v + 32})`);
  }
  // Lower section (full width)
  for (let i = 0; i < by + bh - setbackY; i++) {
    const v = 9 + Math.floor((i / (by + bh - setbackY)) * 12);
    rect(c, bx, setbackY + i, bw, 1, `rgb(${v},${v},${v + 30})`);
  }

  // Setback ledge with neon
  rect(c, bx, setbackY - 1, bw, 2, C.wallAccent);
  neonH(c, setbackY - 1, bx, bx + bw, C.nGold, 2, 0.3);
  // Ledge balcony detail
  for (let x = bx + 2; x < bx + inset; x += 3) {
    vline(c, x, setbackY, setbackY + 3, C.scaffoldDk);
    hline(c, setbackY + 3, x, x + 2, C.scaffold);
  }
  for (let x = bx + bw - inset; x < bx + bw - 1; x += 3) {
    vline(c, x, setbackY, setbackY + 3, C.scaffoldDk);
    hline(c, setbackY + 3, x, x + 2, C.scaffold);
  }

  // Structural edges
  rect(c, bx, setbackY, 2, by + bh - setbackY, C.wallLight);
  rect(c, bx + bw - 2, setbackY, 2, by + bh - setbackY, C.wallEdge);
  rect(c, bx + inset, by, 2, setbackY - by, C.wallLight);
  rect(c, bx + bw - inset - 2, by, 2, setbackY - by, C.wallEdge);
  // Center column
  rect(c, bx + bw / 2 - 1, by, 2, bh, C.wallAccent);

  // Floor bands
  for (let i = 1; i <= 14; i++) {
    const fy = by + 2 + i * 5;
    if (fy >= by + bh - 6) break;
    const xl = fy < setbackY ? bx + inset : bx;
    const xr = fy < setbackY ? bx + bw - inset : bx + bw;
    hline(c, fy, xl, xr - 1, C.wallAccent);
  }

  // Windows — upper penthouse
  for (let row = 0; row < 3; row++) {
    const wy = by + 2 + row * 5 + (row > 0 ? 2 : 0);
    winRow(c, wy, bx + inset + 3, bx + bw - inset - 2, 3, 3, 2, row * 31 + 5, 0.85);
  }
  // Windows — lower floors
  for (let row = 0; row < 10; row++) {
    const wy = setbackY + 2 + row * 5 + (row > 0 ? 1 : 0);
    if (wy + 3 >= by + bh - 10) break;
    winRow(c, wy, bx + 3, bx + bw - 2, 3, 3, 2, row * 31 + 100, 0.78);
  }

  // ── Neon bands — rainbow progression ──
  const t3Neon = [C.nCyan, C.nPink, C.nPurple, C.nGold, C.nCyan, C.nPink, C.nOrange, C.nGreen];
  for (let i = 0; i < 8; i++) {
    const ny = by + 6 + i * 9;
    if (ny >= by + bh - 6) break;
    const xl = ny < setbackY ? bx + inset + 3 : bx + 3;
    const xr = ny < setbackY ? bx + bw - inset - 3 : bx + bw - 3;
    neonH(c, ny, xl, xr, t3Neon[i]);
  }

  // Vertical neon strips
  neonV(c, bx, setbackY, by + bh, C.nCyan, 2, 0.22);
  neonV(c, bx + bw - 1, setbackY, by + bh, C.nPink, 2, 0.22);
  neonV(c, bx + inset, by, setbackY, C.nCyan, 2, 0.18);
  neonV(c, bx + bw - inset - 1, by, setbackY, C.nPink, 2, 0.18);

  // ── Holographic data streams running up both sides ──
  for (let dx = 0; dx < 3; dx++) {
    holoStream(c, bx - 2 + dx, by + 10, by + bh, C.nCyan, 0.3);
    holoStream(c, bx + bw + dx, by + 14, by + bh, C.nPink, 0.3);
  }

  // ── LARGE holographic billboard floating on left side ──
  holoPanel(c, bx - 14, by + 20, 12, 24, C.nCyan, 0.15, (c, x, y) => {
    // Stock chart line
    c.save(); c.globalAlpha = 0.7;
    const pts = [6, 4, 7, 3, 5, 2, 4, 6, 3, 5];
    for (let i = 0; i < pts.length - 1; i++) {
      px(c, x + 1 + i, y + 4 + pts[i], C.nGreen);
    }
    // Arrow up
    px(c, x + 9, y + 4, C.nGreen);
    px(c, x + 8, y + 5, C.nGreenDim);
    px(c, x + 10, y + 5, C.nGreenDim);
    // Price text lines
    hline(c, y + 13, x + 2, x + 9, C.nCyanDim);
    hline(c, y + 15, x + 2, x + 7, C.nCyanDim);
    hline(c, y + 17, x + 2, x + 8, C.nGoldDim);
    // Bar chart
    for (let i = 0; i < 4; i++) {
      const h = 2 + (i * 3 + 5) % 5;
      rect(c, x + 2 + i * 2, y + 22 - h, 1, h, [C.nCyan, C.nPink, C.nGold, C.nGreen][i]);
    }
    c.restore();
  });
  // Projector beams
  c.save(); c.globalAlpha = 0.06;
  for (let i = 0; i < 4; i++) hline(c, by + 24 + i * 5, bx - 2, bx + inset, C.nCyan);
  c.restore();

  // ── Holographic floor indicator panel (right side) ──
  holoPanel(c, bx + bw + 2, by + 36, 8, 30, C.nPink, 0.12, (c, x, y) => {
    // Floor numbers
    c.save(); c.globalAlpha = 0.6;
    for (let i = 0; i < 8; i++) {
      const col = i === 0 ? C.nGold : C.nPinkDim;
      px(c, x + 2, y + 3 + i * 3, col);
      px(c, x + 3, y + 3 + i * 3, col);
      hline(c, y + 3 + i * 3, x + 5, x + 6, C.nPinkDim);
    }
    c.restore();
  });

  // ── Roof structure ──
  const topX = bx + inset;
  const topW = bw - inset * 2;
  neonH(c, by - 1, topX, topX + topW, C.nCyan, 2, 0.35);
  neonH(c, by - 2, topX + 4, topX + topW - 4, C.nPink, 2, 0.25);
  neonH(c, by - 3, topX + 8, topX + topW - 8, C.nGold);

  // Helipad
  rect(c, topX + 4, by - 3, topW - 8, 3, C.concreteDk);
  px(c, topX + topW / 2 - 3, by - 2, C.nWhite);
  px(c, topX + topW / 2 + 2, by - 2, C.nWhite);
  hline(c, by - 1, topX + topW / 2 - 3, topX + topW / 2 + 2, C.nWhite);
  vline(c, topX + topW / 2 - 3, by - 3, by - 1, C.nWhite);
  vline(c, topX + topW / 2 + 2, by - 3, by - 1, C.nWhite);
  for (const [lx, ly] of [[topX + 5, by - 3], [topX + topW - 6, by - 3], [topX + 5, by], [topX + topW - 6, by]] as [number, number][]) {
    px(c, lx, ly, C.nRed);
    glow(c, lx, ly, 1, 1, C.nRed, 1, 0.25);
  }

  // Spire with holographic rings
  const spireX = bx + bw / 2;
  vline(c, spireX, by - 3, by - 22, C.scaffold);
  vline(c, spireX + 1, by - 3, by - 20, C.scaffoldDk);
  hline(c, by - 12, spireX - 2, spireX + 3, C.scaffoldDk);
  hline(c, by - 16, spireX - 1, spireX + 2, C.scaffoldDk);
  // Beacon
  glow(c, spireX - 1, by - 24, 3, 2, C.nCyan, 4, 0.4);
  px(c, spireX, by - 23, C.nCyanBright);
  px(c, spireX + 1, by - 23, C.nCyanGlow);
  px(c, spireX, by - 24, C.nCyan);
  // ── Holographic rings around spire ──
  holoRing(c, spireX, by - 14, 6, 2, C.nCyan, 0.35);
  holoRing(c, spireX, by - 18, 4, 1, C.nPink, 0.3);

  // Door / grand lobby
  const ddx = bx + 18, ddy = by + bh - 12;
  rect(c, ddx, ddy, 20, 12, C.wDark);
  c.save(); c.globalAlpha = 0.25; rect(c, ddx + 2, ddy + 2, 16, 8, C.nGold); c.restore();
  neonH(c, ddy, ddx, ddx + 20, C.nGold, 2, 0.3);
  neonV(c, ddx, ddy, ddy + 12, C.nGoldDim, 1, 0.2);
  neonV(c, ddx + 19, ddy, ddy + 12, C.nGoldDim, 1, 0.2);
  glow(c, ddx, ddy, 20, 12, C.nGold, 2, 0.1);
  // Revolving door lights
  for (let i = 0; i < 3; i++) px(c, ddx + 4 + i * 6, ddy + 1, C.nGold);

  // Ground neon reflections
  c.save(); c.globalAlpha = 0.05;
  rect(c, bx - 14, by + 42, 12, 2, C.nCyan);
  rect(c, bx + bw + 2, by + 64, 8, 2, C.nPink);
  c.restore();
}

// ─── TIER 4: Megastructure with Full Holographic Crown ───────────────
function drawTier4(c: Ctx) {
  drawGround(c);

  const bx = 2, by = 6, bw = 60, bh = 82;

  // ── Body — dramatic deep gradient with pulsing blue shift ──
  for (let i = 0; i < bh; i++) {
    const v = 6 + Math.floor((i / bh) * 14);
    const b = v + 36 + Math.floor(Math.sin(i * 0.12) * 5);
    rect(c, bx, by + i, bw, 1, `rgb(${v},${v},${b})`);
  }

  // Structural columns — 4 sections
  rect(c, bx, by, 3, bh, C.wallLight);
  rect(c, bx + bw - 3, by, 3, bh, '#050510');
  rect(c, bx + Math.floor(bw / 3), by, 2, bh, C.wallAccent);
  rect(c, bx + Math.floor(bw * 2 / 3), by, 2, bh, C.wallAccent);
  // Extra mid-columns for mega-scale feel
  rect(c, bx + Math.floor(bw / 6), by, 1, bh, C.wallMid2);
  rect(c, bx + Math.floor(bw * 5 / 6), by, 1, bh, C.wallMid2);

  // Floor bands + rainbow neon on every floor
  const megaNeon = [C.nCyan, C.nPink, C.nPurple, C.nGold, C.nOrange, C.nGreen, C.nBlue, C.nCyan, C.nPink, C.nPurple, C.nGold, C.nOrange, C.nGreen];
  for (let i = 0; i < 14; i++) {
    const fy = by + 4 + i * 5;
    if (fy >= by + bh - 10) break;
    hline(c, fy, bx, bx + bw - 1, C.wallAccent);
    neonH(c, fy + 1, bx + 4, bx + bw - 4, megaNeon[i]);
  }

  // Dense window grid — 12 floors × 10+ cols
  for (let row = 0; row < 13; row++) {
    const wy = by + 2 + row * 5;
    if (wy + 3 >= by + bh - 10) break;
    winRow(c, wy, bx + 4, bx + bw - 3, 3, 3, 2, row * 41 + 13, 0.87);
  }

  // ── Neon edge treatment — triple-layer on each side ──
  neonV(c, bx, by, by + bh, C.nCyan, 3, 0.3);
  neonV(c, bx + 1, by, by + bh, C.nCyanDim, 2, 0.12);
  neonV(c, bx + 2, by, by + bh, C.nCyanDim, 1, 0.05);
  neonV(c, bx + bw - 1, by, by + bh, C.nPink, 3, 0.3);
  neonV(c, bx + bw - 2, by, by + bh, C.nPinkDim, 2, 0.12);
  neonV(c, bx + bw - 3, by, by + bh, C.nPinkDim, 1, 0.05);
  // Column neons
  neonV(c, bx + Math.floor(bw / 3), by, by + bh, C.nPurpleDim, 1, 0.15);
  neonV(c, bx + Math.floor(bw * 2 / 3), by, by + bh, C.nGoldDim, 1, 0.15);

  // ── Holographic data streams — cascading down both sides ──
  for (let dx = 0; dx < 4; dx++) {
    holoStream(c, bx - 3 + dx, by + 4, by + bh, C.nCyan, 0.35);
    holoStream(c, bx + bw + 1 + dx, by + 8, by + bh, C.nPink, 0.35);
  }

  // ── MASSIVE holographic display — left side ──
  holoPanel(c, bx - 16, by + 14, 14, 30, C.nCyan, 0.16, (c, x, y) => {
    c.save(); c.globalAlpha = 0.75;
    // Rotating globe / world icon
    holoRing(c, x + 7, y + 7, 4, 3, C.nCyanGlow, 0.6);
    holoRing(c, x + 7, y + 7, 3, 4, C.nCyanDim, 0.4);
    px(c, x + 7, y + 7, C.nCyanBright);
    // Price ticker
    hline(c, y + 13, x + 2, x + 11, C.nGreenDim);
    // Chart with bars
    for (let i = 0; i < 5; i++) {
      const h = 2 + ((i * 7 + 3) % 6);
      rect(c, x + 2 + i * 2, y + 22 - h, 1, h, [C.nCyan, C.nPink, C.nGold, C.nGreen, C.nPurple][i]);
    }
    // Data lines
    for (let row = 0; row < 3; row++) {
      hline(c, y + 24 + row * 2, x + 2, x + 8 + (row * 2), C.nCyanDim);
    }
    c.restore();
  });

  // ── MASSIVE holographic display — right side ──
  holoPanel(c, bx + bw + 2, by + 20, 14, 28, C.nPink, 0.16, (c, x, y) => {
    c.save(); c.globalAlpha = 0.75;
    // Abstract portrait / avatar
    rect(c, x + 4, y + 3, 6, 6, C.nPinkDim);
    px(c, x + 5, y + 4, C.nPinkGlow);
    px(c, x + 8, y + 4, C.nPinkGlow);
    hline(c, y + 7, x + 5, x + 8, C.nPink);
    // Social metrics
    for (let i = 0; i < 4; i++) {
      const w = 4 + ((i * 5 + 2) % 5);
      rect(c, x + 2, y + 12 + i * 3, w, 1, [C.nPink, C.nGold, C.nGreen, C.nBlue][i]);
      px(c, x + 2 + w + 1, y + 12 + i * 3, C.nWhite);
    }
    // Heart icon
    px(c, x + 3, y + 25, C.nPink);
    px(c, x + 5, y + 25, C.nPink);
    px(c, x + 4, y + 26, C.nPinkGlow);
    c.restore();
  });

  // Projector beams from building to panels
  c.save(); c.globalAlpha = 0.05;
  for (let i = 0; i < 6; i++) {
    hline(c, by + 18 + i * 4, bx - 2, bx + 3, C.nCyan);
    hline(c, by + 24 + i * 4, bx + bw - 2, bx + bw + 2, C.nPink);
  }
  c.restore();

  // ── Holographic ticker strip across building ──
  const tickerY = by + Math.floor(bh * 0.42);
  c.save(); c.globalAlpha = 0.55;
  rect(c, bx + 3, tickerY, bw - 6, 3, '#06061a');
  c.restore();
  for (let x = bx + 4; x < bx + bw - 4; x++) {
    const col = [C.nCyan, C.nPink, C.nGold, C.nGreen, C.nPurple, C.nOrange, C.nBlue][(x * 3 + 5) % 7];
    c.save(); c.globalAlpha = 0.5 + ((x * 7) % 50) / 100;
    px(c, x, tickerY, col);
    px(c, x, tickerY + 2, col);
    c.restore();
  }
  // Ticker glow
  glow(c, bx + 3, tickerY, bw - 6, 3, C.nCyan, 2, 0.08);

  // ── Second ticker strip — lower ──
  const ticker2Y = by + Math.floor(bh * 0.72);
  c.save(); c.globalAlpha = 0.45;
  rect(c, bx + 3, ticker2Y, bw - 6, 2, '#06061a');
  c.restore();
  for (let x = bx + 4; x < bx + bw - 4; x++) {
    const col = [C.nPink, C.nGold, C.nCyan, C.nPurple, C.nGreen][(x * 5 + 2) % 5];
    c.save(); c.globalAlpha = 0.4 + ((x * 11) % 40) / 100;
    px(c, x, ticker2Y, col);
    px(c, x, ticker2Y + 1, col);
    c.restore();
  }
  glow(c, bx + 3, ticker2Y, bw - 6, 2, C.nPink, 1, 0.06);

  // ── Mega roof — quad neon ──
  glow(c, bx, by - 1, bw, 5, C.nCyan, 5, 0.12);
  neonH(c, by - 1, bx, bx + bw, C.nCyan, 3, 0.35);
  neonH(c, by - 2, bx + 5, bx + bw - 5, C.nPink, 2, 0.25);
  neonH(c, by - 3, bx + 10, bx + bw - 10, C.nGold, 2, 0.2);
  neonH(c, by - 4, bx + 15, bx + bw - 15, C.nPurple);

  // ── Twin spires with holographic beacons ──
  const lSpire = bx + 14;
  const rSpire = bx + bw - 14;
  vline(c, lSpire, by - 4, by - 22, C.scaffold);
  vline(c, lSpire + 1, by - 4, by - 20, C.scaffoldDk);
  glow(c, lSpire - 1, by - 24, 3, 2, C.nCyan, 4, 0.45);
  px(c, lSpire, by - 23, C.nCyanBright);
  px(c, lSpire, by - 24, '#ffffff');
  holoRing(c, lSpire, by - 18, 4, 1, C.nCyan, 0.4);

  vline(c, rSpire, by - 4, by - 20, C.scaffold);
  vline(c, rSpire + 1, by - 4, by - 18, C.scaffoldDk);
  glow(c, rSpire - 1, by - 22, 3, 2, C.nPink, 4, 0.45);
  px(c, rSpire, by - 21, C.nPinkGlow);
  px(c, rSpire, by - 22, '#ffffff');
  holoRing(c, rSpire, by - 16, 4, 1, C.nPink, 0.4);

  // ── Central mega-beacon with holographic crown ──
  const cSpire = bx + bw / 2;
  vline(c, cSpire, by - 4, by - 30, C.scaffold);
  vline(c, cSpire + 1, by - 4, by - 28, C.scaffoldDk);
  // Crown beacon — bright white core
  glow(c, cSpire - 2, by - 34, 5, 4, C.nGold, 6, 0.45);
  glow(c, cSpire - 1, by - 33, 3, 2, '#ffffff', 3, 0.3);
  px(c, cSpire, by - 32, '#ffffff');
  px(c, cSpire + 1, by - 32, C.nGold);
  px(c, cSpire, by - 33, C.nGold);
  px(c, cSpire - 1, by - 31, C.nGoldDim);
  px(c, cSpire + 2, by - 31, C.nGoldDim);
  // Beacon rays extending outward
  for (let r = 1; r <= 5; r++) {
    c.save(); c.globalAlpha = 0.2 / r;
    px(c, cSpire - r, by - 32, C.nGold);
    px(c, cSpire + 1 + r, by - 32, C.nGold);
    px(c, cSpire, by - 32 - r, C.nGold);
    px(c, cSpire + 1, by - 32 - r, C.nGoldDim);
    // Diagonal rays
    px(c, cSpire - r, by - 32 - Math.floor(r * 0.5), C.nGoldDim);
    px(c, cSpire + 1 + r, by - 32 - Math.floor(r * 0.5), C.nGoldDim);
    c.restore();
  }

  // ── Holographic rings / halo around central spire ──
  holoRing(c, cSpire, by - 20, 8, 3, C.nGold, 0.4);
  holoRing(c, cSpire, by - 24, 6, 2, C.nCyan, 0.35);
  holoRing(c, cSpire, by - 28, 4, 1, C.nPink, 0.3);

  // ── Rooftop garden ──
  for (const tx of [bx + 5, bx + 18, bx + 42, bx + 52]) {
    rect(c, tx, by - 4, 3, 3, C.treeTrunk);
    rect(c, tx - 1, by - 7, 5, 3, C.treeLeaf);
    px(c, tx + 1, by - 8, C.treeGlow);
  }

  // ── Grand entrance with holographic arch ──
  const edx = bx + 14, edy = by + bh - 16;
  rect(c, edx, edy, 32, 16, C.wDark);
  // Lobby interior — warm glow
  c.save(); c.globalAlpha = 0.3;
  rect(c, edx + 2, edy + 2, 28, 12, C.nGold);
  c.restore();
  c.save(); c.globalAlpha = 0.15;
  rect(c, edx + 4, edy + 4, 24, 8, '#ffffff');
  c.restore();
  // Neon entrance frame
  neonH(c, edy, edx, edx + 32, C.nGold, 3, 0.35);
  neonH(c, edy + 15, edx, edx + 32, C.nGoldDim, 1, 0.15);
  neonV(c, edx, edy, edy + 16, C.nGoldDim, 2, 0.25);
  neonV(c, edx + 31, edy, edy + 16, C.nGoldDim, 2, 0.25);
  glow(c, edx, edy, 32, 16, C.nGold, 4, 0.12);
  // Holographic arch above entrance
  c.save(); c.globalAlpha = 0.25;
  for (let i = 0; i < 8; i++) {
    const ax = edx + 4 + i * 3;
    const ay = edy - 2 - Math.floor(Math.sin((i / 7) * Math.PI) * 4);
    px(c, ax, ay, C.nGold);
    px(c, ax + 1, ay, C.nGoldDim);
  }
  c.restore();
  // Door indicators
  for (let i = 0; i < 5; i++) px(c, edx + 5 + i * 5, edy + 1, C.nGold);

  // Ground neon reflections — dramatic
  c.save(); c.globalAlpha = 0.07;
  rect(c, bx - 16, by + bh - 4, 14, 4, C.nCyan);
  rect(c, bx + bw + 2, by + bh - 4, 14, 4, C.nPink);
  rect(c, edx, by + bh, 32, 4, C.nGold);
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
