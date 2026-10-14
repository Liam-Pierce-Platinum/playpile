// Dogfight AI. Every bot flies the same physics as the player through Plane.steer(). The brain
// picks a state a few times a second (reaction time scales with skill) and steers every frame.
//   ENGAGE  lead pursuit, fire only with a real gun solution, missiles when locked
//   EXTEND  slow and losing the turn fight -> run, boost, climb back to energy
//   EVADE   somebody is on my six -> break turn, jink, barrel roll into missiles
//   FORM    wingman holding formation on its leader until the leader fights
//   SAFETY  ground / sea / boundary / ceiling always win
import * as THREE from '../vendor/three.module.js';
import { clamp, rand } from './util.js';
import { safetyDir, BULLET_SPEED } from './entities.js';
import { HARBOR } from './world.js';

const _d = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _o = new THREE.Vector3();

export class Brain {
  constructor(p, game) {
    this.p = p; this.g = game;
    this.state = 'engage';
    this.target = null; this.think = rand(0.2); this.stateT = 0;
    this.leader = null; this.slot = new THREE.Vector3(); // formation offset in leader space
    this.jink = new THREE.Vector3(); this.jinkT = 0;
    this.err = new THREE.Vector3(); this.errT = 0;
    this.burst = 0;
    this.goal = null; // bombers: where they are going
  }
  enemies() { return this.g.planes.filter((q) => q.alive && this.g.hostile(this.p, q)); }

  pickTarget() {
    const p = this.p;
    let best = null, bs = 1e9;
    for (const q of this.enemies()) {
      if (q.kind === 'airship' && p.kind === 'fighter' && Math.random() < 0.7) continue;
      const d = q.pos.distanceTo(p.pos);
      _d.subVectors(q.pos, p.pos).normalize();
      const ahead = _d.dot(p.fwd);
      let s = d * (1.4 - ahead * 0.5);
      if (q === p.lastAttacker && this.g.t - p.lastHitT < 6) s *= 0.4; // revenge
      if (q.human) s *= 0.75 - this.p.skill * 0.15;                    // humans are interesting
      if (s < bs) { bs = s; best = q; }
    }
    return best;
  }

  /** who is sitting on my six? */
  threat() {
    const p = this.p;
    let worst = null, ws = 0;
    for (const q of this.enemies()) {
      if (q.kind !== 'fighter') continue;
      _d.subVectors(p.pos, q.pos);
      const d = _d.length();
      if (d > 650) continue;
      _d.divideScalar(d);
      const aim = _d.dot(q.fwd);            // are they pointing at me?
      if (aim < 0.93) continue;
      const s = aim / d;
      if (s > ws) { ws = s; worst = q; }
    }
    for (const m of this.g.missiles) if (m.alive && m.target === p && m.pos.distanceTo(p.pos) < 500) return { missile: m };
    return worst ? { plane: worst } : null;
  }

