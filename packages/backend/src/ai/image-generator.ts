import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { log } from '../utils/logger';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

// LoRA trigger: <lora:pixelartredmond-1-5v:0.85> with trigger word "Pixel Art" / "PIXARFK"
const STYLE_SUFFIX = '<lora:Isometric_Setting:0.95> <lora:pixelartredmond-1-5v:0.65> Isometric_Setting, PIXARFK, Pixel Art, isometric view, single building only, plain solid white background, clean pixel art, 16-bit style, centered, game asset, isolated object, no ground, no floor, no terrain, no trees, no environment, floating building, nothing beneath, nothing around';
const NEGATIVE_PROMPT = '3d render, realistic, photograph, blurry, low quality, text, watermark, multiple buildings, multiple structures, tileset, sprite sheet, many objects, front view, side view, top down, first person, close-up, cropped, interior, zoomed in, detailed background, gradient, sky, clouds, sun, horizon, landscape, scenery, people, characters, ground texture, dirt, sand, desert, ground, floor, terrain, grass, path, pavement, road, platform, base, pedestal, foundation visible, trees, tree, bushes, flowers, garden, fence, yard, pond, lake, river, water, rocks, hill, mountain, forest, nature, environment, surroundings';

const SD_SETTINGS = {
  width: 512,
  height: 512,
  steps: 28,
  cfg_scale: 9,
  sampler_name: 'DPM++ 2M Karras',
};

// Output directory for generated images
const OUTPUT_DIR = path.resolve(__dirname, '../../../..', 'packages/frontend/public/generated');

// Sequential processing queue
let processing = false;
const queue: Array<{ resolve: (url: string | null) => void; prompt: string; address: string }> = [];

async function processQueue(): Promise<void> {
  if (processing || queue.length === 0) return;
  processing = true;

  while (queue.length > 0) {
    const job = queue.shift()!;
    try {
      const url = await generateImageDirect(job.prompt, job.address);
      job.resolve(url);
    } catch (err) {
      log.error(`Image generation failed for ${job.address.slice(0, 8)}...:`, err);
      job.resolve(null);
    }
  }

  processing = false;
}

/**
 * Remove the solid background from a generated building image.
 * Samples all 4 corners, picks the most common color cluster as background,
 * then makes matching pixels transparent via flood-fill from edges.
 */
async function removeBackground(inputBuffer: Buffer): Promise<Buffer> {
  try {
    const image = sharp(inputBuffer).ensureAlpha();
    const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
    const { width, height, channels } = info;

    // Sample 4 corners (8x8 each) to find background color candidates
    const s = 8;
    const corners = [
      { x0: 0, y0: 0 },                         // top-left
      { x0: width - s, y0: 0 },                  // top-right
      { x0: 0, y0: height - s },                 // bottom-left
      { x0: width - s, y0: height - s },          // bottom-right
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

    // Find the two most similar corners — those are likely both background
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

    log.info(`Background color detected: rgb(${bgR},${bgG},${bgB})`);

    // Flood-fill from all edge pixels that match the background color
    const tolerance = 55;
    const output = Buffer.from(data);
    const visited = new Uint8Array(width * height);
    const stack: number[] = [];

    // Seed with all edge pixels
    for (let x = 0; x < width; x++) {
      stack.push(x); // top row
      stack.push((height - 1) * width + x); // bottom row
    }
    for (let y = 1; y < height - 1; y++) {
      stack.push(y * width); // left col
      stack.push(y * width + width - 1); // right col
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
        output[idx + 3] = 0; // make transparent
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
  } catch (err) {
    log.error('Background removal failed, returning original image:', err);
    return sharp(inputBuffer).png().toBuffer();
  }
}

function colorDist(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

async function generateImageDirect(prompt: string, walletAddress: string): Promise<string | null> {
  const fullPrompt = `${prompt}, ${STYLE_SUFFIX}`;

  const body = {
    prompt: fullPrompt,
    negative_prompt: NEGATIVE_PROMPT,
    ...SD_SETTINGS,
    batch_size: 1,
    n_iter: 1,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const response = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error(`SD API returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const data: any = await response.json();
    const images: string[] = data.images;
    if (!images || images.length === 0) {
      log.error('SD API returned no images');
      return null;
    }

    // Decode, remove background, and save as transparent PNG
    const rawBuffer = Buffer.from(images[0], 'base64');
    const imageBuffer = await removeBackground(rawBuffer);
    const filename = `${walletAddress}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);

    // Ensure output directory exists
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    fs.writeFileSync(filepath, imageBuffer);

    const relativeUrl = `/generated/${filename}`;
    log.info(`Generated image for ${walletAddress.slice(0, 8)}... → ${relativeUrl}`);
    return relativeUrl;
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      log.error('SD API request timed out (60s)');
    } else {
      throw err;
    }
    return null;
  }
}

export async function generateBuildingImage(
  imagePrompt: string,
  walletAddress: string
): Promise<string | null> {
  if (!isSDEnabled()) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    queue.push({ resolve, prompt: imagePrompt, address: walletAddress });
    processQueue();
  });
}

export function isSDEnabled(): boolean {
  const enabled = process.env.SD_ENABLED === 'true';
  return enabled;
}

export async function checkSDHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${SD_API_URL}/sdapi/v1/progress`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return response.ok;
  } catch {
    return false;
  }
}
