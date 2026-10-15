// MIRROR DUEL - game shell: input, juice, rounds, ladder, screens.
import { compileStage, newRound, step, DT, W, H, FLOOR, MODS } from './sim.js';
import { STAGES } from './stages.js';
import { makeRenderer, COL } from './render.js';
import { audio, sfx, music, tickMusic } from './audio.js';
import { makeBot } from './bot.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem('mirrorduel.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mirrorduel.' + k, JSON.stringify(v)); } catch {} },
};
if (Q.get('mute') === '1') audio.setMuted(true); else audio.setMuted(store.get('muted', false));

const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const R = makeRenderer($('c'));
addEventListener('resize', () => R.resize());

// ---------------- state ----------------
const G = {
  stageIdx: 0, stageCount: STAGES.length, st: null, s: null, wins: [0, 0], round: 1,
  fx: { parts: [], texts: [], shake: 0, flash: 0, banner: null }, trails: [[], []], chip: [1, 1],
  hint: '', hintA: 0, screen: 'play', bot: null, slow: 0, matchOver: false, matchId: 0, stats: null,
};
let unlocked = store.get('unlocked', 0), stars = store.get('stars', []);

function startStage(i, { attract = false } = {}) {
  G.stageIdx = Math.max(0, Math.min(STAGES.length - 1, i));
  G.st = compileStage(STAGES[G.stageIdx]);
  G.wins = [0, 0]; G.matchOver = false; G.stats = { hazDealt: 0, hazTaken: 0, roundsLost: 0, time: 0 };
  if (!attract) store.set('current', G.stageIdx);
  startRound(1);
}
function startRound(n) {
  G.round = n; G.s = newRound(G.st, n);
  G.trails = [[], []]; G.chip = [1, 1]; G.fx.parts.length = 0; G.fx.texts.length = 0;
  G.hint = G.screen === 'play' && n === 1 ? STAGES[G.stageIdx].hint : '';
  G.hintA = G.hint ? 9 : 0;
  banner(`ROUND ${n}`, 66, STAGES[G.stageIdx].name + ((STAGES[G.stageIdx].mods || []).length ? '  /  ' + STAGES[G.stageIdx].mods.map((m) => MODS[m].name).join(' + ') : ''), 70);
  sfx('bell');
}
function banner(text, max, sub, size) { G.fx.banner = { text, t: max, max, sub, size }; }

// ---------------- input ----------------
const keys = new Set(), touchIn = { l: 0, r: 0, j: 0, p: 0, h: 0 };
const KEYMAP = { ArrowLeft: 'l', KeyA: 'l', ArrowRight: 'r', KeyD: 'r', ArrowUp: 'j', KeyW: 'j', Space: 'j', KeyJ: 'p', KeyZ: 'p', KeyK: 'h', KeyX: 'h' };
function wake() { audio.wake(); music(true); }
addEventListener('keydown', (e) => {
  wake();
  if (KEYMAP[e.code]) { keys.add(KEYMAP[e.code]); e.preventDefault(); }
  if (e.repeat) return;
  if (G.screen === 'card') {
    if (['Enter', 'Space', 'KeyJ'].includes(e.code)) cardPrimary();
    else if (e.code === 'KeyR') retry();
    else if (e.code === 'Escape') showTitle();
  } else if (G.screen === 'play') {
    if (e.code === 'KeyR') retry();
    if (e.code === 'Escape') showTitle();
  } else if (G.screen === 'title' && (e.code === 'Enter')) play(store.get('current', 0));
  if (e.code === 'KeyM') toggleMute();
});
addEventListener('keyup', (e) => { if (KEYMAP[e.code]) keys.delete(KEYMAP[e.code]); });
addEventListener('blur', () => keys.clear());
addEventListener('pointerdown', wake, { capture: true });

for (const el of document.querySelectorAll('[data-k]')) {
  const k = el.dataset.k, ids = new Set();
  const upd = () => { touchIn[k] = ids.size ? 1 : 0; el.classList.toggle('on', ids.size > 0); };
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); ids.add(e.pointerId); upd(); try { el.setPointerCapture(e.pointerId); } catch {} });
  for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, (e) => { ids.delete(e.pointerId); upd(); });
}
document.addEventListener('touchmove', (e) => { if (e.target.closest && e.target.closest('#touch')) e.preventDefault(); }, { passive: false });

