// PARRY - block to the beat. Game loop, rules, input, effects and HUD.
import { STAGES, LANES, INFO, buildStage, buildEndless, extendEndless, beatT, beatAt } from './stages.js';
import { Audio } from './audio.js';
import * as D from './draw.js';
import { UI } from './ui.js';

const qs = new URLSearchParams(location.search);
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - Math.pow(1 - clamp(k), 3);

// ---- tuning -----------------------------------------------------------------
export const TUNE = {
  PERFECT: 0.045,   // +-45 ms = a 90 ms perfect window
  GOOD: 0.135,      // +-135 ms
  WHIFF_LOCK: 0.13, // shield recovery after blocking at nothing
  HOLD_GRACE: 0.07, // you may let go of a boulder this early
  PTS_PERFECT: 300, PTS_GOOD: 100, PTS_DODGE: 50, MULT_EVERY: 5, MULT_MAX: 8,
  BOSS_KO: 2000, HEART_BONUS: 500, ALL_PERFECT_BOSS: 3000,
};

// ---- save --------------------------------------------------------------------
const KEY = 'pd.parry';
function loadSave() {
  let s = {};
  try { s = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { s = {}; }
  return Object.assign({ stars: {}, best: {}, unlocked: 1, endlessBest: 0, seen: {}, musicVol: 0.7, sfxVol: 0.8, musicOn: true, sfxOn: true, offset: 0, touch: 'tap' }, s);
}
const save = loadSave();
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage blocked */ } }

const audio = new Audio();
Object.assign(audio, { musicVol: save.musicVol, sfxVol: save.sfxVol, musicOn: save.musicOn, sfxOn: save.sfxOn, offset: save.offset / 1000 });

// ---- clock (pausable, real time x speed) --------------------------------------
const speed = +qs.get('speed') || 1;
let clock = 0, lastPerf = performance.now(), running = true;
function gnow() { return running ? clock + Math.min(0.1, (performance.now() - lastPerf) / 1000) * speed : clock; }

// ---- layout ------------------------------------------------------------------
const Lo = {};
function layout() {
  const W = innerWidth, H = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const hy = Math.round(H * (W > H ? 0.2 : 0.17)), playH = H - hy;
  const u = clamp(Math.min(W / 540, playH / 480), 0.6, 1.7);
  Object.assign(Lo, { W, H, dpr, hy, u, cx: W / 2, cy: hy + playH * 0.5, pw: 64 * u, ID: 70 * u });
  Lo.len = [Lo.cy - hy - 8 * u, W - Lo.cx, H - Lo.cy, Lo.cx];
  Lo.station = Lo.len.map((L, i) => i === 0 ? L - 14 * u : Math.min(L - 30 * u, Math.max(170 * u, L * 0.74)));
  bgCache = {};
}
let bgCache = {};
function backdrop(bg) { return bgCache[bg] || (bgCache[bg] = D.makeBackdrop(bg, Lo, Lo.dpr)); }
const P = (lane, dist, off = 0) => { const [dx, dy] = LANES[lane]; return [Lo.cx + dx * dist - dy * off, Lo.cy + dy * dist + dx * off]; };
const VIEW = ['front', 'side', 'back', 'side']; // how an attacker standing in that lane is drawn
const FLIP = [false, true, false, false];

// ---- game state ---------------------------------------------------------------
const G = {
  mode: 'title', demo: true, stage: 0, endless: false, ch: null, t: 0, hearts: 3, score: 0, streak: 0, maxStreak: 0, mult: 1,
  perfects: 0, goods: 0, misses: 0, dodges: 0, whiffs: 0, bossPerfect: true, bossHits: 0,
  fx: [], pops: [], fxT: 0, slowT: 0, stopT: 0, shake: 0, zoom: 0, flash: 0, flashCol: '#fff', pulse: 0, beatIdx: -99,
  held: [false, false, false, false], recoverT: -1, hero: { face: 2, blockT: -9, kind: '', hurtT: -9, perfectT: -9, flourish: 0 },
  nextStep: 0, endAt: 0, deathT: 0, bot: null, save, persist, audio, TUNE, log: [],
};
window.__G = G;

function freshRound() {
  Object.assign(G, { hearts: 3, score: 0, streak: 0, maxStreak: 0, mult: 1, perfects: 0, goods: 0, misses: 0, dodges: 0, whiffs: 0,
    bossPerfect: true, bossHits: 0, fx: [], pops: [], slowT: 0, stopT: 0, shake: 0, zoom: 0, flash: 0, beatIdx: -99, recoverT: -1,
    held: [false, false, false, false], nextStep: 0, endAt: 0, deathT: 0, koT: 0, healBar: 0, log: [], judge: null, combo: null, musicOff: false });
  G.hero = { face: 2, blockT: -9, kind: '', hurtT: -9, perfectT: -9, flourish: 0 };
}

function begin(ch, opts) {
  freshRound();
  G.ch = ch; G.demo = !!opts.demo; G.endless = ch.endless; G.stage = ch.stage;
  G.bg = ch.endless ? ENDLESS_BG[0] : STAGES[ch.stage].bg;
  G.mode = opts.demo ? 'title' : 'play';
  audio.quiet = G.demo; audio.apply();
  clock = 0; lastPerf = performance.now(); running = true;
  G.t = 0;
  audio.sync(0);
  G.bot = G.demo ? { sigma: 0.012, miss: 0 } : (qs.has('bot') ? { sigma: +qs.get('bot') > 1 ? +qs.get('bot') / 1000 : 0.018, miss: 0 } : null);
  ui.hud(!G.demo);
}
const ENDLESS_BG = ['forest', 'castle', 'desert', 'dojo', 'frozen', 'docks', 'volcano', 'citadel'];

G.startStage = (si, skipBrief = false) => {
  audio.unlock();
  si = clamp(si | 0, 0, STAGES.length - 1);
  const S = STAGES[si];
  const fresh = S.intro.filter((k) => !save.seen[k]);
  if (fresh.length && !skipBrief && !qs.has('play')) { G.mode = 'brief'; G.briefStage = si; ui.show('brief', { si, types: fresh }); return; }
  for (const k of S.intro) save.seen[k] = 1; persist();
  ui.close();
  begin(buildStage(si), {});
};
G.startEndless = () => { audio.unlock(); ui.close(); begin(buildEndless((Math.random() * 1e9) | 0), {}); };
G.restart = () => { if (G.endless) G.startEndless(); else G.startStage(G.stage, true); };
G.toTitle = () => { startDemo(); ui.show('title'); };
G.pause = () => {
  if (G.mode !== 'play' || !running) return;
  clock = gnow(); running = false; audio.pause(); G.mode = 'paused'; ui.show('pause');
};
G.resume = () => {
  if (G.mode !== 'paused') return;
  ui.close(); G.mode = 'play';
  audio.resume().then(() => { lastPerf = performance.now(); running = true; audio.sync(clock); });
};
let demoN = 0;
function startDemo() {
  const pool = [0, 1, 2, 3, 4, 5, 6, 7];
  const si = pool[demoN++ % pool.length];
  const ch = buildStage(si);
  begin(ch, { demo: true });
  // skip the count-in so the attract mode is busy straight away
  clock = ch.beats[8] - 0.5; G.nextStep = 9999;
}

// ---- input ---------------------------------------------------------------------
const KEYDIR = { ArrowUp: 0, KeyW: 0, ArrowRight: 1, KeyD: 1, ArrowDown: 2, KeyS: 2, ArrowLeft: 3, KeyA: 3 };
addEventListener('keydown', (e) => {
  audio.unlock();
  if (e.code === 'Escape' || e.code === 'KeyP') {
    e.preventDefault();
    if (G.mode === 'play') G.pause(); else if (G.mode === 'paused') G.resume(); else if (ui.open) ui.back();
    return;
  }
  if (e.repeat) { if (KEYDIR[e.code] != null) e.preventDefault(); return; }
  const d = KEYDIR[e.code];
  if (G.mode === 'play' && d != null) { e.preventDefault(); press(d); return; }
  if (e.code === 'KeyR' && (G.mode === 'play' || G.mode === 'results' || G.mode === 'dead')) { G.restart(); return; }
  if ((e.code === 'Enter' || e.code === 'Space') && ui.open) { e.preventDefault(); ui.primary(); return; }
  if (G.mode === 'brief' && (d != null || e.code === 'Enter' || e.code === 'Space')) { G.startStage(G.briefStage, true); }
});
addEventListener('keyup', (e) => { const d = KEYDIR[e.code]; if (d != null) release(d); });
addEventListener('blur', () => { for (let d = 0; d < 4; d++) release(d); G.pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) G.pause(); });

