// PUCK BLITZ - boot, loop, input, effects, screens, saving.
import { createGame, step, resetMatch, setTarget, botThink, setLength, W, H, MR, PR, DIFF, MAXP } from './game.js';
import { layout, buildTable, drawFrame, toScreen, toTable, view, COL } from './render.js';
import { initAudio, prepareAudio, sfx, setMuted, isMuted } from './audio.js';

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const ui = document.getElementById('ui');
const qs = new URLSearchParams(location.search);
const RGB = { 0: '46,242,255', 1: '255,61,154', puck: '255,243,107' };
const LEVELS = ['easy', 'medium', 'hard'];
const LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

// ---------------------------------------------------------------- save
const SAVE_KEY = 'pd.air-hockey';
const save = Object.assign({ diff: 'medium', wins: { easy: 0, medium: 0, hard: 0 }, losses: { easy: 0, medium: 0, hard: 0 }, streak: 0, bestStreak: 0, top: 0, muted: false, matches: 0, duels: 0 }, load());
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; } }
function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch { /* storage blocked: play on */ } }
setMuted(!!save.muted);

// ---------------------------------------------------------------- state
const S = {
  state: 'title',          // 'title' | 'play' | 'results'
  paused: false,
  moved: 0,
  game: null,
  timeScale: 1,
  hitstop: 0,
  overT: -1,
  panel: '',
  lastResult: null,
};
const fx = { parts: [], rings: [], flashes: [], texts: [], trail: [], rails: [], shake: 0, pulse: [0, 0], scorePunch: [0, 0], coach: 0 };

function newDemo() {
  const g = createGame({ mode: 'demo', diff: 'medium', diff0: 'medium' });
  resetMatch(g);
  return g;
}

// ---------------------------------------------------------------- layout
function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const cw = window.innerWidth, ch = window.innerHeight;
  cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
  // stretch the table to the screen shape (more length on tall phones), never squash it
  const r = (Math.max(cw, ch) - 16) / (Math.min(cw, ch) - 8);
  const len = Math.round(Math.max(1000, Math.min(1250, r * 660 - 60)) / 10) * 10;
  if (len !== H) setLength(len, S.game);
  layout(cw, ch, dpr);
  buildTable();
}
window.addEventListener('resize', resize);

// ---------------------------------------------------------------- input
const pointers = new Map(); // pointerId -> side
let lastPointer = matchMedia('(pointer: coarse)').matches ? 'touch' : 'mouse';
let keyDir = { x: 0, y: 0 };
function pointerSide(e, x, y) {
  if (S.game.mode !== '2p' || e.pointerType === 'mouse') return 0;
  return y > H / 2 ? 0 : 1;
}
function aim(e) {
  lastPointer = e.pointerType || lastPointer;
  if (S.state !== 'play' || S.paused) return;
  const [x, y] = toTable(e.clientX, e.clientY);
  let side = pointers.get(e.pointerId);
  if (side === undefined) {
    if (e.type === 'pointermove' && e.pointerType !== 'mouse') return; // stray touch move
    side = pointerSide(e, x, y);
    if (e.pointerType !== 'mouse') pointers.set(e.pointerId, side);
  }
  if (S.game.mode === 'bot' && side === 1) return;
  if (side === 0) { const m = S.game.m[0]; S.moved += Math.hypot(Math.min(W, Math.max(0, x)) - m.tx, Math.min(H, Math.max(H / 2, y)) - m.ty); }
  setTarget(S.game, side, x, y);
}
cv.addEventListener('pointerdown', (e) => { initAudio(); aim(e); });
cv.addEventListener('pointermove', (e) => {
  if (e.getCoalescedEvents) { const list = e.getCoalescedEvents(); if (list.length) { aim(list[list.length - 1]); return; } }
  aim(e);
});
const drop = (e) => pointers.delete(e.pointerId);
cv.addEventListener('pointerup', drop);
cv.addEventListener('pointercancel', drop);
cv.addEventListener('contextmenu', (e) => e.preventDefault());

