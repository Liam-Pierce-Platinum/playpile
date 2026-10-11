// BANNERFALL :: render/unitMeshes.js - chunky stylised soldiers, horses and squad banners.
// One InstancedMesh per body part per unit type; every soldier is animated procedurally by
// composing part matrices each frame (walk, run, thrust, chop, draw-and-loose, crank, heal,
// gallop, fall). Team colours come from per-instance colours, so both armies share meshes.
import * as THREE from '../../vendor/three.module.js';
import { part, merge, mergeSmooth, rbox, sphere, cyl, cone, box, capsule, teamMaterial, lin } from './geo.js';
import { UNIT_TYPES } from '../data/units.js';
import { ramBody, ramLog, mangonelBody, mangonelArm, trebuchetBody, trebuchetArm, siegeTowerBody, siegeTowerArm, ballistaBody, ballistaArm } from './engineMeshes.js';

// team colours by faction slot (0 player .. 4 rivals, 7 neutral villagers, 8 bandits)
const TEAM = [];
const TEAMHEX = [];
export function setTeamColors(list) {
  // list: [{ slot, main, trim, ink }] as sRGB hex numbers
  for (const f of list) {
    TEAM[f.slot] = { main: lin(f.main), trim: lin(f.trim) };
    TEAMHEX[f.slot] = { main: '#' + f.main.toString(16).padStart(6, '0'), trim: '#' + f.trim.toString(16).padStart(6, '0'), ink: '#' + (f.ink || 0xf4ecd8).toString(16).padStart(6, '0') };
  }
}
setTeamColors([
  { slot: 0, main: 0x2f5fa8, trim: 0xe2b33c, ink: 0xf6eccf }, { slot: 1, main: 0xa82f2f, trim: 0x2a2326, ink: 0xf1e3d0 },
  { slot: 2, main: 0x3f6b3a, trim: 0xb08a3e, ink: 0xf2ead2 }, { slot: 3, main: 0x2f7d86, trim: 0xc9ccd0, ink: 0xf2f4f2 },
  { slot: 4, main: 0xc4652a, trim: 0x1e1a18, ink: 0xf6e6d0 }, { slot: 5, main: 0x6a4a8a, trim: 0xd0c070, ink: 0xf2eedd },
  { slot: 6, main: 0x8a8a3a, trim: 0x2a2a20, ink: 0xf2eedd }, { slot: 7, main: 0x8a7a5c, trim: 0xd8ceb4, ink: 0xf4ecd8 },
  { slot: 8, main: 0x4a4440, trim: 0x8a2a20, ink: 0xe8d8c8 },
]);
export const teamHex = (slot) => TEAMHEX[slot] || TEAMHEX[1];
const SKIN = 0xe0b48e, BOOT = 0x3b2a1f, TROUSER = 0x5b4a3a, LEATHER = 0x7a5536, STEEL = 0xb9bec4, DARKSTEEL = 0x7c8288, WOOD = 0x7a5838, CLOTH = 0xd8c9a8;

