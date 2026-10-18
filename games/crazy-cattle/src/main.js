// CRAZY CATTLE - knitted sheep battle royale. Ram the flock off the quilt.
import * as THREE from 'three';
import { knitTex, feltTex, patchTex } from './textile.js';
import { sfx, unlockAudio } from './audio.js';

const Q = new URLSearchParams(location.search);
const BOT = Q.has('bot');
const $ = (id) => document.getElementById(id);

// ---------- save ----------
const COLORS = [
  { n: 'Cream', c: 0xf3e9d6, cost: 0 }, { n: 'Rose', c: 0xe89a9a, cost: 30 }, { n: 'Mint', c: 0x9fd4b4, cost: 60 },
  { n: 'Sky', c: 0x9cc0e6, cost: 100 }, { n: 'Mustard', c: 0xe6c060, cost: 150 }, { n: 'Plum', c: 0x9a6a9e, cost: 220 },
  { n: 'Coal', c: 0x4a4448, cost: 320 }, { n: 'Rainbow', c: -1, cost: 500 },
];
let save = { lvl: 1, yarn: 0, owned: [0], color: 0, wins: 0 };
try { const s = JSON.parse(localStorage.getItem('crazycattle')); if (s) save = Object.assign(save, s); } catch (e) {}
const store = () => { try { localStorage.setItem('crazycattle', JSON.stringify(save)); } catch (e) {} };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const BG = new THREE.Color(0xe9cfb6);
scene.background = BG;
scene.fog = new THREE.Fog(BG, 38, 95);
const cam = new THREE.PerspectiveCamera(48, 1, 0.1, 300);
scene.add(new THREE.HemisphereLight(0xfff3e0, 0x8a6a5a, 1.1));
const sun = new THREE.DirectionalLight(0xffe6c8, 2.2);
sun.position.set(14, 26, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -30, right: 30, top: 30, bottom: -30, near: 1, far: 80 });
sun.shadow.bias = -0.0005; sun.shadow.radius = 4;
scene.add(sun, sun.target);
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.fov = cam.aspect < 0.8 ? 62 : 48; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- textile materials ----------
const KNIT = knitTex(), FELT = feltTex();
// fuzz: extra fibre rim light + fine grain on top of sheen, the "it is fabric" read
function fuzz(mat, amt = 0.5) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uFuzz = { value: amt };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFuzz;\nfloat h21(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}')
      .replace('#include <dithering_fragment>', `
      float rim = pow(1.0 - clamp(dot(normal, normalize(-vViewPosition)), 0.0, 1.0), 2.5);
      float g = h21(floor(gl_FragCoord.xy*0.7));
      gl_FragColor.rgb += vec3(1.0,0.95,0.88) * rim * uFuzz * (0.55 + 0.45*g);
      gl_FragColor.rgb *= 0.94 + 0.06*g;
      #include <dithering_fragment>`);
  };
  return mat;
}
const matCache = {};
function knitMat(color, rep = 2) {
  const k = color + ':' + rep;
  if (matCache[k]) return matCache[k];
  const map = KNIT.map.clone(); map.repeat.set(rep, rep); map.needsUpdate = true;
  const bump = KNIT.bump.clone(); bump.repeat.set(rep, rep); bump.needsUpdate = true;
  return (matCache[k] = fuzz(new THREE.MeshPhysicalMaterial({ color, map, bumpMap: bump, bumpScale: 3, roughness: 0.95, sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) }), 0.3));
}
function feltMat(color, rep = 1) {
  const k = 'f' + color + ':' + rep;
  if (matCache[k]) return matCache[k];
  const map = FELT.map.clone(); map.repeat.set(rep, rep); map.needsUpdate = true;
  const bump = FELT.bump.clone(); bump.repeat.set(rep, rep); bump.needsUpdate = true;
  return (matCache[k] = fuzz(new THREE.MeshPhysicalMaterial({ color, map, bumpMap: bump, bumpScale: 1.5, roughness: 1, sheen: 0.8, sheenRoughness: 0.7, sheenColor: new THREE.Color(0xfff0e0) }), 0.3));
}
const buttonMat = new THREE.MeshPhysicalMaterial({ color: 0x1a1214, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
const eyeWhite = feltMat(0xfffaf0, 0.3);

// ---------- backdrop: felt hills + cloud puffs far below/around ----------
const bg = new THREE.Group(); scene.add(bg);
for (let i = 0; i < 26; i++) {
  const a = (i / 26) * Math.PI * 2, r = 55 + Math.random() * 25;
  const m = new THREE.Mesh(new THREE.SphereGeometry(6 + Math.random() * 7, 20, 14), feltMat([0x9fbf8a, 0x86ad7a, 0xb7cf96, 0xc8a27a][i % 4], 2));
  m.position.set(Math.cos(a) * r, -16 - Math.random() * 6, Math.sin(a) * r); m.scale.y = 0.55; bg.add(m);
}
const clouds = [];
for (let i = 0; i < 14; i++) {
  const g = new THREE.Group();
  for (let j = 0; j < 4; j++) { const p = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random(), 16, 12), feltMat(0xfffaf2, 0.5)); p.position.set(j * 1.8 - 2.7, Math.random() * 0.8, Math.random() - 0.5); g.add(p); }
  const a = Math.random() * 6.28, r = 35 + Math.random() * 30; g.position.set(Math.cos(a) * r, -4 - Math.random() * 14, Math.sin(a) * r); g.scale.setScalar(1 + Math.random());
  bg.add(g); clouds.push(g);
}
const under = new THREE.Mesh(new THREE.CircleGeometry(140, 48), feltMat(0x93b783, 10)); under.rotation.x = -Math.PI / 2; under.position.y = -22; under.receiveShadow = true; bg.add(under);

