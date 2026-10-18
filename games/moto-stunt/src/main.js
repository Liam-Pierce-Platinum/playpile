// MOTO STUNT - side-view comic-book stunt bike.
import * as THREE from 'three';
import { ink, makePost } from './ink.js';
import { buildLevel, COUNT, NAMES } from './levels.js';
import { unlock, engine, sfx } from './audio.js';

const Q = new URLSearchParams(location.search);
const G_ = 22, ACC = 17, VMAX = 21, FLIP_BONUS = 1.0;
const WR = 0.42, OFF = [[-0.78, -0.28], [0.78, -0.28]], HEAD = [-0.12, 1.12], TORSO = [-0.22, 0.5];
const MASS = 1, INER = 0.45;

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const post = makePost(renderer);
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- save ----------
const SAVE_KEY = 'moto_stunt_v1';
let save = { unlocked: 0, stars: [], best: [] };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s.unlocked === 'number') save = s; } catch (e) {}
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} };

// ---------- geometry helpers ----------
const box = (w, h, d, c, o) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), ink(c, o));
const cyl = (r1, r2, h, c, o, seg = 16) => new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), ink(c, o));
const sph = (r, c, o) => new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), ink(c, o));

function makeBike() {
  const g = new THREE.Group(), wheels = [];
  for (const [lx, ly] of OFF) {
    const w = new THREE.Group(); w.position.set(lx, ly, 0);
    const tire = new THREE.Mesh(new THREE.TorusGeometry(WR - 0.1, 0.11, 10, 24), ink(0x2a2633, { shade: 0x6a6080 }));
    const hub = cyl(0.2, 0.2, 0.1, 0xffd23a, { shine: 1 }); hub.rotation.x = Math.PI / 2;
    w.add(tire, hub);
    for (let k = 0; k < 3; k++) { const s = box(0.05, WR * 1.5, 0.04, 0xe8e4f0); s.rotation.z = k * Math.PI / 3; w.add(s); }
    g.add(w); wheels.push(w);
  }
  const frame = box(1.15, 0.22, 0.28, 0xff6a1a, { shine: 1 }); frame.position.set(0, 0.05, 0); frame.rotation.z = 0.08;
  const tank = box(0.55, 0.28, 0.36, 0xff6a1a, { shine: 1 }); tank.position.set(0.22, 0.25, 0);
  const seat = box(0.6, 0.1, 0.3, 0x2a2633); seat.position.set(-0.3, 0.22, 0);
  const fend = box(0.5, 0.06, 0.26, 0xffffff); fend.position.set(0.85, 0.22, 0); fend.rotation.z = -0.25;
  const fork = cyl(0.05, 0.05, 0.85, 0xc8c4d8, { shine: 1 }); fork.position.set(0.66, 0.12, 0); fork.rotation.z = 0.45;
  const bar = cyl(0.04, 0.04, 0.6, 0x2a2633); bar.position.set(0.5, 0.55, 0); bar.rotation.x = Math.PI / 2;
  const swing = box(0.8, 0.08, 0.2, 0x2a2633); swing.position.set(-0.42, -0.14, 0); swing.rotation.z = 0.15;
  const pipe = cyl(0.07, 0.09, 0.6, 0xc8c4d8, { shine: 1 }); pipe.position.set(-0.55, 0.0, 0.2); pipe.rotation.z = Math.PI / 2 - 0.2;
  const num = box(0.32, 0.3, 0.38, 0xffffff); num.position.set(-0.05, 0.08, 0);
  g.add(frame, tank, seat, fend, fork, bar, swing, pipe, num);
  // rider
  const r = new THREE.Group(); r.position.set(-0.25, 0.25, 0);
  const torso = box(0.32, 0.68, 0.42, 0x2f6fff); torso.position.set(0.1, 0.38, 0); torso.rotation.z = -0.45;
  const stripe = box(0.34, 0.12, 0.44, 0xffd23a); stripe.position.set(0.1, 0.42, 0); stripe.rotation.z = -0.45;
  const head = sph(0.25, 0xffffff, { shine: 1 }); head.position.set(0.25, 0.87, 0);
  const visor = box(0.14, 0.12, 0.3, 0x1b1026); visor.position.set(0.44, 0.86, 0);
  const crest = box(0.42, 0.06, 0.08, 0xff3a5a); crest.position.set(0.22, 1.1, 0);
  const arm = box(0.62, 0.13, 0.13, 0x2f6fff); arm.position.set(0.48, 0.48, 0.18); arm.rotation.z = -0.35;
  const arm2 = arm.clone(); arm2.position.z = -0.18;
  const thigh = box(0.52, 0.17, 0.17, 0x23305a); thigh.position.set(0.18, 0.02, 0.2); thigh.rotation.z = -0.15;
  const thigh2 = thigh.clone(); thigh2.position.z = -0.2;
  const shin = box(0.15, 0.48, 0.15, 0x23305a); shin.position.set(0.38, -0.2, 0.2); shin.rotation.z = 0.35;
  const boot = box(0.26, 0.13, 0.17, 0x1b1026); boot.position.set(0.48, -0.42, 0.2);
  r.add(torso, stripe, head, visor, crest, arm, arm2, thigh, thigh2, shin, boot);
  g.add(r);
  return { g, wheels, rider: r };
}

