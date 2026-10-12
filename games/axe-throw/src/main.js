// Boot, layout, render loop, input and menus.
import { Game, EMBED } from './game.js';
import { iconAxe, drawAxe, drawLog, drawApple, paintBackground, label, coinIcon, INK, FONT } from './draw.js';
import { SKINS, skinById } from './skins.js';
import { BOSSES } from './stages.js';
import { save, load, persist } from './save.js';
import { initAudio, sfx, setMuted, isMuted } from './audio.js';

const TAU = Math.PI * 2;
const cv = document.getElementById('c');
const c = cv.getContext('2d');
const ui = document.getElementById('ui');
const params = new URLSearchParams(location.search);
const TOUCH = (() => { try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();

load();
setMuted(!!save.muted);

// ---------------------------------------------------------------- layout
// The playfield is a 540-wide design space; its height stretches between 760 and 1100.
const L = { w: 540, h: 960, cx: 270, cy: 320, axeY: 750 };
let W = 0, H = 0, dpr = 1, S = 1, OX = 0, OY = 0;
const bg = document.createElement('canvas');
function resize() {
  W = innerWidth; H = innerHeight; dpr = Math.min(devicePixelRatio || 1, 2);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  L.h = Math.max(840, Math.min(1100, (H / W) * 540));
  S = Math.min(W / 540, H / L.h);
  OX = (W - 540 * S) / 2; OY = (H - L.h * S) / 2;
  L.cy = Math.max(L.h * 0.355, 328); L.axeY = L.h - 215; // 328 floor keeps rim apples clear of the HUD dots on wide screens
  bg.width = cv.width; bg.height = cv.height;
  const b = bg.getContext('2d'); b.setTransform(dpr, 0, 0, dpr, 0, 0);
  paintBackground(b, W, H, OX + L.cx * S, OY + L.cy * S, 125 * S);
}
addEventListener('resize', resize);
resize();

// ---------------------------------------------------------------- game + fx hooks
let screen = 'title', paused = false, committed = 0, overAt = 0, runBestBefore = 0;
const fx = {
  sfx: (n, a) => { try { sfx[n](a); } catch (e) { /* audio off */ } },
  boss: () => { try { sfx.boss(); } catch (e) { /* */ } },
  vibrate: (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* */ } },
  stage: (g) => { if (g.stageN > save.best) save.best = g.stageN; persist(); },
  cleared: (g, boss) => {
    if (boss) {
      const id = g.st.bossDef.id;
      if (!save.bosses.includes(id)) {
        save.bosses.push(id);
        if (!save.owned.includes(id)) save.owned.push(id);
        setTimeout(() => { toast(`NEW AXE: ${skinById(id).name}!`); fx.sfx('unlock'); }, 300);
      }
    }
    commitCoins(); persist();
  },
  over: (g) => {
    commitCoins();
    save.runs++;

    if (g.stageN > save.best) save.best = g.stageN;
    const newBest = g.score > save.bestScore;
    if (newBest) save.bestScore = g.score;
    persist();
    showOver(newBest);
  },
};
const g = new Game(L, fx);
function commitCoins() { if (g.coinsRun > committed) { save.coins += g.coinsRun - committed; committed = g.coinsRun; } }

function startRun() {
  initAudio();
  committed = 0; paused = false; runBestBefore = save.best; // "FURTHEST YET" compares against the best from before this run
  g.newRun(save.skin);
  const st = parseInt(params.get('stage'), 10);
  if (st > 1) { g.stageN = st; g.loadStage(); }
  show('play');
}

// ---------------------------------------------------------------- render
const leaves = Array.from({ length: 10 }, (_, i) => ({ x: Math.random(), y: Math.random(), s: 0.6 + Math.random() * 0.8, p: Math.random() * TAU, col: ['#e8622c', '#f2a03a', '#c8401f'][i % 3] }));
function drawLeaves(dt) {
  for (const l of leaves) {
    l.y += dt * 0.04 * l.s; l.p += dt * 2; l.x += Math.sin(l.p) * dt * 0.02;
    if (l.y > 1.05) { l.y = -0.05; l.x = Math.random(); }
    const x = l.x * W, y = l.y * H;
    c.save(); c.translate(x, y); c.rotate(Math.sin(l.p) * 0.8); c.scale(l.s * S * 1.4, l.s * S * 1.4);
    c.beginPath(); c.ellipse(0, 0, 7, 3.5, 0, 0, TAU); c.fillStyle = l.col; c.fill();
    c.strokeStyle = 'rgba(42,22,8,0.5)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.stroke();
    c.restore();
  }
}

function drawScene() {
  const st = g.st; if (!st) return;
  const R = g.R, cx = L.cx, t = g.time;
  const attract = g.state === 'attract';
  const yOff = attract ? L.h * 0.1 : 0;
  const ly = g.logY() + yOff;
  c.save();
  if (attract) { c.translate(cx, ly); c.scale(0.8, 0.8); c.translate(-cx, -ly); }
  if (g.state !== 'clear') {
    // drop shadow
    c.beginPath(); c.arc(cx + 8, ly + 12, R + 2, 0, TAU); c.fillStyle = 'rgba(80,25,5,0.22)'; c.fill();
    for (const e of g.axes) {
      const wa = e.a + g.rot + e.wob * 0.09 * Math.sin(t * 45);
      drawAxe(c, e.skin, cx + Math.cos(wa) * (R - EMBED), ly + Math.sin(wa) * (R - EMBED), wa - Math.PI / 2);
    }
    c.save(); c.translate(cx, ly);
    drawLog(c, st.look, R, g.rot, t, g.need ? g.hits / g.need : 0, g.flash);
    c.restore();
    for (const p of g.apples) {
      const wa = p.a + g.rot;
      drawApple(c, cx + Math.cos(wa) * (R + 13), ly + Math.sin(wa) * (R + 13), wa + Math.PI / 2, 15);
    }
  }
  c.restore();
  for (const p of g.pieces) {
    c.save(); c.translate(cx + p.x, g.burstY + p.y); c.rotate(p.rot);
    c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, R + 8, p.a0 + g.burstRot, p.a1 + g.burstRot); c.closePath();
    c.save(); c.clip(); drawLog(c, st.look, R, g.burstRot, t, 1, 0); c.restore();
    c.beginPath(); c.moveTo(Math.cos(p.a0 + g.burstRot) * (R - 1), Math.sin(p.a0 + g.burstRot) * (R - 1)); c.lineTo(0, 0);
    c.lineTo(Math.cos(p.a1 + g.burstRot) * (R - 1), Math.sin(p.a1 + g.burstRot) * (R - 1));
    c.lineWidth = 3.5; c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke();
    c.restore();
  }
  for (const d of g.debris) {
    if (d.kind === 'axe') drawAxe(c, d.skin, d.x, d.y, d.rot);
    else drawApple(c, d.x, d.y, d.rot, 15, d.half);
  }
  for (const f of g.flying) {
    const gr = c.createLinearGradient(0, f.y + 150, 0, f.y + 330);
    gr.addColorStop(0, `rgba(255,250,235,${0.55 * f.trail})`); gr.addColorStop(1, 'rgba(255,250,235,0)');
    c.fillStyle = gr; c.fillRect(cx - 5, f.y + 150, 10, 180);
    drawAxe(c, g.skin, cx, f.y, 0);
  }
  if (g.state === 'play' && g.thrown < g.need) drawAxe(c, g.skin, cx, g.readyY(), 0, 1, Math.min(1, g.ready * 1.5));
  if (g.failAxe) { const f = g.failAxe; drawAxe(c, f.skin, f.x, f.y, f.rot); }
  // particles
  for (const p of g.parts) {
    const a = Math.min(1, p.life / (p.max * 0.5));
    c.globalAlpha = a;
    if (p.kind === 'chip' || p.kind === 'confetti') {
      c.save(); c.translate(p.x, p.y); c.rotate(p.rot); c.fillStyle = p.color;
      const w = p.size, h = p.kind === 'chip' ? p.size * 0.5 : p.size * 0.6;
      c.fillRect(-w / 2, -h / 2, w, h);
      if (p.kind === 'chip') { c.lineWidth = 1.5; c.strokeStyle = INK; c.strokeRect(-w / 2, -h / 2, w, h); }
      c.restore();
    } else if (p.kind === 'drop' || p.kind === 'dust') {
      c.beginPath(); c.arc(p.x, p.y, p.kind === 'dust' ? p.size * (1.6 - a * 0.6) : p.size, 0, TAU);
      c.fillStyle = p.kind === 'dust' ? 'rgba(255,240,215,0.6)' : p.color; c.fill();
    } else if (p.kind === 'spark') {
      const sp = Math.hypot(p.vx, p.vy) || 1;
      c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x - (p.vx / sp) * p.size, p.y - (p.vy / sp) * p.size);
      c.strokeStyle = p.color; c.lineWidth = 3.5; c.lineCap = 'round'; c.stroke();
    } else if (p.kind === 'ring') {
      const k = 1 - p.life / p.max;
      c.beginPath(); c.ellipse(p.x, p.y, 20 + k * 60, 8 + k * 18, 0, 0, TAU);
      c.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`; c.lineWidth = 4; c.stroke();
    }
    c.globalAlpha = 1;
  }
  for (const tx of g.texts) {
    const k = 1 - tx.life / tx.max;
    const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
    c.globalAlpha = Math.min(1, tx.life / (tx.max * 0.35));
    c.save(); c.translate(tx.x, tx.y); c.scale(pop, pop);
    if (tx.coin) { coinIcon(c, -30, 0, 13); label(c, tx.txt, 8, 2, tx.size, tx.color, 'center'); }
    else label(c, tx.txt, 0, 0, tx.size, tx.color, 'center', tx.big ? '#7a2f10' : INK);
    c.restore();
    c.globalAlpha = 1;
  }
}

function drawHUD() {
  if (screen !== 'play' && screen !== 'pause') return;
  const st = g.st; if (!st) return;
  label(c, String(g.score), 26, 50, 50, '#fff8ea', 'left');
  // coins
  coinIcon(c, 512, 48, 14);
  label(c, String(save.coins), 490, 50, 30, '#ffe14d', 'right');
  // stage title + progress dots
  if (st.boss) label(c, st.bossDef.name, 270, 104, 28, '#ffd23a', 'center', '#7a1d10');
  else label(c, `STAGE ${st.n}`, 270, 104, 26, '#fff8ea');
  const pulse = 1 + 0.15 * Math.sin(g.time * 6);
  for (let i = 0; i < 5; i++) {
    const x = 270 + (i - 2) * 30, y = 136, isBoss = i === 4;
    const done = i < st.idx, cur = i === st.idx;
    c.save(); c.translate(x, y); if (cur) c.scale(pulse, pulse);
    c.beginPath();
    if (isBoss) { c.moveTo(0, -11); c.lineTo(11, 0); c.lineTo(0, 11); c.lineTo(-11, 0); c.closePath(); }
    else c.arc(0, 0, 8, 0, TAU);
    c.fillStyle = done ? '#fff8ea' : cur ? (isBoss ? '#ff5a3c' : '#ffd23a') : (isBoss ? 'rgba(160,40,20,0.55)' : 'rgba(42,22,8,0.35)');
    c.fill(); c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    c.restore();
  }
  // axes left: a column of little axes, used ones dark
  const sp = Math.min(26, (L.h * 0.42) / Math.max(1, g.need));
  for (let i = 0; i < g.need; i++) {
    const used = i < g.thrown;
    const x = 30, y = L.h - 64 - i * sp;
    iconAxe(c, x, y, used);
  }
  // first-stage hint
  if (st.n === 1 && g.thrown === 0 && g.state === 'play') {
    c.globalAlpha = 0.65 + 0.35 * Math.sin(g.time * 5);
    label(c, 'TAP TO THROW', 270, L.h - 30, 24, '#fff8ea');
    c.globalAlpha = 1;
  }
  // boss intro ribbon
  if (st.boss && g.introT > 0) {
    const p = 1 - g.introT / 1.5;
    const span = W / S + 60;
    const xin = p < 0.15 ? (1 - p / 0.15) * -span : p > 0.85 ? ((p - 0.85) / 0.15) * span : 0;
    const y = (L.cy + st.R + L.axeY - 70) / 2; // in the gap between the log and your axe
    c.save(); c.translate(xin, 0);
    const x0 = -OX / S - 20, rw = W / S + 40; // full screen width, not just the playfield
    c.fillStyle = '#8e1f14'; c.fillRect(x0, y - 48, rw, 96);
    c.fillStyle = '#c23a22'; c.fillRect(x0, y - 48, rw, 10);
    c.strokeStyle = INK; c.lineWidth = 4; c.strokeRect(x0, y - 48, rw, 96);
    label(c, 'BOSS FIGHT', 270, y - 18, 22, '#ffd23a');
    label(c, st.bossDef.name, 270, y + 16, 42, '#fff8ea');
    c.restore();
  }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!paused) g.update(dt);
  commitCoins();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.drawImage(bg, 0, 0, W, H);
  drawLeaves(paused ? 0 : dt);
  const sh = g.shake;
  const sx = (Math.random() * 2 - 1) * sh, sy = (Math.random() * 2 - 1) * sh;
  c.setTransform(dpr * S, 0, 0, dpr * S, dpr * (OX + sx * S), dpr * (OY + sy * S));
  drawScene();
  c.setTransform(dpr * S, 0, 0, dpr * S, dpr * OX, dpr * OY);
  drawHUD();
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- UI
const coinHTML = (n) => `<i class="coin"></i><span>${n}</span>`;
function toast(msg) {
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg;
  document.body.appendChild(t); setTimeout(() => t.remove(), 2700);
}
const soundLabel = () => (isMuted() ? 'SOUND OFF' : 'SOUND ON');
const SPEAKER = '<svg viewBox="0 0 24 24" fill="none" stroke="#2a1608" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9h4l5-4v14l-5-4H3z" fill="#2a1608"/><path class="w" d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12"/><path class="x" d="M15 9l6 6M21 9l-6 6"/></svg>';
// keeps whichever sound control is on screen (round icon in play, text button in menus) in sync
function syncMute() {
  const b = ui.querySelector('[data-a=mute]'); if (!b) return;
  if (b.classList.contains('snd')) b.classList.toggle('off', isMuted()); else b.textContent = soundLabel();
}
function toggleMute() { setMuted(!isMuted()); save.muted = isMuted(); persist(); syncMute(); }

function show(name) {
  screen = name;
  ui.innerHTML = '';
  if (name === 'title') {
    g.attract(save.skin);
    ui.innerHTML = `<div class="screen title">
      <div class="coins">${coinHTML(save.coins)}</div>
      <div class="logo"><h1>AXE<span>THROW</span></h1>${save.best ? `<p>Best: stage ${save.best} &middot; score ${save.bestScore}</p>` : ''}</div>
      <div class="bottom">
        <button class="btn play" data-a="play">PLAY</button>
        <div class="row"><button class="btn sm" data-a="shop">AXES</button><button class="btn sm" data-a="mute">${soundLabel()}</button></div>
        <div class="hint">${TOUCH ? 'Tap to throw' : 'Click or Space to throw'} &middot; don't hit an axe</div>
      </div></div>`;
  } else if (name === 'play') {
    ui.innerHTML = `<div class="screen"><div class="hudbtns"><button class="round snd${isMuted() ? ' off' : ''}" data-a="mute" aria-label="Sound on or off">${SPEAKER}</button><button class="round" data-a="pause" aria-label="Pause"><i></i><i></i></button></div></div>`;
  } else if (name === 'pause') {
    ui.innerHTML = `<div class="screen scrim"><div class="panel">
      <h2 class="win" style="color:var(--ink)">PAUSED</h2>
      <button class="btn play" data-a="resume">RESUME</button>
      <div class="row"><button class="btn sm" data-a="restart">RESTART</button><button class="btn sm" data-a="home">HOME</button></div>
      <button class="btn sm wide" data-a="mute">${soundLabel()}</button>
    </div></div>`;
  } else if (name === 'shop') {
    renderShop();
  }
}
function showOver(newBest) {
  screen = 'over'; overAt = performance.now();
  const canCont = !g.continued && save.coins >= 50;
  ui.innerHTML = `<div class="screen scrim"><div class="panel over">
    <h2>CLANG!</h2>
    <div class="bigstage">STAGE<b>${g.stageN}</b></div>
    ${newBest ? '<div class="newbest">NEW BEST SCORE!</div>' : g.stageN > runBestBefore && g.stageN > 1 ? '<div class="newbest">FURTHEST YET!</div>' : ''}
    <div class="stats">
      <div><small>SCORE</small><b>${g.score}</b></div>
      <div><small>BEST</small><b>${save.bestScore}</b></div>
      <div><small>COINS</small><b>+${g.coinsRun}</b></div>
    </div>
    <button class="btn play" data-a="retry">RETRY</button>
    ${canCont ? `<button class="btn red wide" data-a="continue">CONTINUE STAGE ${g.stageN}<small><i class="coin"></i> 50</small></button>` : ""}
    <div class="row"><button class="btn sm" data-a="home">HOME</button><button class="btn sm" data-a="shop">AXES</button></div>
  </div></div>`;
}
let shopFrom = 'title';
function renderShop(again) {
  const cards = SKINS.map((sk) => {
    const owned = save.owned.includes(sk.id), eq = save.skin === sk.id;
    let st;
    if (eq) st = 'EQUIPPED';
    else if (owned) st = 'TAP TO EQUIP';
    else if (sk.boss) st = `Beat ${BOSSES.find((b) => b.id === sk.boss).name}`;
    else st = `<i class="coin"></i> ${sk.cost}`;
    const cls = ['card', eq ? 'eq' : '', !owned && sk.boss ? 'locked' : '', !owned && !sk.boss && save.coins < sk.cost ? 'cant' : ''].join(' ');
    return `<div class="${cls}" data-skin="${sk.id}"><canvas width="144" height="176"></canvas><div class="nm">${sk.name}</div><div class="st">${st}</div></div>`;
  }).join('');
  ui.innerHTML = `<div class="screen scrim shop"><div class="panel${again ? ' still' : ''}">
    <header><h2>AXES</h2><div class="coins">${coinHTML(save.coins)}</div></header>
    <div class="grid">${cards}</div>
    <button class="btn play" data-a="back">DONE</button>
  </div></div>`;
  ui.querySelectorAll('.card').forEach((el) => {
    const sk = skinById(el.dataset.skin);
    const cc = el.querySelector('canvas').getContext('2d');
    cc.setTransform(2, 0, 0, 2, 0, 0);
    drawAxe(cc, sk, 40, 14, 0.38, 0.5);
  });
}
function buy(id, el) {
  const sk = skinById(id);
  if (save.owned.includes(id)) { save.skin = id; fx.sfx('click'); }
  else if (!sk.boss && save.coins >= sk.cost) { save.coins -= sk.cost; save.owned.push(id); save.skin = id; fx.sfx('buy'); toast(`${sk.name} unlocked!`); }
  else { fx.sfx('deny'); el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); return; }
  g.skin = skinById(save.skin);
  persist(); renderShop(true);
}

ui.addEventListener('click', (e) => {
  initAudio();
  const card = e.target.closest('[data-skin]');
  if (card) { buy(card.dataset.skin, card); return; }
  const b = e.target.closest('[data-a]'); if (!b || b.disabled) return;
  if (screen === 'over' && performance.now() - overAt < 350) return; // a tap mashed as the card pops can't skip it
  const a = b.dataset.a;
  if (a !== 'mute') fx.sfx('click');
  if (a === 'play' || a === 'retry' || a === 'restart') startRun();
  else if (a === 'shop') { shopFrom = screen; show('shop'); }
  else if (a === 'back') { if (shopFrom === 'over') showOver(false); else show('title'); }
  else if (a === 'home') { paused = false; show('title'); }
  else if (a === 'pause') pause(true);
  else if (a === 'resume') pause(false);
  else if (a === 'mute') toggleMute();
  else if (a === 'continue') {
    if (save.coins < 50 || g.continued) return;
    save.coins -= 50; persist(); g.continueRun(); show('play');
  }
});
function pause(on) {
  if (on && screen === 'play' && g.state !== 'over') { paused = true; show('pause'); }
  else if (!on && screen === 'pause') { paused = false; show('play'); last = performance.now(); }
}

// ---------------------------------------------------------------- input
cv.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  initAudio();
  if (screen === 'play' && !paused) g.throw();
  // Tapping the log on the title starts a run at once; the tap is buffered into the first throw.
  else if (screen === 'title') { startRun(); g.throw(); }
});
addEventListener('keydown', (e) => {
  const k = e.code;
  if (['Space', 'ArrowUp', 'KeyW', 'Enter'].includes(k)) {
    e.preventDefault();
    if (e.repeat) return;
    initAudio();
    if (screen === 'play' && !paused) g.throw();
    else if (screen === 'title') startRun();
    else if (screen === 'over' && performance.now() - overAt > 450) startRun();
    else if (screen === 'pause') pause(false);
  } else if (k === 'Escape' || k === 'KeyP') {
    if (screen === 'play') pause(true); else if (screen === 'pause') pause(false);
    else if (screen === 'shop') { if (shopFrom === 'over') showOver(false); else show('title'); }
  } else if (k === 'KeyR') {
    if (screen === 'play' || screen === 'over' || screen === 'pause') startRun();
  } else if (k === 'KeyM') toggleMute();
});
addEventListener('blur', () => pause(true));
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(true); });
cv.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- test hooks
window.__G = {
  get state() { return screen; }, get paused() { return paused; }, get overAge() { return performance.now() - overAt; },
  game: g, save, L, start: startRun, show, showOver,
  throw: () => g.throw(), safe: (m) => g.safe(m), predict: () => g.predict(),
  step: (dt = 1 / 60) => g.update(dt),
  stage: (n) => { g.stageN = n; g.loadStage(); },
};

if (params.get('play') === '1') startRun(); else show('title');
requestAnimationFrame(frame);
