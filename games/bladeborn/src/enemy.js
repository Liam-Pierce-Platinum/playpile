// Cube-man enemies. One-on-one combat: a single melee TOKEN lets one brute attack at a time while the rest
// circle, posture and wait their turn; ranged throwers share a separate SHOT token. Parry knocks them to their knees.
import * as THREE from 'three';
import { buildRig, animate } from './rig.js';
import { makeWeapon, MELEE_SET } from './weapons.js';
import { collideCylinder, pointInBox, hitNormal, groundBelow, rayWorld } from './world.js';
import { Ragdoll, Part, PARENT, nextGroup, cutCap } from './ragdoll.js';
import { sfx } from './audio.js';
import { sample, loco } from './clips.js';
import { weaponPre, weaponPost, seatWeapon, meleeReach, bladeContact } from './pose.js';
// unarmed moves play Liam's Mixamo clips (watched in tools/clipsheet.mjs): [clip, start, impact, end] seconds.
// The windup is fitted from start to impact, the strike + recovery from impact to end, so hits land on time.
const FIST_CLIP = { jab: ['lead_jab', 0.2, 0.39, 0.75], cross: ['cross_punch_1', 0.6, 1.16, 1.5], hook: ['hook', 0.37, 0.75, 1.1], kick: ['side_kick', 0.45, 0.94, 1.6] };

const SHADES = [
  { skin: 0x8a8a8a, shirt: 0x5c5c5c, pants: 0x444444, boots: 0x2a2a2a, dark: 0x222222 },
  { skin: 0x9a9a9a, shirt: 0x6a6a6a, pants: 0x505050, boots: 0x303030, dark: 0x262626 },
  { skin: 0x7a7a7a, shirt: 0x4a4a4a, pants: 0x5e5e5e, boots: 0x2e2e2e, dark: 0x1e1e1e },
];
const _v = new THREE.Vector3(), _f = new THREE.Vector3();
const R = 0.38, H = 1.85;
// --- stealth senses ---
const SEE = 17, CONE = Math.cos(1.0), _e = new THREE.Vector3(), _d = new THREE.Vector3();
// grey "?" / "!" over heads
function markTex(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.font = 'bold 54px Impact, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 6; g.strokeStyle = 'rgba(20,20,20,0.85)'; g.strokeText(ch, 32, 34); g.fillStyle = '#e2e2e2'; g.fillText(ch, 32, 34);
  return new THREE.CanvasTexture(c);
}
let MARKS = null;

// --- weapons and their move sets. Each move: windup (telegraph) / active / recover seconds, reach, arc (cos of half
// angle), damage, arm, a pose for windup and strike (torso-space arm dirs), guardBreak = block does not soak it.
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const MOVES = {
  jab: { w: 0.26, a: 0.12, r: 0.22, reach: 2.0, arc: 0.6, dmg: 7, arm: 'L', wp: V3(0.3, 0.2, 0.3), sp: V3(0.05, 0.25, 1), bend0: 1.8, bend1: 0.1 },
  cross: { w: 0.3, a: 0.13, r: 0.3, reach: 2.1, arc: 0.6, dmg: 10, arm: 'R', wp: V3(-0.4, 0.2, -0.2), sp: V3(-0.05, 0.25, 1), bend0: 1.9, bend1: 0.1 },
  hook: { w: 0.4, a: 0.15, r: 0.4, reach: 2.0, arc: 0.3, dmg: 13, arm: 'L', wp: V3(0.9, 0.3, -0.1), sp: V3(-0.6, 0.25, 0.8), bend0: 1.6, bend1: 1.4 },
  kick: { w: 0.5, a: 0.16, r: 0.5, reach: 2.3, arc: 0.5, dmg: 15, kick: true, guardBreak: true },
  bash: { w: 0.42, a: 0.15, r: 0.35, reach: 2.4, arc: 0.4, dmg: 13, arm: 'R', wp: V3(-0.5, 1, -0.4), sp: V3(-0.1, -0.4, 1), bend0: 1.3, bend1: 0.15 },
  chop: { w: 0.6, a: 0.16, r: 0.55, reach: 2.5, arc: 0.6, dmg: 20, arm: 'R', wp: V3(-0.2, 1.2, -0.5), sp: V3(-0.05, -0.7, 1), bend0: 1.2, bend1: 0.1, guardBreak: true },
  sweep: { w: 0.48, a: 0.18, r: 0.42, reach: 2.9, arc: -0.1, dmg: 17, arm: 'R', wp: V3(-1, 0.4, -0.3), sp: V3(0.9, 0.1, 0.6), bend0: 0.3, bend1: 0.1 },
  back: { w: 0.32, a: 0.16, r: 0.4, reach: 2.8, arc: -0.1, dmg: 15, arm: 'R', wp: V3(0.8, 0.5, 0.2), sp: V3(-0.9, 0.2, 0.6), bend0: 0.6, bend1: 0.1 },
  thrust: { w: 0.55, a: 0.14, r: 0.5, reach: 3.4, arc: 0.75, dmg: 22, arm: 'R', wp: V3(-0.3, 0.3, -0.6), sp: V3(0, 0.15, 1), bend0: 1.6, bend1: 0.02, lunge: 9 },
};
const KITS = { // combos per weapon; one is picked each time he gets the token
  fists: [['jab', 'cross'], ['jab', 'jab', 'hook'], ['cross', 'kick'], ['hook', 'cross', 'kick']],
  baton: [['bash', 'bash'], ['chop'], ['bash', 'chop'], ['jab', 'bash']],
  sword: [['sweep', 'back'], ['thrust'], ['sweep', 'back', 'chop'], ['back', 'thrust']],
};
// laser sight for gunners (grey-white, it is light not colour)
const LASER = new THREE.MeshBasicMaterial({ color: 0xf0f0f0, transparent: true, opacity: 0.5, depthWrite: false });
const HULL = new THREE.MeshBasicMaterial({ color: 0xe6e6e6, side: THREE.BackSide, transparent: true, opacity: 0.5, depthWrite: false });
const rnd = (a, b) => a + Math.random() * (b - a);

// --- tokens: who may attack right now ---
function takeToken(G, e, kind) {
  if (kind === 'shot') { // two shooters at once when three or more gunners hunt you (each still shows his laser first)
    if ((G.shotCD || 0) > 0) return false;
    const busy = k => { const c = G[k]; return c && c !== e && c.alive && !c.held && G.enemies.includes(c); };
    const two = G.enemies.filter(o => o.alive && o.mode === 'alert' && o.type === 'gunner').length >= 3;
    for (const k of two ? ['shotToken', 'shotToken2'] : ['shotToken']) if (!busy(k)) { G[k] = e; e.token = kind; return true; }
    return false;
  }
  const k = 'meleeToken';
  const cur = G[k];
  if (cur && cur !== e && cur.alive && !cur.held && G.enemies.includes(cur)) return false;
  if (kind === 'shot' && (G.shotCD || 0) > 0) return false;
  G[k] = e; e.token = kind; return true;
}
export function dropToken(G, e) {
  if (G.meleeToken === e) G.meleeToken = null;
  if (G.shotToken === e) { G.shotToken = null; G.shotCD = 0.6; }
  if (G.shotToken2 === e) { G.shotToken2 = null; G.shotCD = 0.4; }
  e.token = null;
}

