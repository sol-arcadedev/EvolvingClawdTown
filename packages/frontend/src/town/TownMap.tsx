import { useRef, useEffect } from 'react';
import { Container, Graphics, Ticker } from 'pixi.js';
import { createApp } from './renderer';
import { Camera } from './Camera';
import { HouseSprite, PLOT_W, PLOT_H } from './HouseSprite';
import { FloatingTextManager } from './FloatingText';
import { loadSpriteAssets } from './SpriteAssets';
import { useTownStore } from '../hooks/useTownStore';
import { WalletState, TradeEvent } from '../types';
import { RESERVED_PLOT_SET } from './CityLayout';

// Renderers
import { drawBaseGround, drawPlotGrounds, drawElevationShadows, drawOrganicPatches, drawWetStreetReflections, drawAtmosphericFog } from './renderers/TerrainRenderer';
import { drawRoads, drawLaneMarkings, drawCurvedRoads } from './renderers/StreetRenderer';
import { drawVacantLots, drawPlotFoundation, drawLandmarkGrounds } from './renderers/PlotRenderer';
import { drawWaterCanal, drawElevatedHighway } from './renderers/InfraRenderer';
import { drawSidewalks, drawNeonAccents, drawIntersections } from './renderers/DetailRenderer';
import { drawParkedVehicles, addStreetProps, addForegroundDecorations } from './renderers/PropRenderer';
import { drawBgAnimatedLayer, drawFgAnimatedLayer, setConstructionTargets } from './renderers/AnimationSystem';

const GRID_BUFFER = 2;

