// FROZEN MOUNTAIN MOBS.
//
// Tier 1: the frost skeleton, the albino goblin, the rime slime.
// Tier 2: the ice golem, the albino goblin king, the ice witch.
//
// Everything up here is the same shape as its warm-country cousin with the
// colour drained out of it and ice growing through it -- that is the point of
// the mountain. It was green once.
import * as THREE from 'three';
import { Rig, HERO_PROPORTIONS, blobShadow } from './rig.js';
import { tube, ball, blob, cone, slab, lathe, shell, smooth, faceted,
  triCount, disposeTree } from './shapes.js';
import * as T from './textures.js';

const ICE = '#bfe8ff';
const ICE_DEEP = '#6aa8d8';
const RIME = '#e8f6ff';

/** Shards of ice growing out of a body part. Used on nearly everything here. */
function rime(parent, n, r, len, seed = 0, color = ICE) {
  const mat = faceted(T.iceTex(color));
  mat.transparent = true;
  mat.opacity = 0.85;
  for (let i = 0; i < n; i++) {
    const a = ((i + seed) / n) * Math.PI * 2;
    const sh = cone(r, len * (0.7 + ((i + seed) % 3) * 0.2), mat, 5,
      [Math.cos(a) * r * 2.2, 0.04 * i, Math.sin(a) * r * 2.2]);
    sh.rotation.set(Math.cos(a) * 0.8, 0, -Math.sin(a) * 0.8);
    parent.add(sh);
  }
}

/* ---------------- TIER 1: frost skeleton ---------------- */
// Frozen where it fell, and it got up anyway.

export function buildFrostSkeleton() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.21,
    chestRTop: 0.175, chestRBot: 0.135, torsoH: 0.46, torsoSquashZ: 0.72,
    armRTop: 0.052, armRBot: 0.044, upperArmH: 0.27, foreArmH: 0.26,
    handR: 0.070,
    legRTop: 0.070, legRBot: 0.058, thighH: 0.27, shinH: 0.26,
    hipSpread: 0.09, shoulderX: 0.180, shoulderY: 0.40,
  };
  const bone = smooth(T.boneTex('#d8e8f0'));
  const frost = smooth(T.snowTex('#9cc8e0'));

  const rig = new Rig({
    head: smooth(T.skullTex('#d8e8f0')),
    torso: bone, upperArm: bone, foreArm: bone, hand: bone,
    thigh: bone, shin: bone, foot: frost,
  }, P);

  // ribs, and ice grown through them
  for (let i = 0; i < 4; i++) {
    rig.torso.add(tube(0.020, 0.020, P.chestRTop * 1.9, frost, 5,
      [0, 0.10 + i * 0.09, P.chestRTop * 0.52]));
  }
  rime(rig.torso, 5, 0.05, 0.34, 1);
  rime(rig.neck, 4, 0.04, 0.26, 2, RIME);

  const claw = faceted(T.iceTex(ICE));
  for (const side of ['L', 'R']) {
    const spike = cone(0.06, 0.42, claw, 5, [0, -0.16, 0.02]);
    spike.rotation.x = Math.PI;
    rig.arms[side].hand.add(spike);
  }

  rig.rest = { shoulderX: -0.30, shoulderZ: 0.15, elbowXR: -0.80, elbowXL: -0.80 };
  rig.stats = {
    hp: 40, speed: 2.5, tier: 1, coin: [3, 7],
    damage: 14, attackRange: 1.6, attackCooldown: 1.5,
    windup: 0.36, strike: 0.14, recover: 0.36,
    sightRange: 17, sightAngle: 1.05, hearRange: 8,
    lookHeight: 1.15, hitRadius: 0.42,
    arrows: [1, 3],
  };
  rig.attackStyle = 'fists';
  return rig;
}

/* ---------------- TIER 1: albino goblin ---------------- */
// The same goblin, bleached and half-starved, and twice as jumpy.

