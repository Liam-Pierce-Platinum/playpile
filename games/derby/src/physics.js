// Car handling (ported from TOUGE DRIFT's updateCar, retuned for an arena) and the collision
// maths: oriented boxes (SAT) with real impulses, mass and spin.
import { clamp, lerp } from './util.js';
import { wallDist } from './arena.js';

export const SUB = 1 / 120;   // fixed physics step

// ------------------------------------------------------------ handling
// inp: { steer -1..1, throttle 0/1, brake 0/1, hand bool, boost bool }
// surf: { grip, accel, drag } (puddles cut grip)
export function drive(c, dt, inp, surf, time) {
  const M = c.M;
  const speed = Math.hypot(c.vx, c.vy);
  const eng = clamp(c.engine / c.emax, 0, 1);
  // full power until the engine is down to 60%, then it fades to 55%
  const power = c.alive ? 0.55 + 0.45 * Math.min(1, eng / 0.6) : 0;
  c.boostOn = c.alive && inp.boost && c.boost > 0.02 && inp.throttle > 0;
  if (c.boostOn) c.boost = Math.max(0, c.boost - dt / 1.4);          // 1.4 s of boost...
  else c.boost = Math.min(1, c.boost + dt / 8);                        // ...refills in 8 s
  const top = M.top * power * (c.boostOn ? 1.38 : 1);
  // a beaten car drives worse: bent sides pull the steering, wrecked corners make it wobble
  const zf = c.zones.map((z) => z / c.zmax);
  const sp = clamp(speed / 300, 0, 1);
  let st = inp.steer;
  if (c.alive) {
    st += (zf[2] - zf[3]) * 0.22 * sp;
    const worst = Math.min(...zf);
    c.wob = Math.max(0, 0.35 - worst) / 0.35;
    st += Math.sin(time * 13 + c.seed * 7) * 0.24 * c.wob * sp;
  }
  st = clamp(st, -1.2, 1.2);
  c.steer += (st - c.steer) * Math.min(1, dt * 6);
  // drifting: steer hard at speed (or pull the handbrake) and the rear lets go
  const wantDrift = !c.alive ? 0 : inp.hand ? 1 : (Math.abs(c.steer) > 0.5 && speed > M.top * 0.62 && inp.throttle) ? 1 : 0;
  c.drift = lerp(c.drift, wantDrift, 1 - Math.exp(-(wantDrift ? 3.5 : 2.6) * dt));
  // 1. turn the car (stronger mid-speed, a little extra rotation while sliding)
  const fwd0 = c.vx * Math.cos(c.h) + c.vy * Math.sin(c.h);
  const sf = clamp(speed / 200, 0, 1) * lerp(1, 0.75, clamp((speed - 450) / 400, 0, 1));
  if (c.alive) c.h += c.steer * M.turn * sf * (1 + c.drift * 0.5) * Math.sign(fwd0 || 1) * dt;
  // spin from impacts
  c.h += c.w * dt;
  c.w *= Math.exp(-(c.stun > 0 ? 1.6 : c.alive ? 3.4 : 2.4) * dt);
  // let go of the keys and the car gently straightens up along its direction of travel
  if (c.alive && Math.abs(inp.steer) < 0.1 && speed > 120 && c.stun <= 0) {
    const va = Math.atan2(c.vy, c.vx);
    let d = va - c.h; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    if (Math.abs(d) < 1.4) c.h += clamp(d, -1, 1) * Math.min(1, dt * 3);
  }
  // 2. split the motion into forward and sideways for the new heading
  const fx = Math.cos(c.h), fy = Math.sin(c.h), rx = -fy, ry = fx;
  let vf = c.vx * fx + c.vy * fy;
  let vl = c.vx * rx + c.vy * ry;
  // 3. engine and brakes push forward; tyres bleed off the sideways slide (less while drifting)
  if (c.alive) {
    if (inp.throttle) vf += M.accel * power * (c.boostOn ? 1.7 : 1) * surf.accel * dt * (1 - Math.max(0, vf) / top);
    if (inp.brake) vf -= (vf > 20 ? 1500 : M.accel * 0.62 * power) * dt;
    if (vf < -330 * power) vf += (-330 * power - vf) * Math.min(1, dt * 4);
  }
  if (vf > top && c.alive) vf -= (vf - top) * Math.min(1, dt * 3);
  vf *= 1 - (0.25 + surf.drag) * dt;
  if (!c.alive) vf *= Math.exp(-2.4 * dt);   // a dead car is in gear with the handbrake on
  const grip = lerp(9, 3.2, c.drift) * (inp.hand ? 0.7 : 1) * surf.grip * (c.stun > 0 ? 0.32 : 1) * (c.alive ? 1 : 0.8);
  const lost = vl * (1 - Math.exp(-grip * dt));
  vl -= lost;
  if (c.alive) vf += Math.abs(lost) * 0.35 * c.drift;   // some of the slide turns back into drive
  if (inp.hand) vf *= 1 - 0.6 * dt;
  c.vx = fx * vf + rx * vl;
  c.vy = fy * vf + ry * vl;
  c.x += c.vx * dt; c.y += c.vy * dt;
  c.speed = Math.hypot(c.vx, c.vy);
  c.vf = vf;
  c.slip = Math.atan2(vl, Math.max(1, Math.abs(vf)));
  c.stun = Math.max(0, c.stun - dt);
}

