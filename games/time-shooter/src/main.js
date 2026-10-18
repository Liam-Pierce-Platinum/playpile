// STILLSHOT - time moves only when you move. White room, red crystal enemies.
import * as THREE from 'three';

const Q = new URLSearchParams(location.search);
const MUTE = Q.has('mute');
const $ = (id) => document.getElementById(id);
const TOUCH = matchMedia('(pointer: coarse)').matches || Q.has('touch');
if (TOUCH) document.body.classList.add('touch');
const store = { get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} } };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const BG = 0xf2f2ef;
const scene = new THREE.Scene(); scene.background = new THREE.Color(BG); scene.fog = new THREE.Fog(BG, 16, 44);
const camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120); camera.rotation.order = 'YXZ'; scene.add(camera);
scene.add(new THREE.HemisphereLight(0xffffff, 0xcfcfcf, 2.0));
const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(7, 22, 5); sun.castShadow = true;
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 60 });
sun.shadow.mapSize.set(2048, 2048); sun.shadow.radius = 5; sun.shadow.bias = -0.0005; scene.add(sun);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- materials ----------
const U = { half: { value: 12 }, time: { value: 0 } };
function roomMat(tint = 0xffffff) {
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (s) => {
    s.uniforms.uHalf = U.half;
    s.vertexShader = s.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vWP; uniform float uHalf;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float fl = 1.0 - step(0.02, vWP.y);
        vec2 g = abs(fract(vWP.xz / 2.0 + 0.5) - 0.5);
        float line = smoothstep(0.0, 0.014, min(g.x, g.y));
        float wd = uHalf - max(abs(vWP.x), abs(vWP.z));
        float aoFloor = mix(0.72, 1.0, smoothstep(0.0, 2.2, wd));
        float aoWall = mix(0.74, 1.0, smoothstep(0.0, 1.4, vWP.y));
        diffuseColor.rgb *= mix(aoWall, aoFloor * mix(0.9, 1.0, line), fl);`);
  };
  return m;
}
const ROOM = roomMat(), CRATE = roomMat(0xe9e9e6);
const crystalVS = `
  varying vec3 vW;
  void main() {
    vec4 p = vec4(position, 1.0);
    #ifdef USE_INSTANCING
      p = instanceMatrix * p;
    #endif
    vec4 w = modelMatrix * p; vW = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const crystalFS = `
  uniform float uFlash; uniform float uTime;
  varying vec3 vW;
  float h(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
    vec3 v = normalize(cameraPosition - vW);
    if (dot(n, v) < 0.0) n = -n;
    float fr = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);
    vec3 L = normalize(vec3(0.35, 1.0, 0.3));
    float d = dot(n, L) * 0.5 + 0.5;
    float facet = h(floor(n * 6.0 + 0.5));
    vec3 deep = vec3(0.22, 0.0, 0.015), mid = vec3(0.95, 0.03, 0.03), hi = vec3(1.0, 0.55, 0.45);
    vec3 c = mix(deep, mid, clamp(d * 0.85 + facet * 0.4 - 0.15, 0.0, 1.0));
    float spec = pow(max(dot(reflect(-L, n), v), 0.0), 28.0);
    float band = smoothstep(0.93, 1.0, sin(vW.y * 8.0 + vW.x * 2.0 - uTime * 2.5 + facet * 6.28) * 0.5 + 0.5);
    c += hi * spec * 0.9 + vec3(1.0, 0.5, 0.45) * fr * 0.85 + mid * band * 0.35;
    c = mix(c, vec3(1.0), uFlash);
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`;
const crystal = () => new THREE.ShaderMaterial({ uniforms: { uFlash: { value: 0 }, uTime: U.time }, vertexShader: crystalVS, fragmentShader: crystalFS });
const SHARDMAT = crystal();
const DARK = new THREE.MeshStandardMaterial({ color: 0x161616, roughness: 0.45, metalness: 0.3 });

// ---------- audio ----------
let AC = null, master = null, droneF = null, droneG = null;
function ac() {
  if (MUTE) return null;
  try {
    if (!AC) {
      AC = new (window.AudioContext || window.webkitAudioContext)(); master = AC.createGain(); master.gain.value = 0.45; master.connect(AC.destination);
      droneF = AC.createBiquadFilter(); droneF.type = 'lowpass'; droneF.frequency.value = 200; droneG = AC.createGain(); droneG.gain.value = 0.05;
      for (const f of [55, 55.4, 82.5]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(droneF); o.start(); }
      droneF.connect(droneG); droneG.connect(master);
    }
    if (AC.state === 'suspended') AC.resume();
  } catch { return null; }
  return AC;
}
let NB = null;
function noise(dur, freq, type, vol, delay = 0) {
  const a = ac(); if (!a) return;
  if (!NB) { NB = a.createBuffer(1, a.sampleRate, a.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const s = a.createBufferSource(); s.buffer = NB; const f = a.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = a.createGain();
  const t = a.currentTime + delay; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur);
}
function tone(freq, dur, vol, type = 'sine', to = 0, delay = 0) {
  const a = ac(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(); o.type = type; const t = a.currentTime + delay;
  o.frequency.setValueAtTime(freq, t); if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  shot(w) { noise(0.16, w === 1 ? 900 : 1800, 'lowpass', 0.7); tone(w === 1 ? 90 : 140, 0.1, 0.35, 'square', 40); },
  eshot() { tone(330, 0.25, 0.12, 'sawtooth', 90); noise(0.08, 2500, 'bandpass', 0.15); },
  shatter() { noise(0.55, 4500, 'highpass', 0.5); noise(0.2, 600, 'lowpass', 0.4); for (let i = 0; i < 7; i++) tone(1800 + Math.random() * 3200, 0.25, 0.08, 'triangle', 0, i * 0.03 + Math.random() * 0.05); },
  tick() { noise(0.05, 3000, 'bandpass', 0.15); },
  clink() { tone(2600, 0.12, 0.1, 'triangle'); noise(0.08, 6000, 'highpass', 0.2); },
  die() { tone(160, 1.4, 0.4, 'sawtooth', 30); noise(1.0, 3000, 'highpass', 0.5); },
  clear() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 0.15, 'triangle', 0, i * 0.09)); },
  word() { tone(110, 0.3, 0.35, 'square', 55); noise(0.2, 400, 'lowpass', 0.5); },
};

// ---------- world ----------
const world = new THREE.Group(); scene.add(world);
let boxes = []; // {box: Box3}
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function addBox(x, z, w, d, h, mat = CRATE) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; world.add(m);
  boxes.push(new THREE.Box3(new THREE.Vector3(x - w / 2, 0, z - d / 2), new THREE.Vector3(x + w / 2, h, z + d / 2)));
}
function buildRoom(n) {
  world.clear(); boxes = [];
  const r = rng(n * 7919 + 13);
  const half = Math.min(9 + n * 0.7, 17); U.half.value = half;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), ROOM); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; world.add(floor);
  const H = 6;
  for (const [x, z, w, d] of [[0, -half - 0.5, half * 2 + 2, 1], [0, half + 0.5, half * 2 + 2, 1], [-half - 0.5, 0, 1, half * 2], [half + 0.5, 0, 1, half * 2]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, H, d), ROOM); m.position.set(x, H / 2, z); m.receiveShadow = true; world.add(m);
  }
  const count = 4 + Math.min(n, 9);
  for (let i = 0; i < count; i++) {
    for (let t = 0; t < 20; t++) {
      const pillar = r() < 0.35, w = pillar ? 0.9 + r() * 0.5 : 0.8 + r() * 2.2, d = pillar ? w : 0.8 + r() * 1.6, h = pillar ? H : 0.9 + r() * 0.6;
      const x = (r() * 2 - 1) * (half - 2), z = (r() * 2 - 1) * (half - 2);
      if (Math.hypot(x, z) < 3.2) continue;
      const b = new THREE.Box3(new THREE.Vector3(x - w / 2 - 1, 0, z - d / 2 - 1), new THREE.Vector3(x + w / 2 + 1, h, z + d / 2 + 1));
      if (boxes.some((o) => o.intersectsBox(b))) continue;
      addBox(x, z, w, d, h, pillar ? ROOM : CRATE); break;
    }
  }
  return { half, r };
}

