// Enemy soldiers: Rocketbox military avatars (helmets + plate carriers) with Rocketbox mocap for
// locomotion, procedural rifle hold (two-bone arm IK onto the weapon grips, spine aim), per-bone
// capsule hitboxes (head = instant kill), verlet ragdoll on death.
// AI: every soldier fights for a team (TDM) or alone (FFA, unique team): it hunts across the map,
// hears gunfire, picks the nearest enemy it can see (player, bot or online player), takes cover (auto
// cover points), peeks, suppresses, flanks, retreats when hurt, throws frags / flashbangs / smoke and
// shares the enemy's last known position over the squad (team) net. Flashbangs blind it, smoke blocks
// its sight. Respawn reuses the soldier (bind pose restored). Difficulty scales reaction, accuracy, damage.
import * as THREE from 'three';
import { safeMerge } from '../core/geom.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { gltf, tex, fetchJSON, rng } from '../core/assets.js';
import { buildWeapon } from './manifest.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const UP = new THREE.Vector3(0, 1, 0);
// target points on any combatant: the local player (isPlayer) or another soldier
export const chestOf = (a, out) => a.isPlayer ? out.set(a.pos.x, a.pos.y + a.h * 0.55, a.pos.z) : out.copy(a.center);
export const headOf = (a, out) => a.isPlayer ? out.set(a.camPos.x, a.camPos.y - 0.05, a.camPos.z) : out.copy(a.headC);
const stanceOf = a => a.isPlayer ? a.stance : a.crouch > 0.5 ? 'crouch' : 'stand';
const speedOf = a => a.isPlayer ? a.speed : a.moveSpeed || 0;
const _e = new THREE.Vector3(), _h = new THREE.Vector3(), _c = new THREE.Vector3();

export const DIFFICULTY = [
  { name: 'Recruit', react: [0.9, 1.5], spread: 3.6, dmg: 8, aware: 0.7, hp: 100, burstPause: [0.9, 1.8], headChance: 0, count: 0.75, flank: 0.3 },
  { name: 'Regular', react: [0.5, 0.95], spread: 2.4, dmg: 13, aware: 1.0, hp: 100, burstPause: [0.6, 1.3], headChance: 0.03, count: 1, flank: 0.6 },
  { name: 'Veteran', react: [0.3, 0.6], spread: 1.6, dmg: 19, aware: 1.4, hp: 110, burstPause: [0.45, 1.0], headChance: 0.08, count: 1.15, flank: 0.9 },
  { name: 'Realism', react: [0.22, 0.45], spread: 1.2, dmg: 34, aware: 1.7, hp: 100, burstPause: [0.4, 0.9], headChance: 0.12, count: 1.25, flank: 1 },
];
const CALLOUTS = {
  spot: ['Contact!', 'Contact front!', 'Got eyes on him!', 'Enemy spotted!', 'There he is!'],
  hurt: ['I\'m hit!', 'Taking fire!', 'Man down, man down!'],
  flank: ['Moving to flank!', 'I\'ll go around!', 'Flanking left!', 'Going wide!'],
  suppress: ['Suppressing!', 'Keep his head down!', 'Covering fire!'],
  reload: ['Reloading!', 'Changing mags!', 'Cover me, reloading!'],
  lost: ['Lost visual!', 'Where\'d he go?', 'Anyone have eyes?'],
  heard: ['Shots fired!', 'Did you hear that?', 'Gunfire, check it out!'],
  retreat: ['Falling back!', 'Pulling back!'],
  down: ['We lost one!', 'Man down!'],
  frag: ['Frag out!', 'Grenade!'], flash: ['Flashbang out!', 'Flash out!'], smoke: ['Popping smoke!', 'Smoke out!'],
};

// ---------------------------------------------------------------- math helpers
// ray (o,d) vs capsule a-b radius r -> t or Infinity
function rayCapsule(o, d, a, b, r) {
  const ba = _c1.subVectors(b, a), oa = _c2.subVectors(o, a);
  const baba = ba.dot(ba), bard = ba.dot(d), baoa = ba.dot(oa), rdoa = d.dot(oa), oaoa = oa.dot(oa);
  const A = baba - bard * bard, B = baba * rdoa - baoa * bard, C = baba * oaoa - baoa * baoa - r * r * baba;
  let h = B * B - A * C;
  if (h >= 0 && A > 1e-9) {
    const t = (-B - Math.sqrt(h)) / A, y = baoa + t * bard;
    if (y > 0 && y < baba) return t;
    const oc = y <= 0 ? oa : _c3.subVectors(o, b);
    const b2 = d.dot(oc), c2 = oc.dot(oc) - r * r; h = b2 * b2 - c2;
    if (h > 0) return -b2 - Math.sqrt(h);
  } else {
    // parallel: test end spheres
    for (const e of [a, b]) { const oc = _c3.subVectors(o, e); const b2 = d.dot(oc), c2 = oc.dot(oc) - r * r; const hh = b2 * b2 - c2; if (hh > 0) return -b2 - Math.sqrt(hh); }
  }
  return Infinity;
}
const _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3(), _c3 = new THREE.Vector3();
function raySphere(o, d, c, r) { const oc = _c1.subVectors(o, c); const b = d.dot(oc), cc = oc.dot(oc) - r * r, h = b * b - cc; return h < 0 ? Infinity : -b - Math.sqrt(h); }
// rotate a bone by a world-space delta rotation
function worldRotate(bone, delta) {
  bone.parent.updateWorldMatrix(true, false);
  bone.getWorldQuaternion(_q2);
  _q3.copy(delta).multiply(_q2);
  bone.parent.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q3));
  bone.updateMatrixWorld(true);
}
function alignBone(bone, childWorld, targetDir, weight = 1) {
  const bp = bone.getWorldPosition(_v3);
  const cur = _v4.subVectors(childWorld, bp).normalize();
  if (cur.lengthSq() < 1e-8) return;
  _q.setFromUnitVectors(cur, targetDir);
  if (weight < 1) _q.slerp(new THREE.Quaternion(), 1 - weight);
  worldRotate(bone, _q);
}
const keepBones = (clip, names, name) => new THREE.AnimationClip(name || clip.name, clip.duration, clip.tracks.filter(t => names.has(t.name.slice(0, t.name.lastIndexOf('.')))));
function inPlace(clip) {
  const tr = clip.tracks.find(t => t.name === 'Bip01.position');
  if (!tr) return 0;
  const v = tr.values, n = v.length / 3, T = tr.times[n - 1] - tr.times[0];
  const d = [v[(n - 1) * 3] - v[0], v[(n - 1) * 3 + 1] - v[1], v[(n - 1) * 3 + 2] - v[2]];
  const speed = Math.hypot(d[0], d[2]) / T;
  for (let i = 0; i < n; i++) { const k = (tr.times[i] - tr.times[0]) / T; v[i * 3] -= d[0] * k; v[i * 3 + 2] -= d[2] * k; }
  return speed;
}

// ---------------------------------------------------------------- hitbox layout (bone, child, radius, zone)
const HITBOX = [
  ['Pelvis', 'Spine1', 0.16, 'stomach'], ['Spine1', 'Neck', 0.17, 'chest', 0, 0.62], ['Neck', 'Head', 0.06, 'neck', 0.2, 0.9],
  ['L_UpperArm', 'L_Forearm', 0.06, 'arm'], ['R_UpperArm', 'R_Forearm', 0.06, 'arm'], ['L_Forearm', 'L_Hand', 0.05, 'arm'], ['R_Forearm', 'R_Hand', 0.05, 'arm'],
  ['L_Thigh', 'L_Calf', 0.09, 'leg'], ['R_Thigh', 'R_Calf', 0.09, 'leg'], ['L_Calf', 'L_Foot', 0.065, 'leg'], ['R_Calf', 'R_Foot', 0.065, 'leg'],
];
export const ZONE_MULT = { head: Infinity, neck: 1.6, chest: 1.0, stomach: 0.9, arm: 0.6, leg: 0.65 };

// ---------------------------------------------------------------- ragdoll
const RAG = ['Pelvis', 'Spine2', 'Head', 'HeadTop', 'L_UpperArm', 'L_Forearm', 'L_Hand', 'R_UpperArm', 'R_Forearm', 'R_Hand', 'L_Thigh', 'L_Calf', 'L_Foot', 'R_Thigh', 'R_Calf', 'R_Foot'];
const RAG_LINKS = [['Pelvis', 'Spine2'], ['Spine2', 'Head'], ['Head', 'HeadTop'], ['Spine2', 'L_UpperArm'], ['Spine2', 'R_UpperArm'], ['L_UpperArm', 'R_UpperArm'], ['L_UpperArm', 'L_Forearm'], ['L_Forearm', 'L_Hand'], ['R_UpperArm', 'R_Forearm'], ['R_Forearm', 'R_Hand'],
  ['Pelvis', 'L_Thigh'], ['Pelvis', 'R_Thigh'], ['L_Thigh', 'R_Thigh'], ['L_Thigh', 'L_Calf'], ['L_Calf', 'L_Foot'], ['R_Thigh', 'R_Calf'], ['R_Calf', 'R_Foot'],
  ['L_UpperArm', 'Pelvis'], ['R_UpperArm', 'Pelvis'], ['L_Thigh', 'Spine2'], ['R_Thigh', 'Spine2'], ['Head', 'L_UpperArm'], ['Head', 'R_UpperArm'], ['HeadTop', 'Spine2'], ['L_Thigh', 'R_UpperArm'], ['R_Thigh', 'L_UpperArm']];
