/**
 * Programmatically generate vibrant pixel art decoration sprites.
 * Trees, bushes, rocks, etc. with warm village aesthetic.
 *
 * Usage: npx tsx scripts/generate-decorations-programmatic.ts
 */
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SIZE = 64;
const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/decorations');

function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number { return Math.max(lo, Math.min(hi, v)); }

interface RGBA { r: number; g: number; b: number; a: number }

function dist(x1: number, y1: number, x2: number, y2: number): number {
  return Math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2);
}

type SpriteGenerator = (data: Buffer, rng: () => number) => void;

function setPixel(data: Buffer, x: number, y: number, c: RGBA): void {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  const i = (y * SIZE + x) * 4;
  // Alpha blend
  const srcA = c.a / 255;
  const dstA = data[i + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA === 0) return;
  data[i] = Math.round((c.r * srcA + data[i] * dstA * (1 - srcA)) / outA);
  data[i + 1] = Math.round((c.g * srcA + data[i + 1] * dstA * (1 - srcA)) / outA);
  data[i + 2] = Math.round((c.b * srcA + data[i + 2] * dstA * (1 - srcA)) / outA);
  data[i + 3] = Math.round(outA * 255);
}

function fillCircle(data: Buffer, cx: number, cy: number, r: number, c: RGBA): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (dist(x, y, cx, cy) <= r) setPixel(data, x, y, c);
    }
  }
}

function fillEllipse(data: Buffer, cx: number, cy: number, rx: number, ry: number, c: RGBA): void {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      if (dx * dx + dy * dy <= 1) setPixel(data, x, y, c);
    }
  }
}

function fillRect(data: Buffer, x: number, y: number, w: number, h: number, c: RGBA): void {
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      setPixel(data, Math.round(px), Math.round(py), c);
    }
  }
}

// ── TREE GENERATORS ──

const roundTree: SpriteGenerator = (data, rng) => {
  const cx = 32, trunkBottom = 56, trunkTop = 38;
  const trunkW = 4;

  // Shadow ellipse on ground
  fillEllipse(data, cx, 57, 10, 3, { r: 0, g: 0, b: 0, a: 40 });

  // Trunk
  for (let y = trunkTop; y <= trunkBottom; y++) {
    for (let x = cx - trunkW / 2; x < cx + trunkW / 2; x++) {
      const shade = (x < cx) ? 0.85 : 1.1;
      setPixel(data, Math.round(x), y, {
        r: clamp(Math.round(100 * shade), 0, 255),
        g: clamp(Math.round(65 * shade), 0, 255),
        b: clamp(Math.round(35 * shade), 0, 255), a: 255
      });
    }
  }

  // Canopy — multiple layered circles for depth
  const canopyCY = 28;
  const layers = [
    { ox: 0, oy: 4, r: 14, shade: 0.7 },   // bottom dark
    { ox: -3, oy: 2, r: 11, shade: 0.8 },   // left
    { ox: 3, oy: 2, r: 11, shade: 0.85 },    // right
    { ox: 0, oy: 0, r: 13, shade: 0.9 },     // center
    { ox: -2, oy: -3, r: 10, shade: 1.0 },   // top-left highlight
    { ox: 2, oy: -4, r: 8, shade: 1.15 },    // top-right bright
  ];

  for (const l of layers) {
    const baseG = 140 + rng() * 30;
    for (let y = canopyCY + l.oy - l.r; y <= canopyCY + l.oy + l.r; y++) {
      for (let x = cx + l.ox - l.r; x <= cx + l.ox + l.r; x++) {
        if (dist(x, y, cx + l.ox, canopyCY + l.oy) <= l.r) {
          const noise = (rng() - 0.5) * 25;
          setPixel(data, Math.round(x), Math.round(y), {
            r: clamp(Math.round((45 + noise) * l.shade), 0, 255),
            g: clamp(Math.round((baseG + noise) * l.shade), 0, 255),
            b: clamp(Math.round((35 + noise * 0.5) * l.shade), 0, 255),
            a: 255
          });
        }
      }
    }
  }

  // Highlight dots on top
  for (let i = 0; i < 8; i++) {
    const hx = cx + (rng() - 0.5) * 16;
    const hy = canopyCY - 5 + rng() * 10;
    setPixel(data, Math.round(hx), Math.round(hy), {
      r: 120 + Math.round(rng() * 40), g: 200 + Math.round(rng() * 40),
      b: 80 + Math.round(rng() * 30), a: 200
    });
  }
};

const oakTree: SpriteGenerator = (data, rng) => {
  const cx = 32, trunkBottom = 56, trunkTop = 35;

  // Shadow
  fillEllipse(data, cx, 58, 12, 3, { r: 0, g: 0, b: 0, a: 35 });

  // Thick trunk with branches
  for (let y = trunkTop; y <= trunkBottom; y++) {
    const w = y > 48 ? 3 : 2.5;
    for (let x = cx - w; x <= cx + w; x++) {
      const shade = 0.8 + (cx - Math.abs(x - cx)) * 0.05;
      setPixel(data, Math.round(x), y, {
        r: clamp(Math.round(90 * shade), 0, 255),
        g: clamp(Math.round(60 * shade), 0, 255),
        b: clamp(Math.round(30 * shade), 0, 255), a: 255
      });
    }
  }

  // Wide spreading canopy
  const canopyCY = 24;
  const blobs = [
    { ox: 0, oy: 6, r: 16, shade: 0.65 },
    { ox: -8, oy: 2, r: 10, shade: 0.75 },
    { ox: 8, oy: 2, r: 10, shade: 0.8 },
    { ox: -4, oy: -2, r: 12, shade: 0.85 },
    { ox: 4, oy: -2, r: 12, shade: 0.9 },
    { ox: 0, oy: -5, r: 11, shade: 1.0 },
    { ox: -3, oy: -7, r: 8, shade: 1.1 },
    { ox: 5, oy: -6, r: 7, shade: 1.15 },
  ];

  for (const b of blobs) {
    const baseR = 35 + rng() * 15;
    const baseG = 110 + rng() * 40;
    for (let y = canopyCY + b.oy - b.r; y <= canopyCY + b.oy + b.r; y++) {
      for (let x = cx + b.ox - b.r; x <= cx + b.ox + b.r; x++) {
        if (dist(x, y, cx + b.ox, canopyCY + b.oy) <= b.r) {
          const noise = (rng() - 0.5) * 20;
          setPixel(data, Math.round(x), Math.round(y), {
            r: clamp(Math.round((baseR + noise) * b.shade), 0, 255),
            g: clamp(Math.round((baseG + noise) * b.shade), 0, 255),
            b: clamp(Math.round((30 + noise * 0.3) * b.shade), 0, 255),
            a: 255
          });
        }
      }
    }
  }
};

