// BANNERFALL :: render/geo.js - helpers for building smooth, chunky, vertex-coloured meshes in code.
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries, mergeVertices } from '../../vendor/jsm/utils/BufferGeometryUtils.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
export const lin = (hex) => new THREE.Color(hex).convertSRGBToLinear();

/** colour a geometry, optionally mark it as team-coloured (aTeam = 1), then transform it */
export function part(geo, color, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], team = 0, grad = 0, shade = 1 } = {}) {
  let g = geo.index ? geo : geo;
  g.deleteAttribute('uv');
  g.deleteAttribute('uv1');
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3), t = new Float32Array(n);
  const base = team ? new THREE.Color(1, 1, 1) : color instanceof THREE.Color ? color : lin(color);
  g.computeBoundingBox();
  const bb = g.boundingBox;
  for (let i = 0; i < n; i++) {
    let k = shade;
    if (grad) { const y = (g.attributes.position.getY(i) - bb.min.y) / Math.max(1e-4, bb.max.y - bb.min.y); k *= 1 - grad + grad * y; }
    c[i * 3] = base.r * k; c[i * 3 + 1] = base.g * k; c[i * 3 + 2] = base.b * k;
    t[i] = team;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  g.setAttribute('aTeam', new THREE.BufferAttribute(t, 1));
  _e.set(rot[0], rot[1], rot[2]);
  _q.setFromEuler(_e);
  _m.compose(_p.set(pos[0], pos[1], pos[2]), _q, _s.set(scale[0], scale[1], scale[2]));
  g.applyMatrix4(_m);
  return g;
}

export function merge(list) {
  const fixed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  const m = mergeGeometries(fixed, false);
  return m;
}

/** merge, weld and re-smooth so separate pieces read as one rounded form */
export function mergeSmooth(list, tol = 1e-3) {
  const m = merge(list);
  m.deleteAttribute('normal');
  const w = mergeVertices(m, tol);
  w.computeVertexNormals();
  return w;
}

function h3(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
function n3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h3(ix, iy, iz), h3(ix + 1, iy, iz), u), L(h3(ix, iy + 1, iz), h3(ix + 1, iy + 1, iz), u), v),
           L(L(h3(ix, iy, iz + 1), h3(ix + 1, iy, iz + 1), u), L(h3(ix, iy + 1, iz + 1), h3(ix + 1, iy + 1, iz + 1), u), v), w);
}
/** lumpy displacement along the normal (for canopies and boulders), then smooth normals */
export function lumpy(geo, amt, freq, seed = 0) {
  let g = mergeVertices(geo.index ? geo : geo, 1e-4);
  g.computeVertexNormals();
  const p = g.attributes.position, nrm = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = (n3(x * freq + seed, y * freq, z * freq) - 0.5) * 2 * amt + (n3(x * freq * 2.3, y * freq * 2.3 + seed, z * freq * 2.3) - 0.5) * amt * 0.5;
    p.setXYZ(i, x + nrm.getX(i) * d, y + nrm.getY(i) * d, z + nrm.getZ(i) * d);
  }
  g.computeVertexNormals();
  return g;
}

/** a rounded box (good chunky torsos, planks and stones) */
export function rbox(w, h, d, r = 0.1, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg + 2, seg + 2, seg + 2);
  const p = g.attributes.position;
  const hw = w / 2 - r, hh = h / 2 - r, hd = d / 2 - r;
  const v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.set(p.getX(i), p.getY(i), p.getZ(i));
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dlt = v.sub(c);
    if (dlt.lengthSq() > 1e-9) dlt.normalize().multiplyScalar(r);
    p.setXYZ(i, c.x + dlt.x, c.y + dlt.y, c.z + dlt.z);
  }
  g.computeVertexNormals();
  return g;
}

export const capsule = (r, len, cs = 4, rs = 10) => new THREE.CapsuleGeometry(r, len, cs, rs);
export const sphere = (r, w = 14, h = 10, ...rest) => new THREE.SphereGeometry(r, w, h, ...rest);
export const cyl = (rt, rb, h, s = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, s, 1, open);
export const cone = (r, h, s = 12) => new THREE.ConeGeometry(r, h, s);
export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

/** standard material for instanced soldiers:
 *  aTeam 0 = baked vertex colour, 1 = team colour (instanceColor x shade), 2 = team trim (aTrim x shade).
 *  aFlash = per-instance white hit flash. */
export function teamMaterial(opts = {}) {
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness ?? 0.72, metalness: opts.metalness ?? 0.0, ...opts.extra });
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aTeam;\nattribute float aFlash;\nattribute vec3 aTrim;\nvarying float vFlash;')
      .replace('#include <color_vertex>', `
        vColor.rgb = color.rgb;
        #ifdef USE_INSTANCING_COLOR
          if (aTeam > 1.5) vColor.rgb = aTrim * color.r;
          else if (aTeam > 0.5) vColor.rgb = instanceColor.rgb * color.r;
        #endif
        vFlash = aFlash;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFlash;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.95, 0.85) * vFlash * 0.8;');
  };
  return mat;
}
