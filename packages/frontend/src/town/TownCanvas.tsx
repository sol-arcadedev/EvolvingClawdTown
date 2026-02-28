import { useEffect, useRef } from 'react';
import { useTownStore, consumeChangedAddresses, getActivityFade, consumeTilemapDirty } from '../hooks/useTownStore';
import type { WalletState } from '../types';
import {
  COL_BG,
  PLOT_STRIDE,
  TIER_SCALE,
  ZOOM_MIN,
  ZOOM_MAX,
  PARTICLE_COUNT,
  PARTICLE_COLORS,
} from './constants';
import { getBuildingSprite, getLightSprite, hsl, TIER_U } from './BuildingCache';
import { decodeTilemap, tileToScreen, screenToTile, TILE_W, TILE_H } from './tilemap/TilemapRenderer';
import type { DecodedTile } from './tilemap/TilemapRenderer';
import { ChunkCache } from './tilemap/ChunkCache';

/* ───────────────────────────────────────────────────────────
 *  Canvas 2D town renderer — tilemap + buildings.
 *
 *  Renders a 256x256 isometric tilemap (terrain, districts, roads)
 *  with buildings placed on tilemap coordinates.
 *  Keeps all existing building rendering (AI images, procedural sprites,
 *  blinking lights, progress bars, particles).
 * ─────────────────────────────────────────────────────────── */

const CLAWD_HQ_ADDRESS = 'clawd-architect-hq';

const BG_CSS = '#' + COL_BG.toString(16).padStart(6, '0');

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

// ── BLINKING LIGHTS ──
const LIGHT_COUNTS = [0, 1, 2, 3, 5, 8];
const TIER_DIMS: [number, number, number][] = [
  [0,0,0], [4,4,3], [5,5,6], [6,6,9], [7,7,14], [8,8,20],
];

function isoXY(bx: number, by: number, bz: number): [number, number] {
  return [bx - by, (bx + by) * 0.5 - bz];
}