// ---------- shards (instanced pool) ----------
const SHARDS = 1200;
const shardMesh = new THREE.InstancedMesh(new THREE.TetrahedronGeometry(1), SHARDMAT, SHARDS); shardMesh.castShadow = true; shardMesh.frustumCulled = false; scene.add(shardMesh);
const sh = Array.from({ length: SHARDS }, () => ({ p: new THREE.Vector3(0, -50, 0), v: new THREE.Vector3(), q: new THREE.Quaternion(), ax: new THREE.Vector3(1, 0, 0), w: 0, s: 0, live: false }));
let shardIdx = 0; const _m = new THREE.Matrix4(), _s = new THREE.Vector3(), _dq = new THREE.Quaternion();
function clearShards() { for (let i = 0; i < SHARDS; i++) { sh[i].live = false; _m.makeScale(0, 0, 0); shardMesh.setMatrixAt(i, _m); } shardMesh.instanceMatrix.needsUpdate = true; }
clearShards();
function burst(pos, n, size, push, spread = 3) {
  for (let i = 0; i < n; i++) {
    const k = shardIdx = (shardIdx + 1) % SHARDS, o = sh[k];
    o.p.copy(pos).add(_s.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(size));
    o.v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(spread).addScaledVector(push, 0.4 + Math.random() * 0.8);
    o.ax.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(); o.w = 4 + Math.random() * 10;
    o.q.random(); o.s = size * (0.25 + Math.random() * 0.5); o.live = true;
  }
}
function updateShards(dt) {
  let dirty = false;
  for (let i = 0; i < SHARDS; i++) {
    const o = sh[i]; if (!o.live) continue; dirty = true;
    o.v.y -= 9.8 * dt; o.p.addScaledVector(o.v, dt);
    const fy = o.s * 0.35;
    if (o.p.y < fy) { o.p.y = fy; o.v.y *= -0.25; o.v.x *= 0.55; o.v.z *= 0.55; o.w *= 0.5; if (o.v.lengthSq() < 0.02) o.live = 'rest'; }
    const hl = U.half.value - 0.1; o.p.x = THREE.MathUtils.clamp(o.p.x, -hl, hl); o.p.z = THREE.MathUtils.clamp(o.p.z, -hl, hl);
    o.q.multiply(_dq.setFromAxisAngle(o.ax, o.w * dt));
    _m.compose(o.p, o.q, _s.setScalar(o.s)); shardMesh.setMatrixAt(i, _m);
    if (o.live === 'rest') o.live = false;
  }
  if (dirty) shardMesh.instanceMatrix.needsUpdate = true;
}

