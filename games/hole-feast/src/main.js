import * as THREE from '../vendor/three.module.js';
import { buildCity, CITIES, HALF, clearCache } from './city.js';
import { Post } from './post.js';
import { Sfx } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const R0 = 1.0, MAXH = 8;
const SKINS = [['Classic', 0xffffff, 0], ['Mint', 0x5ff2b0, 400], ['Sunset', 0xff8a3d, 1200], ['Grape', 0xb48cff, 2500], ['Bubblegum', 0xff6fb5, 5000], ['Gold', 0xffd23f, 9000]];
const RIVALS = [['Gobbler', 0xff4b4b], ['Pothole Pete', 0x3d8bff], ['Crumbs', 0xffc93d], ['Drainy', 0x3ddc84], ['Abyssa', 0xc56bff]];

let save = { total: 0, best: [0, 0, 0], cities: 1, skin: 0, last: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem('holefeast') || '{}')); } catch {}
const persist = () => { try { localStorage.setItem('holefeast', JSON.stringify(save)); } catch {} };

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('app').appendChild(renderer.domElement);
const post = new Post(renderer);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(26, 1, 1, 420);
const hemi = new THREE.HemisphereLight(0xdff1ff, 0x8a7a5a, 1.25); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d6, 2.6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; sun.shadow.radius = 3; scene.add(sun, sun.target);

// ground with hole cut-outs
const holeU = { value: Array.from({ length: MAXH }, () => new THREE.Vector3(9999, 9999, 0)) };
const groundMat = new THREE.MeshStandardMaterial({ roughness: 0.92 });
groundMat.onBeforeCompile = (s) => {
  s.uniforms.uH = holeU;
  s.vertexShader = 'varying vec2 vW;\n' + s.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvW = (modelMatrix * vec4(position, 1.)).xz;');
  s.fragmentShader = `uniform vec3 uH[${MAXH}];\nvarying vec2 vW;\n` + s.fragmentShader
    .replace('void main() {', `void main() { float rim = 1.; for (int i = 0; i < ${MAXH}; i++) { float d = length(vW - uH[i].xy); if (d < uH[i].z) discard; rim = min(rim, mix(1., smoothstep(0., .35 + uH[i].z * .12, d - uH[i].z), step(.01, uH[i].z))); }`)
    .replace('#include <map_fragment>', '#include <map_fragment>\ndiffuseColor.rgb *= mix(.35, 1., rim);');
};
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

// hole parts
const wallGeo = new THREE.CylinderGeometry(1, 1, 1, 56, 1, true);
const wallMat = new THREE.ShaderMaterial({ side: THREE.BackSide, uniforms: {}, vertexShader: 'varying float vY; varying vec2 vA; void main(){ vec4 w = modelMatrix * vec4(position,1.); vY = w.y; vA = position.xz; gl_Position = projectionMatrix * viewMatrix * w; }',
  fragmentShader: 'varying float vY; varying vec2 vA; void main(){ float d = -vY; vec3 soil = vec3(.11,.065,.04) * (1. + .25 * sin(d * 5. + sin(atan(vA.y, vA.x) * 7.) * .6)); vec3 c = mix(soil, vec3(.003,.002,.002), smoothstep(.2, 7., d)); c *= .55 + .45 * smoothstep(-1., 1., vA.x * .6 + vA.y); gl_FragColor = vec4(c, 1.); }' });
const capGeo = new THREE.CircleGeometry(1, 48); capGeo.rotateX(-Math.PI / 2);
const capMat = new THREE.MeshBasicMaterial({ color: 0x000000, fog: false });
const rimGeo = new THREE.RingGeometry(1, 1.09, 64); rimGeo.rotateX(-Math.PI / 2);
const glowGeo = new THREE.RingGeometry(1.09, 1.22, 64); glowGeo.rotateX(-Math.PI / 2);

