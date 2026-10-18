// EGG WARS - claymation egg FPS. Free-for-all vs bots, optional PeerJS online.
import * as THREE from '../vendor/three.module.js';
import { clayMat, clayUniforms, roundedBox } from './clay.js';
import * as S from './sfx.js';
import * as N from './net.js';

const Q = new URLSearchParams(location.search);
const TOUCH = Q.has('touch') || ('ontouchstart' in window && matchMedia('(pointer:coarse)').matches);
const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const angDiff = (a, b) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return d; };

// ---------------- save / progression
const SAVE_KEY = 'eggwars_v1';
const save = { xp: 0, color: 0, hat: 0, wins: 0, matches: 0, w: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
function levelOf(xp) { let l = 1, need = 300; while (xp >= need) { xp -= need; l++; need = 300 * l; } return { l, cur: xp, need }; }
const WEAPONS = [
  { name: 'Scrambler', dmg: 16, rate: 0.1, mag: 30, reload: 1.5, spread: 0.022, pellets: 1, range: 60, lvl: 1, kick: 0.01, col: 0xd8603a, snd: 'shoot0' },
  { name: 'Yolker', dmg: 12, rate: 0.75, mag: 6, reload: 1.9, spread: 0.085, pellets: 8, range: 22, lvl: 2, kick: 0.05, col: 0x3f8f8a, snd: 'shoot1' },
  { name: 'Whisk', dmg: 90, rate: 1.0, mag: 5, reload: 2.2, spread: 0.002, pellets: 1, range: 120, lvl: 4, kick: 0.07, zoom: true, col: 0x8a5a96, snd: 'shoot2' },
];
const SHELLS = [{ n: 'Farm White', c: 0xf3ead8, lvl: 1 }, { n: 'Free Range', c: 0xd9a46c, lvl: 2 }, { n: 'Speckled', c: 0xe2cfa0, lvl: 3 }, { n: 'Robin', c: 0x8fc6c9, lvl: 4 }, { n: 'Plum', c: 0xa77aa8, lvl: 6 }, { n: 'Golden', c: 0xe8b830, lvl: 8 }];
const HATS = [{ n: 'None', lvl: 1 }, { n: 'Party Cone', lvl: 3 }, { n: 'Bowler', lvl: 5 }, { n: 'Beanie', lvl: 7 }];
const BOT_NAMES = ['Sir Yolksalot', 'Eggbert', 'Shelly', 'Benedict', 'Scrambles', 'Over Easy', 'Sunny', 'Poach'];
const MATCH_TIME = 150, KILLS_TO_WIN = 15, BOTS = 5;

// ---------------- renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.autoClear = false;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xe8d4b4);
scene.fog = new THREE.Fog(0xe8d4b4, 34, 110);
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 300); camera.rotation.order = 'YXZ'; scene.add(camera);
const vmScene = new THREE.Scene(), vmCam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
function lights(sc, shadow) {
  sc.add(new THREE.HemisphereLight(0xfff0d8, 0x8a6648, 0.95));
  const key = new THREE.DirectionalLight(0xffdfb8, 2.3); key.position.set(18, 32, 12);
  if (shadow) { key.castShadow = true; key.shadow.mapSize.set(2048, 2048); const c = key.shadow.camera; c.left = c.bottom = -30; c.right = c.top = 30; c.near = 1; c.far = 90; key.shadow.bias = -0.0004; key.shadow.normalBias = 0.04; key.shadow.radius = 5; }
  sc.add(key);
  const fill = new THREE.DirectionalLight(0xbcd2ff, 0.55); fill.position.set(-20, 12, -16); sc.add(fill);
}
lights(scene, true); lights(vmScene, false);
// studio backdrop sweep: paper-colour gradient dome
scene.add(new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vp; void main(){ vp=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: 'varying vec3 vp; void main(){ float h=normalize(vp).y; vec3 c=mix(vec3(0.91,0.83,0.71),vec3(0.62,0.78,0.86),smoothstep(0.02,0.6,h)); c=mix(c,vec3(0.98,0.88,0.72),exp(-abs(h-0.05)*14.0)*0.6); gl_FragColor=vec4(c,1.0); }',
})));

// ---------------- materials & map
const matCache = new Map();
const mat = (c, o) => { const k = c + JSON.stringify(o || {}); if (!matCache.has(k)) matCache.set(k, clayMat(c, o)); return matCache.get(k); };
const PAL = { terra: 0xc8643c, mustard: 0xd9a63a, teal: 0x3f8f8a, sage: 0x8fae6f, cream: 0xeadbc0, plum: 0x8a5a86, sky: 0x6fa6d0, brick: 0xb5553a, rug: 0xc98a8a };
const boxes = [];
const H = 22;
function block(x, z, w, d, h, color) {
  const m = new THREE.Mesh(roundedBox(w, h, d, Math.min(0.22, w / 4, h / 4, d / 4), 3), mat(color));
  m.position.set(x, h / 2, z); m.castShadow = m.receiveShadow = true; scene.add(m);
  boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, top: h });
}
function deco(geo, color, x, y, z, sx = 1, sy = 1, sz = 1, shadow = true) { const m = new THREE.Mesh(geo, mat(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = shadow; m.receiveShadow = true; scene.add(m); return m; }
const cloudMat = clayMat(0xfaf4ea, { boil: 0.02 }); cloudMat.emissive.set(0xb8aa98);
const cloud = (x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), cloudMat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); scene.add(m); };
(function buildMap() {
  const floor = new THREE.Mesh(roundedBox(2 * H + 6, 1, 2 * H + 6, 0.3, 2), mat(PAL.cream, { boil: 0.004 })); floor.position.y = -0.5; floor.receiveShadow = true; scene.add(floor);
  // big table under the diorama
  deco(roundedBox(140, 2, 140, 0.5, 2), 0xa8794f, 0, -2.2, 0, 1, 1, 1, false);
  for (const [x, z, r, c] of [[-10, 10, 4, PAL.rug], [11, -9, 5, PAL.sky], [0, 0, 7, PAL.sage]]) deco(new THREE.CylinderGeometry(r, r, 0.06, 40), c, x, 0.02, z, 1, 1, 0.7, false);
  // walls
  block(0, -H - 0.5, 2 * H + 2, 1, 3, PAL.brick); block(0, H + 0.5, 2 * H + 2, 1, 3, PAL.brick);
  block(-H - 0.5, 0, 1, 2 * H, 3, PAL.brick); block(H + 0.5, 0, 1, 2 * H, 3, PAL.brick);
  const rot = [[1, 0, 0, 1], [0, -1, 1, 0], [-1, 0, 0, -1], [0, 1, -1, 0]];
  const L = [[8, 8, 3, 3, 2, PAL.terra], [10.6, 8.2, 2, 2, 1, PAL.mustard], [14, 3, 2, 2, 4.5, PAL.teal], [4, 14, 6, 1.2, 1.3, PAL.sage], [16, 16, 4, 4, 1, PAL.plum], [16.8, 16.8, 2, 2, 2, PAL.plum], [6, -2.5, 1.2, 4, 1.4, PAL.sky]];
  for (const [a, b, c, d] of rot) for (const [x, z, w, dd, h, col] of L) { const swap = b !== 0; block(a * x + b * z, c * x + d * z, swap ? dd : w, swap ? w : dd, h, col); }
  block(0, 0, 4, 4, 1.2, PAL.mustard); block(0, 0, 2, 2, 2.4, PAL.terra);
  // outside diorama: clay hills, trees, clouds, sun
  const sph = new THREE.SphereGeometry(1, 32, 20);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2 + rnd(-0.1, 0.1), r = rnd(34, 46); deco(sph, [PAL.sage, PAL.teal, 0x9cb873, PAL.mustard][i % 4], Math.cos(a) * r, -1, Math.sin(a) * r, rnd(7, 12), rnd(3, 7), rnd(7, 12), false); }
  const trunk = new THREE.CylinderGeometry(0.3, 0.45, 3, 10), blob = new THREE.IcosahedronGeometry(1.6, 3);
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2 + 0.3, r = rnd(26, 31), x = Math.cos(a) * r, z = Math.sin(a) * r; deco(trunk, 0x8a5a3a, x, 1.5, z); deco(blob, i % 2 ? 0x6f9a52 : 0x88b060, x, 3.8, z, 1, rnd(1, 1.4), 1); }
  for (let i = 0; i < 6; i++) { const a = rnd(0, 6.28), r = rnd(60, 90), y = rnd(22, 34); for (let k = 0; k < 4; k++) cloud(Math.cos(a) * r + k * 3, y + rnd(-1, 1), Math.sin(a) * r + rnd(-2, 2), rnd(3, 4.5), rnd(2, 3), rnd(3, 4), false); }
  deco(new THREE.CylinderGeometry(8, 8, 1, 40), 0xf0a53a, -70, 55, -110, 1, 1, 1, false).rotation.x = Math.PI / 2.3;
  const cone = new THREE.ConeGeometry(0.12, 0.6, 6);
  for (let i = 0; i < 70; i++) { const side = i % 4, t = rnd(-H + 1, H - 1), x = side < 2 ? t : (side === 2 ? -H + 0.4 : H - 0.4), z = side < 2 ? (side ? -H + 0.4 : H - 0.4) : t; deco(cone, 0x6f9a52, x + rnd(-0.3, 0.3), 0.3, z + rnd(-0.3, 0.3), 1, rnd(0.6, 1.3), 1, false); }
})();