// ------------------------------------------------------------ geometry
export function carPoly(c) {
  const cs = Math.cos(c.h), sn = Math.sin(c.h), L = c.L, W = c.W;
  const p = (lx, ly) => ({ x: c.x + cs * lx - sn * ly, y: c.y + sn * lx + cs * ly });
  return [p(L, -W), p(L, W), p(-L, W), p(-L, -W)];
}
export function toLocal(c, px, py) {
  const dx = px - c.x, dy = py - c.y, cs = Math.cos(c.h), sn = Math.sin(c.h);
  return { x: dx * cs + dy * sn, y: -dx * sn + dy * cs };
}
export function toWorld(c, lx, ly) {
  const cs = Math.cos(c.h), sn = Math.sin(c.h);
  return { x: c.x + cs * lx - sn * ly, y: c.y + sn * lx + cs * ly };
}

function proj(P, nx, ny) { let mn = Infinity, mx = -Infinity; for (const p of P) { const d = p.x * nx + p.y * ny; if (d < mn) mn = d; if (d > mx) mx = d; } return [mn, mx]; }
function cen(P) { let x = 0, y = 0; for (const p of P) { x += p.x; y += p.y; } return { x: x / P.length, y: y / P.length }; }

// separating axis test for two convex polygons. Normal points from A to B.
// The contact point is the deepest vertex (averaged when two are equally deep, e.g. side by side).
export function sat(PA, PB) {
  let best = Infinity, bx = 0, by = 0, fromA = true;
  for (let s = 0; s < 2; s++) {
    const P = s ? PB : PA;
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      let nx = b.y - a.y, ny = -(b.x - a.x);
      const l = Math.hypot(nx, ny); if (l < 1e-9) continue; nx /= l; ny /= l;
      const [a0, a1] = proj(PA, nx, ny), [b0, b1] = proj(PB, nx, ny);
      const o = Math.min(a1, b1) - Math.max(a0, b0);
      if (o <= 0) return null;
      if (o < best) { best = o; bx = nx; by = ny; fromA = !s; }
    }
  }
  const ca = cen(PA), cb = cen(PB);
  if ((cb.x - ca.x) * bx + (cb.y - ca.y) * by < 0) { bx = -bx; by = -by; }
  const V = fromA ? PB : PA, sgn = fromA ? -1 : 1;
  let ext = -Infinity;
  for (const p of V) ext = Math.max(ext, sgn * (p.x * bx + p.y * by));
  let px = 0, py = 0, n = 0;
  for (const p of V) if (sgn * (p.x * bx + p.y * by) > ext - 1.5) { px += p.x; py += p.y; n++; }
  return { nx: bx, ny: by, depth: best, px: px / n, py: py / n };
}

// circle vs convex polygon (any winding). Normal points from the polygon to the circle.
export function circlePoly(cx, cy, r, P) {
  const C = cen(P);
  let maxD = -Infinity, mnx = 0, mny = 0, best = Infinity, qx = 0, qy = 0;
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length];
    let nx = b.y - a.y, ny = -(b.x - a.x); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    if ((a.x - C.x) * nx + (a.y - C.y) * ny < 0) { nx = -nx; ny = -ny; }
    const d = (cx - a.x) * nx + (cy - a.y) * ny;
    if (d > maxD) { maxD = d; mnx = nx; mny = ny; }
    const ex = b.x - a.x, ey = b.y - a.y, t = clamp(((cx - a.x) * ex + (cy - a.y) * ey) / (ex * ex + ey * ey || 1), 0, 1);
    const sx = a.x + ex * t, sy = a.y + ey * t, dd = Math.hypot(cx - sx, cy - sy);
    if (dd < best) { best = dd; qx = sx; qy = sy; }
  }
  if (maxD <= 0) return { nx: mnx, ny: mny, depth: r - maxD, px: cx - mnx * maxD, py: cy - mny * maxD };
  if (best >= r) return null;
  return { nx: (cx - qx) / best, ny: (cy - qy) / best, depth: r - best, px: qx, py: qy };
}

