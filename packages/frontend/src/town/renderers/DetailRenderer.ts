// ═══════════════════════════════════════════════════════════════════
// DetailRenderer — Sidewalks, crosswalks, roundabouts, intersection glow, neon accents
// ═══════════════════════════════════════════════════════════════════

import { Graphics } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import {
  RANGE, SIDEWALK, CURB, hash, modulateColor,
  getPlotMeta, getNeighborhoodPalette, getStreetWidth,
  getRoundaboutVariant, type RoundaboutVariant,
} from '../CityLayout';

export function drawSidewalks(g: Graphics): void {
  const range = RANGE;

  for (let i = -range; i <= range; i++) {
    for (let j = -range; j <= range; j++) {
      const meta = getPlotMeta(i, j);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      const swColor = pal.sidewalkColor;
      const curbCol = pal.curbColor;

      const hsw = getStreetWidth(i, false, meta.neighborhood);
      const vsw = getStreetWidth(j, true, meta.neighborhood);

      // Horizontal road sidewalks at row i
      const hy = i * PLOT_H;
      const segLeft = j * PLOT_W - PLOT_W / 2;
      const segW = PLOT_W;

      // Top sidewalk
      g.rect(segLeft, hy - hsw / 2, segW, SIDEWALK);
      g.fill({ color: swColor });
      g.rect(segLeft, hy - hsw / 2, segW, 1);
      g.fill({ color: modulateColor(swColor, 1.3), alpha: 0.5 });
      g.rect(segLeft, hy - hsw / 2 + SIDEWALK, segW, 2);
      g.fill({ color: 0x000000, alpha: 0.25 });
      g.rect(segLeft, hy - hsw / 2 + SIDEWALK - CURB, segW, CURB);
      g.fill({ color: curbCol, alpha: 0.8 });
      for (let tx = 0; tx < segW; tx += 8) {
        g.rect(segLeft + tx, hy - hsw / 2, 1, SIDEWALK - CURB);
        g.fill({ color: modulateColor(swColor, 0.8), alpha: 0.15 });
      }

      // Bottom sidewalk
      g.rect(segLeft, hy + hsw / 2 - SIDEWALK, segW, SIDEWALK);
      g.fill({ color: swColor });
      g.rect(segLeft, hy + hsw / 2 - SIDEWALK - 2, segW, 2);
      g.fill({ color: 0x000000, alpha: 0.2 });
      g.rect(segLeft, hy + hsw / 2 - SIDEWALK, segW, 1);
      g.fill({ color: modulateColor(swColor, 1.25), alpha: 0.4 });
      g.rect(segLeft, hy + hsw / 2 - SIDEWALK, segW, CURB);
      g.fill({ color: curbCol, alpha: 0.8 });
      for (let tx = 0; tx < segW; tx += 8) {
        g.rect(segLeft + tx, hy + hsw / 2 - SIDEWALK + CURB, 1, SIDEWALK - CURB);
        g.fill({ color: modulateColor(swColor, 0.8), alpha: 0.15 });
      }

      // Left sidewalk
      const vx = j * PLOT_W;
      const segTop = i * PLOT_H - PLOT_H / 2;
      const segH = PLOT_H;

      g.rect(vx - vsw / 2, segTop, SIDEWALK, segH);
      g.fill({ color: swColor });
      g.rect(vx - vsw / 2, segTop, 1, segH);
      g.fill({ color: modulateColor(swColor, 1.3), alpha: 0.45 });
      g.rect(vx - vsw / 2 + SIDEWALK, segTop, 2, segH);
      g.fill({ color: 0x000000, alpha: 0.22 });
      g.rect(vx - vsw / 2 + SIDEWALK - CURB, segTop, CURB, segH);
      g.fill({ color: curbCol, alpha: 0.8 });
      for (let ty = 0; ty < segH; ty += 8) {
        g.rect(vx - vsw / 2, segTop + ty, SIDEWALK - CURB, 1);
        g.fill({ color: modulateColor(swColor, 0.8), alpha: 0.15 });
      }

      // Right sidewalk
      g.rect(vx + vsw / 2 - SIDEWALK, segTop, SIDEWALK, segH);
      g.fill({ color: swColor });
      g.rect(vx + vsw / 2 - SIDEWALK - 2, segTop, 2, segH);
      g.fill({ color: 0x000000, alpha: 0.18 });
      g.rect(vx + vsw / 2 - SIDEWALK, segTop, 1, segH);
      g.fill({ color: modulateColor(swColor, 1.2), alpha: 0.35 });
      g.rect(vx + vsw / 2 - SIDEWALK, segTop, CURB, segH);
      g.fill({ color: curbCol, alpha: 0.8 });
      for (let ty = 0; ty < segH; ty += 8) {
        g.rect(vx + vsw / 2 - SIDEWALK + CURB, segTop + ty, SIDEWALK - CURB, 1);
        g.fill({ color: modulateColor(swColor, 0.8), alpha: 0.15 });
      }
    }
  }
}

