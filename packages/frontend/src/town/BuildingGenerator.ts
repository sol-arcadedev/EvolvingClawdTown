// ═══════════════════════════════════════════════════════════════════
// Procedural Cyberpunk Building Generator
// Generates unique building textures from wallet address + tier
// ═══════════════════════════════════════════════════════════════════

import { Texture } from 'pixi.js';

const W = 192;
const H = 288;

// ── Seeded PRNG ──
function makeRng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function addressToSeed(addr: string): number {
  let h = 0;
  for (let i = 0; i < addr.length; i++) {
    h = ((h << 5) - h + addr.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

// ── Color helpers ──
function hsl(h: number, s: number, l: number): string {
  return `hsl(${h},${s}%,${l}%)`;
}

function hsla(h: number, s: number, l: number, a: number): string {
  return `hsla(${h},${s}%,${l}%,${a})`;
}

// ── Cyberpunk facade palettes ──
interface Palette {
  wallH: number; wallS: number; wallL: number; // HSL for main wall
  accentH: number; accentS: number; accentL: number; // neon accent
  windowLit: string; // lit window color
  windowDark: string; // unlit window color
}

const PALETTES: Palette[] = [
  { wallH: 230, wallS: 30, wallL: 12, accentH: 180, accentS: 100, accentL: 50, windowLit: '#2a5060', windowDark: '#141828' },
  { wallH: 260, wallS: 25, wallL: 11, accentH: 320, accentS: 100, accentL: 50, windowLit: '#503060', windowDark: '#1a1428' },
  { wallH: 200, wallS: 35, wallL: 13, accentH: 150, accentS: 100, accentL: 50, windowLit: '#204838', windowDark: '#101820' },
  { wallH: 280, wallS: 20, wallL: 10, accentH: 270, accentS: 80, accentL: 55, windowLit: '#3a2060', windowDark: '#161028' },
  { wallH: 15, wallS: 30, wallL: 12, accentH: 25, accentS: 100, accentL: 55, windowLit: '#504030', windowDark: '#201810' },
  { wallH: 220, wallS: 40, wallL: 14, accentH: 210, accentS: 90, accentL: 55, windowLit: '#204060', windowDark: '#101828' },
  { wallH: 340, wallS: 30, wallL: 11, accentH: 340, accentS: 100, accentL: 55, windowLit: '#502838', windowDark: '#1a1018' },
  { wallH: 45, wallS: 25, wallL: 12, accentH: 40, accentS: 100, accentL: 55, windowLit: '#484020', windowDark: '#201c10' },
  { wallH: 190, wallS: 50, wallL: 10, accentH: 185, accentS: 100, accentL: 45, windowLit: '#185050', windowDark: '#0c1820' },
  { wallH: 300, wallS: 35, wallL: 13, accentH: 290, accentS: 90, accentL: 60, windowLit: '#402850', windowDark: '#181028' },
];

// ── Rooftop element types ──
type RoofElement = 'ac' | 'antenna' | 'dish' | 'tank' | 'helipad' | 'sign' | 'solar';

// ── Texture cache ──
const textureCache = new Map<string, Texture>();

export function getProceduralBuildingTexture(address: string, tier: number): Texture {
  const key = `${address}_${tier}`;
  const cached = textureCache.get(key);
  if (cached) return cached;

  const canvas = generateBuilding(address, tier);
  const tex = Texture.from(canvas);
  textureCache.set(key, tex);
  return tex;
}

function generateBuilding(address: string, tier: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const seed = addressToSeed(address);
  const rng = makeRng(seed + tier * 9999);

  // Pick palette
  const pal = PALETTES[Math.floor(rng() * PALETTES.length)];

  // Building dimensions based on tier
  const tierIdx = Math.max(0, Math.min(4, tier - 1));
  const heightRatios = [0.32, 0.48, 0.64, 0.80, 0.93];
  const widthRatios = [0.42, 0.52, 0.58, 0.65, 0.72];
  const buildH = Math.floor(H * heightRatios[tierIdx] * (0.92 + rng() * 0.08));
  const buildW = Math.floor(W * widthRatios[tierIdx] * (0.9 + rng() * 0.1));
  const buildX = Math.floor((W - buildW) / 2);
  const buildY = H - buildH - 12;

  // 3D depth offset — isometric right-side face width
  const DEPTH = Math.max(6, Math.floor(buildW * 0.12));

  // Number of floors
  const floorCounts = [2, 4, 7, 10, 14];
  const floors = floorCounts[tierIdx] + Math.floor(rng() * 2);
  const floorH = Math.floor((buildH - 16) / floors); // 16px reserved for roof+ground

  // ── Building shape variant ──
  const shapeVariant = rng();
  const hasSetback = tierIdx >= 2 && shapeVariant < 0.4;
  const setbackFloor = hasSetback ? Math.floor(floors * (0.5 + rng() * 0.3)) : floors;
  const setbackInset = hasSetback ? Math.floor(buildW * 0.12) : 0;

  const hasSideWing = tierIdx >= 3 && shapeVariant >= 0.4 && shapeVariant < 0.7;
  const wingW = hasSideWing ? Math.floor(buildW * 0.25) : 0;
  const wingH = hasSideWing ? Math.floor(buildH * (0.3 + rng() * 0.2)) : 0;
  const wingLeft = rng() < 0.5;

  // ── 1. Drop shadow on ground (long, offset to bottom-right) ──
  const shadowOX = Math.floor(DEPTH * 0.8);
  const shadowOY = Math.floor(DEPTH * 1.2);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  drawBuildingShape(ctx, buildX + shadowOX, buildY + shadowOY, buildW, buildH, floors, floorH,
    hasSetback, setbackFloor, setbackInset, false, 0, 0, false);
  // Softer outer shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  drawBuildingShape(ctx, buildX + shadowOX + 2, buildY + shadowOY + 2, buildW + 2, buildH + 2, floors, floorH,
    hasSetback, setbackFloor, setbackInset, false, 0, 0, false);

  // ── 2. Right-side face (isometric depth) — drawn BEFORE front face ──
  const sideColor = hsl(pal.wallH, pal.wallS + 5, Math.max(3, pal.wallL - 6));
  ctx.fillStyle = sideColor;
  // Right face: a parallelogram from right edge of front to shadow offset
  ctx.beginPath();
  ctx.moveTo(buildX + buildW, buildY);               // top-right of front
  ctx.lineTo(buildX + buildW + DEPTH, buildY + DEPTH); // top-right of back (offset)
  ctx.lineTo(buildX + buildW + DEPTH, buildY + buildH + DEPTH); // bottom-right of back
  ctx.lineTo(buildX + buildW, buildY + buildH);       // bottom-right of front
  ctx.closePath();
  ctx.fill();
  // Gradient on the side face — darker at edges
  ctx.fillStyle = hsla(pal.wallH, pal.wallS, Math.max(2, pal.wallL - 9), 0.5);
  ctx.fillRect(buildX + buildW, buildY, DEPTH, buildH);
  // Side face floor lines (for detail)
  for (let f = 0; f < floors; f++) {
    const fy = buildY + buildH - 8 - (f + 1) * floorH;
    if (fy < buildY) break;
    ctx.fillStyle = hsla(pal.wallH, pal.wallS, pal.wallL - 3, 0.3);
    ctx.fillRect(buildX + buildW, fy, DEPTH, 1);
  }

  // ── 3. Bottom face (visible depth under building) ──
  const bottomColor = hsl(pal.wallH, pal.wallS + 3, Math.max(2, pal.wallL - 8));
  ctx.fillStyle = bottomColor;
  ctx.beginPath();
  ctx.moveTo(buildX, buildY + buildH);                // bottom-left of front
  ctx.lineTo(buildX + buildW, buildY + buildH);       // bottom-right of front
  ctx.lineTo(buildX + buildW + DEPTH, buildY + buildH + DEPTH); // bottom-right of back
  ctx.lineTo(buildX + DEPTH, buildY + buildH + DEPTH); // bottom-left of back
  ctx.closePath();
  ctx.fill();

  // ── 4. Main front face ──
  const wallColor = hsl(pal.wallH, pal.wallS, pal.wallL);
  const wallLighter = hsl(pal.wallH, pal.wallS, pal.wallL + 5);

  ctx.fillStyle = wallColor;
  drawBuildingShape(ctx, buildX, buildY, buildW, buildH, floors, floorH,
    hasSetback, setbackFloor, setbackInset, hasSideWing, wingW, wingH, wingLeft);

  // ── 5. Front face lighting — top-left light source ──
  // Left edge highlight (light hits here)
  ctx.fillStyle = hsla(pal.wallH, pal.wallS - 5, pal.wallL + 12, 0.4);
  ctx.fillRect(buildX, buildY, 3, buildH);
  // Top edge highlight
  ctx.fillStyle = wallLighter;
  ctx.fillRect(buildX, buildY, buildW, 4);
  ctx.fillStyle = hsla(pal.wallH, pal.wallS - 5, pal.wallL + 16, 0.3);
  ctx.fillRect(buildX, buildY, buildW, 2);
  // Right edge darkened (light doesn't reach)
  ctx.fillStyle = hsla(pal.wallH, pal.wallS, Math.max(2, pal.wallL - 5), 0.6);
  ctx.fillRect(buildX + buildW - 4, buildY, 4, buildH);
  // Bottom edge darkened
  ctx.fillStyle = hsla(pal.wallH, pal.wallS, Math.max(2, pal.wallL - 7), 0.5);
  ctx.fillRect(buildX, buildY + buildH - 3, buildW, 3);
  // Vertical ambient occlusion gradient on right third
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = `rgba(0,0,0,${0.01 * (8 - i)})`;
    ctx.fillRect(buildX + buildW - 8 + i, buildY + 4, 1, buildH - 7);
  }

  // ── Floor separators ──
  for (let f = 0; f < floors; f++) {
    const fy = buildY + buildH - 8 - (f + 1) * floorH;
    const fx = f >= setbackFloor ? buildX + setbackInset : buildX;
    const fw = f >= setbackFloor ? buildW - setbackInset * 2 : buildW;

    if (fy < buildY) break;

    // Floor line
    ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL + 3);
    ctx.fillRect(fx, fy, fw, 1);

    // Ledge shadow below
    ctx.fillStyle = hsla(pal.wallH, pal.wallS, pal.wallL - 5, 0.5);
    ctx.fillRect(fx, fy + 1, fw, 1);
  }

  // ── Windows ──
  const windowStyle = Math.floor(rng() * 4); // 0=grid, 1=strips, 2=scattered, 3=wide
  drawWindows(ctx, rng, pal, buildX, buildY, buildW, buildH, floors, floorH,
    windowStyle, hasSetback, setbackFloor, setbackInset);

  // ── Ground floor (storefront) ──
  drawGroundFloor(ctx, rng, pal, buildX, buildY + buildH - 8 - floorH, buildW, floorH + 8, tierIdx);

  // ── Neon accent strips ──
  drawNeonAccents(ctx, rng, pal, buildX, buildY, buildW, buildH, floors, floorH, tierIdx);

  // ── Rooftop ──
  drawRooftop(ctx, rng, pal, buildX, buildY, buildW, tierIdx);

  // ── Side wing ──
  if (hasSideWing) {
    const wx = wingLeft ? buildX - wingW + 4 : buildX + buildW - 4;
    const wy = buildY + buildH - wingH;
    ctx.fillStyle = hsl(pal.wallH, pal.wallS + 5, pal.wallL - 1);
    ctx.fillRect(wx, wy, wingW, wingH);
    // Wing windows
    const wingFloors = Math.floor(wingH / floorH);
    for (let f = 0; f < wingFloors; f++) {
      const fy = wy + wingH - 8 - (f + 1) * floorH;
      const winCount = Math.max(1, Math.floor(wingW / 14));
      for (let wi = 0; wi < winCount; wi++) {
        const winX = wx + 4 + wi * Math.floor((wingW - 8) / Math.max(1, winCount));
        const lit = rng() < 0.5;
        ctx.fillStyle = lit ? pal.windowLit : pal.windowDark;
        ctx.fillRect(winX, fy + 3, 6, 5);
      }
    }
    // Wing roof edge
    ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL + 5);
    ctx.fillRect(wx, wy, wingW, 2);
  }

  // ── Base/foundation — wraps around bottom with depth ──
  ctx.fillStyle = hsl(pal.wallH, pal.wallS - 10, pal.wallL - 2);
  ctx.fillRect(buildX - 2, buildY + buildH, buildW + 4, 6);
  // Foundation top highlight
  ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL + 4);
  ctx.fillRect(buildX - 2, buildY + buildH, buildW + 4, 1);
  // Foundation right-side depth face
  ctx.fillStyle = hsl(pal.wallH, pal.wallS - 10, Math.max(2, pal.wallL - 6));
  ctx.beginPath();
  ctx.moveTo(buildX + buildW + 2, buildY + buildH);
  ctx.lineTo(buildX + buildW + 2 + DEPTH, buildY + buildH + DEPTH);
  ctx.lineTo(buildX + buildW + 2 + DEPTH, buildY + buildH + 6 + DEPTH);
  ctx.lineTo(buildX + buildW + 2, buildY + buildH + 6);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

