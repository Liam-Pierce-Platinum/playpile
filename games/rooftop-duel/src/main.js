// ROOFTOP DUEL - two-button wobbly rooftop gun duels.
import * as THREE from 'three';
import { Vox, voxGeo, makeMat, U, skyMat, postMat } from './voxel.js';
import { Sfx } from './audio.js';

const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto');
const SKEY = 'rooftop_duel_v1';
const save = { rung: 0, hats: ['none'], hat: 'none', wins: 0, mute: false };
try { Object.assign(save, JSON.parse(localStorage.getItem(SKEY) || '{}')); } catch (e) { }
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { } };
Sfx.muted = Q.has('mute') || save.mute;
const R = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[(Math.random() * a.length) | 0];

// ---------------------------------------------------------------- data
const STAGES = [
  { name: 'TAR ROOF SUNSET', plats: [[-7, 7, 0]], spawn: 4.6, top: '#2b2160', hor: '#ff9a5a', fog: '#e48b6c', sun: '#ffcf9a', hs: '#8879c8', hg: '#6a3a3c', dir: [-0.5, 0.45, 0.75], sky: [0.25, 0.06, -1], glow: 0.55, wall: 0x9a5f4a, roof: 0x3d3639, fric: 7 },
  { name: 'THE GAP', plats: [[-8, -1.1, 0], [1.1, 8, 0]], spawn: 4.4, top: '#3f7fd4', hor: '#d6ebff', fog: '#bad3ec', sun: '#fff1d8', hs: '#9bbfe8', hg: '#6c6457', dir: [0.5, 0.8, 0.5], sky: [-0.4, 0.5, -1], glow: 0, wall: 0xa38f78, roof: 0x57514c, fric: 7 },
  { name: 'NEON HEIGHTS', plats: [[-7, -1.5, 0], [-1.5, 1.5, 0.6], [1.5, 7, 0]], spawn: 4.6, top: '#04051a', hor: '#40205f', fog: '#26163f', sun: '#8b96ff', hs: '#3b418c', hg: '#4a1a40', dir: [0.3, 0.6, 0.75], sky: [0.5, 0.25, -1], glow: 1, wall: 0x3c3652, roof: 0x2c2836, fric: 7, fx: 'neon', stars: 1 },
  { name: 'FROST LEDGE', plats: [[-6.2, 6.2, 0]], spawn: 4, top: '#7aa3d6', hor: '#f6e0cb', fog: '#e2e5ee', sun: '#fff0dc', hs: '#c0d5f2', hg: '#8a8d9c', dir: [-0.4, 0.5, 0.75], sky: [-0.3, 0.08, -1], glow: 0.2, wall: 0x7d8896, roof: 0xe9eef6, fric: 1.8, fx: 'snow' },
  { name: 'STORM DECK', plats: [[-5.6, 5.6, 0]], spawn: 3.7, top: '#1d252e', hor: '#56636f', fog: '#46515c', sun: '#b8c5d4', hs: '#687788', hg: '#2e3137', dir: [0.2, 0.7, 0.6], sky: [0, 0.6, -1], glow: 0.75, wall: 0x5c5650, roof: 0x34363b, fric: 5, fx: 'rain' },
];
const RIVALS = [
  { name: 'ROOKIE RAY', shirt: 0x3f8fe0, pants: 0x2b3a55, skin: 0xf0c49a, hair: 0x5a3a22, hat: 'cap', hc: 0xe0453a, skill: 0.12, stage: 0 },
  { name: 'BIG TONY', shirt: 0xe9e3d5, pants: 0x3c3c44, skin: 0xd9a074, hair: 0x1c1c1c, hat: 'beanie', hc: 0x2f6d4a, skill: 0.28, stage: 1 },
  { name: 'MONA LEDGE', shirt: 0xd94f8c, pants: 0x25243a, skin: 0xc98a5e, hair: 0x2a1810, hat: 'cowboy', hc: 0x9a6a3a, skill: 0.4, stage: 2 },
  { name: 'SKIP GUTTER', shirt: 0x7bbf4a, pants: 0x4a3a2a, skin: 0xf2d0aa, hair: 0xc9732a, hat: 'cone', hc: 0xff7a1a, skill: 0.5, stage: 3 },
  { name: 'DR. VENT', shirt: 0xf2f2f2, pants: 0x22252e, skin: 0xe6b88f, hair: 0x9a9a9a, hat: 'tophat', hc: 0xb3263a, skill: 0.6, stage: 4 },
  { name: 'CHIMNEY SUE', shirt: 0x8a3a2a, pants: 0x1e2a3a, skin: 0x8d5a3b, hair: 0x140c08, hat: 'horns', hc: 0x9aa0a8, skill: 0.72, stage: 0 },
  { name: 'THE ANTENNA', shirt: 0x3a3a46, pants: 0x18181e, skin: 0xd8b18c, hair: 0xe8e8e8, hat: 'dish', hc: 0xc8ccd4, skill: 0.84, stage: 2 },
  { name: 'BOSS PENTHOUSE', shirt: 0xf2c230, pants: 0x2a1e40, skin: 0xf0c49a, hair: 0x2a1a10, hat: 'crown', hc: 0xf2c230, skill: 0.95, stage: 1 },
];
const HAT_C = { none: 0, cap: 0xe0453a, beanie: 0x2f6d4a, cowboy: 0x9a6a3a, cone: 0xff7a1a, tophat: 0xb3263a, horns: 0x9aa0a8, dish: 0xc8ccd4, crown: 0xf2c230 };
const P1LOOK = { name: 'YOU', shirt: 0xf09a30, pants: 0x30364a, skin: 0xf2c9a0, hair: 0x2b1d14 };
const P2LOOK = { name: 'PLAYER 2', shirt: 0x2fb7a8, pants: 0x3a2a44, skin: 0xc48a60, hair: 0x101010, hat: 'cap', hc: 0x2a2a2a };
const WEAPONS = {
  revolver: { name: 'REVOLVER', spd: 46, kb: 4.7, cd: 0.5, n: 1, spread: 0, life: 1.2, len: 0.55, col: [3, 2.4, 1.2] },
  shotgun: { name: 'SHOTGUN', spd: 34, kb: 2.3, cd: 0.95, n: 6, spread: 0.2, life: 0.34, len: 0.3, col: [3, 2, 1] },
  sniper: { name: 'SNIPER', spd: 95, kb: 8.2, cd: 1.4, n: 1, spread: 0, life: 0.8, len: 1.6, col: [1.6, 2.6, 3] },
  smg: { name: 'BURP GUN', spd: 42, kb: 1.45, cd: 0.1, n: 1, spread: 0.07, life: 1, len: 0.35, col: [3, 2.6, 1.4], auto: true },
  boom: { name: 'BOOM TUBE', spd: 17, kb: 10, cd: 1.6, n: 1, spread: 0, life: 3, len: 0.3, grav: 9, boom: 1.9, col: [3, 1.4, 0.5] },
};
const MUZ = { revolver: 10.5, shotgun: 14.5, sniper: 16.5, smg: 10.5, boom: 13.5 };

