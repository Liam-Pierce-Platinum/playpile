// PUTT PARK - game state, input, screens, race mode, test hooks.
import { HOLES } from './holes.js';
import { buildWorld, newBall, stepBall, shootBall, DT, R, RAIL, CUP_R } from './physics.js';
import { plan, planSync } from './bot.js';
import { Renderer, makeView, BALL_COLORS } from './render.js';
import { Audio } from './audio.js';

const qs = new URLSearchParams(location.search);
const cv = document.getElementById('c');
const ui = document.getElementById('ui');
const R_ = new Renderer(cv);

// ------------------------------------------------------------------ save
const KEY = 'pd.mini-golf';
let save = { best: {}, stars: {}, muted: false, tut: false, races: 0, wins: 0, skin: 0 };
try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s) save = { ...save, ...s }; } catch (e) { /* no storage */ }
function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* no storage */ } }
Audio.muted = save.muted;

const totalStars = () => Object.values(save.stars).reduce((a, b) => a + b, 0);
const unlocked = (i) => i === 0 || save.best[i] != null || save.best[i - 1] != null;
const nextHole = () => { for (let i = 0; i < HOLES.length; i++) if (save.best[i] == null) return i; return 0; };

const BOTS = [
  { tag: 'PIP', sa: 0.1, sp: 0.2, think: [1.0, 1.9] },
  { tag: 'DOT', sa: 0.06, sp: 0.12, think: [0.8, 1.5] },
  { tag: 'ACE', sa: 0.035, sp: 0.07, think: [0.6, 1.2] },
];

// Ball skins, unlocked by total stars (replay goal). c = colour, p = pattern for the renderer.
const SKINS = [
  { name: 'Classic', need: 0, c: '#ffffff' },
  { name: 'Lemon', need: 4, c: '#ffe14d' },
  { name: 'Lime', need: 9, c: '#8dff6a', p: 'stripe' },
  { name: 'Grape', need: 15, c: '#b98cff', p: 'dots' },
  { name: 'Lava', need: 22, c: '#ff6a3d', p: 'stripe' },
  { name: 'Starry', need: 30, c: '#3b4a8f', p: 'star' },
  { name: 'Eight', need: 40, c: '#22252e', p: 'eight' },
  { name: 'Rainbow', need: 50, c: '#ff5fa2', p: 'rainbow' },
];
const skinOK = (k) => totalStars() >= SKINS[k].need;
const curSkin = () => SKINS[skinOK(save.skin | 0) ? save.skin | 0 : 0];
const buzz = (ms) => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) { /* no haptics */ } };

// ------------------------------------------------------------------ state
const S = {
  screen: 'title', mode: 'attract', holeIdx: 0, world: null, t: 0, rt: 0,
  shake: 0, hitstop: 0, parts: [], floats: [], balls: [], player: null, aim: null,
  bumpFlash: [], portalFlash: [], flagLift: 0, speed: 1, doneAt: 0, round: {}, race: null, syncBots: false,
  kb: { on: false, ang: 0, pow: 0.5 }, idle: 0,
};

function capFor(w) { return w.par + 4; }
function scoreName(strokes, par) {
  if (strokes === 1) return 'HOLE IN ONE!';
  const d = strokes - par;
  return d <= -3 ? 'ALBATROSS!' : d === -2 ? 'EAGLE!' : d === -1 ? 'BIRDIE!' : d === 0 ? 'PAR' : d === 1 ? 'BOGEY' : d === 2 ? 'DOUBLE BOGEY' : '+' + d;
}
function starsFor(strokes, par, capped) { if (capped) return 0; const d = strokes - par; return strokes === 1 || d < 0 ? 3 : d === 0 ? 2 : d <= 2 ? 1 : 0; }

// ------------------------------------------------------------------ layout
let cssW = 0, cssH = 0, dpr = 1;
function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cssW = window.innerWidth; cssH = window.innerHeight;
  cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
  R_.dpr = dpr;
  if (S.world) setView();
}
function setView() {
  const hud = S.screen === 'title' ? 12 : 60;
  const pad = { t: hud * dpr, b: 14 * dpr, l: 14 * dpr, r: 14 * dpr };
  S.view = makeView(cv.width, cv.height, S.world.camBounds, pad);
  R_.setWorld(S.world, S.view);
}
window.addEventListener('resize', () => { resize(); });

// ------------------------------------------------------------------ holes
function mkBall(color, tag, ghost) {
  const w = S.world;
  return { ball: newBall(w.tee[0], w.tee[1]), strokes: 0, color, tag, ghost, done: false, capped: false, trail: [], sinkT: 0, hidden: false, waterT: 0, finishT: 0 };
}
function startHole(i, mode) {
  S.holeIdx = i; S.mode = mode || S.mode;
  S.world = buildWorld(HOLES[i], i);
  S.t = 0; S.acc = 0; S.idle = 0; S.hintG = null; S.parts = []; S.floats = []; S.aim = null; S.flagLift = 0; S.speed = 1; S.doneAt = 0; S.hitstop = 0;
  S.bumpFlash = S.world.bumpers.map(() => 0); S.portalFlash = S.world.portals.map(() => 0);
  S.balls = [];
  if (S.mode === 'attract') {
    const B = mkBall('#ffffff', null, false); B.bot = { ...BOTS[2], sa: 0.004, sp: 0.02 }; S.balls.push(B); S.player = null;
    scheduleBot(B, 0.6);
  } else {
    const sk = curSkin(); S.player = mkBall(sk.c, S.mode === 'race' ? 'YOU' : null, false); S.player.pulse = true; S.player.skin = sk;
    if (S.mode === 'race') BOTS.forEach((b, k) => { const B = mkBall(BALL_COLORS[k + 1], b.tag, true); B.bot = b; S.balls.push(B); scheduleBot(B); });
    S.balls.push(S.player);
  }
  S.kb.ang = Math.atan2(S.world.cup[1] - S.world.tee[1], S.world.cup[0] - S.world.tee[0]); S.kb.pow = 0.5;
  setView();
}
let planSeq = 0;
const workers = [];
let workerOK = typeof Worker !== 'undefined' && !qs.get('noworker');
function getWorker(k) {
  if (!workerOK) return null;
  if (!workers[k]) {
    try {
      const wk = new Worker(new URL('./botworker.js', import.meta.url), { type: 'module' });
      wk.onmessage = (e) => { for (const B of S.balls) if (B.planId === e.data.id) { B.planRes = e.data.r; B.planGen = null; } };
      wk.onerror = () => { workerOK = false; for (const B of S.balls) if (B.bot && !B.planRes && !B.done) B.planGen = plan(S.world, B.ball, B.shotAt); };
      workers[k] = wk;
    } catch (e) { workerOK = false; return null; }
  }
  return workers[k];
}
function scheduleBot(B, delay) {
  const [a, b] = B.bot.think;
  B.shotAt = S.t + (delay ?? a + Math.random() * (b - a));
  B.planRes = null; B.planGen = null; B.planId = ++planSeq;
  const wk = S.syncBots ? null : getWorker(S.balls.indexOf(B) % 3);
  if (wk) wk.postMessage({ id: B.planId, hole: S.holeIdx, ball: { ...B.ball }, t0: B.shotAt });
  else B.planGen = plan(S.world, B.ball, B.shotAt);
}

