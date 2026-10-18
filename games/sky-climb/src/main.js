// SKY CLIMB: climb a floating tower of junk into a hazy sky. Falls cost height, not lives.
import * as THREE from '../vendor/three.module.js';
import { buildWorld, buildSky, shared, ZONES, mat } from './world.js';
import { Post } from './post.js';
import { Sfx } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3, clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const TOUCH = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ---------- save ----------
const SAVE_KEY = 'skyclimb.v1';
let save = { best: 0, shards: [], wins: 0, bestTime: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };
const UNLOCKS = [{ n: 6, k: 'glide', t: 'Scarf Glide unlocked: hold Space while falling' }, { n: 16, k: 'dusk', t: 'Dusk scarf woven' }, { n: 28, k: 'gold', t: 'Gilded scarf woven' }];
const has = (k) => save.shards.length >= UNLOCKS.find(u => u.k === k).n;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, TOUCH ? 1.25 : 1.5)); renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.setClearColor(0x000000, 0);
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, .1, 1500);
const SUN = new V3(-.62, .36, -.7).normalize();
scene.add(new THREE.HemisphereLight(0xd8d3ec, 0x857a76, 1.5));
const sun = new THREE.DirectionalLight(0xffe0c0, 2.3); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22, near: 1, far: 160 }); sun.shadow.bias = -.0006; sun.shadow.normalBias = .03;
scene.add(sun, sun.target);
const W = buildWorld(scene, SUN);
const SKY = buildSky(scene, SUN, W.topY);
const post = new Post(renderer, SUN);
const sfx = new Sfx(Q.has('mute'));

// ---------- hero: a small cloaked wanderer with a long ribbon scarf ----------
const hero = new THREE.Group(); scene.add(hero);
const cloak = new THREE.Mesh(new THREE.ConeGeometry(.42, 1.05, 14), mat(0xe6dccb)); cloak.position.y = .72; cloak.castShadow = true; hero.add(cloak);
const hem = new THREE.Mesh(new THREE.TorusGeometry(.4, .05, 6, 18), mat(0xb9a58f)); hem.rotation.x = Math.PI / 2; hem.position.y = .22; hero.add(hem);
const head = new THREE.Mesh(new THREE.SphereGeometry(.24, 16, 12), mat(0xf1e6d8)); head.position.y = 1.36; head.castShadow = true; hero.add(head);
const hood = new THREE.Mesh(new THREE.SphereGeometry(.29, 16, 10, 0, Math.PI * 2, 0, Math.PI * .58), mat(0xcfc0aa)); hood.position.set(0, 1.38, -.04); hood.rotation.x = -.35; hero.add(hood);
for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(.05, .07, .02), mat(0x2b2630)); e.position.set(s * .085, 1.38, .225); hero.add(e); }
const legs = [-1, 1].map(s => { const l = new THREE.Mesh(new THREE.CylinderGeometry(.065, .06, .34, 6), mat(0x4f4650)); l.position.set(s * .13, .17, 0); l.castShadow = true; hero.add(l); return l; });
const SN = 14, scarfPts = [], scarfPrev = [];
for (let i = 0; i < SN; i++) { scarfPts.push(new V3(0, 1.1 - i * .1, 4)); scarfPrev.push(new V3(0, 1.1 - i * .1, 4)); }
const scarfGeo = new THREE.BufferGeometry(); scarfGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SN * 2 * 3), 3));
const sidx = []; for (let i = 0; i < SN - 1; i++) { const a = i * 2; sidx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } scarfGeo.setIndex(sidx);
const scarfCol = () => has('gold') ? 0xd8b25c : has('dusk') ? 0x9a6fa8 : 0xc0604c;
const scarf = new THREE.Mesh(scarfGeo, new THREE.MeshStandardMaterial({ color: scarfCol(), side: 2, roughness: .8 })); scarf.castShadow = true; scarf.frustumCulled = false; scene.add(scarf);
const blob = new THREE.Mesh(new THREE.CircleGeometry(.45, 20), new THREE.MeshBasicMaterial({ color: 0x2a2433, transparent: true, opacity: .35, depthWrite: false }));
blob.rotation.x = -Math.PI / 2; scene.add(blob);
let pinMesh = null;

