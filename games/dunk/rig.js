// =====================================================================
// DUNK :: rig.js - THE SKINNED BODY
// =====================================================================
//
// TAKEN FROM HIGHRISE, unchanged apart from the two import paths.
//
// Liam: *"the lowpoly is just cubes not highrise style lowpoly"*. He is
// right, and the answer was already on his own disk: HIGHRISE has a real
// skinned low-poly human - 700 triangles, 21 bones, generated UV islands -
// and a rig whose bind pose has no rotations in it, which is what makes
// posing it readable. Boxes with joints will never look like that.
//
// The mesh itself is assets/refman.js: "Low Poly PS1 Man Template by The
// Cloudytrooper (CC-BY)", baked by HIGHRISE tools/bake_actor.mjs. The
// attribution rides along inside the asset file.
//
// ORIGINAL HEADER FOLLOWS
// =====================================================================
// HIGHRISE :: rig.js - THE SKINNED BODY
// =====================================================================
//
// Liam: *"you do a bad job at making the 3D models"*, *"add in good
// animations"*, *"make it so all characters visibly aren't turned left
// 90 degrees"*.
//
// This file is the answer to all three, and it replaces the old
// actor.js's central idea. Before, a character was ONE FROZEN MESH that
// got bent by arithmetic every time it was built: it could not step,
// could not swing, could not flinch, and because its axes were never
// normalised its facing had to be patched by hand in two files with two
// different fudge angles (`yaw - PI/2` in combat.js, `yaw + PI` in
// main.js - one of them was always wrong).
//
// Now there is a skeleton, and three things follow from it for free:
//
//   * FACING. tools/bake_actor.mjs rotated the mesh into the game's axes
//     once, offline. +X is his right, -Z is the way he looks. So a body
//     faces where it is told with `rotation.y = yaw` and nothing else.
//
//   * EVERY BONE SHARES THE CHARACTER'S AXES. No bone has a rotation in
//     the bind pose - only a translation - so a bone's local X, Y and Z
//     are the body's own. That is why the whole animation library reads
//     as English: rotate a hip about X and the leg swings forward,
//     rotate the spine about Y and he twists at the waist. Rigs exported
//     from a DCC tool almost never have this property, and posing them
//     is quaternion soup for exactly that reason.
//
//   * A WEAPON IS PARENTED TO A HAND. Not drawn at an offset from the
//     body and hoped over.
import * as THREE from '../_deck/three.module.js';
// LIAM'S CHARACTER, not the Sketchfab template.
//
// From his reference pack - mesh 10 of the office set, 700 triangles,
// T-posed, and it carries the pack's proportions and its hooded
// silhouette. Baked to a rig by the same tool, which measures everything
// and assumes nothing:
//
//   node tools/bake_actor.mjs assets/ref/asset_no_estilo_de_ps1_v3.glb 10 assets/refman.js
//
// The old template is still on disk at assets/ps1man.js; swapping back is
// one line.
import ASSET from './assets/refman.js';

export const BONE_NAMES = ASSET.bones.map((b) => b.name);
export const LM = ASSET.landmarks;
const IDX = new Map(BONE_NAMES.map((n, i) => [n, i]));

// ---------------------------------------------------------------------
// THE REST OFFSETS
// ---------------------------------------------------------------------
//
// The model was modelled in an A-pose: arms out at about thirty degrees,
// legs splayed a little. That is a good pose to SKIN and a terrible pose
// to ANIMATE from, because every single pose in the library would have to
// carry the same thirty degrees of correction and would be wrong the
// moment the base model changed.
//
// So the rig has a NEUTRAL: arms hanging straight down, legs vertical.
// It is computed from the bind positions rather than typed in, and it is
// applied under every pose. Animations are then authored against a man
// standing still, which is what "raise the arm 90 degrees" should mean.
const P = {};
for (const b of ASSET.bones) P[b.name] = b.pos;

