// The wobbly stack. Every piece hangs off the one below on a springy hinge
// (relative angle a, spin av) at the spot where it landed (dx along the
// piece below). Each hinge feels: its spring, damping, gravity pulling the
// weight above it further over, the bun's acceleration (accelerate right and
// the tower leans left), wind, and catch impacts. If the weight above a hinge
// ends up past the edge of the piece below, it topples.
import { FOOD } from './levels.js';

export const P = {
  K: 130,        // hinge spring (rad/s^2 per rad)
  KLOAD: 0.001,  // springs soften as more weight sits above
  D: 4.5,        // damping
  GRAV: 20,      // how hard leaning weight pulls further over
  LEVER: 120,    // softens the gravity lever for short stacks
  INER: 0.0035,  // how much bun acceleration throws the tower
  WIND: 7,       // wind push on the tower
  IMPACT: 0.016, // off-centre catch kick
  EDGE: 1.1,     // topple when the weight above passes this share of the half-width below
  BEND: 0.6,     // or when a single hinge bends this far (rad)
  TILT: 1.35,    // or when any piece tips this far from level (rad)
  SLIDE_G: 1200, // sauce: downhill pull on a slipping piece
  MU: 380,       // sauce: friction (px/s^2)
  SAUCE_K: 0.65, // sauce: hinge springs above a sauced piece are softer
};

let SEED = 1;
export function makePiece(kind) {
  const f = FOOD[kind];
  return { kind, h: f.h, w: f.w, m: f.m, dx: 0, dxv: 0, a: 0, av: 0, sq: 0, sqv: 0, sauced: false, ok: false, seed: (SEED++ * 7.31) % 10,
    px: 0, py: 0, phi: 0, cx: 0, cy: 0, pcx: 0, pcy: 0, tx: 0, ty: 0 };
}

export class Stack {
  constructor(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.ax = 0;
    this.pieces = [makePiece('bun')];
    this.danger = 0; this.dangerAt = 0;
    this.fk();
  }
  get top() { return this.pieces[this.pieces.length - 1]; }
  get count() { return this.pieces.length - 1; }

  // forward kinematics: bottom centre (px,py), world angle phi, centre (cx,cy), top centre (tx,ty)
  fk() {
    const ps = this.pieces;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (i === 0) { p.px = this.x; p.py = this.y; p.phi = p.a; }
      else {
        const q = ps[i - 1];
        const c = Math.cos(q.phi), s = Math.sin(q.phi);
        p.px = q.tx + c * p.dx; p.py = q.ty + s * p.dx;
        p.phi = q.phi + p.a;
      }
      const hh = p.h * (1 - p.sq * 0.6);
      const c = Math.cos(p.phi), s = Math.sin(p.phi);
      p.cx = p.px + s * hh / 2; p.cy = p.py - c * hh / 2;
      p.tx = p.px + s * hh; p.ty = p.py - c * hh;
    }
  }

  // one physics step; returns the index of the hinge that gave way, or -1
  step(dt, wind = 0) {
    const ps = this.pieces, n = ps.length;
    for (const p of ps) { p.pcx = p.cx; p.pcy = p.cy; }
    // weight above each hinge (from the top down)
    let M = 0, MX = 0, MY = 0;
    const comX = new Array(n), comY = new Array(n), mass = new Array(n);
    for (let i = n - 1; i >= 1; i--) {
      const p = ps[i]; M += p.m; MX += p.m * p.cx; MY += p.m * p.cy;
      comX[i] = MX / M; comY[i] = MY / M; mass[i] = M;
    }
    let broke = -1, danger = 0, dangerAt = 0;
    for (let i = 1; i < n; i++) {
      const p = ps[i], below = ps[i - 1];
      const H = Math.max(1, p.py - comY[i]);
      const lever = H / (H + P.LEVER);
      const s = (comX[i] - p.px) / (H + P.LEVER);
      let K = P.K / (1 + P.KLOAD * mass[i] * H);
      if (below.sauced) K *= P.SAUCE_K;
      const acc = -K * p.a - P.D * p.av + P.GRAV * s - this.ax * P.INER * lever + wind * P.WIND * lever;
      p.av += acc * dt;
      // squash spring (visual)
      p.sqv += (-p.sq * 420 - p.sqv * 16) * dt;
      // sauce: slide along the piece below
      if (below.sauced) {
        const drive = P.SLIDE_G * Math.sin(below.phi) - this.ax * 0.12 * Math.cos(below.phi);
        p.dxv += drive * dt;
        const fr = P.MU * dt;
        if (Math.abs(p.dxv) <= fr && Math.abs(drive) < P.MU * 1.3) p.dxv = 0; else p.dxv -= Math.sign(p.dxv) * fr;
        p.dx += p.dxv * dt;
      }
      // topple test: weight above past the edge of the piece below?
      const off = Math.abs(comX[i] - below.tx);
      const lim = (below.w / 2) * P.EDGE;
      const d = Math.max(off / lim, Math.abs(p.a) / P.BEND, Math.abs(p.phi) / P.TILT, below.sauced ? Math.abs(p.dx) / (below.w / 2) : 0);
      if (d > danger) { danger = d; dangerAt = i; }
      if (broke < 0 && d >= 1) { broke = i; this.why = { i, n: n - 1, off: +(off / lim).toFixed(2), bend: +(Math.abs(p.a) / P.BEND).toFixed(2), tilt: +(Math.abs(p.phi) / P.TILT).toFixed(2), slide: below.sauced ? +(Math.abs(p.dx) / (below.w / 2)).toFixed(2) : 0, ax: Math.round(this.ax) }; }
    }
    for (let i = 1; i < n; i++) { const p = ps[i]; p.a += p.av * dt; p.sq += p.sqv * dt; }
    ps[0].sqv += (-ps[0].sq * 420 - ps[0].sqv * 16) * dt; ps[0].sq += ps[0].sqv * dt;
    this.danger = danger; this.dangerAt = dangerAt;
    this.fk();
    return broke;
  }

  // world-space velocity of piece i's centre (from the last step)
  vel(i, dt) { const p = this.pieces[i]; return { x: (p.cx - p.pcx) / dt, y: (p.cy - p.pcy) / dt }; }

  // where a falling thing at (x, bottomY) is relative to the top surface: lx along it, ly below it (+ = through)
  local(x, by) {
    const t = this.top, c = Math.cos(t.phi), s = Math.sin(t.phi);
    const rx = x - t.tx, ry = by - t.ty;
    return { lx: rx * c + ry * s, ly: -rx * s + ry * c };
  }

  add(kind, dx, vy, vxRel) {
    const p = makePiece(kind);
    p.dx = dx; p.sq = 0.55; p.sqv = 0;
    const below = this.top;
    if (below.sauced) p.dxv = vxRel * 0.4;
    this.pieces.push(p);
    // impact: off-centre catches kick every hinge, the higher the harder; everything squashes
    const n = this.pieces.length;
    const kick = (dx / (below.w / 2)) * (vy / 400) * P.IMPACT * p.m * 60;
    for (let i = 1; i < n; i++) {
      const q = this.pieces[i];
      q.av += kick * (0.35 + 0.65 * i / (n - 1));
      if (i < n - 1) q.sqv += 1.8 * (vy / 400) * (i / n) * p.m;
    }
    this.pieces[0].sqv += 1.2 * (vy / 400);
    this.fk();
    return p;
  }

  // remove pieces from index i up; returns them (with world pose) for debris
  cut(i) { return this.pieces.splice(i); }
}
