// ONE TILE - pixel heist. Plan a route, press GO, watch it play out, change one step, go again.
import * as S from './sim.js';
import { LEVELS, THEMES } from './levels.js';
import { PARS, MINS } from './pars.js';
import * as G from './render.js';
import { sfx, initAudio, setMusic, setSfx } from './audio.js';

const { PAL, R, T } = G;
const VW = 336, VH = 216;
const BOARD = { x: 4, y: 16, w: 256, h: 176 };
const SIDE = { x: 264, w: 68 };
const SCRUB = { x: 6, y: 197, w: 324, h: 16 };
const TPS = 7, FAST = 3;
const SAVE_KEY = 'pd.onetile';

const canvas = document.getElementById('c');
const ctx = canvas.getContext('2d');
const [buf, b] = G.mk(VW, VH);
let K = 1;                       // device pixels per game pixel (whole number)
const params = new URLSearchParams(location.search);

// ---------------------------------------------------------------- save
function loadSave() {
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.v === 1) return s; } catch (e) { /* storage blocked */ }
  return { v: 1, unlocked: 1, stars: {}, best: {}, plans: {}, music: true, sfx: true };
}
const save = loadSave();
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode */ } }
const starsOf = n => save.stars[n] || [0, 0, 0];
const totalStars = () => LEVELS.reduce((a, _, i) => a + starsOf(i + 1).reduce((p, q) => p + q, 0), 0);
setMusic(save.music); setSfx(save.sfx);

// ---------------------------------------------------------------- text (drawn crisp at full res after the pixel blit)
let texts = [];
function txt(s, x, y, o = {}) { texts.push({ s: String(s), x, y, c: o.c || PAL.white, size: o.size || 8, align: o.align || 'left', shadow: o.shadow !== false, alpha: o.alpha ?? 1, sh: o.sh || PAL.black }); }
const FONT = 'Silkscreen, "Press Start 2P", monospace';
function textW(s, size = 8) { ctx.font = `${size * K}px ${FONT}`; return ctx.measureText(String(s)).width / K; }
function flushText() {
  ctx.textBaseline = 'top';
  for (const t of texts) {
    ctx.font = `${t.size * K}px ${FONT}`; ctx.textAlign = t.align; ctx.globalAlpha = t.alpha;
    const x = Math.round(t.x * K), y = Math.round(t.y * K);
    if (t.shadow) { ctx.fillStyle = t.sh; ctx.fillText(t.s, x + K, y + K); }
    ctx.fillStyle = t.c; ctx.fillText(t.s, x, y);
  }
  ctx.globalAlpha = 1; texts = [];
}

// ---------------------------------------------------------------- resize (integer scaling only)
function resize() {
  const dpr = window.devicePixelRatio || 1;
  const pw = Math.floor(innerWidth * dpr), ph = Math.floor(innerHeight * dpr);
  K = Math.max(1, Math.floor(Math.min(pw / VW, ph / VH)));
  canvas.width = VW * K; canvas.height = VH * K;
  canvas.style.width = (VW * K / dpr) + 'px'; canvas.style.height = (VH * K / dpr) + 'px';
  canvas.style.left = Math.round((innerWidth - VW * K / dpr) / 2) + 'px'; canvas.style.top = Math.round((innerHeight - VH * K / dpr) / 2) + 'px';
  ctx.imageSmoothingEnabled = false;
}
addEventListener('resize', resize);

// ---------------------------------------------------------------- game state
const game = {
  scene: 'title', time: 0, sel: 0, pause: null, help: false, toast: null,
  P: null,   // the level being played
};
let buttons = [];          // rebuilt every frame: {id, x, y, w, h}
let mouse = { x: -1, y: -1, down: false, inside: false };

function boardOrigin(w) { return { ox: BOARD.x + ((BOARD.w - w.W * T) >> 1), oy: BOARD.y + ((BOARD.h - w.H * T) >> 1) }; }

function startLevel(n, { keepPlan = true } = {}) {
  const def = LEVELS[n - 1]; const w = S.parseLevel(def);
  const theme = def.theme;
  const P = {
    n, def, w, theme, bg: G.buildBackground(w, theme), props: G.staticProps(w), ...boardOrigin(w),
    plan: [], hist: [], scrub: 0, hoverTick: null, phase: 'plan', fast: false, failTick: -1, failInfo: null,
    run: null, runT: 0, fx: [], intro: 1.6, result: null, par: PARS[n - 1], min: MINS[n - 1], tipT: 9, routeCache: null,
  };
  const saved = keepPlan && save.plans[n];
  if (saved) P.plan = saved.split('').filter(c => 'UDLRW'.includes(c));
  game.P = P; game.scene = 'play'; game.pause = null;
  if (!keepPlan || !params.has('plan')) P.plan = [];
  retrace(); P.scrub = 0;
  if (!params.has('plan')) { P.coins = placeCoins(w); rtStart(); } else P.planMode = true;
}

// ---------------------------------------------------------------- live play (WASD)
// Each key press is one tick: the thief takes the step and every guard, camera and laser takes
// one step of its loop with them. Z takes a step back, R starts the level again.
const LIVE_TPS = 9;
const isRun = P => P.phase === 'run' || P.phase === 'live' || P.phase === 'rt';

