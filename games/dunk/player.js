// =====================================================================
// DUNK :: player.js - A BASKETBALL PLAYER
// =====================================================================
//
// Liam: *"the lowpoly is just cubes not highrise style lowpoly"*.
//
// Correct, and the fix was already on the disk: this now builds the SAME
// skinned character HIGHRISE uses - `rig.js` and `assets/refman.js`, 700
// triangles, 21 bones, generated UV islands - and poses it by rotating
// bones. The boxes are gone.
//
// WHY THAT RIG AND NOT A GLB OFF THE INTERNET: its bind pose has no
// rotations in it, only translations, so every bone's local axes are the
// body's own. That is what makes an animation readable - rotate a hip
// about X and the leg swings forward, rotate the spine about Y and he
// turns at the waist. A rig exported from a modelling package almost
// never has that property and posing one is quaternion soup.
//
// WHAT IS IN HERE:
//   makePlayer   build the mesh, paint the kit onto its own UVs
//   posePlayer   one frame of animation: run, dribble, shoot, block,
//                steal, jump, land
//   handPoint    where the ball is when he is holding it
//
// The cloth simulation that used to be here is gone and `kit.js` explains
// why in detail: at 25 cm across the chest, cloth needs more clearance
// than the whole torso has, and it bunched no matter how it was cut. The
// kit is painted on now, which is what HIGHRISE does with its clothes.
import * as THREE from '../_deck/three.module.js';
import { buildBody, REST } from './rig.js';
import { kitSheet } from './kit.js';

/** how far a bone should be from its rest pose, in the rig's own frame */
function setBone(bone, rest, x, y, z) {
  bone.rotation.set((rest ? rest[0] : 0) + x, (rest ? rest[1] : 0) + y, (rest ? rest[2] : 0) + z);
}

export function makePlayer(scene, opts) {
  const sheet = kitSheet(opts);
  const map = new THREE.CanvasTexture(sheet);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  // NEAREST, like HIGHRISE: the sheet is 256 px for a whole man, and
  // smoothing it is what makes a low-poly character read as a blurry
  // modern one rather than as a deliberate style.
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.LinearMipmapLinearFilter;

  const mat = new THREE.MeshStandardMaterial({
    map, roughness: 0.74, metalness: 0.02,
  });

  // a basketball player is tall, and the build varies a little per man so
  // a team is not five identical bodies
  const body = buildBody({
    height: opts.height || 1.95,
    chest: opts.chest || 1.0,
    shoulder: opts.shoulder || 1.05,
    arm: opts.arm || 1.04,
    leg: opts.leg || 1.06,
    gut: 0.92,
  }, mat);

  const group = new THREE.Group();
  group.add(body.mesh);
  body.mesh.castShadow = true;
  body.mesh.receiveShadow = true;
  scene.add(group);

  return {
    group, body, by: body.by, height: body.height,
    cycle: rndPhase(), land: 0, dribble: rndPhase(),
    dispose() { scene.remove(group); },
  };
}

const rndPhase = () => Math.random() * Math.PI * 2;

/**
 * One frame of animation.
 *
 * Everything is a rotation off the rest pose, and the rest pose is the
 * man standing still - so the numbers below say what they mean. Nothing
 * in here is a keyframe: a run is two sines, a dribble is one, a shot is
 * a curve through a release, and that is the whole library.
 *
 * @param P   from makePlayer
 * @param dt
 * @param s   { x, y, z, yaw, speed, air, hasBall, hand, action, actionT,
 *              defending, charge }
 */
