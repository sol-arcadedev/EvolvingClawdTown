// ═══════════════════════════════════════════════════════════════════
// AnimationSystem — Per-frame animated effects for a living cyberpunk city
// Moving traffic, searchlights, pulsing neon, flowing water, drones,
// steam vents, flickering signs, data streams, rain particles,
// GIANT holographic billboards, electric arcs, energy conduits,
// scrolling text, holographic advertisements, sparkle particles
// ═══════════════════════════════════════════════════════════════════

import { Graphics } from 'pixi.js';
import { PLOT_W, PLOT_H } from '../HouseSprite';
import {
  RANGE, hash, smoothNoise, modulateColor,
  getPlotMeta, getNeighborhoodPalette, LANDMARKS,
  type NeighborhoodId,
} from '../CityLayout';

// ── Pre-computed traffic routes ──

interface TrafficRoute {
  points: { x: number; y: number }[];
  totalLen: number;
  speed: number;
  color: number;
  isVertical: boolean;
}

interface FlyingObject {
  x: number; y: number;
  vx: number; vy: number;
  altitude: number;
  color: number;
  blinkPhase: number;
}

interface SteamVent {
  x: number; y: number;
  intensity: number;
  phase: number;
}

interface SearchlightBeam {
  x: number; y: number;
  baseAngle: number;
  sweepSpeed: number;
  length: number;
  color: number;
}

interface NeonSign {
  x: number; y: number;
  w: number; h: number;
  color: number;
  flickerRate: number;
  scanSpeed: number;
}

interface DataStream {
  x: number;
  startY: number;
  endY: number;
  speed: number;
  color: number;
  charCount: number;
}

interface HoloBillboard {
  x: number; y: number;
  w: number; h: number;
  color1: number;
  color2: number;
  textSpeed: number;
  glitchRate: number;
  beamColor: number;
  spanY: number;
}

interface ElectricArc {
  x1: number; y1: number;
  x2: number; y2: number;
  color: number;
  intensity: number;
  flickerSpeed: number;
}

interface EnergyConduit {
  startX: number; startY: number;
  endX: number; endY: number;
  color: number;
  speed: number;
  particleCount: number;
}

interface SparkleCluster {
  cx: number; cy: number;
  radius: number;
  color: number;
  count: number;
  speed: number;
}

// ── Construction beam targets (updated each frame by TownMap) ──

interface ConstructionTarget {
  x: number;  // world pixel x (center of plot)
  y: number;  // world pixel y (center of plot)
  progress: number; // 0-100
}

let constructionTargets: ConstructionTarget[] = [];

/** Called by TownMap each frame with buildings under construction */
export function setConstructionTargets(targets: ConstructionTarget[]): void {
  constructionTargets = targets;
}

// ── Pre-computed static data (generated once) ──

let trafficRoutes: TrafficRoute[] = [];
let flyingObjects: FlyingObject[] = [];
let steamVents: SteamVent[] = [];
let searchlights: SearchlightBeam[] = [];
let neonSigns: NeonSign[] = [];
let dataStreams: DataStream[] = [];
let holoBillboards: HoloBillboard[] = [];
let electricArcs: ElectricArc[] = [];
let energyConduits: EnergyConduit[] = [];
let sparkleClusters: SparkleCluster[] = [];
let initialized = false;

const NEON_COLORS = [0x00fff5, 0xff0080, 0x00ff88, 0xff6600, 0xaa44ff, 0x44aaff, 0xffaa00, 0xff3388];

