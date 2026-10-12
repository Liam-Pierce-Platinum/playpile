// SUMO SLAM: boot, fixed 60 Hz loop with hit-stop and slow-mo, screens,
// match flow, saving, and the test hooks on window.__G.
import { Sim, TIERS, BOT_NAMES, WIN_ROUNDS, POWERS, mulberry32 } from './sim.js';
import { View } from './view.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { load, save, COLORS } from './save.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const view = new View(canvas);
const snd = new Sound();
const input = new Input();
const data = load();
const FORCE_MUTE = Q.has('mute'); // test flag: never written to the save
snd.setMuted(FORCE_MUTE || !!data.muted);
const TOUCH = Q.has('touch') || matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (TOUCH) document.body.classList.add('touch');
if (TOUCH) document.querySelector('#spect span').textContent = 'tap to skip';

const STEP = 1 / 60;
let state = 'title';
let sim = null;
let opts = { mode: data.mode === '2p' && !TOUCH ? '2p' : 'solo', tier: Math.min(data.tier, data.unlocked) };
let acc = 0, freeze = 0, slowT = 0, endWait = 0, skipping = false;
let autopilot = Q.has('auto');
const override = [null, null];
let lastNewUnlock = null;
let quiet = false; // true while fast-forwarding: no pop text pile-ups

// ---------- screens ----------
function show(id) {
  for (const s of ['title', 'results', 'pause']) $(s).classList.toggle('hidden', s !== id);
  $('hud').classList.toggle('hidden', id === 'title');
  document.body.classList.toggle('noplay', !!id);
}

function buildTitle() {
  const tr = $('tierRow');
  tr.innerHTML = '';
  TIERS.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'chip' + (i === opts.tier ? ' on' : '') + (i > data.unlocked ? ' locked' : '');
    b.textContent = t.name;
    b.onclick = () => {
      snd.init(); snd.click();
      if (i > data.unlocked) { flashHelp(`Win a ${TIERS[i - 1].name} match to unlock ${t.name}`); return; }
      opts.tier = i; data.tier = i; save(data); buildTitle();
    };
    tr.appendChild(b);
  });
  const cr = $('colorRow');
  cr.innerHTML = '';
  for (const c of COLORS) {
    const b = document.createElement('button');
    const locked = data.wins < c.need;
    b.className = (data.color === c.id ? 'on' : '') + (locked ? ' locked' : '');
    b.style.background = c.hex;
    b.setAttribute('aria-label', c.id);
    b.onclick = () => {
      snd.init(); snd.click();
      if (locked) { flashHelp(`${c.need} match win${c.need > 1 ? 's' : ''} unlocks this colour`); return; }
      data.color = c.id; save(data); buildTitle();
    };
    cr.appendChild(b);
  }
  for (const b of $('modeRow').children) {
    b.classList.toggle('on', b.dataset.mode === opts.mode);
    if (b.dataset.mode === '2p' && TOUCH) b.classList.add('hidden');
  }
  if (TOUCH) $('modeRow').classList.add('hidden');
  setHelp();
}
let helpTimer = 0;
function setHelp() {
  const h = $('helpLine');
  if (TOUCH) h.textContent = 'Drag on the left to move. Hold SLAM, let go to dash.';
  else if (opts.mode === '2p') h.textContent = 'P1: WASD + SPACE    P2: ARROWS + ENTER    (hold to charge, let go to dash)';
  else h.textContent = 'WASD / arrows to move. Hold SPACE (or click), let go to dash. First to 3 rounds.';
  const rec = data.matches ? `  Wins ${data.wins} / ${data.matches}` : '';
  h.textContent += rec;
}
function flashHelp(t) {
  const h = $('helpLine'); h.textContent = t; h.style.color = '#ffe14d';
  clearTimeout(helpTimer); helpTimer = setTimeout(() => { h.style.color = ''; setHelp(); }, 2200);
}
$('modeRow').addEventListener('click', (e) => {
  const m = e.target.dataset && e.target.dataset.mode;
  if (!m) return;
  snd.init(); snd.click();
  opts.mode = m; data.mode = m; save(data); buildTitle();
});