function readInput() {
  const i = {};
  for (const k of ['l', 'r', 'j', 'p', 'h']) i[k] = keys.has(k) || touchIn[k] ? 1 : 0;
  return i;
}

// ---------------- juice ----------------
function burst(x, y, color, n, speed, size = 2.5) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = speed * (0.3 + Math.random());
    G.fx.parts.push({ type: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, life: 0.35 + Math.random() * 0.3, max: 0.65, color, size });
  }
}
function ring(x, y, color, size) { G.fx.parts.push({ type: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, color, size }); }
function text(x, y, t, color, size = 26, life = 1.1) { G.fx.texts.push({ x, y, text: t, color, size, life, max: life, vy: -40 }); }
function shake(v) { G.fx.shake = Math.min(16, Math.max(G.fx.shake, v)); }

function onEvents(evs, live) {
  for (const e of evs) {
    const victimCol = e.who === 1 ? COL.m : COL.p, hitterCol = e.who === 1 ? COL.p : COL.m;
    switch (e.k) {
      case 'hit':
        burst(e.x, e.y, hitterCol, e.heavy ? 22 : 10, e.heavy ? 520 : 320); burst(e.x, e.y, '#fff', e.heavy ? 8 : 4, 400, 1.5);
        ring(e.x, e.y, hitterCol, e.heavy ? 70 : 38);
        shake(e.heavy ? 10 : 4); if (live) sfx(e.heavy ? 'heavy' : 'punch');
        text(e.x, e.y - 30, '-' + Math.round(e.dmg), victimCol, e.heavy ? 24 : 18, 0.7);
        if (e.trade && e.who === 1) { text(W / 2 > e.x ? e.x + 18 : e.x - 18, e.y - 64, 'TRADE', '#fff', 16, 0.8); if (live) sfx('trade'); }
        break;
      case 'haz': {
        const good = e.who === 1, big = !e.soft;
        burst(e.x, e.y, e.label === 'ZAPPED!' ? COL.elec : COL.haz, big ? 30 : 12, big ? 600 : 300);
        ring(e.x, e.y, good ? COL.m : COL.haz, big ? 110 : 50);
        shake(big ? 13 : 6); if (big) G.fx.flash = Math.max(G.fx.flash, 0.5);
        text(e.x, Math.min(e.y - 50, FLOOR - 110), e.label + ' -' + Math.round(e.dmg), good ? '#ffe23b' : COL.haz, big ? 34 : 22, 1.2);
        if (live) sfx(e.label === 'ZAPPED!' ? 'zap' : e.label === 'SPIKED!' ? 'spike' : e.label === 'FELL!' ? 'fall' : 'slam');
        if (G.stats) { if (good) G.stats.hazDealt += e.dmg; else G.stats.hazTaken += e.dmg; }
        if (good && G.hintA > 2.5) G.hintA = 2.5; // they got it: let the hint fade
        break;
      }
      case 'jump': for (let i = 0; i < 6; i++) G.fx.parts.push({ type: 'dot', x: e.x + (Math.random() - 0.5) * 30, y: e.y - 2, vx: (Math.random() - 0.5) * 80, vy: -Math.random() * 60, life: 0.3, max: 0.3, color: e.who ? COL.m : COL.p, size: 3 }); if (live && e.who === 0) sfx('jump'); break;
      case 'pad': ring(e.x, e.y, COL.pad, 50); if (live) sfx('pad'); break;
      case 'swing': if (live && e.who === 0) sfx('swing'); break;
      case 'fight': banner('FIGHT!', 50, '', 110); if (live) sfx('fight'); break;
      case 'ko': case 'time': {
        const w = e.winner;
        banner(e.k === 'ko' ? (w === 2 ? 'DOUBLE K.O.' : 'K.O.') : 'TIME', 95, w === 0 ? 'YOU TAKE THE ROUND' : w === 1 ? 'THE MIRROR TAKES IT' : 'DRAW - RUN IT BACK', 120);
        if (e.k === 'ko') { G.slow = 45; shake(16); G.fx.flash = 1; if (live) sfx('ko'); }
        break;
      }
    }
  }
}