function star(n, r1, r2) {
  const s = new THREE.Shape();
  for (let k = 0; k <= n * 2; k++) { const a = k / (n * 2) * Math.PI * 2, r = k % 2 ? r2 : r1; k ? s.lineTo(Math.cos(a) * r, Math.sin(a) * r) : s.moveTo(r, 0); }
  return new THREE.ExtrudeGeometry(s, { depth: 0.3, bevelEnabled: false });
}

// ---------- world ----------
let L = null, world = null, bike = null;
const B = { x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, g: [false, false], n: [[0, 1], [0, 1]], spin: [0, 0] };
const rag = { x: 0, y: 0, vx: 0, vy: 0, a: 0, w: 0, on: false };
const S = { state: 'menu', level: 0, t: 0, bonus: 0, flipsTotal: 0, check: -1, crashT: 0, crashes: 0, air: 0, rot: 0, pendFlip: 0, pendT: 0, shake: 0, flash: 0, slow: 0, camX: 0, camY: 0, lead: 0, time: 0 };
const input = { gas: 0, brake: 0, lean: 0 };
let fx = [];

function clearWorld() { if (world) { scene.remove(world); world.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); } fx = []; }

function buildWorld() {
  clearWorld();
  world = new THREE.Group(); scene.add(world);
  const T = L.theme; post.sky(T.sky[0], T.sky[1], T.sky[2]);
  const bottom = L.minY - 40;
  const cap = ink(T.ground, { strata: 1, color2: T.ground2, top: T.top }), top = ink(T.top, { shade: 0x9a7090 });
  for (const line of L.lines) {
    const s = new THREE.Shape(); s.moveTo(line[0][0], line[0][1]);
    for (let k = 1; k < line.length; k++) s.lineTo(line[k][0], line[k][1]);
    s.lineTo(line[line.length - 1][0], bottom); s.lineTo(line[0][0], bottom);
    const geo = new THREE.ExtrudeGeometry(s, { depth: 7, bevelEnabled: false, curveSegments: 1 }); geo.translate(0, 0, -3.5);
    world.add(new THREE.Mesh(geo, [cap, top]));
  }
  // pits: spikes
  const spikeGeo = new THREE.ConeGeometry(0.35, 1.1, 6), spikeMat = ink(0xe8e4f0, { shine: 1 });
  for (const [x0, x1, y] of L.pits) {
    const fl = box(x1 - x0, 0.6, 7, 0x1b1026); fl.position.set((x0 + x1) / 2, y - 4.3, 0); world.add(fl);
    for (let x = x0 + 0.4; x < x1; x += 0.8) for (let z = -2.6; z <= 2.6; z += 1.3) { const sp = new THREE.Mesh(spikeGeo, spikeMat); sp.position.set(x, y - 3.5, z); world.add(sp); }
  }
  // obstacles
  for (const o of L.obs) {
    if (o.t === 'barrel') {
      const g = new THREE.Group(); g.position.set(o.x, o.y + 0.6, 0);
      const b = cyl(0.55, 0.55, 1.2, 0xff3a3a, { shine: 1 }); const b1 = cyl(0.57, 0.57, 0.16, 0xffffff); b1.position.y = 0.3; const b2 = b1.clone(); b2.position.y = -0.3;
      const lid = cyl(0.3, 0.3, 0.1, 0xffd23a); lid.position.y = 0.62;
      g.add(b, b1, b2, lid); world.add(g); o.mesh = g; o.dead = false;
    } else {
      const g = new THREE.Group(); g.position.set(o.x, o.y + 7.5, 0);
      const post1 = box(0.4, 9, 0.4, 0x5a4a6a); post1.position.set(0, -3, -2.6); const post2 = post1.clone(); post2.position.z = 2.6;
      const beam = box(0.5, 0.5, 5.6, 0x5a4a6a); beam.position.y = 1.2;
      world.add(g); g.add(post1, post2, beam);
      const arm = new THREE.Group(); g.add(arm);
      const rod = cyl(0.12, 0.12, 5.2, 0xc8c4d8, { shine: 1 }); rod.position.y = -2.6;
      const head = cyl(0.85, 0.85, 2.2, 0x6a5aff, { shine: 1 }); head.rotation.x = Math.PI / 2; head.position.y = -5.6;
      const band = cyl(0.9, 0.9, 0.3, 0xffd23a); band.rotation.x = Math.PI / 2; band.position.y = -5.6;
      arm.add(rod, head, band); o.arm = arm;
    }
  }
  // checkpoints + finish + start
  L.flags = L.checks.map(([x, y]) => {
    const g = new THREE.Group(); g.position.set(x, y, -2.8);
    const pole = cyl(0.07, 0.07, 3.4, 0xffffff); pole.position.y = 1.7;
    const s = new THREE.Shape(); s.moveTo(0, 0); s.lineTo(1.3, -0.45); s.lineTo(0, -0.9);
    const f = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 0.08, bevelEnabled: false }), ink(0xffd23a)); f.position.set(0.05, 3.35, 0);
    g.add(pole, f); world.add(g); g.userData.flag = f; return g;
  });
  const fy = groundY(L.finish);
  const gate = new THREE.Group(); gate.position.set(L.finish, fy, 0); world.add(gate);
  for (const z of [-3, 3]) { const p = box(0.4, 5.5, 0.4, 0x2a2633); p.position.set(0, 2.75, z); gate.add(p); }
  for (let r = 0; r < 2; r++) for (let c = 0; c < 10; c++) { const b = box(0.4, 0.4, 0.62, (r + c) % 2 ? 0x1b1026 : 0xffffff); b.position.set(0, 5.1 + r * 0.4, -2.8 + c * 0.62); gate.add(b); }
  // backdrop
  const R = mulberry(L.i * 31 + 5);
  const farMat = ink(T.far, { shade: 0xb090c0 }), propMat = ink(T.prop, { shade: 0x9070a0 });
  for (let x = -60; x < L.finish + 80; x += 14 + R() * 18) {
    const w = 8 + R() * 14, h = 8 + R() * 18, s = new THREE.Shape();
    s.moveTo(-w / 2 - 3, 0); s.lineTo(-w / 2, h); s.lineTo(w / 2, h * (0.8 + R() * 0.2)); s.lineTo(w / 2 + 3, 0);
    const m = new THREE.Mesh(new THREE.ExtrudeGeometry(s, { depth: 6, bevelEnabled: false }), R() < 0.5 ? farMat : propMat);
    m.position.set(x, groundY(x) - 6 - R() * 6, -45 - R() * 30); world.add(m);
  }
  const cloud = ink(0xffffff, { shade: 0xb8c8f0 });
  for (let x = -40; x < L.finish + 60; x += 25 + R() * 25) {
    const g = new THREE.Group(); g.position.set(x, 18 + R() * 12, -60 - R() * 20);
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry(2.5 + R() * 2, 14, 10), cloud); s.position.set(k * 3 - 4.5, R() * 1.5, 0); g.add(s); }
    world.add(g);
  }
  const cact = ink(0x3fbf6a, { shade: 0x5a7a90 });
  for (let x = -20; x < L.finish + 40; x += 6 + R() * 10) {
    const y = groundY(x); if (y < -1e8) continue;
    const g = new THREE.Group(); g.position.set(x, y, -5 - R() * 6);
    if (R() < 0.6) { const t = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 2.2, 4, 10), cact); t.position.y = 1.2; const a = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.8, 4, 8), cact); a.position.set(0.55, 1.6, 0); g.add(t, a); }
    else { const rk = new THREE.Mesh(new THREE.DodecahedronGeometry(0.6 + R() * 0.9), propMat); rk.position.y = 0.3; g.add(rk); }
    world.add(g);
  }
  bike = makeBike(); world.add(bike.g);
  // fx pools
  const puffGeo = new THREE.SphereGeometry(0.35, 10, 8), puffMat = ink(0xfff4dc, { shade: 0xc0a090 });
  fx.puffs = []; for (let k = 0; k < 40; k++) { const m = new THREE.Mesh(puffGeo, puffMat); m.visible = false; world.add(m); fx.puffs.push({ m, life: 0 }); }
  fx.boom = new THREE.Group(); const s1 = new THREE.Mesh(star(10, 2.4, 1.2), ink(0xffd23a)); const s2 = new THREE.Mesh(star(8, 1.4, 0.7), ink(0xff5a2a)); s2.position.z = 0.35; s2.rotation.z = 0.3;
  fx.boom.add(s1, s2); fx.boom.visible = false; world.add(fx.boom); fx.boomT = 9;
  fx.debris = []; for (let k = 0; k < 14; k++) { const m = box(0.25, 0.25, 0.25, k % 2 ? 0xff3a3a : 0x2a2633); m.visible = false; world.add(m); fx.debris.push({ m, vx: 0, vy: 0, life: 0 }); }
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function groundY(x) {
  let best = -1e9;
  for (const s of L.segs) { const x0 = Math.min(s[0], s[2]), x1 = Math.max(s[0], s[2]); if (x < x0 || x > x1 || x1 - x0 < 1e-6) continue; const t = (x - s[0]) / (s[2] - s[0]); best = Math.max(best, s[1] + (s[3] - s[1]) * t); }
  return best;
}
function slopeAt(x) { return Math.atan2(groundY(x + 0.6) - groundY(x - 0.6), 1.2); }
function nearest(px, py, out) {
  let bd = 1e9;
  for (const s of L.segs) {
    if (px < Math.min(s[0], s[2]) - 1.5 || px > Math.max(s[0], s[2]) + 1.5) continue;
    const dx = s[2] - s[0], dy = s[3] - s[1], l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - s[0]) * dx + (py - s[1]) * dy) / l2 : 0; t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s[0] + dx * t, qy = s[1] + dy * t, d = (px - qx) ** 2 + (py - qy) ** 2;
    if (d < bd) { bd = d; out[0] = qx; out[1] = qy; }
  }
  return Math.sqrt(bd);
}
const tmp = [0, 0];
const local = (lx, ly) => { const c = Math.cos(B.a), s = Math.sin(B.a); return [B.x + c * lx - s * ly, B.y + s * lx + c * ly]; };

