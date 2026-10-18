// EGGY ROAD - drive over painted hills with an egg in the truck bed. Don't let it touch the ground.
import * as THREE from '../vendor/three.module.js';
import { wash, terrainMat, layerMat, skyMat, postMat, blobTexture, PAPER } from './shaders.js';
import { audio } from './audio.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------- save ----------
const UPS = [
  { id: 'engine', name: 'Engine', info: 'more pull up steep hills', max: 5 },
  { id: 'springs', name: 'Soft springs', info: 'smoother ride, less egg bounce', max: 5 },
  { id: 'basket', name: 'Basket wall', info: 'taller lip behind the egg', max: 5 },
  { id: 'tyres', name: 'Tyres', info: 'more grip, less wheelspin', max: 5 },
];
const COST = [20, 50, 110, 220, 400];
let save = { best: 0, coins: 0, lv: { engine: 0, springs: 0, basket: 0, tyres: 0 }, runs: 0 };
try { const s = JSON.parse(localStorage.getItem('eggy_road_v1')); if (s && s.lv) save = Object.assign(save, s); } catch (e) {}
const persist = () => { try { localStorage.setItem('eggy_road_v1', JSON.stringify(save)); } catch (e) {} };

// ---------- world ----------
const BIOMES = [
  { name: 'Meadow Lane', grass: 0x8fb35a, soil: 0xc08a55, deep: 0x8a5a3c, top: 0x8fbad4, low: 0xf3e2c0, lay: [0xb4cbc0, 0x95b48e, 0x6f9468], leaf: 0x6e9a4a },
  { name: 'Ochre Fields', grass: 0xd2a948, soil: 0xb86a3a, deep: 0x7a3f2a, top: 0xe2ad80, low: 0xf6e6c4, lay: [0xe6caa2, 0xd09a62, 0xb27444], leaf: 0xd27a2e },
  { name: 'Plum Dusk', grass: 0x7d8c5a, soil: 0x8a5a7a, deep: 0x4c3456, top: 0x7d6aa8, low: 0xf0c4a8, lay: [0xbca2c6, 0x8e78a8, 0x665484], leaf: 0x8a4a6a },
  { name: 'Frost Hollow', grass: 0xe4ecee, soil: 0x8fa6b8, deep: 0x5a6e88, top: 0x9dbcd8, low: 0xeef0ec, lay: [0xccd9e4, 0xa8bccc, 0x84a0b8], leaf: 0x4f7476 },
  { name: 'Rose Dunes', grass: 0xe0a890, soil: 0xd08868, deep: 0x9a5a4a, top: 0xe39c96, low: 0xf8e4cc, lay: [0xf0cbb4, 0xe0a890, 0xc08074], leaf: 0x7a9a5a },
];
const BLEN = 350;
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function H(x) {
  const a = sstep(18, 70, x), d = 1 + Math.min(1.6, Math.max(0, x) / 500);
  return a * (2.4 * Math.sin(x * 0.043) + 1.3 * d * Math.sin(x * 0.105 + 1.3) + 0.45 * d * Math.sin(x * 0.26 + 0.4)
    + 0.16 * (d - 1) * Math.sin(x * 0.83 + 2.0)) + x * 0.004;
}
const dH = (x) => (H(x + 0.02) - H(x - 0.02)) / 0.04;

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: Q.has('shot') });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene(); scene.background = PAPER.clone();
const cam = new THREE.PerspectiveCamera(38, 1, 0.5, 900); scene.add(cam);
const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
const post = postMat(); post.uniforms.tScene.value = rt.texture;
const postScene = new THREE.Scene(); const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false);
  const pr = renderer.getPixelRatio(); rt.setSize(w * pr, h * pr); post.uniforms.uRes.value.set(w * pr, h * pr);
  cam.aspect = w / h; cam.fov = w / h < 1 ? 58 : 38; cam.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const sky = new THREE.Mesh(new THREE.PlaneGeometry(1400, 700), skyMat()); sky.position.set(0, 0, -600); cam.add(sky);
