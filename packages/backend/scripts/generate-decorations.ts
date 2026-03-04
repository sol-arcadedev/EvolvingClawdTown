/**
 * Generate isometric decoration sprites (trees, bushes, rocks, etc.)
 * via Stable Diffusion with transparent backgrounds.
 *
 * Usage: npx tsx scripts/generate-decorations.ts
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

// PixNite checkpoint — set SD to this model before running
const PIXNITE_MODEL = 'pixnite-pure-pixel-art.safetensors';

const STYLE_SUFFIX = '((best quality)), ((masterpiece)), pixel art, rpg game asset sprite, (solid white background:1.6), (single object:1.4), centered, (isolated:1.3), clean edges';
const NEGATIVE_PROMPT = '(ground:1.6), (floor:1.6), (platform:1.6), (terrain:1.5), (grass:1.5), (dirt:1.5), (soil:1.5), (base:1.4), (pedestal:1.4), (shadow on ground:1.4), (multiple:1.5), (group:1.4), (many:1.4), (sprite sheet:1.5), (grid:1.4), (tileset:1.4), (sky:1.3), (clouds:1.3), (scene:1.3), (landscape:1.3), (building:1.3), (house:1.3), text, watermark, blurry, person, character, UI, frame, border, road, path, 3d render, realistic, photograph, painting, anime, christmas, snow, dark background, black background, ring, circle, wreath, abstract';

const BATCH_SIZE = 4; // generate multiple candidates, pick best

const SD_SETTINGS = {
  width: 512,
  height: 512,
  steps: 28,
  cfg_scale: 9,
  sampler_name: 'DPM++ 2M SDE Karras',
};

const OUT_SIZE = 64; // 64x64 decoration sprites

const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/decorations');

// Prompts: very specific structure descriptions, "icon" style
const DECORATIONS: Array<{ key: string; prompt: string }> = [
  { key: 'tree-1', prompt: 'pixel art tree icon, round green canopy, straight brown trunk, simple' },
  { key: 'tree-2', prompt: 'pixel art oak tree icon, wide dark green leafy crown, thick trunk' },
  { key: 'tree-3', prompt: 'pixel art apple tree icon, bright green round canopy, red fruit' },
  { key: 'pine-1', prompt: 'pixel art pine tree icon, tall triangular green conifer, narrow' },
  { key: 'pine-2', prompt: 'pixel art christmas tree icon, layered green triangle shape, brown trunk' },
  { key: 'bush-1', prompt: 'pixel art green round bush, small hedge ball, leaves only' },
  { key: 'bush-2', prompt: 'pixel art hedge icon, small green bush with yellow flowers' },
  { key: 'rock-1', prompt: 'pixel art mountain, tiny gray cliff, jagged terrain piece' },
  { key: 'rock-2', prompt: 'pixel art barrel, wooden barrel with metal bands, brown' },
  { key: 'fountain-1', prompt: 'pixel art fountain icon, stone basin with blue water jet' },
  { key: 'bench-1', prompt: 'pixel art bench icon, wooden park bench, brown planks' },
  // Construction stages
  { key: 'construction-1', prompt: 'pixel art construction site icon, wooden foundation frame, dirt pile, building start' },
  { key: 'construction-2', prompt: 'pixel art half built house icon, wooden scaffolding, brick walls halfway, under construction' },
  { key: 'construction-3', prompt: 'pixel art almost finished house icon, scaffolding with nearly complete walls and roof frame' },
];

async function switchModel(modelName: string): Promise<boolean> {
  try {
    // Get current model
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
 * Score a candidate: process bg removal, then count non-transparent pixels.
 * Higher score = more subject content = better.
 * Also penalize very dark images (likely failed bg removal).
 */
async function scoreCandidate(rawBuffer: Buffer): Promise<{ score: number; processed: Buffer }> {
  const transparent = await removeBackground(rawBuffer);
  const { data, info } = await sharp(transparent).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  let opaquePixels = 0;
  let totalBright = 0;
  for (let i = 0; i < width * height; i++) {
    const idx = i * channels;
    if (data[idx + 3] > 128) {
      opaquePixels++;
      totalBright += (data[idx] + data[idx + 1] + data[idx + 2]) / 3;
    }
  }

  const totalPixels = width * height;
  const fillRatio = opaquePixels / totalPixels;

  // Sweet spot: 5-40% fill. Too little = mostly empty, too much = bg not removed
  let score = opaquePixels;
  if (fillRatio > 0.5) score *= 0.3; // penalize if bg removal failed
  if (fillRatio < 0.02) score *= 0.1; // penalize if nearly empty

  // Penalize very dark images (avg brightness of opaque pixels)
  if (opaquePixels > 0) {
    const avgBright = totalBright / opaquePixels;
    if (avgBright < 40) score *= 0.2; // very dark = bad
  }

  return { score, processed: transparent };
}

/**
 * Remove background via flood-fill from edges.
 * We prompt for white background, so assume white (255,255,255) as the target.
 * Also do a second pass with the actual detected corner color in case SD
 * produced a slightly off-white or colored background.
 */