// ------------------------------------------------------------------ shooting + events
function doShoot(B, ang, power) {
  if (!B.ball.rest || B.done || B.ball.sunk) return false;
  shootBall(B.ball, ang, power);
  B.strokes++; B.trail = [];
  if (B === S.player) {
    Audio.putt(power);
    S.shake = Math.max(S.shake, 2 + power * 7);
    for (let k = 0; k < 10; k++) {
      const a = ang + Math.PI + (Math.random() - 0.5) * 1.6, sp = 60 + Math.random() * 140 * (0.4 + power);
      S.parts.push({ x: B.ball.x, y: B.ball.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.4, max: 0.4, c: Math.random() < 0.5 ? '#c8f5a4' : '#5fbf45', s: 2.5, drag: 4 });
    }
    S.parts.push({ k: 'ring', x: B.ball.x, y: B.ball.y, r0: R, r1: 26, life: 0.25, max: 0.25, c: '#ffffff' });
    buzz(8 + Math.round(power * 18)); S.idle = 0;
    if (!save.tut) { save.tut = true; persist(); }
  }
  updHud();
  if (B === S.player) popChip();
  return true;
}

function burst(x, y, n, cols, sp = 160, life = 0.5, s = 3) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.3 + Math.random());
    S.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, c: cols[(Math.random() * cols.length) | 0], s, drag: 3 });
  }
}

function onEvent(B, e) {
  const me = B === S.player, loud = me ? 1 : 0;
  switch (e.type) {
    case 'wall': case 'blade':
      if (loud) { e.type === 'blade' ? Audio.blade(e.p) : Audio.wall(e.p); }
      if (e.p > 250) { S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 3, r1: 14 + e.p / 60, life: 0.22, max: 0.22, c: '#ffffff' }); burst(e.x, e.y, 3, ['#fff', '#fffbe0'], e.p * 0.25, 0.25, 2); }
      if (me && e.p > 700) S.shake = Math.max(S.shake, 3);
      break;
    case 'bumper':
      if (loud) Audio.bumper();
      if (e.i != null) S.bumpFlash[e.i] = 1;
      burst(e.x, e.y, 8, ['#ff4f98', '#ffd0e6', '#fff'], 220, 0.35, 2.5);
      if (me) S.shake = Math.max(S.shake, 4);
      break;
    case 'sand':
      if (loud) Audio.sand();
      burst(e.x, e.y, 10, ['#f6dc95', '#e2bf6a'], 120, 0.5, 3);
      break;
    case 'portal':
      if (loud) Audio.portal();
      S.portalFlash[e.i] = 1;
      burst(e.x, e.y, 10, ['#d9b8ff', '#fff'], 150, 0.4, 2.5); burst(e.x2, e.y2, 14, ['#d9b8ff', '#fff'], 200, 0.45, 2.5);
      break;
    case 'lip':
      if (loud) Audio.lip();
      S.floats.push({ text: 'LIP OUT!', x: e.x, y: e.y, life: 0.9, max: 0.9, size: 16, c: '#ffd23f' });
      break;
    case 'splash':
      if (loud) Audio.splash();
      for (let k = 0; k < 3; k++) S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: 4 + k * 6, r1: 30 + k * 10, life: 0.6 + k * 0.15, max: 0.6 + k * 0.15, c: '#e6f7ff' });
      burst(e.x, e.y, 16, ['#bfe9ff', '#ffffff', '#5cc0ff'], 180, 0.6, 3);
      B.waterT = 0.9; B.hidden = true; B.strokes++;
      if (me) { buzz(40); S.shake = Math.max(S.shake, 5); S.floats.push({ text: 'SPLASH! +1', x: e.x, y: e.y, life: 1.1, max: 1.1, size: 20, c: '#9fe1ff' }); updHud(); }
      break;
    case 'sink': {
      B.done = true; B.finishT = S.t; B.sinkT = 0;
      if (me || S.mode === 'attract') {
        const par = S.world.par, name = scoreName(B.strokes, par), d = B.strokes - par;
        const big = B.strokes === 1 || d < 0;
        if (me) { Audio.sink(big); buzz(big ? [30, 40, 60] : 35); }
        S.hitstop = me ? 0.16 : 0.08; S.shake = Math.max(S.shake, big ? 12 : 7); S.flagLift = 1;
        const cols = ['#ff3b4f', '#ffd23f', '#46d3ff', '#7ee26a', '#ff8fd0', '#ffffff'];
        for (let k = 0; k < (big ? 110 : 60); k++) {
          const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * (big ? 520 : 340);
          S.parts.push({ k: 'conf', x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1.4 + Math.random() * 0.8, max: 2, c: cols[k % cols.length], s: 3 + Math.random() * 2.5, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 18, drag: 2.2 });
        }
        S.parts.push({ k: 'ring', x: e.x, y: e.y, r0: CUP_R, r1: 70, life: 0.5, max: 0.5, c: '#ffffff' });
        if (me) S.floats.push({ text: name, x: cssW / 2, y: cssH * 0.36, screen: true, big: true, life: 1.6, max: 1.6, size: Math.min(64, cssW / 9), c: big ? '#ffd23f' : '#ffffff', stroke: '#1b2440' });
      } else {
        Audio.tone && loud === 0 && Audio.tone(700, 0.08, { type: 'triangle', vol: 0.06 });
        const nIn = S.floats.filter((f) => f.ghostIn && f.life > 0.2).length;
        S.floats.push({ text: B.tag + ' IN!', ghostIn: true, x: e.x, y: e.y - nIn * 22, life: 1.2, max: 1.2, size: 14, c: B.color });
      }
      if (me) { S.doneAt = S.rt; updHud(); }
      break;
    }
    case 'rest':
      afterRest(B);
      break;
  }
}

