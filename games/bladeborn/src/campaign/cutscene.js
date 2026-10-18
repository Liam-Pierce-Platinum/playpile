// CUTSCENES: in-engine camera shots and paths, letterbox bars, subtitles, simple character blocking, skippable.
//
//   await L.cutscene({
//     shots: [
//       { from: [x, y, z], to: [x, y, z], look: [x, y, z], lookTo: [x, y, z], fov: 40, fovTo: 34, dur: 4 },
//       { path: [[x, y, z], [x, y, z], [x, y, z]], look: actor | [x, y, z], dur: 6, ease: 'linear' },
//     ],
//     lines: [[0.5, 'ROURKE', 'You were never supposed to wake up.', 3]],   // [t, who, text, seconds]
//     beats: [[1.0, () => guard.walkTo(4, 2)], [3, () => L.alarm()]],         // [t, fn]
//     end: () => { ... },     // ALWAYS runs once (also when skipped): put the final state of the scene here
//     world: false,           // true = enemies keep running their AI during the scene
//     skippable: true, letterbox: true,
//   });
//
// look / follow can be an Actor (or the hero, or an enemy): the camera tracks its head. Skipping (Space, Enter, Esc)
// runs the remaining beats in order, snaps every walking actor to its destination, shows nothing more, calls end().
import * as THREE from 'three';
import { buildRig, animate } from '../rig.js';
import { makeWeapon } from '../weapons.js';
import { seatWeapon } from '../pose.js';
import { sample } from '../clips.js';
import { groundBelow } from '../world.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const $ = id => document.getElementById(id);
const v3 = a => a == null ? null : a.isVector3 ? a.clone() : Array.isArray(a) ? V(a[0], a[1], a[2]) : a.head ? a.head() : a.center ? a.center.clone().setY(a.pos.y + 1.6) : null;
const EASE = { linear: t => t, inout: t => t * t * (3 - 2 * t), out: t => 1 - Math.pow(1 - t, 3), in: t => t * t * t };

// --- subtitles ---
let subQ = [], subCur = null;
export function say(G, who, text, dur) {
  dur = dur || Math.min(7, 1.3 + text.split(/\s+/).length * 0.33);
  return new Promise(r => { subQ.push({ who, text, dur, r }); });
}
export function clearSubs() { for (const s of [subCur, ...subQ]) s?.r(); subQ = []; subCur = null; const el = $('subs'); if (el) el.style.opacity = 0; }
export function updateSubs(G, dt) {
  const el = $('subs'); if (!el) return;
  if (!subCur && subQ.length) {
    subCur = subQ.shift(); subCur.t = subCur.dur;
    el.innerHTML = (subCur.who ? `<b>${subCur.who}</b>` : '') + `<span>${subCur.text}</span>`;
    el.style.opacity = G.settings?.subtitles === false ? 0 : 1;
  }
  if (subCur) { subCur.t -= dt; if (subCur.t <= 0) { const r = subCur.r; subCur = null; if (!subQ.length) el.style.opacity = 0; r(); } }
}

