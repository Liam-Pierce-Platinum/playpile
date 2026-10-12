// Shot planner: a walking-distance field to the cup (Dijkstra on a grid, portals included)
// plus a search over (angle, power) using the real physics. Used by the ghost golfers and
// by the headless test bot.
import { R, RAIL, polyIn, shapeIn, simulate } from './physics.js';

const CELL = 8;

export function distField(w) {
  if (w._field) return w._field;
  const { x0, y0, x1, y1 } = w.bounds;
  const W = Math.ceil((x1 - x0) / CELL) + 1, H = Math.ceil((y1 - y0) / CELL) + 1;
  const free = new Uint8Array(W * H);
  const clear = R + RAIL - 1;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + i * CELL, y = y0 + j * CELL;
    if (!polyIn(w.green, x, y)) continue;
    let ok = true;
    for (const b of w.blocks) if (polyIn(b, x, y)) { ok = false; break; }
    if (ok) for (const s of w.segs) { if (segDist(x, y, s) < clear) { ok = false; break; } }
    if (ok) for (const s of w.water) if (shapeIn(s, x, y)) { ok = false; break; }
    if (ok) for (const b of w.bumpers) if (Math.hypot(x - b.x, y - b.y) < b.r + R) { ok = false; break; }
    free[j * W + i] = ok ? 1 : 0;
  }
  const dist = new Float64Array(W * H).fill(Infinity);
  const idx = (x, y) => { const i = Math.round((x - x0) / CELL), j = Math.round((y - y0) / CELL); return i < 0 || j < 0 || i >= W || j >= H ? -1 : j * W + i; };
  const heap = [];
  const push = (k, d) => { if (k < 0 || d >= dist[k]) return; dist[k] = d; heap.push([d, k]); up(heap, heap.length - 1); };
  const run = () => {
    while (heap.length) {
      const [d, k] = pop(heap);
      if (d > dist[k]) continue;
      const i = k % W, j = (k / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue;
        const nk = nj * W + ni;
        if (!free[nk]) continue;
        const nd = d + (di && dj ? 1.4142 : 1) * CELL * (sandAt(w, x0 + ni * CELL, y0 + nj * CELL) ? 1.6 : 1);
        if (nd < dist[nk]) { dist[nk] = nd; heap.push([nd, nk]); up(heap, heap.length - 1); }
      }
    }
  };
  // seed the cup (and the cells around it)
  for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
    const k = idx(w.cup[0] + di * CELL, w.cup[1] + dj * CELL);
    if (k >= 0) push(k, Math.hypot(di, dj) * CELL);
  }
  run();
  for (let pass = 0; pass < 3; pass++) {
    for (const p of w.portals) {
      const ka = idx(p.a[0], p.a[1]), kb = idx(p.b[0], p.b[1]);
      if (ka < 0 || kb < 0) continue;
      if (dist[kb] + 20 < dist[ka]) { for (const k of around(ka, W, H)) push(k, dist[kb] + 10); }
      if (dist[ka] + 20 < dist[kb]) { for (const k of around(kb, W, H)) push(k, dist[ka] + 10); }
    }
    run();
  }
  w._field = { W, H, x0, y0, dist, free };
  return w._field;
}
function around(k, W, H) { const i = k % W, j = (k / W) | 0, out = []; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const ni = i + di, nj = j + dj; if (ni >= 0 && nj >= 0 && ni < W && nj < H) out.push(nj * W + ni); } return out; }
function sandAt(w, x, y) { for (const s of w.sand) if (shapeIn(s, x, y)) return true; return false; }
function segDist(x, y, s) {
  const dx = s.bx - s.ax, dy = s.by - s.ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - s.ax) * dx + (y - s.ay) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - s.ax - dx * t, y - s.ay - dy * t);
}
function up(h, i) { while (i > 0) { const p = (i - 1) >> 1; if (h[p][0] <= h[i][0]) break; [h[p], h[i]] = [h[i], h[p]]; i = p; } }
function pop(h) {
  const top = h[0], last = h.pop();
  if (h.length) {
    h[0] = last; let i = 0;
    for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < h.length && h[l][0] < h[m][0]) m = l; if (r < h.length && h[r][0] < h[m][0]) m = r; if (m === i) break; [h[m], h[i]] = [h[i], h[m]]; i = m; }
  }
  return top;
}

export function fieldAt(w, x, y) {
  const f = distField(w);
  let best = Infinity;
  const i0 = Math.round((x - f.x0) / CELL), j0 = Math.round((y - f.y0) / CELL);
  for (let r = 0; r <= 3 && best === Infinity; r++) {
    for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= f.W || j >= f.H) continue;
      const d = f.dist[j * f.W + i] + Math.hypot(di, dj) * CELL;
      if (d < best) best = d;
    }
  }
  return best === Infinity ? 5000 : best;
}

function score(w, res) {
  if (res.b.sunk) return -10000 + res.t * 10;
  if (res.b.water) return res.b.out ? 5000 + fieldAt(w, res.b.lieX, res.b.lieY) : 50000;
  return fieldAt(w, res.b.x, res.b.y) + (res.b.onSand ? 40 : 0);
}

// Generator: yields while working (so the game can spread it over frames), returns {ang, power}.
export function* plan(w, ball, t0) {
  const cand = [];
  const direct = Math.atan2(w.cup[1] - ball.y, w.cup[0] - ball.x);
  const powers = [0.14, 0.26, 0.4, 0.56, 0.74, 0.92];
  let n = 0;
  const angles = [];
  for (let k = 0; k < 72; k++) angles.push((k / 72) * Math.PI * 2);
  for (let k = -4; k <= 4; k++) angles.push(direct + k * 0.025);
  for (const a of angles) for (const p of powers) {
    const res = simulate(w, ball, t0, a, p, 7);
    cand.push({ a, p, s: score(w, res) });
    if (++n % 24 === 0) yield n;
  }
  cand.sort((x, y) => x.s - y.s);
  let best = cand[0];
  // refine around the top few
  const tops = cand.slice(0, 3);
  for (const c of tops) {
    for (let da = -3; da <= 3; da++) for (let dp = -2; dp <= 2; dp++) {
      const a = c.a + da * 0.012, p = Math.max(0.04, Math.min(1, c.p + dp * 0.05));
      const res = simulate(w, ball, t0, a, p);
      const s = score(w, res);
      if (s < best.s) best = { a, p, s };
      if (++n % 24 === 0) yield n;
    }
  }
  // robustness: prefer a sinking shot whose neighbours also sink
  return { ang: best.a, power: best.p, s: best.s };
}

export function planSync(w, ball, t0) {
  const g = plan(w, ball, t0);
  let r = g.next();
  while (!r.done) r = g.next();
  return r.value;
}
