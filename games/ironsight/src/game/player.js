// Player movement: fast but grounded. Walk / sprint / tactical sprint, slide with momentum, mantle
// and vault over ledges, crouch, prone, lean (Q/E), jump with momentum preservation, ADS speed
// penalty per gun, footsteps, fall damage. Feet-position AABB collision against the world.
import * as THREE from 'three';

const R = 0.3;
const H = { stand: 1.8, crouch: 1.2, prone: 0.62 };
const EYE = { stand: 1.64, crouch: 1.08, prone: 0.42 };
const SPEED = { walk: 4.8, sprint: 7.0, tac: 8.6, crouch: 2.8, prone: 0.95, back: 0.82, strafe: 0.92 };
const GRAV = 16.5, JUMP_V = 5.2;

export class Player {
  constructor() {
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.recoil = { p: 0, y: 0 };     // aim offset from recoil (recovers when not firing)
    this.shake = { p: 0, y: 0, r: 0 };
    this.stance = 'stand'; this.eye = EYE.stand; this.h = H.stand;
    this.grounded = false; this.sprint = false; this.tac = false; this.tacStamina = 3; this.slide = 0; this.slideCD = 0;
    this.mantle = null; this.lean = 0; this.leanTarget = 0;
    this.health = 100; this.maxHealth = 100; this.lastHurt = -99; this.dead = false;
    this.stepAcc = 0; this.airTime = 0; this.landImpulse = 0; this.fallV = 0;
    this.camPos = new THREE.Vector3(); this.camRoll = 0;
    this.lastShiftTap = -9; this.time = 0;
    this.moveRes = {};
    this.noise = 0;   // how loud the player is this frame (for NPC hearing)
    this.events = [];
  }
  spawn(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0); this.yaw = yaw; this.pitch = 0; this.recoil.p = this.recoil.y = 0;
    this.stance = 'stand'; this.eye = EYE.stand; this.h = H.stand; this.health = this.maxHealth; this.dead = false; this.mantle = null; this.slide = 0;
  }
  get speed() { return Math.hypot(this.vel.x, this.vel.z); }
  get moving() { return this.speed > 0.5; }
  forward(out = new THREE.Vector3()) { return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }
  // world-space aim direction including recoil
  aimDir(out = new THREE.Vector3()) {
    const p = this.pitch + this.recoil.p, y = this.yaw + this.recoil.y;
    return out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
  }
  look(dx, dy, sens, invert) {
    this.yaw -= dx * sens;
    this.pitch = THREE.MathUtils.clamp(this.pitch - dy * sens * (invert ? -1 : 1), -1.5, 1.5);
  }
  setStance(s, world) {
    if (s === this.stance) return true;
    if (H[s] > this.h && !world.free(this.pos.x, this.pos.y + 0.02, this.pos.z, R - 0.02, H[s] - 0.02)) return false;   // no room to stand up
    this.stance = s; this.h = H[s];
    return true;
  }
  // input: { f, s (strafe), jump, jumpPressed, sprint, sprintPressed, crouchPressed, crouchHeld, pronePressed, leanL, leanR, ads, firing }
  update(dt, I, world, gun, audio) {
    this.time += dt; this.events.length = 0; this.noise = 0;
    if (this.dead) { this.vel.set(0, 0, 0); this.eye += (0.3 - this.eye) * Math.min(1, dt * 3); this.camPos.set(this.pos.x, this.pos.y + this.eye, this.pos.z); return; }
    this.slideCD -= dt;
    const fwd = this.forward(_f), right = _r.set(-fwd.z, 0, fwd.x);
    // ---------------- mantle / vault in progress
    if (this.mantle) { this.updateMantle(dt, world); this.updateCamera(dt, world); return; }
    // ---------------- stance input
    if (I.pronePressed) this.setStance(this.stance === 'prone' ? 'stand' : 'prone', world);
    if (I.crouchPressed) {
      if (this.sprint && this.grounded && this.slideCD <= 0 && this.speed > 5) {
        // slide: keep momentum, boost a little, drop to crouch
        this.setStance('crouch', world);
        const sp = Math.max(this.speed + 1.4, 9.2);
        const d = _v.set(this.vel.x, 0, this.vel.z).normalize();
        this.vel.x = d.x * sp; this.vel.z = d.z * sp;
        this.slide = 1.0; this.sprint = false; this.tac = false; this.slideCD = 0.9;
        this.events.push('slide');
      } else this.setStance(this.stance === 'crouch' ? 'stand' : 'crouch', world);
    }
    // ---------------- sprint / tactical sprint
    const wantsMove = Math.abs(I.f) + Math.abs(I.s) > 0.01;
    if (I.sprintPressed) {
      if (this.sprint && this.tacStamina > 0.4) this.tac = true;                     // press again while sprinting
      else if (this.time - this.lastShiftTap < 0.28 && this.tacStamina > 0.4) this.tac = true;   // double tap
      this.lastShiftTap = this.time;
    }
    const canSprint = I.sprint && I.f > 0.3 && !I.ads && this.slide <= 0 && this.grounded !== null;
    if (canSprint && !this.sprint && this.stance !== 'stand') this.setStance('stand', world);
    this.sprint = canSprint && this.stance === 'stand';
    if (!this.sprint) this.tac = false;
    if (I.firing) { this.sprint = false; this.tac = false; }
    if (this.tac) { this.tacStamina -= dt; if (this.tacStamina <= 0) { this.tac = false; this.tacStamina = 0; } }
    else this.tacStamina = Math.min(3, this.tacStamina + dt * 0.6);
    // ---------------- lean
    this.leanTarget = (I.leanR ? 1 : 0) - (I.leanL ? 1 : 0);
    if (this.sprint || this.slide > 0) this.leanTarget = 0;
    // ---------------- target speed
    let maxSp = this.stance === 'prone' ? SPEED.prone : this.stance === 'crouch' ? SPEED.crouch : this.sprint ? (this.tac ? SPEED.tac : SPEED.sprint) : SPEED.walk;
    const adsK = I.adsW || 0;
    const gunMove = gun ? gun.move : 0.85;
    maxSp *= this.sprint ? 1 : THREE.MathUtils.lerp(Math.min(1, gunMove + 0.1), gunMove * 0.62, adsK);
    if (I.f < 0) maxSp *= SPEED.back;
    const wish = _w.set(0, 0, 0).addScaledVector(fwd, I.f).addScaledVector(right, I.s);
    if (wish.lengthSq() > 1) wish.normalize();
    // ---------------- integrate
    if (this.grounded) {
      if (this.slide > 0) {
        // slide friction; slight steering; ends when slow
        const sp = this.speed, ns = Math.max(0, sp - (4.2 + sp * 0.12) * dt);
        if (sp > 0.01) { this.vel.x *= ns / sp; this.vel.z *= ns / sp; }
        this.vel.x += wish.x * 2 * dt; this.vel.z += wish.z * 2 * dt;
        this.slide -= dt;
        if (ns < 3.2) this.slide = 0;
      } else {
        const tx = wish.x * maxSp, tz = wish.z * maxSp;
        const accel = wantsMove ? (this.sprint ? 9 : 13) : 16;
        const k = 1 - Math.exp(-accel * dt);
        this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k;
      }
      if (I.jumpPressed) {
        if (this.tryMantle(world, true)) { this.updateCamera(dt, world); return; }
        if (this.stance === 'prone') this.setStance('crouch', world);
        else if (this.stance === 'crouch' && this.slide <= 0) this.setStance('stand', world);
        else { this.vel.y = JUMP_V; this.grounded = false; this.slide = 0; this.events.push('jump'); if (audio) audio.jump(); }
      }
    } else {
      // air: momentum is preserved; small air control that cannot add speed beyond max(current, walk)
      const cur = this.speed, lim = Math.max(cur, SPEED.walk);
      this.vel.x += wish.x * 3.5 * dt; this.vel.z += wish.z * 3.5 * dt;
      const ns = this.speed; if (ns > lim) { this.vel.x *= lim / ns; this.vel.z *= lim / ns; }
      // grab a ledge when jumping into it
      if ((I.jump || I.f > 0.5) && this.vel.y < 2.5 && this.tryMantle(world, false)) { this.updateCamera(dt, world); return; }
    }
    this.vel.y -= GRAV * dt;
    if (this.vel.y < -40) this.vel.y = -40;
    const wasGround = this.grounded, vy = this.vel.y;
    const res = world.move(this.pos, _d.copy(this.vel).multiplyScalar(dt), R, this.h, this.grounded && this.stance !== 'prone' ? 0.5 : 0.12, this.moveRes);
    if (res.ground && this.vel.y < 0) {
      if (!wasGround && vy < -3) {
        this.landImpulse = Math.min(3, -vy * 0.25);
        if (audio) audio.land(Math.min(1, -vy / 10), this.surfaceUnder(world));
        if (vy < -12) this.hurt((-vy - 12) * 9, null);
        this.noise = Math.max(this.noise, 10);
      }
      this.vel.y = 0; this.grounded = true; this.airTime = 0;
    } else {
      // walking off a ledge: stay grounded for small drops (stairs down)
      if (wasGround && vy <= 0 && !res.ground) {
        const g = world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.05, R * 0.9);
        if (g > this.pos.y - 0.45 && g <= this.pos.y) { this.pos.y = g + 0.0005; this.grounded = true; this.vel.y = 0; }
        else this.grounded = false;
      } else this.grounded = res.ground;
      this.airTime += dt;
    }
    if (res.ceil && this.vel.y > 0) this.vel.y = 0;
    if (res.wall) {
      // kill velocity into the wall
      const n = res.wallN; const vn = this.vel.x * n.x + this.vel.z * n.z;
      if (vn < 0) { this.vel.x -= n.x * vn; this.vel.z -= n.z * vn; }
    }
    if (res.stepped) this.eye -= Math.min(0.3, res.stepped) * 0.8;    // smooth the camera over steps
    // ---------------- footsteps
    if (this.grounded && this.speed > 0.8) {
      const stride = this.sprint ? 1.05 : this.stance === 'crouch' ? 0.6 : this.slide > 0 ? 99 : 0.78;
      this.stepAcc += this.speed * dt;
      if (this.stepAcc > stride) {
        this.stepAcc = 0;
        const loud = this.stance === 'prone' ? 0.15 : this.stance === 'crouch' ? 0.35 : this.sprint ? 1 : 0.6;
        if (audio) audio.footstep(this.surfaceUnder(world), loud * (this.tac ? 1.15 : 1), null);
        this.noise = Math.max(this.noise, loud * 14);
      }
    }
    if (this.slide > 0 && audio) audio.slideLoop(this.speed / 8); else if (audio) audio.slideLoop(0);
    this.updateCamera(dt, world);
  }
  surfaceUnder(world) {
    let s = 'concrete', top = -99;
    world.query(this.pos.x - 0.1, this.pos.z - 0.1, this.pos.x + 0.1, this.pos.z + 0.1, b => { if (b.max.y <= this.pos.y + 0.05 && b.max.y > top && b.min.x <= this.pos.x && b.max.x >= this.pos.x && b.min.z <= this.pos.z && b.max.z >= this.pos.z) { top = b.max.y; s = b.surf; } });
    return s;
  }
  // find a ledge in front; vault when it is low and thin and we are moving fast
  tryMantle(world, fromGround) {
    if (this.stance === 'prone') return false;
    const fwd = this.forward(_f);
    const feet = this.pos.y;
    let top = -99, hitBox = null;
    for (const reach of [0.45, 0.75]) {
      const px = this.pos.x + fwd.x * (R + reach * 0.5), pz = this.pos.z + fwd.z * (R + reach * 0.5);
      world.query(px - 0.12, pz - 0.12, px + 0.12, pz + 0.12, b => {
        if (!b.solid) return;
        if (b.max.y > feet + 0.45 && b.max.y < feet + 2.15 && b.min.y < feet + 1.6 && b.max.y > top && px >= b.min.x - 0.12 && px <= b.max.x + 0.12 && pz >= b.min.z - 0.12 && pz <= b.max.z + 0.12) { top = b.max.y; hitBox = b; }
      });
      if (hitBox) break;
    }
    if (!hitBox) return false;
    if (!fromGround && top > feet + 1.9) return false;
    // standing spot on top, a little past the edge
    let land = null;
    for (const d of [0.55, 0.85]) {
      const x = this.pos.x + fwd.x * (R + d), z = this.pos.z + fwd.z * (R + d);
      if (world.free(x, top + 0.02, z, R - 0.03, H.crouch)) { land = new THREE.Vector3(x, top + 0.01, z); break; }
    }
    // vault: low (< 1.3), thin obstacle, moving fast, clear landing on the far side
    const rise = top - feet;
    if (rise < 1.3 && this.speed > 3.2) {
      for (const d of [1.1, 1.5, 1.9]) {
        const x = this.pos.x + fwd.x * (R + d), z = this.pos.z + fwd.z * (R + d);
        if (!world.free(x, top + 0.05, z, R - 0.03, 0.4)) continue;      // obstacle continues
        const g = world.groundAt(x, z, top + 0.01, R * 0.8);
        if (g < feet - 1.8 || !world.free(x, g + 0.02, z, R - 0.03, H.stand - 0.05)) continue;
        // make sure the arc clears
        if (!world.free((this.pos.x + x) / 2, top + 0.08, (this.pos.z + z) / 2, R * 0.7, 0.9)) continue;
        this.mantle = { t: 0, dur: 0.48, vault: true, a: this.pos.clone(), top, b: new THREE.Vector3(x, g + 0.002, z), keep: this.speed };
        this.events.push('vault');
        return true;
      }
    }
    if (!land) return false;
    if (!world.free(this.pos.x, feet + 0.02, this.pos.z, R - 0.05, top - feet + H.crouch)) return false;   // head room to climb
    const standRoom = world.free(land.x, land.y + 0.01, land.z, R - 0.03, H.stand - 0.02);
    this.mantle = { t: 0, dur: 0.25 + rise * 0.22, vault: false, a: this.pos.clone(), top, b: land, stand: standRoom };
    this.events.push('mantle');
    return true;
  }
  updateMantle(dt, world) {
    const M = this.mantle; M.t += dt; const k = Math.min(1, M.t / M.dur);
    const e = k * k * (3 - 2 * k);
    if (M.vault) {
      // over the top in an arc and keep running speed
      this.pos.lerpVectors(M.a, M.b, e);
      this.pos.y = THREE.MathUtils.lerp(M.a.y, M.b.y, e) + Math.sin(e * Math.PI) * (M.top - Math.min(M.a.y, M.b.y) + 0.25);
    } else {
      // climb up first, then forward
      const up = Math.min(1, e / 0.65), fw = Math.max(0, (e - 0.45) / 0.55);
      this.pos.x = THREE.MathUtils.lerp(M.a.x, M.b.x, fw); this.pos.z = THREE.MathUtils.lerp(M.a.z, M.b.z, fw);
      this.pos.y = THREE.MathUtils.lerp(M.a.y, M.b.y, up);
      this.h = H.crouch; this.stance = 'crouch';
    }
    if (k >= 1) {
      const fwd = this.forward(_f);
      this.vel.set(0, 0, 0);
      if (M.vault) { this.vel.x = fwd.x * Math.max(4.5, M.keep * 0.9); this.vel.z = fwd.z * Math.max(4.5, M.keep * 0.9); }
      if (!M.vault) { if (M.stand) this.setStance('stand', world); }
      this.mantle = null; this.grounded = true; this.landImpulse = 0.8;
    }
  }
  updateCamera(dt, world) {
    // eye height eases toward the stance target (the crouch is quick, standing slower)
    const target = this.mantle ? (this.mantle.vault ? 1.45 : 1.2) : EYE[this.stance] - (this.slide > 0 ? 0.12 : 0);
    this.eye += (target - this.eye) * Math.min(1, dt * (target < this.eye ? 14 : 9));
    this.lean += (this.leanTarget - this.lean) * Math.min(1, dt * 9);
    const right = _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    let leanDist = this.lean * 0.42;
    if (Math.abs(leanDist) > 0.01) {
      // stop the lean at walls
      const head = _v.set(this.pos.x, this.pos.y + this.eye, this.pos.z);
      const dir = _d.copy(right).multiplyScalar(Math.sign(leanDist));
      const hit = world.raycast(head, dir, Math.abs(leanDist) + 0.2, b => b.solid, _hit);
      if (hit) leanDist = Math.sign(leanDist) * Math.max(0, hit.t - 0.2);
    }
    const leanDown = Math.abs(this.lean) * 0.06;
    this.camPos.set(this.pos.x + right.x * leanDist, this.pos.y + this.eye - leanDown, this.pos.z + right.z * leanDist);
    this.camRoll = -this.lean * 0.17 + (this.slide > 0 ? 0.05 : 0);
    // landing dip
    this.landImpulse *= Math.exp(-dt * 8);
    this.camPos.y -= this.landImpulse * 0.05;
  }
  hurt(dmg, fromPos) {
    if (this.dead) return;
    this.health -= dmg; this.lastHurt = this.time;
    if (fromPos) this.events.push({ hurt: dmg, from: fromPos.clone() });
    if (this.health <= 0) { this.health = 0; this.dead = true; this.events.push('dead'); }
  }
  regen(dt) {
    if (!this.dead && this.time - this.lastHurt > 5 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * 22);
  }
  // capsule for incoming bullets: feet .. head
  hitZones() {
    const p = this.pos, top = p.y + this.h;
    return { x: p.x, z: p.z, y0: p.y, y1: top, r: R, headY: top - 0.24 };
  }
}
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _w = new THREE.Vector3(), _v = new THREE.Vector3(), _d = new THREE.Vector3(), _hit = {};
