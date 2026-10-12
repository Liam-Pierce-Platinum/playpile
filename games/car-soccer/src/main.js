// Game states, match flow, replays, menus, saving and progression.
import { W, H, GH, GD, BALL_R } from './arena.js';
import { makeWorld, kickoff, step, STEP, predictGoal, RIDE } from './physics.js';
import { makeBot, botInput } from './bot.js';
import { initInput, readInput, initTouch, touch, anyPressed, clearPressed } from './input.js';
import { initAudio, sfxs, engine, crowdLevel, setMuted, setMusic, setMusicMode } from './audio.js';
import { fx, resetFx, updateFx, sparks, dust, boostPuff, goalExplosion, demoBlast, ring, shake, popup, part } from './fx.js';
import { initRender, resize, draw, updateCamera, TEAM, drawPreview, cam } from './render.js';
import { save, persist } from './save.js';
import { PAINTS, BODIES, TRAILS, GOALFX, UNLOCKS, LISTS, unlockLevel, XP_PER_LEVEL, levelFromXp, itemName } from './unlocks.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const MATCH_TIME = +(Q.get('time') || 120);
const DIFF_NAMES = { rookie: 'ROOKIE', pro: 'PRO', allstar: 'ALL-STAR' };
const XP_MULT = { rookie: 1, pro: 1.4, allstar: 1.8 };
const REPLAY_BEFORE = 2.6, REPLAY_AFTER = 0.5, REPLAY_SPEED = 0.75;
const KICK_STEP = 0.5; // 3-2-1 beat (s): 1.5 s from goal to the next kickoff

const G = {
  state: 'title',          // title | match | paused | results | garage | how
  world: makeWorld(),
  match: null,
  bots: [null, null],
  botP1: Q.get('bot1') || null,
  acc: 0, timeScale: 1, hitstop: 0, slowmo: 0,
  frames: [], replay: null, trail: [],
  predSide: null, predT: 0,
  scorePulse: [0, 0], hint: null, goTimer: 0, firstMatch: save.played === 0,
  lastFrame: performance.now(),
};
window.__G = G;

// ---------- setup ----------
initRender($('c'));
window.addEventListener('resize', () => { resize(); orientHint(); });
initInput(onKey);
initTouch($('touch'), () => { initAudio(); if (G.state === 'match' && G.match.phase === 'replay') skipReplay(); });
document.addEventListener('pointerdown', () => initAudio(), { capture: true });
setMuted(save.muted); setMusic(save.music);
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touchmode'), (touch.used = true);

function styleFor(player) {
  if (player === 0) {
    const p = PAINTS.find((x) => x.id === save.paint), t = TRAILS.find((x) => x.id === save.trail);
    return { paint: p ? p.col : null, body: save.body, trailCols: t && t.cols ? t.cols : null };
  }
  return { paint: null, body: G.match && G.match.mode === 'bot' ? ['octo', 'dart', 'brute'][['rookie', 'pro', 'allstar'].indexOf(G.match.diff)] : 'octo', trailCols: null };
}

// ---------- attract mode behind the title ----------
function startAttract() {
  G.world = makeWorld(); kickoff(G.world);
  G.bots = [makeBot('allstar', 0), makeBot('pro', 1)];
  G.match = { mode: 'attract', diff: 'pro', score: [0, 0], time: 999, overtime: false, otTime: 0, phase: 'play', phaseT: 0, stats: [blankStats(), blankStats()] };
  G.frames = []; G.trail = []; resetFx();
  G.styles = [styleFor(0), styleFor(1)];
}
function blankStats() { return { goals: 0, shots: 0, saves: 0, demos: 0, touches: 0 }; }

