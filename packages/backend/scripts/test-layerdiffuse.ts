import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';

const SD_API_URL = process.env.SD_API_URL || 'http://127.0.0.1:7860';

const STYLE_SUFFIX = '<lora:Isometric_Setting:0.95> <lora:pixelartredmond-1-5v:0.65> <lora:isometric_game_assets:0.5> <lora:white_background:3.0> Isometric_Setting, game isometric, PIXARFK, Pixel Art, isometric view, single building only, plain solid white background, clean pixel art, 16-bit style, centered, game asset, isolated object, no ground, no floor, no terrain, no trees, no environment, floating building, nothing beneath, nothing around';
const NEGATIVE_PROMPT = '3d render, realistic, photograph, blurry, low quality, text, watermark, multiple buildings, ground, floor, terrain, grass, trees, environment, surroundings';

const PROMPT = 'A cozy wooden tavern with warm glowing windows and a hanging sign';

async function main() {
  console.log('Testing SD + LayerDiffuse...');
  console.log(`LAYERDIFFUSE_ENABLED=${process.env.LAYERDIFFUSE_ENABLED}`);

  const body: Record<string, any> = {
    prompt: `${PROMPT}, ${STYLE_SUFFIX}`,
    negative_prompt: NEGATIVE_PROMPT,
    width: 512,
    height: 512,
    steps: 28,
    cfg_scale: 9,
    sampler_name: 'DPM++ 2M Karras',
    batch_size: 1,
    n_iter: 1,
    alwayson_scripts: {
      LayerDiffuse: {
        args: [
          true,
          '(SD1.5) Only Generate Transparent Image (Attention Injection)',
          1.0,
          1.0,
          null,
          null,
          null,
          'Crop and Resize',
          false,
          '',
          '',
          '',
        ],
      },
    },
  };

  console.log('Sending request to SD API...');
  const response = await fetch(`${SD_API_URL}/sdapi/v1/txt2img`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    console.error(`SD API returned ${response.status}: ${await response.text()}`);
    process.exit(1);
  }

  const data: any = await response.json();
  const images: string[] = data.images;
  console.log(`SD returned ${images.length} image(s)`);

  const outDir = path.resolve(__dirname, '../../../packages/frontend/public/generated');
  fs.mkdirSync(outDir, { recursive: true });

  // Save all returned images
  for (let i = 0; i < images.length; i++) {
    const buf = Buffer.from(images[i], 'base64');
    const outPath = path.join(outDir, `test-layerdiffuse-${i}.png`);
    fs.writeFileSync(outPath, buf);
    console.log(`  Saved images[${i}]: ${outPath} (${(buf.length / 1024).toFixed(0)}KB)`);

    // Check transparency
    const { data: rawData, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let transparent = 0;
    const total = info.width * info.height;
    for (let p = 0; p < total; p++) {
      if (rawData[p * info.channels + 3] === 0) transparent++;
    }
    const pct = (transparent / total * 100).toFixed(1);
    console.log(`  images[${i}] transparency: ${pct}% (${transparent}/${total} pixels)`);
  }

  console.log('\nDone! Check the output images.');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
