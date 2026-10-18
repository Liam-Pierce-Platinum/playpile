// Course generator. Each level = seeded chain of pads; every gap is checked against the jump envelope
// (speed 6, jump 9, gravity 28 -> 3 blocks flat, 2 blocks up one). Waypoints double as the bot's route.
import { T } from './world.js';

export const LEVELS = [
  'First Steps', 'Meadow Hop', 'Plank Run', 'Spring Garden', 'Frost Ledge', 'Ember Steps',
  'Sky Lifts', 'Builder Gap', 'Cloud Spiral', 'Molten Path', 'Glass Peaks', 'Summit Crown',
];

function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export const key = (x, y, z) => x + ',' + y + ',' + z;

export function sandbox() {
  const blocks = new Map(); const set = (x, y, z, t) => blocks.set(key(x, y, z), t);
  const r = rng(99);
  for (let x = -14; x < 14; x++) for (let z = -14; z < 14; z++) {
    const d = Math.hypot(x + .5, z + .5); if (d > 13.5) continue;
    set(x, 0, z, T.GRASS); const depth = Math.floor((13.5 - d) * .5 + r() * 2);
    for (let y = 1; y <= depth; y++) set(x, -y, z, y > 2 ? T.STONE : T.SAND);
  }
  tree(set, 6, 1, 5, r); tree(set, -7, 1, -4, r); tree(set, -5, 1, 7, r);
  return { name: 'Sandbox', blocks, spawn: [0.5, 1, 0.5], waypoints: [], gems: [], movers: [], goal: null, par: 0, build: Infinity, zones: [], sandbox: true };
}

function tree(set, x, y, z, r) {
  const h = 3 + Math.floor(r() * 2);
  for (let i = 0; i < h; i++) set(x, y + i, z, T.WOOD);
  for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) for (let dy = 0; dy < 3; dy++) {
    if (Math.abs(dx) + Math.abs(dz) + dy > 3 + (r() < .3 ? 1 : 0)) continue;
    if (dx === 0 && dz === 0 && dy < 1) continue;
    set(x + dx, y + h - 1 + dy, z + dz, T.LEAVES);
  }
}