// ---------------- collision & rays
const RAD = 0.48, STEP = 0.55;
const hit2 = (x, z, b) => { const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1); return (x - cx) ** 2 + (z - cz) ** 2 < RAD * RAD; };
const blocked = (x, z, y) => boxes.some((b) => b.top > y + STEP && hit2(x, z, b));
function groundAt(x, z, y) { let g = 0; for (const b of boxes) if (b.top <= y + STEP && b.top > g && hit2(x, z, b)) g = b.top; return g; }
function rayBox(o, d, b) {
  let t0 = 0, t1 = 1e9; const mn = [b.x0, 0, b.z0], mx = [b.x1, b.top, b.z1], oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
  for (let i = 0; i < 3; i++) { if (Math.abs(dd[i]) < 1e-9) { if (oo[i] < mn[i] || oo[i] > mx[i]) return Infinity; continue; }
    let a = (mn[i] - oo[i]) / dd[i], c = (mx[i] - oo[i]) / dd[i]; if (a > c) [a, c] = [c, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) return Infinity; }
  return t0;
}
const rayWorld = (o, d) => { let t = (o.y > 0 && d.y < 0) ? -o.y / d.y : Infinity; for (const b of boxes) t = Math.min(t, rayBox(o, d, b)); return t; };
function rayEgg(o, d, e) { // ellipsoid 0.55 x 0.8
  const k = 0.55 / 0.8, cx = o.x - e.pos.x, cy = (o.y - e.pos.y - 0.8) * k, cz = o.z - e.pos.z, dx = d.x, dy = d.y * k, dz = d.z;
  const A = dx * dx + dy * dy + dz * dz, B = 2 * (cx * dx + cy * dy + cz * dz), C = cx * cx + cy * cy + cz * cz - 0.3025, D = B * B - 4 * A * C;
  if (D < 0) return Infinity; const t = (-B - Math.sqrt(D)) / (2 * A); return t > 0 ? t : Infinity;
}
const eye = (e, out = new V3()) => out.set(e.pos.x, e.pos.y + 1.35, e.pos.z);
const center = (e, out = new V3()) => out.set(e.pos.x, e.pos.y + 0.85, e.pos.z);
function los(a, b) { const d = b.clone().sub(a), L = d.length(); d.multiplyScalar(1 / L); for (const bx of boxes) if (rayBox(a, d, bx) < L - 0.4) return false; return true; }
function openPoint() { for (let i = 0; i < 200; i++) { const x = rnd(-H + 2, H - 2), z = rnd(-H + 2, H - 2); if (!blocked(x, z, 0) && groundAt(x, z, 0) === 0) return new V3(x, 0, z); } return new V3(); }
const SPAWNS = []; for (let i = 0; i < 24; i++) SPAWNS.push(openPoint());

