/**
 * Programmatically generate vibrant pixel art isometric tile textures.
 * No SD needed — pure code-generated tiles with warm village aesthetic.
 *
 * Usage: npx tsx scripts/generate-tiles-programmatic.ts
 */
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const OUT_W = 128;
const OUT_H = 64;
const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/tiles');

// Deterministic RNG
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function createDiamondMask(w: number, h: number): Uint8Array {
  const mask = new Uint8Array(w * h);
  const hw = w / 2;
  const hh = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = Math.abs(x - hw + 0.5) / hw;
      const dy = Math.abs(y - hh + 0.5) / hh;
      mask[y * w + x] = (dx + dy <= 1.0) ? 255 : 0;
    }
  }
  return mask;
}

interface RGB { r: number; g: number; b: number }

function lerp(a: number, b: number, t: number): number { return a + (b - a) * t; }
function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

function lerpColor(a: RGB, b: RGB, t: number): RGB {
  return { r: lerp(a.r, b.r, t), g: lerp(a.g, b.g, t), b: lerp(a.b, b.b, t) };
}

type TileGenerator = (x: number, y: number, rng: () => number) => RGB;

// ── TILE GENERATORS ──

const grassTile: TileGenerator = (x, y, rng) => {
  // Multiple shades of vibrant green with pixel noise
  const baseColors: RGB[] = [
    { r: 90, g: 180, b: 60 },   // bright green
    { r: 75, g: 160, b: 50 },   // medium green
    { r: 100, g: 195, b: 70 },  // light green
    { r: 65, g: 145, b: 45 },   // darker green
  ];
  const noise = rng();
  const idx = Math.floor(noise * baseColors.length);
  const base = baseColors[idx];
  // Add subtle per-pixel variation
  const vary = (rng() - 0.5) * 20;
  return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary * 0.5, 0, 255) };
};

const waterTile: TileGenerator = (x, y, rng) => {
  // Blue-turquoise water with wave pattern
  const wave = Math.sin(x * 0.15 + y * 0.1) * 0.5 + 0.5;
  const wave2 = Math.sin(x * 0.08 - y * 0.12 + 2) * 0.5 + 0.5;
  const combined = wave * 0.6 + wave2 * 0.4;
  const deep: RGB = { r: 40, g: 120, b: 190 };
  const light: RGB = { r: 80, g: 185, b: 220 };
  const highlight: RGB = { r: 140, g: 210, b: 240 };
  let c = lerpColor(deep, light, combined);
  // Occasional white-ish highlights
  if (rng() > 0.92) c = lerpColor(c, highlight, 0.5);
  const vary = (rng() - 0.5) * 8;
  return { r: clamp(c.r + vary, 0, 255), g: clamp(c.g + vary, 0, 255), b: clamp(c.b + vary, 0, 255) };
};

const hillTile: TileGenerator = (x, y, rng) => {
  // Sandy brown earth with pebble variations
  const baseColors: RGB[] = [
    { r: 195, g: 165, b: 110 },  // sandy tan
    { r: 180, g: 150, b: 95 },   // medium brown
    { r: 210, g: 180, b: 125 },  // light sand
    { r: 165, g: 135, b: 85 },   // darker earth
  ];
  const noise = rng();
  const idx = Math.floor(noise * baseColors.length);
  const base = baseColors[idx];
  // Small pebbles
  const pebble = rng() > 0.9 ? 25 : 0;
  const vary = (rng() - 0.5) * 15;
  return {
    r: clamp(base.r + vary - pebble, 0, 255),
    g: clamp(base.g + vary - pebble, 0, 255),
    b: clamp(base.b + vary * 0.5 - pebble, 0, 255),
  };
};