export default function TownMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const housesRef = useRef<Map<string, HouseSprite>>(new Map());
  const cameraRef = useRef<Camera | null>(null);
  const floatingRef = useRef<FloatingTextManager | null>(null);
  const plotFoundationsRef = useRef<Graphics | null>(null);
  const drawnFoundationsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!canvasRef.current) return;
    let destroyed = false;

    const init = async () => {
      const canvas = canvasRef.current!;
      const [app] = await Promise.all([createApp(canvas), loadSpriteAssets()]);
      if (destroyed) { app.destroy(); return; }

      const worldContainer = new Container();
      app.stage.addChild(worldContainer);

      // Layer ordering: bg → plot foundations → bg animations → bg props → houses → fg decorations → fg animations → floating text
      const gridBg = new Graphics();
      worldContainer.addChild(gridBg);

      const plotFoundations = new Graphics();
      worldContainer.addChild(plotFoundations);
      plotFoundationsRef.current = plotFoundations;

      const bgAnimLayer = new Graphics(); // searchlights, street glow, water, traffic (behind houses)
      worldContainer.addChild(bgAnimLayer);

      const bgPropsLayer = new Container();
      worldContainer.addChild(bgPropsLayer);

      const housesContainer = new Container();
      worldContainer.addChild(housesContainer);

      const fgDecorLayer = new Container();
      worldContainer.addChild(fgDecorLayer);

      const fgAnimLayer = new Graphics(); // holograms, drones, rain, neon signs (above houses)
      worldContainer.addChild(fgAnimLayer);

      // ── Build the entire pre-built city background ──
      drawCityBackground(gridBg, bgPropsLayer);
      addForegroundDecorations(fgDecorLayer);

      const camera = new Camera(worldContainer, canvas);
      cameraRef.current = camera;
      camera.centerOn(0, 0);

      const floatingText = new FloatingTextManager(worldContainer);
      floatingRef.current = floatingText;

      // Initial render
      const initialWallets = useTownStore.getState().wallets;
      for (const [, wallet] of initialWallets) {
        addOrUpdateHouse(wallet, housesContainer);
      }

      // Register locateHouse
      const locateHouse = (address: string) => {
        const house = housesRef.current.get(address);
        if (house) camera.centerOn(-house.worldX, -house.worldY);
      };
      useTownStore.getState().setLocateHouse(locateHouse);

      // Click detection
      let isDragging = false;
      let mouseDownPos = { x: 0, y: 0 };

      canvas.addEventListener('mousedown', (e) => {
        isDragging = false;
        mouseDownPos = { x: e.clientX, y: e.clientY };
      });

      canvas.addEventListener('mousemove', (e) => {
        const dx = e.clientX - mouseDownPos.x;
        const dy = e.clientY - mouseDownPos.y;
        if (Math.abs(dx) > 4 || Math.abs(dy) > 4) isDragging = true;
      });

      canvas.addEventListener('click', (e) => {
        if (isDragging) return;
        const rect = canvas.getBoundingClientRect();
        const canvasX = e.clientX - rect.left;
        const canvasY = e.clientY - rect.top;
        const bounds = camera.getViewportBounds();
        const zoom = camera.zoom;
        const worldX = bounds.left + canvasX / zoom;
        const worldY = bounds.top + canvasY / zoom;

        let clickedAddress: string | null = null;
        for (const [address, house] of housesRef.current) {
          if (
            worldX >= house.worldX && worldX <= house.worldX + PLOT_W &&
            worldY >= house.worldY && worldY <= house.worldY + PLOT_H
          ) {
            clickedAddress = address;
            break;
          }
        }
        useTownStore.getState().setSelectedHouse(clickedAddress);
      });

      // Subscribe to wallet updates
      const unsubWallets = useTownStore.subscribe((state, prev) => {
        if (state.wallets !== prev.wallets) {
          for (const [, wallet] of state.wallets) {
            addOrUpdateHouse(wallet, housesContainer);
          }
        }
      });

      // Subscribe to trade events
      let lastTradeCount = useTownStore.getState().recentTrades.length;
      const unsubTrades = useTownStore.subscribe((state) => {
        const trades = state.recentTrades;
        if (trades.length > lastTradeCount) {
          const newCount = trades.length - lastTradeCount;
          for (let i = 0; i < Math.min(newCount, 5); i++) {
            spawnTradeText(trades[i]);
          }
        }
        lastTradeCount = trades.length;
      });

      // Main animation loop
      let holoTime = 0;
      app.ticker.add((ticker: Ticker) => {
        const deltaMs = ticker.deltaMS;
        if (!cameraRef.current) return;
        holoTime += deltaMs;

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
          if (visible) house.animateTick(deltaMs);
        }

        // Collect buildings under construction for mainframe beam animation
        const buildingTargets: { x: number; y: number; progress: number }[] = [];
        for (const [, house] of housesRef.current) {
          if (house.buildProgress < 100) {
            buildingTargets.push({
              x: house.worldX + PLOT_W / 2,
              y: house.worldY + PLOT_H / 2,
              progress: house.buildProgress,
            });
          }
        }
        setConstructionTargets(buildingTargets);

        floatingText.update(deltaMs);
        drawBgAnimatedLayer(bgAnimLayer, holoTime);
        drawFgAnimatedLayer(fgAnimLayer, holoTime);
      });

      return () => {
        unsubWallets();
        unsubTrades();
        useTownStore.getState().setLocateHouse(null);
        app.destroy(true);
      };
    };

    let cleanup: (() => void) | undefined;
    init().then((c) => { cleanup = c; });
    return () => { destroyed = true; cleanup?.(); };
  }, []);

  function addOrUpdateHouse(wallet: WalletState, container: Container): void {
    if (RESERVED_PLOT_SET.has(`${wallet.plotX},${wallet.plotY}`)) return;

    const existing = housesRef.current.get(wallet.address);
    if (existing) {
      existing.update(wallet);
    } else {
      const house = new HouseSprite(wallet);
      housesRef.current.set(wallet.address, house);
      container.addChild(house.container);

      // Draw foundation on the plotFoundations layer (incremental)
      const foundKey = `${wallet.plotX},${wallet.plotY}`;
      if (plotFoundationsRef.current && !drawnFoundationsRef.current.has(foundKey)) {
        drawnFoundationsRef.current.add(foundKey);
        drawPlotFoundation(plotFoundationsRef.current, wallet.plotX, wallet.plotY, wallet.colorHue);
      }
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

// ═══════════════════════════════════════════════════════════════════
// City background orchestrator — calls all renderers in order
// ═══════════════════════════════════════════════════════════════════

function drawCityBackground(g: Graphics, propsContainer: Container): void {
  // Step 1-2: Base ground + depth gradient
  drawBaseGround(g);

  // Step 3: Per-plot ground tiles with neighborhood palettes
  drawPlotGrounds(g);

  // Step 3b: Elevation shadows
  drawElevationShadows(g);

  // Step 3c: Organic terrain patches
  drawOrganicPatches(g);

  // Step 4: Road surfaces with street hierarchy
  drawRoads(g);

  // Step 4b: Water canal with docks + embankments
  drawWaterCanal(g);

  // Step 5: Sidewalks
  drawSidewalks(g);

  // Step 5b: Curved overlay roads
  drawCurvedRoads(g);

  // Step 6: Neon accent lines
  drawNeonAccents(g);

  // Step 7: Lane markings
  drawLaneMarkings(g);

  // Step 7b: Parked vehicles
  drawParkedVehicles(g);

  // Step 8-9: Crosswalks, roundabouts, intersection glow
  drawIntersections(g);

  // Step 9b: Elevated diagonal highway
  drawElevatedHighway(g);

  // Step 10: Landmark ground details
  drawLandmarkGrounds(g);

  // Step 10b: Vacant lot art on all non-reserved plots
  drawVacantLots(g);

  // Step 10c: Wet street reflections (neon colored streaks)
  drawWetStreetReflections(g);

  // Step 11: Sprite-based street props
  addStreetProps(propsContainer);

  // Step 12: Atmospheric fog per neighborhood
  drawAtmosphericFog(g);
}
