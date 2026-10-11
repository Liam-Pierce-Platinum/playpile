// Chunk generators. Every chunk is built PATH FIRST: a zig-zag "safe line"
// with the same 45 degree slope the arrow flies (63 degrees when mini) is laid
// down, turning on half-beats, and then walls, spikes and saws are placed
// around it with at least CLR units of vertical clearance. So every course has
// a fair line by construction, and the bot (and the fairness sim) just follows it.
import { H, BEAT, clamp, lerp, smooth } from './util.js';

export const LEN = 8 * BEAT;      // standard chunk = 8 beats = 2 bars
export const CLR = 27;            // min vertical clearance from the safe line (normal size)
export const CLR_MINI = 17;
const TOP = 14, BOT = H - 14;     // walls never leave this band

// ---------------------------------------------------------------- path helpers
function zigPath(ctx, len, ks, unitX, lo = ctx.lo, hi = ctx.hi) {
  const m = ctx.mini ? 2 : 1;
  const x1 = ctx.x + len;
  const pts = [[ctx.x, ctx.y]];
  let x = ctx.x, y = ctx.y, dir = ctx.dir;
  let guard = 0;
  while (x < x1 - 0.5 && guard++ < 400) {
    let L = ctx.rng.pick(ks) * unitX;
    let room = dir < 0 ? (y - lo) / m : (hi - y) / m;
    if (room < unitX * 0.5) { dir = -dir; room = dir < 0 ? (y - lo) / m : (hi - y) / m; }
    L = Math.max(4, Math.min(L, room, x1 - x));
    x += L; y += dir * m * L;
    pts.push([x, y]);
    dir = -dir;
  }
  ctx.x = x; ctx.y = y; ctx.dir = dir;
  return pts;
}
function pathYAt(pts, x) {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x <= b[0]) return b[0] > a[0] ? a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]) : b[1];
  }
  return pts[pts.length - 1][1];
}
function pathRange(pts, x0, x1) {
  let mn = Math.min(pathYAt(pts, x0), pathYAt(pts, x1)), mx = Math.max(pathYAt(pts, x0), pathYAt(pts, x1));
  for (const p of pts) if (p[0] > x0 && p[0] < x1) { mn = Math.min(mn, p[1]); mx = Math.max(mx, p[1]); }
  return [mn, mx];
}
function pathDist(pts, x, y) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b[0] < x - 400 || a[0] > x + 400) continue;
    const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
    let t = l2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0; t = clamp(t, 0, 1);
    best = Math.min(best, Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t));
  }
  return best;
}
function commitPath(ctx, pts) { for (const p of pts) ctx.c.addPath(p[0], p[1]); }
const wallC = (ctx, x, y) => ctx.c.addCeil(x, clamp(y, TOP, BOT - 40));
const wallF = (ctx, x, y) => ctx.c.addFloor(x, clamp(y, TOP + 40, BOT));

// spike helper: base on floor (up=false: points up from the floor) or ceiling
function spike(ctx, x, w, baseY, h, fromCeil) {
  const tipY = fromCeil ? baseY + h : baseY - h;
  ctx.c.addObs({ type: 'spike', pts: [x, baseY, x + w / 2, tipY, x + w, baseY], tip: [x + w / 2, tipY], ceil: fromCeil });
}

