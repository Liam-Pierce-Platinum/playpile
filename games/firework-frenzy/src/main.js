import { LEVELS, GROUND } from './levels.js';
import { makeWorld, step, botInput, starsFor, K } from './sim.js';
import * as R from './render.js';
import { text, textWidth } from './font.js';
import { wake, sfx, engine, setMuted, A } from './audio.js';

const H = R.H, Q = new URLSearchParams(location.search);
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 320;

// ---------- save ----------
const SKEY = 'firework_frenzy_v1';
let save = { unlocked: 1, stars: [], best: 0, played: false };
try { const j = JSON.parse(localStorage.getItem(SKEY) || 'null'); if (j) save = { ...save, ...j }; } catch (e) { }
function persist() { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { } }

// ---------- layout ----------
function resize() {
  const vw = innerWidth, vh = innerHeight;
  W = Math.max(240, Math.min(400, Math.round(H * vw / vh)));
  cv.width = W; cv.height = H;
  const sc = Math.min(vw / W, vh / H);
  cv.style.width = Math.floor(W * sc) + 'px'; cv.style.height = Math.floor(H * sc) + 'px';
  ctx.imageSmoothingEnabled = false;
  R.buildBackground(W);
}
addEventListener('resize', resize); resize();

// ---------- input ----------
const keys = {}; let kickQ = false, pressQ = false, touchMode = false;
const ptrs = new Map();
const isThrust = (c) => c === 'Space' || c === 'ArrowUp' || c === 'KeyW';
addEventListener('keydown', (e) => {
  wake();
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys[e.code] = true;
  if (isThrust(e.code)) { kickQ = true; pressQ = true; }
  onKey(e.code);
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; ptrs.clear(); if (mode === 'play' && !s.dead && !s.done) setMode('pause'); });
function toLocal(e) { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; }
cv.addEventListener('pointerdown', (e) => {
  wake(); e.preventDefault();
  if (e.pointerType === 'touch') touchMode = true;
  const [x, y] = toLocal(e); ptrs.set(e.pointerId, { x, y, touch: e.pointerType === 'touch' });
  if (mode === 'play') { if (e.pointerType === 'touch' && zone(x, y) === 'fire') { kickQ = true; pressQ = true; } if (hit(pauseBtn(), x, y)) setMode('pause'); return; }
  for (let i = 0; i < menu.length; i++) if (hit(menu[i], x, y)) { sel = i; activate(menu[i]); return; }
});
cv.addEventListener('pointermove', (e) => { if (ptrs.has(e.pointerId)) { const [x, y] = toLocal(e); const p = ptrs.get(e.pointerId); p.x = x; p.y = y; } else if (e.pointerType === 'mouse') { const [x, y] = toLocal(e); for (let i = 0; i < menu.length; i++) if (hit(menu[i], x, y)) sel = i; } });
const up = (e) => ptrs.delete(e.pointerId);
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
const hit = (b, x, y) => b && x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h;
const TB = () => ({ l: { x: 6, y: H - 34, w: 30, h: 28 }, r: { x: 40, y: H - 34, w: 30, h: 28 }, f: { x: W - 50, y: H - 40, w: 44, h: 34 } });
function zone(x, y) { const t = TB(); if (x < W / 2) return x < (t.l.x + t.l.w + t.r.x) / 2 ? 'left' : 'right'; return 'fire'; }
const pauseBtn = () => ({ x: W - 13, y: 3, w: 10, h: 10 });
function readInput() {
  let left = keys.ArrowLeft || keys.KeyA, right = keys.ArrowRight || keys.KeyD, thrust = keys.Space || keys.ArrowUp || keys.KeyW;
  for (const p of ptrs.values()) if (p.touch) { const z = zone(p.x, p.y); if (z === 'left') left = true; else if (z === 'right') right = true; else thrust = true; }
  const kick = kickQ; kickQ = false;
  return { left: !!left, right: !!right, thrust: !!thrust, kick };
}

// ---------- game state ----------
let mode = 'play', li = 0, s = null, bot = null, botOn = Q.has('bot'), resultT = 0, banner = 0, t = 0;
let cam = { x: 0, shake: 0 }, popups = [], flashA = 0, finale = 0, menu = [], sel = 0, result = null;
let demo = null, demoBot = null;

