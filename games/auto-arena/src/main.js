// main.js - AUTO ARENA: screens, layout, input (mouse + touch drag and drop),
// rendering of the shop and the fight, saving, and the window.__G test hooks.

import { UNIT, UNITS, TRAITS, ITEM, ITEMS, ABILITY_TEXT, STAR_MULT, BOARD_COLS, BENCH_SIZE, SHOP_SIZE, REROLL_COST, BUY_XP_COST, MAX_LEVEL, WINS_TO_WIN, START_HEARTS, TIERS, tierOf, tierIndex, ITEM_ROUNDS } from './data.js';
import * as Run from './run.js';
import { createBattle, step as simStep, SIM_DT, traitCounts, cellPos, FIGHT_SOFT } from './sim.js';
import { drawUnitAt, drawSil, icon, preload, COST_COL, unitSprite } from './art.js';
import { paperTile, rng as prng, wash, ink, rgba, shade, ellipsePts, rectPts, makeCanvas, INK, deform, tracePoly, splat } from './paint.js';
import { FX } from './fx.js';
import { initAudio, sfx, music, setMuted, isMuted } from './audio.js';
import { dailySeed, dateKey } from './rng.js';
import { botShop } from './bot.js';

const cv = document.getElementById('screen');
const g = cv.getContext('2d');
const FH = 'Fell, Georgia, serif', FB = 'Hand, "Trebuchet MS", sans-serif';
const P0 = '#f6eedb', PAPER = '#efe4cb', TEAM = ['#3a8a6a', '#c8402e'];
const params = new URLSearchParams(location.search);

let W = 0, H = 0, DPR = 1, L = {};
const S = {
  screen: 'loading', phase: 'shop', run: null, battle: null, fx: new FX(), t: 0,
  drag: null, sel: null, hot: [], mx: -1, my: -1, modal: null, banner: null, toasts: [], shake: 0,
  speed: 1, acc: 0, hitstop: 0, endT: 0, introT: 0, lastRec: null, result: null, parade: [],
  flies: [], coins: [], land: {}, goldBump: 0, goldPos: null,
};

// ---------------------------------------------------------------- save
const KEY = 'pd.auto-arena';
const DEF = { rating: 1000, peak: 1000, runs: 0, victories: 0, bestWins: 0, daily: { key: '', best: -1, plays: 0 }, muted: false, speed: 1, help: false, run: null, last: [] };
function loadSave() { try { const s = JSON.parse(localStorage.getItem(KEY) || '{}'); return { ...DEF, ...s, daily: { ...DEF.daily, ...(s.daily || {}) } }; } catch { return { ...DEF }; } }
S.save = loadSave();
function persist() {
  try { S.save.run = S.run && !S.run.over ? S.run : null; localStorage.setItem(KEY, JSON.stringify(S.save)); } catch { /* private mode */ }
}
setMuted(!!S.save.muted); S.speed = S.save.speed || 1;

// ---------------------------------------------------------------- canvas + layout
let paperPat = null, arenaArt = null, arenaKey = '';
function resize() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  cv.style.width = W + 'px'; cv.style.height = H + 'px';
  layout();
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function layout() {
  const portrait = H > W * 1.02 || W < 640;
  const pad = clamp(Math.min(W, H) * 0.015, 6, 12);
  L = { portrait, pad };
  if (portrait) {
    const topH = 46, trH = 30, itH = 30;
    let shopH = clamp(H * 0.13, 92, 120), btnH = clamp(H * 0.06, 44, 54);
    const benchSlotW = (W - pad * 2) / BENCH_SIZE;
    let benchH = Math.min(benchSlotW * 1.15, 64);
    const free = H - topH - trH - benchH - itH - shopH - btnH - pad * 8;
    const c = Math.floor(Math.min((W - pad * 2 - 14) / 5, free / 4));
    // spend leftover height on bigger shop cards and buttons, then on breathing room
    let extra = Math.max(0, free - c * 4);
    const addShop = Math.max(0, Math.min(extra * 0.5, ((W - pad * 2) / 5) * 1.5 - shopH)); shopH += addShop; extra -= addShop;
    const addBtn = Math.min(extra * 0.3, 14); btnH += addBtn; extra -= addBtn;
    const addBench = Math.min(extra * 0.3, 16); benchH += addBench; extra -= addBench;
    const gap = pad + Math.min(extra / 7, 24);
    L.top = { x: 0, y: 0, w: W, h: topH };
    L.traits = { x: pad, y: topH + gap, w: W - pad * 2, h: trH };
    L.c = c;
    L.arena = { x: Math.round((W - c * 5) / 2), y: L.traits.y + trH + gap, w: c * 5, h: c * 4 };
    L.bench = { x: pad, y: L.arena.y + L.arena.h + gap, w: W - pad * 2, h: benchH };
    L.items = { x: pad, y: L.bench.y + benchH + gap * 0.7, w: W - pad * 2, h: itH };
    L.shop = { x: pad, y: L.items.y + itH + gap * 0.7, w: W - pad * 2, h: shopH };
    L.btns = { x: pad, y: L.shop.y + shopH + gap, w: W - pad * 2, h: btnH };
    L.left = null; L.right = null;
  } else {
    const topH = H < 480 ? 42 : 52;
    const side = clamp(W * 0.19, 132, 250);
    const cx0 = side + pad * 2, cx1 = W - side - pad * 2, cw = cx1 - cx0;
    const shopH = clamp(H * 0.19, H < 520 ? 72 : 96, 150);
    const c = Math.floor(Math.min(cw / 5, (H - topH - shopH - pad * 5) / (4 + 0.85)));
    L.top = { x: 0, y: 0, w: W, h: topH };
    L.c = c;
    L.arena = { x: Math.round(cx0 + (cw - c * 5) / 2), y: topH + pad, w: c * 5, h: c * 4 };
    L.bench = { x: L.arena.x, y: L.arena.y + L.arena.h + pad, w: c * 5, h: Math.round(c * 0.85) };
    L.shop = { x: cx0, y: H - shopH - pad, w: cw, h: shopH };
    L.left = { x: pad, y: topH + pad, w: side, h: H - topH - pad * 2 };
    L.right = { x: W - side - pad, y: topH + pad, w: side, h: H - topH - pad * 2 };
    const bh = clamp(H * 0.075, 44, 62);
    L.leftBtns = { x: L.left.x, y: L.left.y + L.left.h - bh * 2 - pad, w: side, h: bh * 2 + pad, bh };
    L.items = { x: L.left.x, y: L.leftBtns.y - 44 - pad, w: side, h: 44 };
    L.traits = { x: L.left.x, y: L.left.y, w: side, h: L.items.y - L.left.y - pad };
    L.fightBtn = { x: L.right.x, y: L.right.y + L.right.h - bh * 1.3, w: side, h: bh * 1.3 };
    L.btns = null;
  }
  L.slotW = L.bench.w / BENCH_SIZE;
  S.fx.cell = L.c;
}
window.addEventListener('resize', () => { resize(); if (S.battle) { /* keep fx stains scaled: they are stored per cell */ } });

function paintArena() {
  const key = L.c + 'x' + DPR;
  if (arenaKey === key && arenaArt) return arenaArt;
  const c = L.c, w = c * 5, h = c * 4, pad = c * 0.25;
  const cvA = makeCanvas((w + pad * 2) * DPR, (h + pad * 2) * DPR);
  const a = cvA.getContext('2d'); a.scale(DPR, DPR); a.translate(pad, pad);
  const R = prng(42);
  // the field: two soft washes meeting at the middle line
  wash(a, rectPts(-pad * 0.4, -pad * 0.4, w + pad * 0.8, h / 2 + pad * 0.4), '#e9c8b8', R, { layers: 14, alpha: 0.07, amt: 0.08, edge: 0.4 });
  wash(a, rectPts(-pad * 0.4, h / 2, w + pad * 0.8, h / 2 + pad * 0.4), '#bcd9c4', R, { layers: 14, alpha: 0.08, amt: 0.08, edge: 0.4 });
  // cells
  for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) {
    const col = y < 2 ? '#d9a898' : '#93bfa2';
    wash(a, ellipsePts(x * c + c / 2, y * c + c * 0.78, c * 0.36, c * 0.13, 14), col, R, { layers: 5, alpha: 0.13, amt: 0.12, edge: 0.6, depth: 1, layerDepth: 1 });
  }
  // grid lines, very light
  a.strokeStyle = 'rgba(42,34,48,0.08)'; a.lineWidth = 1;
  for (let x = 1; x < 5; x++) { a.beginPath(); a.moveTo(x * c, 4); a.lineTo(x * c, h - 4); a.stroke(); }
  for (let y = 1; y < 4; y++) if (y !== 2) { a.beginPath(); a.moveTo(4, y * c); a.lineTo(w - 4, y * c); a.stroke(); }
  ink(a, [{ x: 0, y: h / 2 }, { x: w, y: h / 2 }], R, { w: 1.6, jitter: 0.2, alpha: 0.6 });
  // frame
  ink(a, rectPts(-pad * 0.35, -pad * 0.35, w + pad * 0.7, h + pad * 0.7), R, { w: 2, jitter: 0.25, closed: true, alpha: 0.7 });
  // grass tufts along the edges
  for (let i = 0; i < 26; i++) {
    const side = i % 2, x = side ? -pad * 0.35 + R() * pad * 0.2 : w + pad * 0.15 + R() * pad * 0.2, y = R() * h;
    for (let k = 0; k < 3; k++) ink(a, [{ x, y }, { x: x + (k - 1) * 3, y: y - 6 - R() * 5 }], R, { w: 1, color: '#5a7a4a', jitter: 0.1 });
  }
  arenaArt = { cv: cvA, pad }; arenaKey = key;
  return arenaArt;
}

