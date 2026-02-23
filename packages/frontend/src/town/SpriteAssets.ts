import { Assets, Texture, Rectangle } from 'pixi.js';

import housesUrl from '../assets/sprites/houses.png';
import constructionUrl from '../assets/sprites/construction.png';
import damageUrl from '../assets/sprites/damage_overlay.png';
import propsUrl from '../assets/sprites/props.png';
import mascotsUrl from '../assets/sprites/mascots.png';
import mascots2Url from '../assets/sprites/mascots2.png';
import mascots3Url from '../assets/sprites/mascots3.png';

const FRAME_W = 192;
const FRAME_H = 288;

let houseFrames: Texture[] = [];
let constructionFrames: Texture[] = [];
let damageFrames: Texture[] = [];
let propFrames: Texture[] = [];
let mascotFrames: Texture[] = [];  // jellyfish, robot
let mascot2Frames: Texture[] = []; // cyber sponge, neon starfish, cyber squirrel
let mascot3Frames: Texture[] = []; // cyber microbe
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

  const [houses, construction, damage, props, mascots, mascots2, mascots3] = await Promise.all([
    Assets.load(housesUrl),
    Assets.load(constructionUrl),
    Assets.load(damageUrl),
    Assets.load(propsUrl),
    Assets.load(mascotsUrl),
    Assets.load(mascots2Url),
    Assets.load(mascots3Url),
  ]);

  houseFrames = extractFrames(houses, 5);
  constructionFrames = extractFrames(construction, 4);
  damageFrames = extractFrames(damage, 3);
  propFrames = extractFrames(props, 4);
  mascotFrames = extractFrames(mascots, 2);
  mascot2Frames = extractFrames(mascots2, 3);
  mascot3Frames = extractFrames(mascots3, 1);
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

/** Get mascot texture (0=jellyfish, 1=robot, 2=cyber sponge, 3=neon starfish, 4=cyber squirrel, 5=cyber microbe) */
export function getMascotTexture(index: number): Texture | null {
  if (index <= 1) return mascotFrames[Math.max(0, index)] ?? null;
  if (index <= 4) return mascot2Frames[Math.max(0, Math.min(2, index - 2))] ?? null;
  return mascot3Frames[0] ?? null;
}

export function isLoaded(): boolean {
  return loaded;
}
