// =====================================================================
// HIGHRISE :: hands.js - ARMS, HANDS, AND WHAT THEY DO
// =====================================================================
//
// Liam: *"fix player hands to not just be blocks they don't rotate with
// the player as they look around"*.
//
// Two complaints, and both were fair.
//
// THEY WERE BLOCKS. A hand was one box with a smaller box stuck on the
// side for a thumb. At a 78-degree field of view, thirty centimetres
// from the lens, that is the most closely examined geometry in the whole
// game and it was the crudest. A hand now has a palm, four fingers of
// two segments each and an opposed thumb - about twenty boxes - and it
// GRIPS: the fingers wrap whatever is in them, and the index finger
// pulls the trigger when you fire.
//
// THEY DID NOT MOVE WITH THE VIEW. They were welded to the camera and
// the aim sway was clamped to plus or minus six hundredths, so whipping
// the mouse round moved them by nothing at all and the whole view read
// as a cardboard cut-out with a gun painted on it. There is now a real
// inertia group: the arms lag the camera on a spring, overshoot, and
// settle. That is the single change that makes a fast turn feel like
// turning your body rather than panning a camera.
//
// The arms themselves stay two-bone IK chains solved to a HAND TARGET,
// because the cheap way - animating the whole weapon as one rigid object
// - never looks right. What a reload IS is the left hand leaving the
// foregrip, going to the belt, coming back with a magazine and seating
// it. The hand does the acting; the gun barely moves.
import * as THREE from '../vendor/three.module.js';
import { T, surf } from './tex.js';
import { weaponMesh, muzzleOf, GUNS } from './guns.js';
import { loadWeapon } from './fparms.js';
import { HandRig } from './handrig.js';

const L1 = 0.31, L2 = 0.33;                 // upper arm, forearm
const V = (x, y, z) => new THREE.Vector3(x, y, z);

// =====================================================================
// WHICH GUNS HAVE A REAL RIG, AND WHICH KEEP THE BOXES
// =====================================================================
//
// Liam: *"use the new gun models I gave you"* and *"use your own made
// hand animations for the hands not the ones they give"*.
//
// The RetroWeaponPack ships four sets of arms-with-weapon - proper
// skinned meshes with five fingers each - and those four cover every
// FIREARM in the game. src/handrig.js poses them; the pack's own clips
// are never played.
//
// Everything ELSE - fists, machete, bat, fire axe, extinguisher - has no
// counterpart in the pack, and keeps the hand-built arms below. That is
// not a stopgap: the melee weapons are where the blood-on-the-blade work
// lives, and it is written against those meshes.
//
// The flare gun borrows the pistol's arms and keeps OUR orange model, so
// it still reads as the flare gun at a glance.
// The MELEE weapons have no counterpart in the pack either, but the
// pack's ARMS are just arms - so they borrow the pistol's set and keep
// our own model in the hand. Liam: *"the machete doesn't match the
// detail level of the other guns and doesn't have the FPS arms the rest
// of the guns use"*. Fists stay on the hand-built arms, because a fist
// IS the hand and the pack's is wrapped round a grip.
const RIG_FOR = {
  glock: 'pistol', ak: 'rifle', shotgun: 'shotgun', flare: 'pistol',
  knife: 'pistol', bat: 'pistol', axe: 'pistol', ext: 'pistol',
  fists: 'pistol',
};
const RIG_KEEPS_OUR_MESH = { flare: true, knife: true, bat: true, axe: true, ext: true };
// [pitch, yaw, roll] in degrees, in the view's frame: how a blade is
// carried so you can SEE it. Down -Z it is edge-on and invisible.
const MELEE_ANGLE = {
  knife: [10, -34, -8],
  bat:   [16, -22, 0],
  axe:   [12, -30, -6],
  ext:   [6, -18, 0],
};

// ---------------------------------------------------------------------
// TWO-BONE IK
// ---------------------------------------------------------------------
//
// Shoulder fixed, hand at the target, elbow wherever the triangle puts
// it - pushed toward `pole` so it bends the way an elbow bends instead of
// folding inside out, which is the one thing that instantly reads broken.
function solve(shoulder, target, pole, l1 = L1, l2 = L2) {
  const d = new THREE.Vector3().subVectors(target, shoulder);
  let len = d.length();
  const max = (l1 + l2) * 0.999;
  if (len > max) { d.multiplyScalar(max / len); len = max; }
  if (len < 1e-4) return { elbow: shoulder.clone(), hand: target.clone() };
  const dir = d.clone().normalize();
  const a = (l1*l1 - l2*l2 + len*len) / (2 * len);
  const h = Math.sqrt(Math.max(0, l1*l1 - a*a));
  const side = new THREE.Vector3().subVectors(pole, shoulder);
  side.sub(dir.clone().multiplyScalar(side.dot(dir)));
  if (side.lengthSq() < 1e-6) side.set(0, -1, 0);
  side.normalize();
  return { elbow: shoulder.clone().addScaledVector(dir, a).addScaledVector(side, h),
           hand: shoulder.clone().add(d) };
}

/**
 * THE FOREARM, which is the biggest thing on screen in this game.
 *
 * Liam: *"the hands you have right now are still basically cubes"*, with
 * a screenshot of a plain orange slab filling a third of the frame.
 *
 * It was `new THREE.BoxGeometry(thick, thick, 1)` - a square-section bar
 * of constant thickness from elbow to knuckle, in a flesh tone that was
 * being drawn with the painted-steel texture. Four hard edges catching
 * four different shades, and no taper anywhere.
 *
 * An arm is an eight-sided tube that is thicker at the elbow than at the
 * wrist, and it is flattened top to bottom rather than round. Eight sides
 * costs 32 triangles - nothing - and the silhouette stops being a plank.
 * Compare the reference: even at its polygon budget the rebel's forearm
 * narrows into the glove.
 */
function limb(mat, thick) {
  const g = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
  const p = g.attributes.position;
  const wrist = thick * 0.78, elbow = thick * 1.24;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5;                    // 0 at the wrist end
    const rad = wrist + (elbow - wrist) * (1 - t);
    p.setX(i, p.getX(i) * rad);
    p.setZ(i, p.getZ(i) * rad * 0.74);            // flattened, not round
    p.setY(i, p.getY(i));
  }
  p.needsUpdate = true;
  // the cylinder runs along Y; the arm runs along Z
  g.rotateX(Math.PI / 2);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

