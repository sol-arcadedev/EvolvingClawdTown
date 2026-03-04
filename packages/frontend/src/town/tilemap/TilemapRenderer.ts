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
  0: '#4a90b8', // water — warm blue
  1: '#7bb050', // land — vibrant grass green
  2: '#c8a960', // hill — warm sandy
  3: '#4a8a35', // forest — rich green
};

const DISTRICT_TINTS: Record<number, string> = {
  0: '',            // none — use terrain color
  1: '#80c060',     // residential_low — warm leafy
  2: '#d4b060',     // residential_high — richer gold
  3: '#d49040',     // commercial — terracotta amber
  4: '#a09070',     // industrial — warm tan
  5: '#c0a860',     // civic — warm gold
  6: '#50c850',     // park — vivid green
  7: '#70b8a0',     // harbor — warm sandy-teal
};

const ROAD_COLORS: Record<number, string> = {
  1: '#b08060', // main — warm brown cobblestone
  2: '#9b7050', // secondary — medium brown
  3: '#8a6545', // local — darker brown path
};

export function getTileColor(tile: DecodedTile): string {
  if (tile.road > 0) return ROAD_COLORS[tile.road] || '#666';
  if (tile.district > 0) return DISTRICT_TINTS[tile.district] || TERRAIN_COLORS[tile.terrain] || '#333';
  return TERRAIN_COLORS[tile.terrain] || '#333';
}

// ── Water animation helper ─────────────────────────────────────

export function getWaterColor(frame: number, tileX: number, tileY: number): string {
  const phase = (frame * 0.02 + tileX * 0.1 + tileY * 0.1) % 1;
  const l = 35 + Math.sin(phase * Math.PI * 2) * 8;
  return `hsl(195, 55%, ${l}%)`;
}