// ---------- arena: quilt patches ----------
const TILE = 4;
const PATCH_COLORS = [0xe8a87c, 0xd98a8a, 0x9fc6a8, 0xa9c2e0, 0xe9cf84, 0xc4a0c8, 0xf0e2c8, 0xb8d08c];
const patchGeo = new THREE.BoxGeometry(TILE * 0.98, 0.7, TILE * 0.98);
const patchMats = PATCH_COLORS.map((c, i) => {
  const t = patchTex(c, i);
  return fuzz(new THREE.MeshPhysicalMaterial({ map: t.map, bumpMap: t.bump, bumpScale: 2, roughness: 1, sheen: 0.7, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xfff2e6) }), 0.12);
});
const sideMat = feltMat(0xc79a7a, 1);
let patches = new Map(), arena = new THREE.Group(); scene.add(arena);
const key = (i, j) => i + ',' + j;
function buildArena(radius) {
  scene.remove(arena); arena = new THREE.Group(); scene.add(arena); patches = new Map();
  const n = Math.ceil(radius);
  for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
    const d = Math.hypot(i, j); if (d > radius) continue;
    const mats = [sideMat, sideMat, patchMats[(i * 3 + j * 5 + 64) % 8], sideMat, sideMat, sideMat];
    const m = new THREE.Mesh(patchGeo, mats); m.position.set(i * TILE, -0.35, j * TILE);
    m.receiveShadow = true; m.castShadow = true; arena.add(m);
    patches.set(key(i, j), { m, i, j, d: d + Math.random() * 0.4, state: 0, t: 0, vy: 0, spin: (Math.random() - 0.5) * 2 });
  }
}
function patchAt(x, z) {
  const p = patches.get(key(Math.round(x / TILE), Math.round(z / TILE)));
  return p && p.state < 2 ? p : null;
}