const KEYS = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
const held = new Set();
window.addEventListener('keydown', (e) => {
  initAudio();
  if (KEYS[e.code]) { held.add(e.code); e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === 'KeyM') toggleMute();
  if (S.state === 'play') {
    if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
    else if (e.code === 'KeyR') restart();
  } else if (S.state === 'results') {
    if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') { e.preventDefault(); restart(); }
    if (e.code === 'Escape') toTitle();
  } else if (S.state === 'title') {
    if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); start({ mode: 'bot', diff: save.diff }); }
  }
});
window.addEventListener('keyup', (e) => held.delete(e.code));
function keyMove(dt) {
  if (!held.size || S.state !== 'play' || S.paused) return;
  let dx = 0, dy = 0;
  for (const c of held) { dx += KEYS[c][0]; dy += KEYS[c][1]; }
  // keys steer in screen space; convert to table space when the table is on its side
  let tx = dx, ty = dy;
  if (view.land) { tx = dy; ty = -dx; }
  const m = S.game.m[0];
  S.moved += 1100 * dt * 3;
  setTarget(S.game, 0, m.x + tx * 1100 * dt * 3, m.y + ty * 1100 * dt * 3);
}
document.addEventListener('visibilitychange', () => { if (document.hidden && S.state === 'play' && !S.paused) togglePause(); });

// ---------------------------------------------------------------- flow
function start(opts) {
  initAudio();
  if (opts.mode === 'bot') { save.diff = opts.diff; store(); }
  S.game = createGame(opts);
  resetMatch(S.game);
  S.state = 'play'; S.paused = false; S.overT = -1; S.hitstop = 0;
  pointers.clear();
  clearFx();
  document.body.classList.add('playing');
  const two = opts.mode === '2p';
  bigText(two ? 'GO!' : 'FIRST TO 7', COL.p1, two ? 0.8 : 0.9, two ? undefined : textSize(0.8), two ? undefined : [view.land ? W * 0.2 : W / 2, H * 0.25]);
  fx.coach = opts.mode === '2p' ? 0 : 1; S.moved = 0;
  renderUI();
}
function restart() {
  const g = S.game;
  sfx.click();
  start({ mode: g.mode, diff: g.diff });
}
function toTitle() {
  S.state = 'title'; S.paused = false; S.game = newDemo(); clearFx();
  document.body.classList.remove('playing');
  renderUI();
}
function togglePause() {
  if (S.state !== 'play') return;
  S.paused = !S.paused;
  renderUI();
}
function toggleMute() { save.muted = !isMuted(); setMuted(save.muted); store(); renderUI(); }

function finish(winner) {
  const g = S.game;
  const r = { winner, score: g.score.slice(), top: g.stats.top, longest: g.stats.longest, time: g.t, mode: g.mode, diff: g.diff, badges: [] };
  const kmh = Math.round(g.stats.top * 0.045);
  if (g.mode === 'bot') {
    save.matches++;
    if (winner === 0) {
      if (!save.wins[g.diff]) r.badges.push('First win on ' + LABEL[g.diff] + '!');
      save.wins[g.diff]++; save.streak++;
      if (save.streak > save.bestStreak) { save.bestStreak = save.streak; if (save.streak > 1) r.badges.push('Best streak: ' + save.streak); }
      if (g.score[1] === 0) r.badges.push('Shutout!');
      sfx.win();
    } else { save.losses[g.diff]++; save.streak = 0; sfx.lose(); }
  } else { save.duels++; sfx.win(); }
  if (kmh > save.top) { if (save.top > 0) r.badges.push('Hardest shot ever: ' + kmh + ' km/h'); save.top = kmh; }
  store();
  S.lastResult = r;
  S.state = 'results';
  document.body.classList.remove('playing');
  renderUI();
}

