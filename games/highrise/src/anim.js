// =====================================================================
// HIGHRISE :: anim.js - WHAT A BODY DOES
// =====================================================================
//
// Liam: *"add in good animations"*, *"make the NPC's smart able to shoot
// and have random weapons and capable of hand to hand combat"*, and the
// whole thing should read as *"a quick john wick fight sequence"*.
//
// Every animation here is CODE, not data. For a rig with twenty-one
// bones that is not a shortcut - it is smaller, it is tunable without a
// tool, and above all it can be driven CONTINUOUSLY. A walk that is a
// clip has to be cross-faded when the speed changes; a walk that is a
// function of stride phase and speed just gets faster, and the moment a
// man breaks into a run there is nothing to blend.
//
// It is built in layers, and the layers are the reason a man can reload
// while walking backwards and flinch in the middle of it:
//
//   1. STANCE      idle / walk / run - the whole body
//   2. HOLD        what his arms do with the weapon he is carrying
//   3. AIM         spine, neck and head turning toward what he is looking at
//   4. ACTION      a one-shot: fire, reload, swing, punch - arms and spine
//   5. FLINCH      additive, brief, from the direction of the hit
//   6. DEATH       takes the whole body over and never gives it back
//
// The one rule that makes all of it readable: BONES SHARE THE BODY'S
// AXES (see rig.js). Rotating a hip about X swings that leg forward.
// Rotating the spine about Y twists him at the waist. Rotating an elbow
// about X bends it. There is no quaternion arithmetic in this file.
import { blankPose, addPose, applyPose } from './rig.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
/** a 0..1 ramp up and back down again over a window */
const bump = (t, a, b) => {
  if (t <= a || t >= b) return 0;
  const k = (t - a) / (b - a);
  return Math.sin(k * Math.PI);
};

// ---------------------------------------------------------------------
// 1. STANCE
// ---------------------------------------------------------------------
//
// One function for standing, walking and running, because they ARE one
// thing with the amplitude turned up. `gait` is how much of a stride is
// happening at all, `run` is how much of that stride is a run - and both
// come straight off the speed, so a man accelerating out of a doorway
// stretches into a run instead of popping into one.
//
// The knee is the joint that decides whether this reads as walking or as
// a doll being waggled. It bends ONLY BACKWARD, and it bends most while
// the foot is off the floor swinging through - which is why the term is
// a clamped negative sine offset from the thigh's, and not a symmetric
// wobble. The first version let the knee bend both ways and every man on
// the floor walked like a flamingo.
export function stance(pose, { phase, gait, run, crouch, t, seed = 0 }) {
  const A = lerp(0.42, 0.86, run) * gait;            // thigh swing
  const K = lerp(1.05, 1.75, run) * gait;            // knee flexion
  const S = lerp(0.30, 0.62, run) * gait;            // arm swing
  const lean = lerp(0.05, 0.30, run) * gait;

  for (const side of [1, -1]) {
    const R = side > 0 ? 'R' : 'L';
    const p = phase + (side > 0 ? 0 : Math.PI);      // legs half a cycle apart
    const thigh = Math.cos(p) * A;
    // never negative: a knee that bends forward is the single most
    // obvious broken-rig tell there is
    const knee = -Math.max(0.06 * gait, -Math.sin(p + 0.45)) * K;
    pose['hip' + R] = [thigh, 0, 0];
    pose['knee' + R] = [knee, 0, 0];
    // the ankle keeps the sole roughly level with the floor
    pose['ankle' + R] = [-thigh * 0.35 - knee * 0.45, 0, 0];
    // arms swing OPPOSITE their own leg
    pose['shoulder' + R] = [-Math.cos(p) * S, 0, 0];
    pose['elbow' + R] = [0.28 + 0.34 * gait + Math.max(0, -Math.cos(p)) * 0.35 * gait, 0, 0];
  }

  // COUNTER-ROTATION. Hips and shoulders turn opposite ways through a
  // stride. It is a few degrees and it is most of what separates a walk
  // from a mannequin sliding along on a turntable.
  pose.root = [0, -Math.cos(phase) * 0.13 * gait, Math.sin(phase) * 0.05 * gait];
  pose.spine = [-lean * 0.5, Math.cos(phase) * 0.09 * gait, 0];
  pose.chest = [-lean * 0.5, Math.cos(phase) * 0.11 * gait, 0];

  // two bounces per stride, and a sway onto each planted foot
  const bob = -Math.abs(Math.cos(phase)) * 0.035 * gait;
  pose.offset = [Math.sin(phase) * 0.022 * gait, bob - crouch * 0.30, 0];
  if (crouch > 0.01) {
    // A CROUCH IS THE LEGS FOLDING, not the body sinking through them.
    // Dropping the root alone leaves the feet dangling under the floor,
    // which is exactly what it looked like the first time.
    for (const R of ['R', 'L']) {
      pose['hip' + R][0] += crouch * 0.85;
      pose['knee' + R][0] -= crouch * 1.55;
      pose['ankle' + R][0] += crouch * 0.75;
    }
    pose.spine[0] -= crouch * 0.20;
  }

  // ---- and the standing-still detail --------------------------------
  //
  // A man with a gun who is perfectly still is a prop. Breathing is four
  // degrees of chest and half a centimetre of height, and it is the
  // cheapest life in the whole game.
  const still = 1 - gait;
  if (still > 0.01) {
    const br = Math.sin(t * 1.55 + seed) * still;
    pose.chest[0] += br * 0.030;
    pose.spine[0] += br * 0.018;
    pose.offset[1] += br * 0.006;
    pose.root[1] += Math.sin(t * 0.41 + seed * 2) * 0.045 * still;
    pose.root[2] += Math.sin(t * 0.33 + seed) * 0.022 * still;
  }
  return pose;
}

