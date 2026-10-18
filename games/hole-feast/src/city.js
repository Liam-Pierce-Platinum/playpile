// City generator: every prop is ONE merged, vertex-coloured mesh (one draw call), toy-painted with baked AO.
import * as THREE from '../vendor/three.module.js';

export const HALF = 69; // playable bounds (block edges)
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(1, 1, 1), _p = new THREE.Vector3();
const G = {
  box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 12), sph: new THREE.SphereGeometry(1, 12, 9),
  cone: new THREE.ConeGeometry(1, 1, 12), pyr: new THREE.ConeGeometry(1, 1, 4), oct: new THREE.CylinderGeometry(1, 1, 1, 8),
};
for (const k in G) G[k] = G[k].index ? G[k].toNonIndexed() : G[k];

// part helpers: [geo, color, x,y,z, sx,sy,sz, ry, rx, rz]
const P = (g, c, x, y, z, sx, sy, sz, ry = 0, rx = 0, rz = 0) => ({ g, c, x, y, z, sx, sy, sz, ry, rx, rz });
const box = (c, w, h, d, x, y, z, ry) => P(G.box, c, x, y + h / 2, z, w, h, d, ry);
const cyl = (c, r, h, x, y, z, g = G.cyl) => P(g, c, x, y + h / 2, z, r, h, r);