// ---------------------------------------------------------------- renderer
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 1200);
const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
const post = postMat(rt.texture);
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
const pq = new THREE.Mesh(tri, post); pq.frustumCulled = false; postScene.add(pq);
const sky = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), skyMat()); sky.frustumCulled = false; scene.add(sky);
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h);
  const pr = renderer.getPixelRatio(); rt.setSize((w * pr) | 0, (h * pr) | 0); post.uniforms.res.value.set(w * pr, h * pr);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---------------------------------------------------------------- stage
let stage = STAGES[0], stageG = null, weather = null;
const disposeTree = (o) => o.traverse((m) => { if (m.geometry) m.geometry.dispose(); if (m.material && m.material !== worldMat) m.material.dispose(); });
const worldMat = makeMat();
const hex = (s) => new THREE.Color(s);
function buildStage(def) {
  if (stageG) { scene.remove(stageG); disposeTree(stageG); }
  if (weather) { scene.remove(weather.obj); weather.obj.geometry.dispose(); weather.obj.material.dispose(); weather = null; }
  stage = def; stageG = new THREE.Group(); scene.add(stageG);
  U.sunDir.value.set(...def.dir).normalize(); U.sunCol.value.copy(hex(def.sun));
  U.skyCol.value.copy(hex(def.hs)); U.gndCol.value.copy(hex(def.hg)); U.fogCol.value.copy(hex(def.fog)); U.glow.value = def.glow;
  sky.material.uniforms.top.value.copy(hex(def.top)); sky.material.uniforms.hor.value.copy(hex(def.hor));
  sky.material.uniforms.sun.value.set(...def.sky).normalize(); sky.material.uniforms.stars.value = def.stars || 0;
  const night = def.glow;
  // roofs the duel is fought on
  for (const [x0, x1, top] of def.plats) {
    const vs = 0.5, w = Math.round((x1 - x0) / vs), h = 46 + top / vs, d = 10;
    const v = new Vox(w, h + 2, d);
    v.box(0, 0, 0, w - 1, h - 1, d - 1, (x, y, z) => {
      if (y === h - 1) return Math.random() < 0.18 ? shade(def.roof, 0.85) : def.roof;
      if (z === d - 1 && y >= h - 3) return 0xb7ad9e;                       // cornice
      if ((z === d - 1 || x === 0 || x === w - 1) && y % 4 === 1 && (x + 1) % 3 !== 0 && y < h - 4)
        return Math.random() < night * 0.45 ? [pick([0xffd38a, 0xffe7b0, 0xfff2d0]), 255] : 0x26303e;
      return y % 4 === 0 ? shade(def.wall, 0.9) : def.wall;
    });
    v.box(0, h, 0, w - 1, h, 0, 0xa49a8c);                                    // back parapet
    if (top > 0) v.box(0, h, d - 1, w - 1, h, d - 1, def.fx === 'neon' ? [0xff3fa8, 255] : 0xa49a8c);
    const m = new THREE.Mesh(voxGeo(v, vs, [0, h, d]), worldMat); m.position.set(x0, top, 1.6); stageG.add(m);
    decorate(x0, x1, top, def);
  }
  // skyline
  for (let i = 0; i < 46; i++) {
    const z = -R(12, 95), x = R(-80, 80), w = (R(4, 12)) | 0, d = (R(4, 10)) | 0, top = R(-14, 22 - z * 0.15), h = (top + 40) | 0;
    if (Math.abs(x) < 9 && z > -18) continue;
    const base = pick([def.wall, shade(def.wall, 0.8), shade(def.wall, 1.15), 0x6a6f7a, 0x8a7a6a]);
    const v = new Vox(w, h, d), lit = night * R(0.25, 0.6);
    v.box(0, 0, 0, w - 1, h - 1, d - 1, (vx, vy, vz) => {
      const face = vz === d - 1 || vx === 0 || vx === w - 1;
      if (face && vy % 3 === 1 && vy < h - 2 && (vx + vz) % 2 === 1) return Math.random() < lit ? [pick([0xffcf7a, 0xffe2a8, 0xbfe0ff]), 255] : 0x1e2632;
      if (def.fx === 'neon' && face && vx === 0 && vz % 5 === 2 && vy > h * 0.5) return [pick([0xff3fa8, 0x3ff0ff, 0xb05cff]), 255];
      return vy === h - 1 ? shade(base, 0.75) : base;
    });
    if (Math.random() < 0.3) v.box(1, h - 1, 1, 1, h - 1, 1, [0xff3030, 255]);       // aviation light
    const m = new THREE.Mesh(voxGeo(v, 1, [w / 2, h, d / 2], 0.03), worldMat); m.position.set(x, top, z); stageG.add(m);
  }
  if (def.fx === 'rain' || def.fx === 'snow') {
    const n = def.fx === 'rain' ? 700 : 500, pos = new Float32Array(n * (def.fx === 'rain' ? 6 : 3));
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const obj = def.fx === 'rain'
      ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x9fb4c8, transparent: true, opacity: 0.45 }))
      : new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.09, transparent: true, opacity: 0.9 }));
    obj.frustumCulled = false; scene.add(obj);
    const P = []; for (let i = 0; i < n; i++) P.push([R(-22, 22), R(-8, 16), R(-8, 5), R(0.5, 1)]);
    weather = { obj, P, rain: def.fx === 'rain' };
  }
}
function shade(c, k) { const r = Math.min(255, ((c >> 16) & 255) * k), g = Math.min(255, ((c >> 8) & 255) * k), b = Math.min(255, (c & 255) * k); return (r << 16) | (g << 8) | b; }
function decorate(x0, x1, top, def) {
  const add = (v, s, x, y, z, o) => { const m = new THREE.Mesh(voxGeo(v, s, o), worldMat); m.position.set(x, y, z); stageG.add(m); };
  const span = x1 - x0;
  for (let x = x0 + R(0.5, 1.5); x < x1 - 1.6; x += R(2.2, 3.8)) {
    const t = Math.random();
    if (t < 0.4) { // AC unit
      const v = new Vox(8, 6, 6); v.box(0, 0, 0, 7, 5, 5, 0x9ea4aa); v.box(1, 1, 5, 6, 4, 5, (a, b) => (a + b) % 2 ? 0x3a3f46 : 0x5a6068); v.box(0, 5, 0, 7, 5, 5, 0xb8bec4);
      add(v, 0.16, x, top, -2.6, [0, 0, 3]);
    } else if (t < 0.6 && span > 6) { // water tower
      const v = new Vox(12, 26, 12); for (const [a, b] of [[1, 1], [10, 1], [1, 10], [10, 10]]) v.box(a, 0, b, a, 10, b, 0x3a3030);
      v.box(1, 11, 1, 10, 21, 10, (a, b, c) => ((a - 5.5) ** 2 + (c - 5.5) ** 2 < 22 ? (b % 4 === 0 ? 0x4a3020 : 0x8a5a36) : -1));
      v.box(2, 22, 2, 9, 23, 9, (a, b, c) => ((a - 5.5) ** 2 + (c - 5.5) ** 2 < 14 - (b - 22) * 8 ? 0x5a3a26 : -1)); v.box(5, 24, 5, 6, 25, 6, 0x3a3030);
      add(v, 0.2, x + 1.2, top, -3.0, [6, 0, 6]); x += 1.5;
    } else if (t < 0.78) { // vent pipes
      const v = new Vox(3, 9, 3); v.box(0, 0, 0, 2, 7, 2, 0x7a7f86); v.box(0, 8, 0, 2, 8, 2, 0x4a4f56); add(v, 0.14, x, top, -2.2, [1.5, 0, 1.5]);
      const v2 = new Vox(3, 6, 3); v2.box(0, 0, 0, 2, 5, 2, 0x8a6a5a); add(v2, 0.14, x + 0.5, top, -2.9, [1.5, 0, 1.5]);
    } else if (def.fx === 'neon') { // sign
      const v = new Vox(14, 8, 1); v.box(0, 0, 0, 13, 7, 0, (a, b) => (a === 0 || a === 13 || b === 0 || b === 7) ? 0x1a1a22 : ((a * 3 + b * 5) % 7 < 3 ? [pick([0xff3fa8, 0x3ff0ff]), 255] : 0x24222e));
      add(v, 0.2, x, top + 0.6, -3.1, [0, 0, 0]);
    } else { // antenna
      const v = new Vox(3, 30, 3); v.box(1, 0, 1, 1, 29, 1, 0x50545a); v.box(0, 20, 1, 2, 20, 1, 0x50545a); v.box(0, 26, 1, 2, 26, 1, 0x50545a); v.set(1, 29, 1, 0xff3030, 255);
      add(v, 0.12, x, top, -3.0, [1.5, 0, 1.5]);
    }
  }
}
const platsUnder = (x, yPrev) => { let best = null; for (const p of stage.plats) if (x >= p[0] - 0.15 && x <= p[1] + 0.15 && p[2] <= yPrev + 0.02 && (best === null || p[2] > best)) best = p[2]; return best; };
const solidAt = (x, y) => stage.plats.some((p) => x >= p[0] && x <= p[1] && y < p[2] && y > p[2] - 30);
const STAGE_MID = () => { const p = stage.plats; return (p[0][0] + p[p.length - 1][1]) / 2; };