function makeHole(name, color, isPlayer) {
  const g = new THREE.Group(); scene.add(g);
  const wall = new THREE.Mesh(wallGeo, wallMat); wall.scale.set(1, 60, 1); wall.position.y = -30; wall.renderOrder = -1;
  const cap = new THREE.Mesh(capGeo, capMat); cap.position.y = -55;
  const rim = new THREE.Mesh(rimGeo, new THREE.MeshBasicMaterial({ color, fog: false })); rim.position.y = 0.04;
  const glow = new THREE.Mesh(glowGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, depthWrite: false, fog: false })); glow.position.y = 0.03;
  const radial = new THREE.Group(); radial.add(wall, cap, rim, glow); g.add(radial);
  const tag = document.createElement('div'); tag.className = 'tag' + (isPlayer ? ' me' : ''); tag.textContent = name; tag.style.setProperty('--c', '#' + color.toString(16).padStart(6, '0')); $('tags').appendChild(tag);
  return { name, color, isPlayer, g, radial, rim, glow, tag, x: 0, z: 0, vx: 0, vz: 0, area: 0, R: R0, Rd: R0, Rv: 0, score: 0, dead: 0, eats: 0, holesEaten: 0, ai: { t: 0, tx: 0, tz: 0, obj: null, skill: 0.85 + Math.random() * 0.1 }, pulse: 0, combo: 0, lastEat: -9, level: 1 };
}

// particles (dust + confetti on swallows)
const PN = 260, pmesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.16, 0.16, 0.16), new THREE.MeshStandardMaterial({ roughness: 0.6 }), PN);
pmesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); pmesh.frustumCulled = false; scene.add(pmesh);
const parts = Array.from({ length: PN }, () => ({ life: 0 })); let pi = 0; const _mx = new THREE.Matrix4(), _c = new THREE.Color();
const PCOL = [0xfff1c9, 0xff8a7a, 0x8fd6f2, 0xc8e86a, 0xffffff];
function burst(x, z, n, s) { for (let i = 0; i < n; i++) { const p = parts[pi = (pi + 1) % PN]; const a = Math.random() * 6.28; Object.assign(p, { life: 0.6 + Math.random() * 0.5, x: x + Math.cos(a) * s, y: 0.2, z: z + Math.sin(a) * s, vx: Math.cos(a) * (2 + Math.random() * 3), vy: 3 + Math.random() * 5, vz: Math.sin(a) * (2 + Math.random() * 3), sc: 0.6 + Math.random() * s * 0.6 }); pmesh.setColorAt(pi, _c.set(PCOL[i % 5])); } pmesh.instanceColor.needsUpdate = true; }
pmesh.setColorAt(0, _c.set(0xffffff));
function stepParts(dt) {
  for (let i = 0; i < PN; i++) { const p = parts[i]; if (p.life <= 0) { _mx.makeScale(0, 0, 0); pmesh.setMatrixAt(i, _mx); continue; }
    p.life -= dt; p.vy -= 18 * dt; p.x += p.vx * dt; p.y = Math.max(0.08, p.y + p.vy * dt); p.z += p.vz * dt; const s = p.sc * Math.min(1, p.life * 3);
    _mx.makeRotationY(p.life * 9).setPosition(p.x, p.y, p.z); _mx.scale(new THREE.Vector3(s, s, s)); pmesh.setMatrixAt(i, _mx); }
  pmesh.instanceMatrix.needsUpdate = true;
}

// ---------- game state ----------
const G = window.__G = { state: 'boot', t: 0, holes: [], objs: [], ci: 0, time: 120, left: 120, shake: 0, bot: Q.has('bot'), result: null, eatenObjs: 0 };
let city = null, player = null;
const GRID = 6, GN = 26, grid = Array.from({ length: GN * GN }, () => []);
const cellOf = (x) => Math.max(0, Math.min(GN - 1, Math.floor((x + 78) / GRID)));

function clearWorld() {
  for (const o of G.objs) scene.remove(o.mesh);
  for (const h of G.holes) { scene.remove(h.g); h.tag.remove(); }
  if (city) { city.tex.dispose(); city.mat.dispose(); clearCache(); }
  G.objs = []; G.holes = [];
}

function start(ci) {
  ci = Math.max(0, Math.min(ci, save.cities - 1, CITIES.length - 1));
  clearWorld(); G.ci = ci; save.last = ci; persist();
  const C = CITIES[ci];
  city = buildCity(scene, ci, (Math.random() * 1e6) | 0);
  G.objs = city.objs; groundMat.map = city.tex; groundMat.needsUpdate = true;
  scene.background = new THREE.Color(C.bg); scene.fog = new THREE.Fog(C.bg, 110, 260);
  player = makeHole('YOU', SKINS[save.skin][1], true); G.player = player;
  G.holes = [player, ...RIVALS.map(([n, c]) => makeHole(n, c, false))];
  G.holes.forEach((h, i) => { const a = i / G.holes.length * 6.28 + 0.3; h.x = i ? Math.cos(a) * 40 : 6; h.z = i ? Math.sin(a) * 40 : 6; });
  for (const o of G.objs) o.mesh.visible = true;
  G.time = G.left = C.time; G.t = 0; G.state = 'play'; G.result = null; G.eatenObjs = 0; G.lastTick = 99; G.shake = 0;
  Sfx.music = true; Sfx.tempo = 112;
  $('menu').classList.add('hide'); $('res').classList.add('hide'); $('hud').classList.remove('hide');
  banner(C.name.toUpperCase(), 'Swallow the city!');
}

