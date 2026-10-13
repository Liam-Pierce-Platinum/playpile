// Soldier: one class for the player and every NPC. Bots and the player both drive it
// through the same `intent` (move, look, fire, aim, crouch, reload, grenade...), so
// allies, enemies and the autopilot all obey identical movement + weapon rules.
import * as THREE from '../vendor/three.module.js';
import { buildSoldier, buildGun } from './models.js';
import { statsFor, WEAPONS, GRENADES } from './weapons.js';
import { clamp, lerp, DEG, angDiff, fwdX, fwdZ } from './util.js';

export const EYE_STAND = 1.62, EYE_CROUCH = 1.12, RADIUS = 0.36;
const GRAV = 22;

export function newIntent() {
  return { mx: 0, mz: 0, yaw: 0, pitch: 0, fire: false, ads: false, reload: false, jump: false, crouch: false, sprint: false, grenade: false, slot: -1, interact: false, melee: false };
}

let NEXT_ID = 1;
export class Soldier {
  constructor(match, o) {
    this.match = match;
    this.id = NEXT_ID++;
    this.team = o.team; this.role = o.role || 'rifleman'; this.name = o.name || 'Soldier';
    this.isPlayer = !!o.isPlayer;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.hp = 100; this.maxHp = 100;
    this.alive = false; this.downed = false; this.downT = 0;
    this.crouchK = 0; this.onGround = true; this.inWater = false;
    this.intent = newIntent();
    this.loadout = o.loadout;
    this.skin = o.skin ?? (this.id % 5);
    this.rig = buildSoldier(this.team, this.role, this.skin);
    this.root = this.rig.root;
    this.root.visible = false;
    match.scene.add(this.root);
    this.kills = 0; this.deaths = 0; this.caps = 0; this.score = 0; this.assists = 0; this.revives = 0;
    this.damagers = new Map();
    this.lastHurt = -99; this.lastShot = -99; this.lastStep = 0; this.stepPhase = 0;
    this.walkPhase = 0; this.kick = 0; this.throwT = 0; this.meleeT = 0;
    this.brain = null;
    this.speedNow = 0;
    this.fireHeld = false;
    this.setLoadout(o.loadout);
  }
  setLoadout(l) {
    this.slots = [
      this.makeSlot(l.primary.id, l.primary.att || []),
      this.makeSlot(l.secondary.id, l.secondary.att || []),
      null,
      this.makeSlot('knife', []),
    ];
    this.grenadeType = l.grenade || 'frag';
    this.grenades = GRENADES[this.grenadeType].count + (l.extraGrenade ? 1 : 0);
    this.cur = 0;
    this.attachGun();
  }
  makeSlot(id, att) {
    const s = statsFor(id, att);
    return { id, att, s, mag: s.mag, reserve: s.reserve };
  }
  get w() { return this.slots[this.cur]; }
  attachGun() {
    const m = this.rig.gunMount;
    if (this.gun) m.remove(this.gun);
    const sl = this.w;
    this.gun = buildGun(sl.id, sl.att);
    this.gun.scale.setScalar(1.15);
    m.add(this.gun);
    this.reloadT = 0; this.fireCD = Math.max(this.fireCD || 0, 0.05); this.burstLeft = 0; this.bloom = 0; this.adsK = 0;
    this.switchT = 0.45;
  }
  spawn(x, z, yaw) {
    const w = this.match.world;
    this.pos.set(x, w.floorAt(x, z, 0.2, 50), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0;
    this.hp = this.maxHp; this.alive = true; this.downed = false; this.downT = 0; this.bleed = 0;
    this.dead = null; this.crouchK = 0;
    this.setLoadout(this.loadout);
    this.root.visible = !this.isPlayer || this.match.thirdPerson;
    this.rig.body.rotation.set(0, 0, 0); this.rig.body.position.set(0, 0, 0);
    this.spawnT = this.match.time;
    this.lastHurt = -99;
    this.damagers.clear();
    this.suppress = 0;
    if (this.brain) this.brain.onSpawn();
  }
  eye(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + lerp(EYE_STAND, EYE_CROUCH, this.crouchK), this.pos.z); }
  head(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.downed ? 0.25 : lerp(1.66, 1.16, this.crouchK)), this.pos.z); }
  chest(out = new THREE.Vector3()) { return out.set(this.pos.x, this.pos.y + (this.downed ? 0.25 : lerp(1.25, 0.85, this.crouchK)), this.pos.z); }
  bodyTop() { return this.downed ? 0.45 : lerp(1.48, 0.98, this.crouchK); }
  get active() { return this.alive && !this.downed; }
  // ---------------------------------------------------------------- per-frame update
  update(dt) {
    if (!this.alive) { this.updateDead(dt); return; }
    const M = this.match, W = M.world, it = this.intent;
    if (this.downed) {
      this.downT += dt;
      this.vel.set(0, 0, 0);
      if (this.downT > (this.isPlayer ? 15 : 20)) { M.stat.bleed++; } if (this.downT > (this.isPlayer ? 15 : 20)) M.kill(this, this.lastAttacker, this.lastWeapon, false, true);
      this.animate(dt);
      return;
    }
    // look
    this.yaw = it.yaw; this.pitch = clamp(it.pitch, -1.45, 1.45);
    // stance
    const wantCrouch = it.crouch && !it.sprint;
    this.crouchK = clamp(this.crouchK + (wantCrouch ? 1 : -1) * dt * 7, 0, 1);
    // movement
    const sl = this.w, s = sl.s;
    const reloading = this.reloadT > 0;
    let mx = it.mx, mz = it.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    // sprint only when moving roughly forward
    const fwdDot = ml > 0.01 ? (mx * fwdX(this.yaw) + mz * fwdZ(this.yaw)) / Math.max(ml, 1e-3) : 0;
    this.sprinting = it.sprint && ml > 0.3 && fwdDot > 0.5 && this.crouchK < 0.3 && !it.ads && !(it.fire && sl.s.mode !== 'melee');
    this.inWater = W.inWater(this.pos.x, this.pos.z) && this.pos.y < W.waterY - 0.2;
    let speed = 4.7 * (s.speed || 1);
    if (this.sprinting) speed *= 1.5;
    speed *= lerp(1, 0.48, this.crouchK);
    speed *= lerp(1, 0.62, this.adsK);
    if (this.inWater) speed *= 0.58;
    if (this.suppress > 0.5 && !this.isPlayer) speed *= 0.9;
    const tx = mx * speed, tz = mz * speed;
    const acc = this.onGround ? 42 : 7;
    const dvx = tx - this.vel.x, dvz = tz - this.vel.z;
    const dl = Math.hypot(dvx, dvz), step = acc * dt;
    if (dl <= step) { this.vel.x = tx; this.vel.z = tz; } else { this.vel.x += dvx / dl * step; this.vel.z += dvz / dl * step; }
    if (it.jump && this.onGround && this.crouchK < 0.5) { this.vel.y = 7.0; this.onGround = false; }
    this.vel.y -= GRAV * dt;
    const oy = this.pos.y;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt;
    const h = lerp(1.8, 1.25, this.crouchK);
    W.collide(this.pos, RADIUS, h);
    this.pos.y += this.vel.y * dt;
    const floor = W.floorAt(this.pos.x, this.pos.z, 0.22, Math.max(oy, this.pos.y));
    if (this.pos.y <= floor + 0.001) {
      if (!this.onGround && this.vel.y < -9 && this.isPlayer) M.onLand(this, -this.vel.y);
      this.pos.y = floor; this.vel.y = 0; this.onGround = true;
    } else if (this.onGround && this.vel.y <= 0 && floor > this.pos.y - 0.45) {
      this.pos.y = floor; this.vel.y = 0; // stick to ground on step-downs/slopes
    } else this.onGround = false;
    if (this.pos.y < -20) M.kill(this, null, 'fall', false, true);
    this.speedNow = Math.hypot(this.vel.x, this.vel.z);
    // footsteps
    if (this.onGround && this.speedNow > 1.2) {
      this.stepPhase += dt * this.speedNow * 0.62;
      if (this.stepPhase > 1) {
        this.stepPhase = 0;
        const loud = this.sprinting ? 1.4 : this.crouchK > 0.5 ? 0.35 : 0.8;
        M.footstep(this, loud);
      }
    }
    // weapon
    this.weaponTick(dt);
    // interaction (revive / pickup)
    this.animate(dt);
  }
  weaponTick(dt) {
    const it = this.intent, M = this.match;
    const sl = this.w, s = sl.s;
    this.fireCD = Math.max(0, this.fireCD - dt);
    this.switchT = Math.max(0, this.switchT - dt);
    this.throwT = Math.max(0, this.throwT - dt);
    this.meleeT = Math.max(0, this.meleeT - dt);
    this.bloom = Math.max(0, this.bloom - dt * (s.spread.rec || 6));
    this.kick = Math.max(0, this.kick - dt * 8);
    const canAds = !this.sprinting && this.switchT <= 0 && !(this.reloadT > 0 && !s.reloadPer) && s.mode !== 'melee';
    this.adsK = clamp(this.adsK + (it.ads && canAds ? 1 : -1) * dt / Math.max(0.05, s.ads), 0, 1);
    // slot switching
    if (it.slot >= 0 && it.slot !== this.cur && this.slots[it.slot]) {
      this.cur = it.slot; this.attachGun();
      if (this.isPlayer) M.audio.swap();
      M.onSwitch(this);
    }
    it.slot = -1;
    // grenade
    if (it.grenade && this.grenades > 0 && this.throwT <= 0 && this.switchT <= 0) {
      this.grenades--; this.throwT = 0.9;
      M.throwGrenade(this, this.grenadeType);
      this.reloadT = 0;
    }
    it.grenade = false;
    // melee (V or knife slot)
    if ((it.melee || (s.mode === 'melee' && it.fire)) && this.meleeT <= 0 && this.switchT <= 0) {
      this.meleeT = 0.55; M.melee(this);
    }
    it.melee = false;
    if (s.mode === 'melee') { this.fireHeld = it.fire; return; }
    // reload
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (s.reloadPer) {
        if (this.reloadT <= 0) {
          if (sl.reserve > 0 && sl.mag < s.mag) { sl.mag++; sl.reserve--; if (this.isPlayer) M.audio.shell(); }
          if (sl.mag < s.mag && sl.reserve > 0 && !(it.fire && sl.mag > 0)) this.reloadT = s.reload; else this.reloadT = 0;
        }
      } else if (this.reloadT <= 0) {
        const need = s.mag - sl.mag, take = Math.min(need, sl.reserve);
        sl.mag += take; sl.reserve -= take; this.reloadT = 0;
      }
    }
    const wantReload = it.reload || (sl.mag === 0 && it.fire && !this.fireHeld) || (sl.mag === 0 && this.fireCD <= 0 && !this.isPlayer);
    if (wantReload && this.reloadT <= 0 && sl.mag < s.mag && sl.reserve > 0 && this.switchT <= 0) {
      this.reloadT = s.reloadPer ? s.reload * 1.3 : s.reload;
      this.burstLeft = 0;
      M.onReload(this);
    }
    it.reload = false;
    // firing
    const trigger = it.fire && !this.sprinting && this.switchT <= 0 && this.throwT <= 0.3;
    if (this.burstLeft > 0) {
      if (this.fireCD <= 0 && sl.mag > 0) { this.shoot(); this.burstLeft--; this.fireCD = this.burstLeft > 0 ? s.interval : s.burstDelay; }
      else if (sl.mag === 0) this.burstLeft = 0;
    } else if (trigger && this.fireCD <= 0 && (this.reloadT <= 0 || (s.reloadPer && sl.mag > 0))) {
      const edge = !this.fireHeld;
      if (sl.mag <= 0) { if (edge && this.isPlayer) M.audio.empty(); }
      else if (s.mode === 'auto') { this.shoot(); this.fireCD = s.interval; }
      else if (edge) {
        if (s.mode === 'burst') { this.burstLeft = s.burst - 1; this.shoot(); this.fireCD = s.interval; }
        else { this.shoot(); this.fireCD = s.interval; }
        if (s.reloadPer) this.reloadT = 0;
      }
    }
    this.fireHeld = it.fire;
  }
  shoot() {
    const sl = this.w, s = sl.s, M = this.match;
    sl.mag--;
    this.lastShot = M.time;
    // spread (degrees): ADS blend + movement + bloom
    const moveK = clamp(this.speedNow / 4.7, 0, 1.5);
    let spread = lerp(s.spread.hip, s.spread.ads, this.adsK) + moveK * s.spread.move * (this.onGround ? 1 : 2.5) + this.bloom;
    spread *= lerp(1, 0.75, this.crouchK);
    if (!this.isPlayer && this.brain) spread *= this.brain.spreadMul();
    this.bloom = Math.min(s.spread.max || 0, this.bloom + (s.spread.bloom || 0));
    const pellets = s.pellets || 1;
    const eye = this.eye(new THREE.Vector3());
    const cp = Math.cos(this.pitch);
    const fx = -Math.sin(this.yaw) * cp, fy = Math.sin(this.pitch), fz = -Math.cos(this.yaw) * cp;
    const f = new THREE.Vector3(fx, fy, fz);
    const r = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const u = new THREE.Vector3().crossVectors(r, f);
    for (let p = 0; p < pellets; p++) {
      const a = Math.random() * Math.PI * 2, m = Math.sqrt(Math.random()) * spread * DEG;
      const d = f.clone().addScaledVector(r, Math.cos(a) * Math.tan(m)).addScaledVector(u, Math.sin(a) * Math.tan(m)).normalize();
      if (s.proj) M.fireRocket(this, eye, d, s);
      else M.hitscan(this, eye, d, s, p === 0);
    }
    // recoil
    const kv = s.recoil.v * DEG * lerp(1, 0.8, this.adsK) * lerp(1, 0.8, this.crouchK);
    const kh = (Math.random() - 0.5) * 2 * s.recoil.h * DEG;
    M.onShot(this, s, kv, kh);
    this.kick = Math.min(1, this.kick + 0.6);
  }
  // ---------------------------------------------------------------------- animation
  animate(dt) {
    const R = this.rig;
    this.root.position.copy(this.pos);
    this.root.rotation.y = this.yaw;
    const crouch = this.crouchK;
    const sp = this.speedNow;
    if (this.downed) {
      R.body.rotation.x = lerp(R.body.rotation.x, -1.45, dt * 6);
      R.body.position.y = lerp(R.body.position.y, 0.22, dt * 6);
      R.hips.position.y = 0.2;
      R.armL.sh.rotation.x = 2.4 + Math.sin(this.match.time * 3) * 0.3; R.armR.sh.rotation.x = 0.4;
      R.legL.hp.rotation.x = 0.3; R.legR.hp.rotation.x = -0.1; R.legL.kn.rotation.x = -0.6; R.legR.kn.rotation.x = -0.2;
      R.torso.rotation.x = 0; R.gunMount.visible = false;
      return;
    }
    R.gunMount.visible = true;
    R.body.rotation.x = lerp(R.body.rotation.x, 0, dt * 8);
    R.body.position.y = 0;
    // walk cycle: phase by distance
    this.walkPhase += sp * dt * (this.sprinting ? 1.35 : 1.75);
    const amp = clamp(sp / 4.5, 0, 1.2) * (this.sprinting ? 0.95 : 0.6);
    const s1 = Math.sin(this.walkPhase), s2 = Math.sin(this.walkPhase + Math.PI);
    // relative direction of motion (strafe uses less swing)
    const hipY = lerp(0.92, 0.6, crouch) + Math.abs(Math.cos(this.walkPhase)) * amp * 0.05;
    R.hips.position.y = hipY;
    const cr = crouch;
    R.legL.hp.rotation.x = s1 * amp + cr * 1.25; R.legR.hp.rotation.x = s2 * amp + cr * 0.7;
    R.legL.kn.rotation.x = -(Math.max(0, -Math.cos(this.walkPhase)) * amp * 1.2 + cr * 2.0); R.legR.kn.rotation.x = -(Math.max(0, Math.cos(this.walkPhase)) * amp * 1.2 + cr * 1.5);
    if (!this.onGround) { R.legL.hp.rotation.x = 0.7; R.legR.hp.rotation.x = -0.2; R.legL.kn.rotation.x = -1.1; R.legR.kn.rotation.x = -0.4; }
    // torso pitch follows aim (partly), sprint leans
    const aimP = this.pitch;
    R.torso.rotation.x = aimP * 0.55 + (this.sprinting ? -0.15 : 0) + cr * 0.15 - this.kick * 0.06;
    R.head.rotation.x = aimP * 0.45;
    R.torso.rotation.y = this.sprinting ? 0 : 0.18;
    R.head.rotation.y = -0.15;
    // arms: aim pose; gun points along torso forward
    const hold = this.w.s.hold;
    const reload = this.reloadT > 0;
    if (this.sprinting) {
      R.armR.sh.rotation.set(0.5 + s2 * 0.3, 0, -0.1); R.armR.el.rotation.set(0.9, 0, 0);
      R.armL.sh.rotation.set(0.9 + s1 * 0.2, 0, 0.5); R.armL.el.rotation.set(1.2, 0, 0);
      R.gunMount.rotation.set(-0.6, 0.6, 0.3);
    } else if (hold === 'pistol' || hold === 'knife') {
      R.armR.sh.rotation.set(1.45, 0, 0.15); R.armR.el.rotation.set(0.1, 0, 0);
      R.armL.sh.rotation.set(1.35, 0, -0.45); R.armL.el.rotation.set(0.3, 0, 0);
      R.gunMount.rotation.set(0, 0, 0);
    } else {
      R.armR.sh.rotation.set(1.1, 0, 0.25); R.armR.el.rotation.set(0.85, 0, 0);
      R.armL.sh.rotation.set(1.35, 0, -0.55); R.armL.el.rotation.set(0.35, 0, 0);
      R.gunMount.rotation.set(0, 0, 0);
    }
    if (reload) { R.armL.sh.rotation.x = 0.6; R.armL.el.rotation.x = 1.3; R.gunMount.rotation.z = 0.5; R.gunMount.rotation.x = 0.25; }
    if (this.throwT > 0.4) { R.armL.sh.rotation.set(2.8, 0, -0.2); }
    if (this.meleeT > 0.2) { R.armR.sh.rotation.x = 1.9 - (0.55 - this.meleeT) * 4; }
    R.gunMount.position.z = -0.2 + this.kick * 0.06;
    if (this.gun && this.gun.userData.flash) {
      const fl = this.gun.userData.flash;
      const on = this.match.time - this.lastShot < 0.045 && !this.w.s.suppressed;
      fl.visible = on;
      if (on) { fl.rotation.z = Math.random() * 6; fl.scale.setScalar(1.2 + Math.random()); }
    }
  }
  // ragdoll-ish tumble
  startDeath(dir, force = 1) {
    this.dead = { t: 0, vx: dir.x * 2.5 * force, vz: dir.z * 2.5 * force, ax: 0, az: 0, fall: (Math.random() < 0.5 ? 1 : -1), spin: (Math.random() - 0.5) * 2 };
    // fall away from the shooter: rotate body around feet
    const local = dir.x * Math.cos(this.yaw) - dir.z * Math.sin(this.yaw); // dir in rig-right
    const fwd = dir.x * fwdX(this.yaw) + dir.z * fwdZ(this.yaw);
    this.dead.tx = fwd > 0 ? -1.5 : 1.45; // forward/back
    this.dead.tz = clamp(-local * 1.2, -0.7, 0.7);
    this.dead.vy = force > 1.5 ? 4 : 0.8;
    this.rig.gunMount.visible = false;
  }
  updateDead(dt) {
    const d = this.dead;
    if (!d) return;
    d.t += dt;
    const R = this.rig;
    const k = clamp(d.t / 0.7, 0, 1);
    const ease = k < 1 ? k * k : 1;
    const bounce = d.t > 0.7 && d.t < 1.0 ? Math.sin((d.t - 0.7) / 0.3 * Math.PI) * 0.12 : 0;
    R.body.rotation.x = d.tx * ease - Math.sign(d.tx) * bounce;
    R.body.rotation.z = d.tz * ease;
    this.root.rotation.y += d.spin * dt * (1 - k);
    // slide + hop
    const slow = Math.max(0, 1 - d.t * 2);
    this.pos.x += d.vx * dt * slow; this.pos.z += d.vz * dt * slow;
    this.match.world.collide(this.pos, 0.3, 1.0);
    d.vy -= 20 * dt;
    const floor = this.match.world.floorAt(this.pos.x, this.pos.z, 0.2, this.pos.y + 0.3);
    R.body.position.y = Math.max(0, R.body.position.y + d.vy * dt);
    if (R.body.position.y <= 0) { R.body.position.y = 0; d.vy = 0; }
    this.pos.y = lerp(this.pos.y, floor, dt * 10);
    this.root.position.copy(this.pos);
    // limbs go limp
    const lk = Math.min(1, d.t * 3);
    R.armR.sh.rotation.x = lerp(R.armR.sh.rotation.x, 2.6 * Math.sign(d.tx) * 0.6, lk * 0.2); R.armL.sh.rotation.x = lerp(R.armL.sh.rotation.x, 2.9, lk * 0.15);
    R.armL.sh.rotation.z = lerp(R.armL.sh.rotation.z, -1.0, lk * 0.2); R.armR.sh.rotation.z = lerp(R.armR.sh.rotation.z, 1.0, lk * 0.2);
    R.legL.hp.rotation.x = lerp(R.legL.hp.rotation.x, 0.25, lk * 0.2); R.legR.hp.rotation.x = lerp(R.legR.hp.rotation.x, -0.35, lk * 0.2);
    R.legL.kn.rotation.x = lerp(R.legL.kn.rotation.x, -0.8, lk * 0.2); R.legR.kn.rotation.x = lerp(R.legR.kn.rotation.x, -0.2, lk * 0.2);
    R.head.rotation.x = lerp(R.head.rotation.x, 0.5, lk * 0.2);
    if (d.t > 9) { this.root.position.y = this.pos.y - (d.t - 9) * 0.4; }
    if (d.t > 11) this.root.visible = false;
  }
  dispose() { this.match.scene.remove(this.root); }
}
export { WEAPONS, angDiff };