const fruitTree: SpriteGenerator = (data, rng) => {
  // Start with a round tree base
  roundTree(data, rng);

  // Add colorful fruit dots
  const fruits = [
    { r: 230, g: 50, b: 40 },   // red apple
    { r: 240, g: 180, b: 30 },  // yellow
    { r: 220, g: 80, b: 50 },   // orange
  ];
  for (let i = 0; i < 6; i++) {
    const fx = 32 + (rng() - 0.5) * 20;
    const fy = 20 + rng() * 16;
    const fruit = fruits[Math.floor(rng() * fruits.length)];
    fillCircle(data, fx, fy, 1.5, { ...fruit, a: 255 });
  }
};

const pineTree: SpriteGenerator = (data, rng) => {
  const cx = 32, bottom = 58, top = 8;

  // Shadow
  fillEllipse(data, cx, 59, 8, 2.5, { r: 0, g: 0, b: 0, a: 35 });

  // Trunk
  fillRect(data, cx - 1.5, 48, 3, 10, { r: 95, g: 60, b: 30, a: 255 });

  // Layered triangular foliage tiers
  const tiers = [
    { y: 48, w: 14, h: 12 },
    { y: 38, w: 12, h: 12 },
    { y: 28, w: 10, h: 12 },
    { y: 20, w: 7, h: 10 },
    { y: 14, w: 4, h: 8 },
  ];

  for (const tier of tiers) {
    for (let y = tier.y; y > tier.y - tier.h; y--) {
      const progress = (tier.y - y) / tier.h;
      const halfW = (tier.w / 2) * (1 - progress);
      for (let x = cx - halfW; x <= cx + halfW; x++) {
        const shade = 0.7 + progress * 0.3 + ((x < cx) ? -0.05 : 0.05);
        const noise = (rng() - 0.5) * 20;
        setPixel(data, Math.round(x), y, {
          r: clamp(Math.round((30 + noise) * shade), 0, 255),
          g: clamp(Math.round((120 + noise + rng() * 20) * shade), 0, 255),
          b: clamp(Math.round((25 + noise * 0.3) * shade), 0, 255),
          a: 255
        });
      }
    }
    // Snow/highlight on tier edges
    for (let x = cx - tier.w / 2 + 1; x <= cx + tier.w / 2 - 1; x++) {
      if (rng() > 0.6) {
        setPixel(data, Math.round(x), tier.y, {
          r: 50, g: 150 + Math.round(rng() * 30), b: 40, a: 200
        });
      }
    }
  }

  // Top point
  setPixel(data, cx, top, { r: 60, g: 160, b: 50, a: 255 });
  setPixel(data, cx, top + 1, { r: 45, g: 140, b: 40, a: 255 });
};

const spruce: SpriteGenerator = (data, rng) => {
  const cx = 32, bottom = 58;

  // Shadow
  fillEllipse(data, cx, 59, 7, 2, { r: 0, g: 0, b: 0, a: 30 });

  // Trunk
  fillRect(data, cx - 1, 50, 2, 8, { r: 85, g: 55, b: 28, a: 255 });

  // Single continuous triangle, denser than pine
  for (let y = 50; y > 10; y--) {
    const progress = (50 - y) / 40;
    const halfW = 12 * (1 - progress * 0.85);
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      const edgeDist = 1 - Math.abs(x - cx) / halfW;
      const shade = 0.6 + progress * 0.35 + edgeDist * 0.1;
      const noise = (rng() - 0.5) * 15;
      const darkGreen = rng() > 0.7;
      setPixel(data, Math.round(x), y, {
        r: clamp(Math.round((darkGreen ? 20 : 35 + noise) * shade), 0, 255),
        g: clamp(Math.round((darkGreen ? 90 : 130 + noise) * shade), 0, 255),
        b: clamp(Math.round((darkGreen ? 15 : 30 + noise * 0.3) * shade), 0, 255),
        a: 255
      });
    }
  }
};

const bushGenerator: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 50;

  // Shadow
  fillEllipse(data, cx, 56, 9, 2.5, { r: 0, g: 0, b: 0, a: 30 });

  // Multiple overlapping round shapes
  const blobs = [
    { ox: 0, oy: 0, rx: 10, ry: 7, shade: 0.75 },
    { ox: -4, oy: -2, rx: 7, ry: 5, shade: 0.85 },
    { ox: 4, oy: -2, rx: 7, ry: 5, shade: 0.9 },
    { ox: 0, oy: -4, rx: 8, ry: 5, shade: 1.0 },
    { ox: -2, oy: -5, rx: 5, ry: 4, shade: 1.1 },
    { ox: 3, oy: -5, rx: 5, ry: 3, shade: 1.15 },
  ];

  for (const b of blobs) {
    for (let y = cy + b.oy - b.ry; y <= cy + b.oy + b.ry; y++) {
      for (let x = cx + b.ox - b.rx; x <= cx + b.ox + b.rx; x++) {
        const dx = (x - (cx + b.ox)) / b.rx;
        const dy = (y - (cy + b.oy)) / b.ry;
        if (dx * dx + dy * dy <= 1) {
          const noise = (rng() - 0.5) * 22;
          setPixel(data, Math.round(x), Math.round(y), {
            r: clamp(Math.round((50 + noise) * b.shade), 0, 255),
            g: clamp(Math.round((145 + noise + rng() * 15) * b.shade), 0, 255),
            b: clamp(Math.round((40 + noise * 0.4) * b.shade), 0, 255),
            a: 255
          });
        }
      }
    }
  }
};