// ---------------------------------------------------------------- chunks
// Wide flat tunnel with gentle mounds that sit just off the safe line, so
// following the line naturally teaches grazing.
// The last TAPER units funnel the wide tunnel down to the gap the next chunk
// will use (ctx.nextGap, default 95 each side of the safe line) so the course
// never steps from a 380-unit tunnel to a 160-unit one at a vertical face.
export const TEACH_TAPER = 2 * BEAT;
export const MOUND_CLR = 22;       // mound apex clearance from the safe line: inside the 27-unit graze reach, so simply following the line grazes (hitbox 5 -> 17 units of lean)
export function teach(ctx, len) {
  const x0 = ctx.x;
  const pts = zigPath(ctx, len, [3, 4, 4], BEAT / 2, 130, 320);
  commitPath(ctx, pts);
  const ctop = 34, cbot = H - 34;
  const x1 = ctx.x, taper = Math.min(TEACH_TAPER, (x1 - x0) * 0.5), xs = x1 - taper, gap = ctx.nextGap || 95;
  wallC(ctx, x0, ctop); wallF(ctx, x0, cbot);
  for (let i = 1; i < pts.length - 1; i++) {
    const [vx, vy] = pts[i];
    const top = pts[i - 1][1] > vy; // local minimum y = peak near the ceiling
    if (vx - 80 < x0 + 40 || vx + 80 > xs - 20) continue;
    const apex = top ? vy - MOUND_CLR : vy + MOUND_CLR;
    const N = 10;
    for (let k = 0; k <= N; k++) {
      const u = k / N, dx = (u - 0.5) * 150;
      const b = 0.5 + 0.5 * Math.cos(Math.PI * (u - 0.5) * 2);
      if (top) wallC(ctx, vx + dx, lerp(ctop, apex, b)); else wallF(ctx, vx + dx, lerp(cbot, apex, b));
    }
  }
  // funnel: walls ease from the flat tunnel onto (safe line +- gap), sampled
  // at the path vertices and every 40 units so the clearance holds everywhere
  const sx = new Set([xs, x1]);
  for (let x = xs + 40; x < x1; x += 40) sx.add(x);
  for (const [px] of pts) if (px > xs && px < x1) sx.add(px);
  for (const x of [...sx].sort((a, b) => a - b)) {
    const u = smooth((x - xs) / taper), y = pathYAt(pts, x);
    wallC(ctx, x, lerp(ctop, y - gap, u)); wallF(ctx, x, lerp(cbot, y + gap, u));
  }
}

// Classic wave tunnel: walls run parallel to the zig-zag.
export function zig(ctx, d, o = {}) {
  const x0 = ctx.x;
  const unit = ctx.mini ? BEAT / 4 : BEAT / 2;
  const ks = o.ks || (d < 0.4 ? [1, 2, 2, 3] : [1, 1, 2, 3]);
  let gMin, gMax;
  if (ctx.mini) { gMin = lerp(48, 37, d); gMax = lerp(62, 44, d); }
  else if (o.narrow) { gMin = lerp(37, 31, d); gMax = lerp(42, 34, d); }
  else if (o.gap) { [gMin, gMax] = o.gap; }
  else { gMin = lerp(70, 38, d); gMax = lerp(110, 52, d); }
  // keep the line where its designed gap fits inside the wall band: otherwise the
  // ceiling/floor clamp at TOP/BOT pinches a "wide" tunnel to ~40 units at every peak
  const lo = Math.max(ctx.lo, TOP + gMin), hi = Math.min(ctx.hi, BOT - gMin);
  const pts = zigPath(ctx, o.len || LEN, ks, unit, lo, hi);
  commitPath(ctx, pts);
  const flat = !o.narrow && ctx.rng.chance(0.3) ? (ctx.rng.chance(0.5) ? 'top' : 'bot') : '';
  const [mn, mx] = pathRange(pts, x0, ctx.x);
  for (const [x, y] of pts) {
    const ht = ctx.rng.range(gMin, gMax), hb = ctx.rng.range(gMin, gMax);
    wallC(ctx, x, flat === 'top' ? mn - gMax : y - ht);
    wallF(ctx, x, flat === 'bot' ? mx + gMax : y + hb);
  }
}

// Sine pipe: a smooth tube; its centre line is the safe line (slope < 1).
export function sine(ctx, d) {
  const x0 = ctx.x, y0 = ctx.y, len = LEN;
  const A = ctx.rng.range(lerp(50, 80, d), lerp(80, 120, d));
  const lam = Math.max(A * 2 * Math.PI / 0.42, 360);
  const nW = Math.max(1, Math.round(len / lam));
  const lamR = len / nW;
  const mid = clamp(H / 2 + ctx.rng.range(-30, 30), ctx.lo + A, ctx.hi - A);
  const gap = lerp(170, 92, d);
  const sgn = ctx.rng.chance(0.5) ? 1 : -1;
  const step = 16;
  for (let x = 0; x <= len + 0.1; x += step) {
    const u = x / len;
    const yc0 = lerp(y0, mid, smooth(u / 0.6)) + sgn * A * Math.sin((2 * Math.PI * x) / lamR) * smooth(u / 0.15);
    const yc = clamp(yc0, ctx.lo, ctx.hi);
    ctx.c.addPath(x0 + x, yc);
    const wob = 6 * Math.sin(x * 0.05);
    wallC(ctx, x0 + x, yc - gap / 2 - wob);
    wallF(ctx, x0 + x, yc + gap / 2 - wob);
    ctx.y = yc;
  }
  ctx.x = x0 + len;
  ctx.dir = ctx.rng.chance(0.5) ? 1 : -1;
}

