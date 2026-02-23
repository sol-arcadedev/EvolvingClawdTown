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
    preference: 'webgl',
    preferWebGLVersion: 2,
  });

  // Handle WebGL context loss gracefully
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    console.warn('WebGL context lost — will restore on next frame');
  });

  canvas.addEventListener('webglcontextrestored', () => {
    console.log('WebGL context restored');
  });

  return app;
}