/** A rolled sleeve cuff, so the arm does not end in a cut face. */
function sleeveCuff(mat, thick, z) {
  const g = new THREE.CylinderGeometry(thick * 1.30, thick * 1.16, thick * 0.85, 8, 1);
  g.rotateX(Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.78);
  p.needsUpdate = true;
  g.translate(0, 0, z);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

let FLASHTEX = null;
function flashTexture() {
  if (FLASHTEX) return FLASHTEX;
  const S = 128, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d'), m = S / 2;
  const g = x.createRadialGradient(m, m, 0, m, m, S * 0.28);
  g.addColorStop(0, 'rgba(255,255,246,1)');
  g.addColorStop(0.4, 'rgba(255,226,145,0.9)');
  g.addColorStop(1, 'rgba(255,150,40,0)');
  x.fillStyle = g; x.beginPath(); x.arc(m, m, S * 0.28, 0, 7); x.fill();
  x.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4, len = S * (0.20 + (i % 3) * 0.13), w = S * 0.028;
    x.save(); x.translate(m, m); x.rotate(a);
    const gg = x.createLinearGradient(0, 0, len, 0);
    gg.addColorStop(0, 'rgba(255,240,190,0.95)');
    gg.addColorStop(1, 'rgba(255,140,30,0)');
    x.fillStyle = gg;
    x.beginPath(); x.moveTo(0, -w); x.lineTo(len, 0); x.lineTo(0, w); x.closePath(); x.fill();
    x.restore();
  }
  FLASHTEX = new THREE.CanvasTexture(c);
  FLASHTEX.colorSpace = THREE.SRGBColorSpace;
  return FLASHTEX;
}

// POINT IT WITHOUT lookAt().
//
// Object3D.lookAt() takes a WORLD-space target. Everything in this file
// is in the arm group's own space, several transforms below the camera -
// so feeding local coordinates to lookAt() silently orients every
// forearm and every hand by the camera's world rotation as well as its
// own. It was in the first version too and went unnoticed because the
// hand was a symmetrical box; the moment the hand had fingers and a gun
// in it, the weapon came out pointing over the player's shoulder.
//
// setFromUnitVectors builds the same rotation directly in the PARENT's
// frame, which is the frame these vectors are actually in.
const ZAXIS = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
function aim(obj, dirLocal) { obj.quaternion.setFromUnitVectors(ZAXIS, dirLocal); }

/** a local offset expressed in the weapon's own frame */
const _o = new THREE.Vector3();
function offset(q, x, y, z) { return _o.set(x, y, z).applyQuaternion(q).clone(); }

function stretch(mesh, from, to) {
  _d.subVectors(to, from);
  const len = _d.length() || 1e-4;
  mesh.position.copy(from).addScaledVector(_d, 0.5);
  mesh.scale.z = len;
  aim(mesh, _d.divideScalar(len));
}

// ---------------------------------------------------------------------
// A HAND
// ---------------------------------------------------------------------
//
// Built pointing +Z (out of the wrist), palm down, thumb inboard. Every
// finger is two segments on their own pivots, so `curl` is a real
// rotation rather than a swap between two models - which is what lets the
// index finger move on its own when the trigger goes.
/**
 * A finger bone: tapered, six-sided, pivoting at the near end.
 *
 * The old one was a cuboid. A stack of cuboids reads as a robot claw at
 * any distance, because the thing the eye uses to tell a finger from a
 * peg is that it gets thinner and its corners are soft.
 */
function box(mat, w, h, d, mesh, taper = 0.86) {
  const g = new THREE.CylinderGeometry(1, 1, d, 6, 1);
  g.rotateY(Math.PI / 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) / d) + 0.5;               // 0 near, 1 far
    const k = 1 + (taper - 1) * t;
    p.setX(i, p.getX(i) * w * 0.72 * k);
    p.setZ(i, p.getZ(i) * h * 0.72 * k);
  }
  p.needsUpdate = true;
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, d / 2);              // pivot at the near end, so it hinges
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  if (mesh) mesh.add(m);
  return m;
}

/** The palm: a wedge, wider at the knuckles and thinner at the wrist. */
function palmBlock(mat, w, h, d) {
  const g = new THREE.BoxGeometry(w, h, d);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getZ(i) / d) + 0.5;                // 0 wrist, 1 knuckles
    p.setX(i, p.getX(i) * (0.86 + 0.20 * t));
    p.setY(i, p.getY(i) * (1.06 - 0.22 * t));
    // and roll the outer edge over, so the silhouette is not a corner
    if (Math.abs(p.getX(i)) > w * 0.3) p.setY(i, p.getY(i) * 0.78);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.frustumCulled = false;
  return m;
}

class Hand {
  constructor(side, skinMat, gloveMat, glove) {
    const s = side === 'r' ? 1 : -1;
    const mat = glove ? gloveMat : skinMat;
    this.group = new THREE.Group();
    this.group.frustumCulled = false;

    // the palm, slightly wedge-shaped
    this.palm = palmBlock(mat, 0.072, 0.030, 0.082);
    this.palm.position.z = 0.041;
    this.palm.frustumCulled = false;
    this.group.add(this.palm);
    // the heel, so the wrist is not a flat cut
    const heel = palmBlock(mat, 0.060, 0.034, 0.030);
    heel.position.set(0, -0.001, 0.012);
    heel.frustumCulled = false;
    this.group.add(heel);

    // ---- four fingers ------------------------------------------------
    this.fingers = [];
    const LEN = [0.036, 0.040, 0.038, 0.031];       // index .. little
    for (let i = 0; i < 4; i++) {
      const root = new THREE.Group();
      root.position.set(s * (0.026 - i * 0.0175), -0.002, 0.080);
      this.group.add(root);
      const p = box(mat, 0.0155, 0.0165, LEN[i], root);
      const mid = new THREE.Group();
      mid.position.z = LEN[i];
      p.add(mid);
      const dst = box(mat, 0.0140, 0.0150, LEN[i] * 0.80, mid);
      // a knuckle line
      this.fingers.push({ root, mid, len: LEN[i], dst });
    }
    // ---- the thumb, opposed --------------------------------------------
    this.thumbRoot = new THREE.Group();
    this.thumbRoot.position.set(s * 0.034, -0.004, 0.030);
    this.thumbRoot.rotation.y = s * -0.85;
    this.thumbRoot.rotation.z = s * 0.35;
    this.group.add(this.thumbRoot);
    const tp = box(mat, 0.020, 0.020, 0.036, this.thumbRoot);
    this.thumbMid = new THREE.Group();
    this.thumbMid.position.z = 0.036;
    tp.add(this.thumbMid);
    box(mat, 0.017, 0.017, 0.028, this.thumbMid);

    this.curl = [0, 0, 0, 0];
    this.thumb = 0;
  }

