// WORD BLITZ - main: screens, input, game loop, rendering, juice.
import { Dict, makeBoard, solve, scorePath, pathWord, findPath, adjacent, starTargets, rotateTiles, hashStr } from './board.js';
import { initAudio, setMuted, isMuted, sfx } from './audio.js';

const ROUND = 90;
const COMBO_WINDOW = 4;
const FONT = "Fredoka, 'Arial Rounded MT Bold', system-ui, sans-serif";
const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);

// ---------------- save ----------------
const SAVE_KEY = 'pd.word-blitz';
const S = Object.assign({ xp: 0, best: { classic: 0 }, words: 0, longest: '', daily: { key: '', best: 0, plays: 0 }, streak: { last: '', count: 0 }, muted: false, tut: false, rounds: 0 }, load());
function load() { try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage blocked: play on */ } }

const RANKS = ['Rookie', 'Speller', 'Wordsmith', 'Lexicographer', 'Word Wizard', 'Grandmaster', 'Lexicon Legend'];
const xpNeed = lv => 250 + lv * 150; // xp to go from lv to lv+1
function levelOf(xp) {
  let lv = 1, need = xpNeed(1);
  while (xp >= need) { xp -= need; lv++; need = xpNeed(lv); }
  return { lv, into: xp, need, rank: RANKS[Math.min(RANKS.length - 1, Math.floor((lv - 1) / 3))] };
}

function dayKey(d = new Date()) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
const prettyDay = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); };

// ---------------- state ----------------
const G = {
  screen: 'title', mode: 'classic', dict: null, board: null, tiles: null,
  time: ROUND, score: 0, shown: 0, scorePop: 0, found: [], foundSet: new Set(),
  path: [], dragging: false, typed: '', combo: 0, comboT: 0, bestCombo: 0,
  flash: null, tileAnim: [], particles: [], floaters: [], banner: null, bubble: null,
  shake: 0, hitstop: 0, endT: 0, rotA: 0, introT: 0, hintT: 0, lastTick: 99, freeze: false, t: 0,
  dailyKey: '', targets: [0, 0, 0], flyers: [], starPop: null,
};

// ---------------- canvas & layout ----------------
const cv = $('c'), cx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
const L = {};
function layout() {
  W = innerWidth; H = innerHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  L.portrait = H >= W * 1.05;
  L.timer = { x: 64, y: 23, w: W - 128, h: 18 };
  if (L.portrait) {
    const short = H < 700, hud = short ? 122 : 132, bub = 62, minList = short ? 78 : 110;
    const s = Math.min(W - 28, H - hud - bub - minList - 56, 540);
    const used = hud + bub + s + 56 + minList;
    const extra = Math.max(0, (H - used) * 0.35);
    L.score = { x: W / 2, y: 64, align: 'center', size: Math.min(54, W * 0.13) };
    L.bubble = { x: W / 2, y: hud + extra * 0.5 + 6, h: 48 };
    L.grid = { x: (W - s) / 2, y: hud + bub + extra * 0.5, s };
    L.rot = { x: Math.min(L.grid.x + s - 48, W - 62), y: L.grid.y + s + 6 };
    L.count = { x: Math.max(14, L.grid.x + 4), y: L.grid.y + s + 30, w: L.rot.x - Math.max(14, L.grid.x + 4) - 8 };
    L.list = { x: 14, y: L.grid.y + s + 60, w: W - 28, h: H - (L.grid.y + s + 60) - 10 };
  } else {
    const top = 52, bub = 60;
    const s = Math.min(H - top - bub - 16, W * 0.52, 560);
    const leftW = Math.max(s + 40, W * 0.56);
    L.grid = { x: (leftW - s) / 2 + 6, y: top + bub + Math.max(0, (H - top - bub - s - 16) / 2), s };
    L.bubble = { x: L.grid.x + s / 2, y: L.grid.y - bub + 8, h: 46 };
    const px = leftW + 10, pw = W - px - 16;
    L.score = { x: px + pw / 2, y: top + 46, align: 'center', size: Math.min(58, pw * 0.2) };
    L.rot = { x: px + pw - 50, y: top + 20 };
    L.count = { x: px, y: top + 150, w: pw };
    L.list = { x: px, y: top + 170, w: pw, h: H - top - 180 };
  }
  const r = $('bRot'); r.style.left = L.rot.x + 'px'; r.style.top = L.rot.y + 'px';
}
addEventListener('resize', () => { layout(); if (typeof syncFloatAgain === 'function') syncFloatAgain(); });

// ---------------- board / round ----------------
function newRound(mode, seed) {
  if (!G.dict) return false;
  G.mode = mode;
  if (mode === 'daily') { G.dailyKey = dayKey(); seed = hashStr('word-blitz-' + G.dailyKey); }
  if (seed == null) seed = (Math.random() * 2 ** 32) >>> 0;
  G.board = makeBoard(seed >>> 0, G.dict);
  G.tiles = G.board.tiles;
  G.targets = starTargets(G.board);
  Object.assign(G, { time: ROUND, score: 0, shown: 0, scorePop: 0, found: [], foundSet: new Set(), path: [], dragging: false, typed: '',
    combo: 0, comboT: 0, bestCombo: 0, flash: null, particles: [], floaters: [], flyers: [], starPop: null, banner: null, bubble: null, shake: 0, hitstop: 0,
    rotA: 0, introT: 0, hintT: 0, lastTick: 99 });
  G.tileAnim = Array.from({ length: 16 }, () => ({ pop: 0 }));
  G.screen = 'play';
  G.banner = { text: 'GO!', t: 0.8, life: 0.8, big: true }; sfx.count(0);
  showScreen('play');
  return true;
}