function afterRest(B) {
  if (B.done) return;
  const cap = capFor(S.world);
  if (B.strokes >= cap) {
    B.done = true; B.capped = true; B.strokes = cap + 1; B.finishT = S.t; B.hidden = false;
    if (B === S.player) { Audio.fail(); S.doneAt = S.rt; S.floats.push({ text: 'OUT OF STROKES', x: cssW / 2, y: cssH * 0.36, screen: true, big: true, life: 1.4, max: 1.4, size: Math.min(44, cssW / 12), c: '#ff9a9a' }); updHud(); }
    return;
  }
  if (B.bot) {
    // knocked by a windmill blade while waiting to putt: putt as soon as the new plan is ready,
    // otherwise a ball resting in a blade's sweep re-thinks forever and never shoots
    const knocked = B.schedStrokes === B.strokes;
    // nudged a little: keep the plan that is ready or still being worked out, and putt the moment it is
    if (knocked) B.shotAt = S.t;
    else scheduleBot(B);
    B.schedStrokes = B.strokes;
  }
  if (B === S.player) S.kb.ang = Math.atan2(S.world.cup[1] - B.ball.y, S.world.cup[0] - B.ball.x);
}

// ------------------------------------------------------------------ simulation tick
function tick(dt) {
  // dt is simulated seconds
  // fixed-step accumulator: the same game speed at 30, 60, 120 or 144 Hz
  S.acc = (S.acc || 0) + dt;
  let steps = Math.floor(S.acc / DT + 1e-6);
  S.acc = Math.max(0, S.acc - steps * DT);
  if (steps > 60) { steps = 60; S.acc = 0; }
  const evs = [];
  while (steps-- > 0) {
    for (const B of S.balls) {
      if (B.done || B.waterT > 0) continue;
      evs.length = 0;
      stepBall(S.world, B.ball, S.t, evs);
      for (const e of evs) onEvent(B, e);
    }
    S.t += DT;
    // ghosts / attract bot shoot on their schedule
    for (const B of S.balls) {
      if (!B.bot || B.done || !B.ball.rest || B.waterT > 0) continue;
      if (B.planRes && S.t >= B.shotAt) {
        const p = B.planRes, g = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
        doShoot(B, p.ang + g() * B.bot.sa, Math.max(0.05, Math.min(1, p.power * (1 + g() * B.bot.sp))));
        B.planRes = null; B.planGen = null;
      }
    }
  }
  // water respawns
  for (const B of S.balls) {
    if (B.waterT > 0) {
      B.waterT -= dt;
      if (B.waterT <= 0) {
        const lx = B.ball.lieX, ly = B.ball.lieY;
        B.ball = newBall(lx, ly); B.hidden = false; B.trail = [];
        S.parts.push({ k: 'ring', x: lx, y: ly, r0: 2, r1: 20, life: 0.3, max: 0.3, c: '#fff' });
        afterRest(B);
      }
    }
    if (B.ball.sunk) B.sinkT += dt;
    if (!B.ball.rest) { B.spin = (B.spin || 0) + Math.hypot(B.ball.vx, B.ball.vy) * dt; B.dir = Math.atan2(B.ball.vy, B.ball.vx); }
    if (!B.ball.rest && !B.ball.sunk && !B.hidden) { B.trail.push([B.ball.x, B.ball.y]); if (B.trail.length > 14) B.trail.shift(); }
    else if (B.trail.length) B.trail.shift();
  }
}

function runBotPlanning(budgetMs) {
  const t0 = performance.now();
  for (const B of S.balls) {
    if (!B.bot || B.planRes || B.done) continue;
    if (S.syncBots) { B.planRes = planSync(S.world, B.ball, B.shotAt); B.planGen = null; continue; }
    if (!B.planGen) continue;
    for (;;) {
      const r = B.planGen.next();
      if (r.done) { B.planRes = r.value; break; }
      if (!S.syncBots && performance.now() - t0 > budgetMs) return;
    }
  }
}

function updateFx(dt) {
  S.shake = Math.max(0, S.shake - dt * 40);
  S.flagLift = Math.max(0, S.flagLift - dt * 0.8);
  for (let i = 0; i < S.bumpFlash.length; i++) S.bumpFlash[i] = Math.max(0, S.bumpFlash[i] - dt * 4);
  for (let i = 0; i < S.portalFlash.length; i++) S.portalFlash[i] = Math.max(0, S.portalFlash[i] - dt * 2.5);
  for (const p of S.parts) {
    p.life -= dt;
    if (p.vx != null) { const dr = Math.exp(-(p.drag || 0) * dt); p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt; }
    if (p.vr) p.rot += p.vr * dt;
  }
  S.parts = S.parts.filter((p) => p.life > 0);
  for (const f of S.floats) f.life -= dt;
  S.floats = S.floats.filter((f) => f.life > 0);
}

