// BEAT DASH: app flow, input, juice, saving and the test hooks (window.__G).
import { DT, compile, newRun, clone, step, progress } from './sim.js';
import { LEVELS } from './levels.js';
import { solve } from './solver.js';
import { SOLUTIONS } from './solutions.js';
import { Renderer, PALETTES } from './render.js';
import { Sound } from './audio.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---- save -------------------------------------------------------------------
const SAVE_KEY = 'pd.beat-dash';
const save = { lv: {}, pal: 0, muted: false, sel: 0 };
try { const j = JSON.parse(localStorage.getItem(SAVE_KEY)); if (j && typeof j === 'object') Object.assign(save, j); } catch (e) { /* no storage */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* no storage */ } };
const lvSave = (id) => save.lv[id] || (save.lv[id] = { best: 0, pbest: 0, att: 0, done: false, jumps: 0 });
const palUnlocked = (i) => i === 0 || !!(save.lv[LEVELS[i - 1]?.id] || {}).done;

// ---- setup ------------------------------------------------------------------
const levels = LEVELS.map(compile);
const R = new Renderer($('c'));
const snd = new Sound();
snd.muted = !!save.muted;
const solutions = new Map();
const getSolution = (i) => {
  if (!solutions.has(i)) {
    // shipped perfect run (tools/solve.mjs), checked by replaying it
    const pre = SOLUTIONS[LEVELS[i].id];
    if (pre && pre.len === levels[i].length) {
      const ticks = []; pre.rle.forEach((n, k) => { for (let j = 0; j < n; j++) ticks.push(k % 2); });
      const s = newRun(levels[i]);
      for (let t = 0; t < ticks.length && !s.dead && !s.done; t++) step(levels[i], s, !!ticks[t]);
      if (s.done) { solutions.set(i, ticks); return ticks; }
    }
    let r = solve(levels[i], { gran: 12, maxNodes: 200000 });
    if (!r.ok) r = solve(levels[i], { gran: 4 });
    solutions.set(i, r.ok ? r.ticks : null);
  }
  return solutions.get(i);
};

const g = {
  state: 'title', idx: Math.min(save.sel || 0, LEVELS.length - 1), L: null, s: null, practice: false, cps: [],
  cam: { x: 0, y: 0 }, parts: [], trail: [], shake: 0, flash: 0, pulse: 0, hue: 200, time: 0,
  pal: PALETTES[save.pal] || PALETTES[0], hud: false, pct: 0, bestPct: 0, banner: null,
  attempts: 0, jumps: 0, runTime: 0, dead: false, deadT: 0, hitstop: 0, squash: 0, attemptLabel: null,
  held: false, latch: 0, botOn: params.get('bot') === '1', demo: false, doneT: 0, lastAutoCp: 0, acc: 0, hidePlayer: false,
};

// ---- screens ----------------------------------------------------------------
const screens = ['title', 'select', 'pause', 'results'];
function show(name) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== name);
  const playing = name === null || name === 'pause';
  $('hudBtns').classList.toggle('hidden', !playing);
  $('pracBtns').classList.toggle('hidden', !(name === null && g.practice));
}
function setMuteUi() { document.body.classList.toggle('muted', snd.muted); const b = $('bSound'); if (b) b.textContent = snd.muted ? 'SOUND: OFF' : 'SOUND: ON'; }
function toggleMute() { snd.unlock(); snd.setMuted(!snd.muted); save.muted = snd.muted; persist(); setMuteUi(); }
setMuteUi();

function unlockAudio() {
  const first = !snd.ctx;
  snd.unlock();
  if (first && snd.ctx) {
    // the run (or menu) was already going silently: start the track where it is now
    if ((g.state === 'play') && g.s && !g.dead) snd.play(g.L.def, g.s.x / g.L.speed);
    else if (g.state === 'title' || g.state === 'select') menuMusic();
  }
}
function menuMusic() { if (snd.ctx && g.L) snd.play(LEVELS[g.idx], ((g.s && g.s.x) || 0) / g.L.speed, { vol: 0.42 }); }

