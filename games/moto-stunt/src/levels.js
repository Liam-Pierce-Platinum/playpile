// Level builder: seeded piece sequences -> polylines (ground), obstacles, checkpoints, finish.
export const THEMES = [
  { name: 'Mesa Noon', sky: [0x5fc8ff, 0xfff1b8, 0xffffff], ground: 0xd9653b, ground2: 0xb84a2e, top: 0xf2c13a, prop: 0xe0794a, far: 0xf0a070 },
  { name: 'Sunset Junk', sky: [0xff6f91, 0xffc46b, 0xffe08a], ground: 0x7b4fa8, ground2: 0x5c3a8a, top: 0x52e0a0, prop: 0x9a5fc0, far: 0xff9a7a },
  { name: 'Night Pop', sky: [0x1d2a6b, 0x7b3fa0, 0x3fe0ff], ground: 0x2f7d8a, ground2: 0x23606b, top: 0xff4fa3, prop: 0x3a4f9a, far: 0x6a4fc0 },
];
export const NAMES = ['Warm Up', 'Hop Scotch', 'Barrel Run', 'Big Air', 'Hammer Time', 'Rolling Hills', 'The Pit', 'Crusher Alley',
  'Sky Ramp', 'Double Trouble', 'Kaboom Canyon', 'Grand Finale'];
export const COUNT = NAMES.length;

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function buildLevel(i) {
  const R = rng(7919 * (i + 3));
  const d = i / (COUNT - 1);
  const lines = []; let cur = [];
  let x = -10, y = 0;
  const obs = [], checks = [], pits = [];
  const pt = () => cur.push([x, y]);
  const flat = (L) => { x += L; pt(); };
  const slope = (L, dy) => { const n = Math.max(2, Math.ceil(L / 1.2)), x0 = x, y0 = y; for (let k = 1; k <= n; k++) { const t = k / n; x = x0 + L * t; y = y0 + dy * (1 - Math.cos(Math.PI * t)) / 2; pt(); } };
  const ramp = (L, H) => { const n = Math.max(2, Math.ceil(L / 1.2)), x0 = x, y0 = y; for (let k = 1; k <= n; k++) { const t = k / n; x = x0 + L * t; y = y0 + H * t * t; pt(); } };
  const end = () => { if (cur.length > 1) lines.push(cur); cur = []; };
  const gap = (w, dy) => { const x0 = x, y0 = y; end(); x += w; y += dy; pits.push([x0, x, Math.min(y0, y)]); pt(); };
  const check = () => { flat(4); checks.push([x - 2, y]); flat(4); };
  pt(); flat(26);
  const n = 8 + Math.round(i * 1.4);
  const pool = ['hills', 'jump', 'jump', 'climb', 'drop', 'bumps'];
  if (i >= 1) pool.push('barrels', 'jump');
  if (i >= 3) pool.push('bigjump', 'barrels');
  if (i >= 4) pool.push('hammer', 'hammer');
  if (i >= 6) pool.push('pitbarrel');
  if (i >= 8) pool.push('bigjump', 'hammer');
  let last = '';
  for (let k = 0; k < n; k++) {
    let p = pool[Math.floor(R() * pool.length)];
    if (p === last) p = pool[Math.floor(R() * pool.length)];
    while (p === 'hammer' && last === 'hammer') p = pool[Math.floor(R() * pool.length)];
    last = p;
    if (p === 'hills') { const a = 1 + R() * 1.5 + d, m = 2 + Math.floor(R() * 2); for (let h = 0; h < m; h++) { slope(7, a); slope(7, -a); } flat(4); }
    else if (p === 'jump') { flat(6); ramp(7, 2 + R()); gap(4.5 + d * 3.5 + R() * 1.5, -1.5 - R() * 2); slope(9, -2); flat(8); }
    else if (p === 'bigjump') { flat(10); ramp(12, 3.5 + R()); gap(7 + d * 2, -5 - R() * 2); slope(14, -4); flat(12); }
    else if (p === 'climb') { slope(16, 4 + R() * 3); flat(6); }
    else if (p === 'drop') { flat(3); slope(10, -(4 + R() * 3)); flat(8); }
    else if (p === 'bumps') { for (let h = 0; h < 5; h++) { slope(2, 0.55); slope(2, -0.55); } flat(5); }
    else if (p === 'barrels') { flat(6); ramp(5, 1.4); x += 0.3; y -= 1.4; pt(); flat(2.5); obs.push({ t: 'barrel', x, y }); if (R() < 0.5 + d * 0.4) obs.push({ t: 'barrel', x: x + 1.3, y }); flat(10); }
    else if (p === 'hammer') { flat(6); obs.push({ t: 'hammer', x: x + 4, y, ph: R() * 6.28, sp: 1.5 + d * 0.6 }); flat(12); }
    else if (p === 'pitbarrel') { flat(6); ramp(7, 2.5); gap(6 + d * 2, -1.5); flat(4); ramp(5, 1.4); x += 0.3; y -= 1.4; pt(); flat(2.5); obs.push({ t: 'barrel', x, y }); flat(10); }
    if (k % 3 === 2 && k < n - 1) check();
  }
  flat(14); const finish = x; flat(30); end();
  let minY = 0; for (const l of lines) for (const p of l) minY = Math.min(minY, p[1]);
  const segs = [];
  for (const l of lines) for (let k = 0; k < l.length - 1; k++) segs.push([l[k][0], l[k][1], l[k + 1][0], l[k + 1][1]]);
  const length = finish;
  return { i, name: NAMES[i], theme: THEMES[Math.floor(i / 4) % THEMES.length], lines, segs, obs, checks, pits, finish, minY, par: length / 15 };
}
