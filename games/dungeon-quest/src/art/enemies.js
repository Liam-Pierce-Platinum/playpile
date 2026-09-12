// Mobs.
//
// Tier 1: skeleton, blue slime, zombie.
// Tier 2: witch, corrupted knight -- one per camp, and they COMMAND the tier-1
//         mobs around them.
// Tier 3 (the dragon) lives in dragon.js.
//
// Stats are tuned against the player numbers in game/progress.js: a tier-1 mob
// should take 3-5 hits from a fresh hero, and kill the hero in 8-10.
import * as THREE from 'three';
import { Rig, blobShadow, HERO_PROPORTIONS } from './rig.js';
import { tube, ball, blob, cone, slab, lathe, shell, smooth, faceted, triCount, disposeTree } from './shapes.js';
import * as T from './textures.js';
import { NAMED } from './palette.js';
import { buildGoblin, buildRockGolem, buildGoblinGeneral } from './mineEnemies.js';
import {
  buildFrostSkeleton, buildAlbinoGoblin, buildRimeSlime,
  buildIceGolem, buildAlbinoGoblinKing, buildIceWitch,
} from './iceEnemies.js';
// NOTE: darkEnemies imports buildEnemy back out of this file. That cycle is
// safe only because both sides are hoisted FUNCTION DECLARATIONS -- switch
// either to a const arrow and the registry below reads undefined at load.
import {
  buildDarkSkeleton, buildDarkZombie, buildDarkGoblin, buildDarkSlime,
  buildDemon, buildDarkWitch, buildCorruptedDarkKnight, buildDarkGoblinKing,
  buildShadowGolem, buildShadowMonster,
} from './darkEnemies.js';

/* ---------------- skeleton ---------------- */

/** A heavy crossbow: stock, prod, string and a loaded bolt. */
function makeCrossbow() {
  const g = new THREE.Group();
  const wood = smooth(T.woodTex('#4a3520'));
  const iron = faceted(T.metalTex('#6a6058'));

  // stock runs forward along +Z
  const stock = tube(0.035, 0.048, 0.62, wood, 5, [0, 0, 0.16]);
  stock.rotation.x = Math.PI / 2;
  g.add(stock);
  g.add(slab(0.05, 0.13, 0.16, wood, [0, -0.08, -0.06]));      // grip
  // prod across the front
  for (const s of [1, -1]) {
    const limb = tube(0.016, 0.024, 0.26, iron, 4, [s * 0.13, 0, 0.40]);
    limb.rotation.set(0, 0, Math.PI / 2 + s * 0.22);
    g.add(limb);
  }
  g.add(tube(0.006, 0.006, 0.50, smooth(T.flatTex('#d8d3c4')), 3,
    [0, 0, 0.30]).rotateZ(Math.PI / 2));                        // string
  // loaded bolt
  g.add(tube(0.010, 0.010, 0.34, smooth(T.woodTex('#8b6a3a')), 4,
    [0, 0.035, 0.34]).rotateX(Math.PI / 2));
  g.add(cone(0.026, 0.08, iron, 4, [0, 0.035, 0.54]).rotateX(Math.PI / 2));
  return g;
}

/**
 * @param variant 'melee' (fists) or 'crossbow' (long range)
 */