// ---------- enemies ----------
const GEO = { octa: new THREE.OctahedronGeometry(1, 0), ico: new THREE.IcosahedronGeometry(1, 0) };
function part(geo, mat, sx, sy, sz, x, y, z, parent) { const m = new THREE.Mesh(geo, mat); m.scale.set(sx, sy, sz); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; }
function makeEnemy(x, z, kind) {
  const mat = crystal(), root = new THREE.Group(); root.position.set(x, 0, z);
  const torso = part(GEO.octa, mat, 0.4, 0.62, 0.26, 0, 1.38, 0, root);
  const head = part(GEO.ico, mat, 0.2, 0.24, 0.2, 0, 2.04, 0, root);
  const piv = (px, py) => { const g = new THREE.Group(); g.position.set(px, py, 0); root.add(g); return g; };
  const legL = piv(-0.16, 0.95), legR = piv(0.16, 0.95), armL = piv(-0.44, 1.7), armR = piv(0.44, 1.7);
  const limbs = [legL, legR].map((g) => part(GEO.octa, mat, 0.13, 0.5, 0.13, 0, -0.48, 0, g)).concat([armL, armR].map((g) => part(GEO.octa, mat, 0.1, 0.4, 0.1, 0, -0.38, 0, g)));
  if (kind === 'gun') { const gun = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.32), DARK); gun.position.set(0, -0.75, 0.1); gun.castShadow = true; armR.add(gun); }
  world.add(root);
  return { root, mat, parts: [torso, head, ...limbs], legL, legR, armL, armR, kind, hp: 1, phase: Math.random() * 6, cd: 1.2 + Math.random() * 1.2, wind: 0, flash: 0, dead: false, speed: kind === 'melee' ? 3.3 : 1.6 + Math.random() * 0.5 };
}

