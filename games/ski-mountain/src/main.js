// SKI MOUNTAIN - one endless run: loop, input, rider physics, tricks/grinds/combos, scoring, camera, HUD, progression.
import * as THREE from '../vendor/three.module.js';
import { clamp, lerp, angDiff, fmtTime } from './util.js';
import { buildWorld, groundH, terrainH, normalAt, collidersNear, setCourse } from './world.js';
import { makeEndless } from './endless.js';
import { makeRider, OUTFITS } from './rider.js';
import { makeFx } from './fx.js';
import { Audio } from './audio.js';

const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const V3 = THREE.Vector3;

// ---------------- save ----------------
const SKEY = 'skimountain.v1';
let save = { gear: 'ski', outfit: 0, best: {}, ch: {}, runs: 0 };
try { const s = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (s) save = Object.assign(save, s); } catch (e) {}
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) {} };
delete save.pick; delete save.en; // old saves: the fixed mountain routes are gone
if (qs.has('fresh')) save = { gear: 'ski', outfit: 0, best: {}, ch: {}, runs: 0 };
if (qs.get('gear') === 'ski' || qs.get('gear') === 'board') save.gear = qs.get('gear');

// ---------------- renderer / scene ----------------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd6ebfb, 210, 950);
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 6000);
scene.add(new THREE.HemisphereLight(0xd3e8ff, 0x5a7aa8, 1.55));
const sun = new THREE.DirectionalLight(0xfff0d8, 3.6);
sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 1, far: 400 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
scene.add(sun, sun.target);
const W = buildWorld(scene);
const EN = makeEndless(scene, W.assets);
setCourse(EN);
// the speedometer reads 20 km/h under the real speed on purpose (it feels faster than it says)
const shownKmh = (sp) => Math.max(0, Math.round(sp * 3.6 - 20));
const rider = makeRider(); scene.add(rider.root);
rider.setGear(save.gear); rider.setOutfit(save.outfit);
const fx = makeFx(scene);
const resize = () => { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); };
addEventListener('resize', resize); resize();

// ---------------- data ----------------
const GRABS = { board: ['Indy', 'Melon', 'Nose Grab', 'Tail Grab'], ski: ['Mute', 'Safety', 'Japan', 'Tail Grab'] };
const CH = [
  ['first', 'Land your first trick'], ['s360', 'Land a 360'], ['flip', 'Land a flip'], ['grind2', 'Grind for 2 seconds'],
  ['km1', 'Ride 1 km'], ['km3', 'Ride 3 km'], ['km5', 'Ride 5 km'], ['km10', 'Ride 10 km'],
  ['air2', 'Hang 2 s in the air'], ['s720', 'Land a 720'], ['combo5', 'Bank a x5 combo'], ['cork', 'Land a cork (spin + flip)'],
  ['hop', 'Jump a fallen log or a fence'], ['speed', 'Hit 200 km/h'], ['score50', 'Score 50,000 in one run'], ['score150', 'Score 150,000 in one run'],
];
const chDone = () => CH.filter((c) => save.ch[c[0]]).length;

// ---------------- state ----------------
const G = { fovKick: 0, state: 'play', bot: null, result: null, shake: 0, fov: 70, camYaw: 0, hintT: 0, t: 0 };
const P = {
  p: new V3(), v: new V3(), n: new V3(0, 1, 0), yaw: 0, state: 'ground', spin: 0, flip: 0, spinV: 0, flipV: 0,
  grab: 0, grabT: 0, grabKind: 0, airT: 0, crouch: 0, charge: 0, sw: false, swAtTake: false, takeVy: 0, grind: null,
  combo: null, groundT: 0, crashT: 0, deadT: 0, inv: 0, lean: 0, skid: 0, squash: 0,
  score: 0, tricks: 0, time: 0, maxSpeed: 0, crashes: 0, rush: 0, cap: 36, dist: 0, distPts: 0, lives: 3, km: 0, z0: 0,
  tumble: new THREE.Quaternion(), tumbleAx: new V3(1, 0, 0),
};
// ---------------- input ----------------
const K = {};
const I = { turn: 0, tuck: false, brake: false, jump: false, grab: false, mdx: 0, mdy: 0, mSteer: 0, touchSteer: 0, touchTuck: 0, touchJump: false, touchGrab: false, lmb: false, rmb: false };
let prevJump = false, prevGrab = false, rawDX = 0, rawDY = 0, inputSeen = false;
const wake = () => { Audio.init(); if (!inputSeen) { inputSeen = true; } };
addEventListener('keydown', (e) => {
  wake(); K[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyM') { Audio.setMuted(!Audio.muted); toast(Audio.muted ? 'SOUND OFF' : 'SOUND ON'); }
  if (e.code === 'Escape') { if (G.state === 'play' || G.state === 'result') { openMenu(); $('card').classList.add('hidden'); } else if (G.state === 'menu') closeMenu(); }
  if (e.code === 'KeyR' && (G.state === 'play' || G.state === 'result')) start();
  if ((G.state === 'result' || G.state === 'menu') && e.code === 'Enter') start();
});
addEventListener('keyup', (e) => { K[e.code] = false; });
addEventListener('blur', () => { for (const k in K) K[k] = false; I.lmb = I.rmb = false; });
canvas.addEventListener('mousedown', (e) => {
  wake();
  if (e.button === 0) I.lmb = true; if (e.button === 2) I.rmb = true;
  if (!document.pointerLockElement && !isTouch && G.state === 'play') { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (err) {} }
});
addEventListener('mouseup', (e) => { if (e.button === 0) I.lmb = false; if (e.button === 2) I.rmb = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => { rawDX += e.movementX || 0; rawDY += e.movementY || 0; });
document.addEventListener('pointerlockchange', () => { $('lockhint').classList.toggle('hidden', !!document.pointerLockElement || isTouch); });
// touch: left half = stick (steer / tuck / brake), right half = hold to crouch + release to jump, drag to spin/flip
const isTouch = matchMedia('(pointer: coarse)').matches || qs.has('touch');
const touches = new Map();
if (isTouch) document.body.classList.add('touch');
canvas.addEventListener('touchstart', (e) => {
  wake(); e.preventDefault();
  for (const t of e.changedTouches) { const left = t.clientX < innerWidth * 0.45; touches.set(t.identifier, { left, x0: t.clientX, y0: t.clientY, x: t.clientX, y: t.clientY }); if (!left) I.touchJump = true; }
}, { passive: false });
canvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  for (const t of e.changedTouches) { const s = touches.get(t.identifier); if (!s) continue; if (!s.left) { rawDX += (t.clientX - s.x) * 1.6; rawDY += (t.clientY - s.y) * 1.6; } s.x = t.clientX; s.y = t.clientY; }
}, { passive: false });
const tend = (e) => { for (const t of e.changedTouches) { const s = touches.get(t.identifier); if (s && !s.left) I.touchJump = [...touches.values()].some((o) => o !== s && !o.left); touches.delete(t.identifier); } };
canvas.addEventListener('touchend', tend); canvas.addEventListener('touchcancel', tend);
$('tgrab').addEventListener('touchstart', (e) => { e.preventDefault(); wake(); I.touchGrab = true; }, { passive: false });
$('tgrab').addEventListener('touchend', (e) => { e.preventDefault(); I.touchGrab = false; }, { passive: false });