const flowerBush: SpriteGenerator = (data, rng) => {
  // Start with a bush
  bushGenerator(data, rng);

  // Add flower dots
  const colors = [
    { r: 240, g: 70, b: 70 },
    { r: 255, g: 200, b: 50 },
    { r: 230, g: 100, b: 200 },
    { r: 255, g: 140, b: 50 },
  ];
  for (let i = 0; i < 5; i++) {
    const fx = 32 + (rng() - 0.5) * 16;
    const fy = 44 + (rng() - 0.5) * 8;
    const c = colors[Math.floor(rng() * colors.length)];
    fillCircle(data, fx, fy, 1.5, { ...c, a: 255 });
    // Center dot
    setPixel(data, Math.round(fx), Math.round(fy), { r: 255, g: 255, b: 200, a: 220 });
  }
};

const rockGenerator: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 50;

  // Shadow
  fillEllipse(data, cx, 56, 8, 2, { r: 0, g: 0, b: 0, a: 30 });

  // Irregular rock shape — multiple overlapping ellipses
  const stones = [
    { ox: 0, oy: 0, rx: 9, ry: 6, baseR: 140, baseG: 135, baseB: 125 },
    { ox: -3, oy: -2, rx: 6, ry: 5, baseR: 155, baseG: 150, baseB: 140 },
    { ox: 4, oy: -1, rx: 5, ry: 4, baseR: 130, baseG: 125, baseB: 115 },
    { ox: 0, oy: -4, rx: 7, ry: 3, baseR: 165, baseG: 160, baseB: 150 },
  ];

  for (const s of stones) {
    for (let y = cy + s.oy - s.ry; y <= cy + s.oy + s.ry; y++) {
      for (let x = cx + s.ox - s.rx; x <= cx + s.ox + s.rx; x++) {
        const dx = (x - (cx + s.ox)) / s.rx;
        const dy = (y - (cy + s.oy)) / s.ry;
        if (dx * dx + dy * dy <= 1) {
          const shade = 0.8 + (1 - dy) * 0.15 + (dx < 0 ? -0.05 : 0.05);
          const noise = (rng() - 0.5) * 18;
          setPixel(data, Math.round(x), Math.round(y), {
            r: clamp(Math.round((s.baseR + noise) * shade), 0, 255),
            g: clamp(Math.round((s.baseG + noise) * shade), 0, 255),
            b: clamp(Math.round((s.baseB + noise) * shade), 0, 255),
            a: 255
          });
        }
      }
    }
  }

  // Moss patches
  for (let i = 0; i < 4; i++) {
    const mx = cx + (rng() - 0.5) * 12;
    const my = cy + (rng() - 0.5) * 6;
    fillCircle(data, mx, my, 1.5 + rng(), { r: 70, g: 120, b: 50, a: 150 });
  }
};

const barrelGenerator: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 48;

  // Shadow
  fillEllipse(data, cx, 56, 7, 2, { r: 0, g: 0, b: 0, a: 30 });

  // Barrel body
  for (let y = 40; y <= 55; y++) {
    const bulge = 1 + Math.sin((y - 40) / 15 * Math.PI) * 0.25;
    const halfW = 6 * bulge;
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      const xNorm = (x - cx) / halfW;
      const shade = 0.7 + (1 - Math.abs(xNorm)) * 0.35;
      const plank = Math.floor((x - cx + 8) / 3) % 2 === 0;
      const baseR = plank ? 160 : 145;
      const baseG = plank ? 100 : 85;
      const baseB = plank ? 50 : 40;
      setPixel(data, Math.round(x), y, {
        r: clamp(Math.round(baseR * shade), 0, 255),
        g: clamp(Math.round(baseG * shade), 0, 255),
        b: clamp(Math.round(baseB * shade), 0, 255),
        a: 255
      });
    }
  }

  // Metal bands
  for (const bandY of [42, 47, 53]) {
    for (let x = cx - 7; x <= cx + 7; x++) {
      const xNorm = (x - cx) / 7;
      const shade = 0.7 + (1 - Math.abs(xNorm)) * 0.4;
      setPixel(data, Math.round(x), bandY, {
        r: clamp(Math.round(120 * shade), 0, 255),
        g: clamp(Math.round(115 * shade), 0, 255),
        b: clamp(Math.round(100 * shade), 0, 255),
        a: 255
      });
    }
  }

  // Top ellipse
  fillEllipse(data, cx, 40, 6, 2.5, { r: 130, g: 85, b: 40, a: 255 });
  fillEllipse(data, cx, 40, 4.5, 1.5, { r: 100, g: 60, b: 30, a: 255 });
};

const fountainGenerator: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 50;

  // Shadow
  fillEllipse(data, cx, 57, 11, 3, { r: 0, g: 0, b: 0, a: 30 });

  // Base pool — stone ring
  fillEllipse(data, cx, cy + 2, 12, 5, { r: 160, g: 155, b: 145, a: 255 });
  fillEllipse(data, cx, cy + 2, 10, 4, { r: 60, g: 140, b: 200, a: 255 }); // water
  fillEllipse(data, cx, cy + 1, 9, 3, { r: 80, g: 165, b: 220, a: 255 }); // lighter water

  // Center pillar
  fillRect(data, cx - 2, cy - 8, 4, 10, { r: 170, g: 165, b: 155, a: 255 });
  fillRect(data, cx - 1.5, cy - 8, 3, 10, { r: 185, g: 180, b: 170, a: 255 });

  // Top basin
  fillEllipse(data, cx, cy - 8, 5, 2, { r: 175, g: 170, b: 160, a: 255 });
  fillEllipse(data, cx, cy - 8, 3.5, 1.2, { r: 70, g: 150, b: 210, a: 255 });

  // Water jet
  for (let y = cy - 16; y < cy - 8; y++) {
    const spray = Math.abs(y - (cy - 12)) * 0.3;
    setPixel(data, cx, y, { r: 150, g: 210, b: 240, a: 220 });
    if (spray > 0.5) {
      setPixel(data, cx - 1, y, { r: 130, g: 200, b: 235, a: 150 });
      setPixel(data, cx + 1, y, { r: 130, g: 200, b: 235, a: 150 });
    }
  }

  // Splash particles
  for (let i = 0; i < 6; i++) {
    const sx = cx + (rng() - 0.5) * 8;
    const sy = cy - 6 + rng() * 4;
    setPixel(data, Math.round(sx), Math.round(sy), { r: 170, g: 220, b: 245, a: 180 });
  }

  // Water highlights
  for (let i = 0; i < 4; i++) {
    const wx = cx + (rng() - 0.5) * 14;
    const wy = cy + 1 + (rng() - 0.5) * 4;
    setPixel(data, Math.round(wx), Math.round(wy), { r: 180, g: 230, b: 250, a: 200 });
  }
};

