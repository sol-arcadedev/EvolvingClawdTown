// ═══════════════════════════════════════════════════════════════════
// PropRenderer — Vehicles, street furniture, sprite props, mascots, holograms
// ═══════════════════════════════════════════════════════════════════

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import {
  RANGE, hash, modulateColor,
  getPlotMeta, getNeighborhoodPalette, isReservedPlot,
  LANDMARKS, VEHICLE_COLORS, RESERVED_PLOT_SET,
} from '../CityLayout';
import { getPropTexture, getMascotTexture } from '../SpriteAssets';

function addPropSprite(
  container: Container, tex: Texture, x: number, y: number, scale: number,
): void {
  const spr = new Sprite(tex);
  spr.anchor.set(0.5, 1);
  spr.scale.set(scale);
  spr.x = x;
  spr.y = y;
  container.addChild(spr);
}

export function drawParkedVehicles(g: Graphics): void {
  const range = RANGE;
  for (let px = -range; px < range; px++) {
    for (let py = -range; py < range; py++) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      const carChance = pal.propDensity * 0.6;

      if (hash(px, py, 1100) < carChance) {
        const hy = py * PLOT_H;
        const streetH = meta.streetWidthN;
        const carX = px * PLOT_W + hash(px, py, 1101) * (PLOT_W - 14) + 2;
        const carY = hy - streetH / 2 + 7 + 1;
        const colorIdx = Math.floor(hash(px, py, 1102) * VEHICLE_COLORS.length);
        const carColor = VEHICLE_COLORS[colorIdx];
        const carW = 6 + Math.floor(hash(px, py, 1103) * 4);
        const carH = 4;

        g.rect(carX, carY, carW, carH);
        g.fill({ color: carColor, alpha: 0.6 });
        g.rect(carX + 1, carY + 1, carW - 2, carH - 2);
        g.fill({ color: modulateColor(carColor, 0.7), alpha: 0.4 });
        g.rect(carX, carY + 1, 1, 1);
        g.fill({ color: 0xffffcc, alpha: 0.6 });
        g.rect(carX + carW - 1, carY + 1, 1, 1);
        g.fill({ color: 0xff3333, alpha: 0.5 });
        g.rect(carX, carY + carH, carW, 1);
        g.fill({ color: 0x000008, alpha: 0.3 });
      }

      if (hash(px, py, 1200) < carChance * 0.7) {
        const vx = px * PLOT_W;
        const streetW = meta.streetWidthW;
        const carY = py * PLOT_H + hash(px, py, 1201) * (PLOT_H - 14) + 2;
        const carX = vx - streetW / 2 + 7 + 1;
        const colorIdx = Math.floor(hash(px, py, 1202) * VEHICLE_COLORS.length);
        const carColor = VEHICLE_COLORS[colorIdx];
        const carH = 6 + Math.floor(hash(px, py, 1203) * 4);
        const carW = 4;

        g.rect(carX, carY, carW, carH);
        g.fill({ color: carColor, alpha: 0.6 });
        g.rect(carX + 1, carY + 1, carW - 2, carH - 2);
        g.fill({ color: modulateColor(carColor, 0.7), alpha: 0.4 });
        g.rect(carX + 1, carY, 1, 1);
        g.fill({ color: 0xffffcc, alpha: 0.6 });
        g.rect(carX + 1, carY + carH - 1, 1, 1);
        g.fill({ color: 0xff3333, alpha: 0.5 });
        g.rect(carX + carW, carY, 1, carH);
        g.fill({ color: 0x000008, alpha: 0.3 });
      }
    }
  }
}