// ---------- state ----------
const WEAPONS = [
  { name: 'PISTOL', cd: 0.3, pellets: 1, spread: 0.004, unlock: 1, barrel: 0.28 },
  { name: 'SCATTER', cd: 0.8, pellets: 7, spread: 0.07, unlock: 4, barrel: 0.42 },
  { name: 'RAPID', cd: 0.11, pellets: 1, spread: 0.02, unlock: 7, barrel: 0.55 },
];
const G = window.__G = {
  state: 'play', level: store.get('ts_level', 1), best: store.get('ts_best', 1), enemies: [], pending: 0, alive0: 2, bullets: [], tScale: 0.03, gameT: 0, realT: 0,
  yaw: 0, pitch: 0, pos: new THREE.Vector3(0, 1.7, 0), move: new THREE.Vector2(), lookAcc: 0, burstT: 0, cool: 0, weapon: 0, god: false, botMove: null,
  shake: 0, msgT: 0, kills: 0, deaths: 0, stateT: 0, WEAPONS,
};
const keys = {};
const muzzle = new THREE.Vector3();

// viewmodel gun
const vm = new THREE.Group(); camera.add(vm); vm.scale.setScalar(0.55); vm.position.set(0.26, -0.24, -0.5);
const vmBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.11, 0.24), DARK); vm.add(vmBody);
const vmGrip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.07), DARK); vmGrip.position.set(0, -0.11, 0.07); vmGrip.rotation.x = 0.25; vm.add(vmGrip);
const vmBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 1), DARK); vm.add(vmBarrel);
const flashM = new THREE.Mesh(new THREE.OctahedronGeometry(0.07, 0), new THREE.MeshBasicMaterial({ color: 0xfff2d8 })); vm.add(flashM); flashM.visible = false;
function setWeapon(i) {
  if (WEAPONS[i].unlock > G.best) return; G.weapon = i; const w = WEAPONS[i];
  vmBarrel.scale.z = w.barrel; vmBarrel.position.set(0, 0.02, -0.12 - w.barrel / 2); flashM.position.set(0, 0.02, -0.14 - w.barrel);
  $('wpns').innerHTML = WEAPONS.map((x, k) => `<span class="${k === i ? 'on' : ''} ${x.unlock > G.best ? 'lock' : ''}">${k + 1} ${x.unlock > G.best ? 'LV' + x.unlock : x.name}</span>`).join('');
}

function say(html, t = 1.2) { $('msg').innerHTML = html; G.msgT = t; }
G.start = (n = G.level) => {
  G.level = n; G.state = 'play'; G.stateT = 0; G.gameT = 0; G.tScale = 0.03;
  for (const b of G.bullets) scene.remove(b.obj); G.bullets = []; G.enemies = []; clearShards();
  const { half, r } = buildRoom(n); G.half = half;
  G.pos.set(0, 1.7, 0); G.yaw = 0; G.pitch = 0;
  const total = Math.min(2 + n, 16); G.alive0 = Math.min(total, 2 + Math.floor(n / 2)); G.pending = total; G.rng = r;
  for (let i = 0; i < G.alive0; i++) spawn(true);
  setWeapon(Math.min(G.weapon, WEAPONS.filter((w) => w.unlock <= G.best).length - 1));
  $('lvl').textContent = 'LEVEL ' + n; say(`${n}<small>LEVEL</small>`, 1.0); updateLeft();
};
function spawn(initial) {
  const r = G.rng, half = G.half; let x, z;
  for (let t = 0; t < 40; t++) {
    if (initial) { const a = r() * Math.PI * 2 * 0.6 + Math.PI * 0.7, d = 7 + r() * (half - 7.5); x = Math.sin(a) * d; z = -Math.cos(a) * d * -1; z = -Math.abs(z) * (r() < 0.75 ? 1 : -1); }
    else { const e = Math.floor(r() * 4), u = (r() * 2 - 1) * (half - 1.5); [x, z] = [[u, -half + 0.8], [u, half - 0.8], [-half + 0.8, u], [half - 0.8, u]][e]; }
    if (Math.hypot(x - G.pos.x, z - G.pos.z) < 6.5) continue;
    if (boxes.some((b) => x > b.min.x - 0.6 && x < b.max.x + 0.6 && z > b.min.z - 0.6 && z < b.max.z + 0.6)) continue;
    break;
  }
  const kind = G.level >= 3 && r() < 0.28 ? 'melee' : 'gun';
  const e = makeEnemy(x, z, kind); e.flash = initial ? 0 : 1; G.enemies.push(e); G.pending--;
  if (!initial) burst(new THREE.Vector3(x, 1.3, z), 10, 0.25, new THREE.Vector3(), 1);
}
function updateLeft() { const n = G.pending + G.enemies.filter((e) => !e.dead).length; $('left').textContent = n + ' LEFT'; return n; }