const benchGenerator: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 52;

  // Shadow
  fillEllipse(data, cx, 57, 10, 2, { r: 0, g: 0, b: 0, a: 25 });

  // Legs
  const legColor = { r: 100, g: 65, b: 30, a: 255 };
  fillRect(data, cx - 9, cy - 2, 2, 8, legColor);
  fillRect(data, cx + 7, cy - 2, 2, 8, legColor);

  // Seat planks
  for (let p = 0; p < 3; p++) {
    const py = cy - 2 + p * 2;
    const shade = 0.85 + p * 0.08;
    fillRect(data, cx - 10, py, 20, 1.5, {
      r: clamp(Math.round(170 * shade), 0, 255),
      g: clamp(Math.round(110 * shade), 0, 255),
      b: clamp(Math.round(55 * shade), 0, 255),
      a: 255
    });
  }

  // Back rest
  fillRect(data, cx - 9, cy - 10, 2, 8, legColor);
  fillRect(data, cx + 7, cy - 10, 2, 8, legColor);
  for (let p = 0; p < 2; p++) {
    const py = cy - 9 + p * 3;
    fillRect(data, cx - 10, py, 20, 2, {
      r: 165, g: 105, b: 50, a: 255
    });
  }
};

// ── FENCE & HEDGE GENERATORS ──

const fencePost: SpriteGenerator = (data, rng) => {
  // Simple post-and-rail wooden fence, viewed from slight isometric angle
  const groundY = 54;

  // Shadow
  fillEllipse(data, 32, 57, 12, 2, { r: 0, g: 0, b: 0, a: 25 });

  // Three posts
  const postColor = { r: 120, g: 75, b: 35, a: 255 };
  const postHighlight = { r: 145, g: 95, b: 50, a: 255 };
  for (const px of [16, 32, 48]) {
    fillRect(data, px - 2, groundY - 20, 4, 20, postColor);
    fillRect(data, px - 1, groundY - 20, 2, 20, postHighlight);
    // Post cap
    fillRect(data, px - 2.5, groundY - 22, 5, 3, { r: 100, g: 60, b: 28, a: 255 });
  }

  // Two horizontal rails
  const railColor = { r: 140, g: 90, b: 42, a: 255 };
  const railDark = { r: 110, g: 68, b: 30, a: 255 };
  fillRect(data, 16, groundY - 16, 32, 3, railColor);
  fillRect(data, 16, groundY - 15, 32, 1, railDark);
  fillRect(data, 16, groundY - 8, 32, 3, railColor);
  fillRect(data, 16, groundY - 7, 32, 1, railDark);

  // Wood grain noise on rails
  for (let i = 0; i < 10; i++) {
    const gx = 16 + rng() * 32;
    const gy = groundY - 16 + (rng() < 0.5 ? 0 : 8) + rng() * 2;
    setPixel(data, Math.round(gx), Math.round(gy), { r: 100, g: 62, b: 28, a: 80 });
  }
};

const picketFence: SpriteGenerator = (data, rng) => {
  // Picket fence with pointed slat tops
  const groundY = 54;

  // Shadow
  fillEllipse(data, 32, 57, 14, 2, { r: 0, g: 0, b: 0, a: 25 });

  // Horizontal rail behind slats
  const railColor = { r: 130, g: 82, b: 38, a: 255 };
  fillRect(data, 12, groundY - 10, 40, 2, railColor);
  fillRect(data, 12, groundY - 18, 40, 2, railColor);

  // Vertical pickets
  const slatColor = { r: 200, g: 185, b: 155, a: 255 };
  const slatShade = { r: 175, g: 160, b: 130, a: 255 };
  for (let i = 0; i < 9; i++) {
    const sx = 12 + i * 5;
    const h = 22 + Math.round((rng() - 0.5) * 2);
    // Main slat body
    fillRect(data, sx, groundY - h, 3, h, slatColor);
    fillRect(data, sx, groundY - h, 1, h, slatShade);
    // Pointed top
    setPixel(data, sx + 1, groundY - h - 1, slatColor);
    setPixel(data, sx + 1, groundY - h - 2, { ...slatColor, a: 200 });
  }
};

