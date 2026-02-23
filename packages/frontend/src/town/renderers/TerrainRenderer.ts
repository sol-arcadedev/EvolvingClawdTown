// ═══════════════════════════════════════════════════════════════════
// TerrainRenderer — Base ground, elevation, organic patches
// ═══════════════════════════════════════════════════════════════════

import { Graphics } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import {
  RANGE, hash, terrainHeight, modulateColor, smoothNoise,
  getPlotMeta, getNeighborhoodPalette, isReservedPlot,
  type NeighborhoodId,
} from '../CityLayout';

export function drawBaseGround(g: Graphics): void {
  const range = RANGE;
  const totalW = range * 2 * PLOT_W;
  const totalH = range * 2 * PLOT_H;
  const left = -range * PLOT_W;
  const top = -range * PLOT_H;

  // 1. Base ground fill
  g.rect(left - 100, top - 100, totalW + 200, totalH + 200);
  g.fill({ color: 0x08080e });

  // 2. Depth gradient — layered radial glow from center
  g.circle(0, 0, range * PLOT_W * 0.95);
  g.fill({ color: 0x0c0c16, alpha: 0.2 });
  g.circle(0, 0, range * PLOT_W * 0.7);
  g.fill({ color: 0x101020, alpha: 0.25 });
  g.circle(0, 0, range * PLOT_W * 0.4);
  g.fill({ color: 0x151528, alpha: 0.2 });
  g.circle(0, 0, range * PLOT_W * 0.2);
  g.fill({ color: 0x1a1a30, alpha: 0.15 });
}