// ---------- bullets ----------
const BGEO = new THREE.CylinderGeometry(1, 1, 1, 6); BGEO.translate(0, -0.5, 0);
const PB = new THREE.MeshBasicMaterial({ color: 0x1a1a1a }), EB = new THREE.MeshBasicMaterial({ color: 0xff2a14 });
const PT = new THREE.MeshBasicMaterial({ color: 0x333333, transparent: true, opacity: 0.18, depthWrite: false }), ET = new THREE.MeshBasicMaterial({ color: 0xff3a22, transparent: true, opacity: 0.35, depthWrite: false });
const UP = new THREE.Vector3(0, 1, 0);
function fireBullet(from, dir, enemy) {
  const obj = new THREE.Group(); obj.position.copy(from); obj.quaternion.setFromUnitVectors(UP, _s.copy(dir).negate());
  const head = new THREE.Mesh(BGEO, enemy ? EB : PB); head.scale.set(enemy ? 0.045 : 0.022, enemy ? 0.35 : 0.3, enemy ? 0.045 : 0.022); head.position.y = 0;
  const trail = new THREE.Mesh(BGEO, enemy ? ET : PT); trail.scale.set(enemy ? 0.02 : 0.012, 0.01, enemy ? 0.02 : 0.012);
  obj.add(head, trail); scene.add(obj);
  G.bullets.push({ obj, trail, pos: from.clone(), dir: dir.clone(), speed: enemy ? 7.5 : 46, enemy, dist: 0, life: 0 });
}
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3();
function segDist(p, ax, ay0, ay1, az) { const y = THREE.MathUtils.clamp(p.y, ay0, ay1); return Math.hypot(p.x - ax, p.y - y, p.z - az); }
function inBox(p) { for (const b of boxes) if (b.containsPoint(p)) return true; return false; }

function killEnemy(e, dir) {
  e.dead = true; world.remove(e.root); G.kills++;
  e.root.updateMatrixWorld(true);
  e.parts.forEach((m, i) => burst(m.getWorldPosition(_c), i === 0 ? 26 : i === 1 ? 12 : 7, i === 0 ? 0.5 : 0.24, dir, 2.2));
  SFX.shatter(); G.shake = Math.max(G.shake, 0.12); camera.fov = 78; camera.updateProjectionMatrix();
  if (updateLeft() === 0) { G.state = 'won'; G.stateT = 0; }
}
function playerDie(from) {
  if (G.god || G.state !== 'play') return;
  G.state = 'dead'; G.stateT = 0; G.deaths++; SFX.die(); G.shake = 0.35; $('flash').style.opacity = 0.55;
  burst(_c.copy(G.pos).addScaledVector(camera.getWorldDirection(_a), 0.6), 30, 0.3, from || new THREE.Vector3(), 2);
  say('SHATTERED<small>' + (TOUCH ? 'TAP' : 'CLICK / R') + ' TO RETRY</small>', 99);
}

