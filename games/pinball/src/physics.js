// Ball physics: fixed 480 Hz substeps, thin segment walls, circle posts/bumpers,
// tapered rotating flippers with proper contact-point velocity, ball-ball contacts.
import { BALL_R, FLIPPERS } from './table.js';

export const DT = 1 / 480;
export const GRAV = 1550;          // table-slope gravity, units/s^2
export const MAXV = 3300;
const FL_UP = 24, FL_DN = 15;      // flipper angular speeds, rad/s
const FLIP_E = 0.32;
const BUMPER_OUT = 980, SLING_OUT = 820;

let nextId = 1;
export function makeBall(x, y) {
  return { id: nextId++, x, y, vx: 0, vy: 0, ramp: null, held: 0, saucerCD: 0, still: 0, trail: [], spin: 0, alive: true };
}

export function makeFlippers() {
  return FLIPPERS.map((f) => ({ ...f, a: f.aRest, w: 0, held: false, dx: 0, dy: 0 }));
}

function flipperDir(f) { f.dx = f.sgn * Math.cos(f.a); f.dy = Math.sin(f.a); }

export function stepFlippers(flips, dt) {
  for (const f of flips) {
    const a0 = f.a;
    if (f.held) f.a = Math.max(f.aUp, f.a - FL_UP * dt);
    else f.a = Math.min(f.aRest, f.a + FL_DN * dt);
    f.w = (f.a - a0) / dt;
    flipperDir(f);
  }
}

function collideSeg(b, s, ev) {
  const t0 = ((b.x - s.ax) * s.dx + (b.y - s.ay) * s.dy) / s.len2;
  const t = t0 < 0 ? 0 : t0 > 1 ? 1 : t0;
  const cx = s.ax + s.dx * t, cy = s.ay + s.dy * t;
  let ex = b.x - cx, ey = b.y - cy;
  const d2 = ex * ex + ey * ey;
  if (d2 >= BALL_R * BALL_R) return;
  if (s.oneway && ((b.x - s.ax) * s.nx + (b.y - s.ay) * s.ny) < 0) return;
  let d = Math.sqrt(d2), nx, ny;
  if (d < 1e-6) { const l = Math.sqrt(s.len2); nx = -s.dy / l; ny = s.dx / l; d = 0; }
  else { nx = ex / d; ny = ey / d; }
  if (s.oneway && nx * s.nx + ny * s.ny < 0) { nx = s.nx; ny = s.ny; }
  b.x += nx * (BALL_R - d); b.y += ny * (BALL_R - d);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + s.e) * vn * nx; b.vy -= (1 + s.e) * vn * ny;
    // a touch of tangential friction
    const tx = -ny, ty = nx, vt = b.vx * tx + b.vy * ty;
    b.vx -= vt * 0.015 * tx; b.vy -= vt * 0.015 * ty;
    if (s.kind === 'sling' && -vn > 90) {
      const out = b.vx * nx + b.vy * ny;
      if (out < SLING_OUT) { b.vx += (SLING_OUT - out) * nx; b.vy += (SLING_OUT - out) * ny; }
    }
    if (ev) ev.hit(s, -vn, b, cx, cy);
  }
}

function collideCircle(b, c, ev) {
  const ex = b.x - c.x, ey = b.y - c.y, R = BALL_R + c.r;
  const d2 = ex * ex + ey * ey;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1e-6, nx = ex / d, ny = ey / d;
  b.x = c.x + nx * R; b.y = c.y + ny * R;
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) {
    b.vx -= (1 + c.e) * vn * nx; b.vy -= (1 + c.e) * vn * ny;
    if (c.kind === 'bumper') {
      const out = b.vx * nx + b.vy * ny;
      if (out < BUMPER_OUT) { b.vx += (BUMPER_OUT - out) * nx; b.vy += (BUMPER_OUT - out) * ny; }
    }
    if (ev) ev.hit(c, -vn, b, c.x + nx * c.r, c.y + ny * c.r);
  }
}

function collideFlipper(b, f, ev) {
  const L = f.len, tx = f.px + f.dx * L, ty = f.py + f.dy * L;
  const vx = tx - f.px, vy = ty - f.py;
  let t = ((b.x - f.px) * vx + (b.y - f.py) * vy) / (L * L);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = f.px + vx * t, cy = f.py + vy * t, r = f.r1 + (f.r2 - f.r1) * t;
  const ex = b.x - cx, ey = b.y - cy, R = BALL_R + r, d2 = ex * ex + ey * ey;
  if (d2 >= R * R) return;
  const d = Math.sqrt(d2) || 1e-6, nx = ex / d, ny = ey / d;
  b.x = cx + nx * R; b.y = cy + ny * R;
  // velocity of the flipper surface at the contact point
  const s = t * L;
  const pvx = s * f.w * (-f.sgn * Math.sin(f.a)), pvy = s * f.w * Math.cos(f.a);
  const rvx = b.vx - pvx, rvy = b.vy - pvy, vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    b.vx -= (1 + FLIP_E) * vn * nx; b.vy -= (1 + FLIP_E) * vn * ny;
    if (ev) ev.hit({ kind: 'flipper', idx: f.sgn > 0 ? 0 : 1 }, -vn, b, cx + nx * r, cy + ny * r);
  }
}

export function stepBall(b, W, dt, ev) {
  b.vy += GRAV * dt;
  const damp = 1 - 0.12 * dt;
  b.vx *= damp; b.vy *= damp;
  const sp2 = b.vx * b.vx + b.vy * b.vy;
  if (sp2 > MAXV * MAXV) { const k = MAXV / Math.sqrt(sp2); b.vx *= k; b.vy *= k; }
  const ox = b.x, oy = b.y;
  b.x += b.vx * dt; b.y += b.vy * dt;
  for (let pass = 0; pass < 2; pass++) {
    for (const s of W.segs) if (s.on) collideSeg(b, s, pass === 0 ? ev : null);
    for (const c of W.circles) collideCircle(b, c, pass === 0 ? ev : null);
    for (const f of W.flips) collideFlipper(b, f, pass === 0 ? ev : null);
  }
  if (ev) ev.sense(b, ox, oy);
}

export function collideBalls(balls) {
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i]; if (a.ramp || a.held > 0) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j]; if (b.ramp || b.held > 0) continue;
      const ex = b.x - a.x, ey = b.y - a.y, d2 = ex * ex + ey * ey, R = BALL_R * 2;
      if (d2 >= R * R || d2 < 1e-9) continue;
      const d = Math.sqrt(d2), nx = ex / d, ny = ey / d, pen = (R - d) / 2;
      a.x -= nx * pen; a.y -= ny * pen; b.x += nx * pen; b.y += ny * pen;
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const j2 = -(1 + 0.9) * rv / 2;
        a.vx -= j2 * nx; a.vy -= j2 * ny; b.vx += j2 * nx; b.vy += j2 * ny;
      }
    }
  }
}
