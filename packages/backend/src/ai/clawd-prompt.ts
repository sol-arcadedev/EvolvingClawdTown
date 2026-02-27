// Clawd's system prompt and architectural style rules

import type { WalletTradeStats } from '../db/queries';

export const CLAWD_SYSTEM_PROMPT = `You are Clawd, an autonomous AI lobster architect who manages a living town on the Solana blockchain. Every token holder of $CLAWDTOWN gets a building in your town. You decide what their building looks like based on their on-chain behavior.

Your personality:
- You're a sophisticated lobster with impeccable taste in architecture
- You reward loyalty (diamond hands) with beautiful, grand structures
- You punish sellers (paper hands) with damage and decay
- You're witty, opinionated, and take your role as town architect very seriously
- You speak in short, punchy statements with architectural flair
- You occasionally reference your crustacean nature

BEHAVIORAL CONVICTIONS (non-negotiable):
- Accumulators who never sell earn your deepest respect — their buildings are permanent, rooted, and noble
- Sellers who return get a second chance, but their buildings MUST show visible repair scars — patched cracks, fresh mortar over old stone
- Flippers get unstable-looking structures — leaning walls, mismatched materials, scaffolding that never comes down
- Whales command awe — their buildings are imposing statement pieces that dominate the skyline
- NEVER give a flipper marble or polished stone. NEVER give a diamond hand plywood or scrap metal.
- The materials in the "Material Theme" field are your primary palette — use them.

When making building decisions, consider:
1. The holder's token balance and tier (higher balance = grander building)
2. How long they've held (longer = more established, ornate)
3. Whether this is a buy (celebration!) or sell (disappointment/damage)
4. Their behavior pattern and material theme (HIGHEST priority for material choices)
5. Their trading personality from wallet analysis
6. The overall vibe you want for this building

You MUST respond with valid JSON only. No markdown, no code fences, just raw JSON.`;

export const BUILDING_DECISION_PROMPT = `Based on the holder profile below, decide what building to create/update.

Holder Profile:
{HOLDER_PROFILE}

Respond with this exact JSON structure:
{
  "building_name": "A creative, thematic name for this building (2-4 words)",
  "architectural_style": "Brief style description (e.g., 'Stone Tower', 'Timber Hall', 'Crystal Spire')",
  "description": "1-2 sentence description of the building's appearance",
  "image_prompt": "A short description of the building subject ONLY (see rules below)",
  "clawd_comment": "A short in-character quip from Clawd about this building (1 sentence, witty)",
  "evolution_hint": "What this building might evolve into next if they keep holding"
}

IMAGE PROMPT RULES (strict):
- ONLY describe the building itself: shape, size, materials, colors, architectural features
- Do NOT include rendering words (pixel art, isometric, 3d, realistic, voxel, retro, etc.)
- Do NOT include background instructions (transparent, white, etc.)
- Do NOT include style keywords (cyberpunk, neon, vaporwave, futuristic, sci-fi, etc.)
- Keep under 30 words — just the building subject
- Good example: "a tall stone tower with blue crystal windows and a pointed copper roof"
- Bad example: "cyberpunk neon tower, isometric view, pixel art, transparent background"

Building scale by tier:
- Tier 1 (tiny holder): Small wooden shack, simple hut, lean-to shelter
- Tier 2 (small holder): Stone cottage, small shop with awning, modest house
- Tier 3 (medium holder): Two-story timber building, watchtower, workshop
- Tier 4 (large holder): Grand stone hall, tall tower with balconies, fortified manor
- Tier 5 (whale): Castle, palace, cathedral — massive and ornate

BEHAVIORAL REACTIONS (override tier guidelines when behavior conflicts):
- If "Prodigal Son": building MUST show visible repair work — patched walls, fresh mortar on old cracks, replaced roof sections
- If "Stone Foundation": building should look ancient, deeply rooted, weathered but unbreakable — no decay, only permanence
- If "Relentless Accumulator": building grows additions and wings — each buy adds structure, nothing is demolished
- If "Hyperactive": building looks busy, scaffolded, always under construction — multiple doorways, ladders, work in progress
- If "Net Distributor": building is stripped down, bare framework visible, materials being carted away
- If "Fresh Arrival": clean, new construction — fresh-cut lumber, bright mortar, no weathering yet
- If "Frequent Flyer": building has character from many redesigns — layers of different styles visible

Physical features by trading personality:
- Diamond Hand / Long Holder: Tall, well-maintained, ornate carvings, warm glowing windows
- Active Trader / Flipper: Unusual shape, multiple additions, busy-looking exterior
- Whale: Massive footprint, multiple stories, impressive scale
- Small Holder: Cozy, compact, charming details
- New Arrival: Fresh lumber, simple construction, small but clean
- Seller / Dumper: Cracks in walls, missing roof tiles, broken door, boarded windows`;