function readInput(dt) {
  let ts = 0, tt = 0;
  for (const s of touches.values()) if (s.left) { ts = clamp(-(s.x - s.x0) / 60, -1, 1); tt = clamp((s.y0 - s.y) / 60, -1, 1); }
  I.mdx = rawDX; I.mdy = rawDY; rawDX = rawDY = 0;
  // mouse also steers on the ground (a virtual stick that recentres)
  I.mSteer = P.state === 'ground' ? clamp(I.mSteer * Math.exp(-5 * dt) - I.mdx * 0.006, -1, 1) : 0;
  const kl = K.KeyA || K.ArrowLeft, kr = K.KeyD || K.ArrowRight;
  I.keyTurn = (kl ? 1 : 0) - (kr ? 1 : 0);
  I.turn = clamp(I.keyTurn + (P.state === 'ground' ? I.mSteer : 0) + ts, -1, 1);
  I.tuck = !!(K.KeyW || K.ArrowUp) || tt > 0.4; I.brake = !!(K.KeyS || K.ArrowDown) || tt < -0.4;
  I.flipKey = ((K.KeyS || K.ArrowDown) ? 1 : 0) - ((K.KeyW || K.ArrowUp) ? 1 : 0);
  I.jump = !!K.Space || I.lmb || I.touchJump;
  I.grab = !!(K.ShiftLeft || K.ShiftRight || K.KeyE) || I.rmb || I.touchGrab;
  if (G.bot !== null) botInput(dt);
}

// ---------------- bot (tests) ----------------
// rides the guaranteed clear line (the gaps in every gate), so it doubles as the check that a line always exists
function botInput() {
  const p = P.p, sp0 = P.v.length(), la = 6 + sp0 * 0.26, tz = p.z + la;
  I.mdx = I.mdy = 0; I.grab = false; I.jump = false; I.flipKey = 0;
  const tx = EN.lineX(tz) + (G.botOff || 0), want = Math.atan2(tx - p.x, tz - p.z);
  if (P.state === 'grind') { const g = P.grind; I.turn = clamp(g.bal * 3 + g.balV * 0.8, -1, 1); }
  else I.turn = clamp(angDiff(want, P.yaw) * 3.5, -1, 1);
  // normal riding: no tuck, no brake (G.botTuck = always tuck)
  I.tuck = !!G.botTuck; I.brake = false;
  if (P.state === 'air' && P.takeVy > 4 && P.airT < 2.5) { const tgt = Math.PI * 2; P.spinV = clamp((tgt - P.spin) * 12, 0, 11); }
}

// ---------------- HUD helpers ----------------
const pops = $('pops');
function popup(text, sub = '', cls = '') {
  const d = document.createElement('div'); d.className = 'pop ' + cls; d.innerHTML = text + (sub ? '<small>' + sub + '</small>' : '');
  for (const o of [...pops.children]) if (o.dataset.t === text) o.remove();
  d.dataset.t = text; pops.prepend(d); while (pops.children.length > 3) pops.lastChild.remove();
  setTimeout(() => d.remove(), 1600);
}
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.add('show'); toastT = 2.6; }
const fmt = (n) => Math.round(n).toLocaleString('en-US');
function award(id) {
  if (save.ch[id]) return; const before = chDone(); save.ch[id] = true; persist();
  const c = CH.find((x) => x[0] === id); toast('★ CHALLENGE: ' + c[1]); Audio.ding();
  const o = OUTFITS.find((o) => o.unlock > before && o.unlock <= chDone()); if (o) setTimeout(() => toast('NEW OUTFIT UNLOCKED: ' + o.name), 2700);
}

// ---------------- run control ----------------
const fwd = new V3(), tmp = new V3(), tmp2 = new V3(), nrm = new V3(), UP = new V3(0, 1, 0);
function start() {
  Object.assign(P, { yaw: 0, state: 'ground', spin: 0, flip: 0, spinV: 0, flipV: 0, grab: 0, grabT: 0, airT: 0, crouch: 0, charge: 0, sw: false, grind: null, combo: null, groundT: 0, crashT: 0, deadT: 0, inv: 0.5,
    score: 0, tricks: 0, time: 0, maxSpeed: 0, crashes: 0, rush: 0, lives: 3, dist: 0, distPts: 0, km: 0, z0: 20 });
  EN.reset((Math.random() * 1e9) | 0); P.p.set(0, groundH(0, 20), 20); P.v.set(0, 0, 12);
  camPos.set(P.p.x - Math.sin(P.yaw) * 8, P.p.y + 4, P.p.z - Math.cos(P.yaw) * 8);
  rider.root.visible = true;
  fx.tracks.forEach((t) => t.clear());
  G.state = 'play'; G.result = null; G.camYaw = P.yaw;
  $('card').classList.add('hidden'); $('menu').classList.add('hidden'); $('hud').classList.remove('hidden'); $('fade').classList.remove('on');
  popup('GO!', 'it only gets faster', 'big'); updPill(); updGearChip();
  save.runs++; persist();
}
function openMenu() { G.menuFromRun = G.state === 'play' && P.time > 1 && P.state !== 'dead'; G.state = 'menu'; G.orbitT = 0; $('card').classList.add('hidden'); $('hint').classList.add('hidden'); G.hintT = 0; renderMenu(); $('menu').classList.remove('hidden'); $('hud').classList.add('hidden'); if (document.pointerLockElement) document.exitPointerLock(); }
function closeMenu() { $('menu').classList.add('hidden'); G.state = G.result ? 'result' : 'play'; if (G.state === 'play') $('hud').classList.remove('hidden'); if (G.state === 'result') $('card').classList.remove('hidden'); }

function crash(why) {
  if (P.state === 'crash' || P.state === 'dead') return;
  if (P.combo) popup('COMBO LOST', why, 'bad'); else popup('WIPEOUT', why, 'bad');
  P.lives--; updPill();
  P.crashWhy = why; P.combo = null; P.state = 'crash'; P.crashT = 0; P.crashes++; P.grind = null; P.grab = 0;
  P.tumbleAx.set(Math.random() - 0.5, Math.random() * 0.3, Math.random() - 0.5).normalize(); P.tumble.identity();
  P.v.multiplyScalar(0.55); Audio.crash(); G.shake = 0.7;
  fx.emit(P.p, { x: P.v.x * 0.3, y: 3, z: P.v.z * 0.3 }, 5, 70, 0.6, 1.2); fx.tracks.forEach((t) => t.brk());
}
// back on the line (always clear) a few metres behind the wipeout, already moving
function respawn() {
  const z = Math.max(20, P.p.z - 6), x = EN.lineX(z); P.yaw = EN.yaw(z);
  P.p.set(x, groundH(x, z), z); const v0 = P.cap * 0.45; P.v.set(Math.sin(P.yaw) * v0, 0, Math.cos(P.yaw) * v0);
  P.state = 'ground'; P.spin = P.flip = P.spinV = P.flipV = 0; P.inv = 1.4; P.sw = false; fx.tracks.forEach((t) => t.brk());
}
function addTrick(name, pts, perfect) {
  if (!P.combo) P.combo = { n: 0, pts: 0 };
  P.combo.n++; P.combo.pts += pts; P.groundT = 0; P.tricks++;
  popup(name, '+' + fmt(pts) + (perfect ? '  PERFECT!' : ''), perfect ? 'gold' : '');
  Audio.trick(P.combo.n); if (perfect) Audio.perfect();
  award('first');
}
// a combo banks after 2 s on the snow: points x (1 + 0.3 per extra trick) x the distance multiplier
function bank() {
  if (!P.combo) return;
  const mult = EN.mult(P.p.z), cm = 1 + 0.3 * (P.combo.n - 1), add = Math.round(P.combo.pts * cm * mult);
  P.score += add; popup('BANKED +' + fmt(add), 'x' + P.combo.n + ' tricks' + (mult > 1 ? '  ·  km x' + mult : ''), 'bank');
  Audio.bank(P.combo.n >= 4); if (P.combo.n >= 5) award('combo5');
  P.combo = null;
}