// ---------------- meshes: eggs & guns
const eggGeo = (() => { const p = []; for (let i = 0; i <= 28; i++) { const t = i / 28 * Math.PI, y = (1 - Math.cos(t)) / 2; p.push(new THREE.Vector2(Math.max(1e-4, Math.sin(t) * 0.55 * (1.1 - 0.26 * y)), y * 1.6)); } const g = new THREE.LatheGeometry(p, 40); g.computeVertexNormals(); return g; })();
const sphG = new THREE.SphereGeometry(1, 20, 14), blobG = new THREE.IcosahedronGeometry(1, 1);
function gunMesh(w) {
  const W = WEAPONS[w], g = new THREE.Group(), add = (geo, c, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat(c, { boil: 0.002 })); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  const bar = (r, l) => new THREE.CylinderGeometry(r, r * 1.1, l, 12);
  if (w === 0) { add(roundedBox(0.14, 0.16, 0.48, 0.05), W.col, 0, 0, 0); add(bar(0.04, 0.34), PAL.cream, 0, 0.02, -0.38, Math.PI / 2); add(sphG, PAL.mustard, 0, -0.1, -0.05).scale.set(0.08, 0.08, 0.1); }
  if (w === 1) { add(roundedBox(0.2, 0.15, 0.42, 0.05), W.col, 0, 0, 0); add(bar(0.045, 0.42), PAL.cream, -0.05, 0.02, -0.4, Math.PI / 2); add(bar(0.045, 0.42), PAL.cream, 0.05, 0.02, -0.4, Math.PI / 2); }
  if (w === 2) { add(roundedBox(0.12, 0.15, 0.55, 0.05), W.col, 0, 0, 0); add(bar(0.03, 0.75), PAL.cream, 0, 0.02, -0.62, Math.PI / 2); add(bar(0.045, 0.3), 0x333040, 0, 0.13, -0.05, Math.PI / 2);
    const tor = new THREE.TorusGeometry(0.07, 0.01, 6, 16); for (let i = 0; i < 3; i++) add(tor, 0xd8d0c0, 0, 0.02, -1.02).rotation.y = i * Math.PI / 3; }
  const mz = new THREE.Object3D(); mz.position.set(0, 0.02, w === 2 ? -1.0 : -0.6); g.add(mz); g.userData.muzzle = mz;
  return g;
}
function makeEgg(color, hat) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = clayMat(color, { crack: true, boil: 0.012 });
  const shell = new THREE.Mesh(eggGeo, m); shell.castShadow = shell.receiveShadow = true; body.add(shell);
  const eyes = new THREE.Group(); body.add(eyes);
  for (const s of [-1, 1]) { const w = new THREE.Mesh(sphG, mat(0xfbf8f0)); w.scale.setScalar(0.13); w.position.set(s * 0.17, 1.12, -0.44); eyes.add(w);
    const p = new THREE.Mesh(sphG, mat(0x201a18)); p.scale.setScalar(0.065); p.position.set(s * 0.17, 1.12, -0.56); eyes.add(p); }
  const brow = new THREE.Mesh(roundedBox(0.5, 0.05, 0.06, 0.02, 2), mat(0x5a3a28)); brow.position.set(0, 1.3, -0.47); brow.rotation.x = -0.3; body.add(brow);
  for (const s of [-1, 1]) { const f = new THREE.Mesh(sphG, mat(0xe08a2a)); f.scale.set(0.14, 0.07, 0.2); f.position.set(s * 0.2, 0.05, -0.08); f.castShadow = true; g.add(f); }
  if (hat === 1) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 16), mat(0xd9506a)); h.position.set(0.05, 1.78, 0); h.rotation.z = -0.15; body.add(h); }
  if (hat === 2) { const h = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.27, 0.28, 20), mat(0x2d2a2a)); h.position.y = 1.72; body.add(h); const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.04, 24), mat(0x2d2a2a)); b.position.y = 1.58; body.add(b); }
  if (hat === 3) { const h = new THREE.Mesh(sphG, mat(0x3f6fa0)); h.scale.set(0.42, 0.3, 0.42); h.position.y = 1.5; body.add(h); const pom = new THREE.Mesh(sphG, mat(0xf0e6d0)); pom.scale.setScalar(0.1); pom.position.y = 1.82; body.add(pom); }
  const guns = WEAPONS.map((_, i) => { const gm = gunMesh(i); gm.scale.setScalar(1.3); gm.position.set(0.5, 0.7, -0.3); gm.visible = false; body.add(gm); return gm; });
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return { g, body, mat: m, eyes, guns };
}

// ---------------- entities
const ents = [];
let me = null, time = 0, timeScale = 1, state = 'play', timeLeft = MATCH_TIME, matchXP = 0, endT = 0, botSkill = 0.4;
function mkEnt(id, name, color, hat, o = {}) {
  const e = { id, name, color, hat, bot: !!o.bot, remote: !!o.remote, pos: new V3(), vel: new V3(), yaw: 0, pitch: 0, hp: 100, alive: false, respawn: 0.5, k: 0, d: 0, streak: 0, w: 0, ammo: WEAPONS.map((W) => W.mag), rl: 0, cd: 0, onGround: true, prot: 0, lastHit: -9, land: 0, moving: 0, crack: 0, spect: false,
    ai: { t: 0, tgt: null, wp: null, strafe: 1, err: new V3(), last: new V3(), jump: false }, net: { tp: new V3(), seen: 0 }, phase: Math.random() * 6 };
  e.m = makeEgg(color, hat); e.m.g.visible = false; scene.add(e.m.g); ents.push(e); return e;
}
function removeEnt(e) { scene.remove(e.m.g); ents.splice(ents.indexOf(e), 1); }
const owns = (e) => !N.st.online || e === me || (N.st.isHost && e.bot);
const enemiesOf = (e) => ents.filter((o) => o !== e && o.alive && !o.spect);

function respawn(e) {
  let best = SPAWNS[0], bd = -1;
  for (const s of SPAWNS) { let md = 1e9; for (const o of enemiesOf(e)) md = Math.min(md, o.pos.distanceTo(s)); md += Math.random() * 4; if (md > bd) { bd = md; best = s; } }
  e.pos.copy(best); e.vel.set(0, 0, 0); e.yaw = Math.atan2(best.x, best.z); e.pitch = 0; e.hp = 100; e.alive = true; e.prot = 1.5; e.ammo = WEAPONS.map((W) => W.mag); e.rl = 0; e.cd = 0.3; e.crack = 0; e.m.g.visible = true; e.net.tp.copy(e.pos);
  if (e.bot && owns(e)) e.w = Math.floor(Math.random() * 3);
}
function moveEnt(e, wx, wz, jump, dt) {
  const SPEED = 6.4, a = Math.min(1, dt * (e.onGround ? 12 : 3));
  e.vel.x += (wx * SPEED - e.vel.x) * a; e.vel.z += (wz * SPEED - e.vel.z) * a;
  if (jump && e.onGround) { e.vel.y = 8.6; e.onGround = false; if (e === me) S.play('jump'); }
  e.vel.y -= 24 * dt;
  const nx = e.pos.x + e.vel.x * dt; if (blocked(nx, e.pos.z, e.pos.y)) e.vel.x = 0; else e.pos.x = nx;
  const nz = e.pos.z + e.vel.z * dt; if (blocked(e.pos.x, nz, e.pos.y)) e.vel.z = 0; else e.pos.z = nz;
  const gy = groundAt(e.pos.x, e.pos.z, e.pos.y);
  e.pos.y += e.vel.y * dt;
  if (e.pos.y <= gy) { if (!e.onGround && e.vel.y < -7) { e.land = 1; if (e === me) S.play('land'); } e.pos.y = gy; e.vel.y = 0; e.onGround = true; }
  else if (e.pos.y > gy + 0.05) e.onGround = false;
  e.moving = Math.hypot(e.vel.x, e.vel.z) > 1 ? 1 : 0;
}

