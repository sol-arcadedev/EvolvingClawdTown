// ── Building archetype catalogue ───────────────────────────────────

import {
  BuildingArchetype,
  DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH,
  DISTRICT_COMMERCIAL, DISTRICT_INDUSTRIAL, DISTRICT_CIVIC,
  DISTRICT_PARK, DISTRICT_HARBOR,
} from './types';

const ISO_STYLE = 'isometric 2.5d pixel art, sunny lighting, game tileset, no background, transparent background';

export const ARCHETYPES: BuildingArchetype[] = [
  // ── Residential Low ──
  {
    id: 'small_house',
    name: 'Small House',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, small cozy wooden house, thatched roof, garden path`,
    sdStyleTags: ['pixel art', 'isometric', 'cozy'],
  },
  {
    id: 'cottage',
    name: 'Cottage',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, stone cottage, chimney, flower box windows`,
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
    sdPromptTemplate: `${ISO_STYLE}, modern apartment building, balconies, glass and concrete`,
    sdStyleTags: ['pixel art', 'isometric', 'urban'],
  },
  {
    id: 'townhouse',
    name: 'Townhouse',
    footprint: { w: 2, h: 1 },
    heightLevels: 2,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_RESIDENTIAL_LOW],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, row of townhouses, varied colored doors, brick facade`,
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
    sdPromptTemplate: `${ISO_STYLE}, row of small shops, colorful awnings, market street`,
    sdStyleTags: ['pixel art', 'isometric', 'commercial'],
  },
  {
    id: 'office_tower',
    name: 'Office Tower',
    footprint: { w: 2, h: 2 },
    heightLevels: 4,
    allowedDistricts: [DISTRICT_COMMERCIAL, DISTRICT_CIVIC],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, modern glass office tower, reflective windows, rooftop garden`,
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
    sdPromptTemplate: `${ISO_STYLE}, industrial factory, smokestacks, loading dock`,
    sdStyleTags: ['pixel art', 'isometric', 'industrial'],
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    footprint: { w: 2, h: 2 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_INDUSTRIAL, DISTRICT_HARBOR],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, corrugated metal warehouse, roller doors`,
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
    sdPromptTemplate: `${ISO_STYLE}, grand civic hall, columns, clock tower, marble steps`,
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
    sdPromptTemplate: `${ISO_STYLE}, park tile, trees, bench, grass, flower bed`,
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
    sdPromptTemplate: `${ISO_STYLE}, harbor warehouse, wooden dock, cargo crates, seagulls`,
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
    sdPromptTemplate: `${ISO_STYLE}, tiny ramshackle shack, scrap metal roof, single window`,
    sdStyleTags: ['pixel art', 'isometric', 'humble'],
  },
  {
    id: 'holder_tier2',
    name: 'Tier 2 House',
    footprint: { w: 1, h: 1 },
    heightLevels: 1,
    allowedDistricts: [DISTRICT_RESIDENTIAL_LOW, DISTRICT_RESIDENTIAL_HIGH],
    densityClass: 'low',
    sdPromptTemplate: `${ISO_STYLE}, small neat house, painted walls, pitched roof, garden`,
    sdStyleTags: ['pixel art', 'isometric', 'cozy'],
  },
  {
    id: 'holder_tier3',
    name: 'Tier 3 Villa',
    footprint: { w: 2, h: 1 },
    heightLevels: 2,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_COMMERCIAL],
    densityClass: 'medium',
    sdPromptTemplate: `${ISO_STYLE}, stylish villa, modern design, large windows, terrace`,
    sdStyleTags: ['pixel art', 'isometric', 'upscale'],
  },
  {
    id: 'holder_tier4',
    name: 'Tier 4 Tower',
    footprint: { w: 2, h: 2 },
    heightLevels: 3,
    allowedDistricts: [DISTRICT_RESIDENTIAL_HIGH, DISTRICT_COMMERCIAL],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, luxury tower, penthouse, glass facade, rooftop pool`,
    sdStyleTags: ['pixel art', 'isometric', 'luxury'],
  },
  {
    id: 'holder_tier5',
    name: 'Tier 5 Megastructure',
    footprint: { w: 2, h: 2 },
    heightLevels: 5,
    allowedDistricts: [DISTRICT_CIVIC, DISTRICT_RESIDENTIAL_HIGH],
    densityClass: 'high',
    sdPromptTemplate: `${ISO_STYLE}, megastructure skyscraper, landmark building, unique architecture, glowing accents`,
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