  update(dt) {
    const p = this.p, g = this.g, sk = p.skill;
    if (!p.alive) return;
    p.ctrl.fire = false; p.ctrl.missile = false; p.ctrl.boost = false;
    this.think -= dt; this.stateT += dt;
    if (this.think <= 0) {
      this.think = this.thinkStep = 0.55 - sk * 0.4 + rand(0.15);
      this.decide();
    }
    // aim error wanders, smaller for aces
    this.errT -= dt;
    if (this.errT <= 0) { this.errT = 0.4 + rand(0.5); this.err.set(rand(-1, 1), rand(-1, 1), rand(-1, 1)).multiplyScalar((1 - sk) * 0.09 + 0.006); }

    if (p.kind === 'bomber') return this.bomber(dt);

    let dir = null, agg = 0.75 + sk * 0.25;
    const tg = this.target;
    if (this.state === 'form' && this.leader && this.leader.alive) {
      _t.copy(this.slot).applyQuaternion(this.leader.quat).add(this.leader.pos).addScaledVector(this.leader.fwd, 60);
      dir = _d.subVectors(_t, p.pos);
      const dist = dir.length();
      p.ctrl.boost = dist > 140;
      dir.normalize();
    } else if (this.state === 'evade') {
      if (this.jinkT <= 0) {
        this.jinkT = 0.6 + rand(0.7);
        const th = this.threatNow;
        const away = th ? _s.subVectors(p.pos, (th.plane || th.missile).pos).normalize() : _s.copy(p.fwd);
        // break perpendicular to the attacker's line, randomly up or down
        _o.crossVectors(away, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(Math.random() < 0.5 ? -1 : 1);
        this.jink.copy(_o).addScaledVector(away, 0.3).add(new THREE.Vector3(0, rand(-0.5, 0.6) - clamp((p.pos.y - 700) / 800, -0.4, 0.6), 0)).normalize();
        if (th && th.missile && Math.random() < 0.35 + sk * 0.6) p.barrelRoll(Math.random() < 0.5 ? -1 : 1);
        else if (Math.random() < sk * 0.35) p.barrelRoll(Math.random() < 0.5 ? -1 : 1);
      }
      this.jinkT -= dt;
      dir = _d.copy(this.jink);
      p.ctrl.boost = p.boostE > 0.3;
      agg = 1;
    } else if (this.state === 'extend') {
      dir = _d.copy(p.fwd); dir.y = Math.max(dir.y, 0.15); dir.normalize();
      if (tg) { _s.subVectors(p.pos, tg.pos).normalize(); dir.addScaledVector(_s, 0.6).normalize(); dir.y = Math.max(dir.y, 0.1); }
      p.ctrl.boost = true;
    } else if (tg && tg.alive) {
      // lead pursuit
      _d.subVectors(tg.pos, p.pos);
      const dist = _d.length();
      const tof = dist / (BULLET_SPEED + p.speed * 0.5);
      _t.copy(tg.pos).addScaledVector(tg.vel, tof * (0.6 + sk * 0.4));
      if (tg.kind === 'airship' && this.aimPart) _t.copy(this.aimPart);
      // aim error grows when the target is hauling hard or rolling - jinking works
      const jinkK = 1 + Math.abs(tg.rate.x) * 1.3 + (tg.rollT > 0 ? 2.5 : 0) + (tg.boosting ? 0.4 : 0);
      dir = _d.subVectors(_t, p.pos).normalize().addScaledVector(this.err, jinkK).normalize();
      const off = Math.acos(clamp(dir.dot(p.fwd), -1, 1));
      const range = tg.kind === 'airship' ? 900 : 620;
      const tol = tg.kind === 'airship' ? 0.12 : Math.atan2(tg.radius * 1.6, dist) + 0.012 + (1 - sk) * 0.02;
      this.burstCd = (this.burstCd || 0) - dt;
      if (dist < range && off < tol && this.burst <= 0 && this.burstCd <= 0) { this.burst = 0.35 + rand(0.4); this.burstCd = this.burst + 0.45 + (1 - sk) * 0.9; }
      if (this.burst > 0) { this.burst -= dt; p.ctrl.fire = dist < range * 1.15 && off < tol * 2.5 && p.overheat <= 0 && p.heat < 0.85; }
      if (p.locked && p.lockTarget === tg && p.missiles > 0 && sk > 0.35 && Math.random() < dt * (0.15 + sk * 0.3)) p.ctrl.missile = true;
      if (dist > 900) p.ctrl.boost = p.boostE > 0.5;
      // gun runs on an airship: break off before the hull, come round for another pass
      if (tg.kind === 'airship' && dist < 170 * (tg.scale || 1)) { this.state = 'extend'; this.stateT = 0; }
      // too close and closing fast -> overshoot, pull off and come back
      if (dist < 70 && _s.subVectors(tg.vel, p.vel).dot(_d) > 0) { this.state = 'extend'; this.stateT = 0; }
    } else {
      // nobody to fight: patrol back toward the middle
      dir = _d.set(-p.pos.x, 400 - p.pos.y, -p.pos.z).normalize();
    }
    // wingmen of the player: stay near if nothing else
    let safe = safetyDir(p, _s);
    // never fly into an airship's envelope
    if (!safe) for (const s of this.g.planes) {
      if (s.kind !== 'airship' || !s.alive || s === p) continue;
      const ahead = _o.copy(p.pos).addScaledVector(p.vel, 1.6);
      if (ahead.distanceTo(s.pos) < 75 * (s.scale || 1) || p.pos.distanceTo(s.pos) < 70 * (s.scale || 1)) { safe = _s.subVectors(p.pos, s.pos).normalize(); safe.y = Math.max(safe.y, 0.5); safe.normalize(); break; }
    }
    if (safe) { dir = safe; agg = 1; p.ctrl.fire = false; }
    if (dir) p.steer(dir, agg);
  }

  decide() {
    const p = this.p, sk = p.skill;
    this.threatNow = this.threat();
    if (this.leader && !this.leader.alive) this.leader = null;
    // formation: wingmen stay with their leader until the leader is fighting close
    if (this.leader) {
      const lt = this.leader.brain && this.leader.brain.target;
      const ldist = lt ? lt.pos.distanceTo(this.leader.pos) : 1e9;
      if (ldist > 700 && !this.threatNow) { this.state = 'form'; return; }
      this.target = lt && lt.alive && Math.random() < 0.7 ? lt : this.pickTarget();
      if (this.state === 'form') this.state = 'engage';
    }
    // evading: a short break, then back on the offensive with a cool-down (no endless defensive circles)
    if (this.state === 'evade' && this.stateT > this.evadeFor) { this.state = 'engage'; this.stateT = 0; this.noEvade = 2.5 + rand(2) - sk; if (this.threatNow && this.threatNow.plane) this.target = this.threatNow.plane; }
    if (this.noEvade > 0) this.noEvade -= this.thinkStep || 0.4;
    const tg0 = this.target && this.target.alive ? this.target : null;
    const offensive = tg0 && tg0.pos.distanceTo(p.pos) < 450 && _d.subVectors(tg0.pos, p.pos).normalize().dot(p.fwd) > 0.85;
    const th = this.threatNow;
    const scary = th && (th.missile || (th.plane.pos.distanceTo(p.pos) < 420));
    if (scary && this.state !== 'evade' && !(this.noEvade > 0) && (!offensive || th.missile) && Math.random() < 0.15 + sk * 0.55) {
      this.state = 'evade'; this.stateT = 0; this.jinkT = 0; this.evadeFor = 1.1 + rand(1.2) + sk;
      return;
    }
    if (this.state === 'evade') return;
    if (this.state === 'extend') { if (this.stateT > 2.2 + rand(1.5) || p.speed > p.st.speed * 1.05) this.state = 'engage'; else return; }
    // energy fighting: slow and below the target -> extend instead of a losing climb
    if (!this.target || !this.target.alive || Math.random() < 0.15) this.target = this.pickTarget();
    const tg = this.target;
    if (tg && sk > 0.3 && p.speed < p.st.speed * 0.7 && tg.pos.y > p.pos.y + 60 && Math.random() < sk) { this.state = 'extend'; this.stateT = 0; return; }
    if (this.state !== 'evade') this.state = 'engage';
    // airship: aim at a live turret first
    this.aimPart = null;
    if (tg && tg.kind === 'airship' && tg.turrets) {
      // the nearest live turret (the one on my side), sometimes the hull itself
      let t = null, bd = 1e9;
      for (const u of tg.turrets) { if (!u.alive) continue; const d = u.world.distanceTo(p.pos); if (d < bd) { bd = d; t = u; } }
      const pod = tg.pods && tg.pods.find((u) => u.alive);
      if (pod && Math.random() < 0.2) this.aimPart = pod.world.clone();
      else if (t && Math.random() < 0.75) this.aimPart = t.world.clone();
    }
  }

  bomber(dt) {
    const p = this.p;
    const goal = this.goal || HARBOR;
    _d.set(goal.x - p.pos.x, 0, goal.z - p.pos.z);
    const dist = _d.length();
    _d.normalize();
    _d.y = clamp((330 - p.pos.y) / 300, -0.3, 0.3);
    const safe = safetyDir(p, _s);
    p.steer(safe || _d.normalize(), 0.5);
    p.ctrl.roll *= 0.5;
    this.distToGoal = dist;
  }
}

/** turrets (bomber tail gun, airship turrets): track and shoot the nearest hostile plane */
export function gunnerUpdate(game, owner, gun, dt, range, skill) {
  gun.cd -= dt;
  if (gun.cd > 0) return;
  let best = null, bd = range;
  for (const q of game.planes) {
    if (!q.alive || q.kind !== 'fighter' || !game.hostile(owner, q)) continue;
    const d = q.pos.distanceTo(gun.world);
    if (d < bd) { bd = d; best = q; }
  }
  if (!best) { gun.cd = 0.3; return; }
  const tof = bd / 520;
  const aim = _t.copy(best.pos).addScaledVector(best.vel, tof * (0.5 + skill * 0.5));
  aim.x += rand(-1, 1) * (1 - skill) * 22; aim.y += rand(-1, 1) * (1 - skill) * 22; aim.z += rand(-1, 1) * (1 - skill) * 22;
  const dir = _d.subVectors(aim, gun.world).normalize();
  gun.dir.copy(dir);
  game.fireBullet(owner, gun.world, dir, 520, gun.dmg, false, true);
  gun.cd = gun.rof * (gun.burst-- > 0 ? 1 : 6);
  if (gun.burst < -1) gun.burst = 4 + Math.floor(skill * 6);
}