// ---------------------------------------------------------------- effects
function clearFx() { fx.parts.length = fx.rings.length = fx.flashes.length = fx.texts.length = fx.trail.length = fx.rails.length = 0; fx.shake = 0; }
function burst(x, y, n, rgb, speed, size = 5, life = 0.45, nx = 0, ny = 0) {
  for (let i = 0; i < n; i++) {
    let a = Math.random() * Math.PI * 2;
    if (nx || ny) a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.2;
    const v = speed * (0.3 + Math.random() * 0.9);
    fx.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, rgb, size: size * (0.6 + Math.random() * 0.8) });
  }
  if (fx.parts.length > 500) fx.parts.splice(0, fx.parts.length - 500);
}
function textSize(k = 1) { return Math.max(24, Math.min(view.cw * 0.13, view.ch * 0.12, 96) * k); }
function bigText(text, color, dur = 1, size, at) {
  // 2 players on an upright phone: one copy per half, the top one faces the top player
  if (!at && S.game && S.game.mode === '2p' && !view.land) {
    const sz = Math.min(size || textSize(), textSize(0.8));
    bigText(text, color, dur, sz, [W / 2, H * 0.75]);
    bigText(text, color, dur, sz, [W / 2, H * 0.25]);
    fx.texts[fx.texts.length - 1].rot = Math.PI;
    return;
  }
  let x = view.cw / 2, y = view.ch / 2, maxW = view.cw * 0.9;
  if (at) { [x, y] = toScreen(at[0], at[1]); maxW = (view.land ? H / 2 : W) * view.s * 0.92; }
  fx.texts.push({ text, color, life: dur, max: dur, x, y, maxW, size: size || textSize() });
}
function popText(text, color, x, y) { // small rising label at a table point (shot speed)
  const old = fx.texts.find((t) => t.small && t.max - t.life < 0.25);
  if (old) { old.text = text; return; } // one label per shot (a mallet can touch the puck twice)
  fx.texts = fx.texts.filter((t) => !t.small);
  const [sx, sy] = toScreen(x, y);
  fx.texts.push({ text, color, life: 0.7, max: 0.7, x: sx, y: sy - 30, vy: -60, size: Math.max(16, Math.min(26, 30 * view.s)), small: true });
}
function handleEvents(g, quiet) {
  for (const e of g.events) {
    if (e.type === 'hit') {
      const k = Math.min(1, e.speed / 2200);
      burst(e.x, e.y, 4 + Math.round(k * 18), RGB[e.side], 300 + k * 900, 4 + k * 4, 0.35, e.nx, e.ny);
      burst(e.x, e.y, 2 + Math.round(k * 6), '255,255,255', 200 + k * 600, 3, 0.25, e.nx, e.ny);
      fx.pulse[e.side] = 1;
      if (k > 0.55) { fx.rings.push({ x: e.x, y: e.y, r: 12, vr: 320 + k * 380, life: 0.2, max: 0.2, rgb: RGB[e.side] }); fx.shake = Math.max(fx.shake, 3 + k * 6); }
      if (k > 0.72 && !quiet) S.hitstop = 0.045;
      if (!quiet && k > 0.6 && (g.mode === '2p' || e.side === 0)) { const kmh = Math.round(Math.min(MAXP, Math.hypot(g.puck.vx, g.puck.vy)) * 0.045); popText(kmh + ' KM/H', e.side === 0 ? COL.p1 : COL.p2, e.x, e.y); }
      if (!quiet) sfx.hit(e.speed);
    } else if (e.type === 'wall') {
      const k = Math.min(1, e.speed / 2200);
      burst(e.x, e.y, 3 + Math.round(k * 8), RGB.puck, 200 + k * 500, 3, 0.3);
      fx.rails.push({ x: e.x, y: e.y, life: 0.35, max: 0.35, k: 0.35 + k * 0.65 });
      if (k > 0.6) fx.shake = Math.max(fx.shake, 2 + k * 3);
      if (!quiet) sfx.wall(e.speed);
    } else if (e.type === 'post') {
      burst(e.x, e.y, 10, '255,255,255', 500, 3, 0.35);
      if (!quiet) sfx.post();
    } else if (e.type === 'goal') {
      const s = e.scorer, rgb = RGB[s];
      fx.flashes.push({ side: s, life: 0.9, max: 0.9, rgb });
      burst(e.x, e.y, 60, rgb, 1300, 7, 0.8, 0, s === 0 ? 1 : -1);
      burst(e.x, e.y, 30, '255,255,255', 900, 4, 0.6, 0, s === 0 ? 1 : -1);
      fx.rings.push({ x: e.x, y: e.y, r: 20, vr: 1100, life: 0.55, max: 0.55, rgb });
      fx.rings.push({ x: e.x, y: e.y, r: 10, vr: 700, life: 0.7, max: 0.7, rgb: '255,255,255' });
      fx.shake = 16; fx.scorePunch[s] = 1;
      fx.trail.length = 0;
      if (!quiet) {
        const good = g.mode === '2p' || s === 0;
        sfx.goal(good);
        let label = 'GOAL!';
        if (g.score[s] >= g.target) label = g.mode === 'bot' ? (s === 0 ? 'WINNER!' : 'GAME') : 'WINNER!';
        else if (g.score[s] === g.target - 1) label = 'MATCH POINT';
        bigText(label, s === 0 ? COL.p1 : COL.p2, 1.1, label.length > 6 ? textSize(0.75) : undefined);
      }
    } else if (e.type === 'serve') {
      if (!quiet && g.phase === 'play' && g.t > 0.1) sfx.serve();
      const [sx, sy] = [g.puck.x, g.puck.y];
      fx.rings.push({ x: sx, y: sy, r: PR, vr: 160, life: 0.4, max: 0.4, rgb: RGB.puck });
    } else if (e.type === 'nudge') {
      if (!quiet) sfx.nudge();
    } else if (e.type === 'over') {
      if (!quiet) S.overT = 0.75;
    }
  }
  g.events.length = 0;
}
function updateFx(dt) {
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt; }
  fx.parts = fx.parts.filter((p) => p.life > 0);
  for (const r of fx.rings) { r.r += r.vr * dt; r.life -= dt; }
  fx.rings = fx.rings.filter((r) => r.life > 0);
  for (const f of fx.flashes) f.life -= dt;
  fx.flashes = fx.flashes.filter((f) => f.life > 0);
  for (const t of fx.texts) { t.life -= dt; if (t.vy) t.y += t.vy * dt; }
  for (const r of fx.rails) r.life -= dt;
  fx.rails = fx.rails.filter((r) => r.life > 0);
  if (S.moved > 60) fx.coach = Math.max(0, fx.coach - dt * 3);
  fx.texts = fx.texts.filter((t) => t.life > 0);
  fx.shake = Math.max(0, fx.shake - dt * 60);
  fx.pulse[0] = Math.max(0, fx.pulse[0] - dt * 6); fx.pulse[1] = Math.max(0, fx.pulse[1] - dt * 6);
  fx.scorePunch[0] = Math.max(0, fx.scorePunch[0] - dt * 1.6); fx.scorePunch[1] = Math.max(0, fx.scorePunch[1] - dt * 1.6);
}
function pushTrail(g) {
  const p = g.puck;
  if (g.phase !== 'play') { if (fx.trail.length) fx.trail.shift(); return; }
  fx.trail.push({ x: p.x, y: p.y, sp: Math.hypot(p.vx, p.vy) });
  if (fx.trail.length > 16) fx.trail.shift();
}

