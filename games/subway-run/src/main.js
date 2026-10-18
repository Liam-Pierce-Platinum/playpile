// SUBWAY RUN - endless 3-lane train-yard runner, graffiti cel look.
import * as THREE from '../vendor/three.module.js';
import * as X from './gfx.js';
import * as A from './audio.js';

const Q = new URLSearchParams(location.search);
let seed = +(Q.get('seed') || 0) || ((Math.random() * 1e9) | 0);
function rng() { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
if (Q.get('mute')) A.setMute(true);

// ---------- save ----------
const SKEY = 'subwayrun.v1';
const save = { best: 0, bank: 0, rank: 0, done: [0, 0, 0], up: { magnet: 0, sneak: 0, x2: 0 } };
try { const s = JSON.parse(localStorage.getItem(SKEY) || '{}'); Object.assign(save, s); save.up = Object.assign({ magnet: 0, sneak: 0, x2: 0 }, s.up); } catch (e) {}
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) {} };

// ---------- renderer ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 600);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 82 : 68; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const sky = X.makeSky(); scene.add(sky);
const T = X.textures();

const LANES = [-2.4, 0, 2.4], TH = 3.4, TL = 14, SEG = 24, NSEG = 10;
const GEO = {
  train: new THREE.BoxGeometry(2, TH, TL - 0.5), ramp: new THREE.BoxGeometry(1.9, 0.25, Math.hypot(6, TH)),
  plank: new THREE.BoxGeometry(2.1, 0.5, 0.22), postS: new THREE.BoxGeometry(0.16, 0.95, 0.16), postT: new THREE.BoxGeometry(0.16, 2.8, 0.16),
  bar: new THREE.BoxGeometry(2.3, 1.15, 0.28), block: new THREE.BoxGeometry(2.0, 2.4, 0.9),
  coin: new THREE.CylinderGeometry(0.4, 0.4, 0.1, 20).rotateX(Math.PI / 2), can: new THREE.CylinderGeometry(0.3, 0.3, 0.8, 16), cap: new THREE.CylinderGeometry(0.16, 0.2, 0.22, 12),
  wall: new THREE.BoxGeometry(0.6, 5.5, SEG), pole: new THREE.BoxGeometry(0.3, 7.5, 0.3), beam: new THREE.BoxGeometry(13.5, 0.35, 0.35),
};
const M = {
  side: T.trainSide.map((t) => X.toon('#fff', t)), front: T.trainFront.map((t) => X.toon('#fff', t)), frontLit: T.trainFront.map((t) => X.toon('#fff', t, 0.35)),
  roof: X.toon('#9590ae'), under: X.toon('#221a30'), stripe: X.toon('#fff', T.stripe), stripeY: X.toon('#fff', T.stripeY),
  post: X.toon('#3b3350'), block: T.wall.map((t) => X.toon('#cfcadf', t)), coin: X.toon('#ffc93c', null, 0.3),
  wall: T.wall.map((t) => X.toon('#fff', t)), conc: X.toon('#4a4660'), pole: X.toon('#2c2540'),
  pw: { magnet: X.toon('#ff3d55', null, 0.3), sneak: X.toon('#5dff6a', null, 0.3), x2: X.toon('#ffe14d', null, 0.3) }, capm: X.toon('#f4f1ea'),
};
const PWN = { magnet: 'MAGNET', sneak: 'SPRING KICKS', x2: '2X SCORE' };

// ---------- static environment (recycled) ----------
const ground = new THREE.Mesh(new THREE.PlaneGeometry(12, 312).rotateX(-Math.PI / 2), X.toon('#fff', T.ground));
{ const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * 52); }
scene.add(ground);
const dirt = new THREE.Mesh(new THREE.PlaneGeometry(200, 400).rotateX(-Math.PI / 2), X.toon('#3b2f45')); dirt.position.y = -0.02; scene.add(dirt);
const segs = [];
for (let i = 0; i < NSEG; i++) {
  const g = new THREE.Group();
  for (const s of [-1, 1]) { const w = new THREE.Mesh(GEO.wall, M.conc); w.position.set(s * 6.6, 2.75, 0); g.add(w); w.userData.s = s; }
  const p1 = new THREE.Mesh(GEO.pole, M.pole); p1.position.set(-6.1, 3.75, 0); const p2 = p1.clone(); p2.position.x = 6.1;
  const b = new THREE.Mesh(GEO.beam, M.pole); b.position.set(0, 7.3, 0); g.add(p1, p2, b); X.addOutline(b, 0.05, 1);
  g.position.z = -i * SEG; skinSeg(g); scene.add(g); segs.push(g);
}
function skinSeg(g) { for (const w of g.children) if (w.userData.s) { const m = M.wall[(Math.random() * 3) | 0]; w.material = w.userData.s < 0 ? [m, M.conc, M.conc, M.conc, M.conc, M.conc] : [M.conc, m, M.conc, M.conc, M.conc, M.conc]; } }
const blds = [];
for (let i = 0; i < 36; i++) {
  const w = 6 + Math.random() * 8, h = 10 + Math.random() * 34, d = 8 + Math.random() * 8;
  const geo = new THREE.BoxGeometry(w, h, d); const uv = geo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * w / 8, uv.getY(k) * h / 8);
  const m = new THREE.Mesh(geo, X.toon(['#ffffff', '#ffd9e8', '#d9f2ff'][i % 3], T.windows)); const s = i % 2 ? 1 : -1;
  m.position.set(s * (13 + Math.random() * 14 + w / 2), h / 2 - 1, -(i >> 1) * 14); scene.add(m); blds.push(m);
}

