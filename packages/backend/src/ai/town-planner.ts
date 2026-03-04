// ── Town Planner — algorithmic building placement + town growth ──
// Decides where new buildings go, expands the island, lays roads,
// and places decorations. Called by the decision queue.

import {
  TownState, TownAction, TileCoord, Plot, RoadType, DistrictType,
  TERRAIN_WATER,
  DISTRICT_NAMES,
  TAG_EDGE_OF_TOWN,
  inBounds,
} from '../town-sim/types';
import { findPlotForHolder, applyAction, getDistrictSummaries } from '../town-sim/actions';
import { log } from '../utils/logger';
import { TOWN_REVIEW_PROMPT, CLAWD_SYSTEM_PROMPT } from './clawd-prompt';

export interface PlacementPlan {
  expansion?: { center: TileCoord; radius: number; district: DistrictType };
  road?: { from: TileCoord; to: TileCoord; roadType: RoadType };
  plot: { origin: TileCoord; width: number; height: number; district: DistrictType };
  decorations?: Array<{ position: TileCoord; type: string }>;
}

// ── District preference for tiers ────────────────────────────────

const TIER_DISTRICTS: Record<number, DistrictType[]> = {
  5: ['civic', 'residential_high'],
  4: ['residential_high', 'commercial'],
  3: ['residential_high', 'commercial'],
  2: ['residential_low', 'residential_high'],
  1: ['residential_low'],
};

// ── Core planning function ──────────────────────────────────────

export function planBuildingPlacement(
  state: TownState,
  tier: number,
): PlacementPlan | null {
  // 1. Try to find an existing empty plot
  const existingPlot = findPlotForHolder(state, tier);
  if (existingPlot) {
    // Found an existing plot — just use it, maybe add a decoration
    const decorations = planDecorations(state, existingPlot);
    return {
      plot: {
        origin: { x: existingPlot.originX, y: existingPlot.originY },
        width: existingPlot.width,
        height: existingPlot.height,
        district: DISTRICT_NAMES[existingPlot.district],
      },
      decorations,
    };
  }

  // 2. No plots available — expand the town
  const expansion = planExpansion(state, tier);
  if (!expansion) {
    log.warn('Town planner: cannot find expansion direction');
    return null;
  }

  return expansion;
}

// ── Expansion planning ──────────────────────────────────────────

function planExpansion(state: TownState, tier: number): PlacementPlan | null {
  const { map } = state;
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  // Find the least-developed angle and the current town radius
  const { angle, radius } = findGapDirection(state);

  // Walk outward from center in the chosen direction until we hit water,
  // then place expansion center just 2 tiles past the last land tile.
  // This keeps new land adjacent to existing town instead of leapfrogging to the ocean edge.
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);

  let landEdgeDist = 5; // default fallback
  for (let d = 5; d < 120; d++) {
    const tx = Math.round(cx + dirX * d);
    const ty = Math.round(cy + dirY * d);
    if (!inBounds(map, tx, ty)) { landEdgeDist = d - 1; break; }
    const t = map.tiles[ty * map.width + tx];
    if (t.terrain === TERRAIN_WATER) { landEdgeDist = d; break; }
  }

  // Place expansion center just past the land edge — keeps town compact
  const expDist = landEdgeDist + 2;
  const expCenter: TileCoord = {
    x: Math.round(cx + dirX * expDist),
    y: Math.round(cy + dirY * expDist),
  };

  // Clamp to bounds (leave margin for expansion radius)
  expCenter.x = Math.max(10, Math.min(map.width - 10, expCenter.x));
  expCenter.y = Math.max(10, Math.min(map.height - 10, expCenter.y));

  // Choose district based on tier
  const preferredDistricts = TIER_DISTRICTS[Math.max(1, Math.min(5, tier))] || ['residential_low'];
  const district = preferredDistricts[0];

  // Find nearest existing road tile to connect from
  const nearestRoad = findNearestRoad(state, expCenter);

  // Plan the new plot position offset from center (perpendicular to direction)
  // so it doesn't land on the road connecting to the expansion
  const perpX = -dirY;  // perpendicular direction
  const perpY = dirX;
  const plotOrigin: TileCoord = {
    x: Math.round(expCenter.x + perpX * 2),
    y: Math.round(expCenter.y + perpY * 2),
  };

  // All plots are 3x3 — building renders on center tile
  const plotW = 3;
  const plotH = 3;

  const plan: PlacementPlan = {
    expansion: { center: expCenter, radius: 6, district },
    plot: { origin: plotOrigin, width: plotW, height: plotH, district },
  };

  if (nearestRoad) {
    plan.road = {
      from: nearestRoad,
      to: expCenter,
      roadType: 'secondary',
    };
  }

  // Add 2-3 decorations near the new building
  plan.decorations = [
    {
      position: {
        x: plotOrigin.x + plotW + 1,
        y: plotOrigin.y,
      },
      type: 'tree',
    },
    {
      position: {
        x: plotOrigin.x,
        y: plotOrigin.y + plotH + 1,
      },
      type: 'tree',
    },
    {
      position: {
        x: plotOrigin.x + plotW + 1,
        y: plotOrigin.y + plotH,
      },
      type: Math.random() < 0.5 ? 'bush' : 'tree',
    },
  ];

  return plan;
}