// ---------------------------------------------------------------- particles
const PMAX = 800, one = new Vox(1, 1, 1); one.set(0, 0, 0, 0xffffff);
const pMesh = new THREE.InstancedMesh(voxGeo(one, 1, [0.5, 0.5, 0.5], 0), makeMat({ glow: { value: 1 } }), PMAX);
pMesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(PMAX * 3), 3);
pMesh.frustumCulled = false; pMesh.count = 0; scene.add(pMesh);
const parts = [], dummy = new THREE.Object3D();
function puff(x, y, z, vx, vy, vz, s, col, life, g = 14, drag = 1) {
  if (parts.length >= PMAX) parts.shift();
  parts.push({ x, y, z, vx, vy, vz, s, col, life, max: life, g, drag, rx: R(0, 6), ry: R(0, 6), sp: R(-12, 12) });
}
const rgb = (c, k = 1) => [((c >> 16) & 255) / 255 * k, ((c >> 8) & 255) / 255 * k, (c & 255) / 255 * k];
function burst(x, y, n, col, spd, s = 0.12, life = 0.9, g = 14) { for (let i = 0; i < n; i++) puff(x, y, R(-0.3, 0.3), R(-1, 1) * spd, R(-0.3, 1) * spd, R(-0.6, 0.6) * spd, s * R(0.6, 1.3), col, life * R(0.6, 1.2), g); }
function updParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i]; p.life -= dt; if (p.life <= 0) { parts.splice(i, 1); continue; }
    const py = p.y; p.vy -= p.g * dt; const dr = Math.exp(-p.drag * dt); p.vx *= dr; p.vz *= dr;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.rx += p.sp * dt;
    if (p.g > 0) { const t = platsUnder(p.x, py); if (t !== null && p.y < t + p.s / 2 && Math.abs(p.z) < 1.8) { p.y = t + p.s / 2; p.vy *= -0.3; p.vx *= 0.6; p.sp *= 0.6; } }
  }
}
function drawParts() {
  const a = pMesh.instanceColor.array;
  parts.forEach((p, i) => {
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx, p.ry, p.rx * 0.7);
    dummy.scale.setScalar(p.s * Math.min(1, (p.life / p.max) * 3)); dummy.updateMatrix(); pMesh.setMatrixAt(i, dummy.matrix);
    a[i * 3] = p.col[0]; a[i * 3 + 1] = p.col[1]; a[i * 3 + 2] = p.col[2];
  });
  pMesh.count = parts.length; pMesh.instanceMatrix.needsUpdate = true; pMesh.instanceColor.needsUpdate = true;
}

