import { Assets, Texture, Rectangle } from 'pixi.js';

import housesUrl from '../assets/sprites/houses.png';
import constructionUrl from '../assets/sprites/construction.png';
import damageUrl from '../assets/sprites/damage_overlay.png';
import propsUrl from '../assets/sprites/props.png';

const FRAME_W = 192;
const FRAME_H = 288;

let houseFrames: Texture[] = [];
let constructionFrames: Texture[] = [];
let damageFrames: Texture[] = [];
let propFrames: Texture[] = [];
let loaded = false;

function extractFrames(baseTexture: Texture, count: number): Texture[] {
  const frames: Texture[] = [];
  for (let i = 0; i < count; i++) {
    frames.push(
      new Texture({
        source: baseTexture.source,
        frame: new Rectangle(i * FRAME_W, 0, FRAME_W, FRAME_H),
      }),
    );
  }
  return frames;
}

export async function loadSpriteAssets(): Promise<void> {
  if (loaded) return;

  const [houses, construction, damage, props] = await Promise.all([
    Assets.load(housesUrl),
    Assets.load(constructionUrl),
    Assets.load(damageUrl),
    Assets.load(propsUrl),
  ]);

  houseFrames = extractFrames(houses, 5);
  constructionFrames = extractFrames(construction, 4);
  damageFrames = extractFrames(damage, 3);
  propFrames = extractFrames(props, 4);
  loaded = true;
}

/** Get house tier texture (tier 1-5 maps to index 0-4) */
export function getHouseTexture(tier: number): Texture | null {
  const idx = Math.max(0, Math.min(4, tier - 1));
  return houseFrames[idx] ?? null;
}

/** Get construction frame texture (frame 0-3) */
export function getConstructionTexture(frame: number): Texture | null {
  return constructionFrames[Math.max(0, Math.min(3, frame))] ?? null;
}

/** Get damage overlay texture (stage 1-3 maps to index 0-2) */
export function getDamageTexture(stage: number): Texture | null {
  const idx = Math.max(0, Math.min(2, stage - 1));
  return damageFrames[idx] ?? null;
}

/** Get prop texture (0=lamp, 1=billboard, 2=tree, 3=road) */
export function getPropTexture(index: number): Texture | null {
  return propFrames[Math.max(0, Math.min(3, index))] ?? null;
}

export function isLoaded(): boolean {
  return loaded;
}
