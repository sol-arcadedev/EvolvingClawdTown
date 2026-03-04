/**
 * Programmatically generate pixel art whale sprites for the town's water.
 * Creates multiple frames/variants: surfacing, swimming, and submerging.
 *
 * Usage: npx tsx scripts/generate-whales.ts
 */
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const OUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/decorations');

// Sprite dimensions — wider than tall for a side-view whale
const W = 48;
const H = 32;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Draw a filled ellipse into RGBA data */
function fillEllipse(
  data: Uint8Array, w: number,
  cx: number, cy: number, rx: number, ry: number,
  r: number, g: number, b: number, a = 255,
) {
  const x0 = Math.max(0, Math.floor(cx - rx));
  const x1 = Math.min(w - 1, Math.ceil(cx + rx));
  const y0 = Math.max(0, Math.floor(cy - ry));
  const y1 = Math.min(Math.ceil(cy + ry), (data.length / 4 / w) - 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1.0) {
        const i = (y * w + x) * 4;
        // Alpha blend
        const srcA = a / 255;
        data[i] = clamp(Math.round(r * srcA + data[i] * (1 - srcA)), 0, 255);
        data[i + 1] = clamp(Math.round(g * srcA + data[i + 1] * (1 - srcA)), 0, 255);
        data[i + 2] = clamp(Math.round(b * srcA + data[i + 2] * (1 - srcA)), 0, 255);
        data[i + 3] = clamp(data[i + 3] + a, 0, 255);
      }
    }
  }
}

/** Draw a single pixel */
function setPixel(data: Uint8Array, w: number, x: number, y: number, r: number, g: number, b: number, a = 255) {
  x = Math.round(x);
  y = Math.round(y);
  if (x < 0 || x >= w || y < 0 || y >= (data.length / 4 / w)) return;
  const i = (y * w + x) * 4;
  data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
}

/** Draw a filled circle (simpler helper) */
function fillCircle(data: Uint8Array, w: number, cx: number, cy: number, radius: number, r: number, g: number, b: number, a = 255) {
  fillEllipse(data, w, cx, cy, radius, radius, r, g, b, a);
}

interface WhaleConfig {
  /** 0=facing right, 1=facing left */
  flip: boolean;
  /** Body color */
  bodyR: number; bodyG: number; bodyB: number;
  /** Belly color (lighter) */
  bellyR: number; bellyG: number; bellyB: number;
  /** Scale multiplier */
  scale: number;
}