// ---------- match ----------
function startMatch(opts = {}) {
  const mode = opts.mode || save.mode, diff = opts.diff || save.diff;
  initAudio();
  G.world = makeWorld();
  G.bots = [G.botP1 ? makeBot(G.botP1, 0) : null, mode === 'bot' ? makeBot(diff, 1) : null];
  G.match = { mode, diff, score: [0, 0], time: opts.time || MATCH_TIME, overtime: false, otTime: 0, phase: 'countdown', phaseT: 0, stats: [blankStats(), blankStats()], kicks: 0 };
  G.frames = []; G.trail = []; G.replay = null; G.hitstop = 0; G.slowmo = 0;
  G.scorePulse = [0, 0];
  resetFx();
  G.styles = [styleFor(0), styleFor(1)];
  beginKickoff();
  G.state = 'match';
  showScreen(null);
  document.body.classList.add('inmatch');
  setMusicMode('match');
  if (G.firstMatch || Q.get('hint')) {
    G.hint = { text: touch.used ? 'LEFT THUMB drive · JUMP twice to flip · hold BOOST' : mode === '2p' ? 'P1: WASD + Space + L-Shift   ·   P2: Arrows + Enter + R-Shift' : 'A/D drive · SPACE jump (twice = flip) · SHIFT boost', t: 7 };
  }
}
function beginKickoff() {
  kickoff(G.world);
  G.world.ball.hidden = false;
  G.match.phase = 'countdown'; G.match.phaseT = Q.get('fastkick') ? 0.05 : KICK_STEP * 3; G.match.kicks++;
  G.lastBeep = 4;
  G.predSide = null;
}

function finishMatch() {
  const m = G.match;
  m.phase = 'over'; m.phaseT = 1.6;
  sfxs.horn(); shake(0.3);
  const res = m.score[0] > m.score[1] ? 'win' : m.score[0] < m.score[1] ? 'loss' : 'draw';
  popup(res === 'win' ? (m.mode === '2p' ? 'BLUE WINS!' : 'VICTORY!') : res === 'loss' ? (m.mode === '2p' ? 'ORANGE WINS!' : 'DEFEAT') : 'DRAW', res === 'loss' ? TEAM[1].light : TEAM[0].light, { life: 1.6, size: 1.2 });
}

function showResults() {
  const m = G.match, st = m.stats[0];
  const res = m.score[0] > m.score[1] ? 'win' : m.score[0] < m.score[1] ? 'loss' : 'draw';
  const mult = m.mode === 'bot' ? XP_MULT[m.diff] : 1;
  const xpGain = Math.round((80 + (res === 'win' ? 120 : 0) + st.goals * 30 + st.saves * 25 + st.shots * 5 + st.demos * 10) * mult);
  const oldLv = levelFromXp(save.xp);
  save.xp += xpGain; save.played++;
  save.goals += st.goals; save.saves += st.saves;
  if (m.mode === 'bot') {
    if (res === 'win') { save.wins++; save.winsBy[m.diff]++; save.streak++; save.bestStreak = Math.max(save.bestStreak, save.streak); }
    else if (res === 'loss') { save.losses++; save.streak = 0; } else save.draws++;
  }
  persist();
  const newLv = levelFromXp(save.xp);
  G.state = 'results'; G.firstMatch = false;
  document.body.classList.remove('inmatch');
  const title = $('resTitle');
  if (m.mode === '2p') { title.textContent = res === 'win' ? 'BLUE WINS' : res === 'loss' ? 'ORANGE WINS' : 'DRAW'; title.style.color = res === 'loss' ? TEAM[1].light : res === 'win' ? TEAM[0].light : '#fff'; }
  else { title.textContent = res === 'win' ? 'VICTORY' : res === 'loss' ? 'DEFEAT' : 'DRAW'; title.style.color = res === 'win' ? '#7dff6a' : res === 'loss' ? '#ff5a6e' : '#fff'; }
  $('resB').textContent = m.score[0]; $('resO').textContent = m.score[1];
  const s0 = m.stats[0], s1 = m.stats[1];
  const n0 = m.mode === '2p' ? 'P1' : 'YOU', n1 = m.mode === '2p' ? 'P2' : 'BOT ' + DIFF_NAMES[m.diff];
  $('resStats').innerHTML = `<span class="h"></span><span class="h blue">${n0}</span><span class="h orange">${n1}</span>` +
    [['Goals', 'goals'], ['Shots', 'shots'], ['Saves', 'saves'], ['Demos', 'demos'], ['Touches', 'touches']]
      .map(([l, k]) => `<span>${l}</span><span class="blue">${s0[k]}</span><span class="orange">${s1[k]}</span>`).join('');
  $('resLvl').textContent = 'LV ' + newLv;
  $('resXp').textContent = `+${xpGain} XP`;
  const bar = $('resBar');
  bar.style.transition = 'none'; bar.style.width = (newLv > oldLv ? 0 : ((save.xp - xpGain) % XP_PER_LEVEL) / XP_PER_LEVEL * 100) + '%';
  requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.transition = ''; bar.style.width = (save.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100 + '%'; }));
  const un = $('resUnlock');
  const got = [];
  for (let lv = oldLv + 1; lv <= newLv; lv++) if (UNLOCKS[lv]) got.push(UNLOCKS[lv]);
  if (newLv > oldLv) {
    un.classList.remove('hidden');
    un.textContent = `LEVEL UP! ` + (got.length ? 'Unlocked: ' + got.map(([k, id]) => `${itemName(k, id)} (${k === 'goalfx' ? 'goal fx' : k === 'trail' ? 'boost' : k})`).join(', ') : '');
    setTimeout(() => sfxs.levelUp(), 500);
  } else un.classList.add('hidden');
  showScreen('results');
  setMusicMode('menu');
}

