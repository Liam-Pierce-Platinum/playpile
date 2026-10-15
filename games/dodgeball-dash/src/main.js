// DODGEBALL DASH - top-down 3v3 arcade dodgeball vs bots. Canvas 2D, no build step.
import { initAudio, sfx, setMuted, isMuted } from './audio.js';
import { drawWorld, buildArt } from './draw.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto');
if (Q.has('mute')) setMuted(true);

export const CW = 960, CH = 540, MID = CW / 2, PR = 15, BR = 9;
const ROUND_TIME = 60, NBALLS = +(new URLSearchParams(location.search).get("balls")) || 3, WIN_ROUNDS = 3, STEP = 1 / 120;
const CHARGE_T = 0.7, CATCH_WIN = 0.3, CATCH_CD = 0.7;
const rand = Math.random, clamp = (v, a, b) => (v < a ? a : v > b ? b : v), lerp = (a, b, t) => a + (b - a) * t;
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

export const HOME = { name: 'DASHERS', c: '#2f7bf0', c2: '#173e85', a: '#ffffff' };
export const LADDER = [
  { name: 'REC ROOM ROOKIES', short: 'ROOKIES', c: '#f2994a', c2: '#a8521a', a: '#fff4e0', skill: 0.1 },
  { name: 'HALLWAY HOUNDS', short: 'HOUNDS', c: '#2bb673', c2: '#136b40', a: '#eafff3', skill: 0.24 },
  { name: 'CUL-DE-SAC KINGS', short: 'KINGS', c: '#9b51e0', c2: '#55228a', a: '#ffd23f', skill: 0.36 },
  { name: 'BOULEVARD BRUISERS', short: 'BRUISERS', c: '#e6b800', c2: '#8a6a00', a: '#1a1a2a', skill: 0.48 },
  { name: 'NEON VIPERS', short: 'VIPERS', c: '#14d3c5', c2: '#0a6f68', a: '#1a1a2a', skill: 0.6 },
  { name: 'IRON PONYTAILS', short: 'PONYTAILS', c: '#9aa5b8', c2: '#4a5468', a: '#e63946', skill: 0.7 },
  { name: 'MIDNIGHT MOOSE', short: 'MOOSE', c: '#3a3a46', c2: '#16161e', a: '#ffd23f', skill: 0.8 },
  { name: 'THE CHAMPS', short: 'CHAMPS', c: '#e63946', c2: '#8f1520', a: '#ffd23f', skill: 0.92 },
];

// ---------- save ----------
let save = { unlocked: 0, stars: [], tips: 0, cur: 0 };
try { const s = JSON.parse(localStorage.getItem('dbd_save') || 'null'); if (s) save = Object.assign(save, s); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem('dbd_save', JSON.stringify(save)); } catch (e) { /* ignore */ } };

function skillOf(s) {
  return { s, react: 0.4 - 0.28 * s, aimErr: 0.05 + 0.22 * (1 - s), lead: 0.2 + 0.8 * s, catchP: 0.12 + 0.5 * s, catchErr: 0.02 + 0.12 * (1 - s),
    dodgeP: 0.45 + 0.5 * s, speed: 200 + 75 * s, curveP: 0.05 + 0.4 * s, hold: 1.3 - 0.85 * s };
}

const SKINS = ['#f3cfae', '#e0a978', '#b67a4f', '#8a5634', '#5e3a22'];
const HAIRS = ['#2b1d14', '#6b3e1f', '#e3b44c', '#141414', '#a8401c', '#d9d2c3'];

// ---------- state ----------
export const G = {
  state: 'boot', rung: 0, enemy: LADDER[0], players: [], balls: [], parts: [], texts: [], score: [0, 0], round: 1,
  clock: ROUND_TIME, cd: 0, endT: 0, sudden: false, t: 0, shake: 0, zoom: 0, hitstop: 0, slow: 0, flash: 0, flashCol: '#fff',
  cheer: 0, stats: null, outQ: [[], []], banner: null, human: null, aim: { x: MID, y: CH / 2 }, touch: false, joy: null, auto: AUTO,
  lastResult: null, tipStage: save.tips,
};
window.__G = G; G.home = HOME;

function makePlayer(team, idx, human, skill) {
  return {
    team, idx, human, x: 0, y: 0, vx: 0, vy: 0, face: team ? Math.PI : 0, hold: null, out: false, seated: false, seat: { x: 0, y: 0 },
    charging: false, charge: 0, aimStart: 0, catchT: 0, catchCD: 0, dashT: 0, dashCD: 0, dx: 0, dy: 0, knockT: 0, spin: 0, inv: 0,
    squash: 0, walk: rand() * 6, throwT: 0, wantX: 0, wantY: 0, maxed: false,
    num: [7, 11, 23, 4, 9, 14, 30, 2, 8][(team * 3 + idx + G.rung) % 9], skin: SKINS[(idx * 2 + team + G.rung) % 5], hair: HAIRS[(idx + team * 2 + G.rung * 3) % 6],
    sk: skillOf(skill), ai: { threat: null, seen: new WeakSet(), wx: 0, wy: 0, wt: 0, holdT: 0, holdWait: 0, goal: 0, target: null },
  };
}
export const alive = (team) => G.players.filter((p) => p.team === team && !p.out);

// ---------- match flow ----------
function startMatch(rung) {
  G.demo = false; G.rung = clamp(rung, 0, LADDER.length - 1); if (G.rung <= save.unlocked) { save.cur = G.rung; persist(); }
  G.enemy = LADDER[G.rung];
  const mate = 0.38 + 0.38 * G.rung / 7;
  G.players = [];
  for (let i = 0; i < 3; i++) G.players.push(makePlayer(0, i, i === 1, mate));
  for (let i = 0; i < 3; i++) G.players.push(makePlayer(1, i, false, G.enemy.skill));
  G.human = G.players[1];
  G.score = [0, 0]; G.round = 1;
  G.stats = { hits: 0, catches: 0, dodges: 0, outs: 0, blocks: 0, throws: 0 };
  buildArt(G);
  $('nL').textContent = HOME.name; $('nR').textContent = G.enemy.short;
  document.querySelector('#board .side.r').style.borderRightColor = G.enemy.c;
  showScreen(null); $('hud').classList.remove('hidden');
  if (G.touch) $('touch').classList.remove('hidden');
  startRound();
}

