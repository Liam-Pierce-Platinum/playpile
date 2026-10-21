// Stages: 60 rooms over six chapters, laid out from a fixed seed so every
// player gets the same room 12. Each room is one screen (1280 x 720).
// Every chapter ends on stage 10, 20, ... 60; stages 40, 50 and 60 are boss fights.
export const W = 1280, H = 720, FLOOR = 640;
export const STAGES = 60;

// dark: light ink on dark paper (changes masks, trail cores and the letterbox fill)
export const CHAPTERS = [
  { name: 'Bamboo Forest', kanji: '竹', paper: '#f1e6cf', paper2: '#e6d6b6', ink: '#16120f', wash: '#8a8070', accent: '#c8281e', sun: '#d23a2a', fx: 'leaf', bg: '#1a1410' },
  { name: 'Red Castle', kanji: '城', paper: '#efe2d0', paper2: '#e0c9ae', ink: '#1a1210', wash: '#9a7a6a', accent: '#c8281e', sun: '#e0522f', fx: 'petal', bg: '#1a1410' },
  { name: 'Night Temple', kanji: '夜', paper: '#232a3c', paper2: '#1a2030', ink: '#f2ead8', wash: '#5a6488', accent: '#ff4a3a', sun: '#f2ead8', fx: 'ember', bg: '#0d111c', dark: true },
  { name: 'Snow Pass', kanji: '雪', paper: '#eef0ee', paper2: '#d9dfe1', ink: '#141a20', wash: '#7d8c98', accent: '#c8281e', sun: '#b9c6cf', fx: 'snow', bg: '#12171c' },
  { name: 'Burning Village', kanji: '炎', paper: '#f2d9b4', paper2: '#e3a777', ink: '#1a0e08', wash: '#8a4a2c', accent: '#b8160c', sun: '#ff6a22', fx: 'ash', bg: '#1c0e08' },
  { name: 'Shogun Fortress', kanji: '将', paper: '#2c2830', paper2: '#1c1a22', ink: '#efe6d4', wash: '#6c5e78', accent: '#ff4a3a', sun: '#e9d9a8', fx: 'rain', bg: '#0e0c12', dark: true },
];

export const TIPS = {
  1: 'Tap or click anywhere to dash-slash that way',
  2: 'A hit refills your dash. Chain them without landing!',
  3: 'Lanterns float. Use them to chain across the gaps',
  4: 'A red ! means they\'re about to swing. Dash at them first, or dash clear',
  5: 'Fall in a gap and you\'re done. Dash over them',
  7: 'Archers fire when the line turns red. Dash through arrows to cut them',
  10: 'A general takes three hits. Every hit refills your dash',
  11: 'Shields block from the front. Hit them from behind or from above',
  14: 'Slash a barrel carrier and the blast takes out everyone near',
  31: 'Ninja leap between ledges. Catch them in the air',
  40: 'Boss! Every hit refills your dash. Keep him off balance',
  41: 'Fire vents smoke, then flare. Don\'t stand on them when they burn',
};

