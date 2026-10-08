// geo.js - roads and build plots. No DOM, so the headless balance sim can use it.

export const W = 1280, H = 720;

// Areas the HUD covers; no plots there.
export const HUD_RECTS = [
  { x: 0, y: 0, w: 330, h: 74 },      // lives / gold / wave
  { x: 0, y: 628, w: 360, h: 92 },    // spells + hero portrait
  { x: 1090, y: 0, w: 190, h: 66 },   // speed / pause / menu
];

// Catmull-Rom through the control points, resampled every `step` px so
// "distance along the road" is just an index lookup.
export function buildPath(ctrl, step = 3) {
  const pts = ctrl.map(p => ({ x: p[0], y: p[1] }));
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const n = Math.max(2, Math.ceil(segLen / 2));
    for (let s = 0; s < n; s++) {
      const t = s / n, t2 = t * t, t3 = t2 * t;
      const x = 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
      const y = 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
      dense.push({ x, y });
    }
  }
  dense.push({ ...pts[pts.length - 1] });
  // resample at even spacing
  const out = [dense[0]];
  let acc = 0;
  for (let i = 1; i < dense.length; i++) {
    let a = out[out.length - 1];
    const b = dense[i];
    let d = Math.hypot(b.x - a.x, b.y - a.y);
    while (acc + d >= step) {
      const t = (step - acc) / d;
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      out.push(p);
      a = p; d = Math.hypot(b.x - a.x, b.y - a.y); acc = 0;
    }
    acc += d;
  }
  out.push(dense[dense.length - 1]);
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 2)], b = out[Math.min(out.length - 1, i + 2)];
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    out[i].ang = ang;
    out[i].nx = -Math.sin(ang); out[i].ny = Math.cos(ang);
  }
  return { pts: out, step, length: (out.length - 1) * step };
}

export function pointAt(path, d) {
  const f = Math.max(0, Math.min(path.pts.length - 1.001, d / path.step));
  const i = Math.floor(f), t = f - i;
  const a = path.pts[i], b = path.pts[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: a.ang, nx: a.nx, ny: a.ny };
}

// nearest point on a path: returns {d, dist, x, y}
export function nearestOnPath(path, x, y) {
  let best = 1e9, bi = 0;
  const p = path.pts;
  for (let i = 0; i < p.length; i += 2) {
    const dd = (p[i].x - x) ** 2 + (p[i].y - y) ** 2;
    if (dd < best) { best = dd; bi = i; }
  }
  return { d: bi * path.step, dist: Math.sqrt(best), x: p[bi].x, y: p[bi].y };
}

export function distToRoads(paths, x, y) {
  let m = 1e9;
  for (const p of paths) if (!p.air) m = Math.min(m, nearestOnPath(p, x, y).dist);
  return m;
}

function distToPolyline(pts, x, y) {
  let m = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const ax = a[0] ?? a.x, ay = a[1] ?? a.y, bx = b[0] ?? b.x, by = b[1] ?? b.y;
    const dx = bx - ax, dy = by - ay;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    m = Math.min(m, Math.hypot(ax + dx * t - x, ay + dy * t - y));
  }
  return m;
}

export function inWater(level, x, y, pad = 0) {
  for (const w of level.water || []) {
    if (w.lake) {
      const [cx, cy, rx, ry] = w.lake;
      if (((x - cx) / (rx + pad)) ** 2 + ((y - cy) / (ry + pad)) ** 2 < 1) return true;
    } else if (w.river) {
      if (distToPolyline(w.river, x, y) < w.w / 2 + pad) return true;
    }
  }
  return false;
}

// how far each decor piece keeps plots away
const DECOR_R = { windmill: 60, house: 44, field: 0, willow: 40, orchard: 0, cart: 30, gate: 50, rocks: 30, stilthut: 44, reeds: 20,
  deadtree: 30, heron: 20, boat: 20, mountain: 90, cabin: 44, pines: 50, bigtree: 60, mushrooms: 26, lanterns: 26, ruin: 50,
  burnt: 30, scarecrow: 24, castlewall: 80, banner: 24, spire: 44, bones: 26, throne: 80, pillar: 34 };

export function decorClear(level, x, y) {
  for (const d of level.decor || []) {
    if (d.w) { if (x > d.x - d.w / 2 - 26 && x < d.x + d.w / 2 + 26 && y > d.y - d.h / 2 - 26 && y < d.y + d.h / 2 + 26) return false; continue; }
    const r = DECOR_R[d.t] ?? 30;
    if (Math.hypot(d.x - x, d.y - y) < r + 22) return false;
  }
  return true;
}

// Auto-place the build plots: walk both sides of every road, keep spots that
// sit the right distance off the road and clear of water, decor and HUD, then
// greedily take the ones that see the most road while keeping them apart.
export function placeSlots(level, paths) {
  const roads = paths.filter(p => !p.air);
  const cands = [];
  for (const p of roads) {
    for (let i = 0; i < p.pts.length; i += 8) {
      const q = p.pts[i];
      for (const side of [-1, 1]) for (const off of [58, 72]) {
        const x = q.x + q.nx * off * side, y = q.y + q.ny * off * side;
        if (x < 40 || x > W - 40 || y < 70 || y > H - 34) continue;
        if (HUD_RECTS.some(r => x > r.x - 26 && x < r.x + r.w + 26 && y > r.y - 22 && y < r.y + r.h + 22)) continue;
        const dr = distToRoads(paths, x, y);
        if (dr < 52) continue;
        if (inWater(level, x, y, 26)) continue;
        if (!decorClear(level, x, y)) continue;
        cands.push({ x, y });
      }
    }
  }
  // coverage score: road samples within a typical range
  const R2 = 165 * 165;
  for (const c of cands) {
    let s = 0;
    for (const p of paths) for (let i = 0; i < p.pts.length; i += 6) {
      const q = p.pts[i];
      if (q.x < 0 || q.x > W || q.y < 0 || q.y > H) continue;
      const dx = q.x - c.x, dy = (q.y - c.y) / 0.78;
      if (dx * dx + dy * dy < R2) s += p.air ? 0.6 : 1;
    }
    c.score = s;
  }
  const chosen = [];
  const want = level.slots;
  const pool = cands.slice();
  while (chosen.length < want && pool.length) {
    let best = null, bs = -1e9;
    for (const c of pool) {
      let crowd = 0;
      for (const o of chosen) { const d = Math.hypot(o.x - c.x, o.y - c.y); if (d < 210) crowd++; }
      const s = c.score - crowd * 9;
      if (s > bs) { bs = s; best = c; }
    }
    if (!best) break;
    chosen.push({ x: Math.round(best.x), y: Math.round(best.y) });
    for (let i = pool.length - 1; i >= 0; i--) if (Math.hypot(pool[i].x - best.x, pool[i].y - best.y) < 82) pool.splice(i, 1);
  }
  for (const s of level.extraSlots || []) chosen.push({ x: s[0], y: s[1] });
  return chosen;
}

export function inRange(ax, ay, bx, by, r) {
  const dx = bx - ax, dy = (by - ay) / 0.78;
  return dx * dx + dy * dy <= r * r;
}