// ---------- match setup ----------
function colorHex(id) { return (COLORS.find((c) => c.id === id) || COLORS[0]).hex; }

function makePlayers(mode, rnd) {
  const mine = colorHex(data.color);
  const others = COLORS.slice(0, 4).map((c) => c.hex).filter((h) => h !== mine);
  if (others.length > 3) others.length = 3;
  const names = BOT_NAMES.slice().sort(() => rnd() - 0.5);
  const ps = [{ name: mode === '2p' ? 'P1' : 'YOU', color: mine, human: 0, hat: data.crown ? 'crown' : 'knot' }];
  if (mode === '2p') ps.push({ name: 'P2', color: others.shift(), human: 1, hat: 'band' });
  while (ps.length < 4) ps.push({ name: names[ps.length], color: others.shift(), human: null, hat: rnd() < 0.5 ? 'band' : 'knot' });
  return ps;
}

function startMatch(o = {}) {
  Object.assign(opts, o);
  input.mode = opts.mode;
  const seed = o.seed ?? (Q.has('seed') && !startMatch.used ? +Q.get('seed') : (Math.random() * 1e9) | 0);
  startMatch.used = true;
  sim = new Sim({ seed, tier: opts.tier });
  sim.autoHumans = autopilot;
  sim.setupMatch(makePlayers(opts.mode, mulberry32(seed + 1)));
  view.setMatch(sim);
  buildTags();
  state = 'play';
  show(null);
  $('hud').classList.remove('hidden');
  $('keysHint').textContent = opts.mode === '2p' ? 'P1: WASD + SPACE  ·  P2: ARROWS + ENTER' : 'Move: WASD / arrows  ·  HOLD Space or mouse, LET GO to SLAM';
  $('keysHint').style.opacity = 1;
  clearTimeout(startMatch.hintT); startMatch.hintT = setTimeout(() => { $('keysHint').style.opacity = 0; }, 8000);
  nextRound();
  view.snapCamera(sim);
  snd.init();
  snd.setMusic(true);
}

function nextRound() {
  sim.startRound();
  endWait = 0; skipping = false; slowT = 0; freeze = 0;
  view.lastR = sim.R;
  $('roundLbl').textContent = 'ROUND ' + sim.round;
  $('roundLbl').style.display = 'block';
  banner('READY', sim.round > 1 ? `ROUND ${sim.round}` : 'knock them all off the ring!', 0);
  snd.count(1);
  renderBoard();
}

function startAttract() {
  sim = new Sim({ seed: (Math.random() * 1e9) | 0, tier: 1, attract: true });
  const ps = makePlayers('solo', Math.random);
  ps[0].human = null; ps[0].name = BOT_NAMES[9];
  sim.setupMatch(ps);
  view.setMatch(sim);
  buildTags();
  sim.startRound();
  sim.introT = 0.01;
  view.snapCamera(sim);
}

function toTitle() {
  state = 'title';
  snd.setMusic(false);
  for (const w of sim ? sim.ws : []) snd.chargeStop(w.id);
  buildTitle();
  show('title');
  $('banner').innerHTML = '';
  $('spect').classList.add('hidden');
  startAttract();
}