// ---------- runner ----------
function makeRunner() {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const hood = X.toon('#ff6a2b'), jeans = X.toon('#2f4fa8'), skin = X.toon('#b97a52'), cap = X.toon('#1fd1b5'), shoe = X.toon('#f4f1ea'), pack = X.toon('#ffd23f');
  const part = (geo, mat, x, y, z, par = body) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); X.addOutline(m, 0.035, 0); par.add(m); return m; };
  part(new THREE.CapsuleGeometry(0.3, 0.42, 4, 10), hood, 0, 1.15, 0);
  part(new THREE.SphereGeometry(0.24, 14, 12), skin, 0, 1.66, 0);
  part(new THREE.SphereGeometry(0.255, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), cap, 0, 1.7, 0);
  part(new THREE.BoxGeometry(0.34, 0.05, 0.26), cap, 0, 1.72, 0.25);
  part(new THREE.BoxGeometry(0.42, 0.46, 0.2), pack, 0, 1.2, 0.3);
  const legs = [], arms = [];
  for (const s of [-1, 1]) {
    const hip = new THREE.Group(); hip.position.set(s * 0.14, 0.8, 0); body.add(hip);
    part(new THREE.CapsuleGeometry(0.11, 0.42, 4, 8), jeans, 0, -0.33, 0, hip); part(new THREE.BoxGeometry(0.2, 0.14, 0.36), shoe, 0, -0.7, -0.05, hip); legs.push(hip);
    const sh = new THREE.Group(); sh.position.set(s * 0.37, 1.4, 0); body.add(sh);
    part(new THREE.CapsuleGeometry(0.09, 0.38, 4, 8), hood, 0, -0.26, 0, sh); part(new THREE.SphereGeometry(0.1, 8, 6), skin, 0, -0.55, 0, sh); arms.push(sh);
  }
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a0f28, transparent: true, opacity: 0.45, depthWrite: false }));
  scene.add(blob); scene.add(root);
  return { root, body, legs, arms, blob };
}
const R = makeRunner();

// ---------- particles ----------
const parts = [];
for (let i = 0; i < 90; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: T.dot, transparent: true, depthWrite: false })); s.visible = false; s.userData = { v: new THREE.Vector3(), life: 0, max: 1 }; scene.add(s); parts.push(s); }
let pi = 0;
function burst(x, y, z, col, n = 10, sp = 4, size = 0.5, life = 0.6) {
  for (let i = 0; i < n; i++) { const s = parts[pi++ % parts.length]; s.visible = true; s.position.set(x, y, z); s.material.color.set(col); s.material.opacity = 1;
    s.userData.v.set((Math.random() - 0.5) * sp, Math.random() * sp * 0.8, (Math.random() - 0.5) * sp); s.userData.life = s.userData.max = life * (0.6 + Math.random() * 0.6); s.userData.size = size * (0.6 + Math.random() * 0.8); }
}
function stepParts(dt) { for (const s of parts) { if (!s.visible) continue; const u = s.userData; u.life -= dt; if (u.life <= 0) { s.visible = false; continue; }
  s.position.addScaledVector(u.v, dt); u.v.y -= 6 * dt; const k = u.life / u.max; s.material.opacity = k; s.scale.setScalar(u.size * (1.4 - k * 0.6)); } }

// ---------- state ----------
const P = { lane: 1, prev: 1, x: 0, y: 0, vy: 0, z: 0, ground: true, roll: 0, stumble: 0, cd: 0, phase: 0, rot: 0 };
const S = { state: 'menu', speed: 14, dist: 0, score: 0, coins: 0, streak: 0, streakT: 0, pw: { magnet: 0, sneak: 0, x2: 0 }, jumps: 0, rolls: 0, pws: 0, roof: 0, deadT: 0, shake: 0, t: 0, newBest: false };
let obs = [], coins = [], pwups = [], nextZ = -30, express = [0, 0, 0], sinceRoof = 0, lastHorn = 0;
const G = window.__G = { S, P, save, obs, manual: false, auto: Q.has('bot') };