// ── Find the angular gap with least land coverage ───────────────

function findGapDirection(state: TownState): { angle: number; radius: number } {
  const { map } = state;
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  // Scan 24 angular sectors (15° each) and measure land extent in each
  const SECTORS = 24;
  const sectorLand: number[] = new Array(SECTORS).fill(0);
  const sectorMaxDist: number[] = new Array(SECTORS).fill(0);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const t = map.tiles[y * map.width + x];
      if (t.terrain === TERRAIN_WATER) continue;
      const dx = x - cx, dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 5) continue; // skip castle area
      const angle = Math.atan2(dy, dx); // -PI to PI
      const sector = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * SECTORS) % SECTORS;
      sectorLand[sector]++;
      if (dist > sectorMaxDist[sector]) sectorMaxDist[sector] = dist;
    }
  }

  // Find the sector with least land (biggest gap), with randomness to spread growth
  // Add random noise so consecutive calls don't always pick the same sector
  let minScore = Infinity;
  let gapSector = 0;
  for (let s = 0; s < SECTORS; s++) {
    const score = sectorLand[s] + Math.random() * (sectorLand[s] * 0.5 + 10);
    if (score < minScore) {
      minScore = score;
      gapSector = s;
    }
  }

  // Convert sector back to angle (center of sector)
  const gapAngle = ((gapSector + 0.5) / SECTORS) * 2 * Math.PI - Math.PI;

  // Target radius: average of neighbor sectors' max distances, or town average
  const prevSector = (gapSector - 1 + SECTORS) % SECTORS;
  const nextSector = (gapSector + 1) % SECTORS;
  const neighborAvgDist = (sectorMaxDist[prevSector] + sectorMaxDist[nextSector]) / 2;
  const targetRadius = Math.max(12, neighborAvgDist > 0 ? neighborAvgDist * 0.8 : 14);

  return { angle: gapAngle, radius: targetRadius };
}

// ── Find nearest road tile to a position ────────────────────────

function findNearestRoad(state: TownState, pos: TileCoord): TileCoord | null {
  const { map } = state;
  let best: TileCoord | null = null;
  let bestDist = Infinity;

  // BFS from pos outward looking for a road
  const maxSearch = 20;
  for (let r = 1; r <= maxSearch; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only ring
        const x = pos.x + dx, y = pos.y + dy;
        if (!inBounds(map, x, y)) continue;
        const t = map.tiles[y * map.width + x];
        if (t.road > 0) {
          const d = Math.abs(dx) + Math.abs(dy);
          if (d < bestDist) {
            bestDist = d;
            best = { x, y };
          }
        }
      }
    }
    if (best) return best;
  }

  return best;
}

// ── Plan decorations near a plot ────────────────────────────────

