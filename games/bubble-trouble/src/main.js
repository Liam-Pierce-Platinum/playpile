import { LEVELS, buildLevel, T } from './levels.js';
import * as A from './audio.js';
import * as Art from './art.js';
import { botThink } from './bot.js';

const DT = 1 / 120, VH = 480;
const Q = new URLSearchParams(location.search);
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const cardEl = document.getElementById('card'), touchEl = document.getElementById('touch');

let padB = 0, touchOn = false, W = 0, H = 0, dpr = 1, scale = 1, viewW = 800, viewH = VH;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1); W = innerWidth; H = innerHeight;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  scale = Math.min(H / VH, W / 360); viewW = W / scale; viewH = H / scale;
  padB = touchOn && H > W ? Math.min(170, H * 0.2) / scale : 0;
}
addEventListener('resize', resize);

// ---------- save
const SKEY = 'bubbletrouble.v1';
const save = { unlocked: 0, best: {} };
try { Object.assign(save, JSON.parse(localStorage.getItem(SKEY)) || {}); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

// ---------- input
const held = { l: 0, r: 0, jump: 0, down: 0 }, tch = { l: 0, r: 0, jump: 0, down: 0 }, latch = { jump: 0, down: 0 };
const KEYS = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', KeyJ: 'jump', ArrowDown: 'down', KeyS: 'down', KeyX: 'down', KeyK: 'down' };
addEventListener('keydown', (e) => {
  A.wake();
  const k = KEYS[e.code];
  if (k) { if (!held[k] && k in latch) latch[k] = 1; held[k] = 1; e.preventDefault(); }
  if (e.repeat) return;
  if (G.cardOpen && (e.code === 'Enter' || e.code === 'Space')) { const b = cardEl.querySelector('.def'); if (b) b.click(); return; }
  if (e.code === 'KeyR' && !G.attract && (G.state === 'play' || G.state === 'card')) restart();
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
  if (e.code === 'KeyM') A.toggleMute();
});
addEventListener('keyup', (e) => { const k = KEYS[e.code]; if (k) { held[k] = 0; e.preventDefault(); } });
addEventListener('blur', () => { for (const k in held) held[k] = 0; });
addEventListener('pointerdown', () => A.wake());
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) { touchEl.classList.remove('hidden'); touchOn = true; }
resize();
for (const b of touchEl.querySelectorAll('[data-k]')) {
  const k = b.dataset.k;
  const on = (ev) => { ev.preventDefault(); A.wake(); if (!tch[k] && k in latch) latch[k] = 1; tch[k] = 1; b.classList.add('on'); };
  const off = (ev) => { ev.preventDefault(); tch[k] = 0; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
}
document.getElementById('tpause').addEventListener('pointerdown', (e) => { e.preventDefault(); togglePause(); });

// ---------- game state
const G = window.__G = {
  state: 'boot', li: 0, L: null, p: null, en: [], items: [], parts: [], pops: [], waves: [], boss: null,
  camX: 0, camY: 0, shake: 0, stop: 0, time: 0, t: 0, candy: 0, gumballs: 0, totalG: 0, hearts: 3, cp: null,
  bot: Q.has('bot'), botMem: {}, botInp: null, attract: false, exitOpen: true, overT: 0, winT: 0, banner: 0, combo: 0, bump: 0, LEVELS,
};
G.tileAt = tileAt;

function tileAt(cx, cy) {
  const L = G.L; if (cx < 0 || cx >= L.w) return '#'; if (cy < 0 || cy >= L.h) return '.'; return L.g[cy][cx];
}
const SOLID = (c) => c === '#' || c === 'B';
function rectSolid(x, y, w, h) {
  const x0 = Math.floor((x + 1) / T), x1 = Math.floor((x + w - 1) / T), y0 = Math.floor((y + 1) / T), y1 = Math.floor((y + h - 1) / T);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (SOLID(tileAt(cx, cy))) return true;
  return false;
}
function moveX(b, dx) {
  b.x += dx; if (!dx) return 0;
  const y0 = Math.floor((b.y + 1) / T), y1 = Math.floor((b.y + b.h - 1) / T);
  if (dx > 0) { const col = Math.floor((b.x + b.w) / T); for (let cy = y0; cy <= y1; cy++) if (SOLID(tileAt(col, cy))) { b.x = col * T - b.w; return 1; } }
  else { const col = Math.floor(b.x / T); for (let cy = y0; cy <= y1; cy++) if (SOLID(tileAt(col, cy))) { b.x = (col + 1) * T; return -1; } }
  return 0;
}
function moveY(b, dy, breakB) {
  const prevBottom = b.y + b.h; b.y += dy; if (!dy) return 0;
  const x0 = Math.floor((b.x + 1) / T), x1 = Math.floor((b.x + b.w - 1) / T);
  if (dy > 0) {
    const row = Math.floor((b.y + b.h) / T);
    const test = () => { for (let cx = x0; cx <= x1; cx++) { const c = tileAt(cx, row); if (SOLID(c) || (c === '=' && prevBottom <= row * T + 0.5)) return true; } return false; };
    let hit = test();
    if (hit && breakB) { let broke = false; for (let cx = x0 - 1; cx <= x1 + 1; cx++) if (tileAt(cx, row) === 'B') { breakTile(cx, row); broke = true; } if (broke) hit = test(); }
    if (hit) { b.y = row * T - b.h; return 1; }
  } else {
    const row = Math.floor(b.y / T);
    for (let cx = x0; cx <= x1; cx++) if (SOLID(tileAt(cx, row))) { b.y = (row + 1) * T; return -1; }
  }
  return 0;
}
const approach = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const overlap = (a, b, s = 0) => a.x < b.x + b.w - s && a.x + a.w > b.x + s && a.y < b.y + b.h - s && a.y + a.h > b.y + s;

// ---------- juice
function burst(x, y, n, col, sp = 160, opt = {}) {
  for (let i = 0; i < n; i++) {
    const a = opt.up ? -Math.PI / 2 + (Math.random() - 0.5) * (opt.spread || 2.4) : Math.random() * 6.28, s = sp * (0.4 + Math.random() * 0.8);
    G.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0, max: 0.35 + Math.random() * 0.4, r: (opt.r || 3) * (0.6 + Math.random() * 0.8), col: Array.isArray(col) ? col[(Math.random() * col.length) | 0] : col, g: opt.g ?? 500, kind: opt.kind || 'dot', rot: Math.random() * 6 });
  }
}
function ring(x, y, r, col) { G.parts.push({ x, y, vx: 0, vy: 0, life: 0, max: 0.35, r, col, g: 0, kind: 'ring' }); }
function popup(x, y, text, col = '#fff', size = 16) { G.pops.push({ x, y, text, col, size, life: 0 }); }
const CONF = ['#ff4f8b', '#4fd1ff', '#ffe14f', '#7dff8a', '#b88cff', '#ffffff'];
function breakTile(cx, cy) {
  G.L.g[cy][cx] = '.'; A.S.crate(); G.shake = Math.max(G.shake, 5);
  burst(cx * T + 16, cy * T + 16, 14, ['#ff6fae', '#c23f7a', '#ffc2e0'], 260, { r: 4, kind: 'chunk' });
}

