// The castle: 14 floors and the roof. Each floor is a row of rooms (1280 x 720
// each) laid end to end. You break in through a window on the left, every room
// is sealed until its guards are down, and the stairs up are at the far right.
// Everything is laid out from a fixed seed, so floor 9 is the same for everyone.
export const W = 1280, H = 720, FLOOR = 640;
export const FLOORS = 14;          // floors 1..14, then the roof (15)
export const ROOF = 15;

export const CHAPTERS = [
  { name: 'Lower Halls', kanji: '城', paper: '#f1e6cf', paper2: '#e6d6b6', ink: '#16120f', wash: '#8a8070', accent: '#c8281e', sun: '#d23a2a', wood: '#3a2a1e', fx: 'dust', sky: ['#f4e3c2', '#e9c79a'] },
  { name: 'Red Halls', kanji: '炎', paper: '#efe0cc', paper2: '#dfc3a4', ink: '#1a1210', wash: '#9a6a5a', accent: '#c8281e', sun: '#e0522f', wood: '#3e1e16', fx: 'petal', sky: ['#f0b48a', '#c8584a'] },
  { name: 'Upper Keep', kanji: '夜', paper: '#262c3e', paper2: '#1b2132', ink: '#f2ead8', wash: '#5a6488', accent: '#ff4a3a', sun: '#f2ead8', wood: '#0e1018', fx: 'ember', sky: ['#1a2036', '#2a2440'] },
  { name: 'The Roof', kanji: '影', paper: '#1d2234', paper2: '#151a28', ink: '#f2ead8', wash: '#4a5478', accent: '#ff3a2a', sun: '#d8322a', wood: '#0a0c14', fx: 'ember', sky: ['#120f1e', '#3a1420'] },
];
export const chapterOf = (f) => (f >= ROOF ? 3 : f <= 5 ? 0 : f <= 10 ? 1 : 2);

export const TIPS = {
  1: 'Tap or click anywhere to dash-slash that way',
  2: 'Every room is sealed until its guards are down',
  3: 'Lanterns float. Use them to chain across the gaps',
  4: 'Floor spikes flash red before they spring. Stay off them, or stay in the air',
  6: 'Archers fire when the line turns red. Dash through arrows to cut them',
  8: 'Shields block from the front. Hit them from behind or from above',
  10: 'Slash a barrel carrier and the blast takes out everyone near',
  5: 'A general takes three hits. Every hit refills your dash',
};

function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const roomsOn = (f) => Math.min(6, 2 + Math.floor(f / 3));