// ---------------- physics ----------------
// RUSH (EN.rush, grows with distance): more gravity along the slope, less drag. The cap (EN.cap) climbs with
// distance too and never plateaus. Air drag: normal riding 0.0051, tuck 0.0026, both divided by (1 + 2.2 rush).
const DRAG_RIDE = 0.0051, DRAG_TUCK = 0.0026;
function startAir() {
  P.state = 'air'; P.airT = 0; P.spin = P.flip = 0; P.spinV = P.flipV = 0; P.grabT = 0; P.swAtTake = P.sw; P.takeVy = P.v.y - (P.n ? 0 : 0);
  fx.tracks.forEach((t) => t.brk());
}
function collide() {
  if (P.inv > 0) return;
  const p = P.p, list = collidersNear(p.x, p.z, _cl);
  for (const o of list) {
    const dx = p.x - o.x, dz = p.z - o.z, r = o.r + 0.35, d2 = dx * dx + dz * dz;
    if (d2 > r * r) continue;
    if (p.y > o.y1) { if (P.state === 'air' && (o.kind === 'log' || o.kind === 'fence')) award('hop'); continue; }
    if (p.y < o.y0 - 1) continue;
    const d = Math.sqrt(d2) || 0.01, sp = P.v.length();
    p.x = o.x + (dx / d) * r; p.z = o.z + (dz / d) * r;
    if (sp > 11 && P.state !== 'crash') { crash(HIT[o.kind] || 'WIPEOUT'); return; }
    const vn = (P.v.x * dx + P.v.z * dz) / d; if (vn < 0) { P.v.x -= 1.6 * vn * dx / d; P.v.z -= 1.6 * vn * dz / d; } P.v.multiplyScalar(0.6);
  }
}
const _cl = [], HIT = { tree: 'HIT A TREE', rock: 'HIT A ROCK', log: 'HIT A LOG', fence: 'HIT A FENCE', cat: 'HIT A SNOWCAT', hut: 'HIT A HUT' };
function tryGrind() {
  const p = P.p, v = P.v, sh = Math.hypot(v.x, v.z); if (sh < 3) return false;
  for (const r of EN.rails) {
    if (Math.abs(p.z - (r.az + r.bz) / 2) > r.len / 2 + 3) continue;
    const t = ((p.x - r.ax) * r.ux + (p.z - r.az) * r.uz) / r.len; if (t < 0.02 || t > 0.95) continue;
    const cx = r.ax + r.ux * r.len * t, cz = r.az + r.uz * r.len * t; if (Math.hypot(p.x - cx, p.z - cz) > 0.8) continue;
    const cy = r.ay + (r.by - r.ay) * t, dy = p.y - cy;
    if (P.state === 'air' ? (v.y > 1.5 || dy < -0.45 || dy > 1.1) : (dy < -0.95 || dy > 0.3)) continue;
    const al = (v.x * r.ux + v.z * r.uz) / sh; if (Math.abs(al) < 0.8) continue;
    const dir = Math.sign(al), slope = (r.by - r.ay) / r.len;
    P.grind = { r, t, dir, speed: Math.max(7, Math.abs(v.x * r.ux + v.z * r.uz + v.y * slope)), bal: (Math.random() - 0.5) * 0.2, balV: (Math.random() - 0.5) * 0.8, time: 0, slope };
    if (P.state === 'air') P.landGrindAir = true;
    P.state = 'grind'; P.grab = 0; Audio.railOn(); fx.tracks.forEach((tr) => tr.brk());
    return true;
  }
  return false;
}
function endGrind(pop, bailed) {
  const g = P.grind, r = g.r; P.grind = null;
  const s = g.speed * g.dir, slope = g.slope;
  P.v.set(r.ux * s, slope * s + (pop ? 4.5 : 1.2), r.uz * s);
  if (bailed) { P.v.x += -r.uz * Math.sign(g.bal) * 2.5; P.v.z += r.ux * Math.sign(g.bal) * 2.5; }
  P.p.y += 0.05; startAir(); P.takeVy = 0;
  const kind = r.type === 'rail' ? 'Rail Slide' : r.type === 'log' ? 'Log Slide' : 'Fence Grind';
  if (g.time > 0.25) {
    let pts = 120 + g.time * 320; if (bailed) pts *= 0.5;
    addTrick((P.sw ? 'Switch ' : '') + kind + ' ' + g.time.toFixed(1) + 's', Math.round(pts), false);
    if (g.time >= 2 && !bailed) award('grind2');
  }
  if (bailed) popup('BAILED', '', 'bad');
}
function land() {
  const p = P.p, v = P.v; p.y = groundH(p.x, p.z); normalAt(p.x, p.z, P.n);
  const n = P.n, vn = v.dot(n);
  // landing on a kicker face from a big air: judge the hit against the slope under it, not the ramp face
  let impact = -vn; if (p.y - terrainH(p.x, p.z) > 0.05) { const hx = terrainH(p.x + 0.6, p.z) - terrainH(p.x - 0.6, p.z), hz = terrainH(p.x, p.z + 0.6) - terrainH(p.x, p.z - 0.6); tmp2.set(-hx, 1.2, -hz).normalize(); impact = -v.dot(tmp2); }
  const sN = Math.round(P.spin / Math.PI), sErr = Math.abs(P.spin - sN * Math.PI);
  const fN = Math.round(P.flip / (2 * Math.PI)), fErr = Math.abs(P.flip - fN * 2 * Math.PI);
  P.state = 'ground';
  const hardMax = 28 + clamp(v.length() - 40, 0, 35) * 0.3; // fast riders fly longer arcs; only true drops should break you
  // (a hard hit that is mostly forward, like clipping a kicker face at speed, is absorbed: only real falls break you)
  if ((sErr > 0.62 || fErr > 0.85 || (impact > hardMax && -v.y > 20))) { crash(fErr > 0.85 ? 'OVER-ROTATED' : sErr > 0.62 ? 'LANDED SIDEWAYS' : 'TOO BIG A DROP'); return; }
  v.addScaledVector(n, -vn);
  const sloppy = (sErr / 0.62 + fErr / 0.85) * 0.5; v.multiplyScalar(1 - 0.22 * sloppy - (P.grab > 0.5 ? 0.12 : 0));
  if (Math.abs(sN) % 2 === 1) P.sw = !P.sw;
  P.yaw = Math.atan2(v.x, v.z); P.spin = P.flip = 0;
  P.squash = clamp(impact / 30, 0.05, 0.35); Audio.land(clamp(impact / 15, 0, 1)); G.shake = Math.max(G.shake, clamp(impact / 40, 0, 0.5));
  fx.emit(p, { x: v.x * 0.25, y: 1.5, z: v.z * 0.25 }, 3 + impact * 0.2, 14 + Math.round(impact * 2), 0.45, 0.9);
  // trick scoring
  const deg = Math.abs(sN) * 180, flips = Math.abs(fN), gt = P.grabT;
  if (P.airT < 0.55 && !deg && !flips && gt < 0.25) return;
  const name = [];
  const mult = ['', 'Double ', 'Triple ', 'Quad '];
  if (flips && deg >= 360) name.push(mult[Math.min(3, flips - 1)] + (fN > 0 ? 'Cork ' : 'Rodeo ') + deg);
  else { if (flips) name.push(mult[Math.min(3, flips - 1)] + (fN > 0 ? 'Backflip' : 'Frontflip')); if (deg) name.push(String(deg)); }
  if (gt > 0.25) name.push(GRABS[rider.gear === 'board' ? 'board' : 'ski'][P.grabKind]);
  if (!name.length) name.push(P.airT > 1.4 ? 'Big Air' : 'Air');
  if (P.swAtTake) name.unshift('Switch');
  let pts = 45 * P.airT + 130 * Math.abs(sN) + 650 * flips + (gt > 0.25 ? 200 + 380 * Math.min(gt, 2.5) : 0);
  if (flips && deg >= 360) pts *= 1.3;
  const perfect = (deg > 0 || flips > 0) && sErr < 0.22 && fErr < 0.3;
  if (perfect) pts *= 1.5;
  let nm = name.join(' ');
  if (P.grab > 0.5) { pts *= 0.5; nm += ' (late)'; }
  addTrick(nm, Math.round(pts), perfect);
  if (deg >= 360) award('s360'); if (deg >= 720) award('s720'); if (flips) award('flip'); if (flips && deg >= 360) award('cork');
  if (P.airT > 2) award('air2');
}
function groundStep(h) {
  const p = P.p, v = P.v, sp0 = v.length(), bx = sp0 > 0.5 ? v.x / sp0 * 0.3 : 0, bz = sp0 > 0.5 ? v.z / sp0 * 0.3 : 0, n = normalAt(p.x - bx, p.z - bz, P.n, 0.3);
  const turn = I.turn, brake = I.brake, tuck = I.tuck || P.crouch > 0.5;
  const ski = rider.gear !== 'board', rush = P.rush, gm = 1 + rush * 0.85;
  // turning stays usable at speed: the rate floor rises a little with rush so fast lines stay steerable
  P.yaw += turn * lerp(2.5, 1.4 + rush * 0.25, clamp(sp0 / 34, 0, 1)) * (ski ? 1.18 : 1) * h;
  v.x += gm * 9.8 * n.x * n.y * h; v.y += gm * (-9.8 + 9.8 * n.y * n.y) * h; v.z += gm * 9.8 * n.z * n.y * h;
  v.addScaledVector(n, -v.dot(n));
  const sh = Math.hypot(v.x, v.z);
  P.skid = 0;
  if (sh > 0.3) {
    const va = Math.atan2(v.x, v.z), d = angDiff(P.yaw, va);
    const rot = d * (1 - Math.exp(-(brake ? 3 : ski ? 8.5 : 6) * h)), c = Math.cos(rot), s = Math.sin(rot);
    const nx = v.x * c + v.z * s, nz = v.z * c - v.x * s; v.x = nx; v.z = nz; v.y = -(n.x * v.x + n.z * v.z) / n.y;
    P.skid = Math.abs(Math.sin(d)) + (brake ? 0.6 : 0);
    if (!turn) P.yaw += angDiff(va, P.yaw) * (1 - Math.exp(-1.2 * h));
  }
  let sp = v.length();
  const powder = EN.offTrack(p.x, p.z) ? 0.25 : 0;
  const k = (tuck ? DRAG_TUCK : DRAG_RIDE) / (1 + rush * 2.2);
  sp = Math.max(0, sp - (0.035 * 9.8 * n.y + powder + k * sp * sp + (brake ? (ski ? 7.5 : 6.5) * (1 + rush * 0.7) : 0) + sp * Math.min(0.9, Math.abs(Math.sin(angDiff(P.yaw, Math.atan2(v.x, v.z))))) * 1.6 / (1 + 0.5 * rush)) * h); // carving bleeds less speed the faster the course gets
  { const cap = P.cap * (tuck ? 1.06 : 1); if (sp > cap) sp = Math.max(cap, sp - 14 * h); } // tucking buys a little over the cap
  if (sp > 0.01) v.setLength(sp); else v.set(0, 0, 0);
  if (sp < 3.5 && P.state === 'ground') { v.x += Math.sin(P.yaw) * 2.4 * h; v.z += Math.cos(P.yaw) * 2.4 * h; }
  p.addScaledVector(v, h);
  const gh = groundH(p.x, p.z);
  // at speed the legs soak up rolls and headwall lips (the rider stays on the snow) instead of being thrown
  // 100 m off every crest; kickers, cliffs and real drops still launch you, and so does your own jump.
  const sep = p.y - gh, stick = sep < Math.max(0.12, Math.hypot(v.x, v.z) * h * 0.45) && gh - terrainH(p.x, p.z) < 0.02;
  if (sep > 0.12 && !stick) { const ty = (terrainH(p.x + v.x * 0.05, p.z + v.z * 0.05) - terrainH(p.x, p.z)) / 0.05; let rel = v.y - ty; const bxk = p.x - v.x * h * 2, bzk = p.z - v.z * h * 2; if (rel > 7.5 && groundH(bxk, bzk) - terrainH(bxk, bzk) > 0.05) { const r2 = 7.5 + Math.min(2, (rel - 7.5) * 0.3); v.y += r2 - rel; rel = r2; } /* fast kicker hits pop a sane height: you fly far, not into orbit */ startAir(); P.takeVy = rel; return; }
  p.y = gh; normalAt(p.x - bx, p.z - bz, nrm, 0.3); const m = v.length(); v.addScaledVector(nrm, -v.dot(nrm)); if (v.lengthSq() > 1e-6) v.setLength(m);
  tryGrind();
}
function airStep(h) {
  const p = P.p, v = P.v;
  v.y -= 9.8 * h; v.multiplyScalar(1 - 0.0006 * v.length() * h);
  // air steer: A/D (or the touch stick) bends the flight line a little, so long fast airs over a curving route
  // can still be lined up for the landing (the mouse stays pure spin/flip)
  if (I.turn) { const a = I.turn * 0.5 * h, c = Math.cos(a), s = Math.sin(a), nx = v.x * c + v.z * s, nz = v.z * c - v.x * s; v.x = nx; v.z = nz; P.yaw = Math.atan2(v.x, v.z); }
  p.addScaledVector(v, h);
  if (v.y < 1.5 && tryGrind()) return;
  if (p.y <= groundH(p.x, p.z)) land();
}
function grindStep(h) {
  const g = P.grind, r = g.r;
  g.time += h;
  g.speed += (-9.8 * g.slope * g.dir / Math.sqrt(1 + g.slope * g.slope) - 0.8) * h; g.speed = Math.max(3, g.speed);
  g.t += g.dir * g.speed * h / r.len;
  P.p.set(r.ax + (r.bx - r.ax) * g.t, r.ay + (r.by - r.ay) * g.t, r.az + (r.bz - r.az) * g.t);
  P.v.set(r.ux * g.speed * g.dir, g.slope * g.speed * g.dir, r.uz * g.speed * g.dir);
  const bi = clamp(I.turn - I.mdx * 0.04, -1, 1);
  g.balV += (g.bal * 2.4 + (Math.random() - 0.5) * 4) * h - bi * 5 * h; g.bal += g.balV * h; g.balV *= Math.exp(-0.6 * h);
  if (Math.abs(g.bal) > 1) { endGrind(false, true); return; }
  if (g.t < 0 || g.t > 1) endGrind(false, false);
}
function crashStep(h) {
  const p = P.p, v = P.v;
  P.crashT += h; v.y -= 9.8 * h; p.addScaledVector(v, h);
  const gh = groundH(p.x, p.z); if (p.y < gh) { p.y = gh; if (v.y < 0) v.y *= -0.25; v.multiplyScalar(Math.exp(-3 * h)); }
  P.tumble.premultiply(new THREE.Quaternion().setFromAxisAngle(P.tumbleAx, h * 9 * Math.max(0.15, 1 - P.crashT / 1.2)));
  if (P.crashT > 1.5) { if (P.lives <= 0) { P.state = 'dead'; P.deadT = 1.6; } else respawn(); }
}
function deadStep(h) {
  P.deadT += h;
  if (P.deadT > 2.2 && G.state === 'play') showResult();
}