const forestTile: TileGenerator = (x, y, rng) => {
  // Rich dark greens with leaf/moss texture
  const baseColors: RGB[] = [
    { r: 45, g: 120, b: 40 },   // dark green
    { r: 55, g: 135, b: 45 },   // medium forest
    { r: 35, g: 100, b: 35 },   // deep green
    { r: 65, g: 140, b: 50 },   // lighter patch
    { r: 50, g: 110, b: 30 },   // olive-ish
  ];
  const noise = rng();
  const idx = Math.floor(noise * baseColors.length);
  const base = baseColors[idx];
  // Occasional leaf spots
  const leafSpot = rng() > 0.88;
  const vary = (rng() - 0.5) * 18;
  return {
    r: clamp(base.r + vary + (leafSpot ? 20 : 0), 0, 255),
    g: clamp(base.g + vary + (leafSpot ? 10 : 0), 0, 255),
    b: clamp(base.b + vary * 0.3, 0, 255),
  };
};

const roadMainTile: TileGenerator = (x, y, rng) => {
  // Warm red-brown cobblestone with brick pattern
  const brickW = 8, brickH = 4;
  const row = Math.floor(y / brickH);
  const offsetX = (row % 2) * (brickW / 2);
  const bx = (x + offsetX) % brickW;
  const by = y % brickH;
  const isGrout = bx === 0 || by === 0;

  if (isGrout) {
    const vary = (rng() - 0.5) * 10;
    return { r: clamp(120 + vary, 0, 255), g: clamp(90 + vary, 0, 255), b: clamp(65 + vary, 0, 255) };
  }

  const brickColors: RGB[] = [
    { r: 185, g: 110, b: 75 },  // warm brick
    { r: 175, g: 100, b: 65 },  // darker brick
    { r: 195, g: 120, b: 80 },  // lighter brick
    { r: 165, g: 95, b: 60 },   // deep brick
  ];
  const noise = rng();
  const idx = Math.floor(noise * brickColors.length);
  const base = brickColors[idx];
  const vary = (rng() - 0.5) * 12;
  return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary, 0, 255) };
};

const roadSecondaryTile: TileGenerator = (x, y, rng) => {
  // Terracotta/orange-brown paving
  const stoneW = 6, stoneH = 6;
  const sx = x % stoneW;
  const sy = y % stoneH;
  const isGrout = sx === 0 || sy === 0;

  if (isGrout) {
    const vary = (rng() - 0.5) * 8;
    return { r: clamp(130 + vary, 0, 255), g: clamp(100 + vary, 0, 255), b: clamp(70 + vary, 0, 255) };
  }

  const baseColors: RGB[] = [
    { r: 200, g: 140, b: 80 },  // terracotta
    { r: 190, g: 130, b: 75 },
    { r: 210, g: 150, b: 90 },
    { r: 180, g: 125, b: 70 },
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  const vary = (rng() - 0.5) * 10;
  return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary, 0, 255) };
};

const roadLocalTile: TileGenerator = (x, y, rng) => {
  // Packed dirt trail
  const baseColors: RGB[] = [
    { r: 180, g: 155, b: 115 },
    { r: 170, g: 145, b: 105 },
    { r: 190, g: 165, b: 125 },
    { r: 160, g: 135, b: 100 },
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  // Small gravel spots
  const gravel = rng() > 0.85 ? -20 : 0;
  const vary = (rng() - 0.5) * 15;
  return {
    r: clamp(base.r + vary + gravel, 0, 255),
    g: clamp(base.g + vary + gravel, 0, 255),
    b: clamp(base.b + vary * 0.6 + gravel, 0, 255),
  };
};

const parkTile: TileGenerator = (x, y, rng) => {
  // Bright green grass with colorful flower dots
  const base = grassTile(x, y, rng);
  // Brighter than regular grass
  base.r = clamp(base.r + 10, 0, 255);
  base.g = clamp(base.g + 15, 0, 255);

  // Random flowers
  if (rng() > 0.92) {
    const flowerColors: RGB[] = [
      { r: 240, g: 60, b: 60 },   // red
      { r: 255, g: 220, b: 40 },  // yellow
      { r: 220, g: 80, b: 180 },  // pink
      { r: 255, g: 160, b: 40 },  // orange
      { r: 180, g: 80, b: 220 },  // purple
      { r: 255, g: 255, b: 255 }, // white
    ];
    return flowerColors[Math.floor(rng() * flowerColors.length)];
  }
  return base;
};

const plotTile: TileGenerator = (x, y, rng) => {
  // Tilled brown soil with furrow rows
  const rowH = 4;
  const inFurrow = (y % rowH) < 2;
  const dark: RGB = { r: 120, g: 85, b: 55 };
  const light: RGB = { r: 155, g: 115, b: 75 };
  const base = inFurrow ? dark : light;
  const vary = (rng() - 0.5) * 12;
  return {
    r: clamp(base.r + vary, 0, 255),
    g: clamp(base.g + vary, 0, 255),
    b: clamp(base.b + vary * 0.5, 0, 255),
  };
};

// ── NEW VARIANT TILES ──

const grass2Tile: TileGenerator = (x, y, rng) => {
  // Distinctly yellow-lime grass — warm, sun-kissed patches
  const baseColors: RGB[] = [
    { r: 155, g: 195, b: 45 },  // bright lime-yellow
    { r: 145, g: 185, b: 40 },  // warm lime
    { r: 165, g: 205, b: 50 },  // vivid yellow-green
    { r: 135, g: 175, b: 35 },  // olive-lime
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  const vary = (rng() - 0.5) * 18;
  return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary * 0.4, 0, 255) };
};