// ---------------- fx (stop-motion: particles step at 12 fps)
const parts = [], tracers = [], splats = [];
let fxAcc = 0;
function burst(p, color, n, spd = 4, size = 0.08) {
  for (let i = 0; i < n; i++) { if (parts.length > 220) { const o = parts.shift(); scene.remove(o.m); }
    const m = new THREE.Mesh(blobG, mat(color, { boil: 0 })); m.scale.setScalar(size * rnd(0.6, 1.4)); m.position.copy(p); m.castShadow = true; scene.add(m);
    parts.push({ m, v: new V3(rnd(-1, 1), rnd(0.3, 1.5), rnd(-1, 1)).multiplyScalar(spd), life: rnd(0.6, 1.4), spin: rnd(-8, 8) }); }
}
function shellBreak(e) {
  const p = center(e); burst(p, e.color, 14, 6, 0.16); burst(p, 0xf2b52a, 10, 3.5, 0.12); burst(p, 0xfbf6ec, 8, 3, 0.1);
  const y = groundAt(e.pos.x, e.pos.z, e.pos.y + 0.3);
  const w = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.05, 24), mat(0xfbf6ec, { boil: 0.02 })); w.scale.set(rnd(0.9, 1.3), 1, rnd(0.8, 1.1)); w.position.set(e.pos.x, y + 0.03 + splats.length * 0.0005, e.pos.z); w.receiveShadow = true;
  const yk = new THREE.Mesh(sphG, mat(0xf2a520, { boil: 0.02 })); yk.scale.set(0.4, 0.12, 0.4); yk.position.set(rnd(-0.2, 0.2), 0.05, rnd(-0.2, 0.2)); w.add(yk);
  scene.add(w); splats.push({ m: w, life: 12 }); if (splats.length > 14) scene.remove(splats.shift().m);
}
const tracerMat = new THREE.MeshBasicMaterial({ color: 0xfff1c8, transparent: true, opacity: 0.85 }), tracerGeo = new THREE.CylinderGeometry(0.025, 0.025, 1, 6); tracerGeo.rotateX(Math.PI / 2); tracerGeo.translate(0, 0, 0.5);
function tracer(a, b) { const m = new THREE.Mesh(tracerGeo, tracerMat); m.position.copy(a); m.lookAt(b); m.scale.set(1, 1, a.distanceTo(b)); scene.add(m); tracers.push({ m, life: 0.07 }); }
function fxStep(dt) {
  for (let i = tracers.length - 1; i >= 0; i--) if ((tracers[i].life -= dt) <= 0) { scene.remove(tracers[i].m); tracers.splice(i, 1); }
  for (let i = splats.length - 1; i >= 0; i--) if ((splats[i].life -= dt) <= 0) { scene.remove(splats[i].m); splats.splice(i, 1); }
  fxAcc += dt; if (fxAcc < 1 / 12) return; const st = fxAcc; fxAcc = 0;
  for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.life -= st; p.v.y -= 18 * st; p.m.position.addScaledVector(p.v, st); p.m.rotation.x += p.spin * st; p.m.rotation.y += p.spin * st;
    const g = groundAt(p.m.position.x, p.m.position.z, p.m.position.y + 0.2); if (p.m.position.y < g + 0.04) { p.m.position.y = g + 0.04; p.v.multiplyScalar(0.3); p.v.y = Math.abs(p.v.y) * 0.3; p.m.scale.y *= 0.7; }
    if (p.life <= 0) { scene.remove(p.m); parts.splice(i, 1); } }
}

// ---------------- weapons
let shake = 0, hurtA = 0, recoil = 0, vmKick = 0, zoom = false;
const tmpA = new V3(), tmpB = new V3(), dir = new V3();
function camDir(yaw, pitch, out) { return out.set(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch)); }
function startReload(e) { const W = WEAPONS[e.w]; if (e.rl > 0 || e.ammo[e.w] >= W.mag) return; e.rl = W.reload; if (e === me) S.play('reload'); }
function earVol(p) { return me && !me.spect ? clamp(1 - p.distanceTo(camera.position) / 45, 0, 1) : 0.3; }
function fire(e, remote = null) {
  const W = WEAPONS[e.w];
  if (!remote) { if (e.cd > 0 || e.rl > 0 || !e.alive) return; if (e.ammo[e.w] <= 0) { startReload(e); return; } e.cd = W.rate; e.ammo[e.w]--; }
  const o = eye(e, new V3()), hits = new Map(), ends = [];
  let mz; if (e === me) { mz = new V3(); vmGun().userData.muzzle.getWorldPosition(mz); mz.sub(vmCam.position); mz.applyQuaternion(camera.quaternion).add(camera.position); }
  else { mz = new V3(); e.m.guns[e.w].userData.muzzle.getWorldPosition(mz); }
  const spread = W.spread * (e === me && zoom ? 0.2 : 1) * (e.onGround ? 1 : 2) + (e.moving && W.pellets === 1 && !(e === me && zoom) ? 0.012 : 0);
  for (let p = 0; p < W.pellets; p++) {
    if (remote) { ends.push(new V3().fromArray(remote[p] || remote[0])); continue; }
    camDir(e.yaw + rnd(-spread, spread), e.pitch + rnd(-spread, spread), dir);
    let t = Math.min(W.range, rayWorld(o, dir)), tgt = null;
    for (const x of ents) { if (x === e || !x.alive || x.spect) continue; const te = rayEgg(o, dir, x); if (te < t) { t = te; tgt = x; } }
    const end = o.clone().addScaledVector(dir, t); ends.push(end);
    if (tgt) { const head = end.y > tgt.pos.y + 1.12; const h = hits.get(tgt) || { dmg: 0, head: false }; h.dmg += W.dmg * (head ? 2 : 1) * (W.pellets > 1 ? clamp(1.4 - t / W.range, 0.3, 1) : 1); h.head = h.head || head; hits.set(tgt, h); }
  }
  for (const end of ends) { tracer(mz, end); burst(end, hitsHas(end) ? e.color : 0xc9b08a, 2, 2.5, 0.05); }
  S.play(W.snd, earVol(o) * (e === me ? 1 : 0.7));
  for (const [t, h] of hits) damage(t, h.dmg, e, h.head);
  if (e === me) { me.pitch = clamp(me.pitch + W.kick, -1.5, 1.5); vmKick = 1; shake = Math.max(shake, W.kick * 2.5); }
  if (!remote && N.st.online && owns(e)) N.send({ t: 'shot', id: e.id, w: e.w, e: ends.map((v) => [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)]) });
}
const hitsHas = () => false;
function damage(t, dmg, from, head) {
  if (from === me) { hitmark(head); S.play(head ? 'head' : 'hit'); }
  if (!owns(t)) { N.send({ t: 'hit', to: t.id, dmg, from: from.id, head }); return; }
  applyDamage(t, dmg, from, head);
}
function applyDamage(t, dmg, from, head) {
  if (!t.alive || t.prot > 0 || state === 'end') return;
  t.hp -= dmg; t.lastHit = time; S.play('crack', earVol(center(t)) * 0.8);
  burst(center(t), t.color, head ? 6 : 3, 3, 0.07);
  if (t === me) { hurtA = 1; shake = Math.max(shake, 0.15); S.play('hurt'); }
  if (t.hp <= 0) { const msg = { t: 'kill', v: t.id, k: from ? from.id : null, head }; kill(t, from, head); if (N.st.online) N.send(msg); }
}
function kill(v, k, head) {
  if (!v.alive) return;
  v.alive = false; v.hp = 0; v.respawn = 2.6; v.d++; v.streak = 0; v.m.g.visible = false; shellBreak(v); S.play('splat', earVol(center(v)));
  if (k && k !== v) { k.k++; k.streak++; }
  feed(k, v, head);
  if (k === me && v !== me) { const gain = 100 + (head ? 25 : 0); matchXP += gain; toast((head ? 'YOLKSHOT! ' : 'CRACKED ') + v.name + '  +' + gain, head ? '#f2b52a' : '#fff');
    const sk = { 2: 'DOUBLE CRACK', 3: 'OMELETTE!', 5: 'FRITTATA FRENZY', 8: 'EGGSTINCTION' }[me.streak]; if (sk) setTimeout(() => toast(sk, '#ff8a5a', 1), 400); }
  if (v === me) { $('dead').textContent = 'Cracked by ' + (k ? k.name : 'gravity'); $('dead').classList.add('on'); deathAt.copy(me.pos); killer = k; }
  if (!N.st.online || N.st.isHost) checkEnd();
}
let killer = null; const deathAt = new V3();

