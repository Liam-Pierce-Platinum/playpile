import * as THREE from '../vendor/three.module.js';
import { T, NAMES, U, makeInst, setInst, flush, makeSky, makeCloudSea, gemMat, beamMat } from './world.js';
import { LEVELS, makeLevel, sandbox, key } from './level.js';
import { sfx, unlock, setMuted, muted } from './audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 900);
scene.add(camera);
scene.add(makeSky()); scene.add(makeCloudSea());
const world = makeInst(9000); scene.add(world);
const moverMesh = makeInst(200); scene.add(moverMesh);
const parts = makeInst(220); scene.add(parts);
const held = makeInst(1); held.renderOrder = 5; camera.add(held);
const outline = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1.004, 1.004, 1.004)), new THREE.LineBasicMaterial({ color: 0x2a1e30, transparent: true, opacity: .55 }));
outline.visible = false; scene.add(outline);
const gemGeo = new THREE.OctahedronGeometry(0.28, 0);
let gemMeshes = [], goalGroup = null;

function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- progress ----------
const SAVE = 'block_world_v1';
let prog = { unlocked: 1, stars: [], best: [], gems: [] };
try { const s = JSON.parse(localStorage.getItem(SAVE)); if (s) prog = Object.assign(prog, s); } catch (e) {}
const save = () => { try { localStorage.setItem(SAVE, JSON.stringify(prog)); } catch (e) {} };

// ---------- state ----------
const G = window.__G = { state: 'menu', auto: false, wi: 0, t: 0, deaths: 0 };
let L = null; // level data
let blocks = new Map(), placed = new Set();
const P = { pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: Math.PI, pitch: -0.15, ground: false, support: 0, onMover: null, check: null, bob: 0, dip: 0, fovKick: 0, swing: 0, airT: 0 };
const W = 0.3, H = 1.75, EYE = 1.6, SPEED = 6, JUMP = 9, GRAV = 28, BOUNCE = 17;
let gemsGot = 0, buildLeft = 0, timer = 0, started = false, sel = T.GRASS, tipT = 0;
const PALETTE = [T.GRASS, T.STONE, T.WOOD, T.BRICK, T.LEAVES, T.SAND, T.ICE, T.BOUNCE, T.CLAY];

const typeAt = (x, y, z) => blocks.get(key(x, y, z)) || 0;
function moverBox(m) { return [m.x0, m.y, m.z, m.x1 + 1, m.y + 1, m.z + m.len]; }

function rebuild() {
  let i = 0;
  for (const [k, t] of blocks) {
    const [x, y, z] = k.split(',').map(Number);
    const tint = 0.93 + ((x * 73856093 ^ y * 19349663 ^ z * 83492791) >>> 0) % 1000 / 1000 * 0.12;
    setInst(world, i++, x + .5, y + .5, z + .5, t, tint);
    if (i >= 9000) break;
  }
  world.count = i; flush(world);
}

function load(lv) {
  L = lv; blocks = new Map(lv.blocks); placed = new Set();
  rebuild();
  gemMeshes.forEach((g) => scene.remove(g)); gemMeshes = [];
  for (const g of lv.gems) { const m = new THREE.Mesh(gemGeo, gemMat); m.position.set(...g); m.userData.base = g[1]; scene.add(m); gemMeshes.push(m); }
  if (goalGroup) scene.remove(goalGroup); goalGroup = null;
  if (lv.goal) {
    goalGroup = new THREE.Group(); goalGroup.position.set(...lv.goal);
    const cr = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), gemMat); cr.scale.set(1, 1.7, 1); cr.position.y = 2; goalGroup.add(cr); goalGroup.userData.cr = cr;
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.4, 60, 16, 1, true), beamMat); beam.position.y = 30; goalGroup.add(beam);
    scene.add(goalGroup);
  }
  for (const m of lv.movers) { m.t = 0; m.z = m.za; m.dz = 0; }
  P.pos.set(...lv.spawn); P.vel.set(0, 0, 0); P.yaw = Math.PI; P.pitch = -0.12; P.check = lv.spawn.slice(); P.onMover = null;
  gemsGot = 0; buildLeft = lv.build; timer = 0; started = false; G.deaths = 0; G.wi = 0; G.zoneShown = new Set();
  $('lvlName').textContent = lv.sandbox ? 'SANDBOX' : (lv.li + 1) + '. ' + lv.name.toUpperCase();
  $('hotbar').classList.toggle('hidden', !lv.sandbox);
  $('timer').classList.toggle('hidden', !!lv.sandbox); $('gemBox').classList.toggle('hidden', !!lv.sandbox);
  if (lv.sandbox) drawHotbar();
  hud();
}

