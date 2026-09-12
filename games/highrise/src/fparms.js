// ============================================================================
//  THE FIRST-PERSON ARMS - a real rig, with real fingers
// ============================================================================
//
// Liam: *"I got you some fps arms that have fingers so you can do very
// precise finger and hand and arm animations"*.
//
// What was there before was mine, and it was built out of boxes: a
// square-section bar for the forearm, a cuboid palm, three cuboids per
// finger. He photographed it and the arm reads as a plank. This is a
// proper skinned mesh - 1,176 triangles, 52 bones, a 512 sheet - with
// eighteen hand-animated actions in it.
//
// WHY THIS NEEDED A NEW LOADER. src/glb.js is a small hand-rolled glTF
// parser written for static props. It reads meshes and materials and
// silently ignores skins and animation, so the rig loaded as 1,176
// triangles in its bind pose with no bones at all - which looks like a
// broken export and is not. three's own GLTFLoader is now vendored at
// vendor/jsm/loaders/GLTFLoader.js for this one asset.
//
// HOW THE FILE WAS PREPARED. The .blend has two armatures (the deform
// rig and a rigify control rig), fifty widget meshes and eight stray
// cubes. Exporting it whole wraps the arms in a cloud of control shapes.
// tools/ has the Blender script; it keeps ArmsMesh and ArmsRig and throws
// the rest away, and writes assets/ref/arms_rigged.glb.
//
// THE BONE NAMES LOSE THEIR DOTS. Blender's `f_index.01.R` becomes
// `f_index01R` in glTF. Anything addressing a finger has to use the
// second spelling, and that is the single most likely reason a pose
// silently does nothing.

import * as THREE from '../vendor/three.module.js';
import { asset } from './base.js';
import { GLTFLoader } from '../vendor/jsm/loaders/GLTFLoader.js';

const URL = asset('assets/ref/arms_rigged.glb');

// The eighteen actions in the file, grouped by what the game would ask
// for. Names are exactly as they come out of the GLB.
export const ACTIONS = {
  rest: 'rest',
  relax: 'relax',
  fistsIdle: 'guard_idle',
  fistsDraw: 'guard_draw',
  punchR: 'jab.R',
  punchL: 'jab.L',
  shoveR: 'push.R',
  shoveL: 'push.L',
  grabR: 'grab.R',
  grabL: 'grab.L',
  bladeIdle: 'knife_idle',
  bladeDraw: 'knife_draw',
  bladeHit1: 'knife_hit_01',
  bladeHit2: 'knife_hit_02',
};

let PENDING = null, CACHE = null;

/** Load the rig once, whoever asks and however often. */
export function loadArms() {
  if (CACHE) return Promise.resolve(CACHE);
  if (!PENDING) {
    PENDING = new GLTFLoader().loadAsync(URL).then((gl) => {
      // NEAREST, like everything else in this building. The sheet is a
      // hand-painted 512 and it is the one texture the player is closest
      // to all game; smoothing it is the one place the era shows.
      gl.scene.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;          // it is always in front of the lens
        const m = o.material;
        if (m && m.map) {
          m.map.magFilter = THREE.NearestFilter;
          m.map.minFilter = THREE.NearestMipmapNearestFilter;
          m.map.anisotropy = 1;
          m.map.needsUpdate = true;
        }
      });
      CACHE = gl;
      return gl;
    });
  }
  return PENDING;
}

export class RiggedArms {
  /** `gl` is what loadArms() resolved to. */
  constructor(gl) {
    this.root = new THREE.Group();
    this.root.add(gl.scene);
    this.mixer = new THREE.AnimationMixer(gl.scene);
    this.clips = new Map();
    for (const c of gl.animations) this.clips.set(c.name, c);

    this.bones = new Map();
    gl.scene.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });

    this.current = null;
    this.action = null;
  }

  bone(name) { return this.bones.get(name) || null; }

  /**
   * Play a clip by its GLB name. `loop` false plays once and holds the
   * last frame, which is what a punch or a draw wants.
   */
  play(name, { loop = true, fade = 0.12, speed = 1 } = {}) {
    const clip = this.clips.get(name);
    if (!clip) return null;
    const next = this.mixer.clipAction(clip);
    next.enabled = true;
    next.setEffectiveTimeScale(speed);
    next.setEffectiveWeight(1);
    next.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    next.clampWhenFinished = !loop;
    if (this.action && this.action !== next) {
      next.reset().crossFadeFrom(this.action, fade, false).play();
    } else {
      next.reset().play();
    }
    this.action = next;
    this.current = name;
    return next;
  }

  update(dt) { this.mixer.update(dt); }

  /**
   * Hang something off a hand. The weapon has to be a CHILD of the bone,
   * not moved to the bone's position each frame - the hand is animated
   * and anything chasing it is a frame behind, which reads as the gun
   * being loose in the grip.
   */
  attach(obj, side = 'R') {
    const b = this.bone('hand' + side);
    if (!b) return false;
    b.add(obj);
    return true;
  }

  /** Where the eye should sit, per the rig's own camera bone. */
  eyeBone() { return this.bone('camera'); }
}


