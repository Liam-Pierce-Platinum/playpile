// Fixed-step ball physics. Pure functions of (world, ball, time) so the game, the ghost bots
// and the headless solver all see exactly the same course.
export const R = 8;            // ball radius
export const RAIL = 7;         // half thickness of every rail / block edge
export const CUP_R = 13;
export const DT = 1 / 120;
export const MAXV = 1300;      // full-power putt speed (units / s)
const E_WALL = 0.68;
const BLADE = 5;               // windmill blade half thickness

export function shapeIn(s, x, y) {
  if (s.c) { const dx = x - s.c[0], dy = y - s.c[1]; return dx * dx + dy * dy < s.c[2] * s.c[2]; }
  return polyIn(s, x, y);
}
export function polyIn(p, x, y) {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const inRect = (r, x, y) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];

function polySegs(p, out) {
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    out.push(seg(a[0], a[1], b[0], b[1]));
  }
}
function seg(ax, ay, bx, by) {
  const m = RAIL + R + 2;
  return { ax, ay, bx, by, x0: Math.min(ax, bx) - m, x1: Math.max(ax, bx) + m, y0: Math.min(ay, by) - m, y1: Math.max(ay, by) + m };
}

export function buildWorld(def, index = 0) {
  const w = {
    def, index, par: def.par, name: def.name,
    tee: def.tee, cup: def.cup,
    green: def.green, blocks: def.blocks || [], bumpers: (def.bumpers || []).map(([x, y, r]) => ({ x, y, r })),
    water: def.water || [], sand: def.sand || [], belts: def.belts || [], ramps: def.ramps || [],
    bowls: def.bowls || [], portals: def.portals || [], mills: (def.mills || []).map((m) => ({ hub: 14, ...m })),
    movers: def.movers || [], segs: [],
  };
  polySegs(w.green, w.segs);
  for (const b of w.blocks) polySegs(b, w.segs);
  // bounds (for the camera)
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  const grow = (x, y, m = 0) => { x0 = Math.min(x0, x - m); y0 = Math.min(y0, y - m); x1 = Math.max(x1, x + m); y1 = Math.max(y1, y + m); };
  for (const [x, y] of w.green) grow(x, y, RAIL + 4);
  // the camera frames the railed course only; windmill blades are clipped to it when drawn
  w.camBounds = { x0, y0, x1, y1 };
  for (const m of w.mills) grow(m.c[0], m.c[1], m.len + 8);
  w.bounds = { x0, y0, x1, y1 };
  return w;
}

export function moverAt(m, t) {
  const k = (1 - Math.cos(2 * Math.PI * (t / m.T + m.ph))) / 2;
  const dk = (Math.PI / m.T) * Math.sin(2 * Math.PI * (t / m.T + m.ph));
  return { x: m.a[0] + (m.b[0] - m.a[0]) * k, y: m.a[1] + (m.b[1] - m.a[1]) * k, vx: (m.b[0] - m.a[0]) * dk, vy: (m.b[1] - m.a[1]) * dk };
}

export function newBall(x, y) {
  return { x, y, vx: 0, vy: 0, rest: true, slow: 0, sunk: false, water: false, portalLock: -1, lieX: x, lieY: y, onSand: false, timeMoving: 0 };
}

// Collide ball with a capsule (segment + radius rr). wall velocity (vwx, vwy) at contact.
function hitSeg(b, ax, ay, bx, by, rr, vwx, vwy, e, ev, kind) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((b.x - ax) * dx + (b.y - ay) * dy) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + dx * t, py = ay + dy * t;
  let nx = b.x - px, ny = b.y - py;
  const d2 = nx * nx + ny * ny;
  if (d2 >= rr * rr) return 0;
  let d = Math.sqrt(d2);
  if (d < 1e-6) { const l = Math.sqrt(l2) || 1; nx = -dy / l; ny = dx / l; d = 1; } else { nx /= d; ny /= d; }
  b.x = px + nx * rr; b.y = py + ny * rr;
  const rvx = b.vx - vwx, rvy = b.vy - vwy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    let tvx = rvx - vn * nx, tvy = rvy - vn * ny;
    tvx *= 0.96; tvy *= 0.96;
    b.vx = tvx - vn * e * nx + vwx; b.vy = tvy - vn * e * ny + vwy;
    if (ev && -vn > 40) ev.push({ type: kind || 'wall', x: px, y: py, nx, ny, p: -vn });
    return -vn;
  }
  return 0;
}