// flat corridor helper
function corridor(ctx, x0, x1, ctop, cbot) {
  wallC(ctx, x0, ctop); wallC(ctx, x1, ctop);
  wallF(ctx, x0, cbot); wallF(ctx, x1, cbot);
}

// Blocky cave walls that hug the safe line: per grid step the ceiling sits
// gap units above the highest point of the line near that step (padded so
// step corners stay clear too), the floor likewise below the lowest point.
function envelope(ctx, pts, x0, x1, gMin, gMax, step, changeP = 0.3) {
  const ceil = [], floor = [];
  let gc = ctx.rng.range(gMin, gMax), gf = ctx.rng.range(gMin, gMax);
  for (let a = x0; a < x1 - 0.5; a += step) {
    const b = Math.min(x1, a + step);
    if (ctx.rng.chance(changeP)) gc = ctx.rng.range(gMin, gMax);
    if (ctx.rng.chance(changeP)) gf = ctx.rng.range(gMin, gMax);
    const [mn, mx] = pathRange(pts, a - 30, b + 30);
    ceil.push([a, b, Math.max(TOP, mn - gc)]);
    floor.push([a, b, Math.min(BOT, mx + gf)]);
  }
  return { ceil, floor };
}
function emit(ctx, segs, isCeil) {
  const add = isCeil ? wallC : wallF;
  let cur = null;
  for (const [a, b, y] of segs) {
    if (cur && Math.abs(cur[2] - y) < 0.5) { cur[1] = b; continue; }
    if (cur) { add(ctx, cur[0], cur[2]); add(ctx, cur[1], cur[2]); }
    cur = [a, b, y];
  }
  if (cur) { add(ctx, cur[0], cur[2]); add(ctx, cur[1], cur[2]); }
}

// Spike rows sitting on blocky steps, as tall as the safe line allows.
export function spikes(ctx, d) {
  const x0 = ctx.x;
  const pts = zigPath(ctx, LEN, d < 0.5 ? [2, 3, 3] : [1, 2, 3], BEAT / 2, 80, H - 80);
  commitPath(ctx, pts);
  const gMin = CLR + lerp(55, 32, d), gMax = gMin + lerp(70, 45, d);
  const env = envelope(ctx, pts, x0, ctx.x, gMin, gMax, BEAT / 2, 0.45);
  emit(ctx, env.ceil, true); emit(ctx, env.floor, false);
  const clr = CLR + lerp(12, 0, d);
  const p = lerp(0.45, 0.8, d);
  for (const fromCeil of [true, false]) {
    for (const [a, b, y] of fromCeil ? env.ceil : env.floor) {
      if (a < x0 + 40 || !ctx.rng.chance(p)) continue;
      const n = ctx.rng.int(2, 3), w = (b - a) / n;
      for (let k = 0; k < n; k++) {
        const sx = a + k * w;
        const [mn, mx] = pathRange(pts, sx - 18, sx + w + 18);
        const room = fromCeil ? (mn - clr) - y : y - (mx + clr);
        const h = Math.min(room, ctx.rng.range(lerp(30, 50, d), lerp(70, 130, d)));
        if (h >= 16) spike(ctx, sx, w, y, h, fromCeil);
      }
    }
  }
}