function startRound() {
  G.balls = []; G.parts = []; G.texts = []; G.outQ = [[], []]; G.sudden = false; G.clock = ROUND_TIME;
  for (const p of G.players) {
    Object.assign(p, { out: false, seated: false, hold: null, charging: false, charge: 0, catchT: 0, catchCD: 0, dashT: 0, dashCD: 0, knockT: 0, inv: 0, vx: 0, vy: 0, spin: 0, throwT: 0 });
    p.x = p.team === 0 ? 46 : CW - 46; p.y = CH / 2 + (p.idx - 1) * 150; p.face = p.team ? Math.PI : 0;
    p.ai.threat = null; p.ai.target = null; p.ai.wt = 0;
  }
  for (let i = 0; i < NBALLS; i++) G.balls.push({ x: MID, y: CH / 2 + (i - (NBALLS - 1) / 2) * 92, z: 0, vx: 0, vy: 0, vz: 0, state: 'loose', owner: null, team: -1, thrower: null, curve: 0, age: 0, spin: rand() * 6, trail: [], near: null });
  G.state = 'countdown'; G.cd = 1.8; G.lastTick = 4;
  updateBoard();
}

function timeUp() {
  const a = alive(0).length, b = alive(1).length;
  if (a !== b) endRound(a > b ? 0 : 1);
  else { G.sudden = true; banner('SUDDEN DEATH', '#ff5a5a'); sfx.whistle(0.3); }
}

function endRound(w) {
  if (G.state !== 'play') return;
  G.state = 'roundEnd'; G.endT = 2.3; G.score[w]++;
  sfx.whistle(0.7);
  const matchOver = G.score[w] >= WIN_ROUNDS;
  if (w === 0) { banner(matchOver ? 'MATCH!' : 'ROUND WON', '#ffd23f'); confetti(); sfx.cheer(1.5); G.cheer = 2; }
  else banner(matchOver ? 'DEFEAT' : 'ROUND LOST', '#ff5a5a');
  G.slow = 0.7;
  updateBoard();
}

function finishMatch() {
  if (G.demo) { startMatchDemo(); return; }
  const won = G.score[0] > G.score[1];
  let stars = 0;
  if (won) {
    stars = 1 + (G.score[1] <= 1 ? 1 : 0) + (G.stats.outs === 0 ? 1 : 0);
    save.stars[G.rung] = Math.max(save.stars[G.rung] || 0, stars);
    save.unlocked = Math.max(save.unlocked, Math.min(LADDER.length - 1, G.rung + 1));
    persist(); sfx.win();
  } else sfx.lose();
  G.state = 'result'; G.lastResult = { won, stars, score: G.score.slice(), rung: G.rung };
  const champ = won && G.rung === LADDER.length - 1;
  $('rVs').textContent = 'LADDER ' + (G.rung + 1) + '/' + LADDER.length + ' - VS ' + G.enemy.name;
  $('rTitle').textContent = champ ? 'CHAMPIONS!' : won ? 'VICTORY' : 'DEFEAT';
  $('rStars').innerHTML = [0, 1, 2].map((i) => (i < stars ? '<span>&#9733;</span>' : '<span class="e">&#9733;</span>')).join('');
  $('rScore').textContent = G.score[0] + ' - ' + G.score[1];
  const s = G.stats;
  $('rStats').innerHTML = `<span>HITS ${s.hits}</span><span>CATCHES ${s.catches}</span><span>BLOCKS ${s.blocks}</span><span>DODGES ${s.dodges}</span><span>TIMES OUT ${s.outs}</span>`;
  $('result').querySelector('.card').classList.toggle('lose', !won);
  const nb = $('nextBtn');
  nb.textContent = won ? (champ ? 'LADDER' : 'NEXT TEAM') : 'TRY AGAIN';
  setTimeout(() => { if (G.state === 'result') showScreen('result'); }, 500);
}

function nextAction() {
  const r = G.lastResult; if (!r) return startMatch(G.rung);
  if (!r.won) return startMatch(G.rung);
  if (r.rung === LADDER.length - 1) return openTitle();
  startMatch(r.rung + 1);
}

// ---------- juice ----------
function banner(text, col) { G.banner = { text, col, t: 0 }; }
export function addText(x, y, text, col = '#fff', size = 22) { G.texts.push({ x, y, text, col, size, t: 0, life: 0.9 }); }
function burst(x, y, z, n, col, type = 'spark', sp = 260) {
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2, s = sp * (0.4 + rand() * 0.8);
    G.parts.push({ type, x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 80 + rand() * 220, life: 0.35 + rand() * 0.4, t: 0, col, size: 2 + rand() * 3, rot: rand() * 6 });
  }
}
function ring(x, y, col, r = 40, life = 0.35) { G.parts.push({ type: 'ring', x, y, z: 0, vx: 0, vy: 0, vz: 0, life, t: 0, col, size: r }); }
function dust(x, y, n = 5) { for (let i = 0; i < n; i++) G.parts.push({ type: 'dust', x: x + (rand() - 0.5) * 10, y: y + (rand() - 0.5) * 6, z: 0, vx: (rand() - 0.5) * 60, vy: (rand() - 0.5) * 30, vz: 0, life: 0.4 + rand() * 0.3, t: 0, col: 'rgba(120,90,60,', size: 4 + rand() * 4 }); }
function confetti() {
  const cols = ['#ffd23f', '#2f7bf0', '#ffffff', '#e63946', '#2bb673'];
  for (let i = 0; i < 70; i++) G.parts.push({ type: 'conf', x: rand() * CW, y: -20 - rand() * 80, z: 0, vx: (rand() - 0.5) * 80, vy: 120 + rand() * 160, vz: 0, life: 2 + rand(), t: 0, col: cols[i % 5], size: 4 + rand() * 3, rot: rand() * 6 });
}
function shake(a, z = 0) { G.shake = Math.max(G.shake, a); G.zoom = Math.max(G.zoom, z); }