// ---------- flow
function makeEnemy(e) { return { type: e.type, x: e.x, y: e.y, w: 26, h: 24, vx: 0, vy: 0, on: false, x0: e.x, y0: e.y, t: Math.random() * 6, gum: 0, dead: false, face: -1, hopT: 0.8 + Math.random(), sq: 1 }; }
function makeBoss(b) { return { x: b.x - 24, y: b.y + T - 72, w: 80, h: 72, vx: 0, vy: 0, on: false, hp: 12, max: 12, st: 'intro', t: 0, inv: 0, face: -1, seq: 0, sq: 1, flash: 0, jumped: false, spat: false }; }
function spawnPlayer() {
  G.p = { x: G.cp.x + 4, y: G.cp.y + 8, w: 24, h: 24, vx: 0, vy: 0, on: false, wall: 0, wallT: 0, wallAway: 0, wallCD: 0, gum: 1, blow: false, blowLock: false, slam: 0, slamT: 0, face: 1, sx: 1, sy: 1, inv: 0, kb: 0, coy: 0, buf: 0, cut: true, prevJ: 1, prevD: 0, infl: 0, trail: [] };
}
function startLevel(i, attract = false) {
  G.li = i; G.attract = attract; const L = G.L = buildLevel(LEVELS[i]);
  G.en = L.enemies.map(makeEnemy); G.items = L.items.map((o) => ({ ...o, got: false }));
  G.totalG = G.items.filter((o) => o.type === 'G').length;
  G.parts = []; G.pops = []; G.waves = []; G.boss = L.boss ? makeBoss(L.boss) : null; G.exitOpen = !G.boss;
  G.hearts = 3; G.candy = 0; G.gumballs = 0; G.time = 0; G.deaths = 0; G.cp = { ...L.start }; G.combo = 0; G.botMem = {};
  spawnPlayer();
  G.camX = clampCam(G.p.x - viewW * 0.35); G.camY = VH - viewH + padB;
  G.state = 'play'; G.banner = attract ? 0 : 2.4; G.stop = 0; G.shake = 0;
  if (!attract) hideCard();
  Art.setTheme(L.theme); A.music(L.theme);
  if (G.boss && !attract) A.S.bossRoar();
}
function restart() { A.S.click(); startLevel(G.li); }
function clampCam(x) { const max = G.L.w * T - viewW; return max < 0 ? max / 2 : Math.max(0, Math.min(max, x)); }

function hurt(dir, spikes) {
  const p = G.p; if (p.inv > 0 || G.state !== 'play') return;
  G.hearts--; p.inv = 1.4; p.kb = 0.28; p.vx = (dir || -p.face) * 280; p.vy = spikes ? -560 : -380; p.slam = 0; p.blow = false; p.wall = 0; p.cut = true;
  G.shake = 11; G.stop = 0.08; A.S.hurt(); burst(p.x + 12, p.y + 12, 14, ['#ff4f9a', '#fff'], 220, { r: 3 });
  if (G.hearts <= 0) gameOver();
}
function fellOff() {
  if (G.state !== 'play') return;
  G.hearts--; A.S.hurt(); G.shake = 8;
  if (G.hearts <= 0) { gameOver(); return; }
  spawnPlayer(); G.p.inv = 1.4; popup(G.p.x + 12, G.p.y - 10, 'OOPS!', '#fff', 18);
}
function gameOver() {
  G.state = 'over'; G.overT = 0; G.deaths++; A.S.fail();
  const p = G.p; burst(p.x + 12, p.y + 12, 30, ['#ff4f9a', '#ff9fcb', '#fff'], 340, { r: 4 });
}
function win() {
  G.state = 'win'; G.winT = 0; A.S.win();
  if (G.attract) return;
  const b = save.best[G.li] || {};
  save.best[G.li] = { g: Math.max(b.g || 0, G.gumballs), c: Math.max(b.c || 0, G.candy), t: Math.min(b.t || 1e9, G.time), total: G.totalG };
  save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length - 1, G.li + 1));
  persist();
}