const hedgeDense: SpriteGenerator = (data, rng) => {
  // Dense rectangular hedge wall — dark green
  const cx = 32, groundY = 54;

  // Shadow
  fillEllipse(data, cx, 57, 14, 2.5, { r: 0, g: 0, b: 0, a: 30 });

  // Main rectangular body
  const baseG = 90;
  for (let y = groundY - 18; y <= groundY; y++) {
    for (let x = 12; x <= 52; x++) {
      const shade = 0.7 + (groundY - y) / 25 * 0.35;
      const edgeFade = Math.min(1, Math.min(x - 11, 53 - x) / 3);
      const noise = (rng() - 0.5) * 18;
      setPixel(data, x, y, {
        r: clamp(Math.round((28 + noise * 0.5) * shade), 0, 255),
        g: clamp(Math.round((baseG + noise) * shade), 0, 255),
        b: clamp(Math.round((22 + noise * 0.3) * shade), 0, 255),
        a: Math.round(255 * edgeFade),
      });
    }
  }

  // Leafy texture bumps on top edge
  for (let i = 0; i < 8; i++) {
    const bx = 14 + rng() * 36;
    const by = groundY - 18 - rng() * 3;
    fillCircle(data, bx, by, 2 + rng() * 1.5, {
      r: 35 + Math.round(rng() * 15),
      g: 100 + Math.round(rng() * 30),
      b: 25 + Math.round(rng() * 10),
      a: 255,
    });
  }

  // Highlight patches
  for (let i = 0; i < 6; i++) {
    const hx = 14 + rng() * 36;
    const hy = groundY - 12 + (rng() - 0.5) * 8;
    setPixel(data, Math.round(hx), Math.round(hy), { r: 55, g: 135, b: 40, a: 160 });
  }
};

const hedgeTrimmed: SpriteGenerator = (data, rng) => {
  // Trimmed rounded hedge — lighter green, softer shape
  const cx = 32, groundY = 54;

  // Shadow
  fillEllipse(data, cx, 57, 13, 2.5, { r: 0, g: 0, b: 0, a: 28 });

  // Rounded top shape — combination of rectangle bottom + ellipse top
  const halfW = 18;
  const bodyTop = groundY - 14;
  const archCY = bodyTop;
  const archRY = 6;

  for (let y = groundY; y >= bodyTop - archRY; y--) {
    for (let x = cx - halfW; x <= cx + halfW; x++) {
      let inside = false;
      if (y >= bodyTop) {
        inside = true; // rectangular section
      } else {
        // Elliptical arch
        const dx = (x - cx) / halfW;
        const dy = (y - archCY) / archRY;
        inside = dx * dx + dy * dy <= 1;
      }
      if (!inside) continue;

      const shade = 0.75 + (groundY - y) / 22 * 0.3;
      const noise = (rng() - 0.5) * 15;
      setPixel(data, x, y, {
        r: clamp(Math.round((40 + noise * 0.5) * shade), 0, 255),
        g: clamp(Math.round((125 + noise) * shade), 0, 255),
        b: clamp(Math.round((35 + noise * 0.3) * shade), 0, 255),
        a: 255,
      });
    }
  }

  // Highlight spots on top
  for (let i = 0; i < 6; i++) {
    const hx = cx + (rng() - 0.5) * 28;
    const hy = bodyTop - rng() * 4;
    fillCircle(data, hx, hy, 1.5, { r: 70, g: 165, b: 55, a: 180 });
  }
};

// ── MARKET STALL ──
const marketStall: SpriteGenerator = (data, rng) => {
  const cx = 32, groundY = 56;

  // Shadow
  fillEllipse(data, cx, 58, 12, 3, { r: 0, g: 0, b: 0, a: 30 });

  // Counter / table
  fillRect(data, cx - 10, groundY - 8, 20, 3, { r: 160, g: 100, b: 45, a: 255 });
  fillRect(data, cx - 10, groundY - 7, 20, 1, { r: 130, g: 80, b: 35, a: 255 });

  // Front panel
  fillRect(data, cx - 10, groundY - 5, 20, 5, { r: 140, g: 85, b: 38, a: 255 });
  fillRect(data, cx - 9, groundY - 4, 18, 3, { r: 155, g: 100, b: 50, a: 255 });

  // Support posts
  fillRect(data, cx - 10, groundY - 22, 2, 22, { r: 100, g: 60, b: 28, a: 255 });
  fillRect(data, cx + 8, groundY - 22, 2, 22, { r: 100, g: 60, b: 28, a: 255 });

  // Awning / canopy (colorful)
  const awningColor = rng() < 0.5
    ? { r: 200, g: 60, b: 50, a: 255 }  // red
    : { r: 50, g: 130, b: 200, a: 255 }; // blue
  fillRect(data, cx - 12, groundY - 24, 24, 4, awningColor);
  fillRect(data, cx - 13, groundY - 23, 26, 2, { ...awningColor, r: awningColor.r + 20, g: awningColor.g + 20, b: awningColor.b + 20 });

  // Stripe on awning
  for (let x = cx - 12; x < cx + 12; x += 4) {
    fillRect(data, x, groundY - 24, 2, 4, { r: 255, g: 255, b: 240, a: 120 });
  }

  // Goods on counter (colored dots)
  for (let i = 0; i < 4; i++) {
    const gx = cx - 7 + i * 5;
    const gy = groundY - 10;
    const colors = [
      { r: 220, g: 50, b: 40 }, { r: 240, g: 200, b: 30 },
      { r: 80, g: 180, b: 60 }, { r: 200, g: 120, b: 40 },
    ];
    fillCircle(data, gx, gy, 2, { ...colors[i % colors.length], a: 255 });
  }
};

// ── CRATE CLUSTER ──
const crateCluster: SpriteGenerator = (data, rng) => {
  const cx = 32, groundY = 56;

  // Shadow
  fillEllipse(data, cx, 58, 10, 2.5, { r: 0, g: 0, b: 0, a: 25 });

  // Large crate
  const crateColor = { r: 170, g: 120, b: 60, a: 255 };
  const crateDark = { r: 140, g: 95, b: 45, a: 255 };
  fillRect(data, cx - 7, groundY - 12, 12, 12, crateColor);
  fillRect(data, cx - 7, groundY - 12, 12, 1, crateDark);
  fillRect(data, cx - 7, groundY - 6, 12, 1, crateDark);
  fillRect(data, cx - 7, groundY - 12, 1, 12, crateDark);
  fillRect(data, cx + 4, groundY - 12, 1, 12, crateDark);
  // Cross planks
  for (let i = 0; i < 12; i++) {
    setPixel(data, cx - 7 + i, groundY - 12 + i, crateDark);
    setPixel(data, cx + 4 - i, groundY - 12 + i, crateDark);
  }

  // Small crate on top
  fillRect(data, cx - 3, groundY - 20, 8, 8, { r: 180, g: 130, b: 70, a: 255 });
  fillRect(data, cx - 3, groundY - 20, 8, 1, crateDark);
  fillRect(data, cx - 3, groundY - 16, 8, 1, crateDark);

  // Barrel beside
  for (let y = groundY - 10; y <= groundY; y++) {
    const bulge = 1 + Math.sin((y - (groundY - 10)) / 10 * Math.PI) * 0.2;
    const hw = 4 * bulge;
    for (let x = cx + 8 - hw; x <= cx + 8 + hw; x++) {
      setPixel(data, Math.round(x), y, { r: 150, g: 95, b: 42, a: 255 });
    }
  }
  // Barrel band
  fillRect(data, cx + 4, groundY - 7, 8, 1, { r: 110, g: 110, b: 100, a: 255 });
  fillRect(data, cx + 4, groundY - 3, 8, 1, { r: 110, g: 110, b: 100, a: 255 });
};

