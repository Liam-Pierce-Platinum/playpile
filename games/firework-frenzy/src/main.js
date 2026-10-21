import { LEVELS, GROUND } from './levels.js';
import { makeWorld, step, botInput, starsFor, K } from './sim.js';
import * as R from './render.js';
import { text, textWidth } from './font.js';
import { wake, sfx, engine, setMuted, A } from './audio.js';
import { CATS, CATALOG, ACH, DEFAULT_LOOK, FREE, findItem, FLAMES, RAINBOW_HUES, hsl } from './cosmetics.js';
import { COLORS } from './levels.js';

const H = R.H, Q = new URLSearchParams(location.search);
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 320;

// ---------- save ----------
// v2 adds coins, owned looks, the equipped look (eq) and achievements. Older saves are
// migrated in place: progress kept, every field checked, plus 5 coins per star already earned.
const SKEY = 'firework_frenzy_v1';
const CAT_IDS = CATS.map((c) => c[0]);
function freshSave() { return { v: 2, unlocked: 1, stars: [], best: 0, played: false, coins: 0, owned: {}, eq: { ...DEFAULT_LOOK }, ach: {}, fresh: [], bestChain: 0, bestDist: 0 }; }
function owns(sv, cat, id) { const it = findItem(cat, id); if (!it) return false; if (it.ach) return !!sv.ach[it.ach]; return FREE(it) || (sv.owned[cat] || []).includes(id); }
function achItem(k) { for (const c of CAT_IDS) for (const it of CATALOG[c]) if (it.ach === k) return { cat: c, it }; return null; }
function giveAch(sv, k) { if (sv.ach[k]) return false; sv.ach[k] = true; const a = achItem(k); if (a && !sv.fresh.includes(a.cat + ':' + a.it.id)) sv.fresh.push(a.cat + ':' + a.it.id); return true; }
function retroAch(sv) {
  if (LEVELS.every((_, i) => (sv.stars[i] || 0) >= 1)) giveAch(sv, 'allclear');
  if (LEVELS.every((_, i) => (sv.stars[i] || 0) >= 3)) giveAch(sv, 'allstars');
  if (sv.bestChain >= 10) giveAch(sv, 'chain10');
  if (sv.bestDist >= 5000) giveAch(sv, 'far');
}
function migrate(j) {
  const d = freshSave();
  if (!j || typeof j !== 'object' || Array.isArray(j)) return d;
  const num = (v, lo, hi, def) => (typeof v === 'number' || (typeof v === 'string' && v.trim() !== '')) && Number.isFinite(+v) ? Math.max(lo, Math.min(hi, Math.floor(+v))) : def;
  d.unlocked = num(j.unlocked, 1, LEVELS.length, 1);
  d.stars = Array.isArray(j.stars) ? LEVELS.map((_, i) => num(j.stars[i], 0, 3, 0)) : [];
  d.best = num(j.best, 0, 1e9, 0); d.played = !!j.played;
  d.coins = num(j.coins, 0, 1e9, 0); d.bestChain = num(j.bestChain, 0, 1e6, 0); d.bestDist = num(j.bestDist, 0, 1e9, 0);
  if (j.owned && typeof j.owned === 'object') for (const c of CAT_IDS) if (Array.isArray(j.owned[c])) d.owned[c] = [...new Set(j.owned[c].filter((id) => { const it = findItem(c, id); return it && !it.ach; }))];
  if (j.ach && typeof j.ach === 'object') for (const k in ACH) if (j.ach[k] === true) d.ach[k] = true;
  if (Array.isArray(j.fresh)) d.fresh = j.fresh.filter((k) => typeof k === 'string').slice(0, 20);
  if (!(j.v >= 2)) d.coins += 5 * d.stars.reduce((a, b) => a + b, 0); // one-time welcome gift for old saves
  retroAch(d);
  if (j.eq && typeof j.eq === 'object') for (const c of CAT_IDS) if (typeof j.eq[c] === 'string' && owns(d, c, j.eq[c])) d.eq[c] = j.eq[c];
  return d;
}
let save = freshSave();
try { save = migrate(JSON.parse(localStorage.getItem(SKEY) || 'null')); } catch (e) { save = freshSave(); }
function persist() { try { localStorage.setItem(SKEY, JSON.stringify(save)); } catch (e) { } }
persist();
R.setLook(save.eq);

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
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
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
  if (mode === 'garage') { garageDown(e.pointerId, x, y); return; }
  for (let i = 0; i < menu.length; i++) if (hit(menu[i], x, y)) { sel = i; activate(menu[i]); return; }
});
cv.addEventListener('pointermove', (e) => { if (ptrs.has(e.pointerId)) { const [x, y] = toLocal(e); const p = ptrs.get(e.pointerId); p.x = x; p.y = y; } else if (e.pointerType === 'mouse') { const [x, y] = toLocal(e); for (let i = 0; i < menu.length; i++) if (hit(menu[i], x, y)) sel = i; } });
const up = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && mode === 'garage') garageUp(e.pointerId, p.x, p.y); };
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
  s.coins = 0; flyers = []; shownCoins = save.coins; R.resetTrail();
  R.P.length = 0; popups = []; cam.x = Math.max(0, s.r.x - W / 3); cam.shake = 0; finale = 0; result = null; banner = 2.6; flashA = 0;
  setMode('play');
}
function setMode(m) {
  mode = m; sel = 0; pressQ = false; kickQ = false;
  if (m !== 'play' && m !== 'result' && m !== 'pause') { flyers = []; shownCoins = save.coins; }
  if (m === 'title') { menu = [btn('PLAY', 0), btn('LEVELS', 1), btn('ENDLESS', 2), btn('GARAGE', 3)]; if (!demo) newDemo(); }
  else if (m === 'select') {
    if (!demo) newDemo();
    menu = [];
    const cols = 5, tw = 34, th = 30, gx = 8, x0 = Math.round(W / 2 - (cols * tw + (cols - 1) * gx) / 2);
    LEVELS.forEach((L, i) => menu.push({ x: x0 + (i % cols) * (tw + gx), y: 44 + Math.floor(i / cols) * (th + 10), w: tw, h: th, lv: i, act: () => { if (i < save.unlocked) start(i); else sfx('nofuel'); } }));
    menu.push({ x: W / 2 - 50, y: 130, w: 100, h: 13, label: 'ENDLESS', act: () => start(-1) });
    menu.push({ x: W / 2 - 30, y: 151, w: 60, h: 13, label: 'BACK', act: () => setMode('title') });
    sel = Math.min(save.unlocked - 1, LEVELS.length - 1);
  } else if (m === 'pause') menu = [btn('RESUME', 0, () => setMode('play')), btn('RETRY', 1, () => start(li)), btn('LEVELS', 2, () => setMode('select')), btn('GARAGE', 3, () => openGarage('pause'))];
  else if (m === 'result') {
    resultT = 0;
    if (result.win) menu = li < LEVELS.length - 1 ? [btn('NEXT', 0, () => start(li + 1)), btn('RETRY', 1, () => start(li)), btn('LEVELS', 2, () => setMode('select'))] : [btn('ENDLESS', 0, () => start(-1)), btn('RETRY', 1, () => start(li)), btn('LEVELS', 2, () => setMode('select'))];
    else menu = [btn('RETRY', 0, () => start(li)), btn(li < 0 ? 'MENU' : 'LEVELS', 1, () => setMode(li < 0 ? 'title' : 'select'))];
    for (const b of menu) b.y += result.win ? 16 : 8;
  } else menu = [];
}
function btn(label, i, act) {
  const acts = { PLAY: () => start(Math.min(save.unlocked, LEVELS.length) - 1), LEVELS: () => setMode('select'), ENDLESS: () => start(-1), GARAGE: () => openGarage('title') };
  return { x: Math.round(W / 2 - 40), y: 92 + i * 17, w: 80, h: 13, label, act: act || acts[label] };
}
function activate(b) { sfx('ui'); b.act(); }
function onKey(c) {
  if (c === 'KeyM') { setMuted(!A.muted); return; }
  if (mode === 'garage') { garageKey(c); return; }
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
    case 'ring': sfx('ring', e.n); R.sparks(e.x, e.y, 24, 70, ['#ffffff', '#fff3a0', '#ffd23f', '#b8792a'], { life: 0.5, g: 20 }); popup(e.x, e.y - 14, '+200', '#ffd23f'); cam.shake = Math.max(cam.shake, 1); earn(2, e.x, e.y); break;
    case 'lit': sfx('lit'); R.sparks(e.x, e.y - 3, 6, 30, ['#ffffff', '#ffd23f'], { life: 0.25, g: 0 }); break;
    case 'pop': {
      R.burst(e.x, e.y, e.c, 1 + Math.min(e.n, 6) * 0.1); sfx('pop', e.n);
      earn(1 + Math.floor(e.n / 3), e.x, e.y);
      if (e.n > save.bestChain) save.bestChain = e.n;
      if (e.n >= 10) unlockAch('chain10');
      cam.shake = Math.max(cam.shake, 2 + Math.min(e.n, 8) * 0.35); flashA = Math.max(flashA, 0.06 + Math.min(e.n, 8) * 0.012);
      popup(e.x, e.y - 8, '+' + e.pts, e.c);
      if (e.n >= 2) { popups = popups.filter((p) => !p.chain); popups.push({ x: null, y: 40, str: 'CHAIN *' + e.n, col: ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f6d'], big: e.n >= 5 ? 3 : 2, t: 0, life: 0.9, chain: 1 }); }
      break;
    }
    case 'shape': sfx('shape'); popup(null, 58, 'SHAPE BONUS +1000', ['#ffffff', '#c77dff', '#c77dff', '#9d4dff', '#7a2fd0'], 2, 1.8); flashA = 0.3; earn(10, e.x, e.y); for (let i = 0; i < 4; i++) setTimeout(() => { if (s) { R.burst(e.x + (Math.random() - 0.5) * 70, e.y + (Math.random() - 0.5) * 40, ['#ff4f6d', '#ffd23f', '#3fd0ff', '#c77dff'][i], 1.4); sfx('boom'); } }, 120 + i * 160); break;
    case 'crash':
      sfx('crash'); R.firework(e.x, e.y, '#ff5a3c', 1.3); R.smoke(e.x, e.y, 26); cam.shake = 7; flashA = 0.45;
      R.sparks(e.x, e.y, 30, 120, ['#ffffff', '#ffd23f', '#ff9a3c', '#b8283a', '#3a3048'], { life: 1.2, g: 160, drag: 1, sz: 1 });
      resultT = -1.1; result = { win: false, why: e.why, endless: li < 0 };
      if (li < 0) { const sc = s.score + Math.floor(s.dist / 4); result.score = sc; result.best = save.best; if (sc > save.best) { save.best = sc; result.newBest = true; } save.bestDist = Math.max(save.bestDist, Math.floor(s.dist)); }
      result.c0 = s.coins; bankCoins(li < 0 ? Math.floor(s.dist / 200) : 0); result.c1 = s.coins; result.cShown = result.c0; result.cStart = 0.35; persist();
      break;
    case 'land': sfx('land'); R.smoke(e.x, e.y - 1, 6); cam.shake = Math.max(cam.shake, 0.8); break;
    case 'nofuel': sfx('nofuel'); popup(null, 70, 'OUT OF FUEL!', ['#ffffff', '#ff9a9a', '#ff4f6d', '#ff4f6d', '#b8283a'], 2, 1.4); break;
    case 'clear': {
      sfx('clear'); finale = 2.0; flashA = 0.25;
      const st = starsFor(s); result = { win: true, stars: st, score: s.score, bonus: e.bonus };
      const newStars = Math.max(0, st - (save.stars[li] || 0));
      result.c0 = s.coins; bankCoins(10 + 5 * st + 10 * newStars); result.c1 = s.coins; result.cShown = result.c0; result.cStart = 1.25; result.newStars = newStars;
      save.stars[li] = Math.max(save.stars[li] || 0, st); save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, li + 2)); save.played = true;
      if (LEVELS.every((_, i) => (save.stars[i] || 0) >= 1)) unlockAch('allclear');
      if (LEVELS.every((_, i) => (save.stars[i] || 0) >= 3)) unlockAch('allstars');
      persist();
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
  R.setClock(t);
  if (mode === 'garage') { updateGarage(dt); R.updateParticles(dt); return; }
  if (mode === 'title' || (mode === 'select' && demo)) { updateDemo(dt); R.updateParticles(dt); return; }
  if (mode === 'play') {
    let first = true;
    simulate(s, () => { const inp = botOn ? botInput(s, bot) : readInput(); if (!first) inp.kick = false; first = false; lastInp = inp; return inp; }, dt, handle);
    if (banner > 0 && s.launched) banner -= dt * 2; else if (banner > 0) banner = Math.max(banner, 0.6);
    const r = s.r, fx = Math.sin(r.a), fy = -Math.cos(r.a), sp = Math.hypot(r.vx, r.vy);
    if (!s.dead) {
      if (r.thr) R.flame(r.x - fx * 6, r.y - fy * 6, Math.atan2(-fy, -fx), r.vx, r.vy, Math.max(1, Math.round(dt * 260)));
      else if (s.launched && Math.random() < dt * 40) R.idleSpark(r.x - fx * 6, r.y - fy * 6);
    }
    R.trail(r, dt, s.launched && !s.dead);
    if (li < 0 && s.dist >= 5000) unlockAch('far');
    engine(r.thr, sp, !s.dead);
    // camera
    const tx = r.x - W / 2 + r.vx * 0.35;
    cam.x += (tx - cam.x) * Math.min(1, dt * 5);
    cam.x = s.w < W ? (s.w - W) / 2 : Math.max(s.left, Math.min(s.w - W, cam.x));
    if (finale > 0) {
      finale -= dt;
      if (Math.random() < dt * 9) { R.burst(cam.x + 20 + Math.random() * (W - 40), 20 + Math.random() * 80, ['#ff4f6d', '#ffd23f', '#3fd0ff', '#9dff5c', '#c77dff'][Math.floor(Math.random() * 5)], 1.2); sfx('boom'); }
      if (finale <= 0) setMode('result');
    }
    if (s.dead && result) { resultT += dt; if (resultT >= 0) setMode('result'); }
  } else { engine(false, 0, false); if (mode === 'result') { resultT += dt; tallyCoins(dt); } }
  updateCoins(dt);
  R.updateParticles(mode === 'pause' ? 0 : dt);
  cam.shake = Math.max(0, cam.shake - dt * 14); flashA = Math.max(0, flashA - dt * 1.6);
  for (const p of popups) p.t += dt; popups = popups.filter((p) => p.t < p.life);
}
function newDemo() { const i = Math.floor(Math.random() * LEVELS.length); demo = makeWorld(LEVELS[i]); demoBot = {}; R.P.length = 0; R.resetTrail(); }
let demoAcc = 0;
function updateDemo(dt) {
  demoAcc += dt;
  while (demoAcc >= STEP) {
    step(demo, botInput(demo, demoBot), STEP); demoAcc -= STEP;
    for (const e of demo.events) if (e.k === 'pop') R.burst(e.x, e.y, e.c, 1); else if (e.k === 'ring') R.sparks(e.x, e.y, 16, 60, ['#ffffff', '#ffd23f'], { life: 0.4, g: 10 });
    if (demo.r.thr) { const fx = Math.sin(demo.r.a), fy = -Math.cos(demo.r.a); if (Math.random() < 0.5) R.flame(demo.r.x - fx * 6, demo.r.y - fy * 6, Math.atan2(-fy, -fx), demo.r.vx, demo.r.vy, 1); }
    if (demo.dead || demo.done || demo.t > 40) { newDemo(); break; }
  }
  R.trail(demo.r, dt, demo.launched && !demo.dead);
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
  R.drawTrail(ctx, cx); R.drawParticles(ctx, cx);
  if (rocketVisible && !w.dead) {
    const r = w.r;
    R.drawJet(ctx, r, cx);
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
  drawCoins(W - 4, 15);
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
  const gb = menu.find((b) => b.label === 'GARAGE'); if (gb && save.fresh.length && Math.floor(t * 4) % 2) text(ctx, 'NEW!', gb.x + gb.w + 4, gb.y + 4, '#9dff5c');
  drawCoins(W - 4, 4);
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
    coinLine(94);
  } else if (result.endless) {
    text(ctx, 'SHOW OVER', W / 2, 32, TITLE_COLS, { align: 'center', sc: 2, outline: true });
    text(ctx, result.why, W / 2, 48, '#ff8aa0', { align: 'center' });
    text(ctx, 'SCORE ' + result.score, W / 2, 60, '#ffffff', { align: 'center', sc: 1 });
    text(ctx, result.newBest ? 'NEW BEST!' : 'BEST ' + save.best, W / 2, 70, result.newBest ? '#9dff5c' : '#8e7fb8', { align: 'center' });
    coinLine(81);
  } else {
    text(ctx, 'CRASHED!', W / 2, 32, ['#ffffff', '#ff9a9a', '#ff4f6d', '#ff4f6d', '#b8283a'], { align: 'center', sc: 2, outline: true });
    text(ctx, result.why, W / 2, 50, '#ffd23f', { align: 'center' });
    text(ctx, 'RINGS ' + s.ringsGot + '/' + s.rings.length + '   POPS ' + s.pops + '/' + s.popsNeed, W / 2, 62, '#d8c8f0', { align: 'center' });
    text(ctx, 'R OR SPACE TO RETRY', W / 2, 72, '#8e7fb8', { align: 'center' });
    coinLine(83);
  }
  menu.forEach((b, i) => R.button(ctx, b, i === sel, t));
  drawCoins(W - 4, 4);
}
function drawPause() {
  ctx.fillStyle = 'rgba(11,7,22,0.6)'; ctx.fillRect(0, 0, W, H);
  drawCoins(W - 4, 4);
  text(ctx, 'PAUSED', W / 2, 60, TITLE_COLS, { align: 'center', sc: 2, outline: true });
  menu.forEach((b, i) => R.button(ctx, b, i === sel, t));
}
function draw() {
  ctx.imageSmoothingEnabled = false;
  if (sheet) { drawSheet(); return; }
  if (mode === 'title') { drawTitle(); return; }
  if (mode === 'select') { drawSelect(); return; }
  if (mode === 'garage') { drawGarage(); return; }
  drawWorld(s, true);
  drawPopups();
  if (mode === 'play') drawHUD();
  if (flashA > 0) { ctx.fillStyle = `rgba(255,240,230,${flashA.toFixed(3)})`; ctx.fillRect(0, 0, W, H); }
  if (mode === 'result') drawResult();
  if (mode === 'pause') drawPause();
  drawFlyers(); drawUiSparks();
}

// ---------- coins ----------
let shownCoins = save.coins, coinBump = 0, flyers = [], lastCoinT = -1, coinStreak = 0, tickT = 0, uiSparks = [];
const coinY = () => mode === 'play' ? 15 : 4;
function coinTarget() { return [W - 4 - textWidth(String(shownCoins)) - 7, coinY()]; }
function drawCoins(xr, y) {
  const str = String(shownCoins), w = textWidth(str), b = coinBump > 0 ? 1 : 0;
  R.coinIcon(ctx, xr - w - 7, y - b, 0);
  text(ctx, str, xr, y - b, b ? '#ffffff' : '#ffd23f', { align: 'right' });
}
function earn(n, wx, wy) {
  if (n <= 0 || !s) return;
  save.coins += n; s.coins += n; persist();
  const k = Math.min(n, 5);
  for (let i = 0; i < k; i++) flyers.push({ x: wx - cam.x, y: wy, vx: (Math.random() - 0.5) * 60, vy: -60 - Math.random() * 30, t: -i * 0.06, v: Math.floor(n / k) + (i < n % k ? 1 : 0) });
}
function bankCoins(n) { if (n > 0) { save.coins += n; s.coins += n; } }
function coinSound() { if (t - lastCoinT < 0.035) return; coinStreak = t - lastCoinT < 0.7 ? coinStreak + 1 : 0; lastCoinT = t; sfx('coin', coinStreak); }
function updateCoins(dt) {
  coinBump = Math.max(0, coinBump - dt);
  for (const f of flyers) {
    f.t += dt; if (f.t < 0) continue;
    if (f.t < 0.3) { f.vy += 300 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.sx = f.x; f.sy = f.y; }
    else { const k = Math.min(1, (f.t - 0.3) / 0.32), e = k * k, [tx, ty] = coinTarget(); f.x = f.sx + (tx - f.sx) * e; f.y = f.sy + (ty - f.sy) * e; if (k >= 1) { f.done = true; shownCoins += f.v; coinBump = 0.15; coinSound(); uiBurst(tx + 2, ty + 2, 4); } }
  }
  if (flyers.some((f) => f.done)) flyers = flyers.filter((f) => !f.done);
  for (const p of uiSparks) { p.life -= dt; p.vy += 120 * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
  uiSparks = uiSparks.filter((p) => p.life > 0);
}
function drawFlyers() { for (const f of flyers) { if (f.t < 0) continue; R.glow(ctx, f.x + 2, f.y + 2, 5, '#ffd23f', 0.35); R.coinIcon(ctx, f.x, f.y, Math.floor(f.t * 16) % 4); } }
function uiBurst(x, y, n, cols = ['#ffffff', '#fff3a0', '#ffd23f', '#e8a93a']) { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = 30 + Math.random() * 60; uiSparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 30, life: 0.3 + Math.random() * 0.35, c: cols[i % cols.length] }); } }
function drawUiSparks() { for (const p of uiSparks) { ctx.fillStyle = p.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); } }
function tallyCoins(dt) {
  const r = result; if (!r || r.c1 == null || resultT < r.cStart) return;
  if (r.cShown < r.c1) {
    const rate = Math.max(20, (r.c1 - r.c0) / 0.9), prev = Math.floor(r.cShown);
    r.cShown = Math.min(r.c1, r.cShown + rate * dt); const now = Math.floor(r.cShown);
    if (now > prev) { shownCoins += now - prev; r.bump = 0.08; if (t - tickT > 0.04) { sfx('tick', now % 16); tickT = t; } }
  }
  if (r.cShown >= r.c1 && !r.cDone) { r.cDone = true; if (r.c1 > 0) { sfx('kaching'); r.bump = 0.3; coinBump = 0.3; uiBurst(W / 2, (r.lineY || 90) + 2, 22); } }
  r.bump = Math.max(0, (r.bump || 0) - dt);
}
function coinLine(y) {
  const r = result; if (!r || r.c1 == null) return; r.lineY = y;
  const str = 'COINS +' + Math.floor(r.cShown), b = r.bump > 0 ? 1 : 0, w = textWidth(str) + 8;
  R.coinIcon(ctx, W / 2 - w / 2, y - b, r.cDone ? 0 : Math.floor(t * 12) % 4);
  text(ctx, str, W / 2 - w / 2 + 8, y - b, r.cDone ? '#ffd23f' : '#ffffff');
}
function unlockAch(k) {
  if (!giveAch(save, k)) return; persist();
  const a = achItem(k); sfx('unlock'); flashA = Math.max(flashA, 0.2);
  popups = popups.filter((p) => !p.ach);
  popups.push({ x: null, y: 100, str: 'UNLOCKED: ' + a.it.name, col: ['#ffffff', '#e0ffc0', '#9dff5c', '#9dff5c', '#3fbf3a'], big: 1, t: 0, life: 2.6, ach: 1 });
  popups.push({ x: null, y: 108, str: ACH[k].name, col: '#d8c8f0', big: 1, t: 0, life: 2.6, ach: 1 });
}