// ---------------------------------------------------------------- fighters
const SC = 0.095;
function headVox(L, hat, hc) {
  const v = new Vox(8, 13, 8);
  v.box(1, 0, 1, 6, 5, 6, L.skin); v.box(1, 5, 1, 6, 5, 6, L.hair); v.box(1, 2, 1, 2, 5, 6, L.hair);
  v.box(1, 1, 1, 6, 1, 1, L.skin); v.set(6, 3, 2, 0x16161e); v.set(6, 3, 5, 0x16161e); v.set(6, 4, 2, 0xffffff); v.set(6, 4, 5, 0xffffff);
  v.box(6, 1, 3, 6, 1, 4, shade(L.skin, 0.7)); v.box(7, 2, 3, 7, 2, 4, shade(L.skin, 0.92)); v.set(3, 3, 0, L.skin); v.set(3, 3, 7, L.skin);
  const c = hc || HAT_C[hat] || 0x444444;
  if (hat === 'cap') { v.box(1, 6, 1, 6, 6, 6, c); v.box(2, 7, 2, 5, 7, 5, c); v.box(7, 6, 1, 7, 6, 6, shade(c, 0.8)); }
  else if (hat === 'beanie') { v.box(1, 6, 1, 6, 7, 6, c); v.box(1, 5, 1, 6, 5, 6, shade(c, 0.8)); v.box(3, 8, 3, 4, 8, 4, 0xf4f4f4); }
  else if (hat === 'tophat') { v.box(0, 6, 0, 7, 6, 7, 0x1a1a1e); v.box(1, 7, 1, 6, 11, 6, 0x1a1a1e); v.box(1, 7, 1, 6, 7, 6, c); }
  else if (hat === 'cowboy') { v.box(0, 6, 0, 7, 6, 7, c); v.box(2, 7, 2, 5, 8, 5, c); v.box(2, 7, 2, 5, 7, 5, shade(c, 0.6)); v.set(0, 7, 0, c); v.set(7, 7, 7, c); v.set(0, 7, 7, c); v.set(7, 7, 0, c); }
  else if (hat === 'cone') { v.box(0, 6, 0, 7, 6, 7, c); v.box(2, 7, 2, 5, 8, 5, c); v.box(2, 8, 2, 5, 8, 5, 0xf4f4f4); v.box(3, 9, 3, 4, 11, 4, c); }
  else if (hat === 'horns') { v.box(1, 6, 1, 6, 6, 6, c); v.box(2, 7, 2, 5, 7, 5, c); v.box(3, 5, 0, 4, 7, 0, 0xefe6cc); v.box(3, 5, 7, 4, 7, 7, 0xefe6cc); v.set(3, 8, 0, 0xefe6cc); v.set(3, 8, 7, 0xefe6cc); }
  else if (hat === 'dish') { v.box(1, 6, 1, 6, 6, 6, 0x50545a); v.box(3, 7, 3, 4, 9, 4, 0x50545a); v.box(1, 10, 1, 6, 10, 6, c); v.box(3, 11, 3, 4, 11, 4, c); v.set(3, 12, 3, 0xff3030, 255); }
  else if (hat === 'crown') { v.box(1, 6, 1, 6, 6, 6, c); for (let i = 1; i <= 6; i += 1) { v.set(i, 7, 1, i % 2 ? c : -1); v.set(i, 7, 6, i % 2 ? c : -1); v.set(1, 7, i, i % 2 ? c : -1); v.set(6, 7, i, i % 2 ? c : -1); } v.set(6, 6, 3, 0xff2a4a, 200); v.set(6, 6, 4, 0x3a8aff, 200); }
  return v;
}
function armVox(L, gun) {
  const v = new Vox(17, 5, 2), d = 0x2b2d33, m = 0x4a4d55, w = 0x7a4a2a;
  v.box(0, 1, 0, 3, 2, 1, L.shirt); v.box(4, 1, 0, 5, 2, 1, L.skin);
  if (gun === 'revolver') { v.box(5, 2, 0, 7, 3, 1, m); v.box(8, 3, 0, 10, 3, 1, d); v.box(5, 0, 0, 5, 1, 1, w); }
  else if (gun === 'shotgun') { v.box(5, 1, 0, 7, 3, 1, m); v.box(8, 3, 0, 14, 3, 1, d); v.box(9, 2, 0, 12, 2, 1, w); v.box(2, 2, 0, 3, 3, 1, w); }
  else if (gun === 'sniper') { v.box(5, 1, 0, 9, 3, 1, 0x3d4a3a); v.box(10, 2, 0, 16, 2, 1, d); v.box(6, 4, 0, 9, 4, 1, 0x111114); v.set(9, 4, 0, 0x66ccff, 220); v.set(9, 4, 1, 0x66ccff, 220); }
  else if (gun === 'smg') { v.box(5, 1, 0, 9, 3, 1, d); v.box(7, 0, 0, 8, 0, 1, m); v.box(10, 2, 0, 10, 2, 1, m); }
  else { v.box(3, 3, 0, 13, 4, 1, 0x55703a); v.box(13, 2, 0, 13, 4, 1, 0xe07a2a); v.box(6, 2, 0, 7, 2, 1, d); }
  return v;
}
class Fighter {
  constructor(look, f) {
    this.look = look; this.f = f; this.mat = makeMat();
    this.root = new THREE.Group(); this.lean = new THREE.Group(); this.model = new THREE.Group();
    this.root.add(this.lean); this.lean.add(this.model); this.model.rotation.y = f > 0 ? 0 : Math.PI;
    const zs = f > 0 ? 1 : -1, L = look, mk = (v, o) => new THREE.Mesh(voxGeo(v, SC, o), this.mat);
    const leg = new Vox(3, 7, 3); leg.box(0, 2, 0, 2, 6, 2, L.pants); leg.box(0, 0, 0, 2, 1, 2, 0x2a2626); leg.set(2, 0, 1, 0xdedede);
    this.legA = mk(leg, [1.5, 7, 1.5]); this.legB = mk(leg, [1.5, 7, 1.5]);
    this.legA.position.set(0, 7 * SC, 0.15 * zs); this.legB.position.set(0, 7 * SC, -0.15 * zs);
    const t = new Vox(5, 7, 4); t.box(0, 0, 0, 4, 6, 3, L.shirt); t.box(0, 0, 0, 4, 0, 3, 0x3a2a1e); t.box(4, 1, 1, 4, 6, 2, shade(L.shirt, 1.18)); t.box(0, 6, 1, 4, 6, 2, shade(L.shirt, 0.85));
    this.torso = mk(t, [2.5, 0, 2]); this.torso.position.y = 7 * SC;
    this.head = mk(headVox(L, look.hat || 'none', look.hc), [4, 0, 4]); this.head.position.y = 14 * SC;
    const ba = new Vox(2, 6, 2); ba.box(0, 1, 0, 1, 5, 1, L.shirt); ba.box(0, 0, 0, 1, 0, 1, L.skin);
    this.backArm = mk(ba, [1, 6, 1]); this.backArm.position.set(0, 13.3 * SC, -0.28 * zs);
    this.model.add(this.legA, this.legB, this.torso, this.head, this.backArm);
    this.arms = {}; this.zs = zs;
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(0.42, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: 0.35, depthWrite: false }));
    this.shadow.rotation.x = -Math.PI / 2; scene.add(this.root, this.shadow);
  }
  setGun(g) {
    if (!this.arms[g]) { const m = new THREE.Mesh(voxGeo(armVox(this.look, g), SC, [0.5, 1.5, 1]), this.mat); m.position.set(0, 13 * SC, 0.27 * this.zs); this.arms[g] = m; this.model.add(m); }
    for (const k in this.arms) this.arms[k].visible = k === g; this.gun = g; this.arm = this.arms[g];
  }
  dispose() { scene.remove(this.root, this.shadow); disposeTree(this.root); this.shadow.geometry.dispose(); this.shadow.material.dispose(); this.mat.dispose(); }
  reset(x) {
    Object.assign(this, { x, y: platsUnder(x, 5) ?? 0, vx: 0, vy: 0, ang: R(-0.05, 0.05), angV: 0, ground: true, fallen: false, out: false, cd: 0.4, ph: R(0, 6), air: 0, sq: 1, sqV: 0, flash: 0, hb: 0, fallT: 0, ai: { t: 0.5 } });
  }
  get aimA() { return this.fallen ? -0.7 : 0.34 * Math.sin(T * 2.3 + this.ph) - 0.03; }
  dir() { const a = this.aimA, dx = this.f * Math.cos(a), dy = Math.sin(a), c = Math.cos(this.ang), s = Math.sin(this.ang); return { x: dx * c + dy * s, y: -dx * s + dy * c }; }
  muzzle() { const d = this.dir(), k = (MUZ[this.gun] - 0.5) * SC, h = 13 * SC; return { x: this.x + h * Math.sin(this.ang) + d.x * k, y: this.y + h * Math.cos(this.ang) + d.y * k }; }
  jump() {
    if (!this.ground || this.out) return;
    if (this.fallen) { const s = Math.sign(this.ang); this.fallen = false; this.ang = s * 0.85; this.angV = -s * 5.5; this.vy = 6; }
    else { this.vy = 7.6 * Math.cos(this.ang) + 0.6; this.vx += 7.6 * Math.sin(this.ang) * 0.8; this.angV += -this.ang * 2 + R(-0.8, 0.8); }
    this.ground = false; this.sqV = 6; Sfx.jump(); burst(this.x, this.y + 0.05, 6, rgb(0xbdb3a6), 1.6, 0.08, 0.5);
  }
  tryFire() {
    if (this.cd > 0 || this.fallen || this.out) return;
    const w = WEAPONS[this.gun], d = this.dir(), m = this.muzzle(); this.cd = w.cd;
    for (let i = 0; i < w.n; i++) {
      const a = Math.atan2(d.y, d.x) + (w.n > 1 ? (i / (w.n - 1) - 0.5) * 2 * w.spread + R(-0.03, 0.03) : R(-w.spread, w.spread)), sp = w.spd * (w.n > 1 ? R(0.85, 1.1) : 1);
      bullets.push({ x: m.x, y: m.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: w.life, owner: this, w, mesh: tracer(w) });
    }
    this.vx -= d.x * w.kb * 0.12; this.angV -= this.f * w.kb * 0.08;
    for (let i = 0; i < 7; i++) puff(m.x + d.x * 0.1, m.y + d.y * 0.1, 0.27 * 0, d.x * R(2, 7) + R(-1, 1), d.y * R(2, 7) + R(-1, 1), R(-1, 1), R(0.06, 0.14), [3, 2.2, 0.8], R(0.05, 0.12), 0, 6);
    puff(m.x - d.x * 0.5, m.y, 0.2, -this.f * R(1, 2), R(2, 4), R(0, 1), 0.05, [1.6, 1.3, 0.5], 1.2, 16);
    for (let i = 0; i < 2; i++) puff(m.x, m.y, 0, d.x * R(0.5, 1), R(0.4, 1), 0, R(0.15, 0.25), rgb(0xb8b0a8, 0.9), R(0.4, 0.8), -1.2, 2);
    Sfx.shot(this.gun); shake = Math.max(shake, w.kb * 0.012);
  }
  step(dt) {
    this.cd -= dt; this.flash = Math.max(0, this.flash - dt * 6);
    const px = this.x, py = this.y;
    if (this.out) { this.vy -= 20 * dt; this.x += this.vx * dt; this.y += this.vy * dt; this.ang += this.angV * dt; return; }
    if (this.ground) {
      if (this.fallen) { const tg = (Math.sign(this.ang) || 1) * 1.45; this.angV += ((tg - this.ang) * 30 - this.angV * 6) * dt; this.vx *= Math.exp(-stage.fric * 1.4 * dt); }
      else {
        const wob = Math.sin(T * 1.9 + this.ph) * 1.7 + Math.sin(T * 3.1 + this.ph * 2) * 0.9;
        this.angV += (-15 * this.ang - 2.2 * this.angV + wob + 6 * Math.sin(this.ang)) * dt; this.vx *= Math.exp(-stage.fric * dt);
      }
      if (platsUnder(this.x, this.y) !== this.y || !stage.plats.some((p) => this.x >= p[0] - 0.15 && this.x <= p[1] + 0.15 && Math.abs(p[2] - this.y) < 0.01)) this.ground = false;
    } else { this.vy -= 20 * dt; this.angV += (-3.5 * this.ang - 0.6 * this.angV) * dt; }
    this.x += this.vx * dt; this.y += this.vy * dt; this.ang += this.angV * dt;
    if (Math.abs(this.ang) > 1.6) { this.ang = Math.sign(this.ang) * 1.6; this.angV *= -0.3; }
    for (const p of stage.plats) if (p[2] > this.y + 0.05 && this.x + 0.22 > p[0] && this.x - 0.22 < p[1]) { this.x = px < (p[0] + p[1]) / 2 ? p[0] - 0.22 : p[1] + 0.22; this.vx *= -0.3; }
    if (!this.ground && this.vy <= 0) {
      const t = platsUnder(this.x, py);
      if (t !== null && this.y <= t) {
        this.y = t; this.vy = 0; this.ground = true; this.vx *= 0.6; this.sqV = -5; Sfx.land();
        if (!this.fallen && Math.abs(this.ang) > 1.1) { this.fallen = true; shake = Math.max(shake, 0.15); burst(this.x, t + 0.1, 10, rgb(0xbdb3a6), 2.5, 0.1, 0.6); }
        else { this.angV *= 0.5; burst(this.x, t + 0.05, 5, rgb(0xbdb3a6), 1.4, 0.08, 0.5); }
      }
    }
    if (this.y < -2.5 && !this.out) { this.out = true; this.fallT = 0; Sfx.fall(); }
  }
  sync(dt) {
    this.root.position.set(this.x, this.y, 0); this.lean.rotation.z = -this.ang;
    this.air += ((this.ground ? 0 : 1) - this.air) * Math.min(1, dt * 10);
    this.legA.rotation.z = this.air * 0.55; this.legB.rotation.z = -this.air * 0.45;
    this.sqV += (-(this.sq - 1) * 180 - this.sqV * 12) * dt; this.sq += this.sqV * dt;
    this.model.scale.set(1 + (1 - this.sq) * 0.6, this.sq, 1);
    this.hb += (THREE.MathUtils.clamp(this.angV * 0.05 * this.f, -0.4, 0.4) - this.hb) * Math.min(1, dt * 8);
    this.head.rotation.z = this.hb; this.backArm.rotation.z = -0.15 - this.air * 0.8 + Math.sin(T * 2 + this.ph) * 0.08;
    if (this.arm) this.arm.rotation.z = this.aimA;
    this.mat.uniforms.flash.value = this.flash;
    const t = platsUnder(this.x, this.y + 0.01);
    this.shadow.visible = t !== null && !this.out;
    if (t !== null) { this.shadow.position.set(this.x + Math.sin(this.ang) * 0.5, t + 0.02, 0); const k = 1 / (1 + (this.y - t) * 0.6); this.shadow.scale.setScalar(k * (1 + Math.abs(Math.sin(this.ang)) * 0.6)); this.shadow.material.opacity = 0.35 * k; }
  }
  bodyDist(px, py) { // distance from point to the body capsule; returns [dist, height 0..1]
    const s = Math.sin(this.ang), c = Math.cos(this.ang), ax = this.x + 0.2 * s, ay = this.y + 0.2 * c, bx = this.x + 1.85 * s, by = this.y + 1.85 * c;
    const dx = bx - ax, dy = by - ay, t = THREE.MathUtils.clamp(((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy), 0, 1);
    return [Math.hypot(px - ax - dx * t, py - ay - dy * t), t];
  }
  push(dx, dy, kb, h) {
    if (this.out) return;
    if (this.fallen) { this.vx += dx * kb * 0.8; return; }
    this.vx += dx * kb; this.vy = Math.max(this.vy, 1.3 + Math.max(0, dy) * kb * 0.4); this.ground = false;
    this.angV += dx * kb * (0.6 + 1.6 * h);
  }
}