// ---------- actions ----------
function tryCatch(p) {
  if (p.catchCD > 0 || p.out || p.knockT > 0) return;
  p.catchT = CATCH_WIN; p.catchCD = CATCH_CD;
}
function tryDash(p) {
  if (p.dashCD > 0 || p.out || p.knockT > 0) return;
  let dx = p.wantX, dy = p.wantY; const l = Math.hypot(dx, dy);
  if (l < 0.1) { dx = Math.cos(p.face); dy = Math.sin(p.face); } else { dx /= l; dy /= l; }
  p.dx = dx; p.dy = dy; p.dashT = 0.15; p.dashCD = 0.85; p.squash = -0.25;
  dust(p.x, p.y, 6); sfx.dash();
}
function startCharge(p) { p.charging = true; p.charge = 0; p.aimStart = p.face; p.maxed = false; }
function throwBall(p, ang, curve) {
  const b = p.hold; if (!b) return;
  const power = Math.max(0.12, p.charge);
  const sp = 560 + 640 * power;
  p.hold = null; p.charging = false; p.charge = 0; p.throwT = 0.22; p.squash = 0.2;
  b.state = 'live'; b.team = p.team; b.thrower = p; b.owner = null; b.age = 0; b.near = null; b.trail = [];
  b.vx = Math.cos(ang) * sp; b.vy = Math.sin(ang) * sp; b.x = p.x + Math.cos(ang) * (PR + BR + 2); b.y = p.y + Math.sin(ang) * (PR + BR + 2);
  b.z = 26; b.vz = 30; b.curve = clamp(curve, -1, 1); b.power = power;
  p.vx -= Math.cos(ang) * 90; p.vy -= Math.sin(ang) * 90;
  sfx.throw(power); shake(2 + power * 3);
  if (p.human) { G.stats.throws++; if (G.tipStage < 2) setTipStage(2); }
}
function curveAccel(b) { const v = Math.hypot(b.vx, b.vy) || 1; const k = 760 * b.curve * (v / 1000); return [-b.vy / v * k, b.vx / v * k]; }

function eliminate(p, b, caught) {
  if (p.out) return;
  p.out = true; p.seated = false; p.charging = false; p.catchT = 0;
  if (p.hold) { const hb = p.hold; hb.state = 'loose'; hb.owner = null; hb.vx = (rand() - 0.5) * 120; hb.vy = (rand() - 0.5) * 120; hb.vz = 200; p.hold = null; }
  p.knockT = 0.5; p.spin = 0;
  if (b) { p.vx = b.vx * 0.35; p.vy = b.vy * 0.35; p.spinV = (rand() < 0.5 ? -1 : 1) * 9; } else { p.vx = 0; p.vy = 0; p.spinV = 0; p.knockT = 0.3; }
  // human goes to the front of the line so a catch brings YOU back
  if (p.human) G.outQ[p.team].unshift(p); else G.outQ[p.team].push(p);
  const n = G.outQ[p.team].length - 1;
  p.seat = { x: p.team === 0 ? -48 : CW + 48, y: 120 + G.outQ[p.team].indexOf(p) * 60 + n * 0 };
  reseat(p.team);
  addText(p.x, p.y - 60, caught ? 'CAUGHT OUT!' : 'OUT!', caught ? '#ffd23f' : '#ffffff', caught ? 22 : 28);
  burst(p.x, p.y, 30, 14, '#ffd23f', 'star', 300); ring(p.x, p.y, '#ffffff', 46);
  sfx.hit(); sfx.cheer(1); G.cheer = 1.2;
  G.hitstop = p.human ? 0.13 : 0.07; shake(p.human ? 15 : 9, 0.03);
  if (p.human) { G.stats.outs++; G.slow = 0.55; G.flash = 0.35; G.flashCol = '#e63946'; }
  if (b && b.thrower && b.thrower.human) G.stats.hits++;
  updateBoard();
  if (alive(p.team).length === 0) endRound(1 - p.team);
  else if (G.sudden) endRound(1 - p.team);
}
function reseat(team) { G.outQ[team].forEach((q, i) => { q.seat = { x: team === 0 ? -48 : CW + 48, y: 150 + i * 70 }; q.seated = false; }); }

function revive(q) {
  q.out = false; q.seated = false; q.inv = 1.1; q.knockT = 0; q.spin = 0; q.vx = q.vy = 0;
  q.x = q.team === 0 ? 50 : CW - 50; q.y = clamp(CH / 2 + (rand() - 0.5) * 240, 40, CH - 40);
  burst(q.x, q.y, 20, 12, q.team === 0 ? HOME.c : G.enemy.c, 'spark', 200); ring(q.x, q.y, '#ffffff', 36);
  addText(q.x, q.y - 60, q.human ? "YOU'RE BACK!" : 'BACK IN!', '#7dffb0', 20);
  reseat(q.team);
}

function doCatch(p, b) {
  const elapsed = CATCH_WIN - p.catchT, perfect = elapsed < 0.1;
  const thrower = b.thrower;
  p.hold = b; b.state = 'held'; b.owner = p; b.team = p.team; b.thrower = null;
  p.catchT = 0; p.catchCD = 0.25; p.squash = -0.3; p.vx += b.vx * 0.12; p.vy += b.vy * 0.12;
  if (perfect) { p.charge = 0; }
  sfx.catch(perfect); shake(perfect ? 9 : 6, 0.04);
  G.hitstop = 0.06; G.slow = perfect ? 0.6 : 0.4; G.flash = 0.18; G.flashCol = '#ffd23f';
  addText(p.x, p.y - 64, perfect ? 'PERFECT CATCH!' : 'CATCH!', '#ffd23f', perfect ? 30 : 26);
  ring(p.x, p.y, '#ffd23f', 60, 0.45); burst(p.x, p.y, 26, 16, '#ffd23f', 'star', 320);
  if (p.human) { G.stats.catches++; if (G.tipStage < 4) setTipStage(4); }
  const q = G.outQ[p.team].shift(); if (q) revive(q);
  if (thrower && !thrower.out) eliminate(thrower, null, true);
}

function doBlock(p, b) {
  const v = Math.hypot(b.vx, b.vy);
  const nx = (b.x - p.x), ny = (b.y - p.y), l = Math.hypot(nx, ny) || 1;
  b.state = 'loose'; b.thrower = null; b.vx = nx / l * v * 0.35; b.vy = ny / l * v * 0.35; b.vz = 260;
  p.catchT = 0; p.catchCD = 0.3; p.squash = -0.2;
  sfx.block(); shake(5); G.hitstop = 0.04;
  addText(p.x, p.y - 60, 'BLOCK!', '#9fd8ff', 22); burst(b.x, b.y, b.z, 10, '#ffffff', 'spark', 260);
  if (p.human) G.stats.blocks++;
}

