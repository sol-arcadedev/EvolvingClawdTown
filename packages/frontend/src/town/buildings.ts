import { Container, Graphics } from 'pixi.js';
import {
  PLOT_STRIDE,
  PLOT_DISTANCE_MULT,
  MAINFRAME_PLOTS,
} from './constants';
import type { WalletState } from '../types';

// ── SIMPLE DOT RENDERER ── (diagnostic: minimal GPU work)
// Each building = 1 Graphics with 2 circles. No Sprites, no textures.

const drawnHash = new Map<string, string>();
const buildingGfx = new Map<string, Graphics>();

// Mainframe reserved zone
const RESERVED_SET = new Set(MAINFRAME_PLOTS.map(([x, y]) => `${x},${y}`));
for (let x = -2; x <= 1; x++) {
  for (let y = -2; y <= 1; y++) {
    RESERVED_SET.add(`${x},${y}`);
  }
}

function walletHash(w: WalletState): string {
  return `${w.houseTier}:${w.buildProgress}:${w.damagePct}:${w.colorHue}`;
}

function hueToColor(hue: number): number {
  const h = ((hue % 360) + 360) % 360;
  const s = 0.9, l = 0.55;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return (Math.round((r + m) * 255) << 16) |
         (Math.round((g + m) * 255) << 8) |
         Math.round((b + m) * 255);
}

// No textures needed for dots
export async function loadBuildingTextures(): Promise<void> {}

// Queue
const MAX_CREATE_PER_SYNC = 20;
const pendingQueue: { addr: string; w: WalletState }[] = [];
const pendingSet = new Set<string>(); // fast lookup instead of findIndex
let _layerRef: Container | null = null;

// Hover
export function cancelHoverClear() {}

// Performance timing (exported for FPS overlay)
export let perfSync = 0;
export let perfQueue = 0;
export let perfCull = 0;
export let perfPending = 0;

function createDot(addr: string, w: WalletState, layer: Container) {
  let existing = buildingGfx.get(addr);
  if (existing) {
    layer.removeChild(existing);
    existing.destroy();
  }

  const g = new Graphics();
  g.eventMode = 'none';

  const px = w.plotX * PLOT_STRIDE * PLOT_DISTANCE_MULT;
  const py = w.plotY * PLOT_STRIDE * PLOT_DISTANCE_MULT;
  g.position.set(px, py);

  const color = hueToColor(w.colorHue);
  const tier = Math.min(w.houseTier, 5);
  const size = 3 + tier * 2;

  g.circle(0, 0, size);
  g.fill({ color, alpha: 0.25 });
  g.circle(0, 0, size * 0.5);
  g.fill({ color, alpha: 0.65 });

  layer.addChild(g);
  buildingGfx.set(addr, g);
  drawnHash.set(addr, walletHash(w));
}

export function processBuildingQueue() {
  // DIAGNOSTIC: disabled to isolate rendering from data pipeline
  return;
}

function removeDot(addr: string, layer: Container) {
  const g = buildingGfx.get(addr);
  if (g) {
    layer.removeChild(g);
    g.destroy();
    buildingGfx.delete(addr);
    drawnHash.delete(addr);
  }
}

export function syncBuildings(
  _layer: Container,
  _beamLayer: Container,
  _wallets: Map<string, WalletState>,
) {
  // DIAGNOSTIC: disabled to isolate rendering from data pipeline
  return;
}

// ── HOVER ──

export function findBuildingAt(worldX: number, worldY: number): string | null {
  let bestAddr: string | null = null;
  let bestDist = Infinity;
  const HIT_RADIUS = 80;

  for (const [addr, g] of buildingGfx) {
    if (!g.visible) continue;
    const dx = worldX - g.x;
    const dy = worldY - g.y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist && dist < HIT_RADIUS * HIT_RADIUS) {
      bestDist = dist;
      bestAddr = addr;
    }
  }
  return bestAddr;
}

// ── VIEWPORT CULLING ──

export function cullBuildings(
  worldX: number, worldY: number, worldScale: number,
  screenW: number, screenH: number,
) {
  const t0 = performance.now();
  const invScale = 1 / worldScale;
  const left   = -worldX * invScale;
  const top    = -worldY * invScale;
  const right  = (screenW - worldX) * invScale;
  const bottom = (screenH - worldY) * invScale;
  const margin = 300;

  for (const [, g] of buildingGfx) {
    const cx = g.x;
    const cy = g.y;
    g.visible =
      cx >= left - margin && cx <= right + margin &&
      cy >= top - margin && cy <= bottom + margin;
  }
  perfCull = performance.now() - t0;
}