const ptrs = new Map();
function dirFrom(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : 3) : (dy > 0 ? 2 : 0); }
cv.addEventListener('pointerdown', (e) => {
  audio.unlock();
  if (G.mode === 'brief') { G.startStage(G.briefStage, true); return; }
  if (G.mode !== 'play') return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
  if (save.touch === 'swipe' && e.pointerType === 'touch') { ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, d: -1, t: performance.now() }); return; }
  const d = dirFrom(e.clientX - Lo.cx, e.clientY - (Lo.cy - 4 * Lo.u));
  ptrs.set(e.pointerId, { d });
  press(d);
});
cv.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId);
  if (!p || p.d >= 0 || G.mode !== 'play') return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  if (Math.hypot(dx, dy) > 22) { p.d = dirFrom(dx, dy); press(p.d); }
});
const up = (e) => { const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (p && p.d >= 0 && ![...ptrs.values()].some((q) => q.d === p.d)) release(p.d); };
cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function release(d) { G.held[d] = false; }

// ---- the block -------------------------------------------------------------------
function press(d, tAt) {
  if (G.mode !== 'play' && !G.demo) return;
  const t = tAt ?? gnow();
  G.held[d] = true;
  const h = G.hero; h.face = d; h.blockT = G.fxT; h.kind = 'up';
  if (t < G.recoverT) return;
  const ch = G.ch;
  let best = null, bd = 1e9, bait = null;
  for (const a of ch.attacks) {
    if (a.hitT - t > 1.5) break;
    if (a.res || a.lane !== d) continue;
    const dt = t - a.hitT;
    if (Math.abs(dt) <= TUNE.GOOD && Math.abs(dt) < bd) { best = a; bd = Math.abs(dt); }
    if (a.fakeT != null && Math.abs(t - a.fakeT) <= TUNE.GOOD) bait = a;
  }
  if (best) {
    if (best.type === 'bomb') return boom(best, t);
    const grade = bd <= TUNE.PERFECT ? 'perfect' : 'good';
    G.log.push({ id: best.id, dt: t - best.hitT, grade });
    if (best.hold) { best.holding = true; best.grade = grade; best.res = 'hold'; h.kind = 'hold'; sfx('good', 0.6, 0.8); spark(impact(d), d, 6, '#fff'); return; }
    return resolve(best, grade, t);
  }
  // nothing to block: a whiff costs the perfect streak
  G.recoverT = t + TUNE.WHIFF_LOCK; G.whiffs++; h.kind = 'whiff';
  if (G.streak >= 3) judge('STREAK LOST', '#ffb0b0', '', 0.8);
  G.streak = 0; G.mult = 1;
  if (bait) { judge('FEINT!', '#7df9ff', 'wait a beat', 1); sfx('feint'); } else sfx('whiff');
}
G.press = press; G.release = release;

const impact = (lane) => P(lane, Lo.ID);
function sfx(n, v, p) { if (!G.demo) audio.play(n, v, p); }

function resolve(a, grade, t) {
  a.res = grade; a.resT = t; a.fxT = G.fxT;
  const h = G.hero, at = impact(a.lane), u = Lo.u;
  if (grade === 'perfect') {
    G.perfects++; G.streak++; G.maxStreak = Math.max(G.maxStreak, G.streak);
    const m = Math.min(TUNE.MULT_MAX, 1 + Math.floor(G.streak / TUNE.MULT_EVERY));
    if (m > G.mult) { G.mult = m; if (!G.demo) { a.comboUp = m; sfx('mult', 1, 1 + m * 0.05); } }
    G.mult = m;
    const pts = TUNE.PTS_PERFECT * G.mult; G.score += pts;
    h.kind = 'perfect'; h.perfectT = G.fxT;
    sfx('perfect', 1, 1 + Math.min(0.3, G.streak * 0.01));
    if (!G.demo) audio.duck(true);
    G.slowT = Math.max(G.slowT, a.final ? 1.1 : 0.2); G.flash = a.final ? 0.9 : 0.3; G.flashCol = '#fffbe8'; G.zoom = a.final ? 0.12 : 0.05; G.shake = Math.max(G.shake, 5 * u);
    burst(at, a.lane, '#ffe680'); spark(at, a.lane, 16, '#fff');
    G.fx.push({ k: 'ring', x: at[0], y: at[1], t0: G.fxT, dur: 0.35, r0: 10 * u, r1: 72 * u, col: '#ffffff' });
    if (a.comboUp) judge('x' + a.comboUp + ' COMBO', '#ffd23f', 'PERFECT  +' + pts, 1.3); else judge('PERFECT', '#ffd23f', '+' + pts, 1.2);
    if (a.boss) { const b = G.ch.boss; b.hp = Math.max(0, b.hp - 2); b.hurtT = G.fxT; }
    if (a.proj) { // knock it straight back at the thrower
      a.att.doomed = (a.att.doomed || 0) + 1;
      G.fx.push({ k: 'reflect', type: a.proj, a, from: at, t0: G.fxT, dur: a.proj === 'boulder' ? 0.3 : 0.2 });
    } else if (!a.boss) killRunner(a.att, a.lane);
    else G.fx.push({ k: 'slash', x: at[0], y: at[1], lane: a.lane, t0: G.fxT, dur: 0.25 });
    if (!a.boss) G.fx.push({ k: 'slash', x: at[0], y: at[1], lane: a.lane, t0: G.fxT, dur: 0.22 });
  } else {
    G.goods++; G.streak = 0; G.mult = 1; G.score += TUNE.PTS_GOOD;
    if (a.boss) { G.bossPerfect = false; const b = G.ch.boss; b.hp = Math.max(0, b.hp - 1); b.hurtT = G.fxT; }
    h.kind = 'good';
    sfx('good', 1, 0.9 + Math.random() * 0.2);
    G.shake = Math.max(G.shake, 3 * u); G.zoom = 0.015;
    spark(at, a.lane, 9, '#ffe9a0');
    judge('GOOD', '#ffffff', '+' + TUNE.PTS_GOOD, 0.95);
    if (a.proj) G.fx.push({ k: 'deflect', type: a.proj, from: at, lane: a.lane, t0: G.fxT, dur: 0.55, side: Math.random() < 0.5 ? -1 : 1 });
    else if (!a.boss) { a.att.knockT = G.fxT; }
  }
  if (a.final) bossKO();
}

function miss(a, t) {
  a.res = 'miss'; a.resT = t; a.fxT = G.fxT;
  G.misses++; G.streak = 0; G.mult = 1;
  if (a.boss) G.bossPerfect = false;
  hurt(a.lane, a.type === 'boulder' ? 'CRUSHED' : 'MISS');
  if (a.final) bossKO();
}
function hurt(lane, label) {
  const u = Lo.u, at = impact(lane);
  if (G.demo || G.mode !== 'play') { return; }
  G.hearts--; G.hero.hurtT = G.fxT;
  G.stopT = 0.09; G.shake = Math.max(G.shake, 12 * u); G.flash = 0.5; G.flashCol = '#ff2a3a';
  sfx('miss'); sfx('heart');
  judge(label, '#ff5a64', '', 1.2);
  for (let i = 0; i < 14; i++) chunk(Lo.cx, Lo.cy, '#ff5a64', 1);
  G.fx.push({ k: 'heartbreak', t0: G.fxT, dur: 0.8, i: G.hearts });
  if (G.hearts <= 0) die();
}
function boom(a, t) {
  a.res = 'boom'; a.resT = t; a.fxT = G.fxT;
  G.misses++; G.streak = 0; G.mult = 1; if (a.boss) G.bossPerfect = false;
  const at = impact(a.lane);
  explosion(at[0], at[1], 1.2);
  sfx('boom');
  hurt(a.lane, 'BOOM!');
}
function dodge(a) {
  a.res = 'dodge'; a.resT = a.hitT; a.fxT = G.fxT;
  G.dodges++; G.score += TUNE.PTS_DODGE;
  const at = impact(a.lane);
  judge('DODGE', '#8dff9a', '+' + TUNE.PTS_DODGE, 0.95);
}

