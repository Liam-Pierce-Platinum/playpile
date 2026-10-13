// Character model kit: blueprint parts whose pieces are merged per material (one draw call per part per material),
// vertex-colour painting, smooth sweep / blob / superellipsoid geometry, and a shared shader patch that adds a warm
// fresnel rim light, a noise dissolve (death) and a cloth sway (robes, capes, ghost hems).
import * as THREE from '../vendor/three.module.js';
import { detailNormalTexture } from './textures.js';

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const NM = {};
const nmap = (k) => NM[k] || (NM[k] = detailNormalTexture(k));

// ---------------------------------------------------------------- shader patch
const FRAG_HEAD = `uniform vec3 uRim; uniform float uDis; varying vec3 vSdPos;
float sdHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float sdNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(sdHash(i), sdHash(i + vec3(1,0,0)), f.x), mix(sdHash(i + vec3(0,1,0)), sdHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(sdHash(i + vec3(0,0,1)), sdHash(i + vec3(1,0,1)), f.x), mix(sdHash(i + vec3(0,1,1)), sdHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
function sdCompile(shader) {
  const u = this.userData.sd;
  Object.assign(shader.uniforms, { uRim: u.uRim, uDis: u.uDis, uSway: u.uSway, uSwayH: u.uSwayH });
  shader.vertexShader = 'uniform vec4 uSway; uniform vec2 uSwayH; varying vec3 vSdPos;\n' + shader.vertexShader
    .replace('#include <begin_vertex>', `#include <begin_vertex>
    if (dot(uSway, uSway) > 0.0) { float sh = max(uSwayH.x - uSwayH.y, 0.001); float sw = clamp((uSwayH.x - position.y) / sh, 0.0, 1.0); sw *= sw;
      float sa = atan(position.z, position.x + 1e-4);
      transformed.xz += (uSway.xy + vec2(sin(sa * 5.0 + uSway.z), cos(sa * 4.0 + uSway.z * 1.3)) * uSway.w) * sw; }`)
    .replace('#include <project_vertex>', '#include <project_vertex>\n  vSdPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
  let f = FRAG_HEAD + shader.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
    float sdN = 1.0; // the dissolve noise only runs while a model is actually dissolving
    if (uDis > 0.0) { sdN = sdNoise(vSdPos * 7.0) * 0.7 + sdNoise(vSdPos * 23.0) * 0.3; if (sdN < uDis * 1.15 - 0.05) discard; }`);
  if (f.includes('#include <emissivemap_fragment>')) f = f.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
    float sdF = 1.0 - saturate(dot(normal, normalize(vViewPosition)));
    totalEmissiveRadiance += uRim * sdF * sdF * sdF;
    if (uDis > 0.0 && sdN < uDis * 1.15 + 0.05) totalEmissiveRadiance += vec3(3.0, 1.1, 0.4);`);
  shader.fragmentShader = f;
}

// material library: every model material is white + vertex colours, so one material serves many paint colours
export const MATLIB = {
  cloth: { r: 0.82, nm: 'cloth', ns: 0.7 },
  skin: { r: 0.5, nm: 'skin', ns: 0.45 },
  leather: { r: 0.6, nm: 'leather', ns: 0.8 },
  metal: { r: 0.32, m: 0.9, nm: 'metal', ns: 0.22 },
  wood: { r: 0.72, nm: 'wood', ns: 0.9 },
  bone: { r: 0.55, nm: 'bone', ns: 0.8 },
  fur: { r: 0.88, nm: 'fur', ns: 1.0 },
  chitin: { phys: true, r: 0.32, nm: 'chitin', ns: 0.25 },
  gloss: { phys: true, r: 0.22 },
  jelly: { phys: true, r: 0.08, op: 0.84 },
  glow: { basic: true },
  membrane: { r: 0.6, side: true, nm: 'skin', ns: 0.6, rimK: 0.15 },
};
const RIM = new THREE.Color(0.5, 0.33, 0.2);
export function makeMat(o) {
  let m;
  if (o.basic) {
    m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false, transparent: o.op != null, opacity: o.op ?? 1, depthWrite: o.op == null,
      blending: o.add ? THREE.AdditiveBlending : THREE.NormalBlending });
  } else {
    const P = { vertexColors: true, roughness: o.r ?? 0.6, metalness: o.m ?? 0, transparent: o.op != null, opacity: o.op ?? 1,
      depthWrite: o.op == null || !!o.dw, side: o.side ? THREE.DoubleSide : THREE.FrontSide };
    if (o.e != null) { P.emissive = new THREE.Color(o.e); P.emissiveIntensity = o.ei ?? 1; }
    if (o.nm) { P.normalMap = nmap(o.nm); P.normalScale = new THREE.Vector2(o.ns ?? 0.5, o.ns ?? 0.5); }
    m = o.phys ? new THREE.MeshPhysicalMaterial({ ...P, clearcoat: o.cc ?? 1, clearcoatRoughness: 0.12 }) : new THREE.MeshStandardMaterial(P);
  }
  const rim = (o.rim != null ? new THREE.Color(o.rim) : RIM.clone()).multiplyScalar(o.basic ? 0 : (o.rimK ?? 1));
  m.userData.sd = { uRim: { value: rim }, uDis: { value: 0 }, uSway: { value: new THREE.Vector4(0, 0, 0, 0) }, uSwayH: { value: new THREE.Vector2(o.swayTop ?? 1, o.swayBot ?? 0) } };
  m.onBeforeCompile = sdCompile;
  return m;
}

// ---------------------------------------------------------------- geometry
// DQ scales every segment count: the game camera is top-down and ~16 m away, so 0.7 keeps the silhouettes smooth
// while cutting the triangles (and the shadow pass) by about half. Raise it for close-up renders.
export const DQ = 0.7;
const q = (n, min) => Math.max(min, Math.round(n * DQ));
const gc = {};
const G = (k, fn) => gc[k] || (gc[k] = fn());
export const sph = (r = 1, w = 24, h = 16) => G(`s${r},${w},${h}`, () => new THREE.SphereGeometry(r, q(w, 6), q(h, 4)));
export const cyl = (a, b, h, s = 16, open = false) => G(`c${a},${b},${h},${s},${open}`, () => new THREE.CylinderGeometry(a, b, h, q(s, 5), 1, open));
export const cone = (r, h, s = 12) => G(`k${r},${h},${s}`, () => new THREE.ConeGeometry(r, h, s <= 6 ? s : q(s, 6)));
export const tor = (r, t, arc = Math.PI * 2, rs = 10, ts = 28) => G(`t${r},${t},${arc},${rs},${ts}`, () => new THREE.TorusGeometry(r, t, q(rs, 4), q(ts, 8), arc));
export const box = (w, h, d) => G(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d));
export function smoothSeams(g) {
  g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal, map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
    let e = map.get(k); if (!e) map.set(k, e = { v: v3(), l: [] });
    e.v.x += n.getX(i); e.v.y += n.getY(i); e.v.z += n.getZ(i); e.l.push(i);
  }
  for (const e of map.values()) { if (e.l.length < 2) continue; e.v.normalize(); for (const i of e.l) n.setXYZ(i, e.v.x, e.v.y, e.v.z); }
  return g;
}
// lathe with optional radial folds / per-vertex deformation fn(p) and a partial sweep angle
export function lathe(pts, o = {}) {
  const dense = [];
  for (let i = 0; i < pts.length; i++) {
    if (i > 0 && o.seg !== 6 && o.seg !== 5) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / ((o.step ?? 0.03) / DQ))); for (let k = 1; k < n; k++) dense.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]); }
    dense.push(pts[i]);
  }
  const g = new THREE.LatheGeometry(dense.map(([x, y]) => new THREE.Vector2(Math.max(0.0005, x), y)), (o.seg ?? 32) <= 8 ? o.seg : q(o.seg ?? 32, 8), o.phi0 ?? 0, o.phiL ?? Math.PI * 2);
  if (o.fold || o.fn) {
    const p = g.attributes.position, q = v3();
    for (let i = 0; i < p.count; i++) {
      q.fromBufferAttribute(p, i);
      if (o.fold) { const a = Math.atan2(q.x, q.z), k = 1 + o.fold[1](q.y) * Math.sin(a * o.fold[0] + (o.fold[2] || 0)); q.x *= k; q.z *= k; }
      if (o.fn) o.fn(q);
      p.setXYZ(i, q.x, q.y, q.z);
    }
    smoothSeams(g);
  }
  return g;
}
// sphere deformed by fn(dir) -> radius multiplier (or fn(dir, pos) editing pos)
export function blob(r, fn, w = 32, h = 22) {
  const g = new THREE.SphereGeometry(r, q(w, 8), q(h, 6)), p = g.attributes.position, P = v3(), d = v3();
  for (let i = 0; i < p.count; i++) { P.fromBufferAttribute(p, i); d.copy(P).normalize(); const k = fn(d, P); if (typeof k === 'number') P.multiplyScalar(k); p.setXYZ(i, P.x, P.y, P.z); }
  return smoothSeams(g);
}
// superellipsoid: rounded box (e small = boxy)
export function sbox(w, h, d, e = 0.25) {
  return G(`sb${w},${h},${d},${e}`, () => {
    const g = new THREE.SphereGeometry(1, q(24, 8), q(16, 6)), p = g.attributes.position, n = g.attributes.normal;
    const f = (v, ex) => Math.sign(v) * Math.pow(Math.abs(v), ex);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      p.setXYZ(i, f(x, e) * w / 2, f(y, e) * h / 2, f(z, e) * d / 2);
      const nn = v3(f(x, 2 - e) / w, f(y, 2 - e) / h, f(z, 2 - e) / d).normalize(); n.setXYZ(i, nn.x, nn.y, nn.z);
    }
    return g;
  });
}
// tube along a smooth curve with a radius profile (number, array sampled along length, or fn(t)); sx/sy flatten
export function sweep(pts, rad, o = {}) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => (Array.isArray(p) ? v3(...p) : p)), false, 'centripetal');
  const ts = q(o.ts ?? Math.max(10, pts.length * 5), 4), rs = q(o.rs ?? 10, 4), sx = o.sx ?? 1, sy = o.sy ?? 1;
  const rf = typeof rad === 'function' ? rad : Array.isArray(rad) ? (t) => { const f = t * (rad.length - 1), i = Math.min(rad.length - 2, Math.floor(f)); return rad[i] + (rad[i + 1] - rad[i]) * (f - i); } : () => rad;
  const fr = curve.computeFrenetFrames(ts, false), L = curve.getLength();
  const pos = [], nor = [], uv = [], idx = [];
  const P = v3(), d = v3(), nn = v3();
  let ravg = 0; for (let j = 0; j <= ts; j++) ravg += rf(j / ts); ravg /= ts + 1;
  for (let j = 0; j <= ts; j++) {
    const t = j / ts; curve.getPointAt(t, P); const r = rf(t), N = fr.normals[j], B = fr.binormals[j];
    for (let i = 0; i <= rs; i++) {
      const a = (i / rs) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      d.set(0, 0, 0).addScaledVector(N, c * sx).addScaledVector(B, s * sy);
      nn.set(0, 0, 0).addScaledVector(N, c / sx).addScaledVector(B, s / sy).normalize();
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r); nor.push(nn.x, nn.y, nn.z); uv.push((i / rs) * Math.PI * 2 * ravg, t * L);
    }
  }
  for (let j = 0; j < ts; j++) for (let i = 0; i < rs; i++) {
    const a = j * (rs + 1) + i, b = a + rs + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  if (o.cap !== false) for (const [j, sgn] of [[0, -1], [ts, 1]]) {
    const t = j / ts, r = rf(t); if (r < 0.004) continue;
    curve.getPointAt(t, P); const T = fr.tangents[j], N = fr.normals[j], B = fr.binormals[j];
    const c0 = pos.length / 3; pos.push(P.x, P.y, P.z); nor.push(T.x * sgn, T.y * sgn, T.z * sgn); uv.push(0, 0);
    for (let i = 0; i <= rs; i++) {
      const a = (i / rs) * Math.PI * 2; d.set(0, 0, 0).addScaledVector(N, Math.cos(a) * sx).addScaledVector(B, Math.sin(a) * sy);
      pos.push(P.x + d.x * r, P.y + d.y * r, P.z + d.z * r); nor.push(T.x * sgn, T.y * sgn, T.z * sgn); uv.push(Math.cos(a) * r, Math.sin(a) * r);
    }
    for (let i = 0; i < rs; i++) sgn > 0 ? idx.push(c0, c0 + 2 + i, c0 + 1 + i) : idx.push(c0, c0 + 1 + i, c0 + 2 + i);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.userData.uvWorld = true;
  return g;
}
export function extrude(shape, depth, bevel = 0.01, o = {}) {
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: o.bs ?? 2, curveSegments: o.cs ?? 12 });
  g.translate(0, 0, -depth / 2); g.userData.uvWorld = true;
  return g;
}
export function flatShape(shape, cs = 12) { const g = new THREE.ShapeGeometry(shape, cs); g.userData.uvWorld = true; return g; }

// ---------------------------------------------------------------- transform helper
const _q = new THREE.Quaternion(), _e = new THREE.Euler();
export function T(x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) {
  return new THREE.Matrix4().compose(v3(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), v3(sx, sy, sz));
}
// orient +Y of a geometry along a direction, placed at p
export function TY(p, dir, sx = 1, sy = 1, sz = sx) {
  const q = new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), v3(...dir).normalize());
  return new THREE.Matrix4().compose(v3(...p), q, v3(sx, sy, sz));
}

// ---------------------------------------------------------------- blueprints
const _c = new THREE.Color(), _p = v3(), _n = v3();
const UVK = 2.2; // detail tiles per metre
class PartBuilder {
  constructor(p) { this.p = p; }
  add(key, geo, color, m = null, paint = null) {
    const g = geo.clone();
    if (geo.userData.uvWorld) g.userData.uvWorld = true;
    if (m) g.applyMatrix4(m);
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal, n = pos.count, col = new Float32Array(n * 3);
    const base = new THREE.Color(color);
    for (let i = 0; i < n; i++) {
      _c.copy(base);
      if (paint) { _p.fromBufferAttribute(pos, i); _n.fromBufferAttribute(nor, i); paint(_p, _n, _c, base); }
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    else {
      const uv = g.attributes.uv;
      let su, sv;
      if (geo.userData.uvWorld) { const s = m ? v3().setFromMatrixScale(m) : v3(1, 1, 1); su = sv = UVK * (s.x + s.y + s.z) / 3; }
      else { g.computeBoundingSphere(); const R = g.boundingSphere.radius; su = Math.max(1, Math.round(2 * Math.PI * R * UVK)); sv = Math.max(1, Math.round(Math.PI * R * UVK)); }
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
    }
    (this.p.items[key] || (this.p.items[key] = [])).push(g);
    return this;
  }
}
function mergeGeos(list) {
  let vc = 0, ic = 0;
  for (const g of list) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), col = new Float32Array(vc * 3);
  const idx = vc > 65535 ? new Uint32Array(ic) : new Uint16Array(ic);
  let vo = 0, io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    const cp = (attr, arr, k) => { const a = attr; for (let i = 0; i < n; i++) for (let c = 0; c < k; c++) arr[(vo + i) * k + c] = a.getComponent(i, c); };
    cp(g.attributes.position, pos, 3); cp(g.attributes.normal, nor, 3); cp(g.attributes.uv, uv, 2); cp(g.attributes.color, col, 3);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx[io++] = g.index.getX(i) + vo;
    else for (let i = 0; i < n; i++) idx[io++] = vo + i;
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  out.userData.shared = true;
  return out;
}
export class Blueprint {
  constructor(matSpec) { this.parts = []; this.by = {}; this.matSpec = matSpec; this.done = false; }
  part(name, parent = null, pos = [0, 0, 0], rot = [0, 0, 0]) {
    const p = { name, parent, pos, rot, items: {}, merged: null };
    this.parts.push(p); this.by[name] = p;
    return new PartBuilder(p);
  }
  finalize() {
    if (this.done) return this;
    for (const p of this.parts) { p.merged = {}; for (const k in p.items) p.merged[k] = mergeGeos(p.items[k]); p.items = null; }
    this.done = true;
    return this;
  }
  // a fresh Object3D tree that shares the merged geometry; materials are per instance (hit flash, dissolve)
  instance(shadow = true) {
    this.finalize();
    const mats = {};
    const sway = {};
    const used = new Set(); for (const p of this.parts) for (const k in p.merged) used.add(k);
    for (const k in this.matSpec) {
      if (!used.has(k)) continue;
      const spec = typeof this.matSpec[k] === 'string' ? MATLIB[this.matSpec[k]] : Object.assign({}, MATLIB[this.matSpec[k].base] || {}, this.matSpec[k]);
      mats[k] = makeMat(spec);
      if (spec.swayGroup) { const s = sway[spec.swayGroup] || (sway[spec.swayGroup] = mats[k].userData.sd.uSway); mats[k].userData.sd.uSway = s; mats[k].userData.swayed = true; }
      else if (spec.sway) mats[k].userData.swayed = true;
    }
    const root = new THREE.Group(), parts = {};
    for (const p of this.parts) {
      const g = new THREE.Group(); g.position.set(...p.pos); g.rotation.set(...p.rot); g.name = p.name;
      for (const k in p.merged) {
        if (!mats[k]) throw new Error('no material ' + k);
        const mesh = new THREE.Mesh(p.merged[k], mats[k]); mesh.castShadow = shadow && !(mats[k].transparent);
        g.add(mesh);
      }
      parts[p.name] = g;
      (p.parent ? parts[p.parent] : root).add(g);
    }
    return { root, parts, mats, allMats: Object.values(mats) };
  }
}

// painting helpers
export const lerpHex = (c, a, b, t) => c.set(a).lerp(_tmp.set(b), Math.max(0, Math.min(1, t)));
const _tmp = new THREE.Color();
export function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