// ---------------------------------------------------------------- real-time play
// The world ticks on its own (guards, cameras, lasers at WORLD_TPS); the thief dashes tile to tile
// while WASD is held, about twice guard speed. No keys needed (coloured doors just open), gold
// coins everywhere, stand next to the safe to crack it, then run for the EXIT. No step limits.
const WORLD_TPS = 3.2, RUN_SPEED = 7.5, CRACK_SECS = 0.28, SEEN_GRACE = 0.18, ALL_KEYS = 7;
const held = []; let touchDir = null;
const DIRKEY = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
function placeCoins(w) {
  const out = [], busy = new Set([w.start, w.exit, w.safe, ...w.loot].map(p => p.x + ',' + p.y));
  for (const k of w.keys) out.push({ x: k.x, y: k.y });            // old keycard spots become coins
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const t = S.tile(w, x, y); if ((t !== '.' && t !== ',') || busy.has(x + ',' + y)) continue;
    if (Math.abs(x - w.start.x) + Math.abs(y - w.start.y) < 2) continue;
    const h = Math.imul(x * 73856093 ^ y * 19349663 ^ w.W * 83492791, 2654435761) >>> 0;
    if (h % 100 < 26) out.push({ x, y });
  }
  return out;
}
function rtStart() {
  const P = game.P, w = P.w;
  P.rt = { x: w.start.x, y: w.start.y, fx: w.start.x, fy: w.start.y, mv: 1, half: true, face: 'D', crack: 0, loot: 0, got: new Set(), clock: 0, seen: 0, time: 0, cracking: false, steps: 0 };
  P.phase = 'rt'; P.failInfo = null; P.failTick = -1; P.fx = []; P.plan = []; P.result = null;
  syncRun();
}
function rtState() {
  const P = game.P, r = P.rt;
  return { x: r.x, y: r.y, t: Math.floor(r.clock), crack: Math.min(P.w.crack, Math.floor(r.crack / CRACK_SECS + 1e-6)), keys: ALL_KEYS, loot: r.loot, face: r.face, won: false, caught: null };
}
function syncRun() { const P = game.P, st = rtState(); P.run = { cur: st, next: null, ev: [], t: st.t, act: null }; }
function rtView(P) {
  const r = P.rt, t = Math.floor(r.clock), th = rtState();
  return { t, f: r.clock - t, tf: r.mv, thief: th, prev: { ...th, x: r.fx, y: r.fy }, ghost: false, danger: P.phase === 'caught' ? P.failInfo : null };
}
function pushHeld(d) { const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); held.push(d); }
function rtTryMove(d, fromKey) {
  const P = game.P, w = P.w, r = P.rt; if (P.phase !== 'rt') return;
  P.intro = 0; r.face = d;
  const [dx, dy] = S.DIRS[d];
  if (!S.thiefCanEnter(w, r.x + dx, r.y + dy, ALL_KEYS)) { if (fromKey) sfx.buzz(); return; }
  r.fx = r.x; r.fy = r.y; r.x += dx; r.y += dy; r.mv = 0; r.half = false;
}
function rtArrive() {
  const P = game.P, w = P.w, r = P.rt;
  r.steps++; sfx.step(r.steps);
  if ('RBY'.includes(S.tile(w, r.x, r.y))) sfx.door();
  P.coins.forEach((c, i) => { if (c.x === r.x && c.y === r.y && !r.got.has(i)) { r.got.add(i); sfx.coin(); spark(c.x, c.y, PAL.yellow, 5); } });
  w.loot.forEach((l, i) => { if (l.x === r.x && l.y === r.y && !(r.loot & (1 << i))) { r.loot |= 1 << i; sfx.loot(); coins(l.x, l.y, l.kind === 'g' ? 4 : 7, l.kind === 'g'); } });
  if (r.x === w.exit.x && r.y === w.exit.y) { if (r.crack >= w.crack * CRACK_SECS - 1e-6) rtWin(); else toast('CRACK THE SAFE FIRST'); }
}
function rtUpdate(dt) {
  const P = game.P, w = P.w, r = P.rt;
  if (P.intro > 0) return;                         // the world waits for the title card (or your first key)
  r.clock += dt * WORLD_TPS; r.time += dt;
  if (P.tipT > 0 && r.steps) P.tipT = Math.min(P.tipT, 5) - dt;
  if (r.mv < 1) {
    r.mv = Math.min(1, r.mv + dt * RUN_SPEED);
    if (r.mv >= 0.5 && !r.half) { r.half = true; rtArrive(); if (P.phase !== 'rt') return; }
  }
  if (r.mv >= 1) { r.fx = r.x; r.fy = r.y; const d = held[held.length - 1] || touchDir; if (d) rtTryMove(d, false); }
  // the safe cracks while you stand next to it
  const need = w.crack * CRACK_SECS; r.cracking = false;
  if (r.mv >= 1 && S.adjSafe(w, r.x, r.y) && r.crack < need) {
    const before = Math.floor(r.crack / CRACK_SECS); r.crack = Math.min(need, r.crack + dt); r.cracking = true;
    if (Math.floor(r.crack / CRACK_SECS + 1e-6) > before) {
      if (r.crack >= need - 1e-6) { r.crack = need; sfx.open(); coins(w.safe.x, w.safe.y, 10); toast('SAFE OPEN - RUN FOR THE EXIT!'); }
      else { sfx.crack(); spark(w.safe.x, w.safe.y, PAL.lgrey, 4); }
    }
  }
  // seen? (the tick whose cones/lasers are on screen; a split second of grace, except walking into a guard)
  const t0 = Math.floor(r.clock), tl = (r.clock - t0) >= 0.5 ? t0 + 1 : t0;
  const px = r.mv < 0.5 ? r.fx : r.x, py = r.mv < 0.5 ? r.fy : r.y;
  const d = S.danger(w, tl, px, py, px, py);
  if (d && d.type === 'bump') { rtCaught(d, tl); return; }
  if (d) { r.seen += dt; if (r.seen >= SEEN_GRACE) { rtCaught(d, tl); return; } } else r.seen = Math.max(0, r.seen - dt * 2);
  syncRun();
}
function rtCaught(d, t) { const P = game.P; syncRun(); P.phase = 'caught'; P.failInfo = { ...d, t }; P.failTick = t; P.caughtAt = game.time; sfx.spotted(); sfx.alarm(); P.shake = 0.4; }
function rtWin() {
  const P = game.P, w = P.w, r = P.rt;
  const st = [true, r.got.size === P.coins.length, r.loot === S.allLootMask(w)];
  save.stars[P.n] = starsOf(P.n).map((v, i) => (v || st[i]) ? 1 : 0);
  save.bestTime = save.bestTime || {};
  const secs = Math.round(r.time * 10) / 10, prev = save.bestTime[P.n];
  if (!prev || secs < prev) save.bestTime[P.n] = secs;
  if (P.n >= save.unlocked && P.n < LEVELS.length) save.unlocked = P.n + 1;
  persist(); syncRun();
  P.phase = 'won'; P.result = { secs, stars: st, newBest: !prev || secs < prev, coins: r.got.size, coinsAll: P.coins.length, loot: countBits(r.loot), lootAll: w.loot.length, at: game.time };
  sfx.win(); coins(r.x, r.y, 16);
  st.forEach((on, i) => { if (on) setTimeout(() => sfx.star(i), 700 + i * 260); });
}
function dirToward(p) {
  const P = game.P, r = P.rt; const dx = p.x - (P.ox + r.x * T + 8), dy = p.y - (P.oy + r.y * T + 8);
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 6) return null;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'R' : 'L') : (dy > 0 ? 'D' : 'U');
}
function drawSideRt(P) {
  const x = SIDE.x, w = SIDE.w, r = P.rt; let y = 16;
  if (P.phase === 'caught') button('restart', x, y, w, 22, 'AGAIN', { color: PAL.dred, light: PAL.red, dark: PAL.plum });
  else txt('WASD', x + w / 2, y + 2, { c: PAL.gold, size: 16, align: 'center' });
  y += 25;
  button('restart', x, y, w, 15, 'RESTART', { hint: 'R' }); y += 18;
  button('menu', x, y, w, 15, 'MENU', { hint: 'ESC' }); y += 22;
  G.drawCoin(b, x - 3, y - 5, game.time);
  txt(r.got.size + ' / ' + P.coins.length, x + 14, y, { c: r.got.size === P.coins.length ? PAL.gold : PAL.white }); y += 13;
  if (P.w.loot.length) { txt('LOOT ' + countBits(r.loot) + ' / ' + P.w.loot.length, x, y, { c: r.loot === S.allLootMask(P.w) ? PAL.gold : PAL.cyan }); y += 13; }
  const need = P.w.crack * CRACK_SECS, open = r.crack >= need - 1e-6;
  txt(open ? 'SAFE OPEN' : 'SAFE ' + Math.round(100 * r.crack / need) + '%', x, y, { c: open ? PAL.green : PAL.gold }); y += 15;
  for (const l of wrap(open ? 'Run for the EXIT door!' : 'Stand next to the safe to crack it.', w)) { txt(l, x, y, { c: PAL.grey, shadow: false }); y += 8; }
}
function liveAt(t) {
  const P = game.P; P.plan.length = Math.max(0, t); retrace();
  let st = S.initState(P.w); for (let i = 0; i < P.plan.length; i++) st = S.step(P.w, st, P.plan[i]).s;
  P.run = { cur: st, next: null, ev: [], t: P.plan.length, stepIdx: 0 }; P.runT = P.plan.length;
  P.phase = 'live'; P.failInfo = null; P.fx = []; P.scrub = P.plan.length;
}
function liveStep(a) {
  const P = game.P; if (P.phase !== 'live') return;
  const r = P.run;
  if (r.next) { arrive(); if (P.phase !== 'live') return; }        // finish the last step first, so fast typing never drops keys
  if (a !== 'W') {
    const [dx, dy] = S.DIRS[a];
    if (!S.thiefCanEnter(P.w, r.cur.x + dx, r.cur.y + dy, r.cur.keys)) {
      sfx.buzz(); const t = S.tile(P.w, r.cur.x + dx, r.cur.y + dy);
      if ('RBY'.includes(t)) toast('NEED THE ' + { R: 'RED', B: 'BLUE', Y: 'YELLOW' }[t] + ' CARD'); return;
    }
  }
  P.plan.length = r.t; P.plan.push(a); retrace(); P.scrub = P.plan.length; P.tipT = Math.min(P.tipT, 4);
  const st = S.step(P.w, r.cur, a); r.next = st.s; r.ev = st.ev; r.act = a; P.runT = r.t;
}
function liveBack(n = 1) {
  const P = game.P; const t = (P.phase === 'caught' || P.phase === 'won') ? P.run.t - 1 : P.run.t - n;
  if (P.phase === 'live' && P.run.t === 0) { sfx.buzz(); return; }
  liveAt(Math.max(0, t)); sfx.undo();
}
function liveRestart() { liveAt(0); game.P.failTick = -1; sfx.undo(); }
function retrace() {
  const P = game.P; P.trace = S.tracePlan(P.w, P.plan);
  P.routeCache = null;
  save.plans[P.n] = P.plan.join(''); persist();
}
const planEnd = () => { const st = game.P.trace.states; return st[st.length - 1]; };
const maxScrub = () => Math.max(game.P.plan.length + 6, 30);
function pushHist() { const P = game.P; P.hist.push(P.plan.slice()); if (P.hist.length > 200) P.hist.shift(); }

// ---------------------------------------------------------------- plan editing
function addSteps(steps, sound = true) {
  const P = game.P; if (!steps.length) return;
  if (planEnd().won) { sfx.buzz(); toast('YOU ARE ALREADY OUT - PRESS GO'); return; }
  pushHist(); P.plan.push(...steps); retrace(); P.scrub = P.plan.length; P.failTick = -1;
  if (sound) (steps.length === 1 && steps[0] === 'W' ? sfx.planWait() : sfx.plan());
}
function tryMove(a) {
  const P = game.P; const e = planEnd(); const [dx, dy] = S.DIRS[a];
  if (!S.thiefCanEnter(P.w, e.x + dx, e.y + dy, e.keys)) { sfx.buzz(); const t = S.tile(P.w, e.x + dx, e.y + dy); if ('RBY'.includes(t)) toast('NEED THE ' + { R: 'RED', B: 'BLUE', Y: 'YELLOW' }[t] + ' CARD'); return; }
  addSteps([a]);
}
function addWait() { addSteps(['W']); }
function undoStep() { const P = game.P; if (!P.plan.length) { sfx.buzz(); return; } pushHist(); P.plan.pop(); retrace(); P.scrub = P.plan.length; sfx.undo(); }
function histUndo() { const P = game.P; if (!P.hist.length) { sfx.buzz(); return; } P.plan = P.hist.pop(); retrace(); P.scrub = Math.min(P.scrub, P.plan.length); sfx.undo(); }
function insertWait() { const P = game.P; const t = Math.min(P.scrub, P.plan.length); pushHist(); P.plan.splice(t, 0, 'W'); retrace(); P.scrub = t + 1; sfx.planWait(); toast('WAIT ADDED AT TICK ' + t); }
function deleteStep() {
  const P = game.P; const t = Math.min(P.scrub, P.plan.length - 1);
  if (t < 0) { sfx.buzz(); return; }
  // remove a wait at the playhead (or the nearest one before it); moves can't be removed without breaking the route
  let i = t; while (i >= 0 && P.plan[i] !== 'W') i--;
  if (i < 0) { sfx.buzz(); toast('NO WAIT TO REMOVE BEFORE THIS TICK'); return; }
  pushHist(); P.plan.splice(i, 1); retrace(); P.scrub = i; sfx.undo(); toast('WAIT REMOVED AT TICK ' + i);
}
function cutPlan() { const P = game.P; const t = Math.min(P.scrub, P.plan.length); if (t === P.plan.length) { sfx.buzz(); return; } pushHist(); P.plan.length = t; retrace(); sfx.undo(); toast('PLAN CUT AT TICK ' + t); }
function clearPlan() { const P = game.P; if (!P.plan.length) return; pushHist(); P.plan = []; retrace(); P.scrub = 0; P.failTick = -1; sfx.undo(); toast('PLAN CLEARED  (CTRL+Z BRINGS IT BACK)'); }
function clickTile(x, y) {
  const P = game.P; const e = planEnd();
  if (x === e.x && y === e.y) { addWait(); return; }
  const r = S.route(P.w, e, { x, y }, e.keys);
  if (!r) { sfx.buzz(); const t = S.tile(P.w, x, y); if ('RBY'.includes(t)) toast('NEED THE ' + { R: 'RED', B: 'BLUE', Y: 'YELLOW' }[t] + ' CARD FIRST'); return; }
  addSteps(r);
}
function setScrub(t, sound = true) { const P = game.P; const v = Math.max(0, Math.min(maxScrub(), t)); if (v !== P.scrub && sound) sfx.scrub(); P.scrub = v; }
function toast(s) { game.toast = { s, t: 2.2 }; }