// ------------------------------------------------------------ responses
// car hits something immovable at world point p; n points from the obstacle into the car
function staticImpulse(c, px, py, nx, ny, depth, e) {
  c.x += nx * depth; c.y += ny * depth;
  const rx = px - c.x, ry = py - c.y;
  const vpx = c.vx - c.w * ry, vpy = c.vy + c.w * rx;
  const vn = vpx * nx + vpy * ny;
  if (vn >= 0) return 0;
  const rn = rx * ny - ry * nx;
  const j = (-(1 + e) * vn) / (1 / c.mass + (rn * rn) / c.I);
  c.vx += (j * nx) / c.mass; c.vy += (j * ny) / c.mass; c.w += (rn * j) / c.I;
  // scrape friction along the wall
  const tx = -ny, ty = nx, vt = vpx * tx + vpy * ty, rt = rx * ty - ry * tx;
  let jt = -vt / (1 / c.mass + (rt * rt) / c.I); jt = clamp(jt, -0.3 * j, 0.3 * j);
  c.vx += (jt * tx) / c.mass; c.vy += (jt * ty) / c.mass; c.w += (rt * jt) / c.I;
  return -vn;
}

// car vs outer wall and static obstacles. onHit(car, px, py, nx, ny, impactSpeed, soft)
export function carVsArena(c, A, onHit) {
  for (let it = 0; it < 2; it++) {
    const P = carPoly(c);
    let worst = 0, wi = -1, wk = 0;
    for (let i = 0; i < 4; i++) { const r = wallDist(A, P[i].x, P[i].y); if (r.d < worst) { worst = r.d; wi = i; wk = r.k; } }
    if (wi < 0) break;
    const n = A.bn[wk];
    const v = staticImpulse(c, P[wi].x, P[wi].y, n.x, n.y, -worst, 0.3);
    if (v > 0) onHit(c, P[wi].x, P[wi].y, n.x, n.y, v, A.wall === 'concrete' ? 0.75 : 0.5);
  }
  const reach = c.L + c.W;
  for (const s of A.statics) {
    if (s.type === 'circle') {
      if (Math.hypot(s.x - c.x, s.y - c.y) > s.r + reach) continue;
      const r = circlePoly(s.x, s.y, s.r, carPoly(c));
      if (!r) continue;
      const v = staticImpulse(c, r.px, r.py, -r.nx, -r.ny, r.depth, 0.35);
      if (v > 0) onHit(c, r.px, r.py, -r.nx, -r.ny, v, s.soft);
    } else {
      if (Math.hypot(s.cx - c.x, s.cy - c.y) > s.br + reach) continue;
      const r = sat(carPoly(c), s.pts);
      if (!r) continue;
      const v = staticImpulse(c, r.px, r.py, -r.nx, -r.ny, r.depth, 0.3);
      if (v > 0) onHit(c, r.px, r.py, -r.nx, -r.ny, v, s.soft);
    }
  }
}