function initAnimationData(): void {
  if (initialized) return;
  initialized = true;

  const range = RANGE;
  const vehicleColors = [0xff0066, 0x00fff5, 0xff6600, 0x00ff88, 0xaa44ff, 0x44aaff, 0xffaa00];

  // ── Traffic routes along main streets ──
  for (let row = -range + 1; row < range; row += 2) {
    const y = row * PLOT_H;
    const pts: { x: number; y: number }[] = [];
    const startX = -range * PLOT_W - 100;
    const endX = range * PLOT_W + 100;
    const laneOff = (row % 2 === 0) ? -4 : 4;
    for (let x = startX; x <= endX; x += PLOT_W / 2) {
      pts.push({ x, y: y + laneOff });
    }
    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }
    trafficRoutes.push({
      points: pts, totalLen,
      speed: 30 + hash(row, 0, 7777) * 50,
      color: vehicleColors[Math.floor(hash(row, 0, 7778) * vehicleColors.length)],
      isVertical: false,
    });
  }

  for (let col = -range + 1; col < range; col += 2) {
    const x = col * PLOT_W;
    const pts: { x: number; y: number }[] = [];
    const startY = -range * PLOT_H - 100;
    const endY = range * PLOT_H + 100;
    const laneOff = (col % 2 === 0) ? -4 : 4;
    for (let y = startY; y <= endY; y += PLOT_H / 2) {
      pts.push({ x: x + laneOff, y });
    }
    let totalLen = 0;
    for (let i = 1; i < pts.length; i++) {
      const dx = pts[i].x - pts[i - 1].x;
      const dy = pts[i].y - pts[i - 1].y;
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }
    trafficRoutes.push({
      points: pts, totalLen,
      speed: 25 + hash(col, 1, 7779) * 45,
      color: vehicleColors[Math.floor(hash(col, 1, 7780) * vehicleColors.length)],
      isVertical: true,
    });
  }

  // ── Flying objects (drones, hover-cars) — MORE of them ──
  for (let i = 0; i < 30; i++) {
    const angle = hash(i, 0, 8000) * Math.PI * 2;
    const speed = 15 + hash(i, 1, 8001) * 40;
    flyingObjects.push({
      x: (hash(i, 2, 8002) - 0.5) * range * 2 * PLOT_W,
      y: (hash(i, 3, 8003) - 0.5) * range * 2 * PLOT_H,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      altitude: 0.5 + hash(i, 4, 8004) * 2.0,
      color: NEON_COLORS[Math.floor(hash(i, 5, 8005) * NEON_COLORS.length)],
      blinkPhase: hash(i, 6, 8006) * Math.PI * 2,
    });
  }

  // ── Steam vents — MORE throughout the city ──
  for (let i = 0; i < 50; i++) {
    const px = Math.floor((hash(i, 0, 9000) - 0.5) * range * 1.8);
    const py = Math.floor((hash(i, 1, 9001) - 0.5) * range * 1.8);
    const meta = getPlotMeta(px, py);
    if (meta.neighborhood === 'residential' || meta.neighborhood === 'wasteland') {
      if (hash(i, 6, 9006) > 0.3) continue;
    }
    steamVents.push({
      x: px * PLOT_W + hash(i, 2, 9002) * PLOT_W,
      y: py * PLOT_H + hash(i, 3, 9003) * PLOT_H,
      intensity: 0.5 + hash(i, 4, 9004) * 0.5,
      phase: hash(i, 5, 9005) * Math.PI * 2,
    });
  }

  // ── Searchlights — MANY MORE ──
  searchlights.push({
    x: 0, y: 0,
    baseAngle: 0, sweepSpeed: 0.4,
    length: PLOT_W * 5, color: 0x00fff5,
  });
  // Second central beam
  searchlights.push({
    x: 0, y: 0,
    baseAngle: Math.PI, sweepSpeed: -0.3,
    length: PLOT_W * 4, color: 0xff0080,
  });
  for (const lm of LANDMARKS) {
    if (lm.type === 'billboard_cluster' || lm.type === 'monument' || lm.type === 'holographic_billboard') {
      searchlights.push({
        x: lm.cx * PLOT_W, y: lm.cy * PLOT_H,
        baseAngle: hash(lm.cx, lm.cy, 8500) * Math.PI * 2,
        sweepSpeed: 0.15 + hash(lm.cx, lm.cy, 8501) * 0.35,
        length: PLOT_W * 2.5 + hash(lm.cx, lm.cy, 8502) * PLOT_W * 1.5,
        color: lm.type === 'holographic_billboard' ? 0x44aaff :
               lm.type === 'monument' ? 0xff0080 : 0x00fff5,
      });
    }
  }
  // Extra neighborhood searchlights
  for (const pos of [[-3, -3], [3, -3], [-3, 3], [3, 3], [-5, 0], [5, 0], [0, -5], [0, 5]]) {
    searchlights.push({
      x: pos[0] * PLOT_W, y: pos[1] * PLOT_H,
      baseAngle: hash(pos[0], pos[1], 8510) * Math.PI * 2,
      sweepSpeed: 0.2 + hash(pos[0], pos[1], 8511) * 0.25,
      length: PLOT_W * 3.5, color: NEON_COLORS[Math.floor(hash(pos[0], pos[1], 8512) * NEON_COLORS.length)],
    });
  }

  // ── Neon signs — MORE, BIGGER ──
  for (let i = 0; i < 70; i++) {
    const px = Math.floor((hash(i, 0, 8100) - 0.5) * range * 1.8);
    const py = Math.floor((hash(i, 1, 8101) - 0.5) * range * 1.8);
    const meta = getPlotMeta(px, py);
    const pal = getNeighborhoodPalette(meta.neighborhood);
    if (pal.neonIntensity < 0.15) continue;
    neonSigns.push({
      x: px * PLOT_W + 10 + hash(i, 2, 8102) * (PLOT_W - 30),
      y: py * PLOT_H + 10 + hash(i, 3, 8103) * (PLOT_H * 0.4),
      w: 14 + hash(i, 4, 8104) * 28,
      h: 8 + hash(i, 5, 8105) * 14,
      color: hash(i, 8, 8108) < 0.5 ? pal.accentColor : NEON_COLORS[Math.floor(hash(i, 9, 8109) * NEON_COLORS.length)],
      flickerRate: 2 + hash(i, 6, 8106) * 8,
      scanSpeed: 1 + hash(i, 7, 8107) * 3,
    });
  }

  // ── Data streams — MORE and in more neighborhoods ──
  for (let i = 0; i < 50; i++) {
    const px = Math.floor((hash(i, 0, 8200) - 0.5) * range * 1.6);
    const py = Math.floor((hash(i, 1, 8201) - 0.5) * range * 1.6);
    const meta = getPlotMeta(px, py);
    const pal = getNeighborhoodPalette(meta.neighborhood);
    if (pal.neonIntensity < 0.5) continue;
    dataStreams.push({
      x: px * PLOT_W + hash(i, 2, 8202) * PLOT_W,
      startY: py * PLOT_H,
      endY: py * PLOT_H + PLOT_H,
      speed: 30 + hash(i, 3, 8203) * 80,
      color: pal.accentColor,
      charCount: 5 + Math.floor(hash(i, 4, 8204) * 10),
    });
  }

  // ── Holographic Billboards — NEW SPECTACULAR FEATURE ──
  for (const lm of LANDMARKS) {
    if (lm.type !== 'holographic_billboard') continue;
    const colors = [
      [0x00fff5, 0xff0080], [0x00ff88, 0xaa44ff], [0x44aaff, 0xff6600],
      [0xff3388, 0x00fff5], [0xffaa00, 0x44aaff], [0x00ff88, 0xff0080],
    ];
    const ci = Math.floor(hash(lm.cx, lm.cy, 4000) * colors.length);
    const [c1, c2] = colors[ci];
    holoBillboards.push({
      x: lm.cx * PLOT_W,
      y: lm.cy * PLOT_H,
      w: PLOT_W * lm.spanX * 0.85,
      h: PLOT_H * lm.spanY * 0.7,
      color1: c1,
      color2: c2,
      textSpeed: 20 + hash(lm.cx, lm.cy, 4001) * 40,
      glitchRate: 3 + hash(lm.cx, lm.cy, 4002) * 7,
      beamColor: c1,
      spanY: lm.spanY,
    });
  }

  // ── Electric Arcs — between nearby buildings in neon-heavy areas ──
  for (let i = 0; i < 20; i++) {
    const px = Math.floor((hash(i, 0, 6000) - 0.5) * range * 1.4);
    const py = Math.floor((hash(i, 1, 6001) - 0.5) * range * 1.4);
    const meta = getPlotMeta(px, py);
    const pal = getNeighborhoodPalette(meta.neighborhood);
    if (pal.neonIntensity < 0.6) continue;
    electricArcs.push({
      x1: px * PLOT_W + hash(i, 2, 6002) * PLOT_W,
      y1: py * PLOT_H + hash(i, 3, 6003) * PLOT_H * 0.5,
      x2: px * PLOT_W + hash(i, 4, 6004) * PLOT_W + PLOT_W * 0.3,
      y2: py * PLOT_H + hash(i, 5, 6005) * PLOT_H * 0.5 - 10,
      color: pal.accentColor,
      intensity: 0.5 + hash(i, 6, 6006) * 0.5,
      flickerSpeed: 8 + hash(i, 7, 6007) * 15,
    });
  }

  // ── Energy Conduits — glowing lines along major streets ──
  for (let i = -range; i <= range; i += 3) {
    // Horizontal conduits
    energyConduits.push({
      startX: -range * PLOT_W,
      startY: i * PLOT_H - 2,
      endX: range * PLOT_W,
      endY: i * PLOT_H - 2,
      color: NEON_COLORS[Math.floor(hash(i, 0, 7100) * NEON_COLORS.length)],
      speed: 40 + hash(i, 1, 7101) * 60,
      particleCount: 6 + Math.floor(hash(i, 2, 7102) * 6),
    });
    // Vertical conduits
    energyConduits.push({
      startX: i * PLOT_W + 2,
      startY: -range * PLOT_H,
      endX: i * PLOT_W + 2,
      endY: range * PLOT_H,
      color: NEON_COLORS[Math.floor(hash(i, 3, 7103) * NEON_COLORS.length)],
      speed: 35 + hash(i, 4, 7104) * 55,
      particleCount: 5 + Math.floor(hash(i, 5, 7105) * 5),
    });
  }

  // ── Sparkle Clusters — ambient magical particles near landmarks & neon areas ──
  for (const lm of LANDMARKS) {
    sparkleClusters.push({
      cx: lm.cx * PLOT_W,
      cy: lm.cy * PLOT_H,
      radius: PLOT_W * (lm.spanX + 0.5),
      color: lm.type === 'holographic_billboard' ? 0x44aaff :
             lm.type === 'monument' ? 0xff0080 : 0x00fff5,
      count: lm.type === 'holographic_billboard' ? 15 : 8,
      speed: 0.5 + hash(lm.cx, lm.cy, 5500) * 1.5,
    });
  }
  // Extra sparkles in neon-heavy neighborhoods
  for (let i = 0; i < 15; i++) {
    const px = Math.floor((hash(i, 0, 5600) - 0.5) * range * 1.5);
    const py = Math.floor((hash(i, 1, 5601) - 0.5) * range * 1.5);
    const meta = getPlotMeta(px, py);
    const pal = getNeighborhoodPalette(meta.neighborhood);
    if (pal.neonIntensity < 0.6) continue;
    sparkleClusters.push({
      cx: px * PLOT_W + PLOT_W / 2,
      cy: py * PLOT_H + PLOT_H / 2,
      radius: PLOT_W * 0.8,
      color: pal.accentColor,
      count: 6,
      speed: 0.8 + hash(i, 2, 5602) * 1.2,
    });
  }
}