// --- actors: a scripted mannequin (or the hero) you can place, walk, turn and pose ---
// o: { pos: [x, y, z], yaw, hero: true (drive the hero instead of a new body), build: { bulk, height },
//      shade: 0..1 (body grey), weapon: 'katana'|'pistol'|..., offhand, pose }
// poses: idle, handsUp, point, armsCrossed, kneel, sit, lie (on his back), guard, slump, or a custom
//        { armL, armR, crouch, legs, torsoX, headX } object (rig pose fields)
const POSES = {
  idle: {},
  handsUp: { armL: { dir: V(0.6, 1, 0.1), bend: 1.4, k: 10 }, armR: { dir: V(-0.6, 1, 0.1), bend: 1.4, k: 10 } },
  point: { armR: { dir: V(-0.1, 0.3, 1), bend: 0.05, k: 10 } },
  armsCrossed: { armL: { dir: V(-0.25, -0.3, 0.9), bend: 1.95, k: 10 }, armR: { dir: V(0.25, -0.2, 0.9), bend: 1.95, k: 10 } },
  kneel: { crouch: 0.9, torsoX: 0.2, legs: { tl: -1.5, tr: -1.5, kl: 2.3, kr: 2.3 } },
  sit: { crouch: 0.5, torsoX: -0.3, legs: { tl: -1.55, tr: -1.55, kl: 1.55, kr: 1.55 } },
  lie: { lie: true, legs: { tl: 0, tr: 0, kl: 0.05, kr: 0.05 }, armL: { dir: V(0.2, -1, 0), bend: 0.1, k: 10 }, armR: { dir: V(-0.2, -1, 0), bend: 0.1, k: 10 } },
  guard: { armL: { dir: V(0.22, -0.4, 0.95), bend: 1.75, k: 12 }, armR: { dir: V(-0.22, -0.4, 0.95), bend: 1.75, k: 12 }, stance: 1 },
  slump: { crouch: 0.95, torsoX: 0.6, headX: 0.6, legs: { tl: -1.45, tr: -1.2, kl: 0.35, kr: 0.9 }, armL: { dir: V(0.35, -1, 0.1), bend: 0.25, k: 6 }, armR: { dir: V(-0.35, -1, 0.1), bend: 0.25, k: 6 } },
};
export class Actor {
  constructor(G, o = {}) {
    this.G = G; this.o = o; this.time = Math.random() * 9; this.path = null; this.poseName = o.pose || 'idle'; this._cp = {};
    if (o.hero) { this.hero = G.hero; this.rig = G.hero.rig; }
    else {
      const s = o.shade ?? 0.45, c = new THREE.Color().setRGB(s, s, s).getHex();
      this.rig = buildRig({ skin: c, shirt: c, pants: c, boots: 0x2a2a2a, dark: 0x1e1e1e });
      G.scene.add(this.rig.root);
      if (o.weapon) { this.wmesh = makeWeapon(o.weapon); seatWeapon(this.wmesh, this.rig.handAnchor('R'), true, 'R'); }
      if (o.offhand) { this.omesh = makeWeapon(o.offhand); seatWeapon(this.omesh, this.rig.handAnchor('L'), true, 'L'); }
    }
    this.pos = this.rig.root.position;
    if (o.pos) this.place(o.pos[0], o.pos[1], o.pos[2], o.yaw);
    this.yaw = o.yaw ?? (this.hero ? this.hero.yaw : 0);
  }
  head() { return V(this.pos.x, this.pos.y + (this.poseName === 'lie' ? 0.35 : this.poseName === 'kneel' || this.poseName === 'sit' ? 1.15 : 1.6), this.pos.z); }
  place(x, y, z, yaw) { this.pos.set(x, y ?? groundBelow(x, z, 30), z); if (yaw !== undefined) this.yaw = yaw; this.path = null; return this; }
  face(t) { this.yaw = typeof t === 'number' ? t : Math.atan2(t[0] - this.pos.x, t[1] - this.pos.z); return this; }
  pose(name) { this.poseName = name; return this; }
  // walk (speed 1.6) or run (o.run / speed 5) to x,z through optional waypoints; resolves on arrival
  walkTo(x, z, o = {}) {
    const pts = [...(o.via || []), [x, z]].map(p => V(p[0], 0, p[1]));
    return new Promise(r => { this.path?.r(); this.path = { pts, speed: o.speed || (o.run ? 5 : 1.6), r }; });
  }
  finish() { if (!this.path) return; const p = this.path.pts[this.path.pts.length - 1]; const r = this.path.r; this.place(p.x, undefined, p.z); r(); }
  update(dt) {
    this.time += dt; let speed = 0;
    if (this.path) {
      const p = this.path.pts[0], d = V(p.x - this.pos.x, 0, p.z - this.pos.z), L = d.length(), step = this.path.speed * dt;
      if (L <= step + 0.02) { this.pos.x = p.x; this.pos.z = p.z; this.path.pts.shift(); if (!this.path.pts.length) { const r = this.path.r; this.path = null; r(); } }
      else { d.divideScalar(L); this.pos.addScaledVector(d, step); speed = this.path.speed; let a = Math.atan2(d.x, d.z) - this.yaw; a = Math.atan2(Math.sin(a), Math.cos(a)); this.yaw += a * Math.min(1, dt * 8); }
      this.pos.y = groundBelow(this.pos.x, this.pos.z, this.pos.y + 0.5);
    }
    const P = typeof this.poseName === 'object' ? this.poseName : POSES[this.poseName] || {};
    let clip = null;
    if (speed > 0.5) { const run = speed > 3.2; this.locoT = (this.locoT || 0) + dt * speed / (run ? 5.7 : 1.6); const p = sample(run ? 'sprint' : 'walking_3', this.locoT, true, this._cp); if (p) clip = { pose: p, w: 1, mask: P.armL || P.armR ? ['pelvis', 'torso', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] : undefined }; }
    this.rig.root.rotation.set(P.lie ? -Math.PI / 2 : 0, this.yaw, 0, 'YXZ');
    if (this.hero) this.hero.yaw = this.yaw;
    animate(this.rig, { speed, grounded: true, vy: 0, t: this.time, dt, squash: 0, clip, ...P, legs: speed > 0.5 ? undefined : P.legs });
    if (P.lie) this.rig.j.pelvis.position.y = 0.15;
    if (!this.hero) this.rig.skin?.update(dt); // the hero's skin is updated by the main loop
  }
  remove() { if (this.hero) { this.rig.root.rotation.set(0, this.yaw, 0); return; } this.G.scene.remove(this.rig.root); this.rig.skin?.dispose(); }
}

