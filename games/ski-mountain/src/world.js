// Shared world: the sky, the distant peaks, materials, and the mesh builders the endless course uses
// (trees, rocks, kickers, rails, logs, snow fences, snowcats, huts). The ground itself is the endless
// course (src/endless.js): terrainH / groundH / collidersNear ask it once setCourse() has been called.
import * as THREE from '../vendor/three.module.js';
import { lerp, smoothstep, makeRng, fbm, vnoise } from './util.js';

let EN = null;
export function setCourse(e) { EN = e; }
export const terrainH = (x, z) => EN.terrainH(x, z);
export const groundH = (x, z) => EN.groundH(x, z);
export const collidersNear = (x, z, out) => EN.collidersNear(x, z, out);
export function normalAt(x, z, out, e = 0.6) {
  const hx = groundH(x + e, z) - groundH(x - e, z), hz = groundH(x, z + e) - groundH(x, z - e);
  return out.set(-hx, 2 * e, -hz).normalize();
}

// kicker ramp height at (x, z) (0 outside it)
export function kickerH(k, x, z) {
  const dx = x - k.x, dz = z - k.z;
  const u = dx * k.dx + dz * k.dz, s = Math.abs(dx * k.dz - dz * k.dx);
  if (u > 0 || u < -k.len || s > k.wid / 2 + 1.4) return 0;
  const t = (u + k.len) / k.len;
  return k.hgt * t * t * (1 - smoothstep(k.wid / 2, k.wid / 2 + 1.4, s));
}

function snowTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const im = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const n = 0.5 * fbm(x / 9, y / 9, 3) + 0.5 * (Math.random() - 0.5) * 0.6;
    const v = 236 + n * 18 + (Math.random() < 0.004 ? 19 : 0);
    const o = (y * 128 + x) * 4; im.data[o] = v - 3; im.data[o + 1] = v - 1; im.data[o + 2] = Math.min(255, v + 4); im.data[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}
function merge(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0; for (const g of parts) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + g.attributes.position.count) * 3);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3)); m.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); m.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return m;
}
function paint(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(p.getX(i), p.getY(i), p.getZ(i), col); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function treeGeo() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.16, 0.24, 2.2, 7); trunk.translate(0, 1.1, 0);
  parts.push(paint(trunk, (x, y, z, c) => c.setRGB(0.32, 0.22, 0.15)));
  const tiers = [[2.3, 3.0, 1.4], [1.85, 2.7, 2.9], [1.35, 2.3, 4.2], [0.85, 1.9, 5.4]];
  for (const [r, h, y0] of tiers) {
    const g = new THREE.ConeGeometry(r, h, 9, 3, false); g.translate(0, y0 + h / 2, 0);
    // jaggy skirt + snow on the upper side of each tier
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const yy = p.getY(i) - y0; if (yy < 0.05) { const a = Math.atan2(p.getZ(i), p.getX(i)); const k = 1 + 0.12 * Math.sin(a * 9); p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); p.setY(i, p.getY(i) - 0.25 * (Math.sin(a * 9) * 0.5 + 0.5)); } }
    g.computeVertexNormals();
    parts.push(paint(g, (x, y, z, c) => { const t = (y - y0) / h; const snow = smoothstep(0.35, 0.75, t) * 0.75 + (t < 0.1 ? 0.25 : 0); c.setRGB(lerp(0.09, 0.93, snow), lerp(0.30, 0.96, snow), lerp(0.20, 1.0, snow)); }));
  }
  return merge(parts);
}
function smoothNormals(g) {
  const p = g.attributes.position, n = g.attributes.normal, acc = new Map(), k = (i) => p.getX(i).toFixed(3) + p.getY(i).toFixed(3) + p.getZ(i).toFixed(3);
  for (let i = 0; i < p.count; i++) { const kk = k(i); const a = acc.get(kk) || [0, 0, 0]; a[0] += n.getX(i); a[1] += n.getY(i); a[2] += n.getZ(i); acc.set(kk, a); }
  for (let i = 0; i < p.count; i++) { const a = acc.get(k(i)), l = Math.hypot(a[0], a[1], a[2]) || 1; n.setXYZ(i, a[0] / l, a[1] / l, a[2] / l); }
}
function rockGeo(seed) {
  const g = new THREE.IcosahedronGeometry(1, 2), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = 1 + 0.32 * vnoise(v.x * 1.7 + seed, v.z * 1.7 + v.y * 1.3) + 0.12 * vnoise(v.x * 4 + seed, v.y * 4); v.multiplyScalar(n); v.y *= 0.7; p.setXYZ(i, v.x, v.y, v.z); }
  g.computeVertexNormals(); smoothNormals(g);
  const nn = g.attributes.normal;
  const out = paint(g, (x, y, z, c) => c.setRGB(0.4, 0.41, 0.45));
  const col = out.attributes.color;
  for (let i = 0; i < p.count; i++) { const s = smoothstep(0.45, 0.8, nn.getY(i)); col.setXYZ(i, lerp(0.38, 0.95, s), lerp(0.39, 0.97, s), lerp(0.43, 1.0, s)); }
  return out;
}