// ============================================================================
//  THE RETRO WEAPON PACK - arms that come WITH the gun, and its animations
// ============================================================================
//
// Liam: *"use the new gun models I gave you"*, and before that *"work on
// gun animations and make sure guns are pointed the right way"*.
//
// Those are the same job. Every attempt to aim a gun correctly by hand
// has been a fight, because a weapon in a fist is not a transform you can
// derive - it is a pose, and a pose is something an animator makes. This
// pack ships four of them, each as a set of arms holding that specific
// weapon, with 16-26 hand-made actions apiece.
//
// FOUR THINGS ABOUT THESE FILES, all of which cost me a wrong turn:
//
//  1. TWO ARMATURES PER WEAPON. The arms and the gun are separate
//     skeletons with separate actions, and they are MATCHED PAIRS -
//     Arms_Fire and Pistol_Fire are played together. Play one alone and
//     the other sits in its bind pose: the first render came out as a
//     hand pointing at nothing with a pistol lying in mid-air below it.
//  2. THE GUNS HAVE MOVING PARTS. The pistol armature carries Slide,
//     Hammer, Trigger and Magazine bones, so the slide cycles on Fire and
//     the magazine drops on Reload. That is animated in the clip; nothing
//     here has to drive it.
//  3. THEY ARE MODELLED IN CENTIMETRES. An 86 cm pistol arrives 86 units
//     long. Scaling the root fixes the meshes AND the animated bone
//     translations in one go, which is why it is done here rather than in
//     Blender - scaling an armature and its skinned meshes there is a
//     good way to break the bind pose.
//  4. The arms material points at Blender's UV grid rather than the
//     albedo the pack ships, so untreated they render as a black and
//     white checkerboard. tools/export_weapon.py repoints it.

export const WEAPONS = {
  pistol:  { file: 'Pistol',  arms: 'Arms',   gun: 'Pistol' },
  rifle:   { file: 'Rifle',   arms: 'Arms',   gun: 'Rifle' },
  shotgun: { file: 'Shotgun', arms: 'Arms',   gun: 'Shotgun' },
  smg:     { file: 'SMG',     arms: 'Arms',   gun: 'SMG' },
};

// ---- POSES, RESOLVED BY MATCHING THE NAMES THAT ARE ACTUALLY THERE ----
//
// A fixed suffix table cannot work, because the pack's own naming is not
// consistent between its four weapons:
//
//   pistol    Pistol_IdlePose    Pistol_Walk        Arms_BasePose
//   rifle     Rifle_IdlePose     Rifle_Walk         Arms_BasePose
//   shotgun   shotgun01_BasePose shotgun01_fire     arms_DrawWeapon
//   smg       Smg_BasePose       Smg_WalkAiming     Arms_Draw
//
// Built on suffixes, the shotgun resolved NOTHING - all sixteen poses
// missing - and half the SMG's. It fails silently, because a pose that
// resolves to no clip plays no clip and reports nothing.
//
// So each pose is a set of keywords plus a set of keywords that must NOT
// appear (a plain 'fire' must not match 'fire_Aiming'), matched against
// the normalised clip names in whatever file is loaded.
const POSE_MATCH = {
  idle:      { want: ['idlepose', 'basepose'],           not: ['aim', 'crouch'] },
  breathe:   { want: ['breathing'],                      not: ['aiming', 'crouch'] },
  walk:      { want: ['walk'],                           not: ['aiming', 'crouch'] },
  run:       { want: ['run'],                            not: ['aiming'] },
  crouch:    { want: ['crouch'],                         not: ['aiming'] },
  aimIn:     { want: ['aimstart'],                       not: [] },
  aimIdle:   { want: ['breathingaiming', 'aimpose'],     not: [] },
  aimOut:    { want: ['aimend'],                         not: [] },
  aimWalk:   { want: ['walkaiming', 'walkaim'],          not: [] },
  fire:      { want: ['fire'],                           not: ['aiming', 'aim'] },
  fireAimed: { want: ['fireaiming', 'aimingfire'],       not: [] },
  reload:    { want: ['reloadstart', 'reload'],          not: ['step', 'end'] },
  draw:      { want: ['drawweapon', 'draw'],             not: [] },
  hide:      { want: ['hideweapon', 'hide'],             not: [] },
  empty:     { want: ['emptymagazine', 'idle_empty'],    not: [] },
  interact:  { want: ['interaction', 'interact'],        not: [] },
};

