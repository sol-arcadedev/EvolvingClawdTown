import { useEffect, useRef } from 'react';
import { useTownStore, consumeChangedAddresses, getActivityFade, consumeTilemapDirty, getBurningHouses, isStillBurning } from '../hooks/useTownStore';
import type { WalletState } from '../types';
import {
  COL_BG,
  PLOT_STRIDE,
  ZOOM_MIN,
  ZOOM_MAX,
  PARTICLE_COUNT,
  PARTICLE_COLORS,
} from './constants';
import { hsl } from './BuildingCache';
import { decodeTilemap, tileToScreen, screenToTile, TILE_W, TILE_H } from './tilemap/TilemapRenderer';
import type { DecodedTile } from './tilemap/TilemapRenderer';
import { ChunkCache } from './tilemap/ChunkCache';
import { onTileTexturesLoaded } from './tilemap/TileAtlas';

/* ───────────────────────────────────────────────────────────
 *  Canvas 2D town renderer — tilemap + buildings.
 *
 *  Renders a 256x256 isometric tilemap (terrain, districts, roads)
 *  with buildings placed on tilemap coordinates.
 *  Renders AI-generated building images, progress bars, and particles.
 * ─────────────────────────────────────────────────────────── */

const CLAWD_HQ_ADDRESS = 'clawd-architect-hq';

const BG_CSS = '#' + COL_BG.toString(16).padStart(6, '0');

// ── DECORATION SPRITES (SD-generated, loaded from /assets/decorations/) ──
const DECO_SPRITE_KEYS: Record<number, string[]> = {
  1: ['tree-1', 'tree-2', 'tree-3', 'pine-1', 'pine-2'],  // tree
  2: ['bush-1', 'bush-2'],                                   // bush
  3: ['rock-1', 'rock-2'],                                   // rock
  4: ['fountain-1'],                                          // fountain
  5: ['bench-1'],                                             // bench
  6: ['fence-1', 'fence-2'],                                  // fence
  7: ['hedge-1', 'hedge-2'],                                  // hedge
  8: ['market-1'],                                             // market stall
  9: ['crate-1'],                                              // crate cluster
  10: ['flower-1'],                                            // flower garden
  11: ['lamp-1'],                                              // lamp post
  12: ['hay-1'],                                               // hay bale
  13: ['wagon-1'],                                             // wagon/cart
};
const DECO_SPRITE_SIZE = 28;
const decoSpriteCache = new Map<string, HTMLImageElement | null>();
let decoSpritesInitialized = false;

function initDecoSprites(): void {
  if (decoSpritesInitialized) return;
  decoSpritesInitialized = true;
  for (const keys of Object.values(DECO_SPRITE_KEYS)) {
    for (const key of keys) {
      const img = new Image();
      img.src = `/assets/decorations/${key}.png`;
      img.onload = () => decoSpriteCache.set(key, img);
      img.onerror = () => decoSpriteCache.set(key, null);
    }
  }
}

function getDecoSprite(type: number, tileX: number, tileY: number): HTMLImageElement | null {
  const variants = DECO_SPRITE_KEYS[type];
  if (!variants) return null;
  const idx = ((tileX * 31 + tileY * 17) & 0x7fffffff) % variants.length;
  return decoSpriteCache.get(variants[idx]) ?? null;
}

// ── WHALE SPRITES ──
const WHALE_SPRITE_KEYS = [
  'whale-swim-1', 'whale-swim-2',   // full body right/left
  'whale-tail-1',                     // tail submerging
  'whale-breach-1',                   // dorsal surfacing
  'whale-swim-3', 'whale-swim-4',   // small calf right/left
];
const whaleSpriteCache = new Map<string, HTMLImageElement | null>();
let whaleSpritesInitialized = false;

function initWhaleSprites(): void {
  if (whaleSpritesInitialized) return;
  whaleSpritesInitialized = true;
  for (const key of WHALE_SPRITE_KEYS) {
    const img = new Image();
    img.src = `/assets/decorations/${key}.png`;
    img.onload = () => whaleSpriteCache.set(key, img);
    img.onerror = () => whaleSpriteCache.set(key, null);
  }
}

type WhalePhase = 'submerged' | 'surfacing' | 'swimming' | 'submerging';

interface WhaleEntity {
  // Position in tile coords (floating point for smooth movement)
  tx: number;
  ty: number;
  // Movement direction (tile units per frame)
  dx: number;
  dy: number;
  // Current phase and frame counter within that phase
  phase: WhalePhase;
  phaseFrame: number;
  phaseDuration: number;
  // Visual
  spriteKey: string;
  alpha: number;
  isSmall: boolean; // calf variant
  facingLeft: boolean;
}

const MAX_WHALES = 5;
const WHALE_SPEED = 0.012; // tiles per frame
const whales: WhaleEntity[] = [];
let whaleSpawnTimer = 0;

function findRandomWaterTile(decoded: DecodedTile[] | null, mapW: number, mapH: number): [number, number] | null {
  if (!decoded || mapW === 0) return null;
  // Try up to 50 random positions
  for (let attempt = 0; attempt < 50; attempt++) {
    const tx = Math.floor(Math.random() * mapW);
    const ty = Math.floor(Math.random() * mapH);
    const tile = decoded[ty * mapW + tx];
    if (tile && tile.terrain === 0 && tile.elevation > 0) {
      // Make sure it's not right at the edge (needs room to swim)
      if (tx > 3 && tx < mapW - 3 && ty > 3 && ty < mapH - 3) return [tx, ty];
    }
  }
  return null;
}

function isWaterAt(decoded: DecodedTile[] | null, mapW: number, tx: number, ty: number): boolean {
  if (!decoded || mapW === 0) return false;
  const ix = Math.floor(tx);
  const iy = Math.floor(ty);
  if (ix < 0 || ix >= mapW || iy < 0) return false;
  const tile = decoded[iy * mapW + ix];
  // Must be real water (not void — elevation 0)
  return tile ? (tile.terrain === 0 && tile.elevation > 0) : false;
}

function spawnWhale(decoded: DecodedTile[] | null, mapW: number, mapH: number): WhaleEntity | null {
  const pos = findRandomWaterTile(decoded, mapW, mapH);
  if (!pos) return null;

  const isSmall = Math.random() < 0.3;
  const facingLeft = Math.random() < 0.5;
  // Random swim direction with slight bias to go diagonally
  const angle = Math.random() * Math.PI * 2;
  const speed = WHALE_SPEED * (0.7 + Math.random() * 0.6);

  return {
    tx: pos[0],
    ty: pos[1],
    dx: Math.cos(angle) * speed,
    dy: Math.sin(angle) * speed,
    phase: 'submerged',
    phaseFrame: 0,
    phaseDuration: 60 + Math.floor(Math.random() * 120), // wait before surfacing
    spriteKey: isSmall ? (facingLeft ? 'whale-swim-4' : 'whale-swim-3') : 'whale-breach-1',
    alpha: 0,
    isSmall,
    facingLeft,
  };
}

