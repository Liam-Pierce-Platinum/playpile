// THE BLACK DRAGON'S HOST.
//
// Most of level four's rank and file are creatures you have already fought,
// taken over: same bones, same silhouette, drained of colour and lit from
// inside by something purple. That is deliberate -- you should recognise them
// and then notice what is wrong with them.
//
// Two things here are genuinely new: the DEMON, which the dragon makes rather
// than raises, and the SHADOW MONSTER, the game's first mid-level boss.
import * as THREE from 'three';
import { Rig, HERO_PROPORTIONS, blobShadow } from './rig.js';
import {
  tube, ball, blob, cone, slab, lathe, shell, smooth, faceted,
  triCount, disposeTree,
} from './shapes.js';
import * as T from './textures.js';
import { buildEnemy } from './enemies.js';

const VOID = '#17131f';
const PURPLE = '#8a3fd0';
const PALE = '#c79bff';

/** Push any hex toward the level's palette: cold, drained, faintly violet. */
function darken(hex) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (r * 0.30 + g * 0.59 + b * 0.11) / 255;
  // collapse toward grey, drop the level, then bias what is left into violet
  const k = 0.30 + lum * 0.28;
  r = Math.round((r * 0.18 + lum * 255 * 0.82) * k + 14);
  g = Math.round((g * 0.18 + lum * 255 * 0.82) * k * 0.82 + 10);
  b = Math.round((b * 0.18 + lum * 255 * 0.82) * k * 1.22 + 22);
  const c = v => Math.max(0, Math.min(255, v)).toString(16).padStart(2, '0');
  return '#' + c(r) + c(g) + c(b);
}

/** A mote of purple light inside a body -- what marks a thing as taken. */
function emberLight(parent, y, intensity = 1.2, range = 7) {
  const l = new THREE.PointLight(PURPLE, intensity, range, 2);
  l.position.y = y;
  parent.add(l);
  return l;
}

/**
 * Take an existing mob: repaint it, put a light in it, and give it new stats.
 * The animator and every attack read exactly as they did before, which is the
 * point -- a dark zombie should FEEL like a zombie you already know.
 */
function taken(kind, statPatch, opts = {}) {
  const e = buildEnemy(kind);
  T.repaint(e.root, { fallback: darken });
  const host = e.torso || e.jelly || e.root;
  emberLight(host, opts.lightY ?? 0.9, opts.light ?? 1.1, opts.range ?? 7);
  // two coals where the eyes were
  if (e.neck && opts.eyes !== false) {
    const eye = new THREE.MeshBasicMaterial({ map: T.flatTex(PALE), fog: true });
    for (const s of [1, -1]) {
      e.neck.add(ball(0.035, eye, 5, 4, [s * 0.075, (opts.eyeY ?? 0.06), 0.185]));
    }
  }
  e.stats = { ...e.stats, ...statPatch };
  return e;
}

/* ---------------- TIER 1: the taken ---------------- */

export function buildDarkSkeleton() {
  return taken('skeleton', {
    hp: 46, speed: 2.8, coin: [4, 9],
    damage: 16, attackCooldown: 1.3,
    sightRange: 18,
  }, { lightY: 0.5, eyeY: 0.02 });
}

export function buildDarkZombie() {
  return taken('zombie', {
    hp: 74, speed: 1.7, coin: [5, 10],
    damage: 22, attackCooldown: 1.9,
  }, { lightY: 0.5 });
}

export function buildDarkGoblin() {
  return taken('goblin', {
    hp: 34, speed: 3.4, coin: [4, 9],
    damage: 14, attackCooldown: 1.05,
  }, { lightY: 0.4, range: 6 });
}

export function buildDarkSlime() {
  const e = taken('slime', {
    hp: 38, speed: 2.4, coin: [4, 9],
    damage: 16, attackRange: 5.4,
  }, { lightY: 0.3, eyes: false, range: 6 });
  e.kind = 'darkSlime';
  return e;
}