// ---------- particles (billboards) ----------
const PN = 220, pData = [];
const pMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false,
  vertexShader: `varying vec2 vUv; varying vec3 vC; void main(){vec3 ce=(instanceMatrix*vec4(0,0,0,1)).xyz; float s=length(instanceMatrix[0].xyz);
    vec3 r=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]), u=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    vUv=uv; vC=instanceColor; gl_Position=projectionMatrix*viewMatrix*vec4(ce+(r*position.x+u*position.y)*s,1.);}`,
  fragmentShader: 'varying vec2 vUv; varying vec3 vC; void main(){float a=smoothstep(.5,.0,length(vUv-.5)); if(a<.01) discard; gl_FragColor=vec4(vC,a*.8);}',
}), PN);
pMesh.frustumCulled = false; scene.add(pMesh);
const m4 = new THREE.Matrix4(), tc = new THREE.Color();
for (let i = 0; i < PN; i++) { pData.push({ p: new V3(), v: new V3(), life: 0, max: 1, s: 0 }); pMesh.setMatrixAt(i, m4.makeScale(0, 0, 0)); pMesh.setColorAt(i, tc.set(0xffffff)); }
let pHead = 0;
function burst(pos, n, color, spd, size, up = 0, life = .8) {
  for (let k = 0; k < n; k++) { const d = pData[pHead]; pMesh.setColorAt(pHead, tc.set(color)); pHead = (pHead + 1) % PN;
    const a = Math.random() * 6.28, e = Math.random() - .3; d.p.copy(pos); d.v.set(Math.cos(a) * spd * (.4 + Math.random()), up + e * spd, Math.sin(a) * spd * (.4 + Math.random())); d.life = d.max = life * (.6 + Math.random() * .6); d.s = size * (.6 + Math.random() * .8); }
  pMesh.instanceColor.needsUpdate = true;
}

// ---------- state ----------
const P = { pos: W.start.clone(), vel: new V3(), ground: null, coyote: 0, jumpBuf: 0, airMax: 0, stun: 0, face: Math.PI, pathIdx: -1, bestY: 0, runBest: 0, falls: 0, fallen: 0, time: 0, pins: 0, pin: null, zone: 0, maxZone: 0, won: false, gliding: false, squash: 0, walk: 0 };
const cam = { yaw: 0, pitch: .32, dist: 6.5, shake: 0, cur: new V3(0, 3, 12) };
let simT = 0, fade = 0, bot = Q.has('bot'), paused = Q.has('title'), lastJumpHeld = false, toastT = 0;
const keys = {}; const touch = { x: 0, z: 0, jump: false, jumpEdge: false };
const RAD = .34, HGT = 1.6;

function respawn() {
  const at = P.pin || W.start; P.pos.copy(at); P.pos.y += .3; P.vel.set(0, 0, 0); P.ground = null; P.airMax = P.pos.y; fade = 1;
  P.pathIdx = P.pin ? P.pinPath : -1; sfx.whoosh();
}
function newRun() {
  P.pin = null; if (pinMesh) { scene.remove(pinMesh); pinMesh = null; } P.pins = 0; P.time = 0; P.falls = 0; P.fallen = 0; P.runBest = 0; P.maxZone = 0; P.won = false;
  respawn(); $('win').classList.add('hide');
}