export function addStreetProps(container: Container): void {
  const range = RANGE;
  const lampTex = getPropTexture(0);
  const billboardTex = getPropTexture(1);
  const treeTex = getPropTexture(2);

  for (let px = -range; px < range; px++) {
    for (let py = -range; py < range; py++) {
      const bx = px * PLOT_W;
      const by = py * PLOT_H;
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);

      const lampChance = pal.propDensity * 0.7;
      const treeChance = pal.treeDensity;
      const billboardChance = pal.propDensity * 0.3;

      if (hash(px, py, 1) < lampChance && lampTex) {
        addPropSprite(container, lampTex,
          bx + meta.streetWidthW / 2 + 4, by + meta.streetWidthN / 2 + 4, 0.12);
      }

      if (hash(px, py, 2) < treeChance && treeTex) {
        const tx = bx + PLOT_W * 0.5;
        const ty = by - meta.streetWidthN / 2 + 3;
        addPropSprite(container, treeTex, tx, ty, 0.12);
      }

      if (pal.treeDensity > 0.3 && hash(px, py, 7) < 0.3 && treeTex) {
        const tx = bx + PLOT_W * 0.3;
        const ty = by + meta.streetWidthN / 2 - 2;
        addPropSprite(container, treeTex, tx, ty, 0.1);
      }

      if (hash(px, py, 5) < billboardChance && billboardTex) {
        const sx = bx - meta.streetWidthW / 2 + 3;
        const sy = by + PLOT_H * 0.4;
        addPropSprite(container, billboardTex, sx, sy, 0.15);
      }

      if (pal.neonIntensity > 0.8 && hash(px, py, 8) < 0.15 && billboardTex) {
        const sx = bx + PLOT_W - meta.streetWidthW / 2 - 3;
        const sy = by + PLOT_H * 0.6;
        addPropSprite(container, billboardTex, sx, sy, 0.15);
      }

      // Manholes
      if (hash(px, py, 3) < 0.25) {
        const mx = bx + PLOT_W * 0.3 + hash(px, py, 4) * PLOT_W * 0.4;
        const my = by;
        const mg = new Graphics();
        mg.circle(mx, my, 4);
        mg.fill({ color: 0x1a1a2a, alpha: 0.9 });
        mg.circle(mx, my, 3);
        mg.fill({ color: 0x222235, alpha: 0.8 });
        mg.circle(mx, my, 3);
        mg.stroke({ color: 0x333348, width: 0.5, alpha: 0.7 });
        mg.moveTo(mx - 2, my);
        mg.lineTo(mx + 2, my);
        mg.stroke({ color: 0x333348, width: 0.5, alpha: 0.5 });
        mg.moveTo(mx, my - 2);
        mg.lineTo(mx, my + 2);
        mg.stroke({ color: 0x333348, width: 0.5, alpha: 0.5 });
        container.addChild(mg);
      }

      // Utility boxes
      if (hash(px, py, 1300) < 0.3 && pal.neonIntensity > 0.1) {
        const ug = new Graphics();
        const ux = bx + meta.streetWidthW / 2 + 2;
        const uy = by + meta.streetWidthN / 2 + 2;
        const uColor = hash(px, py, 1301) < 0.5 ? 0x2a3a2a : 0x2a2a3a;
        ug.rect(ux, uy, 4, 3);
        ug.fill({ color: uColor, alpha: 0.7 });
        ug.rect(ux, uy, 4, 1);
        ug.fill({ color: modulateColor(uColor, 1.5), alpha: 0.4 });
        if (hash(px, py, 1302) < 0.5) {
          ug.rect(ux + 3, uy + 1, 1, 1);
          ug.fill({ color: pal.accentColor, alpha: 0.5 });
        }
        container.addChild(ug);
      }

      // Ventilation grates
      if (hash(px, py, 1400) < 0.15) {
        const vg = new Graphics();
        const vgx = bx + PLOT_W * 0.6;
        const vgy = by - meta.streetWidthN / 2 + 1;
        vg.rect(vgx, vgy, 6, 4);
        vg.fill({ color: 0x18182a, alpha: 0.8 });
        for (let gl = 0; gl < 3; gl++) {
          vg.rect(vgx + 1 + gl * 2, vgy, 1, 4);
          vg.fill({ color: 0x2a2a40, alpha: 0.5 });
        }
        container.addChild(vg);
      }

      // Neon ground markers
      if (pal.neonIntensity > 0.7 && hash(px, py, 1500) < 0.25) {
        const ng = new Graphics();
        const nx = bx + PLOT_W * hash(px, py, 1501);
        const ny = by + PLOT_H * hash(px, py, 1502);
        const nColor = hash(px, py, 1503) < 0.5 ? pal.accentColor : 0xff0080;
        ng.circle(nx, ny, 1.5);
        ng.fill({ color: nColor, alpha: 0.25 });
        ng.circle(nx, ny, 3);
        ng.fill({ color: nColor, alpha: 0.06 });
        container.addChild(ng);
      }

      // Reserved area tree clusters
      if (isReservedPlot(px, py) && treeTex) {
        for (let t = 0; t < 3; t++) {
          const tx = bx + PLOT_W * (0.2 + hash(px, py, 20 + t) * 0.6);
          const ty = by + PLOT_H * (0.3 + hash(px, py, 30 + t) * 0.4);
          addPropSprite(container, treeTex, tx, ty, 0.08 + hash(px, py, 40 + t) * 0.06);
        }
      }
    }
  }
}