// ── Interpolate position along a polyline by distance ──
function posOnRoute(route: TrafficRoute, dist: number): { x: number; y: number } | null {
  const d = ((dist % route.totalLen) + route.totalLen) % route.totalLen;
  let acc = 0;
  for (let i = 1; i < route.points.length; i++) {
    const dx = route.points[i].x - route.points[i - 1].x;
    const dy = route.points[i].y - route.points[i - 1].y;
    const segLen = Math.sqrt(dx * dx + dy * dy);
    if (acc + segLen >= d) {
      const t = (d - acc) / segLen;
      return {
        x: route.points[i - 1].x + dx * t,
        y: route.points[i - 1].y + dy * t,
      };
    }
    acc += segLen;
  }
  return route.points[route.points.length - 1];
}

// ═══════════════════════════════════════════════════════════════════
// Main per-frame animation draw call
// ═══════════════════════════════════════════════════════════════════

// Background animations — rendered BEHIND houses (on bgAnimLayer)
// Includes: searchlights, neighborhood glow, energy conduits, water, traffic,
// data streams, neon signs, steam, electric arcs, billboard content, street lights
export function drawBgAnimatedLayer(g: Graphics, time: number): void {
  initAnimationData();
  g.clear();

  const t = time / 1000;

  drawNeighborhoodPulse(g, t);
  drawEnergyConduits(g, t);
  drawAnimatedWater(g, t);
  drawTraffic(g, t);
  drawDataStreams(g, t);
  drawNeonSigns(g, t);
  drawSteamVents(g, t);
  drawElectricArcs(g, t);
  drawCentralHologram(g, t);
  drawConstructionBeams(g, t);
  drawHolographicBillboards(g, t);
  drawIntersectionHolos(g, t);
  drawLandmarkBeacons(g, t);
  drawStreetLightPools(g, t);
}

// Foreground animations — rendered ABOVE houses (on fgAnimLayer)
// Includes: flying drones, sparkles, rain (things that float above everything)
export function drawFgAnimatedLayer(g: Graphics, time: number): void {
  initAnimationData();
  g.clear();

  const t = time / 1000;

  drawFlyingObjects(g, t);
  drawSparkleClusters(g, t);
  drawCyberRain(g, t);
}

// ── Searchlights — rotating beams of light ──
function drawSearchlights(g: Graphics, t: number): void {
  for (const sl of searchlights) {
    const angle = sl.baseAngle + t * sl.sweepSpeed;
    const endX = sl.x + Math.cos(angle) * sl.length;
    const endY = sl.y + Math.sin(angle) * sl.length;
    const perpX = -Math.sin(angle);
    const perpY = Math.cos(angle);
    const spread = sl.length * 0.18;

    // Wide soft glow cone
    g.moveTo(sl.x, sl.y);
    g.lineTo(endX + perpX * spread, endY + perpY * spread);
    g.lineTo(endX - perpX * spread, endY - perpY * spread);
    g.closePath();
    g.fill({ color: sl.color, alpha: 0.018 });

    // Narrow bright core
    const coreSpread = spread * 0.3;
    g.moveTo(sl.x, sl.y);
    g.lineTo(endX + perpX * coreSpread, endY + perpY * coreSpread);
    g.lineTo(endX - perpX * coreSpread, endY - perpY * coreSpread);
    g.closePath();
    g.fill({ color: sl.color, alpha: 0.035 });

    // Source point glow
    g.circle(sl.x, sl.y, 8);
    g.fill({ color: sl.color, alpha: 0.1 + Math.sin(t * 3 + sl.baseAngle) * 0.04 });
    g.circle(sl.x, sl.y, 4);
    g.fill({ color: sl.color, alpha: 0.2 });
  }
}

// ── Pulsing neighborhood glow ──
function drawNeighborhoodPulse(g: Graphics, t: number): void {
  const range = RANGE;
  for (let px = -range; px < range; px += 3) {
    for (let py = -range; py < range; py += 3) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      if (pal.neonIntensity < 0.15) continue;

      const cx = px * PLOT_W + PLOT_W * 1.5;
      const cy = py * PLOT_H + PLOT_H * 1.5;
      const dist = Math.sqrt(px * px + py * py);

      const wave = Math.sin(t * 1.8 - dist * 0.35) * 0.5 + 0.5;
      const alpha = 0.012 * pal.neonIntensity * wave;

      g.circle(cx, cy, PLOT_W * 2);
      g.fill({ color: pal.accentColor, alpha });
    }
  }
}

// ── Energy conduits — glowing particles traveling along streets ──
function drawEnergyConduits(g: Graphics, t: number): void {
  for (const conduit of energyConduits) {
    const dx = conduit.endX - conduit.startX;
    const dy = conduit.endY - conduit.startY;
    const totalLen = Math.sqrt(dx * dx + dy * dy);
    if (totalLen === 0) continue;

    // Faint base line
    g.moveTo(conduit.startX, conduit.startY);
    g.lineTo(conduit.endX, conduit.endY);
    g.stroke({ color: conduit.color, width: 0.5, alpha: 0.03 });

    // Moving particles
    for (let p = 0; p < conduit.particleCount; p++) {
      const progress = ((t * conduit.speed + p * (totalLen / conduit.particleCount)) % totalLen) / totalLen;
      const px = conduit.startX + dx * progress;
      const py = conduit.startY + dy * progress;

      // Bright particle
      g.circle(px, py, 1.5);
      g.fill({ color: conduit.color, alpha: 0.4 });
      // Glow
      g.circle(px, py, 4);
      g.fill({ color: conduit.color, alpha: 0.06 });
      // Trail
      const trailProgress = Math.max(0, progress - 0.02);
      const tx = conduit.startX + dx * trailProgress;
      const ty = conduit.startY + dy * trailProgress;
      g.moveTo(px, py);
      g.lineTo(tx, ty);
      g.stroke({ color: conduit.color, width: 1, alpha: 0.12 });
    }
  }
}

