// ============================================================================
//  MY ANIMATION, THEIR SKELETON
// ============================================================================
//
// Liam: *"use your own made hand animations for the hands not the ones
// they give"*, and *"make sure guns are pointed the right way"*.
//
// So the RetroWeaponPack supplies the MESHES - two arms with five fingers
// each, and a gun modelled to go with them - and its REST POSE. Its 16-26
// baked clips are never played. Every rotation that moves in this file is
// authored here.
//
// WHY NOT PLAY THE CLIPS, given they exist and are good:
//   * They cannot react. The recoil spring, the sway lag, the lean and
//     the trigger pull are continuous values driven by what the player is
//     doing this frame. A clip can only be started and waited for.
//   * They are authored to the pack's timings, not to GUNS[id].rate. A
//     0.47 s Fire clip on a weapon that cycles in 0.09 s is a queue.
//   * They are inconsistent between weapons - the rifle ships no walk,
//     run, breathe or crouch at all - so half of them would fall back to
//     a base pose anyway.
//
// ---------------------------------------------------------------------
// THE FOUR THINGS THAT WERE WRONG THE FIRST TIME
// ---------------------------------------------------------------------
// (all measured - tools/rigbind.mjs prints the numbers below)
//
// 1. THE BIND POSE IS A T-POSE, NOT A HOLD. Both arms run straight out
//    sideways along +-Z at eye height:
//
//        shoulder_r  z +0.092      shoulder_l  z -0.092
//        hand_r      z +0.604      hand_l      z -0.604
//
//    Poses were being written as deltas from THAT, so every number was
//    doing two jobs at once - folding a straight arm into a firing
//    position AND animating it - and the first job needs about 90 degrees
//    on three bones whose axes interact. It came out as a swan's neck.
//    The pack's own `Arms_BasePose` + `<Gun>_IdlePose` pair IS the hold,
//    so that pair is sampled ONCE at load, snapshotted as the REST pose,
//    and the mixer is thrown away. A single-frame pose is not an
//    animation; everything that MOVES is written below.
//
// 2. THE GUN WAS NOT IN THE HAND. In the bind pose the weapon root sits
//    at [0.298, -0.238, 0.089] and hand_r at [0.032, 0, 0.604] - two
//    independent armatures that the pack keeps in step by animating both.
//    Reparenting `Main` under `hand_item_r` with an IDENTITY offset
//    (which is what the old OFFSET table held - four rows of zeros)
//    dropped the gun on the wrist at the wrist's angle. The offset is now
//    MEASURED off the matched idle pair at load, so there is no constant
//    to go stale and no gun pointing the wrong way.
//
//    It has to be the BONE that is reparented, not the armature: the
//    meshes are `bindMode: 'attached'`, so moving mesh and bones together
//    applies the move twice and the gun flies off.
//
// 3. THE RIGHT ARM DOES NOT EXIST. All 1059 vertices of `FPS_Arms_Mesh`
//    weight to `_l` bones, in all four files. The hand holding the gun
//    had no mesh on it. It is mirrored into place in fparms.loadWeapon -
//    see the long note there.
//
// 4. THE MODEL FACES +X. Its axes are +X forward, +Y up, +Z right; a view
//    model wants -Z forward, +X right. One quarter turn about Y on the
//    root, and after that "forward" means forward.
//
// ---------------------------------------------------------------------
// HOW A POSE IS WRITTEN
// ---------------------------------------------------------------------
//
// Not as Euler triples in bone space - the local axes of these bones are
// nobody's idea of anything (upperArm_r's local X points BACKWARDS and
// its Y runs down the limb), so a hand-written triple is a guess you have
// to photograph before you know what it did.
//
// Instead each bone measures, once, which of its own local axes
// corresponds to the VIEW's right / up / forward. A pose entry is then
//
//      bone: [pitch, yaw, roll]        degrees, in the view's frame
//
// pitch = nose up, yaw = swing right, roll = twist clockwise, for both
// arms, no mirroring - which is why the tables below can be read.
//
// THE SKELETON (identical in all four files):
//   shoulder_r  upperArm_r  lowerArm_r  hand_r  hand_item_r
//   <finger>Knuckle_r  <finger>_01_r  _02_r  _03_r      (x5)
//   twist_1..3_arm_r          - forearm twist, left alone
//   ctrl_HandIK_r / ctrl_pole_elbow_r - Blender IK handles, unused:
//                               there is no solver on this chain, it is FK.
// and the weapon's own, which differ per gun:
//   pistol   Main Slide Hammer Trigger Magazine
//   shotgun  Main Trigger Forearm LoadingPort MagazineLoadingPort

import * as THREE from '../vendor/three.module.js';

const FINGERS = ['index', 'middle', 'ring', 'pinky', 'thumb'];
const D = Math.PI / 180;

// the view's own axes, which is the frame every pose number below is in
const RIGHT = new THREE.Vector3(1, 0, 0);
const UP    = new THREE.Vector3(0, 1, 0);
const FWD   = new THREE.Vector3(0, 0, -1);

// Where the weapon sits in the frame once it is level. A view model is
// held to one side of the sight line and a little under it - dead centre
// reads as a screenshot of a gun rather than as somebody carrying one.
//
// Per weapon, because the four rest poses do not agree about where the
// hands are: the shotgun's puts them SEVEN CENTIMETRES ABOVE THE EYE and
// sixteen in front, which fills the screen with receiver. The numbers are
// read off tools/rigsheet.mjs, which prints the muzzle for every pose.
const HOLD_OFFSET = {
  pistol:  new THREE.Vector3(0.035, 0.130, -0.075),
  rifle:   new THREE.Vector3(0.060, 0.000, -0.330),
  shotgun: new THREE.Vector3(0.060, -0.070, -0.380),
  smg:     new THREE.Vector3(0.050, -0.040, -0.260),
};

