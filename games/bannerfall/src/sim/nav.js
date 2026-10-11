// BANNERFALL :: sim/nav.js - navigation on maps from 256 m to 4 km (DESIGN.md 16.1).
//
// Three layers, all built from one terrain-only FINE BASE grid at 2 m (Uint8, cost x32, 0 = blocked):
//  1. fine 2 m costs, plus per-team OVERLAY tiles (64 m) wherever a structure stands: own walls
//     block, own gates open, enemy gates cost 25 and enemy walls 40 (the squad walks up and bashes).
//  2. a MID grid at 4 m (terrain only) for long marches: weighted A*, then string-pulled.
//  3. refinement: every leg of a long path that the fine grid says is blocked (a wall, a gate, a
//     dug trench) is re-planned with a windowed fine A*. Short trips (< 160 m) use fine A* directly.
// Structures and trenches only touch the overlay tiles and base cells they cover, so building a
// palisade in the middle of a battle costs a few hundred microseconds, not a whole-map rebuild.
// Costs: open 1, rock 1.5, tree 1.6, steep 1.8, shallow water 2.5, trench 3, map edge 4.
import { C } from '../data/constants.js';
import { structList } from './structures.js';

const BLOCK = 1e9;
const TS = 32;                    // fine cells per overlay tile side (64 m)
const FINE_DIRECT = 160;          // metres: below this, plan on the fine grid directly
const MAXWIN = 420;               // largest fine A* window side (cells)

// ------------------------------------------------------------------ the shared base
function buildBase(world) {
  const hf = world.terrain, cs = C.NAV_CELL;
  const W = Math.ceil(hf.size / cs);
  const NT = Math.ceil(W / TS);
  const base = new Uint8Array(W * W);
  const nav = { W, cs, NT, base, moat: new Uint8Array(W * W), mid: null, MW: 0, teams: {}, structIds: new Map(), tv: hf.version, lines: (hf.trenchLines || []).length, sv: -1 };
  if (world._restoredNavFail) { nav.fail = new Map(world._restoredNavFail); world._restoredNavFail = null; }
  world._navW = nav;
  fillBase(world, nav, 0, 0, W - 1, W - 1);
  // static obstacles: buildings block, trees and small stones only slow
  for (const o of world.obstacles) stampObstacle(nav, o);
  nav.MW = Math.ceil(W / 2);
  buildMid(nav, 0, 0, nav.MW - 1, nav.MW - 1);
  return nav;
}

function enc(c) { return c >= BLOCK ? 0 : Math.max(1, Math.min(255, Math.round(c * 32))); }

function fillBase(world, nav, i0, j0, i1, j1) {
  const hf = world.terrain, cs = nav.cs, W = nav.W, base = nav.base;
  const fast = hf.isWorld ? hf.coarse : null;           // read the 2 m arrays directly where no detail tile exists
  const wl = hf.waterLevel;
  i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(W - 1, i1); j1 = Math.min(W - 1, j1);
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const x = (i + 0.5) * cs, z = (j + 0.5) * cs;
    let c = 1, wd, sl, mat, tr = 0;
    if (fast && !hf.tileAtXZ(x, z) && cs === 2 && fast.res === 2) {
      // the cell centre sits between four 2 m nodes
      const n = fast.n, H = fast.h, k = Math.min(j, n - 2) * n + Math.min(i, n - 2);
      const a = H[k], b = H[k + 1], d = H[k + n], e = H[k + n + 1];
      const h = (a + b + d + e) * 0.25;
      wd = Math.max(0, wl - h);
      const sx = (b + e - a - d) * 0.25, sz = (d + e - a - b) * 0.25;   // per 2 m
      sl = Math.sqrt(sx * sx + sz * sz) / 2;
      mat = fast.mat[k];
    } else {
      wd = hf.waterDepth(x, z);
      sl = hf.slope(x, z);
      mat = hf.matAt(x, z);
      tr = Math.max(hf.trenchAmt(x, z), hf.trenchAmt(x + 0.6, z), hf.trenchAmt(x - 0.6, z));
    }
    if (wd > 1.05) c = BLOCK; else if (wd > 0.05) c = 2.5;
    if (sl > 1.1) c = BLOCK; else if (sl > 0.5) c = Math.max(c, 1.8);
    if (c < BLOCK) {
      if (mat === 3) c = Math.max(c, 1.5);
      if (tr > 1.5) c = 8; else if (tr > 0.5) c = Math.max(c, 3);
    }
    if (nav.moat) nav.moat[j * W + i] = tr > 1.5 ? 1 : 0;
    if (i === 0 || j === 0 || i === W - 1 || j === W - 1) c = Math.max(c, 4);
    base[j * W + i] = enc(c);
  }
}