function addrHash(addr: string): number {
  let h = 0;
  for (let i = 0; i < addr.length; i++) {
    h = ((h << 5) - h + addr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

interface BldLight {
  ox: number; oy: number;
  phase: number; speed: number; size: number;
}

function computeLights(addr: string, tier: number): BldLight[] {
  const count = LIGHT_COUNTS[tier] ?? 0;
  if (count === 0) return [];
  const [bw, bd, bh] = TIER_DIMS[tier];
  const u = TIER_U[tier];
  const hash = addrHash(addr);
  const lights: BldLight[] = [];

  for (let i = 0; i < count; i++) {
    const seed = ((hash * 31 + i * 97) & 0x7fffffff) / 0x7fffffff;
    const seed2 = ((hash * 53 + i * 71) & 0x7fffffff) / 0x7fffffff;
    const onRight = i % 2 === 0;
    const faceY = seed * (bd * 0.7) + bd * 0.15;
    const faceZ = (seed2 * 0.6 + 0.2) * bh;
    let ix: number, iy: number;
    if (onRight) {
      [ix, iy] = isoXY(bw / 2, -bd / 2 + faceY, faceZ);
    } else {
      const faceX = seed * (bw * 0.7) + bw * 0.15;
      [ix, iy] = isoXY(-bw / 2 + faceX, bd / 2, faceZ);
    }
    lights.push({
      ox: ix * u, oy: iy * u,
      phase: seed * Math.PI * 2,
      speed: 0.15 + seed2 * 0.25,
      size: (0.6 + seed2 * 0.5) * u,
    });
  }
  return lights;
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
  lights: BldLight[];
  customImageUrl?: string | null;
}

function makeBld(addr: string, w: WalletState): Bld {
  // Convert tilemap coords to isometric screen coords
  const [wx, wy] = tileToScreen(w.plotX, w.plotY, 0);
  const tier = Math.min(w.houseTier, 5);
  return {
    wx, wy,
    tileX: w.plotX, tileY: w.plotY,
    tier, hue: w.colorHue,
    bp: w.buildProgress, dmg: w.damagePct, addr,
    depth: w.plotX + w.plotY, // isometric depth sort
    lights: computeLights(addr, tier),
    customImageUrl: w.customImageUrl,
  };
}

function shouldInclude(_addr: string, w: WalletState): boolean {
  if (_addr === CLAWD_HQ_ADDRESS) return true;
  if (w.tokenBalance === '0' || Number(w.tokenBalance) <= 0) return false;
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

    // ── PARTICLES ──
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = spawnParticle();
      p.life = Math.random() * p.maxLife;
      particles.push(p);
    }

    let frame = 0;

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

      decodedTiles = decodeTilemap(store.tilemap, store.mapWidth, store.mapHeight);
      chunkCache.setTilemap(decodedTiles, store.mapWidth, store.mapHeight);
      dirty = true;
    }

    // ── SYNC BUILDINGS FROM STORE ──
    function fullRebuild() {
      bldMap.clear();
      gridIndex.clear();
      const wallets = useTownStore.getState().wallets;
      for (const [addr, w] of wallets) {
        if (!shouldInclude(addr, w)) continue;
        const bld = makeBld(addr, w);
        bldMap.set(addr, bld);
        gridIndex.set(`${w.plotX},${w.plotY}`, bld);
      }
      sortedBlds = Array.from(bldMap.values());
      sortedBlds.sort((a, b) => a.depth - b.depth);
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
        const keep = w != null && shouldInclude(addr, w);

        if (!keep) {
          if (existing) {
            bldMap.delete(addr);
            gridIndex.delete(`${existing.tileX},${existing.tileY}`);
            structural = true;
          }
          continue;
        }

        if (!existing) {
          const bld = makeBld(addr, w);
          bldMap.set(addr, bld);
          gridIndex.set(`${w.plotX},${w.plotY}`, bld);
          structural = true;
        } else {
          const [newWx, newWy] = tileToScreen(w.plotX, w.plotY, 0);
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
          if (existing.tier !== newTier) {
            existing.lights = computeLights(addr, newTier);
          }
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

      // Background
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG_CSS;
      ctx.fillRect(0, 0, w, h);

      // Camera transform
      const cx = w / 2 + camX, cy = h / 2 + camY;
      ctx.setTransform(dpr * camScale, 0, 0, dpr * camScale, dpr * cx, dpr * cy);

      const showAnim = !dragging && (performance.now() - lastInteractTime > INTERACT_COOLDOWN);

      // ── 1. TILEMAP GROUND (chunked) ──
      chunkCache.drawVisibleChunks(ctx, cx, cy, camScale, w, h);

      // ── 2. BUILDINGS (depth-sorted) ──
      const inv = 1 / camScale;
      const vl = -cx * inv - 200;
      const vt = -cy * inv - 200;
      const vr = (w - cx) * inv + 200;
      const vb = (h - cy) * inv + 200;

      const hqImg = getClawdHQImage();

      // Building scale factor for tilemap (buildings are rendered at tile scale)
      const bldScale = 0.8; // scale buildings relative to tiles

      for (let i = 0; i < sortedBlds.length; i++) {
        const b = sortedBlds[i];
        if (b.wx < vl || b.wx > vr || b.wy < vt || b.wy > vb) continue;

        const needAlpha = b.bp < 100 || b.dmg > 50;
        if (needAlpha) ctx.globalAlpha = b.bp < 100 ? 0.35 : 0.6;

        if (b.addr === CLAWD_HQ_ADDRESS && hqImg) {
          const baseSize = TILE_W * 3;
          const aspect = hqImg.naturalWidth / hqImg.naturalHeight;
          const drawW = baseSize * aspect;
          const drawH = baseSize;
          ctx.drawImage(hqImg, b.wx - drawW / 2, b.wy - drawH + 4, drawW, drawH);
        } else if (b.tier === 0) {
          ctx.fillStyle = hsl(b.hue, 70, 50, 0.3);
          ctx.fillRect(b.wx - 3, b.wy - 3, 6, 6);
          ctx.fillStyle = hsl(b.hue, 70, 50, 0.6);
          ctx.fillRect(b.wx - 1.5, b.wy - 1.5, 3, 3);
        } else {
          const aiImg = getAIImage(b.addr, b.customImageUrl);
          if (aiImg) {
            const baseSize = TILE_W * (TIER_SCALE[b.tier] ?? 0.5) * 3 * bldScale;
            const aspect = aiImg.naturalWidth / aiImg.naturalHeight;
            const drawW = baseSize * aspect;
            const drawH = baseSize;
            ctx.drawImage(aiImg, b.wx - drawW / 2, b.wy - drawH + 4, drawW, drawH);
          } else {
            const { src, bbox, u } = getBuildingSprite(b.tier, b.hue);
            const scale = bldScale * 0.4; // scale down procedural sprites for tilemap
            ctx.drawImage(
              src,
              b.wx + bbox.minX * u * scale,
              b.wy + bbox.minY * u * scale,
              (bbox.maxX - bbox.minX) * u * scale,
              (bbox.maxY - bbox.minY) * u * scale,
            );
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

        // Blinking lights
        if (showAnim && b.lights.length > 0) {
          const fade = getActivityFade(b.addr, 5000);
          if (fade > 0) {
            const lSpr = getLightSprite(b.hue);
            for (let li = 0; li < b.lights.length; li++) {
              const l = b.lights[li];
              const pulse = Math.sin(frame * l.speed + l.phase);
              if (pulse < 0) continue;
              const hw = l.size * 1.5;
              ctx.globalAlpha = pulse * 0.9 * fade;
              ctx.drawImage(lSpr, b.wx + l.ox - hw, b.wy + l.oy - hw, hw * 2, hw * 2);
            }
            ctx.globalAlpha = 1;
          }
        }
      }

      // ── 3. PARTICLES ──
      if (showAnim) {
        for (const p of particles) {
          p.life++;
          p.x += p.vx;
          p.y += p.vy;
          const lifeRatio = p.life / p.maxLife;
          let fadeAlpha = p.alpha;
          if (lifeRatio < 0.1) fadeAlpha *= lifeRatio / 0.1;
          else if (lifeRatio > 0.8) fadeAlpha *= (1 - lifeRatio) / 0.2;
          if (fadeAlpha > 0.01) {
            ctx.globalAlpha = fadeAlpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2);
          }
          if (p.life >= p.maxLife) resetParticle(p);
        }
        ctx.globalAlpha = 1;
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
      if (idle) dirty = true;
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
