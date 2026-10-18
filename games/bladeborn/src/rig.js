// Jointed cube rig shared by the hero and enemies, plus a weighted procedural animator.
import * as THREE from 'three';
import { MASK } from './clips.js';

const geoCache = new Map();
function cube(w, h, d) {
  const k = w + ',' + h + ',' + d;
  if (!geoCache.has(k)) geoCache.set(k, new THREE.BoxGeometry(w, h, d));
  return geoCache.get(k);
}

// Segment table: name, parent, joint offset (in parent), box size, box centre offset, colour slot.
// Joint offsets are the measured skeleton every move, strike, grip and climb was tuned on (hips 0.918 m, upper arm
// 0.324, forearm 0.162 to the wrist); the cubes are sized to fill those bones.
export const SEGS = [
  ['pelvis', null, [0, 0.918, 0], [0.34, 0.2, 0.22], [0, 0, 0], 'pants'],
  ['torso', 'pelvis', [0, 0.252, -0.005], [0.38, 0.46, 0.24], [0, 0.1, 0], 'shirt'],
  ['head', 'torso', [0, 0.333, 0], [0.26, 0.27, 0.26], [0, 0.15, 0.01], 'skin'],
  ['uarmL', 'torso', [0.229, 0.297, 0.023], [0.12, 0.324, 0.12], [0.01, -0.15, 0], 'shirt'],
  ['larmL', 'uarmL', [0, -0.324, 0], [0.105, 0.17, 0.105], [0, -0.08, 0], 'skin'],
  ['handL', 'larmL', [0, -0.162, 0], [0.11, 0.11, 0.12], [0, -0.06, 0], 'skin'],
  ['uarmR', 'torso', [-0.229, 0.297, 0.023], [0.12, 0.324, 0.12], [-0.01, -0.15, 0], 'shirt'],
  ['larmR', 'uarmR', [0, -0.324, 0], [0.105, 0.17, 0.105], [0, -0.08, 0], 'skin'],
  ['handR', 'larmR', [0, -0.162, 0], [0.11, 0.11, 0.12], [0, -0.06, 0], 'skin'],
  ['thighL', 'pelvis', [0.117, -0.01, 0], [0.16, 0.414, 0.16], [0, -0.2, 0], 'pants'],
  ['shinL', 'thighL', [0, -0.414, 0], [0.13, 0.421, 0.13], [0, -0.21, 0], 'pants'],
  ['footL', 'shinL', [0, -0.421, 0], [0.13, 0.08, 0.26], [0, -0.035, 0.05], 'boots'],
  ['thighR', 'pelvis', [-0.117, -0.01, 0], [0.16, 0.414, 0.16], [0, -0.2, 0], 'pants'],
  ['shinR', 'thighR', [0, -0.414, 0], [0.13, 0.421, 0.13], [0, -0.21, 0], 'pants'],
  ['footR', 'shinR', [0, -0.421, 0], [0.13, 0.08, 0.26], [0, -0.035, 0.05], 'boots'],
];