// ---------- events -> juice, sound, stats ----------
const pan = (x) => Math.max(-1, Math.min(1, (x - cam.x) / 1400));
const trailCols = (i) => { const st = G.styles[i]; return st.trailCols || [TEAM[G.world.cars[i].team].light, TEAM[G.world.cars[i].team].main, '#ffffff']; };
function handleEvents(live) {
  const w = G.world, m = G.match;
  for (const e of w.events) {
    const c = e.car;
    switch (e.type) {
      case 'hit': {
        const col = TEAM[c.team].glow;
        sparks(e.x, e.y, e.nx, e.ny, e.power, col);
        sfxs.hit(e.power, pan(e.x));
        shake(Math.min(0.55, e.power / 5000));
        if (e.power > 1500) G.hitstop = Math.min(0.07, 0.03 + e.power / 60000);
        if (e.power > 1100) ring(e.x, e.y, '#fff', 20, 220, 0.25, 12);
        if (!live) break;
        m.stats[c.id].touches++;
        // shot / save detection from the ball's predicted path
        const pg = predictGoal(w.ball, 2.2);
        const own = c.team === 0 ? 0 : 1;
        if (G.predSide === own && G.predT < 1.6 && (!pg || pg.side !== own) && Math.abs(w.ball.x) > W / 2 - 1000) {
          m.stats[c.id].saves++;
          if (m.mode !== 'attract') { popup(G.predT < 0.45 ? 'EPIC SAVE!' : 'SAVE!', TEAM[c.team].light, { size: 0.6, y: 0.24 }); sfxs.save(); }
        } else if (pg && pg.side !== own && (G.lastShotBy !== c.id || w.t - G.lastShotT > 1)) {
          m.stats[c.id].shots++; G.lastShotBy = c.id; G.lastShotT = w.t;
          if (m.mode !== 'attract' && c.id === 0) popup('SHOT ON GOAL', TEAM[c.team].light, { size: 0.42, y: 0.24, life: 1 });
        }
        G.predSide = pg ? pg.side : null; G.predT = pg ? pg.t : 9;
        break;
      }
      case 'bounce':
        if (e.power > 700) { ring(e.x, e.y, 'rgba(200,225,255,0.9)', 10, 70 + e.power * 0.05, 0.3, 6); shake(Math.min(0.2, e.power / 12000)); }
        sfxs.bounce(e.power, pan(e.x));
        break;
      case 'jump': dust(c.x - c.nx * RIDE, c.y - c.ny * RIDE, c.nx, c.ny, 8); sfxs.jump(pan(c.x)); break;
      case 'djump': sfxs.jump(pan(c.x)); ring(c.x, c.y - 30, 'rgba(255,255,255,0.6)', 10, 70, 0.25, 6); break;
      case 'flip': sfxs.flip(pan(c.x)); ring(c.x, c.y, TEAM[c.team].light, 20, 120, 0.3, 8); break;
      case 'land': if (e.power > 300) { dust(c.x - c.nx * RIDE, c.y - c.ny * RIDE, c.nx, c.ny, Math.min(14, e.power / 80)); sfxs.land(e.power, pan(c.x)); } break;
      case 'boost': sfxs.boostStart(pan(c.x)); break;
      case 'super': sfxs.supersonic(pan(c.x)); ring(c.x, c.y, '#fff', 30, 160, 0.3, 6); break;
      case 'bump': sfxs.bump(e.power, pan(e.x)); shake(Math.min(0.4, e.power / 4000)); sparks(e.x, e.y, 0, 1, e.power * 0.4, '#fff'); break;
      case 'scrape': sparks(c.x, c.y - 20, 0, 1, e.power * 0.2, '#ffd8a8'); break;
      case 'turn': sfxs.turn(pan(c.x)); break;
      case 'demo':
        demoBlast(e.x, e.y, TEAM[c.team].glow); sfxs.demo(pan(e.x));
        if (live) {
          m.stats[e.by.id].demos++;
          if (m.mode !== 'attract') {
            if (e.by.id === 0 || m.mode === '2p') popup('DEMOLITION!', TEAM[e.by.team].light, { size: 0.6, y: 0.24 });
            else popup('DEMOLISHED', '#ff5a6e', { size: 0.55, y: 0.24 });
          }
        }
        G.hitstop = 0.08;
        break;
      case 'respawn': ring(c.x, c.y, TEAM[c.team].glow, 10, 160, 0.4, 10); break;
    }
  }
  w.events.length = 0;
}