  /** 0 = flat, 1 = closed fist. `trigger` moves the index finger alone. */
  setGrip(amount, thumb, trigger) {
    for (let i = 0; i < 4; i++) {
      const c = i === 0 && trigger !== undefined ? trigger : amount;
      // The two joints do not bend equally - the far one goes further,
      // which is the difference between a hand and a claw.
      this.fingers[i].root.rotation.x = -c * 1.35;
      this.fingers[i].mid.rotation.x = -c * 1.55;
    }
    this.thumbRoot.rotation.x = -thumb * 0.75;
    this.thumbMid.rotation.x = -thumb * 1.05;
  }
}

// ---------------------------------------------------------------------
// THE ANIMATIONS
// ---------------------------------------------------------------------
//
// Each is a list of keys: [t, rightHand, leftHand, gunOffset, gunRot].
// Positions are in view space - x right, y up, z back toward the eye. A
// reload is written the way you would describe one out loud.
// A WEAPON SITS LOW AND TO THE RIGHT. Centred it reads as a HUD sprite
// and it covers the one part of the screen you are aiming with.
const RIFLE_IDLE = { r: V(0.155, -0.210, -0.53), l: V(-0.030, -0.240, -0.71) };
const PISTOL_IDLE = { r: V(0.150, -0.200, -0.57), l: V(0.020, -0.235, -0.59) };
const FIST_IDLE = { r: V(0.200, -0.180, -0.46), l: V(-0.175, -0.205, -0.49) };

export const ANIMS = {
  reloadMag: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.14, V(0.15, -0.24, -0.34), V(-0.06, -0.30, -0.36), V(0.02, -0.03, 0.03), V(0.10, -0.35, 0.28)],
    [0.34, V(0.15, -0.25, -0.33), V(-0.10, -0.52, -0.24), V(0.02, -0.04, 0.03), V(0.12, -0.38, 0.30)],
    [0.58, V(0.15, -0.25, -0.33), V(-0.05, -0.33, -0.35), V(0.02, -0.04, 0.03), V(0.12, -0.38, 0.30)],
    [0.68, V(0.15, -0.23, -0.34), V(-0.04, -0.28, -0.37), V(0.02, -0.02, 0.02), V(0.08, -0.30, 0.24)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
  reloadShell: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.30, V(0.16, -0.26, -0.32), V(-0.08, -0.44, -0.26), V(0.01, -0.03, 0.02), V(0.18, -0.20, 0.16)],
    [0.62, V(0.16, -0.26, -0.32), V(-0.02, -0.29, -0.30), V(0.01, -0.03, 0.02), V(0.18, -0.20, 0.16)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
  pump: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.40, idle.r, V(-0.12, -0.24, -0.40), V(0, -0.01, 0.03), V(-0.06, 0, 0)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
  // a big committed arc, for the bat and the axe
  swing: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.22, V(0.38, 0.10, -0.20), V(0.14, -0.02, -0.28), V(0.06, 0.10, 0.10), V(-0.6, 1.0, -0.5)],
    [0.52, V(-0.20, -0.38, -0.66), V(-0.24, -0.32, -0.60), V(-0.10, -0.10, -0.16), V(0.8, -0.8, 0.6)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
  // ---- HAND TO HAND -------------------------------------------------
  //
  // A punch in first person is mostly the hand getting BIG and then gone.
  // It has to leave frame at the far end or it reads as a poke, and it
  // has to come from off to the side or it reads as a zoom.
  punchR: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.20, V(0.30, -0.30, -0.30), V(-0.16, -0.16, -0.40), V(0, 0, 0), V(0, 0, 0)],
    [0.46, V(0.04, -0.10, -0.94), V(-0.20, -0.18, -0.38), V(0, 0, 0), V(0, 0, 0)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
  punchL: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.20, V(0.16, -0.16, -0.40), V(-0.30, -0.30, -0.30), V(0, 0, 0), V(0, 0, 0)],
    [0.46, V(0.20, -0.18, -0.38), V(-0.04, -0.10, -0.94), V(0, 0, 0), V(0, 0, 0)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
  // the finisher: short, across, and it comes from underneath
  elbow: (idle) => [
    [0.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
    [0.18, V(0.34, -0.34, -0.24), V(-0.18, -0.14, -0.42), V(0, 0, 0), V(0, 0, 0)],
    [0.44, V(-0.14, -0.02, -0.62), V(-0.20, -0.16, -0.40), V(0, 0, 0), V(0, 0, 0)],
    [1.00, idle.r, idle.l, V(0, 0, 0), V(0, 0, 0)],
  ],
};

function sample(keys, t) {
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] < t) i++;
  const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)];
  const span = Math.max(1e-4, b[0] - a[0]);
  let k = Math.min(1, Math.max(0, (t - a[0]) / span));
  k = k * k * (3 - 2 * k);
  const lerp = (u, v) => u.clone().lerp(v, k);
  return { r: lerp(a[1], b[1]), l: lerp(a[2], b[2]),
           go: lerp(a[3], b[3]), gr: lerp(a[4], b[4]) };
}

// ---------------------------------------------------------------------
export class Hands {
  constructor(camera) {
    // ---- THE INERTIA GROUP --------------------------------------------
    //
    // Everything hangs off this rather than off the camera directly, and
    // it lags the camera on a spring. This is the fix for "they don't
    // rotate with the player as they look around": they always DID rotate
    // with it, exactly, instantly, rigidly - which is why they read as
    // painted on. Arms are heavy and a body turns after a head does.
    this.lag = new THREE.Group();
    this.group = new THREE.Group();
    this.group.renderOrder = 10;
    this.lag.add(this.group);
    this.swing = new THREE.Vector2();      // current lag angle
    this.swingV = new THREE.Vector2();     // and its velocity

    // =====================================================================
    // THE VIEW MODEL GETS ITS OWN CAMERA, AND ITS OWN FIELD OF VIEW.
    // =====================================================================
    //
    // The world is drawn at 78 degrees, which is right for a corridor and
    // catastrophic for anything thirty centimetres from the lens. At that
    // distance a real seven-centimetre forearm covers a quarter of the
    // screen and tapers like a doorstop - which is exactly what the first
    // build looked like, and no amount of moving the shoulder fixes it,
    // because the number that is wrong is the field of view.
    //
    // So the arms live in their own scene, drawn in a second pass at 68
    // degrees over a cleared depth buffer. Not much narrower than the world
    // - the gap IS the magnification, and 55 made the pistol half a screen
    // wide. This is what every shooter
    // does and it buys two things at once: the arms are the right size,
    // AND they can never clip through a doorframe, because they are not
    // in the same depth buffer as the doorframe.
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(68, 1, 0.01, 8);
    this.scene.add(this.lag);
    this.scene.add(new THREE.HemisphereLight(0xdce6f2, 0x4a4038, 2.0));
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffeedd, 1.15);
    key.position.set(0.5, 0.9, 0.6);
    this.scene.add(key);
    this.worldCam = camera;

