// BANNERFALL :: render/props.js - trees, boulders, hedgerows and every landmark: the windmill,
// cottages, town houses, the stone bridge, the abbey, the keep, wagons, wells, ruins, tents,
// campfires, torches and the flag standards. All rounded, smooth-shaded primitives built in code;
// trees, rocks and hedges are instanced. Colours follow the battlefield's biome (data/envs.js).
import * as THREE from '../../vendor/three.module.js';
import { part, merge, mergeSmooth, lumpy, rbox, sphere, cyl, cone, box, lin } from './geo.js';

const vmat = (o = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, ...o });
const STONE = 0xb8b0a2, STONE2 = 0xa59d90, STONED = 0x8a8478, ROOF = 0x8e4a34, ROOFD = 0x6e3626, TIMBER = 0x5a3f2a, PLASTER = 0xe8dcc0, THATCH = 0xb59d6a;

function windify(mat, uniforms, amt = 0.08) {
  mat.customProgramCacheKey = () => 'windify' + amt;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        float sway = sin(uTime * 1.1 + ip.x * 0.15 + ip.z * 0.11) + 0.4 * sin(uTime * 2.3 + ip.z * 0.3);
        float hk = max(0.0, transformed.y - 1.5);
        transformed.x += sway * hk * ${amt.toFixed(3)};
        transformed.z += sway * hk * ${(amt * 0.6).toFixed(3)};
        #endif`);
  };
}

function tintByNormal(m, top, under, snow, snowFrom = 0.55) {
  const c = m.attributes.color, n = m.attributes.normal, P = m.attributes.position;
  const tc = new THREE.Color(), white = lin(0xf4f7fa);
  for (let i = 0; i < c.count; i++) {
    const ny = n.getY(i);
    const k = Math.max(0, Math.min(1, ny * 0.5 + 0.5));
    tc.copy(under).lerp(top, k * k);
    if (snow && ny > snowFrom) tc.lerp(white, Math.min(1, (ny - snowFrom) * 3.2));
    c.setXYZ(i, tc.r, tc.g, tc.b);
  }
  return m;
}

function oakCanopy(seed, env) {
  const parts = [];
  const blobs = [[0, 4.6, 0, 2.3], [1.4, 4.0, 0.5, 1.7], [-1.3, 4.2, -0.6, 1.8], [0.3, 5.6, -0.4, 1.7], [-0.4, 4.0, 1.3, 1.6], [0.9, 4.9, -1.2, 1.5]];
  for (const [x, y, z, r] of blobs) {
    const g = lumpy(new THREE.IcosahedronGeometry(r, 2), r * 0.16, 1.1, seed + x);
    parts.push(part(g, 0x6f8f3f, { pos: [x, y, z], grad: 0.55 }));
  }
  const m = mergeSmooth(parts, 0.02);
  return tintByNormal(m, lin(env.oak[0]), lin(env.oak[1]), env.snowCaps, 0.6);
}
function oakTrunk() {
  return merge([
    part(cyl(0.2, 0.36, 4.2, 9), 0x5a4330, { pos: [0, 2.0, 0], grad: 0.4 }),
    part(cyl(0.08, 0.16, 2.0, 7), 0x5a4330, { pos: [0.6, 3.6, 0.1], rot: [0, 0, -0.8] }),
    part(cyl(0.08, 0.15, 1.8, 7), 0x5a4330, { pos: [-0.5, 3.5, -0.3], rot: [0.3, 0, 0.8] }),
    part(cyl(0.42, 0.55, 0.4, 9), 0x4d3a29, { pos: [0, 0.1, 0] }),
  ]);
}
function pineCanopy(env) {
  const parts = [];
  const tiers = [[3.1, 2.6, 1.5], [2.5, 2.4, 3.0], [1.9, 2.2, 4.4], [1.2, 2.0, 5.7], [0.6, 1.6, 6.8]];
  for (const [r, h, y] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 14, 3);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const yy = p.getY(i);
      if (yy < -h / 2 + 0.01) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, yy - 0.25 - Math.sin(a * 7) * 0.12); }
    }
    g.computeVertexNormals();
    parts.push(part(g, 0x3e5f3a, { pos: [0, y, 0] }));
  }
  const m = merge(parts);
  const c = m.attributes.color, n = m.attributes.normal, P = m.attributes.position;
  const lit = lin(env.pine[0]), dark = lin(env.pine[1]), white = lin(0xf2f5f8);
  const tc = new THREE.Color();
  for (let i = 0; i < c.count; i++) {
    const k = Math.max(0, n.getY(i)) * 0.6 + Math.min(1, P.getY(i) / 8) * 0.4;
    tc.copy(dark).lerp(lit, k);
    if (env.snowCaps && n.getY(i) > 0.45) tc.lerp(white, Math.min(0.95, (n.getY(i) - 0.45) * 2.6));
    c.setXYZ(i, tc.r, tc.g, tc.b);
  }
  return m;
}
function pineTrunk() { return part(cyl(0.14, 0.3, 3.0, 8), 0x5b4535, { pos: [0, 1.2, 0], grad: 0.4 }); }