function onGoal(team) {
  const w = G.world, m = G.match;
  const b = w.ball;
  const sp = Math.max(Math.hypot(b.vx, b.vy), G.recentMax || 0);
  fx.popups.length = 0;
  m.score[team]++;
  G.scorePulse[team] = 1;
  const last = [...w.touchHist].reverse().find((h) => h.team === team);
  const own = !last;
  const scorerId = own ? null : last.id;
  if (scorerId !== null) m.stats[scorerId].goals++;
  const fxKind = team === 0 && !own ? save.goalfx : ['classic', 'shockwave', 'fireworks'][m.kicks % 3];
  goalExplosion(m.mode === 'attract' ? 'classic' : fxKind, b.x, b.y, TEAM[team].glow);
  b.hidden = true; b.y = -5000; b.vx = b.vy = 0;
  sfxs.goal(team);
  const kmh = Math.round(sp * 0.036);
  const airGoal = !own && last.air;
  if (m.mode !== 'attract') {
    let sub;
    if (own) sub = 'OWN GOAL';
    else if (m.mode === '2p') sub = (team === 0 ? 'P1' : 'P2') + ' SCORES';
    else sub = team === 0 ? 'YOU SCORED' : 'BOT SCORED';
    popup(m.overtime ? 'GOLDEN GOAL!' : airGoal ? 'AERIAL GOAL!' : 'GOAL!', TEAM[team].light, { size: 1.15, life: 2.2, y: 0.36, sub: kmh >= 30 ? `${sub}  ·  ${kmh} KM/H` : sub });
  }
  m.phase = 'goal'; m.phaseT = 2.0; G.slowmo = 0.9;
  m.goalAbs = (G.frameCount || 0) - 1;
  m.goalTeam = team; m.goalFx = fxKind;
}

function skipReplay() {
  const m = G.match;
  if (!m || m.phase !== 'replay') return;
  afterGoal();
}
function afterGoal() {
  const m = G.match;
  G.replay = null;
  if (m.overtime) { finishMatch(); return; }
  if (m.time <= 0) {
    if (m.score[0] === m.score[1]) startOvertime(); else { finishMatch(); return; }
  }
  beginKickoff();
}
function startOvertime() {
  const m = G.match;
  m.overtime = true; m.otTime = 0;
  popup('OVERTIME', '#ffd23f', { size: 0.9, life: 1.8, sub: 'NEXT GOAL WINS' });
  sfxs.whistle();
}

// ---------- replay recording ----------
function record() {
  const w = G.world, b = w.ball;
  const f = { b: [b.x, b.y, b.rot, b.vx, b.vy], c: w.cars.map((c) => [c.x, c.y, c.a, c.dir, c.boosting, c.demo, c.supersonic, c.wheel, c.landT, c.boost, c.grounded, c.nx, c.ny, c.turnT]) };
  G.frames.push(f); G.frameCount = (G.frameCount || 0) + 1;
  if (G.frames.length > 6 * 60) G.frames.shift();
}
function frameView(f) {
  return {
    ball: { x: f.b[0], y: f.b[1], rot: f.b[2], vx: f.b[3], vy: f.b[4] },
    cars: f.c.map((a, i) => ({ id: i, team: i, x: a[0], y: a[1], a: a[2], dir: a[3], boosting: a[4], demo: a[5], supersonic: a[6], wheel: a[7], landT: a[8], boost: a[9], grounded: a[10], nx: a[11], ny: a[12], turnT: a[13] })),
  };
}

