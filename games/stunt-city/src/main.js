// STUNT CITY - free-roam chrome stunt park. Car physics, stunts, challenges, garage.
import * as THREE from 'three';
import { buildWorld, PIECES, L, GAUNT, surface, toLocal, toWorld, loopPoint, lipWorld, U, FOG } from './world.js';
import { initAudio, engine, sfx, music, toggleMute } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 5000);
const W = buildWorld(scene, renderer), M = W.M;
const G = { GRAV: 18, state: 'roam' };
window.__G = G;

// ---------- save ----------
const DEF = { cash: 0, done: [], eng: 0, nos: 0, paints: [0], paint: 0, best: 0 };
let S = DEF; try { S = Object.assign({}, DEF, JSON.parse(localStorage.getItem('stuntcity') || '{}')); } catch (e) {}
const save = () => { try { localStorage.setItem('stuntcity', JSON.stringify(S)); } catch (e) {} };
G.save = S;
const PAINTS = [['PINK CHROME', 0xff7ad9], ['ICE CHROME', 0x7ff6ff], ['SUN GOLD', 0xffc34d], ['MIRROR', 0xffffff], ['ULTRAVIOLET', 0x9a6bff]];

// ---------- car ----------
function buildCar() {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const sh = new THREE.Shape(); [[2.3, 0.35], [2.32, 0.62], [0.6, 0.9], [-1.9, 0.98], [-2.28, 0.92], [-2.28, 0.35]].forEach(([x, y], i) => i ? sh.lineTo(x, y) : sh.moveTo(x, y));
  const bg = new THREE.ExtrudeGeometry(sh, { depth: 1.9, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }); bg.rotateY(-Math.PI / 2); bg.translate(0.95, 0, 0);
  const paint = M.chrome(PAINTS[S.paint][1], 0.16); paint.envMapIntensity = 1.6;
  body.add(new THREE.Mesh(bg, paint));
  const ch = new THREE.Shape(); [[0.62, 0.9], [-0.15, 1.34], [-1.05, 1.34], [-1.85, 0.97]].forEach(([x, y], i) => i ? ch.lineTo(x, y) : ch.moveTo(x, y));
  const cg = new THREE.ExtrudeGeometry(ch, { depth: 1.6, bevelEnabled: true, bevelSize: 0.05, bevelThickness: 0.05, bevelSegments: 1 }); cg.rotateY(-Math.PI / 2); cg.translate(0.8, 0, 0);
  body.add(new THREE.Mesh(cg, new THREE.MeshStandardMaterial({ color: 0x150022, metalness: 1, roughness: 0.03, envMap: M.env, envMapIntensity: 2 })));
  const tail = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.06), M.pink); tail.position.set(0, 0.78, -2.37); body.add(tail);
  for (const s of [-1, 1]) { const hl = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0xfff6e0, toneMapped: false })); hl.position.set(s * 0.6, 0.55, 2.4); body.add(hl); }
  const sp = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, 0.45), paint); sp.position.set(0, 1.25, -2.0); body.add(sp);
  for (const s of [-0.75, 0.75]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.2), paint); st.position.set(s, 1.08, -2.0); body.add(st); }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.06, 3.8), M.cyan); for (const s of [-1, 1]) { const m = stripe.clone(); m.position.set(s * 1.0, 0.6, 0.05); body.add(m); }
  const wg = new THREE.CylinderGeometry(0.4, 0.4, 0.32, 18); wg.rotateZ(Math.PI / 2);
  const wm = new THREE.MeshStandardMaterial({ color: 0x0a0010, roughness: 0.5 }), rg = new THREE.TorusGeometry(0.27, 0.05, 6, 20); rg.rotateY(Math.PI / 2);
  const wheels = [];
  for (const [x, z] of [[0.95, 1.4], [-0.95, 1.4], [0.95, -1.38], [-0.95, -1.38]]) { const piv = new THREE.Group(); piv.position.set(x, 0.4, z); const w = new THREE.Mesh(wg, wm); const r = new THREE.Mesh(rg, M.cyan); r.position.x = Math.sign(x) * 0.17; w.add(r); piv.add(w); g.add(piv); wheels.push(piv); }
  const cv = document.createElement('canvas'); cv.width = cv.height = 64; const cx = cv.getContext('2d'); const gr = cx.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,80,200,0.9)'); gr.addColorStop(1, 'rgba(255,80,200,0)'); cx.fillStyle = gr; cx.fillRect(0, 0, 64, 64);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.4), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; g.add(glow);
  const flames = []; for (const s of [-0.5, 0.5]) { const f = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.3, 8), new THREE.MeshBasicMaterial({ color: 0x66ffff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, toneMapped: false })); f.rotation.x = -Math.PI / 2; f.position.set(s, 0.5, -2.9); f.visible = false; body.add(f); flames.push(f); }
  scene.add(g); return { g, body, wheels, flames, paint, glow };
}
const CAR = buildCar();
const car = { pos: new THREE.Vector3(0, 0, 60), vel: new THREE.Vector3(), yaw: Math.PI, pitch: 0, roll: 0, mode: 'ground', steer: 0, nitro: 1, air: 0, spinP: 0, spinY: 0, spinR: 0, takeoff: new THREE.Vector3(), safe: { pos: new THREE.Vector3(0, 0, 60), yaw: Math.PI }, crash: 0, loop: null, th: 0, ls: 0, wheelRot: 0, maxY: 0 };
G.car = car;
const input = { up: 0, down: 0, left: 0, right: 0, nitro: 0, hand: 0, rollL: 0, rollR: 0 };
G.input = input;
const maxSpd = () => 40 * (1 + S.eng * 0.07);
const nosCap = () => 1 + S.nos * 0.35;
const fwd = (y) => new THREE.Vector3(Math.sin(y), 0, Math.cos(y));
const wrap = (a) => { a = (a + Math.PI) % (Math.PI * 2); if (a < 0) a += Math.PI * 2; return a - Math.PI; };

