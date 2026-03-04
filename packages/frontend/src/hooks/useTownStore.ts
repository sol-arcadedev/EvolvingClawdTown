import { create } from 'zustand';
import { WalletState, TradeEvent, TownBuilding, TownSnapshotMeta, TownRuin } from '../types';

const MAX_CONSOLE_LINES = 14;

// ── Change-tracking (module-level, not in Zustand state) ────────
let _changedAddresses = new Set<string>();
let _snapshotDirty = false;

// ── Trade activity tracking (for blinking lights) ────────
const _tradeActivity = new Map<string, number>(); // address → timestamp (ms)

/** Check if a wallet traded recently. duration = how long lights stay active (ms). */
export function isRecentlyActive(address: string, duration = 5000): boolean {
  const t = _tradeActivity.get(address);
  if (!t) return false;
  return Date.now() - t < duration;
}

/** Get the fade factor (1 = just traded, 0 = expired). */
export function getActivityFade(address: string, duration = 5000): number {
  const t = _tradeActivity.get(address);
  if (!t) return 0;
  const elapsed = Date.now() - t;
  if (elapsed >= duration) return 0;
  return 1 - elapsed / duration;
}

/** Read and clear pending changes. Renderer calls this once per frame. */
export function consumeChangedAddresses(): { snapshot: boolean; changed: Set<string> } {
  if (_snapshotDirty) {
    _snapshotDirty = false;
    _changedAddresses = new Set();
    return { snapshot: true, changed: new Set() };
  }
  if (_changedAddresses.size === 0) {
    return { snapshot: false, changed: _changedAddresses };
  }
  const result = _changedAddresses;
  _changedAddresses = new Set();
  return { snapshot: false, changed: result };
}

// ── Burning houses tracking (module-level, fire animation for 5 min) ────
const BURN_DURATION_MS = 300_000; // 5 minutes
const _burningHouses = new Map<string, { plotX: number; plotY: number; burnedAt: number }>();

/** Add a house that's currently on fire. Key = "x,y". */
export function addBurningHouse(plotX: number, plotY: number, burnedAt: number): void {
  _burningHouses.set(`${plotX},${plotY}`, { plotX, plotY, burnedAt });
}

/** Get all currently burning houses (within 5-min window). Expired entries are cleaned. */
export function getBurningHouses(): Map<string, { plotX: number; plotY: number; burnedAt: number }> {
  const now = Date.now();
  for (const [key, entry] of _burningHouses) {
    if (now - entry.burnedAt >= BURN_DURATION_MS) {
      _burningHouses.delete(key);
    }
  }
  return _burningHouses;
}

/** Check if a ruin is still within the fire window (should show fire instead of ruin). */
export function isStillBurning(burnedAt: number): boolean {
  return Date.now() - burnedAt < BURN_DURATION_MS;
}

// ── Tilemap change tracking ──────────────────────────────────────
let _tilemapDirty = false;
export function consumeTilemapDirty(): boolean {
  if (_tilemapDirty) { _tilemapDirty = false; return true; }
  return false;
}

interface TownStore {
  wallets: Map<string, WalletState>;
  recentTrades: TradeEvent[];
  consoleLines: string[];
  tokenMint: string;
  connected: boolean;
  reconnecting: boolean;
  selectedHouse: string | null;
  hoveredHouse: string | null;
  hoverPos: { x: number; y: number } | null;
  locateHouse: ((address: string) => void) | null;

  // Town tilemap state
  tilemap: Uint8Array | null;
  mapWidth: number;
  mapHeight: number;
  townBuildings: Map<number, TownBuilding>;
  townSeed: number;
  decorations: Array<{ x: number; y: number; type: number }>;
  ruins: TownRuin[];
  reseedElapsedMs: number; // how many ms ago the reseed happened (at time of snapshot)

  // Actions
  applySnapshot: (wallets: WalletState[], consoleLines?: string[], tokenMint?: string) => void;
  applyWalletUpdate: (update: WalletState) => void;
  applyWalletBatch: (updates: WalletState[]) => void;
  addTradeEvent: (event: TradeEvent) => void;
  addConsoleLine: (line: string) => void;
  setConsoleLines: (lines: string[]) => void;
  setConnected: (connected: boolean) => void;
  setReconnecting: (reconnecting: boolean) => void;
  setSelectedHouse: (address: string | null) => void;
  setHoveredHouse: (address: string | null, pos?: { x: number; y: number }) => void;
  setLocateHouse: (fn: ((address: string) => void) | null) => void;
  applyClawdDecision: (address: string, fields: { buildingName: string; architecturalStyle: string; clawdComment: string }) => void;
  applyBuildingImage: (address: string, imageUrl: string) => void;
  addRuin: (ruin: TownRuin) => void;
  applyTownSnapshot: (meta: TownSnapshotMeta, tilemap: Uint8Array) => void;
}