// ---------------- per-frame game logic ----------------
function frameLogic(dt) {
  const p = P.p, sp = P.v.length();
  P.time += P.state === 'dead' ? 0 : dt;
  P.inv = Math.max(0, P.inv - dt);
  P.rush = lerp(P.rush, EN.rush(p.z), 1 - Math.exp(-1.5 * dt)); P.cap = EN.cap(p.z);
  // jumping
  if (P.state === 'ground' || P.state === 'grind') {
    if (I.jump) { P.charge = Math.min(1, P.charge + dt / 0.45); }
    else if (prevJump && P.charge > 0) {
      if (P.state === 'grind') endGrind(true, false);
      else { normalAt(p.x, p.z, nrm); const pop = (4.4 + 3.4 * P.charge) * (rider.gear === 'board' ? 1.08 : 1); P.v.addScaledVector(nrm, pop); P.p.y += 0.05; startAir(); P.takeVy = pop; }
      Audio.jump(); P.charge = 0;
    } else P.charge = 0;
  } else P.charge = 0;
  P.crouch = lerp(P.crouch, P.charge > 0 ? 0.55 + 0.45 * P.charge : (P.state === 'ground' && I.tuck ? 0.5 : 0.12), 1 - Math.exp(-12 * dt));
  // air rotation (mouse = spin/flip; keys too)
  if (P.state === 'air') {
    const k = 0.0105 * (rider.gear === 'board' ? 1.12 : 1);
    { const ax = Math.abs(I.mdx), ay = Math.abs(I.mdy);
      if (ay < ax * 0.6) I.mdy *= (ay / (ax * 0.6 + 1e-6)) ** 2 * 0.5; else if (ax < ay * 0.6) I.mdx *= (ax / (ay * 0.6 + 1e-6)) ** 2 * 0.5; }
    if (I.mdx || I.mdy) P.mIdle = 0; else P.mIdle = (P.mIdle || 0) + dt;
    const held = P.mIdle < 0.08 && G.bot === null;
    if (I.mdx && G.bot === null) P.spinV = lerp(P.spinV, clamp(-I.mdx * k / dt, -15, 15), 0.5);
    else if (I.keyTurn && G.bot === null) P.spinV = lerp(P.spinV, I.keyTurn * 7.5, 1 - Math.exp(-10 * dt));
    else if (held) P.spinV *= Math.exp(-14 * dt); // between mouse events: no auto-level tug yet
    else if (G.bot === null) { P.spinV *= Math.exp(-14 * dt); const tg = Math.round(P.spin / Math.PI) * Math.PI; if (Math.abs(tg - P.spin) < 0.75) P.spin += (tg - P.spin) * (1 - Math.exp(-5 * dt)); }
    if (I.mdy && G.bot === null) P.flipV = lerp(P.flipV, clamp(I.mdy * k / dt, -12, 12), 0.5);
    else if (I.flipKey && G.bot === null) P.flipV = lerp(P.flipV, I.flipKey * 6.5, 1 - Math.exp(-10 * dt));
    else if (held) P.flipV *= Math.exp(-14 * dt);
    else { P.flipV *= Math.exp(-14 * dt); const tg = Math.round(P.flip / (2 * Math.PI)) * 2 * Math.PI; if (Math.abs(tg - P.flip) < 0.9) P.flip += (tg - P.flip) * (1 - Math.exp(-5 * dt)); }
    P.spin += P.spinV * dt; P.flip += P.flipV * dt; P.airT += dt;
    if (I.grab && !prevGrab) P.grabKind = (P.grabKind + 1) % 4;
    if (I.grab) { P.grabT += dt; }
    P.grab = lerp(P.grab, I.grab ? 1 : 0, 1 - Math.exp(-16 * dt));
  } else P.grab = lerp(P.grab, 0, 1 - Math.exp(-16 * dt));
  // combo banking
  if (P.state === 'ground' && P.combo) { P.groundT += dt; if (P.groundT > 2.0) bank(); }
  runLogic(dt, sp);
  // sound
  Audio.set('wind', clamp(sp / 55, 0, 1) ** 1.6 * 0.7 + (P.state === 'air' ? 0.06 : 0), 260 + sp * 30);
  Audio.set('whistle', clamp((sp - 30) / 24, 0, 1) * 0.11, 900 + sp * 18);
  Audio.set('carve', P.state === 'ground' ? (0.04 + Math.min(1, P.skid) * 0.3) * clamp(sp / 14, 0, 1) : 0, 1800 + sp * 40);
  Audio.set('grind', P.state === 'grind' ? 0.22 : 0);
  Audio.set('ring', P.state === 'grind' && P.grind && P.grind.r.type === 'rail' ? 0.05 : 0);
  // particles + tracks
  if (P.state === 'ground') {
    const n = P.n, sx = Math.cos(P.yaw), sz = -Math.sin(P.yaw);
    if (rider.gear === 'board') fx.tracks[0].add(p.x, p.y + 0.02, p.z, sx, sz);
    else { fx.tracks[1].add(p.x + sx * 0.14, p.y + 0.02, p.z + sz * 0.14, sx, sz); fx.tracks[2].add(p.x - sx * 0.14, p.y + 0.02, p.z - sz * 0.14, sx, sz); }
    const amt = Math.min(1, P.skid) * sp;
    if (amt > 2 && Math.random() < 0.9) fx.emit(p, { x: P.v.x * 0.35 + n.x * 2, y: 1.2 + amt * 0.08, z: P.v.z * 0.35 + n.z * 2 }, 2.5, Math.min(6, Math.round(amt * 0.25)), 0.3, 0.7);
    else if (sp > 22 && Math.random() < 0.3) fx.emit(p, { x: P.v.x * 0.2, y: 0.8, z: P.v.z * 0.2 }, 1.2, 1, 0.22, 0.5);
    // rooster tail of powder at speed
    if (sp > 28) fx.emit(p, { x: P.v.x * 0.15, y: 1.5 + sp * 0.04, z: P.v.z * 0.15 }, 1.8, Math.min(4, Math.round((sp - 24) / 8)), 0.3, 0.55);
  }
  // loose snow hanging in the air ahead: it whips past the camera, so speed reads even on smooth snow
  if (sp > 22 && (P.state === 'ground' || P.state === 'air')) {
    const n = Math.min(5, Math.round((sp - 18) / 8)), fy = P.v.x / sp, fz = P.v.z / sp;
    for (let i = 0; i < n; i++) { const d = 25 + Math.random() * 45, u = (Math.random() - 0.5) * 26; tmp2.set(p.x + fy * d + fz * u, p.y + 0.5 + Math.random() * 6 - d * 0.15, p.z + fz * d - fy * u); fx.emit(tmp2, { x: 0, y: -0.3, z: 0 }, 0.3, 1, 0.07, 1.6, 0); }
  }
  if (P.state === 'grind' && Math.random() < 0.6) fx.emit(p, { x: P.v.x * 0.2, y: 1.5, z: P.v.z * 0.2 }, 2, 2, 0.15, 0.4);
}