// ---------------------------------------------------------------- part geometry
function legGeo(robe) {
  return merge([
    part(capsule(0.12, 0.42, 3, 8), robe ? 0xd9cfb9 : TROUSER, { pos: [0, -0.36, 0] }),
    part(rbox(0.21, 0.2, 0.34, 0.08), BOOT, { pos: [0, -0.76, 0.05] }),
  ]);
}
function headGeo(type) {
  const P = [part(sphere(0.235, 11, 8), SKIN, { pos: [0, 0.2, 0.0], scale: [1, 1.05, 1] })];
  // nose + ears read at a distance as "a face"
  P.push(part(sphere(0.055, 8, 6), 0xd29f78, { pos: [0, 0.18, 0.225] }));
  if (type !== 'knight') for (const ex of [-0.08, 0.08]) P.push(part(sphere(0.028, 6, 5), 0x1e1610, { pos: [ex, 0.25, 0.212], scale: [1, 1.25, 0.6] }));
  const helm = (g, c, o) => P.push(part(g, c, o));
  switch (type) {
    case 'spear': // kettle hat
      helm(sphere(0.255, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), DARKSTEEL, { pos: [0, 0.26, 0] });
      helm(cyl(0.42, 0.42, 0.04, 20), DARKSTEEL, { pos: [0, 0.27, 0] });
      helm(capsule(0.05, 0.22, 3, 8), 0x4a3a2c, { pos: [0, 0.03, 0.17], rot: [Math.PI / 2, 0, Math.PI / 2] });
      break;
    case 'sword': // conical nasal helm + mail coif
      helm(cone(0.26, 0.36, 12), STEEL, { pos: [0, 0.44, 0] });
      helm(cyl(0.255, 0.255, 0.12, 12), STEEL, { pos: [0, 0.3, 0] });
      helm(box(0.05, 0.2, 0.05), STEEL, { pos: [0, 0.2, 0.245] });
      helm(cyl(0.26, 0.3, 0.26, 12, true), 0x8d9298, { pos: [0, 0.06, -0.02] });
      break;
    case 'archer': // hood
      helm(sphere(0.27, 12, 9), 0x55613a, { pos: [0, 0.24, -0.04], scale: [1, 1.05, 1.05] });
      helm(cone(0.13, 0.32, 10), 0x55613a, { pos: [0, 0.18, -0.3], rot: [-1.9, 0, 0] });
      break;
    case 'xbow': // flat cap with a feather
      helm(cyl(0.27, 0.25, 0.12, 12), 1, { pos: [0, 0.36, 0], team: 1, shade: 0.85 });
      helm(cyl(0.3, 0.3, 0.03, 12), 1, { pos: [0, 0.31, 0], team: 2 });
      helm(cone(0.04, 0.5, 6), 0xf1ead8, { pos: [-0.2, 0.55, -0.1], rot: [-0.5, 0, 0.4] });
      break;
    case 'healer': // cowl
      helm(sphere(0.29, 12, 9), 0xd9cfb9, { pos: [0, 0.22, -0.05], scale: [1, 1.08, 1.08] });
      helm(cyl(0.3, 0.36, 0.2, 12, true), 0xcfc4ad, { pos: [0, 0.0, -0.03] });
      break;
    case 'outrider': // leather cap
      helm(sphere(0.25, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), LEATHER, { pos: [0, 0.24, 0] });
      helm(cyl(0.26, 0.26, 0.06, 12), 0x5e4029, { pos: [0, 0.25, 0] });
      break;
    case 'knight': // great helm
      helm(cyl(0.27, 0.27, 0.46, 12), STEEL, { pos: [0, 0.22, 0] });
      helm(cyl(0.2, 0.27, 0.08, 12), STEEL, { pos: [0, 0.48, 0] });
      helm(box(0.3, 0.035, 0.05), 0x222222, { pos: [0, 0.27, 0.255] });
      helm(box(0.035, 0.18, 0.05), 0x333333, { pos: [0, 0.16, 0.26] });
      helm(cone(0.07, 0.2, 8), 1, { pos: [0, 0.6, 0], team: 1 });
      break;
    case 'sapper': // leather cap with a wide brim
      helm(sphere(0.25, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), 0x6b4a30, { pos: [0, 0.25, 0] });
      helm(cyl(0.36, 0.36, 0.035, 13), 0x5a3c26, { pos: [0, 0.27, 0] });
      break;
    case 'king': // a tall gold crown over a steel cap
      helm(sphere(0.255, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), DARKSTEEL, { pos: [0, 0.25, 0] });
      helm(cyl(0.29, 0.27, 0.16, 12, true), 0xe0b040, { pos: [0, 0.36, 0] });
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; helm(cone(0.05, 0.22, 5), 0xe0b040, { pos: [Math.sin(a) * 0.28, 0.54, Math.cos(a) * 0.28] }); }
      helm(sphere(0.06, 8, 6), 0xc8302a, { pos: [0, 0.37, 0.29] });
      break;
    case 'commander': // crowned helm
      helm(sphere(0.255, 12, 7, 0, Math.PI * 2, 0, Math.PI / 2), STEEL, { pos: [0, 0.25, 0] });
      helm(cyl(0.27, 0.27, 0.1, 12, true), 1, { pos: [0, 0.32, 0], team: 2 });
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2; helm(cone(0.045, 0.14, 5), 1, { pos: [Math.sin(a) * 0.26, 0.43, Math.cos(a) * 0.26], team: 2 }); }
      break;
  }
  return merge(P);
}
function torsoGeo(type) {
  const P = [];
  const robe = type === 'healer';
  if (robe) {
    P.push(part(cyl(0.27, 0.46, 1.25, 12), 0xefe6d2, { pos: [0, -0.22, 0], grad: 0.25 }));
    P.push(part(rbox(0.52, 0.55, 0.36, 0.16), 0xefe6d2, { pos: [0, 0.36, 0] }));
    P.push(part(box(0.12, 0.95, 0.04), 1, { pos: [0.1, 0.18, 0.19], team: 1 }));
    P.push(part(box(0.12, 0.95, 0.04), 1, { pos: [-0.1, 0.18, 0.19], team: 1 }));
    P.push(part(cyl(0.28, 0.28, 0.06, 14), 0x9a7b4f, { pos: [0, 0.04, 0] }));
    return merge(P);
  }
  const mail = type === 'sword' || type === 'knight' || type === 'commander' || type === 'king';
  const body = type === 'knight' ? STEEL : mail ? 0x8d9298 : type === 'spear' ? 0xc9b48a : type === 'archer' ? 0x8a7350 : LEATHER;
  P.push(part(rbox(0.54, 0.62, 0.36, 0.16), body, { pos: [0, 0.34, 0] }));
  // tabard / surcoat in team colours with a trim band
  P.push(part(rbox(0.5, 0.66, 0.38, 0.12), 1, { pos: [0, 0.3, 0.005], team: 1, scale: [1.02, 1, 1.02] }));
  P.push(part(cyl(0.27, 0.36, 0.42, 16, false), 1, { pos: [0, -0.1, 0], team: 1, shade: 0.9 }));
  P.push(part(cyl(0.365, 0.37, 0.06, 12), 1, { pos: [0, -0.3, 0], team: 2 }));
  P.push(part(box(0.2, 0.2, 0.02), 1, { pos: [0, 0.38, 0.2], team: 2 }));     // chest emblem
  P.push(part(cyl(0.285, 0.285, 0.07, 12), 0x4a3424, { pos: [0, 0.03, 0] })); // belt
  P.push(part(rbox(0.08, 0.07, 0.03, 0.02), 0xd0b060, { pos: [0, 0.03, 0.29] }));
  // shoulders
  const sh = mail ? STEEL : body;
  P.push(part(sphere(0.15, 10, 6), sh, { pos: [0.3, 0.58, 0], scale: [1.1, 0.85, 1.1] }));
  P.push(part(sphere(0.15, 10, 6), sh, { pos: [-0.3, 0.58, 0], scale: [1.1, 0.85, 1.1] }));
  if (type === 'archer') { // quiver on the back
    P.push(part(cyl(0.09, 0.08, 0.62, 10), LEATHER, { pos: [0.12, 0.42, -0.24], rot: [0.25, 0, -0.35] }));
    for (let k = 0; k < 4; k++) P.push(part(cone(0.035, 0.1, 5), 0xf0e8d8, { pos: [0.22 + (k % 2) * 0.05 - 0.03, 0.78, -0.33 + (k > 1 ? 0.04 : 0)], rot: [0.25, 0, -0.35] }));
  }
  if (type === 'commander' || type === 'king') { // cape
    P.push(part(box(0.62, 1.15, 0.05), 1, { pos: [0, 0.05, -0.24], rot: [-0.18, 0, 0], team: 1, shade: 0.8 }));
  }
  return merge(P);
}
function armGeo(type, side) {
  const robe = type === 'healer';
  const sleeve = robe ? 0xefe6d2 : type === 'knight' ? STEEL : type === 'sword' || type === 'commander' || type === 'king' ? 0x8d9298 : type === 'spear' ? 0xc9b48a : LEATHER;
  const P = [
    part(capsule(robe ? 0.1 : 0.085, 0.36, 3, 8), sleeve, { pos: [0, -0.22, 0] }),
    part(sphere(0.095, 10, 8), type === 'knight' ? DARKSTEEL : robe ? SKIN : 0x6b4a30, { pos: [0, -0.5, 0.01], scale: [1, 1.1, 1.15] }),
  ];
  if (robe) P.push(part(cyl(0.13, 0.1, 0.22, 10, true), 0xefe6d2, { pos: [0, -0.34, 0] }));
  return merge(P);
}
// held items, in hand-local space: the hand is the origin, +z = along the fingers' pointing direction
function weaponGeo(type) {
  switch (type) {
    case 'spear': return merge([
      part(cyl(0.028, 0.032, 2.9, 7), WOOD, { pos: [0, 0, 0] }),
      part(cone(0.06, 0.32, 8), STEEL, { pos: [0, 1.6, 0] }),
      part(cyl(0.05, 0.05, 0.08, 8), DARKSTEEL, { pos: [0, 1.42, 0] }),
    ]);
    case 'sapper': return merge([ // shovel
      part(cyl(0.025, 0.03, 1.3, 6), WOOD, { pos: [0, 0.35, 0] }),
      part(rbox(0.26, 0.3, 0.04, 0.02), DARKSTEEL, { pos: [0, 1.08, 0.02] }),
      part(box(0.18, 0.05, 0.05), WOOD, { pos: [0, -0.3, 0] }),
    ]);
    case 'sword': case 'outrider': case 'commander': case 'king': return merge([
      part(box(0.07, 0.95, 0.025), STEEL, { pos: [0, 0.6, 0] }),
      part(cone(0.035, 0.12, 4), STEEL, { pos: [0, 1.13, 0], rot: [0, Math.PI / 4, 0] }),
      part(box(0.3, 0.05, 0.06), type === 'commander' || type === 'king' ? 0xd8b048 : DARKSTEEL, { pos: [0, 0.1, 0] }),
      part(cyl(0.025, 0.025, 0.18, 6), 0x4a3424, { pos: [0, 0, 0] }),
      part(sphere(0.045, 8, 6), 0xd0b060, { pos: [0, -0.1, 0] }),
    ]);
    case 'archer': { // bow: a curved stave with a string
      const P = [];
      const seg = 10;
      for (let k = 0; k < seg; k++) {
        const a0 = -0.85 + (1.7 * k) / seg, a1 = -0.85 + (1.7 * (k + 1)) / seg;
        const R = 0.85;
        const p0 = [0, Math.sin(a0) * R, Math.cos(a0) * R - R * 0.86], p1 = [0, Math.sin(a1) * R, Math.cos(a1) * R - R * 0.86];
        const L = Math.hypot(p1[1] - p0[1], p1[2] - p0[2]);
        const g = cyl(0.026 - Math.abs(k - seg / 2) * 0.0015, 0.026 - Math.abs(k + 1 - seg / 2) * 0.0015, L, 6);
        P.push(part(g, 0x6e4a2a, { pos: [0, (p0[1] + p1[1]) / 2, (p0[2] + p1[2]) / 2], rot: [-Math.atan2(p1[2] - p0[2], p1[1] - p0[1]), 0, 0] }));
      }
      P.push(part(cyl(0.006, 0.006, 1.27, 4), 0xeee8d8, { pos: [0, 0, Math.cos(0.85) * 0.85 - 0.85 * 0.86] }));
      const bow = merge(P); bow.translate(0, 0, -(0.85 - 0.85 * 0.86)); return bow;
    }
    case 'xbow': return merge([
      part(rbox(0.09, 0.08, 0.85, 0.03), WOOD, { pos: [0, 0, 0.2] }),
      part(box(0.8, 0.05, 0.06), DARKSTEEL, { pos: [0, 0.03, 0.55], scale: [1, 1, 1] }),
      part(cyl(0.006, 0.006, 0.78, 4), 0xeee8d8, { pos: [0, 0.05, 0.42], rot: [0, 0, Math.PI / 2] }),
      part(rbox(0.07, 0.16, 0.22, 0.03), WOOD, { pos: [0, -0.08, -0.18] }),
    ]);
    case 'healer': return merge([
      part(cyl(0.03, 0.035, 1.9, 7), 0x8a6a44, {}),
      part(sphere(0.08, 10, 8), 0xffe9a0, { pos: [0, 1.0, 0] }),
      part(box(0.26, 0.04, 0.04), 0xd8b860, { pos: [0, 0.85, 0] }),
    ]);
    case 'knight': return merge([ // lance
      part(cyl(0.035, 0.07, 3.6, 8), 0xe8e0d0, { pos: [0, 1.2, 0] }),
      part(cone(0.07, 0.4, 8), STEEL, { pos: [0, 3.2, 0] }),
      part(cone(0.16, 0.36, 10), 1, { pos: [0, -0.1, 0], team: 1, rot: [Math.PI, 0, 0] }),
      part(box(0.02, 0.28, 0.42), 1, { pos: [0, 2.6, -0.2], team: 2 }),
    ]);
  }
  return null;
}
function shieldGeo(team) {
  // a kite shield: puffed shape, team colour face with a trim rim and boss
  const s = new THREE.Shape();
  s.moveTo(0, 0.42); s.quadraticCurveTo(0.3, 0.42, 0.3, 0.12); s.quadraticCurveTo(0.26, -0.3, 0, -0.55); s.quadraticCurveTo(-0.26, -0.3, -0.3, 0.12); s.quadraticCurveTo(-0.3, 0.42, 0, 0.42);
  const face = new THREE.ExtrudeGeometry(s, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2, curveSegments: 10 });
  const rim = new THREE.ExtrudeGeometry(s, { depth: 0.02, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.05, bevelSegments: 2, curveSegments: 10 });
  return merge([
    part(face, 1, { team: 1, pos: [0, 0, 0.03] }),
    part(rim, 1, { team: 2, pos: [0, 0, 0.0] }),
    part(sphere(0.07, 10, 8), 1, { team: 2, pos: [0, 0.05, 0.1], scale: [1, 1, 0.6] }),
    part(box(0.05, 0.42, 0.012), 1, { team: 2, pos: [0, -0.02, 0.105] }),
    part(box(0.36, 0.05, 0.012), 1, { team: 2, pos: [0, 0.12, 0.105] }),
  ]);
}
// horse: body (barrel, chest, rump, tail, saddle, cloth), neck+head, and one leg geometry
const coatOf = (type) => (type === 'knight' ? 0xb9b4ab : type === 'commander' ? 0xece6da : type === 'king' ? 0x2a2224 : 0x6e4a32);
function horseBodyGeo(type) {
  const coat = coatOf(type);
  const P = [
    part(capsule(0.46, 1.25, 4, 11), coat, { rot: [Math.PI / 2, 0, 0], pos: [0, 0, 0], scale: [0.95, 1.08, 1] }),
    part(sphere(0.5, 11, 8), coat, { pos: [0, 0.06, 0.62] }),
    part(sphere(0.52, 11, 8), coat, { pos: [0, 0.04, -0.62] }),
    part(capsule(0.09, 0.55, 3, 8), 0x2e2219, { pos: [0, -0.15, -1.15], rot: [-0.45, 0, 0] }),
    part(rbox(0.58, 0.16, 0.6, 0.07), 0x5a3a24, { pos: [0, 0.5, 0.05] }),
  ];
  if (type === 'knight' || type === 'commander' || type === 'king') {
    // caparison: a team-coloured cloth draped to the knees
    P.push(part(cyl(0.6, 0.66, 1.9, 13, true), 1, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.1, 0], team: 1, scale: [1, 1, 0.78] }));
    P.push(part(cyl(0.67, 0.67, 0.08, 13, true), 1, { rot: [Math.PI / 2, 0, 0], pos: [0, -0.1, 0.95], team: 2, scale: [1, 1, 0.78] }));
  } else {
    P.push(part(rbox(0.86, 0.5, 0.7, 0.08), 1, { pos: [0, 0.28, 0.05], team: 1 }));
    P.push(part(rbox(0.88, 0.06, 0.72, 0.03), 1, { pos: [0, 0.05, 0.05], team: 2 }));
  }
  return merge(P);
}
function horseHeadGeo(type) {
  const coat = coatOf(type);
  const P = [
    part(capsule(0.22, 0.6, 3, 9), coat, { pos: [0, 0.32, 0.18], rot: [0.75, 0, 0] }),
    part(rbox(0.26, 0.28, 0.62, 0.11), coat, { pos: [0, 0.6, 0.55], rot: [0.55, 0, 0] }),
    part(rbox(0.2, 0.22, 0.2, 0.08), 0x3a2a20, { pos: [0, 0.42, 0.82], rot: [0.55, 0, 0] }),
    part(cone(0.06, 0.16, 6), coat, { pos: [0.09, 0.86, 0.36], rot: [-0.3, 0, 0] }),
    part(cone(0.06, 0.16, 6), coat, { pos: [-0.09, 0.86, 0.36], rot: [-0.3, 0, 0] }),
    part(box(0.08, 0.5, 0.42), 0x2e2219, { pos: [0, 0.55, 0.05], rot: [0.75, 0, 0] }),
  ];
  if (type === 'knight' || type === 'commander' || type === 'king') P.push(part(rbox(0.3, 0.2, 0.5, 0.08), STEEL, { pos: [0, 0.68, 0.52], rot: [0.55, 0, 0] }));
  return merge(P);
}
function horseLegGeo(type) {
  const coat = coatOf(type);
  return merge([
    part(capsule(0.1, 0.45, 3, 8), coat, { pos: [0, -0.3, 0] }),
    part(capsule(0.065, 0.36, 3, 8), coat, { pos: [0, -0.78, 0] }),
    part(cyl(0.085, 0.1, 0.12, 8), 0x2a1f18, { pos: [0, -1.02, 0.01] }),
  ]);
}

