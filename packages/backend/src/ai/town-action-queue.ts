// ── Clawd Town Action Queue ────────────────────────────────────
// Reads town summaries, asks Clawd (via Gemini) what action to take.
// Called when admin triggers or when no plots available for new holders.

import { DB } from '../db/queries';
import { log } from '../utils/logger';
import {
  TownState, TownAction,
  applyAction, getTownSummary, getDistrictSummaries, findCandidatePlots,
} from '../town-sim/index';
import { makeClawdDecision, isAIEnabled } from './clawd-agent';

type ProgressCallback = (line: string) => void;

export class TownActionQueue {
  private processing = false;
  private onProgress: ProgressCallback | null = null;

  constructor(
    private db: DB,
    private getTownState: () => TownState | null,
  ) {}

  setOnProgress(callback: ProgressCallback): void {
    this.onProgress = callback;
  }

  private pushProgress(line: string): void {
    if (this.onProgress) this.onProgress(line);
  }

  /** Ask Clawd to decide a town action based on current state */
  async requestAction(): Promise<{ action: TownAction; result: any } | null> {
    if (this.processing) return null;

    const state = this.getTownState();
    if (!state) {
      log.warn('Town state not available for action request');
      return null;
    }

    this.processing = true;

    try {
      const summary = getTownSummary(state);
      const districts = getDistrictSummaries(state);
      const emptyPlots = findCandidatePlots(state, { emptyOnly: true });

      this.pushProgress('> Clawd is surveying the town...');
      this.pushProgress(`> Stats: ${summary.buildingCount} buildings, ${summary.roadTileCount} roads, ${emptyPlots.length} empty plots`);

      // Determine what action to take based on town needs
      const action = decideTownAction(state, summary, districts, emptyPlots.length);

      if (!action) {
        this.pushProgress('> Town looks good — no action needed right now');
        return null;
      }

      this.pushProgress(`> Clawd decides: ${action.type}`);

      const result = applyAction(state, action);
      await this.db.saveTownAction(action.type, action, result, 'clawd');

      if (result.success) {
        this.pushProgress(`> Action applied successfully`);
      } else {
        this.pushProgress(`> Action failed: ${result.error}`);
      }

      return { action, result };
    } catch (err) {
      log.error('Town action queue error:', err);
      return null;
    } finally {
      this.processing = false;
    }
  }

  isProcessing(): boolean {
    return this.processing;
  }
}

// Simple rule-based action decision (Clawd's "instinct")
function decideTownAction(
  state: TownState,
  summary: import('../town-sim/index').TownStats,
  districts: import('../town-sim/index').DistrictSummary[],
  emptyPlotCount: number,
): TownAction | null {
  // Priority 1: If very few empty plots, grow a district
  if (emptyPlotCount < 10) {
    // Find the district with the highest demand (most buildings relative to tiles)
    const densest = districts
      .filter(d => d.type !== 'park' && d.type !== 'harbor')
      .sort((a, b) => b.density - a.density)[0];

    if (densest) {
      return {
        type: 'GROW_DISTRICT',
        district: densest.type,
        amount: 20,
      };
    }
  }

  // Priority 2: If greenery is low, create a park
  if (summary.greeneryScore < summary.buildingCount * 2) {
    const cx = Math.floor(state.map.width / 2);
    const cy = Math.floor(state.map.height / 2);
    return {
      type: 'CREATE_PARK_IN_AREA',
      center: { x: cx + Math.floor(Math.random() * 40 - 20), y: cy + Math.floor(Math.random() * 40 - 20) },
      radius: 5,
    };
  }

  // Priority 3: If roads are sparse, add a road segment
  if (summary.roadTileCount < state.map.width * 3) {
    const cx = Math.floor(state.map.width / 2);
    const cy = Math.floor(state.map.height / 2);
    return {
      type: 'ADD_ROAD_SEGMENT',
      from: { x: cx, y: cy },
      to: { x: cx + Math.floor(Math.random() * 60 - 30), y: cy + Math.floor(Math.random() * 60 - 30) },
      roadType: 'secondary',
    };
  }

  return null;
}