// ---- in-world tips: the first time a level shows you something new ---------------
const TIP_TEXT = { spike: 'TAP TO JUMP', block: 'LAND ON BLOCKS', pad: 'PADS LAUNCH YOU', orb: 'TAP ON THE ORB', flip: 'TAP: FLIP GRAVITY', portal: 'UPSIDE DOWN!' };
function firstOf(L) {
  const out = {};
  for (const o of L.draw) {
    const k = o.t === 'small' ? 'spike' : o.t;
    if (k === 'portal' && o.d !== -1) continue;
    if (k === 'spike' && (o.d !== 1 || o.y !== 0)) continue;
    if (!out[k]) out[k] = o;
  }
  if (L.blocks.length) out.block = L.blocks[0];
  return out;
}
const TIPS = levels.map((L, i) => {
  const seen = new Set();
  for (let k = 0; k < i; k++) for (const t of Object.keys(firstOf(levels[k]))) seen.add(t);
  const f = firstOf(L), tips = [];
  for (const k of Object.keys(TIP_TEXT)) {
    if (seen.has(k) || !f[k]) continue;
    const o = f[k];
    const up = k === 'orb' || k === 'flip' ? 1.6 : k === 'portal' ? 2.6 : 2.8;
    tips.push({ x: o.x + 0.5, y: o.y + 1 + up, ay: o.y + 1 + (k === 'orb' || k === 'flip' ? 0.6 : k === 'block' ? 0.2 : 0.4), text: TIP_TEXT[k] });
  }
  return tips.sort((a, b) => a.x - b.x);
});

// ---- demo (title + level select background) --------------------------------
function startDemo(i) {
  g.demo = true; g.idx = i; g.L = levels[i]; g.practice = false; g.cps = []; g.tips = null; g.deathPop = null;
  g.s = newRun(g.L); g.parts = []; g.trail = []; g.dead = false; g.hud = false; g.attemptLabel = null;
  g.demoTicks = getSolution(i);
  g.hue = LEVELS[i].hue;
  snapCam();
  if (snd.ctx) snd.play(LEVELS[i], 0, { vol: 0.42 });
}

