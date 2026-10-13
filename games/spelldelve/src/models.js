// Characters: detailed, smooth, painted procedural models built with the blueprint kit (src/kit.js).
// Each model is a small rig of parts (body / head / arms / legs / weapon ...). Every part's pieces are merged per
// material, so a model costs one draw call per part per material, and blueprints (geometry) are built once and shared.
import * as THREE from '../vendor/three.module.js';
import { Blueprint, sph, cyl, cone, tor, box, lathe, blob, sbox, sweep, extrude, flatShape, T, TY, v3, lerpHex, hash3, makeMat } from './kit.js';

let TEX = null;
export function setModelTextures(t) { TEX = t; }

export function glowSprite(color, size, opacity = 1) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity }));
  s.scale.set(size, size, 1);
  return s;
}

const GOLD = 0xf0b848, STEEL = 0xb8c0cc, DSTEEL = 0x5a606c, IVORY = 0xeee2c6;
const BP = {};
const bp = (key, fn) => BP[key] || (BP[key] = fn().finalize());

// ---------------------------------------------------------------- shared bits
function eyePair(part, key, x, y, z, r, white, iris, glintKey, opts = {}) {
  for (const s of [-1, 1]) {
    part.add(key, sph(1, 18, 12), white, T(s * x, y, z, 0, s * 0.25, 0, r, r * (opts.tall ?? 1.1), r * 0.7));
    part.add(key, sph(1, 14, 10), iris, T(s * x + s * r * 0.08, y - r * 0.05, z + r * 0.5, 0, 0, 0, r * 0.55, r * 0.62, r * 0.35));
    if (glintKey) part.add(glintKey, sph(1, 8, 6), 0xffffff, T(s * x + s * r * 0.25 - r * 0.15, y + r * 0.3, z + r * 0.68, 0, 0, 0, r * 0.18));
  }
}
function boneSeg(part, key, a, b, r, col = IVORY) {
  const mid = v3(...a).lerp(v3(...b), 0.5);
  part.add(key, sweep([a, mid.toArray(), b], [r * 1.5, r * 1.05, r * 0.85, r, r * 1.5], { rs: 8, ts: 10 }), col);
  part.add(key, sph(1, 10, 8), col, T(...a, 0, 0, 0, r * 1.45));
  part.add(key, sph(1, 10, 8), col, T(...b, 0, 0, 0, r * 1.45));
}
function rivetRing(part, key, y, r, n, col, size = 0.022, z0 = 0) {
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; part.add(key, sph(1, 8, 6), col, T(Math.sin(a) * r, y, Math.cos(a) * r + z0, 0, 0, 0, size)); }
}
function star5(R, r) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return s;
}
function hand(part, key, p, dir, size, col, fingers = 4, curl = 0.6, claw = null) {
  // palm + curled fingers. dir: forward direction of the fingers ([x,y,z]), palm faces roughly sideways
  const d = v3(...dir).normalize(), side = v3(0, 1, 0).cross(d).normalize(); if (side.lengthSq() < 0.01) side.set(1, 0, 0);
  const up = d.clone().cross(side).normalize();
  const P = v3(...p);
  part.add(key, sph(1, 14, 10), col, new THREE.Matrix4().makeBasis(side, up, d).scale(v3(size * 0.95, size * 0.55, size)).setPosition(P));
  for (let i = 0; i < fingers; i++) {
    const o = (i - (fingers - 1) / 2) * size * 0.45;
    const b = P.clone().addScaledVector(d, size * 0.8).addScaledVector(side, o);
    const m1 = b.clone().addScaledVector(d, size * 0.55).addScaledVector(up, -size * 0.25 * curl);
    const m2 = m1.clone().addScaledVector(d, size * 0.35 * (1 - curl * 0.5)).addScaledVector(up, -size * 0.45 * curl);
    part.add(key, sweep([b.toArray(), m1.toArray(), m2.toArray()], [size * 0.2, size * 0.17, size * 0.13], { rs: 6, ts: 6 }), col);
    if (claw) part.add(claw[0], cone(size * 0.1, size * 0.35, 6), claw[1], TY(m2.clone().addScaledVector(d, size * 0.1).toArray(), m2.clone().sub(m1).toArray()));
  }
  // thumb
  const tb = P.clone().addScaledVector(side, size * 0.7).addScaledVector(d, size * 0.2);
  const tt = tb.clone().addScaledVector(d, size * 0.5).addScaledVector(up, -size * 0.3).addScaledVector(side, -size * 0.1);
  part.add(key, sweep([tb.toArray(), tt.toArray()], [size * 0.22, size * 0.15], { rs: 6, ts: 4 }), col);
}

