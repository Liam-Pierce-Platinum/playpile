// =====================================================================
// NASCAR :: detail.js - THE THINGS YOU NOTICE ARE MISSING
// =====================================================================
//
// Liam, on the first version: "lack of detial".
//
// Everything in this file is a thing nobody would ever ask for by name
// and everybody notices the absence of. Take the gantry off a speedway
// and you cannot tell where the lap starts. Take the tyre packs off the
// inside wall and the infield looks like a lawn. Take the posts and
// cables out of the catch fence and it stops being a fence and becomes a
// grey haze hanging in the air.
//
// It is all instanced, because it is all repeated: one draw call for
// every fence post on a two-and-a-half-mile racetrack, one for every
// tyre pack, one for every floodlight tower. The whole file adds about a
// dozen draw calls and a hundred and fifty thousand triangles.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import * as TX from './textures.js';

/** merge a few geometries with no UV fuss - for instanced props */
export function mergeSimple(list) {
  return mergeGeometries(list.map((p) => {
    const o = p.index ? p.toNonIndexed() : p;
    if (!o.attributes.normal) o.computeVertexNormals();
    if (!o.attributes.uv) {
      o.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(o.attributes.position.count * 2), 2));
    }
    for (const k of Object.keys(o.attributes)) {
      if (!['position', 'normal', 'uv'].includes(k)) o.deleteAttribute(k);
    }
    return o;
  }));
}

/** the same quad soup track.js uses, kept local so this file stands alone */
class Soup {
  constructor() { this.pos = []; this.uv = []; }
  quad(A, B, C, D, ua, ub, uc, ud) {
    this.pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    this.uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  }
  add(group, material, name) {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    m.name = name || '';
    group.add(m);
    return m;
  }
}