// ---------- collision ----------
function surfDist(c, x, z) { // horizontal distance from point to collider footprint
  const dx = x - c.x, dz = z - c.z;
  if (c.t === 'b') { const lx = dx * c.co - dz * c.si, lz = dx * c.si + dz * c.co; const ex = lx - clamp(lx, -c.hx, c.hx), ez = lz - clamp(lz, -c.hz, c.hz); return Math.hypot(ex, ez); }
  return Math.max(0, Math.hypot(dx, dz) - c.r);
}
function supportAt(x, z, y) { for (const c of W.cols) { const t = c.y + c.hy; if (t > y - .7 && t < y + .3 && surfDist(c, x, z) < .05) return c; } return null; }
function collide(prevY) {
  const p = P.pos;
  for (const c of W.cols) {
    const top = c.y + c.hy, bot = c.y - c.hy;
    if (p.y > top + .05 || p.y + HGT < bot) continue;
    const dx = p.x - c.x, dz = p.z - c.z; let lx, lz, ex, ez;
    if (c.t === 'b') { lx = dx * c.co - dz * c.si; lz = dx * c.si + dz * c.co; ex = lx - clamp(lx, -c.hx, c.hx); ez = lz - clamp(lz, -c.hz, c.hz); }
    else { lx = dx; lz = dz; const d = Math.hypot(dx, dz); const k = d > c.r ? (d - c.r) / d : 0; ex = dx * k; ez = dz * k; }
    const d2 = ex * ex + ez * ez; if (d2 >= RAD * RAD) continue;
    if (P.vel.y <= 0 && (prevY >= top - .03 || p.y > top - .4)) { p.y = top; P.vel.y = 0; P.ground = c; continue; }
    if (P.vel.y > 0 && prevY + HGT <= bot + .05) { p.y = bot - HGT; P.vel.y = 0; continue; }
    let nx, nz, pen;
    if (d2 > 1e-8) { const d = Math.sqrt(d2); nx = ex / d; nz = ez / d; pen = RAD - d; }
    else if (c.t === 'b') { const px = c.hx - Math.abs(lx), pz = c.hz - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; pen = px + RAD; } else { nx = 0; nz = Math.sign(lz) || 1; pen = pz + RAD; } }
    else { const d = Math.hypot(dx, dz) || 1e-4; nx = dx / d; nz = dz / d; pen = c.r - d + RAD; }
    let wx = nx, wz = nz; if (c.t === 'b') { wx = nx * c.co + nz * c.si; wz = -nx * c.si + nz * c.co; }
    p.x += wx * pen; p.z += wz * pen;
    const vn = P.vel.x * wx + P.vel.z * wz; if (vn < 0) { P.vel.x -= vn * wx; P.vel.z -= vn * wz; }
  }
}

function nearestPath() { let bi = -1, bd = 1e9; for (const c of W.path) { const t = c.y + c.hy; if (t < P.pos.y - .6 || t > P.pos.y + 1.6) continue; const d = surfDist(c, P.pos.x, P.pos.z); if (d < bd) { bd = d; bi = c.path; } } return bi - 1; }
// ---------- input ----------
function readInput() {
  if (bot) return botInput();
  let f = 0, s = 0; if (keys.KeyW || keys.ArrowUp) f++; if (keys.KeyS || keys.ArrowDown) f--; if (keys.KeyD || keys.ArrowRight) s++; if (keys.KeyA || keys.ArrowLeft) s--;
  if (touch.x || touch.z) { s = touch.x; f = -touch.z; }
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
  let x = fx * f + rx * s, z = fz * f + rz * s; const m = Math.hypot(x, z); const mag = Math.min(1, m); if (m > 1e-4) { x /= m; z /= m; }
  const held = !!keys.Space || touch.jump; const edge = (held && !lastJumpHeld) || touch.jumpEdge; lastJumpHeld = held; touch.jumpEdge = false;
  return { x, z, mag, jumpPressed: edge, jumpHeld: held, sprint: !!(keys.ShiftLeft || keys.ShiftRight) || TOUCH && mag > .9 };
}
function botInput() {
  const tg = W.path[Math.min(P.pathIdx + 1, W.path.length - 1)];
  let dx = tg.x - P.pos.x, dz = tg.z - P.pos.z; const d = Math.hypot(dx, dz) || 1; dx /= d; dz /= d;
  let mag = 1, jump = false;
  if (P.ground && P.ground !== tg) { // first walk to the edge of our platform nearest the target
    const g = P.ground; let ex, ez;
    if (g.t === 'b') { const ldx = tg.x - g.x, ldz = tg.z - g.z; const lx = clamp(ldx * g.co - ldz * g.si, -g.hx + .25, g.hx - .25), lz = clamp(ldx * g.si + ldz * g.co, -g.hz + .1, g.hz - .1); ex = g.x + lx * g.co + lz * g.si; ez = g.z - lx * g.si + lz * g.co; }
    else { const a = Math.atan2(tg.z - g.z, tg.x - g.x), rr = Math.min(g.r - .2, Math.hypot(tg.x - g.x, tg.z - g.z)); ex = g.x + Math.cos(a) * rr; ez = g.z + Math.sin(a) * rr; }
    const ddx = ex - P.pos.x, ddz = ez - P.pos.z, dd = Math.hypot(ddx, ddz);
    if (dd > .35 && surfDist(tg, P.pos.x, P.pos.z) > 3.2) return { x: ddx / dd, z: ddz / dd, mag: 1, jumpPressed: false, jumpHeld: true, sprint: true };
  }
  if (P.ground) {
    const ahead = supportAt(P.pos.x + dx * .55, P.pos.z + dz * .55, P.pos.y);
    const ed = surfDist(tg, P.pos.x, P.pos.z), tTop = tg.y + tg.hy;
    if (P.ground !== tg && (!ahead || (tTop > P.pos.y + .3 && ed < 1.1))) jump = true;
    mag = clamp((surfDist(tg, P.pos.x, P.pos.z) + 1.2) / 5, .5, 1);
  } else { const cd = Math.hypot(tg.x - P.pos.x, tg.z - P.pos.z); mag = clamp(cd * .35, 0, 1); }
  return { x: dx, z: dz, mag, jumpPressed: jump, jumpHeld: true, sprint: true };
}

