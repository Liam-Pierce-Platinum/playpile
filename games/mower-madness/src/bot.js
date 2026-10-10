// Autopilot for tests (?bot=1). Plans straight lanes along the long side of the lawn,
// split into segments around anything it should not touch, then drives them nearest-first
// (boustrophedon), using a breadth-first path between segments. Leftovers: nearest uncut cell.
import { CELL } from './lawn.js';

export class Bot {
  constructor(G) {
    this.G = G;
    const L = G.lawn, hw = G.spec.deck / 2;
    this.axis = L.w >= L.h ? 0 : 1;
    const spacing = G.spec.deck * 0.82;
    const free = (x, y) => { const k = L.idx(x, y); return k >= 0 && !G.block[k]; };
    this.segs = [];
    const A = this.axis ? L.h : L.w, B = this.axis ? L.w : L.h;
    for (let lat = hw * 0.75; lat < B - 8; lat += spacing) {
      let s0 = null;
      for (let a = 0; a <= A; a += CELL / 2) {
        let ok = a < A;
        if (ok) for (const o of [-0.65, 0, 0.65]) { const l = lat + o * hw; const [x, y] = this.axis ? [l, a] : [a, l]; if (!free(x, y)) { ok = false; break; } }
        if (ok && s0 === null) s0 = a;
        if (!ok && s0 !== null) { if (a - s0 > 40) this.segs.push({ lat, a0: s0 + 10, a1: a - 14, done: false }); s0 = null; }
      }
    }
    this.cur = null; this.dir = 1; this.phase = 'pick'; this.path = null; this.pathT = 0; this.stuckT = 0; this.last = [G.m.x, G.m.y];
  }
  pt(seg, a) { return this.axis ? [seg.lat, a] : [a, seg.lat]; }
  uncutLeft(seg) {
    const L = this.G.lawn; let n = 0, u = 0;
    for (let a = seg.a0; a <= seg.a1; a += CELL) { const [x, y] = this.pt(seg, a); const k = L.idx(x, y); if (k >= 0 && L.kind[k] === 1) { n++; if (!L.cut[k]) u++; } }
    return n ? u / n : 0;
  }
  input() {
    const G = this.G, m = G.m, L = G.lawn;
    // unstick
    this.stuckT += 1 / 120;
    if (this.stuckT > 1.5) {
      if (Math.hypot(m.x - this.last[0], m.y - this.last[1]) < 20 && G.phase === 'go') { this.esc = 0.5; this.escA = Math.random() * Math.PI * 2; if (this.cur) this.cur.done = true; this.phase = 'pick'; }
      this.stuckT = 0; this.last = [m.x, m.y];
    }
    if (this.esc > 0) { this.esc -= 1 / 120; return [Math.cos(this.escA), Math.sin(this.escA)]; }
    if (this.phase === 'pick') {
      let best = null, bd = 1e9, bdir = 1;
      for (const s of this.segs) {
        if (s.done) continue;
        if (this.uncutLeft(s) < 0.15) { s.done = true; continue; }
        for (const [a, d] of [[s.a0, 1], [s.a1, -1]]) {
          const [x, y] = this.pt(s, a), dist = Math.hypot(x - m.x, y - m.y);
          if (dist < bd) { bd = dist; best = s; bdir = d; }
        }
      }
      if (!best) { this.phase = 'leftovers'; }
      else { this.cur = best; this.dir = bdir; this.phase = 'go'; this.path = null; }
    }
    if (this.phase === 'go') {
      const s = this.cur, [tx, ty] = this.pt(s, this.dir > 0 ? s.a0 : s.a1);
      const d = Math.hypot(tx - m.x, ty - m.y);
      if (d < 18) { this.phase = 'lane'; }
      else { const v = this.steerTo(tx, ty), k = d < 70 ? 0.5 : 1; return [v[0] * k, v[1] * k]; }
    }
    if (this.phase === 'lane') {
      const s = this.cur, endA = this.dir > 0 ? s.a1 : s.a0, along = this.axis ? m.y : m.x, lat = this.axis ? m.x : m.y;
      if ((endA - along) * this.dir < 6) { s.done = true; this.phase = 'pick'; return [0, 0]; }
      const c = Math.max(-0.3, Math.min(0.3, (s.lat - lat) * 0.03));
      const want = this.axis ? Math.atan2(this.dir, c) : Math.atan2(c, this.dir);
      let off = Math.abs(want - m.a) % (Math.PI * 2); if (off > Math.PI) off = Math.PI * 2 - off;
      const k = off > 0.35 ? 0.3 : 1;
      return this.axis ? [c * k, this.dir * k] : [this.dir * k, c * k];
    }
    // leftovers: nearest uncut cell
    this.pathT -= 1 / 120;
    if (this.pathT <= 0 || !this.path) {
      this.pathT = 0.25;
      this.path = L.nearestUncut(m.x, m.y, G.block) || L.nearestUncut(m.x, m.y, G.near, null, G.block) || L.nearestUncut(m.x, m.y, G.near) || L.nearestUncut(m.x, m.y, G.hard, null, G.near);
      this.slow = !L.nearestUncut(m.x, m.y, G.near, null, G.block);
    }
    if (!this.path) return [0, 0];
    const [tx, ty] = L.cellXY(this.path[Math.min(this.path.length - 1, 5)]);
    const v = this.dirTo(tx, ty), k = this.slow ? 0.45 : 0.8;
    return [v[0] * k, v[1] * k];
  }
  dirTo(tx, ty) { const m = this.G.m, dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy) || 1; return [dx / l, dy / l]; }
  steerTo(tx, ty) {
    const G = this.G, m = G.m, L = G.lawn;
    // straight line clear of hard obstacles? then just go
    const dx = tx - m.x, dy = ty - m.y, l = Math.hypot(dx, dy);
    let clear = true;
    const hw = G.spec.deck / 2, ux = dx / l, uy = dy / l;
    for (let t = 24; t < l && clear; t += CELL) for (const o of [-0.8, 0, 0.8]) { const k = L.idx(m.x + ux * t - uy * o * hw, m.y + uy * t + ux * o * hw); if (k < 0 || G.block[k]) { clear = false; break; } }
    if (clear) return [dx / l, dy / l];
    this.pathT -= 1 / 120;
    if (this.pathT <= 0 || !this.path) { this.pathT = 0.3; this.path = this.bfsTo(m.x, m.y, tx, ty); }
    if (!this.path) { if (this.cur) this.cur.done = true; this.phase = 'pick'; return [0, 0]; }
    // drop path cells we've passed
    while (this.path.length > 1) { const [px, py] = L.cellXY(this.path[0]); if (Math.hypot(px - m.x, py - m.y) < 20) this.path.shift(); else break; }
    const [px, py] = L.cellXY(this.path[Math.min(this.path.length - 1, 3)]);
    const v = this.dirTo(px, py);
    return [v[0] * 0.65, v[1] * 0.65];
  }
  bfsTo(x, y, tx, ty) {
    const G = this.G, L = G.lawn, { cw, ch } = L, N = cw * ch;
    const s = L.idx(x, y), goal = L.idx(tx, ty);
    if (s < 0 || goal < 0) return null;
    const prev = new Int32Array(N).fill(-2), q = new Int32Array(N), dep = new Uint16Array(N);
    const blk = G.block;
    let h = 0, t = 0; q[t++] = s; prev[s] = -1; dep[s] = blk[s] ? 1 : 0;
    while (h < t) {
      const k = q[h++];
      if (k === goal) { const p = []; for (let c = k; c !== -1; c = prev[c]) p.push(c); return p.reverse(); }
      const i = k % cw, j = (k / cw) | 0;
      for (const n of [i > 0 ? k - 1 : -1, i < cw - 1 ? k + 1 : -1, j > 0 ? k - cw : -1, j < ch - 1 ? k + cw : -1]) {
        if (n < 0 || prev[n] !== -2) continue;
        if (G.hard[n] || (blk[n] && n !== goal && !dep[k])) continue; // may cross a soft zone only on the way out of the one it started in
        dep[n] = dep[k] && blk[n] ? 1 : 0;
        prev[n] = k; q[t++] = n;
      }
    }
    return null;
  }
}
