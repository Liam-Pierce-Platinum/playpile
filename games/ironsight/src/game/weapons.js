// The player's weapons: ammo, fire modes (auto / semi / bolt / pump), per-gun recoil patterns with
// recovery, first-shot accuracy, hip vs ADS spread with movement / stance / air penalties, magazine
// and per-shell reloads, zeroed ballistic launch from the eye, shells, flash, tracers and noise.
import * as THREE from 'three';
import { computeStats, validateConfig, Armory } from './manifest.js';
import { zeroPitch } from './ballistics.js';

const DEG = Math.PI / 180;
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();

export class Weapons {
  constructor(game) {
    this.game = game; this.slots = []; this.cur = 0;
    this.trigger = false; this.triggerPressed = false;
    this.lastShot = -9; this.burstN = 0; this.cooldown = 0; this.time = 0; this.sprintBlock = 0;
    this.shellReload = null; this.laserOn = true; this.infinite = false;
  }
  async setLoadout(cfgs, { infinite = false } = {}) {
    this.infinite = infinite;
    this.slots = cfgs.map(c => { const cfg = validateConfig(c); const st = computeStats(cfg); return { cfg, stats: st, mag: st.mag, reserve: infinite ? Infinity : st.mag * 4, mode: 0 }; });
    this.cur = 0;
    await this.equip(0, true);
  }
  get slot() { return this.slots[this.cur]; }
  get stats() { return this.slot?.stats; }
  async equip(i, silent) {
    if (!this.slots[i]) return;
    if (this.equipping) return;
    this.equipping = true;
    this.cur = i; this.shellReload = null; this.reloading = null;
    const s = this.slot;
    this.laserOn = s.cfg.laserOn !== false;
    await this.game.vm.equip(s.cfg, { silent });
    this.game.audio.click('equip');
    this.cooldown = silent ? 0 : 0.45;
    this.equipping = false;
    this.game.hud?.weapon(this);
  }
  switchMode() {
    const s = this.slot; if (!s || s.stats.modes.length < 2) return;
    s.mode = (s.mode + 1) % s.stats.modes.length; this.game.audio.click('switch'); this.game.hud?.weapon(this);
  }
  reload() {
    const s = this.slot; if (!s || this.reloading || this.shellReload || s.mag >= s.stats.mag || s.reserve <= 0 || this.game.vm.busy) return;
    if (s.stats.perShell) { this.shellReload = { t: 0.35 }; this.game.vm.shellReload(s.stats.reload); return; }
    const empty = s.mag === 0;
    const dur = s.stats.reload + (empty ? 0.35 : 0);
    this.reloading = { t: 0, dur, empty, filled: false };
    this.game.vm.reload(dur, empty);
    this.game.audio.click('mag');
    this.game.player.events.push('reload');
  }
  update(dt, I) {
    this.time += dt; this.cooldown -= dt;
    const G = this.game, P = G.player, s = this.slot; if (!s) return;
    const st = s.stats;
    // recoil recovery: the aim drifts back once the trigger is released
    const sinceShot = this.time - this.lastShot;
    if (sinceShot > 0.09) { const k = 1 - Math.exp(-dt * (st.cls === 'sniper' ? 4 : 7)); P.recoil.p -= P.recoil.p * k; P.recoil.y -= P.recoil.y * k; }
    if (sinceShot > 0.3) this.burstN = 0;
    // reload progress
    if (this.reloading) {
      const R = this.reloading; R.t += dt;
      if (!R.filled && R.t > R.dur * 0.68) { const need = st.mag - s.mag, take = Math.min(need, s.reserve); s.mag += take; s.reserve -= take; R.filled = true; G.audio.click('magin'); G.hud?.weapon(this); }
      if (R.empty && R.t > R.dur * 0.88 && !R.bolt) { R.bolt = true; G.audio.click('bolt'); }
      if (R.t >= R.dur) this.reloading = null;
    }
    if (this.shellReload) {
      this.shellReload.t -= dt;
      if (I.firePressed && s.mag > 0) { this.shellReload = null; G.vm.anim = null; }
      else if (this.shellReload.t <= 0) {
        if (s.mag < st.mag && s.reserve > 0) { s.mag++; s.reserve--; G.audio.click('shell'); G.hud?.weapon(this); this.shellReload.t = st.reload; G.vm.shellReload(st.reload); }
        if (s.mag >= st.mag || s.reserve <= 0) { this.shellReload = null; G.audio.click('pump'); }
      }
    }
    // firing
    if (P.sprint || P.mantle) this.sprintBlock = 0.12; else this.sprintBlock -= dt;
    const mode = st.modes[s.mode] || 'semi';
    const want = mode === 'auto' ? I.fire : I.firePressed;
    if (want && !this.equipping) {
      if (this.cooldown > 0 || this.reloading || this.shellReload || G.vm.busy || P.mantle || P.dead) { /* blocked */ }
      else if (this.sprintBlock > 0) { /* sprint-to-fire delay */ }
      else if (s.mag <= 0) { if (I.firePressed) { G.audio.click('empty'); } if (s.reserve > 0) this.reload(); }
      else this.fire();
    }
    if (I.reloadPressed) this.reload();
  }
  fire() {
    const G = this.game, P = G.player, s = this.slot, st = s.stats, vm = G.vm;
    const interval = 60 / st.rpm;
    this.cooldown = interval;
    s.mag--;
    const first = this.time - this.lastShot > 0.32;
    this.lastShot = this.time; this.burstN = first ? 0 : this.burstN + 1;
    // spread (degrees)
    const ads = vm.adsW || 0;
    let spread = THREE.MathUtils.lerp(st.hip, st.ads, ads);
    spread += st.moveSpread * Math.min(1.3, P.speed / 6.5) * (1 - 0.6 * ads);
    if (!P.grounded) spread += st.hip * 2;
    spread *= P.stance === 'prone' ? 0.55 : P.stance === 'crouch' ? 0.8 : 1;
    if (first) spread *= ads > 0.9 ? 0.15 : 0.6;                                     // first-shot accuracy
    else spread += Math.min(this.burstN, 10) * (ads > 0.5 ? 0.04 : 0.12) * Math.max(0.5, st.recoilV);   // bloom
    // launch from the eye along the aim, pitched up for the zero
    const origin = _v.copy(G.camera.position);
    const aim = P.aimDir(_v2);
    const right = _v3.set(-aim.z, 0, aim.x).normalize();
    const zp = zeroPitch(st.velocity, st.zero);
    const pellets = st.pellets;
    for (let i = 0; i < pellets; i++) {
      const d = aim.clone();
      const up = new THREE.Vector3().crossVectors(right, d).normalize();
      d.applyAxisAngle(right, zp);
      const sp = (pellets > 1 ? Math.max(spread, 0.4) * 0.3 + st.pelletSpread : spread) * DEG * 0.5;
      const r = Math.sqrt(Math.random()) * sp, a = Math.random() * Math.PI * 2;
      d.addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      G.fireBullet({ pos: origin.clone(), dir: d, velocity: st.velocity, damage: st.damage, team: P.team, owner: P, weapon: st.name, cls: st.cls, pen: st.pen * (pellets > 1 ? 0.3 : 1), power: pellets > 1 ? 0.4 : 1, pellet: pellets > 1 });
      // tracer from the muzzle converging on the bullet path
      if (i === 0 || i % 3 === 0) {
        const mz = vm.toWorld(vm.weapon.muzzle, G.camera, new THREE.Vector3());
        const conv = origin.clone().addScaledVector(d, 60);
        const td = conv.sub(mz).normalize();
        const bright = st.cls === 'ar' && s.mag % 4 === 0;
        G.fx.tracer(mz, td, st.velocity, { alpha: bright ? 0.7 : 0.18, w: bright ? 0.007 : 0.004 });
      }
    }
    // recoil (pattern + random horizontal), reduced by stance and aiming
    const pat = st.pattern[this.burstN % st.pattern.length] || [0, 1];
    const k = (P.stance === 'prone' ? 0.6 : P.stance === 'crouch' ? 0.85 : 1) * (1 - 0.15 * ads);
    P.recoil.p += st.recoilV * pat[1] * k * DEG * (first ? 0.8 : 1);
    P.recoil.y += st.recoilH * (pat[0] + (Math.random() - 0.5) * 0.7) * k * DEG;
    P.shake.p += st.recoilV * 0.4 * DEG; P.shake.r += (Math.random() - 0.5) * st.recoilV * 0.5 * DEG;
    vm.fire(st);
    // muzzle flash light in the world, smoke, shell
    const mzW = vm.toWorld(vm.weapon.muzzle, G.camera, new THREE.Vector3());
    if (st.flash > 0.1) { G.fx.flashLights[0].position.copy(mzW); G.fx.flashLights[0].intensity = 7 * Math.min(1.5, st.flash); G.fx.flashes.push({ s: { visible: false }, l: G.fx.flashLights[0], t: 0.04 }); }
    G.fx.muzzleSmoke(mzW, aim, st.suppressed ? 1.6 : 1);
    if (st.cls !== 'shotgun' && st.cls !== 'sniper') this.ejectShell();
    G.audio.gunshot(G.camera.position, st.cls, { suppressed: st.suppressed, own: true, loud: st.loud });
    G.onPlayerShot(st);
    G.hud?.weapon(this);
    if (s.mag === 0 && s.reserve > 0 && st.cls !== 'shotgun') setTimeout(() => this.reload(), 250);
    if (st.cls === 'sniper' || st.cls === 'shotgun') setTimeout(() => { G.audio.click(st.cls === 'sniper' ? 'bolt' : 'pump'); if (this.slot === s) this.ejectShell(); }, interval * 400);
  }
  ejectShell() {
    const G = this.game, vm = G.vm, cam = G.camera;
    if (!vm.weapon?.eject) return;
    const p = vm.toWorld(vm.weapon.eject, cam, new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion), up = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion), back = new THREE.Vector3(0, 0, 1).applyQuaternion(cam.quaternion);
    const v = right.multiplyScalar(2.2 + Math.random() * 0.8).add(up.multiplyScalar(1.6 + Math.random() * 0.8)).add(back.multiplyScalar(0.6)).add(G.player.vel);
    G.fx.ejectShell(p, v);
  }
}
