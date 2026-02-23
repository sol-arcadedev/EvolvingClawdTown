// ═══════════════════════════════════════════════════════════════════
// PlotRenderer — Vacant lots, occupied foundations, landmarks
// ═══════════════════════════════════════════════════════════════════

import { Graphics } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import {
  RANGE, hash, modulateColor,
  getPlotMeta, getNeighborhoodPalette, isReservedPlot,
  LANDMARKS, type Landmark, RESERVED_PLOT_SET,
} from '../CityLayout';

// ── 6 Vacant lot variants ──

function drawVacantLot(g: Graphics, px: number, py: number, variant: number): void {
  const meta = getPlotMeta(px, py);
  const pal = getNeighborhoodPalette(meta.neighborhood);
  const streetW = meta.streetWidthW;
  const streetH = meta.streetWidthN;
  const ox = meta.visualOffsetX + meta.rowStagger;
  const oy = meta.visualOffsetY;
  const x = px * PLOT_W + streetW / 2 + ox;
  const y = py * PLOT_H + streetH / 2 + oy;
  const w = PLOT_W - streetW;
  const h = PLOT_H - streetH;

  // All variants share a darker base than occupied plots
  const baseColor = modulateColor(pal.groundColor, 0.8);

  switch (variant) {
    case 0: drawPavedLot(g, x, y, w, h, baseColor, pal.accentColor, px, py); break;
    case 1: drawConstructionSite(g, x, y, w, h, baseColor, pal.accentColor, px, py); break;
    case 2: drawParkingLot(g, x, y, w, h, baseColor, pal.accentColor, px, py); break;
    case 3: drawUrbanGarden(g, x, y, w, h, baseColor, px, py); break;
    case 4: drawDemolishedSite(g, x, y, w, h, baseColor, px, py); break;
    case 5: drawUtilityLot(g, x, y, w, h, baseColor, pal.accentColor, px, py); break;
  }
}

function drawPavedLot(g: Graphics, x: number, y: number, w: number, h: number, base: number, accent: number, px: number, py: number): void {
  // Cracked concrete
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: modulateColor(base, 1.2) });

  // Oil stains
  for (let i = 0; i < 3; i++) {
    const sx = x + 6 + hash(px, py, 6000 + i) * (w - 16);
    const sy = y + 6 + hash(px, py, 6100 + i) * (h - 16);
    const sr = 3 + hash(px, py, 6200 + i) * 4;
    g.ellipse(sx, sy, sr * 1.5, sr);
    g.fill({ color: 0x0a0a10, alpha: 0.3 });
  }

  // Cracks
  for (let c = 0; c < 4; c++) {
    const cx0 = x + 4 + hash(px, py, 6300 + c) * (w - 8);
    const cy0 = y + 4 + hash(px, py, 6400 + c) * (h - 8);
    const cx1 = cx0 + (hash(px, py, 6500 + c) - 0.5) * 20;
    const cy1 = cy0 + (hash(px, py, 6600 + c) - 0.5) * 20;
    g.moveTo(cx0, cy0);
    g.lineTo(cx1, cy1);
    g.stroke({ color: modulateColor(base, 0.5), width: 1, alpha: 0.25 });
  }

  // Chain-link fence border (dashed)
  for (let fx = 0; fx < w; fx += 4) {
    g.rect(x + fx, y, 2, 1);
    g.fill({ color: 0x444458, alpha: 0.3 });
    g.rect(x + fx, y + h - 1, 2, 1);
    g.fill({ color: 0x444458, alpha: 0.3 });
  }

  // "FOR LEASE" sign
  const signX = x + w / 2 - 8;
  const signY = y + 4;
  g.rect(signX, signY, 16, 8);
  g.fill({ color: 0x222240, alpha: 0.7 });
  g.rect(signX, signY, 16, 1);
  g.fill({ color: accent, alpha: 0.3 });
}