// ---------- sim
function step(dt) {
  if (G.state !== 'play' && G.state !== 'win' && G.state !== 'over') return;
  G.t += dt;
  if (G.shake > 0) G.shake = Math.max(0, G.shake - dt * 30);
  if (G.stop > 0) { G.stop -= dt; return; }
  if (G.banner > 0) G.banner -= dt;
  if (G.bump > 0) G.bump -= dt;
  let inp;
  if (G.botInp) inp = G.botInp;
  else if (G.bot || G.attract) inp = botThink(G);
  else { inp = { l: held.l || tch.l, r: held.r || tch.r, jump: held.jump || tch.jump, down: held.down || tch.down, jumpP: latch.jump, downP: latch.down }; latch.jump = latch.down = 0; }
  if (G.state === 'play') { G.time += dt; updatePlayer(dt, inp); }
  else if (G.state === 'win') { G.winT += dt; const p = G.p, E = G.L.exit; p.x += (E.x + 12 - p.x) * Math.min(1, dt * 6); p.y += (E.y + 30 - p.y) * Math.min(1, dt * 6); p.sx = p.sy = Math.max(0.05, 1 - G.winT); if (Math.random() < 0.3) burst(E.x + 24, E.y + 20, 2, CONF, 200, { kind: 'conf', r: 3 }); }
  else { G.overT += dt; }
  updateEnemies(dt); updateBoss(dt); updateWorld(dt);
  // camera
  const p = G.p;
  const tx = p.x + 12 - viewW * 0.42 + p.face * 30 + p.vx * 0.12;
  G.camX += (clampCam(tx) - G.camX) * Math.min(1, dt * 5);
  G.camY = VH - viewH + padB;
  if (G.state === 'win' && G.winT > 1.3 && !G.attract && !G.headless) showWin();
  if (G.state === 'over' && G.overT > 0.9 && !G.headless) { if (G.attract) startLevel(G.li, true); else showFail(); }
  if (G.state === 'win' && G.attract && G.winT > 1.5) startLevel((G.li + 1) % 3, true);
}

