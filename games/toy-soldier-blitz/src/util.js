import * as THREE from '../vendor/three.module.js';

export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
export function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 100000) / 100000; }; }

// Rounded box: dense vertex bands at the edges, pushed onto a radius. Exact normals.
const RB = new Map();
export function roundedBox(w, h, d, r = 0.08, k = 3) {
  const key = [w, h, d, r, k].join(',');
  if (RB.has(key)) return RB.get(key);
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001, d / 2 - 0.001);
  const n = 2 * k + 1, g = new THREE.BoxGeometry(2, 2, 2, n, n, n);
  const P = g.attributes.position, N = g.attributes.normal, UV = g.attributes.uv, half = [w / 2, h / 2, d / 2];
  const v = new THREE.Vector3(), inner = new THREE.Vector3(), dir = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i);
    const onx = N.getX(i), ony = N.getY(i), onz = N.getZ(i);
    const c = [v.x, v.y, v.z];
    for (let a = 0; a < 3; a++) {
      const idx = Math.round((c[a] + 1) * n / 2), H = half[a], A = H - r;
      if (idx <= k) c[a] = -H + r * (idx / k);
      else if (idx >= n - k) c[a] = A + r * ((idx - (n - k)) / k);
      else c[a] = -A + 2 * A * ((idx - k) / (n - 2 * k));
    }
    v.set(c[0], c[1], c[2]);
    inner.set(clamp(v.x, -half[0] + r, half[0] - r), clamp(v.y, -half[1] + r, half[1] - r), clamp(v.z, -half[2] + r, half[2] - r));
    dir.subVectors(v, inner);
    if (dir.lengthSq() > 1e-10) { dir.normalize(); v.copy(inner).addScaledVector(dir, r); N.setXYZ(i, dir.x, dir.y, dir.z); }
    P.setXYZ(i, v.x, v.y, v.z);
    // planar UVs per face so textures are not crushed into the rounded bands
    const ux = v.x / w + 0.5, uy = v.y / h + 0.5, uz = v.z / d + 0.5;
    if (onx > 0.5) UV.setXY(i, 1 - uz, uy); else if (onx < -0.5) UV.setXY(i, uz, uy);
    else if (ony > 0.5) UV.setXY(i, ux, 1 - uz); else if (ony < -0.5) UV.setXY(i, ux, uz);
    else if (onz > 0.5) UV.setXY(i, ux, uy); else UV.setXY(i, 1 - ux, uy);
  }
  g.computeBoundingSphere();
  RB.set(key, g);
  return g;
}

export function canvasTex(w, h, draw, repeat = 1, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.userData.canvas = c;
  return t;
}

// height canvas -> tangent-space normal map
export function normalFromHeight(src, strength = 2, repeat = 1) {
  const w = src.width, h = src.height, sd = src.getContext('2d').getImageData(0, 0, w, h).data;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'), out = g.createImageData(w, h), od = out.data;
  const H = (x, y) => sd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * strength, dy = (H(x, y + 1) - H(x, y - 1)) * strength;
    const l = Math.hypot(dx, dy, 1), i = (y * w + x) * 4;
    od[i] = (-dx / l * 0.5 + 0.5) * 255; od[i + 1] = (dy / l * 0.5 + 0.5) * 255; od[i + 2] = (1 / l * 0.5 + 0.5) * 255; od[i + 3] = 255;
  }
  g.putImageData(out, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 4;
  return t;
}

// ray (o, unit d) vs AABB box {x0..z1}; returns t or -1
export function rayBox(ox, oy, oz, dx, dy, dz, b, tmax) {
  let t0 = 0, t1 = tmax;
  const o = [ox, oy, oz], d = [dx, dy, dz], mn = [b.x0, b.y0, b.z0], mx = [b.x1, b.y1, b.z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) { if (o[a] < mn[a] || o[a] > mx[a]) return -1; continue; }
    let ta = (mn[a] - o[a]) / d[a], tb = (mx[a] - o[a]) / d[a];
    if (ta > tb) { const s = ta; ta = tb; tb = s; }
    if (ta > t0) t0 = ta; if (tb < t1) t1 = tb;
    if (t0 > t1) return -1;
  }
  return t0;
}
export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz, tc = lx * dx + ly * dy + lz * dz;
  if (tc < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tc * tc;
  if (d2 > r * r) return -1;
  return tc - Math.sqrt(r * r - d2);
}
