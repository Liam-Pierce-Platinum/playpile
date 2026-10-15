// ROOF RUN - one-button rooftop runner over a sunset city.
// Tap = jump, hold = slide (in the air, hold = fast-fall). Glass windows smash for a speed boost.
import { wake, sfx, setIntensity, setMuted, isMuted } from './audio.js';
import { drawRunner, RUNNERS } from './runner.js';

const Q = new URLSearchParams(location.search);
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
const $ = (id) => document.getElementById(id);

// ---------- save ----------
const SAVE_KEY = 'roofrun.v1';
const save = { coins: 0, best: 0, owned: ['dash'], sel: 'dash', runs: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const runnerDef = () => RUNNERS.find((r) => r.id === save.sel) || RUNNERS[0];

// ---------- tuning ----------
const GR = 2500, JUMP = 900, H = 60, HS = 28, HOLD_T = 0.12, M = 20; // 20 px = 1 m
const CEIL = 100, SIGN_LO = 40, SIGN_HI = 215;
const speedAt = (m) => 360 + 480 * (1 - Math.exp(-m / 1600));
const diff = (m) => Math.min(1, m / 3000);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

let seed = +Q.get('seed') || ((Math.random() * 1e9) | 0);
const mulberry = (a) => () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
let rnd = mulberry(seed);
const R = (a, b) => a + (b - a) * rnd();
const hash = (n) => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

// ---------- state ----------
const S = { mode: 'play', t: 0, coins: 0, combo: 0, comboT: 0, best: 0, hitstop: 0, slow: 0, shake: 0, cstreak: 0, lastCoinT: -9, refY: 0, district: 0, milestone: 0, deadShown: false, hint: 0, paused: false };
const I = { held: false, at: 0, converted: false, buf: 0 };
let P, B, coins, parts, pops, cam = { x: 0, y: -260 }, view = { w: 800, h: 450, s: 1, dpr: 1, cw: 0, ch: 0 };
let bot = Q.has('bot');

function newRun() {
  rnd = mulberry(seed); seed = (seed + 7919) | 0;
  const rd = runnerDef();
  P = { x: 0, y: 0, vy: 0, ground: true, slide: false, fast: false, coyote: 0, djump: false, speed: speedAt(0), boost: 0,
    dead: null, deadT: 0, vx: 0, rot: 0, vr: 0, phase: 0, sq: 0, airT: 0, lastB: null, wantStand: false, rd };
  B = []; coins = []; parts = []; pops = [];
  Object.assign(S, { acts: {}, t: 0, coins: 0, combo: 0, comboT: 0, hitstop: 0, slow: 0, shake: 0, cstreak: 0, refY: 0, milestone: 0, deadShown: false, district: 0 });
  S.best = save.best; S.hint = save.runs < 2 ? 1 : 0;
  while (B.length < 6) genBuilding();
  P.lastB = B[0];
  cam.x = P.x - view.w * 0.27; cam.y = -view.h * 0.64;
}

// ---------- world generation ----------
const SIGNS = [['NOODLES', '#ff3d7f'], ['OPEN 24H', '#3dffc8'], ['RAMEN', '#ffd23f'], ['HOTEL', '#7af0ff'], ['SODA', '#ff7a3d'], ['DISCO', '#c77dff'], ['TAXI', '#ffe14d'], ['SUSHI', '#ff5a5a']];
function genBuilding() {
  const last = B[B.length - 1], idx = B.length;
  const m0 = last ? (last.x + last.w) / M : 0, sp = speedAt(m0), d = diff(m0);
  const b = { obs: [], tower: null, deco: [], style: (rnd() * 4) | 0, id: (rnd() * 1e6) | 0 };
  if (!last) { b.x = -700; b.y = 0; b.w = 2000; }
  else {
    let dy = rnd() < 0.5 ? -R(10, 85) : R(10, 120);
    if (idx < 4) dy = R(-30, 50);
    b.y = clamp(last.y + dy, -170, 190); dy = b.y - last.y;
    const t = (JUMP + Math.sqrt(JUMP * JUMP + 2 * GR * dy)) / GR; // flight time to the next roof
    const reach = sp * t;
    const gap = Math.max(70, reach * (idx < 4 ? R(0.25, 0.35) : R(0.25, 0.45 + 0.27 * d)));
    b.x = last.x + last.w + gap;
    b.w = idx < 4 ? sp * (idx === 3 ? 3.4 : 2.4) : Math.max(520, sp * R(1.3, 3.6 - 0.7 * d));
    if (rnd() < 0.65 || idx < 3) { // coin arc that traces a good jump
      const xs = last.x + last.w - 18;
      for (let k = 1; k <= 6; k++) { const tt = (t * k) / 7; coins.push({ x: xs + sp * tt, y: last.y - 34 - JUMP * tt + (GR * tt * tt) / 2 }); }
    }
  }
  B.push(b);
  if (idx === 0) return;
  const wantTower = idx > 3 && rnd() < 0.35;
  if (wantTower) b.w = Math.max(b.w, sp * 3.3);
  const endX = b.x + b.w - sp * 0.75;
  if (idx === 1) addBox(b, b.x + b.w * 0.5);
  else if (idx === 2) addSign(b, b.x + b.w * 0.5);
  else if (idx === 3) addTower(b, b.x + b.w * 0.3, sp * 1.1);
  else {
    let cx = b.x + sp * 0.2, towers = 0;
    for (;;) {
      cx += sp * R(0.85, 1.3 - 0.35 * d);
      if (cx > endX) break;
      const r = rnd();
      if ((wantTower || r < 0.15) && !towers && endX - cx > sp * 1.3) { const L = sp * R(0.7, 1.1); addTower(b, cx, L); towers++; cx += L - sp * 0.2; }
      else if (r < 0.6) addBox(b, cx);
      else addSign(b, cx);
      if (rnd() < 0.35) { const n = 4; for (let k = 0; k < n; k++) coins.push({ x: cx + sp * 0.45 + k * 36, y: b.y - 30 }); }
    }
  }
  // background roof furniture (never collides)
  for (let k = 0; k < 3; k++) if (rnd() < 0.55) {
    const dx = b.x + R(60, b.w - 120);
    if (b.tower && dx > b.tower.x0 - 80 && dx < b.tower.x1 + 40) continue;
    b.deco.push({ x: dx, k: (rnd() * 3) | 0, s: R(0.8, 1.2) });
  }
}
function addBox(b, x) {
  const o = { t: 'box', x, w: R(40, 72), h: R(32, 48), k: (rnd() * 3) | 0 };
  b.obs.push(o);
  if (rnd() < 0.5) for (let k = 0; k < 3; k++) coins.push({ x: x + o.w / 2 + (k - 1) * 34, y: b.y - o.h - 95 + Math.abs(k - 1) * 14 });
}
function addSign(b, x) {
  const [txt, col] = SIGNS[(rnd() * SIGNS.length) | 0];
  const o = { t: 'sign', x, w: R(80, 140), txt, col };
  b.obs.push(o);
  if (rnd() < 0.6) for (let k = 0; k < 3; k++) coins.push({ x: x + 10 + (k * (o.w - 20)) / 2, y: b.y - 15 });
}
function addTower(b, x0, L) {
  b.tower = { x0, x1: x0 + L, b0: false, b1: false };
  for (let x = x0 + 50; x < x0 + L - 30; x += 42) coins.push({ x, y: b.y - 30 });
}
const under = (x) => { for (const b of B) if (x + 9 > b.x && x - 9 < b.x + b.w) return b; return null; };

// ---------- actions ----------
function doJump() {
  if (P.dead) return false;
  const jm = P.rd.jump || 1;
  if (P.ground || P.coyote > 0) {
    if (P.slide && signOver()) return false;
    P.vy = -JUMP * jm; P.ground = false; P.coyote = 0; P.slide = false; P.fast = false; P.sq = -0.25; P.airT = 0;
    dust(P.x, P.y, 6); sfx.jump(); return true;
  }
  if (P.rd.djump && !P.djump) {
    P.djump = true; P.vy = -JUMP * 0.85; P.fast = false; P.sq = -0.3; sfx.djump();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; parts.push({ x: P.x, y: P.y - 10, vx: Math.cos(a) * 160, vy: Math.sin(a) * 60, life: 0.4, max: 0.4, s: 3, c: P.rd.scarf, g: 0 }); }
    return true;
  }
  return false;
}
function signOver() {
  const b = under(P.x); if (!b) return false;
  return b.obs.some((o) => o.t === 'sign' && P.x + 18 > o.x - 4 && P.x - 18 < o.x + o.w + 4);
}
function slideOn() {
  if (P.dead) return;
  if (P.ground) { if (!P.slide) { P.slide = true; P.wantStand = false; sfx.slide(); dust(P.x + 10, P.y, 5); } }
  else P.fast = true;
}
function slideOff() { P.fast = false; if (P.slide) { if (signOver()) P.wantStand = true; else P.slide = false; } }