function groundInfo(x, z, y, yaw) {
  const s = surface(x, z, y), f = fwd(yaw), l = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const hf = surface(x + f.x * 1.4, z + f.z * 1.4, s.h).h, hb = surface(x - f.x * 1.4, z - f.z * 1.4, s.h).h;
  const hl = surface(x + l.x * 0.9, z + l.z * 0.9, s.h).h, hr = surface(x - l.x * 0.9, z - l.z * 0.9, s.h).h;
  return { h: s.h, piece: s.piece, wall: s.wall, pitch: -Math.atan2(hf - hb, 2.8), roll: Math.atan2(hl - hr, 1.8) };
}

// ---------- fx: particles ----------
const NP = 400, pPos = new Float32Array(NP * 3), pCol = new Float32Array(NP * 3), parts = [];
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
{ const cv = document.createElement('canvas'); cv.width = cv.height = 32; const c = cv.getContext('2d'), gr = c.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, '#fff'); gr.addColorStop(0.4, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = gr; c.fillRect(0, 0, 32, 32);
  const pts = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.9, map: new THREE.CanvasTexture(cv), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); pts.frustumCulled = false; scene.add(pts); }
for (let i = 0; i < NP; i++) parts.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), c: new THREE.Color() });
let pi = 0;
function burst(at, n, col, spd = 10, up = 4) { for (let i = 0; i < n; i++) { const q = parts[pi = (pi + 1) % NP]; q.life = 0.6 + Math.random() * 0.8; q.p.copy(at); q.v.set((Math.random() - 0.5) * spd, Math.random() * up + 1, (Math.random() - 0.5) * spd); q.c.set(col); } }
function stepParts(dt) { for (let i = 0; i < NP; i++) { const q = parts[i]; if (q.life > 0) { q.life -= dt; q.v.y -= 9 * dt; q.p.addScaledVector(q.v, dt); if (q.p.y < 0.05) { q.p.y = 0.05; q.v.y *= -0.4; } } const k = Math.max(0, Math.min(1, q.life)); pPos[i * 3] = q.p.x; pPos[i * 3 + 1] = q.life > 0 ? q.p.y : -999; pPos[i * 3 + 2] = q.p.z; pCol[i * 3] = q.c.r * k; pCol[i * 3 + 1] = q.c.g * k; pCol[i * 3 + 2] = q.c.b * k; } pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; }

// ---------- rings ----------
const ringGeo = new THREE.TorusGeometry(4, 0.35, 10, 40), ringMat = new THREE.MeshBasicMaterial({ color: 0xfff06b, toneMapped: false });
const haloMat = new THREE.MeshBasicMaterial({ color: 0xff4fc0, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false, toneMapped: false });
const rings = []; G.rings = rings;
function clearRings() { for (const r of rings) scene.remove(r.m); rings.length = 0; }
function addRing(p, dirYaw) { const m = new THREE.Group(); m.add(new THREE.Mesh(ringGeo, ringMat)); m.add(new THREE.Mesh(new THREE.CircleGeometry(3.7, 32), haloMat)); m.position.copy(p); m.rotation.y = dirYaw; scene.add(m); rings.push({ m, p: p.clone(), got: false, yaw: dirYaw }); }