G.start = (li) => { G.li = li; load(li === 'sandbox' ? sandbox() : makeLevel(li)); setState('play'); };
G.LEVELS = LEVELS;

// ---------- physics ----------
function overlaps(px, py, pz, fn) {
  const x0 = Math.floor(px - W), x1 = Math.floor(px + W - 1e-6), y0 = Math.floor(py), y1 = Math.floor(py + H - 1e-6), z0 = Math.floor(pz - W), z1 = Math.floor(pz + W - 1e-6);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) { const t = typeAt(x, y, z); if (t) fn(x, y, z, x + 1, y + 1, z + 1, t, null); }
  for (const m of L.movers) { const b = moverBox(m); if (px + W > b[0] && px - W < b[3] && py + H > b[1] && py < b[4] && pz + W > b[2] && pz - W < b[5]) fn(...b, T.MOVER, m); }
}
function moveAxis(ax, d) {
  const p = P.pos; p[ax] += d; let hit = false;
  overlaps(p.x, p.y, p.z, (x0, y0, z0, x1, y1, z1, t, m) => {
    if (!(p.x + W > x0 && p.x - W < x1 && p.y + H > y0 && p.y < y1 && p.z + W > z0 && p.z - W < z1)) return;
    hit = true;
    if (ax === 'y') { if (d < 0) { p.y = y1; P.ground = true; P.support = t; P.onMover = m; } else p.y = y0 - H; P.vel.y = 0; }
    else if (ax === 'x') { p.x = d > 0 ? x0 - W : x1 + W; P.vel.x = 0; }
    else { p.z = d > 0 ? z0 - W : z1 + W; P.vel.z = 0; }
  });
  return hit;
}
function supported(px, py, pz) {
  let s = false;
  const y = Math.floor(py - 0.05);
  for (let x = Math.floor(px - W); x <= Math.floor(px + W - 1e-6); x++) for (let z = Math.floor(pz - W); z <= Math.floor(pz + W - 1e-6); z++) if (typeAt(x, y, z)) s = true;
  for (const m of L.movers) { const b = moverBox(m); if (Math.abs(py - b[4]) < .3 && px + W > b[0] && px - W < b[3] && pz + W > b[2] && pz - W < b[5]) s = true; }
  return s;
}

