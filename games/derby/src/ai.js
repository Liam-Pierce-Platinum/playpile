// AI drivers. Each one picks a target (nearest weak car, whoever last hit it, sometimes you),
// lines up a ramming run with a little lead, backs out when stuck, steers round wrecks and
// tyre stacks, and grabs pickups when hurt. Personalities change the weights.
import { clamp, wrap } from './util.js';
import { wallDist } from './arena.js';

export const KINDS = {
  //          aggro  weak  revenge player  flee  chaos  backoff
  bully:   { aggro: 1.0, weak: 0.4, revenge: 1.0, player: 0.55, flee: 0,    chaos: 0.1, backoff: 0.35 },
  coward:  { aggro: 0.5, weak: 1.6, revenge: 0.3, player: 0.15, flee: 0.6,  chaos: 0.1, backoff: 0.8 },
  chaos:   { aggro: 0.8, weak: 0.2, revenge: 0.6, player: 0.3,  flee: 0,    chaos: 1.0, backoff: 0.5 },
  sniper:  { aggro: 0.9, weak: 1.5, revenge: 0.4, player: 0.25, flee: 0.15, chaos: 0.05, backoff: 0.6 },
  brawler: { aggro: 0.9, weak: 0.5, revenge: 2.0, player: 0.3,  flee: 0,    chaos: 0.2, backoff: 0.5 },
};
export const MAX_ON_PLAYER = 2;   // never more than this many AIs hunting you at once

export class Brain {
  constructor(car, kind) {
    this.car = car; this.kind = kind; this.P = KINDS[kind];
    this.target = null; this.thinkT = Math.random() * 0.4; this.revT = 0; this.revSteer = 0;
    this.stuckT = 0; this.mode = 'hunt'; this.goal = null; this.chaosT = 1 + Math.random() * 2; this.spinT = 0;
  }
  onRam(victim) {
    // after a good hit: back off and line up again (derby style), sometimes keep pushing
    if (Math.random() < this.P.backoff) { this.revT = 0.35 + Math.random() * 0.35; this.revSteer = Math.random() < 0.5 ? -1 : 1; }
    void victim;
  }
  onHit(by) { if (by && Math.random() < this.P.revenge * 0.5) { this.target = by; this.thinkT = 1.2; } }

  pick(g) {
    const c = this.car, P = this.P;
    let best = null, bestS = -Infinity;
    for (const o of g.cars) {
      if (o === c || !o.alive) continue;
      const d = Math.hypot(o.x - c.x, o.y - c.y);
      let s = -d / 550 + (1 - o.health) * P.weak * 1.4;
      if (o === c.lastHitBy && g.time - c.lastHitT < 6) s += P.revenge;
      if (o.isPlayer) {
        s += P.player;
        let n = 0; for (const b of g.brains) if (b !== this && b.car.alive && b.target === o) n++;
        if (n >= MAX_ON_PLAYER) s -= 6;
        if (g.time < 6) s -= 3;   // a few seconds' grace at the start
      } else {
        let n = 0; for (const b of g.brains) if (b !== this && b.car.alive && b.target === o) n++;
        s -= n * 0.45;
      }
      if (o === this.target) s += 0.35;   // stick with it a while
      if (o.speed < 60) s += 0.8;         // a parked car is a sitting duck: no camping
      s += (Math.random() - 0.5) * P.chaos * 1.6;
      if (s > bestS) { bestS = s; best = o; }
    }
    this.target = best;
  }