export function addForegroundDecorations(container: Container): void {
  const billboardTex = getPropTexture(1);
  const treeTex = getPropTexture(2);
  const lampTex = getPropTexture(0);
  const jellyfishTex = getMascotTexture(0);
  const robotTex = getMascotTexture(1);
  const spongeTex = getMascotTexture(2);
  const starfishTex = getMascotTexture(3);
  const squirrelTex = getMascotTexture(4);
  const microbeTex = getMascotTexture(5);

  // Mascots at key locations
  if (jellyfishTex) addPropSprite(container, jellyfishTex, 0, -PLOT_H * 0.2, 0.55);
  if (robotTex) addPropSprite(container, robotTex, 5 * PLOT_W, -PLOT_H * 0.1, 0.5);
  if (spongeTex) addPropSprite(container, spongeTex, -6 * PLOT_W + 20, PLOT_H * 0.1, 0.5);
  if (starfishTex) addPropSprite(container, starfishTex, -PLOT_W * 0.3, -6 * PLOT_H + 10, 0.5);
  if (squirrelTex) addPropSprite(container, squirrelTex, -PLOT_W * 0.3, 5 * PLOT_H + 10, 0.5);

  if (spongeTex) addPropSprite(container, spongeTex, 3 * PLOT_W, 3 * PLOT_H + 10, 0.3);
  if (starfishTex) addPropSprite(container, starfishTex, -4 * PLOT_W, 3 * PLOT_H + 10, 0.3);
  if (squirrelTex) addPropSprite(container, squirrelTex, 3 * PLOT_W, -4 * PLOT_H + 10, 0.3);
  if (jellyfishTex) addPropSprite(container, jellyfishTex, -4 * PLOT_W, -4 * PLOT_H + 10, 0.3);

  if (robotTex) addPropSprite(container, robotTex, 7 * PLOT_W, 4 * PLOT_H + 10, 0.25);
  if (spongeTex) addPropSprite(container, spongeTex, -8 * PLOT_W + 10, 4 * PLOT_H + 10, 0.25);
  if (starfishTex) addPropSprite(container, starfishTex, 7 * PLOT_W, -5 * PLOT_H + 10, 0.25);
  if (squirrelTex) addPropSprite(container, squirrelTex, -8 * PLOT_W + 10, -5 * PLOT_H + 10, 0.25);

  if (microbeTex) {
    addPropSprite(container, microbeTex, PLOT_W * 1.5, -PLOT_H * 0.5, 0.4);
    addPropSprite(container, microbeTex, -6 * PLOT_W - 20, PLOT_H * 0.6, 0.35);
    addPropSprite(container, microbeTex, 2 * PLOT_W + 30, 2 * PLOT_H + 10, 0.2);
    addPropSprite(container, microbeTex, -3 * PLOT_W - 10, -2 * PLOT_H + 10, 0.2);
    addPropSprite(container, microbeTex, PLOT_W * 0.5, 5 * PLOT_H - 20, 0.18);
  }

  for (const lm of LANDMARKS) {
    const wcx = lm.cx * PLOT_W;
    const wcy = lm.cy * PLOT_H;

    switch (lm.type) {
      case 'plaza': {
        // Corner lamps around the mainframe (no billboard — the mainframe IS the centerpiece)
        if (lampTex) {
          addPropSprite(container, lampTex, wcx - PLOT_W * 0.7, wcy - PLOT_H * 0.3, 0.25);
          addPropSprite(container, lampTex, wcx + PLOT_W * 0.7, wcy - PLOT_H * 0.3, 0.25);
          addPropSprite(container, lampTex, wcx - PLOT_W * 0.7, wcy + PLOT_H * 0.5, 0.25);
          addPropSprite(container, lampTex, wcx + PLOT_W * 0.7, wcy + PLOT_H * 0.5, 0.25);
        }
        break;
      }
      case 'park': {
        if (treeTex) {
          const count = lm.spanX * lm.spanY * 4 + 2;
          for (let i = 0; i < count; i++) {
            const h1 = hash(lm.cx, lm.cy, 50 + i);
            const h2 = hash(lm.cx, lm.cy, 60 + i);
            const h3 = hash(lm.cx, lm.cy, 70 + i);
            const ox = (h1 - 0.5) * PLOT_W * lm.spanX * 0.8;
            const oy = (h2 - 0.5) * PLOT_H * lm.spanY * 0.6;
            const scale = 0.15 + h3 * 0.2;
            addPropSprite(container, treeTex, wcx + ox, wcy + oy + 40, scale);
          }
        }
        if (lampTex) addPropSprite(container, lampTex, wcx, wcy - 10, 0.18);
        break;
      }
      case 'billboard_cluster': {
        if (billboardTex) {
          const count = lm.spanX * 2 + 1;
          for (let i = 0; i < count; i++) {
            const h1 = hash(lm.cx, lm.cy, 80 + i);
            const ox = (i - (count - 1) / 2) * PLOT_W * 0.4;
            const scale = 0.3 + h1 * 0.2;
            addPropSprite(container, billboardTex, wcx + ox, wcy + 30, scale);
          }
        }
        if (lampTex) {
          addPropSprite(container, lampTex, wcx - PLOT_W * 0.6, wcy + 10, 0.2);
          addPropSprite(container, lampTex, wcx + PLOT_W * 0.6, wcy + 10, 0.2);
        }
        break;
      }
      case 'monument': {
        if (billboardTex) addPropSprite(container, billboardTex, wcx, wcy + 25, 0.35);
        if (lampTex) {
          addPropSprite(container, lampTex, wcx - 20, wcy + 5, 0.15);
          addPropSprite(container, lampTex, wcx + 20, wcy + 5, 0.15);
        }
        if (treeTex) {
          addPropSprite(container, treeTex, wcx - 30, wcy + 20, 0.18);
          addPropSprite(container, treeTex, wcx + 30, wcy + 20, 0.18);
        }
        break;
      }
      case 'holographic_billboard': {
        // Large billboards at each holographic billboard plaza
        if (billboardTex) {
          const count = lm.spanX * 2 + 2;
          for (let i = 0; i < count; i++) {
            const ox = (i - (count - 1) / 2) * PLOT_W * 0.35;
            const scale = 0.4 + hash(lm.cx, lm.cy, 90 + i) * 0.25;
            addPropSprite(container, billboardTex, wcx + ox, wcy + 35, scale);
          }
        }
        if (lampTex) {
          addPropSprite(container, lampTex, wcx - PLOT_W * 0.5, wcy + 15, 0.22);
          addPropSprite(container, lampTex, wcx + PLOT_W * 0.5, wcy + 15, 0.22);
          addPropSprite(container, lampTex, wcx, wcy - PLOT_H * 0.3, 0.2);
        }
        break;
      }
    }
  }

  // Scattered billboards along main avenues
  if (billboardTex) {
    for (let i = -RANGE; i < RANGE; i += 3) {
      if (!isReservedPlot(i, 0) && hash(i, 0, 100) < 0.4) {
        const wx = i * PLOT_W + PLOT_W / 2;
        addPropSprite(container, billboardTex, wx - 16, 0, 0.22);
      }
      if (!isReservedPlot(0, i) && hash(0, i, 101) < 0.4) {
        const wy = i * PLOT_H + PLOT_H / 2;
        addPropSprite(container, billboardTex, 0, wy + 20, 0.22);
      }
    }
  }

  // Large lamps at regular intervals
  if (lampTex) {
    for (let i = -RANGE; i < RANGE; i += 2) {
      if (!isReservedPlot(i, 0)) {
        const wx = i * PLOT_W + PLOT_W;
        addPropSprite(container, lampTex, wx, 24 / 2 + 5, 0.18);
      }
      if (!isReservedPlot(0, i)) {
        const wy = i * PLOT_H + PLOT_H;
        addPropSprite(container, lampTex, 32 / 2 + 5, wy, 0.18);
      }
    }
  }
}