// ---------- challenges ----------
const SPRINT = []; for (let i = 0; i < 8; i++) { const a = -i / 8 * Math.PI * 2; SPRINT.push(new THREE.Vector3(190 + Math.cos(a) * 85, 2.6, -140 + Math.sin(a) * 60)); }
const CH = [
  { name: 'SUNSET SPRINT', goal: 'Fly through 8 rings', time: 55, cash: 300, spawn: [275, -95, Math.PI], kind: 'rings', rings: () => SPRINT.map((p, i) => [p, Math.atan2(SPRINT[(i + 1) % 8].x - p.x, SPRINT[(i + 1) % 8].z - p.z)]) },
  { name: 'CHROME LOOP', goal: 'Ride the loop all the way round', time: 25, cash: 400, spawn: [60, 40, Math.PI], kind: 'loop', piece: L.loop1 },
  { name: 'BIG AIR', goal: 'Stay airborne 2.2 s off the mega ramp', time: 35, cash: 500, spawn: [-90, 120, Math.PI], kind: 'air', need: 2.2 },
  { name: 'SKY GAUNTLET', goal: 'Hit 5 rings over the ramps', time: 40, cash: 600, spawn: [-230, 260, Math.PI], kind: 'rings', rings: () => GAUNT.map((p) => [lipWorld(p, 2.4, 3), p.yaw]) },
  { name: 'BACKFLIP', goal: 'Land a flip off the purple ramp', time: 35, cash: 700, spawn: [180, 300, Math.PI], kind: 'flip' },
  { name: 'GAP JUMP', goal: 'Clear the gap, land on the far ramp', time: 30, cash: 800, spawn: [-150, 140, Math.PI / 2], kind: 'landOn', piece: L.gapLand },
  { name: 'GRAND LOOP', goal: 'Conquer the giant loop', time: 30, cash: 1000, spawn: [-160, -90, 0], kind: 'loop', piece: L.loop2 },
  { name: 'STUNT SHOW', goal: 'Score 6000 stunt points', time: 60, cash: 1500, spawn: [0, 110, Math.PI], kind: 'score', need: 6000 },
];
G.CH = CH;
let ch = null; // active challenge
const nextIdx = () => { for (let i = 0; i < CH.length; i++) if (!S.done.includes(i)) return i; return -1; };
// start pads
const padMat = new THREE.MeshBasicMaterial({ color: 0x66ffff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
const beamMat = padMat.clone(); beamMat.opacity = 0.12;
const pads = CH.map((c, i) => {
  const g = new THREE.Group(), [x, z] = c.spawn; g.position.set(x, 0.05, z);
  const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6, 40), padMat.clone()); ring.rotation.x = -Math.PI / 2; g.add(ring);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 60, 32, 1, true), beamMat.clone()); beam.position.y = 30; g.add(beam);
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64; const cx = cv.getContext('2d'); cx.font = 'italic bold 30px Trebuchet MS'; cx.textAlign = 'center'; cx.fillStyle = '#fff'; cx.shadowColor = '#ff3fa4'; cx.shadowBlur = 8; cx.fillText((i + 1) + ' ' + c.name, 128, 42);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthWrite: false, toneMapped: false })); spr.scale.set(16, 4, 1); spr.position.y = 9; g.add(spr);
  scene.add(g); return { g, ring, beam, spr };
});
function refreshPads() { const n = nextIdx(); pads.forEach((p, i) => { const done = S.done.includes(i), open = done || i === n; p.g.visible = !ch && open; p.ring.material.color.set(i === n ? 0xfff06b : 0x66ffff); p.beam.material.color.set(i === n ? 0xff4fc0 : 0x66ffff); p.beam.material.opacity = i === n ? 0.18 : 0.06; }); }

function placeCar(x, z, yaw) { car.pos.set(x, surface(x, z, 50).h, z); car.vel.set(0, 0, 0); car.yaw = yaw; car.pitch = car.roll = 0; car.mode = 'ground'; car.loop = null; car.crash = 0; car.safe = { pos: car.pos.clone(), yaw }; camSnap = true; }
G.placeCar = placeCar;
let countdown = 0, chT = 0, chProg = 0, jumpScore = 0;
function startChallenge(i) {
  initAudio(); const c = CH[i]; ch = c; ch.i = i; chT = c.time; chProg = 0; jumpScore = 0; runScore = 0;
  placeCar(c.spawn[0], c.spawn[1], c.spawn[2]); countdown = 3; G.state = 'count'; clearRings();
  if (c.rings) c.rings().forEach(([p, y]) => addRing(p, y));
  hide('card'); hide('garage'); $('chal').classList.remove('hide'); $('chName').textContent = c.name; $('chGoal').textContent = c.goal; refreshPads(); lastBeep = 4;
}
G.startChallenge = startChallenge;
function endChallenge(win, why) {
  const c = ch; G.state = 'result'; G.result = { win, why, i: c.i };
  if (win) { const first = !S.done.includes(c.i); const pay = first ? c.cash : Math.round(c.cash / 4); S.cash += pay; if (first) S.done.push(c.i); save(); sfx.win(); bigText('COMPLETE!'); burst(car.pos.clone().add(new THREE.Vector3(0, 2, 0)), 80, 0xfff06b, 20, 10);
    showCard(c.name + ' CLEAR', `+$${pay}${first ? '' : ' (replay)'} &middot; ${S.done.length}/8 challenges done`, nextIdx() >= 0 ? 'NEXT CHALLENGE' : 'FREE ROAM', () => { const n = nextIdx(); if (n >= 0) startChallenge(n); else toRoam(); }, 'FREE ROAM', toRoam);
  } else { sfx.fail(); showCard('FAILED', why, 'RETRY', () => startChallenge(c.i), 'FREE ROAM', toRoam); }
  $('chal').classList.add('hide');
}
G.endChallenge = endChallenge;
function toRoam() { ch = null; G.state = 'roam'; clearRings(); hide('card'); $('chal').classList.add('hide'); refreshPads(); }
G.toRoam = toRoam;
function chEvent(type, data) {
  if (!ch || G.state !== 'chal') return;
  if (ch.kind === 'loop' && type === 'loop' && data === ch.piece) endChallenge(true);
  if (ch.kind === 'air' && type === 'land' && data.air >= ch.need) endChallenge(true);
  if (ch.kind === 'flip' && type === 'land' && data.flips >= 1) endChallenge(true);
  if (ch.kind === 'landOn' && type === 'land' && data.piece === ch.piece && data.air > 0.8) endChallenge(true);
  if (ch.kind === 'score' && type === 'score' && runScore >= ch.need) endChallenge(true);
}

