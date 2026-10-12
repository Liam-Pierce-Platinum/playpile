// Boot, layout, render loop, input (keys + touch), menus, saving, test hooks.
import { Game, RANKS, MISSIONS } from './game.js';
import { drawStatic, drawDynamic } from './render.js';
import { DMD } from './dmd.js';
import * as A from './audio.js';

const FONT = "'Orbitron', 'Segoe UI', system-ui, sans-serif";
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const ui = document.getElementById('ui');
const qs = new URLSearchParams(location.search);

// ---------- save ----------
const KEY = 'pd.pinball';
let save = { best: 0, top: [], bestRank: 0, games: 0, muted: false };
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) save = { ...save, ...s }; } catch (e) { /* storage blocked */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }
A.setMuted(!!save.muted);

// ---------- state ----------
let state = 'title';          // title | play | paused | over
let game = null;
const dmd = new DMD();
let demo = makeDemo();
let lastOver = null, overAt = 0, shownAt = 0;
let botOn = qs.get('bot') === '1';

function makeDemo() {
  const g = new Game({ onOver: () => { demo = makeDemo(); } });
  g.isDemo = true;
  return g;
}

function newGame() {
  game = new Game({
    sfx: (n, a) => A.sfx(n, a),
    onOver: (s) => onOver(s),
  });
  game.say('BALL 1', 'PULL THE PLUNGER', 1.6, 'big');
}

function start() {
  A.initAudio(); A.sfx('start'); A.startMusic();
  newGame();
  setState('play');
}

function onOver(s) {
  lastOver = s; overAt = performance.now();
  save.games++;
  const isBest = s.score > save.best;
  if (isBest) save.best = s.score;
  save.bestRank = Math.max(save.bestRank, s.rank);
  save.top.push({ score: s.score, rank: s.rank, d: Date.now() });
  save.top.sort((a, b) => b.score - a.score); save.top = save.top.slice(0, 5);
  persist();
  s.isBest = isBest;
  setTimeout(() => { if (game && game.phase === 'over') setState('over'); }, 900);
}

// ---------- UI screens ----------
const fmt = (n) => n.toLocaleString('en-US');
const isTouch = matchMedia('(pointer: coarse)').matches;

function setState(s) {
  state = s;
  if (s === 'over') shownAt = performance.now();
  document.body.dataset.state = s;
  A.duck(s !== 'play');
  renderUI();
}

function renderUI() {
  let h = '';
  h += `<div class="hud"><button class="hb" id="bPause" aria-label="Pause">II</button><button class="hb" id="bMute" aria-label="Mute">${A.isMuted() ? 'SOUND OFF' : 'SOUND ON'}</button>${isTouch ? '<button class="hb nudge" id="bNudge">NUDGE</button>' : ''}</div>`;
  if (state === 'title') {
    h += `<div class="screen title"><div class="card">
      <div class="logo"><span>STARLANE</span><small>PINBALL</small></div>
      <button class="big" id="bPlay">PLAY</button>
      <div class="best">HIGH SCORE <b>${fmt(save.best)}</b> &middot; BEST RANK <b>${RANKS[save.bestRank]}</b></div>
      <div class="ctrls">${isTouch
        ? '<div><b>TAP LEFT / RIGHT</b> flippers</div><div><b>HOLD RIGHT</b> pull plunger, let go to launch</div><div><b>NUDGE</b> button bumps the table</div>'
        : '<div><b>Z</b> / <b>M</b> &nbsp;or&nbsp; <b>&larr;</b> / <b>&rarr;</b> flippers</div><div><b>SPACE</b> hold to pull, release to launch</div><div><b>X</b> <b>.</b> <b>&uarr;</b> nudge &middot; <b>P</b> pause &middot; <b>S</b> sound</div>'}</div>
      <div class="rot">TIP: TURN YOUR PHONE UPRIGHT FOR A BIGGER TABLE</div>
    </div></div>`;
  } else if (state === 'paused') {
    h += `<div class="screen"><div class="card"><h2>PAUSED</h2>
      <button class="big" id="bResume">RESUME</button>
      <div class="row"><button class="mid" id="bRestart">RESTART</button><button class="mid" id="bMenu">MENU</button></div></div></div>`;
  } else if (state === 'over' && lastOver) {
    const s = lastOver;
    h += `<div class="screen"><div class="card over">
      <h2>GAME OVER</h2>
      ${s.isBest ? '<div class="newbest">NEW HIGH SCORE!</div>' : ''}
      <div class="score">${fmt(s.score)}</div>
      <div class="stats"><div><span>RANK</span><b>${s.rankName}</b></div><div><span>MISSIONS</span><b>${s.missions}</b></div><div><span>JACKPOTS</span><b>${s.jackpots}</b></div><div><span>RAMPS</span><b>${s.stats.ramps}</b></div></div>
      <ol class="top">${save.top.map((t) => `<li><span>${fmt(t.score)}</span><em>${RANKS[t.rank]}</em></li>`).join('')}</ol>
      <button class="big" id="bAgain">PLAY AGAIN</button>
      <div class="row"><button class="mid" id="bMenu">MENU</button></div>
      <div class="hint">${isTouch ? 'tap PLAY AGAIN' : 'SPACE / ENTER to play again'}</div>
    </div></div>`;
  }
  ui.innerHTML = h;
  const on = (id, fn) => { const el = document.getElementById(id); if (el) el.addEventListener('click', (e) => { e.stopPropagation(); A.initAudio(); A.sfx('ui'); fn(); }); };
  on('bPlay', start);
  on('bAgain', start);
  on('bResume', () => setState('play'));
  on('bRestart', start);
  on('bMenu', () => { game = null; setState('title'); });
  on('bPause', () => { if (state === 'play') setState('paused'); else if (state === 'paused') setState('play'); });
  on('bMute', toggleMute);
  on('bNudge', () => game && state === 'play' && game.nudge('u'));
  for (const b of ui.querySelectorAll('button')) b.addEventListener('pointerdown', (e) => e.stopPropagation());
}
function toggleMute() {
  A.initAudio();
  A.setMuted(!A.isMuted()); save.muted = A.isMuted(); persist();
  const b = document.getElementById('bMute'); if (b) b.textContent = A.isMuted() ? 'SOUND OFF' : 'SOUND ON';
}