// ---------- simulation step ----------
const H = 1 / 120;
function step(dt) {
  simT += dt; if (!P.won) P.time += dt;
  for (const c of W.movers) { const ny = c.baseY + Math.sin(simT * c.bs + c.ph) * c.amp; c.dy = ny - c.y; c.y = ny; c.obj.position.y = ny; }
  if (P.ground && P.ground.dy) P.pos.y += P.ground.dy;
  const inp = readInput(); P.lastInp = inp;
  const sp = (inp.sprint ? 9.4 : 6.6) * inp.mag, onG = !!P.ground;
  const acc = P.stun > 0 ? 0 : (onG ? 55 : 15);
  const tvx = inp.x * sp, tvz = inp.z * sp;
  P.vel.x += clamp(tvx - P.vel.x, -acc * dt, acc * dt); P.vel.z += clamp(tvz - P.vel.z, -acc * dt, acc * dt);
  if (onG && P.stun > 0) { P.vel.x *= .85; P.vel.z *= .85; }
  P.stun -= dt;
  P.coyote = onG ? .12 : P.coyote - dt; P.jumpBuf = inp.jumpPressed ? .14 : P.jumpBuf - dt;
  if (P.jumpBuf > 0 && P.coyote > 0 && P.stun <= 0) { P.vel.y = 10.5; P.jumpBuf = 0; P.coyote = 0; P.ground = null; P.squash = -.25; sfx.jump(); burst(P.pos, 5, 0xe7ded6, 1.5, .25, .5, .5); }
  let g = 28; P.gliding = false;
  if (!P.ground && P.vel.y < 0 && inp.jumpHeld && has('glide') && !bot) { P.vel.y = Math.max(P.vel.y, -2.8); P.gliding = true; }
  else if (P.vel.y > 0 && !inp.jumpHeld) g = 46;
  P.vel.y = Math.max(P.vel.y - g * dt, -42);
  const prevY = P.pos.y; const was = P.ground;
  P.pos.addScaledVector(P.vel, dt); P.ground = null; collide(prevY);
  if (P.ground) {
    if (!was) onLand();
    P.airMax = P.pos.y; if (P.ground.path !== undefined) P.pathIdx = P.ground.path; else if (bot) P.pathIdx = nearestPath();
  } else P.airMax = Math.max(P.airMax, P.pos.y);
  if (P.pos.y > P.runBest) P.runBest = P.pos.y;
  if (P.pos.y > save.best) save.best = P.pos.y;
  let z = 0; for (let i = 0; i < W.zoneY.length; i++) if (P.pos.y >= W.zoneY[i]) z = i; P.zone = z;
  if (P.ground && z > P.maxZone) { P.maxZone = z; P.pins++; toast(ZONES[z].name, 'a pin was granted (F to plant)'); sfx.bell(1); }
  for (const s of W.shards) if (!s.got && s.mesh.position.distanceToSquared(P.pos.clone().setY(P.pos.y + .8)) < 1.3) collect(s);
  if (!P.won && P.pos.distanceTo(W.bellPos) < 3.4) win();
  if (P.pos.y < -11) { P.falls++; P.fallen += Math.max(0, P.airMax - P.pos.y); popup('the clouds caught you'); respawn(); }
}
function onLand() {
  const drop = P.airMax - P.pos.y; const k = clamp(drop / 18, 0, 1);
  if (drop > .6) { sfx.land(k); burst(P.pos, 6 + (k * 18 | 0), 0xd9cfc6, 2 + k * 5, .35 + k * .4, .4, .7); P.squash = .3 + k * .4; }
  if (drop > 6) cam.shake = Math.min(1, k * 1.4);
  if (drop > 7) { (P.failLog ||= []).push(P.pathIdx); P.falls++; P.fallen += drop; popup('-' + Math.round(drop) + 'm'); }
  if (drop > 15) P.stun = .5;
}
function collect(s) {
  s.got = true; s.mesh.visible = false; if (!save.shards.includes(s.id)) save.shards.push(s.id);
  sfx.shard(save.shards.length); burst(s.mesh.position, 14, 0xffd9a0, 3, .22, 1, .9);
  for (const u of UNLOCKS) if (save.shards.length === u.n) { toast('Unlocked', u.t); scarf.material.color.set(scarfCol()); }
  persist();
}
function win() {
  P.won = true; sfx.bell(2); fade = .9; save.wins++; if (!save.bestTime || P.time < save.bestTime) save.bestTime = P.time; persist();
  const t = P.time, mm = Math.floor(t / 60), ss = Math.floor(t % 60);
  $('wstats').innerHTML = `<div><b>${mm}:${String(ss).padStart(2, '0')}</b><span>climb time</span></div><div><b>${P.falls}</b><span>falls</span></div><div><b>${Math.round(P.fallen)}m</b><span>height lost</span></div><div><b>${save.shards.length}/${W.shards.length}</b><span>shards</span></div>`;
  setTimeout(() => { if (!P.won) return; $('win').classList.remove('hide'); document.exitPointerLock?.(); }, 1400);
}
function toast(a, b) { $('zone').innerHTML = `<b>${a}</b><span>${b}</span>`; $('zone').classList.add('on'); toastT = 3.4; }
function popup(t) { const e = document.createElement('div'); e.className = 'pop'; e.textContent = t; $('pops').appendChild(e); setTimeout(() => e.remove(), 1600); }
function plantPin() {
  if (!P.ground || P.pins <= 0) return; P.pins--; P.pin = P.pos.clone(); P.pinPath = P.pathIdx;
  if (!pinMesh) { pinMesh = new THREE.Group(); const pole = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, 1.4, 5), mat(0x5a4c42)); pole.position.y = .7; pinMesh.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(.55, .35), new THREE.MeshStandardMaterial({ color: 0xc0604c, side: 2, emissive: 0x401810 })); fl.position.set(.28, 1.2, 0); pinMesh.add(fl); scene.add(pinMesh); }
  pinMesh.position.copy(P.pin); sfx.tone(660, .4, 'triangle', .12, 0, .5); burst(P.pos, 10, 0xc0604c, 2, .2, 1.5, .7); popup('pin planted');
}