// ---------- flow ----------
function startLevel(i) {
  S.level = i; L = buildLevel(i); buildWorld();
  $('pops').innerHTML = '';
  S.t = 0; S.bonus = 0; S.flipsTotal = 0; S.check = -1; S.crashes = 0; S.state = 'play';
  spawn(); S.camX = B.x; S.camY = B.y; hidePanels(); hud.name.textContent = (i + 1) + '. ' + L.name;
}
function spawn() {
  const cx = S.check < 0 ? 0 : L.checks[S.check][0];
  B.x = cx; B.y = groundY(cx) + 0.72; B.vx = B.vy = 0; B.a = slopeAt(cx); B.w = 0; B.g = [true, true];
  S.air = 0; S.rot = 0; S.pendFlip = 0; rag.on = false;
  if (bike) { bike.g.add(bike.rider); bike.rider.position.set(-0.25, 0.25, 0); bike.rider.rotation.set(0, 0, 0); }
  for (const o of L.obs) if (o.t === 'barrel') { o.dead = false; o.mesh.visible = true; }
}
function crash(why, bx, by) {
  if (S.state !== 'play') return;
  S.state = 'crash'; S.crashT = 0; S.crashes++; (S.log = S.log || []).push(why + '@' + B.x.toFixed(0)); S.pendFlip = 0; S.shake = 0.6;
  // detach rider
  const p = local(-0.1, 0.7);
  rag.on = true; rag.x = p[0]; rag.y = p[1]; rag.vx = B.vx * 0.8 + (why === 'boom' ? -4 : 0); rag.vy = B.vy * 0.5 + 6; rag.a = B.a; rag.w = (Math.random() - 0.5) * 14;
  world.add(bike.rider);
  if (why === 'boom') { boom(bx, by); pop('KA-BOOM!', 'big'); sfx.boom(); B.vy += 9; B.vx -= 5; B.w += 8; }
  else { pop(['OUCH!', 'BONK!', 'CRUNCH!', 'WHAM!'][Math.floor(Math.random() * 4)], 'bad'); sfx.crash(); }
}
function finish() {
  S.state = 'done'; sfx.finish();
  const total = Math.max(0, S.t - S.bonus * FLIP_BONUS);
  const stars = total <= L.par ? 3 : total <= L.par * 1.3 ? 2 : 1;
  const i = S.level;
  const newBest = !(save.best[i] > 0) || total < save.best[i];
  if (newBest) save.best[i] = +total.toFixed(2);
  save.stars[i] = Math.max(save.stars[i] || 0, stars);
  save.unlocked = Math.max(save.unlocked, Math.min(COUNT - 1, i + 1)); persist();
  S.lastResult = { total, stars, newBest };
  showResult(total, stars, newBest);
}

