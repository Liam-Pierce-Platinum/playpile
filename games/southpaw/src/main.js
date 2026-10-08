// SOUTHPAW - screens, the loop, and who controls whom.
//
// A fight is two fighters and two CONTROLLERS. A controller is anything that
// writes an intent: the keyboard, the AI, or (online) the other player's
// keyboard arriving over the socket. The title screen runs an AI-vs-AI fight
// behind the menu, which is the attract mode.

import { createView } from './view.js';
import { makeFighter, makeFight, step, emptyIntent, makeRng } from './fight.js';
import { MODES, modeOf, snap, unsnap } from './modes.js';
import { makeAI } from './ai.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { ROSTER, ARENAS, ARENA_ORDER, byId, PLAYER_LOOK, RIVAL_LOOK } from './roster.js';
import { STATS, MAX_LEVEL, statCost, epFor } from './data.js';
import { save, persist, buy, respec } from './save.js';
import { initAudio, play, setMuted, isMuted, setCrowd } from './sfx.js';
import { createNet } from './net.js';
import { drawBoxer } from './boxer.js';
import { text } from './font.js';
import { getArena, THEMES } from './arena.js';
import { P } from './palette.js';
import { CHOICES, randomLook, defaultLook, cleanLook } from './looks.js';

const $ = (s) => document.querySelector(s);
const STEP = 1 / 60;

const canvas = $('#screen');
const v = createView(canvas);
const hv = createView(document.createElement('canvas'), { fixed: { w: 384, h: 216, scale: 1 }, alpha: true });
const R = createRenderer();
const input = createInput(window);

const G = {
  mode: 'attract',          // attract | vs | fight | results | host | guest
  fight: null, ctrl: [null, null], human: -1, paused: false,
  ctx: null,                // what this fight is: { mode, oppId, bout, arena, rounds }
  pending: [],              // events to forward to an online guest
  remote: { mx: 0, mz: 0, guard: false, low: false, edges: [] },
  resultShown: false, startT: 0,
};
window.__G = G;             // for the test harness

// =============================================================== screens ===
const SCREENS = ['title', 'campaign', 'free', 'online', 'gym', 'howto', 'vs', 'results', 'pause', 'locker', 'modes'];
let current = 'title';
function show(id) {
  for (const s of SCREENS) $('#' + s).classList.toggle('hidden', s !== id);
  current = id;
  if (id === 'title') { refreshTitle(); if (G.mode !== 'attract') startAttract(); }
  if (id === 'campaign') buildLadder();
  if (id === 'free') buildFree();
  if (id === 'gym') buildGym();
  if (id === 'online') openOnline();
  if (id === 'locker') buildLocker();
  if (id === 'modes') buildModes();
  refreshEP();
}
function hideAll() { for (const s of SCREENS) $('#' + s).classList.add('hidden'); current = null; }
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { uiClick(); show(b.dataset.go); }));
// ONLINE needs this folder's own server.js (the lobby + WebSocket). On a plain
// static host - the copy on playpile.net - there is none, and the screen would
// only ever say "disconnected", so the button goes. server.js always serves the
// game at the root; the website serves it from /games/southpaw/. Asking
// /api/info instead would work too, but logs a 404 on every static load.
if (location.pathname.replace(/index\.html$/, '') !== '/') {
  const b = document.querySelector('#title [data-go="online"]');
  if (b) b.remove();
}
function uiClick() { initAudio(); play('ui'); }

function refreshEP() { document.querySelectorAll('.epval').forEach((e) => (e.textContent = save.ep + ' EP')); }
function refreshTitle() {
  const r = save.record;
  $('#btn-mute').textContent = 'SOUND: ' + (isMuted() ? 'OFF' : 'ON');
  $('#home-name').textContent = save.name || 'YOU';
  $('#home-record').textContent = `RECORD ${r.w}-${r.l}${r.d ? '-' + r.d : ''}  (${r.ko} KO)` + (save.champ ? '  -  WORLD CHAMPION' : '');
  // the gym at a glance: five headline stats as little bars
  const pick = [['PWR', 'power'], ['SPD', 'speed'], ['FOOT', 'foot'], ['HP', 'health'], ['GAS', 'stamina']];
  $('#home-bars').innerHTML = pick.map(([k, id]) => `<span>${k}</span><i style="--w:${(save.lv[id] || 0) * 10}%"></i>`).join('');
  animated.clear();
  animated.add(portrait($('#home-you'), save.look, { w: 32, h: 32, scale: 3, y: 60, face: 1, dx: -3, shadow: false }));
  const nb = nextBout();
  const opp = ROSTER[nb >= 0 ? nb : ROSTER.length - 1];
  $('#home-camp-sub').textContent = nb >= 0 ? 'FIGHT ' + (nb + 1) + ' OF 10' : 'CHAMPION';
  $('#home-next .lbl').textContent = nb >= 0 ? 'NEXT UP  -  FIGHT ' + (nb + 1) + ' OF 10' : 'YOU ARE THE CHAMP  -  REMATCH';
  $('#home-opp-name').textContent = opp.name;
  $('#home-opp-sub').textContent = `"${opp.nick}"  -  ${opp.style}  -  ${opp.record}`;
  $('#home-opp-arena').textContent = ARENAS[opp.arena].name;
  $('#home-opp-belt').textContent = opp.champ ? '\u2605 ' + opp.champ + ' \u2605' : '';
  animated.add(portrait($('#home-opp'), opp.look, { w: 32, h: 32, scale: 3, y: 60, face: -1, dx: 3, shadow: false }));
  G.homeOpp = { id: opp.id, bout: ROSTER.indexOf(opp) };
}
$('#home-fight').addEventListener('click', () => {
  uiClick();
  const o = byId(G.homeOpp.id);
  startLocal({ mode: 'campaign', oppId: o.id, bout: G.homeOpp.bout, arena: o.arena, rounds: 3 });
});
$('#btn-mute').addEventListener('click', () => { initAudio(); setMuted(!isMuted()); refreshTitle(); });
$('#howto-back').addEventListener('click', () => { uiClick(); show(G.mode === 'fight' && G.paused ? 'pause' : 'title'); });
$('#gym-back').addEventListener('click', () => { uiClick(); show(G.gymReturn || 'title'); G.gymReturn = null; });

