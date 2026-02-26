import { Container, Graphics } from 'pixi.js';
import {
  PLOT_STRIDE,
  PLOT_DISTANCE_MULT,
  COL_CYAN,
  COL_MAGENTA,
  COL_GREEN,
} from './constants';

// Mainframe sits at world origin — centered in the 4x4 reserved zone
export const MAINFRAME_X = -0.5 * PLOT_STRIDE * PLOT_DISTANCE_MULT;
export const MAINFRAME_Y = -0.5 * PLOT_STRIDE * PLOT_DISTANCE_MULT;

// Size: spans ~3 plot strides across
const SIZE = PLOT_STRIDE * 1.8;

// ── ISOMETRIC HELPERS ──

function iso(bx: number, by: number, bz: number): [number, number] {
  return [(bx - by), (bx + by) * 0.5 - bz];
}

function isoBoxFill(
  g: Graphics,
  ox: number, oy: number,
  bw: number, bd: number, bh: number,
  topColor: number, leftColor: number, rightColor: number,
  topAlpha = 0.95, leftAlpha = 0.95, rightAlpha = 0.95,
  strokeColor?: number, strokeAlpha = 0.4, strokeWidth = 1,
) {
  const [x0, y0] = iso(ox, oy, 0);
  const [x1, y1] = iso(ox + bw, oy, 0);
  const [x2, y2] = iso(ox + bw, oy + bd, 0);
  const [x3, y3] = iso(ox, oy + bd, 0);
  const [x4, y4] = iso(ox, oy, bh);
  const [x5, y5] = iso(ox + bw, oy, bh);
  const [x6, y6] = iso(ox + bw, oy + bd, bh);
  const [x7, y7] = iso(ox, oy + bd, bh);

  // Top
  g.poly([x4, y4, x5, y5, x6, y6, x7, y7]);
  g.fill({ color: topColor, alpha: topAlpha });
  if (strokeColor !== undefined) {
    g.poly([x4, y4, x5, y5, x6, y6, x7, y7]);
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: strokeWidth });
  }
  // Left
  g.poly([x0, y0, x3, y3, x7, y7, x4, y4]);
  g.fill({ color: leftColor, alpha: leftAlpha });
  if (strokeColor !== undefined) {
    g.poly([x0, y0, x3, y3, x7, y7, x4, y4]);
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: strokeWidth });
  }
  // Right
  g.poly([x0, y0, x1, y1, x5, y5, x4, y4]);
  g.fill({ color: rightColor, alpha: rightAlpha });
  if (strokeColor !== undefined) {
    g.poly([x0, y0, x1, y1, x5, y5, x4, y4]);
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: strokeWidth });
  }
}