// ---------- tips (first match only) ----------
const TIPS = ['', 'Run to the centre - grab a ball!', 'Hold CLICK to charge, release to throw', 'SPACE right before a ball hits you = CATCH', ''];
const TOUCH_TIPS = ['', 'Left thumb: move to a ball', 'Hold THROW to charge, release to fire', 'Tap CATCH right before a ball hits you', ''];
function setTipStage(n) { G.tipStage = n; save.tips = Math.max(save.tips, n); persist(); }
function updateTip() {
  const el = $('tip');
  let txt = '';
  if (G.state === 'play' && G.tipStage < 4 && !G.auto) {
    const h = G.human;
    if (G.tipStage === 0) setTipStage(1);
    if (h.hold && G.tipStage < 2) txt = (G.touch ? TOUCH_TIPS : TIPS)[2];
    else if (G.tipStage === 1) txt = (G.touch ? TOUCH_TIPS : TIPS)[1];
    else if (G.tipStage >= 2 && G.dangerT > 0) txt = (G.touch ? TOUCH_TIPS : TIPS)[3];
  }
  if (el.textContent !== txt) el.textContent = txt;
  el.classList.toggle('hidden', !txt);
}

// ---------- input ----------
const keys = new Set();
const inp = { throwHeld: false, catchPress: false, dashPress: false, curve: 0 };
const KEYMAP = { KeyJ: 'throw', KeyK: 'catch', Space: 'catch', ShiftLeft: 'dash', ShiftRight: 'dash', KeyL: 'dash' };
addEventListener('keydown', (e) => {
  initAudio();
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  keys.add(e.code);
  const a = KEYMAP[e.code];
  if (a === 'throw') inp.throwHeld = true; else if (a === 'catch') inp.catchPress = true; else if (a === 'dash') inp.dashPress = true;
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  if (e.code === 'KeyP' || e.code === 'Escape') togglePause();
  if (e.code === 'KeyM') toggleMute();
  if (G.state === 'result') { if (e.code === 'KeyR') startMatch(G.rung); if (e.code === 'Enter') nextAction(); }
  else if (G.demo && (e.code === 'Enter' || e.code === 'Space')) startMatch(save.cur || 0);
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (KEYMAP[e.code] === 'throw') inp.throwHeld = false; });
addEventListener('blur', () => { keys.clear(); inp.throwHeld = false; });
const cvs = $('c');
function toWorld(cx, cy) { const v = G.view; return { x: (cx - v.ox) / v.s, y: (cy - v.oy) / v.s }; }
cvs.addEventListener('mousemove', (e) => { G.mouse = toWorld(e.clientX, e.clientY); });
cvs.addEventListener('mousedown', (e) => {
  initAudio(); G.mouse = toWorld(e.clientX, e.clientY);
  if (e.button === 0) inp.throwHeld = true; else if (e.button === 2) inp.catchPress = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) inp.throwHeld = false; });
cvs.addEventListener('contextmenu', (e) => e.preventDefault());

// touch: left half = floating joystick, buttons on the right
function enableTouch() { if (G.touch) return; G.touch = true; if (G.state !== 'title' && G.state !== 'result') $('touch').classList.remove('hidden'); $('hint').classList.add('hidden'); }
cvs.addEventListener('touchstart', (e) => {
  initAudio(); enableTouch(); e.preventDefault();
  for (const t of e.changedTouches) if (!G.joy && t.clientX < innerWidth * 0.6) G.joy = { id: t.identifier, sx: t.clientX, sy: t.clientY, x: t.clientX, y: t.clientY };
}, { passive: false });
cvs.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) if (G.joy && t.identifier === G.joy.id) { G.joy.x = t.clientX; G.joy.y = t.clientY; } }, { passive: false });
const endT = (e) => { for (const t of e.changedTouches) if (G.joy && t.identifier === G.joy.id) G.joy = null; };
cvs.addEventListener('touchend', endT); cvs.addEventListener('touchcancel', endT);
function bindBtn(id, down, up) {
  const el = $(id);
  el.addEventListener('touchstart', (e) => { e.preventDefault(); initAudio(); enableTouch(); el.classList.add('on'); down(e.changedTouches[0]); }, { passive: false });
  el.addEventListener('touchmove', (e) => { e.preventDefault(); if (el.onMove) el.onMove(e.changedTouches[0]); }, { passive: false });
  const u = (e) => { e.preventDefault(); el.classList.remove('on'); if (up) up(); };
  el.addEventListener('touchend', u); el.addEventListener('touchcancel', u);
}
let throwTouch0 = null;
bindBtn('tThrow', (t) => { inp.throwHeld = true; throwTouch0 = t.clientX; inp.curve = 0; }, () => { inp.throwHeld = false; });
$('tThrow').onMove = (t) => { if (throwTouch0 !== null) inp.curve = clamp((t.clientX - throwTouch0) / 60, -1, 1); };
bindBtn('tCatch', () => { inp.catchPress = true; });
bindBtn('tDash', () => { inp.dashPress = true; });

