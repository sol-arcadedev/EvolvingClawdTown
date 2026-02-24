import { Container, Graphics } from 'pixi.js';
import {
  CELL_SIZE,
  PLOT_STRIDE,
  PLOT_DISTANCE_MULT,
  TIER_SCALE,
  COL_CYAN,
  COL_RED,
} from './constants';
import { MAINFRAME_X, MAINFRAME_Y } from './mainframe';
import type { WalletState } from '../types';

const drawnHash = new Map<string, string>();
const activeBeams = new Map<string, Graphics>();
const buildingContainers = new Map<string, Container>();

function walletToIndex(address: string): number {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = ((hash << 5) - hash + address.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function walletHash(w: WalletState): string {
  return `${w.houseTier}:${w.buildProgress}:${w.damagePct}:${w.colorHue}`;
}

function plotToWorld(plotX: number, plotY: number) {
  return { x: plotX * PLOT_STRIDE * PLOT_DISTANCE_MULT, y: plotY * PLOT_STRIDE * PLOT_DISTANCE_MULT };
}

function hueToColor(hue: number, s = 0.9, l = 0.55): number {
  const h = ((hue % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return (Math.round((r + m) * 255) << 16) |
         (Math.round((g + m) * 255) << 8) |
         Math.round((b + m) * 255);
}

function dimColor(color: number, factor: number): number {
  const r = Math.round(((color >> 16) & 0xff) * factor);
  const g = Math.round(((color >> 8) & 0xff) * factor);
  const b = Math.round((color & 0xff) * factor);
  return (r << 16) | (g << 8) | b;
}

// ── ISOMETRIC HELPERS ──
// Isometric projection: x goes right-down, y goes left-down, z goes up
// We use a 2:1 ratio (classic pixel art isometric)

const ISO_X = 1.0;    // horizontal scale for x-axis
const ISO_Y = 0.5;    // vertical scale for x/y axes

/** Convert isometric (bx, by, bz) to screen (px, py) */
function iso(bx: number, by: number, bz: number): [number, number] {
  const px = (bx - by) * ISO_X;
  const py = (bx + by) * ISO_Y - bz;
  return [px, py];
}

/** Draw an isometric box (3 visible faces) */
function isoBox(
  g: Graphics,
  ox: number, oy: number, // origin offset
  bw: number, bd: number, bh: number, // box width, depth, height (in iso units)
  topColor: number, leftColor: number, rightColor: number,
  topAlpha = 0.95, leftAlpha = 0.95, rightAlpha = 0.95,
  strokeColor?: number, strokeAlpha = 0.4,
) {
  // 8 corners of the box
  const [x0, y0] = iso(ox, oy, 0);           // front-bottom-left
  const [x1, y1] = iso(ox + bw, oy, 0);      // front-bottom-right
  const [x2, y2] = iso(ox + bw, oy + bd, 0); // back-bottom-right
  const [x3, y3] = iso(ox, oy + bd, 0);       // back-bottom-left
  const [x4, y4] = iso(ox, oy, bh);           // front-top-left
  const [x5, y5] = iso(ox + bw, oy, bh);      // front-top-right
  const [x6, y6] = iso(ox + bw, oy + bd, bh); // back-top-right
  const [x7, y7] = iso(ox, oy + bd, bh);       // back-top-left

  // Top face
  g.poly([x4, y4, x5, y5, x6, y6, x7, y7]);
  g.fill({ color: topColor, alpha: topAlpha });
  if (strokeColor !== undefined) {
    g.poly([x4, y4, x5, y5, x6, y6, x7, y7]);
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 });
  }

  // Left face (front-left)
  g.poly([x0, y0, x3, y3, x7, y7, x4, y4]);
  g.fill({ color: leftColor, alpha: leftAlpha });
  if (strokeColor !== undefined) {
    g.poly([x0, y0, x3, y3, x7, y7, x4, y4]);
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 });
  }

  // Right face (front-right)
  g.poly([x0, y0, x1, y1, x5, y5, x4, y4]);
  g.fill({ color: rightColor, alpha: rightAlpha });
  if (strokeColor !== undefined) {
    g.poly([x0, y0, x1, y1, x5, y5, x4, y4]);
    g.stroke({ color: strokeColor, alpha: strokeAlpha, width: 1 });
  }
}

