import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import { GoogleAuth } from 'google-auth-library';
import { log } from '../utils/logger';
import { validateImageWithVision } from './clawd-agent';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

function isLayerDiffuseEnabled(): boolean {
  return process.env.LAYERDIFFUSE_ENABLED === 'true';
}

// Imagen 3 config (Vertex AI)
const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'clawdtown';
const GOOGLE_CLOUD_REGION = process.env.GOOGLE_CLOUD_REGION || 'us-east5';
const IMAGEN_MODEL = 'imagen-3.0-generate-002';
const IMAGEN_ENDPOINT = `https://${GOOGLE_CLOUD_REGION}-aiplatform.googleapis.com/v1/projects/${GOOGLE_CLOUD_PROJECT}/locations/${GOOGLE_CLOUD_REGION}/publishers/google/models/${IMAGEN_MODEL}:predict`;

const googleAuth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});

// LoRA triggers: isometric_game_assets + Isometric_Setting (both strong for isometric miniature buildings)
const STYLE_SUFFIX = '<lora:isometric_game_assets:0.8> <lora:Isometric_Setting:0.9> <lora:white_background:3.0> game isometric, Isometric_Setting, isometric house, architecture building with walls and roof, 3d render, 45 degree isometric top-down 3/4 view, single building centered, plain solid white background, game asset, isolated building on white, miniature architecture';
const NEGATIVE_PROMPT = 'pixel art, pixelated, 8-bit, 16-bit, retro, voxel, cartoon, anime, sketch, drawing, painting, watercolor, flat shading, clipart, interior view, cutaway, cross-section, furniture, object, character, creature, person, abstract, sculpture, blurry, low quality, text, watermark, multiple buildings, front view, side view, eye level, first person, close-up, cropped, zoomed in, low angle, high angle, bird eye view, sky, clouds, landscape, scenery, people, ground, floor, terrain, grass, trees, bushes, flowers, garden, water, rocks, hill, mountain, forest, nature, environment, surroundings';

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

async function validateImageTransparency(imageBuffer: Buffer): Promise<{ pass: boolean; transparencyPct: number }> {
  const { data, info } = await sharp(imageBuffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const totalPixels = width * height;
  let transparentPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    if (data[i * channels + 3] === 0) {
      transparentPixels++;
    }
  }

  const transparencyPct = (transparentPixels / totalPixels) * 100;
  return { pass: transparencyPct >= 25, transparencyPct };
}

// Imagen 3 prompt style (no LoRA triggers or negative prompts needed)
const IMAGEN_STYLE_SUFFIX = 'isometric game asset, single isolated building, 45-degree top-down 3/4 view from the south-east corner looking north-west, fixed camera angle, consistent perspective across all buildings, miniature architecture model, building fills 70% of frame, centered in image, pure white background, no ground, no grass, no platform, no base, no floor, no terrain, no environment, no trees, no people, no text, no shadow on ground';
const IMAGEN_RETRY_BOOST = ', completely isolated floating building with absolutely no ground or grass beneath it, nothing else in the image, building hovering in pure white empty space, exact 45-degree isometric angle';

const MAX_IMAGE_ATTEMPTS = 3;
const RETRY_PROMPT_BOOST = ', completely isolated floating building, absolutely nothing else in the image';