  control(g, dt) {
    const c = this.car, A = g.arena, P = this.P;
    const idle = { steer: 0, throttle: 0, brake: 0, hand: false, boost: false };
    if (!c.alive) return idle;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.35 + Math.random() * 0.35; if (!this.target || !this.target.alive || Math.random() < 0.35) this.pick(g); }
    if (P.chaos > 0.5) { this.chaosT -= dt; if (this.chaosT <= 0) { this.chaosT = 1.2 + Math.random() * 2; this.pick(g); if (Math.random() < 0.3) this.spinT = 0.5; } }
    // reversing out of trouble
    if (this.revT > 0) { this.revT -= dt; return { steer: this.revSteer, throttle: 0, brake: 1, hand: false, boost: false }; }
    // stuck: flooring it and going nowhere (pinned on a wall, a wreck or another car)
    if (c.speed < 45) this.stuckT += dt; else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.7) { this.stuckT = 0; this.revT = 0.55 + Math.random() * 0.6; this.revSteer = Math.random() < 0.5 ? -1 : 1; return idle; }

    // --- where do we want to go?
    const fx = Math.cos(c.h), fy = Math.sin(c.h);
    let gx, gy, ramming = false, T = this.target;
    // threats: someone close and pointed at us
    let threat = null, threatD = Infinity;
    for (const o of g.cars) {
      if (o === c || !o.alive) continue;
      const dx = c.x - o.x, dy = c.y - o.y, d = Math.hypot(dx, dy);
      const aim = (Math.cos(o.h) * dx + Math.sin(o.h) * dy) / (d || 1);
      if (d < 380 && aim > 0.8 && o.speed > 200 && d < threatD) { threat = o; threatD = d; }
    }
    // cowards run from every threat; others only when they're nearly finished
    const scared = P.flee > 0 && (P.flee >= 0.5 || c.health < P.flee);
    this.mode = scared && threat ? 'flee' : 'hunt';
    // pickups when it's worth it
    let pk = null;
    for (const p of g.pickups) {
      const d = Math.hypot(p.x - c.x, p.y - c.y);
      const want = p.type === 'wrench' ? (c.health < 0.6 ? 1.6 : 0.2) : p.type === 'nitro' ? (c.boost < 0.4 ? 0.8 : 0) : 0.9 * P.aggro;
      if (want > 0 && d < 500 * want && (!pk || d < pk.d)) pk = { p, d };
    }
    const tD = T && T.alive ? Math.hypot(T.x - c.x, T.y - c.y) : Infinity;
    if (this.mode === 'flee') {
      // run away from the threat, bending toward the middle when near a wall
      const ax = c.x - threat.x, ay = c.y - threat.y, d = Math.hypot(ax, ay) || 1;
      const wd = wallDist(A, c.x, c.y).d, k = clamp(1 - wd / 260, 0, 1);
      gx = c.x + (ax / d) * 300 * (1 - k) - c.x * k * 0.6; gy = c.y + (ay / d) * 300 * (1 - k) - c.y * k * 0.6;
      // a cornered coward lashes out at anything weak right in front
      if (T && tD < 200 && T.health < 0.35) { gx = T.x; gy = T.y; ramming = true; }
    } else if (pk && (pk.d < tD * 0.8 || tD > 450)) {
      gx = pk.p.x; gy = pk.p.y;
    } else if (T && T.alive) {
      // lead the target, and aim a little past its middle for a T-bone
      const lead = clamp(tD / (c.speed + 260), 0, 0.7);
      gx = T.x + T.vx * lead; gy = T.y + T.vy * lead;
      ramming = true;
    } else {
      gx = 0; gy = 0;
    }
    // sudden death: get inside the ring
    if (g.ring && Math.hypot(c.x - g.ring.x, c.y - g.ring.y) > g.ring.r - 80) { gx = g.ring.x + (gx - g.ring.x) * 0.3; gy = g.ring.y + (gy - g.ring.y) * 0.3; }

    let d = wrap(Math.atan2(gy - c.y, gx - c.x) - c.h);
    const dist = Math.hypot(gx - c.x, gy - c.y);
    // target behind us and close: reverse and swing the nose round (a three-point turn)
    if (ramming && Math.abs(d) > 2.0 && dist < 230) { return { steer: -Math.sign(d), throttle: 0, brake: 1, hand: false, boost: false }; }
    let steer = clamp(d * 2.4, -1, 1);
    // avoid wrecks, tyre stacks, hay and the infield (but not whoever we're ramming)
    const look = 70 + c.speed * 0.5;
    let avoid = 0;
    const dodge = (ox, oy, r) => {
      const rx = ox - c.x, ry = oy - c.y, along = rx * fx + ry * fy;
      if (along <= 0 || along > look + r) return;
      const lat = fx * ry - fy * rx;
      if (Math.abs(lat) < r + c.W + 16) avoid -= Math.sign(lat || 1) * (1 - along / (look + r)) * 1.6;
    };
    for (const o of A.avoid) dodge(o.x, o.y, o.r);
    for (const o of g.cars) if (!o.alive && o !== T) dodge(o.x, o.y, o.L * 0.8);
    for (const h of g.hay) dodge(h.x, h.y, h.r);
    if (!ramming || dist > 120) steer = clamp(steer + avoid, -1, 1);
    // keep off the wall unless we're pinning someone to it
    const px = c.x + fx * (60 + c.speed * 0.45), py = c.y + fy * (60 + c.speed * 0.45);
    const wd = wallDist(A, px, py).d;
    if (wd < 50 && !(ramming && dist < 160)) { const tc = wrap(Math.atan2(-c.y, -c.x) - c.h); steer = clamp(steer + Math.sign(tc) * clamp((50 - wd) / 50, 0, 1) * 1.5, -1, 1); }
    const hand = (Math.abs(d) > 1.1 && c.speed > 300) || (this.spinT > 0 && (this.spinT -= dt) > 0);
    const boost = ramming && Math.abs(d) < 0.18 && dist > 110 && dist < 480 && c.boost > 0.35 && Math.random() < P.aggro;
    // ease off for tight turns so it doesn't plough on
    const throttle = Math.abs(d) > 1.6 && c.speed > 260 ? 0 : 1;
    return { steer, throttle, brake: 0, hand, boost: boost || (this.mode === 'flee' && threatD < 160 && c.boost > 0.3) };
  }
}