// ---------- sheep ----------
const woolGeo = new THREE.SphereGeometry(1, 22, 16);
const puffGeo = new THREE.SphereGeometry(0.42, 14, 10);
const headGeo = new THREE.SphereGeometry(0.42, 18, 14);
const legGeo = new THREE.CylinderGeometry(0.14, 0.12, 0.6, 10); legGeo.translate(0, -0.3, 0);
const earGeo = new THREE.SphereGeometry(0.2, 10, 8);
const eyeGeo = new THREE.CircleGeometry(0.12, 16);
const btnGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.04, 14); btnGeo.rotateX(Math.PI / 2);
const BOT_COLORS = [0xf3e9d6, 0xe89a9a, 0x9fd4b4, 0x9cc0e6, 0xe6c060, 0x9a6a9e, 0x4a4448, 0xf0b088, 0xb5d07a, 0xd6a8c8, 0x88c8c8, 0xf3e9d6];
const NAMES = ['Woolbert', 'Baarbara', 'Lambo', 'Mutton', 'Fleecy', 'Dolly-O', 'Ramsey', 'Shorn', 'Tufty', 'Bleatrix', 'Purl', 'Skein', 'Chunky', 'Cardi', 'Bobbin'];
function makeSheep(color, face = 0x3a2a2a) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const rainbow = color === -1;
  const wm = (k) => knitMat(rainbow ? [0xe89a9a, 0xe6c060, 0x9fd4b4, 0x9cc0e6, 0x9a6a9e][k % 5] : color, 2);
  const core = new THREE.Mesh(woolGeo, wm(0)); core.scale.set(0.95, 0.8, 1.1); core.position.y = 1.05; body.add(core);
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2, p = new THREE.Mesh(puffGeo, wm(k + 1));
    p.position.set(Math.cos(a) * 0.72, 1.25 + Math.sin(k * 2.3) * 0.25, Math.sin(a) * 0.85); p.scale.setScalar(0.9 + (k % 3) * 0.15); body.add(p);
  }
  const top = new THREE.Mesh(puffGeo, wm(3)); top.position.set(0, 1.8, 0.1); body.add(top);
  const fm = feltMat(face, 0.6);
  const head = new THREE.Group(); head.position.set(0, 1.25, 1.05); body.add(head);
  const hm = new THREE.Mesh(headGeo, fm); hm.scale.set(0.9, 1, 1.15); head.add(hm);
  const tuft = new THREE.Mesh(puffGeo, wm(2)); tuft.position.set(0, 0.36, -0.05); tuft.scale.setScalar(0.6); head.add(tuft);
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, fm); ear.scale.set(1.4, 0.5, 0.8); ear.position.set(s * 0.45, 0.12, -0.05); ear.rotation.z = s * -0.4; head.add(ear);
    const ew = new THREE.Mesh(eyeGeo, eyeWhite); ew.position.set(s * 0.17, 0.1, 0.42); ew.rotation.y = s * 0.3; head.add(ew);
    const b = new THREE.Mesh(btnGeo, buttonMat); b.position.set(s * 0.18, 0.1, 0.45); b.rotation.y = s * 0.3; head.add(b);
  }
  const legs = [];
  for (const [x, z] of [[-0.45, 0.5], [0.45, 0.5], [-0.45, -0.5], [0.45, -0.5]]) { const l = new THREE.Mesh(legGeo, fm); l.position.set(x, 0.6, z); body.add(l); legs.push(l); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  return { g, body, head, legs };
}

// ---------- particles: wool tufts ----------
const tuftGeo = new THREE.IcosahedronGeometry(0.18, 0);
const tufts = [];
function puff(pos, color, n = 10, spd = 6) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(tuftGeo, knitMat(color === -1 ? 0xf3e9d6 : color, 0.5));
    m.position.copy(pos); scene.add(m);
    tufts.push({ m, v: new THREE.Vector3((Math.random() - 0.5) * spd, Math.random() * spd * 0.8 + 2, (Math.random() - 0.5) * spd), life: 0.8 + Math.random() * 0.5 });
  }
}