// ---------- visuals per frame ----------
const ray = new THREE.Raycaster(), tmpV = new V3(), hazeA = new THREE.Color(), hazeB = new THREE.Color();
function visuals(dt) {
  shared.uTime.value = simT;
  // hero pose
  const hs = Math.hypot(P.vel.x, P.vel.z);
  if (hs > .5) { const tf = Math.atan2(P.vel.x, P.vel.z); let d = tf - P.face; d = Math.atan2(Math.sin(d), Math.cos(d)); P.face += d * Math.min(1, dt * 12); }
  hero.position.copy(P.pos); hero.rotation.y = P.face;
  P.squash += (0 - P.squash) * Math.min(1, dt * 10);
  hero.scale.set(1 + P.squash * .5, 1 - P.squash, 1 + P.squash * .5);
  if (P.ground && hs > .5) { const w0 = P.walk; P.walk += dt * hs * 1.9; legs[0].position.z = Math.sin(P.walk) * .14; legs[1].position.z = -Math.sin(P.walk) * .14; if (Math.floor(w0 / Math.PI) !== Math.floor(P.walk / Math.PI)) sfx.step(); }
  else { legs[0].position.z = P.ground ? 0 : .1; legs[1].position.z = P.ground ? 0 : -.08; }
  cloak.rotation.x = clamp(-P.vel.y * .01, -.25, .25) + (P.ground ? hs * .012 : 0);
  // scarf verlet
  const fx = Math.sin(P.face), fz = Math.cos(P.face);
  scarfPts[0].set(P.pos.x - fx * .12, P.pos.y + 1.12 * hero.scale.y, P.pos.z - fz * .12); scarfPrev[0].copy(scarfPts[0]);
  const wind = new V3(Math.sin(simT * .7) * 1.5 + 2, Math.sin(simT * 1.3) * .5, Math.cos(simT * .5) * 1.2);
  const sdt = Math.min(dt, 1 / 30);
  for (let i = 1; i < SN; i++) { const p = scarfPts[i], q = scarfPrev[i]; const vx = (p.x - q.x) * .93, vy = (p.y - q.y) * .93, vz = (p.z - q.z) * .93; q.copy(p); p.x += vx + wind.x * sdt * sdt; p.y += vy + (wind.y - (P.gliding ? 1 : 6)) * sdt * sdt; p.z += vz + wind.z * sdt * sdt; }
  for (let it = 0; it < 3; it++) for (let i = 1; i < SN; i++) { const a = scarfPts[i - 1], b = scarfPts[i]; tmpV.subVectors(b, a); const l = tmpV.length() || 1e-4; b.copy(a).addScaledVector(tmpV, .12 / l); }
  const pa = scarfGeo.attributes.position.array; const sw = P.gliding ? .32 : .13;
  for (let i = 0; i < SN; i++) { const p = scarfPts[i], w = sw * (1 - i / SN * .4); pa.set([p.x + fz * w, p.y, p.z - fx * w, p.x - fz * w, p.y, p.z + fx * w], i * 6); }
  scarfGeo.attributes.position.needsUpdate = true; scarfGeo.computeVertexNormals(); scarfGeo.computeBoundingSphere();
  // blob shadow
  const sup = supportAt(P.pos.x, P.pos.z, P.pos.y + .01) || (() => { let best = null; for (const c of W.cols) { const t = c.y + c.hy; if (t <= P.pos.y + .01 && surfDist(c, P.pos.x, P.pos.z) < .05 && (!best || t > best.y + best.hy)) best = c; } return best; })();
  blob.visible = !!sup; if (sup) { const t = sup.y + sup.hy, h = P.pos.y - t; blob.position.set(P.pos.x, t + .02, P.pos.z); const s = clamp(1 - h / 14, .35, 1); blob.scale.setScalar(s); blob.material.opacity = .4 * s; }
  // shards spin
  for (const s of W.shards) if (!s.got) { s.mesh.rotation.y = simT * 1.6 + s.id; s.mesh.position.y = s.pos.y + Math.sin(simT * 2 + s.id) * .12; }
  for (const f of W.flaps) f.rotation.x = Math.sin(simT * 2.2 + f.userData.flap) * .3;
  W.bell.rotation.z = Math.sin(simT * .8) * (P.won ? .25 : .03);
  for (let i = 0; i < W.debD.length; i++) { const d = W.debD[i]; d.a += d.sp * dt; m4.makeRotationFromEuler(new THREE.Euler(d.rx + simT * .2, d.ry + simT * .13, 0)); m4.scale(tmpV.setScalar(d.s)); m4.setPosition(Math.cos(d.a) * d.r, d.y + Math.sin(simT * .3 + i) * .6, Math.sin(d.a) * d.r); W.deb.setMatrixAt(i, m4); }
  W.deb.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < PN; i++) { const d = pData[i]; if (d.life <= 0) continue; d.life -= dt; d.v.y -= 3 * dt; d.v.multiplyScalar(1 - dt * 2.5); d.p.addScaledVector(d.v, dt); const s = d.life > 0 ? d.s * (d.life / d.max) : 0; m4.makeScale(s, s, s); m4.setPosition(d.p); pMesh.setMatrixAt(i, m4); }
  pMesh.instanceMatrix.needsUpdate = true;
  // haze tint follows zone
  const zf = clamp((P.pos.y - (W.zoneY[P.zone] || 0)) / 6, 0, 1); hazeA.set(ZONES[Math.max(0, P.zone - 1)].haze); hazeB.set(ZONES[P.zone].haze); hazeA.lerp(hazeB, P.zone ? zf : 1);
  post.u.haze.value.lerp(hazeA, Math.min(1, dt * 2)); shared.uRim.value.copy(post.u.haze.value); SKY.sky.material.uniforms.hor.value.copy(post.u.haze.value);
  // camera
  const tgt = tmpV.copy(P.pos); tgt.y += 1.35;
  const off = new V3(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  let dist = cam.dist + clamp(-P.vel.y * .05, 0, 2);
  ray.set(tgt, off); ray.far = dist; const hit = ray.intersectObjects(W.solids, true)[0]; if (hit) dist = Math.max(1.2, hit.distance - .3);
  const want = tgt.clone().addScaledVector(off, dist);
  cam.cur.lerp(want, Math.min(1, dt * 14)); if (cam.cur.distanceTo(want) > 8) cam.cur.copy(want);
  camera.position.copy(cam.cur); cam.shake *= Math.exp(-dt * 5);
  if (cam.shake > .01) camera.position.add(new V3((Math.random() - .5), (Math.random() - .5), (Math.random() - .5)).multiplyScalar(cam.shake * .5));
  camera.lookAt(tgt); camera.fov += ((62 + clamp(-P.vel.y - 12, 0, 25) * .5) - camera.fov) * Math.min(1, dt * 3); camera.updateProjectionMatrix();
  sun.position.copy(P.pos).addScaledVector(SUN, 70); sun.target.position.copy(P.pos);
  sfx.wind(P.vel.length());
  fade = Math.max(0, fade - dt * 1.2); post.u.white.value = fade * fade;
  // HUD
  $('h').textContent = Math.max(0, Math.round(P.pos.y)); $('best').textContent = 'best ' + Math.round(save.best) + 'm';
  $('shards').textContent = '◆ ' + save.shards.length + '/' + W.shards.length; $('pins').textContent = '⚑ ' + P.pins + (P.pin ? ' · pinned' : '');
  $('barfill').style.height = clamp(P.pos.y / W.topY * 100, 0, 100) + '%'; $('barbest').style.bottom = clamp(save.best / W.topY * 100, 0, 100) + '%';
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('zone').classList.remove('on'); }
}