// ---------- stunts ----------
let combo = 0, comboT = 0, runScore = 0, popT = 0;
function land(info) {
  const t = car.air, flips = Math.round(Math.abs(car.spinP) / (Math.PI * 2)), halves = Math.round(Math.abs(car.spinY) / Math.PI), rolls = Math.round(Math.abs(car.spinR) / (Math.PI * 2));
  const dist = Math.hypot(car.pos.x - car.takeoff.x, car.pos.z - car.takeoff.z);
  const data = { air: t, flips, halves, rolls, dist, piece: info.piece };
  G.lastLand = data;
  if (t > 0.6) {
    const tricks = []; let pts = Math.round(t * 150 + Math.max(0, dist - 30) * 6);
    if (flips) { pts += flips * 1000; tricks.push((flips > 1 ? flips + 'x ' : '') + (car.spinP < 0 ? 'BACKFLIP' : 'FRONTFLIP')); }
    if (halves) { pts += halves * 350; tricks.push(halves * 180 + ''); }
    if (rolls) { pts += rolls * 1000; tricks.push((rolls > 1 ? rolls + 'x ' : '') + 'BARREL ROLL'); }
    if (t > 2.2) tricks.push('BIG AIR');
    if (!tricks.length) tricks.push('AIR ' + t.toFixed(1) + 's');
    combo = comboT > 0 ? Math.min(8, combo + 1) : 1; comboT = 3;
    const gain = pts * combo; runScore += gain; S.cash += Math.round(gain / 50); S.best = Math.max(S.best, gain); save();
    pop(tricks.join(' + ') + '  +' + gain, combo > 1 ? 'COMBO x' + combo : '');
    car.nitro = Math.min(nosCap(), car.nitro + 0.15 + flips * 0.25 + rolls * 0.25);
    sfx.stunt(1 + flips + rolls + (halves ? 1 : 0)); if (flips + rolls + halves) burst(car.pos.clone().add(new THREE.Vector3(0, 1, 0)), 30, 0x7ff6ff, 14, 6);
    shake = Math.min(1, 0.2 + t * 0.15);
  }
  sfx.land(t * 3);
  chEvent('land', data); chEvent('score');
}
function crash(reason) {
  car.mode = 'crash'; car.crash = 1.4; combo = 0; comboT = 0; sfx.crash(); shake = 1;
  burst(car.pos.clone().add(new THREE.Vector3(0, 1, 0)), 90, 0xff4fc0, 22, 12); burst(car.pos.clone(), 40, 0xffe66b, 16, 8);
  pop('WIPEOUT', reason || ''); G.crashes = (G.crashes || 0) + 1;
}
function respawn() { const s = car.safe; car.pos.copy(s.pos); car.yaw = s.yaw; car.vel.set(0, 0, 0); car.pitch = car.roll = 0; car.mode = 'ground'; camSnap = true; }

// ---------- physics ----------
function step(dt) {
  U.time.value += dt;
  if (comboT > 0) comboT -= dt;
  if (G.state === 'count') { countdown -= dt; car.vel.set(0, 0, 0); const n = Math.ceil(countdown); if (n !== lastBeep && n > 0) { lastBeep = n; sfx.beep(false); bigText(n + ''); } if (countdown <= 0) { G.state = 'chal'; sfx.beep(true); bigText('GO!'); } updateCar(0); return; }
  if (G.state === 'chal') { chT -= dt; if (chT <= 0) { chT = 0; endChallenge(false, 'Out of time'); } }
  updateCar(dt);
  // rings
  for (const r of rings) if (!r.got && r.p.distanceTo(car.pos.clone().setY(car.pos.y + 0.8)) < 4.6) { r.got = true; r.m.visible = false; chProg++; sfx.ring(); burst(r.p, 40, 0xfff06b, 16, 6); car.nitro = Math.min(nosCap(), car.nitro + 0.2); if (ch && G.state === 'chal' && ch.kind === 'rings' && rings.every((q) => q.got)) endChallenge(true); }
  // pads (roam)
  if (G.state === 'roam' && car.mode === 'ground') { const n = nextIdx(); CH.forEach((c, i) => { if ((S.done.includes(i) || i === n) && Math.hypot(car.pos.x - c.spawn[0], car.pos.z - c.spawn[1]) < 6 && padCool <= 0) { padCool = 3; startChallenge(i); } }); }
  if (padCool > 0) padCool -= dt;
  stepParts(dt);
}
let padCool = 2, lastBeep = 4;