function drawWhale(data: Uint8Array, config: WhaleConfig) {
  const { bodyR, bodyG, bodyB, bellyR, bellyG, bellyB, scale, flip } = config;
  const midX = W / 2;
  const midY = H / 2;

  // Whale body — elongated ellipse
  const bodyRX = 16 * scale;
  const bodyRY = 7 * scale;
  const bodyCX = midX + (flip ? 2 : -2);
  const bodyCY = midY;
  fillEllipse(data, W, bodyCX, bodyCY, bodyRX, bodyRY, bodyR, bodyG, bodyB);

  // Belly — lighter underside
  fillEllipse(data, W, bodyCX, bodyCY + bodyRY * 0.3, bodyRX * 0.85, bodyRY * 0.5, bellyR, bellyG, bellyB);

  // Head — rounder front
  const headDir = flip ? -1 : 1;
  const headCX = bodyCX + headDir * bodyRX * 0.7;
  const headRX = 8 * scale;
  const headRY = 6 * scale;
  fillEllipse(data, W, headCX, bodyCY - 1, headRX, headRY, bodyR, bodyG, bodyB);
  // Head belly
  fillEllipse(data, W, headCX, bodyCY + headRY * 0.2, headRX * 0.8, headRY * 0.45, bellyR, bellyG, bellyB);

  // Eye — small white dot with dark pupil
  const eyeX = headCX + headDir * headRX * 0.4;
  const eyeY = bodyCY - headRY * 0.25;
  fillCircle(data, W, eyeX, eyeY, 2 * scale, 255, 255, 255);
  fillCircle(data, W, eyeX + headDir * 0.5, eyeY, 1 * scale, 20, 20, 40);

  // Mouth line — small dark curve
  const mouthX = headCX + headDir * headRX * 0.6;
  const mouthY = bodyCY + 1;
  setPixel(data, W, mouthX, mouthY, bodyR * 0.5, bodyG * 0.5, bodyB * 0.5);
  setPixel(data, W, mouthX + headDir, mouthY + 1, bodyR * 0.5, bodyG * 0.5, bodyB * 0.5);

  // Tail — two triangular flukes at rear
  const tailDir = -headDir; // tail is opposite head
  const tailBaseX = bodyCX + tailDir * bodyRX * 0.9;
  const tailBaseY = bodyCY;

  // Upper fluke
  for (let i = 0; i < 7 * scale; i++) {
    const tx = tailBaseX + tailDir * i;
    const ty = tailBaseY - i * 0.8 - 1;
    fillCircle(data, W, tx, ty, (2 - i * 0.2) * scale, bodyR, bodyG, bodyB);
  }
  // Lower fluke
  for (let i = 0; i < 7 * scale; i++) {
    const tx = tailBaseX + tailDir * i;
    const ty = tailBaseY + i * 0.6 + 1;
    fillCircle(data, W, tx, ty, (2 - i * 0.2) * scale, bodyR, bodyG, bodyB);
  }

  // Dorsal fin — small bump on top
  const finX = bodyCX - headDir * bodyRX * 0.1;
  const finY = bodyCY - bodyRY * 0.8;
  for (let i = 0; i < 4 * scale; i++) {
    setPixel(data, W, finX + i * 0.5, finY - i, bodyR * 0.85, bodyG * 0.85, bodyB * 0.85);
    setPixel(data, W, finX + i * 0.5 - 1, finY - i, bodyR * 0.9, bodyG * 0.9, bodyB * 0.9);
  }

  // Water spray — small dots above head (for surfacing variant)
  const sprayX = headCX + headDir * headRX * 0.2;
  const sprayY = bodyCY - headRY - 3;
  fillCircle(data, W, sprayX, sprayY, 1.2, 180, 220, 255, 180);
  fillCircle(data, W, sprayX - 2, sprayY - 2, 0.8, 200, 230, 255, 140);
  fillCircle(data, W, sprayX + 1, sprayY - 3, 1.0, 190, 225, 255, 160);
}

function drawTailOnly(data: Uint8Array, config: WhaleConfig) {
  // Just the tail flukes sticking out of water — for submerging
  const { bodyR, bodyG, bodyB, scale, flip } = config;
  const midX = W / 2;
  const midY = H / 2 + 4;
  const tailDir = flip ? 1 : -1;
  const tailBaseX = midX;
  const tailBaseY = midY;

  // Upper fluke
  for (let i = 0; i < 8 * scale; i++) {
    const tx = tailBaseX + tailDir * i * 0.5;
    const ty = tailBaseY - i * 1.0;
    fillCircle(data, W, tx, ty, (2.5 - i * 0.2) * scale, bodyR, bodyG, bodyB);
  }
  // Lower fluke (reversed angle, making V-shape)
  for (let i = 0; i < 8 * scale; i++) {
    const tx = tailBaseX - tailDir * i * 0.5;
    const ty = tailBaseY - i * 1.0;
    fillCircle(data, W, tx, ty, (2.5 - i * 0.2) * scale, bodyR, bodyG, bodyB);
  }

  // Water splash circles around base
  fillEllipse(data, W, midX, midY + 2, 8, 3, 180, 220, 255, 120);
  fillEllipse(data, W, midX - 4, midY + 1, 3, 1.5, 200, 235, 255, 100);
  fillEllipse(data, W, midX + 5, midY + 1, 3, 1.5, 200, 235, 255, 100);
}

