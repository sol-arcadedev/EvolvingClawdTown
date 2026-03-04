import { initializeSmallTown } from '../src/town-sim/index';

const state = initializeSmallTown(42);
const plots = Array.from(state.plots.values());
console.log('Total plots:', plots.length);

const sizes: Record<string, number> = {};
plots.forEach(p => {
  const k = `${p.width}x${p.height}`;
  sizes[k] = (sizes[k] || 0) + 1;
});
console.log('Plot sizes:', JSON.stringify(sizes));

// Check spacing
const origins = plots.map(p => ({ x: p.originX, y: p.originY, w: p.width, h: p.height }));
let overlapping = 0;
for (let i = 0; i < origins.length; i++) {
  for (let j = i + 1; j < origins.length; j++) {
    const a = origins[i], b = origins[j];
    // Check if 3x3 bounding boxes overlap
    const overlapX = a.x < b.x + b.w && a.x + a.w > b.x;
    const overlapY = a.y < b.y + b.h && a.y + a.h > b.y;
    if (overlapX && overlapY) overlapping++;
  }
}
console.log('Overlapping plot pairs:', overlapping);
console.log('Sample origins:', origins.slice(0, 10).map(o => `(${o.x},${o.y} ${o.w}x${o.h})`).join(' '));