export const POSE = POSE_MATCH;

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Build pose -> { gun, arms } for one loaded weapon, by name matching.
 *
 * A clip belongs to the ARMS if its normalised name starts with 'arms';
 * everything else is the weapon's. Both halves are wanted - see the note
 * on matched pairs above - but the arms rig genuinely has fewer clips
 * than the guns, so one half is a normal result and zero is a bug.
 */
function resolvePoses(names) {
  const arms = names.filter((n) => norm(n).startsWith('arms'));
  const guns = names.filter((n) => !norm(n).startsWith('arms')
                                && !norm(n).startsWith('actionstash'));
  const pick = (list, spec) => {
    let best = null, bestRank = 1e9;
    for (const n of list) {
      const k = norm(n);
      if (spec.not.some((b) => k.includes(b))) continue;
      const rank = spec.want.findIndex((w) => k.includes(w));
      if (rank < 0) continue;
      // earlier keyword wins; then the shorter name, which is the plainer
      // variant of two that both matched
      const score = rank * 100 + k.length;
      if (score < bestRank) { bestRank = score; best = n; }
    }
    return best;
  };
  const out = {};
  for (const [pose, spec] of Object.entries(POSE_MATCH))
    out[pose] = { gun: pick(guns, spec), arms: pick(arms, spec) };

  // ---- AND WHAT TO DO WHEN A FILE SIMPLY DOES NOT HAVE ONE ----------
  //
  // The four weapons are not equally finished. The pistol ships 26
  // clips and has everything; the rifle ships 16 and has no walk, run,
  // breathe or crouch at all. Without a fallback, walking with the rifle
  // plays nothing and the arms freeze mid-stride.
  //
  // Each entry is what to use instead, in order. Falling back to 'idle'
  // is always safe because every weapon has a base pose.
  const FALL = {
    breathe: ['idle'], walk: ['breathe', 'idle'], run: ['walk', 'breathe', 'idle'],
    crouch: ['walk', 'idle'], aimIn: ['aimIdle', 'idle'], aimIdle: ['aimIn', 'idle'],
    aimOut: ['idle'], aimWalk: ['aimIdle', 'walk', 'idle'],
    fireAimed: ['fire'], empty: ['idle'], interact: ['reload', 'idle'],
    draw: ['idle'], hide: ['idle'],
  };
  for (const [pose, chain] of Object.entries(FALL)) {
    if (out[pose] && (out[pose].gun || out[pose].arms)) continue;
    for (const alt of chain) {
      if (out[alt] && (out[alt].gun || out[alt].arms)) {
        out[pose] = { ...out[alt], fellBackTo: alt };
        break;
      }
    }
  }
  return out;
}

const WCACHE = new Map();

let ARMS_TEX = null;
/**
 * The pack's own arm sheet, loaded once and shared by all four weapons.
 *
 * Returns a PROMISE, and loadWeapon waits on it. That is not tidiness:
 * a three.js Texture whose image has not arrived yet samples as BLACK,
 * not as white, so handing the material an unloaded map turns the whole
 * view model into a silhouette - which is exactly what it did.
 */
function armsTexture() {
  if (!ARMS_TEX) ARMS_TEX = new THREE.TextureLoader()
    .loadAsync(asset('assets/ref/arms_01.png'))
    .then((t) => {
      t.colorSpace = THREE.SRGBColorSpace;
      t.flipY = false;                 // glTF UVs, not three's default
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapNearestFilter;
      t.anisotropy = 1;
      t.needsUpdate = true;
      return t;
    });
  return ARMS_TEX;
}

