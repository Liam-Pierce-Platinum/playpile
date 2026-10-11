// BANNERFALL :: render/engineMeshes.js - siege engines built from rounded timber: the battering
// ram (a hide-roofed shed with a hanging iron-capped log), the mangonel (a wheeled frame with a
// throwing arm and cup) and the trebuchet (a tall A-frame, a long arm, a counterweight box).
// Each has a fixed BODY and a moving ARM (log / throwing arm) posed per frame by unitMeshes.
import * as THREE from '../../vendor/three.module.js';
import { part, merge, rbox, sphere, cyl, cone, box } from './geo.js';

const WOOD = 0x7a5838, WOODD = 0x5a4028, WOODL = 0x9a7650, IRON = 0x56585c, HIDE = 0x8a6448, ROPE = 0xc8b48a;

function wheel(P, x, y, z, r = 0.62) {
  const t = new THREE.TorusGeometry(r, 0.1, 6, 16); t.rotateY(Math.PI / 2);
  P.push(part(t, WOODD, { pos: [x, y, z] }));
  P.push(part(cyl(0.16, 0.16, 0.22, 8), IRON, { pos: [x, y, z], rot: [0, 0, Math.PI / 2] }));
  for (let k = 0; k < 4; k++) P.push(part(box(0.07, r * 2 - 0.1, 0.07), WOOD, { pos: [x, y, z], rot: [k * Math.PI / 4, 0, 0] }));
}

export function ramBody() {
  const P = [];
  for (const x of [-1.15, 1.15]) P.push(part(rbox(0.22, 0.26, 5.6, 0.06), WOODD, { pos: [x, 0.75, 0] }));
  for (const z of [-2.4, -0.8, 0.8, 2.4]) P.push(part(rbox(2.5, 0.2, 0.22, 0.05), WOOD, { pos: [0, 0.8, z] }));
  for (const [x, z] of [[-1.25, -1.9], [1.25, -1.9], [-1.25, 1.9], [1.25, 1.9]]) wheel(P, x, 0.62, z);
  // A-frame posts and ridge
  for (const z of [-2.3, 0, 2.3]) for (const sx of [-1, 1]) P.push(part(cyl(0.08, 0.1, 2.7, 6), WOOD, { pos: [sx * 0.62, 2.0, z], rot: [0, 0, sx * 0.45] }));
  P.push(part(rbox(0.22, 0.22, 5.8, 0.05), WOODD, { pos: [0, 3.25, 0] }));
  // hide roof panels
  for (const sx of [-1, 1]) {
    const g = rbox(1.9, 0.12, 5.9, 0.05);
    P.push(part(g, HIDE, { pos: [sx * 0.72, 2.45, 0], rot: [0, 0, sx * 0.98], grad: 0.25 }));
    for (const z of [-2.2, -0.7, 0.8, 2.2]) P.push(part(box(0.06, 0.14, 0.12), WOODD, { pos: [sx * 0.72, 2.52, z], rot: [0, 0, sx * 0.98] }));
  }
  // chains from the ridge
  for (const z of [-1.3, 1.3]) P.push(part(cyl(0.025, 0.025, 1.2, 4), IRON, { pos: [0, 2.6, z] }));
  return merge(P);
}
export function ramLog() {
  // origin at the hanging point; the log runs along +z, iron head forward
  return merge([
    part(cyl(0.3, 0.33, 5.4, 12), 0x6a4a30, { pos: [0, 0, 0.3], rot: [Math.PI / 2, 0, 0], grad: 0.2 }),
    part(cone(0.42, 0.75, 12), IRON, { pos: [0, 0, 3.3], rot: [Math.PI / 2, 0, 0] }),
    part(cyl(0.36, 0.36, 0.3, 12), IRON, { pos: [0, 0, 2.85], rot: [Math.PI / 2, 0, 0] }),
    part(cyl(0.34, 0.34, 0.12, 12), IRON, { pos: [0, 0, -1.4], rot: [Math.PI / 2, 0, 0] }),
  ]);
}

