// STRIKE - game state machine, input, UI, save, test hooks.
import { Renderer, THREE } from './render.js';
import { Sim, L, P, isSplit, PIN_SPOTS, ballPath } from './physics.js';
import { gameState } from './scoring.js';
import { SPLITS, BALLS, ballUnlocked, totalStars, unlockText } from './levels.js';
import { FX } from './fx.js';
import { analyseSwipe } from './input.js';
import { searchThrow } from './bot.js';
import * as A from './audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const SAVE_KEY = 'pd.strike';

// ---------- save ----------
let save = { best: 0, strikes: 0, spares: 0, games: 0, stars: {}, ball: 'magenta', muted: false, throws: 0 };
try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) save = { ...save, ...s }; } catch (e) { /* no storage */ }
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ---------- world ----------
const R = new Renderer($('gl'));
const fx = new FX($('fx'));
const sim = new Sim(); sim.rack();
A.setMuted(!!save.muted);

const G = {
  state: 'title',        // title | aim | roll | result | sweep | over
  mode: 'game',          // game | split
  splitIdx: 0, splitBall: 0,
  rolls: [],
  ballX: 0,              // starting spot on the foul line
  aim: { angle: 0, spin: 0, power: 0, kb: false },
  t: 0, stateT: 0, timeScale: 1, hitStop: 0, slow: 0, fast: 1,
  standingBefore: 10, gutterBall: false, streak: 0,
  stats: { strikes: 0, spares: 0, opens: 0 },
  bot: Q.has('bot'), botT: 0,
  lastThrow: null, pinsDrop: 0, sweepY: 1.2, hideFallen: false, fallScale: undefined,
};
window.__G = G;
G.sim = sim; G.R = R;

function skin() { return BALLS.find((b) => b.id === save.ball && ballUnlocked(b, save)) || BALLS[0]; }
R.setBall(skin());

// ---------- UI: title ----------
function buildBalls() {
  const el = $('balls'); el.innerHTML = '';
  for (const b of BALLS) {
    const d = document.createElement('button'); const un = ballUnlocked(b, save);
    d.className = 'bsw' + (b.id === skin().id ? ' sel' : '') + (un ? '' : ' lock');
    d.style.background = `radial-gradient(circle at 35% 30%, #fff8 0, ${b.a} 30%, ${b.b} 100%)`;
    d.title = b.name;
    d.onclick = () => {
      A.initAudio(); A.click();
      if (!un) { $('ballname').textContent = b.name + ' - unlock: ' + unlockText(b); return; }
      save.ball = b.id; persist(); R.setBall(b); buildBalls(); $('ballname').textContent = b.name;
    };
    el.appendChild(d);
  }
  $('ballname').textContent = skin().name;
}
function refreshTitle() {
  buildBalls();
  $('starsTotal').textContent = totalStars(save) ? '★ ' + totalStars(save) + '/' + SPLITS.length * 3 : '';
  $('bestline').textContent = save.games ? 'BEST ' + save.best + '  ·  STRIKES ' + save.strikes : '';
}
function show(id) { for (const p of ['title', 'splits', 'results']) $(p).classList.toggle('hidden', p !== id); $('hud').classList.toggle('hidden', id !== null); }

function pinSvg(pins) {
  let s = '<svg viewBox="-0.55 -0.1 1.1 0.9">';
  for (let n = 1; n <= 10; n++) { const p = PIN_SPOTS[n - 1]; const on = pins.includes(n); s += `<circle cx="${p.x.toFixed(3)}" cy="${(0.72 + (p.z - L.headZ) * 0.95).toFixed(3)}" r="0.075" fill="${on ? '#fff' : 'none'}" stroke="${on ? '#ff2bd6' : 'rgba(255,255,255,0.25)'}" stroke-width="0.025"/>`; }
  return s + '</svg>';
}
function buildSplits() {
  const g = $('splitgrid'); g.innerHTML = '';
  SPLITS.forEach((sp, i) => {
    const st = save.stars[i] || 0, locked = i > 0 && !save.stars[i - 1] && !Q.has('unlock');
    const c = document.createElement('button'); c.className = 'card' + (locked ? ' lock' : '');
    c.innerHTML = pinSvg(sp.pins) + `<div>${i + 1}. ${sp.name}</div><div class="st">${locked ? '🔒' : '★'.repeat(st) + '<span class="off">' + '★'.repeat(3 - st) + '</span>'}</div>`;
    c.onclick = () => { if (locked) return; A.initAudio(); A.click(); start('split', i); };
    g.appendChild(c);
  });
}