function killRunner(att, lane) {
  att.dead = true; att.deadT = G.fxT;
  const [x, y] = attPos(att, G.t);
  G.fx.push({ k: 'body', att, lane, x, y, t0: G.fxT, dur: 0.7, vx: LANES[lane][0] * 520 * Lo.u, vy: LANES[lane][1] * 520 * Lo.u, spin: (Math.random() < 0.5 ? -1 : 1) * 9 });
  sfx('pop');
}
function killRanged(att) {
  att.dead = true; att.deadT = G.fxT;
  const [x, y] = attPos(att, G.t);
  explosion(x, y - 30 * Lo.u, 0.8);
  G.fx.push({ k: 'body', att, lane: att.lane, x, y, t0: G.fxT, dur: 0.7, vx: LANES[att.lane][0] * 260 * Lo.u, vy: LANES[att.lane][1] * 260 * Lo.u, spin: (Math.random() < 0.5 ? -1 : 1) * 7 });
  pop([x, y - 70 * Lo.u], 'KO', '#ffffff', 0.7);
  sfx('pop', 1, 0.8);
}

function bossKO() {
  const b = G.ch.boss; if (!b || b.dead) return;
  b.dead = true; b.deadT = G.fxT; G.koT = G.fxT;
  G.slowT = 1.3; G.flash = 1; G.flashCol = '#ffffff'; G.zoom = 0.14; G.shake = 16 * Lo.u;
  const [x, y] = attPos(b, G.t);
  for (let i = 0; i < 3; i++) setTimeout(() => explosion(x + (Math.random() - 0.5) * 80 * Lo.u, y - 60 * Lo.u + (Math.random() - 0.5) * 60 * Lo.u, 1.4), i * 140);
  G.fx.push({ k: 'body', att: b, lane: b.lane ?? 0, x, y, t0: G.fxT, dur: 1.6, vx: 0, vy: 0, spin: 0, boss: true });
  G.fx.push({ k: 'stamp', t0: G.fxT, dur: 2.2, text: 'K.O.' });
  if (!G.demo) { audio.play('ko'); G.score += TUNE.BOSS_KO; if (G.bossPerfect) G.score += TUNE.ALL_PERFECT_BOSS; }
}

function die() {
  G.mode = 'dead'; G.deathT = performance.now(); G.slowT = 1.5; G.flash = 0.8; G.flashCol = '#ff2a3a';
  audio.silenceMusic(); G.musicOff = true;
  audio.play('lose');
}

// ---- effects ---------------------------------------------------------------------
function judge(text, col, sub = '', size = 1) { G.judge = { text, col, sub, size, t0: G.fxT, rot: (Math.random() - 0.5) * 0.12 }; }
function pop(at, text, col, size = 1, sub = '') { G.pops.push({ x: at[0], y: at[1], text, col, size, sub, t0: G.fxT, rot: (Math.random() - 0.5) * 0.2 }); }
function spark(at, lane, n, col) {
  const [dx, dy] = LANES[lane];
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(-dy, -dx) + (Math.random() - 0.5) * 2.4 + Math.PI, sp = (180 + Math.random() * 420) * Lo.u;
    G.fx.push({ k: 'spark', x: at[0], y: at[1], vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, t0: G.fxT, dur: 0.25 + Math.random() * 0.25, col });
  }
}
function burst(at, lane, col) {
  for (let i = 0; i < 12; i++) G.fx.push({ k: 'ray', x: at[0], y: at[1], a: (i / 12) * TAU + Math.random() * 0.2, t0: G.fxT, dur: 0.26, col, len: (30 + Math.random() * 50) * Lo.u });
}
function chunk(x, y, col, k = 1) {
  const a = Math.random() * TAU, sp = (100 + Math.random() * 300) * Lo.u * k;
  G.fx.push({ k: 'chunk', x, y, z: 20 * Lo.u, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6, vz: (200 + Math.random() * 300) * Lo.u, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 20, t0: G.fxT, dur: 0.9, col, s: (4 + Math.random() * 6) * Lo.u });
}
function explosion(x, y, k = 1) {
  const u = Lo.u;
  G.fx.push({ k: 'ring', x, y, t0: G.fxT, dur: 0.4, r0: 10 * u, r1: 80 * u * k, col: '#ffd23f' });
  for (let i = 0; i < 8; i++) G.fx.push({ k: 'smoke', x: x + (Math.random() - 0.5) * 30 * u * k, y: y + (Math.random() - 0.5) * 30 * u * k, t0: G.fxT, dur: 0.5 + Math.random() * 0.4, r: (16 + Math.random() * 20) * u * k, col: i < 4 ? '#ff8a2a' : '#ffe14d' });
  for (let i = 0; i < 10; i++) chunk(x, y, i % 2 ? '#3a3040' : '#ff8a2a', k);
  G.shake = Math.max(G.shake, 8 * u * k);
}

// ---- positions ----------------------------------------------------------------------
function beatLen(t) { const ch = G.ch, b = beatAt(ch, t); return beatT(ch, Math.floor(b) + 1) - beatT(ch, Math.floor(b)); }

function attPos(att, t) { // feet position, plus a pose
  if (att.isBoss) return bossPos(att, t);
  const u = Lo.u, lane = att.lane, off = att.slot * 36 * u;
  const pose = att.pose || (att.pose = {});
  pose.alpha = 1; pose.raise = 0; pose.stride = 0; pose.lift = 0;
  if (att.ranged) {
    const sd = Lo.station[lane];
    const k = clamp((t - att.spawnT) / 0.3);
    let dist = sd + (1 - ease(k)) * 50 * u;
    pose.alpha = k; pose.lift = Math.sin(k * Math.PI) * 16;
    const nxt = att.attacks.find((a) => t < a.relT + 0.12);
    if (nxt) { const bl = beatLen(t); pose.raise = t < nxt.relT ? clamp(1 - (nxt.relT - t) / (bl * 0.85)) : clamp(1 - (t - nxt.relT) / 0.12) * 0.6; }
    const last = att.attacks[att.attacks.length - 1];
    const leaveT = Math.max(...att.attacks.map((a) => a.res && a.res !== 'hold' ? a.resT : a.hold ? a.holdEndT : a.hitT + 0.15)) + 0.35;
    if (!att.doomed && t > leaveT && (last.res && last.res !== 'hold')) { const k2 = clamp((t - leaveT) / 0.5); dist += k2 * k2 * 120 * u; pose.alpha = 1 - k2; pose.stride = Math.sin(t * 20) * 0.6; }
    const [x, y] = P(lane, dist, off);
    return [x, y];
  }
  // melee runner
  const a = att.attacks[0], bl = beatLen(t);
  const strike = Lo.ID + [22, 30, 76, 30][lane] * u, far = Lo.len[lane] + 40 * u;
  let dist;
  if (t < a.arriveT) { const k = clamp((t - a.runT) / (a.arriveT - a.runT)); dist = lerp(far, strike, k); pose.stride = Math.sin(t * 22); }
  else dist = strike;
  const swingT = a.hitT;
  if (a.fakeT != null && t < a.fakeT + 0.08) pose.raise = clamp((t - a.arriveT) / Math.max(0.05, a.fakeT - a.arriveT));
  else if (a.fakeT != null && t < a.hitT - 0.08) pose.raise = 1.1 + Math.sin(t * 30) * 0.05;
  else pose.raise = t < swingT - 0.06 ? clamp((t - a.arriveT) / Math.max(0.05, swingT - 0.06 - a.arriveT)) : -0.5;
  if (a.res && a.res !== 'hold' && !att.dead) {
    const since = t - a.resT;
    if (att.knockT != null) dist += ease(since / 0.2) * 46 * u;
    if (since > 0.3) { const k2 = clamp((since - 0.3) / 0.6); dist += k2 * k2 * (far - strike); pose.stride = Math.sin(t * 22); pose.alpha = 1 - clamp((since - 0.6) / 0.3); pose.raise = 0; }
  }
  return P(lane, dist, off * 0.5);
}