// one-button: press -> after HOLD_T becomes slide/fast-fall; quick release = jump
function press() {
  wake();
  if (S.mode !== 'play') return;
  if (I.held) return;
  I.held = true; I.at = S.t; I.converted = false;
  if (!P.ground && P.coyote <= 0 && P.rd.djump && !P.djump && P.airT > 0.08) { doJump(); I.converted = true; I.dj = true; }
}
function release() {
  if (!I.held) return;
  I.held = false;
  if (I.dj) { I.dj = false; return; }
  if (!I.converted) { if (!doJump()) I.buf = 0.14; }
  else slideOff();
}

// ---------- juice helpers ----------
function dust(x, y, n) { for (let i = 0; i < n; i++) parts.push({ x: x + R(-8, 8), y: y - 2, vx: R(-120, 40) - P.speed * 0.15, vy: R(-90, -10), life: R(0.25, 0.5), max: 0.5, s: R(3, 6), c: 'rgba(255,225,200,0.6)', g: 200, dust: 1 }); }
function pop(text, col = '#fff', big = 1) { pops.push({ x: P.x + 10, y: P.y - 90, text, col, life: 0.9, big }); }
function action(name, col) {
  S.combo++; S.comboT = 3.2; S.acts[name] = (S.acts[name] || 0) + 1;
  pop(name, col, 1);
  if (S.combo % 5 === 0) { sfx.combo(Math.min(12, S.combo / 5)); pop('COMBO x' + S.combo, '#ffd23f', 1.4); }
}
const coinMult = () => 1 + Math.min(2, Math.floor(S.combo / 10));

function smash(b, x, side) {
  const T = b.tower;
  if (side === 0) T.b0 = true; else T.b1 = true;
  sfx.glass(); S.hitstop = 0.045; S.shake = Math.max(S.shake, 9); P.boost = Math.min(160, P.boost + 90);
  for (let i = 0; i < 26; i++) parts.push({ x: x + R(-4, 6), y: b.y - R(4, CEIL - 4), vx: R(60, 420) + P.speed * 0.5, vy: R(-300, 60), life: R(0.5, 1.1), max: 1.1, s: R(3, 9), c: i % 3 ? 'rgba(190,235,255,0.9)' : '#ffffff', g: 1300, shard: 1, rot: R(0, 6), vr: R(-14, 14) });
  action('SMASH!', '#7af0ff');
}

function die(kind) {
  if (P.dead) return;
  P.dead = kind; P.deadT = 0; S.combo = 0; S.comboT = 0; I.held = false;
  if (kind === 'fall') { sfx.fall(); P.vx = P.speed * 0.7; }
  else {
    sfx.crash(); S.shake = 18; S.hitstop = 0.07; S.slow = 0.55;
    P.vx = -Math.max(120, P.speed * 0.3); P.vy = -560; P.vr = -10; P.slide = false;
    for (let i = 0; i < 18; i++) parts.push({ x: P.x + 10, y: P.y - 30, vx: R(-300, 200), vy: R(-400, 50), life: R(0.4, 0.9), max: 0.9, s: R(2, 5), c: i % 2 ? '#ffd23f' : '#fff', g: 900 });
  }
}