function planDecorations(state: TownState, plot: Plot): Array<{ position: TileCoord; type: string }> | undefined {
  const { map } = state;
  const decorations: Array<{ position: TileCoord; type: string }> = [];

  // Weighted selection: trees 40%, bushes 20%, fence 10%, hedge 10%, misc 20%
  function pickDecorationType(): string {
    const r = Math.random();
    if (r < 0.40) return 'tree';
    if (r < 0.60) return 'bush';
    if (r < 0.70) return 'fence';
    if (r < 0.80) return 'hedge';
    const misc = ['rock', 'fountain', 'bench'];
    return misc[Math.floor(Math.random() * misc.length)];
  }

  // Try to place 2-3 decorations near the plot
  const targetCount = 2 + Math.floor(Math.random() * 2); // 2-3
  const offsets: [number, number][] = [
    [plot.width + 1, 0],
    [0, plot.height + 1],
    [-1, 0],
    [0, -1],
    [plot.width + 1, plot.height],
    [plot.width, plot.height + 1],
  ];

  for (const [ox, oy] of offsets) {
    if (decorations.length >= targetCount) break;
    const x = plot.originX + ox;
    const y = plot.originY + oy;
    if (!inBounds(map, x, y)) continue;
    const idx = y * map.width + x;
    const t = map.tiles[idx];
    if (t.terrain === TERRAIN_WATER) continue;
    if (t.road > 0) continue;
    if (t.buildingId > 0) continue;
    if (t.clusterId > 0) continue; // already has decoration

    decorations.push({
      position: { x, y },
      type: pickDecorationType(),
    });
  }

  return decorations.length > 0 ? decorations : undefined;
}

// ── Execute a placement plan ────────────────────────────────────

export function executePlacementPlan(
  state: TownState,
  plan: PlacementPlan,
): { success: boolean; plotId?: string; error?: string } {
  // 1. Expand town if needed
  if (plan.expansion) {
    const result = applyAction(state, {
      type: 'EXPAND_TOWN',
      center: plan.expansion.center,
      radius: plan.expansion.radius,
      district: plan.expansion.district,
    });
    if (!result.success) {
      log.warn(`Town expansion failed: ${result.error}`);
      // Don't fail entirely — maybe we can still create the plot
    }
  }

  // 2. Lay road if specified
  if (plan.road) {
    const result = applyAction(state, {
      type: 'ADD_ROAD_SEGMENT',
      from: plan.road.from,
      to: plan.road.to,
      roadType: plan.road.roadType,
    });
    if (!result.success) {
      log.warn(`Road creation failed: ${result.error}`);
    }
  }

  // 3. Create the plot — try the planned origin, then nearby offsets
  let plotId = `p_${plan.plot.origin.x}_${plan.plot.origin.y}`;
  let plotCreated = state.plots.has(plotId);

  if (!plotCreated) {
    // Try the planned origin first, then spiral outward in 3-tile steps (plot size)
    const offsets: [number, number][] = [[0,0]];
    for (let r = 3; r <= 18; r += 3) {
      for (let dy = -r; dy <= r; dy += 3) {
        for (let dx = -r; dx <= r; dx += 3) {
          if (Math.abs(dx) >= r || Math.abs(dy) >= r) {
            offsets.push([dx, dy]);
          }
        }
      }
    }

    for (const [ox, oy] of offsets) {
      const tryOrigin = { x: plan.plot.origin.x + ox, y: plan.plot.origin.y + oy };
      const tryId = `p_${tryOrigin.x}_${tryOrigin.y}`;
      if (state.plots.has(tryId)) continue;
      const result = applyAction(state, {
        type: 'CREATE_PLOT',
        origin: tryOrigin,
        width: plan.plot.width,
        height: plan.plot.height,
        district: plan.plot.district,
      });
      if (result.success) {
        plotId = tryId;
        plotCreated = true;
        break;
      }
    }

    if (!plotCreated) {
      // Try to find any empty plot as fallback
      const fallbackPlot = findAnyEmptyPlot(state);
      if (fallbackPlot) {
        return { success: true, plotId: fallbackPlot.id };
      }
      return { success: false, error: 'Could not create plot at or near planned location' };
    }
  }

  // 4. Place decorations
  if (plan.decorations) {
    for (const deco of plan.decorations) {
      applyAction(state, {
        type: 'PLACE_DECORATION',
        position: deco.position,
        decorationType: deco.type,
      });
      // Ignore decoration failures — they're cosmetic
    }
  }

  return { success: true, plotId };
}

