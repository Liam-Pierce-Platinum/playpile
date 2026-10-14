// Planes (player, AI, remote), bullets, missiles. One arcade flight model for everybody, and an
// "instructor" autopilot that turns a desired direction into stick inputs (mouse aim + AI).
import * as THREE from '../vendor/three.module.js';
import { clamp, rand } from './util.js';
import { groundAt, ARENA, CEILING } from './world.js';
import { animatePilot } from './models.js';

const _r = new THREE.Vector3(), _b1 = new THREE.Vector3(), _b2 = new THREE.Vector3(), _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _e = new THREE.Euler();
export const FWD = new THREE.Vector3(0, 0, -1), UP = new THREE.Vector3(0, 1, 0), RIGHT = new THREE.Vector3(1, 0, 0);
export const BULLET_SPEED = 820;

let NEXT_ID = 1;
export const resetIds = (n = 1) => { NEXT_ID = n; };

export class Plane {
  /**
   * o: { kind: 'fighter'|'bomber'|'airship', model, stats, team, name, isPlayer, skill, cls (fighter|ace|bomber|airship), id }
   */
  constructor(o) {
    this.id = o.id ?? NEXT_ID++;
    this.kind = o.kind || 'fighter';
    this.cls = o.cls || this.kind;
    this.model = o.model;
    this.st = o.stats;
    this.team = o.team ?? 1;
    this.name = o.name || '';
    this.isPlayer = !!o.isPlayer;
    this.human = !!o.human;
    this.skill = o.skill ?? 0.3;
    this.planeId = o.planeId || 'kestrel';
    this.pos = new THREE.Vector3();
    this.quat = new THREE.Quaternion();
    this.vel = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.speed = this.st.speed;
    this.maxHp = this.st.hp; this.hp = this.st.hp;
    this.alive = true; this.dying = false; this.dyingT = 0; this.gone = false;
    this.ctrl = { pitch: 0, roll: 0, yaw: 0, boost: false, fire: false, missile: false };
    this.rate = new THREE.Vector3(); // pitch, yaw, roll actual (rad/s)
    this.boostE = 1; this.boosting = false;
    this.heat = 0; this.overheat = 0; this.gunT = 0; this.gunSide = 0;
    this.missiles = this.st.missiles; this.missileCd = 0;
    this.lockT = 0; this.lockTarget = null; this.locked = false;
    this.rollT = 0; this.rollDir = 1; this.rollCd = 0;
    this.hitFlash = 0; this.lastAttacker = null; this.lastHitT = 0;
    this.kills = 0; this.deaths = 0; this.score = 0; this.streak = 0;
    this.firing = false;
    this.brain = null;
    this.invuln = 0;
    this.stallWarn = false;
    this.radius = this.st.radius || 6;
    this.spinDir = Math.random() < 0.5 ? -1 : 1;
    this.lookYaw = 0; this.lookPitch = 0;
    this.lastPos = new THREE.Vector3();
  }