function submit(path) {
  G.path = []; G.typed = '';
  if (G.screen !== 'play' || !path || !path.length) return 'none';
  const word = pathWord(G.tiles, path);
  if (path.length === 1) return 'none';
  const cpos = tileCenter(path[path.length - 1]);
  if (word.length < 3) {
    G.flash = { path, kind: 'bad', t: 0.4 }; sfx.bad();
    G.bubble = { text: 'TOO SHORT', kind: 'bad', t: 0.7 };
    return 'short';
  }
  if (G.foundSet.has(word)) {
    G.flash = { path, kind: 'dup', t: 0.45 }; sfx.dup();
    G.bubble = { text: 'ALREADY FOUND', kind: 'dup', t: 0.8 };
    return 'dup';
  }
  if (!G.dict.has(word)) {
    G.flash = { path, kind: 'bad', t: 0.45 }; sfx.bad(); G.shake = Math.max(G.shake, 4);
    G.bubble = { text: word.toUpperCase(), kind: 'bad', t: 0.7 };
    return 'bad';
  }
  // good word
  const base = scorePath(G.tiles, path);
  G.combo = G.comboT > 0 ? G.combo + 1 : 1;
  G.comboT = COMBO_WINDOW; G.bestCombo = Math.max(G.bestCombo, G.combo);
  const mult = Math.min(2, 1 + 0.1 * (G.combo - 1));
  const pts = Math.round(base * mult);
  const starsBefore = G.targets.filter(t => G.score >= t).length;
  G.score += pts; G.scorePop = 1;
  const starsNow = G.targets.filter(t => G.score >= t).length;
  if (starsNow > starsBefore) { G.starPop = { i: starsNow - 1, t: 1 }; setTimeout(() => sfx.star(starsNow - 1), 380); }
  path.forEach((i, n) => { const c = tileCenter(i); G.flyers.push({ x0: c.x, y0: c.y, t: -n * 0.035, dur: 0.42, s: 7 + Math.min(word.length, 8) }); });
  G.found.unshift({ word, pts, base });
  G.foundSet.add(word);
  G.flash = { path, kind: 'good', t: 0.5 };
  G.bubble = { text: word.toUpperCase() + '  +' + pts, kind: 'good', t: 0.75 };
  sfx.good(word.length);
  if (G.combo >= 2) setTimeout(() => sfx.combo(G.combo), 120);
  for (const i of path) {
    const c = tileCenter(i);
    burst(c.x, c.y, word.length >= 6 ? 14 : 8, ['#ffd23f', '#22d36b', '#ff3fa4', '#12b5e6', '#ffffff', '#ff8a12']);
    G.tileAnim[i].pop = 1;
  }
  G.floaters.push({ x: cpos.x, y: cpos.y - 20, text: '+' + pts, t: 1, size: 26 + Math.min(word.length, 9) * 3, color: '#ffffff' });
  const len = word.length;
  if (len >= 5) G.shake = Math.max(G.shake, len >= 7 ? 16 : len >= 6 ? 10 : 5);
  if (len >= 6) G.hitstop = len >= 7 ? 0.12 : 0.07;
  const B = len >= 8 ? 'LEGENDARY!' : len === 7 ? 'AMAZING!' : len === 6 ? 'GREAT!' : len === 5 ? 'NICE!' : null;
  if (B) G.banner = { text: B, t: 1.1, big: len >= 7 };
  if (!S.tut) { S.tut = true; save(); }
  return 'good';
}

function rotateBoard() {
  if (G.screen !== 'play' || G.rotA) return;
  G.tiles = rotateTiles(G.tiles);
  G.board.tiles = G.tiles;
  G.board.solutions = solve(G.tiles, G.dict);
  G.path = []; G.typed = ''; G.dragging = false; G.flash = null;
  G.rotA = -Math.PI / 2;
  sfx.rotate();
}

function endRound() {
  if (G.screen !== 'play') return;
  G.path = []; G.dragging = false; G.typed = '';
  G.screen = 'ending'; G.endT = 1.3;
  G.banner = { text: 'TIME!', t: 1.3, big: true };
  G.shake = 12;
  sfx.end();
}