// ---- level flow -------------------------------------------------------------
function startLevel(i, practice = false) {
  unlockAudio();
  g.demo = false; g.idx = i; g.L = levels[i]; g.practice = practice; g.cps = [];
  save.sel = i; persist();
  g.attempts = 0; g.jumps = 0; g.runTime = 0;
  g.state = 'play'; g.hud = true; g.banner = null;
  show(null);
  startAttempt();
}
function startAttempt() {
  const L = g.L;
  const cp = g.practice && g.cps.length ? g.cps[g.cps.length - 1] : null;
  g.s = newRun(L, cp ? cp.s : null);
  g.s.held = false; g.s.buf = false;
  g.attempts++;
  const ls = lvSave(L.def.id); ls.att++; persist();
  g.dead = false; g.deadT = 0; g.hitstop = 0; g.latch = 0; g.parts = []; g.trail = []; g.acc = 0; g.doneT = 0;
  g.lastAutoCp = g.s.x;
  g.bestPct = g.practice ? ls.pbest : ls.best;
  g.attemptLabel = g.practice ? null : { x: g.s.x + 4, text: 'Attempt ' + g.attempts };
  const bestX = Math.max(ls.best, ls.pbest) / 100 * L.length;
  g.tips = TIPS[g.idx].filter((t) => t.x + 3 > bestX && t.x > g.s.x + 3);
  g.deathPop = null;
  g.botTicks = g.botOn && !g.practice ? getSolution(g.idx) : null;
  g.hidePlayer = false;
  snapCam();
  if (snd.ctx) snd.play(L.def, g.s.x / L.speed);
}
function die() {
  const s = g.s, L = g.L;
  g.dead = true; g.deadT = 0; g.hitstop = 0.07; g.shake = 1;
  snd.stop(0.04); snd.fx('die');
  burst(s.x + 0.5, s.y + 0.5, 26, [g.pal.a, g.pal.b, '#fff'], 9, 0.7);
  ring(s.x + 0.5, s.y + 0.5, '#fff', 2.2);
  const pct = Math.floor(progress(L, s) * 100);
  const ls = lvSave(L.def.id);
  const key = g.practice ? 'pbest' : 'best';
  let best = false;
  if (pct > ls[key]) {
    const first = pct < 8; // no fanfare for tiny progress
    ls[key] = pct; persist();
    if (!first) { best = true; g.banner = { text: 'NEW BEST', sub: pct + '%', t: 1.1, max: 1.1, color: '#ffe14d' }; setTimeout(() => snd.fx('best'), 120); }
  }
  if (!best) g.deathPop = { text: pct + '%', sub: 'best ' + ls[key] + '%', t: 0.85, max: 0.85 };
}
function complete() {
  const L = g.L, s = g.s;
  g.state = 'complete'; g.doneT = 0;
  g.flash = 0.9; g.shake = 0.5;
  snd.stop(1.2); snd.fx('win');
  for (let i = 0; i < 70; i++) {
    g.parts.push({ x: s.x - 6 + Math.random() * 14, y: Math.random() * 8, vx: (Math.random() - 0.5) * 8, vy: 4 + Math.random() * 10,
      g: 14, life: 1.6 + Math.random(), max: 2.6, sz: 0.18 + Math.random() * 0.15, c: [g.pal.a, g.pal.b, '#ffe14d', '#ff4dd2', '#fff'][i % 5], r: Math.random() * 6, vr: (Math.random() - 0.5) * 12 });
  }
  g.banner = { text: g.practice ? 'PRACTICE DONE' : 'LEVEL COMPLETE!', t: 1.6, max: 1.6, color: '#ffe14d' };
  const ls = lvSave(L.def.id);
  let unlocked = '';
  if (g.practice) ls.pbest = 100;
  else {
    const wasDone = ls.done;
    ls.best = 100; ls.done = true; ls.jumps = Math.max(ls.jumps || 0, g.jumps);
    const pi = g.idx + 1;
    if (!wasDone && pi < PALETTES.length) unlocked = 'New cube unlocked: ' + PALETTES[pi].name;
  }
  persist();
  g.results = { name: LEVELS[g.idx].name, practice: g.practice, attempts: g.attempts, jumps: g.jumps, time: g.runTime, unlocked };
}
function showResults() {
  const r = g.results;
  g.state = 'results';
  $('rTitle').textContent = r.practice ? 'PRACTICE COMPLETE' : 'LEVEL COMPLETE!';
  $('rName').textContent = r.name + (r.practice ? '  -  now try it for real!' : '');
  $('rAtt').textContent = r.attempts; $('rJumps').textContent = r.jumps;
  $('rTime').textContent = Math.round(r.time) + 's';
  $('rUnlock').textContent = r.unlocked;
  $('bNextLv').classList.toggle('hidden', g.idx >= LEVELS.length - 1);
  show('results');
}
function pause() {
  if (g.state !== 'play') return;
  g.state = 'pause';
  ptrs.clear(); keyHeld = false; setHeld();
  if (snd.ctx) snd.ctx.suspend();
  const L = g.L, ls = lvSave(L.def.id);
  $('pauseInfo').innerHTML = `<b>${LEVELS[g.idx].name}</b><br>best ${ls.best}%  &middot;  practice ${ls.pbest}%  &middot;  attempt ${g.attempts}`;
  $('bPractice').textContent = g.practice ? 'NORMAL MODE' : 'PRACTICE';
  $('bPractice').classList.toggle('on', !g.practice);
  show('pause');
}
function resume() {
  if (g.state !== 'pause') return;
  g.state = 'play'; show(null);
  if (snd.ctx) snd.ctx.resume();
  last = performance.now();
}
function toMenu() {
  if (snd.ctx && snd.ctx.state === 'suspended') snd.ctx.resume();
  g.state = 'select'; show('select'); renderSelect(); startDemo(g.idx);
}

// ---- practice checkpoints ----------------------------------------------------
function placeCp(auto = false) {
  if (!g.practice || g.state !== 'play' || g.dead || !g.s) return;
  g.cps.push({ s: clone(g.s) });
  if (g.cps.length > 60) g.cps.shift();
  g.lastAutoCp = g.s.x;
  ring(g.s.x + 0.5, g.s.y + 0.5, '#50ff8c', 1.4);
  if (!auto) snd.fx('check');
}
function removeCp() {
  if (!g.practice || !g.cps.length) return;
  g.cps.pop(); snd.fx('uncheck');
}