const layers = [[-30, 0.8, 6, 0.045, 1], [-75, 2.1, 14, 0.02, 0.7], [-160, 3.3, 30, 0.009, 0.45]].map(([z, seed, amp, fr, par], k) => {
  const W = 420, N = 260, pos = [], top = [], idx = [];
  for (let i = 0; i <= N; i++) { const x = -W + (2 * W * i) / N; pos.push(x, 0, z, x, -260, z); top.push(1, 0); if (i < N) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('aTop', new THREE.Float32BufferAttribute(top, 1)); g.setIndex(idx);
  const m = new THREE.Mesh(g, layerMat(seed, amp, fr)); m.frustumCulled = false; m.renderOrder = -10 + k * -1; m.userData = { par, k }; scene.add(m); return m;
});

// ---------- ground chunks ----------
const CH = 60, STEP = 0.5, ZF = 2.4, ZB = -3.0, DEP = [0, 0.18, 0.4, 0.7, 1.1, 1.7, 2.6, 3.8, 5.5, 8, 12];
const tMat = terrainMat();
const geoTrunk = new THREE.CylinderGeometry(0.1, 0.17, 1.8, 6).translate(0, 0.9, 0);
const geoLeaf = new THREE.IcosahedronGeometry(1, 1);
const geoCoin = new THREE.CylinderGeometry(0.3, 0.3, 0.09, 18).rotateX(Math.PI / 2);
const geoRock = new THREE.DodecahedronGeometry(0.5, 0);
const matTrunk = wash(0x6b4a32), matCoin = wash(0xf2b63c, 0xc0602a), matRock = wash(0xb8a890, 0x6e6478);
const leafMats = BIOMES.map((b) => wash(b.leaf));
const chunks = new Map(), coins = [];
const rnd = (s) => { const x = Math.sin(s * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
function buildChunk(i) {
  const grp = new THREE.Group(), x0 = i * CH, n = CH / STEP, nd = DEP.length;
  const pos = [], aD = [], aT = [], idx = [];
  for (let c = 0; c <= n; c++) { const x = x0 + c * STEP, y = H(x); for (const d of DEP) { pos.push(x, y - d, ZF); aD.push(d); aT.push(0); } }
  for (let c = 0; c < n; c++) for (let j = 0; j < nd - 1; j++) { const a = c * nd + j, b = a + nd; idx.push(a, a + 1, b, b, a + 1, b + 1); }
  const t0 = pos.length / 3;
  for (let c = 0; c <= n; c++) { const x = x0 + c * STEP, y = H(x); pos.push(x, y, ZF, x, y, ZB); aD.push(0, 0); aT.push(1, 1); }
  for (let c = 0; c < n; c++) { const a = t0 + c * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aD', new THREE.Float32BufferAttribute(aD, 1)); g.setAttribute('aTop', new THREE.Float32BufferAttribute(aT, 1)); g.setIndex(idx);
  grp.add(new THREE.Mesh(g, tMat));
  const bi = Math.floor(x0 / BLEN) % BIOMES.length;
  for (let k = 0; k < 6; k++) {
    const s = i * 31 + k, x = x0 + rnd(s) * CH, z = -4 - rnd(s + 0.5) * 9, y = H(x) - 0.2, sc = 0.7 + rnd(s + 0.7) * 0.8;
    if (rnd(s + 0.9) < 0.3) { const r = new THREE.Mesh(geoRock, matRock); r.position.set(x, y + 0.2, z + 3); r.scale.set(sc * 1.3, sc * 0.8, sc); r.rotation.set(rnd(s + 2), rnd(s + 3) * 6, 0); grp.add(r); continue; }
    const t = new THREE.Group(); t.position.set(x, y, z); t.scale.setScalar(sc);
    t.add(new THREE.Mesh(geoTrunk, matTrunk));
    for (let b = 0; b < 3; b++) { const l = new THREE.Mesh(geoLeaf, leafMats[bi]); l.position.set((b - 1) * 0.55, 2.0 + (b === 1 ? 0.6 : 0), (rnd(s + b) - 0.5) * 0.4); l.scale.setScalar(0.75 + (b === 1 ? 0.25 : 0)); t.add(l); }
    grp.add(t);
  }
  for (let x = Math.max(28, Math.ceil(x0 / 9) * 9); x < x0 + CH; x += 9) {
    if (rnd(x) < 0.25) continue;
    const m = new THREE.Mesh(geoCoin, matCoin); m.position.set(x, H(x) + 1.25, 0); grp.add(m);
    coins.push({ x, m, taken: false, chunk: i });
  }
  scene.add(grp); chunks.set(i, grp);
}
function updateChunks(x) {
  const c = Math.floor(x / CH);
  for (let i = c - 1; i <= c + 2; i++) if (i >= -1 && !chunks.has(i)) buildChunk(i);
  for (const [i, g] of chunks) if (i < c - 1 || i > c + 2) {
    scene.remove(g); g.traverse((o) => { if (o.geometry && o.material === tMat) o.geometry.dispose(); }); chunks.delete(i);
    for (let k = coins.length - 1; k >= 0; k--) if (coins[k].chunk === i) coins.splice(k, 1);
  }
}

// ---------- truck + egg visuals ----------
const truck = new THREE.Group(); scene.add(truck);
const mBody = wash(0xd8603e, 0x7a3050), mCab = wash(0xe9e1cc, 0x8a86a8), mGlass = wash(0x9cc7d6, 0x5a7a9a), mDark = wash(0x4a4048, 0x2a2432), mWood = wash(0xc79a5e, 0x7a5040);
const box = (w, h, d, m, x, y, z = 0) => { const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y, z); truck.add(o); return o; };
box(2.9, 0.55, 1.5, mBody, 0, 0.05);
box(0.95, 0.62, 1.4, mCab, 0.68, 0.65);
box(0.5, 0.36, 1.42, mGlass, 0.82, 0.7);
box(0.4, 0.2, 1.46, mBody, 1.25, 0.35);
box(0.32, 0.12, 0.2, wash(0xfff2b0), 1.42, 0.12, 0.55);
const floorV = box(1.62, 0.06, 1.3, mWood, -0.63, 0.36);
const wallV = box(0.08, 1, 1.4, mWood, -1.41, 0.35);
const side1 = box(1.62, 0.18, 0.06, mWood, -0.63, 0.44, 0.68), side2 = box(1.62, 0.18, 0.06, mWood, -0.63, 0.44, -0.68);
const wheelG = new THREE.CylinderGeometry(0.42, 0.42, 0.34, 20).rotateX(Math.PI / 2), hubG = new THREE.CylinderGeometry(0.17, 0.17, 0.36, 6).rotateX(Math.PI / 2);
const wheels = [-1, 1].map(() => { const g = new THREE.Group(); g.add(new THREE.Mesh(wheelG, mDark), new THREE.Mesh(hubG, mCab)); scene.add(g); return g; });
const wheelsB = [-1, 1].map(() => { const g = new THREE.Group(); g.add(new THREE.Mesh(wheelG, mDark), new THREE.Mesh(hubG, mCab)); scene.add(g); return g; });
const eggMat = wash(0xfaf3e2, 0xc8b49a, { grain: 0.4 });
const egg = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), eggMat); scene.add(egg);
const eggFace = new THREE.Group(); egg.add(eggFace);
[-0.09, 0.09].forEach((x) => { const e = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), mDark); e.position.set(x + 0.05, 0.07, 0.27); eggFace.add(e); });

