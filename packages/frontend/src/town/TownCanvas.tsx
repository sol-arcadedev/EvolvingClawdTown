import { useEffect, useRef } from 'react';
import { useTownStore } from '../hooks/useTownStore';
import type { WalletState } from '../types';
import {
  COL_BG,
  PLOT_STRIDE,
  PLOT_DISTANCE_MULT,
  TIER_SCALE,
  MAINFRAME_PLOTS,
  ZOOM_MIN,
  ZOOM_MAX,
} from './constants';

/* ───────────────────────────────────────────────────────────
 *  Canvas 2D town renderer — no WebGL, no PixiJS.
 *  Draws isometric buildings directly via CanvasRenderingContext2D.
 *  Only redraws when something actually changes (dirty flag).
 * ─────────────────────────────────────────────────────────── */

// Reserved mainframe zone
const RESERVED = new Set<string>();
for (const [x, y] of MAINFRAME_PLOTS) RESERVED.add(`${x},${y}`);
for (let x = -2; x <= 1; x++)
  for (let y = -2; y <= 1; y++) RESERVED.add(`${x},${y}`);

// Isometric projection
function iso(bx: number, by: number, bz: number): [number, number] {
  return [bx - by, (bx + by) * 0.5 - bz];
}

// Cached building data
interface Bld {
  wx: number; wy: number;
  tier: number; hue: number;
  bp: number; dmg: number;
  addr: string;
  depth: number; // sort key for painter's algorithm
}

// HSL helper — returns CSS string
function hsl(h: number, s: number, l: number, a = 1): string {
  return a < 1 ? `hsla(${h},${s}%,${l}%,${a})` : `hsl(${h},${s}%,${l}%)`;
}

// ── ISOMETRIC BOX ──
function isoBox(
  c: CanvasRenderingContext2D,
  ox: number, oy: number,
  bw: number, bd: number, bh: number,
  top: string, left: string, right: string,
) {
  const [x0, y0] = iso(ox, oy, 0);
  const [x1, y1] = iso(ox + bw, oy, 0);
  const [x3, y3] = iso(ox, oy + bd, 0);
  const [x4, y4] = iso(ox, oy, bh);
  const [x5, y5] = iso(ox + bw, oy, bh);
  const [x6, y6] = iso(ox + bw, oy + bd, bh);
  const [x7, y7] = iso(ox, oy + bd, bh);

  // Top face
  c.beginPath();
  c.moveTo(x4, y4); c.lineTo(x5, y5); c.lineTo(x6, y6); c.lineTo(x7, y7);
  c.closePath(); c.fillStyle = top; c.fill();
  // Left face
  c.beginPath();
  c.moveTo(x0, y0); c.lineTo(x3, y3); c.lineTo(x7, y7); c.lineTo(x4, y4);
  c.closePath(); c.fillStyle = left; c.fill();
  // Right face
  c.beginPath();
  c.moveTo(x0, y0); c.lineTo(x1, y1); c.lineTo(x5, y5); c.lineTo(x4, y4);
  c.closePath(); c.fillStyle = right; c.fill();
}

// ── WINDOW ON RIGHT FACE ──
function winR(
  c: CanvasRenderingContext2D,
  ox: number, oy: number, bw: number,
  wy: number, wz: number, ww: number, wh: number,
  color: string,
) {
  const [a, ay] = iso(ox + bw, oy + wy, wz);
  const [b, by] = iso(ox + bw, oy + wy, wz + wh);
  const [d, dy] = iso(ox + bw, oy + wy + ww, wz + wh);
  const [e, ey] = iso(ox + bw, oy + wy + ww, wz);
  c.beginPath(); c.moveTo(a, ay); c.lineTo(b, by); c.lineTo(d, dy); c.lineTo(e, ey);
  c.closePath(); c.fillStyle = color; c.fill();
}

// ── WINDOW ON LEFT FACE ──
function winL(
  c: CanvasRenderingContext2D,
  ox: number, oy: number, bd: number,
  wx: number, wz: number, ww: number, wh: number,
  color: string,
) {
  const [a, ay] = iso(ox + wx, oy + bd, wz);
  const [b, by] = iso(ox + wx, oy + bd, wz + wh);
  const [d, dy] = iso(ox + wx + ww, oy + bd, wz + wh);
  const [e, ey] = iso(ox + wx + ww, oy + bd, wz);
  c.beginPath(); c.moveTo(a, ay); c.lineTo(b, by); c.lineTo(d, dy); c.lineTo(e, ey);
  c.closePath(); c.fillStyle = color; c.fill();
}

