// Character rigs, Mario 64 style: tapered tubes and low-poly spheres hung off
// a joint hierarchy. No skinning -- each segment is rigid and pivots at its
// joint, with a ball at the joint so bends do not show a seam.
import * as THREE from 'three';
import { tube, ball, blob, shoe, limbSegment, smooth, faceted, triCount, disposeTree } from './shapes.js';

export { smooth, faceted };

/** Backwards-compatible material helper. */
export function mat(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, fog: true, ...opts });
}

/** Box helper, still used for blades, planks and plates. */
export function box(w, h, d, material, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/* ---------------- blob shadow ---------------- */

let blobTex = null;
function getBlobTexture() {
  if (blobTex) return blobTex;
  const s = 32;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const img = x.createImageData(s, s);
  const r = s / 2;
  for (let y = 0; y < s; y++) {
    for (let i = 0; i < s; i++) {
      const dx = i - r + 0.5, dy = y - r + 0.5;
      const d = Math.sqrt(dx * dx + dy * dy) / r;
      let a = d >= 1 ? 0 : 1 - d * d;
      a = Math.round(a * 4) / 4;          // quantized, so it reads as pixel art
      const o = (y * s + i) * 4;
      img.data[o] = 0; img.data[o + 1] = 0; img.data[o + 2] = 0;
      img.data[o + 3] = a * 190;
    }
  }
  x.putImageData(img, 0, 0);
  blobTex = new THREE.CanvasTexture(c);
  blobTex.magFilter = THREE.NearestFilter;
  blobTex.minFilter = THREE.NearestFilter;
  blobTex.generateMipmaps = false;
  return blobTex;
}

export function blobShadow(radius = 0.5) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(radius * 2, radius * 2),
    new THREE.MeshBasicMaterial({
      map: getBlobTexture(), transparent: true, depthWrite: false,
      fog: false, opacity: 0.85,
    })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = -1;
  return m;
}

/* ---------------- proportions ---------------- */

export const HERO_PROPORTIONS = {
  headR:      0.23,          // head is a sphere now, not a cube
  neckH:      0.05,
  chestRTop:  0.25, chestRBot: 0.20, torsoH: 0.58, torsoSquashZ: 0.82,
  armRTop:    0.095, armRBot: 0.078, upperArmH: 0.28, foreArmH: 0.27,
  handR:      0.105,
  legRTop:    0.125, legRBot: 0.095, thighH: 0.34, shinH: 0.33,
  footL:      0.30, footW: 0.20, footH: 0.14,
  shoulderY:  0.50,
  shoulderX:  0.235,
  hipSpread:  0.13,
  segs:       8,
};

/* ---------------- the rig ---------------- */