// ---------------------------------------------------------------------
// 2. HOLD - what the arms do with what he is carrying
// ---------------------------------------------------------------------
//
// These are the poses the arms are pulled TOWARD, at a weight, over
// whatever the stance is already doing - so a man carrying a rifle still
// bounces as he runs, he just does it with the rifle up.
//
// A rifle is two hands far apart on one object, a pistol is two hands
// together, a machete is one hand and a free arm that still swings. They
// are genuinely different silhouettes at forty metres down a corridor,
// which is the range at which you have to decide whether to fight him.
export const HOLD = {
  rifle: {
    w: 1.0,
    p: {
      shoulderR: [0.92, -0.10, 0.30], elbowR: [1.30, 0, -0.15],
      shoulderL: [1.16, 0.34, -0.22], elbowL: [1.42, 0, 0.30],
      chest: [0, -0.22, 0], clavR: [0, 0, 0.12], clavL: [0, 0, -0.16],
    },
  },
  pistol: {
    w: 1.0,
    p: {
      shoulderR: [1.02, 0.06, 0.22], elbowR: [0.62, 0, -0.10],
      shoulderL: [1.00, 0.16, -0.20], elbowL: [0.74, 0, 0.16],
      chest: [0, -0.10, 0],
    },
  },
  // A blade is carried, not aimed. The right arm holds it low and ready
  // and the left is FREE - which is what makes a man with a knife look
  // like he is going to close the distance rather than shoot you.
  melee: {
    w: 0.85,
    p: {
      shoulderR: [0.38, -0.18, 0.34], elbowR: [1.05, 0, -0.22],
      shoulderL: [0.10, 0, 0.10], elbowL: [0.42, 0, 0],
      chest: [0, -0.16, 0],
    },
  },
  // heavy two-handed: bat, axe, extinguisher - both hands, low, cocked
  heavy: {
    w: 0.95,
    p: {
      shoulderR: [0.30, -0.30, 0.40], elbowR: [1.30, 0, -0.30],
      shoulderL: [0.44, -0.18, -0.34], elbowL: [1.36, 0, 0.30],
      chest: [0, -0.34, 0],
    },
  },
  // nothing in his hands: fists up, which is its own silhouette and the
  // clearest possible warning that this one is coming for you
  fists: {
    w: 1.0,
    p: {
      shoulderR: [0.72, -0.12, 0.34], elbowR: [1.72, 0, -0.30],
      shoulderL: [0.80, 0.12, -0.34], elbowL: [1.78, 0, 0.30],
      chest: [0, -0.20, 0], spine: [-0.09, 0, 0],
    },
  },
  none: { w: 0, p: {} },
};