// One fixed step for one ball at world time t. ev: optional event array.
export function stepBall(w, b, t, ev) {
  if (b.sunk || b.water) return;
  let ax = 0, ay = 0, onSand = false, belt = null, zone = false;
  for (const s of w.sand) if (shapeIn(s, b.x, b.y)) { onSand = true; break; }
  for (const r of w.ramps) if (inRect(r.r, b.x, b.y)) { ax += r.d[0] * r.a; ay += r.d[1] * r.a; zone = true; }
  for (const bw of w.bowls) {
    const dx = bw.c[0] - b.x, dy = bw.c[1] - b.y, d = Math.hypot(dx, dy);
    if (d < bw.r && d > 1) { const k = bw.a * Math.min(1, d / 40); ax += (dx / d) * k; ay += (dy / d) * k; zone = true; }
  }
  for (const be of w.belts) if (inRect(be.r, b.x, b.y)) { belt = be; break; }
  if (ev && onSand && !b.onSand && Math.hypot(b.vx, b.vy) > 60) ev.push({ type: 'sand', x: b.x, y: b.y });
  b.onSand = onSand;

  b.vx += ax * DT; b.vy += ay * DT;
  // friction acts on velocity relative to the surface (a belt drags the ball along)
  const sx = belt ? belt.d[0] * belt.s : 0, sy = belt ? belt.d[1] * belt.s : 0;
  let rvx = b.vx - sx, rvy = b.vy - sy;
  const rs = Math.hypot(rvx, rvy);
  if (rs > 0) {
    const dec = (onSand ? 1500 + 3.2 * rs : belt ? 700 + 1.5 * rs : 220 + 0.6 * rs) * DT;
    const ns = Math.max(0, rs - dec);
    rvx *= ns / rs; rvy *= ns / rs;
  }
  b.vx = rvx + sx; b.vy = rvy + sy;

  // cup pull
  const cdx = w.cup[0] - b.x, cdy = w.cup[1] - b.y, cd = Math.hypot(cdx, cdy);
  if (cd < CUP_R + 3 && cd > 0.5) { b.vx += (cdx / cd) * 1300 * DT; b.vy += (cdy / cd) * 1300 * DT; }

  b.x += b.vx * DT; b.y += b.vy * DT;

  // collisions
  const rr = R + RAIL;
  for (let i = 0; i < w.segs.length; i++) {
    const s = w.segs[i];
    if (b.x < s.x0 || b.x > s.x1 || b.y < s.y0 || b.y > s.y1) continue;
    hitSeg(b, s.ax, s.ay, s.bx, s.by, rr, 0, 0, E_WALL, ev);
  }
  for (let i = 0; i < w.movers.length; i++) {
    const m = w.movers[i], p = moverAt(m, t);
    const hx = m.w / 2, hy = m.h / 2;
    if (b.x < p.x - hx - rr || b.x > p.x + hx + rr || b.y < p.y - hy - rr || b.y > p.y + hy + rr) continue;
    const c = [[p.x - hx, p.y - hy], [p.x + hx, p.y - hy], [p.x + hx, p.y + hy], [p.x - hx, p.y + hy]];
    for (let k = 0; k < 4; k++) { const a = c[k], q = c[(k + 1) % 4]; hitSeg(b, a[0], a[1], q[0], q[1], rr, p.vx, p.vy, E_WALL, ev); }
  }
  for (let i = 0; i < w.mills.length; i++) {
    const m = w.mills[i];
    const dx = b.x - m.c[0], dy = b.y - m.c[1];
    if (dx * dx + dy * dy > (m.len + rr) * (m.len + rr)) continue;
    for (let k = 0; k < m.n; k++) {
      const th = m.w * t + (k * 2 * Math.PI) / m.n;
      const cx = Math.cos(th), sy = Math.sin(th);
      // contact point velocity: omega x r, evaluated at the ball's projection on the blade
      const along = Math.max(0, Math.min(m.len, dx * cx + dy * sy));
      const vwx = -m.w * along * sy, vwy = m.w * along * cx;
      hitSeg(b, m.c[0], m.c[1], m.c[0] + cx * m.len, m.c[1] + sy * m.len, R + BLADE, vwx, vwy, 0.6, ev, 'blade');
    }
    // hub
    hitCircle(b, m.c[0], m.c[1], m.hub, 0.6, ev, 'wall');
  }
  // rails always win: a blade or slider can never shove the ball through a wall
  if (w.mills.length || w.movers.length) {
    for (let i = 0; i < w.segs.length; i++) {
      const s = w.segs[i];
      if (b.x < s.x0 || b.x > s.x1 || b.y < s.y0 || b.y > s.y1) continue;
      hitSeg(b, s.ax, s.ay, s.bx, s.by, rr, 0, 0, E_WALL, null);
    }
    if (!polyIn(w.green, b.x, b.y) || w.blocks.some((p) => polyIn(p, b.x, b.y))) {
      b.water = true; b.out = true; b.vx = b.vy = 0;
      if (ev) ev.push({ type: 'out', x: b.x, y: b.y });
      return;
    }
  }
  for (let i = 0; i < w.bumpers.length; i++) {
    const bu = w.bumpers[i];
    if (hitCircle(b, bu.x, bu.y, bu.r, 1.0, ev, 'bumper', i)) {
      // kick: bumpers always send it away with some pace
      const dx = b.x - bu.x, dy = b.y - bu.y, d = Math.hypot(dx, dy) || 1;
      const vn = (b.vx * dx + b.vy * dy) / d;
      if (vn < 380) { b.vx += (dx / d) * (380 - vn); b.vy += (dy / d) * (380 - vn); }
    }
  }

  // portals
  for (let i = 0; i < w.portals.length; i++) {
    const pt = w.portals[i];
    for (let side = 0; side < 2; side++) {
      const P = side ? pt.b : pt.a, Q = side ? pt.a : pt.b;
      const key = i * 2 + side;
      const dx = b.x - P[0], dy = b.y - P[1], d2 = dx * dx + dy * dy;
      if (b.portalLock === key) { if (d2 > 26 * 26) b.portalLock = -1; continue; }
      if (d2 < 13 * 13 && b.portalLock !== key) {
        b.x = Q[0]; b.y = Q[1]; b.portalLock = i * 2 + (1 - side);
        if (Math.hypot(b.vx, b.vy) < 120) { const s = Math.hypot(b.vx, b.vy) || 1; b.vx = (b.vx / s) * 120; b.vy = (b.vy / s) * 120; }
        if (ev) ev.push({ type: 'portal', x: P[0], y: P[1], x2: Q[0], y2: Q[1], i });
        side = 2; i = w.portals.length; break;
      }
    }
  }

  // water
  for (const s of w.water) if (shapeIn(s, b.x, b.y)) {
    b.water = true; b.vx = b.vy = 0;
    if (ev) ev.push({ type: 'splash', x: b.x, y: b.y });
    return;
  }

  // cup
  const sp = Math.hypot(b.vx, b.vy);
  const ex = b.x - w.cup[0], ey = b.y - w.cup[1], ed = Math.hypot(ex, ey);
  if (ed < CUP_R * 0.75) {
    if (sp < 420) {
      b.sunk = true; b.x = w.cup[0]; b.y = w.cup[1]; b.vx = b.vy = 0;
      if (ev) ev.push({ type: 'sink', x: b.x, y: b.y, p: sp });
      return;
    } else if (ed < CUP_R * 0.5 && !b.lipped) {
      // lip out: deflect and lose pace
      const side = (ex * b.vy - ey * b.vx) >= 0 ? 1 : -1;
      const a = 0.35 * side, c = Math.cos(a), s = Math.sin(a);
      const nvx = (b.vx * c - b.vy * s) * 0.7, nvy = (b.vx * s + b.vy * c) * 0.7;
      b.vx = nvx; b.vy = nvy; b.lipped = true;
      if (ev) ev.push({ type: 'lip', x: b.x, y: b.y });
    }
  } else if (ed > CUP_R + 4) b.lipped = false;

  // rest
  const s2 = Math.hypot(b.vx, b.vy);
  if (s2 < 7) {
    b.slow += DT;
    if (b.slow > 0.2) { b.vx = b.vy = 0; if (!b.rest && ev) ev.push({ type: 'rest' }); b.rest = true; }
  } else {
    b.slow = 0;
    if (b.rest && s2 > 25) b.rest = false;
    if (!b.rest) b.timeMoving += DT;
  }
  // safety: a shot never lasts more than 14 s
  if (!b.rest && b.timeMoving > 14) { b.vx = b.vy = 0; b.rest = true; if (ev) ev.push({ type: 'rest' }); }
}