function rockGeo(seed, env) {
  const g = lumpy(new THREE.IcosahedronGeometry(1, 3), 0.28, 1.3, seed * 10);
  g.scale(1.1, 0.68, 0.9);
  g.translate(0, 0.25, 0);
  g.computeVertexNormals();
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  const base = lin(env.ground.rock), moss = lin(env.snowCaps ? 0xf2f5f8 : 0x7f8f4c), dark = lin(env.ground.rockD);
  const tc = new THREE.Color(), nr = g.attributes.normal;
  for (let i = 0; i < n; i++) {
    const up = nr.getY(i);
    tc.copy(dark).lerp(base, Math.max(0, up * 0.5 + 0.5));
    if (up > 0.7) tc.lerp(moss, Math.min(1, (up - 0.7) * (env.snowCaps ? 3.5 : 2.2)));
    c[i * 3] = tc.r; c[i * 3 + 1] = tc.g; c[i * 3 + 2] = tc.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.deleteAttribute('uv');
  return g;
}
function hedgeGeo(env) {
  const P = [];
  for (const [x, y, z, r] of [[0, 0.7, 0, 1.0], [0.7, 0.6, 0.2, 0.8], [-0.7, 0.62, -0.1, 0.85], [0.1, 1.15, 0.1, 0.7]]) {
    P.push(part(lumpy(new THREE.IcosahedronGeometry(r, 2), r * 0.18, 1.6, x * 3), 0x5a7a3a, { pos: [x, y, z] }));
  }
  const m = mergeSmooth(P, 0.02);
  const top = env.oak[0], under = env.oak[1];
  return tintByNormal(m, lin(top).lerp(lin(0x5f7f3a), 0.5), lin(under), env.snowCaps, 0.5);
}

function instanced(scene, geo, mat, list, place, opts = {}) {
  if (!list.length) return null;
  const im = new THREE.InstancedMesh(geo, mat, list.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  list.forEach((it, i) => { const r = place(it); q.setFromAxisAngle(up, r.rot || 0); if (r.tilt) q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(r.tilt[0], 0, r.tilt[1]))); p.set(r.x, r.y, r.z); s.set(r.s, r.sy || r.s, r.s); m4.compose(p, q, s); im.setMatrixAt(i, m4); });
  im.castShadow = opts.cast !== false; im.receiveShadow = true;
  scene.add(im);
  return im;
}
const mesh = (g, m) => { const o = new THREE.Mesh(g, m || vmat()); o.castShadow = o.receiveShadow = true; return o; };

// a pitched roof: an extruded, slightly puffed triangle along z
function roofGeo(w, h, len, color, puff = 0.1) {
  const sh = new THREE.Shape();
  sh.moveTo(-w / 2, 0); sh.quadraticCurveTo(-w * 0.25, h * (0.7 + puff), 0, h); sh.quadraticCurveTo(w * 0.25, h * (0.7 + puff), w / 2, 0); sh.lineTo(-w / 2, 0);
  const g = new THREE.ExtrudeGeometry(sh, { depth: len, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.18, bevelSegments: 2, curveSegments: 8 });
  g.translate(0, 0, -len / 2);
  return part(g, color, { grad: 0.3 });
}
function crenels(w, d, y, color, step = 1.2) {
  const P = [];
  for (let x = -w / 2 + step / 2; x <= w / 2; x += step * 2) { P.push(part(box(step * 0.9, 0.9, 0.6), color, { pos: [x, y, d / 2 - 0.3] })); P.push(part(box(step * 0.9, 0.9, 0.6), color, { pos: [x, y, -d / 2 + 0.3] })); }
  for (let z = -d / 2 + step / 2; z <= d / 2; z += step * 2) { P.push(part(box(0.6, 0.9, step * 0.9), color, { pos: [w / 2 - 0.3, y, z] })); P.push(part(box(0.6, 0.9, step * 0.9), color, { pos: [-w / 2 + 0.3, y, z] })); }
  return P;
}