// ---------- game state ----------
let sheep = [], player, state = 'play', roundT = 0, dropT = 0, shake = 0, hitStop = 0, msgT = 0, lastKiller = null, earned = 0, kills = 0, place = 0;
const keys = {};
const touchV = { x: 0, y: 0 }; let touchRam = false;
function msg(t, dur = 1.6) { $('msg').textContent = t; $('msg').style.opacity = 1; msgT = dur; }
function hud() {
  const alive = sheep.filter((s) => s.alive).length;
  $('alive').className = 'tag'; $('alive').textContent = '🐑 ' + alive + ' left';
  $('lvl').className = 'tag'; $('lvl').textContent = 'Field ' + save.lvl;
  $('yarn').className = 'tag'; $('yarn').textContent = '🧶 ' + (save.yarn + earned);
}

function startRound() {
  for (const s of sheep) scene.remove(s.g);
  for (const t of tufts) scene.remove(t.m); tufts.length = 0;
  const L = save.lvl;
  const nBots = Math.min(5 + L, 14);
  const radius = Math.min(3.2 + L * 0.25, 5.5);
  buildArena(radius);
  sheep = [];
  const total = nBots + 1;
  for (let k = 0; k < total; k++) {
    const isP = k === 0;
    const color = isP ? COLORS[save.color].c : BOT_COLORS[k % BOT_COLORS.length];
    const parts = makeSheep(color, isP ? 0x3a2a2a : [0x3a2a2a, 0x5a4038, 0x2a2a32][k % 3]);
    const a = (k / total) * Math.PI * 2, r = radius * TILE * 0.6;
    const s = { ...parts, color, isP, name: isP ? 'You' : NAMES[k % NAMES.length], pos: new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r), vel: new THREE.Vector3(), vy: 0,
      yaw: a + Math.PI, alive: true, falling: false, dash: 0, cd: 0.5, fluster: 0, lastHit: null, lastHitT: 0, walk: Math.random() * 6, squash: 0,
      ai: { t: 0, target: null, aggro: Math.min(0.35 + L * 0.06, 0.95), wander: new THREE.Vector3() } };
    s.g.position.copy(s.pos); scene.add(s.g); sheep.push(s);
  }
  player = sheep[0];
  roundT = 0; dropT = Math.max(7 - L * 0.3, 3.5); earned = 0; kills = 0; place = 0; state = 'play';
  $('panel').classList.add('hide'); $('dashbar').classList.remove('hide');
  msg('BAA-TTLE!', 1.4); sfx('baa', 1);
  hud();
}

// ---------- input ----------
addEventListener('keydown', (e) => { keys[e.code] = true; unlockAudio(); if (e.code === 'Space') e.preventDefault(); if (e.code === 'Enter' && state === 'over') next(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', unlockAudio);
(function touch() {
  const st = $('stick'), knob = st.querySelector('i'); let id = null, cx = 0, cy = 0;
  st.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = st.getBoundingClientRect(); cx = r.left + r.width / 2; cy = r.top + r.height / 2; st.setPointerCapture(id); });
  st.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return; let dx = e.clientX - cx, dy = e.clientY - cy; const l = Math.hypot(dx, dy), m = 50;
    if (l > m) { dx *= m / l; dy *= m / l; } touchV.x = dx / m; touchV.y = dy / m; knob.style.transform = `translate(${dx}px,${dy}px)`;
  });
  const end = () => { id = null; touchV.x = touchV.y = 0; knob.style.transform = ''; };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  const rb = $('ram'); rb.addEventListener('pointerdown', (e) => { e.preventDefault(); touchRam = true; });
})();