function buildSkeleton(variant = 'melee') {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.20,
    chestRTop: 0.185, chestRBot: 0.135, torsoH: 0.54, torsoSquashZ: 0.72,
    armRTop: 0.052, armRBot: 0.042, upperArmH: 0.30, foreArmH: 0.29,
    handR: 0.072,
    legRTop: 0.062, legRBot: 0.050, thighH: 0.36, shinH: 0.35,
    footL: 0.24, footW: 0.15, footH: 0.11,
    hipSpread: 0.10, shoulderX: 0.185,
  };
  const bone = smooth(T.boneTex(NAMED.bone));
  const dark = smooth(T.boneTex(NAMED.boneDark));

  const rig = new Rig({
    head: smooth(T.skullTex(NAMED.bone)),
    torso: dark, upperArm: bone, foreArm: bone,
    hand: bone, thigh: bone, shin: bone, foot: dark,
  }, P);

  for (let i = 0; i < 5; i++) {
    const k = i / 4;
    const r = 0.20 - Math.abs(k - 0.35) * 0.10;
    const hoop = tube(r, r, 0.035, bone, 8, [0, 0.16 + i * 0.095, 0]);
    hoop.scale.z = 0.68;
    rig.torso.add(hoop);
  }
  rig.torso.add(tube(0.038, 0.045, P.torsoH, bone, 5, [0, P.torsoH / 2, -0.05]));
  const collar = tube(0.026, 0.026, 0.30, bone, 5, [0, P.torsoH - 0.02, 0.02]);
  collar.rotation.z = Math.PI / 2;
  rig.torso.add(collar);
  const pelvis = lathe([[0.001, 0], [0.15, 0.02], [0.17, 0.09], [0.10, 0.15], [0.001, 0.16]], bone, 8);
  pelvis.scale.z = 0.7;
  rig.torso.add(pelvis);
  rig.neck.add(blob(0.10, dark, [1.0, 0.55, 0.9], 7, 4, [0, P.headR * 0.42, 0.06]));

  if (variant === 'crossbow') {
    // a rusted helm and a quiver, so it reads as the dangerous one at a glance
    const rust = faceted(T.metalTex('#6a5a48'));
    const helm = lathe([
      [0.001, -0.16], [0.15, -0.15], [0.20, -0.05],
      [0.21, 0.04], [0.16, 0.13], [0.001, 0.17],
    ], rust, 8);
    helm.position.y = P.headR * 0.95;
    rig.neck.add(helm);
    rig.torso.add(tube(0.06, 0.05, 0.34, smooth(T.leatherTex('#4a3520')), 6,
      [-0.14, P.torsoH * 0.6, -0.14]));

    const bow = makeCrossbow();
    bow.rotation.set(-0.30, 0, 0.10);
    bow.position.set(0.02, -0.14, 0.04);
    rig.arms.R.hand.add(bow);
    rig.gear = { crossbow: bow };

    rig.rest = { shoulderX: -1.05, shoulderZ: 0.20, elbowXR: -0.55, elbowXL: -0.95 };
    rig.stats = {
      hp: 30, speed: 2.2, tier: 1, coin: [4, 8],
      damage: 15, attackRange: 20, attackCooldown: 3.4,
      // a long, obvious wind-up: this is the one you dodge, not tank
      windup: 0.80, strike: 0.15, recover: 0.60,
      sightRange: 24, sightAngle: 1.0, hearRange: 8,
      lookHeight: 1.15, hitRadius: 0.42,
      arrows: [2, 5],
      ranged: true,
      projectile: { kind: 'arrow', color: '#cfc7a8', speed: 26, homing: false },
    };
    rig.attackStyle = 'crossbow';
    return rig;
  }

  rig.rest = { shoulderX: -0.32, shoulderZ: 0.16, elbowXR: -0.85, elbowXL: -0.85 };
  rig.stats = {
    hp: 34, speed: 2.6, tier: 1, coin: [2, 5],
    damage: 13, attackRange: 1.6, attackCooldown: 1.4,
    windup: 0.34, strike: 0.14, recover: 0.34,
    sightRange: 16, sightAngle: 1.05, hearRange: 7,
    lookHeight: 1.15, hitRadius: 0.42,
    arrows: [1, 3],
  };
  rig.attackStyle = 'fists';
  return rig;
}

/* ---------------- zombie ---------------- */