class Ragdoll {
  constructor(npc, dir, point, power, world) {
    this.npc = npc; this.world = world; this.t = 0; this.sleep = false;
    const B = npc.B;
    npc.obj.updateMatrixWorld(true);
    this.P = {};
    const vel = npc.vel.clone();
    const headTop = B.Head.localToWorld(npc.headTopLocal.clone());
    for (const n of RAG) {
      const p = n === 'HeadTop' ? headTop : B[n].getWorldPosition(new THREE.Vector3());
      this.P[n] = { p, o: p.clone().addScaledVector(vel, -1 / 60), r: n === 'Head' || n === 'HeadTop' ? 0.1 : n === 'Pelvis' || n === 'Spine2' ? 0.13 : 0.06, m: n === 'Pelvis' || n === 'Spine2' ? 3 : 1 };
    }
    this.L = RAG_LINKS.map(([a, b]) => [this.P[a], this.P[b], this.P[a].p.distanceTo(this.P[b].p)]);
    // impulse at the hit: particles near the hit point get pushed along the bullet
    for (const n of RAG) {
      const q = this.P[n]; const d = q.p.distanceTo(point);
      const k = Math.max(0, 1 - d / 0.6) * power / q.m;
      q.o.addScaledVector(dir, -k / 60);
    }
    // knees buckle: a small backward lean so bodies crumple instead of standing
    this.P.Spine2.o.addScaledVector(dir, -0.4 / 60); this.P.Head.o.addScaledVector(dir, -0.6 / 60);
    this.P.L_Calf.o.y += 0.5 / 60; this.P.R_Calf.o.y += 0.5 / 60;
    this.boneList = ['L_UpperArm', 'L_Forearm', 'R_UpperArm', 'R_Forearm', 'L_Thigh', 'L_Calf', 'R_Thigh', 'R_Calf'];
    this.child = { L_UpperArm: 'L_Forearm', L_Forearm: 'L_Hand', R_UpperArm: 'R_Forearm', R_Forearm: 'R_Hand', L_Thigh: 'L_Calf', L_Calf: 'L_Foot', R_Thigh: 'R_Calf', R_Calf: 'R_Foot' };
  }
  step(dt) {
    if (this.sleep) return;
    this.t += dt;
    const g = 9.8 * dt * dt, W = this.world;
    let energy = 0;
    for (const n in this.P) {
      const q = this.P[n];
      const vx = (q.p.x - q.o.x) * 0.985, vy = (q.p.y - q.o.y) * 0.985, vz = (q.p.z - q.o.z) * 0.985;
      energy += vx * vx + vy * vy + vz * vz;
      q.o.copy(q.p); q.p.x += vx; q.p.y += vy - g; q.p.z += vz;
    }
    for (let it = 0; it < 8; it++) {
      for (const [a, b, L] of this.L) {
        const dx = b.p.x - a.p.x, dy = b.p.y - a.p.y, dz = b.p.z - a.p.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const k = (d - L) / d, wa = b.m / (a.m + b.m), wb = a.m / (a.m + b.m);
        a.p.x += dx * k * wa; a.p.y += dy * k * wa; a.p.z += dz * k * wa;
        b.p.x -= dx * k * wb; b.p.y -= dy * k * wb; b.p.z -= dz * k * wb;
      }
      // collide with the world boxes
      for (const n in this.P) {
        const q = this.P[n], r = q.r;
        W.query(q.p.x - r, q.p.z - r, q.p.x + r, q.p.z + r, bx => {
          if (!bx.solid) return;
          const p = q.p;
          if (p.x < bx.min.x - r || p.x > bx.max.x + r || p.y < bx.min.y - r || p.y > bx.max.y + r || p.z < bx.min.z - r || p.z > bx.max.z + r) return;
          const pens = [p.x - (bx.min.x - r), (bx.max.x + r) - p.x, p.y - (bx.min.y - r), (bx.max.y + r) - p.y, p.z - (bx.min.z - r), (bx.max.z + r) - p.z];
          let mi = 0; for (let i = 1; i < 6; i++) if (pens[i] < pens[mi]) mi = i;
          const ax = mi >> 1, s = mi & 1 ? 1 : -1;
          p.setComponent(ax, p.getComponent(ax) + s * pens[mi]);
          // friction
          q.o.x += (p.x - q.o.x) * 0.25; q.o.z += (p.z - q.o.z) * 0.25; if (ax !== 1) q.o.y += (p.y - q.o.y) * 0.25;
        });
      }
    }
    if (this.t > 3 && energy < 1e-6) this.sleep = true;
    if (this.t > 8) this.sleep = true;
    this.apply();
  }
  apply() {
    const npc = this.npc, B = npc.B, P = this.P;
    // pelvis position + body orientation from pelvis->chest and the shoulder line
    const pel = B.Pelvis;
    const local = pel.parent.worldToLocal(P.Pelvis.p.clone());
    pel.position.copy(local); pel.updateMatrixWorld(true);
    alignBone(pel, B.Spine2.getWorldPosition(new THREE.Vector3()), _v.subVectors(P.Spine2.p, P.Pelvis.p).normalize());
    // twist so the shoulders line up
    {
      const axis = _v.subVectors(P.Spine2.p, P.Pelvis.p).normalize();
      const cur = B.R_UpperArm.getWorldPosition(new THREE.Vector3()).sub(B.L_UpperArm.getWorldPosition(new THREE.Vector3()));
      const des = _v2.subVectors(P.R_UpperArm.p, P.L_UpperArm.p);
      cur.addScaledVector(axis, -cur.dot(axis)).normalize(); des.addScaledVector(axis, -des.dot(axis)).normalize();
      if (cur.lengthSq() > 0.5 && des.lengthSq() > 0.5) { _q.setFromUnitVectors(cur, des); worldRotate(pel, _q); }
    }
    alignBone(B.Head, B.Head.localToWorld(npc.headTopLocal.clone()), _v.subVectors(P.HeadTop.p, P.Head.p).normalize());
    for (const n of this.boneList) {
      const c = this.child[n];
      alignBone(B[n], B[c].getWorldPosition(new THREE.Vector3()), _v.subVectors(P[c].p, P[n].p).normalize());
    }
  }
}