$('btnPlay').onclick = () => { A.initAudio(); A.click(); start('game'); };
$('btnSplits').onclick = () => { A.initAudio(); A.click(); buildSplits(); show('splits'); };
$('btnSplitsBack').onclick = () => { A.click(); refreshTitle(); show('title'); };
$('btnAgain').onclick = () => { A.initAudio(); A.click(); start(G.mode, G.splitIdx); };
$('btnNext').onclick = () => { A.click(); start('split', Math.min(SPLITS.length - 1, G.splitIdx + 1)); };
$('btnMenu').onclick = () => { A.click(); goTitle(); };
$('btnHome').onclick = (e) => { e.stopPropagation(); A.click(); goTitle(); };
$('btnMute').onclick = (e) => { e.stopPropagation(); toggleMute(); };
function toggleMute() { save.muted = !save.muted; A.setMuted(save.muted); $('btnMute').classList.toggle('off', save.muted); persist(); }
$('btnMute').classList.toggle('off', !!save.muted);

function goTitle() { if (G.assistSave) { [P.MAG, P.MAG_W] = G.assistSave; G.assistSave = null; } hideGhost(); A.roll(0, true); R.setPath(null); G.pathKey = ''; G.state = 'title'; refreshTitle(); show('title'); sim.rack(); G.hideFallen = false; }

// ---------- game flow ----------
function start(mode, idx = 0) {
  G.mode = mode; G.splitIdx = idx; G.splitBall = 0; G.rolls = []; G.streak = 0; P.SPARE_W = 0;
  G.stats = { strikes: 0, spares: 0, opens: 0 };
  show(null);
  $('board').classList.toggle('hidden', mode !== 'game');
  $('splitbar').classList.toggle('hidden', mode !== 'split');
  newRack(true);
  if (mode === 'split') { $('splitname').textContent = (idx + 1) + '. ' + SPLITS[idx].name; banner(SPLITS[idx].name, 'meh', SPLITS[idx].tip); }
  drawBoard();
  toAim(true);
}
G.start = start;

function newRack(fresh) {
  if (G.mode === 'split' && fresh) sim.rack(SPLITS[G.splitIdx].pins);
  else if (fresh) sim.rack();
  else sim.respot();
  // a fresh rack puts the ball back on the spot the player last used for a first ball (not the spare corner)
  if (fresh && G.homeX !== undefined) G.ballX = G.homeX;
  G.pinsDrop = fresh ? 0.9 : 0; G.hideFallen = false; G.fallScale = undefined;
}

function toAim(snap) {
  G.state = 'aim'; G.stateT = 0; G.aim.kb = false; G.aim.live = false; G.aim.angle = 0; G.aim.spin = 0; G.aim.power = 0; G.aim.speed = 8;
  sim.ball = null; G.timeScale = 1; G.fast = 1; G.slow = 0; G.hitStop = 0;
  G.standingBefore = sim.standing().length; G.gutterBall = false;
  const c = aimCam(); if (snap) R.snapCamera(c.pos, c.look);
  $('hint').classList.toggle('hidden', save.throws >= 3 || G.bot);
  $('speed').style.opacity = 0;
  if (G.mode === 'split') $('splitballs').textContent = '●'.repeat(3 - G.splitBall) + '○'.repeat(G.splitBall);
}