async function removeBackground(inputBuffer: Buffer): Promise<Buffer> {
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  // Sample top-left corner only (most reliable for bg detection)
  const s = 16;
  let rS = 0, gS = 0, bS = 0;
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const idx = (y * width + x) * channels;
      rS += data[idx]; gS += data[idx + 1]; bS += data[idx + 2];
    }
  }
  const n = s * s;
  const detR = Math.round(rS / n);
  const detG = Math.round(gS / n);
  const detB = Math.round(bS / n);

  console.log(`    detected corner: rgb(${detR},${detG},${detB})`);

  // Use white as primary bg assumption; detected corner as secondary
  // Pick whichever is closer to white (brighter = more likely actual bg)
  const detBright = (detR + detG + detB) / 3;
  const bgR = detBright > 200 ? detR : 255;
  const bgG = detBright > 200 ? detG : 255;
  const bgB = detBright > 200 ? detB : 255;

  console.log(`    bg color: rgb(${bgR},${bgG},${bgB})`);

  const tolerance = 60;
  const output = Buffer.from(data);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];

  for (let x = 0; x < width; x++) {
    stack.push(x);
    stack.push((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y++) {
    stack.push(y * width);
    stack.push(y * width + width - 1);
  }

  while (stack.length > 0) {
    const pos = stack.pop()!;
    if (visited[pos]) continue;
    visited[pos] = 1;

    const idx = pos * channels;
    const dr = Math.abs(output[idx] - bgR);
    const dg = Math.abs(output[idx + 1] - bgG);
    const db = Math.abs(output[idx + 2] - bgB);
    const dist = Math.sqrt(dr * dr + dg * dg + db * db);

    if (dist < tolerance) {
      output[idx + 3] = 0;
      const px = pos % width;
      const py = Math.floor(pos / width);
      if (px > 0) stack.push(pos - 1);
      if (px < width - 1) stack.push(pos + 1);
      if (py > 0) stack.push(pos - width);
      if (py < height - 1) stack.push(pos + width);
    }
  }

  return sharp(output, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Trim transparent pixels, then resize to fit within OUT_SIZE x OUT_SIZE centered.
 */
async function trimAndResize(imageBuffer: Buffer, key: string): Promise<void> {
  const trimmed = await sharp(imageBuffer).trim().toBuffer();

  const resized = await sharp(trimmed)
    .resize(OUT_SIZE, OUT_SIZE, { fit: 'inside', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();

  // Center on transparent canvas
  const meta = await sharp(resized).metadata();
  const padX = Math.floor((OUT_SIZE - (meta.width || OUT_SIZE)) / 2);
  const padY = Math.floor((OUT_SIZE - (meta.height || OUT_SIZE)) / 2);

  const final = await sharp({
    create: { width: OUT_SIZE, height: OUT_SIZE, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: resized, left: padX, top: padY }])
    .png()
    .toBuffer();

  const outPath = path.join(OUTPUT_DIR, `${key}.png`);
  fs.writeFileSync(outPath, final);
  const stat = fs.statSync(outPath);
  console.log(`  ✓ ${key}.png (${(stat.size / 1024).toFixed(1)}KB, ${OUT_SIZE}x${OUT_SIZE})`);
}

async function main() {
  console.log('Generating isometric decoration sprites...');
  console.log(`SD API: ${SD_API_URL}`);
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`Sprite size: ${OUT_SIZE}x${OUT_SIZE}`);
  console.log(`Target model: ${PIXNITE_MODEL}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Switch to PixNite model, remember original to restore later
  const originalModel = await getCurrentModel();
  console.log(`Current model: ${originalModel}`);

  const switched = await switchModel(PIXNITE_MODEL);
  if (!switched) {
    console.error(`\nFailed to switch to ${PIXNITE_MODEL}.`);
    console.error('Make sure the model file is in stable-diffusion-webui-forge/models/Stable-diffusion/');
    process.exit(1);
  }

  let success = 0;
  let failed = 0;

  for (const deco of DECORATIONS) {
    const outPath = path.join(OUTPUT_DIR, `${deco.key}.png`);

    // Skip if already generated (delete file to regenerate)
    if (fs.existsSync(outPath)) {
      console.log(`  [skip] ${deco.key}.png already exists`);
      success++;
      continue;
    }

    console.log(`Generating "${deco.key}" (${BATCH_SIZE} candidates)...`);
    const candidates = await callSD(deco.prompt);

    if (candidates.length === 0) {
      console.error(`  ✗ Failed to generate ${deco.key}`);
      failed++;
      continue;
    }

    // Score all candidates and pick the best
    let bestScore = -1;
    let bestProcessed: Buffer | null = null;
    let bestIdx = 0;

    for (let i = 0; i < candidates.length; i++) {
      const { score, processed } = await scoreCandidate(candidates[i]);
      console.log(`    candidate ${i + 1}: score=${score.toFixed(0)}`);
      if (score > bestScore) {
        bestScore = score;
        bestProcessed = processed;
        bestIdx = i;
      }
    }

    console.log(`    → picked candidate ${bestIdx + 1}`);

    // Save raw for debugging
    const rawPath = path.join(OUTPUT_DIR, `${deco.key}-raw.png`);
    fs.writeFileSync(rawPath, candidates[bestIdx]);

    // Trim and resize the best candidate
    await trimAndResize(bestProcessed!, deco.key);
    success++;
  }

  // Restore original model
  if (originalModel && originalModel !== PIXNITE_MODEL) {
    console.log(`\nRestoring original model: ${originalModel}`);
    await switchModel(originalModel);
  }

  console.log(`\nDone! ${success} succeeded, ${failed} failed.`);
  if (failed > 0) {
    console.log('Re-run the script to retry failed decorations.');
    process.exit(1);
  }
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