function laneAngle(l) { return [-Math.PI / 2, 0, Math.PI / 2, Math.PI][l]; }
function bossPos(b, t) {
  const u = Lo.u, pose = b.pose || (b.pose = {}), S = b.stations;
  pose.alpha = 1; pose.raise = 0; pose.stride = 0; pose.lift = 0;
  const homeOf = (l) => Math.min(Lo.len[l] - 16 * u, [180, 200, 240, 200][l] * u);
  let n = S.findIndex((s) => s.t >= t);
  if (n < 0) n = S.length;
  const prev = S[n - 1], next = S[n];
  let lane, ang, home = homeOf((S[n] || S[n - 1] || S[0]).lane), dist = home;
  if (t < b.enterT + beatLen(t) * 3) { // walking in for the intro bar
    lane = (S[0] || { lane: 0 }).lane;
    const k = clamp((t - b.enterT) / (beatLen(t) * 3));
    dist = lerp(Lo.len[lane] + 120 * u, home, ease(k)); pose.stride = k < 1 ? Math.sin(t * 12) : 0;
    ang = laneAngle(lane);
  } else if (!prev) { lane = next.lane; ang = laneAngle(lane); }
  else {
    lane = prev.lane; ang = laneAngle(lane);
    const doneT = prev.a.proj ? prev.a.relT + 0.1 : (prev.a.hold ? prev.a.holdEndT : prev.a.hitT) + 0.12;
    if (next && next.lane !== prev.lane) {
      const leap = Math.min(beatLen(t) * 0.6, Math.max(0.12, next.t - doneT));
      const ls = next.t - leap;
      if (t >= ls) {
        const k = clamp((t - ls) / leap);
        let a0 = laneAngle(prev.lane), a1 = laneAngle(next.lane), da = ((a1 - a0 + Math.PI * 3) % TAU) - Math.PI;
        ang = a0 + da * ease(k); lane = k > 0.5 ? next.lane : prev.lane;
        pose.lift = Math.sin(k * Math.PI) * 50;
      }
    }
  }
  // melee lunge
  const act = b.attacks.find((a) => !a.proj && t > beatT(G.ch, (a.fakeB ?? a.hitB) - 1) - 0.01 && t < (a.hold ? a.holdEndT : a.hitT) + 0.35);
  if (act) {
    lane = act.lane; ang = laneAngle(lane);
    home = homeOf(lane); const strike = Lo.ID + [44, 66, 150, 66][lane] * u, st = beatT(G.ch, (act.fakeB ?? act.hitB) - 1);
    const k = clamp((t - st) / Math.max(0.05, (act.fakeT ?? act.hitT) - 0.1 - st));
    dist = lerp(home, strike, ease(k));
    const endT = act.hold ? act.holdEndT : act.hitT;
    if (t > endT) dist = lerp(strike, home, ease((t - endT) / 0.35));
    if (act.fakeT != null && t < act.fakeT + 0.08) pose.raise = k;
    else if (act.fakeT != null && t < act.hitT - 0.08) pose.raise = 1.1;
    else pose.raise = t < act.hitT - 0.06 ? clamp((t - st) / Math.max(0.05, act.hitT - 0.06 - st)) : (act.hold && t < act.holdEndT ? -0.2 : -0.5);
    if (act.res && act.res !== 'hold' && act.res !== 'miss' && t - act.resT < 0.3) dist += 30 * u * (1 - (t - act.resT) / 0.3);
  } else {
    const th = b.attacks.find((a) => a.proj && t > a.relT - beatLen(t) && t < a.relT + 0.15);
    if (th) pose.raise = t < th.relT ? clamp(1 - (th.relT - t) / beatLen(t)) : 0.3;
  }
  b.lane = lane;
  return [Lo.cx + Math.cos(ang) * dist, Lo.cy + Math.sin(ang) * dist];
}

function projPos(a, t) {
  const u = Lo.u, [ix, iy] = impact(a.lane);
  const sx = a.launch[0], sy = a.launch[1];
  const k = (t - a.relT) / (a.hitT - a.relT);
  let x = lerp(sx, ix, k), y = lerp(sy, iy, k), z = 0;
  if (a.proj === 'bomb') z = Math.max(0, 80 * u * (1 - Math.pow(k - 1, 2)));
  return [x, y, z, Math.atan2(iy - sy, ix - sx)];
}

// ---- update ---------------------------------------------------------------------------
let lastFrame = performance.now();
function frame() {
  const nowP = performance.now();
  const rdt = Math.min(0.05, (nowP - lastFrame) / 1000); lastFrame = nowP;
  if (running) { const d = (nowP - lastPerf) / 1000; if (d > 0.1) audio.sync(clock + 0.1 * speed); clock += Math.min(0.1, d) * speed; }
  lastPerf = nowP;
  const t = G.t = clock;
  // effect time runs slow in slow-mo and stops in hit-stop
  let fs = 1;
  if (G.stopT > 0) { G.stopT -= rdt; fs = 0; }
  else if (G.slowT > 0) { G.slowT -= rdt; fs = G.slowT > 0.08 ? 0.28 : 0.6; }
  const fdt = rdt * fs; G.fxT += fdt;
  G.shake *= Math.pow(0.002, rdt); G.zoom *= Math.pow(0.004, rdt); G.flash = Math.max(0, G.flash - rdt * 2.6); G.pulse = Math.max(0, G.pulse - rdt * 4);
  if (audio.ok && !audio.synced) audio.sync(gnow());
  if (G.ch && (G.demo || G.mode === 'play' || G.mode === 'dead' || G.mode === 'won')) update(t);
  render(t, fdt);
  requestAnimationFrame(frame);
}

function update(t) {
  const ch = G.ch;
  if (ch.endless) extendEndless(ch, t);
  // music
  if (!G.musicOff && !G.demo && running) {
    const B = ch.beats;
    for (let guard = 0; guard < 32; guard++) {
      const s = G.nextStep, b = s / 4;
      if (b >= B.length - 1) break;
      const st = beatT(ch, b);
      if (st > t + 0.18) break;
      G.nextStep++;
      if (st < t - 0.05) continue;
      const bar = Math.floor(s / 16);
      audio.step(st, { step: s % 16, bar, phase: ch.phase[bar] || 'out', inten: ch.inten[bar] ?? 3, stage: ch.endless ? (Math.floor(bar / 16) % 8) : ch.stage, outBar: ch.phase.indexOf('out') });
    }
  }
  // beat pulse + count-in
  const bi = Math.floor(beatAt(ch, t));
  if (bi !== G.beatIdx) {
    G.beatIdx = bi; G.pulse = 1;
    if (!G.demo && bi >= 4 && bi <= 8) {
      const txt = ['READY', '3', '2', '1', 'GO!'][bi - 4];
      G.pops.push({ x: Lo.cx, y: Lo.cy - 130 * Lo.u, text: txt, col: bi === 8 ? '#ffd23f' : '#ffffff', size: bi === 8 ? 2.4 : 2, sub: '', t0: G.fxT, rot: 0, big: 1 });
    }
    if (ch.endless && bi > 8 && bi % 64 === 8 && G.hearts < 3 && G.mode === 'play') { G.hearts++; sfx('heal'); pop([Lo.cx, Lo.cy - 110 * Lo.u], 'HEART +1', '#ff8aa0', 1.3); }
    if (ch.boss && Math.abs(beatT(ch, bi) - ch.boss.enterT) < 0.01 && !G.demo) { audio.play('roar'); G.shake = 10 * Lo.u; G.fx.push({ k: 'banner', t0: G.fxT, dur: 2.2, text: ch.boss.name }); }
  }
  // the bot (tests + the title screen attract mode)
  if (G.bot) runBot(t);
  // attacks
  for (const a of ch.attacks) {
    if (a.hitT - t > 6) break;
    if (a.proj && !a.launch && t >= a.relT) {
      const [x, y] = attPos(a.att, a.relT);
      const sc = a.att.isBoss ? 2 : 1;
      a.launch = [x, y - (a.att.isBoss ? 70 : 40) * Lo.u * (sc > 1 ? 1 : 1)];
      if (t - a.relT < 0.2) sfx(a.proj === 'fire' ? 'fire' : a.proj === 'arrow' ? 'twang' : 'whoosh', 0.8, a.proj === 'boulder' ? 0.5 : 1);
    }
    if (a.res === 'hold') {
      const ok = G.held[a.lane] && G.hero.face === a.lane;
      if (!ok && t < a.holdEndT - TUNE.HOLD_GRACE) { a.holding = false; miss(a, t); continue; }
      if (t >= a.holdEndT || (!ok && t >= a.holdEndT - TUNE.HOLD_GRACE)) { a.holding = false; resolve(a, a.grade, t); continue; }
      if (Math.random() < 0.5) spark(impact(a.lane), a.lane, 1, '#ffd23f');
      if (!G.demo && Math.random() < 0.15) audio.play('grind', 0.5, 0.8 + Math.random() * 0.4);
      continue;
    }
    if (a.res) continue;
    if (t > a.hitT + TUNE.GOOD) { if (a.type === 'bomb') dodge(a); else miss(a, t); }
  }
  // reflected projectiles land: kill the thrower
  // round end
  if (G.mode === 'play' && !ch.endless && t >= ch.endT) win();
  if (G.mode === 'play' && ch.endless) G.endlessT = t - ch.t0;
  if (G.mode === 'dead' && performance.now() - G.deathT > 1700) results(false);
  if (G.mode === 'won' && performance.now() - G.wonT > 900) results(true);
  if (G.demo && t > ch.endT + 1) startDemo();
}