// ---------- HUD ----------
let tagEls = [];
function buildTags() {
  const box = $('tags');
  box.innerHTML = '';
  tagEls = sim.ws.map((w) => {
    const d = document.createElement('div');
    d.className = 'tagn' + (w.human !== null ? ' me' : '');
    d.textContent = w.name;
    if (w.human !== null) d.style.background = w.human === 0 ? '#2a1f4d' : '#c77800';
    box.appendChild(d);
    return d;
  });
}
function renderBoard() {
  const b = $('board');
  b.innerHTML = '';
  for (const w of sim.ws) {
    const c = document.createElement('div');
    c.className = 'card' + (w.falling || !w.alive ? ' out' : '');
    c.id = 'card' + w.id;
    let pips = '';
    for (let i = 0; i < WIN_ROUNDS; i++) pips += `<i class="${i < w.score ? 'on' : ''}"></i>`;
    c.innerHTML = `<span class="dot" style="background:${w.color}"></span><span class="nm">${w.name}</span><span class="pips">${pips}</span>`;
    b.appendChild(c);
  }
}
let bannerTimer = 0;
function banner(big, small, hideAfter = 1.1) {
  const el = $('banner');
  el.className = '';
  el.innerHTML = `<b>${big}</b>${small ? `<span>${small}</span>` : ''}`;
  // long names ("TOFU TANK WINS") must still fit a 320 px phone
  for (const c of el.children) {
    const rg = document.createRange(); rg.selectNodeContents(c);
    const fit = innerWidth * 0.92, w = rg.getBoundingClientRect().width + (c.tagName === 'SPAN' ? 32 : 6);
    if (w > fit) c.style.fontSize = (parseFloat(getComputedStyle(c).fontSize) * fit / w).toFixed(1) + 'px';
  }
  void el.offsetWidth;
  el.className = 'show';
  clearTimeout(bannerTimer);
  if (hideAfter) bannerTimer = setTimeout(() => { el.className = 'hide'; }, hideAfter * 1000);
}
const tmp = { x: 0, y: 0, z: 0 };
function pop(text, x, y, z, size = 30, color = '#fff') {
  if (quiet || $('pops').childElementCount > 5) return;
  view.screenOf(x, y, z, tmp);
  const d = document.createElement('div');
  d.className = 'pop';
  d.textContent = text;
  // keep pop text on screen (falls happen right at the edge of the view)
  const half = text.length * size * 0.33 + 8;
  d.style.left = Math.max(half, Math.min(view.w - half, tmp.x)) + 'px';
  let top = Math.max(size + 60, Math.min(view.h - size, tmp.y));
  // never stack two pops on the same spot
  for (const o of $('pops').children) {
    if (Math.abs(parseFloat(o.style.top) - top) < size * 0.9 && Math.abs(parseFloat(o.style.left) - tmp.x) < 120) {
      if (o.textContent === text) return; // the same word twice on one spot reads as a glitch
      top -= size * 1.05;
    }
  }
  d.style.top = top + 'px';
  d.style.fontSize = size + 'px'; d.style.color = color;
  $('pops').appendChild(d);
  setTimeout(() => d.remove(), 850);
}
function updateTags() {
  if (!sim) return;
  sim.ws.forEach((w, i) => {
    const el = tagEls[i];
    if (!el) return;
    const vis = w.alive && w.y > -3 && state !== 'title' ? 1 : 0;
    if (!vis) { el.style.display = 'none'; return; }
    view.screenOf(w.x, w.y + 2.3 * w.r + (w.human !== null ? 0.9 : 0), w.z, tmp);
    el.style.display = 'block';
    el.style.left = tmp.x + 'px'; el.style.top = tmp.y + 'px';
  });
  // dash button charge ring
  if (state === 'play' && TOUCH && sim.ws[0]) {
    const w = sim.ws[0];
    $('dashRing').style.strokeDashoffset = String(283 * (1 - (w.charging ? w.charge : 0)));
  }
}

// ---------- events -> juice ----------
const isHuman = (id) => sim.ws[id] && sim.ws[id].human !== null;
function vib(ms) { if (TOUCH && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) { /* ignore */ } }