function runLogic(dt, sp) {
  const p = P.p, d = Math.max(P.dist, p.z - P.z0);
  if (P.state !== 'dead') { P.distPts += (d - P.dist) * EN.rate(p.z); P.dist = d; } // distance points: the rate climbs with distance
  P.maxSpeed = Math.max(P.maxSpeed, sp);
  if (shownKmh(sp) >= 200) award('speed');
  const km = Math.floor(P.dist / 1000);
  if (km > P.km) {
    P.km = km; popup(km + ' KM', 'faster · tighter · more trees  ·  ' + EN.rate(p.z).toFixed(1) + ' pts/m', 'gold big'); Audio.bank(true);
    if (km >= 1) award('km1'); if (km >= 3) award('km3'); if (km >= 5) award('km5'); if (km >= 10) award('km10');
  }
  if ((G.t * 4 | 0) !== G.pillT) { G.pillT = G.t * 4 | 0; updPill(); }
}
function updPill() { $('route').innerHTML = (P.dist / 1000).toFixed(2) + ' km · tricks x' + EN.mult(P.p.z) + ' <span class="lives">' + '♥'.repeat(clamp(P.lives, 0, 3)) + '<s>' + '♥'.repeat(Math.max(0, 3 - P.lives)) + '</s></span>'; }