function runBot(t) {
  const bot = G.bot, ch = G.ch;
  for (const a of ch.attacks) {
    if (a.hitT - t > 0.3) break;
    if (a.res === 'hold') { if (t >= a.holdEndT) release(a.lane); continue; }
    if (a.res || a.botDone) continue;
    if (a.type === 'bomb') { a.botDone = true; continue; }
    if (a.botErr == null) { a.botErr = gauss() * bot.sigma; a.botSkip = Math.random() < bot.miss; }
    if (a.botSkip) { a.botDone = true; continue; }
    const at = a.hitT + a.botErr;
    if (t >= at) { a.botDone = true; press(a.lane, at); if (!a.hold) setTimeout(() => release(a.lane), 60); }
  }
}
function gauss() { let s = 0; for (let i = 0; i < 6; i++) s += Math.random(); return (s - 3) / 0.7071; }

function win() {
  G.mode = 'won'; G.wonT = performance.now();
  if (!G.demo) { audio.play('win'); G.score += G.hearts * TUNE.HEART_BONUS; }
}

function results(survived) {
  if (G.demo) return;
  G.mode = 'results'; ui.hud(false);
  const ch = G.ch;
  if (ch.endless) {
    const best = save.endlessBest || 0, isBest = G.score > best;
    if (isBest) save.endlessBest = G.score;
    persist();
    ui.show('result', { endless: true, score: G.score, best: Math.max(best, G.score), isBest, time: Math.max(0, G.endlessT || 0), perfects: G.perfects, goods: G.goods, misses: G.misses, maxStreak: G.maxStreak });
    return;
  }
  const si = ch.stage, key = si + 1;
  const got = [survived, survived && G.score >= ch.target, survived && G.bossPerfect];
  const old = save.stars[key] || [false, false, false];
  const fresh = got.map((g, i) => g && !old[i]);
  save.stars[key] = old.map((o, i) => o || got[i]);
  const best = save.best[key] || 0, isBest = G.score > best;
  if (isBest) save.best[key] = G.score;
  const wasEndless = save.unlocked >= 5;
  if (survived) save.unlocked = Math.max(save.unlocked, key + 1);
  persist();
  ui.show('result', { si, survived, score: G.score, best: Math.max(best, G.score), isBest, target: ch.target, got, fresh, perfects: G.perfects, goods: G.goods, misses: G.misses, maxStreak: G.maxStreak, bossPerfect: G.bossPerfect, endlessNew: !wasEndless && save.unlocked >= 5 });
}

// ---- render -------------------------------------------------------------------------------
function render(t, fdt) {
  const { W, H, dpr, u, cx, cy } = Lo;
  const c = ctx;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const ch = G.ch;
  if (!ch) { c.fillStyle = '#1a1424'; c.fillRect(0, 0, W, H); return; }
  const bg = ch.endless ? ENDLESS_BG[Math.floor(Math.max(0, beatAt(ch, t) - 8) / 64) % 8] : G.bg;
  // camera: shake + zoom punch around the hero
  c.save();
  const sh = G.shake, z = 1 + G.zoom;
  c.translate(cx + (Math.random() - 0.5) * sh, cy + (Math.random() - 0.5) * sh); c.scale(z, z); c.translate(-cx, -cy);
  c.drawImage(backdrop(bg), 0, 0, W, H);
  D.ambient(c, bg, Lo, G.fxT, G.pulse);
  // beat pulse on the plaza
  const accent = D.PAL[bg].accent;
  c.save(); c.globalAlpha = 0.2 + G.pulse * 0.35; c.strokeStyle = accent; c.lineWidth = (3 + G.pulse * 5) * u;
  c.beginPath(); c.ellipse(cx, cy + 30 * u, (70 + (1 - G.pulse) * 20) * u, (26 + (1 - G.pulse) * 8) * u, 0, 0, TAU); c.stroke(); c.restore();

  // lane glows for anything incoming
  const live = [];
  for (const a of ch.attacks) { if (a.ringT - t > 0.05) break; if (!a.res || a.res === 'hold' || t - a.resT < 0.06) live.push(a); }
  for (const a of live) {
    if (a.res && a.res !== 'hold') continue;
    const k = clamp(1 - (a.hitT - t) / Math.max(0.01, a.hitT - a.ringT));
    const col = ringCol(a);
    const [ix, iy] = impact(a.lane), [ex, ey] = P(a.lane, Lo.len[a.lane]);
    c.save(); c.globalAlpha = 0.12 + 0.3 * k * k; c.strokeStyle = col; c.lineWidth = 40 * u; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(ix, iy); c.lineTo(ex, ey); c.stroke(); c.restore();
  }
  // target markers in each lane
  for (let l = 0; l < 4; l++) {
    const [x, y] = impact(l);
    const hot = live.some((a) => a.lane === l && !a.res);
    c.save(); c.globalAlpha = hot ? 0.95 : 0.35 + G.pulse * 0.2;
    c.lineWidth = 3 * u; c.strokeStyle = hot ? '#ffffff' : 'rgba(255,255,255,0.8)'; c.fillStyle = 'rgba(20,10,40,0.35)';
    c.beginPath(); c.arc(x, y, 18 * u * (1 + G.pulse * 0.08), 0, TAU); c.fill(); c.stroke();
    // chevron pointing outward
    const [dx, dy] = LANES[l]; const px = -dy, py = dx;
    c.fillStyle = hot ? '#ffffff' : 'rgba(255,255,255,0.7)';
    c.beginPath(); c.moveTo(x + dx * 8 * u, y + dy * 8 * u); c.lineTo(x - dx * 4 * u + px * 8 * u, y - dy * 4 * u + py * 8 * u); c.lineTo(x - dx * 4 * u - px * 8 * u, y - dy * 4 * u - py * 8 * u); c.closePath(); c.fill();
    c.restore();
  }

  // characters, sorted by feet y
  const ents = [];
  for (const att of ch.atts) {
    if (att.dead) continue;
    if (att.isBoss) { if (t < att.enterT - 0.01) continue; }
    else if (t < att.spawnT || t > att.goneT + 1.2) continue;
    const [x, y] = attPos(att, t);
    if (att.pose.alpha <= 0.01) continue;
    ents.push({ y, draw: () => drawAttacker(c, att, x, y, t) });
  }
  // projectiles in flight (drawn above characters for readability)
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) e.draw();
  for (const a of live) {
    if (!a.proj || !a.launch) continue;
    if (a.res && a.res !== 'hold' && a.res !== 'miss' && a.res !== 'dodge') continue;
    if (a.res === 'miss' && t - a.resT > 0.03) continue;
    if (a.res === 'hold') { const [ix, iy] = impact(a.lane); const j = Math.sin(t * 60) * 2 * u; D.projectile(c, a.proj, ix + LANES[a.lane][0] * 14 * u + j, iy + LANES[a.lane][1] * 14 * u, 0, u, G.fxT * 0.2); continue; }
    const [x, y, zz, ang] = projPos(a, t);
    D.projectile(c, a.proj, x, y, ang, u, G.fxT, zz);
  }
  // bombs that sailed past keep flying and blow up behind you
  for (const a of ch.attacks) {
    if (a.type !== 'bomb' || a.res !== 'dodge' || a.landed) continue;
    const k = (t - a.relT) / (a.hitT - a.relT);
    if (k > 1.7) { a.landed = true; const [x, y] = projPos(a, t); explosion(x, y, 0.7); sfx('boom', 0.6); continue; }
    const [x, y, zz, ang] = projPos(a, t); D.projectile(c, 'bomb', x, y, ang, u, G.fxT, zz);
  }
  // timing rings (on top of everything in the world)
  drawFx(c, fdt);
  // the hero and the timing rings always sit on top of the hit effects, so the next attack stays readable
  drawHero(c, t);
  for (const a of live) drawRing(c, a, t);
  c.restore();

  // flash
  if (G.flash > 0) { c.fillStyle = G.flashCol; c.globalAlpha = Math.min(0.75, G.flash * 0.55); c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  if (G.hero.hurtT > G.fxT - 0.4 && !G.demo) { const k = 1 - (G.fxT - G.hero.hurtT) / 0.4; const v = c.createRadialGradient(cx, cy, Math.min(W, H) * 0.25, cx, cy, Math.max(W, H) * 0.7); v.addColorStop(0, 'rgba(255,0,40,0)'); v.addColorStop(1, `rgba(255,0,40,${0.5 * k})`); c.fillStyle = v; c.fillRect(0, 0, W, H); }
  drawPops(c);
  if (!G.demo && G.mode !== 'title') drawHud(c, t);
}