// ================================================================ THE WIZARD
function bpWizard() {
  const B = new Blueprint({
    robe: { base: 'cloth', sway: true, swayGroup: 'hem', swayTop: 0.85, swayBot: 0 },
    runes: { base: 'glow', swayGroup: 'hem', swayTop: 0.85, swayBot: 0 },
    cape: { base: 'cloth', side: true, sway: true, swayTop: 1.25, swayBot: 0.05 },
    cloth: 'cloth', leather: 'leather', metal: 'metal', skin: 'skin', eye: 'gloss', hair: 'fur', glow: 'glow', wood: 'wood',
    crystal: { phys: true, r: 0.05, e: 0xa070ff, ei: 2.2, cc: 1 },
  });
  const ROBE = 0x3a4cd0, ROBE_D = 0x1b2275, HAT = 0x2f3cb4, CAPE = 0x5a2a86, SKIN = 0xf2c3a0, BEARD = 0xf1eee6;
  const body = B.part('body');
  // robe: one lathe from floor to shoulders with real folds that fade out toward the chest; gold hem painted in
  const robe = B.part('robe', 'body');
  robe.add('robe', lathe([[0.001, 0.0], [0.5, 0.0], [0.545, 0.05], [0.53, 0.12], [0.48, 0.32], [0.41, 0.55], [0.34, 0.78], [0.31, 0.95], [0.31, 1.08], [0.28, 1.18], [0.19, 1.27], [0.09, 1.31], [0.001, 1.32]],
    { seg: 44, fold: [9, (y) => Math.max(0, 0.75 - y) * 0.09] }), ROBE, null, (p, n, c) => {
    if (p.y > 0.035 && p.y < 0.135) { c.setHex(GOLD); if (p.y > 0.06 && p.y < 0.11) c.multiplyScalar(0.75); return; }
    lerpHex(c, ROBE_D, ROBE, p.y / 0.9);
    const a = Math.atan2(p.x, p.z); c.multiplyScalar(0.85 + 0.15 * Math.sin(a * 9 + 1.6) * Math.max(0, 1 - p.y));
    if (Math.abs(p.x) < 0.035 && p.z > 0 && p.y > 0.14 && p.y < 1.2) c.setHex(GOLD).multiplyScalar(0.85); // front placket
  });
  for (let i = 0; i < 12; i++) { // glowing runes stitched above the hem
    const a = (i / 12) * Math.PI * 2, r = 0.512;
    robe.add('runes', i % 2 ? sph(1, 6, 4) : box(1, 1, 1), i % 3 ? 0x9ad8ff : 0xc8a0ff, T(Math.sin(a) * r, 0.2, Math.cos(a) * r, 0, a, i % 2 ? 0 : Math.PI / 4, 0.03, 0.035, 0.012));
  }
  for (let i = 0; i < 4; i++) robe.add('runes', box(1, 1, 1), 0x9ad8ff, T(0, 0.3 + i * 0.16, 0.39 - i * 0.025 + (i > 1 ? 0.0 : 0.01), -0.12, 0, Math.PI / 4, 0.026, 0.026, 0.01));
  // mantle (short shoulder cape) with gold edge
  body.add('cloth', lathe([[0.17, 1.3], [0.27, 1.25], [0.37, 1.13], [0.41, 1.0], [0.4, 0.97]], { seg: 36, fold: [7, () => 0.05] }), 0x6a4ab8, null, (p, n, c) => { if (p.y < 1.02) c.setHex(GOLD); });
  body.add('metal', tor(0.165, 0.03, Math.PI * 2, 8, 24), GOLD, T(0, 1.31, 0, Math.PI / 2));
  body.add('glow', sph(1, 12, 8), 0x7fe0ff, T(0, 1.24, 0.2, 0, 0, 0, 0.045)); // clasp gem
  body.add('metal', tor(0.06, 0.016, Math.PI * 2, 6, 16), GOLD, T(0, 1.24, 0.2));
  // belt, buckle, pouches, potion, scroll
  body.add('leather', tor(0.33, 0.04, Math.PI * 2, 8, 36), 0x5a3520, T(0, 0.8, 0, Math.PI / 2, 0, 0, 1, 1, 1.4));
  body.add('metal', sbox(0.12, 0.1, 0.04, 0.4), GOLD, T(0, 0.8, 0.335));
  body.add('leather', sbox(0.06, 0.05, 0.03, 0.4), 0x3a2414, T(0, 0.8, 0.355));
  for (const s of [-1, 1]) {
    body.add('leather', sbox(0.14, 0.16, 0.09, 0.35), 0x6e4426, T(s * 0.26, 0.69, 0.16, 0, s * 0.6, 0));
    body.add('leather', sbox(0.15, 0.06, 0.1, 0.35), 0x55331c, T(s * 0.265, 0.765, 0.165, 0.15, s * 0.6, 0));
    body.add('metal', sph(1, 8, 6), GOLD, T(s * 0.29, 0.745, 0.21, 0, 0, 0, 0.016));
  }
  body.add('glow', sph(1, 12, 10), 0xff5ab0, T(-0.14, 0.64, 0.28, 0, 0, 0, 0.05, 0.065, 0.05)); // potion
  body.add('metal', cyl(0.018, 0.022, 0.05, 8), 0xc8a060, T(-0.14, 0.715, 0.28));
  body.add('cloth', cyl(0.035, 0.035, 0.22, 10), 0xf0e2c0, T(0.12, 0.66, -0.3, 0, 0, 1.2)); // scroll on the back
  // pointed curled shoes
  for (const s of [-1, 1]) body.add('leather', sweep([[s * 0.11, 0.05, 0.12], [s * 0.13, 0.05, 0.3], [s * 0.15, 0.07, 0.44], [s * 0.15, 0.14, 0.5]], [0.075, 0.065, 0.04, 0.012], { rs: 10 }), 0x4a2a18);

  // cape from the shoulders to the floor
  const cape = B.part('cape', 'body');
  cape.add('cape', lathe([[0.2, 1.27], [0.32, 1.12], [0.4, 0.85], [0.5, 0.45], [0.6, 0.08]], { seg: 28, phi0: Math.PI * 0.62, phiL: Math.PI * 0.76, fold: [7, (y) => (1.3 - y) * 0.06] }), CAPE, T(0, 0, -0.04),
    (p, n, c) => { if (p.y < 0.16) c.setHex(GOLD).multiplyScalar(0.8); else lerpHex(c, 0x2a1240, CAPE, p.y / 1.1); });

  // head
  const head = B.part('head', 'body', [0, 1.46, 0.02]);
  head.add('skin', sph(1, 28, 20), SKIN, T(0, 0, 0, 0, 0, 0, 0.2, 0.215, 0.2));
  head.add('skin', sph(1, 14, 10), 0xf0a890, T(0, -0.01, 0.2, 0.3, 0, 0, 0.055, 0.06, 0.07)); // nose
  for (const s of [-1, 1]) {
    head.add('skin', sph(1, 10, 8), 0xf0a890, T(s * 0.11, -0.04, 0.14, 0, 0, 0, 0.055, 0.045, 0.04)); // cheeks
    head.add('skin', sph(1, 10, 8), SKIN, T(s * 0.2, 0.0, -0.01, 0, 0, 0, 0.03, 0.06, 0.04)); // ears
    head.add('hair', sweep([[s * 0.025, 0.1, 0.19], [s * 0.09, 0.125, 0.185], [s * 0.15, 0.115, 0.14]], [0.022, 0.026, 0.008], { rs: 8 }), BEARD); // brows
    head.add('hair', sweep([[s * 0.0, -0.06, 0.21], [s * 0.07, -0.065, 0.205], [s * 0.15, -0.1, 0.15], [s * 0.19, -0.16, 0.1]], [0.03, 0.035, 0.02, 0.006], { rs: 8 }), 0xe4e0d8); // mustache
    head.add('hair', sweep([[s * 0.17, 0.05, -0.06], [s * 0.21, -0.1, -0.08], [s * 0.2, -0.28, -0.1]], [0.05, 0.05, 0.01], { rs: 8 }), BEARD); // side hair
  }
  eyePair(head, 'eye', 0.075, 0.04, 0.165, 0.038, 0xffffff, 0x2a4ab0, 'glow');
  // beard: a full wedge plus wavy strands
  head.add('hair', lathe([[0.001, 0.02], [0.16, -0.02], [0.19, -0.13], [0.16, -0.3], [0.09, -0.46], [0.001, -0.55]], { seg: 24, fold: [11, () => 0.06] }), BEARD, T(0, -0.07, 0.09, 0.32, 0, 0, 1, 1, 0.62),
    (p, n, c) => c.multiplyScalar(0.85 + 0.15 * Math.max(0, n.z)));
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.06;
    head.add('hair', sweep([[x, -0.1, 0.17], [x * 1.1 + 0.01, -0.3, 0.14], [x * 0.7 - 0.01, -0.45, 0.06], [x * 0.3, -0.58, 0.0]], [0.028, 0.03, 0.02, 0.004], { rs: 7 }), 0xfaf8f2);
  }
  // hat: brim + bent cone + band + stars
  const hat = B.part('hat', 'head', [0, 0.13, -0.01], [-0.08, 0, 0.06]);
  hat.add('cloth', lathe([[0.12, 0.03], [0.27, 0.0], [0.4, 0.0], [0.45, 0.04], [0.43, 0.055], [0.27, 0.035], [0.12, 0.06]], { seg: 40, fold: [5, () => 0.04] }), HAT,
    null, (p, n, c) => { c.multiplyScalar(0.8 + 0.2 * Math.max(0, n.y)); if (Math.hypot(p.x, p.z) > 0.405) c.setHex(GOLD).multiplyScalar(0.9); });
  hat.add('cloth', sweep([[0, 0.02, 0], [0, 0.3, -0.02], [0.03, 0.56, -0.07], [0.13, 0.75, -0.15], [0.3, 0.82, -0.27], [0.4, 0.78, -0.32]], (t) => 0.27 * Math.pow(1 - t, 1.15) + 0.008, { rs: 22, ts: 40 }), HAT,
    null, (p, n, c) => lerpHex(c, HAT, 0x4a5ad8, p.y / 0.8));
  hat.add('cloth', tor(0.255, 0.045, Math.PI * 2, 8, 32), 0x2a1a40, T(0, 0.07, 0, Math.PI / 2, 0, 0, 1, 1, 1.4));
  hat.add('metal', sbox(0.1, 0.09, 0.03, 0.3), GOLD, T(0, 0.07, 0.26));
  hat.add('metal', sph(1, 10, 8), GOLD, T(0.4, 0.76, -0.33, 0, 0, 0, 0.04));
  const st = flatShape(star5(1, 0.42), 2);
  for (const [x, y, z, ry, s] of [[0.11, 0.33, 0.15, 0.6, 0.05], [-0.1, 0.25, 0.17, -0.5, 0.04], [0.02, 0.52, 0.07, 0.1, 0.035], [0.2, 0.65, -0.03, 0.9, 0.03]]) hat.add('glow', st, 0xffe27a, T(x, y, z, -0.25, ry, 0, s));
  // arms: bell sleeves, gold cuffs, hands
  for (const s of [-1, 1]) {
    const nm = s < 0 ? 'armL' : 'armR';
    const arm = B.part(nm, 'body', [s * 0.27, 1.2, 0.0]);
    const wrist = s < 0 ? [s * 0.13, -0.48, 0.16] : [s * 0.08, -0.46, 0.2];
    arm.add('cloth', sweep([[0, 0, 0], [s * 0.08, -0.18, 0.03], [s * 0.11, -0.34, 0.09], wrist], [0.1, 0.105, 0.13, 0.17], { rs: 16, ts: 18 }), ROBE, null, (p, n, c) => lerpHex(c, ROBE, ROBE_D, -p.y * 1.4));
    arm.add('metal', tor(0.165, 0.02, Math.PI * 2, 6, 24), GOLD, TY(wrist, [s * 0.1, -0.6, 0.4]).multiply(T(0, 0, 0, Math.PI / 2)));
    const hp = [wrist[0] + s * 0.01, wrist[1] - 0.08, wrist[2] + 0.04];
    hand(arm, 'skin', hp, s < 0 ? [s * 0.2, -0.9, 0.5] : [0, -0.3, 1], 0.075, SKIN, 4, s < 0 ? 0.35 : 0.95);
  }
  // staff in the right hand: gnarled shaft, spiral carving, leather grip, claw holding a faceted crystal
  const staff = B.part('staff', 'armR', [0.09, -0.55, 0.25]);
  const sh = [];
  for (let i = 0; i <= 8; i++) sh.push([Math.sin(i * 1.7) * 0.018, -0.72 + i * 0.235, Math.cos(i * 2.3) * 0.015]);
  staff.add('wood', sweep(sh, (t) => 0.034 + 0.012 * Math.sin(t * 19) ** 2 + t * 0.012, { rs: 10, ts: 60 }), 0x6b4426, null, (p, n, c) => c.multiplyScalar(0.8 + 0.25 * hash3(p.x * 9, p.y * 3, p.z * 9)));
  const hel = []; for (let i = 0; i <= 40; i++) { const a = i * 0.55; hel.push([Math.sin(a) * 0.045, -0.55 + i * 0.022, Math.cos(a) * 0.045]); }
  staff.add('wood', sweep(hel, 0.008, { rs: 5, ts: 120 }), 0x3a2212);
  for (let i = 0; i < 5; i++) staff.add('wood', tor(0.05, 0.014, Math.PI * 2, 6, 14), 0x8a5a30, T(0, -0.1 + i * 0.045, 0, Math.PI / 2 + (i % 2 ? 0.2 : -0.2)));
  staff.add('metal', tor(0.058, 0.016, Math.PI * 2, 6, 16), GOLD, T(0, 1.15, 0, Math.PI / 2));
  staff.add('metal', tor(0.05, 0.012, Math.PI * 2, 6, 16), GOLD, T(0, 0.98, 0, Math.PI / 2));
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2, c = Math.sin(a), d = Math.cos(a);
    staff.add('wood', sweep([[0, 1.15, 0], [c * 0.1, 1.24, d * 0.1], [c * 0.13, 1.38, d * 0.13], [c * 0.05, 1.5, d * 0.05]], [0.03, 0.025, 0.018, 0.006], { rs: 7 }), 0x5a3820);
  }
  staff.add('glow', sph(1, 8, 6), 0xd8c0ff, T(0, 1.32, 0, 0, 0, 0, 0.06));
  const crystal = B.part('crystal', 'staff', [0, 1.33, 0]);
  crystal.add('crystal', lathe([[0.001, -0.15], [0.085, -0.02], [0.075, 0.1], [0.001, 0.25]], { seg: 6 }), 0xc9a8ff);
  crystal.add('crystal', lathe([[0.001, -0.07], [0.04, 0.0], [0.035, 0.05], [0.001, 0.12]], { seg: 5 }), 0xe0c8ff, T(0.08, -0.05, 0.03, 0, 0, -0.5));
  return B;
}
export function makeWizard() {
  const I = bp('wizard', bpWizard).instance();
  const P = I.parts;
  const orbGlow = glowSprite(0xb08cff, 1.1, 0.9); P.crystal.add(orbGlow);
  // ground ring + facing notch so the wizard reads instantly from the top-down camera in a crowd
  const rm = new THREE.MeshBasicMaterial({ color: 0x9ad8ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.66, 0.72, 48), rm); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.03; ring.renderOrder = 2;
  const ns = new THREE.Shape(); ns.moveTo(-0.13, 0.76); ns.lineTo(0, 0.94); ns.lineTo(0.13, 0.76); ns.lineTo(0, 0.82);
  const notch = new THREE.Mesh(new THREE.ShapeGeometry(ns), rm); notch.rotation.x = Math.PI / 2; notch.position.y = 0.03;
  I.root.add(ring, notch);
  return { root: I.root, body: P.body, robe: P.robe, cape: P.cape, head: P.head, hat: P.hat, armL: P.armL, armR: P.armR, staff: P.staff,
    orb: P.crystal, orbMat: I.mats.crystal, orbGlow, mats: I.allMats, sway: I.mats.robe.userData.sd.uSway.value, capeSway: I.mats.cape.userData.sd.uSway.value,
    runeMat: I.mats.runes };
}