// ---- juice ------------------------------------------------------------------
function burst(x, y, n, cols, sp, life) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random());
    g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 10, life: life * (0.6 + Math.random() * 0.6), max: life,
      sz: 0.12 + Math.random() * 0.22, c: cols[i % cols.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 20 });
  }
}
function ring(x, y, c, size) { g.parts.push({ x, y, k: 'ring', c, sz: size, life: 0.4, max: 0.4, vx: 0, vy: 0 }); }
function handle(ev) {
  for (const e of ev) {
    const [n, x, y] = e;
    if (n === 'jump') {
      g.jumps++;
      const fy = g.s.grav === 1 ? y : y + 1;
      for (let i = 0; i < 4; i++) g.parts.push({ x: x + 0.2 + Math.random() * 0.6, y: fy, vx: -2 - Math.random() * 2, vy: g.s.grav * (1 + Math.random() * 2), g: 0, life: 0.25, max: 0.25, sz: 0.12, c: '#fff', k: 'shrink' });
    } else if (n === 'land') {
      g.squash = 1;
      const fy = e[3] === 1 ? y : y + 1;
      for (let i = 0; i < 6; i++) g.parts.push({ x: x + Math.random(), y: fy, vx: (Math.random() - 0.7) * 4, vy: e[3] * Math.random() * 2, g: 0, life: 0.3, max: 0.3, sz: 0.1, c: g.pal.a, k: 'shrink' });
    } else if (n === 'pad') {
      snd.fx('pad'); ring(x, y, '#ffd93d', 1.6); burst(x, y, 10, ['#ffd93d', '#fff'], 6, 0.4); g.shake = Math.max(g.shake, 0.2);
    } else if (n === 'orb' || n === 'flip') {
      snd.fx(n); ring(x, y, n === 'orb' ? '#ffe14d' : '#4dd2ff', 1.8); burst(x, y, 10, [n === 'orb' ? '#ffe14d' : '#4dd2ff', '#fff'], 6, 0.4);
      g.flash = Math.max(g.flash, 0.12);
    } else if (n === 'portal') {
      snd.fx('portal'); g.flash = Math.max(g.flash, 0.3); ring(x, y, e[3] === -1 ? '#ffdd33' : '#33e1ff', 3); g.shake = Math.max(g.shake, 0.25);
    } else if (n === 'die') {
      if (!g.demo) die(); else { g.dead = true; g.deadT = 0; }
    } else if (n === 'done') {
      if (!g.demo) complete();
    }
  }
}

// ---- camera -------------------------------------------------------------------
function camTarget() {
  const s = g.s;
  const tx = s.x - R.viewW * R.lead;
  const above = R.baseY / R.U; // world units visible above camY
  let ty = g.cam.y;
  if (s.y + 1 > ty + above - 2.2) ty = s.y + 3.2 - above;
  if (s.y < ty + 1.2) ty = s.y - 1.2;
  if (ty < 0) ty = 0;
  return { tx, ty };
}
function snapCam() { const t = camTarget(); g.cam.x = t.tx; g.cam.y = t.ty; }