export function makeLevel(li) {
  const r = rng(1000 + li * 7919);
  const ri = (a, b) => a + Math.floor(r() * (b - a + 1));
  const blocks = new Map(); const set = (x, y, z, t) => blocks.set(key(x, y, z), t);
  const waypoints = [], gems = [], movers = [], zones = [];
  let build = 0;
  const diff = li; // 0..11
  let py = 10, cx = 0, front;
  const pad = (x0, x1, z0, z1, y, t, wp = true, kind = 'pad') => {
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      set(x, y, z, typeof t === 'function' ? t(x, z) : t);
      if (y > 2 && r() < .5) set(x, y - 1, z, T.STONE);
    }
    const p = { x: (x0 + x1 + 1) / 2, z: (z0 + z1 + 1) / 2, y: y + 1, kind };
    if (wp) waypoints.push(p);
    front = z1; py = y; cx = Math.floor((x0 + x1) / 2);
    return p;
  };
  // start island
  pad(-3, 3, -3, 3, py, T.GRASS, false); tree(set, -3, py + 1, -3, r);
  const spawn = [0.5, py + 1, 0.5];
  const mats = [T.GRASS, T.STONE, T.WOOD, T.BRICK, T.SAND];
  const pool = ['hop', 'hop', 'beam'];
  if (diff >= 2) pool.push('bounce');
  if (diff >= 3) pool.push('ice', 'hop');
  if (diff >= 4) pool.push('lava');
  if (diff >= 5) pool.push('mover');
  if (diff >= 6) pool.push('build');
  if (diff >= 8) pool.push('mover', 'lava', 'bounce');
  const forced = [null, null, 'bounce', 'ice', 'lava', 'lava', 'mover', 'build', 'bounce', 'lava', 'mover', 'build'][li];
  const nSeg = 7 + Math.floor(diff * 1.1);
  let par = 6;
  for (let s = 0; s < nSeg; s++) {
    let kind = s === 2 && forced ? forced : pool[Math.floor(r() * pool.length)];
    const mat = mats[ri(0, mats.length - 1)];
    if (s > 0 && s % 4 === 0) { // checkpoint
      const z0 = front + 2; pad(cx - 1, cx + 1, z0, z0 + 2, py, (x, z) => (x === cx && z === z0 + 1 ? T.CHECK : T.STONE), true, 'check');
      par += 1.5;
    }
    if (kind === 'hop') {
      const dh = [-1, 0, 0, 1, 1][ri(0, 4)];
      const g = dh > 0 ? ri(1, 2) : ri(1, diff < 2 ? 2 : 3);
      const w = Math.max(1, ri(1, 3) - (diff > 6 ? 1 : 0)), len = ri(2, 3);
      const dx = ri(-1, 1); const z0 = front + 1 + g, ncx = cx + dx;
      pad(ncx - Math.floor(w / 2), ncx - Math.floor(w / 2) + w - 1, z0, z0 + len - 1, py + dh, mat);
      if (r() < .5) gems.push([waypoints.at(-1).x, py + 2.4, waypoints.at(-1).z]);
      par += 1.2;
    } else if (kind === 'beam') {
      const z0 = front + 2, len = ri(4, 7);
      pad(cx, cx, z0, z0 + len - 1, py, T.WOOD);
      gems.push([cx + .5, py + 2.3, z0 + len - 1]);
      par += 1.5;
    } else if (kind === 'bounce') {
      const z0 = front + 2;
      pad(cx - 1, cx + 1, z0, z0 + 1, py, T.STONE);
      const b = pad(cx - 1, cx + 1, z0 + 2, z0 + 2, py, T.BOUNCE, true, 'bounce');
      gems.push([b.x, py + 5, b.z + 1.5]);
      pad(cx - 1, cx + 1, z0 + 5, z0 + 7, py + 4, T.GRASS);
      par += 2.5;
    } else if (kind === 'ice') {
      const z0 = front + 2, len = ri(5, 8);
      pad(cx - 1, cx + 1, z0, z0 + len - 1, py, T.ICE);
      const z1 = front + 2; pad(cx - 1, cx + 1, z1, z1 + 2, py, mat);
      par += 2;
    } else if (kind === 'lava') {
      const n = ri(3, 4 + Math.floor(diff / 4)), z0 = front + 1;
      for (let x = cx - 3; x <= cx + 3; x++) for (let z = z0; z <= z0 + n * 2; z++) set(x, py - 1, z, T.LAVA);
      for (let i = 0; i < n; i++) { const zz = z0 + 1 + i * 2; pad(cx, cx, zz, zz, py, T.STONE); if (i === 1) gems.push([cx + .5, py + 2.2, zz + .5]); }
      pad(cx - 1, cx + 1, front + 2, front + 4, py, T.STONE);
      par += n * 0.8 + 1.5;
    } else if (kind === 'mover') {
      const gap = ri(5, 7), z0 = front + 1;
      const m = { x0: cx - 1, x1: cx + 1, y: py, za: z0, zb: z0 + gap - 2, len: 2, t: 0, period: 3.2 + r(), z: z0, dz: 0 };
      movers.push(m);
      waypoints.push({ x: cx + .5, z: z0 + 1, y: py + 1, kind: 'mover', m });
      pad(cx - 1, cx + 1, z0 + gap, z0 + gap + 2, py, mat, true, 'afterMover');
      par += m.period * 1.2 + 1;
    } else if (kind === 'build') {
      const gap = ri(4, 5), z0 = front + 1;
      waypoints.push({ x: cx + .5, z: front + .7, y: py + 1, kind: 'build', gap, bx: cx, by: py, bz: z0 });
      zones.push({ x: cx + .5, z: front, y: py + 1, msg: 'Too far to jump - aim down at the gap and RIGHT-CLICK to build a bridge' });
      build += gap + 2;
      for (let i = 0; i < gap; i++) gems.push(i === Math.floor(gap / 2) ? [cx + .5, py + 1.8, z0 + i + .5] : null);
      pad(cx - 1, cx + 1, z0 + gap, z0 + gap + 2, py, mat);
      par += 4;
    }
  }
  // goal island
  const z0 = front + 3;
  pad(cx - 3, cx + 3, z0, z0 + 6, py, T.GRASS, false);
  for (let x = cx - 1; x <= cx + 1; x++) for (let z = z0 + 2; z <= z0 + 4; z++) set(x, py, z, T.CHECK);
  const goal = [cx + .5, py + 1, z0 + 3.5];
  waypoints.push({ x: goal[0], z: goal[2], y: py + 1, kind: 'goal' });
  tree(set, cx + 3, py + 1, z0 + 6, r);
  par += 3;
  // decorative floating islands
  const zEnd = z0 + 6;
  for (let i = 0; i < 9 + diff; i++) {
    const side = r() < .5 ? -1 : 1, ix = side * ri(10, 26), iz = ri(-6, zEnd + 6), iy = ri(2, py + 8), rad = ri(2, 4);
    const top = [T.GRASS, T.GRASS, T.SAND, T.STONE][ri(0, 3)];
    for (let x = -rad; x <= rad; x++) for (let z = -rad; z <= rad; z++) {
      const d = Math.hypot(x, z); if (d > rad + .3) continue;
      const depth = Math.max(1, Math.floor((rad - d) * 1.3 + r() * 1.5));
      set(ix + x, iy, iz + z, top);
      for (let y = 1; y <= depth; y++) set(ix + x, iy - y, iz + z, y > 1 ? T.STONE : T.SAND);
    }
    if (top === T.GRASS && r() < .7) tree(set, ix, iy + 1, iz, r);
  }
  return { name: LEVELS[li], li, blocks, spawn, waypoints, gems: gems.filter(Boolean), movers, goal, par: Math.round(par), build, zones };
}