// ---------------------------------------------------------------------
// GRIPS - how the hand wraps a particular weapon
// ---------------------------------------------------------------------
//
// Per finger: [knuckle, joint1, joint2, joint3] in degrees of curl ON TOP
// of the rest pose, which already has the fingers round the grip. So
// these are small, and `open` and `fist` are the two that are not.
//
// The trigger finger is deliberately straighter than the rest, and the
// thumb lies ALONG the frame rather than wrapping, which is the
// difference between a hand holding a pistol and a hand holding a tin.
const GRIP = {
  pistol:  { index: [0, 2, 0, 0], middle: [0, 4, 3, 2], ring: [0, 5, 4, 2],
             pinky: [0, 6, 5, 3], thumb: [0, 2, 0, 0] },
  // a rifle's forward hand hangs under the handguard, so the off hand
  // curls harder
  rifle:   { index: [0, 2, 0, 0], middle: [0, 6, 5, 3], ring: [0, 7, 6, 4],
             pinky: [0, 9, 7, 5], thumb: [0, 3, 1, 0] },
  shotgun: { index: [0, 2, 0, 0], middle: [0, 7, 6, 4], ring: [0, 9, 7, 5],
             pinky: [0, 11, 9, 6], thumb: [0, 4, 2, 0] },
  smg:     { index: [0, 2, 0, 0], middle: [0, 5, 4, 3], ring: [0, 6, 5, 3],
             pinky: [0, 8, 6, 4], thumb: [0, 3, 1, 0] },
  // an open hand, for a reload reach: this one has to UNDO the rest
  // pose's curl, so it is large and negative
  open:    { index: [-4, -46, -34, -22], middle: [-4, -50, -38, -24],
             ring: [-4, -52, -40, -26], pinky: [-4, -54, -42, -28],
             thumb: [-4, -20, -14, -8] },
  fist:    { index: [8, 44, 40, 30], middle: [8, 46, 42, 32],
             ring: [8, 46, 42, 32], pinky: [10, 48, 44, 34],
             thumb: [14, 24, 20, 14] },
};

// ---------------------------------------------------------------------
// ARM POSES - deltas from the rest hold, in the VIEW's frame, degrees
// ---------------------------------------------------------------------
//
//   [pitch, yaw, roll]     pitch + = nose up
//                          yaw   + = swing right
//                          roll  + = twist clockwise seen from behind
//
// Only the FIRING arm is listed. The off arm is not posed at all - it is
// solved to the weapon every frame (see solveSupport), because two FK
// chains turned by different amounts slide apart, and a support hand that
// is not on the gun is the first thing anybody notices.
//
// ---------------------------------------------------------------------
// AND THE RULE THAT DECIDES WHAT GOES IN HERE AND WHAT GOES IN `SHIFT`
// ---------------------------------------------------------------------
//
// The gun is rigid in the hand, so ANY change to the arm turns the
// barrel. That means a pose cannot both move the weapon across the screen
// and keep it pointing forward - and pointing forward is not negotiable,
// because the crosshair is a promise.
//
// So the poses that must shoot straight (`hold`, `aim`) carry almost no
// rotation, and the difference between them is a TRANSLATION of the whole
// rig, in `SHIFT`. The poses that are meant to point somewhere else
// (`low`, `sprint`, `reload`) are where the big rotations live, and they
// are exactly the states you cannot fire from.
//
// The first version had `aim` pitching both upper arms up ten degrees to
// "bring the gun to the eye". It lifted the muzzle twenty degrees off the
// crosshair. It looked fine and shot at the ceiling.
const POSES = {
  // the hold, unchanged. Every blend has some of this in it.
  hold: {},

  // carried, not presented: the arm drops and the gun tips down and in.
  // This is what the hands do when nothing is happening, and it is the
  // difference between a player character and a mannequin.
  // NOT 'pointing at the floor'. The first version dropped the muzzle
  // forty-five degrees, and since the whole rig also shifts down with it
  // the weapon left the bottom of the screen entirely - so the default
  // state of the game, three seconds after any shot, was empty hands.
  // A lowered ready is about twelve degrees.
  low: {
    upperArm_r: [-9, 2, 0], lowerArm_r: [-5, 0, 0], hand_r: [-6, -2, 4],
  },

  // SIGHTED. Shape barely changes - see the note above. What changes is
  // where the whole rig sits, and that is measured, not authored.
  aim: {},

  // RELOAD. The gun drops and rolls in towards the body so the magazine
  // well faces the off hand, and the off hand leaves it entirely - which
  // is the whole reason a reload reads as a reload.
  reload: {
    upperArm_r: [-15, 5, 0], lowerArm_r: [5, 2, 0], hand_r: [-5, 0, 32],
  },

  // SPRINT. The weapon goes across the body pointing down and right, out
  // of the sight line. Nobody runs with a barrel under their chin.
  sprint: {
    upperArm_r: [-22, 9, 0], lowerArm_r: [8, 12, 0], hand_r: [-11, 5, 20],
  },

  // FISTS. Both hands come up and in. Every weapon pose holds the right
  // arm out where a barrel would be, and with nothing in it that reads
  // as a man pointing at you with his finger.
  guard: {
    upperArm_r: [-6, -12, 0], lowerArm_r: [16, -9, 0], hand_r: [-4, -6, 20],
  },

  // A SHOVE with whatever is in your hands: arm out, gun turned sideways.
  shove: {
    upperArm_r: [6, -4, 0], lowerArm_r: [34, -6, 0], hand_r: [10, 0, -26],
  },
};

// ---------------------------------------------------------------------
// SHIFT - where the whole rig sits, per pose, in metres
// ---------------------------------------------------------------------
//
// Blended the same way the rotations are. `aim` is left null because it
// is MEASURED at load (measureAim) - the number that puts the barrel line
// through the crosshair is different for a pistol and a shotgun and there
// is no reason to guess it twice.
const SHIFT = {
  hold:   [0, 0, 0],
  low:    [0.005, -0.012, 0.026],
  aim:    null,
  reload: [0.025, -0.035, 0.030],
  sprint: [-0.02, -0.03, 0.06],
  guard:  [-0.03, -0.02, 0.06],
  shove:  [0, 0.01, -0.13],
};

// The per-weapon overlay is gone: it existed only to drag the pistol's
// off arm onto the gun, and solveSupport does that for every weapon
// without a table.
const EXTRA = {};

export class HandRig {
  /**
   * `gl` is a loaded weapon GLB (see fparms.loadWeapon). `id` is one of
   * pistol / rifle / shotgun / smg and picks the grip.
   *
   * ONE RIG PER GLB. loadWeapon caches the GLTF, and this reparents the
   * scene into its own root, so two rigs sharing an id would fight over
   * it. Hands caches rigs by id for that reason.
   */
  constructor(id, gl) {
    this.id = id;
    this.gl = gl;

    this.root = new THREE.Group();
    this.root.scale.setScalar(0.01);      // the pack is modelled in cm
    this.root.rotation.y = Math.PI / 2;   // +X forward -> -Z forward
    this.root.add(gl.scene);

    this.bones = new Map();
    this.gunMeshes = [];
    this.armMeshes = [];
    gl.scene.traverse((o) => {
      if (o.isBone) this.bones.set(o.name, o);
      else if (o.isMesh) {
        o.frustumCulled = false;
        (/^fps_arms/i.test(o.name) ? this.armMeshes : this.gunMeshes).push(o);
      }
    });

    this.grip = GRIP[id] || GRIP.pistol;
    this.blend = { hold: 1 };
    this.gripR = 0; this.gripL = 0;     // 0 = the rest grip, 1 = a fist
    this.openL = 0;                     // off hand off the weapon
    this.trigger = 0;
    this.recoil = 0;
    this.t = 0;

    this._q = new THREE.Quaternion();
    this._q2 = new THREE.Quaternion();
    this._v = new THREE.Vector3();

    this.captureRest();
    this.applyRest();
    this.attachWeapon();
    this.measureAxes();
    this.findMuzzle();
    this.measureSupport();
    this.trim();
    this.measureAim();

  }

