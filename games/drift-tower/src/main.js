import * as THREE from '../vendor/three.module.js';
import { clayMat, roundBox, aoGeo } from './clay.js';
import { Sfx } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('dt_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('dt_' + k, JSON.stringify(v)); } catch {} } };

// ---------- palettes (zones) ----------
const ZONES = [
  { name: 'DAWN', top: '#bfe0f2', mid: '#f3d9e6', bot: '#fbe6cf', road: [0xf7e3d3, 0xf2c9d3], pillar: [0xc9c1ec, 0xa8dcc8, 0xf6c7a8], fog: 0xf6dfd8 },
  { name: 'MINT', top: '#b9ead8', mid: '#e3f3d6', bot: '#fdf0cf', road: [0xfdf3dc, 0xcdebd9], pillar: [0xf3b8c4, 0x9fd6e8, 0xf9dc9c], fog: 0xeaf2dc },
  { name: 'LILAC', top: '#c8c0ef', mid: '#efd0ea', bot: '#ffe0d6', road: [0xfbeaf2, 0xd9d0f5], pillar: [0x9fd8cf, 0xf5b9a5, 0xfff0a8], fog: 0xf3dde5 },
  { name: 'DUSK', top: '#9ab3e3', mid: '#e7b7cc', bot: '#f8cfae', road: [0xfbe1cf, 0xe9bfd6], pillar: [0x8fc7d9, 0xc4a9e8, 0xf6b48e], fog: 0xeac4c4 },
];
const SKINS = [
  { name: 'Peach', cost: 0, body: 0xf59c8b, cab: 0xfff4ea },
  { name: 'Mint', cost: 25, body: 0x7fd1b0, cab: 0xfdf7e6 },
  { name: 'Sky', cost: 60, body: 0x86b9ea, cab: 0xfff1f6 },
  { name: 'Butter', cost: 120, body: 0xf6cf6a, cab: 0x7c6a8f },
  { name: 'Plum', cost: 200, body: 0xa98bd6, cab: 0xffe6c4 },
  { name: 'Cocoa', cost: 320, body: 0x9a6f5d, cab: 0xf7c9b8 },
];

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0, 0);
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(ZONES[0].fog, 26, 56);
const VIEW = 15;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 200);
const CAMOFF = new THREE.Vector3(16, 19, 16);
function resize() {
  const w = innerWidth, h = innerHeight, a = w / h, s = a < 0.8 ? VIEW * 1.25 : VIEW;
  cam.left = -s * a / 2; cam.right = s * a / 2; cam.top = s / 2; cam.bottom = -s / 2; cam.updateProjectionMatrix();
  renderer.setSize(w, h, false);
}
addEventListener('resize', resize); resize();

scene.add(new THREE.HemisphereLight(0xfff3f6, 0xe7c3b5, 1.35));
const sun = new THREE.DirectionalLight(0xfff0de, 1.9);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.radius = 6; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 60 });
scene.add(sun, sun.target);

// ---------- road ----------
const W = 2.3, SLAB_H = 0.7;
const slabGeoCache = new Map();
const pillarGeo = aoGeo(new THREE.CylinderGeometry(0.42, 0.55, 30, 18, 8), 0.35);
const capGeo = roundBox(1.25, 0.35, 1.25, 0.14, 4, 0.7);
const mats = {};
function mat(c) { return mats[c] || (mats[c] = clayMat(c)); }
let road = [], segN = 0, head = { x: 0, z: 0, dir: 'z' }, zone = 0;
const DIRV = { z: { x: 0, z: -1 }, x: { x: -1, z: 0 } };