export function buildAlbinoGoblin() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.20,
    chestRTop: 0.185, chestRBot: 0.155, torsoH: 0.40, torsoSquashZ: 0.85,
    armRTop: 0.062, armRBot: 0.052, upperArmH: 0.24, foreArmH: 0.24,
    handR: 0.075,
    legRTop: 0.082, legRBot: 0.066, thighH: 0.22, shinH: 0.22,
    footL: 0.24, footW: 0.16, footH: 0.11,
    hipSpread: 0.09, shoulderX: 0.175, shoulderY: 0.34,
  };
  const skin = '#dfe6ea';
  const rag = smooth(T.clothTex('#8fa3ae'));
  const hide = smooth(T.leatherTex('#6a7078'));
  const flesh = smooth(T.skinTex(skin));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#e8465a', white: '#f0f4f6', brow: '#b8c4cc',
      mouth: '#7a3038', glow: true, key: 'albino',
    })),
    torso: rag, upperArm: flesh, foreArm: flesh, hand: flesh,
    thigh: rag, shin: flesh, foot: hide,
  }, P);

  for (const s of [1, -1]) {
    const ear = cone(0.05, 0.28, flesh, 5, [s * 0.19, P.headR * 1.0, -0.02]);
    ear.rotation.set(0.2, 0, -s * 1.25);
    rig.neck.add(ear);
  }
  const nose = cone(0.045, 0.17, flesh, 5, [0, P.headR * 0.82, 0.18]);
  nose.rotation.x = Math.PI * 0.55;
  rig.neck.add(nose);
  rig.neck.add(blob(0.21, rag, [1.05, 0.55, 1.05], 6, 4, [0, P.headR * 1.42, -0.02]));

  // an icicle lashed to a stick
  const shard = faceted(T.iceTex(ICE));
  const pick = new THREE.Group();
  pick.add(tube(0.026, 0.030, 0.34, hide, 5, [0, 0.10, 0]));
  const blade = cone(0.055, 0.40, shard, 5, [0, 0.44, 0]);
  pick.add(blade);
  pick.rotation.set(Math.PI * 0.40, 0, -0.12);
  pick.position.set(0, -0.09, 0.02);
  rig.arms.R.hand.add(pick);
  rig.gear = { blade: pick };

  rig.rest = { shoulderX: -0.28, shoulderZ: 0.18, elbowXR: -0.75, elbowXL: -0.70 };
  rig.hunch = 0.28;
  rig.stats = {
    hp: 30, speed: 3.3, tier: 1, coin: [3, 7],
    damage: 12, attackRange: 1.7, attackCooldown: 1.15,
    windup: 0.30, strike: 0.12, recover: 0.32,
    sightRange: 18, sightAngle: 1.15, hearRange: 10,
    lookHeight: 1.05, hitRadius: 0.40,
    arrows: [1, 3],
  };
  rig.attackStyle = 'fists';
  return rig;
}

/* ---------------- TIER 1: rime slime ---------------- */
// It leaps like the blue one. It also freezes you where you land.

export function buildRimeSlime() {
  const root = new THREE.Group();

  // same lumpy sphere as the blue slime, so the two read as the same creature
  const geo = new THREE.SphereGeometry(0.40, 9, 7);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.93 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.14;
    pos.setXYZ(i, pos.getX(i) * k * 1.08, pos.getY(i) * k * 0.86, pos.getZ(i) * k * 1.08);
  }
  geo.computeVertexNormals();

  const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    map: T.slimeTex('#a8dcf0'), transparent: true, opacity: 0.84, fog: true,
  }));
  body.position.y = 0.35;

  const jelly = new THREE.Group();
  jelly.add(body);
  root.add(jelly);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.13, 0),
    new THREE.MeshLambertMaterial({
      map: T.iceTex(ICE_DEEP),
      emissive: new THREE.Color(ICE_DEEP), emissiveIntensity: 0.5, fog: true,
    })
  );
  core.position.y = 0.29;
  jelly.add(core);
  rime(jelly, 6, 0.05, 0.28, 3, RIME);

  const eyes = new THREE.Group();
  eyes.position.y = 0.42;
  root.add(eyes);
  const white = smooth(T.flatTex('#eaf6fc'));
  const pupil = smooth(T.flatTex('#12303f'));
  for (const s2 of [1, -1]) {
    eyes.add(blob(0.075, white, [1, 1.15, 0.75], 7, 5, [s2 * 0.13, 0, 0.30]));
    eyes.add(blob(0.034, pupil, [1, 1.1, 0.8], 6, 4, [s2 * 0.135, -0.008, 0.355]));
  }

  const shadow = blobShadow(0.42);
  root.add(shadow);

  return {
    kind: 'rimeSlime',
    root, jelly, body, core, eyes, shadow,
    attackStyle: 'leap',
    stats: {
      hp: 32, speed: 2.4, tier: 1, coin: [3, 7],
      damage: 12, attackRange: 5.0, attackCooldown: 2.4,
      windup: 0.44, strike: 0.55, recover: 0.45,
      sightRange: 14, sightAngle: 1.4, hearRange: 8,
      lookHeight: 0.45, hitRadius: 0.44,
      arrows: [0, 1],
      // the reason it is not just a blue slime
      damageType: 'ice', freezeTime: 2.0,
    },
    resetPose() { this.jelly.scale.set(1, 1, 1); },
    triCount() { return triCount(root); },
    dispose() { disposeTree(root); },
  };
}