// ── Animated water in the canal ──
function drawAnimatedWater(g: Graphics, t: number): void {
  const range = RANGE;
  const canalY = -2 * PLOT_H;
  const startX = -range * PLOT_W;
  const endX = range * PLOT_W;

  for (let i = 0; i < 60; i++) {
    const baseX = startX + hash(i, 0, 5000) * (endX - startX);
    const x = ((baseX + t * (20 + hash(i, 1, 5001) * 35) - startX) % (endX - startX)) + startX;
    const localT = (x - startX) / (endX - startX);
    const meander = Math.sin(localT * Math.PI * 4) * PLOT_H * 0.6
                  + Math.sin(localT * Math.PI * 7) * PLOT_H * 0.2;
    const y = canalY + meander + (hash(i, 2, 5002) - 0.5) * 8;

    const shimmer = 0.2 + Math.sin(t * 3 + i * 0.7) * 0.12;
    const size = 1 + hash(i, 3, 5003) * 2.5;

    g.circle(x, y, size);
    g.fill({ color: 0x44aadd, alpha: shimmer });

    if (hash(i, 4, 5004) < 0.4) {
      g.rect(x - 5, y, 10, 1);
      g.fill({ color: 0x66ccff, alpha: shimmer * 0.5 });
    }
  }

  // Bright neon reflections on water
  for (let i = 0; i < 8; i++) {
    const x = startX + hash(i, 0, 5050) * (endX - startX);
    const localT2 = (x - startX) / (endX - startX);
    const meander2 = Math.sin(localT2 * Math.PI * 4) * PLOT_H * 0.6;
    const y = canalY + meander2;
    const pulse = 0.3 + Math.sin(t * 2 + i * 1.5) * 0.2;
    const color = NEON_COLORS[i % NEON_COLORS.length];
    g.rect(x - 8, y - 1, 16, 2);
    g.fill({ color, alpha: 0.06 * pulse });
  }
}

// ── Moving traffic ──
function drawTraffic(g: Graphics, t: number): void {
  for (let ri = 0; ri < trafficRoutes.length; ri++) {
    const route = trafficRoutes[ri];
    const vehicleCount = 3 + Math.floor(hash(ri, 0, 7000) * 3);
    const spacing = route.totalLen / vehicleCount;

    for (let v = 0; v < vehicleCount; v++) {
      const dist = (t * route.speed + v * spacing) % route.totalLen;
      const pos = posOnRoute(route, dist);
      if (!pos) continue;

      if (route.isVertical) {
        g.rect(pos.x - 2, pos.y - 3, 4, 7);
        g.fill({ color: route.color, alpha: 0.4 });
        const headY = (route.speed > 0) ? pos.y - 4 : pos.y + 4;
        g.circle(pos.x - 1, headY, 1.5);
        g.fill({ color: 0xffffee, alpha: 0.8 });
        g.circle(pos.x + 1, headY, 1.5);
        g.fill({ color: 0xffffee, alpha: 0.8 });
        g.circle(pos.x, headY - 2, 5);
        g.fill({ color: 0xffffcc, alpha: 0.08 });
        const tailY = (route.speed > 0) ? pos.y + 4 : pos.y - 4;
        g.circle(pos.x - 1, tailY, 1);
        g.fill({ color: 0xff2222, alpha: 0.7 });
        g.circle(pos.x + 1, tailY, 1);
        g.fill({ color: 0xff2222, alpha: 0.7 });
      } else {
        g.rect(pos.x - 4, pos.y - 2, 8, 4);
        g.fill({ color: route.color, alpha: 0.4 });
        const headX = (route.speed > 0) ? pos.x + 4 : pos.x - 4;
        g.circle(headX, pos.y - 1, 1.5);
        g.fill({ color: 0xffffee, alpha: 0.8 });
        g.circle(headX, pos.y + 1, 1.5);
        g.fill({ color: 0xffffee, alpha: 0.8 });
        g.circle(headX + 2, pos.y, 5);
        g.fill({ color: 0xffffcc, alpha: 0.08 });
        const tailX = (route.speed > 0) ? pos.x - 4 : pos.x + 4;
        g.circle(tailX, pos.y - 1, 1);
        g.fill({ color: 0xff2222, alpha: 0.7 });
        g.circle(tailX, pos.y + 1, 1);
        g.fill({ color: 0xff2222, alpha: 0.7 });
      }
    }
  }
}

// ── Data streams — falling digital characters ──
function drawDataStreams(g: Graphics, t: number): void {
  for (const ds of dataStreams) {
    const streamLen = ds.endY - ds.startY;
    for (let c = 0; c < ds.charCount; c++) {
      const baseY = ds.startY + (((t * ds.speed + c * (streamLen / ds.charCount)) % streamLen) + streamLen) % streamLen;
      const fadePos = (baseY - ds.startY) / streamLen;
      const alpha = Math.min(fadePos * 3, (1 - fadePos) * 3, 1) * 0.4;

      g.rect(ds.x, baseY, 3, 4);
      g.fill({ color: ds.color, alpha });
      g.rect(ds.x - 1, baseY - 1, 5, 6);
      g.fill({ color: ds.color, alpha: alpha * 0.25 });
    }
    const headY = ds.startY + (t * ds.speed % streamLen);
    g.rect(ds.x, headY, 3, 4);
    g.fill({ color: 0xffffff, alpha: 0.5 });
    g.circle(ds.x + 1.5, headY + 2, 5);
    g.fill({ color: ds.color, alpha: 0.07 });
  }
}

// ── Neon signs — flickering + scanning ──
function drawNeonSigns(g: Graphics, t: number): void {
  for (const sign of neonSigns) {
    const flicker = Math.sin(t * sign.flickerRate) * 0.5 + 0.5;
    const on = flicker > 0.12;
    if (!on && Math.sin(t * sign.flickerRate * 3) > 0.8) continue;

    const alpha = 0.2 + flicker * 0.2;

    // Sign background with color
    g.rect(sign.x, sign.y, sign.w, sign.h);
    g.fill({ color: sign.color, alpha: alpha * 0.4 });

    // Sign border glow (brighter)
    g.rect(sign.x - 1, sign.y - 1, sign.w + 2, sign.h + 2);
    g.stroke({ color: sign.color, width: 1.5, alpha: alpha * 0.7 });

    // Horizontal scan line
    const scanY = sign.y + ((t * sign.scanSpeed * sign.h) % sign.h);
    g.rect(sign.x, scanY, sign.w, 1);
    g.fill({ color: 0xffffff, alpha: alpha * 0.5 });

    // "Text lines" inside the sign (simulated)
    const lineCount = Math.floor(sign.h / 3);
    for (let l = 0; l < lineCount; l++) {
      const lineY = sign.y + 2 + l * 3;
      const lineW = sign.w * (0.4 + hash(sign.x + l, sign.y, 8150) * 0.5);
      const lineX = sign.x + 2 + hash(sign.x, sign.y + l, 8151) * (sign.w - lineW - 4);
      g.rect(lineX, lineY, lineW, 1);
      g.fill({ color: 0xffffff, alpha: alpha * 0.3 });
    }

    // Ambient glow (bigger, brighter)
    g.circle(sign.x + sign.w / 2, sign.y + sign.h / 2, sign.w * 0.8);
    g.fill({ color: sign.color, alpha: 0.025 * flicker });
  }
}

