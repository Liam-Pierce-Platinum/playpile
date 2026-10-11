// The live world of one run: terrain + hazards with their own little state
// machines (see-saws, drawbridges, collapsing planks, crates, TNT, boulders,
// fans, lava, pits). Hazards talk back to the game through `fx` callbacks.
import { THEMES } from './levels.js';
import { Roller, GRAV } from './physics.js';
import { HEAD_R } from './bikes.js';

function mkSeg(props) {
  return Object.assign({ ax: 0, ay: 0, bx: 0, by: 0, tx: 1, ty: 0, nx: 0, ny: -1, len: 1, mu: 1, conv: 0, kind: 'obj', gate: null, off: false, x0: 0, x1: 0, y0: 0, y1: 0 }, props);
}
function setSeg(s, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy) || 1;
  s.ax = ax; s.ay = ay; s.bx = bx; s.by = by; s.len = len; s.tx = dx / len; s.ty = dy / len; s.nx = s.ty; s.ny = -s.tx;
  s.x0 = Math.min(ax, bx); s.x1 = Math.max(ax, bx); s.y0 = Math.min(ay, by); s.y1 = Math.max(ay, by);
}

// ------------------------------------------------------------------ hazards
class Seesaw {
  constructor(d) {
    Object.assign(this, d);
    this.I = 90000; this.iI = 1 / this.I; this.im = 0; this.vx = 0; this.vy = 0;
    this.top = mkSeg({ owner: this, kind: 'plank', mu: 1.1 });
    this.segs = [this.top];
    this.reset();
  }
  reset() { this.th = this.th0; this.w = 0; this.place(); }
  place() {
    const c = Math.cos(this.th), s = Math.sin(this.th), h = 8, L = this.L;
    const ax = this.cx + c * -L - s * -h, ay = this.cy + s * -L + c * -h;
    const bx = this.cx + c * L - s * -h, by = this.cy + s * L + c * -h;
    setSeg(this.top, ax, ay, bx, by);
  }
  update(dt, w) {
    this.w += -70000 * this.iI * dt; // heavier on the left: it resets itself
    this.w *= 1 - 1.2 * dt;
    this.th += this.w * dt;
    if (this.th < this.th0) { if (this.w < -0.9) w.fx.thud(this.cx - this.L, this.gy, Math.min(1, -this.w / 3)); this.th = this.th0; this.w = Math.max(0, this.w); }
    if (this.th > this.thMax) { if (this.w > 0.9) w.fx.thud(this.cx + this.L, this.gy, Math.min(1, this.w / 3)); this.th = this.thMax; this.w = Math.min(0, this.w); }
    this.place();
  }
}

class Plank {
  constructor(d) {
    Object.assign(this, d);
    this.cx = this.x; this.cy = this.y; this.vx = 0; this.vy = 0; this.w = 0; this.im = 0; this.iI = 0;
    this.seg = mkSeg({ owner: this, kind: 'plank', mu: 1 });
    this.segs = [this.seg];
    this.reset();
  }
  reset() { this.state = 'idle'; this.t = 0; this.dy = 0; this.fvy = 0; this.rot = 0; this.seg.off = false; setSeg(this.seg, this.x, this.y - 2, this.x + this.pw, this.y - 2); }
  onTouch() { if (this.state === 'idle') { this.state = 'shake'; this.t = 0; this.creak = true; } }
  update(dt, w) {
    if (this.state === 'shake') {
      this.t += dt;
      if (this.creak) { this.creak = false; w.fx.sfx('creak'); }
      if (this.t > 0.32) { this.state = 'fall'; this.seg.off = true; this.spin = (Math.random() - 0.5) * 4; w.fx.sfx('crack'); w.fx.chips(this.x + this.pw / 2, this.y, '#a8743f'); }
    } else if (this.state === 'fall') {
      this.fvy += GRAV * dt; this.dy += this.fvy * dt; this.rot += this.spin * dt;
    }
  }
}