const input = { f: 0, s: 0, jump: false, jumpHeld: false };
const keys = {};
function step(dt) {
  if (G.state !== 'play') return;
  U.uTime.value += dt; G.t += dt;
  // movers
  for (const m of L.movers) { m.t += dt; const nz = m.za + (m.zb - m.za) * (0.5 - 0.5 * Math.cos(m.t / m.period * Math.PI * 2)); m.dz = nz - m.z; m.z = nz; }
  if (P.onMover) { P.pos.z += P.onMover.dz; }
  // push out if a mover moved into us
  for (const m of L.movers) { const b = moverBox(m); const p = P.pos;
    if (p.x + W > b[0] && p.x - W < b[3] && p.y + H > b[1] && p.y < b[4] && p.z + W > b[2] && p.z - W < b[5]) { if (p.y > b[4] - .5) { p.y = b[4]; P.vel.y = Math.max(0, P.vel.y); } else p.z = m.dz > 0 ? b[5] + W : b[2] - W; } }
  // input
  let mx = 0, mz = 0, wantJump = input.jump || input.jumpHeld;
  if (G.auto) { const a = autopilot(); mx = a[0]; mz = a[1]; wantJump = a[2]; }
  else {
    const f = input.f + ((keys.KeyW || keys.ArrowUp) ? 1 : 0) - ((keys.KeyS || keys.ArrowDown) ? 1 : 0);
    const s = input.s + ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
    const sy = Math.sin(P.yaw), cy = Math.cos(P.yaw);
    mx = -sy * f + cy * s; mz = -cy * f - sy * s;
    const l = Math.hypot(mx, mz); if (l > 1) { mx /= l; mz /= l; }
    if (keys.ShiftLeft) { mx *= .45; mz *= .45; }
  }
  if ((mx || mz || wantJump) && !started) started = true;
  if (started && !L.sandbox) timer += dt;
  const ice = P.ground && P.support === T.ICE;
  const acc = P.ground ? (ice ? 5 : 60) : 20;
  const tvx = mx * SPEED, tvz = mz * SPEED;
  P.vel.x += (tvx - P.vel.x) * Math.min(1, acc * dt / Math.max(1, Math.hypot(tvx - P.vel.x, tvz - P.vel.z)));
  P.vel.z += (tvz - P.vel.z) * Math.min(1, acc * dt / Math.max(1, Math.hypot(tvx - P.vel.x, tvz - P.vel.z)));
  if (wantJump && P.ground) { P.vel.y = JUMP; P.ground = false; P.onMover = null; sfx.jump(); input.jump = false; }
  P.vel.y = Math.max(-40, P.vel.y - GRAV * dt);
  const wasGround = P.ground, vyBefore = P.vel.y; P.ground = false;
  const n = Math.ceil(Math.max(Math.abs(P.vel.x), Math.abs(P.vel.y), Math.abs(P.vel.z)) * dt / 0.3) || 1;
  const prevMover = P.onMover; P.onMover = null;
  for (let i = 0; i < n; i++) { moveAxis('y', P.vel.y * dt / n); moveAxis('x', P.vel.x * dt / n); moveAxis('z', P.vel.z * dt / n); }
  if (!P.ground && prevMover && P.vel.y <= 0 && supported(P.pos.x, P.pos.y, P.pos.z)) { P.ground = true; P.onMover = prevMover; P.support = T.MOVER; }
  if (P.ground && !wasGround) { landed(vyBefore); }
  if (P.ground) {
    if (P.support === T.BOUNCE) { P.vel.y = BOUNCE; P.ground = false; P.fovKick = 14; sfx.bounce(); burst(P.pos.x, P.pos.y, P.pos.z, T.BOUNCE, 10); }
    else if (P.support === T.LAVA) return die();
    else if (P.support === T.CHECK && !L.sandbox) {
      const fx = Math.floor(P.pos.x), fz = Math.floor(P.pos.z);
      const c = [fx + .5, Math.round(P.pos.y), fz + .5];
      if (!P.check || Math.hypot(P.check[0] - c[0], P.check[2] - c[2]) > 3) { P.check = c; toast('CHECKPOINT'); sfx.check(); burst(c[0], c[1], c[2], T.CHECK, 16); }
    }
    const sp = Math.hypot(P.vel.x, P.vel.z);
    if (sp > 1) { const ob = P.bob; P.bob += dt * sp * 1.6; if (Math.floor(ob / Math.PI) !== Math.floor(P.bob / Math.PI)) sfx.step(); }
  }
  if (P.pos.y < -12) return die();
  // gems
  for (const g of gemMeshes) {
    if (!g.visible) continue;
    g.rotation.y += dt * 2; g.position.y = g.userData.base + Math.sin(G.t * 3 + g.position.x) * .12;
    if (g.position.distanceTo(new THREE.Vector3(P.pos.x, P.pos.y + .9, P.pos.z)) < 1.1) { g.visible = false; gemsGot++; sfx.gem(); burst(g.position.x, g.position.y, g.position.z, T.ICE, 8, .7); hud(); }
  }
  // zones / goal
  for (const z of L.zones) if (!G.zoneShown.has(z) && Math.hypot(P.pos.x - z.x, P.pos.z - z.z) < 3) { G.zoneShown.add(z); tip(z.msg, 6); }
  if (goalGroup) { goalGroup.userData.cr.rotation.y += dt; goalGroup.userData.cr.position.y = 2 + Math.sin(G.t * 2) * .2;
    const g = L.goal; if (Math.hypot(P.pos.x - g[0], P.pos.z - g[2]) < 1.6 && Math.abs(P.pos.y - g[1]) < 1.5) win(); }
  // particles
  stepParts(dt);
  P.dip *= Math.exp(-dt * 9); P.fovKick *= Math.exp(-dt * 4); P.swing = Math.max(0, P.swing - dt * 5);
  if (tipT > 0 && (tipT -= dt) <= 0) $('tip').classList.add('hidden');
}
function landed(vy) {
  if (vy < -6) { P.dip = Math.min(.25, -vy * .012); sfx.land(); burst(P.pos.x, P.pos.y, P.pos.z, P.support || T.STONE, 5, .4); }
}
function die() {
  G.deaths++; sfx.die(); hud(); if (G.trace) G.trace.push(G.wi + ':' + (L.waypoints[G.wi]||{}).kind + '@' + P.pos.toArray().map(v=>v.toFixed(1)).join(','));
  $('flash').classList.remove('on'); void $('flash').offsetWidth; $('flash').classList.add('on');
  const c = P.check || L.spawn; P.pos.set(c[0], c[1], c[2]); P.vel.set(0, 0, 0); P.onMover = null; P.ground = false;
  if (G.auto) { // rewind the bot to the waypoint nearest its checkpoint
    let best = 0, bd = 1e9; L.waypoints.forEach((w, i) => { const d = Math.hypot(w.x - c[0], w.z - c[2]) + (w.z < c[2] - .5 ? 0 : 0); if (d < bd) { bd = d; best = i; } }); G.wi = best;
  }
}
function win() {
  if (G.state !== 'play') return;
  sfx.win(); burst(L.goal[0], L.goal[1] + 2, L.goal[2], T.CHECK, 40, 1.5);
  const t = timer, par = L.par;
  const stars = t <= par ? 3 : t <= par * 1.5 ? 2 : 1;
  const li = L.li, newBest = !prog.best[li] || t < prog.best[li];
  prog.stars[li] = Math.max(prog.stars[li] || 0, stars); if (newBest) prog.best[li] = t;
  prog.gems[li] = Math.max(prog.gems[li] || 0, gemsGot); prog.unlocked = Math.max(prog.unlocked, li + 2); save();
  G.result = { stars, t, par, deaths: G.deaths, gems: gemsGot };
  $('rTitle').textContent = li === LEVELS.length - 1 ? 'SUMMIT REACHED!' : 'COURSE CLEAR!';
  $('rStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${i * .18}s">&#9733;</span>`).join('');
  $('rStats').innerHTML = `<div><b>${fmt(t)}</b>time${newBest ? ' <i>NEW BEST</i>' : ''}</div><div><b>${fmt(par)}</b>3-star par</div><div><b>${gemsGot}/${L.gems.length}</b>gems</div><div><b>${G.deaths}</b>falls</div>`;
  $('nextBtn').classList.toggle('hidden', li >= LEVELS.length - 1);
  setState('won');
}
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1); };