/** Draw a glowing window on the right face of an iso box */
function isoWindowRight(
  g: Graphics,
  ox: number, oy: number, // box origin
  bw: number, // box width (window is on x=ox+bw face)
  wy: number, wz: number, // window position on the face (in iso units)
  wwd: number, wwh: number, // window width (depth), height
  color: number, alpha = 0.8,
) {
  const [x0, y0] = iso(ox + bw, oy + wy, wz);
  const [x1, y1] = iso(ox + bw, oy + wy, wz + wwh);
  const [x2, y2] = iso(ox + bw, oy + wy + wwd, wz + wwh);
  const [x3, y3] = iso(ox + bw, oy + wy + wwd, wz);
  // Outer glow (wider, softer)
  const glowPad = 0.5;
  const [gx0, gy0] = iso(ox + bw, oy + wy - glowPad, wz - glowPad);
  const [gx1, gy1] = iso(ox + bw, oy + wy - glowPad, wz + wwh + glowPad);
  const [gx2, gy2] = iso(ox + bw, oy + wy + wwd + glowPad, wz + wwh + glowPad);
  const [gx3, gy3] = iso(ox + bw, oy + wy + wwd + glowPad, wz - glowPad);
  g.poly([gx0, gy0, gx1, gy1, gx2, gy2, gx3, gy3]);
  g.fill({ color, alpha: alpha * 0.08 });
  // Inner glow
  g.poly([x0, y0, x1, y1, x2, y2, x3, y3]);
  g.fill({ color, alpha: alpha * 0.2 });
  // Window fill
  const inset = 0.3;
  const [ix0, iy0] = iso(ox + bw, oy + wy + inset, wz + inset);
  const [ix1, iy1] = iso(ox + bw, oy + wy + inset, wz + wwh - inset);
  const [ix2, iy2] = iso(ox + bw, oy + wy + wwd - inset, wz + wwh - inset);
  const [ix3, iy3] = iso(ox + bw, oy + wy + wwd - inset, wz + inset);
  g.poly([ix0, iy0, ix1, iy1, ix2, iy2, ix3, iy3]);
  g.fill({ color, alpha });
}

/** Draw a glowing window on the left face */
function isoWindowLeft(
  g: Graphics,
  ox: number, oy: number, bd: number, // box origin + depth (window on y=oy+bd face)
  wx: number, wz: number, // window position
  wwd: number, wwh: number,
  color: number, alpha = 0.8,
) {
  const [x0, y0] = iso(ox + wx, oy + bd, wz);
  const [x1, y1] = iso(ox + wx, oy + bd, wz + wwh);
  const [x2, y2] = iso(ox + wx + wwd, oy + bd, wz + wwh);
  const [x3, y3] = iso(ox + wx + wwd, oy + bd, wz);
  // Outer glow
  const glowPad = 0.5;
  const [gx0, gy0] = iso(ox + wx - glowPad, oy + bd, wz - glowPad);
  const [gx1, gy1] = iso(ox + wx - glowPad, oy + bd, wz + wwh + glowPad);
  const [gx2, gy2] = iso(ox + wx + wwd + glowPad, oy + bd, wz + wwh + glowPad);
  const [gx3, gy3] = iso(ox + wx + wwd + glowPad, oy + bd, wz - glowPad);
  g.poly([gx0, gy0, gx1, gy1, gx2, gy2, gx3, gy3]);
  g.fill({ color, alpha: alpha * 0.08 });
  // Inner glow
  g.poly([x0, y0, x1, y1, x2, y2, x3, y3]);
  g.fill({ color, alpha: alpha * 0.2 });
  // Window fill
  const inset = 0.3;
  const [ix0, iy0] = iso(ox + wx + inset, oy + bd, wz + inset);
  const [ix1, iy1] = iso(ox + wx + inset, oy + bd, wz + wwh - inset);
  const [ix2, iy2] = iso(ox + wx + wwd - inset, oy + bd, wz + wwh - inset);
  const [ix3, iy3] = iso(ox + wx + wwd - inset, oy + bd, wz + inset);
  g.poly([ix0, iy0, ix1, iy1, ix2, iy2, ix3, iy3]);
  g.fill({ color, alpha });
}

// ── TIER DRAWING FUNCTIONS ──
// scale = available width in pixels. We'll derive iso unit size from it.