// ---------------- results ----------------
let lastResult = null;
function showResults() {
  G.screen = 'results';
  const before = levelOf(S.xp);
  const score = G.score;
  S.xp += score; S.words += G.found.length; S.rounds++;
  for (const f of G.found) if (f.word.length > S.longest.length) S.longest = f.word;
  let newBest = false;
  if (G.mode === 'daily') {
    if (S.daily.key !== G.dailyKey) S.daily = { key: G.dailyKey, best: 0, plays: 0 };
    S.daily.plays++;
    if (score > S.daily.best) { S.daily.best = score; newBest = score > 0; }
    const y = new Date(); y.setDate(y.getDate() - 1);
    if (S.streak.last !== G.dailyKey) { S.streak.count = S.streak.last === dayKey(y) ? S.streak.count + 1 : 1; S.streak.last = G.dailyKey; }
  } else {
    if (score > (S.best.classic || 0)) { S.best.classic = score; newBest = score > 0; }
  }
  save();
  const after = levelOf(S.xp);
  const stars = G.targets.filter(t => score >= t).length;
  lastResult = { score, stars, newBest, levelUp: after.lv > before.lv };

  $('bAgain').textContent = G.mode === 'daily' ? 'NEW BOARD' : 'PLAY AGAIN';
  $('rMode').textContent = G.mode === 'daily' ? 'DAILY BOARD - ' + prettyDay(G.dailyKey).toUpperCase() : 'CLASSIC';
  $('rBest').classList.toggle('hide', !newBest);
  const starEls = $('rStars').children;
  for (let i = 0; i < 3; i++) { starEls[i].className = ''; }
  for (let i = 0; i < stars; i++) {
    const el = starEls[i];
    setTimeout(() => { el.className = 'on'; sfx.star(i); }, 450 + i * 280);
  }
  $('rTarget').textContent = stars < 3 ? `Next star at ${G.targets[stars]} points` : 'Three stars! Board mastered.';
  const sol = [...G.board.solutions.values()];
  const possible = sol.filter(s => s.common).length;
  const longest = G.found.reduce((a, f) => (f.word.length > a.length ? f.word : a), '');
  const bestW = G.found.reduce((a, f) => (!a || f.pts > a.pts ? f : a), null);
  $('rStats').innerHTML =
    `<div><b>${G.found.length}</b>words</div>` +
    `<div><b>${longest ? longest.toUpperCase() : '-'}</b>longest</div>` +
    `<div><b>${bestW ? bestW.word.toUpperCase() + ' ' + bestW.pts : '-'}</b>best word</div>` +
    `<div><b>x${Math.min(2, 1 + 0.1 * (Math.max(1, G.bestCombo) - 1)).toFixed(1)}</b>top combo</div>`;
  $('rLv').textContent = `LV ${after.lv} ${after.rank}`;
  $('rXpGain').textContent = (lastResult.levelUp ? 'LEVEL UP!  ' : '') + '+' + score + ' XP';
  $('rXp').style.width = (lastResult.levelUp ? 0 : before.into / before.need * 100) + '%';
  setTimeout(() => { $('rXp').style.width = (after.into / after.need * 100) + '%'; if (lastResult.levelUp) sfx.level(); }, 300);

  const chips = (arr, cls) => arr.map(f => `<span${cls ? ` data-w="${f.word}"` : ''}>${f.word.toUpperCase()}<small>${f.pts ?? f.score}</small></span>`).join('');
  $('rFoundN').textContent = G.found.length;
  $('rFound').innerHTML = G.found.length ? chips([...G.found].sort((a, b) => b.pts - a.pts), false) : '<span class="more">none this time</span>';
  const missed = sol.filter(s => s.common && !G.foundSet.has(s.word)).sort((a, b) => b.word.length - a.word.length || b.score - a.score);
  $('rMissN').textContent = missed.length + ' / ' + possible;
  const SHOW = 40;
  $('rMiss').innerHTML = chips(missed.slice(0, SHOW), true) + (missed.length > SHOW ? `<span class="more">+${missed.length - SHOW} more</span>` : '');
  buildMini(null);
  showScreen('results');
  // count-up
  const el = $('rScore'); const t0 = performance.now();
  const tick = now => { const k = Math.min(1, (now - t0) / 700); el.textContent = Math.round(score * (1 - Math.pow(1 - k, 3))); if (k < 1) requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
}
onPress($('rMiss'), e => {
  const sp = e.target.closest('span[data-w]'); if (!sp) return;
  const s = G.board.solutions.get(sp.dataset.w); if (!s) return;
  for (const o of $('rMiss').querySelectorAll('.show')) o.classList.remove('show');
  sp.classList.add('show');
  buildMini(s.path);
  sfx.click();
});

function buildMini(path) {
  const el = $('rMini'); if (!G.tiles) return;
  el.innerHTML = G.tiles.map((t, i) => {
    const n = path ? path.indexOf(i) : -1;
    return `<b class="${n >= 0 ? 'on' : ''}${t.mult ? ' ' + t.mult : ''}">${t.ch === 'qu' ? 'Qu' : t.ch.toUpperCase()}${n >= 0 ? '<sup>' + (n + 1) + '</sup>' : ''}</b>`;
  }).join('');
}

// ---------------- screens ----------------
function showScreen(name) {
  $('title').classList.toggle('hide', name !== 'title');
  $('results').classList.toggle('hide', name !== 'results');
  $('bQuit').classList.toggle('hide', name !== 'play');
  $('bRot').classList.toggle('hide', name !== 'play');
  if (name === 'results') $('results').scrollTop = 0;
  syncFloatAgain();
  if (name === 'title') refreshTitle();
}
function refreshTitle() {
  const lv = levelOf(S.xp);
  $('tLv').textContent = 'LV ' + lv.lv; $('tRank').textContent = lv.rank;
  $('tXp').style.width = (lv.into / lv.need * 100) + '%';
  const k = dayKey();
  const db = S.daily.key === k ? S.daily.best : 0;
  const streak = S.streak.count && (S.streak.last === k || S.streak.last === dayKey(new Date(Date.now() - 864e5))) ? S.streak.count : 0;
  $('tDaily').textContent = prettyDay(k) + (S.daily.key === k ? '  -  best ' + db : '  -  not played yet') + (streak ? '  -  streak ' + streak : '');
  const bits = [];
  if (S.best.classic) bits.push('Best ' + S.best.classic);
  if (S.longest) bits.push('Longest ' + S.longest.toUpperCase());
  if (S.words) bits.push(S.words + ' words found');
  $('tStats').textContent = bits.join('  -  ');
}
function buildLogo() {
  const rows = ['WORD', 'BLITZ'];
  let n = 0;
  $('logo').innerHTML = rows.map((r, ri) => '<div class="row">' + [...r].map(ch => `<span class="lt${ri ? ' hot' : ''}" style="animation-delay:${(n++) * 0.05}s">${ch}</span>`).join('') + '</div>').join('');
}

function startGame(mode) {
  initAudio(); sfx.click();
  if (!G.dict) { $('loading').classList.remove('hide'); pendingStart = mode; return; }
  newRound(mode);
}
let pendingStart = null;
// Buttons fire on pointer release (instant on phones, and a tap right after scrolling the results still counts,
// where Chrome can swallow the click). Click stays as the fallback for keyboard / assistive tech.
// fn(event) runs once per press; the click that follows a handled release is skipped (even when a busy phone delivers it late).
function onPress(el, fn) {
  if (typeof el === 'string') el = $(el);
  let down = null, skip = 0;
  el.addEventListener('pointerdown', e => { down = e.pointerId; skip = 0; });
  el.addEventListener('pointerup', e => { if (down !== e.pointerId) return; down = null; skip = performance.now(); fn(e); });
  el.addEventListener('pointercancel', () => { down = null; });
  el.addEventListener('click', e => { if (skip && performance.now() - skip < 3000) { skip = 0; return; } fn(e); });
}
onPress('bPlay', () => startGame('classic'));
onPress('bDaily', () => startGame('daily'));
const againMode = () => (G.mode === 'daily' ? 'classic' : G.mode); // daily is one board a day: "again" deals a fresh classic board
onPress('bAgain', () => { if (G.screen === 'results') startGame(againMode()); });
onPress('bAgain2', () => { if (G.screen === 'results') startGame(againMode()); });
function syncFloatAgain() {
  const r = $('bAgain').getBoundingClientRect();
  const onScreen = r.bottom > 0 && r.top < innerHeight - 12;
  $('bAgain2').classList.toggle('hide', G.screen !== 'results' || onScreen);
  $('bAgain2').textContent = $('bAgain').textContent;
  $('bMute').classList.toggle('hide', G.screen === 'results' && $('results').scrollTop > 24); // never floats over MENU or the word chips
}
$('results').addEventListener('scroll', syncFloatAgain, { passive: true });
onPress('bMenu', () => { if (G.screen !== 'results') return; sfx.click(); G.screen = 'title'; showScreen('title'); });
onPress('bQuit', () => { if (G.screen !== 'play') return; sfx.click(); G.screen = 'title'; showScreen('title'); });
onPress('bRot', () => { initAudio(); rotateBoard(); });
const toggleMute = () => { initAudio(); S.muted = !S.muted; setMuted(S.muted); $('bMute').classList.toggle('muted', S.muted); $('bMute').setAttribute('aria-label', S.muted ? 'Unmute' : 'Mute'); save(); };
onPress('bMute', toggleMute);
setMuted(S.muted); $('bMute').classList.toggle('muted', S.muted);
// buttons drop focus after a click so keyboard play (Enter / Space) never re-triggers them
document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b) b.blur(); }, true);
for (const b of document.querySelectorAll('.iconbtn')) b.tabIndex = -1;

