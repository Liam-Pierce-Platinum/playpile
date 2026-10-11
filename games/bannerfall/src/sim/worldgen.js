// BANNERFALL :: sim/worldgen.js - a whole war map from a seed (DESIGN.md 3.5).
// Deterministic from (seed, size, biome, faction slots). Pure JS: runs in node for the tests
// and in the browser (main thread; it is fast enough: Large in about 2-3 s).
// Steps: land (macro noise on an 8 m grid + 2 m detail), the mountain ring, rivers carved
// into their own valleys, ridges and mesas, settlements (capitals, castles, strongholds,
// villages), roads linking them with bridges and fords, regions with waystones, forests and
// trees, and the dressing props.
import { WorldTerrain, MAT } from './terrain.js';
import { mulberry32, noise2 } from './rng.js';
import { BIOMES, SIZES } from '../data/biomes.js';
import { NEUTRAL } from '../data/factions.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function fbm(x, z, seed, oct) {
  let s = 0, a = 0.5, f = 1, nn = 0;
  for (let i = 0; i < oct; i++) { s += a * noise2(x * f, z * f, seed + i * 17); nn += a; a *= 0.5; f *= 2.03; }
  return s / nn;
}
function ridged(x, z, seed, oct) {
  let s = 0, a = 0.5, f = 1, nn = 0;
  for (let i = 0; i < oct; i++) { const v = 1 - Math.abs(2 * noise2(x * f, z * f, seed + i * 31) - 1); s += a * v * v; nn += a; a *= 0.5; f *= 2.1; }
  return s / nn;
}
function segDist(x, z, ax, az, bx, bz) {
  const dx = bx - ax, dz = bz - az, L2 = dx * dx + dz * dz || 1e-9;
  let t = ((x - ax) * dx + (z - az) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - ax - dx * t, z - az - dz * t);
}

const SYL1 = ['Ash', 'Brack', 'Elm', 'Fen', 'Gold', 'Hollow', 'Iron', 'Kings', 'Lark', 'Mill', 'Oak', 'Raven', 'Salt', 'Thorn', 'Wold', 'Wych', 'Bright', 'Cold', 'Dun', 'Grey', 'Hart', 'Long', 'Marl', 'Red', 'Stan', 'Tarn', 'Wester', 'Ald', 'Bram', 'Cran', 'Hay', 'Kestrel', 'Lin', 'Pen', 'Rye', 'Sedge', 'Til', 'Wick'];
const SYL2 = ['ford', 'ley', 'wick', 'by', 'ton', 'stead', 'mere', 'brook', 'hold', 'combe', 'den', 'field', 'gate', 'ham', 'holm', 'thorpe', 'wood', 'well', 'bury', 'cross', 'march', 'moor', 'side', 'water'];
function namer(rng) {
  const used = new Set();
  return () => {
    for (let k = 0; k < 40; k++) { const s = rng.pick(SYL1) + rng.pick(SYL2); if (!used.has(s)) { used.add(s); return s; } }
    return 'Hamlet ' + used.size;
  };
}

