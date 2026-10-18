import * as THREE from 'three';
import { genLevel, newState, step, bot, pickHook, DT, LEVELS, RANGE, KILL_Y } from './sim.js';
import { sfx, unlock, setWind, toggleMute, A } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
// ---------- save ----------
let save = { max: 1, stars: {}, skin: 0 };
try { const s = JSON.parse(localStorage.getItem('stickswing') || 'null'); if (s) save = Object.assign(save, s); } catch (e) {}
const persist = () => { try { localStorage.setItem('stickswing', JSON.stringify(save)); } catch (e) {} };

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: $('c') });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
const hemi = new THREE.HemisphereLight(0xfff6e8, 0x8a7a70, 1.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 30, bottom: -30, near: 1, far: 120 });
sun.shadow.bias = -0.0008; sun.shadow.radius = 5; scene.add(sun, sun.target);

// ---------- paper material: grain fibres + per-facet fold tint + edge shading ----------
const NOISE = `
varying vec3 vWP;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*vn(p); p*=2.03; a*=.5;} return s; }`;
function paper(color, o = {}) {
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true, side: o.side || THREE.FrontSide, transparent: !!o.opacity, opacity: o.opacity || 1 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uFacet = { value: o.facet ?? 0.09 };
    sh.vertexShader = 'varying vec3 vWP;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vWP = (modelMatrix * vec4(transformed,1.0)).xyz;');
    sh.fragmentShader = NOISE + '\nuniform float uFacet;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      vec3 fnW = normalize(cross(dFdx(vWP), dFdy(vWP)));
      float facet = h21(floor(fnW.xy*9.0+fnW.z*5.0+0.5));
      vec2 uv = vWP.xy + vWP.z*0.7;
      float grain = fbm(uv*14.0);
      float fib = vn(vec2(uv.x*90.0, uv.y*7.0)) * vn(vec2(uv.x*6.0, uv.y*80.0+3.0));
      float speck = step(0.985, h21(floor(uv*55.0)));
      diffuseColor.rgb *= (0.9 + 0.12*grain) * (1.0 - uFacet*0.5 + uFacet*facet) * (1.0 - 0.07*fib) * (1.0 - 0.12*speck);
      diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.6, abs(fnW.z)));`);
  };
  return m;
}
const mats = {};
const pm = (c, o) => { const k = c + JSON.stringify(o || {}); return mats[k] || (mats[k] = paper(c, o)); };

// ---------- themes ----------
const THEMES = [
  { sky: ['#f7d9b9', '#f3eadc'], layers: ['#e8a87c', '#d0886a', '#a8665a', '#6e4a52'], wave: '#5b8fa8', hook: '#d94b3d', name: 'Dawn Fold' },
  { sky: ['#cfe8d8', '#f1f3e6'], layers: ['#9ccfa8', '#6fae8a', '#4a8a72', '#2f5d55'], wave: '#3f7f8f', hook: '#e0a030', name: 'Jade Hills' },
  { sky: ['#d9c8ea', '#f4ece8'], layers: ['#b49ad0', '#8d77b8', '#644f92', '#3d3066'], wave: '#4b4f8f', hook: '#ee7f5a', name: 'Dusk Crane' },
  { sky: ['#d4e4f2', '#f6f7f8'], layers: ['#b5cde0', '#8faecb', '#6a8db0', '#43648a'], wave: '#2f5577', hook: '#d64558', name: 'Snow Paper' },
  { sky: ['#f4d8a8', '#f8efe0'], layers: ['#e6b45c', '#d08a3c', '#a85e30', '#6e3a2a'], wave: '#6b5a8a', hook: '#3a7fc0', name: 'Maple Ridge' },
];
const SKINS = [['#f6f1e7', 'Washi'], ['#d9443a', 'Crimson'], ['#2f4f8f', 'Indigo'], ['#3f9a6e', 'Jade'], ['#e2b13c', 'Gold'], ['#2b2b30', 'Ink']];

// ---------- static geometry helpers ----------
function ridgeShape(x0, x1, base, amp, rough, seed) {
  const s = new THREE.Shape(); s.moveTo(x0, -30); let r = seed;
  const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  for (let x = x0; x <= x1; x += 2 + rnd() * 3) s.lineTo(x, base + Math.sin(x * 0.07 + seed) * amp + (rnd() - 0.5) * rough * 2 + Math.max(0, Math.sin(x * 0.023 + seed * 3)) * amp * 1.4);
  s.lineTo(x1, -30); s.closePath(); return s;
}
const ex = (shape, depth) => new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false, curveSegments: 6 });
function cloudShape(w) { const s = new THREE.Shape(); s.moveTo(-w, 0); s.absarc(-w * 0.5, 0.3, w * 0.5, Math.PI, 0, true); s.absarc(w * 0.15, 0.6, w * 0.55, Math.PI, 0, true); s.absarc(w * 0.75, 0.2, w * 0.35, Math.PI, 0, true); s.lineTo(-w, 0); return s; }

let world = new THREE.Group(); scene.add(world);
let hookObjs = [], padObjs = [], waves = [], clouds = [], flag = null, skyTex = null;

function skyTexture(a, b) {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, b); gr.addColorStop(1, a); g.fillStyle = gr; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildWorld(L) {
  scene.remove(world); world.traverse((o) => o.geometry && o.geometry.dispose());
  world = new THREE.Group(); scene.add(world);
  const T = THEMES[Math.floor((L.n - 1) / 6) % THEMES.length];
  if (skyTex) skyTex.dispose(); skyTex = skyTexture(T.sky[0], T.sky[1]); scene.background = skyTex;
  scene.fog = new THREE.Fog(T.sky[1], 60, 190);
  const x0 = -60, x1 = L.end + 80;
  T.layers.forEach((col, i) => {
    const z = -70 + i * 15, base = 14 - i * 6;
    const m = new THREE.Mesh(ex(ridgeShape(x0 - 40 + z, x1 + 40 - z * 0.3, base, 5 - i * 0.6, 2 + i, 3 + i * 17), 1.2), pm(col));
    m.position.z = z; m.castShadow = m.receiveShadow = true; world.add(m);
  });
  // paper sun
  const sunM = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 0.4, 14), pm('#fbf3e4', { facet: 0.2 })); sunM.rotation.x = Math.PI / 2; sunM.position.set(L.end * 0.5, 34, -90); world.add(sunM);
  clouds = [];
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Mesh(ex(cloudShape(2 + (i % 3)), 0.5), pm('#fffaf2', { facet: 0.15 }));
    c.position.set(x0 + i * (x1 - x0) / 14, 18 + (i * 37 % 9), -20 - (i * 13 % 25)); c.castShadow = true; c.userData.v = 0.4 + (i % 4) * 0.2; world.add(c); clouds.push(c);
  }
  // paper water: three folded wave strips
  waves = [];
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Shape(); s.moveTo(x0, -20);
    for (let x = x0; x <= x1; x += 1.5) s.lineTo(x, KILL_Y + 1.5 - i * 0.9 + Math.sin(x * 0.6 + i * 2) * 0.5 + ((x / 1.5) % 2 ? 0.25 : 0));
    s.lineTo(x1, -20); s.closePath();
    const col = new THREE.Color(T.wave).offsetHSL(0, 0, i * 0.08 - 0.04);
    const m = new THREE.Mesh(ex(s, 0.6), pm('#' + col.getHexString(), { facet: 0.2 })); m.position.z = 3 - i * 3.2; m.receiveShadow = true; m.castShadow = i < 2;
    m.userData.i = i; world.add(m); waves.push(m);
  }
  // platforms: stacked folded card blocks
  for (const pl of L.plats) {
    const w = pl.x1 - pl.x0, g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(w, 0.5, 4), pm('#f4ecdc')); top.position.y = -0.25; g.add(top);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.48, w * 0.36, 14, 6, 1), pm(T.layers[2])); body.scale.z = 3.6 / w; body.position.y = -7.4; g.add(body);
    g.traverse((o) => { o.castShadow = o.receiveShadow = true; });
    g.position.set((pl.x0 + pl.x1) / 2, pl.y, 0); world.add(g);
  }
  // hooks: origami stars on a thread from the sky
  hookObjs = L.hooks.map((h) => {
    const g = new THREE.Group();
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.75, 0), pm(T.hook, { facet: 0.35 })); star.scale.set(1, 1, 0.45);
    const star2 = star.clone(); star2.rotation.z = Math.PI / 4; star2.scale.set(0.8, 0.8, 0.5);
    star2.material = pm('#f8f1e3', { facet: 0.35 });
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 30, 3), pm('#7a6a5a')); thread.position.y = 15.6;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.07, 3, 18), new THREE.MeshBasicMaterial({ color: T.hook, transparent: true, opacity: 0 }));
    g.add(star, star2, thread, ring); g.traverse((o) => { o.castShadow = true; });
    g.userData = { h, star, star2, ring }; world.add(g); return g;
  });
  // bounce pads: accordion-folded paper springs
  padObjs = L.pads.map((pd) => {
    const g = new THREE.Group(), w = pd.x1 - pd.x0, n = 6;
    for (let k = 0; k < n; k++) {
      const seg = new THREE.Mesh(new THREE.BoxGeometry(w, 0.08, 3), pm(k % 2 ? '#f5efe2' : T.hook)); seg.position.y = -k * 0.32 - 0.04; seg.rotation.x = (k % 2 ? 1 : -1) * 0.12; seg.castShadow = true; g.add(seg);
    }
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.4, 12, 5), pm(T.layers[3])); post.position.y = -8; g.add(post);
    g.position.set((pd.x0 + pd.x1) / 2, pd.y, 0); g.userData.pd = pd; world.add(g); return g;
  });
  // walls: folded card pillars / hanging blades
  for (const w of L.walls) {
    const h = w.y1 - w.y0, m = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, h, 4), pm('#5a4a56', { facet: 0.3 }));
    m.rotation.y = Math.PI / 4; m.scale.set(1, 1, 2.6); m.position.set((w.x0 + w.x1) / 2, (w.y0 + w.y1) / 2, 0); m.castShadow = m.receiveShadow = true; world.add(m);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.2, 4), pm(T.hook)); cap.position.set(m.position.x, w.y0 < -5 ? w.y1 + 0.5 : w.y0 - 0.5, 0); if (w.y0 > 0) cap.rotation.x = Math.PI; world.add(cap);
  }
  // goal: a folded paper banner flag
  flag = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 9, 5), pm('#7a5a40')); pole.position.y = 4.5;
  const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(3.4, -0.9); fs.lineTo(2.4, -1.6); fs.lineTo(3.4, -2.6); fs.lineTo(0, -2.6);
  const cloth = new THREE.Mesh(new THREE.ShapeGeometry(fs), pm(T.hook, { side: THREE.DoubleSide })); cloth.position.set(0.1, 8.8, 0);
  flag.add(pole, cloth); flag.traverse((o) => { o.castShadow = true; }); flag.userData.cloth = cloth;
  flag.position.set(L.goalX + 1.5, 0, -0.6); world.add(flag);
  // a few paper cranes floating in the distance
  for (let i = 0; i < 6; i++) { const c = crane('#fffaf0'); c.position.set(x0 + 30 + i * (x1 - x0) / 6, 12 + (i % 3) * 3, -30 - i * 4); c.scale.setScalar(1.6); c.userData.fly = i; world.add(c); clouds.push(c); }
}
function crane(col) {
  const g = new THREE.Group(), m = pm(col, { facet: 0.4, side: THREE.DoubleSide });
  const body = new THREE.Mesh(new THREE.OctahedronGeometry(0.5, 0), m); body.scale.set(1.6, 0.5, 0.5);
  const wl = new THREE.Mesh(new THREE.ConeGeometry(0.5, 1.6, 3), m); wl.rotation.x = Math.PI / 2; wl.position.z = 0.8; wl.scale.y = 1;
  const wr = wl.clone(); wr.rotation.x = -Math.PI / 2; wr.position.z = -0.8;
  g.add(body, wl, wr); g.userData.wings = [wl, wr]; return g;
}

// ---------- player: origami stick figure ----------
const player = new THREE.Group(); scene.add(player);
const limbGeo = new THREE.CylinderGeometry(0.075, 0.045, 0.6, 3); limbGeo.translate(0, -0.3, 0);
let pmat = pm(SKINS[save.skin][0], { facet: 0.45 });
const head = new THREE.Mesh(new THREE.IcosahedronGeometry(0.27, 0), pmat); head.position.y = 0.52;
const torso = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), pmat); torso.scale.set(0.7, 1.15, 0.55); torso.position.y = 0.05;
const mkLimb = (x, y) => { const p = new THREE.Group(); p.position.set(x, y, 0); const m = new THREE.Mesh(limbGeo, pmat); p.add(m); player.add(p); return p; };
player.add(head, torso);
const armL = mkLimb(-0.1, 0.3), armR = mkLimb(0.1, 0.3), legL = mkLimb(-0.08, -0.28), legR = mkLimb(0.08, -0.28);
player.traverse((o) => { o.castShadow = true; });
function setSkin(i) { save.skin = i; pmat = pm(SKINS[i][0], { facet: 0.45 }); player.traverse((o) => { if (o.isMesh) o.material = pmat; }); persist(); }

const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 3), pm('#b8322a')); rope.castShadow = true; scene.add(rope);
// paper streamer trail
const TRAIL = 36, trailPts = [], trailGeo = new THREE.BufferGeometry();
trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 3), 3));
trailGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(TRAIL * 2 * 4), 4));
{ const idx = []; for (let i = 0; i < TRAIL - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(idx); }
const trail = new THREE.Mesh(trailGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false })); trail.frustumCulled = false; scene.add(trail);
// confetti (instanced paper squares)
const CN = 160, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.28, 0.18), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CN);
conf.frustumCulled = false; scene.add(conf); const cps = [];
for (let i = 0; i < CN; i++) { cps.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }); conf.setColorAt(i, new THREE.Color(['#d9443a', '#f6f1e7', '#2f4f8f', '#e2b13c', '#3f9a6e'][i % 5])); }
function burst(x, y, n, sp = 10) { let k = 0; for (const c of cps) { if (c.life > 0) continue; c.life = 1.5 + Math.random(); c.p.set(x, y, (Math.random() - 0.5) * 2); c.v.set((Math.random() - 0.5) * sp, Math.random() * sp, (Math.random() - 0.5) * sp); c.w.set(Math.random() * 9, Math.random() * 9, Math.random() * 9); if (++k >= n) break; } }

// ---------- game state ----------
let S = null, lvl = 1, mode = 'play', press = false, shake = 0, slow = 1, deadT = 0, winT = 0, camX = 0, camY = 4, hookN = 0, toastT = 0;
const dummy = new THREE.Object3D();
function start(n) {
  lvl = Math.max(1, Math.min(LEVELS, n)); const L = genLevel(lvl); buildWorld(L); S = newState(L);
  mode = 'play'; press = false; deadT = winT = 0; slow = 1; hookN = 0; trailPts.length = 0; camX = S.p.x + 4; camY = 4;
  $('win').classList.add('hide'); $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  $('lv').textContent = 'LEVEL ' + lvl; toast(lvl === 1 && !save.stars[1] ? 'HOLD to hook, LET GO to fly' : THEMES[Math.floor((lvl - 1) / 6) % 5].name + ' ' + lvl, 2.2);
}
function toast(t, dur = 1) { const e = $('toast'); e.textContent = t; e.classList.remove('pop'); void e.offsetWidth; e.classList.add('pop'); toastT = dur; }
function starsFor(t, par) { return t <= par * 1.15 ? 3 : t <= par * 1.6 ? 2 : 1; }
function onWin() {
  mode = 'won'; winT = 0; slow = 0.25; sfx.win(); burst(S.p.x, S.p.y, 140, 14); shake = 0.6;
  const st = starsFor(S.t, S.L.par); save.stars[lvl] = Math.max(save.stars[lvl] || 0, st);
  const before = save.max; save.max = Math.max(save.max, Math.min(LEVELS, lvl + 1)); persist();
  $('wst').innerHTML = [1, 2, 3].map((i) => `<span class="${i <= st ? 'on' : ''}">&#9733;</span>`).join('');
  $('wtime').textContent = S.t.toFixed(2) + 's  ·  ' + S.flips + ' flips  ·  ' + S.hooks + ' hooks';
  const unl = SKINS.findIndex((s, i) => i > 0 && i * 5 <= save.max && i * 5 > before);
  $('wun').textContent = unl > 0 ? 'NEW PAPER: ' + SKINS[unl][1] : lvl === LEVELS ? 'ALL 30 LEVELS FOLDED!' : '';
  setTimeout(() => mode === 'won' && $('win').classList.remove('hide'), 450);
}
function handleEvents() {
  for (const e of S.ev) {
    if (e === 'hook') { sfx.hook(hookN++); shake = Math.max(shake, 0.12); }
    else if (e === 'release') sfx.release();
    else if (e === 'bounce') { sfx.bounce(); shake = 0.35; burst(S.p.x, S.p.y - 0.4, 14, 6); }
    else if (e === 'bonk') { sfx.bonk(); shake = 0.5; }
    else if (e === 'flip') { sfx.flip(); toast(S.flips > 1 ? 'FLIP x' + S.flips : 'FLIP!', 0.6); }
    else if (e === 'land') sfx.land();
    else if (e === 'dead') { sfx.dead(); mode = 'dead'; deadT = 0; shake = 0.4; burst(S.p.x, KILL_Y + 1, 30, 7); toast('SPLASH!', 0.8); }
    else if (e === 'win') onWin();
  }
  S.ev.length = 0;
}
let acc = 0;
function simTick(dt) {
  acc += dt * slow;
  while (acc >= DT) {
    acc -= DT;
    if (mode === 'play') { const held = G.bot ? bot(S) : press; step(S, DT, held); handleEvents(); }
  }
  if (mode === 'dead') { deadT += dt; if (deadT > 0.9) start(lvl); }
  if (mode === 'won') { winT += dt; slow = Math.min(1, slow + dt * 0.8); if (G.bot && winT > 1.2) next(); }
}
function next() { if (lvl >= LEVELS) { openMenu(); return; } start(lvl + 1); }