export function posePlayer(P, dt, s) {
  const by = P.by;
  const g = P.group;
  g.position.set(s.x, s.y, s.z);
  // the rig faces -Z, and yaw 0 in the game means facing +Z, so the body
  // carries a half turn. This is the ONLY place that correction lives.
  g.rotation.y = s.yaw + Math.PI;

  const run = Math.min(1, (s.speed || 0) / 7.5);
  P.cycle += dt * (3 + run * 11);
  P.land = Math.max(0, P.land - dt * 3.2);
  const sw = Math.sin(P.cycle), sw2 = Math.cos(P.cycle);

  // ---- legs ------------------------------------------------------------
  if (s.air) {
    // knees up on the way up, legs reaching down as he comes back
    const tuck = s.vy > 0 ? 1 : 0.45;
    setBone(by.hipR, REST.hipR, -0.55 * tuck, 0, 0);
    setBone(by.hipL, REST.hipL, -0.2 * tuck, 0, 0);
    setBone(by.kneeR, REST.kneeR, 0.9 * tuck, 0, 0);
    setBone(by.kneeL, REST.kneeL, 0.5 * tuck, 0, 0);
  } else {
    const swing = 0.72 * run;
    setBone(by.hipR, REST.hipR, sw * swing - 0.08 - P.land * 0.4, 0, 0);
    setBone(by.hipL, REST.hipL, -sw * swing - 0.08 - P.land * 0.4, 0, 0);
    setBone(by.kneeR, REST.kneeR, Math.max(0, -sw2) * 1.0 * run + 0.1 + P.land * 0.8, 0, 0);
    setBone(by.kneeL, REST.kneeL, Math.max(0, sw2) * 1.0 * run + 0.1 + P.land * 0.8, 0, 0);
  }
  by.ankleR.rotation.set(-0.1 + (s.air ? 0.3 : 0), 0, 0);
  by.ankleL.rotation.set(-0.1 + (s.air ? 0.3 : 0), 0, 0);

  // ---- the spine: he leans where he is going, and crouches on defence --
  const crouch = s.defending ? 0.16 : 0;
  by.root.position.y = P.body.rootBind.y
    - (Math.abs(sw) * 0.02 + crouch * 0.09 + P.land * 0.12) * P.height;
  by.spine.rotation.set(0.05 + run * 0.14 + crouch * 0.5, -sw * 0.07 * run, 0);
  by.chest.rotation.set(0.02, sw * 0.1 * run, 0);
  by.neck.rotation.set(-0.04 - run * 0.1 - crouch * 0.2, 0, 0);

  // ---- arms -------------------------------------------------------------
  const hand = s.hand === undefined ? 1 : s.hand;
  // "R" on the rig is the man's right, which is -X, so a right-handed
  // dribble is the R arm
  const A = hand > 0 ? 'R' : 'L';
  const B = hand > 0 ? 'L' : 'R';
  const sh = (side) => by['shoulder' + side];
  const el = (side) => by['elbow' + side];
  const rsh = (side) => REST['shoulder' + side];
  const rel = (side) => REST['elbow' + side];

  if (s.action === 'shoot') {
    // up through the release, then held there for the follow-through
    const t = Math.min(1, s.actionT || 0);
    const up = Math.sin(Math.min(1, t * 1.25) * Math.PI * 0.5);
    setBone(sh(A), rsh(A), -2.55 * up, 0, 0);
    setBone(el(A), rel(A), -1.5 + up * 1.35, 0, 0);
    setBone(sh(B), rsh(B), -2.05 * up, 0, 0);
    setBone(el(B), rel(B), -1.5 + up * 0.85, 0, 0);
  } else if (s.action === 'block') {
    setBone(sh('R'), rsh('R'), -2.8, 0, -0.12);
    setBone(sh('L'), rsh('L'), -2.8, 0, 0.12);
    setBone(el('R'), rel('R'), -0.1, 0, 0);
    setBone(el('L'), rel('L'), -0.1, 0, 0);
  } else if (s.action === 'steal') {
    const t = Math.min(1, (s.actionT || 0) * 2);
    const sweep = Math.sin(t * Math.PI);
    setBone(sh(A), rsh(A), -1.1 - sweep * 0.6, sweep * (hand > 0 ? 1.1 : -1.1), 0);
    setBone(el(A), rel(A), -0.35, 0, 0);
    setBone(sh(B), rsh(B), -0.3, 0, 0);
    setBone(el(B), rel(B), -0.6, 0, 0);
  } else if (s.hasBall) {
    // DRIBBLING. The carrying arm pumps down and up; the other is out as
    // a guard, which is also what tells a defender which hand it is in.
    P.dribble += dt * (7 + run * 4);
    const d = Math.sin(P.dribble);
    setBone(sh(A), rsh(A), -0.3 + d * 0.5, 0, 0);
    setBone(el(A), rel(A), -0.6 - Math.max(0, d) * 0.55, 0, 0);
    setBone(sh(B), rsh(B), -0.45, 0, (B === 'R' ? -1 : 1) * 0.5);
    setBone(el(B), rel(B), -1.0, 0, 0);
  } else if (s.defending) {
    // hands up and out, which is what a man guarding you looks like
    const w = Math.sin(P.cycle * 0.7) * 0.12;
    setBone(sh('R'), rsh('R'), -0.85 + w, 0, -0.55);
    setBone(sh('L'), rsh('L'), -0.85 - w, 0, 0.55);
    setBone(el('R'), rel('R'), -0.35, 0, 0);
    setBone(el('L'), rel('L'), -0.35, 0, 0);
  } else {
    // running: the arms swing opposite the legs
    setBone(sh('R'), rsh('R'), -sw * 0.75 * run - 0.2, 0, -0.1);
    setBone(sh('L'), rsh('L'), sw * 0.75 * run - 0.2, 0, 0.1);
    setBone(el('R'), rel('R'), -0.45 - Math.abs(sw2) * 0.5 * run, 0, 0);
    setBone(el('L'), rel('L'), -0.45 - Math.abs(sw2) * 0.5 * run, 0, 0);
  }
}

const _v = new THREE.Vector3();

/** where the ball sits when he is holding it */
export function handPoint(P, hand, out) {
  const w = hand > 0 ? P.by.wristR : P.by.wristL;
  w.updateMatrixWorld(true);
  return w.getWorldPosition(out || _v.clone());
}