// ---------------------------------------------------------------- bullets
const bullets = [], tracerPool = [];
const trGeo = (() => { const v = new Vox(1, 1, 1); v.set(0, 0, 0, 0xffffff, 255); return voxGeo(v, 1, [0.5, 0.5, 0.5], 0); })();
const trMats = {};
function tracer(w) {
  const m = tracerPool.pop() || new THREE.Mesh(trGeo);
  const k = w.name; if (!trMats[k]) { trMats[k] = makeMat({ glow: { value: 1 } }); trMats[k].uniforms.flash.value = 0; trMats[k].uniforms.fogFar = { value: 9999 }; trMats[k]._c = w.col; }
  m.material = trMats[k]; m.scale.set(w.len, w.boom ? 0.26 : 0.06, w.boom ? 0.26 : 0.06); m.visible = true; scene.add(m); return m;
}
const freeTracer = (b) => { scene.remove(b.mesh); tracerPool.push(b.mesh); };
function explode(x, y, w, owner) {
  Sfx.boom(); shake = 0.6; hitFx = 1; hitStop = 0.07;
  for (let i = 0; i < 40; i++) puff(x, y, R(-0.5, 0.5), R(-8, 8), R(-3, 9), R(-3, 3), R(0.12, 0.3), pick([[3, 1.6, 0.4], [3, 2.4, 0.9], rgb(0x3a3532)]), R(0.3, 1), 6, 2);
  for (let i = 0; i < 10; i++) puff(x, y, 0, R(-2, 2), R(0, 3), R(-1, 1), R(0.4, 0.7), rgb(0x4a4440), R(0.8, 1.6), -2, 1.5);
  for (const F of fighters) {
    const [d, h] = F.bodyDist(x, y); if (d > w.boom) continue;
    const k = (1 - d / w.boom) * w.kb, cx = F.x + Math.sin(F.ang) * 0.9 - x, cy = F.y + Math.cos(F.ang) * 0.9 - y, l = Math.hypot(cx, cy) || 1;
    F.push(cx / l, cy / l + 0.3, k, h); F.flash = 1; if (F !== owner) bump(owner);
  }
}
function updBullets(dt) {
  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i]; let dead = false; b.life -= dt;
    for (let s = 0; s < 4 && !dead; s++) {
      const h = dt / 4; b.vy -= (b.w.grav || 0) * h; b.x += b.vx * h; b.y += b.vy * h;
      for (const F of fighters) {
        if (F === b.owner || F.out) continue;
        const [d, hh] = F.bodyDist(b.x, b.y); if (d > 0.3) continue;
        if (b.w.boom) { explode(b.x, b.y, b.w, b.owner); dead = true; break; }
        const l = Math.hypot(b.vx, b.vy), dx = b.vx / l, dy = b.vy / l;
        F.push(dx, dy, b.w.kb * (0.8 + 0.5 * hh), hh); F.flash = 1; bump(b.owner);
        const c = hh > 0.82 ? 0xffe9a0 : F.look.shirt;
        for (let k = 0; k < 9; k++) puff(b.x, b.y, R(-0.2, 0.3), dx * R(1, 5) + R(-2, 2), R(0, 5), R(-2, 2), R(0.06, 0.13), rgb(c), R(0.5, 1.1));
        Sfx.hit(); if (hh > 0.82) Sfx.ding(); hitStop = Math.max(hitStop, b.w.kb > 5 ? 0.09 : 0.045); shake = Math.max(shake, 0.12 + b.w.kb * 0.025); hitFx = Math.max(hitFx, 0.6);
        dead = true; break;
      }
      if (!dead && solidAt(b.x, b.y)) {
        if (b.w.boom) explode(b.x, b.y, b.w, b.owner);
        else for (let k = 0; k < 5; k++) puff(b.x, b.y + 0.05, 0, R(-3, 3), R(1, 5), R(-1, 1), 0.06, pick([[3, 2.2, 0.8], rgb(stage.roof, 1.2)]), R(0.2, 0.5));
        dead = true;
      }
    }
    if (b.w.boom && !dead) puff(b.x, b.y, 0, R(-0.5, 0.5), R(0, 1), 0, R(0.1, 0.2), rgb(0x8a847e), 0.6, -1, 2);
    if (dead || b.life <= 0 || b.y < -30) { if (!dead && b.w.boom && b.life <= 0) explode(b.x, b.y, b.w, b.owner); freeTracer(b); bullets.splice(i, 1); continue; }
    b.mesh.position.set(b.x - b.vx * 0.006, b.y - b.vy * 0.006, 0.27); b.mesh.rotation.set(0, 0, Math.atan2(b.vy, b.vx));
    b.mesh.material.uniforms.flash.value = 0;
  }
}
function bump(owner) { if (owner) owner.hits = (owner.hits || 0) + 1; }