// ---------------------------------------------------------------- manager
export class NPCManager {
  constructor(scene, world, fx, audio) {
    this.scene = scene; this.world = world; this.fx = fx; this.audio = audio;
    this.list = []; this.bases = []; this.guns = {}; this.squads = new Map();
    this.diff = DIFFICULTY[1]; this.R = rng(777);
    this.callout = null; // fn(text, npc)
    this.onKill = null;
    this.contact = null;
  }
  async load() {
    if (this.bases.length) return;
    const idx = (await fetchJSON('people/soldiers.json')) || [{ name: 'Military_Male_01', g: 'm', parts: ['body', 'head', 'helmet', 'equipment'] }];
    const anim = async f => (await gltf(`people/anims/${f}.glb`)).animations[0];
    const A = {};
    for (const g of ['m', 'f']) for (const k of ['walk_neutral_01', 'walk_fast_01', 'run_slow_01', 'idle_neutral_01', 'crouch_idle']) A[g + '_' + k] = await anim(g + '_' + k).catch(() => null);
    this.bases = await Promise.all(idx.map(async ({ name, g, parts }) => {
      const model = await gltf(`people/${name}/model.glb`);
      const root = model.scene, dir = `people/${name}/`, mats = {};
      root.traverse(o => {
        if (!o.isMesh) return;
        const mn = o.material.name, part = (mn.split('_').slice(1).join('_') || 'body').toLowerCase();
        let m = mats[mn];
        if (!m) {
          const has = parts.includes(part) ? part : 'body';
          const P = { map: tex(dir + has + '.jpg', { srgb: true }), normalMap: tex(dir + has + '_n.jpg'), roughness: part === 'helmet' ? 0.6 : part === 'equipment' ? 0.75 : part === 'head' ? 0.5 : 0.85 };
          m = part === 'head' ? new THREE.MeshPhysicalMaterial({ ...P, sheen: 0.25, sheenColor: 0x886655 }) : new THREE.MeshStandardMaterial({ ...P, metalness: part === 'combat_knife' || part === 'pistol' ? 0.6 : 0 });
          for (const t of [m.map, m.normalMap]) { t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.flipY = false; }
          m.envMapIntensity = 0.8; mats[mn] = m;
        }
        o.material = m; o.castShadow = true; o.receiveShadow = true;
        if (part === 'pistol' || part === 'combat_knife') o.visible = part === 'combat_knife';
      });
      const names = new Set(); root.traverse(o => names.add(o.name));
      const loc = {};
      for (const [k, f] of [['walk', 'walk_neutral_01'], ['fast', 'walk_fast_01'], ['run', 'run_slow_01']]) { const c = (A[g + '_' + f] || A['m_' + f]).clone(); loc[k] = { speed: inPlace(c), clip: keepBones(c, names, k) }; }
      const idle = keepBones(A[g + '_idle_neutral_01'] || A.m_idle_neutral_01, names, 'idle');
      const crouchSrc = A[g + '_crouch_idle'] || A.m_crouch_idle;
      const crouch = crouchSrc ? keepBones(crouchSrc, names, 'crouch') : idle;
      root.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(root);
      const probe = SkeletonUtils.clone(root); probe.updateMatrixWorld(true);
      const pos = n => probe.getObjectByName('Bip01_' + n).getWorldPosition(new THREE.Vector3());
      const fwd = pos('R_Toe0').sub(pos('R_Foot')).setY(0).normalize();
      return { name, g, root, box, yaw: Math.atan2(fwd.x, fwd.z), clips: { idle, crouch, walk: loc.walk.clip, fast: loc.fast.clip, run: loc.run.clip }, speeds: { walk: loc.walk.speed, fast: loc.fast.speed, run: loc.run.speed } };
    }));
    // enemy weapons: placeholder (or armory) rifles, cloned per soldier
    for (const id of ['m4', 'ak', 'mp5']) {
      try { const w = await buildWeapon({ gun: id, optic: 'none_optic', muzzle: 'none_muzzle', laser: 'none_laser', camo: 'black' }); w.npcRoot = flatGun(w); this.guns['_' + id] = w; } catch (e) { console.warn('[npc] gun', id, e.message); }
    }
  }
  // the soldier gun is the owner's real build (attachments + camo), merged flat; cached per build
  gunFor(cfg) {
    const key = JSON.stringify(['gun', 'optic', 'rail', 'muzzle', 'laser', 'underbarrel', 'mag', 'stock', 'camo'].map(k => cfg[k]));
    if (!this.guns[key]) this.guns[key] = buildWeapon(cfg).then(w => { w.npcRoot = flatGun(w); return w; }).catch(e => { console.warn('[npc] gun', e.message); return null; });
    return this.guns[key];
  }
  setDifficulty(i) { this.diff = DIFFICULTY[i] || DIFFICULTY[1]; }
  clear() {
    for (const n of this.list) { this.scene.remove(n.holder); if (n.gunObj?.parent === this.scene) this.scene.remove(n.gunObj); }
    this.list = []; this.squads.clear();
  }
  get alive() { return this.list.filter(n => n.alive); }
  spawn(o) {
    const base = this.bases[o.base ?? (this.list.length * 3) % this.bases.length];
    const n = new NPC(this, base, o);
    if (o.gun) n.setGun(o.gun);
    this.list.push(n);
    let sq = this.squads.get(o.squad ?? 0); if (!sq) this.squads.set(o.squad ?? 0, sq = { members: [], lastKnown: null, lastTime: -99, flanker: null, alerted: false });
    sq.members.push(n); n.squad = sq;
    return n;
  }
  // nearest hit between t=0..maxT along a ray, against living NPC hitboxes
  // skipTeam / skipOwner: a bullet never hits its shooter or (friendly fire off) the shooter's team
  raycast(o, d, maxT, skipTeam, skipOwner) {
    let best = null;
    for (const n of this.list) {
      if (!n.alive || n === skipOwner || (skipTeam != null && n.team === skipTeam)) continue;
      // bounding sphere precheck
      const c = n.center; const t0 = raySphere(o, d, c, 1.15);
      if (t0 === Infinity || t0 > maxT) { const oc = _v.subVectors(o, c); if (oc.lengthSq() > 1.4) continue; }
      const h = n.hitTest(o, d, best ? best.t : maxT);
      if (h) best = h;
    }
    return best;
  }
  // gunfire / noise: everyone in radius hears it
  noise(pos, radius, kind, src, who) {
    for (const n of this.list) if (n.alive) n.hear(pos, radius, kind, src, who);
  }
  update(dt, ctx) {
    this.clock = (this.clock || 0) + dt;
    for (const sq of this.squads.values()) { if (sq.flanker && !sq.flanker.alive) sq.flanker = null; if (sq.lastTarget && !sq.lastTarget.alive) { sq.lastTarget = null; sq.lastKnown = null; } }
    for (const n of this.list) n.update(dt, ctx);
  }
}