class Drawbridge {
  constructor(d) {
    Object.assign(this, d);
    this.cx = this.hx; this.cy = this.hy; this.vx = 0; this.vy = 0; this.w = 0; this.im = 0; this.iI = 0;
    this.topS = mkSeg({ owner: this, kind: 'plank', mu: 1.1 });
    this.botS = mkSeg({ owner: this, kind: 'plank', mu: 1.1 });
    this.segs = [this.topS, this.botS];
    this.reset();
  }
  reset() { this.t = this.phase; this.phi = this.angle(this.t); this.w = 0; this.place(); }
  raise(t) {
    const P = this.period, u = ((t % P) + P) % P;
    const e = (x) => x * x * (3 - 2 * x);
    if (u < 2.4) return 0;
    if (u < 3.0) return e((u - 2.4) / 0.6);
    if (u < 4.2) return 1;
    return 1 - e((u - 4.2) / 0.6);
  }
  angle(t) { return Math.PI + 1.42 * this.raise(t); }
  place() {
    const c = Math.cos(this.phi), s = Math.sin(this.phi), h = 7, L = this.L;
    const px = -s, py = c;
    const fx = this.hx + c * L, fy = this.hy + s * L;
    setSeg(this.topS, fx + px * h, fy + py * h, this.hx + px * h, this.hy + py * h);
    setSeg(this.botS, this.hx - px * h, this.hy - py * h, fx - px * h, fy - py * h);
  }
  update(dt, w) {
    const prev = this.phi;
    const r0 = this.raise(this.t);
    this.t += dt;
    this.phi = this.angle(this.t);
    this.w = (this.phi - prev) / dt;
    const r1 = this.raise(this.t);
    if (r0 === 0 && r1 > 0) w.fx.sfx('chain', this.hx);
    if (r0 > 0 && r1 === 0) w.fx.thud(this.hx - this.L, this.hy, 0.6);
    this.place();
  }
}

class Crate {
  constructor(d) {
    Object.assign(this, d);
    this.cx = this.x; this.cy = this.gy; this.vx = 0; this.vy = 0; this.w = 0; this.im = 0; this.iI = 0;
    this.topS = mkSeg({ owner: this, kind: 'crate', mu: 1 });
    this.sideS = mkSeg({ owner: this, kind: 'crate', mu: 0.6 });
    this.segs = [this.topS, this.sideS];
    this.reset();
  }
  reset() { this.state = 'wait'; this.y = this.gy - 900; this.fvy = 0; this.squash = 0; this.topS.off = this.sideS.off = true; this.rot = 0; }
  box() { return { x0: this.x - this.s / 2, x1: this.x + this.s / 2, y0: this.y - this.s, y1: this.y }; }
  update(dt, w) {
    const bike = w.bike;
    if (this.state === 'wait' && bike && bike.c.x > this.x - 1300) { this.state = 'fall'; this.y = this.gy - 480; w.fx.sfx('whistle', this.x); }
    if (this.state === 'fall') {
      this.fvy += GRAV * 1.6 * dt; this.y += this.fvy * dt;
      if (this.y >= this.gy) { this.y = this.gy; this.state = 'rest'; this.squash = 1; w.fx.thud(this.x, this.gy, 0.8); w.fx.shake(5); this.topS.off = this.sideS.off = false; }
    }
    if (this.squash > 0) this.squash = Math.max(0, this.squash - dt * 4);
    if (this.state === 'rest') {
      const b = this.box();
      setSeg(this.topS, b.x0, b.y0, b.x1, b.y0);
      setSeg(this.sideS, b.x0, b.y1, b.x0, b.y0);
    }
  }
  smash(w) {
    this.state = 'smashed'; this.topS.off = this.sideS.off = true;
    w.fx.smash(this.x, this.y - this.s / 2);
  }
}

class Tnt {
  constructor(d) { Object.assign(this, d); this.reset(); }
  reset() { this.state = 'live'; this.fuse = 0; }
  update(dt, w) {
    if (this.state === 'fuse') { this.fuse -= dt; if (this.fuse <= 0) this.boom(w); }
  }
  boom(w) { if (this.state === 'gone') return; this.state = 'gone'; w.explode(this.x, this.y - 20); }
}