// ---------------- AI
function ai(e, dt) {
  const A = e.ai, skill = e === me ? 0.85 : botSkill, W = WEAPONS[e.w];
  A.t -= dt;
  if (A.t <= 0) {
    A.t = 0.25 + Math.random() * 0.2; let best = null, bd = 1e9; const ey = eye(e, tmpA);
    for (const o of enemiesOf(e)) { const d = o.pos.distanceTo(e.pos) * (o === A.tgt ? 0.7 : 1); if (d < bd && d < 42 && los(ey, center(o, tmpB))) { bd = d; best = o; } }
    A.tgt = best; if (Math.random() < 0.18) A.strafe *= -1;
    A.jump = e.pos.distanceTo(A.last) < 0.25 && Math.random() < 0.6; if (A.jump && !A.tgt) A.wp = null; A.last.copy(e.pos);
  }
  let mx = 0, mz = 0, fireNow = false;
  const T = A.tgt;
  if (T && T.alive) {
    const dx = T.pos.x - e.pos.x, dz = T.pos.z - e.pos.z, dy = T.pos.y + 0.85 - (e.pos.y + 1.35), d = Math.hypot(dx, dz) || 0.01;
    A.err.x = clamp(A.err.x + rnd(-1, 1) * dt * 3, -1, 1); A.err.y = clamp(A.err.y + rnd(-1, 1) * dt * 3, -1, 1);
    const eAmt = (1 - skill) * 0.14 + (T.moving ? 0.02 : 0);
    const ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, d);
    const wy = ty + A.err.x * eAmt, wp = tp + A.err.y * eAmt * 0.6, rate = (1.5 + skill * 7) * dt;
    e.yaw += clamp(angDiff(e.yaw, wy), -rate, rate); e.pitch += clamp(wp - e.pitch, -rate, rate);
    const off = Math.abs(angDiff(e.yaw, ty)) * d + Math.abs(e.pitch - tp) * d; // miss distance in metres (approx)
    fireNow = off < (W.pellets > 1 ? 1.6 : 0.9) && d < W.range * 0.85;
    if (e.ammo[e.w] === 0) startReload(e);
    const pref = W.pellets > 1 ? 4 : W.zoom ? 18 : 10, adv = d > pref + 2 ? 1 : d < pref - 2 ? -0.7 : 0, fx = dx / d, fz = dz / d;
    mx = fx * adv - fz * A.strafe * 0.8; mz = fz * adv + fx * A.strafe * 0.8;
  } else {
    if (!A.wp || Math.hypot(A.wp.x - e.pos.x, A.wp.z - e.pos.z) < 1.5) A.wp = openPoint();
    const dx = A.wp.x - e.pos.x, dz = A.wp.z - e.pos.z, d = Math.hypot(dx, dz) || 1, ty = Math.atan2(-dx, -dz), rate = 4 * dt;
    e.yaw += clamp(angDiff(e.yaw, ty), -rate, rate); e.pitch *= 0.9; mx = dx / d; mz = dz / d;
    if (e.ammo[e.w] < WEAPONS[e.w].mag / 2) startReload(e);
  }
  const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
  // hop over low obstacles ahead
  const px = e.pos.x + mx * 0.9, pz = e.pos.z + mz * 0.9; let hop = false;
  if (blocked(px, pz, e.pos.y)) { const top = boxes.filter((b) => hit2(px, pz, b)).reduce((m, b) => Math.max(m, b.top), 0); if (top < e.pos.y + 2.1) hop = true; else { A.strafe *= -1; A.wp = null; } }
  return { mx, mz, jump: hop || A.jump, fire: fireNow };
}

// ---------------- input
const keys = {}; let mouseDown = false, locked = false;
const touch = { mx: 0, mz: 0, fire: false, jump: false, look: null, stick: null };
addEventListener('keydown', (ev) => { keys[ev.code] = true; S.unlock();
  if (ev.code === 'KeyR' && me.alive) startReload(me);
  if (/^Digit[123]$/.test(ev.code)) selectW(+ev.code[5] - 1);
  if (ev.code === 'KeyQ') cycleW();
  if (ev.code === 'Tab') { ev.preventDefault(); $('board').classList.remove('hidden'); board(); }
  if (ev.code === 'KeyM' && state !== 'menu') openMenu();
});
addEventListener('keyup', (ev) => { keys[ev.code] = false; if (ev.code === 'Tab') $('board').classList.add('hidden'); });
const cv = renderer.domElement;
cv.addEventListener('mousedown', (ev) => { S.unlock(); if (!TOUCH && !locked && state !== 'menu') cv.requestPointerLock?.(); if (ev.button === 0) mouseDown = true; if (ev.button === 2) zoom = WEAPONS[me.w].zoom && me.alive; });
addEventListener('mouseup', (ev) => { if (ev.button === 0) mouseDown = false; if (ev.button === 2) zoom = false; });
cv.addEventListener('contextmenu', (ev) => ev.preventDefault());
addEventListener('wheel', () => cycleW());
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === cv; });
addEventListener('mousemove', (ev) => { if (!locked || !me.alive) return; const s = 0.0022 * (zoom ? 0.4 : 1); me.yaw -= ev.movementX * s; me.pitch = clamp(me.pitch - ev.movementY * s, -1.45, 1.45); });
const unlocked = (w) => levelOf(save.xp).l >= WEAPONS[w].lvl;
function selectW(w) { if (!unlocked(w) || w === me.w) return; me.w = w; me.cd = 0.3; me.rl = 0; zoom = false; save.w = w; persist(); S.play('click'); }
function cycleW() { for (let i = 1; i <= 3; i++) { const w = (me.w + i) % 3; if (unlocked(w)) { selectW(w); return; } } }
if (TOUCH) {
  $('touch').classList.remove('hidden'); document.body.classList.add('touch');
  const tz = $('touch');
  tz.addEventListener('pointerdown', (ev) => { S.unlock(); if (ev.target.tagName === 'BUTTON') return;
    if (ev.clientX < innerWidth * 0.45 && !touch.stick) { touch.stick = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; $('stick').style.cssText = `left:${ev.clientX - 60}px;top:${ev.clientY - 60}px;display:block`; }
    else if (!touch.look) touch.look = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; });
  tz.addEventListener('pointermove', (ev) => {
    if (touch.stick && ev.pointerId === touch.stick.id) { let dx = (ev.clientX - touch.stick.x) / 50, dy = (ev.clientY - touch.stick.y) / 50; const L = Math.hypot(dx, dy); if (L > 1) { dx /= L; dy /= L; } touch.mx = dx; touch.mz = dy; $('nub').style.transform = `translate(${dx * 40}px,${dy * 40}px)`; }
    if (touch.look && ev.pointerId === touch.look.id) { me.yaw -= (ev.clientX - touch.look.x) * 0.006; me.pitch = clamp(me.pitch - (ev.clientY - touch.look.y) * 0.006, -1.45, 1.45); touch.look.x = ev.clientX; touch.look.y = ev.clientY; } });
  const up = (ev) => { if (touch.stick && ev.pointerId === touch.stick.id) { touch.stick = null; touch.mx = touch.mz = 0; $('stick').style.display = 'none'; } if (touch.look && ev.pointerId === touch.look.id) touch.look = null; };
  tz.addEventListener('pointerup', up); tz.addEventListener('pointercancel', up);
  const hold = (id, k) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); touch[k] = true; }); b.addEventListener('pointerup', () => { touch[k] = false; }); b.addEventListener('pointerleave', () => { touch[k] = false; }); };
  hold('tFire', 'fire'); hold('tJump', 'jump');
  $('tSwap').addEventListener('pointerdown', () => cycleW()); $('tRel').addEventListener('pointerdown', () => startReload(me));
  $('tZoom').addEventListener('pointerdown', () => { zoom = !zoom && WEAPONS[me.w].zoom; });
}