// ---------- autopilot (scripted test run) ----------
function autopilot() {
  const w = L.waypoints[G.wi]; if (!w) return [0, 0, false];
  let tx = w.x, tz = w.z, go = true, jump = false;
  const p = P.pos;
  if (w.kind === 'mover') {
    const m = w.m; tx = (m.x0 + m.x1 + 1) / 2; tz = m.z + m.len / 2;
    if (P.onMover === m) { G.wi++; return [0, 0, false]; }
    if (P.ground && Math.abs(m.z - m.za) > .2) go = false;
  } else if (w.kind === 'afterMover' && P.onMover) {
    const m = P.onMover; if (Math.abs(m.z - m.zb) > .15) { go = false; }
  }
  const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
  if (w.kind === 'build' && P.ground && d < .55) {
    for (let i = 0; i < w.gap; i++) tryPlace(w.bx, w.by, w.bz + i);
    G.wi++; return [0, 0, false];
  }
  if (P.ground && d < .55 && Math.abs(p.y - w.y) < .6 && w.kind !== 'mover' && w.kind !== 'build') { G.wi++; }
  if (!go) { // hold still on whatever we're standing on
    const c = P.onMover ? [(P.onMover.x0 + P.onMover.x1 + 1) / 2, P.onMover.z + 1] : null;
    if (c) { const ex = c[0] - p.x, ez = c[1] - p.z; return [ex * .5, ez * .5, false]; }
    return [0, 0, false];
  }
  const sp = P.ground ? Math.min(1, d * 1.5) : (d > 1.2 ? 1 : d * .6);
  const ux = dx / (d || 1), uz = dz / (d || 1);
  P.yaw = Math.atan2(-ux, -uz);
  if (P.ground && d > .6) {
    const ax = p.x + ux * .45, az = p.z + uz * .45;
    if (!supported(ax, p.y, az)) jump = true;
    if (typeAt(Math.floor(p.x + ux * .5), Math.floor(p.y + .1), Math.floor(p.z + uz * .5))) jump = true;
  }
  return [ux * sp, uz * sp, jump];
}