    // and the flash is drawn HERE, at the drawn barrel, not out in the
    // world - the two cameras disagree about where that is, and a flash
    // that does not sit on the muzzle is worse than none.
    this.flash = new THREE.Sprite(new THREE.SpriteMaterial({
      map: flashTexture(), transparent: true, depthWrite: false,
      depthTest: false, blending: THREE.AdditiveBlending }));
    this.flash.visible = false;
    this.flash.renderOrder = 20;
    this.scene.add(this.flash);
    this.flashT = 0;

    const skin = surf(T.skin('#b98a63'), [1, 1]);
    const sleeve = surf(T.carpet('#22262c'), [1, 1]);
    const glove = surf(T.rubber('#2b2f36'), [1, 1]);
    this.arms = {};
    for (const side of ['r', 'l']) {
      // THE UPPER ARM IS NEVER DRAWN. Its far end is the shoulder, which
      // sits beside the lens, so it renders as a plank across the bottom
      // of the screen however thin it is - the elbow is simply too close
      // to a 78-degree camera. Every shooter of this era drew a forearm
      // and a hand and nothing else, for exactly this reason.
      const fore = limb(skin, 0.068);
      // A 10 cm CUBE was the sleeve. It is the second thing in Liam's
      // screenshot after the forearm, and it is the join between the arm
      // and the rest of the player - so it has to be a rolled band round
      // the arm, not a block threaded onto it.
      const cuff = sleeveCuff(sleeve, 0.068, 0);
      const hand = new Hand(side, skin, glove, true);
      this.group.add(fore, cuff, hand.group);
      this.arms[side] = { fore, cuff, hand };
    }
    for (const m of this.group.children) if (m.material) m.material.depthTest = true;

    // THE WEAPON IS A CHILD OF THE RIGHT HAND. Not drawn at the hand's
    // target and hoped over - which is what the first version did, and
    // with the shoulders at real positions that target was 95 cm away on
    // a 66 cm arm, so the IK clamped, the weapon floated in mid-air and
    // both hands sat behind it out of frame.
    this.gunHolder = new THREE.Group();
    this.group.add(this.gunHolder);

    // Blood that goes ON the weapon and stays there. See Gore, below.
    this.gore = new Gore(this.scene);

    this.anim = null; this.animT = 0; this.animDur = 1;
    this.kick = 0; this.kickV = 0;
    this.sway = new THREE.Vector2();
    this.trigger = 0;
    this.idle = PISTOL_IDLE;

    // the pack's rigs, one per weapon family, built on first use
    this.rigs = new Map();
    this.rig = null;
    this.rigWant = undefined;
    this.rigW = { hold: 1, low: 0, aim: 0, reload: 0, sprint: 0, shove: 0 };
    this.sinceFire = 99;