export function mangonelBody() {
  const P = [];
  for (const x of [-0.95, 0.95]) P.push(part(rbox(0.24, 0.3, 4.4, 0.06), WOODD, { pos: [x, 0.7, 0] }));
  for (const z of [-1.8, 0, 1.8]) P.push(part(rbox(2.2, 0.22, 0.24, 0.05), WOOD, { pos: [0, 0.75, z] }));
  for (const [x, z] of [[-1.1, -1.5], [1.1, -1.5], [-1.1, 1.5], [1.1, 1.5]]) wheel(P, x, 0.55, z, 0.55);
  // the uprights that hold the axle and the crossbar the arm slaps
  for (const x of [-0.75, 0.75]) {
    P.push(part(rbox(0.2, 1.7, 0.24, 0.05), WOOD, { pos: [x, 1.6, -0.4] }));
    P.push(part(rbox(0.16, 2.6, 0.18, 0.05), WOOD, { pos: [x, 2.0, 0.5], rot: [-0.25, 0, 0] }));
  }
  P.push(part(rbox(1.7, 0.22, 0.3, 0.06), WOODL, { pos: [0, 3.15, 0.75] }));
  P.push(part(cyl(0.2, 0.2, 1.3, 10), ROPE, { pos: [0, 1.0, -0.4], rot: [0, 0, Math.PI / 2] }));
  // a pile of stones by the frame
  for (let k = 0; k < 4; k++) P.push(part(sphere(0.22, 8, 6), 0x8a8a84, { pos: [0.5 - (k % 2) * 0.35, 0.95 + (k > 1 ? 0.2 : 0), -1.7 + (k % 2) * 0.2] }));
  return merge(P);
}
export function mangonelArm() {
  // pivot at the origin (the axle); the arm points along +y with the cup on top
  return merge([
    part(rbox(0.18, 3.3, 0.18, 0.05), WOODL, { pos: [0, 1.55, 0] }),
    part(new THREE.SphereGeometry(0.42, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), WOODD, { pos: [0, 3.25, 0.12], rot: [-Math.PI / 2, 0, 0] }),
    part(sphere(0.28, 10, 8), 0x8a8a84, { pos: [0, 3.2, 0.32] }),
  ]);
}

export function trebuchetBody() {
  const P = [];
  for (const x of [-1.5, 1.5]) P.push(part(rbox(0.3, 0.34, 6.4, 0.06), WOODD, { pos: [x, 0.5, 0] }));
  for (const z of [-2.8, 0, 2.8]) P.push(part(rbox(3.4, 0.3, 0.3, 0.06), WOOD, { pos: [0, 0.55, z] }));
  for (const [x, z] of [[-1.7, -2.4], [1.7, -2.4], [-1.7, 2.4], [1.7, 2.4]]) wheel(P, x, 0.5, z, 0.5);
  // the two A-frames up to the pivot at 6.6 m
  for (const x of [-1.25, 1.25]) {
    P.push(part(rbox(0.26, 7.0, 0.26, 0.06), WOOD, { pos: [x, 3.6, -1.15], rot: [0.33, 0, 0] }));
    P.push(part(rbox(0.26, 7.0, 0.26, 0.06), WOOD, { pos: [x, 3.6, 1.15], rot: [-0.33, 0, 0] }));
    P.push(part(rbox(0.2, 0.2, 2.6, 0.05), WOODD, { pos: [x, 2.6, 0] }));
  }
  P.push(part(cyl(0.16, 0.16, 3.0, 10), IRON, { pos: [0, 6.6, 0], rot: [0, 0, Math.PI / 2] }));
  P.push(part(rbox(2.8, 0.2, 0.24, 0.05), WOODD, { pos: [0, 4.2, -0.75] }));
  // a sling trough along the base
  P.push(part(rbox(0.8, 0.12, 3.4, 0.04), WOODL, { pos: [0, 0.8, -1.3] }));
  return merge(P);
}
export function trebuchetArm() {
  // pivot at the origin; long arm along -z with the sling, counterweight box hanging at +z
  return merge([
    part(rbox(0.26, 0.28, 9.6, 0.06), WOODL, { pos: [0, 0, -2.6] }),
    part(rbox(1.5, 1.4, 1.5, 0.12), WOODD, { pos: [0, -1.0, 2.0] }),
    part(rbox(1.62, 0.16, 1.62, 0.04), IRON, { pos: [0, -0.35, 2.0] }),
    part(cyl(0.025, 0.025, 1.8, 4), ROPE, { pos: [0, -0.9, -7.3] }),
    part(sphere(0.35, 10, 8), 0x8a8a84, { pos: [0, -1.8, -7.3] }),
  ]);
}