// ---------- control ----------
function nearestEnemyInDir(p, ang) {
  let best = null, bs = 1e9;
  for (const e of alive(1 - p.team)) { const a = Math.atan2(e.y - p.y, e.x - p.x); const s = Math.abs(angDiff(a, ang)) * 300 + Math.hypot(e.x - p.x, e.y - p.y) * 0.3; if (s < bs) { bs = s; best = e; } }
  return best;
}
function humanControl(p) {
  let mx = 0, my = 0;
  if (keys.has('KeyA') || keys.has('ArrowLeft')) mx -= 1; if (keys.has('KeyD') || keys.has('ArrowRight')) mx += 1;
  if (keys.has('KeyW') || keys.has('ArrowUp')) my -= 1; if (keys.has('KeyS') || keys.has('ArrowDown')) my += 1;
  if (G.joy) { const dx = G.joy.x - G.joy.sx, dy = G.joy.y - G.joy.sy, l = Math.hypot(dx, dy); if (l > 8) { const k = Math.min(1, l / 50); mx += dx / l * k; my += dy / l * k; } }
  const l = Math.hypot(mx, my); if (l > 1) { mx /= l; my /= l; }
  p.wantX = mx; p.wantY = my;
  if (G.touch && !G.mouse) {
    // touch: auto-aim at the enemy most in front of you
    const base = l > 0.2 ? Math.atan2(my, mx) : (p.team === 0 ? 0 : Math.PI);
    const tg = nearestEnemyInDir(p, base);
    const want = tg ? Math.atan2(tg.y - p.y, tg.x - p.x) : base;
    p.face += angDiff(want, p.face) * 0.35;
  } else if (G.mouse) {
    let a = Math.atan2(G.mouse.y - p.y, G.mouse.x - p.x);
    if (p.hold) { const tg = nearestEnemyInDir(p, a); if (tg) { const ta = Math.atan2(tg.y - p.y, tg.x - p.x); if (Math.abs(angDiff(ta, a)) < 0.12) a += angDiff(ta, a) * 0.5; } }
    p.face = a;
  }
  if (inp.throwHeld && p.hold && !p.charging) startCharge(p);
  if (p.charging && !inp.throwHeld) throwBall(p, p.face, humanCurve(p));
  if (inp.catchPress) tryCatch(p);
  if (inp.dashPress) tryDash(p);
}
export function humanCurve(p) {
  if (keys.has('KeyQ')) return -1; if (keys.has('KeyE')) return 1;
  if (G.touch && !G.mouse) return inp.curve;
  if (!p.charging) return 0;
  const sw = angDiff(p.face, p.aimStart);
  return Math.abs(sw) < 0.1 ? 0 : clamp((sw - Math.sign(sw) * 0.1) / 0.45, -1, 1);
}

function tti(b, p, R) {
  const rx = p.x - b.x, ry = p.y - b.y, v2 = b.vx * b.vx + b.vy * b.vy; if (v2 < 1) return null;
  const t = (rx * b.vx + ry * b.vy) / v2; if (t < -0.02) return null;
  const cx = rx - b.vx * t, cy = ry - b.vy * t, d2 = cx * cx + cy * cy; if (d2 > R * R) return null;
  return Math.max(0, t - Math.sqrt(R * R - d2) / Math.sqrt(v2));
}
function steer(p, tx, ty, arrive = 24) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < 3) { p.wantX = p.wantY = 0; return d; }
  const k = Math.min(1, d / arrive); p.wantX = dx / d * k; p.wantY = dy / d * k; return d;
}
function pickTarget(p) {
  const es = alive(1 - p.team); if (!es.length) return null;
  // prefer close, slow-moving, empty-handed targets (and the human sometimes)
  let best = null, bs = 1e9;
  for (const e of es) { let s = Math.hypot(e.x - p.x, e.y - p.y) + rand() * 220 + (e.hold ? 60 : 0) - (e.charging ? 80 : 0) + (e.inv > 0 ? 400 : 0); if (s < bs) { bs = s; best = e; } }
  return best;
}
function ballFor(p) {
  let best = null, bd = 1e9;
  for (const b of G.balls) {
    if (b.state !== 'loose') continue;
    if (p.team === 0 ? b.x > MID + 4 : b.x < MID - 4) continue;
    const d = Math.hypot(b.x - p.x, b.y - p.y);
    let mine = true;
    for (const q of G.players) {
      if (q === p || q.team !== p.team || q.out || q.hold) continue;
      const dq = Math.hypot(b.x - q.x, b.y - q.y);
      if (q.human && !G.auto) { if (dq < 90 && dq < d) mine = false; } else if (dq < d - 1) mine = false;
    }
    if (mine && d < bd) { bd = d; best = b; }
  }
  return best;
}

function botControl(p) {
  const A = p.ai, sk = p.sk, me = p.team;
  // 1) threats: decide once per incoming ball
  for (const b of G.balls) {
    if (b.state !== 'live' || b.team === me || A.seen.has(b)) continue;
    const t = tti(b, p, PR + BR + 8);
    if (t !== null && t < 0.9) {
      A.seen.add(b);
      const r = rand(), cp = sk.catchP * (p.hold ? 1.3 : 1);
      A.threat = { b, at: G.t + sk.react * (0.7 + rand() * 0.6), mode: r < cp ? 'catch' : r < cp + (1 - cp) * sk.dodgeP ? 'dodge' : 'none', err: (rand() * 2 - 1) * sk.catchErr, side: 0 };
    }
  }
  if (A.threat) {
    const th = A.threat, b = th.b;
    const t = b.state === 'live' ? tti(b, p, PR + BR + 16) : null;
    if (t === null) A.threat = null;
    else if (G.t >= th.at && th.mode !== 'none') {
      if (th.mode === 'catch') { p.face = Math.atan2(b.y - p.y, b.x - p.x); p.wantX = p.wantY = 0; if (p.charging) { p.charging = false; p.charge = 0; } if (t <= 0.12 + th.err) tryCatch(p); return; }
      const v = Math.hypot(b.vx, b.vy) || 1, nx = -b.vy / v, ny = b.vx / v;
      if (!th.side) { const s = (p.x - b.x) * nx + (p.y - b.y) * ny; th.side = Math.abs(s) > 4 ? Math.sign(s) : rand() < 0.5 ? 1 : -1; if ((p.y < 50 && ny * th.side < -0.3) || (p.y > CH - 50 && ny * th.side > 0.3)) th.side = -th.side; }
      p.wantX = nx * th.side; p.wantY = ny * th.side;
      if (t < 0.3 && rand() < sk.s + 0.3) tryDash(p);
      return;
    }
  }
  const es = alive(1 - me);
  // 2) holding: step up, wind up, fire
  if (p.hold) {
    A.holdT += 1 / 120 * 1;
    if (!A.target || A.target.out) A.target = pickTarget(p);
    const tg = A.target; if (!tg) { p.wantX = p.wantY = 0; return; }
    const ax = me === 0 ? MID - 120 - (1 - sk.s) * 90 : MID + 120 + (1 - sk.s) * 90;
    steer(p, ax, lerp(p.y, tg.y, 0.25), 60);
    const d = Math.hypot(tg.x - p.x, tg.y - p.y);
    if (!p.charging) {
      p.face = Math.atan2(tg.y - p.y, tg.x - p.x);
      if (A.holdT > A.holdWait) { startCharge(p); const need = (d / 0.8 - 560) / 640; A.goal = clamp(Math.max(need + 0.12, 0.45 + 0.5 * sk.s * rand()), 0.3, 1); }
    } else if (p.charge >= A.goal) {
      const sp = 560 + 640 * p.charge, ft = d / sp;
      const px = tg.x + tg.vx * ft * sk.lead, py = tg.y + tg.vy * ft * sk.lead;
      let ang = Math.atan2(py - p.y, px - p.x) + (rand() + rand() - 1) * sk.aimErr;
      let c = 0;
      if (rand() < sk.curveP) { c = (rand() < 0.5 ? -1 : 1) * (0.4 + rand() * 0.5); const disp = 0.5 * 760 * Math.abs(c) * (sp / 1000) * ft * ft * 0.85; ang -= Math.sign(c) * Math.atan2(disp, d); }
      p.face = ang; throwBall(p, ang, c);
    } else p.face = Math.atan2(tg.y - p.y, tg.x - p.x);
    return;
  }
  // 3) fetch a loose ball on our side
  const b = ballFor(p);
  if (b) { steer(p, b.x, b.y, 10); p.face = Math.atan2(b.y - p.y, b.x - p.x); return; }
  // 4) position: back off while enemies are armed, sidestep
  const armed = es.filter((e) => e.hold).length;
  A.wt -= 1 / 120;
  if (A.wt <= 0) {
    A.wt = 0.5 + rand() * 0.9;
    const depth = armed ? lerp(60, 230, rand()) : lerp(130, 360, rand());
    A.wx = me === 0 ? depth : CW - depth;
    A.wy = clamp(CH / 2 + (p.idx - 1) * 150 + (rand() - 0.5) * 160, 36, CH - 36);
  }
  steer(p, A.wx, A.wy, 40);
  let fe = null, fd = 1e9; for (const e of es) { const d = Math.hypot(e.x - p.x, e.y - p.y) - (e.charging ? 300 : 0); if (d < fd) { fd = d; fe = e; } }
  if (fe) p.face += angDiff(Math.atan2(fe.y - p.y, fe.x - p.x), p.face) * 0.15;
}