function stampObstacle(nav, o) {
  const { W, cs, base } = nav;
  if (o.r < 1.2) {
    const i = Math.floor(o.x / cs), j = Math.floor(o.z / cs);
    if (i >= 0 && j >= 0 && i < W && j < W && base[j * W + i]) base[j * W + i] = Math.max(base[j * W + i], enc(1.6));
    return;
  }
  const r = o.r + 0.3;
  for (let j = Math.floor((o.z - r) / cs); j <= Math.floor((o.z + r) / cs); j++)
    for (let i = Math.floor((o.x - r) / cs); i <= Math.floor((o.x + r) / cs); i++) {
      if (i < 0 || j < 0 || i >= W || j >= W) continue;
      if (Math.hypot((i + 0.5) * cs - o.x, (j + 0.5) * cs - o.z) < r) base[j * W + i] = 0;
    }
}

// mid grid: 2 x 2 fine cells. Passable when at least 2 of the 4 are.
function buildMid(nav, mi0, mj0, mi1, mj1) {
  const { W, base, MW } = nav;
  if (!nav.mid) nav.mid = new Float32Array(MW * MW);
  const mid = nav.mid;
  mi0 = Math.max(0, mi0); mj0 = Math.max(0, mj0); mi1 = Math.min(MW - 1, mi1); mj1 = Math.min(MW - 1, mj1);
  for (let mj = mj0; mj <= mj1; mj++) for (let mi = mi0; mi <= mi1; mi++) {
    let n = 0, s = 0;
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) {
      const i = mi * 2 + di, j = mj * 2 + dj;
      if (i >= W || j >= W) continue;
      const v = base[j * W + i];
      if (v) { n++; s += v / 32; }
    }
    mid[mj * MW + mi] = n >= 2 ? s / n : BLOCK;
  }
}

// ------------------------------------------------------------------ per-team overlay tiles
function teamNav(world, nav, team) {
  let T = nav.teams[team];
  if (!T) {
    T = nav.teams[team] = { team, over: new Map(), arr: new Array(nav.NT * nav.NT).fill(null) };
    const keys = new Set();
    for (const s of structList(world)) for (const k of tilesOf(nav, structBox(s))) keys.add(k);
    for (const k of keys) buildOverlay(world, nav, T, k);
  }
  return T;
}

function structBox(s) {
  const r = (s.kind === 'tower' ? s.size / 2 : (s.thick || 0.6) / 2) + 0.7 + 2 + (s.kind === 'gate' ? 12 : 0);
  return { x0: Math.min(s.a[0], s.b[0]) - r, z0: Math.min(s.a[1], s.b[1]) - r, x1: Math.max(s.a[0], s.b[0]) + r, z1: Math.max(s.a[1], s.b[1]) + r };
}
function tilesOf(nav, b) {
  const tm = TS * nav.cs, out = [];
  const i0 = Math.max(0, Math.floor(b.x0 / tm)), i1 = Math.min(nav.NT - 1, Math.floor(b.x1 / tm));
  const j0 = Math.max(0, Math.floor(b.z0 / tm)), j1 = Math.min(nav.NT - 1, Math.floor(b.z1 / tm));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) out.push(j * nav.NT + i);
  return out;
}