// ---------- input ----------
const keys = new Set();
const LEFT = ['KeyZ', 'ShiftLeft', 'ArrowLeft'], RIGHT = ['KeyM', 'Slash', 'ShiftRight', 'ArrowRight'], PLUNGE = ['Space', 'ArrowDown', 'Enter', 'NumpadEnter'];
const touches = new Map();
addEventListener('keydown', (e) => {
  if ([...LEFT, ...RIGHT, ...PLUNGE, 'ArrowUp', 'KeyX', 'Period'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  A.initAudio();
  if (state === 'title' && (e.code === 'Space' || e.code === 'Enter')) { start(); keys.delete(e.code); return; }
  if (state === 'over' && (e.code === 'Space' || e.code === 'Enter') && performance.now() - shownAt > 350) { start(); keys.delete(e.code); return; }
  if (e.code === 'KeyS') toggleMute();
  if (e.code === 'KeyP' || e.code === 'Escape') { if (state === 'play') setState('paused'); else if (state === 'paused') setState('play'); }
  if (state === 'paused' && (e.code === 'Space' || e.code === 'Enter')) { setState('play'); keys.delete(e.code); return; }
  if (state === 'play' && game) {
    if (e.code === 'KeyX') game.nudge('l');
    if (e.code === 'Period') game.nudge('r');
    if (e.code === 'ArrowUp') game.nudge('u');
  }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); touches.clear(); if (state === 'play') setState('paused'); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') setState('paused'); });
cv.addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('pointerdown', (e) => {
  if (e.target.closest && e.target.closest('button')) return;
  A.initAudio();
  if (state !== 'play') return;
  touches.set(e.pointerId, e.clientX < innerWidth / 2 ? 'l' : 'r');
});
const lift = (e) => touches.delete(e.pointerId);
addEventListener('pointerup', lift); addEventListener('pointercancel', lift);
document.addEventListener('touchmove', (e) => { if (state === 'play') e.preventDefault(); }, { passive: false });

function readInput() {
  const tv = [...touches.values()];
  const any = (list) => list.some((k) => keys.has(k));
  return { l: any(LEFT) || tv.includes('l'), r: any(RIGHT) || tv.includes('r'), plunge: any(PLUNGE) || tv.includes('r') };
}

// ---------- layout ----------
let L = null, staticLayer = null;
function layout() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const w = innerWidth, h0 = innerHeight;
  cv.width = Math.round(w * dpr); cv.height = Math.round(h0 * dpr);
  cv.style.width = w + "px"; cv.style.height = h0 + "px";
  const land = w / h0 > 0.95;
  const top = land ? 0 : 50;            // portrait: keep the HUD buttons off the DMD
  const h = h0 - top;
  const LW = land ? 1140 : 600, LH = land ? 1120 : 1278;
  const s = Math.min(w / LW, h / LH) * 0.985;
  const ox = (w - LW * s) / 2, oy = top + (h - LH * s) / 2;
  L = land
    ? { land, s, dpr, tx: ox, ty: oy, dx: ox + 620 * s, dy: oy + 40 * s, dw: 520 * s, dh: 130 * s, px: ox + 620 * s, py: oy + 200 * s }
    : { land, s, dpr, tx: ox, ty: oy + 158 * s, dx: ox, dy: oy, dw: 600 * s, dh: 150 * s };
  staticLayer = document.createElement('canvas');
  staticLayer.width = Math.ceil(600 * s * dpr); staticLayer.height = Math.ceil(1120 * s * dpr);
  const sc = staticLayer.getContext('2d');
  sc.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  drawStatic(sc);
}
addEventListener('resize', layout);
layout();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);

// ---------- side panel (landscape) ----------
function drawPanel(g, t) {
  const s = L.s, x = L.px, y = L.py;
  ctx.save();
  ctx.translate(x, y); ctx.scale(s, s);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 16px ${FONT}`;
  ctx.fillText('HIGH SCORE', 0, 0);
  ctx.fillStyle = '#ffd34a'; ctx.font = `900 30px ${FONT}`;
  ctx.fillText(fmt(Math.max(save.best, g ? g.score : 0)), 0, 24);
  if (g && !g.isDemo) {
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 16px ${FONT}`;
    ctx.fillText('RANK', 0, 84);
    ctx.fillStyle = '#ff5ad2'; ctx.font = `900 26px ${FONT}`; ctx.fillText(RANKS[g.rank], 0, 106);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 16px ${FONT}`; ctx.fillText('MISSIONS', 0, 156);
    MISSIONS.forEach((m, i) => {
      const cur = i === g.mIdx, done = i < g.mIdx || g.mLap > 0;
      ctx.font = `${cur ? 900 : 600} ${cur ? 20 : 16}px ${FONT}`;
      ctx.fillStyle = cur ? '#7dfcff' : done ? 'rgba(157,255,106,0.8)' : 'rgba(255,255,255,0.35)';
      ctx.fillText((cur ? '> ' : done ? '+ ' : '  ') + m.name + (cur ? `  ${g.mProg}/${g.goal()}` : ''), 0, 182 + i * 28);
    });
    // ball lamps
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 16px ${FONT}`; ctx.fillText('BALLS', 0, 420);
    for (let i = 0; i < g.maxBalls; i++) {
      ctx.beginPath(); ctx.arc(14 + i * 34, 456, 12, 0, Math.PI * 2);
      ctx.fillStyle = i >= g.ballNum - 1 ? '#dfe6ff' : 'rgba(255,255,255,0.12)'; ctx.fill();
    }
    if (g.extraBalls) { ctx.fillStyle = '#ff9b3d'; ctx.font = `800 16px ${FONT}`; ctx.fillText('+' + g.extraBalls + ' EXTRA', 110, 446); }
    // tilt meter
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = `700 16px ${FONT}`; ctx.fillText('TILT', 0, 494);
    ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fillRect(60, 494, 220, 14);
    ctx.fillStyle = g.tilt > 1.8 ? '#ff3030' : '#ffd34a'; ctx.fillRect(60, 494, 220 * Math.min(1, g.tilt / 3), 14);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.font = `600 14px ${FONT}`;
  const hints = isTouch ? ['TAP LEFT / RIGHT: FLIPPERS', 'HOLD RIGHT: PLUNGER'] : ['Z / M  or  ARROWS: FLIPPERS', 'SPACE: PLUNGER', 'X  .  UP: NUDGE    P: PAUSE'];
  hints.forEach((h, i) => ctx.fillText(h, 0, 540 + i * 22));
  ctx.restore();
}

// ---------- render loop ----------
let last = performance.now(), T0 = last;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = Math.max(0, (now - T0) / 1000);
  const g = state === 'title' ? demo : game || demo;
  if (state === 'title') { demo.input = demo.botIntent(); demo.update(dt); }
  else if (state === 'play' && game) {
    if (botOn) { // the test bot decides every 1/120 s so low frame rates do not blind it
      const n = Math.max(1, Math.round(dt * 120));
      for (let i = 0; i < n; i++) { game.input = game.botIntent(); game.update(dt / n); }
    } else { game.input = readInput(); game.update(dt); }
  } else if (state === 'over' && game) game.update(dt);
  draw(g, t);
  requestAnimationFrame(frame);
}

