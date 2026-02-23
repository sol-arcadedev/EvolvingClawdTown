import { Container, Graphics, Sprite, Text, TextStyle } from 'pixi.js';
import { WalletState, getConstructionFrame, getDamageStage } from '../types';
import { getConstructionTexture, getDamageTexture } from './SpriteAssets';
import { getProceduralBuildingTexture } from './BuildingGenerator';

// Plot size on the grid — includes gap for streets
// Sprite frame: 192×288, displayed at 0.5x = 96×144
// Add 32px horizontal and 24px vertical gap for streets
export const PLOT_W = 128;
export const PLOT_H = 168;

const SPRITE_W = 96;
const SPRITE_H = 144;
const SPRITE_SCALE = 96 / 192; // 0.5

// Offset to center sprite within plot (accounting for street gap)
const SPRITE_OFFSET_X = (PLOT_W - SPRITE_W) / 2;
const SPRITE_OFFSET_Y = (PLOT_H - SPRITE_H) / 2;

export class HouseSprite {
  public container: Container;
  public worldX: number;
  public worldY: number;

  get buildProgress(): number { return this.currentState.buildProgress; }

  private buildingSprite: Sprite | null = null;
  private damageSprite: Sprite | null = null;
  private shadowLayer: Graphics;
  private fireLayer: Graphics;
  private boostIndicator: Graphics;
  private glowLayer: Graphics;
  private label: Text;
  private currentState: WalletState;

  // Track what's currently displayed to avoid unnecessary texture swaps
  private _currentTextureKey = '';

  // Animation state
  private _animTime = 0;
  private _hasFire = false;
  private _hasBoosted = false;
  private _isBuilding = false;
  private _shimmerAlpha = 0;

  constructor(wallet: WalletState) {
    this.currentState = wallet;
    this.container = new Container();

    this.worldX = wallet.plotX * PLOT_W;
    this.worldY = wallet.plotY * PLOT_H;
    this.container.x = this.worldX;
    this.container.y = this.worldY;

    // Glow layer (behind everything)
    this.glowLayer = new Graphics();
    this.container.addChild(this.glowLayer);

    // Ground shadow layer (behind building, above glow)
    this.shadowLayer = new Graphics();
    this.container.addChild(this.shadowLayer);

    this.fireLayer = new Graphics();
    this.boostIndicator = new Graphics();

    this.label = new Text({
      text: wallet.address.slice(0, 4),
      style: new TextStyle({
        fontFamily: 'Courier New',
        fontSize: 9,
        fill: 0x888899,
        align: 'center',
      }),
    });
    this.label.anchor.set(0.5, 0);
    this.label.x = PLOT_W / 2;
    this.label.y = SPRITE_OFFSET_Y + SPRITE_H - 10;

    this.container.addChild(this.fireLayer);
    this.container.addChild(this.boostIndicator);
    this.container.addChild(this.label);

    this.draw();
  }

  update(wallet: WalletState): void {
    const prevProgress = this.currentState.buildProgress;
    this.currentState = wallet;
    this.draw();
    // Trigger shimmer on progress change
    if (wallet.buildProgress !== prevProgress) {
      this.triggerShimmer();
    }
  }

  animateTick(deltaMs: number): void {
    this._animTime += deltaMs;

    if (this._hasFire) {
      this.drawFireAnimation();
    }

    if (this._hasBoosted) {
      this.drawBoostPulse();
    }

    if (this._isBuilding) {
      this.drawConstructionPulse();
    }

    if (this._shimmerAlpha > 0) {
      this._shimmerAlpha = Math.max(0, this._shimmerAlpha - deltaMs / 800);
      if (this.buildingSprite) {
        this.buildingSprite.alpha = 0.85 + this._shimmerAlpha * 0.15;
      }
    }

    // Subtle idle glow for completed buildings
    if (!this._isBuilding && this.buildingSprite && this.currentState.buildProgress >= 100) {
      this.drawIdleGlow();
    }
  }