function start(i) {
  li = i; s = makeWorld(i < 0 ? null : LEVELS[i], { seed: (Date.now() % 100000) + 1 }); bot = {};
  R.P.length = 0; popups = []; cam.x = Math.max(0, s.r.x - W / 3); cam.shake = 0; finale = 0; result = null; banner = 2.6; flashA = 0;
  setMode('play');
}
function setMode(m) {
  mode = m; sel = 0; pressQ = false;
  if (m === 'title') { menu = [btn('PLAY', 0), btn('LEVELS', 1), btn('ENDLESS', 2)]; if (!demo) newDemo(); }
  else if (m === 'select') {
    if (!demo) newDemo();
    menu = [];
    const cols = 5, tw = 34, th = 30, gx = 8, x0 = Math.round(W / 2 - (cols * tw + (cols - 1) * gx) / 2);
    LEVELS.forEach((L, i) => menu.push({ x: x0 + (i % cols) * (tw + gx), y: 44 + Math.floor(i / cols) * (th + 10), w: tw, h: th, lv: i, act: () => { if (i < save.unlocked) start(i); else sfx('nofuel'); } }));
    menu.push({ x: W / 2 - 50, y: 130, w: 100, h: 13, label: 'ENDLESS', act: () => start(-1) });
    menu.push({ x: W / 2 - 30, y: 151, w: 60, h: 13, label: 'BACK', act: () => setMode('title') });
    sel = Math.min(save.unlocked - 1, LEVELS.length - 1);
  } else if (m === 'pause') menu = [btn('RESUME', 0, () => setMode('play')), btn('RETRY', 1, () => start(li)), btn('LEVELS', 2, () => setMode('select'))];
  else if (m === 'result') {
    resultT = 0;
    if (result.win) menu = li < LEVELS.length - 1 ? [btn('NEXT', 0, () => start(li + 1)), btn('RETRY', 1, () => start(li)), btn('LEVELS', 2, () => setMode('select'))] : [btn('ENDLESS', 0, () => start(-1)), btn('RETRY', 1, () => start(li)), btn('LEVELS', 2, () => setMode('select'))];
    else menu = [btn('RETRY', 0, () => start(li)), btn(li < 0 ? 'MENU' : 'LEVELS', 1, () => setMode(li < 0 ? 'title' : 'select'))];
    for (const b of menu) b.y += result.win ? 8 : -2;
  } else menu = [];
}
function btn(label, i, act) {
  const acts = { PLAY: () => start(Math.min(save.unlocked, LEVELS.length) - 1), LEVELS: () => setMode('select'), ENDLESS: () => start(-1) };
  return { x: Math.round(W / 2 - 40), y: 92 + i * 17, w: 80, h: 13, label, act: act || acts[label] };
}
function activate(b) { sfx('ui'); b.act(); }
function onKey(c) {
  if (c === 'KeyM') { setMuted(!A.muted); return; }
  if (mode === 'play') {
    if (c === 'Escape' || c === 'KeyP') setMode('pause');
    else if (c === 'KeyR') start(li);
    return;
  }
  if (c === 'Escape') { if (mode === 'pause') setMode('play'); else if (mode === 'select') setMode('title'); return; }
  if (mode === 'result' && c === 'KeyR') { start(li); return; }
  if (!menu.length) return;
  const grid = mode === 'select';
  if (c === 'ArrowDown' || c === 'KeyS') sel = grid ? (sel < 5 ? sel + 5 : sel < 10 ? 10 : Math.min(menu.length - 1, sel + 1)) : (sel + 1) % menu.length;
  else if (c === 'ArrowUp' && !(mode === 'result' && resultT < 0.5)) sel = grid ? (sel >= 10 ? (sel === 10 ? 5 : 10) : sel >= 5 ? sel - 5 : sel) : (sel + menu.length - 1) % menu.length;
  else if (grid && (c === 'ArrowLeft' || c === 'KeyA') && sel < 10) sel = Math.max(0, sel - 1);
  else if (grid && (c === 'ArrowRight' || c === 'KeyD') && sel < 10) sel = Math.min(9, sel + 1);
  else if (c === 'Enter' || c === 'Space') { if (mode === 'result' && resultT < 0.5) return; activate(menu[sel]); }
}