function merge(parts) {
  let n = 0; for (const p of parts) n += p.g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0, top = 0.01; const c = new THREE.Color(), v = new THREE.Vector3(), nm = new THREE.Matrix3();
  for (const p of parts) top = Math.max(top, p.y + p.sy / 2);
  for (const p of parts) {
    _e.set(p.rx, p.ry, p.rz); _q.setFromEuler(_e); _p.set(p.x, p.y, p.z); _s.set(p.sx, p.sy, p.sz);
    _m.compose(_p, _q, _s); nm.getNormalMatrix(_m); c.set(p.c);
    const pa = p.g.attributes.position, na = p.g.attributes.normal;
    for (let i = 0; i < pa.count; i++, o++) {
      v.fromBufferAttribute(pa, i).applyMatrix4(_m); pos.set([v.x, v.y, v.z], o * 3);
      const ao = 0.62 + 0.38 * Math.min(1, Math.max(0, v.y / Math.min(top, 3))); // baked contact darkening
      v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], o * 3);
      col.set([c.r * ao, c.g * ao, c.b * ao], o * 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.computeBoundingSphere(); return g;
}

const cache = new Map();
const geo = (key, fn) => { if (!cache.has(key)) cache.set(key, merge(fn())); return cache.get(key); };
export function clearCache() { for (const g of cache.values()) g.dispose(); cache.clear(); }

const pick = (r, a) => a[Math.floor(r() * a.length) % a.length];
const SKIN = [0xf1c7a3, 0xd9a07a, 0xa8714f, 0x6f4a33, 0xf5d6c0];

// kind -> builder(r, pal) => {key, parts, size, h, pts}
const KINDS = {
  person(r, pal) { const sh = pick(r, pal.cloth), pa = pick(r, [0x2d3a5a, 0x3b3b3b, 0x5a4636, 0x23495e]), sk = pick(r, SKIN);
    return { key: `p${sh}${pa}${sk}`, size: 0.25, h: 0.95, pts: 1, parts: () => [box(pa, 0.24, 0.38, 0.14, 0, 0, 0), box(sh, 0.32, 0.34, 0.2, 0, 0.38, 0), P(G.sph, sk, 0, 0.83, 0, 0.13, 0.14, 0.13), P(G.sph, pick(r, [0x2a1d14, 0x5b3a1e, 0xe0c27a, 0x111111]), 0, 0.9, -0.02, 0.135, 0.09, 0.135)] }; },
  cone() { return { key: 'cone', size: 0.2, h: 0.5, pts: 1, parts: () => [box(0xff6a1f, 0.34, 0.05, 0.34, 0, 0, 0), cyl(0xff6a1f, 0.16, 0.45, 0, 0.05, 0, G.cone), cyl(0xffffff, 0.1, 0.07, 0, 0.22, 0)] }; },
  hydrant() { return { key: 'hyd', size: 0.2, h: 0.6, pts: 1, parts: () => [cyl(0xe2302a, 0.12, 0.45, 0, 0, 0), P(G.sph, 0xe2302a, 0, 0.47, 0, 0.12, 0.1, 0.12), box(0xc9c9c9, 0.34, 0.07, 0.07, 0, 0.3, 0)] }; },
  bin(r) { const c = pick(r, [0x2f8f5b, 0x3a5fb0, 0x4a4a4a]); return { key: 'bin' + c, size: 0.3, h: 0.6, pts: 1, parts: () => [cyl(c, 0.22, 0.55, 0, 0, 0, G.oct), cyl(0x222222, 0.23, 0.05, 0, 0.55, 0, G.oct)] }; },
  bench() { return { key: 'bench', size: 0.55, h: 0.8, pts: 2, parts: () => [box(0xa0602f, 1.1, 0.07, 0.38, 0, 0.38, 0), box(0xa0602f, 1.1, 0.3, 0.06, 0, 0.5, -0.17), box(0x333333, 0.06, 0.38, 0.34, -0.45, 0, 0), box(0x333333, 0.06, 0.38, 0.34, 0.45, 0, 0)] }; },
  lamp() { return { key: 'lamp', size: 0.3, h: 3.2, pts: 2, parts: () => [cyl(0x2f3b45, 0.12, 0.25, 0, 0, 0), cyl(0x2f3b45, 0.05, 3, 0, 0, 0), box(0x2f3b45, 0.6, 0.08, 0.12, 0.25, 2.95, 0), box(0xfff1b8, 0.3, 0.1, 0.18, 0.5, 2.85, 0)] }; },
  bush(r, pal) { const c = pick(r, pal.leaf); return { key: 'bush' + c, size: 0.5, h: 0.8, pts: 2, parts: () => [P(G.sph, c, 0, 0.4, 0, 0.55, 0.42, 0.5), P(G.sph, c, 0.25, 0.55, 0.1, 0.32, 0.3, 0.32)] }; },
  tree(r, pal) { const c = pick(r, pal.leaf), pine = r() < 0.35;
    return { key: 'tree' + c + pine, size: 0.7, h: 3.2, pts: 3, parts: () => pine
      ? [cyl(0x6b4a2e, 0.14, 0.8, 0, 0, 0), cyl(c, 0.85, 1.4, 0, 0.6, 0, G.cone), cyl(c, 0.65, 1.2, 0, 1.4, 0, G.cone), cyl(c, 0.42, 1, 0, 2.1, 0, G.cone)]
      : [cyl(0x6b4a2e, 0.15, 1.3, 0, 0, 0), P(G.sph, c, 0, 1.9, 0, 0.85, 0.8, 0.85), P(G.sph, c, 0.35, 2.3, 0.15, 0.5, 0.5, 0.5), P(G.sph, c, -0.3, 2.2, -0.2, 0.45, 0.45, 0.45)] }; },
  car(r, pal) { const c = pick(r, pal.car); return { key: 'car' + c, size: 1.0, h: 1.0, pts: 5, parts: () => [
    box(c, 1.9, 0.5, 0.95, 0, 0.2, 0), box(c, 1.05, 0.42, 0.85, -0.1, 0.7, 0), box(0x9fc4d8, 1.08, 0.3, 0.87, -0.1, 0.74, 0),
    ...[[-0.6, 0.45], [0.6, 0.45], [-0.6, -0.45], [0.6, -0.45]].map(([x, z]) => P(G.cyl, 0x1c1c1c, x, 0.22, z, 0.22, 0.16, 0.22, 0, Math.PI / 2)),
    box(0xfff6c8, 0.04, 0.12, 0.2, 0.95, 0.4, 0.28), box(0xfff6c8, 0.04, 0.12, 0.2, 0.95, 0.4, -0.28)] }; },
  van(r, pal) { const c = pick(r, pal.van); return { key: 'van' + c, size: 1.4, h: 1.5, pts: 9, parts: () => [
    box(c, 2.7, 1.2, 1.15, 0, 0.25, 0), box(0x9fc4d8, 0.5, 0.45, 1.17, 1.05, 0.85, 0), box(0xffffff, 1.9, 0.18, 1.17, -0.3, 0.95, 0),
    ...[[-0.85, 0.52], [0.85, 0.52], [-0.85, -0.52], [0.85, -0.52]].map(([x, z]) => P(G.cyl, 0x1c1c1c, x, 0.25, z, 0.25, 0.16, 0.25, 0, Math.PI / 2))] }; },
  bus(r, pal) { const c = pick(r, pal.bus); return { key: 'bus' + c, size: 2.3, h: 2, pts: 15, parts: () => [
    box(c, 4.8, 1.55, 1.35, 0, 0.3, 0), box(0x9fc4d8, 4.5, 0.5, 1.37, 0, 1.15, 0), box(0xf3f0e6, 4.82, 0.12, 1.37, 0, 1.75, 0),
    ...[-1.6, 1.6].flatMap((x) => [0.6, -0.6].map((z) => P(G.cyl, 0x1c1c1c, x, 0.3, z, 0.3, 0.18, 0.3, 0, Math.PI / 2)))] }; },
  kiosk(r, pal) { const c = pick(r, pal.awn); return { key: 'kio' + c, size: 1.1, h: 2.4, pts: 6, parts: () => [
    box(0xf4ead8, 1.7, 1.5, 1.4, 0, 0, 0), ...[0, 1, 2, 3].map((i) => box(i % 2 ? 0xffffff : c, 0.48, 0.12, 1.9, -0.72 + i * 0.48, 1.55, 0.15)), box(c, 1.8, 0.5, 0.1, 0, 1.6, -0.75), box(0x7a5233, 1.7, 0.15, 0.4, 0, 0.9, 0.85)] }; },
  fountain() { return { key: 'fount', size: 2.0, h: 1.8, pts: 14, parts: () => [cyl(0xd8cfc0, 2, 0.5, 0, 0, 0, G.oct), cyl(0x58b8e0, 1.75, 0.08, 0, 0.45, 0, G.oct), cyl(0xd8cfc0, 0.3, 1.2, 0, 0.5, 0), cyl(0xd8cfc0, 0.7, 0.18, 0, 1.4, 0, G.oct), cyl(0x8fd6f2, 0.15, 0.4, 0, 1.55, 0)] }; },
  house(r, pal) { const w = pick(r, pal.wall), rf = pick(r, pal.roof); const k = 'h' + w + rf;
    return { key: k, size: 2.4, h: 4.2, pts: 20, parts: () => [
      box(w, 3.4, 2.3, 3, 0, 0, 0), P(G.pyr, rf, 0, 3.1, 0, 2.65, 1.6, 2.4, Math.PI / 4), box(0x7a4b2a, 0.65, 1.1, 0.06, 0.6, 0, 1.51),
      box(0x8ec9e6, 0.6, 0.55, 0.06, -0.8, 1.05, 1.51), box(0x8ec9e6, 0.06, 0.55, 0.6, 1.71, 1.05, 0), box(0x8ec9e6, 0.06, 0.55, 0.6, -1.71, 1.05, 0.5),
      box(0xfaf6ee, 0.7, 0.08, 0.12, -0.8, 0.98, 1.56), box(0x8a3b2a, 0.45, 1.1, 0.45, 0.9, 3, -0.6)] }; },
  shop(r, pal) { const w = pick(r, pal.wall), a = pick(r, pal.awn), fl = r() < 0.5 ? 2 : 3;
    return { key: 'sh' + w + a + fl, size: 3.0, h: fl * 1.6 + 0.4, pts: 30, parts: () => {
      const H = fl * 1.6, out = [box(w, 5, H, 4.2, 0, 0, 0), box(0xe9e2d4, 5.2, 0.3, 4.4, 0, H, 0), box(0x9fd0e8, 4.2, 1.1, 0.06, 0, 0.15, 2.11)];
      for (let i = 0; i < 6; i++) out.push(box(i % 2 ? 0xffffff : a, 0.84, 0.1, 0.9, -2.1 + i * 0.84, 1.35, 2.5, 0));
      for (let f = 1; f < fl; f++) for (let i = 0; i < 3; i++) out.push(box(0x6f9fc2, 0.9, 0.75, 0.06, -1.5 + i * 1.5, f * 1.6 + 0.35, 2.11));
      out.push(box(a, 2.2, 0.45, 0.08, 0, H - 0.65, 2.13)); return out; } }; },
  tower(r, pal) { const w = pick(r, pal.tower), fl = 5 + Math.floor(r() * 4), gl = pick(r, [0x5d8fb5, 0x6aa3c9, 0x4f7896]);
    return { key: 'tw' + w + fl + gl, size: 4.2, h: fl * 1.35 + 1, pts: 50, parts: () => {
      const out = [box(w, 6.4, 0.6, 6.4, 0, 0, 0)];
      for (let f = 0; f < fl; f++) { out.push(box(gl, 6.1, 0.85, 6.1, 0, 0.6 + f * 1.35, 0)); out.push(box(w, 6.3, 0.5, 6.3, 0, 1.45 + f * 1.35, 0)); }
      const H = 0.6 + fl * 1.35; out.push(box(0xb9b5ad, 2, 0.8, 1.6, 1, H, 0.8), box(w, 0.25, 1.4, 0.25, -2, H, -2)); return out; } }; },
  sky(r, pal) { const w = pick(r, pal.tower), fl = 11 + Math.floor(r() * 5), gl = pick(r, [0x4a7fae, 0x76b1d6, 0x3f6d93]);
    return { key: 'sk' + w + fl + gl, size: 5.6, h: fl * 1.4 + 4, pts: 90, parts: () => {
      const out = [box(w, 8.4, 1.2, 8.4, 0, 0, 0)];
      for (let f = 0; f < fl; f++) out.push(box(gl, 7.6, 1.0, 7.6, 0, 1.2 + f * 1.4, 0), box(w, 7.9, 0.4, 7.9, 0, 2.2 + f * 1.4, 0));
      const H = 1.2 + fl * 1.4; out.push(box(w, 5, 1.6, 5, 0, H, 0), box(0xd8d4cc, 0.18, 2.5, 0.18, 0, H + 1.6, 0), P(G.sph, 0xff4a3a, 0, H + 4.15, 0, 0.2, 0.2, 0.2)); return out; } }; },
};

export const CITIES = [
  { name: 'Pebble Town', time: 120, bias: 0, bg: 0xbfe3e8, ground: { grass: '#86c96d', road: '#5a6170', walk: '#e6dccb', lot: '#efe2c2', plaza: '#d9cdb8', park: '#7cc35e', line: '#fff7d6' },
    pal: { cloth: [0xe8584a, 0xf2b33d, 0x4aa3df, 0x7ccf6a, 0xb57fe0, 0xffffff], leaf: [0x5fb34a, 0x4c9e3f, 0x83c95a, 0x3f8f45], car: [0xe8584a, 0x4aa3df, 0xf2c94c, 0xf4f1ea, 0x63c08a, 0xff8fb0], van: [0xf4f1ea, 0x8ac7e8], bus: [0xf2b33d],
      awn: [0xe8584a, 0x2f9e8f, 0xf2b33d, 0x5b7fd6], wall: [0xf6e7cf, 0xf2c6b4, 0xcfe4d6, 0xf7efe4, 0xe7d3f0, 0xfff1c9], roof: [0xc8553d, 0x46628c, 0x8a5a3c, 0x5b8f6a], tower: [0xe9dfd0, 0xd8e3ea, 0xf0d9c4] } },
  { name: 'Brickton', time: 120, bias: 1, bg: 0xf3d9c2, ground: { grass: '#9bc66b', road: '#55525a', walk: '#d8c9b4', lot: '#e3cfa8', plaza: '#cdb79c', park: '#8cbf5c', line: '#ffe08a' },
    pal: { cloth: [0xc0392b, 0x2c3e50, 0xe67e22, 0x16a085, 0xf1c40f, 0xecf0f1], leaf: [0x6aa84f, 0x9bb84a, 0xd9a43a, 0x7f9f3f], car: [0xa83232, 0x2c4f7c, 0xe0a030, 0x333333, 0xe8e2d0, 0x4c8c5c], van: [0xe8e2d0, 0xc0392b], bus: [0xd2452f],
      awn: [0x1f7a5a, 0xc0392b, 0xe0a030, 0x2c4f7c], wall: [0xb5553c, 0xc76a4b, 0x9c4a36, 0xe8d6b8, 0xd08a5c], roof: [0x4a3b36, 0x6b4a3a, 0x2e3e4f], tower: [0xc76a4b, 0xb08a68, 0xe3d2b5] } },
  { name: 'Glass Bay', time: 150, bias: 2, bg: 0xcfe0f5, ground: { grass: '#7fc7a0', road: '#4b5466', walk: '#e2e6ea', lot: '#d6dde3', plaza: '#c9d3dc', park: '#6fbf8a', line: '#ffffff' },
    pal: { cloth: [0x2d6cdf, 0xff6f61, 0x111111, 0xffffff, 0x33c4b3, 0xffb347], leaf: [0x3fae7a, 0x56c28d, 0x2e8f69], car: [0xffffff, 0x1f2a3a, 0x2d6cdf, 0xff6f61, 0xb8c2cc, 0xffcc33], van: [0xffffff, 0x33c4b3], bus: [0x2d6cdf],
      awn: [0x33c4b3, 0xff6f61, 0x2d6cdf, 0xffb347], wall: [0xf2f5f8, 0xdfe7ee, 0xffe7d6, 0xd7f0ea], roof: [0x34495e, 0x5d6d7e, 0x2d6cdf], tower: [0xf2f5f8, 0xd1dbe4, 0xb9c7d4, 0xe8eef3] } },
];

function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export const ROADS = [-48, -24, 0, 24, 48];
const BLOCKS = [-60, -36, -12, 12, 36, 60];

// returns { objs, ground texture }
export function buildCity(scene, ci, seed = 7) {
  const city = CITIES[ci], pal = city.pal, r = rng(seed + ci * 101), objs = [];
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.48, metalness: 0.0 });
  const add = (kind, x, z, ry = 0, mover = null) => {
    const k = KINDS[kind](r, pal); const mesh = new THREE.Mesh(geo(k.key, k.parts), mat);
    mesh.position.set(x, 0, z); mesh.rotation.y = ry; mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = !!mover || true;
    scene.add(mesh); const o = { mesh, kind, x, z, ry, size: k.size, h: k.h, pts: k.pts, alive: true, fall: null, mover, wob: 0 };
    objs.push(o); return o;
  };
  const types = [];
  for (const bx of BLOCKS) for (const bz of BLOCKS) {
    const d = Math.max(Math.abs(bx), Math.abs(bz)); const q = r();
    let t;
    if (d === 12) t = q < 0.2 - city.bias * 0.05 ? 'plaza' : 'down';
    else if (d === 36) t = q < 0.22 ? 'park' : q < 0.55 - city.bias * 0.15 ? 'sub' : (city.bias === 2 && q > 0.8 ? 'down' : 'mix');
    else t = q < 0.25 ? 'park' : (city.bias === 2 && q > 0.75) ? 'mix' : (city.bias === 1 && q > 0.7 ? 'mix' : 'sub');
    types.push({ bx, bz, t });
    // sidewalk furniture
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add('lamp', bx + sx * 8.3, bz + sz * 8.3, r() * 6);
    for (let i = 0; i < 4; i++) { const side = Math.floor(r() * 4), u = (r() - 0.5) * 13; const [x, z] = side < 2 ? [bx + u, bz + (side ? 8.4 : -8.4)] : [bx + (side === 2 ? 8.4 : -8.4), bz + u]; add(pick(r, ['hydrant', 'bin', 'bench', 'cone', 'bin']), x, z, side < 2 ? 0 : Math.PI / 2); }
    const ppl = 4 + Math.floor(r() * 4) + (t === 'down' || t === 'plaza' ? 4 : 0);
    for (let i = 0; i < ppl; i++) { const m = { type: 'walk', bx, bz, u: r() * 4, sp: (0.04 + r() * 0.04) * (r() < 0.5 ? -1 : 1), lane: 8.0 + (r() - 0.5) * 0.8 }; add('person', bx, bz, 0, m); }
    // interior (15x15 usable, centre bx,bz)
    const I = (kind, x, z, ry) => add(kind, bx + x, bz + z, ry ?? (Math.floor(r() * 4) * Math.PI / 2));
    if (t === 'down') {
      if (r() < 0.45) { I('sky', 0, 0); for (const s of [-1, 1]) I('tree', s * 6.2, 6.2), I('bench', s * 6.2, -6.3, 0); }
      else for (const [x, z] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7], [3.7, 3.7]]) I(r() < 0.55 ? 'tower' : 'shop', x, z);
    } else if (t === 'mix') {
      for (const [x, z] of [[-3.7, -3.7], [3.7, -3.7], [-3.7, 3.7], [3.7, 3.7]]) { const q2 = r(); if (q2 < 0.45) I('shop', x, z); else if (q2 < 0.75) I('house', x, z); else if (q2 < 0.88) I('tower', x, z); else { I('kiosk', x, z); I('tree', x + 2.2, z + 2.2); I('bush', x - 2, z + 2); } }
    } else if (t === 'sub') {
      for (const x of [-4.8, 0, 4.8]) for (const z of [-4.8, 0, 4.8]) { const q2 = r(); if (x === 0 && z === 0) { I('tree', 0, 0); I('bush', 1.5, 1.2); continue; } if (q2 < 0.55) I('house', x, z); else if (q2 < 0.8) { I('tree', x - 1, z); I('bush', x + 1.3, z + 1); } else { I('kiosk', x, z); } }
    } else if (t === 'park') {
      I('fountain', 0, 0, 0);
      for (let i = 0; i < 9; i++) { const a = r() * 6.28, rr = 4 + r() * 2.8; I(r() < 0.65 ? 'tree' : 'bush', Math.cos(a) * rr, Math.sin(a) * rr); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.4; I('bench', Math.cos(a) * 3, Math.sin(a) * 3, -a + Math.PI / 2); }
      for (let i = 0; i < 4; i++) add('person', bx + (r() - 0.5) * 10, bz + (r() - 0.5) * 10, r() * 6, { type: 'idle', t: r() * 6 });
    } else { // plaza
      I('fountain', 0, 0, 0); for (let i = 0; i < 4; i++) I('kiosk', (i % 2 ? 1 : -1) * 5, (i < 2 ? 1 : -1) * 5);
      for (let i = 0; i < 10; i++) add('person', bx + (r() - 0.5) * 13, bz + (r() - 0.5) * 13, r() * 6, { type: 'idle', t: r() * 6 });
    }
  }
  // traffic
  for (const rd of ROADS) for (const ax of [0, 1]) for (const lane of [-1.4, 1.4]) {
    let u = -HALF + r() * 12; const dir = lane > 0 ? 1 : -1;
    while (u < HALF) { const q = r(); const kind = q < 0.1 ? 'bus' : q < 0.25 ? 'van' : 'car';
      const m = { type: 'drive', ax, rd: rd + lane, u, sp: dir * (4 + r() * 2.5) };
      add(kind, 0, 0, 0, m); u += 16 + r() * 22; }
  }
  for (let i = 0; i < 18; i++) { const rd = pick(r, ROADS), u = (r() - 0.5) * 120; add('cone', r() < 0.5 ? rd + 2.6 : u, r() < 0.5 ? u : rd + 2.6); }
  return { objs, tex: groundTexture(city, types), mat };
}