// ================================================================ MONSTERS
// ---- slime: translucent jelly with a glowing core, swallowed junk, big glossy eyes and a mouth
function bpSlime(color, light, kind = 'slime', elite = false) {
  const B = new Blueprint({ jelly: { base: 'jelly', e: color, ei: 0.12 }, glow: 'glow', gloss: 'gloss', metal: 'metal' });
  const body = B.part('body');
  const jel = blob(0.62, (d) => (d.y < 0 ? 1 + 0.12 * Math.sin(-d.y * Math.PI) - 0.45 * d.y * d.y * d.y * d.y : 1 + 0.05 * Math.sin(Math.atan2(d.x, d.z) * 3) * (1 - d.y)), 36, 26);
  body.add('jelly', jel, color, T(0, 0.52, 0, 0, 0, 0, 1, 0.84, 1), (p, n, c) => { lerpHex(c, color, light, (p.y - 0.1) / 0.9); if (n.y > 0.6) c.lerp(new THREE.Color(0xffffff), (n.y - 0.6) * 0.5); });
  body.add('glow', sph(1, 16, 12), light, T(0, 0.42, -0.08, 0, 0, 0, 0.09));
  body.add('glow', sph(1, 12, 8), 0xffffff, T(0, 0.42, -0.08, 0, 0, 0, 0.045));
  if (kind === 'slime') {
    body.add('gloss', sweep([[-0.2, 0.25, -0.15], [0.0, 0.3, -0.25], [0.2, 0.22, -0.2]], [0.035, 0.03, 0.035], { rs: 6 }), IVORY); // a swallowed bone
    body.add('gloss', sph(1, 8, 6), IVORY, T(-0.21, 0.25, -0.15, 0, 0, 0, 0.05)); body.add('gloss', sph(1, 8, 6), IVORY, T(0.21, 0.22, -0.2, 0, 0, 0, 0.05));
    body.add('metal', cyl(0.06, 0.06, 0.015, 14), GOLD, T(0.22, 0.38, 0.05, 0.8, 0, 0.3));
    eyePair(body, 'gloss', 0.19, 0.72, 0.5, 0.12, 0xffffff, 0x101418, 'glow', { tall: 1.3 });
  } else {
    // slimelet: one big cyclops eye
    body.add('gloss', sph(1, 18, 12), 0xffffff, T(0, 0.7, 0.5, 0, 0, 0, 0.17, 0.19, 0.12));
    body.add('gloss', sph(1, 12, 8), 0x101418, T(0, 0.68, 0.59, 0, 0, 0, 0.09, 0.11, 0.06));
    body.add('glow', sph(1, 8, 6), 0xffffff, T(0.04, 0.73, 0.64, 0, 0, 0, 0.03));
  }
  // mouth: dark open smile with a tongue
  body.add('gloss', sph(1, 16, 10), 0x2a0a14, T(0, 0.46, 0.565, 0.3, 0, 0, 0.15, 0.07, 0.05));
  body.add('gloss', sph(1, 12, 8), 0xff6a8a, T(0, 0.43, 0.585, 0.3, 0, 0, 0.07, 0.035, 0.03));
  if (elite) {
    body.add('metal', lathe([[0.2, 0], [0.22, 0.05], [0.2, 0.12]], { seg: 24 }), GOLD, T(0, 0.99, 0));
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; body.add('metal', cone(0.04, 0.12, 8), GOLD, T(Math.sin(a) * 0.2, 1.16, Math.cos(a) * 0.2)); }
    body.add('glow', sph(1, 8, 6), 0xff3060, T(0, 1.05, 0.22, 0, 0, 0, 0.035));
  }
  return B;
}
// ---- skeleton archer: real skull + jaw, ribcage, spine, bony limbs, a torn hood, quiver and a recurve bow
function bpSkeleton(elite) {
  const B = new Blueprint({ bone: 'bone', glow: 'glow', dark: 'gloss', cloth: { base: 'cloth', side: true }, wood: 'wood', leather: 'leather', metal: 'metal' });
  const BONE = 0xe8dcc0, BONE_D = 0xb8a888;
  const body = B.part('body', null, [0, 0.86, 0]);
  body.add('bone', blob(1, (d) => 1 + 0.25 * Math.max(0, Math.abs(d.x) - 0.5), 18, 12), BONE, T(0, 0, 0, 0, 0, 0, 0.17, 0.09, 0.1));
  for (const s of [-1, 1]) body.add('bone', sph(1, 12, 8), BONE_D, T(s * 0.13, 0.05, -0.01, 0, 0, s * 0.5, 0.08, 0.07, 0.05));
  body.add('cloth', lathe([[0.18, 0.05], [0.2, -0.05], [0.22, -0.32]], { seg: 20, phi0: -0.9, phiL: 1.8, fn: (q) => { if (q.y < -0.2) q.y += Math.sin(Math.atan2(q.x, q.z) * 11) * 0.04; } }), 0x4a3a2a);
  const torso = B.part('torso', 'body', [0, 0.02, 0]);
  for (let i = 0; i < 9; i++) torso.add('bone', sph(1, 10, 8), i % 2 ? BONE : BONE_D, T(0, 0.06 + i * 0.062, -0.06 - Math.sin(i * 0.35) * 0.03, 0, 0, 0, 0.035, 0.03, 0.035));
  torso.add('bone', sweep([[0, 0.02, -0.06], [0, 0.3, -0.1], [0, 0.56, -0.06]], 0.018, { rs: 6 }), BONE_D);
  for (let i = 0; i < 5; i++) {
    const y = 0.5 - i * 0.075, w = 0.17 - Math.abs(i - 1.5) * 0.012;
    for (const s of [-1, 1]) torso.add('bone', sweep([[s * 0.02, y, -0.08], [s * w, y - 0.03, -0.03], [s * (w - 0.02), y - 0.06, 0.08], [s * 0.04, y - 0.08 - i * 0.01, 0.13]], 0.016, { rs: 6, ts: 14 }), BONE);
  }
  torso.add('bone', sbox(0.05, 0.22, 0.03, 0.5), BONE, T(0, 0.38, 0.135, -0.1));
  for (const s of [-1, 1]) torso.add('bone', sweep([[s * 0.02, 0.56, 0.08], [s * 0.12, 0.58, 0.04], [s * 0.2, 0.55, -0.02]], 0.017, { rs: 6 }), BONE);
  // torn hood/cowl over the shoulders
  torso.add('cloth', lathe([[0.1, 0.66], [0.2, 0.6], [0.27, 0.48], [0.28, 0.36]], { seg: 28, phi0: Math.PI * 0.35, phiL: Math.PI * 1.3,
    fn: (q) => { if (q.y < 0.45) q.y -= (Math.sin(Math.atan2(q.x, q.z) * 9) * 0.5 + 0.5) * 0.12; } }), 0x3e3428, null, (p, n, c) => c.multiplyScalar(0.7 + 0.3 * hash3(p.x * 20, 1, p.z * 20)));
  // quiver
  torso.add('leather', cyl(0.07, 0.06, 0.45, 12), 0x6a4426, T(0.1, 0.38, -0.2, 0.25, 0, -0.35));
  torso.add('leather', sweep([[-0.15, 0.58, 0.1], [0, 0.4, 0.15], [0.16, 0.18, 0.08]], 0.014, { rs: 4, sx: 2.5 }), 0x4a2e18);
  for (let i = 0; i < 4; i++) {
    const x = 0.17 + (i - 1.5) * 0.025, y = 0.62, z = -0.14 + (i % 2) * 0.03;
    torso.add('wood', cyl(0.008, 0.008, 0.2, 5), 0xc0a070, T(x, y, z, 0.25, 0, -0.35));
    torso.add('cloth', cone(0.03, 0.08, 4), i % 2 ? 0xc03a2a : 0xe8e0d0, T(x + 0.035, y + 0.1, z + 0.025, 0.25, 0, -0.35));
  }
  const head = B.part('head', 'torso', [0, 0.66, 0.01]);
  // skull: a long cranium bulging at the back, flat temples, and a face that narrows hard below the cheekbones
  head.add('bone', blob(1, (d, q) => {
    let x = d.x, y = d.y, z = d.z;
    if (z < 0) { z *= 1.18; y += 0.08 * -z; }
    if (y < 0) { const k = Math.min(1, -y * 1.5); x *= 1 - 0.38 * k; z *= z > 0 ? 1 - 0.12 * k : 1 - 0.35 * k; y *= 0.9; }
    x *= 1 - 0.1 * Math.max(0, 1 - Math.abs(y - 0.1) * 3) * Math.max(0, Math.abs(x) - 0.6);
    q.set(x, y, z);
  }, 30, 22), BONE, T(0, 0.13, -0.02, 0, 0, 0, 0.15, 0.15, 0.16), (p, n, c) => {
    // dirt in the crevices: darker toward the jaw line and the back, a suture line across the crown
    c.multiplyScalar(0.82 + 0.18 * Math.max(0, n.y + 0.4));
    if (Math.abs(p.x + Math.sin(p.z * 60) * 0.006) < 0.005 && p.y > 0.2) c.multiplyScalar(0.65);
  });
  head.add('bone', sweep([[-0.12, 0.13, 0.09], [-0.06, 0.165, 0.145], [0, 0.155, 0.155], [0.06, 0.165, 0.145], [0.12, 0.13, 0.09]], 0.022, { rs: 8, ts: 24, sy: 0.7 }), BONE); // brow ridge
  for (const s of [-1, 1]) {
    head.add('dark', sph(1, 14, 10), 0x050203, T(s * 0.056, 0.105, 0.118, 0, s * 0.3, s * -0.25, 0.048, 0.046, 0.026)); // deep sockets
    head.add('glow', sph(1, 10, 8), 0xff7a2a, T(s * 0.055, 0.1, 0.133, 0, 0, 0, 0.016));
    head.add('bone', sweep([[s * 0.1, 0.05, 0.11], [s * 0.135, 0.06, 0.04], [s * 0.13, 0.07, -0.03]], [0.022, 0.016, 0.012], { rs: 7, sy: 0.6 }), BONE_D); // cheekbone arches
    head.add('bone', sweep([[s * 0.03, 0.06, 0.15], [s * 0.075, 0.045, 0.14], [s * 0.1, 0.05, 0.11]], 0.012, { rs: 6 }), BONE); // lower socket rim
  }
  for (const s of [-1, 1]) head.add('dark', sbox(0.022, 0.05, 0.03, 0.4), 0x050203, T(s * 0.012, 0.045, 0.155, 0, 0, s * 0.35)); // nasal cavity
  head.add('bone', sbox(0.13, 0.05, 0.09, 0.5), BONE, T(0, 0.0, 0.1)); // upper jaw
  for (let i = 0; i < 6; i++) head.add('bone', sbox(0.022, 0.035, 0.02, 0.5), 0xf4ecd8, T((i - 2.5) * 0.024, -0.02, 0.15 - Math.abs(i - 2.5) * 0.006));
  if (elite) { head.add('metal', tor(0.15, 0.018, Math.PI * 2, 6, 24), GOLD, T(0, 0.23, 0, Math.PI / 2 - 0.15)); for (let i = 0; i < 5; i++) head.add('metal', cone(0.025, 0.08, 6), GOLD, T((i - 2) * 0.06, 0.3, 0.13 - Math.abs(i - 2) * 0.02, 0.15)); }
  const jaw = B.part('jaw', 'head', [0, 0.02, 0.03]);
  jaw.add('bone', sweep([[-0.11, 0.02, -0.06], [-0.09, -0.06, 0.06], [0, -0.07, 0.12], [0.09, -0.06, 0.06], [0.11, 0.02, -0.06]], 0.024, { rs: 6, ts: 20, sx: 1.5 }), BONE);
  for (let i = 0; i < 5; i++) jaw.add('bone', sbox(0.02, 0.03, 0.018, 0.5), 0xf4ecd8, T((i - 2) * 0.024, -0.035, 0.115 - Math.abs(i - 2) * 0.008));
  for (const s of [-1, 1]) {
    const arm = B.part(s < 0 ? 'armL' : 'armR', 'torso', [s * 0.2, 0.55, -0.02]);
    const el = s < 0 ? [s * 0.08, -0.22, 0.14] : [s * 0.08, -0.26, 0.04], wr = s < 0 ? [s * 0.02, -0.28, 0.4] : [s * 0.04, -0.48, 0.12];
    boneSeg(arm, 'bone', [0, 0, 0], el, 0.022, BONE);
    boneSeg(arm, 'bone', el, wr, 0.018, BONE);
    hand(arm, 'bone', [wr[0], wr[1] - 0.01, wr[2] + 0.04], s < 0 ? [0, 0.1, 1] : [0, -0.6, 0.5], 0.05, BONE, 3, 0.9);
    arm.add('bone', sph(1, 10, 8), BONE_D, T(0, 0.01, 0, 0, 0, 0, 0.05));
    const leg = B.part(s < 0 ? 'legL' : 'legR', 'body', [s * 0.1, -0.04, 0]);
    boneSeg(leg, 'bone', [0, 0, 0], [s * 0.01, -0.38, 0.04], 0.026, BONE);
    boneSeg(leg, 'bone', [s * 0.01, -0.4, 0.04], [s * 0.01, -0.76, -0.01], 0.021, BONE);
    leg.add('bone', sph(1, 10, 8), BONE_D, T(s * 0.01, -0.39, 0.065, 0, 0, 0, 0.04)); // kneecap
    leg.add('bone', sbox(0.08, 0.04, 0.18, 0.5), BONE, T(s * 0.01, -0.8, 0.06));
  }
  const bow = B.part('bow', 'armL', [-0.02, -0.28, 0.44]);
  const limb = [[0, -0.6, 0.04], [0, -0.48, -0.08], [0, -0.2, -0.07], [0, 0, 0], [0, 0.2, -0.07], [0, 0.48, -0.08], [0, 0.6, 0.04]];
  bow.add('wood', sweep(limb, (t) => 0.012 + 0.018 * Math.sin(t * Math.PI), { rs: 7, ts: 40, sx: 0.7 }), 0x6b4a2a, null, (p, n, c) => { if (Math.abs(p.y) < 0.07) c.setHex(0x3a2414); });
  bow.add('cloth', sweep([[0, -0.59, 0.03], [0, 0, -0.1], [0, 0.59, 0.03]], 0.004, { rs: 4, ts: 4 }), 0xe8e0c8);
  if (elite) for (const y of [-0.6, 0.6]) bow.add('metal', cone(0.02, 0.07, 6), GOLD, T(0, y + Math.sign(y) * 0.03, 0.04, y > 0 ? 0 : Math.PI));
  return B;
}
// ---- bat: fuzzy body, huge ears, glowing eyes, fangs, two-jointed membrane wings with finger bones
function bpBat(elite) {
  const B = new Blueprint({ fur: 'fur', membrane: 'membrane', glow: 'glow', skin: 'skin', bone: 'bone', metal: 'metal' });
  const FUR = 0x6a3a80, FUR_L = 0xa07ab0;
  const body = B.part('body');
  body.add('fur', blob(0.27, (d) => 1 + 0.05 * Math.sin(d.x * 20) * Math.sin(d.z * 20) + 0.04 * Math.sin(d.y * 25), 26, 18), FUR, T(0, 0, -0.03, 0, 0, 0, 1, 1.05, 1.1), (p, n, c) => { if (n.z > 0.3 && p.y < 0.05) lerpHex(c, FUR, FUR_L, n.z); });
  body.add('fur', sph(1, 20, 14), FUR, T(0, 0.1, 0.18, 0, 0, 0, 0.17, 0.15, 0.15));
  for (const s of [-1, 1]) {
    body.add('fur', sweep([[s * 0.08, 0.18, 0.16], [s * 0.14, 0.34, 0.12], [s * 0.15, 0.48, 0.06]], [0.07, 0.06, 0.004], { rs: 10, sx: 0.45 }), FUR);
    body.add('skin', sweep([[s * 0.085, 0.2, 0.19], [s * 0.14, 0.33, 0.15], [s * 0.148, 0.44, 0.1]], [0.045, 0.04, 0.003], { rs: 8, sx: 0.3 }), 0xd88aa8);
    body.add('glow', sph(1, 12, 8), 0xff3030, T(s * 0.07, 0.14, 0.31, 0, s * 0.3, 0, 0.04, 0.035, 0.025));
    body.add('bone', cone(0.014, 0.06, 6), 0xffffff, T(s * 0.03, 0.02, 0.33, Math.PI + 0.2, 0, 0));
    body.add('bone', sweep([[s * 0.06, -0.24, -0.02], [s * 0.07, -0.32, 0.0], [s * 0.06, -0.36, 0.04]], [0.02, 0.012, 0.004], { rs: 5 }), 0x2a1a2a); // feet
  }
  body.add('skin', sph(1, 14, 10), 0xc87a98, T(0, 0.07, 0.31, 0, 0, 0, 0.07, 0.05, 0.05));
  body.add('skin', sph(1, 10, 8), 0x2a0a14, T(0, 0.02, 0.3, 0, 0, 0, 0.05, 0.022, 0.03));
  if (elite) body.add('metal', tor(0.05, 0.012, Math.PI * 2, 6, 14), GOLD, T(0.15, 0.4, 0.08, 0, Math.PI / 2, 0));
  for (const s of [-1, 1]) {
    const wn = s < 0 ? 'wl' : 'wr', wo = s < 0 ? 'wlo' : 'wro';
    const w = B.part(wn, 'body', [s * 0.2, 0.06, -0.02]);
    w.add('bone', sweep([[0, 0, 0], [s * 0.2, 0.06, 0.03], [s * 0.38, 0.03, 0.0]], [0.04, 0.025, 0.02], { rs: 6 }), 0x3a2048);
    const m = new THREE.Shape(); m.moveTo(0, 0); m.lineTo(0.38 * s, 0.0); m.quadraticCurveTo(0.3 * s, 0.15, 0.32 * s, 0.3); m.quadraticCurveTo(0.18 * s, 0.22, 0.05 * s, 0.25); m.lineTo(0, 0.1);
    w.add('membrane', flatShape(m, 10), 0x3e1a52, T(0, 0.03, 0, -Math.PI / 2), (p, n, c) => c.multiplyScalar(0.8 + 0.4 * Math.abs(p.x)));
    const o = B.part(wo, wn, [s * 0.38, 0.03, 0]);
    const tips = [[0.5, -0.05, 0.02], [0.48, 0.0, -0.22], [0.3, 0.0, -0.4]];
    for (const tp of tips) o.add('bone', sweep([[0, 0, 0], [s * tp[0] * 0.55, 0.03, tp[2] * 0.5], [s * tp[0], tp[1], tp[2]]], [0.018, 0.012, 0.004], { rs: 5 }), 0x3a2048);
    o.add('bone', cone(0.02, 0.07, 6), 0xd0c0b0, T(0, 0.04, 0.01, 0, 0, s * -0.4));
    const om = new THREE.Shape(); om.moveTo(0, 0);
    om.lineTo(s * 0.5, 0.05); om.quadraticCurveTo(s * 0.4, 0.1, s * 0.48, 0.22); om.quadraticCurveTo(s * 0.34, 0.24, s * 0.3, 0.4);
    om.quadraticCurveTo(s * 0.12, 0.3, s * -0.06, 0.3); om.lineTo(0, 0);
    o.add('membrane', flatShape(om, 10), 0x3e1a52, T(0, 0.0, 0, -Math.PI / 2), (p, n, c) => { c.multiplyScalar(0.75 + 0.5 * Math.min(1, Math.abs(p.x) * 2)); if (elite && Math.abs(p.x) > 0.42) c.setHex(GOLD); });
  }
  return B;
}
// ---- goblin charger: hunched, huge head, long ears, hooked nose, tusks, leather vest, spiked club
function bpGoblin(elite) {
  const B = new Blueprint({ skin: 'skin', leather: 'leather', wood: 'wood', metal: 'metal', glow: 'glow', bone: 'bone', cloth: 'cloth' });
  const SK = 0x76ae46, SK_D = 0x4a7a2a;
  const body = B.part('body', null, [0, 0.5, 0]);
  body.add('skin', blob(1, (d) => 1 + 0.15 * Math.max(0, d.z) * Math.max(0, -d.y), 22, 16), SK, T(0, 0.32, 0.02, 0.35, 0, 0, 0.3, 0.33, 0.27), (p, n, c) => { if (n.z > 0.5) lerpHex(c, SK, 0x9ac86a, n.z - 0.5); });
  body.add('leather', lathe([[0.2, 0.62], [0.31, 0.5], [0.34, 0.3], [0.31, 0.08]], { seg: 28, phi0: Math.PI * 0.18, phiL: Math.PI * 1.64, fold: [6, () => 0.03] }), 0x7a4b2a, T(0, -0.02, -0.02, 0.35, 0, 0),
    (p, n, c) => c.multiplyScalar(0.75 + 0.3 * hash3(Math.round(p.y * 10), 0, Math.round(Math.atan2(p.x, p.z) * 3))));
  for (let i = 0; i < 4; i++) body.add('leather', sweep([[-0.05, 0.4 - i * 0.08, 0.27 + i * 0.01], [0.05, 0.4 - i * 0.08, 0.27 + i * 0.01]], 0.008, { rs: 4 }), 0x3a2010, T(0, 0, 0, 0.35, 0, 0)); // laces
  body.add('leather', tor(0.26, 0.04, Math.PI * 2, 8, 30), 0x4a2e18, T(0, 0.1, 0.03, Math.PI / 2 + 0.2, 0, 0, 1, 1.0, 1.05));
  body.add('metal', sbox(0.1, 0.08, 0.04, 0.4), elite ? GOLD : 0x8a8a7a, T(0, 0.15, 0.3, 0.2));
  body.add('leather', lathe([[0.27, 0.04], [0.3, -0.12], [0.33, -0.25]], { seg: 24, fn: (q) => { if (q.y < -0.15) q.y -= (Math.sin(Math.atan2(q.x, q.z) * 7) * 0.5 + 0.5) * 0.06; } }), 0x8a6a40);
  // shoulder pad with rivets
  body.add('leather', new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0x5a3a20, T(-0.32, 0.56, 0.0, 0, 0, 0.5, 1, 0.7, 1));
  for (let i = 0; i < 5; i++) body.add('metal', sph(1, 6, 4), elite ? GOLD : 0xa0a090, T(-0.32 - Math.cos(i * 0.6) * 0.12, 0.56 + Math.sin(i * 0.6) * 0.1 - 0.02, 0.05 + (i - 2) * 0.05, 0, 0, 0, 0.02));
  const head = B.part('head', 'body', [0, 0.72, 0.18]);
  head.add('skin', blob(1, (d) => 1 + 0.1 * Math.max(0, d.y) - 0.08 * Math.max(0, -d.y) * Math.max(0, d.z), 26, 18), SK, T(0, 0, 0, 0, 0, 0, 0.3, 0.27, 0.28));
  head.add('skin', sweep([[-0.18, 0.1, 0.18], [0, 0.13, 0.26], [0.18, 0.1, 0.18]], 0.055, { rs: 8 }), SK_D); // brow ridge
  head.add('skin', sweep([[0, 0.05, 0.26], [0, -0.02, 0.34], [0, -0.08, 0.38], [0, -0.13, 0.35]], [0.06, 0.07, 0.05, 0.02], { rs: 10 }), 0x6a9e3a); // hooked nose
  for (const s of [-1, 1]) {
    head.add('skin', sweep([[s * 0.24, 0.04, 0], [s * 0.42, 0.12, -0.06], [s * 0.6, 0.2, -0.16]], [0.09, 0.07, 0.003], { rs: 10, sx: 0.35 }), SK);
    head.add('skin', sweep([[s * 0.26, 0.05, 0.02], [s * 0.42, 0.125, -0.04], [s * 0.56, 0.19, -0.13]], [0.055, 0.045, 0.003], { rs: 8, sx: 0.25 }), 0xc87a6a, T(0, 0, 0.02));
    head.add('glow', sph(1, 12, 8), 0xffe040, T(s * 0.11, 0.06, 0.24, 0, s * 0.3, 0, 0.055, 0.045, 0.03));
    head.add('leather', sph(1, 8, 6), 0x101008, T(s * 0.11, 0.06, 0.27, 0, 0, 0, 0.012, 0.03, 0.01));
    head.add('bone', cone(0.03, 0.12, 8), 0xf0e6c8, T(s * 0.12, -0.12, 0.22, -0.2, 0, s * -0.2)); // tusks
    if (elite) head.add('metal', tor(0.04, 0.01, Math.PI * 2, 6, 12), GOLD, T(s * 0.5, 0.12, -0.1, 0, 0, Math.PI / 2));
  }
  head.add('leather', sph(1, 16, 10), 0x2a0a0a, T(0, -0.13, 0.22, 0, 0, 0, 0.15, 0.05, 0.06)); // grin
  for (let i = 0; i < 6; i++) head.add('bone', cone(0.018, 0.05, 5), 0xf4ecd8, T((i - 2.5) * 0.045, -0.105, 0.265 - Math.abs(i - 2.5) * 0.01, Math.PI));
  for (const [x, y, z] of [[0.15, 0.18, 0.18], [-0.2, -0.04, 0.17], [0.05, 0.22, 0.17]]) head.add('skin', sph(1, 8, 6), SK_D, T(x, y, z, 0, 0, 0, 0.025));
  for (let i = 0; i < 4; i++) head.add('leather', sweep([[(i - 1.5) * 0.04, 0.25, -0.05], [(i - 1.5) * 0.06, 0.34, -0.12], [(i - 1.5) * 0.08, 0.32, -0.24]], [0.02, 0.015, 0.003], { rs: 5 }), 0x2a1a10);
  if (elite) head.add('metal', lathe([[0.16, 0], [0.17, 0.06], [0.15, 0.1]], { seg: 20 }), GOLD, T(0, 0.22, -0.02, -0.15));
  for (const s of [-1, 1]) {
    const arm = B.part(s < 0 ? 'armL' : 'armR', 'body', [s * 0.3, 0.5, 0.06]);
    arm.add('skin', sweep([[0, 0, 0], [s * 0.08, -0.22, 0.02], [s * 0.1, -0.36, 0.14], [s * 0.08, -0.48, 0.26]], [0.075, 0.06, 0.055, 0.06], { rs: 10 }), SK);
    arm.add('skin', cyl(0.07, 0.065, 0.12, 12), 0x5a3a20, TY([s * 0.1, -0.38, 0.16], [0, -0.5, 0.6]));
    hand(arm, 'skin', [s * 0.08, -0.53, 0.3], [0, -0.3, 1], 0.08, SK, 3, 0.95, ['leather', 0x2a2a1a]);
    const leg = B.part(s < 0 ? 'legL' : 'legR', 'body', [s * 0.14, 0.0, 0]);
    leg.add('skin', sweep([[0, 0, 0], [s * 0.03, -0.2, 0.08], [s * 0.02, -0.42, -0.02]], [0.09, 0.07, 0.06], { rs: 10 }), SK);
    leg.add('skin', sph(1, 14, 10), SK_D, T(s * 0.02, -0.47, 0.08, 0, 0, 0, 0.09, 0.05, 0.16));
    for (let k = 0; k < 3; k++) leg.add('skin', cone(0.018, 0.05, 5), 0x2a2a1a, T(s * 0.02 + (k - 1) * 0.04, -0.48, 0.24, Math.PI / 2));
  }
  const club = B.part('club', 'armR', [0.08, -0.55, 0.32], [1.2, 0, 0]);
  club.add('wood', sweep([[0, -0.15, 0], [0.02, 0.2, 0.01], [-0.01, 0.5, 0.0], [0.0, 0.72, 0.02]], [0.04, 0.05, 0.09, 0.12], { rs: 12, ts: 30 }), 0x6a4422, null, (p, n, c) => c.multiplyScalar(0.75 + 0.35 * hash3(Math.round(p.y * 30), 1, 2)));
  for (let i = 0; i < 4; i++) club.add('wood', tor(0.048, 0.012, Math.PI * 2, 6, 12), 0x3a2414, T(0, -0.1 + i * 0.04, 0, Math.PI / 2 + 0.2));
  for (let i = 0; i < 9; i++) { const a = i * 2.4, y = 0.45 + (i % 3) * 0.1; club.add('metal', cone(0.025, 0.1, 6), elite ? GOLD : 0x9a9a90, TY([Math.sin(a) * 0.1, y, Math.cos(a) * 0.1], [Math.sin(a), 0.2, Math.cos(a)])); }
  return B;
}
// ---- wailing ghost: hooded translucent shroud with a ragged rippling hem, void face, wisp tails, glowing hands, a broken chain
function bpGhost(elite) {
  const B = new Blueprint({
    shroud: { r: 0.35, op: 0.6, side: true, e: 0x2a50b0, ei: 0.8, rim: 0x80b8ff, rimK: 1.6, nm: 'cloth', ns: 0.4, sway: true, swayTop: 1.0, swayBot: 0.1 },
    glow: 'glow', dark: 'gloss', metal: 'metal',
  });
  const body = B.part('body');
  // shroud: a narrow hooded head over a pinched neck, flaring into a long robe with deep vertical folds and a torn hem
  body.add('shroud', lathe([[0.001, 1.66], [0.17, 1.63], [0.28, 1.52], [0.31, 1.36], [0.27, 1.16], [0.33, 1.02], [0.42, 0.8], [0.5, 0.5], [0.58, 0.18]], {
    seg: 44, fold: [8, (y) => Math.max(0, 1.05 - y) * 0.11, 0.4],
    fn: (q) => { q.z += Math.max(0, q.y - 1.0) * 0.12; if (q.y < 0.5) { const a = Math.atan2(q.x, q.z); q.y -= (Math.sin(a * 7) * 0.5 + 0.5) * 0.18 * (0.5 - q.y) * 3 + Math.sin(a * 13) * 0.02; } } }),
  0xcfe4ff, null, (p, n, c) => { lerpHex(c, 0x5a78c8, 0xeaf6ff, (p.y - 0.1) / 1.3); c.multiplyScalar(0.8 + 0.25 * Math.max(0, n.y + 0.3)); });
  body.add('shroud', sweep([[0, 1.55, -0.02], [0, 1.72, -0.12], [0.05, 1.82, -0.3], [0.14, 1.74, -0.46]], [0.18, 0.11, 0.05, 0.005], { rs: 12 }), 0xcfe4ff); // hood tip
  // the hood opening: a thick cowl edge arching over the face and down both cheeks
  body.add('shroud', sweep([[-0.2, 1.06, 0.22], [-0.24, 1.28, 0.3], [-0.14, 1.47, 0.36], [0, 1.52, 0.39], [0.14, 1.47, 0.36], [0.24, 1.28, 0.3], [0.2, 1.06, 0.22]],
    [0.03, 0.06, 0.08, 0.085, 0.08, 0.06, 0.03], { rs: 10, ts: 40 }), 0xe8f4ff);
  // the void inside the hood, sunk back, with a cold glow deep inside
  body.add('dark', sph(1, 20, 14), 0x03040c, T(0, 1.26, 0.29, -0.15, 0, 0, 0.2, 0.25, 0.1));
  body.add('glow', sph(1, 12, 8), 0x1a2a6a, T(0, 1.22, 0.34, 0, 0, 0, 0.12, 0.14, 0.02));
  for (const s of [-1, 1]) body.add('glow', sph(1, 12, 8), elite ? 0xffd040 : 0xd8f0ff, T(s * 0.075, 1.31, 0.385, 0, 0, s * 0.45, 0.028, 0.055, 0.015)); // slanted eyes
  body.add('glow', sph(1, 14, 10), 0x6a8ae8, T(0, 1.14, 0.385, 0, 0, 0, 0.045, 0.085, 0.015)); // wailing mouth
  for (let i = 0; i < 3; i++) { const x = (i - 1) * 0.25; body.add('shroud', sweep([[x, 0.25, -0.2], [x * 1.3, 0.05, -0.45], [x * 1.1 + 0.1, -0.02, -0.75], [x * 0.8, 0.08, -0.95]], [0.12, 0.08, 0.04, 0.004], { rs: 10 }), 0x9ab8f0); }
  for (const s of [-1, 1]) {
    body.add('shroud', sweep([[s * 0.3, 1.1, 0.0], [s * 0.42, 0.95, 0.14], [s * 0.42, 0.88, 0.3]], [0.09, 0.1, 0.13], { rs: 12 }), 0xc8dcff);
    const h = B.part(s < 0 ? 'handL' : 'hand', 'body', [s * 0.42, 0.86, 0.36]);
    h.add('glow', sph(1, 14, 10), elite ? 0xffe08a : 0xa8c8ff, T(0, 0, 0, 0, 0, 0, 0.08, 0.1, 0.08));
    for (let k = 0; k < 3; k++) h.add('glow', sweep([[(k - 1) * 0.04, -0.04, 0.05], [(k - 1) * 0.06, -0.12, 0.1], [(k - 1) * 0.07, -0.2, 0.08]], [0.022, 0.016, 0.004], { rs: 5 }), elite ? 0xffe08a : 0xa8c8ff);
  }
  for (let i = 0; i < 4; i++) body.add('metal', tor(0.035, 0.01, Math.PI * 2, 6, 12), elite ? GOLD : 0x606878, T(-0.42, 0.74 - i * 0.06, 0.36, 0, i % 2 ? Math.PI / 2 : 0, 0));
  body.add('metal', tor(0.1, 0.022, Math.PI * 2, 6, 18), elite ? GOLD : 0x606878, T(-0.42, 0.86, 0.36, Math.PI / 2 - 0.4, 0, 0));
  return B;
}

