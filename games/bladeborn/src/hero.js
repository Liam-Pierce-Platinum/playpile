// The hero: cube rig, movement, claws, slashes, wall climbing.
import * as THREE from 'three';
import { buildRig, animate } from './rig.js';
import { collideCylinder, nearestWall, pointInBox, groundBelow, hitNormal, rayBox, boxes } from './world.js';
import { Trail } from './fx.js';
import { Ragdoll } from './ragdoll.js';
import { Script, canFinish, pickFinisher, takedownFor } from './finisher.js';
import { aimArmAt } from './rig.js';
import { handQuat, setHandWorld } from './pose.js';
const IDQ = new THREE.Quaternion(), EDGE_PT = 0.28, WALL_HUG = 0.15, KNUCKLE_GAP = 0.05, CLAW_ROOT = 0.08; // knuckles off the wall face; claw roots ahead of the wrist joint
import { crossTarget, aimZone } from './aim.js';
import { clawBlade, clawHousing } from './weapons.js';
import { sample, clipDur, loco } from './clips.js';
import { sfx } from './audio.js';

const R = 0.36, H = 1.85, CHORD = 0.12, SHEATHE_HOLD = 0.6, DOUBLE = 0.25, FIN_COOLDOWN = 2, PARRY = 0.15;
const CLIMB_STEP = 0.5, SLAM_MIN = 3.5; // a ground slam needs a real drop under you // one full climb motion: rip out, reach, drive in, heave
const rnd = (a, b) => a + Math.random() * (b - a);
const RUN = 6.2, SPRINT = 9.6, JUMP = 9.4, GRAV_UP = 26, GRAV_DOWN = 36;
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const lerpV = (a, b, t) => a.clone().lerp(b, t);
const ease = t => 1 - Math.pow(1 - t, 3);

// Slash pose keyframes per hand (sgn=+1 left, -1 right), in torso space; [windupDir, endDir, windupBend, endBend]
const SWINGS = [
  s => [V(s * 0.95, 0.3, -0.35), V(-s * 0.55, -0.05, 0.95), 1.3, 0.12],   // flat sweep
  s => [V(s * 0.6, 1.0, -0.15), V(-s * 0.45, -0.7, 0.75), 1.1, 0.1],     // high diagonal
  s => [V(s * 0.85, -0.5, -0.2), V(-s * 0.35, 0.55, 0.9), 1.2, 0.15],    // rising backhand
];

// Aimed strike paths. Offsets are from the aimed point in the hero frame: x = his left, y = up, z = forward.
// The hand travels start -> through the point -> end; sgn mirrors for the right hand. c = crouch, tw = torso twist.
const STYLES = {
  hslash: { s: [0.7, 0.15, -0.2], e: [-0.6, -0.05, 0.25], c: 0.1, tw: 0.6 },
  diag: { s: [0.5, 0.6, -0.1], e: [-0.45, -0.55, 0.2], c: 0.15, tw: 0.5 },
  rise: { s: [0.45, -0.6, -0.1], e: [-0.4, 0.6, 0.2], c: 0.25, tw: 0.5 },
  stab: { s: [0.1, 0.05, -0.75], e: [0, 0.05, 0.35], c: 0.15, tw: 0.2 },
  chop: { s: [0.1, 0.8, -0.3], e: [0, -0.6, 0.15], c: 0, tw: 0.2 },
  neck: { s: [0.75, 0, 0], e: [-0.7, 0.02, 0.1], c: 0.05, tw: 0.7 },
  under: { s: [0.1, -0.6, -0.35], e: [0, 0.35, 0.25], c: 0.35, tw: 0.3 },
  sweep: { s: [0.8, 0.05, -0.1], e: [-0.7, 0, 0.3], c: 0.85, tw: 0.6 },
  ham: { s: [0.4, 0.1, 0.4], e: [-0.1, -0.05, -0.3], c: 0.7, tw: 0.4 },
  gut: { s: [0.15, -0.1, -0.7], e: [0.3, 0.15, 0.2], c: 0.3, tw: 0.3 },
};
const ZONE_STYLES = {
  head: ['chop', 'diag', 'stab'], neck: ['neck', 'hslash'], chest: ['diag', 'stab', 'hslash'], gut: ['gut', 'rise', 'hslash'],
  armpitL: ['under'], armpitR: ['under'], uarmL: ['diag', 'rise'], uarmR: ['diag', 'rise'], larmL: ['hslash', 'rise'], larmR: ['hslash', 'rise'],
  thighL: ['sweep', 'rise', 'diag'], thighR: ['sweep', 'rise', 'diag'], shinL: ['sweep', 'ham'], shinR: ['sweep', 'ham'],
};
const ZONE_DMG = { head: 999, neck: 999, chest: 15, gut: 17, armpitL: 18, armpitR: 18, uarmL: 10, uarmR: 10, larmL: 9, larmR: 9, thighL: 11, thighR: 11, shinL: 10, shinR: 10 };