// ── ACCENT LINE ──
function accentLine(
  c: CanvasRenderingContext2D,
  ox: number, oy: number, bw: number, bd: number, z: number,
  color: string, width: number,
) {
  const [a, ay] = iso(ox - 0.2, oy, z);
  const [b, by] = iso(ox + bw + 0.2, oy, z);
  const [d, dy] = iso(ox + bw + 0.2, oy + bd, z);
  c.beginPath(); c.moveTo(a, ay); c.lineTo(b, by); c.lineTo(d, dy);
  c.strokeStyle = color; c.lineWidth = width; c.stroke();
}

// ── TIER DRAWERS ──
// Each draws at unit scale centered on (0,0)

function drawTier1(c: CanvasRenderingContext2D, h: number) {
  const bw = 4, bd = 4, bh = 3, ox = -2, oy = -2;
  isoBox(c, ox, oy, bw, bd, bh, hsl(h,15,14), hsl(h,15,8), hsl(h,15,11));
  winR(c, ox, oy, bw, 1.2, 0.8, 1.5, 1.5, hsl(h,80,60,0.7));
  winL(c, ox, oy, bd, 1.2, 0.8, 1.5, 1.5, hsl(h,70,50,0.5));
}

function drawTier2(c: CanvasRenderingContext2D, h: number) {
  const bw = 5, bd = 5, bh = 6, ox = -2.5, oy = -2.5;
  isoBox(c, ox, oy, bw, bd, bh, hsl(h,15,15), hsl(h,15,9), hsl(h,15,12));
  winR(c, ox, oy, bw, 1.5, 1.0, 1.5, 1.5, hsl(h,80,60,0.7));
  winR(c, ox, oy, bw, 1.5, 3.5, 1.5, 1.5, hsl(h,80,60,0.3));
  winL(c, ox, oy, bd, 1.5, 1.0, 1.5, 1.5, hsl(h,70,50,0.5));
  winL(c, ox, oy, bd, 1.5, 3.5, 1.5, 1.5, hsl(h,70,50,0.25));
  accentLine(c, ox, oy, bw, bd, 3.5, hsl(h,90,55,0.5), 0.15);
}

function drawTier3(c: CanvasRenderingContext2D, h: number) {
  const ox = -3, oy = -3;
  isoBox(c, ox, oy, 6, 6, 4, hsl(h,15,16), hsl(h,15,9), hsl(h,15,12));
  isoBox(c, ox+0.8, oy+0.8, 4.4, 4.4, 5, hsl(h,15,18), hsl(h,15,10), hsl(h,15,13));
  winR(c, ox, oy, 6, 0.8, 0.8, 1.2, 1.5, hsl(h,80,60,0.7));
  winR(c, ox, oy, 6, 2.8, 0.8, 1.2, 1.5, hsl(h,80,60,0.3));
  winL(c, ox, oy, 6, 1.2, 0.8, 1.2, 1.5, hsl(h,70,50,0.5));
  winR(c, ox+0.8, oy+0.8, 4.4, 1.0, 5.0, 1.2, 1.5, hsl(h,80,60,0.6));
  winL(c, ox+0.8, oy+0.8, 4.4, 1.0, 5.0, 1.2, 1.5, hsl(h,70,50,0.4));
  accentLine(c, ox, oy, 6, 6, 4, hsl(h,90,55,0.6), 0.18);
}

function drawTier4(c: CanvasRenderingContext2D, h: number) {
  const ox = -3.5, oy = -3.5;
  isoBox(c, ox+1, oy+1, 5, 5, 14, hsl(h,15,15), hsl(h,15,8), hsl(h,15,11));
  isoBox(c, ox-1, oy+1.5, 2, 4, 7, hsl(h,15,13), hsl(h,15,7), hsl(h,15,10));
  winR(c, ox+1, oy+1, 5, 1.5, 2, 1.2, 1.2, hsl(h,80,60,0.7));
  winR(c, ox+1, oy+1, 5, 1.5, 5, 1.2, 1.2, hsl(h,80,60,0.35));
  winR(c, ox+1, oy+1, 5, 1.5, 8, 1.2, 1.2, hsl(h,80,60,0.6));
  winR(c, ox+1, oy+1, 5, 1.5, 11, 1.2, 1.2, hsl(h,80,60,0.25));
  winL(c, ox+1, oy+1, 5, 1.5, 3, 1.2, 1.2, hsl(h,70,50,0.5));
  winL(c, ox+1, oy+1, 5, 1.5, 7, 1.2, 1.2, hsl(h,70,50,0.6));
  accentLine(c, ox+1, oy+1, 5, 5, 7, hsl(h,90,55,0.5), 0.12);
  // Spire
  const [sx, sy] = iso(0, 0, 14);
  const [tx, ty] = iso(0, 0, 18);
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx, ty);
  c.strokeStyle = hsl(h,80,55,0.6); c.lineWidth = 0.15; c.stroke();
  c.beginPath(); c.arc(tx, ty, 0.4, 0, Math.PI*2);
  c.fillStyle = hsl(h,80,65,0.8); c.fill();
}