// ── FLOWER GARDEN ──
const flowerGarden: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 50;

  // Dirt patch
  fillEllipse(data, cx, cy, 12, 6, { r: 120, g: 85, b: 50, a: 255 });
  fillEllipse(data, cx, cy, 10, 5, { r: 100, g: 70, b: 40, a: 255 });

  // Rows of flowers
  const flowerColors = [
    { r: 240, g: 60, b: 80 }, { r: 255, g: 200, b: 50 },
    { r: 220, g: 80, b: 200 }, { r: 255, g: 140, b: 50 },
    { r: 100, g: 200, b: 255 },
  ];
  for (let row = -3; row <= 3; row += 2) {
    for (let col = -4; col <= 4; col += 2) {
      const fx = cx + col * 2 + (rng() - 0.5) * 2;
      const fy = cy + row * 1.5 + (rng() - 0.5);
      // Stem
      setPixel(data, Math.round(fx), Math.round(fy + 1), { r: 50, g: 120, b: 40, a: 255 });
      setPixel(data, Math.round(fx), Math.round(fy + 2), { r: 50, g: 120, b: 40, a: 255 });
      // Flower head
      const fc = flowerColors[Math.floor(rng() * flowerColors.length)];
      fillCircle(data, fx, fy, 1.5, { ...fc, a: 255 });
      setPixel(data, Math.round(fx), Math.round(fy), { r: 255, g: 255, b: 200, a: 200 });
    }
  }

  // Border stones
  for (let angle = 0; angle < Math.PI * 2; angle += 0.35) {
    const bx = cx + Math.cos(angle) * 11;
    const by = cy + Math.sin(angle) * 5.5;
    fillCircle(data, bx, by, 1.2, { r: 160, g: 155, b: 140, a: 200 });
  }
};

// ── LAMP POST ──
const lampPost: SpriteGenerator = (data, rng) => {
  const cx = 32, groundY = 56;

  // Shadow
  fillEllipse(data, cx, 58, 5, 1.5, { r: 0, g: 0, b: 0, a: 25 });

  // Base
  fillRect(data, cx - 3, groundY - 2, 6, 2, { r: 60, g: 60, b: 65, a: 255 });

  // Pole
  const poleColor = { r: 70, g: 70, b: 75, a: 255 };
  fillRect(data, cx - 1, groundY - 28, 2, 26, poleColor);
  fillRect(data, cx, groundY - 28, 1, 26, { r: 90, g: 90, b: 95, a: 255 }); // highlight

  // Lamp housing
  fillRect(data, cx - 3, groundY - 32, 6, 4, { r: 50, g: 50, b: 55, a: 255 });
  fillRect(data, cx - 4, groundY - 33, 8, 2, { r: 60, g: 60, b: 65, a: 255 });

  // Glowing light
  fillCircle(data, cx, groundY - 30, 2.5, { r: 255, g: 230, b: 150, a: 255 });
  fillCircle(data, cx, groundY - 30, 4, { r: 255, g: 220, b: 100, a: 60 }); // glow
  fillCircle(data, cx, groundY - 30, 6, { r: 255, g: 200, b: 80, a: 25 }); // outer glow
};

// ── HAY BALE ──
const hayBale: SpriteGenerator = (data, rng) => {
  const cx = 32, cy = 50;

  // Shadow
  fillEllipse(data, cx, 56, 10, 2.5, { r: 0, g: 0, b: 0, a: 25 });

  // Round bale
  fillEllipse(data, cx, cy, 9, 6, { r: 200, g: 170, b: 80, a: 255 });
  fillEllipse(data, cx - 1, cy - 1, 8, 5, { r: 220, g: 190, b: 95, a: 255 });

  // Spiral pattern (concentric lines)
  for (let r = 2; r < 7; r += 2) {
    for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
      const hx = cx + Math.cos(angle) * r * 0.9;
      const hy = cy + Math.sin(angle) * r * 0.6;
      setPixel(data, Math.round(hx), Math.round(hy), { r: 180, g: 150, b: 65, a: 120 });
    }
  }

  // Straw wisps on top
  for (let i = 0; i < 5; i++) {
    const sx = cx + (rng() - 0.5) * 14;
    const sy = cy - 5 + rng() * 2;
    setPixel(data, Math.round(sx), Math.round(sy), { r: 230, g: 200, b: 100, a: 200 });
    setPixel(data, Math.round(sx + 1), Math.round(sy - 1), { r: 230, g: 200, b: 100, a: 150 });
  }

  // Small bale beside
  fillEllipse(data, cx + 10, cy + 2, 5, 4, { r: 190, g: 160, b: 75, a: 255 });
  fillEllipse(data, cx + 10, cy + 1, 4, 3, { r: 210, g: 180, b: 90, a: 255 });
};

