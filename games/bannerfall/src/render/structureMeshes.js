// BANNERFALL :: render/structureMeshes.js - palisades, gates, towers, stone walls, stakes,
// and the timber dressing that makes a dug trench read as a trench (revetment planks,
// posts and wicker gabions on the parapet).
import * as THREE from '../../vendor/three.module.js';
import { part, merge, rbox, sphere, cyl, cone, box, lin } from './geo.js';

const vmat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, ...o });
const WOOD = 0x8a6440, WOODD = 0x6a4b30, BARK = 0x5d4630;

function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function palisadeGeo() {
  const r = rnd(7), P = [];
  const n = 10;
  for (let i = 0; i < n; i++) {
    const x = -2 + (i + 0.5) * (4 / n);
    const rad = 0.17 + r() * 0.04, h = 3.3 + r() * 0.5;
    const c = new THREE.Color(WOOD).lerp(new THREE.Color(BARK), r() * 0.6);
    P.push(part(cyl(rad, rad * 1.05, h + 0.8, 9), c.getHex(), { pos: [x, (h - 0.8) / 2, 0], rot: [(r() - 0.5) * 0.05, 0, (r() - 0.5) * 0.05], grad: 0.3 }));
    P.push(part(cone(rad, 0.45, 9), 0xa88a62, { pos: [x, h + 0.2, 0] }));
  }
  for (const y of [0.9, 2.5]) P.push(part(rbox(4.1, 0.2, 0.18, 0.06), WOODD, { pos: [0, y, -0.28] }));
  return merge(P);
}
function stakesGeo() {
  const r = rnd(11), P = [];
  P.push(part(cyl(0.11, 0.11, 4.0, 8), BARK, { pos: [0, 0.45, 0], rot: [0, 0, Math.PI / 2] }));
  for (let i = 0; i < 7; i++) {
    const x = -1.8 + i * 0.6;
    const lean = 0.75 + r() * 0.15;
    for (const s of [1, -1]) {
      P.push(part(cyl(0.06, 0.08, 1.9, 7), WOOD, { pos: [x + s * 0.06, 0.65, s * 0.15], rot: [s * lean, 0, 0], grad: 0.3 }));
      P.push(part(cone(0.06, 0.28, 7), 0xb8996e, { pos: [x + s * 0.06, 0.65 + Math.cos(lean) * 1.05, s * 0.15 + Math.sin(lean) * 1.05 * s], rot: [s * lean, 0, 0] }));
    }
  }
  return merge(P);
}
function stoneWallGeo() {
  // a dressed-stone curtain wall: a core, then courses of individually tinted blocks on both
  // faces, a walkway slab and merlons on the enemy side
  const r = rnd(5), P = [];
  const H = 6.0, D = 2.3;
  P.push(part(box(4.0, H + 0.6, D - 0.1), 0x9c9486, { pos: [0, H / 2 - 0.6, 0] }));
  const tints = [0xb9b1a3, 0xaea698, 0xc3bcae, 0xa49c8f, 0xb4ab9b];
  for (const side of [1, -1]) {
    let y = -0.4;
    for (let row = 0; y < H - 0.2; row++) {
      const h = 0.62 + r() * 0.16;
      let x = -2 + (row % 2 ? -0.45 : 0);
      while (x < 2) {
        const w = Math.min(2 - x, 0.9 + r() * 0.5);
        const x0 = Math.max(-2, x);
        const ww = Math.min(2, x + w) - x0;
        if (ww > 0.12) P.push(part(box(ww - 0.06, h - 0.06, 0.16 + r() * 0.05), tints[Math.floor(r() * tints.length)], { pos: [x0 + ww / 2, y + h / 2, side * (D / 2 - 0.02)] }));
        x += w;
      }
      y += h;
    }
  }
  P.push(part(box(4.02, 0.22, D + 0.1), 0x8f877a, { pos: [0, H, 0] }));
  for (let k = 0; k < 4; k++) P.push(part(rbox(0.72, 0.9, 0.5, 0.05), tints[k % 5], { pos: [-1.5 + k * 1.0, H + 0.55, D / 2 - 0.25] }));
  P.push(part(box(4.0, 0.5, 0.3), 0xa39b8d, { pos: [0, H + 0.35, -D / 2 + 0.15] }));
  return merge(P);
}
function gateGeo() {
  const P = [];
  for (const x of [-2.15, 2.15]) {
    P.push(part(cyl(0.3, 0.32, 5.6, 10), WOODD, { pos: [x, 2.0, 0], grad: 0.3 }));
    P.push(part(cone(0.3, 0.5, 10), 0xa88a62, { pos: [x, 5.05, 0] }));
  }
  P.push(part(rbox(4.9, 0.4, 0.5, 0.08), WOODD, { pos: [0, 4.1, 0] }));
  // little roof over the lintel
  const roof = new THREE.CylinderGeometry(0.01, 0.75, 5.4, 4, 1);
  roof.rotateZ(Math.PI / 2); roof.rotateX(Math.PI / 4);
  P.push(part(roof, 0x6e4a32, { pos: [0, 4.6, 0], scale: [1, 0.55, 1] }));
  return merge(P);
}
function doorGeo() {
  const P = [];
  for (let k = 0; k < 4; k++) P.push(part(rbox(0.48, 3.6, 0.14, 0.04), k % 2 ? WOOD : 0x7f5b3a, { pos: [0.25 + k * 0.5, 1.8, 0] }));
  for (const y of [0.7, 2.9]) P.push(part(box(1.95, 0.14, 0.06), 0x3a3a3a, { pos: [1.0, y, 0.1] }));
  P.push(part(box(2.4, 0.16, 0.08), 0x6a4b30, { pos: [1.0, 1.8, 0.1], rot: [0, 0, 1.0] }));
  return merge(P);
}
function towerGeo() {
  const P = [];
  const h = 9, s = 1.8;
  for (const [x, z] of [[-s, -s], [s, -s], [-s, s], [s, s]]) {
    P.push(part(cyl(0.2, 0.26, h + 1.2, 9), WOODD, { pos: [x, (h + 1.2) / 2 - 0.6, z], grad: 0.25 }));
    P.push(part(cyl(0.08, 0.08, 2.4, 6), WOODD, { pos: [x, h + 1.9, z] }));
  }
  // cross braces on each face
  for (const [ax, az, ry] of [[0, -s, 0], [0, s, 0], [-s, 0, Math.PI / 2], [s, 0, Math.PI / 2]]) {
    for (const [y0, sgn] of [[1.2, 1], [4.8, -1]]) {
      const g = cyl(0.08, 0.08, 4.9, 6);
      P.push(part(g, WOOD, { pos: [ax, y0 + 1.7, az], rot: [0, ry, sgn * 0.9] }));
      P.push(part(cyl(0.08, 0.08, 4.9, 6), WOOD, { pos: [ax, y0 + 1.7, az], rot: [0, ry, -sgn * 0.9] }));
    }
  }
  // platform, parapet boards, roof
  P.push(part(rbox(4.6, 0.3, 4.6, 0.06), 0x7f5b3a, { pos: [0, h, 0] }));
  for (const [x, z, w, d] of [[0, 2.2, 4.6, 0.14], [0, -2.2, 4.6, 0.14], [2.2, 0, 0.14, 4.6], [-2.2, 0, 0.14, 4.6]]) {
    P.push(part(rbox(w, 1.1, d, 0.04), WOOD, { pos: [x, h + 0.6, z] }));
  }
  const roof = new THREE.ConeGeometry(3.6, 2.4, 4, 1);
  roof.rotateY(Math.PI / 4);
  P.push(part(roof, 0x6e4a32, { pos: [0, h + 4.2, 0], grad: 0.3 }));
  P.push(part(cyl(0.04, 0.04, 1.4, 5), WOODD, { pos: [0, h + 5.8, 0] }));
  // ladder
  for (const x of [-0.35, 0.35]) P.push(part(cyl(0.05, 0.05, h + 0.5, 6), WOOD, { pos: [x, h / 2, -2.45], rot: [0.08, 0, 0] }));
  for (let k = 0; k < 15; k++) P.push(part(cyl(0.035, 0.035, 0.7, 5), WOOD, { pos: [0, 0.5 + k * 0.6, -2.45 + 0.04 * (k * 0.6 - h / 2) * -0.08], rot: [0, 0, Math.PI / 2] }));
  return merge(P);
}
function pennant(team) {
  const g = new THREE.PlaneGeometry(1.1, 0.5, 6, 1);
  g.translate(0.55, 0, 0);
  const m = new THREE.MeshStandardMaterial({ color: team === 0 ? 0x2f5fa8 : 0xa82f2f, side: THREE.DoubleSide, roughness: 0.8 });
  return new THREE.Mesh(g, m);
}

