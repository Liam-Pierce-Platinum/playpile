// =====================================================================
// HIGHRISE :: rng.js - one seeded stream, so a floor is reproducible
// =====================================================================
//
// Every floor of the tower is generated, and a floor you cannot generate
// twice is a floor you cannot debug. Seeded from the floor number, so
// "floor 34 has a bad wall" is a thing that can be looked at again.
export function rng(seed) {
  let a = (seed | 0) || 1;
  const f = () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.sign = () => (f() < 0.5 ? -1 : 1);
  return f;
}
