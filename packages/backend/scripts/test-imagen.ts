import 'dotenv/config';
import path from 'path';
import fs from 'fs';
import { GoogleAuth } from 'google-auth-library';

const PROJECT = process.env.GOOGLE_CLOUD_PROJECT || 'clawdtown';
const REGION = process.env.GOOGLE_CLOUD_REGION || 'us-east5';
const MODEL = 'imagen-3.0-generate-002';
const ENDPOINT = `https://${REGION}-aiplatform.googleapis.com/v1/projects/${PROJECT}/locations/${REGION}/publishers/google/models/${MODEL}:predict`;

const STYLE_SUFFIX = 'isometric pixel art, single isolated building floating in empty white void, game asset sprite, 16-bit style, centered, pure white background, no ground, no grass, no platform, no base, no floor, no terrain, no environment, no trees, no people, no text, no shadow on ground';

const BUILDINGS = [
  'A medieval stone blacksmith forge with a smoking chimney and anvil visible through an open doorway',
  'A cozy wooden tavern with warm glowing windows and a hanging sign',
  'A tall wizard tower made of dark purple crystal with glowing runes',
];

async function main() {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  const accessToken = typeof token === 'string' ? token : token.token;

  const outDir = path.resolve(__dirname, '../../../packages/frontend/public/generated');
  fs.mkdirSync(outDir, { recursive: true });

  for (let i = 0; i < BUILDINGS.length; i++) {
    const prompt = `${BUILDINGS[i]}, ${STYLE_SUFFIX}`;
    console.log(`\n[${i + 1}/${BUILDINGS.length}] Generating: ${BUILDINGS[i].slice(0, 60)}...`);

    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: 1, aspectRatio: '1:1' },
    };

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`  ERROR ${response.status}: ${text.slice(0, 200)}`);
      continue;
    }

    const data: any = await response.json();
    if (!data.predictions?.length) {
      console.error('  No predictions returned');
      continue;
    }

    const imageBuffer = Buffer.from(data.predictions[0].bytesBase64Encoded, 'base64');
    const outPath = path.join(outDir, `test-imagen-${i + 1}.png`);
    fs.writeFileSync(outPath, imageBuffer);
    console.log(`  Saved: ${outPath} (${(imageBuffer.length / 1024).toFixed(0)}KB)`);

    // Small delay to avoid rate limiting
    if (i < BUILDINGS.length - 1) {
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  console.log('\nDone!');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
