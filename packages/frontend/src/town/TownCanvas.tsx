import { useEffect, useRef } from 'react';
import { useTownStore, consumeChangedAddresses } from '../hooks/useTownStore';
import type { WalletState } from '../types';
import {
  COL_BG,
  PLOT_STRIDE,
  PLOT_DISTANCE_MULT,
  MAINFRAME_PLOTS,
  ZOOM_MIN,
  ZOOM_MAX,
  PARTICLE_COUNT,
  PARTICLE_COLORS,
} from './constants';
import { getBuildingSprite, getMainframeSprite, getLightSprite, hsl, TIER_U } from './BuildingCache';

/* ───────────────────────────────────────────────────────────
 *  Canvas 2D town renderer — optimised.
 *
 *  Key perf wins over the previous version:
 *    1. OffscreenCanvas sprite cache — 1 drawImage per building
 *    2. Incremental sync — O(k) per update, not O(n log n)
 *    3. Grid-based hover — O(1) instead of O(n)
 *    4. No save()/restore() per building
 *    5. Cached HSL colour strings
 * ─────────────────────────────────────────────────────────── */

// Reserved mainframe zone
const RESERVED = new Set<string>();
for (const [x, y] of MAINFRAME_PLOTS) RESERVED.add(`${x},${y}`);
for (let x = -2; x <= 1; x++)
  for (let y = -2; y <= 1; y++) RESERVED.add(`${x},${y}`);

// World-space grid spacing between buildings
const GRID_SPACING = PLOT_STRIDE * PLOT_DISTANCE_MULT; // 518.4

// Background colour as CSS string (computed once)
const BG_CSS = '#' + COL_BG.toString(16).padStart(6, '0');

// ── MAINFRAME ──
const MF_WX = -0.5 * GRID_SPACING;
const MF_WY = -0.5 * GRID_SPACING;
const MF_DEPTH = MF_WX + MF_WY;

// ── PARTICLES ──
const P_EXTENT = 5 * GRID_SPACING;
const PARTICLE_CSS = PARTICLE_COLORS.map(
  c => `rgb(${(c >> 16) & 0xff},${(c >> 8) & 0xff},${c & 0xff})`,
);
const P_TAU = Math.PI * 2;

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
const LIGHT_COUNTS = [0, 1, 2, 3, 5, 8]; // per tier
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
  ox: number; oy: number; // world-unit offset from building center
  phase: number; speed: number; size: number; // size in world units
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

const EMPTY_LIGHTS: BldLight[] = [];

// Building data for rendering
interface Bld {
  wx: number; wy: number;
  plotX: number; plotY: number;
  tier: number; hue: number;
  bp: number; dmg: number;
  addr: string;
  depth: number; // sort key for painter's algorithm
  lights: BldLight[];
}

function shouldInclude(w: WalletState): boolean {
  if (RESERVED.has(`${w.plotX},${w.plotY}`)) return false;
  if (w.tokenBalance === '0' || Number(w.tokenBalance) <= 0) return false;
  return true;
}