// Spinning saws: half-buried in the cave walls and floating in the gaps.
export function saws(ctx, d) {
  const x0 = ctx.x;
  const pts = zigPath(ctx, LEN, [2, 2, 3, 4], BEAT / 2, 80, H - 80);
  commitPath(ctx, pts);
  const gMin = lerp(95, 62, d), gMax = gMin + 70;
  const env = envelope(ctx, pts, x0, ctx.x, gMin, gMax, BEAT / 2, 0.4);
  emit(ctx, env.ceil, true); emit(ctx, env.floor, false);
  const clr = CLR + lerp(12, 0, d);
  const placed = [];
  const fits = (x, y, r) => pathDist(pts, x, y) >= r + clr && !placed.some((s) => Math.hypot(s.x - x, s.y - y) < s.r + r + 24);
  const add = (x, y, r) => { const s = { type: 'saw', x, y, r, spin: ctx.rng.chance(0.5) ? 1 : -1 }; placed.push(s); ctx.c.addObs(s); };
  // buried in the walls
  for (const fromCeil of [true, false]) {
    for (const [a, b, y] of fromCeil ? env.ceil : env.floor) {
      if (a < x0 + 40 || !ctx.rng.chance(lerp(0.35, 0.6, d))) continue;
      const x = (a + b) / 2 + ctx.rng.range(-15, 15);
      let r = ctx.rng.range(26, lerp(46, 58, d));
      const room = pathDist(pts, x, y) - clr;
      r = Math.min(r, room);
      if (r >= 18 && fits(x, y, r)) add(x, y, r);
    }
  }
  // floating
  const want = Math.round(lerp(2, 6, d));
  for (let tries = 0, n = 0; tries < 200 && n < want; tries++) {
    const r = ctx.rng.range(18, lerp(34, 46, d));
    const x = ctx.rng.range(x0 + 60, ctx.x - 60);
    const seg = env.ceil.find((s) => x >= s[0] && x < s[1]), segF = env.floor.find((s) => x >= s[0] && x < s[1]);
    if (!seg || !segF) continue;
    const y = ctx.rng.range(seg[2] + r * 0.5, segF[2] - r * 0.5);
    if (fits(x, y, r)) { add(x, y, r); n++; }
  }
}

// Blocky pillars hanging from the ceiling and rising from the floor.
export function pillars(ctx, d) {
  const x0 = ctx.x;
  const pts = zigPath(ctx, LEN, [2, 3, 3], BEAT / 2, 80, H - 80);
  commitPath(ctx, pts);
  const clr = CLR + lerp(14, 0, d);
  const step = BEAT / 4;
  const env = envelope(ctx, pts, x0, ctx.x, lerp(105, 80, d), lerp(170, 130, d), step, 0.2);
  for (let i = 1; i < pts.length - 1; i++) {
    const [vx, vy] = pts[i];
    const half = Math.round(ctx.rng.range(1, lerp(1.6, 2.6, d))) * step / 2 + step / 2;
    const a = vx - half, b = vx + half;
    if (a < x0 + 20 || b > ctx.x - 20) continue;
    const [mn, mx] = pathRange(pts, a - clr, b + clr);
    const peakDown = pts[i - 1][1] < vy; // the line bottoms out here: hang a pillar from the ceiling
    for (const s of peakDown ? env.ceil : env.floor) {
      if (s[1] <= a || s[0] >= b) continue;
      const [smn, smx] = pathRange(pts, s[0] - clr, s[1] + clr);
      if (peakDown) s[2] = Math.max(s[2], Math.min(mn, smn) - clr);
      else s[2] = Math.min(s[2], Math.max(mx, smx) + clr);
    }
  }
  emit(ctx, env.ceil, true); emit(ctx, env.floor, false);
}

// Wide-open runway with the chequered finish gate in the middle.
export function finish(ctx) {
  const x0 = ctx.x;
  const pts = zigPath(ctx, 24 * BEAT, [4], BEAT / 2, 150, 300);
  commitPath(ctx, pts);
  corridor(ctx, x0, ctx.x, 30, H - 30);
  ctx.c.finishX = x0 + 4 * BEAT;
  ctx.c.length = ctx.c.finishX;
}

const INNER = { zig, sine, spikes, saws, pillars };

