// Turns a posed cube rig into a cannon-es ragdoll: one box body per segment, cone-twist joints with limits.
// Also Part: a severed limb (a compound rigid body built from whatever meshes were cut off).
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

// segment -> meshes it carries; joint: [parent, child, cone angle, twist]
const GROUPS = {
  pelvis: ['pelvis'], torso: ['torso'], head: ['head'],
  uarmL: ['uarmL'], larmL: ['larmL', 'handL'], uarmR: ['uarmR'], larmR: ['larmR', 'handR'],
  thighL: ['thighL'], shinL: ['shinL', 'footL'], thighR: ['thighR'], shinR: ['shinR', 'footR'],
};
const JOINTS = [
  ['pelvis', 'torso', 0.45, 0.35], ['torso', 'head', 0.6, 0.6],
  ['torso', 'uarmL', 1.5, 0.6], ['uarmL', 'larmL', 1.3, 0.3], ['torso', 'uarmR', 1.5, 0.6], ['uarmR', 'larmR', 1.3, 0.3],
  ['pelvis', 'thighL', 1.0, 0.4], ['thighL', 'shinL', 1.2, 0.2], ['pelvis', 'thighR', 1.0, 0.4], ['thighR', 'shinR', 1.2, 0.2],
];
const MASS = { pelvis: 12, torso: 18, head: 5, uarmL: 2.5, larmL: 2, uarmR: 2.5, larmR: 2, thighL: 7, shinL: 4.5, thighR: 7, shinR: 4.5 };
// which segments go with a cut at a given joint
export const SUBTREE = {
  head: ['head'], uarmL: ['uarmL', 'larmL', 'handL'], larmL: ['larmL', 'handL'], uarmR: ['uarmR', 'larmR', 'handR'], larmR: ['larmR', 'handR'],
  torso: ['torso', 'head', 'uarmL', 'larmL', 'handL', 'uarmR', 'larmR', 'handR'],
  thighL: ['thighL', 'shinL', 'footL'], shinL: ['shinL', 'footL'], thighR: ['thighR', 'shinR', 'footR'], shinR: ['shinR', 'footR'],
};
export const PARENT = { torso: 'pelvis', head: 'torso', uarmL: 'torso', larmL: 'uarmL', uarmR: 'torso', larmR: 'uarmR', thighL: 'pelvis', shinL: 'thighL', thighR: 'pelvis', shinR: 'thighR' };

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
export const ragMat = new CANNON.Material('rag');
// each ragdoll gets its own collision bit so its boxes never fight each other (no self-overlap jitter or explosions),
// while corpses still pile on each other and on the world (statics are group 1, mask all).
let groupN = 0;
export function nextGroup() { return 2 << (groupN++ % 12); }
const MAXV = 28, MAXW = 30;