function drawTier5(c: CanvasRenderingContext2D, h: number) {
  const ox = -4, oy = -4;
  isoBox(c, ox, oy, 8, 8, 6, hsl(h,15,16), hsl(h,15,8), hsl(h,15,12));
  isoBox(c, ox+1.2, oy+1.2, 5.6, 5.6, 6, hsl(h,15,18), hsl(h,15,10), hsl(h,15,13));
  isoBox(c, ox+2.2, oy+2.2, 3.6, 3.6, 6, hsl(h,15,15), hsl(h,15,8), hsl(h,15,11));
  winR(c, ox, oy, 8, 1.5, 1.5, 1.2, 1.2, hsl(h,80,60,0.7));
  winR(c, ox, oy, 8, 4.0, 1.5, 1.2, 1.2, hsl(h,80,60,0.35));
  winR(c, ox, oy, 8, 1.5, 3.5, 1.2, 1.2, hsl(h,80,60,0.5));
  winL(c, ox, oy, 8, 2.0, 2.0, 1.2, 1.2, hsl(h,70,50,0.45));
  winR(c, ox+1.2, oy+1.2, 5.6, 1.5, 7.5, 1.2, 1.5, hsl(h,80,60,0.6));
  winR(c, ox+1.2, oy+1.2, 5.6, 1.5, 10, 1.2, 1.5, hsl(h,80,60,0.3));
  winL(c, ox+1.2, oy+1.2, 5.6, 1.5, 8, 1.2, 1.5, hsl(h,70,50,0.4));
  winR(c, ox+2.2, oy+2.2, 3.6, 1.0, 14, 1.2, 1.5, hsl(h,80,60,0.7));
  accentLine(c, ox, oy, 8, 8, 6, hsl(h,90,55,0.5), 0.15);
  // Spire
  const [sx, sy] = iso(0, 0, 18);
  const [tx, ty] = iso(0, 0, 23);
  c.beginPath(); c.moveTo(sx, sy); c.lineTo(tx, ty);
  c.strokeStyle = hsl(h,80,55,0.6); c.lineWidth = 0.15; c.stroke();
  c.beginPath(); c.arc(tx, ty, 0.5, 0, Math.PI*2);
  c.fillStyle = hsl(h,80,65,0.8); c.fill();
}

const TIER_DRAW = [null, drawTier1, drawTier2, drawTier3, drawTier4, drawTier5];

// ── MAIN COMPONENT ──

