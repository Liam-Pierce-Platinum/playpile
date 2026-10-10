// A small 2D rigid-body engine: boxes and circles, y-up, metres-ish units.
// Box2D-Lite style: SAT box clipping with feature ids, sequential impulses
// with warm starting, breakable weld joints, ropes (max-distance), and
// island sleeping so a resting city costs nothing until the ball arrives.

const BIAS = 0.2, SLOP = 0.01;
export const TUNE = { jbeta: 0.15, jbetaA: 0.1, jwarm: 0.85, stressK: 0.3 };
const SLEEP_V = 0.06, SLEEP_W = 0.06, SLEEP_TIME = 0.6;

export class Body {
  constructor(o) {
    this.id = 0;
    this.circle = !!o.r;
    this.r = o.r || 0;
    this.hw = o.hw || this.r; this.hh = o.hh || this.r;
    this.x = o.x; this.y = o.y; this.a = o.a || 0;
    this.c = Math.cos(this.a); this.s = Math.sin(this.a);
    this.vx = 0; this.vy = 0; this.w = 0;
    this.friction = o.friction ?? 0.6;
    this.static = !!o.static;
    if (this.static) { this.m = 0; this.im = 0; this.iI = 0; this.awake = false; }
    else {
      const d = o.density ?? 1;
      if (this.circle) { this.m = Math.PI * this.r * this.r * d; this.I = 0.5 * this.m * this.r * this.r; }
      else { this.m = 4 * this.hw * this.hh * d; this.I = this.m * (4 * this.hw * this.hw + 4 * this.hh * this.hh) / 12; }
      this.im = 1 / this.m; this.iI = 1 / this.I;
      this.awake = !o.sleep;
    }
    this.noSleep = !!o.noSleep;
    this.sleepT = 0;
    this.dead = false;
    this.joints = [];
    this.data = o.data || null;
    this.bounds();
  }
  bounds() {
    if (this.circle) { this.ex = this.r; this.ey = this.r; }
    else { const c = Math.abs(this.c), s = Math.abs(this.s); this.ex = c * this.hw + s * this.hh; this.ey = s * this.hw + c * this.hh; }
    this.minX = this.x - this.ex; this.maxX = this.x + this.ex;
  }
  wake() { if (!this.static && !this.awake) { this.awake = true; this.sleepT = 0; } }
  applyImpulse(px, py, wx, wy) {
    if (this.static) return;
    this.wake();
    this.vx += px * this.im; this.vy += py * this.im;
    this.w += this.iI * ((wx - this.x) * py - (wy - this.y) * px);
  }
  // world point -> local, local -> world
  toLocal(wx, wy) { const dx = wx - this.x, dy = wy - this.y; return [this.c * dx + this.s * dy, -this.s * dx + this.c * dy]; }
  toWorld(lx, ly) { return [this.x + this.c * lx - this.s * ly, this.y + this.s * lx + this.c * ly]; }
}

// ------------------------------------------------------------------ narrow phase
// every function writes contacts {x, y, nx, ny, sep, key} with the normal pointing from A to B

function incident(h_x, h_y, px, py, c, s, fnx, fny) {
  const nx = -(c * fnx + s * fny), ny = -(-s * fnx + c * fny);
  let v0x, v0y, v1x, v1y, i0, o0, i1, o1;
  if (Math.abs(nx) > Math.abs(ny)) {
    if (nx > 0) { v0x = h_x; v0y = -h_y; i0 = 3; o0 = 4; v1x = h_x; v1y = h_y; i1 = 4; o1 = 1; }
    else { v0x = -h_x; v0y = h_y; i0 = 1; o0 = 2; v1x = -h_x; v1y = -h_y; i1 = 2; o1 = 3; }
  } else {
    if (ny > 0) { v0x = h_x; v0y = h_y; i0 = 4; o0 = 1; v1x = -h_x; v1y = h_y; i1 = 1; o1 = 2; }
    else { v0x = -h_x; v0y = -h_y; i0 = 2; o0 = 3; v1x = h_x; v1y = -h_y; i1 = 3; o1 = 4; }
  }
  return [
    { x: px + c * v0x - s * v0y, y: py + s * v0x + c * v0y, i1: 0, o1: 0, i2: i0, o2: o0 },
    { x: px + c * v1x - s * v1y, y: py + s * v1x + c * v1y, i1: 0, o1: 0, i2: i1, o2: o1 },
  ];
}