// ---------------- viewmodel
const vmGuns = WEAPONS.map((_, i) => { const g = gunMesh(i); g.visible = false; g.scale.setScalar(0.62); vmScene.add(g); return g; });
const vmGun = () => vmGuns[me.w];
const handG = new THREE.Mesh(sphG, mat(0xf3ead8)); vmScene.add(handG);

// ---------------- match flow
function startMatch() {
  state = 'play'; timeLeft = MATCH_TIME; matchXP = 0; timeScale = 1; endT = 0;
  botSkill = clamp(0.35 + levelOf(save.xp).l * 0.05, 0.35, 0.85);
  for (const e of ents) { e.k = 0; e.d = 0; e.streak = 0; if (!e.remote) { e.alive = false; e.respawn = 0.1 + Math.random() * 0.4; } }
  me.spect = false; me.respawn = 0;
  $('results').classList.add('hidden'); $('menu').classList.add('hidden'); $('dead').classList.remove('on');
  S.play('start'); toast('FIRST TO ' + KILLS_TO_WIN + ' CRACKS', '#fff', 1);
}
function ranking() { return ents.filter((e) => !e.spect).sort((a, b) => b.k - a.k || a.d - b.d); }
function checkEnd() { if (state === 'play' && (timeLeft <= 0 || ents.some((e) => e.k >= KILLS_TO_WIN))) endMatch(); }
function endMatch(fromNet) {
  if (state !== 'play') return;
  state = 'end'; endT = 0; timeScale = 0.25; S.play('end');
  if (N.st.online && N.st.isHost && !fromNet) N.send({ t: 'end' });
  const r = ranking(), place = r.indexOf(me) + 1, before = levelOf(save.xp).l;
  const bonus = [0, 400, 250, 150][place] || 75, gain = matchXP + bonus;
  save.xp += gain; save.matches++; if (place === 1) save.wins++; persist();
  const after = levelOf(save.xp).l, unl = [];
  for (let l = before + 1; l <= after; l++) { WEAPONS.forEach((w) => w.lvl === l && unl.push('Weapon: ' + w.name)); SHELLS.forEach((s) => s.lvl === l && unl.push('Shell: ' + s.n)); HATS.forEach((h) => h.lvl === l && unl.push('Hat: ' + h.n)); }
  if (after > before) setTimeout(() => S.play('level'), 900);
  const lv = levelOf(save.xp);
  $('results').innerHTML = `<h1>${place === 1 ? 'TOP EGG!' : place <= 3 ? 'Nicely Scrambled' : 'Hard Boiled Luck'}</h1>
    <p class="place">#${place} of ${r.length}</p>
    <table>${r.map((e, i) => `<tr class="${e === me ? 'me' : ''}"><td>${i + 1}</td><td>${e.name}</td><td>${e.k}</td><td>${e.d}</td></tr>`).join('')}</table>
    <p>+${matchXP} kills &nbsp; +${bonus} placing &nbsp; = <b>+${gain} XP</b></p>
    <div class="xp"><div style="width:${lv.cur / lv.need * 100}%"></div><span>Level ${lv.l}</span></div>
    ${after > before ? `<p class="lvup">LEVEL UP! ${unl.join(' &middot; ')}</p>` : ''}
    <p class="next">Next match in <span id="nextT">10</span>s</p>
    <button id="bNext">Next match</button> <button id="bMenu">Menu</button>`;
  $('bNext').onclick = () => { if (!N.st.online || N.st.isHost) { startMatch(); if (N.st.online) N.send({ t: 'start' }); } };
  $('bMenu').onclick = openMenu;
  if (document.pointerLockElement) document.exitPointerLock();
}
function openMenu() {
  state = 'menu'; me.spect = true; me.alive = false; me.m.g.visible = false; timeScale = 1; $('results').classList.add('hidden'); $('dead').classList.remove('on');
  if (document.pointerLockElement) document.exitPointerLock();
  const lv = levelOf(save.xp);
  const chip = (arr, key) => arr.map((x, i) => `<button class="chip ${save[key] === i ? 'sel' : ''}" ${lv.l < x.lvl ? 'disabled' : ''} data-k="${key}" data-i="${i}">${x.n}${lv.l < x.lvl ? ' (L' + x.lvl + ')' : ''}</button>`).join('');
  $('menu').innerHTML = `<h1>EGG<br>WARS</h1><p class="sub">a claymation shell-out</p>
    <div class="xp"><div style="width:${lv.cur / lv.need * 100}%"></div><span>Level ${lv.l} &middot; ${lv.cur}/${lv.need} XP &middot; ${save.wins} wins</span></div>
    <button id="mPlay" class="big">PLAY vs BOTS</button>
    <div class="row"><button id="mHost">HOST ONLINE</button><input id="mCode" maxlength="4" placeholder="CODE"><button id="mJoin">JOIN</button></div>
    <p id="mNet" class="sub"></p>
    <h3>Shell</h3><div class="chips">${chip(SHELLS, 'color')}</div>
    <h3>Hat</h3><div class="chips">${chip(HATS, 'hat')}</div>
    <h3>Arsenal</h3><div class="chips">${WEAPONS.map((w) => `<span class="chip ${lv.l >= w.lvl ? '' : 'off'}">${w.name}${lv.l >= w.lvl ? '' : ' (L' + w.lvl + ')'}</span>`).join('')}</div>
    <p class="sub">WASD move &middot; mouse aim &middot; click shoot &middot; Space jump &middot; R reload &middot; 1-3/Q swap &middot; RMB scope &middot; Tab scores</p>`;
  $('menu').classList.remove('hidden');
  $('menu').querySelectorAll('button.chip').forEach((b) => b.onclick = () => { save[b.dataset.k] = +b.dataset.i; persist(); rebuildMe(); openMenu(); S.play('click'); });
  $('mPlay').onclick = () => { S.unlock(); startMatch(); };
  $('mHost').onclick = () => { const code = Math.random().toString(36).slice(2, 6).toUpperCase(); $('mNet').textContent = 'Opening room...'; N.host(code, onNet, (s) => { if (s === 'open') { me.id = N.st.myId; netTag('Room ' + code + ' - share this code'); startMatch(); } else netStatus(s); }); };
  $('mJoin').onclick = () => { const code = $('mCode').value.trim().toUpperCase(); if (code.length < 4) return; $('mNet').textContent = 'Joining ' + code + '...';
    N.join(code, onNet, (s) => { if (s === 'conn') { me.id = N.st.myId; for (const b of ents.filter((x) => x.bot)) removeEnt(b); netTag('Online: room ' + code); startMatch(); } else netStatus(s); }); };
}
const netTag = (t) => { $('net').textContent = t; };
const netStatus = (s) => { if ($('mNet')) $('mNet').textContent = s; netTag(s === 'left' ? 'A player left' : s.startsWith('error') ? 'Online ' + s : $('net').textContent); };
function rebuildMe() { scene.remove(me.m.g); me.color = SHELLS[save.color].c; me.hat = save.hat; me.m = makeEgg(me.color, me.hat); me.m.g.visible = false; scene.add(me.m.g); }