// ---------------------------------------------------------------- loop
const DT = 1 / 120;
let acc = 0, last = performance.now();
function simulate(realDt) {
  const g = S.game;
  const quiet = S.state !== 'play';
  if (S.state === 'play' && S.paused) return;
  keyMove(realDt);
  let dt = realDt * S.timeScale;
  if (S.hitstop > 0) { S.hitstop -= realDt; return; }
  acc += dt;
  let n = 0;
  while (acc >= DT && n < 40) {
    step(g, DT); acc -= DT; n++;
    handleEvents(g, quiet);
    if (n % 2 === 0) pushTrail(g);
    if (S.hitstop > 0) { acc = 0; break; }
  }
  if (S.state === 'title' && g.phase === 'over' && g.phaseT > 2) { resetMatch(g); }
  if (S.overT > 0) { S.overT -= realDt; if (S.overT <= 0 && S.state === 'play') finish(g.winner); }
}
function frame(now) {
  const realDt = Math.min(0.05, (now - last) / 1000); last = now;
  simulate(realDt);
  updateFx(S.paused ? 0 : realDt * Math.min(S.timeScale, 4));
  drawFrame(ctx, S.game, fx, { coach: S.state === 'play' && !S.paused ? fx.coach : 0, touch: lastPointer !== 'mouse', flipTop: S.game.mode === '2p', dim: S.state === 'title' ? 0.25 : S.state === 'results' ? 0.15 : 0 });
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- UI
const ICON_SOUND = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16.5 8.5a5 5 0 0 1 0 7"/><path d="M19 6a8.5 8.5 0 0 1 0 12"/></svg>';
const ICON_MUTE = '<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M17 9l5 6M22 9l-5 6"/></svg>';
function muteBtn() { return `<button class="hudbtn r" data-a="mute" aria-label="Sound">${isMuted() ? ICON_MUTE : ICON_SOUND}</button>`; }

function renderUI() {
  S.panel = S.paused ? 'pause' : S.state;
  let h = '';
  if (S.state === 'title') {
    const diffs = LEVELS.map((d) => `<button class="${save.diff === d ? 'sel' : ''}" data-diff="${d}">${LABEL[d]}<span class="st ${save.wins[d] ? 'on' : ''}">&#9733;</span><small>${save.wins[d]}W &middot; ${save.losses[d]}L</small></button>`).join('');
    h = `<div class="scrim vig"><div class="panel">
      <div class="logo"><h1><span class="a">PUCK</span><span class="b">BLITZ</span></h1><p>Neon air hockey &middot; first to 7</p></div>
      <button class="btn play" data-a="play">PLAY</button>
      <div class="diff">${diffs}</div>
      <button class="btn wide pink" data-a="2p">2 Players &middot; one screen</button>
      <div class="stats">Best streak <b>${save.bestStreak}</b> &nbsp;&middot;&nbsp; Hardest shot <b>${save.top}</b> km/h</div>
    </div></div>${muteBtn()}`;
  } else if (S.state === 'play') {
    h = `<button class="hudbtn l" data-a="pause" aria-label="Pause"><i></i><i></i></button>${muteBtn()}`;
    if (S.paused) h += `<div class="scrim dark"><div class="panel"><div class="ptitle">PAUSED</div>
      <button class="btn play" data-a="resume">RESUME</button>
      <div class="row"><button class="btn" data-a="restart">Restart</button><button class="btn" data-a="menu">Menu</button></div></div></div>`;
  } else if (S.state === 'results') {
    const r = S.lastResult, g = S.game;
    let head, cls;
    if (r.mode === 'bot') { head = r.winner === 0 ? 'YOU WIN!' : 'BOT WINS'; cls = r.winner === 0 ? 'p1' : 'p2'; }
    else { head = r.winner === 0 ? 'BLUE WINS!' : 'PINK WINS!'; cls = r.winner === 0 ? 'p1' : 'p2'; }
    const nextIdx = LEVELS.indexOf(r.diff) + 1;
    const next = r.mode === 'bot' && r.winner === 0 && nextIdx < 3 ? LEVELS[nextIdx] : null;
    const badges = r.badges.map((b) => `<div class="badge">&#9733; ${b}</div>`).join('');
    h = `<div class="scrim dark"><div class="panel res">
      <h2 class="${cls}">${head}</h2>
      <div class="score"><span class="a">${r.score[0]}</span><span class="dash">&ndash;</span><span class="b">${r.score[1]}</span></div>
      ${badges}
      <div class="chips"><div class="chip"><b>${Math.round(r.top * 0.045)}</b><span>top km/h</span></div><div class="chip"><b>${r.longest}</b><span>best rally</span></div><div class="chip"><b>${fmtTime(r.time)}</b><span>time</span></div></div>
      <button class="btn play" data-a="rematch">REMATCH</button>
      <div class="row">${next ? `<button class="btn" data-a="next">Try ${LABEL[next]} &#9654;</button>` : ''}<button class="btn" data-a="menu">Menu</button></div>
      <div class="hint">${r.mode === 'bot' ? LABEL[r.diff] + ' bot' : 'first to 7'}${lastPointer === 'mouse' ? ' &middot; space to rematch' : ''}</div>
    </div></div>${muteBtn()}`;
  }
  ui.innerHTML = h;
}
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return m + ':' + String(s).padStart(2, '0'); }

ui.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b) return;
  initAudio(); sfx.click();
  if (b.dataset.diff) { save.diff = b.dataset.diff; store(); renderUI(); return; }
  const a = b.dataset.a;
  if (a === 'play') start({ mode: 'bot', diff: save.diff });
  else if (a === '2p') start({ mode: '2p' });
  else if (a === 'mute') toggleMute();
  else if (a === 'pause' || a === 'resume') togglePause();
  else if (a === 'restart' || a === 'rematch') restart();
  else if (a === 'menu') toTitle();
  else if (a === 'next') { const d = LEVELS[LEVELS.indexOf(S.lastResult.diff) + 1]; start({ mode: 'bot', diff: d }); }
});

// ---------------------------------------------------------------- boot + test hooks
resize();
try { document.fonts.load('700 40px Rajdhani'); document.fonts.load('900 40px Orbitron', 'GOAL!'); } catch { /* old browser */ }
S.game = newDemo();
window.__G = {
  get state() { return S.state; }, get paused() { return S.paused; }, get game() { return S.game; },
  get ui() { return { panel: S.panel }; }, get save() { return save; }, get fx() { return fx; },
  get H() { return H; }, get timeScale() { return S.timeScale; }, set timeScale(v) { S.timeScale = v; },
  get result() { return S.lastResult; },
  start, restart, toTitle, togglePause, toScreen, toTable, view, DIFF, botThink,
  step(n = 1) { for (let i = 0; i < n; i++) simulate(1 / 60); },
};
if (qs.get('play') === '1') {
  const mode = qs.get('mode') === '2p' ? '2p' : 'bot';
  const diff = LEVELS.includes(qs.get('diff')) ? qs.get('diff') : save.diff;
  start({ mode, diff });
} else renderUI();
requestAnimationFrame((t) => { last = t; frame(t); });
// open the audio device while the first frames draw, so the first tap starts sound instantly
setTimeout(() => { try { prepareAudio(); } catch { /* no audio: play on */ } }, 250);
window.addEventListener('pointerdown', () => initAudio(), { capture: true });