function hitCircle(b, cx, cy, r, e, ev, kind, idx) {
  const dx = b.x - cx, dy = b.y - cy, rr = r + R;
  const d2 = dx * dx + dy * dy;
  if (d2 >= rr * rr) return false;
  const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
  b.x = cx + nx * rr; b.y = cy + ny * rr;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + e) * vn * nx; b.vy -= (1 + e) * vn * ny;
    if (ev && (-vn > 30 || kind === 'bumper')) ev.push({ type: kind, x: cx + nx * r, y: cy + ny * r, nx, ny, p: -vn, i: idx });
  }
  return true;
}

export function shootBall(b, ang, power) {
  const v = MAXV * Math.max(0.03, Math.min(1, power));
  b.vx = Math.cos(ang) * v; b.vy = Math.sin(ang) * v;
  b.rest = false; b.slow = 0; b.timeMoving = 0; b.lieX = b.x; b.lieY = b.y; b.lipped = false;
}

// Simulate one shot to the end. Returns the final ball and the time used.
export function simulate(w, ball, t0, ang, power, maxT = 12) {
  const b = { ...ball };
  shootBall(b, ang, power);
  let t = t0;
  const n = Math.ceil(maxT / DT);
  for (let i = 0; i < n; i++) {
    stepBall(w, b, t, null);
    t += DT;
    if (b.sunk || b.water || b.rest) break;
  }
  return { b, t: t - t0 };
}