// ---------- missions / progression ----------
const MT = [
  (r) => ({ k: 'coins', n: 60 + 45 * r, t: (n) => `Grab ${n} coins in one run` }),
  (r) => ({ k: 'jumps', n: 12 + 6 * r, t: (n) => `Jump ${n} times in one run` }),
  (r) => ({ k: 'score', n: 1500 + 1500 * r, t: (n) => `Score ${n} in one run` }),
  (r) => ({ k: 'rolls', n: 8 + 5 * r, t: (n) => `Roll ${n} times in one run` }),
  (r) => ({ k: 'pws', n: 1 + r, t: (n) => `Grab ${n} power-ups in one run` }),
  (r) => ({ k: 'roof', n: 120 + 90 * r, t: (n) => `Run ${n}m on train roofs` }),
];
const missions = () => { const r = save.rank; return [r % 6, (r + 2) % 6, (r + 4) % 6].map((i) => { const m = MT[i](r); m.text = m.t(m.n); return m; }); };
let MS = missions();
const metric = (k) => (k === 'score' ? S.score : S[k]);
function checkMissions() {
  MS.forEach((m, i) => { if (!save.done[i] && metric(m.k) >= m.n) { save.done[i] = 1; toast('TAG DONE: ' + m.text); A.sfx('mission'); } });
  if (save.done.every((d) => d)) { save.rank++; save.done = [0, 0, 0]; MS = missions(); toast(`RANK UP! SCORE x${save.rank + 1}`); A.sfx('power'); burst(P.x, P.y + 1.5, P.z, '#ffe14d', 24, 7); }
  persist();
}
const upCost = (k) => 150 * (save.up[k] + 1) * (save.up[k] + 1);
const pwDur = (k) => 8 + 2.5 * save.up[k];