function updateCar(dt) {
  const c = car;
  if (c.mode === 'crash') { c.crash -= dt; c.vel.multiplyScalar(Math.exp(-3 * dt)); c.pos.addScaledVector(c.vel, dt); c.pos.y = Math.max(surface(c.pos.x, c.pos.z, c.pos.y).h, c.pos.y - 9 * dt); c.roll += dt * 6; if (c.crash <= 0) respawn(); return; }
  if (dt === 0) return;
  const boosting = input.nitro && c.nitro > 0.01 && c.mode !== 'air';
  if (c.mode === 'loop') return loopStep(dt, boosting);
  if (c.mode === 'ground') {
    const f = fwd(c.yaw), l = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    let vf = c.vel.dot(f), vl = c.vel.dot(l);
    const top = maxSpd() * (boosting ? 1.45 : 1);
    if (input.up) vf += (boosting ? 34 : 22) * Math.max(0, 1 - vf / top) * dt;
    if (boosting) { c.nitro = Math.max(0, c.nitro - dt * 0.33); if (!input.up) vf += 20 * dt; } else c.nitro = Math.min(nosCap(), c.nitro + dt * 0.04);
    if (input.down) vf -= (vf > 0.5 ? 38 : 14 * Math.max(0, 1 + vf / 12)) * dt;
    if (!input.up && !input.down) vf -= vf * 0.6 * dt;
    vf -= vf * 0.04 * dt; vf -= G.GRAV * Math.sin(-c.pitch) * dt;
    const sIn = (input.left ? 1 : 0) - (input.right ? 1 : 0); c.steer += (sIn - c.steer) * Math.min(1, dt * 8);
    const sp = Math.abs(vf), turn = c.steer * 2.3 * Math.min(1, sp / 7) * (1 - 0.5 * Math.min(1, sp / 45)) * Math.sign(vf || 1) * (input.hand ? 1.5 : 1);
    c.yaw += turn * dt;
    vl *= Math.exp(-(input.hand ? 1.2 : 9) * dt); if (input.hand) vf *= Math.exp(-0.5 * dt);
    const nf = fwd(c.yaw), nl = new THREE.Vector3(Math.cos(c.yaw), 0, -Math.sin(c.yaw));
    const prevY = c.pos.y, ox = c.pos.x, oz = c.pos.z;
    c.vel.copy(nf).multiplyScalar(vf).addScaledVector(nl, vl);
    c.pos.x += c.vel.x * dt; c.pos.z += c.vel.z * dt;
    let gi = groundInfo(c.pos.x, c.pos.z, prevY, c.yaw);
    if (gi.wall || bounds()) { c.pos.x = ox; c.pos.z = oz; c.vel.multiplyScalar(-0.25); shake = 0.3; sfx.land(1); gi = groundInfo(ox, oz, prevY, c.yaw); }
    if (gi.h >= prevY - 0.35) {
      const vy = (gi.h - prevY) / dt; c.pos.y = gi.h; c.vel.y = vy; c.pitch += (gi.pitch - c.pitch) * Math.min(1, dt * 14); c.roll += (gi.roll - c.roll) * Math.min(1, dt * 14);
      c.lastVy = vy; c.lastPitch = gi.pitch;
      if (gi.h < 0.01 && sp < 60) { c.groundT = (c.groundT || 0) + dt; if (c.groundT > 1) { c.safe = { pos: c.pos.clone(), yaw: c.yaw }; c.groundT = 0; } }
      // loop entry
      for (const p of PIECES) if (p.type === 'loop') { const [u, v] = toLocal(p, c.pos.x, c.pos.z); if (u > -1.5 && u < 1.2 && Math.abs(v) < 3 && vf > 6 && Math.cos(c.yaw - p.yaw) > 0.75) { c.mode = 'loop'; c.loop = p; c.th = 0.001; c.ls = vf; c.lv = v; sfx.loop(); return; } }
    } else { // launch
      c.mode = 'air'; c.air = 0; c.spinP = c.spinY = c.spinR = 0; c.takeoff.copy(c.pos); c.vel.y = Math.max(c.lastVy || 0, -2); c.maxY = c.pos.y;
      c.pitch = c.lastPitch || c.pitch;
    }
  } else if (c.mode === 'air') {
    c.air += dt; c.vel.y -= G.GRAV * dt;
    const ox = c.pos.x, oz = c.pos.z, oy = c.pos.y;
    c.pos.addScaledVector(c.vel, dt); c.maxY = Math.max(c.maxY, c.pos.y);
    if (bounds()) { c.pos.x = ox; c.pos.z = oz; c.vel.x *= -0.3; c.vel.z *= -0.3; }
    const pIn = (input.down ? -1 : 0) + (input.up ? 1 : 0), yIn = (input.left ? 1 : 0) - (input.right ? 1 : 0), rIn = (input.rollR ? 1 : 0) - (input.rollL ? 1 : 0);
    c.pr = (c.pr || 0) + (pIn * 5.2 - (c.pr || 0)) * Math.min(1, dt * 6); c.yr = (c.yr || 0) + (yIn * 6 - (c.yr || 0)) * Math.min(1, dt * 6); c.rr = (c.rr || 0) + (rIn * 6 - (c.rr || 0)) * Math.min(1, dt * 6);
    c.pitch += c.pr * dt; c.spinP += c.pr * dt; c.yaw += c.yr * dt; c.spinY += c.yr * dt; c.roll += c.rr * dt; c.spinR += c.rr * dt;
    if (!pIn) { const hs = Math.hypot(c.vel.x, c.vel.z), tgt0 = Math.max(-0.7, Math.min(0.7, -Math.atan2(c.vel.y, hs) * 0.7)), tgt = tgt0 + Math.PI * 2 * Math.round((c.pitch - tgt0) / (Math.PI * 2)); const d = (tgt - c.pitch) * Math.min(1, dt * 2.2); c.pitch += d; c.spinP += d; }
    if (!rIn) { const tgt = Math.PI * 2 * Math.round(c.roll / (Math.PI * 2)); const d = (tgt - c.roll) * Math.min(1, dt * 2.5); c.roll += d; c.spinR += d; }
    const s = surface(c.pos.x, c.pos.z, oy);
    if (s.wall && c.pos.y < oy + 1) { c.pos.x = ox; c.pos.z = oz; c.vel.x *= -0.3; c.vel.z *= -0.3; }
    if (c.pos.y <= s.h) {
      const gi = groundInfo(c.pos.x, c.pos.z, s.h + 0.5, c.yaw); c.pos.y = s.h;
      const dp = wrap(c.pitch - gi.pitch), dr = wrap(c.roll - gi.roll);
      if (Math.abs(dp) > 1.0 || Math.abs(dr) > 0.9) { crash(Math.abs(dr) > 0.9 ? 'landed on the roof' : 'nose-planted'); c.vel.y = 0; return; }
      c.mode = 'ground'; c.pitch = gi.pitch; c.roll = gi.roll; c.vel.y = 0; c.groundT = 0;
      // keep speed along the slope
      land(gi);
    }
  }
  c.boost = boosting;
}
function bounds() { const R = 335; const p = car.pos; return Math.abs(p.x) > R || Math.abs(p.z) > R; }
function loopStep(dt, boosting) {
  const c = car, p = c.loop;
  if (input.up) c.ls += 10 * dt; if (boosting) { c.ls += 22 * dt; c.nitro = Math.max(0, c.nitro - dt * 0.33); }
  c.ls -= G.GRAV * Math.sin(c.th) * dt; c.ls -= c.ls * 0.02 * dt;
  c.th += c.ls * dt / p.R;
  const q = loopPoint(p, c.th), [x, z] = toWorld(p, q.u, q.v + c.lv); c.pos.set(x, q.y, z); c.pitch = -c.th; c.roll = 0; c.yaw = p.yaw;
  const N = c.ls * c.ls / p.R + G.GRAV * Math.cos(c.th);
  const tan = new THREE.Vector3(), f = fwd(p.yaw); tan.copy(f).multiplyScalar(Math.cos(c.th) * c.ls); tan.y = Math.sin(c.th) * c.ls;
  if (c.th >= Math.PI * 2) { c.mode = 'ground'; c.pos.y = 0; c.pitch = 0; c.vel.copy(f).multiplyScalar(c.ls); pop('LOOP!', ''); runScore += 800; S.cash += 16; sfx.stunt(3); burst(c.pos.clone().add(new THREE.Vector3(0, 1, 0)), 40, 0x7ff6ff, 14, 6); chEvent('loop', p); chEvent('score'); G.loops = (G.loops || 0) + 1; return; }
  if (N < 0 || c.ls < 0.5) { c.mode = 'air'; c.air = 0; c.spinP = c.spinY = c.spinR = 0; c.vel.copy(tan); c.takeoff.copy(c.pos); c.loop = null; pop('TOO SLOW', 'hold gas + nitro into the loop'); }
}