// ---------------- results ----------------
function showResult() {
  G.state = 'result';
  if (document.pointerLockElement) document.exitPointerLock();
  const dist = Math.floor(P.dist), dp = Math.floor(P.distPts), total = P.score + dp, b = save.best.endless || {}, newBest = !b.score || total > b.score, top = shownKmh(P.maxSpeed);
  save.best.endless = { score: Math.max(total, b.score || 0), dist: Math.max(dist, b.dist || 0), time: newBest ? P.time : b.time, kmh: Math.max(top, b.kmh || 0) };
  persist(); if (total >= 50000) award('score50'); if (total >= 150000) award('score150');
  G.result = { endless: true, dist, distPts: dp, score: P.score, total, time: P.time, tricks: P.tricks, crashes: P.crashes, maxKmh: top };
  Audio.fail();
  const card = $('card'), B = save.best.endless;
  card.innerHTML = `<div class="kick" style="background:#ff5a1f">RUN OVER</div><h1>${(dist / 1000).toFixed(2)} KM</h1>
    <div class="rows"><div><span>Distance (${fmt(dist)} m)</span><b>${fmt(dp)}</b></div><div><span>Tricks (${P.tricks})</span><b>+${fmt(P.score)}</b></div><div><span>Time</span><b>${fmtTime(P.time)}</b></div>
    <div class="total"><span>SCORE ${newBest ? '<em>NEW BEST</em>' : ''}</span><b>${fmt(total)}</b></div></div>
    <p class="tip">best ${fmt(B.score)} · furthest ${(B.dist / 1000).toFixed(2)} km · top speed ${top} km/h<br>3 wipeouts end the run. Every kilometre is faster, tighter and worth more per metre.</p>
    <div class="btns"><button id="bAgain" class="primary">GO AGAIN <small>Enter</small></button><button id="bGear">SWITCH TO ${rider.gear === 'board' ? 'SKIS' : 'SNOWBOARD'}</button><button id="bMenu">MENU</button></div>`;
  card.classList.remove('hidden'); $('hud').classList.add('hidden');
  $('bAgain').onclick = () => { wake(); start(); };
  $('bMenu').onclick = () => { wake(); openMenu(); $('card').classList.add('hidden'); };
  $('bGear').onclick = () => { wake(); setGear(rider.gear === 'board' ? 'ski' : 'board'); start(); };
}
function setGear(g) { save.gear = g; rider.setGear(g); persist(); updGearChip(); }
function updGearChip() { const c = $('gearchip'); if (c) c.innerHTML = (rider.gear === 'board' ? 'SNOWBOARD' : 'SKIS') + '<small>' + (isTouch ? 'tap' : 'scroll') + ' ⇅</small>'; }
// swap skis <-> snowboard: instant, works mid-run (ground, air, grind), keeps each one's own handling
function swapGear() {
  const g = rider.gear === 'board' ? 'ski' : 'board'; setGear(g);
  Audio.swap(g === 'ski'); P.squash = Math.max(P.squash, 0.22); G.fovKick = Math.max(G.fovKick, 3);
  fx.tracks.forEach((t) => t.brk());
  if (G.state === 'play') { fx.emit(P.p, { x: P.v.x * 0.6, y: 2.5, z: P.v.z * 0.6 }, 4, 26, 0.4, 0.7); popup(g === 'ski' ? 'SKIS' : 'SNOWBOARD', g === 'ski' ? 'tight turns · hard grip' : 'big pop · fast spins', 'swap'); }
  const c = $('gearchip'); c.classList.remove('flash'); void c.offsetWidth; c.classList.add('flash');
  if (G.state === 'menu') renderMenu();
}
let lastWheel = 0;
addEventListener('wheel', (e) => {
  if (G.state === 'menu') return; // the home screen scrolls normally; swap with the gear cards there
  e.preventDefault(); wake();
  const now = performance.now(), fresh = now - lastWheel > 200; lastWheel = now; // one swap per flick (trackpad inertia = one gesture)
  if (fresh && (Math.abs(e.deltaY) > 0 || Math.abs(e.deltaX) > 0)) swapGear();
}, { passive: false });
$('gearchip').addEventListener('click', (e) => { e.stopPropagation(); wake(); swapGear(); });
$('gearchip').addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); wake(); swapGear(); }, { passive: false });
const GEARS = {
  ski: { name: 'SKIS', blurb: 'Tight turns, hard grip, strong snowplough brake.', stats: [['TURN', 0.9], ['GRIP', 0.9], ['POP', 0.6], ['SPIN', 0.6]] },
  board: { name: 'SNOWBOARD', blurb: 'Slides more, pops 8% higher, spins 12% faster.', stats: [['TURN', 0.72], ['GRIP', 0.6], ['POP', 0.8], ['SPIN', 0.85]] },
};
function renderMenu() {
  $('mgear').innerHTML = ['ski', 'board'].map((g) => { const d = GEARS[g]; return `<button data-g="${g}" class="gc ${rider.gear === g ? 'on' : ''}"><b>${d.name}</b><small>${d.blurb}</small><span class="bars">${d.stats.map(([k, v]) => `<span><i>${k}</i><u><s style="width:${v * 100}%"></s></u></span>`).join('')}</span></button>`; }).join('');
  $('mgear').querySelectorAll('button').forEach((b) => (b.onclick = () => { wake(); if (b.dataset.g !== rider.gear) swapGear(); else Audio.click(); }));
  const done = chDone(), avail = OUTFITS.filter((o) => o.unlock <= done);
  $('moutfit').innerHTML = OUTFITS.map((o, i) => `<button data-i="${i}" class="sw ${save.outfit === i ? 'on' : ''} ${o.unlock > done ? 'locked' : ''}" style="background:#${o.jacket.toString(16).padStart(6, '0')}" title="${o.name}${o.unlock > done ? ' - ' + o.unlock + ' challenges' : ''}">${o.unlock > done ? o.unlock : ''}</button>`).join('');
  $('moutfit').querySelectorAll('button').forEach((b) => (b.onclick = () => { const i = +b.dataset.i; if (OUTFITS[i].unlock > done) return; save.outfit = i; rider.setOutfit(i); persist(); Audio.click(); renderMenu(); }));
  const B = save.best.endless;
  $('mbest').innerHTML = [['BEST SCORE', B ? fmt(B.score) : '-'], ['FURTHEST', B ? (B.dist / 1000).toFixed(2) + ' km' : '-'], ['TOP SPEED', B && B.kmh ? B.kmh + ' km/h' : '-']].map(([k, v]) => `<div><small>${k}</small><b>${v}</b></div>`).join('');
  const K2 = isTouch
    ? [['left drag', 'steer · up tuck · down brake'], ['right hold + release', 'jump'], ['right drag in air', 'spin / flip'], ['GRAB', 'grab'], ['gear chip', 'swap skis / board']]
    : [['A / D or mouse', 'steer'], ['W / S', 'tuck (faster) / brake'], ['SPACE or click', 'hold + release = jump'], ['mouse in the air', 'spin + flip'], ['SHIFT / right-click', 'grab'], ['SCROLL WHEEL', 'swap skis / snowboard'], ['R · M · ESC', 'restart · mute · this screen']];
  $('mkeys').innerHTML = K2.map(([k, v]) => `<span class="k">${k}</span><span>${v}</span>`).join('');
  $('mch').innerHTML = `<div class="chh">CHALLENGES ${done}/${CH.length}</div>` + CH.map(([id, t]) => `<div class="ch ${save.ch[id] ? 'done' : ''}">${save.ch[id] ? '✓' : '○'} ${t}</div>`).join('');
  $('mresume').classList.toggle('hidden', !G.menuFromRun);
  document.querySelector('#menu h3 .tag').textContent = isTouch ? 'tap the gear chip in a run to swap' : 'scroll wheel swaps any time';
  void avail;
}
$('mresume').onclick = () => { wake(); closeMenu(); };
$('mplay').onclick = () => { wake(); start(); };