// ---------- spawning ----------
function addOb(o) { scene.add(o.g); obs.push(o); return o; }
function train(l, zf, cars, vz = 0, ramp = false) {
  const g = new THREE.Group(), v = (rng() * 4) | 0;
  for (let i = 0; i < cars; i++) {
    const fr = vz ? M.frontLit[v] : M.front[v];
    const m = new THREE.Mesh(GEO.train, [M.side[v], M.side[v], M.roof, M.under, fr, M.front[v]]);
    m.position.set(0, TH / 2, -TL / 2 - i * TL); X.addOutline(m, 0.06, 1); g.add(m);
  }
  if (ramp) { const r = new THREE.Mesh(GEO.ramp, M.stripeY); r.position.set(0, TH / 2, 3); r.rotation.x = Math.atan2(TH, 6); X.addOutline(r, 0.05, 1); g.add(r); }
  g.position.set(LANES[l], 0, zf);
  return addOb({ type: 'train', l, x: LANES[l], zMin: zf - cars * TL, zMax: zf, top: TH, vz, ramp, g });
}
function barrier(l, z, kind) {
  const g = new THREE.Group(); let o;
  if (kind === 'low') { const p = new THREE.Mesh(GEO.plank, M.stripe); p.position.y = 0.75; X.addOutline(p, 0.04, 1); g.add(p);
    for (const s of [-1, 1]) { const q = new THREE.Mesh(GEO.postS, M.post); q.position.set(s * 0.9, 0.47, 0); g.add(q); } o = { yMin: 0, yMax: 1.0, h: 0.3 }; }
  else if (kind === 'high') { const b = new THREE.Mesh(GEO.bar, M.stripe); b.position.y = 1.95; X.addOutline(b, 0.04, 1); g.add(b);
    for (const s of [-1, 1]) { const q = new THREE.Mesh(GEO.postT, M.post); q.position.set(s * 1.07, 1.4, 0); X.addOutline(q, 0.03, 1); g.add(q); } o = { yMin: 1.35, yMax: 2.6, h: 0.3 }; }
  else { const b = new THREE.Mesh(GEO.block, M.block[(rng() * 3) | 0]); b.position.y = 1.2; X.addOutline(b, 0.05, 1); g.add(b); o = { yMin: 0, yMax: 2.4, h: 0.45 }; }
  g.position.set(LANES[l], 0, z);
  return addOb(Object.assign(o, { type: kind, l, x: LANES[l], zMin: z - o.h, zMax: z + o.h, g }));
}
function coin(x, y, z) { const m = new THREE.Mesh(GEO.coin, M.coin); X.addOutline(m, 0.03, 0); m.position.set(x, y, z); scene.add(m); coins.push({ m, pull: false }); }
function pwup(x, z, k) {
  const g = new THREE.Group(); const c = new THREE.Mesh(GEO.can, M.pw[k]); X.addOutline(c, 0.04, 0); const t = new THREE.Mesh(GEO.cap, M.capm); t.position.y = 0.5; X.addOutline(t, 0.03, 0);
  g.add(c, t); g.rotation.z = 0.3; g.position.set(x, 1.1, z); scene.add(g); pwups.push({ g, k });
}
function genRow(z) {
  const d = Math.min(1, S.dist / 1800);
  if (sinceRoof > 4 && express.every((e) => e <= 0) && rng() < 0.16 + d * 0.1) {
    sinceRoof = 0; const ramp = (rng() * 3) | 0;
    for (let l = 0; l < 3; l++) { train(l, z - 6, 2, 0, l === ramp); for (let k = 0; k < 9; k++) coin(LANES[l], TH + 1, z - 9 - k * 2.6); }
    for (let k = 0; k < 3; k++) coin(LANES[ramp], 1 + k * 1.1, z - 0.5 - k * 2);
    return 6 + TL * 2 + 10 + S.speed * 0.5;
  }
  sinceRoof++;
  const W = [['none', 0.3], ['low', 0.17], ['high', 0.14], ['block', 0.12], ['train', 0.19], ['ramp', 0.08], ['moving', d > 0.12 ? 0.07 : 0]];
  const pick = () => { let x = rng() * W.reduce((s, a) => s + a[1], 0); for (const [k, v] of W) if ((x -= v) < 0) return k; return 'none'; };
  const L = [0, 1, 2].map((l) => { if (express[l] > 0) { express[l]--; return express[l] === 0 ? 'moving' : 'none'; } let p = pick(); if (p === 'moving') { if (express.some((e) => e > 0)) p = 'train'; else { express[l] = 3; p = 'none'; } } return p; });
  const ok = (t) => t === 'none' || t === 'low' || t === 'high' || t === 'ramp';
  if (!L.some(ok)) { const f = [0, 1, 2].filter((l) => L[l] !== 'moving' && express[l] <= 0); L[f.length ? f[(rng() * f.length) | 0] : 1] = 'none'; }
  let len = 4;
  L.forEach((t, l) => {
    if (t === 'low' || t === 'high' || t === 'block') barrier(l, z, t);
    else if (t === 'train') { const c = rng() < 0.4 ? 2 : 1; train(l, z, c); len = Math.max(len, c * TL); }
    else if (t === 'ramp') { train(l, z - 6, 1, 0, true); len = Math.max(len, TL + 6); }
    else if (t === 'moving') { train(l, z, 1, 9); len = Math.max(len, TL); }
  });
  const cl = [0, 1, 2].filter((l) => ok(L[l]) && express[l] <= 0);
  if (cl.length) {
    const l = cl[(rng() * cl.length) | 0], x = LANES[l], t = L[l];
    if (t === 'none' && rng() < 0.08 + 0.02 * save.rank) pwup(x, z, ['magnet', 'sneak', 'x2'][(rng() * 3) | 0]);
    else if (t === 'none') for (let k = 0; k < 6; k++) coin(x, 1, z + 4 - k * 2.2);
    else if (t === 'low') for (let k = 0; k < 7; k++) coin(x, 1 + 1.6 * Math.sin((Math.PI * k) / 6), z + 6 - k * 2);
    else if (t === 'high') for (let k = 0; k < 5; k++) coin(x, 0.6, z + 4 - k * 2);
    else if (t === 'ramp') for (let k = 0; k < 9; k++) { const zz = z - k * 2.2; coin(x, zz > z - 6 ? 1 + TH * (z - zz) / 6 : TH + 1, zz); }
  }
  return len + 9 + S.speed * 0.45;
}
function clearWorld() { for (const o of obs) scene.remove(o.g); for (const c of coins) scene.remove(c.m); for (const p of pwups) scene.remove(p.g); obs = G.obs = []; coins = []; pwups = []; }