// ---------- AI ----------
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();
function edgeDanger(x, z) { // 0 safe .. 1 about to fall: probe ahead
  let d = 0;
  for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (!patchAt(x + Math.cos(a) * 2.6, z + Math.sin(a) * 2.6)) d++; }
  return d / 8;
}
function think(s, dt) {
  const ai = s.ai; ai.t -= dt;
  if (ai.t <= 0 || !ai.target || !ai.target.alive) {
    ai.t = 0.6 + Math.random() * 0.8;
    let best = null, bd = 1e9;
    for (const o of sheep) if (o !== s && o.alive && !o.falling) { const d = o.pos.distanceTo(s.pos) * (o.isP ? 0.8 : 1) + Math.random() * 3; if (d < bd) { bd = d; best = o; } }
    ai.target = Math.random() < ai.aggro ? best : null;
    ai.wander.set((Math.random() - 0.5) * 6, 0, (Math.random() - 0.5) * 6);
  }
  const mv = tmp.set(0, 0, 0); let ram = false;
  if (ai.target) {
    tmp2.subVectors(ai.target.pos, s.pos); tmp2.y = 0; const d = tmp2.length(); tmp2.normalize();
    mv.copy(tmp2);
    const fwd = Math.sin(s.yaw) * tmp2.x + Math.cos(s.yaw) * tmp2.z;
    if (d < 5.5 && fwd > 0.9 && s.cd <= 0 && Math.random() < 0.08 + ai.aggro * 0.1) ram = true;
  } else mv.subVectors(ai.wander, s.pos).setY(0).normalize().multiplyScalar(0.6);
  // edge avoidance: pull toward the safest nearby ground
  const dang = edgeDanger(s.pos.x, s.pos.z);
  if (dang > 0) {
    let bx = 0, bz = 0;
    for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; if (patchAt(s.pos.x + Math.cos(a) * 3, s.pos.z + Math.sin(a) * 3)) { bx += Math.cos(a); bz += Math.sin(a); } }
    const l = Math.hypot(bx, bz) || 1; mv.x += (bx / l) * dang * 2.2; mv.z += (bz / l) * dang * 2.2;
  }
  return { mv: mv.length() > 1 ? mv.normalize() : mv, ram };
}

