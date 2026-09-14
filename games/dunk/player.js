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
    cycle: rndPhase(), land: 0, dribble: rndPhase(), dribblePhase: 0, idle: rndPhase(),
    dispose() { scene.remove(group); },
  };
}

const rndPhase = () => Math.random() * Math.PI * 2;

/**
 * One frame of animation.
 *
 * Liam: *"much better animations, it should really feel like
 * basketball"*.
 *
 * The first version was two sines and a curve: legs scissored, arms
 * swung, a shot went up. It read as a mannequin being moved rather than a
 * person playing, and the reason is that it animated JOINTS instead of
 * animating a body doing something. This animates the body.
 *
 * FOUR THINGS CARRY MOST OF IT, and none of them are the legs:
 *
 *   THE STRIDE HAS A PLANT. A run is not a smooth scissor - the foot
 *   lands, the knee takes the weight and straightens, and the body drops
 *   onto it. That drop is at TWICE stride frequency, which is what makes
 *   a run read as heavy rather than as skating.
 *
 *   THE SHOULDERS COUNTER-ROTATE AGAINST THE HIPS. Everybody's shoulders
 *   turn the opposite way to their pelvis when they run. Leave it out and
 *   the torso is a rigid box being carried along; put it in and the
 *   figure has a spine.
 *
 *   THE HEAD STAYS LEVEL. People stabilise their heads against the bob
 *   without thinking about it. Bobbing it with the body is the single
 *   most obvious tell of a cheap walk cycle.
 *
 *   A SHOT IS FOUR MOVEMENTS, NOT ONE. Gather, rise, release, follow
 *   through - and the follow-through is the one everybody recognises,
 *   because it is the pose every photograph of a jump shot is of.
 *
 * @param P   from makePlayer
 * @param dt
 * @param s   { x, y, z, yaw, speed, vy, air, hasBall, hand, action,
 *              actionT, defending, charge }
 */