export function drawPlotGrounds(g: Graphics): void {
  const range = RANGE;

  for (let px = -range; px < range; px++) {
    for (let py = -range; py < range; py++) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);

      // Apply visual offsets + row stagger for organic feel (render only)
      const ox = meta.visualOffsetX + meta.rowStagger;
      const oy = meta.visualOffsetY;

      const streetW = meta.streetWidthW;
      const streetH = meta.streetWidthN;
      const x = px * PLOT_W + streetW / 2 + ox;
      const y = py * PLOT_H + streetH / 2 + oy;
      const w = PLOT_W - streetW;
      const h = PLOT_H - streetH;
      const heightFactor = 0.85 + meta.elevation * 0.3;
      const plotColor = meta.isReserved
        ? modulateColor(0x181830, heightFactor)
        : modulateColor(pal.groundColor, heightFactor);

      // Base fill
      g.rect(x, y, w, h);
      g.fill({ color: plotColor });

      // Foundation border — 3D bevel effect
      const bevelLight = modulateColor(plotColor, 1.5);
      const bevelDark = modulateColor(plotColor, 0.6);
      g.rect(x, y, w, 1);
      g.fill({ color: bevelLight, alpha: 0.4 });
      g.rect(x, y, 1, h);
      g.fill({ color: bevelLight, alpha: 0.3 });
      g.rect(x, y + h - 1, w, 1);
      g.fill({ color: bevelDark, alpha: 0.5 });
      g.rect(x + w - 1, y, 1, h);
      g.fill({ color: bevelDark, alpha: 0.4 });

      // Tile pattern based on neighborhood
      const tileSize = pal.tileSize;
      const gridAlpha = pal.neonIntensity > 0.5 ? 0.08 : pal.neonIntensity > 0.2 ? 0.05 : 0.03;
      const gridColor = modulateColor(plotColor, 1.3);

      if (pal.tilePattern === 'circuit') {
        // Circuit board pattern — L-shaped traces
        for (let tx = tileSize; tx < w; tx += tileSize) {
          g.rect(x + tx, y + 1, 1, h - 2);
          g.fill({ color: gridColor, alpha: gridAlpha });
          // Add short perpendicular traces at random intervals
          if (hash(px, py, 3000 + tx) < 0.4) {
            const traceY = y + Math.floor(hash(px, py, 3100 + tx) * (h - 8)) + 4;
            const traceLen = Math.min(8, tileSize - 2);
            g.rect(x + tx, traceY, traceLen, 1);
            g.fill({ color: pal.accentColor, alpha: gridAlpha * 0.6 });
          }
        }
        for (let ty = tileSize; ty < h; ty += tileSize) {
          g.rect(x + 1, y + ty, w - 2, 1);
          g.fill({ color: gridColor, alpha: gridAlpha });
        }
      } else if (pal.tilePattern === 'brick') {
        // Brick pattern — offset rows
        for (let ty = tileSize; ty < h; ty += tileSize) {
          g.rect(x + 1, y + ty, w - 2, 1);
          g.fill({ color: gridColor, alpha: gridAlpha });
          const rowOff = (Math.floor(ty / tileSize) % 2) * (tileSize / 2);
          for (let tx = tileSize + rowOff; tx < w; tx += tileSize) {
            g.rect(x + tx, y + ty - tileSize + 1, 1, tileSize - 1);
            g.fill({ color: gridColor, alpha: gridAlpha * 0.8 });
          }
        }
      } else if (pal.tilePattern === 'metal') {
        // Metal grating — cross-hatch
        for (let tx = tileSize; tx < w; tx += tileSize) {
          g.rect(x + tx, y + 1, 1, h - 2);
          g.fill({ color: gridColor, alpha: gridAlpha });
        }
        for (let ty = tileSize; ty < h; ty += tileSize) {
          g.rect(x + 1, y + ty, w - 2, 1);
          g.fill({ color: gridColor, alpha: gridAlpha });
        }
        // Rivet dots at intersections
        for (let tx = tileSize; tx < w; tx += tileSize) {
          for (let ty = tileSize; ty < h; ty += tileSize) {
            g.rect(x + tx, y + ty, 2, 2);
            g.fill({ color: modulateColor(plotColor, 1.6), alpha: 0.1 });
          }
        }
      } else if (pal.tilePattern === 'cracked') {
        // Cracked ground — irregular lines
        for (let c = 0; c < 4; c++) {
          const cx0 = x + hash(px, py, 4000 + c) * w;
          const cy0 = y + hash(px, py, 4100 + c) * h;
          const cx1 = cx0 + (hash(px, py, 4200 + c) - 0.5) * 30;
          const cy1 = cy0 + (hash(px, py, 4300 + c) - 0.5) * 30;
          g.moveTo(cx0, cy0);
          g.lineTo(cx1, cy1);
          g.stroke({ color: bevelDark, width: 1, alpha: 0.15 });
        }
      } else if (pal.tilePattern === 'plank') {
        // Wooden planks — horizontal lines with slight variation
        for (let ty = 0; ty < h; ty += tileSize) {
          const plankOff = hash(px, py, 5000 + ty) * 2;
          g.rect(x + 1, y + ty + plankOff, w - 2, 1);
          g.fill({ color: gridColor, alpha: gridAlpha * 1.2 });
        }
      } else {
        // Default grid
        for (let tx = tileSize; tx < w; tx += tileSize) {
          g.rect(x + tx, y + 1, 1, h - 2);
          g.fill({ color: gridColor, alpha: gridAlpha });
        }
        for (let ty = tileSize; ty < h; ty += tileSize) {
          g.rect(x + 1, y + ty, w - 2, 1);
          g.fill({ color: gridColor, alpha: gridAlpha });
        }
      }

      // Corner accent dots
      if (!meta.isReserved && pal.neonIntensity > 0.1) {
        const cornerColor = hash(px, py, 200) < 0.5 ? pal.accentColor : 0xff0080;
        const cornerAlpha = pal.neonIntensity * 0.2;
        g.rect(x + 1, y + 1, 2, 2);
        g.fill({ color: cornerColor, alpha: cornerAlpha });
        g.rect(x + w - 3, y + 1, 2, 2);
        g.fill({ color: cornerColor, alpha: cornerAlpha * 0.7 });
        g.rect(x + 1, y + h - 3, 2, 2);
        g.fill({ color: cornerColor, alpha: cornerAlpha * 0.7 });
        g.rect(x + w - 3, y + h - 3, 2, 2);
        g.fill({ color: cornerColor, alpha: cornerAlpha * 0.5 });
      }

      // Per-plot noise texture dots
      const dotCount = Math.floor(pal.neonIntensity * 6) + 1;
      for (let d = 0; d < dotCount; d++) {
        const dx = hash(px, py, 400 + d) * (w - 4) + 2;
        const dy = hash(px, py, 500 + d) * (h - 4) + 2;
        const dotBright = hash(px, py, 600 + d) < 0.5;
        g.rect(x + dx, y + dy, 1, 1);
        g.fill({ color: dotBright ? modulateColor(plotColor, 1.4) : modulateColor(plotColor, 0.7), alpha: 0.15 });
      }
    }
  }
}

