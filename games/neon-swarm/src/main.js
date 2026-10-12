// Boot, fixed-step loop, screens (title / pause / results), HUD, test hooks.
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Input } from './input.js';
import { Audio } from './audio.js';
import { load, store } from './save.js';

const $ = (s, r = document) => r.querySelector(s);
const fmt = (n) => Math.floor(n).toLocaleString('en-US');
const params = new URLSearchParams(location.search);

const canvas = $('#c');
const ui = $('#ui');
const ren = new Renderer(canvas);
const input = new Input(canvas);
const audio = new Audio();
const save = load();
audio.setMuted(!!save.muted);

let state = 'title'; // title | play | over
let paused = false;
let game = null;
let demo = null; // attract-mode game behind the title
let overShownAt = 0;
let botOn = params.get('bot') === '1';

// ------------------------------------------------------------ HUD
ui.innerHTML = `
  <div id="hud" class="hidden">
    <div class="hl"><div id="score">0</div><div id="mult">x1</div></div>
    <div class="hc"><div id="wave"></div></div>
    <div class="hr"><div id="lives"></div><div id="bombs"></div>
      <button class="iconbtn" id="pauseBtn" aria-label="Pause"><i></i><i></i></button></div>
  </div>
  <div id="banner"><b></b><span></span></div>
  <div id="hint" class="hidden"></div>
  <button id="bombBtn" class="hidden" aria-label="Bomb">BOMB<small id="bombN"></small></button>
  <div id="screen"></div>
  <button id="muteBtn" class="iconbtn mute" aria-label="Mute"></button>`;
const hud = { root: $('#hud'), score: $('#score'), mult: $('#mult'), wave: $('#wave'), lives: $('#lives'), bombs: $('#bombs') };
const screen = $('#screen');
const banner = $('#banner');
const bombBtn = $('#bombBtn');
const muteBtn = $('#muteBtn');
const last = {};
const setText = (el, key, v) => { if (last[key] !== v) { last[key] = v; el.innerHTML = v; } };

function showBanner(text, sub) {
  banner.querySelector('b').textContent = text;
  banner.querySelector('b').classList.toggle('num', /\d/.test(text)); // Russo One: Orbitron slashes its zeros
  banner.querySelector('span').textContent = sub || '';
  banner.classList.remove('show'); void banner.offsetWidth; banner.classList.add('show');
}
function paintMute() { muteBtn.innerHTML = save.muted ? SVG_MUTED : SVG_SOUND; muteBtn.classList.toggle('off', !!save.muted); const sb = $('#sndBtn .lbl'); if (sb) sb.textContent = 'SOUND: ' + (save.muted ? 'OFF' : 'ON'); }
const SVG_SOUND = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
const SVG_MUTED = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
function toggleMute() { save.muted = !save.muted; audio.setMuted(save.muted); store(save); paintMute(); }
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); unlock(); toggleMute(); });
paintMute();

function updateHud() {
  const g = game;
  setText(hud.score, 'score', fmt(g.score));
  setText(hud.mult, 'mult', 'x' + g.mult);
  hud.mult.style.transform = `scale(${1 + g.multPulse * 0.25})`;
  if (g.mode === 'blitz') {
    const s = Math.ceil(g.timeLeft);
    setText(hud.wave, 'wave', `<span class="${s <= 10 ? 'warn' : ''}">${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}</span>`);
    setText(hud.lives, 'lives', '');
  } else {
    setText(hud.wave, 'wave', g.wave ? 'WAVE ' + g.wave : '');
    // compact past 3 so the top bar never collides on a 390 px phone
    const ship = '<svg class="ship" viewBox="-14 -14 28 28"><path d="M0 -15 L12 3 L8 11 L0 4 L-8 11 L-12 3Z"/></svg>';
    setText(hud.lives, 'lives', g.lives > 3 ? ship + `<em>x${g.lives}</em>` : ship.repeat(Math.max(0, g.lives)));
  }
  setText(hud.bombs, 'bombs', g.mode === 'blitz' ? '' : g.bombs > 3 ? `<i class="bomb"></i><em>x${g.bombs}</em>` : '<i class="bomb"></i>'.repeat(g.bombs));
  updateHint(g);
  const showBomb = input.touch && g.mode === 'surge' && state === 'play';
  bombBtn.classList.toggle('hidden', !showBomb);
  bombBtn.classList.toggle('empty', g.bombs <= 0);
  setText($('#bombN'), 'bombN', String(g.bombs));
}

