// Mixamo clips (Liam's pack, baked to motion-only GLBs) retargeted onto the procedural cube rig.
// Each clip is pre-sampled at 30 fps into rig-local joint rotations: for every rig segment, the source bone's world
// rotation is turned back into a segment rotation through a bind-pose offset built from the bone's own direction
// (so the source bind pose doesn't have to match ours). rig.animate() blends these in under the procedural layers.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const SRC = { pelvis: 'Hips', torso: 'Spine2', head: 'Head', uarmL: 'LeftArm', larmL: 'LeftForeArm', handL: 'LeftHand', uarmR: 'RightArm', larmR: 'RightForeArm', handR: 'RightHand',
  thighL: 'LeftUpLeg', shinL: 'LeftLeg', footL: 'LeftFoot', thighR: 'RightUpLeg', shinR: 'RightLeg', footR: 'RightFoot' };
const CHILD = { uarmL: 'LeftForeArm', larmL: 'LeftHand', handL: 'LeftHandMiddle1', uarmR: 'RightForeArm', larmR: 'RightHand', handR: 'RightHandMiddle1',
  thighL: 'LeftLeg', shinL: 'LeftFoot', footL: 'LeftToeBase', thighR: 'RightLeg', shinR: 'RightFoot', footR: 'RightToeBase' };
const AXIS = { footL: [0, 0, 1], footR: [0, 0, 1] };
const PARENT = { pelvis: null, torso: 'pelvis', head: 'torso', uarmL: 'torso', larmL: 'uarmL', handL: 'larmL', uarmR: 'torso', larmR: 'uarmR', handR: 'larmR', thighL: 'pelvis', shinL: 'thighL', footL: 'shinL', thighR: 'pelvis', shinR: 'thighR', footR: 'shinR' };
export const SEGS = Object.keys(SRC);
export const CLIPS = {};
const FPS = 30;
// Posture caps (radians of forward pitch from vertical, chest and head): Mixamo's sprint leans ~37 degrees and drops the
// head ~20, which reads as a hunch on the mannequin. Chest pitch is capped for the locomotion clips and the head is
// brought back to looking ahead, so walking and running stay upright (a run keeps a slight athletic lean).
const UPRIGHT = { sprint: [0.2, 0.06], idle_to_sprint: [0.2, 0.06], walking_3: [0.07, 0.04], running_jump: [0.2, 0.08], jumping_1: [0.12, 0.06], jumping_2: [0.12, 0.06] };
const _X = new THREE.Vector3(1, 0, 0), _up = new THREE.Vector3(), _r = new THREE.Quaternion(), _pw = new THREE.Quaternion();
const pitchOf = q => { _up.set(0, 1, 0).applyQuaternion(q); return Math.atan2(_up.z, _up.y); };
// rotate a joint's local rotation so its world pitch (parent world pw * local) stays within [lo, cap]
function capPitch(pw, local, cap, lo = -9) {
  const w = pw.clone().multiply(local), p = pitchOf(w), d = p > cap ? p - cap : p < lo ? p - lo : 0; if (!d) return local;
  _r.setFromAxisAngle(_X, -d); return pw.clone().invert().multiply(_r).multiply(w);
}
export function upright(loc, caps) {
  const [ct, ch] = caps;
  loc.torso = capPitch(loc.pelvis, loc.torso, ct);
  _pw.copy(loc.pelvis).multiply(loc.torso); loc.head = capPitch(_pw, loc.head, ch, -0.03);
}

