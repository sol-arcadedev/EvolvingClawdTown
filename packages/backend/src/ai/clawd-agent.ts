import { VertexAI } from '@google-cloud/vertexai';
import { log } from '../utils/logger';
import type { WalletTradeStats } from '../db/queries';
import {
  CLAWD_SYSTEM_PROMPT,
  BUILDING_DECISION_PROMPT,
  DAMAGE_DECISION_PROMPT,
  CLAWD_HQ_PROMPT,
  BehaviorPattern,
} from './clawd-prompt';
import { CLAWD_HQ_ADDRESS } from '../constants';

export interface HolderProfile {
  walletAddress: string;
  tokenBalance: bigint;
  tier: number;
  supplyPercent: number;
  holdDurationMs: number;
  eventType: 'buy' | 'sell';
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
- This Transaction: ${profile.eventType === 'buy' ? 'BOUGHT' : 'SOLD'} ${formatTokenAmount(profile.tokenAmountThisTx)} $CLAWDTOWN
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
  const isHQ = profile.walletAddress === CLAWD_HQ_ADDRESS;
  let userPrompt: string;

  if (isHQ) {
    userPrompt = CLAWD_HQ_PROMPT;
  } else {
    const isSell = profile.eventType === 'sell';
    const promptTemplate = isSell ? DAMAGE_DECISION_PROMPT : BUILDING_DECISION_PROMPT;
    const profileText = buildHolderProfileText(profile);
    userPrompt = promptTemplate.replace('{HOLDER_PROFILE}', profileText);
  }

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
  'surrounded by', 'sitting on', 'resting on', 'built on', 'placed on',
  'next to', 'beside', 'with nearby', 'flanked by', 'backed by',
  'on a hill', 'on a cliff', 'by the water', 'by a lake', 'by a river',
  'in a forest', 'in a field', 'in a meadow', 'in a clearing',
  'in front of', 'behind the', 'around the', 'along the',
  'winding path', 'stone path', 'cobblestone path', 'dirt path',
  'pine trees', 'oak trees', 'flower garden', 'small garden', 'front garden',
  'flower beds', 'flower box', 'window box', 'planter', 'potted plant',
  'front yard', 'back yard', 'courtyard',
  // Rendering/style words
  'isometric', '3d', 'realistic', 'sprite', 'voxel',
  'retro', 'cyberpunk', 'neon', 'vaporwave',
  'futuristic', 'steampunk',
  // Environment/ground words that must not appear
  'trees', 'tree', 'bushes', 'bush', 'flowers', 'flower', 'flora',
  'garden', 'yard', 'fence', 'fencing', 'hedge', 'hedgerow',
  'grass', 'grassy', 'lawn', 'meadow', 'field',
  'dirt', 'path', 'road', 'pavement', 'cobblestone', 'walkway', 'trail',
  'lake', 'river', 'pond', 'stream', 'waterfall', 'creek',
  'mountain', 'mountains', 'hills', 'cliff', 'hillside', 'hilltop',
  'rocks', 'boulders', 'stones', 'pebbles', 'stone wall',
  'ivy', 'vines', 'moss', 'mossy', 'overgrown', 'creeping',
  'shrubs', 'shrub', 'plants', 'plant', 'vegetation', 'foliage', 'leaves',
  'landscape', 'scenery', 'environment', 'surroundings', 'grounds',
  'sky', 'clouds', 'sun', 'moon', 'stars',
  'snow', 'rain', 'puddle', 'puddles',
  'well', 'fountain', 'birdbath', 'lamp post', 'lantern',
  'sign', 'signpost', 'mailbox', 'barrel', 'crate', 'cart', 'wagon',
  'sky', 'clouds', 'horizon', 'landscape', 'scenery',
  'forest', 'woodland', 'clearing',
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
  // Cap at ~12 words — force short prompts
  const words = cleaned.split(/\s+/);
  if (words.length > 12) {
    cleaned = words.slice(0, 12).join(' ');
  }
  return cleaned;
}

function getFallbackDecision(profile: HolderProfile): ClawdDecision {
  const isSell = profile.eventType === 'sell';
  const tierNames = ['Wooden Shack', 'Stone Cottage', 'Timber Hall', 'Grand Manor', 'Fortified Tower', 'Castle'];
  const baseName = tierNames[Math.min(profile.tier, 5)];

  if (isSell) {
    return {
      building_name: `Damaged ${profile.existingBuildingName || baseName}`,
      architectural_style: 'Deteriorating Structure',
      description: 'A building showing signs of neglect after its owner sold tokens.',
      image_prompt: `a crumbling ${baseName.toLowerCase()} with cracks in the walls, missing roof tiles, and boarded windows`,
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

export async function validateImageWithVision(imageBuffer: Buffer): Promise<{ pass: boolean; reason: string }> {
  try {
    const ai = getVertexAI();
    const model = ai.getGenerativeModel({
      model: PRIMARY_MODEL,
      generationConfig: {
        maxOutputTokens: 256,
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    });

    const base64Image = imageBuffer.toString('base64');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const result = await model.generateContent({
      contents: [{
        role: 'user',
        parts: [
          {
            inlineData: {
              mimeType: 'image/png',
              data: base64Image,
            },
          },
          {
            text: `Analyze this image. Is it a SINGLE isolated isometric building suitable for an isometric tile-based game like SimCity 2000 or Age of Empires?

Respond with JSON: { "pass": true/false, "reason": "brief explanation" }

Criteria for PASS (ALL must be true):
- Single building or architectural structure
- MUST be in isometric 3/4 top-down perspective (45-degree angle from above) — you should see the ROOF/TOP of the building AND exactly TWO side faces (typically front-left and front-right walls)
- Background is mostly transparent or white
- No large ground areas, terrain, grass fields, trees, or environment
- Pixel art or retro game sprite style

Criteria for FAIL (ANY of these = fail):
- Front view / elevation view (seeing only ONE face of the building straight-on) — THIS IS THE MOST IMPORTANT CHECK
- Side view (seeing only one wall)
- Eye-level perspective (camera at ground level looking at the building)
- You cannot see the roof or top of the building
- Multiple separate buildings visible
- Large ground areas, terrain, or environmental elements
- Not a building at all
- Realistic 3D render or photograph style (should be pixel art)

The key test: in a correct isometric view, you always see the top/roof of the building AND two of its side walls forming a diamond-like shape. If you only see one wall face, it is NOT isometric and must FAIL.`,
          },
        ],
      }],
    });

    clearTimeout(timeout);

    const text = result.response?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      return { pass: true, reason: 'Empty vision response, defaulting to pass' };
    }

    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    const parsed = JSON.parse(cleaned);
    return { pass: !!parsed.pass, reason: parsed.reason || 'No reason given' };
  } catch (err: any) {
    log.warn('Vision validation error (defaulting to pass):', err.message || err);
    return { pass: true, reason: `Validation error: ${err.message || 'unknown'}` };
  }
}

export function isAIEnabled(): boolean {
  return process.env.AI_ENABLED === 'true' && !!process.env.GOOGLE_CLOUD_PROJECT;
}