export function drawElevationShadows(g: Graphics): void {
  const range = RANGE;
  for (let px = -range; px < range; px++) {
    for (let py = -range; py < range; py++) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      const h0 = meta.elevation;
      const hRight = terrainHeight(px + 1, py);
      const hDown = terrainHeight(px, py + 1);

      const streetW = meta.streetWidthW;
      const streetH = meta.streetWidthN;
      const ox = meta.visualOffsetX + meta.rowStagger;
      const oy = meta.visualOffsetY;
      const x = px * PLOT_W + streetW / 2 + ox;
      const y = py * PLOT_H + streetH / 2 + oy;
      const w = PLOT_W - streetW;
      const h = PLOT_H - streetH;

      const slopeE = h0 - hRight;
      if (slopeE > 0.05) {
        const alpha = Math.min(0.15, slopeE * 0.5);
        g.rect(x + w - 4, y, 4, h);
        g.fill({ color: 0x000008, alpha });
      }
      const slopeS = h0 - hDown;
      if (slopeS > 0.05) {
        const alpha = Math.min(0.15, slopeS * 0.5);
        g.rect(x, y + h - 3, w, 3);
        g.fill({ color: 0x000008, alpha });
      }
    }
  }
}

export function drawOrganicPatches(g: Graphics): void {
  const range = RANGE;
  const patchCount = 18;
  for (let i = 0; i < patchCount; i++) {
    const cx = (hash(i, 0, 300) - 0.5) * range * 1.6 * PLOT_W;
    const cy = (hash(i, 1, 301) - 0.5) * range * 1.6 * PLOT_H;
    const gpx = Math.round(cx / PLOT_W);
    const gpy = Math.round(cy / PLOT_H);
    const neighborhood = getPlotMeta(gpx, gpy).neighborhood;

    if (neighborhood === 'neon_core') continue;

    const radius = 18 + hash(i, 2, 302) * 30;
    const vertices = 10 + Math.floor(hash(i, 3, 303) * 5);
    const isTeal = hash(i, 4, 304) >= 0.6;
    const baseColor = isTeal ? 0x0a1a28 : 0x0c2a18;
    const alpha = 0.2 + hash(i, 5, 305) * 0.15;

    const pts: { x: number; y: number }[] = [];
    for (let v = 0; v <= vertices; v++) {
      const angle = (v / vertices) * Math.PI * 2;
      const r = radius * (0.7 + hash(i, 10 + v, 310 + v) * 0.6);
      pts.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
    }
    g.moveTo(pts[0].x, pts[0].y);
    for (let v = 1; v < pts.length; v++) g.lineTo(pts[v].x, pts[v].y);
    g.closePath();
    g.fill({ color: baseColor, alpha });

    g.moveTo(pts[0].x, pts[0].y);
    for (let v = 1; v < pts.length; v++) {
      const px2 = cx + (pts[v].x - cx) * 0.7;
      const py2 = cy + (pts[v].y - cy) * 0.7;
      g.lineTo(px2, py2);
    }
    g.closePath();
    g.fill({ color: isTeal ? 0x0e2434 : 0x103820, alpha: alpha * 0.6 });

    const treeCount = 3 + Math.floor(hash(i, 6, 306) * 4);
    for (let t = 0; t < treeCount; t++) {
      const angle = hash(i, 20 + t, 320 + t) * Math.PI * 2;
      const dist = hash(i, 30 + t, 330 + t) * radius * 0.6;
      const tx = cx + Math.cos(angle) * dist;
      const ty = cy + Math.sin(angle) * dist;
      const tr = 3 + hash(i, 40 + t, 340 + t) * 4;
      g.circle(tx, ty, tr + 1);
      g.fill({ color: 0x082010, alpha: 0.4 });
      g.circle(tx, ty, tr);
      g.fill({ color: isTeal ? 0x0a3838 : 0x0a3818, alpha: 0.5 });
      g.circle(tx, ty, tr * 0.5);
      g.fill({ color: isTeal ? 0x00ccaa : 0x00cc66, alpha: 0.15 });
    }

    g.circle(cx, cy, radius * 0.15);
    g.fill({ color: isTeal ? 0x00fff5 : 0x00ff88, alpha: 0.05 });
  }
}