// Generate one chunk by name. Portal chunks wrap an inner chunk between an
// "on" portal at the start and an "off" portal at the end.
// Chunk joins: where the previous wall and the new wall differ by more than
// BEVEL_MIN at the join, the vertical face is replaced by a ramp over the first
// units of the new chunk. A ramp that removes wall (the tunnel narrows) is
// always safe; a ramp that adds wall (the tunnel opens) is cut at exactly 45
// degrees so the safe line, which never climbs faster than 45 degrees, keeps
// its clearance. The designed wall is blended in point by point (with crossing
// points) so it is never more intrusive than either the ramp or the design.
const BEVEL_MIN = 40, BEVEL_LEN = BEAT / 2;
function bevelJoin(xs, ys, i0, x0, isCeil, slope) {
  if (i0 < 1 || i0 >= xs.length) return;
  const yOld = ys[i0 - 1], yNew = ys[i0];
  if (Math.abs(xs[i0 - 1] - x0) > 0.5 || Math.abs(xs[i0] - x0) > 0.5) return;
  const dy = yNew - yOld;
  if (Math.abs(dy) <= BEVEL_MIN) return;
  const closing = isCeil ? dy > 0 : dy < 0;         // wall moves into the tunnel
  // opening: the ramp runs at the path's max slope (63 degrees when mini) all the way to
  // the wall band edge, not just to the first new wall point; a designed wall that keeps
  // opening past it would otherwise be joined to the ramp's end by a shallower chord
  // that cuts into the tunnel (the narrow -> saws deaths)
  const dyR = closing ? dy : (isCeil ? TOP : BOT) - yOld;
  const L = closing ? BEVEL_LEN : Math.max(1, Math.abs(dyR) / slope);
  const safe = isCeil ? (closing ? Math.min : Math.max) : (closing ? Math.max : Math.min);
  const ramp = (x) => yOld + dyR * clamp((x - x0) / L, 0, 1);
  // designed points inside the ramp span (in order; equal x = vertical step)
  let i1 = i0; while (i1 < xs.length && xs[i1] <= x0 + L + 0.01) i1++;
  const des = [];
  for (let i = i0; i < i1; i++) des.push([xs[i], ys[i]]);
  // the designed wall's value at the end of the span (interpolated)
  if (!des.length || des[des.length - 1][0] < x0 + L - 0.01) {
    const a = des.length ? des[des.length - 1] : [x0, yNew];
    const b = i1 < xs.length ? [xs[i1], ys[i1]] : null;
    const yEnd = b && b[0] > a[0] ? a[1] + (b[1] - a[1]) * (x0 + L - a[0]) / (b[0] - a[0]) : a[1];
    des.push([x0 + L, yEnd]);
  }
  const out = [];
  for (let k = 0; k < des.length; k++) {
    const [ax, ay] = des[k];
    if (k > 0) {
      // crossing between the designed segment and the ramp
      const [bx, by] = des[k - 1];
      if (ax > bx) {
        const f0 = by - ramp(bx), f1 = ay - ramp(ax);
        if (f0 * f1 < 0) { const t = f0 / (f0 - f1); const cx = bx + (ax - bx) * t; out.push([cx, ramp(cx)]); }
      }
    }
    out.push([ax, safe(ay, ramp(ax))]);
  }
  xs.splice(i0, i1 - i0, ...out.map((p) => p[0]));
  ys.splice(i0, i1 - i0, ...out.map((p) => p[1]));
}

export function genChunk(ctx, type, d, inner) {
  const c = ctx.c, x0 = ctx.x;
  c.checks.push({ x: x0, y: ctx.y, mini: ctx.mini, grav: ctx.grav, speed: ctx.speed, mirror: ctx.mirror });
  const ci = c.cx.length, fi = c.fx.length, slope = type === 'mini' || ctx.mini ? 2 : 1;
  switch (type) {
    case 'teach': teach(ctx, ctx.teachLen || 9 * 330); break;
    case 'intro': teach(ctx, 4 * BEAT); break;
    case 'narrow': zig(ctx, d, { narrow: true, ks: [1, 1, 2] }); break;
    case 'zigw': zig(ctx, Math.min(d, 0.2), ctx.bridge ? { gap: ctx.bridge } : {}); break;
    case 'finish': finish(ctx); break;
    case 'mini': case 'grav': case 'speed': case 'mirror': {
      const pick = inner || (type === 'mini' ? 'zig' : ctx.rng.pick(type === 'speed' ? ['zig', 'sine', 'spikes'] : ['zig', 'spikes', 'pillars', 'saws']));
      const set = (on) => {
        if (type === 'mini') ctx.mini = on;
        if (type === 'grav') ctx.grav = on ? -1 : 1;
        if (type === 'speed') ctx.speed = on ? 1.3 : 1;
        if (type === 'mirror') ctx.mirror = on;
        c.portals.push({ x: ctx.x, kind: type, on, y: ctx.y });
      };
      set(true);
      const dd = type === 'speed' ? d * 0.75 : d * 0.85;
      if (type === 'mini') zig(ctx, dd); else INNER[pick](ctx, dd);
      set(false);
      break;
    }
    default: (INNER[type] || zig)(ctx, d);
  }
  bevelJoin(c.cx, c.cy, ci, x0, true, slope);
  bevelJoin(c.fx, c.fy, fi, x0, false, slope);
  c.chunks.push({ x0, x1: ctx.x, type });
  c.genX = ctx.x;
}

export function newCtx(course, rng) {
  return { c: course, rng, x: 0, y: H / 2, dir: -1, mini: false, grav: 1, speed: 1, mirror: false, lo: 62, hi: H - 62 };
}