/** which hold a weapon id wants */
export function holdFor(id) {
  if (!id) return 'fists';
  if (id === 'ak' || id === 'shotgun') return 'rifle';
  if (id === 'glock') return 'pistol';
  if (id === 'knife') return 'melee';
  return 'heavy';
}

// ---------------------------------------------------------------------
// 3. ACTIONS - the one-shots
// ---------------------------------------------------------------------
//
// Each takes a normalised time 0..1 and writes into a pose. They are
// written as "what the body does", in order, because that is how you
// check one: read it out loud and see whether a person could do it.
export const ACTIONS = {
  // A recoil is the shoulder absorbing it and the chest rising. It is
  // over in a tenth of a second, so it has to be sharp at the start and
  // soft at the end - a symmetric bump reads as a nod.
  fire: (t, p, k = 1) => {
    const a = Math.pow(1 - t, 2.2) * k;
    p.shoulderR = [-0.30 * a, 0, 0.06 * a];
    p.shoulderL = [-0.22 * a, 0, -0.05 * a];
    p.elbowR = [-0.16 * a, 0, 0];
    p.chest = [0.13 * a, 0.05 * a, 0];
    p.neck = [0.08 * a, 0, 0];
  },

  // THE MAGAZINE CHANGE. The left hand leaves the foregrip, goes down to
  // the belt, comes back up to the well, and shoves. The right hand
  // never lets go and the weapon tips in toward the body while it
  // happens - which is the part that makes it read as a reload rather
  // than as an arm waving.
  reloadMag: (t, p) => {
    const drop = bump(t, 0.00, 0.55);
    const belt = bump(t, 0.10, 0.60);
    const back = bump(t, 0.45, 1.00);
    const seat = bump(t, 0.62, 0.82);
    p.shoulderL = [-0.55 * drop - 0.30 * belt + 0.55 * back, 0.30 * belt, 0.40 * belt];
    p.elbowL = [-0.35 * drop + 0.75 * belt + 0.50 * back + 0.30 * seat, 0, 0];
    p.shoulderR = [-0.16 * drop, 0, 0.16 * drop];
    p.elbowR = [0.20 * drop, 0, 0];
    p.chest = [0.10 * drop, 0.16 * drop, -0.14 * drop];
    p.neck = [-0.16 * drop, 0.10 * drop, 0];       // he looks at what he is doing
  },

  // A PUMP GUN IS NOT A MAGAZINE. One shell at a time, from the belt to
  // the loading port, and the difference is most of what makes picking
  // up a shotgun a commitment rather than an upgrade.
  reloadShell: (t, p) => {
    const reach = bump(t, 0.00, 0.50);
    const feed = bump(t, 0.40, 1.00);
    p.shoulderL = [-0.62 * reach + 0.36 * feed, 0.36 * reach, 0.46 * reach];
    p.elbowL = [0.85 * reach + 0.55 * feed, 0, 0];
    p.shoulderR = [-0.12 * reach, 0, 0.20 * reach];
    p.chest = [0.10 * reach, 0.20 * reach, 0];
    p.neck = [-0.20 * reach, 0.12 * reach, 0];
  },

  // The pump itself, after every shot: the left hand rips back and
  // forward. Short and violent.
  pump: (t, p) => {
    const a = Math.sin(clamp(t, 0, 1) * Math.PI);
    p.shoulderL = [-0.34 * a, 0, 0];
    p.elbowL = [0.60 * a, 0, 0];
    p.chest = [0.05 * a, 0, 0];
  },

  // ---- MELEE -------------------------------------------------------
  //
  // A swing is a WHOLE BODY, and that is the difference between a melee
  // that lands and one that looks like a slap. The hips go first, the
  // chest follows, the shoulder follows that, and the arm arrives last.
  // Each is a bump a little later than the one above it.
  swing: (t, p) => {
    const wind = bump(t, 0.00, 0.44);
    const hit = bump(t, 0.24, 0.86);
    p.root = [0, 0.34 * wind - 0.44 * hit, 0];
    p.spine = [-0.10 * wind + 0.16 * hit, 0.30 * wind - 0.46 * hit, 0];
    p.chest = [-0.14 * wind + 0.22 * hit, 0.42 * wind - 0.66 * hit, 0];
    p.shoulderR = [-0.95 * wind + 1.55 * hit, -0.30 * wind, -0.75 * wind + 0.55 * hit];
    p.elbowR = [0.75 * wind - 0.55 * hit, 0, 0];
    p.shoulderL = [-0.30 * wind + 0.70 * hit, 0, 0];
    p.elbowL = [0.45 * wind, 0, 0];
    p.neck = [0, -0.20 * wind + 0.24 * hit, 0];
  },

  // A STRAIGHT PUNCH. Same shape as the swing but it goes forward
  // instead of across, and the other hand comes UP to guard rather than
  // trailing - a boxer who drops his off hand is a boxer on the floor,
  // and it reads even at a glance.
  punchR: (t, p) => {
    const wind = bump(t, 0.00, 0.34);
    const jab = bump(t, 0.16, 0.78);
    p.root = [0, 0.18 * wind - 0.30 * jab, 0];
    p.chest = [0, 0.30 * wind - 0.52 * jab, 0];
    p.shoulderR = [-0.30 * wind + 1.62 * jab, 0, 0.20 * wind - 0.14 * jab];
    p.elbowR = [1.60 * wind - 1.45 * jab, 0, 0];
    p.shoulderL = [0.30 * wind + 0.20 * jab, 0, -0.10];
    p.elbowL = [1.85, 0, 0];
    p.spine = [-0.08 * jab, 0.16 * wind - 0.24 * jab, 0];
  },
  punchL: (t, p) => {
    const wind = bump(t, 0.00, 0.34);
    const jab = bump(t, 0.16, 0.78);
    p.root = [0, -0.18 * wind + 0.30 * jab, 0];
    p.chest = [0, -0.30 * wind + 0.52 * jab, 0];
    p.shoulderL = [-0.30 * wind + 1.62 * jab, 0, -0.20 * wind + 0.14 * jab];
    p.elbowL = [1.60 * wind - 1.45 * jab, 0, 0];
    p.shoulderR = [0.30 * wind + 0.20 * jab, 0, 0.10];
    p.elbowR = [1.85, 0, 0];
    p.spine = [-0.08 * jab, -0.16 * wind + 0.24 * jab, 0];
  },
  // A short elbow, for when he is already inside your arms. This is the
  // one an NPC throws when you have closed on him and he cannot bring a
  // rifle to bear - it is the reason walking into a heavy hurts.
  // ---- HANDING SOMETHING OVER, AND TAKING IT ------------------------
  //
  // Liam, of the cutscene: *"the handoff is badly timed"*.
  //
  // Half of that was timing and half was that there was no gesture for
  // it. The offer, the take and the pocketing were all playing `elbow`,
  // which is directly below this and is an elbow STRIKE - wind up, snap
  // the chest through, hit. Two men exchanging a note were throwing
  // punches at each other in slow motion.
  //
  // `reach` is the arm going out and coming back on one smooth hump, so
  // the peak of it is the moment the note changes hands and the whole
  // exchange can be timed off that one instant. No chest snap, no root
  // lunge: he is passing something, not swinging.
  reach: (t, p) => {
    // A STRAIGHT-ish arm, because the point is the distance it covers.
    // At elbowR 0.62 he reached with a bent arm and his hand only came
    // 25 cm forward, which left the two of them passing something across
    // a gap - the elbow opens as the shoulder lifts.
    const out = bump(t, 0.0, 1.0);
    p.shoulderR = [1.18 * out, -0.14 * out, 0.28 * out];
    p.elbowR = [0.34 * out, 0, -0.08 * out];
    p.chest = [0.04 * out, -0.20 * out, 0];
    p.spine = [0.05 * out, 0, 0];
    p.neck = [0.06 * out, 0, 0];
  },
  // Putting it away: the hand comes across to the chest and drops.
  pocket: (t, p) => {
    const up = bump(t, 0.0, 0.62);
    const down = bump(t, 0.45, 1.0);
    p.shoulderR = [0.72 * up + 0.20 * down, 0.26 * up, -0.34 * up];
    p.elbowR = [1.30 * up + 0.35 * down, 0, 0];
    p.chest = [0.10 * up, 0.16 * up, 0];
    p.neck = [0.16 * up, 0, 0];
  },
  elbow: (t, p) => {
    const wind = bump(t, 0.00, 0.36);
    const hit = bump(t, 0.20, 0.80);
    p.chest = [0, 0.40 * wind - 0.60 * hit, 0];
    p.shoulderR = [0.55 + 0.55 * hit, 0, -0.30 * wind + 0.85 * hit];
    p.elbowR = [2.05, 0, 0];
    p.shoulderL = [0.60, 0, -0.20];
    p.elbowL = [1.80, 0, 0];
    p.root = [0, 0.22 * wind - 0.34 * hit, 0];
  },
  // A boot. Slow, obvious, and it staggers - the thing you use to make
  // room when two of them have you in a doorway.
  kick: (t, p) => {
    const wind = bump(t, 0.00, 0.34);
    const out = bump(t, 0.18, 0.82);
    p.hipR = [-0.35 * wind + 1.30 * out, 0, 0];
    p.kneeR = [-1.50 * wind + 0.35 * out, 0, 0];
    p.ankleR = [0.40 * out, 0, 0];
    p.spine = [0.30 * out, 0, 0];
    p.chest = [0.24 * out, 0, 0];
    p.shoulderL = [-0.50 * out, 0, -0.55 * out];
    p.shoulderR = [-0.40 * out, 0, 0.50 * out];
    p.offset = [0, -0.06 * out, 0];
  },
};