function drawBuildingShape(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  floors: number, floorH: number,
  hasSetback: boolean, setbackFloor: number, setbackInset: number,
  hasSideWing: boolean, wingW: number, wingH: number, wingLeft: boolean,
): void {
  if (hasSetback) {
    // Lower section (wider)
    const lowerH = (setbackFloor + 1) * floorH + 8;
    ctx.fillRect(x, y + h - lowerH, w, lowerH);
    // Upper section (narrower)
    const upperH = h - lowerH;
    if (upperH > 0) {
      ctx.fillRect(x + setbackInset, y, w - setbackInset * 2, upperH);
    }
  } else {
    ctx.fillRect(x, y, w, h);
  }
}

function drawWindows(
  ctx: CanvasRenderingContext2D, rng: () => number, pal: Palette,
  bx: number, by: number, bw: number, bh: number,
  floors: number, floorH: number, style: number,
  hasSetback: boolean, setbackFloor: number, setbackInset: number,
): void {
  const winW = style === 3 ? 12 : style === 1 ? 10 : 6;
  const winH = style === 1 ? 3 : 5;
  const winGap = style === 3 ? 16 : style === 1 ? 14 : 10;

  for (let f = 1; f < floors; f++) { // skip ground floor
    const fy = by + bh - 8 - (f + 1) * floorH;
    if (fy < by) break;

    const fx = f >= setbackFloor && hasSetback ? bx + setbackInset : bx;
    const fw = f >= setbackFloor && hasSetback ? bw - setbackInset * 2 : bw;

    const winCount = Math.max(1, Math.floor((fw - 8) / winGap));

    for (let wi = 0; wi < winCount; wi++) {
      const winX = fx + 6 + wi * Math.floor((fw - 12) / Math.max(1, winCount));
      const winY = fy + Math.floor((floorH - winH) / 2);

      if (style === 2 && rng() < 0.3) continue; // scattered — skip some

      const litChance = 0.4 + f * 0.02; // higher floors more likely lit
      const lit = rng() < litChance;

      if (lit) {
        // Lit window with random color tint
        const warmth = rng();
        if (warmth < 0.3) {
          ctx.fillStyle = pal.windowLit;
        } else if (warmth < 0.5) {
          // Warm yellow/orange
          ctx.fillStyle = `hsl(${30 + rng() * 20}, 60%, ${25 + rng() * 15}%)`;
        } else if (warmth < 0.7) {
          // Cool blue
          ctx.fillStyle = `hsl(${200 + rng() * 30}, 50%, ${20 + rng() * 15}%)`;
        } else {
          // Neon tint (accent color at low brightness)
          ctx.fillStyle = hsla(pal.accentH, pal.accentS, 25, 0.7);
        }
      } else {
        ctx.fillStyle = pal.windowDark;
      }

      ctx.fillRect(winX, winY, winW, winH);

      // Window frame
      ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL + 5);
      ctx.fillRect(winX - 1, winY - 1, winW + 2, 1); // top frame
      ctx.fillRect(winX - 1, winY + winH, winW + 2, 1); // bottom frame

      // Bright pixel in lit windows (reflection)
      if (lit && rng() < 0.3) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fillRect(winX + 1, winY + 1, 2, 1);
      }
    }
  }
}