// ── WAGON / CART ──
const wagonCart: SpriteGenerator = (data, rng) => {
  const cx = 32, groundY = 54;

  // Shadow
  fillEllipse(data, cx, 58, 14, 3, { r: 0, g: 0, b: 0, a: 25 });

  // Wheels
  const wheelColor = { r: 90, g: 55, b: 25, a: 255 };
  // Left wheel
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const wx = cx - 10 + Math.cos(angle) * 4;
    const wy = groundY - 3 + Math.sin(angle) * 4;
    setPixel(data, Math.round(wx), Math.round(wy), wheelColor);
  }
  fillCircle(data, cx - 10, groundY - 3, 1, wheelColor);
  // Right wheel
  for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
    const wx = cx + 10 + Math.cos(angle) * 4;
    const wy = groundY - 3 + Math.sin(angle) * 4;
    setPixel(data, Math.round(wx), Math.round(wy), wheelColor);
  }
  fillCircle(data, cx + 10, groundY - 3, 1, wheelColor);

  // Cart body
  const bodyColor = { r: 160, g: 100, b: 40, a: 255 };
  fillRect(data, cx - 12, groundY - 14, 24, 8, bodyColor);
  fillRect(data, cx - 12, groundY - 14, 24, 1, { r: 130, g: 78, b: 30, a: 255 });
  fillRect(data, cx - 12, groundY - 7, 24, 1, { r: 130, g: 78, b: 30, a: 255 });

  // Side walls
  fillRect(data, cx - 12, groundY - 18, 1, 10, bodyColor);
  fillRect(data, cx + 11, groundY - 18, 1, 10, bodyColor);
  fillRect(data, cx - 12, groundY - 18, 24, 2, { r: 140, g: 85, b: 35, a: 255 });

  // Handle/tongue
  fillRect(data, cx - 18, groundY - 10, 6, 2, { r: 110, g: 70, b: 30, a: 255 });

  // Cargo (colored lumps)
  fillCircle(data, cx - 4, groundY - 16, 3, { r: 200, g: 160, b: 60, a: 255 });
  fillCircle(data, cx + 3, groundY - 17, 3.5, { r: 180, g: 140, b: 50, a: 255 });
  fillCircle(data, cx + 1, groundY - 20, 2.5, { r: 210, g: 170, b: 70, a: 255 });
};

// ── BIRD GENERATORS ──
// Simple V-shape silhouettes for flap animation (dark against sky)

function makeBirdGenerator(wingUp: boolean, variant: number): SpriteGenerator {
  return (data, rng) => {
    const cx = 32, cy = 32;
    const bodyColor: RGBA = variant === 0
      ? { r: 30, g: 30, b: 35, a: 255 }        // dark silhouette
      : variant === 1
        ? { r: 50, g: 35, b: 25, a: 255 }       // brown
        : { r: 25, g: 25, b: 45, a: 255 };       // dark blue

    // Body dot
    fillCircle(data, cx, cy, 2, bodyColor);

    // Wings — two angled lines from center
    const wingLen = 8 + variant;
    const wingAngle = wingUp ? -0.45 : 0.3; // radians from horizontal

    for (let side = -1; side <= 1; side += 2) {
      for (let t = 0; t <= wingLen; t++) {
        const px = cx + side * t;
        const py = cy + t * wingAngle * side * (side < 0 ? -1 : 1);
        // Thicker near body, thin at tip
        const thickness = t < wingLen * 0.5 ? 1.5 : 0.8;
        fillCircle(data, px, py, thickness, bodyColor);
      }
    }

    // Slight highlight on body
    setPixel(data, cx, cy - 1, { r: bodyColor.r + 40, g: bodyColor.g + 40, b: bodyColor.b + 40, a: 200 });
  };
}

// ── BURNED HOUSE ──
const burnedHouse: SpriteGenerator = (data, rng) => {
  const cx = 32, groundY = 56;

  // Shadow
  fillEllipse(data, cx, 58, 12, 3, { r: 0, g: 0, b: 0, a: 40 });

  // Charred foundation
  fillRect(data, cx - 12, groundY - 4, 24, 4, { r: 50, g: 40, b: 35, a: 255 });
  fillRect(data, cx - 11, groundY - 3, 22, 2, { r: 60, g: 48, b: 40, a: 255 });

  // Left wall fragment (partially collapsed)
  for (let y = groundY - 18; y <= groundY - 4; y++) {
    const wallH = groundY - 4 - y;
    const collapse = rng() * 3;
    for (let x = cx - 11; x < cx - 5 + collapse; x++) {
      const shade = 0.6 + rng() * 0.3;
      setPixel(data, Math.round(x), y, {
        r: clamp(Math.round(55 * shade), 0, 255),
        g: clamp(Math.round(42 * shade), 0, 255),
        b: clamp(Math.round(35 * shade), 0, 255),
        a: wallH > 10 ? 180 : 255,
      });
    }
  }

  // Right wall fragment (shorter, more collapsed)
  for (let y = groundY - 12; y <= groundY - 4; y++) {
    for (let x = cx + 4; x < cx + 11; x++) {
      const shade = 0.5 + rng() * 0.35;
      setPixel(data, Math.round(x), y, {
        r: clamp(Math.round(50 * shade), 0, 255),
        g: clamp(Math.round(38 * shade), 0, 255),
        b: clamp(Math.round(30 * shade), 0, 255),
        a: 255,
      });
    }
  }

  // Collapsed roof beams (angled dark lines)
  for (let t = 0; t < 8; t++) {
    const bx = cx - 8 + t * 2.5;
    const by = groundY - 14 - rng() * 6;
    const len = 4 + rng() * 6;
    for (let i = 0; i < len; i++) {
      setPixel(data, Math.round(bx + i * 0.6), Math.round(by + i * 0.4), {
        r: 40, g: 30, b: 25, a: 220,
      });
    }
  }

  // Char marks / scorch patterns
  for (let i = 0; i < 12; i++) {
    const sx = cx + (rng() - 0.5) * 20;
    const sy = groundY - 6 + (rng() - 0.5) * 12;
    fillCircle(data, sx, sy, 1 + rng() * 1.5, {
      r: 25 + Math.round(rng() * 20),
      g: 18 + Math.round(rng() * 12),
      b: 12 + Math.round(rng() * 8),
      a: 180,
    });
  }

  // Ember glow at base
  for (let i = 0; i < 8; i++) {
    const ex = cx + (rng() - 0.5) * 16;
    const ey = groundY - 3 + (rng() - 0.5) * 4;
    fillCircle(data, ex, ey, 1 + rng(), {
      r: 200 + Math.round(rng() * 55),
      g: 80 + Math.round(rng() * 50),
      b: 10 + Math.round(rng() * 20),
      a: 120 + Math.round(rng() * 80),
    });
  }

  // Smoke wisps at top
  for (let i = 0; i < 4; i++) {
    const sx = cx + (rng() - 0.5) * 10;
    const sy = groundY - 20 - rng() * 10;
    fillCircle(data, sx, sy, 2 + rng() * 2, {
      r: 100, g: 90, b: 85, a: 40 + Math.round(rng() * 30),
    });
  }
};