// ---------------------------------------------------------------------
// 4. FLINCH - being hit
// ---------------------------------------------------------------------
//
// Additive and short. What matters is that it comes from a DIRECTION and
// lands on the right part: a body shot folds him over, a head shot snaps
// the neck back, an arm shot throws that shoulder. Without this every
// bullet lands the same and the fight has no punctuation.
export function flinch(pose, { t, dur, fx, fz, part, k = 1 }) {
  const a = Math.pow(1 - clamp(t / dur, 0, 1), 1.8) * k;
  if (a <= 0.001) return pose;
  const shake = Math.sin(t * 62) * a * 0.35 + a;
  const add = (n, v) => { const d = pose[n] || (pose[n] = [0, 0, 0]);
                          d[0] += v[0]; d[1] += v[1]; d[2] += v[2]; };
  if (part === 'head') {
    add('neck', [0.70 * shake, fx * 0.55 * a, 0]);
    add('head', [0.45 * shake, fx * 0.40 * a, 0]);
    add('chest', [0.18 * a, 0, 0]);
  } else if (part === 'armR' || part === 'armL') {
    const R = part === 'armR' ? 'R' : 'L';
    add('shoulder' + R, [-0.85 * shake, 0, (R === 'R' ? 0.55 : -0.55) * shake]);
    add('elbow' + R, [-0.40 * a, 0, 0]);
    add('chest', [0, (R === 'R' ? 0.22 : -0.22) * a, 0]);
  } else if (part === 'legR' || part === 'legL') {
    const R = part === 'legR' ? 'R' : 'L';
    add('hip' + R, [-0.55 * a, 0, 0]);
    add('knee' + R, [-0.75 * a, 0, 0]);
    add('offset', [0, -0.10 * a, 0]);
    add('spine', [-0.28 * a, 0, 0]);
  } else {
    // the body: he folds around it and rocks back off the line of it
    add('spine', [-0.52 * shake, fx * 0.28 * a, 0]);
    add('chest', [-0.34 * shake, fx * 0.22 * a, 0]);
    add('neck', [0.30 * a, 0, 0]);
    add('shoulderR', [-0.28 * a, 0, 0]);
    add('shoulderL', [-0.28 * a, 0, 0]);
    add('offset', [-fx * 0.03 * a, -0.045 * a, -fz * 0.03 * a]);
  }
  return pose;
}

