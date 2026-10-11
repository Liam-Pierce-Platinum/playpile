// Seeded randomness. Every stream (deals, shop, board events) is derived from the
// run seed plus a label, so buying things in the shop never changes your deals and
// the Daily run is identical for everyone.
export function hashStr(s) {
  let h1 = 0xdeadbeef ^ s.length, h2 = 0x41c6ce57 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h1 ^ h2) >>> 0;
}

export class RNG {
  constructor(seed) { this.s = (typeof seed === 'string' ? hashStr(seed) : seed >>> 0) || 1; }
  next() { // splitmix32
    let z = (this.s = (this.s + 0x9e3779b9) >>> 0);
    z ^= z >>> 16; z = Math.imul(z, 0x21f0aaad);
    z ^= z >>> 15; z = Math.imul(z, 0x735a2d97);
    z ^= z >>> 15;
    return (z >>> 0) / 4294967296;
  }
  int(n) { return Math.floor(this.next() * n); }
  pick(a) { return a[this.int(a.length)]; }
  chance(p) { return this.next() < p; }
  weighted(items, wf) {
    let tot = 0; for (const it of items) tot += Math.max(0, wf(it));
    let r = this.next() * tot;
    for (const it of items) { r -= Math.max(0, wf(it)); if (r <= 0) return it; }
    return items[items.length - 1];
  }
  shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = this.int(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
}

export const stream = (seed, ...parts) => new RNG(seed + '|' + parts.join('|'));