// ---------- garage ----------
let G = null;
const curCat = () => CATS[G.tab][0], curList = () => CATALOG[curCat()], curItem = () => curList()[G.idx[G.tab]];
const previewLook = () => ({ ...save.eq, [curCat()]: curItem().id });
function openGarage(from) {
  G = { from, tab: 0, idx: CAT_IDS.map((c) => Math.max(0, CATALOG[c].findIndex((i) => i.id === save.eq[c]))), t: 0, burstT: 0.8, shake: 0, flash: null, pr: { x: W / 2, y: 90, a: 0, vx: 0, vy: 0, thr: true }, savedP: R.P.splice(0), down: null };
  R.resetTrail(); setMode('garage'); markSeen();
}
function closeGarage() { const from = G.from; R.P.length = 0; R.P.push(...G.savedP); R.resetTrail(); R.setLook(save.eq); G = null; sfx('ui'); setMode(from === 'pause' ? 'pause' : 'title'); }
function markSeen() { const i = save.fresh.indexOf(curCat() + ':' + curItem().id); if (i >= 0) { save.fresh.splice(i, 1); persist(); } }
function gLayout() {
  const tw = Math.floor((W - 8) / 6), list = curList(), m = list.length, thw = Math.min(30, Math.floor((W - 8) / m)), tx0 = Math.round((W - thw * m) / 2);
  return {
    back: { x: 4, y: 3, w: 34, h: 14 },
    tabs: CATS.map((c, i) => ({ x: 4 + i * tw + 2, y: 23, w: tw - 4, h: 14 })),
    pv: { x: 0, y: 41, w: W, h: 86 },
    prev: { x: 4, y: 60, w: 24, h: 50 }, next: { x: W - 28, y: 60, w: 24, h: 50 },
    thumbs: list.map((it, i) => ({ x: tx0 + i * thw + 2, y: 131, w: thw - 4, h: 22 })),
    act: { x: Math.round(W / 2 - 62), y: 158, w: 124, h: 18 },
  };
}
function gBurst() { R.setLook(previewLook()); R.burst(40 + Math.random() * (W - 80), 60 + Math.random() * 20, COLORS[Math.floor(Math.random() * COLORS.length)], 0.85); if (curCat() === 'burst') sfx('pop', 1); }
function updateGarage(dt) {
  G.t += dt; G.shake = Math.max(0, G.shake - dt); if (G.flash) { G.flash.t += dt; if (G.flash.t > 1.4) G.flash = null; }
  R.setLook(previewLook());
  const pr = G.pr, cx = W / 2, cy = 91, rx = Math.min(78, W / 2 - 50), ry = 17, th = G.t * 1.45;
  pr.x = cx + Math.cos(th) * rx; pr.y = cy + Math.sin(th) * ry; pr.vx = -Math.sin(th) * rx * 1.45; pr.vy = Math.cos(th) * ry * 1.45;
  pr.a = Math.atan2(pr.vx, -pr.vy); pr.thr = Math.sin(G.t * 2.3) > -0.55;
  const fx = Math.sin(pr.a), fy = -Math.cos(pr.a);
  if (pr.thr) R.flame(pr.x - fx * 6, pr.y - fy * 6, Math.atan2(-fy, -fx), pr.vx, pr.vy, Math.max(1, Math.round(dt * 260)));
  else if (Math.random() < dt * 40) R.idleSpark(pr.x - fx * 6, pr.y - fy * 6);
  R.trail(pr, dt, true);
  G.burstT -= dt; if (G.burstT <= 0) { gBurst(); G.burstT = curCat() === 'burst' ? 1.3 : 2.6; }
  updateCoins(dt);
}
function gStep(d) { const n = curList().length; G.idx[G.tab] = (G.idx[G.tab] + d + n) % n; onPick(); }
function gPick(i) { G.idx[G.tab] = i; onPick(); }
function gTab(i) { G.tab = i; sfx('ui'); markSeen(); if (curCat() === 'burst') { gBurst(); G.burstT = 1.3; } }
function onPick() { sfx('swish'); markSeen(); if (curCat() === 'burst') { gBurst(); G.burstT = 1.3; } }
function gAct(equipOnly) {
  const cat = curCat(), it = curItem(), L = gLayout(), bx = L.act.x + L.act.w / 2, by = L.act.y + L.act.h / 2;
  if (save.eq[cat] === it.id) { sfx('ui'); return; }
  if (owns(save, cat, it.id)) { save.eq[cat] = it.id; persist(); sfx('equip'); G.flash = { str: 'EQUIPPED!', t: 0, col: '#9dff5c' }; uiBurst(bx, by, 14, ['#ffffff', '#c8ff9c', '#9dff5c']); if (cat === 'burst') gBurst(); return; }
  if (equipOnly) { sfx('ui'); return; }
  if (it.ach) { sfx('deny'); G.shake = 0.35; G.flash = { str: ACH[it.ach].name, t: 0, col: '#ff8aa0' }; return; }
  if (save.coins < it.price) { sfx('deny'); G.shake = 0.35; G.flash = { str: 'NEED ' + (it.price - save.coins) + ' MORE', t: 0, col: '#ff8aa0' }; return; }
  save.coins -= it.price; (save.owned[cat] = save.owned[cat] || []).push(it.id); save.eq[cat] = it.id; persist(); shownCoins = save.coins; coinBump = 0.3;
  sfx('kaching'); G.flash = { str: 'NEW LOOK!', t: 0, col: TITLE_COLS }; uiBurst(bx, by, 26); gBurst();
}
const hp = (b, x, y) => b && x >= b.x - 2 && x < b.x + b.w + 2 && y >= b.y - 2 && y < b.y + b.h + 2;
function garageDown(id, x, y) {
  const L = gLayout(); G.down = null;
  if (hp(L.back, x, y)) { closeGarage(); return; }
  for (let i = 0; i < L.tabs.length; i++) if (hp(L.tabs[i], x, y)) { gTab(i); return; }
  if (hp(L.prev, x, y)) { gStep(-1); return; }
  if (hp(L.next, x, y)) { gStep(1); return; }
  for (let i = 0; i < L.thumbs.length; i++) if (hp(L.thumbs[i], x, y)) { if (G.idx[G.tab] === i) gAct(true); else gPick(i); return; }
  if (hp(L.act, x, y)) { gAct(); return; }
  G.down = { id, x, y };
}
function garageUp(id, x, y) { const d = G && G.down; if (!d || d.id !== id) return; G.down = null; const dx = x - d.x; if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(y - d.y)) gStep(dx < 0 ? 1 : -1); }
function garageKey(c) {
  if (c === 'Escape' || c === 'Backspace') closeGarage();
  else if (c === 'ArrowLeft' || c === 'KeyA') gStep(-1);
  else if (c === 'ArrowRight' || c === 'KeyD') gStep(1);
  else if (c === 'ArrowUp' || c === 'KeyW' || c === 'KeyQ') gTab((G.tab + 5) % 6);
  else if (c === 'ArrowDown' || c === 'KeyS' || c === 'KeyE' || c === 'Tab') gTab((G.tab + 1) % 6);
  else if (c === 'Enter' || c === 'Space') gAct();
}
function drawThumbIcon(cat, id, cx, cy) {
  cx = Math.round(cx); cy = Math.round(cy);
  const px = (x, y, c, w = 1, h = 1) => { ctx.fillStyle = c; ctx.fillRect(cx + x, cy + y, w, h); };
  if (cat === 'skin' || cat === 'nose' || cat === 'fins') { R.drawRocket(ctx, cx + 0.5, cy + 0.5, 0, false, { ...save.eq, [cat]: id }); return; }
  if (cat === 'burst') { R.burstIcon(ctx, id, cx, cy); return; }
  if (cat === 'flame') {
    const fd = FLAMES[id], rows = [5, 5, 5, 3, 3, 3, 1, 1];
    px(-2, -7, '#3a3048', 5, 2);
    for (let j = 0; j < 8; j++) for (let i = 0; i < rows[j]; i++) px(i - (rows[j] >> 1), j - 5, fd.rainbow ? hsl(RAINBOW_HUES[(j + i) % 7], 0.95, 0.6) : fd.cols[Math.min(6, 1 + (j >> 1) + (i === 0 || i === rows[j] - 1 ? 1 : 0))]);
    if (fd.shape === 'heart') ['.x.x.', 'xxxxx', '.xxx.', '..x..'].forEach((r, j) => [...r].forEach((ch, i) => { if (ch === 'x') px(4 + i, 2 + j, '#ff6aa0'); }));
    if (fd.shape === 'star') { px(6, 2, '#ffffff'); px(5, 3, '#fff3a0', 3, 1); px(6, 4, '#ffffff'); px(-7, 0, '#ffffff'); }
    return;
  }
  // trails: marks on a diagonal from the top-right (where the rocket would be) down to the bottom-left
  const P5 = [[5, -6], [2, -2], [-1, 1], [-4, 5]];
  if (id === 'none') { px(-4, -4, '#8e7fb8', 9, 1); px(-4, 4, '#8e7fb8', 9, 1); px(-4, -4, '#8e7fb8', 1, 9); px(4, -4, '#8e7fb8', 1, 9); for (let k = -3; k < 4; k++) px(k, -k, '#ff4f6d'); }
  else if (id === 'smoke') P5.forEach(([x, y], i) => px(x - 1, y - 1, ['#8a7aa0', '#6a5a80', '#5a4a70', '#4a3e60'][i], 3 - (i >> 1), 3 - (i >> 1)));
  else if (id === 'puffs') P5.forEach(([x, y], i) => px(x - 1, y - 1, ['#ffffff', '#ece6f6', '#c8bede', '#9a8ab8'][i], 4 - (i >> 1), 4 - (i >> 1)));
  else if (id === 'bubbles') P5.forEach(([x, y], i) => { const c = ['#e8fbff', '#9de8ff', '#7ad7ff', '#3fa0d0'][i]; px(x, y - 1, c); px(x - 1, y, c); px(x + 1, y, c); px(x, y + 1, c); });
  else if (id === 'stardust') { for (let i = 0; i < 9; i++) px((5 - i * 1.2) | 0, (-6 + i * 1.3 + (i % 2 ? 1 : -1)) | 0, ['#ffffff', '#fff3a0', '#c9b8ff', '#8e7fb8'][i % 4]); px(-4, 4, '#c9b8ff', 3, 1); px(-3, 3, '#c9b8ff'); px(-3, 5, '#c9b8ff'); px(-3, 4, '#ffffff'); }
  else { const cols = id === 'comet' ? ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f3c', '#b8283a'] : ['#ffffff', '#ffd0f0', '#ff8ad8', '#ff4fd8', '#c77dff', '#7a2fd0']; for (let i = 0; i < 12; i++) { const x = 5 - i, y = -6 + i + Math.round(id === 'ribbon' ? Math.sin(i * 0.9) * 1.5 : 0), w = id === 'comet' && i < 5 ? 2 : 1; px(x, y, cols[Math.min(5, i >> 1)], w, w); } }
}
function drawGarage() {
  const L = gLayout(), cat = curCat(), list = curList(), it = curItem();
  R.drawBackground(ctx, W, G.t * 30, t);
  ctx.save(); ctx.beginPath(); ctx.rect(0, L.pv.y, W, L.pv.h); ctx.clip();
  R.drawTrail(ctx, 0); R.drawParticles(ctx, 0); R.drawJet(ctx, G.pr, 0); R.drawRocket(ctx, G.pr.x, G.pr.y, G.pr.a, false);
  ctx.restore();
  ctx.fillStyle = 'rgba(11,7,22,0.85)'; ctx.fillRect(0, 0, W, L.pv.y - 1); ctx.fillRect(0, L.pv.y + L.pv.h + 1, W, H - L.pv.y - L.pv.h - 1);
  ctx.fillStyle = '#5a3f86'; ctx.fillRect(0, L.pv.y - 1, W, 1); ctx.fillRect(0, L.pv.y + L.pv.h, W, 1);
  R.panel(ctx, L.back.x, L.back.y, L.back.w, L.back.h, '#2a1a48'); text(ctx, '<BACK', L.back.x + L.back.w / 2, L.back.y + 5, '#d8c8f0', { align: 'center' });
  text(ctx, 'GARAGE', W / 2, 5, TITLE_COLS, { align: 'center', sc: 2, outline: true });
  drawCoins(W - 5, 7);
  CATS.forEach(([c, label], i) => {
    const b = L.tabs[i], on = i === G.tab;
    R.panel(ctx, b.x, b.y - (on ? 1 : 0), b.w, b.h, on ? '#ff4f6d' : '#2a1a48');
    text(ctx, label, b.x + b.w / 2, b.y + 5 - (on ? 1 : 0), on ? '#ffffff' : '#b8a8d8', { align: 'center' });
    if (save.fresh.some((k) => k.startsWith(c + ':'))) { ctx.fillStyle = '#9dff5c'; ctx.fillRect(b.x + b.w - 3, b.y + 1, 2, 2); }
  });
  const have = owns(save, cat, it.id), eq = save.eq[cat] === it.id, sx = G.shake > 0 ? Math.round(Math.sin(G.shake * 90) * 2) : 0;
  text(ctx, it.name, W / 2, L.pv.y + 4, TITLE_COLS, { align: 'center', sc: 2, outline: true });
  const sy = L.pv.y + 17;
  if (eq) text(ctx, 'EQUIPPED', W / 2, sy, '#9dff5c', { align: 'center', outline: true });
  else if (have) text(ctx, 'OWNED', W / 2, sy, '#d8c8f0', { align: 'center', outline: true });
  else if (it.ach) { const s2 = 'UNLOCK: ' + ACH[it.ach].name, w = textWidth(s2); R.lockIcon(ctx, Math.round(W / 2 - w / 2 - 10), sy - 2, '#ff8aa0'); text(ctx, s2, W / 2, sy, '#ff8aa0', { align: 'center', outline: true }); }
  else { const s2 = String(it.price), w = textWidth(s2) + 8; R.coinIcon(ctx, W / 2 - w / 2, sy, 0); text(ctx, s2, W / 2 - w / 2 + 8, sy, save.coins >= it.price ? '#ffd23f' : '#ff8aa0', { outline: true }); }
  text(ctx, it.desc, W / 2, L.pv.y + L.pv.h - 8, '#b8a8d8', { align: 'center', outline: true });
  for (const [b, ch] of [[L.prev, '<'], [L.next, '>']]) { ctx.globalAlpha = 0.6; R.panel(ctx, b.x, b.y, b.w, b.h, '#2a1a48'); ctx.globalAlpha = 1; text(ctx, ch, b.x + b.w / 2, b.y + b.h / 2 - 7, '#ffffff', { align: 'center', sc: 3 }); }
  list.forEach((item, i) => {
    const b = L.thumbs[i], on = i === G.idx[G.tab], own = owns(save, cat, item.id), isEq = save.eq[cat] === item.id, up = on ? 1 : 0;
    R.panel(ctx, b.x, b.y - up, b.w, b.h, on ? '#ff4f6d' : isEq ? '#1f4a34' : own ? '#2a1a48' : '#160d26');
    ctx.globalAlpha = own || on ? 1 : 0.5; drawThumbIcon(cat, item.id, b.x + b.w / 2, b.y + b.h / 2 - up); ctx.globalAlpha = 1;
    const rx = b.x + b.w, ry = b.y - up;
    if (isEq) { ctx.fillStyle = '#9dff5c'; ctx.fillRect(rx - 5, ry + 2, 1, 1); ctx.fillRect(rx - 4, ry + 3, 1, 1); ctx.fillRect(rx - 3, ry + 2, 1, 1); ctx.fillRect(rx - 2, ry + 1, 1, 1); }
    else if (!own) { const c = item.ach ? '#ff8aa0' : '#8e7fb8', by = ry + b.h; ctx.fillStyle = c; ctx.fillRect(rx - 4, by - 4, 3, 3); ctx.fillRect(rx - 4, by - 6, 1, 2); ctx.fillRect(rx - 2, by - 6, 1, 2); ctx.fillRect(rx - 3, by - 6, 1, 1); ctx.fillStyle = '#0b0716'; ctx.fillRect(rx - 3, by - 3, 1, 1); }
    if (save.fresh.includes(cat + ':' + item.id) && Math.floor(t * 4) % 2) { ctx.fillStyle = '#9dff5c'; ctx.fillRect(b.x + 1, ry + 1, 2, 2); }
  });
  const A = L.act; let label, col, coin = false;
  if (eq) { label = 'EQUIPPED'; col = '#1f6a3a'; }
  else if (have) { label = 'EQUIP'; col = '#ff4f6d'; }
  else if (it.ach) { label = 'LOCKED'; col = '#2a1a48'; }
  else if (save.coins >= it.price) { label = 'BUY ' + it.price; col = '#d0801a'; coin = true; }
  else { label = 'NEED ' + it.price; col = '#3a2a50'; coin = true; }
  const live = !eq && (have || (!it.ach && save.coins >= it.price)), bob = live ? Math.round((Math.sin(t * 6) + 1) / 2) : 0;
  R.panel(ctx, A.x + sx, A.y - bob, A.w, A.h, col);
  const tw = textWidth(label, 2) + (coin ? 10 : 0), x0 = Math.round(A.x + sx + A.w / 2 - tw / 2);
  text(ctx, label, x0, A.y + 4 - bob, live ? '#ffffff' : '#b8a8d8', { sc: 2 });
  if (coin) R.coinIcon(ctx, x0 + tw - 6, A.y + 6 - bob, 0);
  if (G.flash) { const k = G.flash.t; if (k < 1.1 || Math.floor(k * 16) % 2) text(ctx, G.flash.str, W / 2, L.pv.y + 30 - Math.min(6, k * 12), G.flash.col, { align: 'center', sc: 2, outline: true }); }
  drawUiSparks();
}

// test only: every skin (columns) at 8 angles (rows), or every nose and fin with the current skin
let sheet = null;
function drawSheet() {
  ctx.fillStyle = '#1a1030'; ctx.fillRect(0, 0, W, H);
  const looks = sheet === 'parts' ? [...CATALOG.nose.map((n) => ({ ...save.eq, nose: n.id })), ...CATALOG.fins.map((f) => ({ ...save.eq, fins: f.id }))] : CATALOG.skin.map((k) => ({ ...save.eq, skin: k.id }));
  looks.forEach((lk, c) => { for (let r = 0; r < 8; r++) R.drawRocket(ctx, 12 + c * 24 + 0.3, 11 + r * 22 + 0.4, r * Math.PI / 4 + 0.13 * (r % 2), false, lk); });
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
  get G() { return G; }, openGarage, closeGarage, gAct, gPick, gTab, set sheet(v) { sheet = v; }, set coins(v) { save.coins = v; shownCoins = v; persist(); }, get look() { return R.LOOK; }, migrate, unlockAch,
  fast(sec) { const n = Math.round(sec / STEP); for (let i = 0; i < n && mode === 'play' && !s.dead && !(s.done && finale <= 0); i++) { step(s, botInput(s, bot), STEP); for (const e of s.events) handle(e); } },
};