// stage -> boss. phases: how many of the three behaviours he unlocks as he loses health
export const BOSSES = {
  40: { name: 'The Frost General', kanji: '氷', hp: 6, phases: 2, scale: 1.7 },
  50: { name: 'The Flame General', kanji: '炎', hp: 8, phases: 3, scale: 1.75 },
  60: { name: 'The Shogun', kanji: '将', hp: 10, phases: 3, scale: 1.9, summons: true },
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const chapterOf = (n) => Math.max(0, Math.min(CHAPTERS.length - 1, Math.floor((n - 1) / 10)));

// Build room n (1..60). Returns { floor: [[x0,x1]...], plats: [{x,y,w,h}], enemies: [{type,x,y,...}], vents, spots, start, par }
export function buildStage(n) {
  if (BOSSES[n]) return buildBoss(n);
  const R = rng(n * 7919 + 13);
  const r = (a, b) => a + R() * (b - a);
  const chapter = chapterOf(n);
  const inCh = (n - 1) % 10;   // 0..9 inside the chapter
  // floor with gaps from stage 5; each later chapter opens with an easier one-gap room
  const floor = [];
  const gaps = n < 5 ? 0 : n < 12 ? 1 : n < 22 ? (R() < 0.5 ? 1 : 2) : n > 30 && inCh < 2 ? 1 : 2;
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
  const count = n <= 30 ? Math.min(14, 2 + Math.floor(n * 0.42) + (n % 10 === 0 ? 3 : 0))
    : Math.min(14, 10 + Math.floor(inCh / 3) + Math.floor((n - 31) / 10));
  const pool = ['grunt'];
  if (n >= 3) pool.push('flyer', 'flyer');
  if (n >= 7) pool.push('archer');
  if (n >= 11) pool.push('shield');
  if (n >= 14) pool.push('bomber');
  if (n >= 17) pool.push('archer', 'flyer');
  if (n >= 31) pool.push('ninja', 'ninja');
  if (n >= 45) pool.push('ninja');
  const enemies = [];
  const generals = n === 30 ? 2 : n % 10 === 0 ? 1 : n > 30 && inCh === 4 ? 1 : n > 50 && inCh === 7 ? 1 : 0;
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
  const archerCap = Math.min(3, 1 + chapter);
  guard = 0;
  while (enemies.length < count && guard++ < 400) {
    let type = n <= 2 ? 'grunt' : pool[Math.floor(R() * pool.length)];
    if (n === 3 && enemies.length < 2) type = 'flyer';
    const intro = { 7: 'archer', 11: 'shield', 14: 'bomber', 31: 'ninja' }[n];
    if (intro && enemies.length === generals) type = intro;
    // keep archers rare: 1 per room in chapter one, up to 3 later
    if (type === 'archer' && enemies.filter((e) => e.type === 'archer').length >= archerCap) type = 'grunt';
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
  // fire vents (chapter five on): on the ground, never near the start
  const vents = [];
  const nVents = n < 41 ? 0 : n < 51 ? 1 + (R() < 0.4 ? 1 : 0) : 2;
  guard = 0;
  while (vents.length < nVents && guard++ < 100) {
    const seg = floor[Math.floor(R() * floor.length)];
    const vx = r(seg[0] + 60, seg[1] - 60);
    if (vx < 340 || seg[1] - seg[0] < 200) continue;
    if (vents.some((v) => Math.abs(v.x - vx) < 260)) continue;
    vents.push({ x: vx, w: 64, phase: R() * 3.2 });
  }
  const par = Math.round((2 + enemies.length * 1.1 + gaps * 0.8) * 10) / 10;
  return { n, chapter, floor, plats, enemies, vents, spots, start: { x: 90, y: FLOOR }, par, tip: TIPS[n], calm: n <= 3 };
}

// Boss arena: a flat floor, two side ledges, a high centre ledge and lanterns to chain off.
function buildBoss(n) {
  const b = BOSSES[n], chapter = chapterOf(n);
  const plats = [{ x: 150, y: 440, w: 240, h: 26 }, { x: 890, y: 440, w: 240, h: 26 }, { x: 545, y: 290, w: 190, h: 26 }];
  const spots = [{ x0: 260, x1: W - 40, y: FLOOR }, ...plats.map((p) => ({ x0: p.x + 30, x1: p.x + p.w - 30, y: p.y }))];
  const enemies = [
    { type: 'boss', x: 930, y: FLOOR, x0: 230, x1: W - 70, boss: n },
    { type: 'flyer', x: 470, y: 330, phase: 0 },
    { type: 'flyer', x: 820, y: 250, phase: 2 },
  ];
  return { n, chapter, floor: [[0, W]], plats, enemies, vents: [], spots, start: { x: 90, y: FLOOR }, par: 14 + b.hp * 1.5, tip: TIPS[n], boss: b };
}

// Endless: one open arena; waves spawn in from the edges.
export function buildArena() {
  const plats = [{ x: 170, y: 430, w: 260, h: 26 }, { x: 850, y: 430, w: 260, h: 26 }, { x: 520, y: 270, w: 240, h: 26 }];
  return {
    n: 0, chapter: 2, floor: [[0, W]], plats, vents: [],
    spots: [{ x0: 40, x1: W - 40, y: FLOOR }, ...plats.map((p) => ({ x0: p.x + 30, x1: p.x + p.w - 30, y: p.y }))],
    enemies: [], start: { x: W / 2, y: FLOOR }, par: 0,
  };
}

export function waveSpawns(wave) {
  const R = rng(wave * 131 + Math.floor(Math.random() * 1e6));
  const types = ['grunt', 'flyer'];
  if (wave >= 2) types.push('archer');
  if (wave >= 3) types.push('flyer', 'shield');
  if (wave >= 4) types.push('bomber');
  if (wave >= 6) types.push('ninja');
  const n = Math.min(12, 3 + wave);
  const out = [];
  for (let k = 0; k < n; k++) out.push(types[Math.floor(R() * types.length)]);
  if (wave % 5 === 0) out.push('general');
  return out;
}