// ---------- simulation ----------
const ACC = 26, MAXV = 7.5, DASHV = 19;
function control(s, dt) {
  let inp;
  if (s.isP && !BOT) {
    const v = new THREE.Vector3((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touchV.x, 0,
      (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0) + touchV.y);
    if (v.length() > 1) v.normalize();
    inp = { mv: v, ram: keys.Space || keys.ShiftLeft || keys.KeyJ || touchRam }; touchRam = false;
  } else inp = think(s, dt);
  if (s.dash <= 0) {
    s.vel.x += inp.mv.x * ACC * dt; s.vel.z += inp.mv.z * ACC * dt;
    if (inp.mv.lengthSq() > 0.01) { const ty = Math.atan2(inp.mv.x, inp.mv.z); let d = ty - s.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); s.yaw += d * Math.min(1, dt * 12); }
  }
  if (inp.ram && s.cd <= 0 && !s.falling) {
    s.dash = 0.28; s.cd = 1.1; s.vel.x = Math.sin(s.yaw) * DASHV; s.vel.z = Math.cos(s.yaw) * DASHV; s.squash = 1;
    sfx('whoosh', s.isP ? 1 : 0.35); if (Math.random() < 0.35) sfx('baa', s.isP ? 0.8 : 0.25);
  }
}
function collide() {
  for (let a = 0; a < sheep.length; a++) for (let b = a + 1; b < sheep.length; b++) {
    const A = sheep[a], B = sheep[b]; if (!A.alive || !B.alive) continue;
    if (Math.abs(A.pos.y - B.pos.y) > 1.5) continue;
    const dx = B.pos.x - A.pos.x, dz = B.pos.z - A.pos.z, d = Math.hypot(dx, dz), R = 1.9;
    if (d >= R || d < 1e-4) continue;
    const nx = dx / d, nz = dz / d, push = (R - d) / 2;
    A.pos.x -= nx * push; A.pos.z -= nz * push; B.pos.x += nx * push; B.pos.z += nz * push;
    const rv = (A.vel.x - B.vel.x) * nx + (A.vel.z - B.vel.z) * nz; if (rv <= 0) continue;
    // rammer gets the right of way; target's fluster amplifies knockback (repeated hits hurt more)
    const aR = A.dash > 0, bR = B.dash > 0;
    let kA = 1, kB = 1;
    if (aR && !bR) { kB = 2.4 + B.fluster; kA = 0.25; B.lastHit = A; B.lastHitT = 4; B.fluster += 0.35; }
    else if (bR && !aR) { kA = 2.4 + A.fluster; kB = 0.25; A.lastHit = B; A.lastHitT = 4; A.fluster += 0.35; }
    else { kA = kB = 1.2; A.lastHit = B; B.lastHit = A; A.lastHitT = B.lastHitT = 3; }
    const j = rv * 0.6;
    A.vel.x -= nx * j * kA; A.vel.z -= nz * j * kA; B.vel.x += nx * j * kB; B.vel.z += nz * j * kB;
    A.vy += j * 0.05 * kA; B.vy += j * 0.05 * kB;
    const big = aR || bR, mid = tmp.set((A.pos.x + B.pos.x) / 2, 1.2, (A.pos.z + B.pos.z) / 2);
    if (big) {
      A.dash = B.dash = 0; puff(mid, aR ? B.color : A.color, 14, 8);
      const near = A.isP || B.isP; sfx('bonk', near ? 1 : 0.4); if (near) { shake = Math.max(shake, 0.5); hitStop = 0.06; }
      (aR ? B : A).squash = -1;
    } else if (rv > 3) sfx('bump', 0.25);
  }
}
function eliminate(s) {
  s.alive = false; scene.remove(s.g);
  const alive = sheep.filter((o) => o.alive);
  if (s.lastHit === player && !s.isP && s.lastHitT > 0) { kills++; earned += 10; msg('RAMMED ' + s.name.toUpperCase() + '! +10🧶', 1.2); sfx('coin', 1); }
  if (s.isP) { place = alive.length + 1; endRound(false); }
  else if (alive.length === 1 && alive[0].isP) { place = 1; endRound(true); }
  hud();
}
function step(dt) {
  roundT += dt;
  // quilt unravels from the outside in
  dropT -= dt;
  const live = [...patches.values()].filter((p) => p.state === 0);
  if (dropT <= 0 && live.length > 4) {
    dropT = Math.max(4.5 - save.lvl * 0.2, 2);
    live.sort((a, b) => b.d - a.d);
    const n = Math.max(1, Math.ceil(live.length * 0.12));
    for (let k = 0; k < n && live.length - k > 4; k++) { live[k].state = 1; live[k].t = 1.6; }
    sfx('rip', 0.5);
  }
  for (const p of patches.values()) {
    if (p.state === 1) { p.t -= dt; p.m.position.y = -0.35 + Math.sin(roundT * 60) * 0.06; p.m.rotation.z = Math.sin(roundT * 47) * 0.03; if (p.t <= 0) { p.state = 2; } }
    else if (p.state === 2) { p.vy -= 30 * dt; p.m.position.y += p.vy * dt; p.m.rotation.x += p.spin * dt; p.m.rotation.z += p.spin * 0.7 * dt; if (p.m.position.y < -40) { arena.remove(p.m); p.state = 3; } }
  }
  for (const s of sheep) {
    if (!s.alive) continue;
    s.cd -= dt; s.dash -= dt; s.lastHitT -= dt; s.fluster = Math.max(0, s.fluster - dt * 0.08);
    if (!s.falling) control(s, dt);
    // friction & speed cap
    const sp = Math.hypot(s.vel.x, s.vel.z);
    if (s.dash <= 0 && !s.falling) { const f = Math.max(0, 1 - dt * (sp > MAXV ? 2.2 : 4.5)); s.vel.x *= f; s.vel.z *= f; if (sp > MAXV * 3) { s.vel.x *= MAXV * 3 / sp; s.vel.z *= MAXV * 3 / sp; } }
  }
  collide();
  for (const s of sheep) {
    if (!s.alive) continue;
    s.pos.x += s.vel.x * dt; s.pos.z += s.vel.z * dt;
    const ground = !s.falling && patchAt(s.pos.x, s.pos.z);
    if (ground && s.pos.y <= 0.01 && s.vy <= 0) { s.pos.y = 0; s.vy = 0; }
    else { s.vy -= 32 * dt; s.pos.y += s.vy * dt; if (!ground && s.pos.y < -0.3 && !s.falling) { s.falling = true; sfx('fall', s.isP ? 1 : 0.3); if (s.isP) shake = 0.6; } }
    if (s.pos.y < -18) { puff(s.pos.clone().setY(-18), s.color, 8, 5); eliminate(s); continue; }
    // pose
    s.g.position.copy(s.pos); s.g.rotation.y = s.yaw;
    const spd = Math.hypot(s.vel.x, s.vel.z); s.walk += spd * dt * 2.2;
    s.legs.forEach((l, k) => { l.rotation.x = Math.sin(s.walk + (k % 2 ? Math.PI : 0) + (k > 1 ? Math.PI : 0)) * Math.min(0.8, spd * 0.12); });
    s.squash *= Math.pow(0.002, dt);
    const sq = s.squash; s.body.scale.set(1 - sq * 0.15, 1 + sq * 0.2 + Math.abs(Math.sin(s.walk)) * Math.min(0.05, spd * 0.008), 1 + sq * 0.25);
    s.body.rotation.x = s.dash > 0 ? 0.3 : spd * 0.015; s.head.rotation.x = s.dash > 0 ? 0.5 : 0;
    if (s.falling) { s.g.rotation.x += dt * 4; s.g.rotation.z += dt * 2; }
  }
  if (player.alive && state === 'play' && roundT > 120) { const alive = sheep.filter((o) => o.alive); place = alive.length; endRound(alive.length === 1); }
}