function drawTier1(g: Graphics, scale: number, accent: number, variant: number) {
  const u = scale / 6; // iso unit
  const bw = 4, bd = 4, bh = 3;
  const ox = -bw / 2, oy = -bd / 2;

  const top = 0x1a2030;
  const left = 0x0f1620;
  const right = 0x141c28;

  g.scale.set(u);

  isoBox(g, ox, oy, bw, bd, bh, top, left, right, 0.95, 0.95, 0.95, accent, 0.3);

  // Windows — 1 per face
  isoWindowRight(g, ox, oy, bw, 1.2, 0.8, 1.5, 1.5, accent, 0.7);
  isoWindowLeft(g, ox, oy, bd, 1.2, 0.8, 1.5, 1.5, accent, 0.6);

  if (variant === 0) {
    // Rooftop antenna
    const [ax, ay] = iso(ox + bw / 2, oy + bd / 2, bh);
    const [atx, aty] = iso(ox + bw / 2, oy + bd / 2, bh + 2);
    g.moveTo(ax, ay); g.lineTo(atx, aty);
    g.stroke({ color: accent, alpha: 0.6, width: 1 });
    g.circle(atx, aty, 1.5 / u);
    g.fill({ color: accent, alpha: 0.8 });
  } else {
    // Rooftop box (AC unit)
    isoBox(g, ox + 0.5, oy + 0.5, 1.5, 1.5, 0.8,
      dimColor(accent, 0.3), dimColor(accent, 0.2), dimColor(accent, 0.25),
      0.6, 0.6, 0.6);
  }

  // Door
  const [dx0, dy0] = iso(ox + bw, oy + 1.5, 0);
  const [dx1, dy1] = iso(ox + bw, oy + 1.5, 1.5);
  const [dx2, dy2] = iso(ox + bw, oy + 2.5, 1.5);
  const [dx3, dy3] = iso(ox + bw, oy + 2.5, 0);
  g.poly([dx0, dy0, dx1, dy1, dx2, dy2, dx3, dy3]);
  g.fill({ color: accent, alpha: 0.15 });
}

function drawTier2(g: Graphics, scale: number, accent: number, variant: number) {
  const u = scale / 8;
  const bw = 5, bd = 5, bh = 6;
  const ox = -bw / 2, oy = -bd / 2;

  const top = 0x1c2233;
  const left = 0x101822;
  const right = 0x151d2a;

  g.scale.set(u);

  isoBox(g, ox, oy, bw, bd, bh, top, left, right, 0.95, 0.95, 0.95, accent, 0.25);

  // Windows — 2 rows, 2 per face
  for (let row = 0; row < 2; row++) {
    const wz = 1.0 + row * 2.5;
    isoWindowRight(g, ox, oy, bw, 0.6, wz, 1.2, 1.2, accent, row === 0 ? 0.8 : 0.4);
    isoWindowRight(g, ox, oy, bw, 2.8, wz, 1.2, 1.2, accent, row === 1 ? 0.7 : 0.3);
    isoWindowLeft(g, ox, oy, bd, 0.8, wz, 1.2, 1.2, accent, row === 1 ? 0.8 : 0.35);
    isoWindowLeft(g, ox, oy, bd, 2.8, wz, 1.2, 1.2, accent, row === 0 ? 0.6 : 0.25);
  }

  // Neon stripe between floors
  const [s0, s0y] = iso(ox, oy, 3.5);
  const [s1, s1y] = iso(ox + bw, oy, 3.5);
  const [s2, s2y] = iso(ox + bw, oy + bd, 3.5);
  g.moveTo(s0, s0y); g.lineTo(s1, s1y); g.lineTo(s2, s2y);
  g.stroke({ color: accent, alpha: 0.5, width: 1.2 / u });

  // Antenna
  const [ax, ay] = iso(ox + bw * 0.7, oy + bd * 0.3, bh);
  const [atx, aty] = iso(ox + bw * 0.7, oy + bd * 0.3, bh + 3);
  g.moveTo(ax, ay); g.lineTo(atx, aty);
  g.stroke({ color: accent, alpha: 0.5, width: 0.8 / u });
  g.circle(atx, aty, 1.2 / u);
  g.fill({ color: accent, alpha: 0.8 });

  if (variant === 1) {
    // Side sign
    const signColor = hueToColor((accent + 60) % 360);
    const [sg0, sg0y] = iso(ox + bw, oy - 0.3, bh - 1);
    const [sg1, sg1y] = iso(ox + bw, oy - 0.3, bh - 0.2);
    const [sg2, sg2y] = iso(ox + bw, oy + 1.5, bh - 0.2);
    const [sg3, sg3y] = iso(ox + bw, oy + 1.5, bh - 1);
    g.poly([sg0, sg0y, sg1, sg1y, sg2, sg2y, sg3, sg3y]);
    g.fill({ color: signColor, alpha: 0.6 });
  }
}