export function drawNeonAccents(g: Graphics): void {
  const range = RANGE;

  for (let i = -range; i <= range; i++) {
    for (let j = -range; j <= range; j++) {
      const meta = getPlotMeta(i, j);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      if (pal.neonIntensity < 0.1) continue;

      const h0 = hash(i, j, 99);
      const accentColor = h0 < 0.33 ? pal.accentColor
        : h0 < 0.66 ? 0xff0080
        : 0x00ff88;
      const alpha = pal.neonIntensity * 0.5;

      const hsw = getStreetWidth(i, false, meta.neighborhood);
      const vsw = getStreetWidth(j, true, meta.neighborhood);

      const hy = i * PLOT_H;
      const segLeft = j * PLOT_W - PLOT_W / 2;

      // Bright neon line
      g.rect(segLeft, hy - hsw / 2 + SIDEWALK, PLOT_W, 1);
      g.fill({ color: accentColor, alpha });
      g.rect(segLeft, hy + hsw / 2 - SIDEWALK - 1, PLOT_W, 1);
      g.fill({ color: accentColor, alpha });

      // Glow bloom around neon lines (wider, brighter)
      if (pal.neonIntensity > 0.3) {
        g.rect(segLeft, hy - hsw / 2 + SIDEWALK - 2, PLOT_W, 5);
        g.fill({ color: accentColor, alpha: alpha * 0.2 });
        g.rect(segLeft, hy + hsw / 2 - SIDEWALK - 3, PLOT_W, 5);
        g.fill({ color: accentColor, alpha: alpha * 0.2 });
        // Extra wide soft glow
        g.rect(segLeft, hy - hsw / 2 + SIDEWALK - 4, PLOT_W, 9);
        g.fill({ color: accentColor, alpha: alpha * 0.06 });
        g.rect(segLeft, hy + hsw / 2 - SIDEWALK - 5, PLOT_W, 9);
        g.fill({ color: accentColor, alpha: alpha * 0.06 });
      }

      const vx = j * PLOT_W;
      const segTop = i * PLOT_H - PLOT_H / 2;
      g.rect(vx - vsw / 2 + SIDEWALK, segTop, 1, PLOT_H);
      g.fill({ color: accentColor, alpha });
      g.rect(vx + vsw / 2 - SIDEWALK - 1, segTop, 1, PLOT_H);
      g.fill({ color: accentColor, alpha });

      // Vertical glow bloom (wider, brighter)
      if (pal.neonIntensity > 0.3) {
        g.rect(vx - vsw / 2 + SIDEWALK - 2, segTop, 5, PLOT_H);
        g.fill({ color: accentColor, alpha: alpha * 0.2 });
        g.rect(vx + vsw / 2 - SIDEWALK - 3, segTop, 5, PLOT_H);
        g.fill({ color: accentColor, alpha: alpha * 0.2 });
        // Extra wide soft glow
        g.rect(vx - vsw / 2 + SIDEWALK - 4, segTop, 9, PLOT_H);
        g.fill({ color: accentColor, alpha: alpha * 0.06 });
        g.rect(vx + vsw / 2 - SIDEWALK - 5, segTop, 9, PLOT_H);
        g.fill({ color: accentColor, alpha: alpha * 0.06 });
      }
    }
  }
}

