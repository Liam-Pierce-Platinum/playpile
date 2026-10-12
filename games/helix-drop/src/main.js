// HELIX DROP - boot, states, input, UI, saving.
import { Game, STEP, SEG, TAU } from './game.js';
import { Renderer, themeFor } from './render.js';
import { Sfx } from './audio.js';

const KEY = 'pd.helix-drop';
const save = (() => {
  const def = { level: 1, best: 0, bestEndless: 0, muted: false, plays: 0 };
  try { return Object.assign(def, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { return def; }
})();
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* no storage */ } };

const qs = new URLSearchParams(location.search);
if (qs.get('level')) save.level = Math.max(1, parseInt(qs.get('level'), 10) || 1);

const canvas = document.getElementById('c');
const ui = document.getElementById('ui');
const game = new Game();
const view = new Renderer(canvas);
const sfx = new Sfx(); sfx.muted = !!save.muted;

const G = window.__G = { game, render: view, state: 'title', paused: false, botOn: false };
let state = 'title';
let stateT = 0;
let clearTimer = 0;
let runScore = 0;      // score carried between levels

function setState(s) { state = G.state = s; stateT = 0; renderUI(); }

// ------------------------------------------------------------------ flow
function newTower(mode, level, score) {
  game.reset(mode, level, score);
  game.events.length = 0;
  view.build(game, mode === 'endless' ? themeFor(5 + (Date.now() % 3)) : themeFor(level));
}

function start(mode = 'levels') {
  sfx.unlock(); sfx.click();
  save.plays++; persist();
  // from the title the LEVELS tower is already built with the ball bouncing: keep it, land straight in
  if (mode === 'endless' || game.mode !== 'levels' || !game.alive || state !== 'title') newTower(mode, mode === 'endless' ? 1 : save.level, 0);
  G.bestBefore = mode === 'endless' ? save.bestEndless : save.best;
  setState('play');
}
G.start = start;

function retry() {
  sfx.unlock();
  newTower(game.mode, game.level, game.mode === 'endless' ? 0 : game.startScore);
  G.bestBefore = game.mode === 'endless' ? save.bestEndless : save.best;
  setState('play');
}
G.retry = retry;

function toTitle() {
  newTower('levels', save.level, 0);
  setState('title');
}

function nextLevel() {
  save.level = Math.max(save.level, game.level + 1); persist();
  newTower('levels', game.level + 1, game.score);
  setState('play');
}

// ------------------------------------------------------------------ input
let dragging = false, lastX = 0, dragPx = 0;
const sens = () => (TAU * 0.95) / Math.min(window.innerWidth, 760);
canvas.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  dragging = true; lastX = e.clientX; dragPx = 0;
  try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX; lastX = e.clientX; dragPx += Math.abs(dx);
  if (state === 'play' && !G.paused) game.rotate(dx * sens());
  else if (state === 'title' && dragPx > 8) { /* spinning on the title starts the game */ start('levels'); }
});
const up = (e) => {
  if (!dragging) return; dragging = false;
  if (dragPx < 8) tapAnywhere();
};
canvas.addEventListener('pointerup', up);
canvas.addEventListener('pointercancel', () => { dragging = false; });

function tapAnywhere() {
  if (state === 'dead' && stateT > 0.35) retry();
  else if (state === 'clear' && stateT > 0.3) nextLevel();
}

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.repeat) return;
  sfx.unlock();
  if (e.code === 'Space' || e.code === 'Enter') {
    e.preventDefault();
    if (state === 'title') start('levels');
    else if (state === 'dead') retry();
    else if (state === 'clear') nextLevel();
    else if (G.paused) togglePause();
  } else if (e.code === 'KeyR') { if (state !== 'title') retry(); }
  else if (e.code === 'Escape' || e.code === 'KeyP') { if (state === 'play') togglePause(); }
  else if (e.code === 'KeyM') toggleMute();
  else if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight' || e.code === 'KeyA' || e.code === 'KeyD') && state === 'title') start('levels');
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; if (state === 'play' && !G.paused) togglePause(); });
let keySpin = 0;

function togglePause() { G.paused = !G.paused; sfx.click(); renderUI(); }
function toggleMute() { save.muted = !save.muted; persist(); sfx.unlock(); sfx.setMuted(save.muted); renderUI(); }

// ------------------------------------------------------------------ UI
const el = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
const speaker = (m) => m
  ? '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>'
  : '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';