// ── Steam vents — rising wisps ──
function drawSteamVents(g: Graphics, t: number): void {
  for (const vent of steamVents) {
    const pulsing = 0.5 + Math.sin(t * 2 + vent.phase) * 0.5;
    g.circle(vent.x, vent.y, 3);
    g.fill({ color: 0x888899, alpha: 0.12 * vent.intensity * pulsing });

    for (let p = 0; p < 6; p++) {
      const age = ((t * 0.8 + p * 0.35 + vent.phase) % 2);
      const py = vent.y - age * 22 * vent.intensity;
      const px2 = vent.x + Math.sin(t * 1.5 + p * 1.3 + vent.phase) * (3 + age * 5);
      const size = 1.2 + age * 1.8;
      const alpha = Math.max(0, (1 - age / 2)) * 0.15 * vent.intensity * pulsing;

      g.circle(px2, py, size);
      g.fill({ color: 0xaaaacc, alpha });
    }
  }
}

// ── Flying objects — drones with blinking navigation lights + trails ──
function drawFlyingObjects(g: Graphics, t: number): void {
  const range = RANGE;
  const worldW = range * 2 * PLOT_W;
  const worldH = range * 2 * PLOT_H;

  for (const obj of flyingObjects) {
    let x = obj.x + obj.vx * t;
    let y = obj.y + obj.vy * t;
    x = ((x + worldW) % (worldW * 2)) - worldW;
    y = ((y + worldH) % (worldH * 2)) - worldH;
    const bob = Math.sin(t * 1.2 + obj.blinkPhase) * 3;

    // Shadow
    g.ellipse(x + 4, y + 8 + bob * 0.5, 4 * obj.altitude, 2 * obj.altitude);
    g.fill({ color: 0x000000, alpha: 0.07 });

    // Body
    g.rect(x - 2, y - 1 + bob, 4, 2);
    g.fill({ color: 0x333344, alpha: 0.55 });

    // Blinking navigation light
    const blink = Math.sin(t * 4 + obj.blinkPhase) > 0.3;
    if (blink) {
      g.circle(x, y + bob, 2.5);
      g.fill({ color: obj.color, alpha: 0.7 });
      g.circle(x, y + bob, 6 * obj.altitude);
      g.fill({ color: obj.color, alpha: 0.06 });
    }

    // Anti-collision strobe
    if (Math.sin(t * 12 + obj.blinkPhase) > 0.9) {
      g.circle(x, y + bob, 3);
      g.fill({ color: 0xffffff, alpha: 0.35 });
    }

    // Engine trail
    const trailLen = 8;
    const trailAngle = Math.atan2(obj.vy, obj.vx) + Math.PI;
    for (let tp = 0; tp < 3; tp++) {
      const td = tp * (trailLen / 3);
      const tx = x + Math.cos(trailAngle) * td;
      const ty = y + bob + Math.sin(trailAngle) * td;
      g.circle(tx, ty, 1 - tp * 0.2);
      g.fill({ color: obj.color, alpha: 0.15 - tp * 0.04 });
    }
  }
}

// ── Electric arcs — crackling energy between points ──
function drawElectricArcs(g: Graphics, t: number): void {
  for (const arc of electricArcs) {
    // Random visibility (arcs flash on and off)
    const visible = Math.sin(t * arc.flickerSpeed) > 0.3
                  || Math.sin(t * arc.flickerSpeed * 2.3) > 0.7;
    if (!visible) continue;

    const intensity = (0.6 + Math.sin(t * arc.flickerSpeed * 0.5) * 0.4) * arc.intensity;

    // Main arc path (jagged line)
    const segments = 6;
    const dx = arc.x2 - arc.x1;
    const dy = arc.y2 - arc.y1;
    const perpX = -dy;
    const perpY = dx;
    const perpLen = Math.sqrt(perpX * perpX + perpY * perpY);

    let prevX = arc.x1;
    let prevY = arc.y1;
    for (let s = 1; s <= segments; s++) {
      const frac = s / segments;
      const jitter = (s < segments) ? (Math.sin(t * 20 + s * 3 + arc.x1) * 6) : 0;
      const nx = arc.x1 + dx * frac + (perpLen > 0 ? perpX / perpLen * jitter : 0);
      const ny = arc.y1 + dy * frac + (perpLen > 0 ? perpY / perpLen * jitter : 0);

      g.moveTo(prevX, prevY);
      g.lineTo(nx, ny);
      g.stroke({ color: arc.color, width: 1.5, alpha: 0.4 * intensity });

      // Glow
      g.moveTo(prevX, prevY);
      g.lineTo(nx, ny);
      g.stroke({ color: arc.color, width: 4, alpha: 0.06 * intensity });

      prevX = nx;
      prevY = ny;
    }

    // Bright flash at endpoints
    g.circle(arc.x1, arc.y1, 2);
    g.fill({ color: arc.color, alpha: 0.3 * intensity });
    g.circle(arc.x2, arc.y2, 2);
    g.fill({ color: arc.color, alpha: 0.3 * intensity });
  }
}