// fx
const dustTex = blobTexture('150,120,90'), yolkTex = blobTexture('240,170,40'), shellTex = blobTexture('250,245,230'), sparkTex = blobTexture('245,190,70');
const fx = [];
function puff(x, y, z, tex, n, spd, size, life) {
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    s.position.set(x, y, z + (Math.random() - 0.5)); const sz = size * (0.6 + Math.random() * 0.8); s.scale.setScalar(sz);
    scene.add(s); fx.push({ s, vx: (Math.random() - 0.5) * spd, vy: Math.random() * spd * 0.8, life, t: 0, sz, g: tex === shellTex ? 9 : 0.5 });
  }
}
const shells = [];
function updateFx(dt) {
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i]; f.t += dt; f.vy -= f.g * dt; f.s.position.x += f.vx * dt; f.s.position.y += f.vy * dt;
    const k = f.t / f.life; f.s.material.opacity = 1 - k; f.s.scale.setScalar(f.sz * (1 + k * 0.8));
    if (k >= 1) { scene.remove(f.s); f.s.material.dispose(); fx.splice(i, 1); }
  }
}

// ---------- sim state ----------
const GRAV = 12, M = 1.3, I = 0.95, MW = 0.12, RW = 0.42, IW = 0.5 * MW * RW * RW, ER = 0.3, EI = 0.4;
let car, wl, eg, state = 'menu', run, thrIn = 0, shakeT = 0, slowmo = 1, flash = 0;
function stats() {
  const L = save.lv;
  return { maxSpin: 14 + L.engine * 2.2, torque: 2.4 + L.engine * 0.45, ku: 55 - L.springs * 5, cu: 4 + L.springs * 0.9, wallH: 0.2 + L.basket * 0.06, mu: 0.95 + L.tyres * 0.13 };
}
let ST = stats();
function segs() {
  const w = ST.wallH;
  return [[-1.45, 0.39, 0.2, 0.39], [-1.45, 0.39, -1.45, 0.39 + w], [0.2, 0.39, 0.2, 0.96], [0.2, 0.96, 1.15, 0.96], [1.15, 0.96, 1.15, 0.45], [1.15, 0.45, 1.45, 0.45]];
}
let SEGS = segs();
const CORNERS = () => [[-1.45, -0.22], [1.45, -0.22], [-1.45, 0.39 + ST.wallH], [1.45, 0.45], [0.2, 0.96], [1.15, 0.96], [-0.6, -0.22], [0.6, -0.22]];
let CRN = CORNERS();
function reset() {
  ST = stats(); SEGS = segs(); CRN = CORNERS();
  wallV.scale.y = ST.wallH + 0.04; wallV.position.y = 0.37 + ST.wallH / 2;
  const x = 4, y = H(x) + 1.05;
  car = { x, y, vx: 0, vy: 0, a: 0, w: 0 };
  wl = [[-1.0, -0.5], [1.0, -0.5]].map(([ox, oy]) => ({ ox, oy, x: x + ox, y: y + oy, vx: 0, vy: 0, s: 0, ang: 0, ground: false, gt: 0 }));
  eg = { x: x - 0.55, y: y + 0.39 + ER + 0.01, vx: 0, vy: 0, w: 0, ang: 0, squash: 0 };
  run = { dist: 0, coins: 0, t: 0, lastX: x, stuckT: 0, flipT: 0, milestone: 1, biome: 0, endT: 0, why: '', airT: 0, hint: !Q.has('title') && save.runs === 0 };
  for (const c of coins) { c.taken = false; c.m.visible = true; }
}
const toW = (lx, ly) => { const c = Math.cos(car.a), s = Math.sin(car.a); return [car.x + lx * c - ly * s, car.y + lx * s + ly * c]; };