// ---------- physics ----------
function botInput() {
  const g = B.g[0] || B.g[1];
  const ahead = B.x + Math.max(1, B.vx * (g ? 0.15 : 0.35));
  let tgt = groundY(ahead) > -1e8 ? slopeAt(ahead) : -0.25;
  if (!g) tgt = Math.max(-0.5, Math.min(0.4, tgt));
  let da = B.a - tgt; da = Math.atan2(Math.sin(da), Math.cos(da));
  input.gas = 1; input.brake = 0;
  for (const o of L.obs) if (o.t === 'hammer' && o.x - B.x > 2.5 && o.x - B.x < 12) {
    const dx = o.x - B.x, v = Math.max(4, (B.vx + Math.min(VMAX, Math.sqrt(B.vx * B.vx + 24 * dx))) / 2), ta = dx / v;
    for (let dd = -0.2; dd <= 0.2; dd += 0.05) { const an = Math.sin((S.time + ta + dd) * o.sp + o.ph) * 1.15; if (Math.abs(5.6 * Math.sin(an) - v * dd) < 2.3) { input.gas = 0; input.brake = 1; break; } }
  }
  input.lean = Math.max(-1, Math.min(1, -da * 3 - B.w * 0.7));
}
function physics(dt) {
  if (S.state === 'play' && S.bot) botInput();
  const live = S.state === 'play';
  const gas = live ? input.gas : 0, brake = live ? input.brake : 0, lean = live ? input.lean : 0;
  B.vy -= G_ * dt;
  const grounded = B.g[0] || B.g[1];
  if (live && (B.g[0] || B.g[1])) {
    const n = B.g[0] ? B.n[0] : B.n[1], tx = n[1], ty = -n[0];
    const along = B.vx * tx + B.vy * ty;
    if (gas && B.g[0]) { const a = ACC * (1 - Math.max(0, along) / VMAX); B.vx += tx * a * dt; B.vy += ty * a * dt; }
    if (brake) { if (along > 0.3) { const d = Math.min(along, 30 * dt); B.vx -= tx * d; B.vy -= ty * d; } else if (along > -5) { B.vx -= tx * 8 * dt; B.vy -= ty * 8 * dt; } }
    if (!gas && !brake) { B.vx *= 1 - 0.25 * dt; }
  }
  B.w += lean * (grounded ? 8 : 12) * dt;
  B.w *= 1 - (grounded ? 1.5 : 0.25) * dt;
  B.w = Math.max(-8.5, Math.min(8.5, B.w));
  B.x += B.vx * dt; B.y += B.vy * dt; B.a += B.w * dt;
  if (!grounded) S.rot += B.w * dt;
  for (let k = 0; k < 2; k++) {
    const c = local(OFF[k][0], OFF[k][1]);
    const d = nearest(c[0], c[1], tmp);
    B.g[k] = d < WR + 0.06;
    if (d < WR && d > 1e-5) {
      const nx = (c[0] - tmp[0]) / d, ny = (c[1] - tmp[1]) / d, pen = WR - d;
      B.x += nx * pen; B.y += ny * pen; B.n[k] = [nx, ny];
      const rx = c[0] - B.x, ry = c[1] - B.y;
      const vpx = B.vx - B.w * ry, vpy = B.vy + B.w * rx, vn = vpx * nx + vpy * ny;
      if (vn < 0) {
        const rn = rx * ny - ry * nx, kk = 1 / MASS + rn * rn / INER, j = -(1.1 * vn) / kk;
        B.vx += nx * j / MASS; B.vy += ny * j / MASS; B.w += rn * j / INER;
        if (vn < -9 && live) { sfx.land(); dust(c[0], c[1] - WR, 6); S.shake = Math.max(S.shake, 0.15); }
      }
    } else if (B.g[k]) B.n[k] = [(c[0] - tmp[0]) / d, (c[1] - tmp[1]) / d];
    B.spin[k] -= (B.vx * Math.cos(B.a) + B.vy * Math.sin(B.a)) * dt / WR;
  }
  const nowG = B.g[0] || B.g[1];
  if (!nowG) S.air += dt;
  else {
    if (S.air > 0.3 && live) {
      const f = Math.floor((Math.abs(S.rot) + 0.8) / (Math.PI * 2));
      if (f > 0) { S.pendFlip = f; S.pendT = 0.18; S.pendBack = S.rot > 0; }
    }
    S.air = 0; S.rot = 0;
  }
  if (S.state === 'done') { B.vx *= 1 - 2.5 * dt; B.w *= 1 - 3 * dt; }
  if (!live) return;
  if (gas && B.g[0] && Math.random() < 0.15) { const c = local(OFF[0][0], OFF[0][1]); dust(c[0] - 0.3, c[1] - WR + 0.1, 1); }
  // crash tests
  const h = local(HEAD[0], HEAD[1]), t = local(TORSO[0], TORSO[1]);
  if (nearest(h[0], h[1], tmp) < 0.3 || nearest(t[0], t[1], tmp) < 0.22) return crash('head');
  const pts = [h, t, local(OFF[0][0], OFF[0][1]), local(OFF[1][0], OFF[1][1]), [B.x, B.y]];
  for (const o of L.obs) {
    if (o.t === 'barrel') {
      if (o.dead) continue;
      for (const p of pts) if (Math.abs(p[0] - o.x) < 0.95 && p[1] > o.y - 0.3 && p[1] < o.y + 1.6) { o.dead = true; o.mesh.visible = false; return crash('boom', o.x, o.y + 0.6); }
    } else {
      const hx = o.x + Math.sin(o.ang) * 5.6, hy = o.y + 7.5 - Math.cos(o.ang) * 5.6;
      for (const p of pts) if ((p[0] - hx) ** 2 + (p[1] - hy) ** 2 < 1.1 ** 2) { B.vx += Math.cos(o.ang) * o.sp * 6; B.vy += 4; return crash('hammer'); }
    }
  }
  for (const [x0, x1, y] of L.pits) if (B.x > x0 && B.x < x1 && B.y < y - 2.6) return crash('pit');
  if (B.y < L.minY - 20) return crash('pit');
  if (S.check + 1 < L.checks.length && B.x > L.checks[S.check + 1][0]) { S.check++; sfx.check(); pop('CHECKPOINT!', 'ok'); }
  if (B.x > L.finish) finish();
}
function ragdoll(dt) {
  if (!rag.on) return;
  rag.vy -= G_ * dt; rag.x += rag.vx * dt; rag.y += rag.vy * dt; rag.a += rag.w * dt;
  const d = nearest(rag.x, rag.y, tmp);
  if (d < 0.4 && d > 1e-5) {
    const nx = (rag.x - tmp[0]) / d, ny = (rag.y - tmp[1]) / d; rag.x += nx * (0.4 - d); rag.y += ny * (0.4 - d);
    const vn = rag.vx * nx + rag.vy * ny; if (vn < 0) { rag.vx -= 1.4 * vn * nx; rag.vy -= 1.4 * vn * ny; rag.vx *= 0.8; rag.w *= 0.7; }
  }
}