// ── THE CORE — Mainframe AI Animation ──
function drawCentralHologram(g: Graphics, t: number): void {
  const cx = 0, cy = -10; // slightly above center (tower is offset upward)
  const pulse = 0.6 + Math.sin(t * 1.5) * 0.4;
  const rotAngle = t * 0.5;
  const breathe = 0.7 + Math.sin(t * 1.2) * 0.3;

  // ── Pulsing energy core (inside the mainframe viewport) ──
  const coreY = cy - 0;
  // Outer aura
  g.circle(cx, coreY, 18 + Math.sin(t * 2) * 3);
  g.fill({ color: 0x00fff5, alpha: 0.03 * breathe });
  g.circle(cx, coreY, 12 + Math.sin(t * 2.5) * 2);
  g.fill({ color: 0x00fff5, alpha: 0.06 * breathe });
  // Bright inner core
  g.circle(cx, coreY, 6 + Math.sin(t * 3) * 1.5);
  g.fill({ color: 0x00fff5, alpha: 0.15 * breathe });
  g.circle(cx, coreY, 3);
  g.fill({ color: 0xffffff, alpha: 0.25 * pulse });

  // ── Spinning concentric rings around the core ──
  const ringColors = [0x00fff5, 0x44aaff, 0xff0080, 0x00ff88, 0xaa44ff];
  for (let ring = 0; ring < 5; ring++) {
    const r = 10 + ring * 6;
    const speed = (ring % 2 === 0 ? 1 : -1) * (0.4 + ring * 0.15);
    const offset = rotAngle * speed + ring * Math.PI / 5;
    const ringAlpha = (0.12 - ring * 0.015) * pulse;

    // Draw ring as series of dashes (not a full circle)
    const dashCount = 6 + ring * 2;
    for (let d = 0; d < dashCount; d++) {
      const a1 = offset + (d / dashCount) * Math.PI * 2;
      const a2 = a1 + (0.6 / dashCount) * Math.PI * 2;
      g.moveTo(cx + Math.cos(a1) * r, coreY + Math.sin(a1) * r * 0.5);
      g.lineTo(cx + Math.cos(a2) * r, coreY + Math.sin(a2) * r * 0.5);
      g.stroke({ color: ringColors[ring], width: 1.2, alpha: ringAlpha });
    }
  }

  // ── Data flow particles along cable conduits ──
  // Particles flow outward from core to city edges
  const conduitDirs = [
    { dx: 0, dy: -1, len: 160 },  // up
    { dx: 0, dy: 1, len: 160 },   // down
    { dx: -1, dy: 0, len: 120 },  // left
    { dx: 1, dy: 0, len: 120 },   // right
  ];
  for (let ci = 0; ci < conduitDirs.length; ci++) {
    const dir = conduitDirs[ci];
    // 5 particles per conduit, flowing outward
    for (let p = 0; p < 5; p++) {
      const progress = ((t * 40 + p * (dir.len / 5)) % dir.len) / dir.len;
      const px = cx + dir.dx * progress * dir.len;
      const py = (cy + 10) + dir.dy * progress * dir.len; // offset to tower center
      const fadeOut = 1 - progress;
      const particleAlpha = fadeOut * 0.5 * pulse;

      // Bright particle
      g.circle(px, py, 2);
      g.fill({ color: 0x00fff5, alpha: particleAlpha });
      // Glow
      g.circle(px, py, 5);
      g.fill({ color: 0x00fff5, alpha: particleAlpha * 0.15 });
      // Trail
      const trailLen = 8;
      const tx = px - dir.dx * trailLen;
      const ty = py - dir.dy * trailLen;
      g.moveTo(px, py);
      g.lineTo(tx, ty);
      g.stroke({ color: 0x00fff5, width: 1, alpha: particleAlpha * 0.4 });
    }
  }

  // ── Processing indicator lights (blinking, cycling colors) ──
  // Along the tower panels — lights that animate through colors
  const towerX = cx - 40;
  const towerY = cy - 74;
  for (let p = 0; p < 8; p++) {
    const panelY = towerY + 8 + p * 16;
    for (let li = 0; li < 5; li++) {
      const lx = towerX + 62 + li * 3;
      const ly = panelY + 5;
      const lightPhase = (t * 2 + p * 0.5 + li * 0.3) % 3;
      const lightColor = lightPhase < 1 ? 0x00ff88 : lightPhase < 2 ? 0x00fff5 : 0xff6600;
      const lightAlpha = 0.3 + Math.sin(t * 4 + p + li) * 0.2;
      g.rect(lx, ly, 2, 2);
      g.fill({ color: lightColor, alpha: lightAlpha });
      // Tiny glow
      g.rect(lx - 1, ly - 1, 4, 4);
      g.fill({ color: lightColor, alpha: lightAlpha * 0.1 });
    }
  }

  // ── Holographic city projection above the mainframe ──
  const holoY = towerY - 35;
  const holoAlpha = 0.08 + Math.sin(t * 1.5) * 0.03;

  // Holographic base disc
  g.ellipse(cx, holoY + 20, 35, 8);
  g.stroke({ color: 0x00fff5, width: 1, alpha: holoAlpha * 1.5 });
  g.ellipse(cx, holoY + 20, 25, 5);
  g.fill({ color: 0x00fff5, alpha: holoAlpha * 0.3 });

  // Mini city silhouette (simple rectangles floating above)
  const buildings = [
    { x: -20, w: 6, h: 18 }, { x: -12, w: 5, h: 12 }, { x: -5, w: 8, h: 22 },
    { x: 5, w: 6, h: 15 }, { x: 13, w: 7, h: 20 }, { x: 22, w: 5, h: 10 },
    { x: -25, w: 4, h: 8 }, { x: 28, w: 4, h: 11 },
  ];
  for (const b of buildings) {
    const bob = Math.sin(t * 1.5 + b.x * 0.2) * 2;
    g.rect(cx + b.x - b.w / 2, holoY - b.h + bob, b.w, b.h);
    g.fill({ color: 0x00fff5, alpha: holoAlpha * 0.6 });
    g.rect(cx + b.x - b.w / 2, holoY - b.h + bob, b.w, b.h);
    g.stroke({ color: 0x00fff5, width: 0.5, alpha: holoAlpha * 1.5 });
    // Window dots
    for (let wy = 0; wy < b.h - 3; wy += 4) {
      for (let wx = 1; wx < b.w - 1; wx += 3) {
        g.rect(cx + b.x - b.w / 2 + wx, holoY - b.h + bob + wy + 2, 1, 1);
        g.fill({ color: 0xffffff, alpha: holoAlpha * 0.8 });
      }
    }
  }

  // Projection beam from tower top to hologram
  g.rect(cx - 2, towerY - 5, 4, 20);
  g.fill({ color: 0x00fff5, alpha: 0.04 * pulse });
  g.rect(cx - 1, towerY - 5, 2, 20);
  g.fill({ color: 0x00fff5, alpha: 0.1 * pulse });

  // ── Energy discharge / sparks from the top ──
  const sparkPhase = (t * 3) % 4;
  if (sparkPhase < 0.5) {
    const sparkIntensity = 1 - sparkPhase * 2;
    for (let sp = 0; sp < 6; sp++) {
      const sAngle = hash(Math.floor(t * 3), sp, 9900) * Math.PI * 2;
      const sDist = 5 + hash(Math.floor(t * 3), sp, 9901) * 20;
      const sx = cx + Math.cos(sAngle) * sDist;
      const sy = towerY - 8 + Math.sin(sAngle) * sDist * 0.4;
      g.circle(sx, sy, 1.5);
      g.fill({ color: 0xffffff, alpha: 0.4 * sparkIntensity });
      g.moveTo(cx, towerY - 5);
      g.lineTo(sx, sy);
      g.stroke({ color: 0x00fff5, width: 1, alpha: 0.25 * sparkIntensity });
    }
    // Central flash
    g.circle(cx, towerY - 5, 6);
    g.fill({ color: 0x00fff5, alpha: 0.15 * sparkIntensity });
  }

  // ── Vertical data columns (Matrix-style streams rising from tower) ──
  for (let col = 0; col < 6; col++) {
    const colX = cx - 30 + col * 12;
    const colStartY = towerY + 140; // bottom of tower
    const colHeight = 140;

    for (let c = 0; c < 8; c++) {
      const charY = colStartY - (((t * (25 + col * 5) + c * (colHeight / 8)) % colHeight));
      const fadePos = (colStartY - charY) / colHeight;
      const charAlpha = Math.min(fadePos * 3, (1 - fadePos) * 2, 1) * 0.3 * pulse;

      g.rect(colX, charY, 3, 3);
      g.fill({ color: 0x00ff88, alpha: charAlpha });
    }
    // Bright leading character
    const headY = colStartY - ((t * (25 + col * 5)) % colHeight);
    g.rect(colX, headY, 3, 3);
    g.fill({ color: 0xffffff, alpha: 0.4 * pulse });
    g.rect(colX - 1, headY - 1, 5, 5);
    g.fill({ color: 0x00ff88, alpha: 0.06 * pulse });
  }

  // ── Ambient mainframe glow ──
  g.circle(cx, cy, 60);
  g.fill({ color: 0x00fff5, alpha: 0.008 * breathe });
  g.circle(cx, cy, 100);
  g.fill({ color: 0x00fff5, alpha: 0.004 * breathe });
}