// ---------------------------------------------------------------- bot
function bot(F, E, dt, skill) {
  const I = { jump: false, shoot: false, held: false }; F.ai.t -= dt;
  if (F.ai.t > 0) return I;
  F.ai.t = 0.3 - skill * 0.2 + R(0, 0.1);
  if (F.fallen) { I.jump = Math.random() < 0.35 + skill * 0.6; return I; }
  if (F.cd <= 0 && !E.out) {
    const m = F.muzzle(), d = F.dir();
    if (d.x * (E.x - m.x) > 0) {
      const t = (E.x - m.x) / d.x, py = m.y + d.y * t - (WEAPONS[F.gun].grav ? 0.5 * WEAPONS[F.gun].grav * (t / WEAPONS[F.gun].spd) ** 2 * 1 : 0);
      if (Math.abs(py - (E.y + 0.95 * Math.cos(E.ang))) < 0.5 + (1 - skill) * 0.3 && Math.random() < 0.4 + skill * 0.6) I.shoot = I.held = true;
    }
    if (Math.random() < 0.06 * (1 - skill)) I.shoot = true;
  }
  if (F.ground) {
    const p = stage.plats.find((q) => F.x >= q[0] - 0.15 && F.x <= q[1] + 0.15) || stage.plats[0];
    const c = Math.sign(STAGE_MID() - F.x) || 1, edge = c > 0 ? F.x - p[0] : p[1] - F.x;
    if (edge < 1.8 && Math.sign(F.ang) === c && Math.abs(F.ang) > 0.1 && Math.random() < 0.25 + skill * 0.75) I.jump = true;
    if (bullets.some((b) => b.owner !== F && Math.sign(b.vx) === Math.sign(F.x - b.x) && Math.abs(F.x - b.x) / Math.abs(b.vx) < 0.35 && Math.abs(b.y - F.y - 1) < 0.9) && Math.random() < skill * 0.45 && edge > 1.5) I.jump = true;
  }
  return I;
}

// ---------------------------------------------------------------- game state
let T = 0, state = 'boot', stateT = 0, shake = 0, hitStop = 0, hitFx = 0, slow = 0;
let fighters = [], mode = 'arcade', rival = RIVALS[0], score = [0, 0], target = 3, round = 0, weapon = 'revolver', windOn = false;
const keys = [{ jp: 0, sp: 0, sh: 0 }, { jp: 0, sp: 0, sh: 0 }];
const $ = (id) => document.getElementById(id);
const isBot = (i) => AUTO || (i === 1 && mode !== '2p');