// ------------------------------------------------------------------ game flow per frame
function flow() {
  if (S.mode === 'attract') {
    const B = S.balls[0];
    if (B.done && S.rt - (B.doneRt || (B.doneRt = S.rt)) > 1.6) { attractNext(); }
    return;
  }
  if (S.screen !== 'play') return;
  const P = S.player;
  if (!P.done) return;
  if (S.mode === 'solo') {
    if (S.rt - S.doneAt > 1.15) showResult();
  } else if (S.mode === 'race') {
    const all = S.balls.every((B) => B.done);
    if (!all) {
      S.speed = 8; if (!S.waitShown) { S.waitShown = true; showWait(); }
      if (S.t - P.finishT > 40) for (const B of S.balls) if (!B.done) { B.done = true; B.capped = true; B.strokes = capFor(S.world) + 1; B.finishT = S.t; }
    }
    else if (S.rt - S.doneAt > 1.0 || S.waitShown) { S.speed = 1; showRaceHole(); }
  }
}

let attractList = [2, 11, 4, 8, 16, 7];
function attractNext() { const i = attractList.shift(); attractList.push(i); startHole(i, 'attract'); }

// ------------------------------------------------------------------ aiming
function guide(w, b, ang, len) {
  let x = b.x, y = b.y, dx = Math.cos(ang), dy = Math.sin(ang), L = 0, bounces = 0;
  const pts = [[x, y]], rr = R + RAIL;
  while (L < len) {
    x += dx * 4; y += dy * 4; L += 4;
    let nx = 0, ny = 0, hit = false;
    for (const s of w.segs) {
      if (x < s.x0 || x > s.x1 || y < s.y0 || y > s.y1) continue;
      const ex = s.bx - s.ax, ey = s.by - s.ay, l2 = ex * ex + ey * ey;
      let t = l2 ? ((x - s.ax) * ex + (y - s.ay) * ey) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const px = x - s.ax - ex * t, py = y - s.ay - ey * t, d = Math.hypot(px, py);
      if (d < rr) { nx = px / d; ny = py / d; x += nx * (rr - d); y += ny * (rr - d); hit = true; }
    }
    for (const bu of w.bumpers) {
      const px = x - bu.x, py = y - bu.y, d = Math.hypot(px, py);
      if (d < bu.r + R) { nx = px / d; ny = py / d; x = bu.x + nx * (bu.r + R); y = bu.y + ny * (bu.r + R); hit = true; }
    }
    if (hit) { pts.push([x, y]); if (++bounces > 1) break; const dn = dx * nx + dy * ny; dx -= 2 * dn * nx; dy -= 2 * dn * ny; }
    if (Math.hypot(x - w.cup[0], y - w.cup[1]) < CUP_R * 0.6) break;
  }
  pts.push([x, y]);
  return { pts, len: Math.max(L, 1) };
}
function setAim(ang, power) {
  const b = S.player.ball;
  S.aim = { ang, power, guide: guide(S.world, b, ang, 70 + power * 330) };
}
const canAim = () => S.screen === 'play' && S.player && !S.player.done && S.player.ball.rest && S.player.waterT <= 0;

let drag = null;
cv.addEventListener('pointerdown', (e) => {
  Audio.warm();
  // a press while the ball is still settling is kept: the aim appears the moment it stops
  if (S.screen !== 'play' || !S.player || S.player.done || drag) return;
  S.idle = 0;
  drag = { x: e.clientX, y: e.clientY, id: e.pointerId };
  S.kb.on = false;
  try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
});
cv.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  drag.cx = e.clientX; drag.cy = e.clientY;
  dragAim();
});
// A windmill blade can nudge a resting ball mid-aim: keep the drag alive and re-aim once it settles,
// instead of silently dropping the player's pull-back.
function dragAim() {
  if (!drag || drag.cx == null) return;
  if (S.screen !== 'play' || !S.player || S.player.done) { drag = null; S.aim = null; return; }
  if (!canAim()) { S.aim = null; return; }
  const e = { clientX: drag.cx, clientY: drag.cy };
  const ddx = drag.x - e.clientX, ddy = drag.y - e.clientY, d = Math.hypot(ddx, ddy);
  if (d < 10) { S.aim = null; return; }
  const a = S.view.toWorld(drag.x * dpr, drag.y * dpr), b = S.view.toWorld(e.clientX * dpr, e.clientY * dpr);
  const ang = Math.atan2(a[1] - b[1], a[0] - b[0]);
  const power = Math.min(1, d / (Math.min(cssW, cssH) * 0.4));
  const old = S.aim ? Math.round(S.aim.power * 12) : -1;
  setAim(ang, power);
  if (Math.round(power * 12) !== old && old >= 0) Audio.tick2();
}
const endDrag = (e) => {
  if (!drag || (e && e.pointerId !== drag.id)) return;
  if (drag.cx != null && canAim()) dragAim();
  drag = null;
  if (S.aim && canAim() && S.aim.power > 0.03) doShoot(S.player, S.aim.ang, S.aim.power);
  S.aim = null;
};
cv.addEventListener('pointerup', endDrag);
window.addEventListener('pointerup', () => Audio.warm(), true);
cv.addEventListener('pointercancel', () => { drag = null; S.aim = null; });

const keys = {};
window.addEventListener('keydown', (e) => {
  Audio.warm();
  keys[e.code] = true;
  if (e.code === 'KeyM') { toggleMute(); return; }
  if (S.screen === 'result' || S.screen === 'raceHole') {
    if (e.code === 'Enter' || e.code === 'Space') { e.preventDefault(); document.querySelector('[data-next]')?.click(); }
    if (e.code === 'KeyR') document.querySelector('[data-retry]')?.click();
    return;
  }
  if (S.screen === 'title' && (e.code === 'Enter' || e.code === 'Space')) { e.preventDefault(); playCareer(); return; }
  if (S.screen !== 'play') { if (e.code === 'Escape') document.querySelector('[data-back]')?.click(); return; }
  if (e.code === 'Escape') { openPause(); return; }
  if (e.code === 'KeyR' && S.mode === 'solo') { restartHole(); return; }
  if ((e.code === 'Space' || e.code === 'Enter') && canAim()) {
    e.preventDefault();
    if (S.kb.on) { doShoot(S.player, S.kb.ang, S.kb.pow); S.aim = null; S.kb.on = false; }
    else { S.kb.on = true; }
  }
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'KeyA', 'KeyD', 'KeyW', 'KeyS'].includes(e.code)) { e.preventDefault(); S.kb.on = true; }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
function keyAim(dt) {
  if (!S.kb.on || !canAim() || drag) { if (!drag && S.kb.on === false) {} return; }
  const fine = keys.ShiftLeft || keys.ShiftRight ? 0.25 : 1;
  if (keys.ArrowLeft || keys.KeyA) S.kb.ang -= dt * 1.4 * fine;
  if (keys.ArrowRight || keys.KeyD) S.kb.ang += dt * 1.4 * fine;
  if (keys.ArrowUp || keys.KeyW) S.kb.pow = Math.min(1, S.kb.pow + dt * 0.6 * fine);
  if (keys.ArrowDown || keys.KeyS) S.kb.pow = Math.max(0.04, S.kb.pow - dt * 0.6 * fine);
  setAim(S.kb.ang, S.kb.pow);
}