function drawTier3(g: Graphics, scale: number, accent: number, variant: number) {
  const u = scale / 10;
  const ox = -3, oy = -3;

  const top = 0x1e2538;
  const left = 0x111a25;
  const right = 0x171f2c;

  g.scale.set(u);

  // Lower wider section
  isoBox(g, ox, oy, 6, 6, 4, top, left, right, 0.95, 0.95, 0.95, accent, 0.2);

  // Upper narrower section
  isoBox(g, ox + 0.8, oy + 0.8, 4.4, 4.4, 5,
    dimColor(top, 1.1), dimColor(left, 1.1), dimColor(right, 1.1),
    0.9, 0.9, 0.9, accent, 0.3);

  // Windows on lower — right face
  for (let i = 0; i < 3; i++) {
    isoWindowRight(g, ox, oy, 6, 0.6 + i * 1.8, 0.8, 1.0, 1.5,
      accent, (i + variant) % 2 === 0 ? 0.8 : 0.25);
  }
  // Windows on lower — left face
  for (let i = 0; i < 3; i++) {
    isoWindowLeft(g, ox, oy, 6, 0.8 + i * 1.7, 0.8, 1.0, 1.5,
      accent, (i + variant) % 2 === 1 ? 0.7 : 0.2);
  }

  // Windows on upper
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 2; col++) {
      isoWindowRight(g, ox + 0.8, oy + 0.8, 4.4,
        0.5 + col * 2.0, 4.5 + row * 2.0, 1.0, 1.2,
        accent, (row + col) % 2 === 0 ? 0.7 : 0.2);
    }
  }

  // Neon divider line
  const [d0, d0y] = iso(ox - 0.3, oy, 4);
  const [d1, d1y] = iso(ox + 6.3, oy, 4);
  const [d2, d2y] = iso(ox + 6.3, oy + 6, 4);
  g.moveTo(d0, d0y); g.lineTo(d1, d1y); g.lineTo(d2, d2y);
  g.stroke({ color: accent, alpha: 0.7, width: 1.5 / u });
  // Glow
  g.moveTo(d0, d0y); g.lineTo(d1, d1y); g.lineTo(d2, d2y);
  g.stroke({ color: accent, alpha: 0.15, width: 4 / u });

  // Rooftop details
  isoBox(g, ox + 1.5, oy + 1.5, 1.2, 1.2, 0.6,
    dimColor(accent, 0.3), dimColor(accent, 0.2), dimColor(accent, 0.25), 0.5, 0.5, 0.5);

  // Antenna
  const [ax, ay] = iso(ox + 3, oy + 3, 9);
  const [atx, aty] = iso(ox + 3, oy + 3, 11.5);
  g.moveTo(ax, ay); g.lineTo(atx, aty);
  g.stroke({ color: accent, alpha: 0.5, width: 0.8 / u });
  g.circle(atx, aty, 1.5 / u);
  g.fill({ color: accent, alpha: 0.4 });
  g.circle(atx, aty, 0.8 / u);
  g.fill({ color: accent, alpha: 0.9 });
}

function drawTier4(g: Graphics, scale: number, accent: number, variant: number) {
  const u = scale / 12;
  const ox = -3.5, oy = -3.5;
  const accent2 = hueToColor(((variant * 90) + 180) % 360, 0.7, 0.5);

  const top = 0x1a2235;
  const left = 0x0e1620;
  const right = 0x141c28;

  g.scale.set(u);

  // Main tall tower
  isoBox(g, ox + 1, oy + 1, 5, 5, 14, top, left, right, 0.95, 0.95, 0.95, accent, 0.2);

  // Side wing left
  isoBox(g, ox - 1.5, oy + 1.5, 2.5, 4, 7,
    dimColor(top, 0.9), dimColor(left, 0.9), dimColor(right, 0.9),
    0.9, 0.9, 0.9, accent, 0.15);

  // Side wing right
  isoBox(g, ox + 5, oy + 2, 2, 3, 5,
    dimColor(top, 0.85), dimColor(left, 0.85), dimColor(right, 0.85),
    0.85, 0.85, 0.85, accent2, 0.15);

  // Windows on main tower — right face, 4 cols x 6 rows
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 2; c++) {
      isoWindowRight(g, ox + 1, oy + 1, 5,
        0.5 + c * 2.2, 1.0 + r * 2.0, 1.0, 1.0,
        (r + c) % 3 === 0 ? accent : accent2,
        (r + c + variant) % 3 === 0 ? 0.8 : 0.15);
    }
  }
  // Windows — left face
  for (let r = 0; r < 6; r++) {
    for (let c = 0; c < 2; c++) {
      isoWindowLeft(g, ox + 1, oy + 1, 5,
        0.5 + c * 2.2, 1.0 + r * 2.0, 1.0, 1.0,
        (r + c) % 2 === 0 ? accent : accent2,
        (r + c + variant) % 4 === 0 ? 0.7 : 0.12);
    }
  }

  // Accent stripes every 4 units
  for (let stripe = 1; stripe <= 3; stripe++) {
    const sz = stripe * 4;
    const [s0, s0y] = iso(ox + 0.7, oy + 1, sz);
    const [s1, s1y] = iso(ox + 6.3, oy + 1, sz);
    const [s2, s2y] = iso(ox + 6.3, oy + 6, sz);
    g.moveTo(s0, s0y); g.lineTo(s1, s1y); g.lineTo(s2, s2y);
    g.stroke({ color: accent, alpha: 0.5, width: 1 / u });
  }

  // Side wing windows
  for (let r = 0; r < 3; r++) {
    isoWindowRight(g, ox - 1.5, oy + 1.5, 2.5, 1.0, 1 + r * 2, 1.2, 1.0, accent, r % 2 === 0 ? 0.6 : 0.2);
  }

  // Antenna array
  const antennas = [[3.5, 3.5], [2.5, 2], [5, 4]];
  for (let i = 0; i < 3; i++) {
    const [axp, ayp] = antennas[i];
    const [ax, ay] = iso(ox + axp, oy + ayp, 14);
    const ah = 2 + i * 1.2;
    const [atx, aty] = iso(ox + axp, oy + ayp, 14 + ah);
    g.moveTo(ax, ay); g.lineTo(atx, aty);
    g.stroke({ color: accent, alpha: 0.4, width: 0.7 / u });
    if (i === 0) {
      g.circle(atx, aty, 1.5 / u);
      g.fill({ color: accent, alpha: 0.7 });
    }
  }

  // Base glow line
  const [b0, b0y] = iso(ox - 2, oy + 1, 0);
  const [b1, b1y] = iso(ox + 7, oy + 1, 0);
  g.moveTo(b0, b0y); g.lineTo(b1, b1y);
  g.stroke({ color: accent, alpha: 0.2, width: 3 / u });
}

