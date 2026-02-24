export interface WalletState {
  address: string;
  tokenBalance: string;
  plotX: number;
  plotY: number;
  houseTier: number;
  buildProgress: number;
  damagePct: number;
  buildSpeedMult: number;
  boostExpiresAt: string | null;
  colorHue: number;
  firstSeenAt?: string;
  lastUpdatedAt?: string;
  isNew?: boolean;
}

export interface TradeEvent {
  walletAddress: string;
  eventType: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  tokenAmountDelta: string;
  timestamp: string;
}

export type WsMessage =
  | { type: 'snapshot'; wallets: WalletState[]; consoleLines: string[] }
  | { type: 'wallet_update'; wallet: WalletState }
  | { type: 'tick'; updatedCount: number; timestamp: number }
  | { type: 'trade'; event: TradeEvent }
  | { type: 'console_line'; line: string };

export interface SpriteConfig {
  base: string;
  overlay: string | null;
  hue: number;
  animated: boolean;
}

export function getConstructionFrame(buildProgress: number): number {
  if (buildProgress <= 10) return 0;
  if (buildProgress <= 33) return 1;
  if (buildProgress <= 66) return 2;
  return 3;
}

export function getDamageStage(damagePct: number): number {
  if (damagePct <= 0) return 0;
  if (damagePct <= 33) return 1;
  if (damagePct <= 66) return 2;
  return 3;
}

export function resolveSprite(wallet: WalletState): SpriteConfig {
  const isBuilding = wallet.buildProgress < 100;
  const damageStage = getDamageStage(wallet.damagePct);

  if (wallet.tokenBalance === '0' || BigInt(wallet.tokenBalance) <= 0n) {
    return { base: 'empty_lot', overlay: null, hue: wallet.colorHue, animated: false };
  }

  if (isBuilding) {
    return {
      base: `construction_${getConstructionFrame(wallet.buildProgress)}`,
      overlay: null,
      hue: wallet.colorHue,
      animated: false,
    };
  }

  return {
    base: `house_tier_${wallet.houseTier}`,
    overlay: damageStage > 0 ? `damage_${damageStage}` : null,
    hue: wallet.colorHue,
    animated: damageStage >= 2,
  };
}