// ---------------------------------------------------------------------
// 5. DEATH
// ---------------------------------------------------------------------
//
// Liam wants this violent, and the honest way to get there is NOT a
// ragdoll. A cheap ragdoll on a twenty-one bone rig spends its first
// half second flailing and ends with a man folded through his own hip -
// which is funny, and this is not meant to be funny.
//
// So: the body goes slack toward a heap, on a timeline, in the direction
// it was shot, with a DIFFERENT heap depending on where it was hit. The
// physics is one number - how far through the fall he is - and the
// falling itself is done by the actor rotating the whole mesh, because
// a body toppling is a rigid rotation about the feet and nothing else.
export const DEATHS = {
  // shot in the chest: he sits down backwards, arms wide
  back: (t) => ({
    spine: [0.42 * t, 0, 0], chest: [0.30 * t, 0, 0], neck: [0.55 * t, 0, 0],
    shoulderR: [-0.90 * t, 0, 0.95 * t], shoulderL: [-0.90 * t, 0, -0.95 * t],
    elbowR: [0.55 * t, 0, 0], elbowL: [0.55 * t, 0, 0],
    hipR: [0.80 * t, 0, 0.16 * t], hipL: [0.80 * t, 0, -0.16 * t],
    kneeR: [-1.10 * t, 0, 0], kneeL: [-1.10 * t, 0, 0],
    offset: [0, -0.30 * t, 0],
  }),
  // shot in the back or the legs: he pitches forward onto his face
  face: (t) => ({
    spine: [-0.55 * t, 0, 0], chest: [-0.35 * t, 0, 0], neck: [-0.30 * t, 0, 0],
    shoulderR: [0.60 * t, 0, 0.35 * t], shoulderL: [0.60 * t, 0, -0.35 * t],
    elbowR: [0.90 * t, 0, 0], elbowL: [0.90 * t, 0, 0],
    hipR: [-0.35 * t, 0, 0], hipL: [-0.35 * t, 0, 0],
    kneeR: [-0.85 * t, 0, 0], kneeL: [-0.85 * t, 0, 0],
    offset: [0, -0.22 * t, 0],
  }),
  // head shot: the legs go out from under him first and he drops
  // straight down, which is the one that actually reads as instant
  crumple: (t) => ({
    spine: [-0.30 * t, 0.30 * t, 0], chest: [-0.20 * t, 0.20 * t, 0],
    neck: [0.35 * t, 0, 0.30 * t],
    shoulderR: [0.25 * t, 0, 0.55 * t], shoulderL: [0.25 * t, 0, -0.55 * t],
    elbowR: [0.35 * t, 0, 0], elbowL: [0.35 * t, 0, 0],
    hipR: [1.35 * t, 0, 0.25 * t], hipL: [1.30 * t, 0, -0.20 * t],
    kneeR: [-2.10 * t, 0, 0], kneeL: [-2.05 * t, 0, 0],
    offset: [0, -0.62 * t, 0],
  }),
};