// --- projectiles: thrown concrete chunks, telegraphed, blockable, parry sends them back ---
const projGeo = new THREE.BoxGeometry(0.22, 0.18, 0.2);
const projMat = new THREE.MeshStandardMaterial({ color: 0x9a9a9a, roughness: 0.9 });
export function updateProjectiles(G, dt) {
  const hero = G.hero;
  for (let i = G.projectiles.length - 1; i >= 0; i--) {
    const p = G.projectiles[i]; p.t += dt;
    const prev = p.m.position.clone();
    p.v.y -= 16 * dt; p.m.position.addScaledVector(p.v, dt); p.m.rotation.x += dt * 9; p.m.rotation.z += dt * 6;
    const pos = p.m.position;
    let gone = false;
    if (!p.back && !hero.dead) {
      const c = hero.center;
      if (pos.distanceTo(c) < 0.55) {
        const dir = p.v.clone().setY(0).normalize();
        const r = hero.damage(14, dir, p.from, { projectile: true });
        if (r === 'parry' && p.from && p.from.alive) { // straight back at the thrower
          p.back = true; const to = p.from.center.clone().sub(pos), d = to.length();
          p.v.copy(to.normalize().multiplyScalar(22)).add(new THREE.Vector3(0, d * 0.35, 0)); continue;
        }
        if (r !== 'immune') { G.fx.debris(pos, dir.clone().negate(), 8, 3); gone = true; }
      }
    } else if (p.back) {
      for (const e of G.enemies) if (pos.distanceTo(e.center) < 0.6) { e.hit(p.v.clone().setY(0).normalize(), 30, 'parry', pos.clone()); e.parried(); G.onHit(e, e.hp <= 0, 'heavy'); gone = true; break; }
    }
    const box = pointInBox(pos);
    if (box) { const n = hitNormal(box, pos, prev); G.fx.debris(pos, n, 10, 3); G.fx.sparksAt(pos, n, 6, 0.7); if (n.y > 0.5) G.fx.crater(pos, 0.5); sfx.land(0.5); gone = true; }
    if (p.t > 4) gone = true;
    if (gone) { G.scene.remove(p.m); G.projectiles.splice(i, 1); }
  }
}