// trench dressing pieces
function plankGeo() { return part(rbox(1.08, 1.5, 0.07, 0.025), 0x7b5a3b, { grad: 0.35 }); }
function postGeo() { return part(cyl(0.07, 0.08, 1.7, 7), 0x5d4630, { grad: 0.3 }); }
function gabionGeo() {
  const P = [part(cyl(0.46, 0.42, 0.7, 16), 0xa58e5e, { grad: 0.45 }), part(cyl(0.42, 0.42, 0.06, 16), 0x6e5a3d, { pos: [0, 0.34, 0] })];
  for (let k = 0; k < 5; k++) P.push(part(new THREE.TorusGeometry(0.455 - k * 0.008, 0.022, 5, 18), 0x7d6844, { pos: [0, -0.27 + k * 0.14, 0], rot: [Math.PI / 2, 0, 0] }));
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; P.push(part(cyl(0.025, 0.025, 0.86, 5), 0x6a5636, { pos: [Math.cos(a) * 0.45, 0.05, Math.sin(a) * 0.45] })); }
  return merge(P);
}

// ---- stone gatehouse, stone tower, caltrops, rubble
const STONE = 0xb8b0a2, STONED = 0x8f877a, STONEL = 0xc3bcae;
function blockFace(P, w, h, x0, y0, z, r, tints) {
  // courses of individually tinted blocks on one face
  let y = y0;
  for (let row = 0; y < y0 + h - 0.2; row++) {
    const bh = 0.62 + r() * 0.16;
    let x = x0 + (row % 2 ? -0.45 : 0);
    while (x < x0 + w) {
      const bw = Math.min(x0 + w - x, 0.9 + r() * 0.5);
      const xa = Math.max(x0, x), ww = Math.min(x0 + w, x + bw) - xa;
      if (ww > 0.12) P.push(part(box(ww - 0.06, bh - 0.06, 0.16 + r() * 0.05), tints[Math.floor(r() * tints.length)], { pos: [xa + ww / 2, y + bh / 2, z] }));
      x += bw;
    }
    y += bh;
  }
}
function stoneGateGeo() {
  // two square towers either side of an arch, a walkway over it with merlons
  const r = rnd(21), P = [];
  const tints = [0xb9b1a3, 0xaea698, 0xc3bcae, 0xa49c8f, 0xb4ab9b];
  for (const sx of [-1, 1]) {
    const cx = sx * 2.4;
    P.push(part(box(2.2, 8.4, 3.6), 0x9c9486, { pos: [cx, 3.6, 0] }));
    for (const fz of [1.81, -1.81]) blockFace(P, 2.2, 8.0, cx - 1.1, -0.4, fz, r, tints);
    P.push(part(box(2.6, 0.3, 4.0), STONED, { pos: [cx, 8.0, 0] }));
    for (const [mx, mz] of [[-0.8, 1.7], [0.8, 1.7], [-0.8, -1.7], [0.8, -1.7]]) P.push(part(rbox(0.7, 0.9, 0.5, 0.05), STONEL, { pos: [cx + mx, 8.6, mz] }));
    P.push(part(rbox(0.25, 1.2, 0.1, 0.03), 0x2a221c, { pos: [cx, 5.6, 1.86] }));
  }
  // the arch and the walkway over it
  P.push(part(box(2.8, 2.6, 3.4), 0x9c9486, { pos: [0, 6.4, 0] }));
  for (const fz of [1.72, -1.72]) blockFace(P, 2.8, 2.6, -1.4, 5.1, fz, r, tints);
  const arch = new THREE.TorusGeometry(1.35, 0.32, 6, 14, Math.PI);
  P.push(part(arch.clone(), STONEL, { pos: [0, 5.0, 1.74] }));
  P.push(part(arch.clone(), STONEL, { pos: [0, 5.0, -1.74] }));
  for (const mx of [-0.9, 0.9]) P.push(part(rbox(0.7, 0.9, 0.5, 0.05), STONEL, { pos: [mx, 8.2, 1.5] }));
  return merge(P);
}
function portcullisGeo() {
  const P = [];
  for (let x = -1.15; x <= 1.16; x += 0.38) P.push(part(box(0.09, 4.8, 0.09), 0x3a3a3c, { pos: [x, 2.4, 0] }));
  for (let y = 0.4; y < 4.8; y += 0.55) P.push(part(box(2.5, 0.08, 0.09), 0x3a3a3c, { pos: [0, y, 0] }));
  for (let x = -1.15; x <= 1.16; x += 0.38) P.push(part(cone(0.07, 0.25, 5), 0x4a4a4c, { pos: [x, -0.1, 0], rot: [Math.PI, 0, 0] }));
  return merge(P);
}
function stoneTowerGeo() {
  const r = rnd(31), P = [];
  const H = 13, W = 5.5;
  const tints = [0xb9b1a3, 0xaea698, 0xc3bcae, 0xa49c8f, 0xb4ab9b];
  P.push(part(box(W, H, W), 0x9c9486, { pos: [0, H / 2 - 0.5, 0] }));
  for (const s of [1, -1]) { blockFace(P, W, H, -W / 2, -0.5, s * (W / 2 + 0.02), r, tints); }
  for (const s of [1, -1]) { const g = []; blockFace(g, W, H, -W / 2, -0.5, 0, r, tints); for (const q of g) { q.rotateY(Math.PI / 2); q.translate(s * (W / 2 + 0.02), 0, 0); P.push(q); } }
  P.push(part(box(W + 0.8, 0.5, W + 0.8), STONED, { pos: [0, H, 0] }));
  for (let k = -2; k <= 2; k += 2) for (const [x, z] of [[k, W / 2 + 0.15], [k, -W / 2 - 0.15], [W / 2 + 0.15, k], [-W / 2 - 0.15, k]]) P.push(part(rbox(0.9, 1.0, 0.9, 0.06), STONEL, { pos: [x * 0.95, H + 0.75, z] }));
  for (const y of [5, 9]) P.push(part(rbox(0.3, 1.3, 0.12, 0.04), 0x241c18, { pos: [0, y, W / 2 + 0.1] }));
  return merge(P);
}
function caltropsGeo() {
  const r = rnd(41), P = [];
  for (let k = 0; k < 46; k++) {
    const x = (r() - 0.5) * 5.6, z = (r() - 0.5) * 5.6;
    P.push(part(cone(0.07, 0.28, 4), 0x56585c, { pos: [x, 0.1, z], rot: [r() * 1.2 - 0.6, r() * 6, r() * 1.2 - 0.6] }));
  }
  return merge(P);
}
function rubbleGeo(stone) {
  const r = rnd(stone ? 51 : 61), P = [];
  for (let k = 0; k < (stone ? 16 : 12); k++) {
    const x = (r() - 0.5) * 4.2, z = (r() - 0.5) * 2.4;
    if (stone) P.push(part(rbox(0.7 + r() * 0.7, 0.45 + r() * 0.4, 0.6 + r() * 0.5, 0.08), [0xb9b1a3, 0xa49c8f, 0x8f877a][k % 3], { pos: [x, 0.25 + r() * 0.5, z], rot: [r() * 0.6, r() * 6, r() * 0.6] }));
    else P.push(part(cyl(0.14, 0.17, 1.8 + r() * 1.4, 7), [0x3a2a1e, 0x2a201a, 0x4a3424][k % 3], { pos: [x, 0.2 + r() * 0.2, z], rot: [Math.PI / 2 + (r() - 0.5) * 0.4, r() * 6, 0] }));
  }
  if (stone) P.push(part(new THREE.SphereGeometry(2.0, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 0x9a9286, { pos: [0, -0.4, 0], scale: [1.3, 0.55, 0.8] }));
  return merge(P);
}

export function createStructureRenderer(scene, world) {
  const mat = vmat();
  const burnMat = vmat({ emissive: 0x3a1004, emissiveIntensity: 1, color: 0x8a6a5a });
  const charMat = vmat({ color: 0x5a4a44 });
  const geos = { palisade: palisadeGeo(), stakes: stakesGeo(), stoneWall: stoneWallGeo(), gate: gateGeo(), door: doorGeo(), tower: towerGeo(), stoneGate: stoneGateGeo(), portcullis: portcullisGeo(), stoneTower: stoneTowerGeo(), caltrops: caltropsGeo(), rubbleS: rubbleGeo(true), rubbleW: rubbleGeo(false) };
  const meshes = new Map();
  function add(s) {
    const g = new THREE.Group();
    if (s.kind === 'tower') {
      const m = new THREE.Mesh(s.type === 'stoneTower' ? geos.stoneTower : geos.tower, mat); m.castShadow = m.receiveShadow = true; g.add(m);
      const p = pennant(s.team); p.position.set(0, s.height + (s.type === 'stoneTower' ? 3.2 : 6.2), 0); g.add(p); g.userData.pennant = p;
      if (s.type === 'stoneTower') { const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 3, 5), mat); pole.position.set(0, s.height + 2.2, 0); g.add(pole); }
      g.position.set(s.pos[0], s.base, s.pos[1]);
    } else if (s.kind === 'caltrops') {
      const m = new THREE.Mesh(geos.caltrops, mat); m.receiveShadow = true; g.add(m);
      g.position.set(s.pos[0], s.base, s.pos[1]);
    } else {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      const L = Math.hypot(dx, dz);
      const geo = geos[s.type] || geos.palisade;
      const m = new THREE.Mesh(geo, mat); m.castShadow = m.receiveShadow = true;
      m.scale.x = L / (s.type === 'stoneGate' ? 6 : 4);
      // the braces go on the side facing home
      if ((s.team === 0 ? -1 : 1) * (-dx) < 0) m.rotation.y = Math.PI;
      g.add(m);
      if (s.type === 'gate') {
        const dl = new THREE.Mesh(geos.door, mat), dr = new THREE.Mesh(geos.door, mat);
        dl.position.set(-1.95, 0, 0); dr.position.set(1.95, 0, 0); dr.scale.x = -1;
        dl.castShadow = dr.castShadow = true;
        g.add(dl, dr); g.userData.doors = [dl, dr];
        const p = pennant(s.team); p.position.set(0, 5.5, 0); g.add(p); g.userData.pennant = p;
      } else if (s.type === 'stoneGate') {
        const pc = new THREE.Mesh(geos.portcullis, mat); pc.castShadow = true; g.add(pc); g.userData.portcullis = pc;
        const p = pennant(s.team); p.position.set(2.4, 9.8, 0); p.scale.setScalar(1.4); g.add(p); g.userData.pennant = p;
        const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), mat); pole.position.set(2.4, 9.3, 0); g.add(pole);
      }
      g.position.set((s.a[0] + s.b[0]) / 2, s.base, (s.a[1] + s.b[1]) / 2);
      g.rotation.y = Math.atan2(-dz, dx);
    }
    scene.add(g);
    meshes.set(s.id, { g, s, shake: 0, lastHit: s.hitT, burnt: false });
  }
  // what is left when a structure falls
  const rubble = [];
  function addRubble(s) {
    if (s.kind === 'caltrops' || s.kind === 'obstacle') return;
    const stone = !s.wood;
    const m = new THREE.Mesh(stone ? geos.rubbleS : geos.rubbleW, mat); m.castShadow = m.receiveShadow = true;
    if (s.kind === 'tower') { m.position.set(s.pos[0], s.base, s.pos[1]); m.scale.set(1.4, 1.6, 2.2); }
    else {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      m.position.set((s.a[0] + s.b[0]) / 2, s.base, (s.a[1] + s.b[1]) / 2);
      m.rotation.y = Math.atan2(-dz, dx);
      m.scale.set(Math.hypot(dx, dz) / 4, stone ? 1.2 : 1, stone ? 1.3 : 1);
    }
    scene.add(m);
    rubble.push(m);
  }
  let v = -1;
  function syncList() {
    for (const s of world.structures.values()) if (s.alive && !meshes.has(s.id)) add(s);
    for (const [id, m] of meshes) {
      const s = world.structures.get(id);
      if (!s || !s.alive) {
        scene.remove(m.g); meshes.delete(id);
        if (s && !s.alive && world.phase !== 'prepare') addRubble(s);
      }
    }
  }

  const dress = createTrenchDressing(scene, world, mat);
  const dressTrenches = dress.dressTrenches;
  let tv = -1;

  function update(dt, t, digging, heightAt) {
    if (world.structVersion !== v) { v = world.structVersion; syncList(); }
    if (world.terrain.version !== tv && !digging) { tv = world.terrain.version; dressTrenches(heightAt); }
    for (const m of meshes.values()) {
      const s = m.s;
      if (s.hitT !== m.lastHit) { m.lastHit = s.hitT; m.shake = 0.25; }
      const body = m.g.children[0];
      if (m.shake > 0) { m.shake -= dt; body.position.x = Math.sin(t * 70) * 0.05 * m.shake * 4; }
      // burning timber glows, then stays charred
      if (s.burning > 0) { if (body.material !== burnMat) body.material = burnMat; m.burnt = true; }
      else if (m.burnt && body.material !== charMat) body.material = charMat;
      // damaged: lean a little
      const dmg = 1 - s.hp / s.maxHp;
      if (s.kind !== 'tower' && s.kind !== 'caltrops' && s.wood) body.rotation.x = dmg > 0.4 ? (dmg - 0.4) * 0.25 : 0;
      if (m.g.userData.pennant) { const p = m.g.userData.pennant; p.rotation.y = Math.sin(t * 2 + s.base) * 0.4; }
      if (m.g.userData.doors || m.g.userData.portcullis) {
        // gates open when friends are near
        let near = false;
        const mx = m.g.position.x, mz = m.g.position.z;
        for (const so of world.soldiers) { if (!so.alive || so.sq.team !== s.team) continue; if ((so.x - mx) ** 2 + (so.z - mz) ** 2 < 42) { near = true; break; } }
        m.open = (m.open || 0) + ((near ? 1 : 0) - (m.open || 0)) * Math.min(1, dt * 3);
        if (m.g.userData.doors) { const [dl, dr] = m.g.userData.doors; dl.rotation.y = m.open * 1.5; dr.rotation.y = -m.open * 1.5; }
        else m.g.userData.portcullis.position.y = m.open * 3.9;
      }
    }
    burnMat.emissiveIntensity = 0.8 + Math.sin(t * 13) * 0.25 + Math.sin(t * 7.3) * 0.2;
  }
  return { update, meshes, dressTrenches, counts: dress.counts };
}