// ---------------------------------------------------------------------
// THE ANIMATOR
// ---------------------------------------------------------------------
export class Animator {
  constructor(body, seed = 0) {
    this.body = body;
    this.seed = seed;
    this.phase = Math.random() * 6.283;
    this.gait = 0; this.run = 0; this.crouchK = 0;
    this.hold = 'fists'; this.holdK = 0; this.holdWant = 'fists';
    this.action = null; this.actionT = 0; this.actionDur = 1; this.actionK = 1;
    this.hit = null;
    this.death = null; this.deathT = 0;
    this.aimYaw = 0; this.aimPitch = 0;
  }

  /** a one-shot. `k` scales it, for a light hit versus a full swing. */
  play(name, dur, k = 1) {
    if (!ACTIONS[name]) return;
    this.action = name; this.actionT = 0; this.actionDur = Math.max(0.05, dur); this.actionK = k;
  }
  get busy() { return !!this.action; }

  hurt(fx, fz, part, k = 1) {
    // A NEW HIT RESTARTS THE FLINCH. Adding them together stacks into a
    // man bent double for a whole magazine, and being shot four times
    // should read as four hits, not as one long spasm.
    this.hit = { t: 0, dur: 0.34, fx, fz, part, k };
  }

  die(kind) { this.death = DEATHS[kind] ? kind : 'back'; this.deathT = 0; }

