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
  0: '#3070b0', // water — vivid blue
  1: '#6a9a55', // land — bright green
  2: '#b09860', // hill — warm sandy tan
  3: '#2a7a2a', // forest — deep rich green
};

const DISTRICT_TINTS: Record<number, string> = {
  0: '',            // none — use terrain color
  1: '#70b060',     // residential_low — leafy green
  2: '#c0a050',     // residential_high — warm gold
  3: '#d4a030',     // commercial — bright amber
  4: '#909090',     // industrial — light gray
  5: '#7088c0',     // civic — clear blue
  6: '#40c840',     // park — vivid green
  7: '#50a8b8',     // harbor — bright teal
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
