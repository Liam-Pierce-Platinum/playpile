// Voxel car builder. Every model is a list of boxes merged into one vertex-coloured geometry,
// with baked face shading + a bottom-edge AO gradient so the blocks read crisp, not flat.
// Models face -z (front = -z). Lights are separate meshes so brake lights / blinkers can switch.
import * as THREE from '../vendor/three.module.js';

const C = new THREE.Color();
const FACES = [
  // normal, 4 corners as [x,y,z] picks (0 = min, 1 = max)
  [[1, 0, 0], [[1, 0, 1], [1, 0, 0], [1, 1, 0], [1, 1, 1]], 0.86],
  [[-1, 0, 0], [[0, 0, 0], [0, 0, 1], [0, 1, 1], [0, 1, 0]], 0.86],
  [[0, 1, 0], [[0, 1, 1], [1, 1, 1], [1, 1, 0], [0, 1, 0]], 1.0],
  [[0, -1, 0], [[0, 0, 0], [1, 0, 0], [1, 0, 1], [0, 0, 1]], 0.5],
  [[0, 0, 1], [[0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]], 0.93],
  [[0, 0, -1], [[1, 0, 0], [0, 0, 0], [0, 1, 0], [1, 1, 0]], 0.8],
];

// boxes: [cx, cy, cz, w, h, d, color, ao?]  ->  BufferGeometry (non-indexed)
export function boxesGeo(boxes, opts = {}) {
  const pos = [], nor = [], col = [], uv = [];
  const ao = opts.ao ?? 0.72;
  for (const b of boxes) {
    const [x, y, z, w, h, d, c] = b;
    C.set(c);
    const lo = [x - w / 2, y - h / 2, z - d / 2], hi = [x + w / 2, y + h / 2, z + d / 2];
    for (const [n, q, shade] of FACES) {
      const v = q.map((p) => [p[0] ? hi[0] : lo[0], p[1] ? hi[1] : lo[1], p[2] ? hi[2] : lo[2]]);
      const vs = [v[0], v[1], v[2], v[0], v[2], v[3]];
      const uvq = [[0, 0], [1, 0], [1, 1], [0, 0], [1, 1], [0, 1]];
      vs.forEach((p, i) => {
        pos.push(p[0], p[1], p[2]); nor.push(n[0], n[1], n[2]);
        const a = n[1] === 0 && p[1] === lo[1] && b[7] !== false ? ao : 1;
        col.push(C.r * shade * a, C.g * shade * a, C.b * shade * a);
        uv.push(uvq[i][0], uvq[i][1]);
      });
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

const GLASS = '#22313f', TIRE = '#141518', RIM = '#a9b0b8', TRIM = '#26292e', GRILLE = '#0b0c0e';

// Generic car: returns { body:[], head:[], tail:[], bl:[], br:[], len, wid, h, wheels:[] }
function carSpec(type, body) {
  const S = { body: [], head: [], tail: [], bl: [], br: [], wheels: [] };
  const B = (...a) => S.body.push(a);
  let len = 4.4, wid = 1.8, ride = 0.3, bodyH = 0.5, cabH = 0.56, cabLen = 2.2, cabOff = 0.15, roofIn = 0.08, wheelZ = 1.35, wheelR = 0.33;
  if (type === 'hatch') { len = 3.9; cabLen = 2.1; cabOff = 0.55; wheelZ = 1.2; }
  if (type === 'suv') { len = 4.7; wid = 1.95; ride = 0.4; bodyH = 0.6; cabH = 0.66; cabLen = 2.8; cabOff = 0.5; wheelZ = 1.5; wheelR = 0.38; }
  if (type === 'sports') { len = 4.3; wid = 1.92; ride = 0.22; bodyH = 0.42; cabH = 0.42; cabLen = 1.7; cabOff = 0.35; wheelZ = 1.38; wheelR = 0.32; }
  if (type === 'van') { len = 5.0; wid = 2.0; ride = 0.38; bodyH = 0.6; cabH = 1.2; cabLen = 3.9; cabOff = 0.5; wheelZ = 1.7; wheelR = 0.36; roofIn = 0.02; }
  if (type === 'pickup') { len = 5.1; wid = 1.95; ride = 0.42; bodyH = 0.6; cabH = 0.64; cabLen = 1.7; cabOff = -0.4; wheelZ = 1.7; wheelR = 0.4; }
  if (type === 'truck') return truckSpec(body);
  if (type === 'bus') return busSpec(body);
  const y0 = ride, y1 = ride + bodyH, hz = len / 2;
  // chassis + skirt + bumpers
  B(0, (y0 + y1) / 2, 0, wid, bodyH, len, body);
  B(0, y0 + 0.05, 0, wid + 0.02, 0.1, len - 0.3, TRIM);
  B(0, y0 + 0.12, -hz - 0.04, wid + 0.04, 0.24, 0.1, TRIM);
  B(0, y0 + 0.12, hz + 0.04, wid + 0.04, 0.24, 0.1, TRIM);
  B(0, y0 + bodyH * 0.55, -hz - 0.01, wid * 0.5, bodyH * 0.3, 0.04, GRILLE);
  // cabin: glass block, roof slab, B-pillar
  const cz = cabOff, cy = y1 + cabH / 2;
  B(0, cy, cz, wid - 0.22, cabH, cabLen, GLASS, false);
  B(0, y1 + cabH + 0.04, cz + 0.05, wid - 0.22 - roofIn * 2, 0.08, cabLen - 0.35, body);
  if (type !== 'van') B(0, cy, cz + cabLen * 0.08, wid - 0.18, cabH - 0.04, 0.14, body);
  else { B(0, cy, cz + 0.2, wid + 0.01, cabH * 0.35, cabLen - 0.9, body); }
  // mirrors
  B(wid / 2 + 0.08, y1 + 0.12, cz - cabLen / 2 + 0.25, 0.16, 0.1, 0.22, body);
  B(-wid / 2 - 0.08, y1 + 0.12, cz - cabLen / 2 + 0.25, 0.16, 0.1, 0.22, body);
  if (type === 'sports') {
    B(0, y1 + 0.32, hz - 0.25, wid - 0.2, 0.06, 0.38, TRIM); // wing
    B(0.62, y1 + 0.15, hz - 0.25, 0.08, 0.28, 0.1, TRIM); B(-0.62, y1 + 0.15, hz - 0.25, 0.08, 0.28, 0.1, TRIM);
    B(0, y1 + 0.005, -hz + 0.9, 0.5, 0.03, 1.2, GRILLE); // hood vent
  }
  if (type === 'suv') { B(0.6, y1 + cabH + 0.13, cz, 0.06, 0.08, cabLen - 0.6, TRIM); B(-0.6, y1 + cabH + 0.13, cz, 0.06, 0.08, cabLen - 0.6, TRIM); }
  if (type === 'pickup') { // open bed
    B(0, y1 + 0.02, hz - 1.1, wid - 0.25, 0.04, 2.0, '#1a1c20');
    B(wid / 2 - 0.06, y1 + 0.2, hz - 1.1, 0.1, 0.36, 2.0, body); B(-wid / 2 + 0.06, y1 + 0.2, hz - 1.1, 0.1, 0.36, 2.0, body);
    B(0, y1 + 0.2, hz - 0.06, wid, 0.36, 0.1, body);
  }
  if (type === 'taxi') { B(0, y1 + cabH + 0.2, cz, 0.7, 0.22, 0.3, '#fff6c8'); }
  wheels(S, wid, wheelZ, wheelR);
  lights(S, wid, y0 + bodyH * 0.62, hz, type === 'sports' ? 0.42 : 0.38);
  S.len = len; S.wid = wid; S.h = y1 + cabH + 0.1;
  return S;
}

function wheels(S, wid, wz, r, zs) {
  for (const z of zs || [-wz, wz]) for (const sx of [-1, 1]) {
    S.wheels.push([sx * (wid / 2 - 0.12), r, z]);
    S.body.push([sx * (wid / 2 - 0.12), r, z, 0.3, r * 2, r * 2, TIRE, false]);
    S.body.push([sx * (wid / 2 + 0.04), r, z, 0.04, r, r, RIM, false]);
  }
}
function lights(S, wid, y, hz, w) {
  for (const sx of [-1, 1]) {
    S.head.push([sx * (wid / 2 - w / 2 - 0.08), y, -hz - 0.03, w, 0.14, 0.06, '#fffbe8']);
    S.tail.push([sx * (wid / 2 - w / 2 - 0.08), y, hz + 0.03, w, 0.14, 0.06, '#ffffff']);
  }
  S.bl.push([-wid / 2 + 0.06, y, -hz - 0.03, 0.12, 0.12, 0.07, '#fff'], [-wid / 2 + 0.06, y, hz + 0.03, 0.12, 0.12, 0.07, '#fff']);
  S.br.push([wid / 2 - 0.06, y, -hz - 0.03, 0.12, 0.12, 0.07, '#fff'], [wid / 2 - 0.06, y, hz + 0.03, 0.12, 0.12, 0.07, '#fff']);
}

const TRAILERS = ['#f2f2ee', '#2f6fd6', '#d8d2c4', '#c23a2b', '#3b8f5a', '#e7b416'];
function truckSpec(cab) {
  const S = { body: [], head: [], tail: [], bl: [], br: [], wheels: [] };
  const B = (...a) => S.body.push(a);
  const len = 14, wid = 2.5, hz = len / 2, trailer = TRAILERS[(Math.random() * TRAILERS.length) | 0];
  // cab at front (-z)
  B(0, 1.25, -hz + 1.3, wid, 1.7, 2.6, cab);
  B(0, 2.45, -hz + 1.45, wid - 0.1, 0.7, 2.3, cab);
  B(0, 2.0, -hz - 0.01, wid - 0.4, 0.75, 0.06, GLASS, false);
  B(0, 0.9, -hz - 0.03, wid - 0.5, 0.5, 0.06, GRILLE);
  B(0, 0.48, -hz - 0.08, wid + 0.04, 0.3, 0.16, TRIM);
  B(0, 3.05, -hz + 1.6, wid - 0.6, 0.5, 1.6, cab); // aero roof
  // chassis + trailer
  B(0, 0.75, 1.3, wid - 0.5, 0.35, len - 2.6, TRIM);
  B(0, 2.35, 1.4, wid, 2.9, len - 2.9, trailer);
  B(0, 2.35, 1.4, wid + 0.02, 0.32, len - 3.2, shade(trailer, 0.75));
  B(0, 1.0, hz - 0.05, wid, 0.25, 0.12, '#d9531e');
  wheels(S, wid, 0, 0.52, [-hz + 1.0, hz - 3.6, hz - 2.4, hz - 1.3]);
  for (const sx of [-1, 1]) {
    S.head.push([sx * 0.95, 0.85, -hz - 0.04, 0.4, 0.2, 0.06, '#fffbe8']);
    S.tail.push([sx * 1.0, 1.1, hz + 0.03, 0.34, 0.2, 0.06, '#fff']);
  }
  S.bl.push([-1.15, 0.85, -hz - 0.04, 0.16, 0.16, 0.07, '#fff'], [-1.15, 1.35, hz + 0.03, 0.16, 0.16, 0.07, '#fff']);
  S.br.push([1.15, 0.85, -hz - 0.04, 0.16, 0.16, 0.07, '#fff'], [1.15, 1.35, hz + 0.03, 0.16, 0.16, 0.07, '#fff']);
  S.len = len; S.wid = wid; S.h = 3.8;
  return S;
}
function busSpec(body) {
  const S = { body: [], head: [], tail: [], bl: [], br: [], wheels: [] };
  const B = (...a) => S.body.push(a);
  const len = 11.5, wid = 2.5, hz = len / 2;
  B(0, 1.15, 0, wid, 1.3, len, body);
  B(0, 2.25, 0, wid + 0.01, 0.9, len - 0.3, GLASS, false);
  for (let i = 0; i < 7; i++) B(0, 2.25, -hz + 1.3 + i * 1.5, wid + 0.03, 0.9, 0.16, body);
  B(0, 2.9, 0, wid, 0.4, len, body);
  B(0, 3.17, 0.5, wid - 0.6, 0.18, 3, '#d0d4d8');
  B(0, 2.15, -hz - 0.01, wid - 0.2, 1.1, 0.06, GLASS, false);
  B(0, 0.6, -hz - 0.05, wid + 0.04, 0.3, 0.12, TRIM);
  wheels(S, wid, 0, 0.5, [-hz + 2.3, hz - 2.6]);
  lights(S, wid, 0.95, hz, 0.4);
  S.len = len; S.wid = wid; S.h = 3.3;
  return S;
}
function shade(hex, k) { const c = new THREE.Color(hex); c.multiplyScalar(k); return '#' + c.getHexString(); }

// ---- materials shared by all cars
export const MAT = {
  body: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.05 }),
  head: new THREE.MeshBasicMaterial({ color: '#fff4cf' }),
  tailOff: new THREE.MeshBasicMaterial({ color: '#7a0f12' }),
  tailOn: new THREE.MeshBasicMaterial({ color: '#ff2626' }),
  ambOff: new THREE.MeshBasicMaterial({ color: '#6b4510' }),
  ambOn: new THREE.MeshBasicMaterial({ color: '#ffb020' }),
};

const cache = new Map();
export function carGeos(type, color) {
  const key = type + color;
  if (cache.has(key)) return cache.get(key);
  const S = carSpec(type, color);
  const g = { body: boxesGeo(S.body), head: boxesGeo(S.head, { ao: 1 }), tail: boxesGeo(S.tail, { ao: 1 }),
    bl: boxesGeo(S.bl, { ao: 1 }), br: boxesGeo(S.br, { ao: 1 }), len: S.len, wid: S.wid, h: S.h, wheels: S.wheels };
  cache.set(key, g);
  return g;
}

export function makeCarMesh(type, color) {
  const g = carGeos(type, color);
  const grp = new THREE.Group();
  const body = new THREE.Mesh(g.body, MAT.body); body.castShadow = true;
  const head = new THREE.Mesh(g.head, MAT.head);
  const tail = new THREE.Mesh(g.tail, MAT.tailOff);
  const bl = new THREE.Mesh(g.bl, MAT.ambOff), br = new THREE.Mesh(g.br, MAT.ambOff);
  grp.add(body, head, tail, bl, br);
  grp.userData = { tail, bl, br };
  return { grp, len: g.len, wid: g.wid, h: g.h };
}

// The player's hero car: wide sports body, racing stripes, separate wheels that spin.
export function makePlayer() {
  const S = carSpec('sports', '#ff4a1c');
  const body = S.body.filter((b) => b[6] !== TIRE && b[6] !== RIM);
  const y1 = 0.22 + 0.42;
  body.push([0.22, y1 + 0.015, -0.6, 0.2, 0.03, 3.0, '#ffffff'], [-0.22, y1 + 0.015, -0.6, 0.2, 0.03, 3.0, '#ffffff']);
  body.push([0.2, y1 + 0.47, 0.42, 0.2, 0.02, 1.4, '#ffffff'], [-0.2, y1 + 0.47, 0.42, 0.2, 0.02, 1.4, '#ffffff']);
  body.push([0.45, 0.36, 2.2, 0.16, 0.12, 0.12, '#3a3d42'], [-0.45, 0.36, 2.2, 0.16, 0.12, 0.12, '#3a3d42']);
  const grp = new THREE.Group();
  const bodyMat = MAT.body.clone(); // own copy so dark stages can lift the hero car without touching traffic
  const bodyM = new THREE.Mesh(boxesGeo(body), bodyMat); bodyM.castShadow = true;
  const head = new THREE.Mesh(boxesGeo(S.head, { ao: 1 }), MAT.head);
  const tail = new THREE.Mesh(boxesGeo(S.tail, { ao: 1 }), MAT.tailOff);
  const chassis = new THREE.Group(); chassis.add(bodyM, head, tail);
  grp.add(chassis);
  const wg = boxesGeo([[0, 0, 0, 0.32, 0.64, 0.64, TIRE, false], [0.17, 0, 0, 0.03, 0.4, 0.4, RIM, false], [0.19, 0, 0, 0.03, 0.1, 0.5, '#5d636b', false]]);
  const wheelsM = S.wheels.map(([x, y, z]) => {
    const m = new THREE.Mesh(wg, MAT.body); m.position.set(x, y, z); if (x < 0) m.rotation.y = Math.PI; m.castShadow = true; grp.add(m); return m;
  });
  return { grp, chassis, tail, bodyMat, wheels: wheelsM, len: S.len, wid: S.wid };
}

export const TRAFFIC_COLORS = ['#e9ecef', '#c6ccd2', '#1e2328', '#22344f', '#3e7cc4', '#2c8c86', '#d9a520', '#3f6b3a', '#7c2e45', '#8f949a', '#f4f1e6', '#5a4a8a'];
