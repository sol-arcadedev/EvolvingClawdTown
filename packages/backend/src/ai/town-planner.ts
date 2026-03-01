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

  // Find the best edge tile to expand from
  const edgeTile = findBestEdgeTile(state, tier);
  if (!edgeTile) return null;

  // Determine expansion direction (away from center)
  const dx = edgeTile.x - cx;
  const dy = edgeTile.y - cy;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dist > 0 ? dx / dist : 1;
  const dirY = dist > 0 ? dy / dist : 0;

  // Expansion center is a few tiles outward from the edge
  const expCenter: TileCoord = {
    x: Math.round(edgeTile.x + dirX * 4),
    y: Math.round(edgeTile.y + dirY * 4),
  };

  // Clamp to bounds
  expCenter.x = Math.max(5, Math.min(map.width - 5, expCenter.x));
  expCenter.y = Math.max(5, Math.min(map.height - 5, expCenter.y));

  // Choose district based on tier
  const preferredDistricts = TIER_DISTRICTS[Math.max(1, Math.min(5, tier))] || ['residential_low'];
  const district = preferredDistricts[0];

  // Find nearest existing road tile to connect from
  const nearestRoad = findNearestRoad(state, edgeTile);

  // Plan the new plot position (near center of expansion, offset a bit)
  const plotOrigin: TileCoord = {
    x: Math.round(edgeTile.x + dirX * 2),
    y: Math.round(edgeTile.y + dirY * 2),
  };

  // Determine plot size based on tier
  const plotW = tier >= 4 ? 3 : tier >= 2 ? 2 : 1;
  const plotH = tier >= 3 ? 2 : 1;

  const plan: PlacementPlan = {
    expansion: { center: expCenter, radius: 6, district },
    plot: { origin: plotOrigin, width: plotW, height: plotH, district },
  };

  if (nearestRoad) {
    plan.road = {
      from: nearestRoad,
      to: edgeTile,
      roadType: 'secondary',
    };
  }

  // Add decorations near the new building
  plan.decorations = [
    {
      position: {
        x: plotOrigin.x + plotW + 1,
        y: plotOrigin.y,
      },
      type: 'tree',
    },
  ];

  return plan;
}

// ── Find best edge tile for expansion ───────────────────────────

function findBestEdgeTile(state: TownState, tier: number): TileCoord | null {
  const { map } = state;
  const cx = Math.floor(map.width / 2);
  const cy = Math.floor(map.height / 2);

  const candidates: { coord: TileCoord; score: number }[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const idx = y * map.width + x;
      const t = map.tiles[idx];
      if (!(t.tags & TAG_EDGE_OF_TOWN)) continue;
      if (t.terrain === TERRAIN_WATER) continue;

      // Score: prefer tiles that face open ocean for expansion
      let oceanNeighbors = 0;
      for (const [ddx, ddy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x + ddx, ny = y + ddy;
        if (inBounds(map, nx, ny) && map.tiles[ny * map.width + nx].terrain === TERRAIN_WATER) {
          oceanNeighbors++;
        }
      }

      if (oceanNeighbors === 0) continue;

      const distFromCenter = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
      // Higher tiers prefer closer to center; lower tiers prefer further out
      const distScore = tier >= 4 ? -distFromCenter : distFromCenter * 0.5;

      // Prefer even distribution — score tiles in less-built directions
      const angle = Math.atan2(y - cy, x - cx);
      const directionScore = getDirectionDensity(state, angle);

      candidates.push({
        coord: { x, y },
        score: oceanNeighbors * 10 + distScore - directionScore * 20,
      });
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score);

  // Return best candidate (with some randomness for variety)
  const topN = Math.min(5, candidates.length);
  const pick = Math.floor(Math.random() * topN);
  return candidates[pick].coord;
}

// ── Get building density in a direction from center ─────────────

function getDirectionDensity(state: TownState, angle: number): number {
  const cx = Math.floor(state.map.width / 2);
  const cy = Math.floor(state.map.height / 2);
  let count = 0;

  for (let i = 1; i < state.buildings.length; i++) {
    const b = state.buildings[i];
    const bAngle = Math.atan2(b.originY - cy, b.originX - cx);
    const diff = Math.abs(bAngle - angle);
    // Within 45 degrees
    if (diff < Math.PI / 4 || diff > Math.PI * 7 / 4) {
      count++;
    }
  }

  return count;
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
  const types = ['tree', 'bush', 'rock'];

  // Try to place 1-2 decorations near the plot
  const offsets: [number, number][] = [
    [plot.width + 1, 0],
    [0, plot.height + 1],
    [-1, 0],
    [0, -1],
  ];

  for (const [ox, oy] of offsets) {
    if (decorations.length >= 2) break;
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
      type: types[Math.floor(Math.random() * types.length)],
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

  // 3. Create the plot
  const plotId = `p_${plan.plot.origin.x}_${plan.plot.origin.y}`;

  // Check if plot already exists (from earlier createPlots or expansion)
  if (!state.plots.has(plotId)) {
    const result = applyAction(state, {
      type: 'CREATE_PLOT',
      origin: plan.plot.origin,
      width: plan.plot.width,
      height: plan.plot.height,
      district: plan.plot.district,
    });
    if (!result.success) {
      log.warn(`Plot creation failed: ${result.error}`);
      // Try to find any empty plot as fallback
      const fallbackPlot = findAnyEmptyPlot(state);
      if (fallbackPlot) {
        return { success: true, plotId: fallbackPlot.id };
      }
      return { success: false, error: result.error };
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
