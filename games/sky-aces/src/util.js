// small shared helpers
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const damp = (a, b, k, dt) => b + (a - b) * Math.exp(-k * dt);
export const smooth = (t) => t * t * (3 - 2 * t);

// seeded RNG (mulberry32) for the world layout so every client builds the same islands
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const fmtMoney = (n) => '$' + Math.round(n).toLocaleString('en-US');

export const QS = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