function endRound(win) {
  if (state !== 'play') return;
  state = 'over';
  const n = sheep.length; earned += Math.round((n - place) * 3) + (win ? 25 + save.lvl * 5 : 0);
  save.yarn += earned; if (win) { save.lvl++; save.wins++; } store();
  sfx(win ? 'win' : 'lose', 1);
  msg(win ? 'LAST SHEEP STANDING!' : 'FLEECED!', 2.2);
  setTimeout(() => showPanel(win), 1300);
}
function swatches() {
  return '<div class="sw">' + COLORS.map((c, i) => {
    const own = save.owned.includes(i), bgc = c.c === -1 ? 'linear-gradient(135deg,#e89a9a,#e6c060,#9fd4b4,#9cc0e6,#9a6a9e)' : '#' + c.c.toString(16).padStart(6, '0');
    return `<b data-i="${i}" class="${save.color === i ? 'on' : ''}" style="background:${bgc}">${own ? '' : c.cost}</b>`;
  }).join('') + '</div>';
}
function bindSwatches(rerender) {
  $('panel').querySelectorAll('.sw b').forEach((b) => b.onclick = () => {
    const i = +b.dataset.i, c = COLORS[i];
    if (!save.owned.includes(i)) { if (save.yarn < c.cost) { sfx('bump', 1); return; } save.yarn -= c.cost; save.owned.push(i); sfx('coin', 1); }
    save.color = i; store(); rerender();
  });
}
function showPanel(win) {
  const P = $('panel'); P.classList.remove('hide');
  const r = () => {
    P.innerHTML = `<h2>${win ? '🏆 Field cleared!' : 'Fleeced! #' + place + ' of ' + sheep.length}</h2>
    <p>Rams: <b>${kills}</b> &nbsp; Yarn earned: <b>${earned}🧶</b></p><p>Total yarn: <b>${save.yarn}🧶</b> &nbsp; Wins: ${save.wins}</p>
    <p style="margin-top:10px">Knit a new coat:</p>${swatches()}
    <button id="go">${win ? 'Next field ▶' : 'Try again ▶'}</button>`;
    $('go').onclick = next; bindSwatches(r);
  };
  r();
  if (BOT) setTimeout(next, 600);
}
function next() { if (state === 'over' || state === 'title') startRound(); }
function title() {
  state = 'title'; buildArena(4); $('dashbar').classList.add('hide'); const P = $('panel'); P.classList.remove('hide');
  const r = () => {
    P.innerHTML = `<h1>CRAZY CATTLE</h1><p>A knitted sheep battle royale.</p><p><b>WASD / arrows</b> move &nbsp; <b>Space</b> ram</p>
    <p>Field ${save.lvl} &nbsp; 🧶 ${save.yarn}</p>${swatches()}<button id="go">Play ▶</button>`;
    $('go').onclick = () => { unlockAudio(); startRound(); }; bindSwatches(r);
  };
  r();
}