// ---------- control ----------
function act(a) {
  A.init();
  if (S.state === 'over' || S.state === 'menu') { if (a === 'go') start(); return; }
  if (S.state !== 'play') return;
  if (a === 'left' && P.lane > 0) { P.prev = P.lane; P.lane--; A.sfx('swish'); }
  else if (a === 'right' && P.lane < 2) { P.prev = P.lane; P.lane++; A.sfx('swish'); }
  else if (a === 'jump' && P.ground) { P.vy = S.pw.sneak > 0 ? 19 : 13.2; P.ground = false; P.roll = 0; S.jumps++; A.sfx(S.pw.sneak > 0 ? 'boing' : 'jump'); burst(P.x, P.y + 0.1, P.z, '#ffffff', 6, 3, 0.6, 0.4); }
  else if (a === 'roll' && P.roll <= 0.1) { if (!P.ground) P.vy = -26; P.roll = 0.65; S.rolls++; A.sfx('roll'); }
}
G.act = act;
const KEYS = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowUp: 'jump', KeyW: 'jump', Space: 'jump', ArrowDown: 'roll', KeyS: 'roll' };
addEventListener('keydown', (e) => {
  if (e.code === 'KeyM') { A.init(); A.setMute(!A.isMuted()); muteBtn(); return; }
  if ((e.code === 'Enter' || e.code === 'Space') && S.state !== 'play') { e.preventDefault(); act('go'); return; }
  const a = KEYS[e.code]; if (a) { e.preventDefault(); if (!e.repeat) act(a); }
});
let tp = null;
canvas.addEventListener('pointerdown', (e) => { tp = { x: e.clientX, y: e.clientY, done: false }; A.init(); });
addEventListener('pointermove', (e) => { if (!tp || tp.done) return; const dx = e.clientX - tp.x, dy = e.clientY - tp.y; if (Math.hypot(dx, dy) > 28) { tp.done = true; act(Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : dy < 0 ? 'jump' : 'roll'); } });
addEventListener('pointerup', () => { if (tp && !tp.done && S.state === 'play') act('jump'); tp = null; });

// ---------- UI ----------
const $ = (id) => document.getElementById(id);
const hud = { score: $('score'), coins: $('coins').querySelector('span'), mult: $('mult'), pw: $('pw') };
let toastT = 0;
function toast(t) { const el = $('toast'); el.textContent = t; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); toastT = 2.4; }
function muteBtn() { $('mute').classList.toggle('off', A.isMuted()); }
$('mute').onclick = (e) => { e.stopPropagation(); A.init(); A.setMute(!A.isMuted()); muteBtn(); }; muteBtn();
function panel(kind) {
  const el = $('panel'); el.classList.remove('hide');
  const ups = Object.keys(PWN).map((k) => `<button class="up" data-up="${k}" ${save.bank < upCost(k) || save.up[k] >= 6 ? 'disabled' : ''}><b>${PWN[k]}</b><i>${'|'.repeat(save.up[k] + 1)}${'.'.repeat(6 - save.up[k])}</i><em>${save.up[k] >= 6 ? 'MAX' : upCost(k) + ' c'}</em></button>`).join('');
  const ms = MS.map((m, i) => `<li class="${save.done[i] ? 'ok' : ''}">${save.done[i] ? 'X' : ''}<span>${m.text}</span></li>`).join('');
  el.innerHTML = (kind === 'menu' ? `<h1 class="logo">SUBWAY<br><span>RUN</span></h1><p class="sub">dodge trains. ride roofs. tag the yard.</p>`
    : `<h1 class="logo small">BUSTED!</h1><div class="res"><div><small>SCORE</small><b>${Math.floor(S.score)}</b>${S.newBest ? '<em>NEW BEST</em>' : ''}</div><div><small>COINS</small><b>+${S.coins}</b></div><div><small>BEST</small><b>${Math.floor(save.best)}</b></div></div>`)
    + `<div class="rank">CREW RANK ${save.rank + 1} · SCORE x${save.rank + 1}</div><ul class="ms">${ms}</ul>`
    + `<div class="bank">BANK <b>${save.bank}</b> c</div><div class="ups">${ups}</div>`
    + `<button class="go" data-go>${kind === 'menu' ? 'RUN' : 'RUN AGAIN'}</button><p class="keys">← → switch · ↑ jump · ↓ roll · swipe on touch · M mute</p>`;
  el.querySelector('[data-go]').onclick = () => act('go');
  el.querySelectorAll('[data-up]').forEach((b) => (b.onclick = () => { const k = b.dataset.up; if (save.bank >= upCost(k) && save.up[k] < 6) { save.bank -= upCost(k); save.up[k]++; persist(); A.init(); A.sfx('buy'); panel(kind); } }));
}
G.panel = panel;

