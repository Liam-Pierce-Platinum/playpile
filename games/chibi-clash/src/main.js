// CHIBI CLASH entry: canvas loop, menu backdrop, fight start/end + rewards, test hooks (window.__G).
import { ZONES, SPECIES_BY_ID, STARTERS } from './data.js';
import { load, store, wipe } from './save.js';
import { newMon, lvlOf, giveXp, pull } from './mons.js';
import { Battle, isEndlessBossWave } from './battle.js';
import { makeArena, drawObstacle } from './arena.js';
import { sprite } from './sprites.js';
import { initInput, input, endFrame, GW, GH } from './input.js';
import { loadFont } from './font.js';
import { initAudio, setMuted, isMuted, sfx } from './audio.js';
import * as UI from './ui.js';

const params = new URLSearchParams(location.search);
if (params.has('reset')) wipe();
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
let save = load();
setMuted(!!save.mute);
let state = 'menu', battle = null, paused = false;

function resize() {
  const w = innerWidth, h = innerHeight;
  let s = Math.min(w / GW, h / GH);
  if (s >= 2) s = Math.floor(s * 2) / 2; // keep pixels even where we can
  canvas.style.width = Math.floor(GW * s) + 'px'; canvas.style.height = Math.floor(GH * s) + 'px';
}
addEventListener('resize', resize); resize();
initInput(canvas);

const api = {
  get save() { return save; },
  persist() { store(save); },
  activeMon() { return save.mons.find((m) => m.uid === save.active) || save.mons[0]; },
  toMenu() { state = 'menu'; battle = null; paused = false; },
  startFight,
};
UI.initUI(api);

function startFight(zi, stage) {
  const m = api.activeMon(); if (!m) { UI.showStarter(); return; }
  UI.hideUI(); paused = false;
  battle = new Battle({ zi, stage, mon: { uid: m.uid, sp: m.sp, stage: m.stage, lvl: lvlOf(m), eq: m.eq }, onEnd: (r) => endFight(zi, stage, m, r),
    onSeen: (id) => { if (!save.seen.includes(id)) save.seen.push(id); } });
  store(save);
  state = 'battle';
}
function endFight(zi, stage, m, r) {
  if (ZONES[zi].endless) return endEndless(zi, stage, m, r);
  const boss = stage === 3;
  const coins = r.win ? Math.round((25 + 15 * zi + 8 * stage) * (boss ? 2.5 : 1)) : 8;
  const xp = r.win ? Math.round((45 + 20 * zi + 10 * stage) * (boss ? 2 : 1)) : 15;
  let bonus = 0, unlocked = false;
  if (r.win && save.zones[zi] < stage) {
    save.zones[zi] = stage; bonus = boss ? 200 : 30;
    if (boss && zi < ZONES.length - 1) unlocked = true; // zone 5 boss opens the endless arena
  }
  if (r.win) save.wins++;
  save.coins += coins + bonus;
  const levels = giveXp(m, xp);
  store(save);
  if (levels > 0) setTimeout(() => sfx.level(), 500);
  sfx.coin();
  UI.showResults({ win: r.win, time: r.time, zi, stage, uid: m.uid, coins, xp, bonus, levels, unlocked });
}

// Endless arena: wave rewards grow with the wave; the best wave reached is kept.
function endEndless(zi, wave, m, r) {
  const boss = isEndlessBossWave(wave);
  const coins = r.win ? Math.round((60 + 6 * wave) * (boss ? 2.5 : 1)) : 8 + 2 * wave;
  const xp = r.win ? Math.round((110 + 8 * wave) * (boss ? 2 : 1)) : 15 + 3 * wave;
  let bonus = 0;
  if (r.win && wave + 1 > save.endless) { save.endless = wave + 1; bonus = boss ? 150 : 0; }
  if (r.win) save.wins++;
  save.coins += coins + bonus;
  const levels = giveXp(m, xp);
  store(save);
  if (levels > 0) setTimeout(() => sfx.level(), 500);
  sfx.coin();
  UI.showResults({ win: r.win, time: r.time, zi, stage: wave, uid: m.uid, coins, xp, bonus, levels, unlocked: false, endless: true });
}