let hud = null;
function renderUI() {
  ui.innerHTML = '';
  hud = null;
  const mute = el(`<button class="icon mute" aria-label="Mute">${speaker(save.muted)}</button>`);
  mute.onclick = (e) => { e.stopPropagation(); toggleMute(); };

  if (state === 'title') {
    const t = el(`<div class="title">
      <div class="logo"><h1><span>HELIX</span><span>DROP</span></h1></div>
      <div class="lvlchip">LEVEL ${save.level}</div>
      <button class="play">PLAY</button>
      <button class="endless">ENDLESS <small>best ${save.bestEndless}</small></button>
      <div class="hint">drag to spin the tower &middot; avoid red</div>
      <div class="bestline">best score ${save.best}</div>
    </div>`);
    t.querySelector('.play').onclick = () => start('levels');
    t.querySelector('.endless').onclick = () => start('endless');
    ui.append(t, mute);
    return;
  }

  // HUD
  hud = el(`<div class="hud">
    <div class="bar">${game.mode === 'endless'
      ? '<div class="depth">ENDLESS</div>'
      : `<span class="lv cur">${game.level}</span><div class="track"><i></i></div><span class="lv nxt">${game.level + 1}</span>`}</div>
    <div class="score">${game.score}</div>
    <div class="combo"></div>
  </div>`);
  const pause = el('<button class="icon pausebtn" aria-label="Pause"><i></i><i></i></button>');
  pause.onclick = (e) => { e.stopPropagation(); if (state === 'play') togglePause(); };
  ui.append(hud, pause, mute);
  hud._fill = hud.querySelector('.track i'); hud._score = hud.querySelector('.score'); hud._combo = hud.querySelector('.combo');

  if (state === 'play' && G.paused) {
    const p = el(`<div class="scrim"><div class="card">
      <h2>PAUSED</h2>
      <button class="play small">RESUME</button>
      <div class="row"><button class="ghost restart">RESTART</button><button class="ghost menu">MENU</button></div>
    </div></div>`);
    p.querySelector('.play').onclick = togglePause;
    p.querySelector('.restart').onclick = () => { G.paused = false; retry(); };
    p.querySelector('.menu').onclick = () => { G.paused = false; toTitle(); };
    ui.append(p);
  } else if (state === 'dead') {
    const endless = game.mode === 'endless';
    const pct = Math.round(game.progress() * 100);
    const newBest = G.newBest;
    const d = el(`<div class="scrim dead"><div class="card">
      <h2>SPLAT!</h2>
      ${endless ? `<div class="big">${game.passed}<small>rings deep</small></div>`
        : `<div class="pct"><div class="ring" style="--p:${pct}"><span>${pct}%</span></div><div>LEVEL ${game.level}<br><small>completed</small></div></div>`}
      <div class="stats"><div><small>SCORE</small><b>${game.score}</b></div><div><small>BEST</small><b>${endless ? save.bestEndless : save.best}</b></div></div>
      ${newBest ? '<div class="newbest">NEW BEST!</div>' : ''}
      <button class="play small">RETRY</button>
      <div class="tapnote">tap anywhere to retry</div>
      <button class="cornermenu menu" aria-label="Menu"><svg viewBox="0 0 24 24"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/></svg></button>
    </div></div>`);
    d.querySelector('.play').onclick = (e) => { e.stopPropagation(); retry(); };
    d.querySelector('.menu').onclick = (e) => { e.stopPropagation(); toTitle(); };
    d.onclick = () => { if (stateT > 0.35) retry(); };
    ui.append(d);
  } else if (state === 'clear') {
    const c = el(`<div class="banner"><h2>LEVEL ${game.level}<br>CLEAR!</h2><div class="sub">tap to continue</div></div>`);
    c.onclick = () => nextLevel();
    ui.append(c);
  }
}

let popN = 0;
function pop(text, cls = '') {
  const p = view.ballScreen();
  // beside the ball (not on it), alternating height so chains do not stack
  if (cls !== 'fire') { p.x += Math.min(110, window.innerWidth * 0.2); p.y += (popN++ % 2) * 26; } else p.y += 90;
  const d = el(`<div class="pop ${cls}">${text}</div>`);
  d.style.left = p.x + 'px'; d.style.top = (p.y - 40) + 'px';
  ui.append(d);
  setTimeout(() => d.remove(), 900);
}

function vibrate(ms) { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} }