  place(pos, dir) {
    this.pos.copy(pos); this.lastPos.copy(pos);
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), dir.clone().normalize(), UP);
    this.quat.setFromRotationMatrix(m);
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
    this.speed = this.st.speed;
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
    this.rate.set(0, 0, 0);
    this.syncModel();
  }

  get right() { return _r.set(1, 0, 0).applyQuaternion(this.quat); }
  up(out = new THREE.Vector3()) { return out.set(0, 1, 0).applyQuaternion(this.quat); }
  bank() { const r = _b1.set(1, 0, 0).applyQuaternion(this.quat); const u = _b2.set(0, 1, 0).applyQuaternion(this.quat); return Math.atan2(r.y, u.y); }

  // ------------------------------------------------------------------ flight
  fly(dt) {
    const st = this.st;
    if (!this.alive) { this.fall(dt); return; }
    const c = this.ctrl;
    const stall = st.speed * 0.45;
    const auth = clamp((this.speed - stall * 0.7) / (stall * 0.8), 0.25, 1); // controls soften when slow
    const big = this.kind !== 'fighter';
    let pr = c.pitch * st.turn * auth, yr = c.yaw * st.turn * 0.32 * auth, rr = c.roll * st.roll * auth;
    if (this.rollT > 0) { this.rollT -= dt; rr = this.rollDir * Math.PI * 2 / 0.65; pr *= 0.3; }
    if (this.rollCd > 0) this.rollCd -= dt;
    const k = 1 - Math.exp(-(big ? 2.5 : 9) * dt);
    this.rate.x += (pr - this.rate.x) * k; this.rate.y += (yr - this.rate.y) * k; this.rate.z += (rr - this.rate.z) * k;
    _e.set(this.rate.x * dt, -this.rate.y * dt, -this.rate.z * dt, 'XYZ');
    _q.setFromEuler(_e);
    this.quat.multiply(_q).normalize();
    this.fwd.set(0, 0, -1).applyQuaternion(this.quat);

    // stall: the nose falls toward the ground
    if (this.speed < stall) {
      this.stallWarn = true;
      const axis = _v.crossVectors(this.fwd, UP);
      if (axis.lengthSq() > 1e-4) {
        axis.normalize();
        _q.setFromAxisAngle(axis, -(stall - this.speed) / stall * 1.6 * dt);
        this.quat.premultiply(_q).normalize();
        this.fwd.set(0, 0, -1).applyQuaternion(this.quat);
      }
    } else this.stallWarn = false;

    // energy
    this.boosting = c.boost && this.boostE > 0.02 && !big;
    if (this.boosting) this.boostE = Math.max(0, this.boostE - dt * 0.3);
    else this.boostE = Math.min(1, this.boostE + dt * (c.boost ? 0.05 : 0.14));
    const thin = this.pos.y > CEILING ? (this.pos.y - CEILING) / 300 : 0;
    const target = st.speed * (this.boosting ? 1.5 * st.boost : 1) * (1 - Math.min(0.5, thin));
    this.speed += (target - this.speed) * (this.boosting ? 1.1 : 0.45) * dt;
    this.speed -= 9.8 * this.fwd.y * dt * 1.1;                       // climb costs, dive pays
    this.speed -= Math.abs(this.rate.x) * this.speed * 0.075 * dt;    // pulling g bleeds energy
    this.speed = clamp(this.speed, 15, st.speed * 1.95);
    const sink = Math.max(0, stall * 1.15 - this.speed) * 0.7;
    this.vel.copy(this.fwd).multiplyScalar(this.speed);
    this.vel.y -= sink;
    if (this.rollT > 0) this.vel.addScaledVector(this.right, this.rollDir * 18);
    this.lastPos.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hitFlash > 0) this.hitFlash -= dt;
  }

  fall(dt) {
    if (!this.dying) return;
    this.dyingT += dt;
    // a burning spiral: gravity pulls, the plane rolls
    this.vel.y -= 9.8 * dt * 1.4;
    this.vel.multiplyScalar(Math.exp(-0.15 * dt));
    const sp = this.kind === 'fighter' ? 2.5 : 0.25;
    _e.set(-0.35 * dt * (sp / 2.5), 0, this.spinDir * sp * dt);
    _q.setFromEuler(_e);
    this.quat.multiply(_q);
    // nose follows the velocity a bit
    const want = _v.copy(this.vel).normalize();
    const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), want, UP);
    _qi.setFromRotationMatrix(m);
    this.quat.slerp(_qi, Math.min(1, dt * 0.8));
    this.lastPos.copy(this.pos);
    this.pos.addScaledVector(this.vel, dt);
  }

  barrelRoll(dir) {
    if (this.rollCd > 0 || !this.alive || this.kind !== 'fighter') return false;
    this.rollT = 0.65; this.rollDir = dir; this.rollCd = 1.4;
    return true;
  }

  /** instructor: steer toward a world direction (normalized not required) */
  steer(dir, agg = 1, keepLevel = true) {
    _qi.copy(this.quat).invert();
    const dl = _v.copy(dir).normalize().applyQuaternion(_qi);
    const off = Math.acos(clamp(-dl.z, -1, 1));
    const bank = this.bank();
    // near the nose: fly it like a gunsight (pitch + rudder, wings follow the turn)
    const ePitch = Math.atan2(dl.y, -dl.z), eYaw = Math.atan2(dl.x, -dl.z);
    let p1 = clamp(ePitch * 5, -1, 1), y1 = clamp(eYaw * 4, -1, 1);
    let r1 = clamp((keepLevel ? bank * 1.4 : 0) + eYaw * 4.5, -1, 1);
    // far off: roll the target onto the lift line, then pull
    const rollTo = Math.atan2(dl.x, dl.y);
    const r2 = clamp(rollTo * 2.6, -1, 1);
    const p2 = clamp(off * 3, 0, 1) * clamp(Math.cos(rollTo) * 1.3, -0.2, 1);
    const w = clamp((off - 0.12) / 0.3, 0, 1);
    this.ctrl.pitch = clamp((p1 * (1 - w) + p2 * w) * agg, -1, 1);
    this.ctrl.roll = clamp(r1 * (1 - w) + r2 * w, -1, 1);
    this.ctrl.yaw = y1 * (1 - w);
    return off;
  }

  // ------------------------------------------------------------------ damage
  damage(n, by, game) {
    if (!this.alive || this.invuln > 0) return false;
    this.hp -= n * (this.st.armor || 1);
    this.hitFlash = 0.12;
    if (by) { this.lastAttacker = by; this.lastHitT = game ? game.t : 0; }
    if (this.hp <= 0) { this.hp = 0; return true; }
    return false;
  }

  syncModel(t = 0, dt = 0) {
    const m = this.model;
    if (!m) return;
    m.position.copy(this.pos);
    m.quaternion.copy(this.quat);
    const ud = m.userData;
    const spin = this.alive ? 40 + this.speed * 0.3 : (this.dying ? 8 : 0);
    for (const p of ud.props) {
      p.rotation.z += spin * dt;
      if (p.userData.disc) p.userData.disc.material.opacity = this.alive ? 0.18 : 0;
      p.children.forEach((ch, i) => { if (ch.isMesh && ch !== p.userData.disc && i > 0) ch.visible = !this.alive || this.speed < 20 || (Math.floor(t * 60) % 2 === 0); });
    }
    if (ud.flame) {
      const s = this.alive ? (this.boosting ? 1.5 : 0.75) * (0.9 + Math.random() * 0.2) : 0;
      ud.flame.scale.set(s ? 1 : 0.001, s || 0.001, s ? 1 : 0.001);
    }
    if (ud.pilot) animatePilot(ud.pilot, t, clamp(this.speed / 200, 0, 1), this.lookYaw, this.lookPitch, this.rate.z * 0.2);
  }
}