// first-runs control hint: stays until the player has actually moved for a
// moment (or 7 s pass), so nobody is left wondering what to press
const hint = $('#hint');
let hintMoved = 0, hintOn = false;
function showHint() {
  hintOn = save.runs < 3 && !botOn; hintMoved = 0;
  if (!hintOn) { hint.classList.add('hidden'); return; }
  const touchy = input.touch || matchMedia('(pointer: coarse)').matches;
  hint.className = touchy ? 'touch' : 'desk';
  hint.innerHTML = touchy
    ? '<div class="zone l"><i></i><span><b>DRAG</b> to move</span></div><div class="zone r"><i></i><span><b>DRAG</b> to aim</span><small>or let it auto-aim</small></div>'
    : '<div class="keys"><span><b>W A S D</b> move</span><span><b>MOUSE</b> aim</span><span>fire is <b>automatic</b></span></div>';
}
function updateHint(g) {
  if (!hintOn) return;
  if (Math.hypot(g.inp.mx, g.inp.my) > 0.3) hintMoved += 1 / 60;
  if (hintMoved > 0.8 || g.t > 7 || state !== 'play') { hintOn = false; hint.classList.add('gone'); }
}

// ------------------------------------------------------------ screens
function bestLine(mode) { return save.best[mode] ? 'BEST ' + fmt(save.best[mode]) : 'NO SCORE YET'; }
function showTitle() {
  state = 'title'; paused = false; document.body.classList.remove('playing'); hint.classList.add('hidden');
  hud.root.classList.add('hidden'); bombBtn.classList.add('hidden');
  if (!demo) makeDemo();
  screen.innerHTML = `
    <div class="scrim title">
      <div class="logo"><h1><span>NEON</span><span>SWARM</span></h1><p>twin-stick arena shooter</p></div>
      <button class="btn primary big" id="playBtn"><span class="lbl">PLAY</span><small>${bestLine('surge')}</small></button>
      <button class="btn" id="blitzBtn"><span class="lbl">BLITZ 3:00</span><small>${bestLine('blitz')}</small></button>
      <div class="how">${input.touch || matchMedia('(pointer: coarse)').matches
        ? '<b>LEFT THUMB</b> move &middot; <b>RIGHT THUMB</b> aim &amp; fire<br>no right thumb = auto-aim &middot; <b>BOMB</b> clears all'
        : '<b>WASD</b> move &middot; <b>MOUSE</b> aim (auto-fire)<br><b>SPACE / RIGHT CLICK</b> bomb &middot; <b>ESC</b> pause'}<br><span class="geo">collect green shards to raise the multiplier</span></div>
    </div>`;
  $('#playBtn').addEventListener('click', () => start('surge'));
  $('#blitzBtn').addEventListener('click', () => start('blitz'));
  $('#playBtn').focus({ preventScroll: true });
}
function makeDemo() {
  demo = new Game('surge');
  demo.bot = true; demo.lives = 999; demo.bombs = 0;
  demo.t = 60; // skip the empty opening seconds so the background is busy
  for (let i = 0; i < 420; i++) demo.step(1 / 60);
  demo.events.length = 0;
}
function start(mode) {
  unlock();
  audio.play({ type: 'ui' });
  game = new Game(mode);
  game.bot = botOn;
  demo = null;
  state = 'play'; paused = false;
  screen.innerHTML = '';
  hud.root.classList.remove('hidden');
  for (const k in last) delete last[k];
  ren.follow(game, 0, true);
  audio.startMusic();
  document.body.classList.add('playing');
  showHint();
  updateHud();
  showBanner(mode === 'blitz' ? 'BLITZ' : 'SURGE', mode === 'blitz' ? '3 MINUTES - SCORE ATTACK' : 'SURVIVE THE SWARM');
}
function pause() {
  if (state !== 'play' || paused) return;
  paused = true; document.body.classList.remove('playing'); banner.classList.remove('show');
  screen.innerHTML = `
    <div class="scrim">
      <div class="panel">
        <h2>PAUSED</h2>
        <button class="btn primary big" id="resBtn"><span class="lbl">RESUME</span></button>
        <div class="row2"><button class="btn" id="rstBtn"><span class="lbl">RESTART</span></button><button class="btn" id="menuBtn"><span class="lbl">MENU</span></button></div>
        <button class="btn sound" id="sndBtn"><span class="lbl">SOUND: ${save.muted ? 'OFF' : 'ON'}</span><small>M</small></button>
      </div>
    </div>`;
  $('#resBtn').addEventListener('click', resume);
  $('#sndBtn').addEventListener('click', toggleMute);
  $('#rstBtn').addEventListener('click', () => start(game.mode));
  $('#menuBtn').addEventListener('click', () => { game = null; showTitle(); });
  audio.stopMusic();
}
function resume() { if (!paused) return; paused = false; document.body.classList.add('playing'); screen.innerHTML = ''; audio.startMusic(); }