// ---------- camera ----------
let camSnap = true, shake = 0; const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
function updateCam(dt) {
  const c = car;
  let want, look;
  if (c.mode === 'loop') { const p = c.loop, [x, z] = toWorld(p, -p.R * 1.3, p.W / 2 - 24); want = new THREE.Vector3(x, p.R * 0.9, z); look = c.pos.clone(); }
  else {
    const hs = Math.hypot(c.vel.x, c.vel.z); const dir = hs > 4 ? new THREE.Vector3(c.vel.x, 0, c.vel.z).normalize() : fwd(c.yaw);
    if (c.mode === 'ground' && hs > 4 && dir.dot(fwd(c.yaw)) < -0.3) dir.copy(fwd(c.yaw));
    const back = 7.5 + Math.min(4, hs * 0.06);
    want = c.pos.clone().addScaledVector(dir, -back); want.y = c.pos.y + 3.2 + (c.mode === 'air' ? 1.5 : 0);
    look = c.pos.clone().addScaledVector(dir, 4); look.y = c.pos.y + 1.2;
  }
  const gy = surface(want.x, want.z, want.y + 50).h; want.y = Math.max(want.y, gy + 1.2);
  if (camSnap) { camPos.copy(want); camLook.copy(look); camSnap = false; }
  const k = 1 - Math.exp(-dt * (c.mode === 'loop' ? 3 : 6)); camPos.lerp(want, k); camLook.lerp(look, 1 - Math.exp(-dt * 10));
  camera.position.copy(camPos); if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake * 0.6; camera.position.y += (Math.random() - 0.5) * shake * 0.6; shake = Math.max(0, shake - dt * 2.5); }
  camera.lookAt(camLook);
  const tf = 62 + (c.boost ? 12 : 0) + Math.min(8, Math.hypot(c.vel.x, c.vel.z) * 0.12); camera.fov += (tf - camera.fov) * Math.min(1, dt * 4); camera.updateProjectionMatrix();
}