export function generateWorld(o = {}) {
  const t0 = Date.now();
  const sizeKey = SIZES[o.size] ? o.size : 'medium';
  const SZ = SIZES[sizeKey];
  const size = SZ.m;
  const biomeKey = BIOMES[o.biome] ? o.biome : 'spring';
  const B = BIOMES[biomeKey];
  const seed = (o.seed >>> 0) || 1;
  const rng = mulberry32(seed * 9973 + 17);
  const slots = o.slots || [0, 1];                 // faction slot ids, 0 = the player
  const progress = o.progress || (() => {});
  const T = new WorldTerrain(size, 2);
  const CF = T.coarse, n = CF.n, res = CF.res;
  const H = CF.h, MATS = CF.mat;
  const ringW = sizeKey === 'field' ? 120 : 250;
  const play0 = ringW + 40, play1 = size - ringW - 40;

  // ------------------------------------------------------------------ 1. macro land (8 m)
  progress('Raising the land', 0.05);
  const MC = 8, M = Math.round(size / MC) + 1;
  const macro = new Float32Array(M * M), ringK = new Float32Array(M * M);
  const hs = B.hillScale;
  for (let j = 0; j < M; j++) for (let i = 0; i < M; i++) {
    const x = i * MC, z = j * MC;
    // domain warp for organic shapes
    const wx = x + (fbm(x / 900, z / 900, seed + 3, 3) - 0.5) * 380, wz = z + (fbm(x / 900 + 7, z / 900, seed + 4, 3) - 0.5) * 380;
    let h = 7 + (fbm(wx / (hs * 2.2), wz / (hs * 2.2), seed + 1, 4) - 0.5) * B.hill * 2.4 + (fbm(wx / hs, wz / hs, seed + 2, 4) - 0.5) * B.hill * 1.2;
    h += (ridged(wx / 260, wz / 260, seed + 5, 3) - 0.35) * B.hill * 0.25;
    // the edge ring: mountains (or highland crags) that frame the map
    const de = Math.min(x, z, size - x, size - z);
    const rk = 1 - smooth((de - 20) / ringW);
    ringK[j * M + i] = rk;
    if (rk > 0) h += Math.pow(rk, 1.5) * (30 + 55 * ridged(x / 210, z / 210, seed + 9, 4)) + rk * 6;
    macro[j * M + i] = h;
  }
  const macroAt = (x, z, A) => {
    const fx = clamp(x / MC, 0, M - 1.001), fz = clamp(z / MC, 0, M - 1.001);
    const i = fx | 0, j = fz | 0, tx = fx - i, tz = fz - j, k = j * M + i;
    return (A[k] + (A[k + 1] - A[k]) * tx) * (1 - tz) + (A[k + M] + (A[k + M + 1] - A[k + M]) * tx) * tz;
  };

  // ------------------------------------------------------------------ 2. rivers
  progress('Cutting the rivers', 0.15);
  const rivers = [];
  const nRiv = sizeKey === 'field' ? 1 : B.rivers;
  const axis = rng() < 0.5 ? 0 : 1;
  for (let r = 0; r < nRiv; r++) {
    const pts = [];
    const half = r === 0 ? 9 + rng() * 6 : 6 + rng() * 3;
    if (r === 0) {
      const a0 = size * (0.35 + rng() * 0.3), a1 = size * (0.35 + rng() * 0.3);
      const A1 = size * (0.05 + rng() * 0.05), f1 = 1 + rng() * 1.2, p1 = rng() * 6.28;
      const A2 = size * (0.012 + rng() * 0.012), f2 = 4 + rng() * 3, p2 = rng() * 6.28;
      const N = Math.ceil((size + 400) / 28);
      for (let k = 0; k <= N; k++) {
        const t = k / N, u = -200 + (size + 400) * t;
        let v = a0 + (a1 - a0) * t + Math.sin(t * f1 * 6.283 + p1) * A1 + Math.sin(t * f2 * 6.283 + p2) * A2 + (fbm(t * 9, r, seed + 77, 2) - 0.5) * size * 0.02;
        v = clamp(v, size * 0.2, size * 0.8);
        pts.push(axis ? [v, u] : [u, v]);
      }
    } else {
      // a tributary from the far side that joins the main river
      const main = rivers[0].pts;
      const join = main[Math.floor(main.length * (0.3 + rng() * 0.4))];
      const side = rng() < 0.5 ? -200 : size + 200;
      const s0 = axis ? [side, size * (0.2 + rng() * 0.6)] : [size * (0.2 + rng() * 0.6), side];
      const N = Math.ceil(Math.hypot(join[0] - s0[0], join[1] - s0[1]) / 28);
      const A = 60 + rng() * 90, f = 1.5 + rng() * 1.5, p = rng() * 6.28;
      const dx = join[0] - s0[0], dz = join[1] - s0[1], L = Math.hypot(dx, dz);
      for (let k = 0; k <= N; k++) {
        const t = k / N, w = Math.sin(t * f * 6.283 + p) * A * Math.sin(t * Math.PI);
        pts.push([s0[0] + dx * t - (dz / L) * w, s0[1] + dz * t + (dx / L) * w]);
      }
    }
    rivers.push({ pts, half, depth: 2.3 });
  }
  // macro distance to the nearest river (for valleys)
  const dRivM = new Float32Array(M * M).fill(1e6), hRivM = new Float32Array(M * M).fill(10);
  const VAL = B.valley;
  for (const R of rivers) {
    for (let k = 0; k < R.pts.length - 1; k++) {
      const a = R.pts[k], b = R.pts[k + 1];
      const pad = VAL + R.half + 40;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - pad) / MC)), i1 = Math.min(M - 1, Math.ceil((Math.max(a[0], b[0]) + pad) / MC));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - pad) / MC)), j1 = Math.min(M - 1, Math.ceil((Math.max(a[1], b[1]) + pad) / MC));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = segDist(i * MC, j * MC, a[0], a[1], b[0], b[1]) - R.half;
        const q = j * M + i;
        if (d < dRivM[q]) { dRivM[q] = d; hRivM[q] = R.half; }
      }
    }
  }
  // fords: a few shallow crossings per river, spread along it, away from the map edge
  const fords = [];
  for (const R of rivers) {
    const inner = R.pts.filter((p) => p[0] > play0 + 60 && p[0] < play1 - 60 && p[1] > play0 + 60 && p[1] < play1 - 60);
    const nF = sizeKey === 'field' ? 2 : sizeKey === 'small' ? 2 : sizeKey === 'medium' ? 3 : 4;
    for (let f = 0; f < nF && inner.length > 4; f++) {
      const p = inner[Math.floor(((f + 0.5 + (rng() - 0.5) * 0.4) / nF) * inner.length)];
      fords.push([p[0], p[1], R.half + 14]);
    }
  }

  // ------------------------------------------------------------------ 3. ridges, mesas, pools
  const ridges = [];
  const nRidge = sizeKey === 'field' ? Math.min(1, B.ridges) : Math.round(B.ridges * size / 3072);
  for (let r = 0; r < nRidge; r++) {
    const cx = play0 + rng() * (play1 - play0), cz = play0 + rng() * (play1 - play0);
    const a = rng() * Math.PI, L = 260 + rng() * 420;
    const dx = Math.cos(a) * L / 2, dz = Math.sin(a) * L / 2;
    // a ridge with a gap (a pass) somewhere along it
    const g = 0.3 + rng() * 0.4, gw = 50 / L;
    ridges.push([cx - dx, cz - dz, cx - dx + dx * 2 * (g - gw), cz - dz + dz * 2 * (g - gw), 14 + rng() * 12, 22 + rng() * 10]);
    ridges.push([cx - dx + dx * 2 * (g + gw), cz - dz + dz * 2 * (g + gw), cx + dx, cz + dz, 14 + rng() * 12, 22 + rng() * 10]);
  }
  const mesas = [];
  const nMesa = sizeKey === 'field' ? Math.min(1, B.mesas) : Math.round(B.mesas * size / 3072);
  for (let m = 0; m < nMesa; m++) mesas.push({ cx: play0 + rng() * (play1 - play0), cz: play0 + rng() * (play1 - play0), r: 60 + rng() * 60, hh: 9 + rng() * 9, ramp: rng() * 6.28 });
  const pools = [];
  for (let p = 0; p < Math.round(B.pools * size / 3072); p++) pools.push([play0 + rng() * (play1 - play0), play0 + rng() * (play1 - play0), 25 + rng() * 55]);

  // ------------------------------------------------------------------ 4. heights at 2 m
  progress('Shaping hills and valleys', 0.25);
  const dRivF = new Float32Array(n * n).fill(1e6), halfF = new Float32Array(n * n);
  for (const R of rivers) {
    for (let k = 0; k < R.pts.length - 1; k++) {
      const a = R.pts[k], b = R.pts[k + 1], pad = R.half + 16;
      const i0 = Math.max(0, Math.floor((Math.min(a[0], b[0]) - pad) / res)), i1 = Math.min(n - 1, Math.ceil((Math.max(a[0], b[0]) + pad) / res));
      const j0 = Math.max(0, Math.floor((Math.min(a[1], b[1]) - pad) / res)), j1 = Math.min(n - 1, Math.ceil((Math.max(a[1], b[1]) + pad) / res));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const d = segDist(i * res, j * res, a[0], a[1], b[0], b[1]);
        const q = j * n + i;
        if (d - R.half < dRivF[q] - halfF[q] || dRivF[q] === 1e6) { dRivF[q] = d; halfF[q] = R.half; }
      }
    }
  }
  for (let j = 0; j < n; j++) {
    const z = j * res;
    for (let i = 0; i < n; i++) {
      const x = i * res, q = j * n + i;
      let h = macroAt(x, z, macro) + (noise2(x / 23, z / 23, seed + 41) - 0.5) * 1.1 + (noise2(x / 7.5, z / 7.5, seed + 42) - 0.5) * 0.3;
      let mat = MAT.GRASS;
      const rk = macroAt(x, z, ringK);
      // ridges: steep rock walls
      for (const [x0, z0, x1, z1, hh, w] of ridges) {
        const d = segDist(x, z, x0, z0, x1, z1);
        if (d < w) { const k = smooth((w - d) / (w * 0.4)); h += hh * k * (0.75 + 0.5 * noise2(x / 13, z / 13, seed + 51)); if (k > 0.25) mat = MAT.ROCK; }
      }
      // mesas: flat tops with one ramp up
      for (const Ms of mesas) {
        const dx = x - Ms.cx, dz = z - Ms.cz, d = Math.hypot(dx, dz) / Ms.r;
        if (d < 1.5) {
          const ang = Math.atan2(dz, dx), ra = Math.cos(ang - Ms.ramp);
          const edge = ra > 0.8 ? 1.5 : 1.08;           // the ramp side slopes away gently
          const f = 1 - smooth((d - 0.92) / (edge - 0.92));
          h += Ms.hh * f;
          if (f > 0.15 && f < 0.85 && ra <= 0.8) mat = MAT.ROCK;
        }
      }
      // river valleys: the land sinks to the water meadows
      const dv = macroAt(x, z, dRivM);
      if (dv < VAL + 10) {
        const k = smooth(Math.max(0, dv) / VAL);
        const bank = 0.95 + Math.max(0, dv) * 0.006;
        h = bank + (h - bank) * k * k;
      }
      // the channel itself
      const dfull = dRivF[q];
      if (dfull < 1e5) {
        const half = halfF[q];
        let depth = 2.3;
        for (const [fx, fz, fr] of fords) { const fd = Math.hypot(x - fx, z - fz) / fr; if (fd < 1.4) depth = Math.min(depth, 0.42 + (2.3 - 0.42) * smooth((fd - 0.55) / 0.85)); }
        const bed = -depth + (noise2(x / 9, z / 9, seed + 3) - 0.5) * 0.35;
        if (dfull < half) { const u = dfull / half; h = bed + (0.35 - bed) * smooth((u - 0.3) / 0.7); mat = depth < 1 ? MAT.SAND : MAT.BED; }
        else if (dfull < half + 12) { const u = (dfull - half) / 12; h = 0.35 + (h - 0.35) * smooth(u); if (u < 0.35) mat = MAT.SAND; }
      }
      // marsh pools (wadeable)
      for (const [px, pz, pr] of pools) {
        const d = Math.hypot(x - px, z - pz) / (pr * (0.8 + 0.4 * noise2(x / 21, z / 21, seed + 17)));
        if (d < 1.4) {
          if (d < 1) { h = Math.min(h, -0.6 * (1 - d * d) + 0.2); if (h < 0.1) mat = MAT.BED; }
          else h = h + (Math.min(h, 0.5) - h) * smooth((1.4 - d) / 0.4);
        }
      }
      if (rk > 0.42) mat = MAT.ROCK;
      H[q] = h; MATS[q] = mat;
    }
  }
  // slope pass: steep ground is rock
  for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) {
    const q = j * n + i;
    const sx = (H[q + 1] - H[q - 1]) / (2 * res), sz = (H[q + n] - H[q - n]) / (2 * res);
    const sl = Math.hypot(sx, sz);
    if (sl > 0.85 && MATS[q] === MAT.GRASS) MATS[q] = MAT.ROCK;
  }
  if (B.mud) {
    for (let q = 0; q < n * n; q++) {
      if (MATS[q] !== MAT.GRASS) continue;
      const x = (q % n) * res, z = Math.floor(q / n) * res;
      if (fbm(x / 60, z / 60, seed + 61, 3) > 1 - B.mud * 0.55 && H[q] < 6) MATS[q] = MAT.MUD;
    }
  }
  if (B.snow) for (let q = 0; q < n * n; q++) if (MATS[q] === MAT.GRASS) MATS[q] = MAT.SNOW;

  // ------------------------------------------------------------------ 5. settlements
  progress('Founding the kingdoms', 0.45);
  const hAt = (x, z) => CF.height(x, z);
  const riverD = (x, z) => { const i = clamp(Math.round(x / res), 0, n - 1), j = clamp(Math.round(z / res), 0, n - 1), q = j * n + i; return dRivF[q] < 1e5 ? dRivF[q] - halfF[q] : macroAt(x, z, dRivM); };
  const siteScore = (x, z, R) => {
    if (x < play0 + R || z < play0 + R || x > play1 - R || z > play1 - R) return -1e9;
    const hc = hAt(x, z);
    if (hc < 1.2) return -1e9;
    let dev = 0;
    for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; for (const rr of [R * 0.5, R]) dev = Math.max(dev, Math.abs(hAt(x + Math.cos(a) * rr, z + Math.sin(a) * rr) - hc)); }
    const rd = riverD(x, z);
    if (rd < R + 25) return -1e9;
    for (const [x0, z0, x1, z1, , w] of ridges) if (segDist(x, z, x0, z0, x1, z1) < w + R + 10) return -1e9;
    for (const Ms of mesas) { const d = Math.hypot(x - Ms.cx, z - Ms.cz); if (d > Ms.r * 0.75 && d < Ms.r * 1.6 + R) return -1e9; }
    for (const [px, pz, pr] of pools) if (Math.hypot(x - px, z - pz) < pr * 1.5 + R) return -1e9;
    return -dev * 3 + Math.min(rd, 400) * 0.004;
  };
  const best = (cx, cz, rad, R, step, extra) => {
    let bs = -1e9, bp = null;
    for (let dz = -rad; dz <= rad; dz += step) for (let dx = -rad; dx <= rad; dx += step) {
      if (dx * dx + dz * dz > rad * rad) continue;
      const x = cx + dx, z = cz + dz;
      let s = siteScore(x, z, R);
      if (s < -1e8) continue;
      if (extra) s += extra(x, z);
      if (s > bs) { bs = s; bp = [x, z]; }
    }
    return bp;
  };
  const name = namer(rng);
  const settlements = [];
  const nearSettle = (x, z, d) => settlements.some((s) => Math.hypot(s.pos[0] - x, s.pos[1] - z) < d + s.r);
  // capitals: far corners and edges
  const ANCH = {
    2: [[0.2, 0.2], [0.8, 0.8]], 3: [[0.2, 0.22], [0.8, 0.3], [0.45, 0.8]],
    4: [[0.2, 0.2], [0.8, 0.8], [0.8, 0.2], [0.2, 0.8]], 5: [[0.2, 0.2], [0.8, 0.8], [0.8, 0.2], [0.2, 0.8], [0.5, 0.5]],
  };
  const NS = slots.length;
  let anchors = (ANCH[NS] || ANCH[2]).map((a) => a.slice());
  // rotate the layout randomly so the player is not always in the same corner
  const rot = Math.floor(rng() * 4);
  anchors = anchors.map(([u, v]) => { let a = u, b = v; for (let r = 0; r < rot; r++) [a, b] = [1 - b, a]; return [a, b]; });
  const capR = sizeKey === 'field' ? 44 : 54;
  const capitals = [];
  slots.forEach((slot, k) => {
    const [u, v] = anchors[k % anchors.length];
    const span = play1 - play0;
    const cx = play0 + span * (0.08 + u * 0.84), cz = play0 + span * (0.08 + v * 0.84);
    const p = best(cx, cz, sizeKey === 'field' ? 120 : 320, capR, 24) || [cx, cz];
    const s = { id: 'c' + k, kind: 'capital', pos: p, r: capR, faction: slot, name: name(), tier: 3 };
    settlements.push(s); capitals.push(s);
  });
  const mid = [size / 2, size / 2];
  for (const c of capitals) c.gateDir = Math.atan2(mid[0] - c.pos[0], mid[1] - c.pos[1]);
  // the MAIN ENEMY (LIAM_BRIEF item 6) is listed first: it gets the first castle and the first two
  // forts, so every war has one clear kingdom with a capital, a castle and forts to go for
  const main = o.main !== undefined && slots.includes(o.main) && o.main !== 0 ? o.main : slots.find((s) => s !== 0);
  const rivals = [main, ...slots.filter((s) => s !== 0 && s !== main)].filter((s) => s !== undefined);
  const capOf = (slot) => capitals.find((c) => c.faction === slot);
  const nCastles = o.castles !== undefined ? o.castles : SZ.castles, nForts = o.strongholds !== undefined ? o.strongholds : SZ.strongholds;
  // secondary castles for the rivals
  for (let c = 0; c < nCastles && rivals.length; c++) {
    const f = rivals[c % rivals.length], home = capOf(f);
    const toward = Math.atan2(mid[0] - home.pos[0], mid[1] - home.pos[1]) + (rng() - 0.5) * 1.6;
    const d = 600 + rng() * 350;
    const p = best(home.pos[0] + Math.sin(toward) * d, home.pos[1] + Math.cos(toward) * d, 220, 42, 24, (x, z) => (hAt(x, z) - hAt(home.pos[0], home.pos[1])) * 0.08 - (nearSettle(x, z, 320) ? 1e9 : 0));
    if (!p) continue;
    settlements.push({ id: 'k' + c, kind: 'castle', pos: p, r: 42, faction: f, name: name() + ' Castle', tier: 2, gateDir: Math.atan2(mid[0] - p[0], mid[1] - p[1]) });
  }
  // strongholds (timber forts and war camps) toward the frontier
  for (let c = 0; c < nForts && rivals.length; c++) {
    const f = c < 2 || rivals.length < 2 ? rivals[0] : rivals[(c - 1) % rivals.length], home = capOf(f);
    let tgt = capOf(0).pos;
    if (rivals.length > 1 && rng() < 0.45) tgt = capOf(rivals[(c + 1) % rivals.length]).pos;
    let p = null;
    for (let tr = 0; tr < 8 && !p; tr++) {
      const toward = Math.atan2(tgt[0] - home.pos[0], tgt[1] - home.pos[1]) + (rng() - 0.5) * (1.9 + tr * 0.3);
      const d = 420 + rng() * 520;
      p = best(home.pos[0] + Math.sin(toward) * d, home.pos[1] + Math.cos(toward) * d, 200, 34, 24, (x, z) => (nearSettle(x, z, 220) ? -1e9 : 0));
      if (p && nearSettle(p[0], p[1], 220)) p = null;
    }
    if (!p) continue;
    settlements.push({ id: 'h' + c, kind: 'stronghold', pos: p, r: 34, faction: f, name: name() + ' Fort', tier: 1, gateDir: Math.atan2(tgt[0] - p[0], tgt[1] - p[1]) });
  }
  // villages: fertile flat ground near water, two of them close to the player's keep
  const vill = [];
  const pcap = capOf(0);
  const wantV = o.villageCount !== undefined ? o.villageCount : Math.round(SZ.villages * (o.villages === 'few' ? 0.6 : o.villages === 'many' ? 1.5 : 1));
  for (let tries = 0; vill.length < wantV && tries < wantV * 30; tries++) {
    let cx, cz;
    if (vill.length < 2) { const a = rng() * 6.283, d = 380 + rng() * 380; cx = pcap.pos[0] + Math.sin(a) * d; cz = pcap.pos[1] + Math.cos(a) * d; }
    else { cx = play0 + rng() * (play1 - play0); cz = play0 + rng() * (play1 - play0); }
    if (nearSettle(cx, cz, 240)) continue;
    if (capitals.some((c) => Math.hypot(c.pos[0] - cx, c.pos[1] - cz) < 340)) continue;
    const p = best(cx, cz, 90, 30, 18, (x, z) => -Math.max(0, riverD(x, z) - 250) * 0.004);
    if (!p || nearSettle(p[0], p[1], 240)) continue;
    const tier = rng() < 0.3 ? 1 : rng() < 0.75 ? 2 : 3;
    const s = { id: 'v' + vill.length, kind: 'village', pos: p, r: tier === 1 ? 26 : tier === 2 ? 34 : 42, faction: NEUTRAL, name: name(), tier };
    settlements.push(s); vill.push(s);
  }
  // flatten every site and pave castle yards
  for (const s of settlements) {
    const R = s.r + (s.kind === 'village' ? 8 : 16), F = 34;
    const hc = hAt(s.pos[0], s.pos[1]);
    const i0 = Math.max(0, Math.floor((s.pos[0] - R - F) / res)), i1 = Math.min(n - 1, Math.ceil((s.pos[0] + R + F) / res));
    const j0 = Math.max(0, Math.floor((s.pos[1] - R - F) / res)), j1 = Math.min(n - 1, Math.ceil((s.pos[1] + R + F) / res));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(i * res - s.pos[0], j * res - s.pos[1]);
      if (d > R + F) continue;
      const q = j * n + i;
      const w = 1 - smooth((d - R) / F);
      H[q] = H[q] + (hc - H[q]) * w;
      if (w > 0.5 && MATS[q] === MAT.ROCK) MATS[q] = B.snow ? MAT.SNOW : MAT.GRASS;
      // yards: stone paving inside a rival's castle walls, trodden earth in a fort, and only a
      // small worn patch round the player's keep (the player builds the rest in FOUNDING)
      if (s.kind === 'capital' && s.faction === 0) { /* your land stays green: you build the kingdom on it */ }
      else if (s.kind === 'capital' || s.kind === 'castle') { if (d < s.r - 9) MATS[q] = noise2(i * 0.35, j * 0.35, seed + 5) > 0.72 ? MAT.DIRT : MAT.PAVE; }
      else if (s.kind !== 'village' && d < s.r * 0.78) MATS[q] = MAT.DIRT;
      if (s.kind === 'village' && d < 15) MATS[q] = MAT.DIRT;
    }
  }

  // ------------------------------------------------------------------ 6. roads (A* on 16 m)
  progress('Laying the roads', 0.58);
  const RC = 16, RW = Math.ceil(size / RC);
  const rcost = new Float32Array(RW * RW);
  for (let j = 0; j < RW; j++) for (let i = 0; i < RW; i++) {
    const x = (i + 0.5) * RC, z = (j + 0.5) * RC;
    const h = hAt(x, z);
    const sl = Math.hypot(hAt(x + RC, z) - hAt(x - RC, z), hAt(x, z + RC) - hAt(x, z - RC)) / (2 * RC);
    let c = 1 + sl * 14;
    if (h < 0.3) c += 30;                        // water: bridges are expensive
    if (CF.matAt(x, z) === MAT.ROCK) c += 6;
    if (macroAt(x, z, ringK) > 0.3) c = 1e9;
    if (pools.some(([px, pz, pr]) => Math.hypot(x - px, z - pz) < pr * 1.1)) c += 25;
    for (const s of settlements) if (s.kind !== 'village' && Math.hypot(x - s.pos[0], z - s.pos[1]) < s.r - 4) c += 40;
    rcost[j * RW + i] = c;
  }
  for (const [fx, fz] of fords) { const i = Math.floor(fx / RC), j = Math.floor(fz / RC); for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const q = (j + dj) * RW + i + di; if (q >= 0 && q < rcost.length && rcost[q] < 1e8) rcost[q] = Math.min(rcost[q], 4); } }
  const roadCell = new Uint8Array(RW * RW);
  function roadPath(a, b) {
    const si = clamp(Math.floor(a[0] / RC), 0, RW - 1) + clamp(Math.floor(a[1] / RC), 0, RW - 1) * RW;
    const gi = clamp(Math.floor(b[0] / RC), 0, RW - 1) + clamp(Math.floor(b[1] / RC), 0, RW - 1) * RW;
    const g = new Float32Array(RW * RW).fill(1e18), came = new Int32Array(RW * RW).fill(-1), closed = new Uint8Array(RW * RW);
    const heap = [], hf = [];
    const gx = gi % RW, gz = (gi / RW) | 0;
    const Hh = (k) => Math.hypot((k % RW) - gx, ((k / RW) | 0) - gz) * 0.9;
    const push = (k, f) => { heap.push(k); hf.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hf[p] <= hf[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hf[p], hf[i]] = [hf[i], hf[p]]; i = p; } };
    const pop = () => { const top = heap[0], l = heap.pop(), lf = hf.pop(); if (heap.length) { heap[0] = l; hf[0] = lf; let i = 0; for (;;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < heap.length && hf[L] < hf[m]) m = L; if (R < heap.length && hf[R] < hf[m]) m = R; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hf[m], hf[i]] = [hf[i], hf[m]]; i = m; } } return top; };
    g[si] = 0; push(si, Hh(si));
    const D = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
    let found = false, it = 0;
    while (heap.length && it++ < 120000) {
      const k = pop();
      if (closed[k]) continue; closed[k] = 1;
      if (k === gi) { found = true; break; }
      const ki = k % RW, kj = (k / RW) | 0;
      for (const [di, dj, dl] of D) {
        const ni = ki + di, nj = kj + dj; if (ni < 0 || nj < 0 || ni >= RW || nj >= RW) continue;
        const nk = nj * RW + ni; const c = rcost[nk]; if (c >= 1e8) continue;
        const ng = g[k] + dl * (roadCell[nk] ? Math.min(c, 1) * 0.55 : c);
        if (ng < g[nk]) { g[nk] = ng; came[nk] = k; push(nk, ng + Hh(nk)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = gi; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    for (const k of cells) roadCell[k] = 1;
    let pts = cells.map((k) => [((k % RW) + 0.5) * RC, (((k / RW) | 0) + 0.5) * RC]);
    pts[0] = [a[0], a[1]]; pts[pts.length - 1] = [b[0], b[1]];
    for (let pass = 0; pass < 3; pass++) {
      const out = [pts[0]];
      for (let i = 0; i < pts.length - 1; i++) { const p = pts[i], q = pts[i + 1]; out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25], [p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]); }
      out.push(pts[pts.length - 1]); pts = out;
    }
    return pts;
  }
  // connect: a spanning tree over the settlements, plus each castle to its two nearest
  const roads = [];
  const gatePt = (s) => s.kind === 'village' ? s.pos : [s.pos[0] + Math.sin(s.gateDir || 0) * (s.r + 14), s.pos[1] + Math.cos(s.gateDir || 0) * (s.r + 14)];
  {
    const inTree = new Set([0]), edges = [];
    while (inTree.size < settlements.length) {
      let bd = Infinity, be = null;
      for (const a of inTree) for (let b = 0; b < settlements.length; b++) {
        if (inTree.has(b)) continue;
        const d = Math.hypot(settlements[a].pos[0] - settlements[b].pos[0], settlements[a].pos[1] - settlements[b].pos[1]);
        if (d < bd) { bd = d; be = [a, b]; }
      }
      inTree.add(be[1]); edges.push(be);
    }
    for (let a = 0; a < settlements.length; a++) {
      if (settlements[a].kind === 'village') continue;
      const near = settlements.map((s, b) => [b, Math.hypot(s.pos[0] - settlements[a].pos[0], s.pos[1] - settlements[a].pos[1])]).filter(([b]) => b !== a).sort((p, q) => p[1] - q[1]).slice(0, 2);
      for (const [b] of near) if (!edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) edges.push([a, b]);
    }
    for (const [a, b] of edges) {
      const p = roadPath(gatePt(settlements[a]), gatePt(settlements[b]));
      if (p) roads.push(p);
    }
  }
  // carve them: a flattened 5 m dirt road, a causeway and a bridge where it crosses deep water
  const bridges = [];
  for (const road of roads) {
    // resample every 3 m
    const pts = [];
    for (let k = 0; k < road.length - 1; k++) {
      const a = road[k], b = road[k + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const st = Math.max(1, Math.ceil(L / 3));
      for (let s = 0; s < st; s++) pts.push([a[0] + (b[0] - a[0]) * s / st, a[1] + (b[1] - a[1]) * s / st]);
    }
    pts.push(road[road.length - 1]);
    // the grade: heights smoothed along the road
    const hRaw = pts.map((p) => hAt(p[0], p[1]));
    const grade = hRaw.map((_, k) => { let s = 0, c = 0; for (let d = -4; d <= 4; d++) { const q = clamp(k + d, 0, hRaw.length - 1); s += hRaw[q]; c++; } return s / c; });
    let wet = null;
    for (let k = 0; k < pts.length; k++) {
      const [x, z] = pts[k];
      const deep = riverD(x, z) < 1.5 && hRaw[k] < -0.4;
      if (deep && !wet) wet = { k0: k };
      if (!deep && wet) { wet.k1 = k; bridges.push(wet); wet = null; }
      const i0 = Math.floor((x - 4) / res), i1 = Math.ceil((x + 4) / res), j0 = Math.floor((z - 4) / res), j1 = Math.ceil((z + 4) / res);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        if (i < 0 || j < 0 || i >= n || j >= n) continue;
        const d = Math.hypot(i * res - x, j * res - z);
        if (d > 4) continue;
        const q = j * n + i;
        if (H[q] < 0.25) continue;
        const w = 1 - smooth((d - 2.2) / 1.8);
        H[q] = H[q] + (Math.max(0.5, grade[k]) - H[q]) * w * 0.7;
        if (d < 2.6 + noise2(i * 0.3, j * 0.3, seed) * 0.8 && MATS[q] !== MAT.BED) MATS[q] = MAT.ROAD;
      }
    }
    for (const b of bridges) if (b.k1 !== undefined && !b.pts) {
      const a = pts[Math.max(0, b.k0 - 2)], c = pts[Math.min(pts.length - 1, b.k1 + 1)];
      b.pts = [a, c];
    }
    road.length = 0; road.push(...pts.filter((_, k) => k % 3 === 0), pts[pts.length - 1]);
  }
  const bridgeList = [];
  for (const b of bridges) {
    if (!b.pts) continue;
    const [a, c] = b.pts, L = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (L < 6 || bridgeList.some((q) => Math.hypot(q.pos[0] - (a[0] + c[0]) / 2, q.pos[1] - (a[1] + c[1]) / 2) < 20)) continue;
    const br = { a, b: c, pos: [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2], len: L + 8, w: 7, rot: Math.atan2(c[0] - a[0], c[1] - a[1]) };
    bridgeList.push(br);
    // the causeway under the deck: dry ground at deck height so men walk over
    const ux = (c[0] - a[0]) / L, uz = (c[1] - a[1]) / L;
    for (let s = -4; s <= L + 4; s += 1) for (let w = -3.6; w <= 3.6; w += 1) {
      const x = a[0] + ux * s - uz * w, z = a[1] + uz * s + ux * w;
      const i = Math.round(x / res), j = Math.round(z / res); if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const q = j * n + i;
      const want = 1.05;
      if (H[q] < want) H[q] = want;
      MATS[q] = MAT.ROAD;
    }
  }

  // ------------------------------------------------------------------ 7. regions (8 m grid)
  progress('Drawing the borders', 0.68);
  const RG = 8, GW = Math.ceil(size / RG);
  const target = sizeKey === 'field' ? SZ.regions : SZ.regions;
  const spacing = Math.sqrt(((play1 - play0) ** 2) / target) * 0.95;
  const seeds = [];
  // settlements seed their own regions so each sits near its region's heart
  for (const s of settlements) seeds.push([s.pos[0], s.pos[1], s.id]);
  for (let tries = 0; seeds.length < target && tries < target * 60; tries++) {
    const x = play0 + 30 + rng() * (play1 - play0 - 60), z = play0 + 30 + rng() * (play1 - play0 - 60);
    if (seeds.some((p) => Math.hypot(p[0] - x, p[1] - z) < spacing)) continue;
    if (hAt(x, z) < 0.4) continue;
    seeds.push([x, z, null]);
  }
  const regGrid = new Uint16Array(GW * GW).fill(65535);
  {
    const dist = new Float64Array(GW * GW).fill(1e18);
    const cellCost = new Float32Array(GW * GW);
    for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
      const x = (i + 0.5) * RG, z = (j + 0.5) * RG;
      const h = hAt(x, z);
      let c = 1 + Math.abs(hAt(x + RG, z) - hAt(x - RG, z)) * 0.3 + Math.abs(hAt(x, z + RG) - hAt(x, z - RG)) * 0.3;
      if (h < 0.2) c += 40;             // rivers are natural borders
      if (CF.matAt(x, z) === MAT.ROCK) c += 6;
      cellCost[j * GW + i] = c;
    }
    const heap = [], hk = [];
    const push = (k, f) => { heap.push(k); hk.push(f); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (hk[p] <= hk[i]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; [hk[p], hk[i]] = [hk[i], hk[p]]; i = p; } };
    const pop = () => { const top = heap[0], tf = hk[0], l = heap.pop(), lf = hk.pop(); if (heap.length) { heap[0] = l; hk[0] = lf; let i = 0; for (;;) { const L = 2 * i + 1, R = L + 1; let m = i; if (L < heap.length && hk[L] < hk[m]) m = L; if (R < heap.length && hk[R] < hk[m]) m = R; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; [hk[m], hk[i]] = [hk[i], hk[m]]; i = m; } } return [top, tf]; };
    seeds.forEach(([x, z], r) => { const k = clamp(Math.floor(z / RG), 0, GW - 1) * GW + clamp(Math.floor(x / RG), 0, GW - 1); dist[k] = 0; regGrid[k] = r; push(k, 0); });
    while (heap.length) {
      const [k, d] = pop();
      if (d > dist[k]) continue;
      const ki = k % GW, kj = (k / GW) | 0;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = ki + di, nj = kj + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GW) continue;
        const nk = nj * GW + ni, nd = d + cellCost[nk];
        if (nd < dist[nk]) { dist[nk] = nd; regGrid[nk] = regGrid[k]; push(nk, nd); }
      }
    }
  }
  const regions = seeds.map(([x, z, sid], id) => ({ id, seed: [x, z], settlement: sid, cells: 0, sx: 0, sz: 0, neighbors: new Set(), forest: 0, field: 0, hill: 0, water: 0, owner: -1, name: '' }));
  for (let j = 0; j < GW; j++) for (let i = 0; i < GW; i++) {
    const r = regGrid[j * GW + i]; const R = regions[r];
    if (!R) continue;
    const x = (i + 0.5) * RG, z = (j + 0.5) * RG;
    // the mountain ring belongs to no one
    if (macroAt(x, z, ringK) > 0.55) { regGrid[j * GW + i] = 65535; continue; }
    R.cells++; R.sx += x; R.sz += z;
    if (i > 0) { const o = regGrid[j * GW + i - 1]; if (o !== r && o !== 65535) { R.neighbors.add(o); regions[o].neighbors.add(r); } }
    if (j > 0) { const o = regGrid[(j - 1) * GW + i]; if (o !== r && o !== 65535) { R.neighbors.add(o); regions[o].neighbors.add(r); } }
  }
  for (const R of regions) {
    R.neighbors = [...R.neighbors];
    R.centroid = R.cells ? [R.sx / R.cells, R.sz / R.cells] : R.seed;
    R.area = R.cells * RG * RG;
    delete R.sx; delete R.sz;
    const s = settlements.find((q) => q.id === R.settlement);
    if (s) { s.region = R.id; R.name = s.name; R.kind = s.kind; }
  }
  // waystones: the flattest walkable spot near the heart of each region (a settlement's
  // region uses its square, yard or treasury instead)
  for (const R of regions) {
    if (R.settlement) { const s = settlements.find((q) => q.id === R.settlement); R.waystone = s.pos.slice(); continue; }
    let bs = -1e9, bp = R.centroid;
    for (let k = 0; k < 60; k++) {
      const a = k * 2.39996, d = Math.sqrt(k) * 14;
      const x = R.centroid[0] + Math.cos(a) * d, z = R.centroid[1] + Math.sin(a) * d;
      const gi = clamp(Math.floor(x / RG), 0, GW - 1), gj = clamp(Math.floor(z / RG), 0, GW - 1);
      if (regGrid[gj * GW + gi] !== R.id) continue;
      const h = hAt(x, z); if (h < 0.8) continue;
      const sl = Math.hypot(hAt(x + 6, z) - hAt(x - 6, z), hAt(x, z + 6) - hAt(x, z - 6)) / 12;
      if (sl > 0.35 || CF.matAt(x, z) === MAT.ROCK) continue;
      const s = -sl * 40 - d * 0.02;
      if (s > bs) { bs = s; bp = [x, z]; }
    }
    R.waystone = bp;
    R.name = name();
  }

  // ------------------------------------------------------------------ 8. forests and trees
  progress('Planting the forests', 0.78);
  const F = T.forest;
  // the forest threshold that gives the biome's woodland share
  const sampleV = [];
  for (let k = 0; k < 4000; k++) { const x = play0 + rng() * (play1 - play0), z = play0 + rng() * (play1 - play0); sampleV.push(fbm(x / 420, z / 420, seed + 71, 4) + 0.35 * fbm(x / 120, z / 120, seed + 72, 3)); }
  sampleV.sort((a, b) => a - b);
  const th = sampleV[Math.floor((1 - B.forest) * sampleV.length)] || 1;
  const clearOf = (x, z) => {
    for (const s of settlements) { const d = Math.hypot(x - s.pos[0], z - s.pos[1]); if (d < s.r + (s.kind === 'village' ? 60 : 40)) return true; }
    return false;
  };
  // the forest mask is computed per 4 m and written to the 2 m grid
  for (let j = 0; j < n; j += 2) for (let i = 0; i < n; i += 2) {
    const x = i * res, z = j * res;
    const v = fbm(x / 420, z / 420, seed + 71, 4) + 0.35 * fbm(x / 120, z / 120, seed + 72, 3);
    let d = smooth((v - th) / 0.07);
    const rk = macroAt(x, z, ringK);
    if (rk > 0.25) d = Math.max(d * 0.6, smooth((0.62 - rk) / 0.2) * smooth((rk - 0.2) / 0.15) * 0.85);   // pine skirts on the mountain feet
    if (d > 0.02) {
      const q0 = j * n + i;
      const m = MATS[q0];
      if (m === MAT.ROAD || m === MAT.BED || m === MAT.SAND || m === MAT.DIRT || H[q0] < 0.8) d = 0;
      else if (riverD(x, z) < 18) d = 0;
      else if (clearOf(x, z)) d = 0;
    }
    const val = Math.round(d * 255);
    for (let dj = 0; dj < 2; dj++) for (let di = 0; di < 2; di++) { const ii = i + di, jj = j + dj; if (ii < n && jj < n) F[jj * n + ii] = val; }
  }
  const pineShare = B.snow ? 0.92 : biomeKey === 'highland' ? 0.6 : biomeKey === 'forest' ? 0.45 : 0.3;
  const trees = [];
  const TG = 8.5;
  for (let z = TG / 2; z < size; z += TG) for (let x = TG / 2; x < size; x += TG) {
    const jx = x + (rng() - 0.5) * TG * 0.9, jz = z + (rng() - 0.5) * TG * 0.9;
    const fd = T.forestAt(jx, jz);
    const lone = fd < 0.05 && rng() < 0.012;
    if (!(rng() < fd * 0.92) && !lone) continue;
    const m = CF.matAt(jx, jz);
    if (m === MAT.ROAD || m === MAT.BED || m === MAT.FIELD || m === MAT.DIRT || m === MAT.SAND) continue;
    const h = hAt(jx, jz);
    if (h < 0.8) continue;
    if (lone && (clearOf(jx, jz) || riverD(jx, jz) < 10)) continue;
    const sl = Math.hypot(hAt(jx + 2, jz) - hAt(jx - 2, jz), hAt(jx, jz + 2) - hAt(jx, jz - 2)) / 4;
    if (sl > 0.9) continue;
    const rk = macroAt(jx, jz, ringK);
    const pine = rng() < pineShare + rk * 0.8 + Math.max(0, h - 30) * 0.02;
    trees.push({ x: jx, z: jz, kind: pine ? 'pine' : 'oak', s: 0.82 + rng() * 0.5, rot: rng() * 6.28, seed: rng() });
  }

  // ------------------------------------------------------------------ 9. dressing props
  progress('Building the villages', 0.88);
  const props = [], boulders = [];
  for (const s of settlements) {
    if (s.kind === 'village') {
      const nH = s.tier === 1 ? 6 : s.tier === 2 ? 9 : 13;
      s.houses = [];
      props.push({ type: 'well', pos: [s.pos[0] + 3, s.pos[1] - 2], settle: s.id });
      let placed = 0;
      for (let k = 0; placed < nH && k < nH * 6; k++) {
        const ring = placed < 6 ? 0 : 1;
        const a = (placed / Math.min(nH, 6)) * 6.283 + ring * 0.5 + (rng() - 0.5) * 0.35;
        const d = (ring ? 32 : 20) + rng() * 6 + (s.tier === 3 ? 4 : 0);
        const x = s.pos[0] + Math.cos(a) * d, z = s.pos[1] + Math.sin(a) * d;
        if (riverD(x, z) < 8 || hAt(x, z) < 0.9) continue;
        if (s.houses.some((p) => Math.hypot(p[0] - x, p[1] - z) < 9)) continue;
        const rotY = Math.atan2(s.pos[0] - x, s.pos[1] - z);
        const big = rng() < 0.3;
        props.push({ type: rng() < 0.4 ? 'cottage' : 'house', pos: [x, z], rot: rotY, big, settle: s.id });
        s.houses.push([x, z]);
        placed++;
        if (rng() < 0.35) props.push({ type: 'hay', pos: [x + Math.cos(a) * 6, z + Math.sin(a) * 6], settle: s.id });
      }
      // a mill or a chapel at the edge
      const a = rng() * 6.283;
      props.push({ type: s.tier >= 2 && rng() < 0.6 ? 'windmill' : 'abbeySmall', pos: [s.pos[0] + Math.cos(a) * (s.r + 6), s.pos[1] + Math.sin(a) * (s.r + 6)], rot: rng() * 6, settle: s.id });
      // crop fields around the village
      const nF = Math.round((3 + rng() * 4) * (0.4 + B.fields));
      for (let f = 0; f < nF; f++) {
        const fa = rng() * 6.283, fd = s.r + 30 + rng() * 120;
        const cx = s.pos[0] + Math.cos(fa) * fd, cz = s.pos[1] + Math.sin(fa) * fd;
        const w = 30 + rng() * 50, l = 40 + rng() * 70, ang = rng() * Math.PI;
        const ca = Math.cos(ang), sa = Math.sin(ang);
        for (let v = -l / 2; v <= l / 2; v += 1.5) for (let u = -w / 2; u <= w / 2; u += 1.5) {
          const x = cx + ca * u - sa * v, z = cz + sa * u + ca * v;
          const i = Math.round(x / res), j = Math.round(z / res); if (i < 0 || j < 0 || i >= n || j >= n) continue;
          const q = j * n + i;
          if ((MATS[q] === MAT.GRASS || MATS[q] === MAT.SNOW) && F[q] < 30 && H[q] > 0.9) MATS[q] = MAT.FIELD;
        }
        if (rng() < 0.5) props.push({ type: 'fence', a: [cx - ca * w / 2 - sa * l / 2, cz - sa * w / 2 + ca * l / 2], b: [cx + ca * w / 2 - sa * l / 2, cz + sa * w / 2 + ca * l / 2] });
      }
    } else if (s.kind === 'stronghold') {
      const ang = s.gateDir;
      props.push({ type: 'tent', pos: [s.pos[0], s.pos[1]], team: s.faction, big: true, settle: s.id, treasury: true });
      for (let k = 0; k < 5; k++) { const a = ang + Math.PI + (k - 2) * 0.55; props.push({ type: 'tent', pos: [s.pos[0] + Math.sin(a) * 15, s.pos[1] + Math.cos(a) * 15], team: s.faction, settle: s.id }); }
      props.push({ type: 'campfire', pos: [s.pos[0] + Math.sin(ang) * 9, s.pos[1] + Math.cos(ang) * 9], settle: s.id });
    } else {
      // castle yards: a few service buildings behind the keep
      const back = s.gateDir + Math.PI;
      for (let k = 0; k < (s.kind === 'capital' ? 4 : 2); k++) {
        const a = back + (k - 1.5) * 0.7;
        props.push({ type: 'house', pos: [s.pos[0] + Math.sin(a) * s.r * 0.6, s.pos[1] + Math.cos(a) * s.r * 0.6], rot: a + Math.PI, settle: s.id, yard: true });
      }
      props.push({ type: 'well', pos: [s.pos[0] + Math.sin(s.gateDir) * s.r * 0.45 + 6, s.pos[1] + Math.cos(s.gateDir) * s.r * 0.45], settle: s.id });
    }
  }
  for (const b of bridgeList) props.push({ type: 'bridge', pos: b.pos, rot: b.rot, len: b.len, w: b.w, a: b.a, b: b.b });
  // boulders: scattered over rocky ground near the playable area
  for (let k = 0; k < size * 0.12; k++) {
    const x = play0 - 60 + rng() * (play1 - play0 + 120), z = play0 - 60 + rng() * (play1 - play0 + 120);
    const m = CF.matAt(x, z);
    if (m !== MAT.ROCK && rng() > 0.08) continue;
    if (clearOf(x, z) || hAt(x, z) < 0.8) continue;
    boulders.push({ x, z, s: m === MAT.ROCK ? 1.2 + rng() * 2.6 : 0.5 + rng() * 0.9, rot: rng() * 6.28, seed: rng() });
  }
  CF.base = H.slice();
  T.version++;

  // starting territory: each capital's region and its empty neighbours
  for (const c of capitals) {
    const R = regions[c.region];
    R.owner = c.faction;
    for (const nb of R.neighbors) if (regions[nb].owner === -1 && !regions[nb].settlement) regions[nb].owner = c.faction;
  }
  for (const s of settlements) if (s.kind !== 'village' && regions[s.region]) regions[s.region].owner = s.faction;
  for (const s of settlements) if (s.kind === 'village' && regions[s.region]) regions[s.region].owner = NEUTRAL;

  // keep sites in the player's start region (FOUNDING picks one; the best is pre-picked)
  const home = capOf(0);
  const keepSites = [home.pos.slice()];
  for (let k = 0; k < 2; k++) {
    const a = rng() * 6.283, d = 140 + rng() * 120;
    const p = best(home.pos[0] + Math.sin(a) * d, home.pos[1] + Math.cos(a) * d, 90, 40, 20, (x, z) => -(nearSettle(x, z, 120) ? 1e9 : 0));
    if (p) keepSites.push(p);
  }

  progress('Ready', 1);
  return {
    terrain: T, size, sizeKey, biome: biomeKey, seed, rivers, fords, bridges: bridgeList, ridges, mesas, pools,
    settlements, roads, regions, regGrid, RG, GW, trees, boulders, props, keepSites, capitals, ringW, play: [play0, play1], main,
    genMs: Date.now() - t0,
  };
}