function startMatch(m, rung) {
  mode = m; score = [0, 0]; round = 0;
  fighters.forEach((F) => F.dispose());
  let st;
  if (m === '2p') { rival = { ...P2LOOK }; target = 5; st = pick(STAGES); }
  else if (m === 'bot') { rival = RIVALS[(Math.random() * (save.rung + 1)) | 0]; target = 5; st = pick(STAGES); }
  else { rival = RIVALS[rung ?? Math.min(save.rung, RIVALS.length - 1)]; target = 3; st = STAGES[rival.stage]; }
  buildStage(st);
  fighters = [new Fighter({ ...P1LOOK, hat: save.hat, hc: HAT_C[save.hat] }, 1), new Fighter(rival, -1)];
  $('n1').textContent = m === '2p' ? 'PLAYER 1' : 'YOU'; $('n2').textContent = rival.name;
  document.body.classList.toggle('duo', m === '2p'); document.body.classList.toggle('solo', m !== '2p');
  hidePanel(); Sfx.music = true; nextRound();
}
function nextRound() {
  round++; bullets.splice(0).forEach(freeTracer); parts.length = 0; windOn = false;
  const order = ['revolver', 'shotgun', 'sniper', 'smg', 'boom'];
  weapon = round === 1 ? 'revolver' : pick(order.filter((w) => w !== weapon));
  const sp = stage.spawn; fighters[0].reset(STAGE_MID() - sp); fighters[1].reset(STAGE_MID() + sp);
  fighters.forEach((F) => F.setGun(weapon));
  state = 'intro'; stateT = 1.3; pips();
  banner(score[0] === target - 1 && score[1] === target - 1 ? 'MATCH POINT' : 'ROUND ' + round, WEAPONS[weapon].name + ' &middot; ' + stage.name); Sfx.bell();
}
function endRound() {
  const [a, b] = fighters;
  if (a.out && !b.out) score[1]++; else if (b.out && !a.out) score[0]++;
  pips();
  if (score[0] >= target || score[1] >= target) return endMatch(score[0] >= target);
  nextRound();
}
function endMatch(p1won) {
  state = 'result'; Sfx.music = false; stats.matches++;
  if (AUTO) { stats.results.push(score.join('-')); stats.t.push(+T.toFixed(0)); startMatch('arcade', (Math.random() * 8) | 0); return; }
  let title, sub = '', btns = [];
  if (mode === '2p') { title = (p1won ? 'PLAYER 1' : 'PLAYER 2') + ' WINS'; btns = [['rematch', 'REMATCH'], ['menu', 'MENU']]; }
  else if (p1won) {
    save.wins++; title = 'YOU WIN';
    if (mode === 'arcade') {
      const idx = RIVALS.indexOf(rival);
      if (rival.hat && !save.hats.includes(rival.hat)) { save.hats.push(rival.hat); sub = 'NEW HAT UNLOCKED: ' + rival.hat.toUpperCase(); }
      if (idx === save.rung && save.rung < RIVALS.length - 1) save.rung++;
      else if (idx === RIVALS.length - 1) sub = (sub ? sub + '<br>' : '') + 'YOU OWN THE SKYLINE. CHAMPION!';
      btns = idx < RIVALS.length - 1 ? [['next', 'NEXT RIVAL: ' + RIVALS[idx + 1].name], ['menu', 'MENU']] : [['rematch', 'REMATCH'], ['menu', 'MENU']];
    } else btns = [['again', 'ANOTHER DUEL'], ['menu', 'MENU']];
    Sfx.ko();
  } else { title = rival.name + ' WINS'; sub = 'Lean in, then jump to get back from the edge.'; btns = [['rematch', 'TRY AGAIN'], ['menu', 'MENU']]; Sfx.lose(); }
  persist();
  showPanel(`<h2>${title}</h2><p class="score">${score[0]} &ndash; ${score[1]}</p>${sub ? `<p class="sub">${sub}</p>` : ''}` + btns.map(([a, t]) => `<button data-a="${a}">${t}</button>`).join(''));
}
function act(a) {
  Sfx.init(); Sfx.click();
  if (a === 'arcade') startMatch('arcade');
  else if (a === 'bot' || a === 'again') startMatch('bot');
  else if (a === '2p') startMatch('2p');
  else if (a === 'rematch') startMatch(mode, mode === 'arcade' ? RIVALS.indexOf(rival) : undefined);
  else if (a === 'next') startMatch('arcade', RIVALS.indexOf(rival) + 1);
  else if (a === 'menu') showMenu();
  else if (a === 'resume') { hidePanel(); state = prevState; }
  else if (a === 'hat') { const i = save.hats.indexOf(save.hat); save.hat = save.hats[(i + 1) % save.hats.length]; persist(); showMenu(); if (fighters[0]) { const F = fighters[0], old = { ...F }; F.dispose(); const N = new Fighter({ ...P1LOOK, hat: save.hat, hc: HAT_C[save.hat] }, 1); Object.assign(N, { x: old.x, y: old.y, vx: 0, vy: 0, ang: old.ang, angV: 0, ground: old.ground, fallen: old.fallen, out: old.out, cd: 0, ph: old.ph, air: 0, sq: 1, sqV: 0, flash: 0, hb: 0, ai: { t: 0 } }); N.setGun(weapon); fighters[0] = N; } }
  else if (a === 'snd') { save.mute = !Sfx.muted; Sfx.setMuted(save.mute); persist(); showMenu(); }
}
let prevState = 'fight';
function showMenu() {
  if (state !== 'menu') prevState = state; state = 'menu';
  const r = RIVALS[Math.min(save.rung, RIVALS.length - 1)], live = fighters.length && prevState !== 'result' && prevState !== 'boot';
  showPanel(`<h1>ROOFTOP<span>DUEL</span></h1>` + (live ? `<button data-a="resume">RESUME</button>` : '') +
    `<button data-a="arcade">ARCADE <small>vs ${r.name} &middot; rival ${save.rung + 1}/8</small></button>
     <button data-a="bot">QUICK DUEL <small>random rival &amp; rooftop, first to 5</small></button>
     <button data-a="2p">2 PLAYERS <small>one keyboard or one phone</small></button>
     <div class="row"><button data-a="hat">HAT: ${save.hat.toUpperCase()} <small>${save.hats.length}/9</small></button><button data-a="snd">SOUND: ${Sfx.muted ? 'OFF' : 'ON'}</button></div>
     <p class="keys">P1 &nbsp;<b>W</b> jump &nbsp;<b>D</b> fire &nbsp;&middot;&nbsp; P2 &nbsp;<b>&uarr;</b> jump &nbsp;<b>&larr;</b> fire<br>Knock them off the roof. Jump the way you lean.</p>`);
}
function showPanel(html) { document.body.classList.toggle('nohud', !fighters.length); const p = $('panel'); p.innerHTML = html; p.classList.remove('hide'); }
function hidePanel() { $('panel').classList.add('hide'); }
$('panel').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) act(b.dataset.a); });
$('menuBtn').addEventListener('click', () => { Sfx.init(); state === 'menu' ? act('resume') : showMenu(); });
function pips() {
  for (let i = 0; i < 2; i++) $('p' + (i + 1)).innerHTML = Array.from({ length: target }, (_, k) => `<i class="${k < score[i] ? 'on' : ''}"></i>`).join('');
  $('wep').textContent = WEAPONS[weapon].name;
}
function banner(t, sub) { const b = $('banner'); b.innerHTML = `<b>${t}</b>${sub ? `<small>${sub}</small>` : ''}`; b.classList.remove('show'); void b.offsetWidth; b.classList.add('show'); }