export class Rig {
  /**
   * materials: { head, torso, upperArm, foreArm, hand, thigh, shin, foot }
   * Missing keys fall back to `torso`.
   */
  constructor(materials, proportions = HERO_PROPORTIONS) {
    const P = { ...HERO_PROPORTIONS, ...proportions };
    this.P = P;
    const M = (k) => materials[k] || materials.torso;
    const S = P.segs;

    this.root = new THREE.Group();
    this.hipY = P.thighH + P.shinH + P.footH * 0.45;

    this.hips = new THREE.Group();
    this.hips.position.y = this.hipY;
    this.root.add(this.hips);

    // --- torso: a barrel that tapers to the shoulders ---
    this.torso = new THREE.Group();
    this.hips.add(this.torso);
    this.chest = tube(P.chestRTop, P.chestRBot, P.torsoH, M('torso'), S,
      [0, P.torsoH / 2, 0]);
    this.chest.scale.z = P.torsoSquashZ;      // chests are wider than they are deep
    this.torso.add(this.chest);
    // shoulder yoke, so the arms do not float off a bare cylinder
    const yoke = blob(P.chestRTop * 1.06, M('torso'),
      [1.18, 0.62, P.torsoSquashZ], S, 5, [0, P.torsoH * 0.90, 0]);
    this.torso.add(yoke);
    // hip cap closes the bottom of the barrel
    this.torso.add(blob(P.chestRBot * 1.02, M('thigh'),
      [1, 0.7, P.torsoSquashZ], S, 5, [0, 0.02, 0]));

    // --- head ---
    this.neck = new THREE.Group();
    this.neck.position.y = P.torsoH + P.neckH;
    this.torso.add(this.neck);
    this.torso.add(tube(P.headR * 0.46, P.headR * 0.55, P.neckH + 0.06, M('head'), 6,
      [0, P.torsoH + 0.01, 0]));
    this.head = ball(P.headR, M('head'), S, 6, [0, P.headR * 0.92, 0]);
    this.head.scale.set(1, 1.04, 0.98);
    this.neck.add(this.head);

    // --- arms ---
    this.arms = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;

      const shoulder = new THREE.Group();
      shoulder.position.set(s * P.shoulderX, P.shoulderY, 0);
      this.torso.add(shoulder);
      const upper = limbSegment(P.armRTop, P.armRBot, P.upperArmH, M('upperArm'), S);
      shoulder.add(upper);
      shoulder.userData.mesh = upper;
      shoulder.userData.length = P.upperArmH;

      const elbow = new THREE.Group();
      elbow.position.y = -P.upperArmH;
      shoulder.add(elbow);
      const fore = limbSegment(P.armRBot, P.armRBot * 0.92, P.foreArmH, M('foreArm'), S);
      elbow.add(fore);
      elbow.userData.mesh = fore;

      // hand: an attachment point plus a glove ball
      const hand = new THREE.Group();
      hand.position.y = -P.foreArmH;
      elbow.add(hand);
      const handMesh = ball(P.handR, M('hand'), S, 5, [0, -P.handR * 0.7, 0]);
      handMesh.scale.set(1, 1.05, 0.9);
      hand.add(handMesh);

      this.arms[side] = { shoulder, elbow, hand, handMesh, side: s };
    }

    // --- legs ---
    this.legs = {};
    for (const side of ['L', 'R']) {
      const s = side === 'L' ? 1 : -1;

      const hip = new THREE.Group();
      hip.position.set(s * P.hipSpread, 0, 0);
      this.hips.add(hip);
      const thigh = limbSegment(P.legRTop, P.legRBot, P.thighH, M('thigh'), S);
      hip.add(thigh);
      hip.userData.mesh = thigh;

      const knee = new THREE.Group();
      knee.position.y = -P.thighH;
      hip.add(knee);
      const shin = limbSegment(P.legRBot, P.legRBot * 0.88, P.shinH, M('shin'), S);
      knee.add(shin);
      knee.userData.mesh = shin;

      const ankle = new THREE.Group();
      ankle.position.y = -P.shinH;
      knee.add(ankle);
      const foot = shoe(P.footL, P.footW, P.footH, M('foot'),
        [0, -P.footH * 0.35, 0]);
      ankle.add(foot);

      this.legs[side] = { hip, knee, ankle, foot, side: s };
    }

    this.shadow = blobShadow(0.46);
    this.root.add(this.shadow);
  }

  /** Reset every joint to rest. */
  resetPose() {
    this.torso.rotation.set(0, 0, 0);
    this.torso.position.set(0, 0, 0);
    this.neck.rotation.set(0, 0, 0);
    this.hips.position.y = this.hipY;
    this.hips.rotation.set(0, 0, 0);
    for (const side of ['L', 'R']) {
      const a = this.arms[side], l = this.legs[side];
      a.shoulder.rotation.set(0, 0, 0);
      a.elbow.rotation.set(0, 0, 0);
      a.hand.rotation.set(0, 0, 0);
      l.hip.rotation.set(0, 0, 0);
      l.knee.rotation.set(0, 0, 0);
      l.ankle.rotation.set(0, 0, 0);
    }
  }

  triCount() { return triCount(this.root); }
  dispose() { disposeTree(this.root); }
}