// ---------------- input ----------------
function tileCenter(i) {
  const c = L.grid.s / 4;
  return { x: L.grid.x + (i & 3) * c + c / 2, y: L.grid.y + (i >> 2) * c + c / 2 };
}
function tileAt(x, y, strict) {
  const c = L.grid.s / 4;
  const gx = x - L.grid.x, gy = y - L.grid.y;
  if (gx < 0 || gy < 0 || gx >= L.grid.s || gy >= L.grid.s) return -1;
  const col = Math.floor(gx / c), row = Math.floor(gy / c);
  const dx = gx - (col + 0.5) * c, dy = gy - (row + 0.5) * c;
  if (strict && Math.hypot(dx, dy) > c * 0.42) return -1; // forgiving diagonals: corners don't count
  return row * 4 + col;
}
function dragTo(x, y) {
  const i = tileAt(x, y, true);
  if (i < 0) return;
  const p = G.path;
  if (p.length >= 2 && p[p.length - 2] === i) { p.pop(); sfx.untile(); return; }
  if (p.includes(i)) return;
  if (p.length && !adjacent(p[p.length - 1], i)) return;
  p.push(i); G.tileAnim[i].pop = 0.7; sfx.tile(p.length);
}
cv.addEventListener('pointerdown', e => {
  initAudio();
  if (G.screen !== 'play' || G.rotA) return;
  const i = tileAt(e.clientX, e.clientY, false);
  if (i < 0) return;
  G.flash = null; if (G.banner) G.banner.t = Math.min(G.banner.t, 0.2); // the last word's flash/banner never covers the next drag
  G.typed = ''; G.dragging = true; G.path = [i]; G.tileAnim[i].pop = 0.7; sfx.tile(1);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  e.preventDefault();
});
cv.addEventListener('pointermove', e => {
  if (!G.dragging) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of (evs.length ? evs : [e])) dragTo(ev.clientX, ev.clientY);
});
const up = () => { if (!G.dragging) return; G.dragging = false; submit(G.path.slice()); };
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', up);
addEventListener('keydown', e => {
  if (e.key === 'm' && G.screen !== 'play') { toggleMute(); return; }
  if (G.screen === 'title' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startGame('classic'); return; }
  if (G.screen === 'results' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); startGame(againMode()); return; }
  if (G.screen !== 'play') return;
  initAudio();
  if (e.key === 'Enter' || e.key === ' ') e.preventDefault(); // never let Enter/Space "click" a focused button mid-round
  if (e.key === 'Escape') { G.typed = ''; G.path = []; return; }
  if (e.key === 'Enter') { const w = G.typed; const p = findPath(G.tiles, w); if (p && pathWord(G.tiles, p) === w) submit(p); else if (w) { G.bubble = { text: w.toUpperCase(), kind: 'bad', t: 0.6 }; sfx.bad(); G.typed = ''; G.path = []; } return; }
  if (e.key === 'Backspace') { G.typed = G.typed.slice(0, -1); if (G.typed.endsWith('q')) G.typed = G.typed.slice(0, -1); G.path = findPath(G.tiles, G.typed) || []; return; }
  if (e.key === 'R' || (e.key === 'r' && !G.typed && e.shiftKey)) { rotateBoard(); return; }
  if (e.key === '1' || e.key === 'Tab') { e.preventDefault(); rotateBoard(); return; }
  if (/^[a-zA-Z]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
    let k = e.key.toLowerCase();
    if (k === 'u' && G.typed.endsWith('q')) return; // "qu" tile: the u comes free
    if (k === 'q') k = 'qu';
    const t = G.typed + k;
    const p = findPath(G.tiles, t);
    if (p) { G.typed = t; G.path = p; sfx.tile(p.length); G.tileAnim[p[p.length - 1]].pop = 0.7; }
    else { sfx.untile(); G.shake = Math.max(G.shake, 2); }
  }
});

// ---------------- fx ----------------
function burst(x, y, n, colors) {
  for (let k = 0; k < n; k++) {
    const a = Math.random() * Math.PI * 2, sp = 120 + Math.random() * 320;
    G.particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 160, life: 0.7 + Math.random() * 0.5, t: 0, c: colors[k % colors.length], s: 4 + Math.random() * 6, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
  }
}