function draw(g, t) {
  const { s, dpr } = L;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  // table with shake/nudge offset
  const sh = g.fx.shake, jx = (Math.random() - 0.5) * sh + g.fx.nudgeX, jy = (Math.random() - 0.5) * sh + g.fx.nudgeY;
  const tx = (L.tx + jx * s) * dpr, ty = (L.ty + jy * s) * dpr;
  ctx.drawImage(staticLayer, tx, ty);
  ctx.setTransform(s * dpr, 0, 0, s * dpr, tx, ty);
  drawDynamic(ctx, g, t);
  if (g.fx.flash > 0) {
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g.fx.flash * 0.35;
    ctx.fillStyle = g.fx.flashCol; ctx.fillRect(0, 0, 600, 1120);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  // DMD
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bez = 6 * s;
  ctx.fillStyle = '#000'; ctx.fillRect(L.dx - bez, L.dy - bez, L.dw + bez * 2, L.dh + bez * 2);
  ctx.strokeStyle = '#3ff0ff55'; ctx.lineWidth = 2; ctx.strokeRect(L.dx - bez, L.dy - bez, L.dw + bez * 2, L.dh + bez * 2);
  dmd.compose(g, t, state === 'title' ? { best: save.best, bestRank: RANKS[save.bestRank] } : null);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  dmd.paint(ctx, L.dx * dpr, L.dy * dpr, L.dw * dpr, L.dh * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (L.land) drawPanel(state === 'title' ? null : g, t);
  // touch plunger hint
  // first-ball flipper hint: fades once the player has flipped a few times
  if (state === 'play' && game && game.ballNum === 1 && game.stats.flips < 4 && game.stats.launches > 0 && save.games < 3) {
    ctx.setTransform(s * dpr, 0, 0, s * dpr, L.tx * dpr, L.ty * dpr);
    ctx.font = `900 17px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 6);
    ctx.lineWidth = 4; ctx.strokeStyle = '#12082c';
    const lt = isTouch ? 'TAP LEFT' : 'Z / ←', rt = isTouch ? 'TAP RIGHT' : 'M / →';
    ctx.strokeText(lt, 196, 1050); ctx.fillStyle = '#7dfcff'; ctx.fillText(lt, 196, 1050);
    ctx.strokeText(rt, 364, 1050); ctx.fillText(rt, 364, 1050);
    ctx.globalAlpha = 1;
  }
  if (state === 'play' && game) {
    const lb = game.laneBall();
    if (lb && !lb.launched && lb.y > 1000 && game.phase === 'play') {
      ctx.setTransform(s * dpr, 0, 0, s * dpr, L.tx * dpr, L.ty * dpr);
      ctx.fillStyle = 'rgba(8,4,24,0.78)'; ctx.beginPath(); ctx.roundRect(150, 470, 260, 76, 18); ctx.fill();
      ctx.strokeStyle = 'rgba(255,211,74,0.6)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = `900 22px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 6);
      ctx.fillStyle = '#ffd34a'; ctx.fillText(isTouch ? 'HOLD RIGHT SIDE' : 'HOLD SPACE', 280, 494);
      ctx.font = `700 16px ${FONT}`; ctx.fillStyle = '#fff'; ctx.fillText(game.plunger > 0 ? 'let go in the green zone' : 'let go to launch', 280, 524);
      ctx.globalAlpha = 1;
    }
  }
}

// ---------- test hooks ----------
window.__G = {
  get state() { return state; },
  get game() { return game; },
  get demo() { return demo; },
  get save() { return save; },
  start,
  setBot(on) { botOn = on; },
  step(n = 1) { for (let i = 0; i < n; i++) { if (game) { if (botOn) game.input = game.botIntent(); game.update(1 / 60); } } },
  pause() { if (state === 'play') setState('paused'); },
  resume() { if (state === 'paused') setState('play'); },
  layout: () => L,
};

if (qs.get('play') === '1') start(); else setState('title');
requestAnimationFrame(frame);