    this.setWeapon('glock');
  }

  /**
   * Swap in the pack's arms for this weapon, or put the hand-built ones
   * back. Rigs are cached by pack id and never rebuilt: a HandRig
   * reparents the loaded GLB's scene into itself, so two rigs for one
   * weapon would fight over the same meshes.
   */
  useRig(id) {
    const want = RIG_FOR[id] || null;
    if (this.rigWant === want) {
      // SAME ARMS, DIFFERENT WEAPON. Liam: *"the machete does not work
      // and is not visibly equipped until after the player uses their
      // fists"*.
      //
      // The glock, the flare gun and all four melee weapons share the
      // pistol's arms, so switching between any two of them left
      // `rigWant` unchanged and this returned early - without ever
      // swapping the thing IN the hands. You got the pistol's arms
      // holding the pistol, whatever you had selected. Going via fists
      // cleared `rigWant`, which is why it started working the moment
      // you punched something: the long path ran and attached the model.
      this.attachOurMesh(id);
      this.applyRigVisibility();
      return;
    }
    this.rigWant = want;
    if (!want) { this.rig = null; this.applyRigVisibility(); return; }

    const have = this.rigs.get(want);
    if (have) { this.rig = have; this.attachOurMesh(id); this.applyRigVisibility(); return; }

    this.rig = null;
    this.applyRigVisibility();
    loadWeapon(want).then((gl) => {
      if (this.rigs.has(want)) return;             // two swaps raced
      const rig = new HandRig(want, gl);
      rig.root.renderOrder = 10;
      this.rigs.set(want, rig);
      this.group.add(rig.root);
      if (this.rigWant === want) {
        this.rig = rig;
        this.attachOurMesh(this.id);
        this.applyRigVisibility();
      }
    }).catch((e) => console.warn('hand rig ' + want + ': ' + e.message));
  }

  /** the flare gun keeps our model in the pack's hands */
  attachOurMesh(id) {
    if (!this.rig) return;
    const bare = (GUNS[id] || {}).unarmed;
    this.rig.setBare(!!bare);
    if (bare) { /* nothing in them */ }
    else if (RIG_KEEPS_OUR_MESH[id]) this.rig.attachCustom(weaponMesh(id), MELEE_ANGLE[id] || null);
    else this.rig.clearCustom();
    // a blade is carried further out and lower than a pistol
    const G = GUNS[id] || {};
    if (G.melee) this.rig.setFrame(0.02, -0.06, -0.13);
    else this.rig.setFrame(0, 0, 0);
  }

  /** exactly one set of arms is drawn, ever */
  applyRigVisibility() {
    const on = !!this.rig;
    for (const side of ['r', 'l']) {
      const a = this.arms[side];
      if (!a) continue;
      a.fore.visible = !on; a.cuff.visible = !on; a.hand.group.visible = !on;
    }
    this.gunHolder.visible = !on && !this.fists;
    for (const [k, r] of this.rigs) r.root.visible = on && r === this.rig;
  }

  setWeapon(id) {
    this.gunHolder.clear();
    this.id = id;
    const G = GUNS[id] || GUNS.fists;
    this.fists = !!G.unarmed;
    if (!this.fists) {
      // SEATING IT IN THE PALM, one obvious step at a time.
      //
      // The hand's +Z is out of the wrist and it has a palm roll on it;
      // the weapon's -Z is its barrel and its origin is its grip. Getting
      // from one to the other in a single Euler triple is where the first
      // attempt went wrong - it ended up pointing the barrel at the
      // floor, which put the whole gun out of frame and read as "there is
      // no weapon". Two nested groups, each doing one thing, cannot be
      // got wrong and can be read six months from now.
      const vm = weaponMesh(id);
      this.gunHolder.add(vm);
      this.gunMesh = vm;
      this.muzzleLocal = muzzleOf(id);
    }
    this.idle = this.fists ? FIST_IDLE
      : G.melee ? { r: V(0.16, -0.22, -0.36), l: V(0.02, -0.30, -0.30) }
      : (id === 'glock' ? PISTOL_IDLE : RIFLE_IDLE);
    this.two = !G.melee && id !== 'glock';
    this.anim = null;
    this.useRig(id);
  }

  play(name, dur) {
    // THE RIG HAS ITS OWN RELOAD, and it is a sequence rather than a
    // pose - see handrig.reload(). The box arms keep the keyframe track
    // below; the two never both run, because only one set of arms is
    // ever drawn.
    if (this.rig && (name === 'reloadMag' || name === 'reloadShell'))
      this.rig.reload(dur, name === 'reloadShell');
    // AND ITS OWN SWING. Liam: *"the machete does not have an
    // animation"*. It did not: the melee weapons borrowed the pistol's
    // arms and then nothing moved them, so a kill was a blade standing
    // still while a man fell over in front of it. A punch is the same
    // motion, shorter.
    if (this.rig && (name === 'swing' || name === 'punchR'
                  || name === 'punchL' || name === 'elbow'))
      this.rig.swing(dur * (name === 'swing' ? 1 : 0.78));
    const build = ANIMS[name];
    if (!build) return;
    this.anim = build(this.idle);
    this.animT = 0;
    this.animDur = Math.max(0.05, dur);
    if (name === 'punchR' || name === 'punchL' || name === 'elbow') this.punchAnim = name;
  }

  punch(amount) { this.kickV -= amount; this.trigger = 1; this.fire(); }

  /**
   * A melee blow landed on a body. Mark whatever did it.
   *
   * Liam: *"make blood get on the players blade or mellee weapon
   * including fists"* - so the fists count, and they get it on the
   * knuckles rather than over the whole hand.
   *
   * `heavy` is for a killing blow or a dismemberment, which throws far
   * more of it.
   */
  bloodied(heavy = false) {
    const n = heavy ? 5 + ((Math.random() * 4) | 0) : 2 + ((Math.random() * 2) | 0);
    if (this.fists || !this.gunMesh) {
      // the knuckles of both hands, and a little up the forearm
      for (const side of ['r', 'l']) {
        const arm = this.arms[side];
        if (!arm) continue;
        this.gore.splash(arm.hand.palm, Math.ceil(n / 2),
          { x: 0.06, y: 0.02, z: 0.06, s: 0.045 });
        if (heavy) this.gore.splash(arm.fore, 1, { x: 0.05, y: 0.05, z: 0.16, s: 0.05 });
      }
      return;
    }
    // a blade or a bat: along the business end, which is forward of the grip
    const g = this.gunMesh;
    if (!g.userData._span) {
      const bb = new THREE.Box3().setFromObject(g), sz = new THREE.Vector3();
      bb.getSize(sz);
      g.userData._span = { x: sz.x * 0.7, y: sz.y * 0.7, z: sz.z * 0.75,
                           s: Math.max(0.03, Math.min(sz.x, sz.y) * 1.4) };
    }
    this.gore.splash(g, n, g.userData._span);
  }

  /** Wipe the current weapon down - used when the run restarts. */
  wipeBlood() { this.gore.clear(); }

  /** the flash, on the drawn barrel, in the view model's own scene */
  fire() {
    if (this.fists) return;
    this.sinceFire = 0;
    this.flash.position.copy(this.muzzleView());
    this.flash.material.rotation = Math.random() * 6.283;
    this.flash.scale.setScalar(0.16 + Math.random() * 0.10);
    this.flash.visible = true;
    this.flashT = 0.05;
  }

  /** where the barrel ends, in the view model's own space */
  muzzleView() {
    const out = new THREE.Vector3();
    // the rig knows: it measured the point on its own bore at load, and
    // it is parented to the weapon, so it swings and kicks with it
    if (this.rig) return this.rig.muzzlePoint(out);
    if (this.fists || !this.gunMesh) {
      this.group.updateWorldMatrix(true, false);
      return out.set(0, -0.15, -0.55).applyMatrix4(this.group.matrixWorld);
    }
    this.gunMesh.updateWorldMatrix(true, false);
    return out.copy(this.muzzleLocal).applyMatrix4(this.gunMesh.matrixWorld);
  }

  /**
   * The same point in the WORLD, for the light, the smoke and the brass -
   * those belong in the room, not on the glass. The two cameras disagree
   * about exactly where the barrel is, and this is the seam: it is
   * approximate on purpose, because being a couple of centimetres out on
   * a point light is invisible and chasing it is not worth a third pass.
   */
  muzzleWorld() {
    const v = this.muzzleView();
    return this.worldCam.localToWorld(v);
  }

  /** second pass: over the world, depth cleared, at its own field of view */
  render(renderer, aspect) {
    this.cam.aspect = aspect;
    this.cam.updateProjectionMatrix();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
    renderer.autoClear = auto;
  }

  /**
   * Drive the pack's rig from what the game already knows.
   *
   * The pose weights are SMOOTHED here rather than set hard, because a
   * pose table that snaps between states is the thing that makes hand
   * animation read as a slideshow. Everything else the rig needs -
   * recoil, trigger, breathing, walk bob - it does itself off the same
   * spring values the box arms use.
   */
  driveRig(dt, st) {
    const rig = this.rig;
    if (!rig) return;
    this.sinceFire += dt;

    const sprint = st.sprint ? 1 : 0;
    // the rig runs its own reload clock, so this is only used to keep
    // the OTHER poses out of the way while one is going
    const reloading = rig.reloadT != null ? 1 : 0;
    const shoving = this.punchAnim ? 1 : 0;
    const fisted = this.fists ? 1 : 0;
    // LOW is the resting state, not HOLD: a man who has not fired for a
    // few seconds lets the muzzle down. Coming back up is what firing
    // looks like before the shot lands.
    const idle = (!sprint && !reloading && !shoving && this.sinceFire > 2.4) ? 1 : 0;
    const want = {
      hold: (1 - fisted) * (1 - sprint) * (1 - reloading) * (1 - shoving) * (1 - idle),
      guard: fisted * (1 - shoving) * (1 - sprint),
      low: idle * (1 - reloading) * (1 - fisted), aim: 0, reload: 0,
      sprint: sprint * (1 - reloading) * (1 - fisted), shove: shoving * (1 - reloading),
    };
    const k = Math.min(1, dt * 9);
    for (const n in want) this.rigW[n] += (want[n] - this.rigW[n]) * k;

    rig.setPose(this.rigW);
    // empty hands are CLOSED hands
    rig.gripR = fisted; rig.gripL = fisted;
    rig.recoil = Math.max(0, -this.kick);
    rig.trigger = this.trigger;
    // a pump gun cycles on the same spring the shoulder does
    rig.pump = (GUNS[this.id] || {}).shellByShell ? Math.min(1, Math.max(0, -this.kick) * 1.8) : 0;
    // openL is the rig's during a reload - it opens as the hand leaves
    // the gun and closes on the magazine
    rig.update(dt, { aim: this.rigW.aim, speed: st.speed || 0 });
  }

  update(dt, st) {
    this.gore.step(dt);
    // ---- recoil, as a spring -------------------------------------------
    this.kickV += -this.kick * 190 * dt - this.kickV * 13 * dt;
    this.kick += this.kickV * dt;
    this.trigger = Math.max(0, this.trigger - dt * 7);
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.flash.visible = false; }

    // ---- THE LAG -------------------------------------------------------
    //
    // A second-order spring, not a lerp. A lerp catches up and stops; a
    // spring overshoots and settles, and the overshoot is the part your
    // eye reads as weight. Damped just under critical, so a fast flick
    // whips and comes back rather than wobbling.
    const kx = -st.dx * 2.2, ky = -st.dy * 1.6;
    this.swingV.x += (kx - this.swing.x) * 260 * dt - this.swingV.x * 19 * dt;
    this.swingV.y += (ky - this.swing.y) * 260 * dt - this.swingV.y * 19 * dt;
    this.swing.x += this.swingV.x * dt;
    this.swing.y += this.swingV.y * dt;
    const cl = (v, m) => Math.max(-m, Math.min(m, v));
    this.lag.rotation.y = cl(this.swing.x, 0.30);
    this.lag.rotation.x = cl(this.swing.y, 0.22);
    this.lag.rotation.z = cl(-this.swing.x * 0.45, 0.16);
    this.lag.position.x = cl(this.swing.x * 0.06, 0.05);
    this.lag.position.y = cl(-this.swing.y * 0.05, 0.04);

    // ---- where the hands want to be --------------------------------------
    let r = this.idle.r.clone(), l = this.idle.l.clone();
    let go = new THREE.Vector3(), gr = new THREE.Vector3();
    if (this.anim) {
      this.animT += dt / this.animDur;
      if (this.animT >= 1) { this.anim = null; this.punchAnim = null; }
      else {
        const s = sample(this.anim, this.animT);
        r = s.r; l = s.l; go = s.go; gr = s.gr;
      }
    }

    // ---- what the body is doing ------------------------------------------
    const walk = Math.min(1, st.speed / 6);
    const b = st.bob;
    r.x += Math.sin(b) * 0.014 * walk;
    r.y += Math.abs(Math.cos(b)) * -0.024 * walk;
    l.x += Math.sin(b) * 0.016 * walk;
    l.y += Math.abs(Math.cos(b)) * -0.026 * walk;

    const sprint = st.sprint ? 1 : 0;
    this.sprintK = (this.sprintK || 0) + (sprint - (this.sprintK || 0)) * Math.min(1, dt * 8);
    const sk = this.sprintK;
    r.y -= sk * 0.09; r.x += sk * 0.05; r.z += sk * 0.06;
    l.y -= sk * 0.11; l.x += sk * 0.07; l.z += sk * 0.04;
    gr.x += sk * 0.55; gr.y += sk * 0.40;

    const low = st.stance === 'slide' ? 1 : (st.stance === 'crouch' ? 0.5 : 0);
    r.y -= low * 0.05; l.y -= low * 0.05; gr.x += low * 0.18;
    if (st.stance === 'slide') { gr.z -= 0.30; r.x += 0.04; r.y += 0.03; }

    // a little residual positional sway on top of the group's rotation
    this.sway.x += ((-st.dx * 0.9) - this.sway.x) * Math.min(1, dt * 9);
    this.sway.y += ((-st.dy * 0.9) - this.sway.y) * Math.min(1, dt * 9);
    const swx = cl(this.sway.x, 0.10), swy = cl(this.sway.y, 0.08);
    r.x += swx; l.x += swx; r.y += swy; l.y += swy;
    gr.y += swx * 1.4; gr.x += -swy * 1.4;

    r.z += this.kick * 0.09; l.z += this.kick * 0.07;
    gr.x += this.kick * 0.55;

    // =====================================================================
    // THE WEAPON LEADS. THE HANDS FOLLOW IT. THE ARMS FOLLOW THEM.
    // =====================================================================
    //
    // The first version had this exactly backwards: it solved the arms,
    // orientated the hand along the FOREARM, and hung the weapon off the
    // hand. That reads fine written down and is completely wrong, because
    // it means the barrel points wherever the arm happens to be reaching -
    // and with the hands converging inward toward the middle of the screen
    // the forearm runs up and across, so the gun came out aimed over the
    // player's shoulder at thirty degrees. No amount of tuning the
    // shoulder position fixes that; the dependency is the bug.
    //
    // A view model points FORWARD. That is the one thing about it that is
    // not negotiable, because it is the promise the crosshair makes. So
    // the weapon's orientation is authored directly (identity plus the
    // animation's rotation), the hands are placed ON it - right hand at
    // the grip, left at the foregrip - and the arms are then solved to
    // wherever those hands ended up. If an arm cannot reach, the arm
    // stretches; the gun does not move.
    const gunPos = r.clone().add(go);
    const gunQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(gr.x, gr.y, gr.z, 'XYZ'));
    this.gunHolder.position.copy(gunPos);
    this.gunHolder.quaternion.copy(gunQ);
    // AND NOT WHEN THE RIG IS DRAWING ONE.
    //
    // `applyRigVisibility` turns this off when a pack rig takes over, and
    // this line - which runs every frame - turned it straight back on, so
    // the player saw the rig's weapon AND the hand-built holder's weapon
    // at once: two guns floating in front of him. It got worse rather
    // than better when the holder started serving the pack's models too,
    // because then both of them were the same gun.
    this.gunHolder.visible = !this.fists && !this.rig;

    // A hand's +Z runs out of the wrist through the fingers; the weapon's
    // -Z is its barrel. Half a turn about Y lines the two up, and then the
    // palm is already facing down onto the grip and the thumb is already
    // on the correct side, which is why the model is built the way it is.
    const HALF = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
    const handQ = gunQ.clone().multiply(HALF);

    // how far up the weapon the support hand sits
    const fore = this.fists ? 0 : (this.two ? 0.22 : (GUNS[this.id].melee ? 0.10 : 0.055));
    const busyLeft = this.anim && !this.fists;      // a reload moves it off the gun

    const targets = {
      r: this.fists ? r : gunPos.clone().add(offset(gunQ, 0, 0.012, 0.050)),
      l: this.fists || busyLeft ? l : gunPos.clone().add(offset(gunQ, 0, -0.012, -fore)),
    };
    const SH_R = V(0.20, -0.30, 0.06), SH_L = V(-0.20, -0.30, 0.06);
    const poleR = V(0.85, -1.05, 0.18), poleL = V(-0.85, -1.05, 0.18);
    for (const side of ['r', 'l']) {
      const A = this.arms[side];
      const sh = side === 'r' ? SH_R : SH_L;
      const { elbow, hand } = solve(sh, targets[side], side === 'r' ? poleR : poleL);
      // ONLY THE OUTER PART OF THE FOREARM IS DRAWN. The inner part is the
      // bit nearest the lens, and a seven-centimetre arm seen from twenty
      // centimetres is a tapering slab across half the screen. Every
      // shooter of this era cut the arm off at about here, for this reason.
      const near = elbow.clone().lerp(hand, 0.40);
      stretch(A.fore, near, hand);
      A.hand.group.position.copy(hand);
      if (this.fists || busyLeft && side === 'l') {
        // nothing in it: point it where it is going
        aim(A.hand.group, new THREE.Vector3().subVectors(hand, elbow).normalize());
        A.hand.group.rotateZ(side === 'r' ? -0.35 : 0.35);
      } else {
        A.hand.group.quaternion.copy(handQ);
        A.hand.group.rotateZ(side === 'r' ? -0.28 : 0.28);
      }
      A.cuff.position.copy(near);
      A.cuff.quaternion.copy(A.fore.quaternion);
    }

    // ---- THE GRIP --------------------------------------------------------
    //
    // Fingers that never move are the reason a hand reads as a block even
    // when it has fingers modelled on it. They close round a grip, they
    // open when the hand leaves the weapon during a reload, they clench
    // into a fist when there is nothing in them, and the index finger
    // pulls on its own when you fire.
    const punching = !!this.punchAnim;
    const gripR = this.fists || punching ? 1 : 0.88;
    const gripL = this.fists || punching ? 1 : (this.two ? 0.82 : 0.72);
    const trig = this.fists ? 1 : Math.min(1, 0.55 + this.trigger * 0.45);
    // during a magazine change the left hand is not holding anything
    const reloading = this.anim && (this.animT > 0.12 && this.animT < 0.72)
                      && !punching && !this.fists;
    this.arms.r.hand.setGrip(gripR, this.fists || punching ? 1 : 0.55, trig);
    this.arms.l.hand.setGrip(reloading ? 0.35 : gripL, reloading ? 0.2 : 0.6);


    // ---- and the pack's rig, if this weapon has one ---------------------
    this.driveRig(dt, st);

    this.group.visible = !st.third;
  }
}