/* ---------------- TIER 1: the demon ----------------
 * Not raised -- MADE. Long legs, a long pitchfork, and it thrusts straight
 * down the line at you, which is why you dodge it SIDEWAYS rather than back.
 */

export function buildDemon() {
  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.205,
    chestRTop: 0.215, chestRBot: 0.175, torsoH: 0.52, torsoSquashZ: 0.82,
    armRTop: 0.062, armRBot: 0.052, upperArmH: 0.34, foreArmH: 0.34,
    handR: 0.075,
    legRTop: 0.082, legRBot: 0.066, thighH: 0.36, shinH: 0.36,
    footL: 0.28, footW: 0.15, footH: 0.10,
    hipSpread: 0.10, shoulderX: 0.195, shoulderY: 0.44,
  };
  const skin = '#5a1f2c';
  const hide = smooth(T.leatherTex('#2a1420'));
  const flesh = smooth(T.skinTex(skin));
  const horn = faceted(T.boneTex('#2a2230'));
  const iron = faceted(T.metalTex('#3e3448'));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#ffb43c', white: '#2a0f14', brow: '#3a1420',
      mouth: '#1a0a0e', glow: true, key: 'demon',
    })),
    torso: flesh, upperArm: flesh, foreArm: flesh, hand: flesh,
    thigh: flesh, shin: flesh, foot: hide,
  }, P);

  // a pair of back-swept horns and a long jaw
  for (const s of [1, -1]) {
    const h = cone(0.045, 0.40, horn, 5, [s * 0.135, P.headR * 1.0, -0.05]);
    h.rotation.set(-0.7, 0, -s * 0.55);
    rig.neck.add(h);
  }
  rig.neck.add(blob(0.11, flesh, [0.9, 0.6, 1.5], 6, 4, [0, -0.03, 0.17]));
  emberLight(rig.torso, 0.34, 1.5, 8);

  // small ragged wings -- it does not fly, it just looks like it should
  const memb = faceted(T.flatTex('#2a1424'));
  memb.side = THREE.DoubleSide;
  memb.transparent = true;
  memb.opacity = 0.94;
  for (const s of [1, -1]) {
    const w = new THREE.Group();
    w.position.set(s * 0.16, P.shoulderY - 0.06, -0.12);
    w.rotation.set(0.2, s * -0.5, s * -0.7);
    for (let i = 0; i < 3; i++) {
      const sp = cone(0.035, 0.52 - i * 0.09, horn, 4, [0, 0.22, 0]);
      sp.rotation.z = -0.3 - i * 0.35;
      w.add(sp);
    }
    w.add(slab(0.44, 0.34, 0.02, memb, [0.16, 0.14, 0]));
    rig.torso.add(w);
  }

  // THE PITCHFORK: three tines on a long shaft, held for a straight thrust
  const fork = new THREE.Group();
  fork.add(tube(0.028, 0.032, 2.30, smooth(T.woodTex('#33202a')), 5, [0, 0.60, 0]));
  for (const dx of [-0.11, 0, 0.11]) {
    const tine = cone(0.030, 0.42, iron, 4, [dx, 1.92, 0]);
    fork.add(tine);
  }
  fork.add(slab(0.26, 0.05, 0.05, iron, [0, 1.70, 0]));
  fork.rotation.set(Math.PI * 0.46, 0, -0.06);
  fork.position.set(0, -0.10, 0.02);
  rig.arms.R.hand.add(fork);
  rig.gear = { spear: fork };

  rig.rest = { shoulderX: -0.24, shoulderZ: 0.12, elbowXR: -0.58, elbowXL: -0.66 };
  rig.stats = {
    hp: 58, speed: 3.0, tier: 1, coin: [6, 12],
    // A LONG straight thrust. The danger zone is a lane, not an arc: stepping
    // back keeps you in it, and stepping aside takes you clean out.
    damage: 20, attackRange: 4.2, attackCooldown: 1.9,
    windup: 0.52, strike: 0.16, recover: 0.44,
    sightRange: 20, sightAngle: 1.1, hearRange: 11,
    lookHeight: 1.35, hitRadius: 0.44,
    arrows: [1, 3],
    thrust: true,              // narrow lane telegraph, and hint SIDEWAYS
  };
  rig.attackStyle = 'jab';
  return rig;
}

