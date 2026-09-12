// Mine-shaft mobs: goblin (tier 1), rock golem and goblin general (tier 2).
import * as THREE from 'three';
import { Rig, HERO_PROPORTIONS } from './rig.js';
import { tube, ball, blob, cone, slab, lathe, shell, smooth, faceted } from './shapes.js';
import * as T from './textures.js';

/* ---------------- TIER 1: goblin ---------------- */
// Small, fast and crude, but they come in numbers.

export function buildGoblin() {
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
  const skin = '#6f9a4a';
  const rag = smooth(T.clothTex('#5a4632'));
  const hide = smooth(T.leatherTex('#4a3520'));
  const flesh = smooth(T.skinTex(skin));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#ffd23c', white: '#2a2a18', brow: '#2e3a1c',
      mouth: '#3a1418', glow: true, key: 'gob',
    })),
    torso: rag, upperArm: flesh, foreArm: flesh, hand: flesh,
    thigh: rag, shin: flesh, foot: hide,
  }, P);

  // long pointed ears and a hooked nose -- the whole silhouette of a goblin
  for (const s of [1, -1]) {
    const ear = cone(0.05, 0.26, flesh, 5, [s * 0.19, P.headR * 1.0, -0.02]);
    ear.rotation.set(0.2, 0, -s * 1.25);
    rig.neck.add(ear);
  }
  const nose = cone(0.045, 0.17, flesh, 5, [0, P.headR * 0.82, 0.18]);
  nose.rotation.x = Math.PI * 0.55;
  rig.neck.add(nose);
  rig.neck.add(blob(0.21, rag, [1.05, 0.55, 1.05], 6, 4, [0, P.headR * 1.42, -0.02]));

  // crude cleaver
  const rust = faceted(T.metalTex('#7a6a58'));
  const blade = new THREE.Group();
  blade.add(slab(0.10, 0.40, 0.03, rust, [0, 0.28, 0]));
  blade.add(slab(0.16, 0.16, 0.035, rust, [0.03, 0.40, 0]));
  blade.add(tube(0.028, 0.032, 0.16, hide, 5, [0, 0.04, 0]));
  blade.rotation.set(Math.PI * 0.38, 0, -0.12);
  blade.position.set(0, -0.09, 0.02);
  rig.arms.R.hand.add(blade);
  rig.gear = { blade };

  rig.rest = { shoulderX: -0.28, shoulderZ: 0.18, elbowXR: -0.75, elbowXL: -0.70 };
  rig.hunch = 0.28;
  rig.stats = {
    hp: 26, speed: 3.1, tier: 1, coin: [2, 6],
    damage: 11, attackRange: 1.6, attackCooldown: 1.2,
    windup: 0.28, strike: 0.12, recover: 0.30,
    sightRange: 15, sightAngle: 1.15, hearRange: 8,
    lookHeight: 0.95, hitRadius: 0.38,
    arrows: [0, 2],
  };
  rig.attackStyle = 'slash';
  return rig;
}

/* ---------------- TIER 2: rock golem ---------------- */
// Slow, enormously tough, and it THROWS. This is the one you fight from cover.

export function buildRockGolem() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.26,
    chestRTop: 0.46, chestRBot: 0.38, torsoH: 0.80, torsoSquashZ: 0.9,
    armRTop: 0.20, armRBot: 0.17, upperArmH: 0.44, foreArmH: 0.42,
    handR: 0.24,
    legRTop: 0.22, legRBot: 0.19, thighH: 0.34, shinH: 0.32,
    footL: 0.44, footW: 0.34, footH: 0.20,
    hipSpread: 0.24, shoulderX: 0.50, shoulderY: 0.66,
  };
  const rock = faceted(T.cliffTex('#6a6660'));
  const dark = faceted(T.cliffTex('#4a4740'));
  const core = new THREE.MeshLambertMaterial({
    map: T.flatTex('#ffb03c'), emissive: new THREE.Color('#e08010'),
    emissiveIntensity: 1.0, fog: true, flatShading: true,
  });

  const rig = new Rig({
    head: rock, torso: rock, upperArm: dark, foreArm: rock,
    hand: rock, thigh: dark, shin: rock, foot: dark,
  }, P);

  // slabs of rock stacked around the torso
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    rig.torso.add(blob(0.22 + (i % 2) * 0.08, rock, [1, 0.7, 1], 6, 4,
      [Math.cos(a) * 0.38, 0.28 + (i % 3) * 0.18, Math.sin(a) * 0.34]));
  }
  // the glowing heart between the plates -- and its weak point, visually
  rig.torso.add(blob(0.14, core, [1, 1, 1], 6, 5, [0, P.torsoH * 0.55, P.chestRTop * 0.82]));
  const light = new THREE.PointLight('#ffb03c', 1.4, 7, 2);
  light.position.set(0, P.torsoH * 0.55, P.chestRTop);
  rig.torso.add(light);

  rig.neck.add(blob(0.24, dark, [1.15, 0.42, 0.9], 6, 4, [0, P.headR * 1.05, 0.06]));
  for (const s of [1, -1]) {
    rig.neck.add(blob(0.05, core, [1, 1, 0.6], 5, 4, [s * 0.10, P.headR * 0.82, 0.20]));
  }
  for (const side of ['L', 'R']) {
    rig.arms[side].hand.add(blob(0.26, rock, [1, 0.9, 1], 6, 5, [0, -0.20, 0]));
  }

  rig.rest = { shoulderX: -0.14, shoulderZ: 0.24, elbowXR: -0.42, elbowXL: -0.42 };
  rig.stats = {
    hp: 260, speed: 1.3, tier: 2, coin: [34, 55],
    damage: 26, attackRange: 19, attackCooldown: 3.6,
    // a long wind-up on purpose: that is your window to get behind a rock
    windup: 0.95, strike: 0.18, recover: 0.75,
    sightRange: 22, sightAngle: 1.0, hearRange: 10,
    lookHeight: 1.75, hitRadius: 0.75,
    arrows: [0, 2],
    ranged: true,
    projectile: { kind: 'rock', color: '#6a6660', speed: 17, homing: false },
    commander: true, commandRange: 15, commandCooldown: 9,
  };
  rig.attackStyle = 'cast';
  return rig;
}