// the siege tower (v3.1): a tall hide-clad timber tower on six wheels, three storeys of ladders
// inside, a team banner on top, and a drawbridge (the ARM) hinged at the top front that drops onto
// the wall it docks against. Origin at the ground centre; the front is +z.
export function siegeTowerBody() {
  const P = [];
  const H = 11.5, W = 3.6, D = 3.8;
  for (const x of [-1.5, 1.5]) P.push(part(rbox(0.32, 0.36, 4.6, 0.06), WOODD, { pos: [x, 0.62, 0] }));
  for (const [x, z] of [[-1.75, -1.5], [1.75, -1.5], [-1.75, 0], [1.75, 0], [-1.75, 1.5], [1.75, 1.5]]) wheel(P, x, 0.6, z, 0.58);
  // the four corner posts, leaning in a little
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(part(rbox(0.3, H, 0.3, 0.06), WOOD, { pos: [x * (W / 2 - 0.2), H / 2 + 0.8, z * (D / 2 - 0.2)], rot: [z * -0.02, 0, x * 0.02] }));
  // storey floors and cross braces
  for (const y of [1.0, 4.6, 8.2, H + 0.6]) P.push(part(rbox(W, 0.22, D, 0.05), WOODD, { pos: [0, y, 0] }));
  // hide panels on three sides, slightly sagging, with lath strips
  for (const [rx, x, z] of [[0, 0, -D / 2], [Math.PI / 2, -W / 2, 0], [Math.PI / 2, W / 2, 0]]) {
    for (let k = 0; k < 3; k++) {
      const y = 2.8 + k * 3.6;
      const g = rbox(rx ? D - 0.2 : W - 0.2, 3.3, 0.1, 0.04);
      P.push(part(g, k % 2 ? HIDE : 0x7d5a3e, { pos: [x * 1.02, y, z * 1.02], rot: [0, rx, 0], grad: 0.25 }));
      for (let s = -1; s <= 1; s += 2) P.push(part(box(rx ? 0.12 : W - 0.1, 0.12, rx ? D - 0.1 : 0.12), WOODD, { pos: [x * 1.05, y + s * 1.3, z * 1.05] }));
    }
  }
  // the front: open storeys with a ladder up the middle, a breastwork at the top
  for (let y = 1.2; y < H; y += 0.55) P.push(part(box(0.9, 0.07, 0.07), WOODL, { pos: [0, y, D / 2 - 0.6] }));
  for (const x of [-0.45, 0.45]) P.push(part(box(0.08, H - 0.6, 0.08), WOODL, { pos: [x, H / 2 + 0.8, D / 2 - 0.6] }));
  P.push(part(rbox(W, 1.0, 0.18, 0.05), WOOD, { pos: [0, H + 1.2, -D / 2 + 0.1] }));
  for (const x of [-1, 1]) P.push(part(rbox(0.18, 1.0, D, 0.05), WOOD, { pos: [x * (W / 2 - 0.1), H + 1.2, 0] }));
  // the banner pole and a team-coloured flag
  P.push(part(cyl(0.05, 0.06, 3.2, 6), WOODD, { pos: [-W / 2 + 0.3, H + 2.2, -D / 2 + 0.3] }));
  P.push(part(box(1.3, 0.85, 0.04), 1, { pos: [-W / 2 + 1.0, H + 3.2, -D / 2 + 0.3], team: 1 }));
  return merge(P);
}
export function siegeTowerArm() {
  // hinge at the origin (top front of the tower); the bridge rises along +y when up, and swings
  // forward (rotation about x) onto the wall when docked
  return merge([
    part(rbox(2.4, 3.4, 0.16, 0.05), WOODL, { pos: [0, 1.7, 0] }),
    ...[0.5, 1.4, 2.3, 3.1].map((y) => part(box(2.5, 0.12, 0.22), WOODD, { pos: [0, y, 0.08] })),
    part(cyl(0.02, 0.02, 3.6, 4), ROPE, { pos: [-1.1, 1.8, -0.6], rot: [0.3, 0, 0] }),
    part(cyl(0.02, 0.02, 3.6, 4), ROPE, { pos: [1.1, 1.8, -0.6], rot: [0.3, 0, 0] }),
  ]);
}