// Build floor f (1..14). Returns { f, chapter, rooms:[{x0,x1}], floor:[[x0,x1]], plats, traps, enemies, start, par, width, tip }
export function buildFloor(f) {
  const R = rng(f * 7919 + 101);
  const r = (a, b) => a + R() * (b - a);
  const chapter = chapterOf(f);
  const nRooms = roomsOn(f);
  const rooms = [], floor = [], plats = [], traps = [], enemies = [];
  let par = 0;
  for (let i = 0; i < nRooms; i++) {
    const ox = i * W, x1 = ox + W, last = i === nRooms - 1;
    rooms.push({ x0: ox, x1 });
    const n = Math.min(30, Math.round(1 + (f - 1) * 2 + i * 0.7));   // the original's stage difficulty, 1..30
    // ground with spike pits (never near the doors or the stairs)
    const gaps = f < 3 ? 0 : f < 7 ? (R() < 0.6 ? 1 : 0) : f < 11 ? 1 : (R() < 0.5 ? 1 : 2);
    const gapAt = [];
    for (let g = 0; g < gaps; g++) gapAt.push(gaps === 1 ? ox + r(480, 760) : g === 0 ? ox + r(360, 500) : ox + r(760, 900));
    let x = ox;
    const segs = [];
    for (const gx of gapAt) { const gw = r(150, 210); segs.push([x, gx]); x = gx + gw; }
    segs.push([x, x1]);
    floor.push(...segs);
    // spring-spike traps on the ground
    const nTrap = f < 4 ? 0 : Math.min(2, Math.floor(R() * (1 + f / 6)));
    const roomTraps = [];
    for (let k = 0; k < nTrap; k++) {
      for (let t = 0; t < 20; t++) {
        const s = segs[Math.floor(R() * segs.length)], w = r(110, 170);
        const tx = r(s[0] + 60, s[1] - 60 - w);
        if (tx < ox + 280 || tx + w > x1 - (last ? 300 : 200)) continue;
        if (roomTraps.some((q) => tx < q.x + q.w + 80 && tx + w > q.x - 80)) continue;
        roomTraps.push({ x: tx, w, room: i, phase: R() * 2.4 });
        break;
      }
    }
    traps.push(...roomTraps);
    // floating beams
    const roomPlats = [];
    const nPlat = f < 2 && i === 0 ? 1 : 2 + Math.floor(R() * 3);
    let guard = 0;
    while (roomPlats.length < nPlat && guard++ < 200) {
      const w = r(170, 300), px = ox + r(140, W - 140 - w), py = r(250, 500);
      if (roomPlats.some((p) => px < p.x + p.w + 60 && px + w > p.x - 60 && Math.abs(py - p.y) < 120)) continue;
      roomPlats.push({ x: px, y: py, w, h: 26 });
    }
    plats.push(...roomPlats);
    // the guards
    const generals = last && (f === 5 || f === 10) ? 1 : last && f === 14 ? 2 : 0;
    const count = Math.min(10, 3 + Math.floor(n * 0.24)) + (f === 1 && i === 0 ? -1 : 0);
    const pool = ['grunt'];
    if (n >= 3) pool.push('flyer', 'flyer');
    if (n >= 9) pool.push('archer');
    if (n >= 13) pool.push('shield');
    if (n >= 17) pool.push('bomber');
    if (n >= 21) pool.push('archer', 'flyer', 'shield');
    const mine = [];
    const spots = [];
    for (const [a, b] of segs) if (b - a > 80) spots.push({ x0: Math.max(a + 40, ox + 300), x1: Math.min(b - 40, x1 - (last ? 260 : 120)), y: FLOOR });
    for (const p of roomPlats) spots.push({ x0: p.x + 30, x1: p.x + p.w - 30, y: p.y });
    const okSpots = spots.filter((s) => s.x1 - s.x0 > 30);
    const onTrap = (ex, ey) => ey === FLOOR && roomTraps.some((q) => ex > q.x - 30 && ex < q.x + q.w + 30);
    const far = (ex, ey) => ex > ox + 260 && mine.every((e) => Math.hypot(e.x - ex, e.y - ey) > 90) && !onTrap(ex, ey);
    for (let k = 0; k < generals; k++) {
      for (let t = 0; t < 40; t++) {
        const s = okSpots[Math.floor(R() * okSpots.length)];
        if (!s || s.x1 - s.x0 < 60) continue;
        const ex = r(s.x0, s.x1);
        if (far(ex, s.y)) { mine.push({ type: 'general', x: ex, y: s.y, x0: s.x0, x1: s.x1, room: i }); break; }
      }
    }
    guard = 0;
    while (mine.length < count + generals && guard++ < 400) {
      let type = pool[Math.floor(R() * pool.length)];
      if (f === 1) type = i === 0 || mine.length < 2 ? 'grunt' : type;
      if (f === 3 && i === 0 && mine.length < 2) type = 'flyer';
      if (f === 6 && i === 0 && mine.length === 0) type = 'archer';
      if (f === 8 && i === 0 && mine.length === 0) type = 'shield';
      if (f === 10 && i === 0 && mine.length === 0) type = 'bomber';
      if (type === 'archer' && mine.filter((e) => e.type === 'archer').length >= 1 + Math.min(2, chapter)) type = 'grunt';
      if (type === 'flyer') {
        const ex = ox + r(320, W - 140), ey = r(150, 470);
        if (roomPlats.some((p) => ex > p.x - 40 && ex < p.x + p.w + 40 && Math.abs(ey - p.y) < 70)) continue;
        if (far(ex, ey)) mine.push({ type, x: ex, y: ey, phase: R() * 6.28, room: i });
      } else {
        const s = okSpots[Math.floor(R() * okSpots.length)];
        if (!s) continue;
        const ex = r(s.x0, s.x1);
        if (far(ex, s.y)) mine.push({ type, x: ex, y: s.y, x0: s.x0, x1: s.x1, face: R() < 0.5 ? -1 : 1, room: i });
      }
    }
    enemies.push(...mine);
    par += 1.5 + mine.length * 0.6 + gaps * 0.5;
  }
  const width = nRooms * W;
  return { f, n: f, chapter, rooms, floor, plats, traps, enemies, width, start: { x: 120, y: FLOOR }, par: Math.round(par * 10) / 10, tip: TIPS[f], stairs: { x: width - 210 } };
}

// The roof: one screen, the rival waits, the princess is tied to the ridge pole.
export function buildRoof() {
  return {
    f: ROOF, n: ROOF, chapter: 3, rooms: [{ x0: 0, x1: W }], floor: [[0, W]],
    plats: [{ x: 110, y: 430, w: 250, h: 26 }, { x: 920, y: 430, w: 250, h: 26 }, { x: 520, y: 270, w: 240, h: 26 }],
    traps: [], enemies: [], width: W, start: { x: 200, y: FLOOR }, par: 0, roof: true,
  };
}