  // -------------------------------------------------------------------
  // REST
  // -------------------------------------------------------------------
  /**
   * Sample the pack's matched idle PAIR once and keep it as the rest
   * pose. `Arms_BasePose` alone is not enough - it poses the arms and
   * leaves the gun in bind, and it is the pair that has them agreeing
   * about where the grip is.
   *
   * The naming is not consistent between the four files (the shotgun's
   * are `shotgun01_BasePose` and `arms_DrawWeapon`), so this matches on
   * substrings and falls back rather than trusting a suffix.
   */
  captureRest() {
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const names = this.gl.animations.map((a) => a.name);
    const isArms = (n) => norm(n).startsWith('arms');
    const armsPose = names.find((n) => isArms(n) && /basepose/.test(norm(n)))
                  || names.find((n) => isArms(n) && /idlepose/.test(norm(n)))
                  || names.find((n) => isArms(n));
    const gunPose = names.find((n) => !isArms(n) && /idlepose/.test(norm(n)))
                 || names.find((n) => !isArms(n) && /basepose/.test(norm(n)));
    this.restFrom = [armsPose, gunPose].filter(Boolean);

    const mixer = new THREE.AnimationMixer(this.gl.scene);
    for (const n of this.restFrom) {
      const c = this.gl.animations.find((a) => a.name === n);
      if (c) mixer.clipAction(c).play();
    }
    // a hair past zero, not zero: a single-frame pose clip has one key at
    // t=0 and setTime(0) on a freshly-created action can leave the
    // binding unevaluated
    mixer.setTime(0.001);
    this.gl.scene.updateMatrixWorld(true);

    this.rest = new Map();
    for (const [n, b] of this.bones)
      this.rest.set(n, { q: b.quaternion.clone(), p: b.position.clone() });

    mixer.stopAllAction();
    mixer.uncacheRoot(this.gl.scene);
  }

  /**
   * Put the skeleton back into the rest pose it was just snapshotted in.
   *
   * This is not housekeeping, it is load-bearing. `uncacheRoot` calls
   * `restoreOriginalState()` on every binding, which winds the whole
   * skeleton back to the BIND pose - so without this, the grip offset and
   * the axes below would both be measured against a T-pose, and the gun
   * would land on the wrist at the wrist's angle. That is precisely the
   * bug this rewrite exists to fix; it is worth two lines to not have it
   * twice.
   */
  applyRest() {
    for (const [n, r] of this.rest) {
      const b = this.bones.get(n);
      if (!b) continue;
      b.quaternion.copy(r.q);
      b.position.copy(r.p);
    }
    this.refresh();
  }

  // -------------------------------------------------------------------
  // THE GUN, IN THE HAND
  // -------------------------------------------------------------------
  /**
   * Put the weapon root under the hand's item socket, at the transform it
   * ALREADY has relative to that socket in the rest pose. Measured, so
   * the grip is exactly the one the pack modelled and the barrel points
   * exactly where the pack pointed it.
   *
   * Skinning follows bone.matrixWorld, so reparenting a root BONE carries
   * its mesh - no rebinding. Reparenting the mesh as well would apply the
   * move twice, because these meshes are `bindMode: 'attached'`.
   */
  attachWeapon() {
    const main = this.bone('Main');
    const socket = this.bone('hand_item_r') || this.bone('hand_r');
    if (!main || !socket) return false;

    socket.updateWorldMatrix(true, false);
    main.updateWorldMatrix(true, false);
    const rel = new THREE.Matrix4()
      .copy(socket.matrixWorld).invert().multiply(main.matrixWorld);

    socket.add(main);
    const p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    rel.decompose(p, q, s);
    main.position.copy(p);
    main.quaternion.copy(q);
    main.scale.copy(s);
    this.rest.set('Main', { q: q.clone(), p: p.clone() });
    this.refresh();
    return true;
  }

  bone(n) { return this.bones.get(n) || null; }

  /**
   * Bring every matrix in the rig up to date, INCLUDING the skinned
   * meshes' own.
   *
   * `updateWorldMatrix` is not the same call as `updateMatrixWorld`, and
   * on a SkinnedMesh the difference is the whole thing: only the latter
   * is overridden, and the override is what recomputes `bindMatrixInverse`
   * from the mesh's new world matrix. Measure through the stale one and
   * every skinned vertex reads a hundred times too small - which is how
   * the muzzle came out sitting on the player's eye.
   */
  refresh() { this.root.updateMatrixWorld(true); }

  // -------------------------------------------------------------------
  // AXES
  // -------------------------------------------------------------------
  /**
   * For every bone a pose can touch, work out which direction in ITS OWN
   * local space is the view's right, up and forward - at rest. After
   * this, a pose can say "pitch the forearm up 7 degrees" and mean it.
   *
   * A child measures its axes AFTER its parent, at rest, so a chain reads
   * consistently; when the parent then rotates, the child's axes go with
   * it, which is what a real limb does.
   */
  measureAxes() {
    this.refresh();
    this.axes = new Map();
    const qw = new THREE.Quaternion(), inv = new THREE.Quaternion();
    for (const name of Object.keys(POSES.low).concat(['shoulder_r', 'shoulder_l'])) {
      const b = this.bones.get(name);
      if (!b || this.axes.has(name)) continue;
      b.getWorldQuaternion(qw);
      inv.copy(qw).invert();
      this.axes.set(name, {
        pitch: RIGHT.clone().applyQuaternion(inv).normalize(),
        yaw:   UP.clone().applyQuaternion(inv).normalize(),
        roll:  FWD.clone().applyQuaternion(inv).normalize(),
      });
    }
  }