// ---------------------------------------------------------------- run
function go() {
  const P = game.P; if (P.phase === 'run') return;
  if (!P.plan.length) { sfx.buzz(); toast('DRAW A ROUTE FIRST: CLICK A TILE'); return; }
  initAudio(); sfx.go();
  P.phase = 'run'; P.runT = 0; P.fx = []; P.failInfo = null;
  const s = S.initState(P.w); P.run = { cur: s, next: null, ev: [], t: 0, stepIdx: 0 }; prepNext();
  P.tipT = 0;
}
function prepNext() { const P = game.P, r = P.run; const a = P.plan[r.t]; if (a === undefined) { r.next = null; return; } const st = S.step(P.w, r.cur, a); r.next = st.s; r.ev = st.ev; r.act = a; }
function arrive() {
  const P = game.P, r = P.run;
  if (!r.next) { // plan ran out
    P.phase = 'caught'; P.failTick = r.t; P.failInfo = { type: 'out', t: r.t }; sfx.buzz(); return;
  }
  r.cur = r.next; r.t++;
  for (const e of r.ev) {
    if (e.e === 'move') sfx.step(r.t);
    else if (e.e === 'wait') sfx.wait();
    else if (e.e === 'crack') { sfx.crack(); spark(P.w.safe.x, P.w.safe.y, PAL.lgrey, 4); }
    else if (e.e === 'open') { sfx.open(); coins(P.w.safe.x, P.w.safe.y, 10); }
    else if (e.e === 'loot') { sfx.loot(); const l = P.w.loot[e.i]; coins(l.x, l.y, l.kind === 'g' ? 4 : 7, l.kind === 'g'); }
    else if (e.e === 'key') { sfx.key(); spark(r.cur.x, r.cur.y, PAL.yellow, 8); }
    else if (e.e === 'door') sfx.door();
  }
  if (r.cur.caught) { P.phase = 'caught'; P.failTick = r.cur.caught.t; P.failInfo = r.cur.caught; sfx.spotted(); sfx.alarm(); P.shake = 0.4; return; }
  if (r.cur.won) { win(); return; }
  prepNext();
}
function win() {
  const P = game.P; const f = P.run.cur;
  const st = S.starsFor(P.w, f, P.par).map(Boolean);
  const old = starsOf(P.n); const nw = old.map((v, i) => (v || st[i]) ? 1 : 0);
  const prevBest = save.best[P.n];
  save.stars[P.n] = nw; save.best[P.n] = Math.min(prevBest ?? 999, f.t);
  if (P.n >= save.unlocked && P.n < LEVELS.length) save.unlocked = P.n + 1;
  persist();
  P.phase = 'won'; P.result = { ticks: f.t, stars: st, newBest: prevBest === undefined || f.t < prevBest, loot: countBits(f.loot), lootAll: P.w.loot.length, at: game.time };
  sfx.win(); coins(f.x, f.y, 16);
  st.forEach((on, i) => { if (on) setTimeout(() => sfx.star(i), 700 + i * 260); });
}
const countBits = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
function editPlan() { const P = game.P; if (P.phase === 'plan') return; const ft = P.failTick; P.phase = 'plan'; P.run = null; P.fx = []; if (ft >= 0) P.scrub = Math.max(0, ft); else P.scrub = Math.min(P.scrub, P.plan.length); sfx.click(); }

// ---------------------------------------------------------------- effects
function coins(tx, ty, n, gem = false) {
  const P = game.P; for (let i = 0; i < n; i++) P.fx.push({ k: 'coin', sx: P.ox + tx * T + 8, sy: P.oy + ty * T + 6, t: -i * 0.04, d: 0.55 + Math.random() * 0.2, a: Math.random() * 6.28, gem });
}
function spark(tx, ty, c, n) { const P = game.P; for (let i = 0; i < n; i++) P.fx.push({ k: 'spark', x: P.ox + tx * T + 8, y: P.oy + ty * T + 6, vx: (Math.random() - 0.5) * 60, vy: -Math.random() * 60 - 10, t: 0, d: 0.4, c }); }

// ---------------------------------------------------------------- update
function update(dt) {
  game.time += dt;
  if (game.toast) { game.toast.t -= dt; if (game.toast.t <= 0) game.toast = null; }
  const P = game.P;
  if (game.scene !== 'play' || !P) return;
  P.intro = Math.max(0, P.intro - dt); if (P.shake) P.shake = Math.max(0, P.shake - dt);
  if ((P.phase === 'plan' || P.phase === 'live' || P.phase === 'rt') && P.tipT > 0 && P.plan.length) P.tipT = Math.min(P.tipT, 4) - dt;
  if (P.phase === 'rt' && !game.pause) rtUpdate(dt);
  if (P.phase === 'live' && P.run.next && !game.pause) {
    P.runT += dt * ((window.__OT && window.__OT.tps) || LIVE_TPS);
    if (P.runT >= P.run.t + 1) arrive();
  }
  if (P.phase === 'run' && !game.pause) {
    const tps = (window.__OT && window.__OT.tps) || (P.fast ? TPS * FAST : TPS);
    P.runT += dt * tps;
    let guard = 0;
    while (P.phase === 'run' && P.runT >= P.run.t + 1 && guard++ < 500) arrive();
    if (P.phase !== 'run') P.runT = P.run ? P.run.t : 0;
  }
  for (const f of P.fx) f.t += dt;
  P.fx = P.fx.filter(f => f.t < f.d);
}

// ---------------------------------------------------------------- drawing helpers
function panel(x, y, w, h, fill = PAL.dnavy, edge = PAL.black, hi = PAL.navy) {
  R(b, x, y, w, h, edge); R(b, x + 1, y + 1, w - 2, h - 2, fill); R(b, x + 1, y + 1, w - 2, 1, hi);
}
function button(id, x, y, w, h, label, o = {}) {
  const hot = mouse.inside && mouse.x >= x && mouse.y >= y && mouse.x < x + w && mouse.y < y + h && !o.disabled;
  const down = hot && mouse.down;
  const base = o.disabled ? PAL.navy : o.color || PAL.slate;
  const top = o.disabled ? PAL.navy : o.light || PAL.grey;
  R(b, x, y, w, h, PAL.black);
  R(b, x + 1, y + 1 + (down ? 1 : 0), w - 2, h - 3, hot ? top : base);
  R(b, x + 1, y + 1 + (down ? 1 : 0), w - 2, 1, o.disabled ? PAL.slate : PAL.white);
  if (!down) R(b, x + 1, y + h - 2, w - 2, 1, o.dark || PAL.dnavy);
  if (o.on) { R(b, x + 2, y + h - 4, w - 4, 1, PAL.yellow); }
  const size = o.size || 8;
  const ty = y + ((h - 1 - size * 0.62) >> 1) + (down ? 1 : 0) - 1;
  if (o.hint) { txt(label, x + 5, ty, { c: o.disabled ? PAL.slate : o.tc || PAL.white, size }); txt(o.hint, x + w - 4, ty + 1, { c: o.disabled ? PAL.slate : PAL.lgrey, size: 8, align: 'right', shadow: false, alpha: 0.7 }); }
  else txt(label, x + w / 2, ty, { c: o.disabled ? PAL.slate : o.tc || PAL.white, size, align: 'center' });
  if (!o.disabled) buttons.push({ id, x, y, w, h });
}
function star(x, y, on, big = false) {
  const s = big ? ['..1..', '.111.', '11111', '.111.', '1.1.1'] : ['.1.', '111', '1.1'];
  const c = on ? PAL.gold : PAL.navy, o = PAL.black;
  s.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') { R(b, x + i, y + j, 1, 1, c); } });
  if (big && on) R(b, x + 2, y + 1, 1, 1, PAL.yellow);
  void o;
}
function bigStar(x, y, on, scale = 2) {
  const s = ['....1....', '...111...', '...111...', '111111111', '.1111111.', '..11111..', '..11.11..', '.11...11.', '.1.....1.'];
  s.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === '1') R(b, x + i * scale, y + j * scale, scale, scale, on ? (j < 3 ? PAL.yellow : PAL.gold) : PAL.navy); });
}

// ---------------------------------------------------------------- world view for a given tick
function viewAt(P) {
  // returns what to draw: tick for world objects, thief state(s) and interpolation
  if (P.rt && !P.planMode) return rtView(P);
  if (P.phase === 'plan') {
    const t = P.hoverTick ?? P.scrub; const st = P.trace.states; const s = st[Math.min(t, st.length - 1)];
    return { t, f: 0, thief: s, prev: s, ghost: true, danger: t < st.length ? s.danger : null };
  }
  const r = P.run;
  if (isRun(P) && r.next) {
    const f = Math.min(1, Math.max(0, P.runT - r.t));
    return { t: r.t, f, thief: r.next, prev: r.cur, ghost: false };
  }
  return { t: r.t, f: 0, thief: r.cur, prev: r.cur, ghost: false, danger: r.cur.caught };
}