function buildOverlay(world, nav, T, key) {
  const { W, NT, base, cs } = nav;
  const ti = key % NT, tj = (key / NT) | 0;
  const i0 = ti * TS, j0 = tj * TS;
  const tm = TS * cs;
  const box = { x0: ti * tm, z0: tj * tm, x1: ti * tm + tm, z1: tj * tm + tm };
  const ss = [];
  for (const s of structList(world)) {
    if (s.kind === 'caltrops') continue;
    const b = structBox(s);
    if (b.x1 < box.x0 || b.x0 > box.x1 || b.z1 < box.z0 || b.z0 > box.z1) continue;
    ss.push(s);
  }
  if (!ss.length) { T.over.delete(key); T.arr[key] = null; return; }
  const cost = new Float32Array(TS * TS);
  for (let j = 0; j < TS; j++) for (let i = 0; i < TS; i++) {
    const gi = i0 + i, gj = j0 + j;
    const v = gi < W && gj < W ? base[gj * W + gi] : 0;
    cost[j * TS + i] = v ? v / 32 : BLOCK;
  }
  ss.sort((p, q) => (p.kind === 'gate') - (q.kind === 'gate'));
  const team = T.team;
  for (const s of ss) {
    let c;
    if (s.kind === 'stairs') continue;
    if (s.dock && s.dock.team === team) c = 1;            // a docked siege tower carries this side over
    else if (s.kind === 'gate') c = s.team === team ? 1 : 25;
    else if (s.kind === 'obstacle') c = 4;
    else c = s.team === team ? BLOCK : 40;
    stampSegment(cost, i0, j0, cs, s, c, s.kind === 'tower' ? s.size / 2 : (s.thick || 0.6) / 2 + 0.7);
    // the drawbridge: your own gate carries your men over a moat in front of and behind it
    if (s.kind === 'gate' && s.team === team) stampBridge(nav, cost, i0, j0, cs, s);
  }
  T.over.set(key, cost);
  T.arr[key] = cost;
}

function stampBridge(nav, cost, i0, j0, cs, s) {
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L = Math.hypot(dx, dz) || 1;
  const ux = dx / L, uz = dz / L, mx = (s.a[0] + s.b[0]) / 2, mz = (s.a[1] + s.b[1]) / 2, R = 12;
  for (let j = Math.max(j0, Math.floor((mz - R - L) / cs)); j <= Math.min(j0 + TS - 1, Math.floor((mz + R + L) / cs)); j++)
    for (let i = Math.max(i0, Math.floor((mx - R - L) / cs)); i <= Math.min(i0 + TS - 1, Math.floor((mx + R + L) / cs)); i++) {
      if (i >= nav.W || j >= nav.W || !nav.moat[j * nav.W + i]) continue;
      const x = (i + 0.5) * cs - mx, z = (j + 0.5) * cs - mz;
      const along = x * ux + z * uz, across = -x * uz + z * ux;
      if (Math.abs(along) <= L / 2 + 0.5 && Math.abs(across) <= R) cost[(j - j0) * TS + (i - i0)] = 1;
    }
}
function stampSegment(cost, i0, j0, cs, s, c, rad) {
  const x0 = Math.min(s.a[0], s.b[0]) - rad, x1 = Math.max(s.a[0], s.b[0]) + rad;
  const z0 = Math.min(s.a[1], s.b[1]) - rad, z1 = Math.max(s.a[1], s.b[1]) + rad;
  const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1], L2 = dx * dx + dz * dz || 1e-6;
  for (let j = Math.max(j0, Math.floor(z0 / cs)); j <= Math.min(j0 + TS - 1, Math.floor(z1 / cs)); j++)
    for (let i = Math.max(i0, Math.floor(x0 / cs)); i <= Math.min(i0 + TS - 1, Math.floor(x1 / cs)); i++) {
      const x = (i + 0.5) * cs, z = (j + 0.5) * cs;
      let t = ((x - s.a[0]) * dx + (z - s.a[1]) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
      const d = Math.hypot(x - s.a[0] - dx * t, z - s.a[1] - dz * t);
      if (d <= rad) {
        const k = (j - j0) * TS + (i - i0);
        if (c === 1 && cost[k] >= 25 && cost[k] < BLOCK) cost[k] = 1;
        else if (c === 1) cost[k] = Math.min(cost[k], 1);
        else cost[k] = Math.max(cost[k], c);
      }
    }
}

