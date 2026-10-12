// PRISM - loop, input, UI, saving, test hooks.
import { DT } from './world.js';
import { newGame, step, tap, MODES } from './game.js';
import { draw, view, SKINS, drawSkin } from './render.js';
import { audio, unlock, sfx, applyMute } from './audio.js';
import { plan, DEC } from './bot.js';

const $ = (id) => document.getElementById(id);
const cv = $('cv'), ctx = cv.getContext('2d'), skCtx = $('skCv').getContext('2d');
const Q = new URLSearchParams(location.search);
const KEY = 'pd.prism';

// ---------- save
const save = { best: { classic: 0, rush: 0 }, bank: 0, owned: ['classic'], skin: 'classic', muted: false, music: true, mode: 'classic' };
try { Object.assign(save, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* no storage */ }
save.best = Object.assign({ classic: 0, rush: 0 }, save.best);
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
audio.muted = !!save.muted; audio.music = save.music !== false;

// ---------- view
let V = null, dpr = 1;
const touch = matchMedia('(hover: none)').matches || 'ontouchstart' in window;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = innerWidth, h = innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
  V = view(w, h);
}
addEventListener('resize', resize); resize();

// ---------- state
const G = {
  state: 'title', game: null, demo: null, mode: save.mode in MODES ? save.mode : 'classic',
  bot: Q.has('bot'), botNodes: 0, steps: 0, overShown: false,
};
let seedBase = Q.has('seed') ? +Q.get('seed') : (Date.now() & 0xffffff);
const hooks = {
  sfx: (n, a) => sfx(n, a),
  onDeath: (g) => onDeath(g),
  botTick: (g) => { if (G.bot && ++G.steps % DEC === 0) { const p = plan(g, 2500); G.botNodes = p.nodes; if (p.tap) doTap(); } },
};

function newDemo() {
  const d = newGame('classic', (Math.random() * 1e9) | 0, {
    botTick: (g) => { if (++g._s % DEC === 0 && plan(g, 700).tap) tap(g); },   // small budget: never hitch the title
  });
  d._s = 0;
  return d;
}

function startRun(mode = G.mode) {
  G.mode = mode;
  G.game = newGame(mode, seedBase++, hooks);
  G.steps = 0; G.overShown = false;
  G.state = 'play';
  show('hud'); hide('title'); hide('over'); hide('pause');
  $('score').textContent = '0';
  $('hbest').textContent = 'BEST ' + save.best[mode];
}

function doTap() {
  if (G.state !== 'play' || !G.game) return;
  tap(G.game);
}

function onDeath(g) {
  save.bank += g.score;
  g.newBest = g.score > save.best[g.mode];
  if (g.newBest) save.best[g.mode] = g.score;
  persist();
}

function showOver() {
  const g = G.game;
  G.state = 'over'; G.overShown = true;
  $('oscore').textContent = g.score;
  $('obest').textContent = 'BEST ' + save.best[g.mode] + '  ·  ' + MODES[g.mode].name;
  $('newbest').classList.toggle('hidden', !(g.newBest && g.score > 0));
  $('obank').textContent = '★ ' + save.bank + ' banked';
  const nx = SKINS.find((s) => !save.owned.includes(s.id));
  $('onext').textContent = !nx ? '' : save.bank >= nx.cost ? 'NEW BALL READY: ' + nx.name + '!' : (nx.cost - save.bank) + ' ★ TO UNLOCK ' + nx.name;
  show('over'); hide('hud');
  if (g.newBest && g.score > 0) setTimeout(() => sfx('best'), 120);
}

function toTitle() {
  G.state = 'title'; G.game = null;
  hide('over'); hide('pause'); hide('hud'); show('title');
  refreshTitle();
}

function pause(on) {
  if (on && G.state === 'play' && G.game.alive) { G.state = 'pause'; show('pause'); }
  else if (!on && G.state === 'pause') { G.state = 'play'; hide('pause'); last = performance.now(); }
}

function show(id) { $(id).classList.remove('hidden'); }
function hide(id) { $(id).classList.add('hidden'); }

// ---------- title / skins
function refreshTitle() {
  document.querySelectorAll('.mode').forEach((b) => b.classList.toggle('on', b.dataset.mode === G.mode));
  $('tbest').textContent = 'BEST ' + save.best[G.mode];
  $('bankN').textContent = save.bank;
  showSkin();
}
let skinIdx = Math.max(0, SKINS.findIndex((s) => s.id === save.skin));
function showSkin() {
  const sk = SKINS[skinIdx], owned = save.owned.includes(sk.id);
  $('skName').textContent = sk.name;
  const c = $('skCost');
  if (owned) { c.textContent = save.skin === sk.id ? 'EQUIPPED' : 'TAP NAME TO EQUIP'; c.className = ''; }
  else if (save.bank >= sk.cost) { c.textContent = 'UNLOCK ★ ' + sk.cost; c.className = ''; }
  else { c.textContent = '\u{1F512} ★ ' + sk.cost; c.className = 'lock'; }
}
function cycleSkin(d) {
  skinIdx = (skinIdx + d + SKINS.length) % SKINS.length;
  const sk = SKINS[skinIdx];
  if (save.owned.includes(sk.id)) { save.skin = sk.id; persist(); }
  sfx('click'); showSkin();
}
function buySkin() {
  const sk = SKINS[skinIdx];
  if (save.owned.includes(sk.id)) { save.skin = sk.id; }
  else if (save.bank >= sk.cost) { save.bank -= sk.cost; save.owned.push(sk.id); save.skin = sk.id; sfx('buy'); }
  else return;
  persist(); refreshTitle();
}
function previewSkin() { const sk = SKINS[skinIdx]; return save.owned.includes(sk.id) ? sk.id : save.skin; }