// ---------- run lifecycle ----------
function start() {
  clearWorld(); Object.assign(P, { lane: 1, prev: 1, x: 0, y: 0, vy: 0, z: 0, ground: true, roll: 0, stumble: 0, cd: 0, rot: 0 });
  Object.assign(S, { state: 'play', speed: 14, dist: 0, score: 0, coins: 0, streak: 0, jumps: 0, rolls: 0, pws: 0, roof: 0, deadT: 0, shake: 0, newBest: false, pw: { magnet: 0, sneak: 0, x2: 0 } });
  nextZ = -34; express = [0, 0, 0]; sinceRoof = 0; R.body.rotation.set(0, 0, 0); R.root.rotation.set(0, 0, 0);
  for (let i = 0; i < NSEG; i++) segs[i].position.z = -i * SEG + SEG;
  $('panel').classList.add('hide'); $('hud').classList.remove('hide'); A.setMusic(true);
}
G.start = start;
function crash() { if (S.state !== 'play') return; S.state = 'dead'; S.deadT = 0; S.shake = 1; P.vy = 7; A.sfx('crash'); A.setMusic(false); flash('#ff2d55'); burst(P.x, P.y + 1, P.z - 0.5, '#ff3d7f', 22, 8, 0.8, 0.9); burst(P.x, P.y + 1, P.z - 0.5, '#ffd23f', 14, 7, 0.6, 0.8); }
function stumble() {
  if (P.cd > 0) return; P.cd = 0.5;
  if (P.stumble > 0) { crash(); return; }
  P.stumble = 3.5; const t = P.lane; P.lane = P.prev; P.prev = t; S.shake = 0.5; A.sfx('stumble'); flash('#ff9e5e'); burst(P.x, P.y + 1, P.z, '#ffffff', 8, 4);
}
function gameOver() {
  S.state = 'over'; save.bank += S.coins; if (S.score > save.best) { save.best = S.score; S.newBest = true; } persist(); panel('over'); $('hud').classList.add('hide');
}
function flash(c) { const f = $('flash'); f.style.background = c; f.classList.remove('on'); void f.offsetWidth; f.classList.add('on'); }

// ---------- simulation ----------
const PH = () => (P.roll > 0 ? 0.85 : 1.75);
function groundAt() {
  let g = 0;
  for (const o of obs) {
    if (o.type !== 'train' || Math.abs(o.x - P.x) > 1.2) continue;
    if (P.z - 0.3 < o.zMax && P.z + 0.3 > o.zMin && P.y >= o.top - 0.6) g = Math.max(g, o.top);
    if (o.ramp && P.z >= o.zMax && P.z < o.zMax + 6) { const h = (o.top * (o.zMax + 6 - P.z)) / 6; if (P.y >= h - 0.8) g = Math.max(g, h); }
  }
  return g;
}
function collide() {
  for (const o of obs) {
    if (o.zMin > P.z + 1 || o.zMax < P.z - 1 || Math.abs(o.x - P.x) > 1.28) continue;
    if (!(P.z - 0.35 < o.zMax && P.z + 0.35 > o.zMin)) continue;
    const centred = Math.abs(o.x - P.x) < 0.85;
    if (o.type === 'train') {
      if (P.y >= o.top - 0.6) continue;
      if (o.ramp && P.z >= o.zMax - 0.4) continue;
      if (centred && P.z - 0.35 > o.zMax - 1.4) return crash();
      return stumble();
    }
    if (P.y < o.yMax - 0.05 && P.y + PH() > o.yMin + 0.05) return centred ? crash() : stumble();
  }
}
function step(dt) {
  S.t += dt;
  if (toastT > 0 && (toastT -= dt) <= 0) $('toast').classList.remove('show');
  stepParts(dt);
  for (const c of coins) c.m.rotation.y += dt * 4;
  if (S.state === 'dead') { S.deadT += dt; P.vy -= 30 * dt; P.y = Math.max(0, P.y + P.vy * dt); P.z += 2 * dt; R.body.rotation.x = Math.min(1.5, R.body.rotation.x + dt * 5); if (S.deadT > 1.2) gameOver(); return; }
  if (S.state !== 'play') { P.phase += dt * 6; return; }
  if (G.auto) bot();
  S.speed = Math.min(31, 14 + S.dist * 0.0095);
  const pz = P.z; P.z -= S.speed * dt; S.dist += pz - P.z;
  P.x += (LANES[P.lane] - P.x) * Math.min(1, dt * 15);
  P.vy -= (P.roll > 0 && !P.ground ? 75 : 40) * dt; P.y += P.vy * dt;
  const g = groundAt();
  if (P.y <= g) { if (!P.ground && P.vy < -9) { A.sfx('land'); burst(P.x, g + 0.1, P.z, S.pw.sneak > 0 ? '#5dff6a' : '#d8c8ff', 8, 4, 0.6, 0.45); S.shake = Math.max(S.shake, 0.15); } P.y = g; P.vy = 0; P.ground = true; }
  else if (P.y > g + 0.05) P.ground = false;
  P.roll = Math.max(0, P.roll - dt); P.stumble = Math.max(0, P.stumble - dt); P.cd = Math.max(0, P.cd - dt);
  if (P.ground && P.y > 3) S.roof += S.speed * dt;
  for (const k in S.pw) S.pw[k] = Math.max(0, S.pw[k] - dt);
  // moving trains
  for (const o of obs) if (o.vz) { o.zMin += o.vz * dt; o.zMax += o.vz * dt; o.g.position.z = o.zMax; if (o.zMax > P.z - 60 && o.zMax < P.z - 40 && S.t - lastHorn > 2) { lastHorn = S.t; A.sfx('horn'); } }
  collide(); if (S.state !== 'play') return;
  // coins
  const cy = P.y + 0.9; S.streakT -= dt; if (S.streakT < 0) S.streak = 0;
  for (let i = coins.length - 1; i >= 0; i--) {
    const c = coins[i], p = c.m.position;
    if (p.z > P.z + 8) { scene.remove(c.m); coins.splice(i, 1); continue; }
    if (S.pw.magnet > 0 && !c.pull && p.z > P.z - 16 && p.z < P.z + 1) c.pull = true;
    if (c.pull) { p.x += (P.x - p.x) * Math.min(1, dt * 12); p.y += (cy - p.y) * Math.min(1, dt * 12); p.z += (P.z - p.z) * Math.min(1, dt * 12); }
    if (Math.abs(p.x - P.x) < 0.9 && Math.abs(p.z - P.z) < 1.0 && Math.abs(p.y - cy) < 1.3) {
      scene.remove(c.m); coins.splice(i, 1); S.coins++; S.streak++; S.streakT = 0.6; S.score += 5 * (save.rank + 1);
      A.sfx('coin', S.streak); burst(p.x, p.y, p.z, '#ffd23f', 4, 3, 0.35, 0.35);
    }
  }
  for (let i = pwups.length - 1; i >= 0; i--) {
    const u = pwups[i], p = u.g.position; u.g.rotation.y += dt * 3; p.y = 1.1 + Math.sin(S.t * 4) * 0.15;
    if (p.z > P.z + 8) { scene.remove(u.g); pwups.splice(i, 1); continue; }
    if (Math.abs(p.x - P.x) < 1 && Math.abs(p.z - P.z) < 1.1 && Math.abs(p.y - cy) < 1.5) {
      scene.remove(u.g); pwups.splice(i, 1); S.pw[u.k] = pwDur(u.k); S.pws++; A.sfx('power'); toast(PWN[u.k] + '!'); flash('#ffffff');
      burst(p.x, p.y, p.z, u.k === 'magnet' ? '#ff3d55' : u.k === 'sneak' ? '#5dff6a' : '#ffe14d', 20, 6, 0.7, 0.7);
    }
  }
  if (S.pw.sneak > 0 && Math.random() < 0.5) burst(P.x, P.y + 0.15, P.z + 0.3, '#5dff6a', 1, 1, 0.4, 0.4);
  S.score += S.speed * dt * 0.6 * (save.rank + 1) * (S.pw.x2 > 0 ? 2 : 1);
  // stream world
  while (nextZ > P.z - 175) nextZ -= genRow(nextZ);
  for (let i = obs.length - 1; i >= 0; i--) if (obs[i].zMin > P.z + 14) { scene.remove(obs[i].g); obs.splice(i, 1); }
  for (const s of segs) if (s.position.z - SEG / 2 > P.z + 20) { s.position.z -= NSEG * SEG; skinSeg(s); }
  for (const b of blds) if (b.position.z > P.z + 30) b.position.z -= 18 * 14;
  if ((S.t * 4) % 1 < dt * 4) checkMissions();
}