export default function TownCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const _canvas = canvasRef.current;
    if (!_canvas) return;
    const _ctx = _canvas.getContext('2d');
    if (!_ctx) return;
    // Non-null aliases for closures
    const canvas: HTMLCanvasElement = _canvas;
    const ctx: CanvasRenderingContext2D = _ctx;

    // Camera
    let camX = 0, camY = 0, camScale = 0.45;
    let dragging = false, lastPX = 0, lastPY = 0;
    let dirty = true;

    // Building cache
    let lastWalletRef: Map<string, WalletState> | null = null;
    let buildings: Bld[] = [];

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
      // Zoom toward mouse
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
      let best: string | null = null;
      let bestD = 80 * 80;
      for (const b of buildings) {
        const dx = worldX - b.wx, dy = worldY - b.wy;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD) { bestD = d2; best = b.addr; }
      }
      if (best !== hoveredAddr) {
        hoveredAddr = best;
        useTownStore.getState().setHoveredHouse(
          best, best ? { x: e.clientX, y: e.clientY } : undefined,
        );
      } else if (best) {
        // Update tooltip position
        useTownStore.getState().setHoveredHouse(best, { x: e.clientX, y: e.clientY });
      }
    };
    const onMouseLeave = () => {
      // Delay clear so tooltip can be moused over
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

    // ── LOCATE HOUSE ──
    useTownStore.getState().setLocateHouse((address: string) => {
      const w = useTownStore.getState().wallets.get(address);
      if (!w) return;
      const tx = w.plotX * PLOT_STRIDE * PLOT_DISTANCE_MULT;
      const ty = w.plotY * PLOT_STRIDE * PLOT_DISTANCE_MULT;
      camScale = 1.2;
      camX = -tx * camScale;
      camY = -ty * camScale;
      dirty = true;
    });

    // ── SYNC FROM STORE ──
    function syncFromStore() {
      const wallets = useTownStore.getState().wallets;
      if (wallets === lastWalletRef) return;
      lastWalletRef = wallets;
      const next: Bld[] = [];
      for (const [addr, w] of wallets) {
        if (RESERVED.has(`${w.plotX},${w.plotY}`)) continue;
        if (w.tokenBalance === '0' || Number(w.tokenBalance) <= 0) continue;
        const wx = w.plotX * PLOT_STRIDE * PLOT_DISTANCE_MULT;
        const wy = w.plotY * PLOT_STRIDE * PLOT_DISTANCE_MULT;
        next.push({
          wx, wy, tier: Math.min(w.houseTier, 5), hue: w.colorHue,
          bp: w.buildProgress, dmg: w.damagePct, addr,
          depth: wx + wy,
        });
      }
      // Sort by depth — far buildings first (painter's algorithm)
      next.sort((a, b) => a.depth - b.depth);
      buildings = next;
      dirty = true;
    }

    // ── DRAW ──
    function draw() {
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth, h = canvas.clientHeight;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Background
      ctx.fillStyle = '#' + COL_BG.toString(16).padStart(6, '0');
      ctx.fillRect(0, 0, w, h);

      // Camera
      const cx = w / 2 + camX, cy = h / 2 + camY;
      ctx.translate(cx, cy);
      ctx.scale(camScale, camScale);

      // Viewport culling bounds (in world coords)
      const inv = 1 / camScale;
      const vl = -cx * inv - 300;
      const vt = -cy * inv - 300;
      const vr = (w - cx) * inv + 300;
      const vb = (h - cy) * inv + 300;

      // Draw buildings
      for (let i = 0; i < buildings.length; i++) {
        const b = buildings[i];
        if (b.wx < vl || b.wx > vr || b.wy < vt || b.wy > vb) continue;

        ctx.save();
        ctx.translate(b.wx, b.wy);

        if (b.bp < 100) ctx.globalAlpha = 0.35;
        else if (b.dmg > 50) ctx.globalAlpha = 0.6;

        if (b.tier === 0) {
          ctx.beginPath();
          ctx.arc(0, 0, 5, 0, Math.PI * 2);
          ctx.fillStyle = hsl(b.hue, 70, 50, 0.3);
          ctx.fill();
          ctx.beginPath();
          ctx.arc(0, 0, 2.5, 0, Math.PI * 2);
          ctx.fillStyle = hsl(b.hue, 70, 50, 0.6);
          ctx.fill();
        } else {
          const scale = PLOT_STRIDE * (TIER_SCALE[b.tier] ?? 0.5);
          const isoDiv = [0, 6, 8, 10, 12, 14][b.tier];
          const u = scale / isoDiv;
          ctx.scale(u, u);
          TIER_DRAW[b.tier]!(ctx, b.hue);
        }

        ctx.restore();

        // Progress bar (in world coords, below building)
        if (b.bp < 100) {
          ctx.save();
          ctx.translate(b.wx, b.wy);
          const barW = 20, barH = 3;
          ctx.fillStyle = 'rgba(0,0,0,0.7)';
          ctx.fillRect(-barW / 2, 8, barW, barH);
          ctx.fillStyle = hsl(b.hue, 80, 55, 0.9);
          ctx.fillRect(-barW / 2, 8, barW * (b.bp / 100), barH);
          ctx.restore();
        }
      }

      // Reset transform
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    }

    // ── FPS COUNTER ──
    const fpsDiv = document.createElement('div');
    fpsDiv.style.cssText =
      'position:fixed;bottom:50px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.9);' +
      'color:#00ff88;font:bold 13px monospace;padding:6px 14px;border:1px solid #00ff88;' +
      'border-radius:4px;z-index:9999;pointer-events:none;';
    document.body.appendChild(fpsDiv);
    let frameCount = 0, drawCount = 0, lastFpsTime = performance.now(), fps = 0, dps = 0;

    // ── RENDER LOOP ──
    let rafId: number;
    function loop() {
      rafId = requestAnimationFrame(loop);
      frameCount++;
      const now = performance.now();
      if (now - lastFpsTime >= 1000) {
        fps = frameCount; dps = drawCount;
        frameCount = 0; drawCount = 0;
        lastFpsTime = now;
        fpsDiv.textContent = `FPS: ${fps} | Draws: ${dps} | Bldgs: ${buildings.length}`;
      }
      syncFromStore();
      if (dirty) { dirty = false; drawCount++; draw(); }
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
      fpsDiv.remove();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, overflow: 'hidden' }}
    />
  );
}