export class Hero {
  constructor(G) {
    this.G = G;
    // the cube man: pale head and hands, mid-grey shirt, dark trousers and boots
    this.rig = buildRig({ skin: 0xc8c8c8, shirt: 0xa6a6a6, pants: 0x606060, boots: 0x3a3a3a, dark: 0x2a2a2a });
    G.scene.add(this.rig.root);
    this.pos = this.rig.root.position; this.pos.set(0, 0, 6);
    this.vel = V(0, 0, 0); this.yaw = Math.PI; this.hp = 100; this.dead = false;
    this.grounded = true; this.coyote = 0; this.jumpBuf = 0; this.land = 0; this.time = 0;
    this.clawsOut = false; this.ext = 0; this.flex = 0;
    this.press = { L: -9, R: -9 }; this.held = { L: false, R: false }; this.holdArmed = false; this.sheatheT = 0;
    this.blocking = false; this.blockT = 0; this.fin = null; this.lock = null; this.dashT = 0;
    this.grip = { L: null, R: null }; this.step = null; this.stepQueue = null; this.gHist = []; this.wallIdle = { shift: 2, feet: 3, look: 0, nudge: null };
    this.atk = null; this.comboStep = 0; this.comboWin = 0; this.queued = null;
    this.climbing = false; this.wall = null; this.lastHand = null; this.mantle = null; this.regrab = 0;
    this.slideFx = 0; this.diving = false; this.iframes = 0; this.wallJumpT = 0;
    // claws: 3 per hand, sliding out of the knuckles along the forearm axis
    const steel = new THREE.MeshStandardMaterial({ color: 0xdedede, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
    this.claws = { L: [], R: [] }; this.trails = {};
    for (const h of ['L', 'R']) {
      const hand = this.rig.j['hand' + h];
      for (let i = 0; i < 3; i++) {
        const g = new THREE.Group(); g.position.set((i - 1) * 0.022, -0.02, 0.012); g.rotation.z = (i - 1) * 0.03; // from between the knuckles, slightly fanned
        g.add(clawBlade());
        g.scale.set(1, 0.001, 1); g.visible = false; hand.add(g); this.claws[h].push(g);
      }
      this.trails[h] = new Trail(G.scene, 12);
    }
    this.CLAW_LEN = 0.3; // about a forearm of blade
    // claws ride the cube hands (a fist anchor on each hand joint)
    {
      // canonical claw frame (+Z = back of the hand, X across the knuckles) turned onto each hand: the hand joint's
      // +Z is the thumb side and the back of the hand is +X on the left hand, -X on the right
      for (const hnd of ['L', 'R']) { const a0 = this.rig.handAnchor(hnd), a = a0 && new THREE.Group(); if (a) { a.rotation.y = hnd === 'L' ? Math.PI / 2 : -Math.PI / 2; a0.add(a); for (const g of this.claws[hnd]) a.add(g); const hs = clawHousing(); hs.position.z = 0.035; a.add(hs); } this.clawAnchor = this.clawAnchor || {}; this.clawAnchor[hnd] = a; }
    }
    this.tipPrev = { L: null, R: null }; this.tipVel = { L: V(0, 0, 0), R: V(0, 0, 0) }; this.gougeAcc = { L: 0, R: 0 };
  }

  get center() { return V(this.pos.x, this.pos.y + 1.1, this.pos.z); }
  forward() { return V(Math.sin(this.yaw), 0, Math.cos(this.yaw)); }
  clawTip(h, k = 1) { const g = this.claws[h][1]; return g.localToWorld(V(0, -1.05 * k, 0)); }

  // --- input ---
  // Claws in: press both together to unsheathe. Claws out: every press is an attack; HOLD both for
  // SHEATHE_HOLD to slide them back in. Same button twice fast on an open enemy = finisher.
  mouseDown(btn) { // btn 'L' | 'R'
    if (this.dead) return;
    const now = this.time, other = btn === 'L' ? 'R' : 'L';
    // a double-click is the SAME button twice in a row (L-R-L is a combo, not a double)
    const same = this.lastBtn === btn && now - this.press[btn] < DOUBLE;
    const dbl = btn === 'L' && same && this.G.finMeter >= 1; // LMB double-click with a FULL meter
    this.lastBtn = btn;
    this.press[btn] = now; this.held[btn] = true;
    if (!this.clawsOut) { if (now - this.press[other] < CHORD) { this.press.L = this.press.R = -9; this.unsheathe(); } return; }
    if (this.G.traverseClick?.(this, btn)) return; // campaign: vents, ladders, branch grabs
    if (this.fin || this.blocking || this.mantle) return;
    if (this.climbing) return this.climbClick(btn);
    if (!this.grounded) {
      // mid-air: the same button twice = ground slam (grab already happened -> we'd be climbing instead)
      if (same && !this.diving && this.heightAboveGround() >= SLAM_MIN) { this.press[btn] = -9; return this.slam(); } // too low: just another aerial slash
      // one click dropping onto an enemy below = aerial takedown (silent pounce if he is unaware)
      if (this.airTakedown()) return;
      // one click: a wall in reach (forgiving cone toward the camera or the drift) -> lunge and stab in
      if (this.regrab <= 0) { const w = this.reachWall(); if (w) return this.grab(btn, w); }
    }
    if (dbl && this.tryFinisher(btn)) { this.press.L = -9; return; }
    // LMB double-click without a full finisher bar = a quick block; the parry window opens on the second click
    if (btn === 'L' && same && this.grounded && this.G.finMeter < 1) { this.press.L = -9; this.atk = null; this.queued = null; this.blocking = true; this.blockT = 0; this.quickBlock = 0.45; return; }
    this.attack(btn);
  }
  // a wall grab only from a real jump or fall (never off an attack's hop), not right after landing,
  // and only moving or facing toward the wall
  reachWall() {
    if (this.grounded || this.airKind === 'attack' || this.time - (this.landT || -9) < 0.25) return null;
    const w = nearestWall(this.pos, R, H, 1.2); if (!w) return null;
    const into = w.normal.clone().negate(), mv = V(this.vel.x, 0, this.vel.z);
    const facing = into.dot(this.forward()) > 0.3, moving = mv.lengthSq() > 1 && into.dot(mv.normalize()) > 0.25;
    return facing || moving ? w : null;
  }
  airTakedown() {
    const G = this.G; let best = null, bs = 1e9; const camF = V(Math.sin(G.input.yaw), 0, Math.cos(G.input.yaw));
    for (const e of G.enemies) {
      if (!e.alive || e.held || e.spawnT > 0) continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z, flat = Math.hypot(dx, dz), dy = this.pos.y - e.pos.y;
      if (dy < 1.2 || dy > 12 || flat > 4.5) continue;
      const toward = flat < 1.2 || (dx * camF.x + dz * camF.z) / flat > 0.3 || (dx * this.vel.x + dz * this.vel.z) > 0;
      if (!toward) continue; const sc = flat + dy * 0.2; if (sc < bs) { bs = sc; best = e; }
    }
    if (!best) return false;
    this.atk = null; this.diving = false; this.lock = best;
    this.fin = new Script(G, this, best, best.mode !== undefined && best.mode !== 'alert' ? 'pounce' : 'airdrop'); return true;
  }
  slam() { // ground slam dive (fall-through protection lives in the collision sweep)
    const G = this.G, f = V(Math.sin(G.input.yaw), 0, Math.cos(G.input.yaw));
    this.atk = { hand: 'L', kind: 'dive', t: 0, dur: 9, hitAt: 9, cancel: 9, done: false };
    this.vel.set(f.x * 7, -30, f.z * 7); this.diving = true; this.cutSet = null; this.slamH = this.heightAboveGround(); sfx.whoosh();
  }
  mouseUp(btn) { this.held[btn] = false; if (!this.held.L && !this.held.R) this.holdArmed = true; }
  // stealth takedown (E): the unaware enemy nearest the crosshair that can be taken from here
  takedownTarget(fromWall = false) {
    const G = this.G; if (!G.camera || this.fin || this.dead || !this.clawsOut) return null;
    let best = null, bs = fromWall ? 1.4 : 0.9; const p = V(0, 0, 0);
    for (const e of G.enemies) {
      const k = takedownFor(this, e); if (!k) continue;
      let sd;
      if (this.climbing) sd = e.pos.distanceTo(this.pos) / 10; // on a wall he is below you, often off-screen: nearest wins
      else { p.copy(e.center).project(G.camera); if (p.z > 1) continue; sd = Math.hypot(p.x * G.camera.aspect, p.y); }
      if (sd < bs) { bs = sd; best = { e, k }; }
    }
    return best;
  }
  takedown(fromWall = false) {
    const t = this.takedownTarget(fromWall); if (!t) return false;
    this.wallSave = this.climbing ? { wall: this.wall, L: this.grip.L.clone(), R: this.grip.R.clone() } : null;
    if (this.climbing) { this.climbing = false; this.wall = null; this.step = null; this.grip.L = this.grip.R = null; }
    this.atk = null; this.mantle = null; this.lock = t.e;
    this.fin = new Script(this.G, this, t.e, t.k); return true;
  }
  jumpPressed() { this.jumpBuf = 0.15; }
  blockDown() { this.mmbHeld = true;
    if (this.climbing && !this.fin) { this.takedown(true); return; } // on a wall the middle button is the stealth kill
    if (this.dead || this.climbing || this.fin || this.mantle || this.guardBroken > 0) return; this.blocking = true; this.blockT = 0; this.atk = null; this.queued = null; }
  blockUp() { this.mmbHeld = false; if (!(this.quickBlock > 0)) this.blocking = false; }

  unsheathe() {
    this.clawsOut = true; this.flex = 1; this.holdArmed = false; this.sheatheT = 0;
    sfx.snik(true); this.G.camPunch = 1; this.G.shake(0.12); this.G.punch?.(0.3);
    this.rig.root.updateMatrixWorld(true);
    for (const h of ['L', 'R']) this.G.fx.sparksAt(this.clawTip(h, 0.1), V(0, 1, 0), 4);
  }
  sheathe() {
    this.clawsOut = false; this.sheatheT = 0; this.flex = 0.6; this.holdArmed = false;
    sfx.snik(false); this.G.shake(0.06);
    if (this.climbing) this.leaveWall();
  }
  toggleClaws() { if (this.clawsOut) this.sheathe(); else this.unsheathe(); } // tests

  // only the crosshair target, only if he is finisher-ready, never on a wall, 2 s cooldown
  tryFinisher(btn) {
    const G = this.G;
    if (this.climbing || this.time < (this.finReadyAt || 0) || G.finMeter < 1) return false;
    const best = crossTarget(G, this, 3.4);
    if (!best || !canFinish(this, best)) return false;
    G.finMeter = 0;
    this.finReadyAt = this.time + 999; // set properly when it ends
    this.atk = null; this.queued = null; this.comboStep = 0;
    this.lock = best; this.fin = new Script(G, this, best, pickFinisher(this, best, btn));
    return true;
  }

  heightAboveGround() { return this.pos.y - groundBelow(this.pos.x, this.pos.z, this.pos.y); }

  // --- combat ---
  attack(hand) {
    if (this.atk && this.atk.t < this.atk.cancel) { this.queued = hand; return; }
    const G = this.G, air = !this.grounded;
    let kind = 'slash';
    if (air) kind = 'air';
    else if (this.comboStep >= 3) kind = 'uppercut';
    const variant = kind === 'slash' ? this.comboStep % 3 : 0;
    this.atk = { hand, kind, t: 0, dur: kind === 'uppercut' ? 0.42 : kind === 'dive' ? 9 : 0.27, hitAt: kind === 'uppercut' ? 0.14 : 0.09, cancel: kind === 'uppercut' ? 0.3 : 0.15, done: false, variant };
    this.comboStep = kind === 'uppercut' ? 0 : this.comboStep + 1; this.comboWin = 0.75;
    // ONE target: the enemy nearest the crosshair, within reach
    const best = crossTarget(G, this);
    if (best) this.lock = best;
    this.atk.yaw = G.input.yaw; this.atk.target = best;
    if (best) {
      const d = V(best.pos.x - this.pos.x, 0, best.pos.z - this.pos.z), dist = d.length();
      this.atk.yaw = Math.atan2(d.x, d.z);
      // lunge in close enough that the claws actually pass through him
      if (dist > 1.15 && kind !== 'dive') { d.normalize(); const l = Math.min(13, (dist - 1.0) * 7.5); this.vel.x = d.x * l; this.vel.z = d.z * l; this.dashT = 0.2; }
      // aimed: the strike goes to the body zone under the crosshair
      if (kind === 'slash' || kind === 'air') {
        const z = aimZone(G, best);
        // third hit on the ground into the body: impale instead of a slash
        if (kind === 'slash' && variant === 2 && this.grounded && dist < 2.4 && best.spawnT <= 0 && best.hp < best.maxHp * 0.6 && (z.zone === 'chest' || z.zone === 'gut')) {
          this.atk = null; this.fin = new Script(G, this, best, 'stab'); sfx.swoosh(1.2); return;
        }
        const list = ZONE_STYLES[z.zone] || ZONE_STYLES.chest;
        Object.assign(this.atk, { kind: 'aimed', air: kind === 'air', zone: z.zone, mesh: z.mesh, local: z.local, style: STYLES[list[(this.comboStep + (hand === 'R' ? 1 : 0)) % list.length]], dur: 0.29, hitAt: 9, cancel: 0.17 });
      }
    }
    if (kind === 'uppercut') { this.vel.y = 5.5; this.grounded = false; this.airKind = 'attack'; }
    if (kind === 'air') this.vel.y = Math.max(this.vel.y, 2.2); // brief hang so air strings work
    if (kind === 'dive') { const f = V(Math.sin(G.input.yaw), 0, Math.cos(G.input.yaw)); this.vel.set(f.x * 7, -30, f.z * 7); this.diving = true; this.cutSet = null; sfx.whoosh(); }
    else sfx.swoosh(kind === 'uppercut' ? 1.4 : 1);
  }

  // hits ONE enemy: the attack's target (dive: the one nearest the landing). No cleave.
  doHits(radius, cone, dmg, kind) {
    const G = this.G, f = V(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let hits = 0, one = this.atk && this.atk.target;
    if (kind === 'dive') { let bd = radius; one = null; for (const e of G.enemies) { const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z); if (d < bd && !e.held) { bd = d; one = e; } } }
    for (const e of one && G.enemies.includes(one) ? [one] : []) {
      const d = V(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z), dist = d.length(); d.normalize();
      if (dist > radius || (cone > -1 && d.dot(f) < cone) || Math.abs(e.pos.y - this.pos.y) > 1.8) continue;
      const hp = e.center.clone().addScaledVector(d, -0.25).add(V(rnd(-0.15, 0.15), rnd(-0.25, 0.22), rnd(-0.15, 0.15)));
      const dir = kind === 'dive' ? d : d.clone().lerp(f, 0.5).normalize();
      G.fx.gash(this.hitMesh(e, hp), hp, this.slashDir().add(V(rnd(-0.35, 0.35), rnd(-0.35, 0.35), rnd(-0.35, 0.35))));
      const killed = e.hit(dir, dmg, kind, hp);
      hits++; G.onHit(e, killed, kind);
    }
    for (const rd of G.ragdolls) { // slashing corpses still pushes them around
      const t = rd.core, d = V(t.position.x - this.pos.x, 0, t.position.z - this.pos.z), dist = d.length(); d.normalize();
      if (dist > radius || (cone > -1 && d.dot(f) < cone) || Math.abs(t.position.y - this.pos.y) > 2) continue;
      for (const k in rd.bodies) rd.bodies[k].wakeUp();
      t.applyImpulse({ x: d.x * 70, y: 60, z: d.z * 70 }); G.fx.blood(V(t.position.x, t.position.y, t.position.z), d.clone().setY(0.5), 16, 5);
      hits++; sfx.hit(false);
    }
    return hits;
  }

  // the aimed point on the target, in world space (follows him as he moves)
  aimPoint(a) { return a.mesh.parent ? a.mesh.localToWorld(a.local.clone()) : a.point || this.center; }
  strikePath(a, k) { // world point of the hand path at k in [0,1]
    const sgn = a.hand === 'L' ? 1 : -1, y = a.yaw, L = V(Math.cos(y), 0, -Math.sin(y)), F = V(Math.sin(y), 0, Math.cos(y));
    const P = this.aimPoint(a); a.point = P.clone();
    const off = (o) => V(0, o[1], 0).addScaledVector(L, o[0] * sgn).addScaledVector(F, o[2]);
    const S = a.style;
    return k < 0.5 ? P.clone().add(off(S.s).multiplyScalar(1 - k * 2)) : P.clone().add(off(S.e).multiplyScalar((k - 0.5) * 2));
  }
  hitZone(a) { // the claw lands exactly on the aimed part
    const G = this.G, e = a.target; if (!e || !e.alive || e.held || !G.enemies.includes(e)) return false;
    const P = this.aimPoint(a);
    if (P.distanceTo(this.center) > 2.6) return false;
    const d = V(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize();
    const stroke = this.strikePath(a, 0.75).sub(this.strikePath(a, 0.25)).normalize();
    if (a.mesh.parent) G.fx.gash(a.mesh, P, stroke);
    G.fx.slashBlood(P, stroke.clone().multiplyScalar(0.6).add(d).add(V(0, 0.3, 0)).normalize(), a.zone === 'neck' || a.zone === 'head' ? 1.8 : 0.9);
    this.bloodyClaws(a.hand);
    const killed = e.hit(d.clone().lerp(stroke, 0.3).normalize(), ZONE_DMG[a.zone] || 13, a.air ? 'air' : 'slash', P, a.zone);
    G.onHit(e, killed, a.zone === 'head' || a.zone === 'neck' ? 'heavy' : 'slash');
    return true;
  }

  // world-space stroke direction of the striking claw (tip velocity), for gouges and gashes
  slashDir() {
    const h = this.atk ? this.atk.hand : 'L', v = this.tipVel[h];
    return v.lengthSq() > 0.5 ? v.clone().normalize() : this.forward().cross(V(0, 1, 0)).multiplyScalar(h === 'L' ? -1 : 1).add(V(0, -0.3, 0)).normalize();
  }
  hitMesh(e, p) { // body cube nearest to a point
    let best = e.rig.m.torso, bd = 1e9;
    for (const k in e.rig.m) { if (e.rig.cut.has(k)) continue; const m = e.rig.m[k]; const d = m.getWorldPosition(V(0, 0, 0)).distanceToSquared(p); if (d < bd) { bd = d; best = m; } }
    return best;
  }
  // claws dragging through things: tips inside world boxes leave grooves, inside bodies leave gashes + blood
  traceClaws(dt) {
    const G = this.G, a = this.atk;
    this.rig.root.updateMatrixWorld(true);
    for (const h of ['L', 'R']) {
      const tip = this.clawTip(h, 1), prev = this.tipPrev[h];
      if (prev) this.tipVel[h].copy(tip).sub(prev).divideScalar(Math.max(dt, 1e-3));
      this.tipPrev[h] = tip;
      const live = this.clawsOut && this.ext > 0.8 && ((a && a.hand === h && a.t > 0.05 && a.t < 0.2) || this.fin || this.diving);
      if (!live || !prev) continue;
      const box = pointInBox(tip);
      if (box) {
        this.gougeAcc[h] -= tip.distanceTo(prev);
        if (this.gougeAcc[h] <= 0) {
          this.gougeAcc[h] = 0.35; const n = hitNormal(box, tip, prev), sp = tip.clone();
          if (n.x) sp.x = n.x > 0 ? box.max.x : box.min.x; else if (n.y) sp.y = n.y > 0 ? box.max.y : box.min.y; else sp.z = n.z > 0 ? box.max.z : box.min.z;
          G.fx.gouge(sp, n, 0.45, this.tipVel[h], 1); sfx.scrape();
        }
      }
      // through bodies (alive or dead): each cube gets cut once per stroke
      const stroke = a || this.fin || this, cutSet = stroke.cutSet || (stroke.cutSet = new Set());
      const test = (mesh) => {
        if (cutSet.has(mesh)) return; const s = mesh.userData.size; if (!s) return;
        const l = mesh.worldToLocal(tip.clone());
        if (Math.abs(l.x) < s[0] / 2 + 0.02 && Math.abs(l.y) < s[1] / 2 + 0.02 && Math.abs(l.z) < s[2] / 2 + 0.02) {
          cutSet.add(mesh); G.fx.gash(mesh, tip, this.tipVel[h]);
          G.fx.blood(tip, this.tipVel[h].clone().normalize().add(V(0, 0.3, 0)), 22, 5, 0.4);
          this.bloodyClaws(h);
        }
      };
      if (this.fin && this.fin.e && this.fin.e.alive) for (const k in this.fin.e.rig.m) if (!this.fin.e.rig.cut.has(k)) test(this.fin.e.rig.m[k]);
      for (const e of G.enemies) if ((!a || !a.target || a.target === e) && e.pos.distanceToSquared(tip) < 6) for (const k in e.rig.m) if (!e.rig.cut.has(k)) test(e.rig.m[k]);
      for (const pt of G.parts) if (pt.obj.position.distanceToSquared(tip) < 2) for (const m of pt.obj.children) test(m);
      for (const rd of G.ragdolls) if (rd !== this.rd && rd.coreObj.position.distanceToSquared(tip) < 4) for (const k in rd.objs) for (const m of rd.objs[k].children) test(m);
    }
  }
  bloodyClaws(h) { // blood stays on the blades
    const g = this.claws[h][Math.floor(Math.random() * 3)];
    this.bloodT = (this.bloodT || 0) + 1;
    if (g.children.length < 9) {
      const st = new THREE.Mesh(this.G.fx.stainGeo, this.G.fx.gashMat);
      st.position.set((Math.random() - 0.5) * 0.004, -0.3 - Math.random() * 0.65, 0); st.scale.set(0.022, 0.05 + Math.random() * 0.2, 0.032); g.add(st);
    }
  }

  // how hard you are to see: crouching halves it, crouching up on a box or ledge cuts it hard, hanging on a wall a bit
  stealthFactor() {
    if (this.climbing) return { gain: 0.7, range: 0.8, why: 'ON THE WALL' };
    if (this.crouching) {
      const up = groundBelow(this.pos.x, this.pos.z, this.pos.y + 0.1) > 0.4;
      return up ? { gain: 0.25, range: 0.5, why: 'CROUCHED HIGH' } : { gain: 0.55, range: 0.75, why: 'CROUCHED' };
    }
    return { gain: 1, range: 1, why: '' };
  }

  // --- climbing ---
  // Hands grip real points on the wall. A click runs one weighty step: the low hand rips out, reaches high,
  // drives in, then the body heaves up. Clicks during a step queue the next. Nothing else moves you on a wall.
  grab(hand, w) {
    const G = this.G;
    const fromPos = this.pos.clone(), fromYaw = this.yaw, fromVy = this.vel.y;
    this.climbing = true; this.wall = w; this.vel.set(0, 0, 0); this.diving = false; this.atk = null; this.blocking = false;
    this.yaw = Math.atan2(-w.normal.x, -w.normal.z);
    this.snapToWall();
    // the lunge onto the wall is a short eased flight, not a snap; a fast fall carries a little slide before it bites
    this.grabT = { t: 0, dur: 0.16, off: fromPos.clone().sub(this.pos), yaw: fromYaw, slip: Math.min(0.5, Math.max(0, -fromVy) * 0.04) }; this.step = null; this.stepQueue = null; this.lastHand = hand;
    const other = hand === 'L' ? 'R' : 'L';
    this.grip[hand] = this.pickGrip(hand, 2.0); this.grip[other] = this.pickGrip(other, 1.4);
    for (const h of [hand, other]) this.driveIn(h, h === hand ? 1.4 : 0.8);
    this.wallIdle.shift = rnd(2, 3.5); this.wallIdle.feet = rnd(1, 3); this.wallIdle.nudge = null;
    G.shake(0.1); this.land = 0.3;
  }
  // cadence: alternating clicks close together make the steps faster (0.5 s heavy -> 0.18 s scramble);
  // same-button spam never speeds up. At most one click is buffered.
  climbClick(hand) {
    const gap = this.time - (this.lastClimbT || -9), alt = hand !== this.lastClimbHand;
    this.lastClimbT = this.time; this.lastClimbHand = hand;
    this.climbFast = alt ? Math.min(1, Math.max(0, (0.45 - gap) / (0.45 - 0.13))) : 0;
    const rapid = this.climbFast > 0.5;
    if (this.step) {
      if (this.step.lunge) { if (rapid) this.stepQueue = 'lunge'; return; }
      if (hand !== this.step.hand) { this.stepQueue = rapid ? 'lunge' : hand; this.stepQueueFast = this.climbFast; } return;
    }
    if (rapid) this.startLunge(); else this.startStep(hand, this.climbFast);
  }
  // rapid alternating clicks: rip both claws out, explode upward 1.5-2.5 m, slam them back in. Every lunge varies.
  startLunge() {
    const w = this.wall, top = w.box.max.y, n = w.normal;
    const lead = Math.random() < 0.5 ? (this.lastLead === 'L' ? 'R' : 'L') : (this.lastLead || 'L'); this.lastLead = lead;
    let rise = rnd(1.5, 2.5); const over = this.pos.y + rise + 1.95 > top - 0.08; if (over) rise = Math.max(0.3, top - 0.08 - 1.95 - this.pos.y + 0.6);
    const sway = rnd(-0.18, 0.18), save = this.pos.clone();
    this.pos.y += rise; this.pos.addScaledVector(this.wallLeft(), sway); this.snapToWall();
    const to = this.pos.clone(), other = lead === 'L' ? 'R' : 'L';
    const gTo = { [lead]: this.pickGrip(lead, rnd(1.85, 2.08)), [other]: this.pickGrip(other, rnd(1.45, 1.75)) };
    this.pos.copy(save);
    this.step = { lunge: true, hand: lead, t: 0, dur: rnd(0.4, 0.48), from: save, to, over, lead, gTo, kick: rnd(0.6, 1.2), gFrom: { L: this.grip.L.clone(), R: this.grip.R.clone() } };
    for (const k of ['L', 'R']) if (this.step.gTo[k].y > top - 0.08) this.step.gTo[k].y = top - 0.08;
    this.ripOut('L'); this.ripOut('R'); this.wallIdle.nudge = null; sfx.whoosh(); this.G.shake(0.12);
  }
  pickGripAt(pos, hand, dy) { const s = this.pos.clone(); this.pos.copy(pos); const g = this.pickGrip(hand, dy); this.pos.copy(s); return g; }
  startStep(hand, fast = 0) {
    const big = hand !== this.lastHand, rise = big ? 0.72 - fast * 0.12 : 0.2;
    if (!big) fast = 0;
    const top = this.wall.box.max.y;
    const to = this.pickGrip(hand, 1.95 + rise);
    const over = to.y > top - 0.08; if (over) to.y = top - 0.08;
    this.step = { hand, t: 0, fast, dur: big ? CLIMB_STEP + (0.18 - CLIMB_STEP) * fast : CLIMB_STEP * 0.7, from: this.grip[hand].clone(), to, y0: this.pos.y, y1: this.pos.y + rise, over, ripped: false, driven: false };
    this.wallIdle.nudge = null;
    sfx.swoosh(0.5);
  }
  // can the claws hold a face of box b with outward normal n at the hero's current height?
  faceOK(b, n) { return b.max.y > this.pos.y + 2.05 && b.min.y < this.pos.y + 0.9 && (n.x ? b.max.z - b.min.z : b.max.x - b.min.x) >= 0.9; }
  // corners and gaps: inside corner (wall ahead), short gap to a parallel wall, or round the outside corner
  transferSwing(dir) {
    const w = this.wall, b = w.box, n = w.normal, mv = this.wallLeft().multiplyScalar(dir).round(), gap = R + 0.1;
    const edge = mv.x ? (mv.x > 0 ? b.max.x - this.pos.x : this.pos.x - b.min.x) : (mv.z > 0 ? b.max.z - this.pos.z : this.pos.z - b.min.z);
    const chest = this.pos.clone().add(V(0, 1.3, 0));
    let w2 = null, to = null, via = null, kind = null;
    const hit = rayBox(chest, mv, 1.25); // inside corner: a wall right ahead, facing back at us
    if (hit && hit.normal.dot(mv) < -0.9 && hit.box !== b && this.faceOK(hit.box, hit.normal)) {
      w2 = { box: hit.box, normal: hit.normal.clone() }; kind = 'inside';
      to = chest.clone().addScaledVector(mv, hit.dist - gap).addScaledVector(n, 0.5); to.y = this.pos.y;
      via = this.pos.clone().lerp(to, 0.5).addScaledVector(n, 0.15);
    }
    if (!w2 && edge < 1.4) { // short gap to another wall in the same plane
      const plane = n.x ? (n.x > 0 ? b.max.x : b.min.x) : (n.z > 0 ? b.max.z : b.min.z);
      let best = null;
      for (const o of boxes) {
        if (o === b || !this.faceOK(o, n)) continue;
        const op = n.x ? (n.x > 0 ? o.max.x : o.min.x) : (n.z > 0 ? o.max.z : o.min.z); if (Math.abs(op - plane) > 0.35) continue;
        const near = mv.x ? (mv.x > 0 ? o.min.x - b.max.x : b.min.x - o.max.x) : (mv.z > 0 ? o.min.z - b.max.z : b.min.z - o.max.z);
        if (near < 0.05 || near > 2.6) continue;
        if (!best || near < best.near) best = { o, near, op };
      }
      if (best) {
        const o = best.o; w2 = { box: o, normal: n.clone() }; kind = 'gap';
        to = this.pos.clone().addScaledVector(mv, edge + best.near + 0.45); if (n.x) to.x = best.op + n.x * gap; else to.z = best.op + n.z * gap;
        via = this.pos.clone().lerp(to, 0.5).addScaledVector(n, 0.25);
      }
    }
    if (!w2 && edge < 1.4 && this.faceOK(b, mv)) { // outside corner: swing round onto the side face of the same block
      w2 = { box: b, normal: mv.clone() }; kind = 'outside';
      const corner = this.pos.clone().addScaledVector(mv, edge).addScaledVector(n, -gap); // on the corner edge line
      to = corner.clone().addScaledVector(mv, gap).addScaledVector(n, -0.5);
      via = corner.clone().addScaledVector(mv, 0.45).addScaledVector(n, 0.45);
    }
    if (!w2) return false;
    const lead = dir > 0 ? 'L' : 'R', trail = dir > 0 ? 'R' : 'L';
    const save = { wall: this.wall, pos: this.pos.clone() }; this.wall = w2; this.pos.copy(to);
    const leadTo = this.pickGrip(lead, 1.95), trailTo = this.pickGrip(trail, 1.55);
    this.wall = save.wall; this.pos.copy(save.pos);
    this.step = { swing: true, t: 0, dur: kind === 'gap' ? 0.85 : 0.72, dir, lead, from: this.pos.clone(), to, via, w2, gap: kind === 'gap', y0: this.pos.y,
      yaw0: this.yaw, yaw1: Math.atan2(-w2.normal.x, -w2.normal.z), leadFrom: this.grip[lead].clone(), leadTo, trailTo };
    this.wallIdle.nudge = null; sfx.swoosh(kind === 'gap' ? 1.2 : 0.9); return true;
  }
  startSwing(dir) { // dir +1 = toward the hero's left
    { // a wall right ahead along the face = inside corner
      const mv = this.wallLeft().multiplyScalar(dir).round(), hit = rayBox(this.pos.clone().add(V(0, 1.3, 0)), mv, 1.25);
      if (hit && hit.box !== this.wall.box && this.transferSwing(dir)) return;
    }
    const b = this.wall.box, n = this.wall.normal, wl = this.wallLeft(), m = 0.45;
    const lo = n.x ? b.min.z : b.min.x, hi = n.x ? b.max.z : b.max.x, cur = n.x ? this.pos.z : this.pos.x;
    const axis = n.x ? wl.z : wl.x; // how the lateral world axis maps to "left"
    let target = cur + axis * dir * 0.95; target = Math.min(hi - m, Math.max(lo + m, target));
    if (Math.abs(target - cur) < 0.4 && this.transferSwing(dir)) return;
    if (Math.abs(target - cur) < 0.15) { this.step = { swing: true, t: 0, dur: 0.25, dir, lead: dir > 0 ? 'L' : 'R', from: this.pos.clone(), to: this.pos.clone(), y0: this.pos.y, leadFrom: this.grip[dir > 0 ? 'L' : 'R'].clone(), leadTo: this.grip[dir > 0 ? 'L' : 'R'].clone(), trailTo: this.grip[dir > 0 ? 'R' : 'L'].clone(), trailFrom: this.grip[dir > 0 ? 'R' : 'L'].clone(), d1: true, d2: true, r1: true, r2: true }; sfx.scrape(); return; } // face edge: bump
    const to = this.pos.clone(); if (n.x) to.z = target; else to.x = target;
    const lead = dir > 0 ? 'L' : 'R', trail = dir > 0 ? 'R' : 'L';
    const save = this.pos.clone(); this.pos.copy(to);
    const leadTo = this.pickGrip(lead, 1.95), trailTo = this.pickGrip(trail, 1.55);
    this.pos.copy(save);
    this.step = { swing: true, t: 0, dur: 0.72, dir, lead, from: this.pos.clone(), to, y0: this.pos.y, leadFrom: this.grip[lead].clone(), leadTo, trailTo };
    this.wallIdle.nudge = null; sfx.swoosh(0.7);
  }
  // a grip point for a hand at height dy above the feet: varied left/right and height, never on an old gouge
  pickGrip(hand, dy) {
    // grip heights were tuned for a longer arm: planted holds sit where this body's arms reach (wrist ~0.25 m over the
    // shoulder, 0.42 m out), anything above that is the step's rise and is kept
    dy = dy <= 1.95 ? 1.62 + (dy - 1.95) * 0.75 : 1.62 + (dy - 1.95);
    const n = this.wall.normal, side = this.wallLeft().multiplyScalar(hand === 'L' ? 1 : -1), b = this.wall.box;
    let p;
    for (let k = 0; k < 6; k++) {
      const reach = (this.gHist.length % 2 ? 0.08 : -0.05);
      p = V(this.pos.x, this.pos.y + dy + rnd(-0.1, 0.14) + reach, this.pos.z).addScaledVector(side, rnd(0.3, 0.44)); // outside the shoulder line: elbows out, never a hand over the head
      if (n.x) p.x = n.x > 0 ? b.max.x : b.min.x; else p.z = n.z > 0 ? b.max.z : b.min.z;
      if (!this.gHist.some(q => q.distanceToSquared(p) < 0.16 * 0.16)) break;
    }
    const lo = n.x ? b.min.z : b.min.x, hi = n.x ? b.max.z : b.max.x; // stay on the face
    if (n.x) p.z = Math.min(hi - 0.06, Math.max(lo + 0.06, p.z)); else p.x = Math.min(hi - 0.06, Math.max(lo + 0.06, p.x));
    return p;
  }
  // Strikes lead with the CUTTING EDGE. The claws' edges are on the palm side and their flats face the thumb axis, so
  // while a hand is moving fast in a strike or finisher the forearm rolls until the palm faces the claws' motion and the
  // blades lie in the swing plane (slashes, uppercuts); moving along the forearm it goes tip first (stabs, impales).
  // after a finisher stab the claws stay inside the stabbed part while he is lifted, twisted, lowered. The blades keep
  // the line they went in on (fixed in his body, so they turn with him) and sink along it, tip first, to the middle of
  // the part; if the script holds him beyond this body's reach he is drawn onto the claws.
  holdStuck(dt) {
    const fin = this.fin, st = fin && fin.stuck; if (!st || !fin.e) return;
    const r = this.rig, e = fin.e; e.rig.root.updateMatrixWorld(true); r.root.updateMatrixWorld(true);
    const reach = ((r.armA || 0.32) + (r.armB || 0.16) + CLAW_ROOT + this.CLAW_LEN * 0.55) * 0.92, pull = V(0, 0, 0); let np = 0;
    fin._stk = fin._stk && fin._stk.of === st ? fin._stk : { of: st };
    for (const s in st) {
      const m = e.rig.m[st[s]]; if (!m || e.rig.cut.has(st[s])) continue;
      const C = m.getWorldPosition(V(0, 0, 0)), sh = r.j['uarm' + s].getWorldPosition(V(0, 0, 0)), mq = m.getWorldQuaternion(new THREE.Quaternion());
      if (!fin._stk[s]) { // the line the claws are on as they bite
        const hq = r.j['hand' + s].getWorldQuaternion(new THREE.Quaternion()), ax = V(0, -1, 0).applyQuaternion(hq), wr = r.j['hand' + s].getWorldPosition(V(0, 0, 0));
        const into = C.clone().sub(wr).normalize(), d0 = ax.dot(into) > 0.3 ? ax : C.clone().sub(sh).normalize();
        fin._stk[s] = d0.applyQuaternion(mq.clone().invert()); fin._stk['w' + s] = m.worldToLocal(wr.clone()); // kept in HIS frame: the hand rides with him
      }
      const d = fin._stk[s].clone().applyQuaternion(mq), Wt = C.clone().addScaledVector(d, -(CLAW_ROOT + this.CLAW_LEN * 0.55));
      // sink along the blades fast, drift sideways slowly: the claws never rake through him on the way in
      const W = m.localToWorld(fin._stk['w' + s].clone()), dl = Wt.clone().sub(W), ax = dl.dot(d); W.addScaledVector(d, ax * (1 - Math.exp(-30 * dt))).addScaledVector(dl.addScaledVector(d, -ax), 1 - Math.exp(-10 * dt));
      fin._stk['w' + s] = m.worldToLocal(W.clone());
      const off = W.clone().sub(sh), ex = off.length() - (r.armA || 0.32) - (r.armB || 0.16) + 0.02; if (ex > 0) { pull.addScaledVector(off.normalize(), -ex); np++; }
      aimArmAt(r, s, W, 1e5, 1); r.j['uarm' + s].updateMatrixWorld(true); const nf = fin._stk['n' + s] = (fin._stk['n' + s] || 0) + 1; // settle the wrist on the bite, then the claws turn only with him
      setHandWorld(r, s, handQuat(d, s === 'L' ? V(0, 1, 0) : V(0, -1, 0)), nf < 6 ? 25 : 1e5, nf < 6 ? dt : 1);
    }
    if (np && !fin.released) { e.pos.addScaledVector(pull, 1 / np); e.rig.root.updateMatrixWorld(true); } // onto the claws
  }
  edgeLead(dt) {
    const r = this.rig; if (dt <= 0) return;
    const on = this.clawsOut && !this.climbing && (this.atk || this.fin); r.root.updateMatrixWorld(true);
    // in a finisher the cut is the claws' motion through HIM: velocities are taken in his frame
    const ref = this.fin && this.fin.e && !this.fin.released && this.fin.e.rig.root.parent ? this.fin.e.rig.root : null; if (ref) ref.updateMatrixWorld(true);
    if (this._tipRef !== ref) { this._tipPrev = {}; this._tipRef = ref; }
    const keep = p => ref ? ref.worldToLocal(p) : p;
    this._tipPrev = this._tipPrev || {};
    for (const s of ['L', 'R']) {
      const hand = r.j['hand' + s], W = hand.getWorldPosition(V(0, 0, 0)), cur = hand.getWorldQuaternion(new THREE.Quaternion());
      if (this.fin?.stuck?.[s]) { this._tipPrev[s] = null; continue; } // held inside him
      const c0 = V(0, -1, 0).applyQuaternion(r.j['larm' + s].getWorldQuaternion(new THREE.Quaternion())), prev = this._tipPrev[s] && (ref ? ref.localToWorld(this._tipPrev[s].clone()) : this._tipPrev[s]);
      const tipOf = q => W.clone().addScaledVector(V(0, -1, 0).applyQuaternion(q), EDGE_PT);
      if (!prev || !on) { this._tipPrev[s] = keep(tipOf(cur)); if (!on && !this.climbing) hand.quaternion.slerp(IDQ, 1 - Math.exp(-12 * dt)); continue; }
      // the orientation that makes the claws' own motion this frame edge-first (or tip-first along the forearm):
      // a few fixed-point passes, because turning the hand moves the blade too
      let v = W.clone().addScaledVector(c0, EDGE_PT).sub(prev).divideScalar(dt), q = cur.clone(), act = 0;
      for (let it = 0; it < 4; it++) {
        const sp = v.length(); act = Math.min(1, Math.max(0, (sp - 1.2) / 2.3)); if (act <= 0.01) break;
        const vh = v.clone().divideScalar(sp), along = c0.dot(vh); if (along < -0.6) { act = 0; break; } // pulling back out
        // claws stay along the forearm; the forearm ROLLS so the blade plane holds the motion and the palm-side edge
        // faces it (edge-on for any swing; moving along the forearm that is simply tip first)
        const vp = vh.clone().addScaledVector(c0, -along), pd = s === 'L' ? -1 : 1;
        const want = along > 0.45 ? handQuat(vh, V(0, -pd, 0)) // driving forward: the wrist lines the claws up with the thrust, tip first
          : vp.lengthSq() > 0.01 ? handQuat(c0, vp.multiplyScalar(pd)) : handQuat(c0, V(0, -pd, 0));
        q = cur.clone().slerp(want, act); v = v.multiplyScalar(0.4).addScaledVector(tipOf(q).sub(prev).divideScalar(dt), 0.6);
      }
      if (act > 0.01) setHandWorld(r, s, q); else hand.quaternion.slerp(IDQ, 1 - Math.exp(-12 * dt));
      this._tipPrev[s] = keep(tipOf(hand.getWorldQuaternion(new THREE.Quaternion())));
    }
  }
  // claws in the wall: the blades go into the face along their length, angled down like pitons, knuckles just off the
  // surface; the wrist sits behind the fist on the blade line and the arm reaches it with exact IK. A hand still on its
  // way (target off the wall) already aims its blades at the hold.
  clawHands(hand, dt) {
    const n = this.wall.normal, b = this.wall.box, ax = n.x ? 'x' : 'z', sg = Math.sign(n[ax]), face = sg > 0 ? b.max[ax] : b.min[ax], left = this.wallLeft();
    for (const s of ['L', 'R']) {
      const g = hand[s], off = Math.max(0, (g[ax] - face) * sg), S = g.clone(); S[ax] = face;
      const d = n.clone().negate().addScaledVector(V(0, -1, 0), 0.32).addScaledVector(left, (s === 'L' ? -1 : 1) * 0.1).normalize();
      const K = S.addScaledVector(d, -(KNUCKLE_GAP + off) / -d.dot(n)); // claw roots: knuckle gap off the face
      const q = handQuat(d, s === 'L' ? V(0, 1, 0) : V(0, -1, 0)); // palm down, the three blades side by side
      const W = K.addScaledVector(d, -CLAW_ROOT).addScaledVector(V(1, 0, 0).applyQuaternion(q), s === 'L' ? -0.012 : 0.012);
      this.rig.root.updateMatrixWorld(true); aimArmAt(this.rig, s, W, 30, dt, 3); this.rig.j['uarm' + s].updateMatrixWorld(true); setHandWorld(this.rig, s, q, 30, dt);
    }
  }
  wallLeft() { const n = this.wall.normal; return V(-n.z, 0, n.x); } // the hero's left while facing the wall (-n)
  driveIn(hand, power = 1) { // claws punch into the wall at the grip: tilted grooves, chips, clang
    const G = this.G, p = this.grip[hand], n = this.wall.normal, side = V(-n.z, 0, n.x);
    const along = V(0, -1, 0).addScaledVector(side, rnd(-0.45, 0.45)).normalize();
    G.fx.gouge(p, n, rnd(0.22, 0.42), along, power);
    this.gHist.push(p.clone()); if (this.gHist.length > 10) this.gHist.shift();
    sfx.clang(); G.shake(0.05 * power); G.noise?.(p, 3.5 * power, false);
  }
  ripOut(hand) { // claws tearing free leave a short upward tear
    const G = this.G, p = this.grip[hand], n = this.wall.normal;
    G.fx.scratch(p.clone().add(V(0, 0.06, 0)), n, rnd(0.1, 0.2), V(rnd(-0.3, 0.3), 1, 0).normalize());
    G.fx.debris(p, n, 3, 2); G.fx.sparksAt(p, n, 4, 0.6); sfx.scrape();
  }
  handOnWall(hand) { return this.grip[hand] ? this.grip[hand].clone() : V(this.pos.x, this.pos.y + 1.6, this.pos.z); }
  snapToWall() {
    const n = this.wall.normal, b = this.wall.box, gap = R + 0.1;
    if (n.x) this.pos.x = (n.x > 0 ? b.max.x : b.min.x) + n.x * gap; else this.pos.z = (n.z > 0 ? b.max.z : b.min.z) + n.z * gap;
    // keep the body far enough from the face's side edges that both hands (one each side) stay on the face
    const m = 0.45;
    if (n.x) { if (b.max.z - b.min.z > 2 * m) this.pos.z = Math.min(b.max.z - m, Math.max(b.min.z + m, this.pos.z)); }
    else if (b.max.x - b.min.x > 2 * m) this.pos.x = Math.min(b.max.x - m, Math.max(b.min.x + m, this.pos.x));
  }
  leaveWall() { this.grabT = null; this.drawYaw = null; this.slide = null; this.slideV = 0; this.climbing = false; this.wall = null; this.step = null; this.stepQueue = null; this.regrab = 0.25; this.grip.L = this.grip.R = null; }
  wallJump() {
    const n = this.wall.normal, G = this.G;
    const camF = V(Math.sin(G.input.yaw), 0, Math.cos(G.input.yaw));
    for (const h of ['L', 'R']) if (this.grip[h]) G.fx.gouge(this.grip[h], n, 0.35, V(0, -1, 0), 0.6); // claws rip out
    if (G.input.pitch < -0.6) { this.leaveWall(); this.vel.set(n.x * 2, 0, n.z * 2); return; } // looking down: just let go
    const away = camF.dot(n);
    const out = away > 0.1 ? camF.clone().multiplyScalar(8.6).addScaledVector(n, 1.2) // leap where you look
      : n.clone().multiplyScalar(6.5).addScaledVector(camF.sub(n.clone().multiplyScalar(camF.dot(n))), 3);
    this.vel.set(out.x, 9.8, out.z); this.yaw = Math.atan2(out.x, out.z); this.airKind = 'jump';
    this.flipT = away > 0.1 ? 0 : undefined; // leaping off toward the next pillar: front flip
    this.leaveWall(); this.regrab = 0.3; this.wallJumpT = 0.3; this.dashT = 0.25; sfx.jump();
  }
  // per-frame wall logic (WASD does nothing here); returns false when no longer climbing
  updateWall(dt) {
    const w = this.wall, n = w.normal, I = this.wallIdle;
    if (this.jumpBuf > 0) { this.jumpBuf = 0; this.wallJump(); return false; }
    this.vel.set(0, 0, 0);
    const hand = { L: this.grip.L.clone(), R: this.grip.R.clone() };
    let legs = null, torsoX = 0.15, headX = 0, headY = 0, crouch = 0;
    let st = this.step;
    // S held: controlled descent on ONE dragging claw (never passive): speed ramps, long gouge, sparks, legs braced
    if (!st && this.G.input.keys.KeyS) {
      const G = this.G, sl = this.slide || (this.slide = { t: 0, drag: this.lastHand === 'L' ? 'R' : 'L', acc: 0, snd: 0, from: this.grip[this.lastHand === 'L' ? 'R' : 'L'].clone() });
      if (sl.t === 0) { const free = sl.drag === 'L' ? 'R' : 'L'; this.ripOut(free); sfx.scrape(); }
      sl.t += dt; const v = Math.min(6.5, 1.0 + sl.t * 3.2), dy = v * dt;
      const g = groundBelow(this.pos.x, this.pos.z, this.pos.y + 0.1);
      this.pos.y = Math.max(g, this.pos.y - dy); this.slideV = v;
      const dragP = this.grip[sl.drag]; dragP.y = Math.min(dragP.y, this.pos.y + 1.75); // the claw rides down in its groove
      sl.acc += dy; if (sl.acc > 0.12) { sl.acc = 0; G.fx.scratch(dragP.clone().add(V(0, 0.06, 0)), n, 0.16, V(0, -1, 0)); G.fx.sparksAt(dragP, n, 3, 0.5 + v * 0.1); }
      sl.snd -= dt; if (sl.snd <= 0) { sl.snd = 0.09; sfx.scrape(); }
      const free = sl.drag === 'L' ? 'R' : 'L', fs = free === 'L' ? 1 : -1, sway = Math.sin(this.time * 7) * 0.08;
      hand[sl.drag] = dragP.clone();
      hand[free] = this.pos.clone().add(V(0, 1.25 + sway, 0)).addScaledVector(this.wallLeft(), fs * 0.75).addScaledVector(n, 0.45); // out for balance
      this.climbPose = { legs: { tl: -0.95, tr: -0.75, kl: 1.25, kr: 1.05 }, torsoX: 0.05, headX: 0.55, headY: fs * 1.1, crouch: 0.1, hand };
      this.snapToWall();
      if (this.pos.y <= g + 0.01) { // reached the floor: land smoothly
        this.leaveWall(); this.slide = null; this.grounded = true; this.vel.set(n.x * 0.5, 0, n.z * 0.5); this.land = 0.45; sfx.land(0.4 + v * 0.05);
        this.G.noise?.(this.pos, 2 + v, false); return false;
      }
      return true;
    }
    if (this.slide) { // let go of S: both claws sink back in, hold here
      const sl = this.slide; this.slide = null; this.slideV = 0;
      this.grip.L = this.pickGrip('L', 1.8); this.grip.R = this.pickGrip('R', 1.6);
      this.driveIn('L', 1.3); this.driveIn('R', 1.3); this.G.shake(0.1 + Math.min(0.2, sl.t * 0.1));
    }
    // A/D: swing sideways along the wall, one claw at a time (screen-relative)
    if (!st && (this.G.input.keys.KeyA || this.G.input.keys.KeyD)) {
      const cy = this.G.input.yaw, screenL = V(Math.cos(cy), 0, -Math.sin(cy)), wl = this.wallLeft();
      const dir = (this.G.input.keys.KeyA ? 1 : -1) * Math.sign(screenL.dot(wl) || 1);
      this.startSwing(dir); st = this.step;
    }
    if (st && st.lunge) {
      st.t += dt; const u = Math.min(1, st.t / st.dur), other = st.lead === 'L' ? 'R' : 'L';
      const coil = u < 0.18 ? Math.sin(u / 0.18 * Math.PI) : 0, k = Math.min(1, Math.max(0, (u - 0.12) / 0.5)), up = 1 - Math.pow(1 - k, 3);
      this.pos.lerpVectors(st.from, st.to, up); this.pos.y -= coil * 0.12; this.snapToWall();
      const reach = (h2, at) => { // hands fly up off the wall, then slam in at their catch time
        if (u >= at) return st.gTo[h2].clone();
        const kk = Math.min(1, u / at); return st.gFrom[h2].clone().lerp(st.gTo[h2], kk * kk * (3 - 2 * kk)).addScaledVector(n, Math.sin(kk * Math.PI) * 0.35);
      };
      hand.L = reach('L', st.lead === 'L' ? 0.66 : 0.8); hand.R = reach('R', st.lead === 'R' ? 0.66 : 0.8);
      for (const [h2, at] of [[st.lead, 0.66], [other, 0.8]]) if (u >= at && !st['c' + h2]) { st['c' + h2] = true; this.grip[h2] = st.gTo[h2].clone(); this.driveIn(h2, 1.6); this.G.shake(0.22); this.G.camImpulse?.(0.15, 0); }
      const drive = Math.sin(Math.min(1, u / 0.6) * Math.PI) * st.kick; // knees drive up, then legs swing under
      legs = { tl: -0.4 - drive * 1.1, tr: -0.4 - drive * 0.7 + (u > 0.6 ? Math.sin(this.time * 25) * 0.3 * st.kick : 0), kl: 0.6 + drive * 1.4, kr: 0.6 + drive * 0.9 };
      torsoX = 0.05 - drive * 0.2 + (u > 0.66 ? 0.2 : 0); headX = -0.5 * (1 - u); crouch = coil * 0.4;
      if (u >= 1) {
        this.step = null; this.lastHand = st.lead;
        if ((st.over || this.pos.y + 1.0 > w.box.max.y) && this.tryMantle()) return false;
        if (this.stepQueue) { const q = this.stepQueue; this.stepQueue = null; if (q === 'lunge') this.startLunge(); else this.startStep(q, 0); }
      }
      this.climbPose = { legs, torsoX, headX, headY, crouch, hand };
      return true;
    }
    if (st && st.swing) {
      st.t += dt; const u = Math.min(1, st.t / st.dur), wl = this.wallLeft();
      const lead = st.lead, trail = lead === 'L' ? 'R' : 'L';
      // lead claw: rip out, reach across, drive in
      if (u < 0.3) { const k = u / 0.3, e2 = k * k * (3 - 2 * k); hand[lead] = st.leadFrom.clone().lerp(st.leadTo, e2).addScaledVector(n, Math.sin(k * Math.PI) * 0.18); if (!st.r1) { st.r1 = true; this.ripOut(lead); } }
      else { hand[lead] = st.leadTo.clone(); if (!st.d1) { st.d1 = true; this.grip[lead] = st.leadTo.clone(); this.driveIn(lead, 1.1); } }
      // body: pendulum across under the lead claw (dips, then rises), legs swinging with it
      const bk = Math.min(1, Math.max(0, (u - 0.25) / 0.55)), be = bk * bk * (3 - 2 * bk);
      if (st.via) { // round a corner / across a gap: quadratic arc, body turning to the new face
        const a = 1 - be; this.pos.x = a * a * st.from.x + 2 * a * be * st.via.x + be * be * st.to.x; this.pos.z = a * a * st.from.z + 2 * a * be * st.via.z + be * be * st.to.z;
        let dy = st.yaw1 - st.yaw0; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.yaw = st.yaw0 + dy * be;
      } else { const lat = st.from.clone().lerp(st.to, be); this.pos.x = lat.x; this.pos.z = lat.z; }
      this.pos.y = st.y0 - Math.sin(bk * Math.PI) * (st.gap ? 0.45 : 0.28);
      // trail claw follows once the body has swung
      if (u < 0.62) hand[trail] = this.grip[trail].clone();
      else { const k = Math.min(1, (u - 0.62) / 0.3), e2 = k * k * (3 - 2 * k); if (!st.r2) { st.r2 = true; this.ripOut(trail); st.trailFrom = this.grip[trail].clone(); } hand[trail] = st.trailFrom.clone().lerp(st.trailTo, e2).addScaledVector(n, Math.sin(k * Math.PI) * 0.15); }
      if (u >= 0.92 && !st.d2) { st.d2 = true; this.grip[trail] = st.trailTo.clone(); this.driveIn(trail, 0.9); }
      const sw = Math.sin(bk * Math.PI) * st.dir;
      legs = { tl: -0.5 - Math.abs(sw) * 0.3, tr: -0.5 + Math.abs(sw) * 0.2, kl: 0.6, kr: 0.9 };
      this.swingRoll = sw * 0.35; torsoX = 0.12; headY = st.dir * 0.4;
      if (u >= 1) { this.step = null; this.swingRoll = 0; if (st.w2) { this.wall = st.w2; this.yaw = st.yaw1; } }
      if (!st.w2 || u >= 1) { this.snapToWall(); if (!nearestWall(this.pos, R, H, 0.45)) { this.leaveWall(); return false; } }
      this.climbPose = { legs, torsoX, headX, headY, crouch, hand };
      return true;
    }
    if (st) {
      st.t += dt; const u = Math.min(1, st.t / st.dur);
      const p1 = 0.2, p2 = 0.62, p3 = 0.72; // rip out | reach (body already heaving on the planted claw) | drive in | settle
      if (!st.ripped) { st.ripped = true; this.ripOut(st.hand); }
      const out = st.from.clone().addScaledVector(n, 0.2 - st.fast * 0.1), hi = st.to.clone().addScaledVector(n, 0.14 - st.fast * 0.08); // frantic = shorter reach
      if (u < p1) hand[st.hand] = st.from.clone().lerp(out, ease(u / p1));
      else if (u < p2) { const k = (u - p1) / (p2 - p1), e2 = k * k * (3 - 2 * k); hand[st.hand] = out.lerp(hi, e2).addScaledVector(n, Math.sin(k * Math.PI) * 0.12); }
      else if (u < p3) hand[st.hand] = hi.lerp(st.to, ease((u - p2) / (p3 - p2)));
      else hand[st.hand] = st.to.clone();
      if (u >= (p2 + p3) / 2 && !st.driven) { st.driven = true; this.grip[st.hand] = st.to.clone(); this.driveIn(st.hand, 1.2 + st.fast * 0.5); this.G.shake(0.05 + st.fast * 0.12); }
      // body: sags while reaching, then heaves up on the planted claw
      const hk = Math.min(1, Math.max(0, (u - 0.08) / 0.72)), heave = hk * hk * (3 - 2 * hk); // legs push the body up while the hand reaches
      this.pos.y = st.y0 - Math.sin(Math.min(1, u / p3) * Math.PI) * 0.05 + (st.y1 - st.y0) * heave;
      torsoX = 0.15 + Math.sin(u * Math.PI) * 0.12; crouch = u > p3 ? (1 - heave) * 0.25 : 0.1;
      const pushL = st.hand === 'L';
      legs = { tl: pushL ? -1.2 + heave * 0.9 : -0.3, tr: pushL ? -0.3 : -1.2 + heave * 0.9, kl: pushL ? 1.6 - heave * 0.9 : 0.7, kr: pushL ? 0.7 : 1.6 - heave * 0.9 };
      headX = -0.25;
      if (st.fast > 0.3) { // frantic scramble: legs kicking hard against the wall
        const q = this.time * 30;
        legs = { tl: -0.9 + Math.sin(q) * 0.7 * st.fast, tr: -0.9 + Math.sin(q + 2.4) * 0.7 * st.fast, kl: 1.3 + Math.cos(q) * 0.6, kr: 1.3 + Math.cos(q + 2.4) * 0.6 };
      }
      if (u >= 1) {
        this.lastHand = st.hand; this.step = null;
        if ((st.over || this.pos.y + 1.0 > w.box.max.y) && this.tryMantle()) return false;
        if (this.stepQueue) { const q = this.stepQueue; this.stepQueue = null; if (q === 'lunge') this.startLunge(); else this.startStep(q, this.stepQueueFast || 0); }
      }
    } else { // living idle: breathing, grip shifts, feet hunting for holds, looking around
      const t = this.time;
      torsoX = 0.14 + Math.sin(t * 1.9) * 0.035; crouch = 0.05 + Math.sin(t * 1.9 + 1) * 0.03;
      I.look -= dt; if (I.look <= 0) { I.look = rnd(1.5, 3.5); I.lookTo = [rnd(-0.6, 0.6), rnd(-0.4, 0.25)]; }
      headY = I.lookTo ? I.lookTo[0] : 0; headX = I.lookTo ? I.lookTo[1] : 0;
      I.feet -= dt; const scr = I.feet < 0.45 ? Math.sin((0.45 - I.feet) / 0.45 * Math.PI) : 0;
      if (I.feet <= 0) { I.feet = rnd(2.5, 5); if (Math.random() < 0.6) sfx.step(); }
      legs = { tl: -0.75 + Math.sin(t * 0.8) * 0.18 - scr * 0.5, tr: -0.45 + Math.sin(t * 0.8 + 2) * 0.18, kl: 1.0 + scr * 0.6, kr: 0.8 + Math.sin(t * 1.1) * 0.1 };
      I.shift -= dt;
      if (I.shift <= 0) { // readjust one claw: pull out a little, re-sink beside the old spot
        I.shift = rnd(2.5, 4.5); const h = Math.random() < 0.5 ? 'L' : 'R';
        I.nudge = { h, t: 0, from: this.grip[h].clone(), to: this.grip[h].clone().add(V(0, rnd(-0.04, 0.06), 0)).addScaledVector(V(-n.z, 0, n.x), rnd(-0.07, 0.07)) };
      }
      if (I.nudge) {
        const g = I.nudge; g.t += dt; const k = Math.min(1, g.t / 0.32);
        hand[g.h] = g.from.clone().lerp(g.to, k).addScaledVector(n, Math.sin(k * Math.PI) * 0.07);
        if (k >= 1) { this.grip[g.h] = g.to; I.nudge = null; this.G.fx.scratch(g.to, n, 0.08, V(0, -1, 0)); this.G.fx.sparksAt(g.to, n, 2, 0.4); sfx.scrape(); }
      }
    }
    this.snapToWall();
    if (this.grabT) { // ease in from where the grab started
      const g = this.grabT; g.t += dt; const k = Math.min(1, g.t / g.dur), e3 = 1 - Math.pow(1 - k, 3);
      this.pos.x += g.off.x * (1 - e3); this.pos.z += g.off.z * (1 - e3);
      if (g.slip > 0) { const s = g.slip * dt / g.dur; this.pos.y -= s; for (const hh of ['L', 'R']) this.grip[hh].y -= s; }
      let dy = this.yaw - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); this.drawYaw = g.yaw + dy * e3;
      if (k >= 1) { this.grabT = null; this.drawYaw = null; }
    }
    if (!this.step) { // a stacked box above takes over as the wall
      const above = nearestWall(V(this.pos.x, w.box.max.y + 0.05, this.pos.z), R, 1.0, 0.3);
      if (above && above.box !== w.box && above.normal.equals(n) && this.pos.y + 1.9 > w.box.max.y) this.wall = above;
    }
    if (!nearestWall(this.pos, R, H, 0.45)) { this.leaveWall(); return false; }
    this.climbPose = { legs, torsoX, headX, headY, crouch, hand };
    return true;
  }
  tryMantle() {
    const w = this.wall, n = w.normal;
    const to = V(this.pos.x, w.box.max.y, this.pos.z).addScaledVector(n, -(R + 0.1 + 0.5));
    if (pointInBox(V(to.x, to.y + 1, to.z))) return false;
    this.mantle = { from: this.pos.clone(), to, t: 0, dur: 0.45 };
    for (const h of ['L', 'R']) if (this.grip[h]) this.G.fx.gouge(V(this.grip[h].x, w.box.max.y - 0.02, this.grip[h].z), V(0, 1, 0), 0.3, n.clone().negate(), 0.8);
    this.climbing = false; this.wall = null; this.step = null; this.grip.L = this.grip.R = null; sfx.jump();
    return true;
  }

  // dir: from the attacker toward the hero. Returns 'parry' | 'block' | 'hit' | 'immune'.
  damage(dmg, dir, from, opts = {}) {
    if (this.dead) return 'immune';
    const G = this.G;
    if (this.fin || this.iframes > 0) return 'immune';
    if (this.blocking && this.forward().dot(dir) < -0.1) {
      this.rig.root.updateMatrixWorld(true);
      const p = this.clawTip('L', 0.5).lerp(this.clawTip('R', 0.5), 0.5);
      if (this.blockT < PARRY) { // perfect timing: knock him open
        G.fx.sparksAt(p, dir.clone().negate().setY(0.3), 34, 1.6);
        sfx.parry(); G.hitstop(0.13); G.slowmo(0.25, 0.55); G.punch(0.9); G.shake(0.35); G.fovKick(-6); G.blurKick(0.5);
        this.blockT = 1; from?.parried?.(this); G.finGain?.(0.3);
        G.banner?.('PARRY', 0.6);
        return 'parry';
      }
      if (opts.guardBreak) { // kicks and heavy chops smash through a held block (a parry still beats them)
        this.blocking = false; this.guardBroken = 0.6; this.hp -= dmg; this.vel.x += dir.x * 7; this.vel.z += dir.z * 7;
        G.fx.sparksAt(p, dir.clone().negate(), 20, 1.2); sfx.clang(); sfx.hurt(); G.shake(0.4); G.hurtFlash = 0.7; G.banner?.('GUARD BROKEN', 0.6);
        if (this.hp <= 0) this.die(dir); return 'hit';
      }
      G.fx.sparksAt(p, dir.clone().negate().setY(0.3), 16, 1); sfx.clang(); sfx.block(); G.shake(0.15); G.hitstop(0.04);
      this.vel.x += dir.x * 3; this.vel.z += dir.z * 3;
      dmg *= opts.projectile ? 0 : 0.15; if (dmg <= 0) return 'block';
      this.hp -= dmg; if (this.hp <= 0) this.die(dir); return 'block';
    }
    this.hp -= dmg; this.iframes = 0.35;
    if (!this.climbing) { this.vel.x += dir.x * 6; this.vel.z += dir.z * 6; }
    G.fx.blood(this.center, dir.clone().setY(0.3), 22, 5); sfx.hurt(); G.shake(0.3); G.hurtFlash = 1;
    if (this.hp <= 0) this.die(dir);
    return 'hit';
  }
  die(dir) {
    const G = this.G;
    this.hp = 0; this.dead = true; if (this.climbing) this.leaveWall();
    for (const h of ['L', 'R']) this.trails[h].mesh.visible = false;
    this.rd = new Ragdoll(G.scene, G.physics, this.rig, V(dir.x * 5, 3, dir.z * 5), { seg: 'torso', dir: dir.clone().setY(0.3), power: 80 });
    G.ragdolls.push(this.rd); G.onHeroDeath();
  }

  // --- per frame ---
  update(dt) {
    if (this.dead) return;
    const G = this.G, inp = G.input; this.time += dt;
    this.regrab -= dt; this.guardBroken = (this.guardBroken || 0) - dt; this.iframes -= dt; this.comboWin -= dt; this.wallJumpT -= dt; this.dashT -= dt;
    if (this.comboWin <= 0 && !this.atk) this.comboStep = 0;
    if (this.lock && (!this.lock.alive || this.lock.pos.distanceTo(this.pos) > 9)) this.lock = null;
    // sheathing: both buttons held, claws slide slowly back into the forearms
    if (this.clawsOut && this.holdArmed && this.held.L && this.held.R && !this.climbing && !this.fin) {
      this.sheatheT += dt;
      this.slideTick = (this.slideTick || 0) - dt;
      if (this.slideTick <= 0) { this.slideTick = 0.12; sfx.scrape(); }
      if (this.sheatheT >= SHEATHE_HOLD) this.sheathe();
    } else if (this.sheatheT > 0) { this.sheatheT = 0; if (this.clawsOut) { sfx.snik(true); this.flex = 0.5; } } // let go early: they snap back out
    if (this.sheatheT > 0) { const k = this.sheatheT / SHEATHE_HOLD; this.ext = 1 - k * k * (3 - 2 * k) * 0.96; }
    else { const tgt = this.clawsOut ? 1 : 0; this.ext += (tgt - this.ext) * Math.min(1, dt * (this.clawsOut ? 22 : 16)); }
    const e = this.clawsOut && this.sheatheT <= 0 ? Math.min(1.08, this.ext * 1.08) : this.ext;
    for (const h of ['L', 'R']) for (const g of this.claws[h]) { g.visible = this.ext > 0.02; g.scale.y = Math.max(0.001, e * this.CLAW_LEN); }
    this.flex = Math.max(0, this.flex - dt * 2.6);
    this.slamReady = this.clawsOut && !this.grounded && !this.climbing && !this.diving && !this.fin && this.heightAboveGround() >= SLAM_MIN;
    if (this.slamReady) { this.glintT = (this.glintT || 0) - dt; if (this.glintT <= 0) { this.glintT = 0.35; this.rig.root.updateMatrixWorld(true); for (const hh of ['L', 'R']) this.G.fx.sparksAt(this.clawTip(hh, 0.9), V(0, 1, 0), 2, 0.25); } }
    if (this.blocking) this.blockT += dt;
    if (this.quickBlock > 0) { this.quickBlock -= dt; if (this.quickBlock <= 0 && !this.mmbHeld) this.blocking = false; }

    // scripted finisher / combo impale owns the hero
    if (this.fin) {
      const pose = { ...(this.fin.update(dt) || {}) }, stuck = this.fin?.stuck;
      if (stuck) for (const s in stuck) pose['arm' + s] = 'ik'; // claws held inside him (holdStuck)
      this.vel.set(0, 0, 0);
      this.anim(dt, pose, 0); this.traceClaws(dt);
      return;
    }

    // movement input relative to camera
    const cy = inp.yaw, f = V(Math.sin(cy), 0, Math.cos(cy)), r = V(-Math.cos(cy), 0, Math.sin(cy));
    const mv = V(0, 0, 0);
    if (inp.keys.KeyW) mv.add(f); if (inp.keys.KeyS) mv.sub(f); if (inp.keys.KeyD) mv.add(r); if (inp.keys.KeyA) mv.sub(r);
    if (mv.lengthSq()) mv.normalize();
    const sprint = !!(inp.keys.ShiftLeft || inp.keys.ShiftRight) && !this.blocking;
    this.jumpBuf -= dt; this.coyote -= dt;
    let pose = {};

    if (G.traverse?.(this, dt, mv)) return; // campaign traversal (vent crawl, ladders, tree leaps) owns this frame
    if (this.mantle) { // vault up over the top edge
      const m = this.mantle; m.t += dt / m.dur; const k = ease(Math.min(1, m.t));
      this.pos.lerpVectors(m.from, m.to, k); this.pos.y = m.from.y + (m.to.y - m.from.y) * Math.min(1, k * 1.6) + Math.sin(k * Math.PI) * 0.2;
      pose = { armL: { dir: V(0.3, -0.9 + k * 0.4, 0.6), bend: 0.3, k: 25 }, armR: { dir: V(-0.3, -0.9 + k * 0.4, 0.6), bend: 0.3, k: 25 }, crouch: 0.6 * (1 - k), legs: { tl: -1.4 * (1 - k), tr: -0.4, kl: 1.6 * (1 - k), kr: 0.8 } };
      if (m.t >= 1) { this.mantle = null; this.grounded = true; this.vel.set(0, 0, 0); this.land = 0.5; sfx.land(0.6); }
      this.anim(dt, pose, 0); return;
    }

    if (this.climbing && this.updateWall(dt)) {
      const c = this.climbPose;
      this.anim(dt, { noArms: true, roll: this.swingRoll || 0, legs: c.legs, torsoX: c.torsoX, headX: c.headX, headY: c.headY, headK: 4, crouch: c.crouch, legK: 9, torsoK: 10 }, 0);
      this.rig.root.updateMatrixWorld(true);
      this.clawHands(c.hand, dt);
      return;
    }

    // ground / air movement
    if (this.grounded) this.coyote = 0.12;
    this.crouching = !!(inp.crouch || inp.keys.ControlLeft || inp.keys.ControlRight) && this.grounded && !this.atk && !this.blocking;
    const max = this.crouching ? 2.6 : (sprint && !this.atk ? SPRINT : RUN) * (this.blocking ? 0.4 : 1);
    const atkSlow = this.atk && this.grounded ? 0.25 : 1;
    const accel = this.grounded ? 16 : (this.wallJumpT > 0 ? 1 : 4.5);
    if (!this.diving) {
      const k = 1 - Math.exp(-accel * dt);
      const tx = mv.x * max * atkSlow, tz = mv.z * max * atkSlow;
      if (this.atk && this.grounded) { this.vel.x *= Math.exp(-6 * dt); this.vel.z *= Math.exp(-6 * dt); }
      else if (this.grounded) { this.vel.x += (tx - this.vel.x) * k; this.vel.z += (tz - this.vel.z) * k; }
      else if (mv.lengthSq()) { // air: steer toward input, keep the leap's speed
        const hs = Math.hypot(this.vel.x, this.vel.z), m = Math.max(max, hs);
        this.vel.x += (mv.x * m - this.vel.x) * k; this.vel.z += (mv.z * m - this.vel.z) * k;
      }
    }
    if (this.jumpBuf > 0 && this.coyote > 0 && !this.atk) {
      this.vel.y = JUMP; this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.airKind = 'jump'; sfx.jump();
    }
    this.vel.y -= (this.vel.y > 0 ? GRAV_UP : GRAV_DOWN) * dt;
    const prevY = this.pos.y, wasG = this.grounded, fallV = this.vel.y;
    this.pos.addScaledVector(this.vel, dt);
    const c = collideCylinder(this.pos, this.vel, R, H, prevY); this.grounded = c.grounded;
    { // safety net: never below the floor under you
      const gy = groundBelow(this.pos.x, this.pos.z, Math.max(prevY, this.pos.y));
      if (this.pos.y < gy - 0.01) { this.pos.y = gy; if (this.vel.y < 0) this.vel.y = 0; this.grounded = true; }
    }
    if (this.pos.y < -20) { this.pos.set(...(G.respawn || [0, 0, 6])); this.vel.set(0, 0, 0); }
    if (wasG && !this.grounded && this.airKind !== 'attack' && this.vel.y <= 0.5) this.airKind = 'fall'; // walked off an edge
    if ((!wasG || this.diving) && this.grounded) { this.landT = this.time; this.airKind = null; // a dive that starts already grounded still ends here (never slides on forever)
      const h = Math.min(1, -fallV / 22); this.land = Math.max(this.land, 0.25 + h * 0.75); sfx.land(0.4 + h);
      this.flipT = undefined;
      if (!this.diving && h > 0.75 && Math.hypot(this.vel.x, this.vel.z) > 3 && !this.atk) { this.rollT = 0; this.land = 0.2; } // roll out of it G.noise?.(this.pos, 2 + h * 8, h > 0.7);
      if (h > 0.6) G.shake(0.15 * h);
      if (this.diving) { // dive slash impact
        this.diving = false; this.land = 1.2;
        // power and reach scale with the drop: 3.5 m = a thump, 12 m+ = a crater that flattens the crowd
        const hgt = Math.max(SLAM_MIN, this.slamH || SLAM_MIN), P = Math.min(1, (hgt - SLAM_MIN) / 9), rad = 3 + P * 4;
        G.shake(0.5 + P * 0.5); G.hitstop(0.08 + P * 0.1); sfx.hit(true); sfx.land(1 + P); G.noise?.(this.pos, 12 + P * 12, true);
        this.doHits(rad, -1, 30 + P * 40, 'dive');
        for (const e of G.enemies) { const d = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z); if (d < rad && !e.held && e.alive && e.state !== 'down') { const k = V(e.pos.x - this.pos.x, 0, e.pos.z - this.pos.z).normalize(); e.vel.x = k.x * (6 + P * 6); e.vel.z = k.z * (6 + P * 6); e.vel.y = 3 + P * 4; e.grounded = false; e.state = 'stagger'; e.t = 0.6 + P * 0.6; e.flinch = 1; } }
        const fl = V(this.pos.x, this.pos.y + 0.01, this.pos.z), f0 = this.forward();
        G.fx.crater(fl, 2.4 + P * 3.6); G.fx.shockwave(fl, rad * 1.4); G.fx.debris(fl, V(0, 1, 0), Math.round(20 + P * 40), 6 + P * 5);
        for (const h of [-1, 1]) G.fx.gouge(fl.clone().addScaledVector(f0, 0.55).addScaledVector(V(f0.z, 0, -f0.x), h * 0.22), V(0, 1, 0), 0.9, f0, 1.5);
        G.fovKick?.(10); G.blurKick?.(0.8);
        this.atk = { hand: 'L', kind: 'diveland', t: 0, dur: 0.35, hitAt: 9, cancel: 0.25, done: true };
      }
    }
    if (this.diving && this.grounded === false) {}

    // attacks
    if (this.atk) {
      const a = this.atk; a.t += dt;
      if (a.kind !== 'diveland') { let d = a.yaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 30); }
      if (!a.done && a.t >= a.hitAt && a.kind !== 'dive') {
        a.done = true;
        const n = a.kind === 'uppercut' ? this.doHits(2.6, 0.1, 26, 'uppercut') : this.doHits(2.5, 0.2, 13, a.kind === 'air' ? 'air' : 'slash');
        if (a.kind === 'aimed') a.done = false;
        if (!n) this.trySwingWall(a.hand);
      }
      if (a.kind === 'aimed' && !a.struck && a.k >= 0.5) { a.struck = true; if (!this.hitZone(a)) this.trySwingWall(a.hand); }
      if (a.kind === 'dive' && this.grounded) this.atk = null;
      else if (a.t >= a.dur) { this.atk = null; if (this.queued) { const q = this.queued; this.queued = null; this.attack(q); } }
      else if (this.queued && a.t >= a.cancel) { const q = this.queued; this.queued = null; this.atk = null; this.attack(q); }
    } else if (this.blocking) { // guard faces where you look
      let d = inp.yaw - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 14);
    } else if (mv.lengthSq() > 0.01) {
      let d = Math.atan2(mv.x, mv.z) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, dt * 12);
    }
    pose = this.attackPose();
    this.traceClaws(dt);
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.anim(dt, pose, this.grounded ? hs : 0);
    if (this.grounded && this.stepFlag) { if (!this.crouching) sfx.step(); G.noise?.(this.pos, this.crouching ? 0.8 : Math.hypot(this.vel.x, this.vel.z) > 7.5 ? 7 : 2.2, false); }
  }

  trySwingWall(hand) { // slashing a wall scores it
    const w = nearestWall(this.pos, R, H, 1.1);
    if (!w) return;
    const n = w.normal; if (n.dot(this.forward()) > -0.5) return;
    const p = this.clawTip(hand); const b = w.box;
    if (n.x) p.x = n.x > 0 ? b.max.x : b.min.x; else p.z = n.z > 0 ? b.max.z : b.min.z;
    p.y = Math.min(Math.max(p.y, b.min.y + 0.1), b.max.y - 0.1);
    this.G.fx.gouge(p, n, 0.5, this.slashDir(), 1.4); sfx.clang();
  }

  attackPose() {
    // a lunge stance: the striking side's leg drives forward, the back leg extends (k 0..1)
    const lunge = (sgn, k) => sgn > 0 ? { tl: -0.8 * k, kl: 1.05 * k, tr: 0.5 * k, kr: 0.22 * k } : { tr: -0.8 * k, kr: 1.05 * k, tl: 0.5 * k, kl: 0.22 * k };
    const a = this.atk;
    const p = {};
    if (this.flex > 0) { // the SNIKT flex: fists up, elbows bent, clenched
      const k = this.flex;
      p.armL = { dir: V(0.75, 0.15 + k * 0.4, 0.6), bend: 1.9, k: 30 }; p.armR = { dir: V(-0.75, 0.15 + k * 0.4, 0.6), bend: 1.9, k: 30 };
      p.torsoX = -0.1 * k; p.crouch = 0.12 * k;
    }
    if (this.sheatheT > 0) { // fists up, forearms vertical, blades grinding back in
      const k = Math.min(1, this.sheatheT / 0.12);
      p.armL = { dir: V(0.6, 0.1 + k * 0.3, 0.75), bend: 2.0, k: 20 }; p.armR = { dir: V(-0.6, 0.1 + k * 0.3, 0.75), bend: 2.0, k: 20 };
      p.torsoX = 0.08; p.headX = 0.25; return p;
    }
    if (this.blocking) { // claws crossed in front of the face
      p.armL = { dir: V(-0.15, 0.25, 1), bend: 1.75, k: 40, roll: 0.5 }; p.armR = { dir: V(0.2, 0.3, 1), bend: 1.65, k: 40, roll: -0.5 };
      p.crouch = 0.14; p.torsoX = 0.03; p.headX = -0.05; p.stance = 1; return p; // athletic, chest up behind the claws (no hunch)
    }
    if (!a && this.crouching) { // low crouch-walk, claws held low and close
      const s = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 2.6);
      p.crouch = 0.55; p.torsoX = 0.25; p.armL = { dir: V(0.35, -0.75, 0.6), bend: 1.2, k: 12 }; p.armR = { dir: V(-0.35, -0.75, 0.6), bend: 1.2, k: 12 }; p.stance = 0.4 * (1 - s);
      return p;
    }
    if (!a) {
      if (this.clawsOut && this.flex <= 0 && this.grounded) { // guard stance with claws out
        const s = Math.min(1, Math.hypot(this.vel.x, this.vel.z) / 7);
        if (s < 0.5) { p.armL = { dir: V(0.45, -0.55, 0.7), bend: 1.25, k: 10 }; p.armR = { dir: V(-0.45, -0.55, 0.7), bend: 1.25, k: 10 }; p.crouch = 0.08; }
      }
      if (this.diving) { p.armL = { dir: V(0.3, 1, 0.3), bend: 0.2, k: 20 }; p.armR = { dir: V(-0.3, 1, 0.3), bend: 0.2, k: 20 }; }
      return p;
    }
    const sgn = a.hand === 'L' ? 1 : -1, t = a.t;
    const other = a.hand === 'L' ? 'armR' : 'armL', me = a.hand === 'L' ? 'armL' : 'armR';
    p[other] = { dir: V(-sgn * 0.5, -0.45, 0.6), bend: 1.4, k: 18 };
    if (a.kind === 'dive') { p.armL = { dir: V(0.3, 1, 0.4), bend: 0.3, k: 25 }; p.armR = { dir: V(-0.3, 1, 0.4), bend: 0.3, k: 25 }; p.torsoX = -0.3; return p; }
    if (a.kind === 'diveland') { const k = Math.min(1, t / 0.08); p.armL = { dir: V(0.4, -0.7, 1), bend: 0.2, k: 40 }; p.armR = { dir: V(-0.4, -0.7, 1), bend: 0.2, k: 40 }; p.crouch = 0.9 * (1 - t / 0.35); p.torsoX = 0.5 * k; return p; }
    if (a.kind === 'aimed') {
      const S = a.style, k = t < 0.055 ? 0 : Math.min(1, (t - 0.055) / 0.115), ke = k * k * (3 - 2 * k);
      a.k = ke;
      const pt = this.strikePath(a, ke);
      this.rig.j['uarm' + a.hand].getWorldPosition(this._sh || (this._sh = V(0, 0, 0)));
      const dv = pt.clone().sub(this._sh); const len = dv.length(); dv.normalize();
      p[me] = 'ik'; p.ik = { hand: a.hand, point: this._sh.clone().addScaledVector(dv, Math.max(0.2, len - 0.32)), k: t < 0.07 ? 30 : 60 };
      const wu = t < 0.055 ? t / 0.055 : 1;
      p.crouch = S.c * 1.3 * wu + 0.1 * ke; p.twist = sgn * S.tw * 1.3 * (wu - ke * 2.2); p.torsoX = 0.1 + S.c * 0.35 + ke * 0.14; p.torsoK = 40;
      if (a.air) p.legs = { tl: -1.1, tr: 0.3, kl: 1.6, kr: 0.9 };
      else p.legs = lunge(sgn, Math.max(wu * 0.35, ke)); p.legK = 30;
      return p;
    }
    if (a.kind === 'uppercut') {
      const k = Math.min(1, Math.max(0, (t - 0.06) / 0.14));
      p[me] = { dir: lerpV(V(sgn * 0.3, -0.9, 0.35), V(sgn * 0.12, 1, 0.35), ease(k)), bend: 0.9 - k * 0.8, k: 45 };
      p.crouch = t < 0.08 ? 0.5 : 0.1; p.torsoX = 0.35 - k * 0.6; p.twist = -sgn * 0.3 * k; return p;
    }
    const [w, e, bw, be] = SWINGS[a.variant || 0](sgn);
    const k = t < 0.05 ? 0 : Math.min(1, (t - 0.05) / 0.085);
    p[me] = { dir: k === 0 ? w : lerpV(w, e, ease(k)).add(V(0, 0, Math.sin(k * Math.PI) * 0.8)), bend: bw + (be - bw) * ease(k), k: k === 0 ? 30 : 55 };
    p.twist = sgn * 0.85 * (1 - ease(k)) - sgn * 0.95 * ease(k); p.torsoX = 0.12 + 0.25 * k; p.crouch = 0.08 + 0.14 * k; p.torsoK = 40;
    if (a.kind === 'air') p.legs = { tl: -1.1, tr: 0.3, kl: 1.6, kr: 0.9 };
    else { p.legs = lunge(sgn, Math.max(0.35, ease(k))); p.legK = 30; }
    return p;
  }

  // which Mixamo clip (if any) carries the body this frame: walk / run on the ground, the jump rise in the air
  pickClip(dt, speed) {
    if (this.clipPreview) { const p = sample(this.clipPreview.name, this.clipPreview.t, false, this._cp || (this._cp = {})); return p && { pose: p, w: 1, k: 1000, mask: undefined }; }
    if (this.fin || this.climbing || this.mantle || this.blocking || this.crouching || this.sheatheT > 0) return null;
    // parkour moments: a front flip off a wall leap, a forward roll out of a hard running landing
    if (this.flipT !== undefined && this.flipT < 0.62 && !this.grounded) { this.flipT += dt; const p = sample('front_flip', 0.62 + 0.74 * Math.min(1, this.flipT / 0.62), false, this._fp || (this._fp = {})); return p && { pose: p, w: 1, k: 40 }; }
    if (this.rollT !== undefined && this.rollT < 0.75) { this.rollT += dt; const p = sample('sprinting_forward_roll', 0.2 + 0.95 * Math.min(1, this.rollT / 0.75), false, this._rp || (this._rp = {})); return p && { pose: p, w: 1, k: 40 }; }
    const armsFree = !this.clawsOut && !this.atk;
    if (this.grounded && !this.atk && speed > 0.7) {
      const p = loco(this, dt, speed, this._lp || (this._lp = {}));
      return p && { pose: p, w: Math.min(1, (speed - 0.5) / 0.8), mask: armsFree ? undefined : ['pelvis', 'torso', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] };
    }
    if (!this.grounded && !this.atk && !this.diving && this.vel.y > -2) { // takeoff and rise
      this.airT = (this.airT || 0) + dt; const p = sample('jumping_1', 0.5 + Math.min(0.45, this.airT * 0.9), false, this._jp || (this._jp = {}));
      return p && { pose: p, w: 0.8, mask: armsFree ? ['pelvis', 'torso', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'uarmL', 'larmL', 'uarmR', 'larmR'] : ['thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] };
    }
    if (this.grounded) this.airT = 0;
    return null;
  }
  anim(dt, pose, speed) {
    this.land = Math.max(0, this.land - dt * 3.2);
    this.rig.root.rotation.y = this.drawYaw != null && this.climbing ? this.drawYaw : this.yaw;
    const clip = this.pickClip(dt, speed);
    const st = animate(this.rig, { speed, grounded: this.grounded || this.climbing, vy: this.vel.y, t: this.time, dt, squash: this.land * 0.6, ...pose, lean: this.atk ? 0 : Math.min(0.15, speed / 60), clip });
    this.stepFlag = st.stepL || st.stepR;
    { // on a wall the body hugs it (chest ~0.2 m off the face, the collision cylinder stays put) so both arms reach their claws
      const p = this.rig.j.pelvis.position, want = this.climbing ? WALL_HUG : 0; p.z += (want - p.z) * Math.min(1, dt * 10); }

    if (pose.ik) { this.rig.root.updateMatrixWorld(true); aimArmAt(this.rig, pose.ik.hand, pose.ik.point, pose.ik.k, dt); }
    this.holdStuck(dt); this.edgeLead(dt);
    // clench: squash the hands while flexing or attacking
    const cl = Math.max(this.flex, this.atk ? 0.6 : 0, this.clawsOut ? 0.3 : 0);
    for (const h of ['L', 'R']) this.rig.m['hand' + h].scale.set(1 + cl * 0.15, 1 - cl * 0.3, 1 + cl * 0.1);
    // trails from claw base to tip during strikes
    for (const h of ['L', 'R']) {
      const active = this.clawsOut && ((this.fin && !this.fin.combo) || (this.atk && this.atk.hand === h && this.atk.t > 0.04 && this.atk.t < 0.24) || (this.atk && (this.atk.kind === 'diveland' || this.atk.kind === 'dive')) || this.diving);
      if (active) { this.rig.root.updateMatrixWorld(true); this.trails[h].push(this.clawTip(h, 0.35), this.clawTip(h, 1.05)); }
      this.trails[h].update(dt, active);
    }
  }
}
