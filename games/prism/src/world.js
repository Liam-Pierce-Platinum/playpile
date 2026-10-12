// World rules shared by the game and the bot: obstacles are pure functions of
// time, so the bot can predict them exactly with the same advance().
export const W = 360, CX = 180;
export const R_BALL = 11, GRAV = 1250, JUMP = 410, DT = 1 / 120;
export const BELOW = 270;            // fall this far under the camera focus = dead
export const PICK = 13;              // pickup reach beyond the ball radius
export const GAP = 190;              // vertical space between obstacles
export const COLS = ['#28f0ff', '#ff2e93', '#ffe53b', '#9d5cff'];
export const COL_NAMES = ['cyan', 'pink', 'yellow', 'violet'];
const TAU = Math.PI * 2;

export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(a, r) {
  for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- primitives: arc band (k 0), capsule segment (k 1), axis rect (k 2), dot (k 3)
function arcs(out, cx, cy, R, th, ang, cols) {
  const span = TAU / cols.length;
  for (let i = 0; i < cols.length; i++) out.push({ k: 0, cx, cy, R, th, a0: ang + i * span, span, col: cols[i] });
}
function polygon(out, cx, cy, rad, th, ang, cols) {
  const n = cols.length, pts = [];
  for (let i = 0; i < n; i++) { const a = ang + i * TAU / n; pts.push([cx + Math.cos(a) * rad, cy + Math.sin(a) * rad]); }
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    out.push({ k: 1, x1: p[0], y1: p[1], x2: q[0], y2: q[1], th, col: cols[i] });
  }
}
function windmill(out, hx, hy, L, th, ang, cols) {
  for (let i = 0; i < 4; i++) {
    const a = ang + i * TAU / 4;
    out.push({ k: 1, x1: hx, y1: hy, x2: hx + Math.cos(a) * L, y2: hy + Math.sin(a) * L, th, col: cols[i], hub: true });
  }
}

function segDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  let u = l2 ? ((px - x1) * dx + (py - y1) * dy) / l2 : 0;
  u = u < 0 ? 0 : u > 1 ? 1 : u;
  return Math.hypot(px - (x1 + dx * u), py - (y1 + dy * u));
}

// distance from point to the primitive's surface (<= 0 means inside)
export function primDist(p, x, y) {
  switch (p.k) {
    case 0: {
      const dx = x - p.cx, dy = y - p.cy, d = Math.hypot(dx, dy);
      let rel = (Math.atan2(dy, dx) - p.a0) % TAU; if (rel < 0) rel += TAU;
      if (rel <= p.span) return Math.abs(d - p.R) - p.th / 2;
      // outside the angular range: distance to the two flat end caps
      let best = Infinity;
      for (const e of [p.a0, p.a0 + p.span]) {
        const c = Math.cos(e), s = Math.sin(e), r0 = p.R - p.th / 2, r1 = p.R + p.th / 2;
        best = Math.min(best, segDist(x, y, p.cx + c * r0, p.cy + s * r0, p.cx + c * r1, p.cy + s * r1));
      }
      return best;
    }
    case 1: return segDist(x, y, p.x1, p.y1, p.x2, p.y2) - p.th / 2;
    case 2: {
      const dx = Math.max(p.x1 - x, 0, x - p.x2), dy = Math.max(Math.abs(y - p.y) - p.th / 2, 0);
      return Math.hypot(dx, dy);
    }
    case 3: return Math.hypot(x - p.x, y - p.y) - p.r;
  }
  return Infinity;
}

// ---- obstacle catalogue
export const TYPES = ['ring', 'square', 'bars', 'cross', 'tri', 'dots', 'ring2', 'cross2'];
export function poolFor(n) {
  const pool = ['ring', 'square', 'bars'];
  if (n >= 2) pool.push('cross', 'tri');
  if (n >= 5) pool.push('dots', 'ring2');
  if (n >= 9) pool.push('cross2');
  return pool;
}