class NPC {
  constructor(mgr, base, o) {
    this.mgr = mgr; this.base = base; this.world = mgr.world;
    this.obj = SkeletonUtils.clone(base.root);
    const h = base.box.max.y - base.box.min.y, height = (base.g === 'f' ? 1.7 : 1.8) * (0.97 + Math.random() * 0.06), s = height / h;
    this.holder = new THREE.Group(); this.inner = new THREE.Group();
    this.inner.rotation.y = -base.yaw; this.obj.scale.setScalar(s); this.obj.position.y = -base.box.min.y * s;
    this.inner.add(this.obj); this.holder.add(this.inner);
    mgr.scene.add(this.holder);
    this.scale = s;
    const B = this.B = {};
    for (const n of ['Pelvis', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'L_Clavicle', 'R_Clavicle', 'L_UpperArm', 'R_UpperArm', 'L_Forearm', 'R_Forearm', 'L_Hand', 'R_Hand', 'L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf', 'L_Foot', 'R_Foot', 'R_Finger2', 'L_Finger2']) B[n] = this.obj.getObjectByName('Bip01_' + n);
    this.mixer = new THREE.AnimationMixer(this.obj);
    const C = base.clips;
    this.act = { idle: this.mixer.clipAction(C.idle), walk: this.mixer.clipAction(C.walk), run: this.mixer.clipAction(C.run), crouch: this.mixer.clipAction(C.crouch) };
    for (const a of Object.values(this.act)) { a.play(); a.weight = 0; a.time = Math.random() * a.getClip().duration; }
    this.act.idle.weight = 1;
    // measure arm lengths and the head top offset in the bind pose
    this.obj.updateMatrixWorld(true);
    const wp = b => b.getWorldPosition(new THREE.Vector3());
    this.armLen = { L: [wp(B.L_UpperArm).distanceTo(wp(B.L_Forearm)), wp(B.L_Forearm).distanceTo(wp(B.L_Hand))], R: [wp(B.R_UpperArm).distanceTo(wp(B.R_Forearm)), wp(B.R_Forearm).distanceTo(wp(B.R_Hand))] };
    const headW = wp(B.Head), headTopW = headW.clone().add(new THREE.Vector3(0, 0.22, 0));
    this.headTopLocal = B.Head.worldToLocal(headTopW.clone());
    this.headCenterLocal = B.Head.worldToLocal(headW.clone().add(new THREE.Vector3(0, 0.1, 0.02)));
    // weapon
    const gunId = o.weapon || (['m4', 'ak', 'm4', 'mp5'][Math.floor(Math.random() * 4)]);
    this.team = o.team ?? 'B'; this.id = o.id ?? ('npc' + mgr.list.length); this.name = o.name || 'Hostile'; this.tacType = o.tac || 'flash';
    this.useGun(mgr.guns['_' + gunId] || mgr.guns._m4 || null, gunId);
    // bind pose, restored on respawn (the ragdoll leaves every bone bent)
    this.bind = []; this.obj.traverse(b => { if (b.isBone || /^Bip01/.test(b.name)) this.bind.push([b, b.position.clone(), b.quaternion.clone()]); });
    // state
    this.pos = new THREE.Vector3(o.pos[0], o.pos[1] ?? 0, o.pos[2]); this.vel = new THREE.Vector3(); this.yaw = o.yaw ?? 0; this.aimYaw = this.yaw; this.aimPitch = 0;
    this.hp = mgr.diff.hp; this.alive = true; this.zoneLast = null;
    this.patrol = (o.patrol || []).map(p => new THREE.Vector3(p[0], 0, p[1])); this.patrolIdx = 0; this.waitT = Math.random() * 3;
    this.state = o.state || 'patrol';
    this.aware = 0; this.target = null; this.lastSeen = -99; this.lastKnown = null; this.reactT = 0; this.canSee = false;
    this.path = null; this.pathI = 0; this.pathGoal = null; this.repath = 0;
    this.cover = null; this.coverPhase = 'move'; this.phaseT = 0; this.peekOffset = new THREE.Vector3();
    this.burst = 0; this.fireCD = 0; this.mag = 30; this.reloadT = 0; this.suppression = 0; this.thinkT = Math.random() * 0.3; this.senseT = Math.random() * 0.2;
    this.crouch = 0; this.crouchTarget = 0; this.speedTarget = 0; this.moveSpeed = 0;
    this.engageT = 0; this.stepAcc = 0; this.calloutCD = 0; this.hurtT = -99; this.retreated = false;
    this.time = 0;
    this.hit = { t: 0, zone: '', point: new THREE.Vector3() };
    this.center = new THREE.Vector3();
    this.caps = HITBOX.map(([a, b, r, zone, t0 = 0, t1 = 1]) => ({ a: B[a], b: B[b], r: r, zone, t0, t1, pa: new THREE.Vector3(), pb: new THREE.Vector3() }));
    this.headC = new THREE.Vector3(); this.headR = 0.12;
    this.investigate = null;
    this.updateTransform(0);
  }
  useGun(gw, id) {
    if (this.gunObj) this.mgr.scene.remove(this.gunObj);
    const c = gw?.def.class; this.gunId = id; this.gunName = gw?.def.name || 'Rifle'; this.gunCls = c === 'assault_rifle' ? 'ar' : (c || 'ar'); this.gunObj = null; this.gunGrips = null;
    if (!gw) return;
    this.gunObj = (gw.npcRoot || gw.root).clone(true); this.gunObj.traverse(m => { if (m.isMesh) { m.castShadow = true; } });
    const gn = n => this.gunObj.getObjectByName(n) || this.gunObj.getObjectByName('socket_' + n);
    this.gunGrips = { R: gn('grip_R'), L: gn('grip_L'), muzzle: gn('muzzle') };
    this.mgr.scene.add(this.gunObj);
    if (this.alive && this.caps) this.updateTransform(0);
  }
  // swap to a built config (bots: their loadout, online players: their synced gunsmith build)
  async setGun(cfg) { const tok = (this._gunTok = (this._gunTok || 0) + 1); const w = await this.mgr.gunFor(cfg); if (w && tok === this._gunTok) { this.cfg = cfg; this.useGun(w, cfg.gun); } }
  respawn(pos, yaw) {
    for (const [b, p, q] of this.bind) { b.position.copy(p); b.quaternion.copy(q); }
    this.ragdoll = null; this.dropGun = null; this.alive = true; this.state = this.state === 'puppet' || this.isPuppet ? 'puppet' : 'patrol'; this.deathZone = null; this.looted = false;
    this.pos.set(pos[0], pos[1] || 0, pos[2]); this.vel.set(0, 0, 0); this.yaw = this.aimYaw = yaw; this.aimPitch = 0;
    this.hp = this.mgr.diff.hp; this.aware = 0; this.target = null; this.lastKnown = null; this.lastSeen = -99; this.lastAttacker = null;
    this.path = null; if (this.cover) this.cover.taken = null; this.cover = null; this.coverPhase = 'move'; this.mag = 30; this.reloadT = 0; this.suppression = 0; this.blindT = 0; this.retreated = false;
    this.moveSpeed = 0; this.crouch = 0; this.flinch = 0; this.patrol = []; this.investigate = null;
    this.nades = { frag: 1, tac: 1 }; this.nadeCD = 4 + Math.random() * 4;
    for (const a of Object.values(this.act)) { a.reset(); a.play(); a.weight = 0; }
    this.act.idle.weight = 1;
    if (this.gunObj) { this.gunObj.rotation.set(0, 0, 0); if (!this.gunObj.parent) this.mgr.scene.add(this.gunObj); }
    if (this.net) { this.net.x = this.pos.x; this.net.y = this.pos.y; this.net.z = this.pos.z; }
    this.holder.visible = true; this.updateTransform(0);
  }
  get eye() { return _v.set(this.pos.x, this.pos.y + (this.crouch > 0.5 ? 1.05 : 1.62), this.pos.z); }
  say(kind, force) {
    if (this.calloutCD > 0 && !force) return;
    const l = CALLOUTS[kind]; if (!l) return;
    this.calloutCD = 4 + Math.random() * 3;
    if (this.mgr.callout) this.mgr.callout(l[Math.floor(Math.random() * l.length)], this);
  }
  hear(pos, radius, kind, src, who) {
    if (this.state === 'dummy' || this.state === 'puppet') return;   // range targets and online puppets do not think
    if (who && (who === this || who.team === this.team)) return;     // own team's noise
    const d = pos.distanceTo(this.pos);
    if (who && !this.target && d < radius) this.target = who;
    if (d > radius) return;
    if (kind === 'impact' && d < 4) { this.suppression = Math.min(1, this.suppression + 0.35); }
    if (kind === 'flyby') { this.suppression = Math.min(1, this.suppression + 0.5); }
    if (this.state === 'combat' && kind !== 'gunshot') return;
    // gunshots and impacts reveal roughly where the shooter is
    const known = src || pos;
    const err = Math.min(8, d * 0.08);
    const guess = known.clone().add(new THREE.Vector3((Math.random() - 0.5) * err, 0, (Math.random() - 0.5) * err));
    if (this.state === 'combat') { if (this.mgr.clock - this.lastSeen > 3) this.lastKnown = guess; return; }
    this.lastKnown = guess;
    this.aware = Math.max(this.aware, kind === 'gunshot' || kind === 'impact' || kind === 'flyby' ? 0.75 : 0.4);
    if (kind === 'gunshot' || kind === 'impact' || kind === 'flyby') { this.enterCombat(false); this.say('heard'); }
    else if (this.state === 'patrol') { this.state = 'investigate'; this.investigate = guess; this.pathTo(guess); this.waitT = 0; }
  }
  enterCombat(seen) {
    if (this.state !== 'combat') {
      this.state = 'combat'; this.reactT = THREE.MathUtils.lerp(this.mgr.diff.react[0], this.mgr.diff.react[1], Math.random()) * (seen ? 1 : 1.6);
      this.cover = null; this.coverPhase = 'pick'; this.engageT = 0;
      if (seen) this.say('spot', true);
    }
    // share over the squad net
    const sq = this.squad;
    if (this.lastKnown) { sq.lastKnown = this.lastKnown.clone(); sq.lastTime = this.mgr.clock; }
    if (!sq.alerted) {
      sq.alerted = true;
      setTimeout(() => { for (const m of sq.members) if (m.alive && m !== this && m.state !== 'combat') { m.lastKnown = sq.lastKnown?.clone() || null; m.aware = Math.max(m.aware, 0.7); m.enterCombat(false); } }, 600 + Math.random() * 600);
    }
  }
  // ---------------------------------------------------------------- damage
  damage(dmg, zone, dir, point, attacker, power = 1, who = null) {
    if (!this.alive) return null;
    this.hurtT = this.time; if (who) { this.lastAttacker = who; if (who.team !== this.team && this.state !== 'puppet') this.target = who; }
    if (this.state === 'puppet') { const killed = zone === 'head' || (this.hp -= dmg * (ZONE_MULT[zone] ?? 1)) <= 0; if (killed) this.die(dir, point, zone, power); return { killed, zone }; }
    const mult = ZONE_MULT[zone] ?? 1;
    const killed = zone === 'head' || (this.hp -= dmg * mult) <= 0;
    if (killed) { this.die(dir, point, zone, power); return { killed: true, zone }; }
    if (this.state === 'dummy') { this.flinch = 0.3; return { killed: false, zone }; }
    this.suppression = 1;
    if (this.state !== 'combat') { this.lastKnown = attacker ? attacker.clone() : null; this.enterCombat(true); }
    else if (attacker) { this.lastKnown = attacker.clone(); this.lastSeen = this.mgr.clock - 0.5; }
    this.say('hurt');
    // flinch
    this.flinch = 0.3;
    return { killed: false, zone };
  }
  die(dir, point, zone, power) {
    this.alive = false; this.state = 'dead'; this.deathZone = zone;
    this.mixer.stopAllAction();
    if (this.cover) this.cover.taken = null;
    this.ragdoll = new Ragdoll(this, dir.clone().setY(Math.max(-0.2, dir.y)), point, (zone === 'head' ? 2.2 : 1.6) * power, this.world);
    // drop the weapon
    if (this.gunObj) this.dropGun = { v: this.vel.clone().add(dir.clone().multiplyScalar(1.5)).add(new THREE.Vector3(0, 1.2, 0)), w: new THREE.Vector3(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3), rest: false };
    if (this.state !== 'dead') {}
    for (const m of this.squad.members) if (m.alive && m.state !== 'dummy' && m.pos.distanceTo(this.pos) < 30) { m.say('down'); m.suppression = Math.min(1, m.suppression + 0.4); if (m.state !== 'combat') { m.lastKnown = this.pos.clone(); m.enterCombat(false); } }
    if (this.mgr.onKill) this.mgr.onKill(this, zone, this.lastAttacker);
  }
  // ---------------------------------------------------------------- hitboxes
  hitTest(o, d, maxT) {
    let best = maxT, zone = null;
    // head: sphere around the skull (helmet included)
    const th = raySphere(o, d, this.headC, this.headR);
    if (th > 0 && th < best) { best = th; zone = 'head'; }
    for (const c of this.caps) {
      const t = rayCapsule(o, d, c.pa, c.pb, c.r);
      if (t > 0 && t < best) { best = t; zone = c.zone; }
    }
    if (!zone) return null;
    return { npc: this, t: best, zone, point: o.clone().addScaledVector(d, best) };
  }
  updateHitboxes() {
    for (const c of this.caps) { c.a.getWorldPosition(c.pa); c.b.getWorldPosition(c.pb); if (c.t0 !== 0 || c.t1 !== 1) { _v.copy(c.pa); c.pa.lerpVectors(_v, c.pb, c.t0); c.pb.lerpVectors(_v, c.pb, c.t1); } }
    // the Bip01 head bone sits at the skull base; shift to the skull centre
    this.headC.copy(this.headCenterLocal); this.B.Head.localToWorld(this.headC);
    this.B.Spine1.getWorldPosition(this.center);
  }
  // ---------------------------------------------------------------- movement helpers
  pathTo(goal) {
    this.path = this.world.findPath(this.pos, goal) || null; this.pathI = 0; this.pathGoal = goal.clone(); this.repath = 1.5;
    return !!this.path;
  }
  followPath(dt, speed) {
    if (!this.path || this.pathI >= this.path.length) { this.speedTarget = 0; return true; }
    const p = this.path[this.pathI];
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.4) { this.pathI++; if (this.pathI >= this.path.length) { this.speedTarget = 0; return true; } return false; }
    this.speedTarget = speed;
    this.moveDir = (this.moveDir || new THREE.Vector3()).set(dx / d, 0, dz / d);
    return false;
  }
  // ---------------------------------------------------------------- perception
  sense(ctx) {
    const D = this.mgr.diff, now = ctx.now || 0;
    if (this.blindT > 0) { this.canSee = false; return; }
    const eye = _e.copy(this.eye);
    const fx = Math.sin(this.aimYaw), fz = Math.cos(this.aimYaw);
    const fov = this.state === 'combat' ? -0.5 : 0.2;   // cos of half-angle
    const range = ctx.viewRange || 110;
    // candidates: living enemies in range and in the field of view, nearest first, at most 3 sight lines
    const cand = [];
    for (const a of ctx.actors) {
      if (a === this || !a.alive || a.team === this.team || (a.protUntil || 0) > now) continue;
      const dx = a.pos.x - eye.x, dz = a.pos.z - eye.z, dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      if ((fx * dx + fz * dz) / (dist || 1) < fov && dist > 4) continue;
      cand.push([dist, a]);
    }
    cand.sort((p, q) => p[0] - q[0]);
    let best = null, bestD = 0;
    for (let i = 0; i < Math.min(3, cand.length) && !best; i++) {
      const a = cand[i][1], hd = headOf(a, _h), ch = chestOf(a, _c);
      if (ctx.smokeBlocks && ctx.smokeBlocks(eye, ch)) continue;
      if (this.world.los(eye, hd) || this.world.los(eye, ch)) { best = a; bestD = cand[i][0]; }
    }
    this.canSee = !!best;
    if (best) {
      if (best !== this.target) { this.target = best; if (this.state === 'combat') this.aware = Math.max(this.aware, 0.9); }
      const st = stanceOf(best), shot = best.isPlayer ? ctx.recentShot : (best.firedT || -9) > now - 1.5;
      let k = (st === 'prone' ? 0.35 : st === 'crouch' ? 0.65 : 1) * (speedOf(best) > 0.5 ? 1.4 : 0.8) * (shot ? 3 : 1) * (ctx.lightK || 1);
      k *= THREE.MathUtils.clamp(1.6 - bestD / range * 1.5, 0.15, 1.6) * D.aware;
      if (this.state === 'combat') k *= 3;
      this.aware = Math.min(1.2, this.aware + k * 0.9 * this.senseDt);
      if (this.aware >= 1) {
        if (this.state !== 'combat') { this.lastKnown = best.pos.clone(); this.enterCombat(true); }
        this.lastSeen = this.mgr.clock; this.lastKnown = best.pos.clone();
        this.squad.lastKnown = this.lastKnown.clone(); this.squad.lastTime = this.mgr.clock; this.squad.lastTarget = best;
      } else if (this.aware > 0.45 && this.state === 'patrol') { this.state = 'investigate'; this.investigate = best.pos.clone(); this.pathTo(this.investigate); }
    } else this.aware = Math.max(0, this.aware - this.senseDt * (this.state === 'combat' ? 0.02 : 0.12));
  }
  // ---------------------------------------------------------------- think (combat)
  pickCover(threat, opts = {}) {
    const W = this.world, list = W.cover || [];
    let best = null, bestS = Infinity;
    const minD = opts.far ? this.pos.distanceTo(threat) + 6 : 5, idealR = this.gunCls === 'smg' ? 12 : this.gunCls === 'shotgun' ? 8 : 22;
    for (const c of list) {
      if (c.taken && c.taken !== this) continue;
      const dSelf = c.pos.distanceTo(this.pos); if (dSelf > (opts.far ? 40 : 28)) continue;
      const dThreat = c.pos.distanceTo(threat); if (dThreat < minD) continue;
      // the box must sit between the cover point and the threat
      const tox = threat.x - c.pos.x, toz = threat.z - c.pos.z, tl = Math.hypot(tox, toz) || 1;
      const facing = -(c.n.x * tox + c.n.z * toz) / tl;
      if (facing < 0.35) continue;
      let s = dSelf * 1.0 + Math.abs(dThreat - idealR) * 0.6 - facing * 4;
      if (opts.flank) { const a0 = Math.atan2(this.pos.x - threat.x, this.pos.z - threat.z), a1 = Math.atan2(c.pos.x - threat.x, c.pos.z - threat.z); let da = Math.abs(a1 - a0); if (da > Math.PI) da = 2 * Math.PI - da; if (da < 0.9) continue; s -= da * 6; }
      if (opts.far) s = -dThreat + dSelf * 0.5;
      // avoid bunching with squad mates
      for (const m of this.squad.members) if (m !== this && m.alive && m.cover && m.cover.pos.distanceTo(c.pos) < 3) s += 6;
      if (s < bestS) { bestS = s; best = c; }
    }
    return best;
  }
  takeCover(c) {
    if (this.cover) this.cover.taken = null;
    this.cover = c; if (c) { c.taken = this; this.pathTo(c.pos); this.coverPhase = 'move'; }
  }
  think(ctx) {
    const D = this.mgr.diff, clock = this.mgr.clock;
    if (this.target && !this.target.alive) { this.target = null; if (this.state === 'combat' && clock - this.lastSeen < 2) { this.lastKnown = null; this.lastSeen = -99; } }
    if (this.state === 'investigate' && ctx.roam?.length && this.path && this.pathI >= this.path.length) { this.state = 'patrol'; this.path = null; }
    if (this.state === 'patrol' && ctx.roam?.length) {
      // deathmatch: hunt - keep moving between roam points (lanes, cover, spawn zones) and toward gunfire
      // (more often than not toward where an enemy roughly is, so the two sides meet in the lanes)
      if (!this.path || this.pathI >= this.path.length || this.repath < -6) {
        const foes = ctx.actors.filter(a => a.alive && a.team !== this.team);
        let ok = false;
        if (foes.length && Math.random() < 0.6) { const f = foes[Math.floor(Math.random() * foes.length)]; ok = this.pathTo(_v.set(f.pos.x + (Math.random() - 0.5) * 16, f.pos.y, f.pos.z + (Math.random() - 0.5) * 16)); }
        for (let i = 0; i < 3 && !ok; i++) { const p = ctx.roam[Math.floor(Math.random() * ctx.roam.length)]; ok = this.pathTo(_v.set(p[0], p[1] || 0, p[2])); }
        this.repath = 1.5;
      }
      return;
    }
    if (this.state === 'patrol') {
      this.speedTarget = 0;
      if (this.patrol.length > 1) {
        if (this.waitT > 0) return;
        if (!this.path || this.pathI >= (this.path?.length || 0)) {
          if (this.path) { this.waitT = 2 + Math.random() * 3; this.patrolIdx = (this.patrolIdx + 1) % this.patrol.length; this.path = null; return; }
          this.pathTo(this.patrol[this.patrolIdx]);
        }
      }
    } else if (this.state === 'investigate') {
      if (!this.path && this.investigate) this.pathTo(this.investigate);
      if (this.path && this.pathI >= this.path.length) { this.waitT = 4; this.path = null; this.investigate = null; this.aware *= 0.6; this.state = 'patrol'; }
    } else if (this.state === 'combat') {
      const threat = this.lastKnown || this.squad.lastKnown || this.target?.pos;
      if (!threat) { this.state = 'patrol'; this.path = null; return; }
      const sinceSeen = clock - Math.max(this.lastSeen, this.squad.lastTime - 1.5);
      // deathmatch: lose interest fast and go hunting again
      if (ctx.roam?.length && sinceSeen > 9 && !this.canSee) { if (this.cover) this.cover.taken = null; this.cover = null; this.state = 'patrol'; this.path = null; this.lastKnown = null; this.aware = 0.3; return; }
      if (this.utility(ctx, threat, sinceSeen)) return;
      // retreat when badly hurt
      if (!this.retreated && this.hp < 38) { this.retreated = true; const c = this.pickCover(threat, { far: true }); if (c) { this.takeCover(c); this.say('retreat', true); this.running = true; return; } }
      // flank when the player has been holding one spot
      const sq = this.squad;
      if (!sq.flanker && sq.members.filter(m => m.alive).length > 1 && sinceSeen < 8 && Math.random() < D.flank * 0.25 && this.cover && this.coverPhase !== 'move' && clock - (sq.flankT || -99) > 10) {
        const c = this.pickCover(threat, { flank: true });
        if (c) { sq.flanker = this; sq.flankT = clock; this.takeCover(c); this.say('flank', true); this.running = true; return; }
      }
      if (sq.flanker === this && this.coverPhase !== 'move') sq.flanker = null;
      // need cover?
      if (!this.cover || (this.coverPhase !== 'move' && !this.coverProtects(threat))) {
        const c = this.pickCover(threat);
        if (c) { this.takeCover(c); this.running = this.suppression > 0.3 || this.canSee; }
        else if (!this.canSee && sinceSeen > 4) { this.pathTo(threat); this.running = false; }
      }
      // lost the player for a long time: push to the last known position
      if (sinceSeen > 14 && this.coverPhase !== 'move') {
        if (this.cover) { this.cover.taken = null; this.cover = null; }
        this.pathTo(threat); this.coverPhase = 'push'; this.say('lost');
        if (sinceSeen > 30 && this.path && this.pathI >= this.path.length) { this.state = 'investigate'; this.investigate = threat.clone(); }
      }
    }
  }
  // grenades: a frag onto an enemy hiding behind cover, a flashbang on a close enemy before pushing,
  // smoke to cover a retreat. One lethal + one tactical per life, a cooldown between throws.
  utility(ctx, threat, sinceSeen) {
    if (!ctx.throwNade || this.nadeCD > 0 || this.blindT > 0 || this.reloadT > 0) return false;
    const d = this.pos.distanceTo(threat), N = this.nades || (this.nades = { frag: 1, tac: 1 });
    let type = null;
    if (N.frag > 0 && d > 7 && d < 28 && sinceSeen > 0.6 && sinceSeen < 6) type = 'frag';
    else if (N.tac > 0 && this.tacType === 'flash' && d > 6 && d < 22 && sinceSeen < 4) type = 'flash';
    else if (N.tac > 0 && this.tacType === 'smoke' && this.hp < 60 && d > 8 && d < 40) type = 'smoke';
    if (!type || Math.random() > 0.4) { this.nadeCD = 1.5; return false; }
    const to = type === 'smoke' ? this.pos.clone().lerp(threat, 0.35) : threat.clone();
    const from = this.eye.clone(); from.y += 0.25;
    ctx.throwNade(type, from, to, this);
    if (type === 'frag') N.frag--; else N.tac--;
    this.nadeCD = 6 + Math.random() * 6; this.say(type, true);
    return true;
  }
  coverProtects(threat) {
    if (!this.cover) return false;
    const c = this.cover; const tox = threat.x - c.pos.x, toz = threat.z - c.pos.z, tl = Math.hypot(tox, toz) || 1;
    return -(c.n.x * tox + c.n.z * toz) / tl > 0.3;
  }
  // ---------------------------------------------------------------- update
  update(dt, ctx) {
    this.time += dt;
    if (!this.alive) {
      if (this.ragdoll) this.ragdoll.step(Math.min(dt, 1 / 30));
      if (this.dropGun && !this.dropGun.rest && this.gunObj) {
        const g = this.dropGun; g.v.y -= 9.8 * dt; this.gunObj.position.addScaledVector(g.v, dt);
        this.gunObj.rotation.x += g.w.x * dt; this.gunObj.rotation.z += g.w.z * dt;
        const gy = this.world.groundAt(this.gunObj.position.x, this.gunObj.position.z, this.gunObj.position.y + 0.3) + 0.03;
        if (this.gunObj.position.y < gy) { this.gunObj.position.y = gy; g.rest = true; this.gunObj.rotation.set(0, this.gunObj.rotation.y, Math.PI / 2); }
      }
      return;
    }
    if (this.state === 'dummy') { this.ready = 0.3; this.aimPitch = 0; this.updateTransform(dt); return; }
    if (this.state === 'puppet') { this.updatePuppet(dt, ctx); return; }
    const D = this.mgr.diff, P = ctx.player;
    this.blindT = Math.max(0, (this.blindT || 0) - dt); this.nadeCD = (this.nadeCD ?? 5) - dt;
    this.calloutCD -= dt; this.waitT -= dt; this.fireCD -= dt; this.reactT -= dt; this.repath -= dt; this.phaseT -= dt;
    this.suppression = Math.max(0, this.suppression - dt * 0.25);
    this.senseT -= dt; if (this.senseT <= 0) { this.senseDt = 0.15 - this.senseT; this.senseT = 0.15; this.sense(ctx); }
    this.thinkT -= dt; if (this.thinkT <= 0) { this.thinkT = 0.5 + Math.random() * 0.4; this.think(ctx); }
    // ---------------- per-state movement and aim
    let wantAimYaw = this.yaw, wantPitch = 0, aimAt = null;
    this.running = this.running && this.state === 'combat';
    let speed = 0;
    if (this.state === 'patrol' || this.state === 'investigate') {
      this.crouchTarget = 0;
      const arrived = this.followPath(dt, ctx.roam?.length ? 3.0 : this.state === 'investigate' ? 2.0 : 1.35);
      speed = this.speedTarget;
      if (this.moveDir && speed > 0) wantAimYaw = Math.atan2(this.moveDir.x, this.moveDir.z);
      else if (this.investigate || this.lastKnown) { const t = this.investigate || this.lastKnown; wantAimYaw = Math.atan2(t.x - this.pos.x, t.z - this.pos.z) + Math.sin(this.time * 0.6) * 0.6; }
      else wantAimYaw = this.yaw + Math.sin(this.time * 0.4) * 0.002;
      this.ready = this.state === 'investigate' ? 0.6 : 0;
    } else if (this.state === 'combat') {
      const threat = this.lastKnown || this.target?.pos || this.pos;
      this.ready = 1;
      const seeNow = this.canSee && this.aware >= 1 && !!this.target?.alive;
      if (seeNow) aimAt = chestOf(this.target, new THREE.Vector3());
      else if (threat) aimAt = threat.clone().setY(threat.y + 1.2);
      // movement toward cover / push
      const moving = this.path && this.pathI < this.path.length;
      if (moving) {
        const arrived = this.followPath(dt, this.running ? 3.6 : 2.2);
        speed = this.speedTarget;
        if (arrived && this.cover) { this.coverPhase = 'hide'; this.phaseT = 1 + Math.random() * 1.5; this.running = false; }
        this.crouchTarget = 0;
      } else if (this.cover) {
        // cover cycle: hide -> peek & shoot -> hide
        if (this.coverPhase === 'move') { this.coverPhase = 'hide'; this.phaseT = 0.8; }
        if (this.coverPhase === 'hide') {
          this.crouchTarget = this.cover.low ? 1 : 0;
          this.peekOffset.lerp(_v2.set(0, 0, 0), Math.min(1, dt * 6));
          if (this.reloadT > 0) { this.reloadT -= dt; if (this.reloadT <= 0) this.mag = 30; }
          else if (this.phaseT <= 0) { this.coverPhase = 'peek'; this.phaseT = 1.4 + Math.random() * 1.6 * (1 - this.suppression); this.burst = 0; }
        } else if (this.coverPhase === 'peek') {
          this.crouchTarget = 0;
          if (!this.cover.low && this.cover.edge) this.peekOffset.lerp(_v2.copy(this.cover.side).multiplyScalar(0.75), Math.min(1, dt * 5));
          if (this.phaseT <= 0 || this.suppression > 0.85 || this.mag <= 0) {
            this.coverPhase = 'hide'; this.phaseT = (1.2 + Math.random() * 2) * (1 + this.suppression * 1.5);
            if (this.mag <= 4) { this.reloadT = 2.4; this.say('reload'); }
          }
        }
      } else { this.crouchTarget = 0; speed = 0; }
      if (aimAt) { wantAimYaw = Math.atan2(aimAt.x - this.pos.x, aimAt.z - this.pos.z); }
      // ---------------- shooting
      const peeking = !this.cover || this.coverPhase === 'peek' || this.coverPhase === 'push' || moving;
      const sinceSeen = this.mgr.clock - this.lastSeen;
      const suppressFire = !seeNow && sinceSeen < 6 && this.coverPhase === 'peek' && this.lastKnown;
      if (this.blindT > 0) { this.crouchTarget = 1; speed = 0; }
      if (this.blindT <= 0 && this.reactT <= 0 && this.reloadT <= 0 && peeking && (seeNow || suppressFire) && this.fireCD <= 0 && this.mag > 0) {
        if (this.burst <= 0) { this.burst = this.gunCls === 'smg' ? 4 + Math.floor(Math.random() * 5) : this.gunCls === 'ar' ? 3 + Math.floor(Math.random() * 4) : 1; if (suppressFire) { this.burst += 3; this.say('suppress'); } }
        const aimT = aimAt;
        if (aimT && Math.abs(angleDiff(this.aimYaw, wantAimYaw)) < 0.25) {
          this.fire(ctx, aimT, seeNow);
          this.burst--; this.mag--;
          const slow = this.gunCls === 'sniper' ? 2.6 : this.gunCls === 'dmr' || this.gunCls === 'shotgun' ? 1.4 : 1;
          this.fireCD = this.burst > 0 ? 60 / (this.gunCls === 'smg' ? 800 : 650) * (1 + Math.random() * 0.3) : THREE.MathUtils.lerp(D.burstPause[0], D.burstPause[1], Math.random()) * (1 + this.suppression) * slow;
        }
      }
      this.engageT = seeNow ? this.engageT + dt : Math.max(0, this.engageT - dt * 0.5);
    }
    // ---------------- integrate position
    this.moveSpeed += (speed - this.moveSpeed) * Math.min(1, dt * 6);
    if (this.moveDir && this.moveSpeed > 0.05) {
      const step = _v3.copy(this.moveDir).multiplyScalar(this.moveSpeed * dt);
      const nx = this.pos.x + step.x, nz = this.pos.z + step.z;
      if (this.world.free(nx, this.pos.y + 0.35, nz, 0.25, 1.3)) { this.pos.x = nx; this.pos.z = nz; }
      else if (this.world.free(nx, this.pos.y + 0.35, this.pos.z, 0.25, 1.3)) this.pos.x = nx;
      else if (this.world.free(this.pos.x, this.pos.y + 0.35, nz, 0.25, 1.3)) this.pos.z = nz;
      else this.repath = 0;
      // stuck on geometry (a corner the nav grid missed): skip the waypoint, then give up on that cover spot
      const moved2 = (this.pos.x - (this._lx ?? this.pos.x)) ** 2 + (this.pos.z - (this._lz ?? this.pos.z)) ** 2;
      this.stuckT = moved2 < (this.moveSpeed * dt * 0.2) ** 2 ? (this.stuckT || 0) + dt : 0;
      if (this.stuckT > 0.8 && this.path && this.pathI < this.path.length - 1) { this.pathI++; this.stuckT = 0.4; }
      else if (this.stuckT > 2) { this.stuckT = 0; this.path = null; if (this.cover) { this.cover.taken = null; this.cover = null; } this.coverPhase = 'hide'; }
      // separation from squad mates
      for (const m of this.mgr.list) { if (m === this || !m.alive) continue; const dx = this.pos.x - m.pos.x, dz = this.pos.z - m.pos.z, d2 = dx * dx + dz * dz; if (d2 < 0.5 && d2 > 1e-6) { const d = Math.sqrt(d2); this.pos.x += dx / d * (0.71 - d) * 0.5; this.pos.z += dz / d * (0.71 - d) * 0.5; } }
      this.vel.copy(this.moveDir).multiplyScalar(this.moveSpeed);
    } else this.vel.set(0, 0, 0);
    this._lx = this.pos.x; this._lz = this.pos.z;
    const g = this.world.groundAt(this.pos.x, this.pos.z, this.pos.y + 0.5, 0.15); if (g > -5) this.pos.y += (g - this.pos.y) * Math.min(1, dt * 12);
    // body yaw: face where we move unless engaged, then face the aim
    const faceAim = this.state === 'combat' || (this.state === 'investigate' && this.moveSpeed < 0.3);
    const moveYaw = this.moveDir && this.moveSpeed > 0.3 ? Math.atan2(this.moveDir.x, this.moveDir.z) : this.yaw;
    const turn = Math.min(1, dt * (this.state === 'combat' ? 7 : 4));
    this.aimYaw += angleDiff(this.aimYaw, wantAimYaw) * Math.min(1, dt * (this.state === 'combat' ? 9 : 3));
    const bodyTarget = faceAim ? (this.moveSpeed > 1 && Math.abs(angleDiff(moveYaw, this.aimYaw)) < 1.6 ? moveYaw : this.aimYaw) : moveYaw;
    this.yaw += angleDiff(this.yaw, bodyTarget) * turn;
    if (aimAt) { const dx = aimAt.x - this.pos.x, dz = aimAt.z - this.pos.z; wantPitch = Math.atan2(aimAt.y - (this.pos.y + 1.45), Math.hypot(dx, dz)); }
    this.aimPitch += (wantPitch - this.aimPitch) * Math.min(1, dt * 8);
    this.crouch += (this.crouchTarget - this.crouch) * Math.min(1, dt * 6);
    // footsteps near the player
    if (this.moveSpeed > 0.6 && this.mgr.audio) {
      this.stepAcc += this.moveSpeed * dt;
      if (this.stepAcc > (this.moveSpeed > 3 ? 1.0 : 0.75)) { this.stepAcc = 0; if (this.pos.distanceTo(P.pos) < 22) this.mgr.audio.footstep(ctx.surfAt ? ctx.surfAt(this.pos) : 'concrete', this.moveSpeed > 3 ? 1.1 : 0.6, this.pos.clone().setY(this.pos.y + 0.1)); }
    }
    // animation LOD: skinning, IK and hitboxes every frame up close, every 2nd frame past 25 m,
    // every 3rd past 50 m and every 4th behind the camera (accumulated dt keeps the motion exact)
    const cp = P.camPos, dx = this.pos.x - cp.x, dz = this.pos.z - cp.z, d2 = dx * dx + dz * dz, F = this.mgr.camFwd;
    let every = d2 < 625 ? 1 : d2 < 2500 ? 2 : 3;
    if (F && d2 > 36 && (dx * F.x + dz * F.z) / Math.sqrt(d2) < 0.25) every = 4;
    this.animAcc = (this.animAcc || 0) + dt; this.animN = (this.animN || 0) + 1;
    if (this.animN >= every) { this.updateTransform(this.animAcc); this.animAcc = 0; this.animN = 0; }
  }
  fire(ctx, aimAt, seen) {
    const D = this.mgr.diff, P = this.target || ctx.player;
    this.firedT = ctx.now || 0;
    const muzzle = this.gunGrips?.muzzle ? this.gunGrips.muzzle.getWorldPosition(new THREE.Vector3()) : this.eye.clone();
    const from = this.eye.clone().lerp(muzzle, 0.6);
    // aim error: base spread, distance, target motion, time on target, suppression
    const dist = from.distanceTo(aimAt);
    let spreadDeg = D.spread * (1 + this.suppression * 1.5) * (seen ? Math.max(0.55, 1.6 - this.engageT * 0.5) : 2.2);
    spreadDeg += speedOf(P) * 0.25 + (this.moveSpeed > 0.5 ? 1.5 : 0);
    if (stanceOf(P) === 'prone') spreadDeg *= 1.2;
    let target = aimAt.clone();
    if (seen && Math.random() < D.headChance * (this.gunCls === 'sniper' || this.gunCls === 'dmr' ? 2 : 1)) headOf(P, target);
    // lead the target a little
    target.addScaledVector(P.vel, dist / 700 * 0.7);
    const dir = target.sub(from).normalize();
    const s = THREE.MathUtils.degToRad(spreadDeg) * 0.5;
    const r = Math.sqrt(Math.random()) * s, a = Math.random() * Math.PI * 2;
    const side = _v2.crossVectors(dir, UP).normalize(), up = _v3.crossVectors(side, dir).normalize();
    dir.addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
    const dm = this.gunCls === 'sniper' ? 3 : this.gunCls === 'dmr' ? 1.8 : this.gunCls === 'shotgun' ? (dist < 15 ? 2.5 : 0.8) : this.gunCls === 'pistol' ? 0.9 : 1;
    ctx.fireBullet({ pos: from, dir, velocity: this.gunCls === 'smg' ? 400 : 880, damage: D.dmg * dm, team: this.team, owner: this, weapon: this.gunName, cls: this.gunCls, pen: 0.8 });
    this.mgr.noise(this.pos, this.cfg && /suppress/.test(this.cfg.muzzle) ? 25 : 120, 'gunshot', this.pos.clone(), this);
    if (this.mgr.onShot) this.mgr.onShot(this, from, dir);
    this.mgr.fx.worldFlash(muzzle, dir, 0.8);
    this.mgr.fx.tracer(muzzle, dir, this.gunCls === 'smg' ? 400 : 880, { alpha: 0.5, w: 0.007 });
    this.mgr.audio?.gunshot(muzzle, this.gunCls, {});
    this.recoilKick = 1;
  }
  // online player / remote bot: position, aim and stance come from the network (interpolated)
  updatePuppet(dt, ctx) {
    const N = this.net; if (!N) return;
    const k = Math.min(1, dt * 12), ox = this.pos.x, oz = this.pos.z;
    if (Math.hypot(N.x - this.pos.x, N.z - this.pos.z) > 6) this.pos.set(N.x, N.y, N.z);
    else { this.pos.x += (N.x - this.pos.x) * k; this.pos.y += (N.y - this.pos.y) * k; this.pos.z += (N.z - this.pos.z) * k; }
    const idt = 1 / Math.max(dt, 1e-3), v = Math.hypot(this.pos.x - ox, this.pos.z - oz) * idt;
    this.moveSpeed += (Math.min(6, v) - this.moveSpeed) * Math.min(1, dt * 8);
    if (v > 0.3) this.moveDir = (this.moveDir || new THREE.Vector3()).set(this.pos.x - ox, 0, this.pos.z - oz).normalize();
    this.vel.set((this.pos.x - ox) * idt, 0, (this.pos.z - oz) * idt);
    this.aimYaw += angleDiff(this.aimYaw, N.yaw) * k; this.aimPitch += (N.pitch - this.aimPitch) * k;
    const moveYaw = this.moveSpeed > 0.8 && this.moveDir ? Math.atan2(this.moveDir.x, this.moveDir.z) : this.aimYaw;
    this.yaw += angleDiff(this.yaw, Math.abs(angleDiff(moveYaw, this.aimYaw)) < 1.6 ? moveYaw : this.aimYaw) * Math.min(1, dt * 7);
    this.crouch += ((N.crouch ? 1 : 0) - this.crouch) * Math.min(1, dt * 6); this.ready = 1;
    const cp = ctx.player.camPos, dx = this.pos.x - cp.x, dz = this.pos.z - cp.z;
    this.animAcc = (this.animAcc || 0) + dt; this.animN = (this.animN || 0) + 1;
    if (this.animN >= (dx * dx + dz * dz < 900 ? 1 : 2)) { this.updateTransform(this.animAcc); this.animAcc = 0; this.animN = 0; }
  }
  // ---------------------------------------------------------------- pose
  updateTransform(dt) {
    this.holder.position.copy(this.pos); this.holder.rotation.y = this.yaw;
    // locomotion blend
    const sp = this.moveSpeed, A = this.act, S = this.base.speeds;
    const wRun = THREE.MathUtils.smoothstep(sp, 2.2, 3.2), wWalk = THREE.MathUtils.smoothstep(sp, 0.15, 0.9) * (1 - wRun);
    const wStill = 1 - wWalk - wRun;
    A.walk.weight = wWalk; A.run.weight = wRun; A.idle.weight = wStill * (1 - this.crouch); A.crouch.weight = wStill * this.crouch;
    A.walk.timeScale = sp > 0.1 ? THREE.MathUtils.clamp(sp / (S.walk * this.scale || 1.4), 0.6, 1.8) : 1;
    A.run.timeScale = sp > 0.1 ? THREE.MathUtils.clamp(sp / (S.run * this.scale || 3), 0.7, 1.5) : 1;
    this.mixer.update(dt);
    this.holder.updateMatrixWorld(true);
    // upper body: twist spine toward aim, pitch, hold rifle with IK
    const B = this.B;
    const twist = angleDiff(this.yaw, this.aimYaw);
    const pitch = this.aimPitch * (this.ready > 0.5 ? 1 : 0.3) + (this.ready > 0.5 ? 0 : -0.35);
    _q.setFromAxisAngle(UP, twist * 0.5); worldRotate(B.Spine1, _q); worldRotate(B.Spine2, _q);
    const aimDir = new THREE.Vector3(Math.sin(this.aimYaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(this.aimYaw) * Math.cos(pitch));
    const right = new THREE.Vector3(Math.cos(this.aimYaw), 0, -Math.sin(this.aimYaw));
    _q.setFromAxisAngle(right, -pitch * 0.4); worldRotate(B.Spine2, _q);
    if (this.flinch > 0) { this.flinch -= dt; _q.setFromAxisAngle(right, -this.flinch * 0.8); worldRotate(B.Spine1, _q); }
    // head looks along the aim
    const headFwd = new THREE.Vector3(); B.Head.getWorldDirection(headFwd);
    // weapon placement: stock in the right shoulder, pointing along the aim (low ready when relaxed)
    if (this.gunObj && this.gunGrips?.R) {
      const shoulder = B.R_UpperArm.getWorldPosition(new THREE.Vector3());
      const chest = B.Spine2.getWorldPosition(new THREE.Vector3());
      const ready = this.ready ?? 0;
      const gunDir = ready > 0.5 ? aimDir.clone() : aimDir.clone().add(new THREE.Vector3(0, -0.75, 0)).add(right.clone().multiplyScalar(-0.35)).normalize();
      const kick = (this.recoilKick || 0); this.recoilKick = Math.max(0, kick - dt * 12);
      const gripPos = shoulder.clone().addScaledVector(gunDir, 0.22 - kick * 0.03).addScaledVector(right, -0.06).add(new THREE.Vector3(0, -0.1, 0));
      if (ready <= 0.5) gripPos.copy(chest).addScaledVector(right, 0.12).add(new THREE.Vector3(0, -0.12, 0)).addScaledVector(gunDir, 0.1);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(), gunDir, UP);   // -Z -> gunDir ; we need +Z -> gunDir
      const q = new THREE.Quaternion().setFromRotationMatrix(m).multiply(new THREE.Quaternion().setFromAxisAngle(UP, Math.PI));
      this.gunObj.quaternion.copy(q);
      const gr = this.gunGrips.R.position.clone().applyQuaternion(q);
      this.gunObj.position.copy(gripPos).sub(gr);
      this.gunObj.updateMatrixWorld(true);
      // two-bone IK for both arms
      const hint = new THREE.Vector3(0, -1, 0).addScaledVector(right, 0.6);
      this.ik('R', this.gunGrips.R.getWorldPosition(new THREE.Vector3()), hint.clone().addScaledVector(gunDir, -0.3));
      if (this.gunGrips.L) this.ik('L', this.gunGrips.L.getWorldPosition(new THREE.Vector3()), new THREE.Vector3(0, -1, 0).addScaledVector(right, -0.8));
      // hands: fingers wrap the grip
      const gunLeft = right.clone().negate();
      alignBone(B.R_Hand, B.R_Finger2.getWorldPosition(new THREE.Vector3()), gunLeft.clone().multiplyScalar(0.5).addScaledVector(gunDir, 0.6).add(new THREE.Vector3(0, -0.5, 0)).normalize(), 0.8);
      if (B.L_Finger2) alignBone(B.L_Hand, B.L_Finger2.getWorldPosition(new THREE.Vector3()), right.clone().multiplyScalar(0.4).addScaledVector(gunDir, 0.7).add(new THREE.Vector3(0, 0.2, 0)).normalize(), 0.8);
    }
    // head follows the aim
    const neckTarget = aimDir.clone();
    const headPos = B.Head.getWorldPosition(new THREE.Vector3());
    const headTop = B.Head.localToWorld(this.headTopLocal.clone());
    const upDir = headTop.sub(headPos).normalize();
    const desired = new THREE.Vector3(0, 1, 0).addScaledVector(neckTarget, 0.12).normalize();
    _q.setFromUnitVectors(upDir, desired); _q.slerp(new THREE.Quaternion(), 0.5); worldRotate(B.Head, _q);
    this.updateHitboxes();
  }
  ik(side, target, hint) {
    const B = this.B, ua = B[side + '_UpperArm'], fa = B[side + '_Forearm'], hand = B[side + '_Hand'];
    const [a, b] = this.armLen[side];
    const S = ua.getWorldPosition(new THREE.Vector3());
    const toT = target.clone().sub(S); let d = toT.length();
    const maxD = (a + b) * 0.999; if (d > maxD) { toT.multiplyScalar(maxD / d); d = maxD; }
    const dir = toT.clone().normalize();
    const x = (a * a - b * b + d * d) / (2 * d), h = Math.sqrt(Math.max(0, a * a - x * x));
    const pole = hint.clone().addScaledVector(dir, -hint.dot(dir)).normalize();
    const elbow = S.clone().addScaledVector(dir, x).addScaledVector(pole, h);
    alignBone(ua, fa.getWorldPosition(new THREE.Vector3()), elbow.clone().sub(S).normalize());
    const E = fa.getWorldPosition(new THREE.Vector3());
    alignBone(fa, hand.getWorldPosition(new THREE.Vector3()), S.clone().add(toT).sub(E).normalize());
  }
}
function angleDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }

// NPC copy of a weapon: every part merged per material (one draw instead of ~8 per soldier per pass),
// with the grip and muzzle sockets kept as empties
function flatGun(w) {
  const root = w.root; root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert(), by = new Map();
  root.traverse(o => {
    if (!o.isMesh || !o.visible) return;
    const g = o.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    const k = o.material.uuid; if (!by.has(k)) by.set(k, { m: o.material, g: [] }); by.get(k).g.push(g);
  });
  const out = new THREE.Group(); out.name = root.name;
  for (const { m, g } of by.values()) { try { const mesh = new THREE.Mesh(safeMerge(g), m); mesh.castShadow = true; out.add(mesh); } catch (e) { /* skip odd parts */ } }
  for (const n of ['grip_R', 'grip_L', 'muzzle']) {
    const src = w.sockets?.[n] || root.getObjectByName(n) || root.getObjectByName('socket_' + n); if (!src) continue;
    const e = new THREE.Object3D(); e.name = n; src.getWorldPosition(e.position).applyMatrix4(inv); out.add(e);
  }
  return out;
}