// ---------------- camera + visuals ----------------
const qA = new THREE.Quaternion(), qY = new THREE.Quaternion(), qF = new THREE.Quaternion(), qL = new THREE.Quaternion(), XA = new V3(1, 0, 0), ZA = new V3(0, 0, 1);
const camPos = new V3(0, 10, -10), look = new V3();
function updateVisuals(dt) {
  const p = P.p, sp = P.v.length();
  // rider transform
  rider.root.position.copy(p);
  let yaw = P.yaw, up = P.state === 'ground' ? P.n : UP;
  if (P.state === 'air') yaw = Math.atan2(P.v.x, P.v.z) + P.spin;
  if (P.state === 'grind') yaw = Math.atan2(P.grind.r.ux, P.grind.r.uz) * 1 + (P.grind.dir < 0 ? Math.PI : 0) + Math.PI / 2;
  if (P.sw) yaw += Math.PI;
  P.lean = lerp(P.lean, P.state === 'ground' ? -I.turn * clamp(sp / 18, 0, 1) * 0.5 * (P.sw ? -1 : 1) : P.state === 'grind' ? P.grind.bal * 0.4 : 0, 1 - Math.exp(-8 * dt));
  qA.setFromUnitVectors(UP, up); qY.setFromAxisAngle(UP, yaw); qF.setFromAxisAngle(XA, -P.flip); qL.setFromAxisAngle(ZA, P.lean);
  rider.root.quaternion.copy(qA).multiply(qY).multiply(qF).multiply(qL);
  if (P.state === 'crash') rider.root.quaternion.premultiply(P.tumble);
  P.squash = Math.max(0, P.squash - dt * 1.4);
  rider.root.scale.set(1 + P.squash * 0.4, 1 - P.squash, 1 + P.squash * 0.4);
  rider.pose({ crouch: P.state === 'grind' ? 0.45 : P.crouch, grab: P.grab, grabKind: P.grabKind, flail: P.state === 'crash' ? 1 : 0, t: G.t, airborne: P.state === 'air' });
  // camera
  W.backdrop.position.set(p.x, p.y + 360, p.z - 1100);
  if (G.state === 'menu') {
    // home screen backdrop: a slow orbit high over the valley ahead
    G.orbitT = (G.orbitT || 0) + dt; const a = 2.5 + G.orbitT * 0.04;
    { const cz = p.z + 140, cxx = EN.cx(cz); tmp.set(cxx + Math.sin(a) * 110, 0, cz + Math.cos(a) * 110 - 60); tmp.y = groundH(tmp.x, tmp.z) + 55; look.set(cxx, groundH(cxx, cz) - 5, cz); }
    camera.position.copy(tmp); camera.lookAt(look);
    camera.fov = 60; camera.updateProjectionMatrix(); W.sky.position.copy(camera.position);
    sun.position.set(look.x + W.sunDir.x * 150, look.y + W.sunDir.y * 150, look.z + W.sunDir.z * 150); sun.target.position.copy(look);
    return;
  } else {
    const sh = Math.hypot(P.v.x, P.v.z);
    if (P.state !== 'air' && P.state !== 'dead' && sh > 2.5) G.camYaw += angDiff(Math.atan2(P.v.x, P.v.z), G.camYaw) * (1 - Math.exp(-(P.state === 'crash' ? 1 : 3.2) * dt));
    const sv = Math.min(sp, 75), back = 6.6 + sv * 0.06, hgt = 2.5 + sv * 0.035;
    const fy = Math.sin(G.camYaw), fz = Math.cos(G.camYaw);
    tmp.set(p.x - fy * back, p.y + hgt, p.z - fz * back);
    tmp.y = Math.max(tmp.y, groundH(tmp.x, tmp.z) + 1.4);
    camPos.lerp(tmp, 1 - Math.exp(-(P.state === 'air' ? 5 : 9) * dt));
    camPos.y = Math.max(camPos.y, groundH(camPos.x, camPos.z) + 1.0);
    camera.position.copy(camPos);
    if (G.shake > 0) { camera.position.x += (Math.random() - 0.5) * G.shake; camera.position.y += (Math.random() - 0.5) * G.shake; G.shake = Math.max(0, G.shake - dt * 1.6); }
    // speed buzz: a fine, constant chatter on the snow above ~110 km/h (smooth noise, not random jitter)
    const buzz = P.state === 'ground' ? clamp((sp - 26) / 30, 0, 1) * 0.09 : P.state === 'air' ? clamp((sp - 26) / 30, 0, 1) * 0.025 : 0;
    if (buzz > 0) { camera.position.x += Math.sin(G.t * 53) * buzz + Math.sin(G.t * 31) * buzz * 0.6; camera.position.y += Math.sin(G.t * 47 + 1) * buzz; }
    // look further ahead the faster you go, so the line ahead stays readable
    const ahead = 5 + clamp(sp - 20, 0, 55) * 0.35;
    { const lx = p.x + fy * ahead, lz = p.z + fz * ahead; look.set(lx, lerp(p.y, Math.min(p.y, groundH(lx, lz)), 0.45) + 1.2, lz); }
    if (P.state === 'dead') look.copy(p);
    camera.lookAt(look);
  }
  G.fov = lerp(G.fov, 64 + clamp(sp, 0, 25) * 0.4 + clamp(sp - 25, 0, 35) * 0.55 + G.fovKick, 1 - Math.exp(-3 * dt)); G.fovKick *= Math.exp(-3 * dt);
  camera.fov = G.fov; camera.updateProjectionMatrix();
  // sun + shadow follow
  sun.position.set(p.x + W.sunDir.x * 150, p.y + W.sunDir.y * 150, p.z + W.sunDir.z * 150); sun.target.position.copy(p);
  W.sky.position.copy(camera.position);
}
// speed lines: radial streaks from the vanishing point, density and length grow with speed
const lc = $('lines'), lctx = lc.getContext('2d'), STREAKS = [];
for (let i = 0; i < 70; i++) STREAKS.push({ a: Math.random() * 6.283, r: 0.3 + Math.random() * 0.9, v: 0.6 + Math.random() * 0.9 });
let linesOn = false;
function drawLines(dt, sp) {
  const k = G.state === 'play' && P.state !== 'dead' ? clamp((sp - 22) / 28, 0, 1) : 0;
  if (k <= 0) { if (linesOn) { lctx.clearRect(0, 0, lc.width, lc.height); linesOn = false; } return; }
  const w = Math.ceil(innerWidth / 2), h = Math.ceil(innerHeight / 2); if (lc.width !== w || lc.height !== h) { lc.width = w; lc.height = h; }
  linesOn = true; lctx.clearRect(0, 0, w, h);
  const cx = w / 2, cy = h * 0.45, R = Math.hypot(w, h) * 0.55, n = Math.round(20 + 50 * k);
  lctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const s = STREAKS[i]; s.r += dt * s.v * (0.9 + 2.2 * k);
    if (s.r > 1.25) { s.r = 0.32 + Math.random() * 0.25; s.a = Math.random() * 6.283; }
    const len = (0.06 + 0.16 * k) * s.r, ca = Math.cos(s.a), sa = Math.sin(s.a), r0 = s.r * R, r1 = (s.r + len) * R;
    lctx.strokeStyle = 'rgba(255,255,255,' + (k * 0.55 * Math.min(1, (s.r - 0.3) * 3)).toFixed(3) + ')'; lctx.lineWidth = 0.6 + s.r * 1.4 * k;
    lctx.beginPath(); lctx.moveTo(cx + ca * r0, cy + sa * r0 * 0.75); lctx.lineTo(cx + ca * r1, cy + sa * r1 * 0.75); lctx.stroke();
  }
}
function updateHud(dt) {
  if (G.state !== 'play') { drawLines(dt, 0); return; }
  const sp = P.v.length();
  $('score').textContent = fmt(P.score + Math.floor(P.distPts));
  $('combo').innerHTML = P.combo ? `x${P.combo.n} <b>${fmt(P.combo.pts)}</b>` + `<i style="width:${clamp(1 - P.groundT / 2, 0, 1) * 100}%"></i>` : '';
  $('combo').classList.toggle('on', !!P.combo);
  $('time').textContent = fmtTime(P.time);
  $('speed').innerHTML = shownKmh(sp) + '<small>km/h</small>';
  const bal = $('bal'); bal.classList.toggle('on', P.state === 'grind');
  if (P.state === 'grind') $('needle').style.left = 50 + clamp(P.grind.bal, -1, 1) * 48 + '%';
  $('spd').style.opacity = clamp((sp - 20) / 28, 0, 0.85);
  drawLines(dt, sp);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
  if (G.hintT > 0) { G.hintT -= dt; if (G.hintT <= 0 || P.tricks > 0) { $('hint').classList.add('hidden'); G.hintT = 0; } }
}