function buildZombie() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.215,
    chestRTop: 0.275, chestRBot: 0.225, torsoH: 0.56,
    armRTop: 0.105, armRBot: 0.088, upperArmH: 0.31, foreArmH: 0.30,
    legRTop: 0.130, legRBot: 0.100, thighH: 0.30, shinH: 0.29,
    shoulderX: 0.255,
  };
  const flesh = smooth(T.rotTex(NAMED.zombieFlesh));
  const rag = smooth(T.clothTex(NAMED.zombieRag));

  const rig = new Rig({
    head: smooth(T.faceTex(NAMED.zombieFlesh, {
      eye: '#c8d84a', white: '#2a2a1c', brow: '#3a3020',
      mouth: '#3a1418', glow: true, key: 'zom',
    })),
    torso: rag, upperArm: rag, foreArm: flesh,
    hand: flesh, thigh: rag, shin: flesh,
    foot: smooth(T.leatherTex('#3a2f22')),
  }, P);

  rig.torso.add(blob(0.16, flesh, [1, 1.5, 0.55], 7, 5, [0.10, 0.36, 0.20]));
  for (let i = 0; i < 3; i++) {
    const hoop = tube(0.10, 0.10, 0.022, smooth(T.boneTex(NAMED.bone)), 6,
      [0.10, 0.28 + i * 0.085, 0.18]);
    hoop.scale.z = 0.4;
    rig.torso.add(hoop);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const len = 0.10 + (i % 3) * 0.07;
    rig.torso.add(slab(0.10, len, 0.03, rag,
      [Math.cos(a) * 0.24, -len / 2 + 0.02, Math.sin(a) * 0.18]));
  }
  rig.neck.add(blob(0.20, smooth(T.clothTex('#3a2a1a')), [1.05, 0.7, 1.05], 7, 4,
    [0.02, P.headR * 1.20, -0.03]));

  rig.rest = { shoulderX: -1.20, shoulderZ: 0.12, elbowXR: -0.34, elbowXL: -0.28 };
  rig.hunch = 0.22;
  rig.stats = {
    hp: 58, speed: 1.5, tier: 1, coin: [3, 7],
    damage: 18, attackRange: 1.7, attackCooldown: 2.0,
    windup: 0.55, strike: 0.16, recover: 0.55,
    sightRange: 13, sightAngle: 0.95, hearRange: 6,
    lookHeight: 1.15, hitRadius: 0.46,
    arrows: [1, 2],
  };
  rig.attackStyle = 'fists';
  return rig;
}

/* ---------------- blue slime ---------------- */

function buildSlime() {
  const root = new THREE.Group();
  const color = NAMED.slimeBlue;

  const geo = new THREE.SphereGeometry(0.40, 9, 7);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const k = 0.93 + ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) % 1 * 0.14;
    pos.setXYZ(i, pos.getX(i) * k * 1.08, pos.getY(i) * k * 0.86, pos.getZ(i) * k * 1.08);
  }
  geo.computeVertexNormals();

  const body = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({
    map: T.slimeTex(color), transparent: true, opacity: 0.87, fog: true,
  }));
  body.position.y = 0.35;

  const jelly = new THREE.Group();
  jelly.add(body);
  root.add(jelly);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.12, 0),
    new THREE.MeshLambertMaterial({
      map: T.flatTex('#1d4f96'),
      emissive: new THREE.Color('#1d4f96'), emissiveIntensity: 0.45, fog: true,
    })
  );
  core.position.y = 0.29;
  jelly.add(core);

  const eyes = new THREE.Group();
  eyes.position.y = 0.42;
  root.add(eyes);
  const white = smooth(T.flatTex('#f2f0e6'));
  const pupil = smooth(T.flatTex('#0e0e16'));
  for (const s of [1, -1]) {
    eyes.add(blob(0.075, white, [1, 1.15, 0.75], 7, 5, [s * 0.13, 0, 0.30]));
    eyes.add(blob(0.034, pupil, [1, 1.1, 0.8], 6, 4, [s * 0.135, -0.008, 0.355]));
  }

  const shadow = blobShadow(0.42);
  root.add(shadow);

  return {
    kind: 'slime',
    root, jelly, body, core, eyes, shadow,
    attackStyle: 'leap',
    stats: {
      hp: 26, speed: 2.1, tier: 1, coin: [1, 4],
      damage: 14, attackRange: 4.4, attackCooldown: 2.2,
      windup: 0.42, strike: 0.55, recover: 0.45,
      sightRange: 13, sightAngle: 1.4, hearRange: 8,
      lookHeight: 0.45, hitRadius: 0.44,
      arrows: [0, 1],
    },
    resetPose() { this.jelly.scale.set(1, 1, 1); },
    triCount() { return triCount(root); },
    dispose() { disposeTree(root); },
  };
}