// the ballista (v3.1): a giant crossbow on a wheeled trestle. BODY = the trestle and wheels; ARM =
// the bow, stock and bolt, pivoting at the trestle head (pitch only)
export function ballistaBody() {
  const P = [];
  for (const x of [-0.85, 0.85]) P.push(part(rbox(0.22, 0.26, 3.0, 0.06), WOODD, { pos: [x, 0.55, 0] }));
  for (const z of [-1.1, 1.1]) P.push(part(rbox(1.9, 0.2, 0.22, 0.05), WOOD, { pos: [0, 0.6, z] }));
  for (const [x, z] of [[-1.0, -1.0], [1.0, -1.0], [-1.0, 1.0], [1.0, 1.0]]) wheel(P, x, 0.48, z, 0.46);
  for (const [x, z] of [[-0.4, -0.35], [0.4, -0.35], [-0.4, 0.35], [0.4, 0.35]]) P.push(part(rbox(0.16, 1.2, 0.16, 0.04), WOOD, { pos: [x, 1.25, z], rot: [z * -0.35, 0, x * -0.4] }));
  P.push(part(rbox(0.5, 0.3, 0.5, 0.06), WOODD, { pos: [0, 1.85, 0] }));
  // a rack of spare bolts
  for (let k = 0; k < 4; k++) P.push(part(cyl(0.04, 0.04, 1.8, 5), WOODL, { pos: [0.55 + k * 0.09, 0.9, -0.2], rot: [Math.PI / 2, 0, 0] }));
  return merge(P);
}
export function ballistaArm() {
  // pivot at the origin (trestle head); the stock runs along +z, the bow arms across at the front
  const P = [];
  P.push(part(rbox(0.3, 0.22, 2.8, 0.05), WOODL, { pos: [0, 0.05, 0.2] }));
  for (const s of [-1, 1]) {
    P.push(part(rbox(1.3, 0.14, 0.16, 0.04), WOODD, { pos: [s * 0.7, 0.12, 1.25], rot: [0, s * 0.35, 0] }));
    P.push(part(rbox(0.28, 0.42, 0.36, 0.05), IRON, { pos: [s * 0.22, 0.12, 1.4] }));
    P.push(part(cyl(0.012, 0.012, 1.55, 4), ROPE, { pos: [s * 0.62, 0.14, 0.75], rot: [Math.PI / 2, 0, s * 1.1] }));
  }
  P.push(part(cyl(0.035, 0.035, 2.2, 6), WOODL, { pos: [0, 0.2, 0.75], rot: [Math.PI / 2, 0, 0] }));
  P.push(part(cone(0.07, 0.3, 6), IRON, { pos: [0, 0.2, 1.95], rot: [Math.PI / 2, 0, 0] }));
  P.push(part(cyl(0.12, 0.12, 0.6, 8), WOODD, { pos: [0, 0.05, -1.1], rot: [0, 0, Math.PI / 2] }));
  return merge(P);
}
