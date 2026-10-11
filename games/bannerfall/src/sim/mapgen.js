// BANNERFALL :: sim/mapgen.js - a battle definition becomes terrain, trees, rocks, hedges and props.
// Features: rolling noise, hills, mesas (flat-topped rises for forts), ridges (cliffs that block),
// a river with fords and a stone-bridge causeway, marsh pools, mud, crop fields, roads.
import { Heightfield, MAT } from './terrain.js';
import { mulberry32, fbm } from './rng.js';

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

function distToPolyline(x, z, path) {
  let best = Infinity, bt = 0, acc = 0;
  for (let k = 0; k < path.length - 1; k++) {
    const a = path[k], b = path[k + 1];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    const L2 = dx * dx + dz * dz, L = Math.sqrt(L2);
    let t = ((x - a[0]) * dx + (z - a[1]) * dz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const d = Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
    if (d < best) { best = d; bt = acc + t * L; }
    acc += L;
  }
  return { d: best, along: bt, total: acc };
}
function distSeg(x, z, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0, L2 = dx * dx + dz * dz || 1e-6;
  let t = ((x - x0) * dx + (z - z0) * dz) / L2; t = t < 0 ? 0 : t > 1 ? 1 : t;
  return Math.hypot(x - x0 - dx * t, z - z0 - dz * t);
}

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], zi = poly[i][1], xj = poly[j][0], zj = poly[j][1];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function generateMap(def) {
  const T = def.terrain;
  const hf = new Heightfield(def.size, 0.5);
  const rng = mulberry32(def.seed);
  const seed = def.seed;
  hf.waterLevel = 0;
  const n = hf.n, res = hf.res;
  const river = T.river;
  // the land before water: noise, hills, ridges
  const landH = (x, z) => {
    let h = 1.6 + (fbm(x / 46, z / 46, seed, 4) - 0.5) * 2 * T.base * 2.2 + (fbm(x / 9, z / 9, seed + 5, 2) - 0.5) * 0.35;
    for (const [hx, hz, hh, hr] of T.hills || []) {
      const d = Math.hypot(x - hx, z - hz) / hr;
      if (d < 1) h += hh * (0.5 + 0.5 * Math.cos(Math.PI * d)) * (0.85 + 0.3 * fbm(x / 12, z / 12, seed + 9, 2));
    }
    return h;
  };
  const mesaTops = (T.mesas || []).map(([cx, cz, hh, r]) => ({ cx, cz, r, top: landH(cx, cz) + hh }));
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const x = i * res, z = j * res;
      let h = landH(x, z);
      let mat = MAT.GRASS;
      // ridges: steep-sided rock walls (cliffs) that block movement
      for (const [x0, z0, x1, z1, hh, w] of T.ridges || []) {
        const d = distSeg(x, z, x0, z0, x1, z1);
        if (d < w) {
          const k = smooth((w - d) / (w * 0.32));
          const crag = 0.75 + 0.5 * fbm(x / 9, z / 9, seed + 31, 3);
          h += hh * k * crag;
          if (k > 0.18) mat = MAT.ROCK;
        }
      }
      // mesas: flat tops for forts and citadels
      for (const M of mesaTops) {
        const d = Math.hypot(x - M.cx, z - M.cz) / M.r;
        if (d < 1.25) { const f = 1 - smooth((d - 0.72) / 0.5); h = h + (M.top + (fbm(x / 7, z / 7, seed + 41, 2) - 0.5) * 0.4 - h) * f; }
      }
      if (river) {
        const { d } = distToPolyline(x, z, river.path);
        const half = river.width / 2;
        let depth = river.depth;
        for (const [fx, fz, fr] of T.fords || []) {
          const fd = Math.hypot(x - fx, z - fz) / fr;
          if (fd < 1.4) depth = Math.min(depth, 0.35 + (river.depth - 0.35) * smooth((fd - 0.6) / 0.8));
        }
        const bed = -depth + (fbm(x / 7, z / 7, seed + 3, 2) - 0.5) * 0.4;
        if (d < half) {
          const u = d / half;
          h = bed + (0.3 - bed) * smooth((u - 0.25) / 0.75); mat = MAT.BED;
        } else if (d < half + 9) {
          const u = (d - half) / 9;
          h = 0.3 + (h - 0.3) * smooth(u);
        }
      }
      // marsh pools: shallow water you can wade (slow)
      for (const [px, pz, pr] of T.pools || []) {
        const d = Math.hypot(x - px, z - pz) / (pr * (0.85 + 0.3 * fbm(x / 6, z / 6, seed + 17, 2)));
        if (d < 1.3) {
          const target = -0.55 * (1 - d * d) + 0.25;
          if (d < 1) { h = Math.min(h, target); if (h < 0.05) mat = MAT.BED; }
          else h = h + (Math.min(h, 0.4) - h) * smooth((1.3 - d) / 0.3);
        }
      }
      const k = j * n + i;
      hf.h[k] = h;
      hf.mat[k] = mat;
    }
  }
  // bridge causeway: a dry deck across the river (the bridge mesh sits on it)
  if (T.bridge) {
    const B = T.bridge;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * res, z = j * res;
      if (z < B.z0 - 6 || z > B.z1 + 6) continue;
      const dx = Math.abs(x - B.x) - B.w / 2;
      if (dx > 1.5) continue;
      const k = j * n + i;
      const along = z < B.z0 ? 1 - smooth((B.z0 - z) / 6) : z > B.z1 ? 1 - smooth((z - B.z1) / 6) : 1;
      const deck = 0.95;
      const side = dx <= 0 ? 1 : 1 - smooth(dx / 1.5);
      const want = deck * side * along + hf.h[k] * (1 - side * along);
      if (want > hf.h[k]) hf.h[k] = want;
      if (side > 0.5 && along > 0.3) hf.mat[k] = MAT.DIRT;
    }
  }
  // crop fields (golden rows)
  for (const [x0, z0, x1, z1] of T.fields || []) {
    for (let j = Math.floor(z0 / res); j <= Math.ceil(z1 / res); j++) for (let i = Math.floor(x0 / res); i <= Math.ceil(x1 / res); i++) {
      if (i < 0 || j < 0 || i >= n || j >= n) continue;
      const k = j * n + i;
      if (hf.mat[k] === MAT.GRASS) hf.mat[k] = MAT.FIELD;
    }
  }
  // mud patches
  if (T.mud) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * res, z = j * res, k = j * n + i;
      if (hf.mat[k] !== MAT.GRASS) continue;
      const m = fbm(x / 18, z / 18, seed + 51, 3) + (fbm(x / 4, z / 4, seed + 52, 2) - 0.5) * 0.15;
      if (m > 1 - T.mud) { hf.mat[k] = MAT.MUD; hf.h[k] -= 0.06; }
    }
  }
  // road
  if (T.road) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * res, z = j * res;
      const { d } = distToPolyline(x, z, T.road);
      const w = 2.2 + fbm(x / 6, z / 6, seed + 11, 2) * 1.4;
      const k = j * n + i;
      if (d < w && (hf.mat[k] === MAT.GRASS || hf.mat[k] === MAT.FIELD || hf.mat[k] === MAT.MUD)) hf.mat[k] = MAT.DIRT;
    }
  }
  // rock patches + boulders
  const boulders = [];
  for (const [rx, rz, rr] of T.rocks || []) {
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * res, z = j * res;
      const d = Math.hypot(x - rx, z - rz) / rr;
      if (d < 1 + (fbm(x / 4, z / 4, seed + 13, 2) - 0.5) * 0.6) {
        const k = j * n + i;
        hf.mat[k] = MAT.ROCK;
        hf.h[k] += (1 - d) * 1.8;
      }
    }
    const cnt = Math.round(rr * 0.8);
    for (let c = 0; c < cnt; c++) {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * rr * 0.9;
      boulders.push({ x: rx + Math.cos(a) * r, z: rz + Math.sin(a) * r, s: 0.8 + rng() * 2.2, rot: rng() * 6.28, seed: rng() });
    }
  }
  // boulders on the cliffs
  for (const [x0, z0, x1, z1, hh, w] of T.ridges || []) {
    for (let c = 0; c < 26; c++) {
      const t = rng(), off = (rng() - 0.5) * w * 0.9;
      const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz) || 1;
      const x = x0 + dx * t + (-dz / L) * off, z = z0 + dz * t + (dx / L) * off;
      if (!hf.inside(x, z, 2)) continue;
      boulders.push({ x, z, s: 1.4 + rng() * 2.8, rot: rng() * 6.28, seed: rng() });
    }
  }
  // scattered field stones
  for (let c = 0; c < 46; c++) {
    const x = 8 + rng() * (def.size - 16), z = 8 + rng() * (def.size - 16);
    if (hf.height(x, z) < 0.6) continue;
    boulders.push({ x, z, s: 0.4 + rng() * 0.9, rot: rng() * 6.28, seed: rng() });
  }
  hf.base = hf.h.slice();

  // trees
  const trees = [];
  const keepClear = (x, z) => {
    if (T.road && distToPolyline(x, z, T.road).d < 5) return true;
    for (const p of def.props || []) if (p.pos && Math.hypot(p.pos[0] - x, p.pos[1] - z) < (p.type === 'keep' || p.type === 'abbey' ? 22 : 9)) return true;
    for (const M of mesaTops) if (Math.hypot(x - M.cx, z - M.cz) < M.r * 1.05) return true;
    if (T.bridge && Math.abs(x - T.bridge.x) < 8 && z > T.bridge.z0 - 10 && z < T.bridge.z1 + 10) return true;
    return false;
  };
  for (const [fx, fz, fr, count] of T.forests || []) {
    let tries = 0, placed = 0;
    while (placed < count && tries++ < count * 8) {
      const a = rng() * 6.283, r = Math.sqrt(rng()) * fr;
      const x = fx + Math.cos(a) * r * 1.15, z = fz + Math.sin(a) * r;
      if (!hf.inside(x, z, 2) || hf.height(x, z) < 0.7) continue;
      if (hf.matAt(x, z) === MAT.ROCK && hf.slope(x, z) > 0.8) continue;
      if (keepClear(x, z)) continue;
      if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 3.4)) continue;
      trees.push({ x, z, kind: rng() < 0.45 ? 'pine' : 'oak', s: 0.8 + rng() * 0.55, rot: rng() * 6.28, seed: rng() });
      placed++;
    }
  }
  // lone hedgerow trees
  for (let c = 0; c < 16; c++) {
    const x = 14 + rng() * (def.size - 28), z = 14 + rng() * (def.size - 28);
    if (hf.height(x, z) < 0.8 || hf.matAt(x, z) === MAT.ROCK) continue;
    if (def.zones && pointInPoly(x, z, def.zones.player) && rng() < 0.6) continue;
    if (keepClear(x, z)) continue;
    trees.push({ x, z, kind: rng() < 0.3 ? 'pine' : 'oak', s: 0.9 + rng() * 0.5, rot: rng() * 6.28, seed: rng() });
  }
  // hedgerows: bushes along field edges, with gaps so foot can slip through
  const hedges = [];
  for (const line of T.hedges || []) {
    const [a, b] = line;
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const cnt = Math.floor(L / 2.1);
    const gapAt = 0.3 + rng() * 0.4;
    for (let c = 0; c <= cnt; c++) {
      const t = c / cnt;
      if (Math.abs(t - gapAt) < 4 / L) continue;
      const x = a[0] + (b[0] - a[0]) * t + (rng() - 0.5) * 0.6, z = a[1] + (b[1] - a[1]) * t + (rng() - 0.5) * 0.6;
      hedges.push({ x, z, s: 0.8 + rng() * 0.5, rot: rng() * 6.28, seed: rng() });
    }
  }
  // scenery beyond the map edge: forest belts that frame the field (render only, no collision)
  const scenery = [];
  const Sz = def.size;
  for (let c = 0; c < 420; c++) {
    const side = Math.floor(rng() * 4), u = rng() * (Sz + 160) - 80, out = 6 + Math.pow(rng(), 0.7) * 110;
    const x = side === 0 ? -out : side === 1 ? Sz + out : u, z = side === 2 ? -out : side === 3 ? Sz + out : u;
    if (side < 2 && (z < -80 || z > Sz + 80)) continue;
    if (fbm(x / 40, z / 40, seed + 21, 2) < 0.42) continue;
    if (T.river && Math.abs(distToPolyline(Math.max(0, Math.min(Sz, x)), z, T.river.path).d) < 14 && (side < 2)) continue;
    scenery.push({ x, z, kind: rng() < 0.5 ? 'pine' : 'oak', s: 0.9 + rng() * 0.7, rot: rng() * 6.28, seed: rng() });
  }
  return { terrain: hf, trees, boulders, hedges, props: def.props || [], scenery };
}

export { distToPolyline };