function handleEvents(live) {
  for (const e of sim.events) {
    if (!live) continue;
    switch (e.type) {
      case 'go': banner('SLAM!', null, 0.6); snd.count(0); view.shake(0.4); break;
      case 'dash': {
        const w = sim.ws[e.id];
        view.burst('dust', w.x, 0, w.z, e.pow);
        view.pop(e.id, -2.5);
        snd.chargeStop(e.id); snd.dash(e.pow);
        break;
      }
      case 'chargeStart': snd.chargeStart(e.id); break;
      case 'chargeStop': snd.chargeStop(e.id); break;
      case 'hit': {
        const p = e.power;
        const b = sim.ws[e.b];
        if (e.dash || e.shock || p > 0.35) {
          view.burst('hit', e.x, b.y, e.z, p);
          view.flash(e.b, 0.9);
          view.pop(e.a, -1.5);
          view.shake(0.25 + p * 0.6);
          freeze = Math.max(freeze, 0.035 + 0.075 * p);
          snd.hit(p, true);
          if (e.dash && p > 0.55) pop(p > 0.85 ? 'MEGA SLAM!' : 'SLAM!', e.x, 2.6, e.z, p > 0.85 ? 34 : 28, p > 0.85 ? '#ffe14d' : '#fff');
          if (isHuman(e.a) || isHuman(e.b)) vib(p > 0.7 ? 40 : 20);
        } else {
          view.pop(e.a, -0.6 * p * 4); view.pop(e.b, -0.6 * p * 4);
          snd.hit(p * 0.6, false);
        }
        break;
      }
      case 'clash':
        pop('CLASH!', e.x, 2.8, e.z, 34, '#7fd6ff');
        view.shake(0.9); freeze = Math.max(freeze, 0.12); snd.clash(); vib(60);
        break;
      case 'leap': snd.leap(); view.burst('dust', e.x, 0, e.z, 1); break;
      case 'shock': view.burst('shock', e.x, 0, e.z); view.shake(1); snd.shock(); freeze = Math.max(freeze, 0.08); pop('BOOM!', e.x, 2, e.z, 36, '#9dffbf'); break;
      case 'land': view.burst('dust', e.x, 0, e.z, 0.4); snd.land(); break;
      case 'pickup': {
        const w = sim.ws[e.id];
        const col = e.kind === 'giant' ? '#ffb020' : e.kind === 'heavy' ? '#b8c6e0' : '#38e07b';
        view.burst('pickup', e.x, 0, e.z, 1, col);
        pop(POWERS[e.kind].label, w.x, 3.2 * w.r, w.z, 30, col);
        snd.pickup(); view.pop(e.id, 3);
        break;
      }
      case 'powerEnd': snd.powerEnd(); break;
      case 'itemLost': view.burst('dust', e.x, 0, e.z, 0.5); break;
      case 'fall': {
        const w = sim.ws[e.id];
        snd.chargeStop(e.id);
        snd.fall(); snd.crowd(e.last);
        pop('OUT!', w.x, 2.5, w.z, 40, '#ff4b7d');
        view.shake(0.5);
        if (e.last) slowT = 1.0;
        setTimeout(() => { if (sim && sim.ws[e.id] === w) { view.burst('splash', w.x, -14, w.z); } }, 500);
        if (isHuman(e.id)) vib(120);
        renderBoard();
        break;
      }
      case 'roundEnd': {
        const w = sim.ws[e.winner];
        renderBoard();
        const card = w && $('card' + w.id);
        if (card) { card.classList.add('bump'); setTimeout(() => card.classList.remove('bump'), 300); }
        if (!w) { banner('DRAW!', 'nobody scores'); break; }
        const me = w.human !== null;
        const who = me ? (opts.mode === '2p' ? `${w.name} WINS` : 'YOU WIN') : `${w.name.toUpperCase()} WINS`;
        if (e.match !== null) banner(me && opts.mode !== '2p' ? 'CHAMPION!' : who, 'the match', 1.8);
        else banner(who, `the round  ${w.score}/${WIN_ROUNDS}`, 1.7);
        if (w.alive && !w.falling) view.burst('confetti', w.x, 0, w.z);
        if (me) snd.roundWin(); else snd.lose();
        break;
      }
    }
  }
  sim.events.length = 0;
}

