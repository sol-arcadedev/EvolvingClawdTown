// ═══════════════════════════════════════════════════════════════════
// InfraRenderer — Water canal, bridges, elevated highway
// ═══════════════════════════════════════════════════════════════════

import { Graphics } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import { RANGE, hash } from '../CityLayout';

// ── Water canal with docks + embankments ──

export function drawWaterCanal(g: Graphics): void {
  const range = RANGE;
  const canalY = -2 * PLOT_H;
  const canalWidth = 16;
  const segments = 120;
  const startX = -range * PLOT_W;
  const endX = range * PLOT_W;
  const spanX = endX - startX;

  const canalPts: { x: number; y: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const x = startX + t * spanX;
    const meander = Math.sin(t * Math.PI * 4) * PLOT_H * 0.6
                  + Math.sin(t * Math.PI * 7) * PLOT_H * 0.2;
    canalPts.push({ x, y: canalY + meander });
  }

  const drawCanalLine = (width: number, color: number, alpha = 1) => {
    g.setStrokeStyle({ color, width, cap: 'round', join: 'round', alpha });
    g.moveTo(canalPts[0].x, canalPts[0].y);
    for (let k = 1; k < canalPts.length; k++) g.lineTo(canalPts[k].x, canalPts[k].y);
    g.stroke();
  };

  // Outer glow halo
  drawCanalLine(canalWidth + 12, 0x00fff5, 0.03);
  // Canal wall (stone edge)
  drawCanalLine(canalWidth + 6, 0x2a2a40, 1);
  // Wall highlight
  drawCanalLine(canalWidth + 4, 0x3a3a55, 0.5);
  // Deep water
  drawCanalLine(canalWidth + 2, 0x081828, 1);
  // Water surface
  drawCanalLine(canalWidth, 0x0c2844, 1);
  // Water mid-tone
  drawCanalLine(canalWidth * 0.6, 0x103050, 1);
  // Shimmer center
  drawCanalLine(canalWidth * 0.25, 0x1a5a8a, 0.7);
  // Bright highlight
  drawCanalLine(canalWidth * 0.1, 0x2080b0, 0.4);
  // Cyan edge accent
  drawCanalLine(canalWidth + 3, 0x00fff5, 0.05);

  // Embankment details — reinforced edges with railing dots
  for (let i = 0; i < canalPts.length - 1; i += 3) {
    const pt = canalPts[i];
    // North embankment railing dots
    g.rect(pt.x - 1, pt.y - canalWidth / 2 - 5, 2, 2);
    g.fill({ color: 0x4a4a65, alpha: 0.3 });
    // South embankment railing dots
    g.rect(pt.x - 1, pt.y + canalWidth / 2 + 3, 2, 2);
    g.fill({ color: 0x4a4a65, alpha: 0.3 });
  }

  // Dock platforms (small rectangles extending into the canal)
  const dockPositions = [-8, -4, 0, 4, 8];
  for (const dp of dockPositions) {
    const dockX = dp * PLOT_W;
    const t = (dockX - startX) / spanX;
    if (t < 0 || t > 1) continue;
    const meander = Math.sin(t * Math.PI * 4) * PLOT_H * 0.6
                  + Math.sin(t * Math.PI * 7) * PLOT_H * 0.2;
    const dockY = canalY + meander;
    const side = hash(dp, 0, 5555) < 0.5 ? -1 : 1;

    // Dock platform
    const dw = 12;
    const dh = 8;
    const dx = dockX - dw / 2;
    const dy = side > 0 ? dockY + canalWidth / 2 + 2 : dockY - canalWidth / 2 - dh - 2;
    g.rect(dx, dy, dw, dh);
    g.fill({ color: 0x2a2220, alpha: 0.7 });
    // Plank lines
    for (let p = 0; p < dh; p += 3) {
      g.rect(dx, dy + p, dw, 1);
      g.fill({ color: 0x3a3228, alpha: 0.3 });
    }
    // Bollard dots
    g.rect(dx + 1, dy + 1, 2, 2);
    g.fill({ color: 0x4a4a58, alpha: 0.4 });
    g.rect(dx + dw - 3, dy + 1, 2, 2);
    g.fill({ color: 0x4a4a58, alpha: 0.4 });
  }

  // Bridges
  for (let i = -range; i <= range; i++) {
    const bx = i * PLOT_W;
    const t = (bx - startX) / spanX;
    if (t < 0 || t > 1) continue;
    const meander = Math.sin(t * Math.PI * 4) * PLOT_H * 0.6
                  + Math.sin(t * Math.PI * 7) * PLOT_H * 0.2;
    const by = canalY + meander;

    const bridgeW = 32 + 6;
    const bridgeH = canalWidth + 14;

    g.rect(bx - bridgeW / 2 + 2, by - bridgeH / 2 + 2, bridgeW, bridgeH);
    g.fill({ color: 0x040410, alpha: 0.3 });
    g.rect(bx - bridgeW / 2, by - bridgeH / 2, bridgeW, bridgeH);
    g.fill({ color: 0x222234 });
    for (let p = 0; p < bridgeH; p += 4) {
      g.rect(bx - bridgeW / 2, by - bridgeH / 2 + p, bridgeW, 1);
      g.fill({ color: 0x1a1a2a, alpha: 0.4 });
    }
    g.rect(bx - bridgeW / 2, by - bridgeH / 2, bridgeW, 2);
    g.fill({ color: 0x3a3a55 });
    g.rect(bx - bridgeW / 2, by + bridgeH / 2 - 2, bridgeW, 2);
    g.fill({ color: 0x3a3a55 });
    g.rect(bx - bridgeW / 2, by - bridgeH / 2, bridgeW, 1);
    g.fill({ color: 0x4a4a65, alpha: 0.6 });
    for (let p = 0; p < bridgeW; p += 6) {
      g.rect(bx - bridgeW / 2 + p, by - bridgeH / 2, 1, 2);
      g.fill({ color: 0x4a4a65, alpha: 0.5 });
      g.rect(bx - bridgeW / 2 + p, by + bridgeH / 2 - 2, 1, 2);
      g.fill({ color: 0x4a4a65, alpha: 0.5 });
    }
  }
}

