// Bot soldiers: pick a target they can see, strafe and burst-fire, lob firecrackers
// at people hiding behind blocks, otherwise push the objective. Steering = feeler rays.
import { angDiff, rand, clamp } from './util.js';
import { HZ } from './world.js';

export const DIFF = [
  { err: 0.075, react: 0.6, turn: 5, burst: [0.25, 0.55] },
  { err: 0.055, react: 0.45, turn: 6.5, burst: [0.3, 0.7] },
  { err: 0.04, react: 0.33, turn: 8, burst: [0.35, 0.8] },
];

export class Bot {
  constructor(s, diff = 0) {
    this.s = s; this.d = DIFF[clamp(diff, 0, 2)];
    this.target = null; this.seen = 0; this.lostT = 9; this.lastSeen = null;
    this.strafe = Math.random() > 0.5 ? 1 : -1; this.strafeT = 0; this.burstT = 0; this.pauseT = 0;
    this.goal = null; this.goalT = 0; this.stuck = 0; this.px = 0; this.pz = 0; this.thinkT = 0; this.errX = 0; this.errY = 0; this.errT = 0;
    this.role = Math.random(); this.path = null; this.perchT = 0; this.perchNext = false;
  }
  update(dt, G) {
    const s = this.s, inp = s.input;
    inp.fire = false; inp.jump = false; inp.gren = false; inp.reload = false; inp.aim = false;
    if (!s.alive) return;
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = 0.15; this.pick(G); }
    const t = this.target;
    let wx = 0, wz = 0;
    const visible = t && t.alive && this.vis;
    if (visible) {
      this.seen += dt; this.lostT = 0; this.lastSeen = [t.x, t.y, t.z];
      // aim with a wandering error that shrinks while tracking
      this.errT -= dt;
      if (this.errT <= 0) { this.errT = rand(0.2, 0.5); const e = this.d.err * (1 + Math.max(0, 1 - this.seen) * 1.5); this.errX = rand(-e, e); this.errY = rand(-e, e) * 0.6; }
      const ex = s.x, ey = s.y + 1.62, ez = s.z, tx = t.x + t.vx * 0.12, ty = t.y + 1.1, tz = t.z + t.vz * 0.12;
      const dx = tx - ex, dy = ty - ey, dz = tz - ez, dh = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(dx, dz) + this.errX, wantPitch = Math.atan2(dy, dh) + this.errY;
      const dyaw = angDiff(s.yaw, wantYaw);
      s.yaw += clamp(dyaw, -this.d.turn * dt, this.d.turn * dt);
      s.pitch += clamp(wantPitch - s.pitch, -this.d.turn * dt, this.d.turn * dt);
      if (this.seen > this.d.react && Math.abs(dyaw) < 0.2) {
        if (this.pauseT > 0) this.pauseT -= dt;
        else { inp.fire = true; this.burstT -= dt; if (this.burstT <= 0) { this.burstT = rand(...this.d.burst); this.pauseT = rand(0.15, 0.45); } }
      }
      if (s.ammo <= 0) inp.reload = true;
      // strafe + range keeping
      this.strafeT -= dt; if (this.strafeT <= 0) { this.strafeT = rand(0.5, 1.4); this.strafe *= -1; if (Math.random() < 0.15) inp.jump = true; }
      const fx = dx / (dh || 1), fz = dz / (dh || 1);
      let fwd = dh > 20 ? 1 : dh < 7 ? -0.6 : 0;
      if (G.mode === 'hill' && !G.inHill(s)) fwd = 0.7;
      wx = fx * fwd + fz * this.strafe * 0.8; wz = fz * fwd - fx * this.strafe * 0.8;
      // heading for / holding the high ground: keep climbing (or stay put) while shooting, unless they're close
      if ((this.path || this.perchNext || this.perchT > 0) && dh > 8 && this.goal) {
        this.perchT -= dt;
        const gx = this.goal[0] - s.x, gz = this.goal[1] - s.z, gl = Math.hypot(gx, gz);
        if (gl < 0.7) { if (this.path && this.path.length) { this.goal = this.path.shift(); if (!this.path.length) this.perchNext = true; } else if (this.perchNext) { this.perchNext = false; this.path = null; this.perchT = rand(6, 11); } }
        if (this.perchT > 0) { wx = 0; wz = 0; } else { wx = gx / (gl || 1); wz = gz / (gl || 1); }
      }
    } else {
      this.seen = Math.max(0, this.seen - dt * 2); this.lostT += dt;
      // firecracker over cover at somebody we just lost
      if (this.lastSeen && this.lostT > 0.5 && this.lostT < 3 && s.gren > 0 && Math.random() < dt * 0.5) {
        const [lx, ly, lz] = this.lastSeen, d = Math.hypot(lx - s.x, lz - s.z);
        if (d > 6 && d < 17) { s.yaw = Math.atan2(lx - s.x, lz - s.z); s.pitch = 0.35 + d * 0.012; inp.gren = true; this.lastSeen = null; }
      }
      if (s.ammo < 12 && !inp.gren) inp.reload = true;
      this.goalT -= dt;
      const near = this.goal && Math.hypot(this.goal[0] - s.x, this.goal[1] - s.z) < (this.path ? 0.7 : 1.5);
      if (near && this.path && this.path.length) { this.goal = this.path.shift(); this.goalT = 5; if (!this.path.length) this.perchNext = true; }
      else if (near && this.perchNext) { this.perchNext = false; this.path = null; this.perchT = rand(6, 11); this.goalT = this.perchT + 1; }
      else if (!this.goal || this.goalT <= 0 || (near && this.perchT <= 0)) { this.path = null; this.perchNext = false; this.perchT = 0; this.newGoal(G); }
      const gx = this.goal[0] - s.x, gz = this.goal[1] - s.z, gl = Math.hypot(gx, gz) || 1;
      if (this.perchT > 0) { this.perchT -= dt; s.yaw += clamp(angDiff(s.yaw, s.team === 0 ? 0 : Math.PI), -3 * dt, 3 * dt); }
      else { wx = gx / gl; wz = gz / gl; }
      if (wx || wz) { const wantYaw = Math.atan2(wx, wz); s.yaw += clamp(angDiff(s.yaw, wantYaw), -4 * dt, 4 * dt); } s.pitch *= 0.9;
      inp.sprint = gl > 8;
    }
    // feelers: steer round anything taller than a step
    const [sx, sz, jump] = this.steer(G, wx, wz);
    if (jump) inp.jump = true;
    // stuck detection
    const moved = Math.hypot(s.x - this.px, s.z - this.pz); this.px = s.x; this.pz = s.z;
    if ((sx || sz) && moved < dt * 1.2) { this.stuck += dt; if (this.stuck > 0.5) { inp.jump = true; } if (this.stuck > 1.2) { this.path = null; this.perchNext = false; this.perchT = 0; this.newGoal(G, true); this.stuck = 0; } } else this.stuck = Math.max(0, this.stuck - dt);
    const sn = Math.sin(s.yaw), cs = Math.cos(s.yaw);
    inp.mz = sx * sn + sz * cs; inp.mx = -sx * cs + sz * sn;
    if (inp.jump && s.ground && Math.random() < 0.02) inp.jump = true;
  }
  steer(G, wx, wz) {
    const l = Math.hypot(wx, wz); if (l < 0.05) return [0, 0, false];
    const s = this.s, base = Math.atan2(wx, wz);
    const offs = [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0];
    for (const o of offs) {
      const a = base + o * this.strafe, dx = Math.sin(a), dz = Math.cos(a);
      const hit = G.rayBoxes(s.x, s.y + 1.0, s.z, dx, 0, dz, 2.2, true);
      if (!hit) {
        // low obstacle at the shins? hop it
        const low = G.rayBoxes(s.x, s.y + 0.6, s.z, dx, 0, dz, 1.0, true);
        return [dx * Math.min(1, l), dz * Math.min(1, l), !!low && low.box.y1 - s.y > 0.55 && low.box.y1 - s.y < 1.25];
      }
    }
    return [-wx, -wz, true];
  }
  pick(G) {
    const s = this.s; let best = null, bd = 1e9, vis = false;
    for (const e of G.soldiers) {
      if (e.team === s.team || !e.alive) continue;
      const d = Math.hypot(e.x - s.x, e.z - s.z);
      if (d > 45) continue;
      const v = G.los(s.x, s.y + 1.62, s.z, e.x, e.y + 1.2, e.z) || G.los(s.x, s.y + 1.62, s.z, e.x, e.y + 1.65, e.z);
      const score = d * (v ? 1 : 3) * (e === this.target ? 0.7 : 1);
      if (score < bd) { bd = score; best = e; vis = v; }
    }
    this.target = best; this.vis = vis;
  }
  newGoal(G, random) {
    const s = this.s, side = s.team === 0 ? 1 : -1;
    this.goalT = rand(4, 8);
    if (G.mode === 'hill' && !random) { const a = rand(0, 6.28), r = rand(0, 3.5); this.goal = [Math.cos(a) * r, Math.sin(a) * r]; return; }
    if (this.lastSeen && !random) { this.goal = [this.lastSeen[0], this.lastSeen[2]]; return; }
    // climb one of our own stairs / ramps and hold the high ground for a while
    if (!random && G.pieces && Math.random() < 0.45) {
      const ups = G.pieces.list.filter((p) => p.team === s.team && (p.type === 'stairs' || p.type === 'ramp') && !p.fallV);
      if (ups.length) {
        const p = ups[Math.floor(Math.random() * ups.length)], a = p.rot * Math.PI / 2, sn = Math.sin(a), cs = Math.cos(a);
        const at = (l) => [p.x + sn * l, p.z + cs * l];
        this.goal = at(-3.2); this.path = [at(-1.5), at(1.4)]; this.goalT = 9; return;
      }
    }
    // flank lanes
    const lane = this.role < 0.33 ? -11 : this.role < 0.66 ? 0 : 11;
    const depth = rand(0, 1) < 0.5 ? rand(4, 14) : rand(-6, 6);
    this.goal = [clamp(lane + rand(-5, 5), -16, 16), clamp(side * depth, -HZ + 3, HZ - 3)];
  }
}
