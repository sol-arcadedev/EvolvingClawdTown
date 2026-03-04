import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

const STYLE_SUFFIX = '<lora:isometric_game_assets:0.8> <lora:Isometric_Setting:0.9> <lora:white_background:3.0> game isometric, Isometric_Setting, isometric house, architecture building with walls and roof, 3d render, 45 degree isometric top-down 3/4 view, single building centered, plain solid white background, game asset, isolated building on white, miniature architecture';
const NEGATIVE_PROMPT = 'pixel art, pixelated, 8-bit, 16-bit, retro, voxel, cartoon, anime, sketch, drawing, painting, watercolor, flat shading, clipart, interior view, cutaway, cross-section, furniture, object, character, creature, person, abstract, sculpture, blurry, low quality, text, watermark, multiple buildings, front view, side view, eye level, first person, close-up, cropped, zoomed in, low angle, high angle, bird eye view, sky, clouds, landscape, scenery, people, ground, floor, terrain, grass, trees, bushes, flowers, garden, water, rocks, hill, mountain, forest, nature, environment, surroundings';

const BUILDINGS = [
  'A medieval stone blacksmith forge with a smoking chimney and anvil visible through an open doorway',
  'A cozy wooden tavern with warm glowing windows and a hanging sign',
  'A tall wizard tower made of dark purple crystal with glowing runes',
  'A small thatched-roof cottage with flower boxes in the windows',
  'A grand stone cathedral with stained glass windows and a bell tower',
  'A wooden windmill with spinning blades on a small hill',
  'A Japanese-style pagoda temple with red pillars and curved roof',
  'A spooky haunted mansion with broken windows and bats',
  'A futuristic neon cyberpunk shop with holographic signs',
  'A rustic farmhouse with a red barn and hay bales',
  'A dwarven stone fortress with iron gates and torch sconces',
  'A colorful candy shop made of gingerbread and frosting',
  'A pirate shipwreck converted into a beach bar',
  'An elven treehouse with glowing lanterns and vine bridges',
  'A steampunk clocktower with spinning gears and steam pipes',
  'A desert sandstone marketplace with colorful fabric awnings',
  'A frozen ice palace with crystal spires and aurora glow',
  'A mushroom house with spotted red cap and round door',
  'A lighthouse on rocky cliff with bright spinning beacon',
  'A viking longhouse with carved dragon heads and smoke hole',
];

const ALWAYSON_SCRIPTS = {
  LayerDiffuse: {
    args: [
      true,
      '(SD1.5) Only Generate Transparent Image (Attention Injection)',
      1.0, 1.0, null, null, null,
      'Crop and Resize', false, '', '', '',
    ],
  },
};

async function main() {
  const outDir = path.resolve(__dirname, '../../../packages/frontend/public/generated/batch-test-v4');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`Generating ${BUILDINGS.length} buildings with LayerDiffuse + LoRAs...\n`);

  for (let i = 0; i < BUILDINGS.length; i++) {
    const label = `[${i + 1}/${BUILDINGS.length}]`;
    console.log(`${label} ${BUILDINGS[i].slice(0, 65)}...`);

    const body = {
      prompt: `${BUILDINGS[i]}, ${STYLE_SUFFIX}`,
      negative_prompt: NEGATIVE_PROMPT,
      width: 512, height: 512, steps: 28, cfg_scale: 9,
      sampler_name: 'DPM++ 2M Karras',
      batch_size: 1, n_iter: 1,
      alwayson_scripts: ALWAYSON_SCRIPTS,
    };

    try {
      const res = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        console.error(`  ERROR ${res.status}: ${(await res.text()).slice(0, 150)}`);
        continue;
      }

      const data: any = await res.json();
      const images: string[] = data.images;
      const buf = Buffer.from(images[0], 'base64');

      // Check transparency
      const { data: raw, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      let transparent = 0;
      const total = info.width * info.height;
      for (let p = 0; p < total; p++) {
        if (raw[p * info.channels + 3] === 0) transparent++;
      }
      const pct = (transparent / total * 100).toFixed(1);

      const slug = BUILDINGS[i].slice(0, 40).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
      const filename = `${String(i + 1).padStart(2, '0')}-${slug}.png`;
      fs.writeFileSync(path.join(outDir, filename), buf);
      console.log(`  Saved: ${filename} (${(buf.length / 1024).toFixed(0)}KB, ${pct}% transparent)`);
    } catch (err: any) {
      console.error(`  FAILED: ${err.message}`);
    }
  }

  console.log(`\nDone! Check ${outDir}`);
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