function drawWorld(P) {
  const w = P.w, v = viewAt(P), time = game.time;
  let ox = P.ox, oy = P.oy;
  if (P.shake) { ox += Math.round((Math.random() - 0.5) * 4 * P.shake * 5); oy += Math.round((Math.random() - 0.5) * 3 * P.shake * 5); }
  const tW = v.f >= 0.5 ? v.t + 1 : v.t;  // tick whose cones / lasers are shown
  b.drawImage(P.bg, ox, oy);
  // doors, exit, cameras (part of the walls)
  const th = v.thief;
  const ready = th.crack >= w.crack;
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const ch = S.tile(w, x, y);
    if (ch === 'R' || ch === 'B' || ch === 'Y') {
      const onIt = (th.x === x && th.y === y) || (v.prev.x === x && v.prev.y === y && v.f < 0.5);
      G.drawDoor(b, ox + x * T, oy + y * T, ch.toLowerCase(), onIt, !!(th.keys & keyBitFor(w, ch.toLowerCase())));
    }
  }
  G.drawExit(b, ox + w.exit.x * T, oy + w.exit.y * T, ready, time);
  // flat items
  if (P.rt && !P.planMode) {
    P.coins.forEach((c, i) => { if (!P.rt.got.has(i)) G.drawCoin(b, ox + c.x * T, oy + c.y * T, time); });
    w.loot.forEach((l, i) => { if (!(th.loot & (1 << i))) G.drawGlow(b, ox + l.x * T, oy + l.y * T, time, l.kind === 'g' ? 'rgba(44,232,245,0.6)' : 'rgba(254,231,97,0.6)'); });
  }
  w.loot.forEach((l, i) => { if (!(th.loot & (1 << i))) G.drawLoot(b, ox + l.x * T, oy + l.y * T, l.kind, time); else if (P.phase === 'plan') { b.globalAlpha = 0.25; G.drawLoot(b, ox + l.x * T, oy + l.y * T, l.kind, 0); b.globalAlpha = 1; } });
  w.keys.forEach(k => { if (!(th.keys & w.keyBit(k.color))) G.drawKeycard(b, ox + k.x * T, oy + k.y * T, k.color, time); });
  // patrol hints + cones
  if (P.phase === 'plan') G.drawPatrols(b, w, ox, oy);
  if (P.phase === 'live' && !P.run.next) { b.save(); b.globalAlpha = 0.4; G.drawCones(b, w, v.t + 1, ox, oy, time, 'next'); b.restore(); }
  G.drawCones(b, w, tW, ox, oy, time);
  // plan route
  if (P.phase === 'plan' || P.phase === 'caught') drawPlanPath(P, ox, oy, v.t);
  if (P.phase === 'plan') drawHoverRoute(P, ox, oy);
  G.drawExitSign(b, ox + w.exit.x * T, oy + w.exit.y * T, ready, time);
  // tall things sorted by row, actors among them
  const items = [];
  for (const p of P.props) items.push({ y: p.y * T + (p.ch === 'T' ? 0 : 8), draw: () => G.drawProp(b, w, P.theme, p, ox, oy, time, th.x === p.x && th.y === p.y) });
  items.push({ y: w.safe.y * T + 8, draw: () => G.drawSafe(b, ox + w.safe.x * T, oy + w.safe.y * T, th.crack, w.crack, ready, time, (P.rt && !P.planMode) ? P.rt.cracking : v.prev.crack !== th.crack || (isRun(P) && P.run.act === 'W' && S.adjSafe(w, v.prev.x, v.prev.y) && !ready)) });
  const caughtBy = (P.phase === 'caught' && P.failInfo && P.failInfo.type !== 'out') ? P.failInfo : (P.phase === 'plan' && v.danger) ? v.danger : null;
  w.guards.forEach((g, i) => {
    const a = S.guardAt(g, v.t), c = S.guardAt(g, v.t + 1);
    const moving = a.x !== c.x || a.y !== c.y;
    const gx = a.x + (c.x - a.x) * v.f, gy = a.y + (c.y - a.y) * v.f;
    const face = v.f >= 0.5 ? c.f : a.f;
    const fr = moving && isRun(P) ? 1 + ((Math.floor(v.f * 2) + v.t) % 2) : (P.phase === 'plan' && moving ? 1 + (v.t % 2) : 0);
    const look = S.guardAt(g, (v.f >= 0.5 ? v.t + 1 : v.t) + 1).f;
    const alert = caughtBy && (caughtBy.type === 'guard' || caughtBy.type === 'bump' || caughtBy.type === 'swap') && caughtBy.who === i;
    items.push({ y: gy * T + 9, draw: () => G.drawGuard(b, ox + gx * T, oy + gy * T - 3, face, fr, look, { alert, time }) });
  });
  // thief (real during run, ghost during plan)
  const tq = v.tf ?? v.f;
  const tx = v.prev.x + (th.x - v.prev.x) * tq, ty = v.prev.y + (th.y - v.prev.y) * tq;
  const moving = v.prev.x !== th.x || v.prev.y !== th.y;
  const tf = moving && (v.tf !== undefined ? v.tf < 1 : isRun(P)) ? 1 + ((Math.floor(tq * 2) + (P.rt ? P.rt.steps : v.t)) % 2) : 0;
  const hide = S.isHide(w, th.x, th.y) && tq > 0.6 || (S.isHide(w, th.x, th.y) && !moving);
  const sack = countBits(th.loot) + (ready ? 1 : 0);
  items.push({ y: ty * T + 10, draw: () => {
    const px = ox + tx * T, py = oy + ty * T - 3;
    if (v.ghost) {
      const flash = v.danger && Math.floor(time * 6) % 2;
      G.drawThief(b, px - 1, py, th.face || 'D', 0, { white: true, alpha: 0.9 }); G.drawThief(b, px + 1, py, th.face || 'D', 0, { white: true, alpha: 0.9 });
      G.drawThief(b, px, py - 1, th.face || 'D', 0, { white: true, alpha: 0.9 }); G.drawThief(b, px, py + 1, th.face || 'D', 0, { white: true, alpha: 0.9 });
      G.drawThief(b, px, py, th.face || 'D', 0, { red: !!flash, alpha: hide ? 0.6 : 1, sack, hide });
      if (v.danger) G.bubble(b, px + 8, py - 6, '!', time);
    } else {
      G.drawThief(b, px, py, th.face || 'D', tf, { sack, hide });
      if (P.phase === 'caught' && P.failInfo && P.failInfo.type === 'laser') G.drawThief(b, px, py, th.face || 'D', tf, { red: true, alpha: 0.5 + 0.5 * Math.sin(time * 20) });
    }
  } });
  items.sort((p, q) => p.y - q.y); for (const it of items) it.draw();
  // cameras on top of walls
  w.cams.forEach((c, i) => { const alert = caughtBy && caughtBy.type === 'cam' && caughtBy.who === i; G.drawCamera(b, ox + c.x * T, oy + c.y * T, S.camAt(c, tW), time, alert); if (alert) G.bubble(b, ox + c.x * T + 8, oy + c.y * T + 2, '!', time); });
  G.drawLasers(b, w, tW, ox, oy, time);
  // effects
  for (const f of P.fx) {
    if (f.t < 0) continue;
    if (f.k === 'coin') {
      const k = f.t / f.d, tx2 = ox + tx * T + 10, ty2 = oy + ty * T + 2;
      const x = f.sx + (tx2 - f.sx) * k + Math.cos(f.a) * 10 * Math.sin(k * 3.14), y = f.sy + (ty2 - f.sy) * k - Math.sin(k * 3.14) * 18;
      if (f.gem) { R(b, x - 1, y - 1, 3, 3, PAL.cyan); R(b, x, y - 1, 1, 1, PAL.white); } else { R(b, x - 1, y - 1, 3, 3, PAL.gold); R(b, x - 1, y - 1, 1, 1, PAL.yellow); }
    } else if (f.k === 'spark') { R(b, f.x + f.vx * f.t, f.y + f.vy * f.t + 80 * f.t * f.t, 1, 1, f.c); }
  }
  // alarm wash
  if (P.phase === 'caught' && P.failInfo && P.failInfo.type !== 'out') {
    const a = 0.16 + 0.12 * Math.sin(time * 10);
    b.fillStyle = `rgba(255,0,68,${a.toFixed(3)})`; b.fillRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
  }
}
function keyBitFor(w, c) { const i = w.keyColors.indexOf(c); return i < 0 ? 0 : 1 << i; }

function drawPlanPath(P, ox, oy, viewT) {
  const st = P.trace.states; if (st.length < 2) return;
  const cx = s => ox + s.x * T + 8, cy = s => oy + s.y * T + 9;
  // dotted line
  for (let i = 1; i < st.length; i++) {
    const a = st[i - 1], c = st[i]; if (a.x === c.x && a.y === c.y) continue;
    const past = i <= viewT;
    for (let k = 0; k < 16; k += 3) {
      const x = cx(a) + (cx(c) - cx(a)) * k / 16, y = cy(a) + (cy(c) - cy(a)) * k / 16;
      R(b, x - 1, y - 1, 3, 3, PAL.black); R(b, x, y, 1, 1, past ? PAL.lgrey : PAL.white);
    }
  }
  // step numbers + wait badges, merged per tile
  const tiles = new Map();
  for (let i = 1; i < st.length; i++) {
    const s = st[i], k = s.x + ',' + s.y; if (!tiles.has(k)) tiles.set(k, { x: s.x, y: s.y, first: i, waits: 0 });
    const e = tiles.get(k); if (st[i].act === 'W') e.waits++; else e.last = i; e.lastAny = i;
  }
  for (const e of tiles.values()) {
    const px = ox + e.x * T, py = oy + e.y * T;
    const n = e.last ?? e.first;
    G.digits(b, n, px + 1, py + 1, n <= viewT ? PAL.grey : PAL.yellow);
    if (e.waits) { const dw = e.waits > 9 ? 7 : 3, wx = px + 15 - dw - 7, wy = py + 10; R(b, wx - 1, wy - 1, dw + 9, 7, PAL.black); clock(wx, wy); G.digits(b, e.waits, wx + 6, wy, PAL.cyan, null); }
  }
  // the end of the plan
  const e = st[st.length - 1];
  const px = ox + e.x * T, py = oy + e.y * T, pulse = Math.floor(game.time * 3) % 2;
  b.fillStyle = pulse ? PAL.white : PAL.yellow; b.fillRect(px, py, T, 1); b.fillRect(px, py + T - 1, T, 1); b.fillRect(px, py, 1, T); b.fillRect(px + T - 1, py, 1, T);
  // where it went wrong last time
  if (P.failTick >= 0 && P.failTick < st.length) { const f = st[P.failTick]; cross(ox + f.x * T + 4, oy + f.y * T + 4); }
}
const CLOCK = ['.111.', '1.1.1', '1.111', '1...1', '.111.'];
function clock(x, y) { CLOCK.forEach((r, j) => { for (let i = 0; i < 5; i++) if (r[i] === '1') R(b, x + i, y + j, 1, 1, PAL.cyan); }); }
function cross(x, y) { for (let i = 0; i < 8; i++) { R(b, x + i - 1, y + i - 1, 3, 3, PAL.black); R(b, x + 7 - i - 1, y + i - 1, 3, 3, PAL.black); } for (let i = 0; i < 8; i++) { R(b, x + i, y + i, 1, 1, PAL.hot); R(b, x + 7 - i, y + i, 1, 1, PAL.hot); } }

function hoverTile() {
  const P = game.P; if (!P) return null;
  const x = Math.floor((mouse.x - P.ox) / T), y = Math.floor((mouse.y - P.oy) / T);
  if (x < 0 || y < 0 || x >= P.w.W || y >= P.w.H) return null; return { x, y };
}
function drawHoverRoute(P, ox, oy) {
  if (!mouse.inside || game.pause || mouse.down) return;
  const h = hoverTile(); if (!h) return;
  const px = ox + h.x * T, py = oy + h.y * T;
  b.fillStyle = 'rgba(255,255,255,0.55)'; b.fillRect(px, py, T, 1); b.fillRect(px, py + T - 1, T, 1); b.fillRect(px, py, 1, T); b.fillRect(px + T - 1, py, 1, T);
  const e = planEnd(); if (e.won) return;
  const key = h.x + ',' + h.y + ',' + P.plan.length;
  if (!P.routeCache || P.routeCache.key !== key) P.routeCache = { key, r: S.route(P.w, e, h, e.keys) };
  const r = P.routeCache.r; if (!r || !r.length) return;
  let x = e.x, y = e.y;
  for (const a of r) { const [dx, dy] = S.DIRS[a]; for (let k = 0; k < 16; k += 4) R(b, ox + x * T + 8 + dx * k, oy + y * T + 9 + dy * k, 1, 1, 'rgba(255,255,255,0.6)'); x += dx; y += dy; }
}