// ---------- buttons
const btn = (id, fn) => $(id).addEventListener('click', (e) => { e.stopPropagation(); unlock(); fn(e); });
btn('play', () => { sfx('click'); startRun(G.mode); });
btn('retry', () => startRun(G.mode));
btn('menu', () => { sfx('click'); toTitle(); });
btn('quit', () => { sfx('click'); toTitle(); });
btn('resume', () => pause(false));
btn('pauseBtn', () => pause(true));
btn('skPrev', () => cycleSkin(-1));
btn('skNext', () => cycleSkin(1));
btn('skBox', () => buySkin());
document.querySelectorAll('.mode').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation(); unlock(); G.mode = b.dataset.mode; save.mode = G.mode; persist(); sfx('click'); refreshTitle();
}));
const ICON_SND = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 8.5a5 5 0 0 1 0 7" fill="none" stroke-width="2"/></svg>';
const ICON_MUS = '<svg viewBox="0 0 24 24"><path d="M9 17V6l10-2v11" fill="none" stroke-width="2"/><circle cx="7" cy="17" r="2.5"/><circle cx="17" cy="15" r="2.5"/></svg>';
function refreshIcons() {
  $('snd').innerHTML = ICON_SND; $('mus').innerHTML = ICON_MUS;
  $('snd').classList.toggle('off', audio.muted); $('mus').classList.toggle('off', !audio.music);
}
btn('snd', () => { audio.muted = !audio.muted; save.muted = audio.muted; persist(); applyMute(); refreshIcons(); });
btn('mus', () => { audio.music = !audio.music; save.music = audio.music; persist(); applyMute(); refreshIcons(); });
refreshIcons();

// ---------- input: anywhere on the play field hops
function press() {
  unlock();
  if (G.state === 'play') doTap();
}
cv.addEventListener('pointerdown', (e) => { e.preventDefault(); press(); });
$('hud').addEventListener('pointerdown', (e) => { if (e.target === $('hud') || e.target.id === 'score' || e.target.id === 'hbest') { e.preventDefault(); press(); } });
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.code;
  if (k === 'Space' || k === 'ArrowUp' || k === 'KeyW') {
    e.preventDefault(); unlock();
    if (G.state === 'play') doTap();
    else if (G.state === 'over' || (G.state === 'play' && !G.game.alive)) startRun(G.mode);
    else if (G.state === 'title') startRun(G.mode);
    else if (G.state === 'pause') pause(false);
  } else if (k === 'KeyR' || k === 'Enter') {
    unlock();
    if (G.state === 'over' || G.state === 'play') startRun(G.mode);
    else if (G.state === 'title') startRun(G.mode);
  } else if (k === 'KeyP' || k === 'Escape') {
    if (G.state === 'play') pause(true); else if (G.state === 'pause') pause(false);
  } else if (k === 'KeyM') { audio.muted = !audio.muted; save.muted = audio.muted; persist(); applyMute(); refreshIcons(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- loop
let last = performance.now(), acc = 0, lastScore = -1;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.05) dt = 0.05;
  if (G.state === 'play' || G.state === 'over') {
    acc += dt;
    while (acc >= DT) { step(G.game, DT); acc -= DT; }
    const g = G.game;
    if (!g.alive && g.deadT > 0.7 && !G.overShown) showOver();
    if (g.score !== lastScore) {
      const s = $('score'); s.textContent = g.score;
      if (g.score > 0) { s.classList.remove('pop'); void s.offsetWidth; s.classList.add('pop'); }
      lastScore = g.score;
    }
    sparks(g, save.skin);
    draw(ctx, g, V, { dpr, skin: save.skin, touch });
  } else if (G.state === 'pause') {
    draw(ctx, G.game, V, { dpr, skin: save.skin, touch });
  } else {
    if (!G.demo || !G.demo.alive && G.demo.deadT > 1) G.demo = newDemo();
    acc += dt;
    while (acc >= DT) { step(G.demo, DT); acc -= DT; }
    sparks(G.demo, previewSkin());
    draw(ctx, G.demo, V, { dpr, skin: previewSkin(), demo: true, touch });
    drawSkin(skCtx, SKINS[skinIdx].id, now / 1000, !save.owned.includes(SKINS[skinIdx].id));
  }
}
// render-side skin effects
let lastTaps = 0;
function sparks(g, skin) {
  if (!g.alive || !g.st.started) return;
  if (skin === 'spark' && Math.random() < 0.6) {
    const a = Math.random() * 6.28;
    g.parts.push({ x: 180 + Math.cos(a) * 6, y: g.st.y + 8, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80, life: 0.4, max: 0.4, col: ['#ffe53b', '#ffffff', '#ff2e93'][(Math.random() * 3) | 0], size: 2, g: 0 });
  }
  if (skin === 'pulse' && g.taps !== lastTaps) {
    g.rings.push({ x: 180, y: g.st.y, col: g.st.col, t: 0, max: 0.35, r0: 12, r1: 40 });
  }
  lastTaps = g.taps;
}

refreshTitle();
if (Q.has('play')) { startRun(Q.get('mode') === 'rush' ? 'rush' : 'classic'); }
requestAnimationFrame(frame);

// ---------- test hooks
window.__G = {
  get state() { return G.state; },
  get game() { return G.game; },
  get demo() { return G.demo; },
  get save() { return save; },
  get bot() { return G.bot; }, set bot(v) { G.bot = !!v; },
  get botNodes() { return G.botNodes; },
  start: (mode) => startRun(mode || 'classic'),
  tap: () => doTap(),
  step: (dt = DT) => { if (G.game) step(G.game, dt); },
  plan: () => G.game && plan(G.game),
  title: () => toTitle(),
};