// ---- buildings ----
function windmill() {
  const g = new THREE.Group();
  const body = merge([
    part(cyl(2.3, 3.3, 9.5, 20), 0xd9cdb3, { pos: [0, 4.75, 0], grad: 0.2 }),
    part(cyl(3.45, 3.6, 0.6, 20), 0x9a8f7c, { pos: [0, 0.3, 0] }),
    part(rbox(1.3, 2.2, 0.5, 0.15), 0x6b4a2e, { pos: [0, 1.1, 3.2] }),
    part(rbox(0.7, 0.9, 0.3, 0.1), 0x3a2a1e, { pos: [1.1, 5.2, 2.65], rot: [0, 0.35, 0] }),
    part(rbox(0.7, 0.9, 0.3, 0.1), 0x3a2a1e, { pos: [-1.5, 7.2, 1.85], rot: [0, -0.6, 0] }),
    part(cyl(2.6, 2.6, 0.35, 20), 0x7a5a3a, { pos: [0, 9.6, 0] }),
    part(cone(2.9, 3.4, 20), 0x6d4c33, { pos: [0, 11.4, 0], grad: 0.3 }),
    part(cyl(0.25, 0.25, 1.6, 10), 0x5a4330, { pos: [0, 9.8, 2.4], rot: [Math.PI / 2, 0, 0] }),
  ]);
  g.add(mesh(body));
  const sails = new THREE.Group();
  sails.position.set(0, 9.8, 3.3);
  const blade = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    blade.push(part(box(0.22, 7.2, 0.18), 0x5a4330, { pos: [Math.sin(a) * 3.6, Math.cos(a) * 3.6, 0], rot: [0, 0, -a] }));
    blade.push(part(box(1.5, 5.6, 0.06), 0xeee3cc, { pos: [Math.sin(a) * 4.1 + Math.cos(a) * 0.85, Math.cos(a) * 4.1 - Math.sin(a) * 0.85, -0.05], rot: [0, 0, -a] }));
    for (let r = 0; r < 5; r++) blade.push(part(box(1.6, 0.07, 0.1), 0x5a4330, { pos: [Math.sin(a) * (1.8 + r * 1.2) + Math.cos(a) * 0.85, Math.cos(a) * (1.8 + r * 1.2) - Math.sin(a) * 0.85, 0.02], rot: [0, 0, -a] }));
  }
  blade.push(part(sphere(0.45), 0x4d3a29, {}));
  const sm = mesh(merge(blade), vmat({ side: THREE.DoubleSide }));
  sails.add(sm);
  g.add(sails);
  g.userData.sails = sails;
  return g;
}
function cottage(snow) {
  const parts = [
    part(rbox(6, 3.0, 4.4, 0.12), PLASTER, { pos: [0, 1.5, 0], grad: 0.18 }),
    part(rbox(6.2, 0.4, 4.6, 0.1), 0x8a8072, { pos: [0, 0.15, 0] }),
  ];
  for (const x of [-2.9, -1, 1, 2.9]) parts.push(part(box(0.22, 3.0, 4.5), TIMBER, { pos: [x, 1.5, 0] }));
  parts.push(part(box(6.1, 0.22, 4.5), TIMBER, { pos: [0, 2.9, 0] }));
  parts.push(part(rbox(1.0, 1.8, 0.2, 0.06), TIMBER, { pos: [0, 0.95, 2.22] }));
  parts.push(part(rbox(0.8, 0.7, 0.2, 0.06), 0x3a2b20, { pos: [-1.9, 1.8, 2.22] }));
  parts.push(part(rbox(0.8, 0.7, 0.2, 0.06), 0x3a2b20, { pos: [1.9, 1.8, 2.22] }));
  const roof = roofGeo(6.0, 2.6, 7.0, snow ? 0xe8ecf0 : THATCH, 0.12);
  roof.rotateY(Math.PI / 2); roof.translate(0, 2.95, 0);
  parts.push(roof);
  parts.push(part(rbox(0.7, 2.0, 0.7, 0.1), 0x8a8072, { pos: [2.0, 5.0, 0.8] }));
  return mesh(merge(parts));
}
function house(seed, night, snow) {
  // a tall half-timbered town house with a steep tiled roof
  const r = (k) => ((Math.sin(seed * 12.9 + k * 78.2) * 43758.5) % 1 + 1) % 1;
  const w = 6 + r(1) * 2, d = 6 + r(2) * 2, h = 5.4 + r(3) * 1.6;
  const wall = [PLASTER, 0xe2d2b0, 0xd8c8a8, 0xece0c8][Math.floor(r(4) * 4)];
  const roofC = snow ? 0xe8ecf0 : [ROOF, 0x6a4a3a, 0x7a3a2c][Math.floor(r(5) * 3)];
  const P = [
    part(rbox(w, h * 0.45, d, 0.1), STONE2, { pos: [0, h * 0.225, 0], grad: 0.2 }),
    part(rbox(w + 0.5, h * 0.55, d + 0.5, 0.1), wall, { pos: [0, h * 0.45 + h * 0.275, 0], grad: 0.15 }),
  ];
  for (const x of [-w / 2 - 0.2, w / 2 + 0.2]) P.push(part(box(0.24, h * 0.55, d + 0.55), TIMBER, { pos: [x, h * 0.725, 0] }));
  P.push(part(box(w + 0.6, 0.24, d + 0.6), TIMBER, { pos: [0, h * 0.46, 0] }));
  for (const z of [-d / 2 - 0.27, d / 2 + 0.27]) for (let k = -1; k <= 1; k++) P.push(part(box(0.18, h * 0.5, 0.06), TIMBER, { pos: [k * w * 0.3, h * 0.72, z], rot: [0, 0, k * 0.35] }));
  const winC = night ? 0xffc870 : 0x2e241c;
  for (const z of [d / 2 + 0.3, -d / 2 - 0.3]) for (const x of [-w * 0.25, w * 0.25]) P.push(part(rbox(0.8, 1.0, 0.12, 0.04), winC, { pos: [x, h * 0.72, z] }));
  P.push(part(rbox(1.1, 2.0, 0.16, 0.05), TIMBER, { pos: [0, 1.0, d / 2 + 0.05] }));
  const roof = roofGeo(w + 1.4, h * 0.75, d + 1.2, roofC, 0.05);
  roof.translate(0, h, 0);
  P.push(roof);
  P.push(part(rbox(0.8, 2.2, 0.8, 0.1), STONED, { pos: [w * 0.28, h + h * 0.55, -d * 0.2] }));
  const m = mesh(merge(P));
  if (night) m.userData.glow = true;
  return m;
}
function bridge(len, w) {
  // a stone deck on three arches, low parapets either side; the sim's causeway is under it
  const P = [];
  P.push(part(rbox(w, 0.7, len, 0.12), STONE2, { pos: [0, 0.72, 0] }));
  for (const x of [-w / 2 + 0.3, w / 2 - 0.3]) {
    P.push(part(rbox(0.55, 0.9, len, 0.1), STONE, { pos: [x, 1.4, 0] }));
    for (let z = -len / 2 + 2; z < len / 2; z += 4) P.push(part(rbox(0.7, 1.15, 0.7, 0.08), STONED, { pos: [x, 1.55, z] }));
  }
  const spans = 3, sl = len / spans;
  for (let k = 0; k < spans; k++) {
    const zc = -len / 2 + sl * (k + 0.5);
    const arch = new THREE.TorusGeometry(sl * 0.36, 0.55, 8, 18, Math.PI);
    arch.rotateY(Math.PI / 2);
    for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) P.push(part(arch.clone(), STONED, { pos: [x, 0.35 - sl * 0.36 + 0.9, zc], scale: [1, 1, 1] }));
    if (k > 0) P.push(part(rbox(w - 0.2, 4.2, 1.6, 0.2), STONED, { pos: [0, -1.4, zc - sl / 2] }));
    // spandrel walls between the arches and the deck
    for (const x of [-w / 2 + 0.25, w / 2 - 0.25]) P.push(part(box(0.5, 1.6, sl * 0.95), STONE, { pos: [x, -0.1, zc] }));
  }
  for (const z of [-len / 2, len / 2]) P.push(part(rbox(w + 1.4, 1.2, 2.2, 0.15), STONE, { pos: [0, 0.6, z] }));
  return mesh(merge(P));
}
function abbey(snow) {
  const P = [];
  const roofC = snow ? 0xe8ecf0 : 0x6a4a3a;
  // nave
  P.push(part(rbox(9, 7, 22, 0.2), STONE, { pos: [0, 3.5, 0], grad: 0.2 }));
  const nave = roofGeo(10.4, 5.2, 23, roofC, 0.02); nave.translate(0, 7, 0); P.push(nave);
  // round apse at the east end
  P.push(part(cyl(4.5, 4.5, 6.5, 18), STONE2, { pos: [0, 3.25, 11] }));
  P.push(part(cone(5.0, 3.6, 18), roofC, { pos: [0, 8.3, 11], grad: 0.25 }));
  // bell tower at the west end
  P.push(part(rbox(6, 15, 6, 0.15), STONE, { pos: [0, 7.5, -12], grad: 0.15 }));
  P.push(part(rbox(6.6, 0.6, 6.6, 0.1), STONED, { pos: [0, 15, -12] }));
  const spire = new THREE.ConeGeometry(4.4, 7.5, 4); spire.rotateY(Math.PI / 4);
  P.push(part(spire, 0x4a5868, { pos: [0, 19, -12], grad: 0.3 }));
  for (const x of [-3.05, 3.05]) P.push(part(rbox(0.12, 2.2, 1.2, 0.05), 0x2a221c, { pos: [x, 12.4, -12] }));
  // tall windows and buttresses
  for (let z = -8; z <= 8; z += 4) for (const x of [-4.55, 4.55]) {
    P.push(part(rbox(0.14, 3.0, 1.0, 0.05), 0x3a3240, { pos: [x, 4.2, z] }));
    P.push(part(rbox(1.0, 5.6, 0.9, 0.1), STONED, { pos: [x * 1.12, 2.8, z + 2] }));
  }
  P.push(part(rbox(2.2, 3.6, 0.3, 0.1), 0x5a3f2a, { pos: [0, 1.8, -15.05] }));
  return mesh(merge(P));
}
// courses of individually tinted stone blocks on a face (x across, y up), facing +z at z
function stoneFace(P, w, h, x0, y0, z, seed, tints) {
  let r = seed >>> 0;
  const rnd = () => { r = (r + 0x6d2b79f5) >>> 0; let t = r; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let y = y0;
  for (let row = 0; y < y0 + h - 0.15; row++) {
    const bh = Math.min(y0 + h - y, 0.75 + rnd() * 0.2);
    let x = x0 + (row % 2 ? -0.6 : 0);
    while (x < x0 + w) {
      const bw = 1.1 + rnd() * 0.7;
      const xa = Math.max(x0, x), ww = Math.min(x0 + w, x + bw) - xa;
      if (ww > 0.2) P.push(part(box(ww - 0.08, bh - 0.08, 0.14 + rnd() * 0.06), tints[Math.floor(rnd() * tints.length)], { pos: [xa + ww / 2, y + bh / 2, z] }));
      x += bw;
    }
    y += bh;
  }
}
// a square stone keep with round corner towers, slate cones, string courses, crenels, a door
// under an arch and lit or dark windows (DESIGN.md 17: castles read at RTS zoom)
function keep(small, night) {
  const P = [];
  const W = 18, H = 18;
  const tints = [0xb9b1a3, 0xaea698, 0xc3bcae, 0xa49c8f, 0xb4ab9b, 0x9f978a];
  // plinth and core
  P.push(part(rbox(W + 2.4, 1.6, W + 2.4, 0.2), 0x8f877a, { pos: [0, 0.6, 0] }));
  P.push(part(box(W - 0.3, H, W - 0.3), 0x9c9486, { pos: [0, H / 2, 0] }));
  // block courses on all four faces
  for (let f = 0; f < 4; f++) {
    const g = [];
    stoneFace(g, W, H - 1.2, -W / 2, 1.2, W / 2 + 0.02, 11 + f * 7, tints);
    for (const q of g) { q.rotateY(f * Math.PI / 2); P.push(q); }
  }
  // string courses and a corbelled parapet
  for (const y of [7, 13]) P.push(part(rbox(W + 0.5, 0.35, W + 0.5, 0.08), 0x8f877a, { pos: [0, y, 0] }));
  P.push(part(rbox(W + 1.4, 0.9, W + 1.4, 0.12), 0x9f978a, { pos: [0, H + 0.2, 0] }));
  for (let k = -W / 2; k <= W / 2; k += 1.2) for (const [x, z] of [[k, W / 2 + 0.55], [k, -W / 2 - 0.55], [W / 2 + 0.55, k], [-W / 2 - 0.55, k]]) P.push(part(box(0.5, 0.5, 0.5), 0x8a8276, { pos: [x, H - 0.45, z] }));
  P.push(...crenels(W + 1.4, W + 1.4, H + 1.1, STONE, 1.3));
  // corner towers: courses of slightly different stone, slate cones, gold finials
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const cx = x * W / 2, cz = z * W / 2;
    for (let y = 0; y < H + 5; y += 1.6) P.push(part(cyl(2.55, 2.6, 1.62, 16), tints[(Math.abs(cx + cz + y * 3) | 0) % tints.length], { pos: [cx, y + 0.8, cz] }));
    P.push(part(cyl(2.9, 2.75, 0.6, 16), 0x8f877a, { pos: [cx, H + 5.2, cz] }));
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; P.push(part(box(0.7, 0.8, 0.5), STONE, { pos: [cx + Math.cos(a) * 2.7, H + 5.9, cz + Math.sin(a) * 2.7], rot: [0, -a, 0] })); }
    P.push(part(cone(3.0, 5.6, 16), 0x4e5a6a, { pos: [cx, H + 8.6, cz], grad: 0.35 }));
    P.push(part(sphere(0.25, 8, 6), 0xd8b048, { pos: [cx, H + 11.5, cz] }));
    for (const y of [6, 12]) P.push(part(rbox(0.35, 1.2, 0.3, 0.06), night ? 0xffc870 : 0x241c18, { pos: [cx + x * 1.5, y, cz + z * 2.2] }));
  }
  // windows with sills, a door under an arch
  const winC = night ? 0xffc870 : 0x241c18;
  for (let y = 5; y < H - 2; y += 4.5) for (const s of [-1, 1]) for (let f = 0; f < 4; f++) {
    const g = [part(rbox(0.95, 1.7, 0.25, 0.08), winC, { pos: [s * 4, y, W / 2 + 0.12] }), part(box(1.3, 0.2, 0.45), 0xc3bcae, { pos: [s * 4, y - 0.95, W / 2 + 0.2] })];
    for (const q of g) { q.rotateY(f * Math.PI / 2); P.push(q); }
  }
  P.push(part(rbox(3.4, 4.6, 0.5, 0.15), 0x5a3a24, { pos: [0, 2.3, -W / 2 - 0.15] }));
  P.push(part(new THREE.TorusGeometry(1.9, 0.4, 6, 12, Math.PI), 0xc3bcae, { pos: [0, 4.4, -W / 2 - 0.25] }));
  for (const sx of [-1.2, 1.2]) P.push(part(cyl(0.06, 0.06, 4.2, 6), 0x3a3a3a, { pos: [sx * 0.6, 2.3, -W / 2 - 0.45] }));
  P.push(part(cyl(0.12, 0.14, 7, 8), 0x5a4330, { pos: [0, H + 4.2, 0] }));
  const m = mesh(merge(P));
  if (small) m.scale.setScalar(0.72);
  return m;
}
function wagon(team) {
  const P = [];
  P.push(part(rbox(2.2, 0.35, 4.2, 0.08), 0x7a5838, { pos: [0, 1.05, 0] }));
  for (const x of [-1.05, 1.05]) P.push(part(rbox(0.12, 0.7, 4.2, 0.04), 0x6a4b30, { pos: [x, 1.5, 0] }));
  for (const [x, z] of [[-1.25, -1.3], [1.25, -1.3], [-1.25, 1.3], [1.25, 1.3]]) {
    const wh = new THREE.TorusGeometry(0.58, 0.09, 6, 16); wh.rotateY(Math.PI / 2);
    P.push(part(wh, 0x4a3424, { pos: [x, 0.62, z] }));
    P.push(part(cyl(0.12, 0.12, 0.18, 8), 0x6a6a6a, { pos: [x, 0.62, z], rot: [0, 0, Math.PI / 2] }));
    for (let k = 0; k < 4; k++) P.push(part(box(0.06, 1.1, 0.06), 0x5a4330, { pos: [x, 0.62, z], rot: [k * Math.PI / 4, 0, 0] }));
  }
  const cover = new THREE.CylinderGeometry(1.15, 1.15, 3.6, 16, 1, true, -Math.PI / 2, Math.PI);
  cover.rotateX(Math.PI / 2); cover.rotateY(Math.PI / 2); cover.rotateZ(Math.PI / 2);
  P.push(part(new THREE.CylinderGeometry(1.15, 1.15, 3.6, 16, 1, true, 0, Math.PI).rotateX(Math.PI / 2).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0xe6dcc4, { pos: [0, 1.55, 0] }));
  for (const z of [-1.4, 0, 1.4]) P.push(part(new THREE.TorusGeometry(1.16, 0.04, 4, 12, Math.PI), 0x5a4330, { pos: [0, 1.55, z] }));
  P.push(part(rbox(0.9, 0.7, 0.9, 0.05), 0x8a6a44, { pos: [0.4, 1.6, 1.9] }));
  P.push(part(cyl(0.05, 0.05, 2.6, 5), 0x5a4330, { pos: [0, 1.0, -3.2], rot: [Math.PI / 2 - 0.15, 0, 0] }));
  return mesh(merge(P));
}
function cartGeo() {
  const P = [part(rbox(1.6, 0.25, 2.6, 0.06), 0x7a5838, { pos: [0, 0.9, 0] })];
  for (const x of [-0.95, 0.95]) { const wh = new THREE.TorusGeometry(0.6, 0.08, 6, 14); wh.rotateY(Math.PI / 2); P.push(part(wh, 0x4a3424, { pos: [x, 0.62, 0.2] })); }
  P.push(part(rbox(0.7, 0.6, 0.7, 0.05), 0x8a6a44, { pos: [0.2, 1.3, -0.4] }));
  P.push(part(cyl(0.6, 0.6, 1.0, 12), 0xd2c088, { pos: [-0.2, 1.4, 0.6], rot: [0, 0, Math.PI / 2] }));
  for (const x of [-0.5, 0.5]) P.push(part(cyl(0.04, 0.04, 2.2, 5), 0x5a4330, { pos: [x, 0.8, -2.2], rot: [Math.PI / 2 - 0.2, 0, 0] }));
  return mesh(merge(P));
}
function well() {
  const P = [part(cyl(1.2, 1.3, 1.0, 16), STONE2, { pos: [0, 0.5, 0] }), part(cyl(0.95, 0.95, 1.02, 16), 0x2a3a40, { pos: [0, 0.52, 0] })];
  for (const x of [-1.0, 1.0]) P.push(part(cyl(0.08, 0.08, 2.4, 6), TIMBER, { pos: [x, 1.7, 0] }));
  const roof = roofGeo(2.8, 1.0, 2.2, ROOF, 0.05); roof.rotateY(Math.PI / 2); roof.translate(0, 2.8, 0); P.push(roof);
  P.push(part(cyl(0.06, 0.06, 2.0, 6), TIMBER, { pos: [0, 2.3, 0], rot: [0, 0, Math.PI / 2] }));
  return mesh(merge(P));
}
function ruin(big) {
  const P = [];
  if (big) {
    // a broken round tower, ivy on top
    const g = new THREE.CylinderGeometry(4, 4.4, 9, 18, 4, true);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const a = Math.atan2(p.getZ(i), p.getX(i)); if (p.getY(i) > 0) p.setY(i, p.getY(i) - (Math.sin(a * 3) * 0.5 + 0.5) * 5); }
    g.computeVertexNormals();
    P.push(part(g, STONE2, { pos: [0, 4.5, 0], grad: 0.3 }));
    P.push(part(cyl(4.4, 4.6, 1.2, 18), STONED, { pos: [0, 0.6, 0] }));
    for (let k = 0; k < 7; k++) P.push(part(rbox(1 + (k % 3) * 0.4, 0.7, 0.8, 0.1), STONE, { pos: [Math.cos(k) * 6, 0.3, Math.sin(k) * 6], rot: [0, k, 0.2] }));
  } else {
    P.push(part(rbox(7, 3.2, 1.0, 0.1), STONE2, { pos: [0, 1.6, 0], grad: 0.3 }));
    P.push(part(rbox(1.0, 2.2, 5, 0.1), STONE2, { pos: [3.2, 1.1, 2.4], grad: 0.3 }));
    P.push(part(rbox(2.2, 1.0, 1.0, 0.1), STONE, { pos: [-2.6, 3.6, 0] }));
    for (let k = 0; k < 6; k++) P.push(part(rbox(0.8, 0.5, 0.7, 0.1), STONE, { pos: [Math.cos(k * 2) * 3, 0.25, 2 + Math.sin(k * 2) * 2], rot: [0, k, 0.1] }));
  }
  return mesh(merge(P));
}
function hay() {
  return mesh(merge([
    part(cyl(0.95, 0.95, 1.5, 18), 0xd2c088, { rot: [0, 0, Math.PI / 2], pos: [0, 0.95, 0] }),
    part(cyl(0.7, 0.7, 1.52, 18), 0xbba66e, { rot: [0, 0, Math.PI / 2], pos: [0, 0.95, 0] }),
  ]));
}
const TENT_COL = { 0: [0x2f5fa8, 0xe2b33c], 1: [0xa82f2f, 0x2a2326], 2: [0x3f6b3a, 0xb08a3e], 3: [0x2f7d86, 0xc9ccd0], 4: [0xc4652a, 0x1e1a18] };
export function setTentColours(list) { for (const f of list) TENT_COL[f.slot] = [f.main, f.trim]; }
function tent(team, big) {
  const c = (TENT_COL[team] || TENT_COL[1])[0];
  const g = merge([
    part(cone(2.6, 3.2, 8), c, { pos: [0, 1.6, 0], grad: 0.35 }),
    part(cone(2.7, 0.5, 8), 0x2a2326, { pos: [0, 0.25, 0] }),
    part(cyl(0.05, 0.05, 1.4, 6), 0x5a4330, { pos: [0, 3.6, 0] }),
    part(box(0.02, 0.5, 0.8), (TENT_COL[team] || TENT_COL[1])[1], { pos: [0, 4.0, 0.42] }),
  ]);
  const m = mesh(g);
  if (big) m.scale.set(1.5, 1.4, 1.5);
  return m;
}
function campfire() {
  const P = [];
  for (let k = 0; k < 9; k++) { const a = k / 9 * Math.PI * 2; P.push(part(rbox(0.32, 0.22, 0.26, 0.08), 0x7a766e, { pos: [Math.cos(a) * 0.7, 0.1, Math.sin(a) * 0.7], rot: [0, a, 0] })); }
  for (let k = 0; k < 4; k++) P.push(part(cyl(0.07, 0.08, 1.0, 6), 0x4a3424, { pos: [0, 0.22, 0], rot: [Math.PI / 2 - 0.5, k * Math.PI / 2, 0] }));
  return mesh(merge(P));
}
function torch() {
  return mesh(merge([
    part(cyl(0.07, 0.09, 2.6, 6), TIMBER, { pos: [0, 1.3, 0] }),
    part(cyl(0.13, 0.09, 0.35, 8), 0x3a3a3a, { pos: [0, 2.7, 0] }),
  ]));
}
function fence(a, b, hf) {
  const parts = [];
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const n = Math.max(2, Math.round(L / 2.5));
  const ang = Math.atan2(b[0] - a[0], b[1] - a[1]);
  for (let i = 0; i <= n; i++) {
    const x = a[0] + (b[0] - a[0]) * (i / n), z = a[1] + (b[1] - a[1]) * (i / n);
    const y = hf.height(x, z);
    parts.push(part(cyl(0.07, 0.09, 1.3, 6), 0x6b5038, { pos: [x, y + 0.55, z], rot: [0.05 * Math.sin(i * 3), 0, 0.06 * Math.cos(i * 5)] }));
    if (i < n) {
      const x2 = a[0] + (b[0] - a[0]) * ((i + 1) / n), z2 = a[1] + (b[1] - a[1]) * ((i + 1) / n), y2 = hf.height(x2, z2);
      const seg = Math.hypot(x2 - x, z2 - z);
      for (const hh of [0.5, 0.95]) {
        const g = cyl(0.045, 0.045, seg, 5);
        g.rotateX(Math.PI / 2);
        parts.push(part(g, 0x7b5d40, { pos: [(x + x2) / 2, (y + y2) / 2 + hh, (z + z2) / 2], rot: [0, ang, 0] }));
      }
    }
  }
  return mesh(merge(parts));
}
// the big flag at an objective; its cloth recolours when the field battle's hill changes hands
function standard(team) {
  const g = new THREE.Group();
  g.add(mesh(merge([part(cyl(0.12, 0.16, 11, 8), 0x5a4330, { pos: [0, 5.5, 0] }), part(sphere(0.3, 10, 8), 0xd8b048, { pos: [0, 11.1, 0] }), part(cyl(0.06, 0.06, 3.6, 5), 0x5a4330, { pos: [1.8, 10.6, 0], rot: [0, 0, Math.PI / 2] }), part(cyl(1.2, 1.5, 0.6, 12), STONED, { pos: [0, 0.3, 0] })])));
  const cg = new THREE.PlaneGeometry(3.4, 2.4, 12, 6); cg.translate(1.7, 0, 0);
  const cm = new THREE.MeshStandardMaterial({ color: team === 0 ? 0x2f5fa8 : team === 1 ? 0xa82f2f : 0xd8ceb4, side: THREE.DoubleSide, roughness: 0.85 });
  const cloth = new THREE.Mesh(cg, cm); cloth.position.set(0.1, 9.3, 0); cloth.castShadow = true;
  g.add(cloth);
  g.userData.cloth = cloth;
  return g;
}