  triggerShimmer(): void {
    this._shimmerAlpha = 1;
    if (this.buildingSprite) this.buildingSprite.alpha = 1;
  }

  private draw(): void {
    const w = this.currentState;
    const balance = BigInt(w.tokenBalance);

    this.fireLayer.clear();
    this.boostIndicator.clear();
    this.glowLayer.clear();
    this.shadowLayer.clear();

    if (balance <= 0n) {
      this.setTexture('empty');
      this._hasFire = false;
      this._hasBoosted = false;
      this._isBuilding = false;
      return;
    }

    // Draw ground shadow cast by building (offset to bottom-right for top-left light)
    this.drawGroundShadow(w.houseTier);

    if (w.buildProgress < 100) {
      const frame = getConstructionFrame(w.buildProgress);
      this.setConstructionTexture(frame);
      this._isBuilding = true;
    } else {
      this.setHouseTexture(w.houseTier);
      this._isBuilding = false;
    }

    // Damage overlay
    const damageStage = getDamageStage(w.damagePct);
    this.setDamageTexture(damageStage);
    this._hasFire = damageStage >= 2;

    // Boost indicator
    this._hasBoosted = w.buildSpeedMult > 1;
    if (this._hasBoosted) {
      this.drawBoostIndicator();
    }
  }

  private setTexture(key: string): void {
    if (this._currentTextureKey === key) return;
    this._currentTextureKey = key;

    if (this.buildingSprite) {
      this.container.removeChild(this.buildingSprite);
      this.buildingSprite.destroy();
      this.buildingSprite = null;
    }
    this.clearDamageSprite();

    if (key === 'empty') return;
  }

  private setHouseTexture(tier: number): void {
    // Use procedural building — unique per wallet address + tier
    const key = `proc_${this.currentState.address}_${tier}`;
    if (this._currentTextureKey === key) return;
    this._currentTextureKey = key;

    const texture = getProceduralBuildingTexture(this.currentState.address, tier);
    this.replaceBuildingSprite(texture);
  }

  private setConstructionTexture(frame: number): void {
    const key = `construction_${frame}`;
    if (this._currentTextureKey === key) return;
    this._currentTextureKey = key;

    const texture = getConstructionTexture(frame);
    if (!texture) return;

    this.replaceBuildingSprite(texture);
  }

  private setDamageTexture(stage: number): void {
    if (stage <= 0) {
      this.clearDamageSprite();
      return;
    }

    const texture = getDamageTexture(stage);
    if (!texture) return;

    if (!this.damageSprite) {
      this.damageSprite = new Sprite(texture);
      this.damageSprite.scale.set(SPRITE_SCALE);
      this.damageSprite.x = SPRITE_OFFSET_X;
      this.damageSprite.y = SPRITE_OFFSET_Y;
      const fireIdx = this.container.getChildIndex(this.fireLayer);
      this.container.addChildAt(this.damageSprite, fireIdx);
    } else {
      this.damageSprite.texture = texture;
    }
  }

  private clearDamageSprite(): void {
    if (this.damageSprite) {
      this.container.removeChild(this.damageSprite);
      this.damageSprite.destroy();
      this.damageSprite = null;
    }
  }

  private replaceBuildingSprite(texture: import('pixi.js').Texture): void {
    if (this.buildingSprite) {
      this.container.removeChild(this.buildingSprite);
      this.buildingSprite.destroy();
    }

    this.buildingSprite = new Sprite(texture);
    this.buildingSprite.scale.set(SPRITE_SCALE);
    this.buildingSprite.x = SPRITE_OFFSET_X;
    this.buildingSprite.y = SPRITE_OFFSET_Y;

    // Insert above shadow layer (index 2: glow=0, shadow=1, building=2)
    this.container.addChildAt(this.buildingSprite, 2);
  }