function drawTier5(g: Graphics, scale: number, accent: number, variant: number) {
  const u = scale / 14;
  const ox = -4, oy = -4;
  const accent2 = hueToColor(((variant * 120) + 150) % 360, 0.8, 0.5);

  const top = 0x1c2438;
  const left = 0x0d1520;
  const right = 0x151e2c;
  const topLt = 0x222a3e;

  g.scale.set(u);

  // Base platform
  isoBox(g, ox - 0.5, oy - 0.5, 9, 9, 1,
    dimColor(top, 0.8), dimColor(left, 0.8), dimColor(right, 0.8),
    0.9, 0.9, 0.9, accent, 0.3);

  // Lower section (widest)
  isoBox(g, ox, oy, 8, 8, 6, top, left, right, 0.95, 0.95, 0.95, accent, 0.2);

  // Middle section (setback)
  isoBox(g, ox + 1.2, oy + 1.2, 5.6, 5.6, 6,
    topLt, dimColor(left, 1.1), dimColor(right, 1.1),
    0.92, 0.92, 0.92, accent, 0.25);

  // Upper section (narrow tower)
  isoBox(g, ox + 2.2, oy + 2.2, 3.6, 3.6, 6,
    top, left, right, 0.9, 0.9, 0.9, accent, 0.3);

  // Crown
  isoBox(g, ox + 2.8, oy + 2.8, 2.4, 2.4, 1.5,
    dimColor(accent, 0.4), dimColor(accent, 0.25), dimColor(accent, 0.3),
    0.8, 0.8, 0.8, accent, 0.5);

  // Dense windows on each section
  // Lower section
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      const wc = (r + c + variant) % 3 === 0 ? accent : ((r + c) % 4 === 0 ? accent2 : accent);
      const wa = (r + c + variant) % 3 === 0 ? 0.8 : 0.12;
      isoWindowRight(g, ox, oy, 8, 0.5 + c * 1.8, 1.2 + r * 1.6, 0.9, 1.0, wc, wa);
      isoWindowLeft(g, ox, oy, 8, 0.5 + c * 1.8, 1.2 + r * 1.6, 0.9, 1.0, wc, wa * 0.8);
    }
  }

  // Middle section
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const wc = (r + c) % 2 === 0 ? accent : accent2;
      const wa = (r + c + variant) % 2 === 0 ? 0.7 : 0.15;
      isoWindowRight(g, ox + 1.2, oy + 1.2, 5.6, 0.8 + c * 2.5, 7.2 + r * 1.8, 1.0, 1.0, wc, wa);
      isoWindowLeft(g, ox + 1.2, oy + 1.2, 5.6, 0.8 + c * 2.5, 7.2 + r * 1.8, 1.0, 1.0, wc, wa * 0.8);
    }
  }

  // Upper section
  for (let r = 0; r < 2; r++) {
    isoWindowRight(g, ox + 2.2, oy + 2.2, 3.6, 0.8, 13.5 + r * 2.2, 1.2, 1.2, accent, r === 0 ? 0.8 : 0.3);
    isoWindowLeft(g, ox + 2.2, oy + 2.2, 3.6, 0.8, 13.5 + r * 2.2, 1.2, 1.2, accent2, r === 1 ? 0.7 : 0.2);
  }

  // Neon divider lines between sections
  const dividers = [7, 13, 19];
  for (const dz of dividers) {
    const sect = dz === 7 ? [ox - 0.3, 8.6] : dz === 13 ? [ox + 0.9, 6.2] : [ox + 1.9, 4.2];
    const [d0, d0y] = iso(sect[0], oy, dz);
    const [d1, d1y] = iso(sect[0] + sect[1], oy, dz);
    const [d2, d2y] = iso(sect[0] + sect[1], oy + 8, dz);
    g.moveTo(d0, d0y); g.lineTo(d1, d1y); g.lineTo(d2, d2y);
    g.stroke({ color: accent, alpha: 0.6, width: 1.2 / u });
    g.moveTo(d0, d0y); g.lineTo(d1, d1y); g.lineTo(d2, d2y);
    g.stroke({ color: accent, alpha: 0.12, width: 4 / u });
  }

  // Spire
  const [sx, sy] = iso(ox + 4, oy + 4, 20.5);
  const [stx, sty] = iso(ox + 4, oy + 4, 25);
  g.moveTo(sx, sy); g.lineTo(stx, sty);
  g.stroke({ color: accent, alpha: 0.6, width: 1.2 / u });

  // Energy orb at top
  g.circle(stx, sty, 3 / u);
  g.fill({ color: accent, alpha: 0.2 });
  g.circle(stx, sty, 1.5 / u);
  g.fill({ color: accent, alpha: 0.6 });
  g.circle(stx, sty, 0.6 / u);
  g.fill({ color: 0xffffff, alpha: 0.9 });

  // Side antenna fins
  const [la, lay] = iso(ox + 2.5, oy + 2.5, 20.5);
  const [lat, laty] = iso(ox + 1.5, oy + 1.5, 23);
  g.moveTo(la, lay); g.lineTo(lat, laty);
  g.stroke({ color: accent2, alpha: 0.35, width: 0.8 / u });
  const [ra, ray] = iso(ox + 5.5, oy + 5.5, 20.5);
  const [rat, raty] = iso(ox + 6.5, oy + 6.5, 23);
  g.moveTo(ra, ray); g.lineTo(rat, raty);
  g.stroke({ color: accent2, alpha: 0.35, width: 0.8 / u });
}

