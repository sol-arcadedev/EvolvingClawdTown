// ── Binary tilemap encoding for frontend ──────────────────────────
// 4 bytes/tile = 256KB for 256x256, gzips to ~30-50KB.
//
// Byte 0: terrain(2b) | district(3b) | road(2b) | hasBuilding(1b)
// Byte 1: elevation (0-255)
// Byte 2-3: building index (uint16, little-endian)

import { TownState, Building, DISTRICT_NAMES, TERRAIN_NAMES } from './types';

export function encodeTilemap(state: TownState): Buffer {
  const { map } = state;
  const { width, height, tiles } = map;
  const buf = Buffer.alloc(width * height * 4);

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    const off = i * 4;

    // Byte 0: terrain(2b) | district(3b) | road(2b) | hasBuilding(1b)
    const byte0 =
      (t.terrain & 0x03) |
      ((t.district & 0x07) << 2) |
      ((t.road & 0x03) << 5) |
      ((t.buildingId > 0 ? 1 : 0) << 7);

    buf[off] = byte0;
    buf[off + 1] = t.elevation & 0xff;
    buf.writeUInt16LE(t.buildingId & 0xffff, off + 2);
  }

  return buf;
}

export interface EncodedBuilding {
  id: number;
  archetypeId: string;
  originX: number;
  originY: number;
  rotation: number;
  district: string;
  plotId: string;
  ownerAddress: string | null;
  buildingName: string | null;
  customImageUrl: string | null;
  imagePrompt: string | null;
}

export function encodeBuildingList(state: TownState): EncodedBuilding[] {
  const result: EncodedBuilding[] = [];

  for (let i = 1; i < state.buildings.length; i++) {
    const b = state.buildings[i];
    result.push({
      id: b.id,
      archetypeId: b.archetypeId,
      originX: b.originX,
      originY: b.originY,
      rotation: b.rotation,
      district: DISTRICT_NAMES[b.district] || 'none',
      plotId: b.plotId,
      ownerAddress: b.ownerAddress,
      buildingName: b.buildingName,
      customImageUrl: b.customImageUrl,
      imagePrompt: b.imagePrompt,
    });
  }

  return result;
}

export function decodeTilemapByte0(byte0: number) {
  return {
    terrain: byte0 & 0x03,
    district: (byte0 >> 2) & 0x07,
    road: (byte0 >> 5) & 0x03,
    hasBuilding: (byte0 >> 7) & 0x01,
  };
}

export interface EncodedDecoration {
  x: number;
  y: number;
  type: number; // 1=tree, 2=bush, 3=rock, 4=fountain, 5=bench
}

export function encodeDecorationList(state: TownState): EncodedDecoration[] {
  const result: EncodedDecoration[] = [];
  const { map } = state;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y * map.width + x];
      if (t.clusterId > 0 && t.clusterId <= 7) {
        result.push({ x, y, type: t.clusterId });
      }
    }
  }

  return result;
}

export interface TownSnapshot {
  width: number;
  height: number;
  tilemap: Buffer;
  buildings: EncodedBuilding[];
  decorations: EncodedDecoration[];
  seed: number;
}

export function createTownSnapshot(state: TownState): TownSnapshot {
  return {
    width: state.map.width,
    height: state.map.height,
    tilemap: encodeTilemap(state),
    buildings: encodeBuildingList(state),
    decorations: encodeDecorationList(state),
    seed: state.seed,
  };
}