class Spawner {
  constructor(d) { Object.assign(this, d); this.reset(); }
  reset() { this.fired = false; }
  update(dt, w) {
    if (!this.fired && w.bike && w.bike.c.x > this.trig) {
      this.fired = true;
      const b = new Roller(this.x, this.y, this.r, 1);
      b.kind = this.kind;
      if (this.kind === 'chase') { b.vx = 260; b.spin = 260 / b.r; }
      else { b.vx = -60; b.warn = 1; }
      w.circles.push(b);
      w.fx.sfx(this.kind === 'chase' ? 'rumble' : 'whistle', this.x);
      if (this.kind === 'chase') w.fx.shake(6);
    }
  }
}

const KINDS = { seesaw: Seesaw, plank: Plank, drawbridge: Drawbridge, crate: Crate, tnt: Tnt, spawner: Spawner };

// ------------------------------------------------------------------ world
export class World {
  constructor(res, themeKey, fx, opts = {}) {
    this.res = res;
    this.terrain = res.terrain;
    this.themeKey = themeKey;
    this.theme = THEMES[themeKey];
    this.fx = fx;
    this.cps = res.cps; this.pits = res.pits; this.fans = res.fans;
    this.finish = res.finish; this.startX = res.startX;
    this.objs = []; this.dynSegs = []; this.circles = [];
    this.statics = [];
    this.gen = opts.gen || null;
    this.adopt(res.objs, 0);
    this.t = 0;
    this.bike = null;
  }
  adopt(list, from) {
    for (let i = from; i < list.length; i++) {
      const d = list[i];
      const K = KINDS[d.type];
      if (K) { const o = new K(d); this.objs.push(o); if (o.segs) this.dynSegs.push(...o.segs); }
      else this.statics.push(d);
    }
    this.adopted = list.length;
  }
  reset(x = -Infinity) {
    for (const o of this.objs) { o.reset(); if (o instanceof Spawner && o.trig < x) o.fired = true; }
    this.circles.length = 0;
    for (const l of this.terrain.loops) l.phase = 0;
    this.t = 0;
  }
  windAt(x, y) {
    for (const f of this.fans) {
      if (x > f.x0 && x < f.x1 && y > f.top && y < f.bot) {
        const k = (y - f.top) / (f.bot - f.top);
        return f.a * (0.55 + 0.45 * k);
      }
    }
    return 0;
  }
  update(dt, bike) {
    this.t += dt;
    this.bike = bike;
    if (this.gen && bike) {
      if (this.gen.extend(bike.c.x + 4000)) {
        const r = this.gen.b;
        this.adopt(r.objs, this.adopted);
        this.cps = r.cps; this.pits = r.pits; this.fans = r.fans;
      }
    }
    for (const o of this.objs) {
      if (bike && (o.x || o.cx || o.hx || 0) > bike.c.x + 2600 && o.state !== 'fuse') continue;
      o.update(dt, this);
    }
    for (const b of this.circles) {
      if (b.dead) continue;
      b.step(dt, this);
      if (b.warn) b.warn = Math.max(0, b.warn - dt);
      if (b.impact > 250) { this.fx.thud(b.x, b.y + b.r, Math.min(1, b.impact / 900)); this.fx.shake(Math.min(10, b.impact / 120)); }
      // falling rocks shatter where they land: a timing hazard, not a wall
      if (b.kind === 'drop' && b.cts.length) { b.dead = true; this.fx.shatter(b.x, b.y, b.r); continue; }
      if (b.y > this.terrain.deathY || (bike && b.x < bike.c.x - 3000)) b.dead = true;
      // boulders set off TNT and flatten crates
      for (const o of this.objs) {
        if (o instanceof Tnt && o.state === 'live' && Math.abs(o.x - b.x) < b.r + 16 && Math.abs(o.y - 20 - b.y) < b.r + 22) { o.state = 'fuse'; o.fuse = 0.01; }
        if (o instanceof Crate && o.state === 'rest' && Math.abs(o.x - b.x) < b.r + o.s / 2 && Math.abs(o.y - o.s / 2 - b.y) < b.r + o.s / 2) o.smash(this);
      }
    }
    if (this.circles.length > 12) this.circles = this.circles.filter((b) => !b.dead);
    if (bike) {
      const c = bike.c;
      for (const l of this.terrain.loops) {
        if (c.x > l.x0 && c.x < l.x1) { if (l.phase === 0 && c.y < l.cy - l.R * 0.55) l.phase = 1; }
        else l.phase = 0;
      }
    }
  }
  // bike vs hazards that are not plain collisions. Returns a bail cause or null.
  interact(bike) {
    const c = bike.c, sp = bike.speed;
    const parts = [];
    for (const w of bike.wh) parts.push({ x: w.x, y: w.y, r: w.r, rider: false });
    parts.push({ x: c.x, y: c.y, r: 16, rider: false });
    if (bike.riderOn) {
      const J = bike.riderWorld();
      parts.push({ x: J.head[0], y: J.head[1], r: HEAD_R, rider: true });
      parts.push({ x: (J.neck[0] + J.pel[0]) / 2, y: (J.neck[1] + J.pel[1]) / 2, r: 10, rider: true });
    }
    for (const o of this.objs) {
      if (Math.abs((o.x || 0) - c.x) > 400) continue;
      if (o instanceof Tnt && o.state === 'live') {
        for (const p of parts) if (Math.abs(p.x - o.x) < p.r + 15 && p.y + p.r > o.y - 42 && p.y - p.r < o.y) { o.boom(this); return 'tnt'; }
      } else if (o instanceof Crate && (o.state === 'rest' || o.state === 'fall')) {
        const b = o.box();
        for (const p of parts) {
          const qx = Math.max(b.x0, Math.min(p.x, b.x1)), qy = Math.max(b.y0, Math.min(p.y, b.y1));
          const hit = (p.x - qx) ** 2 + (p.y - qy) ** 2 < (p.r + 3) ** 2;
          if (!hit) continue;
          if (o.state === 'fall') { if (p.rider) { o.smash(this); return 'crate'; } o.smash(this); break; }
          if (sp > 420 && p.x < b.x0 + 4) { o.smash(this); bike.c.vx *= 0.86; for (const w of bike.wh) w.vx *= 0.86; this.fx.pop('SMASH!', o.x, o.y - o.s - 20, '#ffd23f'); break; }
        }
      }
    }
    // lava
    for (const L of this.terrain.lava) {
      if (c.x < L.x0 - 60 || c.x > L.x1 + 60) continue;
      for (const p of parts) if (p.x > L.x0 && p.x < L.x1 && p.y + p.r * 0.5 > L.y) return 'lava';
    }
    // pits
    for (const P of this.pits) if (c.x > P.x0 - 40 && c.x < P.x1 + 40 && c.y > P.y) return 'fell';
    if (c.y > this.terrain.deathY) return 'fell';
    // below the ground surface (missed a gap and drifted under the next ledge)
    const sy = this.terrain.surfaceY(c.x);
    if (isFinite(sy) && c.y > sy + 90 && !this.terrain.loops.some((l) => c.x > l.x0 && c.x < l.x1)) return 'fell';
    return null;
  }
  explode(x, y) {
    this.fx.explode(x, y);
    for (const o of this.objs) {
      if (o instanceof Tnt && o.state === 'live' && Math.hypot(o.x - x, o.y - y) < 160) { o.state = 'fuse'; o.fuse = 0.12; }
      if (o instanceof Crate && (o.state === 'rest') && Math.hypot(o.x - x, o.y - y) < 170) o.smash(this);
      if (o instanceof Plank && o.state === 'idle' && Math.abs(o.x - x) < 150) o.onTouch();
    }
    for (const b of this.circles) { const dx = b.x - x, dy = b.y - y, d = Math.hypot(dx, dy) || 1; if (d < 300) { b.vx += dx / d * 500; b.vy += dy / d * 500 - 300; } }
  }
  nextCp(x) { return this.cps.find((p) => p.x > x); }
  get length() { return this.finish || 0; }
}
