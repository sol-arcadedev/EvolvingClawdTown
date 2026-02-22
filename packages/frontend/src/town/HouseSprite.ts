import { Container, Graphics, Sprite, Text, TextStyle, ColorMatrixFilter } from 'pixi.js';
import { WalletState, getConstructionFrame, getDamageStage } from '../types';
import { getHouseTexture, getConstructionTexture, getDamageTexture } from './SpriteAssets';

// Plot size on the grid (matches 0.5× scale of 192×288 sprite frames)
export const PLOT_W = 96;
export const PLOT_H = 144;

// Scale factor: sprite frame (192×288) → plot size (96×144)
const SPRITE_SCALE = 96 / 192; // 0.5

export class HouseSprite {
  public container: Container;
  public worldX: number;
  public worldY: number;

  private buildingSprite: Sprite | null = null;
  private damageSprite: Sprite | null = null;
  private fireLayer: Graphics;
  private boostIndicator: Graphics;
  private label: Text;
  private currentState: WalletState;

  // Track what's currently displayed to avoid unnecessary texture swaps
  private _currentTextureKey = '';

  // Animation state
  private _animTime = 0;
  private _hasFire = false;
  private _hasBoosted = false;
  private _shimmerAlpha = 0;

  constructor(wallet: WalletState) {
    this.currentState = wallet;
    this.container = new Container();

    this.worldX = wallet.plotX * PLOT_W;
    this.worldY = wallet.plotY * PLOT_H;
    this.container.x = this.worldX;
    this.container.y = this.worldY;

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
    this.label.y = PLOT_H - 12;

    this.container.addChild(this.fireLayer);
    this.container.addChild(this.boostIndicator);
    this.container.addChild(this.label);

    this.draw();
  }

  update(wallet: WalletState): void {
    this.currentState = wallet;
    this.draw();
  }

  animateTick(deltaMs: number): void {
    this._animTime += deltaMs;

    if (this._hasFire) {
      this.drawFireAnimation();
    }

    if (this._hasBoosted) {
      this.drawBoostPulse();
    }

    if (this._shimmerAlpha > 0) {
      this._shimmerAlpha = Math.max(0, this._shimmerAlpha - deltaMs / 800);
      if (this.buildingSprite) {
        this.buildingSprite.alpha = 0.85 + this._shimmerAlpha * 0.15;
      }
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

    if (balance <= 0n) {
      this.setTexture('empty');
      this._hasFire = false;
      this._hasBoosted = false;
      return;
    }

    if (w.buildProgress < 100) {
      const frame = getConstructionFrame(w.buildProgress);
      this.setConstructionTexture(frame);
    } else {
      this.setHouseTexture(w.houseTier);
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

    // Remove old building sprite
    if (this.buildingSprite) {
      this.container.removeChild(this.buildingSprite);
      this.buildingSprite.destroy();
      this.buildingSprite = null;
    }
    // Remove damage overlay
    this.clearDamageSprite();

    if (key === 'empty') return; // nothing to show
  }

  private setHouseTexture(tier: number): void {
    const key = `house_${tier}`;
    if (this._currentTextureKey === key) {
      this.applyHueTint();
      return;
    }
    this._currentTextureKey = key;

    const texture = getHouseTexture(tier);
    if (!texture) return;

    this.replaceBuildingSprite(texture);
    this.applyHueTint();
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
      // Insert damage above building but below fire/boost/label
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

    // Insert at the bottom of the display list (behind overlays)
    this.container.addChildAt(this.buildingSprite, 0);
  }

  private applyHueTint(): void {
    if (!this.buildingSprite) return;
    const hue = this.currentState.colorHue;
    if (hue === 0) {
      this.buildingSprite.filters = [];
      return;
    }
    const filter = new ColorMatrixFilter();
    filter.hue(hue, false);
    this.buildingSprite.filters = [filter];
  }

  /** Animated fire flicker for heavy damage */
  private drawFireAnimation(): void {
    const w = this.currentState;
    this.fireLayer.clear();

    const t = this._animTime / 150;
    const flickerCount = getDamageStage(w.damagePct) >= 3 ? 6 : 3;

    for (let i = 0; i < flickerCount; i++) {
      const phase = t + i * 2.3;
      const fx = PLOT_W * 0.2 + (Math.sin(phase * 1.7 + i) * 0.5 + 0.5) * PLOT_W * 0.6;
      const fy = PLOT_H * 0.3 + (Math.sin(phase * 0.8 + i * 1.1) * 0.5 + 0.5) * PLOT_H * 0.4;
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
    const ax = PLOT_W - 6;

    for (let i = 0; i < count; i++) {
      const ly = 20 + i * 8;
      this.boostIndicator.moveTo(ax, ly + 5);
      this.boostIndicator.lineTo(ax, ly);
      this.boostIndicator.lineTo(ax + 3, ly + 2.5);
      this.boostIndicator.stroke({ color: 0x00ff88, width: 1, alpha: 0.7 });
    }
  }

  /** Animated boost pulse ring */
  private drawBoostPulse(): void {
    const cx = PLOT_W / 2;
    const cy = PLOT_H * 0.4;
    const phase = (this._animTime / 1200) % 1;
    const ringR = (PLOT_W / 2) * (0.6 + phase * 0.4);
    const alpha = 0.25 * (1 - phase);

    this.boostIndicator.circle(cx, cy, ringR);
    this.boostIndicator.stroke({ color: 0x00ff88, width: 1, alpha });
  }
}
