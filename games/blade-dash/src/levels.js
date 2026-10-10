// Stages: 30 rooms over three chapters, laid out from a fixed seed so every
// player gets the same room 12. Each room is one screen (1280 x 720).
export const W = 1280, H = 720, FLOOR = 640;

export const CHAPTERS = [
  { name: 'Bamboo Forest', kanji: '竹', paper: '#f1e6cf', paper2: '#e6d6b6', ink: '#16120f', wash: '#8a8070', accent: '#c8281e', sun: '#d23a2a', fx: 'leaf' },
  { name: 'Red Castle', kanji: '城', paper: '#efe2d0', paper2: '#e0c9ae', ink: '#1a1210', wash: '#9a7a6a', accent: '#c8281e', sun: '#e0522f', fx: 'petal' },
  { name: 'Night Temple', kanji: '夜', paper: '#232a3c', paper2: '#1a2030', ink: '#f2ead8', wash: '#5a6488', accent: '#ff4a3a', sun: '#f2ead8', fx: 'ember' },
];

export const TIPS = {
  1: 'Tap or click anywhere to dash-slash that way',
  2: 'A hit refills your dash. Chain them without landing!',
  3: 'Lanterns float. Use them to chain across the gaps',
  4: 'A red ! means they\'re about to swing. Dash at them first, or dash clear',
  5: 'Fall in a gap and you\'re done. Dash over them',
  7: 'Archers fire when the line turns red. Dash through arrows to cut them',
  11: 'Shields block from the front. Hit them from behind or from above',
  14: 'Slash a barrel carrier and the blast takes out everyone near',
  10: 'A general takes three hits. Every hit refills your dash',
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Build room n (1..30). Returns { floor: [[x0,x1]...], plats: [{x,y,w,h}], enemies: [{type,x,y,...}], start, par }
export function buildStage(n) {
  const R = rng(n * 7919 + 13);
  const r = (a, b) => a + R() * (b - a);
  const chapter = Math.min(2, Math.floor((n - 1) / 10));
  // floor with gaps from stage 5
  const floor = [];
  const gaps = n < 5 ? 0 : n < 12 ? 1 : n < 22 ? (R() < 0.5 ? 1 : 2) : 2;
  const gapAt = [];
  for (let g = 0; g < gaps; g++) gapAt.push(gaps === 1 ? r(520, 820) : g === 0 ? r(380, 560) : r(780, 1000));
  let x = 0;
  for (const gx of gapAt) { const gw = r(150, 230); floor.push([x, gx]); x = gx + gw; }
  floor.push([x, W]);
  // floating platforms
  const plats = [];
  const nPlat = n < 2 ? 1 : 2 + Math.floor(R() * 3);
  let guard = 0;
  while (plats.length < nPlat && guard++ < 200) {
    const w = r(170, 320), px = r(160, W - 160 - w), py = r(250, 500);
    if (plats.some((p) => px < p.x + p.w + 60 && px + w > p.x - 60 && Math.abs(py - p.y) < 120)) continue;
    plats.push({ x: px, y: py, w, h: 26 });
  }
  // what lives here
  const count = Math.min(14, 2 + Math.floor(n * 0.42) + (n % 10 === 0 ? 3 : 0));
  const pool = ['grunt'];
  if (n >= 3) pool.push('flyer', 'flyer');
  if (n >= 7) pool.push('archer');
  if (n >= 11) pool.push('shield');
  if (n >= 14) pool.push('bomber');
  if (n >= 17) pool.push('archer', 'flyer');
  const enemies = [];
  const generals = n === 30 ? 2 : n % 10 === 0 ? 1 : 0;
  const spots = [];   // standing spots on top of ground or platforms
  for (const [a, b] of floor) if (b - a > 80) spots.push({ x0: Math.max(a + 40, 260), x1: b - 40, y: FLOOR });
  for (const p of plats) spots.push({ x0: p.x + 30, x1: p.x + p.w - 30, y: p.y });
  const far = (ex, ey) => Math.hypot(ex - 90, ey - FLOOR) > 300 && enemies.every((e) => Math.hypot(e.x - ex, e.y - ey) > 90);
  for (let k = 0; k < generals; k++) {
    for (let t = 0; t < 40; t++) {
      const s = spots[Math.floor(R() * spots.length)];
      if (s.x1 - s.x0 < 60) continue;
      const ex = r(s.x0, s.x1);
      if (far(ex, s.y)) { enemies.push({ type: 'general', x: ex, y: s.y, x0: s.x0, x1: s.x1 }); break; }
    }
  }
  guard = 0;
  while (enemies.length < count && guard++ < 400) {
    let type = n === 1 ? 'grunt' : n === 2 ? (enemies.length < 2 ? 'grunt' : 'grunt') : pool[Math.floor(R() * pool.length)];
    if (n === 3 && enemies.length < 2) type = 'flyer';
    if ([7, 11, 14].includes(n) && enemies.length === 0) type = n === 7 ? 'archer' : n === 11 ? 'shield' : 'bomber';
    // keep archers rare: 1 per room in chapter one, up to 3 by the end
    if (type === 'archer' && enemies.filter((e) => e.type === 'archer').length >= 1 + chapter) type = 'grunt';
    if (type === 'flyer') {
      const ex = r(300, W - 120), ey = r(150, 470);
      if (plats.some((p) => ex > p.x - 40 && ex < p.x + p.w + 40 && Math.abs(ey - p.y) < 70)) continue;
      if (far(ex, ey)) enemies.push({ type, x: ex, y: ey, phase: R() * 6.28 });
    } else {
      const s = spots[Math.floor(R() * spots.length)];
      if (!s || s.x1 - s.x0 < 30) continue;
      const ex = r(s.x0, s.x1);
      if (far(ex, s.y)) enemies.push({ type, x: ex, y: s.y, x0: s.x0, x1: s.x1, face: R() < 0.5 ? -1 : 1 });
    }
  }
  const par = Math.round((2 + enemies.length * 1.1 + gaps * 0.8) * 10) / 10;
  return { n, chapter, floor, plats, enemies, start: { x: 90, y: FLOOR }, par, tip: TIPS[n] };
}

// Endless: one open arena; waves spawn in from the edges.
export function buildArena() {
  return {
    n: 0, chapter: 2, floor: [[0, W]],
    plats: [{ x: 170, y: 430, w: 260, h: 26 }, { x: 850, y: 430, w: 260, h: 26 }, { x: 520, y: 270, w: 240, h: 26 }],
    enemies: [], start: { x: W / 2, y: FLOOR }, par: 0,
  };
}

export function waveSpawns(wave) {
  const R = rng(wave * 131 + Math.floor(Math.random() * 1e6));
  const types = ['grunt', 'flyer'];
  if (wave >= 2) types.push('archer');
  if (wave >= 3) types.push('flyer', 'shield');
  if (wave >= 4) types.push('bomber');
  const n = Math.min(12, 3 + wave);
  const out = [];
  for (let k = 0; k < n; k++) out.push(types[Math.floor(R() * types.length)]);
  if (wave % 5 === 0) out.push('general');
  return out;
}