function updateFx(dt) {
  const fx = G.fx;
  for (const p of fx.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt * (p.type === 'spark' ? 1 : 0.5); p.vx *= 0.96; p.life -= dt; }
  fx.parts = fx.parts.filter((p) => p.life > 0);
  if (fx.parts.length > 500) fx.parts.splice(0, fx.parts.length - 500);
  for (const t of fx.texts) { t.y += t.vy * dt; t.vy *= 0.94; t.life -= dt; }
  fx.texts = fx.texts.filter((t) => t.life > 0);
  fx.shake = Math.max(0, fx.shake - 40 * dt); fx.flash = Math.max(0, fx.flash - 3 * dt);
  if (fx.banner) { fx.banner.t -= dt * 60; if (fx.banner.t <= 0) fx.banner = null; }
  for (const f of G.s.f) {
    const tr = G.trails[f.id];
    if (Math.abs(f.kvx) > 250 || f.launch > 0) { tr.push({ x: f.x, y: f.y }); if (tr.length > 5) tr.shift(); } else if (tr.length) tr.shift();
    G.chip[f.id] = Math.max(f.hp / f.hpMax, G.chip[f.id] - dt * 0.5);
  }
  if (G.hintA > 0 && G.s.phase === 'fight') G.hintA -= dt * 0.55;
}

// ---------------- flow ----------------
function tick() {
  if (G.matchOver) return;
  const s = G.s;
  const inp = G.bot ? G.bot(s, G.st) : G.screen === 'play' ? readInput() : {};
  step(s, G.st, inp);
  onEvents(s.ev, G.screen !== 'title');
  if (s.phase === 'fight' && G.stats) G.stats.time += DT;
  if (s.phase === 'done') roundOver();
}

function roundOver() {
  if (G.matchOver) return;
  const w = G.s.winner;
  if (w < 2) G.wins[w]++;
  if (w === 1 && G.stats) G.stats.roundsLost++;
  if (G.screen === 'title') { if (G.wins[0] >= 2 || G.wins[1] >= 2) startStage((G.stageIdx + 1) % STAGES.length, { attract: true }); else startRound(G.round + 1); return; }
  if (G.wins[0] >= 2) matchEnd(true); else if (G.wins[1] >= 2) matchEnd(false); else startRound(G.round + 1);
}

function matchEnd(won) {
  G.matchOver = true; const token = ++G.matchId;
  const i = G.stageIdx, last = i === STAGES.length - 1;
  const hpFrac = Math.max(0, G.s.f[0].hp / G.s.f[0].hpMax);
  const st = won ? (G.stats.roundsLost === 0 ? (hpFrac >= 0.5 ? 3 : 2) : 1) : 0;
  if (won) {
    stars[i] = Math.max(stars[i] || 0, st); store.set('stars', stars);
    if (!last) { unlocked = Math.max(unlocked, i + 1); store.set('unlocked', unlocked); store.set('current', i + 1); }
    else store.set('champion', true);
  }
  G.lastResult = { won, stage: i, stars: st, last };
  sfx(won ? 'win' : 'lose');
  const card = $('card');
  card.className = won ? 'win' : 'lose';
  $('cardKicker').textContent = `STAGE ${i + 1} / ${STAGES.length}  -  ${STAGES[i].name}`;
  $('cardTitle').textContent = won ? (last ? 'MIRROR CHAMPION' : 'STAGE CLEAR') : 'DEFEATED';
  $('cardStars').innerHTML = won ? [0, 1, 2].map((k) => `<span class="${k < st ? 'on' : ''}">&#9670;</span>`).join('') : '';
  $('cardBody').textContent = won
    ? `Hazard damage you set up: ${Math.round(G.stats.hazDealt)}.  Rounds dropped: ${G.stats.roundsLost}.` + (last ? '  You beat every mirror.' : '')
    : `The mirror won ${G.wins[1]}-${G.wins[0]}. Every move you make, it makes too - find where it costs them more.`;
  $('cardTip').textContent = won ? '' : 'Tip: ' + STAGES[i].hint;
  $('btnPrimary').textContent = won ? (last ? 'PLAY AGAIN' : 'NEXT STAGE') : 'RETRY';
  $('btnRetry').style.display = won ? '' : 'none';
  setTimeout(() => { if (G.matchOver && token === G.matchId) { G.screen = 'card'; card.classList.add('show'); } }, 450);
}