// one prop as a scene object (for the war map's merged prop batches). Returns null for unknown types.
export function makeProp(p, env, hf) {
  const snow = !!env.snowCaps, night = !!env.night;
  let m = null;
  switch (p.type) {
    case 'windmill': m = windmill(); break;
    case 'cottage': m = cottage(snow); if (p.big) m.scale.setScalar(1.35); break;
    case 'house': m = house((p.seed || Math.abs(Math.round(p.pos[0] * 7 + p.pos[1] * 13))) % 97 + 1, night, snow); if (p.big) m.scale.setScalar(1.2); break;
    case 'hay': m = hay(); break;
    case 'tent': m = tent(p.team, p.big); break;
    case 'abbey': m = abbey(snow); break;
    case 'abbeySmall': m = abbey(snow); m.scale.setScalar(0.62); break;
    case 'keep': m = keep(p.small, night); break;
    case 'well': m = well(); break;
    case 'ruin': m = ruin(p.big); break;
    case 'campfire': m = campfire(); break;
    case 'cart': m = cartGeo(); break;
    case 'wagon': m = wagon(1); break;
    case 'bridge': m = bridge(p.len || 36, p.w || 7); m.position.set(p.pos[0], 0, p.pos[1]); m.rotation.y = (p.rot || 0) + Math.PI / 2; m.userData.placed = true; return m;
    case 'fence': m = fence(p.a, p.b, hf); m.userData.placed = true; return m;
    default: return null;
  }
  m.position.set(p.pos[0], hf.height(p.pos[0], p.pos[1]) - 0.1, p.pos[1]);
  m.rotation.y = p.rot || 0;
  return m;
}
export const TREE_GEO = { oakCanopy, oakTrunk, pineCanopy, pineTrunk, rockGeo, windify, vmat };