// ------------------------------------------------------------------ main loop
let last = performance.now();
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  S.rt += rdt;
  if (S.world) {
    // drama: a putt that is tracking into the cup rolls the last bit in slow motion
    let want = 1;
    const P = S.player;
    if (P && !P.done && !P.ball.rest && !P.ball.sunk && S.screen === 'play') {
      const b = P.ball, c = S.world.cup, dx = c[0] - b.x, dy = c[1] - b.y, d = Math.hypot(dx, dy), sp = Math.hypot(b.vx, b.vy);
      if (d < 120 && d > CUP_R && sp > 25 && sp < 760) {
        const tt = (dx * b.vx + dy * b.vy) / (sp * sp);
        if (tt > 0 && Math.hypot(b.x + b.vx * tt - c[0], b.y + b.vy * tt - c[1]) < CUP_R - 2) want = 0.42;
      }
    }
    S.slow = (S.slow ?? 1) + (want - (S.slow ?? 1)) * Math.min(1, rdt * (want < 1 ? 14 : 6));
    let sdt = rdt * S.speed * S.slow;
    if (S.hitstop > 0) { S.hitstop -= rdt; sdt = 0; }
    runBotPlanning(S.speed > 1 ? 14 : 6);
    if (S.screen !== 'pause') { tick(sdt); keyAim(rdt); if (drag && !S.aim) dragAim(); }
    if (canAim() && !S.aim && !drag) S.idle += rdt; else S.idle = 0;
    updateFx(rdt);
    flow();
    R_.draw({ ...S, hint: hintFor(), aim: S.aim, balls: S.balls.map((B) => ({ ...B, pulse: B === S.player && canAim() })) });
  }
  requestAnimationFrame(frame);
}

// Onboarding: an animated finger demo drawn at the ball until the first putt, and again
// whenever the player sits idle for a while.
function hintFor() {
  if (!canAim() || S.aim || drag || S.mode === 'attract') return null;
  const first = !save.tut;
  if (!(first ? S.idle > 0.35 : S.idle > 7)) return null;
  const b = S.player.ball, w = S.world;
  // the demo aims straight at the cup; the dotted guide still bounces off the rails
  const ang = Math.atan2(w.cup[1] - b.y, w.cup[0] - b.x);
  if (!S.hintG || S.hintG.x !== b.x || S.hintG.y !== b.y) S.hintG = { x: b.x, y: b.y, g: guide(w, b, ang, 400) };
  return { x: b.x, y: b.y, ang, g: S.hintG.g, t: S.idle, text: first ? 'DRAG BACK, LET GO' : 'DRAG BACK TO PUTT' };
}
document.addEventListener('visibilitychange', () => Audio.pause(document.hidden));

