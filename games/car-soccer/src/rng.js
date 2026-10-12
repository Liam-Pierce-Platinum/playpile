// Seedable random (mulberry32) so headless sims are reproducible. Defaults to a random seed.
let s = (Math.random() * 2 ** 32) >>> 0;
export function seed(n) { s = n >>> 0; }
export function rand() {
  s = (s + 0x6d2b79f5) >>> 0;
  let t = s;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