function addSlab(len) {
  const d = DIRV[head.dir], sx = head.x, sz = head.z, ex = sx + d.x * len, ez = sz + d.z * len;
  const x0 = Math.min(sx, ex) - W / 2, x1 = Math.max(sx, ex) + W / 2, z0 = Math.min(sz, ez) - W / 2, z1 = Math.max(sz, ez) + W / 2;
  const w = x1 - x0, dd = z1 - z0, key = w.toFixed(2) + 'x' + dd.toFixed(2);
  if (!slabGeoCache.has(key)) slabGeoCache.set(key, roundBox(w, SLAB_H, dd, 0.2, 6));
  const Z = ZONES[zone % ZONES.length];
  const grp = new THREE.Group();
  const m = new THREE.Mesh(slabGeoCache.get(key), mat(Z.road[segN % 2]));
  m.receiveShadow = true; m.castShadow = true; grp.add(m);
  const y0 = -SLAB_H / 2 + (segN % 2) * 0.035; grp.position.set((x0 + x1) / 2, y0, (z0 + z1) / 2);
  // a clay tower under the start corner of every slab
  const pc = Z.pillar[segN % Z.pillar.length];
  const pil = new THREE.Mesh(pillarGeo, mat(pc)); pil.position.set(sx - grp.position.x, -15.2, sz - grp.position.z); pil.receiveShadow = true; grp.add(pil);
  const cap = new THREE.Mesh(capGeo, mat(pc)); cap.position.set(sx - grp.position.x, -0.5, sz - grp.position.z); grp.add(cap);
  scene.add(grp);
  const s = { y0, i: segN++, dir: head.dir, x0, x1, z0, z1, sx, sz, ex, ez, len, grp, rise: 1 };
  grp.position.y -= 6; // pops up from below
  road.push(s);
  if (s.i > 1 && Math.random() < 0.55) { const k = 0.35 + Math.random() * 0.4; addGem(sx + d.x * len * k, sz + d.z * len * k); }
  head = { x: ex, z: ez, dir: head.dir === 'z' ? 'x' : 'z' };
}
function segLen() {
  const hard = Math.min(1, score / 120);
  const lo = 1.6 - hard * 0.4, hi = 6.5 - hard * 3.2;
  return Math.round((lo + Math.random() * (hi - lo)) * 2) / 2;
}
function inside(s, x, z, m = 0) { return x > s.x0 - m && x < s.x1 + m && z > s.z0 - m && z < s.z1 + m; }

// ---------- gems ----------
const gemGeo = aoGeo(new THREE.IcosahedronGeometry(0.32, 1), 0.7);
const gemMat = clayMat(0xf7c75e, { emissive: 0x6b4a10, emissiveIntensity: 0.25 });
let gems = [];
function addGem(x, z) { const m = new THREE.Mesh(gemGeo, gemMat); m.position.set(x, 0.7, z); m.castShadow = true; m.scale.set(1, 1.3, 1); scene.add(m); gems.push(m); }

// ---------- car ----------
const car = new THREE.Group(); scene.add(car);
const body = new THREE.Group(); car.add(body);
let skin = store.get('skin', 0), owned = store.get('owned', [0]);
const bodyMesh = new THREE.Mesh(roundBox(0.95, 0.42, 1.55, 0.18, 5, 0.6), clayMat(SKINS[0].body));
bodyMesh.position.y = 0.42; bodyMesh.castShadow = true; body.add(bodyMesh);
const cabMesh = new THREE.Mesh(roundBox(0.78, 0.36, 0.78, 0.16, 4, 0.75), clayMat(SKINS[0].cab));
cabMesh.position.set(0, 0.78, 0.12); cabMesh.castShadow = true; body.add(cabMesh);
const wheelGeo = aoGeo(new THREE.CylinderGeometry(0.22, 0.22, 0.2, 16).rotateZ(Math.PI / 2), 0.8), wheelMat = clayMat(0x6d5c73);
for (const [x, z] of [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.52], [0.5, 0.52]]) { const w = new THREE.Mesh(wheelGeo, wheelMat); w.position.set(x, 0.22, z); w.castShadow = true; body.add(w); }
const lampMat = clayMat(0xfffbe0, { emissive: 0xfff2b0, emissiveIntensity: 0.6 });
for (const x of [-0.28, 0.28]) { const l = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), lampMat); l.position.set(x, 0.45, -0.79); body.add(l); }
const blob = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x7a5a6a, transparent: true, opacity: 0.18, depthWrite: false }));
blob.position.y = 0.01; blob.scale.set(0.75, 1, 1.1); car.add(blob);
function applySkin() { bodyMesh.material.color.setHex(SKINS[skin].body); cabMesh.material.color.setHex(SKINS[skin].cab); }
applySkin();