// ---------- input ----------
const keys = {}; let mouse = null, joy = null;
addEventListener('keydown', (e) => { keys[e.code] = true; Sfx.unlock(); if (e.code === 'KeyM') toggleMute(); if ((e.code === 'Enter' || e.code === 'Space') && G.state === 'over' && G.canAgain) start(G.ci); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { Sfx.unlock(); if (e.pointerType !== 'mouse') { joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY }; const j = $('joy'); j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; j.classList.add('on'); } });
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') mouse = { x: e.clientX, y: e.clientY }; else if (joy && e.pointerId === joy.id) { joy.x = e.clientX; joy.y = e.clientY; const dx = joy.x - joy.x0, dy = joy.y - joy.y0, l = Math.hypot(dx, dy), m = Math.min(l, 50) / (l || 1); $('knob').style.transform = `translate(${dx * m}px,${dy * m}px)`; } });
const endJoy = (e) => { if (joy && e.pointerId === joy.id) { joy = null; $('joy').classList.remove('on'); $('knob').style.transform = ''; } };
addEventListener('pointerup', endJoy); addEventListener('pointercancel', endJoy);
document.addEventListener('mouseleave', () => { mouse = null; });

function inputDir() {
  let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), z = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (x || z) { const l = Math.hypot(x, z); return [x / l, z / l]; }
  if (joy) { const dx = joy.x - joy.x0, dy = joy.y - joy.y0, l = Math.hypot(dx, dy); if (l < 8) return [0, 0]; const m = Math.min(1, l / 50); return [dx / l * m, dy / l * m]; }
  if (mouse) { const p = screenOf(player.x, 0, player.z), dx = mouse.x - p.x, dy = mouse.y - p.y, l = Math.hypot(dx, dy); if (l < 24) return [0, 0]; const m = Math.min(1, (l - 24) / 140); return [dx / l * m, dy / l * m]; }
  return [0, 0];
}

// ---------- AI ----------
function think(h) {
  const a = h.ai; a.t = 0.35 + Math.random() * 0.45;
  for (const o of G.holes) if (o !== h && !o.dead && o.R > h.R * 1.18) { const d = Math.hypot(o.x - h.x, o.z - h.z); if (d < 5 + o.R * 2.2) { a.obj = null; a.tx = h.x + (h.x - o.x) / d * 20; a.tz = h.z + (h.z - o.z) / d * 20; a.flee = 1; return; } }
  a.flee = 0; let best = null, bs = 0;
  for (const o of G.holes) if (o !== h && !o.dead && h.R > o.R * 1.25) { const d = Math.hypot(o.x - h.x, o.z - h.z); if (d < 22) { const s = (30 + o.score * 0.1) / (d + 4); if (s > bs) { bs = s; best = { hole: o }; } } }
  const cx = cellOf(h.x), cz = cellOf(h.z), rr = 4;
  for (let i = Math.max(0, cx - rr); i <= Math.min(GN - 1, cx + rr); i++) for (let j = Math.max(0, cz - rr); j <= Math.min(GN - 1, cz + rr); j++) for (const o of grid[i * GN + j]) {
    if (o.size > h.R * 0.9 || o.fall) continue; const d = Math.hypot(o.x - h.x, o.z - h.z); const s = o.pts * (0.6 + Math.random() * 0.8) / (d + 2.5); if (s > bs) { bs = s; best = { obj: o }; } }
  a.obj = best; if (!best) { a.tx = (Math.random() - 0.5) * 110; a.tz = (Math.random() - 0.5) * 110; }
}
function aiDir(h, dt) {
  const a = h.ai; if ((a.t -= dt) <= 0) think(h);
  let tx = a.tx, tz = a.tz; if (a.obj) { const o = a.obj.obj || a.obj.hole; if (a.obj.obj && (!o.alive || o.fall)) { a.t = 0; } else if (a.obj.hole && o.dead) a.t = 0; else { tx = o.x; tz = o.z; } }
  const dx = tx - h.x, dz = tz - h.z, l = Math.hypot(dx, dz); if (l < 0.3) return [0, 0];
  const m = (h.isPlayer ? 1 : a.skill) * (a.flee ? 1 : Math.min(1, l / 2)); return [dx / l * m, dz / l * m];
}