// Segment frames are plain Object3Ds carrying userData.size (the physics box); each carries its cube as the visible body.
export function buildRig(palette) {
  const root = new THREE.Group();
  const j = {}, m = {}, mats = {};
  const cubes = true;
  for (const k in palette) mats[k] = new THREE.MeshStandardMaterial({ color: palette[k], roughness: 0.75 });
  for (const [name, parent, off, size, c, col] of SEGS) {
    const g = new THREE.Group(); g.position.set(...off); g.rotation.order = 'YXZ';
    (parent ? j[parent] : root).add(g);
    const seg = new THREE.Object3D(); seg.name = name;
    seg.position.set(...c); seg.userData.seg = name; seg.userData.size = size;
    { const box = new THREE.Mesh(cube(...size), mats[col]); box.castShadow = true; box.receiveShadow = true; box.userData.visual = true; seg.add(box); }
    g.add(seg); j[name] = g; m[name] = seg;
  }
  { // detail cubes (visor/brow, belt, shoulder pads) for silhouette
    const add = (s, size, pos, col) => { const x = new THREE.Mesh(cube(...size), mats[col]); x.position.set(...pos); x.castShadow = true; x.userData.visual = true; m[s].add(x); return x; };
    add('head', [0.28, 0.06, 0.06], [0, 0.03, 0.13], palette.dark ? 'dark' : 'pants');
    add('pelvis', [0.36, 0.06, 0.24], [0, 0.07, 0], palette.dark ? 'dark' : 'boots');
    add('uarmL', [0.16, 0.08, 0.16], [0, 0.12, 0], palette.dark ? 'dark' : 'pants');
    add('uarmR', [0.16, 0.08, 0.16], [0, 0.12, 0], palette.dark ? 'dark' : 'pants');
  }
  // arm lengths are the cube rig's real joint distances (shoulder->elbow, elbow->wrist), so IK lands the visible hands
  const rig = { root, j, m, mats, cubes, pose: {}, cut: new Set(), hipH: 0.918, armA: 0.324, armB: 0.162 };
  // weapon / claw mount: the fist centre below the wrist joint, in the hand frame (-Y fingers, +Z thumb, palm +X on the right)
  rig.handAnchor = side => { const a = new THREE.Object3D(); a.position.set(0, -0.06, 0); j['hand' + side].add(a); return a; };
  rig.base = {}; for (const k in j) rig.base[k] = j[k].position.clone();
  return rig;
}

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), DOWN = new THREE.Vector3(0, -1, 0);
const _v = new THREE.Vector3();
function damp(a, b, k, dt) { return a + (b - a) * (1 - Math.exp(-k * dt)); }
function slerpTo(obj, x, y, z, k, dt) { _e.set(x, y, z); _q.setFromEuler(_e); obj.quaternion.slerp(_q, 1 - Math.exp(-k * dt)); }

// Point an upper arm along dir (in torso space) with an elbow bend.
export function aimArm(rig, side, dir, bend, k, dt, roll = 0) {
  const ua = rig.j['uarm' + side], la = rig.j['larm' + side];
  _v.copy(dir).normalize();
  _q.setFromUnitVectors(DOWN, _v);
  _q2.setFromAxisAngle(DOWN, roll); _q.multiply(_q2);
  ua.quaternion.slerp(_q, 1 - Math.exp(-k * dt));
  slerpTo(la, -bend, 0, 0, k, dt);
}

// Two-bone IK: put the wrist on a world-space target (hands planted on walls, aimed strikes).
// The elbow is solved toward a pole that sits OUTWARD and DOWN from the shoulder, so elbows never fold inward.
const _w = new THREE.Vector3(), _tq = new THREE.Quaternion(), _E = new THREE.Vector3(), _u = new THREE.Vector3(), _f = new THREE.Vector3();
const _X = new THREE.Vector3(), _Y = new THREE.Vector3(), _Z = new THREE.Vector3(), _P = new THREE.Vector3(), _M = new THREE.Matrix4(), _wq = new THREE.Quaternion();
export const ARM_A = 0.3, ARM_B = 0.36;
export function solveElbow(S, T, outward, out = new THREE.Vector3(), a = ARM_A, b = ARM_B, po = 1.3) {
  const along = _u.subVectors(T, S); let d = along.length(); along.divideScalar(d || 1);
  d = Math.min(d, a + b - 1e-3);
  const cosA = Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)));
  _P.copy(outward).multiplyScalar(po).add(_f.set(0, -0.6, 0)).normalize();                // pole: outward and down
  _P.addScaledVector(along, -_P.dot(along)); if (_P.lengthSq() < 1e-6) _P.set(0, -1, 0).addScaledVector(along, -along.y); _P.normalize();
  return out.copy(S).addScaledVector(along, a * cosA).addScaledVector(_P, a * Math.sqrt(1 - cosA * cosA));
}
export function aimArmAt(rig, side, target, k, dt, poleOut = 1.3) {
  const ua = rig.j['uarm' + side], la = rig.j['larm' + side], torso = rig.j.torso;
  ua.getWorldPosition(_w); torso.getWorldQuaternion(_tq);
  const outward = _X.set(side === 'L' ? 1 : -1, 0, 0).applyQuaternion(_tq);
  solveElbow(_w, target, outward, _E, rig.armA, rig.armB, poleOut);
  const u = _Y.subVectors(_E, _w).normalize();                              // upper arm direction
  const fd = _Z.subVectors(target, _E).normalize();                         // forearm direction
  const bend = Math.acos(Math.max(-1, Math.min(1, u.dot(fd))));
  // upper-arm frame: -Y along the bone, +Z toward where the forearm folds (larm bends about local X)
  const Y = u.clone().negate(), Z = fd.clone().addScaledVector(u, -fd.dot(u));
  if (Z.lengthSq() < 1e-6) Z.copy(outward).negate().addScaledVector(u, outward.dot(u)); Z.normalize();
  const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
  _M.makeBasis(X, Y, Z); _wq.setFromRotationMatrix(_M);
  _wq.premultiply(_tq.invert());                                            // world -> torso space
  ua.quaternion.slerp(_wq, 1 - Math.exp(-k * dt));
  slerpTo(la, -bend, 0, 0, k, dt);
}