// ---------- particles (clay puffs) ----------
const puffGeo = aoGeo(new THREE.IcosahedronGeometry(0.2, 1), 0.8);
const puffMat = clayMat(0xffffff, { transparent: true, opacity: 0.85 });
const sparkMat = clayMat(0xffe08a, { emissive: 0x7a5a10, emissiveIntensity: 0.4 });
let puffs = [];
function puff(x, y, z, vx, vy, vz, life, size, m = puffMat) {
  const p = new THREE.Mesh(puffGeo, m); p.position.set(x, y, z); scene.add(p);
  puffs.push({ p, vx, vy, vz, life, max: life, size });
}

// ---------- clouds ----------
const cloudMat = clayMat(0xffffff, { transparent: true, opacity: 0.92, rimColor: 0xffe7f0 });
const sph = aoGeo(new THREE.SphereGeometry(1, 18, 12), 0.75);
let clouds = [];
function makeCloud(x, y, z) {
  const g = new THREE.Group(), n = 3 + (Math.random() * 3 | 0);
  for (let i = 0; i < n; i++) { const m = new THREE.Mesh(sph, cloudMat); const s = 0.9 + Math.random() * 1.2; m.scale.set(s * 1.3, s * 0.8, s); m.position.set((i - n / 2) * 1.3, Math.random() * 0.5, (Math.random() - 0.5) * 1.2); g.add(m); }
  g.position.set(x, y, z); scene.add(g); clouds.push(g); return g;
}

// ---------- state ----------
let state = 'run', score = 0, gemsRun = 0, best = store.get('best', 0), bank = store.get('gems', 0);
let pos = new THREE.Vector3(), face = 0, vel = 0, speed = 0, hold = false, vy = 0, fallT = 0, t = 0, shake = 0, curSeg = 0, driftAmt = 0, smokeT = 0;
const sfx = new Sfx(Q.get('mute') === '1');
// heading angle: 0 = -Z (up-right on screen), PI/2 = -X (up-left)
const ANG = { z: 0, x: Math.PI / 2 };
const dirOf = (a) => ({ x: -Math.sin(a), z: -Math.cos(a) });

function reset() {
  for (const s of road) scene.remove(s.grp); for (const g of gems) scene.remove(g); for (const c of clouds) scene.remove(c); for (const p of puffs) scene.remove(p.p);
  road = []; gems = []; clouds = []; puffs = []; segN = 0; head = { x: 0, z: 3, dir: 'z' };
  score = 0; gemsRun = 0; curSeg = 0; fallT = 0; vy = 0; shake = 0; G._over = false;
  setZone(0, true); $('zone').classList.remove('show');
  addSlab(9); for (let i = 0; i < 14; i++) addSlab(segLen());
  for (const s of road) { s.grp.position.y = s.y0; s.rise = 0; }
  for (let i = 0; i < 18; i++) makeCloud((Math.random() - 0.75) * 60, -6 - Math.random() * 12, (Math.random() - 0.75) * 60);
  pos.set(0, 0, 1.5); face = vel = 0; speed = 5.2; body.rotation.set(0, 0, 0);
  state = 'run'; $('hint').classList.remove('off');
  updHud(); $('over').classList.add('hide');
}
function setZone(z, instant) {
  zone = z; const Z = ZONES[z % ZONES.length], st = document.documentElement.style;
  st.setProperty('--top', Z.top); st.setProperty('--mid', Z.mid); st.setProperty('--bot', Z.bot);
  scene.fog.color.setHex(Z.fog);
  if (!instant) { const e = $('zone'); e.textContent = 'ZONE ' + (z + 1) + ' · ' + Z.name; e.classList.add('show'); setTimeout(() => e.classList.remove('show'), 1600); sfx.zone(); }
}
function updHud() { $('score').textContent = score; $('best').textContent = 'BEST ' + best; $('coinN').textContent = bank + gemsRun; }
function popScore() { const e = $('score'); e.classList.add('pop'); setTimeout(() => e.classList.remove('pop'), 110); }

function gameOver() {
  state = 'dead'; sfx.fall(); shake = 0.5;
  bank += gemsRun; store.set('gems', bank);
  const nb = score > best; if (nb) { best = score; store.set('best', best); }
  setTimeout(() => {
    if (state !== 'dead') return;
    $('oScore').textContent = score; $('oBest').textContent = best; $('oGems').textContent = '+' + gemsRun;
    $('newBest').classList.toggle('hide', !nb); $('over').classList.remove('hide'); updHud();
  }, 900);
}