// ---------- autopilot (for tests / ?bot) ----------
function laneThreat(l) {
  let best = null; const onRoof = P.y > 2.5;
  for (const o of obs) {
    if (o.l !== l || o.zMin > P.z + 0.4) continue;
    const dist = P.z - 0.35 - o.zMax, tt = dist / (S.speed + (o.vz || 0));
    let need;
    if (o.type === 'train') { if (onRoof || (o.ramp && dist > -0.3)) continue; need = 'block'; }
    else { if (dist < -0.6) continue; need = o.type === 'low' ? 'jump' : o.type === 'high' ? 'roll' : 'block'; }
    if (tt > 3) continue;
    if (!best || tt < best.tt) best = { tt, need };
  }
  return best;
}
function bot() {
  const info = [0, 1, 2].map(laneThreat);
  const danger = (i) => { const b = info[i]; if (!b) return 0; if (b.need === 'block') return b.tt < 0 ? 99 : b.tt < 2 ? 10 / (b.tt + 0.05) : 0; return 0.5; };
  const cur = P.lane, d0 = danger(cur);
  if (d0 >= 4 && Math.abs(P.x - LANES[cur]) < 0.5) {
    let best = cur, bd = d0;
    for (const l of [cur - 1, cur + 1, cur - 2, cur + 2]) { if (l < 0 || l > 2) continue; const mid = (l + cur) / 2; if (Math.abs(l - cur) === 2 && danger(mid) >= 50) continue; const dl = danger(l) + Math.abs(l - cur) * 0.3; if (dl < bd) { bd = dl; best = l; } }
    const n = best < cur ? cur - 1 : best > cur ? cur + 1 : cur;
    if (n !== cur && !(info[n] && info[n].need === 'block' && info[n].tt < 0.05)) act(n < cur ? 'left' : 'right');
  }
  const b = info[P.lane];
  if (b && b.tt > 0) { if (b.need === 'jump' && b.tt < 0.22 && P.ground) act('jump'); if (b.need === 'roll' && b.tt < 0.24 && P.roll <= 0.1) act('roll'); }
}