// ---- knight (and the Iron Warden): plate armour with riveted edges, layered pauldrons, faulds, great helm with a glowing
// visor slit and plume, tabard, kite shield with heraldry, longsword. W = warden extras (horns, spikes, cape, rune core)
function bpKnight(elite, W = false) {
  const B = new Blueprint({
    metal: 'metal', cloth: 'cloth', leather: 'leather', glow: 'glow', dark: { base: 'gloss', r: 0.4 },
    cape: { base: 'cloth', side: true, sway: true, swayTop: 1.55, swayBot: 0.0 },
  });
  const ST = W ? 0x7a7f8c : STEEL, TR = elite || W ? GOLD : 0x8a8f9a, TAB = W ? 0x6a1414 : 0x8a2424;
  const body = B.part('body', null, [0, 0.9, 0]);
  // faulds: stacked plate bands round the hips
  for (let i = 0; i < 3; i++) body.add('metal', lathe([[0.37 + i * 0.04, 0.02 - i * 0.11], [0.4 + i * 0.045, -0.1 - i * 0.11]], { seg: 32 }), ST, null, (p, n, c) => { if (p.y < -0.08 - i * 0.11) c.setHex(TR); });
  body.add('cloth', tor(0.36, 0.035, Math.PI * 2, 8, 32), 0x3a2414, T(0, 0.03, 0, Math.PI / 2));
  body.add('metal', sbox(0.13, 0.1, 0.04, 0.4), GOLD, T(0, 0.03, 0.37));
  body.add('cloth', sbox(0.34, 0.62, 0.03, 0.15), TAB, T(0, -0.25, 0.44, 0.12, 0, 0), (p, n, c) => { if (p.y < -0.5) c.setHex(TR); if (Math.abs(p.x) < 0.04 && p.y > -0.45 && p.y < -0.05) c.setHex(GOLD); if (Math.abs(p.y + 0.2) < 0.035 && Math.abs(p.x) < 0.12) c.setHex(GOLD); });
  if (W) {
    for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2; body.add('metal', tor(0.05, 0.014, Math.PI * 2, 6, 12), 0x4a4a50, T(Math.sin(a) * 0.43, -0.05 + Math.sin(a * 2) * 0.03, Math.cos(a) * 0.43, 0, a + (i % 2) * Math.PI / 2, Math.PI / 2)); }
    const cape = B.part('capeP', 'body', [0, -0.9, 0]);
    cape.add('cape', lathe([[0.3, 1.55], [0.44, 1.4], [0.5, 1.0], [0.62, 0.4], [0.72, 0.05]], { seg: 28, phi0: Math.PI * 0.6, phiL: Math.PI * 0.8, fold: [6, (y) => (1.6 - y) * 0.05] }), 0x7a1a1a, T(0, 0, -0.08),
      (p, n, c) => { if (p.y < 0.14) c.setHex(GOLD).multiplyScalar(0.8); else lerpHex(c, 0x3a0808, 0x8a2020, p.y / 1.4); });
  }
  const torso = B.part('torso', 'body', [0, 0.02, 0]);
  torso.add('metal', lathe([[0.001, 0.0], [0.36, 0.02], [0.41, 0.2], [0.44, 0.4], [0.38, 0.56], [0.2, 0.64], [0.001, 0.65]], { seg: 36, fold: [2, (y) => 0.025, Math.PI / 2] }), ST,
    null, (p, n, c) => { c.multiplyScalar(0.8 + 0.25 * Math.max(0, n.z)); if (p.y < 0.035 || (p.y > 0.55 && p.y < 0.6)) c.setHex(TR); });
  torso.add('metal', sweep([[0, 0.05, 0.4], [0, 0.3, 0.46], [0, 0.55, 0.38]], 0.025, { rs: 6 }), ST); // centre ridge
  rivetRing(torso, 'metal', 0.07, 0.4, 16, TR, 0.02);
  torso.add('metal', lathe([[0.17, 0.62], [0.2, 0.68], [0.18, 0.76]], { seg: 24 }), ST, null, (p, n, c) => { if (p.y > 0.73) c.setHex(TR); }); // gorget
  if (W) {
    torso.add('glow', lathe([[0.001, -0.07], [0.08, 0.0], [0.001, 0.07]], { seg: 6 }), 0xff6030, T(0, 0.36, 0.44, Math.PI / 2, 0, 0));
    torso.add('metal', tor(0.1, 0.02, Math.PI * 2, 6, 20), GOLD, T(0, 0.36, 0.43));
  }
  // head: great helm
  const head = B.part('head', 'torso', [0, 0.92, 0.02]);
  head.add('metal', lathe([[0.001, 0.3], [0.13, 0.28], [0.2, 0.22], [0.225, 0.08], [0.225, -0.1], [0.21, -0.18], [0.001, -0.18]], { seg: 32 }), ST, null, (p, n, c) => { c.multiplyScalar(0.8 + 0.25 * Math.max(0, n.y + n.z * 0.5)); });
  head.add('dark', sbox(0.34, 0.035, 0.05, 0.3), 0x050505, T(0, 0.05, 0.205));
  head.add('dark', sbox(0.03, 0.14, 0.05, 0.3), 0x050505, T(0, -0.04, 0.215));
  for (const s of [-1, 1]) head.add('glow', sph(1, 10, 8), W ? 0xff5020 : 0xff4a2a, T(s * 0.075, 0.05, 0.215, 0, 0, 0, 0.032, 0.016, 0.01));
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) head.add('dark', sph(1, 6, 4), 0x050505, T(s * (0.06 + i * 0.03), -0.08 - (i % 2) * 0.03, 0.2 - i * 0.012, 0, 0, 0, 0.01));
  head.add('metal', sweep([[0, 0.3, 0.12], [0, 0.33, -0.02], [0, 0.29, -0.16]], 0.02, { rs: 6, sx: 0.4 }), TR); // crest
  head.add('metal', tor(0.225, 0.014, Math.PI * 2, 6, 32), TR, T(0, -0.16, 0, Math.PI / 2));
  if (!W) for (let i = 0; i < 3; i++) head.add('cloth', sweep([[0, 0.3, -0.02], [(i - 1) * 0.06, 0.48, -0.2], [(i - 1) * 0.1, 0.42, -0.45], [(i - 1) * 0.12, 0.2, -0.55]], [0.045, 0.06, 0.04, 0.005], { rs: 8 }), elite ? GOLD : 0xc0302a);
  else for (const s of [-1, 1]) head.add('leather', sweep([[s * 0.2, 0.12, 0], [s * 0.36, 0.2, -0.02], [s * 0.44, 0.42, 0.04], [s * 0.4, 0.6, 0.12]], [0.07, 0.055, 0.03, 0.004], { rs: 10 }), 0xd8ccb0, null, (p, n, c) => c.multiplyScalar(0.7 + 0.4 * ((Math.abs(p.x) * 30) % 1)));
  if (elite && !W) { head.add('metal', lathe([[0.19, 0.27], [0.21, 0.32], [0.19, 0.36]], { seg: 24 }), GOLD); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; head.add('metal', cone(0.03, 0.1, 6), GOLD, T(Math.sin(a) * 0.2, 0.4, Math.cos(a) * 0.2)); } }
  for (const s of [-1, 1]) {
    const arm = B.part(s < 0 ? 'armL' : 'armR', 'torso', [s * 0.43, 0.52, 0]);
    for (let k = 0; k < 3; k++) {
      const shell = new THREE.SphereGeometry(0.24 - k * 0.03, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.55);
      arm.add('metal', shell, ST, T(s * 0.02, 0.04 - k * 0.08, 0, 0, 0, -s * (0.35 + k * 0.12), 0.9, 0.6, 0.9), (p, n, c) => { if (p.y < 0.04 - k * 0.09 - 0.0) c.setHex(TR); });
    }
    rivetRing(arm, 'metal', 0.11, 0.17, 8, TR, 0.016);
    if (W) for (let k = 0; k < 3; k++) arm.add('metal', cone(0.045, 0.24, 8), 0x9a9aa4, TY([s * (0.08 + k * 0.04), 0.2 - k * 0.04, -0.08 + k * 0.08], [s * 0.6, 1, -0.2]));
    const el = [s * 0.06, -0.32, 0.06], wr = [s * 0.03, -0.56, 0.24];
    arm.add('metal', sweep([[0, -0.05, 0], el], [0.1, 0.085], { rs: 12 }), ST);
    arm.add('metal', sph(1, 12, 10), TR, T(...el, 0, 0, 0, 0.09));
    arm.add('metal', sweep([el, wr], [0.085, 0.075], { rs: 12 }), ST);
    arm.add('metal', lathe([[0.075, 0], [0.1, 0.06], [0.085, 0.1]], { seg: 16 }), TR, TY(wr, [0, -0.6, 0.8]));
    arm.add('metal', sbox(0.13, 0.1, 0.15, 0.4), 0x3a3a40, T(wr[0], wr[1] - 0.06, wr[2] + 0.06));
    const leg = B.part(s < 0 ? 'legL' : 'legR', 'body', [s * 0.18, -0.2, 0]);
    leg.add('metal', sweep([[0, 0.05, 0], [0, -0.3, 0.03]], [0.13, 0.11], { rs: 12 }), ST);
    leg.add('metal', sph(1, 12, 10), TR, T(0, -0.33, 0.07, 0, 0, 0, 0.1));
    leg.add('metal', cone(0.07, 0.08, 10), ST, T(0, -0.33, 0.14, Math.PI / 2));
    leg.add('metal', sweep([[0, -0.36, 0.02], [0, -0.62, -0.0]], [0.1, 0.09], { rs: 12 }), ST);
    leg.add('metal', sbox(0.17, 0.12, 0.34, 0.35), DSTEEL, T(0, -0.66, 0.08), (p, n, c) => { if (p.z > 0.2) c.setHex(ST); });
  }
  // shield: kite shape, quartered heraldry, steel rim, boss and emblem
  const shield = B.part('shield', 'armL', [-0.08, -0.5, 0.34]);
  const S = W ? 1.35 : 1;
  const ks = new THREE.Shape(); ks.moveTo(0, 0.5 * S); ks.quadraticCurveTo(0.42 * S, 0.5 * S, 0.42 * S, 0.25 * S); ks.quadraticCurveTo(0.4 * S, -0.25 * S, 0, -0.62 * S); ks.quadraticCurveTo(-0.4 * S, -0.25 * S, -0.42 * S, 0.25 * S); ks.quadraticCurveTo(-0.42 * S, 0.5 * S, 0, 0.5 * S);
  shield.add('leather', extrude(ks, 0.05, 0.02, { cs: 16 }), 0x6c2b2b, null, (p, n, c) => {
    const q = (p.x > 0) !== (p.y > 0.05); c.setHex(W ? (q ? 0x2a2a30 : 0x6a1414) : (q ? 0xe8dcc0 : 0x7a2424)); if (n.z < -0.5) c.setHex(0x4a3020);
  });
  const rimPts = ks.getSpacedPoints(48).map((p) => [p.x * 1.0, p.y, 0.045]);
  shield.add('metal', sweep(rimPts, 0.022, { rs: 6, ts: 96, cap: false }), TR);
  shield.add('metal', sph(1, 16, 10), TR, T(0, 0.05, 0.05, 0, 0, 0, 0.1, 0.1, 0.05));
  shield.add('metal', extrude(star5(0.14 * S, 0.06 * S), 0.02, 0.006), GOLD, T(0, -0.25 * S, 0.06));
  if (W) shield.add('metal', extrude(star5(0.1, 0.04), 0.02, 0.006), GOLD, T(0, 0.3, 0.06));
  // sword
  const sword = B.part('sword', 'armR', [0.03, -0.62, 0.3]);
  const L = W ? 1.5 : 1.15;
  const bl = new THREE.Shape(); bl.moveTo(-0.055, 0); bl.lineTo(0.055, 0); bl.lineTo(0.045, L * 0.85); bl.lineTo(0, L); bl.lineTo(-0.045, L * 0.85); bl.lineTo(-0.055, 0);
  sword.add('metal', extrude(bl, 0.012, 0.008, { bs: 1 }), 0xe8eef6, T(0, 0.1, 0, 0, Math.PI / 2, 0), (p, n, c) => { if (Math.abs(p.z) < 0.012 && p.y < L * 0.7) c.setHex(0x9aa4b4); });
  sword.add('metal', sweep([[-0.2, 0.06, 0], [-0.08, 0.1, 0], [0.08, 0.1, 0], [0.2, 0.06, 0]], [0.02, 0.03, 0.03, 0.02], { rs: 8 }), elite || W ? GOLD : 0x6a6a72, T(0, 0, 0, 0, Math.PI / 2, 0));
  sword.add('metal', cyl(0.025, 0.028, 0.2, 10), 0x2a1c14, T(0, -0.04, 0));
  sword.add('metal', sph(1, 12, 8), elite || W ? GOLD : 0x8a8a92, T(0, -0.16, 0, 0, 0, 0, 0.045));
  return B;
}
// ---- crypt spider: glossy chitin, patterned abdomen with a skull mark, 8 eyes, fangs, 8 hairy three-joint legs
function bpSpider(elite) {
  const B = new Blueprint({ chitin: 'chitin', glow: 'glow', bone: 'bone', fur: 'fur' });
  const CH = 0x2a2032, CH_L = 0x4a3a58, MARK = elite ? GOLD : 0xc02848;
  const body = B.part('body');
  body.add('chitin', blob(1, (d) => 1 + 0.06 * Math.sin(d.z * 10) * (1 - Math.abs(d.y)), 40, 28), CH, T(0, 0.58, -0.42, -0.2, 0, 0, 0.4, 0.34, 0.5), (p, n, c) => {
    // skull mark + side bands on the abdomen
    const u = p.x / 0.3, v = (p.z + 0.42) / 0.45;
    if (n.y > 0.35) {
      const skull = (u * u + (v - 0.15) ** 2 < 0.35) && !(((u - 0.3) ** 2 + (v - 0.25) ** 2) < 0.03 || ((u + 0.3) ** 2 + (v - 0.25) ** 2) < 0.03);
      if (skull || (Math.abs(u) < 0.25 && v < -0.2 && v > -0.6 && Math.abs(v * 10 % 2) > 1)) { c.setHex(MARK); return; }
    }
    if (Math.abs(Math.sin(p.z * 22)) > 0.85 && n.y < 0.4) c.setHex(CH_L);
  });
  for (let i = 0; i < 26; i++) { const a = i * 2.39, y = Math.cos(i * 0.9) * 0.8; const d = v3(Math.sin(a) * 0.4, y * 0.34, Math.cos(a) * 0.5 - 0.0); body.add('fur', cone(0.012, 0.09, 4), 0x6a5a70, TY([d.x, 0.58 + d.y, d.z - 0.42], [d.x, d.y, d.z])); }
  body.add('chitin', sph(1, 10, 8), CH_L, T(0, 0.45, -0.9, 0, 0, 0, 0.06, 0.05, 0.06)); // spinneret
  body.add('chitin', blob(1, (d) => 1 + 0.08 * Math.max(0, d.y), 28, 20), CH, T(0, 0.5, 0.12, 0, 0, 0, 0.26, 0.2, 0.3), (p, n, c) => { if (n.y > 0.7) c.setHex(CH_L); });
  body.add('chitin', sph(1, 20, 14), CH, T(0, 0.52, 0.36, 0, 0, 0, 0.16, 0.13, 0.12));
  const E = elite ? 0xffd040 : 0xff2a4a;
  for (const s of [-1, 1]) {
    body.add('glow', sph(1, 12, 8), E, T(s * 0.06, 0.58, 0.46, 0, 0, 0, 0.045));
    body.add('glow', sph(1, 10, 8), E, T(s * 0.13, 0.6, 0.42, 0, 0, 0, 0.03));
    body.add('glow', sph(1, 8, 6), E, T(s * 0.04, 0.64, 0.44, 0, 0, 0, 0.022));
    body.add('glow', sph(1, 8, 6), E, T(s * 0.15, 0.55, 0.4, 0, 0, 0, 0.02));
    body.add('chitin', sweep([[s * 0.06, 0.48, 0.44], [s * 0.07, 0.38, 0.52], [s * 0.04, 0.3, 0.5]], [0.05, 0.04, 0.03], { rs: 8 }), CH_L);
    body.add('bone', sweep([[s * 0.04, 0.31, 0.5], [s * 0.02, 0.24, 0.54], [s * -0.01, 0.22, 0.5]], [0.02, 0.012, 0.002], { rs: 6 }), elite ? GOLD : 0xe8e0d0);
    body.add('chitin', sweep([[s * 0.1, 0.45, 0.42], [s * 0.16, 0.38, 0.6], [s * 0.14, 0.25, 0.68]], [0.025, 0.02, 0.015], { rs: 6 }), CH);
  }
  for (let i = 0; i < 8; i++) {
    const s = i < 4 ? -1 : 1, k = i % 4;
    const leg = B.part('leg' + i, 'body', [s * 0.16, 0.5, 0.25 - k * 0.12], [0, s * (k - 1.5) * -0.42, 0]);
    const pts = [[0, 0, 0], [s * 0.32, 0.36, 0], [s * 0.62, 0.3, 0], [s * 0.9, -0.48, 0]];
    leg.add('chitin', sweep([pts[0], [s * 0.17, 0.22, 0], pts[1]], [0.055, 0.05, 0.04], { rs: 8 }), CH);
    leg.add('chitin', sweep([pts[1], [s * 0.47, 0.36, 0], pts[2]], [0.04, 0.036, 0.032], { rs: 8 }), CH_L);
    leg.add('chitin', sweep([pts[2], [s * 0.78, -0.05, 0], pts[3]], [0.032, 0.022, 0.006], { rs: 8 }), CH);
    leg.add('chitin', sph(1, 8, 6), elite ? GOLD : CH_L, T(...pts[1], 0, 0, 0, 0.05));
    leg.add('chitin', sph(1, 8, 6), elite ? GOLD : CH_L, T(...pts[2], 0, 0, 0, 0.04));
    for (let h = 0; h < 10; h++) {
      const seg = h < 5 ? [pts[1], pts[2]] : [pts[2], pts[3]], f = (h % 5) / 5 + 0.1;
      const p = v3(...seg[0]).lerp(v3(...seg[1]), f);
      leg.add('chitin', cone(0.008, 0.07, 3), 0x5a4a60, TY(p.toArray(), [s * 0.3, 1, (h % 2 ? 0.6 : -0.6)]));
    }
  }
  return B;
}
// ---- treasure chest / mimic
function bpChest(mimic) {
  const B = new Blueprint({ wood: 'wood', metal: 'metal', glow: 'glow', skin: { base: 'skin', phys: true, r: 0.3 }, bone: 'bone', dark: 'gloss' });
  const WD = 0x8a5a2e, WD2 = 0x6e4422, IRON = 0x4a4a52;
  const body = B.part('body');
  for (let i = 0; i < 3; i++) body.add('wood', sbox(1.18, 0.19, 0.78, 0.12), i % 2 ? WD : WD2, T(0, 0.1 + i * 0.195, 0), (p, n, c) => c.multiplyScalar(0.8 + 0.3 * hash3(Math.round(p.x * 3), i, 1)));
  for (const x of [-0.43, 0.43]) body.add('metal', sbox(0.1, 0.6, 0.82, 0.12), IRON, T(x, 0.3, 0));
  for (const x of [-0.6, 0.6]) for (const z of [-0.4, 0.4]) body.add('metal', sbox(0.06, 0.62, 0.06, 0.2), IRON, T(x, 0.3, z));
  for (const x of [-0.43, 0.43]) for (let k = 0; k < 3; k++) body.add('metal', sph(1, 6, 4), 0x9a9aa0, T(x, 0.12 + k * 0.18, 0.415, 0, 0, 0, 0.022));
  for (const s of [-1, 1]) body.add('metal', tor(0.08, 0.018, Math.PI, 6, 12), IRON, T(s * 0.61, 0.38, 0, 0, Math.PI / 2, Math.PI));
  body.add('metal', sbox(0.2, 0.24, 0.05, 0.3), GOLD, T(0, 0.48, 0.41));
  body.add('dark', sbox(0.04, 0.08, 0.02, 0.5), 0x050505, T(0, 0.46, 0.44));
  const lid = B.part('lid', 'body', [0, 0.6, -0.4]);
  lid.add('wood', new THREE.CylinderGeometry(0.4, 0.4, 1.18, 24, 1, false, 0, Math.PI), WD, T(0, 0, 0.4, 0, 0, Math.PI / 2), (p, n, c) => c.multiplyScalar(0.8 + 0.25 * Math.sin(Math.atan2(p.y, p.z - 0.4) * 12) ** 2));
  for (const x of [-0.43, 0.43]) lid.add('metal', tor(0.405, 0.04, Math.PI, 6, 20), IRON, T(x, 0, 0.4, 0, Math.PI / 2, 0, 1, 1, 1.4));
  lid.add('metal', sph(1, 12, 8), GOLD, T(0, 0.38, 0.6, 0, 0, 0, 0.07));
  if (mimic) {
    const teeth = B.part('teeth', 'body');
    teeth.add('skin', sbox(1.0, 0.1, 0.62, 0.3), 0x5a0a1a, T(0, 0.56, 0));
    for (let i = 0; i < 9; i++) teeth.add('bone', cone(0.045 + (i % 3) * 0.01, 0.16 + (i % 2) * 0.06, 6), 0xf5efe0, T(-0.48 + i * 0.12, 0.66, 0.36, 0, 0, 0));
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) teeth.add('bone', cone(0.04, 0.14, 6), 0xf5efe0, T(s * 0.54, 0.66, 0.24 - i * 0.16));
    for (const [x, z] of [[-0.5, 0.3], [0.5, 0.3], [-0.5, -0.3], [0.5, -0.3]]) teeth.add('bone', sweep([[x, 0.06, z], [x * 1.15, 0.02, z * 1.2], [x * 1.25, -0.0, z * 1.35 + 0.06]], [0.05, 0.03, 0.005], { rs: 6 }), 0x2a1a10);
    const tongue = B.part('tongue', 'teeth', [0, 0.58, 0.1]);
    tongue.add('skin', sweep([[0, 0, -0.2], [0, 0.04, 0.2], [0, -0.05, 0.5], [0.05, -0.3, 0.68], [0.0, -0.45, 0.62]], [0.12, 0.12, 0.1, 0.07, 0.02], { rs: 12, ts: 40, sy: 0.4 }), 0xd04060, null, (p, n, c) => { if (Math.abs(p.x) < 0.012) c.multiplyScalar(0.6); });
    const lt = B.part('lidTeeth', 'lid');
    for (let i = 0; i < 9; i++) lt.add('bone', cone(0.045 + ((i + 1) % 3) * 0.01, 0.15 + ((i + 1) % 2) * 0.06, 6), 0xf5efe0, T(-0.48 + i * 0.12, -0.06, 0.76, Math.PI, 0, 0));
    lt.add('skin', sbox(1.0, 0.06, 0.6, 0.3), 0x5a0a1a, T(0, -0.02, 0.42));
    for (const s of [-1, 1]) { lt.add('glow', sph(1, 12, 8), 0xffd030, T(s * 0.25, 0.1, 0.8, 0, 0, s * -0.35, 0.08, 0.045, 0.03)); lt.add('dark', sph(1, 8, 6), 0x100500, T(s * 0.25, 0.1, 0.825, 0, 0, 0, 0.015, 0.035, 0.01)); }
  }
  return B;
}