/* ---------------- TIER 2: the taken commanders ---------------- */

export function buildDarkWitch() {
  return taken('witch', {
    hp: 165, speed: 2.3, coin: [40, 62],
    damage: 20, attackCooldown: 2.8,
    projectile: { kind: 'bolt', color: PALE, speed: 15, homing: true },
    commandRange: 19,
  }, { lightY: 0.6, light: 1.6, range: 9 });
}

export function buildCorruptedDarkKnight() {
  return taken('corruptedKnight', {
    hp: 260, speed: 2.8, coin: [55, 85],
    damage: 32, attackCooldown: 1.9,
    charge: { range: 13, speed: 14, cooldown: 5.5 },
    commandRange: 20,
  }, { lightY: 0.6, light: 1.6, range: 9 });
}

export function buildDarkGoblinKing() {
  return taken('goblinGeneral', {
    hp: 215, speed: 2.9, coin: [46, 72],
    damage: 26, attackRange: 3.6, attackCooldown: 1.55,
    commandRange: 19,
  }, { lightY: 0.55, light: 1.4 });
}

/** The shadow golem: the rock golem, hollowed out and filled with the dark. */
export function buildShadowGolem() {
  const e = taken('rockGolem', {
    hp: 300, speed: 1.4, coin: [58, 88],
    damage: 30, attackRange: 20, attackCooldown: 3.2,
    projectile: { kind: 'bolt', color: PALE, speed: 17, homing: false },
    melee: { range: 2.8, damage: 36 },
    commandRange: 17,
  }, { lightY: 0.9, light: 2.2, range: 11 });
  return e;
}

/* ---------------- TIER 3: the shadow monster ----------------
 * A mid-level boss, half way up the cliff. It does not close and it does not
 * throw: it opens both hands and pours a stream of shadow out of each, and you
 * have to break the line of them. Nothing else in the game fights like it.
 */