// ---- menu backdrop: your monsters wander a meadow behind the menus
const menuArena = makeArena(0, 3);
let walkers = [];
function syncWalkers() {
  const ids = save.mons.length ? save.mons.slice(0, 8).map((m) => [m.sp, m.stage]) : STARTERS.map((s) => [s, 0]);
  if (walkers.length === ids.length && walkers.every((w, i) => w.sp === ids[i][0] && w.stage === ids[i][1])) return;
  walkers = ids.map(([sp, stage], i) => ({ sp, stage, x: 60 + ((i * 97) % 360), y: 80 + ((i * 53) % 160), tx: 0, ty: 0, t: Math.random() * 3, wait: Math.random() * 2, flip: false }));
}
function drawMenu(dt) {
  syncWalkers();
  ctx.drawImage(menuArena.bg, 0, 0);
  for (const w of walkers) {
    w.t += dt;
    if (w.wait > 0) { w.wait -= dt; if (w.wait <= 0) { w.tx = 40 + Math.random() * 400; w.ty = 60 + Math.random() * 190; } continue; }
    const dx = w.tx - w.x, dy = w.ty - w.y, d = Math.hypot(dx, dy);
    if (d < 3) { w.wait = 1 + Math.random() * 3; continue; }
    w.x += (dx / d) * 30 * dt; w.y += (dy / d) * 30 * dt; w.flip = dx < 0;
  }
  const list = [...menuArena.obs.map((o) => ({ y: o.y, o })), ...walkers.map((w) => ({ y: w.y, w }))].sort((a, b) => a.y - b.y);
  for (const it of list) {
    if (it.o) { drawObstacle(ctx, it.o); continue; }
    const w = it.w, moving = w.wait <= 0;
    const s = sprite(w.sp, w.stage, moving ? 'walk' + (Math.floor(w.t * 8) % 4) : (Math.floor(w.t * 2.4) % 2 ? 'idle1' : 'idle0'));
    ctx.fillStyle = 'rgba(20,10,30,0.3)'; ctx.fillRect(Math.round(w.x - 7), Math.round(w.y), 14, 3);
    const dx = Math.round(w.flip ? w.x - s.w + s.ax : w.x - s.ax), dy = Math.round(w.y - s.footY);
    if (w.flip) { ctx.save(); ctx.translate(dx + s.w, dy); ctx.scale(-1, 1); ctx.drawImage(s.cv, 0, 0); ctx.restore(); } else ctx.drawImage(s.cv, dx, dy);
  }
}

// ---- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000); last = now;
  if (state === 'battle' && battle) {
    if (!paused) battle.update(dt);
    battle.render(ctx);
  } else drawMenu(dt);
  if (input.pressed.has('KeyM')) toggleMute();
  if (state === 'battle' && battle && !battle.over && (input.pressed.has('Escape') || input.pressed.has('KeyP'))) togglePause();
  endFrame();
  requestAnimationFrame(frame);
}
function togglePause() {
  paused = !paused;
  if (paused) UI.showPause(() => togglePause(), () => { paused = false; battle = null; state = 'menu'; UI.showHub(); });
  else UI.hideUI();
}
function toggleMute() {
  setMuted(!isMuted()); save.mute = isMuted(); store(save);
  document.getElementById('mute').textContent = isMuted() ? 'SOUND OFF' : 'SOUND ON';
}
const muteBtn = document.getElementById('mute');
muteBtn.textContent = isMuted() ? 'SOUND OFF' : 'SOUND ON';
muteBtn.addEventListener('click', (e) => { e.stopPropagation(); initAudio(); toggleMute(); });
document.getElementById('pausebtn').addEventListener('click', (e) => { e.stopPropagation(); if (state === 'battle' && battle && !battle.over) togglePause(); });
const unlock = () => initAudio();
addEventListener('pointerdown', unlock); addEventListener('keydown', unlock); addEventListener('touchstart', unlock);
addEventListener('visibilitychange', () => { if (document.hidden && state === 'battle' && !paused && battle && !battle.over) togglePause(); });

// ---- test hooks
window.__G = {
  get state() { return state; }, get battle() { return battle; }, get save() { return save; }, get paused() { return paused; },
  api, UI, startFight, input,
  pull: (n) => { const r = pull(save, n); store(save); return r; },
  giveCoins: (n) => { save.coins += n; store(save); },
  newMon: (sp) => { const m = newMon(save, sp); store(save); return m; },
  winNow: () => { if (battle) for (const f of battle.foes) if (!f.dead) battle.kill(f); },
  step: (sec, dt = 1 / 60) => { for (let t = 0; t < sec && battle; t += dt) { battle.update(dt); endFrame(); } },
  species: SPECIES_BY_ID,
};

await loadFont();
requestAnimationFrame(frame);
if (params.has('play')) {
  if (!save.mons.length) { newMon(save, 'pipkin'); store(save); }
  startFight(0, Math.max(0, Math.min(3, save.zones[0] + 1)));
} else UI.showTitle();