// ================================================================ BOSSES
function bpGloop() {
  const B = bpSlime(0x1fae3e, 0xa8ff8a, 'slime', false);
  B.matSpec.cloth = { base: 'cloth', side: true, sway: true, swayTop: 0.95, swayBot: 0.1 };
  B.matSpec.bone = 'bone';
  const body = B.part('regal', 'body');
  const cr = B.part('crown', 'body', [0, 1.0, 0]);
  cr.add('metal', lathe([[0.27, 0], [0.3, 0.05], [0.29, 0.14], [0.31, 0.16]], { seg: 30 }), GOLD, null, (p, n, c) => { if (p.y > 0.04 && p.y < 0.11) c.multiplyScalar(0.7); });
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    cr.add('metal', cone(0.055, 0.22, 8), GOLD, T(Math.sin(a) * 0.29, 0.26, Math.cos(a) * 0.29));
    cr.add('glow', sph(1, 8, 6), 0xffe080, T(Math.sin(a) * 0.29, 0.38, Math.cos(a) * 0.29, 0, 0, 0, 0.025));
    cr.add('glow', sph(1, 10, 8), [0xff3060, 0x40c0ff, 0x60ff80][i % 3], T(Math.sin(a) * 0.305, 0.08, Math.cos(a) * 0.305, 0, 0, 0, 0.035));
  }
  cr.add('cloth', sph(1, 20, 12), 0x8a1a3a, T(0, 0.12, 0, 0, 0, 0, 0.27, 0.15, 0.27));
  body.add('cloth', lathe([[0.3, 0.93], [0.52, 0.8], [0.7, 0.45], [0.74, 0.1]], { seg: 30, phi0: Math.PI * 0.62, phiL: Math.PI * 0.76, fold: [6, () => 0.04] }), 0x9a1a2a, T(0, 0, -0.06),
    (p, n, c) => { if (p.y < 0.2) c.setHex(0xf4f0e8); else lerpHex(c, 0x5a0a1a, 0xb02030, p.y); });
  body.add('metal', sweep([[-0.15, 0.32, -0.05], [0.0, 0.42, -0.1], [0.15, 0.55, -0.15]], [0.02, 0.025, 0.004], { rs: 6 }), STEEL); // swallowed sword
  body.add('bone', sph(1, 14, 10), IVORY, T(0.18, 0.25, -0.22, 0, 0, 0, 0.08, 0.075, 0.09));
  for (const s of [-1, 1]) body.add('cloth', sweep([[s * 0.02, 0.56, 0.6], [s * 0.12, 0.55, 0.6], [s * 0.2, 0.6, 0.55]], [0.03, 0.035, 0.01], { rs: 7 }), 0x2a5a1a); // regal mustache
  for (let i = 0; i < 4; i++) body.add('bone', cone(0.018, 0.04, 5), 0xffffff, T((i - 1.5) * 0.05, 0.48, 0.6, Math.PI));
  return B;
}
function bpMatriarch() {
  const B = new Blueprint({
    robe: { base: 'cloth', side: true, sway: true, swayTop: 1.4, swayBot: 0.0 }, cloth: { base: 'cloth', side: true }, bone: 'bone', metal: 'metal', glow: 'glow', dark: 'gloss', wood: 'wood',
  });
  const ROBE = 0x3a1f4a, BONE = 0xe8dcc0;
  const body = B.part('body');
  body.add('robe', lathe([[0.001, 0.0], [0.78, 0.0], [0.72, 0.4], [0.6, 0.9], [0.5, 1.4], [0.46, 1.5]], { seg: 40, fold: [8, (y) => (1.5 - y) * 0.06],
    fn: (q) => { if (q.y < 0.1) q.y += (Math.sin(Math.atan2(q.x, q.z) * 9) * 0.5 + 0.5) * 0.12; } }), ROBE, null, (p, n, c) => {
    lerpHex(c, 0x1a0a24, ROBE, p.y / 1.2); if (p.y > 0.16 && p.y < 0.24) c.setHex(GOLD).multiplyScalar(0.8);
  });
  body.add('cloth', lathe([[0.46, 1.48], [0.5, 1.8], [0.46, 2.1], [0.3, 2.42], [0.12, 2.5]], { seg: 32, phi0: Math.PI * 0.27, phiL: Math.PI * 1.46 }), ROBE, null, (p, n, c) => { const a = Math.atan2(p.x, p.z); if (Math.abs(Math.abs(a) - Math.PI * 0.27) < 0.12) c.setHex(GOLD).multiplyScalar(0.8); });
  // exposed ribcage + spine in the open front of the robe
  for (let i = 0; i < 9; i++) body.add('bone', sph(1, 10, 8), BONE, T(0, 1.55 + i * 0.09, 0.05, 0, 0, 0, 0.05, 0.04, 0.05));
  for (let i = 0; i < 5; i++) { const y = 2.25 - i * 0.12, w = 0.3 - Math.abs(i - 1.5) * 0.02; for (const s of [-1, 1]) body.add('bone', sweep([[s * 0.03, y, 0.0], [s * w, y - 0.03, 0.08], [s * (w - 0.05), y - 0.08, 0.25], [s * 0.05, y - 0.12, 0.3]], 0.028, { rs: 6 }), BONE); }
  body.add('glow', sph(1, 16, 12), 0x8aff5a, T(0, 1.95, 0.12, 0, 0, 0, 0.13)); // a soul-light inside the ribs
  // collar of bone spikes and skull pauldrons
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i - 4) * 0.28; body.add('bone', cone(0.06, 0.7 - Math.abs(i - 4) * 0.08, 8), BONE, TY([Math.sin(a) * 0.32, 2.5, Math.cos(a) * 0.32], [Math.sin(a) * 0.4, 1, Math.cos(a) * 0.4])); }
  for (const s of [-1, 1]) {
    body.add('bone', blob(1, (d) => 1 - 0.1 * Math.max(0, -d.y), 18, 12), BONE, T(s * 0.52, 2.38, 0.0, 0, s * 0.6, 0, 0.17, 0.16, 0.18));
    body.add('dark', sph(1, 8, 6), 0x050505, T(s * 0.52 + s * 0.06, 2.4, 0.13, 0, 0, 0, 0.04)); body.add('dark', sph(1, 8, 6), 0x050505, T(s * 0.52 - s * 0.03, 2.4, 0.15, 0, 0, 0, 0.04));
    body.add('metal', tor(0.17, 0.02, Math.PI * 2, 6, 20), GOLD, T(s * 0.52, 2.3, 0, Math.PI / 2));
    // sleeves
    body.add('cloth', sweep([[s * 0.48, 2.3, 0], [s * 0.66, 1.9, 0.12], [s * 0.7, 1.6, 0.3]], [0.13, 0.17, 0.26], { rs: 14 }), ROBE, null, (p, n, c) => { if (p.y < 1.66) c.setHex(GOLD).multiplyScalar(0.8); });
  }
  const head = B.part('head', 'body', [0, 2.75, 0.05]);
  head.add('bone', blob(1, (d) => 1 - 0.15 * Math.max(0, -d.y) * Math.max(0, d.z), 26, 18), BONE, T(0, 0, 0, 0, 0, 0, 0.3, 0.33, 0.32));
  head.add('bone', sweep([[-0.18, -0.15, 0.0], [-0.12, -0.32, 0.18], [0, -0.36, 0.25], [0.12, -0.32, 0.18], [0.18, -0.15, 0.0]], 0.045, { rs: 8, sx: 1.4 }), BONE); // long jaw
  for (let i = 0; i < 7; i++) head.add('bone', sbox(0.035, 0.06, 0.03, 0.5), 0xf8f0e0, T((i - 3) * 0.04, -0.18, 0.27 - Math.abs(i - 3) * 0.012));
  for (const s of [-1, 1]) { head.add('dark', sph(1, 12, 10), 0x050505, T(s * 0.12, 0.03, 0.24, 0, 0, s * 0.2, 0.09, 0.08, 0.06)); head.add('glow', sph(1, 10, 8), 0x9dff6a, T(s * 0.12, 0.03, 0.28, 0, 0, 0, 0.04)); }
  head.add('dark', cone(0.04, 0.08, 3), 0x050505, T(0, -0.08, 0.3, Math.PI, 0, 0));
  head.add('metal', tor(0.3, 0.04, Math.PI * 2, 8, 30), GOLD, T(0, 0.2, 0, Math.PI / 2));
  for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2; head.add('bone', cone(0.06, 0.45 + (i === 0 ? 0.2 : 0), 8), BONE, TY([Math.sin(a) * 0.28, 0.4, Math.cos(a) * 0.28], [Math.sin(a) * 0.3, 1, Math.cos(a) * 0.3])); head.add('glow', sph(1, 8, 6), 0x9dff6a, T(Math.sin(a) * 0.31, 0.2, Math.cos(a) * 0.31, 0, 0, 0, 0.035)); }
  for (const s of [-1, 1]) {
    const h = B.part(s < 0 ? 'handL' : 'handR', 'body', [s * 0.72, 1.55, 0.35]);
    hand(h, 'bone', [0, 0, 0], [s * 0.2, -0.6, 0.8], 0.14, BONE, 4, 0.5, ['metal', GOLD]);
  }
  const staff = B.part('staff', 'body', [0.85, 0.3, 0.3]);
  staff.add('wood', sweep([[0, 0, 0], [0.02, 1.0, 0.01], [-0.02, 2.0, 0.0], [0, 2.75, 0]], 0.05, { rs: 8 }), 0x2a2030);
  for (let i = 0; i < 4; i++) staff.add('bone', tor(0.065, 0.02, Math.PI * 2, 6, 14), BONE, T(0, 0.6 + i * 0.55, 0, Math.PI / 2));
  staff.add('bone', blob(1, (d) => 1 - 0.1 * Math.max(0, -d.y), 16, 12), BONE, T(0, 2.8, 0.0, 0, 0, 0, 0.13, 0.13, 0.14));
  staff.add('dark', sph(1, 8, 6), 0x050505, T(-0.05, 2.82, 0.11, 0, 0, 0, 0.03)); staff.add('dark', sph(1, 8, 6), 0x050505, T(0.05, 2.82, 0.11, 0, 0, 0, 0.03));
  staff.add('metal', tor(0.28, 0.025, Math.PI * 2, 6, 28), GOLD, T(0, 3.15, 0));
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2; staff.add('bone', cone(0.03, 0.14, 6), BONE, TY([Math.sin(a) * 0.28, 3.15 + Math.cos(a) * 0.28, 0], [Math.sin(a), Math.cos(a), 0])); }
  const orb = B.part('orb', 'staff', [0, 3.15, 0]);
  orb.add('glow', sph(1, 20, 14), 0xb6ff8a, T(0, 0, 0, 0, 0, 0, 0.18));
  const shards = B.part('shards', 'body', [0, 1.6, 0]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; shards.add('bone', lathe([[0.001, -0.18], [0.05, -0.04], [0.035, 0.1], [0.001, 0.2]], { seg: 5 }), BONE, T(Math.sin(a) * 1.25, Math.sin(i * 1.7) * 0.25, Math.cos(a) * 1.25, 0.3 * Math.sin(i), a, 0.4)); }
  return B;
}
function bpCrown() {
  const B = new Blueprint({ core: { phys: true, r: 0.15, e: 0x30104a, ei: 1, nm: 'chitin', ns: 0.3, rim: 0xb070ff, rimK: 1.3 }, glow: 'glow', eye: 'gloss', metal: 'metal',
    rune: { phys: true, r: 0.1, e: 0xa040ff, ei: 2 } });
  const body = B.part('body');
  body.add('core', blob(1.1, (d) => (1 + 0.04 * Math.sin(d.x * 9) * Math.sin(d.y * 7)) * (d.z > 0.62 ? 1 - Math.pow((d.z - 0.62) / 0.38, 1.5) * 0.4 : 1), 48, 36), 0x1a0d2e, T(0, 2.2, 0));
  // glowing veins over the core
  for (let k = 0; k < 9; k++) {
    const pts = [], a0 = k * 0.7, tilt = (k % 3 - 1) * 0.8;
    for (let i = 0; i <= 8; i++) { const a = a0 + i * 0.18 + Math.sin(i * 1.3 + k) * 0.05; const y = Math.sin(i * 0.4 + k) * 0.6 + tilt * 0.3; const r = Math.sqrt(Math.max(0.01, 1.11 * 1.11 - y * y)); pts.push([Math.sin(a + Math.PI) * r, 2.2 + y, Math.cos(a + Math.PI) * r]); }
    body.add('glow', sweep(pts, [0.03, 0.02, 0.01], { rs: 5, ts: 30 }), 0xb060ff);
  }
  // eyelids
  for (const s of [-1, 1]) body.add('core', new THREE.SphereGeometry(0.62, 28, 12, -Math.PI * 0.55, Math.PI * 1.1, s < 0 ? 0 : Math.PI * 0.62, Math.PI * 0.38), 0x2a1440, T(0, 2.25, 0.62, Math.PI / 2, 0, 0, 1, 1, 0.55));
  const eye = B.part('pupil', 'body', [0, 2.25, 0]);
  eye.add('eye', sph(1, 28, 20), 0xfff2d0, T(0, 0, 0.66, 0, 0, 0, 0.55, 0.55, 0.32), (p, n, c) => { if (hash3(Math.round(p.x * 14), Math.round(p.y * 14), 1) > 0.9) c.setHex(0xe08080); });
  eye.add('glow', tor(0.22, 0.06, Math.PI * 2, 10, 30), 0xffa020, T(0, 0, 0.95));
  eye.add('glow', sph(1, 18, 12), 0xffd060, T(0, 0, 0.95, 0, 0, 0, 0.22, 0.22, 0.06));
  eye.add('eye', sph(1, 14, 10), 0x120010, T(0, 0, 1.0, 0, 0, 0, 0.08, 0.19, 0.04));
  const crown = B.part('crown', 'body', [0, 3.25, -0.35], [-0.5, 0, 0]);
  crown.add('metal', lathe([[0.88, -0.17], [0.95, -0.12], [0.93, 0.0], [0.98, 0.12], [0.95, 0.18]], { seg: 48 }), GOLD, null, (p, n, c) => { if (p.y > -0.08 && p.y < 0.06) c.multiplyScalar(0.65); });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2, col = [0xff3060, 0x40c0ff, 0x60ff80, 0xffd040][i % 4];
    crown.add('metal', lathe([[0.001, 0], [0.17, 0.02], [0.12, 0.3], [0.04, 0.6], [0.001, 0.75]], { seg: 10 }), GOLD, T(Math.cos(a) * 0.93, 0.15, Math.sin(a) * 0.93));
    crown.add('glow', sph(1, 10, 8), col, T(Math.cos(a) * 1.0, 0.0, Math.sin(a) * 1.0, 0, 0, 0, 0.1));
    crown.add('metal', tor(0.12, 0.02, Math.PI * 2, 6, 14), GOLD, T(Math.cos(a) * 0.99, 0.0, Math.sin(a) * 0.99, 0, -a + Math.PI / 2, 0));
    crown.add('glow', sph(1, 8, 6), col, T(Math.cos(a) * 0.93, 0.92, Math.sin(a) * 0.93, 0, 0, 0, 0.06));
  }
  const tend = B.part('tendrils', 'body', [0, 1.4, 0]);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2, r = 0.55;
    const pts = [[Math.sin(a) * r, 0.2, Math.cos(a) * r], [Math.sin(a) * r * 1.4, -0.4, Math.cos(a) * r * 1.4], [Math.sin(a + 0.4) * r * 1.6, -0.9, Math.cos(a + 0.4) * r * 1.6], [Math.sin(a + 0.8) * r * 1.3, -1.3, Math.cos(a + 0.8) * r * 1.3]];
    tend.add('core', sweep(pts, [0.16, 0.12, 0.07, 0.01], { rs: 10 }), 0x2a1440, null, (p, n, c) => { if (p.y < -1.0) c.setHex(0x8a40ff); });
    tend.add('glow', sph(1, 8, 6), 0xc070ff, T(...pts[3], 0, 0, 0, 0.04));
  }
  const runes = B.part('runes', 'body', [0, 2.2, 0]);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; runes.add('rune', lathe([[0.001, -0.35], [0.18, 0], [0.001, 0.35]], { seg: 6 }), 0xc070ff, T(Math.cos(a) * 2.0, 0, Math.sin(a) * 2.0)); }
  return B;
}