// ---------- render sync ----------
function syncCar(dt) {
  const c = car; CAR.g.position.copy(c.pos); CAR.g.rotation.set(c.pitch, c.yaw, c.roll, 'YXZ');
  const hs = c.vel.dot(fwd(c.yaw)); c.wheelRot += hs * dt / 0.4;
  CAR.wheels.forEach((w, i) => { w.children[0].rotation.x = c.wheelRot; if (i < 2) w.rotation.y = c.steer * 0.45; });
  CAR.flames.forEach((f) => { f.visible = !!c.boost; f.scale.set(1, 0.7 + Math.random() * 0.6, 1); });
  CAR.glow.visible = c.mode !== 'air' && c.mode !== 'loop';
  W.sky.position.copy(camera.position);
  if (c.boost && Math.random() < 0.6) { const b = fwd(c.yaw).multiplyScalar(-2.8).add(c.pos); b.y += 0.5; burst(b, 1, 0x66ffff, 2, 1); }
}

// ---------- HUD ----------
const hide = (id) => $(id).classList.add('hide'), show = (id) => $(id).classList.remove('hide');
function pop(a, b) { $('pop').textContent = a; $('combo').textContent = b; $('pop').style.opacity = 1; popT = 2.2; }
let bigT = 0; function bigText(t) { $('big').textContent = t; bigT = 0.9; }
let cardA = null, cardB = null;
function showCard(h, p, a, fa, b, fb) { $('cardH').textContent = h; $('cardP').innerHTML = p; $('cardA').textContent = a; $('cardB').textContent = b; cardA = fa; cardB = fb; show('card'); }
$('cardA').onclick = () => cardA && cardA(); $('cardB').onclick = () => cardB && cardB();
function hud(dt) {
  $('cash').textContent = '$' + S.cash; $('prog').textContent = S.done.length + '/8 CHALLENGES';
  const hs = Math.hypot(car.vel.x, car.vel.z); $('kmh').textContent = Math.round(car.mode === 'loop' ? car.ls * 3.6 : hs * 3.6);
  $('nos').firstChild.style.width = (car.nitro / nosCap() * 100) + '%';
  if (popT > 0) { popT -= dt; if (popT <= 0) $('pop').style.opacity = 0; }
  if (bigT > 0) { bigT -= dt; if (bigT <= 0) $('big').textContent = ''; }
  if (ch && (G.state === 'chal' || G.state === 'count')) {
    let prog = '';
    if (ch.kind === 'rings') prog = `${rings.filter((r) => r.got).length}/${rings.length} rings`;
    if (ch.kind === 'score') prog = `${runScore}/${ch.need}`;
    $('chTime').textContent = chT.toFixed(1) + (prog ? '  ·  ' + prog : '');
    $('next').style.display = 'none';
  } else {
    const n = nextIdx(); $('next').style.display = '';
    if (n < 0) { $('nextTxt').textContent = 'CITY LEGEND - free roam'; $('arrow').style.display = 'none'; }
    else { const c = CH[n], dx = c.spawn[0] - car.pos.x, dz = c.spawn[1] - car.pos.z, d = Math.hypot(dx, dz);
      const cf = new THREE.Vector3(); camera.getWorldDirection(cf); const rel = Math.atan2(dx, dz) - Math.atan2(cf.x, cf.z);
      $('arrow').style.transform = `rotate(${-rel}rad)`; $('nextTxt').textContent = `NEXT: ${c.name} ${Math.round(d)}m · ENTER to warp`; }
  }
}

