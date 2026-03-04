/**
 * Generate isometric tile textures via Stable Diffusion (PixNite model),
 * then mask into diamond sprites for the tilemap.
 *
 * Usage: npx tsx scripts/generate-tiles.ts
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

const PIXNITE_MODEL = 'pixnite-pure-pixel-art.safetensors';

const STYLE_SUFFIX = '((best quality)), pixel art, (seamless texture:1.5), (repeating pattern:1.4), (full frame:1.4), (filling entire image:1.3), flat, no border, no object';
const NEGATIVE_PROMPT = '(object:1.6), (icon:1.6), (sprite:1.5), (item:1.5), (centered object:1.5), (single object:1.5), (building:1.5), (house:1.5), (tree:1.5), (person:1.4), (character:1.4), (creature:1.4), (circle:1.3), (spotlight:1.3), (vignette:1.3), text, watermark, blurry, border, frame, 3d render, realistic, photograph, dark, gloomy, black background';

const BATCH_SIZE = 4;

const SD_SETTINGS = {
  width: 512,
  height: 512,
  steps: 25,
  cfg_scale: 9,
  sampler_name: 'DPM++ 2M SDE Karras',
};

// Output: 4x runtime size (32x16) for crisp scaling
const OUT_W = 128;
const OUT_H = 64;

const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/tiles');

// Tile definitions — texture fills, not objects
const TILES: Array<{ key: string; prompt: string }> = [
  { key: 'grass',          prompt: 'pixel art green grass ground, many blades of grass filling entire image, bright green lawn texture pattern' },
  { key: 'water',          prompt: 'pixel art blue water waves, ocean surface filling entire image, repeating wave pattern, turquoise blue' },
  { key: 'hill',           prompt: 'pixel art brown sandy ground, dirt and small rocks filling entire image, warm tan earth texture' },
  { key: 'forest',         prompt: 'pixel art dark green leaves and moss, dense foliage filling entire image, forest canopy from above' },
  { key: 'road-main',      prompt: 'pixel art red brown brick pattern, cobblestone pavement filling entire image, warm brick grid texture' },
  { key: 'road-secondary', prompt: 'pixel art orange brown stone path, terracotta paving tiles filling entire image, warm stone pattern' },
  { key: 'road-local',     prompt: 'pixel art light brown packed dirt, gravel path filling entire image, sandy brown trail texture' },
  { key: 'park',           prompt: 'pixel art bright green grass with small flowers, colorful meadow filling entire image, yellow and red dots on green' },
  { key: 'plot',           prompt: 'pixel art dark brown plowed soil, tilled farmland rows filling entire image, brown earth furrows' },
];

async function switchModel(modelName: string): Promise<boolean> {
  try {
    const optRes = await fetch(`${SD_API_URL}/sdapi/v1/options`);
    const opts: any = await optRes.json();
    if (opts.sd_model_checkpoint === modelName) {
      console.log(`  Model already set to ${modelName}`);
      return true;
    }
    console.log(`  Switching model to ${modelName}...`);
    const res = await fetch(`${SD_API_URL}/sdapi/v1/options`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sd_model_checkpoint: modelName }),
    });
    if (!res.ok) {
      console.error(`  Failed to switch model: ${res.status}`);
      return false;
    }
    console.log(`  Model switched to ${modelName}`);
    return true;
  } catch (err: any) {
    console.error(`  Model switch error: ${err.message}`);
    return false;
  }
}

async function getCurrentModel(): Promise<string> {
  try {
    const res = await fetch(`${SD_API_URL}/sdapi/v1/options`);
    const opts: any = await res.json();
    return opts.sd_model_checkpoint || '';
  } catch {
    return '';
  }
}

async function callSD(prompt: string): Promise<Buffer[]> {
  const body: Record<string, any> = {
    prompt: `${prompt}, ${STYLE_SUFFIX}`,
    negative_prompt: NEGATIVE_PROMPT,
    ...SD_SETTINGS,
    batch_size: BATCH_SIZE,
    n_iter: 1,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180000);

  try {
    const response = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.error(`SD API returned ${response.status}: ${await response.text()}`);
      return [];
    }

    const data: any = await response.json();
    const images: string[] = data.images;
    if (!images || images.length === 0) return [];

    return images.map((img: string) => Buffer.from(img, 'base64'));
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('SD API request timed out');
    } else {
      throw err;
    }
    return [];
  }
}

/**
 * Create an isometric diamond alpha mask.
 */