// ---------------------------------------------------------------- input
const K1J = ['KeyW'], K1S = ['KeyD'], K2J = ['ArrowUp'], K2S = ['ArrowLeft'];
const SOLO_J = ['KeyW', 'Space', 'ArrowUp'], SOLO_S = ['KeyD', 'KeyF', 'KeyJ', 'Enter', 'ArrowRight', 'ArrowLeft'];
function keyMap(code) {
  if (mode === '2p') { if (K1J.includes(code)) return [0, 'j']; if (K1S.includes(code)) return [0, 's']; if (K2J.includes(code)) return [1, 'j']; if (K2S.includes(code)) return [1, 's']; return null; }
  if (SOLO_J.includes(code)) return [0, 'j']; if (SOLO_S.includes(code)) return [0, 's']; return null;
}
addEventListener('keydown', (e) => {
  Sfx.init();
  if (e.code === 'Escape' || e.code === 'KeyP') { state === 'menu' ? (fighters.length && act('resume')) : showMenu(); return; }
  if (state === 'menu' || state === 'result') { if (e.code === 'Enter' || e.code === 'Space') { const b = $('panel').querySelector('button'); if (b) b.click(); e.preventDefault(); } return; }
  const m = keyMap(e.code); if (!m) return; e.preventDefault(); if (e.repeat) return;
  const k = keys[m[0]]; if (m[1] === 'j') k.jp = 1; else { k.sp = 1; k.sh = 1; }
});
addEventListener('keyup', (e) => { const m = keyMap(e.code); if (m && m[1] === 's') keys[m[0]].sh = 0; });
const touch = 'ontouchstart' in window || Q.has('touch');
if (touch) document.body.classList.add('touch');
document.querySelectorAll('#touch [data-k]').forEach((el) => {
  const [p, t] = el.dataset.k.split('');
  const down = (e) => { e.preventDefault(); Sfx.init(); if (state !== 'fight' && state !== 'intro' && state !== 'ko') return; const i = mode === '2p' ? +p : 0; if (mode !== '2p' && p === '1') return; if (t === 'j') keys[i].jp = 1; else { keys[i].sp = 1; keys[i].sh = 1; } el.classList.add('on'); };
  const up = (e) => { e.preventDefault(); const i = mode === '2p' ? +p : 0; if (t === 's') keys[i].sh = 0; el.classList.remove('on'); };
  el.addEventListener('pointerdown', down); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('pointerleave', up);
});
addEventListener('pointerdown', () => Sfx.init(), { once: true });

// ---------------------------------------------------------------- loop
const stats = { matches: 0, rounds: 0, results: [], t: [] };
function sim(dt) {
  T += dt; U.time.value = T; stateT -= dt;
  if (state === 'intro' || state === 'fight' || state === 'ko') {
    fighters.forEach((F, i) => {
      let I = { jump: false, shoot: false, held: false };
      if (state === 'fight' && !F.out) {
        if (isBot(i)) I = bot(F, fighters[1 - i], dt, AUTO ? 0.6 : rival.skill);
        else { const k = keys[i]; I = { jump: !!k.jp, shoot: !!k.sp, held: !!k.sh }; }
      }
      keys[i].jp = keys[i].sp = 0;
      if (I.jump) F.jump();
      if (I.shoot || (I.held && WEAPONS[F.gun].auto)) F.tryFire();
      if (windOn && F.ground && !F.fallen) F.vx += Math.sign(F.x - STAGE_MID()) * 1.1 * dt;
      F.step(dt);
    });
  }
  if (state === 'intro' && stateT <= 0) { state = 'fight'; stateT = 0; banner('FIGHT!'); }
  if (state === 'fight') {
    if (stateT < -32 && !windOn) { windOn = true; banner('HIGH WINDS'); Sfx.noise(1.5, 500, 'bandpass', 0.4, 0.5); }
    if (fighters.some((F) => F.out)) { state = 'ko'; stateT = 2.1; slow = 0.9; shake = 0.4; Sfx.ko(); stats.rounds++; const w = fighters.findIndex((F) => !F.out); banner(w < 0 ? 'DOUBLE DROP' : (w === 0 ? fighters[0].look.name === 'YOU' && mode !== '2p' ? 'NICE SHOT' : 'PLAYER 1 SCORES' : rival.name + ' SCORES')); }
  }
  if (state === 'ko' && stateT <= 0) endRound();
  updBullets(dt); updParts(dt);
}
const camPos = new THREE.Vector3(0, 3, 18), camLook = new THREE.Vector3(0, 1, 0);
function render(dt) {
  fighters.forEach((F) => F.sync(dt)); drawParts();
  const live = fighters.filter((F) => !F.out), grp = live.length ? live : fighters;
  let mx = 0; grp.forEach((F) => mx += F.x); mx = grp.length ? mx / grp.length : 0;
  const spread = fighters.length ? Math.abs(fighters[0].x - fighters[1].x) : 9;
  const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), half = Math.max(6.8, spread / 2 + 2.8);
  const dist = Math.max(half / (tanH * camera.aspect), 3.4 / tanH);
  let ly = 1.0; const faller = fighters.find((F) => F.out); if (faller && state === 'ko') ly = Math.max(-9, faller.y * 0.45);
  camPos.lerp(new THREE.Vector3(mx * 0.75 + Math.sin(T * 0.2) * 0.4, ly + 1.4 + dist * 0.07, dist), Math.min(1, dt * 3));
  camLook.lerp(new THREE.Vector3(mx * 0.75, ly, 0), Math.min(1, dt * 3));
  camera.position.copy(camPos).add(new THREE.Vector3(R(-1, 1), R(-1, 1), 0).multiplyScalar(shake * 0.5));
  camera.lookAt(camLook); shake = Math.max(0, shake - dt * 1.6); hitFx = Math.max(0, hitFx - dt * 4);
  sky.position.copy(camera.position);
  if (weather) {
    const a = weather.obj.geometry.attributes.position.array, cx = camera.position.x;
    weather.P.forEach((p, i) => {
      p[1] -= (weather.rain ? 22 : 1.6) * p[3] * dt; if (!weather.rain) p[0] += Math.sin(T + i) * 0.4 * dt;
      if (p[1] < -8) { p[1] = 16; p[0] = cx + R(-22, 22); }
      if (weather.rain) { a.set([p[0], p[1], p[2], p[0] - 0.08, p[1] + 0.55, p[2]], i * 6); } else a.set([p[0], p[1], p[2]], i * 3);
    });
    weather.obj.geometry.attributes.position.needsUpdate = true;
  }
  post.uniforms.time.value = T; post.uniforms.hit.value = hitFx;
  renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
const STEP = 1 / 60;
function tick(real) {
  let ts = 1; if (hitStop > 0) { hitStop -= real; ts = 0.05; } else if (slow > 0) { slow -= real; ts = 0.3; }
  if (state !== 'menu') sim(real * ts);
}
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now;
  acc += dt; let n = 0; while (acc >= STEP && n < 4) { tick(STEP); acc -= STEP; n++; } if (n === 4) acc = 0;
  render(dt);
}

// ---------------------------------------------------------------- boot
if (Q.has('title')) { buildStage(STAGES[0]); showMenu(); } else startMatch(Q.get('mode') === '2p' ? '2p' : 'arcade');
if (!AUTO && !Q.has('title') && !touch) { $('hint').classList.add('show'); setTimeout(() => $('hint').classList.remove('show'), 5000); }
requestAnimationFrame(frame);
window.__G = {
  get state() { return state; }, get score() { return score; }, get fighters() { return fighters; }, stats, startMatch, act,
  fast(sec) { for (let t = 0; t < sec; t += STEP) tick(STEP); render(STEP); },
};
