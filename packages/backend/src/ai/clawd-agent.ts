import { VertexAI } from '@google-cloud/vertexai';
import { log } from '../utils/logger';
import type { WalletTradeStats } from '../db/queries';
import {
  CLAWD_SYSTEM_PROMPT,
  BUILDING_DECISION_PROMPT,
  DAMAGE_DECISION_PROMPT,
  BehaviorPattern,
} from './clawd-prompt';

export interface HolderProfile {
  walletAddress: string;
  tokenBalance: bigint;
  tier: number;
  supplyPercent: number;
  holdDurationMs: number;
  eventType: 'buy' | 'sell' | 'transfer_in' | 'transfer_out';
  isNewHolder: boolean;
  tradingPersonality?: string;
  existingBuildingName?: string | null;
  existingStyle?: string | null;
  damagePct: number;
  tokenAmountThisTx: bigint;
  tradeStats: WalletTradeStats;
  behaviorPattern: BehaviorPattern;
  behaviorTheme: string;
}

export interface ClawdDecision {
  building_name: string;
  architectural_style: string;
  description: string;
  image_prompt: string;
  clawd_comment: string;
  evolution_hint: string;
}

const PRIMARY_MODEL = process.env.CLAWD_MODEL || 'gemini-2.0-flash-001';
const FALLBACK_MODEL = 'gemini-2.0-flash-lite-001';
const MAX_RETRIES = 3;
const BASE_RETRY_DELAY_MS = 2000;

let vertexAI: VertexAI | null = null;

function getVertexAI(): VertexAI {
  if (vertexAI) return vertexAI;

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_REGION || 'us-east5';

  if (!projectId) {
    throw new Error('GOOGLE_CLOUD_PROJECT not set');
  }

  vertexAI = new VertexAI({ project: projectId, location });
  log.info(`Clawd brain: Gemini on Vertex AI (project=${projectId}, location=${location})`);
  return vertexAI;
}

function formatTokenAmount(raw: bigint): string {
  return (Number(raw) / 1e6).toLocaleString();
}

function buildHolderProfileText(profile: HolderProfile): string {
  const balanceDisplay = formatTokenAmount(profile.tokenBalance);
  const holdDays = Math.floor(profile.holdDurationMs / (1000 * 60 * 60 * 24));
  const holdHours = Math.floor((profile.holdDurationMs / (1000 * 60 * 60)) % 24);

  const stats = profile.tradeStats;
  const buyRatio = stats.totalSells > 0
    ? (stats.totalBuys / stats.totalSells).toFixed(1)
    : 'infinity';

  return `- Wallet: ${profile.walletAddress.slice(0, 8)}...${profile.walletAddress.slice(-4)}
- Token Balance: ${balanceDisplay} $CLAWDTOWN
- Tier: ${profile.tier}/5
- Supply Ownership: ${profile.supplyPercent.toFixed(2)}%
- Hold Duration: ${holdDays}d ${holdHours}h
- Event: ${profile.eventType.toUpperCase()}
- This Transaction: ${profile.eventType === 'buy' || profile.eventType === 'transfer_in' ? 'BOUGHT' : 'SOLD'} ${formatTokenAmount(profile.tokenAmountThisTx)} $CLAWDTOWN
- New Holder: ${profile.isNewHolder ? 'Yes (first time buyer!)' : 'No (returning)'}
- Trading Personality: ${profile.tradingPersonality || 'Unknown'}
- Trade History: ${stats.totalBuys} buys, ${stats.totalSells} sells (ratio: ${buyRatio})
- Total Volume: ${formatTokenAmount(stats.totalTokenBought)} bought, ${formatTokenAmount(stats.totalTokenSold)} sold
- Largest Buy: ${formatTokenAmount(stats.largestSingleBuy)} tokens
- Recent Activity: ${stats.tradesLast24h} trades in 24h, ${stats.tradesLast7d} in 7d
- Building Redesigns: ${stats.decisionCount}
- Current Damage: ${profile.damagePct.toFixed(0)}%
- Existing Building: ${profile.existingBuildingName || 'None (new construction)'}
- Existing Style: ${profile.existingStyle || 'None'}
- Behavior Pattern: ${profile.behaviorPattern}
- Material Theme: ${profile.behaviorTheme}`;
}

async function callGemini(
  systemPrompt: string,
  userPrompt: string,
  model: string
): Promise<string> {
  const ai = getVertexAI();
  const generativeModel = ai.getGenerativeModel({
    model,
    systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
    generationConfig: {
      maxOutputTokens: 512,
      temperature: 0.9,
      responseMimeType: 'application/json',
    },
  });

  const result = await generativeModel.generateContent({
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
  });

  const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) {
    throw new Error('Empty response from Gemini');
  }
  return text;
}