export async function loadClips(names) {
  const loader = new GLTFLoader();
  await Promise.all(names.map(async n => {
    try { CLIPS[n] = bake(await loader.loadAsync(`assets/anim/${n}.glb`), n); } catch (e) { console.warn('[clips] ' + n + ': ' + e.message); }
  }));
}
// works offline too (tools pass parsed gltf)
export function bake(gltf, name) {
  const root = gltf.scene, clip = gltf.animations[0];
  const B = n => root.getObjectByName('mixamorig' + n) || root.getObjectByName('mixamorig:' + n) || root.getObjectByName(n);
  root.updateMatrixWorld(true);
  const off = {}, hip0 = B('Hips').getWorldPosition(new THREE.Vector3()).y;
  for (const seg of SEGS) {
    const b = B(SRC[seg]); if (!b) return null;
    const bq = b.getWorldQuaternion(new THREE.Quaternion()), rq = new THREE.Quaternion();
    if (CHILD[seg] && B(CHILD[seg])) { const d = B(CHILD[seg]).getWorldPosition(new THREE.Vector3()).sub(b.getWorldPosition(new THREE.Vector3())).normalize(); rq.setFromUnitVectors(new THREE.Vector3(...(AXIS[seg] || [0, -1, 0])), d); }
    off[seg] = rq.invert().multiply(bq).invert(); // rigWorld = boneWorld * off
  }
  const mixer = new THREE.AnimationMixer(root), act = mixer.clipAction(clip); act.play();
  const n = Math.max(2, Math.round(clip.duration * FPS) + 1), frames = [];
  const W = {};
  for (let f = 0; f < n; f++) {
    mixer.setTime(Math.min(clip.duration, f / FPS)); root.updateMatrixWorld(true);
    for (const seg of SEGS) W[seg] = B(SRC[seg]).getWorldQuaternion(new THREE.Quaternion()).multiply(off[seg]);
    const loc = {};
    for (const seg of SEGS) { const p = PARENT[seg]; loc[seg] = p ? W[p].clone().invert().multiply(W[seg]) : W[seg].clone(); }
    if (UPRIGHT[name]) upright(loc, UPRIGHT[name]);
    frames.push({ q: loc, dy: B('Hips').getWorldPosition(new THREE.Vector3()).y - hip0 });
  }
  mixer.stopAllAction(); mixer.uncacheRoot(root);
  return { name, dur: clip.duration, frames, hipScale: 0.97 / hip0 };
}
// pose at time t (seconds, clamped or looped): { seg: Quaternion }, hip height delta in rig metres
const _a = new THREE.Quaternion();
// walk <-> sprint on ONE shared gait phase, cross-faded by speed: no pop at the switch, and the phase advances by
// ground distance / stride length so the planted foot does not slide (stride = clip duration x its ground speed)
export function loco(o, dt, speed, out = {}) {
  const W = CLIPS.walking_3, R = CLIPS.sprint; if (!W || !R) return null;
  const b = Math.min(1, Math.max(0, (speed - 2.2) / 2.4)), bs = b * b * (3 - 2 * b);
  const stride = W.dur * 1.6 * (1 - bs) + R.dur * 5.7 * bs;
  o.locoPh = ((o.locoPh || 0) + dt * speed / stride) % 1;
  const w = sample('walking_3', o.locoPh * W.dur, true, o._lw || (o._lw = {})), r = sample('sprint', o.locoPh * R.dur, true, o._lr || (o._lr = {}));
  for (const seg in w) if (seg !== 'dy') out[seg] = (out[seg] || new THREE.Quaternion()).copy(w[seg]).slerp(r[seg], bs);
  out.dy = w.dy + (r.dy - w.dy) * bs;
  return out;
}
export function sample(name, t, loop = false, out = {}) {
  const c = CLIPS[name]; if (!c) return null;
  t = loop ? ((t % c.dur) + c.dur) % c.dur : Math.max(0, Math.min(c.dur, t));
  const x = t * FPS, i = Math.min(c.frames.length - 1, Math.floor(x)), j = Math.min(c.frames.length - 1, i + 1), k = x - i;
  const A = c.frames[i], Bf = c.frames[j];
  for (const seg of SEGS) out[seg] = (out[seg] || new THREE.Quaternion()).copy(A.q[seg]).slerp(Bf.q[seg], k);
  out.dy = (A.dy + (Bf.dy - A.dy) * k) * c.hipScale;
  return out;
}
export const clipDur = name => CLIPS[name]?.dur || 0;
// masks: which rig joints a clip may drive
export const MASK = {
  full: SEGS,
  legs: ['pelvis', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'],
  upper: ['torso', 'head', 'uarmL', 'larmL', 'handL', 'uarmR', 'larmR', 'handR'],
  body: ['pelvis', 'torso', 'head', 'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR'],
};