// ---------- simulation ----------
function update(dt) {
  G.t += dt;
  if (G.state === 'countdown') {
    G.cd -= dt;
    const n = Math.ceil(G.cd / 0.6);
    if (n < G.lastTick && n > 0) { sfx.tick(); G.lastTick = n; }
    if (G.cd <= 0) { G.state = 'play'; sfx.whistle(0.4); banner('DODGE!', '#ffd23f'); G.cheer = 1; }
  } else if (G.state === 'play') {
    if (!G.sudden) { G.clock -= dt; if (G.clock <= 0) { G.clock = 0; timeUp(); } }
  } else if (G.state === 'roundEnd') {
    G.endT -= dt;
    if (G.endT <= 0) { if (Math.max(...G.score) >= WIN_ROUNDS) finishMatch(); else { G.round++; startRound(); } }
  }
  if (G.banner) { G.banner.t += dt; if (G.banner.t > 1.3) G.banner = null; }
  G.dangerT = Math.max(0, (G.dangerT || 0) - dt);
  updatePlayers(dt); updateBalls(dt); updateFx(dt);
  inp.catchPress = false; inp.dashPress = false;
}

function updatePlayers(dt) {
  const live = G.state === 'play';
  for (const p of G.players) {
    p.catchT = Math.max(0, p.catchT - dt); p.catchCD = Math.max(0, p.catchCD - dt); p.dashT = Math.max(0, p.dashT - dt); p.dashCD = Math.max(0, p.dashCD - dt);
    p.inv = Math.max(0, p.inv - dt); p.throwT = Math.max(0, p.throwT - dt); p.squash *= Math.exp(-dt * 10);
    if (p.out) {
      if (p.knockT > 0) { p.knockT -= dt; p.spin += (p.spinV || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= Math.exp(-dt * 4); p.vy *= Math.exp(-dt * 4); }
      else { p.spin *= Math.exp(-dt * 12); const dx = p.seat.x - p.x, dy = p.seat.y - p.y, d = Math.hypot(dx, dy); if (d > 3) { const s = Math.min(d, 260 * dt); p.x += dx / d * s; p.y += dy / d * s; p.walk += dt * 14; p.face = Math.atan2(dy, dx); p.seated = false; } else { p.seated = true; p.face = Math.PI / 2; } }
      continue;
    }
    if (p.knockT > 0) { p.knockT -= dt; p.wantX = p.wantY = 0; }
    else if (live) { if (p.human && !G.auto) humanControl(p); else botControl(p); }
    else { p.wantX = p.wantY = 0; if (p.charging) { p.charging = false; } }
    if (p.charging) { p.charge = Math.min(1, p.charge + dt / CHARGE_T); if (p.charge >= 1 && !p.maxed) { p.maxed = true; if (p.human) sfx.charge(); } }
    const sp = (p.human ? 275 : p.sk.speed) * (p.charging ? 0.55 : 1) * (p.catchT > 0 ? 0.5 : 1);
    let tvx = p.wantX * sp, tvy = p.wantY * sp;
    if (p.dashT > 0) { tvx = p.dx * 760; tvy = p.dy * 760; if (rand() < 0.5) dust(p.x, p.y, 1); }
    const k = Math.min(1, dt * (p.dashT > 0 ? 30 : 13));
    p.vx += (tvx - p.vx) * k; p.vy += (tvy - p.vy) * k;
    p.x += p.vx * dt; p.y += p.vy * dt;
    const minX = p.team === 0 ? PR : MID + PR * 0.4, maxX = p.team === 0 ? MID - PR * 0.4 : CW - PR;
    p.x = clamp(p.x, minX, maxX); p.y = clamp(p.y, PR, CH - PR);
    const spd = Math.hypot(p.vx, p.vy); p.walk += spd * dt * 0.06;
  }
  // separation
  const ps = G.players;
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const a = ps[i], b = ps[j]; if (a.out || b.out || a.team !== b.team) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
    if (d > 0 && d < PR * 2) { const o = (PR * 2 - d) / 2; a.x -= dx / d * o; a.y -= dy / d * o; b.x += dx / d * o; b.y += dy / d * o; }
  }
}