/* ---------------- TIER 2: ice golem ---------------- */
// Punches you at range with thrown blocks, and shatters you up close.

export function buildIceGolem() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.24,
    chestRTop: 0.36, chestRBot: 0.30, torsoH: 0.62, torsoSquashZ: 1.0,
    armRTop: 0.135, armRBot: 0.115, upperArmH: 0.34, foreArmH: 0.34,
    handR: 0.155,
    legRTop: 0.155, legRBot: 0.135, thighH: 0.28, shinH: 0.28,
    footL: 0.40, footW: 0.28, footH: 0.18,
    hipSpread: 0.17, shoulderX: 0.36, shoulderY: 0.52,
  };
  const ice = faceted(T.iceTex('#9fd0ea'));
  ice.transparent = true;
  ice.opacity = 0.92;
  const deep = faceted(T.iceTex(ICE_DEEP));
  const core = new THREE.MeshBasicMaterial({ map: T.flatTex('#e8faff'), fog: true });

  const rig = new Rig({
    head: deep, torso: ice, upperArm: ice, foreArm: ice, hand: deep,
    thigh: ice, shin: ice, foot: deep,
  }, P);

  // slabs of ice stacked around the torso
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    rig.torso.add(blob(0.22 + (i % 2) * 0.08, ice, [1, 0.7, 1], 6, 4,
      [Math.cos(a) * 0.38, 0.28 + (i % 3) * 0.18, Math.sin(a) * 0.34]));
  }
  // the frozen heart
  rig.torso.add(blob(0.14, core, [1, 1, 1], 6, 5, [0, P.torsoH * 0.55, P.chestRTop * 0.82]));
  const light = new THREE.PointLight('#9fd0ea', 1.6, 9, 2);
  light.position.set(0, P.torsoH * 0.55, P.chestRTop);
  rig.torso.add(light);

  rig.neck.add(blob(0.24, deep, [1.15, 0.42, 0.9], 6, 4, [0, P.headR * 1.05, 0.06]));
  for (const s of [1, -1]) {
    rig.neck.add(blob(0.05, core, [1, 1, 0.6], 5, 4, [s * 0.10, P.headR * 0.82, 0.20]));
  }
  rime(rig.neck, 5, 0.05, 0.40, 1, RIME);
  for (const side of ['L', 'R']) {
    rig.arms[side].hand.add(blob(0.26, ice, [1, 0.9, 1], 6, 5, [0, -0.20, 0]));
    rime(rig.arms[side].shoulder, 4, 0.06, 0.42, 2, RIME);
  }

  rig.rest = { shoulderX: -0.14, shoulderZ: 0.24, elbowXR: -0.42, elbowXL: -0.42 };
  rig.stats = {
    hp: 280, speed: 1.4, tier: 2, coin: [40, 62],
    // Ranged is the default: it lobs chunks. Get inside that and it swings.
    damage: 28, attackRange: 18, attackCooldown: 3.4,
    windup: 0.90, strike: 0.18, recover: 0.72,
    sightRange: 24, sightAngle: 1.0, hearRange: 11,
    lookHeight: 1.75, hitRadius: 0.78,
    arrows: [0, 2],
    ranged: true,
    projectile: { kind: 'ice', color: '#bfe8ff', speed: 16, homing: false },
    damageType: 'ice', freezeTime: 2.4,
    // and a shatter for anything that closes
    melee: { range: 2.6, damage: 34 },
    commander: true, commandRange: 16, commandCooldown: 9,
  };
  rig.attackStyle = 'cast';
  return rig;
}

