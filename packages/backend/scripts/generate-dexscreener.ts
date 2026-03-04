/**
 * Generate DexScreener token image (400x400) and banner (1500x500)
 * matching the isometric pixel art town style.
 *
 * Usage: tsx scripts/generate-dexscreener.ts
 *
 * Generates multiple variations of each, saved to packages/frontend/public/assets/dexscreener/
 * Pick your favorites and upload to DexScreener.
 */
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';
const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/dexscreener');
const VARIATIONS = 3; // generate N variations of each

// ── TOKEN IMAGE (400x400, square, will be circular-cropped by DexScreener) ──

const TOKEN_PROMPTS = [
  // Clawd mascot — lobster character in pixel art
  'cute chibi pixel art lobster mascot character with big claws, red lobster standing upright waving, friendly cartoon mascot, bold dark outlines, clean pixel art, 16-bit style, isometric tiny medieval town buildings in background, teal ocean background, game character sprite',
  // Clawd on island — matches the game view
  'pixel art isometric view of a small island town with colorful tiny buildings and roads, surrounded by teal ocean water, cute red lobster mascot character standing in the center, bird eye view, 16-bit retro game style, clean flat pixel art, miniature town',
  // Logo-style — lobster + town icon
  'pixel art red lobster mascot character holding a tiny isometric building, cute cartoon chibi style, bold outlines, 16-bit game art, dark teal background with pixel stars, centered character, game logo mascot sprite',
];

const TOKEN_NEGATIVE = '3d render, realistic, photograph, blurry, low quality, text, watermark, letters, words, logo text, UI elements, multiple characters, nsfw, real animal, real lobster, seafood, food, plate, cooking';

const TOKEN_SD_SETTINGS = {
  width: 512,
  height: 512,
  steps: 35,
  cfg_scale: 9,
  sampler_name: 'DPM++ 2M Karras',
  batch_size: 1,
  n_iter: 1,
};

const TOKEN_STYLE_SUFFIX = '<lora:pixelartredmond-1-5v:0.75> PIXARFK, Pixel Art, clean pixel art, 16-bit style, bold dark outlines, vibrant colors, centered composition, game art';

// ── BANNER (1500x500, 3:1 wide) ──
// SD 1.5 works best at multiples of 64. We generate at 768x256 (3:1) and upscale.

const BANNER_PROMPTS = [
  // Wide isometric town panorama
  'pixel art isometric panoramic view of a fantasy medieval town on a green island, many small colorful buildings with red blue and purple roofs, winding roads, surrounded by teal ocean water, tiny pixel trees and decorations, 16-bit retro game style, clean flat pixel art, bird eye view, wide landscape',
  // Town skyline with branding space
  'pixel art isometric medieval town buildings in a row from small shack to grand castle, progression of building sizes left to right, dark teal background with subtle pixel grid, 16-bit retro game style, clean flat pixel art, wide panoramic composition, game art banner',
  // Ocean + island wide shot
  'wide pixel art panoramic scene of a small isometric island town surrounded by teal pixel ocean, the island has colorful medieval buildings connected by roads, green grass areas, tiny trees, 16-bit retro style, bird eye isometric view, clean flat shading, vibrant colors',
];

const BANNER_NEGATIVE = '3d render, realistic, photograph, blurry, low quality, text, watermark, letters, words, UI, character, person, creature, portrait, face, close-up, nsfw';

const BANNER_SD_SETTINGS = {
  width: 768,
  height: 256,
  steps: 35,
  cfg_scale: 9,
  sampler_name: 'DPM++ 2M Karras',
  batch_size: 1,
  n_iter: 1,
};

const BANNER_STYLE_SUFFIX = '<lora:pixelartredmond-1-5v:0.75> <lora:Isometric_Setting:0.7> PIXARFK, Pixel Art, Isometric_Setting, isometric pixel art, 16-bit style, clean flat shading, game art, wide panoramic composition';

// ── SD API ──