// --- the cutscene runner (G.cut while playing) ---
export class Cutscene {
  constructor(G, L, def) {
    this.G = G; this.L = L; this.def = def; this.t = 0; this.bi = 0; this.li = 0;
    this.shots = def.shots || []; this.dur = def.dur || this.shots.reduce((a, s) => a + (s.dur || 3), 0);
    this.beats = [...(def.beats || [])].sort((a, b) => a[0] - b[0]); this.lines = [...(def.lines || [])].sort((a, b) => a[0] - b[0]);
    this.world = !!def.world; this.skippable = def.skippable !== false;
  }
  play() {
    const G = this.G; G.cut?.stop(true);
    return new Promise(r => {
      this.res = r; G.cut = this;
      document.body.classList.add('cine'); if (this.def.letterbox !== false) document.body.classList.add('letterbox');
      $('skip')?.classList.toggle('hidden', !this.skippable);
      G.hero.atk = null; G.hero.vel.set(0, 0, 0);
      this.update(0);
    });
  }
  // camera for the shot at time t
  camAt(t) {
    let a = 0, s = this.shots[this.shots.length - 1], k = 1;
    for (const sh of this.shots) { const d = sh.dur || 3; if (t < a + d) { s = sh; k = (t - a) / d; break; } a += d; }
    if (!s) return null;
    const e = (EASE[s.ease || 'inout'] || EASE.inout)(Math.max(0, Math.min(1, k)));
    let pos;
    if (s.path) { s._c = s._c || new THREE.CatmullRomCurve3(s.path.map(v3)); pos = s._c.getPoint(e); }
    else { const f = v3(s.from), to = v3(s.to); pos = to ? f.lerp(to, e) : f; }
    if (s.follow) { const h = v3(s.follow); pos.add(h); }
    let look = v3(s.look) || pos.clone().add(V(0, 0, 1)); const lt = v3(s.lookTo); if (lt) look.lerp(lt, e);
    const fov = s.fovTo ? (s.fov || 40) + (s.fovTo - (s.fov || 40)) * e : s.fov || 40;
    if (s.shake) { const q = this.t * 17; pos.x += Math.sin(q) * s.shake * 0.03; pos.y += Math.sin(q * 1.3 + 1) * s.shake * 0.03; }
    return { pos, look, fov };
  }
  update(dt) {
    const G = this.G; if (this.done) return;
    this.t += dt;
    while (this.bi < this.beats.length && this.t >= this.beats[this.bi][0]) { this.run(this.beats[this.bi][1]); this.bi++; }
    while (this.li < this.lines.length && this.t >= this.lines[this.li][0]) { const [, who, text, d] = this.lines[this.li]; say(G, who, text, d); this.li++; }
    if (this.shots.length) G.camOverride = this.camAt(this.t);
    if (this.t >= this.dur) this.stop(false);
  }
  run(fn) { try { fn(this.L); } catch (err) { console.warn('[cutscene] beat: ' + err.message); } }
  skip() { if (this.skippable && this.t > 0.3) this.stop(true); }
  stop(skipped) {
    if (this.done) return; this.done = true; const G = this.G;
    if (skipped) { while (this.bi < this.beats.length) { this.run(this.beats[this.bi][1]); this.bi++; } for (const a of this.L.actors) a.finish(); clearSubs(); }
    if (this.def.end) this.run(this.def.end);
    G.cut = null; G.camOverride = null;
    document.body.classList.remove('cine', 'letterbox'); $('skip')?.classList.add('hidden');
    this.res?.(skipped);
  }
}