// ── Construction beams — data streams from mainframe to buildings being built ──
function drawConstructionBeams(g: Graphics, t: number): void {
  if (constructionTargets.length === 0) return;

  const coreX = 0;
  const coreY = 0;

  for (let i = 0; i < constructionTargets.length; i++) {
    const target = constructionTargets[i];
    const dx = target.x - coreX;
    const dy = target.y - coreY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) continue;

    const nx = dx / dist;
    const ny = dy / dist;

    // Faint connecting line (always visible for active construction)
    g.moveTo(coreX, coreY);
    g.lineTo(target.x, target.y);
    g.stroke({ color: 0x00fff5, width: 0.5, alpha: 0.04 });

    // Traveling particles — short glowing dashes moving from core to target
    const particleCount = 3 + Math.floor(dist / 150);
    const speed = 80 + (i % 3) * 20;
    const segLen = 8 + Math.sin(t * 0.5 + i) * 2; // short line length

    for (let p = 0; p < particleCount; p++) {
      const progress = ((t * speed + p * (dist / particleCount)) % dist) / dist;
      const px = coreX + dx * progress;
      const py = coreY + dy * progress;

      // Fade in near core, fade out near target
      const fadeIn = Math.min(progress * 5, 1);
      const fadeOut = Math.min((1 - progress) * 5, 1);
      const alpha = fadeIn * fadeOut * 0.55;

      // Short glowing line segment (oriented along the path)
      const tailX = px - nx * segLen;
      const tailY = py - ny * segLen;
      g.moveTo(tailX, tailY);
      g.lineTo(px, py);
      g.stroke({ color: 0x00fff5, width: 1.5, alpha });

      // Bright head dot
      g.circle(px, py, 1.5);
      g.fill({ color: 0xffffff, alpha: alpha * 0.8 });

      // Soft glow around particle
      g.circle(px, py, 4);
      g.fill({ color: 0x00fff5, alpha: alpha * 0.08 });
    }

    // Arrival pulse at the target building (ring that expands)
    const ringPhase = (t * 1.2 + i * 0.7) % 2;
    if (ringPhase < 1) {
      const ringR = 4 + ringPhase * 12;
      const ringAlpha = (1 - ringPhase) * 0.2;
      g.circle(target.x, target.y, ringR);
      g.stroke({ color: 0x00fff5, width: 1, alpha: ringAlpha });
    }
  }
}

// ── GIANT Holographic Billboards — the showstopper ──
function drawHolographicBillboards(g: Graphics, t: number): void {
  // NOTE: The solid opaque billboard backgrounds are drawn on the STATIC layer
  // (PlotRenderer). This function only draws animated overlay effects that
  // appear on top of that static background but BEHIND houses (via bgAnimLayer).
  for (let bi = 0; bi < holoBillboards.length; bi++) {
    const bb = holoBillboards[bi];
    const pulse = 0.7 + Math.sin(t * 1.5 + bi * 1.2) * 0.3;

    // Billboard screen dimensions (must match PlotRenderer)
    const frameW = bb.w;
    const frameH = bb.h;
    const frameX = bb.x - frameW / 2;
    const frameY = bb.y - frameH / 2;

    // ── Scrolling text lines (moving horizontally across the screen) ──
    const textLines = Math.floor(frameH / 8);
    for (let l = 0; l < textLines; l++) {
      const lineY = frameY + 5 + l * 8;
      const scrollOffset = (t * bb.textSpeed * (1 + l * 0.3)) % (frameW * 2);
      const lineColor = l % 2 === 0 ? bb.color1 : bb.color2;

      for (let b = 0; b < 5; b++) {
        const blockW = 8 + hash(bi + l, b, 4100) * 20;
        const blockX = frameX + ((scrollOffset + b * 30) % (frameW + blockW)) - blockW;
        if (blockX > frameX + frameW || blockX + blockW < frameX) continue;

        const clippedX = Math.max(frameX + 3, blockX);
        const clippedW = Math.min(frameX + frameW - 3, blockX + blockW) - clippedX;
        if (clippedW <= 0) continue;

        g.rect(clippedX, lineY, clippedW, 2);
        g.fill({ color: lineColor, alpha: 0.4 * pulse });
      }
    }

    // ── Glitch effect (periodic scan disruption) ──
    const glitchPhase = (t * bb.glitchRate) % 10;
    if (glitchPhase < 0.3) {
      const glitchCount = 3 + Math.floor(hash(bi, 0, 4200) * 4);
      for (let gi = 0; gi < glitchCount; gi++) {
        const gy = frameY + hash(bi, gi, 4201) * frameH;
        const gw = frameW * (0.3 + hash(bi, gi, 4202) * 0.7);
        const gx = frameX + hash(bi, gi, 4203) * (frameW - gw);
        g.rect(gx, gy, gw, 2 + hash(bi, gi, 4204) * 4);
        g.fill({ color: hash(bi, gi, 4205) < 0.5 ? bb.color1 : 0xffffff, alpha: 0.35 });
      }
    }

    // ── Scanning horizontal line ──
    const scanY = frameY + ((t * 15) % frameH);
    g.rect(frameX, scanY, frameW, 1);
    g.fill({ color: 0xffffff, alpha: 0.2 * pulse });
    g.rect(frameX, scanY + 1, frameW, 2);
    g.fill({ color: bb.color1, alpha: 0.08 * pulse });

    // ── Pulsing border glow (animated overlay on static frame) ──
    g.rect(frameX, frameY, frameW, frameH);
    g.stroke({ color: bb.color1, width: 1, alpha: 0.2 * pulse });

    // ── Side light bar pulse ──
    const barPulse = Math.sin(t * 3 + bi * 2) * 0.5 + 0.5;
    g.rect(frameX - 5, frameY, 2, frameH);
    g.fill({ color: bb.color1, alpha: 0.2 * barPulse });
    g.rect(frameX + frameW + 3, frameY, 2, frameH);
    g.fill({ color: bb.color2, alpha: 0.2 * barPulse });

    // ── Shimmer particles around billboard ──
    for (let sp = 0; sp < 10; sp++) {
      const angle = t * 0.5 + (sp / 10) * Math.PI * 2 + bi;
      const dist = frameW * 0.45 + Math.sin(t * 1.5 + sp) * 12;
      const spx = bb.x + Math.cos(angle) * dist;
      const spy = bb.y + Math.sin(angle) * dist * 0.6;
      g.circle(spx, spy, 1.5);
      g.fill({ color: bb.color1, alpha: 0.25 + Math.sin(t * 3 + sp) * 0.12 });
    }

    // ── Ambient glow around billboard ──
    g.rect(frameX - 8, frameY - 8, frameW + 16, frameH + 16);
    g.fill({ color: bb.color1, alpha: 0.008 * pulse });
  }
}