// the timber dressing of every dug trench (planks, posts, gabions), shared by both renderers
export function createTrenchDressing(scene, world, mat) {
  // trench dressing (instanced), rebuilt when the terrain version changes
  const plank = new THREE.InstancedMesh(plankGeo(), mat, 3000), post = new THREE.InstancedMesh(postGeo(), mat, 1500), gab = new THREE.InstancedMesh(gabionGeo(), mat, 600);
  for (const im of [plank, post, gab]) { im.castShadow = true; im.receiveShadow = true; im.count = 0; scene.add(im); }
  function dressTrenches(heightAt) {
    const hf = world.terrain;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
    let np = 0, npo = 0, ng = 0;
    const tang = new THREE.Vector3();
    const r = rnd(99);
    for (const L of hf.trenchLines) {
      const pts = L.pts;
      const fw = 2.5 * 0.28, tw = fw + (L.depth || 1.6) / Math.tan(55 * Math.PI / 180) * 0.9 + 0.15;
      let acc = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const dx = b[0] - a[0], dz = b[1] - a[1], seg = Math.hypot(dx, dz);
        if (seg < 0.01) continue;
        let nx = -dz / seg, nz = dx / seg, flip = 1;
        if (nx * L.enemyDir[0] + nz * L.enemyDir[1] < 0) { nx = -nx; nz = -nz; flip = -1; }
        tang.set(dx / seg, 0, dz / seg);
        const ang = Math.atan2(dx, dz);
        const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
        for (const side of [1, -1]) {
          const off = (fw + tw) / 2 + 0.02;
          const px = mx + nx * off * side, pz = mz + nz * off * side;
          const base = hf.base ? hf.height(px, pz) : 0;
          if (np < 3000 && hf.trenchAmt(px - nx * side * 0.3, pz - nz * side * 0.3) > 0.3) {
            e.set(0, ang + (side > 0 ? Math.PI / 2 : -Math.PI / 2), 0, 'YXZ');
            q.setFromEuler(e);
            const tilt = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.55);
            q.multiply(tilt);
            p.set(px, (heightAt ? heightAt(px, pz) : base) + 0.05, pz);
            sc.set(seg / 1.0 + 0.04, 1, 1);
            m4.compose(p, q, sc);
            plank.setMatrixAt(np++, m4);
          }
          if (acc % 2.2 < seg && npo < 1500) {
            const qx = mx + nx * (fw + 0.1) * side, qz = mz + nz * (fw + 0.1) * side;
            q.setFromAxisAngle(tang, 0.38 * side * flip + (r() - 0.5) * 0.08);
            p.set(qx, (heightAt ? heightAt(qx, qz) : 0) + 0.6, qz); sc.set(1, 1, 1);
            m4.compose(p, q, sc);
            post.setMatrixAt(npo++, m4);
          }
        }
        if (ng < 600 && (i % 4 === 1) && r() < 0.7) {
          const gx = mx + nx * (tw + 1.1), gz = mz + nz * (tw + 1.1);
          e.set(0, r() * 6, 0); q.setFromEuler(e);
          p.set(gx, (heightAt ? heightAt(gx, gz) : 0) + 0.3, gz); sc.set(1, 0.9 + r() * 0.3, 1);
          m4.compose(p, q, sc);
          gab.setMatrixAt(ng++, m4);
        }
        acc += seg;
      }
    }
    plank.count = np; post.count = npo; gab.count = ng;
    for (const im of [plank, post, gab]) { im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); }
  }

  return { dressTrenches, counts: () => [plank.count, post.count, gab.count], meshes: [plank, post, gab] };
}