function updateWhales(decoded: DecodedTile[] | null, mapW: number, mapH: number) {
  // Spawn new whales periodically
  whaleSpawnTimer++;
  if (whaleSpawnTimer > 180 && whales.length < MAX_WHALES) { // every ~3 seconds at 60fps
    whaleSpawnTimer = 0;
    const w = spawnWhale(decoded, mapW, mapH);
    if (w) whales.push(w);
  }

  for (let i = whales.length - 1; i >= 0; i--) {
    const w = whales[i];
    w.phaseFrame++;

    switch (w.phase) {
      case 'submerged':
        w.alpha = 0;
        if (w.phaseFrame >= w.phaseDuration) {
          w.phase = 'surfacing';
          w.phaseFrame = 0;
          w.phaseDuration = 60 + Math.floor(Math.random() * 40); // ~1-1.7 sec
          w.spriteKey = 'whale-breach-1';
        }
        break;

      case 'surfacing':
        w.alpha = Math.min(1, w.phaseFrame / 30); // fade in over 0.5 sec
        if (w.phaseFrame >= w.phaseDuration) {
          w.phase = 'swimming';
          w.phaseFrame = 0;
          w.phaseDuration = 300 + Math.floor(Math.random() * 300); // 5-10 sec swim
          // Pick swimming sprite based on direction
          if (w.isSmall) {
            w.spriteKey = w.facingLeft ? 'whale-swim-4' : 'whale-swim-3';
          } else {
            w.spriteKey = w.facingLeft ? 'whale-swim-2' : 'whale-swim-1';
          }
          w.alpha = 1;
        }
        break;

      case 'swimming':
        w.alpha = 1;
        // Move whale
        const nextTx = w.tx + w.dx;
        const nextTy = w.ty + w.dy;
        // Bounce off non-water tiles
        if (!isWaterAt(decoded, mapW, nextTx, nextTy)) {
          w.dx = -w.dx + (Math.random() - 0.5) * 0.005;
          w.dy = -w.dy + (Math.random() - 0.5) * 0.005;
          w.facingLeft = w.dx < 0;
          if (w.isSmall) {
            w.spriteKey = w.facingLeft ? 'whale-swim-4' : 'whale-swim-3';
          } else {
            w.spriteKey = w.facingLeft ? 'whale-swim-2' : 'whale-swim-1';
          }
        } else {
          w.tx = nextTx;
          w.ty = nextTy;
        }
        // Update facing based on dx
        if (w.phaseFrame % 60 === 0) {
          w.facingLeft = w.dx < 0;
          if (w.isSmall) {
            w.spriteKey = w.facingLeft ? 'whale-swim-4' : 'whale-swim-3';
          } else {
            w.spriteKey = w.facingLeft ? 'whale-swim-2' : 'whale-swim-1';
          }
        }
        if (w.phaseFrame >= w.phaseDuration) {
          w.phase = 'submerging';
          w.phaseFrame = 0;
          w.phaseDuration = 80 + Math.floor(Math.random() * 40);
          w.spriteKey = 'whale-tail-1';
        }
        break;

      case 'submerging':
        w.alpha = Math.max(0, 1 - w.phaseFrame / 50); // fade out
        if (w.phaseFrame >= w.phaseDuration) {
          // Remove whale (it will respawn later)
          whales.splice(i, 1);
        }
        break;
    }
  }
}

// ── BIRD SPRITES ──
const BIRD_SPRITE_KEYS = [
  'bird-v1-up', 'bird-v1-down',
  'bird-v2-up', 'bird-v2-down',
  'bird-v3-up', 'bird-v3-down',
];
const birdSpriteCache = new Map<string, HTMLImageElement | null>();
let birdSpritesInitialized = false;

function initBirdSprites(): void {
  if (birdSpritesInitialized) return;
  birdSpritesInitialized = true;
  for (const key of BIRD_SPRITE_KEYS) {
    const img = new Image();
    img.src = `/assets/decorations/${key}.png`;
    img.onload = () => birdSpriteCache.set(key, img);
    img.onerror = () => birdSpriteCache.set(key, null);
  }
}

interface BirdEntity {
  tx: number; ty: number;
  dx: number; dy: number;
  variant: number; // 1, 2, or 3
  flapFrame: number;
  flapInterval: number;
  wingsUp: boolean;
  glideTimer: number; // >0 means gliding (wings stay up)
  alpha: number;
}

const MAX_BIRDS = 4;
const BIRD_SPEED = 0.06;
const birds: BirdEntity[] = [];
let birdSpawnTimer = 0;

function spawnBird(mapW: number, mapH: number): BirdEntity {
  const variant = 1 + Math.floor(Math.random() * 3);
  // Pick random edge to spawn from
  const edge = Math.floor(Math.random() * 4);
  let tx: number, ty: number, dx: number, dy: number;
  const speed = BIRD_SPEED * (0.8 + Math.random() * 0.4);
  switch (edge) {
    case 0: // left
      tx = -5; ty = Math.random() * mapH;
      dx = speed; dy = (Math.random() - 0.5) * speed * 0.5;
      break;
    case 1: // right
      tx = mapW + 5; ty = Math.random() * mapH;
      dx = -speed; dy = (Math.random() - 0.5) * speed * 0.5;
      break;
    case 2: // top
      tx = Math.random() * mapW; ty = -5;
      dx = (Math.random() - 0.5) * speed * 0.5; dy = speed;
      break;
    default: // bottom
      tx = Math.random() * mapW; ty = mapH + 5;
      dx = (Math.random() - 0.5) * speed * 0.5; dy = -speed;
      break;
  }
  return {
    tx, ty, dx, dy, variant,
    flapFrame: 0,
    flapInterval: 8 + Math.floor(Math.random() * 5),
    wingsUp: true,
    glideTimer: 0,
    alpha: 1,
  };
}

function updateBirds(mapW: number, mapH: number) {
  birdSpawnTimer++;
  if (birdSpawnTimer > 300 && birds.length < MAX_BIRDS && mapW > 0) {
    birdSpawnTimer = 0;
    const b = spawnBird(mapW, mapH);
    birds.push(b);
    // 30% chance flock (2-3 extra birds)
    if (Math.random() < 0.3) {
      const flockSize = 1 + Math.floor(Math.random() * 2);
      for (let f = 0; f < flockSize && birds.length < MAX_BIRDS; f++) {
        const fb = { ...b };
        fb.tx += (Math.random() - 0.5) * 4;
        fb.ty += (Math.random() - 0.5) * 4;
        fb.flapFrame = Math.floor(Math.random() * fb.flapInterval);
        birds.push(fb);
      }
    }
  }

  for (let i = birds.length - 1; i >= 0; i--) {
    const b = birds[i];
    b.tx += b.dx;
    b.ty += b.dy;

    // Flap animation
    if (b.glideTimer > 0) {
      b.glideTimer--;
      b.wingsUp = true;
    } else {
      b.flapFrame++;
      if (b.flapFrame >= b.flapInterval) {
        b.flapFrame = 0;
        b.wingsUp = !b.wingsUp;
        // Occasional glide
        if (Math.random() < 0.15) {
          b.glideTimer = 20 + Math.floor(Math.random() * 30);
        }
      }
    }

    // Remove if far offscreen
    if (b.tx < -10 || b.tx > mapW + 10 || b.ty < -10 || b.ty > mapH + 10) {
      birds.splice(i, 1);
    }
  }
}

// ── BURNED HOUSE + FIRE SPRITES ──
const BURN_SPRITE_KEYS = ['burned-house', 'fire-1', 'fire-2'];
const burnSpriteCache = new Map<string, HTMLImageElement | null>();
let burnSpritesInitialized = false;

function initBurnSprites(): void {
  if (burnSpritesInitialized) return;
  burnSpritesInitialized = true;
  for (const key of BURN_SPRITE_KEYS) {
    const img = new Image();
    img.src = `/assets/decorations/${key}.png`;
    img.onload = () => burnSpriteCache.set(key, img);
    img.onerror = () => burnSpriteCache.set(key, null);
  }
}

// ── WIND SYSTEM ──
let windStrength = 0;
let windFrame = 0;

interface WindStreak {
  x: number; y: number;
  len: number;
  speed: number;
  alpha: number;
  life: number;
  maxLife: number;
}

const MAX_WIND_STREAKS = 40;
const windStreaks: WindStreak[] = [];

// ── RAIN SYSTEM ──
type WeatherState = 'clear' | 'drizzle' | 'rain' | 'drizzle_out';
let weatherState: WeatherState = 'clear';
let weatherTimer = 0;
let weatherDuration = 600; // frames until next transition
let rainIntensity = 0;
let rainTarget = 0;

interface RainDrop {
  x: number; y: number;
  speed: number;
  len: number;
  alpha: number;
}

const MAX_RAIN_DROPS = 200;
const rainDrops: RainDrop[] = [];

interface RainSplash {
  tx: number; ty: number;
  frame: number;
  maxFrame: number;
}

const MAX_RAIN_SPLASHES = 15;
const rainSplashes: RainSplash[] = [];
let splashSpawnTimer = 0;

function updateWeather() {
  weatherTimer++;
  if (weatherTimer >= weatherDuration) {
    weatherTimer = 0;
    switch (weatherState) {
      case 'clear':
        if (Math.random() < 0.15) {
          weatherState = 'drizzle';
          weatherDuration = 90 + Math.floor(Math.random() * 60); // 3-5s
          rainTarget = 0.3;
        } else {
          weatherDuration = 300 + Math.floor(Math.random() * 300); // 10-20s
        }
        break;
      case 'drizzle':
        weatherState = 'rain';
        weatherDuration = 300 + Math.floor(Math.random() * 450); // 10-25s
        rainTarget = 0.7 + Math.random() * 0.3;
        break;
      case 'rain':
        weatherState = 'drizzle_out';
        weatherDuration = 90 + Math.floor(Math.random() * 60);
        rainTarget = 0.15;
        break;
      case 'drizzle_out':
        weatherState = 'clear';
        weatherDuration = 300 + Math.floor(Math.random() * 600);
        rainTarget = 0;
        break;
    }
  }

  // Smooth lerp toward target
  rainIntensity += (rainTarget - rainIntensity) * 0.01;
  if (rainIntensity < 0.001) rainIntensity = 0;
}