export const useTownStore = create<TownStore>((set) => ({
  wallets: new Map(),
  recentTrades: [],
  consoleLines: [],
  tokenMint: '',
  connected: false,
  reconnecting: false,
  selectedHouse: null,
  hoveredHouse: null,
  hoverPos: null,
  locateHouse: null,
  tilemap: null,
  mapWidth: 0,
  mapHeight: 0,
  townBuildings: new Map(),
  townSeed: 0,
  decorations: [],
  ruins: [],
  reseedElapsedMs: Infinity,

  applySnapshot: (wallets, consoleLines, tokenMint) => {
    const map = new Map<string, WalletState>();
    for (const w of wallets) {
      map.set(w.address, w);
    }
    _snapshotDirty = true;
    _changedAddresses = new Set();
    const update: Partial<TownStore> = { wallets: map };
    if (consoleLines) update.consoleLines = consoleLines.slice(-MAX_CONSOLE_LINES);
    if (tokenMint) update.tokenMint = tokenMint;
    set(update);
  },

  applyWalletUpdate: (update) => {
    _changedAddresses.add(update.address);
    set((state) => {
      const newMap = new Map(state.wallets);
      newMap.set(update.address, update);
      return { wallets: newMap };
    });
  },

  applyWalletBatch: (updates) => {
    for (const w of updates) _changedAddresses.add(w.address);
    set((state) => {
      const newMap = new Map(state.wallets);
      for (const w of updates) {
        newMap.set(w.address, w);
      }
      return { wallets: newMap };
    });
  },

  addTradeEvent: (event) => {
    _tradeActivity.set(event.walletAddress, Date.now());
    set((state) => ({
      recentTrades: [event, ...state.recentTrades].slice(0, 50),
    }));
  },

  addConsoleLine: (line) => {
    set((state) => {
      const next = [...state.consoleLines, line];
      return { consoleLines: next.length > MAX_CONSOLE_LINES ? next.slice(-MAX_CONSOLE_LINES) : next };
    });
  },

  setConsoleLines: (lines) => set({ consoleLines: lines.slice(-MAX_CONSOLE_LINES) }),

  setConnected: (connected) => set({ connected }),
  setReconnecting: (reconnecting) => set({ reconnecting }),
  setSelectedHouse: (address) => set({ selectedHouse: address }),
  setHoveredHouse: (address, pos) => set({ hoveredHouse: address, hoverPos: pos ?? null }),
  setLocateHouse: (fn) => set({ locateHouse: fn }),

  applyClawdDecision: (address, fields) => {
    _changedAddresses.add(address);
    set((state) => {
      const existing = state.wallets.get(address);
      if (!existing) return {};
      const newMap = new Map(state.wallets);
      newMap.set(address, {
        ...existing,
        buildingName: fields.buildingName,
        architecturalStyle: fields.architecturalStyle,
        clawdComment: fields.clawdComment,
      });
      return { wallets: newMap };
    });
  },

  applyBuildingImage: (address, imageUrl) => {
    _changedAddresses.add(address);
    set((state) => {
      const existing = state.wallets.get(address);
      if (!existing) return {};
      const newMap = new Map(state.wallets);
      newMap.set(address, { ...existing, customImageUrl: imageUrl });
      return { wallets: newMap };
    });
  },

  addRuin: (ruin) => {
    set((state) => ({ ruins: [...state.ruins, ruin] }));
  },

  applyTownSnapshot: (meta, tilemap) => {
    _tilemapDirty = true;
    const bldMap = new Map<number, TownBuilding>();
    for (const b of meta.buildings) bldMap.set(b.id, b);
    // Compute how long ago the reseed happened using server's clock
    let reseedElapsedMs = Infinity;
    if (meta.reseedAt && meta.serverTime) {
      reseedElapsedMs = meta.serverTime - meta.reseedAt;
    }
    // Populate burning houses from snapshot ruins that are still within 5-min window
    const snapshotRuins = meta.ruins || [];
    const now = Date.now();
    for (const r of snapshotRuins) {
      if (now - r.burnedAt < BURN_DURATION_MS) {
        addBurningHouse(r.x, r.y, r.burnedAt);
      }
    }

    set({
      tilemap,
      mapWidth: meta.width,
      mapHeight: meta.height,
      townBuildings: bldMap,
      townSeed: meta.seed,
      decorations: meta.decorations || [],
      ruins: snapshotRuins,
      reseedElapsedMs,
    });
  },
}));