function substep(h, thr) {
  const c = Math.cos(car.a), s = Math.sin(car.a);
  car.vy -= GRAV * h; eg.vy -= GRAV * h;
  let impact = 0, eggImpact = 0, onG = 0;
  for (const w of wl) {
    w.vy -= GRAV * h;
    const rx = w.ox * c - w.oy * s, ry = w.ox * s + w.oy * c, ax = car.x + rx, ay = car.y + ry;
    const avx = car.vx - car.w * ry, avy = car.vy + car.w * rx;
    const dx = w.x - ax, dy = w.y - ay, dvx = w.vx - avx, dvy = w.vy - avy;
    const du = -dx * s + dy * c, dq = dx * c + dy * s, vu = -dvx * s + dvy * c, vq = dvx * c + dvy * s;
    let fu = -ST.ku * du - ST.cu * vu; const fq = -1500 * dq - 28 * vq;
    if (du > 0.2) fu -= 900 * (du - 0.2) + 20 * vu; if (du < -0.25) fu -= 900 * (du + 0.25);
    const fx = -fu * s + fq * c, fy = fu * c + fq * s;
    w.vx += (fx / MW) * h; w.vy += (fy / MW) * h;
    car.vx -= (fx / M) * h; car.vy -= (fy / M) * h; car.w -= ((rx * fy - ry * fx) / I) * h;
    if (thr > 0) { if (w.s < ST.maxSpin) w.s = Math.min(ST.maxSpin, w.s + (ST.torque / IW) * h); }
    else if (thr < 0) { if (w.s > 0.3) w.s = Math.max(0, w.s - 260 * h); else if (w.s > -5) w.s -= (ST.torque * 0.5 / IW) * h; }
    else w.s *= 1 - 0.4 * h;
  }
  car.x += car.vx * h; car.y += car.vy * h; car.a += car.w * h;
  car.vx *= 1 - 0.02 * h; car.w *= 1 - 0.3 * h;
  // wheels vs ground
  for (const w of wl) {
    w.x += w.vx * h; w.y += w.vy * h; w.ang += w.s * h;
    const sl = dH(w.x), nl = Math.hypot(1, sl), nx = -sl / nl, ny = 1 / nl;
    const d = (w.y - H(w.x)) * ny - RW;
    w.ground = false;
    if (d < 0) {
      w.ground = true; onG++; w.x -= nx * d; w.y -= ny * d;
      const vn = w.vx * nx + w.vy * ny; let jn = 0;
      if (vn < 0) { w.vx -= nx * vn; w.vy -= ny * vn; jn = -vn * MW; impact = Math.max(impact, -vn); }
      const tx = ny, ty = -nx, vt = w.vx * tx + w.vy * ty, slip = vt - w.s * RW;
      let jt = -slip / (1 / MW + (RW * RW) / IW); const lim = ST.mu * jn; jt = Math.max(-lim, Math.min(lim, jt));
      w.vx += (tx * jt) / MW; w.vy += (ty * jt) / MW; w.s -= (jt * RW) / IW;
    }
  }
  // chassis corners vs ground
  const c2 = Math.cos(car.a), s2 = Math.sin(car.a);
  for (const [lx, ly] of CRN) {
    const rx = lx * c2 - ly * s2, ry = lx * s2 + ly * c2, px = car.x + rx, py = car.y + ry;
    const sl = dH(px), nl = Math.hypot(1, sl), nx = -sl / nl, ny = 1 / nl, d = (py - H(px)) * ny;
    if (d < 0) {
      car.x -= nx * d; car.y -= ny * d;
      const vx = car.vx - car.w * ry, vy = car.vy + car.w * rx, vn = vx * nx + vy * ny;
      if (vn < 0) {
        const rn = rx * ny - ry * nx, j = (-(1.1) * vn) / (1 / M + (rn * rn) / I);
        car.vx += (j * nx) / M; car.vy += (j * ny) / M; car.w += (rn * j) / I; impact = Math.max(impact, -vn);
        const tx = ny, ty = -nx, vt = vx * tx + vy * ty, rt = rx * ty - ry * tx;
        let jt = -vt / (1 / M + (rt * rt) / I); jt = Math.max(-0.6 * j, Math.min(0.6 * j, jt));
        car.vx += (jt * tx) / M; car.vy += (jt * ty) / M; car.w += (rt * jt) / I;
      }
    }
  }
  if (!onG) car.w += thr * 2.8 * h; // lean in the air
  // egg vs truck bed
  eg.x += eg.vx * h; eg.y += eg.vy * h; eg.ang += eg.w * h; eg.w *= 1 - 0.6 * h;
  for (const [lx1, ly1, lx2, ly2] of SEGS) {
    const [ax, ay] = toW(lx1, ly1), [bx, by] = toW(lx2, ly2);
    const ex = bx - ax, ey = by - ay, L2 = ex * ex + ey * ey;
    const t = Math.max(0, Math.min(1, ((eg.x - ax) * ex + (eg.y - ay) * ey) / L2)), qx = ax + ex * t, qy = ay + ey * t;
    const dx = eg.x - qx, dy = eg.y - qy, d = Math.hypot(dx, dy);
    if (d < ER && d > 1e-6) {
      const nx = dx / d, ny = dy / d; eg.x += nx * (ER - d); eg.y += ny * (ER - d);
      const rqx = qx - car.x, rqy = qy - car.y, cvx = car.vx - car.w * rqy, cvy = car.vy + car.w * rqx;
      const rvx = eg.vx - cvx, rvy = eg.vy - cvy, vn = rvx * nx + rvy * ny;
      if (vn < 0) {
        const e = -vn > 1.2 ? 0.28 : 0, jn = -(1 + e) * vn; eg.vx += nx * jn; eg.vy += ny * jn; eggImpact = Math.max(eggImpact, -vn);
        const tx = ny, ty = -nx, vt = rvx * tx + rvy * ty + eg.w * ER;
        let jt = -vt / (1 + 1 / EI); const lim = 0.75 * jn; jt = Math.max(-lim, Math.min(lim, jt));
        eg.vx += tx * jt; eg.vy += ty * jt; eg.w += (jt / EI) / ER; eg.w *= 1 - 4 * h;
      }
    }
  }
  // egg vs ground = crack
  const sl = dH(eg.x), ny = 1 / Math.hypot(1, sl);
  const eggGround = (eg.y - H(eg.x)) * ny < ER * 0.92;
  return { impact, eggImpact, eggGround, onG };
}