// ---------- building ----------
function raycast(maxD = 6) {
  const o = camera.getWorldPosition(new THREE.Vector3()), dir = camera.getWorldDirection(new THREE.Vector3());
  let x = Math.floor(o.x), y = Math.floor(o.y), z = Math.floor(o.z);
  const sx = Math.sign(dir.x), sy = Math.sign(dir.y), sz = Math.sign(dir.z);
  const tdx = Math.abs(1 / dir.x), tdy = Math.abs(1 / dir.y), tdz = Math.abs(1 / dir.z);
  let tx = (sx > 0 ? x + 1 - o.x : o.x - x) * tdx, ty = (sy > 0 ? y + 1 - o.y : o.y - y) * tdy, tz = (sz > 0 ? z + 1 - o.z : o.z - z) * tdz;
  let face = null, t = 0;
  while (t < maxD) {
    if (tx < ty && tx < tz) { x += sx; t = tx; tx += tdx; face = [-sx, 0, 0]; }
    else if (ty < tz) { y += sy; t = ty; ty += tdy; face = [0, -sy, 0]; }
    else { z += sz; t = tz; tz += tdz; face = [0, 0, -sz]; }
    if (t > maxD) break;
    if (typeAt(x, y, z)) return { x, y, z, face };
  }
  return null;
}
function tryPlace(x, y, z) {
  if (typeAt(x, y, z)) return false;
  if (!L.sandbox && buildLeft <= 0) { sfx.no(); toast('OUT OF BLOCKS'); return false; }
  const p = P.pos;
  if (p.x + W > x && p.x - W < x + 1 && p.y + H > y && p.y < y + 1 && p.z + W > z && p.z - W < z + 1) return false;
  const t = L.sandbox ? sel : T.CLAY;
  blocks.set(key(x, y, z), t); placed.add(key(x, y, z)); if (!L.sandbox) buildLeft--;
  rebuild(); sfx.place(); P.swing = 1; burst(x + .5, y + .5, z + .5, t, 6, .5); hud();
  return true;
}
function tryBreak(x, y, z) {
  const k = key(x, y, z), t = blocks.get(k); if (!t) return false;
  if (!L.sandbox && !placed.has(k)) { sfx.no(); return false; }
  blocks.delete(k); if (placed.delete(k) && !L.sandbox) buildLeft++;
  rebuild(); sfx.break(); P.swing = 1; burst(x + .5, y + .5, z + .5, t, 14); hud();
  return true;
}
function doPlace() { const h = raycast(); if (h) tryPlace(h.x + h.face[0], h.y + h.face[1], h.z + h.face[2]); }
function doBreak() { const h = raycast(); if (h) tryBreak(h.x, h.y, h.z); }
G.tryPlace = tryPlace; G.tryBreak = tryBreak; G.raycast = raycast;