// car vs car. Returns { px, py, nx, ny, vrel } for an impact (vrel = closing speed along the normal) or null.
export function carVsCar(A, B) {
  const rA = A.L + A.W, rB = B.L + B.W;
  const dx = B.x - A.x, dy = B.y - A.y;
  if (dx * dx + dy * dy > (rA + rB) * (rA + rB)) return null;
  const r = sat(carPoly(A), carPoly(B));
  if (!r) return null;
  const { nx, ny } = r;
  const imA = 1 / A.mass, imB = 1 / B.mass, s = r.depth / (imA + imB);
  A.x -= nx * s * imA; A.y -= ny * s * imA; B.x += nx * s * imB; B.y += ny * s * imB;
  const rAx = r.px - A.x, rAy = r.py - A.y, rBx = r.px - B.x, rBy = r.py - B.y;
  const vAx = A.vx - A.w * rAy, vAy = A.vy + A.w * rAx, vBx = B.vx - B.w * rBy, vBy = B.vy + B.w * rBx;
  const vrel = (vAx - vBx) * nx + (vAy - vBy) * ny;
  if (vrel <= 0) return { px: r.px, py: r.py, nx, ny, vrel: 0, depth: r.depth };
  const rAn = rAx * ny - rAy * nx, rBn = rBx * ny - rBy * nx;
  const e = 0.28;
  const j = ((1 + e) * vrel) / (imA + imB + (rAn * rAn) / A.I + (rBn * rBn) / B.I);
  A.vx -= j * nx * imA; A.vy -= j * ny * imA; A.w -= (j * rAn) / A.I;
  B.vx += j * nx * imB; B.vy += j * ny * imB; B.w += (j * rBn) / B.I;
  // friction along the contact so glancing hits spin cars round
  const tx = -ny, ty = nx, vt = (vAx - vBx) * tx + (vAy - vBy) * ty;
  const rAt = rAx * ty - rAy * tx, rBt = rBx * ty - rBy * tx;
  let jt = vt / (imA + imB + (rAt * rAt) / A.I + (rBt * rBt) / B.I); jt = clamp(jt, -0.35 * j, 0.35 * j);
  A.vx -= jt * tx * imA; A.vy -= jt * ty * imA; A.w -= (jt * rAt) / A.I;
  B.vx += jt * tx * imB; B.vy += jt * ty * imB; B.w += (jt * rBt) / B.I;
  return { px: r.px, py: r.py, nx, ny, vrel, depth: r.depth };
}

// a loose round body (hay bale, debris) vs a car; returns impact speed
export function carVsBody(c, o, e = 0.3) {
  const dx = o.x - c.x, dy = o.y - c.y, reach = c.L + c.W + o.r;
  if (dx * dx + dy * dy > reach * reach) return 0;
  const r = circlePoly(o.x, o.y, o.r, carPoly(c));
  if (!r) return 0;
  const im = 1 / c.mass, io = 1 / o.mass, s = r.depth / (im + io);
  c.x -= r.nx * s * im; c.y -= r.ny * s * im; o.x += r.nx * s * io; o.y += r.ny * s * io;
  const rx = r.px - c.x, ry = r.py - c.y;
  const vcx = c.vx - c.w * ry, vcy = c.vy + c.w * rx;
  const vrel = (vcx - o.vx) * r.nx + (vcy - o.vy) * r.ny;
  if (vrel <= 0) return 0;
  const rn = rx * r.ny - ry * r.nx;
  const j = ((1 + e) * vrel) / (im + io + (rn * rn) / c.I);
  c.vx -= j * r.nx * im; c.vy -= j * r.ny * im; c.w -= (j * rn) / c.I;
  o.vx += j * r.nx * io; o.vy += j * r.ny * io;
  o.w = (o.w || 0) + ((Math.random() - 0.5) * vrel) / 30;
  return vrel;
}

// loose round body vs the arena (walls and statics)
export function bodyVsArena(o, A) {
  const w = wallDist(A, o.x, o.y);
  if (w.d < o.r) {
    const n = A.bn[w.k], pen = o.r - w.d;
    o.x += n.x * pen; o.y += n.y * pen;
    const vn = o.vx * n.x + o.vy * n.y;
    if (vn < 0) { o.vx -= 1.4 * vn * n.x; o.vy -= 1.4 * vn * n.y; }
  }
  for (const s of A.statics) {
    let nx, ny, pen;
    if (s.type === 'circle') {
      const dx = o.x - s.x, dy = o.y - s.y, d = Math.hypot(dx, dy) || 1;
      if (d >= s.r + o.r) continue;
      nx = dx / d; ny = dy / d; pen = s.r + o.r - d;
    } else {
      if (Math.hypot(o.x - s.cx, o.y - s.cy) > s.br + o.r) continue;
      const r = circlePoly(o.x, o.y, o.r, s.pts);
      if (!r) continue;
      nx = r.nx; ny = r.ny; pen = r.depth;
    }
    o.x += nx * pen; o.y += ny * pen;
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= 1.4 * vn * nx; o.vy -= 1.4 * vn * ny; }
  }
}

export function bodyVsBody(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
  if (d >= m || d < 0.001) return;
  const nx = dx / d, ny = dy / d, ia = 1 / a.mass, ib = 1 / b.mass, s = (m - d) / (ia + ib);
  a.x -= nx * s * ia; a.y -= ny * s * ia; b.x += nx * s * ib; b.y += ny * s * ib;
  const vrel = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vrel > 0) { const j = (1.3 * vrel) / (ia + ib); a.vx -= j * nx * ia; a.vy -= j * ny * ia; b.vx += j * nx * ib; b.vy += j * ny * ib; }
}