// ---------------- main loop ----------------
function tick(dt) {
  G.t += dt;
  readInput(dt);
  if (G.state === 'play') EN.update(P.p.z);
  if (G.state === 'play') {
    const n = Math.max(1, Math.ceil(dt / (1 / 120))), h = dt / n;
    frameLogic(dt);
    for (let i = 0; i < n; i++) {
      if (P.state === 'ground') groundStep(h); else if (P.state === 'air') airStep(h); else if (P.state === 'grind') grindStep(h);
      else if (P.state === 'crash') crashStep(h); else if (P.state === 'dead') deadStep(h);
      if (P.state === 'ground' || P.state === 'air') collide();
    }
  }
  prevJump = I.jump; prevGrab = I.grab;
  for (const a of W.anim) a(dt);
  fx.update(dt);
  updateVisuals(dt);
  updateHud(dt);
}
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  tick(dt); renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
// boot: land straight in gameplay; ?title shows the menu
start();
if (qs.has('title')) openMenu();
if (save.runs <= 1 && !qs.has('nohint')) { G.hintT = 9; $('hint').classList.remove('hidden'); }
if (qs.has('mute')) Audio.setMuted(true);
$('lockhint').classList.toggle('hidden', isTouch);
requestAnimationFrame(frame);

// test hooks
window.__G = {
  G, P, W, save, start, setGear, fx,
  fast(sec, dt = 1 / 60) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) tick(dt); },
  set bot(v) { G.bot = v; }, get state() { return G.state; },
  teleport(x, z, speed = 10, yaw = 0) { P.p.set(x, groundH(x, z), z); P.yaw = yaw; P.v.set(Math.sin(yaw) * speed, 0, Math.cos(yaw) * speed); P.state = 'ground'; },
  EN, shownKmh, groundH, terrainH, renderer, camera,
  render() { renderer.render(scene, camera); }, openMenu, swapGear, get gear() { return rider.gear; },
};