const TIER_DRAWERS = [
  () => {},
  drawTier1,
  drawTier2,
  drawTier3,
  drawTier4,
  drawTier5,
];

// ── OVERLAYS ──

function drawConstructionOverlay(container: Container, w: number, h: number, progress: number, accent: number) {
  const g = new Graphics();
  g.rect(-w / 2, -h, w, h);
  g.stroke({ color: accent, alpha: 0.35, width: 1 });
  for (let i = 0; i < 4; i++) {
    const yNorm = (i + (Date.now() / 600) % 1) / 4;
    if (yNorm > 1) continue;
    g.moveTo(-w / 2, -h * yNorm);
    g.lineTo(w / 2, -h * yNorm);
    g.stroke({ color: accent, alpha: 0.2, width: 0.5 });
  }
  const barW = w * 0.7;
  g.rect(-barW / 2, 6, barW, 3);
  g.fill({ color: 0x111111, alpha: 0.8 });
  g.rect(-barW / 2, 6, barW * (progress / 100), 3);
  g.fill({ color: accent, alpha: 0.8 });
  container.addChild(g);
}

function drawDamageOverlay(container: Container, w: number, h: number, damagePct: number) {
  if (damagePct <= 0) return;
  const g = new Graphics();
  const a = Math.min(damagePct / 100, 0.5);
  g.rect(-w / 2, -h, w, h);
  g.fill({ color: COL_RED, alpha: a * 0.3 });
  if (damagePct > 30) {
    const cracks = Math.floor(damagePct / 15);
    for (let i = 0; i < cracks; i++) {
      const cx = -w / 2 + w * (0.2 + 0.6 * Math.sin(i * 2.7));
      const cy = -h * (0.2 + 0.5 * Math.cos(i * 3.1));
      g.moveTo(cx, cy);
      g.lineTo(cx + 8 * Math.sin(i), cy + 12);
      g.stroke({ color: COL_RED, alpha: 0.5, width: 1 });
    }
  }
  container.addChild(g);
}

// ── PUBLIC API ──

export async function loadBuildingTextures(): Promise<void> {}