// ── Elevated diagonal highway crossing SW→NE ──

export function drawElevatedHighway(g: Graphics): void {
  const range = RANGE;
  const hwWidth = 56;
  const steps = 100;

  // Highway runs from SW (-range, +range) to NE (+range, -range)
  const startX = -range * PLOT_W * 0.8;
  const startY = range * PLOT_H * 0.6;
  const endX = range * PLOT_W * 0.8;
  const endY = -range * PLOT_H * 0.6;

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = startX + (endX - startX) * t;
    // Slight S-curve to break linearity
    const curve = Math.sin(t * Math.PI * 2) * PLOT_W * 0.8;
    const y = startY + (endY - startY) * t + curve;
    pts.push({ x, y });
  }

  // Shadow on ground
  g.setStrokeStyle({ color: 0x000000, width: hwWidth + 8, cap: 'round', join: 'round', alpha: 0.2 });
  g.moveTo(pts[0].x + 6, pts[0].y + 8);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x + 6, pts[i].y + 8);
  g.stroke();

  // Support columns — every PLOT_W pixels with shadow
  for (let i = 0; i < pts.length; i += Math.floor(steps / 16)) {
    const pt = pts[i];
    // Column shadow
    g.rect(pt.x - 3 + 4, pt.y + hwWidth / 2 + 4, 6, 12);
    g.fill({ color: 0x000000, alpha: 0.2 });
    // Column
    g.rect(pt.x - 3, pt.y + hwWidth / 2, 6, 10);
    g.fill({ color: 0x2a2a3a, alpha: 0.8 });
    g.rect(pt.x - 4, pt.y + hwWidth / 2, 8, 2);
    g.fill({ color: 0x3a3a4a, alpha: 0.6 });
  }

  // Highway deck (semi-transparent)
  g.setStrokeStyle({ color: 0x1a1a28, width: hwWidth, cap: 'round', join: 'round', alpha: 0.88 });
  g.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i].x, pts[i].y);
  g.stroke();

  // Edge barriers
  g.setStrokeStyle({ color: 0x3a3a50, width: 2, cap: 'round', join: 'round', alpha: 0.7 });
  // Calculate offset points for both edges
  for (let edge = -1; edge <= 1; edge += 2) {
    for (let i = 0; i < pts.length - 1; i++) {
      const dx = pts[i + 1].x - pts[i].x;
      const dy = pts[i + 1].y - pts[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len === 0) continue;
      const nx = -dy / len * (hwWidth / 2) * edge;
      const ny = dx / len * (hwWidth / 2) * edge;
      if (i === 0) g.moveTo(pts[i].x + nx, pts[i].y + ny);
      else g.lineTo(pts[i].x + nx, pts[i].y + ny);
    }
    g.stroke();
  }

  // Lane markings (dashed white center + yellow edges)
  for (let i = 0; i < pts.length - 1; i += 4) {
    const pt = pts[i];
    const next = pts[Math.min(i + 2, pts.length - 1)];
    // Center dashes
    g.moveTo(pt.x, pt.y);
    g.lineTo(next.x, next.y);
  }
  g.stroke({ color: 0x666640, width: 1, alpha: 0.5 });

  // Guard rail dots along edges
  for (let i = 0; i < pts.length; i += 6) {
    const pt = pts[i];
    const nextPt = pts[Math.min(i + 1, pts.length - 1)];
    const dx = nextPt.x - pt.x;
    const dy = nextPt.y - pt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const nx = -dy / len * (hwWidth / 2 - 2);
    const ny = dx / len * (hwWidth / 2 - 2);
    // Guard dots on both sides
    g.circle(pt.x + nx, pt.y + ny, 1.5);
    g.fill({ color: 0xff6600, alpha: 0.3 });
    g.circle(pt.x - nx, pt.y - ny, 1.5);
    g.fill({ color: 0xff6600, alpha: 0.3 });
  }

  // Overhead light circles
  for (let i = 0; i < pts.length; i += Math.floor(steps / 10)) {
    const pt = pts[i];
    g.circle(pt.x, pt.y, 8);
    g.fill({ color: 0xffaa44, alpha: 0.03 });
    g.circle(pt.x, pt.y, 4);
    g.fill({ color: 0xffaa44, alpha: 0.06 });
  }

  // On/off ramps at 3 points
  const rampPositions = [0.2, 0.5, 0.8];
  for (const rampT of rampPositions) {
    const idx = Math.floor(rampT * steps);
    const pt = pts[idx];
    const nextPt = pts[Math.min(idx + 1, pts.length - 1)];
    const dx = nextPt.x - pt.x;
    const dy = nextPt.y - pt.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) continue;
    const nx = -dy / len;
    const ny = dx / len;
    const side = rampT < 0.5 ? 1 : -1;

    // Ramp curve
    const rampLen = 60;
    const rampPts: { x: number; y: number }[] = [];
    for (let r = 0; r <= 10; r++) {
      const rt = r / 10;
      const rx = pt.x + nx * hwWidth / 2 * side + nx * rampLen * rt * side;
      const ry = pt.y + ny * hwWidth / 2 * side + ny * rampLen * rt * side + rt * 20;
      rampPts.push({ x: rx, y: ry });
    }
    g.setStrokeStyle({ color: 0x1a1a28, width: 16, cap: 'round', join: 'round', alpha: 0.75 });
    g.moveTo(rampPts[0].x, rampPts[0].y);
    for (let r = 1; r < rampPts.length; r++) g.lineTo(rampPts[r].x, rampPts[r].y);
    g.stroke();
    // Ramp edge
    g.setStrokeStyle({ color: 0x3a3a50, width: 1, cap: 'round', join: 'round', alpha: 0.4 });
    g.moveTo(rampPts[0].x, rampPts[0].y);
    for (let r = 1; r < rampPts.length; r++) g.lineTo(rampPts[r].x, rampPts[r].y);
    g.stroke();
  }
}