// ---------- update ----------
const speedOf = (h) => 7.2 + h.R * 0.55;
function respawn(h) {
  for (let k = 0; k < 30; k++) { const x = (Math.random() - 0.5) * 120, z = (Math.random() - 0.5) * 120; if (G.holes.every((o) => o === h || o.dead || Math.hypot(o.x - x, o.z - z) > 18)) { h.x = x; h.z = z; break; } }
  h.dead = 0; h.vx = h.vz = 0; h.Rd = 0.2; h.g.visible = true; if (h.isPlayer) banner('BACK IN!', 'Stay away from bigger holes');
}

function eatObj(h, o) {
  o.fall = { h, ox: o.x - h.x, oz: o.z - h.z, y: 0, vy: 0, tilt: 0, sp: (Math.random() - 0.5) * 4, ax: Math.random() * 6.28 };
  if (o.mover) o.mover = null; h.pulse = Math.min(1, h.pulse + 0.15 + o.size * 0.1);
  if (h.isPlayer) {
    h.combo = G.t - h.lastEat < 1.4 ? h.combo + 1 : 1; h.lastEat = G.t;
    Sfx.pop(o.size, h.combo); burst(o.x, o.z, Math.min(10, 2 + Math.round(o.size * 3)), Math.min(o.size, h.R)); floatTxt(o.x, o.h * 0.6, o.z, '+' + o.pts, o.pts >= 20);
    if (o.size >= 2) G.shake = Math.min(1.2, G.shake + o.size * 0.12);
  }
}