// ---------- render update ----------
const tmpV = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
let time = 0;
function render(dt) {
  time += dt; const p = S.p, sp = Math.hypot(p.vx, p.vy);
  // camera
  const aspect = innerWidth / innerHeight, dist = 19 * Math.pow(Math.max(1, 1.3 / aspect), 0.75);
  camX += (p.x + p.vx * 0.22 + 4 - camX) * Math.min(1, dt * 3); camY += (Math.max(1, p.y * 0.55 + 3) - camY) * Math.min(1, dt * 2.5);
  const sk = shake * shake; shake = Math.max(0, shake - dt * 1.6);
  camera.position.set(camX - 3 + (Math.random() - 0.5) * sk, camY + 3 + (Math.random() - 0.5) * sk, dist + sp * 0.08);
  camera.lookAt(camX, camY, 0);
  camera.fov = 42 + Math.min(8, sp * 0.15); camera.updateProjectionMatrix();
  sun.position.set(camX - 14, camY + 26, 34); sun.target.position.set(camX, camY - 4, -10);
  // player
  player.position.set(p.x, p.y, 0); player.rotation.z = p.rot;
  const st = Math.min(1, sp / 20), sw = Math.sin(time * 14) * 0.3;
  if (S.hook) {
    const a = Math.atan2(S.hook.y - p.y, S.hook.x - p.x) - p.rot - Math.PI / 2; // arm toward hook in local space
    armR.rotation.z = a + Math.PI; armL.rotation.z = a + Math.PI + 0.35;
    legL.rotation.z = 0.25 - st * 0.5 + sw * 0.2; legR.rotation.z = -0.15 - st * 0.3 - sw * 0.2;
  } else if (S.ground) { armL.rotation.z = -0.25; armR.rotation.z = 0.25; legL.rotation.z = -0.12; legR.rotation.z = 0.12; }
  else { armL.rotation.z = -2.1 + sw * 0.2; armR.rotation.z = 2.1 - sw * 0.2; legL.rotation.z = -0.6; legR.rotation.z = 0.6; }
  const sq = mode === 'won' ? 1 : 1 + Math.min(0.15, sp * 0.004); player.scale.set(1.35 / Math.sqrt(sq), 1.35 * sq, 1.35);
  player.visible = mode !== 'dead' || deadT < 0.05;
  // rope
  if (S.hook && mode === 'play') {
    const hx = p.x - Math.sin(p.rot) * 0.3, hy = p.y + Math.cos(p.rot) * 0.3, dx = S.hook.x - hx, dy = S.hook.y - hy, d = Math.hypot(dx, dy);
    rope.visible = true; rope.position.set(hx + dx / 2, hy + dy / 2, 0); rope.scale.set(1, d, 1); rope.quaternion.setFromUnitVectors(up, tmpV.set(dx / d, dy / d, 0));
  } else rope.visible = false;
  // hooks
  const target = mode === 'play' && !S.hook ? pickHook(S) : null;
  for (const g of hookObjs) {
    const u = g.userData; g.position.set(u.h.x, u.h.y, 0);
    u.star.rotation.z = time * 1.2; u.star2.rotation.z = -time * 0.8 + Math.PI / 4;
    const on = u.h === S.hook, tg = u.h === target;
    u.ring.material.opacity += ((tg ? 0.7 : on ? 0.25 : 0) - u.ring.material.opacity) * Math.min(1, dt * 10);
    u.ring.scale.setScalar(tg ? 1 + Math.sin(time * 8) * 0.08 : 1);
    const s = on ? 1.25 : 1; g.scale.x += (s - g.scale.x) * 0.2; g.scale.y = g.scale.z = g.scale.x;
  }
  for (const g of padObjs) { const k = Math.max(0, 1 - (S.t - (g.userData.pd.hit ?? -9)) * 4); g.scale.y = 1 + Math.sin(k * 12) * k * 0.6; }
  for (const w of waves) { w.position.x = Math.sin(time * 0.7 + w.userData.i * 1.7) * 0.8; w.position.y = Math.sin(time * 1.1 + w.userData.i) * 0.2; }
  for (const c of clouds) {
    if (c.userData.wings) { c.position.x += dt * 2; const f = Math.sin(time * 5 + c.userData.fly) * 0.5; c.userData.wings[0].rotation.y = f; c.userData.wings[1].rotation.y = -f; c.position.y += Math.sin(time * 2 + c.userData.fly) * dt * 0.4; }
    else c.position.x += dt * c.userData.v;
  }
  if (flag) flag.userData.cloth.rotation.y = Math.sin(time * 3) * 0.35;
  // trail
  trailPts.unshift(p.x, p.y); if (trailPts.length > TRAIL * 2) trailPts.length = TRAIL * 2;
  const pos = trailGeo.attributes.position.array, col = trailGeo.attributes.color.array, tc = new THREE.Color(save.skin === 0 ? '#d9443a' : SKINS[save.skin][0]);
  const n = trailPts.length / 2;
  for (let i = 0; i < TRAIL; i++) {
    const j = Math.min(i, n - 1), x = trailPts[j * 2], y = trailPts[j * 2 + 1];
    const k = Math.min(j + 1, n - 1), tx = x - trailPts[k * 2], ty = y - trailPts[k * 2 + 1], tl = Math.hypot(tx, ty) || 1;
    const w = 0.22 * (1 - i / TRAIL) * Math.min(1, sp / 12), nx = -ty / tl * w, ny = tx / tl * w;
    pos.set([x + nx, y + ny, -0.1, x - nx, y - ny, -0.1], i * 6);
    const a = (1 - i / TRAIL) * 0.75 * (mode === 'dead' ? 0 : 1);
    col.set([tc.r, tc.g, tc.b, a, tc.r * 0.85, tc.g * 0.85, tc.b * 0.85, a], i * 8);
  }
  trailGeo.attributes.position.needsUpdate = trailGeo.attributes.color.needsUpdate = true;
  // confetti
  for (let i = 0; i < CN; i++) {
    const c = cps[i];
    if (c.life > 0) { c.life -= dt; c.v.y -= 14 * dt; c.v.multiplyScalar(1 - dt * 1.6); c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt; dummy.position.copy(c.p); dummy.rotation.copy(c.r); dummy.scale.setScalar(Math.min(1, c.life * 2)); }
    else dummy.scale.setScalar(0);
    dummy.updateMatrix(); conf.setMatrixAt(i, dummy.matrix);
  }
  conf.instanceMatrix.needsUpdate = true;
  setWind(mode === 'play' && !S.ground ? sp : 0);
  // hud
  $('tm').textContent = S.t.toFixed(1) + 's';
  const prog = Math.max(0, Math.min(1, p.x / S.L.goalX)); $('bar').style.width = (prog * 100).toFixed(1) + '%';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('pop'); }
  renderer.render(scene, camera);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- menu ----------