// ---------------------------------------------------------------------
// BLOOD ON THE WEAPON
// ---------------------------------------------------------------------
//
// Liam: *"make blood get on the players blade or mellee weapon including
// fists"*.
//
// The blood system (blood.js) marks the WORLD - floors, walls, the men
// themselves. None of it can reach the view model, because the view model
// is rendered in its own scene with its own camera on top of the frame:
// a decal placed in world space is simply in a different scene.
//
// So this is its own small pool of quads, parented to whatever is in the
// player's hands, in the view model's own space. It goes on the blade of
// a machete, the head of an axe, the knuckles of a fist - and it dries,
// slowly, rather than wiping instantly, because a weapon that stays
// marked between fights is most of the point.
class Gore {
  constructor(scene) {
    this.scene = scene;
    this.pool = [];
    this.free = [];
    this.tex = [0, 1, 2].map((i) => smearTexture(9137 + i * 613));
    this.geo = new THREE.PlaneGeometry(1, 1);
  }

  /**
   * Put `n` marks on `host`, spread over a box of `size` metres around
   * its origin. `wet` starts at 1 and falls; nothing is ever removed, it
   * just darkens and shrinks towards a stain.
   */
  splash(host, n, size, seedDir) {
    if (!host) return;
    for (let i = 0; i < n; i++) {
      let m = this.free.pop();
      if (!m) {
        m = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({
          transparent: true, depthWrite: false, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
        }));
        m.frustumCulled = false;
        this.pool.push(m);
      }
      m.material.map = this.tex[(Math.random() * this.tex.length) | 0];
      m.material.color.setHex(0xffffff);
      m.material.opacity = 0.92;
      m.material.needsUpdate = true;
      // ON the weapon, in its own space - so it swings with it, which is
      // the whole reason this is parented rather than placed.
      m.position.set(
        (Math.random() - 0.5) * size.x,
        (Math.random() - 0.5) * size.y,
        (Math.random() - 0.5) * size.z);
      m.rotation.set(Math.random() * 6.283, Math.random() * 6.283, Math.random() * 6.283);
      const s = size.s * (0.5 + Math.random() * 0.9);
      m.scale.set(s, s * (0.6 + Math.random() * 0.8), 1);
      m.visible = true;
      m.userData.wet = 1;
      host.add(m);
    }
  }

  /** Blood dries: it darkens, it does not disappear. */
  step(dt) {
    for (const m of this.pool) {
      if (!m.visible || m.userData.wet === undefined) continue;
      const w = m.userData.wet = Math.max(0, m.userData.wet - dt * 0.06);
      // fresh blood is bright and red, old blood is brown and flat
      const k = 0.35 + w * 0.65;
      m.material.color.setRGB(k, k * (0.42 + w * 0.1), k * (0.34 + w * 0.06));
      m.material.opacity = 0.55 + w * 0.37;
    }
  }

  /** Wipe everything - a new run, or a weapon swapped out and cleaned. */
  clear(host) {
    for (const m of this.pool) {
      if (host && m.parent !== host) continue;
      if (m.parent) m.parent.remove(m);
      m.visible = false;
      this.free.push(m);
    }
  }
}