function step(dt) {
  // dt = 1/60 frame
  if (S.state === 'play' || S.state === 'crash' || S.state === 'done') {
    for (const o of L.obs) if (o.t === 'hammer') { o.ang = Math.sin(S.time * o.sp + o.ph) * 1.15; o.arm.rotation.z = o.ang; }
    const sub = 4, h = dt / sub;
    for (let k = 0; k < sub; k++) { physics(h); ragdoll(h); }
    if (S.state === 'play') S.t += dt;
    if (S.pendFlip && S.state === 'play') {
      S.pendT -= dt;
      if (S.pendT <= 0) {
        const f = S.pendFlip; S.pendFlip = 0; S.bonus += f; S.flipsTotal += f;
        pop((f > 1 ? f + 'x ' : '') + (S.pendBack ? 'BACKFLIP!' : 'FRONTFLIP!') + '  -' + (f * FLIP_BONUS).toFixed(0) + 's', 'flip');
        sfx.flip(f); S.flash = 0.25; S.slow = 0.3;
      }
    }
    if (S.state === 'crash') { S.crashT += dt; if (S.crashT > 1.4) { S.state = 'play'; spawn(); } }
  }
  S.time += dt;
  // fx
  for (const p of fx.puffs) if (p.life > 0) { p.life -= dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; const s = Math.max(0.01, (1 - p.life / 0.6) * 1.6 * Math.min(1, p.life * 4)); p.m.scale.setScalar(s); p.m.visible = p.life > 0; }
  if (fx.boomT < 0.6) { fx.boomT += dt; const k = fx.boomT / 0.6; fx.boom.scale.setScalar(Math.sin(Math.min(1, k * 1.6) * Math.PI / 2) * (1 - Math.max(0, k - 0.7) / 0.3) + 0.01); fx.boom.rotation.z += dt * 2; fx.boom.visible = k < 1; }
  for (const d of fx.debris) if (d.life > 0) { d.life -= dt; d.vy -= G_ * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.rotation.x += dt * 9; d.m.rotation.z += dt * 7; d.m.visible = d.life > 0; }
  S.shake *= Math.pow(0.02, dt); S.flash *= Math.pow(0.001, dt); S.slow = Math.max(0, S.slow - dt);
}
function dust(x, y, n) {
  for (let k = 0; k < n; k++) { const p = fx.puffs.find((q) => q.life <= 0); if (!p) return; p.life = 0.6; p.m.position.set(x, y, (Math.random() - 0.5) * 0.8); p.vx = -1 - Math.random() * 2; p.vy = 0.5 + Math.random(); p.m.visible = true; }
}
function boom(x, y) {
  fx.boom.position.set(x, y, 0.8); fx.boomT = 0; fx.boom.visible = true; S.flash = 0.6; S.shake = 1.2;
  for (const d of fx.debris) { d.life = 1.2; d.m.position.set(x, y, (Math.random() - 0.5)); d.vx = (Math.random() - 0.5) * 16; d.vy = 5 + Math.random() * 10; d.m.visible = true; }
  dust(x, y, 10);
}