function throwBall(th) {
  if (G.state !== 'aim') return;
  A.initAudio(); A.release();
  const t = { x: G.ballX, ...th }; if (th.x !== undefined) G.ballX = th.x;
  t.x = G.ballX;
  // beginner's luck: a brand-new player's first two full-rack balls get a much wider pocket assist
  // (tools/firstball.mjs: a rough straight-up swipe strikes ~60% instead of ~16%), so the first 10 s usually end in a STRIKE
  G.assistSave = null;
  if (save.throws < 2 && G.mode === 'game' && sim.pins.length === 10 && !G.bot) { G.assistSave = [P.MAG, P.MAG_W]; P.MAG = 8; P.MAG_W = 0.5; }
  // spare assist (tools/spare.mjs): only on spare balls of a 10-frame game, never in split puzzles
  P.SPARE_W = G.mode === 'game' && sim.pins.length < 10 ? 0.3 : 0;
  if (sim.pins.length === 10) G.homeX = t.x;
  sim.throwBall(t); G.lastThrow = t;
  G.state = 'roll'; G.stateT = 0; G.firstHitSeen = false; G.hitSoundT = 0; R.setPath(null); G.pathKey = '';
  save.throws++; $('hint').classList.add('hidden'); hideGhost();
  const kmh = Math.round(t.speed * 3.6);
  $('speed').textContent = kmh + ' km/h' + (Math.abs(t.spin) > 0.1 ? '  ·  HOOK ' + Math.round(Math.abs(t.spin) * 100) + '%' : '');
  $('speed').style.opacity = 1;
}
G.throwBall = throwBall;

function settle() {
  if (G.assistSave) { [P.MAG, P.MAG_W] = G.assistSave; G.assistSave = null; }
  const standing = sim.standing();
  const knocked = G.standingBefore - standing.length;
  G.state = 'result'; G.stateT = 0;
  const wasFresh = G.standingBefore === 10 && (G.mode === 'game');
  if (G.mode === 'game') {
    G.rolls.push(knocked);
    const strike = wasFresh && knocked === 10;
    const spare = !wasFresh && standing.length === 0 && G.standingBefore < 10;
    if (strike) {
      G.streak++; G.stats.strikes++; save.strikes++;
      const names = ['STRIKE!', 'DOUBLE!', 'TURKEY!', 'HAMBONE!', 'FIVE-BAGGER!', 'SIX-PACK!', 'SEVEN!', 'EIGHT!', 'NINE!', 'TEN!', 'ELEVEN!', 'PERFECT!'];
      banner(names[Math.min(G.streak - 1, names.length - 1)], 'strike', G.streak > 1 ? G.streak + ' IN A ROW' : '');
      A.strike(); celebrate(G.streak);
    } else if (spare) {
      G.streak = 0; G.stats.spares++; save.spares++;
      banner('SPARE!', 'spare', ''); A.spare(); const c = R.project(0, 0.3, -18.6); fx.burst(c.x, c.y, 50);
    } else {
      G.streak = 0;
      if (G.gutterBall && knocked === 0) { banner('GUTTER', 'bad', ''); A.sad(); }
      else if (wasFresh && isSplit(standing)) { banner('SPLIT!', 'bad', knocked + ' PINS'); A.sad(); }
      else if (knocked === 0) { banner('MISS', 'bad', ''); A.sad(); }
      else banner(knocked + (knocked === 1 ? ' PIN' : ' PINS'), 'meh', standing.length && !wasFresh ? '' : standing.length ? 'GO FOR THE SPARE' : '');
      if (!wasFresh && standing.length) G.stats.opens++;
    }
    drawBoard();
  } else {
    G.splitBall++;
    if (standing.length === 0) {
      const stars = 4 - G.splitBall;
      banner('CLEARED!', 'strike', '★'.repeat(stars)); A.strike(); celebrate(1);
      for (let i = 0; i < stars; i++) setTimeout(() => A.star(i), 300 + i * 180);
      if ((save.stars[G.splitIdx] || 0) < stars) save.stars[G.splitIdx] = stars;
      G.splitResult = { cleared: true, stars };
    } else if (G.splitBall >= 3) {
      banner('MISSED', 'bad', 'OUT OF BALLS'); A.sad(); G.splitResult = { cleared: false, stars: 0 };
    } else {
      banner(standing.length + ' LEFT', 'meh', (3 - G.splitBall) + (3 - G.splitBall === 1 ? ' BALL LEFT' : ' BALLS LEFT')); A.sad();
      G.splitResult = null;
    }
  }
  persist();
}