// A SMEAR, not a splat. Blood on a blade runs along it and pools at the
// edge; the round splashes in blood.js are the shape of a drop landing on
// a floor, which is the wrong shape entirely for this.
// =====================================================================
// BLOOD ON A BLADE - what it actually looks like
// =====================================================================
//
// Liam: *"I want you to make blood textures for it"*. The old ones were
// five translucent red RECTANGLES with a stub under each and forty
// random dots, and at the distance a view model is held that is exactly
// what they read as: red rectangles.
//
// Blood on steel is four things, and they have to be four passes,
// because each is a different shape and a different tone:
//
//   THE WIPE      Blood that has been dragged along the blade by going
//                 through something. It is a long streak with a THICK
//                 leading edge and a thin tail - the ends are what say
//                 which way the blade moved, and the old version had no
//                 ends at all.
//   THE FEATHER   The wipe does not stop at a line. It breaks into
//                 fingers along its trailing edge, which is the single
//                 detail that stops a smear looking like a decal.
//   THE RUN       Gravity. A bead gathers at the low edge and runs, and
//                 a run has a HEAD - it is fatter where it stopped than
//                 where it started.
//   THE SPATTER   Thrown droplets, elongated in the direction they
//                 travelled, with a small satellite behind the big ones.
//
// Three tones throughout: arterial at the thin edges where it is one
// layer thick, near-black where it has pooled, and a brown that is what
// blood goes within a minute of leaving. `Gore.step` darkens the whole
// quad as it dries, so these are the WET values.
//
// Hard-edged everywhere, and drawn with fillRect rather than strokes -
// canvas antialiases a stroke whatever `imageSmoothingEnabled` says, and
// a soft-edged blood smear on a nearest-filtered 64-pixel sheet reads as
// a smudge on the lens. Same finding as HIGHRISE's scratch pass (R9).
const BLOOD_WET = 'rgba(158,14,11,';      // one layer thick
const BLOOD_DEEP = 'rgba(86,6,8,';        // pooled
const BLOOD_OLD = 'rgba(104,34,20,';      // already going brown