function showResults() {
  state = 'over'; overShownAt = performance.now(); banner.classList.remove('show'); // no WAVE banner bleeding behind GAME OVER
  document.body.classList.remove('playing'); hint.classList.add('hidden');
  const g = game;
  const prev = save.best[g.mode] || 0;
  const isBest = g.score > prev;
  if (isBest) save.best[g.mode] = g.score;
  save.runs++; save.kills += g.kills;
  save.bestMult = Math.max(save.bestMult, g.maxMult); save.bestWave = Math.max(save.bestWave, g.wave);
  store(save);
  bombBtn.classList.add('hidden'); hud.root.classList.add('hidden');
  const mm = Math.floor(g.t / 60), ss = Math.floor(g.t % 60);
  screen.innerHTML = `
    <div class="scrim">
      <div class="panel results">
        <h2>${g.mode === 'blitz' ? 'TIME UP' : 'GAME OVER'}</h2>
        <div class="final" style="font-size:min(64px, 9vmin, ${Math.floor(360 / (fmt(g.score).length * 0.8))}px)">${fmt(g.score)}</div>
        ${isBest ? '<div class="newbest">NEW BEST</div>' : `<div class="prev">BEST ${fmt(save.best[g.mode])}</div>`}
        <div class="stats">
          <div><b>${g.mode === 'blitz' ? g.deaths : g.wave}</b><span>${g.mode === 'blitz' ? 'deaths' : 'wave'}</span></div>
          <div><b>${mm}:${String(ss).padStart(2, '0')}</b><span>time</span></div>
          <div><b>${fmt(g.kills)}</b><span>kills</span></div>
          <div><b>x${g.maxMult}</b><span>multi</span></div>
        </div>
        <button class="btn primary big" id="retryBtn"><span class="lbl">RETRY</span><small>SPACE / ENTER / R</small></button>
        <div class="row2"><button class="btn" id="otherBtn"><span class="lbl">${g.mode === 'blitz' ? 'SURGE' : 'BLITZ 3:00'}</span></button><button class="btn" id="menuBtn"><span class="lbl">MENU</span></button></div>
      </div>
    </div>`;
  $('#retryBtn').addEventListener('click', () => start(g.mode));
  $('#otherBtn').addEventListener('click', () => start(g.mode === 'blitz' ? 'surge' : 'blitz'));
  $('#menuBtn').addEventListener('click', () => { game = null; showTitle(); });
  $('#retryBtn').focus({ preventScroll: true });
}