// ---------- simulation ----------
function step(dt) {
  S.t += dt;
  for (const p of parts) { p.life -= dt; p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; if (p.vr) p.rot += p.vr * dt; }
  parts = parts.filter((p) => p.life > 0);
  for (const p of pops) { p.life -= dt; p.y -= 50 * dt; }
  pops = pops.filter((p) => p.life > 0);
  if (S.hitstop > 0) { S.hitstop -= dt; return; }
  if (P.dead) { deadStep(dt); camStep(dt); return; }

  const m = P.x / M;
  P.boost = Math.max(0, P.boost - dt * 70);
  P.speed = speedAt(m) + P.boost;
  if (S.comboT > 0) { S.comboT -= dt; if (S.comboT <= 0) S.combo = 0; }
  if (I.buf > 0) I.buf -= dt;
  if (I.held && !I.converted && S.t - I.at > HOLD_T) { I.converted = true; slideOn(); }
  if (I.held && I.converted && P.ground && !P.slide) slideOn();
  if (bot) botStep();
  if (P.wantStand && !signOver()) { P.slide = false; P.wantStand = false; }
  if (I.buf > 0 && P.ground && !I.held && doJump()) I.buf = 0; // tap buffered under a sign fires as soon as it clears

  const py = P.y;
  P.x += P.speed * dt;
  P.phase += P.speed * dt * 0.042;
  P.sq *= Math.pow(0.0005, dt);
  let b = under(P.x);
  if (P.ground) {
    if (!b || b.y !== P.y) { P.ground = false; P.coyote = 0.09; P.vy = 0; P.slide = false; P.airT = 0; }
    else if (P.slide && S.t % 0.06 < dt) dust(P.x + 14, P.y, 1);
  }
  if (!P.ground) {
    P.coyote -= dt; P.airT += dt;
    P.vy += GR * dt * (P.fast ? 2.6 : 1); P.y += P.vy * dt;
    if (b && P.vy >= 0 && py <= b.y + 1 && P.y >= b.y) land(b);
    else if (b && P.y > b.y + 4) { P.x = b.x - 10; die('wall'); return; }
  }
  // tower: smash in, run the lit floor, smash out
  if (b && b.tower) {
    const T = b.tower, front = P.x + 11, h = P.slide ? HS : H;
    if (!T.b0 && front >= T.x0 && P.x < T.x1) {
      if (P.y < b.y - CEIL + 22) { P.x = T.x0 - 12; die('wall'); return; }
      smash(b, T.x0, 0);
    }
    if (front > T.x0 && P.x - 11 < T.x1 && P.y - h < b.y - CEIL) { P.y = b.y - CEIL + h; if (P.vy < 0) P.vy = 30; }
    if (!T.b1 && front >= T.x1) smash(b, T.x1, 1);
  }
  // obstacles
  if (b) {
    const h = P.slide ? HS : H, hw = P.slide ? 17 : 10;
    const pl = P.x - hw, pr = P.x + hw, pt = P.y - h + 5, pb = P.y - 3;
    for (const o of b.obs) {
      const ot = o.t === 'box' ? b.y - o.h : b.y - SIGN_HI, ob = o.t === 'box' ? b.y : b.y - SIGN_LO;
      if (pr > o.x + 3 && pl < o.x + o.w - 3 && pb > ot && pt < ob) { die('crash'); return; }
      if (o.t === 'box' && pr > o.x && pl < o.x + o.w) o.minC = Math.min(o.minC ?? 999, b.y - o.h - P.y);
      if (!o.done && pl > o.x + o.w) {
        o.done = true;
        if (o.t === 'box') action(o.minC < 16 ? 'CLOSE!' : 'HOP', o.minC < 16 ? '#ff7a3d' : '#ffffff');
        else action('SLIDE', '#3dffc8');
      }
    }
  }
  // coins
  const mult = coinMult() * (P.rd.coin2 ? 2 : 1);
  for (const c of coins) {
    if (c.got) continue;
    const dx = c.x - P.x, dy = c.y - (P.y - (P.slide ? 14 : 30));
    if (dx > 300) break;
    const d2 = dx * dx + dy * dy;
    if (P.rd.magnet && d2 < 170 * 170) { const d = Math.sqrt(d2) || 1; c.x -= (dx / d) * 600 * dt; c.y -= (dy / d) * 600 * dt; }
    if (d2 < 27 * 27) {
      c.got = true; S.coins += mult;
      S.cstreak = S.t - S.lastCoinT < 0.45 ? S.cstreak + 1 : 0; S.lastCoinT = S.t;
      sfx.coin(S.cstreak);
      for (let i = 0; i < 6; i++) parts.push({ x: c.x, y: c.y, vx: R(-120, 120), vy: R(-160, 40), life: 0.35, max: 0.35, s: 2.5, c: '#fff3a0', g: 300 });
    }
  }
  if (P.y > S.refY + 700) { die('fall'); return; }
  // milestones + districts
  const ms = Math.floor(m / 500);
  if (ms > S.milestone) { S.milestone = ms; sfx.milestone(); pop(ms * 500 + ' M', '#ffd23f', 1.6); }
  if (S.best > 50 && m >= S.best && !S.beatBest) { S.beatBest = true; pop('NEW BEST!', '#3dffc8', 1.5); sfx.combo(5); }
  setIntensity(clamp((P.speed - 360) / 480, 0, 1));
  // stream the world
  while (B[B.length - 1].x < P.x + 4000) genBuilding();
  if (B.length > 3 && B[1].x + B[1].w < P.x - 1200) B.shift();
  if (coins.length > 60 && coins[0].x < P.x - 900) coins = coins.filter((c) => c.x > P.x - 900);
  camStep(dt);
}
function land(b) {
  const hard = clamp(P.vy / 1600, 0, 1);
  P.y = b.y; P.vy = 0; P.ground = true; P.fast = false; P.djump = false; P.sq = 0.18 + hard * 0.25; P.airT = 0;
  dust(P.x, P.y, 5 + (hard * 8) | 0); sfx.land(hard);
  if (hard > 0.7) S.shake = Math.max(S.shake, 4);
  if (b !== P.lastB) { const edge = P.x - b.x; action(edge < 26 ? 'EDGE!' : 'GAP', edge < 26 ? '#ff7a3d' : '#ffffff'); P.lastB = b; }
  if (I.buf > 0) { I.buf = 0; doJump(); }
  else if (I.held && I.converted) slideOn();
}
function deadStep(dt) {
  P.deadT += dt;
  if (P.dead === 'fall') { P.vx *= Math.pow(0.4, dt); P.x += P.vx * dt; P.vy += GR * dt; P.y += P.vy * dt; P.rot += dt * 2; }
  else {
    P.x += P.vx * dt; P.vy += GR * dt; P.y += P.vy * dt; P.rot += P.vr * dt;
    const b = under(P.x);
    if (b && P.vy > 0 && P.y >= b.y && P.y - P.vy * dt <= b.y + 2) { P.y = b.y; P.vy *= -0.32; P.vx *= 0.55; P.vr *= 0.5; if (Math.abs(P.vy) < 90) { P.vy = 0; P.vr = 0; } dust(P.x, P.y, 6); }
  }
  if (P.deadT > (P.dead === 'fall' ? 1.0 : 1.2) && !S.deadShown) endRun();
}
function camStep(dt) {
  const tx = P.dead ? cam.x + (P.dead === 'fall' ? 0 : 0) : P.x - view.w * (view.lead || 0.27);
  if (!P.dead) cam.x = tx;
  if (P.ground && !P.dead) S.refY = P.y;
  let ty = S.refY - view.h * 0.64;
  if (!P.dead && P.y - 90 < ty + 30) ty = P.y - 120;
  cam.y += (ty - cam.y) * Math.min(1, dt * 3.2);
}

