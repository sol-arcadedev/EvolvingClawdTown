// ═══════════════════════════════════════════════════════════════════
// StreetRenderer — All street types + lane markings
// ═══════════════════════════════════════════════════════════════════

import { Graphics } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import {
  RANGE, hash, modulateColor,
  getPlotMeta, getNeighborhoodPalette, getStreetWidth, getStreetType,
  shouldStreetFade, type NeighborhoodId,
} from '../CityLayout';

export function drawRoads(g: Graphics): void {
  const range = RANGE;

  // Pre-compute street widths per row/col
  const hStreetWidths: number[] = [];
  const vStreetWidths: number[] = [];
  const hStreetNeighborhoods: NeighborhoodId[] = [];
  const vStreetNeighborhoods: NeighborhoodId[] = [];
  for (let i = -range; i <= range; i++) {
    const hn = getPlotMeta(0, i).neighborhood;
    const vn = getPlotMeta(i, 0).neighborhood;
    hStreetWidths[i + range] = getStreetWidth(i, false, hn);
    vStreetWidths[i + range] = getStreetWidth(i, true, vn);
    hStreetNeighborhoods[i + range] = hn;
    vStreetNeighborhoods[i + range] = vn;
  }

  // Horizontal roads
  for (let i = -range; i <= range; i++) {
    const sw = hStreetWidths[i + range];
    const cy = i * PLOT_H;
    const hn = hStreetNeighborhoods[i + range];
    const pal = getNeighborhoodPalette(hn);
    const streetType = getStreetType(i, false, hn);
    const roadCol = pal.roadColor;

    for (let j = -range; j < range; j++) {
      const fade = shouldStreetFade(i, j, false);
      if (fade <= 0) continue;
      const sx = j * PLOT_W;
      const segX = sx - PLOT_W / 2;

      // Base road fill
      g.rect(segX, cy - sw / 2, PLOT_W, sw);
      g.fill({ color: roadCol, alpha: fade });

      // Gutter darkening
      g.rect(segX, cy - sw / 2, PLOT_W, 2);
      g.fill({ color: 0x08080e, alpha: 0.3 * fade });
      g.rect(segX, cy + sw / 2 - 2, PLOT_W, 2);
      g.fill({ color: 0x08080e, alpha: 0.3 * fade });

      // Road edge lines
      g.rect(segX, cy - sw / 2 + 2, PLOT_W, 1);
      g.fill({ color: 0x444458, alpha: 0.5 * fade });
      g.rect(segX, cy + sw / 2 - 3, PLOT_W, 1);
      g.fill({ color: 0x444458, alpha: 0.5 * fade });

      // Highway-specific: guard rails + double yellow center
      if (streetType === 'highway') {
        // Guard rail dots on edges
        for (let dx = 4; dx < PLOT_W; dx += 12) {
          g.rect(segX + dx, cy - sw / 2 + 1, 2, 2);
          g.fill({ color: 0x666680, alpha: 0.4 * fade });
          g.rect(segX + dx, cy + sw / 2 - 3, 2, 2);
          g.fill({ color: 0x666680, alpha: 0.4 * fade });
        }
      }

      // Boulevard-specific: median strip
      if (streetType === 'boulevard') {
        const medW = 4;
        g.rect(segX, cy - medW / 2, PLOT_W, medW);
        g.fill({ color: modulateColor(pal.sidewalkColor, 0.7), alpha: 0.5 * fade });
        // Median tree dots
        if (hash(i, j, 2000) < 0.5) {
          const treeX = segX + PLOT_W / 2;
          g.circle(treeX, cy, 3);
          g.fill({ color: 0x0a3818, alpha: 0.4 * fade });
          g.circle(treeX, cy, 2);
          g.fill({ color: 0x0e4a22, alpha: 0.3 * fade });
        }
      }

      // Asphalt texture
      for (let d = 0; d < 5; d++) {
        const dx = hash(i, j, 700 + d) * PLOT_W;
        const dy = (hash(i, j, 800 + d) - 0.5) * (sw - 6);
        g.rect(segX + dx, cy + dy, 1, 1);
        g.fill({ color: hash(i, j, 900 + d) < 0.5 ? 0x181824 : 0x262638, alpha: 0.2 * fade });
      }

      // Semicircle cap at fade endpoints
      if (fade < 1 && fade > 0) {
        g.circle(segX, cy, sw / 2);
        g.fill({ color: roadCol, alpha: fade * 0.7 });
      }
    }
  }

  // Vertical roads
  for (let i = -range; i <= range; i++) {
    const sw = vStreetWidths[i + range];
    const cx = i * PLOT_W;
    const vn = vStreetNeighborhoods[i + range];
    const pal = getNeighborhoodPalette(vn);
    const streetType = getStreetType(i, true, vn);
    const roadCol = pal.roadColor;

    for (let j = -range; j < range; j++) {
      const fade = shouldStreetFade(i, j, true);
      if (fade <= 0) continue;
      const sy = j * PLOT_H;
      const segY = sy - PLOT_H / 2;

      g.rect(cx - sw / 2, segY, sw, PLOT_H);
      g.fill({ color: roadCol, alpha: fade });

      g.rect(cx - sw / 2, segY, 2, PLOT_H);
      g.fill({ color: 0x08080e, alpha: 0.3 * fade });
      g.rect(cx + sw / 2 - 2, segY, 2, PLOT_H);
      g.fill({ color: 0x08080e, alpha: 0.3 * fade });

      g.rect(cx - sw / 2 + 2, segY, 1, PLOT_H);
      g.fill({ color: 0x444458, alpha: 0.5 * fade });
      g.rect(cx + sw / 2 - 3, segY, 1, PLOT_H);
      g.fill({ color: 0x444458, alpha: 0.5 * fade });

      // Highway guard rails
      if (streetType === 'highway') {
        for (let dy = 4; dy < PLOT_H; dy += 12) {
          g.rect(cx - sw / 2 + 1, segY + dy, 2, 2);
          g.fill({ color: 0x666680, alpha: 0.4 * fade });
          g.rect(cx + sw / 2 - 3, segY + dy, 2, 2);
          g.fill({ color: 0x666680, alpha: 0.4 * fade });
        }
      }

      // Boulevard median
      if (streetType === 'boulevard') {
        const medW = 4;
        g.rect(cx - medW / 2, segY, medW, PLOT_H);
        g.fill({ color: modulateColor(pal.sidewalkColor, 0.7), alpha: 0.5 * fade });
        if (hash(i, j, 2010) < 0.5) {
          const treeY = segY + PLOT_H / 2;
          g.circle(cx, treeY, 3);
          g.fill({ color: 0x0a3818, alpha: 0.4 * fade });
          g.circle(cx, treeY, 2);
          g.fill({ color: 0x0e4a22, alpha: 0.3 * fade });
        }
      }

      for (let d = 0; d < 5; d++) {
        const dy = hash(i, j, 710 + d) * PLOT_H;
        const dx = (hash(i, j, 810 + d) - 0.5) * (sw - 6);
        g.rect(cx + dx, segY + dy, 1, 1);
        g.fill({ color: hash(i, j, 910 + d) < 0.5 ? 0x181824 : 0x262638, alpha: 0.2 * fade });
      }

      if (fade < 1 && fade > 0) {
        g.circle(cx, segY, sw / 2);
        g.fill({ color: roadCol, alpha: fade * 0.7 });
      }
    }
  }
}