// ---------------- update ----------------
function update(dt) {
  G.t += dt;
  if (G.screen === 'play') {
    if (G.hitstop > 0) G.hitstop -= dt;
    else {
      G.time -= dt;
      const sec = Math.ceil(G.time);
      if (sec !== G.lastTick && sec <= 10 && sec > 0) { G.lastTick = sec; if (sec <= 3) sfx.count(sec); else sfx.tick(sec % 2 === 0); }
      if (G.time <= 0) { G.time = 0; endRound(); }
    }
    if (G.comboT > 0) { G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
    G.introT += dt;
    if (!G.found.length && !G.dragging && !G.path.length) G.hintT += dt; else G.hintT = 0;
  }
  if (G.screen === 'ending') { G.endT -= dt; if (G.endT <= 0) showResults(); }
  if (G.rotA) { G.rotA += dt * 9; if (G.rotA >= 0) G.rotA = 0; }
  for (const a of G.tileAnim) a.pop = Math.max(0, a.pop - dt * 4);
  if (G.flash) { G.flash.t -= dt; if (G.flash.t <= 0) G.flash = null; }
  if (G.bubble) { G.bubble.t -= dt; if (G.bubble.t <= 0) G.bubble = null; }
  if (G.banner) { G.banner.t -= dt; if (G.banner.t <= 0) G.banner = null; }
  if (G.peek) { G.peek.t -= dt; if (G.peek.t <= 0) G.peek = null; }
  G.shake = Math.max(0, G.shake - dt * 40);
  G.scorePop = Math.max(0, G.scorePop - dt * 3);
  G.shown += (G.score - G.shown) * Math.min(1, dt * 10); if (Math.abs(G.score - G.shown) < 0.5) G.shown = G.score;
  for (const p of G.particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 900 * dt; p.vx *= 0.98; p.r += p.vr * dt; }
  G.particles = G.particles.filter(p => p.t < p.life);
  for (const f of G.floaters) { f.t -= dt * 1.1; f.y -= 70 * dt; }
  G.floaters = G.floaters.filter(f => f.t > 0);
  for (const f of G.flyers) { f.t += dt; if (f.t >= f.dur && !f.hit) { f.hit = true; G.scorePop = Math.max(G.scorePop, 0.7); } }
  G.flyers = G.flyers.filter(f => f.t < f.dur + 0.01);
  if (G.starPop) { G.starPop.t -= dt * 1.2; if (G.starPop.t <= 0) G.starPop = null; }
}

// ---------------- render ----------------
const COL = {
  face: ['#fffaf0', '#ffe6b8'], lip: '#d99c45', ink: '#1f1b4d',
  sel: ['#ffb04a', '#ff7a00'], selLip: '#c24f00',
  good: ['#5cf59d', '#1fc765'], goodLip: '#0e8a43',
  dup: ['#ffe36b', '#ffc400'], dupLip: '#bf8f00',
  bad: ['#ff7b8a', '#ff3f57'], badLip: '#b3122b',
  DL: ['#e3f9ff', '#a9ecff'], DLlip: '#4fb4d6', TW: ['#ffe8f5', '#ffbfe2'], TWlip: '#d9629f',
};
function rr(x, y, w, h, r) { cx.beginPath(); cx.roundRect ? cx.roundRect(x, y, w, h, r) : cx.rect(x, y, w, h); }

// The background is soft gradients: drawn at 1x into an offscreen canvas, then scaled up (a quarter of the fill work on 2x phones).
const bgCv = document.createElement('canvas'), bx = bgCv.getContext('2d');
function drawBg() {
  const w = Math.max(1, Math.round(W)), h = Math.max(1, Math.round(H));
  if (bgCv.width !== w || bgCv.height !== h) { bgCv.width = w; bgCv.height = h; }
  const g = bx.createLinearGradient(0, 0, W * 0.4, H);
  g.addColorStop(0, '#3a1fe0'); g.addColorStop(0.55, '#2b54f0'); g.addColorStop(1, '#13a8ff');
  bx.fillStyle = g; bx.fillRect(0, 0, W, H);
  // soft drifting blobs
  const blobs = [[0.15, 0.2, 0.35, '#ff3fa4'], [0.85, 0.75, 0.4, '#00e0ff'], [0.7, 0.1, 0.25, '#7b5bff']];
  for (const [bxp, by, br, c] of blobs) {
    const x = bxp * W + Math.sin(G.t * 0.3 + bxp * 9) * 30, y = by * H + Math.cos(G.t * 0.25 + by * 7) * 30, r = br * Math.max(W, H);
    const rg = bx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, c + '55'); rg.addColorStop(1, c + '00');
    bx.fillStyle = rg; bx.fillRect(0, 0, W, H);
  }
  // faint letter-tile pattern, one path
  bx.save(); bx.globalAlpha = 0.06; bx.fillStyle = '#fff';
  const step = 64, off = (G.t * 8) % step;
  bx.beginPath();
  for (let y = -step; y < H + step; y += step) for (let x = -step; x < W + step; x += step) {
    const xx = x + off, yy = y + off * 0.5;
    if (((x / step + y / step) & 1) === 0) { if (bx.roundRect) bx.roundRect(xx + 8, yy + 8, 22, 22, 6); else bx.rect(xx + 8, yy + 8, 22, 22); }
  }
  bx.fill();
  bx.restore();
  cx.drawImage(bgCv, 0, 0, W, H);
}

function tileColors(i) {
  const t = G.tiles[i];
  if (G.flash && G.flash.path.includes(i)) {
    const k = G.flash.kind;
    return { face: COL[k], lip: COL[k + 'Lip'], ink: k === 'dup' ? COL.ink : '#fff' };
  }
  if (G.peek && G.peek.path.includes(i)) return { face: COL.dup, lip: COL.dupLip, ink: COL.ink };
  if (G.path.includes(i)) {
    const w = pathWord(G.tiles, G.path);
    const live = G.path.length >= 2 && w.length >= 3 && G.dict.has(w) && !G.foundSet.has(w);
    return live ? { face: COL.good, lip: COL.goodLip, ink: '#fff' } : { face: COL.sel, lip: COL.selLip, ink: '#fff' };
  }
  if (t.mult) return { face: COL[t.mult], lip: COL[t.mult + 'lip'], ink: COL.ink };
  return { face: COL.face, lip: COL.lip, ink: COL.ink };
}