// ── Wet street reflections — neon-colored streaks on road surfaces ──
export function drawWetStreetReflections(g: Graphics): void {
  const range = RANGE;

  for (let px = -range; px < range; px++) {
    for (let py = -range; py < range; py++) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      if (pal.neonIntensity < 0.2) continue;

      // Reflections on horizontal road segments
      const roadY = py * PLOT_H;
      const roadX = px * PLOT_W;
      const streetH = meta.streetWidthN;

      // Colored reflection streak on wet road surface
      const reflColor = pal.accentColor;
      const reflAlpha = pal.neonIntensity * 0.06;

      // Horizontal road reflection — elongated streak
      const streakW = 10 + hash(px, py, 2000) * 20;
      const streakX = roadX + hash(px, py, 2001) * (PLOT_W - streakW);
      g.rect(streakX, roadY - streetH * 0.3, streakW, 2);
      g.fill({ color: reflColor, alpha: reflAlpha });
      // Diffuse glow around streak
      g.rect(streakX - 2, roadY - streetH * 0.3 - 1, streakW + 4, 4);
      g.fill({ color: reflColor, alpha: reflAlpha * 0.3 });

      // Vertical road reflection
      if (hash(px, py, 2010) < 0.6) {
        const vStreakH = 8 + hash(px, py, 2011) * 16;
        const vStreakY = roadY + hash(px, py, 2012) * (PLOT_H - vStreakH);
        const streetW = meta.streetWidthW;
        g.rect(roadX - streetW * 0.3, vStreakY, 2, vStreakH);
        g.fill({ color: reflColor, alpha: reflAlpha });
        g.rect(roadX - streetW * 0.3 - 1, vStreakY - 2, 4, vStreakH + 4);
        g.fill({ color: reflColor, alpha: reflAlpha * 0.3 });
      }

      // Puddle reflections at some intersections
      if (hash(px, py, 2020) < 0.25) {
        const pudX = roadX + hash(px, py, 2021) * 20 - 10;
        const pudY = roadY + hash(px, py, 2022) * 20 - 10;
        const pudR = 4 + hash(px, py, 2023) * 6;
        g.ellipse(pudX, pudY, pudR * 1.5, pudR);
        g.fill({ color: 0x111122, alpha: 0.3 });
        // Reflection in puddle
        g.ellipse(pudX, pudY, pudR * 1.2, pudR * 0.7);
        g.fill({ color: reflColor, alpha: 0.07 });
      }
    }
  }
}

// ── Atmospheric fog per neighborhood ──
export function drawAtmosphericFog(g: Graphics): void {
  const range = RANGE;
  // Per-neighborhood fog tint — large low-alpha overlays
  for (let px = -range; px < range; px += 3) {
    for (let py = -range; py < range; py += 3) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      const cx = px * PLOT_W + PLOT_W * 1.5;
      const cy = py * PLOT_H + PLOT_H * 1.5;
      const radius = PLOT_W * 2;

      // Subtle colored fog
      g.circle(cx, cy, radius);
      g.fill({ color: pal.accentColor, alpha: 0.012 * pal.neonIntensity });
    }
  }
}
