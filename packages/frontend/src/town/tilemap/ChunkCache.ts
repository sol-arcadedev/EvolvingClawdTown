// ── Chunked tilemap rendering ──────────────────────────────────
// Divides 256x256 map into 16x16 tile chunks (16x16 = 256 chunks).
// Each chunk pre-renders ground tiles to an OffscreenCanvas.
// Only visible chunks (~10-20) are drawn per frame.

import { TILE_W, TILE_H, ELEVATION_PX, tileToScreen, type DecodedTile } from './TilemapRenderer';
import { drawTile } from './TileAtlas';

export const CHUNK_SIZE = 16; // tiles per chunk edge

function makeCanvas(w: number, h: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

interface ChunkEntry {
  canvas: CanvasImageSource;
  // World-space origin of this chunk's canvas (top-left corner in screen coords)
  originX: number;
  originY: number;
  canvasW: number;
  canvasH: number;
  dirty: boolean;
}

export class ChunkCache {
  private chunks = new Map<number, ChunkEntry>();
  private mapWidth = 0;
  private mapHeight = 0;
  private tiles: DecodedTile[] = [];
  private chunksX = 0;
  private chunksY = 0;

  setTilemap(tiles: DecodedTile[], width: number, height: number): void {
    this.tiles = tiles;
    this.mapWidth = width;
    this.mapHeight = height;
    this.chunksX = Math.ceil(width / CHUNK_SIZE);
    this.chunksY = Math.ceil(height / CHUNK_SIZE);
    this.chunks.clear(); // force full rebuild
  }

  invalidateChunk(tileX: number, tileY: number): void {
    const cx = Math.floor(tileX / CHUNK_SIZE);
    const cy = Math.floor(tileY / CHUNK_SIZE);
    const key = cy * this.chunksX + cx;
    const entry = this.chunks.get(key);
    if (entry) entry.dirty = true;
  }

  invalidateAll(): void {
    this.chunks.clear();
  }

  drawVisibleChunks(
    ctx: CanvasRenderingContext2D,
    cameraX: number,
    cameraY: number,
    cameraScale: number,
    viewW: number,
    viewH: number,
  ): void {
    if (this.tiles.length === 0) return;

    const inv = 1 / cameraScale;

    // Viewport bounds in world coords (with generous padding for iso projection)
    const pad = TILE_W * CHUNK_SIZE;
    const wl = -cameraX * inv - pad;
    const wt = -cameraY * inv - pad;
    const wr = (viewW - cameraX) * inv + pad;
    const wb = (viewH - cameraY) * inv + pad;

    for (let cy = 0; cy < this.chunksY; cy++) {
      for (let cx = 0; cx < this.chunksX; cx++) {
        const key = cy * this.chunksX + cx;

        // Quick bounds check: compute chunk's screen-space bounding box
        const startTileX = cx * CHUNK_SIZE;
        const startTileY = cy * CHUNK_SIZE;
        const endTileX = Math.min(startTileX + CHUNK_SIZE, this.mapWidth);
        const endTileY = Math.min(startTileY + CHUNK_SIZE, this.mapHeight);

        // Approximate chunk center in screen coords
        const midX = (startTileX + endTileX) / 2;
        const midY = (startTileY + endTileY) / 2;
        const [sx, sy] = tileToScreen(midX, midY, 0);

        if (sx < wl || sx > wr || sy < wt || sy > wb) continue;

        let entry = this.chunks.get(key);
        if (!entry || entry.dirty) {
          entry = this.renderChunk(cx, cy, startTileX, startTileY, endTileX, endTileY);
          this.chunks.set(key, entry);
        }

        ctx.drawImage(
          entry.canvas,
          entry.originX,
          entry.originY,
          entry.canvasW,
          entry.canvasH,
        );
      }
    }
  }

  private renderChunk(
    _cx: number, _cy: number,
    startX: number, startY: number,
    endX: number, endY: number,
  ): ChunkEntry {
    // Compute bounding box of all tile screen positions in this chunk
    let minSX = Infinity, minSY = Infinity, maxSX = -Infinity, maxSY = -Infinity;

    let hasVisibleTiles = false;
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const idx = ty * this.mapWidth + tx;
        const tile = this.tiles[idx];
        if (!tile || (tile.terrain === 0 && tile.elevation === 0)) continue; // skip void
        hasVisibleTiles = true;
        const elev = tile.elevation / 255 * 3; // scale elevation
        const [sx, sy] = tileToScreen(tx, ty, elev);
        if (sx - TILE_W / 2 < minSX) minSX = sx - TILE_W / 2;
        if (sy - TILE_H / 2 < minSY) minSY = sy - TILE_H / 2;
        if (sx + TILE_W / 2 > maxSX) maxSX = sx + TILE_W / 2;
        if (sy + TILE_H / 2 > maxSY) maxSY = sy + TILE_H / 2;
      }
    }

    // If entire chunk is void, return a 1x1 empty canvas
    if (!hasVisibleTiles) {
      const cvs = makeCanvas(1, 1);
      return { canvas: cvs, originX: 0, originY: 0, canvasW: 1, canvasH: 1, dirty: false };
    }

    const canvasW = Math.ceil(maxSX - minSX) + 2;
    const canvasH = Math.ceil(maxSY - minSY) + 2;

    const cvs = makeCanvas(canvasW, canvasH);
    const cctx = cvs.getContext('2d') as CanvasRenderingContext2D | null;
    if (!cctx) return { canvas: cvs, originX: minSX - 1, originY: minSY - 1, canvasW, canvasH, dirty: false };

    // Draw tiles relative to the chunk canvas origin
    for (let ty = startY; ty < endY; ty++) {
      for (let tx = startX; tx < endX; tx++) {
        const idx = ty * this.mapWidth + tx;
        const tile = this.tiles[idx];
        if (!tile) continue;

        // Skip void water tiles (terrain=water + elevation=0)
        if (tile.terrain === 0 && tile.elevation === 0) continue;

        const elev = tile.elevation / 255 * 3;
        const [sx, sy] = tileToScreen(tx, ty, elev);
        drawTile(cctx, tile, sx - minSX + 1, sy - minSY + 1, tx, ty);
      }
    }

    return {
      canvas: cvs,
      originX: minSX - 1,
      originY: minSY - 1,
      canvasW,
      canvasH,
      dirty: false,
    };
  }
}
