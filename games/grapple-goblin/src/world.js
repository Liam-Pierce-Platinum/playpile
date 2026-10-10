// GRAPPLE GOBLIN - the simulation. Fixed 120 Hz steps, one input (hold).
// No drawing in here; the game reads world.events for sounds and juice.
import { FLOOR, KILL_Y, MUSH_TOP, extendEndless } from './levels.js';

export const T = {
  GRAV: 1900,        // px/s^2
  R: 15,             // goblin radius
  RANGE: 470,        // hook reach
  HOOK_SPEED: 4200,  // hook flight px/s
  ROPE_MIN: 110, ROPE_MAX: 262, ROPE_LONG: 370,
  REEL: 720,         // rope reels toward its target length at this rate
  PUMP: 230,         // tangential push while swinging forward (auto-assist)
  BACKDAMP: 70,      // and a gentle brake while swinging back
  ASSIST_VT: 220, ASSIST_GROUND: 430,    // a fresh grab gets at least this much forward swing speed
  MAX_V: 1500,
  RUN: 250, RUN_ACC: 1400, ICE_ACC: 380,
  REL_X: 30, REL_Y: 85,  // release fling bonus
  MUSH_VY: 1000, MUSH_VX: 262,
  CART_ACC: 1000, CART_MAX: 900, LAUNCH_VY: 900,
  COIN_R: 34, MAGNET: 90,
  CRUMBLE: 1.35,     // seconds a crumbling anchor holds you
  PERFECT_A0: 0.6, PERFECT_A1: 1.2,   // a release with the rope 34..69 degrees forward of straight down, on the upswing = PERFECT
  PERFECT_BOOST: 1.1, PERFECT_MAG: 150, PERFECT_MAG_T: 1.2,
  CART_MIN_LEFT: 300, // the cart only scoops you up with at least this much track left (about 0.6 s of ride)
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const STEP = 1 / 120;
// the velocity a release right now gives (shared by the game, the release preview and the autopilot)
export function flingVel(g) {
  let vx = g.vx, vy = g.vy, perfect = false;
  if (vy < 120) { vx += Math.sign(vx || 1) * T.REL_X; vy -= T.REL_Y; }
  const r = g.rope;
  if (r) {
    const phi = Math.atan2(g.x - r.a.x, g.y - r.a.y);
    if (vx > 150 && vy < -80 && phi > T.PERFECT_A0 && phi < T.PERFECT_A1 && Math.hypot(vx, vy) > 550 && r.t > 0.25) { vx *= T.PERFECT_BOOST; vy *= T.PERFECT_BOOST; perfect = true; }
  }
  return { vx, vy, perfect };
}

export class World {
  constructor(level, opts = {}) {
    this.L = level;
    this.builder = opts.builder || null;
    this.endless = !!this.builder;
    this.events = [];
    this.t = 0; this.clock = 0;
    this.done = false; this.over = false;
    this.coins = 0; this.gems = 0; this.bigGot = false; this.deaths = 0;
    this.check = { x: level.spawn.x, y: level.spawn.y };
    this.g = this.goblin(level.spawn.x, level.spawn.y);
    this.hold = false; this.prevHold = false;
    this.deadT = 0;
    this.maxX = level.spawn.x;
    this.acc = 0;
    this.solidsSorted();
  }
  solidsSorted() { this.L.solids.sort((a, b) => a.x - b.x); }
  emit(type, d = {}) { this.events.push({ type, ...d }); }
  goblin(x, y) {
    return { x, y, vx: 0, vy: 0, onGround: false, kind: 'rock', alive: true, hook: null, rope: null, riding: null, lastA: null, lastAT: -9, airT: 0, spin: 0, face: 1, landV: 0, teeter: 0, magT: 0, rideT: 0 };
  }
  ceilY(x) {
    const c = this.L.ceil;
    let lo = 0, hi = c.length - 1;
    if (x <= c[0].x) return c[0].y;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (c[m].x <= x) lo = m; else hi = m - 1; }
    const a = c[lo], b = c[lo + 1];
    if (!b) return a.y;
    const k = (x - a.x) / (b.x - a.x);
    return a.y + (b.y - a.y) * (0.5 - 0.5 * Math.cos(k * Math.PI));
  }
  groundAt(x) {
    for (const s of this.L.solids) if (s.kind !== 'wall' && Math.abs(s.y - FLOOR) < 2 && x >= s.x && x <= s.x + s.w) return s;
    return null;
  }
  safeGround(x) {
    if (!this.groundAt(x)) return false;
    for (const s of this.L.spikes) if (s.dir === 'up' && x > s.x - 20 && x < s.x + s.w + 20 && s.y > FLOOR - 40) return false;
    return true;
  }
  // how far right the goblin may run on the ground he stands on (null = no danger ahead)
  edgeLimit(g) {
    const s = this.groundAt(g.x);
    if (!s) return null;
    let lim = Infinity;
    const edge = s.x + s.w;
    let cont = false;
    for (const o of this.L.solids) {
      if (o.x > edge + 30) break;
      if (o !== s && o.kind !== 'wall' && o.x <= edge + 30 && o.x + o.w > edge + 10 && o.y >= FLOOR - 10 && o.y <= FLOOR + 40) { cont = true; break; }
    }
    if (!cont) lim = edge - 6;
    for (const sp of this.L.spikes) if (sp.dir === 'up' && sp.y > FLOOR - 40 && sp.x - 16 > g.x - 24 && sp.x - 16 < lim) lim = sp.x - 16;
    return lim === Infinity ? null : lim;
  }
  // the anchor the hook would grab from (x, y): ahead and above, near 55 degrees up
  pick(x, y, exclude = null) {
    const g = this.g;
    let best = null, bs = 1e9;
    for (const a of this.L.anchors) {
      if (a.state === 'gone' || a === exclude) continue;
      const dx = a.x - x, dy = a.y - y;
      if (dx < -70 || dx > T.RANGE || dy > 160) continue;
      if (dx < 0 && g.vx > 300) continue;
      if (dy > 30 && dx < 120) continue;
      const d = Math.hypot(dx, dy);
      if (d > T.RANGE || d < 30) continue;
      if (this.blocked(x, y, a.x, a.y)) continue;
      if (a === g.lastA && this.t - g.lastAT < 0.35) continue;
      const elev = Math.atan2(-dy, dx);
      let s = (d / T.RANGE) * 0.8 + Math.abs(elev - 0.95) * 0.7;
      if (dx < 0) s += 0.7;
      if (dy > 0) s += 0.4 + dy / 200;
      if (a.state === 'crack') s += 0.3;
      if (s < bs) { bs = s; best = a; }
    }
    return best;
  }
  // does the line from (x0,y0) to (x1,y1) pass through rock?
  blocked(x0, y0, x1, y1) {
    const lo = Math.min(x0, x1), hi = Math.max(x0, x1);
    for (const s of this.L.solids) {
      if (s.x > hi) break;
      if (s.x + s.w < lo || s.kind === 'wall') continue;
      // slab test against the rect shrunk a little
      const rx0 = s.x + 6, rx1 = s.x + s.w - 6, ry0 = s.y + 6, ry1 = s.y + s.h;
      let t0 = 0, t1 = 1;
      const dx = x1 - x0, dy = y1 - y0;
      const clip = (p, q) => { if (p === 0) return q >= 0; const r = q / p; if (p < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; } return true; };
      if (clip(-dx, x0 - rx0) && clip(dx, rx1 - x0) && clip(-dy, y0 - ry0) && clip(dy, ry1 - y0) && t0 <= t1) return true;
    }
    return false;
  }
  update(dt, hold) {
    this.acc += dt;
    let n = 0;
    while (this.acc >= STEP && n < 10) { this.step(STEP, hold); this.acc -= STEP; n++; }
    if (n >= 10) this.acc = 0;
  }

  step(dt, hold) {
    this.t += dt;
    const L = this.L, g = this.g;
    // moving things
    for (const a of L.anchors) {
      if (a.move) { const ph = (this.t * Math.PI * 2) / a.move.period + a.move.phase; a.x = a.bx + a.move.dx * Math.sin(ph); a.y = a.by + a.move.dy * Math.sin(ph); }
      if (a.state === 'crack') {
        if (g.rope && g.rope.a === a) a.crack += dt;
        if (a.breakT > 0) { a.breakT -= dt; if (a.breakT <= 0) a.crack = 99; }
        if (a.crack >= T.CRUMBLE) this.breakAnchor(a);
      }
    }
    for (const b of L.bats) {
      const ph = (this.t * Math.PI * 2) / b.period + b.phase;
      const nx = (b.x0 + b.x1) / 2 + ((b.x1 - b.x0) / 2) * Math.sin(ph);
      b.dir = nx >= b.x ? 1 : -1; b.x = nx; b.y = b.y0 + 16 * Math.sin(this.t * 4.3 + b.phase);
    }
    for (const c of L.carts) {
      if (c.state === 'roll' || c.state === 'ride') {
        c.v = Math.min(T.CART_MAX, c.v + T.CART_ACC * dt);
        c.x += c.v * dt;
        if (c.x >= c.x1 - 40) {
          c.x = c.x1 - 40;
          if (g.riding === c) { g.riding = null; g.vx = c.v + 60; g.vy = -T.LAUNCH_VY; g.spin = 1; this.emit('launch', { x: g.x, y: g.y }); }
          c.state = 'crash'; c.v = 0; this.emit('crash', { x: c.x + 30, y: FLOOR - 30 });
        }
      }
    }
    for (const s of L.solids) if (s.sq) s.sq = Math.max(0, s.sq - dt * 3);
    if (this.endless && this.builder && g.x > this.builder.x - 3200) { extendEndless(this.builder); this.solidsSorted(); }
    if (L.chest && L.chest.open) L.chest.t += dt;
    for (const f of L.flags) if (f.on) f.t += dt;

    if (!g.alive) {
      if (!this.endless) { this.deadT -= dt; if (this.deadT <= 0) this.respawn(); }
      return;
    }
    if (this.done) { g.vx *= 0.9; g.rope = null; g.hook = null; this.collide(g, dt, true); return; }
    this.clock += dt;

    // ---- input edges
    if (hold && !this.prevHold) this.press(false);
    else if (!hold && this.prevHold) this.letGo();
    else if (hold && !g.hook && !g.rope) this.press(true);   // keep trying while held
    this.prevHold = hold;

    // ---- hook flight
    const hk = g.hook;
    if (hk) {
      if (hk.state === 'out') {
        const a = hk.a;
        if (a.state === 'gone') { hk.state = 'back'; hk.dir = Math.atan2(a.y - g.y, a.x - g.x); }
        else {
          const d = Math.hypot(a.x - g.x, a.y - (g.y - 8));
          hk.len += T.HOOK_SPEED * dt;
          hk.dir = Math.atan2(a.y - (g.y - 8), a.x - g.x);
          if (hk.len >= d) this.attach(a);
        }
      } else if (hk.state === 'whiff') {
        hk.len += T.HOOK_SPEED * 0.75 * dt;
        if (hk.len >= T.RANGE * 0.6) hk.state = 'back';
      } else {
        hk.len -= T.HOOK_SPEED * 1.1 * dt;
        if (hk.len <= 0) g.hook = null;
      }
    }

    // ---- riding a mine cart
    if (g.riding) {
      const c = g.riding;
      g.x = c.x; g.y = FLOOR - 46; g.vx = c.v; g.vy = 0; g.onGround = false; g.rideT = (g.rideT || 0) + dt;
      this.pickups(g);
      return;
    }

    // ---- forces
    let ax = 0, ay = T.GRAV;
    for (const w of L.winds) {
      if (g.x < w.x || g.x > w.x + w.w || g.y < w.y - 40 || g.y > w.y + w.h) continue;
      if (w.period && ((this.t + w.phase) % w.period) > w.on) continue;
      const top = clamp((g.y - w.y) / 110, 0, 1);
      ax += w.fx; ay += w.fy * (w.fy < 0 ? top : 1);
      if (w.fy < 0 && g.vy < -640) g.vy = -640;
      w.inside = 0.3;
    }
    g.vx += ax * dt; g.vy += ay * dt;
    const r = g.rope;
    if (r) {
      r.t += dt;
      const a = r.a, dx = g.x - a.x, dy = g.y - a.y, d = Math.hypot(dx, dy) || 1;
      const nx = dx / d, ny = dy / d, tx = -ny, ty = nx;     // tangent (counter-clockwise)
      const vt = g.vx * tx + g.vy * ty;
      const fwd = vt * tx > 0;                                // moving to the right along the swing
      if (dy > 0) {
        const k = clamp(dy / d, 0, 1);
        // the pump is strong in a weak swing (you never dangle) and fades in a fast one (your release timing matters)
        const pump = T.PUMP * clamp(1.8 - Math.abs(vt) / 600, 0.6, 1.5);
        if (fwd) { g.vx += tx * Math.sign(vt) * pump * k * dt; g.vy += ty * Math.sign(vt) * pump * k * dt; }
        else { g.vx -= tx * Math.sign(vt) * T.BACKDAMP * k * dt; g.vy -= ty * Math.sign(vt) * T.BACKDAMP * k * dt; }
      }
      // reel toward the target length, keeping angular momentum (shorter rope = faster swing)
      const L0 = r.L;
      r.L += clamp(r.target - r.L, -T.REEL * dt, T.REEL * dt);
      if (r.L < L0 && d >= L0 * 0.98) { const k = L0 / r.L, vt2 = g.vx * tx + g.vy * ty; g.vx += tx * vt2 * (k - 1); g.vy += ty * vt2 * (k - 1); }
    }
    g.vx *= 1 - 0.04 * dt; g.vy *= 1 - 0.04 * dt;
    const sp = Math.hypot(g.vx, g.vy);
    if (sp > T.MAX_V) { g.vx *= T.MAX_V / sp; g.vy *= T.MAX_V / sp; }

    // running on the ground
    if (g.onGround && !r) {
      const acc = g.kind === 'ice' ? T.ICE_ACC : T.RUN_ACC;
      if (g.vx < T.RUN) g.vx = Math.min(T.RUN, g.vx + acc * dt);
      else g.vx = Math.max(T.RUN, g.vx - (g.kind === 'ice' ? 160 : 700) * dt);
    }

    // never auto-run off a ledge or into floor spikes: stop at the edge and teeter until you hold
    g.teeter = g.teeter || 0;
    if (g.onGround && !r && !g.riding) {
      const lim = this.edgeLimit(g);
      if (lim != null && g.x + g.vx * dt >= lim && g.teeter < 4) { g.x = Math.min(g.x, lim); if (g.vx > 0) g.vx = 0; g.teeter += dt; }
      else if (lim == null || g.x < lim - 2) g.teeter = 0;
    } else g.teeter = 0;
    g.x += g.vx * dt; g.y += g.vy * dt;
    if (r) {
      const a = r.a, dx = g.x - a.x, dy = g.y - a.y, d = Math.hypot(dx, dy) || 1;
      if (d > r.L) {
        const nx = dx / d, ny = dy / d;
        g.x = a.x + nx * r.L; g.y = a.y + ny * r.L;
        const vr = g.vx * nx + g.vy * ny;
        if (vr > 0) {
          g.vx -= nx * vr; g.vy -= ny * vr;
          if (!r.taut && vr > 260) { r.wob = Math.min(1, vr / 900); this.emit('taut', { v: vr }); }
        }
        r.taut = true;
      } else if (d < r.L * 0.96) r.taut = false;
      if (a.move) { /* moving anchors drag the goblin along through the constraint */ }
    }
    if (r && r.wob) r.wob = Math.max(0, r.wob - dt * 2.5);
    this.collide(g, dt, false);
    if (!g.alive) return;
    if (!g.onGround) g.airT += dt; else g.airT = 0;
    if (g.spin > 0) g.spin = Math.max(0, g.spin - dt * 1.9);
    if (Math.abs(g.vx) > 40) g.face = g.vx > 0 ? 1 : -1;
    this.hazards(g);
    if (!g.alive) return;
    this.pickups(g);
    this.maxX = Math.max(this.maxX, g.x);
  }

  collide(g, dt, quiet) {
    const R = T.R;
    const wasGround = g.onGround;
    g.onGround = false;
    for (const s of this.L.solids) {
      if (s.x > g.x + R) break;
      if (g.x - R > s.x + s.w || g.y + R < s.y || g.y - R > s.y + s.h) continue;
      const cx = clamp(g.x, s.x, s.x + s.w), cy = clamp(g.y, s.y, s.y + s.h);
      let dx = g.x - cx, dy = g.y - cy, d = Math.hypot(dx, dy);
      if (d >= R) continue;
      let nx, ny;
      if (d < 0.001) {
        // centre is inside: push out the shortest way
        const l = g.x - s.x, rr = s.x + s.w - g.x, tp = g.y - s.y;
        if (tp < l && tp < rr) { nx = 0; ny = -1; g.y = s.y - R; } else if (l < rr) { nx = -1; ny = 0; g.x = s.x - R; } else { nx = 1; ny = 0; g.x = s.x + s.w + R; }
      } else { nx = dx / d; ny = dy / d; g.x = cx + nx * R; g.y = cy + ny * R; }
      const vn = g.vx * nx + g.vy * ny;
      if (ny < -0.6) {
        if (s.kind === 'mush' && !quiet) {
          g.vy = -Math.max(T.MUSH_VY, Math.min(1250, Math.abs(g.vy) * 0.9));
          g.vx = T.MUSH_VX;
          s.sq = 1; g.spin = 0;
          if (g.rope) { this.emit('release', { speed: 0, quiet: true }); g.lastA = g.rope.a; g.lastAT = this.t; g.rope = null; }
          this.emit('boing', { x: g.x, y: s.y });
          continue;
        }
        if (vn < 0) { if (!wasGround && -vn > 280 && !quiet) this.emit('land', { v: -vn, x: g.x, y: s.y }); g.vy = 0; }
        g.onGround = true; g.kind = s.kind;
        if (s.kind === 'track' && !quiet && !g.rope && !g.riding) for (const c of this.L.carts) {
          // the cart is brought right under you the moment you touch its track, so it always scoops you up
          if ((c.state === 'idle' || c.state === 'roll') && g.x > c.x0 && g.x < c.x1 && c.x1 - 40 - g.x >= T.CART_MIN_LEFT) {
            if (c.state === 'idle') this.emit('cartgo', { x: c.x });
            c.x = g.x; c.v = clamp(Math.max(c.v, g.vx * 0.8), 260, 760);
            g.riding = c; c.state = 'ride'; g.hook = null; g.spin = 0; g.rideT = 0;
            this.emit('board', { x: c.x });
          }
        }
      } else if (vn < 0) {
        if (ny > 0.6) { g.vy = Math.abs(g.vy) * 0.3; }
        else { g.vx = -g.vx * 0.3; }
        if (-vn > 200 && !quiet) this.emit('bonk', { x: g.x, y: g.y, v: -vn });
      }
    }
    // the ceiling heightfield
    const cy = this.ceilY(g.x);
    if (g.y - R < cy) { g.y = cy + R; if (g.vy < 0) { if (g.vy < -250 && !quiet) this.emit('bonk', { x: g.x, y: cy, v: -g.vy }); g.vy = -g.vy * 0.3; } }
    // board a cart
    if (!quiet) for (const c of this.L.carts) {
      if ((c.state === 'idle' || c.state === 'roll') && !g.riding && !g.rope && Math.abs(g.x - c.x) < 40 && g.y > FLOOR - 85 && g.y < FLOOR - 4) {
        g.riding = c; c.state = 'ride'; g.hook = null; g.spin = 0;
        this.emit('board', { x: c.x });
      }
    }
  }

  hazards(g) {
    const R = T.R;
    if (g.y > KILL_Y) return this.die('pit');
    for (const s of this.L.spikes) {
      const sx = s.x + 4, sy = s.y + (s.dir === 'up' ? 8 : 0), sw = s.w - 8, sh = s.h - 8;
      const cx = clamp(g.x, sx, sx + sw), cy = clamp(g.y, sy, sy + sh);
      if (Math.hypot(g.x - cx, g.y - cy) < R - 2) return this.die('spikes');
    }
    for (const b of this.L.bats) if (Math.abs(b.x - g.x) < 40 && Math.hypot(b.x - g.x, b.y - g.y) < R + 13) return this.die('bat');
  }
  pickups(g) {
    const L = this.L, fast = Math.hypot(g.vx, g.vy) > 450 || g.magT > 0, mag = g.magT > 0 ? T.PERFECT_MAG : T.MAGNET;
    if (g.magT > 0) g.magT -= STEP;
    for (const c of L.coins) {
      if (c.x < g.x - 160) continue;
      if (c.x > g.x + 160) break;
      if (c.got) continue;
      const d = Math.hypot(c.x - g.x, c.y - g.y);
      if (fast && d < mag) { c.x += (g.x - c.x) * 0.18; c.y += (g.y - c.y) * 0.18; }
      if (d < T.COIN_R) { c.got = true; this.coins++; this.emit('coin', { x: c.x, y: c.y }); }
    }
    for (const m of L.gems) if (!m.got && Math.hypot(m.x - g.x, m.y - g.y) < 36) { m.got = true; this.gems++; this.emit('gem', { x: m.x, y: m.y }); }
    const bg = L.big;
    if (bg && !bg.got && Math.hypot(bg.x - g.x, bg.y - g.y) < 44) { bg.got = true; this.bigGot = true; this.emit('big', { x: bg.x, y: bg.y }); }
    for (const f of L.flags) if (!f.on && g.x >= f.x) { f.on = true; this.check = { x: f.x + 30, y: FLOOR - 15 }; this.emit('flag', { x: f.x }); }
    const ch = L.chest;
    if (ch && !this.done && ((Math.abs(g.x - ch.x) < 60 && Math.abs(g.y - (FLOOR - 30)) < 90) || (g.onGround && g.x > ch.x))) {
      this.done = true; ch.open = true; g.rope = null; g.hook = null;
      this.emit('finish', { x: ch.x, y: FLOOR - 30 });
    }
  }

  // ---- hook
  press(retry) {
    const g = this.g;
    if (g.rope || (g.hook && g.hook.state === 'out')) return;
    const a = this.pick(g.x, g.y);
    if (a) { g.hook = { state: 'out', a, len: 0, dir: Math.atan2(a.y - g.y, a.x - g.x) }; this.emit('fire', { retry }); }
    else if (!retry && !g.hook) { g.hook = { state: 'whiff', len: 0, dir: g.face >= 0 ? -0.95 : -Math.PI + 0.95 }; this.emit('whiff'); }
  }
  attach(a) {
    const g = this.g;
    const dx = g.x - a.x, dy = g.y - a.y, d = Math.hypot(dx, dy) || 1;
    g.rope = { a, L: d, target: clamp(d, T.ROPE_MIN, a.long ? T.ROPE_LONG : T.ROPE_MAX), taut: false, wob: 0.6, t: 0 };
    g.hook = null; g.riding = null; g.spin = 0;
    // assist: a fresh grab always has some forward swing
    const nx = dx / d, ny = dy / d;
    let tx = -ny, ty = nx;
    if (tx < 0) { tx = -tx; ty = -ty; }
    const vt = g.vx * tx + g.vy * ty;
    const want = g.onGround || g.airT < 0.15 ? T.ASSIST_GROUND : T.ASSIST_VT;
    if (vt < want && dy > -10) { g.vx += tx * (want - vt); g.vy += ty * (want - vt); }
    if (a.crumble && a.state === 'ok') a.state = 'crack';
    this.emit('attach', { x: a.x, y: a.y, a });
  }
  letGo() {
    const g = this.g;
    if (g.rope) {
      const a = g.rope.a;
      // PERFECT: let go near the top of the forward upswing
      const f = flingVel(g);
      g.vx = f.vx; g.vy = f.vy;
      if (f.perfect) { g.magT = T.PERFECT_MAG_T; this.emit('perfect', { x: g.x, y: g.y }); }
      const sp = Math.hypot(g.vx, g.vy);
      if (sp > 980 && g.vy < 0) g.spin = 1;
      g.lastA = a; g.lastAT = this.t;
      if (a.state === 'crack') a.breakT = 0.12;
      g.rope = null;
      this.emit('release', { speed: sp, x: g.x, y: g.y });
    }
    if (g.hook && g.hook.state === 'out') g.hook.state = 'back';
  }
  breakAnchor(a) {
    a.state = 'gone'; a.crack = 0; a.breakT = 0;
    const g = this.g;
    if (g.rope && g.rope.a === a) { g.rope = null; g.lastA = a; g.lastAT = this.t; this.emit('snap', { x: a.x, y: a.y }); }
    if (g.hook && g.hook.a === a) g.hook.state = 'back';
    this.emit('crumble', { x: a.x, y: a.y, a });
  }
  die(cause) {
    const g = this.g;
    if (!g.alive) return;
    g.alive = false; g.rope = null; g.hook = null; g.riding = null;
    this.deaths++;
    this.deadT = 0.5;
    this.emit('die', { x: g.x, y: g.y, cause });
    if (this.endless) { this.over = true; this.emit('over'); }
  }
  respawn() {
    for (const a of this.L.anchors) if (a.crumble) { a.state = 'ok'; a.crack = 0; a.breakT = 0; }
    for (const c of this.L.carts) if (c.x0 > this.check.x - 2000) { c.state = 'idle'; c.x = c.x0 + 90; c.v = 0; }
    this.g = this.goblin(this.check.x, this.check.y);
    this.prevHold = true;  // a finger still down from before must lift first
    this.emit('respawn', { x: this.g.x, y: this.g.y });
  }
  distance() { return Math.max(0, Math.floor((this.maxX - this.L.spawn.x) / 40)); }
}
