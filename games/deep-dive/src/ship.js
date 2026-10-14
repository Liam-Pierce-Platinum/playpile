// Ship generation (seeded hull plan -> decks -> rooms -> doors -> breaches -> air pockets)
// plus the local<->world transform and tile collision used by everything inside a hull.
import { TS, rng, ri, shuffle, clamp } from './util.js';

export const T = { OUT: 0, HULL: 1, WALL: 2, IN: 3, HATCH: 4, HOPEN: 5, DEBRIS: 6, WIN: 7, BREACH: 8 };
export const SOLID = [0, 1, 1, 0, 1, 0, 1, 1, 0];

function hull(W, H, { deck, bow, stern, supers }) {
  return (x, y) => {
    if (y >= deck) {
      const t = (y - deck) / (H - 1 - deck);
      const l = Math.round(stern * t * t);
      const r = W - 1 - Math.round(bow * Math.pow(t, 1.3));
      return x >= l && x <= r ? 1 : 0;
    }
    for (const [a, b, top] of supers) if (x >= a && x <= b && y >= top) return 1;
    return 0;
  };
}
function subMask(W, H) {
  const cx = (W - 1) / 2, cy = 7.5, rx = W / 2, ry = 5.2;
  return (x, y) => {
    if (y <= 3 && x >= 28 && x <= 37) return 1;
    if (y < 3) return 0;
    return Math.pow(Math.abs(x - cx) / rx, 4) + Math.pow((y - cy) / ry, 2) <= 1 ? 1 : 0;
  };
}
function rigMask(W, H) {
  return (x, y) => {
    if (y < 20) return x >= 1 && x <= W - 2 ? 1 : 0;
    if ((x >= 4 && x <= 7) || (x >= W - 8 && x <= W - 5)) return 2;
    if ((y === 29 || y === 38) && x > 7 && x < W - 8) return 2;
    const dx = 8 + Math.round((y - 20) * (W - 17) / 23);
    if (x >= 8 && x < W - 8 && (x === dx || x === dx + 1)) return 2;
    return 0;
  };
}

export const SPECS = {
  fishing: { W: 36, H: 14, floors: [5, 9], roomW: [5, 9], deck: 5, mask: hull(36, 14, { deck: 5, bow: 9, stern: 3, supers: [[19, 30, 1]] }), pal: { hull: '#c84a3c', stripe: '#ecebe2', bottom: '#5a2422', back: '#3b302a', wall: '#6a5442', trim: '#d9b26b' } },
  ferry: { W: 60, H: 18, floors: [3, 7, 12], roomW: [6, 11], deck: 7, mask: hull(60, 18, { deck: 7, bow: 11, stern: 3, supers: [[5, 50, 3], [14, 40, 0]] }), pal: { hull: '#e6e2d6', stripe: '#2f62b0', bottom: '#7a2a28', back: '#2b3440', wall: '#5d6672', trim: '#f0c040' } },
  cargo: { W: 80, H: 18, floors: [4, 11], roomW: [6, 9], holdW: [11, 18], deck: 4, mask: hull(80, 18, { deck: 4, bow: 13, stern: 3, supers: [[3, 14, 0]] }), pal: { hull: '#b85c2c', stripe: '#d8d0b8', bottom: '#4a2a22', back: '#2a2521', wall: '#544740', trim: '#e0a030' } },
  cruise: { W: 86, H: 28, floors: [3, 8, 13, 18, 23], roomW: [5, 9], deck: 13, mask: hull(86, 28, { deck: 13, bow: 15, stern: 4, supers: [[4, 76, 8], [10, 68, 3], [22, 54, 0]] }), pal: { hull: '#f0efe8', stripe: '#24335c', bottom: '#802c30', back: '#3a2c3a', wall: '#6e5e6c', trim: '#e6c35a' } },
  sub: { W: 66, H: 13, floors: [8], roomW: [7, 11], deck: 3, mask: subMask(66, 13), pal: { hull: '#3d444d', stripe: '#59626e', bottom: '#2a2f36', back: '#1e2328', wall: '#454e57', trim: '#c8a030' } },
  rig: { W: 42, H: 44, floors: [5, 10, 15], roomW: [6, 10], deck: 0, mask: rigMask(42, 44), pal: { hull: '#d9b234', stripe: '#2d2f33', bottom: '#6c6f74', back: '#2a2c30', wall: '#575b61', trim: '#e04a2a' } },
};