/* ---------------- TIER 2: goblin general ---------------- */
// A spear on legs. Long reach, fast jabs, and it drives the goblins forward.

export function buildGoblinGeneral() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.225,
    chestRTop: 0.235, chestRBot: 0.20, torsoH: 0.50,
    armRTop: 0.082, armRBot: 0.070, upperArmH: 0.28, foreArmH: 0.28,
    legRTop: 0.100, legRBot: 0.082, thighH: 0.28, shinH: 0.27,
    hipSpread: 0.11, shoulderX: 0.215, shoulderY: 0.42,
  };
  const skin = '#5f8a3f';
  const flesh = smooth(T.skinTex(skin));
  const mail = smooth(T.mailTex('#4a4a52'));
  const plate = faceted(T.metalTex('#7a6a48'));
  const cloak = smooth(T.clothTex('#7a2b2b'));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#ff5a3c', white: '#2a1a18', brow: '#243018',
      mouth: '#3a1418', glow: true, key: 'gen',
    })),
    torso: mail, upperArm: flesh, foreArm: plate, hand: flesh,
    thigh: mail, shin: plate, foot: smooth(T.leatherTex('#3a2a18')),
  }, P);

  for (const s of [1, -1]) {
    const ear = cone(0.05, 0.24, flesh, 5, [s * 0.20, P.headR * 1.0, -0.02]);
    ear.rotation.set(0.2, 0, -s * 1.3);
    rig.neck.add(ear);
  }
  const helm = lathe([
    [0.001, -0.14], [0.19, -0.13], [0.235, -0.02], [0.20, 0.10], [0.001, 0.16],
  ], plate, 6);
  helm.position.y = P.headR * 1.02;
  rig.neck.add(helm);
  for (const s of [1, -1]) {
    const horn = cone(0.04, 0.26, faceted(T.boneTex('#cfc0a0')), 5,
      [s * 0.19, P.headR * 1.12, 0]);
    horn.rotation.set(-0.2, 0, -s * 1.0);
    rig.neck.add(horn);
  }

  const cape = shell(0.24, 0.36, 0.72, Math.PI * 0.42, Math.PI * 1.16, cloak, 6);
  cape.position.set(0, P.shoulderY - 0.30, 0);
  rig.torso.add(cape);
  for (const side of ['L', 'R']) {
    rig.arms[side].shoulder.add(blob(0.14, plate, [1.1, 0.9, 1.1], 6, 4, [0, 0.01, 0]));
  }

  // the spear: long shaft, leaf blade, gripped at the balance point
  const spear = new THREE.Group();
  spear.add(tube(0.030, 0.034, 2.15, smooth(T.woodTex('#5a4028')), 5, [0, 0.55, 0]));
  const tip = cone(0.075, 0.34, faceted(T.metalTex('#9aa3ad')), 5, [0, 1.75, 0]);
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
    hp: 175, speed: 2.7, tier: 2, coin: [30, 50],
    damage: 22, attackRange: 3.4, attackCooldown: 1.7,
    windup: 0.38, strike: 0.14, recover: 0.40,
    sightRange: 19, sightAngle: 1.1, hearRange: 10,
    lookHeight: 1.30, hitRadius: 0.46,
    arrows: [1, 3],
    commander: true, commandRange: 17, commandCooldown: 7,
    charge: { range: 10, speed: 12, cooldown: 6 },
  };
  rig.attackStyle = 'jab';
  return rig;
}