// ---------- sim ----------
const tmpV = new THREE.Vector3();
function step(dt) {
  t += dt;
  for (const s of road) if (s.rise > 0) { s.rise = Math.max(0, s.rise - dt * 2.2); const k = s.rise; s.grp.position.y = s.y0 - 6 * k * k * k; }
  for (const g of gems) { g.rotation.y += dt * 2.5; g.position.y = 0.75 + Math.sin(t * 3 + g.position.x) * 0.1; }
  for (const c of clouds) c.position.x += dt * 0.25;
  for (let i = puffs.length - 1; i >= 0; i--) {
    const q = puffs[i]; q.life -= dt; q.p.position.x += q.vx * dt; q.p.position.y += q.vy * dt; q.p.position.z += q.vz * dt;
    const k = q.life / q.max; q.p.scale.setScalar(q.size * (0.4 + (1 - k) * 0.9) * Math.min(1, k * 4));
    if (q.life <= 0) { scene.remove(q.p); puffs.splice(i, 1); }
  }
  if (state === 'run') {
    if (G.bot) hold = botHold();
    const target = hold ? ANG.x : ANG.z;
    face += Math.sign(target - face) * Math.min(Math.abs(target - face), dt * 8.5);
    vel += (face - vel) * Math.min(1, dt * 7.5);
    speed = Math.min(10.5, 5.2 + score * 0.05);
    const d = dirOf(vel); pos.x += d.x * speed * dt; pos.z += d.z * speed * dt;
    driftAmt = Math.abs(face - vel);
    let on = -1; for (let i = road.length - 1; i >= 0; i--) if (inside(road[i], pos.x, pos.z, 0.05)) { on = i; break; }
    if (on < 0) { state = 'fall'; vy = 0; fallT = 0; sfx.skid(0); }
    else {
      const si = road[on].i;
      if (si > curSeg) { score += si - curSeg; curSeg = si; popScore(); sfx.tick(score); updHud();
        if (score % 20 === 0) setZone(score / 20 | 0);
        if (score === 3) $('hint').classList.add('off'); }
      while (road[road.length - 1].i < curSeg + 14) addSlab(segLen());
      while (road[0].i < curSeg - 5) scene.remove(road.shift().grp);
    }
    for (let i = gems.length - 1; i >= 0; i--) { const g = gems[i];
      if (Math.hypot(g.position.x - pos.x, g.position.z - pos.z) < 0.85) {
        gemsRun++; sfx.gem(); updHud();
        for (let k = 0; k < 8; k++) { const a = k / 8 * 6.28; puff(g.position.x, 0.8, g.position.z, Math.cos(a) * 2.5, 2 + Math.random(), Math.sin(a) * 2.5, 0.5, 0.6, sparkMat); }
        scene.remove(g); gems.splice(i, 1);
      } else if (g.position.z > pos.z + 12 && g.position.x > pos.x + 12) { scene.remove(g); gems.splice(i, 1); } }
    smokeT -= dt;
    if (driftAmt > 0.12 && smokeT <= 0) { smokeT = 0.035; const b = dirOf(face);
      for (const sd of [-0.45, 0.45]) puff(pos.x - b.x * 0.6 + b.z * sd, 0.2, pos.z - b.z * 0.6 - b.x * sd, (Math.random() - 0.5) * 0.6, 0.6 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6, 0.7, 0.9 + driftAmt); }
    sfx.engine(speed, driftAmt); sfx.skid(Math.min(1, driftAmt * 1.6));
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z, (face - vel) * 0.25, Math.min(1, dt * 8));
  } else if (state === 'fall') {
    fallT += dt; vy -= 22 * dt; pos.y += vy * dt; const d = dirOf(vel); pos.x += d.x * speed * 0.6 * dt; pos.z += d.z * speed * 0.6 * dt;
    body.rotation.x += dt * 4; body.rotation.z += dt * 2.5; sfx.engine(0, 0);
    if (fallT > 0.35 && !G._over) { G._over = true; gameOver(); }
  } else sfx.engine(0, 0);
  car.position.copy(pos); car.rotation.y = face;
  blob.visible = state === 'run';
  // camera follows a point a little ahead (up-screen)
  tmpV.set(pos.x - 1.6, state === 'run' ? 0 : Math.max(pos.y, -4), pos.z - 1.6);
  if (!G.camT) G.camT = tmpV.clone(); G.camT.lerp(tmpV, Math.min(1, dt * 4));
  shake = Math.max(0, shake - dt);
  cam.position.copy(G.camT).add(CAMOFF); cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake;
  cam.lookAt(G.camT);
  sun.position.set(G.camT.x + 8, 20, G.camT.z + 4); sun.target.position.copy(G.camT);
}