function step(dt) {
  let thr = thrIn;
  if (G.bot) thr = G.bot(G);
  if (state !== 'play') thr = 0;
  const SUB = 10; let imp = 0, eimp = 0, crack = false, onG = 0;
  for (let k = 0; k < SUB; k++) { const r = substep(dt / SUB, thr); imp = Math.max(imp, r.impact); eimp = Math.max(eimp, r.eggImpact); if (r.eggGround) crack = true; onG = Math.max(onG, r.onG); }
  if (state === 'dying') { run.endT += dt; if (run.endT > 1.5) showOver(); return; }
  if (state !== 'play') return;
  run.t += dt;
  // juice + sound
  if (imp > 3) { shakeT = Math.min(0.5, imp * 0.04); audio.thud(imp); for (const w of wl) if (w.ground) puff(w.x, w.y - RW + 0.1, 0.4, dustTex, 4, 3, 1.2, 0.9); }
  if (eimp > 1.4) { audio.tap(eimp); eg.squash = Math.min(0.3, eimp * 0.05); }
  if (onG && Math.abs(car.vx) > 5 && Math.random() < 0.15) { const w = wl[0]; puff(w.x - 0.3, w.y - RW + 0.15, 0.5, dustTex, 1, 1.5, 0.9, 0.8); }
  run.airT = onG ? 0 : run.airT + dt;
  const rpm = Math.min(1, Math.abs(wl[0].s + wl[1].s) / 2 / ST.maxSpin);
  audio.engine(rpm, true);
  // progress
  run.dist = Math.max(run.dist, car.x - 4);
  for (const c of coins) {
    if (c.taken) continue;
    const dx = c.x - car.x, dy = c.m.position.y - car.y, ex = c.x - eg.x, ey = c.m.position.y - eg.y;
    if (dx * dx + dy * dy < 2.4 || ex * ex + ey * ey < 0.5) {
      c.taken = true; c.m.visible = false; run.coins++; save.coins++; audio.coin(run.coins);
      puff(c.x, c.m.position.y, 0.3, sparkTex, 5, 3, 0.7, 0.6);
    }
  }
  const m = Math.floor(run.dist / 100);
  if (m >= run.milestone) { run.milestone = m + 1; banner(m * 100 + ' m'); audio.milestone(); }
  const b = Math.floor((car.x - 4) / BLEN);
  if (b > run.biome) { run.biome = b; banner(BIOMES[b % BIOMES.length].name); }
  if (car.x > run.lastX + 1) { run.lastX = car.x; run.stuckT = 0; } else run.stuckT += dt;
  if (Math.cos(car.a) < -0.3) run.flipT += dt; else run.flipT = 0;
  if (crack) die('The egg cracked!');
  else if (run.flipT > 2.5) die('Flipped over!');
  else if (run.stuckT > 9) die('Stalled out');
}
function die(why) {
  state = 'dying'; run.why = why; run.endT = 0; audio.engine(0, false);
  if (why.includes('egg')) {
    audio.crack(); slowmo = 0.35; flash = 0.6; shakeT = 0.35;
    puff(eg.x, eg.y, 0.6, yolkTex, 10, 4, 1.1, 1.4); puff(eg.x, eg.y + 0.1, 0.8, shellTex, 8, 6, 0.4, 1.2);
    egg.visible = false;
  } else audio.thud(8);
}