function celebrate(streak) {
  const c = R.project(0, 0.3, -18.6);
  fx.confetti(90 + streak * 30); fx.burst(c.x, c.y, 80); fx.ring(c.x, c.y, '#ffe14a', 260); fx.ring(c.x, c.y, '#ff2bd6', 180);
  R.shake = Math.max(R.shake, 1.2);
}

function afterResult() {
  if (G.mode === 'game') {
    const gs = gameState(G.rolls);
    if (gs.over) return finishGame(gs);
    G.state = 'sweep'; G.stateT = 0; G.nextFresh = gs.fresh;
  } else {
    if (G.splitResult) return finishSplit();
    G.state = 'sweep'; G.stateT = 0; G.nextFresh = true; // reset the same puzzle
  }
}

function finishGame(gs) {
  G.state = 'over';
  save.games++; const newBest = gs.total > save.best; if (newBest) save.best = gs.total; persist();
  $('resTitle').textContent = gs.total >= 300 ? 'PERFECT GAME!' : gs.total >= 200 ? 'ON FIRE!' : 'GAME OVER';
  $('resScore').textContent = gs.total;
  $('resBest').textContent = newBest ? 'NEW BEST!' : 'BEST ' + save.best;
  $('resStats').innerHTML = `<div><b>${G.stats.strikes}</b>strikes</div><div><b>${G.stats.spares}</b>spares</div><div><b>${G.stats.opens}</b>open</div>`;
  $('resScore').style.fontSize = '';
  $('resBoard').innerHTML = ''; const b = $('board').cloneNode(true); b.id = ''; b.classList.remove('hidden'); $('resBoard').appendChild(b);
  $('btnAgain').textContent = 'PLAY AGAIN'; $('btnAgain').className = 'big'; $('btnNext').className = 'mid hidden'; G.canNext = false;
  if (newBest && save.games > 1) { A.fanfare(); fx.confetti(160); }
  setTimeout(() => show('results'), 250);
}
function finishSplit() {
  G.state = 'over';
  const r = G.splitResult;
  $('resTitle').textContent = SPLITS[G.splitIdx].name;
  $('resScore').textContent = r.cleared ? '★'.repeat(r.stars) + '☆'.repeat(3 - r.stars) : 'MISSED';
  $('resScore').style.fontSize = 'clamp(40px, min(16vw, 16vh), 110px)';
  $('resBest').textContent = r.cleared ? 'CLEARED ON BALL ' + (4 - r.stars) : 'TIP: ' + SPLITS[G.splitIdx].tip;
  $('resStats').innerHTML = `<div><b>${totalStars(save)}</b>total stars</div>`;
  $('resBoard').innerHTML = '';
  $('btnAgain').textContent = 'RETRY';
  const canNext = r.cleared && G.splitIdx < SPLITS.length - 1;
  $('btnNext').classList.toggle('hidden', !canNext);
  // after a clear, NEXT is the main action; after a miss, RETRY is
  $('btnNext').className = canNext ? 'big' : 'mid hidden'; $('btnAgain').className = canNext ? 'mid' : 'big'; G.canNext = canNext;
  setTimeout(() => show('results'), 250);
}

// ---------- scoreboard ----------
function drawBoard() {
  if (G.mode !== 'game') return;
  const gs = gameState(G.rolls);
  let h = '';
  gs.frames.forEach((f, i) => {
    const marks = i < 9 ? (f.marks.length ? f.marks : ['', '']) : [0, 1, 2].map((k) => f.marks[k] || '');
    if (i < 9 && marks.length === 1) marks.push('');
    const cls = (m) => (m === 'X' ? 'X' : m === '/' ? 'S' : '');
    h += `<div class="fr${i === 9 ? ' ten' : ''}${i === gs.frame && !gs.over ? ' cur' : ''}"><div class="n">${i + 1}</div><div class="m">${marks.map((m) => `<span class="${cls(m)}">${m}</span>`).join('')}</div><div class="s">${f.score ?? ''}</div></div>`;
  });
  $('board').innerHTML = h;
}