function drawGroundFloor(
  ctx: CanvasRenderingContext2D, rng: () => number, pal: Palette,
  x: number, y: number, w: number, h: number, tierIdx: number,
): void {
  // Ground floor base (slightly different color)
  ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL - 2);
  ctx.fillRect(x, y, w, h);

  // Door
  const doorW = 10 + Math.floor(rng() * 6);
  const doorH = h - 6;
  const doorX = x + Math.floor((w - doorW) / 2 + (rng() - 0.5) * w * 0.3);
  const doorY = y + h - doorH;

  const doorStyle = Math.floor(rng() * 3);
  if (doorStyle === 0) {
    // Neon-framed door
    ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL - 5);
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.5);
    ctx.fillRect(doorX - 1, doorY, 1, doorH);
    ctx.fillRect(doorX + doorW, doorY, 1, doorH);
    ctx.fillRect(doorX - 1, doorY - 1, doorW + 2, 1);
  } else if (doorStyle === 1) {
    // Glass door
    ctx.fillStyle = 'rgba(20,40,60,0.8)';
    ctx.fillRect(doorX, doorY, doorW, doorH);
    ctx.fillStyle = 'rgba(40,80,100,0.3)';
    ctx.fillRect(doorX + 2, doorY + 2, doorW - 4, doorH - 4);
  } else {
    // Awning door
    ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL - 5);
    ctx.fillRect(doorX, doorY, doorW, doorH);
    // Awning
    const awningColor = hsl(pal.accentH, pal.accentS - 20, pal.accentL - 15);
    ctx.fillStyle = awningColor;
    ctx.fillRect(doorX - 4, doorY - 4, doorW + 8, 4);
  }

  // Storefront windows (wider than upper windows)
  if (tierIdx >= 1) {
    const sfCount = 1 + Math.floor(rng() * 2);
    for (let s = 0; s < sfCount; s++) {
      const sfW = 14 + Math.floor(rng() * 10);
      const sfH = h - 10;
      let sfX: number;
      if (s === 0) {
        sfX = x + 4 + Math.floor(rng() * (doorX - x - sfW - 6));
        if (sfX < x + 4) sfX = x + 4;
      } else {
        sfX = doorX + doorW + 4 + Math.floor(rng() * 10);
        if (sfX + sfW > x + w - 4) sfX = x + w - 4 - sfW;
      }
      const sfY = y + h - sfH;

      ctx.fillStyle = 'rgba(15,30,50,0.9)';
      ctx.fillRect(sfX, sfY, sfW, sfH);
      // Glass reflection
      ctx.fillStyle = 'rgba(30,60,80,0.3)';
      ctx.fillRect(sfX + 1, sfY + 1, Math.floor(sfW / 2), sfH - 2);
      // Window sill
      ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL + 6);
      ctx.fillRect(sfX - 1, sfY + sfH, sfW + 2, 2);
    }
  }
}