// ── FIRE ANIMATION FRAMES ──
function makeFireGenerator(phase: number): SpriteGenerator {
  return (data, rng) => {
    const cx = 32, groundY = 54;

    // Main flame body — layered ellipses from bottom to top
    const flameColors = [
      { r: 255, g: 200, b: 50 },   // bright yellow core
      { r: 255, g: 140, b: 20 },   // orange
      { r: 240, g: 80, b: 10 },    // red-orange
      { r: 200, g: 40, b: 5 },     // dark red tips
    ];

    // Phase offset shifts the flame shape slightly
    const phaseOff = phase * 3;

    // Outer glow (semi-transparent)
    fillEllipse(data, cx, groundY - 14, 16, 18, {
      r: 255, g: 120, b: 20, a: 25,
    });

    // Main flame columns (3 interleaved for natural look)
    const columns = [
      { ox: -4 + phase * 2, h: 28, w: 8 },
      { ox: 2 - phase, h: 32, w: 10 },
      { ox: -1 + phase, h: 26, w: 7 },
    ];

    for (const col of columns) {
      for (let y = groundY; y > groundY - col.h; y--) {
        const progress = (groundY - y) / col.h; // 0=bottom, 1=top
        const halfW = col.w * (1 - progress * 0.7) * (0.8 + Math.sin(y * 0.5 + phaseOff) * 0.2);

        const colorIdx = Math.min(3, Math.floor(progress * 4));
        const c = flameColors[colorIdx];
        const noise = (rng() - 0.5) * 30;
        const flicker = Math.sin(y * 0.8 + phaseOff + rng() * 2) * 0.15;

        for (let x = cx + col.ox - halfW; x <= cx + col.ox + halfW; x++) {
          const edgeDist = 1 - Math.abs(x - (cx + col.ox)) / halfW;
          const alpha = Math.min(255, Math.round((180 + edgeDist * 75) * (1 - progress * 0.4 + flicker)));
          setPixel(data, Math.round(x), y, {
            r: clamp(Math.round(c.r + noise), 0, 255),
            g: clamp(Math.round(c.g + noise * 0.6), 0, 255),
            b: clamp(Math.round(c.b + noise * 0.3), 0, 255),
            a: clamp(alpha, 0, 255),
          });
        }
      }
    }

    // Bright core
    fillEllipse(data, cx + phase, groundY - 8, 4, 6, {
      r: 255, g: 255, b: 200, a: 180,
    });

    // Sparks / embers flying upward
    for (let i = 0; i < 6; i++) {
      const sx = cx + (rng() - 0.5) * 14;
      const sy = groundY - 20 - rng() * 16;
      setPixel(data, Math.round(sx), Math.round(sy), {
        r: 255, g: 200 + Math.round(rng() * 55), b: 50,
        a: 150 + Math.round(rng() * 105),
      });
    }
  };
}

// ── ALL DECORATIONS ──
const DECORATIONS: Record<string, SpriteGenerator> = {
  'tree-1': roundTree,
  'tree-2': oakTree,
  'tree-3': fruitTree,
  'pine-1': pineTree,
  'pine-2': spruce,
  'bush-1': bushGenerator,
  'bush-2': flowerBush,
  'rock-1': rockGenerator,
  'rock-2': barrelGenerator,
  'fountain-1': fountainGenerator,
  'bench-1': benchGenerator,
  'fence-1': fencePost,
  'fence-2': picketFence,
  'hedge-1': hedgeDense,
  'hedge-2': hedgeTrimmed,
  'market-1': marketStall,
  'crate-1': crateCluster,
  'flower-1': flowerGarden,
  'lamp-1': lampPost,
  'hay-1': hayBale,
  'wagon-1': wagonCart,
  'bird-v1-up': makeBirdGenerator(true, 0),
  'bird-v1-down': makeBirdGenerator(false, 0),
  'bird-v2-up': makeBirdGenerator(true, 1),
  'bird-v2-down': makeBirdGenerator(false, 1),
  'bird-v3-up': makeBirdGenerator(true, 2),
  'bird-v3-down': makeBirdGenerator(false, 2),
  'burned-house': burnedHouse,
  'fire-1': makeFireGenerator(0),
  'fire-2': makeFireGenerator(1),
};

async function generateSprite(key: string, gen: SpriteGenerator): Promise<void> {
  const seed = key.split('').reduce((a, c) => a * 31 + c.charCodeAt(0), 0);
  const rng = mulberry32(Math.abs(seed) + 42);
  const data = Buffer.alloc(SIZE * SIZE * 4); // all transparent

  gen(data, rng);

  const outPath = path.join(OUTPUT_DIR, `${key}.png`);
  await sharp(data, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .png()
    .toFile(outPath);

  const stat = fs.statSync(outPath);
  console.log(`  ✓ ${key}.png (${(stat.size / 1024).toFixed(1)}KB)`);
}

async function main() {
  console.log('Generating programmatic decoration sprites...');
  console.log(`Output: ${OUTPUT_DIR}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [key, gen] of Object.entries(DECORATIONS)) {
    console.log(`Generating "${key}"...`);
    await generateSprite(key, gen);
  }

  console.log(`\nDone! ${Object.keys(DECORATIONS).length} sprites generated.`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