export function drawHologramLayer(g: Graphics, time: number): void {
  g.clear();
  const t = time / 1000;

  // Downtown intersection holographic dots (central mainframe hologram now in AnimationSystem)
  for (let ix = -3; ix <= 3; ix++) {
    for (let iy = -3; iy <= 3; iy++) {
      if ((ix + iy) % 3 !== 0 || (ix === 0 && iy === 0)) continue;
      const hx = ix * PLOT_W;
      const hy = iy * PLOT_H;
      for (let p = 0; p < 3; p++) {
        const seed = hash(ix, iy, p + 10);
        const angle = t * (0.5 + seed) + seed * Math.PI * 2;
        const radius = 4 + seed * 4;
        const px2 = hx + Math.cos(angle) * radius;
        const py2 = hy + Math.sin(angle) * radius;
        const dotAlpha = 0.15 + Math.sin(t * 2 + seed * 10) * 0.1;
        g.circle(px2, py2, 1);
        g.fill({ color: 0x00fff5, alpha: dotAlpha });
      }
    }
  }

  // Landmark beacons
  for (const lm of LANDMARKS) {
    if (lm.type === 'plaza') continue;
    const px2 = lm.cx * PLOT_W;
    const py2 = lm.cy * PLOT_H;
    const beaconPulse = 0.5 + Math.sin(t * 1.5 + lm.cx + lm.cy) * 0.5;
    g.circle(px2, py2, 6 + Math.sin(t * 2) * 2);
    g.stroke({ color: 0xff0080, width: 1, alpha: 0.12 * beaconPulse });
    g.circle(px2, py2, 2);
    g.fill({ color: 0xff0080, alpha: 0.2 * beaconPulse });
  }
}