function update(dt) {
  G.t += dt;
  for (const c of grid) c.length = 0;
  // movers
  for (const o of G.objs) {
    if (!o.alive) continue;
    const m = o.mover;
    if (m && !o.fall) {
      if (m.type === 'walk') { m.u = (m.u + m.sp * dt + 4) % 4; const s = Math.floor(m.u), f = m.u - s, L = m.lane;
        const [px, pz] = [[-L + 2 * L * f, -L], [L, -L + 2 * L * f], [L - 2 * L * f, L], [-L, L - 2 * L * f]][s]; o.x = m.bx + px; o.z = m.bz + pz;
        o.ry = [0, -Math.PI / 2, Math.PI, Math.PI / 2][s] + (m.sp < 0 ? Math.PI : 0) + Math.PI / 2; o.mesh.position.y = Math.abs(Math.sin(G.t * 9 + m.bx)) * 0.06; }
      else if (m.type === 'drive') { m.u += m.sp * dt; if (m.u > HALF + 4) m.u = -HALF - 4; if (m.u < -HALF - 4) m.u = HALF + 4;
        if (m.ax === 0) { o.x = m.u; o.z = m.rd; o.ry = m.sp > 0 ? 0 : Math.PI; } else { o.x = m.rd; o.z = m.u; o.ry = m.sp > 0 ? -Math.PI / 2 : Math.PI / 2; } }
      else { m.t += dt; o.mesh.rotation.y = o.ry + Math.sin(m.t * 1.3) * 0.6; }
      o.mesh.position.x = o.x; o.mesh.position.z = o.z; if (m.type !== 'idle') o.mesh.rotation.y = o.ry;
    }
    if (o.fall) {
      const f = o.fall, h = f.h; f.ox *= Math.exp(-dt * 3); f.oz *= Math.exp(-dt * 3); f.vy -= 30 * dt; f.y += f.vy * dt; f.tilt = Math.min(1.3, f.tilt + dt * 2.2);
      o.x = h.x + f.ox; o.z = h.z + f.oz; o.mesh.position.set(o.x, f.y, o.z);
      o.mesh.rotation.set(Math.cos(f.ax) * f.tilt, o.ry + f.sp * f.tilt, Math.sin(f.ax) * f.tilt);
      if (f.y < -(o.h + 4)) { o.alive = false; o.mesh.visible = false; G.eatenObjs++;
        h.score += o.pts; h.area += o.size * o.size * 0.35; h.eats++; }
      continue;
    }
    if (o.wob > 0) { o.wob -= dt; o.mesh.rotation.z = Math.sin(G.t * 45) * 0.05 * o.wob; if (o.wob <= 0) o.mesh.rotation.z = 0; }
    grid[cellOf(o.x) * GN + cellOf(o.z)].push(o);
  }
  // holes
  const playing = G.state === 'play';
  for (const h of G.holes) {
    if (h.dead > 0) { h.dead -= dt; h.Rd *= Math.exp(-dt * 6); if (h.dead <= 0 && playing) respawn(h); continue; }
    let [dx, dz] = playing ? (h.isPlayer && !G.bot ? inputDir() : aiDir(h, dt)) : [0, 0];
    const sp = speedOf(h); h.vx += (dx * sp - h.vx) * Math.min(1, dt * 7); h.vz += (dz * sp - h.vz) * Math.min(1, dt * 7);
    h.x = Math.max(-HALF, Math.min(HALF, h.x + h.vx * dt)); h.z = Math.max(-HALF, Math.min(HALF, h.z + h.vz * dt));
    const prevLvl = h.level; h.R = Math.sqrt(R0 * R0 + h.area); h.level = Math.floor(h.R);
    if (h.isPlayer && h.level > prevLvl && playing) { Sfx.grow(); banner('SIZE ' + h.level, ''); }
    // springy display radius
    h.Rv += ((h.R - h.Rd) * 120 - h.Rv * 14) * dt; h.Rd += h.Rv * dt; h.pulse *= Math.exp(-dt * 4);
    // swallow test
    const reach = h.Rd + 6, i0 = cellOf(h.x - reach), i1 = cellOf(h.x + reach), j0 = cellOf(h.z - reach), j1 = cellOf(h.z + reach);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) for (const o of grid[i * GN + j]) {
      if (o.fall) continue; const d = Math.hypot(o.x - h.x, o.z - h.z);
      if (o.size <= h.Rd * 0.9) { if (d < h.Rd - o.size * 0.3) eatObj(h, o); }
      else if (h.isPlayer && d < h.Rd + o.size * 0.6) o.wob = 0.4;
    }
  }
  // hole vs hole
  if (playing) for (const a of G.holes) for (const b of G.holes) {
    if (a === b || a.dead || b.dead || a.R < b.R * 1.2) continue;
    if (Math.hypot(a.x - b.x, a.z - b.z) < a.Rd - b.Rd * 0.3) {
      a.area += b.area * 0.5 + 1.5; const bonus = 25 + Math.floor(b.score * 0.2); a.score += bonus; a.holesEaten++; b.area *= 0.45; b.dead = 3; a.pulse = 1;
      burst(b.x, b.z, 14, b.R);
      if (a.isPlayer) { Sfx.gulp(); G.shake = 1.2; banner('GULP!', 'You swallowed ' + b.name + '  +' + bonus); floatTxt(b.x, 1, b.z, '+' + bonus, true); }
      if (b.isPlayer) { Sfx.hurt(); G.shake = 1.5; banner('SWALLOWED!', 'by ' + a.name); }
    }
  }
  for (const h of G.holes) h.g.visible = h.dead <= 0 || h.Rd > 0.05;
  stepParts(dt);
  // clock
  if (playing) {
    G.left -= dt; const s = Math.ceil(G.left);
    if (s <= 10 && s !== G.lastTick && s > 0) { G.lastTick = s; Sfx.tick(s <= 3); }
    if (G.left < 15) Sfx.tempo = 140;
    if (G.left <= 0) endRound();
  }
}

function ranking() { return [...G.holes].sort((a, b) => b.score - a.score); }