let bannerTimer = 0;
function banner(text, cls, sub) {
  const b = $('banner'), s = $('sub');
  b.className = ''; s.className = ''; void b.offsetWidth;
  b.textContent = text; b.className = 'show ' + cls;
  s.textContent = sub || ''; if (sub) s.className = 'show';
  clearTimeout(bannerTimer);
}

// ---------- cameras ----------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
function aimCam() {
  const portrait = R.h > R.w;
  return portrait ? { pos: V(G.ballX * 0.4, 1.75, 2.5), look: V(G.ballX * 0.12, 0, -7.5) } : { pos: V(G.ballX * 0.4, 1.3, 3.0), look: V(G.ballX * 0.12, 0, -8) };
}
function pinCam() { return { pos: V(0, 0.85, -15.0), look: V(0, 0.1, -18.7) }; }

// ---------- input ----------
const ptr = { down: false, mode: null, pts: [], sx: 0, sy: 0, bx: 0 };
const glEl = R.r.domElement;
function pxPerMeter() { const a = R.project(-0.5, 0, -0.3), b = R.project(0.5, 0, -0.3); return Math.max(40, b.x - a.x); }
function onDown(e) {
  if (e.target.closest && e.target.closest('button')) return;
  A.initAudio();
  if (G.state === 'roll' || G.state === 'result' || G.state === 'sweep') { G.fast = 4; return; }
  if (G.state !== 'aim' || G.bot) return;
  G.stateT = 0; ptr.down = true; ptr.mode = null; ptr.sx = e.clientX; ptr.sy = e.clientY; ptr.bx = G.ballX;
  ptr.pts = [{ x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() }];
  fx.trail = [];
}
function onMove(e) {
  if (!ptr.down || G.state !== 'aim') return;
  const dx = e.clientX - ptr.sx, dy = e.clientY - ptr.sy;
  if (!ptr.mode && Math.hypot(dx, dy) > 10) ptr.mode = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'move' : dy < 0 ? 'swipe' : 'move';
  if (ptr.mode === 'move') { G.ballX = Math.max(-0.42, Math.min(0.42, ptr.bx + dx / pxPerMeter())); }
  else if (ptr.mode === 'swipe') {
    // on a slow device the browser batches moves into one event per frame: use every coalesced sample
    const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    for (const c of evs) { const p = { x: c.clientX, y: c.clientY, t: c.timeStamp || performance.now() }; ptr.pts.push(p); fx.trail.push(p); }
    const r = analyseSwipe(ptr.pts, R.h); if (r) { G.aim.angle = r.angle; G.aim.spin = r.spin; G.aim.speed = r.speed; G.aim.live = true; }
  }
}
function onUp(e) {
  if (!ptr.down) return; ptr.down = false; G.aim.live = false;
  // a fast flick on a laggy frame can arrive as down -> up with no move in between: judge it from the release point
  if (!ptr.mode && G.state === 'aim') { const dx = e.clientX - ptr.sx, dy = e.clientY - ptr.sy; if (-dy > R.h * 0.08 && Math.abs(dx) < -dy * 1.2) ptr.mode = 'swipe'; }
  if (ptr.mode === 'swipe' && G.state === 'aim') {
    const up = { x: e.clientX, y: e.clientY, t: e.timeStamp || performance.now() };
    if (ptr.pts.length < 2) ptr.pts.push({ x: (ptr.sx + up.x) / 2, y: (ptr.sy + up.y) / 2, t: (ptr.pts[0].t + up.t) / 2 });
    ptr.pts.push(up);
    const r = analyseSwipe(ptr.pts, R.h);
    if (r) throwBall({ angle: r.angle, speed: r.speed, spin: r.spin });
  }
}
glEl.addEventListener('pointerdown', onDown); window.addEventListener('pointermove', onMove); window.addEventListener('pointerup', onUp); window.addEventListener('pointercancel', onUp);
$('hud').addEventListener('pointerdown', onDown);

