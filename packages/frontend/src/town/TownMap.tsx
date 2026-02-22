import { useRef, useEffect, useCallback } from 'react';
import { Container, Graphics, Ticker } from 'pixi.js';
import { createApp } from './renderer';
import { Camera } from './Camera';
import { HouseSprite, PLOT_W, PLOT_H } from './HouseSprite';
import { FloatingTextManager } from './FloatingText';
import { useTownStore } from '../hooks/useTownStore';
import { WalletState, TradeEvent } from '../types';

const GRID_BUFFER = 2;

export default function TownMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const housesRef = useRef<Map<string, HouseSprite>>(new Map());
  const cameraRef = useRef<Camera | null>(null);
  const floatingRef = useRef<FloatingTextManager | null>(null);
  // Expose locateHouse for external use (WalletPanel)
  const locateRef = useRef<((address: string) => void) | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;
    let destroyed = false;

    const init = async () => {
      const canvas = canvasRef.current!;
      const app = await createApp(canvas);
      if (destroyed) { app.destroy(); return; }

      const worldContainer = new Container();
      app.stage.addChild(worldContainer);

      const gridBg = new Graphics();
      worldContainer.addChild(gridBg);
      drawGridBackground(gridBg);

      const camera = new Camera(worldContainer, canvas);
      cameraRef.current = camera;
      camera.centerOn(0, 0);

      const floatingText = new FloatingTextManager(worldContainer);
      floatingRef.current = floatingText;

      // Initial render
      const initialWallets = useTownStore.getState().wallets;
      for (const [, wallet] of initialWallets) {
        addOrUpdateHouse(wallet, worldContainer);
      }

      // Locate house helper
      locateRef.current = (address: string) => {
        const house = housesRef.current.get(address);
        if (house) camera.centerOn(-house.worldX, -house.worldY);
      };

      // Subscribe to wallet updates
      const unsubWallets = useTownStore.subscribe((state, prev) => {
        if (state.wallets !== prev.wallets) {
          for (const [, wallet] of state.wallets) {
            addOrUpdateHouse(wallet, worldContainer);
          }
        }
      });

      // Subscribe to trade events — spawn floating text
      let lastTradeCount = useTownStore.getState().recentTrades.length;
      const unsubTrades = useTownStore.subscribe((state) => {
        const trades = state.recentTrades;
        if (trades.length > lastTradeCount) {
          // Process new trades (they're prepended)
          const newCount = trades.length - lastTradeCount;
          for (let i = 0; i < Math.min(newCount, 5); i++) {
            spawnTradeText(trades[i]);
          }
        }
        lastTradeCount = trades.length;
      });

      // Main animation loop
      app.ticker.add((ticker: Ticker) => {
        const deltaMs = ticker.deltaMS;
        if (!cameraRef.current) return;

        const bounds = cameraRef.current.getViewportBounds();
        const bufferX = PLOT_W * GRID_BUFFER;
        const bufferY = PLOT_H * GRID_BUFFER;

        for (const [, house] of housesRef.current) {
          const visible =
            house.worldX + PLOT_W >= bounds.left - bufferX &&
            house.worldX <= bounds.right + bufferX &&
            house.worldY + PLOT_H >= bounds.top - bufferY &&
            house.worldY <= bounds.bottom + bufferY;
          house.container.visible = visible;

          if (visible) {
            house.animateTick(deltaMs);
          }
        }

        floatingText.update(deltaMs);
      });

      return () => {
        unsubWallets();
        unsubTrades();
        app.destroy(true);
      };
    };

    let cleanup: (() => void) | undefined;
    init().then((c) => { cleanup = c; });
    return () => { destroyed = true; cleanup?.(); };
  }, []);

  function addOrUpdateHouse(wallet: WalletState, worldContainer: Container): void {
    const existing = housesRef.current.get(wallet.address);
    if (existing) {
      existing.update(wallet);
    } else {
      const house = new HouseSprite(wallet);
      housesRef.current.set(wallet.address, house);
      worldContainer.addChild(house.container);
    }
  }

  function spawnTradeText(trade: TradeEvent): void {
    const house = housesRef.current.get(trade.walletAddress);
    if (!house || !floatingRef.current) return;

    const isBuy = trade.eventType === 'buy' || trade.eventType === 'transfer_in';
    const label = isBuy ? '+BUY' : '-SELL';
    const color = isBuy ? 0x00fff5 : 0xff0080;

    floatingRef.current.spawn(house.worldX, house.worldY, label, color);
  }

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        position: 'absolute',
        top: 0,
        left: 0,
      }}
    />
  );
}

function drawGridBackground(g: Graphics): void {
  const range = 50;
  g.setStrokeStyle({ color: 0x111122, width: 1, alpha: 0.5 });
  for (let i = -range; i <= range; i++) {
    g.moveTo(i * PLOT_W, -range * PLOT_H);
    g.lineTo(i * PLOT_W, range * PLOT_H);
    g.stroke();
    g.moveTo(-range * PLOT_W, i * PLOT_H);
    g.lineTo(range * PLOT_W, i * PLOT_H);
    g.stroke();
  }
}