export class Ragdoll {
  // vel: base velocity, impulse: {seg, dir:Vector3, power}. Segments in rig.cut are already gone.
  constructor(scene, world, rig, vel, impulse, group = nextGroup()) {
    this.group = group; this.scene = scene; this.world = world; this.bodies = {}; this.objs = {}; this.cons = []; this.age = 0;
    const cut = rig.cut || new Set();
    rig.root.updateMatrixWorld(true);
    for (const seg in GROUPS) {
      if (cut.has(seg)) continue;
      const main = rig.m[seg];
      main.getWorldPosition(_p); main.getWorldQuaternion(_q); main.getWorldScale(_s);
      const sz = main.userData.size;
      const body = new CANNON.Body({ mass: MASS[seg], material: ragMat, linearDamping: 0.05, angularDamping: MASS[seg] < 5 ? 0.8 : 0.4,
        shape: new CANNON.Box(new CANNON.Vec3(sz[0] / 2 * _s.x, sz[1] / 2 * _s.y, sz[2] / 2 * _s.z)) });
      body.position.set(_p.x, _p.y, _p.z); body.quaternion.set(_q.x, _q.y, _q.z, _q.w);
      body.velocity.set(vel.x + (Math.random() - 0.5), vel.y, vel.z + (Math.random() - 0.5));
      body.allowSleep = true; body.sleepSpeedLimit = 0.15; body.sleepTimeLimit = 1.2;
      body.collisionFilterGroup = group; body.collisionFilterMask = ~group;
      padInertia(body);
      world.addBody(body); this.bodies[seg] = body;
      const o = new THREE.Object3D(); o.position.copy(_p); o.quaternion.copy(_q); scene.add(o); o.updateMatrixWorld(true);
      for (const name of GROUPS[seg]) if (!cut.has(name)) o.attach(rig.m[name]);
      this.objs[seg] = o;
    }
    for (const [a, b, cone, twist] of JOINTS) {
      const A = this.bodies[a], B = this.bodies[b]; if (!A || !B) continue;
      const jw = rig.j[b].getWorldPosition(new THREE.Vector3()); // joint position = child group origin
      const pivA = A.pointToLocalFrame(new CANNON.Vec3(jw.x, jw.y, jw.z)), pivB = B.pointToLocalFrame(new CANNON.Vec3(jw.x, jw.y, jw.z));
      const dir = new CANNON.Vec3(B.position.x - jw.x, B.position.y - jw.y, B.position.z - jw.z); dir.normalize();
      const c = new CANNON.ConeTwistConstraint(A, B, { pivotA: pivA, pivotB: pivB, axisA: A.vectorToLocalFrame(dir), axisB: B.vectorToLocalFrame(dir), angle: cone, twistAngle: twist, collideConnected: false });
      fixTwist(c);
      // the twist equation compares perpendicular references, so a big swing reads as twist and the solver spins the limb;
      // only the spine and neck (small cones) keep a twist limit, with the swing allowance added on
      if (cone > 0.7) c.twistEquation.enabled = false; else c.twistAngle = twist + cone;
      world.addConstraint(c); this.cons.push(c);
    }
    const ck = this.bodies.torso ? "torso" : this.bodies.pelvis ? "pelvis" : Object.keys(this.bodies)[0];
    this.core = this.bodies[ck]; this.coreObj = this.objs[ck];
    if (impulse) {
      const b = this.bodies[impulse.seg] || this.core, d = impulse.dir;
      b.applyImpulse(new CANNON.Vec3(d.x * impulse.power, d.y * impulse.power, d.z * impulse.power));
    }
    rig.root.visible = false;
    this.skin = rig.skin || null;
  }
  update(dt) {
    this.age += dt;
    for (const seg in this.bodies) { const b = this.bodies[seg], o = this.objs[seg]; clampBody(b); o.position.copy(b.position); o.quaternion.copy(b.quaternion); }
  }
  hitPoint(seg) { return this.objs[seg].position; }
  push(x, y, z) { for (const k in this.bodies) this.bodies[k].wakeUp(); this.core.applyImpulse(new CANNON.Vec3(x, y, z)); }
  dispose() {
    this.skin?.dispose();
    for (const c of this.cons) this.world.removeConstraint(c);
    for (const seg in this.bodies) { this.world.removeBody(this.bodies[seg]); this.scene.remove(this.objs[seg]); }
  }
}

// cannon's ConeTwist takes each body's twist reference from axis.tangents() in its OWN local frame, so the two
// references disagree whenever the bodies start rotated relative to each other: the twist limit is violated from
// frame one and the limb spins forever. Derive B's reference from A's at creation so the start pose is twist-free.
function fixTwist(c) {
  const A = c.bodyA, B = c.bodyB, tA = new CANNON.Vec3(), tmp = new CANNON.Vec3();
  c.axisA.tangents(tA, tmp);
  const tB = B.vectorToLocalFrame(A.vectorToWorldFrame(tA));
  const base = CANNON.PointToPointConstraint.prototype.update;
  c.update = function () {
    base.call(this);
    A.vectorToWorldFrame(this.axisA, this.coneEquation.axisA); B.vectorToWorldFrame(this.axisB, this.coneEquation.axisB);
    A.vectorToWorldFrame(tA, this.twistEquation.axisA); B.vectorToWorldFrame(tB, this.twistEquation.axisB);
    this.coneEquation.angle = this.angle; this.twistEquation.maxAngle = this.twistAngle;
  };
}

