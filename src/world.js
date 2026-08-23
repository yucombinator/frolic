// Deterministic meadow generation. No three.js, DOM, or WebAudio — unit-tested.
import { mulberry32 } from './rand.js';
import { HILLS } from './hill.js';

export { mulberry32 };

export const PALETTE = [
  0xffd1dc, 0xb3e1ff, 0xc7f0c7, 0xfff3b0, 0xdcc8ff, 0xffc9a8,
];

// Distinct flower varieties (from flowerpetal's trail.js): petal count +
// crown geometry so the meadow reads as several kinds of bloom.
export const FLOWER_KINDS = [
  { petals: 5, spread: 1.0, bigCenter: 0.3 },   // classic rose
  { petals: 6, spread: 1.15, bigCenter: 0.24 }, // daisy
  { petals: 4, spread: 0.95, bigCenter: 0.22 }, // star
  { petals: 8, spread: 1.35, bigCenter: 0.2 },  // airy cluster
];

// Flowers gather in scattered clusters across the meadow band: a cluster of
// 3-6 near a point, then a gap, then the next bunch — organic groups, not a
// uniform grid. Deterministic from the seed so the meadow is stable.
export function generateFlowers({ seed, zFrom, zTo, halfWidth }) {
  const rand = mulberry32(seed);
  const flowers = [];
  let z = zFrom;
  while (z < zTo - 10) {
    const cx = (rand() - 0.5) * halfWidth * 1.6;
    const n = 3 + Math.floor(rand() * 4); // cluster of 3-6
    for (let i = 0; i < n; i++) {
      const x = cx + (rand() - 0.5) * 6;
      const fz = z + rand() * 5;
      const kindIndex = Math.floor(rand() * FLOWER_KINDS.length);
      flowers.push({
        x,
        y: HILLS.height(x, fz),
        z: fz,
        kindIndex,
        colorHex: PALETTE[Math.floor(rand() * PALETTE.length)],
      });
    }
    z += 10 + rand() * 8; // gap between clusters
  }
  return flowers;
}