function createDiamondMask(w: number, h: number): Buffer {
  const mask = Buffer.alloc(w * h);
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

/**
 * Score a tile candidate: prefer uniform, vibrant textures.
 * Penalize images with a central object (brightness variance between center and edges).
 */
async function scoreCandidate(rawBuffer: Buffer): Promise<{ score: number; buffer: Buffer }> {
  const { data, info } = await sharp(rawBuffer)
    .resize(64, 64, { fit: 'fill' })
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  let totalSat = 0;
  let totalBright = 0;
  let centerBright = 0;
  let edgeBright = 0;
  let centerCount = 0;
  let edgeCount = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const r = data[i * channels];
      const g = data[i * channels + 1];
      const b = data[i * channels + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const bright = (r + g + b) / 3;
      totalSat += max - min;
      totalBright += bright;

      // Check if center vs edge (for uniformity scoring)
      const cx = Math.abs(x - width / 2) / (width / 2);
      const cy = Math.abs(y - height / 2) / (height / 2);
      if (cx < 0.4 && cy < 0.4) {
        centerBright += bright;
        centerCount++;
      } else if (cx > 0.7 || cy > 0.7) {
        edgeBright += bright;
        edgeCount++;
      }
    }
  }

  const n = width * height;
  const avgSat = totalSat / n;
  const avgBright = totalBright / n;

  // Uniformity: penalize big difference between center and edges (means icon/object)
  const avgCenter = centerCount > 0 ? centerBright / centerCount : avgBright;
  const avgEdge = edgeCount > 0 ? edgeBright / edgeCount : avgBright;
  const uniformity = 1 - Math.min(1, Math.abs(avgCenter - avgEdge) / 80);

  let score = (avgSat * 2 + avgBright) * uniformity;
  if (avgBright < 60) score *= 0.3;
  if (avgBright > 230) score *= 0.5;
  if (avgSat < 15) score *= 0.3;

  return { score, buffer: rawBuffer };
}

async function processToTile(imageBuffer: Buffer, key: string): Promise<void> {
  // Center-crop the middle portion to avoid edge artifacts and central objects
  // Extract a horizontal band from the center of the 512x512 image
  const cropSize = 320; // inner 320x320 of 512x512
  const cropOffset = Math.floor((512 - cropSize) / 2);

  const resized = await sharp(imageBuffer)
    .extract({ left: cropOffset, top: cropOffset, width: cropSize, height: cropSize })
    .resize(OUT_W, OUT_H, { fit: 'fill' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { data, info } = resized;
  const { width, height, channels } = info;

  const mask = createDiamondMask(width, height);
  const output = Buffer.from(data);

  for (let i = 0; i < width * height; i++) {
    output[i * channels + 3] = Math.round((output[i * channels + 3] / 255) * (mask[i] / 255) * 255);
  }

  const outPath = path.join(OUTPUT_DIR, `${key}.png`);
  await sharp(output, { raw: { width, height, channels } })
    .png()
    .toFile(outPath);

  const stat = fs.statSync(outPath);
  console.log(`  ✓ ${key}.png (${(stat.size / 1024).toFixed(1)}KB)`);
}

async function main() {
  console.log('Generating isometric tile textures...');
  console.log(`SD API: ${SD_API_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Target model: ${PIXNITE_MODEL}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const originalModel = await getCurrentModel();
  console.log(`Current model: ${originalModel}`);

  const switched = await switchModel(PIXNITE_MODEL);
  if (!switched) {
    console.error(`\nFailed to switch to ${PIXNITE_MODEL}.`);
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  for (const tile of TILES) {
    const outPath = path.join(OUTPUT_DIR, `${tile.key}.png`);
    if (fs.existsSync(outPath)) {
      console.log(`  [skip] ${tile.key}.png already exists`);
      success++;
      continue;
    }

    console.log(`Generating "${tile.key}" (${BATCH_SIZE} candidates)...`);
    const candidates = await callSD(tile.prompt);

    if (candidates.length === 0) {
      console.error(`  ✗ Failed to generate ${tile.key}`);
      failed++;
      continue;
    }

    let bestScore = -1;
    let bestBuffer: Buffer = candidates[0];
    let bestIdx = 0;

    for (let i = 0; i < candidates.length; i++) {
      const { score } = await scoreCandidate(candidates[i]);
      console.log(`    candidate ${i + 1}: score=${score.toFixed(0)}`);
      if (score > bestScore) {
        bestScore = score;
        bestBuffer = candidates[i];
        bestIdx = i;
      }
    }

    console.log(`    → picked candidate ${bestIdx + 1}`);

    // Save raw for debugging
    const rawPath = path.join(OUTPUT_DIR, `${tile.key}-raw.png`);
    fs.writeFileSync(rawPath, bestBuffer);

    await processToTile(bestBuffer, tile.key);
    success++;
  }

  // Restore original model
  if (originalModel && originalModel !== PIXNITE_MODEL) {
    console.log(`\nRestoring original model: ${originalModel}`);
    await switchModel(originalModel);
  }

  console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log('Re-run the script to retry failed tiles.');
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