function ringCol(a) { return a.type === 'bomb' ? '#ff3b5c' : a.hold ? '#d58bff' : a.fakeT != null && G.t < a.fakeT + 0.08 ? '#7df9ff' : '#fff3a0'; }

function drawRing(c, a, t) {
  const u = Lo.u, [x, y] = impact(a.lane);
  if (a.res && a.res !== 'hold') {
    const k = (t - a.resT) / 0.06; if (k > 1) return;
    D.ring(c, x, y, 18 * u * (1 + k * 0.6), '#ffffff', 4 * u, 1 - k); return;
  }
  const col = ringCol(a);
  if (a.res === 'hold') { // hold meter fills round the marker
    const k = clamp((t - a.hitT) / (a.holdEndT - a.hitT));
    c.save(); c.lineWidth = 7 * u; c.strokeStyle = 'rgba(20,10,30,0.6)'; c.beginPath(); c.arc(x, y, 26 * u, 0, TAU); c.stroke();
    c.strokeStyle = col; c.lineWidth = 5 * u; c.beginPath(); c.arc(x, y, 26 * u, -Math.PI / 2, -Math.PI / 2 + TAU * k); c.stroke(); c.restore();
    label(c, 'HOLD', x, y - 40 * u, col, 13);
    return;
  }
  const R0 = 18 * u, R1 = 64 * u;
  let k, dashed = null, target = a.hitT, start = a.ringT;
  if (a.fakeT != null && t < a.fakeT + 0.1) { target = a.fakeT; start = a.ringT - (a.hitT - a.fakeT); dashed = [8 * u, 7 * u]; }
  else if (a.fakeT != null) { start = a.fakeT + 0.1; }
  k = clamp((target - t) / Math.max(0.05, target - start));
  const r = R0 + (R1 - R0) * k;
  const near = Math.abs(t - a.hitT) < TUNE.PERFECT * 1.2;
  D.ring(c, x, y, r, near ? '#ffffff' : col, (near ? 7 : 5) * u, clamp((1 - k) * 3), dashed);
  if (a.type === 'bomb') { // big X: don't block
    c.save(); c.strokeStyle = '#ff3b5c'; c.lineWidth = 5 * u; c.lineCap = 'round'; const s = 9 * u;
    c.beginPath(); c.moveTo(x - s, y - s); c.lineTo(x + s, y + s); c.moveTo(x + s, y - s); c.lineTo(x - s, y + s); c.stroke(); c.restore();
    if (k < 0.9) label(c, "DON'T BLOCK", x, y - r - 12 * u, '#ff7a8c', 11);
  } else if (a.hold && k < 0.9) label(c, 'HOLD', x, y - r - 12 * u, col, 12);
  else if (dashed && k < 0.95) label(c, 'WAIT...', x, y - r - 12 * u, '#7df9ff', 12);
}
function label(c, text, x, y, col, size) {
  c.save(); c.font = `${Math.round(size * Math.max(0.9, Lo.u))}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 4; c.strokeStyle = '#1a1424'; c.strokeText(text, x, y); c.fillStyle = col; c.fillText(text, x, y); c.restore();
}

function drawAttacker(c, att, x, y, t) {
  const u = Lo.u, p = att.pose;
  let lane = att.lane;
  if (att.isBoss) {
    const ang = Math.atan2(y - Lo.cy, x - Lo.cx);
    lane = Math.round(((ang + Math.PI / 2) / (Math.PI / 2) + 4)) % 4;
  }
  const view = VIEW[lane];
  const aim = view === 'side' ? 0 : view === 'front' ? Math.PI / 2 : -Math.PI / 2;
  const hurt = att.isBoss && att.hurtT != null ? clamp(1 - (G.fxT - att.hurtT) / 0.18) * 0.55 : 0;
  const kind = att.isBoss ? att.look : att.kind;
  // bob to the beat
  const bob = G.pulse * 0.06;
  D.figure(c, { x, y, s: u, kind, view, flip: FLIP[lane], aim, raise: p.raise, stride: p.stride, lift: p.lift, alpha: p.alpha, sq: bob, flash: hurt, t: G.fxT, holdBomb: kind === 'bomber' });
  // telegraph flash on the feint's fake swing
  for (const a of att.attacks) if (a.fakeT != null && !a.res && Math.abs(t - a.fakeT) < 0.12) {
    c.save(); c.globalAlpha = 1 - Math.abs(t - a.fakeT) / 0.12; D.star(c, x, y - 90 * u * (att.isBoss ? 1.8 : 1), 14 * u, '#7df9ff', 3); c.restore();
  }
}

function drawHero(c, t) {
  const u = Lo.u, h = G.hero, cx = Lo.cx, fy = Lo.cy + 40 * u;
  const since = G.fxT - h.blockT;
  const holding = G.ch.attacks.some((a) => a.res === 'hold');
  const blocking = holding || since < 0.22 || (G.held[h.face] && since < 0.6);
  const face = blocking ? h.face : 2;
  const view = face === 0 ? 'back' : face === 2 ? 'front' : 'side';
  let shield;
  if (!blocking) shield = { x: -17, y: -30, r: 15, face: 'front' };
  else if (face === 0) shield = { x: 0, y: -86, r: 18, face: 'front' };
  else if (face === 2) shield = { x: 0, y: -18, r: 18, face: 'front' };
  else shield = { x: 24, y: -36, r: 18, face: 'side' };
  const pk = clamp(1 - (G.fxT - h.perfectT) / 0.25);
  shield.glow = pk;
  const hurtK = clamp(1 - (G.fxT - h.hurtT) / 0.3);
  const punch = blocking ? clamp(1 - since / 0.12) : 0;
  const sq = (G.pulse * 0.05) + punch * 0.12 - pk * 0.1;
  let ox = 0, oy = 0;
  if (hurtK > 0) { ox = (Math.random() - 0.5) * 8 * u * hurtK; }
  if (blocking && face !== 2) { const [dx, dy] = LANES[face]; ox += dx * 5 * u * punch; oy += dy * 5 * u * punch; }
  // aura on a perfect streak
  if (G.streak >= 5) { c.save(); c.globalAlpha = 0.25 + 0.15 * Math.sin(G.fxT * 10); const g = c.createRadialGradient(cx, fy - 36 * u, 4, cx, fy - 36 * u, 70 * u); g.addColorStop(0, '#ffe680'); g.addColorStop(1, 'rgba(255,230,128,0)'); c.fillStyle = g; c.fillRect(cx - 80 * u, fy - 120 * u, 160 * u, 160 * u); c.restore(); }
  D.figure(c, { x: cx + ox, y: fy + oy, s: u, kind: 'hero', view, flip: face === 3, aim: view === 'side' ? -0.6 : view === 'front' ? 1.9 : -1.2, raise: pk * 0.8, sq, shield, flash: hurtK * 0.7, t: G.fxT });
}

function drawFx(c, fdt) {
  const u = Lo.u, T = G.fxT;
  const keep = [];
  for (const f of G.fx) {
    const k = (T - f.t0) / f.dur;
    if (k >= 1) { if (f.k === 'reflect') reflectArrive(f); continue; }
    keep.push(f);
    c.save();
    switch (f.k) {
      case 'spark': { const x = f.x + f.vx * (T - f.t0), y = f.y + f.vy * (T - f.t0); c.strokeStyle = f.col; c.lineWidth = 3 * u * (1 - k); c.beginPath(); c.moveTo(x, y); c.lineTo(x - f.vx * 0.03, y - f.vy * 0.03); c.stroke(); break; }
      case 'ray': { c.strokeStyle = f.col; c.globalAlpha = 0.6 * (1 - k); c.lineWidth = 4 * u * (1 - k); const r0 = 74 * u + f.len * k * 0.6, r1 = r0 + f.len * (1 - k * 0.5); c.beginPath(); c.moveTo(f.x + Math.cos(f.a) * r0, f.y + Math.sin(f.a) * r0); c.lineTo(f.x + Math.cos(f.a) * r1, f.y + Math.sin(f.a) * r1); c.stroke(); break; }
      case 'ring': { c.globalAlpha = 1 - k; c.strokeStyle = f.col; c.lineWidth = 6 * u * (1 - k) + 1; c.beginPath(); c.arc(f.x, f.y, lerp(f.r0, f.r1, ease(k)), 0, TAU); c.stroke(); break; }
      case 'smoke': { c.globalAlpha = (1 - k) * 0.9; c.fillStyle = f.col; c.strokeStyle = '#1a1424'; c.lineWidth = 2.5; c.beginPath(); c.arc(f.x, f.y - k * 30 * u, f.r * (0.6 + k * 0.8), 0, TAU); c.fill(); c.stroke(); break; }
      case 'chunk': {
        const dt = T - f.t0, x = f.x + f.vx * dt, y = f.y + f.vy * dt, zz = Math.max(0, f.z + f.vz * dt - 900 * u * dt * dt);
        c.globalAlpha = 1 - Math.max(0, k - 0.6) / 0.4; c.translate(x, y - zz); c.rotate(f.rot + f.vr * dt);
        c.fillStyle = f.col; c.strokeStyle = '#1a1424'; c.lineWidth = 2; c.fillRect(-f.s / 2, -f.s / 2, f.s, f.s); c.strokeRect(-f.s / 2, -f.s / 2, f.s, f.s); break;
      }
      case 'slash': { // the hero's riposte arc
        const [dx, dy] = LANES[f.lane]; const base = Math.atan2(dy, dx);
        c.globalAlpha = 1 - k; c.strokeStyle = '#ffffff'; c.lineWidth = 10 * u * (1 - k) + 2; c.lineCap = 'round';
        c.beginPath(); c.arc(Lo.cx, Lo.cy, Lo.ID + 14 * u, base - 1.1 + k * 0.6, base + 1.1 * ease(k * 1.5)); c.stroke();
        c.strokeStyle = '#ffd23f'; c.lineWidth = 4 * u * (1 - k); c.beginPath(); c.arc(Lo.cx, Lo.cy, Lo.ID + 6 * u, base - 0.9, base + 0.9 * ease(k * 1.5)); c.stroke(); break;
      }
      case 'reflect': {
        const a = f.a, att = a.att, [tx, ty] = attPos(att, G.t);
        const to = [tx, ty - (att.isBoss ? 70 : 40) * u];
        const e = ease(k), x = lerp(f.from[0], to[0], e), y = lerp(f.from[1], to[1], e);
        const ang = Math.atan2(to[1] - f.from[1], to[0] - f.from[0]);
        c.globalAlpha = 0.5; c.strokeStyle = '#ffffff'; c.lineWidth = 12 * u; c.beginPath(); c.moveTo(lerp(f.from[0], to[0], Math.max(0, e - 0.35)), lerp(f.from[1], to[1], Math.max(0, e - 0.35))); c.lineTo(x, y); c.stroke(); c.globalAlpha = 1;
        c.restore(); D.projectile(c, f.type, x, y, ang, u * 1.15, T); c.save(); break;
      }
      case 'deflect': {
        const [dx, dy] = LANES[f.lane]; const px = -dy * f.side, py = dx * f.side;
        const d = k * 140 * u, x = f.from[0] + px * d + dx * d * 0.4, y = f.from[1] + py * d + dy * d * 0.4 - Math.sin(k * Math.PI) * 40 * u;
        c.globalAlpha = 1 - k * k; c.restore(); c.save(); c.globalAlpha = 1 - k * k; D.projectile(c, f.type, x, y, k * 20, u, T); break;
      }
      case 'body': {
        const dt = T - f.t0, x = f.x + f.vx * dt * (1 - k * 0.5), y = f.y + f.vy * dt * (1 - k * 0.5);
        const lane = f.lane, view = VIEW[lane];
        c.globalAlpha = 1 - Math.max(0, k - 0.7) / 0.3;
        D.figure(c, { x, y, s: u, kind: f.att.isBoss ? f.att.look : f.att.kind, view, flip: FLIP[lane], aim: 0, raise: 0, lift: Math.sin(Math.min(1, k * 1.4) * Math.PI) * (f.boss ? 20 : 60), rot: f.boss ? Math.min(1, k * 1.6) * 1.4 : f.spin * dt, flash: f.boss ? 0.6 * (1 - k) : 0.5 * (1 - k), t: T });
        if (!f.boss && k > 0.55 && !f.popped) { f.popped = true; for (let i = 0; i < 6; i++) chunk(x, y - 30 * u, i % 2 ? '#ffffff' : '#ffd23f', 0.7); }
        break;
      }
      case 'banner': {
        const a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        c.globalAlpha = a; const y = Lo.H - 96 * u;
        c.fillStyle = 'rgba(20,10,30,0.8)'; c.fillRect(0, y - 26 * u, Lo.W, 52 * u);
        c.fillStyle = '#e0343f'; c.fillRect(0, y - 26 * u, Lo.W, 4 * u); c.fillRect(0, y + 22 * u, Lo.W, 4 * u);
        c.font = `${Math.round(30 * u)}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.fillStyle = '#ffffff'; c.fillText(f.text.toUpperCase(), Lo.cx + (1 - ease(k * 4)) * 200 * u, y);
        break;
      }
      case 'stamp': {
        const s = k < 0.1 ? 3 - 2 * (k / 0.1) : 1;
        c.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        c.translate(Lo.cx, Lo.cy - 60 * u); c.scale(s, s); c.rotate(-0.12);
        c.font = `${Math.round(84 * u)}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
        c.lineWidth = 12 * u; c.strokeStyle = '#1a1424'; c.strokeText(f.text, 0, 0); c.fillStyle = '#ffd23f'; c.fillText(f.text, 0, 0);
        break;
      }
      case 'heartbreak': break;
    }
    c.restore();
  }
  G.fx = keep;
}
function reflectArrive(f) {
  const a = f.a, att = a.att;
  att.doomed = Math.max(0, (att.doomed || 1) - 1);
  if (att.isBoss) { const [x, y] = attPos(att, G.t); explosion(x, y - 60 * Lo.u, 0.6); att.hurtT = G.fxT; return; }
  if (!att.dead) killRanged(att);
}

function drawPops(c) {
  const u = Lo.u, T = G.fxT, keep = [];
  const m = Math.max(0.7, Math.min(1.3, u)), jx = Math.min(118 * u, Lo.W * 0.27);
  const big = (txt, sub, col, x, y, s, rot, a) => {
    c.save(); c.globalAlpha = a; c.translate(x, y); c.rotate(rot); c.scale(s, s);
    c.font = `${Math.round(30 * m)}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 8; c.strokeStyle = '#1a1424'; c.strokeText(txt, 0, 0); c.fillStyle = col; c.fillText(txt, 0, 0);
    if (sub) { c.font = `${Math.round(16 * m)}px "Lilita One", sans-serif`; c.lineWidth = 5; c.strokeText(sub, 0, 24 * m); c.fillStyle = '#ffffff'; c.fillText(sub, 0, 24 * m); }
    c.restore();
  };
  const J = G.judge;
  if (J && !G.demo) { const age = T - J.t0; if (age < 0.6) { const k = age / 0.6; big(J.text, J.sub, J.col, Lo.cx + jx, Lo.cy - 100 * u - k * 10 * u, (k < 0.1 ? 1.5 - k * 5 : 1) * J.size, J.rot - 0.06, k > 0.7 ? (1 - k) / 0.3 : 1); } }
  const C = G.combo;
  if (C && !G.demo) { const age = T - C.t0; if (age < 0.9) { const k = age / 0.9; big('x' + C.m, 'COMBO', '#ffd23f', Lo.cx - jx, Lo.cy - 100 * u, (k < 0.12 ? 2 - k * 8 : 1) * 1.3, 0.08, k > 0.7 ? (1 - k) / 0.3 : 1); } }
  for (const p of G.pops) {
    const age = T - p.t0, dur = p.big ? 0.55 : 0.75; if (age > dur) continue; keep.push(p);
    const k = age / dur;
    const s = (k < 0.12 ? 1.6 - (k / 0.12) * 0.6 : 1) * p.size;
    c.save(); c.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
    c.translate(p.x, p.y - k * 26 * u); c.rotate(p.rot); c.scale(s, s);
    c.font = `${Math.round(24 * Math.max(0.8, u))}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 7; c.strokeStyle = '#1a1424'; c.strokeText(p.text, 0, 0); c.fillStyle = p.col; c.fillText(p.text, 0, 0);
    if (p.sub) { c.font = `${Math.round(14 * Math.max(0.8, u))}px "Lilita One", sans-serif`; c.lineWidth = 5; c.strokeText(p.sub, 0, 20 * Math.max(0.8, u)); c.fillStyle = '#ffffff'; c.fillText(p.sub, 0, 20 * Math.max(0.8, u)); }
    c.restore();
  }
  G.pops = keep;
}

function drawHud(c, t) {
  const { W, u } = Lo, ch = G.ch;
  const m = Math.max(0.8, Math.min(1.25, u));
  const top = 14 + (window.visualViewport ? 0 : 0);
  // hearts
  for (let i = 0; i < 3; i++) {
    const on = i < G.hearts;
    const br = G.fx.find((f) => f.k === 'heartbreak' && f.i === i);
    const s = 13 * m * (br ? 1 + 0.5 * Math.sin(clamp((G.fxT - br.t0) / br.dur) * Math.PI) : on ? 1 + G.pulse * 0.08 : 1);
    D.heart(c, 22 * m + i * 32 * m, top + 16 * m, s, on ? '#ff4d6a' : 'rgba(40,30,50,0.55)', 3);
  }
  // score + multiplier
  c.save(); c.textAlign = 'right'; c.textBaseline = 'top';
  c.font = `${Math.round(30 * m)}px "Lilita One", sans-serif`; c.lineWidth = 6; c.strokeStyle = '#1a1424';
  const sx = W - 66; // clear of the 44 px pause button at any width
  c.strokeText(G.score.toLocaleString(), sx, top); c.fillStyle = '#ffffff'; c.fillText(G.score.toLocaleString(), sx, top);
  if (G.mult > 1) {
    c.font = `${Math.round(20 * m)}px "Lilita One", sans-serif`;
    const y2 = top + 34 * m; c.strokeText('x' + G.mult, sx, y2); c.fillStyle = '#ffd23f'; c.fillText('x' + G.mult, sx, y2);
  }
  if (G.streak >= 2 && W >= 560) { c.font = `${Math.round(13 * m)}px "Lilita One", sans-serif`; const y3 = top + (G.mult > 1 ? 58 : 36) * m; c.lineWidth = 4; c.strokeText(G.streak + ' PERFECT STREAK', sx, y3); c.fillStyle = '#fff3a0'; c.fillText(G.streak + ' PERFECT STREAK', sx, y3); }
  c.restore();
  // timer / progress bar
  const narrow = W < 560, bw = narrow ? W - 28 : Math.min(260 * m, W - 260 * m), bx = (W - bw) / 2, by = narrow ? top + 50 * m : top + 6 * m;
  c.save();
  if (!ch.endless) {
    const total = ch.endT - ch.t0, left = clamp((ch.endT - t) / total);
    D.rr(c, bx, by, bw, 14 * m, 7 * m); c.fillStyle = 'rgba(20,10,30,0.6)'; c.fill(); c.lineWidth = 3; c.strokeStyle = '#1a1424'; c.stroke();
    D.rr(c, bx + 3, by + 3, Math.max(0, (bw - 6) * (1 - left)), 14 * m - 6, 4 * m); c.fillStyle = '#ffd23f'; c.fill();
    const bk = (ch.boss.enterT - ch.t0) / total;
    c.fillStyle = '#e0343f'; c.beginPath(); c.arc(bx + bw * bk, by + 7 * m, 6 * m, 0, TAU); c.fill(); c.stroke();
    c.font = `${Math.round(13 * m)}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 4;
    const secs = Math.max(0, Math.ceil(ch.endT - Math.max(t, ch.t0)));
    const txt = `${STAGES[ch.stage].name.toUpperCase()}  ·  ${secs}s`;
    c.strokeText(txt, W / 2, by + 20 * m); c.fillStyle = '#ffffff'; c.fillText(txt, W / 2, by + 20 * m);
    // boss health
    const b = ch.boss;
    if (t >= b.enterT && !b.dead) {
      const y = by + 42 * m;
      D.rr(c, bx, y, bw, 12 * m, 6 * m); c.fillStyle = 'rgba(20,10,30,0.7)'; c.fill(); c.lineWidth = 3; c.stroke();
      D.rr(c, bx + 3, y + 3, Math.max(0, (bw - 6) * (b.hp / b.maxHp)), 12 * m - 6, 3 * m); c.fillStyle = '#e0343f'; c.fill();
      c.strokeText(b.name.toUpperCase(), W / 2, y + 15 * m); c.fillStyle = '#ffb0b0'; c.fillText(b.name.toUpperCase(), W / 2, y + 15 * m);
    }
  } else {
    c.font = `${Math.round(20 * m)}px "Lilita One", sans-serif`; c.textAlign = 'center'; c.textBaseline = 'top'; c.lineWidth = 5; c.strokeStyle = '#1a1424';
    const s = Math.max(0, G.endlessT || 0), txt = `ENDLESS  ·  ${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
    c.strokeText(txt, W / 2, by); c.fillStyle = '#ffffff'; c.fillText(txt, W / 2, by);
    const bpm = Math.round(60 / beatLen(t));
    c.font = `${Math.round(12 * m)}px "Lilita One", sans-serif`; c.lineWidth = 4; c.strokeText(bpm + ' BPM', W / 2, by + 24 * m); c.fillStyle = '#ffd23f'; c.fillText(bpm + ' BPM', W / 2, by + 24 * m);
  }
  c.restore();
  // beat dots at the bottom
  const bb = beatAt(ch, t), inBar = ((Math.floor(bb) % 4) + 4) % 4;
  for (let i = 0; i < 4; i++) {
    const on = i === inBar; c.beginPath(); c.arc(W / 2 + (i - 1.5) * 20 * m, Lo.H - 18 * m, (on ? 6 + G.pulse * 2 : 4) * m, 0, TAU);
    c.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.45)'; c.fill(); c.lineWidth = 2; c.strokeStyle = '#1a1424'; c.stroke();
  }
}

// ---- boot ----------------------------------------------------------------------------------
const ui = new UI(G);
G.ui = ui;
layout();
addEventListener('resize', layout);
if (qs.has('play') || qs.has('stage') || qs.has('endless')) {
  if (qs.has('endless')) G.startEndless();
  else G.startStage(qs.has('stage') ? (+qs.get('stage') - 1) : ui.nextStage() - 1, true);
} else { startDemo(); ui.show('title'); }
requestAnimationFrame(frame);
