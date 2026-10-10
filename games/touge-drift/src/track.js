// An endless road, generated ahead of the car as a centre line of points
// 20 px apart. Straights, sweepers, hairpins and S-bends; it keeps drifting
// back toward "north" so it never loops onto itself near the car.
export const STEP = 20;

export class Track {
  constructor(seed = Math.random() * 1e9) {
    this.s = seed >>> 0 || 1;
    this.pts = [];      // { x, y, a (heading), w (half width), cp (checkpoint) }
    this.heading = -Math.PI / 2;
    this.x = 0; this.y = 0;
    this.queue = [];
    this.trees = []; this.deco = [];   // roadside scenery, tagged with the track index it sits beside
    this.made = 0;
    for (let i = 0; i < 30; i++) this.push(0);   // a straight run-up
    this.ensure(400);
  }
  r() { this.s = (this.s * 16807) % 2147483647; return this.s / 2147483647; }
  halfWidth(i) {
    // starts wide and narrows as you go
    const d = i * STEP;
    return Math.max(104, 140 - d / 1500);   // wide to start, narrowing slowly
  }
  push(curv) {
    this.heading += curv * STEP;
    this.x += Math.cos(this.heading) * STEP;
    this.y += Math.sin(this.heading) * STEP;
    const i = this.pts.length;
    const p = { x: this.x, y: this.y, a: this.heading, w: this.halfWidth(i), cp: i > 0 && i % 240 === 0, k: curv };
    this.pts.push(p);
    this.scenery(p, i, curv);
  }
  scenery(p, i, curv) {
    const r = () => this.r(), nx = -Math.sin(p.a), ny = Math.cos(p.a);
    const at = (side, off, jit = 0) => ({ x: p.x + nx * side * off + (r() - 0.5) * jit, y: p.y + ny * side * off + (r() - 0.5) * jit });
    for (const side of [-1, 1]) {
      // cedar forest: thick on both sides, never closer than the guardrail
      for (let k = 0; k < 2; k++) if (r() < 0.55) { const q = at(side, p.w + 56 + r() * 250, 26); this.trees.push({ i, x: q.x, y: q.y, r: 13 + r() * 20, t: Math.floor(r() * 4), s: r() }); }
      if (r() < 0.035) { const q = at(side, p.w + 38 + r() * 140, 10); this.deco.push({ i, kind: 'rock', x: q.x, y: q.y, r: 9 + r() * 16, a: r() * 6 }); }
    }
    if (i % 34 === 0 && i > 0) { const side = (i / 34) % 2 ? 1 : -1; const q = at(side, p.w + 22); this.deco.push({ i, kind: 'lamp', x: q.x, y: q.y, a: p.a, side }); }
    // chevron boards on the outside of real corners
    if (Math.abs(curv * 20) > 0.045 && i % 4 === 0) { const side = curv > 0 ? -1 : 1; const q = at(side, p.w + 20); this.deco.push({ i, kind: 'chev', x: q.x, y: q.y, a: p.a, side, dir: Math.sign(curv) }); }
    if (i > 60 && r() < 0.007) { const side = r() < 0.5 ? -1 : 1; const q = at(side, p.w + 44); this.deco.push({ i, kind: 'vend', x: q.x, y: q.y, a: p.a, side, c: r() < 0.5 ? '#d8262e' : '#2a6ad8' }); }
  }
  // items whose index is in [a, b] (lists are sorted by index)
  slice(list, a, b) {
    let lo = 0, hi = list.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (list[m].i < a) lo = m + 1; else hi = m; }
    const out = [];
    for (let k = lo; k < list.length && list[k].i <= b; k++) out.push(list[k]);
    return out;
  }
  // A corner is a total turn A (radians) over a radius R (px); the bend eases in and out.
  arc(A, R, dir, out) {
    const n = Math.max(4, Math.round((A * R) / STEP));
    for (let i = 0; i < n; i++) out.push((dir / R) * 1.5708 * Math.sin(((i + 0.5) / n) * Math.PI));
  }
  plan() {
    const r = () => this.r();
    const drift = this.heading + Math.PI / 2;            // how far we've turned away from north
    const hard = Math.min(1, this.pts.length / 1500);     // later on: tighter corners
    // turn back toward north when we've wandered; otherwise pick a side at random
    let dir = Math.abs(drift) > 0.5 ? -Math.sign(drift) : (r() < 0.5 ? -1 : 1);
    const room = 1.9 - Math.abs(drift + 0);                // never end up pointing much past sideways
    const seg = [];
    const t = r();
    if (t < 0.2 - hard * 0.08) {
      const n = 10 + Math.floor(r() * 16);
      for (let k = 0; k < n; k++) seg.push(0);
    } else if (t < 0.58) {
      const A = Math.min(0.6 + r() * 1.0, Math.max(0.5, drift * dir < 0 ? 2.2 : room));
      this.arc(A, 720 - hard * 220 - r() * 120, dir, seg);
    } else if (t < 0.84) {
      const A = 0.5 + r() * 0.45, R = 540 - hard * 140 - r() * 80;
      this.arc(A, R, dir, seg);
      for (let k = 0; k < 3; k++) seg.push(0);
      this.arc(A, R, -dir, seg);
    } else {
      // a proper hairpin, only when it turns us back toward north
      const A = Math.abs(drift) > 0.3 ? 1.5 + r() * 0.6 : 1.1 + r() * 0.4;
      this.arc(A, 430 - hard * 80, Math.abs(drift) > 0.3 ? -Math.sign(drift) : dir, seg);
    }
    for (let k = 0; k < 4; k++) seg.push(0);
    this.queue.push(...seg);
  }
  ensure(upTo) {
    while (this.pts.length < upTo) {
      if (!this.queue.length) this.plan();
      this.push(this.queue.shift());
    }
  }
  // nearest centre-line point to (x, y), searching around a hint index
  nearest(x, y, hint) {
    let best = hint, bd = Infinity;
    const a = Math.max(0, hint - 12), b = Math.min(this.pts.length - 1, hint + 30);
    for (let i = a; i <= b; i++) {
      const p = this.pts[i], d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  // signed sideways offset from the centre line (+ = right of travel)
  offset(x, y, i) {
    const p = this.pts[i];
    const nx = -Math.sin(p.a), ny = Math.cos(p.a);
    return (x - p.x) * nx + (y - p.y) * ny;
  }
}
