import { create } from 'zustand';
import { WalletState, TradeEvent } from '../types';

interface TownStore {
  wallets: Map<string, WalletState>;
  recentTrades: TradeEvent[];
  connected: boolean;

  // Actions
  applySnapshot: (wallets: WalletState[]) => void;
  applyWalletUpdate: (update: WalletState) => void;
  addTradeEvent: (event: TradeEvent) => void;
  setConnected: (connected: boolean) => void;
}

export const useTownStore = create<TownStore>((set) => ({
  wallets: new Map(),
  recentTrades: [],
  connected: false,

  applySnapshot: (wallets) => {
    const map = new Map<string, WalletState>();
    for (const w of wallets) {
      map.set(w.address, w);
    }
    set({ wallets: map });
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

  setConnected: (connected) => set({ connected }),
}));