export function posePlayer(P, dt, s) {
  const by = P.by;
  const g = P.group;
  g.position.set(s.x, s.y, s.z);
  // the rig faces -Z, and yaw 0 in the game means facing +Z, so the body
  // carries a half turn. This is the ONLY place that correction lives.
  g.rotation.y = s.yaw + Math.PI;

  const run = Math.min(1, (s.speed || 0) / 6.5);
  // stride rate rises with speed but not linearly - a jog and a sprint
  // differ more in stride LENGTH than in cadence
  P.cycle += dt * (2.4 + Math.sqrt(run) * 9.5);
  P.land = Math.max(0, P.land - dt * 3.2);
  P.idle = (P.idle || 0) + dt;

  const th = P.cycle;
  const sw = Math.sin(th), sw2 = Math.cos(th);
  // the plant: twice a stride, sharpened so it is a knock rather than a
  // wave. This one number is most of the weight in the whole figure.
  const plant = Math.pow(Math.abs(Math.sin(th)), 3) * run;

  // ---- legs ------------------------------------------------------------
  if (s.air) {
    // GOING UP he tucks; COMING DOWN he reaches for the floor. Reading the
    // sign of vy is what tells the two apart, and it was being passed as
    // undefined until this was written, so every jump posed as a descent.
    const rising = (s.vy || 0) > 0;
    const tuck = rising ? 1 : 0.3;
    const reach = rising ? 0 : 1;
    setBone(by.hipR, REST.hipR, -0.62 * tuck + 0.22 * reach, 0, 0);
    setBone(by.hipL, REST.hipL, -0.26 * tuck + 0.30 * reach, 0, 0);
    setBone(by.kneeR, REST.kneeR, 1.05 * tuck + 0.14 * reach, 0, 0);
    setBone(by.kneeL, REST.kneeL, 0.58 * tuck + 0.10 * reach, 0, 0);
    by.ankleR.rotation.set(0.34 * tuck - 0.24 * reach, 0, 0);
    by.ankleL.rotation.set(0.30 * tuck - 0.24 * reach, 0, 0);
  } else if (s.defending) {
    // A DEFENSIVE STANCE IS NOT A CROUCH. The feet are wide, the knees are
    // out over them, and the weight is back on the heels - it is a
    // sideways shuffle, so the legs splay rather than scissor.
    const shuf = Math.sin(th * 0.8) * 0.16 * Math.max(0.25, run);
    setBone(by.hipR, REST.hipR, -0.30 + shuf, 0, -0.20);
    setBone(by.hipL, REST.hipL, -0.30 - shuf, 0, 0.20);
    setBone(by.kneeR, REST.kneeR, 0.66, 0, 0);
    setBone(by.kneeL, REST.kneeL, 0.66, 0, 0);
    by.ankleR.rotation.set(-0.30, 0, 0.10);
    by.ankleL.rotation.set(-0.30, 0, -0.10);
  } else {
    const swing = 0.80 * run;
    // the knee only folds on the RECOVERY half of the stride; on the
    // drive half it straightens through the plant
    const foldR = Math.max(0, -sw2) * 1.25 * run;
    const foldL = Math.max(0, sw2) * 1.25 * run;
    setBone(by.hipR, REST.hipR, sw * swing - 0.06 - P.land * 0.45, 0, 0);
    setBone(by.hipL, REST.hipL, -sw * swing - 0.06 - P.land * 0.45, 0, 0);
    setBone(by.kneeR, REST.kneeR, foldR + 0.10 + P.land * 0.85, 0, 0);
    setBone(by.kneeL, REST.kneeL, foldL + 0.10 + P.land * 0.85, 0, 0);
    // the toe points on the way through and the heel lands flat
    by.ankleR.rotation.set(-0.10 + Math.max(0, -sw) * 0.42 * run, 0, 0);
    by.ankleL.rotation.set(-0.10 + Math.max(0, sw) * 0.42 * run, 0, 0);
  }

  // ---- the spine, and the head that stays level -------------------------
  const crouch = s.defending ? 1 : 0;
  const bob = (plant * 0.055 + crouch * 0.085 + P.land * 0.12) * P.height;
  by.root.position.y = P.body.rootBind.y - bob;

  const lean = 0.06 + run * 0.20 + crouch * 0.34;
  // hips turn one way, shoulders the other - this is the counter-rotation
  const hipTwist = -sw * 0.11 * run;
  const shoulderTwist = sw * 0.20 * run;
  by.spine.rotation.set(lean, hipTwist, -sw * 0.05 * run);
  by.chest.rotation.set(0.02 + crouch * 0.10, shoulderTwist, sw * 0.04 * run);
  // and the neck cancels the lean and the bob, so he looks where he is going
  by.neck.rotation.set(-lean * 0.85 - run * 0.05 + plant * 0.05, -shoulderTwist * 0.4, 0);

  // ---- arms -------------------------------------------------------------
  const hand = s.hand === undefined ? 1 : s.hand;
  const A = hand > 0 ? 'R' : 'L';        // the ball hand
  const B = hand > 0 ? 'L' : 'R';
  const sh = (side) => by['shoulder' + side];
  const el = (side) => by['elbow' + side];
  const rsh = (side) => REST['shoulder' + side];
  const rel = (side) => REST['elbow' + side];
  const wr = (side) => by['wrist' + side];

  if (s.action === 'shoot') {
    // A JUMP SHOT IN FOUR PARTS.
    //
    //   0.00-0.22  GATHER   ball comes off the dribble to the hip, knees load
    //   0.22-0.52  RISE     up to the set point beside the forehead
    //   0.52-0.66  RELEASE  the elbow extends and the ball leaves
    //   0.66-1.00  FOLLOW   arm held high, wrist snapped over - the pose
    //                       every photograph of a shooter is of
    const t = Math.min(1, s.actionT || 0);
    const ease = (a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));
    const smooth = (v) => v * v * (3 - 2 * v);
    const gather = smooth(ease(0, 0.22));
    const rise = smooth(ease(0.22, 0.52));
    const release = smooth(ease(0.52, 0.66));
    const follow = smooth(ease(0.66, 1));

    // the shooting arm: down at the hip, up to the set point, then through
    const shoulderA = -0.35 * gather - 1.35 * rise - 0.95 * release;
    const elbowA = -0.55 - 1.25 * gather + 0.30 * rise + 1.35 * release;
    setBone(sh(A), rsh(A), shoulderA, 0, 0);
    setBone(el(A), rel(A), elbowA, 0, 0);
    // THE WRIST SNAP. It is a tenth of a second and it is the single most
    // recognisable thing a shooter does.
    wr(A).rotation.set(0.2 + release * 1.15 - follow * 0.25, 0, 0);

    // the guide hand comes up beside it and peels away at the release
    setBone(sh(B), rsh(B), -0.25 * gather - 1.05 * rise - 0.30 * release,
            (B === 'R' ? -1 : 1) * (0.30 * rise - 0.45 * release), 0);
    setBone(el(B), rel(B), -1.25 + 0.35 * rise - 0.30 * release, 0, 0);
  } else if (s.action === 'block') {
    const t = Math.min(1, (s.actionT || 0) * 2.2);
    const up = Math.sin(Math.min(1, t) * Math.PI * 0.5);
    setBone(sh('R'), rsh('R'), -2.95 * up, 0, -0.14);
    setBone(sh('L'), rsh('L'), -2.95 * up, 0, 0.14);
    setBone(el('R'), rel('R'), -0.06, 0, 0);
    setBone(el('L'), rel('L'), -0.06, 0, 0);
    wr('R').rotation.set(-0.25, 0, 0);
    wr('L').rotation.set(-0.25, 0, 0);
  } else if (s.action === 'steal') {
    // a fast stab across the body and back, not a wave
    const t = Math.min(1, (s.actionT || 0) * 2.4);
    const stab = Math.sin(Math.min(1, t) * Math.PI);
    const snap = Math.pow(stab, 0.55);
    setBone(sh(A), rsh(A), -1.15 - snap * 0.75, snap * (hand > 0 ? 1.25 : -1.25), 0);
    setBone(el(A), rel(A), -0.55 + snap * 0.35, 0, 0);
    setBone(sh(B), rsh(B), -0.45, 0, (B === 'R' ? -1 : 1) * 0.35);
    setBone(el(B), rel(B), -0.75, 0, 0);
  } else if (s.hasBall) {
    // DRIBBLING. The hand pushes DOWN and then rides back up with the
    // ball, which is a different motion from swinging an arm: the push is
    // quick, the recovery is slow, so the phase is skewed rather than
    // sinusoidal. The other arm is out as a guard, and that is also what
    // tells a defender which hand the ball is in.
    P.dribble += dt * (6.5 + run * 3.2);
    const ph = P.dribble % (Math.PI * 2);
    // skewed: fast down-stroke, slow return
    const d = ph < Math.PI * 0.65
      ? Math.sin(ph / 0.65 * 0.5)
      : Math.cos((ph - Math.PI * 0.65) / (Math.PI * 1.35) * Math.PI) * 0.5 + 0.5;
    P.dribblePhase = d;
    setBone(sh(A), rsh(A), -0.22 + d * 0.62, 0, (A === 'R' ? -1 : 1) * 0.14);
    setBone(el(A), rel(A), -0.80 - d * 0.55, 0, 0);
    wr(A).rotation.set(-0.25 + d * 0.85, 0, 0);
    setBone(sh(B), rsh(B), -0.50, 0, (B === 'R' ? -1 : 1) * 0.62);
    setBone(el(B), rel(B), -1.15, 0, 0);
    wr(B).rotation.set(0, 0, 0);
  } else if (s.defending) {
    // hands wide and low, palms up, moving a little - a man guarding you
    const w = Math.sin(P.cycle * 0.9) * 0.14;
    setBone(sh('R'), rsh('R'), -0.70 + w, 0, -0.78);
    setBone(sh('L'), rsh('L'), -0.70 - w, 0, 0.78);
    setBone(el('R'), rel('R'), -0.55, 0, 0);
    setBone(el('L'), rel('L'), -0.55, 0, 0);
    wr('R').rotation.set(-0.35, 0, 0);
    wr('L').rotation.set(-0.35, 0, 0);
  } else if (run < 0.06) {
    // STANDING. Not frozen: a slow breath and a shift of weight, because
    // a perfectly still figure in a crowd of moving ones looks broken.
    const br = Math.sin(P.idle * 1.5) * 0.035;
    setBone(sh('R'), rsh('R'), -0.16 + br, 0, -0.13);
    setBone(sh('L'), rsh('L'), -0.16 - br, 0, 0.13);
    setBone(el('R'), rel('R'), -0.32, 0, 0);
    setBone(el('L'), rel('L'), -0.32, 0, 0);
    wr('R').rotation.set(0, 0, 0);
    wr('L').rotation.set(0, 0, 0);
  } else {
    // RUNNING. Arms swing opposite the legs and the elbow closes on the
    // forward swing, which is what a runner's arm actually does - it does
    // not stay at a fixed angle.
    const swingR = -sw * 0.85 * run, swingL = sw * 0.85 * run;
    setBone(sh('R'), rsh('R'), swingR - 0.22, 0, -0.12);
    setBone(sh('L'), rsh('L'), swingL - 0.22, 0, 0.12);
    setBone(el('R'), rel('R'), -0.55 - Math.max(0, -sw) * 0.75 * run, 0, 0);
    setBone(el('L'), rel('L'), -0.55 - Math.max(0, sw) * 0.75 * run, 0, 0);
    wr('R').rotation.set(0, 0, 0);
    wr('L').rotation.set(0, 0, 0);
  }
}

const _v = new THREE.Vector3();

/** where the ball sits when he is holding it */
export function handPoint(P, hand, out) {
  const w = hand > 0 ? P.by.wristR : P.by.wristL;
  w.updateMatrixWorld(true);
  return w.getWorldPosition(out || _v.clone());
}