function findAnyEmptyPlot(state: TownState): Plot | null {
  for (const plot of state.plots.values()) {
    if (!plot.occupied) return plot;
  }
  return null;
}

// ── Town state summary for AI context ───────────────────────────

export function summarizeTownState(state: TownState): string {
  const { map, plots, buildings, stats } = state;
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  // Calculate town radius (max distance from center to any building)
  let maxRadius = 0;
  for (let i = 1; i < buildings.length; i++) {
    const b = buildings[i];
    const dist = Math.sqrt((b.originX - cx) ** 2 + (b.originY - cy) ** 2);
    if (dist > maxRadius) maxRadius = dist;
  }

  // Count empty vs occupied plots
  let emptyPlots = 0, occupiedPlots = 0;
  for (const plot of plots.values()) {
    if (plot.occupied) occupiedPlots++;
    else emptyPlots++;
  }

  // District summaries
  const districtSummaries = getDistrictSummaries(state);
  const districtLines = districtSummaries.map(d =>
    `  ${d.type}: ${d.tileCount} tiles, ${d.buildingCount} buildings, ${d.emptyPlots} empty plots`
  ).join('\n');

  // Count land tiles
  let landTiles = 0;
  for (const t of map.tiles) {
    if (t.terrain !== TERRAIN_WATER) landTiles++;
  }

  return `Town State Summary:
- Map size: ${map.width}x${map.height}
- Land tiles: ${landTiles} / ${map.width * map.height}
- Town radius: ~${Math.round(maxRadius)} tiles from center
- Buildings: ${stats.buildingCount}
- Plots: ${occupiedPlots} occupied, ${emptyPlots} empty
- Roads: ${stats.roadTileCount} tiles
- Population: ${stats.population}
- Districts:
${districtLines}`;
}

// ── Phase 3: AI-driven town review ──────────────────────────────

export interface TownReviewResult {
  actions: TownAction[];
  summary: string;
}

/**
 * Periodic town review — sends town state to Gemini and gets
 * strategic suggestions for town improvements.
 * Called every N buildings or on a timer.
 */
export async function reviewTownLayout(
  state: TownState,
  recentActions: Array<{ action_type: string; action_json: any; created_at: Date }>,
  callGemini?: (systemPrompt: string, userPrompt: string) => Promise<string>,
): Promise<TownReviewResult> {
  const summary = summarizeTownState(state);

  // Format recent actions
  const recentActionsText = recentActions.length > 0
    ? recentActions.map(a => `  [${a.action_type}] ${JSON.stringify(a.action_json)}`).join('\n')
    : '  (no recent actions)';

  // Build prompt
  const userPrompt = TOWN_REVIEW_PROMPT
    .replace('{TOWN_SUMMARY}', summary)
    .replace('{RECENT_ACTIONS}', recentActionsText);

  // If no Gemini function provided, return empty (pure algorithmic mode)
  if (!callGemini) {
    log.info('Town review: no AI function provided, skipping');
    return { actions: [], summary };
  }

  try {
    const response = await callGemini(CLAWD_SYSTEM_PROMPT, userPrompt);

    // Parse JSON response
    let actions: TownAction[] = [];
    try {
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        actions = parsed;
      }
    } catch {
      log.warn('Town review: failed to parse AI response as JSON');
    }

    // Validate and filter actions
    const validActions: TownAction[] = [];
    for (const action of actions) {
      if (!action || !action.type) continue;
      const validTypes = ['EXPAND_TOWN', 'ADD_ROAD_SEGMENT', 'CREATE_PARK_IN_AREA', 'PLACE_DECORATION'];
      if (validTypes.includes(action.type)) {
        validActions.push(action as TownAction);
      }
    }

    // Cap at 3 actions
    const capped = validActions.slice(0, 3);

    log.info(`Town review: AI suggested ${capped.length} actions`);

    // Execute the actions
    for (const action of capped) {
      const result = applyAction(state, action);
      if (result.success) {
        log.info(`Town review action applied: ${action.type}`);
      } else {
        log.warn(`Town review action failed: ${action.type} — ${result.error}`);
      }
    }

    return { actions: capped, summary };
  } catch (err) {
    log.error('Town review failed:', err);
    return { actions: [], summary };
  }
}