async function callSD(
  prompt: string,
  negativePrompt: string,
  settings: Record<string, any>,
): Promise<Buffer | null> {
  const body = {
    prompt,
    negative_prompt: negativePrompt,
    ...settings,
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
      console.error(`  SD API returned ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return null;
    }

    const data: any = await response.json();
    const images: string[] = data.images;
    if (!images || images.length === 0) {
      console.error('  SD API returned no images');
      return null;
    }

    return Buffer.from(images[0], 'base64');
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') {
      console.error('  SD API timed out (120s)');
    } else {
      console.error(`  SD API error: ${err.message}`);
    }
    return null;
  }
}

// ── MAIN ──

async function main() {
  console.log('=== Generating DexScreener Assets ===');
  console.log(`Output: ${OUTPUT_DIR}`);
  console.log(`SD API: ${SD_API_URL}`);
  console.log(`Variations per prompt: ${VARIATIONS}\n`);

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

  // ── Generate Token Images ──
  console.log('── Token Images (400x400) ──\n');

  for (let p = 0; p < TOKEN_PROMPTS.length; p++) {
    for (let v = 0; v < VARIATIONS; v++) {
      const label = `token-v${p + 1}-${v + 1}`;
      console.log(`[${label}] Generating...`);
      console.log(`  Prompt: ${TOKEN_PROMPTS[p].slice(0, 70)}...`);

      const fullPrompt = `${TOKEN_PROMPTS[p]}, ${TOKEN_STYLE_SUFFIX}`;
      const rawBuffer = await callSD(fullPrompt, TOKEN_NEGATIVE, TOKEN_SD_SETTINGS);
      if (!rawBuffer) {
        console.error(`  FAILED — skipping\n`);
        continue;
      }

      // Resize to 400x400 for DexScreener
      const resized = await sharp(rawBuffer)
        .resize(400, 400, { kernel: sharp.kernel.nearest })
        .png()
        .toBuffer();

      const filename = `${label}.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), resized);
      console.log(`  Saved: ${filename} (${Math.round(resized.length / 1024)}KB)\n`);
    }
  }

  // ── Generate Banners ──
  console.log('\n── Banners (1500x500) ──\n');

  for (let p = 0; p < BANNER_PROMPTS.length; p++) {
    for (let v = 0; v < VARIATIONS; v++) {
      const label = `banner-v${p + 1}-${v + 1}`;
      console.log(`[${label}] Generating...`);
      console.log(`  Prompt: ${BANNER_PROMPTS[p].slice(0, 70)}...`);

      const fullPrompt = `${BANNER_PROMPTS[p]}, ${BANNER_STYLE_SUFFIX}`;
      const rawBuffer = await callSD(fullPrompt, BANNER_NEGATIVE, BANNER_SD_SETTINGS);
      if (!rawBuffer) {
        console.error(`  FAILED — skipping\n`);
        continue;
      }

      // Upscale to 1500x500 using nearest-neighbor to preserve pixel art sharpness
      const resized = await sharp(rawBuffer)
        .resize(1500, 500, { kernel: sharp.kernel.nearest })
        .png()
        .toBuffer();

      const filename = `${label}.png`;
      fs.writeFileSync(path.join(OUTPUT_DIR, filename), resized);
      console.log(`  Saved: ${filename} (${Math.round(resized.length / 1024)}KB)\n`);
    }
  }

  // ── Summary ──
  console.log('\n=== Done! ===');
  const files = fs.readdirSync(OUTPUT_DIR).filter(f => f.endsWith('.png'));
  console.log(`Generated ${files.length} images in ${OUTPUT_DIR}:`);
  for (const f of files) {
    const stats = fs.statSync(path.join(OUTPUT_DIR, f));
    console.log(`  ${f} (${Math.round(stats.size / 1024)} KB)`);
  }
  console.log('\nPick your favorites and upload to DexScreener!');
  console.log('  Token image: 400x400 (circular crop)');
  console.log('  Banner: 1500x500');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
