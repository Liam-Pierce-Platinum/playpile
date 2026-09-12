// THE PEOPLE.
//
// Nobody is in the kingdom while the dragons hold it. Once they are gone the
// levels reopen with the villages lived in again, and this is what lives in
// them: farmers on the mountain terraces, miners in the shaft, townsfolk in
// the valley, families on the cliff.
//
// They are deliberately built from the same rig as the hero -- these are the
// people you were fighting for, and they should read as the same kind of thing
// you are, not as scenery.
import * as THREE from 'three';
import { Rig, HERO_PROPORTIONS } from './rig.js';
import { tube, ball, blob, cone, slab, lathe, smooth, faceted } from './shapes.js';
import * as T from './textures.js';
import { CharacterAnimator } from '../player/animator.js';

const SKINS = ['#d9a878', '#c08a5e', '#8c5f3f', '#e6c39a', '#6f462c'];
const CLOTH = ['#7a5a3a', '#5a6b48', '#8c4a3a', '#3f5a6b', '#6a5a72', '#8a7a4a'];
const TRIM = ['#c9b78a', '#d8c9a8', '#a89060', '#e0d4b0'];

function pick(list, r) { return list[(r() * list.length) | 0]; }

/**
 * A villager. `role` changes the props and the palette but not the bones:
 *   folk    -- a townsperson, nothing in their hands
 *   farmer  -- carries a hoe
 *   miner   -- carries a pick and wears a lamp
 *   smith   -- carries a hammer, wears an apron
 */
export function buildVillager(role = 'folk', seed = 1) {
  let s = (seed * 2654435761) >>> 0;
  const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };

  const P = {
    ...HERO_PROPORTIONS,
    headR: 0.205 + r() * 0.02,
    chestRTop: 0.20, chestRBot: 0.175, torsoH: 0.48,
    armRTop: 0.068, armRBot: 0.056, upperArmH: 0.27, foreArmH: 0.27,
    legRTop: 0.092, legRBot: 0.076, thighH: 0.28, shinH: 0.27,
    hipSpread: 0.10, shoulderX: 0.195, shoulderY: 0.40,
  };
  const skin = pick(SKINS, r);
  const cloth = pick(CLOTH, r);
  const trim = pick(TRIM, r);
  const clothMat = smooth(T.clothTex(cloth));
  const trimMat = smooth(T.clothTex(trim));
  const flesh = smooth(T.skinTex(skin));
  const hide = smooth(T.leatherTex('#5a4028'));

  const rig = new Rig({
    head: smooth(T.faceTex(skin, {
      eye: '#2a2018', white: '#f2ece0', brow: '#3a2a1a',
      mouth: '#8a5a4a', key: 'folk' + ((seed % 5) | 0),
    })),
    torso: clothMat, upperArm: clothMat, foreArm: flesh, hand: flesh,
    thigh: trimMat, shin: trimMat, foot: hide,
  }, P);

  // hair, or a hat
  if (r() < 0.45) {
    const hat = lathe([
      [0.001, 0.16], [0.13, 0.13], [0.20, 0.02], [0.32, -0.02], [0.001, -0.04],
    ], trimMat, 6);
    hat.position.y = P.headR * 1.02;
    rig.neck.add(hat);
  } else {
    rig.neck.add(blob(0.21, smooth(T.clothTex(r() < 0.5 ? '#3a2a1a' : '#6a5238')),
      [1.04, 0.62, 1.04], 6, 4, [0, P.headR * 0.42, -0.02]));
  }

  const gear = {};
  const wood = smooth(T.woodTex('#6a4a2c'));
  const iron = faceted(T.metalTex('#8a8f98'));

  if (role === 'farmer') {
    const hoe = new THREE.Group();
    hoe.add(tube(0.026, 0.030, 1.7, wood, 5, [0, 0.35, 0]));
    hoe.add(slab(0.30, 0.16, 0.04, iron, [0.10, 1.16, 0]));
    hoe.rotation.set(Math.PI * 0.42, 0, -0.10);
    hoe.position.set(0, -0.10, 0.02);
    rig.arms.R.hand.add(hoe);
    gear.tool = hoe;
  } else if (role === 'miner') {
    const pick2 = new THREE.Group();
    pick2.add(tube(0.026, 0.030, 1.1, wood, 5, [0, 0.20, 0]));
    const headBar = slab(0.52, 0.07, 0.07, iron, [0, 0.72, 0]);
    headBar.rotation.z = 0.25;
    pick2.add(headBar);
    pick2.rotation.set(Math.PI * 0.40, 0, -0.10);
    pick2.position.set(0, -0.09, 0.02);
    rig.arms.R.hand.add(pick2);
    gear.tool = pick2;
    // a lamp on the chest, because a mine is dark even when it is safe
    const lamp = blob(0.07, new THREE.MeshBasicMaterial({
      map: T.flatTex('#ffd76a'), fog: true,
    }), [1, 1.2, 1], 6, 4, [0, P.shoulderY - 0.10, P.chestRTop * 0.9]);
    rig.torso.add(lamp);
    const l = new THREE.PointLight('#ff9a3c', 1.1, 7, 2);
    l.position.set(0, P.shoulderY - 0.10, P.chestRTop);
    rig.torso.add(l);
    gear.lamp = l;
  } else if (role === 'smith') {
    const hammer = new THREE.Group();
    hammer.add(tube(0.028, 0.032, 0.72, wood, 5, [0, 0.14, 0]));
    hammer.add(slab(0.30, 0.16, 0.16, iron, [0, 0.52, 0]));
    hammer.rotation.set(Math.PI * 0.40, 0, -0.10);
    hammer.position.set(0, -0.09, 0.02);
    rig.arms.R.hand.add(hammer);
    gear.tool = hammer;
    const apron = lathe([
      [0.20, 0], [0.28, -0.30], [0.30, -0.60], [0.001, -0.62],
    ], smooth(T.leatherTex('#5a3a24')), 6);
    apron.position.y = 0.02;
    rig.torso.add(apron);
  }

  rig.gear = gear;
  rig.rest = { shoulderX: -0.18, shoulderZ: 0.11, elbowXR: -0.52, elbowXL: -0.50 };
  rig.role = role;
  return rig;
}