export class Enemy {
  // opts (campaign placement, all optional): gun ('pistol'|'smg'|'shotgun'|'rifle'|'sniper'), wkind (melee weapon),
  // offhand (a second melee weapon in the left hand), hp, speed, kit (combos of MOVES names), mode ('unaware'|'alert'),
  // yaw, patrol ([[x,z,wait?]] or [{x,z,wait}]), wander (false = holds his post), hold (true = never leaves his post),
  // alarm ([x,z]: a scientist runs there and raises the alarm), see (vision range multiplier)
  constructor(G, pos, tier = 0, type = 'brute', opts = {}) {
    this.G = G;
    this.type = type; this.opts = opts;
    this.rig = buildRig(type === 'thrower' ? { skin: 0xa8a8a8, shirt: 0x7a7a7a, pants: 0x3c3c3c, boots: 0x262626, dark: 0x1a1a1a } : SHADES[Math.floor(Math.random() * SHADES.length)]);
    // weapon: gunners carry a pistol, SMG or shotgun; brawlers fists, baton, pipe, machete or katana
    this.gun = type === 'gunner' ? (opts.gun || (['pistol', 'smg', 'shotgun'].includes(G.forceW) ? G.forceW : ['pistol', 'smg', 'shotgun'][Math.floor(Math.random() * 3)])) : null;
    this.wkind = this.gun || (type === 'brute' ? (opts.wkind || (G.forceW && !this.gun ? G.forceW : ['fists', 'baton', 'pipe', 'machete', 'katana', 'fists'][Math.floor(Math.random() * 6)])) : null);
    this.weapon = this.gun ? 'gun' : this.wkind ? MELEE_SET[this.wkind] : null; // move set
    if (this.wkind && this.wkind !== 'fists') { this.wmesh = makeWeapon(this.wkind); this.rig.j.handR.add(this.wmesh); }
    if (this.weapon === 'gun') { this.laser = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008, 1).translate(0, 0, 0.5), LASER); this.laser.visible = false; G.scene.add(this.laser); }
    if (type === 'thrower' && this.rig.cubes) { // satchel of rubble on the back + a hood: reads as "the one who throws"
      const pack = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.16), this.rig.mats.dark); pack.position.set(0, 0.25, -0.2); pack.castShadow = true; this.rig.m.torso.add(pack);
      const hood = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.12, 0.31), this.rig.mats.shirt); hood.position.set(0, 0.17, -0.01); this.rig.m.head.add(hood);
    }
    if (type === 'thrower') { this.rock = new THREE.Mesh(projGeo, projMat); this.rock.visible = false; this.rock.position.set(0, -0.12, 0); this.rig.m.handR.add(this.rock); }
    this.rig.root.position.copy(pos); G.scene.add(this.rig.root);
    this.pos = this.rig.root.position; this.vel = new THREE.Vector3(); this.yaw = 0;
    this.hp = opts.hp || (type === 'scientist' ? 24 : (type === 'thrower' || type === 'gunner' ? 36 : 60) + tier * 9); this.maxHp = this.hp; this.state = 'chase'; this.t = 0; this.alive = true;
    this.grounded = false; this.side = Math.random() < 0.5 ? 1 : -1; this.circleT = 1 + Math.random() * 2;
    this.flinch = 0; this.flinchDir = new THREE.Vector3(); this.speed = opts.speed || 3.6 + Math.random() * 0.8 + tier * 0.15; this.ring = rnd(3.4, 4.8); this.posture = rnd(1, 3); this.token = null; this.held = false;
    this.armHurt = { L: 0, R: 0 }; this.armLost = { L: false, R: false }; this.legHurt = { L: 0, R: 0 }; this.guardT = 0;
    // stealth: unaware patrol -> suspicious (?) -> searching -> alert (!)
    this.mode = opts.mode || (G.stealthSpawn ? 'unaware' : 'alert'); this.aware = this.mode === 'alert' ? 1 : 0; this.home = pos.clone();
    this.senseT = Math.random() * 0.1; this.seesHero = false; this.patrolT = rnd(0.5, 2); this.wp = null; this.lastKnown = null; this.markT = 0;
    if (opts.yaw !== undefined) this.yaw = this.postYaw = opts.yaw;
    this.patrol = opts.patrol ? opts.patrol.map(p => Array.isArray(p) ? { x: p[0], z: p[1], wait: p[2] ?? 1.5 } : { wait: 1.5, ...p }) : null; this.pi = 0;
    this.hold = !!opts.hold; this.wander = opts.wander !== false && !this.hold; this.seeK = opts.see || (this.gun === 'sniper' ? 2 : 1);
    if (typeof document !== 'undefined') {
      MARKS = MARKS || { q: new THREE.SpriteMaterial({ map: markTex('?'), depthTest: false, transparent: true }), x: new THREE.SpriteMaterial({ map: markTex('!'), depthTest: false, transparent: true }) };
      this.mark = new THREE.Sprite(MARKS.q); this.mark.scale.setScalar(0.42); this.mark.position.set(0, 2.35, 0); this.mark.visible = false; this.mark.renderOrder = 10; this.rig.root.add(this.mark);
    }
    // weapons, rocks and an off-hand blade sit on fist anchors on the cube hands (weapon grips are src/pose.js GRIP)
    {
      if (this.wmesh) { this.grip = this.rig.handAnchor('R'); this.holster = null; }
      if (this.rock) { const a = this.grip || this.rig.handAnchor('R'); a.add(this.rock); this.rock.position.set(0, -0.06, 0.02); }
      if (opts.offhand) { this.offMesh = makeWeapon(opts.offhand); const a = this.rig.handAnchor('L'); if (a) seatWeapon(this.offMesh, a, true, 'L'); }
    }
    this.attackArm = 'R'; this.lastHitBy = null; this.rgroup = nextGroup(); this.spawnT = 0.6; this.time = Math.random() * 10;
  }
  // faint grey outline (inverted hull) on the crosshair target
  setHighlight(on) {
    if (!this.hulls) {
      this.hulls = [];
      for (const k in this.rig.m) { const m = this.rig.m[k].children.find(c => c.userData.visual); if (!m) continue; const h = new THREE.Mesh(m.geometry, HULL); h.scale.setScalar(1.12); h.visible = false; h.renderOrder = -1; m.add(h); this.hulls.push(h); }
    }
    for (const h of this.hulls) h.visible = on;
  }
  get center() { return _v.set(this.pos.x, this.pos.y + 1.15, this.pos.z); }

  update(dt) {
    const G = this.G, hero = G.hero; this.time += dt;
    const to = _f.set(hero.pos.x - this.pos.x, 0, hero.pos.z - this.pos.z), dist = to.length(); to.normalize();
    let want = new THREE.Vector3(), face = Math.atan2(to.x, to.z), armR = null, armL = null, torsoX = 0, crouch = 0, twist = 0;
    this.t -= dt; this.openT = (this.openT || 0) - dt; this.flinch = Math.max(0, this.flinch - dt * 4); this.spawnT = Math.max(0, this.spawnT - dt);
    const heroDead = hero.dead;
    if (this.held) return; // a finisher owns this body
    if (this.token && !['approach', 'windup', 'strike', 'feint', 'counter', 'aim', 'throw', 'gunaim', 'suppress'].includes(this.state)) dropToken(G, this);
    const thrower = this.type === 'thrower' || this.type === 'gunner';
    this.legPose = undefined;
    if (this.laser && this.state !== 'gunaim' && this.state !== 'suppress') this.laser.visible = false;
    let headY = 0;
    if (this.mode !== 'alert') ({ face, headY } = this.stealthAI(dt, want));
    else if (this.type === 'scientist') ({ face, crouch } = this.civAI(dt, want, to, dist));
    else switch (this.state) {
      case 'chase':
        if (heroDead) break;
        want.copy(to).multiplyScalar(this.speed);
        if (dist < (thrower ? 10 : this.ring + 0.5)) { this.state = 'circle'; this.t = this.circleT; }
        break;
      case 'circle': { // wait your turn: strafe at a distance, step in and out, posture
        const ring = thrower ? 8.5 + Math.sin(this.time * 0.4) * 1.5 : this.ring + Math.sin(this.time * 0.9 + this.side) * 0.8;
        const tang = new THREE.Vector3(-to.z, 0, to.x).multiplyScalar(this.side * (thrower ? 1.8 : 1.5));
        if (this.type === 'gunner' && !this.hold) { // flank: spread round you, away from the nearest other gun on your bearing
          const hp = hero.pos, me = Math.atan2(this.pos.x - hp.x, this.pos.z - hp.z);
          for (const o of G.enemies) if (o !== this && o.alive && o.mode === 'alert' && o.type === 'gunner') {
            const a = me - Math.atan2(o.pos.x - hp.x, o.pos.z - hp.z), da = Math.atan2(Math.sin(a), Math.cos(a));
            if (Math.abs(da) < 0.8) { const s = da >= 0 ? 1 : -1; if (s !== this.side) { this.side = s; tang.negate(); } tang.multiplyScalar(1.5); break; }
          }
        }
        want.copy(tang).addScaledVector(to, (dist - ring) * (dist < ring ? 3 : 1.6)); // backs off fast when crowded
        if (dist > ring + 5) this.state = 'chase';
        this.posture -= dt;
        if (this.posture <= 0) { this.posture = rnd(2.5, 5); this.taunt = 0.9; if (Math.random() < 0.5) sfx.grunt(); }
        if (this.taunt > 0) { // beat the chest / spread the arms, a half step in
          this.taunt -= dt; const k = Math.sin((0.9 - this.taunt) / 0.9 * Math.PI);
          armL = { dir: new THREE.Vector3(0.9, 0.4 + k * 0.5, 0.3), bend: 1.3, k: 12 }; armR = { dir: new THREE.Vector3(-0.9, 0.4 + k * 0.5, 0.3), bend: 1.3, k: 12 };
          torsoX = -0.2 * k; want.addScaledVector(to, 1.2 * k);
        }
        if (this.t <= 0 && !heroDead && this.spawnT <= 0) {
          if ((thrower || this.canAttack()) && takeToken(G, this, thrower ? 'shot' : 'melee')) {
            if (this.type === 'gunner') { this.state = 'gunaim'; this.t = this.gun === 'sniper' ? 1.8 : 1.0; this.tac = this.hold || this.gun === 'sniper' ? 'hold' : this.hp < this.maxHp * 0.5 || dist < 5 ? 'retreat' : dist > 10 ? 'advance' : 'strafe'; if (Math.random() < 0.5) this.side *= -1; sfx.grunt(); }
            else if (thrower) { this.state = 'aim'; this.t = 0.85; sfx.grunt(); this.rock.visible = true; }
            else { this.state = 'approach'; this.t = 2.0; }
          } else { this.t = rnd(0.4, 1); if (Math.random() < 0.3) this.side *= -1; }
        }
        break;
      }
      case 'approach':
        want.copy(to).multiplyScalar(this.speed * 1.6);
        if (dist < (this.weapon === 'sword' ? 2.6 : this.wkind === 'katana' ? 2.8 : 2.0)) this.startCombo();
        else if (this.t <= 0) { this.state = 'circle'; this.t = 1.5; dropToken(G, this); }
        break;
      case 'feint': // a fake: pulls the swing back, steps, then the real one comes fast
        want.copy(to).multiplyScalar(-1.2); crouch = 0.1;
        if (this.t <= 0) { this.state = 'windup'; this.t = this.move.w * 0.55; this.feinted = true; this.glint(); }
        break;
      case 'windup': { // telegraph: the arm/weapon rears back, a glint, a grunt; guard-breakers glint brighter
        const M = this.move, k = 1 - Math.max(0, this.t) / M.w;
        if (M.kick) { crouch = 0.1; torsoX = -0.2; this.legPose = { tl: -0.6 * k, tr: 0.1, kl: 1.6 * k, kr: 0.2 }; }
        else { const arm = { dir: this.armDir(M, M.wp), bend: M.bend0, k: 12 }; if (this.useArm(M) === 'L') armL = arm; else armR = arm; twist = -this.sgn(M) * 0.9 * k; crouch = 0.12 + 0.1 * k; torsoX = -0.12 - 0.1 * k; this.legPose = { tl: -0.35 * k, kl: 0.6 * k, tr: 0.35 * k, kr: 0.3 * k }; }
        want.copy(to).multiplyScalar(dist > Math.min(M.reach, meleeReach(this) ?? 9) * 0.7 ? 1.4 : 0.3);
        if (this.feint && !this.feinted && k > 0.6) { this.state = 'feint'; this.t = 0.28; this.feint = false; break; }
        if (this.t <= 0) { this.state = 'strike'; this.t = M.a * (this.weapon === 'fists' ? 0.8 : 1); this.struck = false; sfx.swoosh(M.dmg > 15 ? 1.2 : 0.8); if (M.lunge) { this.vel.x += to.x * M.lunge; this.vel.z += to.z * M.lunge; } }
        break;
      }
      case 'strike': {
        const M = this.move;
        if (M.kick) { this.legPose = { tl: -1.5, tr: 0.15, kl: 0.15, kr: 0.2 }; torsoX = -0.35; }
        else { const arm = { dir: this.armDir(M, M.sp), bend: M.bend1, k: 45 }; if (this.useArm(M) === 'L') armL = arm; else armR = arm; twist = this.sgn(M) * (this.weapon === 'fists' ? 0.95 : 0.6); torsoX = this.weapon === 'fists' ? 0.42 : 0.3; crouch = this.weapon === 'fists' ? 0.18 : 0; this.legPose = { tl: -0.85, kl: 1.0, tr: 0.55, kr: 0.2 }; }
        want.copy(to).multiplyScalar(6 * Math.max(0, this.t / M.a));
        if (!this.struck && this.t < M.a * 0.6) {
          this.struck = true;
          const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), d3 = hero.pos.distanceTo(this.pos);
          if (d3 < Math.min(M.reach, meleeReach(this) ?? 9) && fwd.dot(to) > M.arc && Math.abs(hero.pos.y - this.pos.y) < 1.4) {
            const r = hero.damage(M.dmg, to.clone(), this, { guardBreak: M.guardBreak });
            if (r === 'block' && this.weapon !== 'fists') G.fx.sparksAt(bladeContact(this) || hero.center.clone().addScaledVector(to, -0.4), to.clone().negate(), 10, 1);
          } else if (d3 < M.reach + 2 && !hero.dead) G.finGain?.(0.1); // dodged
        }
        if (this.t <= 0 && this.state === 'strike') {
          this.ci++;
          if (this.ci < this.combo.length && this.alive) { this.move = MOVES[this.combo[this.ci]]; this.state = 'windup'; this.t = this.move.w * 0.7; this.glint(); }
          else { this.state = 'recover'; this.t = 0.32 + Math.random() * 0.25; this.recT = this.t; }
        }
        break;
      }
      case 'counter': // he answers your hit: brief flinch, then a fast strike
        if (this.t <= 0) this.startCombo(true);
        break;
      case 'cover': { // gunner: run to the far side of a box from you, then peek
        if (this.coverP) { const d = new THREE.Vector3(this.coverP.x - this.pos.x, 0, this.coverP.z - this.pos.z), L = d.length(); if (L > 0.4) { want.copy(d.normalize().multiplyScalar(this.speed * 1.2)); face = Math.atan2(d.x, d.z); } else { this.state = 'circle'; this.t = rnd(0.6, 1.4); } }
        if (this.t <= 0) { this.state = 'circle'; this.t = 0.5; }
        break;
      }
      case 'gunaim': { // laser on you, then the shot. Block deflects, a parry sends it back; a box between you stops it
        armR = { dir: new THREE.Vector3(-0.05, 0.25, 1), bend: 0.05, k: 20 }; armL = { dir: new THREE.Vector3(-0.3, 0.2, 1), bend: 0.6, k: 20 };
        this.aimLaser(true); this.gunMove(want, to, dist);
        if (this.t < 0.18 && !this.glinted) { this.glinted = true; this.glint(); sfx.whistle(); }
        if (this.t <= 0) {
          this.fireGun(); this.glinted = false;
          if ((this.gun === 'rifle' || this.gun === 'smg') && this.tac !== 'hold' && Math.random() < 0.35) { this.state = 'suppress'; this.burst = 3 + Math.floor(Math.random() * 3); this.t = 0.32; break; }
          this.state = 'circle'; this.t = rnd(0.9, 1.7); dropToken(G, this); this.aimLaser(false); if (Math.random() < 0.6) this.seekCover();
        }
        break;
      }
      case 'suppress': { // walking fire: loose rounds that pin you behind cover (the laser stays on: you see where it points)
        armR = { dir: new THREE.Vector3(-0.05, 0.25, 1), bend: 0.05, k: 20 }; armL = { dir: new THREE.Vector3(-0.3, 0.2, 1), bend: 0.6, k: 20 };
        this.aimLaser(true); this.gunMove(want, to, dist);
        if (this.t <= 0) {
          if (this.burst-- > 0) { this.shot(6, 1.0); this.t = 0.22; }
          else { this.state = 'circle'; this.t = rnd(0.8, 1.5); dropToken(G, this); this.aimLaser(false); if (Math.random() < 0.7) this.seekCover(); }
        }
        break;
      }
      case 'aim': { // thrower telegraph: rock held high behind the head, leaning back, a rising whistle
        armR = { dir: new THREE.Vector3(-0.4, 1, -0.6), bend: 1.5, k: 10 }; armL = { dir: new THREE.Vector3(0.4, 0.3, 1), bend: 0.2, k: 10 };
        twist = 0.55; torsoX = -0.25; crouch = 0.1;
        if (this.t < 0.45 && !this.whistled) { this.whistled = true; sfx.whistle(); }
        if (this.t <= 0) { this.throwRock(); this.state = 'throw'; this.t = 0.35; this.whistled = false; }
        break;
      }
      case 'throw':
        armR = { dir: new THREE.Vector3(0.3, -0.2, 1), bend: 0.1, k: 40 }; twist = -0.5; torsoX = 0.3;
        if (this.t <= 0) { this.state = 'circle'; this.t = rnd(1.8, 3.2); dropToken(G, this); }
        break;
      case 'recover': want.set(0, 0, 0); if (this.t <= 0) { this.state = 'circle'; this.t = 0.5 + Math.random() * 1.1; this.side = Math.random() < 0.5 ? 1 : -1; dropToken(G, this); } break;
      case 'stagger': // knocked back, head and torso whipped by the hit
        face = this.yaw; torsoX = -0.5 * this.flinch; crouch = 0.2;
        if (this.t <= 0 && this.grounded) { this.state = 'circle'; this.t = 0.6 + Math.random(); }
        break;
      case 'down': // on his knees, swaying: open for a finisher
        face = this.yaw; crouch = 0.9; torsoX = 0.35 + Math.sin(this.time * 3) * 0.08; armL = { dir: new THREE.Vector3(0.3, -1, 0.4), bend: 0.4, k: 8 }; armR = { dir: new THREE.Vector3(-0.3, -1, 0.4), bend: 0.4, k: 8 };
        this.downLegs = true;
        if (this.t <= 0) { this.state = 'circle'; this.t = 1; this.downLegs = false; }
        break;
    }
    if (this.hold && this.mode === 'alert' && this.state !== 'cover') { // a sniper keeps his post
      const d = new THREE.Vector3(this.home.x - this.pos.x, 0, this.home.z - this.pos.z); want.copy(d.length() > 0.5 ? d.normalize().multiplyScalar(this.speed) : d.set(0, 0, 0));
    }
    // separation from others and from the hero
    for (const e of G.enemies) if (e !== this && !e.held) {
      const dx = this.pos.x - e.pos.x, dz = this.pos.z - e.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.0 && d > 1e-4) { want.x += dx / d * 3; want.z += dz / d * 3; this.pos.x += dx / d * (1 - d) * 0.5; this.pos.z += dz / d * (1 - d) * 0.5; }
    }
    if (dist < 0.85 && !hero.climbing && !hero.fin && Math.abs(hero.pos.y - this.pos.y) < 1.5) { this.pos.x -= to.x * (0.85 - dist); this.pos.z -= to.z * (0.85 - dist); }
    // movement
    const acc = this.grounded ? (this.state === 'stagger' ? 3 : this.state === 'down' ? 20 : 14) : 1;
    if (this.state === 'down') want.set(0, 0, 0);
    this.vel.x += (want.x - this.vel.x) * Math.min(1, acc * dt);
    this.vel.z += (want.z - this.vel.z) * Math.min(1, acc * dt);
    this.vel.y -= 26 * dt;
    const prevY = this.pos.y;
    this.pos.addScaledVector(this.vel, dt);
    const wasG = this.grounded;
    const c = collideCylinder(this.pos, this.vel, R, H, prevY); this.grounded = c.grounded;
    if (!wasG && this.grounded) this.land = 0.5;
    if (this.state !== 'stagger') { let d = face - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += d * Math.min(1, 10 * dt); }
    this.rig.root.rotation.y = this.yaw;
    this.land = Math.max(0, (this.land || 0) - dt * 3);
    if (this.guarding() && dist < 4.5 && !(this.taunt > 0)) { // guard up
      // boxer guard: elbows down and in, forearms up in front of the chin (not hands on the head)
      if (!armL) armL = { dir: new THREE.Vector3(0.22, -0.4, 0.95), bend: 1.75, k: 12, roll: 0.3 }; if (!armR) armR = { dir: new THREE.Vector3(-0.22, -0.4, 0.95), bend: 1.75, k: 12, roll: -0.3 };
    }
    for (const s of ['L', 'R']) { this.armHurt[s] = Math.max(0, this.armHurt[s] - dt); if (this.armLost[s] || this.armHurt[s] > 0) { const lim = { dir: new THREE.Vector3(s === 'L' ? 0.2 : -0.2, -1, 0.15), bend: 0.15, k: 6 }; if (s === 'L') armL = lim; else armR = lim; } }
    this.guardT = Math.max(0, this.guardT - dt);
    const limp = Math.min(2, this.legHurt.L + this.legHurt.R);
    if (limp) { this.vel.x *= 1 - limp * 0.25 * Math.min(1, dt * 10); this.vel.z *= 1 - limp * 0.25 * Math.min(1, dt * 10); }
    const hs = Math.hypot(this.vel.x, this.vel.z);
    // clip layer: fists moves play their Mixamo clip fitted to the move's timing; walking/running play the gait
    let clip = null; this._cp = this._cp || {};
    const fc = this.weapon === 'fists' && this.move && FIST_CLIP[this.combo?.[Math.min(this.ci, this.combo.length - 1)]];
    if (fc && (this.state === 'windup' || this.state === 'strike' || (this.state === 'recover' && this.recT))) {
      const M = this.move, [cn, t0, th, t1] = fc;
      const ct = this.state === 'windup' ? t0 + (th - t0) * (1 - Math.max(0, this.t) / M.w)
        : this.state === 'strike' ? th + (t1 - th) * 0.4 * (1 - Math.max(0, this.t) / M.a)
        : th + (t1 - th) * (0.4 + 0.6 * (1 - Math.max(0, this.t) / this.recT));
      const p = sample(cn, ct, false, this._cp); if (p) { clip = { pose: p, w: 1, k: 30 }; armL = armR = null; if (this.legPose) this.legPose = undefined; }
    } else if (this.grounded && hs > 0.7 && !['stagger', 'down', 'aim', 'throw'].includes(this.state)) {
      const p = loco(this, dt, hs, this._cp);
      if (p) clip = { pose: p, w: Math.min(1, (hs - 0.5) / 0.8), mask: armL || armR ? ['pelvis', 'torso', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'] : undefined };
    }
    if (this.state !== 'recover') this.recT = this.state === 'strike' || this.state === 'windup' ? this.recT : 0;
    { const wp = weaponPre(this, { armL, armR, torsoX, twist }); if (wp) ({ armL, armR, torsoX, twist } = wp); } // the weapon owns its arms
    animate(this.rig, { clip, roll: limp ? Math.sin(this.time * 7) * 0.09 * limp : 0, hipX: limp ? Math.max(0, Math.sin(this.time * 7)) * -0.05 : 0, speed: this.grounded ? hs : 0, grounded: this.grounded, vy: this.vel.y, t: this.time, dt, squash: this.land + this.flinch * 0.3, armL, armR, torsoX, crouch, twist, headX: -this.flinch * 0.6, headY, headK: 6, torsoK: this.state === 'stagger' ? 30 : 16, legs: this.state === 'down' ? { tl: -1.5, tr: -1.5, kl: 2.3, kr: 2.3 } : this.legPose });
    if (this.rock) this.rock.visible = this.state === 'aim' && this.mode === 'alert';
    if (this.wmesh && this.grip) { // drawn when he means to fight, holstered otherwise
      const drawn = !!this.gun || (this.mode === 'alert' && (dist < 9 || this.token)); // gunners patrol at low-ready
      const want = drawn || !this.holster ? this.grip : this.holster;
      if (this.wmesh.parent !== want) { seatWeapon(this.wmesh, want, want === this.grip); if (want === this.grip && this.mode === 'alert') sfx.clang(); }
    }
    weaponPost(this, dt); // weapon pose first (aim ray / swing arc), then the hands on it
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0 && this.wmesh?.userData.flash) this.wmesh.userData.flash.visible = false; }
    if (this.mark) { // ? while suspicious/searching, ! for a moment when alerted
      this.markT -= dt;
      const show = this.mode === 'suspicious' || this.mode === 'search' || this.markT > 0;
      this.mark.visible = show && !this.held;
      if (show) { this.mark.material = this.markT > 0 ? MARKS.x : MARKS.q; this.mark.position.y = 2.35 + Math.sin(this.time * 4) * 0.04; }
    }
    if (this.spawnT > 0) this.rig.root.scale.multiplyScalar(1 - this.spawnT * 0.9);
  }

  // dir: horizontal hit direction from hero; kind: 'slash'|'uppercut'|'dive'
  hit(dir, dmg, kind, hitPos, zone) {
    const G = this.G;
    if (zone) dmg = this.zoneHit(zone, dmg, dir); else this.zoneSever = undefined;
    if (this.mode !== 'alert' && this.hp - dmg > 0) this.alert(false);
    this.hp -= dmg;
    this.flinch = 1; this.flinchDir.copy(dir);
    const kb = kind === 'uppercut' ? 3 : kind === 'dive' ? 7 : 4.5;
    this.vel.x = dir.x * kb; this.vel.z = dir.z * kb;
    if (kind === 'uppercut') { this.vel.y = 10.5; this.grounded = false; }
    else if (!this.grounded) this.vel.y = Math.max(this.vel.y, 4.2); // juggle
    dropToken(G, this);
    if (this.state === 'down' && this.grounded && kind !== 'uppercut') { this.t = Math.max(this.t, 0.6); this.vel.set(0, 0, 0); }
    else { this.state = 'stagger'; this.t = kind === 'uppercut' ? 0.9 : 0.42; }
    if (this.hp > 0 && this.hp < this.maxHp * 0.35 && (kind === 'dive' || kind === 'heavy') && this.grounded) { this.state = 'down'; this.t = 1.8; }
    if (kind === 'uppercut' || kind === 'dive' || kind === 'heavy') this.openT = 1.4; // opened up
    // he fights back: a good share of hits that don't floor him are answered with a fast counter
    if (this.hp > 0 && this.mode === 'alert' && this.state === 'stagger' && this.type !== 'thrower' && this.type !== 'gunner' && this.canAttack() && Math.random() < 0.38 && kind !== 'uppercut') {
      this.state = 'counter'; this.t = 0.22 + Math.random() * 0.12; this.vel.multiplyScalar(0.4);
      if (!G.meleeToken || G.meleeToken === this || !G.meleeToken.alive) { G.meleeToken = this; this.token = 'melee'; }
    }
    if (this.hp > 0 && this.downNext) { this.downNext = false; this.state = 'down'; this.t = 2.2; this.vel.set(0, 0, 0); }
    const spray = dir.clone().setY(0.35).normalize();
    G.fx.blood(hitPos, spray, kind === 'slash' ? 26 : 50, kind === 'slash' ? 6 : 9, 0.55);
    if (this.hp <= 0) this.die(dir, kind, hitPos, this.zoneSever);
    return this.hp <= 0;
  }

  // what an aimed claw does to each part: head/neck kill, arms drop the guard then come off, legs limp then kneel
  zoneHit(zone, dmg, dir) {
    const side = zone.endsWith('L') ? 'L' : zone.endsWith('R') ? 'R' : null;
    this.zoneSever = undefined;
    if ((zone === 'head' || zone === 'neck') && this.guarding()) { // forearms up: the claws bite the arm instead
      const s = !this.armLost.L ? 'L' : 'R'; this.G.fx.sparksAt(this.center.clone().add(new THREE.Vector3(0, 0.45, 0)), dir.clone().negate(), 8, 0.8);
      zone = 'larm' + s; dmg = 8;
    }
    if (zone === 'head' || zone === 'neck') { this.zoneSever = zone === 'neck' || Math.random() < 0.35 ? ['head'] : []; return this.hp + 1; }
    if (side && /^(uarm|larm|armpit)/.test(zone)) {
      if (this.armHurt[side] > 0 && !this.armLost[side]) {
        const seg = zone.startsWith('larm') ? 'larm' + side : 'uarm' + side;
        if (this.hp - dmg > 0) { this.sever(seg, dir.clone().multiplyScalar(4).add(new THREE.Vector3(0, 4, 0))); this.armLost[side] = true; }
        else this.zoneSever = [seg];
      }
      this.armHurt[side] = 4; this.guardT = 1.6;
      if (this.state === 'windup' || this.state === 'strike') { this.state = 'stagger'; this.t = 0.6; }
    } else if (side) { // legs
      this.legHurt[side]++;
      if (this.legHurt.L + this.legHurt.R >= 2 && this.grounded) { this.downNext = true; }
    } else if (zone === 'gut') this.G.fx.bleed(this.rig.m.torso, new THREE.Vector3(0, -0.15, 0.14), new THREE.Vector3(0, -0.6, 1), 3, 14, false, 0.4);
    return dmg;
  }
  // --- stealth ---
  canSeePoint(p, range = SEE) {
    const eye = _e.set(this.pos.x, this.pos.y + 1.65, this.pos.z), d = _d.subVectors(p, eye), dist = d.length();
    if (dist > range) return false;
    const flat = Math.hypot(d.x, d.z);
    if (dist > 1.4) {
      const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);
      if ((d.x * fx + d.z * fz) / (flat || 1) < CONE) return false;           // outside the vision cone
      if (Math.atan2(d.y, flat) > (this.mode === 'unaware' ? 0.5 : 0.9)) return false; // nobody looks up
    }
    d.divideScalar(dist || 1);
    return rayWorld(eye.clone(), d.clone(), dist) >= dist - 0.35;            // line of sight
  }
  heroVisible() {
    const h = this.G.hero; if (h.dead || h.fin) return false;
    const f = h.stealthFactor ? h.stealthFactor() : { range: 1 }, R = SEE * f.range * (this.mode === 'unaware' ? 1 : 1.2) * (this.seeK || 1);
    const top = h.pos.y + (h.crouching ? 1.15 : 1.75);
    return this.canSeePoint(h.center, R) || this.canSeePoint(new THREE.Vector3(h.pos.x, top, h.pos.z), R);
  }
  alert(shout = true) {
    if (this.mode === 'alert' || !this.alive) return;
    const G = this.G;
    this.mode = 'alert'; this.aware = 1; this.state = 'chase'; this.markT = 1.4; this.lastKnown = G.hero.pos.clone(); sfx.grunt();
    if (shout) for (const o of G.enemies) if (o !== this && o.mode !== 'alert' && o.pos.distanceTo(this.pos) < 12) o.alert(false);
  }
  hear(p, loud, k) { // k: 0 = right next to it .. 1 = edge of the sound
    if (this.mode === 'alert' || this.held) return;
    this.aware = Math.max(this.aware, loud ? (k < 0.4 ? 1 : 0.75) : 0.45);
    this.lastKnown = p.clone();
    if (this.aware >= 1) this.alert();
    else if (this.mode === 'unaware') { this.mode = 'suspicious'; this.suspT = 1.3; }
    else if (this.mode === 'search') this.searchT = 4;
  }
  stealthAI(dt, want) {
    const G = this.G, h = G.hero;
    let face = this.yaw, headY = 0;
    this.senseT -= dt;
    if (this.senseT <= 0) {
      this.senseT = 0.1;
      this.seesHero = this.heroVisible();
      if (this.mode === 'unaware' || this.mode === 'search') for (const rd of G.ragdolls) { // found a body
        if (rd === h.rd || (rd.foundBy && rd.foundBy.has(this))) continue;
        const p = rd.coreObj.position; if (p.distanceTo(this.pos) > 14 || !this.canSeePoint(p)) continue;
        (rd.foundBy = rd.foundBy || new Set()).add(this);
        this.aware = Math.max(this.aware, 0.6); this.lastKnown = p.clone(); this.mode = 'search'; this.searchT = 5; this.markT = 0; sfx.grunt();
      }
    }
    if (this.seesHero) {
      const d = this.pos.distanceTo(h.pos), sprint = Math.hypot(h.vel.x, h.vel.z) > 7;
      const gain = (d < 3 ? 6 : 1.9 - (d / SEE) * 1.4) * (sprint ? 1.5 : 1) * (this.mode === 'unaware' ? 1 : 1.5) * (h.stealthFactor ? h.stealthFactor().gain : 1);
      this.aware += dt * gain; this.lastKnown = h.pos.clone();
      if (this.aware >= 1) { this.alert(); return { face, headY }; }
      if (this.mode === 'unaware' && this.aware > 0.3) { this.mode = 'suspicious'; this.suspT = 1.3; }
    } else this.aware = Math.max(0, this.aware - dt * (this.mode === 'unaware' ? 0.15 : 0.06));
    const lookAt = p => Math.atan2(p.x - this.pos.x, p.z - this.pos.z);
    if (this.mode === 'unaware') { // patrol: walk his route (or between points near home), pause and look around
      if (!this.wp) {
        this.patrolT -= dt; headY = Math.sin(this.time * 0.9) * 0.6;
        if (!this.wander && !this.patrol && this.postYaw !== undefined) face = this.postYaw;
        if (this.patrolT <= 0 && this.patrol && this.patrol.length) { const q = this.patrol[this.pi % this.patrol.length]; this.pi++; this.wp = new THREE.Vector3(q.x, this.pos.y, q.z); this.wpWait = q.wait; }
        else if (this.patrolT <= 0 && this.wander) for (let k = 0; k < 6; k++) {
          const p = this.home.clone().add(new THREE.Vector3(rnd(-8, 8), 0, rnd(-8, 8)));
          if ((G.inBounds ? G.inBounds(p) : Math.abs(p.x) < 23 && Math.abs(p.z) < 23) && !pointInBox(p.clone().setY(this.pos.y + 1))) { this.wp = p; break; }
        }
      } else {
        const d = new THREE.Vector3(this.wp.x - this.pos.x, 0, this.wp.z - this.pos.z), L = d.length();
        if (L < 0.4 || this.stuckT > 3) { this.wp = null; this.patrolT = this.wpWait ?? rnd(1.5, 3.5); this.wpWait = undefined; this.stuckT = 0; }
        else { want.copy(d.normalize().multiplyScalar(1.5)); face = Math.atan2(d.x, d.z); this.stuckT = (this.stuckT || 0) + (Math.hypot(this.vel.x, this.vel.z) < 0.3 ? dt : 0); }
      }
    } else if (this.mode === 'suspicious') { // stop, stare toward what he noticed
      if (this.lastKnown) face = lookAt(this.lastKnown);
      this.suspT -= dt;
      if (this.suspT <= 0) { this.mode = 'search'; this.searchT = 4.5; }
    } else if (this.mode === 'search') { // go and look
      if (this.lastKnown) {
        const d = new THREE.Vector3(this.lastKnown.x - this.pos.x, 0, this.lastKnown.z - this.pos.z), L = d.length();
        if (L > 1.2) { want.copy(d.normalize().multiplyScalar(2.6)); face = Math.atan2(d.x, d.z); }
        else { this.lastKnown = null; }
      } else { headY = Math.sin(this.time * 1.6) * 0.9; this.searchT -= dt; }
      if (this.searchT <= 0) { this.mode = 'unaware'; this.aware = Math.min(this.aware, 0.15); if (this.wander && !this.patrol) this.home = this.pos.clone(); this.wp = null; }
    }
    return { face, headY };
  }

  // scientist: never fights. With an alarm point he runs for it and raises the alarm (G.onAlarm); otherwise he
  // flees from you and cowers on his knees when you close in
  civAI(dt, want, to, dist) {
    const G = this.G; let face = this.yaw, crouch = 0;
    const a = this.opts.alarm;
    if (a && !this.alarmed) {
      const d = new THREE.Vector3(a[0] - this.pos.x, 0, a[1] - this.pos.z), L = d.length();
      if (L < 0.8) { this.alarmed = true; G.onAlarm?.(this); sfx.alarm?.(); this.markT = 2; }
      else { want.copy(d.normalize().multiplyScalar(this.speed * 1.1)); face = Math.atan2(d.x, d.z); }
      return { face, crouch };
    }
    if (dist < 3.2) { crouch = 0.7; face = Math.atan2(to.x, to.z); return { face, crouch }; }
    if (dist < 16) {
      want.copy(to).multiplyScalar(-this.speed);
      const p = this.pos.clone().addScaledVector(to, -1.2); p.y += 1;
      if (pointInBox(p)) want.set(-to.z, 0, to.x).multiplyScalar(this.speed * this.side); // cornered: run along the wall
      face = Math.atan2(want.x, want.z);
    }
    return { face, crouch };
  }
  // a healthy, facing, alert brute keeps his forearms up: head and neck are covered until you open him up
  guarding() {
    if (this.type === 'thrower' || this.type === 'scientist' || this.guardT > 0 || !this.canAttack() || (this.aware !== undefined && this.aware < 1)) return false;
    if (!['circle', 'approach', 'chase', 'recover'].includes(this.state)) return false;
    const h = this.G.hero, f = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), to = new THREE.Vector3(h.pos.x - this.pos.x, 0, h.pos.z - this.pos.z).normalize();
    return f.dot(to) > 0.3;
  }
  // --- melee combos ---
  sgn(M) { return this.useArm(M) === 'L' ? 1 : -1; }
  useArm(M) { const want = M.arm || 'R'; const ok = s => !this.armLost[s] && !(this.armHurt[s] > 0); return ok(want) ? want : want === 'L' ? 'R' : 'L'; }
  armDir(M, v) { const d = v.clone(); if (this.useArm(M) !== (M.arm || 'R')) d.x = -d.x; return d; } // mirrored when the other arm has to do it
  startCombo(fast = false) {
    const kit = this.opts?.kit || KITS[this.weapon || 'fists'] || KITS.fists;
    this.combo = kit[Math.floor(Math.random() * kit.length)]; this.ci = 0; this.move = MOVES[this.combo[0]];
    this.feint = !fast && Math.random() < 0.2; this.feinted = false;
    this.state = 'windup'; this.t = this.move.w * (fast ? 0.6 : 1); this.glint(); sfx.grunt();
  }
  glint() { // telegraph flash at the striking hand/weapon (brighter for guard breakers and guns)
    const G = this.G; this.rig.root.updateMatrixWorld(true);
    const p = (this.wmesh || this.rig.m.handR).getWorldPosition(new THREE.Vector3());
    const big = (this.move && this.move.guardBreak) || this.weapon === 'gun';
    G.fx.sparksAt(p, new THREE.Vector3(0, 1, 0), big ? 10 : 4, big ? 0.5 : 0.3);
  }
  aimLaser(on) {
    if (!this.laser) return; this.laser.visible = on; if (!on) return;
    const G = this.G; this.rig.root.updateMatrixWorld(true);
    const p = (this.wmesh.userData.muzzle || this.wmesh).getWorldPosition(new THREE.Vector3()), tgt = G.hero.center.clone();
    const d = tgt.sub(p), L = d.length(); d.divideScalar(L || 1);
    const hit = rayWorld(p.clone(), d.clone(), L);
    this.laser.position.copy(p); this.laser.lookAt(p.clone().add(d)); this.laser.scale.set(1, 1, Math.min(L, hit));
    this.laser.material.opacity = 0.25 + Math.abs(Math.sin(this.time * 30)) * 0.4;
  }
  // pistol: one solid round; SMG: a three-round burst; shotgun: a wide close-range blast. Cover stops them,
  // a block deflects them, a parry sends one back.
  fireGun() {
    if (this.gun === 'rifle') { this.shot(14, 0.2); setTimeout(() => this.alive && this.shot(14, 0.3), 110); return; }
    if (this.gun === 'sniper') { this.shot(70, 0.05); return; }
    if (this.gun === 'smg') { this.shot(9, 0.25); setTimeout(() => this.alive && this.shot(9, 0.35), 85); setTimeout(() => this.alive && this.shot(9, 0.45), 170); return; }
    if (this.gun === 'shotgun') { const d = this.pos.distanceTo(this.G.hero.pos); this.shot(Math.round(34 * Math.max(0.2, 1 - d / 9)), 0.2, 6); return; }
    this.shot(18, 0.3);
  }
  shot(dmg, spread, pellets = 1) {
    const G = this.G, hero = G.hero; if (hero.dead) return; this.rig.root.updateMatrixWorld(true);
    const mz = this.wmesh.userData.muzzle || this.wmesh, p = mz.getWorldPosition(new THREE.Vector3());
    if (this.wmesh.userData.flash) { this.wmesh.userData.flash.visible = true; this.wmesh.userData.flash.rotation.z = Math.random() * 6; this.flashT = 0.05; }
    sfx.gun?.(); G.fx.sparksAt(p, hero.center.clone().sub(p).normalize(), 6, 0.8); G.noise?.(this.pos, 18, true); G.shake(0.05);
    let hit = false, tgt0 = null;
    for (let k = 0; k < pellets; k++) {
      const tgt = hero.center.clone().add(new THREE.Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread));
      const d = tgt.clone().sub(p), L = d.length(); d.divideScalar(L);
      const wall = rayWorld(p.clone(), d.clone(), L);
      G.fx.tracer?.(p, wall < L - 0.3 ? p.clone().addScaledVector(d, wall) : tgt);
      if (wall < L - 0.3) { G.fx.sparksAt(p.clone().addScaledVector(d, wall), d.clone().negate(), 5, 0.7); if (k === 0) G.fx.debris(p.clone().addScaledVector(d, wall), d.clone().negate(), 5, 2); continue; }
      hit = true; tgt0 = tgt;
    }
    if (!hit) return;
    const d = tgt0.clone().sub(p).setY(0).normalize();
    if (G.flags?.gunsKill) dmg = 999; // level rule (vents): any round that lands kills; a block still deflects it
    const r = hero.damage(dmg, d, this, { projectile: true });
    if (r === 'parry' && this.alive) { this.hit(d.clone().negate(), 20, 'parry', this.center.clone()); this.parried(); G.fx.tracer?.(tgt0, this.center.clone()); }
  }
  // a gunner moves while he aims: strafes, pushes in, or backs off toward cover (half speed, he keeps you in his sights)
  gunMove(want, to, dist) {
    const sp = this.speed * 0.5;
    if (this.tac === 'hold') return;
    if (this.tac === 'advance' && dist > 6) want.copy(to).multiplyScalar(sp);
    else if (this.tac === 'retreat' && dist < 11) want.copy(to).multiplyScalar(-sp);
    else want.set(-to.z, 0, to.x).multiplyScalar(this.side * sp * 1.2);
  }
  seekCover() { // the far side of the nearest box, relative to the hero
    const G = this.G, h = G.hero.pos; let best = null, bd = 1e9;
    for (const b of (G.coverBoxes || [])) {
      const c = b.min.clone().add(b.max).multiplyScalar(0.5); if (b.max.y < 1.2) continue;
      const away = new THREE.Vector3(c.x - h.x, 0, c.z - h.z).normalize();
      const p = new THREE.Vector3(c.x + away.x * ((b.max.x - b.min.x) / 2 + 0.7), 0, c.z + away.z * ((b.max.z - b.min.z) / 2 + 0.7));
      const d = p.distanceTo(this.pos); if (d < bd && d < 14 && !pointInBox(p.clone().setY(1))) { bd = d; best = p; }
    }
    if (best) { this.coverP = best; this.state = 'cover'; this.t = 3; }
  }
  canAttack() { return (!this.armLost.L && !(this.armHurt.L > 0)) || (!this.armLost.R && !(this.armHurt.R > 0)); }
  parried() { // knocked off balance onto his knees: open to a finisher
    const G = this.G; dropToken(G, this);
    const to = new THREE.Vector3(this.pos.x - G.hero.pos.x, 0, this.pos.z - G.hero.pos.z).normalize();
    this.vel.x = to.x * 5; this.vel.z = to.z * 5; this.flinch = 1;
    this.state = 'down'; this.t = 2.0; this.rock && (this.rock.visible = false);
    G.fx.sparksAt(this.center.clone(), to.clone().negate(), 10, 1);
  }
  throwRock() { // lead the hero a little, lob in an arc
    const G = this.G, hero = G.hero; this.rig.root.updateMatrixWorld(true);
    const from = this.rock.getWorldPosition(new THREE.Vector3());
    const tgt = hero.center.clone().addScaledVector(hero.vel, 0.35);
    const d = tgt.clone().sub(from), flat = Math.hypot(d.x, d.z), T = Math.max(0.45, flat / 17);
    const v = new THREE.Vector3(d.x / T, (d.y + 0.5 * 16 * T * T) / T, d.z / T);
    const m = new THREE.Mesh(projGeo, projMat); m.position.copy(from); m.castShadow = true; G.scene.add(m);
    G.projectiles.push({ m, v, t: 0, from: this, back: false });
    sfx.swoosh(0.9);
  }

  // cut a limb (or the head, or the whole upper body at 'torso') off this rig, alive or dying
  sever(seg, vel, spin) {
    const G = this.G, rig = this.rig;
    if (rig.cut.has(seg)) return null;
    rig.root.updateMatrixWorld(true);
    const jw = rig.j[seg].getWorldPosition(new THREE.Vector3());
    const stump = rig.m[PARENT[seg]];
    const part = new Part(G.scene, G.physics, rig, seg, vel || new THREE.Vector3(0, 4, 0), spin || new THREE.Vector3((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16, (Math.random() - 0.5) * 16), this.rgroup);
    G.parts.push(part);
    if (rig.skin) { const SUB = { head: ['head'], torso: ['torso', 'head', 'uarmL', 'larmL', 'handL', 'uarmR', 'larmR', 'handR'], uarmL: ['uarmL', 'larmL', 'handL'], larmL: ['larmL', 'handL'], uarmR: ['uarmR', 'larmR', 'handR'], larmR: ['larmR', 'handR'], thighL: ['thighL', 'shinL', 'footL'], shinL: ['shinL', 'footL'], thighR: ['thighR', 'shinR', 'footR'], shinR: ['shinR', 'footR'] }[seg] || [seg];
      const baked = rig.skin.cut(SUB); if (baked) part.obj.attach(baked); }
    // arterial jets from the stump (follows the body, alive or ragdolled) and a weaker one from the piece
    const sl = stump.worldToLocal(jw.clone()), sd = sl.clone().sub(new THREE.Vector3()).normalize();
    G.fx.bleed(stump, sl, sd, 3.5, 55);
    const capR = { head: 0.06, torso: 0.15, uarmL: 0.06, uarmR: 0.06, larmL: 0.05, larmR: 0.05, thighL: 0.08, thighR: 0.08, shinL: 0.06, shinR: 0.06 }[seg] || 0.06;
    cutCap(stump, sl, sd, capR);
    const pm = part.main, pl = pm.worldToLocal(jw.clone());
    G.fx.bleed(pm, pl, pl.clone().normalize(), 2, 28);
    cutCap(pm, pl, pl.clone().normalize(), capR);
    G.fx.slashBlood(jw, sd.clone().transformDirection(stump.matrixWorld), 1.3);
    G.fx.gash(stump, jw, new THREE.Vector3(1, 0, 0));
    sfx.hit(true);
    return part;
  }

  die(dir, kind, hitPos, severs) {
    const G = this.G; this.alive = false; dropToken(G, this); if (this.laser) { G.scene.remove(this.laser); this.laser = null; }
    if (this.mark) this.mark.visible = false;
    const at = this.center.clone();
    for (const o of G.enemies) if (o !== this && o.alive && o.mode !== 'alert' && !o.held && o.canSeePoint(at, 22)) o.alert(); // witnessed kill
    const heavy = kind !== 'slash';
    if (!severs) severs = (heavy || Math.random() < 0.4) ? [['head', 'uarmL', 'uarmR', 'larmL', 'larmR', 'thighL'][Math.floor(Math.random() * 6)]] : [];
    for (const s of severs) this.sever(s, new THREE.Vector3(dir.x * 5 + (Math.random() - 0.5) * 3, 4 + Math.random() * 3, dir.z * 5 + (Math.random() - 0.5) * 3));
    const v = new THREE.Vector3(dir.x * (heavy ? 9 : 6), kind === 'uppercut' ? 5.5 : 2, dir.z * (heavy ? 7 : 4.5));
    v.y += Math.min(3, Math.max(0, this.vel.y) * 0.3);
    if (kind === 'finisher') v.multiplyScalar(0.4);
    const rd = new Ragdoll(G.scene, G.physics, this.rig, v, { seg: 'torso', dir: dir.clone().setY(0.4).normalize(), power: heavy ? 70 : 40 }, this.rgroup);
    G.ragdolls.push(rd);
    if (severs.length) G.fx.blood(hitPos, dir.clone().setY(0.6).normalize(), 70, 8, 0.6);
    rd.poolPending = 1.2;
    G.scene.remove(this.rig.root);
    return rd;
  }
}
