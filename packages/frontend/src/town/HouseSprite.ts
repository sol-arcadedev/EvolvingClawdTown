import { Container, Graphics, Text, TextStyle, ColorMatrixFilter } from 'pixi.js';
import { WalletState, getConstructionFrame, getDamageStage } from '../types';

// Plot size on the grid (pixels)
export const PLOT_W = 64;
export const PLOT_H = 80;

// Neon base color (cyan) and tier height multipliers
const NEON_CYAN = 0x00fff5;
const TIER_HEIGHTS = [0, 20, 32, 48, 64, 80];
const TIER_WIDTHS = [0, 24, 32, 40, 48, 56];

// Damage overlay colors
const DAMAGE_COLORS = [0x000000, 0xffaa00, 0xff4400, 0x880000];

// Seeded random for consistent crack/rubble positions per address
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashAddress(address: string): number {
  let h = 0;
  for (let i = 0; i < address.length; i++) {
    h = ((h << 5) - h + address.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export class HouseSprite {
  public container: Container;
  public worldX: number;
  public worldY: number;

  private building: Graphics;
  private neonGlow: Graphics;
  private damageOverlay: Graphics;
  private fireLayer: Graphics;
  private boostIndicator: Graphics;
  private label: Text;
  private currentState: WalletState;

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

    this.building = new Graphics();
    this.neonGlow = new Graphics();
    this.damageOverlay = new Graphics();
    this.fireLayer = new Graphics();
    this.boostIndicator = new Graphics();

    this.label = new Text({
      text: wallet.address.slice(0, 4),
      style: new TextStyle({
        fontFamily: 'Courier New',
        fontSize: 8,
        fill: 0x888888,
        align: 'center',
      }),
    });
    this.label.anchor.set(0.5, 0);
    this.label.x = PLOT_W / 2;
    this.label.y = PLOT_H - 10;

    this.container.addChild(this.building);
    this.container.addChild(this.neonGlow);
    this.container.addChild(this.damageOverlay);
    this.container.addChild(this.fireLayer);
    this.container.addChild(this.boostIndicator);
    this.container.addChild(this.label);

    this.applyHueTint(wallet.colorHue);
    this.draw();
  }

  update(wallet: WalletState): void {
    const prevHue = this.currentState.colorHue;
    this.currentState = wallet;
    if (wallet.colorHue !== prevHue) {
      this.applyHueTint(wallet.colorHue);
    }
    this.draw();
  }

  /** Called every frame by the PixiJS ticker. deltaMs = milliseconds since last frame. */
  animateTick(deltaMs: number): void {
    this._animTime += deltaMs;

    // Fire flicker
    if (this._hasFire) {
      this.drawFireAnimation();
    }

    // Boost pulse
    if (this._hasBoosted) {
      this.drawBoostPulse();
    }

    // Shimmer fade-out after tick pulse
    if (this._shimmerAlpha > 0) {
      this._shimmerAlpha = Math.max(0, this._shimmerAlpha - deltaMs / 800);
      this.neonGlow.alpha = 0.7 + this._shimmerAlpha * 0.3;
    }
  }

  /** Trigger a brief shimmer/pulse (called on game tick events) */
  triggerShimmer(): void {
    this._shimmerAlpha = 1;
    this.neonGlow.alpha = 1;
  }

  private applyHueTint(hue: number): void {
    const filter = new ColorMatrixFilter();
    filter.hue(hue, false);
    this.neonGlow.filters = [filter];
  }

  private draw(): void {
    const w = this.currentState;
    const balance = BigInt(w.tokenBalance);

    this.building.clear();
    this.neonGlow.clear();
    this.damageOverlay.clear();
    this.fireLayer.clear();
    this.boostIndicator.clear();

    // Plot base
    this.building.rect(2, PLOT_H - 14, PLOT_W - 4, 12);
    this.building.fill(0x1a1a2e);
    this.building.stroke({ color: 0x222244, width: 1 });

    if (balance <= 0n) {
      this.drawEmptyLot();
      this._hasFire = false;
      this._hasBoosted = false;
      return;
    }

    if (w.buildProgress < 100) {
      this.drawConstruction(w);
    } else {
      this.drawCompletedHouse(w);
    }

    // Damage overlay
    const damageStage = getDamageStage(w.damagePct);
    if (damageStage > 0) {
      this.drawDamage(w, damageStage);
    }
    this._hasFire = damageStage >= 2;

    // Boost indicator
    this._hasBoosted = w.buildSpeedMult > 1;
    if (this._hasBoosted) {
      this.drawBoostIndicator(w);
    }
  }

  private drawEmptyLot(): void {
    this.building.rect(PLOT_W / 2 - 8, PLOT_H - 24, 16, 10);
    this.building.fill(0x111122);
  }

  private drawConstruction(w: WalletState): void {
    const frame = getConstructionFrame(w.buildProgress);
    const tier = w.houseTier || 1;
    const maxH = TIER_HEIGHTS[tier] || 20;
    const maxW = TIER_WIDTHS[tier] || 24;
    const cx = PLOT_W / 2;
    const baseY = PLOT_H - 14;

    switch (frame) {
      case 0: {
        this.building.rect(cx - maxW / 2, baseY - 4, maxW, 4);
        this.building.fill(0x333355);
        break;
      }
      case 1: {
        const h = maxH * 0.3;
        this.building.rect(cx - maxW / 2, baseY - 6, maxW, 6);
        this.building.fill(0x444466);
        this.building.rect(cx - maxW / 2 + 2, baseY - 6 - h, 3, h);
        this.building.fill(0x666688);
        this.building.rect(cx + maxW / 2 - 5, baseY - 6 - h, 3, h);
        this.building.fill(0x666688);
        this.neonGlow.rect(cx - 1, baseY - 6 - h - 8, 2, 8);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx - 6, baseY - 6 - h - 8, 12, 2);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
      case 2: {
        const h = maxH * 0.6;
        this.building.rect(cx - maxW / 2, baseY - h, maxW, h);
        this.building.fill(0x2a2a4a);
        this.building.stroke({ color: 0x444466, width: 1 });
        for (let i = 0; i < 3; i++) {
          const sy = baseY - h + (h / 3) * i;
          this.building.rect(cx - maxW / 2 - 3, sy, maxW + 6, 1);
          this.building.fill(0x555577);
        }
        this.neonGlow.circle(cx, baseY - h - 4, 3);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
      case 3: {
        const h = maxH * 0.9;
        this.building.rect(cx - maxW / 2, baseY - h, maxW, h);
        this.building.fill(0x1e1e3a);
        this.building.stroke({ color: 0x333355, width: 1 });
        this.drawWindows(cx, baseY, maxW, h, 0x222244);
        this.building.rect(cx - maxW / 2 - 2, baseY - h - 4, maxW + 4, 4);
        this.building.fill(0x444466);
        this.neonGlow.rect(cx - maxW / 2, baseY - h, maxW, 2);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
    }
  }

  private drawCompletedHouse(w: WalletState): void {
    const tier = w.houseTier;
    const h = TIER_HEIGHTS[tier] || 20;
    const bw = TIER_WIDTHS[tier] || 24;
    const cx = PLOT_W / 2;
    const baseY = PLOT_H - 14;

    this.building.rect(cx - bw / 2, baseY - h, bw, h);
    this.building.fill(0x1a1a35);
    this.building.stroke({ color: 0x2a2a50, width: 1 });
    this.drawWindows(cx, baseY, bw, h, 0x334455);

    switch (tier) {
      case 1: {
        this.neonGlow.rect(cx - bw / 2, baseY - h, bw, 2);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
      case 2: {
        this.neonGlow.rect(cx - bw / 2, baseY - h, bw, 2);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx - 3, baseY - 10, 6, 10);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
      case 3: {
        this.neonGlow.rect(cx - bw / 2, baseY - h, bw, 2);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx - bw / 2, baseY - h / 2, bw, 1);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx - bw / 2, baseY - h, 2, h);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx + bw / 2 - 2, baseY - h, 2, h);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
      case 4: {
        this.neonGlow.rect(cx - bw / 2, baseY - h, bw, 2);
        this.neonGlow.fill(NEON_CYAN);
        for (let i = 1; i < 4; i++) {
          this.neonGlow.rect(cx - bw / 2, baseY - (h / 4) * i, bw, 1);
          this.neonGlow.fill(NEON_CYAN);
        }
        this.neonGlow.rect(cx - 1, baseY - h - 10, 2, 10);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.circle(cx, baseY - h - 12, 2);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
      case 5: {
        this.neonGlow.rect(cx - bw / 2, baseY - h, bw, 3);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx - bw / 2, baseY - h, 2, h);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.rect(cx + bw / 2 - 2, baseY - h, 2, h);
        this.neonGlow.fill(NEON_CYAN);
        for (let i = 1; i <= 5; i++) {
          this.neonGlow.rect(cx - bw / 2, baseY - (h / 6) * i, bw, 1);
          this.neonGlow.fill(NEON_CYAN);
        }
        this.neonGlow.rect(cx - 1, baseY - h - 16, 2, 16);
        this.neonGlow.fill(NEON_CYAN);
        this.neonGlow.circle(cx, baseY - h - 18, 3);
        this.neonGlow.fill(NEON_CYAN);
        break;
      }
    }
  }

  private drawWindows(cx: number, baseY: number, bw: number, h: number, color: number): void {
    const windowSize = 4;
    const cols = Math.floor(bw / 10);
    const rows = Math.floor(h / 12);
    const startX = cx - (cols * 8) / 2 + 2;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const wx = startX + col * 8;
        const wy = baseY - h + 6 + row * 12;
        this.building.rect(wx, wy, windowSize, windowSize);
        this.building.fill(color);
      }
    }
  }

  private drawDamage(w: WalletState, stage: number): void {
    const tier = w.houseTier;
    const h = TIER_HEIGHTS[tier] || 20;
    const bw = TIER_WIDTHS[tier] || 24;
    const cx = PLOT_W / 2;
    const baseY = PLOT_H - 14;
    const color = DAMAGE_COLORS[stage];
    const rng = seededRandom(hashAddress(w.address));

    this.damageOverlay.setStrokeStyle({ color, width: 1, alpha: 0.6 });

    if (stage >= 1) {
      for (let i = 0; i < stage * 2; i++) {
        const sx = cx - bw / 2 + rng() * bw;
        const sy = baseY - rng() * h;
        this.damageOverlay.moveTo(sx, sy);
        this.damageOverlay.lineTo(sx + (rng() - 0.5) * 8, sy + rng() * 6);
        this.damageOverlay.stroke();
      }
    }

    if (stage >= 3) {
      // Ruin overlay
      this.damageOverlay.rect(cx - bw / 2, baseY - h, bw, h);
      this.damageOverlay.fill({ color: 0x000000, alpha: 0.5 });
      for (let i = 0; i < 5; i++) {
        const rx = cx - bw / 2 + rng() * bw;
        const ry = baseY - rng() * 8;
        this.damageOverlay.rect(rx, ry, 3 + rng() * 4, 2 + rng() * 3);
        this.damageOverlay.fill({ color: 0x333333, alpha: 0.8 });
      }
    }
    // Fire for stages 2+ is drawn in animateTick via drawFireAnimation
  }

  /** Animated fire flicker — redrawn every frame */
  private drawFireAnimation(): void {
    const w = this.currentState;
    const tier = w.houseTier;
    const h = TIER_HEIGHTS[tier] || 20;
    const bw = TIER_WIDTHS[tier] || 24;
    const cx = PLOT_W / 2;
    const baseY = PLOT_H - 14;

    this.fireLayer.clear();

    const t = this._animTime / 150; // speed of flicker
    const flickerCount = getDamageStage(w.damagePct) >= 3 ? 5 : 3;

    for (let i = 0; i < flickerCount; i++) {
      const phase = t + i * 2.3;
      const fx = cx - bw / 3 + (Math.sin(phase * 1.7 + i) * 0.5 + 0.5) * (bw * 0.66);
      const fy = baseY - h * 0.2 - Math.abs(Math.sin(phase)) * h * 0.5;
      const r = 2 + Math.sin(phase * 2.1) * 1.5;
      const alpha = 0.3 + Math.sin(phase * 1.3) * 0.15;

      // Outer glow
      this.fireLayer.circle(fx, fy, r + 2);
      this.fireLayer.fill({ color: 0xff2200, alpha: alpha * 0.4 });
      // Inner flame
      this.fireLayer.circle(fx, fy, r);
      this.fireLayer.fill({ color: 0xff6600, alpha });
      // Bright core
      this.fireLayer.circle(fx, fy - 1, r * 0.5);
      this.fireLayer.fill({ color: 0xffcc00, alpha: alpha * 0.8 });
    }
  }

  /** Static boost indicator (the lightning bolt/ring) */
  private drawBoostIndicator(w: WalletState): void {
    const tier = w.houseTier || 1;
    const h = TIER_HEIGHTS[tier] || 20;
    const cx = PLOT_W / 2;
    const baseY = PLOT_H - 14;
    const topY = baseY - h;

    // Small upward arrow / speed lines on the right side
    const ax = cx + (TIER_WIDTHS[tier] || 24) / 2 + 4;
    for (let i = 0; i < Math.min(Math.floor(w.buildSpeedMult), 5); i++) {
      const ly = topY + 4 + i * 6;
      this.boostIndicator.moveTo(ax, ly + 4);
      this.boostIndicator.lineTo(ax, ly);
      this.boostIndicator.lineTo(ax + 2, ly + 2);
      this.boostIndicator.stroke({ color: 0x00ff88, width: 1, alpha: 0.7 });
    }
  }

  /** Animated boost pulse ring */
  private drawBoostPulse(): void {
    const w = this.currentState;
    const tier = w.houseTier || 1;
    const bw = TIER_WIDTHS[tier] || 24;
    const h = TIER_HEIGHTS[tier] || 20;
    const cx = PLOT_W / 2;
    const baseY = PLOT_H - 14;
    const centerY = baseY - h / 2;

    const phase = (this._animTime / 1200) % 1; // 0..1 cycle
    const ringR = (bw / 2 + 4) * (0.8 + phase * 0.4);
    const alpha = 0.25 * (1 - phase);

    // Pulsing ring
    this.boostIndicator.circle(cx, centerY, ringR);
    this.boostIndicator.stroke({ color: 0x00ff88, width: 1, alpha });
  }
}