// ------------------------------------------------------------------ keeping it current
function navSync(world) {
  let nav = world._navW;
  const hf = world.terrain;
  if (!nav || nav.size !== hf.size || nav.terrainRef !== hf) { nav = buildBase(world); nav.size = hf.size; nav.terrainRef = hf; nav.sv = -1; }
  // dug ground: re-read the base cells under the new trench lines (or everything after an undo)
  if (hf.version !== nav.tv) {
    const lines = hf.trenchLines || [];
    const boxes = [];
    if (lines.length > nav.lines) {
      for (let k = nav.lines; k < lines.length; k++) {
        let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
        for (const p of lines[k].pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
        // refresh whole 64 m detail tiles: a cell under a detail tile always reads the tile, so the
        // base is the same whether it was built before or after the dig (save / restore safe)
        boxes.push({ x0: Math.floor((x0 - 6) / 64) * 64, z0: Math.floor((z0 - 6) / 64) * 64, x1: Math.ceil((x1 + 6) / 64) * 64, z1: Math.ceil((z1 + 6) / 64) * 64 });
      }
    } else if (hf.size <= 300) boxes.push({ x0: 0, z0: 0, x1: hf.size, z1: hf.size });
    else if (lines.length < nav.lines || lines.length === nav.lines) {
      // an undo restored some ground: refresh around every detail tile that exists
      if (hf.tiles) for (const t of hf.tiles.values()) boxes.push({ x0: t.ox - 2, z0: t.oz - 2, x1: t.ox + 66, z1: t.oz + 66 });
      if (nav.lastDug) boxes.push(...nav.lastDug);
    }
    nav.lines = lines.length; nav.tv = hf.version;
    nav.lastDug = (nav.lastDug || []).concat(boxes).slice(-64);
    const cs = nav.cs;
    for (const b of boxes) {
      const i0 = Math.floor(b.x0 / cs), j0 = Math.floor(b.z0 / cs), i1 = Math.ceil(b.x1 / cs), j1 = Math.ceil(b.z1 / cs);
      fillBase(world, nav, i0, j0, i1, j1);
      for (const o of world.obstacles) if (o.x > b.x0 - 4 && o.x < b.x1 + 4 && o.z > b.z0 - 4 && o.z < b.z1 + 4) stampObstacle(nav, o);
      buildMid(nav, Math.floor(i0 / 2), Math.floor(j0 / 2), Math.ceil(i1 / 2), Math.ceil(j1 / 2));
      for (const T of Object.values(nav.teams)) for (const k of tilesOf(nav, b)) buildOverlay(world, nav, T, k);
    }
  }
  // structures: diff the alive set, refresh only the tiles they cover
  if (world.structVersion !== nav.sv) {
    nav.sv = world.structVersion;
    const now = new Map();
    const keys = new Set();
    // new pieces, pieces that changed hands (a captured castle), and fallen or removed pieces
    for (const s of structList(world)) {
      const was = nav.structIds.get(s.id);
      const box = was && was.team === s.team ? was.box : structBox(s);
      now.set(s.id, { team: s.team, box });
      if (!was || was.team !== s.team) for (const k of tilesOf(nav, box)) keys.add(k);
    }
    for (const [id, was] of nav.structIds) if (!now.has(id)) for (const k of tilesOf(nav, was.box)) keys.add(k);
    nav.structIds = now;
    if (keys.size) for (const T of Object.values(nav.teams)) for (const k of keys) buildOverlay(world, nav, T, k);
  }
  return nav;
}

// ------------------------------------------------------------------ queries
export function navFor(world, team) {
  const nav = navSync(world);
  return { nav, T: teamNav(world, nav, team) };
}

function fineCost(nav, T, i, j) {
  const W = nav.W;
  if (i < 0 || j < 0 || i >= W || j >= W) return BLOCK;
  const o = T.arr[(j >> 5) * nav.NT + (i >> 5)];
  if (o) return o[((j & 31) << 5) | (i & 31)];
  const v = nav.base[j * W + i];
  return v ? v * 0.03125 : BLOCK;
}
// a closure over the arrays (the A* inner loop calls it ~8 times per node)
function fineCostFn(nav, T) {
  const W = nav.W, NT = nav.NT, arr = T.arr, base = nav.base;
  return (i, j) => {
    if (i < 0 || j < 0 || i >= W || j >= W) return BLOCK;
    const o = arr[(j >> 5) * NT + (i >> 5)];
    if (o) return o[((j & 31) << 5) | (i & 31)];
    const v = base[j * W + i];
    return v ? v * 0.03125 : BLOCK;
  };
}

export function walkable(world, team, x, z) {
  const { nav, T } = navFor(world, team);
  return fineCost(nav, T, Math.floor(x / nav.cs), Math.floor(z / nav.cs)) < BLOCK;
}

// binary heap over typed arrays (no allocation per push or pop)
function makeHeap() {
  let k = new Int32Array(4096), f = new Float64Array(4096), n = 0;
  return {
    clear() { n = 0; },
    push(key, val) {
      if (n >= k.length) { const k2 = new Int32Array(k.length * 2), f2 = new Float64Array(k.length * 2); k2.set(k); f2.set(f); k = k2; f = f2; }
      let i = n++;
      while (i > 0) { const p = (i - 1) >> 1; if (f[p] <= val) break; k[i] = k[p]; f[i] = f[p]; i = p; }
      k[i] = key; f[i] = val;
    },
    pop() {
      const top = k[0];
      n--;
      if (n > 0) {
        const lk = k[n], lf = f[n];
        let i = 0;
        for (;;) {
          const l = 2 * i + 1; if (l >= n) break;
          const r = l + 1; const m = r < n && f[r] < f[l] ? r : l;
          if (f[m] >= lf) break;
          k[i] = k[m]; f[i] = f[m]; i = m;
        }
        k[i] = lk; f[i] = lf;
      }
      return top;
    },
    get size() { return n; },
  };
}
const HEAP = makeHeap();
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.4142], [1, -1, 1.4142], [-1, 1, 1.4142], [-1, -1, 1.4142]];