// ------------------------------------------------------------ input glue
function unlock() { audio.unlock(); }
addEventListener('pointerdown', unlock, { capture: true });
input.onTouchStart = () => { if (state === 'title' && !$('.how.touch')) { /* title already adapts on next show */ } };
input.onBomb = () => { if (state === 'play' && !paused && game) game.inp.bomb = true; };
bombBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); e.preventDefault(); unlock(); input.onBomb(); });
$('#pauseBtn').addEventListener('click', (e) => { e.stopPropagation(); pause(); });
input.onKey = (code) => {
  unlock();
  if (code === 'KeyM') { toggleMute(); return; }
  if (state === 'title') {
    if (code === 'Enter' || code === 'Space') start('surge');
    else if (code === 'KeyB') start('blitz');
  } else if (state === 'play') {
    if (code === 'Escape' || code === 'KeyP') paused ? resume() : pause();
    else if (code === 'KeyR') start(game.mode);
    else if (code === 'Space' && !paused) game.inp.bomb = true;
    else if (paused && code === 'Enter') resume();
  } else if (state === 'over') {
    if (performance.now() - overShownAt < 450) return;
    if (code === 'Enter' || code === 'Space' || code === 'KeyR') start(game.mode);
    else if (code === 'Escape') { game = null; showTitle(); }
  }
};
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
addEventListener('blur', () => pause());
addEventListener('resize', () => { ren.resize(); });

// ------------------------------------------------------------ loop
const DT = 1 / 60;
let acc = 0, prev = performance.now(), slowFrames = 0, frames = 0;
function handleEvents(g, sound) {
  for (const ev of g.events) {
    if (sound) audio.play(ev);
    if (ev.type === 'banner' && g === game && state === 'play') showBanner(ev.text, ev.sub);
  }
  g.events.length = 0;
}
function simStep() {
  if (state === 'play' && game && !paused) {
    if (!game.bot) input.read(game, ren);
    game.step(DT);
    handleEvents(game, true);
  } else if (state === 'over' && game) {
    game.step(DT); handleEvents(game, false);
  } else if (state === 'title' && demo) {
    demo.step(DT); demo.events.length = 0;
    if (demo.over) makeDemo();
  }
}
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - prev) / 1000; prev = now;
  if (dt > 0.25) dt = 0.25;
  // adaptive quality: drop the bloom blur on slow devices
  frames++; if (dt > 0.03) slowFrames++;
  if (frames >= 120) { if (slowFrames > 50) { if (ren.quality > 0) ren.quality = 0; else if (!ren.lowRes && ren.dpr > 1) { ren.lowRes = true; ren.resize(); } } frames = slowFrames = 0; }
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 5) { simStep(); acc -= DT; n++; }
  if (n === 5) acc = 0;
  const g = state === 'title' ? demo : game;
  if (!g) return;
  ren.follow(g, dt);
  ren.draw(g, state === 'play' && !paused ? input : null, dt);
  if (state === 'play' && game) {
    updateHud();
    audio.setHum(game.holesActive);
    audio.setIntensity(Math.min(1, game.t / 150 + game.mult / 400));
    if (game.over && game.overT > 1.1) showResults();
  } else audio.setHum(0);
}

// ------------------------------------------------------------ test hooks
window.__G = {
  get state() { return state; },
  get paused() { return paused; },
  get game() { return game; },
  get demo() { return demo; },
  get save() { return save; },
  ren, input, audio,
  start, pause, resume, showTitle,
  setBot(on) { botOn = on; if (game) game.bot = on; },
  bomb() { if (game) game.inp.bomb = true; },
  step(n = 1) { for (let i = 0; i < n; i++) simStep(); if (state === 'play' && game && game.over && game.overT > 1.1) showResults(); },
};

if (params.get('play') === '1') start(params.get('mode') === 'blitz' ? 'blitz' : 'surge');
else showTitle();
requestAnimationFrame(frame);
