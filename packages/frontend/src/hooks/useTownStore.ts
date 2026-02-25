import { create } from 'zustand';
import { WalletState, TradeEvent } from '../types';

const MAX_CONSOLE_LINES = 14;

interface TownStore {
  wallets: Map<string, WalletState>;
  recentTrades: TradeEvent[];
  consoleLines: string[];
  connected: boolean;
  selectedHouse: string | null;
  hoveredHouse: string | null;
  hoverPos: { x: number; y: number } | null;
  locateHouse: ((address: string) => void) | null;

  // Actions
  applySnapshot: (wallets: WalletState[], consoleLines?: string[]) => void;
  applyWalletUpdate: (update: WalletState) => void;
  addTradeEvent: (event: TradeEvent) => void;
  addConsoleLine: (line: string) => void;
  setConsoleLines: (lines: string[]) => void;
  setConnected: (connected: boolean) => void;
  setSelectedHouse: (address: string | null) => void;
  setHoveredHouse: (address: string | null, pos?: { x: number; y: number }) => void;
  setLocateHouse: (fn: ((address: string) => void) | null) => void;
}

export const useTownStore = create<TownStore>((set) => ({
  wallets: new Map(),
  recentTrades: [],
  consoleLines: [],
  connected: false,
  selectedHouse: null,
  hoveredHouse: null,
  hoverPos: null,
  locateHouse: null,

  applySnapshot: (wallets, consoleLines) => {
    const map = new Map<string, WalletState>();
    for (const w of wallets) {
      map.set(w.address, w);
    }
    const update: Partial<TownStore> = { wallets: map };
    if (consoleLines) update.consoleLines = consoleLines.slice(-MAX_CONSOLE_LINES);
    set(update);
  },

  applyWalletUpdate: (update) => {
    set((state) => {
      const newMap = new Map(state.wallets);
      newMap.set(update.address, update);
      return { wallets: newMap };
    });
  },

  addTradeEvent: (event) => {
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
  setSelectedHouse: (address) => set({ selectedHouse: address }),
  setHoveredHouse: (address, pos) => set({ hoveredHouse: address, hoverPos: pos ?? null }),
  setLocateHouse: (fn) => set({ locateHouse: fn }),
}));