function smearTexture(seed) {
  const S = 64, c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.imageSmoothingEnabled = false;
  let s = seed >>> 0;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  const px = (X, Y, W2, H2, col, a) => {
    x.fillStyle = col + a.toFixed(2) + ')';
    x.fillRect(X | 0, Y | 0, Math.max(1, W2 | 0), Math.max(1, H2 | 0));
  };
  x.clearRect(0, 0, S, S);

  // ---- THE WIPE ------------------------------------------------------
  // Two or three streaks along one axis, each fat at the leading end and
  // tapering out. Everything else hangs off these.
  const along = rnd() < 0.5;                  // dragged across or down
  const n = 2 + ((rnd() * 2) | 0);
  const lanes = [];
  for (let i = 0; i < n; i++) {
    const lane = 6 + rnd() * (S - 20);
    const len = S * (0.45 + rnd() * 0.5);
    const start = rnd() * (S - len);
    const thick = 3 + rnd() * 7;
    lanes.push({ lane, len, start, thick });
    for (let k = 0; k < len; k++) {
      // fat at the head, gone at the tail
      const f = 1 - k / len;
      const w2 = Math.max(1, thick * (0.25 + f * 0.75));
      const a = 0.42 + f * 0.5;
      const col = f > 0.65 ? BLOOD_DEEP : f > 0.25 ? BLOOD_WET : BLOOD_OLD;
      if (along) px(start + k, lane - w2 / 2, 1, w2, col, a);
      else px(lane - w2 / 2, start + k, w2, 1, col, a);
    }
  }

  // ---- THE FEATHER ---------------------------------------------------
  // Fingers off the trailing edge of each wipe. Without these the streak
  // has two parallel sides and reads as tape.
  for (const L of lanes) {
    const fingers = 4 + ((rnd() * 6) | 0);
    for (let i = 0; i < fingers; i++) {
      const at = L.start + rnd() * L.len * 0.8;
      const out = 1 + rnd() * L.thick * 0.9;
      const side = rnd() < 0.5 ? -1 : 1;
      for (let k = 0; k < out; k++) {
        const a = 0.55 * (1 - k / out);
        if (a < 0.06) break;
        if (along) px(at + (rnd() * 3 | 0) - 1, L.lane + side * (L.thick / 2 + k), 1, 1, BLOOD_WET, a);
        else px(L.lane + side * (L.thick / 2 + k), at + (rnd() * 3 | 0) - 1, 1, 1, BLOOD_WET, a);
      }
    }
  }

  // ---- THE RUNS ------------------------------------------------------
  // Down the sheet, always: on a held blade this is gravity, and it is
  // the pass that tells you the blood is WET.
  for (let i = 0; i < 2 + ((rnd() * 3) | 0); i++) {
    const L = lanes[(rnd() * lanes.length) | 0];
    const rx = (along ? L.start + rnd() * L.len : L.lane) + ((rnd() * 5) | 0) - 2;
    const ry = along ? L.lane : L.start + rnd() * L.len;
    const drop = 4 + rnd() * 26;
    for (let k = 0; k < drop; k++) px(rx, ry + k, 1, 1, BLOOD_DEEP, 0.75 - k / drop * 0.4);
    // the head of the run, where it stopped and gathered
    px(rx - 1, ry + drop, 2, 2, BLOOD_DEEP, 0.9);
  }

  // ---- THE SPATTER ---------------------------------------------------
  // Thrown, so elongated the way it flew, with a satellite behind the
  // bigger ones - which is what a real droplet does when it lands.
  for (let i = 0; i < 26; i++) {
    const dx = (rnd() * S) | 0, dy = (rnd() * S) | 0;
    const big = rnd() < 0.25;
    const w2 = big ? 2 : 1, h2 = big ? 2 + ((rnd() * 3) | 0) : 1 + ((rnd() * 2) | 0);
    px(dx, dy, along ? h2 : w2, along ? w2 : h2, big ? BLOOD_DEEP : BLOOD_WET,
       0.45 + rnd() * 0.45);
    if (big) px(dx + (along ? h2 + 1 : 0), dy + (along ? 0 : h2 + 1), 1, 1, BLOOD_WET, 0.5);
  }

  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export { Gore };