export function drawLaneMarkings(g: Graphics): void {
  const range = RANGE;
  const left = -range * PLOT_W;
  const top = -range * PLOT_H;
  const totalW = range * 2 * PLOT_W;
  const totalH = range * 2 * PLOT_H;

  // Yellow center dashes
  g.setStrokeStyle({ color: 0x666640, width: 1, alpha: 0.8 });
  for (let i = -range; i <= range; i++) {
    const hn = getPlotMeta(0, i).neighborhood;
    const streetType = getStreetType(i, false, hn);
    const hy = i * PLOT_H;

    // Highway: double solid yellow lines
    if (streetType === 'highway') {
      for (let dx = left; dx < left + totalW; dx += 2) {
        g.moveTo(dx, hy - 2);
        g.lineTo(dx + 1, hy - 2);
        g.moveTo(dx, hy + 2);
        g.lineTo(dx + 1, hy + 2);
      }
    } else if (streetType !== 'alley') {
      for (let dx = left; dx < left + totalW; dx += 14) {
        g.moveTo(dx, hy - 1);
        g.lineTo(dx + 7, hy - 1);
        g.moveTo(dx, hy + 1);
        g.lineTo(dx + 7, hy + 1);
      }
    }

    const vn = getPlotMeta(i, 0).neighborhood;
    const vStreetType = getStreetType(i, true, vn);
    const vx = i * PLOT_W;

    if (vStreetType === 'highway') {
      for (let dy = top; dy < top + totalH; dy += 2) {
        g.moveTo(vx - 2, dy);
        g.lineTo(vx - 2, dy + 1);
        g.moveTo(vx + 2, dy);
        g.lineTo(vx + 2, dy + 1);
      }
    } else if (vStreetType !== 'alley') {
      for (let dy = top; dy < top + totalH; dy += 14) {
        g.moveTo(vx - 1, dy);
        g.lineTo(vx - 1, dy + 7);
        g.moveTo(vx + 1, dy);
        g.lineTo(vx + 1, dy + 7);
      }
    }
  }
  g.stroke();
}