function endRound() {
  G.left = 0; G.state = 'over'; Sfx.music = false; G.canAgain = false;
  const rk = ranking(), place = rk.indexOf(player) + 1, C = CITIES[G.ci];
  const prevBest = save.best[G.ci] || 0, before = save.total;
  save.total += player.score; save.best[G.ci] = Math.max(prevBest, player.score);
  let unlock = '';
  if (place === 1 && G.ci + 1 < CITIES.length && save.cities < G.ci + 2) { save.cities = G.ci + 2; unlock = 'New city unlocked: ' + CITIES[G.ci + 1].name + '!'; }
  for (const [n, , cost] of SKINS) if (cost > before && cost <= save.total) unlock += (unlock ? '  ' : '') + 'New hole skin: ' + n + '!';
  persist();
  G.result = { place, score: player.score, eats: player.eats, holes: player.holesEaten, best: save.best[G.ci], newBest: player.score > prevBest, unlock };
  place === 1 ? Sfx.win() : Sfx.lose();
  banner(place === 1 ? 'YOU WIN!' : 'TIME!', '');
  setTimeout(() => showResults(rk), Q.has('bot') ? 0 : 1300);
}

// ---------- UI ----------
let bannerT = 0;
function banner(a, b) { $('msg').innerHTML = `<b>${a}</b>${b ? '<span>' + b + '</span>' : ''}`; $('msg').classList.remove('pop'); void $('msg').offsetWidth; $('msg').classList.add('pop'); bannerT = 1.8; }
const _v = new THREE.Vector3();
function screenOf(x, y, z) { _v.set(x, y, z).project(cam); return { x: (_v.x * 0.5 + 0.5) * innerWidth, y: (-_v.y * 0.5 + 0.5) * innerHeight, vis: _v.z < 1 }; }
function floatTxt(x, y, z, t, big) {
  const box = $('pops'); if (box.children.length > 24) box.firstChild.remove();
  const p = screenOf(x, y, z), e = document.createElement('div'); e.className = 'pop' + (big ? ' big' : ''); e.textContent = t; e.style.left = p.x + 'px'; e.style.top = p.y + 'px'; box.appendChild(e); setTimeout(() => e.remove(), 900);
}
const fmt = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
let hudT = 0;
function hud(dt) {
  if ((hudT -= dt) > 0) return; hudT = 0.2;
  $('timer').textContent = fmt(G.left); $('timer').classList.toggle('low', G.left < 10 && G.state === 'play');
  $('board').innerHTML = ranking().map((h, i) => `<li class="${h.isPlayer ? 'me' : ''}${h.dead > 0 ? ' dead' : ''}"><i style="background:#${h.color.toString(16).padStart(6, '0')}"></i>${i + 1}. ${h.name}<b>${h.score}</b></li>`).join('');
  $('lvl').textContent = 'SIZE ' + player.level; $('bar').style.width = ((player.R % 1) * 100).toFixed(0) + '%';
  const cb = $('combo'); if (player.combo >= 3 && G.t - player.lastEat < 1.4) { cb.textContent = 'COMBO x' + player.combo; cb.classList.add('on'); } else cb.classList.remove('on');
}
function tags() {
  for (const h of G.holes) { const s = screenOf(h.x, 0, h.z + h.Rd * 1.15); const show = h.g.visible && s.vis && G.state !== 'menu'; h.tag.style.display = show ? '' : 'none'; if (show) h.tag.style.transform = `translate(${s.x}px,${s.y}px) translate(-50%,0)`; }
}

function showResults(rk) {
  const r = G.result, C = CITIES[G.ci];
  $('rplace').textContent = ['1st', '2nd', '3rd', '4th', '5th', '6th'][r.place - 1] + ' place'; $('rplace').className = r.place === 1 ? 'gold' : '';
  $('rcity').textContent = C.name;
  $('rstats').innerHTML = `<div><b>${r.score}</b>points${r.newBest ? ' <em>NEW BEST</em>' : ''}</div><div><b>${r.eats}</b>things eaten</div><div><b>${r.holes}</b>holes gulped</div>`;
  $('rboard').innerHTML = rk.map((h, i) => `<li class="${h.isPlayer ? 'me' : ''}">${i + 1}. ${h.name}<b>${h.score}</b></li>`).join('');
  $('runlock').textContent = r.unlock || (G.ci + 1 < CITIES.length && save.cities < G.ci + 2 ? 'Finish 1st to unlock ' + CITIES[G.ci + 1].name : '');
  $('rnext').classList.toggle('hide', !(G.ci + 1 < CITIES.length && save.cities > G.ci + 1));
  $('res').classList.remove('hide'); G.canAgain = true;
}
$('ragain').onclick = () => start(G.ci); $('rnext').onclick = () => start(G.ci + 1); $('rmenu').onclick = () => showMenu();