const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyM') toggleMute();
  if (G.state === 'title' && (e.code === 'Space' || e.code === 'Enter')) { A.initAudio(); start('game'); return; }
  if (G.state === 'over' && (e.code === 'Space' || e.code === 'Enter')) { if (G.mode === 'split' && G.canNext) start('split', G.splitIdx + 1); else start(G.mode, G.splitIdx); return; }
  if (['roll', 'result', 'sweep'].includes(G.state) && e.code === 'Space') G.fast = 4;
  if (G.state === 'aim' && !G.bot) {
    if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'Space'].includes(e.code)) { G.aim.kb = true; e.preventDefault(); A.initAudio(); }
    if (e.code === 'Space' && !G.aim.charging) { G.aim.charging = true; G.aim.power = 0; }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Space' && G.aim.charging && G.state === 'aim') {
    G.aim.charging = false;
    throwBall({ angle: G.aim.angle, speed: 5.5 + G.aim.power * 5.3, spin: G.aim.spin });
  }
});
function keyAim(dt) {
  if (keys.ArrowLeft) G.ballX = Math.max(-0.42, G.ballX - dt * 0.5);
  if (keys.ArrowRight) G.ballX = Math.min(0.42, G.ballX + dt * 0.5);
  if (keys.KeyA) G.aim.angle = Math.max(-0.05, G.aim.angle - dt * 0.02);
  if (keys.KeyD) G.aim.angle = Math.min(0.05, G.aim.angle + dt * 0.02);
  if (keys.KeyQ) G.aim.spin = Math.max(-1, G.aim.spin - dt * 1.2);
  if (keys.KeyE) G.aim.spin = Math.min(1, G.aim.spin + dt * 1.2);
  if (G.aim.charging) G.aim.power = Math.min(1, G.aim.power + dt * 1.1);
  if (G.aim.kb) $('speed').textContent = 'AIM ' + (G.aim.angle * 1000).toFixed(0) + '  HOOK ' + Math.round(G.aim.spin * 100) + '%' + (G.aim.charging ? '  POWER ' + Math.round(G.aim.power * 100) + '%' : '  (hold SPACE)'), $('speed').style.opacity = 1;
}

// ---------- onboarding ghost finger ----------
// Shown over the ball for the first throws, and again whenever the player idles on the aim screen.
function updateGhost() {
  const el = $('ghost');
  const want = G.state === 'aim' && !G.bot && !ptr.down && !G.aim.kb && G.pinsDrop === 0 && (save.throws < 3 || G.stateT > 6);
  el.classList.toggle('hidden', !want);
  if (!want) return;
  const p = R.project(G.ballX, L.ballR, -0.3);
  el.style.transform = 'translate(' + p.x.toFixed(0) + 'px,' + Math.min(p.y, R.h - 70).toFixed(0) + 'px)';
}
function hideGhost() { $('ghost').classList.add('hidden'); }

// ---------- bot ----------
let botSeed = 1;
function botThrow() {
  const r = searchThrow(sim, { n: 90, seed: botSeed++ });
  const t = r.throw; const skill = +(Q.get('skill') || 1);
  const j = { x: t.x + (Math.random() - 0.5) * 0.03 / skill, angle: t.angle + (Math.random() - 0.5) * 0.0016 / skill, speed: t.speed, spin: t.spin };
  G.ballX = Math.max(-0.42, Math.min(0.42, j.x));
  throwBall(j);
}
G.botThrow = botThrow;
G.bestThrow = () => searchThrow(sim, { n: 120, seed: botSeed++ });