// ---------- shared feature builders (the mountain and ENDLESS both use them) ----------
const SG = {}, SM = {};
function shared() {
  if (SG.rail) return;
  SG.rail = new THREE.CylinderGeometry(0.06, 0.06, 1, 10); SG.post = new THREE.CylinderGeometry(0.05, 0.05, 1, 8); SG.log = new THREE.CylinderGeometry(0.36, 0.4, 1, 12);
  SG.bar = new THREE.CylinderGeometry(0.09, 0.09, 1, 8); SG.fpost = new THREE.CylinderGeometry(0.08, 0.1, 1, 7); SG.flag = new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6);
  for (const g of Object.values(SG)) g.userData.shared = true;
  SM.metal = new THREE.MeshStandardMaterial({ color: 0xd9dee6, metalness: 0.85, roughness: 0.25 }); SM.railCol = new THREE.MeshStandardMaterial({ color: 0xffc400, metalness: 0.3, roughness: 0.4 });
  SM.bark = new THREE.MeshLambertMaterial({ color: 0x6b4428 }); SM.wood = new THREE.MeshLambertMaterial({ color: 0xa8743f });
}
const _up = new THREE.Vector3(0, 1, 0);
function between(parent, geo, mat, a, b) { const m = new THREE.Mesh(geo, mat); const d = new THREE.Vector3().subVectors(b, a); m.position.copy(a).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(_up, d.clone().normalize()); m.scale.y = d.length(); m.castShadow = true; parent.add(m); return m; }
export function kickerMesh(k, parent, kmat, color) {
  shared();
  const NU = 14, NS = 10, px = -k.dz, pz = k.dx, half = k.wid / 2 + 1.4;
  const pos = [], col = [], idx = [];
  for (let a = 0; a <= NU; a++) for (let b = 0; b <= NS; b++) {
    const u = -k.len + (a / NU) * k.len - 0.001, s = -half + (b / NS) * 2 * half;
    const x = k.x + k.dx * u + px * s, z = k.z + k.dz * u + pz * s, y = terrainH(x, z) + kickerH(k, x, z) + 0.03;
    pos.push(x, y, z); const sh = 0.94 + 0.06 * (a / NU); col.push(sh * 0.97, sh * 0.985, 1);
  }
  for (let a = 0; a < NU; a++) for (let b = 0; b < NS; b++) { const i0 = a * (NS + 1) + b, i1 = i0 + 1, i2 = i0 + NS + 1, i3 = i2 + 1; idx.push(i0, i1, i2, i1, i3, i2); }
  const base = pos.length / 3; // lip wall
  for (let b = 0; b <= NS; b++) {
    const s = -half + (b / NS) * 2 * half, x = k.x + px * s - k.dx * 0.002, z = k.z + pz * s - k.dz * 0.002, t = terrainH(x, z);
    pos.push(x, t + kickerH(k, x - k.dx * 0.01, z - k.dz * 0.01) + 0.03, z, x + k.dx * 0.3, t - 0.05, z + k.dz * 0.3); col.push(0.78, 0.84, 0.93, 0.7, 0.77, 0.9);
  }
  for (let b = 0; b < NS; b++) { const i0 = base + b * 2; idx.push(i0, i0 + 2, i0 + 1, i0 + 1, i0 + 2, i0 + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 9, pos[i + 2] / 9); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  const m = new THREE.Mesh(g, kmat); m.receiveShadow = true; m.castShadow = true; parent.add(m);
  const fm = SM['f' + color] || (SM['f' + color] = new THREE.MeshLambertMaterial({ color }));
  for (const s of [-1, 1]) { const f = new THREE.Mesh(SG.flag, fm); const x = k.x + px * s * (k.wid / 2 + 0.6), z = k.z + pz * s * (k.wid / 2 + 0.6); f.position.set(x, terrainH(x, z) + 0.8, z); parent.add(f); }
}
export function railMesh(r, parent) {
  shared();
  const A = new THREE.Vector3(r.ax, r.ay, r.az), B = new THREE.Vector3(r.bx, r.by, r.bz);
  if (r.type === 'rail') {
    between(parent, SG.rail, SM.metal, A, B);
    for (let t = 0.08; t <= 0.93; t += 0.42) { const P = A.clone().lerp(B, t); between(parent, SG.post, SM.railCol, new THREE.Vector3(P.x, terrainH(P.x, P.z) - 0.3, P.z), P); }
  } else if (r.type === 'log') {
    const lo = new THREE.Vector3(0, -0.35, 0);
    between(parent, SG.log, SM.bark, A.clone().add(lo), B.clone().add(lo));
  } else {
    between(parent, SG.bar, SM.wood, A.clone().add(new THREE.Vector3(0, -0.06, 0)), B.clone().add(new THREE.Vector3(0, -0.06, 0)));
    for (let t = 0; t <= 1.001; t += 0.25) { const P = A.clone().lerp(B, t); between(parent, SG.fpost, SM.wood, new THREE.Vector3(P.x, terrainH(P.x, P.z) - 0.3, P.z), P.clone().add(new THREE.Vector3(0, 0.08, 0))); }
  }
}

export function buildWorld(scene) {
  const rng = makeRng(20261013);
  const W = { anim: [] };
  const back = new THREE.Group(); scene.add(back); W.backdrop = back;
  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x2f7fe0) }, hor: { value: new THREE.Color(0xd6ebfb) }, sun: { value: new THREE.Vector3(0.35, 0.55, 0.75).normalize() } },
    vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 sun; varying vec3 vd; void main(){ float h = clamp(vd.y,0.0,1.0); vec3 c = mix(hor, top, pow(h,0.55)); float s = max(dot(vd,sun),0.0); c += vec3(1.0,0.95,0.8)*(pow(s,600.0)*3.0 + pow(s,12.0)*0.22); if(vd.y<0.0) c = mix(hor, vec3(0.86,0.92,0.98), clamp(-vd.y*4.0,0.0,1.0)); gl_FragColor = vec4(c,1.0); }',
  });
  W.sky = new THREE.Mesh(new THREE.SphereGeometry(3000, 32, 16), skyMat); W.sky.renderOrder = -1; W.sky.frustumCulled = false; scene.add(W.sky);
  W.sunDir = skyMat.uniforms.sun.value.clone();

  // distant peaks (aerial-perspective tinted by height, no fog)
  const peakMat = new THREE.MeshLambertMaterial({ vertexColors: true, fog: false });
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + rng() * 0.25, dist = 2400 + rng() * 1200;
    const r = 700 + rng() * 700, h = 700 + rng() * 900, sd = rng() * 100;
    const g = new THREE.PlaneGeometry(2 * r, 2 * r, 72, 72); g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k), d = Math.hypot(x, z) / r;
      const ridge = 1 - Math.abs(fbm(x * 0.0022 + sd, z * 0.0022, 4)) * 1.6;
      p.setY(k, h * Math.pow(Math.max(0, 1 - d), 1.6) * (0.75 + 0.35 * ridge) - 30);
    }
    g.computeVertexNormals();
    const nn = g.attributes.normal;
    paint(g, (x, y, z, c) => { const t = y / h; const s = smoothstep(0.3, 0.5, t + 0.12 * vnoise(x * 0.01, z * 0.01)); c.setRGB(lerp(0.55, 0.95, s), lerp(0.63, 0.97, s), lerp(0.76, 1.0, s)); });
    const col = g.attributes.color; for (let k = 0; k < p.count; k++) { const st = smoothstep(0.75, 0.55, nn.getY(k)) * 0.5; col.setXYZ(k, lerp(col.getX(k), 0.5, st), lerp(col.getY(k), 0.57, st), lerp(col.getZ(k), 0.7, st)); }
    const m = new THREE.Mesh(g, peakMat); m.position.set(Math.sin(a) * dist, -950 + rng() * 150, 1100 + Math.cos(a) * dist); back.add(m);
  }

  const floor = new THREE.Mesh(new THREE.CircleGeometry(9000, 48), new THREE.MeshLambertMaterial({ color: 0xe4eef8 })); floor.rotation.x = -Math.PI / 2; floor.position.set(0, -905, 1100); back.add(floor);

  // ---------- materials + shared geometry (the course instances these per chunk) ----------
  const tex = snowTex(); tex.repeat.set(1, 1);
  const tmat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const kmat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
  const tmatT = new THREE.MeshLambertMaterial({ vertexColors: true });
  const tgeo = treeGeo(), tgeoLo = treeGeoLo();
  const rgeos = [rockGeo(1.3), rockGeo(7.1), rockGeo(13.7)], rmat = tmatT;
  const poleGeo = new THREE.CylinderGeometry(0.045, 0.045, 1.9, 6); poleGeo.translate(0, 0.95, 0);
  const logGeo = paint(new THREE.CylinderGeometry(0.42, 0.46, 1, 9).rotateZ(Math.PI / 2), (x, y, z, c) => c.setRGB(0.36, 0.22, 0.12)); // unit length along x
  W.assets = { tmat, kmat, tgeo, tgeoLo, tmatT, rgeos, rmat, poleGeo, logGeo, fenceGeo: fenceGeo(), catGeo: catGeo(), hutGeo: hutGeo() };
  for (const g of Object.values(W.assets)) if (g && g.isBufferGeometry) g.userData.shared = true;
  for (const g of rgeos) g.userData.shared = true;
  return W;
}