function drawBody(g: Graphics) {
  const u = SIZE / 16; // unit scale
  g.scale.set(u);

  const body = 0x080e1a;
  const bodyMid = 0x0c1424;
  const bodyTop = 0x101a2e;

  // ── BASE PLATFORM ──
  isoBoxFill(g, -8, -8, 16, 16, 1.5,
    0x0a1220, 0x060c16, 0x081018,
    0.95, 0.95, 0.95, COL_CYAN, 0.4, 1.5 / u);

  // Platform edge detail lines
  for (let i = -6; i <= 6; i += 3) {
    const [lx0, ly0] = iso(-8, i, 1.5);
    const [lx1, ly1] = iso(8, i, 1.5);
    g.moveTo(lx0, ly0); g.lineTo(lx1, ly1);
    g.stroke({ color: COL_CYAN, alpha: 0.12, width: 0.3 / u });
  }

  // ── MAIN BLOCK — lower section ──
  isoBoxFill(g, -5.5, -5.5, 11, 11, 6,
    bodyTop, body, bodyMid,
    0.95, 0.95, 0.95, COL_CYAN, 0.3, 1 / u);

  // ── MIDDLE SETBACK ──
  isoBoxFill(g, -4, -4, 8, 8, 5,
    0x121e32, 0x0a1422, 0x0e1828,
    0.92, 0.92, 0.92, COL_CYAN, 0.35, 1 / u);

  // ── UPPER CORE ──
  isoBoxFill(g, -2.5, -2.5, 5, 5, 5,
    0x141f35, body, bodyMid,
    0.9, 0.9, 0.9, COL_CYAN, 0.45, 1.2 / u);

  // ── CROWN ──
  isoBoxFill(g, -1.5, -1.5, 3, 3, 2,
    0x0a2040, 0x081838, 0x091c3c,
    0.85, 0.85, 0.85, COL_CYAN, 0.6, 1.5 / u);

  // ── NEON DIVIDER LINES between sections ──
  const dividers = [
    { z: 1.5, hw: 8.2 },   // platform top
    { z: 7.5, hw: 5.8 },   // lower → mid
    { z: 12.5, hw: 4.3 },  // mid → upper
    { z: 17.5, hw: 2.8 },  // upper → crown
  ];
  for (const d of dividers) {
    const [a, ay] = iso(-d.hw, -d.hw, d.z);
    const [b, by] = iso(d.hw, -d.hw, d.z);
    const [c, cy] = iso(d.hw, d.hw, d.z);
    // Right edge + front edge
    g.moveTo(a, ay); g.lineTo(b, by); g.lineTo(c, cy);
    g.stroke({ color: COL_CYAN, alpha: 0.7, width: 1.5 / u });
    // Glow
    g.moveTo(a, ay); g.lineTo(b, by); g.lineTo(c, cy);
    g.stroke({ color: COL_CYAN, alpha: 0.15, width: 5 / u });
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
      g.poly([w0, w0y, w1, w1y, w2, w2y, w3, w3y]);
      g.fill({ color: wColor, alpha: lit ? 0.6 : 0.08 });
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
      g.poly([w0, w0y, w1, w1y, w2, w2y, w3, w3y]);
      g.fill({ color: lit ? COL_GREEN : COL_CYAN, alpha: lit ? 0.5 : 0.06 });
    }
  }

  // ── WINDOWS on middle section ──
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // Right face
      const wy = -4 + 0.8 + col * 2.2;
      const wz = 8.0 + row * 1.5;
      const [w0, w0y] = iso(4, wy, wz);
      const [w1, w1y] = iso(4, wy, wz + 1.0);
      const [w2, w2y] = iso(4, wy + 1.4, wz + 1.0);
      const [w3, w3y] = iso(4, wy + 1.4, wz);
      g.poly([w0, w0y, w1, w1y, w2, w2y, w3, w3y]);
      g.fill({ color: (row + col) % 2 === 0 ? COL_CYAN : COL_MAGENTA,
               alpha: (row + col) % 3 === 0 ? 0.7 : 0.1 });
    }
  }

  // ── WINDOWS on upper core ──
  for (let row = 0; row < 2; row++) {
    // Right
    const [w0, w0y] = iso(2.5, -1 + row * 2.5, 13.5 + row * 2);
    const [w1, w1y] = iso(2.5, -1 + row * 2.5, 14.5 + row * 2);
    const [w2, w2y] = iso(2.5, 0.5 + row * 2.5, 14.5 + row * 2);
    const [w3, w3y] = iso(2.5, 0.5 + row * 2.5, 13.5 + row * 2);
    g.poly([w0, w0y, w1, w1y, w2, w2y, w3, w3y]);
    g.fill({ color: COL_CYAN, alpha: row === 0 ? 0.8 : 0.3 });
  }

  // ── CORNER PYLONS on platform ──
  const pylonPositions = [[-7, -7], [7, -7], [-7, 7], [7, 7]];
  for (const [px, py] of pylonPositions) {
    isoBoxFill(g, px - 0.4, py - 0.4, 0.8, 0.8, 3,
      0x102030, 0x0a1520, 0x0c1825,
      0.8, 0.8, 0.8, COL_CYAN, 0.5, 0.8 / u);
    // Pylon tip light
    const [tipX, tipY] = iso(px, py, 3.5);
    g.circle(tipX, tipY, 1.5 / u);
    g.fill({ color: COL_CYAN, alpha: 0.7 });
  }

  // ── SPIRE ──
  const [spBase, spBaseY] = iso(0, 0, 19.5);
  const [spTop, spTopY] = iso(0, 0, 25);
  g.moveTo(spBase, spBaseY); g.lineTo(spTop, spTopY);
  g.stroke({ color: COL_CYAN, alpha: 0.7, width: 1.8 / u });

  // Spire cross-arms
  const [la, lay] = iso(-1.5, 0, 22);
  const [ra, ray] = iso(1.5, 0, 22);
  g.moveTo(la, lay); g.lineTo(ra, ray);
  g.stroke({ color: COL_CYAN, alpha: 0.4, width: 0.8 / u });
  const [fa, fay] = iso(0, -1.5, 22);
  const [ba, bay] = iso(0, 1.5, 22);
  g.moveTo(fa, fay); g.lineTo(ba, bay);
  g.stroke({ color: COL_CYAN, alpha: 0.4, width: 0.8 / u });

  // ── ENERGY ORB at spire tip ──
  g.circle(spTop, spTopY, 5 / u);
  g.fill({ color: COL_CYAN, alpha: 0.15 });
  g.circle(spTop, spTopY, 2.5 / u);
  g.fill({ color: COL_CYAN, alpha: 0.5 });
  g.circle(spTop, spTopY, 1 / u);
  g.fill({ color: 0xffffff, alpha: 0.9 });
}

export interface MainframeState {
  container: Container;
  body: Graphics;
}

export function createMainframe(layer: Container): MainframeState {
  const container = new Container();
  container.position.set(MAINFRAME_X, MAINFRAME_Y);
  container.eventMode = 'none';
  layer.addChild(container);

  // Static glow (drawn once, not animated)
  const glow = new Graphics();
  const u = SIZE / 16;
  for (let ring = 5; ring >= 1; ring--) {
    const r = SIZE * (0.3 + ring * 0.15);
    glow.circle(0, 0, r);
    glow.fill({ color: COL_CYAN, alpha: 0.04 });
  }
  container.addChild(glow);

  // Static body
  const body = new Graphics();
  drawBody(body);
  container.addChild(body);

  return { container, body };
}

// updateMainframe removed — animations caused freezing due to Graphics.clear() overhead