const grass3Tile: TileGenerator = (x, y, rng) => {
  // Deep emerald grass — rich, lush, much darker than base
  const baseColors: RGB[] = [
    { r: 35, g: 140, b: 45 },   // deep emerald
    { r: 30, g: 130, b: 40 },   // dark emerald
    { r: 45, g: 150, b: 50 },   // medium emerald
    { r: 25, g: 120, b: 35 },   // very deep green
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  const vary = (rng() - 0.5) * 16;
  return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary * 0.4, 0, 255) };
};

const grassDarkTile: TileGenerator = (x, y, rng) => {
  // Very dark shaded grass with brown dirt spots — under tree shadows
  const baseColors: RGB[] = [
    { r: 40, g: 100, b: 35 },
    { r: 35, g: 90, b: 30 },
    { r: 50, g: 110, b: 40 },
    { r: 30, g: 85, b: 28 },
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  const vary = (rng() - 0.5) * 14;
  // Frequent brown dirt spots
  const hasDirt = rng() > 0.82;
  if (hasDirt) {
    const dirtVary = (rng() - 0.5) * 10;
    return {
      r: clamp(110 + dirtVary, 0, 255),
      g: clamp(80 + dirtVary, 0, 255),
      b: clamp(50 + dirtVary * 0.5, 0, 255),
    };
  }
  return {
    r: clamp(base.r + vary, 0, 255),
    g: clamp(base.g + vary, 0, 255),
    b: clamp(base.b + vary * 0.3, 0, 255),
  };
};

const forest2Tile: TileGenerator = (x, y, rng) => {
  // Lighter forest — mixed green canopy from above with bright spots
  const baseColors: RGB[] = [
    { r: 60, g: 145, b: 45 },
    { r: 70, g: 155, b: 50 },
    { r: 50, g: 130, b: 40 },
    { r: 80, g: 160, b: 55 },
    { r: 55, g: 135, b: 42 },
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  // Bright sun spots through canopy
  const sunSpot = rng() > 0.9;
  const vary = (rng() - 0.5) * 20;
  return {
    r: clamp(base.r + vary + (sunSpot ? 30 : 0), 0, 255),
    g: clamp(base.g + vary + (sunSpot ? 25 : 0), 0, 255),
    b: clamp(base.b + vary * 0.3, 0, 255),
  };
};

const sandTile: TileGenerator = (x, y, rng) => {
  // Warm sandy beach
  const baseColors: RGB[] = [
    { r: 225, g: 205, b: 155 },  // warm sand
    { r: 215, g: 195, b: 145 },  // medium sand
    { r: 235, g: 215, b: 165 },  // light sand
    { r: 205, g: 185, b: 135 },  // wet sand
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  // Small shell/pebble spots
  const pebble = rng() > 0.94;
  const vary = (rng() - 0.5) * 12;
  return {
    r: clamp(base.r + vary + (pebble ? -20 : 0), 0, 255),
    g: clamp(base.g + vary + (pebble ? -15 : 0), 0, 255),
    b: clamp(base.b + vary * 0.5 + (pebble ? -10 : 0), 0, 255),
  };
};

const gardenTile: TileGenerator = (x, y, rng) => {
  // Crop rows: alternating green crops and brown soil
  const rowH = 5;
  const row = y % rowH;
  const isCrop = row >= 1 && row <= 3;

  if (isCrop) {
    // Green crop tops — varied greens
    const cropColors: RGB[] = [
      { r: 70, g: 170, b: 50 },
      { r: 85, g: 185, b: 55 },
      { r: 60, g: 155, b: 45 },
      { r: 95, g: 190, b: 60 },
    ];
    const idx = Math.floor(rng() * cropColors.length);
    const base = cropColors[idx];
    const vary = (rng() - 0.5) * 15;
    return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary * 0.3, 0, 255) };
  } else {
    // Brown soil between rows
    const vary = (rng() - 0.5) * 10;
    return { r: clamp(135 + vary, 0, 255), g: clamp(100 + vary, 0, 255), b: clamp(65 + vary, 0, 255) };
  }
};

// ── DIVERSE GROUND TILES ──

const fieldTile: TileGenerator = (x, y, rng) => {
  // Brown soil with green crop rows — farmland patches
  const rowH = 6;
  const row = y % rowH;
  const isCropRow = row >= 2 && row <= 4;

  if (isCropRow) {
    // Short green crop tops
    const cropColors: RGB[] = [
      { r: 80, g: 155, b: 45 },
      { r: 90, g: 165, b: 50 },
      { r: 70, g: 145, b: 40 },
    ];
    const idx = Math.floor(rng() * cropColors.length);
    const base = cropColors[idx];
    const vary = (rng() - 0.5) * 12;
    return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary * 0.3, 0, 255) };
  } else {
    // Brown tilled soil
    const vary = (rng() - 0.5) * 12;
    return { r: clamp(145 + vary, 0, 255), g: clamp(105 + vary, 0, 255), b: clamp(65 + vary, 0, 255) };
  }
};