/* ---------------- TIER 2: the witch ---------------- */
// A ranged commander. Hexes from a distance and screams orders at the mobs
// around her, which is far more dangerous than her own damage output.

function buildWitch() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.20,
    chestRTop: 0.20, chestRBot: 0.185, torsoH: 0.52,
    armRTop: 0.070, armRBot: 0.058, upperArmH: 0.28, foreArmH: 0.28,
    legRTop: 0.100, legRBot: 0.082, thighH: 0.30, shinH: 0.30,
    shoulderX: 0.205, handR: 0.085,
  };
  const robe = T.clothTex('#3a2450');
  const under = T.clothTex('#241634');
  const skin = '#8fae72';                       // sickly green

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#ffd23c', white: '#2a2418', brow: '#241a10',
      mouth: '#3a1826', glow: true, key: 'wit',
    })),
    torso: smooth(robe), upperArm: smooth(robe), foreArm: smooth(under),
    hand: smooth(T.skinTex(skin)),
    thigh: smooth(under), shin: smooth(under),
    foot: smooth(T.leatherTex('#2a1c14')),
  }, P);

  // crooked hat: each segment leans further than the last
  const hat = new THREE.Group();
  hat.position.y = P.headR * 1.5;
  rig.neck.add(hat);
  hat.add(lathe([
    [0.001, 0], [0.33, 0.012], [0.36, 0.05], [0.20, 0.062], [0.001, 0.072],
  ], smooth(robe), 10));
  let zo = 0, tilt = 0;
  const segs = [
    { r: 0.185, h: 0.24, y: 0.17 }, { r: 0.135, h: 0.22, y: 0.36 },
    { r: 0.085, h: 0.20, y: 0.53 }, { r: 0.040, h: 0.18, y: 0.68 },
  ];
  for (const s of segs) {
    tilt += 0.22;
    zo -= tilt * 0.10;
    const piece = cone(s.r, s.h, smooth(robe), 8, [zo * 0.4, s.y, zo]);
    piece.rotation.x = -tilt;
    piece.rotation.z = tilt * 0.35;
    hat.add(piece);
  }
  hat.add(tube(0.345, 0.345, 0.045, smooth(T.clothTex('#6a2f5a')), 10, [0, 0.06, 0]));

  // hooked nose and chin -- the whole silhouette of a witch
  const nose = cone(0.052, 0.20, smooth(T.skinTex(skin)), 6, [0, 0.18, 0.21]);
  nose.rotation.x = Math.PI * 0.52;
  rig.neck.add(nose);
  rig.neck.add(blob(0.062, smooth(T.skinTex(skin)), [1, 0.9, 0.9], 6, 4, [0, 0.02, 0.17]));
  // stringy hair
  const hairMat = smooth(T.clothTex('#6a6a72'));
  for (let i = 0; i < 6; i++) {
    const a = 0.6 + (i / 6) * Math.PI * 1.8;
    rig.neck.add(tube(0.020, 0.030, 0.34, hairMat, 4,
      [Math.cos(a) * 0.18, 0.10, Math.sin(a) * 0.18]));
  }

  const robeSkirt = shell(P.chestRBot * 1.05, P.chestRBot * 2.4, 0.80, 0, Math.PI * 2, smooth(robe), 9);
  robeSkirt.position.y = -0.36;
  rig.torso.add(robeSkirt);
  // ragged hem
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const len = 0.10 + (i % 3) * 0.08;
    rig.torso.add(slab(0.09, len, 0.03, smooth(robe),
      [Math.cos(a) * 0.44, -0.78 - len / 2, Math.sin(a) * 0.44]));
  }

  // gnarled staff with a hex orb
  const staff = new THREE.Group();
  const wood = smooth(T.woodTex('#3f2c1c'));
  staff.add(tube(0.028, 0.036, 1.5, wood, 5, [0, 0.40, 0]));
  staff.add(ball(0.05, wood, 5, 4, [0.04, 1.06, 0]));
  staff.add(ball(0.042, wood, 5, 4, [-0.04, 1.13, 0]));
  const orb = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.10, 0),
    new THREE.MeshLambertMaterial({
      map: T.flatTex('#7fe07a'), emissive: new THREE.Color('#4fd05a'),
      emissiveIntensity: 1.0, fog: true,
    })
  );
  orb.position.y = 1.24;
  staff.add(orb);
  staff.rotation.set(0.10, 0, 0.05);
  staff.position.set(0.01, -0.10, 0.02);
  rig.arms.R.hand.add(staff);
  rig.gear = { staff, orb };

  rig.rest = { shoulderX: -0.22, shoulderZ: 0.14, elbowXR: -0.60, elbowXL: -0.70 };
  rig.hunch = 0.26;
  rig.stats = {
    hp: 130, speed: 1.9, tier: 2, coin: [22, 38],
    damage: 17, attackRange: 14, attackCooldown: 2.4,
    windup: 0.55, strike: 0.18, recover: 0.55,
    sightRange: 20, sightAngle: 1.15, hearRange: 10,
    lookHeight: 1.30, hitRadius: 0.46,
    arrows: [0, 2],
    commander: true, commandRange: 16, commandCooldown: 7,
    ranged: true, projectile: { kind: 'bolt', color: '#7fe07a', speed: 15, homing: true },
  };
  rig.attackStyle = 'cast';
  return rig;
}

