import { Container } from 'pixi.js';

export class Camera {
  public x = 0;
  public y = 0;
  public zoom = 1;

  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private camStartX = 0;
  private camStartY = 0;

  private minZoom = 0.2;
  private maxZoom = 3;

  constructor(
    private container: Container,
    private canvas: HTMLCanvasElement
  ) {
    this.setupControls();
  }

  private setupControls(): void {
    const el = this.canvas;

    // Pan — mouse drag
    el.addEventListener('pointerdown', (e) => {
      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      this.camStartX = this.x;
      this.camStartY = this.y;
      el.style.cursor = 'grabbing';
    });

    window.addEventListener('pointermove', (e) => {
      if (!this.isDragging) return;
      const dx = e.clientX - this.dragStartX;
      const dy = e.clientY - this.dragStartY;
      this.x = this.camStartX + dx / this.zoom;
      this.y = this.camStartY + dy / this.zoom;
      this.applyTransform();
    });

    window.addEventListener('pointerup', () => {
      this.isDragging = false;
      el.style.cursor = 'grab';
    });

    // Zoom — scroll wheel
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * zoomFactor));

      // Zoom toward mouse position
      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldXBefore = (mouseX - this.container.x) / this.zoom;
      const worldYBefore = (mouseY - this.container.y) / this.zoom;

      this.zoom = newZoom;

      const worldXAfter = (mouseX - this.container.x) / this.zoom;
      const worldYAfter = (mouseY - this.container.y) / this.zoom;

      this.x += worldXAfter - worldXBefore;
      this.y += worldYAfter - worldYBefore;

      this.applyTransform();
    }, { passive: false });

    // Touch pinch zoom
    let lastTouchDist = 0;
    el.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        lastTouchDist = Math.sqrt(dx * dx + dy * dy);
      }
    });

    el.addEventListener('touchmove', (e) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const scale = dist / lastTouchDist;
        this.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * scale));
        lastTouchDist = dist;
        this.applyTransform();
      }
    }, { passive: false });

    el.style.cursor = 'grab';
  }

  applyTransform(): void {
    this.container.scale.set(this.zoom);
    this.container.x = this.x * this.zoom + this.canvas.width / 2;
    this.container.y = this.y * this.zoom + this.canvas.height / 2;
  }

  centerOn(worldX: number, worldY: number): void {
    this.x = -worldX;
    this.y = -worldY;
    this.applyTransform();
  }

  getViewportBounds(): { left: number; top: number; right: number; bottom: number } {
    const halfW = this.canvas.width / 2 / this.zoom;
    const halfH = this.canvas.height / 2 / this.zoom;
    const cx = -this.x;
    const cy = -this.y;
    return {
      left: cx - halfW,
      top: cy - halfH,
      right: cx + halfW,
      bottom: cy + halfH,
    };
  }
}