// ---------------------------------------------------------------- draw helpers
function T(s, x, y, size, col = INK, align = 'left', font = FB, o = {}) {
  g.font = `${o.bold ? 'bold ' : ''}${Math.round(size)}px ${font}`;
  if (!['left','right','center'].includes(align) && !T.warned) { T.warned = 1; console.log('BAD ALIGN ' + new Error().stack); }
  g.textAlign = align; g.textBaseline = o.base || 'alphabetic';
  if (o.stroke) { g.lineJoin = 'round'; g.lineWidth = o.sw || size * 0.2; g.strokeStyle = o.stroke; g.strokeText(s, x, y); }
  g.fillStyle = col; g.fillText(s, x, y);
  if (o.max) { /* measure only */ }
}
function fitT(s, x, y, size, maxW, col, align = 'left', font = FB, o = {}) {
  g.font = `${o.bold ? 'bold ' : ''}${Math.round(size)}px ${font}`;
  let sz = size; while (sz > 8 && g.measureText(s).width > maxW) { sz -= 1; g.font = `${o.bold ? 'bold ' : ''}${Math.round(sz)}px ${font}`; }
  T(s, x, y, sz, col, align, font, o);
}
function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
function panel(x, y, w, h, o = {}) {
  g.save();
  if (o.shadow !== false) { g.fillStyle = 'rgba(60,40,30,0.18)'; rr(x + 2, y + 3, w, h, o.r ?? 10); g.fill(); }
  rr(x, y, w, h, o.r ?? 10);
  const gr = g.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, o.fill || P0); gr.addColorStop(1, o.fill2 || shadeHex(o.fill || P0, -0.06));
  g.fillStyle = gr; g.fill();
  if (o.tint) { g.fillStyle = rgba(o.tint, o.tintA ?? 0.12); g.fill(); }
  g.strokeStyle = o.stroke || 'rgba(42,34,48,0.75)'; g.lineWidth = o.lw ?? 1.6; g.stroke();
  g.restore();
}
function shadeHex(h, f) { const c = shade(h, f); return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`; }
function hit(x, y, w, h, fn, o = {}) { S.hot.push({ x, y, w, h, fn, ...o }); }
const inR = (px, py, r) => r && px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
function hovering(x, y, w, h) { return S.mx >= x && S.mx <= x + w && S.my >= y && S.my <= y + h; }
function button(x, y, w, h, label, fn, o = {}) {
  const hov = hovering(x, y, w, h) && !o.disabled;
  const col = o.disabled ? '#cfc6b4' : (o.col || '#e8d3a8');
  const lift = hov ? -2 : 0;
  g.save();
  g.fillStyle = 'rgba(42,34,48,0.55)'; rr(x, y + 3, w, h, o.r ?? 12); g.fill();
  rr(x, y + lift, w, h, o.r ?? 12);
  const gr = g.createLinearGradient(x, y, x, y + h);
  gr.addColorStop(0, shadeHex(col, 0.18)); gr.addColorStop(1, col);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = INK; g.lineWidth = 2; g.stroke();
  let size = o.size || Math.min(h * 0.42, 26);
  if (o.icon && label) { g.font = `${size}px ${o.font || FH}`; while (size > 9 && size + 6 + g.measureText(label).width > w - 12) { size -= 1; g.font = `${size}px ${o.font || FH}`; } }
  const tc = o.disabled ? 'rgba(42,34,48,0.45)' : (o.tc || INK);
  let tx = x + w / 2;
  if (o.icon) {
    const ir = size * 0.5;
    const total = ir * 2 + 6 + (label ? (g.font = `${size}px ${o.font || FH}`, g.measureText(label).width) : 0);
    const ix = x + w / 2 - total / 2 + ir;
    icon(g, o.icon, ix, y + h / 2 + lift - (o.sub ? size * 0.3 : 0), ir, tc, o.iconFill);
    tx = ix + ir + 6; g.textAlign = 'left';
    if (label) T(label, tx, y + h / 2 + size * 0.36 + lift - (o.sub ? size * 0.3 : 0), size, tc, 'left', o.font || FH);
  } else if (label) fitT(label, tx, y + h / 2 + size * 0.36 + lift - (o.sub ? size * 0.3 : 0), size, w - 10, tc, 'center', o.font || FH);
  if (o.sub) fitT(o.sub, x + w / 2, y + h / 2 + size * 0.95 + lift, size * 0.62, w - 8, tc, 'center', FB);
  g.restore();
  if (!o.disabled) hit(x, y, w, h, fn, { key: o.key });
  else hit(x, y, w, h, () => { sfx('deny'); if (o.why) toast(o.why); }, {});
}
function toast(text, col = INK) { S.toasts.push({ text, col, t: 0 }); if (S.toasts.length > 3) S.toasts.shift(); }
function banner(big, small, col = INK, dur = 1.4) { S.banner = { big, small, col, t: 0, dur }; }
function starRow(x, y, n, r) {
  const col = n === 3 ? '#e8b83a' : n === 2 ? '#c8ccd8' : '#c89060';
  for (let i = 0; i < n; i++) icon(g, 'star', x + (i - (n - 1) / 2) * r * 1.9, y, r, INK, col);
}

// ---------------------------------------------------------------- geometry
const slotRect = i => { const c = L.c; const col = i % BOARD_COLS, row = Math.floor(i / BOARD_COLS); return { x: L.arena.x + col * c, y: L.arena.y + (2 + row) * c, w: c, h: c }; };
const benchRect = i => ({ x: L.bench.x + i * L.slotW, y: L.bench.y, w: L.slotW, h: L.bench.h });
function shopCardRect(i) {
  const s = L.shop, gap = Math.max(4, s.w * 0.012), w = (s.w - gap * (SHOP_SIZE - 1)) / SHOP_SIZE;
  return { x: s.x + i * (w + gap), y: s.y, w, h: s.h };
}
function itemRect(i) { const r = L.items, s = Math.min(r.h, 40); return { x: r.x + 4 + i * (s + 6), y: r.y + (r.h - s) / 2, w: s, h: s }; }
function locAt(px, py) {
  for (let i = 0; i < Run.BOARD_SLOTS; i++) if (inR(px, py, slotRect(i))) return { zone: 'board', idx: i };
  for (let i = 0; i < BENCH_SIZE; i++) if (inR(px, py, benchRect(i))) return { zone: 'bench', idx: i };
  return null;
}

// ---------------------------------------------------------------- run control
function startRun(o = {}) {
  initAudio();
  const daily = !!o.daily;
  S.run = Run.newRun({ seed: daily ? dailySeed() : (o.seed ?? ((Math.random() * 1e9) | 0)), daily, rating: S.save.rating });
  S.screen = 'game'; S.phase = 'shop'; S.battle = null; S.sel = null; S.modal = null; S.result = null;
  S.fx.reset(L.c);
  banner('Round 1', `${Run.opponent(S.run).name} awaits`, INK, 1.6);
  music('shop'); sfx('bell');
  S.save.help = true; // the coach arrow teaches the first run; How to play stays in the menu
  persist();
}
function continueRun() {
  initAudio();
  S.run = S.save.run; Run.syncIds(S.run); S.screen = 'game'; S.phase = 'shop'; S.battle = null; S.sel = null; S.modal = S.run.itemChoice ? 'items' : null;
  S.fx.reset(L.c); music('shop');
}
function startFight() {
  const run = S.run; if (!run || S.phase !== 'shop' || S.modal) return;
  Run.autoFill(run);
  if (!Run.boardCount(run)) { toast('Put at least one unit on the board!', '#c8402e'); sfx('deny'); return; }
  const opp = Run.opponent(run);
  S.battle = createBattle(Run.boardTeam(run), opp.team || [], run.seed + run.round * 7919);
  S.phase = 'fight'; S.sel = null; S.drag = null; S.acc = 0; S.endT = 0; S.introT = 0.9; S.hitstop = 0;
  S.fx.reset(L.c);
  banner(`Round ${run.round}`, `vs ${opp.name}`, opp.col, 1.0);
  music('fight'); sfx('bell');
}
function endFight() {
  const run = S.run, b = S.battle;
  const rec = Run.finishRound(run, b.winner);
  if (run.round > 2 && !S.save.coached) S.save.coached = true;
  S.lastRec = rec;
  if (run.over) { finishRun(); return; }
  S.phase = 'shop'; S.battle = null; S.fx.reset(L.c);
  if (S.sel && S.sel.kind === 'fighter') S.sel = null;
  const inc = rec.income;
  coinShower(W / 2, L.arena.y + L.arena.h * 0.5, inc.total);
  toast(`+${inc.total} gold  (${inc.base} pay${inc.interest ? ` +${inc.interest} interest` : ''}${inc.streak ? ` +${inc.streak} streak` : ''}${inc.win ? ' +1 win' : ''})`, '#8a5a1a');
  if (run.itemChoice) S.modal = 'items';
  banner(`Round ${run.round}`, `Next: ${Run.opponent(run).name}`, INK, 1.2);
  music('shop');
  persist();
}
function finishRun() {
  const run = S.run, sv = S.save;
  const delta = run.daily ? 0 : Run.ratingDelta(run);
  const before = sv.rating;
  if (!run.daily) { sv.rating = Math.max(0, sv.rating + delta); sv.peak = Math.max(sv.peak, sv.rating); }
  sv.runs++; if (run.victory) sv.victories++;
  sv.bestWins = Math.max(sv.bestWins, run.wins);
  if (run.daily) { const k = dateKey(); if (sv.daily.key !== k) sv.daily = { key: k, best: -1, plays: 0 }; sv.daily.plays++; sv.daily.best = Math.max(sv.daily.best, run.wins); }
  sv.last = [{ wins: run.wins, round: run.round, victory: run.victory, daily: run.daily, delta }, ...(sv.last || [])].slice(0, 8);
  // most valuable unit of the final fight
  let mvp = null; if (S.battle) for (const u of S.battle.units) if (u.side === 0 && !u.summoned && (!mvp || u.dealt > mvp.dealt)) mvp = u;
  S.result = { victory: run.victory, wins: run.wins, losses: run.losses, round: run.round, delta, before, after: sv.rating, daily: run.daily, board: run.board.filter(Boolean).map(u => ({ id: u.id, star: u.star })), mvp: mvp && { id: mvp.id, star: mvp.star, dealt: mvp.dealt | 0 }, t: 0, stats: run.stats };
  S.screen = 'results'; S.phase = 'shop'; S.battle = null; S.modal = null;
  sfx(run.victory ? 'fanfare' : 'lose'); music('title');
  S.run = null; persist();
}

// ---------------------------------------------------------------- shop actions (with sound + juice)
function doBuy(slot, to = null, dragged = false) {
  const run = S.run, id = run.shop[slot];
  if (!id) return;
  if (run.gold < UNIT[id].cost) { sfx('deny'); toast('Not enough gold'); return; }
  const cr = shopCardRect(slot);
  const res = Run.buy(run, slot, to);
  if (!res.ok) { sfx('deny'); toast('Bench is full - sell something or put units on the board'); return; }
  sfx('buy');
  // the bought unit hops from its card to its seat (or to where it merged)
  const m0 = res.merged[res.merged.length - 1];
  const dest = m0 ? m0.loc : locOfNid(res.unit.nid);
  if (dest && dest.zone !== 'limbo' && !(dragged && !m0)) {
    const r = dest.zone === 'board' ? slotRect(dest.idx) : benchRect(dest.idx);
    const toY = dest.zone === 'board' ? r.y + L.c * 0.8 : r.y + r.h * 0.78;
    const nid = m0 ? m0.nid : res.unit.nid;
    S.flies.push({ id, nid, x0: cr.x + cr.w / 2, y0: cr.y + cr.h * 0.76, x1: r.x + r.w / 2, y1: toY, s0: Math.min(cr.w * 1.25, cr.h * 0.95), s1: dest.zone === 'board' ? L.c : Math.min(r.w * 1.15, r.h * 1.1), t: 0, dur: 0.26, delayMerge: !!m0 });
  }
  for (const m of res.merged) celebrateMerge(m);
  persist();
}
function locOfNid(nid) {
  const run = S.run;
  let i = run.bench.findIndex(u => u && u.nid === nid); if (i >= 0) return { zone: 'bench', idx: i };
  i = run.board.findIndex(u => u && u.nid === nid); if (i >= 0) return { zone: 'board', idx: i };
  return null;
}
// gold coins that fly up to the purse when you sell or get paid
function coinShower(x, y, n) {
  const gp = S.goldPos || { x: W / 2, y: 26 };
  for (let i = 0; i < Math.min(n, 12); i++) S.coins.push({ x0: x + (Math.random() - 0.5) * 30, y0: y + (Math.random() - 0.5) * 20, x1: gp.x, y1: gp.y, t: -i * 0.05, dur: 0.5 + Math.random() * 0.15, arc: 40 + Math.random() * 50 });
}
function celebrateMerge(m) {
  sfx(m.star === 3 ? 'merge3' : 'merge');
  const r = m.loc.zone === 'board' ? slotRect(m.loc.idx) : benchRect(Math.max(0, m.loc.idx));
  S.pops = S.pops || [];
  S.pops.push({ x: r.x + r.w / 2, y: r.y + r.h * 0.6, t: 0, star: m.star });
  S.shake = Math.max(S.shake, m.star === 3 ? 0.35 : 0.15);
  toast(`${UNIT[m.id].name} is now ${'★'.repeat(m.star)}!`, m.star === 3 ? '#a8781a' : '#4a5a7a');
}
function doSell(loc) {
  const r = loc.zone === 'board' ? slotRect(loc.idx) : benchRect(loc.idx);
  const v = Run.sell(S.run, loc); if (v) {
    coinShower(r.x + r.w / 2, r.y + r.h * 0.6, v + 2);
    S.fx.burst((r.x + r.w / 2 - L.arena.x) / L.c, (r.y + r.h * 0.6 - L.arena.y - L.c * 0.3) / L.c, '#e8b83a', 8, 2, 0.05); sfx('sell'); toast(`Sold for ${v} gold`, '#8a5a1a'); if (S.sel && S.sel.loc && S.sel.loc.zone === loc.zone && S.sel.loc.idx === loc.idx) S.sel = null; persist(); } }
function doReroll() { if (Run.reroll(S.run)) { sfx('reroll'); S.shopAnim = 0; persist(); } else { sfx('deny'); toast('Rerolling costs 1 gold'); } }
function doXp() {
  const run = S.run, lv = run.level;
  if (Run.buyXp(run)) { if (run.level > lv) { sfx('level'); toast(`Level ${run.level}! Room for ${run.level} on the board`, '#3a6a8a'); } else sfx('coin'); persist(); }
  else { sfx('deny'); toast(run.level >= MAX_LEVEL ? 'Max level' : 'Levelling costs 4 gold'); }
}
function doLock() { const on = Run.toggleLock(S.run); sfx('click'); toast(on ? 'Shop locked for next round' : 'Shop unlocked'); persist(); }

// ---------------------------------------------------------------- input
function ptr(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
cv.addEventListener('pointerdown', e => {
  initAudio();
  const p = ptr(e); S.mx = p.x; S.my = p.y;
  try { cv.setPointerCapture(e.pointerId); } catch { }
  S.down = { x: p.x, y: p.y, t: performance.now() };
  if (S.screen === 'game' && !S.modal && S.run) {
    const run = S.run;
    // draggable things
    if (S.phase === 'shop') {
      const loc = locAt(p.x, p.y);
      if (loc && Run.getAt(run, loc)) { S.drag = { kind: 'unit', loc, id: Run.getAt(run, loc).id, star: Run.getAt(run, loc).star, x: p.x, y: p.y, moved: false }; return; }
      for (let i = 0; i < SHOP_SIZE; i++) if (run.shop[i] && inR(p.x, p.y, shopCardRect(i))) { S.drag = { kind: 'shop', slot: i, id: run.shop[i], star: 1, x: p.x, y: p.y, moved: false }; return; }
    } else {
      const loc = locAt(p.x, p.y);
      if (loc && loc.zone === 'bench' && Run.getAt(run, loc)) { S.drag = { kind: 'unit', loc, id: Run.getAt(run, loc).id, star: Run.getAt(run, loc).star, x: p.x, y: p.y, moved: false, benchOnly: true }; return; }
    }
    for (let i = 0; i < run.items.length; i++) if (inR(p.x, p.y, itemRect(i))) { S.drag = { kind: 'item', idx: i, id: run.items[i], x: p.x, y: p.y, moved: false }; return; }
  }
});
cv.addEventListener('pointermove', e => {
  const p = ptr(e); S.mx = p.x; S.my = p.y;
  if (S.drag) {
    S.drag.x = p.x; S.drag.y = p.y;
    if (!S.drag.moved && Math.hypot(p.x - S.down.x, p.y - S.down.y) > 7) { S.drag.moved = true; sfx('pick'); }
  }
});
cv.addEventListener('pointerup', e => {
  const p = ptr(e); S.mx = p.x; S.my = p.y;
  const d = S.drag; S.drag = null;
  if (e.pointerType !== 'mouse') { S.mx = -1; S.my = -1; }
  if (d && d.moved) { dropDrag(d, p); return; }
  if (d && !d.moved) { tapThing(d); return; }
  // buttons & taps (topmost first)
  for (let i = S.hot.length - 1; i >= 0; i--) { const h = S.hot[i]; if (inR(p.x, p.y, h)) { h.fn(p); return; } }
  if (S.screen === 'game') { S.sel = null; }
});
cv.addEventListener('pointercancel', () => { S.drag = null; });
cv.addEventListener('contextmenu', e => {
  e.preventDefault();
  if (S.screen === 'game' && S.phase === 'shop' && S.run) { const p = ptr(e); const loc = locAt(p.x, p.y); if (loc && Run.getAt(S.run, loc)) doSell(loc); }
});

function tapThing(d) {
  if (d.kind === 'shop') { doBuy(d.slot); return; }
  if (d.kind === 'unit') { S.sel = { kind: 'unit', loc: d.loc }; sfx('tick'); return; }
  if (d.kind === 'item') { S.sel = { kind: 'item', id: d.id }; sfx('tick'); }
}
function inSellZone(p) { return S.phase === 'shop' && (inR(p.x, p.y, L.shop) || (L.btns && inR(p.x, p.y, L.btns))); }
function dropDrag(d, p) {
  const run = S.run; if (!run) return;
  const loc = locAt(p.x, p.y);
  if (d.kind === 'unit') {
    if (inSellZone(p)) { doSell(d.loc); return; }
    if (loc && (!d.benchOnly || loc.zone === 'bench')) {
      if (Run.move(run, d.loc, loc)) { sfx('drop'); S.sel = { kind: 'unit', loc }; persist(); }
      else if (!(loc.zone === d.loc.zone && loc.idx === d.loc.idx)) { sfx('deny'); toast(`Board is full (level ${run.level}). Level up for more room.`); }
    }
    return;
  }
  if (d.kind === 'shop') {
    if (loc && !Run.getAt(run, loc)) doBuy(d.slot, loc, true);
    else if (loc || p.y < L.shop.y) doBuy(d.slot);
    return;
  }
  if (d.kind === 'item') {
    if (loc && Run.getAt(run, loc)) {
      if (Run.equip(run, d.idx, loc)) { sfx('item'); toast(`${ITEM[d.id].name} equipped`); persist(); }
      else { sfx('deny'); toast('That unit already holds 3 items'); }
    }
  }
}

window.addEventListener('keydown', e => {
  initAudio();
  const k = e.key.toLowerCase();
  if (k === 'm') { toggleMute(); return; }
  if (S.screen === 'title') { if (S.modal) { if (k === 'escape' || k === ' ' || k === 'enter') S.modal = null; return; } if (k === ' ' || k === 'enter') { S.save.run ? continueRun() : startRun(); } return; }
  if (S.screen === 'results') { if (k === ' ' || k === 'enter' || k === 'r') startRun({ daily: false }); if (k === 'escape') S.screen = 'title'; return; }
  if (S.screen !== 'game') return;
  if (S.modal === 'items') { const i = '123'.indexOf(k); if (i >= 0 && S.run.itemChoice) pickItem(S.run.itemChoice[i]); return; }
  if (S.modal) { if (k === 'escape' || k === ' ' || k === 'enter') S.modal = null; return; }
  if (k === 'escape') { S.modal = 'menu'; return; }
  if (S.phase === 'shop') {
    if (k === 'd') doReroll();
    else if (k === 'f') doXp();
    else if (k === 'l') doLock();
    else if (k === ' ' || k === 'enter') { e.preventDefault(); startFight(); }
    else if (k === 'e' || k === 'delete' || k === 'backspace') { const loc = locAt(S.mx, S.my) || (S.sel && S.sel.loc); if (loc && Run.getAt(S.run, loc)) doSell(loc); }
  } else if (S.phase === 'fight') {
    if (k === ' ' || k === 's') { e.preventDefault(); cycleSpeed(); }
  }
});
function toggleMute() { setMuted(!isMuted()); S.save.muted = isMuted(); persist(); if (!isMuted()) sfx('click'); }
function cycleSpeed() { S.speed = S.speed === 1 ? 2 : S.speed === 2 ? 4 : 1; S.save.speed = S.speed; sfx('click'); persist(); }
function pickItem(id) { if (Run.takeItem(S.run, id)) { sfx('item'); S.modal = null; toast(`${ITEM[id].name}: drag it onto a unit`, '#4a5a7a'); persist(); } }

// ---------------------------------------------------------------- fight update
const EVC = { arrow: '#7a4a2a', orb: '#6a5bc4', bolt: '#e0702e', snipe: '#2a2230' };
function updateFight(dt) {
  const b = S.battle; if (!b) return;
  if (S.introT > 0) { S.introT -= dt; return; }
  if (b.over) {
    S.endT += dt;
    if (S.endT === dt) {
      const w = b.winner;
      if (w === 0) { banner('Victory!', 'The ink is yours', '#3a7a4a', 1.5); sfx('win'); }
      else if (w === 1) { banner('Defeat', `-1 heart  (${S.run.hearts - 1} left)`, '#c8402e', 1.5); sfx('lose'); setTimeout(() => sfx('heart'), 350); S.shake = 0.4; }
      else { banner('Draw', 'Nobody loses a heart', INK, 1.5); sfx('click'); }
    }
    if (S.endT > 1.7) endFight();
    return;
  }
  if (S.hitstop > 0) { S.hitstop -= dt; return; }
  S.acc += dt * S.speed;
  let n = 0;
  while (S.acc >= SIM_DT && n++ < 12) {
    S.acc -= SIM_DT;
    simStep(b);
    if (b.hitstop) { S.hitstop = b.hitstop / Math.max(1, S.speed * 0.6); b.hitstop = 0; }
    if (b.shake) { S.shake = Math.max(S.shake, b.shake); b.shake = 0; }
    if (b.over) break;
  }
  for (const e of b.events) fightEvent(e);
  b.events.length = 0;
}
function fightEvent(e) {
  const fx = S.fx;
  switch (e.t) {
    case 'dmg': {
      const col = e.crit ? '#e0602e' : e.type === 'abil' ? '#6a4ac8' : e.type === 'thorn' ? '#4a7a3a' : (e.side === 0 ? '#a83a2a' : INK);
      if (e.amt >= 8) fx.num(e.x, e.y, (e.crit ? '' : '') + e.amt + (e.crit ? '!' : ''), col, e.crit || e.amt > 250);
      fx.burst(e.x, e.y - 0.1, e.side === 0 ? '#3a6a5a' : '#8a2a2a', e.crit ? 7 : 3, 1.8, 0.045);
      sfx(e.crit ? 'crit' : 'hit', 0.05);
      break;
    }
    case 'swing': fx.slash(e.x, e.y); sfx(e.big ? 'bigswing' : 'swing', 0.05); break;
    case 'phit': fx.burst(e.x, e.y - 0.1, e.col || INK, 4, 1.5, 0.04); sfx(e.kind === 'orb' || e.kind === 'bolt' ? 'orb' : 'arrow', 0.04); break;
    case 'cast': {
      const sound = { shield: 'shield', taunt: 'shield', roar: 'roar', chain: 'zap', meteor: 'cast', freeze: 'freeze', heal: 'heal', healall: 'heal', grow: 'heal', summon: 'rise', splash: 'splash', rally: 'roar', backstab: 'poof' }[e.k] || 'cast';
      sfx(sound, 0.05);
      fx.text(e.x, e.y, abilName(e.u), e.side === 0 ? '#2a6a5a' : '#a83a2a');
      break;
    }
    case 'shield': fx.ring(e.x, e.y, 0.7, '#8ab0d8'); break;
    case 'heal': fx.num(e.x, e.y, '+' + e.amt, '#3a8a3a'); break;
    case 'leaf': fx.burst(e.x, e.y - 0.3, '#6aa84a', 6, 1.2, 0.05); break;
    case 'stun': fx.burst(e.x, e.y - 0.6, '#e8c040', 5, 1.4, 0.05); sfx('stun', 0.08); break;
    case 'ring': fx.ring(e.x, e.y, e.r, e.col); break;
    case 'splash': fx.boom(e.x, e.y, e.r, e.col); sfx('splash', 0.05); S.fx.stainAt(e.x, e.y, e.r * 0.2, '#3d7fb8', 0.03); break;
    case 'boom': fx.boom(e.x, e.y, e.r, e.k === 'wave' ? '#3d7fb8' : '#e0602e'); sfx(e.k === 'wave' ? 'splash' : 'boom', 0.05); S.fx.stainAt(e.x, e.y, e.r * 0.2, e.k === 'wave' ? '#3d7fb8' : '#3a2a2a', 0.035); break;
    case 'beam': fx.beam(e.x, e.y, e.x2, e.y2, e.col, e.zig); break;
    case 'poof': fx.burst(e.x, e.y - 0.2, '#4a3a5a', 10, 2, 0.06); break;
    case 'rise': fx.ring(e.x, e.y, 0.8, '#7f9a86'); fx.burst(e.x, e.y, '#7f9a86', 8, 1.6, 0.05); sfx('rise', 0.1); break;
    case 'ice': fx.burst(e.x, e.y - 0.3, '#a8d8f0', 8, 1.6, 0.06); break;
    case 'die': {
      const u = e.u;
      S.fx.stainAt(e.x, e.y, 0.2 + (e.big ? 0.08 : 0), u.def.garb || INK, 0.13);
      S.fx.stainAt(e.x + 0.06, e.y + 0.03, 0.09, INK, 0.16);
      fx.burst(e.x, e.y - 0.2, u.def.garb || INK, 16, 3, 0.07);
      fx.burst(e.x, e.y - 0.2, INK, 8, 2.5, 0.05);
      sfx('die', 0.04);
      if (e.big) S.shake = Math.max(S.shake, 0.25);
      break;
    }
  }
}
function abilName(u) {
  const k = u.def.ab.k;
  return { shield: 'Shield!', bolt: 'Firebolt!', maul: 'Maul!', stun: 'Bonk!', volley: 'Volley!', backstab: 'Backstab!', taunt: 'Taunt!', frenzy: 'Frenzy!', drain: 'Drain!', heal: 'Mend!', roar: 'Roar!', splash: 'Splash!', chain: 'Lightning!', snipe: 'Snipe!', summon: 'Rise!', meteor: u.def.id === 'tidecaller' ? 'Wave!' : u.def.id === 'inkwyrm' ? 'Inkfire!' : 'Meteor!', grow: 'Grow!', healall: 'Bloom!', freeze: 'Deep Freeze!', rally: 'Rally!' }[k] || '';
}

// ---------------------------------------------------------------- render: units
const flying = u => S.flies.some(f => f.nid === u.nid);
function drawBoardUnit(u, x, y, size, o = {}) {
  const bob = o.still ? 0 : Math.sin(S.t * 2.2 + (u.nid || 0)) * size * 0.012;
  const lt = S.land[u.nid];
  if (lt != null) { if (lt > 0.3) delete S.land[u.nid]; else size *= 1 + 0.2 * Math.sin(Math.PI * lt / 0.3) * (1 - lt / 0.3); }
  drawUnitAt(g, u.id, x, y + bob, size * (1 + (u.star - 1) * 0.08), { ring: o.ring, flip: o.flip, alpha: o.alpha });
  if (o.label !== false) {
    starRow(x, y + size * 0.13, u.star, Math.max(4, size * 0.065));
    if (u.items && u.items.length) u.items.forEach((it, i) => { const ix = x + (i - (u.items.length - 1) / 2) * size * 0.2, iy = y + size * 0.27; g.fillStyle = P0; g.beginPath(); g.arc(ix, iy, size * 0.085, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); icon(g, ITEM[it].icon, ix, iy, size * 0.06, INK, ITEM[it].col); });
  }
}

function drawFightUnits() {
  const b = S.battle, c = L.c, ax = L.arena.x, ay = L.arena.y;
  const list = b.units.filter(u => u.alive).sort((p, q) => p.y - q.y);
  for (const u of list) {
    const moving = u._px != null && Math.hypot(u.x - u._px, u.y - u._py) > 0.002;
    u._px = u.x; u._py = u.y;
    if (moving) u._walk = (u._walk || 0) + 0.25 * S.speed;
    const hop = moving ? Math.abs(Math.sin(u._walk)) * c * 0.06 : 0;
    const lunge = u.anim.lunge > 0 ? Math.sin((1 - u.anim.lunge / 0.16) * Math.PI) * c * 0.14 : 0;
    const X = ax + u.x * c + lunge * u.face, Y = ay + u.y * c + c * 0.3 - hop;
    const size = c * (u.summoned ? 0.78 : 1) * (1 + (u.star - 1) * 0.08) * (u.anim.spawn > 0 ? 1 - u.anim.spawn * 1.5 : 1);
    if (size <= 0) continue;
    if (u.anim.cast > 0) { g.save(); g.globalAlpha = u.anim.cast / 0.4 * 0.6; g.fillStyle = TRAITS[u.def.cls]?.col || '#e8c060'; g.beginPath(); g.ellipse(X, Y - size * 0.4, size * 0.5, size * 0.55, 0, 0, 7); g.fill(); g.restore(); }
    const sq = u.anim.hurt > 0 ? u.anim.hurt * 0.5 : 0;
    drawUnitAt(g, u.id, X, Y, size, { ring: TEAM[u.side], flip: u.face < 0, squash: -sq * 0.3 });
    if (u.anim.hurt > 0) drawSil(g, u.id, X, Y, size, '#ffffff', Math.max(0, u.anim.hurt - 0.08) / 0.1 * 0.5, u.face < 0);
    if (u.stun > 0) for (let i = 0; i < 3; i++) { const a = S.t * 6 + i * 2.1; icon(g, 'star', X + Math.cos(a) * size * 0.25, Y - size * 0.92 + Math.sin(a) * size * 0.06, size * 0.06, INK, '#f2d040'); }
    if (u.burn) for (let i = 0; i < 2; i++) { g.fillStyle = rgba(i ? '#f2c14e' : '#e0602e', 0.8); g.beginPath(); g.arc(X + (i - 0.5) * size * 0.2, Y - size * (0.2 + ((S.t * 2 + i * 0.5) % 1) * 0.5), size * 0.04, 0, 7); g.fill(); }
    if (u.taunt > 0) T('!', X + size * 0.3, Y - size * 0.75, size * 0.3, '#c8402e', 'center', FH, { stroke: P0 });
    // bars
    const bw = c * 0.66, bh = Math.max(4, c * 0.065), bx = X - bw / 2, by = Y - size * (u.def.body === 'quad' ? 0.6 : 0.78) - bh;
    g.fillStyle = 'rgba(42,34,48,0.75)'; g.fillRect(bx - 1, by - 1, bw + 2, bh + 2 + Math.max(2, bh * 0.45));
    const tot = Math.max(u.maxHp, u.hp + u.shield);
    g.fillStyle = TEAM[u.side]; g.fillRect(bx, by, bw * u.hp / tot, bh);
    if (u.shield > 0) { g.fillStyle = '#e8eef4'; g.fillRect(bx + bw * u.hp / tot, by, bw * u.shield / tot, bh); }
    g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(bx, by, bw * u.hp / tot, bh * 0.4);
    if (u.def.ab.k !== 'none') { g.fillStyle = '#5a8ad8'; g.fillRect(bx, by + bh + 0.5, bw * u.mana / u.maxMana, Math.max(2, bh * 0.45)); }
    if (u.star > 1) starRow(X, by - Math.max(4, c * 0.06), u.star, Math.max(3.5, c * 0.05));
    // tap a fighter to see it
    S.fightHot.push({ x: X - size * 0.35, y: Y - size * 0.9, w: size * 0.7, h: size * 0.95, u });
  }
  // projectiles
  for (const p of b.projs) {
    const X = ax + p.x * c, Y = ay + p.y * c - c * 0.2 + c * 0.3;
    g.save(); g.translate(X, Y); g.rotate(p.ang || 0);
    if (p.kind === 'arrow' || p.kind === 'snipe') { g.strokeStyle = INK; g.lineWidth = Math.max(1.5, c * 0.025); g.beginPath(); g.moveTo(-c * 0.18, 0); g.lineTo(c * 0.1, 0); g.stroke(); g.fillStyle = p.kind === 'snipe' ? '#c8402e' : INK; g.beginPath(); g.moveTo(c * 0.14, 0); g.lineTo(c * 0.06, -c * 0.04); g.lineTo(c * 0.06, c * 0.04); g.fill(); }
    else { const col = p.kind === 'bolt' ? '#f08030' : (p.col || '#8a7ad8'); g.fillStyle = rgba(col, 0.35); g.beginPath(); g.arc(0, 0, c * 0.12, 0, 7); g.fill(); g.fillStyle = col; g.beginPath(); g.arc(0, 0, c * 0.06, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); }
    g.restore();
  }
  // telegraphed area attacks
  for (const z of b.zones) {
    const X = ax + z.x * c, Y = ay + z.y * c + c * 0.3;
    g.save(); g.setLineDash([6, 5]); g.strokeStyle = z.k === 'wave' ? '#3d7fb8' : '#c8402e'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(X, Y, z.r * c, z.r * c * 0.5, 0, 0, 7); g.stroke();
    g.fillStyle = rgba(z.k === 'wave' ? '#3d7fb8' : '#e0602e', 0.12 + (0.55 - z.t) * 0.3); g.fill(); g.restore();
  }
}

// ---------------------------------------------------------------- render: game screen
function drawTopBar() {
  const run = S.run, t = L.top, h = t.h;
  g.save();
  g.fillStyle = 'rgba(42,34,48,0.9)'; g.fillRect(0, 0, W, h);
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(0, h - 3, W, 3);
  const sz = clamp(h * 0.42, 15, 24), cy = h / 2;
  let x = 12;
  // hearts
  const hr = sz * 0.5;
  for (let i = 0; i < START_HEARTS; i++) icon(g, 'life', x + hr + i * hr * 2.3, cy, hr, INK, i < run.hearts ? '#d8483a' : '#4a3a44');
  x += START_HEARTS * hr * 2.3 + 10;
  // trophies
  icon(g, 'trophy', x + hr, cy, hr * 1.1, INK, '#e8b83a');
  T(`${run.wins}/${WINS_TO_WIN}`, x + hr * 2.5, cy + sz * 0.36, sz, '#f6eedb', 'left', FH);
  x += hr * 2.5 + sz * 2.8;
  if (!L.portrait || W > 420) { T(`Round ${run.round}`, x, cy + sz * 0.36, sz * 0.9, '#d8ccb4', 'left', FH); x += sz * 4.6; }
  // gold
  const gx = L.portrait ? W - 120 : W / 2 + 40;
  S.goldPos = { x: gx, y: cy };
  const gb = 1 + S.goldBump * 0.35;
  icon(g, 'gold', gx, cy, hr * 1.05 * gb);
  T(String(run.gold), gx + hr * 1.6, cy + sz * 0.38, sz * 1.1 * gb, '#f2d27a', 'left', FH);
  if (!L.portrait) {
    const ints = Run.interestOf(run.gold);
    T(`+${ints} interest${run.streak >= 2 ? ` · win streak ${run.streak}` : run.streak <= -2 ? ` · lose streak ${-run.streak}` : ''}`, gx + hr * 1.6 + sz * 2, cy + sz * 0.3, sz * 0.62, '#b8ac94', 'left', FB);
    if (run.daily) T('DAILY', W - 180, cy + sz * 0.3, sz * 0.7, '#e8b83a', 'right', FH);
  }
  g.restore();
  // mute + menu
  const bs = h - 12;
  button(W - bs * 2 - 16, 6, bs, bs, '', toggleMute, { icon: isMuted() ? 'mute' : 'sound', col: '#5a4a5a', tc: '#f6eedb', r: 8 });
  button(W - bs - 8, 6, bs, bs, '', () => { S.modal = 'menu'; sfx('click'); }, { icon: 'menu', col: '#5a4a5a', tc: '#f6eedb', r: 8 });
}

function drawArena() {
  const art = paintArena(), a = L.arena;
  g.drawImage(art.cv, a.x - art.pad, a.y - art.pad, a.w + art.pad * 2, a.h + art.pad * 2);
}

function drawShopPhaseBoard() {
  const run = S.run, c = L.c;
  // scouting: the next rival, faded, on the far side
  const opp = Run.opponent(run);
  if (opp.team) for (const s of opp.team.slice().sort((p, q) => p.r - q.r)) {
    const p = cellPos(1, s.c, s.r);
    drawBoardUnit({ id: s.id, star: s.star, items: s.items, nid: s.c * 3 + s.r }, L.arena.x + p.x * c, L.arena.y + p.y * c + c * 0.3, c, { ring: TEAM[1], flip: true, alpha: 0.55, label: true });
  }
  // rival label on the line
  if (!(L.portrait && S.sel && S.sel.kind === 'unit')) {
  const lw = Math.min(L.arena.w * 0.9, 340), lx = L.arena.x + (L.arena.w - lw) / 2, ly = L.arena.y + c * 2 - 16;
  panel(lx, ly, lw, 32, { r: 16, fill: '#f6eedb', tint: opp.col, tintA: 0.2 });
  fitT(`Next: ${opp.name} · ${opp.plan}`, lx + lw / 2, ly + 22, 17, lw - 20, INK, 'center', FH);
  hit(lx, ly, lw, 32, () => { S.sel = { kind: 'rival' }; sfx('tick'); });
  }
  // board slots
  const cap = run.level, used = Run.boardCount(run);
  const dragging = S.drag && S.drag.moved && (S.drag.kind === 'unit' || S.drag.kind === 'shop');
  for (let i = 0; i < Run.BOARD_SLOTS; i++) {
    const r = slotRect(i), u = run.board[i];
    if (!u && dragging) {
      const ok = used < cap || (S.drag.kind === 'unit' && S.drag.loc.zone === 'board');
      g.save(); g.strokeStyle = ok ? 'rgba(58,138,106,0.75)' : 'rgba(200,64,46,0.4)'; g.setLineDash([5, 4]); g.lineWidth = 2;
      g.beginPath(); g.ellipse(r.x + c / 2, r.y + c * 0.8, c * 0.36, c * 0.13, 0, 0, 7); g.stroke(); g.restore();
    }
  }
  // units, back row first
  const order = [...Array(Run.BOARD_SLOTS).keys()].sort((p, q) => Math.floor(p / 5) - Math.floor(q / 5));
  for (const i of order) {
    const u = run.board[i]; if (!u) continue;
    if (S.drag && S.drag.moved && S.drag.kind === 'unit' && S.drag.loc.zone === 'board' && S.drag.loc.idx === i) continue;
    if (flying(u)) continue;
    const r = slotRect(i);
    const sel = S.sel && S.sel.kind === 'unit' && S.sel.loc.zone === 'board' && S.sel.loc.idx === i;
    if (sel) { g.save(); g.fillStyle = 'rgba(232,184,58,0.3)'; g.beginPath(); g.ellipse(r.x + c / 2, r.y + c * 0.8, c * 0.42, c * 0.16, 0, 0, 7); g.fill(); g.restore(); }
    drawBoardUnit(u, r.x + c / 2, r.y + c * 0.8, c, { ring: TEAM[0] });
  }
  // capacity tag
  const tag = `${used}/${cap} on board`;
  const over = used > cap;
  S.capTag = { tag, over };
}

function drawBench() {
  const run = S.run, b = L.bench;
  panel(b.x, b.y, b.w, b.h, { r: 8, fill: '#e6d8b8', lw: 1.2 });
  for (let i = 0; i < BENCH_SIZE; i++) {
    const r = benchRect(i), u = run.bench[i];
    g.strokeStyle = 'rgba(42,34,48,0.12)'; g.lineWidth = 1;
    if (i) { g.beginPath(); g.moveTo(r.x, r.y + 6); g.lineTo(r.x, r.y + r.h - 6); g.stroke(); }
    if (!u) continue;
    if (S.drag && S.drag.moved && S.drag.kind === 'unit' && S.drag.loc.zone === 'bench' && S.drag.loc.idx === i) continue;
    if (flying(u)) continue;
    const size = Math.min(r.w * 1.15, r.h * 1.1);
    const sel = S.sel && S.sel.kind === 'unit' && S.sel.loc.zone === 'bench' && S.sel.loc.idx === i;
    if (sel) { g.fillStyle = 'rgba(232,184,58,0.35)'; g.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4); }
    drawBoardUnit(u, r.x + r.w / 2, r.y + r.h * 0.78, size, { ring: null });
  }
  if (!L.portrait) T('BENCH', b.x - 6, b.y + b.h / 2 + 5, 13, 'rgba(42,34,48,0.5)', 'right', FH);
  if (S.phase === 'shop' && S.capTag) { const tw = 92; panel(b.x + b.w - tw - 4, b.y - 12, tw, 22, { r: 11, shadow: false, lw: 1.2, fill: S.capTag.over ? '#f0c8b0' : P0 }); T(S.capTag.tag, b.x + b.w - tw / 2 - 4, b.y + 4, 13, INK, 'center', FB); }
}

function drawShopCard(i) {
  const run = S.run, r = shopCardRect(i), id = run.shop[i];
  if (!id) { panel(r.x, r.y, r.w, r.h, { fill: '#e2d6bc', stroke: 'rgba(42,34,48,0.25)', shadow: false }); return; }
  if (S.drag && S.drag.moved && S.drag.kind === 'shop' && S.drag.slot === i) { panel(r.x, r.y, r.w, r.h, { fill: '#e2d6bc', stroke: 'rgba(42,34,48,0.25)', shadow: false }); return; }
  const d = UNIT[id], afford = run.gold >= d.cost;
  const copies = [...run.bench, ...run.board].filter(u => u && u.id === id && u.star === 1).length;
  const hov = hovering(r.x, r.y, r.w, r.h);
  const ly = hov ? -3 : 0;
  const anim = S.shopAnim != null ? clamp((S.shopAnim - i * 0.04) / 0.18, 0, 1) : 1;
  g.save();
  g.translate(r.x + r.w / 2, r.y + r.h / 2); g.scale(1, 0.6 + anim * 0.4); g.globalAlpha = anim; g.translate(-r.x - r.w / 2, -r.y - r.h / 2);
  panel(r.x, r.y + ly, r.w, r.h, { fill: afford ? '#f8f0de' : '#e4dccb', tint: COST_COL[d.cost], tintA: 0.14, stroke: copies >= 2 ? '#c89a2a' : INK, lw: copies ? 2.6 : 1.6 });
  // cost band
  g.fillStyle = COST_COL[d.cost]; rr(r.x + 3, r.y + ly + 3, r.w - 6, Math.max(5, r.h * 0.05), 3); g.fill();
  const sz = Math.min(r.w * 1.25, r.h * 0.95);
  g.save(); rr(r.x, r.y + ly, r.w, r.h, 10); g.clip();
  drawUnitAt(g, id, r.x + r.w / 2, r.y + ly + r.h * 0.76, sz, { alpha: afford ? 1 : 0.55 });
  g.restore();
  const fs = clamp(r.w * 0.12, 10, 16);
  fitT(d.name, r.x + r.w / 2, r.y + ly + r.h - 8, fs, r.w - 8, INK, 'center', FH);
  // traits
  const ir = clamp(r.w * 0.065, 5, 9);
  [d.origin, d.cls].forEach((t, k) => { const ix = r.x + 6 + ir + k * (ir * 2.4), iy = r.y + ly + r.h * 0.05 + ir + 6; g.fillStyle = P0; g.beginPath(); g.arc(ix, iy, ir * 1.15, 0, 7); g.fill(); icon(g, t, ix, iy, ir * 0.8, INK, TRAITS[t].col); });
  // price
  icon(g, 'gold', r.x + r.w - ir * 3.3, r.y + ly + r.h * 0.05 + ir + 6, ir * 0.95);
  T(String(d.cost), r.x + r.w - ir * 1.3, r.y + ly + r.h * 0.05 + ir * 1.4 + 6, ir * 1.6, afford ? INK : '#c8402e', 'center', FH);
  const by = r.y + ly + r.h - 10 - fs * 1.35;
  if (copies >= 2) { T('★ UPGRADE', r.x + r.w / 2, by, clamp(r.w * 0.11, 9, 14), '#a8781a', 'center', FH, { stroke: P0, sw: 3 }); }
  else if (copies === 1) T(`owned`, r.x + r.w / 2, by, clamp(r.w * 0.1, 8, 12), '#6a6a8a', 'center', FB, { stroke: P0, sw: 3 });
  g.restore();
}

function drawShop() {
  const run = S.run;
  const dragOwned = S.drag && S.drag.moved && S.drag.kind === 'unit';
  if (dragOwned) {
    const s = L.shop, u = Run.getAt(run, S.drag.loc);
    const v = u ? Run.sellValue(u) : 0;
    const on = inSellZone({ x: S.drag.x, y: S.drag.y });
    panel(s.x, s.y, s.w, s.h + (L.btns ? L.btns.h + L.pad : 0), { fill: on ? '#f0c8b0' : '#efd8c8', stroke: '#c8402e', lw: on ? 3 : 2 });
    icon(g, 'sell', s.x + s.w / 2 - 70, s.y + s.h / 2, 16, '#a8302a');
    T(`Drop to sell for ${v}`, s.x + s.w / 2 - 46, s.y + s.h / 2 + 8, 22, '#a8302a', 'left', FH);
    icon(g, 'gold', s.x + s.w / 2 + 120, s.y + s.h / 2, 12);
    return;
  }
  for (let i = 0; i < SHOP_SIZE; i++) drawShopCard(i);
}

function shopButtons(rects) {
  const run = S.run;
  const need = Run.xpNeeded(run.level);
  button(rects.xp.x, rects.xp.y, rects.xp.w, rects.xp.h, run.level >= MAX_LEVEL ? 'Max level' : `Level ${run.level}`, doXp, { icon: 'up', col: '#bcd0e8', sub: run.level >= MAX_LEVEL ? '' : `${run.xp}/${need} xp · 4g (F)`, disabled: run.level >= MAX_LEVEL || run.gold < BUY_XP_COST, why: 'Levelling costs 4 gold' });
  button(rects.roll.x, rects.roll.y, rects.roll.w, rects.roll.h, 'Reroll', doReroll, { icon: 'reroll', col: '#e8d3a8', sub: '1g (D)', disabled: run.gold < REROLL_COST, why: 'Rerolling costs 1 gold' });
  if (rects.lock) button(rects.lock.x, rects.lock.y, rects.lock.w, rects.lock.h, '', doLock, { icon: run.locked ? 'lock' : 'unlock', col: run.locked ? '#e8b83a' : '#d8ccb4' });
}

function drawFightButton(r) {
  S.fightRect = r;
  if (S.phase === 'shop') {
    const pulse = Run.boardCount(S.run) > 0 ? 1 + Math.sin(S.t * 4) * 0.015 : 1;
    g.save(); g.translate(r.x + r.w / 2, r.y + r.h / 2); g.scale(pulse, pulse); g.translate(-r.x - r.w / 2, -r.y - r.h / 2);
    button(r.x, r.y, r.w, r.h, 'FIGHT!', startFight, { col: '#e88a5a', size: Math.min(r.h * 0.45, 30), sub: L.portrait ? '' : 'Space' });
    g.restore();
  } else {
    button(r.x, r.y, r.w, r.h, `Speed x${S.speed}`, cycleSpeed, { icon: 'speed', col: '#d8ccb4', size: Math.min(r.h * 0.36, 22) });
  }
}

function drawTraits(r, compact) {
  const run = S.run;
  const ids = S.phase === 'fight' && S.battle ? null : run.board.filter(Boolean).map(u => u.id);
  const tc = ids ? traitCounts(ids) : S.battle.traits[0];
  const list = Object.entries(tc).sort((a, b) => b[1].lvl - a[1].lvl || b[1].n - a[1].n);
  if (compact) {
    let x = r.x;
    if (!list.length) T('Traits light up as you place units', r.x + 4, r.y + r.h * 0.68, 13, 'rgba(42,34,48,0.55)', 'left', FB);
    for (const [id, o] of list) {
      const tr = TRAITS[id], w = r.h * 1.9;
      if (x + w > r.x + r.w) break;
      const on = o.lvl > 0;
      panel(x, r.y, w, r.h, { r: r.h / 2, fill: on ? '#f8f0de' : '#e2d6bc', tint: on ? tr.col : null, tintA: 0.3, lw: on ? 1.8 : 1, shadow: false, stroke: on ? INK : 'rgba(42,34,48,0.4)' });
      icon(g, id, x + r.h * 0.5, r.y + r.h / 2, r.h * 0.3, INK, on ? tr.col : '#b8ac94');
      T(`${o.n}`, x + r.h * 1.15, r.y + r.h * 0.7, r.h * 0.55, on ? INK : 'rgba(42,34,48,0.5)', 'center', FH);
      hit(x, r.y, w, r.h, () => { S.sel = { kind: 'trait', id }; sfx('tick'); });
      x += w + 4;
    }
    return;
  }
  T('Traits', r.x + 4, r.y + 20, 20, INK, 'left', FH);
  let y = r.y + 30;
  const rowH = clamp(r.h / 9, 26, 40);
  if (!list.length) { T('Place units on the board', r.x + 4, y + 18, 14, 'rgba(42,34,48,0.55)', 'left', FB); T('to switch traits on.', r.x + 4, y + 36, 14, 'rgba(42,34,48,0.55)', 'left', FB); }
  for (const [id, o] of list) {
    if (y + rowH > r.y + r.h) break;
    const tr = TRAITS[id], on = o.lvl > 0;
    const hov = hovering(r.x, y, r.w, rowH - 3);
    panel(r.x, y, r.w, rowH - 4, { r: 8, fill: on ? '#f8f0de' : '#e8dcc4', tint: on ? tr.col : null, tintA: 0.22, lw: on ? 1.6 : 1, shadow: false, stroke: hov ? INK : on ? 'rgba(42,34,48,0.8)' : 'rgba(42,34,48,0.35)' });
    const ir = (rowH - 4) * 0.32;
    g.fillStyle = on ? tr.col : '#cfc2a6'; g.beginPath(); g.arc(r.x + ir + 8, y + (rowH - 4) / 2, ir * 1.25, 0, 7); g.fill();
    icon(g, id, r.x + ir + 8, y + (rowH - 4) / 2, ir * 0.85, INK, on ? '#f8f0de' : '#e8dcc4');
    T(tr.name, r.x + ir * 2 + 16, y + (rowH - 4) * 0.48, Math.min(17, rowH * 0.45), on ? INK : 'rgba(42,34,48,0.6)', 'left', FH);
    // breakpoints
    const bps = tr.t.map((bp, k) => (o.lvl === k + 1 ? `[${bp}]` : `${bp}`)).join(' · ');
    T(`${o.n}  —  ${bps}`, r.x + ir * 2 + 16, y + (rowH - 4) * 0.88, Math.min(13, rowH * 0.34), on ? '#5a4a3a' : 'rgba(42,34,48,0.5)', 'left', FB);
    hit(r.x, y, r.w, rowH - 4, () => { S.sel = { kind: 'trait', id }; sfx('tick'); });
    if (hov && !S.drag) S.tip = { kind: 'trait', id, x: r.x + r.w + 8, y };
    y += rowH;
  }
}

function drawItems(r) {
  const run = S.run;
  if (!run.items.length) { if (!L.portrait) T('Items appear on rounds ' + ITEM_ROUNDS.slice(0, 4).join(', ') + '...', r.x + 4, r.y + r.h / 2 + 5, 12, 'rgba(42,34,48,0.5)', 'left', FB); else T('No items yet', r.x + 4, r.y + r.h / 2 + 5, 12, 'rgba(42,34,48,0.5)', 'left', FB); return; }
  run.items.forEach((id, i) => {
    const q = itemRect(i);
    if (q.x + q.w > r.x + r.w) return;
    if (S.drag && S.drag.moved && S.drag.kind === 'item' && S.drag.idx === i) return;
    panel(q.x, q.y, q.w, q.h, { r: q.w / 2, fill: '#f8f0de', tint: ITEM[id].col, tintA: 0.25 });
    icon(g, ITEM[id].icon, q.x + q.w / 2, q.y + q.h / 2, q.w * 0.28, INK, ITEM[id].col);
  });
  if (!L.portrait) T('drag onto a unit', r.x + r.w - 2, r.y - 3, 11, 'rgba(42,34,48,0.5)', 'right', FB);
}

// live damage meter shown under the arena during a fight
function drawDamageMeter(r, two) {
  const b = S.battle, run = S.run, opp = Run.opponent(run);
  panel(r.x, r.y, r.w, r.h, { tint: opp.col, tintA: 0.12 });
  fitT(`Round ${run.round}  ·  vs ${opp.name} (${opp.plan})`, r.x + r.w / 2, r.y + 20, 16, r.w - 20, INK, 'center', FH);
  if (!b) return;
  const cols = two ? [0, 1] : [0];
  const colW = (r.w - 20) / cols.length;
  const maxD = Math.max(1, ...b.units.map(u => u.dealt));
  for (const side of cols) {
    const list = b.units.filter(u => u.side === side && !u.summoned).sort((p, q) => q.dealt - p.dealt);
    const rows = Math.max(1, Math.floor((r.h - 50) / 15));
    const rh = Math.min(20, (r.h - 50) / Math.min(rows, Math.max(1, list.length)));
    const x0 = r.x + 10 + cols.indexOf(side) * colW;
    T(side === 0 ? 'Your damage' : 'Their damage', x0, r.y + 38, 11, 'rgba(42,34,48,0.55)', 'left', FB);
    list.slice(0, rows).forEach((u, i) => {
      const y = r.y + 44 + i * rh;
      const nameW = Math.min(110, colW * 0.36);
      fitT(u.def.name, x0, y + rh * 0.72, Math.min(13, rh * 0.62), nameW - 4, u.alive ? INK : 'rgba(42,34,48,0.4)', 'left', FB);
      const bw = (colW - nameW - 50) * u.dealt / maxD;
      if (bw >= 1) { g.fillStyle = rgba(TEAM[side], u.alive ? 0.8 : 0.35); rr(x0 + nameW, y + rh * 0.2, bw, rh * 0.6, Math.min(3, bw / 2)); g.fill(); }
      T(String(u.dealt | 0), x0 + nameW + Math.max(2, bw) + 4, y + rh * 0.72, Math.min(12, rh * 0.6), '#5a4a3a', 'left', FB);
    });
  }
}

// the info card for a selected unit / trait / item / rival
// compact unit card for phones: portrait on the left, name/traits/stats/ability on the right
function miniUnitCard(x, y, w, h, sel, u, d, fighter) {
  panel(x, y, w, h, { tint: COST_COL[d.cost], tintA: 0.14, lw: 2 });
  const canSell = sel.kind === 'unit' && S.phase === 'shop';
  const ab0 = { ...d.ab }; for (const k of ['v', 'sh']) if (ab0[k]) ab0[k] = Math.round(ab0[k] * [0, 1, 1.6, 2.6][u.star]);
  const sm0 = STAR_MULT[u.star];
  if (w < 260) { // narrow side column (phone landscape): stacked, no portrait
    fitT(d.name, x + 10, y + 22, 17, w - 44, INK, 'left', FH);
    starRow(x + w - 20, y + 15, u.star, 5);
    T(`${TRAITS[d.origin].name} · ${TRAITS[d.cls].name} · ${d.cost}g`, x + 10, y + 40, 12, '#5a4a3a', 'left', FB);
    const hp = fighter ? `${fighter.hp | 0}` : `${(d.hp * sm0) | 0}`, atk = fighter ? (fighter.atk * fighter.atkMult) | 0 : (d.atk * sm0) | 0;
    T(`HP ${hp} · ATK ${atk} · RNG ${d.range}`, x + 10, y + 58, 12, INK, 'left', FB);
    const yy = wrap(ABILITY_TEXT[d.ab.k] ? ABILITY_TEXT[d.ab.k](ab0) : '', x + 10, y + 76, w - 20, 12, '#4a3a8a');
    if (canSell && h - (yy - y) > 34) button(x + 10, y + h - 36, w - 20, 30, `Sell +${Run.sellValue(u)}`, () => doSell(sel.loc), { col: '#f0c0a8', size: 15 });
    return h;
  }
  const sw = clamp(Math.min(h * 0.62, w * 0.27), 50, 110);
  const spriteBottom = canSell ? y + h - 44 : y + h - 10;
  g.save(); rr(x, y, w, h, 10); g.clip();
  drawUnitAt(g, d.id, x + 8 + sw / 2, spriteBottom - 4, Math.min(sw * 1.05, spriteBottom - y - 4));
  g.restore();
  if (canSell) button(x + 8, y + h - 38, sw, 30, `Sell +${Run.sellValue(u)}`, () => doSell(sel.loc), { col: '#f0c0a8', size: 14 });
  const tx = x + sw + 18, tw = w - sw - 26;
  fitT(d.name, tx, y + 24, 19, tw - 44, INK, 'left', FH);
  starRow(x + w - 26, y + 17, u.star, 6);
  let yy = y + 44;
  [d.origin, d.cls].forEach((t, k) => { const ix = tx + 7 + k * (tw * 0.42); icon(g, t, ix, yy - 5, 7, INK, TRAITS[t].col); T(TRAITS[t].name, ix + 12, yy, 14, INK, 'left', FB); });
  T(`${d.cost}g`, x + w - 10, yy, 14, shadeHex(COST_COL[d.cost], -0.3), 'right', FH);
  const sm = STAR_MULT[u.star];
  const hp = fighter ? `${fighter.hp | 0}/${fighter.maxHp | 0}` : `${(d.hp * sm) | 0}`;
  const atk = fighter ? (fighter.atk * fighter.atkMult) | 0 : (d.atk * sm) | 0;
  yy += 22;
  const stats = [['HP', hp], ['ATK', atk], ['RNG', d.range], ['ARM', d.armor]];
  const cw = tw / 4;
  stats.forEach(([k, v], i) => { T(k, tx + i * cw, yy - 2, 10, 'rgba(42,34,48,0.55)', 'left', FB); fitT(String(v), tx + i * cw, yy + 14, 15, cw - 4, INK, 'left', FH); });
  yy += 34;
  const ab = { ...d.ab }; for (const k of ['v', 'sh']) if (ab[k]) ab[k] = Math.round(ab[k] * [0, 1, 1.6, 2.6][u.star]);
  T('Ability', tx, yy, 11, '#6a5bc4', 'left', FH);
  yy = wrap(ABILITY_TEXT[d.ab.k] ? ABILITY_TEXT[d.ab.k](ab) : '', tx, yy + 15, tw, 13, INK);
  if (u.items && u.items.length && yy + 8 < y + h) u.items.forEach((it, i) => { g.fillStyle = P0; g.beginPath(); g.arc(tx + 9 + i * 24, yy + 4, 10, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 1; g.stroke(); icon(g, ITEM[it].icon, tx + 9 + i * 24, yy + 4, 7, INK, ITEM[it].col); });
  return h;
}

function infoCard(x, y, w, maxH, o = {}) {
  const run = S.run, sel = S.sel;
  if (!sel) return 0;
  let h = 0;
  if (sel.kind === 'unit' || sel.kind === 'fighter' || sel.kind === 'shopUnit') {
    let u, d, fighter = null;
    if (sel.kind === 'unit') { u = Run.getAt(run, sel.loc); if (!u) { S.sel = null; return 0; } d = UNIT[u.id]; }
    else { fighter = sel.u; u = { id: fighter.id, star: fighter.star, items: fighter.items }; d = fighter.def; if (d.id === 'minion') return 0; }
    if (maxH < 300 || o.mini) return miniUnitCard(x, y, w, Math.min(maxH, 230), sel, u, d, fighter);
    h = Math.min(maxH, 330);
    panel(x, y, w, h, { tint: COST_COL[d.cost], tintA: 0.12 });
    const sz = Math.min(96, w * 0.42);
    drawUnitAt(g, d.id, x + sz * 0.55, y + sz * 0.98, sz);
    fitT(d.name, x + sz + 10, y + 26, 20, w - sz - 18, INK, 'left', FH);
    starRow(x + sz + 22, y + 44, u.star, 7);
    T(`${d.cost} gold`, x + w - 10, y + 48, 13, COST_COL[d.cost], 'right', FH);
    [d.origin, d.cls].forEach((t, k) => { const ix = x + sz + 18, iy = y + 66 + k * 22; icon(g, t, ix, iy, 8, INK, TRAITS[t].col); T(TRAITS[t].name, ix + 14, iy + 5, 15, INK, 'left', FB); });
    const sm = STAR_MULT[u.star];
    const hp = fighter ? `${fighter.hp | 0}/${fighter.maxHp | 0}` : `${(d.hp * sm) | 0}`;
    const stats = [['Health', hp], ['Attack', fighter ? (fighter.atk * fighter.atkMult) | 0 : (d.atk * sm) | 0], ['Speed', d.as.toFixed(2)], ['Range', d.range], ['Armour', d.armor], ['Mana', d.mana]];
    let sy = y + sz + 18;
    stats.forEach(([k, v], i) => { const cx = x + 10 + (i % 3) * ((w - 20) / 3), cy = sy + Math.floor(i / 3) * 34; T(k, cx, cy + 12, 11, 'rgba(42,34,48,0.55)', 'left', FB); T(String(v), cx, cy + 28, 15, INK, 'left', FH); });
    sy += 74;
    const ab = { ...d.ab }; for (const k of ['v', 'sh']) if (ab[k]) ab[k] = Math.round(ab[k] * [0, 1, 1.6, 2.6][u.star]);
    T('Ability', x + 10, sy, 12, '#6a5bc4', 'left', FH);
    sy = wrap(ABILITY_TEXT[d.ab.k] ? ABILITY_TEXT[d.ab.k](ab) : '', x + 10, sy + 16, w - 20, 14, INK);
    if (u.items && u.items.length) { sy += 4; u.items.forEach((it, i) => { icon(g, ITEM[it].icon, x + 18 + i * 26, sy + 6, 8, INK, ITEM[it].col); }); sy += 18; }
    sy = wrap(d.flavour, x + 10, sy + 8, w - 20, 13, 'rgba(42,34,48,0.6)');
    if (sel.kind === 'unit' && S.phase === 'shop') {
      const bw = Math.min(150, w - 20);
      button(x + w - bw - 10, Math.min(y + h - 42, sy + 6), bw, 34, `Sell +${Run.sellValue(u)}`, () => doSell(sel.loc), { col: '#f0c0a8', size: 16 });
      sy += 44;
    }
    return h;
  }
  if (sel.kind === 'trait') {
    const tr = TRAITS[sel.id];
    const tc = run.board.filter(Boolean).map(u => u.id);
    const n = traitCounts(tc)[sel.id]?.n || 0;
    h = 120 + tr.t.length * 22 + 70;
    panel(x, y, w, Math.min(h, maxH), { tint: tr.col, tintA: 0.18 });
    icon(g, sel.id, x + 22, y + 24, 12, INK, tr.col);
    T(tr.name, x + 42, y + 31, 22, INK, 'left', FH);
    T(`${n} on board`, x + w - 10, y + 30, 14, '#5a4a3a', 'right', FB);
    let yy = y + 56;
    tr.t.forEach((bp, k) => { const on = n >= bp; T(`(${bp})`, x + 12, yy, 14, on ? INK : 'rgba(42,34,48,0.45)', 'left', FH); yy = wrap(tr.text(tr.v[k]), x + 42, yy, w - 52, 13, on ? INK : 'rgba(42,34,48,0.5)') + 4; });
    if (tr.all6) yy = wrap(tr.all6, x + 12, yy + 2, w - 22, 13, '#5a4a3a');
    const members = UNITS.filter(u => u.origin === sel.id || u.cls === sel.id);
    const s = Math.min(34, (w - 20) / members.length);
    members.forEach((u, i) => { const owned = tc.includes(u.id); drawUnitAt(g, u.id, x + 14 + s * i + s / 2, yy + s + 6, s * 1.2, { alpha: owned ? 1 : 0.35 }); });
    return h;
  }
  if (sel.kind === 'item') {
    const it = ITEM[sel.id]; h = 96;
    panel(x, y, w, h, { tint: it.col, tintA: 0.2 });
    icon(g, it.icon, x + 26, y + 30, 14, INK, it.col);
    T(it.name, x + 50, y + 36, 20, INK, 'left', FH);
    wrap(it.text + '. Drag it onto a unit (max 3).', x + 12, y + 62, w - 24, 14, INK);
    return h;
  }
  if (sel.kind === 'rival') {
    const opp = Run.opponent(run); h = 150;
    panel(x, y, w, h, { tint: opp.col, tintA: 0.2 });
    T(opp.name, x + 12, y + 28, 21, INK, 'left', FH);
    T(opp.plan, x + 12, y + 50, 15, opp.col, 'left', FH);
    let yy = wrap(opp.blurb, x + 12, y + 72, w - 24, 14, INK);
    T(`Level ${opp.level} · record vs you ${opp.w}-${opp.l}`, x + 12, yy + 10, 13, '#5a4a3a', 'left', FB);
    return h;
  }
  return 0;
}
function wrap(text, x, y, w, size, col, font = FB) {
  g.font = `${size}px ${font}`;
  const words = String(text).split(' '); let line = '';
  for (const wd of words) {
    const t = line ? line + ' ' + wd : wd;
    if (g.measureText(t).width > w && line) { T(line, x, y, size, col, 'left', font); y += size * 1.25; line = wd; } else line = t;
  }
  if (line) { T(line, x, y, size, col, 'left', font); y += size * 1.25; }
  return y;
}

function drawRightPanel() {
  const r = L.right, run = S.run;
  // rival card always visible at the top
  const opp = Run.opponent(run);
  panel(r.x, r.y, r.w, 78, { tint: opp.col, tintA: 0.2 });
  T(S.phase === 'fight' ? 'Fighting' : 'Next rival', r.x + 10, r.y + 18, 12, 'rgba(42,34,48,0.6)', 'left', FB);
  fitT(opp.name, r.x + 10, r.y + 42, 19, r.w - 20, INK, 'left', FH);
  fitT(opp.plan + ` · lvl ${opp.level}`, r.x + 10, r.y + 64, 14, r.w - 20, shadeHex(opp.col, -0.25), 'left', FH);
  hit(r.x, r.y, r.w, 78, () => { S.sel = { kind: 'rival' }; sfx('tick'); });
  const ih = infoCard(r.x, r.y + 88, r.w, L.fightBtn.y - r.y - 96);
  if (!ih) {
    // rival history / hints
    let y = r.y + 104;
    T('How it works', r.x + 6, y, 16, INK, 'left', FH); y += 8;
    const tips = S.phase === 'fight' ? ['Your units fight on their own.', 'Tap a fighter to inspect it.', 'Space changes the speed.'] : ['Tap a card to buy. Drag units onto the board.', 'Three of a kind combine into ★★, three ★★ into ★★★.', 'Every 10 gold you hold pays 1 interest.', 'Drag a unit onto the shop to sell it.', `Win ${WINS_TO_WIN} fights before your hearts run out.`];
    for (const tip of tips) y = wrap('· ' + tip, r.x + 6, y + 16, r.w - 12, 13, 'rgba(42,34,48,0.75)') - 6;
    // match log
    y += 22;
    if (run.history.length) {
      T('Results', r.x + 6, y, 16, INK, 'left', FH); y += 6;
      const hs = run.history.slice(-8);
      hs.forEach((h, i) => { const rv = run.rivals.find(x => x.id === h.rival); const cx = r.x + 14 + i * 24; g.fillStyle = h.result === 0 ? '#4a9a5a' : h.result === 1 ? '#c8402e' : '#a8a090'; g.beginPath(); g.arc(cx, y + 16, 9, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 1.2; g.stroke(); T(h.result === 0 ? 'W' : h.result === 1 ? 'L' : 'D', cx, y + 20.5, 11, '#fff', 'center', FH); });
    }
  }
  drawFightButton(L.fightBtn);
}

function drawLeftPanel() {
  drawTraits(L.traits, false);
  panel(L.items.x, L.items.y, L.items.w, L.items.h, { fill: '#e6d8b8', r: 8, lw: 1, shadow: false });
  drawItems(L.items);
  const b = L.leftBtns, bh = b.bh;
  if (S.phase === 'shop') {
    shopButtons({ xp: { x: b.x, y: b.y, w: b.w, h: bh }, roll: { x: b.x, y: b.y + bh + L.pad, w: b.w - bh - 6, h: bh }, lock: { x: b.x + b.w - bh, y: b.y + bh + L.pad, w: bh, h: bh } });
  } else {
    panel(b.x, b.y, b.w, b.h, { fill: '#e6d8b8', shadow: false });
    T(`Level ${S.run.level}`, b.x + b.w / 2, b.y + b.h / 2 + 2, 20, INK, 'center', FH);
    T('shop opens after the fight', b.x + b.w / 2, b.y + b.h / 2 + 22, 12, 'rgba(42,34,48,0.6)', 'center', FB);
  }
}

function drawPortraitPanels() {
  drawTraits(L.traits, true);
  panel(L.items.x, L.items.y, L.items.w, L.items.h, { fill: '#e6d8b8', r: 8, lw: 1, shadow: false });
  drawItems(L.items);
  const b = L.btns, gap = 6;
  if (S.phase === 'shop') {
    const w1 = (b.w - gap * 3) * 0.27, w2 = (b.w - gap * 3) * 0.24, w3 = b.h, w4 = b.w - w1 - w2 - w3 - gap * 3;
    shopButtons({ xp: { x: b.x, y: b.y, w: w1, h: b.h }, roll: { x: b.x + w1 + gap, y: b.y, w: w2, h: b.h }, lock: { x: b.x + w1 + w2 + gap * 2, y: b.y, w: w3, h: b.h } });
    drawFightButton({ x: b.x + b.w - w4, y: b.y, w: w4, h: b.h });
  } else {
    drawDamageMeter(L.shop, false);
    drawFightButton({ x: b.x, y: b.y, w: b.w, h: b.h });
  }
  // popup info above the bench
  // unit cards sit over the rival's half while shopping (your board stays usable)
  // and over the damage meter during a fight; other cards drop over the arena
  if (S.sel) {
    const unitLike = S.sel.kind === 'unit' || S.sel.kind === 'fighter';
    const w = Math.min(W - 16, 420), x = (W - w) / 2;
    if (unitLike && S.phase === 'shop') infoCard(x, L.arena.y - 4, w, Math.max(150, L.c * 2 + 4), { mini: true });
    else if (unitLike) infoCard(x, L.items.y, w, L.shop.y + L.shop.h - L.items.y, { mini: true });
    else infoCard(x, L.arena.y + 6, w, L.arena.h - 12);
  }
}

function drawGame(dt) {
  const run = S.run;
  // shake only the arena
  g.save();
  if (S.shake > 0) { const m = S.shake * L.c * 0.12; g.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m); }
  drawArena();
  S.fightHot = [];
  if (S.phase === 'shop') { S.fx.draw(g, L.arena.x, L.arena.y + L.c * 0.3, L.c, FH); drawShopPhaseBoard(); }
  else if (S.battle) { S.fx.draw(g, L.arena.x, L.arena.y + L.c * 0.3, L.c, FH, 'stain'); }
  if (S.phase === 'fight' && S.battle) {
    drawFightUnits();
    // particles on top of units
    S.fx.draw(g, L.arena.x, L.arena.y + L.c * 0.3, L.c, FH, 'parts');
    const b = S.battle;
    if (b.t > FIGHT_SOFT - 5 && !b.over) { const left = Math.max(0, FIGHT_SOFT - b.t); T(left > 0 ? `Ink storm in ${left.toFixed(0)}` : 'INK STORM: everyone is hurting', L.arena.x + L.arena.w / 2, L.arena.y + 22, 16, '#a83a2a', 'center', FH, { stroke: P0 }); }
    // tap a fighter for info
    for (const f of S.fightHot) hit(f.x, f.y, f.w, f.h, () => { S.sel = { kind: 'fighter', u: f.u }; sfx('tick'); });
  }
  g.restore();
  drawTopBar();
  drawBench();
  if (S.phase === 'shop') drawShop();
  if (L.portrait) drawPortraitPanels(); else { drawLeftPanel(); drawRightPanel(); if (S.phase === 'fight') drawDamageMeter(L.shop, true); }
  // merge pops
  if (S.pops) { for (const p of S.pops) { p.t += dt; const k = p.t / 0.9; g.save(); g.globalAlpha = 1 - k; g.strokeStyle = p.star === 3 ? '#e8b83a' : '#a8b8d8'; g.lineWidth = 4 * (1 - k); g.beginPath(); g.arc(p.x, p.y, 10 + k * L.c * 0.8, 0, 7); g.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * 7 + k * 2; icon(g, 'star', p.x + Math.cos(a) * k * L.c * 0.7, p.y + Math.sin(a) * k * L.c * 0.5, 6, INK, p.star === 3 ? '#e8b83a' : '#d8dce8'); } g.restore(); } S.pops = S.pops.filter(p => p.t < 0.9); }
  // trait tooltip (desktop hover)
  if (S.tip && !L.portrait) { const tr = TRAITS[S.tip.id]; const w = 260; const x = S.tip.x, y = clamp(S.tip.y, 60, H - 160); panel(x, y, w, 30 + tr.t.length * 20 + (tr.all6 ? 18 : 0), { tint: tr.col, tintA: 0.15 }); let yy = y + 22; tr.t.forEach((bp, k) => { yy = wrap(`(${bp}) ` + tr.text(tr.v[k]), x + 10, yy, w - 20, 13, INK); }); if (tr.all6) wrap(tr.all6, x + 10, yy, w - 20, 13, '#5a4a3a'); }
  S.tip = null;
  // drag ghost
  const d = S.drag;
  if (d && d.moved) {
    if (d.kind === 'item') { g.save(); g.fillStyle = P0; g.beginPath(); g.arc(d.x, d.y, 20, 0, 7); g.fill(); g.strokeStyle = INK; g.lineWidth = 2; g.stroke(); icon(g, ITEM[d.id].icon, d.x, d.y, 12, INK, ITEM[d.id].col); g.restore(); }
    else drawUnitAt(g, d.id, d.x, d.y + L.c * 0.35, L.c * 1.1 * (1 + (d.star - 1) * 0.08), { alpha: 0.9 });
  }
  // bought units hopping to their seat
  for (const f of S.flies) {
    f.t += dt; const k = clamp(f.t / f.dur, 0, 1), e = 1 - (1 - k) * (1 - k);
    const x = f.x0 + (f.x1 - f.x0) * e, y = f.y0 + (f.y1 - f.y0) * e - Math.sin(Math.PI * k) * L.c * 0.6;
    drawUnitAt(g, f.id, x, y, f.s0 + (f.s1 - f.s0) * e);
    if (k >= 1) { S.land[f.nid] = 0; sfx('drop'); }
  }
  S.flies = S.flies.filter(f => f.t < f.dur);
  for (const n in S.land) S.land[n] += dt;
  // coins flying to the purse
  for (const c of S.coins) {
    c.t += dt; if (c.t < 0) continue;
    const k = clamp(c.t / c.dur, 0, 1), e = k * k;
    const x = c.x0 + (c.x1 - c.x0) * e, y = c.y0 + (c.y1 - c.y0) * e - Math.sin(Math.PI * k) * c.arc;
    icon(g, 'gold', x, y, 7 + 3 * (1 - k));
    if (k >= 1) { c.done = true; S.goldBump = 1; sfx('coin', 0.03); }
  }
  S.coins = S.coins.filter(c => !c.done);
  S.goldBump = Math.max(0, S.goldBump - dt * 5);
  drawCoach();
  if (S.phase === 'fight') updateFight(dt);
}

// ---------------------------------------------------------------- first-run coach
// A bouncing ink arrow + one short line, only in your first run's opening rounds:
// buy a unit -> put it on the board -> fight. Never blocks input.
function drawCoach() {
  const run = S.run;
  if (S.save.coached || !run || S.phase !== 'shop' || S.modal || S.drag || S.sel || run.round > 2) return;
  const owned = run.bench.filter(Boolean).length + Run.boardCount(run);
  let tx, ty, text, up = false;
  if (!owned) { const r = shopCardRect(run.shop.findIndex(Boolean) >= 0 ? run.shop.findIndex(Boolean) : 0); tx = r.x + r.w / 2; ty = r.y + 4; text = 'Tap a unit to buy it'; }
  else if (!Run.boardCount(run)) { const bi = run.bench.findIndex(Boolean); const r = benchRect(bi); tx = r.x + r.w / 2; ty = r.y + 2; text = 'Drag it up onto your board'; }
  else if (run.gold >= 3 && owned < 3 && run.round === 1) { const r = shopCardRect(run.shop.findIndex(Boolean) >= 0 ? run.shop.findIndex(Boolean) : 0); tx = r.x + r.w / 2; ty = r.y + 4; text = 'Buy more: you have gold to spend'; }
  else if (S.fightRect) { const r = S.fightRect; tx = r.x + r.w / 2; ty = r.y + 2; text = 'Ready? Press FIGHT!'; }
  else return;
  const bob = Math.abs(Math.sin(S.t * 5)) * 10;
  g.save();
  g.translate(tx, ty - 10 - bob);
  g.fillStyle = '#e88a5a'; g.strokeStyle = INK; g.lineWidth = 2.5; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(-14, -18); g.lineTo(-6, -18); g.lineTo(-6, -36); g.lineTo(6, -36); g.lineTo(6, -18); g.lineTo(14, -18); g.closePath(); g.fill(); g.stroke();
  g.restore();
  g.font = `17px ${FH}`; const tw = g.measureText(text).width + 28;
  const bx = clamp(tx - tw / 2, 8, W - tw - 8), by = ty - 84 - bob * 0.3;
  panel(bx, by, tw, 32, { r: 16, fill: '#fff8e8', lw: 2, stroke: '#c86a3a' });
  T(text, bx + tw / 2, by + 22, 17, INK, 'center', FH);
}

// ---------------------------------------------------------------- modals
function drawModal() {
  g.save(); g.fillStyle = 'rgba(30,22,30,0.55)'; g.fillRect(0, 0, W, H); g.restore();
  S.hot = S.hot.filter(h => h.modal); // only modal buttons work underneath
  hit(0, 0, W, H, () => { if (S.modal !== 'items') S.modal = null; }, { modal: true });
  const w = Math.min(W - 24, 560), x = (W - w) / 2;
  if (S.modal === 'items') {
    const ch = S.run.itemChoice; if (!ch) { S.modal = null; return; }
    const h = Math.min(H - 40, 330), y = (H - h) / 2;
    panel(x, y, w, h);
    T('Treasure! Choose one item', x + w / 2, y + 40, 26, INK, 'center', FH);
    const cw = (w - 48) / 3;
    ch.forEach((id, i) => {
      const it = ITEM[id], cx = x + 12 + i * (cw + 12), cy = y + 64, chh = h - 84;
      const hov = hovering(cx, cy, cw, chh);
      panel(cx, cy - (hov ? 3 : 0), cw, chh, { tint: it.col, tintA: hov ? 0.35 : 0.2, lw: hov ? 2.6 : 1.6 });
      icon(g, it.icon, cx + cw / 2, cy + chh * 0.3, Math.min(cw * 0.2, 30), INK, it.col);
      fitT(it.name, cx + cw / 2, cy + chh * 0.6, 18, cw - 12, INK, 'center', FH);
      let yy = cy + chh * 0.6 + 12; g.font = `13px ${FB}`;
      const words = it.text.split(' '); let line = '';
      for (const wd of words) { const t = line ? line + ' ' + wd : wd; if (g.measureText(t).width > cw - 14 && line) { T(line, cx + cw / 2, yy + 8, 13, INK, 'center', FB); yy += 16; line = wd; } else line = t; }
      T(line, cx + cw / 2, yy + 8, 13, INK, 'center', FB);
      T(`(${i + 1})`, cx + cw / 2, cy + chh - 8, 12, 'rgba(42,34,48,0.5)', 'center', FB);
      hit(cx, cy, cw, chh, () => pickItem(id), { modal: true });
    });
    return;
  }
  if (S.modal === 'menu') {
    const h = 300, y = (H - h) / 2;
    panel(x, y, w, h);
    T('Paused', x + w / 2, y + 44, 28, INK, 'center', FH);
    const bw = Math.min(260, w - 40), bx = x + (w - bw) / 2;
    const mb = (yy, label, fn, col) => { button(bx, yy, bw, 46, label, fn, { col }); S.hot[S.hot.length - 1].modal = true; };
    mb(y + 70, 'Resume', () => { S.modal = null; sfx('click'); }, '#bcd0e8');
    mb(y + 124, 'How to play', () => { S.modal = 'help'; sfx('click'); }, '#e8d3a8');
    mb(y + 178, isMuted() ? 'Sound: off' : 'Sound: on', toggleMute, '#d8ccb4');
    mb(y + 232, 'Abandon run', () => { if (S.run) { S.run.hearts = 0; S.run.over = true; S.battle = null; finishRun(); } S.modal = null; }, '#f0c0a8');
    return;
  }
  if (S.modal === 'help') {
    const h = Math.min(H - 30, w < 450 ? 600 : 470), y = (H - h) / 2;
    panel(x, y, w, h);
    T('How to play', x + w / 2, y + 40, 28, INK, 'center', FH);
    const lines = [
      ['Shop', 'Tap a card to buy it (or drag it onto the board). Reroll for 1 gold, buy xp for 4. Drag a unit onto the shop to sell it.'],
      ['Board', `You can field as many units as your level. Front row takes the hits, back row shoots.`],
      ['Combine', 'Three copies of a unit merge into a ★★ version. Three ★★ make a ★★★.'],
      ['Traits', 'Units share traits (Knight, Mage, Sylvan...). Field 2, 4 or 6 different ones to switch bonuses on.'],
      ['Fight', 'Fights play themselves. Win and gain a trophy; lose and you lose a heart.'],
      ['Gold', 'Each round pays 5, plus 1 per 10 gold held (max 5), plus streak bonuses.'],
      ['Items', 'Treasure every few rounds. Drag items onto units (3 each).'],
      ['Goal', `${WINS_TO_WIN} trophies before your ${START_HEARTS} hearts run out. Climb the ladder.`],
      ['Keys', 'D reroll · F level · L lock shop · E sell · Space fight / speed · M mute'],
    ];
    let yy = y + 74;
    for (const [k, v] of lines) { T(k, x + 20, yy, 16, '#6a4a2a', 'left', FH); yy = wrap(v, x + 104, yy, w - 124, 14, INK) + 6; if (yy > y + h - 60) break; }
    button(x + w / 2 - 90, y + h - 56, 180, 44, 'Got it', () => { S.modal = null; sfx('click'); }, { col: '#bcd0e8' }); S.hot[S.hot.length - 1].modal = true;
  }
}

// ---------------------------------------------------------------- title
function drawTitle(dt) {
  const sv = S.save;
  // parade of units walking along the bottom
  if (!S.parade.length) for (let i = 0; i < 9; i++) S.parade.push({ id: UNITS[(Math.random() * UNITS.length) | 0].id, x: Math.random() * W, sp: 30 + Math.random() * 30, ph: Math.random() * 6 });
  const gy = H * 0.9;
  g.save(); g.strokeStyle = 'rgba(42,34,48,0.3)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, gy + 2); g.lineTo(W, gy + 2); g.stroke(); g.restore();
  for (const p of S.parade) {
    p.x += p.sp * dt; if (p.x > W + 80) { p.x = -80; p.id = UNITS[(Math.random() * UNITS.length) | 0].id; }
    const hop = Math.abs(Math.sin(S.t * 6 + p.ph)) * 5;
    drawUnitAt(g, p.id, p.x, gy - hop, Math.min(110, H * 0.13));
  }
  // title
  const ts = clamp(Math.min(W * 0.12, H * 0.12), 40, 110);
  const ty = L.portrait ? H * 0.26 : H * 0.2;
  g.save();
  const R = prng(7);
  T('AUTO ARENA', W / 2 + 4, ty + 5, ts, 'rgba(42,34,48,0.25)', 'center', FH);
  T('AUTO ARENA', W / 2, ty, ts, INK, 'center', FH);
  T('an ink & watercolour auto-battler', W / 2, ty + ts * 0.5, ts * 0.26, '#6a4a3a', 'center', FB);
  g.restore();
  // play
  const bw = Math.min(W - 40, 360), bx = (W - bw) / 2;
  let y = ty + ts * 0.8;
  const has = !!sv.run;
  const pulse = 1 + Math.sin(S.t * 3) * 0.02;
  g.save(); g.translate(W / 2, y + 40); g.scale(pulse, pulse); g.translate(-W / 2, -y - 40);
  button(bx, y, bw, 80, has ? 'CONTINUE' : 'PLAY', () => has ? continueRun() : startRun(), { col: '#e88a5a', size: 42, sub: has ? `round ${sv.run.round} · ${sv.run.wins} wins` : '' });
  g.restore();
  y += 94;
  if (has) { button(bx, y, bw, 44, 'New run', () => startRun(), { col: '#e8d3a8', size: 20 }); y += 54; }
  const k = dateKey(), dd = sv.daily.key === k ? sv.daily : null;
  button(bx, y, bw * 0.62 - 5, 50, 'Daily run', () => startRun({ daily: true }), { col: '#bcd0e8', size: 20, sub: dd ? `today's best: ${dd.best} wins` : 'same shops for everyone today' });
  button(bx + bw * 0.62 + 5, y, bw * 0.38 - 5, 50, 'How to play', () => { S.modal = 'help'; sfx('click'); }, { col: '#d8ccb4', size: 17 });
  y += 64;
  // ladder card
  const tier = tierOf(sv.rating), ti = tierIndex(sv.rating), next = TIERS[ti + 1];
  panel(bx, y, bw, 92, { tint: tier.col, tintA: 0.18 });
  T('Ranked ladder', bx + 14, y + 24, 14, 'rgba(42,34,48,0.6)', 'left', FB);
  T(tier.name, bx + 14, y + 52, 26, tier.col === '#2a2230' ? INK : shadeHex(tier.col, -0.2), 'left', FH);
  T(`${sv.rating}`, bx + bw - 14, y + 52, 26, INK, 'right', FH);
  const lo = ti === 0 ? Math.min(900, sv.rating) : tier.min; // Paper's bar starts at 900, not 0
  const pw = bw - 28, pr = next ? (sv.rating - lo) / (next.min - lo) : 1;
  g.fillStyle = 'rgba(42,34,48,0.15)'; rr(bx + 14, y + 64, pw, 9, 4); g.fill();
  g.fillStyle = tier.col; rr(bx + 14, y + 64, Math.max(9, pw * clamp(pr, 0, 1)), 9, 4); g.fill();
  T(next ? `${next.min - sv.rating} to ${next.name}` : 'Top of the ladder', bx + 14, y + 87, 12, '#5a4a3a', 'left', FB);
  T(`${sv.runs} runs · ${sv.victories} won · best ${sv.bestWins} wins`, bx + bw - 14, y + 87, 12, '#5a4a3a', 'right', FB);
  // mute
  button(W - 52, 10, 42, 42, '', toggleMute, { icon: isMuted() ? 'mute' : 'sound', col: '#d8ccb4', r: 10 });
}