// ---------- camera + loop ----------
const camPos = new THREE.Vector3(0, 22, 20), look = new THREE.Vector3();
let last = performance.now(), frames = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - last) / 1000); last = now; frames++;
  if (hitStop > 0) { hitStop -= dt; dt *= 0.1; }
  if (state === 'play' || state === 'over') step(dt);
  for (let i = tufts.length - 1; i >= 0; i--) {
    const t = tufts[i]; t.life -= dt; t.v.y -= 9 * dt; t.v.multiplyScalar(1 - dt * 1.5); t.m.position.addScaledVector(t.v, dt); t.m.rotation.x += dt * 5; t.m.scale.setScalar(Math.max(0.01, t.life));
    if (t.life <= 0) { scene.remove(t.m); tufts.splice(i, 1); }
  }
  clouds.forEach((c, i) => { c.position.y += Math.sin(now * 0.0005 + i) * 0.005; });
  bg.rotation.y += dt * 0.01;
  // camera follows player (or survivors' centroid once the player is out)
  const focus = tmp2.set(0, 0, 0);
  if (state === 'title') focus.set(Math.sin(now * 0.0002) * 4, 0, 0);
  else if (player && player.alive && !player.falling) focus.copy(player.pos).multiplyScalar(0.7);
  else { const al = sheep.filter((s) => s.alive && !s.falling); al.forEach((s) => focus.add(s.pos)); if (al.length) focus.divideScalar(al.length); }
  focus.y = 0;
  const portrait = cam.aspect < 0.8 ? 1.35 : 1;
  look.lerp(focus, 1 - Math.pow(0.02, dt));
  camPos.set(look.x, 20 * portrait, look.z + 17 * portrait);
  cam.position.lerp(camPos, 1 - Math.pow(0.01, dt));
  if (shake > 0) { shake -= dt; cam.position.x += (Math.random() - 0.5) * shake; cam.position.y += (Math.random() - 0.5) * shake; }
  cam.lookAt(look);
  sun.position.set(look.x + 14, 26, look.z + 10); sun.target.position.copy(look);
  if (msgT > 0) { msgT -= dt; if (msgT <= 0) $('msg').style.opacity = 0; }
  const c = player && player.alive ? Math.max(0, Math.min(1, 1 - player.cd / 1.1)) : 0; $('dashbar').querySelector('i').style.width = c * 100 + '%';
  renderer.render(scene, cam);
}
window.__cc = { get state() { return state; }, get alive() { return sheep.filter((s) => s.alive).length; }, get save() { return save; }, get frames() { return frames; }, get place() { return place; }, get round() { return roundT; } };
if (Q.has('title')) title(); else startRound();
requestAnimationFrame(frame);