export function drawIntersections(g: Graphics): void {
  const range = RANGE;

  for (let ix = -range; ix <= range; ix++) {
    for (let iy = -range; iy <= range; iy++) {
      const cx = ix * PLOT_W;
      const cy = iy * PLOT_H;
      const meta = getPlotMeta(ix, iy);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      const variant = getRoundaboutVariant(ix, iy, meta.neighborhood);

      if (variant !== 'none') {
        drawRoundabout(g, cx, cy, variant);
      } else {
        drawCrosswalk(g, cx, cy);
      }

      // Intersection pad
      const sw = 24;
      g.rect(cx - sw / 2, cy - sw / 2, sw, sw);
      g.fill({ color: pal.roadColor, alpha: 0.5 });

      // Intersection glow based on neighborhood neon intensity (BOOSTED)
      const glow = pal.neonIntensity;
      if (glow > 0.4) {
        g.circle(cx, cy, 20);
        g.fill({ color: pal.accentColor, alpha: 0.025 * glow });
        g.circle(cx, cy, 14);
        g.fill({ color: pal.accentColor, alpha: 0.06 * glow });
        g.circle(cx, cy, 8);
        g.fill({ color: pal.accentColor, alpha: 0.12 * glow });
        g.circle(cx, cy, 4);
        g.fill({ color: pal.accentColor, alpha: 0.25 * glow });
        g.circle(cx, cy, 2);
        g.fill({ color: pal.accentColor, alpha: 0.55 * glow });
        if (hash(ix, iy, 950) < 0.4) {
          g.circle(cx, cy, 12);
          g.fill({ color: 0xff0080, alpha: 0.04 });
        }
      } else if (glow > 0.15) {
        g.circle(cx, cy, 10);
        g.fill({ color: pal.accentColor, alpha: 0.05 });
        g.circle(cx, cy, 5);
        g.fill({ color: pal.accentColor, alpha: 0.14 });
        g.circle(cx, cy, 2);
        g.fill({ color: pal.accentColor, alpha: 0.4 });
      } else {
        g.circle(cx, cy, 6);
        g.fill({ color: pal.accentColor, alpha: 0.03 });
        g.circle(cx, cy, 2);
        g.fill({ color: pal.accentColor, alpha: 0.15 });
      }
    }
  }
}

function drawCrosswalk(g: Graphics, cx: number, cy: number): void {
  const stripeW = 2;
  const stripeGap = 2;
  const stripeLen = 32 - SIDEWALK * 2;
  const count = 5;
  const startOffset = -(count * (stripeW + stripeGap)) / 2;

  for (let i = 0; i < count; i++) {
    const sy = cy + startOffset + i * (stripeW + stripeGap);
    g.rect(cx - stripeLen / 2, sy, stripeLen, stripeW);
    g.fill({ color: 0x4a4a5e, alpha: 0.65 });
    g.rect(cx - stripeLen / 2, sy, stripeLen, 1);
    g.fill({ color: 0x5a5a70, alpha: 0.3 });
  }

  const stripeLenV = 24 - SIDEWALK * 2;
  for (let i = 0; i < count; i++) {
    const sx = cx + startOffset + i * (stripeW + stripeGap);
    g.rect(sx, cy - stripeLenV / 2, stripeW, stripeLenV);
    g.fill({ color: 0x4a4a5e, alpha: 0.65 });
    g.rect(sx, cy - stripeLenV / 2, 1, stripeLenV);
    g.fill({ color: 0x5a5a70, alpha: 0.3 });
  }

  const stopAlpha = 0.35;
  const stopDist = 24 / 2 + 1;
  g.rect(cx - stripeLen / 2, cy - stopDist, stripeLen, 2);
  g.fill({ color: 0x555568, alpha: stopAlpha });
  g.rect(cx - stripeLen / 2, cy + stopDist - 2, stripeLen, 2);
  g.fill({ color: 0x555568, alpha: stopAlpha });
  const stopDistH = 32 / 2 + 1;
  g.rect(cx - stopDistH, cy - stripeLenV / 2, 2, stripeLenV);
  g.fill({ color: 0x555568, alpha: stopAlpha });
  g.rect(cx + stopDistH - 2, cy - stripeLenV / 2, 2, stripeLenV);
  g.fill({ color: 0x555568, alpha: stopAlpha });
}