// ---------------------------------------------------------------- results
function drawResults(dt) {
  const r = S.result; r.t += dt;
  const w = Math.min(W - 24, 560), x = (W - w) / 2, h = Math.min(H - 24, 520), y = (H - h) / 2;
  panel(x, y, w, h, { tint: r.victory ? '#e8b83a' : '#c8402e', tintA: 0.12 });
  const ts = Math.min(56, w * 0.11);
  T(r.victory ? 'CHAMPION!' : 'Defeated', x + w / 2, y + ts + 14, ts, r.victory ? '#a8781a' : '#a8302a', 'center', FH);
  T(`${r.wins} wins · ${r.losses} losses · reached round ${r.round}`, x + w / 2, y + ts + 46, 17, INK, 'center', FB);
  // trophies
  for (let i = 0; i < WINS_TO_WIN; i++) icon(g, 'trophy', x + w / 2 + (i - (WINS_TO_WIN - 1) / 2) * 26, y + ts + 78, 9, INK, i < r.wins ? '#e8b83a' : '#d8ccb4');
  let yy = y + ts + 112;
  if (!r.daily) {
    const k = clamp(r.t / 1.2, 0, 1), shown = Math.round(r.before + (r.after - r.before) * k);
    const tier = tierOf(shown);
    T(`${r.delta >= 0 ? '+' : ''}${r.delta} rating`, x + w / 2, yy, 22, r.delta >= 0 ? '#3a7a4a' : '#a8302a', 'center', FH);
    T(`${shown} · ${tier.name}`, x + w / 2, yy + 26, 18, INK, 'center', FB);
  } else {
    T(`Daily run · today's best ${S.save.daily.best} wins`, x + w / 2, yy + 10, 18, '#3a5a8a', 'center', FH);
  }
  yy += 48;
  // final board
  const n = r.board.length, s = Math.min(70, (w - 40) / Math.max(1, n));
  r.board.forEach((u, i) => { drawUnitAt(g, u.id, x + w / 2 + (i - (n - 1) / 2) * s, yy + s * 0.95, s * 1.15); starRow(x + w / 2 + (i - (n - 1) / 2) * s, yy + s * 1.15, u.star, 4.5); });
  yy += s * 1.35;
  if (r.mvp) T(`Star of the last fight: ${UNIT[r.mvp.id].name} (${r.mvp.dealt} damage)`, x + w / 2, yy + 8, 14, '#5a4a3a', 'center', FB);
  T(`${r.stats.bought} bought · ${r.stats.rerolls} rerolls · ${r.stats.combines} combines · ${r.stats.star3} ★★★`, x + w / 2, yy + 28, 13, 'rgba(42,34,48,0.6)', 'center', FB);
  const bw = Math.min(260, w - 40);
  button(x + (w - bw) / 2, y + h - 124, bw, 62, 'PLAY AGAIN', () => startRun({ daily: r.daily }), { col: '#e88a5a', size: 28, sub: 'Space' });
  button(x + (w - bw) / 2, y + h - 54, bw, 40, 'Title', () => { S.screen = 'title'; sfx('click'); }, { col: '#d8ccb4', size: 18 });
}