function drawConstructionSite(g: Graphics, x: number, y: number, w: number, h: number, base: number, accent: number, px: number, py: number): void {
  // Dirt/gravel base
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: 0x1a1810 });

  // Gravel texture
  for (let d = 0; d < 12; d++) {
    const dx = x + 4 + hash(px, py, 6700 + d) * (w - 8);
    const dy = y + 4 + hash(px, py, 6800 + d) * (h - 8);
    g.rect(dx, dy, 2, 1);
    g.fill({ color: hash(px, py, 6900 + d) < 0.5 ? 0x2a2820 : 0x181610, alpha: 0.4 });
  }

  // Dashed building outline
  const pad = 8;
  for (let fx = pad; fx < w - pad; fx += 6) {
    g.rect(x + fx, y + pad, 3, 1);
    g.fill({ color: accent, alpha: 0.2 });
    g.rect(x + fx, y + h - pad, 3, 1);
    g.fill({ color: accent, alpha: 0.2 });
  }
  for (let fy = pad; fy < h - pad; fy += 6) {
    g.rect(x + pad, y + fy, 1, 3);
    g.fill({ color: accent, alpha: 0.2 });
    g.rect(x + w - pad, y + fy, 1, 3);
    g.fill({ color: accent, alpha: 0.2 });
  }

  // Material piles
  for (let m = 0; m < 2; m++) {
    const mx = x + 6 + hash(px, py, 7000 + m) * (w - 20);
    const my = y + h - 20 + hash(px, py, 7100 + m) * 8;
    const mw = 8 + hash(px, py, 7200 + m) * 6;
    const mh = 4 + hash(px, py, 7300 + m) * 3;
    g.rect(mx, my, mw, mh);
    g.fill({ color: 0x2a2a22, alpha: 0.6 });
    g.rect(mx, my, mw, 1);
    g.fill({ color: 0x3a3a30, alpha: 0.4 });
  }

  // Caution tape corners
  g.rect(x, y, 8, 2);
  g.fill({ color: 0xffaa00, alpha: 0.3 });
  g.rect(x, y, 2, 8);
  g.fill({ color: 0xffaa00, alpha: 0.3 });
  g.rect(x + w - 8, y, 8, 2);
  g.fill({ color: 0xffaa00, alpha: 0.3 });
  g.rect(x + w - 2, y, 2, 8);
  g.fill({ color: 0xffaa00, alpha: 0.3 });
}

function drawParkingLot(g: Graphics, x: number, y: number, w: number, h: number, base: number, accent: number, px: number, py: number): void {
  // Asphalt base
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: modulateColor(base, 0.9) });

  // Painted parking space lines
  const spaceW = 16;
  const spaces = Math.floor((w - 8) / spaceW);
  for (let s = 0; s <= spaces; s++) {
    const lx = x + 4 + s * spaceW;
    g.rect(lx, y + h / 2, 1, h / 2 - 4);
    g.fill({ color: 0x444458, alpha: 0.3 });
  }
  // Horizontal line at back of spaces
  g.rect(x + 4, y + h / 2, w - 8, 1);
  g.fill({ color: 0x444458, alpha: 0.25 });

  // A few parked vehicles
  for (let v = 0; v < 2; v++) {
    const vSlot = Math.floor(hash(px, py, 7400 + v) * spaces);
    const vx = x + 4 + vSlot * spaceW + 3;
    const vy = y + h / 2 + 4;
    const vColor = hash(px, py, 7500 + v) < 0.5 ? 0x44aaff : 0xff6666;
    g.rect(vx, vy, spaceW - 6, 10);
    g.fill({ color: vColor, alpha: 0.4 });
    g.rect(vx + 1, vy + 1, spaceW - 8, 8);
    g.fill({ color: modulateColor(vColor, 0.6), alpha: 0.3 });
  }

  // Small booth at entrance
  g.rect(x + 2, y + 2, 6, 8);
  g.fill({ color: 0x2a2a3a, alpha: 0.6 });
  g.rect(x + 2, y + 2, 6, 1);
  g.fill({ color: accent, alpha: 0.2 });
}