// ---------- loop ----------
let acc = 0, last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!paused) { acc += dt; let n = 0; while (acc >= H && n < 8) { step(H); acc -= H; n++; } if (n === 8) acc = 0; }
  visuals(paused ? 0 : dt);
  if (paused) { cam.yaw += dt * .05; }
  post.render(scene, camera, now / 1000);
}
requestAnimationFrame(frame);

// ---------- events ----------
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); post.resize(); });
addEventListener('keydown', (e) => {
  sfx.init(); keys[e.code] = true; if (e.code === 'Space') e.preventDefault();
  if (e.code === 'KeyF') plantPin(); if (e.code === 'KeyM') sfx.toggle(); if (e.code === 'KeyR' && !paused) { P.falls++; respawn(); }
  if (e.code === 'Escape' && !$('menu').classList.contains('hide')) startPlay();
  $('hint').classList.add('dim');
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
const cv = renderer.domElement; let drag = null;
cv.addEventListener('mousedown', (e) => { sfx.init(); drag = { x: e.clientX, y: e.clientY }; if (!TOUCH && !paused && document.pointerLockElement !== cv) cv.requestPointerLock?.()?.catch?.(() => {}); });
addEventListener('mouseup', () => { drag = null; });
addEventListener('mousemove', (e) => {
  let mx = 0, my = 0; if (document.pointerLockElement === cv) { mx = e.movementX; my = e.movementY; } else if (drag) { mx = e.clientX - drag.x; my = e.clientY - drag.y; drag.x = e.clientX; drag.y = e.clientY; } else return;
  cam.yaw -= mx * .0028; cam.pitch = clamp(cam.pitch + my * .0024, -.45, 1.2);
});
addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + e.deltaY * .004, 3.5, 11); });
// touch: left half = stick, right half = look, buttons for jump/pin
if (TOUCH) {
  document.body.classList.add('touch');
  let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0; const knob = $('stick').firstElementChild;
  cv.addEventListener('touchstart', (e) => { sfx.init(); for (const t of e.changedTouches) { if (t.clientX < innerWidth * .45 && stickId === null) { stickId = t.identifier; sx = t.clientX; sy = t.clientY; $('stick').style.cssText = `left:${sx - 55}px;top:${sy - 55}px;opacity:1`; } else if (lookId === null) { lookId = t.identifier; lx = t.clientX; ly = t.clientY; } } e.preventDefault(); }, { passive: false });
  cv.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) { if (t.identifier === stickId) { let dx = (t.clientX - sx) / 50, dy = (t.clientY - sy) / 50; const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } touch.x = dx; touch.z = dy; knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`; } else if (t.identifier === lookId) { cam.yaw -= (t.clientX - lx) * .006; cam.pitch = clamp(cam.pitch + (t.clientY - ly) * .005, -.45, 1.2); lx = t.clientX; ly = t.clientY; } } e.preventDefault(); }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === stickId) { stickId = null; touch.x = touch.z = 0; knob.style.transform = ''; $('stick').style.opacity = .35; } if (t.identifier === lookId) lookId = null; } };
  cv.addEventListener('touchend', end); cv.addEventListener('touchcancel', end);
  $('tj').addEventListener('touchstart', (e) => { sfx.init(); touch.jump = true; touch.jumpEdge = true; e.preventDefault(); }, { passive: false });
  $('tj').addEventListener('touchend', () => { touch.jump = false; });
  $('tp').addEventListener('touchstart', (e) => { plantPin(); e.preventDefault(); }, { passive: false });
}
function startPlay() { sfx.init(); paused = false; $('menu').classList.add('hide'); }
$('play').addEventListener('click', startPlay);
$('again').addEventListener('click', () => { sfx.init(); newRun(); });
if (paused) { $('menu').classList.remove('hide'); cam.pitch = .15; }
if (TOUCH) $('hint').textContent = 'left: move · right: look · ⤒ jump · ⚑ pin';
cam.yaw = Math.atan2(P.pos.x, P.pos.z) + .35; cam.pitch = .12;
P.airMax = P.pos.y;
for (const s of W.shards) if (save.shards.includes(s.id)) { s.got = true; s.mesh.visible = false; }

// test hooks (headless bot / scripted checks)
window.SKY = {
  sim(sec, useBot = true) { bot = useBot; paused = false; const n = Math.round(sec / H); for (let i = 0; i < n; i++) { step(H); if (P.won) break; } bot = Q.has('bot'); return this.state(); },
  state: () => ({ y: +P.pos.y.toFixed(2), pathIdx: P.pathIdx, of: W.path.length, runBest: +P.runBest.toFixed(1), top: +W.topY.toFixed(1), zone: P.zone, falls: P.falls, shards: save.shards.length, fails: (P.failLog || []).join(" "), won: P.won, pins: P.pins, t: +P.time.toFixed(1) }),
  warp(i) { const c = W.path[i]; P.pos.set(c.x, c.y + c.hy + .05, c.z); P.vel.set(0, 0, 0); P.airMax = P.pos.y; P.pathIdx = i; cam.cur.set(c.x + 6, c.y + 4, c.z + 6); },
  look(yaw, pitch) { cam.yaw = yaw; cam.pitch = pitch; },
  newRun,
};