function drawGrid() {
  const { x, y, s } = L.grid, c = s / 4, pad = c * 0.055, ts = c - pad * 2, lip = c * 0.065;
  cx.save();
  cx.translate(x + s / 2, y + s / 2);
  if (G.rotA) cx.rotate(G.rotA);
  // panel
  cx.fillStyle = 'rgba(15,8,80,0.30)'; rr(-s / 2 - 10, -s / 2 - 10, s + 20, s + 20, c * 0.28); cx.fill();
  const pos = i => ({ px: -s / 2 + (i & 3) * c + pad, py: -s / 2 + (i >> 2) * c + pad });
  const scaleOf = i => {
    let k = 1 + G.tileAnim[i].pop * 0.12;
    if (G.introT < 0.6) { const d = Math.min(1, Math.max(0, (G.introT - ((i & 3) + (i >> 2)) * 0.04) / 0.3)); k *= d < 1 ? 0.3 + 0.7 * (1 - Math.pow(1 - d, 3)) + Math.sin(d * Math.PI) * 0.15 : 1; }
    return k;
  };
  // bodies
  for (let i = 0; i < 16; i++) {
    const { px, py } = pos(i), col = tileColors(i), k = scaleOf(i);
    cx.save(); cx.translate(px + ts / 2, py + ts / 2); cx.scale(k, k);
    const pressed = G.path.includes(i) ? lip * 0.45 : 0;
    cx.fillStyle = 'rgba(0,0,40,0.25)'; rr(-ts / 2, -ts / 2 + lip + 3, ts, ts - lip, c * 0.16); cx.fill();
    cx.fillStyle = col.lip; rr(-ts / 2, -ts / 2 + pressed, ts, ts - pressed, c * 0.16); cx.fill();
    const g = cx.createLinearGradient(0, -ts / 2, 0, ts / 2);
    g.addColorStop(0, col.face[0]); g.addColorStop(1, col.face[1]);
    cx.fillStyle = g; rr(-ts / 2, -ts / 2 + pressed, ts, ts - lip, c * 0.16); cx.fill();
    // gloss
    cx.fillStyle = 'rgba(255,255,255,0.45)'; rr(-ts / 2 + ts * 0.08, -ts / 2 + pressed + ts * 0.06, ts * 0.84, ts * 0.22, c * 0.1); cx.fill();
    cx.restore();
  }
  // connector line
  const P = G.path.length ? G.path : (G.flash ? G.flash.path : G.peek ? G.peek.path : []);
  if (P.length >= 2) {
    const k = G.path.length ? 1 : G.flash ? Math.min(1, G.flash.t * 3) : Math.min(1, G.peek.t * 2);
    const lineCol = G.path.length ? (tileColors(P[0]).face === COL.good ? '#0e8a43' : '#c24f00') : G.flash ? COL[G.flash.kind + 'Lip'] : COL.dupLip;
    cx.save(); cx.lineCap = 'round'; cx.lineJoin = 'round';
    const trace = () => { cx.beginPath(); P.forEach((i, n) => { const { px, py } = pos(i); const X = px + ts / 2, Y = py + ts / 2 - lip / 2; n ? cx.lineTo(X, Y) : cx.moveTo(X, Y); }); };
    cx.globalAlpha = 0.9 * k; cx.strokeStyle = '#ffffff'; cx.lineWidth = c * 0.2; trace(); cx.stroke();
    cx.strokeStyle = lineCol; cx.lineWidth = c * 0.11; trace(); cx.stroke();
    cx.fillStyle = '#ffffff';
    for (const i of P) { const { px, py } = pos(i); cx.beginPath(); cx.arc(px + ts / 2, py + ts / 2 - lip / 2, c * 0.075, 0, 7); cx.fill(); }
    cx.restore();
  }
  // letters, values, badges
  for (let i = 0; i < 16; i++) {
    const t = G.tiles[i], { px, py } = pos(i), col = tileColors(i), k = scaleOf(i);
    const pressed = G.path.includes(i) ? lip * 0.45 : 0;
    cx.save(); cx.translate(px + ts / 2, py + ts / 2 + pressed - lip / 2); cx.scale(k, k);
    if (G.rotA) cx.rotate(-G.rotA * 0); // letters rotate with the board during the spin
    cx.fillStyle = col.ink; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    const label = t.ch === 'qu' ? 'Qu' : t.ch.toUpperCase();
    cx.font = `700 ${Math.round(c * (t.ch === 'qu' ? 0.44 : 0.54))}px ${FONT}`;
    if (col.ink === '#fff') { cx.lineJoin = 'round'; cx.lineWidth = c * 0.07; cx.strokeStyle = col.lip; cx.strokeText(label, 0, c * 0.03); }
    cx.fillText(label, 0, c * 0.03);
    cx.font = `600 ${Math.round(c * 0.17)}px ${FONT}`; cx.textAlign = 'right';
    cx.globalAlpha = 0.6; cx.fillText(String(t.val), ts / 2 - c * 0.07, ts / 2 - c * 0.12); cx.globalAlpha = 1;
    if (t.mult) {
      const bw = c * 0.34, bh = c * 0.2;
      cx.fillStyle = t.mult === 'TW' ? '#ff3fa4' : '#12a8dc';
      rr(-ts / 2 + c * 0.05, -ts / 2 + c * 0.05, bw, bh, bh / 2); cx.fill();
      cx.fillStyle = '#fff'; cx.textAlign = 'center'; cx.font = `700 ${Math.round(c * 0.14)}px ${FONT}`;
      cx.fillText(t.mult === 'TW' ? '3W' : '2L', -ts / 2 + c * 0.05 + bw / 2, -ts / 2 + c * 0.05 + bh / 2 + 1);
    }
    cx.restore();
  }
  cx.restore();

  // tutorial hand
  if (G.screen === 'play' && !S.tut && G.hintT > 0.7 && G.board) {
    const demo = [...G.board.solutions.values()].filter(s => s.common && s.word.length <= 4).sort((a, b) => a.word.length - b.word.length)[0];
    if (demo) {
      const per = 0.55, total = demo.path.length * per + 0.8, tt = (G.hintT % total);
      const segs = demo.path.map(tileCenter);
      const k = Math.min(segs.length - 1, tt / per), i0 = Math.floor(k), f = k - i0;
      const a = segs[i0], b = segs[Math.min(segs.length - 1, i0 + 1)];
      const hx = a.x + (b.x - a.x) * f, hy = a.y + (b.y - a.y) * f;
      cx.save(); cx.globalAlpha = 0.9;
      cx.strokeStyle = 'rgba(255,255,255,0.7)'; cx.lineWidth = 8; cx.lineCap = 'round';
      cx.beginPath(); segs.slice(0, i0 + 1).forEach((p, n) => n ? cx.lineTo(p.x, p.y) : cx.moveTo(p.x, p.y)); cx.lineTo(hx, hy); cx.stroke();
      cx.fillStyle = '#fff'; cx.beginPath(); cx.arc(hx + 10, hy + 14, 18, 0, 7); cx.fill();
      cx.fillStyle = '#ff8a12'; cx.beginPath(); cx.arc(hx + 10, hy + 14, 11, 0, 7); cx.fill();
      cx.restore();
    }
  }
}

function drawHud() {
  // timer bar
  const T = L.timer, k = Math.max(0, G.time / ROUND);
  cx.fillStyle = 'rgba(0,0,40,0.3)'; rr(T.x, T.y, T.w, T.h, T.h / 2); cx.fill();
  const col = G.time > 30 ? '#3ef08a' : G.time > 10 ? '#ffd23f' : '#ff4f64';
  const pulse = G.time <= 10 && G.screen === 'play' ? (Math.sin(G.t * 12) * 0.5 + 0.5) : 0;
  cx.fillStyle = col; rr(T.x, T.y, Math.max(T.h, T.w * k), T.h, T.h / 2); cx.fill();
  cx.fillStyle = 'rgba(255,255,255,0.35)'; rr(T.x + 4, T.y + 3, Math.max(0, T.w * k - 8), T.h * 0.3, T.h * 0.15); cx.fill();
  const secs = Math.ceil(G.time), label = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0');
  cx.save();
  cx.font = `700 ${15 + pulse * 3}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.fillStyle = G.time <= 10 ? '#fff' : '#1f1b4d';
  cx.fillText(label, T.x + T.w / 2, T.y + T.h / 2 + 1);
  cx.restore();

  // score
  const sc = L.score;
  cx.save();
  cx.translate(sc.x, sc.y); const s = 1 + G.scorePop * 0.25; cx.scale(s, s);
  cx.textAlign = 'center'; cx.textBaseline = 'middle';
  cx.font = `700 ${sc.size}px ${FONT}`;
  cx.fillStyle = 'rgba(0,0,40,0.25)'; cx.fillText(String(Math.round(G.shown)), 0, 4);
  cx.fillStyle = '#fff'; cx.fillText(String(Math.round(G.shown)), 0, 0);
  cx.restore();
  // star target ticks under score
  const got = G.targets.filter(t => G.score >= t).length;
  cx.save(); cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.font = `600 14px ${FONT}`;
  let sx = sc.x - 30;
  for (let i = 0; i < 3; i++) {
    const sp = G.starPop && G.starPop.i === i ? G.starPop.t : 0;
    if (sp) { cx.save(); cx.globalAlpha = sp * 0.6; cx.fillStyle = '#fff6a8'; cx.beginPath(); cx.arc(sx + i * 30, sc.y + sc.size * 0.62, 9 + (1 - sp) * 40, 0, 7); cx.fill(); cx.restore(); }
    drawStar(sx + i * 30, sc.y + sc.size * 0.62, 9 * (1 + sp * 1.2), i < got);
  }
  cx.restore();
  // combo chip
  if (G.combo >= 2) {
    const m = Math.min(2, 1 + 0.1 * (G.combo - 1));
    const cxp = sc.x, cyp = sc.y + sc.size * 0.62 + (L.portrait ? 26 : 30);
    cx.save(); cx.translate(cxp, cyp);
    const wob = 1 + Math.max(0, G.comboT - (COMBO_WINDOW - 0.25)) * 1.2;
    cx.scale(wob, wob);
    cx.fillStyle = '#ff3fa4'; rr(-50, -14, 100, 28, 14); cx.fill();
    cx.fillStyle = 'rgba(255,255,255,0.35)'; rr(-44, 8, 88 * (G.comboT / COMBO_WINDOW), 3, 2); cx.fill();
    cx.fillStyle = '#fff'; cx.font = `700 16px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.fillText('COMBO x' + m.toFixed(1), 0, -2);
    cx.restore();
  }
}
function drawStar(x, y, r, on) {
  cx.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; cx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); }
  cx.closePath(); cx.fillStyle = on ? '#ffd23f' : 'rgba(255,255,255,0.25)'; cx.fill();
}