// ---------- results ----------
function finishMatch() {
  state = 'results';
  snd.setMusic(false);
  const winner = sim.ws[sim.matchWinner];
  const humanWon = winner && winner.human !== null;
  const soloWin = opts.mode === 'solo' && humanWon;
  data.matches++;
  lastNewUnlock = null;
  const unlockLines = [];
  if (soloWin) {
    const colorsBefore = COLORS.filter((c) => data.wins >= c.need).length;
    data.wins++;
    data.streak++; data.bestStreak = Math.max(data.bestStreak, data.streak);
    const colorsAfter = COLORS.filter((c) => data.wins >= c.need).length;
    if (colorsAfter > colorsBefore) unlockLines.push('New colour unlocked!');
    if (opts.tier === data.unlocked && data.unlocked < TIERS.length - 1) {
      data.unlocked++;
      lastNewUnlock = data.unlocked;
      unlockLines.push(`${TIERS[data.unlocked].name} league unlocked!`);
    }
    if (opts.tier === TIERS.length - 1 && !data.crown) { data.crown = true; unlockLines.push('You earned the GOLD CROWN!'); }
  } else if (opts.mode === 'solo') data.streak = 0;
  save(data);
  if (humanWon) snd.win(); else snd.lose();
  $('resTitle').textContent = opts.mode === '2p' ? (humanWon ? `${winner.name} WINS!` : 'BOTS WIN!') : humanWon ? 'YOU WIN!' : `${winner.name.toUpperCase()} WINS`;
  $('resSub').textContent = `${TIERS[opts.tier].name} league  ·  ${sim.round} rounds` + (soloWin && data.streak > 1 ? `  ·  ${data.streak} win streak` : '');
  const list = $('resList');
  list.innerHTML = '';
  const order = sim.ws.slice().sort((a, b) => b.score - a.score || b.stats.outs - a.stats.outs);
  for (const w of order) {
    let pips = '';
    for (let i = 0; i < WIN_ROUNDS; i++) pips += `<i class="${i < w.score ? 'on' : ''}"></i>`;
    const r = document.createElement('div');
    r.className = 'rrow' + (w.human !== null ? ' me' : '');
    r.innerHTML = `<span class="dot" style="background:${w.color}"></span><span class="nm">${w.name}</span><span class="st">${w.stats.outs} KO · ${w.stats.slams} slams</span><span class="pips">${pips}</span>`;
    list.appendChild(r);
  }
  $('resUnlock').textContent = unlockLines.join('  ');
  $('nextBtn').classList.toggle('hidden', !(soloWin && opts.tier < data.unlocked));
  show('results');
  $('banner').innerHTML = '';
  $('hud').classList.remove('hidden');
  $('roundLbl').style.display = 'none';
}

// ---------- buttons ----------
function tapAudio() { snd.init(); }
$('playBtn').onclick = () => { tapAudio(); snd.click(); startMatch({}); };
$('retryBtn').onclick = () => { tapAudio(); snd.click(); startMatch({}); };
$('nextBtn').onclick = () => { tapAudio(); snd.click(); opts.tier = Math.min(data.unlocked, opts.tier + 1); data.tier = opts.tier; save(data); startMatch({}); };
$('menuBtn').onclick = () => { snd.click(); toTitle(); };
$('pauseBtn').onclick = () => { snd.click(); pause(); };
$('resumeBtn').onclick = () => { snd.click(); resume(); };
$('restartBtn').onclick = () => { snd.click(); startMatch({}); };
$('quitBtn').onclick = () => { snd.click(); toTitle(); };
function syncMute() { for (const id of ['muteBtn', 'muteBtn2']) $(id).classList.toggle('off', !!data.muted); }
$('muteBtn').onclick = () => { snd.init(); data.muted = !data.muted; snd.setMuted(FORCE_MUTE || data.muted); save(data); syncMute(); if (!data.muted) snd.click(); };
$('muteBtn2').onclick = $('muteBtn').onclick;
syncMute();
function pause() {
  if (state !== 'play') return;
  state = 'paused';
  for (const w of sim.ws) snd.chargeStop(w.id);
  snd.setMusic(false);
  show('pause'); $('hud').classList.remove('hidden');
}
function resume() {
  if (state !== 'paused') return;
  state = 'play'; show(null); $('hud').classList.remove('hidden'); snd.setMusic(true);
}
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

input.onKey = (code) => {
  snd.init();
  if (state === 'title' && (code === 'Enter' || code === 'Space')) { startMatch({}); return; }
  if (state === 'results' && (code === 'KeyR' || code === 'Enter' || code === 'Space')) { startMatch({}); return; }
  if (state === 'play' && (code === 'Escape' || code === 'KeyP')) { pause(); return; }
  if (state === 'paused' && (code === 'Escape' || code === 'KeyP' || code === 'Enter' || code === 'Space')) { resume(); return; }
  if (code === 'KeyM') $('muteBtn').onclick();
  if (state === 'play' && spectating()) skipping = true;
};
input.bindTouch($('tzone'), $('stick'), $('stick').firstElementChild, $('dashBtn'));
canvas.addEventListener('pointerdown', (e) => {
  snd.init();
  if (state === 'play' && spectating()) { skipping = true; return; }
  if (e.pointerType === 'mouse' && state === 'play') input.mouseDash = true;
});
addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') input.mouseDash = false; });
$('hud').addEventListener('pointerdown', () => { if (state === 'play' && spectating()) skipping = true; });