// ---------------------------------------------------------------- HUD
function drawTopBar(P) {
  R(b, 0, 0, VW, 14, PAL.black); R(b, 0, 13, VW, 1, PAL.dnavy);
  const th = G.THEME[P.theme];
  txt(String(P.n).padStart(2, '0'), 4, 3, { c: PAL.gold });
  txt(P.def.name.toUpperCase(), 20, 3, { c: PAL.white });
  if (P.rt && !P.planMode) {
    txt('TIME', 160, 3, { c: PAL.grey }); txt(P.rt.time.toFixed(1), 186, 3, { c: PAL.white });
    starsOf(P.n).forEach((on, i) => star(VW - 18 + i * 5, 5, on));
    return;
  }
  const v = viewAt(P); const t = P.phase === 'plan' ? v.t : P.run ? P.run.t : 0;
  const nx = 122;
  txt('TICK', nx, 3, { c: PAL.grey }); txt(String(t), nx + 24, 3, { c: PAL.white });
  txt('STEPS', nx + 44, 3, { c: PAL.grey }); txt(String(P.plan.length), nx + 74, 3, { c: P.plan.length > P.par ? PAL.salmon : PAL.white });
  txt('PAR', nx + 94, 3, { c: PAL.grey }); txt(String(P.par), nx + 112, 3, { c: PAL.gold });
  // best stars, then keys and loot (as of the tick on screen), right to left
  const st = starsOf(P.n); st.forEach((on, i) => star(VW - 18 + i * 5, 5, on));
  const s = v.thief;
  let x = VW - 22;
  [...P.w.keyColors].reverse().forEach(c => { const has = s.keys & P.w.keyBit(c); R(b, x - 7, 4, 7, 6, PAL.black); R(b, x - 6, 5, 5, 4, has ? { r: PAL.red, b: PAL.sky, y: PAL.gold }[c] : PAL.navy); if (has) R(b, x - 6, 6, 5, 1, PAL.black); x -= 9; });
  if (P.w.loot.length) { const got = countBits(s.loot), str = got + '/' + P.w.loot.length; x -= 2; txt(str, x, 3, { c: got === P.w.loot.length ? PAL.gold : PAL.lgrey, align: 'right' }); const lx = x - textW(str) - 9; R(b, lx + 1, 4, 5, 2, PAL.cyan); R(b, lx, 6, 7, 2, PAL.sky); R(b, lx + 2, 8, 3, 2, PAL.blue); }
  void th;
}
function drawSide(P) {
  if (P.rt && !P.planMode) return drawSideRt(P);
  const x = SIDE.x, w = SIDE.w; let y = 16;
  const plan = P.phase === 'plan', run = P.phase === 'run';
  if (P.phase === 'live' || ((P.phase === 'caught' || P.phase === 'won') && !P.planMode)) {
    if (P.phase === 'caught') button('back', x, y, w, 22, 'BACK  Z', { color: PAL.dred, light: PAL.red, dark: PAL.plum });
    else txt('WASD', x + w / 2, y + 2, { c: PAL.gold, size: 16, align: 'center' });
    y += 25;
    button('wait', x, y, w, 15, 'WAIT', { hint: 'SPC', disabled: P.phase !== 'live' }); y += 18;
    button('back', x, y, w, 15, 'STEP BACK', { hint: 'Z', disabled: !P.run || P.run.t === 0 }); y += 18;
    button('restart', x, y, w, 15, 'RESTART', { hint: 'R' }); y += 18;
    button('menu', x, y, w, 15, 'MENU', { hint: 'ESC' }); y += 22;
    for (const l of wrap('Each key is one tick. Red cones show where guards look next.', w)) { txt(l, x, y, { c: PAL.grey, shadow: false }); y += 8; }
    return;
  }
  if (run) button('stop', x, y, w, 22, 'STOP', { color: PAL.dred, light: PAL.red, dark: PAL.plum, size: 8 });
  else if (P.phase === 'caught') button('edit', x, y, w, 22, 'EDIT  R', { color: PAL.dred, light: PAL.red, dark: PAL.plum });
  else button('go', x, y, w, 22, 'GO!', { color: PAL.dgreen, light: PAL.green, dark: PAL.forest, size: 16, disabled: P.phase === 'won' });
  y += 25;
  button('fast', x, y, w, 15, 'FAST', { hint: 'F', on: P.fast }); y += 18;
  button('wait', x, y, w, 15, 'WAIT', { hint: 'SPC', disabled: !plan }); y += 18;
  button('undo', x, y, w, 15, 'UNDO', { hint: 'BKSP', disabled: !plan || !P.plan.length }); y += 18;
  button('ins', x, y, w, 15, '+WAIT', { hint: 'I', disabled: !plan }); y += 18;
  button('del', x, y, w, 15, '-WAIT', { hint: 'DEL', disabled: !plan || !P.plan.includes('W') }); y += 18;
  button('cut', x, y, w, 15, 'CUT', { hint: 'X', disabled: !plan || P.scrub >= P.plan.length }); y += 18;
  button('clear', x, y, w, 15, 'CLEAR', { hint: 'C', disabled: !plan || !P.plan.length }); y += 18;
  button('menu', x, y, w, 15, 'MENU', { hint: 'ESC' });
}
function drawScrubber(P) {
  if (P.rt && !P.planMode) {
    R(b, 0, SCRUB.y - 3, VW, VH - SCRUB.y + 3, PAL.black);
    txt('RUN WITH WASD  -  GRAB THE GOLD  -  CRACK THE SAFE  -  ESCAPE', VW / 2, SCRUB.y + 3, { c: PAL.slate, align: 'center', shadow: false });
    return;
  }
  const S0 = SCRUB, N = maxScrub();
  R(b, 0, S0.y - 3, VW, VH - S0.y + 3, PAL.black);
  const tx = t => S0.x + Math.round(t * (S0.w - 1) / N);
  const yb = S0.y + 8;
  // plan span
  R(b, S0.x, yb - 1, S0.w, 3, PAL.dnavy);
  R(b, S0.x, yb - 1, tx(P.plan.length) - S0.x + 1, 3, PAL.slate);
  // tick marks
  for (let t = 0; t <= N; t++) { const x = tx(t); const big = t % 10 === 0; R(b, x, yb + 2, 1, big ? 3 : 2, big ? PAL.grey : PAL.navy); if (big) G.digits(b, t, x - (t >= 10 ? 3 : 1), yb + 6, PAL.grey, null); }
  // par marker
  { const x = tx(P.par); R(b, x, yb - 4, 1, 9, PAL.gold); R(b, x - 1, yb - 5, 3, 1, PAL.gold); }
  // fail mark
  if (P.failTick >= 0) { const x = tx(P.failTick); for (let i = 0; i < 5; i++) { R(b, x - 2 + i, yb - 5 + i, 1, 1, PAL.hot); R(b, x + 2 - i, yb - 5 + i, 1, 1, PAL.hot); } }
  // playhead
  const ph = P.phase === 'plan' ? (P.hoverTick ?? P.scrub) : (P.run ? P.run.t + (isRun(P) ? Math.min(1, P.runT - P.run.t) : 0) : 0);
  const x = S0.x + Math.round(ph * (S0.w - 1) / N);
  R(b, x - 2, S0.y - 2, 5, 4, PAL.white); R(b, x - 1, S0.y + 2, 3, 1, PAL.white); R(b, x, S0.y + 2, 1, 8, PAL.white);
  if (P.phase === 'plan' && P.hoverTick !== null && P.hoverTick !== P.scrub) { const x2 = tx(P.scrub); R(b, x2, S0.y + 2, 1, 8, PAL.grey); }
  if (P.phase !== 'plan') return;
  buttons.push({ id: 'scrub', x: S0.x - 4, y: S0.y - 3, w: S0.w + 8, h: S0.h + 3 });
}
function drawTooltip(P) {
  if (P.phase !== 'plan' || game.pause || !mouse.inside) return;
  const h = hoverTile(); const st = P.trace.states;
  let tick = null;
  if (h) { for (let i = st.length - 1; i >= 1; i--) if (st[i].x === h.x && st[i].y === h.y) { tick = i; if (P.scrub <= i) { /* keep the latest */ } break; } }
  if (h && tick === null && h.x === P.w.start.x && h.y === P.w.start.y) tick = 0;
  if (mouse.y >= SCRUB.y - 3 && mouse.y < SCRUB.y + SCRUB.h && mouse.x < VW) tick = P.hoverTick;
  if (tick === null || tick === undefined) return;
  const s = st[Math.min(tick, st.length - 1)];
  const lines = [];
  const act = tick === 0 ? 'START' : tick >= st.length ? 'PLAN OVER' : ({ U: 'MOVE UP', D: 'MOVE DOWN', L: 'MOVE LEFT', R: 'MOVE RIGHT', W: 'WAIT' })[s.act];
  lines.push(['TICK ' + tick + '  ' + act, PAL.white]);
  const d = tick < st.length ? s.danger : null;
  if (d) lines.push([{ guard: 'SEEN BY A GUARD!', cam: 'ON CAMERA!', laser: 'HIT A LASER!', bump: 'WALKED INTO A GUARD!', swap: 'RAN INTO A GUARD!' }[d.type], PAL.salmon]);
  else if (S.isHide(P.w, s.x, s.y)) lines.push(['HIDDEN', PAL.green]);
  else lines.push(['UNSEEN', PAL.green]);
  if (s.crack > 0 && s.crack < P.w.crack) lines.push(['SAFE ' + s.crack + '/' + P.w.crack, PAL.gold]);
  else if (s.crack >= P.w.crack) lines.push(['SAFE OPEN', PAL.gold]);
  const wpx = Math.max(...lines.map(l => textW(l[0]))) + 8, hpx = lines.length * 9 + 4;
  let x = mouse.x + 10, y = mouse.y + 8; if (x + wpx > BOARD.x + BOARD.w) x = mouse.x - wpx - 6; if (y + hpx > SCRUB.y - 4) y = mouse.y - hpx - 4;
  panel(x, y, wpx, hpx, PAL.black, PAL.grey, PAL.dnavy);
  lines.forEach((l, i) => txt(l[0], x + 4, y + 3 + i * 9, { c: l[1], shadow: false }));
}
function drawMessages(P) {
  // level intro card
  if (P.intro > 0 && (P.phase === 'plan' || P.phase === 'live' || P.phase === 'rt')) {
    const a = Math.min(1, P.intro * 2);
    const y = BOARD.y + 54;
    b.globalAlpha = a; panel(BOARD.x + 28, y, BOARD.w - 56, 36, PAL.black, PAL.gold, PAL.dnavy); b.globalAlpha = 1;
    txt(G.THEME[P.theme].name + '  ' + String(P.n).padStart(2, '0') + ' / 24', BOARD.x + BOARD.w / 2, y + 6, { c: PAL.gold, align: 'center', alpha: a });
    txt(P.def.name.toUpperCase(), BOARD.x + BOARD.w / 2, y + 17, { c: PAL.white, size: 16, align: 'center', alpha: a });
  }
  // tip strip
  if ((P.phase === 'plan' || P.phase === 'live' || P.phase === 'rt') && P.tipT > 0 && P.intro <= 0 && P.def.tip) {
    const lines = wrap(P.def.tip, BOARD.w - 16);
    const h = lines.length * 9 + 6, y = BOARD.y + BOARD.h - h - 2;
    const near = mouse.inside && mouse.y > y - 20 && mouse.x < BOARD.x + BOARD.w; const al = near ? 0.25 : Math.min(1, P.tipT);
    b.globalAlpha = al; b.fillStyle = 'rgba(24,20,37,0.85)'; b.fillRect(BOARD.x + 2, y, BOARD.w - 4, h);
    R(b, BOARD.x + 2, y, 2, h, PAL.gold); b.globalAlpha = 1;
    lines.forEach((l, i) => txt(l, BOARD.x + 9, y + 4 + i * 9, { c: PAL.sand, shadow: false, alpha: al }));
  }
  if (P.phase === 'caught') {
    const fi = P.failInfo || {};
    const title = fi.type === 'out' ? 'OUT OF STEPS' : fi.type === 'laser' ? 'ZAPPED!' : fi.type === 'cam' ? 'CAUGHT ON CAMERA!' : 'SPOTTED!';
    const sub = fi.type === 'out' ? 'THE PLAN ENDED AT TICK ' + P.failTick + '. KEEP DRAWING.' : (P.planMode ? 'ON TICK ' + P.failTick + '.  CHANGE ONE STEP AND GO AGAIN.' : (P.rt ? 'PRESS ANY KEY TO GO AGAIN' : 'Z TAKES THAT STEP BACK.   R STARTS AGAIN.'));
    const thy = P.oy + P.run.cur.y * T; const y = thy < BOARD.y + BOARD.h / 2 ? BOARD.y + BOARD.h - 40 : BOARD.y + 4;
    panel(BOARD.x + 10, y, BOARD.w - 20, 36, PAL.black, PAL.hot, PAL.dred);
    txt(title, BOARD.x + BOARD.w / 2, y + 5, { c: PAL.hot, size: 16, align: 'center' });
    txt(sub, BOARD.x + BOARD.w / 2, y + 24, { c: PAL.white, align: 'center', shadow: false });
  }
  if (P.phase === 'won' && P.result) drawResult(P);
  if (game.toast) {
    const s = game.toast.s, wpx = textW(s) + 12, x = BOARD.x + (BOARD.w - wpx) / 2, y = BOARD.y + 3;
    if (P.phase === 'plan' || P.phase === 'live' || P.phase === 'rt') { panel(x, y, wpx, 13, PAL.black, PAL.slate, PAL.dnavy); txt(s, x + wpx / 2, y + 3, { c: PAL.yellow, align: 'center', shadow: false, alpha: Math.min(1, game.toast.t * 3) }); }
  }
}
function wrap(s, maxW) {
  const words = s.toUpperCase().split(' '); const out = []; let line = '';
  for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (textW(t) > maxW && line) { out.push(line); line = wd; } else line = t; }
  if (line) out.push(line); return out;
}
function drawResult(P) {
  const r = P.result, age = game.time - r.at;
  if (age < 0.6) return;
  const x = BOARD.x + 24, y = BOARD.y + 22, w = BOARD.w - 48, h = 134;
  panel(x, y, w, h, PAL.black, PAL.gold, PAL.dnavy);
  txt('CLEAN GETAWAY!', x + w / 2, y + 7, { c: PAL.gold, size: 16, align: 'center' });
  const labels = P.rt && !P.planMode ? ['ESCAPED', 'ALL GOLD', 'ALL LOOT'] : ['ESCAPED', 'PAR ' + P.par, 'ALL LOOT'];
  r.stars.forEach((on, i) => {
    const show = age > 0.7 + i * 0.26;
    const sx = x + 22 + i * 62, sy = y + 32;
    bigStar(sx + 6, sy - (show && on ? Math.max(0, Math.round((0.25 - (age - 0.7 - i * 0.26)) * 20)) : 0), show && on, 3);
    txt(labels[i], sx + 19, sy + 32, { c: on ? PAL.white : PAL.slate, align: 'center', shadow: false });
  });
  if (r.secs !== undefined) txt('TIME ' + r.secs.toFixed(1) + 'S' + (r.newBest ? '  BEST!' : '') + '     GOLD ' + r.coins + '/' + r.coinsAll + '     LOOT ' + r.loot + '/' + r.lootAll, x + w / 2, y + 80, { c: PAL.sand, align: 'center', shadow: false });
  else txt('TICKS  ' + r.ticks + (r.newBest ? '  NEW BEST' : '') + '      LOOT  ' + r.loot + '/' + r.lootAll, x + w / 2, y + 80, { c: PAL.sand, align: 'center', shadow: false });
  const by = y + h - 24;
  if (P.n < LEVELS.length) button('next', x + w - 74, by, 66, 17, 'NEXT  >', { color: PAL.dgreen, light: PAL.green, dark: PAL.forest });
  else button('levels', x + w - 74, by, 66, 17, 'THE END', { color: PAL.dgreen, light: PAL.green, dark: PAL.forest });
  button(P.planMode ? 'edit' : 'restart', x + 8, by, 66, 17, 'REPLAY', {});
  button('levels', x + 80, by, 48, 17, 'JOBS', {});
}