/* ---------------- TIER 2: albino goblin king ---------------- */
// The goblin general's pale cousin, with an ice spear instead of steel.

export function buildAlbinoGoblinKing() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.225,
    chestRTop: 0.235, chestRBot: 0.20, torsoH: 0.50,
    armRTop: 0.082, armRBot: 0.070, upperArmH: 0.28, foreArmH: 0.28,
    legRTop: 0.100, legRBot: 0.082, thighH: 0.28, shinH: 0.27,
    hipSpread: 0.11, shoulderX: 0.215, shoulderY: 0.42,
  };
  const skin = '#e6ecf0';
  const flesh = smooth(T.skinTex(skin));
  const mail = smooth(T.mailTex('#7d8b95'));
  const plate = faceted(T.metalTex('#aebcc6'));
  const cloak = smooth(T.clothTex('#3f5f7a'));
  const shard = faceted(T.iceTex(ICE));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#e8465a', white: '#f2f6f8', brow: '#c0ccd4',
      mouth: '#7a3038', glow: true, key: 'king',
    })),
    torso: mail, upperArm: flesh, foreArm: plate, hand: flesh,
    thigh: mail, shin: plate, foot: smooth(T.leatherTex('#59626a')),
  }, P);

  for (const s of [1, -1]) {
    const ear = cone(0.05, 0.26, flesh, 5, [s * 0.20, P.headR * 1.0, -0.02]);
    ear.rotation.set(0.2, 0, -s * 1.3);
    rig.neck.add(ear);
  }
  // a crown of icicles rather than a helm -- it is a king, up here
  const crown = lathe([
    [0.001, -0.12], [0.20, -0.11], [0.24, 0.02], [0.21, 0.09], [0.001, 0.11],
  ], plate, 6);
  crown.position.y = P.headR * 1.02;
  rig.neck.add(crown);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const pt = cone(0.035, 0.24 + (i % 2) * 0.10, shard, 5,
      [Math.cos(a) * 0.20, P.headR * 1.18, Math.sin(a) * 0.20]);
    pt.rotation.set(Math.cos(a) * 0.28, 0, -Math.sin(a) * 0.28);
    rig.neck.add(pt);
  }

  const cape = shell(0.24, 0.36, 0.72, Math.PI * 0.42, Math.PI * 1.16, cloak, 6);
  cape.position.set(0, P.shoulderY - 0.30, 0);
  rig.torso.add(cape);
  for (const side of ['L', 'R']) {
    rig.arms[side].shoulder.add(blob(0.14, plate, [1.1, 0.9, 1.1], 6, 4, [0, 0.01, 0]));
  }

  // the ice spear
  const spear = new THREE.Group();
  spear.add(tube(0.030, 0.034, 2.15, smooth(T.woodTex('#59626a')), 5, [0, 0.55, 0]));
  const tip = cone(0.085, 0.46, shard, 5, [0, 1.80, 0]);
  tip.scale.z = 0.45;
  spear.add(tip);
  spear.add(tube(0.05, 0.05, 0.10, plate, 6, [0, 1.55, 0]));
  spear.add(blob(0.05, plate, [1, 0.8, 1], 5, 4, [0, -0.55, 0]));
  spear.rotation.set(Math.PI * 0.44, 0, -0.08);
  spear.position.set(0, -0.10, 0.02);
  rig.arms.R.hand.add(spear);
  rig.gear = { spear };

  rig.rest = { shoulderX: -0.26, shoulderZ: 0.16, elbowXR: -0.62, elbowXL: -0.72 };
  rig.stats = {
    hp: 200, speed: 2.8, tier: 2, coin: [36, 58],
    damage: 24, attackRange: 3.6, attackCooldown: 1.6,
    windup: 0.36, strike: 0.14, recover: 0.38,
    sightRange: 20, sightAngle: 1.1, hearRange: 11,
    lookHeight: 1.30, hitRadius: 0.46,
    arrows: [1, 3],
    damageType: 'ice', freezeTime: 1.6,
    commander: true, commandRange: 18, commandCooldown: 7,
    charge: { range: 11, speed: 12, cooldown: 6 },
  };
  rig.attackStyle = 'jab';
  return rig;
}