// ---------- per-frame visual helpers ----------
function emitCarFx(cars, dt) {
  cars.forEach((c, i) => {
    if (c.demo > 0) return;
    const ca = Math.cos(c.a), sa = Math.sin(c.a);
    const rx = c.x - c.dir * ca * 72, ry = c.y - c.dir * sa * 72 + 2;
    if (c.boosting) {
      const cols = trailCols(i);
      for (let k = 0; k < 2; k++) boostPuff(rx, ry, -c.dir * ca * 500 + c.vx * 0.2, -c.dir * sa * 500 + c.vy * 0.2, cols, c.supersonic);
    }
    if (c.supersonic) part({ x: c.x - c.dir * ca * 40 + (Math.random() - 0.5) * 30, y: c.y + (Math.random() - 0.5) * 30, vx: -c.vx * 0.15, vy: -c.vy * 0.15, life: 0.3, size: 5, col: '#ffffff', type: 'streak', drag: 1 });
  });
}
function updateTrail(b) {
  const l = G.trail[G.trail.length - 1];
  if (l && Math.hypot(b.x - l.x, b.y - l.y) > 400) G.trail.length = 0;   // teleport (kickoff, replay start): no streak across the pitch
  G.trail.push({ x: b.x, y: b.y, sp: Math.hypot(b.vx, b.vy) });
  if (G.trail.length > 14) G.trail.shift();
}

// ---------- the main loop ----------
function frame(now) {
  requestAnimationFrame(frame);
  let dt = Math.min(0.05, (now - G.lastFrame) / 1000);
  G.lastFrame = now;
  tick(dt);
  render(dt);
}

function inputsFor() {
  const w = G.world, m = G.match;
  const ins = [{}, {}];
  if (m.mode === 'attract') { ins[0] = { ...botInput(G.bots[0], w, STEP) }; ins[1] = { ...botInput(G.bots[1], w, STEP) }; return ins; }
  ins[0] = G.bots[0] ? { ...botInput(G.bots[0], w, STEP) } : readInput(0, m.mode);
  ins[1] = G.bots[1] ? (Q.get('idlebot') ? { x: 0, y: 0, jump: false, boost: false } : { ...botInput(G.bots[1], w, STEP) }) : readInput(1, '2p'); // ?idlebot=1: test hook, the bot sits still
  return ins;
}

function simulate(dt) {
  // fixed physics steps; hit-stop freezes, slow-mo stretches
  const m = G.match, w = G.world;
  if (G.hitstop > 0) { G.hitstop -= dt; return; }
  let scale = 1;
  if (G.slowmo > 0) { G.slowmo -= dt; scale = 0.3; }
  G.acc += dt * scale;
  let n = 0;
  while (G.acc >= STEP && n < 24) {
    G.acc -= STEP; n++;
    const ins = inputsFor();
    const g = step(w, ins);
    handleEvents(m.phase === 'play');
    G.stepCount = (G.stepCount || 0) + 1;
    G.recentMax = Math.max(Math.hypot(w.ball.vx, w.ball.vy), (G.recentMax || 0) * 0.996);
    if (G.stepCount % 4 === 0 && (m.phase === 'play' || (m.phase === 'goal' && m.phaseT > 1.2) || m.mode === 'attract')) record();
    if (G.stepCount % 24 === 0 && m.phase === 'play') { const pg = predictGoal(w.ball, 2.2); G.predSide = pg ? pg.side : null; G.predT = pg ? pg.t : 9; }
    if (g >= 0 && m.phase === 'play' && !w.ball.hidden) {
      if (m.mode === 'attract') { m.score[g]++; goalExplosion('classic', w.ball.x, w.ball.y, TEAM[g].glow); sfxs.goal(g); kickoff(w); G.frames = []; continue; }
      onGoal(g);
    }
  }
}