// ---------------------------------------------------------------- frame
let lastT = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  const w0 = performance.now();
  S.t += dt;
  S.hot = [];
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  // paper
  if (paperPat) { g.fillStyle = paperPat; g.fillRect(0, 0, W, H); } else { g.fillStyle = PAPER; g.fillRect(0, 0, W, H); }
  if (S.screen === 'loading') { T('mixing the paints...', W / 2, H / 2, 24, INK, 'center', FH); }
  else if (S.screen === 'title') { drawTitle(dt); }
  else if (S.screen === 'game' && S.run) { drawGame(dt); }
  else if (S.screen === 'results' && S.result) { drawResults(dt); }
  S.fx.update(dt * (S.phase === 'fight' ? Math.min(S.speed, 2) : 1));
  if (S.shopAnim != null) { S.shopAnim += dt; if (S.shopAnim > 1) S.shopAnim = null; }
  if (S.shake > 0) S.shake = Math.max(0, S.shake - dt);
  // banner
  if (S.banner && !S.modal) {
    const b = S.banner; b.t += dt;
    const k = b.t / b.dur, a = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
    if (k >= 1) S.banner = null; else {
      // shop-phase banners sit over the rival half so they never cover your own front row
      const cy = S.screen === 'game' ? L.arena.y + L.arena.h * (S.phase === 'shop' ? 0.25 : 0.5) : H / 2;
      const bw = Math.min(W - 30, 440), bh = 86;
      g.save(); g.globalAlpha = a; const sc = 0.85 + Math.min(1, k / 0.15) * 0.15;
      g.translate(W / 2, cy); g.scale(sc, sc); g.translate(-W / 2, -cy);
      panel(W / 2 - bw / 2, cy - bh / 2, bw, bh, { tint: b.col, tintA: 0.12, lw: 2.2 });
      T(b.big, W / 2, cy + 6, 38, b.col, 'center', FH);
      T(b.small, W / 2, cy + 32, 16, '#5a4a3a', 'center', FB);
      g.restore();
    }
  }
  // toasts
  S.toasts.forEach((t, i) => {
    t.t += dt; const a = t.t < 2.2 ? 1 : Math.max(0, 1 - (t.t - 2.2) / 0.5);
    // newest on top, stacking down from just under the top bar so they never cover your board or buttons
    const fs = clamp(H * 0.022, 13, 16), th = fs * 1.85;
    const y = (S.screen === 'game' ? L.top.h + th * 0.5 + 8 : H - 60) + (S.toasts.length - 1 - i) * (th + 4) * (S.screen === 'game' ? 1 : -1);
    const rise = Math.max(0, 1 - t.t / 0.15) * 8;
    g.save(); g.globalAlpha = a * Math.min(1, t.t / 0.1); g.font = `${fs}px ${FB}`; const tw = Math.min(W - 16, g.measureText(t.text).width + 28);
    panel(W / 2 - tw / 2, y - th * 0.66 - rise, tw, th, { r: th / 2, lw: 1.4, fill: '#fbf5e6' });
    fitT(t.text, W / 2, y + fs * 0.05 - rise, fs, tw - 16, t.col, 'center', FB); g.restore();
  });
  S.toasts = S.toasts.filter(t => t.t < 2.7);
  if (S.modal && (S.screen === 'title' || (S.screen === 'game' && S.run))) drawModal();
  const wk = performance.now() - w0; S.work = S.work ? S.work * 0.95 + wk * 0.05 : wk; S.workMax = Math.max((S.workMax || 0) * 0.995, wk);
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- boot
async function boot() {
  resize();
  requestAnimationFrame(frame);
  try { await Promise.race([Promise.all([document.fonts.load(`20px Fell`), document.fonts.load(`20px Hand`)]), new Promise(r => setTimeout(r, 1500))]); } catch { }
  await new Promise(r => setTimeout(r, 30));
  const tile = paperTile(320, 3, { base: '#f1e7d0' });
  paperPat = g.createPattern(tile, 'repeat');
  preload();
  S.screen = 'title';
  music('title');
  // first visit ever: skip the title and land straight in a run
  if (params.get('play') !== '1' && !S.save.runs && !S.save.run && !params.has('title')) startRun();
  if (params.get('play') === '1') startRun({ seed: params.get('seed') ? +params.get('seed') : undefined, daily: params.get('daily') === '1' });
  if (params.get('help') === '0') S.modal = null;
  window.__ready = true;
}
boot();
document.addEventListener('visibilitychange', () => { if (document.hidden) persist(); });