// ---------- render sync ----------
function sync() {
  if (!L) return;
  bike.g.position.set(B.x, B.y, 0); bike.g.rotation.z = B.a;
  bike.wheels[0].rotation.z = B.spin[0]; bike.wheels[1].rotation.z = B.spin[1];
  if (rag.on) { bike.rider.position.set(rag.x, rag.y, 0); bike.rider.rotation.z = rag.a; }
  else bike.rider.rotation.z = input.lean * 0.18 * (S.state === 'play' ? 1 : 0);
  for (let k = 0; k < L.flags.length; k++) { const f = L.flags[k].userData.flag; f.rotation.y = Math.sin(S.time * 4 + k) * 0.3; f.material = ink(k <= S.check ? 0x52e06a : 0xffd23a); }
  const speed = Math.hypot(B.vx, B.vy);
  S.lead += (Math.max(-2, Math.min(7, B.vx * 0.32)) - S.lead) * 0.04;
  const tx = (rag.on && S.state === 'crash' ? (B.x + rag.x) / 2 : B.x) + S.lead, ty = B.y + 1.4;
  S.camX += (tx - S.camX) * 0.12; S.camY += (ty - S.camY) * 0.08;
  const z = 14.5 + speed * 0.24 - (S.slow > 0 ? 2 : 0);
  const sh = S.shake * 0.6;
  cam.position.set(S.camX + (Math.random() - 0.5) * sh, S.camY + 2.6 + (Math.random() - 0.5) * sh, z);
  cam.lookAt(S.camX, S.camY + 0.6, 0);
  post.u.uFlash.value = Math.min(0.7, S.flash);
  // hud
  const total = Math.max(0, S.t - S.bonus * FLIP_BONUS);
  hud.time.textContent = total.toFixed(2);
  hud.flips.textContent = 'FLIPS ' + S.flipsTotal;
  hud.prog.style.width = Math.max(0, Math.min(100, B.x / L.finish * 100)) + '%';
  engine(S.state === 'play', speed, input.gas);
}

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const hud = { time: $('time'), flips: $('flips'), name: $('lvname'), prog: $('progbar') };
function pop(text, cls) {
  const d = document.createElement('div'); d.className = 'pop ' + (cls || ''); d.textContent = text;
  d.style.setProperty('--r', ((Math.random() - 0.5) * 14).toFixed(1) + 'deg');
  $('pops').appendChild(d); setTimeout(() => d.remove(), 1300);
}
function hidePanels() { for (const p of document.querySelectorAll('.panel')) p.hidden = true; $('hud').hidden = false; }
function showResult(total, stars, newBest) {
  const p = $('result'); p.hidden = false;
  $('rTitle').textContent = S.level === COUNT - 1 ? 'YOU BEAT IT ALL!' : 'STAGE CLEAR!';
  $('rStars').innerHTML = [0, 1, 2].map((k) => `<span class="st ${k < stars ? 'on' : ''}" style="animation-delay:${0.2 + k * 0.25}s">&#9733;</span>`).join('');
  for (let k = 0; k < stars; k++) setTimeout(() => sfx.star(k), 250 + k * 250);
  $('rStats').innerHTML = `TIME <b>${S.t.toFixed(2)}</b> &nbsp; FLIPS <b>${S.flipsTotal}</b> (-${(S.bonus * FLIP_BONUS).toFixed(0)}s)<br>FINAL <b>${total.toFixed(2)}</b>${newBest ? ' <i>NEW BEST!</i>' : ''} &nbsp; 3&#9733; under ${L.par.toFixed(1)}<br>CRASHES <b>${S.crashes}</b>`;
  $('bNext').hidden = S.level >= COUNT - 1;
}
function showMenu() {
  S.state = 'menu'; for (const p of document.querySelectorAll('.panel')) p.hidden = true; $('menu').hidden = false; $('hud').hidden = true;
  const grid = $('grid'); grid.innerHTML = '';
  const total = save.stars.reduce((a, b) => a + (b || 0), 0); $('starTotal').textContent = total + ' / ' + COUNT * 3 + ' ★';
  for (let i = 0; i < COUNT; i++) {
    const b = document.createElement('button'); const locked = i > save.unlocked;
    b.className = 'lv' + (locked ? ' locked' : '');
    b.innerHTML = `<span class="n">${i + 1}</span><span class="t">${NAMES[i]}</span><span class="s">${'★'.repeat(save.stars[i] || 0)}${'☆'.repeat(3 - (save.stars[i] || 0))}</span>`;
    b.onclick = () => { if (locked) return; sfx.click(); startLevel(i); };
    grid.appendChild(b);
  }
  if (!L) { L = buildLevel(0); buildWorld(); spawn(); S.camX = B.x; S.camY = B.y; }
}
function pause(on) {
  if (on && S.state === 'play') { S.state = 'pause'; $('pause').hidden = false; }
  else if (!on && S.state === 'pause') { S.state = 'play'; $('pause').hidden = true; }
}
$('bNext').onclick = () => { sfx.click(); startLevel(Math.min(COUNT - 1, S.level + 1)); };
$('bRetry').onclick = () => { sfx.click(); startLevel(S.level); };
$('bLevels').onclick = () => { sfx.click(); showMenu(); };
$('bResume').onclick = () => pause(false);
$('bQuit').onclick = () => showMenu();
$('bPause').onclick = () => pause(S.state !== 'pause');

