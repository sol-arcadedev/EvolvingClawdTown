import { Container } from 'pixi.js';
import { ZOOM_MIN, ZOOM_MAX, ZOOM_SPEED } from './constants';

export function setupCamera(world: Container, canvas: HTMLCanvasElement) {
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let animId: number | null = null;

  const onPointerDown = (e: PointerEvent) => {
    dragging = true;
    lastX = e.clientX;
    lastY = e.clientY;
    canvas.style.cursor = 'grabbing';
    // Cancel any ongoing pan animation on user interaction
    if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    world.x += dx;
    world.y += dy;
  };

  const onPointerUp = () => {
    dragging = false;
    canvas.style.cursor = 'grab';
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
    const delta = -e.deltaY * ZOOM_SPEED;
    const oldScale = world.scale.x;
    const newScale = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, oldScale + delta * oldScale));

    // Zoom toward mouse position
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const worldX = (mx - world.x) / oldScale;
    const worldY = (my - world.y) / oldScale;

    world.scale.set(newScale);
    world.x = mx - worldX * newScale;
    world.y = my - worldY * newScale;
  };

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.style.cursor = 'grab';

  /** Smoothly pan + zoom so that (worldTargetX, worldTargetY) is centered on screen */
  function panTo(worldTargetX: number, worldTargetY: number) {
    if (animId !== null) cancelAnimationFrame(animId);

    const targetScale = 1.2; // zoom in nicely
    const duration = 600; // ms
    const startTime = performance.now();
    const startX = world.x;
    const startY = world.y;
    const startScale = world.scale.x;

    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const endX = cx - worldTargetX * targetScale;
    const endY = cy - worldTargetY * targetScale;

    function step(now: number) {
      const t = Math.min((now - startTime) / duration, 1);
      // ease-out cubic
      const e = 1 - Math.pow(1 - t, 3);

      const s = startScale + (targetScale - startScale) * e;
      world.scale.set(s);
      world.x = startX + (endX - startX) * e;
      world.y = startY + (endY - startY) * e;

      if (t < 1) {
        animId = requestAnimationFrame(step);
      } else {
        animId = null;
      }
    }
    animId = requestAnimationFrame(step);
  }

  const cleanup = () => {
    if (animId !== null) cancelAnimationFrame(animId);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerUp);
    canvas.removeEventListener('wheel', onWheel);
  };

  return { cleanup, panTo };
}