// ------------------------------------------------------------------ events from the game
function handleEvents() {
  for (const e of game.events) {
    view.onEvent(e, game);
    if (e.type === 'bounce') sfx.bounce(e.soft);
    else if (e.type === 'pass') {
      sfx.pass(e.streak);
      pop('+' + e.pts, e.streak >= 2 ? 'hot' : '');
      if (hud && e.streak >= 2) { hud._combo.textContent = 'x' + e.streak; hud._combo.classList.remove('go'); void hud._combo.offsetWidth; hud._combo.classList.add('go'); }
    } else if (e.type === 'fire') { sfx.fire(); pop('ON FIRE!', 'fire'); vibrate(20); }
    else if (e.type === 'smash') { sfx.smash(); pop('SMASH +' + e.pts, 'fire'); vibrate(40); }
    else if (e.type === 'death') {
      sfx.death(); vibrate([30, 40, 60]);
      const k = game.mode === 'endless' ? 'bestEndless' : 'best';
      G.newBest = game.score > (G.bestBefore ?? save[k]);
      save[k] = Math.max(save[k], game.score);
      persist();
      setTimeout(() => { if (state === 'play' && !game.alive) setState('dead'); }, 650);
    } else if (e.type === 'clear') {
      sfx.clear(); vibrate(30);
      pop('+' + e.bonus, 'hot');
      if (game.score > save.best) save.best = game.score;
      save.level = Math.max(save.level, game.level + 1); persist();
      clearTimer = 1.5;
      setState('clear');
    }
  }
  game.events.length = 0;
}

// ------------------------------------------------------------------ loop
let acc = 0, last = performance.now();
function simulate(dt) {
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 20) {
    if (G.botOn && state === 'play' && game.alive) {
      const want = game.botTarget(); const d = want - game.theta; const mx = 14 * STEP;
      game.rotate(Math.max(-mx, Math.min(mx, d)));
    }
    if (keySpin) game.rotate(keySpin * STEP);
    game.update(STEP); acc -= STEP; n++;
  }
  if (n >= 20) acc = 0;
}

// adaptive quality: if real play runs under ~33 fps for 2 s, drop pixel ratio, then shadows (remembered)
const HQ = qs.get('hq') === '1';
let perfT = 0, perfN = 0, perfSum = 0;
if (!HQ && save.q) view.setQuality(save.q);
function watchPerf(raw) {
  if (HQ || state !== 'play' || G.paused || stateT < 1 || raw > 0.5 || (view.quality || 0) >= 2) { perfT = perfN = perfSum = 0; return; }
  perfT += raw; perfN++; perfSum += raw;
  if (perfT >= 2) {
    if (perfSum / perfN > 0.03) { save.q = (view.quality || 0) + 1; view.setQuality(save.q); persist(); }
    perfT = perfN = perfSum = 0;
  }
}

function tick(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.05, raw); last = now;
  watchPerf(raw);
  stateT += dt;
  // keyboard spin with a little acceleration
  const dir = (keys.ArrowLeft || keys.KeyA ? 1 : 0) - (keys.ArrowRight || keys.KeyD ? 1 : 0);
  keySpin = dir ? Math.sign(dir) * Math.min(5.2, Math.abs(keySpin) + dt * 30) : 0;
  if (state !== 'play') keySpin = 0;
  if (!G.paused) {
    if (state === 'title') { game.theta = 0.35 * Math.sin(performance.now() / 1400); simulate(dt); }
    else simulate(dt);
    handleEvents();
    if (state === 'clear') { clearTimer -= dt; if (clearTimer <= 0) nextLevel(); }
  }
  if (hud) {
    if (hud._fill) hud._fill.style.width = (game.progress() * 100).toFixed(1) + '%';
    hud._score.textContent = game.score;
  }
  view.frame(game, G.paused ? 0 : dt, state);
  requestAnimationFrame(tick);
}

// headless helpers
G.step = (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { if (G.botOn && game.alive && state === 'play') { const d = game.botTarget() - game.theta, mx = 14 * STEP; game.rotate(Math.max(-mx, Math.min(mx, d))); } game.update(STEP); handleEvents(); if (state === 'clear') { clearTimer -= STEP; if (clearTimer <= 0) nextLevel(); } } };
G.bot = (on) => { G.botOn = on; };
G.rotate = (r) => game.rotate(r);
G.save = save;
Object.defineProperty(G, 'state', { get: () => state, set: () => {} });

window.addEventListener('resize', () => view.resize());
newTower('levels', save.level, 0);
const pq = qs.get('play');
if (pq) start(pq === 'endless' ? 'endless' : 'levels'); else renderUI();
requestAnimationFrame(tick);