function drawRoundabout(g: Graphics, cx: number, cy: number, variant: RoundaboutVariant): void {
  const baseR = Math.min(32, 24) / 2 - 1;
  const scale = variant === 'large' ? 1.6 : 1;
  const r = baseR * scale;

  g.circle(cx, cy, r + 7);
  g.fill({ color: 0x00fff5, alpha: variant === 'large' ? 0.1 : 0.06 });
  g.circle(cx, cy, r + 4);
  g.fill({ color: 0x00fff5, alpha: variant === 'large' ? 0.16 : 0.1 });
  if (variant === 'large') {
    g.circle(cx, cy, r + 12);
    g.fill({ color: 0x00fff5, alpha: 0.04 });
  }

  g.circle(cx, cy, r + 1);
  g.fill({ color: 0x3a3a50 });
  g.circle(cx, cy, r);
  g.fill({ color: 0x222234 });

  const markCount = variant === 'large' ? 24 : 16;
  for (let i = 0; i < markCount; i += 2) {
    const a1 = (i / markCount) * Math.PI * 2;
    const a2 = ((i + 1) / markCount) * Math.PI * 2;
    const midR = (r + r * 0.4) / 2;
    g.moveTo(cx + Math.cos(a1) * midR, cy + Math.sin(a1) * midR);
    g.lineTo(cx + Math.cos(a2) * midR, cy + Math.sin(a2) * midR);
  }
  g.stroke({ color: 0x555540, width: 1, alpha: 0.4 });

  const innerR = r * 0.4;
  g.circle(cx, cy, innerR + 1);
  g.fill({ color: 0x3a3a50 });

  if (variant === 'vegetation') {
    g.circle(cx, cy, innerR);
    g.fill({ color: 0x0c3018 });
    g.circle(cx, cy, innerR * 0.8);
    g.fill({ color: 0x0e3a1c });
    g.circle(cx, cy, innerR * 0.5);
    g.fill({ color: 0x00ff88, alpha: 0.15 });
    for (let t = 0; t < 4; t++) {
      const angle = (t / 4) * Math.PI * 2 + 0.5;
      const tr = innerR * 0.5;
      g.circle(cx + Math.cos(angle) * tr, cy + Math.sin(angle) * tr, 2);
      g.fill({ color: 0x00cc66, alpha: 0.35 });
    }
    g.circle(cx, cy, 2);
    g.fill({ color: 0x00ff88, alpha: 0.7 });
    g.circle(cx, cy, innerR);
    g.stroke({ color: 0x00ff88, width: 1, alpha: 0.2 });
  } else if (variant === 'monument') {
    g.circle(cx, cy, innerR);
    g.fill({ color: 0x181828 });
    const ds = innerR * 0.6;
    g.moveTo(cx, cy - ds);
    g.lineTo(cx + ds * 0.7, cy);
    g.lineTo(cx, cy + ds);
    g.lineTo(cx - ds * 0.7, cy);
    g.closePath();
    g.fill({ color: 0xff0080, alpha: 0.15 });
    g.stroke({ color: 0xff0080, width: 1, alpha: 0.5 });
    g.moveTo(cx, cy - ds * 0.5);
    g.lineTo(cx + ds * 0.35, cy);
    g.lineTo(cx, cy + ds * 0.5);
    g.lineTo(cx - ds * 0.35, cy);
    g.closePath();
    g.fill({ color: 0xff0080, alpha: 0.1 });
    g.circle(cx, cy, 2);
    g.fill({ color: 0xff0080, alpha: 0.6 });
    g.circle(cx, cy, innerR);
    g.stroke({ color: 0xff0080, width: 1, alpha: 0.25 });
  } else {
    g.circle(cx, cy, innerR);
    g.fill({ color: 0x151525 });
    g.circle(cx, cy, innerR * 0.7);
    g.stroke({ color: 0x00fff5, width: 1, alpha: 0.15 });
    g.circle(cx, cy, innerR);
    g.stroke({ color: 0x00fff5, width: 1, alpha: 0.3 });
    g.circle(cx, cy, 3);
    g.fill({ color: 0x00fff5, alpha: 0.15 });
    g.circle(cx, cy, 2);
    g.fill({ color: 0x00fff5, alpha: 0.5 });
  }

  if (variant === 'large') {
    g.circle(cx, cy, innerR + 3);
    g.stroke({ color: 0x00fff5, width: 1, alpha: 0.15 });
    g.circle(cx, cy, r - 2);
    g.stroke({ color: 0x00fff5, width: 1, alpha: 0.1 });
  }

  // Entry/exit arrows
  const arrowDist = r * 0.75;
  const arrowSize = 2;
  const arrowAlpha = 0.3;
  g.moveTo(cx, cy - arrowDist - arrowSize);
  g.lineTo(cx + arrowSize, cy - arrowDist);
  g.lineTo(cx - arrowSize, cy - arrowDist);
  g.closePath();
  g.fill({ color: 0x00fff5, alpha: arrowAlpha });
  g.moveTo(cx + arrowDist + arrowSize, cy);
  g.lineTo(cx + arrowDist, cy + arrowSize);
  g.lineTo(cx + arrowDist, cy - arrowSize);
  g.closePath();
  g.fill({ color: 0x00fff5, alpha: arrowAlpha });
  g.moveTo(cx, cy + arrowDist + arrowSize);
  g.lineTo(cx - arrowSize, cy + arrowDist);
  g.lineTo(cx + arrowSize, cy + arrowDist);
  g.closePath();
  g.fill({ color: 0x00fff5, alpha: arrowAlpha });
  g.moveTo(cx - arrowDist - arrowSize, cy);
  g.lineTo(cx - arrowDist, cy - arrowSize);
  g.lineTo(cx - arrowDist, cy + arrowSize);
  g.closePath();
  g.fill({ color: 0x00fff5, alpha: arrowAlpha });
}
