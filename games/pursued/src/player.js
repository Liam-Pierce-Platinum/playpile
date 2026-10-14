// You. A vertical capsule with a camera at eye height: run, sprint (stamina), vault fences and
// cars, climb chain-link, slide under roll gates, crouch, jump, stumble when you get it wrong.
// Everything here is about feel: acceleration, head bob, FOV kick on the sprint, the dip and
// pull of a vault, the jolt of a stumble, and the long look back over your shoulder.
import * as THREE from 'three';
import { SOLID, VAULT, LOW } from './collide.js';

const R = 0.3, STAND = 1.75, CROUCH = 0.95, STEP = 0.42;
export const SPEED = { run: 5.6, sprint: 8.3, crouch: 2.6, slide: 9.4 };
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const _p = new THREE.Vector3(), _o = {};

export class Player {
  constructor(world, doors) {
    this.W = world; this.S = world.statics; this.doors = doors;
    this.pos = new THREE.Vector3(); this.vel = new THREE.Vector3();
    this.reset(0, 0, 0, 0);
  }
  reset(x, y, z, yaw) {
    this.pos.set(x, y, z); this.vel.set(0, 0, 0);
    this.yaw = yaw; this.pitch = 0; this.onGround = true;
    this.stamina = 1; this.crouch = 0; this.slideT = 0; this.vault = null; this.stumble = 0; this.stumbleKind = '';
    this.back = 0; this.bob = 0; this.bobAmt = 0; this.fov = 72; this.tilt = 0; this.shake = 0; this.shakeT = 0;
    this.noise = 0; this.dist = 0; this.exert = 0; this.sprinting = false; this.airT = 0; this.peakY = y;
    this.landKick = 0; this.camY = y + STAND - 0.12; this.events = []; this.frozen = false; this.mistakes = [];
    this.lastStep = 0; this.surface = 'street'; this.indoor = false; this.vaultFail = 0; this.fallStart = y;
    this.dip = 0; this.roll = 0; this.autoCD = 0;
  }
  get height() { return lerp(STAND, CROUCH, this.crouch); }
  get eye() { return this.camY; }
  forward(v = new THREE.Vector3()) { return v.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); }

  // find something to vault in front of us (dir: unit xz)
  vaultTarget(dx, dz, reach = 1.25, feet = this.pos.y) {
    const S = this.S;
    let best = null;
    for (let d = 0.25; d <= reach && !best; d += 0.12) {
      const px = this.pos.x + dx * d, pz = this.pos.z + dz * d;
      S.query(px - 0.05, pz - 0.05, px + 0.05, pz + 0.05, b => {
        if (best) return;
        if (b.k !== VAULT && !(b.k === SOLID && b.y1 - feet < 1.45 && b.y1 - feet > 0.55 && !b.building)) return;
        const top = b.y1 - feet;
        if (top < 0.45 || top > 2.35 || b.y0 > feet + 0.5) return;
        if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) return;
        best = b;
      });
    }
    if (!best) return null;
    // walk along the direction until we are out of the box footprint, then a bit more
    let ex = this.pos.x, ez = this.pos.z, n = 0;
    while (n++ < 60) {
      ex += dx * 0.08; ez += dz * 0.08;
      if (ex < best.x0 - R || ex > best.x1 + R || ez < best.z0 - R || ez > best.z1 + R) break;
    }
    ex += dx * 0.25; ez += dz * 0.25;
    const land = this.S.groundAt(ex, ez, best.y1 + 0.1, 0.15);
    // landing must be free
    let blocked = false;
    S.query(ex - R, ez - R, ex + R, ez + R, b => {
      if (b === best) return;
      if (b.y1 > land + STEP && b.y0 < land + STAND && ex + R > b.x0 && ex - R < b.x1 && ez + R > b.z0 && ez - R < b.z1) blocked = true;
    });
    if (blocked) return null;
    return { box: best, top: best.y1, land, ex, ez, h: best.y1 - feet, fence: best.fence || (best.car ? 'car' : best.dumpster ? 'dumpster' : 'low') };
  }

  lowAhead(dx, dz, reach) {
    let low = false; const feet = this.pos.y;
    for (let d = 0.4; d <= reach && !low; d += 0.3) {
      const px = this.pos.x + dx * d, pz = this.pos.z + dz * d;
      this.S.query(px - 0.05, pz - 0.05, px + 0.05, pz + 0.05, b => { if (b.k === LOW && b.y0 > feet + 0.6 && b.y0 < feet + 1.65 && px >= b.x0 && px <= b.x1 && pz >= b.z0 && pz <= b.z1) low = true; });
    }
    return low;
  }

  // in: {mx, mz, sprint, jump, slide, slideHeld, back, lookDX, lookDY}
  update(dt, t, inp) {
    const S = this.S;
    this.events.length = 0;
    // ---- look ----
    if (!this.frozen) {
      this.yaw -= inp.lookDX; this.pitch = clamp(this.pitch - inp.lookDY, -1.35, 1.35);
    }
    this.back += ((inp.back && !this.frozen ? 1 : 0) - this.back) * (1 - Math.exp(-dt * 9));
    this.stumble = Math.max(0, this.stumble - dt); this.vaultLandT = Math.max(0, (this.vaultLandT || 0) - dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    this.landKick *= Math.exp(-dt * 9);
    this.dip *= Math.exp(-dt * 6);

    // ---- vaulting: scripted arc, no control ----
    if (this.vault) {
      const v = this.vault;
      v.t += dt;
      const k = clamp(v.t / v.dur, 0, 1);
      // up and over: rise to the top, swing over, drop to the landing
      const up = v.top + (v.fence === 'chain' || v.fence === 'wood' ? 0.15 : 0.35);
      const rise = clamp(k / 0.45, 0, 1), fall = clamp((k - 0.55) / 0.45, 0, 1);
      const yy = k < 0.55 ? lerp(v.y0, up, Math.sin(rise * Math.PI / 2)) : lerp(up, v.land, fall * fall);
      const hk = v.slow ? (k < 0.6 ? k * 0.75 / 0.6 : 0.75 + (k - 0.6) / 0.4 * 0.25) : k;
      this.pos.x = lerp(v.x0, v.ex, hk); this.pos.z = lerp(v.z0, v.ez, hk); this.pos.y = yy;
      this.dip = Math.sin(k * Math.PI) * (v.slow ? 0.35 : 0.2);
      this.roll = Math.sin(k * Math.PI) * 0.12 * v.side;
      // keep a real velocity through the vault (the camera's speed kick, its aim and the still-check all read it)
      this.vel.set((v.ex - v.x0) / v.dur, 0, (v.ez - v.z0) / v.dur);
      if (k >= 1) {
        this.vault = null; this.pos.y = v.land; this.onGround = true;
        const f = this.forward(); const sp = Math.max(SPEED.run, v.speed * 0.98);
        this.vel.set(v.dx * sp, 0, v.dz * sp);
        this.events.push({ type: 'land', soft: true, surface: this.surface }); this.vaultLandT = 0.7;
        this.landKick = 0.08;
      }
      this.camUpdate(dt, t, Math.max(v.speed, SPEED.sprint * 0.9));
      return;
    }

    // ---- intent ----
    const fwd = this.forward(new THREE.Vector3());
    const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    let wish = new THREE.Vector3().addScaledVector(fwd, inp.mz).addScaledVector(right, inp.mx);
    if (wish.lengthSq() > 1) wish.normalize();
    if (this.frozen) wish.set(0, 0, 0);
    const moving = wish.lengthSq() > 0.01;
    // crouch / slide
    const sp2 = Math.hypot(this.vel.x, this.vel.z);
    if (inp.slide && this.onGround && sp2 > 4.4 && this.slideT <= 0 && !this.frozen) { this.slideT = 0.85; this.events.push({ type: 'slide' }); const d = sp2 > 0.1 ? 1 / sp2 : 0; this.vel.x *= SPEED.slide * d; this.vel.z *= SPEED.slide * d; }
    let wantCrouch = (inp.slideHeld || this.slideT > 0) ? 1 : 0;
    // cannot stand up under something
    if (!wantCrouch && this.crouch > 0.05) { const c = S.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 0.5, R * 0.8); if (c < this.pos.y + STAND + 0.05) wantCrouch = 1; }
    this.crouch += (wantCrouch - this.crouch) * (1 - Math.exp(-dt * 12));
    // stamina + sprint
    this.sprinting = inp.sprint && moving && this.stamina > 0.02 && this.crouch < 0.5 && inp.mz > -0.2;
    if (this.sprinting) this.stamina = Math.max(0, this.stamina - dt * 0.07);
    else this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.12 : 0.2));
    if (this.stamina <= 0.02) this.winded = 1.2;
    this.winded = Math.max(0, (this.winded || 0) - dt);
    let maxSp = this.sprinting ? SPEED.sprint : SPEED.run;
    if (this.winded > 0 && !this.sprinting) maxSp *= 0.92;
    if (this.crouch > 0.5 && this.slideT <= 0) maxSp = SPEED.crouch;
    if (inp.mz < -0.2) maxSp *= 0.7;
    if (this.stumble > 0) maxSp *= this.stumbleKind === 'fall' ? 0.15 : 0.35;
    this.exert += ((this.sprinting ? 1 : moving ? 0.55 : 0.1) - this.exert) * (1 - Math.exp(-dt * 0.8));

    // ---- horizontal velocity ----
    if (this.slideT > 0) {
      this.slideT -= dt;
      const f = Math.exp(-dt * 1.4);
      this.vel.x *= f; this.vel.z *= f;
      // a little steering
      const s = Math.hypot(this.vel.x, this.vel.z);
      if (s > 0.1 && moving) { const a = Math.atan2(this.vel.x, this.vel.z), b = Math.atan2(wish.x, wish.z); let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); const na = a + clamp(d, -dt * 1.5, dt * 1.5); this.vel.x = Math.sin(na) * s; this.vel.z = Math.cos(na) * s; }
      if (this.slideT <= 0 && s > SPEED.crouch) { /* ease out */ }
    } else {
      const target = wish.clone().multiplyScalar(maxSp);
      const acc = this.onGround ? (moving ? 34 : 30) : 6;
      const dvx = target.x - this.vel.x, dvz = target.z - this.vel.z, dl = Math.hypot(dvx, dvz);
      const step = Math.min(dl, acc * dt);
      if (dl > 1e-5) { this.vel.x += dvx / dl * step; this.vel.z += dvz / dl * step; }
    }
    // ---- gravity ----
    this.vel.y -= 18 * dt;
    // run at a fence, car or dumpster and you are over it: vaults are instant and never fail
    // (also mid-jump, and from a standstill pressed against it: a fence is never a wall you get stuck on)
    const gBelow = this.onGround ? this.pos.y : S.groundAt(this.pos.x, this.pos.z, this.pos.y + STEP, 0.16);
    const nearGround = this.onGround || this.pos.y - gBelow < 1.3;
    if (!this.frozen && nearGround && moving && this.crouch < 0.5 && this.autoCD <= 0) {
      const wd = wish.clone().normalize();
      const along = (this.vel.x * wd.x + this.vel.z * wd.z);
      const hspd = Math.hypot(this.vel.x, this.vel.z);
      if (along > 2.2 || (hspd < 2.2 && inp.mz > 0.3) || !this.onGround) {
        const vt = this.vaultTarget(wd.x, wd.z, along > 2.2 ? 0.95 : 0.7, gBelow);
        // only when you are running AT it, not brushing past along its length
        let square = 1;
        if (vt) { const b = vt.box, wx = b.x1 - b.x0, wz = b.z1 - b.z0; if (Math.max(wx, wz) > 1.4 * Math.min(wx, wz)) square = Math.abs(wx < wz ? wd.x : wd.z); }
        if (vt && square > 0.45) { this.startVault(vt, wd); this.camUpdate(dt, t, this.vault.speed); return; }
        // a low board or a half-shut gate ahead: duck under it without asking
        if (this.slideT <= 0 && this.onGround && this.lowAhead(wd.x, wd.z, 1.6)) { this.slideT = 0.75; this.events.push({ type: 'slide' }); const sp = Math.max(SPEED.run, Math.hypot(this.vel.x, this.vel.z)); this.vel.x = wd.x * sp * 1.05; this.vel.z = wd.z * sp * 1.05; }
      }
    }
    this.autoCD = Math.max(0, (this.autoCD || 0) - dt);
    if (inp.jump && !this.frozen && this.autoCD <= 0) {
      const dir = moving ? wish.clone().normalize() : fwd.clone();
      const vt = this.vaultTarget(dir.x, dir.z, moving ? 1.6 : 1.25, this.onGround ? this.pos.y : S.groundAt(this.pos.x, this.pos.z, this.pos.y + STEP, 0.16));
      if (vt) this.startVault(vt, dir);
      else if (this.onGround && this.crouch < 0.5) { this.vel.y = 5.6; this.onGround = false; this.events.push({ type: 'jump' }); }
    }
    // ---- move + collide ----
    const ox = this.pos.x, oz = this.pos.z;
    const vx0 = this.vel.x, vz0 = this.vel.z;
    this.pos.x += this.vel.x * dt; this.pos.z += this.vel.z * dt; this.pos.y += this.vel.y * dt;
    const hgt = this.height;
    S.resolveCircle(this.pos, R, this.pos.y + STEP, this.pos.y + hgt, _o);
    let hitWall = _o.hits > 0 ? { nx: _o.x, nz: _o.z, box: _o.box } : null;
    // doors
    const dh = this.doors.collide(this.pos, R, this.pos.y, this.pos.y + hgt, this.vel);
    if (dh) this.events.push(dh);
    // actual displacement -> velocity (kills velocity into walls)
    if (dt > 0) {
      const ax = (this.pos.x - ox) / dt, az = (this.pos.z - oz) / dt;
      if (hitWall) {
        const nl = Math.hypot(hitWall.nx, hitWall.nz) || 1;
        const into = -(vx0 * hitWall.nx + vz0 * hitWall.nz) / nl;
        // running face-first into a wall at full tilt is a mistake
        const spd0 = Math.hypot(vx0, vz0);
        if (into > 7.8 && into / Math.max(0.1, spd0) > 0.95 && this.stumble <= 0 && this.slideT <= 0 && this.vaultLandT <= 0) {
          this.stumble = 0.25; this.stumbleKind = 'wall'; this.shake = Math.max(this.shake, 0.5); this.events.push({ type: 'stumble', why: 'ran into a wall' });
          this.vel.multiplyScalar(0.35);
        } else { this.vel.x = ax; this.vel.z = az; }
      }
    }
    // ---- ground ----
    const g = S.groundAt(this.pos.x, this.pos.z, this.pos.y + STEP, 0.16);
    if (this.vel.y <= 0 && this.pos.y <= g + 0.001) {
      const fell = this.peakY - g;
      if (!this.onGround) {
        this.events.push({ type: 'land', h: fell, surface: this.surface });
        this.landKick = clamp(fell * 0.06, 0.03, 0.25);
        if (fell > 3.2) { this.stumble = 0.4; this.stumbleKind = 'fall'; this.shake = 0.6; this.events.push({ type: 'stumble', why: 'jumped down too far' }); }
      }
      this.pos.y = g; this.vel.y = 0; this.onGround = true; this.peakY = g;
    } else if (this.onGround && this.vel.y <= 0 && this.pos.y - g < 0.45) {
      // walking down steps: stick to them
      this.pos.y = g; this.vel.y = 0;
    } else {
      if (this.onGround) this.peakY = this.pos.y;
      this.onGround = false;
      this.peakY = Math.max(this.peakY, this.pos.y);
    }
    // ceiling
    const ceil = S.ceilingAt(this.pos.x, this.pos.z, this.pos.y + 0.6, R * 0.7);
    if (this.pos.y + hgt > ceil) { if (this.vel.y > 0) this.vel.y = 0; }
    // world bounds safety
    if (this.pos.y < -3) { this.pos.y = 0.2; this.vel.y = 0; }

    // ---- distance, noise, footsteps ----
    const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
    if (moved < 1) this.dist += moved;
    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.noise = this.onGround ? (spd > 5.5 ? 20 : spd > 3 ? 12 : spd > 1 ? (this.crouch > 0.5 ? 2.5 : 6) : 0) : 4;
    if (this.onGround && spd > 0.8) {
      const stride = this.crouch > 0.5 ? 0.55 : spd > 5.5 ? 1.05 : 0.85;
      this.bob += moved / stride * Math.PI;
      if (Math.floor(this.bob / Math.PI) !== Math.floor((this.bob - moved / stride * Math.PI) / Math.PI)) this.events.push({ type: 'step', speed: spd, surface: this.surface });
    }
    this.bobAmt += ((this.onGround ? clamp(spd / 6.5, 0, 1.1) : 0) - this.bobAmt) * (1 - Math.exp(-dt * 8));
    this.camUpdate(dt, t, spd);
  }

  startVault(vt, dir) {
    const slow = false;                 // Liam: vaults are never the thing that kills you
    const tall = vt.h > 1.45;
    const dur = tall ? 0.42 : 0.27;
    this.stumble = 0;
    this.vault = { t: 0, dur, x0: this.pos.x, z0: this.pos.z, y0: this.pos.y, ex: vt.ex, ez: vt.ez, top: vt.top, land: vt.land, dx: dir.x, dz: dir.z, speed: Math.max(SPEED.run, Math.hypot(this.vel.x, this.vel.z)), slow, fence: vt.fence, side: Math.random() < 0.5 ? -1 : 1 };
    this.stamina = Math.max(0, this.stamina - (tall ? 0.03 : 0.015));
    this.vel.set(0, 0, 0);
    this.events.push({ type: 'vault', fence: vt.fence, tall, slow, box: vt.box });
    this.autoCD = 0.15;
  }

  camUpdate(dt, t, spd = 0) {
    const h = this.height;
    const target = this.pos.y + h - 0.12;
    // smooth stairs / landings, but follow vaults and falls tightly
    const k = this.vault ? 1 : 1 - Math.exp(-dt * 18);
    this.camY += (target - this.camY) * k;
    const fovT = 72 + clamp((spd - SPEED.run) / (SPEED.sprint - SPEED.run), 0, 1.2) * 13 + (this.slideT > 0 ? 6 : 0) + (this.vault ? 6 : 0);
    this.fov += (fovT - this.fov) * (1 - Math.exp(-dt * 4));
    this.roll *= Math.exp(-dt * 5);
  }

  // camera pose -> (position, quaternion) with head bob, shake, look-back
  applyCamera(cam, t, extraShake = 0) {
    const b = this.bob, a = this.bobAmt;
    const bobY = Math.abs(Math.sin(b)) * 0.07 * a - 0.035 * a;
    const bobX = Math.cos(b) * 0.045 * a;
    const sh = this.shake + extraShake;
    const sx = (Math.sin(t * 47) + Math.sin(t * 31.7)) * 0.012 * sh, sy = (Math.sin(t * 53.3) + Math.cos(t * 37.1)) * 0.012 * sh;
    const fwd = this.forward(_p), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
    cam.position.set(this.pos.x, this.camY + bobY - this.landKick - this.dip, this.pos.z).addScaledVector(right, bobX * (1 - this.back));
    // look back over the shoulder: yaw swings ~155 degrees
    const yaw = this.yaw + this.back * (this.backYaw ?? Math.PI * 0.94) + sx * 2;
    const pitch = this.pitch * (1 - this.back * 0.7) - this.back * 0.05 + sy * 2 - this.landKick * 0.6;
    const roll = this.roll + Math.cos(b) * 0.012 * a + (this.stumble > 0 ? Math.sin(t * 9) * 0.06 * this.stumble : 0);
    cam.rotation.set(pitch, yaw, roll, 'YXZ');
    cam.fov = this.fov; cam.updateProjectionMatrix();
  }
}