// ---------- particles ----------
const PS = [];
function burst(x, y, z, t, n, sc = 1) { for (let i = 0; i < n; i++) { if (PS.length > 200) PS.shift(); PS.push({ x, y, z, vx: (Math.random() - .5) * 5 * sc, vy: Math.random() * 5 * sc + 1, vz: (Math.random() - .5) * 5 * sc, life: .7 + Math.random() * .4, t, r: new THREE.Euler(Math.random() * 3, Math.random() * 3, 0) }); } }
function stepParts(dt) {
  for (let i = PS.length - 1; i >= 0; i--) { const q = PS[i]; q.life -= dt; if (q.life <= 0) { PS.splice(i, 1); continue; } q.vy -= 18 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.r.x += dt * 5; }
}
function drawParts() { PS.forEach((q, i) => setInst(parts, i, q.x, q.y, q.z, q.t, 1, .16 * Math.min(1, q.life * 2), q.r)); parts.count = PS.length; flush(parts); }

// ---------- render ----------
const camRot = new THREE.Euler(0, 0, 0, 'YXZ');
function render() {
  const p = P.pos;
  const sp = P.ground ? Math.hypot(P.vel.x, P.vel.z) / SPEED : 0;
  const bob = Math.sin(P.bob * 2) * .05 * sp;
  camera.position.set(p.x, p.y + EYE + bob - P.dip, p.z);
  camRot.set(P.pitch, P.yaw, Math.cos(P.bob) * .008 * sp); camera.quaternion.setFromEuler(camRot);
  const fov = 75 + P.fovKick + Math.min(8, Math.max(0, -P.vel.y - 10) * .5);
  if (Math.abs(camera.fov - fov) > .05) { camera.fov = fov; camera.updateProjectionMatrix(); }
  U.uCam.value.copy(camera.position);
  // movers
  let i = 0; for (const m of L.movers) for (let x = m.x0; x <= m.x1; x++) for (let z = 0; z < m.len; z++) setInst(moverMesh, i++, x + .5, m.y + .5, m.z + z + .5, T.MOVER, 1);
  moverMesh.count = i; flush(moverMesh);
  // held block
  const sw = Math.sin(P.swing * Math.PI);
  setInst(held, 0, .42 + Math.cos(P.bob) * .015 * sp, -.36 + bob * .4 - sw * .12, -.65 + sw * .1, L.sandbox ? sel : T.CLAY, 1, .26, new THREE.Euler(.35 - sw * .6, .7, 0));
  held.count = (L.sandbox || buildLeft > 0) ? 1 : 0; flush(held);
  drawParts();
  const h = G.state === 'play' && raycast(); outline.visible = !!h; if (h) outline.position.set(h.x + .5, h.y + .5, h.z + .5);
  renderer.render(scene, camera);
}
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(.1, (now - last) / 1000); last = now; acc += dt;
  while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; }
  if (L) { render(); if (G.state === 'play') $('timer').textContent = fmt(timer); }
}
G.fast = (sec, dt = 1 / 60) => { for (let t = 0; t < sec && G.state === 'play'; t += dt) step(dt); return G.state; };
G.render = render;
G.info = () => ({ state: G.state, li: L && L.li, wi: G.wi, nw: L && L.waypoints.length, pos: P.pos.toArray().map((v) => +v.toFixed(2)), deaths: G.deaths, gems: gemsGot, timer: +timer.toFixed(1), build: buildLeft, blocks: blocks.size });