// ---------------------------------------------------------------- pause / help
function drawPause() {
  b.fillStyle = 'rgba(24,20,37,0.78)'; b.fillRect(0, 0, VW, VH);
  if (game.help) { drawHelp(); return; }
  const w = 132, h = 150, x = (VW - w) >> 1, y = (VH - h) >> 1;
  panel(x, y, w, h, PAL.dnavy, PAL.gold, PAL.navy);
  txt('PAUSED', x + w / 2, y + 7, { c: PAL.gold, size: 16, align: 'center' });
  let yy = y + 30;
  for (const [id, label] of [['resume', 'RESUME'], ['help', 'HOW TO PLAY'], ['clearp', 'RESTART'], ['levels', 'PICK A JOB'], ['music', 'MUSIC  ' + (save.music ? 'ON' : 'OFF')], ['sound', 'SOUND  ' + (save.sfx ? 'ON' : 'OFF')]]) {
    button(id, x + 10, yy, w - 20, 16, label, id === 'resume' ? { color: PAL.dgreen, light: PAL.green, dark: PAL.forest } : {}); yy += 19;
  }
}
const HELP = [
  ['THE JOB', 'Grab the gold, stand next to the safe until it cracks, then run out through the EXIT door.'],
  ['MOVE', 'Hold WASD or the arrow keys to run. On a phone, hold your finger on the side you want to go.'],
  ['DOORS', 'Coloured doors open when you walk into them. They block sight while shut.'],
  ['SEEN', 'End a tick in a cone, on a lit laser, on a guard or swapping with one and you are caught. Walls, pillars, safes and doors block sight. Glass and water do not. Plants and lockers hide you.'],
  ['CAUGHT', 'Press any key and you are straight back in. R restarts any time.'],
  ['STARS', 'Escape. Grab every gold coin. Grab the gems and cash bags.'],
];
function drawHelp() {
  const x = 10, y = 6, w = VW - 20, h = VH - 12;
  panel(x, y, w, h, PAL.dnavy, PAL.gold, PAL.navy);
  txt('HOW TO PLAY', x + w / 2, y + 4, { c: PAL.gold, align: 'center' });
  let yy = y + 15;
  for (const [hd, body] of HELP) {
    txt(hd, x + 6, yy, { c: PAL.gold, shadow: false });
    const lines = wrap(body, w - 60); lines.forEach((l, i) => txt(l, x + 52, yy + i * 8, { c: PAL.sand, shadow: false }));
    yy += Math.max(1, lines.length) * 8 + 3;
  }
  button('helpback', x + w - 60, y + h - 18, 54, 14, 'BACK', {});
}