const dirtTile: TileGenerator = (x, y, rng) => {
  // Plain brown earth/path — barren patches
  const baseColors: RGB[] = [
    { r: 155, g: 125, b: 85 },  // warm brown
    { r: 145, g: 115, b: 75 },  // medium brown
    { r: 165, g: 135, b: 95 },  // light brown
    { r: 135, g: 105, b: 70 },  // darker earth
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  // Occasional small pebble
  const pebble = rng() > 0.92 ? -18 : 0;
  // Occasional tiny grass tuft
  const grassTuft = rng() > 0.95;
  if (grassTuft) {
    return { r: clamp(75 + (rng() - 0.5) * 15, 0, 255), g: clamp(140 + (rng() - 0.5) * 15, 0, 255), b: clamp(50 + (rng() - 0.5) * 10, 0, 255) };
  }
  const vary = (rng() - 0.5) * 14;
  return {
    r: clamp(base.r + vary + pebble, 0, 255),
    g: clamp(base.g + vary + pebble, 0, 255),
    b: clamp(base.b + vary * 0.5 + pebble, 0, 255),
  };
};

const grassFlowersTile: TileGenerator = (x, y, rng) => {
  // Green grass with scattered wildflower pixels
  const base = grassTile(x, y, rng);
  // ~12% chance of a wildflower pixel
  if (rng() > 0.88) {
    const flowerColors: RGB[] = [
      { r: 235, g: 55, b: 55 },   // red
      { r: 250, g: 220, b: 35 },  // yellow
      { r: 255, g: 255, b: 240 }, // white
      { r: 220, g: 75, b: 170 },  // pink
      { r: 250, g: 150, b: 35 },  // orange
    ];
    return flowerColors[Math.floor(rng() * flowerColors.length)];
  }
  return base;
};

const grassYellowTile: TileGenerator = (x, y, rng) => {
  // Warm yellow-green sun-bleached meadow — distinctly different from grass
  const baseColors: RGB[] = [
    { r: 175, g: 190, b: 55 },  // yellow-green
    { r: 185, g: 200, b: 60 },  // bright straw-green
    { r: 165, g: 180, b: 50 },  // warm meadow
    { r: 195, g: 195, b: 65 },  // sun-bleached
  ];
  const idx = Math.floor(rng() * baseColors.length);
  const base = baseColors[idx];
  const vary = (rng() - 0.5) * 16;
  // Occasional brown dry spot
  const dry = rng() > 0.9;
  if (dry) {
    return { r: clamp(180 + vary, 0, 255), g: clamp(160 + vary, 0, 255), b: clamp(90 + vary * 0.5, 0, 255) };
  }
  return { r: clamp(base.r + vary, 0, 255), g: clamp(base.g + vary, 0, 255), b: clamp(base.b + vary * 0.4, 0, 255) };
};

// ── TILE MAP ──
const GENERATORS: Record<string, TileGenerator> = {
  'grass': grassTile,
  'grass-2': grass2Tile,
  'grass-3': grass3Tile,
  'grass-dark': grassDarkTile,
  'water': waterTile,
  'hill': hillTile,
  'forest': forestTile,
  'forest-2': forest2Tile,
  'road-main': roadMainTile,
  'road-secondary': roadSecondaryTile,
  'road-local': roadLocalTile,
  'park': parkTile,
  'plot': plotTile,
  'sand': sandTile,
  'garden': gardenTile,
  'field': fieldTile,
  'dirt': dirtTile,
  'grass-flowers': grassFlowersTile,
  'grass-yellow': grassYellowTile,
};

async function generateTile(key: string, gen: TileGenerator): Promise<void> {
  const rng = mulberry32(key.split('').reduce((a, c) => a + c.charCodeAt(0), 0) * 12345);
  const mask = createDiamondMask(OUT_W, OUT_H);
  const data = Buffer.alloc(OUT_W * OUT_H * 4);

  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const i = y * OUT_W + x;
      const color = gen(x, y, rng);
      data[i * 4] = Math.round(color.r);
      data[i * 4 + 1] = Math.round(color.g);
      data[i * 4 + 2] = Math.round(color.b);
      data[i * 4 + 3] = mask[i];
    }
  }

  // Add subtle edge shading for depth
  for (let y = 0; y < OUT_H; y++) {
    for (let x = 0; x < OUT_W; x++) {
      const i = y * OUT_W + x;
      if (mask[i] === 0) continue;

      const hw = OUT_W / 2;
      const hh = OUT_H / 2;
      const nx = (x - hw) / hw; // -1..1
      const ny = (y - hh) / hh; // -1..1

      // Light from top-left: darken bottom-right edges
      const shade = (-nx * 0.15 + -ny * 0.2) * 0.5;

      // Top edge highlight
      const edgeDist = 1 - (Math.abs(nx) + Math.abs(ny)); // 0 at edge, 1 at center
      const edgeHighlight = edgeDist < 0.08 ? (ny < 0 ? 0.15 : -0.12) : 0;

      const factor = 1 + shade + edgeHighlight;
      data[i * 4] = clamp(Math.round(data[i * 4] * factor), 0, 255);
      data[i * 4 + 1] = clamp(Math.round(data[i * 4 + 1] * factor), 0, 255);
      data[i * 4 + 2] = clamp(Math.round(data[i * 4 + 2] * factor), 0, 255);
    }
  }

  const outPath = path.join(OUTPUT_DIR, `${key}.png`);
  await sharp(data, { raw: { width: OUT_W, height: OUT_H, channels: 4 } })
    .png()
    .toFile(outPath);

  const stat = fs.statSync(outPath);
  console.log(`  ✓ ${key}.png (${(stat.size / 1024).toFixed(1)}KB)`);
}

async function main() {
  console.log('Generating programmatic tile textures...');
  console.log(`Output: ${OUTPUT_DIR}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [key, gen] of Object.entries(GENERATORS)) {
    console.log(`Generating "${key}"...`);
    await generateTile(key, gen);
  }

  console.log(`\nDone! ${Object.keys(GENERATORS).length} tiles generated.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