// ---------- UI ----------
function hud() {
  $('gems').textContent = gemsGot + '/' + (L ? L.gems.length : 0);
  $('deaths').textContent = G.deaths;
  $('buildBox').classList.toggle('hidden', !L || L.sandbox || L.build === 0 && buildLeft === 0);
  $('build').textContent = buildLeft;
}
function toast(s) { const t = $('toast'); t.textContent = s; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show'); }
function tip(s, sec = 5) { $('tip').textContent = s; $('tip').classList.remove('hidden'); tipT = sec; }
function drawHotbar() { $('hotbar').innerHTML = PALETTE.map((t, i) => `<div class="slot ${t === sel ? 'on' : ''}" data-i="${i}"><span class="sw t${t}"></span><em>${i + 1}</em></div>`).join(''); }
$('hotbar').addEventListener('pointerdown', (e) => { const s = e.target.closest('.slot'); if (s) { sel = PALETTE[+s.dataset.i]; drawHotbar(); sfx.click(); e.stopPropagation(); } });
function showOnly(id) { ['menu', 'pause', 'result'].forEach((s) => $(s).classList.toggle('hidden', s !== id)); }
function setState(s) {
  G.state = s;
  showOnly(s === 'menu' ? 'menu' : s === 'pause' ? 'pause' : s === 'won' ? 'result' : null);
  $('hud').classList.toggle('hidden', s !== 'play');
  $('touch').classList.toggle('hidden', !(touchMode && s === 'play'));
  if (s === 'menu') drawMenu();
  if (s !== 'play' && document.pointerLockElement) document.exitPointerLock();
}
function drawMenu() {
  const total = prog.stars.reduce((a, b) => a + (b || 0), 0);
  $('totStars').textContent = total + ' / ' + LEVELS.length * 3;
  $('levels').innerHTML = LEVELS.map((n, i) => {
    const lock = i >= prog.unlocked, st = prog.stars[i] || 0;
    return `<button class="lv ${lock ? 'lock' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}><b>${i + 1}</b><span>${n}</span><i>${lock ? '&#128274;' : '&#9733;'.repeat(st) + '<s>' + '&#9733;'.repeat(3 - st) + '</s>'}</i>${prog.best[i] ? `<small>${fmt(prog.best[i])}</small>` : ''}</button>`;
  }).join('');
  $('sandBtn').disabled = prog.unlocked < 3; $('sandBtn').textContent = prog.unlocked < 3 ? 'SANDBOX (clear 2 courses)' : 'SANDBOX BUILD';
}
$('levels').addEventListener('click', (e) => { const b = e.target.closest('.lv'); if (b && !b.disabled) { unlock(); sfx.click(); G.start(+b.dataset.i); } });
$('sandBtn').onclick = () => { unlock(); sfx.click(); G.start('sandbox'); };
$('playBtn').onclick = () => { unlock(); sfx.click(); G.start(Math.min(prog.unlocked, LEVELS.length) - 1); };
$('resumeBtn').onclick = () => { setState('play'); lockPointer(); };
$('restartBtn').onclick = () => G.start(G.li);
$('pMenu').onclick = () => setState('menu');
$('retryBtn').onclick = () => G.start(G.li);
$('nextBtn').onclick = () => G.start(G.li + 1);
$('menuBtn').onclick = () => setState('menu');
$('muteBtn').onclick = (e) => { e.stopPropagation(); setMuted(!muted); $('muteBtn').classList.toggle('off', muted); };
$('pauseBtn').onclick = (e) => { e.stopPropagation(); setState('pause'); };

// ---------- input ----------
function lockPointer() { if (touchMode) return; try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
canvas.addEventListener('mousedown', (e) => {
  unlock(); if (G.state !== 'play' || touchMode) return;
  if (document.pointerLockElement !== canvas) { lockPointer(); return; }
  if (e.button === 0) doBreak(); else if (e.button === 2) doPlace();
});
addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('pointerlockchange', () => $('lockHint').classList.toggle('hidden', document.pointerLockElement === canvas || touchMode));
addEventListener('mousemove', (e) => { if (document.pointerLockElement !== canvas) return; P.yaw -= e.movementX * .0023; P.pitch = Math.max(-1.55, Math.min(1.55, P.pitch - e.movementY * .0023)); });
addEventListener('keydown', (e) => {
  unlock(); keys[e.code] = true;
  if (e.code === 'Space') { input.jumpHeld = true; e.preventDefault(); }
  if (G.state === 'play') {
    if (e.code === 'KeyR') die();
    if (e.code === 'KeyF' || e.code === 'KeyE') doPlace();
    if (e.code === 'KeyQ') doBreak();
    if (L.sandbox && /^Digit[1-9]$/.test(e.code)) { sel = PALETTE[+e.code.slice(5) - 1]; drawHotbar(); }
    if (e.code === 'Escape' || e.code === 'KeyP') setState('pause');
  } else if (G.state === 'won' && e.code === 'Enter') ($('nextBtn').classList.contains('hidden') ? $('menuBtn') : $('nextBtn')).click();
  else if (G.state === 'pause' && e.code === 'KeyP') $('resumeBtn').click();
  if (e.code === 'KeyM') $('muteBtn').click();
});
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space') input.jumpHeld = false; });
addEventListener('wheel', (e) => { if (L && L.sandbox && G.state === 'play') { const i = (PALETTE.indexOf(sel) + (e.deltaY > 0 ? 1 : -1) + PALETTE.length) % PALETTE.length; sel = PALETTE[i]; drawHotbar(); } });

// touch: left = joystick, right = look; buttons
const touchMode = Q.has('touch') || ('ontouchstart' in window && matchMedia('(pointer: coarse)').matches);
if (touchMode) document.body.classList.add('touch');
const tp = { stick: null, look: null };
canvas.addEventListener('touchstart', (e) => { unlock(); for (const t of e.changedTouches) { if (t.clientX < innerWidth * .45 && !tp.stick) { tp.stick = { id: t.identifier, x: t.clientX, y: t.clientY }; $('stick').style.cssText = `left:${t.clientX}px;top:${t.clientY}px;display:block`; } else if (!tp.look) tp.look = { id: t.identifier, x: t.clientX, y: t.clientY }; } e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { for (const t of e.changedTouches) {
  if (tp.stick && t.identifier === tp.stick.id) { let dx = (t.clientX - tp.stick.x) / 50, dy = (t.clientY - tp.stick.y) / 50; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } input.s = dx; input.f = -dy; $('knob').style.transform = `translate(${dx * 34}px,${dy * 34}px)`; }
  if (tp.look && t.identifier === tp.look.id) { P.yaw -= (t.clientX - tp.look.x) * .006; P.pitch = Math.max(-1.5, Math.min(1.5, P.pitch - (t.clientY - tp.look.y) * .006)); tp.look.x = t.clientX; tp.look.y = t.clientY; }
} e.preventDefault(); }, { passive: false });
canvas.addEventListener('touchend', (e) => { for (const t of e.changedTouches) { if (tp.stick && t.identifier === tp.stick.id) { tp.stick = null; input.f = input.s = 0; $('stick').style.display = 'none'; $('knob').style.transform = ''; } if (tp.look && t.identifier === tp.look.id) tp.look = null; } });
const tb = (id, fn, up) => { const b = $(id); b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); unlock(); fn(); }, { passive: false }); if (up) b.addEventListener('touchend', (e) => { e.preventDefault(); up(); }); };
tb('tJump', () => { input.jumpHeld = true; }, () => { input.jumpHeld = false; });
tb('tPlace', doPlace); tb('tBreak', doBreak);

// ---------- boot ----------
G.auto = Q.has('auto');
if (Q.has('title')) { load(makeLevel(0)); P.yaw = Math.PI * .85; P.pitch = .05; setState('menu'); }
else { const li = Q.has('level') ? +Q.get('level') : Math.min(prog.unlocked, LEVELS.length) - 1; if (Q.get('level') === 'sandbox') G.start('sandbox'); else G.start(li); tip(touchMode ? 'Left thumb: move  -  Right thumb: look  -  reach the golden beacon' : 'WASD move  -  Space jump  -  click to look  -  reach the golden beacon', 6); }
$('lockHint').classList.toggle('hidden', touchMode);
requestAnimationFrame(frame);