// thin limb boxes have almost no inertia about their long axis, which makes the solver spin them; pad it
function padInertia(b, min = 0.03) {
  const I = b.inertia; I.x = Math.max(I.x, min); I.y = Math.max(I.y, min); I.z = Math.max(I.z, min);
  b.invInertia.set(1 / I.x, 1 / I.y, 1 / I.z); b.updateInertiaWorld(true);
}

// safety net against solver blow-ups: cap linear and angular speed
export function clampBody(b) {
  const v = b.velocity.length(); if (v > MAXV) b.velocity.scale(MAXV / v, b.velocity);
  const w = b.angularVelocity.length(); if (w > MAXW) b.angularVelocity.scale(MAXW / w, b.angularVelocity);
}

// A cut-off limb or head: all its meshes re-parented under one object that follows one compound body.
export class Part {
  constructor(scene, world, rig, seg, vel, spin, group = nextGroup()) {
    this.scene = scene; this.world = world; this.age = 0;
    const names = SUBTREE[seg].filter(n => !rig.cut.has(n));
    rig.root.updateMatrixWorld(true);
    // centre of mass = volume-weighted mesh centres, orientation = the cut segment's
    const c = new THREE.Vector3(); let vol = 0;
    for (const n of names) { const m = rig.m[n], s = m.userData.size, v = s[0] * s[1] * s[2]; c.addScaledVector(m.getWorldPosition(_p), v); vol += v; }
    c.multiplyScalar(1 / vol);
    const o = new THREE.Object3D(); o.position.copy(c); rig.m[seg].getWorldQuaternion(o.quaternion); scene.add(o); o.updateMatrixWorld(true);
    const body = new CANNON.Body({ mass: Math.min(7, Math.max(1.5, vol * 500)), material: ragMat, linearDamping: 0.04, angularDamping: 0.15 });
    for (const n of names) {
      const m = rig.m[n]; o.attach(m); rig.cut.add(n);
      const s = m.userData.size;
      body.addShape(new CANNON.Box(new CANNON.Vec3(s[0] / 2, s[1] / 2, s[2] / 2)), new CANNON.Vec3(m.position.x, m.position.y, m.position.z), new CANNON.Quaternion(m.quaternion.x, m.quaternion.y, m.quaternion.z, m.quaternion.w));
    }
    body.position.set(c.x, c.y, c.z); body.quaternion.set(o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w);
    body.velocity.set(vel.x, vel.y, vel.z); body.angularVelocity.set(spin.x, spin.y, spin.z);
    body.allowSleep = true; body.sleepSpeedLimit = 0.2; body.sleepTimeLimit = 1;
    body.collisionFilterGroup = group; body.collisionFilterMask = ~group;
    world.addBody(body);
    this.body = body; this.obj = o; this.main = rig.m[seg]; this.seg = seg;
  }
  update(dt) { this.age += dt; clampBody(this.body); this.obj.position.copy(this.body.position); this.obj.quaternion.copy(this.body.quaternion); }
  dispose() { this.world.removeBody(this.body); this.scene.remove(this.obj); }
}

// a raw cut face on a stump or a severed piece: dark red flesh disc with a pale bone core
const CAP = {};
export function cutCap(obj, localPos, localDir, radius = 0.06) {
  if (!CAP.flesh) { CAP.flesh = new THREE.MeshStandardMaterial({ color: 0x6a0006, roughness: 0.3, emissive: 0x140000, side: THREE.DoubleSide }); CAP.bone = new THREE.MeshStandardMaterial({ color: 0xd6d6d0, roughness: 0.6, side: THREE.DoubleSide }); CAP.g = new THREE.CircleGeometry(1, 10); }
  const g = new THREE.Group(); g.position.copy(localPos); g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), localDir.clone().normalize());
  const f = new THREE.Mesh(CAP.g, CAP.flesh); f.scale.setScalar(radius); g.add(f);
  const b = new THREE.Mesh(CAP.g, CAP.bone); b.scale.setScalar(radius * 0.32); b.position.z = 0.002; g.add(b);
  obj.add(g); return g;
}