  /** Ground shadow cast by the building — top-left light source */
  private drawGroundShadow(tier: number): void {
    const tierIdx = Math.max(0, Math.min(4, tier - 1));
    // Shadow size grows with tier (taller buildings = longer shadows)
    const shadowOffX = 6 + tierIdx * 2;
    const shadowOffY = 4 + tierIdx * 2;
    const shadowW = SPRITE_W * (0.7 + tierIdx * 0.05);
    const shadowH = SPRITE_H * (0.15 + tierIdx * 0.04);

    const sx = SPRITE_OFFSET_X + (SPRITE_W - shadowW) / 2 + shadowOffX;
    const sy = SPRITE_OFFSET_Y + SPRITE_H - shadowH + shadowOffY;

    // Soft outer shadow (larger, lighter)
    this.shadowLayer.ellipse(sx + shadowW / 2, sy + shadowH / 2, shadowW / 2 + 4, shadowH / 2 + 3);
    this.shadowLayer.fill({ color: 0x000000, alpha: 0.12 });

    // Core shadow (smaller, darker)
    this.shadowLayer.ellipse(sx + shadowW / 2, sy + shadowH / 2, shadowW / 2, shadowH / 2);
    this.shadowLayer.fill({ color: 0x000000, alpha: 0.25 });

    // Hard edge shadow strip along building base (right + bottom sides)
    this.shadowLayer.moveTo(SPRITE_OFFSET_X + SPRITE_W, SPRITE_OFFSET_Y + SPRITE_H);
    this.shadowLayer.lineTo(SPRITE_OFFSET_X + SPRITE_W + shadowOffX, SPRITE_OFFSET_Y + SPRITE_H + shadowOffY);
    this.shadowLayer.lineTo(SPRITE_OFFSET_X + shadowOffX, SPRITE_OFFSET_Y + SPRITE_H + shadowOffY);
    this.shadowLayer.lineTo(SPRITE_OFFSET_X, SPRITE_OFFSET_Y + SPRITE_H);
    this.shadowLayer.fill({ color: 0x000000, alpha: 0.18 });
  }

  /** Pulsing construction animation — scaffold glow + progress bar */
  private drawConstructionPulse(): void {
    const progress = this.currentState.buildProgress;
    const t = this._animTime / 1000;
    const pulse = 0.15 + Math.sin(t * 2.5) * 0.1;

    const cx = PLOT_W / 2;
    const cy = SPRITE_OFFSET_Y + SPRITE_H * 0.5;

    // Pulsing glow behind construction
    this.glowLayer.clear();
    this.glowLayer.circle(cx, cy, SPRITE_W * 0.4);
    this.glowLayer.fill({ color: 0x00fff5, alpha: pulse * 0.12 });

    // Progress bar at bottom
    const barX = SPRITE_OFFSET_X + 4;
    const barY = SPRITE_OFFSET_Y + SPRITE_H + 2;
    const barW = SPRITE_W - 8;
    const barH = 3;

    // Background
    this.glowLayer.rect(barX, barY, barW, barH);
    this.glowLayer.fill({ color: 0x111122, alpha: 0.8 });

    // Fill
    const fillW = (progress / 100) * barW;
    this.glowLayer.rect(barX, barY, fillW, barH);
    this.glowLayer.fill({ color: 0x00fff5, alpha: 0.7 + Math.sin(t * 3) * 0.15 });

    // Animate sprite alpha slightly for "working" effect
    if (this.buildingSprite) {
      this.buildingSprite.alpha = 0.8 + Math.sin(t * 2) * 0.1;
    }
  }