function drawBubble() {
  const B = L.bubble;
  let text = '', kind = 'idle', sub = '';
  if (G.path.length || G.typed) {
    const w = G.path.length ? pathWord(G.tiles, G.path) : G.typed;
    text = w.toUpperCase();
    if (w.length >= 3 && G.dict.has(w)) {
      if (G.foundSet.has(w)) kind = 'dup';
      else { kind = 'live'; sub = '+' + Math.round(scorePath(G.tiles, G.path) * Math.min(2, 1 + 0.1 * (G.comboT > 0 ? G.combo : 0))); }
    } else kind = 'build';
    if (G.typed && !G.path.length) kind = 'bad';
  } else if (G.bubble) { text = G.bubble.text; kind = G.bubble.kind; }
  else if (G.screen === 'play') { text = G.found.length ? '' : 'DRAG ACROSS LETTERS'; kind = 'idle'; }
  if (!text) return;
  cx.save();
  const fs = Math.min(34, B.h * 0.66);
  cx.font = `700 ${fs}px ${FONT}`;
  const tw = cx.measureText(text).width + (sub ? cx.measureText(sub).width * 0.6 + 16 : 0);
  const w = Math.min(W - 24, tw + 40);
  let pop = 1;
  if (G.bubble && !G.path.length) pop = 1 + Math.max(0, G.bubble.t - 0.55) * 1.5;
  cx.translate(B.x, B.y + B.h / 2); cx.scale(pop, pop);
  const fills = { idle: 'rgba(0,0,40,0.18)', build: '#ffffff', live: '#22d36b', dup: '#ffd23f', good: '#22d36b', bad: '#ff4f64' };
  const inks = { idle: 'rgba(255,255,255,0.75)', build: '#1f1b4d', live: '#fff', dup: '#1f1b4d', good: '#fff', bad: '#fff' };
  if (kind !== 'idle') { cx.fillStyle = 'rgba(0,0,40,0.25)'; rr(-w / 2, -B.h / 2 + 4, w, B.h, B.h / 2); cx.fill(); }
  cx.fillStyle = fills[kind]; rr(-w / 2, -B.h / 2, w, B.h, B.h / 2); cx.fill();
  cx.fillStyle = inks[kind]; cx.textBaseline = 'middle';
  if (kind === 'idle') { cx.font = `600 ${Math.round(fs * 0.55)}px ${FONT}`; }
  if (sub) {
    cx.textAlign = 'left';
    const full = cx.measureText(text).width; cx.font = `700 ${Math.round(fs * 0.6)}px ${FONT}`; const sw = cx.measureText(sub).width;
    const x0 = -(full + 10 + sw) / 2;
    cx.font = `700 ${fs}px ${FONT}`; cx.fillText(text, x0, 2);
    cx.font = `700 ${Math.round(fs * 0.6)}px ${FONT}`; cx.globalAlpha = 0.9; cx.fillText(sub, x0 + full + 10, 3);
  } else { cx.textAlign = 'center'; cx.fillText(text, 0, 2); }
  cx.restore();
}

function drawList() {
  const R = L.list;
  cx.save();
  cx.font = `600 15px ${FONT}`; cx.fillStyle = 'rgba(255,255,255,0.85)'; cx.textBaseline = 'middle'; cx.textAlign = 'left';
  const possible = G.board ? [...G.board.solutions.values()].filter(s => s.common).length : 0;
  const left = possible - G.found.filter(f => G.dict.isCommon(f.word)).length;
  let cnt = `${G.found.length} word${G.found.length === 1 ? '' : 's'}  -  ${left} left to find`;
  if (cx.measureText(cnt).width > L.count.w) cnt = `${G.found.length} found  -  ${left} left`;
  cx.fillText(cnt, L.count.x, L.count.y);
  cx.beginPath(); cx.rect(R.x, R.y, R.w, R.h); cx.clip();
  let x = R.x, y = R.y; const h = 30, gap = 6;
  for (const f of G.found) {
    const t = f.word.toUpperCase();
    cx.font = `600 16px ${FONT}`; const w1 = cx.measureText(t).width;
    cx.font = `600 12px ${FONT}`; const w2 = cx.measureText(String(f.pts)).width;
    const w = w1 + w2 + 26;
    if (x + w > R.x + R.w) { x = R.x; y += h + gap; if (y + h > R.y + R.h) break; }
    const fresh = f === G.found[0] && G.flash && G.flash.kind === 'good';
    cx.fillStyle = fresh ? '#ffffff' : 'rgba(255,255,255,0.88)'; rr(x, y, w, h, 10); cx.fill();
    cx.fillStyle = '#1f1b4d'; cx.font = `600 16px ${FONT}`; cx.fillText(t, x + 9, y + h / 2 + 1);
    cx.fillStyle = '#16a957'; cx.font = `600 12px ${FONT}`; cx.fillText(String(f.pts), x + 15 + w1, y + h / 2 + 1);
    x += w + gap;
  }
  cx.restore();
}

