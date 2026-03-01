/**
 * Generate decoration sprites via Stable Diffusion + LoRAs.
 * Produces small transparent-background sprites for trees, bushes, rocks, etc.
 *
 * Usage: npx tsx scripts/generate-decorations.ts
 */
import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

const LORA_TRIGGERS = '<lora:isometric_game_assets:0.8> <lora:Isometric_Setting:0.9>';
const STYLE_SUFFIX = `${LORA_TRIGGERS} game isometric, Isometric_Setting, isometric game asset, single object, transparent background, isolated`;
const NEGATIVE_PROMPT = 'text, watermark, blurry, low quality, person, character, creature, building, structure, house, UI, HUD, border, frame, ground, terrain, grass, multiple objects';

const SD_SETTINGS = {
  width: 512,
  height: 512,
  steps: 28,
  cfg_scale: 9,
  sampler_name: 'DPM++ 2M Karras',
};

const OUT_SIZE = 48; // 48x48 decoration sprites

const OUTPUT_DIR = path.resolve(__dirname, '../../../packages/frontend/public/assets/decorations');

const DECORATIONS: Array<{ key: string; prompt: string }> = [
  { key: 'tree',     prompt: 'isometric green tree, round canopy, single deciduous tree' },
  { key: 'bush',     prompt: 'isometric green bush, small round shrub, garden hedge' },
  { key: 'rock',     prompt: 'isometric gray stone rock, mossy boulder' },
  { key: 'fountain', prompt: 'isometric stone fountain, water feature, circular basin' },
  { key: 'bench',    prompt: 'isometric wooden park bench, small garden seat' },
];

async function callSD(prompt: string): Promise<Buffer | null> {
  const body: Record<string, any> = {
    prompt: `${prompt}, ${STYLE_SUFFIX}`,
    negative_prompt: NEGATIVE_PROMPT,
    ...SD_SETTINGS,
    batch_size: 1,
  };

  try {
    const res = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error(`SD API error: ${res.status} ${res.statusText}`);
      return null;
    }

    const data = await res.json() as { images?: string[] };
    if (!data.images || data.images.length === 0) return null;

    return Buffer.from(data.images[0], 'base64');
  } catch (err: any) {
    console.error(`SD API call failed: ${err.message}`);
    return null;
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log(`Generating ${DECORATIONS.length} decoration sprites...`);
  console.log(`Output: ${OUTPUT_DIR}`);

  for (const deco of DECORATIONS) {
    const outPath = path.join(OUTPUT_DIR, `${deco.key}.png`);

    if (fs.existsSync(outPath)) {
      console.log(`  [skip] ${deco.key}.png already exists`);
      continue;
    }

    console.log(`  [gen] ${deco.key}: "${deco.prompt}"`);

    const raw = await callSD(deco.prompt);
    if (!raw) {
      console.error(`  [fail] ${deco.key}: SD generation failed`);
      continue;
    }

    // Resize to OUT_SIZE x OUT_SIZE, preserve transparency
    await sharp(raw)
      .resize(OUT_SIZE, OUT_SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(outPath);

    console.log(`  [done] ${deco.key}.png (${OUT_SIZE}x${OUT_SIZE})`);
  }

  console.log('Decoration generation complete!');
}

main().catch(console.error);