function updatePlayer(dt, inp) {
  const p = G.p, L = G.L;
  const jP = inp.jumpP || (inp.jump && !p.prevJ), dP = inp.downP || (inp.down && !p.prevD);
  p.prevJ = inp.jump; p.prevD = inp.down;
  const ax = (inp.r ? 1 : 0) - (inp.l ? 1 : 0);
  if (ax && !p.wall) p.face = ax;
  if (p.inv > 0) p.inv -= dt; if (p.kb > 0) p.kb -= dt; if (p.wallCD > 0) p.wallCD -= dt;
  if (p.on) { p.coy = 0.1; p.gum = Math.min(1, p.gum + dt * 1.6); p.blowLock = false; G.combo = 0; } else p.coy -= dt;
  p.buf = jP ? 0.13 : p.buf - dt;

  // horizontal
  if (!p.slam && p.kb <= 0 && !p.wall) {
    const max = p.blow ? 205 : 245, acc = p.on ? 2600 : 1800;
    if (ax) { const over = Math.sign(p.vx) === ax && Math.abs(p.vx) > max; p.vx = approach(p.vx, ax * max, (over ? 500 : acc) * dt); }
    else p.vx = approach(p.vx, 0, (p.on ? 2400 : 450) * dt);
  }
  // jumps
  if (p.buf > 0 && p.coy > 0 && !p.slam) {
    p.vy = -560; p.on = false; p.coy = 0; p.buf = 0; p.cut = false; p.sx = 0.72; p.sy = 1.35; A.S.jump();
    burst(p.x + 12, p.y + 24, 6, 'rgba(255,255,255,0.9)', 90, { up: true, g: 100, r: 3 });
  } else if (p.buf > 0 && p.wall && !p.on) {
    p.vx = -p.wall * 300; p.vy = -560; p.face = -p.wall; p.wall = 0; p.buf = 0; p.cut = true; p.wallCD = 0.12; p.sx = 0.75; p.sy = 1.3; A.S.wjump();
    burst(p.x + 12 + p.face * -12, p.y + 12, 8, '#ff9fcb', 120, { r: 3, g: 200 });
  }
  if (!inp.jump && p.vy < -260 && !p.cut) { p.vy *= 0.55; p.cut = true; }
  // blow a bubble to float
  const canBlow = !p.on && !p.wall && !p.slam && !p.blowLock && p.gum > 0;
  if (inp.jump && canBlow && (p.blow || p.vy > -120)) {
    if (!p.blow) { p.blow = true; A.S.blow(); p.vy = Math.min(p.vy, -70); }
    p.gum -= dt * 0.42;
    if (p.gum <= 0) {
      p.gum = 0; p.blow = false; p.blowLock = true; A.S.pop(); G.shake = Math.max(G.shake, 3);
      burst(p.x + 12, p.y + 8, 16, ['#ff9fcb', '#fff'], 220, { r: 3 }); popup(p.x + 12, p.y - 14, 'POP!', '#fff', 14);
    }
  } else if (p.blow) { p.blow = false; A.S.deflate(); }
  p.infl = approach(p.infl, p.blow ? 1 : 0, dt * (p.blow ? 3.5 : 6));
  // slam
  if (dP && !p.on && !p.slam) { p.slam = 1; p.slamT = 0; p.vx = 0; p.vy = -170; p.blow = false; p.wall = 0; A.S.slamStart(); p.sx = 1.3; p.sy = 0.75; }
  if (p.slam) { p.slamT += dt; p.vx = 0; if (p.slamT > 0.09) { p.vy = 1050; p.sx = 0.72; p.sy = 1.4; } }
  // wall stick
  if (p.wall) {
    const adj = rectSolid(p.x + p.wall * 2, p.y + 2, p.w, p.h - 4);
    if (!adj) p.wall = 0;
    else {
      p.wallT += dt;
      if (ax === -p.wall) { p.wallAway += dt; if (p.wallAway > 0.12) p.wall = 0; } else p.wallAway = 0;
      p.vx = p.wall * 30;
      p.vy = p.wallT < 0.35 ? approach(p.vy, 0, 4000 * dt) : Math.min(p.vy + 600 * dt, 90);
      if (Math.random() < 0.05) burst(p.x + 12 + p.wall * 12, p.y + 12, 1, '#ff9fcb', 30, { r: 2, g: 300 });
    }
  }
  // gravity
  if (p.blow) p.vy = approach(p.vy, 45, 900 * dt);
  else if (!p.slam && !p.wall) p.vy += (p.vy > 0 ? 1750 : 1500) * dt;
  p.vy = Math.min(p.vy, p.slam ? 1050 : 780);

  // move
  const hx = moveX(p, p.vx * dt);
  if (hx) {
    if (!p.wall && !p.on && !p.slam && p.wallCD <= 0 && ax === hx && p.vy > -140) {
      p.wall = hx; p.wallT = 0; p.wallAway = 0; p.blow = false; A.S.stick(); p.sx = 0.75; p.sy = 1.2;
      burst(p.x + 12 + hx * 12, p.y + 12, 6, '#ff9fcb', 80, { r: 3, g: 200 });
    }
    if (!p.wall) p.vx = 0;
  }
  const wasOn = p.on, vyIn = p.vy; p.on = false;
  const hy = moveY(p, p.vy * dt, p.slam > 0 && p.slamT > 0.09);
  if (hy === 1) {
    p.on = true; p.wall = 0;
    if (p.slam) slamImpact();
    else { if (!wasOn && vyIn > 220) { const k = Math.min(0.35, vyIn / 2200); p.sy = 1 - k; p.sx = 1 + k; A.S.land(Math.min(1, vyIn / 700)); burst(p.x + 12, p.y + 24, 5, 'rgba(255,255,255,0.9)', 70, { up: true, g: 80, r: 2.5 }); } p.vy = 0; }
  } else if (hy === -1) { p.vy = Math.max(p.vy, 0); }
  p.sx += (1 - p.sx) * Math.min(1, dt * 12); p.sy += (1 - p.sy) * Math.min(1, dt * 12);
  if (p.slam && p.slamT > 0.09) { p.trail.push({ x: p.x + 12, y: p.y + 10 }); if (p.trail.length > 5) p.trail.shift(); } else if (p.trail.length) p.trail.shift();

  if (p.y > L.h * T + 60) { fellOff(); return; }
  // spikes
  const x0 = Math.floor((p.x + 4) / T), x1 = Math.floor((p.x + p.w - 4) / T), y0 = Math.floor(p.y / T), y1 = Math.floor((p.y + p.h - 1) / T);
  for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) if (tileAt(cx, cy) === '^' && p.y + p.h > cy * T + 14) hurt(Math.sign(p.vx) * -1 || -p.face, true);
  // springs
  for (const s of L.springs) if (p.vy >= 0 && p.x + p.w > s.x + 4 && p.x < s.x + T - 4 && p.y + p.h > s.y + 16 && p.y + p.h < s.y + T + 4) {
    p.vy = -950; p.slam = 0; p.cut = true; p.on = false; p.blowLock = false; p.gum = 1; s.t = 0.5; p.sx = 0.6; p.sy = 1.5; A.S.spring(); G.shake = 4;
    burst(s.x + 16, s.y + 20, 10, CONF, 200, { up: true, kind: 'conf' });
  }
  // checkpoints
  for (const c of L.checks) if (!c.on && p.x > c.x - 8) {
    c.on = true; G.cp = { x: c.x, y: c.y }; A.S.check(); popup(c.x + 16, c.y - 40, 'CHECKPOINT!', '#fff', 15); burst(c.x + 16, c.y - 28, 24, CONF, 260, { kind: 'conf' });
  }
  // items
  for (const it of G.items) if (!it.got && Math.abs(it.x - (p.x + 12)) < 20 && Math.abs(it.y - (p.y + 12)) < 22) collect(it);
  // exit
  if (G.exitOpen && L.exit && overlap(p, L.exit, 10)) win();
}
function collect(it) {
  it.got = true; G.bump = 0.15;
  if (it.type === 'o') { G.candy++; A.S.candy(); burst(it.x, it.y, 6, ['#fff', '#ffe14f'], 110, { kind: 'star', r: 3, g: 0 }); }
  else if (it.type === 'G') { G.gumballs++; A.S.gumball(); G.stop = 0.06; popup(it.x, it.y - 20, 'GUMBALL!', '#ffe14f', 18); burst(it.x, it.y, 26, ['#ffe14f', '#fff', '#ffb92e'], 260, { kind: 'star', r: 4, g: 0 }); ring(it.x, it.y, 40, '#ffe14f'); }
  else if (it.type === 'H') { G.hearts = Math.min(3, G.hearts + 1); A.S.heart(); popup(it.x, it.y - 20, '+1', '#ff7ab5', 18); burst(it.x, it.y, 14, ['#ff3f7f', '#fff'], 180, { r: 3, g: 0 }); }
}
function slamImpact() {
  const p = G.p, cx = p.x + 12, by = p.y + p.h;
  G.shake = Math.max(G.shake, 10); G.stop = 0.05; A.S.slam();
  burst(cx, by, 16, 'rgba(255,255,255,0.95)', 260, { up: true, spread: 3.0, g: 300, r: 4 });
  ring(cx, by - 4, 70, '#ffffff');
  for (const e of G.en) if (!e.dead && Math.abs(e.x + 13 - cx) < 80 && Math.abs(e.y + e.h - by) < 40) killEnemy(e);
  p.slam = 0; p.vy = -200; p.on = false; p.sx = 1.5; p.sy = 0.6;
}
function gumEnemy(e) {
  e.gum = 6; e.vx = 0; A.S.gum(); G.combo++; G.candy++;
  popup(e.x + 13, e.y - 10, G.combo > 1 ? 'STICKY x' + G.combo : 'STICKY!', '#ff9fcb', 14 + Math.min(6, G.combo * 2));
  burst(e.x + 13, e.y + 10, 12, ['#ff9fcb', '#ff5fa2', '#fff'], 180, { r: 3 });
}
function killEnemy(e) {
  e.dead = true; A.S.kill(); G.candy += 3; G.combo++; G.stop = Math.max(G.stop, 0.04); G.shake = Math.max(G.shake, 5);
  popup(e.x + 13, e.y - 10, '+3', '#ffe14f', 16); burst(e.x + 13, e.y + 12, 22, ['#ff4f8b', '#ffe14f', '#4fd1ff', '#fff'], 300, { kind: 'conf', r: 3 }); ring(e.x + 13, e.y + 12, 34, '#fff');
}