function drawUrbanGarden(g: Graphics, x: number, y: number, w: number, h: number, _base: number, px: number, py: number): void {
  // Patchy grass
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: 0x0c2818, alpha: 0.5 });

  // Grass patches
  for (let p = 0; p < 5; p++) {
    const gx = x + 6 + hash(px, py, 7600 + p) * (w - 16);
    const gy = y + 6 + hash(px, py, 7700 + p) * (h - 16);
    const gr = 4 + hash(px, py, 7800 + p) * 6;
    g.circle(gx, gy, gr);
    g.fill({ color: 0x0e3a1c, alpha: 0.3 });
    g.circle(gx, gy, gr * 0.6);
    g.fill({ color: 0x00cc66, alpha: 0.08 });
  }

  // Planter boxes (small rectangles)
  for (let b = 0; b < 2; b++) {
    const bx2 = x + 8 + hash(px, py, 7900 + b) * (w - 24);
    const by2 = y + h / 2 + hash(px, py, 8000 + b) * (h / 3);
    g.rect(bx2, by2, 10, 6);
    g.fill({ color: 0x2a1a10, alpha: 0.5 });
    // Plants in planter
    g.circle(bx2 + 3, by2 - 1, 2);
    g.fill({ color: 0x0a4a18, alpha: 0.4 });
    g.circle(bx2 + 7, by2 - 1, 2);
    g.fill({ color: 0x0a4a18, alpha: 0.4 });
  }

  // Walking path
  const pathY = y + h * 0.4;
  g.rect(x + 4, pathY, w - 8, 3);
  g.fill({ color: 0x1a1a20, alpha: 0.3 });

  // Bench
  g.rect(x + w / 2 - 5, pathY - 3, 10, 3);
  g.fill({ color: 0x2a2220, alpha: 0.5 });
}

function drawDemolishedSite(g: Graphics, x: number, y: number, w: number, h: number, base: number, px: number, py: number): void {
  // Rubble base
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: modulateColor(base, 0.6) });

  // Rubble chunks
  for (let r = 0; r < 8; r++) {
    const rx = x + 4 + hash(px, py, 8100 + r) * (w - 12);
    const ry = y + 4 + hash(px, py, 8200 + r) * (h - 12);
    const rw = 2 + hash(px, py, 8300 + r) * 5;
    const rh = 2 + hash(px, py, 8400 + r) * 3;
    g.rect(rx, ry, rw, rh);
    g.fill({ color: modulateColor(base, 0.8 + hash(px, py, 8500 + r) * 0.6), alpha: 0.5 });
  }

  // Exposed foundation lines
  const foundX = x + w * 0.15;
  const foundY = y + h * 0.2;
  const foundW = w * 0.7;
  const foundH = h * 0.6;
  g.rect(foundX, foundY, foundW, 1);
  g.fill({ color: 0x3a3a48, alpha: 0.3 });
  g.rect(foundX, foundY + foundH, foundW, 1);
  g.fill({ color: 0x3a3a48, alpha: 0.3 });
  g.rect(foundX, foundY, 1, foundH);
  g.fill({ color: 0x3a3a48, alpha: 0.3 });
  g.rect(foundX + foundW, foundY, 1, foundH);
  g.fill({ color: 0x3a3a48, alpha: 0.3 });

  // "KEEP OUT" tape
  g.rect(x, y + 2, w, 2);
  g.fill({ color: 0xff4444, alpha: 0.2 });
  g.rect(x, y + h - 4, w, 2);
  g.fill({ color: 0xff4444, alpha: 0.2 });
}

function drawUtilityLot(g: Graphics, x: number, y: number, w: number, h: number, base: number, accent: number, px: number, py: number): void {
  // Metal grating base
  g.rect(x + 2, y + 2, w - 4, h - 4);
  g.fill({ color: modulateColor(base, 0.85) });

  // Grating lines
  for (let gx = 4; gx < w - 4; gx += 6) {
    g.rect(x + gx, y + 2, 1, h - 4);
    g.fill({ color: 0x2a2a38, alpha: 0.2 });
  }

  // Transformer boxes
  for (let t = 0; t < 2; t++) {
    const tx = x + 8 + hash(px, py, 8600 + t) * (w - 28);
    const ty = y + 8 + hash(px, py, 8700 + t) * (h / 3);
    const tw = 10 + hash(px, py, 8800 + t) * 6;
    const th = 14 + hash(px, py, 8900 + t) * 8;
    // Box
    g.rect(tx, ty, tw, th);
    g.fill({ color: 0x2a3a2a, alpha: 0.6 });
    g.rect(tx, ty, tw, 2);
    g.fill({ color: 0x3a4a3a, alpha: 0.5 });
    // Indicator light
    g.rect(tx + tw - 3, ty + 3, 2, 2);
    g.fill({ color: accent, alpha: 0.4 });
  }

  // Cable runs (horizontal lines)
  for (let c = 0; c < 3; c++) {
    const cy2 = y + h * 0.3 + c * 12;
    g.rect(x + 4, cy2, w - 8, 1);
    g.fill({ color: 0x222238, alpha: 0.25 });
    // Cable connector dots
    g.rect(x + 4, cy2, 2, 2);
    g.fill({ color: accent, alpha: 0.15 });
    g.rect(x + w - 6, cy2, 2, 2);
    g.fill({ color: accent, alpha: 0.15 });
  }
}

