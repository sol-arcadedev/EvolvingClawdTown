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

// Mainframe
export const MAINFRAME_PULSE_SPEED = 0.02;
export const CONSOLE_LINE_INTERVAL = 3000;
export const CONSOLE_MAX_LINES = 6;
export const CURSOR_BLINK_SPEED = 500;

// Mainframe reserved plots (center 2x2)
export const MAINFRAME_PLOTS = [
  [0, 0],
  [-1, 0],
  [0, -1],
  [-1, -1],
] as const;

// Effects
export const PARTICLE_COUNT = 40;
export const PARTICLE_COLORS = [0x00fff5, 0xff00c8, 0x00ff88];

// Console messages
export const AI_MESSAGES = [
  'Initializing neural pathways...',
  'Optimizing city grid layout...',
  'Deploying nano-constructors...',
  'Scanning blockchain activity...',
  'Calibrating holographic projectors...',
  'Synchronizing quantum relays...',
  'Analyzing token flow patterns...',
  'Upgrading defense matrices...',
  'Compiling architectural schematics...',
  'Routing energy to construction sites...',
  'Defragmenting city memory banks...',
  'Establishing neural links...',
  'Processing wallet signatures...',
  'Generating procedural structures...',
  'Monitoring city health metrics...',
  'Allocating compute resources...',
  'Recalibrating beam frequencies...',
  'Integrating new residents...',
  'Patching security protocols...',
  'Expanding city infrastructure...',
];
