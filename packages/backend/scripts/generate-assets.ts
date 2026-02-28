/**
 * Generate permanent high-quality assets via local Stable Diffusion API.
 * Outputs to packages/frontend/public/assets/
 *
 * Usage: tsx scripts/generate-assets.ts
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';
const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets');

const SD_SETTINGS = {
  width: 768,
  height: 768,
  steps: 40,
  cfg_scale: 10,
  sampler_name: 'DPM++ 2M Karras',
  batch_size: 1,
  n_iter: 1,
};

// ── GROUND TEXTURE PROMPTS ──

const GROUND_STYLE_SUFFIX =
  '<lora:pixelartredmond-1-5v:0.85> PIXARFK, Pixel Art, seamless texture, top-down view, game texture tile, flat surface, pixel art texture, 16-bit style';

const GROUND_NEGATIVE_PROMPT =
  '3d render, realistic, photograph, blurry, low quality, text, watermark, building, house, structure, character, person, side view, perspective, multiple objects, tileset, sprite sheet, scenery, landscape, sky, depth, 3d objects, shadows';

const GROUND_PROMPTS: Record<number, string> = {
  1: 'seamless top-down pixel art texture of bare brown dirt ground with scattered small pebbles and sparse dead grass patches, earthy soil',
  2: 'seamless top-down pixel art texture of lush green grass meadow with small wildflowers and clover patches, vibrant green lawn',
  3: 'seamless top-down pixel art texture of medieval cobblestone pavement with worn gray stones and green moss growing between cracks',
  4: 'seamless top-down pixel art texture of polished dark granite stone floor with ornate carved geometric patterns along the edges',
  5: 'seamless top-down pixel art texture of luxurious white marble floor with gold inlay patterns and embedded colorful jewels',
};

// ── CLAWD HQ PROMPT ──

const HQ_STYLE_SUFFIX =
  '<lora:Isometric_Setting:0.95> <lora:pixelartredmond-1-5v:0.85> Isometric_Setting, PIXARFK, Pixel Art, isometric view, single building, solid pure white background, white void, clean pixel art, 16-bit style, centered, game asset, isolated object, no ground, no floor, no terrain, floating building, nothing beneath';

const HQ_NEGATIVE_PROMPT =
  '3d render, realistic, photograph, blurry, low quality, text, watermark, multiple buildings, multiple structures, tileset, sprite sheet, many objects, front view, side view, top down, first person, close-up, cropped, interior, zoomed in, detailed background, gradient, sky, clouds, sun, horizon, landscape, scenery, people, characters, ground texture, dirt, sand, desert, ground, floor, terrain, grass, path, pavement, road, platform, base, pedestal, foundation visible, animal, creature, real lobster, real crab, seafood';

const HQ_PROMPT =
  'single grand isometric pixel art castle with lobster-inspired architecture, two massive claw-shaped towers flanking the entrance, copper dome roofs resembling lobster shell plates, tall antennae-like spires, segmented tower structure, red and copper colored ornate palace, golden arched windows, extravagant fantasy castle building';

// ── BACKGROUND REMOVAL ──

function colorDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

async function removeBackground(inputBuffer: Buffer): Promise<Buffer> {
  const image = sharp(inputBuffer).ensureAlpha();
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const s = 8;
  const corners = [
    { x0: 0, y0: 0 },
    { x0: width - s, y0: 0 },
    { x0: 0, y0: height - s },
    { x0: width - s, y0: height - s },
  ];

  const cornerColors: Array<{ r: number; g: number; b: number }> = [];
  for (const { x0, y0 } of corners) {
    let rS = 0, gS = 0, bS = 0;
    for (let y = y0; y < y0 + s; y++) {
      for (let x = x0; x < x0 + s; x++) {
        const idx = (y * width + x) * channels;
        rS += data[idx]; gS += data[idx + 1]; bS += data[idx + 2];
      }
    }
    const n = s * s;
    cornerColors.push({ r: Math.round(rS / n), g: Math.round(gS / n), b: Math.round(bS / n) });
  }

  let bestPair = [0, 1];
  let bestDist = Infinity;
  for (let i = 0; i < cornerColors.length; i++) {
    for (let j = i + 1; j < cornerColors.length; j++) {
      const d = colorDist(cornerColors[i], cornerColors[j]);
      if (d < bestDist) { bestDist = d; bestPair = [i, j]; }
    }
  }
  const bgR = Math.round((cornerColors[bestPair[0]].r + cornerColors[bestPair[1]].r) / 2);
  const bgG = Math.round((cornerColors[bestPair[0]].g + cornerColors[bestPair[1]].g) / 2);
  const bgB = Math.round((cornerColors[bestPair[0]].b + cornerColors[bestPair[1]].b) / 2);

  console.log(`  Background color: rgb(${bgR},${bgG},${bgB})`);

  const tolerance = 55;
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

  return sharp(output, { raw: { width, height, channels } })
    .png()
    .toBuffer();
}

// ── SD API CALL ──

async function generateImage(prompt: string, negativePrompt: string, filename: string, removeBg = true): Promise<void> {
  console.log(`\nGenerating: ${filename}`);
  console.log(`  Prompt: ${prompt.slice(0, 80)}...`);

  const body = {
    prompt,
    negative_prompt: negativePrompt,
    ...SD_SETTINGS,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`SD API returned ${response.status}: ${await response.text()}`);
    }

    const data: any = await response.json();
    const images: string[] = data.images;
    if (!images || images.length === 0) {
      throw new Error('SD API returned no images');
    }

    const rawBuffer = Buffer.from(images[0], 'base64');
    const imageBuffer = removeBg ? await removeBackground(rawBuffer) : await sharp(rawBuffer).png().toBuffer();
    const filepath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(filepath, imageBuffer);
    console.log(`  Saved: ${filepath}`);
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      throw new Error(`SD API timed out for ${filename}`);
    }
    throw err;
  }
}

// ── MAIN ──

async function main() {
  console.log('=== Generating Permanent Assets ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`SD API: ${SD_API_URL}`);
  console.log(`Resolution: ${SD_SETTINGS.width}x${SD_SETTINGS.height}, Steps: ${SD_SETTINGS.steps}\n`);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Check SD health
  try {
    const res = await fetch(`${SD_API_URL}/sdapi/v1/progress`);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    console.log('SD API is reachable.\n');
  } catch {
    console.error('ERROR: Cannot reach SD API at ' + SD_API_URL);
    console.error('Make sure Stable Diffusion WebUI is running.');
    process.exit(1);
  }

  // Generate ground textures (no background removal — textures fill the tile)
  for (let tier = 1; tier <= 5; tier++) {
    const prompt = `${GROUND_PROMPTS[tier]}, ${GROUND_STYLE_SUFFIX}`;
    await generateImage(prompt, GROUND_NEGATIVE_PROMPT, `tier-ground-${tier}.png`, false);
  }

  // Generate Clawd HQ (with background removal)
  const hqFullPrompt = `${HQ_PROMPT}, ${HQ_STYLE_SUFFIX}`;
  await generateImage(hqFullPrompt, HQ_NEGATIVE_PROMPT, 'clawd-hq.png', true);

  console.log('\n=== All assets generated! ===');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`Files in ${OUTPUT_DIR}:`);
  for (const f of files) {
    const stats = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} (${Math.round(stats.size / 1024)} KB)`);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