  // -------------------------------------------------------------------
  // THE MUZZLE
  // -------------------------------------------------------------------
  /**
   * Where the barrel ends, as a child of the weapon root - so it swings,
   * kicks and reloads with the gun and never has to be re-derived.
   *
   * Found by measuring, not by a constant per weapon: skin every vertex
   * of the gun mesh into world space once at rest and keep the one
   * furthest FORWARD. The muzzle of a gun is the front of it, and that is
   * true of all four without a table.
   */
  findMuzzle() {
    const main = this.bone('Main');
    if (!main) return;
    this.refresh();
    const v = new THREE.Vector3();
    const pts = [];
    let best = null, bestD = -Infinity;
    for (const m of this.gunMeshes) {
      const pos = m.geometry.getAttribute('position');
      if (!pos) continue;
      m.updateWorldMatrix(true, false);
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        if (m.isSkinnedMesh) m.applyBoneTransform(i, v);
        v.applyMatrix4(m.matrixWorld);
        pts.push(v.clone());
        // furthest along the view's forward, i.e. most negative z
        if (-v.z > bestD) { bestD = -v.z; best = v.clone(); }
      }
    }
    this.measureAxis(pts);

    // THE MUZZLE IS ON THE BORE, NOT AT THE FRONTMOST CORNER.
    //
    // Taking the frontmost vertex outright puts a shotgun's flash on the
    // end of its magazine TUBE, twenty centimetres below the barrel, and
    // makes the weapon read as pointing at the floor when it is level.
    // So: the point on the long axis, at the far end of the weapon.
    const axis = this.axisLocal
      ? this.axisLocal.clone().transformDirection(main.matrixWorld).normalize()
      : FWD.clone();
    if (best && axis.dot(new THREE.Vector3().subVectors(best, this.centroid)) < 0) axis.negate();
    let far = 0;
    for (const p of pts) far = Math.max(far, this._v.subVectors(p, this.centroid).dot(axis));
    const tip = this.centroid.clone().addScaledVector(axis, far);