// bot: steer for the slab we should be on next
function botHold() {
  let on = null; for (let i = road.length - 1; i >= 0; i--) if (inside(road[i], pos.x, pos.z)) { on = road[i]; break; }
  if (!on) return hold;
  const d = DIRV[on.dir], rem = (on.ex - pos.x) * d.x + (on.ez - pos.z) * d.z;
  const next = road.find((s) => s.i === on.i + 1);
  const dir = rem < 0.15 + speed * 0.075 && next ? next.dir : on.dir;
  return dir === 'x';
}

// ---------- input ----------
function down(e) {
  if (e && e.target && e.target.closest && e.target.closest('button,.panel')) return;
  sfx.unlock();
  if (state === 'dead') { if (!$('over').classList.contains('hide')) reset(); return; }
  if (state === 'menu') return;
  hold = true;
}
function up() { hold = false; }
addEventListener('pointerdown', down); addEventListener('pointerup', up); addEventListener('pointercancel', up);
const KEYS = ['Space', 'ArrowLeft', 'ArrowUp', 'KeyA', 'Enter'];
addEventListener('keydown', (e) => { if (e.repeat || !KEYS.includes(e.code)) return; e.preventDefault(); if (state === 'menu') { sfx.unlock(); startPlay(); return; } down(); });
addEventListener('keyup', (e) => { if (KEYS.includes(e.code)) up(); });
$('retry').onclick = () => { sfx.unlock(); reset(); };
$('toGarage').onclick = () => { $('over').classList.add('hide'); openMenu(); };
$('play').onclick = () => { sfx.unlock(); startPlay(); };
$('muteBtn').onclick = () => { sfx.unlock(); sfx.setMute(!sfx.muted); $('muteBtn').style.opacity = sfx.muted ? 0.4 : 1; };
$('muteBtn').style.opacity = sfx.muted ? 0.4 : 1;

function openMenu() {
  state = 'menu'; $('menu').classList.remove('hide'); const gEl = $('garage'); gEl.innerHTML = '';
  SKINS.forEach((s, i) => { const d = document.createElement('div'), own = owned.includes(i);
    d.className = 'skin' + (i === skin ? ' sel' : '') + (own ? '' : ' lock');
    d.innerHTML = `<i style="background:#${s.body.toString(16).padStart(6, '0')}"></i>${s.name}<br>${own ? (i === skin ? 'DRIVING' : 'OWNED') : s.cost + ' gems'}`;
    d.onclick = () => { if (!own) { if (bank < s.cost) { sfx.unlock(); sfx.nope(); return; } bank -= s.cost; owned.push(i); store.set('owned', owned); store.set('gems', bank); sfx.unlock(); sfx.gem(); }
      skin = i; store.set('skin', skin); applySkin(); updHud(); openMenu(); };
    gEl.appendChild(d); });
  $('wallet').textContent = 'You have ' + bank + ' gems · best ' + best;
}
function startPlay() { $('menu').classList.add('hide'); reset(); }

// ---------- loop ----------
const G = window.__G = { bot: Q.has('bot'), step, get state() { return state; }, get score() { return score; }, get gems() { return gemsRun; }, get bank() { return bank; },
  fast(sec) { for (let i = 0; i < sec * 60; i++) step(1 / 60); }, reset, openMenu, setHold(h) { hold = h; } };
reset();
if (Q.has('title')) openMenu();
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.paused) { let acc = dt; while (acc > 1e-6) { const h = Math.min(acc, 1 / 60); step(h); acc -= h; } }
  renderer.render(scene, cam); requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