function deadBall(b) {
  if (b.near && !b.near.out && G.state === 'play') { G.stats.dodges++; addText(b.near.x, b.near.y - 58, 'DODGED!', '#9fd8ff', 16); }
  b.state = 'loose'; b.thrower = null; b.near = null;
}
function updateBalls(dt) {
  const h = G.human;
  for (const b of G.balls) {
    if (b.state === 'held') {
      const o = b.owner;
      if (!o || o.out || o.hold !== b) { b.state = 'loose'; b.owner = null; continue; }
      const c = Math.cos(o.face), s = Math.sin(o.face);
      if (o.charging) { const w = o.charge; b.x = o.x - c * (6 + w * 8) + s * 8; b.y = o.y - s * (3 + w * 4) - c * 4; b.z = 34 + w * 6; }
      else { b.x = o.x + c * 13; b.y = o.y + s * 7 + 1; b.z = 20; }
      b.vx = b.vy = b.vz = 0; b.spin += dt * 2; continue;
    }
    if (b.state === 'live') {
      b.age += dt;
      const [ax, ay] = curveAccel(b); b.vx += ax * dt; b.vy += ay * dt; b.curve *= Math.exp(-dt * 0.9);
      b.vx *= Math.exp(-dt * 0.12); b.vy *= Math.exp(-dt * 0.12);
      b.vz -= 120 * dt; b.z += b.vz * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.spin += dt * 20 * (b.curve >= 0 ? 1 : -1);
      b.trail.push({ x: b.x, y: b.y - b.z }); if (b.trail.length > 12) b.trail.shift();
      // walls
      let wall = false;
      if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * 0.45; wall = true; } else if (b.x > CW - BR) { b.x = CW - BR; b.vx = -Math.abs(b.vx) * 0.45; wall = true; }
      if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * 0.45; wall = true; } else if (b.y > CH - BR) { b.y = CH - BR; b.vy = -Math.abs(b.vy) * 0.45; wall = true; }
      if (wall) { b.vx *= 0.6; b.vy *= 0.6; b.vz = 150; sfx.wall(); shake(2); burst(b.x, b.y, b.z, 5, '#ffffff', 'spark', 140); deadBall(b); continue; }
      if (b.z < 5) { b.z = 5; b.vz = 170; b.vx *= 0.55; b.vy *= 0.55; sfx.thud(0.8); dust(b.x, b.y, 3); deadBall(b); continue; }
      if (b.age > 2.5) { deadBall(b); continue; }
      // players
      for (const p of G.players) {
        if (p.out || p.team === b.team || p.inv > 0) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (p === h && d < PR + BR + 30 && G.state === 'play') { b.near = h; G.dangerT = 0.6; }
        if (d < PR + BR + (p.human && p.catchT > 0 && !p.hold ? 10 : 0) && b.z < 56) {
          b.near = null;
          if (p.catchT > 0 && !p.hold) doCatch(p, b);
          else if (p.catchT > 0 && p.hold) doBlock(p, b);
          else { eliminate(p, b, false); b.vx *= -0.3; b.vy *= -0.3; b.vz = 280; b.state = 'loose'; b.thrower = null; }
          break;
        }
      }
      if (b.state === 'live' && h && !h.out && !G.auto && G.state === 'play') { const t = tti(b, h, PR + BR + 12); if (t !== null && t < 0.5 && b.team !== h.team) G.dangerT = 0.5; }
      continue;
    }
    // loose
    b.trail.length = 0;
    b.vz -= 1400 * dt; b.z += b.vz * dt;
    if (b.z < 0) { b.z = 0; if (b.vz < -90) { if (b.vz < -200) sfx.thud(Math.min(1, -b.vz / 500)); b.vz = -b.vz * 0.48; } else b.vz = 0; }
    const f = Math.exp(-dt * (b.z <= 0.01 ? 1.7 : 0.25)); b.vx *= f; b.vy *= f;
    b.x += b.vx * dt; b.y += b.vy * dt; b.spin += Math.hypot(b.vx, b.vy) * dt * 0.08;
    if (b.x < BR) { b.x = BR; b.vx = Math.abs(b.vx) * 0.6; } else if (b.x > CW - BR) { b.x = CW - BR; b.vx = -Math.abs(b.vx) * 0.6; }
    if (b.y < BR) { b.y = BR; b.vy = Math.abs(b.vy) * 0.6; } else if (b.y > CH - BR) { b.y = CH - BR; b.vy = -Math.abs(b.vy) * 0.6; }
    if (G.state !== 'play' || b.z > 34) continue;
    for (const p of G.players) {
      if (p.out || p.hold || p.knockT > 0) continue;
      if (Math.hypot(p.x - b.x, p.y - b.y) < PR + BR + 4) {
        p.hold = b; b.state = 'held'; b.owner = p; b.team = p.team; p.squash = 0.15;
        p.ai.holdT = 0; p.ai.holdWait = p.sk.hold * (0.4 + rand() * 0.9); p.ai.target = null;
        if (p.human) { sfx.pick(); if (G.tipStage < 2) G.tipStage = Math.max(G.tipStage, 1); }
        break;
      }
    }
  }
}

function updateFx(dt) {
  for (const q of G.parts) {
    q.t += dt; q.x += q.vx * dt; q.y += q.vy * dt;
    if (q.type === 'spark' || q.type === 'star') { q.vz -= 900 * dt; q.z = Math.max(0, q.z + q.vz * dt); q.vx *= Math.exp(-dt * 2); q.vy *= Math.exp(-dt * 2); q.rot += dt * 8; }
    else if (q.type === 'conf') { q.vx += Math.sin(q.t * 5 + q.rot) * 40 * dt; q.rot += dt * 6; }
    else if (q.type === 'dust') { q.vx *= Math.exp(-dt * 3); q.vy *= Math.exp(-dt * 3); }
  }
  G.parts = G.parts.filter((q) => q.t < q.life);
  for (const t of G.texts) t.t += dt;
  G.texts = G.texts.filter((t) => t.t < t.life);
  if (G.parts.length > 400) G.parts.splice(0, G.parts.length - 400);
}