export function genShip(type, seed, diff, haz, survivorsN) {
  const S = SPECS[type], W = S.W, H = S.H, r = rng(seed);
  const N = W * H;
  const tiles = new Uint8Array(N), room = new Int16Array(N).fill(-1), door = new Int16Array(N).fill(-1), m = new Uint8Array(N);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) m[y * W + x] = S.mask(x, y);
  const inM = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x] > 0;
  const isOutside = (x, y) => !(x >= 0 && y >= 0 && x < W && y < H) || m[y * W + x] === 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (m[i] === 2) tiles[i] = T.HULL;
    else if (m[i] === 1) tiles[i] = (!inM(x - 1, y) || !inM(x + 1, y) || !inM(x, y - 1) || !inM(x, y + 1) || m[(y - 1) * W + x] === 2 || (y + 1 < H && m[(y + 1) * W + x] === 2)) ? T.HULL : T.IN;
  }
  for (const y of S.floors) for (let x = 0; x < W; x++) if (tiles[y * W + x] === T.IN) tiles[y * W + x] = T.WALL;
  // bands between floors -> vertical bulkheads
  const bands = []; let y0 = -1;
  for (let y = 0; y <= H; y++) {
    const rowHas = y < H && !S.floors.includes(y) && [...Array(W).keys()].some(x => tiles[y * W + x] === T.IN);
    if (rowHas && y0 < 0) y0 = y;
    if (!rowHas && y0 >= 0) { bands.push([y0, y - 1]); y0 = -1; }
  }
  for (const [a, b] of bands) {
    let minX = W, maxX = -1;
    for (let y = a; y <= b; y++) for (let x = 0; x < W; x++) if (tiles[y * W + x] === T.IN) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); }
    const widths = (type === 'cargo' && a > 4) ? S.holdW : S.roomW;
    let x = minX + ri(r, widths[0], widths[1]);
    while (x < maxX - 3) {
      for (let y = a; y <= b; y++) if (tiles[y * W + x] === T.IN) tiles[y * W + x] = T.WALL;
      x += ri(r, widths[0], widths[1]) + 1;
    }
  }
  // rooms
  let rooms = [];
  const fill = (sx, sy, id) => {
    const st = [sy * W + sx], list = []; room[sy * W + sx] = id;
    while (st.length) {
      const i = st.pop(); list.push(i); const x = i % W, y = (i / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx; if (tiles[j] === T.IN && room[j] < 0) { room[j] = id; st.push(j); }
      }
    }
    return list;
  };
  for (let i = 0; i < N; i++) if (tiles[i] === T.IN && room[i] < 0) {
    const id = rooms.length; const list = fill(i % W, (i / W) | 0, id);
    rooms.push({ id, tiles: list });
  }
  // kill tiny rooms
  for (const rm of rooms) if (rm.tiles.length < 4) { for (const i of rm.tiles) { tiles[i] = T.WALL; room[i] = -1; } rm.dead = true; }
  const remap = {}; rooms = rooms.filter(x => !x.dead); rooms.forEach((rm, k) => { remap[rm.id] = k; rm.id = k; });
  for (let i = 0; i < N; i++) if (room[i] >= 0) room[i] = remap[room[i]] ?? -1;
  // door candidates
  const cand = new Map();
  const addC = (a, b, c) => { const k = Math.min(a, b) + ',' + Math.max(a, b); if (!cand.has(k)) cand.set(k, { a: Math.min(a, b), b: Math.max(a, b), list: [] }); cand.get(k).list.push(c); };
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (tiles[i] !== T.WALL) continue;
    const L = room[i - 1], R = room[i + 1], U = room[i - W], D = room[i + W];
    if (L >= 0 && R >= 0 && L !== R) addC(L, R, { x, y, o: 'v' });
    if (U >= 0 && D >= 0 && U !== D) addC(U, D, { x, y, o: 'h' });
  }
  const parent = rooms.map((_, k) => k); const find = k => parent[k] === k ? k : (parent[k] = find(parent[k]));
  const edges = shuffle(r, [...cand.values()]);
  const doors = [];
  const pH = type === 'sub' ? 0.65 : 0.33, pD = 0.14 + 0.22 * diff;
  const makeDoor = (e) => {
    const L = e.list; let c;
    const vs = L.filter(q => q.o === 'v'), hs = L.filter(q => q.o === 'h');
    if (vs.length && (!hs.length || r() < 0.6)) { vs.sort((p, q) => q.y - p.y); c = vs[0]; } else c = hs[Math.floor(r() * hs.length)];
    const has = (x, y) => L.some(q => q.x === x && q.y === y && q.o === c.o);
    const ts = [c.y * W + c.x];
    if (c.o === 'v') { if (has(c.x, c.y - 1)) ts.push((c.y - 1) * W + c.x); else if (has(c.x, c.y + 1)) ts.push((c.y + 1) * W + c.x); }
    else { if (has(c.x + 1, c.y)) ts.push(c.y * W + c.x + 1); else if (has(c.x - 1, c.y)) ts.push(c.y * W + c.x - 1); }
    const q = r(); const kind = q < pH ? T.HATCH : q < pH + pD ? T.DEBRIS : T.IN;
    const id = doors.length;
    for (const t of ts) { tiles[t] = kind === T.IN ? T.HOPEN : kind; door[t] = id; }
    doors.push({ id, tiles: ts, kind, a: e.a, b: e.b, open: kind === T.IN, o: c.o });
  };
  for (const e of edges) { const A = find(e.a), B = find(e.b); if (A !== B) { parent[A] = B; makeDoor(e); } }
  for (const e of edges) if (!doors.some(d => (d.a === e.a && d.b === e.b)) && r() < 0.22) makeDoor(e);
  // breaches (entries)
  const ec = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (tiles[i] !== T.HULL || m[i] === 2) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ix = x - dx, iy = y - dy; // interior side
      if (ix < 0 || iy < 0 || ix >= W || iy >= H) continue;
      const j = iy * W + ix; if (room[j] < 0 || tiles[j] !== T.IN) continue;
      if (isOutside(x + dx, y + dy)) ec.push({ x, y, nx: dx, ny: dy, room: room[j], w: (dy > 0 && type !== 'rig' ? 1 : 0) + r() * 0.9 });
    }
  }
  ec.sort((a, b) => a.w - b.w);
  const nEnt = 2 + (W * H > 900 ? 1 : 0) + (W * H > 1800 ? 1 : 0);
  const entries = [];
  for (const c of ec) {
    if (entries.length >= nEnt) break;
    if (entries.some(e => Math.abs(e.x - c.x) + Math.abs(e.y - c.y) < 10 || e.room === c.room)) continue;
    entries.push(c);
  }
  for (const e of entries) {
    tiles[e.y * W + e.x] = T.BREACH;
    const ax = e.ny !== 0 ? 1 : 0, ay = e.nx !== 0 ? 1 : 0;
    for (const s of [1, -1]) {
      const x = e.x + ax * s, y = e.y + ay * s; if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const j = y * W + x, k = (y - e.ny) * W + (x - e.nx);
      if (tiles[j] === T.HULL && room[k] === e.room) { tiles[j] = T.BREACH; break; }
    }
  }
  // portholes
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x; if (tiles[i] !== T.HULL || m[i] === 2) continue;
    if ((x + y * 3) % 4 !== 0) continue;
    const side = (isOutside(x - 1, y) && room[i + 1] >= 0) || (isOutside(x + 1, y) && room[i - 1] >= 0) || (isOutside(x, y - 1) && room[i + W] >= 0 && type === 'sub');
    const wall = (y > 0 && y < H - 1 && isOutside(x, y + 1) === false && isOutside(x, y - 1) === false && (isOutside(x - 1, y) || isOutside(x + 1, y)));
    const topSide = !side && y < H - 1 && room[i + W] >= 0 && isOutside(x, y - 1) && false;
    if ((side && wall) || topSide) tiles[i] = T.WIN;
  }
  // also portholes along the long side wall rows: rooms adjacent to hull horizontally below deck are rare, so add on hull tiles with a room above/below that face out sideways
  // room graph distance from entry rooms
  const adj = rooms.map(() => []);
  for (const d of doors) { adj[d.a].push(d.b); adj[d.b].push(d.a); }
  const dist = rooms.map(() => 1e9); const q = [];
  for (const e of entries) { dist[e.room] = 0; q.push(e.room); }
  while (q.length) { const a = q.shift(); for (const b of adj[a]) if (dist[b] > dist[a] + 1) { dist[b] = dist[a] + 1; q.push(b); } }
  const entryRooms = new Set(entries.map(e => e.room));
  // room geometry
  for (const rm of rooms) {
    rm.n = rm.tiles.length; rm.air = 0; rm.air0 = 0; rm.rate = 0; rm.waterY = -1e9; rm.fires = 0; rm.dist = dist[rm.id];
    rm.lx = new Float32Array(rm.n); rm.ly = new Float32Array(rm.n); rm.ys = new Float32Array(rm.n);
    rm.tiles.forEach((i, k) => { rm.lx[k] = (i % W + 0.5) * TS - W * TS / 2; rm.ly[k] = (((i / W) | 0) + 0.5) * TS - H * TS / 2; });
    const rowsMap = new Map();
    for (const i of rm.tiles) { const y = (i / W) | 0, x = i % W; if (!rowsMap.has(y)) rowsMap.set(y, []); rowsMap.get(y).push(x); }
    rm.runs = [];
    for (const [y, xs] of rowsMap) { xs.sort((a, b) => a - b); let s = xs[0], p = xs[0]; for (let k = 1; k <= xs.length; k++) { if (k < xs.length && xs[k] === p + 1) { p = xs[k]; continue; } rm.runs.push([s, p, y]); if (k < xs.length) { s = p = xs[k]; } } }
    let cx = 0, cy = 0; for (let k = 0; k < rm.n; k++) { cx += rm.lx[k]; cy += rm.ly[k]; } rm.cx = cx / rm.n; rm.cy = cy / rm.n;
    rm.top = Math.min(...rm.ly);
  }
  // survivor rooms
  const pool = rooms.filter(rm => !entryRooms.has(rm.id) && rm.n >= 6 && rm.dist < 1e9);
  pool.forEach(rm => rm.score = rm.dist + r() * 2.5);
  pool.sort((a, b) => b.score - a.score);
  const sRooms = [];
  for (let k = 0; k < survivorsN; k++) sRooms.push(pool.length ? pool[k % pool.length] : rooms[k % rooms.length]);
  const floodBase = 240 - 85 * diff;
  const setAir = (rm, a) => { rm.air = rm.air0 = a; const tt = floodBase * (0.8 + r() * 0.45); rm.rate = a / tt; };
  for (const rm of sRooms) if (rm.air === 0) setAir(rm, 0.42 + r() * 0.36);
  const spare = pool.filter(rm => rm.air === 0); const nSpare = 1 + (W > 60 ? 1 : 0);
  for (let k = 0; k < nSpare && k < spare.length; k++) { const rm = spare[Math.floor(r() * spare.length)]; if (rm.air === 0) setAir(rm, 0.5 + r() * 0.2); }
  // survivors (local positions)
  const survivors = sRooms.map((rm, k) => {
    const ti = rm.tiles[Math.floor(r() * rm.n)];
    return { room: rm.id, lx: (ti % W + 0.5) * TS - W * TS / 2, ly: (((ti / W) | 0) + 0.5) * TS - H * TS / 2, look: k };
  });
  // fires inside air rooms
  const airRooms = rooms.filter(rm => rm.air > 0);
  const fires = [];
  for (let k = 0; k < (haz.fire || 0) && airRooms.length; k++) {
    const rm = airRooms[Math.floor(r() * airRooms.length)];
    // fire sits against a bulkhead in the upper half of the room
    const rowsOf = rm.tiles.map(i => (i / W) | 0), r0 = Math.min(...rowsOf), r1 = Math.max(...rowsOf), lim = Math.max(1, (r1 - r0 + 1) * rm.air * 0.6);
    const cands = rm.tiles.filter(i => ((i / W) | 0) - r0 < lim && (tiles[i - 1] === T.WALL || tiles[i + 1] === T.WALL || tiles[i - 1] === T.HULL || tiles[i + 1] === T.HULL));
    const i = (cands.length ? cands : rm.tiles)[Math.floor(r() * (cands.length || rm.n))];
    if (fires.some(f => f.i === i)) continue;
    fires.push({ i, room: rm.id, lx: (i % W + 0.5) * TS - W * TS / 2, ly: (((i / W) | 0) + 0.5) * TS - H * TS / 2, out: false, ph: r() * 6 });
    rm.fires++;
  }
  // crates (local)
  const crates = [];
  const crateRooms = type === 'cargo' ? rooms.filter(rm => rm.n >= 20) : rooms.filter(rm => rm.n >= 8);
  for (let k = 0; k < (haz.crate || 0) && crateRooms.length; k++) {
    const rm = crateRooms[Math.floor(r() * crateRooms.length)];
    const i = rm.tiles[Math.floor(r() * rm.n)];
    if (sRooms.includes(rm) && r() < 0.6) continue;
    crates.push({ lx: (i % W + 0.5) * TS - W * TS / 2, ly: (((i / W) | 0) + 0.5) * TS - H * TS / 2, vx: 0, vy: 0, w: 4, h: 4, kind: type === 'cargo' ? 'container' : type === 'ferry' ? 'barrel' : 'crate', c: Math.floor(r() * 4) });
  }
  // eel lairs: wall/hull tiles facing a flooded room or open water
  const eels = [];
  const ecand = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x; if (tiles[i] !== T.WALL && tiles[i] !== T.HULL) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, -1]]) {
      const j = (y + dy) * W + x + dx;
      const ok = (room[j] >= 0 && rooms[room[j]].air === 0 && !entryRooms.has(room[j])) || (tiles[i] === T.HULL && isOutside(x + dx, y + dy) && m[j] === 0);
      const j2 = (y + dy * 2) * W + x + dx * 2; const ok2 = y + dy * 2 >= 0 && y + dy * 2 < H && x + dx * 2 >= 0 && x + dx * 2 < W ? !SOLID[tiles[j2]] : true;
      if (ok && ok2) ecand.push({ x, y, dx, dy });
    }
  }
  shuffle(r, ecand);
  for (const c of ecand) { if (eels.length >= (haz.eel || 0)) break; if (eels.some(e => Math.abs(e.x - c.x) + Math.abs(e.y - c.y) < 8)) continue; eels.push(c); }
  // local jellyfish in flooded rooms
  const floodRooms = rooms.filter(rm => rm.air === 0 && rm.n >= 10 && !entryRooms.has(rm.id));
  const ljelly = [];
  for (let k = 0; k < Math.floor((haz.jelly || 0) / 2) && floodRooms.length; k++) {
    const rm = floodRooms[Math.floor(r() * floodRooms.length)]; const i = rm.tiles[Math.floor(r() * rm.n)];
    ljelly.push({ lx: (i % W + 0.5) * TS - W * TS / 2, ly: (((i / W) | 0) + 0.5) * TS - H * TS / 2 });
  }
  // bottom outline points (for settling on the sea floor)
  const bottom = [];
  for (let x = 0; x < W; x++) for (let y = H - 1; y >= 0; y--) if (tiles[y * W + x] !== T.OUT) { bottom.push([(x + 0.5) * TS - W * TS / 2, (y + 1) * TS - H * TS / 2]); break; }
  for (let y = 0; y < H; y++) { for (let x = 0; x < W; x++) if (tiles[y * W + x] !== T.OUT) { bottom.push([x * TS - W * TS / 2, (y + 0.5) * TS - H * TS / 2]); break; } for (let x = W - 1; x >= 0; x--) if (tiles[y * W + x] !== T.OUT) { bottom.push([(x + 1) * TS - W * TS / 2, (y + 0.5) * TS - H * TS / 2]); break; } }
  return {
    type, W, H, tiles, room, door, doors, rooms, entries, survivors, fires, crates, eels, ljelly, bottom, pal: S.pal, mask: m,
    x: 0, y: 0, ang: 0, angTarget: 0, cos: 1, sin: 0, sinkV: 0, settled: false, dirtyTiles: new Set(), built: false, lurchT: 18,
  };
}