// ---------- input ----------
const cv = $('c');
addEventListener('keydown', (e) => { keys[e.code] = true; if (e.code === 'KeyR' && G.state === 'dead') G.start(); if (/^Digit[1-3]$/.test(e.code)) setWeapon(+e.code[5] - 1); if (e.code === 'KeyQ') cycleWeapon(); if (e.code === 'KeyM' && master) master.gain.value = master.gain.value ? 0 : 0.45; });
addEventListener('keyup', (e) => { keys[e.code] = false; });
function cycleWeapon() { const n = WEAPONS.filter((w) => w.unlock <= G.best).length; setWeapon((G.weapon + 1) % n); }
function look(dx, dy, s = 0.0022) { G.yaw -= dx * s; G.pitch = THREE.MathUtils.clamp(G.pitch - dy * s, -1.45, 1.45); G.lookAcc += Math.hypot(dx, dy); }
addEventListener('mousemove', (e) => { if (document.pointerLockElement === cv) look(e.movementX, e.movementY); });
cv.addEventListener('mousedown', (e) => {
  if (TOUCH) return; ac();
  if (G.state === 'dead') { if (G.stateT > 0.5) G.start(); return; }
  if (document.pointerLockElement !== cv) { try { cv.requestPointerLock(); } catch {} return; }
  if (e.button === 0) G.fire();
});
// touch: left stick, right-side drag looks, fire button
const stick = { id: null, x: 0, y: 0 }, lookT = { id: null, x: 0, y: 0 };
addEventListener('touchstart', (e) => {
  ac();
  if (G.state === 'dead' && G.stateT > 0.5) { G.start(); return; }
  for (const t of e.changedTouches) {
    const el = t.target;
    if (el.id === 'fire') { G.fire(); continue; }
    if (el.id === 'wbtn') { cycleWeapon(); continue; }
    if (t.clientX < innerWidth * 0.4 && stick.id == null) { stick.id = t.identifier; stick.x = t.clientX; stick.y = t.clientY; }
    else if (lookT.id == null) { lookT.id = t.identifier; lookT.x = t.clientX; lookT.y = t.clientY; }
  }
}, { passive: true });
addEventListener('touchmove', (e) => {
  for (const t of e.changedTouches) {
    if (t.identifier === stick.id) { const dx = t.clientX - stick.x, dy = t.clientY - stick.y, l = Math.min(1, Math.hypot(dx, dy) / 50), a = Math.atan2(dy, dx); G.move.set(Math.cos(a) * l, Math.sin(a) * l); $('stick').firstChild.style.transform = `translate(${G.move.x * 38}px,${G.move.y * 38}px)`; }
    if (t.identifier === lookT.id) { look(t.clientX - lookT.x, t.clientY - lookT.y, 0.005); lookT.x = t.clientX; lookT.y = t.clientY; }
  }
}, { passive: true });
addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (t.identifier === stick.id) { stick.id = null; G.move.set(0, 0); $('stick').firstChild.style.transform = ''; } if (t.identifier === lookT.id) lookT.id = null; } });

G.fire = () => {
  if (G.state !== 'play' || G.cool > 0) return false;
  const w = WEAPONS[G.weapon]; G.cool = w.cd; G.burstT = 0.16;
  camera.updateMatrixWorld(); const dir = camera.getWorldDirection(_a); flashM.getWorldPosition(muzzle);
  for (let i = 0; i < w.pellets; i++) {
    const d = _b.copy(dir).add(_c.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(w.spread * 2)).normalize();
    // start from the eye so close shots never clip walls, offset visually by the muzzle
    fireBullet(_c.copy(G.pos).addScaledVector(d, 0.35).lerp(muzzle, 0.5), d, false);
  }
  SFX.shot(G.weapon); flashM.visible = true; flashM.rotation.z = Math.random() * 3; vm.position.z = -0.42; vm.rotation.x = 0.18; G.shake = Math.max(G.shake, 0.03 + 0.03 * (G.weapon === 1));
  return true;
};
G.aimAt = (e) => { const t = e.root.position, dx = t.x - G.pos.x, dz = t.z - G.pos.z, dy = 1.4 - G.pos.y; G.yaw = Math.atan2(-dx, -dz); G.pitch = Math.atan2(dy, Math.hypot(dx, dz)); camera.position.copy(G.pos); camera.rotation.set(G.pitch, G.yaw, 0); };