// ── Main vacant lot renderer ──

export function drawVacantLots(g: Graphics): void {
  const range = RANGE;
  for (let px = -range; px < range; px++) {
    for (let py = -range; py < range; py++) {
      if (isReservedPlot(px, py)) continue;
      const meta = getPlotMeta(px, py);
      drawVacantLot(g, px, py, meta.vacantVariant);
    }
  }
}

// ── Occupied plot foundations (drawn on separate layer) ──

export function drawPlotFoundation(g: Graphics, plotX: number, plotY: number, colorHue: number): void {
  const meta = getPlotMeta(plotX, plotY);
  const streetW = meta.streetWidthW;
  const streetH = meta.streetWidthN;
  const ox = meta.visualOffsetX + meta.rowStagger;
  const oy = meta.visualOffsetY;
  // Foundation uses the actual plot position (not offset) for alignment with houses
  // But we need the visual offset for the ground rendering
  const x = plotX * PLOT_W + streetW / 2 + ox;
  const y = plotY * PLOT_H + streetH / 2 + oy;
  const w = PLOT_W - streetW;
  const h = PLOT_H - streetH;

  // Clean concrete pad
  g.rect(x + 1, y + 1, w - 2, h - 2);
  g.fill({ color: 0x1a1a2a });

  // Colored border matching building
  const hueColor = hslToHex(colorHue, 70, 40);
  g.rect(x, y, w, 1);
  g.fill({ color: hueColor, alpha: 0.3 });
  g.rect(x, y + h - 1, w, 1);
  g.fill({ color: hueColor, alpha: 0.3 });
  g.rect(x, y, 1, h);
  g.fill({ color: hueColor, alpha: 0.3 });
  g.rect(x + w - 1, y, 1, h);
  g.fill({ color: hueColor, alpha: 0.3 });

  // Driveway line to nearest street (bottom edge)
  const driveX = x + w / 2;
  g.rect(driveX - 2, y + h - 1, 4, streetH / 2 + 2);
  g.fill({ color: 0x222234, alpha: 0.5 });

  // Address marker dot
  g.circle(x + 4, y + 4, 2);
  g.fill({ color: hueColor, alpha: 0.4 });
}

// ── Landmark ground rendering ──

export function drawLandmarkGrounds(g: Graphics): void {
  for (const lm of LANDMARKS) {
    drawLandmarkGround(g, lm);
  }
}