// far LOD tree: two cones, ~30 triangles (the near one is ~280)
function treeGeoLo() {
  const parts = [];
  for (const [r, h, y0] of [[2.2, 4.2, 0.9], [1.5, 3.6, 3.4]]) {
    const g = new THREE.ConeGeometry(r, h, 6, 1, true); g.translate(0, y0 + h / 2, 0);
    parts.push(paint(g, (x, y, z, c) => { const t = (y - y0) / h, s = smoothstep(0.45, 0.85, t) * 0.7; c.setRGB(lerp(0.09, 0.93, s), lerp(0.3, 0.96, s), lerp(0.2, 1, s)); }));
  }
  return merge(parts);
}
// snow fence (a blockage, not a grind): orange slats on posts, unit length along x, 1.25 m tall
function fenceGeo() {
  const parts = [];
  for (let i = 0; i < 2; i++) parts.push(paint(new THREE.BoxGeometry(1.02, 0.22, 0.05).translate(0, 0.45 + i * 0.55, 0), (x, y, z, c) => c.setRGB(1, 0.36, 0.08)));
  for (let i = 0; i < 5; i++) parts.push(paint(new THREE.BoxGeometry(0.06, 1.25, 0.06).translate(-0.4 + i * 0.2, 0.62, 0), (x, y, z, c) => c.setRGB(0.95, 0.42, 0.12)));
  parts.push(paint(new THREE.BoxGeometry(0.09, 1.4, 0.09).translate(-0.5, 0.7, 0), (x, y, z, c) => c.setRGB(0.25, 0.2, 0.16)));
  return merge(parts);
}
// a parked snowcat: red cab + body, dark tracks, a front blade; ~6 m long along z, 3.2 m wide
function catGeo() {
  const red = (x, y, z, c) => c.setRGB(0.86, 0.12, 0.08), dark = (x, y, z, c) => c.setRGB(0.12, 0.12, 0.14), glass = (x, y, z, c) => c.setRGB(0.25, 0.4, 0.55);
  return merge([
    paint(new THREE.BoxGeometry(1, 1.0, 5.6).translate(-1.15, 0.5, 0), dark), paint(new THREE.BoxGeometry(1, 1.0, 5.6).translate(1.15, 0.5, 0), dark),
    paint(new THREE.BoxGeometry(2.6, 1.0, 4.6).translate(0, 1.35, -0.2), red), paint(new THREE.BoxGeometry(2.3, 1.2, 2.0).translate(0, 2.4, 0.6), red),
    paint(new THREE.BoxGeometry(2.32, 0.6, 1.4).translate(0, 2.5, 0.75), glass), paint(new THREE.BoxGeometry(3.6, 1.1, 0.25).translate(0, 0.65, 3.2), (x, y, z, c) => c.setRGB(0.95, 0.75, 0.1)),
  ]);
}
// a small hut: timber box, white roof, a lit window; footprint 6 x 5 m
function hutGeo() {
  const wood = (x, y, z, c) => c.setRGB(0.5, 0.32, 0.19), snow = (x, y, z, c) => c.setRGB(0.96, 0.97, 1);
  const roof = new THREE.CylinderGeometry(0.01, 4.4, 2.4, 4, 1).rotateY(Math.PI / 4).scale(1, 1, 0.85).translate(0, 4.6, 0);
  return merge([paint(new THREE.BoxGeometry(6, 3.6, 5).translate(0, 1.6, 0), wood), paint(roof, snow), paint(new THREE.BoxGeometry(2, 1, 0.1).translate(0, 2, -2.53), (x, y, z, c) => c.setRGB(1, 0.78, 0.4))]);
}