// ---------- garage ----------
function garage() {
  if (ch && G.state === 'chal') return; show('garage'); const el = $('garList'); el.innerHTML = '';
  const row = (label, lvl, cost, fn) => { const d = document.createElement('div'); d.className = 'gi'; d.innerHTML = `<span>${label} <b>${lvl}</b></span>`; const b = document.createElement('button'); b.className = 'btn'; b.textContent = cost == null ? 'MAX' : '$' + cost; b.disabled = cost == null || S.cash < cost; b.style.opacity = b.disabled ? 0.4 : 1; b.onclick = () => { if (S.cash >= cost) { S.cash -= cost; fn(); save(); sfx.buy(); garage(); } }; d.appendChild(b); el.appendChild(d); };
  row('ENGINE', 'LV ' + S.eng + '/5', S.eng < 5 ? 300 * (S.eng + 1) : null, () => S.eng++);
  row('NITRO TANK', 'LV ' + S.nos + '/5', S.nos < 5 ? 250 * (S.nos + 1) : null, () => S.nos++);
  const d = document.createElement('div'); d.className = 'gi'; d.innerHTML = '<span>PAINT</span>'; const sw = document.createElement('span');
  PAINTS.forEach(([n, col], i) => { const s = document.createElement('i'); s.className = 'sw' + (S.paint === i ? ' on' : ''); s.style.background = '#' + col.toString(16).padStart(6, '0'); s.title = n + (S.paints.includes(i) ? '' : ' $200'); s.onclick = () => { if (!S.paints.includes(i)) { if (S.cash < 200) return; S.cash -= 200; S.paints.push(i); sfx.buy(); } S.paint = i; CAR.paint.color.set(col); save(); garage(); }; sw.appendChild(s); });
  d.appendChild(sw); el.appendChild(d);
}
$('garBtn').onclick = (e) => { e.target.blur(); garage(); }; $('garClose').onclick = () => hide('garage');

// ---------- input ----------
const KEY = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right', ShiftLeft: 'nitro', ShiftRight: 'nitro', Space: 'hand', KeyQ: 'rollL', KeyE: 'rollR' };
addEventListener('keydown', (e) => {
  initAudio(); const k = KEY[e.code]; if (k) { input[k] = 1; e.preventDefault(); }
  if (e.code === 'KeyR' && car.mode !== 'crash') respawn();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyG') { if ($('garage').classList.contains('hide')) garage(); else hide('garage'); }
  if (e.code === 'Enter') { if (!$('card').classList.contains('hide')) cardA && cardA(); else if (G.state === 'roam') { const n = nextIdx(); if (n >= 0) startChallenge(n); } }
  if (e.code === 'Escape' && ch) toRoam();
  if (!$('title').classList.contains('hide') && (e.code === 'Enter' || e.code === 'Space')) hide('title');
});
addEventListener('keyup', (e) => { const k = KEY[e.code]; if (k) input[k] = 0; });
if ('ontouchstart' in window || Q.has('touch')) document.body.classList.add('touch');
document.querySelectorAll('.tb').forEach((b) => { const k = b.dataset.k; const on = (v) => (e) => { e.preventDefault(); initAudio(); input[k] = v; b.classList.toggle('on', !!v); }; b.addEventListener('pointerdown', on(1)); b.addEventListener('pointerup', on(0)); b.addEventListener('pointercancel', on(0)); b.addEventListener('pointerleave', on(0)); });
addEventListener('pointerdown', () => initAudio());
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
if (Q.has('title')) { show('title'); $('playBtn').onclick = () => { initAudio(); hide('title'); }; }
setTimeout(() => { $('hint').style.opacity = 0; }, 12000);

// ---------- loop ----------
refreshPads(); placeCar(0, 60, Math.PI);
G.fast = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) step(dt); syncCar(dt); updateCam(1); };
G.render = () => { popT = 0; bigT = 0; $('pop').style.opacity = 0; $('big').textContent = ''; $('combo').textContent = ''; syncCar(0); updateCam(1); hud(0); renderer.render(scene, camera); };
G.runScore = () => runScore;
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (G.paused) return;
  step(dt); syncCar(dt); updateCam(dt); hud(dt);
  engine(Math.min(1, Math.hypot(car.vel.x, car.vel.z) / 50), input.up ? 1 : 0, !!car.boost, car.mode === 'air'); music();
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);