export function setPose(s) { s.cos = Math.cos(s.ang); s.sin = Math.sin(s.ang); }
export function toLocal(s, wx, wy) { const dx = wx - s.x, dy = wy - s.y; return [dx * s.cos + dy * s.sin, -dx * s.sin + dy * s.cos]; }
export function toWorld(s, lx, ly) { return [s.x + lx * s.cos - ly * s.sin, s.y + lx * s.sin + ly * s.cos]; }
export function tileIdx(s, lx, ly) {
  const tx = Math.floor((lx + s.W * TS / 2) / TS), ty = Math.floor((ly + s.H * TS / 2) / TS);
  if (tx < 0 || ty < 0 || tx >= s.W || ty >= s.H) return -1;
  return ty * s.W + tx;
}
export function tileAt(s, lx, ly) { const i = tileIdx(s, lx, ly); return i < 0 ? T.OUT : s.tiles[i]; }
export function roomAt(s, lx, ly) { const i = tileIdx(s, lx, ly); return i < 0 || s.room[i] < 0 ? null : s.rooms[s.room[i]]; }
export function solidBox(s, x, y, hw, hh) {
  const ox = s.W * TS / 2, oy = s.H * TS / 2;
  const x0 = Math.floor((x - hw + ox) / TS), x1 = Math.floor((x + hw - 0.01 + ox) / TS);
  const y0 = Math.floor((y - hh + oy) / TS), y1 = Math.floor((y + hh - 0.01 + oy) / TS);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
    if (tx < 0 || ty < 0 || tx >= s.W || ty >= s.H) continue;
    if (SOLID[s.tiles[ty * s.W + tx]]) return true;
  }
  return false;
}
// moves body {lx,ly} in local space with sub-stepping; returns {hx,hy} collision flags
export function moveLocal(s, b, dx, dy, hw, hh) {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 2));
  const sx = dx / steps, sy = dy / steps; let hx = false, hy = false;
  for (let k = 0; k < steps; k++) {
    if (!hx) { b.lx += sx; if (solidBox(s, b.lx, b.ly, hw, hh)) { b.lx -= sx; hx = true; } }
    if (!hy) { b.ly += sy; if (solidBox(s, b.lx, b.ly, hw, hh)) { b.ly -= sy; hy = true; } }
  }
  return { hx, hy };
}
// is local point inside the hull's bounding box (with margin)
export function nearShip(s, wx, wy, m = 14) {
  const [lx, ly] = toLocal(s, wx, wy);
  return Math.abs(lx) < s.W * TS / 2 + m && Math.abs(ly) < s.H * TS / 2 + m;
}
// recompute room waterlines (world y); air occupies the highest tiles in world space
export function updateWaterlines(s) {
  for (const rm of s.rooms) {
    if (rm.air <= 0) { rm.waterY = -1e9; continue; }
    for (let k = 0; k < rm.n; k++) rm.ys[k] = s.y + rm.lx[k] * s.sin + rm.ly[k] * s.cos;
    rm.ys.sort();
    const t = clamp(rm.air, 0, 1) * rm.n; const i = Math.floor(t), f = t - i;
    const a = i > 0 ? rm.ys[i - 1] + TS / 2 : rm.ys[0] - TS / 2;
    const b = i < rm.n ? rm.ys[i] + TS / 2 : a;
    rm.waterY = a + (b - a) * f;
  }
}