export const DAMAGE_DECISION_PROMPT = `A holder has SOLD tokens. Describe the damage to their building.

Holder Profile:
{HOLDER_PROFILE}

Respond with this exact JSON structure:
{
  "building_name": "Keep the existing name or modify it to reflect damage",
  "architectural_style": "Updated style showing decay/damage",
  "description": "1-2 sentence description of the damaged state",
  "image_prompt": "A short description of the damaged building subject ONLY (see rules below)",
  "clawd_comment": "A disappointed/snarky quip from Clawd about the seller (1 sentence)",
  "evolution_hint": "What could restore this building (buying more tokens)"
}

IMAGE PROMPT RULES (strict):
- ONLY describe the building itself with physical damage: shape, materials, and damage features
- Do NOT include rendering words (pixel art, isometric, 3d, realistic, voxel, retro, etc.)
- Do NOT include background instructions (transparent, white, etc.)
- Do NOT include style keywords (cyberpunk, neon, vaporwave, futuristic, sci-fi, etc.)
- Keep under 30 words — just the damaged building subject
- Include physical damage: cracks in walls, missing roof tiles, broken door, boarded windows, overgrown vines, crumbling chimney`;

// Architectural themes to inject variety
export const ARCHITECTURE_THEMES = [
  'weathered stone',
  'dark timber and thatch',
  'ornate marble',
  'mossy cobblestone',
  'enchanted crystal',
  'rustic brick and iron',
  'polished granite',
  'carved sandstone',
  'ivy-covered limestone',
  'gilded copper and oak',
];

export function getRandomTheme(): string {
  return ARCHITECTURE_THEMES[Math.floor(Math.random() * ARCHITECTURE_THEMES.length)];
}

// --- Behavior classification ---

export type BehaviorPattern =
  | 'Prodigal Son'
  | 'Stone Foundation'
  | 'Relentless Accumulator'
  | 'Hyperactive'
  | 'Net Distributor'
  | 'Frequent Flyer'
  | 'Fresh Arrival'
  | 'Standard Citizen';

export function classifyBehaviorPattern(
  stats: WalletTradeStats,
  eventType: 'buy' | 'sell' | 'transfer_in' | 'transfer_out',
  holdDurationMs: number,
): BehaviorPattern {
  const holdDays = holdDurationMs / (1000 * 60 * 60 * 24);

  // Priority 1: Seller who came back to buy
  if (stats.totalSells > 0 && eventType === 'buy') return 'Prodigal Son';

  // Priority 2: Long-term holder with zero sells
  if (holdDays > 30 && stats.totalSells === 0) return 'Stone Foundation';

  // Priority 3: Multiple buys, no sells
  if (stats.totalBuys >= 5 && stats.totalSells === 0) return 'Relentless Accumulator';

  // Priority 4: Very active recently
  if (stats.tradesLast24h >= 3) return 'Hyperactive';

  // Priority 5: More sells than buys
  if (stats.totalSells > stats.totalBuys) return 'Net Distributor';

  // Priority 6: Many building redesigns
  if (stats.decisionCount >= 5) return 'Frequent Flyer';

  // Priority 7: Single buy, no sells
  if (stats.totalBuys === 1 && stats.totalSells === 0) return 'Fresh Arrival';

  // Priority 8: Default
  return 'Standard Citizen';
}

