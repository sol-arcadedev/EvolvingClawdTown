import { Container, Text, TextStyle } from 'pixi.js';
import { PLOT_W } from './HouseSprite';

const FLOAT_DURATION = 1500; // ms
const FLOAT_DISTANCE = 30; // pixels to float upward

interface FloatingEntry {
  text: Text;
  elapsed: number;
  startY: number;
}

export class FloatingTextManager {
  private entries: FloatingEntry[] = [];
  private parent: Container;

  constructor(parent: Container) {
    this.parent = parent;
  }

  spawn(worldX: number, worldY: number, label: string, color: number): void {
    const text = new Text({
      text: label,
      style: new TextStyle({
        fontFamily: 'Courier New',
        fontSize: 10,
        fontWeight: 'bold',
        fill: color,
        dropShadow: {
          color: 0x000000,
          blur: 2,
          distance: 1,
        },
      }),
    });
    text.anchor.set(0.5, 1);
    text.x = worldX + PLOT_W / 2;
    text.y = worldY - 4;

    this.parent.addChild(text);
    this.entries.push({ text, elapsed: 0, startY: text.y });
  }

  update(deltaMs: number): void {
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i];
      entry.elapsed += deltaMs;

      const progress = Math.min(1, entry.elapsed / FLOAT_DURATION);
      // Ease out
      const ease = 1 - (1 - progress) * (1 - progress);

      entry.text.y = entry.startY - ease * FLOAT_DISTANCE;
      entry.text.alpha = 1 - progress;

      if (progress >= 1) {
        this.parent.removeChild(entry.text);
        entry.text.destroy();
        this.entries.splice(i, 1);
      }
    }
  }
}