export function buildProps(scene, world, opts = {}) {
  const hf = world.terrain;
  const env = opts.env;
  const uniforms = { uTime: { value: 0 } };
  const allTrees = world.trees.concat(world.scenery || []);
  const oaks = allTrees.filter((t) => t.kind === 'oak'), pines = allTrees.filter((t) => t.kind === 'pine');
  const canMat = vmat({ roughness: 0.9 }); windify(canMat, uniforms, 0.05);
  const trunkMat = vmat({ roughness: 0.95 });
  const pineMat = vmat({ roughness: 0.9 }); windify(pineMat, uniforms, 0.035);
  const ground = (t) => (opts.skirtHeight && !hf.inside(t.x, t.z) ? opts.skirtHeight(t.x, t.z) : hf.height(t.x, t.z)) - 0.15;
  instanced(scene, oakCanopy(1, env), canMat, oaks, (t) => ({ x: t.x, y: ground(t), z: t.z, s: t.s, rot: t.rot }));
  instanced(scene, oakTrunk(), trunkMat, oaks, (t) => ({ x: t.x, y: ground(t), z: t.z, s: t.s, rot: t.rot }));
  instanced(scene, pineCanopy(env), pineMat, pines, (t) => ({ x: t.x, y: ground(t), z: t.z, s: t.s, sy: t.s * 1.15, rot: t.rot }));
  instanced(scene, pineTrunk(), trunkMat, pines, (t) => ({ x: t.x, y: ground(t), z: t.z, s: t.s, rot: t.rot }));
  const rockMat = vmat({ roughness: 0.92 });
  const variants = [rockGeo(1, env), rockGeo(2, env), rockGeo(3, env)];
  for (let v = 0; v < 3; v++) {
    const list = world.boulders.filter((b, i) => i % 3 === v);
    instanced(scene, variants[v], rockMat, list, (b) => ({ x: b.x, y: hf.height(b.x, b.z) - b.s * 0.2, z: b.z, s: b.s, rot: b.rot, tilt: [(b.seed - 0.5) * 0.4, (b.seed * 7 % 1 - 0.5) * 0.4] }), { cast: true });
  }
  if (world.hedges && world.hedges.length) instanced(scene, hedgeGeo(env), canMat, world.hedges, (h) => ({ x: h.x, y: hf.height(h.x, h.z) - 0.1, z: h.z, s: h.s, sy: h.s * (0.85 + h.seed * 0.3), rot: h.rot }));
  const anim = [], fires = [], standards = [], glows = [];
  const snow = !!env.snowCaps, night = !!env.night;
  let hseed = 1;
  for (const p of world.props) {
    let m = null;
    if (p.type === 'windmill') { m = windmill(); anim.push(m.userData.sails); }
    else if (p.type === 'cottage') { m = cottage(snow); if (p.big) m.scale.setScalar(1.35); }
    else if (p.type === 'house') m = house(hseed++, night, snow);
    else if (p.type === 'hay') m = hay();
    else if (p.type === 'tent') m = tent(p.team, p.big);
    else if (p.type === 'bridge') { m = bridge(p.len || 36, p.w || 7); m.position.set(p.pos[0], 0, p.pos[1]); scene.add(m); continue; }
    else if (p.type === 'abbey') m = abbey(snow);
    else if (p.type === 'keep') m = keep(p.small, night);
    else if (p.type === 'wagon') m = wagon(1);
    else if (p.type === 'cart') m = cartGeo();
    else if (p.type === 'well') m = well();
    else if (p.type === 'ruin') m = ruin(p.big);
    else if (p.type === 'campfire') { m = campfire(); fires.push({ x: p.pos[0], z: p.pos[1], y: hf.height(p.pos[0], p.pos[1]) + 0.35, s: 1 }); }
    else if (p.type === 'torch') { m = torch(); fires.push({ x: p.pos[0], z: p.pos[1], y: hf.height(p.pos[0], p.pos[1]) + 2.95, s: 0.45, torch: true }); }
    else if (p.type === 'standard') { m = standard(p.team); standards.push({ g: m, team: p.team }); }
    else if (p.type === 'fence') { scene.add(fence(p.a, p.b, hf)); continue; }
    if (!m) continue;
    m.position.set(p.pos[0], hf.height(p.pos[0], p.pos[1]) - 0.1, p.pos[1]);
    m.rotation.y = p.rot || 0;
    if (m.userData.glow) glows.push(m);
    scene.add(m);
  }
  return {
    fires, standards,
    setOwner(owner) {
      for (const s of standards) if (s.team === -1) s.g.userData.cloth.material.color.set(owner === 0 ? 0x2f5fa8 : owner === 1 ? 0xa82f2f : 0xd8ceb4);
    },
    update(dt, t) {
      uniforms.uTime.value = t;
      for (const s of anim) s.rotation.z -= dt * 0.35;
      for (const s of standards) { const c = s.g.userData.cloth; c.rotation.y = Math.sin(t * 1.3 + s.g.position.x) * 0.25; c.position.y = 9.3 + Math.sin(t * 2.1) * 0.05; }
    },
  };
}
