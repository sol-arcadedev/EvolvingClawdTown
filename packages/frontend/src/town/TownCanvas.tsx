import { useEffect, useRef } from 'react';
import { Application, Container, Graphics } from 'pixi.js';
import { useTownStore } from '../hooks/useTownStore';
import { COL_BG, PLOT_STRIDE, PLOT_DISTANCE_MULT } from './constants';
import { setupCamera } from './Camera';
import { drawEnvironment } from './environment';
import { loadBuildingTextures, syncBuildings, updateBeams, updateBuildingLights } from './buildings';
import { createMainframe, updateMainframe, MainframeState } from './mainframe';
import { createParticles, updateParticles, createVignette } from './effects';

export default function TownCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let destroyed = false;
    const app = new Application();

    let mainframeState: MainframeState | null = null;
    let frame = 0;

    (async () => {
      await app.init({
        resizeTo: el,
        backgroundColor: COL_BG,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });
      if (destroyed) { app.destroy(true); return; }

      // Load all building textures before rendering
      await loadBuildingTextures();
      if (destroyed) { app.destroy(true); return; }

      el.appendChild(app.canvas);

      // World container for camera transforms
      const world = new Container();
      app.stage.addChild(world);

      // Center world on screen
      world.x = app.screen.width / 2;
      world.y = app.screen.height / 2;
      world.scale.set(0.45);

      // Layer stack (bottom to top)
      const environmentLayer = new Container();
      const bgParticleLayer = new Container();
      const buildingLayer = new Container();
      const beamLayer = new Container();
      const mainframeLayer = new Container();
      const fgParticleLayer = new Container();

      world.addChild(environmentLayer);
      world.addChild(bgParticleLayer);
      world.addChild(buildingLayer);
      world.addChild(beamLayer);
      world.addChild(mainframeLayer);
      world.addChild(fgParticleLayer);

      // Draw environment (static — dark ground only)
      const envGfx = new Graphics();
      environmentLayer.addChild(envGfx);
      drawEnvironment(envGfx);

      // Particles — split between bg and fg layers
      createParticles(bgParticleLayer);
      createParticles(fgParticleLayer);

      // Create mainframe
      mainframeState = createMainframe(mainframeLayer);

      // Vignette (fixed to stage, not world)
      createVignette(app.stage, app.screen.width, app.screen.height);

      // Camera controls
      const { cleanup: cleanupCamera, panTo } = setupCamera(world, app.canvas as HTMLCanvasElement);

      // Register locate-house callback so HUD search can pan to a building
      useTownStore.getState().setLocateHouse((address: string) => {
        const w = useTownStore.getState().wallets.get(address);
        if (!w) return;
        const wx = w.plotX * PLOT_STRIDE * PLOT_DISTANCE_MULT;
        const wy = w.plotY * PLOT_STRIDE * PLOT_DISTANCE_MULT;
        panTo(wx, wy);
      });

      // Subscribe to store changes (imperative, not React renders)
      const unsub = useTownStore.subscribe((state) => {
        syncBuildings(buildingLayer, beamLayer, state.wallets);
      });

      // Also sync initial state
      const initialState = useTownStore.getState();
      syncBuildings(buildingLayer, beamLayer, initialState.wallets);

      // Ticker for animations
      app.ticker.add(() => {
        frame++;
        if (mainframeState) {
          updateMainframe(mainframeState, frame);
        }
        updateBeams(frame);
        updateBuildingLights(frame);
        updateParticles();
      });

      // Store cleanup references
      (app as any).__cleanup = () => {
        cleanupCamera();
        unsub();
        useTownStore.getState().setLocateHouse(null);
      };
    })();

    return () => {
      destroyed = true;
      if ((app as any).__cleanup) {
        (app as any).__cleanup();
      }
      app.destroy(true, { children: true });
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%',
        height: '100%',
        position: 'absolute',
        top: 0,
        left: 0,
        overflow: 'hidden',
      }}
    />
  );
}