// ---------- autopilot (tests + title-screen attract mode) ----------
const botS = { sliding: false };
function botStep() {
  if (!P.ground) return;
  const b = under(P.x); if (!b) return;
  const sp = P.speed, jm = P.rd.jump || 1;
  let next = null;
  for (const o of b.obs) if (o.x + o.w > P.x - 18 && (!next || o.x < next.x)) next = o;
  if (botS.sliding && (!next || next.t !== 'sign' || next.x > P.x + 60)) { botS.sliding = false; slideOff(); }
  if (b.tower && !b.tower.b1 && P.x + 11 > b.tower.x0 - 40) return; // just run through
  if (next && next.t === 'sign' && next.x - (P.x + 20) < sp * 0.06 + 16) { if (!P.slide) slideOn(); botS.sliding = true; return; }
  if (next && next.t === 'box') {
    const v = JUMP * jm, hh = next.h + 6;
    const t1 = (v - Math.sqrt(v * v - 2 * GR * hh)) / GR;
    if (next.x - (P.x + 10) < sp * t1 + 6) { doJump(); return; }
  }
  if (b.x + b.w - P.x < 10 + sp * 0.012 && !(next && next.x < b.x + b.w)) doJump();
}

// ---------- rendering ----------
const PAL = [
  { top: '#2b1d52', mid: '#c04a7a', hor: '#ffb15c', sun: '#ffe08a', l0: '#b4588a', l1: '#84406f', l2: '#552c62', fac: '#2f1f46', rim: '#ffb36b', win: '#ffcf7a', fog: '#ff9d6b' },
  { top: '#140f33', mid: '#5b2a74', hor: '#ff6f61', sun: '#ff9d6b', l0: '#76407e', l1: '#4f2c66', l2: '#33224f', fac: '#211a3a', rim: '#ff8a6b', win: '#ffd27a', fog: '#d0507a' },
  { top: '#05061a', mid: '#18144a', hor: '#4a2f7a', sun: '#ff4fa8', l0: '#2f2966', l1: '#231e50', l2: '#18153c', fac: '#14112c', rim: '#8a7cff', win: '#7af0ff', fog: '#5a3a9a' },
];
const DNAMES = ['GOLDEN HOUR', 'DUSK', 'NEON NIGHT'];
const hexC = {}; const hx = (h) => hexC[h] || (hexC[h] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const mix = (a, b, t) => { const A = hx(a), Bc = hx(b); return `rgb(${(A[0] + (Bc[0] - A[0]) * t) | 0},${(A[1] + (Bc[1] - A[1]) * t) | 0},${(A[2] + (Bc[2] - A[2]) * t) | 0})`; };
const toHex = (rgb) => '#' + rgb.match(/\d+/g).map((v) => (+v).toString(16).padStart(2, '0')).join('');
function palette(m) {
  const ph = (m / 1200) % 3, i = Math.floor(ph), f = clamp((ph - i - 0.75) / 0.25, 0, 1), j = (i + 1) % 3;
  const o = {}; for (const k in PAL[0]) o[k] = mix(PAL[i][k], PAL[j][k], f); o.i = f > 0.5 ? j : i; return o;
}

function resize() {
  const w = innerWidth, h = innerHeight, dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); cv.style.width = w + 'px'; cv.style.height = h + 'px';
  const port = w < h; view.lead = port ? 0.17 : 0.27; // portrait: zoom in, runner further left so look-ahead barely shrinks
  view.s = Math.min(h / 440, w / Math.min(720, Math.max(port ? 450 : 560, w * 1.2))); view.dpr = dpr; view.cw = w; view.ch = h;
}
function render(rdt) {
  const C = ctx, m = P.x / M, pal = palette(m);
  const zoom = 1 - 0.13 * clamp((P.speed - 360) / 480, 0, 1);
  const sc = view.s * zoom; view.w = view.cw / sc; view.h = view.ch / sc;
  S.shake *= Math.pow(0.002, rdt);
  const shx = (Math.random() - 0.5) * S.shake, shy = (Math.random() - 0.5) * S.shake;
  C.setTransform(view.dpr * sc, 0, 0, view.dpr * sc, 0, 0);
  const W = view.w, Hh = view.h;
  // sky
  const g = C.createLinearGradient(0, 0, 0, Hh);
  g.addColorStop(0, pal.top); g.addColorStop(0.5, pal.mid); g.addColorStop(0.82, pal.hor); g.addColorStop(1, pal.hor);
  C.fillStyle = g; C.fillRect(0, 0, W, Hh);
  const horizon = Hh * 0.74 - (cam.y + Hh * 0.64) * 0.08;
  // stars at night
  if (pal.i === 2) { C.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 70; i++) { const x = (hash(i) * W * 1.3 - cam.x * 0.01) % W, y = hash(i + 99) * horizon * 0.7; C.fillRect((x + W) % W, y, 1.5, 1.5); } }
  // sun with synth bands
  const sx = W * 0.72, sy = horizon - 40, sr = Math.min(W, Hh) * 0.2;
  const sg = C.createRadialGradient(sx, sy, sr * 0.6, sx, sy, sr * 2.6); sg.addColorStop(0, pal.sun); sg.addColorStop(1, 'rgba(0,0,0,0)');
  C.globalAlpha = 0.35; C.fillStyle = sg; C.fillRect(0, 0, W, Hh); C.globalAlpha = 1;
  C.save(); C.beginPath(); C.arc(sx, sy, sr, 0, Math.PI * 2); C.clip();
  const sg2 = C.createLinearGradient(0, sy - sr, 0, sy + sr); sg2.addColorStop(0, '#fff6c8'); sg2.addColorStop(1, pal.sun);
  C.fillStyle = sg2; C.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  C.fillStyle = pal.hor; for (let k = 0; k < 6; k++) { const yy = sy + sr * (0.15 + k * 0.15), hh = 2 + k * 1.6; C.fillRect(sx - sr, yy, sr * 2, hh); }
  C.restore();
  // clouds
  C.fillStyle = 'rgba(255,200,220,0.16)';
  for (let i = -1; i < 6; i++) {
    const span = 520, off = cam.x * 0.04, k = Math.floor(off / span) + i, x = k * span - off, y = horizon * (0.2 + hash(k) * 0.45);
    const w = 160 + hash(k + 7) * 200; C.beginPath(); C.ellipse(x, y, w, 9 + hash(k + 3) * 8, 0, 0, Math.PI * 2); C.ellipse(x + w * 0.4, y - 8, w * 0.5, 8, 0, 0, Math.PI * 2); C.fill();
  }
  // parallax skylines
  skyline(C, 0.1, horizon + 20, 90, 70, 150, pal.l0, null, 11, W);
  skyline(C, 0.22, horizon + 60, 110, 60, 200, pal.l1, pal.win, 23, W);
  skyline(C, 0.4, horizon + 120, 130, 80, 260, pal.l2, pal.win, 37, W);
  const fg = C.createLinearGradient(0, horizon - 60, 0, Hh); fg.addColorStop(0, 'rgba(0,0,0,0)'); fg.addColorStop(1, pal.fog.replace('rgb', 'rgba').replace(')', ',0.35)'));
  C.fillStyle = fg; C.fillRect(0, horizon - 60, W, Hh);

  // world
  C.save(); C.translate(-cam.x + shx, -cam.y + shy);
  for (const b of B) if (b.x < cam.x + W + 50 && b.x + b.w > cam.x - 50) drawBuilding(C, b, pal);
  // best marker
  if (S.best > 20) { const bx = S.best * M, bb = under(bx); if (bb && bx > cam.x && bx < cam.x + W) { C.fillStyle = '#3dffc8'; C.fillRect(bx - 1.5, bb.y - 130, 3, 130); C.fillRect(bx, bb.y - 130, 34, 18); C.fillStyle = '#0d1a1a'; C.font = '900 11px "Arial Black", sans-serif'; C.fillText('BEST', bx + 3, bb.y - 117); } }
  // coins
  for (const c of coins) {
    if (c.got || c.x < cam.x - 30 || c.x > cam.x + W + 30) continue;
    const sw = Math.abs(Math.cos(S.t * 5 + c.x * 0.01));
    C.fillStyle = '#b8741a'; C.beginPath(); C.ellipse(c.x, c.y + 1.5, 9 * sw + 1.5, 9.5, 0, 0, Math.PI * 2); C.fill();
    C.fillStyle = '#ffd23f'; C.beginPath(); C.ellipse(c.x, c.y, 9 * sw + 1, 9, 0, 0, Math.PI * 2); C.fill();
    C.fillStyle = '#fff3a0'; C.beginPath(); C.ellipse(c.x - 2 * sw, c.y - 2, 3 * sw + 0.5, 4, 0, 0, Math.PI * 2); C.fill();
  }
  // motion ghosts at speed
  const sf = clamp((P.speed - 520) / 300, 0, 1);
  if (sf > 0 && !P.dead) { C.globalAlpha = 0.15 * sf; for (let k = 1; k <= 2; k++) drawPlayer(C, P.x - k * 18, k * 0.04); C.globalAlpha = 1; }
  drawPlayer(C, P.x, 0);
  // tower front facade (drawn over the player so the floor reads as "inside")
  for (const b of B) if (b.tower && b.x < cam.x + W + 50 && b.x + b.w > cam.x - 50) towerFront(C, b, pal);
  // particles
  for (const p of parts) {
    const a = clamp(p.life / p.max, 0, 1); C.globalAlpha = a;
    C.fillStyle = p.c;
    if (p.shard) { C.save(); C.translate(p.x, p.y); C.rotate(p.rot); C.beginPath(); C.moveTo(-p.s, -p.s * 0.4); C.lineTo(p.s, 0); C.lineTo(-p.s * 0.3, p.s * 0.6); C.closePath(); C.fill(); C.restore(); }
    else if (p.dust) { C.beginPath(); C.arc(p.x, p.y, p.s * (1.6 - a * 0.6), 0, Math.PI * 2); C.fill(); }
    else C.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
  }
  C.globalAlpha = 1;
  // tutorial prompts on the first runs
  if (S.hint && !P.dead) hints(C);
  // pops
  C.textAlign = 'center';
  for (const p of pops) {
    const a = clamp(p.life / 0.3, 0, 1), s = p.big * (1 + Math.max(0, p.life - 0.75) * 2.5);
    C.globalAlpha = a; C.font = `900 ${Math.round(16 * s)}px "Arial Black", "Segoe UI Black", sans-serif`;
    C.lineWidth = 4; C.strokeStyle = '#1a0d24'; C.strokeText(p.text, p.x, p.y); C.fillStyle = p.col; C.fillText(p.text, p.x, p.y);
  }
  C.globalAlpha = 1; C.textAlign = 'left';
  C.restore();

  // speed lines
  if (sf > 0 && !P.dead) {
    C.strokeStyle = `rgba(255,240,220,${0.18 * sf})`; C.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) { const y = hash(i * 13 + ((S.t * 9) | 0)) * Hh, x = ((hash(i) * W * 2 - S.t * 2400) % (W * 1.5) + W * 1.5) % (W * 1.5) - W * 0.25, l = 60 + hash(i + 5) * 140; C.beginPath(); C.moveTo(x, y); C.lineTo(x + l, y); C.stroke(); }
  }
  // vignette
  const vg = C.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.45, W / 2, Hh / 2, Math.max(W, Hh) * 0.8);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(10,0,20,0.45)'); C.fillStyle = vg; C.fillRect(0, 0, W, Hh);
  // district banner
  if (pal.i !== S.district) { S.district = pal.i; S.banner = 2.4; }
  if (S.banner > 0) {
    S.banner -= rdt; const a = clamp(Math.min(S.banner, 2.4 - S.banner) * 3, 0, 1);
    C.globalAlpha = a; C.textAlign = 'center'; C.font = '900 28px "Arial Black", sans-serif'; C.fillStyle = '#fff'; C.fillText(DNAMES[pal.i], W / 2, Hh * 0.3);
    C.font = '700 12px system-ui, sans-serif'; C.fillText('DISTRICT ' + (Math.floor(m / 1200) + 1), W / 2, Hh * 0.3 + 20); C.globalAlpha = 1; C.textAlign = 'left';
  }
}
function skyline(C, f, base, sp, wmin, hmax, col, win, salt, W) {
  const off = cam.x * f, y0 = base - (cam.y + view.h * 0.64) * f * 0.6;
  const i0 = Math.floor(off / sp) - 1, i1 = i0 + Math.ceil(W / sp) + 3;
  C.fillStyle = col;
  for (let i = i0; i < i1; i++) {
    const x = i * sp - off + hash(i * salt) * 30, w = wmin + hash(i * salt + 1) * (sp - 10), h = 40 + hash(i * salt + 2) * hmax;
    C.fillRect(x, y0 - h, w, view.h);
    const r = hash(i * salt + 3);
    if (r < 0.25) C.fillRect(x + w * 0.45, y0 - h - 30, 3, 30);
    else if (r < 0.4) { C.beginPath(); C.moveTo(x, y0 - h); C.lineTo(x + w / 2, y0 - h - 22); C.lineTo(x + w, y0 - h); C.fill(); }
  }
  if (!win) return;
  C.fillStyle = win; C.globalAlpha = f > 0.3 ? 0.55 : 0.35;
  for (let i = i0; i < i1; i++) {
    const x = i * sp - off + hash(i * salt) * 30, w = wmin + hash(i * salt + 1) * (sp - 10), h = 40 + hash(i * salt + 2) * hmax;
    for (let yy = y0 - h + 10; yy < y0 + 60; yy += 14) for (let xx = x + 6; xx < x + w - 6; xx += 11)
      if (hash((xx * 7 + yy * 131 + i * salt) | 0) < 0.13) C.fillRect(xx, yy, 4, 6);
  }
  C.globalAlpha = 1;
}
const STYLE_TINT = ['#000000', '#3a1420', '#10283a', '#2a2a2a'];
function drawBuilding(C, b, pal) {
  const bottom = cam.y + view.h + 40, fac = mix(toHex(pal.fac), STYLE_TINT[b.style], 0.35);
  // back furniture
  for (const d of b.deco) decoDraw(C, d, b.y, pal);
  C.fillStyle = fac; C.fillRect(b.x, b.y, b.w, bottom - b.y);
  // windows
  const x0 = Math.max(b.x + 20, cam.x - 40 - ((cam.x - b.x) % 44)), x1 = Math.min(b.x + b.w - 30, cam.x + view.w + 40);
  for (let yy = b.y + 34; yy < bottom; yy += 54) for (let xx = x0; xx < x1; xx += 44) {
    const hsh = hash(((xx | 0) * 3 + (yy | 0) * 977 + b.id) | 0);
    C.fillStyle = hsh < 0.3 ? pal.win : 'rgba(0,0,0,0.28)';
    C.globalAlpha = hsh < 0.3 ? 0.55 + hsh : 1;
    C.fillRect(xx, yy, 20, 28);
  }
  C.globalAlpha = 1;
  C.fillStyle = 'rgba(0,0,0,0.25)'; C.fillRect(b.x, b.y, 10, bottom - b.y);
  // parapet + rim light
  C.fillStyle = mix('#5a4070', '#000000', 0.2); C.fillRect(b.x - 4, b.y - 4, b.w + 8, 12);
  C.fillStyle = pal.rim; C.fillRect(b.x - 4, b.y - 4, b.w + 8, 2.5);
  C.fillStyle = 'rgba(0,0,0,0.35)'; C.fillRect(b.x - 4, b.y + 8, b.w + 8, 4);
  // tower interior floor
  if (b.tower) towerBack(C, b, pal);
  for (const o of b.obs) (o.t === 'box' ? boxDraw : signDraw)(C, o, b.y, pal);
}
function decoDraw(C, d, y, pal) {
  C.fillStyle = pal.l2; C.save(); C.translate(d.x, y); C.scale(d.s, d.s);
  if (d.k === 0) { // water tower
    C.fillRect(-20, -48, 3, 48); C.fillRect(17, -48, 3, 48); C.fillRect(-20, -30, 40, 2);
    C.fillRect(-24, -96, 48, 50); C.beginPath(); C.moveTo(-27, -96); C.lineTo(0, -118); C.lineTo(27, -96); C.fill();
    C.fillStyle = 'rgba(255,255,255,0.06)'; for (let i = -20; i < 24; i += 8) C.fillRect(i, -96, 2, 50);
  } else if (d.k === 1) { // antenna
    C.fillRect(-2, -130, 4, 130); C.fillRect(-14, -100, 28, 3); C.fillRect(-9, -70, 18, 3);
    C.fillStyle = Math.sin(S.t * 4 + d.x) > 0 ? '#ff4040' : '#601010'; C.fillRect(-3, -134, 6, 6);
  } else { C.fillRect(-26, -44, 52, 44); C.fillStyle = 'rgba(0,0,0,0.25)'; C.fillRect(-8, -32, 16, 32); }
  C.restore();
}
function boxDraw(C, o, y, pal) {
  const x = o.x, t = y - o.h;
  C.fillStyle = '#120a1c'; C.fillRect(x - 2, t - 2, o.w + 4, o.h + 2);
  if (o.k === 0) { // AC unit
    C.fillStyle = '#9aa6c4'; C.fillRect(x, t, o.w, o.h);
    C.fillStyle = '#6b7594'; C.fillRect(x, t + o.h * 0.75, o.w, o.h * 0.25);
    C.fillStyle = '#3b4260'; C.beginPath(); C.arc(x + o.w / 2, t + o.h * 0.42, o.h * 0.3, 0, Math.PI * 2); C.fill();
    C.strokeStyle = '#9aa6c4'; C.lineWidth = 2; const a = S.t * 14; C.beginPath(); C.moveTo(x + o.w / 2 + Math.cos(a) * o.h * 0.27, t + o.h * 0.42 + Math.sin(a) * o.h * 0.27); C.lineTo(x + o.w / 2 - Math.cos(a) * o.h * 0.27, t + o.h * 0.42 - Math.sin(a) * o.h * 0.27); C.stroke();
  } else if (o.k === 1) { // crates
    C.fillStyle = '#d98b3a'; C.fillRect(x, t, o.w, o.h);
    C.strokeStyle = '#8a4f1c'; C.lineWidth = 3; C.strokeRect(x + 3, t + 3, o.w - 6, o.h - 6); C.beginPath(); C.moveTo(x + 3, t + 3); C.lineTo(x + o.w - 3, y - 3); C.stroke();
  } else { // vent stack with hazard stripes
    C.fillStyle = '#c9c2b8'; C.fillRect(x, t, o.w, o.h);
    C.save(); C.beginPath(); C.rect(x, y - 10, o.w, 10); C.clip(); C.fillStyle = '#ffd23f'; C.fillRect(x, y - 10, o.w, 10); C.fillStyle = '#1a1a1a';
    for (let i = -10; i < o.w + 10; i += 12) { C.beginPath(); C.moveTo(x + i, y); C.lineTo(x + i + 6, y); C.lineTo(x + i + 16, y - 10); C.lineTo(x + i + 10, y - 10); C.fill(); }
    C.restore(); C.fillStyle = '#8f877c'; for (let i = 0; i < 3; i++) C.fillRect(x + 5, t + 6 + i * 7, o.w - 10, 3);
  }
  C.fillStyle = pal.rim; C.globalAlpha = 0.8; C.fillRect(x, t, o.w, 2.5); C.globalAlpha = 1;
}
function signDraw(C, o, y, pal) {
  const x = o.x, top = y - SIGN_HI, bot = y - SIGN_LO;
  C.fillStyle = pal.l2; C.fillRect(x + o.w * 0.2, bot, 5, SIGN_LO); C.fillRect(x + o.w * 0.8 - 5, bot, 5, SIGN_LO); // back legs (behind the runner lane)
  C.fillStyle = '#120a1c'; C.fillRect(x - 3, top - 3, o.w + 6, bot - top + 6);
  C.fillStyle = '#241634'; C.fillRect(x, top, o.w, bot - top);
  // hazard bottom edge = "duck under here"
  C.save(); C.beginPath(); C.rect(x, bot - 9, o.w, 9); C.clip(); C.fillStyle = '#ff3d3d'; C.fillRect(x, bot - 9, o.w, 9); C.fillStyle = '#fff';
  for (let i = -10; i < o.w + 10; i += 14) { C.beginPath(); C.moveTo(x + i, bot); C.lineTo(x + i + 7, bot); C.lineTo(x + i + 16, bot - 9); C.lineTo(x + i + 9, bot - 9); C.fill(); }
  C.restore();
  // neon text, vertical stack if narrow
  const flick = Math.sin(S.t * 30 + o.x) > -0.95 ? 1 : 0.4;
  C.save(); C.translate(x + o.w / 2, (top + bot - 9) / 2); C.rotate(-Math.PI / 2); C.textAlign = 'center'; C.textBaseline = 'middle';
  const fs = Math.min(o.w * 0.5, 150 / o.txt.length * 1.5, 30);
  C.font = `900 ${fs}px "Arial Black", sans-serif`;
  C.globalAlpha = 0.35 * flick; C.fillStyle = o.col; for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) C.fillText(o.txt, dx, dy);
  C.globalAlpha = flick; C.fillStyle = '#fff'; C.fillText(o.txt, 0, 0);
  C.globalAlpha = 0.6 * flick; C.fillStyle = o.col; C.fillText(o.txt, 0, 0);
  C.restore(); C.globalAlpha = 1;
  C.strokeStyle = o.col; C.lineWidth = 2; C.globalAlpha = 0.8 * flick; C.strokeRect(x + 4, top + 4, o.w - 8, bot - top - 17); C.globalAlpha = 1;
}
function towerBack(C, b, pal) {
  const T = b.tower, y = b.y, t = y - CEIL;
  const g = C.createLinearGradient(0, t, 0, y); g.addColorStop(0, '#ffe2a8'); g.addColorStop(1, '#d9875a');
  C.fillStyle = g; C.fillRect(T.x0, t, T.x1 - T.x0, CEIL);
  C.fillStyle = 'rgba(80,30,40,0.35)';
  for (let x = T.x0 + 40; x < T.x1 - 40; x += 90) { C.fillRect(x, y - 30, 40, 4); C.fillRect(x + 4, y - 26, 3, 26); C.fillRect(x + 33, y - 26, 3, 26); C.fillRect(x + 12, y - 48, 16, 14); }
  C.fillStyle = '#fff8d8'; for (let x = T.x0 + 30; x < T.x1 - 20; x += 70) C.fillRect(x, t + 2, 30, 4);
}
function towerFront(C, b, pal) {
  const T = b.tower, y = b.y, t = y - CEIL, top = cam.y - 40;
  const fac = mix(toHex(pal.l2), '#000000', 0.15);
  C.fillStyle = '#120a1c'; C.fillRect(T.x0 - 4, top, T.x1 - T.x0 + 8, t - top + 2);
  C.fillStyle = pal.fac; C.fillRect(T.x0, top, T.x1 - T.x0, t - top);
  C.fillStyle = 'rgba(255,255,255,0.05)'; C.fillRect(T.x0, top, 12, t - top);
  for (let yy = t - 60; yy > top; yy -= 54) for (let xx = T.x0 + 22; xx < T.x1 - 30; xx += 44) { const hsh = hash(((xx | 0) * 5 + (yy | 0) * 31 + b.id) | 0); C.fillStyle = hsh < 0.4 ? pal.win : 'rgba(0,0,0,0.3)'; C.globalAlpha = hsh < 0.4 ? 0.7 : 1; C.fillRect(xx, yy, 20, 30); }
  C.globalAlpha = 1;
  C.fillStyle = pal.rim; C.fillRect(T.x0 - 4, t - 6, T.x1 - T.x0 + 8, 6);
  C.fillStyle = fac; C.fillRect(T.x0 - 4, y - 2, T.x1 - T.x0 + 8, 4);
  // glass panes
  for (const [gx, broken] of [[T.x0, T.b0], [T.x1, T.b1]]) {
    C.fillStyle = '#120a1c'; C.fillRect(gx - 5, t, 10, 6); C.fillRect(gx - 5, y - 6, 10, 6);
    if (!broken) {
      C.fillStyle = 'rgba(160,225,255,0.55)'; C.fillRect(gx - 4, t, 8, CEIL);
      C.fillStyle = 'rgba(255,255,255,0.85)'; C.fillRect(gx - 2, t + 10, 2, CEIL * 0.5);
      C.strokeStyle = '#120a1c'; C.lineWidth = 2; C.strokeRect(gx - 4, t, 8, CEIL);
    } else {
      C.fillStyle = 'rgba(160,225,255,0.6)';
      C.beginPath(); C.moveTo(gx - 4, t); C.lineTo(gx + 4, t); C.lineTo(gx, t + 16); C.fill();
      C.beginPath(); C.moveTo(gx - 4, y); C.lineTo(gx + 4, y); C.lineTo(gx - 1, y - 12); C.fill();
    }
  }
}
function drawPlayer(C, x, ghost) {
  let pose = 'run';
  if (P.dead && P.dead !== 'fall') pose = 'air';
  else if (P.slide) pose = 'slide';
  else if (!P.ground) pose = 'air';
  const sq = P.sq;
  C.save(); C.translate(x, P.y);
  if (P.rot) { C.translate(0, -30); C.rotate(P.rot); C.translate(0, 30); }
  C.scale(1 + sq * 0.6, 1 - sq);
  drawRunner(C, P.rd, pose, P.phase - ghost * 20, S.t, P.vy);
  C.restore();
}
function hints(C) {
  const b = under(P.x); if (!b) return;
  const tip = (text, x, y) => { C.font = '900 15px "Arial Black", sans-serif'; C.textAlign = 'center'; const a = 0.6 + 0.4 * Math.sin(S.t * 10); C.globalAlpha = a; C.lineWidth = 4; C.strokeStyle = '#1a0d24'; C.strokeText(text, x, y); C.fillStyle = '#fff'; C.fillText(text, x, y); C.globalAlpha = 1; C.textAlign = 'left'; };
  const touch = matchMedia('(pointer: coarse)').matches;
  const next = b.obs.find((o) => o.x + o.w > P.x);
  if (next && next.x - P.x < 420) tip(next.t === 'box' ? (touch ? 'TAP = JUMP' : 'TAP SPACE = JUMP') : (touch ? 'HOLD = SLIDE' : 'HOLD SPACE = SLIDE'), next.x + next.w / 2, b.y - (next.t === 'box' ? 120 : 240));
  else if (b.x + b.w - P.x < 420 && b.x + b.w - P.x > 0) tip('JUMP THE GAP!', b.x + b.w, b.y - 120);
  else if (b.tower && !b.tower.b0 && b.tower.x0 - P.x < 450) tip('SMASH THROUGH!', b.tower.x0, b.y - CEIL - 30);
  if (P.x / M > 260) S.hint = 0;
}