// ---------------------------------------------------------------- title + attract
let attract = null;
function buildAttract() {
  const def = {
    name: 'title', theme: 'bank', crack: 99,
    map: [
      '#####################',
      '#...................#',
      '#...................#',
      '#..o.....o.....o....#',
      '#...................#',
      '#...................#',
      '#..........h........#',
      'S..G................X',
      '#....h..............#',
      '#...................#',
      '#..o.....o.....o....#',
      '#...................#',
      '#########$###########',
    ],
    guards: [{ face: 'R', route: 'R10 . l . L10 . r .' }],
  };
  const w = S.parseLevel(def);
  // hand-timed thief: tail him right, duck into the plant, slip out behind him, and away
  const path = [];
  for (let t = 0; t < 26; t++) {
    let x, y = 7, hid = false;
    if (t <= 10) x = 1 + t; else if (t <= 16) { x = 11; y = 6; hid = true; } else if (t <= 21) { x = 11 + (t - 16); } else x = -5;
    path.push({ x, y, hid });
  }
  return { w, bg: G.buildBackground(w, 'bank'), props: G.staticProps(w), path };
}
function drawTitle() {
  if (!attract) attract = buildAttract();
  const A = attract, w = A.w, time = game.time;
  const ox = 0, oy = 0;
  const tt = time * 4, t = Math.floor(tt) % 26, f = tt - Math.floor(tt);
  b.drawImage(A.bg, ox, oy);
  G.drawCones(b, w, f >= 0.5 ? t + 1 : t, ox, oy, time);
  const items = [];
  for (const p of A.props) items.push({ y: p.y * T + 8, draw: () => G.drawProp(b, w, 'bank', p, ox, oy, time, false) });
  const g = w.guards[0], a = S.guardAt(g, t), c = S.guardAt(g, t + 1);
  const gx = a.x + (c.x - a.x) * f, gy = a.y + (c.y - a.y) * f, mv = a.x !== c.x;
  items.push({ y: gy * T + 9, draw: () => G.drawGuard(b, ox + gx * T, oy + gy * T - 3, f >= 0.5 ? c.f : a.f, mv ? 1 + ((Math.floor(f * 2) + t) % 2) : 0, S.guardAt(g, t + 2).f, { time }) });
  const p0 = A.path[t], p1 = A.path[(t + 1) % 26];
  if (p0.x >= 0 && p1.x >= 0) {
    const x = p0.x + (p1.x - p0.x) * f, y = p0.y + (p1.y - p0.y) * f, mv2 = p0.x !== p1.x || p0.y !== p1.y;
    const face = p1.x > p0.x ? 'R' : p1.y < p0.y ? 'U' : p1.y > p0.y ? 'D' : p0.hid ? 'D' : 'R';
    items.push({ y: y * T + 10, draw: () => G.drawThief(b, ox + x * T, oy + y * T - 3, face, mv2 ? 1 + ((Math.floor(f * 2) + t) % 2) : 0, { hide: p0.hid && p1.hid, sack: 1 }) });
  }
  items.sort((p, q) => p.y - q.y); items.forEach(i => i.draw());
  // logo
  b.fillStyle = 'rgba(24,20,37,0.55)'; b.fillRect(0, 22, VW, 46);
  R(b, 0, 22, VW, 1, PAL.gold); R(b, 0, 67, VW, 1, PAL.gold);
  txt('ONE TILE', VW / 2 + 2, 26, { c: PAL.dred, size: 32, align: 'center', shadow: false });
  txt('ONE TILE', VW / 2, 24, { c: PAL.yellow, size: 32, align: 'center', sh: PAL.black });
  txt('A PIXEL HEIST.  PLAN IT.  RUN IT.  FIX ONE STEP.', VW / 2, 56, { c: PAL.sand, align: 'center' });
  const blink = Math.floor(time * 2) % 2;
  b.fillStyle = 'rgba(24,20,37,0.7)'; b.fillRect(0, 160, VW, 40);
  button('play', VW / 2 - 50, 166, 100, 22, 'PLAY', { color: PAL.dgreen, light: PAL.green, dark: PAL.forest, size: 16 });
  if (blink) txt('CLICK, TAP OR PRESS ANY KEY', VW / 2, 191, { c: PAL.grey, align: 'center', shadow: false });
  const ts = totalStars(); if (ts) { star(6, 6, true); txt(ts + ' / ' + LEVELS.length * 3, 12, 4, { c: PAL.gold }); }
}

// ---------------------------------------------------------------- level select
function drawSelect() {
  R(b, 0, 0, VW, VH, PAL.black);
  for (let i = 0; i < 40; i++) R(b, (i * 97) % VW, (i * 53) % VH, 1, 1, PAL.dnavy);
  txt('PICK A JOB', VW / 2, 4, { c: PAL.gold, align: 'center', size: 8 });
  button('title', 4, 2, 34, 12, '< BACK', { size: 8 });
  star(VW - 60, 6, true); txt(totalStars() + ' / ' + LEVELS.length * 3, VW - 54, 4, { c: PAL.gold });
  const cw = 50, ch = 32, gx = 4, x0 = (VW - (6 * cw + 5 * gx)) >> 1;
  THEMES.forEach((theme, r) => {
    const th = G.THEME[theme]; const y0 = 18 + r * 49;
    txt(th.name, x0, y0, { c: th.trim === PAL.sky ? PAL.sky : PAL.gold, shadow: false });
    for (let c = 0; c < 6; c++) {
      const n = r * 6 + c + 1, x = x0 + c * (cw + gx), y = y0 + 11;
      const locked = n > save.unlocked && !params.has('unlockall');
      const sel = game.sel === n - 1;
      const hot = !locked && mouse.inside && mouse.x >= x && mouse.y >= y && mouse.x < x + cw && mouse.y < y + ch;
      R(b, x, y, cw, ch, sel || hot ? PAL.yellow : PAL.black);
      R(b, x + 1, y + 1, cw - 2, ch - 2, locked ? PAL.dnavy : th.card);
      if (!locked) { R(b, x + 1, y + 1, cw - 2, 1, th.wallEdge); R(b, x + 1, y + ch - 7, cw - 2, 6, th.wallFace); }
      if (locked) { // padlock
        R(b, x + 21, y + 9, 8, 7, PAL.slate); R(b, x + 22, y + 6, 6, 1, PAL.slate); R(b, x + 22, y + 6, 1, 4, PAL.slate); R(b, x + 27, y + 6, 1, 4, PAL.slate); R(b, x + 24, y + 11, 2, 3, PAL.dnavy);
        txt(String(n), x + 4, y + 3, { c: PAL.slate, shadow: false });
      } else {
        txt(String(n), x + cw / 2, y + 4, { c: PAL.white, size: 16, align: 'center' });
        const st = starsOf(n); st.forEach((on, i) => star(x + 15 + i * 7, y + ch - 6, on));
        buttons.push({ id: 'lvl' + n, x, y, w: cw, h: ch });
      }
    }
  });
  const n = game.sel + 1; const def = LEVELS[n - 1];
  txt(String(n).padStart(2, '0') + '  ' + def.name.toUpperCase() + (save.bestTime && save.bestTime[n] ? '    BEST ' + save.bestTime[n].toFixed(1) + 'S' : ''), VW / 2, VH - 10, { c: PAL.sand, align: 'center', shadow: false });
}

// ---------------------------------------------------------------- frame
function frame() {
  buttons = [];
  ctx.fillStyle = PAL.black; ctx.fillRect(0, 0, canvas.width, canvas.height);
  R(b, 0, 0, VW, VH, PAL.black);
  if (game.scene === 'title') drawTitle();
  else if (game.scene === 'select') drawSelect();
  else if (game.scene === 'play') {
    const P = game.P;
    R(b, BOARD.x - 1, BOARD.y - 1, BOARD.w + 2, BOARD.h + 2, PAL.black);
    b.save(); b.beginPath(); b.rect(BOARD.x, BOARD.y, BOARD.w, BOARD.h); b.clip();
    R(b, BOARD.x, BOARD.y, BOARD.w, BOARD.h, '#100d1c');
    b.fillStyle = 'rgba(18,78,137,0.22)'; for (let gx = P.ox % 16; gx < BOARD.w + 16; gx += 16) b.fillRect(BOARD.x + gx - 4, BOARD.y, 1, BOARD.h); for (let gy = (P.oy - BOARD.y) % 16; gy < BOARD.h; gy += 16) b.fillRect(BOARD.x, BOARD.y + gy, BOARD.w, 1);
    drawWorld(P);
    b.restore();
    drawTopBar(P); drawSide(P); drawScrubber(P);
    layerBreak(); drawMessages(P);
    layerBreak(); drawTooltip(P);
    if (game.pause) { layerBreak(); drawPause(); }
  }
  layerBreak();
}
// text is drawn at full resolution on top of the pixel layer, so overlays are drawn as separate layers
function layerBreak() { ctx.imageSmoothingEnabled = false; ctx.drawImage(buf, 0, 0, VW * K, VH * K); flushText(); b.clearRect(0, 0, VW, VH); }

let last = performance.now();
function loop(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  update(dt); frame();
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- input
function toGame(e) { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * VW, y: (e.clientY - r.top) / r.height * VH }; }
let drawing = null, scrubbing = false;
function hitButton(x, y) { for (let i = buttons.length - 1; i >= 0; i--) { const q = buttons[i]; if (x >= q.x && y >= q.y && x < q.x + q.w && y < q.y + q.h) return q; } return null; }
function scrubFromX(x) { const N = maxScrub(); return Math.round((x - SCRUB.x) / (SCRUB.w - 1) * N); }

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
  initAudio();
  const p = toGame(e); mouse.x = p.x; mouse.y = p.y; mouse.down = true; mouse.inside = true;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* old browsers */ }
  if (game.scene === 'title') { const q = hitButton(p.x, p.y); void q; sfx.click(); game.scene = 'select'; game.sel = Math.min(save.unlocked, LEVELS.length) - 1; return; }
  const q = hitButton(p.x, p.y);
  if (q && q.id === 'scrub' && game.scene === 'play' && !game.pause && game.P.planMode) { const P = game.P; if (P.phase !== 'plan') editPlan(); scrubbing = true; setScrub(scrubFromX(p.x)); P.hoverTick = null; return; }
  if (q) { press(q.id); return; }
  if (game.scene === 'play' && !game.pause) {
    const P = game.P;
    if (P.rt && !P.planMode) {
      if (P.phase === 'caught') { if (game.time - P.caughtAt > 0.35) rtStart(); return; }
      if (P.phase === 'rt') { touchDir = dirToward(p); if (touchDir && P.rt.mv >= 1) rtTryMove(touchDir, false); }
      return;
    }
    if (P.phase === 'live') {
      const h = hoverTile(); if (!h) return; const c = P.run.next || P.run.cur;
      const dx = h.x - c.x, dy = h.y - c.y;
      if (!dx && !dy) liveStep('W');
      else if (Math.abs(dx) + Math.abs(dy) === 1) liveStep(dx > 0 ? 'R' : dx < 0 ? 'L' : dy > 0 ? 'D' : 'U');
      else toast('WASD TO MOVE (OR TAP NEXT TO YOU)');
      return;
    }
    if (P.phase === 'caught' && e.button === 0 && !P.planMode) { liveBack(); return; }
    if (P.phase === 'caught' && e.button === 0) { editPlan(); }
    if (P.phase !== 'plan') return;
    if (e.button === 2) { undoStep(); return; }
    const h = hoverTile(); if (!h) return;
    clickTile(h.x, h.y); drawing = { last: h };
  }
});
canvas.addEventListener('pointermove', e => {
  const p = toGame(e); mouse.x = p.x; mouse.y = p.y; mouse.inside = true;
  if (game.scene !== 'play' || !game.P) return;
  const P = game.P;
  if (touchDir && mouse.down && P.rt) { touchDir = dirToward(p) || touchDir; return; }
  if (scrubbing) { setScrub(scrubFromX(p.x)); return; }
  if (drawing && P.phase === 'plan') {
    const h = hoverTile(); if (!h || (h.x === drawing.last.x && h.y === drawing.last.y)) return;
    const st = P.trace.states; const prev = st.length >= 2 ? st[st.length - 2] : null;
    if (prev && P.plan[P.plan.length - 1] !== 'W' && prev.x === h.x && prev.y === h.y) undoStep();   // drag back = erase
    else clickTile(h.x, h.y);
    drawing.last = h; return;
  }
  // hover preview of a tick
  P.hoverTick = null;
  if (P.phase === 'plan' && !game.pause) {
    if (p.y >= SCRUB.y - 3 && p.y < SCRUB.y + SCRUB.h) P.hoverTick = Math.max(0, Math.min(maxScrub(), scrubFromX(p.x)));
    else { const h = hoverTile(); if (h) { const st = P.trace.states; for (let i = st.length - 1; i >= 1; i--) if (st[i].x === h.x && st[i].y === h.y) { P.hoverTick = i; break; } } }
  }
});
addEventListener('pointerup', () => { touchDir = null; mouse.down = false; drawing = null; scrubbing = false; });
canvas.addEventListener('pointerleave', () => { mouse.inside = false; if (game.P) game.P.hoverTick = null; });
canvas.addEventListener('wheel', e => {
  e.preventDefault(); if (game.scene !== 'play' || game.pause) return; const P = game.P; if (!P.planMode) return;
  if (P.phase !== 'plan') editPlan();
  P.hoverTick = null; setScrub(P.scrub + (e.deltaY > 0 ? 1 : -1));
}, { passive: false });