// s: {speed, grounded, vy, t, dt, squash, lean, crouch, stance, armL, armR, legs, crawl, scramble, twist, torsoX, headX, hipX, roll}
export function animate(rig, s) {
  const { j } = rig, dt = s.dt;
  const sp = Math.min(1.5, s.speed / 6), k = 18;
  rig.phase = (rig.phase || 0) + dt * (3.2 + s.speed * 1.5);
  const ph = rig.phase, sw = Math.sin(ph), cw = Math.cos(ph);
  const breathe = Math.sin(s.t * 2.1) * 0.014;
  const stance = s.stance || 0;
  const H0 = rig.hipH;
  let hipY = H0, hipX = s.hipX || 0, lean = 0.03 + sp * 0.14 + (s.lean || 0), pelvisYaw = 0, pelvisRoll = 0;
  let tl = 0, tr = 0, kl = 0, kr = 0, fl = 0, fr = 0;
  const a = Math.min(1, sp * 1.3);
  if (s.crawl) { // legless or crippled: dragging along the floor on the arms
    hipY = 0.32 + Math.abs(sw) * 0.04; lean = 1.25 + sw * 0.08; tl = -0.2 + sw * 0.25; tr = -0.2 - sw * 0.25; kl = 0.4; kr = 0.4;
  } else if (s.grounded) {
    // running mechanics: thigh drives forward, knee folds hard in swing, near-straight push-off, flight bounce
    tl = -sw * (0.25 + 0.85 * a); tr = sw * (0.25 + 0.85 * a);
    tl *= a; tr *= a;
    kl = (0.12 + Math.max(0, cw) * 1.9 + Math.max(0, -cw) * 0.25) * a; kr = (0.12 + Math.max(0, -cw) * 1.9 + Math.max(0, cw) * 0.25) * a;
    hipY = H0 - a * 0.1 + a * 0.08 * Math.abs(sw) + breathe * (1 - a);
    pelvisYaw = sw * 0.22 * a; pelvisRoll = cw * 0.06 * a;
    fl = cw > 0 ? 0.5 * a : -0.1 * a; fr = cw < 0 ? 0.5 * a : -0.1 * a; // toe drops in swing, flat when planted
    if (stance > 0) { // crouched fighting stance: left foot forward, knees bent, weight rocking
      const st = stance * (1 - a), rock = Math.sin(s.t * 1.7) * 0.05;
      tl += st * (-0.75); tr += st * 0.45; kl += st * 1.0; kr += st * 0.95;
      hipY -= st * 0.17; hipX += rock * st * 0.6; pelvisYaw += st * 0.35; pelvisRoll += rock * st;
      lean += st * 0.08; // athletic, not hunched: the crouch is in the knees
    }
  } else {
    const up = s.vy > 0;
    tl = up ? -1.3 : -0.55; tr = up ? 0.35 : -0.15; kl = up ? 1.9 : 0.7; kr = up ? 0.9 : 0.4;
    lean = up ? -0.1 : 0.12;
  }
  if (s.crouch) { const c = s.crouch; hipY -= c * 0.42; tl -= c * 1.0; tr -= c * 1.0; kl += c * 1.9; kr += c * 1.9; lean += c * 0.45; }
  if (s.scramble) { // feet clawing for grip on a wall
    const q = s.t * 26;
    tl = -0.9 + Math.sin(q) * 0.7 * s.scramble; tr = -0.9 + Math.sin(q + 2.4) * 0.7 * s.scramble;
    kl = 1.3 + Math.cos(q) * 0.6 * s.scramble; kr = 1.3 + Math.cos(q + 2.4) * 0.6 * s.scramble;
  }
  if (s.legs) ({ tl, tr, kl, kr } = { tl, tr, kl, kr, ...s.legs });
  const sq = s.squash || 0;
  j.pelvis.position.y = damp(j.pelvis.position.y, hipY - sq * 0.22, 26, dt);
  j.pelvis.position.x = damp(j.pelvis.position.x, hipX, 12, dt);
  const kk = s.legK || k;
  slerpTo(j.pelvis, s.crawl ? 0.9 : 0, pelvisYaw + (s.twist || 0) * 0.35, (s.roll || 0) + pelvisRoll, kk, dt);
  slerpTo(j.torso, lean + (s.torsoX || 0) - (s.crawl ? 0.9 : 0), (s.grounded ? -pelvisYaw * 1.6 : 0) + (s.twist || 0) * 0.75, -(s.roll || 0) * 0.6 - pelvisRoll * 0.8, s.torsoK || k, dt);
  slerpTo(j.head, -lean * 0.6 + (s.headX || 0) - (s.crawl ? -0.3 : 0), -(s.twist || 0) * 0.45 + pelvisYaw * 0.4 + (s.headY || 0), 0, s.headK || k, dt);
  slerpTo(j.thighL, tl, 0, 0.04 + stance * 0.08, kk, dt); slerpTo(j.thighR, tr, 0, -0.04 - stance * 0.08, kk, dt);
  slerpTo(j.shinL, kl, 0, 0, kk, dt); slerpTo(j.shinR, kr, 0, 0, kk, dt);
  slerpTo(j.footL, -tl - kl + 0.06 + fl, 0, 0, kk, dt); slerpTo(j.footR, -tr - kr + 0.06 + fr, 0, 0, kk, dt);
  // arms pump against the legs with elbows near 90 degrees when running
  if (s.noArms || s.armL === 'ik') {} // caller drives the arm (planted hands, aimed strikes)
  else if (!s.armL) aimArm(rig, 'L', _v.set(0.2 + (s.grounded ? 0 : 0.6), -1, s.grounded ? sw * 1.1 * a + 0.08 : 0.4), s.grounded ? 0.3 + a * 1.25 : 0.9, k, dt);
  else aimArm(rig, 'L', s.armL.dir, s.armL.bend, s.armL.k || 30, dt, s.armL.roll || 0);
  if (s.noArms || s.armR === 'ik') {}
  else if (!s.armR) aimArm(rig, 'R', _v.set(-0.2 - (s.grounded ? 0 : 0.6), -1, s.grounded ? -sw * 1.1 * a + 0.08 : 0.4), s.grounded ? 0.3 + a * 1.25 : 0.9, k, dt);
  else aimArm(rig, 'R', s.armR.dir, s.armR.bend, s.armR.k || 30, dt, s.armR.roll || 0);
  // Mixamo clip layer: blends the sampled pose over the procedural one for the masked joints (arms the caller
  // poses itself, or IK-driven arms, are left alone)
  if (s.clip && s.clip.pose) {
    const P = s.clip.pose, a = Math.min(1, (1 - Math.exp(-(s.clip.k || 28) * dt)) * (s.clip.w ?? 1));
    for (const seg of (s.clip.mask || MASK.full)) {
      const side = seg.slice(-1);
      if (/^(uarm|larm|hand)/.test(seg) && (s.noArms || s['arm' + side])) continue;
      if (P[seg]) j[seg].quaternion.slerp(P[seg], a);
    }
    if (s.clip.rootY && P.dy !== undefined) j.pelvis.position.y += P.dy * a;
  }
  rig.root.scale.set(1 + sq * 0.1, 1 - sq * 0.12, 1 + sq * 0.1);
  const prev = rig.prevSw || 0; rig.prevSw = sw;
  return { stepL: s.grounded && sp > 0.2 && prev < 0 && sw >= 0, stepR: s.grounded && sp > 0.2 && prev > 0 && sw <= 0 };
}