// ---------------- networking
let netT = 0;
const pack = (e) => ({ id: e.id, n: e.name, c: e.color, h: e.hat, p: [+e.pos.x.toFixed(2), +e.pos.y.toFixed(2), +e.pos.z.toFixed(2)], y: +e.yaw.toFixed(3), pi: +e.pitch.toFixed(3), hp: Math.round(e.hp), a: e.alive, k: e.k, d: e.d, w: e.w, b: e.bot, m: e.moving });
function upsert(s) {
  if (s.id === me.id) return;
  let e = ents.find((x) => x.id === s.id);
  if (!e) { e = mkEnt(s.id, s.n, s.c, s.h, { remote: true, bot: s.b }); e.pos.fromArray(s.p); }
  e.net.tp.fromArray(s.p); e.yaw = s.y; e.pitch = s.pi; e.hp = s.hp; e.k = s.k; e.d = s.d; e.w = s.w; e.moving = s.m; e.net.seen = time;
  if (s.a && !e.alive) { e.alive = true; e.pos.fromArray(s.p); e.m.g.visible = true; } else if (!s.a && e.alive) { e.alive = false; e.m.g.visible = false; }
}
function onNet(m) {
  if (m.t === 's') { m.list.forEach(upsert); if (m.time != null && !N.st.isHost) timeLeft = m.time; }
  else if (m.t === 'shot') { const e = ents.find((x) => x.id === m.id); if (e && e !== me) { e.w = m.w; fire(e, m.e); } }
  else if (m.t === 'hit') { const t = ents.find((x) => x.id === m.to), f = ents.find((x) => x.id === m.from); if (t && owns(t)) applyDamage(t, m.dmg, f, m.head); }
  else if (m.t === 'kill') { const v = ents.find((x) => x.id === m.v), k = ents.find((x) => x.id === m.k); if (v) kill(v, k, m.head); }
  else if (m.t === 'end' && !N.st.isHost) endMatch(true);
  else if (m.t === 'start' && !N.st.isHost) startMatch();
}
function netStep(dt) {
  if (!N.st.online) return;
  netT -= dt; if (netT > 0) return; netT = 1 / 15;
  const list = ents.filter((e) => owns(e) && !e.spect).map(pack);
  N.send({ t: 's', list, time: N.st.isHost ? +timeLeft.toFixed(1) : null });
  for (const e of ents.slice()) if (e.remote && time - e.net.seen > 4) removeEnt(e);
}

// ---------------- simulation step
const G = { auto: Q.has('auto') };
function step(dtReal) {
  const dt = dtReal * timeScale; time += dt; clayUniforms.uTime.value = time;
  if (state === 'play' && (!N.st.online || N.st.isHost)) { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; checkEnd(); } }
  if (state === 'end') { endT += dtReal; if (endT > 1.2) { timeScale = 1; $('results').classList.remove('hidden'); } const n = Math.ceil(10 - endT); if ($('nextT')) $('nextT').textContent = Math.max(0, n);
    if (endT > 11 && (!N.st.online || N.st.isHost)) { startMatch(); if (N.st.online) N.send({ t: 'start' }); } }
  for (const e of ents) {
    if (e.remote) { if (e.alive) { e.pos.lerp(e.net.tp, Math.min(1, dt * 14)); } continue; }
    if (e.spect || e.freeze) continue;
    if (!e.alive) { if (state !== 'end' && (e.respawn -= dt) <= 0) { respawn(e); if (e === me) $('dead').classList.remove('on'); } continue; }
    e.cd -= dt; e.prot -= dt; if (e.rl > 0 && (e.rl -= dt) <= 0) { e.rl = 0; e.ammo[e.w] = WEAPONS[e.w].mag; }
    if (time - e.lastHit > 5 && e.hp < 100) e.hp = Math.min(100, e.hp + 15 * dt);
    let mx = 0, mz = 0, jump = false, shoot = false;
    if (e === me && !G.auto) {
      const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) - touch.mz, r = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + touch.mx;
      const s = Math.sin(me.yaw), c = Math.cos(me.yaw); mx = -s * f + c * r; mz = -c * f - s * r; const L = Math.hypot(mx, mz); if (L > 1) { mx /= L; mz /= L; }
      jump = keys.Space || touch.jump; shoot = (mouseDown && (locked || TOUCH || Q.has('nolock'))) || touch.fire;
      if (state !== 'play') shoot = false;
    } else { const a = ai(e, dt); mx = a.mx; mz = a.mz; jump = a.jump; shoot = a.fire && state !== 'end'; }
    moveEnt(e, mx, mz, jump, dt);
    if (shoot) fire(e);
  }
  // egg visuals (animation pose steps at 12 fps = stop-motion)
  const st = Math.floor(time * 12) / 12;
  for (const e of ents) {
    if (!e.alive) continue; const g = e.m.g; g.position.copy(e.pos); g.rotation.y = e.yaw;
    e.land = Math.max(0, e.land - dt * 4); const ls = Math.floor(e.land * 4) / 4;
    e.m.body.rotation.z = e.moving ? Math.sin(st * 13 + e.phase) * 0.1 : Math.sin(st * 2 + e.phase) * 0.02;
    e.m.body.scale.set(1 + ls * 0.15, 1 - ls * 0.2, 1 + ls * 0.15);
    e.m.body.position.y = e.moving ? Math.abs(Math.sin(st * 13 + e.phase)) * 0.08 : 0;
    e.m.eyes.scale.y = ((st + e.phase) % 3.7) < 0.17 ? 0.15 : 1;
    e.m.guns.forEach((gm, i) => { gm.visible = i === e.w; gm.rotation.x = e.pitch * 0.8; });
    e.crack += ((1 - e.hp / 100) - e.crack) * Math.min(1, dt * 6); e.m.mat.userData.u.uCrack.value = e.crack;
    g.visible = e !== me || state === 'menu';
    if (e.prot > 0) g.visible = g.visible && Math.floor(time * 12) % 2 === 0;
  }
  fxStep(dt); netStep(dtReal);
  shake = Math.max(0, shake - dtReal * 1.5); hurtA = Math.max(0, hurtA - dtReal * 1.6); vmKick = Math.max(0, vmKick - dtReal * 8);
}

