// Small shared helpers: seeded RNG, colour palette, maths.
export function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  const r = () => {
    s |= 0; s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  r.weighted = (obj) => { let tot = 0; for (const k in obj) tot += obj[k]; let x = r() * tot; for (const k in obj) { x -= obj[k]; if (x <= 0) return k; } return Object.keys(obj)[0]; };
  return r;
}

// Clue colours are chosen to stay readable under every time-of-day preset.
export const COLORS = {
  red: 0xd0262b, blue: 0x2257d6, green: 0x2f9a3e, yellow: 0xf3c62c, white: 0xf0efe9,
  black: 0x1c1c21, grey: 0x8b8e95, orange: 0xf07a18, purple: 0x7c3cb5, pink: 0xf272a6,
  brown: 0x76492a, beige: 0xcdb78a, navy: 0x1b2747, lime: 0xc6e83a, denim: 0x3c5f95,
};
export const TOP_COLORS = ['red', 'blue', 'green', 'yellow', 'white', 'black', 'grey', 'orange', 'purple', 'pink', 'brown'];
export const BOTTOM_COLORS = ['blue', 'black', 'grey', 'beige', 'brown', 'white', 'green', 'red'];
export const BOTTOM_W = { blue: 5, black: 4, grey: 3, beige: 3, brown: 2, white: 1, green: 1, red: 1 };
export const HAT_COLORS = ['black', 'red', 'blue', 'white', 'grey', 'brown', 'green', 'yellow'];
export const HAIR = { black: 0x16120f, brown: 0x4b2e1a, blonde: 0xd8b26a, grey: 0xa9a9a6, ginger: 0xb2501f };
export const SKIN = [0xf2d2b6, 0xe6b894, 0xc98e66, 0xa8714b, 0x7c4f33, 0x5a3825];

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const fmtTime = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