function tick(dt) {
  const m = G.match, w = G.world;
  if (!m) return;
  updateFx(dt);
  G.scorePulse = G.scorePulse.map((v) => Math.max(0, v - dt * 2));
  if (G.hint && (!m.phase || m.phase === 'play' || m.phase === 'countdown')) { G.hint.t -= dt; if (G.hint.t <= 0) G.hint = null; }
  if (G.goTimer > 0) G.goTimer -= dt;
  if (G.state === 'paused') { clearPressed(); return; }
  if (G.state === 'title' || G.state === 'garage' || G.state === 'how' || G.state === 'results') {
    if (m.mode === 'attract') simulate(dt);
    clearPressed();
    return;
  }
  // ---- match ----
  if (m.phase === 'countdown') {
    m.phaseT -= dt;
    const n = Math.ceil(m.phaseT / KICK_STEP);
    if (n < G.lastBeep && n > 0) { sfxs.beep(false); G.lastBeep = n; }
    if (m.phaseT <= 0) { m.phase = 'play'; sfxs.beep(true); G.goTimer = 0.5; }
    // cars idle-rev at the line; inputs ignored
    for (const c of w.cars) c.boost = Math.max(c.boost, 40);
  } else if (m.phase === 'play') {
    simulate(dt);
    if (m.phase === 'play') {
      if (m.overtime) m.otTime += dt;
      else {
        m.time -= dt;
        if (m.time <= 0) {
          m.time = 0;
          if (m.score[0] !== m.score[1]) finishMatch();
          else { startOvertime(); beginKickoff(); }
        }
      }
    }
  } else if (m.phase === 'goal') {
    simulate(dt);
    m.phaseT -= dt;
    if (m.phaseT <= 0) {
      if (save.replays && m.mode !== 'attract' && !Q.get('noreplay') && G.frames.length > 30) startReplay();
      else afterGoal();
    }
  } else if (m.phase === 'replay') {
    const r = G.replay;
    r.pos += dt * 60 * REPLAY_SPEED;
    const i = Math.floor(r.pos);
    if (i !== r.lastI && i < r.end) {
      const f = G.frames[Math.min(i, G.frames.length - 1)];
      const v = frameView(f);
      emitCarFx(v.cars.map((c) => ({ ...c, vx: 0, vy: 0 })), dt);
      if (i >= r.goalI && !r.boomed) { r.boomed = true; goalExplosion(m.goalFx, v.ball.x, v.ball.y, TEAM[m.goalTeam].glow); sfxs.goal(m.goalTeam); }
      r.lastI = i;
    }
    if (r.pos >= r.end || anyPressed('Space', 'Enter', 'KeyJ', 'KeyZ', 'Escape')) afterGoal();
  } else if (m.phase === 'over') {
    G.slowmo = 0; simulate(dt * 0.4);
    m.phaseT -= dt;
    if (m.phaseT <= 0) showResults();
  }
  clearPressed();
}

function startReplay() {
  const m = G.match;
  const goalI = m.goalAbs - ((G.frameCount || 0) - G.frames.length);
  const start = Math.max(0, goalI - Math.round(REPLAY_BEFORE * 60));
  const end = Math.min(G.frames.length - 1, goalI + Math.round(REPLAY_AFTER * 60));
  G.frames = G.frames.slice(start, end + 1);
  G.replay = { pos: 0, end: G.frames.length - 1, goalI: goalI - start, boomed: false, lastI: -1, t: 0 };
  m.phase = 'replay';
  resetFx(); cam.init = false;
}