/**
 * The euler that takes the segment a->b and points it STRAIGHT DOWN.
 *
 * Two rotations, in the order three.js applies an 'XYZ' euler (Z first,
 * then Y, then X):
 *   Z swings the limb into the YZ plane, killing its sideways lean
 *   X then swings it into vertical, killing its forward/back lean
 *
 * The first version of this did the Z half only, because the model it was
 * written for was A-posed and its arms had no forward component worth
 * correcting. Liam's reference character is T-POSED, and the next model
 * will be something else again - so this does the general thing. It is
 * the difference between a baker that works on one mesh and one that
 * works on any humanoid, which is the whole point of having a baker.
 */
function restEuler(a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const rz = -Math.atan2(dx, -dy);
  const h = Math.hypot(dx, dy);
  const rx = Math.atan2(dz, h);
  return [rx, 0, rz];
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];

// A CHILD BONE INHERITS ITS PARENT'S CORRECTION, so every joint below the
// first one has to cancel what the joint above it just did. Applying the
// raw correction at each joint splays the forearms and knock-knees the
// shins - the arms come down and the hands swing out sideways as they go.
const REST_OF = (parent, a, b) => parent ? sub(restEuler(a, b), parent) : restEuler(a, b);
const rShR = restEuler(P.shoulderR, P.elbowR), rShL = restEuler(P.shoulderL, P.elbowL);
const rHipR = restEuler(P.hipR, P.kneeR), rHipL = restEuler(P.hipL, P.kneeL);
export const REST = {
  // Right arm leans to -X, left to +X; a positive rotation about Z takes
  // +X toward +Y, so the two sides come out with opposite signs.
  shoulderR: rShR, shoulderL: rShL,
  elbowR: REST_OF(rShR, P.elbowR, P.wristR),
  elbowL: REST_OF(rShL, P.elbowL, P.wristL),
  hipR: rHipR, hipL: rHipL,
  kneeR: REST_OF(rHipR, P.kneeR, P.ankleR),
  kneeL: REST_OF(rHipL, P.kneeL, P.ankleL),
};
/** length of a limb segment, in height-1 units */
export function boneLen(a, b) {
  const p = P[a], q = P[b];
  return Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
}

// ---------------------------------------------------------------------
// MUSCLE - still only a handful of numbers
// ---------------------------------------------------------------------
//
// Liam's original constraint on the old base holds here: the only things
// that separate one man from another are how much muscle he has and what
// he is wearing. At the range you fight these men - down a corridor, for
// a second and a half - what reads is the width of the shoulders, the
// thickness of the middle and the height. Everything finer is texture.
//
// This deforms the BIND POSE, before skinning, so a heavy is a heavy in
// every frame of every animation rather than only while standing still.
const DEFAULT_BUILD = { height: 1.82, chest: 1, shoulder: 1, arm: 1, gut: 1, leg: 1 };