/* ---------------- TIER 2: the corrupted knight ---------------- */
// What the player could become. Heavy, armoured, and it CHARGES.

function buildCorruptedKnight() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.24,
    chestRTop: 0.30, chestRBot: 0.245, torsoH: 0.62,
    armRTop: 0.115, armRBot: 0.095, upperArmH: 0.30, foreArmH: 0.29,
    legRTop: 0.140, legRBot: 0.110, thighH: 0.36, shinH: 0.35,
    shoulderX: 0.275,
  };
  const plate = T.metalTex('#2e2a38');
  const darkPlate = T.metalTex('#1c1926');
  const mail = T.mailTex('#241f30');
  const glow = new THREE.MeshLambertMaterial({
    map: T.flatTex('#a05fd0'), emissive: new THREE.Color('#8a3fd0'),
    emissiveIntensity: 1.0, fog: true,
  });

  const rig = new Rig({
    head: smooth(T.flatTex('#0d0b14')),
    torso: faceted(plate), upperArm: smooth(mail), foreArm: faceted(plate),
    hand: smooth(T.leatherTex('#1c1610')),
    thigh: smooth(mail), shin: faceted(darkPlate), foot: faceted(darkPlate),
  }, P);

  // horned helm
  const helm = new THREE.Group();
  helm.position.y = P.headR * 0.92;
  rig.neck.add(helm);
  helm.add(lathe([
    [0.001, -0.23], [0.20, -0.22], [0.26, -0.10],
    [0.27, 0.02], [0.23, 0.15], [0.14, 0.22], [0.001, 0.245],
  ], faceted(plate), 9));
  helm.add(slab(0.30, 0.05, 0.10, new THREE.MeshBasicMaterial({
    map: T.flatTex('#c86fff'), fog: true,
  }), [0, 0.01, 0.215]));                       // glowing visor slit
  for (const s of [1, -1]) {
    const horn = cone(0.055, 0.34, faceted(darkPlate), 6, [s * 0.20, 0.16, -0.02]);
    horn.rotation.set(-0.35, 0, -s * 0.75);
    helm.add(horn);
  }

  // corrupted veins across the breastplate
  for (let i = 0; i < 4; i++) {
    const v = slab(0.035, 0.30, 0.03, glow,
      [-0.12 + i * 0.08, P.torsoH * 0.52, P.chestRTop * 0.92]);
    v.rotation.z = (i - 1.5) * 0.20;
    rig.torso.add(v);
  }
  const sc = shell(P.chestRTop * 1.05, P.chestRBot * 1.12, P.torsoH * 0.78,
    0, Math.PI * 2, smooth(T.clothTex('#3a1030')), 9);
  sc.position.y = P.torsoH * 0.40;
  sc.scale.z = P.torsoSquashZ;
  rig.torso.add(sc);

  for (const side of ['L', 'R']) {
    const s = side === 'L' ? 1 : -1;
    const sh = rig.arms[side].shoulder;
    sh.add(blob(P.armRTop * 1.9, faceted(plate), [1.2, 1.0, 1.2], 7, 5, [s * 0.015, 0.01, 0]));
    const spike = cone(0.05, 0.20, faceted(darkPlate), 5, [s * 0.14, 0.06, 0]);
    spike.rotation.z = -s * 0.9;
    sh.add(spike);
  }

  const skirt = shell(P.chestRBot * 1.08, P.chestRBot * 1.42, 0.36, 0, Math.PI * 2, smooth(mail), 9);
  skirt.position.y = -0.14;
  rig.torso.add(skirt);

  // a heavy blade, edge lit
  const sword = new THREE.Group();
  const steel = faceted(T.metalTex('#4a4658'));
  const blade = tube(0.045, 0.075, 1.05, steel, 4, [0, 0.66, 0]);
  blade.scale.z = 0.34;
  blade.rotation.y = Math.PI / 4;
  sword.add(blade);
  const edge = tube(0.016, 0.024, 0.98, glow, 4, [0, 0.66, 0]);
  edge.scale.z = 0.45;
  edge.rotation.y = Math.PI / 4;
  sword.add(edge);
  const tip = cone(0.075, 0.20, steel, 4, [0, 1.26, 0]);
  tip.scale.z = 0.34;
  tip.rotation.y = Math.PI / 4;
  sword.add(tip);
  const guard = tube(0.032, 0.042, 0.40, faceted(darkPlate), 6, [0, 0.14, 0]);
  guard.rotation.z = Math.PI / 2;
  sword.add(guard);
  sword.add(tube(0.034, 0.038, 0.22, smooth(T.leatherTex('#1c1610')), 6, [0, 0.02, 0]));
  sword.rotation.set(Math.PI * 0.40, 0, -0.10);
  sword.position.set(0, -0.10, 0.01);
  rig.arms.R.hand.add(sword);
  rig.gear = { sword };

  rig.rest = { shoulderX: -0.22, shoulderZ: 0.16, elbowXR: -0.60, elbowXL: -0.72 };
  rig.stats = {
    hp: 210, speed: 2.3, tier: 2, coin: [30, 50],
    damage: 26, attackRange: 2.7, attackCooldown: 2.0,
    windup: 0.50, strike: 0.18, recover: 0.55,
    sightRange: 18, sightAngle: 1.05, hearRange: 9,
    lookHeight: 1.45, hitRadius: 0.56,
    arrows: [1, 3],
    commander: true, commandRange: 15, commandCooldown: 8,
    charge: { range: 9, speed: 11, cooldown: 6 },
  };
  rig.attackStyle = 'slash';
  return rig;
}