// ---------------------------------------------------------------------
// THE RIGHT ARM DOES NOT EXIST IN ANY OF THE FOUR FILES
// ---------------------------------------------------------------------
//
// Measured, not guessed: of the 1059 vertices in `FPS_Arms_Mesh`, all
// 1059 weight to a bone whose name ends `_l`. Every export is a LEFT arm
// on a skeleton that has both. That is why the first-person view showed
// one arm doing nothing while the gun floated beside it - the hand
// holding the gun had no mesh on it at all.
//
// (It is an export fault, not a pack fault: the skeleton, the textures
// and the clips all address both sides. tools/export_weapon.py selected
// one object.)
//
// So the right arm is MADE, by mirroring the left one across the model's
// own left-right plane and re-pointing every weight at the matching `_r`
// bone. Doing it here rather than in Blender means it cannot fall out of
// step with a re-export, and it costs one clone of a 1059-vertex mesh.
//
// WHY IT IS SAFE TO IGNORE HOW THE TWO SIDES' BONE AXES DIFFER (and they
// do differ - a mirrored bone has its X negated to stay right-handed):
// at the bind pose EVERY bone's skinning matrix is the identity, by
// construction. So if the mirrored vertex is placed at the mirrored BIND
// WORLD position and pointed at the mirrored bone, it is correct at bind
// - and therefore correct everywhere, because skinning is linear in the
// bone's motion away from bind. No axis convention enters into it.
function mirrorArm(src) {
  const names = src.skeleton.bones.map((b) => b.name);
  const remap = new Map();
  for (let i = 0; i < names.length; i++) {
    if (!names[i].endsWith('_l')) continue;
    const j = names.indexOf(names[i].slice(0, -2) + '_r');
    if (j >= 0) remap.set(i, j);
  }
  if (!remap.size) return null;

  const g = src.geometry.clone();
  // geometry -> bind world -> mirrored -> back to geometry space
  const bm = src.bindMatrix.clone();
  const T = new THREE.Matrix4().copy(bm).invert()
    .multiply(new THREE.Matrix4().makeScale(1, 1, -1)).multiply(bm);
  const N = new THREE.Matrix3().setFromMatrix4(T);

  const pos = g.attributes.position, nor = g.attributes.normal;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(T);
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  if (nor) for (let i = 0; i < nor.count; i++) {
    v.fromBufferAttribute(nor, i).applyMatrix3(N).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  // a mirror reverses winding, so every triangle has to be turned back
  // over or the arm renders inside out and lights from the wrong side
  const idx = g.index;
  if (idx) for (let i = 0; i < idx.count; i += 3) {
    const b = idx.getX(i + 1);
    idx.setX(i + 1, idx.getX(i + 2)); idx.setX(i + 2, b);
  }
  const si = g.attributes.skinIndex;
  for (let i = 0; i < si.count; i++)
    for (let c = 0; c < 4; c++) {
      const b = si.getComponent(i, c);
      if (remap.has(b)) si.setComponent(i, c, remap.get(b));
    }
  si.needsUpdate = true; pos.needsUpdate = true; if (nor) nor.needsUpdate = true;
  if (idx) idx.needsUpdate = true;
  g.computeBoundingSphere();

  const m = new THREE.SkinnedMesh(g, src.material);
  m.name = src.name.replace(/mesh/i, '') + 'Mesh_R';
  m.frustumCulled = false;
  // the same parent, so its world matrix - and therefore its bind matrix
  // - is the one the mirror was computed against
  src.parent.add(m);
  m.bind(src.skeleton, bm);
  return m;
}

/** Load one weapon's arms+gun rig. `id` is a key of WEAPONS. */
export function loadWeapon(id) {
  const spec = WEAPONS[id];
  if (!spec) return Promise.reject(new Error('no weapon rig: ' + id));
  if (!WCACHE.has(id)) {
    WCACHE.set(id, Promise.all([
      new GLTFLoader().loadAsync(asset('assets/ref/fps/' + spec.file + '.glb')),
      armsTexture(),
    ]).then(([gl, skin]) => {
        gl.scene.traverse((o) => {
          if (!o.isMesh) return;
          o.frustumCulled = false;
          const m = o.material;
          if (m && m.map) {
            m.map.magFilter = THREE.NearestFilter;
            m.map.minFilter = THREE.NearestMipmapNearestFilter;
            m.map.anisotropy = 1;
            m.map.needsUpdate = true;
          }
        });
        // ---- THE ARMS TEXTURE, WHICH THREE OF THE FOUR GET WRONG ----
        //
        // The pistol exported with the pack's skin sheet; the rifle, the
        // shotgun and the SMG exported still pointing at Blender's UV
        // GRID, so their arms render as a grey-and-white checkerboard
        // with little coloured crosses on it. It reads as a broken
        // material, and at a glance it reads as a broken rig.
        //
        // Rather than detect it, all four are simply pointed at the same
        // sheet: the arms are the same arms in every file, so they should
        // not look different from weapon to weapon anyway.
        gl.scene.traverse((o) => {
          if (!o.isSkinnedMesh || !/^fps_arms/i.test(o.name)) return;
          const m = o.material;
          if (!m) return;
          m.map = skin;
          m.needsUpdate = true;
        });

        // and give it the arm it was exported without
        const arms = [];
        gl.scene.traverse((o) => { if (o.isSkinnedMesh && /^fps_arms/i.test(o.name)) arms.push(o); });
        gl.scene.updateMatrixWorld(true);
        for (const a of arms) {
          if (a.userData.mirrored) continue;
          const m = mirrorArm(a);
          if (m) { a.userData.mirrored = true; m.userData.mirrored = true; }
        }
        return gl;
      }));
  }
  return WCACHE.get(id);
}

export class WeaponArms {
  constructor(id, gl) {
    this.id = id;
    this.spec = WEAPONS[id];
    this.root = new THREE.Group();
    // centimetres -> metres, on the root, so the animation comes with it
    this.root.scale.setScalar(0.01);
    this.root.add(gl.scene);
    this.mixer = new THREE.AnimationMixer(gl.scene);
    this.clips = new Map();
    for (const c of gl.animations) this.clips.set(c.name, c);
    this.bones = new Map();
    gl.scene.traverse((o) => { if (o.isBone) this.bones.set(o.name, o); });
    this.playing = [];
    this.pose = null;
    this.map = resolvePoses([...this.clips.keys()]);
  }

  bone(n) { return this.bones.get(n) || null; }
  has(name) { return this.clips.has(name); }

  /**
   * Play a named pose - both halves of it. Returns the clips it managed
   * to start, which is 2 normally and 1 where the arms rig has no clip of
   * its own for that state.
   */
  play(poseName, { loop = true, fade = 0.12, speed = 1 } = {}) {
    const P = this.map[poseName];
    if (!P) return [];
    const want = [P.gun, P.arms].filter((n) => n && this.clips.has(n));
    if (!want.length) return [];
    const started = [];
    for (const n of want) {
      const a = this.mixer.clipAction(this.clips.get(n));
      a.enabled = true;
      a.setEffectiveTimeScale(speed);
      a.setEffectiveWeight(1);
      a.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
      a.clampWhenFinished = !loop;
      a.reset().fadeIn(fade).play();
      started.push(a);
    }
    // fade out whatever was running, rather than stopping it dead
    for (const old of this.playing) if (!started.includes(old)) old.fadeOut(fade);
    this.playing = started;
    this.pose = poseName;
    return started;
  }

  update(dt) { this.mixer.update(dt); }
}

// =====================================================================
// THE SAME GUNS, IN THE WORLD
// =====================================================================
//
// Liam, after the first-person rig went in: *"the old gun graphics is
// still there"*.
//
// He is right, and it is a different code path. `hands.js` draws the
// pack's weapon because the pack's ARMS are holding it; every other gun
// in the building - the one in each mercenary's hands, the one lying on
// the carpet where he dropped it - is built by `guns.js`, which bakes
// its own low-poly models. So the pistol you are holding and the pistol
// on the floor two metres away were two different pistols.
//
// This bakes the pack's weapon into an ordinary static Mesh in the
// game's own convention - grip at the origin, barrel down -Z, metres -
// so `guns.js` can hand it out anywhere.
//
// THREE THINGS THAT MAKE IT SIMPLER THAN IT SOUNDS:
//
//  1. At the BIND pose every skinning matrix is the identity, so the
//     geometry as authored already IS the gun. Nothing has to be
//     evaluated; the vertices only need moving into the right frame.
//  2. Main's bind transform is recoverable even after HandRig has
//     reparented the bone, because `skeleton.boneInverses` is captured at
//     bind and never touched. Invert it and you have where the grip was.
//  3. The barrel direction is the weapon's long axis, measured the same
//     way handrig.js measures it - see the note there about why
//     grip-to-muzzle is not it.

const PACK_GUN = new Map();

/** the pack's weapon as a plain Mesh: grip at origin, barrel down -Z, metres */
export function packGun(id) {
  if (PACK_GUN.has(id)) return PACK_GUN.get(id);
  const p = loadWeapon(id).then((gl) => {
    const parts = [];
    gl.scene.traverse((o) => {
      if (o.isMesh && !/^fps_arms/i.test(o.name)) parts.push(o);
    });
    if (!parts.length) return null;

    // ---- where the grip is, at bind ----
    let bindMain = null;
    for (const m of parts) {
      if (!m.isSkinnedMesh) continue;
      const i = m.skeleton.bones.findIndex((b) => b.name === 'Main');
      if (i < 0) continue;
      bindMain = m.skeleton.boneInverses[i].clone().invert();
      break;
    }

    // ---- the vertices, in bind world space ----
    const out = new THREE.Group();
    const pts = [];
    for (const m of parts) {
      const g = m.geometry.clone();
      const pos = g.getAttribute('position');
      if (!pos) continue;
      if (m.isSkinnedMesh) g.applyMatrix4(m.bindMatrix);
      const v = new THREE.Vector3();
      const p2 = g.getAttribute('position');
      for (let i = 0; i < p2.count; i += 3) pts.push(v.fromBufferAttribute(p2, i).clone());
      // drop the skinning attributes - this is a rigid prop now, and
      // leaving them on makes three try to bind it to a skeleton it has
      g.deleteAttribute('skinIndex');
      g.deleteAttribute('skinWeight');
      out.add(new THREE.Mesh(g, m.material));
    }
    if (!pts.length) return null;

    const grip = bindMain ? new THREE.Vector3().setFromMatrixPosition(bindMain)
      : pts.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(pts.length);

    // ---- the long axis, by power iteration on the covariance ----
    const c = pts.reduce((a, q) => a.add(q), new THREE.Vector3()).divideScalar(pts.length);
    let axis = new THREE.Vector3(1, 0, 0), next = new THREE.Vector3(), d = new THREE.Vector3();
    for (let it = 0; it < 24; it++) {
      next.set(0, 0, 0);
      for (const q of pts) { d.subVectors(q, c); next.addScaledVector(d, d.dot(axis)); }
      if (next.lengthSq() < 1e-20) break;
      next.normalize();
      if (next.dot(axis) < 0) next.negate();
      axis.copy(next);
    }
    // point it at the MUZZLE end - the end furthest from the grip
    let far = null, fd = -1;
    for (const q of pts) { const t = q.distanceTo(grip); if (t > fd) { fd = t; far = q; } }
    if (far && axis.dot(d.subVectors(far, grip)) < 0) axis.negate();

    // ---- into the game's convention ----
    //
    // A rotation that takes the barrel to -Z while leaving the model's
    // own up (+Y) as up. Built as a basis rather than as Euler angles,
    // because a triple that does this is a thing you tune by eye and a
    // basis is a thing you can read.
    const up = new THREE.Vector3(0, 1, 0);
    const b3 = axis.clone().negate();                 // barrel -> +Z, so -Z is forward
    const b2 = up.clone().addScaledVector(b3, -up.dot(b3));
    if (b2.lengthSq() < 1e-6) b2.set(0, 0, 1).addScaledVector(b3, -b3.z);
    b2.normalize();
    const b1 = new THREE.Vector3().crossVectors(b2, b3).normalize();
    const R = new THREE.Matrix4().makeBasis(b1, b2, b3).transpose();

    const M = new THREE.Matrix4()
      .makeScale(0.01, 0.01, 0.01)                    // the pack is in centimetres
      .multiply(R)
      .multiply(new THREE.Matrix4().makeTranslation(-grip.x, -grip.y, -grip.z));
    for (const m of out.children) m.geometry.applyMatrix4(M);

    // and where the flash comes out, in the same frame
    const tip = new THREE.Vector3();
    let best = -Infinity;
    for (const q of pts) {
      const w = q.clone().applyMatrix4(M);
      if (-w.z > best) { best = -w.z; tip.copy(w); }
    }
    out.userData.muzzle = [0, tip.y, tip.z];
    out.userData.packGun = id;
    return out;
  }).catch((e) => { console.warn('packGun ' + id + ': ' + e.message); return null; });
  PACK_GUN.set(id, p);
  return p;
}