// ------------------------------------------------------------------ UI
const ICON = {
  home: '<svg viewBox="0 0 24 24"><path d="M3 11 12 3l9 8v10h-6v-6H9v6H3z"/></svg>',
  retry: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 1 0 8 8h-3a5 5 0 1 1-5-5v3l5-4.5L12 1z"/></svg>',
  snd: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-5v16l-5-5H3zM15 8a5 5 0 0 1 0 8M17.5 5a9 9 0 0 1 0 14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M3 9h4l5-5v16l-5-5H3z"/></svg>',
  mute: '<svg viewBox="0 0 24 24"><path d="M3 9h4l5-5v16l-5-5H3z"/><path d="M16 9l6 6M22 9l-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
  star: '<svg viewBox="0 0 24 24"><path d="M12 2.5l2.9 6.2 6.8.8-5 4.6 1.3 6.7L12 17.5l-6 3.3 1.3-6.7-5-4.6 6.8-.8z"/></svg>',
  lock: '<svg viewBox="0 0 24 24"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm3 0h4V7a2 2 0 0 0-4 0z"/></svg>',
  card: '<svg viewBox="0 0 24 24"><path d="M4 3h16v18H4zm3 4v2h10V7zm0 4v2h10v-2zm0 4v2h6v-2z"/></svg>',
};
const h = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
function clearUI() { ui.innerHTML = ''; }
function soundBtn() {
  const b = h(`<button class="ibtn snd" aria-label="Sound">${Audio.muted ? ICON.mute : ICON.snd}</button>`);
  b.onclick = (e) => { e.stopPropagation(); toggleMute(); };
  return b;
}
function toggleMute() { Audio.warm(); save.muted = !Audio.muted; Audio.setMuted(save.muted); persist(); document.querySelectorAll('.snd').forEach((b) => (b.innerHTML = Audio.muted ? ICON.mute : ICON.snd)); }
function starsHTML(n, cls = '') { return `<span class="stars ${cls}">${[0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}">${ICON.star}</i>`).join('')}</span>`; }

function showTitle() {
  const wasAttract = S.mode === 'attract' && S.world;
  S.screen = 'title'; S.mode = 'attract'; S.race = null;
  if (!wasAttract) attractNext();
  clearUI();
  const nh = nextHole();
  const el = h(`<div class="title-wrap">
    <div class="topbar"><div class="tl"><span class="pill">${ICON.star}<b>${totalStars()}</b>/54</span><button class="pill ballbtn" data-skins aria-label="Ball skins">${ballDot(curSkin())}<b>BALLS</b>${newSkins() ? '<em class="new">NEW</em>' : ''}</button></div></div>
    <div class="title">
      <div class="logo"><h1><span>PUTT</span><span>PARK</span></h1><p>18 holes of crazy mini golf</p></div>
      <button class="btn play" data-play><span class="lbl">PLAY</span><small>Hole ${nh + 1} · ${HOLES[nh].name}</small></button>
      <div class="row2">
        <button class="btn" data-race><span class="lbl">RACE</span><small>vs 3 ghost golfers</small></button>
        <button class="btn" data-holes><span class="lbl">HOLES</span><small>pick any hole</small></button>
      </div>
    </div></div>`);
  el.querySelector('.topbar').appendChild(soundBtn());
  el.querySelector('[data-play]').onclick = () => { Audio.warm(); Audio.click(); playCareer(); };
  el.querySelector('[data-race]').onclick = () => { Audio.warm(); Audio.click(); startRace(); };
  el.querySelector('[data-holes]').onclick = () => { Audio.warm(); Audio.click(); showHoles(); };
  el.querySelector('[data-skins]').onclick = () => { Audio.warm(); Audio.click(); showSkins(); };
  ui.appendChild(el);
  setView();
}

function ballDot(sk) { return `<i class="bdot ${sk.p || ''}" style="--c:${sk.c}"></i>`; }
function newSkins() { const seen = save.seenSkins | 0; let n = 0; SKINS.forEach((k, i) => { if (skinOK(i) && i >= Math.max(1, seen)) n++; }); return n; }
function showSkins() {
  S.screen = 'skins';
  let unl = 0; SKINS.forEach((k, i) => { if (skinOK(i)) unl = i + 1; }); save.seenSkins = Math.max(save.seenSkins | 0, unl); persist();
  clearUI();
  const el = h(`<div class="scrim"><div class="card wide">
    <h2>BALLS <span class="sub">${ICON.star}<b>${totalStars()}</b>/54</span></h2>
    <div class="grid skins">${SKINS.map((k, i) => skinOK(i)
      ? `<button class="tile ${(save.skin | 0) === i ? 'sel' : ''}" data-k="${i}">${ballDot(k)}<span>${k.name}</span><em>${(save.skin | 0) === i ? 'IN USE' : 'tap to use'}</em></button>`
      : `<button class="tile locked" disabled>${ICON.lock}<span>${k.name}</span><em>${ICON.star} ${k.need}</em></button>`).join('')}</div>
    <div class="sub">Earn stars on the holes to unlock more balls</div>
    <button class="btn play" data-back><span class="lbl">DONE</span></button></div></div>`);
  el.querySelectorAll('[data-k]').forEach((b) => (b.onclick = () => { save.skin = +b.dataset.k; persist(); Audio.star(1); showSkins(); }));
  el.querySelector('[data-back]').onclick = () => { Audio.click(); showTitle(); };
  ui.appendChild(el);
}

function playCareer(i) {
  Audio.warm();
  const idx = i ?? nextHole();
  S.round = { start: idx, scores: {} };
  S.screen = 'play';
  startHole(idx, 'solo');
  showHud();
}
function restartHole() { if (S.mode !== 'solo') return; Audio.click(); S.screen = 'play'; startHole(S.holeIdx, 'solo'); showHud(); }

let hudEl = null;
function showHud() {
  clearUI();
  hudEl = h(`<div class="hud">
    <button class="ibtn" data-menu aria-label="Menu">${ICON.home}</button>
    <div class="hcenter"></div>
    <div class="hright"></div>
  </div>`);
  hudEl.querySelector('[data-menu]').onclick = (e) => { e.stopPropagation(); openPause(); };
  const right = hudEl.querySelector('.hright');
  if (S.mode === 'solo') { const r = h(`<button class="ibtn" aria-label="Restart hole">${ICON.retry}</button>`); r.onclick = (e) => { e.stopPropagation(); restartHole(); }; right.appendChild(r); }
  right.appendChild(soundBtn());
  ui.appendChild(hudEl);
  updHud();
}
function updHud() {
  if (!hudEl || S.screen !== 'play' || !S.player) return;
  const c = hudEl.querySelector('.hcenter');
  const w = S.world, P = S.player;
  let html = `<div class="hole"><b>HOLE ${S.holeIdx + 1}</b><span>${w.name}</span></div>
    <div class="chips"><span class="chip">PAR <b>${w.par}</b></span><span class="chip ${P.strokes > w.par ? 'over' : ''}">STROKES <b>${Math.min(P.strokes, capFor(w))}</b></span></div>`;
  if (S.mode === 'race') {
    html += `<div class="racers">${S.balls.map((B) => `<span class="rc ${B.done ? 'done' : ''}" style="--c:${B.color}"><i></i>${B.tag} <b>${B.done ? (B.capped ? 'X' : B.strokes) : B.strokes}</b></span>`).join('')}</div>`;
  }
  c.innerHTML = html;
}
function popChip() { const c = hudEl && hudEl.querySelectorAll('.chip')[1]; if (!c) return; c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }

function openPause() {
  if (S.screen !== 'play') return;
  Audio.click();
  S.screen = 'pause'; S.aim = null; drag = null;
  const el = h(`<div class="scrim"><div class="card small">
    <h2>PAUSED</h2>
    <div class="menu">
      <button class="btn play" data-resume><span class="lbl">RESUME</span></button>
      ${S.mode === 'solo' ? '<button class="btn" data-restart><span class="lbl">RESTART HOLE</span></button>' : ''}
      <div class="row2"><button class="btn" data-card><span class="lbl">SCORECARD</span></button><button class="btn" data-quit><span class="lbl">MENU</span></button></div>
    </div></div></div>`);
  el.querySelector('[data-resume]').onclick = () => { el.remove(); S.screen = 'play'; };
  el.querySelector('[data-back]');
  el.querySelector('[data-restart]')?.addEventListener('click', () => { el.remove(); restartHole(); });
  el.querySelector('[data-card]').onclick = () => { el.remove(); showCard(() => { S.screen = 'play'; showHud(); }, 'BACK'); };
  el.querySelector('[data-quit]').onclick = () => { showTitle(); };
  el.setAttribute('data-back', ''); el.onclick = (e) => { if (e.target === el) { el.remove(); S.screen = 'play'; } };
  ui.appendChild(el);
}

function showResult() {
  S.screen = 'result';
  const P = S.player, w = S.world, i = S.holeIdx;
  const st = starsFor(P.strokes, w.par, P.capped);
  const prevBest = save.best[i];
  const newBest = !P.capped && (prevBest == null || P.strokes < prevBest);
  if (!P.capped || prevBest == null) save.best[i] = prevBest == null ? P.strokes : Math.min(prevBest, P.strokes);
  const before = totalStars();
  save.stars[i] = Math.max(save.stars[i] || 0, st);
  persist();
  const unlockedNow = SKINS.find((k) => k.need > before && k.need <= totalStars());
  S.round.scores[i] = P.strokes;
  const name = P.capped ? 'OUT OF STROKES' : scoreName(P.strokes, w.par);
  const last = i === HOLES.length - 1;
  const el = h(`<div class="scrim clear"><div class="card result">
    <div class="rhead">HOLE ${i + 1} · ${w.name}</div>
    <h2 class="rbig ${st === 3 ? 'gold' : ''}">${name}</h2>
    ${starsHTML(0, 'big')}
    <div class="rline">${P.capped ? 'Too many strokes' : `${P.strokes} stroke${P.strokes > 1 ? 's' : ''} · par ${w.par}`}${newBest && prevBest != null ? ' · <b class="nb">NEW BEST</b>' : ''}</div>
    ${unlockedNow ? `<div class="unlock">${ballDot(unlockedNow)} NEW BALL UNLOCKED: <b>${unlockedNow.name}</b></div>` : ''}
    <div class="row2">
      <button class="btn" data-retry><span class="lbl">RETRY</span></button>
      <button class="btn play" data-next><span class="lbl">${last ? 'SCORECARD' : 'NEXT HOLE'}</span></button>
    </div></div></div>`);
  el.querySelector('[data-retry]').onclick = () => { el.remove(); restartHole(); };
  el.querySelector('[data-next]').onclick = () => {
    Audio.click(); el.remove();
    if (last || i === 8) showCard(() => { if (last) { showTitle(); } else { playNext(); } }, last ? 'MENU' : 'CONTINUE');
    else playNext();
  };
  ui.appendChild(el);
  const stars = el.querySelectorAll('.stars i');
  for (let k = 0; k < st; k++) setTimeout(() => { stars[k].classList.add('on', 'pop'); Audio.star(k); }, 260 + k * 220);
}
function playNext() { S.screen = 'play'; startHole((S.holeIdx + 1) % HOLES.length, 'solo'); showHud(); }

function showCard(onDone, label = 'BACK') {
  const prevScreen = S.screen; S.screen = 'card';
  let tp = 0, tr = 0, any = false;
  const rows = HOLES.map((H, i) => {
    const r = S.round.scores?.[i]; if (r != null) { tp += H.par; tr += r; any = true; }
    return `<tr><td>${i + 1}</td><td class="nm">${H.name}</td><td>${H.par}</td><td class="${r != null ? (r < H.par ? 'u' : r > H.par ? 'o' : '') : ''}">${r ?? '-'}</td><td>${save.best[i] ?? '-'}</td><td>${starsHTML(save.stars[i] || 0, 'tiny')}</td></tr>`;
  }).join('');
  const diff = tr - tp;
  const el = h(`<div class="scrim"><div class="card wide">
    <h2>SCORECARD</h2>
    <div class="sub">${any ? `This round: <b>${tr}</b> (${diff === 0 ? 'E' : diff > 0 ? '+' + diff : diff})` : 'No holes played this round yet'} · ${ICON.star}<b>${totalStars()}</b>/54</div>
    <div class="tbl"><table><thead><tr><th>#</th><th class="nm">Hole</th><th>Par</th><th>Now</th><th>Best</th><th>Stars</th></tr></thead><tbody>${rows}</tbody></table></div>
    <button class="btn play" data-next data-back><span class="lbl">${label}</span></button></div></div>`);
  el.querySelector('[data-next]').onclick = () => { Audio.click(); el.remove(); if (S.screen === 'card') S.screen = prevScreen; onDone && onDone(); };
  ui.appendChild(el);
}

function showHoles() {
  S.screen = 'holes';
  const nh = nextHole();
  clearUI();
  const el = h(`<div class="scrim"><div class="card wide">
    <h2>HOLES <span class="sub">${ICON.star}<b>${totalStars()}</b>/54</span></h2>
    <div class="grid">${HOLES.map((H, i) => unlocked(i)
      ? `<button class="tile ${i === nh && save.best[i] == null ? 'next' : ''}" data-i="${i}"><b>${i + 1}</b><span>${H.name}</span>${starsHTML(save.stars[i] || 0, 'tiny')}<em>${save.best[i] != null ? 'best ' + save.best[i] : i === nh ? 'PLAY NEXT' : 'par ' + H.par}</em></button>`
      : `<button class="tile locked" disabled><b>${i + 1}</b>${ICON.lock}</button>`).join('')}</div>
    <button class="btn" data-back><span class="lbl">BACK</span></button></div></div>`);
  el.querySelectorAll('[data-i]').forEach((b) => (b.onclick = () => { Audio.click(); playCareer(+b.dataset.i); }));
  el.querySelector('[data-back]').onclick = () => { Audio.click(); showTitle(); };
  ui.appendChild(el);
  // scroll the grid so the hole you are up to is in view
  const nx = el.querySelector('.tile.next'); if (nx) { const g = el.querySelector('.grid'); g.scrollTop = Math.max(0, nx.offsetTop - g.offsetTop - g.clientHeight / 2 + nx.offsetHeight / 2); }
}

// ------------------------------------------------------------------ race
function startRace(holes) {
  Audio.warm();
  const pool = HOLES.map((_, i) => i).sort(() => Math.random() - 0.5);
  S.race = { holes: holes || pool.slice(0, 5), k: 0, pts: { YOU: 0, PIP: 0, DOT: 0, ACE: 0 }, log: [] };
  raceHole();
}
function raceHole() {
  S.screen = 'play'; S.waitShown = false;
  startHole(S.race.holes[S.race.k], 'race');
  showHud();
  S.floats.push({ text: `RACE ${S.race.k + 1}/${S.race.holes.length}`, x: cssW / 2, y: cssH * 0.3, screen: true, big: true, life: 1.3, max: 1.3, size: Math.min(48, cssW / 10), c: '#ffd23f' });
}
function showWait() {
  const el = h(`<div class="wait">Waiting for the others… <b>fast-forward</b></div>`);
  hudEl?.appendChild(el);
}
function showRaceHole() {
  if (S.screen !== 'play') return;
  S.screen = 'raceHole';
  document.querySelector('.wait')?.remove();
  const order = [...S.balls].sort((a, b) => a.strokes - b.strokes || a.finishT - b.finishT);
  const pts = [3, 2, 1, 0];
  order.forEach((B, k) => { S.race.pts[B.tag] += pts[k]; });
  const meK = order.indexOf(S.player);
  const last = S.race.k === S.race.holes.length - 1;
  if (meK === 0) Audio.sink(true);
  const place = ['1st', '2nd', '3rd', '4th'];
  const standings = Object.entries(S.race.pts).sort((a, b) => b[1] - a[1]);
  const colorOf = (tag) => S.balls.find((B) => B.tag === tag).color;
  let el;
  if (!last) {
    el = h(`<div class="scrim clear"><div class="card result">
      <div class="rhead">RACE ${S.race.k + 1}/${S.race.holes.length} · ${S.world.name} · par ${S.world.par}</div>
      <h2 class="rbig ${meK === 0 ? 'gold' : ''}">${meK === 0 ? 'YOU WIN THE HOLE!' : 'YOU CAME ' + place[meK].toUpperCase()}</h2>
      <ol class="podium">${order.map((B, k) => `<li style="--c:${B.color}"><i></i><b>${B.tag}</b><span>${B.capped ? 'X' : B.strokes}</span><em>+${pts[k]}</em></li>`).join('')}</ol>
      <div class="totals">${standings.map(([t, p]) => `<span style="--c:${colorOf(t)}"><i></i>${t} <b>${p}</b></span>`).join('')}</div>
      <button class="btn play" data-next><span class="lbl">NEXT HOLE</span></button></div></div>`);
    el.querySelector('[data-next]').onclick = () => { Audio.click(); el.remove(); S.race.k++; raceHole(); };
  } else {
    const win = standings[0][0] === 'YOU';
    save.races++; if (win) save.wins++; persist();
    el = h(`<div class="scrim clear"><div class="card result">
      <div class="rhead">RACE FINISHED · ${save.wins} win${save.wins === 1 ? '' : 's'} from ${save.races}</div>
      <h2 class="rbig ${win ? 'gold' : ''}">${win ? 'CHAMPION!' : standings.findIndex((s) => s[0] === 'YOU') + 1 === 2 ? 'SO CLOSE - 2ND!' : 'BETTER LUCK NEXT TIME'}</h2>
      <ol class="podium">${standings.map(([t, p], k) => `<li style="--c:${colorOf(t)}"><i></i><b>${t}</b><span>${p} pts</span><em>${place[k]}</em></li>`).join('')}</ol>
      <div class="row2"><button class="btn" data-back><span class="lbl">MENU</span></button><button class="btn play" data-next><span class="lbl">RACE AGAIN</span></button></div></div></div>`);
    el.querySelector('[data-next]').onclick = () => { Audio.click(); el.remove(); startRace(); };
    el.querySelector('[data-back]').onclick = () => { Audio.click(); showTitle(); };
    if (win) setTimeout(() => Audio.sink(true), 200);
  }
  ui.appendChild(el);
}

// ------------------------------------------------------------------ test hooks
window.__G = {
  S, HOLES, save,
  get world() { return S.world; }, get ball() { return S.player?.ball; },
  startHole: (i, mode = 'solo') => { if (mode === 'race') { startRace([i, (i + 1) % 18, (i + 2) % 18, (i + 3) % 18, (i + 4) % 18]); } else { S.round = { start: i, scores: {} }; S.screen = 'play'; startHole(i, mode); showHud(); } },
  shoot: (ang, power) => doShoot(S.player, ang, power),
  solve: () => planSync(S.world, S.player.ball, S.t),
  tick: (dt) => tick(dt),
  advance(sec) { const prev = S.syncBots; S.syncBots = true; const n = Math.round(sec / (1 / 60)); for (let k = 0; k < n; k++) { runBotPlanning(1e9); tick(1 / 60); updateFx(1 / 60); } S.syncBots = prev; },
  playHole(i, log) {
    this.startHole(i);
    const shots = [];
    for (let guard = 0; guard < 20 && !S.player.done; guard++) {
      let w = 0; while ((!S.player.ball.rest || S.player.waterT > 0) && !S.player.done && w++ < 900) this.advance(1 / 60);
      if (S.player.done) break;
      const p = this.solve(); shots.push(p);
      this.shoot(p.ang, p.power);
      this.advance(0.1);
    }
    let w = 0; while (!S.player.done && w++ < 900) this.advance(1 / 60);
    return { strokes: S.player.strokes, capped: S.player.capped, par: S.world.par, shots: log ? shots : shots.length };
  },
  SKINS, showSkins, showTitle, showHoles, showResult, showCard: () => showCard(null), startRace,
};

// ------------------------------------------------------------------ boot
resize();
if (qs.get('race')) { startRace(); }
else if (qs.get('hole')) { playCareer(Math.max(0, Math.min(17, (+qs.get('hole') || 1) - 1))); }
else if (qs.get('play')) { playCareer(0); }
else showTitle();
requestAnimationFrame(frame);