function groundTexture(city, types) {
  const S = 2048, W = 200, k = S / W, cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), C = city.ground, X = (x) => (x + W / 2) * k;
  g.fillStyle = C.grass; g.fillRect(0, 0, S, S);
  // grass speckle
  for (let i = 0; i < 9000; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,40,0'},${0.04 + Math.random() * 0.05})`; g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 2 + Math.random() * 3); }
  g.fillStyle = C.road; g.fillRect(X(-HALF - 3), X(-HALF - 3), (HALF * 2 + 6) * k, (HALF * 2 + 6) * k);
  for (let i = 0; i < 14000; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(X(-HALF) + Math.random() * HALF * 2 * k, X(-HALF) + Math.random() * HALF * 2 * k, 2, 2); }
  for (const b of types) {
    g.fillStyle = '#bfb6a6'; g.fillRect(X(b.bx - 9.15), X(b.bz - 9.15), 18.3 * k, 18.3 * k); // curb
    g.fillStyle = C.walk; g.fillRect(X(b.bx - 9), X(b.bz - 9), 18 * k, 18 * k);
    g.strokeStyle = 'rgba(0,0,0,0.07)'; g.lineWidth = 1; for (let s = -9; s <= 9; s += 1.5) { g.beginPath(); g.moveTo(X(b.bx + s), X(b.bz - 9)); g.lineTo(X(b.bx + s), X(b.bz + 9)); g.moveTo(X(b.bx - 9), X(b.bz + s)); g.lineTo(X(b.bx + 9), X(b.bz + s)); g.stroke(); }
    const fill = { down: C.plaza, mix: C.lot, sub: C.park, park: C.park, plaza: C.plaza }[b.t];
    g.fillStyle = fill; g.fillRect(X(b.bx - 7.5), X(b.bz - 7.5), 15 * k, 15 * k);
    if (b.t === 'park') { g.strokeStyle = C.walk; g.lineWidth = 1.2 * k; g.beginPath(); g.arc(X(b.bx), X(b.bz), 3 * k, 0, 6.29); g.moveTo(X(b.bx - 7.5), X(b.bz)); g.lineTo(X(b.bx + 7.5), X(b.bz)); g.moveTo(X(b.bx), X(b.bz - 7.5)); g.lineTo(X(b.bx), X(b.bz + 7.5)); g.stroke(); }
    if (b.t === 'plaza' || b.t === 'down') { g.fillStyle = 'rgba(0,0,0,0.06)'; for (let i = -7; i < 7.5; i += 1.5) for (let j = -7; j < 7.5; j += 1.5) if ((i + j) % 3 === 0) g.fillRect(X(b.bx + i), X(b.bz + j), 1.5 * k, 1.5 * k); }
  }
  // lane markings + crosswalks
  g.fillStyle = C.line;
  for (const rd of ROADS) for (let u = -HALF; u < HALF; u += 3) {
    const nearX = ROADS.some((o) => Math.abs(u + 0.75 - o) < 4.2); if (nearX) continue;
    g.fillRect(X(rd - 0.12), X(u), 0.24 * k, 1.5 * k); g.fillRect(X(u), X(rd - 0.12), 1.5 * k, 0.24 * k);
  }
  g.fillStyle = 'rgba(255,255,255,0.85)';
  for (const a of ROADS) for (const b of ROADS) for (const s of [-1, 1]) for (let i = -2.4; i <= 2.2; i += 0.8) {
    g.fillRect(X(a + i), X(b + s * 3.6 - 0.6), 0.45 * k, 1.2 * k); g.fillRect(X(b + s * 3.6 - 0.6), X(a + i), 1.2 * k, 0.45 * k);
  }
  // outer hedge ring
  g.strokeStyle = 'rgba(30,70,30,0.5)'; g.lineWidth = 2.5 * k; g.strokeRect(X(-HALF - 5), X(-HALF - 5), (HALF * 2 + 10) * k, (HALF * 2 + 10) * k);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; return tex;
}