// ---------- update ----------
const _ray = new THREE.Ray(), _hit = new THREE.Vector3();
function los(from, to) { _ray.origin.copy(from); _ray.direction.subVectors(to, from); const L = _ray.direction.length(); _ray.direction.normalize(); for (const b of boxes) if (_ray.intersectBox(b, _hit) && _hit.distanceTo(from) < L) return false; return true; }
function collidePlayer(p, r) {
  const h = G.half - r; p.x = THREE.MathUtils.clamp(p.x, -h, h); p.z = THREE.MathUtils.clamp(p.z, -h, h);
  for (const b of boxes) { const cx = THREE.MathUtils.clamp(p.x, b.min.x, b.max.x), cz = THREE.MathUtils.clamp(p.z, b.min.z, b.max.z), dx = p.x - cx, dz = p.z - cz, d = Math.hypot(dx, dz); if (d < r) { if (d < 1e-4) { p.x += r; continue; } p.x = cx + (dx / d) * r; p.z = cz + (dz / d) * r; } }
}
function update(dt) {
  G.realT += dt; G.stateT += dt; G.cool -= dt; G.burstT -= dt;
  // ----- player movement (real time) -----
  let mx = G.move.x, mz = G.move.y;
  if (G.botMove) [mx, mz] = G.botMove;
  else if (!TOUCH) { mx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0); mz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0); }
  const ml = Math.min(1, Math.hypot(mx, mz));
  if (G.state === 'play' && ml > 0.05) {
    const s = 5.2 * dt / Math.max(1, Math.hypot(mx, mz)), cy = Math.cos(G.yaw), sy = Math.sin(G.yaw);
    G.pos.x += (mx * cy + mz * sy) * s; G.pos.z += (-mx * sy + mz * cy) * s; collidePlayer(G.pos, 0.4);
  }
  // ----- time scale -----
  let target = Math.max(ml, Math.min(0.35, G.lookAcc * 0.01), G.burstT > 0 ? 1 : 0, 0.03);
  if (G.state === 'won') target = G.stateT < 1.2 ? 0.2 : 1;
  if (G.state === 'dead') target = 0.12;
  G.lookAcc = 0;
  G.tScale += (target - G.tScale) * Math.min(1, dt * (target > G.tScale ? 14 : 7));
  const gdt = dt * G.tScale; G.gameT += gdt; U.time.value += gdt;
  // ----- enemies -----
  const live = G.enemies.filter((e) => !e.dead);
  if (G.state === 'play' && G.pending > 0 && live.length < G.alive0) { G.spawnT = (G.spawnT || 0) + gdt; if (G.spawnT > 1.2) { G.spawnT = 0; spawn(false); } }
  for (const e of live) {
    const p = e.root.position, dx = G.pos.x - p.x, dz = G.pos.z - p.z, dist = Math.hypot(dx, dz);
    e.root.rotation.y = Math.atan2(dx, dz);
    e.flash = Math.max(0, e.flash - gdt * 2); e.mat.uniforms.uFlash.value = e.flash;
    const eye = _a.set(p.x, 1.75, p.z), see = los(eye, G.pos);
    let walk = 0;
    if (e.kind === 'melee') {
      if (dist > 1.0) walk = 1;
      if (dist < 1.4 && G.state === 'play') { e.wind += gdt; e.armR.rotation.x = -e.wind * 6; if (e.wind > 0.35) { e.wind = 0; playerDie(_b.set(dx, 0, dz).normalize()); } } else e.wind = Math.max(0, e.wind - gdt);
      e.armL.rotation.x = -1.2; if (e.wind === 0) e.armR.rotation.x = -1.2;
    } else {
      const want = see && dist < 13;
      if (!want || dist > 9) walk = 1;
      e.armR.rotation.x += ((want ? -Math.PI / 2 + Math.atan2(G.pos.y - 1.7, dist) : -0.2) - e.armR.rotation.x) * Math.min(1, gdt * 6);
      if (want && G.state === 'play') {
        e.cd -= gdt;
        if (e.cd <= 0) {
          e.cd = Math.max(0.9, 2.4 - G.level * 0.12) + Math.random() * 0.8;
          e.root.updateMatrixWorld(true); const gp = e.armR.children[1].getWorldPosition(_c).add(_b.set(dx, 0, dz).normalize().multiplyScalar(0.3));
          const aim = _b.copy(G.pos).add(_a.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.5)).sub(gp).normalize();
          fireBullet(gp, aim, true); SFX.eshot(); e.flash = 0.3;
        }
      }
    }
    if (walk) {
      const sp = e.speed * gdt; p.x += (dx / dist) * sp; p.z += (dz / dist) * sp;
      for (const o of live) if (o !== e) { const ox = p.x - o.root.position.x, oz = p.z - o.root.position.z, od = Math.hypot(ox, oz); if (od < 0.9 && od > 1e-3) { p.x += (ox / od) * (0.9 - od) * 0.5; p.z += (oz / od) * (0.9 - od) * 0.5; } }
      collidePlayer(p, 0.45);
      e.phase += gdt * e.speed * 3.2;
    }
    const sw = Math.sin(e.phase) * 0.65 * walk; e.legL.rotation.x = sw; e.legR.rotation.x = -sw; if (e.kind !== 'melee') e.armL.rotation.x = -sw * 0.6;
    e.root.position.y = Math.abs(Math.cos(e.phase)) * 0.05 * walk;
  }
  // ----- bullets -----
  for (const b of G.bullets) {
    if (b.gone) continue;
    let step = b.speed * gdt; const sub = Math.max(1, Math.ceil(step / 0.2)), ds = step / sub;
    for (let i = 0; i < sub && !b.gone; i++) {
      b.pos.addScaledVector(b.dir, ds); b.dist += ds;
      if (b.pos.y < 0 || b.pos.y > 6 || Math.abs(b.pos.x) > G.half || Math.abs(b.pos.z) > G.half || inBox(b.pos)) { b.gone = true; if (!b.enemy) SFX.tick(); break; }
      if (b.enemy) {
        if (segDist(b.pos, G.pos.x, 0.2, G.pos.y + 0.05, G.pos.z) < 0.32) { b.gone = true; playerDie(b.dir); }
      } else {
        for (const e of G.enemies) {
          if (e.dead) continue; const p = e.root.position;
          if (segDist(b.pos, p.x, 0.1, 1.85, p.z) < 0.36 || b.pos.distanceTo(_c.set(p.x, 2.04, p.z)) < 0.26) { b.gone = true; killEnemy(e, b.dir.clone().multiplyScalar(4)); break; }
        }
        if (!b.gone) for (const o of G.bullets) if (o.enemy && !o.gone && o.pos.distanceTo(b.pos) < 0.3) { o.gone = b.gone = true; burst(o.pos, 6, 0.15, b.dir, 1.5); SFX.clink(); break; }
      }
    }
    b.life += gdt; if (b.life > 12) b.gone = true;
    b.obj.position.copy(b.pos); b.trail.scale.y = Math.min(b.dist, b.enemy ? 4 : 2.5);
  }
  G.bullets = G.bullets.filter((b) => { if (b.gone) scene.remove(b.obj); return !b.gone; });
  updateShards(gdt);
  // ----- state transitions -----
  if (G.state === 'won' && G.stateT > 1.0 && !G.wonSaid) {
    G.wonSaid = true; SFX.clear(); const words = ['STILL', 'SHOT', 'STILL', 'SHOT'];
    words.forEach((w, i) => setTimeout(() => { if (G.state === 'won') { say(w, 0.45); SFX.word(); } }, i * 420));
    G.best = Math.max(G.best, G.level + 1); store.set('ts_best', G.best); store.set('ts_level', G.level + 1);
    if (WEAPONS.some((w) => w.unlock === G.level + 1)) setTimeout(() => say(`NEW<small>${WEAPONS.find((w) => w.unlock === G.level + 1).name} UNLOCKED - PRESS Q</small>`, 1.4), 1700);
  }
  if (G.state === 'won' && G.stateT > 3.4) { G.wonSaid = false; G.start(G.level + 1); }
  // ----- juice -----
  G.msgT -= dt; if (G.msgT <= 0 && $('msg').innerHTML) $('msg').innerHTML = '';
  G.shake *= Math.pow(0.02, dt);
  if (camera.fov > 72) { camera.fov = Math.max(72, camera.fov - dt * 20); camera.updateProjectionMatrix(); }
  vm.position.z += (-0.5 - vm.position.z) * Math.min(1, dt * 14); vm.rotation.x *= Math.pow(0.001, dt); if (G.cool < WEAPONS[G.weapon].cd - 0.05) flashM.visible = false;
  vm.position.y = -0.2 + Math.sin(G.realT * 9) * 0.008 * ml; vm.position.x = 0.2 + Math.cos(G.realT * 4.5) * 0.006 * ml;
  camera.position.copy(G.pos).add(_a.set((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake, 0));
  camera.rotation.set(G.pitch, G.yaw, 0);
  $('vig').style.opacity = (1 - G.tScale) * 0.9;
  $('meter').firstChild.style.width = (G.tScale * 100).toFixed(0) + '%';
  $('flash').style.opacity = Math.max(0, +$('flash').style.opacity - dt * 1.2);
  if (G.state === 'dead' && G.stateT > 0.6) { $('flash').style.opacity = Math.max(+$('flash').style.opacity, 0.12); }
  if (droneF) { droneF.frequency.value = 120 + 1500 * G.tScale; droneG.gain.value = 0.03 + 0.05 * G.tScale; }
}
G.step = (dt, n = 1) => { for (let i = 0; i < n; i++) update(dt); };

// ---------- boot ----------
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (!G.paused) update(dt); renderer.render(scene, camera); requestAnimationFrame(frame); }
G.start(G.level);
if (Q.has('title')) {
  G.paused = true; $('title').classList.remove('hide'); $('best').textContent = 'BEST LEVEL ' + G.best;
  $('play').onclick = () => { $('title').classList.add('hide'); G.paused = false; ac(); if (!TOUCH) try { cv.requestPointerLock(); } catch {} };
}
setTimeout(() => { $('hint').style.opacity = 0; }, 7000);
requestAnimationFrame(frame);