// ---------- events -> juice ----------
function popup(x, y, str, col = '#ffffff', big = 1, life = 1) { popups.push({ x, y, str, col, big, t: 0, life, world: x != null }); }
function handle(e) {
  switch (e.k) {
    case 'launch': sfx('launch'); R.smoke(s.r.x, s.r.y + 6, 10); break;
    case 'kick': { const [fx, fy] = [Math.sin(s.r.a), -Math.cos(s.r.a)]; R.flame(s.r.x - fx * 6, s.r.y - fy * 6, Math.atan2(-fy, -fx), s.r.vx, s.r.vy, 16); sfx('kick'); cam.shake = Math.max(cam.shake, 1.2); break; }
    case 'ring': sfx('ring', e.n); R.sparks(e.x, e.y, 24, 70, ['#ffffff', '#fff3a0', '#ffd23f', '#b8792a'], { life: 0.5, g: 20 }); popup(e.x, e.y - 14, '+200', '#ffd23f'); cam.shake = Math.max(cam.shake, 1); break;
    case 'lit': sfx('lit'); R.sparks(e.x, e.y - 3, 6, 30, ['#ffffff', '#ffd23f'], { life: 0.25, g: 0 }); break;
    case 'pop': {
      R.firework(e.x, e.y, e.c, 1 + Math.min(e.n, 6) * 0.1); sfx('pop', e.n);
      cam.shake = Math.max(cam.shake, 2 + Math.min(e.n, 8) * 0.35); flashA = Math.max(flashA, 0.06 + Math.min(e.n, 8) * 0.012);
      popup(e.x, e.y - 8, '+' + e.pts, e.c);
      if (e.n >= 2) { popups = popups.filter((p) => !p.chain); popups.push({ x: null, y: 40, str: 'CHAIN *' + e.n, col: ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f6d'], big: e.n >= 5 ? 3 : 2, t: 0, life: 0.9, chain: 1 }); }
      break;
    }
    case 'shape': sfx('shape'); popup(null, 58, 'SHAPE BONUS +1000', ['#ffffff', '#c77dff', '#c77dff', '#9d4dff', '#7a2fd0'], 2, 1.8); flashA = 0.3; for (let i = 0; i < 4; i++) setTimeout(() => { if (s) { R.firework(e.x + (Math.random() - 0.5) * 70, e.y + (Math.random() - 0.5) * 40, ['#ff4f6d', '#ffd23f', '#3fd0ff', '#c77dff'][i], 1.4); sfx('boom'); } }, 120 + i * 160); break;
    case 'crash':
      sfx('crash'); R.firework(e.x, e.y, '#ff5a3c', 1.3); R.smoke(e.x, e.y, 26); cam.shake = 7; flashA = 0.45;
      R.sparks(e.x, e.y, 30, 120, ['#ffffff', '#ffd23f', '#ff9a3c', '#b8283a', '#3a3048'], { life: 1.2, g: 160, drag: 1, sz: 1 });
      resultT = -1.1; result = { win: false, why: e.why, endless: li < 0 };
      if (li < 0) { const sc = s.score + Math.floor(s.dist / 4); result.score = sc; result.best = save.best; if (sc > save.best) { save.best = sc; result.newBest = true; persist(); } }
      break;
    case 'land': sfx('land'); R.smoke(e.x, e.y - 1, 6); cam.shake = Math.max(cam.shake, 0.8); break;
    case 'nofuel': sfx('nofuel'); popup(null, 70, 'OUT OF FUEL!', ['#ffffff', '#ff9a9a', '#ff4f6d', '#ff4f6d', '#b8283a'], 2, 1.4); break;
    case 'clear': {
      sfx('clear'); finale = 2.0; flashA = 0.25;
      const st = starsFor(s); result = { win: true, stars: st, score: s.score, bonus: e.bonus };
      save.stars[li] = Math.max(save.stars[li] || 0, st); save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, li + 2)); save.played = true; persist();
      popup(null, 50, 'CLEAR!', ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f6d'], 4, 1.8);
      break;
    }
  }
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
const STEP = 1 / 120;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; t += dt;
  update(dt); draw(); requestAnimationFrame(frame);
}
function simulate(world, inpFn, dt, onEvent) {
  acc += dt; let n = 0;
  while (acc >= STEP && n < 12) { const inp = inpFn(); step(world, inp, STEP); if (onEvent) for (const e of world.events) onEvent(e); acc -= STEP; n++; }
}
let lastInp = { left: false, right: false, thrust: false, kick: false };
function update(dt) {
  if (mode === 'title' || (mode === 'select' && demo)) { updateDemo(dt); R.updateParticles(dt); return; }
  if (mode === 'play') {
    let first = true;
    simulate(s, () => { const inp = botOn ? botInput(s, bot) : readInput(); if (!first) inp.kick = false; first = false; lastInp = inp; return inp; }, dt, handle);
    if (banner > 0 && s.launched) banner -= dt * 2; else if (banner > 0) banner = Math.max(banner, 0.6);
    const r = s.r, fx = Math.sin(r.a), fy = -Math.cos(r.a), sp = Math.hypot(r.vx, r.vy);
    if (!s.dead) {
      if (r.thr) R.flame(r.x - fx * 6, r.y - fy * 6, Math.atan2(-fy, -fx), r.vx, r.vy, Math.max(1, Math.round(dt * 260)));
      else if (s.launched && Math.random() < dt * 40) R.sparks(r.x - fx * 6, r.y - fy * 6, 1, 15, ['#fff3a0', '#ff9a3c', '#b8283a'], { life: 0.3, g: 30 });
      if (r.thr && Math.random() < dt * 8) R.smoke(r.x - fx * 8, r.y - fy * 8, 1);
    }
    engine(r.thr, sp, !s.dead);
    // camera
    const tx = r.x - W / 2 + r.vx * 0.35;
    cam.x += (tx - cam.x) * Math.min(1, dt * 5);
    cam.x = s.w < W ? (s.w - W) / 2 : Math.max(s.left, Math.min(s.w - W, cam.x));
    if (finale > 0) {
      finale -= dt;
      if (Math.random() < dt * 9) { R.firework(cam.x + 20 + Math.random() * (W - 40), 20 + Math.random() * 80, ['#ff4f6d', '#ffd23f', '#3fd0ff', '#9dff5c', '#c77dff'][Math.floor(Math.random() * 5)], 1.2); sfx('boom'); }
      if (finale <= 0) setMode('result');
    }
    if (s.dead && result) { resultT += dt; if (resultT >= 0) setMode('result'); }
  } else { engine(false, 0, false); if (mode === 'result') resultT += dt; }
  R.updateParticles(mode === 'pause' ? 0 : dt);
  cam.shake = Math.max(0, cam.shake - dt * 14); flashA = Math.max(0, flashA - dt * 1.6);
  for (const p of popups) p.t += dt; popups = popups.filter((p) => p.t < p.life);
}
function newDemo() { const i = Math.floor(Math.random() * LEVELS.length); demo = makeWorld(LEVELS[i]); demoBot = {}; R.P.length = 0; }
let demoAcc = 0;
function updateDemo(dt) {
  demoAcc += dt;
  while (demoAcc >= STEP) {
    step(demo, botInput(demo, demoBot), STEP); demoAcc -= STEP;
    for (const e of demo.events) if (e.k === 'pop') R.firework(e.x, e.y, e.c, 1); else if (e.k === 'ring') R.sparks(e.x, e.y, 16, 60, ['#ffffff', '#ffd23f'], { life: 0.4, g: 10 });
    if (demo.r.thr) { const fx = Math.sin(demo.r.a), fy = -Math.cos(demo.r.a); if (Math.random() < 0.5) R.flame(demo.r.x - fx * 6, demo.r.y - fy * 6, Math.atan2(-fy, -fx), demo.r.vx, demo.r.vy, 1); }
    if (demo.dead || demo.done || demo.t > 40) { newDemo(); break; }
  }
  const tx = demo.r.x - W / 2; cam.x += (tx - cam.x) * Math.min(1, dt * 3); cam.x = Math.max(0, Math.min(demo.w - W, cam.x));
}

// ---------- draw ----------
function drawWorld(w, rocketVisible) {
  const sx = cam.shake ? Math.round((Math.random() - 0.5) * cam.shake * 2) : 0, sy = cam.shake ? Math.round((Math.random() - 0.5) * cam.shake * 2) : 0;
  const cx = Math.round(cam.x);
  R.drawBackground(ctx, W, cx, t);
  ctx.save(); ctx.translate(sx, sy);
  R.drawBuildings(ctx, w, cx, W, t); R.drawGround(ctx, cx, W);
  if (w.lv && !w.launched) { ctx.fillStyle = '#5a4a6e'; ctx.fillRect(Math.round(w.lv.start[0] - cx) - 5, GROUND - 2, 11, 2); ctx.fillStyle = '#ff4f6d'; ctx.fillRect(Math.round(w.lv.start[0] - cx) - 5, GROUND - 2, 11, 1); }
  R.drawWires(ctx, w, cx, t); R.drawRings(ctx, w, cx, t); R.drawShells(ctx, w, cx, t); R.drawBirds(ctx, w, cx, t);
  R.drawParticles(ctx, cx);
  if (rocketVisible && !w.dead) {
    const r = w.r, fx = Math.sin(r.a), fy = -Math.cos(r.a);
    if (r.thr) { for (let k = 0; k < 5; k++) { const fl = Math.random() * 1.5; ctx.fillStyle = R.FIRE[Math.min(6, k + (Math.random() < 0.3 ? 1 : 0))]; ctx.fillRect(Math.round(r.x - fx * (6 + k * 1.6 + fl) - cx), Math.round(r.y - fy * (6 + k * 1.6 + fl)), k < 2 ? 2 : 1, k < 2 ? 2 : 1); } R.glow(ctx, r.x - fx * 8 - cx, r.y - fy * 8, 10, '#ff9a3c', 0.5); }
    else R.glow(ctx, r.x - fx * 5 - cx, r.y - fy * 5, 5, '#ffd23f', 0.25);
    R.drawRocket(ctx, r.x - cx, r.y, r.a, false);
    if (r.y < 2) { const ax = Math.round(r.x - cx); ctx.fillStyle = '#ffd23f'; ctx.fillRect(ax - 2, 3, 5, 1); ctx.fillRect(ax - 1, 2, 3, 1); ctx.fillRect(ax, 1, 1, 1); }
    const sp = Math.hypot(r.vx, r.vy);
    if (sp > 170) { ctx.fillStyle = 'rgba(255,240,220,0.35)'; for (let i = 0; i < 4; i++) { const ox = (Math.random() - 0.5) * W, oy = (Math.random() - 0.5) * H * 0.8; const L = (sp - 150) * 0.12; for (let k = 0; k < L; k++) ctx.fillRect(Math.round(W / 2 + ox - r.vx / sp * k), Math.round(H / 2 + oy - r.vy / sp * k), 1, 1); } }
  }
  ctx.restore();
}

function drawPopups() {
  for (const p of popups) {
    const k = p.t / p.life, a = k > 0.75 ? Math.floor((1 - k) * 16) % 2 : 1;
    if (!a) continue;
    if (p.world) text(ctx, p.str, p.x - cam.x, p.y - p.t * 18, p.col, { align: 'center' });
    else { const pop = p.t < 0.1 ? 1 : 0; text(ctx, p.str, W / 2, p.y - pop, p.col, { align: 'center', sc: p.big + pop, outline: true }); }
  }
}

function drawHUD() {
  const r = s.r;
  // top bar
  ctx.fillStyle = 'rgba(11,7,22,0.55)'; ctx.fillRect(0, 0, W, 11);
  if (li >= 0) {
    text(ctx, (li + 1) + ' ' + LEVELS[li].name, 3, 3, '#d8c8f0');
    const x = 6 + textWidth((li + 1) + ' ' + LEVELS[li].name) + 8;
    ringIcon(x, 2); text(ctx, s.ringsGot + '/' + s.rings.length, x + 6, 3, s.ringsGot === s.rings.length ? '#9dff5c' : '#ffd23f');
    const x2 = x + 30; shellIcon(x2, 3); text(ctx, s.pops + '/' + s.popsNeed, x2 + 7, 3, s.pops >= s.popsNeed ? '#9dff5c' : '#ff8aa0');
  } else {
    text(ctx, Math.floor(s.dist / 10) + 'M', 3, 3, '#d8c8f0'); text(ctx, 'BEST ' + save.best, 40, 3, '#8e7fb8');
  }
  const sc = li < 0 ? s.score + Math.floor(s.dist / 4) : s.score;
  text(ctx, String(sc).padStart(6, '0'), W - 18, 3, '#ffffff', { align: 'right' });
  // pause glyph
  const pb = pauseBtn(); ctx.fillStyle = '#d8c8f0'; ctx.fillRect(pb.x + 3, pb.y + 2, 2, 6); ctx.fillRect(pb.x + 6, pb.y + 2, 2, 6);
  // fuel
  const fw = 48, fx = 21, fy = 15, f = s.fuel / s.fuelMax;
  text(ctx, 'FUEL', 3, fy, f < 0.25 && Math.floor(t * 6) % 2 ? '#ff4f6d' : '#d8c8f0');
  ctx.fillStyle = '#0b0716'; ctx.fillRect(fx - 1, fy - 1, fw + 2, 6);
  ctx.fillStyle = '#2a1a48'; ctx.fillRect(fx, fy, fw, 4);
  const col = f > 0.5 ? '#9dff5c' : f > 0.25 ? '#ffd23f' : '#ff4f6d';
  const n = Math.ceil(f * fw / 4);
  for (let i = 0; i < n; i++) { ctx.fillStyle = col; ctx.fillRect(fx + i * 4, fy, 3, 4); ctx.fillStyle = R.shade(col, 1.4); ctx.fillRect(fx + i * 4, fy, 3, 1); }
  // arrows to things off screen
  if (s.lv) {
    const left = [...s.rings.filter((g) => !g.got).map((g) => [g.x, g.y, '#ffd23f']), ...s.shells.filter((h) => h.st === 0).map((h) => [h.x, h.y, '#ff8aa0'])];
    let lc = null, rc = null;
    for (const o of left) { if (o[0] < cam.x - 4 && (!lc || o[0] > lc[0])) lc = o; if (o[0] > cam.x + W + 4 && (!rc || o[0] < rc[0])) rc = o; }
    if (rc) arrow(W - 4, Math.max(16, Math.min(H - 20, rc[1])), 1, rc[2]);
    if (lc) arrow(3, Math.max(16, Math.min(H - 20, lc[1])), -1, lc[2]);
  }
  // touch buttons
  if (touchMode) {
    const tb = TB(), inp = lastInp;
    tbtn(tb.l, '<', inp.left); tbtn(tb.r, '>', inp.right); tbtn(tb.f, 'FIRE', inp.thrust, true);
  }
  // level banner + launch prompt
  if (!s.launched && !s.dead) {
    const a = Math.min(1, banner);
    if (a > 0) {
      text(ctx, li < 0 ? 'ENDLESS' : 'LEVEL ' + (li + 1), W / 2, 34, '#d8c8f0', { align: 'center', outline: true });
      text(ctx, li < 0 ? 'HOW FAR CAN YOU GO?' : LEVELS[li].name, W / 2, 44, ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f6d'], { align: 'center', sc: 2, outline: true });
      text(ctx, li < 0 ? 'RINGS REFUEL YOU' : LEVELS[li].hint, W / 2, 60, '#9dd0ff', { align: 'center', outline: true });
    }
    if (Math.floor(t * 3) % 3) text(ctx, touchMode ? 'HOLD FIRE TO LAUNCH' : 'HOLD SPACE TO LAUNCH', W / 2, 78, '#ffffff', { align: 'center', outline: true });
    if (!touchMode && li <= 0) text(ctx, '< > TURN   SPACE THRUST', W / 2, 88, '#8e7fb8', { align: 'center', outline: true });
  }
}
function ringIcon(x, y) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(x + 1, y, 2, 1); ctx.fillRect(x + 1, y + 6, 2, 1); ctx.fillRect(x, y + 1, 1, 5); ctx.fillRect(x + 3, y + 1, 1, 5); }
function shellIcon(x, y) { ctx.fillStyle = '#ff4f6d'; ctx.fillRect(x, y + 1, 5, 3); ctx.fillRect(x + 1, y, 3, 5); ctx.fillStyle = '#ffb0c0'; ctx.fillRect(x + 1, y + 1, 1, 1); }
function arrow(x, y, dir, c) {
  if (Math.floor(t * 4) % 2) return;
  ctx.fillStyle = '#0b0716'; for (let i = 0; i < 4; i++) ctx.fillRect(x - dir * i + (dir < 0 ? 0 : 0), y - i - 1, 1, i * 2 + 3);
  ctx.fillStyle = c; for (let i = 0; i < 3; i++) ctx.fillRect(x - dir * (i + 1), y - i, 1, i * 2 + 1);
}
function tbtn(b, label, on, wide) {
  ctx.globalAlpha = on ? 0.85 : 0.45; R.panel(ctx, b.x, b.y, b.w, b.h, on ? '#ff4f6d' : '#2a1a48'); ctx.globalAlpha = 1;
  text(ctx, label, b.x + b.w / 2, b.y + b.h / 2 - (wide ? 5 : 5), '#ffffff', { align: 'center', sc: wide ? 2 : 2 });
}

const TITLE_COLS = ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f6d'];
function drawTitle() {
  drawWorld(demo, true);
  ctx.fillStyle = 'rgba(11,7,22,0.45)'; ctx.fillRect(0, 0, W, H);
  const bob = Math.round(Math.sin(t * 2) * 1.5);
  text(ctx, 'FIREWORK', W / 2, 26 + bob, TITLE_COLS, { align: 'center', sc: 4, outline: true });
  text(ctx, 'FRENZY', W / 2, 50 + bob, ['#ffffff', '#c9f0ff', '#3fd0ff', '#2a8ad0', '#c77dff'], { align: 'center', sc: 4, outline: true });
  if (Math.random() < 0.03) { R.firework(cam.x + Math.random() * W, 20 + Math.random() * 50, ['#ff4f6d', '#ffd23f', '#3fd0ff', '#c77dff'][Math.floor(Math.random() * 4)], 0.9); }
  menu.forEach((b, i) => R.button(ctx, b, i === sel, t));
  text(ctx, touchMode ? 'LEFT SIDE TURNS - RIGHT SIDE FIRES' : 'ARROWS / A D TURN  -  SPACE THRUST  -  M MUTE', W / 2, H - 10, '#8e7fb8', { align: 'center' });
}
function drawSelect() {
  drawWorld(demo, true);
  ctx.fillStyle = 'rgba(11,7,22,0.7)'; ctx.fillRect(0, 0, W, H);
  text(ctx, 'PICK A SHOW', W / 2, 16, TITLE_COLS, { align: 'center', sc: 2, outline: true });
  const total = save.stars.reduce((a, b) => a + (b || 0), 0);
  R.starIcon(ctx, W / 2 + 46, 18, true); text(ctx, total + '/30', W / 2 + 53, 18, '#ffd23f');
  menu.forEach((b, i) => {
    if (b.lv == null) { R.button(ctx, b, i === sel, t); return; }
    const locked = b.lv >= save.unlocked, on = i === sel;
    R.panel(ctx, b.x, b.y - (on ? 1 : 0), b.w, b.h, locked ? '#160d26' : on ? '#ff4f6d' : '#2a1a48');
    if (locked) { ctx.fillStyle = '#4a3a66'; ctx.fillRect(b.x + 14, b.y + 10, 7, 6); ctx.fillRect(b.x + 15, b.y + 6, 1, 4); ctx.fillRect(b.x + 19, b.y + 6, 1, 4); ctx.fillRect(b.x + 15, b.y + 6, 5, 1); }
    else {
      text(ctx, String(b.lv + 1), b.x + b.w / 2, b.y + 5 - (on ? 1 : 0), '#ffffff', { align: 'center', sc: 2 });
      const st = save.stars[b.lv] || 0; for (let k = 0; k < 3; k++) R.starIcon(ctx, b.x + 3 + k * 10, b.y + 20 - (on ? 1 : 0), k < st);
    }
  });
  const cur = menu[sel];
  if (cur && cur.lv != null) text(ctx, cur.lv < save.unlocked ? LEVELS[cur.lv].name : 'LOCKED - CLEAR THE ONE BEFORE', W / 2, 120, '#d8c8f0', { align: 'center' });
  else if (cur && cur.label === 'ENDLESS') text(ctx, 'BEST ' + save.best, W / 2, 120, '#d8c8f0', { align: 'center' });
}
function drawResult() {
  ctx.fillStyle = 'rgba(11,7,22,0.55)'; ctx.fillRect(0, 0, W, H);
  const last = menu[menu.length - 1]; R.panel(ctx, W / 2 - 80, 24, 160, last.y + last.h + 8 - 24);
  if (result.win) {
    text(ctx, li === LEVELS.length - 1 ? 'SHOW COMPLETE!' : 'CLEAR!', W / 2, 32, TITLE_COLS, { align: 'center', sc: 2, outline: true });
    for (let k = 0; k < 3; k++) {
      const shown = resultT > 0.3 + k * 0.3, on = shown && k < result.stars;
      if (on && !result['s' + k]) { result['s' + k] = 1; sfx('star', 1 + k * 0.26); R.sparks(cam.x + W / 2 - 22 + k * 22 + 5, 54, 14, 50, ['#ffffff', '#ffd23f'], { life: 0.4, g: 20 }); }
      R.starIcon(ctx, W / 2 - 22 + k * 22 - 2, 48, on, 2);
    }
    text(ctx, 'SCORE ' + result.score, W / 2, 66, '#ffffff', { align: 'center' });
    text(ctx, 'FUEL BONUS +' + result.bonus, W / 2, 74, '#9dff5c', { align: 'center' });
    const hints = [s.pops < s.shellsTotal ? 'STAR: BURST EVERY FIREWORK' : '', s.fuel < s.fuelMax * 0.25 ? 'STAR: LAND WITH 1/4 FUEL LEFT' : ''].filter(Boolean);
    text(ctx, hints[0] || 'PERFECT SHOW!', W / 2, 83, '#8e7fb8', { align: 'center' });
  } else if (result.endless) {
    text(ctx, 'SHOW OVER', W / 2, 32, TITLE_COLS, { align: 'center', sc: 2, outline: true });
    text(ctx, result.why, W / 2, 48, '#ff8aa0', { align: 'center' });
    text(ctx, 'SCORE ' + result.score, W / 2, 60, '#ffffff', { align: 'center', sc: 1 });
    text(ctx, result.newBest ? 'NEW BEST!' : 'BEST ' + save.best, W / 2, 70, result.newBest ? '#9dff5c' : '#8e7fb8', { align: 'center' });
  } else {
    text(ctx, 'CRASHED!', W / 2, 32, ['#ffffff', '#ff9a9a', '#ff4f6d', '#ff4f6d', '#b8283a'], { align: 'center', sc: 2, outline: true });
    text(ctx, result.why, W / 2, 50, '#ffd23f', { align: 'center' });
    text(ctx, 'RINGS ' + s.ringsGot + '/' + s.rings.length + '   POPS ' + s.pops + '/' + s.popsNeed, W / 2, 62, '#d8c8f0', { align: 'center' });
    text(ctx, 'R OR SPACE TO RETRY', W / 2, 72, '#8e7fb8', { align: 'center' });
  }
  menu.forEach((b, i) => R.button(ctx, b, i === sel, t));
}
function drawPause() {
  ctx.fillStyle = 'rgba(11,7,22,0.6)'; ctx.fillRect(0, 0, W, H);
  text(ctx, 'PAUSED', W / 2, 60, TITLE_COLS, { align: 'center', sc: 2, outline: true });
  menu.forEach((b, i) => R.button(ctx, b, i === sel, t));
}
function draw() {
  ctx.imageSmoothingEnabled = false;
  if (mode === 'title') { drawTitle(); return; }
  if (mode === 'select') { drawSelect(); return; }
  drawWorld(s, true);
  drawPopups();
  if (mode === 'play') drawHUD();
  if (flashA > 0) { ctx.fillStyle = `rgba(255,240,230,${flashA.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (mode === 'result') drawResult();
  if (mode === 'pause') drawPause();
}

// ---------- boot ----------
if (Q.has('title')) setMode('title');
else if (Q.has('endless')) start(-1);
else start(Q.has('level') ? Math.max(0, Math.min(LEVELS.length - 1, +Q.get('level') - 1)) : Math.min(save.unlocked, LEVELS.length) - 1);
requestAnimationFrame(frame);

// test hooks (headless scripts drive these)
window.__G = {
  LEVELS, K, get s() { return s; }, get mode() { return mode; }, get result() { return result; }, get save() { return save; },
  start, setMode, set bot(v) { botOn = v; }, get menu() { return menu; },
  fast(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n && mode === 'play' && !s.dead && !(s.done && finale <= 0); i++) { step(s, botInput(s, bot), STEP); for (const e of s.events) handle(e); } },
};