// ---------- UI ----------
let bannerT = 0;
function banner(t) { const b = $('banner'); b.textContent = t; b.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => b.classList.remove('show'), 1800); }
function show(id) { for (const k of ['menu', 'over', 'garage']) $(k).classList.toggle('hidden', k !== id); }
function hud() {
  $('dist').textContent = Math.floor(run.dist) + ' m'; $('coins').textContent = save.coins; $('best').textContent = Math.floor(save.best);
  $('biome').textContent = BIOMES[Math.max(0, Math.floor((car.x - 4) / BLEN)) % BIOMES.length].name;
}
function start() {
  audio.init(); reset(); egg.visible = true; state = 'play'; show(null);
  $('hud').classList.remove('hidden');
  $('pedals').classList.toggle('hidden', !matchMedia('(pointer: coarse)').matches);
  $('hint').classList.toggle('hidden', !run.hint);
  slowmo = 1;
}
function showOver() {
  state = 'over'; save.runs++;
  const d = Math.floor(run.dist), nb = d > save.best; if (nb) save.best = d; persist();
  $('oTitle').textContent = run.why; $('oDist').textContent = d + ' m';
  const next = UPS.map((u) => save.lv[u.id] < u.max ? COST[save.lv[u.id]] : 1e9).reduce((a, b) => Math.min(a, b));
  $('oInfo').innerHTML = (nb ? '<b>New best!</b><br>' : `best ${save.best} m<br>`) + `+${run.coins} drops &middot; ${save.coins} total` + (save.coins >= next ? '<br><i>You can afford an upgrade</i>' : '');
  show('over'); $('pedals').classList.add('hidden');
}
function garage() {
  state = 'garage'; show('garage'); $('gCoins').textContent = save.coins; $('hud').classList.add('hidden');
  $('gList').innerHTML = UPS.map((u) => {
    const l = save.lv[u.id], c = l < u.max ? COST[l] : null;
    return `<div class="up"><div class="nm"><b>${u.name}</b><small>${u.info}</small></div><span class="pips">${'&#9679;'.repeat(l)}${'&#9675;'.repeat(u.max - l)}</span>
      <button data-u="${u.id}" ${c === null || save.coins < c ? 'disabled' : ''}>${c === null ? 'max' : c}</button></div>`;
  }).join('');
}
function buy(id) {
  const u = UPS.find((x) => x.id === id), l = save.lv[id]; if (!u || l >= u.max || save.coins < COST[l]) return false;
  save.coins -= COST[l]; save.lv[id]++; persist(); audio.buy(); if (state === 'garage') garage(); return true;
}
$('gList').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) buy(b.dataset.u); });
$('mPlay').onclick = start; $('oRetry').onclick = start; $('gBack').onclick = start;
$('mGarage').onclick = garage; $('oGarage').onclick = garage;
$('muteBtn').onclick = () => { audio.setMuted(!audio.muted); $('muteBtn').classList.toggle('off', audio.muted); };