function drawFx() {
  for (const p of G.particles) {
    cx.save(); cx.globalAlpha = Math.max(0, 1 - p.t / p.life); cx.translate(p.x, p.y); cx.rotate(p.r);
    cx.fillStyle = p.c; cx.fillRect(-p.s / 2, -p.s / 3, p.s, p.s * 0.66); cx.restore();
  }
  for (const f of G.flyers) {
    if (f.t < 0) continue;
    const k = Math.min(1, f.t / f.dur), e = k * k * (3 - 2 * k);
    const tx = L.score.x, ty = L.score.y;
    const x = f.x0 + (tx - f.x0) * e + Math.sin(k * Math.PI) * (f.x0 < tx ? -40 : 40), y = f.y0 + (ty - f.y0) * e - Math.sin(k * Math.PI) * 30;
    cx.save(); cx.globalAlpha = 0.95; cx.fillStyle = '#ffd23f'; cx.shadowColor = '#fff6a8'; cx.shadowBlur = 12;
    cx.beginPath(); cx.arc(x, y, f.s * (1 - k * 0.4), 0, 7); cx.fill(); cx.restore();
  }
  for (const f of G.floaters) {
    cx.save(); cx.globalAlpha = Math.min(1, f.t * 2); cx.font = `700 ${f.size}px ${FONT}`; cx.textAlign = 'center';
    cx.lineWidth = 6; cx.strokeStyle = 'rgba(30,10,90,0.6)'; cx.strokeText(f.text, f.x, f.y);
    cx.fillStyle = f.color; cx.fillText(f.text, f.x, f.y); cx.restore();
  }
  // low-time red edge pulse
  if (G.screen === 'play' && G.time <= 10 && G.time > 0) {
    const a = (0.18 + 0.22 * (1 - G.time / 10)) * (Math.sin(G.t * 9) * 0.5 + 0.5);
    const rg = cx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    rg.addColorStop(0, 'rgba(255,40,70,0)'); rg.addColorStop(1, 'rgba(255,40,70,' + a.toFixed(3) + ')');
    cx.fillStyle = rg; cx.fillRect(-20, -20, W + 40, H + 40);
  }
  if (G.banner) {
    const b = G.banner, life = b.life || (b.big ? 1.3 : 1.1), age = life - b.t;
    const sc = age < 0.15 ? 2 - age / 0.15 : 1 + Math.max(0, age - 0.8) * 0.3;
    cx.save(); cx.globalAlpha = Math.min(1, b.t * 3);
    cx.translate(L.grid.x + L.grid.s / 2, L.grid.y + L.grid.s / 2); cx.rotate(-0.06); cx.scale(sc, sc);
    const fs = Math.min(L.grid.s * (b.big ? 0.2 : 0.15), 90);
    cx.font = `700 ${fs}px ${FONT}`; cx.textAlign = 'center'; cx.textBaseline = 'middle';
    cx.lineWidth = fs * 0.22; cx.lineJoin = 'round'; cx.strokeStyle = '#1f1b4d'; cx.strokeText(b.text, 0, 0);
    const g = cx.createLinearGradient(0, -fs / 2, 0, fs / 2); g.addColorStop(0, '#fff6a8'); g.addColorStop(1, '#ffae00');
    cx.fillStyle = g; cx.fillText(b.text, 0, 0); cx.restore();
  }
  // last-3-seconds countdown
  if (G.screen === 'play' && G.time <= 3 && G.time > 0) {
    const n = Math.ceil(G.time), fr = G.time - Math.floor(G.time);
    cx.save(); cx.globalAlpha = 0.25 + 0.45 * fr; cx.font = `700 ${L.grid.s * (0.5 + (1 - fr) * 0.15)}px ${FONT}`;
    cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.shadowColor = '#ff2d55'; cx.shadowOffsetY = L.grid.s * 0.025; cx.fillStyle = '#fff';
    cx.fillText(String(n), L.grid.x + L.grid.s / 2, L.grid.y + L.grid.s / 2); cx.restore();
  }
}

function render() {
  cx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawBg();
  if (!G.board || G.screen === 'title' || G.screen === 'results') return;
  cx.save();
  if (G.shake > 0) cx.translate((Math.random() - 0.5) * G.shake, (Math.random() - 0.5) * G.shake);
  drawHud();
  drawBubble();
  drawGrid();
  drawList();
  drawFx();
  cx.restore();
}

// ---------------- loop ----------------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!G.freeze) update(dt);
  render();
  requestAnimationFrame(frame);
}

// ---------------- boot ----------------
layout(); buildLogo(); showScreen('title');
requestAnimationFrame(frame);
const fontsReady = (document.fonts && document.fonts.load) ? document.fonts.load(`700 40px Fredoka`).catch(() => {}) : Promise.resolve();
const ready = fetch('data/words.txt').then(r => r.text()).then(t => { G.dict = new Dict(t); }).then(() => fontsReady).then(() => {
  $('loading').classList.add('hide');
  if (pendingStart) { const m = pendingStart; pendingStart = null; newRound(m); }
  else if (params.get('play') === '1') newRound(params.get('mode') === 'daily' ? 'daily' : 'classic', params.has('seed') ? Number(params.get('seed')) : undefined);
}).catch(err => { $('loading').textContent = 'Could not load the word list. Refresh to try again.'; $('loading').classList.remove('hide'); console.error(err); });

// ---------------- test hooks ----------------
window.__G = {
  G, S, ready,
  get state() {
    return { screen: G.screen, mode: G.mode, time: G.time, score: G.score, found: G.found.map(f => f.word), combo: G.combo,
      path: G.path.slice(), board: G.tiles ? G.tiles.map(t => t.ch) : null, mults: G.tiles ? G.tiles.map(t => t.mult) : null,
      targets: G.targets, seed: G.board && G.board.seed, loaded: !!G.dict };
  },
  start(mode = 'classic', seed) { return newRound(mode, seed); },
  solutions() { return G.board ? [...G.board.solutions.values()].map(s => ({ word: s.word, score: s.score, path: s.path, common: s.common })) : []; },
  submitPath(p) { return submit(p); },
  submitWord(w) { const p = findPath(G.tiles, w); return p && pathWord(G.tiles, p) === w ? submit(p) : 'nopath'; },
  step(ms) { let t = ms / 1000; while (t > 0) { const d = Math.min(1 / 60, t); update(d); t -= d; } render(); },
  freeze(f = true) { G.freeze = f; },
  end() { endRound(); },
  rotate() { rotateBoard(); },
  tileCenter, layout: () => L,
};