const geoCache = new Map();
function buildGeometry(build) {
  const b = Object.assign({}, DEFAULT_BUILD, build);
  const key = [b.height, b.chest, b.shoulder, b.arm, b.gut, b.leg]
    .map((v) => v.toFixed(2)).join('|');
  if (geoCache.has(key)) return geoCache.get(key);

  const N = ASSET.verts;
  const pos = new Float32Array(N * 3);
  const H = b.height;

  // =====================================================================
  // MUSCLE IS GIRTH, MEASURED PERPENDICULAR TO THE BONE
  // =====================================================================
  //
  // This used to scale world X and Z by bands of height: `x *= k` for the
  // chest, then `if (|x| > shX * 1.3) x *= arm` for the arms. On the old
  // A-POSED model that was fine, because every limb ran roughly vertically
  // and scaling X thickened it.
  //
  // Liam's reference character is T-POSED, and on a T-pose the arm runs
  // along X - so "thicken the arm" scaled its LENGTH. A brawler
  // (shoulder 1.30, arm 1.22) came out with arms 59% too long, hanging to
  // the floor and crossing over each other, and it looked exactly like a
  // broken skeleton. It was not: the bones and the skin weights were both
  // correct the whole time, and two separate investigations went looking
  // in the wrong place before this one.
  //
  // The pose-independent version: every vertex belongs to a bone, every
  // bone has a segment, so take the vertex's offset from its own bone's
  // axis and scale THAT. Along the bone, nothing moves. It means the same
  // build numbers give the same silhouette on any source model, whatever
  // pose it was modelled in.
  const SEGS = ASSET.segs;
  const GIRTH = {
    chest: b.chest, torso: b.chest, shoulder: b.shoulder, neck: 1, head: 1,
    upperarm: b.arm, forearm: b.arm, hand: 1,
    pelvis: b.gut, thigh: b.leg, calf: b.leg, foot: 1,
  };
  const va = [0, 0, 0], vb = [0, 0, 0];
  for (let i = 0; i < N; i++) {
    let x = ASSET.pos[i*3], y = ASSET.pos[i*3+1], z = ASSET.pos[i*3+2];
    const g = GIRTH[ASSET.region[i]] ?? 1;
    const seg = SEGS && SEGS[ASSET.si[i * ASSET.bonesPerVertex]];
    if (seg && Math.abs(g - 1) > 0.001) {
      const ax = seg.b[0] - seg.a[0], ay = seg.b[1] - seg.a[1], az = seg.b[2] - seg.a[2];
      const L2 = ax*ax + ay*ay + az*az;
      if (L2 > 1e-9) {
        let t = ((x - seg.a[0]) * ax + (y - seg.a[1]) * ay + (z - seg.a[2]) * az) / L2;
        t = Math.max(0, Math.min(1, t));
        const cx = seg.a[0] + ax * t, cy = seg.a[1] + ay * t, cz = seg.a[2] + az * t;
        x = cx + (x - cx) * g; y = cy + (y - cy) * g; z = cz + (z - cz) * g;
      }
    }
    // The one thing that IS a length: leg length, which is a real
    // proportion difference between two men and runs along Y on any
    // standing figure.
    if (y < LM.hipY) y = LM.hipY - (LM.hipY - y) * b.leg;
    pos[i*3] = x * H; pos[i*3+1] = y * H; pos[i*3+2] = z * H;
  }

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(ASSET.uv), 2));
  g.setAttribute('skinIndex', new THREE.BufferAttribute(new Uint16Array(ASSET.si), 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(new Float32Array(ASSET.sw), 4));
  // UNINDEXED, because the generated UV atlas cuts islands PER TRIANGLE -
  // the triangle on the front of the head and its neighbour on the back
  // need different UVs for the vertex they share, so they cannot share it.
  g.computeVertexNormals();
  g.computeBoundingSphere();
  geoCache.set(key, g);
  return g;
}

// ---------------------------------------------------------------------
// THE BODY
// ---------------------------------------------------------------------
export function buildBody(build, material) {
  const b = Object.assign({}, DEFAULT_BUILD, build);
  const geo = buildGeometry(b);
  const H = b.height;

  // ---- bones, in metres, as a tree ---------------------------------
  const bones = ASSET.bones.map((d) => {
    const bone = new THREE.Bone();
    bone.name = d.name;
    return bone;
  });
  ASSET.bones.forEach((d, i) => {
    const p = d.pos;
    if (d.parent === null) { bones[i].position.set(p[0]*H, p[1]*H, p[2]*H); }
    else {
      const q = P[d.parent];
      bones[i].position.set((p[0]-q[0])*H, (p[1]-q[1])*H, (p[2]-q[2])*H);
      bones[IDX.get(d.parent)].add(bones[i]);
    }
  });
  const root = bones[0];

  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(root);
  // BIND AFTER THE WORLD MATRICES EXIST. Skeleton takes its inverse bind
  // matrices from wherever the bones currently ARE, so binding before the
  // hierarchy has been updated captures a pile of identities and the mesh
  // collapses to a point at the origin the first time anything moves.
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  mesh.bind(skeleton);
  // The body is animated every frame anyway, and it is one metre wide in
  // a corridor - culling it costs more than it saves and gets it wrong at
  // the edges of the screen, where a man is most worth seeing.
  mesh.frustumCulled = false;

  const by = {};
  for (const bone of bones) by[bone.name] = bone;
  const rootBind = root.position.clone();

  // ---- where things get held ----------------------------------------
  //
  // A GRIP IS A CHILD OF THE HAND. The old code drew the enemy's weapon
  // at a fixed offset from the body mesh, which meant it hung in the air
  // beside him and stayed there while he moved - one of the things that
  // made these men read as cardboard. Parent it to the wrist and it goes
  // where the hand goes, for nothing, forever.
  const grip = new THREE.Group();
  grip.position.set(0, -0.055 * H, -0.015 * H);
  grip.rotation.set(-Math.PI / 2, 0, 0);
  by.wristR.add(grip);
  const gripL = new THREE.Group();
  gripL.position.set(0, -0.055 * H, -0.015 * H);
  by.wristL.add(gripL);

  return { mesh, bones, by, root, rootBind, skeleton, grip, gripL, height: H, build: b };
}