// ---------------------------------------------------------------- instanced part pools
class Pool {
  constructor(scene, geo, mat, cap) {
    this.scene = scene; this.geo = geo; this.mat = mat;
    this.make(cap);
  }
  make(cap) {
    if (this.mesh) { this.scene.remove(this.mesh); this.mesh.dispose(); }
    this.cap = cap;
    this.flash = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
    this.trim = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    this.flash.setUsage(THREE.DynamicDrawUsage); this.trim.setUsage(THREE.DynamicDrawUsage);
    this.geo.setAttribute('aFlash', this.flash);
    this.geo.setAttribute('aTrim', this.trim);
    this.mesh = new THREE.InstancedMesh(this.geo, this.mat, cap);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = this.shadow !== false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.n = 0; this.want = 0;
    this.scene.add(this.mesh);
  }
  // grows (doubling) when more men of this type are on the field than it holds
  begin() { if (this.want > this.cap) this.make(Math.ceil(this.want * 1.5)); this.n = 0; this.want = 0; }
  push(m, team, flash) {
    this.want++;
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.mesh.setMatrixAt(i, m);
    const T = TEAM[team];
    this.mesh.instanceColor.setXYZ(i, T.main.r, T.main.g, T.main.b);
    this.trim.setXYZ(i, T.trim.r, T.trim.g, T.trim.b);
    this.flash.setX(i, flash);
  }
  end() {
    this.mesh.count = this.n;
    this.mesh.visible = this.n > 0;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor.needsUpdate = true;
    this.flash.needsUpdate = true; this.trim.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- banners
const GLYPH = {
  spear: (g) => { g.beginPath(); g.moveTo(64, 14); g.lineTo(76, 44); g.lineTo(68, 44); g.lineTo(68, 112); g.lineTo(60, 112); g.lineTo(60, 44); g.lineTo(52, 44); g.closePath(); g.fill(); },
  sword: (g) => { g.fillRect(59, 20, 10, 70); g.fillRect(42, 86, 44, 9); g.fillRect(60, 95, 8, 18); g.beginPath(); g.moveTo(59, 20); g.lineTo(64, 10); g.lineTo(69, 20); g.fill(); },
  bow: (g) => { g.lineWidth = 9; g.beginPath(); g.arc(46, 64, 44, -1.05, 1.05); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(68, 26); g.lineTo(68, 102); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(40, 64); g.lineTo(104, 64); g.stroke(); g.beginPath(); g.moveTo(104, 64); g.lineTo(92, 56); g.lineTo(92, 72); g.fill(); },
  xbow: (g) => { g.fillRect(58, 30, 12, 80); g.lineWidth = 8; g.beginPath(); g.arc(64, 74, 40, -2.6, -0.54); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(30, 52); g.lineTo(98, 52); g.stroke(); },
  heal: (g) => { g.fillRect(56, 18, 16, 92); g.fillRect(30, 42, 68, 16); g.beginPath(); g.arc(64, 64, 34, 0, 6.28); g.lineWidth = 4; g.stroke(); },
  horse: (g) => { g.beginPath(); g.moveTo(30, 108); g.lineTo(40, 70); g.quadraticCurveTo(50, 40, 74, 30); g.lineTo(84, 14); g.lineTo(90, 30); g.quadraticCurveTo(106, 44, 100, 60); g.lineTo(84, 56); g.quadraticCurveTo(70, 70, 76, 108); g.closePath(); g.fill(); },
  knight: (g) => { g.beginPath(); g.moveTo(34, 20); g.lineTo(94, 20); g.lineTo(94, 80); g.quadraticCurveTo(64, 116, 34, 80); g.closePath(); g.fill(); g.globalCompositeOperation = 'destination-out'; g.fillRect(40, 44, 48, 8); g.fillRect(60, 52, 8, 22); g.globalCompositeOperation = 'source-over'; },
  crown: (g) => { g.beginPath(); g.moveTo(24, 96); g.lineTo(24, 40); g.lineTo(44, 64); g.lineTo(64, 28); g.lineTo(84, 64); g.lineTo(104, 40); g.lineTo(104, 96); g.closePath(); g.fill(); },
  shovel: (g) => { g.fillRect(60, 14, 8, 60); g.beginPath(); g.moveTo(44, 74); g.lineTo(84, 74); g.lineTo(78, 112); g.lineTo(50, 112); g.closePath(); g.fill(); },
};

// draw one banner (128 x 192) into a 2D context at (ox, oy)
function drawBanner(g, ox, oy, team, glyph, vet) {
  const TH = teamHex(team), main = TH.main, trim = TH.trim, ink = TH.ink;
  g.save();
  g.translate(ox, oy);
  g.beginPath(); g.rect(0, 0, 128, 192); g.clip();
  g.clearRect(0, 0, 128, 192);
  g.fillStyle = main; g.fillRect(0, 0, 128, 192);
  g.globalCompositeOperation = 'destination-out';
  g.beginPath(); g.moveTo(0, 192); g.lineTo(64, 150); g.lineTo(128, 192); g.closePath(); g.fill();
  g.globalCompositeOperation = 'source-over';
  g.strokeStyle = trim; g.lineWidth = 8;
  g.beginPath(); g.moveTo(4, 0); g.lineTo(4, 188); g.lineTo(64, 148); g.lineTo(124, 188); g.lineTo(124, 0); g.stroke();
  g.fillStyle = trim; g.fillRect(0, 0, 128, 14);
  g.fillStyle = ink; g.strokeStyle = ink;
  g.save(); g.translate(0, 22); (GLYPH[glyph] || GLYPH.spear)(g); g.restore();
  g.fillStyle = '#e2b33c';
  for (let k = 0; k < vet; k++) { g.beginPath(); const y = 150 - k * 14; g.moveTo(34, y); g.lineTo(64, y - 12); g.lineTo(94, y); g.lineTo(94, y + 6); g.lineTo(64, y - 6); g.lineTo(34, y + 6); g.fill(); }
  g.restore();
}

// ---------------------------------------------------------------- distance LODs
// LOD1: one merged low-poly figure per type (about 200 triangles), LOD2: a tiny pawn. Both take
// the team colour from the instance colour, like the full part meshes.
function lowSoldierGeo(type, look) {
  const cav = UNIT_TYPES[type].tags.includes('cavalry');
  const P = [];
  const robe = look === 'healer';
  const y0 = cav ? 1.87 : 0.86;     // hip height (a rider sits on the saddle)
  if (cav) {
    const coat = coatOf(type);
    P.push(part(new THREE.CapsuleGeometry(0.46, 1.25, 2, 6), coat, { rot: [Math.PI / 2, 0, 0], pos: [0, 1.32, 0] }));
    P.push(part(new THREE.BoxGeometry(0.88, 0.5, 0.72), 1, { pos: [0, 1.6, 0.05], team: 1 }));
    P.push(part(new THREE.BoxGeometry(0.28, 0.32, 0.75), coat, { pos: [0, 2.05, 1.25], rot: [0.6, 0, 0] }));
    for (const [lx, lz] of [[0.25, 0.78], [-0.25, 0.78], [0.25, -0.72], [-0.25, -0.72]]) P.push(part(new THREE.BoxGeometry(0.16, 1.1, 0.16), coat, { pos: [lx, 0.62, lz] }));
  } else {
    for (const sx of [0.13, -0.13]) P.push(part(new THREE.BoxGeometry(0.2, 0.84, 0.22), robe ? 0xd9cfb9 : TROUSER, { pos: [sx, 0.42, 0] }));
  }
  P.push(part(new THREE.BoxGeometry(0.5, 0.66, 0.36), 1, { pos: [0, y0 + 0.3, 0], team: 1 }));
  P.push(part(new THREE.BoxGeometry(0.54, 0.08, 0.38), 1, { pos: [0, y0 - 0.02, 0], team: 2 }));
  P.push(part(new THREE.SphereGeometry(0.24, 7, 5), SKIN, { pos: [0, y0 + 0.88, 0.02] }));
  const helm = { spear: DARKSTEEL, sword: STEEL, knight: STEEL, commander: STEEL, king: 0xe0b040, archer: 0x55613a, healer: 0xd9cfb9, sapper: 0x6b4a30, outrider: LEATHER, xbow: 1 }[look];
  if (helm !== undefined) P.push(part(new THREE.SphereGeometry(0.26, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), helm, { pos: [0, y0 + 0.93, 0.02], team: helm === 1 ? 1 : 0 }));
  for (const sx of [0.33, -0.33]) P.push(part(new THREE.BoxGeometry(0.17, 0.6, 0.17), robe ? 0xefe6d2 : LEATHER, { pos: [sx, y0 + 0.3, 0.06], rot: [-0.25, 0, 0] }));
  if (look === 'spear') P.push(part(new THREE.CylinderGeometry(0.03, 0.03, 2.9, 4), WOOD, { pos: [-0.4, y0 + 0.9, 0.18] }));
  else if (look === 'sword' || look === 'outrider' || look === 'commander' || look === 'king') P.push(part(new THREE.BoxGeometry(0.07, 0.95, 0.03), STEEL, { pos: [-0.36, y0 + 0.05, 0.3], rot: [0.9, 0, 0] }));
  else if (look === 'knight') P.push(part(new THREE.CylinderGeometry(0.04, 0.07, 3.6, 4), 0xe8e0d0, { pos: [-0.32, y0 + 0.25, -0.2], rot: [0.3, 0, 0] }));
  else if (look === 'archer') P.push(part(new THREE.BoxGeometry(0.05, 1.3, 0.05), 0x6e4a2a, { pos: [0.4, y0 + 0.2, 0.2] }));
  else if (look === 'healer') P.push(part(new THREE.CylinderGeometry(0.03, 0.03, 1.9, 4), 0x8a6a44, { pos: [-0.38, y0 + 0.2, 0.2] }));
  else if (look === 'sapper') P.push(part(new THREE.BoxGeometry(0.25, 0.3, 0.05), DARKSTEEL, { pos: [-0.38, y0 + 0.3, -0.1] }));
  if (look === 'sword') P.push(part(new THREE.BoxGeometry(0.55, 0.8, 0.06), 1, { pos: [0.35, y0 + 0.3, 0.3], team: 1 }));
  if (look === 'commander' || look === 'king') P.push(part(new THREE.BoxGeometry(0.6, 1.1, 0.05), 1, { pos: [0, y0 + 0.1, -0.24], team: 1, shade: 0.8 }));
  return merge(P);
}
function pawnGeo(cav) {
  const P = [];
  if (cav) { P.push(part(new THREE.BoxGeometry(0.9, 0.9, 2.2), 0x6e4a32, { pos: [0, 1.3, 0] })); P.push(part(new THREE.BoxGeometry(0.2, 1.0, 0.2), 0x6e4a32, { pos: [0, 0.5, 0] })); }
  const y0 = cav ? 1.9 : 0.85;
  if (!cav) P.push(part(new THREE.BoxGeometry(0.42, 0.86, 0.3), TROUSER, { pos: [0, 0.43, 0] }));
  P.push(part(new THREE.BoxGeometry(0.62, 0.8, 0.42), 1, { pos: [0, y0 + 0.3, 0], team: 1 }));
  P.push(part(new THREE.BoxGeometry(0.36, 0.36, 0.36), SKIN, { pos: [0, y0 + 0.88, 0] }));
  return merge(P);
}

// ---------------------------------------------------------------- renderer
export function createUnitRenderer(scene, opts = {}) {
  const mat = teamMaterial({ roughness: 0.7 });
  const metal = teamMaterial({ roughness: 0.38, metalness: 0.55 });
  const types = Object.keys(UNIT_TYPES);
  const pools = {}, lod1 = {};
  const lookOf = (type) => UNIT_TYPES[type].look || type;
  const geoCache = {};
  for (const type of types) {
    const def = UNIT_TYPES[type];
    if (def.engine) continue;
    const look = lookOf(type);
    const cav = def.tags.includes('cavalry');
    const cap = type === 'king' ? 4 : cav ? 80 : 120;
    const G = geoCache[look] || (geoCache[look] = { torso: torsoGeo(look), head: headGeo(look), arm: armGeo(look), leg: legGeo(look === 'healer'), weapon: weaponGeo(look === 'outrider' || look === 'commander' ? 'sword' : look), shield: look === 'sword' ? shieldGeo() : null });
    const P = {
      torso: new Pool(scene, G.torso.clone(), look === 'knight' ? metal : mat, cap),
      head: new Pool(scene, G.head.clone(), look === 'knight' || look === 'sword' ? metal : mat, cap),
      arm: new Pool(scene, G.arm.clone(), mat, cap * 2),
      leg: new Pool(scene, G.leg.clone(), mat, cap * 2),
    };
    if (G.weapon) P.weapon = new Pool(scene, G.weapon.clone(), metal, cap);
    if (G.shield) P.shield = new Pool(scene, G.shield.clone(), mat, cap);
    if (cav) {
      P.hbody = new Pool(scene, horseBodyGeo(type), mat, cap);
      P.hhead = new Pool(scene, horseHeadGeo(type), mat, cap);
      P.hleg = new Pool(scene, horseLegGeo(type), mat, cap * 4);
    }
    // small parts (arms, weapons, shields, horse legs) cast no shadow: half the shadow-pass triangles
    for (const k of ['arm', 'weapon', 'shield', 'hleg']) if (P[k]) { P[k].shadow = false; P[k].mesh.castShadow = false; }
    pools[type] = P;
    lod1[type] = new Pool(scene, lowSoldierGeo(type, look), mat, 64);
    lod1[type].shadow = false; lod1[type].mesh.castShadow = false;
  }
  const pawn = { foot: new Pool(scene, pawnGeo(false), mat, 256), cav: new Pool(scene, pawnGeo(true), mat, 64) };
  pawn.foot.shadow = pawn.cav.shadow = false; pawn.foot.mesh.castShadow = pawn.cav.mesh.castShadow = false;
  // siege engines: a body and a moving arm each; their crews are drawn with the sapper parts
  const ENG = { ram: [ramBody, ramLog], mangonel: [mangonelBody, mangonelArm], trebuchet: [trebuchetBody, trebuchetArm], siegeTower: [siegeTowerBody, siegeTowerArm], ballista: [ballistaBody, ballistaArm] };
  const engPools = {};
  for (const k in ENG) engPools[k] = { body: new Pool(scene, ENG[k][0](), mat, 12), arm: new Pool(scene, ENG[k][1](), mat, 12) };

  // selection rings and healer foot glows
  const ringGeo = new THREE.RingGeometry(0.42, 0.56, 28); ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -4 });
  const rings = new THREE.InstancedMesh(ringGeo, ringMat, 1200);
  rings.setColorAt(0, new THREE.Color()); rings.count = 0; rings.frustumCulled = false; rings.renderOrder = 3;
  scene.add(rings);
  const glowGeo = new THREE.CircleGeometry(0.9, 24); glowGeo.rotateX(-Math.PI / 2);
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec2 vU; void main(){ vU = position.xz; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position,1.); }',
    fragmentShader: 'uniform float uTime; varying vec2 vU; void main(){ float d = length(vU)/0.9; float a = (1.0-smoothstep(0.0,1.0,d)) * 0.55 + smoothstep(0.65,0.8,d)*(1.0-smoothstep(0.8,0.95,d))*0.7; gl_FragColor = vec4(mix(vec3(0.75,1.0,0.5), vec3(1.0,0.86,0.45), d) * a * (0.75+0.25*sin(uTime*3.0)), 1.0); }',
  });
  const glows = new THREE.InstancedMesh(glowGeo, glowMat, 160);
  glows.count = 0; glows.frustumCulled = false; glows.renderOrder = 3;
  scene.add(glows);

  // ---- banners: one instanced pole, one instanced cloth over a banner atlas
  const atlas = document.createElement('canvas'); atlas.width = 2048; atlas.height = 1920;
  const ag = atlas.getContext('2d');
  const atlasTex = new THREE.CanvasTexture(atlas);
  atlasTex.colorSpace = THREE.SRGBColorSpace; atlasTex.anisotropy = 4; atlasTex.flipY = true;
  const tileOf = new Map();
  function bannerTile(team, glyph, vet) {
    const key = team + '|' + glyph + '|' + vet;
    let t = tileOf.get(key);
    if (t !== undefined) return t;
    t = tileOf.size % 160;
    const cx = (t % 16) * 128, cy = Math.floor(t / 16) * 192;
    drawBanner(ag, cx, cy, team, glyph, vet);
    atlasTex.needsUpdate = true;
    tileOf.set(key, t);
    return t;
  }
  const poleGeo = merge([part(cyl(0.035, 0.045, 4.6, 7), 0x5a4330, { pos: [0, 2.3, 0] }), part(sphere(0.07, 8, 6), 0xd8b048, { pos: [0, 4.65, 0] }), part(cyl(0.02, 0.02, 1.35, 5), 0x5a4330, { pos: [0.66, 4.45, 0], rot: [0, 0, Math.PI / 2] })]);
  const poleMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  const BCAP = 600;
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, BCAP);
  poles.castShadow = true; poles.frustumCulled = false; poles.count = 0; poles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(poles);
  const clothGeo = new THREE.PlaneGeometry(1.3, 1.95, 10, 6); clothGeo.translate(0.65, 0, 0);
  const aTile = new THREE.InstancedBufferAttribute(new Float32Array(BCAP * 2), 2); aTile.setUsage(THREE.DynamicDrawUsage);
  const aWave = new THREE.InstancedBufferAttribute(new Float32Array(BCAP * 2), 2); aWave.setUsage(THREE.DynamicDrawUsage);
  clothGeo.setAttribute('aTile', aTile); clothGeo.setAttribute('aWave', aWave);
  const bannerU = { uTime: { value: 0 } };
  const clothMat = new THREE.MeshStandardMaterial({ map: atlasTex, side: THREE.DoubleSide, alphaTest: 0.5, roughness: 0.8 });
  clothMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = bannerU.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime; attribute vec2 aTile; attribute vec2 aWave;')
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        #ifdef USE_MAP
        vMapUv = vec2((aTile.x + uv.x) / 16.0, 1.0 - (aTile.y + 1.0 - uv.y) / 10.0);
        #endif`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float u = clamp(transformed.x / 1.3, 0.0, 1.0);
        float ph = uTime * 4.0 - transformed.x * 3.2 + transformed.y * 0.8 + aWave.y;
        transformed.z += sin(ph) * 0.13 * u * aWave.x + sin(ph * 1.7) * 0.05 * u * aWave.x;
        transformed.y -= u * u * 0.12 * (1.0 - aWave.x * 0.6);`);
  };
  const cloths = new THREE.InstancedMesh(clothGeo, clothMat, BCAP);
  cloths.castShadow = true; cloths.frustumCulled = false; cloths.count = 0; cloths.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(cloths);
  const selGeo = new THREE.TorusGeometry(0.22, 0.04, 6, 18);
  const sels = new THREE.InstancedMesh(selGeo, new THREE.MeshBasicMaterial({ color: 0xffe9a8, toneMapped: false }), 300);
  sels.frustumCulled = false; sels.count = 0;
  scene.add(sels);
  const banners = new Map();     // squad id -> { x, y, z, f, s, vis } (for picking)

  // scratch matrices
  const M = { root: new THREE.Matrix4(), torso: new THREE.Matrix4(), t: new THREE.Matrix4(), t2: new THREE.Matrix4(), out: new THREE.Matrix4(), arm: new THREE.Matrix4(), hand: new THREE.Matrix4(), horse: new THREE.Matrix4() };
  const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  const TR = (x, y, z, rx = 0, ry = 0, rz = 0, sc = 1) => { e.set(rx, ry, rz, 'YXZ'); q.setFromEuler(e); v.set(x, y, z); s1.set(sc, sc, sc); return M.t.compose(v, q, s1); };
  const mul = (a, b, out) => out.multiplyMatrices(a, b);
  const ringM = new THREE.Matrix4(), ringC = new THREE.Color();
  const frustum = new THREE.Frustum(), pm = new THREE.Matrix4();
  const planes = frustum.planes;
  const inView = (x, y, z, r) => { for (let i = 0; i < 6; i++) { const p = planes[i]; if (p.normal.x * x + p.normal.y * y + p.normal.z * z + p.constant < -r) return false; } return true; };
  let lodScale = opts.lodScale || 1;
  const stats = { lod0: 0, lod1: 0, lod2: 0, culled: 0, banners: 0 };

  function sync(world, alpha, t, sel, hover, heightAt, camera, seen) {
    for (const type of types) { const P = pools[type]; if (!P) continue; for (const k in P) P[k].begin(); lod1[type].begin(); }
    pawn.foot.begin(); pawn.cav.begin();
    for (const k in engPools) { engPools[k].body.begin(); engPools[k].arm.begin(); }
    let rc = 0, gc = 0;
    bannerU.uTime.value = t;
    glowMat.uniforms.uTime.value = t;
    stats.lod0 = stats.lod1 = stats.lod2 = stats.culled = 0;
    let cpx = 0, cpy = 0, cpz = 0, cull = false;
    if (camera) {
      camera.updateMatrixWorld();
      pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
      frustum.setFromProjectionMatrix(pm);
      cpx = camera.position.x; cpy = camera.position.y; cpz = camera.position.z; cull = true;
    }
    const R0 = 125 * lodScale, R1 = 430 * lodScale, R0s = R0 * R0, R1s = R1 * R1;
    const FAR = camera ? camera.far : 1e9, FARs = FAR * FAR;
    for (const so of world.soldiers) {
      const sq = so.sq;
      if (so.fled) continue;
      const def = sq.def, type = sq.type, P = pools[type], look = def.look || type;
      const cav = def.tags.includes('cavalry');
      const x = so.px !== undefined ? so.px + (so.x - so.px) * alpha : so.x;
      const z = so.pz !== undefined ? so.pz + (so.z - so.pz) * alpha : so.z;
      let y = so.py !== undefined ? so.py + (so.y - so.py) * alpha : so.y;
      const dead = !so.alive;
      const dt = dead ? world.t - so.deadT : 0;
      if (dead && dt > 26) continue;
      if (seen && sq.team !== 0 && !seen(x, z)) { stats.culled++; continue; }   // fog of war
      let d2 = 0;
      if (cull) {
        d2 = (x - cpx) ** 2 + (y - cpy) ** 2 + (z - cpz) ** 2;
        if (d2 > FARs || !inView(x, y + 1, z, def.engine ? 5 : cav ? 2.6 : 1.6)) { stats.culled++; continue; }
        if (d2 > R0s && !def.engine) {
          if (dead) continue;
          if (heightAt && !sq.garrison) y = heightAt(x, z);
          const moving = (so.spd || 0) > 0.4;
          const bob = moving ? Math.abs(Math.sin(t * 9 + so.phase)) * 0.07 : 0;
          e.set(0, so.facing, 0, 'YXZ'); q.setFromEuler(e);
          M.root.compose(v.set(x, y + bob, z), q, s1.set(1, 1, 1));
          if (d2 > R1s) { (cav ? pawn.cav : pawn.foot).push(M.root, sq.team, 0); stats.lod2++; }
          else { lod1[type].push(M.root, sq.team, 0); stats.lod1++; }
          continue;
        }
      }
      stats.lod0++;
      if (heightAt && !sq.garrison && !(so.fallT > 0 && !dead)) y = heightAt(x, z);
      const flash = dead ? 0 : Math.max(0, 1 - (world.t - so.hitT) / 0.1) * 0.45 + (type === 'healer' && so.act === 'heal' ? 0.08 + 0.06 * Math.sin(t * 6 + so.phase) : 0);
      const spd = so.spd || 0;
      so.animPh = (so.animPh || so.phase) + (spd * (cav ? 1.25 : 2.6)) * (1 / 60);
      const ph = so.animPh;
      if (def.engine) {
        // ---- a siege engine: body, moving arm, and its crew
        const EP = engPools[def.engine];
        const sinkE = dead && dt > 18 ? (dt - 18) * 0.15 : 0;
        e.set(0, so.facing, 0, 'YXZ'); q.setFromEuler(e);
        M.root.compose(v.set(x, y - sinkE, z), q, s1.set(1, 1, 1));
        if (dead) mul(M.root, TR(0, 0, 0, Math.min(1, dt / 1.2) * 0.12, 0, Math.min(1, dt / 1.2) * 0.32), M.root);
        else if (spd > 0.3) mul(M.root, TR(0, Math.abs(Math.sin(t * 5 + so.phase)) * 0.05, 0, Math.sin(t * 3.3 + so.phase) * 0.012, 0, 0), M.root);
        EP.body.push(M.root, sq.team, flash);
        const since = world.t - so.shotT, swing = world.t - so.swingT;
        const R = def.ranged, rr = R ? Math.max(0, Math.min(1, so.reload / R.reload)) : 0;
        if (def.engine === 'ram') {
          const iv = def.siege.interval;
          const off = sq.mode === 'bash' ? (swing < 0.15 ? 0.7 * (swing / 0.15) : 0.7 - Math.min(1.6, (swing - 0.15) / (iv - 0.15) * 1.6)) : 0;
          mul(M.root, TR(0, 1.75, off, 0, 0, 0), M.out);
        } else if (def.engine === 'siegeTower') {
          // the drawbridge drops forward onto the wall as the tower docks
          const k = sq.mode === 'bash' ? Math.min(1, (sq.dockT || 0) / Math.max(1, def.siege.dock)) : 0;
          mul(M.root, TR(0, 12.3, 1.9, k * 1.45, 0, 0), M.out);
        } else if (def.engine === 'ballista') {
          const a = since < 0.2 ? -0.08 : -0.02 - 0.06 * rr;
          mul(M.root, TR(0, 1.95, 0, a, 0, 0), M.out);
        } else if (def.engine === 'mangonel') {
          const a = since < 0.25 ? -1.2 + 1.55 * (since / 0.25) : dead ? -0.3 : -1.2 + 1.55 * rr;
          mul(M.root, TR(0, 1.0, -0.4, a, 0, 0), M.out);
        } else {
          const a = since < 0.6 ? -0.75 + 3.05 * Math.sin((since / 0.6) * Math.PI / 2) : dead ? 0.2 : -0.75 + 3.05 * rr;
          mul(M.root, TR(0, 6.6, 0, a, 0, 0), M.out);
        }
        EP.arm.push(M.out, sq.team, flash);
        if (!dead) {
          const crew = Math.ceil(def.crew * Math.max(0.15, Math.min(1, so.hp / so.maxHp * 1.4)));
          const CP = pools.sapper;
          const moving = spd > 0.3, work = sq.mode === 'shoot' && R && (so.reload > 0.6) || sq.mode === 'bash';
          for (let k = 0; k < crew; k++) {
            const sd = k % 2 ? 1 : -1, row = Math.floor(k / 2);
            const lx = def.engine === 'trebuchet' ? sd * 2.3 : sd * 1.6, lz = (def.engine === 'ram' ? -1.6 + row * 1.6 : -1.2 - row * 1.2);
            const cph = ph * 1.6 + k * 1.3;
            mul(M.root, TR(lx, 0, lz, 0, moving ? 0 : sd * -0.6, 0), M.t2);
            const bobc = moving ? Math.abs(Math.sin(cph)) * 0.05 : 0;
            mul(M.t2, TR(0, 0.86 + bobc, 0, moving ? 0.28 : work ? 0.15 + Math.sin(t * 5 + k) * 0.1 : 0, 0, 0), M.torso);
            CP.torso.push(M.torso, sq.team, 0);
            mul(M.torso, TR(0, 0.68, 0.02, 0, 0, 0), M.out); CP.head.push(M.out, sq.team, 0);
            for (const lxx of [0.13, -0.13]) { const la = moving ? Math.sin(cph + (lxx > 0 ? 0 : Math.PI)) * 0.55 : 0; mul(M.t2, TR(lxx, 0.86 + bobc, 0, la, 0, 0), M.out); CP.leg.push(M.out, sq.team, 0); }
            const armA = moving ? -1.35 : work ? -1.1 + Math.sin(t * 6 + k) * 0.5 : -0.2;
            for (const axx of [-0.33, 0.33]) { mul(M.torso, TR(axx, 0.58, 0, armA + (axx > 0 ? 0.05 : -0.05), 0, axx > 0 ? -0.15 : 0.15), M.out); CP.arm.push(M.out, sq.team, 0); }
          }
        }
        const isSel = sel && sel.has(sq.id), isHov = hover === sq.id;
        if (!dead && (isSel || isHov) && rc < 1200) {
          ringM.compose(v.set(x, y + 0.06, z), q.identity(), s1.set(4.2, 1, 4.2));
          rings.setMatrixAt(rc, ringM);
          ringC.set(sq.team === 0 ? (isSel ? 0xfff1c4 : 0xb8d8ff) : 0xff7a66);
          rings.setColorAt(rc, ringC);
          rc++;
        }
        continue;
      }
      // ---- root (with death fall)
      let fall = 0, sink = 0, side = 0;
      if (dead) {
        const k = Math.min(1, dt / 0.55);
        fall = (1 - Math.pow(1 - k, 2)) * 1.45;
        if (dt > 20) sink = (dt - 20) * 0.22;
        if (cav) { side = fall * 0.95; fall *= 0.2; }
      } else if (so.knockUntil > world.t) fall = 0.9;
      e.set(0, so.facing, 0, 'YXZ');
      q.setFromEuler(e);
      M.root.compose(v.set(x, y - sink, z), q, s1.set(1, 1, 1));
      if (fall || side) mul(M.root, TR(0, 0, 0, -fall, 0, side), M.root);
      const moving = spd > 0.4;
      const act = dead ? 'dead' : so.act;
      const team = sq.team;
      // ---- horse
      let riderBase = M.root;
      if (cav) {
        const gal = Math.min(1, spd / 6);
        const rock = moving ? Math.sin(ph * 2) * 0.06 * (0.4 + gal) : Math.sin(t * 1.2 + so.phase) * 0.01;
        mul(M.root, TR(0, 1.32 + (moving ? Math.abs(Math.sin(ph * 2)) * 0.1 * gal : 0), 0, rock, 0, 0), M.horse);
        P.hbody.push(M.horse, team, flash);
        mul(M.horse, TR(0, 0.25, 0.95, (moving ? Math.sin(ph * 2 + 1) * 0.15 : Math.sin(t * 0.8 + so.phase) * 0.05) - 0.05, 0, 0), M.out);
        P.hhead.push(M.out, team, flash);
        const legs = [[0.25, -0.15, 0.78, 0], [-0.25, -0.15, 0.78, 0.5], [0.25, -0.15, -0.72, 1.6], [-0.25, -0.15, -0.72, 2.1]];
        for (const [lx, ly, lz, off] of legs) {
          const a = moving ? Math.sin(ph * 2 + off * Math.PI * (gal > 0.6 ? 0.5 : 1)) * (0.35 + 0.35 * gal) : 0;
          mul(M.horse, TR(lx, ly, lz, a + (dead ? 0.8 : 0), 0, 0), M.out);
          P.hleg.push(M.out, team, flash);
        }
        mul(M.horse, TR(0, 0.55, 0.0, 0, 0, 0), M.torso);
        riderBase = M.torso.clone();
      }
      // ---- rider / foot soldier body
      const bob = cav ? 0 : moving ? Math.abs(Math.sin(ph)) * 0.06 : Math.sin(t * 1.6 + so.phase) * 0.012;
      const lean = cav ? (moving ? 0.15 : 0) : spd > 5 ? 0.22 : moving ? 0.08 : 0;
      const swingK = Math.max(0, 1 - (world.t - so.swingT) / 0.45);
      let twist = 0;
      if (look === 'sword' || look === 'outrider' || look === 'commander' || look === 'king') twist = swingK > 0 ? Math.sin(swingK * Math.PI) * 0.45 : 0;
      const hip = cav ? 0 : 0.86;
      if (cav) mul(riderBase, TR(0, 0.05, -0.05, lean, twist, 0), M.torso);
      else mul(M.root, TR(0, hip + bob, 0, lean, twist, 0), M.torso);
      P.torso.push(M.torso, team, flash);
      mul(M.torso, TR(0, 0.68, 0.02, (act === 'aim' ? 0.05 : 0) - lean * 0.6, 0, 0), M.out);
      P.head.push(M.out, team, flash);
      // ---- legs
      if (cav) {
        for (const sx of [0.2, -0.2]) { mul(M.torso, TR(sx, -0.02, 0.12, -1.25, 0, sx > 0 ? -0.45 : 0.45), M.out); P.leg.push(M.out, team, flash); }
      } else {
        const amp = moving ? (spd > 5 ? 0.85 : 0.55) : 0;
        for (const sx of [0.13, -0.13]) {
          const a = Math.sin(ph + (sx > 0 ? 0 : Math.PI)) * amp;
          mul(M.root, TR(sx, hip + bob, 0, a, 0, 0), M.out);
          P.leg.push(M.out, team, flash);
        }
      }
      // ---- arms + weapon by action
      const armSwing = moving && !cav ? Math.sin(ph) * 0.45 : 0;
      let aR = [0.1 - armSwing, 0, 0], aL = [0.1 + armSwing, 0, 0];
      let wpn = null;          // [matrix-base, x,y,z, rx,ry,rz] in torso space
      const shoot = Math.max(0, 1 - (world.t - so.shotT) / 0.35);
      const breathe = Math.sin(t * 1.6 + so.phase) * 0.04;
      switch (look) {
        case 'spear': {
          const lowered = act === 'melee' || (sq.stance === 'hold' && sq.mode !== 'idle' && sq.target) || (sq.stance === 'hold' && sq.inContact);
          if (lowered) {
            const thrust = swingK > 0 ? Math.sin(swingK * Math.PI) * 0.55 : 0;
            aR = [-1.25, 0, 0.15]; aL = [-1.05, 0, -0.35];
            wpn = [-0.18, 0.42, 0.2 + thrust, Math.PI / 2 - 0.08, 0, 0];
          } else {
            aR = [-0.35 + armSwing * 0.3 + breathe, 0, 0.12];
            wpn = [-0.4, 0.6, 0.18, 0.02, 0, 0];
          }
          break;
        }
        case 'sapper': {
          if (act === 'dig' || act === 'build') { const w = Math.sin(t * 6 + so.phase); aR = [-1.0 + w * 0.55, 0, 0.25]; aL = [-1.1 + w * 0.55, 0, -0.25]; wpn = [0, 0.15 + w * 0.18, 0.5, 1.9 + w * 0.5, 0, 0]; }
          else if (act === 'melee' || swingK > 0) { const k = swingK; aR = [-2.2 + (1 - k) * 1.6, 0, 0.2]; aL = [-1.6 + (1 - k) * 1.2, 0, -0.2]; wpn = [0, 0.75 - (1 - k) * 0.5, 0.35, 0.6 + (1 - k) * 1.2, 0, 0]; }
          else { aR = [-0.35 + armSwing * 0.3 + breathe, 0, 0.12]; wpn = [-0.38, 0.2, -0.12, 0.25, 0, 0]; }
          break;
        }
        case 'sword': case 'outrider': case 'commander': case 'king': {
          if (act === 'melee' || swingK > 0) {
            const k = swingK;
            const raise = k > 0.55 ? (1 - k) / 0.45 : k / 0.55;
            aR = [-2.7 + (1 - raise) * 2.2 * (k > 0 ? 1 : 0), 0, 0.25];
            if (k === 0) aR = [-1.9, 0, 0.3];
          } else aR = [-0.45 + armSwing * 0.5 + breathe, 0, 0.12];
          aL = look === 'sword' ? [-1.0, 0, -0.25] : aL;
          if (sq.shieldWall) aL = [-1.4, 0, -0.1];
          break;
        }
        case 'archer': {
          if (act === 'shoot' || act === 'aim') {
            const draw = so.reload > 0 ? Math.max(0, 1 - so.reload / (def.ranged.reload * 0.75)) : 1;
            aL = [-1.5, 0, -0.08];
            aR = [-1.5 + (1 - shoot) * 0.1, 0, 0.5 + draw * 0.45 - shoot * 0.5];
            if (draw < 0.15 && shoot === 0) aR = [-0.4, 0, 0.2];   // reaching for an arrow
          } else aL = [-0.55 + armSwing * 0.3, 0, -0.05];
          break;
        }
        case 'xbow': {
          if (act === 'shoot' || act === 'aim') {
            const reloading = so.reload > 0.8 && shoot === 0;
            if (reloading) { aR = [-0.9 + Math.sin(t * 9 + so.phase) * 0.35, 0, 0.3]; aL = [-0.7, 0, -0.35]; wpn = [0, 0.05, 0.42, 1.1, 0, 0]; }
            else { aR = [-1.35, 0, 0.35]; aL = [-1.45, 0, -0.45]; wpn = [-0.05, 0.42, 0.3, -0.04 + shoot * -0.25, 0, 0]; }
          } else { aR = [-0.75, 0, 0.3]; aL = [-0.75, 0, -0.35]; wpn = [0, 0.1, 0.42, 0.6, 0, 0]; }
          break;
        }
        case 'healer': {
          if (act === 'heal') { const w = Math.sin(t * 2.2 + so.phase) * 0.15; aR = [-2.4 + w, 0, 0.45]; aL = [-2.4 - w, 0, -0.45]; }
          else aR = [-0.3 + armSwing * 0.3, 0, 0.1];
          wpn = act === 'heal' ? [0.45, 0.75, 0.3, 0.15, 0, -0.2] : [-0.38, 0.1, 0.2, 0.04, 0, 0];
          break;
        }
        case 'knight': {
          const couched = moving && spd > 3 || act === 'melee';
          aR = couched ? [-1.2, 0, 0.2] : [-0.5, 0, 0.15];
          wpn = couched ? [-0.32, 0.25, -0.6, Math.PI / 2 - 0.05, 0.08, 0] : [-0.36, -0.55, 0.15, 0.25, 0, 0];
          break;
        }
      }
      if (cav && look !== 'knight' && !(act === 'melee' || swingK > 0)) aR = [-0.6, 0, 0.15];
      if (cav) aL = [-0.9, 0, -0.2];
      if (dead) { aR = [-2.6, 0, 0.6]; aL = [-2.6, 0, -0.6]; }
      mul(M.torso, TR(-0.33, 0.58, 0, aR[0], aR[1], aR[2]), M.arm);
      P.arm.push(M.arm, team, flash);
      const armR = M.arm.clone();
      mul(M.torso, TR(0.33, 0.58, 0, aL[0], aL[1], aL[2]), M.arm);
      P.arm.push(M.arm, team, flash);
      const armL = M.arm;
      if (P.weapon) {
        if (wpn) mul(M.torso, TR(wpn[0], wpn[1], wpn[2], wpn[3], wpn[4], wpn[5]), M.out);
        else if (look === 'archer') mul(armL, TR(0, -0.5, 0.02, Math.PI / 2, 0, 0), M.out);
        else mul(armR, TR(0, -0.52, 0.02, Math.PI / 2 + 0.15, 0, 0), M.out);
        P.weapon.push(M.out, team, flash);
      }
      if (P.shield) {
        if (sq.shieldWall) mul(M.torso, TR(0.15, 0.42, 0.42, 0, 0, 0, 1.25), M.out);
        else mul(armL, TR(0.1, -0.36, 0.14, Math.PI / 2 - 0.2, 0.15, 0), M.out);
        P.shield.push(M.out, team, flash);
      }
      const isSel = sel && sel.has(sq.id), isHov = hover === sq.id;
      if (!dead && (isSel || isHov) && rc < 1200) {
        const r = cav ? 1.9 : 1;
        ringM.compose(v.set(x, y + 0.06, z), q.identity(), s1.set(r, 1, r));
        rings.setMatrixAt(rc, ringM);
        ringC.set(team === 0 ? (isSel ? 0xfff1c4 : 0xb8d8ff) : 0xff7a66);
        rings.setColorAt(rc, ringC);
        rc++;
      }
      if (!dead && type === 'healer' && gc < 160) {
        ringM.compose(v.set(x, y + 0.05, z), q.identity(), s1.set(1, 1, 1));
        glows.setMatrixAt(gc++, ringM);
      }
    }
    for (const type of types) { const P = pools[type]; if (!P) continue; for (const k in P) P[k].end(); lod1[type].end(); }
    pawn.foot.end(); pawn.cav.end();
    for (const k in engPools) { engPools[k].body.end(); engPools[k].arm.end(); }
    rings.count = rc; rings.visible = rc > 0; rings.instanceMatrix.needsUpdate = true; if (rings.instanceColor) rings.instanceColor.needsUpdate = true;
    glows.count = gc; glows.visible = gc > 0; glows.instanceMatrix.needsUpdate = true;
    // ---- banners follow a standard-bearer in the rear rank; far away they grow into badges
    let bc = 0, sc = 0;
    for (const sq of world.squads.values()) {
      const show = sq.deployed && sq.alive > 0 && sq.state !== 'gone' && !(seen && sq.team !== 0 && !seen(sq.cx, sq.cz));
      if (!show) { banners.delete(sq.id); continue; }
      let bearer = null;
      for (let i = sq.soldiers.length - 1; i >= 0; i--) if (sq.soldiers[i].alive) { bearer = sq.soldiers[i]; break; }
      if (sq.type === 'commander' || sq.type === 'king') bearer = sq.soldiers[0];
      if (!bearer) continue;
      const cav = sq.def.tags.includes('cavalry');
      const bx = bearer.px !== undefined ? bearer.px + (bearer.x - bearer.px) * alpha : bearer.x;
      const bz = bearer.pz !== undefined ? bearer.pz + (bearer.z - bearer.pz) * alpha : bearer.z;
      const by = sq.garrison ? bearer.y : heightAt ? heightAt(bx, bz) : bearer.y;
      let scale = 1;
      if (cull) {
        const d = Math.hypot(bx - cpx, by - cpy, bz - cpz);
        if (d > FAR || !inView(bx, by + 4, bz, 6 + d * 0.01)) { banners.delete(sq.id); continue; }
        scale = 1 + Math.max(0, d - 220) / 230;
        if (scale > 6) scale = 6;
      }
      if (bc >= BCAP) break;
      const f = bearer.facing;
      const eng = sq.def.engine, back = eng ? 2.4 : 0.35, sideO = eng ? 1.3 : 0.32;
      const px = bx - Math.sin(f) * back + Math.cos(f) * sideO, py = by + (cav ? 1.4 : eng ? 0.6 : 0), pz = bz - Math.cos(f) * back - Math.sin(f) * sideO;
      let st = banners.get(sq.id);
      if (!st) { st = { tilt: 0 }; banners.set(sq.id, st); }
      const wav = sq.state === 'wavering' ? Math.sin(t * 18) * 0.12 : 0;
      st.tilt += ((sq.state === 'routing' ? 0.9 : 0) - st.tilt) * 0.08;
      e.set(st.tilt, f + Math.PI / 2, wav, 'YXZ'); q.setFromEuler(e);
      M.root.compose(v.set(px, py, pz), q, s1.set(scale, scale, scale));
      poles.setMatrixAt(bc, M.root);
      mul(M.root, TR(0.02, 3.55, 0), M.out);
      cloths.setMatrixAt(bc, M.out);
      const tile = bannerTile(sq.team, sq.def.glyph, Math.min(3, sq.vet || 0));
      aTile.setXY(bc, tile % 16, Math.floor(tile / 16));
      aWave.setXY(bc, 0.6 + Math.min(1.4, (bearer.spd || 0) * 0.25), bearer.phase * 3);
      st.x = px; st.y = py + 3.6 * scale; st.z = pz; st.s = scale;
      if (sel && sel.has(sq.id) && sc < 300) {
        e.set(0, t * 2, 0, 'YXZ'); q.setFromEuler(e);
        M.out.compose(v.set(px, py + 5.05 * scale, pz), q, s1.set(scale, scale, scale));
        sels.setMatrixAt(sc++, M.out);
      }
      bc++;
    }
    poles.count = cloths.count = bc; poles.visible = cloths.visible = bc > 0;
    poles.instanceMatrix.needsUpdate = cloths.instanceMatrix.needsUpdate = true;
    aTile.needsUpdate = aWave.needsUpdate = true;
    sels.count = sc; sels.visible = sc > 0; sels.instanceMatrix.needsUpdate = true;
    stats.banners = bc;
  }

  return { sync, pools, banners, stats, setLodScale(k) { lodScale = k; } };
}
