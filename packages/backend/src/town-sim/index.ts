// ── Town Simulation Module ─────────────────────────────────────────
// Re-exports all public API from the town-sim module.

export * from './types';
export * from './prng';
export { generateTerrain, clusterLand, generateSmallIsland } from './terrain';
export { assignDistricts, generateRoads, createPlots, astarPath } from './layout';
export { ARCHETYPES, getArchetype, getAllArchetypes, getArchetypeForTier, getArchetypeForDistrict } from './archetypes';
export { initializeTown, initializeSmallTown, computeStats, computeTags, placeBuilding, addRuin } from './town';
export { applyAction, getTownSummary, getDistrictSummaries, findCandidatePlots, findPlotForHolder } from './actions';
export { encodeTilemap, encodeBuildingList, encodeDecorationList, encodeRuinList, createTownSnapshot, decodeTilemapByte0 } from './render-adapter';
export type { EncodedBuilding, EncodedDecoration, EncodedRuin, TownSnapshot } from './render-adapter';