export function syncBuildings(
  layer: Container,
  beamLayer: Container,
  wallets: Map<string, WalletState>,
) {
  for (const [addr, container] of buildingContainers) {
    if (!wallets.has(addr)) {
      layer.removeChild(container); container.destroy({ children: true });
      buildingContainers.delete(addr); drawnHash.delete(addr);
      const beam = activeBeams.get(addr);
      if (beam) { beamLayer.removeChild(beam); beam.destroy(); activeBeams.delete(addr); }
    }
  }

  for (const [addr, w] of wallets) {
    if (w.tokenBalance === '0' || (w.tokenBalance && BigInt(w.tokenBalance) <= 0n)) {
      if (buildingContainers.has(addr)) {
        const c = buildingContainers.get(addr)!;
        layer.removeChild(c); c.destroy({ children: true });
        buildingContainers.delete(addr); drawnHash.delete(addr);
        const beam = activeBeams.get(addr);
        if (beam) { beamLayer.removeChild(beam); beam.destroy(); activeBeams.delete(addr); }
      }
      continue;
    }

    const hash = walletHash(w);
    if (drawnHash.get(addr) === hash) continue;

    let container = buildingContainers.get(addr);
    if (container) { layer.removeChild(container); container.destroy({ children: true }); }

    container = new Container();
    buildingContainers.set(addr, container);
    layer.addChild(container);

    const world = plotToWorld(w.plotX, w.plotY);
    container.position.set(world.x, world.y);

    const tier = Math.min(w.houseTier, 5);
    const accent = hueToColor(w.colorHue);
    const variant = walletToIndex(addr) % 2;
    const drawW = PLOT_STRIDE * (TIER_SCALE[tier] ?? 0.5);

    if (tier === 0) {
      const g = new Graphics();
      // Subtle tiny dot — no big green circles
      g.circle(0, 0, 1.5);
      g.fill({ color: accent, alpha: 0.08 });
      g.circle(0, 0, 0.7);
      g.fill({ color: accent, alpha: 0.25 });
      container.addChild(g);
    } else {
      const gfx = new Graphics();

      if (w.buildProgress < 100) {
        gfx.alpha = 0.25;
        TIER_DRAWERS[tier](gfx, drawW, accent, variant);
        container.addChild(gfx);
        const approxH = drawW * [0, 0.5, 0.7, 1.0, 1.4, 1.8][tier];
        drawConstructionOverlay(container, drawW * 0.8, approxH, w.buildProgress, accent);
      } else {
        TIER_DRAWERS[tier](gfx, drawW, accent, variant);
        container.addChild(gfx);

        // Building glow underneath — scaled by tier
        const glowG = new Graphics();
        const glowConfig = [
          null,                                     // tier 0 — no glow
          { alpha: 0.03, radius: 0.4 },             // tier 1
          { alpha: 0.05, radius: 0.5 },             // tier 2
          { alpha: 0.08, radius: 0.6 },             // tier 3
          { alpha: 0.12, radius: 0.7 },             // tier 4
          { alpha: 0.18, radius: 0.85 },            // tier 5
        ][tier] ?? { alpha: 0.03, radius: 0.4 };
        if (glowConfig) {
          const glowR = drawW * glowConfig.radius;
          glowG.circle(0, 0, glowR);
          glowG.fill({ color: accent, alpha: glowConfig.alpha });
          glowG.circle(0, 0, glowR * 0.6);
          glowG.fill({ color: accent, alpha: glowConfig.alpha * 1.3 });
          glowG.circle(0, 0, glowR * 0.3);
          glowG.fill({ color: accent, alpha: glowConfig.alpha * 0.8 });
          if (tier === 5) {
            // Extra outer ring for megastructures
            glowG.circle(0, 0, glowR * 1.3);
            glowG.fill({ color: accent, alpha: 0.06 });
          }
        }
        container.addChildAt(glowG, 0); // behind building

        if (w.damagePct > 0) {
          const approxH = drawW * [0, 0.5, 0.7, 1.0, 1.4, 1.8][tier];
          drawDamageOverlay(container, drawW * 0.8, approxH, w.damagePct);
          if (w.damagePct > 50) gfx.alpha = 0.6 + Math.random() * 0.4;
        }
      }
    }

    // Beams — all buildings connected to mainframe like a network
    const needsBeam = tier > 0;
    const hasBeam = activeBeams.has(addr);
    if (needsBeam && !hasBeam) {
      const beamGfx = new Graphics();
      beamLayer.addChild(beamGfx);
      activeBeams.set(addr, beamGfx);
    } else if (!needsBeam && hasBeam) {
      const beam = activeBeams.get(addr)!;
      beamLayer.removeChild(beam); beam.destroy(); activeBeams.delete(addr);
    }
    if (activeBeams.has(addr)) {
      const beam = activeBeams.get(addr)!;
      const bw = plotToWorld(w.plotX, w.plotY);
      (beam as any).__targetX = bw.x;
      (beam as any).__targetY = bw.y;
      (beam as any).__tier = tier;
    }

    drawnHash.set(addr, hash);
  }
}