function makeBld(addr: string, w: WalletState): Bld {
  const wx = w.plotX * GRID_SPACING;
  const wy = w.plotY * GRID_SPACING;
  const tier = Math.min(w.houseTier, 5);
  return {
    wx, wy,
    plotX: w.plotX, plotY: w.plotY,
    tier, hue: w.colorHue,
    bp: w.buildProgress, dmg: w.damagePct, addr,
    depth: wx + wy,
    lights: computeLights(addr, tier),
  };
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

    // Camera
    let camX = 0, camY = 0, camScale = 0.45;
    let dragging = false, lastPX = 0, lastPY = 0;
    let dirty = true;

    // Interaction tracking — skip expensive animations during pan/zoom
    let lastInteractTime = 0;
    const INTERACT_COOLDOWN = 200; // ms after last drag/zoom before resuming animations

    // Persistent building structures (Step 2: incremental sync)
    const bldMap = new Map<string, Bld>();
    let sortedBlds: Bld[] = [];
    const gridIndex = new Map<string, Bld>(); // "plotX,plotY" → Bld

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
    const onPointerDown = (e: PointerEvent) => {
      dragging = true; lastPX = e.clientX; lastPY = e.clientY;
      canvas.style.cursor = 'grabbing';
      if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = null; }
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return;
      camX += e.clientX - lastPX;
      camY += e.clientY - lastPY;
      lastPX = e.clientX; lastPY = e.clientY;
      lastInteractTime = performance.now();
      dirty = true;
    };
    const onPointerUp = () => { dragging = false; canvas.style.cursor = 'grab'; };
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
      dirty = true;
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.style.cursor = 'grab';

    // ── HOVER (Step 3: grid-based O(1)) ──
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

      // Grid-based lookup: check 3×3 neighbourhood around nearest plot
      const centerPX = Math.round(worldX / GRID_SPACING);
      const centerPY = Math.round(worldY / GRID_SPACING);
      let best: string | null = null;
      let bestD2 = 80 * 80;
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const b = gridIndex.get(`${centerPX + dx},${centerPY + dy}`);
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

    // Expose hover-clear cancel for tooltip pinning
    (window as any).__cancelHoverClear = () => {
      if (hoverClearTimer) { clearTimeout(hoverClearTimer); hoverClearTimer = null; }
    };

    // ── PARTICLES ──
    const particles: Particle[] = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const p = spawnParticle();
      p.life = Math.random() * p.maxLife; // stagger initial lifetimes
      particles.push(p);
    }

    // ── ANIMATION FRAME COUNTER ──
    let frame = 0;

    // ── LOCATE HOUSE ──
    useTownStore.getState().setLocateHouse((address: string) => {
      const w = useTownStore.getState().wallets.get(address);
      if (!w) return;
      const tx = w.plotX * GRID_SPACING;
      const ty = w.plotY * GRID_SPACING;
      camScale = 1.2;
      camX = -tx * camScale;
      camY = -ty * camScale;
      dirty = true;
    });

    // ── SYNC FROM STORE (Step 2: incremental) ──
    function fullRebuild() {
      bldMap.clear();
      gridIndex.clear();
      const wallets = useTownStore.getState().wallets;
      for (const [addr, w] of wallets) {
        if (!shouldInclude(w)) continue;
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
        const keep = w != null && shouldInclude(w);

        if (!keep) {
          // Remove
          if (existing) {
            bldMap.delete(addr);
            gridIndex.delete(`${existing.plotX},${existing.plotY}`);
            structural = true;
          }
          continue;
        }

        if (!existing) {
          // Add
          const bld = makeBld(addr, w);
          bldMap.set(addr, bld);
          gridIndex.set(`${w.plotX},${w.plotY}`, bld);
          structural = true;
        } else {
          // Update in-place
          const newWx = w.plotX * GRID_SPACING;
          const newWy = w.plotY * GRID_SPACING;
          if (existing.wx !== newWx || existing.wy !== newWy) {
            gridIndex.delete(`${existing.plotX},${existing.plotY}`);
            existing.wx = newWx;
            existing.wy = newWy;
            existing.plotX = w.plotX;
            existing.plotY = w.plotY;
            existing.depth = newWx + newWy;
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

      // Background (pre-camera transform)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = BG_CSS;
      ctx.fillRect(0, 0, w, h);

      // Camera transform
      const cx = w / 2 + camX, cy = h / 2 + camY;
      ctx.setTransform(dpr * camScale, 0, 0, dpr * camScale, dpr * cx, dpr * cy);

      // Viewport culling bounds (world coords)
      const inv = 1 / camScale;
      const vl = -cx * inv - 300;
      const vt = -cy * inv - 300;
      const vr = (w - cx) * inv + 300;
      const vb = (h - cy) * inv + 300;

      // Should we draw animations? Skip during active pan/zoom for smooth 60fps
      const showAnim = !dragging && (performance.now() - lastInteractTime > INTERACT_COOLDOWN);

      // ── BEAM TRACES (ground-level, behind everything) ──
      // Only include beams to buildings whose endpoint is in/near the viewport
      ctx.beginPath();
      for (let i = 0; i < sortedBlds.length; i++) {
        const b = sortedBlds[i];
        if (b.tier === 0) continue;
        // Viewport-cull: skip beams to off-screen buildings
        if (b.wx < vl || b.wx > vr || b.wy < vt || b.wy > vb) continue;
        if (Math.abs(b.wx - MF_WX) >= Math.abs(b.wy - MF_WY)) {
          ctx.moveTo(MF_WX, MF_WY); ctx.lineTo(b.wx, MF_WY); ctx.lineTo(b.wx, b.wy);
        } else {
          ctx.moveTo(MF_WX, MF_WY); ctx.lineTo(MF_WX, b.wy); ctx.lineTo(b.wx, b.wy);
        }
      }
      ctx.strokeStyle = 'rgba(0,255,245,0.06)';
      ctx.lineWidth = 8;
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,255,245,0.18)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // ── MAINFRAME + BUILDINGS (depth order) ──
      const mf = getMainframeSprite();
      let mfDrawn = false;

      for (let i = 0; i < sortedBlds.length; i++) {
        const b = sortedBlds[i];

        // Insert mainframe at correct depth position
        if (!mfDrawn && b.depth > MF_DEPTH) {
          ctx.drawImage(mf.src, MF_WX + mf.ox, MF_WY + mf.oy, mf.w, mf.h);
          mfDrawn = true;
        }

        if (b.wx < vl || b.wx > vr || b.wy < vt || b.wy > vb) continue;

        // Transparency for under-construction / damaged
        const needAlpha = b.bp < 100 || b.dmg > 50;
        if (needAlpha) ctx.globalAlpha = b.bp < 100 ? 0.35 : 0.6;

        if (b.tier === 0) {
          ctx.beginPath();
          ctx.arc(b.wx, b.wy, 5, 0, P_TAU);
          ctx.fillStyle = hsl(b.hue, 70, 50, 0.3);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(b.wx, b.wy, 2.5, 0, P_TAU);
          ctx.fillStyle = hsl(b.hue, 70, 50, 0.6);
          ctx.fill();
        } else {
          const { src, bbox, u } = getBuildingSprite(b.tier, b.hue);
          ctx.drawImage(
            src,
            b.wx + bbox.minX * u,
            b.wy + bbox.minY * u,
            (bbox.maxX - bbox.minX) * u,
            (bbox.maxY - bbox.minY) * u,
          );
        }

        if (needAlpha) ctx.globalAlpha = 1;

        if (b.bp < 100) {
          const barW = 20, barH = 3;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(b.wx - barW / 2, b.wy + 8, barW, barH);
          ctx.fillStyle = hsl(b.hue, 80, 55, 0.9);
          ctx.fillRect(b.wx - barW / 2, b.wy + 8, barW * (b.bp / 100), barH);
        }

        // Blinking lights — only when not panning/zooming
        if (showAnim && b.lights.length > 0) {
          const lSpr = getLightSprite(b.hue);
          for (let li = 0; li < b.lights.length; li++) {
            const l = b.lights[li];
            const pulse = Math.sin(frame * l.speed + l.phase);
            if (pulse < 0) continue;
            const hw = l.size * 2.5;
            ctx.globalAlpha = pulse * 0.9;
            ctx.drawImage(lSpr, b.wx + l.ox - hw, b.wy + l.oy - hw, hw * 2, hw * 2);
          }
          ctx.globalAlpha = 1;
        }
      }

      if (!mfDrawn) {
        ctx.drawImage(mf.src, MF_WX + mf.ox, MF_WY + mf.oy, mf.w, mf.h);
      }

      // ── DATA PACKETS + PARTICLES — only when idle ──
      if (showAnim) {
        const pSpeed = 18;
        const pkts: number[] = [];

        for (let i = 0; i < sortedBlds.length; i++) {
          const b = sortedBlds[i];
          if (b.tier === 0) continue;
          if (b.wx < vl || b.wx > vr || b.wy < vt || b.wy > vb) continue;
          const ddx = Math.abs(b.wx - MF_WX), ddy = Math.abs(b.wy - MF_WY);
          const horiz = ddx >= ddy;
          const seg1 = horiz ? ddx : ddy;
          const seg2 = horiz ? ddy : ddx;
          const total = seg1 + seg2;
          if (total < 1) continue;
          const mid1x = horiz ? b.wx : MF_WX;
          const mid1y = horiz ? MF_WY : b.wy;
          const stagger = (b.tier * 37 + Math.abs(Math.round(b.wx) * 7 + Math.round(b.wy) * 13)) % 1000;
          const raw = frame * pSpeed + stagger;
          const cyc = ((raw % total) + total) % total;
          let px: number, py: number;
          if (cyc <= seg1) {
            const t = cyc / seg1;
            px = MF_WX + (mid1x - MF_WX) * t;
            py = MF_WY + (mid1y - MF_WY) * t;
          } else {
            const t = (cyc - seg1) / seg2;
            px = mid1x + (b.wx - mid1x) * t;
            py = mid1y + (b.wy - mid1y) * t;
          }
          pkts.push(px, py);
        }

        ctx.fillStyle = 'rgba(0,255,245,0.12)';
        for (let j = 0; j < pkts.length; j += 2) {
          ctx.fillRect(pkts[j] - 6, pkts[j + 1] - 6, 12, 12);
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        for (let j = 0; j < pkts.length; j += 2) {
          ctx.fillRect(pkts[j] - 2, pkts[j + 1] - 4, 4, 4);
        }

        // Particles
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

      // Reset transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ── RENDER LOOP ──
    let rafId: number;
    function loop() {
      rafId = requestAnimationFrame(loop);
      syncFromStore();
      frame++;
      // Only force redraw every frame when animations are visible (not during interaction)
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
