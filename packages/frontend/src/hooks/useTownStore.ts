import { create } from 'zustand';
import { WalletState, TradeEvent } from '../types';

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
}));