export function makeObstacle(type, cy, r, diff, speedMul) {
  const k = 1 + Math.min(diff, 30) * 0.02;
  const dir = r() < 0.5 ? -1 : 1;
  const w = (1.35 + r() * 0.35) * k * speedMul * dir;      // rad/s
  const ph = r() * TAU;
  const o = { type, cy, w, ph, cols: shuffle([0, 1, 2, 3], r) };
  switch (type) {
    case 'ring': o.R = 96 + r() * 12; o.th = 18; o.hh = o.R + 9;
      o.prims = (t, out) => arcs(out, CX, o.cy, o.R, o.th, o.ph + o.w * t, o.cols); break;
    case 'dots': o.R = 102; o.hh = o.R + 9;
      o.prims = (t, out) => {
        const a = o.ph + o.w * t, n = 36;
        for (let i = 0; i < n; i++) { const b = a + (i + 0.5) * TAU / n; out.push({ k: 3, x: CX + Math.cos(b) * o.R, y: o.cy + Math.sin(b) * o.R, r: 7.5, col: o.cols[(i / 9) | 0] }); }
      }; break;
    case 'ring2': o.th = 16; o.hh = 122 + 8; o.w *= 0.9;
      o.prims = (t, out) => {
        arcs(out, CX, o.cy, 122, o.th, o.ph + o.w * t, o.cols);
        // inner ring = mirror image of the outer one across the centre column,
        // so it spins the other way but shows the same colour where you cross
        const a = o.ph + o.w * t, span = TAU / 4;
        for (let i = 0; i < 4; i++) out.push({ k: 0, cx: CX, cy: o.cy, R: 80, th: o.th, a0: Math.PI - (a + i * span) - span, span, col: o.cols[i] });
      }; break;
    case 'square': o.rad = 92 * Math.SQRT2; o.th = 16; o.hh = o.rad + 8; o.w *= 0.85;
      o.prims = (t, out) => polygon(out, CX, o.cy, o.rad, o.th, o.ph + o.w * t, o.cols); break;
    case 'tri': o.cols = o.cols.slice(0, 3); o.rad = 128; o.th = 16; o.hh = o.rad + 8; o.w *= 0.8;
      o.prims = (t, out) => polygon(out, CX, o.cy, o.rad, o.th, o.ph + o.w * t, o.cols); break;
    case 'cross': o.side = r() < 0.5 ? -1 : 1; o.L = 92; o.th = 16; o.hh = o.L + 8; o.w *= 0.8;
      o.hx = CX + o.side * 74;
      o.prims = (t, out) => windmill(out, o.hx, o.cy, o.L, o.th, o.ph + o.w * t, o.cols); break;
    case 'cross2': o.L = 86; o.th = 16; o.hh = o.L + 8; o.w *= 0.75;
      o.prims = (t, out) => {
        const a = o.ph + o.w * t;
        windmill(out, CX - 90, o.cy, o.L, o.th, a, o.cols);
        // mirrored twin: arm i points at angle PI - (a + i*PI/2)
        for (let i = 0; i < 4; i++) {
          const b = Math.PI - (a + i * TAU / 4);
          out.push({ k: 1, x1: CX + 90, y1: o.cy, x2: CX + 90 + Math.cos(b) * o.L, y2: o.cy + Math.sin(b) * o.L, th: o.th, col: o.cols[i], hub: true });
        }
      }; break;
    case 'bars': {
      // two rows that mirror each other around the centre column, so the same
      // colour always meets in the middle: read it, then hop through both rows
      o.th = 18; o.hh = 58;
      o.v = (62 + r() * 18) * k * speedMul * dir; o.off = r() * W;
      o.prims = (t, out) => {
        const seg = W / 4, off = ((o.off + o.v * t) % W + W) % W;
        for (let i = -16; i < 20; i++) {           // wide enough for ultrawide screens
          const x1 = off + i * seg - W / 2;
          if (x1 > W * 4 || x1 + seg < -W * 3) continue;
          const col = o.cols[((i % 4) + 4) % 4];
          out.push({ k: 2, x1, x2: x1 + seg, y: o.cy + 48, th: o.th, col });
          out.push({ k: 2, x1: 2 * CX - x1 - seg, x2: 2 * CX - x1, y: o.cy - 48, th: o.th, col });
        }
      }; break;
    }
  }
  return o;
}

// gather primitives of every obstacle close to height y
const _buf = [];
export function primsNear(obs, t, y, pad = 30) {
  _buf.length = 0;
  for (const o of obs) if (Math.abs(o.cy - y) < o.hh + pad) o.prims(t, _buf);
  return _buf;
}

export const HIT = { pad: 0 };   // extra margin, used only by offline test models (tools/human.mjs)
export function hits(obs, t, x, y, col) {
  const ps = primsNear(obs, t, y);
  for (const p of ps) if (p.col !== col && primDist(p, x, y) < R_BALL - 1.5 + HIT.pad) return true;
  return false;
}

// one fixed step of the ball. st = { y, vy, col, started, t, focus, swId }
// returns 0 nothing, 1 picked a colour switch, -1 hit wrong colour, -2 fell
export function advance(st, obs, dt) {
  if (!st.started) return 0;          // obstacles hold still until the first tap
  st.t += dt;
  st.vy += GRAV * dt;
  if (st.vy > 900) st.vy = 900;
  st.y += st.vy * dt;
  let ev = 0;
  for (const o of obs) {
    if (o.sw && o.id >= st.swId && Math.abs(st.y - o.sw.y) < R_BALL + PICK) {
      st.col = o.sw.col; st.swId = o.id + 1; ev = 1;
    }
  }
  if (hits(obs, st.t, CX, st.y, st.col)) return -1;
  if (st.y < st.focus) st.focus = st.y;
  if (st.y > st.focus + BELOW) return -2;
  return ev;
}