function showMenu() {
  G.state = 'menu'; Sfx.music = false; $('res').classList.add('hide'); $('hud').classList.add('hide'); $('menu').classList.remove('hide');
  $('cities').innerHTML = CITIES.map((c, i) => `<button class="card ${i < save.cities ? '' : 'locked'} ${i === G.ci ? 'sel' : ''}" data-i="${i}"><b>${c.name}</b><span>${i < save.cities ? 'Best ' + (save.best[i] || 0) + ' · ' + c.time + 's' : 'Win ' + CITIES[i - 1].name + ' first'}</span></button>`).join('');
  $('skins').innerHTML = SKINS.map(([n, c, cost], i) => `<button class="sw ${save.total >= cost ? '' : 'locked'} ${i === save.skin ? 'sel' : ''}" data-i="${i}" title="${n}" style="--c:#${c.toString(16).padStart(6, '0')}"><i></i><span>${save.total >= cost ? n : cost + ' pts'}</span></button>`).join('');
  $('total').textContent = save.total + ' feast points';
  $('cities').querySelectorAll('.card').forEach((b) => b.onclick = () => { const i = +b.dataset.i; if (i < save.cities) { G.ci = i; showMenu(); } });
  $('skins').querySelectorAll('.sw').forEach((b) => b.onclick = () => { const i = +b.dataset.i; if (save.total >= SKINS[i][2]) { save.skin = i; persist(); showMenu(); } });
}
$('play').onclick = () => { Sfx.unlock(); start(G.ci); };
function toggleMute() { Sfx.setMute(!Sfx.muted); $('mute').textContent = Sfx.muted ? '🔇' : '🔊'; }
$('mute').onclick = (e) => { e.stopPropagation(); Sfx.unlock(); toggleMute(); };
if (Q.has('mute')) toggleMute();

// ---------- frame ----------
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h); const pr = renderer.getPixelRatio(); post.setSize(Math.floor(w * pr), Math.floor(h * pr)); cam.aspect = w / h; cam.fov = w < h ? 38 : 26; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const camPos = new THREE.Vector3(0, 60, 60), look = new THREE.Vector3();
function frame(dt) {
  const f = player || { x: 0, z: 0, Rd: 3 };
  const menu = G.state === 'menu';
  const dist = menu ? 120 : 30 + f.Rd * 6.2, pitch = 0.95, ang = menu ? G.t * 0.05 : 0;
  const tx = menu ? 0 : f.x, tz = menu ? 0 : f.z;
  const want = new THREE.Vector3(tx + Math.sin(ang) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, tz + Math.cos(ang) * Math.cos(pitch) * dist);
  camPos.lerp(want, 1 - Math.exp(-dt * 5)); look.lerp(_v.set(tx, 0, tz), 1 - Math.exp(-dt * 6));
  G.shake *= Math.exp(-dt * 5); const sh = G.shake * 0.35;
  cam.position.copy(camPos).add(_v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh)); cam.lookAt(look);
  const sb = 16 + f.Rd * 6 + (menu ? 70 : 0), sc = sun.shadow.camera; sc.left = sc.bottom = -sb; sc.right = sc.top = sb; sc.near = 1; sc.far = 220; sc.updateProjectionMatrix();
  sun.position.set(look.x + 40, 80, look.z + 30); sun.target.position.copy(look);
  for (let i = 0; i < MAXH; i++) { const h = G.holes[i]; if (h && h.g.visible) { holeU.value[i].set(h.x, h.z, h.Rd); h.g.position.set(h.x, 0, h.z); h.radial.scale.set(h.Rd, 1, h.Rd); h.glow.material.opacity = 0.12 + h.pulse * 0.3 + (h.isPlayer ? 0.08 : 0); h.glow.scale.setScalar(1 + h.pulse * 0.08); } else holeU.value[i].set(9999, 9999, 0); }
  if ((bannerT -= dt) <= 0) $('msg').classList.remove('pop');
  hud(dt); tags();
  const fy = menu ? 0.5 : screenOf(look.x, 0, look.z).y / innerHeight;
  post.render(scene, cam, G.t, 1 - fy);
}
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (G.state !== 'boot') update(dt);
  frame(dt);
}
G.start = start; G.update = update; G.showMenu = showMenu; G.ranking = ranking;
G.fast = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) update(dt); };

start(save.last || 0);
if (Q.has('title')) showMenu();
requestAnimationFrame(loop);