// wall stairs (v3.1): a flight of stone or timber steps against a wall's inner face, built for a
// 6 m wall (scaled to the wall's height). Origin at the foot of the flight's wall end; the flight
// runs away from the wall along -z and rises toward +z.
function stairsGeo(wood) {
  const P = [], H = 6, N = 12, run = 7.2, W = 2.4;
  const col = wood ? WOOD : 0xaea698, colD = wood ? WOODD : 0x8f877a;
  for (let k = 0; k < N; k++) {
    const h = (k + 1) * (H / N), z = -run + (k + 0.5) * (run / N);
    if (wood) P.push(part(rbox(W, 0.14, run / N + 0.08, 0.03), k % 2 ? WOOD : 0x7b5a3b, { pos: [0, h - 0.07, z], grad: 0.2 }));
    else P.push(part(box(W, h, run / N + 0.02), k % 3 === 0 ? col : k % 3 === 1 ? 0xb4ab9b : 0xa49c8f, { pos: [0, h / 2, z] }));
  }
  if (wood) {
    for (const x of [-W / 2, W / 2]) {
      const L = Math.hypot(run, H);
      P.push(part(rbox(0.16, 0.28, L, 0.04), colD, { pos: [x, H / 2, -run / 2], rot: [Math.atan2(H, run), 0, 0] }));
      for (const zz of [-run * 0.75, -run * 0.4, -0.3]) { const hh = H * (1 + zz / run); P.push(part(cyl(0.09, 0.1, hh, 6), BARK, { pos: [x, hh / 2, zz] })); }
    }
  } else {
    // a low parapet along the open side
    const L = Math.hypot(run, H);
    P.push(part(box(0.3, 0.5, L), colD, { pos: [W / 2 + 0.1, H / 2 + 0.25, -run / 2], rot: [Math.atan2(H, run), 0, 0] }));
  }
  return merge(P);
}
// scaffolding around a keep under construction: a 1 x 1 footprint, 1 high (scaled per keep)
function scaffoldGeo() {
  const P = [];
  for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0, -0.5], [0, 0.5], [-0.5, 0], [0.5, 0]]) P.push(part(box(0.025, 1, 0.025), 0x7b5a3b, { pos: [x, 0.5, z] }));
  for (const y of [0.25, 0.5, 0.75, 0.98]) {
    for (const z of [-0.5, 0.5]) P.push(part(box(1.03, 0.012, 0.02), 0x6a4b30, { pos: [0, y, z] }));
    for (const x of [-0.5, 0.5]) P.push(part(box(0.02, 0.012, 1.03), 0x6a4b30, { pos: [x, y, 0] }));
    // planks on the outer walkways
    for (const z of [-0.54, 0.54]) P.push(part(box(1.0, 0.008, 0.07), 0xa88a62, { pos: [0, y + 0.01, z] }));
  }
  for (const z of [-0.5, 0.5]) for (const s of [-1, 1]) P.push(part(box(0.012, 0.012, 0.75), 0x6a4b30, { pos: [s * 0.25, 0.5, z], rot: [0, Math.PI / 2, s * 0.8] }));
  return merge(P);
}
// the outpost's timber keep on its earth mound (a motte): a log tower with a hoarding gallery, a
// shingle roof and a palisade crown on the mound. About 12 m across, 15 m to the roof's peak.
function timberKeepGeo() {
  const P = [];
  P.push(part(cyl(7.2, 9.6, 2.6, 24), 0x6f7a3a, { pos: [0, 0.4, 0], grad: 0.35 }));
  P.push(part(cyl(7.25, 7.3, 0.3, 24), 0x7a6a44, { pos: [0, 1.75, 0] }));
  // the crown of stakes around the mound top
  for (let k = 0; k < 36; k++) { const a = k / 36 * Math.PI * 2; if (Math.abs(Math.sin(a)) < 0.12 && Math.cos(a) < 0) continue; P.push(part(cyl(0.16, 0.18, 2.4, 6), k % 2 ? WOOD : BARK, { pos: [Math.cos(a) * 6.9, 2.9, Math.sin(a) * 6.9], grad: 0.3 })); P.push(part(cone(0.16, 0.35, 6), 0xa88a62, { pos: [Math.cos(a) * 6.9, 4.3, Math.sin(a) * 6.9] })); }
  // the log tower
  const W = 6.4, H = 8;
  for (let y = 1.9; y < 1.9 + H; y += 0.42) for (const f of [0, 1]) {
    const rot = f ? Math.PI / 2 : 0;
    for (const s of [-1, 1]) P.push(part(cyl(0.22, 0.22, W + 0.7, 8), (y * 10 | 0) % 2 ? WOOD : 0x7b5a3b, { pos: f ? [s * W / 2, y + (f ? 0.21 : 0), 0] : [0, y, s * W / 2], rot: [0, rot, Math.PI / 2], grad: 0.15 }));
  }
  P.push(part(box(W - 0.4, H, W - 0.4), 0x5d4630, { pos: [0, 1.9 + H / 2, 0] }));
  // the hoarding gallery that overhangs the top
  P.push(part(rbox(W + 2.2, 0.25, W + 2.2, 0.05), WOODD, { pos: [0, 1.9 + H, 0] }));
  for (const [x, z, r] of [[0, W / 2 + 1, 0], [0, -W / 2 - 1, 0], [W / 2 + 1, 0, Math.PI / 2], [-W / 2 - 1, 0, Math.PI / 2]]) {
    P.push(part(rbox(W + 2.2, 1.6, 0.2, 0.04), 0x7b5a3b, { pos: [x, 2.7 + H, z], rot: [0, r, 0], grad: 0.25 }));
    for (let k = -2; k <= 2; k++) P.push(part(box(0.5, 0.6, 0.24), 0x2a1d14, { pos: [x + (r ? 0 : k * 1.6), 2.9 + H, z + (r ? k * 1.6 : 0)], rot: [0, r, 0] }));
  }
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) P.push(part(cyl(0.16, 0.16, 2.0, 6), BARK, { pos: [x * (W / 2 + 1), 1.9 + H - 0.9, z * (W / 2 + 1)], rot: [x * 0.3, 0, -z * 0.3] }));
  // a shingle roof and a lookout
  P.push(part(cone((W + 2.6) * 0.72, 4.2, 4), 0x6e4a32, { pos: [0, 1.9 + H + 3.7, 0], rot: [0, Math.PI / 4, 0], grad: 0.3 }));
  P.push(part(cyl(0.09, 0.1, 3.0, 6), BARK, { pos: [0, 1.9 + H + 6.6, 0] }));
  // a door up a ladder-stair and a ramp up the mound
  P.push(part(rbox(1.6, 2.4, 0.3, 0.06), 0x3a2a1c, { pos: [0, 3.3, -W / 2 - 0.25] }));
  P.push(part(rbox(2.2, 0.2, 7.2, 0.05), 0x7b5a3b, { pos: [0, 1.0, -W / 2 - 3.8], rot: [-0.24, 0, 0] }));
  return merge(P);
}

export const STRUCT_GEO = { stairsGeo, scaffoldGeo, timberKeepGeo, palisadeGeo, stakesGeo, stoneWallGeo, gateGeo, doorGeo, towerGeo, stoneGateGeo, portcullisGeo, stoneTowerGeo, caltropsGeo, rubbleGeo };