function clip(vin, nx, ny, off, edge) {
  const out = [];
  const a = vin[0], b = vin[1];
  const d0 = nx * a.x + ny * a.y - off, d1 = nx * b.x + ny * b.y - off;
  if (d0 <= 0) out.push(a);
  if (d1 <= 0) out.push(b);
  if (d0 * d1 < 0) {
    const t = d0 / (d0 - d1);
    const p = { x: a.x + t * (b.x - a.x), y: a.y + t * (b.y - a.y), i1: 0, o1: 0, i2: 0, o2: 0 };
    if (d0 > 0) { p.i1 = edge; p.o1 = a.o1; p.i2 = 0; p.o2 = a.o2; }
    else { p.i1 = b.i1; p.o1 = edge; p.i2 = b.i2; p.o2 = 0; }
    out.push(p);
  }
  return out;
}

function boxBox(A, B, out) {
  const hAx = A.hw, hAy = A.hh, hBx = B.hw, hBy = B.hh;
  const cA = A.c, sA = A.s, cB = B.c, sB = B.s;
  const dpx = B.x - A.x, dpy = B.y - A.y;
  const dAx = cA * dpx + sA * dpy, dAy = -sA * dpx + cA * dpy;
  const dBx = cB * dpx + sB * dpy, dBy = -sB * dpx + cB * dpy;
  const c11 = cA * cB + sA * sB, c21 = -sA * cB + cA * sB;
  const c12 = -cA * sB + sA * cB, c22 = sA * sB + cA * cB;
  const a11 = Math.abs(c11), a21 = Math.abs(c21), a12 = Math.abs(c12), a22 = Math.abs(c22);
  const fAx = Math.abs(dAx) - hAx - (a11 * hBx + a12 * hBy);
  const fAy = Math.abs(dAy) - hAy - (a21 * hBx + a22 * hBy);
  if (fAx > 0 || fAy > 0) return 0;
  const fBx = Math.abs(dBx) - (a11 * hAx + a21 * hAy) - hBx;
  const fBy = Math.abs(dBy) - (a12 * hAx + a22 * hAy) - hBy;
  if (fBx > 0 || fBy > 0) return 0;
  let axis = 0, sep = fAx, nx, ny;
  if (dAx > 0) { nx = cA; ny = sA; } else { nx = -cA; ny = -sA; }
  const rel = 0.95, ab = 0.01;
  if (fAy > rel * sep + ab * hAy) { axis = 1; sep = fAy; if (dAy > 0) { nx = -sA; ny = cA; } else { nx = sA; ny = -cA; } }
  if (fBx > rel * sep + ab * hBx) { axis = 2; sep = fBx; if (dBx > 0) { nx = cB; ny = sB; } else { nx = -cB; ny = -sB; } }
  if (fBy > rel * sep + ab * hBy) { axis = 3; sep = fBy; if (dBy > 0) { nx = -sB; ny = cB; } else { nx = sB; ny = -cB; } }
  let fnx, fny, front, snx, sny, negSide, posSide, negEdge, posEdge, inc;
  if (axis === 0) {
    fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAx; snx = -sA; sny = cA;
    const side = A.x * snx + A.y * sny; negSide = -side + hAy; posSide = side + hAy; negEdge = 3; posEdge = 1;
    inc = incident(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
  } else if (axis === 1) {
    fnx = nx; fny = ny; front = A.x * fnx + A.y * fny + hAy; snx = cA; sny = sA;
    const side = A.x * snx + A.y * sny; negSide = -side + hAx; posSide = side + hAx; negEdge = 2; posEdge = 4;
    inc = incident(hBx, hBy, B.x, B.y, cB, sB, fnx, fny);
  } else if (axis === 2) {
    fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBx; snx = -sB; sny = cB;
    const side = B.x * snx + B.y * sny; negSide = -side + hBy; posSide = side + hBy; negEdge = 3; posEdge = 1;
    inc = incident(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
  } else {
    fnx = -nx; fny = -ny; front = B.x * fnx + B.y * fny + hBy; snx = cB; sny = sB;
    const side = B.x * snx + B.y * sny; negSide = -side + hBx; posSide = side + hBx; negEdge = 2; posEdge = 4;
    inc = incident(hAx, hAy, A.x, A.y, cA, sA, fnx, fny);
  }
  const c1 = clip(inc, -snx, -sny, negSide, negEdge);
  if (c1.length < 2) return 0;
  const c2 = clip(c1, snx, sny, posSide, posEdge);
  if (c2.length < 2) return 0;
  let n = 0;
  for (let i = 0; i < 2; i++) {
    const p = c2[i];
    const s = fnx * p.x + fny * p.y - front;
    if (s <= 0) {
      let i1 = p.i1, o1 = p.o1, i2 = p.i2, o2 = p.o2;
      if (axis >= 2) { const t = i1; i1 = i2; i2 = t; const u = o1; o1 = o2; o2 = u; }
      out.push({ x: p.x - s * fnx, y: p.y - s * fny, nx, ny, sep: s, key: i1 | (o1 << 3) | (i2 << 6) | (o2 << 9) });
      n++;
    }
  }
  return n;
}

// normal from box to circle
function boxCircle(B, C, out, flip) {
  const dx = C.x - B.x, dy = C.y - B.y;
  const lx = B.c * dx + B.s * dy, ly = -B.s * dx + B.c * dy;
  const r = C.r;
  let nlx, nly, px, py, sep;
  if (Math.abs(lx) <= B.hw && Math.abs(ly) <= B.hh) {
    const ox = B.hw - Math.abs(lx), oy = B.hh - Math.abs(ly);
    if (ox < oy) { nlx = Math.sign(lx) || 1; nly = 0; px = nlx * B.hw; py = ly; sep = -ox - r; }
    else { nlx = 0; nly = Math.sign(ly) || 1; px = lx; py = nly * B.hh; sep = -oy - r; }
  } else {
    px = Math.max(-B.hw, Math.min(B.hw, lx)); py = Math.max(-B.hh, Math.min(B.hh, ly));
    const ex = lx - px, ey = ly - py, d = Math.hypot(ex, ey);
    if (d > r) return 0;
    nlx = ex / d; nly = ey / d; sep = d - r;
  }
  let nx = B.c * nlx - B.s * nly, ny = B.s * nlx + B.c * nly;
  const wx = B.x + B.c * px - B.s * py, wy = B.y + B.s * px + B.c * py;
  if (flip) { nx = -nx; ny = -ny; }
  out.push({ x: wx, y: wy, nx, ny, sep, key: 1 });
  return 1;
}

function circleCircle(A, B, out) {
  const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
  const sep = d - A.r - B.r;
  if (sep > 0) return 0;
  const nx = d > 1e-6 ? dx / d : 0, ny = d > 1e-6 ? dy / d : 1;
  out.push({ x: A.x + nx * A.r, y: A.y + ny * A.r, nx, ny, sep, key: 1 });
  return 1;
}

function collide(A, B, out) {
  if (!A.circle && !B.circle) return boxBox(A, B, out);
  if (A.circle && B.circle) return circleCircle(A, B, out);
  if (!A.circle) return boxCircle(A, B, out, false);
  return boxCircle(B, A, out, true);
}

// ------------------------------------------------------------------ arbiter
class Arbiter {
  constructor(b1, b2) { this.b1 = b1; this.b2 = b2; this.cs = []; this.stamp = 0; this.fr = Math.sqrt(b1.friction * b2.friction); this.age = 0; }
  update(ncs) {
    const old = this.cs;
    for (const c of ncs) {
      c.Pn = 0; c.Pt = 0;
      let best = null, bd = 0.0225;
      for (const o of old) {
        if (o.used) continue;
        if (o.key === c.key) { best = o; break; }
        const d = (o.x - c.x) ** 2 + (o.y - c.y) ** 2;
        if (d < bd) { bd = d; best = o; }
      }
      // feature ids flip when aligned blocks share corners, so fall back to the nearest old point
      if (best) { c.Pn = best.Pn; c.Pt = best.Pt; best.used = true; }
    }
    this.cs = ncs;
  }
  preStep(inv_dt) {
    const b1 = this.b1, b2 = this.b2;
    const im1 = b1.awake ? b1.im : 0, im2 = b2.awake ? b2.im : 0, iI1 = b1.awake ? b1.iI : 0, iI2 = b2.awake ? b2.iI : 0;
    this.vn = 0;
    for (const c of this.cs) {
      const r1x = c.x - b1.x, r1y = c.y - b1.y, r2x = c.x - b2.x, r2y = c.y - b2.y;
      const nx = c.nx, ny = c.ny, tx = ny, ty = -nx;
      const rn1 = r1x * ny - r1y * nx, rn2 = r2x * ny - r2y * nx;
      c.mN = 1 / (im1 + im2 + iI1 * rn1 * rn1 + iI2 * rn2 * rn2);
      const rt1 = r1x * ty - r1y * tx, rt2 = r2x * ty - r2y * tx;
      c.mT = 1 / (im1 + im2 + iI1 * rt1 * rt1 + iI2 * rt2 * rt2);
      c.bias = -BIAS * inv_dt * Math.min(0, c.sep + SLOP);
      c.r1x = r1x; c.r1y = r1y; c.r2x = r2x; c.r2y = r2y;
      const dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
      const dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
      const vn = -(dvx * nx + dvy * ny);
      if (vn > this.vn) { this.vn = vn; this.px = c.x; this.py = c.y; }
      const Px = c.Pn * nx + c.Pt * tx, Py = c.Pn * ny + c.Pt * ty;
      b1.vx -= im1 * Px; b1.vy -= im1 * Py; b1.w -= iI1 * (r1x * Py - r1y * Px);
      b2.vx += im2 * Px; b2.vy += im2 * Py; b2.w += iI2 * (r2x * Py - r2y * Px);
    }
    this.im1 = im1; this.im2 = im2; this.iI1 = iI1; this.iI2 = iI2;
  }
  solve() {
    const b1 = this.b1, b2 = this.b2, im1 = this.im1, im2 = this.im2, iI1 = this.iI1, iI2 = this.iI2;
    for (const c of this.cs) {
      const r1x = c.r1x, r1y = c.r1y, r2x = c.r2x, r2y = c.r2y, nx = c.nx, ny = c.ny;
      let dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
      let dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
      let dPn = c.mN * (-(dvx * nx + dvy * ny) + c.bias);
      const Pn0 = c.Pn; c.Pn = Math.max(Pn0 + dPn, 0); dPn = c.Pn - Pn0;
      let Px = dPn * nx, Py = dPn * ny;
      b1.vx -= im1 * Px; b1.vy -= im1 * Py; b1.w -= iI1 * (r1x * Py - r1y * Px);
      b2.vx += im2 * Px; b2.vy += im2 * Py; b2.w += iI2 * (r2x * Py - r2y * Px);
      dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
      dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
      const tx = ny, ty = -nx;
      let dPt = c.mT * -(dvx * tx + dvy * ty);
      const maxPt = this.fr * c.Pn, Pt0 = c.Pt;
      c.Pt = Math.max(-maxPt, Math.min(maxPt, Pt0 + dPt)); dPt = c.Pt - Pt0;
      Px = dPt * tx; Py = dPt * ty;
      b1.vx -= im1 * Px; b1.vy -= im1 * Py; b1.w -= iI1 * (r1x * Py - r1y * Px);
      b2.vx += im2 * Px; b2.vy += im2 * Py; b2.w += iI2 * (r2x * Py - r2y * Px);
    }
  }
}

// ------------------------------------------------------------------ joints
// Weld: a point constraint plus an angle lock. Breaks when the force or the
// torque it carried during a step passes its strength.
export class Weld {
  constructor(b1, b2, wx, wy, force, torque) {
    this.b1 = b1; this.b2 = b2;
    [this.l1x, this.l1y] = b1.toLocal(wx, wy);
    [this.l2x, this.l2y] = b2.toLocal(wx, wy);
    this.ref = b2.a - b1.a;
    this.force = force; this.torque = torque;
    this.Px = 0; this.Py = 0; this.Pa = 0;
    this.broken = false; this.weak = 1; this.sf = 0; this.st = 0;
  }
  preStep(inv_dt) {
    const b1 = this.b1, b2 = this.b2;
    const im1 = b1.awake ? b1.im : 0, im2 = b2.awake ? b2.im : 0, iI1 = b1.awake ? b1.iI : 0, iI2 = b2.awake ? b2.iI : 0;
    const r1x = b1.c * this.l1x - b1.s * this.l1y, r1y = b1.s * this.l1x + b1.c * this.l1y;
    const r2x = b2.c * this.l2x - b2.s * this.l2y, r2y = b2.s * this.l2x + b2.c * this.l2y;
    // coupled 3x3 effective mass (point x, point y, angle), inverted once per step
    const a11 = im1 + im2 + iI1 * r1y * r1y + iI2 * r2y * r2y;
    const a12 = -iI1 * r1x * r1y - iI2 * r2x * r2y;
    const a13 = -iI1 * r1y - iI2 * r2y;
    const a22 = im1 + im2 + iI1 * r1x * r1x + iI2 * r2x * r2x;
    const a23 = iI1 * r1x + iI2 * r2x;
    const a33 = iI1 + iI2;
    const c11 = a22 * a33 - a23 * a23, c12 = a13 * a23 - a12 * a33, c13 = a12 * a23 - a13 * a22;
    const c22 = a11 * a33 - a13 * a13, c23 = a13 * a12 - a11 * a23, c33 = a11 * a22 - a12 * a12;
    const det = a11 * c11 + a12 * c12 + a13 * c13, id = det ? 1 / det : 0;
    this.k = [c11 * id, c12 * id, c13 * id, c22 * id, c23 * id, c33 * id];
    const ex = b2.x + r2x - b1.x - r1x, ey = b2.y + r2y - b1.y - r1y;
    this.bx = -TUNE.jbeta * inv_dt * ex; this.by = -TUNE.jbeta * inv_dt * ey;
    let C = b2.a - b1.a - this.ref;
    this.ba = -TUNE.jbetaA * inv_dt * C;
    this.Px *= TUNE.jwarm; this.Py *= TUNE.jwarm; this.Pa *= TUNE.jwarm;
    this.r1x = r1x; this.r1y = r1y; this.r2x = r2x; this.r2y = r2y;
    this.im1 = im1; this.im2 = im2; this.iI1 = iI1; this.iI2 = iI2;
    const Px = this.Px, Py = this.Py;
    b1.vx -= im1 * Px; b1.vy -= im1 * Py; b1.w -= iI1 * (r1x * Py - r1y * Px + this.Pa);
    b2.vx += im2 * Px; b2.vy += im2 * Py; b2.w += iI2 * (r2x * Py - r2y * Px + this.Pa);
  }
  solve() {
    const b1 = this.b1, b2 = this.b2, im1 = this.im1, im2 = this.im2, iI1 = this.iI1, iI2 = this.iI2;
    const r1x = this.r1x, r1y = this.r1y, r2x = this.r2x, r2y = this.r2y;
    const dvx = b2.vx - b2.w * r2y - b1.vx + b1.w * r1y;
    const dvy = b2.vy + b2.w * r2x - b1.vy - b1.w * r1x;
    const qx = this.bx - dvx, qy = this.by - dvy, qa = this.ba - (b2.w - b1.w);
    const k = this.k;
    const Px = k[0] * qx + k[1] * qy + k[2] * qa;
    const Py = k[1] * qx + k[3] * qy + k[4] * qa;
    const Pa = k[2] * qx + k[4] * qy + k[5] * qa;
    this.Px += Px; this.Py += Py; this.Pa += Pa;
    b1.vx -= im1 * Px; b1.vy -= im1 * Py; b1.w -= iI1 * (r1x * Py - r1y * Px + Pa);
    b2.vx += im2 * Px; b2.vy += im2 * Py; b2.w += iI2 * (r2x * Py - r2y * Px + Pa);
  }
}

// Rope: keeps b1 within len of an anchor (a kinematic point, or body b2's centre).
export class Rope {
  constructor(b1, b2, len) { this.b1 = b1; this.b2 = b2; this.len = len; this.ax = 0; this.ay = 0; this.avx = 0; this.avy = 0; this.P = 0; this.on = false; this.tension = 0; }
  preStep(inv_dt) {
    const b1 = this.b1, b2 = this.b2;
    const ax = b2 ? b2.x : this.ax, ay = b2 ? b2.y : this.ay;
    const dx = b1.x - ax, dy = b1.y - ay, d = Math.hypot(dx, dy) || 1e-6;
    this.nx = dx / d; this.ny = dy / d;
    const C = d - this.len;
    this.on = C > -0.02;
    if (!this.on) { this.P = 0; return; }
    const im2 = b2 ? b2.im : 0;
    this.mass = 1 / (b1.im + im2);
    this.bias = C > 0 ? -0.25 * inv_dt * C : 0;
    const Px = this.P * this.nx, Py = this.P * this.ny;
    b1.vx += b1.im * Px; b1.vy += b1.im * Py;
    if (b2) { b2.vx -= im2 * Px; b2.vy -= im2 * Py; }
  }
  solve() {
    if (!this.on) return;
    const b1 = this.b1, b2 = this.b2;
    const avx = b2 ? b2.vx : this.avx, avy = b2 ? b2.vy : this.avy;
    const vn = (b1.vx - avx) * this.nx + (b1.vy - avy) * this.ny;
    let l = this.mass * (-vn + this.bias);
    const P0 = this.P; this.P = Math.min(P0 + l, 0); l = this.P - P0;
    b1.vx += b1.im * l * this.nx; b1.vy += b1.im * l * this.ny;
    if (b2) { b2.vx -= b2.im * l * this.nx; b2.vy -= b2.im * l * this.ny; }
  }
}

// welded pairs do not also collide (the weld already holds them; both together fight)
function linked(A, B) { const js = A.joints.length < B.joints.length ? A.joints : B.joints; for (const j of js) if ((j.b1 === A && j.b2 === B) || (j.b1 === B && j.b2 === A)) return true; return false; }

// ------------------------------------------------------------------ world
export class World {
  constructor() {
    this.bodies = []; this.joints = []; this.ropes = [];
    this.arbs = new Map();
    this.g = -20; this.iter = 16; this.lastDt = 0; this.frame = 0; this.nid = 1;
    this.onImpact = null; this.onBreak = null;
    this.impactMin = 2;
    this.stats = { awake: 0, arbs: 0, ms: 0 };
    this._tmp = [];
  }
  add(b) { b.id = this.nid++; this.bodies.push(b); return b; }
  weld(b1, b2, wx, wy, force, torque) {
    if (b1.static && !b2.static) { const t = b1; b1 = b2; b2 = t; }
    const j = new Weld(b1, b2, wx, wy, force, torque);
    this.joints.push(j); b1.joints.push(j); b2.joints.push(j);
    return j;
  }
  rope(b1, b2, len) { const r = new Rope(b1, b2, len); this.ropes.push(r); return r; }
  breakJoint(j) {
    if (j.broken) return;
    j.broken = true; j.b1.wake(); j.b2.wake();
    j.b1.joints = j.b1.joints.filter((k) => k !== j);
    j.b2.joints = j.b2.joints.filter((k) => k !== j);
    this._jdirty = true;
  }
  remove(b) {
    if (b.dead) return;
    b.dead = true;
    for (const j of b.joints.slice()) this.breakJoint(j);
    for (const a of this.arbs.values()) if (a.b1 === b) a.b2.wake(); else if (a.b2 === b) a.b1.wake();
    this._bdirty = true;
  }
  // build every contact once so a sleeping city has its arbiters ready (no sag on first wake)
  prime() { this.collidePairs(true); }

  collidePairs(all) {
    const bs = this.bodies;
    for (const b of bs) if (b.awake || all) b.bounds();
    // insertion sort by minX (mostly sorted frame to frame)
    for (let i = 1; i < bs.length; i++) {
      const b = bs[i]; let j = i - 1;
      while (j >= 0 && bs[j].minX > b.minX) { bs[j + 1] = bs[j]; j--; }
      bs[j + 1] = b;
    }
    const f = this.frame, tmp = this._tmp;
    for (let i = 0; i < bs.length; i++) {
      const A = bs[i];
      for (let j = i + 1; j < bs.length; j++) {
        const B = bs[j];
        if (B.minX > A.maxX) break;
        if (!all && !A.awake && !B.awake) continue;
        if (A.static && B.static) continue;
        if (Math.abs(A.y - B.y) > A.ey + B.ey) continue;
        if (A.data && B.data && A.data.ghost === B.data.ghost && A.data.ghost) continue;
        if (linked(A, B)) continue;
        let b1 = A, b2 = B;
        if (b1.id > b2.id) { b1 = B; b2 = A; }
        const key = b1.id * 131072 + b2.id;
        tmp.length = 0;
        const n = collide(b1, b2, tmp);
        let arb = this.arbs.get(key);
        if (n) {
          if (!arb) { arb = new Arbiter(b1, b2); this.arbs.set(key, arb); }
          arb.update(tmp.slice());
          arb.stamp = f;
        } else if (arb) this.arbs.delete(key);
      }
    }
    for (const [k, a] of this.arbs) {
      if (a.b1.dead || a.b2.dead) { this.arbs.delete(k); continue; }
      if (a.stamp !== f && (a.b1.awake || a.b2.awake || all)) this.arbs.delete(k);
    }
  }

  step(dt) {
    const t0 = performance.now();
    const inv_dt = 1 / dt;
    this.frame++;
    // keep warm-start impulses consistent when the step length changes (slow-mo)
    if (this.lastDt && Math.abs(dt - this.lastDt) > 1e-6) {
      const k = dt / this.lastDt;
      for (const a of this.arbs.values()) for (const c of a.cs) { c.Pn *= k; c.Pt *= k; }
      for (const j of this.joints) { j.Px *= k; j.Py *= k; j.Pa *= k; }
      for (const r of this.ropes) r.P *= k;
    }
    this.lastDt = dt;
    if (this._bdirty) { this.bodies = this.bodies.filter((b) => !b.dead); this._bdirty = false; }
    if (this._jdirty) { this.joints = this.joints.filter((j) => !j.broken); this._jdirty = false; }
    this.collidePairs(false);

    // islands: union-find over contacts, joints and ropes
    const bs = this.bodies;
    const n = bs.length;
    const par = this._par && this._par.length >= n ? this._par : (this._par = new Int32Array(n * 2 + 16));
    for (let i = 0; i < n; i++) { bs[i].idx = i; par[i] = i; }
    const find = (i) => { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; };
    const uni = (a, b) => { if (a.static || b.static) return; const x = find(a.idx), y = find(b.idx); if (x !== y) par[x] = y; };
    for (const a of this.arbs.values()) uni(a.b1, a.b2);
    for (const j of this.joints) uni(j.b1, j.b2);
    for (const r of this.ropes) if (r.b2) uni(r.b1, r.b2);
    const flag = this._flag && this._flag.length >= n ? this._flag : (this._flag = new Uint8Array(n * 2 + 16));
    flag.fill(0, 0, n);
    for (let i = 0; i < n; i++) if (bs[i].awake) flag[find(i)] = 1;
    let awake = 0;
    for (let i = 0; i < n; i++) { const b = bs[i]; if (!b.static && !b.awake && flag[find(i)]) b.wake(); if (b.awake) awake++; }
    this.stats.awake = awake;

    // forces
    const g = this.g;
    for (const b of bs) {
      if (!b.awake) continue;
      b.vy += g * dt;
      const ld = 1 - 0.02 * dt, ad = 1 - 0.3 * dt;
      b.vx *= ld; b.vy *= ld; b.w *= ad;
    }
    const arbs = [];
    for (const a of this.arbs.values()) if (a.b1.awake || a.b2.awake) arbs.push(a);
    const js = []; for (const j of this.joints) if (j.b1.awake || j.b2.awake) js.push(j);
    this.stats.arbs = arbs.length;
    for (const a of arbs) a.preStep(inv_dt);
    for (const j of js) j.preStep(inv_dt);
    for (const r of this.ropes) r.preStep(inv_dt);
    for (let it = 0; it < this.iter; it++) {
      for (const a of arbs) a.solve();
      for (const j of js) j.solve();
      for (const r of this.ropes) r.solve();
    }
    for (const r of this.ropes) r.tension = -r.P * inv_dt;
    // integrate
    for (const b of bs) {
      if (!b.awake) continue;
      const sp = b.vx * b.vx + b.vy * b.vy;
      if (sp > 2500) { const k = 50 / Math.sqrt(sp); b.vx *= k; b.vy *= k; }
      b.x += b.vx * dt; b.y += b.vy * dt; b.a += b.w * dt;
      b.c = Math.cos(b.a); b.s = Math.sin(b.a);
    }
    // impacts
    if (this.onImpact) for (const a of arbs) { if (a.vn > this.impactMin) this.onImpact(a, a.vn); }
    // joint breaks
    for (const j of js) {
      if (j.broken) continue;
      // low-passed load, so a one-substep spike at impact does not snap welds across the building
      const F = Math.hypot(j.Px, j.Py) * inv_dt, T = Math.abs(j.Pa) * inv_dt;
      j.sf += (F - j.sf) * TUNE.stressK; j.st += (T - j.st) * TUNE.stressK;
      if (j.sf > j.force * j.weak || j.st > j.torque * j.weak) { this.breakJoint(j); if (this.onBreak) this.onBreak(j, F); }
    }
    // sleep
    const minT = this._minT && this._minT.length >= n ? this._minT : (this._minT = new Float32Array(n * 2 + 16));
    minT.fill(1e9, 0, n);
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (!b.awake) continue;
      if (b.noSleep) b.sleepT = 0;
      else if (b.vx * b.vx + b.vy * b.vy < SLEEP_V && b.w * b.w < SLEEP_W) b.sleepT += dt; else b.sleepT = 0;
      const r = find(i); if (b.sleepT < minT[r]) minT[r] = b.sleepT;
    }
    for (let i = 0; i < n; i++) {
      const b = bs[i];
      if (b.awake && minT[find(i)] >= SLEEP_TIME) { b.awake = false; b.vx = 0; b.vy = 0; b.w = 0; b.bounds(); }
    }
    this.stats.ms = performance.now() - t0;
  }

  // query bodies whose centre is within radius
  near(x, y, r) { const out = []; for (const b of this.bodies) if (!b.static && !b.dead && (b.x - x) ** 2 + (b.y - y) ** 2 < (r + b.ex) ** 2) out.push(b); return out; }
}