// generic grid A*: costAt(i, j) over a window [i0..i1] x [j0..j1]; returns cell list or null
let SCR = null;
function gridAStar(costAt, i0, j0, i1, j1, si, sj, gi, gj, maxIter, weight) {
  const ww = i1 - i0 + 1, wh = j1 - j0 + 1, N = ww * wh;
  if (!SCR || SCR.g.length < N) SCR = { g: new Float32Array(N), came: new Int32Array(N), stamp: new Uint32Array(N), closed: new Uint32Array(N), run: 0 };
  const { g, came, stamp, closed } = SCR;
  const run = ++SCR.run;
  const H = HEAP; H.clear();
  const L = (i, j) => (j - j0) * ww + (i - i0);
  const hfn = (i, j) => { const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz + (1.4142 - 2) * Math.min(dx, dz)) * weight; };
  const s = L(si, sj), goal = L(gi, gj);
  stamp[s] = run; g[s] = 0; came[s] = -1;
  H.push(s, hfn(si, sj));
  let found = false, it = 0;
  while (H.size && it++ < maxIter) {
    const k = H.pop();
    if (closed[k] === run) continue;
    closed[k] = run;
    if (k === goal) { found = true; break; }
    const ki = (k % ww) + i0, kj = ((k / ww) | 0) + j0;
    const ck = costAt(ki, kj);
    for (let d = 0; d < 8; d++) {
      const D = DIRS[d];
      const ni = ki + D[0], nj = kj + D[1];
      if (ni < i0 || nj < j0 || ni > i1 || nj > j1) continue;
      const c = costAt(ni, nj);
      if (c >= BLOCK) continue;
      if (D[2] > 1 && (costAt(ni, kj) >= BLOCK || costAt(ki, nj) >= BLOCK)) continue;   // no corner cutting
      const nk = (nj - j0) * ww + (ni - i0);
      const ng = g[k] + D[2] * (c + (ck >= BLOCK ? c : ck)) * 0.5;
      if (stamp[nk] !== run || ng < g[nk]) {
        stamp[nk] = run; g[nk] = ng; came[nk] = k;
        H.push(nk, ng + hfn(ni, nj));
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let k = goal; k !== -1; k = came[k]) cells.push([(k % ww) + i0, ((k / ww) | 0) + j0, g[k]]);
  cells.reverse();
  return cells;
}

function nearestOpen(costAt, ti, tj, W, rmax = 20) {
  if (costAt(ti, tj) < BLOCK) return [ti, tj];
  for (let r = 1; r < rmax; r++)
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      const i = ti + di, j = tj + dj;
      if (i < 0 || j < 0 || i >= W || j >= W) continue;
      if (costAt(i, j) < BLOCK) return [i, j];
    }
  return null;
}