// ---------- HUD + screens ----------
function hud() {
  $('dist').textContent = Math.floor(Math.max(0, P.x) / M) + ' m';
  $('coins').textContent = S.coins;
  $('best').textContent = 'BEST ' + save.best + ' m';
  const cm = $('combo');
  if (S.combo >= 2) { cm.style.opacity = 1; cm.textContent = 'COMBO x' + S.combo + (coinMult() > 1 ? '  ·  COINS x' + coinMult() : ''); cm.style.setProperty('--w', clamp(S.comboT / 3.2, 0, 1)); }
  else cm.style.opacity = 0;
}
function show(id) { for (const p of ['title', 'dead', 'shop']) $(p).classList.toggle('hidden', p !== id); $('hud').classList.toggle('hidden', id === 'title' || id === 'shop'); }
function endRun() {
  S.deadShown = true; S.mode = 'dead';
  const m = Math.floor(Math.max(0, P.x) / M), nb = m > save.best;
  save.best = Math.max(save.best, m); save.coins += S.coins; save.runs++; persist();
  $('dTitle').textContent = P.dead === 'fall' ? 'YOU FELL' : 'WIPEOUT';
  $('dDist').textContent = m + ' m';
  $('dBest').textContent = nb ? 'NEW BEST!' : 'BEST ' + save.best + ' m';
  $('dBest').classList.toggle('nb', nb);
  $('dCoins').textContent = '+' + S.coins;
  $('dBank').textContent = save.coins;
  const nxt = RUNNERS.find((r) => !save.owned.includes(r.id));
  $('dNext').textContent = nxt ? (save.coins >= nxt.cost ? nxt.name + ' is ready to unlock!' : nxt.name + ' unlocks at ' + nxt.cost + ' coins') : 'All runners unlocked';
  S.deadAt = performance.now();
  show('dead');
}
function startRun() { bot = Q.has('bot'); botS.sliding = false; newRun(); S.mode = 'play'; show(null); sfx.click(); }
function openShop(from) {
  S.shopFrom = from; show('shop');
  const list = $('shopList'); list.innerHTML = '';
  $('bank').textContent = save.coins;
  for (const r of RUNNERS) {
    const own = save.owned.includes(r.id), sel = save.sel === r.id;
    const card = document.createElement('button'); card.className = 'card' + (sel ? ' sel' : '') + (!own && save.coins < r.cost ? ' locked' : '');
    const c = document.createElement('canvas'); c.width = 120; c.height = 120; const cc = c.getContext('2d');
    cc.translate(60, 100); cc.scale(1.4, 1.4); drawRunner(cc, r, 'run', 1.2, 0, 0);
    card.appendChild(c);
    card.insertAdjacentHTML('beforeend', `<b>${r.name}</b><small>${r.perk}</small><i>${sel ? 'SELECTED' : own ? 'SELECT' : '● ' + r.cost}</i>`);
    card.onclick = () => {
      if (own) { save.sel = r.id; sfx.click(); }
      else if (save.coins >= r.cost) { save.coins -= r.cost; save.owned.push(r.id); save.sel = r.id; sfx.buy(); }
      else return;
      persist(); openShop(from);
    };
    list.appendChild(card);
  }
}