function parseDecisionJSON(raw: string): ClawdDecision {
  // Strip markdown code fences if present
  let cleaned = raw.trim();
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  const parsed = JSON.parse(cleaned);

  // Validate required fields
  const required = ['building_name', 'architectural_style', 'description', 'image_prompt', 'clawd_comment', 'evolution_hint'];
  for (const field of required) {
    if (typeof parsed[field] !== 'string' || parsed[field].length === 0) {
      throw new Error(`Missing or empty field: ${field}`);
    }
  }

  // Sanitize image_prompt: strip rendering/style words Gemini might sneak in
  parsed.image_prompt = sanitizeImagePrompt(parsed.image_prompt);

  return parsed as ClawdDecision;
}

export async function makeClawdDecision(profile: HolderProfile): Promise<ClawdDecision> {
  const isSell = profile.eventType === 'sell' || profile.eventType === 'transfer_out';
  const promptTemplate = isSell ? DAMAGE_DECISION_PROMPT : BUILDING_DECISION_PROMPT;
  const profileText = buildHolderProfileText(profile);
  const userPrompt = promptTemplate.replace('{HOLDER_PROFILE}', profileText);

  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const model = attempt < 2 ? PRIMARY_MODEL : FALLBACK_MODEL;

    try {
      const raw = await callGemini(CLAWD_SYSTEM_PROMPT, userPrompt, model);
      const decision = parseDecisionJSON(raw);
      log.info(`Clawd decided: "${decision.building_name}" for ${profile.walletAddress.slice(0, 8)}...`);
      return decision;
    } catch (err: any) {
      lastError = err;
      const isRateLimit = err?.code === 429 || err?.status === 429;
      const isOverloaded = err?.code === 503 || err?.status === 503;

      if (isRateLimit || isOverloaded) {
        const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
        log.warn(`Gemini rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), retrying in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }

      // JSON parse error — retry with fallback model
      if (err instanceof SyntaxError) {
        log.warn(`Clawd returned invalid JSON (attempt ${attempt + 1}), retrying...`);
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      log.error(`Gemini API error (attempt ${attempt + 1}):`, err);
      if (attempt < MAX_RETRIES - 1) {
        await new Promise(r => setTimeout(r, BASE_RETRY_DELAY_MS));
      }
    }
  }

  // All retries failed — return a fallback decision
  log.error('All Clawd retries failed, using fallback decision:', lastError);
  return getFallbackDecision(profile);
}

const BANNED_TERMS = [
  // Multi-word phrases first (order matters — longer matches before shorter)
  'pixel art style', 'pixel art', 'isometric view', 'transparent background',
  'white background', 'single building', 'game asset', 'low poly',
  'sci-fi', '8-bit', '16-bit',
  // Single words
  'isometric', '3d', 'realistic', 'sprite', 'voxel',
  'retro', 'cyberpunk', 'neon', 'vaporwave',
  'futuristic', 'steampunk',
];

function sanitizeImagePrompt(prompt: string): string {
  let cleaned = prompt;
  for (const term of BANNED_TERMS) {
    // Remove term (word-boundary-delimited) with optional surrounding commas/spaces
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`\\s*,?\\s*\\b${escaped}\\b\\s*,?\\s*`, 'gi');
    cleaned = cleaned.replace(re, ' ');
  }
  // Collapse whitespace and trim trailing commas/spaces
  cleaned = cleaned.replace(/\s+/g, ' ').replace(/^[,\s]+|[,\s]+$/g, '').trim();
  // Cap at ~40 words
  const words = cleaned.split(/\s+/);
  if (words.length > 40) {
    cleaned = words.slice(0, 40).join(' ');
  }
  return cleaned;
}

function getFallbackDecision(profile: HolderProfile): ClawdDecision {
  const isSell = profile.eventType === 'sell' || profile.eventType === 'transfer_out';
  const tierNames = ['Wooden Shack', 'Stone Cottage', 'Timber Hall', 'Grand Manor', 'Fortified Tower', 'Castle'];
  const baseName = tierNames[Math.min(profile.tier, 5)];

  if (isSell) {
    return {
      building_name: `Damaged ${profile.existingBuildingName || baseName}`,
      architectural_style: 'Deteriorating Structure',
      description: 'A building showing signs of neglect after its owner sold tokens.',
      image_prompt: `a crumbling ${baseName.toLowerCase()} with cracks in the walls, missing roof tiles, boarded windows, and overgrown vines`,
      clawd_comment: `Another paper hand. The ${baseName} weeps.`,
      evolution_hint: 'Buy more tokens to begin repairs.',
    };
  }

  return {
    building_name: baseName,
    architectural_style: 'Standard Construction',
    description: `A tier ${profile.tier} building in the town.`,
    image_prompt: `a sturdy ${baseName.toLowerCase()} built from weathered stone with a wooden door and small windows`,
    clawd_comment: profile.isNewHolder
      ? `Welcome to Clawd Town! Your ${baseName} awaits.`
      : `The ${baseName} grows stronger.`,
    evolution_hint: 'Keep holding to unlock the next evolution.',
  };
}

export function isAIEnabled(): boolean {
  return process.env.AI_ENABLED === 'true' && !!process.env.GOOGLE_CLOUD_PROJECT;
}
