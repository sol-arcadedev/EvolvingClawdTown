// ── Core tilemap drawing: decode, iso math, tile-to-screen ─────

// Tile dimensions for isometric rendering
export const TILE_W = 32;
export const TILE_H = 16;
export const ELEVATION_PX = 4;

// ── Decode binary tilemap buffer ───────────────────────────────

export interface DecodedTile {
  terrain: number;   // 0=water, 1=land, 2=hill, 3=forest
  district: number;  // 0=none .. 7=harbor
  road: number;      // 0=none, 1=main, 2=secondary, 3=local
  hasBuilding: boolean;
  elevation: number; // 0-255
  buildingId: number;
}

export function decodeTilemap(
  buffer: Uint8Array,
  width: number,
  height: number,
): DecodedTile[] {
  const tiles: DecodedTile[] = new Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const byte0 = buffer[off];
    tiles[i] = {
      terrain: byte0 & 0x03,
      district: (byte0 >> 2) & 0x07,
      road: (byte0 >> 5) & 0x03,
      hasBuilding: ((byte0 >> 7) & 0x01) === 1,
      elevation: buffer[off + 1],
      buildingId: buffer[off + 2] | (buffer[off + 3] << 8),
    };
  }

  return tiles;
}

// ── Isometric projection ───────────────────────────────────────

export function tileToScreen(
  tileX: number,
  tileY: number,
  elevation = 0,
): [number, number] {
  const sx = (tileX - tileY) * (TILE_W / 2);
  const sy = (tileX + tileY) * (TILE_H / 2) - elevation * ELEVATION_PX;
  return [sx, sy];
}

export function screenToTile(
  sx: number,
  sy: number,
): [number, number] {
  // Inverse isometric (ignoring elevation)
  const tileX = (sx / (TILE_W / 2) + sy / (TILE_H / 2)) / 2;
  const tileY = (sy / (TILE_H / 2) - sx / (TILE_W / 2)) / 2;
  return [Math.floor(tileX), Math.floor(tileY)];
}

// ── Terrain/district color palettes ────────────────────────────

const TERRAIN_COLORS: Record<number, string> = {
  0: '#2a5a8c', // water — clearly blue
  1: '#5a8050', // land — warmer green
  2: '#8a7a5a', // hill — distinct tan/brown
  3: '#3a6a3a', // forest — richer green
};

const DISTRICT_TINTS: Record<number, string> = {
  0: '',            // none — use terrain color
  1: '#6a9a5a',     // residential_low — green
  2: '#9a8a60',     // residential_high — warm
  3: '#aa9040',     // commercial — golden
  4: '#7a7070',     // industrial — gray
  5: '#6878a0',     // civic — blue-gray
  6: '#50aa50',     // park — bright green
  7: '#508a9a',     // harbor — teal
};

const ROAD_COLORS: Record<number, string> = {
  1: '#c0c0c0', // main
  2: '#909090', // secondary
  3: '#707070', // local
};

export function getTileColor(tile: DecodedTile): string {
  if (tile.road > 0) return ROAD_COLORS[tile.road] || '#666';
  if (tile.district > 0) return DISTRICT_TINTS[tile.district] || TERRAIN_COLORS[tile.terrain] || '#333';
  return TERRAIN_COLORS[tile.terrain] || '#333';
}

// ── Water animation helper ─────────────────────────────────────

export function getWaterColor(frame: number, tileX: number, tileY: number): string {
  const phase = (frame * 0.02 + tileX * 0.1 + tileY * 0.1) % 1;
  const l = 25 + Math.sin(phase * Math.PI * 2) * 8;
  return `hsl(210, 50%, ${l}%)`;
}