/* ---------------- TIER 2: ice witch ---------------- */
// She does not throw. She opens her hands and a STREAM comes out, and it does
// not stop until she does -- so you break the line of it, not the timing.

export function buildIceWitch() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.205,
    chestRTop: 0.195, chestRBot: 0.165, torsoH: 0.48,
    armRTop: 0.060, armRBot: 0.050, upperArmH: 0.28, foreArmH: 0.28,
    legRTop: 0.085, legRBot: 0.070, thighH: 0.28, shinH: 0.27,
    hipSpread: 0.09, shoulderX: 0.185, shoulderY: 0.40,
  };
  const skin = '#cfe0ea';
  const robe = smooth(T.clothTex('#2f5a7a'));
  const trim = smooth(T.clothTex('#7fb8d8'));
  const flesh = smooth(T.skinTex(skin));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#8fe8ff', white: '#1c3040', brow: '#8fa6b4',
      mouth: '#5a6a78', glow: true, key: 'icewitch',
    })),
    torso: robe, upperArm: robe, foreArm: flesh, hand: flesh,
    thigh: robe, shin: robe, foot: smooth(T.leatherTex('#3a4a56')),
  }, P);

  // a long robe skirt, and a tall frozen hat
  const skirt = lathe([
    [0.19, 0], [0.30, -0.34], [0.40, -0.70], [0.42, -0.78], [0.001, -0.80],
  ], robe, 6);
  skirt.position.y = 0.02;
  rig.torso.add(skirt);

  const hat = lathe([
    [0.001, 0.86], [0.07, 0.52], [0.14, 0.22], [0.22, 0.03], [0.40, -0.02], [0.001, -0.05],
  ], trim, 6);
  hat.position.y = P.headR * 1.05;
  hat.rotation.z = 0.10;
  rig.neck.add(hat);
  rime(rig.neck, 4, 0.04, 0.28, 2, RIME);

  // a rimed staff, and frost gathering in the free hand
  const staff = new THREE.Group();
  staff.add(tube(0.026, 0.030, 1.9, smooth(T.woodTex('#4a5a64')), 5, [0, 0.42, 0]));
  const head = blob(0.13, faceted(T.iceTex(ICE)), [1, 1.2, 1], 6, 5, [0, 1.42, 0]);
  staff.add(head);
  rime(staff, 5, 0.045, 0.30, 1, RIME);
  const glow = new THREE.PointLight('#8fe8ff', 1.5, 8, 2);
  glow.position.y = 1.42;
  staff.add(glow);
  staff.rotation.set(Math.PI * 0.46, 0, -0.10);
  staff.position.set(0, -0.10, 0.02);
  rig.arms.R.hand.add(staff);
  rig.gear = { staff, glow };

  rig.rest = { shoulderX: -0.24, shoulderZ: 0.14, elbowXR: -0.70, elbowXL: -0.66 };
  rig.stats = {
    hp: 150, speed: 2.2, tier: 2, coin: [34, 56],
    // the STREAM: a cone she holds on you, resolved every tick like dragonfire
    damage: 8, attackRange: 3.0, attackCooldown: 3.6,
    windup: 0.70, strike: 0.90, recover: 0.60,
    breathRange: 13.0, breathAngle: 0.24, breathDamage: 7,
    breathColor: '#9fe4ff', breathHot: '#ffffff', breathCool: '#2f6f9a',
    breathType: 'ice', freezeTime: 2.6,
    sightRange: 22, sightAngle: 1.2, hearRange: 12,
    lookHeight: 1.35, hitRadius: 0.44,
    arrows: [1, 2],
    commander: true, commandRange: 16, commandCooldown: 8,
  };
  rig.attackStyle = 'cast';
  return rig;
}