function press(id) {
  sfx.click();
  const P = game.P;
  if (id.startsWith('lvl')) { startLevel(+id.slice(3)); return; }
  switch (id) {
    case 'play': game.scene = 'select'; break;
    case 'title': game.scene = 'title'; break;
    case 'go': go(); break;
    case 'stop': editPlan(); break;
    case 'edit': editPlan(); break;
    case 'fast': P.fast = !P.fast; break;
    case 'wait': if (P.phase === 'live') liveStep('W'); else addWait(); break;
    case 'undo': undoStep(); break;
    case 'ins': insertWait(); break;
    case 'del': deleteStep(); break;
    case 'cut': cutPlan(); break;
    case 'clear': clearPlan(); break;
    case 'menu': game.pause = true; game.help = false; break;
    case 'resume': game.pause = null; break;
    case 'help': game.help = true; break;
    case 'helpback': game.help = false; break;
    case 'clearp': game.pause = null; if (P.rt && !P.planMode) rtStart(); else if (P.planMode) { if (P.phase !== 'plan') editPlan(); clearPlan(); } else liveRestart(); break;
    case 'back': liveBack(); break;
    case 'restart': if (P.rt && !P.planMode) rtStart(); else liveRestart(); break;
    case 'levels': game.pause = null; game.scene = 'select'; game.sel = P ? P.n - 1 : 0; break;
    case 'music': save.music = !save.music; setMusic(save.music); persist(); break;
    case 'sound': save.sfx = !save.sfx; setSfx(save.sfx); persist(); break;
    case 'next': startLevel(Math.min(LEVELS.length, P.n + 1)); break;
  }
}

addEventListener('keydown', e => {
  initAudio();
  const k = e.key, P = game.P;
  if (game.scene === 'title') { if (!e.repeat) { sfx.click(); game.scene = 'select'; game.sel = Math.min(save.unlocked, LEVELS.length) - 1; } return; }
  if (game.scene === 'select') {
    const unlocked = params.has('unlockall') ? LEVELS.length : save.unlocked;
    if (k === 'ArrowRight' || k === 'd') game.sel = Math.min(unlocked - 1, game.sel + 1);
    else if (k === 'ArrowLeft' || k === 'a') game.sel = Math.max(0, game.sel - 1);
    else if (k === 'ArrowDown' || k === 's') game.sel = Math.min(unlocked - 1, game.sel + 6);
    else if (k === 'ArrowUp' || k === 'w') game.sel = Math.max(0, game.sel - 6);
    else if (k === 'Enter' || k === ' ') { sfx.click(); startLevel(game.sel + 1); }
    else if (k === 'Escape') game.scene = 'title';
    e.preventDefault(); return;
  }
  if (game.scene !== 'play') return;
  if (game.pause) { if (k === 'Escape' || k === 'p' || k === 'P') { if (game.help) game.help = false; else game.pause = null; } return; }
  if (k === 'Escape' || k === 'p' || k === 'P') { game.pause = true; game.help = false; return; }
  const dirK = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' }[k];
  if (P.rt && !P.planMode) {
    if (P.phase === 'rt') { if (dirK) { if (!e.repeat) { pushHeld(dirK); if (P.rt.mv >= 1) rtTryMove(dirK, true); } e.preventDefault(); return; } }
    if (P.phase === 'caught') { if (game.time - P.caughtAt > 0.35 && !e.repeat) { rtStart(); if (dirK) pushHeld(dirK); } e.preventDefault(); return; }
    if (P.phase === 'won') { if (k === 'Enter' || k === 'n' || k === 'N' || k === ' ') press('next'); else if (k === 'r' || k === 'R') rtStart(); else if (k === 'l' || k === 'L') press('levels'); return; }
    if (k === 'r' || k === 'R') { rtStart(); return; }
    return;
  }
  if (!P.planMode) {
    if (P.phase === 'live') {
      if (dirK) { liveStep(dirK); e.preventDefault(); return; }
      if (k === ' ') { liveStep('W'); e.preventDefault(); return; }
    }
    if (P.phase === 'won') { if (k === 'Enter' || k === 'n' || k === 'N') press('next'); else if (k === 'r' || k === 'R') liveRestart(); else if (k === 'l' || k === 'L') press('levels'); return; }
    if (k === 'z' || k === 'Z' || k === 'Backspace') { liveBack(); e.preventDefault(); return; }
    if (k === 'r' || k === 'R') { liveRestart(); return; }
    return;
  }
  if (k === 'f' || k === 'F') { P.fast = !P.fast; return; }
  if (P.phase === 'run') { if (k === 'r' || k === 'R' || k === 'Enter' || k === ' ' || k === 'g' || k === 'G') editPlan(); return; }
  if (P.phase === 'caught') { if (k === 'r' || k === 'R' || k === 'e' || k === 'E' || k === 'Enter' || k === ' ') { editPlan(); e.preventDefault(); } else if (k === 'g' || k === 'G') { editPlan(); go(); } return; }
  if (P.phase === 'won') { if (k === 'Enter' || k === 'n' || k === 'N') press('next'); else if (k === 'r' || k === 'R') editPlan(); else if (k === 'l' || k === 'L') press('levels'); return; }
  // planning
  const dir = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' }[k];
  if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { histUndo(); e.preventDefault(); return; }
  if (dir) { tryMove(dir); e.preventDefault(); return; }
  if (k === ' ') { addWait(); e.preventDefault(); return; }
  if (k === 'Backspace') { undoStep(); e.preventDefault(); return; }
  if (k === 'Enter' || k === 'g' || k === 'G') { go(); return; }
  if (k === 'q' || k === 'Q' || k === ',') { P.hoverTick = null; setScrub(P.scrub - 1); return; }
  if (k === 'e' || k === 'E' || k === '.') { P.hoverTick = null; setScrub(P.scrub + 1); return; }
  if (k === 'Home') { setScrub(0); return; }
  if (k === 'End') { setScrub(P.plan.length); return; }
  if (k === 'i' || k === 'I' || k === 'Insert') { insertWait(); return; }
  if (k === 'Delete') { deleteStep(); return; }
  if (k === 'x' || k === 'X') { cutPlan(); return; }
  if (k === 'c' || k === 'C') { clearPlan(); return; }
  if (k === 'r' || k === 'R') { if (P.failTick >= 0) setScrub(P.failTick); return; }
});
addEventListener('keyup', e => { const d = DIRKEY[e.key]; if (!d) return; const i = held.indexOf(d); if (i >= 0) held.splice(i, 1); });
addEventListener('blur', () => { held.length = 0; touchDir = null; });
addEventListener('blur', () => { mouse.down = false; drawing = null; scrubbing = false; });

// ---------------------------------------------------------------- test hooks
window.__OT = {
  game, tps: 0,
  get phase() { return game.P ? game.P.phase : game.scene; },
  get level() { return game.P ? game.P.n : 0; },
  get plan() { return game.P ? game.P.plan.join('') : ''; },
  get result() { const P = game.P; if (!P) return null; return { phase: P.phase, ticks: P.run ? P.run.t : 0, failTick: P.failTick, failInfo: P.failInfo, stars: P.result && P.result.stars }; },
  loadLevel(n) { startLevel(n, { keepPlan: false }); },
  setPlan(steps) { const P = game.P; P.planMode = true; P.plan = (Array.isArray(steps) ? steps : String(steps).split('')).filter(c => 'UDLRW'.includes(c)); retrace(); P.scrub = 0; P.phase = 'plan'; P.failTick = -1; P.intro = 0; P.tipT = 0; },
  go() { go(); }, edit() { editPlan(); }, scrub(t) { game.P.hoverTick = null; setScrub(t, false); },
  scene(s) { game.scene = s; }, get rt() { return game.P && game.P.rt; }, hold(d) { if (d) pushHeld(d); else held.length = 0; }, step(d) { rtTryMove(d, false); }, rtStart() { rtStart(); }, WORLD_TPS, RUN_SPEED, live(a) { liveStep(a); }, back() { liveBack(); }, restart() { liveRestart(); }, pause(on) { game.pause = on ? true : null; game.help = false; }, help(on) { game.pause = true; game.help = !!on; },
  hover(x, y) { const r = canvas.getBoundingClientRect(); canvas.dispatchEvent(new PointerEvent('pointermove', { clientX: r.left + x / VW * r.width, clientY: r.top + y / VH * r.height })); },
  get save() { return JSON.parse(JSON.stringify(save)); },
  ready: false,
};

// ---------------------------------------------------------------- boot
G.buildSprites();
resize();
const fontReady = (document.fonts && document.fonts.load) ? Promise.race([document.fonts.load('8px Silkscreen'), new Promise(r => setTimeout(r, 1500))]) : Promise.resolve();
fontReady.then(() => {
  const lv = parseInt(params.get('level'), 10);
  if (lv >= 1 && lv <= LEVELS.length) startLevel(lv);
  requestAnimationFrame(t => { last = t; loop(t); });
  window.__OT.ready = true;
});
