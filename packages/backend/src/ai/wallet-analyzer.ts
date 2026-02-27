import { log } from '../utils/logger';

export interface WalletPersonality {
  personality: string;
  traits: string[];
  analyzedAt: number;
}

// In-memory cache: wallet → analysis (24h TTL)
const analysisCache = new Map<string, WalletPersonality>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export async function analyzeWallet(
  walletAddress: string,
  heliusApiKey?: string
): Promise<WalletPersonality> {
  // Check cache
  const cached = analysisCache.get(walletAddress);
  if (cached && Date.now() - cached.analyzedAt < CACHE_TTL_MS) {
    return cached;
  }

  if (!heliusApiKey) {
    return getDefaultPersonality(walletAddress);
  }

  try {
    const url = `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions?api-key=${heliusApiKey}&limit=20`;
    const response = await fetch(url);

    if (!response.ok) {
      log.warn(`Helius wallet analysis failed for ${walletAddress.slice(0, 8)}...: ${response.status}`);
      return getDefaultPersonality(walletAddress);
    }

    const txns: any[] = (await response.json()) as any[];
    const personality = classifyFromTransactions(txns, walletAddress);
    analysisCache.set(walletAddress, personality);
    return personality;
  } catch (err) {
    log.warn(`Wallet analysis error for ${walletAddress.slice(0, 8)}...:`, err);
    return getDefaultPersonality(walletAddress);
  }
}

function classifyFromTransactions(txns: any[], walletAddress: string): WalletPersonality {
  const traits: string[] = [];
  let swapCount = 0;
  let nftCount = 0;
  let defiCount = 0;
  let memeTokenCount = 0;

  for (const tx of txns) {
    const type = tx.type || '';
    const source = tx.source || '';

    if (type === 'SWAP' || source.includes('JUPITER') || source.includes('RAYDIUM')) {
      swapCount++;
    }
    if (type.includes('NFT') || source.includes('MAGIC_EDEN') || source.includes('TENSOR')) {
      nftCount++;
    }
    if (source.includes('MARINADE') || source.includes('LIDO') || source.includes('ORCA')) {
      defiCount++;
    }
    if (source.includes('PUMP') || source.includes('MOONSHOT')) {
      memeTokenCount++;
    }
  }

  // Classify personality
  let personality = 'Explorer';

  if (memeTokenCount >= 5) {
    personality = 'Degen Flipper';
    traits.push('memecoin_trader', 'high_frequency');
  } else if (swapCount >= 10) {
    personality = 'Active Trader';
    traits.push('frequent_swapper');
  } else if (defiCount >= 3) {
    personality = 'DeFi Strategist';
    traits.push('yield_farmer', 'defi_native');
  } else if (nftCount >= 3) {
    personality = 'NFT Collector';
    traits.push('art_lover', 'collector');
  } else if (swapCount <= 2 && txns.length >= 5) {
    personality = 'Diamond Hand';
    traits.push('holder', 'patient');
  } else if (txns.length <= 3) {
    personality = 'New Explorer';
    traits.push('newcomer', 'curious');
  }

  if (swapCount >= 5) traits.push('active');
  if (nftCount > 0) traits.push('nft_enthusiast');
  if (defiCount > 0) traits.push('defi_user');

  const result: WalletPersonality = {
    personality,
    traits,
    analyzedAt: Date.now(),
  };

  analysisCache.set(walletAddress, result);
  return result;
}

function getDefaultPersonality(walletAddress: string): WalletPersonality {
  // Deterministic fallback based on wallet address hash
  const hash = simpleHash(walletAddress);
  const personalities = [
    'Explorer', 'Builder', 'Pioneer', 'Settler', 'Adventurer',
    'Architect', 'Wanderer', 'Dreamer',
  ];
  const personality = personalities[hash % personalities.length];

  return {
    personality,
    traits: ['unknown'],
    analyzedAt: Date.now(),
  };
}

function simpleHash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}
