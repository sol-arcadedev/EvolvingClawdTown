// ── Building archetype catalogue ───────────────────────────────────

import {
  BuildingArchetype,
  DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH,
  DISTRICT_COMMERCIAL, DISTRICT_INDUSTRIAL, DISTRICT_CIVIC,
  DISTRICT_PARK, DISTRICT_HARBOR,
} from './types';

const ISO_STYLE = '(single object on white background:1.3), isometric pixel art building, colorful roof, game sprite';

export const ARCHETYPES: BuildingArchetype[] = [
  // ── Residential Low ──
  {
    id: 'small_house',
    name: 'Small House',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, tiny wooden house with red roof`,
    sdStyleTags: ['pixel art', 'isometric', 'cozy'],
  },
  {
    id: 'cottage',
    name: 'Cottage',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, small stone cottage with orange roof`,
    sdStyleTags: ['pixel art', 'isometric', 'rustic'],
  },

  // ── Residential High ──
  {
    id: 'apartment',
    name: 'Apartment Block',
    footprint: { w: 2, h: 2 },
    heightLevels: 3,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, small brick building with green roof`,
    sdStyleTags: ['pixel art', 'isometric', 'urban'],
  },
  {
    id: 'townhouse',
    name: 'Townhouse',
    footprint: { w: 2, h: 1 },
    heightLevels: 2,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, small brick townhouse with yellow roof`,
    sdStyleTags: ['pixel art', 'isometric', 'residential'],
  },

  // ── Commercial ──
  {
    id: 'shop_row',
    name: 'Shop Row',
    footprint: { w: 2, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_COMMERCIAL],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, tiny shop with colorful awning and red roof`,
    sdStyleTags: ['pixel art', 'isometric', 'commercial'],
  },
  {
    id: 'office_tower',
    name: 'Office Tower',
    footprint: { w: 2, h: 2 },
    heightLevels: 4,
    allowedDistricts: [DISTRICT_COMMERCIAL, DISTRICT_CIVIC],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, small brick office with terracotta roof`,
    sdStyleTags: ['pixel art', 'isometric', 'corporate'],
  },

  // ── Industrial ──
  {
    id: 'factory',
    name: 'Factory',
    footprint: { w: 3, h: 2 },
    heightLevels: 2,
    allowedDistricts: [DISTRICT_INDUSTRIAL],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, small wooden workshop with green roof and chimney`,
    sdStyleTags: ['pixel art', 'isometric', 'industrial'],
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    footprint: { w: 2, h: 2 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_INDUSTRIAL, DISTRICT_HARBOR],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, small wooden barn with brown roof`,
    sdStyleTags: ['pixel art', 'isometric', 'industrial'],
  },

  // ── Civic ──
  {
    id: 'civic_hall',
    name: 'Civic Hall',
    footprint: { w: 2, h: 2 },
    heightLevels: 2,
    allowedDistricts: [DISTRICT_CIVIC],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, small stone hall with clock and red roof`,
    sdStyleTags: ['pixel art', 'isometric', 'civic'],
  },

  // ── Park ──
  {
    id: 'park_tile',
    name: 'Park',
    footprint: { w: 1, h: 1 },
    heightLevels: 0,
    allowedDistricts: [DISTRICT_PARK, DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, tiny garden gazebo with green roof`,
    sdStyleTags: ['pixel art', 'isometric', 'nature'],
  },

  // ── Harbor ──
  {
    id: 'harbor_warehouse',
    name: 'Harbor Warehouse',
    footprint: { w: 2, h: 2 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_HARBOR],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, small wooden dock house with blue roof`,
    sdStyleTags: ['pixel art', 'isometric', 'harbor'],
  },

  // ── Holder tier-specific archetypes ──
  {
    id: 'holder_tier1',
    name: 'Tier 1 Shack',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, tiny wooden shack with red roof`,
    sdStyleTags: ['pixel art', 'isometric', 'humble'],
  },
  {
    id: 'holder_tier2',
    name: 'Tier 2 House',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, small painted house with orange roof`,
    sdStyleTags: ['pixel art', 'isometric', 'cozy'],
  },
  {
    id: 'holder_tier3',
    name: 'Tier 3 Villa',
    footprint: { w: 2, h: 1 },
    heightLevels: 2,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_COMMERCIAL],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, small timber house with terracotta roof and chimney`,
    sdStyleTags: ['pixel art', 'isometric', 'upscale'],
  },
  {
    id: 'holder_tier4',
    name: 'Tier 4 Tower',
    footprint: { w: 2, h: 2 },
    heightLevels: 3,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_COMMERCIAL],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, small stone house with red tile roof and small balcony`,
    sdStyleTags: ['pixel art', 'isometric', 'luxury'],
  },
  {
    id: 'holder_tier5',
    name: 'Tier 5 Megastructure',
    footprint: { w: 2, h: 2 },
    heightLevels: 5,
    allowedDistricts: [DISTRICT_CIVIC, DISTRICT_RESIDENTIAL_HIGH],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, small fancy stone house with colorful detailed roof and turret`,
    sdStyleTags: ['pixel art', 'isometric', 'landmark'],
  },
];

const archetypeMap = new Map<string, BuildingArchetype>();
for (const a of ARCHETYPES) archetypeMap.set(a.id, a);

export function getArchetype(id: string): BuildingArchetype | undefined {
  return archetypeMap.get(id);
}

export function getAllArchetypes(): Map<string, BuildingArchetype> {
  return new Map(archetypeMap);
}

export function getArchetypeForTier(tier: number): BuildingArchetype {
  const id = `holder_tier${Math.max(1, Math.min(5, tier))}`;
  return archetypeMap.get(id) || archetypeMap.get('holder_tier1')!;
}

export function getArchetypeForDistrict(district: number, density: 'low' | 'medium' | 'high'): BuildingArchetype | undefined {
  return ARCHETYPES.find(
    a => a.allowedDistricts.includes(district) && a.densityClass === density
      && !a.id.startsWith('holder_'),
  );
}