// ================================================================ factory
const MONSTER_BOSS = new Set(['gloop', 'warden', 'matriarch', 'crown']);
const BUILD = {
  slime: (e) => bpSlime(0x22b844, 0x8aff6a, 'slime', e), slimelet: (e) => bpSlime(0x4ad84a, 0xd0ff8a, 'slimelet', e),
  skeleton: bpSkeleton, bat: bpBat, goblin: bpGoblin, ghost: bpGhost, knight: (e) => bpKnight(e), spider: bpSpider,
  mimic: () => bpChest(true), gloop: bpGloop, warden: () => bpKnight(false, true), matriarch: bpMatriarch, crown: bpCrown,
};
const PIVOT_NAMES = ['body', 'torso', 'head', 'jaw', 'armL', 'armR', 'legL', 'legR', 'bow', 'wl', 'wr', 'wlo', 'wro', 'club', 'hand', 'handL', 'handR',
  'shield', 'sword', 'capeP', 'lid', 'teeth', 'lidTeeth', 'tongue', 'crown', 'staff', 'orb', 'shards', 'pupil', 'tendrils', 'runes'];

export function makeMonsterModel(type, elite = false) {
  const I = bp(type + (elite ? '*' : ''), () => BUILD[type](elite)).instance();
  const m = { root: I.root, parts: I.parts, allMats: I.allMats, matsByKey: I.mats };
  for (const n of PIVOT_NAMES) if (I.parts[n]) m[n] = I.parts[n];
  if (type === 'spider') m.legs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => I.parts['leg' + i]);
  if (type === 'gloop') m.root.scale.setScalar(3.2);
  if (type === 'warden') m.root.scale.setScalar(2.3);
  if (type === 'bat') m.root.scale.setScalar(1.3);
  if (type === 'matriarch') { m.root.scale.setScalar(1.1); m.hands = [I.parts.handL, I.parts.handR]; const og = glowSprite(0x8aff5a, 2.4, 0.9); I.parts.orb.add(og); }
  if (type === 'ghost') { const g = glowSprite(0x7ab0ff, 2.4, 0.35); g.position.y = 0.9; m.body.add(g); }
  if (type === 'crown') { const g = glowSprite(0x8040ff, 6, 0.4); g.position.y = 2.2; m.body.add(g);
    for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const s = glowSprite(0xb060ff, 1.4, 0.8); s.position.set(Math.cos(a) * 2, 0, Math.sin(a) * 2); I.parts.runes.add(s); } }
  if (type === 'mimic') { m.teeth.visible = false; m.lidTeeth.visible = false; m.reveal = () => { m.teeth.visible = true; m.lidTeeth.visible = true; }; }
  if (!MONSTER_BOSS.has(type)) m.root.scale.multiplyScalar(1.15);
  if (elite) {
    m.root.scale.multiplyScalar(1.35);
    const aura = glowSprite(0xffc040, 2.8, 0.45); aura.position.y = 0.8; m.root.add(aura);
    m.aura = aura;
  }
  m.mats = I.allMats.filter((mt) => mt.emissive).map((mt) => {
    if (elite) { mt.emissive.setHex(0x2a1800); mt.emissiveIntensity = 1; }
    return { m: mt, e: mt.emissive.clone(), ei: mt.emissiveIntensity };
  });
  m.swayMats = I.allMats.filter((mt) => mt.userData.swayed);
  return m;
}
export function makeChest(mimic = false) {
  if (mimic) return makeMonsterModel('mimic');
  const I = bp('chest', () => bpChest(false)).instance();
  return { root: I.root, body: I.parts.body, lid: I.parts.lid, allMats: I.allMats };
}
// warm the shader programs and blueprints so the first spawn of each type does not hitch
export function prewarmModels() {
  for (const k of Object.keys(BUILD)) { bp(k, () => BUILD[k](false)); }
  bp('chest', () => bpChest(false));
}