export function buildDetail(oval, group, at, wrapI, WALL_H, FENCE_H, crowd) {
  const P = oval.points, n = P.length, ds = oval.spacing;
  const spec = oval.spec, HW = oval.halfWidth, APRON = oval.apron;
  const OUT = HW + spec.outerRun, IN = HW + APRON;
  const g = new THREE.Group();
  g.name = 'detail';
  const dummy = new THREE.Object3D();

  // =====================================================================
  // THE CATCH FENCE: POSTS AND CABLES
  // =====================================================================
  //
  // The mesh on its own reads as a grey smear. What tells your eye it is a
  // fence is the vertical post every twenty feet and the horizontal cables
  // between them, which catch the light and cut the haze into panels.
  {
    const post = new THREE.BoxGeometry(0.13, FENCE_H + 0.5, 0.26);
    post.translate(0, (FENCE_H + 0.5) / 2, 0);
    const step = Math.max(2, Math.round(6.1 / ds));
    const count = Math.floor(n / step);
    const posts = new THREE.InstancedMesh(post, new THREE.MeshStandardMaterial({
      color: 0x8e949c, roughness: 0.38, metalness: 0.8,
    }), count);
    for (let k = 0; k < count; k++) {
      const i = k * step;
      const a = at(i, -OUT - 0.32);
      dummy.position.set(a[0], a[1] + WALL_H, a[2]);
      dummy.rotation.set(0, P[i].h, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      posts.setMatrixAt(k, dummy.matrix);
    }
    posts.instanceMatrix.needsUpdate = true;
    posts.castShadow = true;
    g.add(posts);

    const cable = new Soup();
    for (let i = 0; i < n; i++) {
      const j = wrapI(i + 1);
      const a = at(i, -OUT - 0.32), b = at(j, -OUT - 0.32);
      for (const hgt of [1.7, 3.7, 5.9]) {
        const y0 = a[1] + WALL_H + hgt, y1 = b[1] + WALL_H + hgt;
        cable.quad([a[0], y0, a[2]], [b[0], y1, b[2]],
                   [b[0], y1 + 0.08, b[2]], [a[0], y0 + 0.08, a[2]],
                   [0, 0], [1, 0], [1, 1], [0, 1]);
      }
    }
    cable.add(g, new THREE.MeshStandardMaterial({
      color: 0xb8bdc4, roughness: 0.3, metalness: 0.85, side: THREE.DoubleSide,
    }), 'cables');
  }

  // =====================================================================
  // TYRE PACKS along the inside wall
  // =====================================================================
  {
    const tyre = new THREE.CylinderGeometry(0.42, 0.42, 0.26, 10, 1);
    const stack = [];
    for (let k = 0; k < 3; k++) {
      const c = tyre.clone();
      c.translate(0, 0.13 + k * 0.26, 0);
      stack.push(c);
    }
    const geo = mergeSimple(stack);
    const step = Math.max(2, Math.round(3.4 / ds));
    const poses = [];
    for (let i = 0; i < n; i += step) {
      if (oval.pit.wallAt(i) || oval.pit.roadAt(i)) continue;
      poses.push(i);
    }
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
      color: 0x16171a, roughness: 0.96,
    }), poses.length);
    poses.forEach((i, k) => {
      const a = at(i, IN + spec.innerRun - 0.7);
      dummy.position.set(a[0], a[1], a[2]);
      dummy.rotation.set(0, P[i].h, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    g.add(mesh);
  }

  // =====================================================================
  // THE START/FINISH GANTRY
  // =====================================================================
  //
  // A steel truss over the racing surface with the flag stand hanging off
  // it on the inside. It is the most recognisable object on any oval and
  // it is the thing your eye looks for to know where the lap starts.
  {
    const steel = new THREE.MeshStandardMaterial({ color: 0x848b93, roughness: 0.38, metalness: 0.78 });
    const i0 = oval.index(0);
    const a = at(i0, -OUT - 1.8), b = at(i0, IN + 2.4);
    const legH = 13.5;
    for (const q of [a, b]) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.8, legH, 0.8), steel);
      m.position.set(q[0], q[1] + legH / 2, q[2]);
      m.castShadow = true;
      g.add(m);
    }
    const span = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const yaw = -Math.atan2(b[2] - a[2], b[0] - a[0]);
    const mid = [(a[0] + b[0]) / 2, Math.max(a[1], b[1]) + legH, (a[2] + b[2]) / 2];
    const beam = new THREE.Mesh(new THREE.BoxGeometry(span, 1.6, 1.3), steel);
    beam.position.set(mid[0], mid[1], mid[2]);
    beam.rotation.y = yaw;
    beam.castShadow = true;
    g.add(beam);
    // the truss lattice, so it is not one solid bar
    for (let k = -1; k <= 1; k += 2) {
      const t2 = new THREE.Mesh(new THREE.BoxGeometry(span, 0.22, 0.22), steel);
      t2.position.set(mid[0], mid[1] + k * 1.5, mid[2]);
      t2.rotation.y = yaw;
      g.add(t2);
    }
    const board = new THREE.Mesh(new THREE.BoxGeometry(span * 0.88, 2.8, 0.3),
      new THREE.MeshStandardMaterial({ map: TX.wall(), roughness: 0.55 }));
    board.position.set(mid[0], mid[1] + 2.6, mid[2]);
    board.rotation.y = yaw;
    g.add(board);
    // the flag stand, on the inside where the starter really is
    const sa = at(i0, IN - 0.5);
    const stand = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.2),
      new THREE.MeshStandardMaterial({ color: 0x272c33, roughness: 0.72 }));
    stand.position.set(sa[0], sa[1] + legH - 2.2, sa[2]);
    stand.rotation.y = P[i0].h;
    stand.castShadow = true;
    g.add(stand);
    if (crowd) {
      crowd.fill([{ x: sa[0], y: sa[1] + legH - 1.1, z: sa[2], h: P[i0].h - Math.PI / 2 }],
        { name: 'starter' });
    }
  }

  // =====================================================================
  // THE SCORING PYLON
  // =====================================================================
  {
    const q = oval.pos(oval.length * 0.015, IN + spec.innerRun * 0.6);
    const col = new THREE.Mesh(new THREE.BoxGeometry(3.8, 28, 3.8),
      new THREE.MeshStandardMaterial({ color: 0x20232a, roughness: 0.55, metalness: 0.25 }));
    col.position.set(q.x, 14, q.z);
    col.castShadow = true;
    g.add(col);
    const tex = TX.pylon();
    for (const s of [1, -1]) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(3.3, 23),
        new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
      panel.position.set(q.x + Math.cos(q.h) * 0 + (s > 0 ? 1.95 : -1.95), 15, q.z);
      panel.rotation.y = s > 0 ? Math.PI / 2 : -Math.PI / 2;
      g.add(panel);
    }
  }

  // =====================================================================
  // FLOODLIGHT TOWERS
  // =====================================================================
  {
    const towers = 12;
    const mast = new THREE.BoxGeometry(1.1, 36, 1.1);
    mast.translate(0, 18, 0);
    const rack = new THREE.BoxGeometry(7.0, 2.4, 0.9);
    rack.translate(0, 36.6, 0);
    const geo = mergeSimple([mast, rack]);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({
      color: 0x6a707a, roughness: 0.45, metalness: 0.6,
    }), towers);
    const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(6.6, 1.7, 0.3),
      new THREE.MeshStandardMaterial({ color: 0xe8ecf2, emissive: 0x555c68, roughness: 0.25 }), towers);
    for (let k = 0; k < towers; k++) {
      const q = oval.pos((k / towers) * oval.length, -OUT - 34);
      dummy.position.set(q.x, 0, q.z);
      dummy.rotation.set(0, q.h, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      mesh.setMatrixAt(k, dummy.matrix);
      dummy.position.set(q.x, 36.6, q.z);
      dummy.updateMatrix();
      lamps.setMatrixAt(k, dummy.matrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
    lamps.instanceMatrix.needsUpdate = true;
    mesh.castShadow = true;
    g.add(mesh, lamps);
  }

  // =====================================================================
  // PIT EQUIPMENT, AND THE CREW ON THE WALL
  // =====================================================================
  //
  // Two stacks of tyres and a cart in every box, and two men leaning on
  // the pit wall watching the cars go past. They are part of the crowd
  // system, so they stand up and wave with everybody else.
  {
    const PIT = oval.pit;
    const tyre = new THREE.CylinderGeometry(0.40, 0.40, 0.25, 10, 1);
    const st = [];
    for (let k = 0; k < 4; k++) { const c = tyre.clone(); c.translate(0, 0.13 + k * 0.25, 0); st.push(c); }
    const stackGeo = mergeSimple(st);
    const cartGeo = new THREE.BoxGeometry(0.85, 1.05, 1.8);
    cartGeo.translate(0, 0.52, 0);
    const stackMesh = new THREE.InstancedMesh(stackGeo, new THREE.MeshStandardMaterial({
      color: 0x17181c, roughness: 0.95,
    }), PIT.stalls * 2);
    const cartMesh = new THREE.InstancedMesh(cartGeo, new THREE.MeshStandardMaterial({
      color: 0xc2c7cd, roughness: 0.35, metalness: 0.45,
    }), PIT.stalls);
    const crewSeats = [];
    let si = 0;
    for (let k = 0; k < PIT.stalls; k++) {
      const pose = PIT.stallPose(k, PIT.box);
      for (const off of [-1.4, 1.4]) {
        const q = oval.pos(pose.at + off, PIT.box + 3.7);
        dummy.position.set(q.x, q.y, q.z);
        dummy.rotation.set(0, q.h, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        stackMesh.setMatrixAt(si++, dummy.matrix);
      }
      const c = oval.pos(pose.at + 2.8, PIT.box + 4.8);
      dummy.position.set(c.x, c.y, c.z);
      dummy.rotation.set(0, c.h, 0);
      dummy.updateMatrix();
      cartMesh.setMatrixAt(k, dummy.matrix);
      for (const off of [-2.4, 1.9]) {
        const w = oval.pos(pose.at + off, PIT.wall + 1.0);
        crewSeats.push({ x: w.x, y: w.y + 0.55, z: w.z, h: w.h - Math.PI / 2 });
      }
    }
    stackMesh.count = si;
    stackMesh.castShadow = true;
    cartMesh.castShadow = true;
    g.add(stackMesh, cartMesh);
    if (crowd && crewSeats.length) crowd.fill(crewSeats, { name: 'pitcrew' });
  }

  group.add(g);
  return g;
}