// ── Intersection floating particles ──
function drawIntersectionHolos(g: Graphics, t: number): void {
  for (let ix = -5; ix <= 5; ix++) {
    for (let iy = -5; iy <= 5; iy++) {
      if ((ix + iy) % 3 !== 0 || (ix === 0 && iy === 0)) continue;
      const hx = ix * PLOT_W;
      const hy = iy * PLOT_H;

      for (let p = 0; p < 5; p++) {
        const seed = hash(ix, iy, p + 10);
        const angle = t * (0.5 + seed) + seed * Math.PI * 2;
        const radius = 5 + seed * 8;
        const px2 = hx + Math.cos(angle) * radius;
        const py2 = hy + Math.sin(angle) * radius;
        const dotAlpha = 0.18 + Math.sin(t * 2 + seed * 10) * 0.12;

        g.circle(px2, py2, 1.5);
        g.fill({ color: 0x00fff5, alpha: dotAlpha });
        const trailAngle = angle - 0.5;
        const tx = hx + Math.cos(trailAngle) * radius;
        const ty = hy + Math.sin(trailAngle) * radius;
        g.moveTo(px2, py2);
        g.lineTo(tx, ty);
        g.stroke({ color: 0x00fff5, width: 0.5, alpha: dotAlpha * 0.35 });
      }
    }
  }
}

// ── Landmark beacons ──
function drawLandmarkBeacons(g: Graphics, t: number): void {
  for (const lm of LANDMARKS) {
    if (lm.type === 'plaza') continue;
    const px = lm.cx * PLOT_W;
    const py = lm.cy * PLOT_H;
    const isHolo = lm.type === 'holographic_billboard';
    const beaconPulse = 0.5 + Math.sin(t * 1.5 + lm.cx + lm.cy) * 0.5;
    const beaconColor = isHolo ? 0x44aaff :
                        lm.type === 'monument' ? 0xff0080 : 0x00fff5;

    // Expanding rings (3 waves)
    for (let ring = 0; ring < 3; ring++) {
      const ringPhase = (t * 0.5 + lm.cx * 0.3 + ring * 0.33) % 1;
      const ringR = 4 + ringPhase * (isHolo ? 25 : 18);
      const ringAlpha = (1 - ringPhase) * 0.15 * beaconPulse;
      g.circle(px, py, ringR);
      g.stroke({ color: beaconColor, width: 1.5, alpha: ringAlpha });
    }

    // Center dot
    g.circle(px, py, 3);
    g.fill({ color: beaconColor, alpha: 0.25 * beaconPulse });

    // Vertical beam at monuments and holo billboards
    if (lm.type === 'monument' || isHolo) {
      const beamA = 0.02 + Math.sin(t * 2 + lm.cx) * 0.01;
      const beamH = isHolo ? 80 : 50;
      g.rect(px - 1.5, py - beamH / 2, 3, beamH);
      g.fill({ color: beaconColor, alpha: beamA });
    }
  }
}

// ── Sparkle clusters — floating magical particles ──
function drawSparkleClusters(g: Graphics, t: number): void {
  for (let ci = 0; ci < sparkleClusters.length; ci++) {
    const cluster = sparkleClusters[ci];
    for (let p = 0; p < cluster.count; p++) {
      const angle = t * cluster.speed + (p / cluster.count) * Math.PI * 2 + ci;
      const r = cluster.radius * (0.3 + hash(ci, p, 5700) * 0.7);
      const heightOff = Math.sin(t * 2 + p * 1.5 + ci) * 8;
      const px = cluster.cx + Math.cos(angle) * r;
      const py = cluster.cy + Math.sin(angle) * r * 0.6 + heightOff;

      const twinkle = 0.3 + Math.sin(t * 5 + p * 2.3 + ci) * 0.3;
      if (twinkle < 0.15) continue; // twinkle off

      // Sparkle point
      g.circle(px, py, 1);
      g.fill({ color: cluster.color, alpha: twinkle });
      // Star shape (small cross)
      g.rect(px - 2, py, 4, 0.5);
      g.fill({ color: cluster.color, alpha: twinkle * 0.5 });
      g.rect(px, py - 2, 0.5, 4);
      g.fill({ color: cluster.color, alpha: twinkle * 0.5 });
      // Glow
      g.circle(px, py, 3);
      g.fill({ color: cluster.color, alpha: twinkle * 0.08 });
    }
  }
}

// ── Street light pools ──
function drawStreetLightPools(g: Graphics, t: number): void {
  const range = RANGE;
  for (let px = -range; px < range; px += 2) {
    for (let py = -range; py < range; py += 2) {
      const meta = getPlotMeta(px, py);
      const pal = getNeighborhoodPalette(meta.neighborhood);
      if (pal.neonIntensity < 0.1) continue;

      const wx = px * PLOT_W + meta.streetWidthW / 2 + 4;
      const wy = py * PLOT_H + meta.streetWidthN / 2 + 4;

      const flicker = 0.8 + Math.sin(t * 5 + hash(px, py, 6000) * 20) * 0.2;
      const alpha = 0.025 * pal.neonIntensity * flicker;

      // Warm light pool
      g.circle(wx, wy, 14);
      g.fill({ color: 0xffddaa, alpha });
      g.circle(wx, wy, 7);
      g.fill({ color: 0xffddaa, alpha: alpha * 2.5 });
      // Colored accent light (neighborhood themed)
      g.circle(wx, wy, 10);
      g.fill({ color: pal.accentColor, alpha: alpha * 0.3 });
    }
  }
}

// ── Cyber rain ──
function drawCyberRain(g: Graphics, t: number): void {
  const range = RANGE;
  const worldW = range * 2 * PLOT_W;
  const worldH = range * 2 * PLOT_H;

  // Rain streaks (more)
  for (let i = 0; i < 100; i++) {
    const baseX = (hash(i, 0, 3000) - 0.5) * worldW;
    const baseY = (hash(i, 1, 3001) - 0.5) * worldH;
    const speed = 80 + hash(i, 2, 3002) * 140;
    const len = 8 + hash(i, 3, 3003) * 12;

    const cycle = (t * speed) % worldH;
    const x = baseX + cycle * 0.1;
    const y = ((baseY + cycle) % worldH) - worldH / 2;

    const alpha = 0.05 + hash(i, 4, 3004) * 0.05;

    g.moveTo(x, y);
    g.lineTo(x + len * 0.15, y + len);
    g.stroke({ color: 0x6688cc, width: 0.5, alpha });
  }

  // Neon reflection splashes (more frequent)
  for (let i = 0; i < 15; i++) {
    const cycle = (t * (50 + i * 12) + hash(i, 0, 3100) * 1000) % 3;
    if (cycle > 0.6) continue;

    const x = (hash(i, 1, 3101) - 0.5) * worldW * 0.85;
    const y = (hash(i, 2, 3102) - 0.5) * worldH * 0.85;
    const color = NEON_COLORS[i % NEON_COLORS.length];

    g.circle(x, y, 2 + cycle * 4);
    g.fill({ color, alpha: (0.6 - cycle) * 0.1 });
    // Splash ring
    g.circle(x, y, 3 + cycle * 6);
    g.stroke({ color, width: 0.5, alpha: (0.6 - cycle) * 0.06 });
  }
}
