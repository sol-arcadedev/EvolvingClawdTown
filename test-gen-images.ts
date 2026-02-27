// Generate test building images to verify prompt quality
import fs from 'fs';
import path from 'path';

const SD_API_URL = 'http://127.0.0.1:7860';
const STYLE_SUFFIX = '<lora:Isometric_Setting:0.95> <lora:pixelartredmond-1-5v:0.65> Isometric_Setting, PIXARFK, Pixel Art, isometric view, single building, plain solid white background, clean pixel art, 16-bit style, centered, game asset, isolated object';
const NEGATIVE_PROMPT = '3d render, realistic, photograph, blurry, low quality, text, watermark, multiple buildings, multiple structures, tileset, sprite sheet, many objects, front view, side view, top down, first person, close-up, cropped, interior, zoomed in, detailed background, gradient, sky, clouds, sun, horizon, landscape, scenery, people, characters, ground texture, dirt, sand, desert';

const TEST_PROMPTS = [
  { name: 'tier1-shack', prompt: 'a small weathered wooden shack with a crooked chimney and a patched thatch roof' },
  { name: 'tier3-watchtower', prompt: 'a two-story stone watchtower with timber balcony and iron-banded door' },
  { name: 'tier5-castle', prompt: 'a grand castle with ornate marble towers, copper domes, and stained glass windows' },
  { name: 'damaged-cottage', prompt: 'a crumbling stone cottage with cracks in the walls, missing roof tiles, boarded windows, and overgrown vines' },
];

const OUTPUT_DIR = path.resolve(__dirname, 'packages/frontend/public/generated/test');

async function generate(name: string, subjectPrompt: string) {
  const fullPrompt = `${subjectPrompt}, ${STYLE_SUFFIX}`;
  console.log(`\nGenerating "${name}"...`);
  console.log(`  subject: ${subjectPrompt}`);

  const body = {
    prompt: fullPrompt,
    negative_prompt: NEGATIVE_PROMPT,
    width: 512,
    height: 512,
    steps: 28,
    cfg_scale: 9,
    sampler_name: 'DPM++ 2M Karras',
    batch_size: 1,
    n_iter: 1,
  };

  const res = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error(`  FAILED: ${res.status} ${await res.text()}`);
    return;
  }

  const data: any = await res.json();
  const images: string[] = data.images;
  if (!images || images.length === 0) {
    console.error('  FAILED: no images returned');
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const filepath = path.join(OUTPUT_DIR, `${name}.png`);
  fs.writeFileSync(filepath, Buffer.from(images[0], 'base64'));
  console.log(`  Saved: ${filepath}`);
}

async function main() {
  console.log('Generating test building images...\n');
  for (const t of TEST_PROMPTS) {
    await generate(t.name, t.prompt);
  }
  console.log('\nDone! Check images in:', OUTPUT_DIR);
}

main().catch(console.error);