// ------------------------------------------------------------------ projectiles
export class Bullet {
  constructor() { this.pos = new THREE.Vector3(); this.prev = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.alive = false; this.col = new THREE.Color(0xffd36a); }
}
export class Missile {
  constructor() {
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3(); this.quat = new THREE.Quaternion(); this.alive = false;
    this.target = null; this.owner = null; this.life = 0; this.speed = 0; this.model = null; this.id = 0;
  }
}

/** sphere sweep test: does segment a->b come within r of c? returns param t or -1 */
export function segSphere(a, b, c, r) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
  const fx = a.x - c.x, fy = a.y - c.y, fz = a.z - c.z;
  const A = dx * dx + dy * dy + dz * dz;
  if (A < 1e-9) return fx * fx + fy * fy + fz * fz <= r * r ? 0 : -1;
  let t = -(fx * dx + fy * dy + fz * dz) / A;
  t = clamp(t, 0, 1);
  const px = fx + dx * t, py = fy + dy * t, pz = fz + dz * t;
  return px * px + py * py + pz * pz <= r * r ? t : -1;
}

/** distance-safety for AI and the player's autopilot: returns a corrective direction or null */
export function safetyDir(p, out) {
  const look = Math.max(2.2, p.speed / 60);
  const ax = p.pos.x + p.vel.x * look, az = p.pos.z + p.vel.z * look;
  const ay = p.pos.y + p.vel.y * look;
  const g = Math.max(groundAt(ax, az), groundAt(p.pos.x + p.vel.x * look * 0.5, p.pos.z + p.vel.z * look * 0.5), groundAt(p.pos.x, p.pos.z));
  if (ay < g + 90 || p.pos.y < g + 70) {
    out.set(p.fwd.x, 0, p.fwd.z).normalize().multiplyScalar(0.6); out.y = 1; return out.normalize();
  }
  const d = Math.hypot(p.pos.x, p.pos.z);
  if (d > ARENA) { out.set(-p.pos.x, 0, -p.pos.z).normalize(); out.y = 0.1; return out.normalize(); }
  if (p.pos.y > CEILING) { out.set(p.fwd.x, -0.4, p.fwd.z).normalize(); return out; }
  return null;
}
export { rand };