function updateEnemies(dt) {
  const p = G.p, L = G.L;
  for (const e of G.en) {
    if (e.dead) continue;
    e.t += dt; e.sq += (1 - e.sq) * Math.min(1, dt * 10);
    if (e.gum > 0) {
      e.gum -= dt;
      e.vy += 1500 * dt; e.vx = approach(e.vx, 0, 800 * dt); moveX(e, e.vx * dt); e.on = moveY(e, e.vy * dt) === 1; if (e.on) e.vy = 0;
      if (e.gum <= 0) { e.vy = -220; A.S.deflate(); burst(e.x + 13, e.y + 10, 10, '#ff9fcb', 150); if (e.type === 'f') { e.y0 = Math.min(e.y0, e.y); } }
    } else if (e.type === 'w') {
      e.vx = 60 * e.face; e.vy += 1500 * dt;
      if (moveX(e, e.vx * dt)) e.face *= -1;
      else if (e.on) { const fx = e.face > 0 ? e.x + e.w + 2 : e.x - 2; const c = tileAt(Math.floor(fx / T), Math.floor((e.y + e.h + 4) / T)); if (!(SOLID(c) || c === '=')) e.face *= -1; }
      e.on = moveY(e, e.vy * dt) === 1; if (e.on) e.vy = 0;
    } else if (e.type === 'h') {
      e.vy += 1500 * dt;
      if (e.on) { e.vx = 0; e.hopT -= dt; e.face = Math.sign(p.x - e.x) || -1; if (e.hopT <= 0 && Math.abs(p.x - e.x) < 420) { e.vy = -500; e.vx = e.face * 110; e.hopT = 1.1 + Math.random() * 0.6; e.sq = 1.4; } }
      if (moveX(e, e.vx * dt)) e.vx *= -1;
      const was = e.on; e.on = moveY(e, e.vy * dt) === 1; if (e.on) { if (!was) e.sq = 0.7; e.vy = 0; }
    } else {
      e.x += (e.x0 + Math.sin(e.t * 1.3) * 70 - e.x) * Math.min(1, dt * 4);
      e.y += (e.y0 + Math.sin(e.t * 2.6) * 12 - e.y) * Math.min(1, dt * 4);
      e.face = Math.cos(e.t * 1.3) > 0 ? 1 : -1;
    }
    if (e.y > L.h * T + 50) { e.dead = true; continue; }
    if (G.state !== 'play' || !overlap(p, e, 3)) continue;
    const top = p.y + p.h - e.y;
    if (p.slam) { killEnemy(e); continue; }
    if (p.vy > 30 && top < 18) {
      const hold = !!(G.botInp ? G.botInp.jump : (held.jump || tch.jump || G.bot || G.attract));
      if (e.gum > 0) { p.vy = hold ? -720 : -600; e.sq = 0.6; A.S.boing(); }
      else { gumEnemy(e); p.vy = hold ? -620 : -480; }
      p.y = e.y - p.h; p.cut = true; p.blowLock = false; p.gum = Math.min(1, p.gum + 0.4); p.sx = 1.3; p.sy = 0.75; G.stop = Math.max(G.stop, 0.035);
    } else if (e.gum <= 0) hurt(Math.sign(p.x - e.x) || 1);
    else { p.x = p.x < e.x ? e.x - p.w : e.x + e.w; }
  }
}