/** Draw a dashed line along a multi-segment path with flowing animation */
function drawDashedPath(
  g: Graphics, path: { x: number; y: number }[], frame: number,
  dashLen: number, gapLen: number, speed: number,
) {
  // Calculate total path length and segment distances
  const segments: { sx: number; sy: number; ex: number; ey: number; len: number; cumLen: number }[] = [];
  let totalLen = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const sx = path[i].x, sy = path[i].y;
    const ex = path[i + 1].x, ey = path[i + 1].y;
    const len = Math.sqrt((ex - sx) ** 2 + (ey - sy) ** 2);
    segments.push({ sx, sy, ex, ey, len, cumLen: totalLen });
    totalLen += len;
  }
  if (totalLen < 1) return;

  /** Get point at distance d along the path */
  function pointAt(d: number): { x: number; y: number } {
    for (const seg of segments) {
      if (d <= seg.cumLen + seg.len) {
        const t = (d - seg.cumLen) / seg.len;
        return { x: seg.sx + (seg.ex - seg.sx) * t, y: seg.sy + (seg.ey - seg.sy) * t };
      }
    }
    const last = path[path.length - 1];
    return { x: last.x, y: last.y };
  }

  const segLen = dashLen + gapLen;
  const startOff = (frame * speed) % segLen;
  let pos = -startOff;

  while (pos < totalLen) {
    const segStart = Math.max(pos, 0);
    const segEnd = Math.min(pos + dashLen, totalLen);
    if (segStart < segEnd) {
      // Draw this dash — it may cross path segment boundaries, so subdivide
      const stepSize = 4; // pixel steps for smooth corners
      let first = true;
      for (let d = segStart; d <= segEnd; d += stepSize) {
        const dd = Math.min(d, segEnd);
        const p = pointAt(dd);
        if (first) { g.moveTo(p.x, p.y); first = false; }
        else g.lineTo(p.x, p.y);
      }
      // Ensure we hit the exact end
      const pEnd = pointAt(segEnd);
      g.lineTo(pEnd.x, pEnd.y);

      const alpha = 0.8 - (segStart / totalLen) * 0.35;
      // Glow layer (wide, soft)
      g.stroke({ color: COL_CYAN, alpha: alpha * 0.25, width: 6 });
      // Core dash
      g.stroke({ color: COL_CYAN, alpha, width: 3 });
    }
    pos += segLen;
  }
}

export function updateBeams(frame: number) {
  for (const beam of activeBeams.values()) {
    const g = beam; g.clear();
    const tx = (beam as any).__targetX as number;
    const ty = (beam as any).__targetY as number;
    const beamTier = (beam as any).__tier as number || 1;
    if (tx === undefined) continue;

    const sx = MAINFRAME_X, sy = MAINFRAME_Y;

    // Build an L-shaped grid-following path (circuit board trace style)
    const dx = Math.abs(tx - sx), dy = Math.abs(ty - sy);
    let path: { x: number; y: number }[];

    if (dx >= dy) {
      path = [
        { x: sx, y: sy },
        { x: tx, y: sy },
        { x: tx, y: ty },
      ];
    } else {
      path = [
        { x: sx, y: sy },
        { x: sx, y: ty },
        { x: tx, y: ty },
      ];
    }

    // Steady trace line (always visible, like a PCB trace)
    // Outer glow
    for (let i = 0; i < path.length - 1; i++) {
      g.moveTo(path[i].x, path[i].y);
      g.lineTo(path[i + 1].x, path[i + 1].y);
    }
    g.stroke({ color: COL_CYAN, alpha: 0.06, width: 8 });
    // Core trace
    for (let i = 0; i < path.length - 1; i++) {
      g.moveTo(path[i].x, path[i].y);
      g.lineTo(path[i + 1].x, path[i + 1].y);
    }
    g.stroke({ color: COL_CYAN, alpha: 0.18, width: 2.5 });

    // Animated dashed flow on top
    drawDashedPath(g, path, frame, 12, 8, 2);

    // Circuit node at corner bend
    const corner = path[1];
    g.circle(corner.x, corner.y, 5);
    g.fill({ color: COL_CYAN, alpha: 0.1 });
    g.circle(corner.x, corner.y, 3);
    g.fill({ color: COL_CYAN, alpha: 0.25 });
    g.circle(corner.x, corner.y, 1.5);
    g.fill({ color: COL_CYAN, alpha: 0.5 });

    // Circuit node at building endpoint
    g.circle(tx, ty, 6);
    g.fill({ color: COL_CYAN, alpha: 0.08 });
    g.circle(tx, ty, 3.5);
    g.fill({ color: COL_CYAN, alpha: 0.2 });
    g.circle(tx, ty, 1.8);
    g.fill({ color: COL_CYAN, alpha: 0.5 });
  }
}