function drawNeonAccents(
  ctx: CanvasRenderingContext2D, rng: () => number, pal: Palette,
  bx: number, by: number, bw: number, bh: number,
  floors: number, floorH: number, tierIdx: number,
): void {
  // Number of accent lines based on tier
  const lineCount = tierIdx <= 1 ? 1 : tierIdx <= 3 ? 2 : 3;

  for (let i = 0; i < lineCount; i++) {
    const accentFloor = 1 + Math.floor(rng() * (floors - 2));
    const fy = by + bh - 8 - (accentFloor + 1) * floorH;
    if (fy < by) continue;

    const accentType = rng();

    if (accentType < 0.4) {
      // Full-width neon strip
      ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.3);
      ctx.fillRect(bx, fy - 1, bw, 2);
      // Glow
      ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.08);
      ctx.fillRect(bx, fy - 3, bw, 6);
    } else if (accentType < 0.7) {
      // Side strip (left or right)
      const leftSide = rng() < 0.5;
      const sx = leftSide ? bx : bx + bw - 2;
      const stripH = Math.floor(floorH * (2 + rng() * 3));
      ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.35);
      ctx.fillRect(sx, fy - stripH, 2, stripH);
      ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.1);
      ctx.fillRect(sx - 1, fy - stripH, 4, stripH);
    } else {
      // Neon sign rectangle
      const signW = 10 + Math.floor(rng() * 16);
      const signH = 6 + Math.floor(rng() * 6);
      const signX = bx + Math.floor(rng() * (bw - signW - 4)) + 2;
      ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL - 10, 0.25);
      ctx.fillRect(signX, fy + 2, signW, signH);
      ctx.strokeStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.5);
      ctx.lineWidth = 1;
      ctx.strokeRect(signX, fy + 2, signW, signH);
    }
  }

  // Vertical accent line on building edge for higher tiers
  if (tierIdx >= 2) {
    const edgeSide = rng() < 0.5;
    const ex = edgeSide ? bx : bx + bw - 1;
    ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.15);
    ctx.fillRect(ex, by, 1, bh);
  }
}