// ---- input --------------------------------------------------------------------
let keyHeld = false;
const ptrs = new Set();
function setHeld() {
  const h = keyHeld || ptrs.size > 0;
  if (h && !g.held) g.latch = 5; // a very quick tap still counts as a press for a few ticks
  g.held = h;
}
const JUMP = new Set(['Space', 'ArrowUp', 'KeyW', 'Enter', 'NumpadEnter']);
const canvas = $('c');
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  unlockAudio();
  if (g.state === 'play') { ptrs.add(e.pointerId); setHeld(); try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* fine */ } }
});
const up = (e) => { ptrs.delete(e.pointerId); setHeld(); };
window.addEventListener('pointerup', up);
window.addEventListener('pointercancel', up);
window.addEventListener('blur', () => { ptrs.clear(); keyHeld = false; setHeld(); });
window.addEventListener('keydown', (e) => {
  if (e.repeat && JUMP.has(e.code)) { e.preventDefault(); return; }
  unlockAudio();
  const st = g.state;
  if (JUMP.has(e.code)) e.preventDefault();
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (st === 'play') {
    if (JUMP.has(e.code)) { keyHeld = true; setHeld(); }
    else if (e.code === 'Escape' || e.code === 'KeyP') pause();
    else if (e.code === 'KeyR') { if (g.practice) g.cps = []; g.attempts = Math.max(0, g.attempts); startAttempt(); }
    else if (e.code === 'KeyZ') placeCp();
    else if (e.code === 'KeyX') removeCp();
  } else if (st === 'pause') {
    if (e.code === 'Escape' || e.code === 'KeyP' || e.code === 'Space') resume();
    else if (e.code === 'KeyR') { resume(); startAttempt(); }
  } else if (st === 'title') {
    if (JUMP.has(e.code)) playFromTitle();
    else if (e.code === 'KeyL' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') goSelect();
  } else if (st === 'select') {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') selMove(-1);
    else if (e.code === 'ArrowRight' || e.code === 'KeyD') selMove(1);
    else if (e.code === 'Space' || e.code === 'Enter') startLevel(g.idx, false);
    else if (e.code === 'KeyP') startLevel(g.idx, true);
    else if (e.code === 'Escape') { g.state = 'title'; show('title'); renderTitle(); }
  } else if (st === 'results') {
    if (e.code === 'Space' || e.code === 'KeyR') startLevel(g.idx, g.results.practice);
    else if (e.code === 'Enter' && g.idx < LEVELS.length - 1) startLevel(g.idx + 1, false);
    else if (e.code === 'Escape') toMenu();
  }
});
window.addEventListener('keyup', (e) => { if (JUMP.has(e.code)) { keyHeld = false; setHeld(); } });
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
window.addEventListener('resize', () => { R.resize(); if (g.s) snapCam(); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

// buttons (pointerdown so taps feel instant; stop them reaching the canvas)
const btn = (id, fn) => {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => e.stopPropagation());
  el.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); snd.fx('click'); fn(); });
};
btn('bPlay', () => playFromTitle());
btn('bLevels', () => goSelect());
// a tap anywhere on the title (not on a button) starts the run too
$('title').addEventListener('pointerdown', (e) => { if (e.target.closest('button')) return; e.preventDefault(); playFromTitle(); });
btn('bBack', () => { g.state = 'title'; show('title'); renderTitle(); });
btn('bPrev', () => selMove(-1));
btn('bNext', () => selMove(1));
btn('bMute', toggleMute);
btn('bMute2', toggleMute);
btn('bMute3', toggleMute);
btn('bSound', toggleMute);
btn('bPause', pause);
btn('bResume', resume);
btn('bRestart', () => { resume(); if (g.practice) g.cps = []; startAttempt(); });
btn('bPractice', () => {
  const wasPractice = g.practice;
  const s = g.s && !g.dead ? clone(g.s) : null;
  resume();
  g.practice = !wasPractice; g.cps = [];
  g.attempts = 0;
  if (g.practice && s) g.cps.push({ s });
  startAttempt();
});
btn('bMenu', toMenu);
btn('bMenu2', toMenu);
btn('bRetry', () => startLevel(g.idx, g.results.practice));
btn('bNextLv', () => startLevel(Math.min(g.idx + 1, LEVELS.length - 1), false));
btn('bCp', () => placeCp());
btn('bCpDel', () => removeCp());

