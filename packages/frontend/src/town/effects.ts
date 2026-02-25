import { Container, Graphics } from 'pixi.js';
import {
  PARTICLE_COUNT,
  PARTICLE_COLORS,
  PLOT_STRIDE,
  PLOT_DISTANCE_MULT,
  COL_CYAN,
  COL_MAGENTA,
  COL_GREEN,
} from './constants';

// World extent centered on 0,0 (in plot units)
const PLOT_EXTENT = 15;
const WORLD_MIN = -PLOT_EXTENT * PLOT_STRIDE * PLOT_DISTANCE_MULT;
const WORLD_MAX = PLOT_EXTENT * PLOT_STRIDE * PLOT_DISTANCE_MULT;
const WORLD_SIZE = WORLD_MAX - WORLD_MIN;

interface Particle {
  gfx: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  color: number;
  life: number;
  maxLife: number;
}

const particles: Particle[] = [];

function randomWorldPos() {
  return WORLD_MIN + Math.random() * WORLD_SIZE;
}

function spawnParticle(layer: Container): Particle {
  const gfx = new Graphics();
  layer.addChild(gfx);

  const color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
  const size = 1 + Math.random() * 2.5;
  const alpha = 0.15 + Math.random() * 0.4;
  const maxLife = 300 + Math.random() * 500;

  const x = randomWorldPos();
  const y = randomWorldPos();
  const vx = (Math.random() - 0.5) * 0.3;
  const vy = -0.1 - Math.random() * 0.4;

  return { gfx, x, y, vx, vy, size, alpha, color, life: 0, maxLife };
}

function resetParticle(p: Particle) {
  p.x = randomWorldPos();
  p.y = randomWorldPos();
  p.vx = (Math.random() - 0.5) * 0.3;
  p.vy = -0.1 - Math.random() * 0.4;
  p.size = 1 + Math.random() * 2.5;
  p.alpha = 0.15 + Math.random() * 0.4;
  p.color = PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)];
  p.life = 0;
  p.maxLife = 300 + Math.random() * 500;
}

export function createParticles(layer: Container) {
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = spawnParticle(layer);
    p.life = Math.random() * p.maxLife;
    particles.push(p);
  }
}

export function updateParticles() {
  for (const p of particles) {
    p.life++;
    p.x += p.vx;
    p.y += p.vy;

    const lifeRatio = p.life / p.maxLife;
    let fadeAlpha = p.alpha;
    if (lifeRatio < 0.1) fadeAlpha *= lifeRatio / 0.1;
    else if (lifeRatio > 0.8) fadeAlpha *= (1 - lifeRatio) / 0.2;

    const g = p.gfx;
    g.clear();
    g.circle(p.x, p.y, p.size);
    g.fill({ color: p.color, alpha: fadeAlpha });

    if (p.size > 1.5) {
      g.circle(p.x, p.y, p.size * 2.5);
      g.fill({ color: p.color, alpha: fadeAlpha * 0.15 });
    }

    if (p.life >= p.maxLife) {
      resetParticle(p);
    }
  }
}

/** Street-level glow pools at some intersections (static) */
export function drawStreetGlow(g: Graphics) {
  const glowColors = [COL_CYAN, COL_MAGENTA, COL_GREEN];
  let colorIdx = 0;

  // Glow at road intersections (between plots)
  for (let iy = -PLOT_EXTENT; iy <= PLOT_EXTENT; iy++) {
    for (let ix = -PLOT_EXTENT; ix <= PLOT_EXTENT; ix++) {
      // Only some intersections get glow (checkerboard pattern)
      if ((Math.abs(ix) + Math.abs(iy)) % 3 !== 0) continue;

      const cx = ix * PLOT_STRIDE + PLOT_STRIDE / 2;
      const cy = iy * PLOT_STRIDE + PLOT_STRIDE / 2;
      const color = glowColors[colorIdx % glowColors.length];
      colorIdx++;

      g.circle(cx, cy, 40);
      g.fill({ color, alpha: 0.04 });
      g.circle(cx, cy, 22);
      g.fill({ color, alpha: 0.06 });
      g.circle(cx, cy, 10);
      g.fill({ color, alpha: 0.1 });
    }
  }
}

/** Vignette overlay (fixed to screen, not world) */
export function createVignette(stage: Container, screenW: number, screenH: number): Graphics {
  const g = new Graphics();
  const edgeSize = Math.max(screenW, screenH) * 0.15;
  const alpha = 0.4;

  g.rect(0, 0, screenW, edgeSize);
  g.fill({ color: 0x000000, alpha: alpha * 0.5 });

  g.rect(0, screenH - edgeSize, screenW, edgeSize);
  g.fill({ color: 0x000000, alpha: alpha * 0.7 });

  g.rect(0, 0, edgeSize, screenH);
  g.fill({ color: 0x000000, alpha: alpha * 0.4 });

  g.rect(screenW - edgeSize, 0, edgeSize, screenH);
  g.fill({ color: 0x000000, alpha: alpha * 0.4 });

  const cornerSize = edgeSize * 0.8;
  g.rect(0, 0, cornerSize, cornerSize);
  g.fill({ color: 0x000000, alpha: alpha * 0.3 });
  g.rect(screenW - cornerSize, 0, cornerSize, cornerSize);
  g.fill({ color: 0x000000, alpha: alpha * 0.3 });
  g.rect(0, screenH - cornerSize, cornerSize, cornerSize);
  g.fill({ color: 0x000000, alpha: alpha * 0.4 });
  g.rect(screenW - cornerSize, screenH - cornerSize, cornerSize, cornerSize);
  g.fill({ color: 0x000000, alpha: alpha * 0.4 });

  stage.addChild(g);
  return g;
}