// ---------- render ----------
const camPos = new THREE.Vector3(0, 4, 7), look = new THREE.Vector3();
function draw(dt) {
  // runner pose
  const run = S.state === 'play' && P.ground && P.roll <= 0;
  P.phase += dt * (S.state === 'play' ? S.speed * 0.75 : 6);
  const sw = run || S.state === 'menu' ? Math.sin(P.phase) : 0;
  R.legs[0].rotation.x = sw * 0.9; R.legs[1].rotation.x = -sw * 0.9; R.arms[0].rotation.x = -sw * 0.8; R.arms[1].rotation.x = sw * 0.8;
  if (S.state === 'play' && !P.ground && P.roll <= 0) { R.legs[0].rotation.x = -0.9; R.legs[1].rotation.x = 0.4; R.arms[0].rotation.x = -2.4; R.arms[1].rotation.x = -2.2; }
  if (S.state !== 'dead') {
    R.body.rotation.x = P.roll > 0 ? -(1 - P.roll / 0.65) * Math.PI * 2 : 0;
    const sq = P.roll > 0 ? 0.6 : 1 + Math.min(0.15, Math.abs(P.vy) * 0.01);
    R.body.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)); R.body.position.y = P.roll > 0 ? 0.5 * (1 - sq) : 0;
    R.root.rotation.z = (P.x - LANES[P.lane]) * 0.12;
  }
  R.root.position.set(P.x, P.y, P.z);
  R.root.visible = !(P.stumble > 0 && Math.sin(S.t * 40) > 0.6);
  const gy = S.state === 'dead' ? 0 : groundAt(); R.blob.position.set(P.x, gy + 0.02, P.z); R.blob.scale.setScalar(Math.max(0.3, 1 - (P.y - gy) * 0.15));
  // camera
  if (S.state === 'menu') { const a = S.t * 0.25; camPos.set(P.x + Math.sin(a) * 6, 2.6, P.z + Math.cos(a) * 6); look.set(P.x, 1.2, P.z); camera.position.copy(camPos); }
  else {
    const k = Math.min(1, dt * 6);
    camPos.x += (P.x * 0.75 - camPos.x) * k; camPos.y += (P.y * 0.7 + 4.1 - camPos.y) * k; camPos.z = P.z + 7.4;
    look.set(camPos.x * 0.9, P.y * 0.6 + 1.6, P.z - 8);
    camera.position.copy(camPos);
    if (S.shake > 0) { camera.position.x += (Math.random() - 0.5) * S.shake * 0.6; camera.position.y += (Math.random() - 0.5) * S.shake * 0.6; S.shake = Math.max(0, S.shake - dt * 2.5); }
    const f = (camera.aspect < 0.8 ? 82 : 68) + (S.speed - 14) * 0.5; if (Math.abs(camera.fov - f) > 0.1) { camera.fov += (f - camera.fov) * k; camera.updateProjectionMatrix(); }
  }
  camera.lookAt(look);
  sky.position.copy(camera.position);
  ground.position.set(0, 0, Math.round(P.z / 6) * 6 - 140); dirt.position.z = P.z - 150;
  // HUD
  if (S.state === 'play') {
    hud.score.textContent = String(Math.floor(S.score)).padStart(6, '0'); hud.coins.textContent = S.coins; hud.mult.textContent = 'x' + (save.rank + 1) * (S.pw.x2 > 0 ? 2 : 1);
    hud.pw.innerHTML = Object.keys(S.pw).filter((k) => S.pw[k] > 0).map((k) => `<div class="b ${k}"><span>${PWN[k]}</span><i style="width:${(100 * S.pw[k]) / pwDur(k)}%"></i></div>`).join('');
  }
  document.body.classList.toggle('danger', P.stumble > 0);
  renderer.render(scene, camera);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.manual) step(S.state === 'dead' ? dt * 0.6 : dt);
  draw(dt);
}
G.sim = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { step(dt); if (S.state === 'over') break; } draw(dt); return { state: S.state, dist: Math.round(S.dist), score: Math.floor(S.score), coins: S.coins, jumps: S.jumps, rolls: S.rolls, pws: S.pws, roof: Math.round(S.roof) }; };
G.render = () => draw(1 / 60);

if (Q.has('title')) { S.state = 'menu'; panel('menu'); $('hud').classList.add('hide'); for (let k = 0; k < 6; k++) nextZ -= genRow(nextZ); }
else { start(); const h = $('hint'); h.classList.add('show'); setTimeout(() => h.classList.remove('show'), 3500); }
requestAnimationFrame(frame);