function render(dt) {
  const m = G.match, w = G.world;
  if (!m) return;
  G.styles = [styleFor(0), styleFor(1)];
  const rp = G.state === 'match' && m.phase === 'replay';
  if (rp !== G.rpClass) { G.rpClass = rp; document.body.classList.toggle('inreplay', rp); }
  let view;
  if (m.phase === 'replay' && G.replay) {
    const f = G.frames[Math.min(G.frames.length - 1, Math.floor(G.replay.pos))];
    view = frameView(f);
    updateTrail(view.ball);
  } else {
    view = { ball: w.ball, cars: w.cars };
    if (!w.ball.hidden) updateTrail(w.ball);
    if (m.phase !== 'countdown' && G.hitstop <= 0) emitCarFx(w.cars, dt);
  }
  // camera: whole arena on big screens, follow ball + human car(s) on small ones
  const b = view.ball.y < -1000 ? { x: 0, y: 300 } : view.ball;
  const focus = [{ x: b.x, y: b.y, w: 1.4 }];
  const c0 = view.cars[0], c1 = view.cars[1];
  if (m.mode === 'attract' || m.phase === 'replay') focus.push({ x: b.x, y: b.y, w: 1 });
  else {
    if (c0.demo <= 0) focus.push({ x: c0.x, y: c0.y, w: 1 });
    if (m.mode === '2p' && c1.demo <= 0) focus.push({ x: c1.x, y: c1.y, w: 1 });
  }
  updateCamera(dt, focus, b.y < -1000 ? null : b, m.phase === 'replay' ? 1.15 : 1, m.mode === '2p' && m.phase !== 'replay');
  // audio
  const live = G.state === 'match' && (m.phase === 'play' || m.phase === 'goal' || m.phase === 'countdown');
  view.cars.forEach((c, i) => engine(i, Math.hypot(c.vx || 0, c.vy || 0), c.boosting, (c.x - cam.x) / 1400, live && c.demo <= 0 && (i === 0 || m.mode !== 'attract'), c.grounded));
  const nearGoal = Math.max(0, 1 - (W / 2 - Math.abs(b.x)) / 900) * (b.y < GH + 200 ? 1 : 0.4);
  crowdLevel(Math.min(1, nearGoal * 0.8 + (m.phase === 'goal' ? 1 : 0)), G.state !== 'title' || true);
  draw({
    ball: view.ball.y < -1000 ? { ...view.ball, x: 0, y: -5000 } : view.ball,
    cars: view.cars, styles: G.styles, trail: m.phase === 'goal' ? [] : G.trail, touchTeam: w.lastTouch,
    hud: G.state === 'match' || G.state === 'paused' ? {
      match: m, scorePulse: G.scorePulse, names: m.mode === '2p' ? ['P1', 'P2'] : ['YOU', 'BOT ' + DIFF_NAMES[m.diff]],
      touch: touch.used, twoP: m.mode === '2p', countdown: m.phase === 'countdown' ? m.phaseT / KICK_STEP : 0, go: G.goTimer,
      replay: m.phase === 'replay', hint: m.phase === 'play' || m.phase === 'countdown' ? G.hint : null,
    } : null,
  }, dt);
}

// ---------- menus ----------
const SCREENS = ['title', 'garage', 'how', 'pause', 'results'];
function showScreen(id) { for (const s of SCREENS) $(s).classList.toggle('hidden', s !== id); orientHint(); }
function orientHint() {
  const portrait = innerHeight > innerWidth && innerWidth < 600;
  $('rotate').classList.toggle('hidden', !(portrait && G.state === 'match' && G.match && G.match.kicks <= 1 && !G.rotateShown));
  if (portrait && G.state === 'match' && !G.rotateTimer) G.rotateTimer = setTimeout(() => { G.rotateShown = true; $('rotate').classList.add('hidden'); }, 5000);
}
function refreshTitle() {
  document.querySelectorAll('#modes button').forEach((b) => b.classList.toggle('on', b.dataset.mode === save.mode));
  document.querySelectorAll('#diffs button').forEach((b) => b.classList.toggle('on', b.dataset.diff === save.diff));
  $('diffs').classList.toggle('dim', save.mode === '2p');
  const lv = levelFromXp(save.xp);
  $('lvlNum').textContent = 'LV ' + lv;
  $('lvlBar').style.width = (save.xp % XP_PER_LEVEL) / XP_PER_LEVEL * 100 + '%';
  const next = Object.keys(UNLOCKS).map(Number).find((l) => l > lv);
  $('lvlNext').textContent = next ? `next: ${itemName(...UNLOCKS[next])} at LV ${next}` : 'everything unlocked';
  $('recs').textContent = save.played ? `Wins ${save.wins} · Losses ${save.losses} · Goals ${save.goals} · Best streak ${save.bestStreak}` : '';
  $('muteBtn').classList.toggle('off', save.muted); $('musicBtn').classList.toggle('off', !save.music);
}
function goTitle() {
  G.state = 'title';
  document.body.classList.remove('inmatch');
  startAttract();
  refreshTitle();
  showScreen('title');
  setMusicMode('menu');
}
const click = (id, fn) => $(id).addEventListener('click', (e) => { initAudio(); sfxs.click(); fn(e); });
click('play', () => startMatch());
click('rematch', () => startMatch({ mode: G.match.mode, diff: G.match.diff }));
click('resMenu', goTitle);
click('quit', goTitle);
click('resume', resume);
click('restart', () => startMatch({ mode: G.match.mode, diff: G.match.diff }));
click('pauseBtn', () => (G.state === 'paused' ? resume() : pause()));
click('howBtn', () => { G.state = 'how'; showScreen('how'); });
click('howBack', () => { G.state = 'title'; showScreen('title'); });
click('garageBtn', () => openGarage('title'));
click('resGarage', () => openGarage('results'));
click('garageBack', () => { if (G.garageFrom === 'results') { G.state = 'results'; showScreen('results'); } else { G.state = 'title'; refreshTitle(); showScreen('title'); } });
click('muteBtn', () => { save.muted = !save.muted; setMuted(save.muted); persist(); refreshTitle(); });
click('musicBtn', () => { save.music = !save.music; setMusic(save.music); persist(); refreshTitle(); });
document.querySelectorAll('#modes button').forEach((b) => b.addEventListener('click', () => { sfxs.click(); save.mode = b.dataset.mode; persist(); refreshTitle(); }));
document.querySelectorAll('#diffs button').forEach((b) => b.addEventListener('click', () => { sfxs.click(); save.diff = b.dataset.diff; persist(); refreshTitle(); }));

