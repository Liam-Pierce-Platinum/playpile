// Autopilot used by the attract screen and the headless tests. It produces the same input
// object a player does (move vector + ACT/boost/ping), so it exercises the real controls.
import { TS, dist, clamp } from './util.js';
import { T, SOLID, toLocal, toWorld } from './ship.js';

const M = 16;
export function plan(w, s, sx, sy, gx, gy) {
  const GW = s.W + M * 2, GH = s.H + M * 2;
  const cell = (lx, ly) => [Math.floor((lx + s.W * TS / 2) / TS) + M, Math.floor((ly + s.H * TS / 2) / TS) + M];
  let [ax, ay] = cell(sx, sy); let [bx, by] = cell(gx, gy);
  if (ax < 0 || ay < 0 || ax >= GW || ay >= GH) return null;
  const beyond = bx < 0 || by < 0 || bx >= GW || by >= GH;
  bx = clamp(bx, 0, GW - 1); by = clamp(by, 0, GH - 1);
  const pass = new Int8Array(GW * GH);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) {
    const tx = x - M, ty = y - M; let p;
    if (tx >= 0 && ty >= 0 && tx < s.W && ty < s.H) { const t = s.tiles[ty * s.W + tx]; p = !SOLID[t] ? 1 : (t === T.HATCH || t === T.DEBRIS) ? 2 : 0; }
    else {
      const [wx, wy] = toWorld(s, (tx + 0.5) * TS - s.W * TS / 2, (ty + 0.5) * TS - s.H * TS / 2);
      p = wy > 5 && wy < w.floorY(wx) - 6 ? 1 : 0;
    }
    pass[y * GW + x] = p;
  }
  pass[ay * GW + ax] = 1;
  if (!pass[by * GW + bx]) pass[by * GW + bx] = 1;
  const prev = new Int32Array(GW * GH).fill(-1); const q = [ay * GW + ax]; prev[ay * GW + ax] = ay * GW + ax;
  const goal = by * GW + bx; let found = false;
  for (let h = 0; h < q.length; h++) {
    const c = q[h]; if (c === goal) { found = true; break; }
    const x = c % GW, y = (c / GW) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) continue;
      const n = ny * GW + nx; if (prev[n] >= 0 || !pass[n]) continue;
      if (dx && dy && (pass[y * GW + nx] !== 1 || pass[ny * GW + x] !== 1)) continue;
      prev[n] = c; q.push(n);
    }
  }
  if (!found) return { cells: [], beyond, fail: true };
  const cells = []; let c = goal;
  while (c !== prev[c]) { cells.push(c); c = prev[c]; }
  cells.reverse();
  return { cells: cells.map(c => { const x = c % GW - M, y = ((c / GW) | 0) - M; return { lx: (x + 0.5) * TS - s.W * TS / 2, ly: (y + 0.5) * TS - s.H * TS / 2, x, y, door: x >= 0 && y >= 0 && x < s.W && y < s.H && (s.tiles[y * s.W + x] === T.HATCH || s.tiles[y * s.W + x] === T.DEBRIS) }; }), beyond };
}

export function botThink(w, dt) {
  const b = w.botState || (w.botState = { t: 0, path: null, stuck: 0, px: 0, py: 0, jig: 0, jx: 0, jy: 0, goalKey: '' });
  const out = { mx: 0, my: 0, act: false, boost: false, ping: false, boostPressed: false };
  if (w.state !== 'play') return out;
  const d = w.diver, s = w.active;
  const open = w.survivors.filter(v => v.ship === s && (v.state === 'trapped' || v.state === 'holding'));
  const o2f = d.o2 / d.o2max;
  let goal;
  const bell = { key: 'bell', x: w.bell.x, y: w.bell.y + 4 };
  if (d.towed.length && (d.towed.length >= w.up.sled || !open.length)) goal = bell;
  else if ((d.inBell || d.atSurface) && o2f < 0.92 && !d.towed.length) goal = { key: 'stay', x: d.wx, y: d.wy, stay: true };
  else if (o2f < 0.3 && !d.headAir) goal = bell;
  else if (open.length) {
    let best = null, bd = 1e9;
    for (const v of open) { const dd = dist(v.wx, v.wy, d.wx, d.wy) - (v.state === 'holding' ? 150 : 0); if (dd < bd) { bd = dd; best = v; } }
    goal = { key: 'sv' + w.survivors.indexOf(best), x: best.wx, y: best.wy, sv: best };
  } else goal = bell;
  if (w.up.sonar > 0 && d.sonarCd <= 0 && open.length) out.ping = true;
  if (goal.stay) return out;
  b.t -= dt;
  if (b.t <= 0 || goal.key !== b.goalKey) {
    b.t = 0.3; b.goalKey = goal.key;
    const [sx, sy] = d.ship === s ? [d.lx, d.ly] : toLocal(s, d.wx, d.wy);
    const [gx, gy] = toLocal(s, goal.x, goal.y);
    b.path = plan(w, s, sx, sy, gx, gy);
  }
  let tx = goal.x, ty = goal.y, hold = false;
  if (b.path && b.path.cells.length) {
    const [dlx, dly] = d.ship === s ? [d.lx, d.ly] : toLocal(s, d.wx, d.wy);
    const cs = b.path.cells; let ni = 0, nd = 1e9;
    for (let i = 0; i < Math.min(cs.length, 10); i++) { const dd = Math.hypot(cs[i].lx - dlx, cs[i].ly - dly); if (dd < nd) { nd = dd; ni = i; } }
    let k = Math.min(ni + 1, cs.length - 1);
    for (let i = ni; i <= Math.min(ni + 2, cs.length - 1); i++) if (cs[i].door && s.tiles[cs[i].y * s.W + cs[i].x] !== T.HOPEN) { k = i; if (Math.hypot(cs[i].lx - dlx, cs[i].ly - dly) < 13) hold = true; break; }
    const c = cs[k];
    if (k === cs.length - 1 && !b.path.beyond) [tx, ty] = [goal.x, goal.y]; else [tx, ty] = toWorld(s, c.lx, c.ly);
    if (b.path.beyond && k === cs.length - 1) [tx, ty] = [goal.x, goal.y];
  }
  if (hold) { out.act = true; return out; }
  if (goal.sv && dist(goal.x, goal.y, d.wx, d.wy) < 12) { out.act = true; return out; }
  let dx = tx - d.wx, dy = ty - d.wy; const l = Math.hypot(dx, dy) || 1;
  out.mx = dx / l; out.my = dy / l;
  // stuck handling
  b.stuck += dt;
  if (b.stuck > 1.2) { if (dist(b.px, b.py, d.wx, d.wy) < 4) { b.jig = 0.5; b.jx = Math.random() - 0.5; b.jy = Math.random() - 0.5; } b.px = d.wx; b.py = d.wy; b.stuck = 0; }
  if (b.jig > 0) { b.jig -= dt; out.mx = b.jx * 2; out.my = b.jy * 2; }
  if (l > 120 && o2f > 0.5 && !d.towed.length) out.boost = Math.random() < 0.02;
  return out;
}