// does a straight walk p -> q cost no more than budget (and never cross a blocked cell)?
function lineCost(costAt, cs, p, q, budget, hardMax = 20) {
  const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
  const n = Math.max(1, Math.ceil(L / (cs * 0.5)));
  let sum = 0;
  for (let s = 0; s <= n; s++) {
    const x = p[0] + (q[0] - p[0]) * (s / n), z = p[1] + (q[1] - p[1]) * (s / n);
    const c = costAt(Math.floor(x / cs), Math.floor(z / cs));
    if (c >= BLOCK || c >= hardMax) return false;
    sum += c * (L / n);
  }
  return sum <= budget;
}

// string-pulling with a bounded look-ahead: O(n) instead of O(n^2) on long paths
function smooth(cells, cs, costAt, slack = 1.08) {
  const pts = cells.map((c) => [(c[0] + 0.5) * cs, (c[1] + 0.5) * cs]);
  const out = [];
  let a = 0;
  const last = pts.length - 1;
  while (a < last) {
    let good = a + 1;
    const lim = Math.min(last, a + 72);
    for (let b = a + 2; b <= lim; b++) {
      if (lineCost(costAt, cs, pts[a], pts[b], (cells[b][2] - cells[a][2]) * cs * slack + 2 * cs, 1e8)) good = b;
      else if (b - good > 8) break;
    }
    out.push(pts[good]);
    a = good;
  }
  return out;
}

// fine A* in a window around from/to; returns smoothed points or null
function finePath(nav, T, from, to, margin, maxIter) {
  const { cs, W } = nav;
  const costAt = fineCostFn(nav, T);
  const si = clampI(from[0] / cs, W), sj = clampI(from[1] / cs, W);
  let ti = clampI(to[0] / cs, W), tj = clampI(to[1] / cs, W);
  const g = nearestOpen(costAt, ti, tj, W);
  if (!g) return null;
  [ti, tj] = g;
  if (si === ti && sj === tj) return [[to[0], to[1]]];
  const m = Math.ceil(margin / cs);
  let i0 = Math.min(si, ti) - m, i1 = Math.max(si, ti) + m, j0 = Math.min(sj, tj) - m, j1 = Math.max(sj, tj) + m;
  // keep the window bounded
  if (i1 - i0 > MAXWIN) { i0 = Math.min(si, ti) - 6; i1 = Math.max(si, ti) + 6; }
  if (j1 - j0 > MAXWIN) { j0 = Math.min(sj, tj) - 6; j1 = Math.max(sj, tj) + 6; }
  i0 = Math.max(0, i0); j0 = Math.max(0, j0); i1 = Math.min(W - 1, i1); j1 = Math.min(W - 1, j1);
  const cells = gridAStar(costAt, i0, j0, i1, j1, si, sj, ti, tj, maxIter, 1.0);
  if (!cells) return null;
  const out = smooth(cells, cs, costAt);
  if (out.length) out[out.length - 1] = costAt(clampI(to[0] / cs, W), clampI(to[1] / cs, W)) < BLOCK ? [to[0], to[1]] : out[out.length - 1];
  return out;
}
const clampI = (v, W) => Math.max(0, Math.min(W - 1, Math.floor(v)));