// ---- level select ------------------------------------------------------------
// first level you have not beaten (or the one you last picked)
function titleLevel() {
  const first = LEVELS.findIndex((l) => !lvSave(l.id).done);
  return save.sel ? g.idx : Math.max(0, first);
}
function playFromTitle() { if (g.state !== 'title') return; snd.unlock(); snd.fx('click'); startLevel(titleLevel(), false); }
function renderTitle() {
  const i = titleLevel();
  $('titleLv').innerHTML = `Level ${i + 1}: <b>${LEVELS[i].name}</b>`;
}
function goSelect() { unlockAudio(); g.state = 'select'; show('select'); renderSelect(); if (!g.demo || g.L !== levels[g.idx]) startDemo(g.idx); else if (snd.ctx && !snd.song) snd.play(LEVELS[g.idx], g.s.x / g.L.speed, { vol: 0.42 }); }
function selMove(d) {
  const n = Math.max(0, Math.min(LEVELS.length - 1, g.idx + d));
  if (n === g.idx) return;
  g.idx = n; save.sel = n; persist(); renderSelect(); startDemo(n);
}
const DIFFS = ['Chill', 'Steady', 'Spicy', 'Wild', 'Ferocious', 'Brutal'];
function renderSelect() {
  const def = LEVELS[g.idx], ls = lvSave(def.id), L = levels[g.idx];
  const col = `hsl(${def.hue},100%,65%)`;
  const card = $('card');
  card.style.setProperty('--cc', col);
  card.style.setProperty('--cg', `hsla(${def.hue},100%,60%,0.4)`);
  const d = DIFFS.indexOf(def.diff) + 1;
  card.innerHTML = `
    <div class="num">LEVEL ${g.idx + 1} OF ${LEVELS.length}</div>
    <div class="name">${def.name}</div>
    <div class="meta"><span class="pips">${Array.from({ length: 6 }, (_, i) => `<i class="${i < d ? 'on' : ''}"></i>`).join('')}</span><span>${def.diff}</span><span>${def.bpm} BPM</span><span>${Math.round(L.length / L.speed)}s</span></div>
    ${ls.done ? '<div class="done">COMPLETE</div>' : ''}
    <div class="barLbl">NORMAL</div><div class="bar"><div style="width:${ls.best}%"></div><span>${ls.best}%</span></div>
    <div class="barLbl">PRACTICE</div><div class="bar p"><div style="width:${ls.pbest}%"></div><span>${ls.pbest}%</span></div>
    <div class="meta"><span>${ls.att} attempts</span></div>
    <div class="btns"><button class="big" id="cPlay">PLAY</button><button class="mid" id="cPrac">PRACTICE</button></div>`;
  btn('cPlay', () => startLevel(g.idx, false));
  btn('cPrac', () => startLevel(g.idx, true));
  $('bPrev').disabled = g.idx === 0;
  $('bNext').disabled = g.idx === LEVELS.length - 1;
  $('dots').innerHTML = LEVELS.map((l, i) => `<i class="${i === g.idx ? 'on' : ''} ${lvSave(l.id).done ? 'won' : ''}"></i>`).join('');
  $('pals').innerHTML = PALETTES.map((p, i) => `<button class="pal ${i === save.pal ? 'sel' : ''} ${palUnlocked(i) ? '' : 'lock'}" data-i="${i}" title="${palUnlocked(i) ? p.name : 'Beat level ' + i + ' to unlock'}" style="background:${p.a};--pb:${p.b}"><i></i></button>`).join('');
  for (const el of $('pals').children) {
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', () => {
      const i = +el.dataset.i;
      if (!palUnlocked(i)) { const pm = $('palMsg'); pm.textContent = 'Beat level ' + i + ' to unlock'; pm.classList.add('on'); clearTimeout(pm._t); pm._t = setTimeout(() => pm.classList.remove('on'), 1400); snd.fx('uncheck'); return; }
      save.pal = i; g.pal = PALETTES[i]; persist(); snd.fx('click'); renderSelect();
    });
  }
}