    this.muzzle = new THREE.Object3D();
    main.add(this.muzzle);
    this.muzzle.position.copy(main.worldToLocal(tip.clone()));
    this.muzzleReach = -tip.z;
  }

  /** the muzzle, in the view model's own space */
  muzzlePoint(out = new THREE.Vector3()) {
    if (!this.muzzle) return out.set(0, -0.05, -0.45);
    this.muzzle.updateWorldMatrix(true, false);
    return out.setFromMatrixPosition(this.muzzle.matrixWorld);
  }

  /**
   * Which way the barrel actually points, in the view's frame. Liam:
   * *"make sure guns are pointed the right way"* - so this is a number
   * the tools can print rather than something to squint at. A rig that is
   * right reads [0, 0, -1].
   *
   * NOT grip-to-muzzle, which is the obvious thing to write and is wrong.
   * `Main` sits at the grip, ten centimetres UNDER the bore; a pistol
   * whose barrel is dead level measures 29 degrees nose-up that way. That
   * mistake cost an hour: the rig was then rotated 27 degrees down to
   * "fix" it, which swung the shoulders above the eye and filled the
   * screen with forearm.
   *
   * The barrel is the LONG AXIS of the weapon, so it is measured as one -
   * the principal component of the gun's own vertices, signed towards the
   * muzzle. True of a pistol, a shotgun and a rifle alike, with no table.
   */
  barrelDir(out = new THREE.Vector3()) {
    if (!this.axisLocal || !this.muzzle) return out.set(0, 0, -1);
    const main = this.bone('Main');
    main.updateWorldMatrix(true, false);
    out.copy(this.axisLocal).transformDirection(main.matrixWorld);
    // point it at the muzzle end, not the butt
    const a = new THREE.Vector3().setFromMatrixPosition(main.matrixWorld);
    const m = this.muzzlePoint(new THREE.Vector3()).sub(a);
    if (out.dot(m) < 0) out.negate();
    return out.normalize();
  }

  /**
   * The gun's long axis, in `Main`'s local frame, by power iteration on
   * the covariance of its skinned vertices. Ten lines instead of a 3x3
   * eigensolver, and it converges in a handful of steps because a gun is
   * emphatically longer than it is anything else.
   */
  measureAxis(pts) {
    if (!pts.length) return;
    const c = new THREE.Vector3();
    for (const p of pts) c.add(p);
    c.divideScalar(pts.length);
    this.centroid = c.clone();
    let v = new THREE.Vector3(0, 0, -1), next = new THREE.Vector3();
    const d = new THREE.Vector3();
    for (let it = 0; it < 24; it++) {
      next.set(0, 0, 0);
      for (const p of pts) {
        d.subVectors(p, c);
        next.addScaledVector(d, d.dot(v));
      }
      if (next.lengthSq() < 1e-20) break;
      next.normalize();
      if (next.dot(v) < 0) next.negate();
      const moved = next.distanceToSquared(v);
      v.copy(next);
      if (moved < 1e-12) break;
    }
    const main = this.bone('Main');
    main.updateWorldMatrix(true, false);
    // world direction -> Main's local frame, kept as a direction
    const inv = new THREE.Matrix4().copy(main.matrixWorld).invert();
    this.axisLocal = v.clone().transformDirection(inv).normalize();
  }

  // -------------------------------------------------------------------
  // TRIM  -  "make sure guns are pointed the right way"
  // -------------------------------------------------------------------
  /**
   * Turn the whole assembly until the barrel points down the view's -Z.
   *
   * The four rest poses do not agree about this and none of them is
   * level: the pistol's idle carries the muzzle 27 degrees UP, the
   * shotgun's carries it down and across. That is fine as a piece of
   * character animation and useless as a view model, because the
   * crosshair is a promise about where the bullet goes.
   *
   * It is done on the ROOT rather than at the wrist on purpose. At rest
   * the arms and the gun are one rigid assembly; turning the root turns
   * all of it together, so the grip stays a grip. Twisting the wrist
   * instead would swing the gun out of the other hand.
   *
   * Measured per weapon, so there is no table to keep in step.
   */
  trim() {
    this.base = new THREE.Vector3();
    this.refresh();
    const main = this.bone('Main');
    const before = new THREE.Vector3();
    if (main) main.getWorldPosition(before);

    const dir = this.barrelDir(new THREE.Vector3());
    const q = new THREE.Quaternion().setFromUnitVectors(dir, FWD);
    // ...but do not roll the arms over: keep only the pitch and the yaw
    const e = new THREE.Euler().setFromQuaternion(q, 'YXZ');
    e.z = 0;
    this.root.quaternion.multiplyQuaternions(
      new THREE.Quaternion().setFromEuler(e), this.root.quaternion);
    this.trimEuler = e;
    this.refresh();

    // THE TURN IS ABOUT THE EYE, so it also MOVES the weapon - the pistol
    // needed 27 degrees and that dropped the muzzle 21 cm, straight out of
    // the bottom of the frame. Put it back where it was and then place it
    // deliberately.
    const after = new THREE.Vector3();
    if (main) main.getWorldPosition(after);
    this.base.copy(before).sub(after).add(HOLD_OFFSET[this.id] || HOLD_OFFSET.pistol);
    this.root.position.copy(this.base);
    this.refresh();
  }

  /**
   * Where the whole rig has to slide to when sighted, so that looking
   * down the barrel means looking down the crosshair.
   *
   * A view model that only ROTATES into an aim never lines up - the gun
   * ends up beside the centre of the screen, because it is held beside
   * the head. The shift is the missing half, and it is measurable: put
   * the rig in the aim pose, see where the barrel line crosses the eye
   * plane, and move the rig by minus that.
   *
   * `SIGHT_DROP` puts the line a little below centre, which is where you
   * see it over the top of the slide rather than through it.
   */
  measureAim() {
    const SIGHT_DROP = 0.020;   // look OVER the slide, not through it
    const CLOSER = 0.025;       // and bring it back towards the eye
    this.aimShift = null;
    const wasPose = this.blend;
    this.setPose({ aim: 1 });
    this.update(0.016, { aim: 1 });
    this.refresh();
    const mz = this.muzzlePoint(new THREE.Vector3());
    this.aimShift = new THREE.Vector3(-mz.x, -mz.y - SIGHT_DROP, CLOSER);
    this.setPose(wasPose);
    this.update(0.016, {});
    this.refresh();
  }

  // -------------------------------------------------------------------
  // THE SUPPORT HAND FOLLOWS THE WEAPON
  // -------------------------------------------------------------------
  /**
   * Where the off hand belongs, as a transform ON THE GUN.
   *
   * The two arms are separate FK chains, so any pose that turns them by
   * different amounts - which is every pose worth having - slides the
   * support hand off the handguard. Posing both by hand and hoping they
   * stay together is the thing that never works.
   *
   * So the support hand is not posed at all: it is SOLVED, every frame,
   * to a point that is fixed in the weapon's own frame. Measured off the
   * rest pose where the pack put the hand on the gun (rifle, shotgun,
   * smg); for the pistol - whose rest is one-handed, off arm by the hip -
   * it is placed relative to the FIRING hand, because a two-handed pistol
   * grip is the support hand wrapped round the shooting one.
   */
  measureSupport() {
    const main = this.bone('Main'), hl = this.bone('hand_l'), hr = this.bone('hand_r');
    if (!main || !hl) return;
    this.refresh();
    const inv = new THREE.Matrix4().copy(main.matrixWorld).invert();
    const two = this.id === 'pistol';
    const src = two ? hr : hl;
    if (!src) return;
    const p = new THREE.Vector3().setFromMatrixPosition(src.matrixWorld).applyMatrix4(inv);
    const mq = new THREE.Quaternion(); main.getWorldQuaternion(mq);
    const sq = new THREE.Quaternion(); src.getWorldQuaternion(sq);
    if (two) {
      // beside and just under the firing hand, in the VIEW's frame, then
      // carried into the weapon's
      const off = new THREE.Vector3(-0.046, -0.030, 0.030)
        .applyQuaternion(mq.clone().invert()).divideScalar(main.getWorldScale(new THREE.Vector3()).x || 1);
      p.add(off);
    }
    this.supportPos = p;
    this.supportQuat = mq.invert().multiply(sq);
    // bone lengths, in the rig's own units (the rest offsets)
    const lo = this.rest.get('lowerArm_l'), ha = this.rest.get('hand_l');
    this.armL1 = lo ? lo.p.length() : 22;
    this.armL2 = ha ? ha.p.length() : 22;
    // the pistol rest leaves the off hand open by the hip, so it has to be
    // closed round the firing hand; the long guns already hold a handguard
    this.supportCurl = two ? 0.62 : 0.18;
  }

  /**
   * Two-bone IK for the off arm. No solver library, no pole object: the
   * elbow is placed on the circle the law of cosines gives, pushed
   * towards `pole`, and then each bone is turned so its own +Y - which is
   * the axis these bones run along, measured - points at the next joint.
   */
  solveSupport() {
    const up = this.bone('upperArm_l'), lo = this.bone('lowerArm_l'), hd = this.bone('hand_l');
    const main = this.bone('Main');
    if (!up || !lo || !hd || !main || !this.supportPos) return;

    main.updateWorldMatrix(true, false);
    up.updateWorldMatrix(true, false);
    // DURING A RELOAD THE OFF HAND IS NOT ON THE GUN. That is the whole
    // of what a reload looks like - it leaves the foregrip, goes to the
    // belt, comes back with a magazine and seats it - so while one is
    // running the IK target comes off the weapon and follows a path.
    const T = this.reloadTarget
      ? this.reloadTarget.clone()
      : this.supportPos.clone().applyMatrix4(main.matrixWorld);
    const S = new THREE.Vector3().setFromMatrixPosition(up.matrixWorld);
    // the lengths are in bone units; the world is scaled by the root
    const sc = up.getWorldScale(new THREE.Vector3()).x || 1;
    const l1 = this.armL1 * sc, l2 = this.armL2 * sc;

    const to = new THREE.Vector3().subVectors(T, S);
    let d = to.length();
    const min = Math.abs(l1 - l2) + 1e-4, max = l1 + l2 - 1e-4;
    d = Math.max(min, Math.min(max, d));
    const u = to.normalize();
    // how far along, and how far off, the elbow sits
    const a = (d * d + l1 * l1 - l2 * l2) / (2 * d);
    const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    // elbows go down and outward, never up through the shoulder
    const pole = new THREE.Vector3(-0.55, -1, 0.25).normalize();
    const n = pole.clone().addScaledVector(u, -pole.dot(u));
    if (n.lengthSq() < 1e-6) n.set(0, -1, 0).addScaledVector(u, -u.y * -1);
    n.normalize();
    const elbow = S.clone().addScaledVector(u, a).addScaledVector(n, h);

    this.alignY(up, new THREE.Vector3().subVectors(elbow, S).normalize());
    up.updateWorldMatrix(false, false);
    lo.updateMatrix(); lo.matrixWorld.multiplyMatrices(up.matrixWorld, lo.matrix);
    this.alignY(lo, new THREE.Vector3().subVectors(T, elbow).normalize());
    lo.updateMatrix(); lo.matrixWorld.multiplyMatrices(up.matrixWorld, lo.matrix);

    // and the wrist takes its angle from the WEAPON, not from the forearm
    const mq = new THREE.Quaternion(); main.getWorldQuaternion(mq);
    const want = mq.multiply(this.supportQuat);
    const pq = new THREE.Quaternion(); lo.getWorldQuaternion(pq);
    hd.quaternion.copy(pq.invert()).multiply(want);
  }

  // -------------------------------------------------------------------
  // THE RELOAD
  // -------------------------------------------------------------------
  //
  // Liam: *"the hands don't do visual reload"*. They did not: `reload`
  // was a static POSE, so pressing R tilted the gun in and tilted it back
  // out again, which reads as a stumble rather than as a reload.
  //
  // A reload is not a pose, it is a sequence of PLACES the off hand is:
  //
  //     0.00  it lets go of the handguard
  //     0.16  the magazine drops out of the well
  //     0.34  the hand is at the belt
  //     0.58  it is back under the well with a fresh magazine
  //     0.72  it seats it - and the whole gun takes the knock
  //     1.00  it is back on the handguard
  //
  // So the off hand's IK target follows that path (which is why the IK
  // was worth building), the `Magazine` bone drops and returns, the
  // slide releases at the end, and the firing hand only supplies the
  // gross tilt through the `reload` pose.
  //
  // The times are FRACTIONS of GUNS[id].reload, so a 1.25 s pistol
  // reload and a 2.1 s rifle reload both look right without a table.
  //
  // A shotgun does not do any of this - it is fed one shell at a time
  // through a port - so it gets its own short cycle, repeated.
  reload(dur, shells = false) {
    this.reloadT = 0;
    this.reloadDur = Math.max(0.15, dur || 1.2);
    this.reloadShell = !!shells;
    this.magOut = 0;
  }

  /** where the off hand should be at `t` (0..1) through the reload */
  reloadPath(t) {
    const main = this.bone('Main');
    if (!main) return null;
    const grip = new THREE.Vector3().setFromMatrixPosition(main.matrixWorld);
    // in the VIEW's frame, relative to the grip: the belt is down and
    // back towards the body, the well is just under the gun
    const P = (x, y, z) => grip.clone().add(new THREE.Vector3(x, y, z));
    const KEYS = this.reloadShell
      // one shell: hand to the belt, up to the loading port, push, back
      ? [[0.00, P(0.00, -0.05, 0.02)], [0.30, P(0.02, -0.30, 0.16)],
         [0.60, P(0.01, -0.10, 0.04)], [0.78, P(0.00, -0.04, 0.01)],
         [1.00, P(0.00, -0.05, 0.02)]]
      : [[0.00, P(0.00, -0.05, 0.02)], [0.16, P(0.03, -0.16, 0.10)],
         [0.34, P(0.05, -0.34, 0.20)], [0.58, P(0.02, -0.18, 0.08)],
         [0.72, P(0.00, -0.09, 0.02)], [1.00, P(0.00, -0.05, 0.02)]];
    for (let i = 1; i < KEYS.length; i++) {
      if (t > KEYS[i][0] && i < KEYS.length - 1) continue;
      const a = KEYS[i - 1], b = KEYS[i];
      let k = (t - a[0]) / Math.max(1e-4, b[0] - a[0]);
      k = Math.max(0, Math.min(1, k));
      k = k * k * (3 - 2 * k);                  // ease, so it does not tick
      return a[1].clone().lerp(b[1], k);
    }
    return KEYS[0][1];
  }

  /** advance the reload; returns the pose weight it wants */
  stepReload(dt) {
    if (this.reloadT === undefined || this.reloadT === null) return 0;
    this.reloadT += dt / this.reloadDur;
    if (this.reloadT >= 1) {
      this.reloadT = null; this.reloadTarget = null; this.magOut = 0;
      this.openL = 0;
      return 0;
    }
    const t = this.reloadT;
    this.reloadTarget = this.reloadPath(t);
    // the hand OPENS as it leaves the gun and closes again on the
    // magazine; a fist travelling to the belt and back is a mime
    this.openL = t < 0.10 ? t / 0.10
      : t < 0.30 ? 1
      : t < 0.50 ? 1 - (t - 0.30) / 0.20
      : t > 0.80 ? Math.max(0, 1 - (t - 0.80) / 0.20) * 0.3 : 0;
    // the magazine is out between the drop and the seat
    this.magOut = this.reloadShell ? 0
      : t < 0.16 ? 0
      : t < 0.30 ? (t - 0.16) / 0.14
      : t < 0.66 ? 1
      : t < 0.74 ? 1 - (t - 0.66) / 0.08 : 0;
    // and the whole gun takes the knock when it seats
    if (t > 0.70 && t < 0.78) this.recoil = Math.max(this.recoil, 0.18);
    // ...and the slide runs forward at the end
    if (t > 0.86 && t < 0.92) this.recoil = Math.max(this.recoil, 0.30);
    // ease the tilt in and out rather than snapping to the pose
    return t < 0.12 ? t / 0.12 : t > 0.88 ? (1 - t) / 0.12 : 1;
  }

  // -------------------------------------------------------------------
  // THE SWING
  // -------------------------------------------------------------------
  //
  // Liam: *"the machete does not have an animation"*. It did not - the
  // melee weapons borrowed the pistol's arms and then never moved them,
  // so a kill was a blade sitting still while a man fell over in front
  // of it.
  //
  // Same shape as the reload: a sequence of PLACES rather than a pose.
  // What makes a swing read is not the arc, it is the WIND-UP - the
  // blade goes back and up first, and the fast part is only fast because
  // of the slow part before it. So the keys are unevenly spaced on
  // purpose: a third of the time is spent loading, a fifth throwing, and
  // the rest recovering.
  //
  //   0.00  from the carry
  //   0.32  cocked - back over the shoulder, blade high
  //   0.50  THROUGH - across the body, blade low and left
  //   0.72  the follow through overshoots and stops
  //   1.00  back to the carry
  //
  // Each key is [pitch, yaw, roll] on the three arm bones, in the view's
  // frame - the same grammar as POSES, so a swing can be read next to a
  // hold and compared.
  static SWING = [
    [0.00, { upperArm_r: [0, 0, 0], lowerArm_r: [0, 0, 0], hand_r: [0, 0, 0] }],
    [0.32, { upperArm_r: [26, 24, 0], lowerArm_r: [40, 16, 0], hand_r: [18, 10, -34] }],
    [0.50, { upperArm_r: [-18, -40, 0], lowerArm_r: [-6, -34, 0], hand_r: [-22, -20, 44] }],
    [0.72, { upperArm_r: [-26, -52, 0], lowerArm_r: [-14, -42, 0], hand_r: [-28, -26, 52] }],
    [1.00, { upperArm_r: [0, 0, 0], lowerArm_r: [0, 0, 0], hand_r: [0, 0, 0] }],
  ];

  /** start a swing lasting `dur` seconds */
  swing(dur) { this.swingT = 0; this.swingDur = Math.max(0.12, dur || 0.5); }

  /** advance it; returns the bone deltas for this frame, or null */
  stepSwing(dt) {
    if (this.swingT === undefined || this.swingT === null) return null;
    this.swingT += dt / this.swingDur;
    if (this.swingT >= 1) { this.swingT = null; return null; }
    const t = this.swingT;
    const K = HandRig.SWING;
    let i = 1;
    while (i < K.length - 1 && t > K[i][0]) i++;
    const a = K[i - 1], b = K[i];
    let k = (t - a[0]) / Math.max(1e-4, b[0] - a[0]);
    k = Math.max(0, Math.min(1, k));
    // EASE THE LOAD, SNAP THE STRIKE. A swing that accelerates evenly
    // reads as a man handing something over.
    k = i === 2 ? k * k : k * k * (3 - 2 * k);
    const out = {};
    for (const bn of Object.keys(a[1])) {
      const p = a[1][bn], q = b[1][bn] || p;
      out[bn] = [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
    }
    return out;
  }

  /** turn `bone` so its own +Y - the axis it runs along - points `dir` */
  alignY(bone, dir) {
    const pq = new THREE.Quaternion();
    bone.parent.getWorldQuaternion(pq);
    const local = dir.clone().applyQuaternion(pq.invert()).normalize();
    bone.quaternion.setFromUnitVectors(UP, local);
  }

  /**
   * Replace the pack's weapon with one of ours, seated at the same grip.
   *
   * THE TWO FRAMES DO NOT AGREE AND THE DIFFERENCE IS A FACTOR OF A
   * HUNDRED. Everything this project builds is in METRES with the grip
   * at the origin and the business end down -Z (see guns.js). The pack
   * is in CENTIMETRES with the model facing +X, and `Main` sits inside
   * a root that is scaled 0.01 and turned a quarter circle. Parenting
   * our machete straight to `Main` therefore drew it at one hundredth
   * of its size, pointing sideways - which on screen is an empty hand,
   * and is exactly what it looked like.
   *
   * So the mesh goes inside a holder whose local transform is whatever
   * cancels all of that: the inverse of the bone's world matrix, times
   * the transform we actually want in the view's own frame. Computed
   * once, at the rest pose; after that the holder is a child of the
   * bone and follows the hand for free.
   */
  attachCustom(mesh, rot) {
    const main = this.bone('Main');
    if (!main) return;
    for (const m of this.gunMeshes) m.visible = false;
    if (this.custom && this.custom.parent) this.custom.parent.remove(this.custom);
    this.custom = null;
    if (!mesh) return;

    this.refresh();
    const holder = new THREE.Group();
    main.add(holder);

    // where we want it: at the grip the pack modelled, upright in the
    // view's frame, at life size
    const at = new THREE.Vector3().setFromMatrixPosition(main.matrixWorld);
    // A BLADE POINTED DEAD DOWN -Z IS SEEN END-ON, and a machete seen
    // end-on is a dark smudge the size of a thumbnail. A weapon that is
    // not a gun wants to be angled ACROSS the view so you can see what
    // it is - which is what every game with a knife in it does.
    const q = new THREE.Quaternion();
    if (rot) q.setFromEuler(new THREE.Euler(rot[0] * D, rot[1] * D, rot[2] * D, 'YXZ'));
    const want = new THREE.Matrix4().compose(at, q, new THREE.Vector3(1, 1, 1));
    const local = new THREE.Matrix4()
      .copy(main.matrixWorld).invert().multiply(want);
    local.decompose(holder.position, holder.quaternion, holder.scale);

    holder.add(mesh);
    this.custom = holder;
  }

  /**
   * EMPTY HANDS. Not the same as clearCustom(): that puts the pack's own
   * weapon back, and for fists there is nothing to put back. The hands
   * have to be visibly holding air and closed, which is what `gripR` and
   * `gripL` at 1 do with the finger tables.
   */
  setBare(on) {
    this.bare = !!on;
    for (const m of this.gunMeshes) m.visible = !on;
    if (on && this.custom && this.custom.parent) {
      this.custom.parent.remove(this.custom);
      this.custom = null;
    }
  }

  /** put the pack's own gun back */
  clearCustom() {
    if (!this.bare) for (const m of this.gunMeshes) m.visible = true;
    if (this.custom && this.custom.parent) this.custom.parent.remove(this.custom);
    this.custom = null;
  }

  /**
   * Nudge where the whole rig sits, on top of its measured base.
   *
   * The melee weapons borrow the pistol's ARMS, and a machete is not
   * held where a pistol is held - it hangs further out and lower, and
   * the pistol's framing put the blade behind the player's own knuckles.
   */
  setFrame(dx, dy, dz) {
    if (!this.base) return;
    if (this.base0 === undefined) this.base0 = this.base.clone();
    this.base.copy(this.base0).add(new THREE.Vector3(dx, dy, dz));
  }

  /** Set the pose mix, e.g. {ready: 0.7, aim: 0.3}. Weights are normalised. */
  setPose(mix) { this.blend = mix; }

  // -------------------------------------------------------------------
  // THE FRAME
  // -------------------------------------------------------------------
  /**
   * `st` carries what the game already tracks: speed, whether it is
   * aiming, and the state of the recoil spring and the trigger.
   */
  update(dt, st = {}) {
    this.t += dt;
    const aim = st.aim || 0;
    const speed = Math.min(1, (st.speed || 0) / 6);

    // ---- the pose blend ------------------------------------------------
    let total = 0;
    for (const k in this.blend) total += this.blend[k];
    if (!total) { this.blend = { hold: 1 }; total = 1; }

    const acc = new Map();
    const shift = [0, 0, 0];
    const extra = EXTRA[this.id];
    for (const name in POSES) {
      const w = (this.blend[name] || 0) / total;
      if (w <= 0.001) continue;
      for (const [bn, deg] of Object.entries(POSES[name])) {
        const a = acc.get(bn) || [0, 0, 0];
        a[0] += deg[0] * w; a[1] += deg[1] * w; a[2] += deg[2] * w;
        acc.set(bn, a);
      }
      const s = name === 'aim' && this.aimShift
        ? [this.aimShift.x, this.aimShift.y, this.aimShift.z] : (SHIFT[name] || [0, 0, 0]);
      shift[0] += s[0] * w; shift[1] += s[1] * w; shift[2] += s[2] * w;
    }
    // A SWING RIDES ON TOP OF THE POSE, not instead of it - so it works
    // from the carry, from the guard and from a run without needing a
    // version of itself for each.
    const sw = this.stepSwing(dt);
    if (sw) for (const [bn, deg] of Object.entries(sw)) {
      const a = acc.get(bn) || [0, 0, 0];
      a[0] += deg[0]; a[1] += deg[1]; a[2] += deg[2];
      acc.set(bn, a);
    }

    // the per-weapon overlay rides on top of every pose, at full weight
    if (extra) for (const [bn, deg] of Object.entries(extra)) {
      const a = acc.get(bn) || [0, 0, 0];
      a[0] += deg[0]; a[1] += deg[1]; a[2] += deg[2];
      acc.set(bn, a);
    }
    if (this.base) this.root.position.set(
      this.base.x + shift[0], this.base.y + shift[1], this.base.z + shift[2]);

    // ---- the procedural layer, added on top -----------------------------
    //
    // None of this can come out of a baked clip, and it is most of what
    // makes a weapon read as held rather than carried. Breathing slows and
    // shrinks when sighted, because that is what holding your breath is.
    const breath = Math.sin(this.t * 1.9) * (1 - aim * 0.75);
    const bobA = Math.sin(this.t * 9.5) * speed;
    const bobB = Math.sin(this.t * 19) * speed;
    const kick = this.recoil;

    // make sure every bone a procedural term touches is in the map, even
    // if no pose named it
    for (const bn of ['upperArm_r', 'lowerArm_r', 'hand_r',
                      'upperArm_l', 'lowerArm_l', 'hand_l'])
      if (!acc.has(bn)) acc.set(bn, [0, 0, 0]);

    for (const [bn, deg] of acc) {
      const b = this.bones.get(bn);
      const ax = this.axes.get(bn);
      const rest = this.rest.get(bn);
      if (!b || !ax || !rest) continue;
      let [pitch, yaw, roll] = deg;
      const right = bn.endsWith('_r');
      if (bn.startsWith('upperArm')) {
        pitch += breath * 0.55 + bobA * 1.7 + kick * 5.5;
        yaw += bobB * 1.1 * (right ? 1 : -1);
      } else if (bn.startsWith('lowerArm')) {
        pitch += bobA * 1.1 + kick * 3.0;
        roll += bobB * 0.8 * (right ? 1 : -1);
      } else if (bn.startsWith('hand')) {
        pitch += breath * 0.35 + kick * 7.0;
        roll += bobB * 1.4 * (right ? 1 : -1);
      }
      this._q.copy(rest.q);
      if (pitch) this._q.multiply(this._q2.setFromAxisAngle(ax.pitch, pitch * D));
      if (yaw)   this._q.multiply(this._q2.setFromAxisAngle(ax.yaw, yaw * D));
      if (roll)  this._q.multiply(this._q2.setFromAxisAngle(ax.roll, roll * D));
      b.quaternion.copy(this._q);
    }

    // ---- the fingers ---------------------------------------------------
    //
    // The rest pose already has them round the grip, so these are curls
    // ON TOP of it and `open` is the one that has to undo it. The trigger
    // finger is the only one that moves while shooting.
    const g = this.grip;
    for (const side of ['r', 'l']) {
      const toFist = side === 'r' ? this.gripR : Math.max(this.gripL, this.supportCurl || 0);
      const toOpen = side === 'l' ? this.openL : 0;
      for (const f of FINGERS) {
        const base = g[f] || [0, 0, 0, 0];
        const fist = GRIP.fist[f], open = GRIP.open[f];
        const isTrigger = (f === 'index' && side === 'r');
        const extra = isTrigger ? this.trigger * 22 : 0;
        const names = [f + 'Knuckle_' + side, f + '_01_' + side,
                       f + '_02_' + side, f + '_03_' + side];
        for (let i = 0; i < 4; i++) {
          const b = this.bones.get(names[i]);
          const rest = this.rest.get(names[i]);
          if (!b || !rest) continue;
          let deg = base[i] * (1 - toFist) + fist[i] * toFist;
          deg = deg * (1 - toOpen) + open[i] * toOpen;
          if (i > 0) deg += extra * (1 - toOpen);
          // a finger closes about its own X; only the knuckle spreads,
          // and only the thumb's spread is worth having
          this._q.copy(rest.q).multiply(
            this._q2.setFromEuler(new THREE.Euler(-deg * D,
              i === 0 && f === 'thumb' ? -8 * D * (1 - toOpen) : 0, 0)));
          b.quaternion.copy(this._q);
        }
      }
    }

    // ---- the reload, if one is running ---------------------------------
    //
    // BEFORE the pose blend is applied to bones, because it decides how
    // much of the reload pose there is, and BEFORE solveSupport, because
    // it sets where the off hand is going.
    const rl = this.stepReload(dt);
    if (rl > 0) { this.blend = Object.assign({}, this.blend, { reload: rl }); }

    // ---- the off hand, solved to the weapon ----------------------------
    //
    // AFTER the pose pass, so it overrides whatever the pose did to that
    // arm, and before the gun's own parts so they see a settled skeleton.
    this.solveSupport();

    // ---- the weapon's own moving parts --------------------------------
    this.cycle(dt, st);
  }

  /**
   * The gun's own bones. The pack modelled them - a pistol slide, a
   * shotgun's pump - and their baked clips were the only place they were
   * ever driven, so with the clips unplayed this has to do it.
   */
  cycle(dt, st) {
    const set = (name, fn) => {
      const b = this.bone(name), rest = this.rest.get(name);
      if (!b || !rest) return null;
      fn(b, rest);
      return b;
    };
    set('Trigger', (b, rest) => {
      b.quaternion.copy(rest.q).multiply(
        this._q2.setFromEuler(new THREE.Euler(this.trigger * -14 * D, 0, 0)));
    });
    // the slide runs back with the recoil and returns with it
    set('Slide', (b, rest) => {
      b.position.copy(rest.p);
      b.position.x -= Math.min(1, this.recoil * 1.6) * 3.4;   // cm, along the model's forward
    });
    set('Hammer', (b, rest) => {
      b.quaternion.copy(rest.q).multiply(
        this._q2.setFromEuler(new THREE.Euler(0, 0, Math.max(0, 1 - this.recoil * 6) * 20 * D)));
    });
    // THE MAGAZINE LEAVES THE WELL. The pack modelled it as its own
    // bone and only ever moved it in a clip we do not play, so without
    // this the magazine stays in the gun through the whole reload and
    // the hand mimes round it.
    set('Magazine', (b, rest) => {
      b.position.copy(rest.p);
      const m = this.magOut || 0;
      b.position.y -= m * 9;                  // centimetres, straight down
      b.position.x -= m * 1.5;
      if (b.parent) b.visible = m < 0.98;     // gone, once it is clear
    });
    // a pump gun's forearm, driven by the same spring
    set('Forearm', (b, rest) => {
      b.position.copy(rest.p);
      b.position.x -= Math.min(1, this.pump || 0) * 5.0;
    });
  }
}

export { GRIP, POSES };