function drawDorsalBreaching(data: Uint8Array, config: WhaleConfig) {
  // Just the dorsal fin and back arch visible — surfacing
  const { bodyR, bodyG, bodyB, bellyR, bellyG, bellyB, scale, flip } = config;
  const midX = W / 2;
  const midY = H / 2 + 3;
  const headDir = flip ? -1 : 1;

  // Partial body arc (top half only)
  fillEllipse(data, W, midX, midY + 4, 14 * scale, 5 * scale, bodyR, bodyG, bodyB);

  // Clip bottom half with water color
  for (let y = Math.round(midY + 3); y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (data[i + 3] > 0) {
        data[i] = 70; data[i + 1] = 150; data[i + 2] = 210; data[i + 3] = 140;
      }
    }
  }

  // Dorsal fin
  const finX = midX + headDir * 2;
  const finY = midY - 1;
  for (let i = 0; i < 5 * scale; i++) {
    const fx = finX - headDir * i * 0.3;
    const fy = finY - i;
    fillCircle(data, W, fx, fy, (2.0 - i * 0.25) * scale, bodyR * 0.85, bodyG * 0.85, bodyB * 0.85);
  }

  // Water line ripples
  fillEllipse(data, W, midX - 6, midY + 3, 5, 1.5, 180, 220, 255, 100);
  fillEllipse(data, W, midX + 6, midY + 3, 5, 1.5, 180, 220, 255, 100);
}

const WHALE_VARIANTS: Array<{
  name: string;
  drawer: (data: Uint8Array, config: WhaleConfig) => void;
  config: WhaleConfig;
}> = [
  // Full whale swimming right (blue)
  {
    name: 'whale-swim-1',
    drawer: drawWhale,
    config: { flip: false, bodyR: 55, bodyG: 100, bodyB: 160, bellyR: 160, bellyG: 200, bellyB: 230, scale: 1.0 },
  },
  // Full whale swimming left (blue)
  {
    name: 'whale-swim-2',
    drawer: drawWhale,
    config: { flip: true, bodyR: 55, bodyG: 100, bodyB: 160, bellyR: 160, bellyG: 200, bellyB: 230, scale: 1.0 },
  },
  // Tail sticking up (submerging)
  {
    name: 'whale-tail-1',
    drawer: drawTailOnly,
    config: { flip: false, bodyR: 50, bodyG: 95, bodyB: 150, bellyR: 150, bellyG: 190, bellyB: 220, scale: 1.0 },
  },
  // Dorsal fin breaching (surfacing)
  {
    name: 'whale-breach-1',
    drawer: drawDorsalBreaching,
    config: { flip: false, bodyR: 60, bodyG: 105, bodyB: 165, bellyR: 165, bellyG: 205, bellyB: 235, scale: 1.0 },
  },
  // Smaller whale (calf) swimming right
  {
    name: 'whale-swim-3',
    drawer: drawWhale,
    config: { flip: false, bodyR: 70, bodyG: 120, bodyB: 180, bellyR: 180, bellyG: 215, bellyB: 240, scale: 0.75 },
  },
  // Smaller whale (calf) swimming left
  {
    name: 'whale-swim-4',
    drawer: drawWhale,
    config: { flip: true, bodyR: 70, bodyG: 120, bodyB: 180, bellyR: 180, bellyG: 215, bellyB: 240, scale: 0.75 },
  },
];

async function generateWhaleSprite(variant: typeof WHALE_VARIANTS[0]) {
  const data = new Uint8Array(W * H * 4); // starts fully transparent

  variant.drawer(data, variant.config);

  const outPath = path.join(OUT_DIR, `${variant.name}.png`);
  await sharp(data, { raw: { width: W, height: H, channels: 4 } })
    .png()
    .toFile(outPath);

  const stat = fs.statSync(outPath);
  console.log(`  ✓ ${variant.name}.png (${(stat.size / 1024).toFixed(1)}KB)`);
}

async function main() {
  console.log('Generating whale sprites...');
  console.log(`Output: ${OUT_DIR}\n`);

  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const variant of WHALE_VARIANTS) {
    await generateWhaleSprite(variant);
  }

  console.log(`\nDone! ${WHALE_VARIANTS.length} whale sprites generated.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