// ---------- sim events -> juice ----------
function handleEvents() {
  for (const ev of sim.events) {
    if (ev.type === 'first') {
      const pw = Math.hypot(sim.ball.vx, sim.ball.vz);
      G.hitStop = 0.07; G.slow = G.standingBefore >= 6 ? 0.55 : 0.25; R.shake = Math.max(R.shake, 0.6 + pw * 0.08);
      A.crash(pw); const c = R.project(ev.x, 0.15, ev.z); fx.sparks(c.x, c.y, 26, undefined, 1.3); fx.ring(c.x, c.y, '#fff', 120);
    } else if (ev.type === 'hit') {
      if (G.t - G.hitSoundT > 0.025 && ev.power > 0.3) { A.pinHit(ev.power); G.hitSoundT = G.t; }
      if (ev.power > 1.2) { const c = R.project(ev.x, 0.15, ev.z); fx.sparks(c.x, c.y, Math.min(10, 2 + ev.power * 1.5)); R.shake = Math.min(1.6, R.shake + 0.08); }
    } else if (ev.type === 'gutter') { G.gutterBall = true; A.gutter(); }
    else if (ev.type === 'pit') { A.thud(); }
    else if (ev.type === 'fall') { if (G.t - G.hitSoundT > 0.03) { A.pinHit(0.8); G.hitSoundT = G.t; } }
    else if (ev.type === 'wall') { A.pinHit(ev.power * 0.6); }
  }
  sim.events.length = 0;
}