async function callSD(prompt: string): Promise<Buffer | null> {
  const body: Record<string, any> = {
    prompt,
    negative_prompt: NEGATIVE_PROMPT,
    ...SD_SETTINGS,
    batch_size: 1,
    n_iter: 1,
  };

  if (isLayerDiffuseEnabled()) {
    body.alwayson_scripts = {
      LayerDiffuse: {
        args: [
          true,                                                            // enabled
          '(SD1.5) Only Generate Transparent Image (Attention Injection)',  // method
          1.0,                                                             // weight
          1.0,                                                             // ending_step
          null,                                                            // fg_image
          null,                                                            // bg_image
          null,                                                            // blend_image
          'Crop and Resize',                                               // resize_mode
          false,                                                           // output_origin
          '',                                                              // fg_additional_prompt
          '',                                                              // bg_additional_prompt
          '',                                                              // blend_additional_prompt
        ],
      },
    };
    log.info('LayerDiffuse enabled — requesting native transparency');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

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

    // LayerDiffuse: images[0]=transparent PNG, images[1]=checkerboard visualization
    if (isLayerDiffuseEnabled() && images.length >= 2) {
      log.info('Using LayerDiffuse transparent output (images[0])');
    }

    return Buffer.from(images[0], 'base64');
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

async function callImagen(prompt: string): Promise<Buffer | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const client = await googleAuth.getClient();
    const token = await client.getAccessToken();

    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    };

    const response = await fetch(IMAGEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${typeof token === 'string' ? token : token.token}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      log.error(`Imagen API returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const data: any = await response.json();
    const predictions = data.predictions;
    if (!predictions || predictions.length === 0) {
      log.error('Imagen API returned no predictions');
      return null;
    }

    return Buffer.from(predictions[0].bytesBase64Encoded, 'base64');
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      log.error('Imagen API request timed out (60s)');
    } else {
      throw err;
    }
    return null;
  }
}

async function generateImageDirect(prompt: string, walletAddress: string): Promise<string | null> {
  const useImagen = isImagenEnabled();
  let bestAttempt: { buffer: Buffer; transparencyPct: number } | null = null;

  for (let attempt = 1; attempt <= MAX_IMAGE_ATTEMPTS; attempt++) {
    let fullPrompt: string;
    let rawBuffer: Buffer | null;

    if (useImagen) {
      fullPrompt = attempt === 1
        ? `${prompt}, ${IMAGEN_STYLE_SUFFIX}`
        : `${prompt}, ${IMAGEN_STYLE_SUFFIX}${IMAGEN_RETRY_BOOST}`;
      log.info(`Imagen attempt ${attempt}/${MAX_IMAGE_ATTEMPTS} for ${walletAddress.slice(0, 8)}...`);
      rawBuffer = await callImagen(fullPrompt);
      if (!rawBuffer) {
        log.warn(`Attempt ${attempt}: Imagen generation failed, skipping`);
        continue;
      }
    } else {
      fullPrompt = attempt === 1
        ? `${prompt}, ${STYLE_SUFFIX}`
        : `${prompt}, ${STYLE_SUFFIX}${RETRY_PROMPT_BOOST}`;
      log.info(`SD attempt ${attempt}/${MAX_IMAGE_ATTEMPTS} for ${walletAddress.slice(0, 8)}...`);
      rawBuffer = await callSD(fullPrompt);
      if (!rawBuffer) {
        log.warn(`Attempt ${attempt}: SD generation failed, skipping`);
        continue;
      }
    }

    // Skip flood-fill bg removal when LayerDiffuse provides native transparency
    const imageBuffer = (!useImagen && isLayerDiffuseEnabled())
      ? await sharp(rawBuffer).png().toBuffer()
      : await removeBackground(rawBuffer);

    // Layer 1: Transparency check
    const transparency = await validateImageTransparency(imageBuffer);
    log.info(`Attempt ${attempt}: transparency ${transparency.transparencyPct.toFixed(1)}% (need ≥25%)`);

    if (!bestAttempt || transparency.transparencyPct > bestAttempt.transparencyPct) {
      bestAttempt = { buffer: imageBuffer, transparencyPct: transparency.transparencyPct };
    }

    if (!transparency.pass) {
      log.warn(`Attempt ${attempt}: Failed transparency check, retrying...`);
      continue;
    }

    // Layer 2: Gemini Vision validation
    const vision = await validateImageWithVision(imageBuffer);
    log.info(`Attempt ${attempt}: Vision validation ${vision.pass ? 'PASSED' : 'FAILED'} — ${vision.reason}`);

    if (vision.pass) {
      return saveImage(imageBuffer, walletAddress, attempt);
    }

    log.warn(`Attempt ${attempt}: Failed vision validation, retrying...`);
  }

  // All attempts failed — use the best one
  if (bestAttempt) {
    log.warn(`All ${MAX_IMAGE_ATTEMPTS} attempts failed validation, using best attempt (${bestAttempt.transparencyPct.toFixed(1)}% transparent)`);
    return saveImage(bestAttempt.buffer, walletAddress, -1);
  }

  log.error(`All ${MAX_IMAGE_ATTEMPTS} attempts failed for ${walletAddress.slice(0, 8)}...`);
  return null;
}

function saveImage(imageBuffer: Buffer, walletAddress: string, attempt: number): string {
  const filename = `${walletAddress}.png`;
  const filepath = path.join(OUTPUT_DIR, filename);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(filepath, imageBuffer);

  const relativeUrl = `/generated/${filename}`;
  const label = attempt === -1 ? 'best-effort' : `attempt ${attempt}`;
  log.info(`Saved image (${label}) for ${walletAddress.slice(0, 8)}... → ${relativeUrl}`);
  return relativeUrl;
}

export async function generateBuildingImage(
  imagePrompt: string,
  walletAddress: string
): Promise<string | null> {
  if (!isImageGenEnabled()) {
    return null;
  }

  return new Promise<string | null>((resolve) => {
    queue.push({ resolve, prompt: imagePrompt, address: walletAddress });
    processQueue();
  });
}

function isImagenEnabled(): boolean {
  return process.env.IMAGEN_ENABLED === 'true';
}

export function isImageGenEnabled(): boolean {
  return process.env.SD_ENABLED === 'true' || process.env.IMAGEN_ENABLED === 'true';
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