// ── CONSTRUCTION ANIMATION (single sprite, animated programmatically) ──
let constructionImg: HTMLImageElement | null = null;
let constructionImgLoaded = false;

function initConstructionSprite(): void {
  if (constructionImgLoaded) return;
  constructionImgLoaded = true;
  const img = new Image();
  img.src = '/assets/decorations/construction-2.png';
  img.onload = () => { constructionImg = img; };
  img.onerror = () => { constructionImg = null; };
}

function drawConstructionAnim(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  bp: number, frame: number, size: number,
  camScale = 1,
): void {
  const progress = bp / 100; // 0..1

  if (constructionImg) {
    ctx.save();

    // Clip: reveal sprite from bottom up based on progress
    const revealH = size * (0.2 + progress * 0.8); // always show at least 20%
    ctx.beginPath();
    ctx.rect(x - size / 2, y - revealH + 4, size, revealH);
    ctx.clip();

    // Slight bounce when building
    const bounce = Math.sin(frame * 0.08) * (1 - progress) * 1.5;
    ctx.drawImage(constructionImg, x - size / 2, y - size + 4 + bounce, size, size);
    ctx.restore();
  } else {
    // Fallback scaffold
    const s = size * 0.4;
    ctx.strokeStyle = `hsl(30, 50%, 50%)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - s / 2, y - s * progress, s, s * progress);
  }

  // Dust / sparkle particles around the construction site
  if (camScale < 0.15) return; // skip particles when very zoomed out
  const particleCount = Math.min(2, Math.ceil((1 - progress) * 4) + 1); // capped at 2
  const t = frame * 0.05;
  for (let i = 0; i < particleCount; i++) {
    const seed = i * 137.5;
    const px = x + Math.sin(t + seed) * size * 0.45;
    const py = y - size * progress * 0.5 + Math.cos(t * 1.3 + seed) * size * 0.25;
    const sparkle = Math.sin(t * 2 + seed) * 0.5 + 0.5;
    const pSize = 1 + sparkle * 1.5;

    // Alternate between dust (brown) and sparkle (yellow)
    if (i % 2 === 0) {
      ctx.fillStyle = `rgba(180, 150, 100, ${0.3 + sparkle * 0.4})`;
    } else {
      ctx.fillStyle = `rgba(255, 230, 100, ${0.2 + sparkle * 0.5})`;
    }
    ctx.fillRect(px - pSize / 2, py - pSize / 2, pSize, pSize);
  }
}

// ── PARTICLES ──
const P_EXTENT = 2000;
const PARTICLE_CSS = PARTICLE_COLORS.map(
  c => `rgb(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff})`,
);

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  color: string;
  life: number; maxLife: number;
}

function spawnParticle(): Particle {
  return {
    x: -P_EXTENT + Math.random() * 2 * P_EXTENT,
    y: -P_EXTENT + Math.random() * 2 * P_EXTENT,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -0.1 - Math.random() * 0.4,
    size: 4 + Math.random() * 10,
    alpha: 0.2 + Math.random() * 0.5,
    color: PARTICLE_CSS[Math.floor(Math.random() * PARTICLE_CSS.length)],
    life: 0,
    maxLife: 300 + Math.random() * 500,
  };
}

function resetParticle(p: Particle) {
  p.x = -P_EXTENT + Math.random() * 2 * P_EXTENT;
  p.y = -P_EXTENT + Math.random() * 2 * P_EXTENT;
  p.vx = (Math.random() - 0.5) * 0.3;
  p.vy = -0.1 - Math.random() * 0.4;
  p.size = 4 + Math.random() * 10;
  p.alpha = 0.2 + Math.random() * 0.5;
  p.color = PARTICLE_CSS[Math.floor(Math.random() * PARTICLE_CSS.length)];
  p.life = 0;
  p.maxLife = 300 + Math.random() * 500;
}

// ── SMOKE PARTICLES (for burning houses) ──
interface SmokeParticle {
  x: number; y: number;
  vx: number; vy: number;
  size: number; alpha: number;
  life: number; maxLife: number;
}

const smokeParticles = new Map<string, SmokeParticle[]>();
const SMOKE_PER_HOUSE = 8;

function spawnSmokeParticle(): SmokeParticle {
  return {
    x: (Math.random() - 0.5) * 12,
    y: 0,
    vx: (Math.random() - 0.5) * 0.3,
    vy: -(0.8 + Math.random() * 0.7),
    size: 3 + Math.random() * 3,
    alpha: 0.6 + Math.random() * 0.3,
    life: Math.floor(Math.random() * 400), // stagger initial spawns
    maxLife: 500 + Math.floor(Math.random() * 200),
  };
}

function resetSmokeParticle(p: SmokeParticle) {
  p.x = (Math.random() - 0.5) * 12;
  p.y = 0;
  p.vx = (Math.random() - 0.5) * 0.3;
  p.vy = -(0.8 + Math.random() * 0.7);
  p.size = 3 + Math.random() * 3;
  p.alpha = 0.6 + Math.random() * 0.3;
  p.life = 0;
  p.maxLife = 500 + Math.floor(Math.random() * 200);
}


// ── CLAWD HQ STATIC IMAGE ──
let clawdHQImage: HTMLImageElement | null = null;
let clawdHQLoading = false;

function getClawdHQImage(): HTMLImageElement | null {
  if (clawdHQImage) return clawdHQImage;
  if (clawdHQLoading) return null;
  clawdHQLoading = true;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { clawdHQImage = img; clawdHQLoading = false; };
  img.onerror = () => { clawdHQLoading = false; };
  img.src = '/assets/clawd-hq.png';
  return null;
}

// ── AI IMAGE CACHE ──
const aiImageCache = new Map<string, HTMLImageElement | null>();
const aiImageLoading = new Set<string>();

function getAIImage(addr: string, url: string | null | undefined): HTMLImageElement | null {
  if (!url) return null;
  const cached = aiImageCache.get(addr);
  if (cached !== undefined) return cached;
  if (aiImageLoading.has(addr)) return null;
  aiImageLoading.add(addr);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => { aiImageCache.set(addr, img); aiImageLoading.delete(addr); };
  img.onerror = () => { aiImageCache.set(addr, null); aiImageLoading.delete(addr); };
  img.src = url;
  return null;
}

// ── Building rendering data ──
interface Bld {
  wx: number; wy: number;
  tileX: number; tileY: number;
  tier: number; hue: number;
  bp: number; dmg: number;
  addr: string;
  depth: number;
  customImageUrl?: string | null;
}

function makeBld(addr: string, w: WalletState, tiles: DecodedTile[] | null, mapW: number): Bld {
  // Convert tilemap coords to isometric screen coords, matching tile elevation
  // Center building in its 3x3 plot (plotX/plotY is top-left origin)
  const centerX = w.plotX + 1;
  const centerY = w.plotY + 1;
  const elev = tiles ? (tiles[centerY * mapW + centerX]?.elevation ?? 0) / 255 * 3 : 0;
  const [wx, wy] = tileToScreen(centerX, centerY, elev);
  const tier = Math.min(w.houseTier, 5);
  return {
    wx, wy,
    tileX: w.plotX, tileY: w.plotY,
    tier, hue: w.colorHue,
    bp: w.buildProgress, dmg: w.damagePct, addr,
    depth: w.plotX + w.plotY, // isometric depth sort
    customImageUrl: w.customImageUrl,
  };
}

function shouldInclude(_addr: string, w: WalletState, tiles: DecodedTile[] | null, mapW: number): boolean {
  if (_addr === CLAWD_HQ_ADDRESS) return true;
  if (w.tokenBalance === '0' || Number(w.tokenBalance) <= 0) return false;
  // Skip buildings placed on water tiles (e.g. from failed town expansion)
  if (tiles && mapW > 0) {
    const cx = w.plotX + 1, cy = w.plotY + 1;
    const tile = tiles[cy * mapW + cx];
    if (tile && tile.terrain === 0) return false; // terrain 0 = water
  }
  return true;
}

// ── MAIN COMPONENT ──

export default function TownCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const _canvas = canvasRef.current;
    if (!_canvas) return;
    const _ctx = _canvas.getContext('2d');
    if (!_ctx) return;
    const canvas: HTMLCanvasElement = _canvas;
    const ctx: CanvasRenderingContext2D = _ctx;

    // Chunk cache for tilemap ground rendering
    const chunkCache = new ChunkCache();
    let decodedTiles: DecodedTile[] | null = null;

    // When tile textures finish loading, rebuild all chunk canvases
    onTileTexturesLoaded(() => {
      chunkCache.invalidateAll();
      dirty = true;
    });

    // Camera — start centered on tile (128, 128) = map center
    const [initCX, initCY] = tileToScreen(128, 128, 0);
    let camX = -initCX * 0.25, camY = -initCY * 0.25;
    let camScale = 0.25;
    let dragging = false, lastPX = 0, lastPY = 0;
    let dirty = true;

    let lastInteractTime = 0;
    const INTERACT_COOLDOWN = 200;

    // Building structures
    const bldMap = new Map<string, Bld>();
    let sortedBlds: Bld[] = [];
    const gridIndex = new Map<string, Bld>();

    // Decoration spatial index (16-tile chunks)
    const decoChunkIndex = new Map<string, Array<{x: number; y: number; type: number}>>();
    let lastDecoLength = -1;

    // Water animation throttle (update wave time every 6 frames)
    let waterAnimT = 0;

    // Hover
    let hoveredAddr: string | null = null;
    let hoverClearTimer: ReturnType<typeof setTimeout> | null = null;

    // ── RESIZE ──
    function resize() {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      dirty = true;
    }
    resize();
    window.addEventListener('resize', resize);

    // ── CAMERA ──
    let dragOffsetX = 0, dragOffsetY = 0;

    const onPointerDown = (e: PointerEvent) => {
      dragging = true; lastPX = e.clientX; lastPY = e.clientY;
      dragOffsetX = 0; dragOffsetY = 0;
      canvas.style.cursor = 'grabbing';
      canvas.style.willChange = 'transform';
      if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = null; }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      dragOffsetX += e.clientX - lastPX;
      dragOffsetY += e.clientY - lastPY;
      lastPX = e.clientX; lastPY = e.clientY;
      lastInteractTime = performance.now();
      canvas.style.transform = `translate(${dragOffsetX}px,${dragOffsetY}px)`;
    };
    const onPointerUp = () => {
      if (dragging) {
        camX += dragOffsetX;
        camY += dragOffsetY;
        canvas.style.transform = '';
        canvas.style.willChange = '';
        dragOffsetX = 0; dragOffsetY = 0;
        dirty = true;
      }
      dragging = false; canvas.style.cursor = 'grab';
    };
    let lastZoomDraw = 0;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const oldS = camScale;
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      camScale = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, camScale * factor));
      lastInteractTime = performance.now();
      const cx = canvas.clientWidth / 2 + camX;
      const cy = canvas.clientHeight / 2 + camY;
      const wx = (mx - cx) / oldS, wy = (my - cy) / oldS;
      camX = mx - canvas.clientWidth / 2 - wx * camScale;
      camY = my - canvas.clientHeight / 2 - wy * camScale;
      const now = performance.now();
      if (now - lastZoomDraw > 33) {
        dirty = true;
        lastZoomDraw = now;
      }
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.style.cursor = 'grab';

    // ── HOVER ──
    let hoverThrottle = 0;
    const onMouseMove = (e: MouseEvent) => {
      if (dragging) return;
      const now = performance.now();
      if (now - hoverThrottle < 80) return;
      hoverThrottle = now;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const cx = canvas.clientWidth / 2 + camX;
      const cy = canvas.clientHeight / 2 + camY;
      const worldX = (mx - cx) / camScale, worldY = (my - cy) / camScale;

      // Use screenToTile for O(1) tile lookup
      const [tileX, tileY] = screenToTile(worldX, worldY);

      // Check for buildings in 3x3 tile neighborhood
      let best: string | null = null;
      let bestD2 = TILE_W * TILE_W;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const b = gridIndex.get(`${tileX + dx},${tileY + dy}`);
          if (!b) continue;
          const ddx = worldX - b.wx, ddy = worldY - b.wy;
          const d2 = ddx * ddx + ddy * ddy;
          if (d2 < bestD2) { bestD2 = d2; best = b.addr; }
        }
      }

      if (best !== hoveredAddr) {
        hoveredAddr = best;
        useTownStore.getState().setHoveredHouse(
          best, best ? { x: e.clientX, y: e.clientY } : undefined,
        );
      } else if (best) {
        useTownStore.getState().setHoveredHouse(best, { x: e.clientX, y: e.clientY });
      }
    };
    const onMouseLeave = () => {
      hoverClearTimer = setTimeout(() => {
        hoveredAddr = null;
        useTownStore.getState().setHoveredHouse(null);
      }, 150);
    };
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseleave', onMouseLeave);

    (window as any).__cancelHoverClear = () => {
      if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = null; }
    };

    let frame = 0;

    // No staged reveal — all clients see the same complete state immediately

    // ── LOCATE HOUSE ──
    useTownStore.getState().setLocateHouse((address: string) => {
      const w = useTownStore.getState().wallets.get(address);
      if (!w) return;
      const [tx, ty] = tileToScreen(w.plotX, w.plotY, 0);
      camScale = 1.2;
      camX = -tx * camScale;
      camY = -ty * camScale;
      dirty = true;
    });

    // ── SYNC TILEMAP FROM STORE ──
    function syncTilemap() {
      if (!consumeTilemapDirty()) return;

      const store = useTownStore.getState();
      if (!store.tilemap || store.mapWidth === 0) return;

      // Clear whales on tilemap change (reseed)
      whales.length = 0;
      whaleSpawnTimer = 0;

      decodedTiles = decodeTilemap(store.tilemap, store.mapWidth, store.mapHeight);
      chunkCache.setTilemap(decodedTiles, store.mapWidth, store.mapHeight);
      dirty = true;
    }

    // ── SYNC BUILDINGS FROM STORE ──
    function fullRebuild() {
      bldMap.clear();
      gridIndex.clear();
      const wallets = useTownStore.getState().wallets;
      const mw = useTownStore.getState().mapWidth;
      for (const [addr, w] of wallets) {
        if (!shouldInclude(addr, w, decodedTiles, mw)) continue;
        const bld = makeBld(addr, w, decodedTiles, mw);
        bldMap.set(addr, bld);
        gridIndex.set(`${w.plotX},${w.plotY}`, bld);
      }
      sortedBlds = Array.from(bldMap.values());
      sortedBlds.sort((a, b) => a.depth - b.depth);

      // Rebuild decoration spatial index
      const decos = useTownStore.getState().decorations;
      decoChunkIndex.clear();
      for (const d of decos) {
        const key = `${d.x >> 4},${d.y >> 4}`;
        let arr = decoChunkIndex.get(key);
        if (!arr) { arr = []; decoChunkIndex.set(key, arr); }
        arr.push(d);
      }
      lastDecoLength = decos.length;

      dirty = true;
    }

    function syncFromStore() {
      const { snapshot, changed } = consumeChangedAddresses();
      if (snapshot) { fullRebuild(); return; }
      if (changed.size === 0) return;

      const wallets = useTownStore.getState().wallets;
      let structural = false;

      for (const addr of changed) {
        const w = wallets.get(addr);
        const existing = bldMap.get(addr);
        const keep = w != null && shouldInclude(addr, w, decodedTiles, useTownStore.getState().mapWidth);

        if (!keep) {
          if (existing) {
            bldMap.delete(addr);
            gridIndex.delete(`${existing.tileX},${existing.tileY}`);
            structural = true;
          }
          continue;
        }

        const mw = useTownStore.getState().mapWidth;
        if (!existing) {
          const bld = makeBld(addr, w, decodedTiles, mw);
          bldMap.set(addr, bld);
          gridIndex.set(`${w.plotX},${w.plotY}`, bld);
          structural = true;
        } else {
          const elev = decodedTiles ? (decodedTiles[w.plotY * mw + w.plotX]?.elevation ?? 0) / 255 * 3 : 0;
          const [newWx, newWy] = tileToScreen(w.plotX, w.plotY, elev);
          if (existing.tileX !== w.plotX || existing.tileY !== w.plotY) {
            gridIndex.delete(`${existing.tileX},${existing.tileY}`);
            existing.wx = newWx;
            existing.wy = newWy;
            existing.tileX = w.plotX;
            existing.tileY = w.plotY;
            existing.depth = w.plotX + w.plotY;
            gridIndex.set(`${w.plotX},${w.plotY}`, existing);
            structural = true;
          }
          const newTier = Math.min(w.houseTier, 5);
          existing.tier = newTier;
          existing.hue = w.colorHue;
          existing.bp = w.buildProgress;
          existing.dmg = w.damagePct;
          existing.customImageUrl = w.customImageUrl;
        }
      }

      if (structural) {
        sortedBlds = Array.from(bldMap.values());
        sortedBlds.sort((a, b) => a.depth - b.depth);
      }
      dirty = true;
    }

    // ── DRAW ──
    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;

      // Cache store reads once per frame
      const store = useTownStore.getState();
      const mapW = store.mapWidth;
      const mapH = store.mapHeight;
      const decorations = store.decorations;

      // Background
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG_CSS;
      ctx.fillRect(0, 0, w, h);

      // Camera transform
      const cx = w / 2 + camX, cy = h / 2 + camY;
      ctx.setTransform(dpr * camScale, 0, 0, dpr * camScale, dpr * cx, dpr * cy);

      const showAnim = !dragging && (performance.now() - lastInteractTime > INTERACT_COOLDOWN);

      // Viewport bounds for culling
      const inv = 1 / camScale;
      const vl = -cx * inv - 200;
      const vt = -cy * inv - 200;
      const vr = (w - cx) * inv + 200;
      const vb = (h - cy) * inv + 200;

      // ── 1. TILEMAP GROUND (chunked) ──
      chunkCache.drawVisibleChunks(ctx, cx, cy, camScale, w, h);

      // ── 1.2. ANIMATED WATER OVERLAY ──
      if (decodedTiles && showAnim && camScale >= 0.1 && mapW > 0) {
        // Throttle wave animation update to every 6 frames (~100ms at 30fps)
        if (frame % 6 === 0) waterAnimT = frame * 0.04;

        const [tMinX, tMinY] = screenToTile(vl, vt);
        const [tMaxX, tMaxY] = screenToTile(vr, vb);
        const txStart = Math.max(0, Math.min(tMinX, tMinY) - 2);
        const txEnd = Math.min(mapW - 1, Math.max(tMaxX, tMaxY) + 2);
        const tyStart = Math.max(0, Math.min(tMinX, tMinY) - 2);
        const tyEnd = Math.min(mapH - 1, Math.max(tMaxX, tMaxY) + 2);

        const t = waterAnimT;
        const hw = TILE_W / 2, hh = TILE_H / 2;

        for (let ty2 = tyStart; ty2 <= tyEnd; ty2++) {
          for (let tx = txStart; tx <= txEnd; tx++) {
            const tile = decodedTiles[ty2 * mapW + tx];
            if (!tile || tile.terrain !== 0 || tile.elevation === 0) continue;

            const elev = tile.elevation / 255 * 3;
            const [sx, sy] = tileToScreen(tx, ty2, elev);
            if (sx < vl || sx > vr || sy < vt || sy > vb) continue;

            const wave1 = Math.sin(t + tx * 0.5 + ty2 * 0.4) * 0.5 + 0.5;
            const wave2 = Math.sin(t * 0.6 + tx * 0.3 - ty2 * 0.6) * 0.5 + 0.5;
            const wave3 = Math.sin(t * 1.2 + tx * 0.7 + ty2 * 0.2) * 0.5 + 0.5;

            ctx.save();
            ctx.beginPath();
            ctx.moveTo(sx, sy - hh);
            ctx.lineTo(sx + hw, sy);
            ctx.lineTo(sx, sy + hh);
            ctx.lineTo(sx - hw, sy);
            ctx.closePath();
            ctx.clip();

            const alpha1 = 0.12 + wave1 * 0.18;
            ctx.fillStyle = `rgba(150, 210, 255, ${alpha1})`;
            ctx.fillRect(sx - hw, sy - hh, TILE_W, TILE_H);

            const alpha2 = 0.08 + wave2 * 0.14;
            ctx.fillStyle = `rgba(10, 40, 100, ${alpha2})`;
            const bandY = Math.sin(t * 0.5 + tx * 0.3) * hh * 0.6;
            ctx.fillRect(sx - hw, sy + bandY - 2, TILE_W, 4);

            const alpha3 = wave3 * 0.3;
            ctx.fillStyle = `rgba(220, 240, 255, ${alpha3})`;
            const glintX = sx + Math.sin(t * 0.8 + ty2 * 0.4) * hw * 0.4;
            const glintY = sy + Math.cos(t * 0.6 + tx * 0.5) * hh * 0.3;
            ctx.beginPath();
            ctx.arc(glintX, glintY, 2.5, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
          }
        }
      }

      // ── 1.3. WHALES (skip when zoomed out) ──
      initWhaleSprites();
      if (decodedTiles && showAnim && camScale >= 0.1) {
        updateWhales(decodedTiles, mapW, mapH);
        const maxVisible = camScale < 0.15 ? 2 : whales.length;
        let rendered = 0;
        for (const whale of whales) {
          if (rendered >= maxVisible) break;
          if (whale.alpha <= 0) continue;
          const [sx, sy] = tileToScreen(whale.tx, whale.ty, 0);
          if (sx < vl || sx > vr || sy < vt || sy > vb) continue;

          const sprite = whaleSpriteCache.get(whale.spriteKey);
          if (sprite) {
            ctx.save();
            ctx.globalAlpha = whale.alpha;
            const bob = whale.phase === 'swimming'
              ? Math.sin(frame * 0.06 + whale.tx * 2) * 1.5
              : 0;
            const size = whale.isSmall ? 52 : 72;
            const sizeH = size * (32 / 48);
            ctx.drawImage(sprite, sx - size / 2, sy - sizeH / 2 + bob, size, sizeH);
            ctx.globalAlpha = 1;
            ctx.restore();
            rendered++;
          }
        }
      }

      // ── 1.5. DECORATIONS (spatial-indexed) ──
      initDecoSprites();
      initConstructionSprite();

      // Rebuild deco index if decorations changed
      if (decorations.length !== lastDecoLength) {
        decoChunkIndex.clear();
        for (const d of decorations) {
          const key = `${d.x >> 4},${d.y >> 4}`;
          let arr = decoChunkIndex.get(key);
          if (!arr) { arr = []; decoChunkIndex.set(key, arr); }
          arr.push(d);
        }
        lastDecoLength = decorations.length;
      }

      if (decorations.length > 0 && decodedTiles && mapW > 0) {
        // Compute visible chunk range from viewport
        const [tMinX2, tMinY2] = screenToTile(vl, vt);
        const [tMaxX2, tMaxY2] = screenToTile(vr, vb);
        const cxStart = Math.max(0, (Math.min(tMinX2, tMinY2) - 2) >> 4);
        const cxEnd = (Math.max(tMaxX2, tMaxY2) + 2) >> 4;
        const cyStart = cxStart;
        const cyEnd = cxEnd;
        const skipProgrammatic = camScale < 0.1;

        for (let ccy = cyStart; ccy <= cyEnd; ccy++) {
          for (let ccx = cxStart; ccx <= cxEnd; ccx++) {
            const chunk = decoChunkIndex.get(`${ccx},${ccy}`);
            if (!chunk) continue;

            for (const deco of chunk) {
              const tIdx = deco.y * mapW + deco.x;
              const elev = decodedTiles[tIdx] ? decodedTiles[tIdx].elevation / 255 * 3 : 0;
              const [dx, dy] = tileToScreen(deco.x, deco.y, elev);
              if (dx < vl || dx > vr || dy < vt || dy > vb) continue;


              const sprite = getDecoSprite(deco.type, deco.x, deco.y);
              if (sprite) {
                const s = deco.type === 1 ? DECO_SPRITE_SIZE : DECO_SPRITE_SIZE * 0.7;
                // Wind sway for trees
                const sway = deco.type === 1
                  ? Math.sin(frame * 0.03 + deco.x * 0.7) * windStrength * 1.5
                  : 0;
                ctx.drawImage(sprite, dx - s / 2 + sway, dy - s, s, s);
                continue;
              }

              // Skip programmatic fallbacks when very zoomed out
              if (skipProgrammatic) continue;

              const dSeed = (deco.x * 31 + deco.y * 17) & 0xffff;

              switch (deco.type) {
                case 1: { // tree
                  const variant = dSeed % 3;
                  if (variant === 2) {
                    ctx.fillStyle = '#5a3a18';
                    ctx.fillRect(dx - 1.5, dy - 6, 3, 6);
                    const layers = [
                      { yo: -6, w: 12, h: 7, c: '#2d7a2d', dc: '#1a5a1a' },
                      { yo: -11, w: 10, h: 6, c: '#3d9a3d', dc: '#267a26' },
                      { yo: -15, w: 7, h: 5, c: '#4daa4d', dc: '#308a30' },
                    ];
                    for (const l of layers) {
                      ctx.fillStyle = l.c;
                      ctx.beginPath();
                      ctx.moveTo(dx - l.w / 2, dy + l.yo);
                      ctx.lineTo(dx, dy + l.yo - l.h);
                      ctx.lineTo(dx + l.w / 2, dy + l.yo);
                      ctx.closePath();
                      ctx.fill();
                      ctx.fillStyle = l.dc;
                      ctx.beginPath();
                      ctx.moveTo(dx - l.w / 2, dy + l.yo);
                      ctx.lineTo(dx - l.w * 0.15, dy + l.yo - l.h * 0.9);
                      ctx.lineTo(dx - 1, dy + l.yo);
                      ctx.closePath();
                      ctx.fill();
                    }
                  } else {
                    const tall = variant === 1;
                    const trunkH = tall ? 10 : 7;
                    const cr = tall ? 9 : 8;
                    const cy2 = dy - trunkH - cr + 2;
                    ctx.fillStyle = 'rgba(0,0,0,0.12)';
                    ctx.beginPath(); ctx.ellipse(dx + 2, dy + 1, 8, 3, 0, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#5a3a18';
                    ctx.fillRect(dx - 2, dy - trunkH, 4, trunkH);
                    ctx.fillStyle = '#7a5a30';
                    ctx.fillRect(dx - 1, dy - trunkH, 2, trunkH);
                    ctx.fillStyle = '#2a6e2a';
                    ctx.beginPath(); ctx.arc(dx, cy2, cr, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#3d8c3d';
                    ctx.beginPath(); ctx.arc(dx - 2, cy2 - 1, cr - 2, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#50a850';
                    ctx.beginPath(); ctx.arc(dx - 1, cy2 - 3, cr - 4, 0, Math.PI * 2); ctx.fill();
                    ctx.fillStyle = '#68c048';
                    ctx.beginPath(); ctx.arc(dx - 2, cy2 - 4, 3, 0, Math.PI * 2); ctx.fill();
                  }
                  break;
                }
                case 2: { // bush
                  ctx.fillStyle = 'rgba(0,0,0,0.08)';
                  ctx.beginPath(); ctx.ellipse(dx + 1, dy + 1, 6, 2, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#3a7a2a';
                  ctx.beginPath(); ctx.arc(dx, dy - 3, 5, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#5aaa45';
                  ctx.beginPath(); ctx.arc(dx - 1, dy - 4, 3.5, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#70c050';
                  ctx.beginPath(); ctx.arc(dx - 1, dy - 5, 2, 0, Math.PI * 2); ctx.fill();
                  break;
                }
                case 3: { // rock
                  ctx.fillStyle = 'rgba(0,0,0,0.08)';
                  ctx.beginPath(); ctx.ellipse(dx + 1, dy + 1, 5, 2, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#8a7050';
                  ctx.beginPath(); ctx.moveTo(dx - 5, dy); ctx.lineTo(dx - 2, dy - 6); ctx.lineTo(dx + 1, dy - 5); ctx.lineTo(dx + 1, dy); ctx.closePath(); ctx.fill();
                  ctx.fillStyle = '#a89070';
                  ctx.beginPath(); ctx.moveTo(dx + 1, dy); ctx.lineTo(dx + 1, dy - 5); ctx.lineTo(dx + 5, dy - 3); ctx.lineTo(dx + 5, dy); ctx.closePath(); ctx.fill();
                  ctx.fillStyle = '#baa880';
                  ctx.beginPath(); ctx.moveTo(dx - 2, dy - 6); ctx.lineTo(dx + 1, dy - 7); ctx.lineTo(dx + 5, dy - 3); ctx.lineTo(dx + 1, dy - 5); ctx.closePath(); ctx.fill();
                  break;
                }
                case 4: { // fountain
                  ctx.fillStyle = '#9a8a70';
                  ctx.beginPath(); ctx.ellipse(dx, dy, 7, 4, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#5090cc';
                  ctx.beginPath(); ctx.ellipse(dx, dy - 1, 5.5, 3, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#70b0e8';
                  ctx.beginPath(); ctx.ellipse(dx - 1, dy - 2, 3, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#a09080';
                  ctx.fillRect(dx - 1, dy - 7, 2, 6);
                  ctx.fillStyle = '#90c8f0';
                  ctx.beginPath(); ctx.arc(dx, dy - 8, 2, 0, Math.PI * 2); ctx.fill();
                  break;
                }
                case 5: { // bench
                  ctx.fillStyle = 'rgba(0,0,0,0.08)';
                  ctx.beginPath(); ctx.ellipse(dx, dy + 1, 7, 2, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#8b6914';
                  ctx.beginPath(); ctx.moveTo(dx - 6, dy - 1); ctx.lineTo(dx - 4, dy - 3); ctx.lineTo(dx + 6, dy - 3); ctx.lineTo(dx + 4, dy - 1); ctx.closePath(); ctx.fill();
                  ctx.fillStyle = '#a08020';
                  ctx.beginPath(); ctx.moveTo(dx - 5, dy - 2); ctx.lineTo(dx - 3, dy - 3.5); ctx.lineTo(dx + 5, dy - 3.5); ctx.lineTo(dx + 3, dy - 2); ctx.closePath(); ctx.fill();
                  ctx.fillStyle = '#6a4a10';
                  ctx.fillRect(dx - 5, dy - 1, 2, 3);
                  ctx.fillRect(dx + 3, dy - 1, 2, 3);
                  break;
                }
                case 6: { // fence
                  ctx.fillStyle = 'rgba(0,0,0,0.06)';
                  ctx.beginPath(); ctx.ellipse(dx, dy + 1, 8, 1.5, 0, 0, Math.PI * 2); ctx.fill();
                  // Posts
                  ctx.fillStyle = '#7a4b23';
                  ctx.fillRect(dx - 6, dy - 10, 2, 10);
                  ctx.fillRect(dx - 1, dy - 10, 2, 10);
                  ctx.fillRect(dx + 4, dy - 10, 2, 10);
                  // Rails
                  ctx.fillStyle = '#8c5a2a';
                  ctx.fillRect(dx - 6, dy - 8, 12, 1.5);
                  ctx.fillRect(dx - 6, dy - 4, 12, 1.5);
                  break;
                }
                case 7: { // hedge
                  ctx.fillStyle = 'rgba(0,0,0,0.08)';
                  ctx.beginPath(); ctx.ellipse(dx, dy + 1, 8, 2, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#2a5e22';
                  ctx.fillRect(dx - 7, dy - 6, 14, 6);
                  ctx.fillStyle = '#3a7e32';
                  ctx.beginPath(); ctx.ellipse(dx, dy - 6, 7, 3, 0, 0, Math.PI * 2); ctx.fill();
                  ctx.fillStyle = '#4a9a42';
                  ctx.beginPath(); ctx.ellipse(dx - 1, dy - 7, 4, 2, 0, 0, Math.PI * 2); ctx.fill();
                  break;
                }
              }
            }
          }
        }
      }

      // ── 1.8. WIND STREAKS ──
      // Update wind strength (oscillates via sine, ~30s cycle)
      windFrame++;
      windStrength = (Math.sin(windFrame * 0.0035) * 0.5 + 0.5);

      if (showAnim && windStrength > 0.1 && camScale >= 0.1 && decodedTiles && mapW > 0) {
        // Compute tilemap world-space bounds from actual visible tile radius
        const windMapCx = Math.floor(mapW / 2);
        const windMapCy = Math.floor(mapH / 2);
        const [windCenterX, windCenterY] = tileToScreen(windMapCx, windMapCy, 0);
        // Find max radius of non-void tiles (cached — only recompute when tilemap changes)
        let visibleRadius = 0;
        for (let ty2 = 0; ty2 < mapH; ty2 += 4) {
          for (let tx2 = 0; tx2 < mapW; tx2 += 4) {
            const tile = decodedTiles[ty2 * mapW + tx2];
            if (!tile || (tile.terrain === 0 && tile.elevation === 0)) continue;
            const dr = Math.sqrt((tx2 - windMapCx) ** 2 + (ty2 - windMapCy) ** 2);
            if (dr > visibleRadius) visibleRadius = dr;
          }
        }
        // Convert tile radius to world-space extent (isometric)
        const windExtentX = visibleRadius * TILE_W * 0.55;
        const windExtentY = visibleRadius * TILE_H * 0.55;
        const windLeft = windCenterX - windExtentX;
        const windRight = windCenterX + windExtentX;
        const windTop = windCenterY - windExtentY;
        const windBottom = windCenterY + windExtentY;

        // Spawn new streaks at left edge of tilemap area
        // maxLife must be long enough to cross the full tilemap width
        const windWidth = windRight - windLeft;
        if (windStreaks.length < MAX_WIND_STREAKS && Math.random() < windStrength * 0.8) {
          const spd = 4 + Math.random() * 5;
          windStreaks.push({
            x: windLeft - 50,
            y: windTop + Math.random() * (windBottom - windTop),
            len: 120 + Math.random() * 200,
            speed: spd,
            alpha: 0,
            life: 0,
            maxLife: Math.ceil((windWidth + 250) / spd), // enough frames to cross entire town
          });
        }

        ctx.save();
        ctx.lineWidth = 2.5;
        for (let i = windStreaks.length - 1; i >= 0; i--) {
          const s = windStreaks[i];
          s.x += s.speed;
          s.life++;
          // Fade in/out
          const lifeRatio = s.life / s.maxLife;
          if (lifeRatio < 0.2) s.alpha = lifeRatio / 0.2 * 0.7 * windStrength;
          else if (lifeRatio > 0.7) s.alpha = (1 - lifeRatio) / 0.3 * 0.7 * windStrength;
          else s.alpha = 0.7 * windStrength;

          if (s.life >= s.maxLife || s.x > windRight) {
            windStreaks.splice(i, 1);
            continue;
          }

          ctx.strokeStyle = `rgba(255, 255, 255, ${s.alpha})`;
          ctx.beginPath();
          ctx.moveTo(s.x, s.y);
          ctx.lineTo(s.x + s.len, s.y - 6);
          ctx.stroke();
        }
        ctx.restore();
      }

      // ── 2. BUILDINGS (depth-sorted) ──

      const hqImg = getClawdHQImage();

      // Building sizing: each building gets a 3x3 tile plot.
      // One isometric tile = TILE_W x TILE_H (32x16) on screen.
      // A 3x3 isometric area is roughly 3*TILE_W wide = 96px, 3*TILE_H tall = 48px.
      // But buildings rise above the tile, so max height ≈ 2 * maxW for tall structures.
      const maxBoxW = TILE_W * 2.5; // 80px — max width for tier 5 (stays within 3 tiles)
      const maxBoxH = TILE_W * 2.5; // 80px — max height for tier 5

      // Tier 1: fits on 1 tile (~TILE_W = 32px). Tier 5: fills 3x3 area (~80px)
      const TIER_FILL: Record<number, number> = {
        0: 0.15, 1: 0.4, 2: 0.5, 3: 0.65, 4: 0.8, 5: 1.0,
      };

      for (let i = 0; i < sortedBlds.length; i++) {
        const b = sortedBlds[i];
        if (b.wx < vl || b.wx > vr || b.wy < vt || b.wy > vb) continue;


        const needAlpha = b.dmg > 50;
        if (needAlpha) ctx.globalAlpha = 0.7;

        if (b.addr === CLAWD_HQ_ADDRESS && hqImg) {
          // Clawd HQ fills the full 3x3 box
          const aspect = hqImg.naturalWidth / hqImg.naturalHeight;
          let drawW = maxBoxW, drawH = maxBoxH;
          if (aspect > 1) { drawH = maxBoxW / aspect; }
          else { drawW = maxBoxH * aspect; }
          ctx.drawImage(hqImg, b.wx - drawW / 2, b.wy - drawH + 4, drawW, drawH);
        } else if (b.tier === 0) {
          // Tier 0 — no visual, just a plot
        } else if (b.bp < 100) {
          // Under construction — animated construction sprite
          const fill = TIER_FILL[b.tier] ?? 0.5;
          const s = maxBoxW * fill * 0.75;
          drawConstructionAnim(ctx, b.wx, b.wy, b.bp, frame, s, camScale);
        } else {
          const aiImg = getAIImage(b.addr, b.customImageUrl);
          if (aiImg) {
            const fill = TIER_FILL[b.tier] ?? 0.5;
            const boxW = maxBoxW * fill;
            const boxH = maxBoxH * fill;
            const aspect = aiImg.naturalWidth / aiImg.naturalHeight;
            let drawW: number, drawH: number;
            if (aspect > boxW / boxH) {
              drawW = boxW;
              drawH = boxW / aspect;
            } else {
              drawH = boxH;
              drawW = boxH * aspect;
            }
            ctx.drawImage(aiImg, b.wx - drawW / 2, b.wy - drawH + 4, drawW, drawH);
          } else {
            const fill = TIER_FILL[b.tier] ?? 0.5;
            const s = maxBoxW * fill * 0.75;
            drawConstructionAnim(ctx, b.wx, b.wy, 95, frame, s, camScale);
          }
        }

        if (needAlpha) ctx.globalAlpha = 1;

        // Progress bar
        if (b.bp < 100) {
          const barW = 12, barH = 2;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(b.wx - barW / 2, b.wy + 5, barW, barH);
          ctx.fillStyle = hsl(b.hue, 80, 55, 0.9);
          ctx.fillRect(b.wx - barW / 2, b.wy + 5, barW * (b.bp / 100), barH);
        }

      }

      // ── 2.1. RUINS (permanent burned-down houses) ──
      initBurnSprites();
      const ruins = store.ruins;
      if (ruins.length > 0 && decodedTiles && mapW > 0) {
        const burnedSprite = burnSpriteCache.get('burned-house');
        if (burnedSprite) {
          for (const ruin of ruins) {
            // Skip if still within 5-min fire window (fire is showing instead)
            if (isStillBurning(ruin.burnedAt)) continue;

            const centerX = ruin.x + 1;
            const centerY = ruin.y + 1;
            const tIdx = centerY * mapW + centerX;
            const elev = decodedTiles[tIdx] ? decodedTiles[tIdx].elevation / 255 * 3 : 0;
            const [sx, sy] = tileToScreen(centerX, centerY, elev);
            if (sx < vl || sx > vr || sy < vt || sy > vb) continue;

            // Draw at same size as a tier-1 house
            const s = maxBoxW * 0.4 * 0.75;
            ctx.drawImage(burnedSprite, sx - s / 2, sy - s + 4, s, s);
          }
        }
      }

      // ── 2.3. FIRE ANIMATION (houses currently burning) ──
      if (showAnim && decodedTiles && mapW > 0) {
        const burningHouses = getBurningHouses();
        // Cleanup smoke for houses no longer burning
        for (const key of smokeParticles.keys()) {
          if (!Array.from(burningHouses.values()).some(e => `${e.plotX},${e.plotY}` === key)) {
            smokeParticles.delete(key);
          }
        }
        if (burningHouses.size > 0) {
          const fireSprite1 = burnSpriteCache.get('fire-1');
          const fireSprite2 = burnSpriteCache.get('fire-2');
          if (fireSprite1 && fireSprite2) {
            for (const [, entry] of burningHouses) {
              const centerX = entry.plotX + 1;
              const centerY = entry.plotY + 1;
              const tIdx = centerY * mapW + centerX;
              const elev = decodedTiles[tIdx] ? decodedTiles[tIdx].elevation / 255 * 3 : 0;
              const [sx, sy] = tileToScreen(centerX, centerY, elev);
              if (sx < vl || sx > vr || sy < vt || sy > vb) continue;

              // Alternate fire frames every 10 animation frames
              const fireSprite = (Math.floor(frame / 10) % 2 === 0) ? fireSprite1 : fireSprite2;
              const s = maxBoxW * 0.5;
              ctx.save();
              ctx.globalAlpha = 0.85;
              ctx.drawImage(fireSprite, sx - s / 2, sy - s + 4, s, s);
              ctx.globalAlpha = 1;
              ctx.restore();

              // ── Rising smoke particles ──
              const smokeKey = `${entry.plotX},${entry.plotY}`;
              let particles = smokeParticles.get(smokeKey);
              if (!particles) {
                particles = [];
                for (let i = 0; i < SMOKE_PER_HOUSE; i++) {
                  particles.push(spawnSmokeParticle());
                }
                smokeParticles.set(smokeKey, particles);
              }

              for (const p of particles) {
                p.life++;
                if (p.life >= p.maxLife) {
                  resetSmokeParticle(p);
                  continue;
                }
                p.x += p.vx;
                p.y += p.vy;
                p.size += 0.08; // smoke expands as it rises

                const t = p.life / p.maxLife; // 0→1
                const fadeAlpha = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8; // fade in then out
                const gray = Math.floor(30 + t * 50); // near-black → dark gray

                ctx.beginPath();
                ctx.arc(sx + p.x, sy - s * 0.6 + p.y, p.size, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(${gray},${gray},${gray},${fadeAlpha * p.alpha})`;
                ctx.fill();
              }
            }
          }
        }
      }

      // ── 2.5. BIRDS ──
      initBirdSprites();
      if (showAnim && camScale >= 0.1 && mapW > 0) {
        updateBirds(mapW, mapH);
        for (const bird of birds) {
          const spriteKey = `bird-v${bird.variant}-${bird.wingsUp ? 'up' : 'down'}`;
          const sprite = birdSpriteCache.get(spriteKey);
          // Render at high elevation so birds fly above buildings
          const [sx, sy] = tileToScreen(bird.tx, bird.ty, 8);
          if (sx < vl - 50 || sx > vr + 50 || sy < vt - 50 || sy > vb + 50) continue;

          if (sprite) {
            const size = 144;
            ctx.drawImage(sprite, sx - size / 2, sy - size / 2, size, size);
          } else {
            // Fallback: simple V shape
            ctx.strokeStyle = 'rgba(30, 30, 35, 0.8)';
            ctx.lineWidth = 2;
            const wingY = bird.wingsUp ? -8 : 5;
            ctx.beginPath();
            ctx.moveTo(sx - 16, sy + wingY);
            ctx.lineTo(sx, sy);
            ctx.lineTo(sx + 16, sy + wingY);
            ctx.stroke();
          }
        }
      }

      // ── 3. PARTICLES — disabled (visual clutter at most zoom levels) ──

      // ── 4. RAIN (world-space — only over tilemap) ──
      if (showAnim) {
        updateWeather();

        if (rainIntensity > 0.01 && decodedTiles && mapW > 0) {
          // Compute tilemap bounding box in world coords (only non-void tiles)
          // Use map center + land/water radius as approximation
          const mapCx = Math.floor(mapW / 2);
          const mapCy = Math.floor(mapH / 2);
          // Find approximate extent of visible tiles from center
          let maxTileRadius = 0;
          for (let ty2 = 0; ty2 < mapH; ty2 += 4) {
            for (let tx2 = 0; tx2 < mapW; tx2 += 4) {
              const tile = decodedTiles[ty2 * mapW + tx2];
              if (!tile || (tile.terrain === 0 && tile.elevation === 0)) continue;
              const dr = Math.sqrt((tx2 - mapCx) ** 2 + (ty2 - mapCy) ** 2);
              if (dr > maxTileRadius) maxTileRadius = dr;
            }
          }

          // Get world-space bounds of the tilemap area
          const [tmCenterX, tmCenterY] = tileToScreen(mapCx, mapCy, 0);

          // Darkening overlay — draw as a large diamond over the tilemap
          ctx.save();
          ctx.globalAlpha = rainIntensity * 0.25;
          ctx.fillStyle = 'rgba(20, 25, 35, 1)';
          const overlayR = maxTileRadius * TILE_W * 0.75;
          ctx.beginPath();
          ctx.moveTo(tmCenterX, tmCenterY - overlayR);
          ctx.lineTo(tmCenterX + overlayR, tmCenterY);
          ctx.lineTo(tmCenterX, tmCenterY + overlayR);
          ctx.lineTo(tmCenterX - overlayR, tmCenterY);
          ctx.closePath();
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.restore();

          // Rain drops in world space — constrained to tilemap area
          const activeDrops = Math.floor(MAX_RAIN_DROPS * rainIntensity);
          const dropSpeedWorld = 3 / camScale; // consistent visual speed
          const dropLenWorld = 6 / camScale;
          const windAngle = 0.3;

          // Spawn area: visible viewport clamped to tilemap bounds
          const spawnL = Math.max(vl, tmCenterX - overlayR);
          const spawnR = Math.min(vr, tmCenterX + overlayR);
          const spawnT = Math.max(vt, tmCenterY - overlayR);
          const spawnB = Math.min(vb, tmCenterY + overlayR);

          while (rainDrops.length < activeDrops) {
            rainDrops.push({
              x: spawnL + Math.random() * (spawnR - spawnL),
              y: spawnT + Math.random() * (spawnB - spawnT),
              speed: (8 + Math.random() * 6) / camScale,
              len: (10 + Math.random() * 14) / camScale,
              alpha: 0.3 + Math.random() * 0.4,
            });
          }
          if (rainDrops.length > activeDrops) rainDrops.length = activeDrops;

          ctx.lineWidth = 1.5 / camScale;
          for (const drop of rainDrops) {
            drop.y += drop.speed;
            drop.x += Math.sin(windAngle) * drop.speed * 0.3;

            // Wrap within tilemap bounds
            if (drop.y > spawnB + drop.len) {
              drop.y = spawnT - drop.len;
              drop.x = spawnL + Math.random() * (spawnR - spawnL);
            }
            if (drop.x > spawnR) drop.x = spawnL;
            if (drop.x < spawnL) drop.x = spawnR;

            ctx.strokeStyle = `rgba(180, 210, 240, ${drop.alpha * rainIntensity})`;
            ctx.beginPath();
            ctx.moveTo(drop.x, drop.y);
            ctx.lineTo(
              drop.x + Math.sin(windAngle) * drop.len,
              drop.y + Math.cos(windAngle) * drop.len,
            );
            ctx.stroke();
          }

          // Rain splashes in world coords
          if (camScale >= 0.15) {
            splashSpawnTimer++;
            if (splashSpawnTimer >= 3 && rainSplashes.length < MAX_RAIN_SPLASHES) {
              splashSpawnTimer = 0;
              rainSplashes.push({
                tx: spawnL + Math.random() * (spawnR - spawnL),
                ty: spawnT + Math.random() * (spawnB - spawnT),
                frame: 0,
                maxFrame: 15 + Math.floor(Math.random() * 10),
              });
            }

            for (let i = rainSplashes.length - 1; i >= 0; i--) {
              const sp = rainSplashes[i];
              sp.frame++;
              if (sp.frame >= sp.maxFrame) {
                rainSplashes.splice(i, 1);
                continue;
              }
              const progress = sp.frame / sp.maxFrame;
              const radius = (3 + progress * 6) / camScale;
              const alpha = (1 - progress) * 0.4 * rainIntensity;
              ctx.strokeStyle = `rgba(180, 210, 240, ${alpha})`;
              ctx.lineWidth = 1 / camScale;
              ctx.beginPath();
              ctx.arc(sp.tx, sp.ty, radius, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ── RENDER LOOP ──
    let rafId: number;
    function loop() {
      rafId = requestAnimationFrame(loop);
      syncTilemap();
      syncFromStore();
      frame++;
      const idle = !dragging && (performance.now() - lastInteractTime > INTERACT_COOLDOWN);
      if (idle && frame % 2 === 0) dirty = true;
      if (dirty) { dirty = false; draw(); }
    }
    rafId = requestAnimationFrame(loop);

    // ── CLEANUP ──
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('mousemove', onMouseMove);
      canvas.removeEventListener('mouseleave', onMouseLeave);
      if (hoverClearTimer) clearTimeout(hoverClearTimer);
      useTownStore.getState().setLocateHouse(null);
      useTownStore.getState().setHoveredHouse(null);
      delete (window as any).__cancelHoverClear;
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}
    />
  );
}