// ---------- HUD ----------
function updateBoard() {
  if (G.demo) return;
  const pips = (n) => Array.from({ length: WIN_ROUNDS }, (_, i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  $('pL').innerHTML = pips(G.score[0]); $('pR').innerHTML = pips(G.score[1]);
  const dots = (team, col) => G.players.filter((p) => p.team === team).map((p) => `<b class="${p.out ? 'out' : ''}" style="color:${col}"></b>`).join('');
  $('aL').innerHTML = dots(0, HOME.c); $('aR').innerHTML = dots(1, G.enemy.c);
  $('rnd').textContent = 'ROUND ' + G.round + ' - LADDER ' + (G.rung + 1) + '/' + LADDER.length;
}
let lastClock = '';
function updateClock() {
  const c = Math.ceil(G.clock), s = G.sudden ? 'SD' : c + '';
  const txt = G.sudden ? 'SUDDEN' : c >= 60 ? '1:00' : '0:' + String(c).padStart(2, '0');
  if (s !== lastClock) { lastClock = s; $('clock').textContent = txt; $('clock').classList.toggle('low', G.sudden || G.clock < 10); }
}

// ---------- screens ----------
function showScreen(id) { for (const s of ['title', 'pause', 'result']) $(s).classList.toggle('hidden', s !== id); }
function openTitle() {
  $('hud').classList.add('hidden'); $('touch').classList.add('hidden');
  const L = $('ladder');
  L.innerHTML = LADDER.map((t, i) => {
    const st = save.stars[i] || 0, lock = i > save.unlocked;
    return `<div class="rung ${lock ? 'lock' : ''} ${i === (save.cur || 0) ? 'cur' : ''}" data-i="${i}"><span class="n">${i + 1}</span><span class="chip" style="background:${t.c}"></span><span class="nm">${t.name}</span><span class="st">${lock ? '&#128274;' : '&#9733;'.repeat(st) + '<span style="opacity:.25">' + '&#9733;'.repeat(3 - st) + '</span>'}</span></div>`;
  }).join('');
  L.querySelectorAll('.rung').forEach((el) => el.addEventListener('click', () => { const i = +el.dataset.i; if (i <= save.unlocked) { initAudio(); startMatch(i); } }));
  showScreen('title');
  startMatchDemo();
}
function startMatchDemo() { // title backdrop: bots play each other quietly
  G.enemy = LADDER[save.cur || 0]; G.players = []; for (let t = 0; t < 2; t++) for (let i = 0; i < 3; i++) G.players.push(makePlayer(t, i, false, 0.5));
  G.human = null; G.stats = { hits: 0, catches: 0, dodges: 0, outs: 0, blocks: 0, throws: 0 }; G.score = [0, 0]; G.round = 1; G.demo = true; buildArt(G); startRound();
}
let pausedFrom = null;
function togglePause() {
  if (G.state === 'paused') { G.state = pausedFrom; showScreen(null); return; }
  if (!G.demo && (G.state === 'play' || G.state === 'countdown' || G.state === 'roundEnd')) { pausedFrom = G.state; G.state = 'paused'; showScreen('pause'); inp.throwHeld = false; }
}
function toggleMute() { setMuted(!isMuted()); $('muteBtn').classList.toggle('off', isMuted()); }
$('playBtn').onclick = () => { initAudio(); startMatch(save.cur || 0); };
$('resumeBtn').onclick = togglePause;
$('pRestart').onclick = () => startMatch(G.rung);
$('pMenu').onclick = openTitle;
$('retryBtn').onclick = () => startMatch(G.rung);
$('nextBtn').onclick = nextAction;
$('menuBtn').onclick = openTitle;
$('muteBtn').onclick = toggleMute; $('pauseBtn').onclick = togglePause;
['muteBtn', 'pauseBtn'].forEach((id) => $(id).addEventListener('mousedown', (e) => e.stopPropagation()));

// ---------- loop ----------
const ctx = cvs.getContext('2d');
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cvs.width = Math.round(innerWidth * dpr); cvs.height = Math.round(innerHeight * dpr);
  G.dpr = dpr;
  const narrow = innerWidth / innerHeight < 1.25;
  const V = narrow ? { x0: -20, y0: -60, x1: CW + 20, y1: CH + 30 } : { x0: -110, y0: -150, x1: CW + 110, y1: CH + 70 };
  const s = Math.min(innerWidth / (V.x1 - V.x0), innerHeight / (V.y1 - V.y0));
  G.view = { s, ox: (innerWidth - (V.x1 - V.x0) * s) / 2 - V.x0 * s, oy: (innerHeight - (V.y1 - V.y0) * s) / 2 - V.y0 * s + (narrow ? 0 : 10) };
}
addEventListener('resize', resize); resize();

let acc = 0, last = performance.now();
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.state !== 'paused' && G.state !== 'boot') {
    if (G.hitstop > 0) G.hitstop -= dt;
    else {
      let ts = 1;
      if (G.slow > 0) { G.slow -= dt; ts = 0.3; }
      acc += dt * ts;
      let n = 0;
      while (acc >= STEP && n < 12) { update(STEP); acc -= STEP; n++; }
      if (n >= 12) acc = 0;
    }
    G.shake *= Math.exp(-dt * 9); if (G.shake < 0.2) G.shake = 0;
    G.zoom *= Math.exp(-dt * 8); G.flash = Math.max(0, G.flash - dt); G.cheer = Math.max(0, G.cheer - dt);
  }
  if (!G.demo && G.state !== 'boot') { updateClock(); updateTip(); }
  drawWorld(ctx, G, cvs.width, cvs.height, now / 1000, { humanCurve, inp });
  requestAnimationFrame(frame);
}

// test hooks
G.fast = (sec) => { const n = Math.round(sec / STEP); for (let i = 0; i < n; i++) { if (G.state === 'result' || G.state === 'paused') break; update(STEP); } G.hitstop = 0; G.slow = 0; return G.state; };
G.startMatch = startMatch; G.nextAction = nextAction; G.openTitle = openTitle; G.save = () => save; G.inp = inp;

// first visit: straight into a match; ?title shows the home screen
if (Q.has('title')) openTitle();
else startMatch(Q.has('rung') ? +Q.get('rung') : save.cur || 0);
requestAnimationFrame((t) => { last = t; frame(t); });