// ============================================================ portraits ===
// A fighter drawn into a little canvas: full body for the VS screen, head and
// shoulders for cards.
function portrait(cv, look, opts = {}) {
  const w = opts.w || 64, h = opts.h || 64, sc = opts.scale || 3;
  const pv = createView(cv, { fixed: { w, h, scale: sc } });
  const f = { look, state: opts.state || 'idle', t: 0, face: opts.face || 1, guard: 0, open: 0, side: opts.side || 0, speedNow: 0, walk: 0, flash: 0, hitT: 9 };
  const bg = opts.bg || '#201a27';
  function draw(now) {
    pv.clear(bg);
    if (opts.arena) {
      const th = THEMES[opts.arena];
      pv.rect(0, h - 10, w, 10, th.canvas[1]);
      pv.rect(0, h - 11, w, 1, th.canvas[0]);
      for (let i = 0; i < 3; i++) pv.rect(0, h - 26 - i * 7, w, 1, th.ropes[i]);
    }
    pv.g.setTransform(1, 0, 0, 1, 0, 0);
    if (opts.shadow !== false) { pv.g.globalAlpha = 0.35; pv.rect(w / 2 - 12, (opts.y || h - 4) - 1, 24, 2, '#000'); pv.g.globalAlpha = 1; }
    drawBoxer(pv, f, Math.round(w / 2 + (opts.dx || 0)), opts.y || h - 4, now, { phase: 'fight' });
    pv.present();
  }
  draw(0);
  return { draw, f };
}
const animated = new Set();   // portraits that bounce while their screen is up