/* ---------------- public API ---------------- */

export const ENEMY_KINDS = ['skeleton', 'crossbowSkeleton', 'slime', 'zombie'];
export const LEADER_KINDS = ['witch', 'corruptedKnight'];

export const ENEMY_INFO = {
  skeleton: { name: 'SKELETON', note: 'quick, swings its bony fists' },
  crossbowSkeleton: { name: 'BONE MARKSMAN', note: 'shoots from far off; dodge the shot' },
  goblin: { name: 'GOBLIN', note: 'quick and vicious, never alone' },
  rockGolem: { name: 'ROCK GOLEM', note: 'hurls boulders; fight it from cover' },
  goblinGeneral: { name: 'GOBLIN GENERAL', note: 'long spear, and it drives the pack' },
  slime: { name: 'BLUE SLIME', note: 'leaps at you every few seconds' },
  frostSkeleton: { name: 'FROST SKELETON', note: 'frozen where it fell, and it got up' },
  albinoGoblin: { name: 'ALBINO GOBLIN', note: 'bleached, starving, and quick' },
  rimeSlime: { name: 'RIME SLIME', note: 'leaps, and freezes you where it lands' },
  iceGolem: { name: 'ICE GOLEM', note: 'throws chunks; shatters anything that closes' },
  albinoGoblinKing: { name: 'ALBINO GOBLIN KING', note: 'ice spear, long reach' },
  iceWitch: { name: 'ICE WITCH', note: 'holds a stream of ice on you -- break the line' },
  darkSkeleton: { name: 'DARK SKELETON', note: 'raised twice over' },
  darkZombie: { name: 'DARK ZOMBIE', note: 'slower than it looks, and it hits harder' },
  darkGoblin: { name: 'DARK GOBLIN', note: 'quick, and it does not run away any more' },
  darkSlime: { name: 'DARK SLIME', note: 'leaps out of the dark' },
  demon: { name: 'DEMON', note: 'PITCHFORK -- a straight thrust; step ASIDE' },
  darkWitch: { name: 'DARK WITCH', note: 'hexes that follow you, and she rallies the dead' },
  corruptedDarkKnight: { name: 'DARK KNIGHT', note: 'charges, and commands the host' },
  darkGoblinKing: { name: 'DARK GOBLIN KING', note: 'long spear, drives the pack' },
  shadowGolem: { name: 'SHADOW GOLEM', note: 'hurls the dark; shatters anything that closes' },
  shadowMonster: { name: 'THE SHADOW', note: 'pours shadow from both hands -- break the line' },
  zombie: { name: 'ZOMBIE', note: 'slow and heavy, punches hard' },
  witch: { name: 'WITCH', note: 'hexes from range and commands the pack' },
  corruptedKnight: { name: 'CORRUPTED KNIGHT', note: 'charges, and rallies the dead' },
};

