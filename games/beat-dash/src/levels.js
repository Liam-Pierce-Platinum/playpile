// The six hand-built courses. Each is a list of hand-drawn ascii pieces
// (see sim.js for the legend) and empty runs. Speed is locked to the tempo:
// every beat is exactly 4 blocks, so obstacles placed on 4-block boundaries
// land on the beat. Every level is proven beatable by tools/solve.mjs.

// ---- pieces (rows top->bottom, '/' between rows, bottom row is the floor) ----
export const S1 = '^', S2 = '^^', S3 = '^^^';
export const BLOCK = '#';
export const TOWER = '##/##';
export const STEP = '....####/########';
export const STAIRS = '........####/....########/############';
export const BED_PLAT = '..######.../^^^^^^^^^^^';           // floating platform over a spike bed
export const BED_PLAT2 = '..####...####.../^^^^^^^^^^^^^^^^'; // two islands
export const PAD_UP = '...#########/............/............/P...^^^^^^^';
export const ORB_BED = '..o.../....../^^^^^^';
export const ORB_BED2 = '..o...o.../........../^^^^^^^^^^';
export const ORB_BED2S = '..o...o.../........../^^^^^^^^^.'; // level 2: one spike shorter, landing after the 2nd orb is roomier
export const BLOCK_SPIKE = '....^.../########';                    // block run with a spike on it
export const HOPS = '###..###..###/###..###..###';
export const GAP_SPIKES = '###....###/###^^^^###';
export const SPIKE_ROW = '^.....^.....^'; // relaxed, one tap each
export const SPIKE_ROW4 = '^...^...^';     // on every beat: hold to bounce through

// gravity sections: U flips you up onto the ceiling, D brings you back down
export const FLIP_RUN = (n, spikesAt = []) => {
  const w = n;
  const r = (fn) => Array.from({ length: w }, (_, i) => fn(i)).join('');
  return [
    r(() => '#'),
    r((i) => (spikesAt.includes(i) ? 'v' : '.')),
    r((i) => (i === w - 1 ? 'D' : '.')),
    r(() => '.'),
    r(() => '.'),
    r((i) => (i === 0 ? 'U' : '.')),
    r(() => '.'),
  ].join('/');
};
// flip orb: jump into it to switch to the ceiling, a second one switches back
export const FLIP_ORBS = (n, a, b, spikes = []) => {
  const r = (fn) => Array.from({ length: n }, (_, i) => fn(i)).join('');
  return [
    r(() => '#'),
    r((i) => (spikes.includes(i) ? 'v' : '.')),
    r(() => '.'),
    r((i) => (i === b ? 'f' : '.')),
    r((i) => (i === a ? 'f' : '.')),
    r(() => '.'),
    r((i) => (i > a + 1 && i < b - 1 ? '^' : '.')),
  ].join('/');
};
export const CEIL_PAD = '.......^..../...#########/............/............/P...^^^^^^^';

export const LEVELS = [
  {
    id: 'l1', name: 'First Light', diff: 'Chill', bpm: 128, hue: 200, root: 45, prog: 0, arp: 0,
    parts: [16, S1, 15, S1, 15, S2, 14, S1, 7, S1, 15, BLOCK, 15, TOWER, 14, S2, 6, S2, 14,
      STEP, 12, SPIKE_ROW, 15, BED_PLAT, 12, S1, 11, TOWER, 6, TOWER, 14, PAD_UP, 12,
      S2, 10, STAIRS, 12, S1, 7, S2, 15, BED_PLAT, 16],
  },
  {
    id: 'l2', name: 'Pulse Runner', diff: 'Steady', bpm: 136, hue: 285, root: 43, prog: 1, arp: 1,
    parts: [16, S1, 11, S2, 13, ORB_BED, 12, BLOCK_SPIKE, 12, S2, 6, S1, 13, HOPS, 12, ORB_BED, 10,
      STAIRS, 10, S2, 14, BED_PLAT2, 12, PAD_UP, 10, ORB_BED2S, 12, GAP_SPIKES, 12, SPIKE_ROW, 13,
      TOWER, 5, S2, 13, ORB_BED2S, 12, STEP, 6, S2, 16],
  },
  {
    id: 'l3', name: 'Flipside', diff: 'Spicy', bpm: 144, hue: 160, root: 41, prog: 2, arp: 2,
    parts: [16, S2, 12, ORB_BED, 12, FLIP_RUN(28, [10, 18]), 12, S2, 6, S1, 12, BED_PLAT2, 10,
      FLIP_RUN(36, [9, 10, 20, 28]), 12, HOPS, 10, PAD_UP, 10, ORB_BED2, 12, STAIRS, 8, S2, 12,
      FLIP_RUN(40, [8, 14, 15, 24, 31]), 12, GAP_SPIKES, 8, S2, 16],
  },
  {
    id: 'l4', name: 'Overdrive', diff: 'Wild', bpm: 150, hue: 330, root: 40, prog: 3, arp: 0,
    parts: [16, S3, 12, S2, 6, S2, 12, FLIP_ORBS(26, 3, 21, [9, 14]), 12, BLOCK_SPIKE, 8, S3, 12,
      CEIL_PAD, 12, SPIKE_ROW4, 10, ORB_BED2, 10, FLIP_RUN(32, [7, 8, 16, 24, 25]), 10, HOPS, 8, S3, 10, STAIRS, 6,
      S2, 10, FLIP_ORBS(30, 3, 25, [8, 9, 17, 18]), 12, BED_PLAT2, 8, S3, 16],
  },
  {
    id: 'l5', name: 'Hyperlight', diff: 'Ferocious', bpm: 160, hue: 14, root: 42, prog: 4, arp: 1,
    parts: [16, S3, 8, S2, 5, S1, 10, ORB_BED2, 8, FLIP_RUN(30, [6, 7, 13, 19, 20, 26]), 10,
      CEIL_PAD, 8, S3, 8, FLIP_ORBS(28, 3, 23, [7, 12, 13, 18]), 10, GAP_SPIKES, 6, HOPS, 8, ORB_BED, 6,
      S3, 10, BLOCK_SPIKE, 6, S2, 8, STAIRS, 6, S3, 10, FLIP_RUN(36, [5, 6, 11, 17, 18, 24, 30]), 10,
      BED_PLAT2, 6, S3, 6, S2, 16],
  },
  {
    id: 'l6', name: 'Event Horizon', diff: 'Brutal', bpm: 170, hue: 0, root: 38, prog: 5, arp: 2,
    parts: [16, S3, 7, S3, 10, ORB_BED2, 6, S3, 8, FLIP_ORBS(28, 3, 23, [6, 7, 12, 13, 18, 19]), 8,
      FLIP_RUN(34, [5, 6, 11, 12, 18, 19, 25, 26]), 8, CEIL_PAD, 6, S3, 8, GAP_SPIKES, 5, S3, 8,
      HOPS, 6, BLOCK_SPIKE, 5, SPIKE_ROW4, 8, ORB_BED2, 6, STAIRS, 5, S3, 8,
      FLIP_ORBS(32, 3, 27, [6, 7, 12, 13, 19, 20, 25]), 8, BED_PLAT2, 5, S3, 6, S3, 8,
      FLIP_RUN(40, [5, 6, 10, 11, 16, 17, 23, 24, 30, 31, 35]), 8, S3, 6, S2, 5, S3, 16],
  },
];