function openMenu() {
  mode = 'menu'; $('menu').classList.remove('hide'); $('win').classList.add('hide'); $('hud').classList.add('hide');
  const grid = $('grid'); grid.innerHTML = '';
  for (let i = 1; i <= LEVELS; i++) {
    const b = document.createElement('button'); const lock = i > save.max; b.className = 'lvb' + (lock ? ' lock' : '');
    b.innerHTML = `<b>${i}</b><i>${lock ? '' : '&#9733;'.repeat(save.stars[i] || 0)}</i>`;
    if (!lock) b.onclick = (e) => { e.stopPropagation(); sfx.click(); start(i); };
    grid.appendChild(b);
  }
  const sk = $('skins'); sk.innerHTML = '';
  SKINS.forEach(([c, name], i) => {
    const lock = i * 5 > save.max, b = document.createElement('button'); b.className = 'skb' + (i === save.skin ? ' sel' : '') + (lock ? ' lock' : '');
    b.style.background = c; b.title = lock ? 'Reach level ' + i * 5 : name; b.textContent = lock ? i * 5 : '';
    if (!lock) b.onclick = (e) => { e.stopPropagation(); sfx.click(); setSkin(i); openMenu(); };
    sk.appendChild(b);
  });
}
$('play').onclick = (e) => { e.stopPropagation(); unlock(); sfx.click(); start(save.max); };
$('bmenu').onclick = (e) => { e.stopPropagation(); sfx.click(); openMenu(); };
$('brst').onclick = (e) => { e.stopPropagation(); sfx.click(); start(lvl); };
$('bmute').onclick = (e) => { e.stopPropagation(); const m = toggleMute(); if (!m) unlock(); $('bmute').textContent = m ? '♪̸' : '♪'; };
$('bmute').textContent = A.muted ? '♪̸' : '♪';
$('wnext').onclick = (e) => { e.stopPropagation(); sfx.click(); next(); };
$('wagain').onclick = (e) => { e.stopPropagation(); sfx.click(); start(lvl); };
for (const id of ['play', 'bmenu', 'brst', 'bmute', 'wnext', 'wagain']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());