  /**
   * state: { speed, maxSpeed, crouch, weapon, aimYaw, aimPitch, t, unarmed }
   * aimYaw is RELATIVE to the way the body is facing.
   */
  update(dt, st) {
    const body = this.body;

    // ---- death takes everything --------------------------------------
    if (this.death) {
      this.deathT = Math.min(1, this.deathT + dt * 3.4);
      const k = ease(this.deathT);
      const pose = blankPose();
      addPose(pose, DEATHS[this.death](k), 1);
      // a last twitch as he goes down, then nothing
      const tw = Math.max(0, 1 - this.deathT * 4) * Math.sin(this.deathT * 90) * 0.10;
      pose.chest = pose.chest || [0, 0, 0];
      pose.chest[0] += tw;
      applyPose(body, pose, 1);
      return;
    }

    // ---- how fast is he going, and is that a walk or a run? ----------
    const sp = st.speed || 0;
    const wantGait = clamp(sp / 1.1, 0, 1);
    const wantRun = clamp((sp - 2.6) / 3.2, 0, 1);
    this.gait += (wantGait - this.gait) * Math.min(1, dt * 11);
    this.run += (wantRun - this.run) * Math.min(1, dt * 7);
    this.crouchK += ((st.crouch ? 1 : 0) - this.crouchK) * Math.min(1, dt * 10);
    // THE STRIDE IS DRIVEN BY DISTANCE, NOT BY TIME. Tie it to a clock
    // and the feet skate the moment the speed changes, which is the
    // single most common way animated characters give themselves away.
    const strideLen = lerp(1.30, 2.15, this.run);
    this.phase += (sp / strideLen) * Math.PI * 2 * dt;
    if (this.gait < 0.02) this.phase += dt * 0.6;    // idle keeps ticking over

    const pose = blankPose();
    stance(pose, { phase: this.phase, gait: this.gait, run: this.run,
                   crouch: this.crouchK, t: st.t || 0, seed: this.seed });

    // ---- 2. the hold --------------------------------------------------
    // ---- ARMS DOWN, FOR PEOPLE WHO ARE NOT FIGHTING -------------------
    //
    // Liam, of the opening cutscene: *"all of the peoples arms are
    // crossed"*.
    //
    // They were in `fists` - the boxing guard, both elbows bent up across
    // the chest. That is the right silhouette for a man in a corridor
    // with nothing in his hands and it is what "unarmed" has always
    // meant here, but from across a street it reads as folded arms, and
    // the two men in the cutscene are having a conversation.
    //
    // `relaxed` asks for no hold at all, which leaves the arms to the
    // walk cycle - hanging, and swinging when he walks. That is a man
    // standing about, and it needs no new pose to describe.
    const want = st.relaxed ? 'none' : st.unarmed ? 'fists' : holdFor(st.weapon);
    if (want !== this.holdWant) { this.holdWant = want; }
    // Cross-fade between holds rather than snapping, because a man
    // dropping a rifle and putting his fists up is a MOVE, and it is the
    // tell that tells you he is out of ammo and coming.
    this.holdK += ((this.hold === this.holdWant ? 1 : 0) - this.holdK) * Math.min(1, dt * 9);
    if (this.holdK < 0.06 && this.hold !== this.holdWant) { this.hold = this.holdWant; }
    const H = HOLD[this.hold] || HOLD.none;
    // the arms leave the stance behind as the weapon comes up
    const hw = H.w * (this.hold === this.holdWant ? this.holdK : 1 - this.holdK);
    for (const k in H.p) {
      const d = pose[k] || (pose[k] = [0, 0, 0]);
      const v = H.p[k];
      d[0] = lerp(d[0], v[0], hw); d[1] = lerp(d[1], v[1], hw); d[2] = lerp(d[2], v[2], hw);
    }

    // ---- 3. aim -------------------------------------------------------
    //
    // He turns his WAIST, not his feet. Splitting the aim across three
    // joints is what stops a man tracking you looking like a turret: the
    // spine takes a little, the chest most of it, the neck the rest, and
    // the head finishes the job.
    const ay = clamp(st.aimYaw || 0, -1.5, 1.5), ap = clamp(st.aimPitch || 0, -1.0, 1.0);
    this.aimYaw += (ay - this.aimYaw) * Math.min(1, dt * 9);
    this.aimPitch += (ap - this.aimPitch) * Math.min(1, dt * 9);
    const add = (n, v) => { const d = pose[n] || (pose[n] = [0, 0, 0]);
                            d[0] += v[0]; d[1] += v[1]; d[2] += v[2]; };
    add('spine', [this.aimPitch * 0.12, this.aimYaw * 0.22, 0]);
    add('chest', [this.aimPitch * 0.38, this.aimYaw * 0.40, 0]);
    add('neck', [this.aimPitch * 0.30, this.aimYaw * 0.22, 0]);
    add('head', [this.aimPitch * 0.22, this.aimYaw * 0.16, 0]);

    // ---- 4. the action ------------------------------------------------
    if (this.action) {
      this.actionT += dt / this.actionDur;
      if (this.actionT >= 1) { this.action = null; }
      else {
        const sub = {};
        ACTIONS[this.action](this.actionT, sub, this.actionK);
        // An action REPLACES what the hold was doing with those joints -
        // added on top, a reload and a rifle hold fight each other and
        // the left arm ends up somewhere behind his head.
        const w = Math.min(1, Math.sin(clamp(this.actionT, 0, 1) * Math.PI) * 3.2) * this.actionK;
        for (const k in sub) {
          const d = pose[k] || (pose[k] = [0, 0, 0]);
          const v = sub[k];
          if (k === 'offset') { d[0] += v[0] * w; d[1] += v[1] * w; d[2] += v[2] * w; }
          else { d[0] = lerp(d[0], d[0] + v[0], w); d[1] = lerp(d[1], d[1] + v[1], w);
                 d[2] = lerp(d[2], d[2] + v[2], w); }
        }
      }
    }

    // ---- 5. flinch ----------------------------------------------------
    if (this.hit) {
      this.hit.t += dt;
      if (this.hit.t >= this.hit.dur) this.hit = null;
      else flinch(pose, this.hit);
    }

    applyPose(body, pose, 1);
  }
}