// ---------------------------------------------------------------- test hooks
window.__G = {
  S, Run, UNIT,
  start: (o) => startRun(o || {}),
  fight: () => startFight(),
  bot: () => { botShop(S.run); persist(); },
  closeModal: () => { S.modal = null; },
  pickItem: i => S.run && S.run.itemChoice && pickItem(S.run.itemChoice[i || 0]),
  // run the current fight to the end instantly
  skip: () => { const b = S.battle; if (!b) return; S.introT = 0; let n = 0; while (!b.over && n++ < 5000) simStep(b); b.events.length = 0; },
  state: () => { const r = S.run; return r ? { screen: S.screen, phase: S.phase, modal: S.modal, round: r.round, gold: r.gold, level: r.level, hearts: r.hearts, wins: r.wins, board: Run.boardCount(r), bench: r.bench.filter(Boolean).length, shop: r.shop.slice(), items: r.items.slice(), over: r.over } : { screen: S.screen, result: S.result && { wins: S.result.wins, victory: S.result.victory, delta: S.result.delta } }; },
  layout: () => L,
  rects: { slot: i => slotRect(i), bench: i => benchRect(i), shop: i => shopCardRect(i), item: i => itemRect(i) },
  save: () => S.save,
  speed: v => { S.speed = v; },
  perf: () => ({ avgMs: +(S.work || 0).toFixed(2), maxMs: +(S.workMax || 0).toFixed(2) }),
};