function updateBoss(dt) {
  const B = G.boss; if (!B) return;
  const p = G.p, pcx = p.x + 12, bcx = B.x + B.w / 2;
  B.t += dt; B.inv -= dt; B.flash -= dt; B.sq += (1 - B.sq) * Math.min(1, dt * 8);
  const next = (s) => { B.st = s; B.t = 0; B.jumped = false; B.spat = false; };
  if (B.st !== 'dead') {
    B.vy += 1600 * dt;
    const hx = moveX(B, B.vx * dt);
    const was = B.on; B.on = moveY(B, B.vy * dt) === 1; if (B.on) B.vy = 0;
    const rage = B.hp <= 4;
    switch (B.st) {
      case 'intro': if (B.t > 1.6) next('idle'); break;
      case 'idle': B.vx = approach(B.vx, 0, 1500 * dt); B.face = Math.sign(pcx - bcx) || -1; if (B.t > (rage ? 0.5 : 0.85)) next(['hop', 'hop', 'charge', 'spit', 'hop', 'charge'][B.seq++ % 6]); break;
      case 'hop':
        if (B.t < 0.35) { B.sq = 1 - B.t * 0.6; B.vx = 0; }
        else if (!B.jumped) { B.jumped = true; B.vy = -760; B.vx = Math.max(-380, Math.min(380, (pcx - bcx) * 1.3)); B.on = false; A.S.bossJump(); }
        else if (B.on && !was) {
          B.vx = 0; B.sq = 1.35; G.shake = Math.max(G.shake, 12); A.S.slam();
          G.waves.push({ x: bcx - 40, dir: -1, life: 1.1 }, { x: bcx + 40, dir: 1, life: 1.1 });
          burst(bcx, B.y + B.h, 20, 'rgba(255,255,255,0.9)', 280, { up: true, spread: 3, g: 300, r: 5 });
          next('idle');
        }
        break;
      case 'charge':
        if (B.t < 0.6) B.vx = 0;
        else { B.vx = B.face * (rage ? 500 : 430); if (Math.random() < 0.4) burst(bcx - B.face * 40, B.y + B.h, 1, 'rgba(255,255,255,0.8)', 60, { up: true, g: 50 }); if (hx) { B.vx = 0; G.shake = 15; A.S.slam(); burst(bcx + B.face * 44, B.y + 40, 18, ['#fff', '#ffe14f'], 260, { kind: 'star' }); next('dizzy'); } }
        break;
      case 'dizzy': B.vx = 0; if (B.t > 2.2) next('idle'); break;
      case 'spit':
        B.vx = 0;
        if (B.t > 0.35 && !B.spat) {
          B.spat = true; A.S.pop();
          if (G.en.filter((e) => !e.dead).length < 4) for (const k of [0, 1]) { const e = makeEnemy({ type: 'w', x: bcx + B.face * 30 - 13, y: B.y + 20 }); e.vy = -400 - k * 120; e.face = B.face; G.en.push(e); }
        }
        if (B.t > 0.9) next('idle');
        break;
    }
    // player contact
    if (G.state === 'play' && overlap(p, B, 6)) {
      const top = p.y + p.h - B.y;
      if ((p.vy > 0 && top < 32) || (p.slam && top < 48) || (B.st === 'dizzy' && p.vy > 0)) {
        const soft = B.st === 'dizzy' || B.st === 'spit';
        if (!soft && B.st !== 'dead') { if (B.inv <= 0) { B.inv = 0.3; A.S.slam(); popup(bcx, B.y - 20, 'TOO SOUR! WAIT TILL DIZZY', '#fff', 15); burst(bcx, B.y, 8, ['#fff', '#ffe14f'], 200, { kind: 'star' }); } }
        else if (B.inv <= 0) {
          const d = p.slam ? 2 : 1; B.hp -= d; B.inv = 0.9; B.flash = 0.2; B.sq = 0.7; G.stop = 0.09; G.shake = 12; A.S.bossHit();
          popup(bcx, B.y - 20, d > 1 ? 'SLAM! -2' : '-1', '#ffe14f', 20); burst(bcx, B.y + 10, 20, ['#ffe14f', '#fff', '#ff9fcb'], 280, { kind: 'star' });
          if (B.hp <= 0) { B.st = 'dead'; B.t = 0; A.S.win(); G.shake = 20; burst(bcx, B.y + 40, 70, CONF, 420, { kind: 'conf', r: 4 }); popup(bcx, B.y - 30, 'SOUR KING POPPED!', '#fff', 22); }
        }
        p.vy = -640; p.slam = 0; p.cut = true; p.y = B.y - p.h; p.vx = (Math.sign(pcx - bcx) || 1) * 220; p.kb = 0.12;
      } else if (B.st !== 'dead' && B.st !== 'intro' && B.st !== 'dizzy') hurt(Math.sign(pcx - bcx) || 1);
    }
  } else {
    B.sq = Math.max(0.01, B.sq - dt * 1.2);
    if (B.t > 1.2 && !G.exitOpen) {
      G.exitOpen = true; G.L.exit = { x: Math.floor(G.L.w / 2) * T - 8, y: 12 * T - 72, w: 48, h: 72 };
      burst(G.L.exit.x + 24, G.L.exit.y + 30, 40, CONF, 300, { kind: 'conf' }); A.S.check();
    }
  }
}

function updateWorld(dt) {
  const p = G.p;
  for (const s of G.L.springs) if (s.t > 0) s.t -= dt;
  for (const w of G.waves) {
    w.x += w.dir * 470 * dt; w.life -= dt;
    if (Math.random() < 0.5) burst(w.x, 384, 1, 'rgba(255,255,255,0.8)', 80, { up: true, g: 300, r: 3 });
    if (G.state === 'play' && p.on && Math.abs(p.x + 12 - w.x) < 20 && p.y + p.h > 370) hurt(w.dir);
  }
  G.waves = G.waves.filter((w) => w.life > 0);
  for (const q of G.parts) { q.life += dt; q.vy += q.g * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vx *= 1 - dt * 2; q.rot = (q.rot || 0) + dt * 8; }
  G.parts = G.parts.filter((q) => q.life < q.max);
  if (G.parts.length > 600) G.parts.splice(0, G.parts.length - 600);
  for (const q of G.pops) q.life += dt;
  G.pops = G.pops.filter((q) => q.life < 1.1);
}