// ---------------- camera, render, hud
function render() {
  if (state === 'menu') { const a = time * 0.08; camera.position.set(Math.sin(a) * 20, 9, Math.cos(a) * 20); camera.lookAt(0, 0, 0); }
  else if (!me.alive && state !== 'end') { const a = Math.floor(time * 12) / 12 * 0.4; camera.position.set(deathAt.x + Math.sin(a) * 6, deathAt.y + 4.5, deathAt.z + Math.cos(a) * 6); camera.lookAt(killer && killer.alive ? center(killer) : deathAt); }
  else { camera.position.set(me.pos.x, me.pos.y + 1.35 + (me.moving && me.onGround ? Math.sin(time * 11) * 0.04 : 0), me.pos.z); camera.rotation.set(me.pitch + (Math.random() - 0.5) * shake * 0.1, me.yaw + (Math.random() - 0.5) * shake * 0.1, 0); }
  const fov = zoom && me.alive ? 28 : 75; camera.fov += (fov - camera.fov) * 0.3; camera.updateProjectionMatrix();
  renderer.clear(); renderer.render(scene, camera);
  const showVM = state !== 'menu' && me.alive && !zoom;
  vmGuns.forEach((g, i) => { g.visible = showVM && i === me.w; });
  handG.visible = showVM;
  if (showVM) { const g = vmGun(), bob = me.moving && me.onGround ? Math.sin(Math.floor(time * 12) / 12 * 11) : 0, rl = me.rl > 0 ? Math.sin(Math.min(1, me.rl / WEAPONS[me.w].reload) * Math.PI) : 0;
    g.position.set(0.27 + bob * 0.01, -0.25 - Math.abs(bob) * 0.01 - rl * 0.2, -0.78 + vmKick * 0.05); g.rotation.set(vmKick * 0.15 + rl * 0.6, 0.04, 0);
    handG.position.set(g.position.x + 0.01, g.position.y - 0.07, g.position.z + 0.12); handG.scale.set(0.06, 0.06, 0.07);
    renderer.clearDepth(); renderer.render(vmScene, vmCam); }
}
let hudT = 0;
function hud(dt) {
  $('hurt').style.opacity = hurtA * 0.8; $('scope').classList.toggle('on', zoom && me.alive); $('cross').style.display = zoom ? 'none' : '';
  $('hint').style.display = !TOUCH && !locked && state === 'play' && !Q.has('nolock') ? '' : 'none';
  $('hud').style.display = state === 'menu' ? 'none' : '';
  if ((hudT -= dt) > 0) return; hudT = 0.1;
  const m = Math.floor(timeLeft / 60), s = Math.floor(timeLeft % 60);
  $('timer').textContent = m + ':' + String(s).padStart(2, '0');
  const r = ranking(), lead = r[0];
  $('score').textContent = `You ${me.k}  |  Leader ${lead ? lead.name + ' ' + lead.k : '-'}  /  ${KILLS_TO_WIN}`;
  $('hpbar').style.width = Math.max(0, me.hp) + '%'; $('hpbar').style.background = me.hp > 60 ? '#f3ead8' : me.hp > 30 ? '#f2b52a' : '#e0603a'; $('hpn').textContent = Math.ceil(Math.max(0, me.hp));
  const W = WEAPONS[me.w]; $('wname').textContent = W.name; $('ammon').textContent = me.rl > 0 ? 'reloading' : me.ammo[me.w] + ' / ' + W.mag;
  const lv = levelOf(save.xp + matchXP); $('lvl').textContent = 'Lv ' + lv.l;
}
function board() { $('board').innerHTML = '<table><tr><th>#</th><th>Egg</th><th>Cracks</th><th>Cracked</th></tr>' + ranking().map((e, i) => `<tr class="${e === me ? 'me' : ''}"><td>${i + 1}</td><td>${e.name}</td><td>${e.k}</td><td>${e.d}</td></tr>`).join('') + '</table>'; }
function feed(k, v, head) { const d = document.createElement('div'); d.innerHTML = `<b>${k && k !== v ? k.name : ''}</b> ${head ? '&#9673;' : '&#10033;'} <b>${v.name}</b>`; if (k === me || v === me) d.className = 'mine'; $('feed').prepend(d); setTimeout(() => d.remove(), 4500); while ($('feed').children.length > 5) $('feed').lastChild.remove(); }
let toastTO = 0;
function toast(t, c = '#fff', big) { const el = $('toast'); el.textContent = t; el.style.color = c; el.className = 'on' + (big ? ' big' : ''); clearTimeout(toastTO); toastTO = setTimeout(() => { el.className = ''; }, 1600); }
let hmTO = 0;
function hitmark(head) { const el = $('hitm'); el.className = 'on' + (head ? ' head' : ''); clearTimeout(hmTO); hmTO = setTimeout(() => { el.className = ''; }, 120); }
function resize() { renderer.setSize(innerWidth, innerHeight); camera.aspect = vmCam.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); vmCam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------------- boot
me = mkEnt('me', 'You', SHELLS[save.color].c, save.hat);
if (unlocked(save.w)) me.w = save.w;
for (let i = 0; i < BOTS; i++) { const b = mkEnt('b' + i, BOT_NAMES[i], SHELLS[i % SHELLS.length].c, i % 4, { bot: true }); b.w = i % 3; }
if (Q.has('title')) { openMenu(); for (const e of ents) if (e.bot) { e.respawn = 0.1; } } else startMatch();
let last = performance.now();
function frame(now) { requestAnimationFrame(frame); const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); render(); hud(dt); }
requestAnimationFrame(frame);
// test hooks
Object.defineProperties(G, { me: { get: () => me }, state: { get: () => state }, timeLeft: { get: () => timeLeft } });
Object.assign(G, { ents, save, fast(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) step(dt); render(); hud(1); }, startMatch, openMenu, WEAPONS });
window.__G = G;