function hideOverlays() { $('card').classList.remove('show'); $('title').classList.remove('show'); }
function cardPrimary() {
  sfx('click');
  const r = G.lastResult; if (!r) return;
  play(r.won ? (r.last ? 0 : r.stage + 1) : r.stage);
}
function retry() { sfx('click'); play(G.stageIdx); }
function play(i) { G.matchId++; hideOverlays(); G.screen = 'play'; G.bot = Q.get('bot') === '1' ? makeBot(3) : null; startStage(i); }

function showTitle() {
  G.screen = 'title'; G.bot = makeBot(11); G.matchOver = false; $('card').classList.remove('show');
  const grid = $('stages'); grid.innerHTML = '';
  STAGES.forEach((S, i) => {
    const b = document.createElement('button'); b.className = 'stage' + (i > unlocked ? ' locked' : '');
    b.innerHTML = `<b>${i + 1}</b><span>${S.name}</span><i>${[0, 1, 2].map((k) => (k < (stars[i] || 0) ? '&#9670;' : '&#9671;')).join('')}</i>`;
    b.disabled = i > unlocked; b.onclick = () => play(i);
    grid.appendChild(b);
  });
  $('btnPlay').textContent = store.get('current', 0) > 0 ? `CONTINUE  -  STAGE ${store.get('current', 0) + 1}` : 'PLAY';
  $('title').classList.add('show');
  startStage(Math.floor(Math.random() * 3), { attract: true });
}
function toggleMute() { audio.setMuted(!audio.muted); store.set('muted', audio.muted); $('btnMute').textContent = audio.muted ? 'SOUND: OFF' : 'SOUND: ON'; }

$('btnPrimary').onclick = cardPrimary;
$('btnRetry').onclick = retry;
$('btnTitle').onclick = showTitle;
$('btnPlay').onclick = () => play(store.get('current', 0));
$('btnMute').onclick = toggleMute;
$('btnMute').textContent = audio.muted ? 'SOUND: OFF' : 'SOUND: ON';
$('menuBtn').onclick = (e) => { e.stopPropagation(); showTitle(); };

// ---------------- loop ----------------
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  let sdt = dt;
  if (G.slow > 0) sdt *= 0.3;
  acc += sdt;
  let n = 0;
  while (acc >= DT && n++ < 6) { tick(); acc -= DT; if (G.slow > 0) G.slow--; }
  if (n >= 6) acc = 0;
  updateFx(dt);
  tickMusic();
  $('touch').style.display = isTouch && G.screen === 'play' ? '' : 'none';
  R.draw(G);
  requestAnimationFrame(frame);
}

// boot: land straight in the fight (stage you were on), unless ?title
if (Q.has('title')) showTitle();
else play(Q.has('stage') ? +Q.get('stage') - 1 : store.get('current', 0));
requestAnimationFrame(frame);

// test hooks
window.__MD = {
  G, STAGES,
  play, showTitle, retry, cardPrimary,
  // run the current match to the end synchronously with the look-ahead bot (no rendering)
  fastMatch(seed = 5) {
    const bot = makeBot(seed); let guard = 0;
    while (!G.matchOver && G.screen === 'play' && guard++ < 30000) { const s = G.s; step(s, G.st, bot(s, G.st)); onEvents(s.ev, false); if (s.phase === 'done') roundOver(); }
    return { ...G.lastResult, wins: G.wins.slice() };
  },
  advance(frames, botSeed) { const bot = botSeed != null ? makeBot(botSeed) : null; for (let i = 0; i < frames; i++) { const s = G.s; step(s, G.st, bot ? bot(s, G.st) : readInput()); onEvents(s.ev, false); updateFx(DT); if (s.phase === 'done') roundOver(); } },
};