/**
 * A villager going about their business: they stand about, and every so often
 * they wander a few metres and stand about somewhere else. Nothing more --
 * they are here to make the place look inhabited, not to be simulated.
 */
export class Villager {
  constructor(scene, world, x, z, role = 'folk', seed = 1, opts = {}) {
    this.rig = buildVillager(role, seed);
    this.animator = new CharacterAnimator(this.rig);
    this.world = world;
    this.home = { x, z };
    this.roam = opts.roam ?? 5.5;
    this.speed = 1.05 + (seed % 5) * 0.06;
    this.pos = new THREE.Vector3(x, world.groundHeight(x, z), z);
    this.target = { x, z };
    this.wait = 1 + (seed % 7) * 0.6;
    this.yaw = (seed % 6) * 1.05;
    this.sp = 0;
    scene.add(this.rig.root);
    this.rig.root.position.copy(this.pos);
  }

  update(dt) {
    const dx = this.target.x - this.pos.x;
    const dz = this.target.z - this.pos.z;
    const d = Math.hypot(dx, dz);

    if (d < 0.4) {
      this.sp = 0;
      this.wait -= dt;
      if (this.wait <= 0) {
        // pick somewhere else nearby to stand
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * this.roam;
        this.target = { x: this.home.x + Math.cos(a) * r, z: this.home.z + Math.sin(a) * r };
        this.wait = 2.5 + Math.random() * 6;
      }
    } else {
      this.sp = this.speed;
      const step = Math.min(d, this.speed * dt);
      this.pos.x += (dx / d) * step;
      this.pos.z += (dz / d) * step;
      const want = Math.atan2(dx, dz);
      let e = want - this.yaw;
      e = Math.atan2(Math.sin(e), Math.cos(e));
      this.yaw += e * Math.min(1, dt * 6);
    }

    this.pos.y = this.world.groundHeight(this.pos.x, this.pos.z);
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    this.animator.update(dt, { speed: this.sp, grounded: true, maxSpeed: 6.4 });
  }

  dispose() {
    this.rig.root.parent?.remove(this.rig.root);
    this.rig.dispose?.();
  }
}