  /** Subtle idle glow for completed buildings — holographic accent */
  private drawIdleGlow(): void {
    const hue = this.currentState.colorHue;
    const t = this._animTime / 2000;
    const alpha = 0.04 + Math.sin(t * 1.5) * 0.02;
    const tier = this.currentState.houseTier;

    this.glowLayer.clear();

    // Base glow — color matched to house hue
    const cx = PLOT_W / 2;
    const cy = SPRITE_OFFSET_Y + SPRITE_H * 0.45;
    const radius = (SPRITE_W * 0.35) + tier * 4;

    // Convert HSL hue to approximate RGB for PixiJS
    const color = hslToHex(hue, 80, 65);
    this.glowLayer.circle(cx, cy, radius);
    this.glowLayer.fill({ color, alpha });

    // Top highlight line for higher tiers
    if (tier >= 3) {
      const lineAlpha = 0.08 + Math.sin(t * 2 + 1) * 0.04;
      this.glowLayer.moveTo(SPRITE_OFFSET_X + 8, SPRITE_OFFSET_Y + 2);
      this.glowLayer.lineTo(SPRITE_OFFSET_X + SPRITE_W - 8, SPRITE_OFFSET_Y + 2);
      this.glowLayer.stroke({ color: 0x00fff5, width: 1, alpha: lineAlpha });
    }
  }

  /** Animated fire flicker for heavy damage */
  private drawFireAnimation(): void {
    const w = this.currentState;
    this.fireLayer.clear();

    const t = this._animTime / 150;
    const flickerCount = getDamageStage(w.damagePct) >= 3 ? 6 : 3;

    for (let i = 0; i < flickerCount; i++) {
      const phase = t + i * 2.3;
      const fx = SPRITE_OFFSET_X + SPRITE_W * 0.2 + (Math.sin(phase * 1.7 + i) * 0.5 + 0.5) * SPRITE_W * 0.6;
      const fy = SPRITE_OFFSET_Y + SPRITE_H * 0.3 + (Math.sin(phase * 0.8 + i * 1.1) * 0.5 + 0.5) * SPRITE_H * 0.4;
      const r = 2 + Math.sin(phase * 2.1) * 1.5;
      const alpha = 0.3 + Math.sin(phase * 1.3) * 0.15;

      this.fireLayer.circle(fx, fy, r + 2);
      this.fireLayer.fill({ color: 0xff2200, alpha: alpha * 0.4 });
      this.fireLayer.circle(fx, fy, r);
      this.fireLayer.fill({ color: 0xff6600, alpha });
      this.fireLayer.circle(fx, fy - 1, r * 0.5);
      this.fireLayer.fill({ color: 0xffcc00, alpha: alpha * 0.8 });
    }
  }

  /** Static boost speed lines */
  private drawBoostIndicator(): void {
    const mult = this.currentState.buildSpeedMult;
    const count = Math.min(Math.floor(mult), 5);
    const ax = SPRITE_OFFSET_X + SPRITE_W - 4;

    for (let i = 0; i < count; i++) {
      const ly = SPRITE_OFFSET_Y + 20 + i * 8;
      this.boostIndicator.moveTo(ax, ly + 5);
      this.boostIndicator.lineTo(ax, ly);
      this.boostIndicator.lineTo(ax + 3, ly + 2.5);
      this.boostIndicator.stroke({ color: 0x00ff88, width: 1, alpha: 0.7 });
    }
  }

  /** Animated boost pulse ring */
  private drawBoostPulse(): void {
    const cx = PLOT_W / 2;
    const cy = SPRITE_OFFSET_Y + SPRITE_H * 0.4;
    const phase = (this._animTime / 1200) % 1;
    const ringR = (SPRITE_W / 2) * (0.6 + phase * 0.4);
    const alpha = 0.25 * (1 - phase);

    this.boostIndicator.circle(cx, cy, ringR);
    this.boostIndicator.stroke({ color: 0x00ff88, width: 1, alpha });
  }
}

/** Convert HSL to hex color for PixiJS */
function hslToHex(h: number, s: number, l: number): number {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color);
  };
  return (f(0) << 16) | (f(8) << 8) | f(4);
}
