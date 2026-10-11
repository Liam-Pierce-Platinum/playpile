// Toy-diorama object catalog: every liftable thing is built once from bevelled
// primitives, merged into one vertex-coloured geometry per part, and then drawn
// with one InstancedMesh per type (see world.js).
import * as THREE from 'three';

const C = (h) => new THREE.Color(h);
export const PAL = {
  grass: '#8fd16a', grass2: '#7cc25a', road: '#5c6272', coral: '#ff7a6b', teal: '#3cc3b5',
  mustard: '#ffcc4d', cream: '#fff3df', water: '#4cc9ff', blue: '#5b8cff', white: '#f7f7f2',
  dark: '#3a3f4b', glass: '#bfe6ff', wood: '#c98b5a', leaf: '#5cc45a', leaf2: '#6fd46a',
  pine: '#3f9e5a', trunk: '#9b6b4a', red: '#ff5a5a', pink: '#ffd6e0', mint: '#d9f5e6', skin: '#ffd2b0',
};

// ---- primitives -------------------------------------------------------------
// Rounded box: an odd-segment box whose middle segment is stretched flat and the
// rest bent onto quarter-spheres (same trick as three's RoundedBoxGeometry).
export function rbox(w, h, d, r = 0.08, seg = 1) {
  r = Math.max(0.001, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
  const n = seg * 2 + 1, half = 0.5 / n;
  const g = new THREE.BoxGeometry(1, 1, 1, n, n, n);
  const P = g.attributes.position, N = g.attributes.normal;
  const v = new THREE.Vector3(), nv = new THREE.Vector3();
  const ix = w / 2 - r, iy = h / 2 - r, iz = d / 2 - r;
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    nv.set(v.x - Math.sign(v.x) * half, v.y - Math.sign(v.y) * half, v.z - Math.sign(v.z) * half).normalize();
    P.setXYZ(i, Math.sign(v.x) * ix + nv.x * r, Math.sign(v.y) * iy + nv.y * r, Math.sign(v.z) * iz + nv.z * r);
    N.setXYZ(i, nv.x, nv.y, nv.z);
  }
  return g;
}
export const cyl = (rt, rb, h, s = 10, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
export const ball = (r, d = 1) => new THREE.IcosahedronGeometry(r, d);
export const torus = (r, t) => new THREE.TorusGeometry(r, t, 6, 14);
// Triangular prism roof (ridge along x), apex up, slightly bevelled.
export function gable(width, depth, height) {
  const s = new THREE.Shape();
  s.moveTo(-depth / 2, 0); s.lineTo(depth / 2, 0); s.lineTo(0, height); s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: width, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 1 });
  g.translate(0, 0, -width / 2);
  g.rotateY(Math.PI / 2);
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
// A part: geometry + colour + transform. flat=true recomputes faceted normals.
export function P(g, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1, flat = false) {
  return { g, color, x, y, z, rx, ry, rz, sx, sy, sz, flat };
}
export function merge(parts) {
  const ready = [];
  let total = 0;
  for (const p of parts) {
    let g = p.g.index ? p.g.toNonIndexed() : p.g.clone();
    if (p.flat) g.computeVertexNormals();
    _m.compose(_p.set(p.x, p.y, p.z), _q.setFromEuler(_e.set(p.rx, p.ry, p.rz)), _s.set(p.sx, p.sy, p.sz));
    g.applyMatrix4(_m);
    ready.push([g, C(p.color)]);
    total += g.attributes.position.count;
  }
  const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3);
  let o = 0;
  for (const [g, c] of ready) {
    const gp = g.attributes.position.array, gn = g.attributes.normal.array;
    pos.set(gp, o * 3); nor.set(gn, o * 3);
    const n = g.attributes.position.count;
    for (let i = 0; i < n; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += n;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}

// ---- the catalog ------------------------------------------------------------
// tier: smallest storm category that can lift it (0..6). size: footprint radius.
// mass: what it adds to the storm. parts[1] (if any) is the piece that peels off
// first (roofs, caps). label is the score pop-up.
export const TIER_NAMES = ['cones', 'people', 'cars', 'trees', 'houses', 'towers', 'stadium'];

function car(col) {
  const p = [
    P(rbox(2.3, 0.62, 1.12, 0.26), col, 0, 0.55, 0),
    P(rbox(1.25, 0.56, 0.98, 0.22), PAL.glass, -0.12, 1.0, 0),
    P(rbox(1.18, 0.12, 0.92, 0.05), col, -0.12, 1.28, 0),
    P(rbox(0.1, 0.16, 0.26, 0.04), '#fff6c8', 1.15, 0.62, 0.32), P(rbox(0.1, 0.16, 0.26, 0.04), '#fff6c8', 1.15, 0.62, -0.32),
  ];
  for (const sx of [-0.75, 0.75]) for (const sz of [-0.5, 0.5]) p.push(P(cyl(0.3, 0.3, 0.22, 8), PAL.dark, sx, 0.3, sz, Math.PI / 2));
  return [merge(p)];
}
function person(shirt) {
  return [merge([
    P(rbox(0.34, 0.42, 0.22, 0.08), '#4a5068', 0, 0.21, 0),
    P(rbox(0.44, 0.46, 0.27, 0.12), shirt, 0, 0.64, 0),
    P(ball(0.18, 1), PAL.skin, 0, 1.03, 0),
    P(ball(0.185, 0), "#5a3a2a", 0, 1.09, -0.03, 0, 0, 0, 1, 0.6, 1),
  ])];
}
function house(roof, wall) {
  const base = merge([
    P(rbox(3.6, 2.4, 3.0, 0.16), wall, 0, 1.2, 0),
    P(rbox(0.66, 1.12, 0.1, 0.05), PAL.wood, 0.2, 0.56, 1.5),
    P(rbox(0.72, 0.62, 0.08, 0.06), PAL.glass, -1.0, 1.42, 1.5), P(rbox(0.72, 0.62, 0.08, 0.06), PAL.glass, 1.15, 1.42, 1.5),
    P(rbox(0.08, 0.62, 0.72, 0.06), PAL.glass, 1.8, 1.42, 0), P(rbox(0.08, 0.62, 0.72, 0.06), PAL.glass, -1.8, 1.42, 0),
    P(rbox(1.2, 0.1, 0.5, 0.04), '#e8dcc6', 0.2, 0.05, 1.75),
  ]);
  const top = merge([
    P(gable(4.0, 3.6, 1.45), roof, 0, 2.38, 0, 0, 0, 0, 1, 1, 1, true),
    P(rbox(0.5, 1.0, 0.5, 0.06), '#e2d6c4', 1.1, 3.4, -0.5),
  ]);
  return [base, top];
}
function shop(wall, awnA) {
  const p = [P(rbox(4.2, 3.2, 3.4, 0.16), wall, 0, 1.6, 0),
    P(rbox(3.2, 1.3, 0.1, 0.06), PAL.glass, 0, 1.0, 1.7),
    P(rbox(0.8, 1.6, 0.1, 0.05), '#e3eef7', 1.55, 0.8, 1.7)];
  const top = [P(rbox(4.4, 0.35, 3.6, 0.1), '#f4ead8', 0, 3.3, 0), P(rbox(3.8, 0.1, 3.0, 0.05), '#d9d3c9', 0, 3.48, 0), P(rbox(0.95, 0.55, 0.75, 0.12), '#eef1f6', -1.0, 3.75, -0.5), P(cyl(0.26, 0.26, 0.45, 10), '#b9c0cc', 1.2, 3.72, -0.7), P(rbox(2.4, 0.6, 0.15, 0.08), PAL.mustard, 0, 2.7, 1.75)];
  for (let i = 0; i < 6; i++) top.push(P(rbox(0.7, 0.12, 1.0, 0.04), i % 2 ? '#ffffff' : awnA, -1.75 + i * 0.7, 2.05, 2.1, -0.35, 0, 0));
  return [merge(p), merge(top)];
}
function tower(h, wall, cap, band) {
  const p = [P(rbox(5, h, 5, 0.35), wall, 0, h / 2, 0), P(rbox(1.4, 1.6, 0.12, 0.06), PAL.glass, 0, 0.8, 2.52)];
  for (let y = 2.2; y < h - 0.8; y += 1.7) p.push(P(rbox(5.08, 0.7, 5.08, 0.3), band, 0, y, 0));
  const top = merge([P(rbox(5.3, 0.5, 5.3, 0.2), cap, 0, h + 0.2, 0), P(rbox(1.6, 1.0, 1.6, 0.15), '#e6e2da', 1.0, h + 0.9, -1.0), P(cyl(0.5, 0.5, 1.2, 12), '#d8d2c8', -1.2, h + 1.0, 0.9)]);
  return [merge(p), top];
}

export function makeTypes() {
  const T = [];
  const add = (key, label, tier, mass, size, parts, extra = {}) => T.push({ key, label, tier, mass, size, parts, ...extra });
  // tier 0
  add('cone', 'CONE', 0, 1, 0.45, [merge([P(rbox(0.62, 0.08, 0.62, 0.03), '#ece9f2', 0, 0.04, 0), P(cyl(0.05, 0.27, 0.72, 12), '#ff8a3d', 0, 0.44, 0), P(cyl(0.135, 0.175, 0.13, 12), '#ffffff', 0, 0.45, 0)])]);
  add('bin', 'BIN', 0, 1, 0.45, [merge([P(cyl(0.3, 0.26, 0.75, 14), PAL.teal, 0, 0.375, 0), P(cyl(0.33, 0.33, 0.1, 14), '#2a9e93', 0, 0.8, 0)])]);
  add('hydrant', 'HYDRANT', 0, 1, 0.4, [merge([P(cyl(0.16, 0.2, 0.55, 10), PAL.red, 0, 0.28, 0), P(ball(0.17, 1), PAL.red, 0, 0.58, 0), P(rbox(0.5, 0.12, 0.12, 0.05), '#e04848', 0, 0.38, 0)])]);
  // tier 1
  add('person_a', 'PERSON', 1, 2, 0.5, person(PAL.coral));
  add('person_b', 'PERSON', 1, 2, 0.5, person(PAL.teal));
  add('person_c', 'PERSON', 1, 2, 0.5, person(PAL.mustard));
  add('bike', 'BIKE', 1, 2, 0.6, [merge([P(torus(0.28, 0.055), PAL.dark, -0.42, 0.33, 0), P(torus(0.28, 0.055), PAL.dark, 0.42, 0.33, 0), P(rbox(0.86, 0.08, 0.08, 0.03), PAL.coral, 0, 0.55, 0, 0, 0, 0.15), P(rbox(0.08, 0.4, 0.08, 0.03), PAL.coral, -0.12, 0.6, 0), P(rbox(0.28, 0.07, 0.14, 0.03), PAL.dark, -0.14, 0.83, 0), P(rbox(0.06, 0.06, 0.5, 0.02), PAL.dark, 0.36, 0.86, 0)])]);
  add('bench', 'BENCH', 1, 2, 0.7, [merge([P(rbox(1.4, 0.1, 0.45, 0.04), PAL.wood, 0, 0.46, 0), P(rbox(1.4, 0.36, 0.08, 0.04), PAL.wood, 0, 0.78, -0.2), P(rbox(0.08, 0.46, 0.4, 0.03), PAL.dark, -0.6, 0.23, 0), P(rbox(0.08, 0.46, 0.4, 0.03), PAL.dark, 0.6, 0.23, 0)])]);
  add('bush', 'BUSH', 1, 2, 0.6, [merge([P(ball(0.5, 1), '#58b84a', 0, 0.42, 0), P(ball(0.38, 1), '#69c75a', 0.35, 0.36, 0.15), P(ball(0.34, 1), '#4fae44', -0.32, 0.32, -0.1)])]);
  add('mailbox', 'MAILBOX', 1, 2, 0.4, [merge([P(rbox(0.1, 0.8, 0.1, 0.03), '#8a8f9c', 0, 0.4, 0), P(rbox(0.36, 0.32, 0.56, 0.12), PAL.blue, 0, 0.92, 0), P(rbox(0.04, 0.22, 0.06, 0.02), PAL.red, 0.2, 1.05, 0.15)])]);
  // tier 2
  add('car_coral', 'CAR', 2, 6, 1.3, car(PAL.coral));
  add('car_teal', 'CAR', 2, 6, 1.3, car(PAL.teal));
  add('car_mustard', 'CAR', 2, 6, 1.3, car(PAL.mustard));
  add('car_white', 'CAR', 2, 6, 1.3, car(PAL.white));
  add('car_blue', 'CAR', 2, 6, 1.3, car(PAL.blue));
  add('cow', 'COW', 2, 5, 1.0, [merge([P(rbox(1.5, 0.8, 0.82, 0.28), '#ffffff', 0, 0.95, 0), P(rbox(0.5, 0.5, 0.06, 0.2), '#3a3a44', -0.2, 1.0, 0.41), P(rbox(0.4, 0.4, 0.06, 0.15), '#3a3a44', 0.35, 1.1, -0.41), P(rbox(0.5, 0.5, 0.5, 0.18), '#ffffff', 0.85, 1.2, 0), P(rbox(0.2, 0.26, 0.42, 0.08), '#ffb3c1', 1.12, 1.08, 0), P(rbox(0.1, 0.12, 0.6, 0.04), '#f3e3c8', 0.85, 1.48, 0), ...[[-0.5, -0.25], [-0.5, 0.25], [0.5, -0.25], [0.5, 0.25]].map(([x, z]) => P(cyl(0.09, 0.09, 0.62, 8), '#ffffff', x, 0.31, z))])]);
  add('hay', 'HAY', 2, 4, 0.8, [merge([P(cyl(0.6, 0.6, 1.1, 16), '#f2c14e', 0, 0.6, 0, 0, 0, Math.PI / 2), P(cyl(0.62, 0.62, 0.08, 16), '#d9a63a', 0.25, 0.6, 0, 0, 0, Math.PI / 2), P(cyl(0.62, 0.62, 0.08, 16), '#d9a63a', -0.25, 0.6, 0, 0, 0, Math.PI / 2)])]);
  add('boat', 'BOAT', 2, 6, 1.4, [merge([P(rbox(2.7, 0.62, 1.15, 0.28), '#ffffff', 0, 0.2, 0), P(rbox(2.74, 0.14, 1.19, 0.06), PAL.coral, 0, 0.1, 0), P(rbox(1.0, 0.62, 0.82, 0.16), PAL.teal, -0.3, 0.8, 0), P(rbox(0.9, 0.2, 0.9, 0.08), '#ffffff', -0.3, 1.18, 0)])], { water: true });
  // tier 3
  add('tree', 'TREE', 3, 12, 1.3, [merge([P(cyl(0.18, 0.26, 1.3, 8), PAL.trunk, 0, 0.65, 0), P(ball(1.1, 1), PAL.leaf, 0, 2.0, 0), P(ball(0.8, 1), PAL.leaf2, 0.55, 1.65, 0.3), P(ball(0.72, 1), '#52b450', -0.5, 2.45, -0.2)])]);
  add('pine', 'TREE', 3, 10, 1.1, [merge([P(cyl(0.16, 0.22, 1.0, 8), PAL.trunk, 0, 0.5, 0), P(cyl(0.02, 1.15, 1.5, 9), PAL.pine, 0, 1.6, 0), P(cyl(0.02, 0.92, 1.3, 9), '#47ad63', 0, 2.3, 0), P(cyl(0.02, 0.66, 1.1, 9), '#52b86c', 0, 2.95, 0)])]);
  add('van', 'TRUCK', 3, 14, 1.6, [merge([P(rbox(2.9, 1.45, 1.35, 0.3), '#ffffff', -0.2, 1.05, 0), P(rbox(0.9, 1.05, 1.32, 0.28), PAL.mustard, 1.4, 0.82, 0), P(rbox(0.5, 0.5, 1.2, 0.14), PAL.glass, 1.55, 1.1, 0), P(rbox(2.0, 0.5, 0.06, 0.1), PAL.coral, -0.3, 1.2, 0.68), ...[[-1.0, -0.6], [-1.0, 0.6], [1.2, -0.6], [1.2, 0.6]].map(([x, z]) => P(cyl(0.34, 0.34, 0.24, 12), PAL.dark, x, 0.34, z, Math.PI / 2))])]);
  add('container_a', 'CONTAINER', 3, 14, 1.8, container(PAL.coral));
  add('container_b', 'CONTAINER', 3, 14, 1.8, container(PAL.teal));
  add('container_c', 'CONTAINER', 3, 14, 1.8, container(PAL.blue));
  add('tractor', 'TRACTOR', 3, 12, 1.4, [merge([P(rbox(1.8, 0.8, 1.0, 0.2), '#4fbf5a', 0.2, 0.95, 0), P(rbox(0.9, 1.0, 0.95, 0.16), PAL.glass, -0.45, 1.75, 0), P(rbox(1.0, 0.12, 1.05, 0.05), '#4fbf5a', -0.45, 2.3, 0), P(cyl(0.62, 0.62, 0.36, 16), PAL.dark, -0.55, 0.62, 0.62, Math.PI / 2), P(cyl(0.62, 0.62, 0.36, 16), PAL.dark, -0.55, 0.62, -0.62, Math.PI / 2), P(cyl(0.36, 0.36, 0.26, 12), PAL.dark, 0.85, 0.36, 0.55, Math.PI / 2), P(cyl(0.36, 0.36, 0.26, 12), PAL.dark, 0.85, 0.36, -0.55, Math.PI / 2), P(cyl(0.08, 0.08, 0.7, 6), '#777', 0.7, 1.6, 0.2)])]);
  add('kiosk', 'KIOSK', 3, 10, 1.2, [merge([P(rbox(1.8, 1.25, 1.4, 0.12), PAL.cream, 0, 0.62, 0), P(rbox(1.5, 0.5, 0.08, 0.05), PAL.glass, 0, 0.95, 0.7), ...[0, 1, 2, 3, 4].map((i) => P(rbox(0.42, 0.1, 1.8, 0.04), i % 2 ? '#ffffff' : PAL.coral, -0.84 + i * 0.42, 1.55, 0.1, 0.22, 0, 0)), P(rbox(1.0, 0.36, 0.1, 0.05), PAL.mustard, 0, 1.95, 0.0)])]);
  add('fountain', 'FOUNTAIN', 3, 12, 1.6, [merge([P(cyl(1.6, 1.7, 0.5, 20), '#e6e1d8', 0, 0.25, 0), P(cyl(1.35, 1.35, 0.1, 20), PAL.water, 0, 0.48, 0), P(cyl(0.25, 0.35, 1.2, 10), '#e6e1d8', 0, 0.9, 0), P(cyl(0.7, 0.5, 0.2, 14), '#e6e1d8', 0, 1.5, 0), P(ball(0.3, 1), '#9fe3ff', 0, 1.75, 0)])]);
  // tier 4
  add('house_coral', 'HOUSE', 4, 30, 2.2, house(PAL.coral, PAL.cream));
  add('house_teal', 'HOUSE', 4, 30, 2.2, house(PAL.teal, '#fff8ee'));
  add('house_mustard', 'HOUSE', 4, 30, 2.2, house(PAL.mustard, '#ffe9e1'));
  add('shop_a', 'SHOP', 4, 32, 2.3, shop(PAL.mint, PAL.coral));
  add('shop_b', 'SHOP', 4, 32, 2.3, shop('#ffe3d6', PAL.teal));
  add('shop_c', 'SHOP', 4, 32, 2.3, shop(PAL.cream, PAL.blue));
  add('barn', 'BARN', 4, 36, 2.4, [merge([P(rbox(4.2, 3.0, 3.4, 0.14), '#e8574f', 0, 1.5, 0), P(rbox(1.6, 2.0, 0.1, 0.06), '#ffffff', 0, 1.0, 1.7), P(rbox(1.3, 0.12, 0.1, 0.04), '#ffffff', 0, 1.0, 1.76, 0, 0, 0.9), P(rbox(1.3, 0.12, 0.1, 0.04), '#ffffff', 0, 1.0, 1.76, 0, 0, -0.9)]), merge([P(gable(4.6, 3.8, 1.8), '#8a5a5a', 0, 2.95, 0, 0, 0, 0, 1, 1, 1, true)])]);
  add('silo', 'SILO', 4, 28, 1.4, [merge([P(cyl(1.1, 1.1, 4.6, 18), '#dfe3ea', 0, 2.3, 0), P(cyl(1.13, 1.13, 0.16, 18), '#b9c0cc', 0, 1.5, 0), P(cyl(1.13, 1.13, 0.16, 18), '#b9c0cc', 0, 3.1, 0)]), merge([P(ball(1.12, 2), PAL.coral, 0, 4.6, 0, 0, 0, 0, 1, 0.6, 1)])]);
  add('warehouse', 'WAREHOUSE', 4, 34, 2.6, [merge([P(rbox(5.0, 2.8, 3.6, 0.14), '#d8dde6', 0, 1.4, 0), P(rbox(1.8, 2.0, 0.1, 0.06), PAL.coral, -1.0, 1.0, 1.8), P(rbox(3.0, 0.4, 0.1, 0.06), PAL.teal, 0.8, 2.3, 1.8)]), merge([P(rbox(5.2, 0.4, 3.8, 0.14), '#aeb6c4', 0, 2.95, 0)])]);
  // tier 5
  add('tower_a', 'TOWER', 5, 90, 3.4, tower(12, '#e9eef8', PAL.coral, '#a9d8f5'));
  add('tower_b', 'TOWER', 5, 100, 3.4, tower(15, '#dff3ef', PAL.teal, '#9fd8ea'));
  add('tower_c', 'TOWER', 5, 80, 3.4, tower(10, '#fff0dc', PAL.mustard, '#b8dcf2'));
  add('watertower', 'WATER TOWER', 5, 70, 2.2, [merge([...[[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([x, z]) => P(cyl(0.12, 0.16, 5, 6), '#c9b79c', x, 2.5, z)), P(rbox(2.4, 0.15, 0.15, 0.05), '#c9b79c', 0, 2.5, 1), P(rbox(2.4, 0.15, 0.15, 0.05), '#c9b79c', 0, 2.5, -1)]), merge([P(cyl(1.6, 1.6, 2.2, 18), PAL.teal, 0, 6.1, 0), P(cyl(0.2, 1.75, 0.9, 18), '#2fa699', 0, 7.6, 0)])]);
  add('lighthouse', 'LIGHTHOUSE', 5, 160, 2.0, [merge([P(cyl(1.5, 1.7, 0.6, 18), '#e6e1d8', 0, 0.3, 0), P(cyl(1.15, 1.35, 1.8, 18), '#ffffff', 0, 1.5, 0), P(cyl(1.0, 1.15, 1.8, 18), PAL.red, 0, 3.3, 0), P(cyl(0.88, 1.0, 1.8, 18), '#ffffff', 0, 5.1, 0), P(cyl(0.78, 0.88, 1.6, 18), PAL.red, 0, 6.8, 0), P(cyl(1.15, 1.15, 0.2, 18), PAL.dark, 0, 7.7, 0)]), merge([P(cyl(0.68, 0.68, 1.0, 14), '#fff6b0', 0, 8.3, 0), P(cyl(0.05, 0.95, 0.9, 14), PAL.red, 0, 9.25, 0)])], { unique: true });
  // tier 6
  add('stadium', 'STADIUM', 6, 1500, 13, stadium(), { unique: true, double: true });
  return T;
}
function container(col) {
  const c = new THREE.Color(col).multiplyScalar(0.82).getHexString();
  const p = [P(rbox(3.4, 1.5, 1.4, 0.08), col, 0, 0.75, 0)];
  for (let i = 0; i < 7; i++) p.push(P(rbox(0.12, 1.36, 1.46, 0.03), '#' + c, -1.5 + i * 0.5, 0.75, 0));
  return [merge(p)];
}
function stadium() {
  const p = [
    P(cyl(17.5, 18.2, 5.2, 48, true), PAL.cream, 0, 2.6, 0, 0, 0, 0, 1, 1, 0.74),
    P(cyl(17.4, 13.3, 4.4, 48, true), PAL.teal, 0, 2.6, 0, 0, 0, 0, 1, 1, 0.74),
    P(cyl(16.2, 14.5, 0.25, 48, true), '#ffffff', 0, 3.2, 0, 0, 0, 0, 1, 1, 0.74),
    P(cyl(17.6, 17.6, 0.4, 48, true), PAL.coral, 0, 5.1, 0, 0, 0, 0, 1, 1, 0.74),
    P(cyl(13.3, 13.3, 0.3, 40), '#74c95c', 0, 0.42, 0, 0, 0, 0, 1, 1, 0.74),
    P(rbox(14, 0.06, 0.18, 0.02), '#ffffff', 0, 0.6, 0), P(rbox(0.18, 0.06, 18, 0.02), '#ffffff', 0, 0.6, 0),
    P(cyl(2.4, 2.4, 0.06, 24, true), '#ffffff', 0, 0.6, 0),
  ];
  for (let i = 0; i < 5; i++) p.push(P(rbox(1.6, 0.04, 19.4, 0.02), '#86d46e', -10 + i * 5, 0.58, 0));
  for (const [x, z] of [[-14, -9], [14, -9], [-14, 9], [14, 9]]) {
    p.push(P(cyl(0.25, 0.32, 9, 8), '#c9ced8', x, 4.5, z));
    p.push(P(rbox(2.2, 1.2, 0.4, 0.1), '#fff8c8', x, 9.2, z, 0, Math.atan2(-x, -z), 0));
  }
  return [merge(p)];
}