// ---- main loop -----------------------------------------------------------------
let last = performance.now();
function simTicks(dt) {
  g.acc += dt;
  const L = g.L, s = g.s;
  let n = 0;
  while (g.acc >= DT && n < 60) {
    g.acc -= DT; n++;
    let held = g.held || g.latch > 0;
    if (g.latch > 0) g.latch--;
    if (g.demo) held = g.demoTicks ? !!g.demoTicks[s.tick] : false;
    else if (g.botTicks) held = !!g.botTicks[s.tick];
    const ev = [];
    step(L, s, held, ev);
    if (!g.demo && g.state === 'play') g.runTime += DT;
    if (ev.length) handle(ev);
    if (g.dead || s.done) { g.acc = 0; break; }
    // practice: drop a checkpoint every ~1.6 s on safe ground
    if (g.practice && s.grounded && s.x - g.lastAutoCp > L.speed * 1.6) {
      g.lastAutoCp = s.x;
      if (solve(L, { from: s, gran: 6, horizon: 200, maxNodes: 3000 }).ok) placeCp(true);
    }
  }
}
function update(dt) {
  g.time += dt;
  const s = g.s;
  if (g.state === 'play' && s) {
    if (g.hitstop > 0) g.hitstop -= dt;
    else if (!g.dead) simTicks(dt);
    if (g.dead) { g.deadT += dt; if (g.deadT > 0.85) startAttempt(); }
  } else if ((g.state === 'title' || g.state === 'select') && s && g.demo) {
    if (!g.dead && !s.done) simTicks(dt);
    if (g.dead || s.done || s.x > g.L.length - 2) { g.deadT += dt; if (g.deadT > 0.6 || s.done) startDemo(g.idx); }
  } else if (g.state === 'complete' && s) {
    g.doneT += dt;
    s.x += g.L.speed * dt; s.y += 6 * dt; s.rot += 8 * dt;
    if (g.doneT > 0.25) g.hidePlayer = true;
    if (g.doneT > 1.7) showResults();
  }
  // trail + ground sparks
  if (s && !g.dead && (g.state === 'play' || g.demo)) {
    if (!s.grounded) { g.trail.push({ x: s.x, y: s.y, r: s.rot }); if (g.trail.length > 7) g.trail.shift(); }
    else if (g.trail.length) g.trail.shift();
    if (s.grounded && Math.random() < 0.7) {
      const fy = s.grav === 1 ? s.y : s.y + 1;
      g.parts.push({ x: s.x + 0.1, y: fy + s.grav * 0.05, vx: -3 - Math.random() * 3, vy: s.grav * (0.5 + Math.random() * 1.5), g: 0, life: 0.3, max: 0.3, sz: 0.08 + Math.random() * 0.08, c: Math.random() < 0.5 ? g.pal.a : '#fff', k: 'shrink' });
    }
  }
  // particles
  for (const p of g.parts) {
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.g) p.vy -= p.g * dt;
    if (p.vr) p.r += p.vr * dt;
  }
  if (g.parts.length) g.parts = g.parts.filter((p) => p.life > 0);
  if (g.parts.length > 400) g.parts.splice(0, g.parts.length - 400);
  g.shake = Math.max(0, g.shake - dt * 3);
  g.flash = Math.max(0, g.flash - dt * 2.5);
  g.squash = Math.max(0, g.squash - dt * 7);
  if (g.banner) { g.banner.t -= dt; if (g.banner.t <= 0) g.banner = null; }
  if (g.deathPop) { g.deathPop.t -= dt; if (g.deathPop.t <= 0) g.deathPop = null; }
  // camera
  if (s && g.state !== 'complete') {
    const t = camTarget();
    g.cam.x = t.tx;
    g.cam.y += (t.ty - g.cam.y) * Math.min(1, dt * 5);
  }
  // music pulse straight from the course position (course time == song time)
  if (g.L && s) {
    const songT = s.x / g.L.speed;
    const beat = songT * g.L.bpm / 60;
    const frac = beat - Math.floor(beat);
    g.pulse = g.dead ? g.pulse * 0.9 : Math.exp(-frac * 6);
    g.hue = LEVELS[g.idx].hue + 22 * Math.sin(s.x / 45);
    g.pct = progress(g.L, s);
  }
}
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (!g.frozen) {
    if (g.state !== 'pause') update(dt);
    R.draw(g);
  }
  requestAnimationFrame(frame);
}

// ---- boot -----------------------------------------------------------------------
if (params.get('play') === '1') {
  const i = Math.max(0, Math.min(LEVELS.length - 1, (+params.get('level') || 1) - 1));
  startLevel(i, params.get('practice') === '1');
} else {
  show('title');
  renderTitle();
  startDemo(g.idx);
}
requestAnimationFrame(frame);

// ---- test hooks --------------------------------------------------------------------
window.__G = {
  g, levels, LEVELS, save, snd,
  get state() { return g.state; },
  start: (i, practice = false) => startLevel(i, practice),
  // advance the simulation n ticks synchronously with a given input (headless bots)
  step: (n = 1, held = false) => { for (let i = 0; i < n && g.state === 'play' && !g.dead; i++) { g.held = held; simTicks(DT); } return g.s; },
  solve: (i) => getSolution(i),
  bot: (on = true) => { g.botOn = on; g.botTicks = on && !g.practice ? getSolution(g.idx) : null; },
  pause, resume, toMenu, placeCp, removeCp, showResults,
  pct: () => (g.L && g.s ? Math.floor(progress(g.L, g.s) * 100) : 0),
  // freeze the frame loop (headless screenshots); draw once so the canvas is current
  freeze: (on = true) => { if (on) { update(0); R.draw(g); } g.frozen = on; last = performance.now(); },
};
