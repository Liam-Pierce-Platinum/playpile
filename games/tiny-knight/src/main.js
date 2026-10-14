// Boot, input (keyboard / mouse / touch), fixed-step loop, test hooks.
import { G, newGame, load, update, save, hasSave, spawnEnemy, respawnPoint, Z, TS } from './game.js';
import { World } from './world.js';
import { render, cam } from './render.js';
import { ui } from './ui.js';
import { initAudio, sfx, setMuted, audio, playMusic } from './audio.js';
import { maxHpFor } from './data.js';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
let VW = 320, VH = 180, SCALE = 6;
function resize() {
  const w = innerWidth, h = innerHeight;
  SCALE = Math.max(2, Math.floor(Math.min(w, h) / 170));
  VW = Math.ceil(w / SCALE); VH = Math.ceil(h / SCALE);
  canvas.width = VW; canvas.height = VH;
  canvas.style.width = VW * SCALE + 'px'; canvas.style.height = VH * SCALE + 'px';
}
addEventListener('resize', resize); resize();

// ---------- input ----------
const keys = new Set();
const I = {
  mx: 0, my: 0, aim: null, attackP: false, rollP: false, useP: false, use: false, bowP: false, potionP: false,
  edge: { attack: false, roll: false, use: false, bow: false, potion: false },
  clearEdges() { this.attackP = this.rollP = this.useP = this.bowP = this.potionP = false; for (const k in this.edge) this.edge[k] = false; },
};
G.input = I;
const touch = { x: 0, y: 0, held: {} };
let mouseHeld = false, mouseX = 0, mouseY = 0;
const KEYMAP = { KeyJ: 'attack', KeyZ: 'attack', KeyK: 'roll', Space: 'roll', KeyX: 'roll', KeyE: 'use', KeyL: 'bow', KeyF: 'bow', KeyQ: 'potion', KeyH: 'potion' };
addEventListener('keydown', (e) => {
  initAudio();
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (ui.menu) {
    if (e.repeat) return;
    const m = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Enter: 'ok', KeyE: 'ok', KeyJ: 'ok', Space: 'ok', Escape: 'back', Tab: 'back', KeyI: 'back', KeyM: 'back', KeyP: 'back', Backspace: 'back' }[e.code];
    if (m) ui.key(m);
    if (e.code === 'KeyN') { setMuted(!audio.muted); ui.draw(); }
    return;
  }
  keys.add(e.code);
  if (e.repeat) return;
  const a = KEYMAP[e.code]; if (a) I.edge[a] = true;
  if (G.state === 'play') {
    if (e.code === 'KeyI' || e.code === 'Tab' || e.code === 'KeyB') ui.open('bag');
    if (e.code === 'KeyM') ui.open('map');
    if (e.code === 'Escape' || e.code === 'KeyP') ui.open('pause');
  }
  if (e.code === 'KeyN') setMuted(!audio.muted);
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => { keys.clear(); mouseHeld = false; touch.held = {}; });
document.addEventListener('visibilitychange', () => { if (document.hidden) { save(); if (G.state === 'play') ui.open('pause'); } });
function screenAim(sx, sy) { const p = G.player; if (!p) return null; const px = (p.x - cam.x) * SCALE, py = (p.y - 6 - cam.y) * SCALE; return Math.atan2(sy - py, sx - px); }
canvas.addEventListener('mousedown', (e) => {
  initAudio(); if (G.state !== 'play') return;
  mouseX = e.clientX; mouseY = e.clientY;
  if (e.button === 0) { mouseHeld = true; I.edge.attack = true; I.aim = screenAim(e.clientX, e.clientY); }
  if (e.button === 2) { I.edge.roll = true; }
});
addEventListener('mouseup', (e) => { if (e.button === 0) mouseHeld = false; });
addEventListener('mousemove', (e) => { mouseX = e.clientX; mouseY = e.clientY; });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// touch controls
const tc = document.getElementById('touch');
function showTouch() { document.body.classList.add('touch'); }
if (matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window) showTouch();
const stick = document.getElementById('stick'), knob = document.getElementById('knob');
let stickId = null, sx0 = 0, sy0 = 0;
stick.addEventListener('pointerdown', (e) => { initAudio(); showTouch(); stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId); } catch (er) {} const r = stick.getBoundingClientRect(); sx0 = r.left + r.width / 2; sy0 = r.top + r.height / 2; moveStick(e); });
stick.addEventListener('pointermove', (e) => { if (e.pointerId === stickId) moveStick(e); });
const endStick = (e) => { if (e.pointerId !== stickId) return; stickId = null; touch.x = touch.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', endStick); stick.addEventListener('pointercancel', endStick);
function moveStick(e) {
  let dx = e.clientX - sx0, dy = e.clientY - sy0; const R = stick.clientWidth * 0.4, d = Math.hypot(dx, dy);
  if (d > R) { dx = dx / d * R; dy = dy / d * R; }
  touch.x = Math.abs(dx) < R * 0.15 ? 0 : dx / R; touch.y = Math.abs(dy) < R * 0.15 ? 0 : dy / R;
  knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
for (const b of document.querySelectorAll('#touch [data-k]')) {
  const k = b.dataset.k;
  b.addEventListener('pointerdown', (e) => { e.preventDefault(); initAudio(); showTouch(); touch.held[k] = true; I.edge[k] = true; b.classList.add('down'); });
  const up = () => { touch.held[k] = false; b.classList.remove('down'); };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
}
document.getElementById('bagbtn').onclick = () => { initAudio(); if (G.state === 'play') ui.open('bag'); };
document.getElementById('mapbtn').onclick = () => { initAudio(); if (G.state === 'play') ui.open('map'); };
document.getElementById('pausebtn').onclick = () => { initAudio(); if (G.state === 'play') ui.open('pause'); };
document.getElementById('mutebtn').onclick = () => { initAudio(); setMuted(!audio.muted); };

function pollInput() {
  let mx = 0, my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  mx += touch.x; my += touch.y;
  if (bot.move) { mx = bot.move[0]; my = bot.move[1]; }
  I.mx = Math.max(-1, Math.min(1, mx)); I.my = Math.max(-1, Math.min(1, my));
  const held = (k, code) => keys.has(code) || touch.held[k];
  I.attackP = I.edge.attack || held('attack', 'KeyJ') || keys.has('KeyZ') || mouseHeld;
  if (mouseHeld) I.aim = screenAim(mouseX, mouseY); else if (!I.edge.attack) I.aim = null;
  I.rollP = I.edge.roll; I.bowP = I.edge.bow || (held('bow', 'KeyL') && G.player && G.player.bowCd <= 0);
  I.potionP = I.edge.potion; I.useP = I.edge.use; I.use = held('use', 'KeyE');
}

// ---------- boot ----------
const bot = { move: null };
G.ui = ui;
import('./sprites.js').then((S) => { for (const i of document.querySelectorAll('#hud i.ic')) { const n = [...i.classList].find((c) => c !== 'ic'); i.style.backgroundImage = 'url(' + S.iconURL(n) + ')'; } });
G.world = new World();
G.world.render();
newGame(); // demo state behind the title
function start(mode) {
  initAudio();
  if (mode === 'continue' && load()) ui.toast('Welcome back, little knight!', 'good');
  else newGame(); // the quest bar + arrow already say what to do first
  G.state = 'play'; G.zone = -1; G.time = 0;
  cam.x = G.player.x - VW / 2; cam.y = G.player.y - VH / 2;
  document.body.classList.add('playing');
  playMusic('field');
}
ui.onStart = start;
const params = new URLSearchParams(location.search);
if (params.get('play') === '1') start(params.get('fresh') === '1' || !hasSave() ? 'new' : 'continue');
else { G.state = 'title'; ui.open('title'); }

// ---------- loop ----------
let lastT = performance.now(), acc = 0; const STEP = 1 / 60;
let titleT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  pollInput();
  if (G.state === 'title') {
    titleT += dt;
    cam.x = 80 * TS + Math.cos(titleT * 0.05) * 420 - VW / 2; cam.y = 96 * TS + Math.sin(titleT * 0.05) * 300 - VH / 2;
    const p = G.player; p.x = cam.x + VW / 2; p.y = cam.y + VH / 2; p.aim = 0;
    G.time += dt;
    render(ctx, VW, VH, 0, true);
    document.body.classList.remove('playing');
  } else {
    acc += dt; let n = 0;
    while (acc >= STEP && n < 6) { update(STEP); acc -= STEP; n++; }
    if (n === 6) acc = 0;
    render(ctx, VW, VH, dt);
    ui.hud();
    document.body.classList.toggle('playing', G.state === 'play' || G.state === 'menu' || G.state === 'dying');
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ---------- test hooks ----------
window.__G = {
  G, ui, cam, bot,
  start,
  step(n = 60) { for (let i = 0; i < n; i++) { pollInput(); update(STEP); } },
  give(m, n) { const p = G.player; if (m === 'coins') p.coins += n; else if (m === 'potions') p.potions += n; else if (m === 'arrows') p.arrows += n; else { p.inv[m] = (p.inv[m] || 0) + n; if (p.totals[m] != null) p.totals[m] += n; } },
  tp(tx, ty) { G.player.x = tx * TS + 8; G.player.y = ty * TS + 8; cam.x = G.player.x - VW / 2; cam.y = G.player.y - VH / 2; },
  god(on = true) { G.god = on; },
  spawn(type, dx = 40, dy = 0) { return spawnEnemy(type, G.player.x + dx, G.player.y + dy); },
  heal() { G.player.hp = maxHpFor(G.player.lvl); },
  view() { return { VW, VH, SCALE }; },
  info() { const p = G.player; return { state: G.state, menu: ui.menu, x: p.x / TS, y: p.y / TS, hp: p.hp, lvl: p.lvl, xp: p.xp, coins: p.coins, inv: { ...p.inv }, sword: p.sword, pick: p.pick, axe: p.axe, bridge: G.world.bridgeStage, enemies: G.enemies.length, boss: G.boss ? { hp: G.boss.hp, phase: G.boss.phase, state: G.boss.state } : null, flags: G.flags, zone: G.world.zoneAt(p.x, p.y), target: G.interactTarget ? G.interactTarget.kind : null }; },
};
