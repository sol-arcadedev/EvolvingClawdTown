import { Graphics } from 'pixi.js';
import { PLOT_STRIDE, PLOT_DISTANCE_MULT, COL_GROUND } from './constants';

// How far out from center to draw (in plot units)
const PLOT_EXTENT = 15;
const WORLD_EXTENT = PLOT_EXTENT * PLOT_STRIDE * PLOT_DISTANCE_MULT;

export function drawEnvironment(g: Graphics) {
  g.clear();

  // Dark ground fill — just the background, nothing else
  const pad = PLOT_STRIDE * PLOT_DISTANCE_MULT * 2;
  g.rect(-WORLD_EXTENT - pad, -WORLD_EXTENT - pad,
    (WORLD_EXTENT + pad) * 2, (WORLD_EXTENT + pad) * 2);
  g.fill({ color: COL_GROUND });
}
