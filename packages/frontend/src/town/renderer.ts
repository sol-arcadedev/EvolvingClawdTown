import { Application } from 'pixi.js';

export async function createApp(canvas: HTMLCanvasElement): Promise<Application> {
  const app = new Application();

  await app.init({
    canvas,
    resizeTo: window,
    background: 0x0a0a0f,
    antialias: false,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
  });

  return app;
}