export function buildShadowMonster() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const skinMat = faceted(T.flatTex('#181322'));
  skinMat.transparent = true;
  skinMat.opacity = 0.96;
  const wisp = faceted(T.flatTex('#2c1f42'));
  wisp.transparent = true;
  wisp.opacity = 0.6;

  // a hunched mass with no legs -- it drags itself along the ground
  const torso = new THREE.Group();
  torso.position.y = 2.5;
  body.add(torso);
  torso.add(blob(1.5, skinMat, [1.15, 1.25, 0.95], 7, 6, [0, 0, 0]));
  torso.add(blob(1.25, skinMat, [1.35, 0.75, 1.1], 7, 5, [0, -1.15, 0.1]));
  // a skirt of smoke where legs would be
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const t = cone(0.42, 2.4 + (i % 3) * 0.7, wisp, 5,
      [Math.cos(a) * 0.95, -2.1, Math.sin(a) * 0.85]);
    t.rotation.x = Math.PI;
    t.rotation.z = Math.cos(a) * 0.24;
    torso.add(t);
  }

  // the head: a smooth mask with two burning slits
  const neck = new THREE.Group();
  neck.position.y = 1.45;
  torso.add(neck);
  neck.add(blob(0.62, skinMat, [0.95, 1.15, 1.0], 7, 5, [0, 0, 0]));
  const slit = new THREE.MeshBasicMaterial({ map: T.flatTex('#e0b0ff'), fog: true });
  for (const s of [1, -1]) {
    const e = slab(0.24, 0.09, 0.06, slit, [s * 0.24, 0.10, 0.55]);
    e.rotation.z = -s * 0.32;
    neck.add(e);
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const horn = cone(0.09, 0.9 + (i % 2) * 0.4, skinMat, 4,
      [Math.cos(a) * 0.45, 0.5, Math.sin(a) * 0.4 - 0.1]);
    horn.rotation.set(-0.5, 0, -Math.cos(a) * 0.7);
    neck.add(horn);
  }

  // two long arms. The hands are where the streams come from, so they are the
  // thing to look at, and they glow.
  const arms = {};
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 1.25, 0.75, 0);
    torso.add(shoulder);
    shoulder.add(tube(0.20, 0.30, 1.5, skinMat, 6, [0, -0.75, 0]));
    const elbow = new THREE.Group();
    elbow.position.y = -1.5;
    shoulder.add(elbow);
    elbow.add(tube(0.15, 0.20, 1.4, skinMat, 6, [0, -0.70, 0]));
    const hand = new THREE.Group();
    hand.position.y = -1.4;
    elbow.add(hand);
    hand.add(blob(0.34, skinMat, [1, 1.15, 1], 6, 5, [0, -0.14, 0]));
    for (let i = 0; i < 4; i++) {
      const f = cone(0.055, 0.46, skinMat, 4,
        [(i - 1.5) * 0.14, -0.42, 0.06]);
      f.rotation.x = 0.3;
      hand.add(f);
    }
    const glow = new THREE.PointLight(PURPLE, 2.0, 12, 2);
    glow.position.y = -0.4;
    hand.add(glow);
    shoulder.rotation.set(0.2, 0, s * 0.28);
    arms[s > 0 ? 'L' : 'R'] = { shoulder, elbow, hand, glow };
  }

  emberLight(torso, 0, 2.6, 16);
  const shadow = blobShadow(2.0);
  root.add(shadow);

  return {
    kind: 'shadowMonster',
    root, body, torso, neck, head: neck, arms, shadow,
    attackStyle: 'cast',
    stats: {
      hp: 620, speed: 1.6, tier: 3, coin: [180, 260],
      // it never melees; the stream IS the fight
      damage: 12, attackRange: 3.4, attackCooldown: 3.2,
      windup: 0.85, strike: 1.20, recover: 0.80,
      breathRange: 17.0, breathAngle: 0.26, breathDamage: 11,
      breathColor: '#b070ff', breathHot: '#f0d8ff', breathCool: '#3a1a5a',
      sightRange: 30, sightAngle: 1.6, hearRange: 22,
      lookHeight: 3.2, hitRadius: 1.7,
      arrows: [3, 6],
      miniBoss: true,
      commander: true, commandRange: 22, commandCooldown: 8,
    },
    resetPose() {},
    triCount() { return triCount(root); },
    dispose() { disposeTree(root); },
  };
}

/** Its animator: it hovers, it sways, and it raises both arms to pour. */
export class ShadowMonsterAnimator {
  constructor(e) {
    this.e = e;
    this.t = 0;
    this.pour = 0;
  }

  update(dt, state = {}) {
    const e = this.e;
    this.t += dt;
    const atk = state.attack;
    const pouring = atk && (atk.phase === 'windup' || atk.phase === 'strike');
    this.pour += ((pouring ? 1 : 0) - this.pour) * Math.min(1, dt * 7);

    // it never touches the ground
    e.body.position.y = Math.sin(this.t * 0.9) * 0.24 + this.pour * 0.5;
    e.torso.rotation.z = Math.sin(this.t * 0.6) * 0.05;
    e.torso.rotation.x = -this.pour * 0.18;
    e.neck.rotation.x = 0.1 - this.pour * 0.32;

    for (const s of ['L', 'R']) {
      const a = e.arms[s];
      const sign = s === 'L' ? 1 : -1;
      // hanging low at rest, swung up and forward to pour
      a.shoulder.rotation.x = -0.1 - this.pour * 2.05 + Math.sin(this.t * 0.8 + sign) * 0.05;
      a.shoulder.rotation.z = sign * (0.28 - this.pour * 0.16);
      a.elbow.rotation.x = 0.25 - this.pour * 0.55;
      a.glow.intensity = 1.0 + this.pour * 4.5
        + (pouring ? Math.sin(this.t * 24 + sign) * 0.8 : 0);
    }

    if (state.hurt) e.body.position.x = (Math.random() - 0.5) * 0.16;
    else e.body.position.x = 0;
  }
}