function spectating() {
  return sim && sim.phase === 'fight' && sim.ws.every((w) => w.human === null || w.falling || !w.alive);
}

// ---------- loop ----------
function feedInputs() {
  for (const w of sim.ws) {
    if (w.human === null || autopilot) continue;
    const o = override[w.human];
    const i = o || input.read(w.human);
    w.input.x = i.x; w.input.z = i.z; w.input.dash = !!i.dash;
  }
}

function tick(dtSim) {
  // returns after one fixed step
  if (state === 'play' || state === 'title') {
    if (state === 'play') feedInputs();
    sim.step(dtSim);
    handleEvents(state === 'play');
    if (sim.phase === 'end') {
      endWait += dtSim;
      if (state === 'title' && endWait > 2) { endWait = 0; sim.ws.forEach((w) => { w.score = 0; }); sim.startRound(); sim.introT = 0.01; }
      else if (state === 'play' && endWait > 2.3) {
        if (sim.matchWinner !== null) finishMatch();
        else nextRound();
      }
    }
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!sim) return;
  let scale = 1;
  if (state === 'paused' || state === 'results') scale = state === 'results' ? 0.5 : 0;
  if (slowT > 0) { slowT -= rdt; scale *= 0.3; }
  if (state === 'play' && spectating()) {
    scale *= 2.2;
    $('spect').classList.remove('hidden');
    document.body.classList.add('spectating');
  } else { $('spect').classList.add('hidden'); document.body.classList.remove('spectating'); }
  if (skipping && state === 'play') {
    let n = 0;
    quiet = true;
    while (state === 'play' && sim.phase === 'fight' && n++ < 60 * 60) tick(STEP);
    quiet = false;
    skipping = false;
  }
  if (freeze > 0) { freeze -= rdt; scale = 0; }
  if (state === 'results') {
    // keep the winner bouncing on the results backdrop
    sim.phase = sim.phase === 'end' ? 'end' : sim.phase;
    sim.step(rdt * 0.5); sim.events.length = 0;
  } else {
    acc += rdt * scale;
    let n = 0;
    while (acc >= STEP && n++ < 8) { acc -= STEP; tick(STEP); }
    if (n >= 8) acc = 0;
  }
  view.update(sim, STEP, rdt);
  view.render();
  updateTags();
}

function resize() {
  view.resize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// ---------- test hooks ----------
window.__G = {
  get state() { return state; },
  get sim() { return sim; },
  view, snd, data,
  get autopilot() { return autopilot; },
  set autopilot(v) { autopilot = !!v; if (sim) sim.autoHumans = autopilot; },
  start(o = {}) { startMatch(o); return sim; },
  step(n = 1) { for (let i = 0; i < n; i++) tick(STEP); view.update(sim, STEP, STEP * n); view.render(); updateTags(); return state; },
  fast(sec) {
    let n = Math.round(sec * 60);
    quiet = true;
    while (n-- > 0 && (state === 'play' || state === 'title')) { tick(STEP); if (n % 4 === 0) view.update(sim, STEP, STEP * 4); }
    quiet = false;
    view.update(sim, STEP, STEP); view.render(); updateTags();
    return state;
  },
  input(pid, x, z, dash) { override[pid] = x === null ? null : { x, z, dash }; },
  render() { view.update(sim, STEP, 0.0001); view.render(); updateTags(); },
  toTitle, pause, resume, finishMatch,
};

if (Q.has('play')) {
  opts.mode = Q.get('mode') === '2p' ? '2p' : 'solo';
  if (Q.has('tier')) opts.tier = Math.max(0, Math.min(3, +Q.get('tier')));
  buildTitle();
  startMatch({});
} else {
  toTitle();
}
requestAnimationFrame((t) => { last = t; frame(t); });
setTimeout(() => $('loading').classList.add('gone'), 150);
// never leave a button focused: SPACE/ENTER are game keys
document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); });
