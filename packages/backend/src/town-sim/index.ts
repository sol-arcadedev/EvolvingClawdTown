// ── Town Simulation Module ─────────────────────────────────────────
// Re-exports all public API from the town-sim module.

export * from './types.js';
export * from './prng.js';
export { generateTerrain, clusterLand } from './terrain.js';
export { assignDistricts, generateRoads, createPlots, astarPath } from './layout.js';
export { ARCHETYPES, getArchetype, getAllArchetypes, getArchetypeForTier, getArchetypeForDistrict } from './archetypes.js';
export { initializeTown, computeStats, computeTags, placeBuilding } from './town.js';
export { applyAction, getTownSummary, getDistrictSummaries, findCandidatePlots, findPlotForHolder } from './actions.js';
export { encodeTilemap, encodeBuildingList, createTownSnapshot, decodeTilemapByte0 } from './render-adapter.js';
export type { EncodedBuilding, TownSnapshot } from './render-adapter.js';
