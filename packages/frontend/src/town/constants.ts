// Grid geometry — plot coords spiral from (0,0), world is centered on origin
export const CELL_SIZE = 96;

// Plot spacing — each backend plot coord maps to every Nth cell
export const PLOT_SPACING = 3;

// World pixel distance between building centers
export const PLOT_STRIDE = CELL_SIZE * PLOT_SPACING; // 288px

// Extra distance multiplier between plots (buildings stay same size)
export const PLOT_DISTANCE_MULT = 1.8;

// Sprite scaling per tier (fraction of PLOT_STRIDE)
export const TIER_SCALE: Record<number, number> = {
  0: 0.3,
  1: 0.45,
  2: 0.55,
  3: 0.65,
  4: 0.75,
  5: 0.85,
};

// Colors
export const COL_BG = 0x08080f;
export const COL_GROUND = 0x08080f;
export const COL_ROAD = 0x111118;
export const COL_GRID_LINE = 0x00cccc;
export const COL_GRID_LINE_ALPHA = 0.3;
export const COL_LANE_MARKING = 0xccaa00;
export const COL_CYAN = 0x00fff5;
export const COL_MAGENTA = 0xff00c8;
export const COL_GREEN = 0x00ff88;
export const COL_RED = 0xff2244;
export const COL_PANEL_BG = 0x0a0e14;
export const COL_PANEL_BORDER = 0x00ff88;

// Camera
export const ZOOM_MIN = 0.1;
export const ZOOM_MAX = 3;
export const ZOOM_SPEED = 0.001;

// Mainframe reserved plots (center 2x2)
export const MAINFRAME_PLOTS = [
  [0, 0],
  [-1, 0],
  [0, -1],
  [-1, -1],
] as const;

// Ground patch colors per tier (isometric diamond beneath each building)
export const TIER_GROUND_COLORS: Record<number, string> = {
  1: '#5C4033', // brown dirt
  2: '#6B7B3E', // dry grass
  3: '#707070', // cobblestone gray
  4: '#8899AA', // polished stone
  5: '#C0A060', // gold-trimmed marble
};

export const TIER_GROUND_BORDER_COLORS: Record<number, string> = {
  1: '#7A5A48',
  2: '#8B9B5E',
  3: '#909090',
  4: '#A8B9CA',
  5: '#D8C080',
};

// Fraction of GRID_SPACING for ground diamond radius
export const GROUND_SIZE_FACTOR = 0.4;

// Effects
export const PARTICLE_COUNT = 15;
export const PARTICLE_COLORS = [0x00fff5, 0xff00c8, 0x00ff88];

// Console messages
export const AI_MESSAGES = [
  'Observing chain state, deciding next moves...',
  'Reviewing holder portfolios for tier changes...',
  'Planning building upgrades for loyal holders...',
  'Thinking about town expansion...',
  'Assigning plots to new arrivals...',
  'Rewarding diamond hands with construction boosts...',
  'Analyzing trade patterns, adjusting strategies...',
  'Checking who deserves a promotion...',
  'Patrolling the town perimeter...',
  'Drafting blueprints for the next megastructure...',
  'Evaluating damage reports from paper hands...',
  'Welcoming a new resident to Clawd Town...',
  'Running diagnostics on town infrastructure...',
  'Studying wallet histories, learning holder behavior...',
  'Optimizing plot layout for maximum efficiency...',
  'Debating whether to buff or nerf build speeds...',
  'Cataloging today\'s most active traders...',
  'Inspecting construction sites for progress...',
  'Deliberating on tier promotion candidates...',
  'Autonomously managing town operations...',
];