export function drawCurvedRoads(g: Graphics): void {
  const roadColor = 0x222234;
  const sidewalkColor = 0x38384e;
  const roadW = 24;
  const sidewalkW = 7;

  const drawRoadSegments = (
    points: { x: number; y: number }[],
    width: number,
    color: number,
  ) => {
    if (points.length < 2) return;
    g.setStrokeStyle({ color, width, cap: 'round', join: 'round' });
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.stroke();
  };

  const ringRoad = (radiusX: number, radiusY: number, segments: number) => {
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push({ x: Math.cos(angle) * radiusX, y: Math.sin(angle) * radiusY });
    }
    return pts;
  };

  // Inner ring road
  const innerR_X = 4.5 * PLOT_W;
  const innerR_Y = 4.5 * PLOT_H;
  const innerPts = ringRoad(innerR_X, innerR_Y, 64);
  drawRoadSegments(innerPts, roadW + sidewalkW * 2, sidewalkColor);
  drawRoadSegments(innerPts, roadW, roadColor);
  g.setStrokeStyle({ color: 0x666640, width: 1, alpha: 0.6 });
  for (let i = 0; i < innerPts.length - 1; i += 2) {
    g.moveTo(innerPts[i].x, innerPts[i].y);
    g.lineTo(innerPts[i + 1].x, innerPts[i + 1].y);
  }
  g.stroke();

  // Outer ring road
  const outerR_X = 8 * PLOT_W;
  const outerR_Y = 8 * PLOT_H;
  const outerPts = ringRoad(outerR_X, outerR_Y, 80);
  drawRoadSegments(outerPts, roadW + sidewalkW * 2, 0x2e2e42);
  drawRoadSegments(outerPts, roadW, roadColor);
  g.setStrokeStyle({ color: 0x666640, width: 1, alpha: 0.5 });
  for (let i = 0; i < outerPts.length - 1; i += 2) {
    g.moveTo(outerPts[i].x, outerPts[i].y);
    g.lineTo(outerPts[i + 1].x, outerPts[i + 1].y);
  }
  g.stroke();

  // Diagonal boulevards
  const diagLen = 10;
  const diagonals = [
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
  ];
  for (const d of diagonals) {
    const pts: { x: number; y: number }[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const baseX = t * diagLen * d.dx * PLOT_W;
      const baseY = t * diagLen * d.dy * PLOT_H;
      const wobble = Math.sin(t * Math.PI * 3) * PLOT_W * 0.15;
      pts.push({ x: baseX + wobble * d.dy, y: baseY - wobble * d.dx });
    }
    drawRoadSegments(pts, roadW + sidewalkW * 2, sidewalkColor);
    drawRoadSegments(pts, roadW - 4, roadColor);
    g.setStrokeStyle({ color: 0x666640, width: 1, alpha: 0.5 });
    for (let i = 0; i < pts.length - 1; i += 3) {
      g.moveTo(pts[i].x, pts[i].y);
      g.lineTo(pts[i + 1].x, pts[i + 1].y);
    }
    g.stroke();
  }

  // Arc connectors
  const arcConnectors = [
    { from: { x: 5 * PLOT_W, y: 0 }, to: { x: 0, y: -6 * PLOT_H }, bulge: 0.35 },
    { from: { x: 0, y: -6 * PLOT_H }, to: { x: -6 * PLOT_W, y: 0 }, bulge: 0.35 },
    { from: { x: -6 * PLOT_W, y: 0 }, to: { x: 0, y: 5 * PLOT_H }, bulge: 0.35 },
    { from: { x: 0, y: 5 * PLOT_H }, to: { x: 5 * PLOT_W, y: 0 }, bulge: 0.35 },
  ];
  for (const arc of arcConnectors) {
    const pts: { x: number; y: number }[] = [];
    const steps = 30;
    const midX = (arc.from.x + arc.to.x) / 2;
    const midY = (arc.from.y + arc.to.y) / 2;
    const dx = arc.to.x - arc.from.x;
    const dy = arc.to.y - arc.from.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / len;
    const ny = dx / len;
    const bulgeX = midX - nx * len * arc.bulge;
    const bulgeY = midY - ny * len * arc.bulge;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const mt = 1 - t;
      pts.push({
        x: mt * mt * arc.from.x + 2 * mt * t * bulgeX + t * t * arc.to.x,
        y: mt * mt * arc.from.y + 2 * mt * t * bulgeY + t * t * arc.to.y,
      });
    }
    drawRoadSegments(pts, roadW * 0.7 + sidewalkW * 2, 0x2e2e44);
    drawRoadSegments(pts, roadW * 0.7, roadColor);
    g.setStrokeStyle({ color: 0x666640, width: 1, alpha: 0.4 });
    for (let i = 0; i < pts.length - 1; i += 3) {
      g.moveTo(pts[i].x, pts[i].y);
      g.lineTo(pts[i + 1].x, pts[i + 1].y);
    }
    g.stroke();
  }

  // Glow at ring road intersections
  for (let i = 0; i < innerPts.length; i += 4) {
    g.circle(innerPts[i].x, innerPts[i].y, 4);
    g.fill({ color: 0x00fff5, alpha: 0.05 });
  }
  for (let i = 0; i < outerPts.length; i += 5) {
    g.circle(outerPts[i].x, outerPts[i].y, 3);
    g.fill({ color: 0x00fff5, alpha: 0.03 });
  }
}