// input
const keys = new Set();
const recalc = () => { const g = keys.has('g'), b = keys.has('b'); thrIn = g && !b ? 1 : b ? -1 : 0; $('pGas').classList.toggle('on', g); $('pBrake').classList.toggle('on', b); if (thrIn && run) { run.hint = false; $('hint').classList.add('hidden'); } };
addEventListener('keydown', (e) => {
  audio.init();
  if (['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW'].includes(e.code)) keys.add('g');
  if (['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS'].includes(e.code)) keys.add('b');
  if ((e.code === 'Space' || e.code === 'Enter') && (state === 'over' || state === 'menu')) start();
  if (e.code === 'KeyR' && state === 'play') start();
  recalc();
});
addEventListener('keyup', (e) => {
  if (['ArrowRight', 'KeyD', 'ArrowUp', 'KeyW'].includes(e.code)) keys.delete('g');
  if (['ArrowLeft', 'KeyA', 'ArrowDown', 'KeyS'].includes(e.code)) keys.delete('b');
  recalc();
});
const touches = new Map();
const tRecalc = () => { keys.delete('g'); keys.delete('b'); for (const v of touches.values()) keys.add(v); recalc(); };
canvas.addEventListener('pointerdown', (e) => { audio.init(); touches.set(e.pointerId, e.clientX > innerWidth / 2 ? 'g' : 'b'); tRecalc(); });
addEventListener('pointerup', (e) => { touches.delete(e.pointerId); tRecalc(); });
addEventListener('pointercancel', (e) => { touches.delete(e.pointerId); tRecalc(); });
addEventListener('blur', () => { keys.clear(); touches.clear(); recalc(); });