function drawLandmarkGround(g: Graphics, lm: Landmark): void {
  const startX = (lm.cx - lm.spanX + 1) * PLOT_W;
  const startY = (lm.cy - lm.spanY + 1) * PLOT_H;
  const w = lm.spanX * PLOT_W;
  const h = lm.spanY * PLOT_H;
  const streetW = 24; // default street width for landmarks
  const streetH = 24;
  const ix = startX + streetW / 2;
  const iy = startY + streetH / 2;
  const iw = w - streetW;
  const ih = h - streetH;

  const glowColor = lm.type === 'plaza' ? 0x00fff5
    : lm.type === 'park' ? 0x00ff88
    : lm.type === 'monument' ? 0xff0080
    : lm.type === 'holographic_billboard' ? 0x44aaff
    : 0x00fff5;

  g.rect(ix, iy, iw, ih);
  g.fill({ color: 0x1a1a34, alpha: 0.6 });

  g.rect(ix, iy, iw, 2);
  g.fill({ color: 0x2a2a50, alpha: 0.5 });
  g.rect(ix, iy, 2, ih);
  g.fill({ color: 0x2a2a50, alpha: 0.4 });
  g.rect(ix, iy + ih - 2, iw, 2);
  g.fill({ color: 0x0a0a18, alpha: 0.5 });
  g.rect(ix + iw - 2, iy, 2, ih);
  g.fill({ color: 0x0a0a18, alpha: 0.4 });

  g.rect(ix, iy, iw, 1);
  g.fill({ color: glowColor, alpha: 0.25 });
  g.rect(ix, iy + ih - 1, iw, 1);
  g.fill({ color: glowColor, alpha: 0.25 });
  g.rect(ix, iy, 1, ih);
  g.fill({ color: glowColor, alpha: 0.25 });
  g.rect(ix + iw - 1, iy, 1, ih);
  g.fill({ color: glowColor, alpha: 0.25 });

  const ccx = startX + w / 2;
  const ccy = startY + h / 2;
  const radius = Math.min(w, h) * 0.3;

  g.circle(ccx, ccy, radius * 1.2);
  g.fill({ color: glowColor, alpha: 0.02 });
  g.circle(ccx, ccy, radius);
  g.fill({ color: glowColor, alpha: 0.04 });
  g.circle(ccx, ccy, radius * 0.5);
  g.fill({ color: glowColor, alpha: 0.08 });

  if (lm.type === 'plaza') {
    // ── THE CORE — Central AI Mainframe Base ──

    // Dark metallic base platform with circuit-board pattern
    g.rect(ix + 2, iy + 2, iw - 4, ih - 4);
    g.fill({ color: 0x0a0a18 });
    g.rect(ix + 4, iy + 4, iw - 8, ih - 8);
    g.fill({ color: 0x0c0c1e });

    // Circuit-board trace pattern across the platform
    const traceColor = 0x1a2a3a;
    for (let tx = 0; tx < iw - 8; tx += 12) {
      g.rect(ix + 4 + tx, iy + 4, 1, ih - 8);
      g.fill({ color: traceColor, alpha: 0.4 });
    }
    for (let ty = 0; ty < ih - 8; ty += 12) {
      g.rect(ix + 4, iy + 4 + ty, iw - 8, 1);
      g.fill({ color: traceColor, alpha: 0.4 });
    }
    // Diagonal circuit traces
    for (let d = 0; d < 6; d++) {
      const dx = ix + 20 + d * 35;
      const dy = iy + 15 + d * 20;
      g.rect(dx, dy, 8, 1);
      g.fill({ color: 0x00fff5, alpha: 0.06 });
      g.rect(dx + 8, dy, 1, 6);
      g.fill({ color: 0x00fff5, alpha: 0.06 });
    }

    // ── Main tower — central server rack ──
    const towerW = 80;
    const towerH = 140;
    const towerX = ccx - towerW / 2;
    const towerY = ccy - towerH * 0.6;

    // Tower shadow
    g.rect(towerX + 4, towerY + 4, towerW, towerH);
    g.fill({ color: 0x000008, alpha: 0.5 });

    // Tower body
    g.rect(towerX, towerY, towerW, towerH);
    g.fill({ color: 0x10101e });
    // Slight beveled edge highlights
    g.rect(towerX, towerY, towerW, 2);
    g.fill({ color: 0x2a2a48, alpha: 0.6 });
    g.rect(towerX, towerY, 2, towerH);
    g.fill({ color: 0x222240, alpha: 0.5 });
    g.rect(towerX + towerW - 2, towerY, 2, towerH);
    g.fill({ color: 0x08080e, alpha: 0.7 });
    g.rect(towerX, towerY + towerH - 2, towerW, 2);
    g.fill({ color: 0x08080e, alpha: 0.7 });

    // Server rack horizontal dividers (panel sections)
    for (let p = 0; p < 8; p++) {
      const panelY = towerY + 8 + p * 16;
      g.rect(towerX + 4, panelY, towerW - 8, 14);
      g.fill({ color: 0x141428 });
      g.rect(towerX + 4, panelY, towerW - 8, 1);
      g.fill({ color: 0x2a2a48, alpha: 0.4 });
      g.rect(towerX + 4, panelY + 13, towerW - 8, 1);
      g.fill({ color: 0x0a0a14, alpha: 0.6 });

      // Ventilation slots within each panel
      for (let s = 0; s < 6; s++) {
        g.rect(towerX + 8 + s * 11, panelY + 3, 8, 1);
        g.fill({ color: 0x1a1a30, alpha: 0.5 });
        g.rect(towerX + 8 + s * 11, panelY + 6, 8, 1);
        g.fill({ color: 0x1a1a30, alpha: 0.5 });
        g.rect(towerX + 8 + s * 11, panelY + 9, 8, 1);
        g.fill({ color: 0x1a1a30, alpha: 0.5 });
      }

      // Status indicator lights (row on each panel)
      for (let li = 0; li < 5; li++) {
        const lx = towerX + towerW - 18 + li * 3;
        const ly = panelY + 5;
        const lightColor = li < 2 ? 0x00ff88 : li < 4 ? 0x00fff5 : 0xff6600;
        g.rect(lx, ly, 2, 2);
        g.fill({ color: lightColor, alpha: 0.35 });
      }
    }

    // Central core window on the tower (glowing viewport)
    const coreWinW = 30;
    const coreWinH = 24;
    const coreWinX = ccx - coreWinW / 2;
    const coreWinY = ccy - coreWinH / 2 - 10;
    g.rect(coreWinX - 2, coreWinY - 2, coreWinW + 4, coreWinH + 4);
    g.fill({ color: 0x08081a });
    g.rect(coreWinX, coreWinY, coreWinW, coreWinH);
    g.fill({ color: 0x001a2a });
    g.rect(coreWinX, coreWinY, coreWinW, coreWinH);
    g.stroke({ color: 0x00fff5, width: 1, alpha: 0.4 });
    // Inner glow
    g.rect(coreWinX + 2, coreWinY + 2, coreWinW - 4, coreWinH - 4);
    g.fill({ color: 0x00fff5, alpha: 0.04 });

    // "CLAUDE" text plate on the tower
    const plateW = 44;
    const plateH = 8;
    const plateX = ccx - plateW / 2;
    const plateY = towerY + towerH - 20;
    g.rect(plateX - 1, plateY - 1, plateW + 2, plateH + 2);
    g.fill({ color: 0x0a0a18 });
    g.rect(plateX, plateY, plateW, plateH);
    g.fill({ color: 0x141428 });
    g.rect(plateX, plateY, plateW, plateH);
    g.stroke({ color: 0x00fff5, width: 1, alpha: 0.3 });
    // Simulated "CLAUDE" text (6 small blocks)
    const letters = [5, 3, 5, 4, 5, 5]; // widths for C-L-A-U-D-E
    let letterX = plateX + 4;
    for (const lw of letters) {
      g.rect(letterX, plateY + 2, lw, 4);
      g.fill({ color: 0x00fff5, alpha: 0.5 });
      letterX += lw + 2;
    }

    // ── Side server racks (flanking towers) ──
    for (const side of [-1, 1]) {
      const rackW = 28;
      const rackH = 90;
      const rackX = ccx + side * 55 - rackW / 2;
      const rackY = ccy - rackH * 0.45;

      // Rack shadow
      g.rect(rackX + 3, rackY + 3, rackW, rackH);
      g.fill({ color: 0x000008, alpha: 0.4 });

      // Rack body
      g.rect(rackX, rackY, rackW, rackH);
      g.fill({ color: 0x0e0e1c });
      g.rect(rackX, rackY, rackW, 1);
      g.fill({ color: 0x2a2a44, alpha: 0.5 });
      g.rect(rackX, rackY + rackH - 1, rackW, 1);
      g.fill({ color: 0x08080e, alpha: 0.6 });

      // Rack panels with lights
      for (let rp = 0; rp < 5; rp++) {
        const rpY = rackY + 6 + rp * 16;
        g.rect(rackX + 3, rpY, rackW - 6, 12);
        g.fill({ color: 0x121228 });
        // Status lights
        for (let rli = 0; rli < 3; rli++) {
          g.rect(rackX + rackW - 10 + rli * 3, rpY + 4, 2, 2);
          g.fill({ color: rli === 0 ? 0x00ff88 : 0x00fff5, alpha: 0.3 });
        }
      }

      // Connecting cable to main tower
      const cableY = ccy - 5;
      g.rect(rackX + (side > 0 ? 0 : rackW), cableY, side > 0 ? -(rackX + rackW - towerX - towerW) : towerX - rackX - rackW, 2);
      g.fill({ color: 0x1a1a30, alpha: 0.6 });
      g.rect(rackX + (side > 0 ? 0 : rackW), cableY, side > 0 ? -(rackX - towerX - towerW) : towerX - rackX, 2);
      g.fill({ color: 0x00fff5, alpha: 0.05 });
    }

    // ── Cable conduits — thick cables from tower to city edges ──
    const conduitColor = 0x1a1a2e;
    const conduitGlow = 0x00fff5;
    // Top cable
    g.rect(ccx - 2, iy, 4, towerY - iy);
    g.fill({ color: conduitColor, alpha: 0.7 });
    g.rect(ccx - 1, iy, 2, towerY - iy);
    g.fill({ color: conduitGlow, alpha: 0.03 });
    // Bottom cable
    g.rect(ccx - 2, towerY + towerH, 4, iy + ih - towerY - towerH);
    g.fill({ color: conduitColor, alpha: 0.7 });
    g.rect(ccx - 1, towerY + towerH, 2, iy + ih - towerY - towerH);
    g.fill({ color: conduitGlow, alpha: 0.03 });
    // Left cable
    g.rect(ix, ccy - 2, towerX - ix, 4);
    g.fill({ color: conduitColor, alpha: 0.7 });
    g.rect(ix, ccy - 1, towerX - ix, 2);
    g.fill({ color: conduitGlow, alpha: 0.03 });
    // Right cable
    g.rect(towerX + towerW, ccy - 2, ix + iw - towerX - towerW, 4);
    g.fill({ color: conduitColor, alpha: 0.7 });
    g.rect(towerX + towerW, ccy - 1, ix + iw - towerX - towerW, 2);
    g.fill({ color: conduitGlow, alpha: 0.03 });

    // ── Ventilation/cooling grates with underglow ──
    for (const vx of [towerX + 6, towerX + towerW - 18]) {
      const vy = towerY + towerH + 4;
      g.rect(vx, vy, 12, 6);
      g.fill({ color: 0x0e0e1c });
      for (let vl = 0; vl < 5; vl++) {
        g.rect(vx + 1 + vl * 2.2, vy + 1, 1, 4);
        g.fill({ color: 0x1a1a30, alpha: 0.5 });
      }
      // Glow beneath grate
      g.rect(vx, vy + 6, 12, 3);
      g.fill({ color: 0x00fff5, alpha: 0.04 });
    }

    // ── Platform edge glow border ──
    g.rect(ix, iy, iw, 2);
    g.fill({ color: glowColor, alpha: 0.2 });
    g.rect(ix, iy + ih - 2, iw, 2);
    g.fill({ color: glowColor, alpha: 0.2 });
    g.rect(ix, iy, 2, ih);
    g.fill({ color: glowColor, alpha: 0.2 });
    g.rect(ix + iw - 2, iy, 2, ih);
    g.fill({ color: glowColor, alpha: 0.2 });

    // Corner bracket accents
    const bl = 16;
    for (const [bx, by, dx, dy] of [
      [ix + 2, iy + 2, 1, 0], [ix + 2, iy + 2, 0, 1],
      [ix + iw - 2 - bl, iy + 2, 1, 0], [ix + iw - 2, iy + 2, 0, 1],
      [ix + 2, iy + ih - 2, 1, 0], [ix + 2, iy + ih - 2 - bl, 0, 1],
      [ix + iw - 2 - bl, iy + ih - 2, 1, 0], [ix + iw - 2, iy + ih - 2 - bl, 0, 1],
    ] as [number, number, number, number][]) {
      g.rect(bx, by, dx ? bl : 2, dy ? bl : 2);
      g.fill({ color: glowColor, alpha: 0.35 });
    }
  } else if (lm.type === 'park') {
    g.rect(ix + 3, iy + 3, iw - 6, ih - 6);
    g.fill({ color: 0x0c2818, alpha: 0.4 });
    for (let t = 0; t < 8; t++) {
      const tx = ix + 6 + hash(lm.cx, lm.cy, 150 + t) * (iw - 12);
      const ty = iy + 6 + hash(lm.cx, lm.cy, 160 + t) * (ih - 12);
      const tr = 3 + hash(lm.cx, lm.cy, 170 + t) * 4;
      g.circle(tx, ty, tr);
      g.fill({ color: 0x0e3a1c, alpha: 0.3 });
    }
  } else if (lm.type === 'monument') {
    g.moveTo(ccx, ccy - 10);
    g.lineTo(ccx + 8, ccy);
    g.lineTo(ccx, ccy + 10);
    g.lineTo(ccx - 8, ccy);
    g.closePath();
    g.fill({ color: glowColor, alpha: 0.06 });
    g.stroke({ color: glowColor, width: 1, alpha: 0.2 });
    g.moveTo(ccx, ccy - 5);
    g.lineTo(ccx + 4, ccy);
    g.lineTo(ccx, ccy + 5);
    g.lineTo(ccx - 4, ccy);
    g.closePath();
    g.stroke({ color: glowColor, width: 1, alpha: 0.15 });
  } else if (lm.type === 'holographic_billboard') {
    // Billboard plaza — SOLID opaque dark panel (renders behind houses)
    // This is the main billboard screen drawn on the static background layer
    const bbW = iw * 0.85;
    const bbH = ih * 0.7;
    const bbX = ccx - bbW / 2;
    const bbY = ccy - bbH / 2;

    // Ground base
    g.rect(ix + 2, iy + 2, iw - 4, ih - 4);
    g.fill({ color: 0x08081a });

    // Billboard screen — fully opaque dark background
    g.rect(bbX - 4, bbY - 4, bbW + 8, bbH + 8);
    g.fill({ color: 0x050510 });
    g.rect(bbX, bbY, bbW, bbH);
    g.fill({ color: 0x0a0a1e });

    // Thick glowing border frame
    g.rect(bbX - 2, bbY - 2, bbW + 4, bbH + 4);
    g.stroke({ color: glowColor, width: 2, alpha: 0.6 });
    g.rect(bbX, bbY, bbW, bbH);
    g.stroke({ color: 0xff0080, width: 1, alpha: 0.3 });

    // Corner accent brackets
    const cl = 10;
    const ca = 0.7;
    // Top-left
    g.moveTo(bbX, bbY + cl); g.lineTo(bbX, bbY); g.lineTo(bbX + cl, bbY);
    g.stroke({ color: glowColor, width: 2, alpha: ca });
    // Top-right
    g.moveTo(bbX + bbW - cl, bbY); g.lineTo(bbX + bbW, bbY); g.lineTo(bbX + bbW, bbY + cl);
    g.stroke({ color: glowColor, width: 2, alpha: ca });
    // Bottom-left
    g.moveTo(bbX, bbY + bbH - cl); g.lineTo(bbX, bbY + bbH); g.lineTo(bbX + cl, bbY + bbH);
    g.stroke({ color: glowColor, width: 2, alpha: ca });
    // Bottom-right
    g.moveTo(bbX + bbW - cl, bbY + bbH); g.lineTo(bbX + bbW, bbY + bbH); g.lineTo(bbX + bbW, bbY + bbH - cl);
    g.stroke({ color: glowColor, width: 2, alpha: ca });

    // Static "text" content lines on the billboard (readable against dark bg)
    const lineCount = Math.floor(bbH / 10);
    for (let l = 0; l < lineCount; l++) {
      const lineY = bbY + 8 + l * 10;
      const lineW = bbW * (0.3 + hash(lm.cx + l, lm.cy, 4300) * 0.5);
      const lineX = bbX + 6 + hash(lm.cx, lm.cy + l, 4301) * (bbW - lineW - 12);
      const lineColor = l % 3 === 0 ? glowColor : l % 3 === 1 ? 0xff0080 : 0x00ff88;
      g.rect(lineX, lineY, lineW, 2);
      g.fill({ color: lineColor, alpha: 0.4 });
      // Subtle glow per line
      g.rect(lineX, lineY - 1, lineW, 4);
      g.fill({ color: lineColor, alpha: 0.06 });
    }

    // Header bar at top
    g.rect(bbX + 4, bbY + 3, bbW - 8, 5);
    g.fill({ color: glowColor, alpha: 0.25 });

    // Side light bars
    g.rect(bbX - 4, bbY, 2, bbH);
    g.fill({ color: glowColor, alpha: 0.4 });
    g.rect(bbX + bbW + 2, bbY, 2, bbH);
    g.fill({ color: 0xff0080, alpha: 0.4 });

    // Support structure below billboard
    g.rect(ccx - 3, bbY + bbH + 4, 6, ih * 0.15);
    g.fill({ color: 0x222238 });
    g.rect(ccx - 8, bbY + bbH + ih * 0.15, 16, 3);
    g.fill({ color: 0x2a2a44 });

    // Ground glow beneath
    g.rect(bbX, bbY + bbH + 4, bbW, 4);
    g.fill({ color: glowColor, alpha: 0.06 });
    g.ellipse(ccx, bbY + bbH + 10, bbW * 0.5, 8);
    g.fill({ color: glowColor, alpha: 0.03 });
  }
}

function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