// ---------- main loop ----------
const STEP = 1 / 240;
let acc = 0, last = performance.now();
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.held) tick(rdt);
  requestAnimationFrame(frame);
}
function tick(rdt) {
  G.t += rdt; G.stateT += rdt;
  let ts = 1;
  if (G.hitStop > 0) { G.hitStop -= rdt; ts = 0.06; }
  else if (G.slow > 0) { G.slow -= rdt; ts = 0.4; }
  ts *= G.fast;
  const dt = rdt * ts;

  if (G.state === 'title') {
    const a = G.t * 0.25;
    if (R.h > R.w) R.camera(V(Math.sin(a) * 0.25, 0.75 + Math.sin(a * 0.7) * 0.06, -15.9 + Math.cos(a) * 0.2), V(0, 1.0, -18.9), 3, rdt);
    else R.camera(V(Math.sin(a) * 1.3, 0.55 + Math.sin(a * 0.7) * 0.1, -15.6 + Math.cos(a) * 0.4), V(0, 0.18, -18.7), 3, rdt);
    R.sync(sim, { x: Math.sin(G.t * 0.8) * 0.3, z: -16.2, hidden: true }, rdt, {});
  } else if (G.state === 'aim') {
    keyAim(rdt);
    if (G.pinsDrop > 0) { G.pinsDrop = Math.max(0, G.pinsDrop - rdt * 3.2); }
    const c = aimCam(); R.camera(c.pos, c.look, 5, rdt);
    const showAim = G.aim.kb || G.aim.live;
    // predicted line (recomputed only when the aim changes)
    const key = showAim ? [G.ballX, G.aim.angle, G.aim.spin, G.aim.charging ? 5.5 + G.aim.power * 5.3 : G.aim.speed || 8].map((v) => v.toFixed(3)).join() : '';
    if (key !== G.pathKey) { G.pathKey = key; R.setPath(showAim ? ballPath({ x: G.ballX, angle: G.aim.angle, spin: G.aim.spin, speed: G.aim.charging ? 5.5 + G.aim.power * 5.3 : G.aim.speed || 8 }) : null); }
    R.sync(sim, { x: G.ballX, z: -0.3, y: L.ballR + Math.abs(Math.sin(G.t * 3)) * 0.004, spinVis: 0.3 }, rdt, { aim: null, pinsDrop: dropEase(G.pinsDrop) });
    updateGhost();
    if (G.bot) { G.botT += rdt; if (G.botT > 0.5 && G.pinsDrop === 0) { G.botT = 0; botThrow(); } }
  } else if (G.state === 'roll') {
    // once the ball is in the pit the pin action is over: run the settling pins at 3x so the next ball comes quickly
    const settleFast = sim.ballOut >= 0 && sim.t - sim.ballOut > 0.5 && G.slow <= 0 ? 3 : 1;
    acc += dt * settleFast; let n = 0;
    while (acc >= STEP && n < 2000) { sim.step(STEP); acc -= STEP; n++; }
    handleEvents();
    const b = sim.ball;
    const u = smooth((-b.z - 8) / 6.5);
    const follow = { pos: V(b.x * 0.6, 0.72, Math.max(b.z, -12.5) + 2.4), look: V(b.x * 0.35, 0.08, Math.max(b.z, -12) - 7) };
    const pc = pinCam();
    R.camera(follow.pos.lerp(pc.pos, u), follow.look.lerp(pc.look, u), 6, rdt);
    R.sync(sim, !b.inPit ? { x: b.x, z: b.z, y: b.y, gutter: b.gutter, spinVis: b.spin } : { hidden: true }, dt, {});
    A.roll(b.active ? Math.hypot(b.vx, b.vz) : 0, !b.gutter);
    if (sim.t > 1 && sim.settled()) { A.roll(0, true); settle(); }
    else if (sim.t > 12) { A.roll(0, true); settle(); }
  } else if (G.state === 'result') {
    acc += dt; while (acc >= STEP) { sim.step(STEP); acc -= STEP; } sim.events.length = 0;
    const pc = pinCam(); R.camera(V(pc.pos.x, pc.pos.y - 0.1, pc.pos.z - 0.5), pc.look, 2, rdt);
    R.sync(sim, { hidden: true }, dt, {});
    if (G.stateT * G.fast > 1.3) afterResult();
  } else if (G.state === 'sweep') {
    // sweep bar comes down, fallen pins vanish, bar lifts, rack resets
    const T = G.stateT * Math.min(G.fast, 2);
    G.sweepY = T < 0.25 ? 1.2 - T / 0.25 * 1.05 : T < 0.55 ? 0.15 : Math.min(1.2, 0.15 + (T - 0.55) / 0.25 * 1.05);
    const fall = T < 0.25 ? 1 : Math.max(0, 1 - (T - 0.25) / 0.2);
    if (T > 0.3 && !G.whooshed) { G.whooshed = true; A.whoosh(); }
    const pc = pinCam(); R.camera(pc.pos, pc.look, 3, rdt);
    R.sync(sim, { hidden: true }, rdt, { sweepY: G.sweepY, fallScale: fall, hideFallen: fall <= 0 });
    if (T > 0.8) {
      G.whooshed = false; R.sync(sim, { hidden: true }, 0, { sweepY: 1.2 });
      newRack(G.nextFresh); drawBoard(); toAim(false);
    }
  }
  if (G.noRender) return;
  fx.update(rdt); fx.draw();
  R.render();
}
function smooth(x) { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }
function dropEase(d) { // 0.9 -> 0 with a little bounce at the end
  if (d <= 0) return 0; const t = 1 - d / 0.9; return t < 0.8 ? 0.9 * (1 - t / 0.8) * (1 - t / 0.8) : Math.sin((t - 0.8) / 0.2 * Math.PI) * 0.04;
}

window.addEventListener('resize', () => { R.resize(); fx.resize(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) A.roll(0, true); });

// headless helpers: advance the game N seconds without rendering frames in real time
G.advance = (sec, step = 1 / 60) => { G.noRender = true; for (let t = 0; t < sec; t += step) tick(step); G.noRender = false; };
G.gameState = () => gameState(G.rolls);
// test hook: draw one frame (with real-time FX advanced by sec) and stop the render loop so screenshots are cheap
G.hold = (sec = 0) => { for (let t = 0; t < sec; t += 1 / 30) { G.noRender = true; tick(1 / 30); } G.noRender = false; G.held = true; fx.update(0); fx.draw(); R.render(); };
G.release = () => { G.held = false; };

// ---------- boot ----------
refreshTitle();
if (Q.has('play')) start('game');
else if (Q.has('split')) start('split', Math.max(0, Math.min(SPLITS.length - 1, +Q.get('split') || 0)));
else show('title');
requestAnimationFrame(frame);