function drawRooftop(
  ctx: CanvasRenderingContext2D, rng: () => number, pal: Palette,
  bx: number, by: number, bw: number, tierIdx: number,
): void {
  // ── Visible top face (roof surface) — lighter, seen from above ──
  const DEPTH = Math.max(6, Math.floor(bw * 0.12));
  const roofColor = hsl(pal.wallH, pal.wallS - 5, pal.wallL + 8);
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(bx, by);                      // front-left
  ctx.lineTo(bx + bw, by);                 // front-right
  ctx.lineTo(bx + bw + DEPTH, by - DEPTH); // back-right (offset up-right)
  ctx.lineTo(bx + DEPTH, by - DEPTH);      // back-left
  ctx.closePath();
  ctx.fill();
  // Roof surface texture — subtle grid
  ctx.fillStyle = hsla(pal.wallH, pal.wallS, pal.wallL + 12, 0.15);
  for (let rx = 0; rx < bw; rx += 8) {
    ctx.fillRect(bx + rx + Math.floor(rx * DEPTH / bw), by - Math.floor(rx * DEPTH / bw), 1, DEPTH);
  }
  // Roof front edge highlight (parapet)
  ctx.fillStyle = hsl(pal.wallH, pal.wallS, pal.wallL + 14);
  ctx.fillRect(bx, by - 1, bw, 2);
  // Roof right edge shadow
  ctx.fillStyle = hsla(pal.wallH, pal.wallS, pal.wallL, 0.4);
  ctx.beginPath();
  ctx.moveTo(bx + bw, by);
  ctx.lineTo(bx + bw + DEPTH, by - DEPTH);
  ctx.lineTo(bx + bw + DEPTH, by - DEPTH + 2);
  ctx.lineTo(bx + bw, by + 2);
  ctx.closePath();
  ctx.fill();

  // Rooftop elements
  const elementCount = 1 + tierIdx;
  const elements: RoofElement[] = ['ac', 'antenna', 'dish', 'tank', 'helipad', 'sign', 'solar'];
  const usedX: number[] = [];

  for (let i = 0; i < Math.min(elementCount, 4); i++) {
    const elem = elements[Math.floor(rng() * elements.length)];
    let ex = bx + 6 + Math.floor(rng() * (bw - 20));
    // Avoid overlap
    let attempts = 0;
    while (usedX.some(ux => Math.abs(ex - ux) < 16) && attempts < 10) {
      ex = bx + 6 + Math.floor(rng() * (bw - 20));
      attempts++;
    }
    usedX.push(ex);

    switch (elem) {
      case 'ac': {
        // AC unit — small box
        const acW = 8 + Math.floor(rng() * 6);
        const acH = 5 + Math.floor(rng() * 3);
        ctx.fillStyle = hsl(pal.wallH, 10, 20);
        ctx.fillRect(ex, by - acH - 2, acW, acH);
        ctx.fillStyle = hsl(pal.wallH, 10, 25);
        ctx.fillRect(ex, by - acH - 2, acW, 1);
        // Fan grill
        ctx.fillStyle = hsl(pal.wallH, 10, 14);
        ctx.fillRect(ex + 2, by - acH, acW - 4, acH - 2);
        break;
      }
      case 'antenna': {
        // Thin vertical antenna
        ctx.fillStyle = hsl(0, 0, 30);
        ctx.fillRect(ex + 2, by - 18 - Math.floor(rng() * 12), 2, 18 + Math.floor(rng() * 12));
        // Blinking light at top
        ctx.fillStyle = hsla(0, 100, 50, 0.7);
        ctx.fillRect(ex + 1, by - 18 - Math.floor(rng() * 12), 4, 2);
        break;
      }
      case 'dish': {
        // Satellite dish
        ctx.fillStyle = hsl(0, 0, 25);
        ctx.beginPath();
        ctx.arc(ex + 6, by - 6, 6, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = hsl(0, 0, 20);
        ctx.fillRect(ex + 5, by - 6, 2, 6);
        break;
      }
      case 'tank': {
        // Water tank (cylinder)
        const tw = 10 + Math.floor(rng() * 4);
        const th = 8 + Math.floor(rng() * 4);
        ctx.fillStyle = hsl(pal.wallH, 15, 16);
        ctx.fillRect(ex, by - th - 2, tw, th);
        ctx.fillStyle = hsl(pal.wallH, 15, 20);
        ctx.fillRect(ex, by - th - 2, tw, 2);
        // Legs
        ctx.fillStyle = hsl(0, 0, 22);
        ctx.fillRect(ex + 1, by - 2, 2, 2);
        ctx.fillRect(ex + tw - 3, by - 2, 2, 2);
        break;
      }
      case 'helipad': {
        if (tierIdx < 3) break; // only on tall buildings
        const hpSize = 14;
        ctx.fillStyle = hsl(pal.wallH, 10, 16);
        ctx.fillRect(ex, by - 3, hpSize, hpSize * 0.6);
        // H marking
        ctx.fillStyle = hsla(0, 0, 50, 0.3);
        ctx.fillRect(ex + 3, by - 1, 2, 5);
        ctx.fillRect(ex + hpSize - 5, by - 1, 2, 5);
        ctx.fillRect(ex + 3, by + 1, hpSize - 6, 2);
        break;
      }
      case 'sign': {
        // Rooftop sign
        const sw = 12 + Math.floor(rng() * 10);
        const sh = 6 + Math.floor(rng() * 4);
        // Post
        ctx.fillStyle = hsl(0, 0, 25);
        ctx.fillRect(ex + Math.floor(sw / 2) - 1, by - sh - 4, 2, 4);
        // Sign board
        ctx.fillStyle = hsla(pal.accentH, pal.accentS - 30, pal.accentL - 20, 0.6);
        ctx.fillRect(ex, by - sh - 4 - sh, sw, sh);
        // Neon glow
        ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.15);
        ctx.fillRect(ex - 1, by - sh - 5 - sh, sw + 2, sh + 2);
        break;
      }
      case 'solar': {
        // Solar panel grid
        const spW = 12 + Math.floor(rng() * 6);
        const spH = 3;
        ctx.fillStyle = hsl(220, 40, 15);
        ctx.fillRect(ex, by - spH - 2, spW, spH);
        // Panel grid lines
        ctx.fillStyle = hsl(220, 30, 22);
        for (let px = 0; px < spW; px += 4) {
          ctx.fillRect(ex + px, by - spH - 2, 1, spH);
        }
        break;
      }
    }
  }

  // Roof accent light at edge for higher tiers
  if (tierIdx >= 2) {
    ctx.fillStyle = hsla(pal.accentH, pal.accentS, pal.accentL, 0.2);
    ctx.fillRect(bx, by - 1, bw, 1);
  }
}