// ============================================================ campaign ===
function nextBout() { return ROSTER.findIndex((r) => !save.beaten[r.id]); }
function buildLadder() {
  const el = $('#ladder'); el.innerHTML = ''; animated.clear();
  const nb = nextBout();
  ROSTER.forEach((r, i) => {
    const st = save.beaten[r.id] ? 'beaten' : i === nb ? 'next' : 'locked';
    const c = document.createElement('div');
    c.className = 'card ' + st;
    const cv = document.createElement('canvas');
    c.appendChild(cv);
    const known = save.faced[r.id];
    c.insertAdjacentHTML('beforeend', `
      <span class="badge">${st === 'beaten' ? 'BEATEN' : st === 'next' ? 'NEXT UP' : 'LOCKED'}</span>
      <b>${i + 1}. ${r.name}</b>
      <small>"${r.nick}" &middot; ${r.style} &middot; ${r.record}</small>
      <small class="arena">${ARENAS[r.arena].name}</small>
      ${r.champ ? `<span class="belt">&#9733; ${r.champ} &#9733;</span>` : ''}
      <ul>${r.strengths.map((s) => `<li class="s">${s}</li>`).join('')}
      ${known ? r.weaknesses.map((s) => `<li class="w">${s}</li>`).join('') : '<li class="q">weaknesses: ??? - get in the ring with him</li>'}</ul>`);
    el.appendChild(c);
    const p = portrait(cv, r.look, { w: 64, h: 40, scale: 3, y: 72, face: -1, bg: st === 'locked' ? '#17131c' : '#2a2131', shadow: false });
    animated.add(p);
    if (st !== 'locked') c.addEventListener('click', () => { uiClick(); startLocal({ mode: 'campaign', oppId: r.id, bout: i, arena: r.arena, rounds: r.champ ? 3 : 3 }); });
  });
}

// =========================================================== free play ===
const freeSel = { opp: ROSTER[0].id, arena: 'pit', rounds: 3 };
function buildFree() {
  const o = $('#free-opps'); o.innerHTML = ''; animated.clear();
  for (const r of ROSTER) {
    const d = document.createElement('div');
    d.className = 'pick' + (freeSel.opp === r.id ? ' on' : '');
    const cv = document.createElement('canvas');
    d.appendChild(cv); d.insertAdjacentHTML('beforeend', `<span>${r.name}</span>`);
    d.addEventListener('click', () => { uiClick(); freeSel.opp = r.id; freeSel.arena = r.arena; buildFree(); });
    o.appendChild(d);
    animated.add(portrait(cv, r.look, { w: 40, h: 36, scale: 3, y: 72, face: -1, shadow: false }));
  }
  const a = $('#free-arenas'); a.innerHTML = '';
  for (const id of ARENA_ORDER) {
    const d = document.createElement('div');
    d.className = 'pick' + (freeSel.arena === id ? ' on' : '');
    const cv = document.createElement('canvas');
    cv.width = 192; cv.height = 108;
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    const A = getArena(id);
    g.drawImage(A.bg, 0, 0, 384, 216, 0, 0, 192, 108);
    g.drawImage(A.ring, 0, 0, 384, 216, 0, 0, 192, 108);
    d.appendChild(cv); d.insertAdjacentHTML('beforeend', `<span>${ARENAS[id].name}</span>`);
    d.addEventListener('click', () => { uiClick(); freeSel.arena = id; buildFree(); });
    a.appendChild(d);
  }
  document.querySelectorAll('#free-rounds button').forEach((b) => b.classList.toggle('on', +b.dataset.r === freeSel.rounds));
}
document.querySelectorAll('#free-rounds button').forEach((b) => b.addEventListener('click', () => { uiClick(); freeSel.rounds = +b.dataset.r; buildFree(); }));
$('#free-go').addEventListener('click', () => { uiClick(); startLocal({ mode: 'free', oppId: freeSel.opp, arena: freeSel.arena, rounds: freeSel.rounds }); });

// ================================================================= gym ===
let gymFx = null;
function buildGym() {
  const el = $('#gym-stats'); el.innerHTML = '';
  for (const s of STATS) {
    const lv = save.lv[s.id] || 0;
    const d = document.createElement('div');
    d.className = 'stat';
    const cost = statCost(lv);
    d.innerHTML = `<b>${s.name}</b>
      <button ${lv >= MAX_LEVEL || save.ep < cost ? 'disabled' : ''}>${lv >= MAX_LEVEL ? 'MAX' : 'BUY ' + cost + ' EP'}</button>
      <div class="pips">${Array.from({ length: MAX_LEVEL }, (_, i) => `<span class="pip${i < lv ? ' on' : ''}"></span>`).join('')}</div>
      <small>${s.blurb}</small>`;
    d.querySelector('button').addEventListener('click', () => {
      initAudio();
      if (buy(s.id)) { play('buy'); gymTrain(s.id); buildGym(); el.children[STATS.indexOf(s)].classList.add('flash'); }
      else play('deny');
      refreshEP();
    });
    el.appendChild(d);
  }
  if (!gymFx) gymFx = makeGymScene($('#gym-canvas'));
}
$('#gym-respec').addEventListener('click', () => {
  initAudio();
  if (!confirm('Refund every EP you have spent? Your levels go back to zero.')) return;
  respec(); play('buy'); buildGym(); refreshEP();
});

// The gym scene: you, a heavy bag, and the drill that matches what you just
// bought.
const DRILL = {
  power: [['hook', 'rear'], ['upper', 'rear'], ['over', 'rear']], speed: [['straight', 'lead'], ['straight', 'rear'], ['straight', 'lead'], ['straight', 'rear']],
  foot: 'shuffle', health: [['hook', 'lead'], ['hook', 'rear']], stamina: [['straight', 'lead'], ['straight', 'rear'], ['hook', 'lead'], ['upper', 'rear']],
  chin: 'chin', dodge: 'dodge', bStraight: 'guard', bHook: 'guard', bUpper: 'guard', bBody: 'guardLow',
};
const DRILL_TEXT = {
  power: 'sitting down on the big shots', speed: 'fast hands on the bag', foot: 'skipping rope - light on the toes', health: 'sparring rounds',
  stamina: 'twelve rounds on the bag', chin: 'neck bridges. ouch.', dodge: 'slipping the swinging bag', bStraight: 'blocking the jab pads',
  bHook: 'elbows tight against the hooks', bUpper: 'gloves locked against uppercuts', bBody: 'elbows down to cover the ribs',
};
function makeGymScene(cv) {
  const W = 168, H = 110;
  const gv = createView(cv, { fixed: { w: W, h: H, scale: 2 } });
  const f = { look: save.look, state: 'idle', t: 0, face: 1, guard: 0, open: 0, side: 0, speedNow: 0, walk: 0, flash: 0, hitT: 9, act: null, st: { dodgeLen: 0.42 } };
  const S = { f, bag: 0, bagV: 0, queue: [], drill: null, drillT: 0, sparks: [] };
  S.train = (id) => {
    S.drill = DRILL[id]; S.drillT = 2.4; S.queue = Array.isArray(S.drill) ? S.drill.slice() : [];
    $('#gym-note').textContent = DRILL_TEXT[id] || 'working the bag';
  };
  let last = performance.now();
  S.tick = () => {
    const tn = performance.now(); const dt = Math.min(0.05, (tn - last) / 1000); last = tn; const now = tn / 1000;
    S.drillT -= dt;
    // the bag swings like a pendulum, punches kick it
    S.bagV += -S.bag * 30 * dt; S.bagV *= Math.pow(0.4, dt); S.bag += S.bagV * dt;
    f.t += dt;
    if (f.state === 'punch' && f.act) {
      const t0 = f.act.t; f.act.t += dt;
      if (t0 < f.act.start && f.act.t >= f.act.start) {
        f.act.hit = 'hit';
        S.bagV += f.act.kind === 'straight' ? 1.2 : 2.2;
        for (let i = 0; i < 6; i++) S.sparks.push({ x: 104, y: 52 + Math.random() * 8, vx: -20 + Math.random() * 60, vy: -40 + Math.random() * 60, life: 0.2 });
      }
      if (f.act.t > f.act.start + f.act.active + f.act.rec) { f.state = 'idle'; f.act = null; f.t = 0; }
    } else if (f.state === 'dodge' && f.t > 0.42) { f.state = 'idle'; f.t = 0; }
    f.guard = 0; f.speedNow = 0;
    const mode = S.drillT > 0 ? S.drill : null;
    if (mode === 'guard' || mode === 'guardLow') f.guard = mode === 'guard' ? 1 : 2;
    if (mode === 'shuffle') { f.speedNow = 40; f.walk += dt * 8; }
    if (f.state === 'idle' && f.t > 0.18) {
      if (mode === 'dodge' && Math.abs(S.bag) > 0.05) { f.state = 'dodge'; f.dodge = Math.random() < 0.5 ? 'slip' : 'duck'; f.t = 0; S.bagV -= 1.5; }
      else if (mode === 'chin') { f.state = 'hit'; f.hitTarget = 'head'; f.stun = 0.4; f.t = 0; }
      else if (!mode || Array.isArray(mode)) {
        if (!S.queue.length) S.queue = Array.isArray(mode) ? mode.slice() : [['straight', 'lead'], ['straight', 'rear'], ['hook', 'lead'], ['straight', 'lead']];
        const [kind, hand] = S.queue.shift();
        f.state = 'punch'; f.t = 0;
        f.act = { kind, hand, target: Math.random() < 0.3 ? 'body' : 'head', t: 0, start: kind === 'straight' ? 0.12 : 0.2, active: 0.06, rec: 0.2, hit: null };
      }
    } else if (f.state === 'hit' && f.t > 0.4) { f.state = 'idle'; f.t = 0; }
    // draw
    f.look = save.look;
    gv.clear('#3a1e18');
    for (let y = 0; y < 80; y += 5) for (let x = ((y / 5) % 2) * 6 - 12; x < W; x += 12) gv.rect(x, y, 11, 4, (x * 7 + y * 3) % 5 ? P.brk3 : '#5e2a20');
    gv.rect(0, 80, W, 30, '#2a2224'); gv.rect(0, 80, W, 1, '#4a3a3a');
    gv.rect(18, 26, 40, 14, P.ink); gv.rect(19, 27, 38, 12, '#d8c088'); text(gv, 'EP ' + save.ep, 38, 30, '#7a2a20', { align: 'center' });
    // bag on its chain
    const bx = 106 + Math.sin(S.bag) * 26, by = 30 + Math.cos(S.bag) * 26;
    gv.line(106, 0, 106 + Math.sin(S.bag) * 12, 4 + Math.cos(S.bag) * 12, P.met3, 1);
    gv.line(106 + Math.sin(S.bag) * 12, 4 + Math.cos(S.bag) * 12, bx, by - 8, P.met3, 1);
    gv.g.globalAlpha = 0.3; gv.rect(bx - 8, 83, 18, 2, '#000'); gv.g.globalAlpha = 1;
    gv.rect(bx - 7, by - 9, 15, 42, P.ink); gv.rect(bx - 6, by - 8, 13, 40, '#8a2a20');
    gv.rect(bx - 6, by - 8, 4, 40, '#a8402a'); gv.rect(bx + 4, by - 8, 3, 40, '#5e1a14');
    gv.rect(bx - 6, by - 4, 13, 2, '#2a2224'); gv.rect(bx - 6, by + 26, 13, 2, '#2a2224');
    text(gv, 'SP', bx + 1, by + 8, '#ffcf70', { align: 'center' });
    gv.g.globalAlpha = 0.35; gv.rect(60, 83, 24, 2, '#000'); gv.g.globalAlpha = 1;
    if (mode === 'shuffle') {
      // skipping rope
      const ph = now * 9; const ry = Math.sin(ph) * 30;
      gv.line(64, 52, 72, 52 + ry * 0.2, '#e8e0d0', 1); gv.line(80, 52, 72, 52 + ry, '#e8e0d0', 1);
    }
    drawBoxer(gv, f, 72, 84, now, { phase: 'fight' });
    for (let i = S.sparks.length - 1; i >= 0; i--) {
      const p = S.sparks[i]; p.life -= dt; if (p.life <= 0) { S.sparks.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; gv.rect(p.x, p.y, 1, 1, P.spark2);
    }
    gv.present();
  };
  return S;
}
function gymTrain(id) { if (gymFx) gymFx.train(id); }

// =========================================================== attract ===
function startAttract() {
  G.mode = 'attract';
  const rng = Math.random;
  const kind = rng() < 0.5 ? 'box' : rng() < 0.5 ? 'wrestle' : 'sumo';
  const M = MODES[kind], list = M.roster;
  const i = Math.floor(rng() * list.length); let j = Math.floor(rng() * list.length); if (j === i) j = (j + 1) % list.length;
  const A = list[i], B = list[j];
  const a = makeFighter(0, { name: A.name, lv: A.lv, look: A.look, profile: A, reach: A.reach });
  const b = makeFighter(1, { name: B.name, lv: B.lv, look: B.look, profile: B, reach: B.reach });
  G.fight = M.make(a, b, { arena: M.arena || ARENA_ORDER[Math.floor(rng() * 6)], rounds: 1, roundLen: 45, seed: Math.floor(rng() * 1e9) });
  const r = makeRng(Math.floor(rng() * 1e9));
  const ai = [M.ai(A, r), M.ai(B, r)];
  G.ctrl = [(f, me, o, dt) => ai[0].update(f, me, o, dt), (f, me, o, dt) => ai[1].update(f, me, o, dt)];
  G.human = -1; R.reset();
}

// ======================================================== local fight ===
function startLocal(ctx) {
  G.ctx = ctx;
  const kind = ctx.kind || 'box', M = MODES[kind];
  const opp = M.roster.find((r) => r.id === ctx.oppId);
  const a = makeFighter(0, { name: save.name || 'YOU', lv: save.lv, look: M.look(save.look), human: true });
  const b = makeFighter(1, { name: opp.name, nick: opp.nick, lv: opp.lv, look: opp.look, profile: opp, reach: opp.reach });
  G.fight = M.make(a, b, { arena: ctx.arena || M.arena, rounds: ctx.rounds, seed: Math.floor(Math.random() * 1e9), mode: ctx.mode });
  const ai = M.ai(opp, makeRng(Math.floor(Math.random() * 1e9)));
  G.ctrl = [(f, me, o, dt) => input.poll(dt, me), (f, me, o, dt) => ai.update(f, me, o, dt)];
  G.human = 0; G.paused = false; G.resultShown = false;
  R.reset(); R.tip = '';
  G.seenBefore = !!save.faced[opp.id];
  save.faced[opp.id] = true; persist();
  ctx.arena = ctx.arena || M.arena;
  showVS(a, b, opp, ctx);
}

function showVS(a, b, opp, ctx) {
  G.mode = 'vs';
  show('vs');
  animated.clear();
  animated.add(portrait($('#vs-a'), a.look, { w: 80, h: 80, scale: 3, y: 74, face: 1, arena: ctx.arena }));
  animated.add(portrait($('#vs-b'), b.look, { w: 80, h: 80, scale: 3, y: 74, face: -1, arena: ctx.arena, side: 1 }));
  $('#vs-a-name').textContent = a.name;
  const r = save.record;
  $('#vs-a-sub').textContent = ctx.online ? 'RED CORNER' : `RED CORNER  -  ${r.w}-${r.l}`;
  $('#vs-b-name').textContent = b.name;
  $('#vs-b-sub').textContent = opp ? [`"${opp.nick}"`, opp.style, opp.record, opp.from].filter(Boolean).join('  -  ') : 'BLUE CORNER';
  const kind = ctx.kind || 'box';
  $('#vs-arena').textContent = ARENAS[ctx.arena].name + '  -  ' + (kind === 'wrestle' ? 'ONE FALL' : kind === 'sumo' ? 'BEST OF THREE' : ctx.rounds + ' ROUNDS');
  $('#vs-title').textContent = opp && opp.champ && ctx.mode === 'campaign' ? 'FOR THE ' + opp.champ + 'SHIP' : '';
  const sc = $('#vs-scout');
  if (opp) {
    sc.innerHTML = `<ul>${opp.strengths.map((s) => `<li class="s">${s}</li>`).join('')}${G.seenBefore ? opp.weaknesses.map((s) => `<li class="w">${s}</li>`).join('') : ''}</ul>`;
  } else sc.innerHTML = '';
  G.vsT = 0;
  play('bell');
}
function leaveVS() {
  if (G.mode !== 'vs' || G.vsT < 0.6) return;
  hideAll(); G.mode = G.ctx && G.ctx.online ? (G.netRole === 'host' ? 'host' : 'guest') : 'fight';
  input.clear(); G.startT = 0;
}
window.addEventListener('keydown', (e) => {
  initAudio();
  if (G.mode === 'vs') { leaveVS(); return; }
  if (e.code === 'Escape') {
    if (G.mode === 'fight' && !G.resultShown) { G.paused = !G.paused; if (G.paused) show('pause'); else hideAll(); }
    else if (current && current !== 'title' && current !== 'results' && G.mode === 'attract') show('title');
  }
});
$('#vs').addEventListener('click', leaveVS);
$('#resume').addEventListener('click', () => { uiClick(); G.paused = false; hideAll(); input.clear(); });
$('#pause-howto').addEventListener('click', () => { uiClick(); show('howto'); });
$('#quit').addEventListener('click', () => { uiClick(); G.paused = false; show('title'); });

// ============================================================= results ===
function showResults() {
  G.resultShown = true;
  const f = G.fight, me = G.human >= 0 ? G.human : 0, res = f.result || { winner: -1, method: 'DRAW' };
  const you = f.f[me], them = f.f[1 - me];
  const won = res.winner === me, lost = res.winner === 1 - me;
  const ctx = G.ctx || {};
  let ep = 0;
  const ko = res.method === 'KO' || res.method === 'TKO';
  if (won) {
    const opp = ctx.oppId ? MODES[ctx.kind || 'box'].roster.find((r) => r.id === ctx.oppId) : null;
    ep = epFor({ mode: ctx.online ? 'online' : ctx.mode, bout: ctx.bout || 0, ko, perfect: you.kds === 0 && you.hp > you.st.hpMax * 0.5, title: opp && (opp.champ && ctx.mode === 'campaign' && !save.beaten[opp.id] || (ctx.mode === 'special' && opp === MODES[ctx.kind].roster[MODES[ctx.kind].roster.length - 1])) });
    if (ctx.mode === 'campaign' && save.beaten[ctx.oppId]) ep = Math.ceil(ep / 3);   // a rematch pays a third
    save.ep += ep; save.record.w++; if (ko) save.record.ko++;
    if (ctx.mode === 'campaign') { save.beaten[ctx.oppId] = true; if (ctx.oppId === 'carter') save.champ = true; }
  } else if (lost) { save.record.l++; if (ctx.mode === 'campaign') { save.ep += 1; ep = 1; } }
  else save.record.d++;
  persist();
  const acc = (x) => Math.round(100 * x.stats.landed / Math.max(1, x.stats.thrown)) + '%';
  const title = won ? (ctx.mode === 'campaign' && ctx.oppId === 'carter' ? 'CHAMPION!' : 'YOU WIN!') : lost ? 'YOU LOSE' : 'DRAW';
  const how = res.method + (ko ? ' - ROUND ' + res.round : '');
  const opp = ctx.oppId ? MODES[ctx.kind || 'box'].roster.find((r) => r.id === ctx.oppId) : null;
  $('#result-body').innerHTML = `
    <div class="res-big ${won ? 'win' : lost ? 'loss' : 'draw'}">${title}</div>
    <div class="res-how">${how}</div>
    <table class="res-table">
      <tr><td></td><td style="color:#ff8a7a">${you.name}</td><td style="color:#7ab0ff">${them.name}</td></tr>
      <tr><td>PUNCHES LANDED</td><td>${you.stats.landed} / ${you.stats.thrown}</td><td>${them.stats.landed} / ${them.stats.thrown}</td></tr>
      <tr><td>ACCURACY</td><td>${acc(you)}</td><td>${acc(them)}</td></tr>
      <tr><td>POWER SHOTS</td><td>${you.stats.power}</td><td>${them.stats.power}</td></tr>
      <tr><td>BLOCKED / DODGED</td><td>${you.stats.blocked} / ${you.stats.dodged}</td><td>${them.stats.blocked} / ${them.stats.dodged}</td></tr>
      <tr><td>KNOCKDOWNS SCORED</td><td>${them.kds}</td><td>${you.kds}</td></tr>
    </table>
    ${ep ? `<div class="res-ep">+${ep} EP</div>` : ''}
    ${lost && opp ? `<p class="tag">scouting report updated: ${opp.weaknesses[0]}</p>` : ''}
    ${won && ctx.mode === 'campaign' && opp && opp.champ ? `<p class="tag" style="color:#ffd23d">${opp.champ} - the belt is yours</p>` : ''}`;
  const btns = $('#result-btns'); btns.innerHTML = '';
  const add = (label, fn, hot) => { const b = document.createElement('button'); b.className = 'big' + (hot ? ' hot' : ''); b.textContent = label; b.addEventListener('click', () => { uiClick(); fn(); }); btns.appendChild(b); };
  if (ctx.online) {
    add('REMATCH', () => { net.send({ t: 'rematch' }); G.wantRematch = true; $('#result-btns').firstChild.textContent = 'WAITING...'; maybeRematch(); }, true);
    add('LOBBY', () => { net.send({ t: 'leave' }); show('online'); });
  } else if (ctx.mode === 'special') {
    add('REMATCH', () => startLocal(ctx), true);
    add('SPECIAL MODES', () => { startAttract(); show('modes'); });
    add('MENU', () => show('title'));
  } else if (ctx.mode === 'campaign') {
    const nb = nextBout();
    if (won && nb >= 0) add('NEXT FIGHT', () => { const r = ROSTER[nb]; startLocal({ mode: 'campaign', oppId: r.id, bout: nb, arena: r.arena, rounds: 3 }); }, true);
    if (!won) add('REMATCH', () => startLocal(ctx), true);
    add('GYM', () => { G.gymReturn = 'campaign'; startAttract(); show('gym'); });
    add('LADDER', () => { startAttract(); show('campaign'); });
  } else {
    add('REMATCH', () => startLocal(ctx), true);
    add('GYM', () => { G.gymReturn = 'free'; startAttract(); show('gym'); });
    add('MENU', () => show('title'));
  }
  G.mode = 'results';
  show('results');
}

// ============================================================== online ===
const net = createNet({
  open: () => { net.send({ t: 'hello', name: save.name, lv: save.lv, look: save.look }); setStatus('connected - pick a way to find a fight'); },
  close: () => { setStatus('disconnected - is node server.js running?'); if (G.mode === 'host' || G.mode === 'guest') { G.netNote = 'CONNECTION LOST'; } },
  msg: onNet,
});
function setStatus(h) { $('#net-status').innerHTML = h; }
function openOnline() {
  $('#net-name').value = save.name === 'YOU' ? '' : save.name;
  net.connect();
  fetch('/api/info').then((r) => r.json()).then((i) => {
    if (isHost) showInet(i);
    $('#net-lan').textContent = i.lan.length ? 'friends on your network can join at ' + i.lan.map((ip) => 'http://' + ip + ':' + i.port).join('  or  ') + '  -  ' + i.online + ' online now' : '';
  }).catch(() => {});
}
function nameUpdate() {
  const n = ($('#net-name').value || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12).trim();
  save.name = n || 'YOU'; persist();
  net.send({ t: 'hello', name: save.name, lv: save.lv, look: save.look });
}
$('#net-name').addEventListener('change', nameUpdate);
let netKind = 'box';
document.querySelectorAll('#net-kind button').forEach((b) => b.addEventListener('click', () => { uiClick(); netKind = b.dataset.k; document.querySelectorAll('#net-kind button').forEach((x) => x.classList.toggle('on', x === b)); }));
$('#net-quick').addEventListener('click', () => { uiClick(); nameUpdate(); net.send({ t: 'quick', mode: netKind }); setStatus('looking for a ' + MODES[netKind].name.toLowerCase() + ' opponent...'); });
$('#net-create').addEventListener('click', () => { uiClick(); nameUpdate(); net.send({ t: 'create', mode: netKind }); });
$('#net-join').addEventListener('click', () => { uiClick(); nameUpdate(); net.send({ t: 'join', code: $('#net-code').value }); setStatus('joining...'); });
$('#online-back').addEventListener('click', () => { uiClick(); net.send({ t: 'cancel' }); show('title'); });

function onNet(m) {
  switch (m.t) {
    case 'waiting': setStatus('waiting for an opponent... (open a second tab to fight yourself)'); break;
    case 'room': setStatus(`room code <span class="code">${m.code}</span><br>tell your opponent to JOIN with it`); break;
    case 'error': setStatus(m.msg); break;
    case 'cancelled': setStatus('connected'); break;
    case 'start': startOnline(m); break;
    case 'in': if (G.mode === 'host' || G.mode === 'vs' || G.mode === 'results') mergeRemote(m.i); break;
    case 'snap':
      if (G.netRole === 'guest' && G.fight) {
        unsnap(G.fight, m.s);
        if (m.ev && m.ev.length) R.consume(G.fight, m.ev, 1);
      }
      break;
    case 'left':
      G.netNote = 'YOUR OPPONENT LEFT';
      if (G.mode === 'results') setTimeout(() => show('online'), 600);
      else if (G.mode === 'host' || G.mode === 'guest' || G.mode === 'vs') { G.mode = 'results'; G.resultShown = true; setTimeout(() => { show('online'); setStatus('your opponent left the fight'); }, 1500); }
      break;
    case 'rematch':
      G.peerRematch = true;
      if (m.go && G.netRole === 'guest') startOnline(Object.assign({}, G.lastStart, { seed: m.seed, arena: m.arena }));
      else maybeRematch();
      break;
  }
}
function maybeRematch() {
  if (!(G.wantRematch && G.peerRematch) || G.netRole !== 'host') return;
  const seed = Math.floor(Math.random() * 1e9), arena = ARENA_ORDER[Math.floor(Math.random() * 6)];
  net.send({ t: 'rematch', go: true, seed, arena });
  startOnline(Object.assign({}, G.lastStart, { seed, arena }));
}
function startOnline(m) {
  G.lastStart = m; G.wantRematch = false; G.peerRematch = false; G.netNote = '';
  G.netRole = m.role;
  const kind = MODES[m.mode] ? m.mode : 'box', M = MODES[kind];
  const a = makeFighter(0, { name: m.f[0].name, lv: m.f[0].lv, look: M.look(m.f[0].look ? cleanLook(m.f[0].look) : PLAYER_LOOK), human: true });
  const b = makeFighter(1, { name: m.f[1].name, lv: m.f[1].lv, look: M.look(m.f[1].look ? cleanLook(m.f[1].look) : RIVAL_LOOK), human: true });
  const arena = M.arena || m.arena;
  G.fight = M.make(a, b, { arena, rounds: 3, seed: m.seed, mode: 'online' });
  G.human = m.role === 'host' ? 0 : 1;
  G.ctx = { online: true, mode: 'online', arena, rounds: 3, kind };
  G.remote = { mx: 0, mz: 0, guard: false, low: false, edges: [] };
  G.pending = [];
  G.resultShown = false; G.paused = false;
  R.reset(); R.tip = 'MIX IT UP. A HUMAN READS YOU TOO.';
  if (m.role === 'host') {
    G.ctrl = [(f, me, o, dt) => input.poll(dt, me), () => takeRemote()];
  } else G.ctrl = [null, null];
  showVS(a, b, null, G.ctx);
  G.vsAuto = 2.2;
}
function mergeRemote(i) {
  const r = G.remote;
  r.mx = i.mx; r.mz = i.mz; r.guard = i.guard; r.low = i.low; r.crouch = !!i.crouch; r.run = !!i.run;
  if (i.punches && i.punches.length || i.slip || i.duck || i.star || i.mash || i.taunt || i.grab || (i.arrows && i.arrows.length)) r.edges.push(i);
}
function takeRemote() {
  const r = G.remote, it = emptyIntent();
  it.mx = r.mx; it.mz = r.mz; it.guard = r.guard; it.low = r.low; it.crouch = !!r.crouch; it.run = !!r.run; it.arrows = []; it.grab = false;
  for (const e of r.edges) {
    for (const p of e.punches || []) it.punches.push({ kind: p.kind, hand: p.hand, target: p.target === 'body' ? 'body' : 'head', precise: !!p.precise });
    if (e.slip) it.slip = true; if (e.duck) it.duck = true; if (e.star) it.star = true; it.mash += e.mash || 0;
    for (const d of e.arrows || []) if (['left', 'up', 'right', 'down'].includes(d)) it.arrows.push(d);
    if (e.grab) it.grab = true;
  }
  r.edges.length = 0;
  return it;
}

// ====================================================== special modes ===
const modeSel = { wrestle: MODES.wrestle.roster[0].id, sumo: MODES.sumo.roster[0].id };
function buildModes() {
  animated.clear();
  for (const kind of ['wrestle', 'sumo']) {
    const el = $('#mode-' + kind + '-opps'); el.innerHTML = '';
    for (const r of MODES[kind].roster) {
      const d = document.createElement('div');
      d.className = 'pick' + (modeSel[kind] === r.id ? ' on' : '');
      const cv = document.createElement('canvas');
      d.appendChild(cv); d.insertAdjacentHTML('beforeend', '<span>' + r.name + '</span>');
      d.addEventListener('click', () => { uiClick(); modeSel[kind] = r.id; buildModes(); });
      el.appendChild(d);
      animated.add(portrait(cv, r.look, { w: 40, h: 36, scale: 3, y: 72, face: -1, shadow: false }));
    }
    const opp = MODES[kind].roster.find((r) => r.id === modeSel[kind]);
    $('#mode-' + kind + '-scout').innerHTML = '<b>' + opp.name + '</b> "' + opp.nick + '" - ' + opp.style + '<ul>' + opp.strengths.map((s) => '<li class="s">' + s + '</li>').join('') + opp.weaknesses.map((s) => '<li class="w">' + s + '</li>').join('') + '</ul>';
  }
}
for (const kind of ['wrestle', 'sumo']) $('#mode-' + kind + '-go').addEventListener('click', () => { uiClick(); startLocal({ kind, mode: 'special', oppId: modeSel[kind], rounds: 1 }); });

// ======================================================== locker room ===
let lockPrev = null;
function buildLocker() {
  $('#lock-name').value = save.name === 'YOU' ? '' : save.name;
  const el = $('#lock-opts'); el.innerHTML = '';
  for (const c of CHOICES) {
    const row = document.createElement('div');
    row.className = 'opt';
    row.innerHTML = '<span>' + c.name + '</span><div class="chips"></div>';
    const chips = row.querySelector('.chips');
    const cur = c.get(save.look);
    c.list.forEach((item, i) => {
      const b = document.createElement('button');
      if (c.kind === 'text') { b.className = 'chip' + (i === cur ? ' on' : ''); b.textContent = item; }
      else {
        b.className = 'sw' + (i === cur ? ' on' : '');
        b.style.background = c.kind === 'skin' ? SKIN_SW[i] : item;
      }
      b.addEventListener('click', () => { initAudio(); play('ui'); c.set(save.look, i); persist(); buildLocker(); });
      chips.appendChild(b);
    });
    el.appendChild(row);
  }
  if (!lockPrev) lockPrev = makeLockerPreview($('#lock-canvas'));
}
const SKIN_SW = ['#ffd9b8', '#f6caa0', '#e0ac7e', '#c08a5c', '#9a6640', '#6e4428'];
$('#lock-name').addEventListener('input', () => {
  const n = ($('#lock-name').value || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, 12).trim();
  save.name = n || 'YOU'; persist();
});
$('#lock-random').addEventListener('click', () => { uiClick(); save.look = randomLook(); persist(); buildLocker(); });
$('#lock-reset').addEventListener('click', () => { uiClick(); save.look = defaultLook(); persist(); buildLocker(); });
$('#lock-done').addEventListener('click', () => { uiClick(); show('title'); });

// The preview runs through a little routine so you see the kit moving:
// guard, jab, cross, hook, a crouched body hook, and a victory hop.
function makeLockerPreview(cv) {
  const W = 70, H = 70;
  const pv = createView(cv, { fixed: { w: W, h: H, scale: 4 } });
  const f = { look: save.look, state: 'idle', t: 0, face: 1, guard: 0, open: 0, side: 0, speedNow: 0, walk: 0, flash: 0, hitT: 9, act: null, crouch: 0, st: { dodgeLen: 0.42 } };
  const ROUTINE = [['idle', 1.0], ['straight', 'lead'], ['straight', 'rear'], ['hook', 'lead'], ['crouch', 0.5], ['hook', 'rear', 'body'], ['crouch', 0.4], ['idle', 0.6], ['win', 1.6]];
  let k = 0, stepT = 0, last = performance.now();
  return {
    tick() {
      const tn = performance.now(), dt = Math.min(0.05, (tn - last) / 1000); last = tn;
      f.look = save.look; f.t += dt; stepT += dt;
      const cur = ROUTINE[k];
      let len = typeof cur[1] === 'number' ? cur[1] : 0.55;
      if (f.state === 'punch' && f.act) f.act.t += dt;
      const wantLow = cur[0] === 'crouch' || cur[2] === 'body' ? 1 : 0;
      f.crouch += (wantLow - f.crouch) * Math.min(1, dt * 12);
      if (stepT >= len) {
        stepT = 0; k = (k + 1) % ROUTINE.length; f.t = 0;
        const n = ROUTINE[k];
        if (n[0] === 'win') { f.state = 'win'; f.act = null; }
        else if (n[0] === 'idle' || n[0] === 'crouch') { f.state = 'idle'; f.act = null; }
        else { f.state = 'punch'; f.act = { kind: n[0], hand: n[1], target: n[2] || 'head', t: 0, start: 0.14, active: 0.06, rec: 0.25, hit: 'hit' }; }
      }
      pv.clear('#1b1520');
      pv.rect(0, H - 12, W, 12, '#3a72c0'); pv.rect(0, H - 13, W, 1, '#4f8fe0');
      for (let i = 0; i < 3; i++) pv.rect(0, H - 30 - i * 8, W, 1, ['#ff4a3d', '#f2f2f2', '#3d8bff'][i]);
      pv.g.globalAlpha = 0.35; pv.rect(W / 2 - 14, H - 7, 26, 2, '#000'); pv.g.globalAlpha = 1;
      drawBoxer(pv, f, W / 2 - 4, H - 6, tn / 1000, { phase: 'fight' });
      pv.present();
    },
  };
}

// ======================================================== internet link ===
// Asks the server to open a public tunnel (cloudflared) and shows the link.
// Only offered when you are playing on the machine running the server.
const isHost = ['localhost', '127.0.0.1'].includes(location.hostname);
let inetPoll = null;
function showInet(info) {
  const u = info && info.public;
  $('#inet-url').classList.toggle('hidden', !u && !(info && info.tunnel));
  $('#inet-stop').classList.toggle('hidden', !(info && info.tunnel));
  $('#inet-go').classList.toggle('hidden', !!(info && info.tunnel));
  if (u) $('#inet-url').innerHTML = 'send this link to anyone: <br><a href="' + u + '" target="_blank">' + u + '</a><br><button id="inet-copy" class="small" style="margin-top:8px">COPY LINK</button><br><small>they open it, press ONLINE, then QUICK MATCH or JOIN your room code</small>';
  else if (info && info.tunnel) $('#inet-url').textContent = 'opening a public link... (takes a few seconds)';
  const cp = $('#inet-copy');
  if (cp) cp.addEventListener('click', () => { navigator.clipboard && navigator.clipboard.writeText(u); cp.textContent = 'COPIED'; });
  if (info && info.tunnelErr && !info.tunnel) $('#inet-text').textContent = 'could not open a public link: ' + info.tunnelErr;
}
function pollInet() {
  clearInterval(inetPoll);
  let n = 0;
  inetPoll = setInterval(() => {
    fetch('/api/info').then((r) => r.json()).then((i) => { showInet(i); if (i.public || !i.tunnel || ++n > 40) clearInterval(inetPoll); }).catch(() => {});
  }, 1000);
}
$('#inet-go').addEventListener('click', () => { uiClick(); fetch('/api/public', { method: 'POST' }).then(() => { showInet({ tunnel: true }); pollInet(); }); });
$('#inet-stop').addEventListener('click', () => { uiClick(); fetch('/api/public?off=1', { method: 'POST' }).then(() => showInet({})); });
if (!isHost) {
  $('#inet-text').textContent = 'you are playing on ' + location.host + ' - you are already online. pick QUICK MATCH or JOIN a code.';
  $('#inet-go').classList.add('hidden');
}

// ================================================================ loop ===
let last = performance.now(), acc = 0, guestSendT = 0, lastSent = '';
function tick(dt) {
  const F = G.fight;
  if (!F) return;
  if (G.mode === 'vs') {
    G.vsT += dt;
    if (G.vsAuto && G.vsT > G.vsAuto) { G.vsAuto = 0; leaveVS(); }
    return;
  }
  if (G.mode === 'guest') {
    // the guest just sends what its keyboard says; the host does the rest
    const it = input.poll(dt, F.f[1]);
    const s = JSON.stringify(it);
    guestSendT += dt;
    const edge = it.punches.length || it.slip || it.duck || it.star || it.mash || it.grab;
    if (edge || s !== lastSent || guestSendT > 0.1) { net.send({ t: 'in', i: it }); lastSent = s; guestSendT = 0; }
    if (F.phase === 'over' && F.pt > 3.2 && !G.resultShown) showResults();
    return;
  }
  if (G.paused || G.mode === 'results') {
    if (G.mode === 'results' && G.ctx && G.ctx.online === undefined && F.phase === 'over') { modeOf(F).step(F, dt); F.events.length = 0; }
    return;
  }
  if (G.mode !== 'fight' && G.mode !== 'attract' && G.mode !== 'host') return;
  for (let i = 0; i < 2; i++) F.f[i].intent = G.ctrl[i] ? G.ctrl[i](F, F.f[i], F.f[1 - i], dt) : emptyIntent();
  modeOf(F).step(F, dt);
  if (F.events.length) {
    for (const e of F.events) if (e.type === 'rest' && G.ctx && !G.ctx.online && (G.ctx.kind || 'box') === 'box') cornerTip(F);
    R.consume(F, F.events, G.human);
    if (G.mode === 'host') G.pending.push(...F.events);
    F.events.length = 0;
  }
  if (G.mode === 'host') { net.send({ t: 'snap', s: snap(F), ev: G.pending }); G.pending = []; }
  if (G.mode === 'attract' && F.phase === 'over' && F.pt > 4) startAttract();
  if ((G.mode === 'fight' || G.mode === 'host') && F.phase === 'over' && F.pt > 3.2 && !G.resultShown) showResults();
}
function cornerTip(F) {
  const opp = byId(G.ctx.oppId);
  if (!opp) return;
  const tips = opp.weaknesses.slice();
  const me = F.f[0];
  if (me.stam < me.st.stamMax * 0.3) tips.push('YOU ARE GASSED. PICK YOUR SHOTS.');
  if (me.stats.blocked < 2) tips.push('GET THAT GUARD UP. HOLD SHIFT.');
  R.tip = tips[Math.floor(Math.random() * tips.length)].toUpperCase().slice(0, 48);
}

function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  acc += dt;
  let n = 0;
  while (acc >= STEP && n < 6) { tick(STEP); acc -= STEP; n++; }
  if (n >= 6) acc = 0;
  const now = t / 1000;
  if (G.fight) {
    const ui = {
      human: G.human >= 0 && (G.mode === 'fight' || G.mode === 'host' || G.mode === 'guest') ? G.human : null,
      aim: input.aimHeld && (G.mode === 'fight' || G.mode === 'host' || G.mode === 'guest'),
      trail: input.trail, lastGesture: input.lastGesture, gestureT: input.gestureT, netNote: G.netNote,
    };
    if (G.mode === 'attract') { setCrowd(0.15); ui.noHud = true; }
    R.draw(v, hv, G.fight, now, dt, ui);
    if ((G.mode === 'fight' || G.mode === 'host' || G.mode === 'guest') && G.fight.round === 1 && G.fight.phase !== 'over') {
      G.startT += dt;
      if (G.startT < 12) {
        const a = Math.min(1, (12 - G.startT) / 1.5);
        hv.g.globalAlpha = a;
        hv.rect(0, 186, 384, 30, 'rgba(18,14,22,0.8)');
        const hint = modeOf(G.fight).hint;
        text(hv, hint[0], 192, 190, P.cream, { align: 'center' });
        text(hv, hint[1], 192, 200, '#b9a48c', { align: 'center' });
        hv.g.globalAlpha = 1;
      }
    }
    R.present(v, hv, canvas, dt);
  }
  for (const p of animated) p.draw(now);
  if (current === 'gym' && gymFx) gymFx.tick();
  if (current === 'locker' && lockPrev) lockPrev.tick();
  requestAnimationFrame(frame);
}

startAttract();
show('title');
requestAnimationFrame(frame);
window.addEventListener('pointerdown', () => initAudio(), { once: true });