// ---------------------------------------------------------------------
// POSING
// ---------------------------------------------------------------------
//
// A pose is a plain object: bone name -> [x, y, z] euler, in radians,
// added on top of REST. Nothing here is a keyframe format and nothing is
// loaded from a file - the whole animation library in anim.js is code,
// which for a game with this few bones is both smaller and far easier to
// tune than data would be.
// The one non-rotation channel: `offset` moves the root, in metres, which
// is what a crouch, a walk's vertical bob and a body dropping to the floor
// all are. Everything else in a pose is angles.
export function blankPose() { return { offset: [0, 0, 0] }; }

export function addPose(dst, src, w = 1) {
  if (w === 0) return dst;
  for (const k in src) {
    const v = src[k];
    const d = dst[k] || (dst[k] = [0, 0, 0]);
    d[0] += v[0] * w; d[1] += v[1] * w; d[2] += v[2] * w;
  }
  return dst;
}

// ---------------------------------------------------------------------
// POSE TIMES REST, AS QUATERNIONS. Not pose PLUS rest, as angles.
// ---------------------------------------------------------------------
//
// The rest correction and the animation used to be added component by
// component, and that worked for exactly as long as the rest correction
// was small: the old A-posed model needed 34 degrees at the shoulder, and
// at 34 degrees adding eulers is near enough to composing them that
// nothing showed.
//
// Liam's reference character is T-POSED. Its rest correction is 92
// degrees, and adding 92 degrees of Z to a pose's X and Y does not
// compose - euler addition is not rotation composition, and the further
// you get from zero the more violently it diverges. Every arm in the game
// swung out into a plank across the body the moment a hold pose was
// applied on top.
//
// The semantics are: REST maps the BIND pose to the NEUTRAL pose (arms
// down, legs straight), and every animation is authored against NEUTRAL.
// So the bone's local rotation is the pose applied AFTER the rest:
//
//     L = P * REST
//
// which is one quaternion multiply and is correct at any angle.
const _qp = new THREE.Quaternion(), _qr = new THREE.Quaternion();
const _e = new THREE.Euler();
const RESTQ = {};
for (const k in REST) {
  _e.set(REST[k][0], REST[k][1], REST[k][2], 'XYZ');
  RESTQ[k] = new THREE.Quaternion().setFromEuler(_e);
}

/** push a pose onto the bones, smoothed toward it so nothing snaps */
export function applyPose(body, pose, smooth = 1) {
  for (const bone of body.bones) {
    const p = pose[bone.name];
    _e.set(p ? p[0] : 0, p ? p[1] : 0, p ? p[2] : 0, 'XYZ');
    _qp.setFromEuler(_e);
    const r = RESTQ[bone.name];
    if (r) _qp.multiply(r);
    if (smooth >= 1) bone.quaternion.copy(_qp);
    else bone.quaternion.slerp(_qp, smooth);
  }
  const o = pose.offset;
  if (o) {
    const t = body.rootBind;
    body.root.position.set(t.x + o[0], t.y + o[1], t.z + o[2]);
  }
}