// ---------- input ----------
const down = (e) => { unlock(); if (mode === 'won' && winT > 0.6) { next(); return; } press = true; if (e && e.preventDefault && e.cancelable) e.preventDefault(); };
const upF = () => { press = false; };
addEventListener('pointerdown', (e) => { if (e.target.closest && e.target.closest('#menu')) return; down(e); }, { passive: false });
addEventListener('pointerup', upF); addEventListener('pointercancel', upF); addEventListener('blur', upF);
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') down(e);
  else if (e.code === 'KeyR') start(lvl); else if (e.code === 'Escape') openMenu(); else if (e.code === 'KeyM') $('bmute').onclick(e);
  else if (e.code === 'Enter' && mode === 'won') next();
});
addEventListener('keyup', (e) => { if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') upF(); });
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- loop + debug API ----------
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; if (mode !== 'menu') simTick(dt); render(dt); requestAnimationFrame(frame); }
const G = window.__G = { get S() { return S; }, get mode() { return mode; }, get lvl() { return lvl; }, save, bot: Q.has('bot'), start, next,
  fast(sec, dt = 1 / 60) { for (let t = 0; t < sec; t += dt) { simTick(dt); } render(0.016); } };
start(Q.has('level') ? +Q.get('level') : save.max);
if (Q.has('title')) openMenu();
requestAnimationFrame(frame);