function pause() {
  if (G.state !== 'match') return;
  G.state = 'paused'; showScreen('pause');
  for (let i = 0; i < 2; i++) engine(i, 0, false, 0, false, true);
}
function resume() { if (G.state !== 'paused') return; G.state = 'match'; showScreen(null); G.lastFrame = performance.now(); }

function onKey(e) {
  if (e.code === 'KeyM') { save.muted = !save.muted; setMuted(save.muted); persist(); refreshTitle(); }
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (G.state === 'match' && G.match.phase !== 'replay') pause();
    else if (G.state === 'paused') resume();
  }
  if (e.code === 'Enter' || e.code === 'Space') {
    if (G.state === 'title' && !e.repeat) { initAudio(); startMatch(); }
    else if (G.state === 'results' && !e.repeat) startMatch({ mode: G.match.mode, diff: G.match.diff });
  }
}

// ---------- garage ----------
let gTab = 'paint', previewRaf = 0;
function openGarage(from) {
  G.garageFrom = from; G.state = 'garage'; showScreen('garage'); renderGarage();
  cancelAnimationFrame(previewRaf);
  const loop = () => { if (G.state !== 'garage') return; drawPreview($('preview'), styleFor(0)); previewRaf = requestAnimationFrame(loop); };
  loop();
}
function renderGarage() {
  document.querySelectorAll('#gtabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === gTab));
  const lv = levelFromXp(save.xp);
  const list = LISTS[gTab];
  $('grid').innerHTML = '';
  for (const it of list) {
    const need = unlockLevel(gTab, it.id), locked = need > lv;
    const b = document.createElement('button');
    const sel = save[gTab] === it.id;
    b.className = (sel ? 'sel ' : '') + (locked ? 'locked' : '');
    let sw = '';
    if (gTab === 'paint') sw = `<span class="sw" style="background:${it.col || 'linear-gradient(90deg,#2b8cff,#ff8a1f)'}"></span>`;
    if (gTab === 'trail') sw = `<span class="sw" style="background:${it.cols ? `linear-gradient(90deg,${it.cols.join(',')})` : 'linear-gradient(90deg,#9fd0ff,#2b8cff)'}"></span>`;
    b.innerHTML = `${sw}<span>${it.name}</span>${locked ? `<small>LV ${need}</small>` : ''}`;
    b.addEventListener('click', () => {
      if (locked) return;
      sfxs.click(); save[gTab] = it.id; persist(); renderGarage();
      if (gTab === 'goalfx') { /* tiny demo burst on the preview is enough */ }
    });
    $('grid').appendChild(b);
  }
}
document.querySelectorAll('#gtabs button').forEach((b) => b.addEventListener('click', () => { sfxs.click(); gTab = b.dataset.tab; renderGarage(); }));

// ---------- test hooks ----------
Object.assign(G, {
  startMatch, goTitle, save, persist,
  setBotP1(diff) { G.botP1 = diff; if (G.match && G.match.mode !== 'attract') G.bots[0] = diff ? makeBot(diff, 0) : null; },
  skip() { if (G.match.phase === 'replay') afterGoal(); else if (G.match.phase === 'countdown') G.match.phaseT = 0.01; },
  // advance the game n frames of dt seconds without rendering (headless fast-forward)
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) tick(dt); },
});
Object.defineProperty(G, 'phase', { get: () => G.match && G.match.phase });

// ---------- boot ----------
if (Q.get('play')) { startMatch({ mode: Q.get('mode') || 'bot', diff: Q.get('diff') || save.diff }); }
else goTitle();
requestAnimationFrame(frame);