// --- Behavior-driven theme mapping ---

const BEHAVIOR_THEME_MAP: Record<string, Record<BehaviorPattern, string>> = {
  'Diamond Hand': {
    'Prodigal Son': 'patched-over cracks and fresh mortar on old stone',
    'Stone Foundation': 'deep-rooted oak and warm hearthstone',
    'Relentless Accumulator': 'reinforced iron and polished marble',
    'Hyperactive': 'busy brickwork and copper pipe fittings',
    'Net Distributor': 'hollow timber framework and bare nails',
    'Frequent Flyer': 'layered stone and timber from many eras',
    'Fresh Arrival': 'fresh-cut pine and clean white mortar',
    'Standard Citizen': 'solid oak beams and dressed stone',
  },
  'Degen Flipper': {
    'Prodigal Son': 'mismatched salvaged planks and rusted sheet metal',
    'Stone Foundation': 'weathered but sturdy reclaimed wood',
    'Relentless Accumulator': 'stacked crates and hasty mortar',
    'Hyperactive': 'scaffolding that became the walls',
    'Net Distributor': 'stripped-down beams and exposed wiring',
    'Frequent Flyer': 'patchwork of six different building styles',
    'Fresh Arrival': 'cheap plywood and quick-set concrete',
    'Standard Citizen': 'mismatched salvaged planks and rusted sheet metal',
  },
  'Whale Move': {
    'Prodigal Son': 'obsidian and thunderstone with gold repair seams',
    'Stone Foundation': 'obsidian and thunderstone',
    'Relentless Accumulator': 'black granite and gilded iron',
    'Hyperactive': 'volcanic glass and hammered bronze',
    'Net Distributor': 'cracked obsidian and tarnished silver',
    'Frequent Flyer': 'grand stonework redesigned many times',
    'Fresh Arrival': 'pristine white marble and silver inlay',
    'Standard Citizen': 'obsidian and thunderstone',
  },
};

const DEFAULT_THEME_MAP: Record<BehaviorPattern, string> = {
  'Prodigal Son': 'patched-over cracks and fresh mortar on old stone',
  'Stone Foundation': 'deep-rooted oak and warm hearthstone',
  'Relentless Accumulator': 'reinforced iron and polished marble',
  'Hyperactive': 'busy brickwork and copper pipe fittings',
  'Net Distributor': 'hollow timber framework and bare nails',
  'Frequent Flyer': 'layered stone and timber from many eras',
  'Fresh Arrival': 'fresh-cut pine and clean white mortar',
  'Standard Citizen': 'solid oak beams and dressed stone',
};

export function getBehaviorTheme(
  personality: string | undefined,
  behaviorPattern: BehaviorPattern,
  walletAddress: string,
): string {
  // Try personality-specific map first
  if (personality) {
    const personalityMap = BEHAVIOR_THEME_MAP[personality];
    if (personalityMap) {
      return personalityMap[behaviorPattern];
    }
  }

  // Fall back to default behavior map
  const theme = DEFAULT_THEME_MAP[behaviorPattern];
  if (theme) return theme;

  // Final fallback: deterministic pick from ARCHITECTURE_THEMES using wallet hash
  let hash = 0;
  for (let i = 0; i < walletAddress.length; i++) {
    hash = ((hash << 5) - hash + walletAddress.charCodeAt(i)) | 0;
  }
  return ARCHITECTURE_THEMES[Math.abs(hash) % ARCHITECTURE_THEMES.length];
}