const keys = {};
addEventListener('keydown', (e) => {
  unlock(); keys[e.code] = true;
  if (e.code === 'KeyR' && (S.state === 'play' || S.state === 'crash' || S.state === 'done')) startLevel(S.level);
  if (e.code === 'Escape' || e.code === 'KeyP') pause(S.state !== 'pause');
  if (S.state === 'done') { if (e.code === 'Enter' || e.code === 'Space') $('bNext').hidden ? showMenu() : startLevel(S.level + 1); if (e.code === 'KeyL') showMenu(); }
  if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', unlock);
addEventListener('blur', () => { for (const k in keys) keys[k] = false; pause(true); });
const touch = { gas: 0, brake: 0, back: 0, fwd: 0 };
for (const b of document.querySelectorAll('[data-t]')) {
  const k = b.dataset.t;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); unlock(); touch[k] = 1; b.classList.add('on'); b.setPointerCapture(e.pointerId); });
  const up = () => { touch[k] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up);
}
if (Q.has('touch') || matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
function readInput() {
  if (S.bot) return;
  input.gas = (keys.ArrowUp || keys.KeyW || touch.gas) ? 1 : 0;
  input.brake = (keys.ArrowDown || keys.KeyS || touch.brake) ? 1 : 0;
  input.lean = ((keys.ArrowLeft || keys.KeyA || touch.back) ? 1 : 0) - ((keys.ArrowRight || keys.KeyD || touch.fwd) ? 1 : 0);
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (S.slow > 0) dt *= 0.45;
  readInput();
  if (S.state !== 'pause' && S.state !== 'menu') { acc += dt; while (acc >= 1 / 60) { step(1 / 60); acc -= 1 / 60; } }
  else S.time += dt;
  sync();
  post.render(scene, cam, S.time);
}

// test hooks
window.__G = {
  S, B, input, get L() { return L; }, startLevel, showMenu, COUNT, save,
  fast(sec) { const n = Math.round(sec * 60); for (let k = 0; k < n; k++) { if (S.state === 'done' || S.state === 'menu') break; step(1 / 60); } sync(); },
  setBot(on) { S.bot = on; },
};

if (Q.has('title')) showMenu();
else { let i = 0; while (i < save.unlocked && save.stars[i]) i++; startLevel(Q.has('level') ? Math.max(0, Math.min(COUNT - 1, +Q.get('level'))) : i); }
requestAnimationFrame(frame);