// ---------- render ----------
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), cA = new THREE.Color(), cB = new THREE.Color();
function palette(x) {
  const b = Math.max(0, x - 4) / BLEN, i = Math.floor(b), f = sstep(0.82, 1, b - i);
  const A = BIOMES[i % BIOMES.length], B = BIOMES[(i + 1) % BIOMES.length];
  const mix = (ka, kb, out) => out.set(ka).lerp(cB.set(kb), f);
  mix(A.grass, B.grass, tMat.uniforms.uGrass.value); mix(A.soil, B.soil, tMat.uniforms.uSoil.value); mix(A.deep, B.deep, tMat.uniforms.uDeep.value);
  mix(A.top, B.top, sky.material.uniforms.uTop.value); mix(A.low, B.low, sky.material.uniforms.uLow.value);
  layers.forEach((l, k) => mix(A.lay[k], B.lay[k], l.material.uniforms.uColor.value));
}
function syncVisuals(dt, snap) {
  truck.position.set(car.x, car.y, 0); truck.rotation.z = car.a;
  wl.forEach((w, i) => { for (const g of [wheels[i], wheelsB[i]]) { g.position.set(w.x, w.y, g === wheels[i] ? 0.62 : -0.62); g.rotation.z = -w.ang; } });
  eg.squash *= Math.pow(0.02, dt);
  egg.position.set(eg.x, eg.y + 0.04, 0); egg.rotation.z = eg.ang;
  egg.scale.set(1 + eg.squash, 1.3 - eg.squash * 1.3, 1 + eg.squash);
  for (const c of coins) if (!c.taken) c.m.rotation.y += dt * 2.5;
  const lead = Math.max(-1.5, Math.min(3.5, car.vx * 0.35)), zoom = 15 + Math.min(5, Math.abs(car.vx) * 0.45);
  camPos.set(car.x + 1.5 + lead, car.y + 2.6, zoom + (cam.aspect < 1 ? 6 : 0));
  camLook.set(car.x + 1.5 + lead, car.y + 0.6, 0);
  const k = snap ? 1 : 1 - Math.pow(0.03, dt);
  cam.position.lerp(camPos, k); cam.userData.look = (cam.userData.look || camLook.clone()).lerp(camLook, k);
  if (shakeT > 0) { shakeT -= dt; cam.position.x += (Math.random() - 0.5) * shakeT * 0.8; cam.position.y += (Math.random() - 0.5) * shakeT * 0.8; }
  cam.lookAt(cam.userData.look);
  for (const l of layers) { l.material.uniforms.uOff.value = cam.position.x; l.material.uniforms.uBase.value = cam.position.y * 0.55 + 1 + l.userData.k * 3; }
  sky.material.uniforms.uScroll.value = cam.position.x * 0.0008;
  palette(cam.position.x); updateChunks(car.x);
}
function render(t) {
  post.uniforms.uT.value = t; post.uniforms.uFlash.value = flash;
  renderer.setRenderTarget(rt); renderer.render(scene, cam);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}
let last = performance.now(), acc = 0, now = 0;
const FIX = 1 / 60;
function frame(ts) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (ts - last) / 1000); last = ts;
  slowmo += (1 - slowmo) * Math.min(1, dt * 1.5); flash = Math.max(0, flash - dt * 1.5);
  acc += dt * slowmo; now += dt;
  while (acc >= FIX) { step(FIX); acc -= FIX; }
  updateFx(dt); syncVisuals(dt, false);
  if (state === 'play' || state === 'dying') hud();
  render(now);
}

// ---------- boot ----------
reset(); syncVisuals(0.016, true);
if (Q.has('title')) { show('menu'); $('mBest').textContent = save.best; $('mCoins').textContent = save.coins; }
else start();
requestAnimationFrame(frame);

// test hooks
const G = (window.__G = {
  get state() { return state; }, get car() { return car; }, get egg() { return eg; }, get run() { return run; }, get save() { return save; },
  bot: null, start, buy, garage, H, setThrottle: (v) => { thrIn = v; },
  fast(sec) { let k = 0; for (let t = 0; t < sec; t += FIX) { step(FIX); if (++k % 30 === 0) updateChunks(car.x); } updateFx(0.5); syncVisuals(0.016, true); },
  render: () => render(now),
});