const BUILDERS = {
  darkSkeleton: buildDarkSkeleton,
  darkZombie: buildDarkZombie,
  darkGoblin: buildDarkGoblin,
  darkSlime: buildDarkSlime,
  demon: buildDemon,
  darkWitch: buildDarkWitch,
  corruptedDarkKnight: buildCorruptedDarkKnight,
  darkGoblinKing: buildDarkGoblinKing,
  shadowGolem: buildShadowGolem,
  shadowMonster: buildShadowMonster,
  frostSkeleton: buildFrostSkeleton,
  albinoGoblin: buildAlbinoGoblin,
  rimeSlime: buildRimeSlime,
  iceGolem: buildIceGolem,
  albinoGoblinKing: buildAlbinoGoblinKing,
  iceWitch: buildIceWitch,
  goblin: buildGoblin,
  rockGolem: buildRockGolem,
  goblinGeneral: buildGoblinGeneral,
  skeleton: () => buildSkeleton('melee'),
  crossbowSkeleton: () => buildSkeleton('crossbow'),
  slime: buildSlime,
  zombie: buildZombie,
  witch: buildWitch,
  corruptedKnight: buildCorruptedKnight,
};

export function buildEnemy(kind) {
  const e = BUILDERS[kind]();
  e.kind = kind;
  return e;
}