// mid-grid A* for long marches (terrain only), smoothed on the mid grid
function midPath(nav, from, to) {
  const MW = nav.MW, mcs = nav.cs * 2, mid = nav.mid;
  const costAt = (i, j) => (i < 0 || j < 0 || i >= MW || j >= MW ? BLOCK : mid[j * MW + i]);
  const si = clampI(from[0] / mcs, MW), sj = clampI(from[1] / mcs, MW);
  const g = nearestOpen(costAt, clampI(to[0] / mcs, MW), clampI(to[1] / mcs, MW), MW, 30);
  if (!g) return null;
  const cells = gridAStar(costAt, 0, 0, MW - 1, MW - 1, si, sj, g[0], g[1], 160000, 1.4);
  if (!cells) return null;
  return smooth(cells, mcs, costAt, 1.12);
}

export function findPath(world, team, from, to) {
  const t0 = Date.now();
  const r = findPathInner(world, team, from, to);
  const dtp = Date.now() - t0;
  world._navMs = (world._navMs || 0) + dtp; world._navN = (world._navN || 0) + 1; world._navMax = Math.max(world._navMax || 0, dtp);
  return r;
}

function findPathInner(world, team, from, to) {
  const { nav, T } = navFor(world, team);
  const d = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (d < 1) return [[to[0], to[1]]];
  // a goal that just failed to resolve is not searched again for a few seconds
  const fk = team * 1e7 + clampI(to[1] / 8, 1e6) * 1000 + clampI(to[0] / 8, 1000);
  const fail = (nav.fail || (nav.fail = new Map())).get(fk);
  if (fail !== undefined && world.t - fail < 6) return [[to[0], to[1]]];
  const r = findPathCore(world, nav, T, from, to, d);
  if (r && !r.length) return [[to[0], to[1]]];
  if (!r) { if (nav.fail.size > 4000) nav.fail.clear(); nav.fail.set(fk, world.t); return [[to[0], to[1]]]; }
  return r;
}
function findPathCore(world, nav, T, from, to, d) {
  if (d < FINE_DIRECT) {
    const p = finePath(nav, T, from, to, 60, 90000);
    if (p) return p;
  }
  // long march: terrain-only mid path, then fine-refine the legs that hit walls or trenches
  const mp = midPath(nav, from, to);
  if (!mp) return d < 400 ? finePath(nav, T, from, to, 80, 60000) : null;
  const costAt = fineCostFn(nav, T);
  const out = [];
  let wide = false;
  let prev = [from[0], from[1]];
  const raw = mp.slice();
  raw[raw.length - 1] = [to[0], to[1]];
  // long legs are cut into ~100 m pieces so a blocked piece is re-planned in a small window
  const pts = [];
  let pp = [from[0], from[1]];
  for (const q of raw) {
    const L = Math.hypot(q[0] - pp[0], q[1] - pp[1]), k = Math.ceil(L / 100);
    for (let s = 1; s <= k; s++) pts.push([pp[0] + (q[0] - pp[0]) * s / k, pp[1] + (q[1] - pp[1]) * s / k]);
    pp = q;
  }
  for (let k = 0; k < pts.length; k++) {
    const q = pts[k];
    const L = Math.hypot(q[0] - prev[0], q[1] - prev[1]);
    if (L < 0.5) continue;
    if (!lineCost(costAt, nav.cs, prev, q, L * 4 + 8, 24)) {
      const sub = finePath(nav, T, prev, q, 70, 70000);
      if (sub) { out.push(...sub); prev = sub[sub.length - 1]; continue; }
      // a leg that cannot be refined (a wall with its gate out of the window): one wider search for
      // the whole trip before walking into the wall
      if (!wide && d < 1000) { wide = true; const all = finePath(nav, T, from, to, 120, 220000); if (all) return all; }
    }
    out.push(q); prev = q;
  }
  return out.length ? out : [[to[0], to[1]]];
}

// is a straight walk from a to b open ground for this team (no wall, no deep water, no trench)?
export function straightClear(world, team, a, b) {
  const { nav, T } = navFor(world, team);
  const costAt = fineCostFn(nav, T);
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return lineCost(costAt, nav.cs, a, b, L * 2.2 + 4, 2.6);
}

// debug / tests
export function navStats(world) {
  const nav = world._navW; if (!nav) return null;
  const teams = {}; for (const k in nav.teams) teams[k] = nav.teams[k].over.size;
  return { W: nav.W, MW: nav.MW, overlays: teams };
}