// ---------- render
function render() {
  const k = scale * dpr, L = G.L; if (!L) return;
  const sh = G.shake, ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
  const camX = Math.round((G.camX + ox) * k) / k, camY = G.camY + oy;
  ctx.setTransform(k, 0, 0, k, -camX * k, -camY * k);
  Art.drawSky(ctx, camX, camY, viewW, viewH, k, G.t);
  const x0 = Math.floor(camX / T) - 1, x1 = Math.ceil((camX + viewW) / T) + 1;
  const vis = (x, w = 64) => x + w > camX - 40 && x < camX + viewW + 40;
  for (const c of L.checks) if (vis(c.x)) Art.drawCheck(ctx, c, G.t);
  if (L.exit && (G.exitOpen || !G.boss)) Art.drawExit(ctx, L.exit, G.t, G.exitOpen);
  Art.drawTiles(ctx, L, x0, x1, k);
  if (camY + viewH > VH) { ctx.fillStyle = Art.theme().body; ctx.fillRect(camX - 2, VH, viewW + 4, camY + viewH - VH + 2); ctx.fillStyle = 'rgba(30,0,40,0.45)'; ctx.fillRect(camX - 2, VH, viewW + 4, camY + viewH - VH + 2); }
  for (const s of L.springs) if (vis(s.x)) Art.drawSpring(ctx, s, G.t);
  for (const it of G.items) if (!it.got && vis(it.x)) Art.drawItem(ctx, it, G.t);
  for (const e of G.en) if (!e.dead && vis(e.x)) Art.drawEnemy(ctx, e, G.t);
  if (G.boss && G.boss.sq > 0.02) Art.drawBoss(ctx, G.boss, G.t);
  for (const w of G.waves) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.8, w.life)})`; ctx.beginPath(); ctx.ellipse(w.x, 382, 16, 10, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = `rgba(255,120,180,${Math.min(0.6, w.life)})`; ctx.beginPath(); ctx.ellipse(w.x - w.dir * 10, 383, 10, 6, 0, Math.PI, 0); ctx.fill(); }
  if (G.state !== 'over' && G.p.sx > 0.3) Art.drawPlayer(ctx, G.p, G.t, G.p.kb > 0.2);
  for (const q of G.parts) {
    const a = 1 - q.life / q.max; ctx.globalAlpha = Math.max(0, a); ctx.fillStyle = q.col;
    if (q.kind === 'ring') { ctx.strokeStyle = q.col; ctx.lineWidth = 3 * a; ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (1 - a * 0.8), 0, 7); ctx.stroke(); }
    else if (q.kind === 'star') Art.star(ctx, q.x, q.y, q.r * 1.4, q.col, q.rot);
    else if (q.kind === 'conf' || q.kind === 'chunk') { ctx.save(); ctx.translate(q.x, q.y); ctx.rotate(q.rot); ctx.fillRect(-q.r, -q.r * 0.5, q.r * 2, q.r); ctx.restore(); }
    else { ctx.beginPath(); ctx.arc(q.x, q.y, q.r * (0.4 + a * 0.6), 0, 7); ctx.fill(); }
  }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.lineJoin = 'round';
  for (const q of G.pops) {
    const a = 1 - q.life / 1.1, s = q.size * (q.life < 0.12 ? 0.6 + q.life * 3.3 : 1);
    ctx.globalAlpha = Math.min(1, a * 2); ctx.font = `900 ${s}px ${FONT}`;
    ctx.strokeStyle = '#4a1450'; ctx.lineWidth = 4; ctx.strokeText(q.text, q.x, q.y - q.life * 40); ctx.fillStyle = q.col; ctx.fillText(q.text, q.x, q.y - q.life * 40);
  }
  ctx.globalAlpha = 1;
  const near = (s) => Math.abs(s.x + 16 - (G.p.x + 12)) < 140;
  for (const s of L.signs) if (vis(s.x)) Art.drawSign(ctx, s, near(s) && G.state === 'play', G.t);
  hud();
}
const FONT = '"Arial Rounded MT Bold", "Nunito", "Trebuchet MS", system-ui, sans-serif';
function hud() {
  if (G.attract) return;
  const u = Math.max(0.8, Math.min(1.6, Math.min(W, H * 1.7) / 900)) * dpr;
  ctx.setTransform(u, 0, 0, u, 0, 0);
  const sw = W * dpr / u;
  ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  for (let i = 0; i < 3; i++) Art.heart(ctx, 26 + i * 30, 28, 11, '#ff3f7f', i >= G.hearts);
  // gum meter
  const p = G.p; ctx.fillStyle = 'rgba(60,20,70,0.45)'; Art.rr(ctx, 14, 46, 90, 10, 5); ctx.fill();
  ctx.fillStyle = p.blowLock ? '#aa7090' : '#ff8fc4'; Art.rr(ctx, 14, 46, Math.max(10, 90 * p.gum), 10, 5); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.fillRect(18, 48, Math.max(0, 90 * p.gum - 8), 2);
  // candy + gumballs
  const b = 1 + Math.max(0, G.bump) * 2;
  ctx.save(); ctx.translate(132, 30); ctx.scale(b, b);
  Art.drawItem(ctx, { type: 'o', x: 0, y: -2 }, 0);
  ctx.font = `900 20px ${FONT}`; ctx.strokeStyle = '#4a1450'; ctx.lineWidth = 5; ctx.strokeText('' + G.candy, 18, 6); ctx.fillStyle = '#fff'; ctx.fillText('' + G.candy, 18, 6);
  ctx.restore();
  for (let i = 0; i < G.totalG; i++) { ctx.globalAlpha = i < G.gumballs ? 1 : 0.3; Art.drawItem(ctx, { type: 'G', x: 210 + i * 30, y: 28 }, 0); }
  ctx.globalAlpha = 1;
  // time
  ctx.textAlign = 'right'; ctx.font = `900 18px ${FONT}`;
  const tm = G.time, ts = Math.floor(tm / 60) + ':' + String(Math.floor(tm % 60)).padStart(2, '0');
  ctx.strokeStyle = '#4a1450'; ctx.lineWidth = 5; ctx.strokeText(ts, sw - 60, 34); ctx.fillStyle = '#fff'; ctx.fillText(ts, sw - 60, 34);
  // boss bar
  const B = G.boss;
  if (B && B.st !== 'dead') {
    const bw = Math.min(360, sw - 120), bx = (sw - bw) / 2;
    ctx.textAlign = 'center'; ctx.font = `900 14px ${FONT}`; ctx.strokeText('THE SOUR KING', sw / 2, 72); ctx.fillStyle = '#ffe14f'; ctx.fillText('THE SOUR KING', sw / 2, 72);
    ctx.fillStyle = 'rgba(60,20,70,0.6)'; Art.rr(ctx, bx, 80, bw, 12, 6); ctx.fill();
    ctx.fillStyle = '#ffd23a'; Art.rr(ctx, bx, 80, Math.max(12, bw * B.hp / B.max), 12, 6); ctx.fill();
  }
  // banner
  if (G.banner > 0) {
    const a = Math.min(1, G.banner * 2, (2.4 - G.banner) * 4);
    ctx.globalAlpha = a; ctx.textAlign = 'center';
    const y = H * dpr / u * 0.3;
    ctx.font = `900 16px ${FONT}`; ctx.strokeStyle = '#4a1450'; ctx.lineWidth = 6;
    const lvl = G.L.theme === 5 ? 'BOSS' : 'LEVEL ' + (G.li + 1);
    ctx.strokeText(lvl, sw / 2, y - 30); ctx.fillStyle = '#ffe14f'; ctx.fillText(lvl, sw / 2, y - 30);
    ctx.font = `900 40px ${FONT}`; ctx.lineWidth = 9; ctx.strokeText(G.L.name, sw / 2, y + 10); ctx.fillStyle = '#fff'; ctx.fillText(G.L.name, sw / 2, y + 10);
    ctx.globalAlpha = 1;
  }
}

// ---------- cards
function card(html, cls = '') { cardEl.className = 'card ' + cls; cardEl.innerHTML = html; cardEl.classList.remove('hidden'); G.cardOpen = true; }
function hideCard() { cardEl.classList.add('hidden'); G.cardOpen = false; }
function bind(id, fn) { const b = cardEl.querySelector('#' + id); if (b) b.addEventListener('click', () => { A.wake(); A.S.click(); fn(); }); }
const gumIcons = (n, total) => Array.from({ length: total }, (_, i) => `<span class="gb ${i < n ? 'on' : ''}"></span>`).join('');
const PAR = [28, 30, 36, 40, 46, 75]; // seconds for a gold medal (bot runs ~0.6x this)
function medal() {
  const par = PAR[G.li] || 60, t = G.time, m = t <= par ? ['GOLD', '#ffc93a'] : t <= par * 1.5 ? ['SILVER', '#cfd8e6'] : ['BRONZE', '#d9915a'];
  const nxt = t <= par ? 'perfect pace!' : 'gold under ' + Math.floor(par / 60) + ':' + String(par % 60).padStart(2, '0');
  return '<p class="medal" style="color:' + m[1] + ';font-weight:900;font-size:1.3em;letter-spacing:2px;margin:6px 0 0">&#9733; ' + m[0] + ' TIME &#9733;</p><p class="dim">' + nxt + '</p>';
}
function showWin() {
  G.state = 'card';
  const last = G.li === LEVELS.length - 1, b = save.best[G.li];
  const tm = Math.floor(G.time / 60) + ':' + String(Math.floor(G.time % 60)).padStart(2, '0');
  card(`<h1>${last ? 'SWEET VICTORY!' : 'SWEET!'}</h1><h2>${G.L.name}</h2>
    <div class="gbs">${gumIcons(G.gumballs, G.totalG)}</div>
    <div class="stats"><div><b>${G.candy}</b><span>candy</span></div><div><b>${tm}</b><span>time</span></div><div><b>${G.hearts}</b><span>hearts left</span></div></div>
    ${medal()}
    ${last ? '<p>The Sour King is popped. Candy City is sweet again!</p>' : ''}
    ${b && b.t < G.time - 0.01 ? `<p class="dim">best time ${Math.floor(b.t / 60)}:${String(Math.floor(b.t % 60)).padStart(2, '0')}</p>` : ''}
    <div class="btns">${last ? '<button id="lv" class="def">LEVELS</button>' : '<button id="nx" class="def">NEXT &#9654;</button>'}<button id="rt">RETRY</button>${last ? '' : '<button id="lv">LEVELS</button>'}</div>
    <p class="keys">ENTER = ${last ? 'levels' : 'next'} &nbsp; R = retry</p>`, 'win');
  bind('nx', () => startLevel(G.li + 1)); bind('rt', restart); bind('lv', showLevels);
}
function showFail() {
  G.state = 'card';
  card(`<h1>POPPED!</h1><h2>${G.L.name}</h2><p>Out of hearts. Gum up and go again.</p>
    <div class="btns"><button id="rt" class="def">RETRY</button><button id="lv">LEVELS</button></div><p class="keys">ENTER / R = retry</p>`, 'fail');
  bind('rt', restart); bind('lv', showLevels);
}
function showLevels() {
  if (!G.attract) startLevel(0, true);
  const tiles = LEVELS.map((L, i) => {
    const b = save.best[i], lock = i > save.unlocked;
    return `<button class="lvl ${lock ? 'lock' : ''}" data-i="${i}" ${lock ? 'disabled' : ''}><b>${L.boss ? 'BOSS' : i + 1}</b><span>${L.name}</span><i>${lock ? 'locked' : b ? gumIcons(b.g, b.total || 0) || '&#10003;' : 'new'}</i></button>`;
  }).join('');
  card(`<h1 class="logo">BUBBLE<br>TROUBLE</h1><div class="grid">${tiles}</div><div class="btns"><button id="pl" class="def">PLAY &#9654;</button></div><p class="keys">A D move &middot; SPACE jump, hold to float &middot; S slam &middot; R retry &middot; P pause &middot; M mute</p>`, 'levels');
  for (const b of cardEl.querySelectorAll('.lvl')) b.addEventListener('click', () => { A.wake(); A.S.click(); startLevel(+b.dataset.i); });
  bind('pl', () => startLevel(Math.min(save.unlocked, LEVELS.length - 1)));
}
function togglePause() {
  if (G.state === 'play' && !G.attract) {
    G.state = 'paused';
    card(`<h1>PAUSED</h1><div class="btns"><button id="rs" class="def">RESUME</button><button id="rt">RESTART</button><button id="lv">LEVELS</button></div><p class="keys">${A.isMuted() ? 'sound off' : 'sound on'} &middot; M mute</p>`, 'pause');
    bind('rs', () => { hideCard(); G.state = 'play'; }); bind('rt', restart); bind('lv', showLevels);
  } else if (G.state === 'paused') { hideCard(); G.state = 'play'; }
}

// ---------- loop
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  acc += dt;
  let n = 0; while (acc >= DT && n < 12) { step(DT); acc -= DT; n++; }
  if (n >= 12) acc = 0;
  render();
  requestAnimationFrame(frame);
}

// headless helpers
G.start = (i) => { G.headless = true; startLevel(i); };
G.sim = (sec) => { const n = Math.round(sec / DT); for (let i = 0; i < n; i++) { step(DT); if (G.state !== 'play') break; } return G.state; };
G.render = render;
G.save = save;

if (Q.has('title')) showLevels();
else startLevel(Q.has('lvl') ? Math.max(0, Math.min(LEVELS.length - 1, +Q.get('lvl'))) : Math.min(save.unlocked, LEVELS.length - 1));
requestAnimationFrame(frame);