// ---------------- pickups / props (unchanged look)
function std(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.45, metalness: o.m ?? 0.05, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
}
function phys(color, o = {}) {
  return new THREE.MeshPhysicalMaterial({ color, roughness: o.r ?? 0.2, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.15, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1 });
}
function mesh(geo, mat, x = 0, y = 0, z = 0, parent = null, shadow = true) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = shadow;
  if (parent) parent.add(m);
  return m;
}
export function makeBook(hex, glyph) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const cover = new THREE.MeshStandardMaterial({ map: TEX.bookCover(hex, glyph), roughness: 0.5 });
  const side = std(0x3a1f14, { r: 0.6 });
  mesh(box(0.7, 0.16, 0.9), [side, side, cover, side, side, side], 0, 0, 0, body);
  mesh(box(0.64, 0.12, 0.84), std(0xf4ead2, { r: 0.8 }), 0.03, 0, 0, body);
  const g = glowSprite(hex, 2.4, 0.8); root.add(g);
  return { root, body };
}
export function makeTome() { return makeBook(0xffd36b, '✚'); }
export function makeRelic(glyphHex = 0xffd36b) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  mesh(new THREE.IcosahedronGeometry(0.32, 2), phys(glyphHex, { e: glyphHex, ei: 0.6 }), 0, 0, 0, body);
  mesh(tor(0.45, 0.04, Math.PI * 2, 14, 36), std(0xf2c14a, { m: 0.9, r: 0.25 }), 0, 0, 0, body);
  root.add(glowSprite(glyphHex, 2.4, 0.8));
  return { root, body };
}
export function makeStairs() {
  const root = new THREE.Group();
  const stone = std(0x6a5d52, { r: 0.6 });
  for (let i = 0; i < 5; i++) {
    const m = mesh(cyl(1.6 - i * 0.28, 1.6 - i * 0.28, 0.25, 32), std(0x2a2220, { r: 0.8 }), 0, -0.1 - i * 0.22, 0, root, false);
    m.receiveShadow = true;
  }
  const ring = mesh(tor(1.7, 0.16, Math.PI * 2, 14, 36), stone, 0, 0.05, 0, root); ring.rotation.x = Math.PI / 2;
  const swirl = new THREE.Mesh(new THREE.CircleGeometry(1.5, 40), new THREE.MeshBasicMaterial({ map: TEX.ring, color: 0x8a6bff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }));
  swirl.rotation.x = -Math.PI / 2; swirl.position.y = 0.06; root.add(swirl);
  const g = glowSprite(0x8a6bff, 5, 0.6); g.position.y = 0.6; root.add(g);
  return { root, swirl };
}