// ---------- input ----------
const isUI = (e) => e.target.closest && e.target.closest('button, .panel');
addEventListener('pointerdown', (e) => { wake(); if (isUI(e)) return; if (S.mode === 'play') { e.preventDefault(); press(); } });
addEventListener('pointerup', (e) => { if (S.mode === 'play') release(); });
addEventListener('pointercancel', () => release());
addEventListener('keydown', (e) => {
  wake();
  if (e.repeat) { if (e.code === 'Space') e.preventDefault(); return; }
  if (e.code === 'KeyM') { setMuted(!isMuted()); $('mute').textContent = isMuted() ? '🔇' : '🔊'; return; }
  if (S.mode === 'dead' && (e.code === 'Space' || e.code === 'Enter') && performance.now() - S.deadAt > 450) { e.preventDefault(); startRun(); return; }
  if (S.mode === 'title' && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); startRun(); return; }
  if (S.mode !== 'play') return;
  if (e.code === 'KeyP' || e.code === 'Escape') { S.paused = !S.paused; $('pause').classList.toggle('hidden', !S.paused); return; }
  if (e.code === 'Space') { e.preventDefault(); press(); }
  else if (e.code === 'ArrowUp' || e.code === 'KeyW') { e.preventDefault(); if (!doJump()) I.buf = 0.14; }
  else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ShiftLeft') { e.preventDefault(); I.down = true; slideOn(); }
});
addEventListener('keyup', (e) => {
  if (e.code === 'Space') release();
  else if (e.code === 'ArrowDown' || e.code === 'KeyS' || e.code === 'ShiftLeft') { I.down = false; slideOff(); }
});
addEventListener('blur', () => { I.held = false; if (P && P.slide) slideOff(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.mode === 'play') { S.paused = true; $('pause').classList.remove('hidden'); } });
$('pause').onclick = () => { S.paused = false; $('pause').classList.add('hidden'); };
$('playBtn').onclick = () => startRun();
$('retryBtn').onclick = () => startRun();
$('shopBtn').onclick = () => openShop('title');
$('dShopBtn').onclick = () => openShop('dead');
$('homeBtn').onclick = () => { S.mode = 'title'; bot = true; newRun(); show('title'); titleStats(); };
$('backBtn').onclick = () => { if (S.shopFrom === 'dead') show('dead'); else { show('title'); titleStats(); } };
$('mute').onclick = () => { wake(); setMuted(!isMuted()); $('mute').textContent = isMuted() ? '🔇' : '🔊'; };
$('mute').textContent = isMuted() ? '🔇' : '🔊';
function titleStats() { $('tBest').textContent = save.best; $('tCoins').textContent = save.coins; }

// ---------- loop ----------
resize(); addEventListener('resize', resize);
newRun();
if (Q.has('title')) { S.mode = 'title'; bot = true; show('title'); titleStats(); } else show(null);
let last = performance.now(), acc = 0;
const DT = 1 / 120;
function frame(now) {
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (!S.paused) {
    let scale = 1; if (S.slow > 0) { S.slow -= rdt; scale = 0.3; }
    acc += rdt * scale;
    let n = 0; while (acc >= DT && n < 12) { step(DT); acc -= DT; n++; }
    if (S.mode === 'title' && P.dead && P.deadT > 1) newRun(); // attract mode loops
  }
  render(rdt); hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// test hooks
window.__G = {
  get P() { return P; }, get S() { return S; }, get B() { return B; }, save, RUNNERS,
  fast(sec, dt = DT) { const n = Math.round(sec / dt); for (let i = 0; i < n; i++) { if (S.mode === 'dead') break; step(dt); } },
  setBot(v) { bot = v; }, start: startRun, press, release, newRun, endRun,
  setSeed(s) { seed = s; },
};
