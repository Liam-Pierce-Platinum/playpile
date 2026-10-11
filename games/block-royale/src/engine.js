// Pure game rules: board, deals, placement, line clears, the Chips x Mult scoring
// pipeline, rounds, the shop and glyphs. No DOM, no drawing, deterministic from the seed.
import { RNG, stream } from './rng.js';
import {
  FAMILIES, SQUARES, BARS, CHARMS, byId, CHARM_COST, RARITY_WEIGHT, STARTER_CHARMS, GLYPHS, glyphById, GLYPH_COST,
  BOSSES, bossById, deckById, BASE_PLACEMENTS, TARGET_BASE, TARGET_GROWTH, ROUND_MUL, ROUND_GOLD, ANTES,
} from './data.js';

export const N = 8;
const STONE_HP = 2;
let UID = 1;

// ---------------------------------------------------------------- pieces
export const pieceSize = p => p.cells.length;
export function dims(cells) {
  let w = 0, h = 0; for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
  return { w, h };
}
export function rotateCells(cells, dir = 1) {
  const { w, h } = dims(cells);
  return cells.map(([x, y]) => dir > 0 ? [h - 1 - y, x] : [y, w - 1 - x]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
function mkPiece(run, fam, rng) {
  const F = FAMILIES[fam];
  const p = { id: UID++, f: fam, cells: rng.pick(F.v).map(c => c.slice()), c: rng.int(7), mat: '', gem: -1, rot: false };
  const e = run.deck[fam];
  if (e && e.foil) p.mat = 'foil';
  if (e && e.gold) p.mat = 'gold';
  const D = deckById[run.deckId];
  if (D.gildBars && fam.startsWith('bar')) p.mat = 'gold';
  if (D.gem && rng.chance(D.gem)) p.gem = rng.int(p.cells.length);
  return p;
}

// ---------------------------------------------------------------- board helpers
export const idx = (x, y) => y * N + x;
export function canPlace(board, cells, x, y) {
  for (const [cx, cy] of cells) {
    const X = x + cx, Y = y + cy;
    if (X < 0 || Y < 0 || X >= N || Y >= N || board.cells[idx(X, Y)]) return false;
  }
  return true;
}
export function fits(board, cells) {
  const { w, h } = dims(cells);
  for (let y = 0; y <= N - h; y++) for (let x = 0; x <= N - w; x++) if (canPlace(board, cells, x, y)) return true;
  return false;
}
export function pieceFits(board, p) {
  if (!p) return false;
  if (fits(board, p.cells)) return true;
  if (p.rot) { let c = p.cells; for (let k = 0; k < 3; k++) { c = rotateCells(c); if (fits(board, c)) return true; } }
  return false;
}
const clearable = v => v && v.m !== 'void';
// Which rows/cols would be full. A line made only of stone/void never clears.
export function fullLines(board, colsOff) {
  const rows = [], cols = [];
  for (let y = 0; y < N; y++) {
    let full = true, live = false;
    for (let x = 0; x < N; x++) { const v = board.cells[idx(x, y)]; if (!v) { full = false; break; } if (v.m !== 'void' && v.m !== 'stone') live = true; }
    if (full && live) rows.push(y);
  }
  if (!colsOff) for (let x = 0; x < N; x++) {
    let full = true, live = false;
    for (let y = 0; y < N; y++) { const v = board.cells[idx(x, y)]; if (!v) { full = false; break; } if (v.m !== 'void' && v.m !== 'stone') live = true; }
    if (full && live) cols.push(x);
  }
  return { rows, cols };
}
export const linesWithPiece = (board, cells, x, y, colsOff) => {
  const b = { cells: board.cells.slice() };
  for (const [cx, cy] of cells) b.cells[idx(x + cx, y + cy)] = { c: 0, m: 'n' };
  return fullLines(b, colsOff);
};

// ---------------------------------------------------------------- run setup
export function newRun({ mode = 'run', seed, deckId = 'jewel', stake = 0 } = {}) {
  seed = seed || String(Math.floor(Math.random() * 1e9));
  const D = deckById[deckId];
  const deck = {};
  for (const f in D.pool) deck[f] = { w: D.pool[f], foil: false, gold: false };
  const run = {
    v: 1, mode, seed, deckId, stake, ante: 1, ri: 0, gold: 4 + (D.gold || 0),
    charms: [], glyphs: [], glyphSlots: 2, deck, round: null, shop: null, over: false, won: false, secondWind: false,
    stats: { lines: 0, placed: 0, bestHand: 0, bestHandAnte: 0, rounds: 0, spent: 0, maxStreak: 0, quad: false, sweep: false },
    log: [], seen: [],
  };
  if (D.starters) {
    const rng = stream(seed, 'starters');
    const pool = CHARMS.filter(c => c.r === 0 && !c.placements);
    for (let k = 0; k < D.starters; k++) { const c = rng.pick(pool.filter(c => !run.charms.some(s => s.id === c.id))); run.charms.push(mkCharm(c.id)); }
  }
  if (mode === 'zen') { run.charms = []; run.gold = 0; }
  startRound(run);
  return run;
}
export const mkCharm = id => ({ id, v: byId[id].v0 ?? 0 });
export const charmSlots = run => (deckById[run.deckId].slots || 5) + run.charms.reduce((a, s) => a + (byId[s.id].slots || 0), 0);
const passive = (run, key) => run.charms.reduce((a, s) => a + (byId[s.id][key] || 0), 0);
const passiveMax = (run, key, def) => run.charms.reduce((a, s) => Math.max(a, byId[s.id][key] || 0), def);

export function stakeTargetMul(stake) { return stake >= 7 ? 1.8 : stake >= 4 ? 1.45 : stake >= 1 ? 1.2 : 1; }
export function niceRound(n) {
  const mag = Math.pow(10, Math.max(1, Math.floor(Math.log10(n)) - 1));
  return Math.round(n / mag) * mag;
}
export function targetFor(run, ante = run.ante, ri = run.ri) {
  const D = deckById[run.deckId];
  return niceRound(TARGET_BASE * Math.pow(TARGET_GROWTH, ante - 1) * ROUND_MUL[ri] * stakeTargetMul(run.stake) * (D.targetMul || 1));
}
export function bossFor(run, ante = run.ante) {
  const rng = stream(run.seed, 'bosses');
  const order = rng.shuffle(BOSSES.map(b => b.id));
  // ante 1 never gets the two meanest
  if (ante === 1) return order.find(b => b !== 'vise' && b !== 'weight');
  return order[(ante - 1) % order.length];
}

export function startRound(run) {
  const zen = run.mode === 'zen';
  const boss = !zen && run.ri === 2 ? bossFor(run) : null;
  let placements = BASE_PLACEMENTS + passive(run, 'placements') - (run.stake >= 2 ? 2 : 0) - (run.stake >= 6 ? 2 : 0);
  if (boss === 'clock') placements = 14;
  const r = run.round = {
    boss, target: zen ? 0 : targetFor(run), score: 0, left: zen ? Infinity : placements, max: zen ? Infinity : placements,
    board: { cells: new Array(N * N).fill(null) }, tray: [null, null, null], streak: 0, grace: 0,
    dealt: 0, placed: 0, lines: 0, clears: 0, shrinks: 0, won: false, lost: false, stuck: false, undo: null,
    rngDeal: stream(run.seed, 'deal', run.ante, run.ri, run.mode).s, rngEv: stream(run.seed, 'ev', run.ante, run.ri).s,
  };
  if (boss === 'monolith') for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) r.board.cells[idx(x, y)] = { c: 7, m: 'stone', hp: STONE_HP };
  const ev = rngOf(r, 'rngEv');
  for (const s of activeCharms(run)) byId[s.id].roundStart?.(run, s, ev, r.board);
  saveRng(r, 'rngEv', ev);
  const D = deckById[run.deckId];
  if (D.rotateEachAnte && run.ri === 0 && run.glyphs.length < run.glyphSlots && !zen) run.glyphs.push('rotate');
  deal(run);
  return r;
}
const rngOf = (r, k) => { const g = new RNG(1); g.s = r[k]; return g; };
const saveRng = (r, k, g) => { r[k] = g.s; };
export const activeCharms = run => run.charms.filter((s, i) => !(run.round?.boss === 'hush' && i === 0));

// ---------------------------------------------------------------- dealing
export function deal(run) {
  const r = run.round, rng = rngOf(r, 'rngDeal');
  const count = r.boss === 'drip' ? 1 : 3;
  let pool = Object.entries(run.deck).filter(([, e]) => e.w > 0);
  if (r.boss === 'weight') { const big = pool.filter(([f]) => FAMILIES[f].v[0].length >= 4); if (big.length) pool = big; }
  const draw = () => mkPiece(run, rng.weighted(pool, ([, e]) => e.w)[0], rng);
  let pieces;
  // Teaching deal: the very first deal of a run can always make a line (5 + 3 = 8).
  if (run.mode !== 'zen' && run.ante === 1 && run.ri === 0 && r.dealt === 0 && run.deck.bar5 && run.deck.bar3) {
    pieces = [mkPiece(run, 'bar5', rng), mkPiece(run, 'bar3', rng), mkPiece(run, 'sq2', rng)];
    pieces[0].cells = FAMILIES.bar5.v[0].map(c => c.slice()); pieces[1].cells = FAMILIES.bar3.v[0].map(c => c.slice());
  } else {
    for (let a = 0; a < 10; a++) {
      pieces = []; for (let k = 0; k < count; k++) pieces.push(draw());
      if (pieces.some(p => pieceFits(r.board, p))) break;
    }
    if (!pieces.some(p => pieceFits(r.board, p)) && run.deck.dot !== undefined) pieces[pieces.length - 1] = mkPiece(run, 'dot', rng);
  }
  pieces = pieces.map(p => {
    r.dealt++;
    for (const s of activeCharms(run)) { const h = byId[s.id].deal; if (h) p = h(run, s, p, r.dealt, f => mkPiece(run, f, rng), rng) || p; }
    return p;
  });
  r.tray = count === 1 ? [null, pieces[0], null] : pieces;
  saveRng(r, 'rngDeal', rng);
}

// ---------------------------------------------------------------- scoring
function scoreClear(run, info) {
  const r = run.round, D = deckById[run.deckId];
  const events = [];
  let chips = 0, mult = 0, money = 0, slot = -1, src = 'base';
  const push = (kind, amt) => events.push({ src, slot, kind, amt, chips, mult });
  const c = {
    run, round: r, rows: info.rows, cols: info.cols, lines: info.rows.length + info.cols.length, size: info.size,
    streak: r.boss === 'chill' ? 0 : r.streak, piece: info.piece, corner: info.corner, edge: info.edge, boardEmpty: info.boardEmpty,
    colors: new Set(info.cells.map(v => v.c).filter(ci => ci < 7)).size, firstClear: r.clears === 0, place: r.placed, left: r.left,
    bar: BARS.includes(info.piece.f), square: SQUARES.includes(info.piece.f), slots: charmSlots(run),
    stoneBroken: info.stoneBroken, stoneHit: info.stoneHit, firstLineChips: info.firstLineChips,
    colorCount: ci => info.cells.filter(v => v.c === ci).length, matCount: m => info.cells.filter(v => v.m === m).length,
    chips: n => { chips += n; push('chips', n); }, mult: n => { mult += n; push('mult', n); },
    x: n => { mult *= n; push('x', n); }, xchips: n => { chips *= n; push('xchips', n); }, money: n => { money += n; push('money', n); },
  };
  chips = info.cells.reduce((a, v) => a + (v.m === 'gem' ? 30 : 10), 0);
  mult = 1 + c.lines + c.streak + (D.baseMult || 0);
  push('base', 0);
  src = 'mat';
  const foil = c.matCount('foil'), glass = c.matCount('glass'), gold = c.matCount('gold');
  if (foil) c.mult(2 * foil);
  if (glass) c.x(Math.round(Math.pow(1.2, glass) * 100) / 100);
  if (gold) c.money(gold);
  src = 'charm';
  const list = run.charms;
  const fire = (i, depth) => {
    const s = list[i]; if (!s) return;
    if (r.boss === 'hush' && i === 0) return;
    const def = byId[s.id];
    if (def.copy) { if (depth < 2) fire(i + def.copy, depth + 1); return; }
    def.score?.(c, s);
  };
  for (let i = 0; i < list.length; i++) { slot = i; fire(i, 0); }
  const total = Math.floor(chips * mult);
  return { chips, mult, total, money, events };
}

// ---------------------------------------------------------------- placement
export function snapshot(run) {
  const r = run.round;
  return JSON.stringify({ board: r.board, tray: r.tray, score: r.score, left: r.left, streak: r.streak, grace: r.grace, dealt: r.dealt, placed: r.placed,
    lines: r.lines, clears: r.clears, shrinks: r.shrinks, rngDeal: r.rngDeal, rngEv: r.rngEv, gold: run.gold, charms: run.charms, stats: run.stats });
}
function restore(run, snap) {
  const s = JSON.parse(snap), r = run.round;
  Object.assign(r, { board: s.board, tray: s.tray, score: s.score, left: s.left, streak: s.streak, grace: s.grace, dealt: s.dealt, placed: s.placed,
    lines: s.lines, clears: s.clears, shrinks: s.shrinks, rngDeal: s.rngDeal, rngEv: s.rngEv, won: false, lost: false, stuck: false });
  if (r.left === null) r.left = Infinity;
  run.gold = s.gold; run.charms = s.charms; run.stats = s.stats;
}

// Place tray piece ti at (x, y). Returns a result the presentation layer animates.
export function place(run, ti, x, y) {
  const r = run.round, p = r.tray[ti];
  if (!p || r.won || r.lost || !canPlace(r.board, p.cells, x, y)) return null;
  r.undo = snapshot(run);
  const B = r.board.cells, placedIdx = [];
  p.cells.forEach(([cx, cy], k) => {
    const i = idx(x + cx, y + cy);
    B[i] = { c: p.c, m: p.gem === k ? 'gem' : (p.mat || 'n') };
    placedIdx.push(i);
  });
  r.tray[ti] = null; r.left--; r.placed++;
  run.stats.placed++;
  const info = { piece: p, size: p.cells.length, x, y, placedIdx, round: r, board: r.board };
  for (const s of activeCharms(run)) byId[s.id].place?.(run, s, info);

  const { rows, cols } = fullLines(r.board, r.boss === 'pillar');
  const lines = rows.length + cols.length;
  const res = { piece: p, ti, x, y, placedIdx, rows, cols, lines, cleared: [], cracked: [], broken: [], score: null, gold: 0, streak: r.streak, extra: 0 };
  if (lines) {
    const set = new Set();
    for (const y2 of rows) for (let x2 = 0; x2 < N; x2++) set.add(idx(x2, y2));
    for (const x2 of cols) for (let y2 = 0; y2 < N; y2++) set.add(idx(x2, y2));
    const cells = [];
    let stoneBroken = 0, stoneHit = 0, firstLineChips = 0;
    const firstLine = rows.length ? [...Array(N)].map((_, k) => idx(k, rows[0])) : [...Array(N)].map((_, k) => idx(cols[0], k));
    for (const i of firstLine) { const v = B[i]; if (v && v.m !== 'stone' && v.m !== 'void') firstLineChips += v.m === 'gem' ? 30 : 10; }
    for (const i of set) {
      const v = B[i];
      if (!v || v.m === 'void') continue;
      if (v.m === 'stone') { stoneHit++; continue; }
      cells.push({ ...v, i });
    }
    const corner = [...set].some(i => i === 0 || i === N - 1 || i === N * (N - 1) || i === N * N - 1);
    const edge = rows.includes(0) || rows.includes(N - 1) || cols.includes(0) || cols.includes(N - 1);
    // apply removal now so "board empty" is known for scoring
    for (const i of set) {
      const v = B[i]; if (!v || v.m === 'void') continue;
      if (v.m === 'stone') { v.hp = (v.hp || 1) - 1; if (v.hp <= 0) { B[i] = null; stoneBroken++; res.broken.push(i); } else res.cracked.push(i); }
      else B[i] = null;
    }
    const boardEmpty = r.placed > 3 && B.every(v => !v || v.m === 'void');
    Object.assign(info, { rows, cols, lines, cells, corner, edge, boardEmpty, stoneBroken, stoneHit, firstLineChips });
    const sc = scoreClear(run, info);
    res.cleared = cells; res.score = sc; res.boardEmpty = boardEmpty;
    run.gold += sc.money; res.gold = sc.money;
    r.score += sc.total; r.lines += lines; r.clears++; r.streak++; r.grace = passive(run, 'streakGrace');
    run.stats.lines += lines;
    if (sc.total > run.stats.bestHand) { run.stats.bestHand = sc.total; run.stats.bestHandAnte = run.ante; }
    run.stats.maxStreak = Math.max(run.stats.maxStreak, r.streak);
    if (lines >= 4) run.stats.quad = true;
    if (boardEmpty) run.stats.sweep = true;
    const ev = rngOf(r, 'rngEv');
    for (const s of activeCharms(run)) byId[s.id].after?.(run, s, info, ev);
    saveRng(r, 'rngEv', ev);
    res.extra = info.extra || 0; res.gilded = info.gilded;
  } else if (r.grace > 0) r.grace--;
  else r.streak = 0;
  res.streakAfter = r.streak;

  // The Vise: every 6 placements an edge of the board turns to void.
  if (r.boss === 'vise' && r.placed % 6 === 0 && r.shrinks < 4) {
    const k = r.shrinks++, line = [];
    for (let t = 0; t < N; t++) line.push(k === 0 ? idx(t, 0) : k === 1 ? idx(0, t) : k === 2 ? idx(t, N - 1) : idx(N - 1, t));
    for (const i of line) B[i] = { c: 7, m: 'void' };
    res.shrunk = line;
  }

  if (r.tray.every(t => !t)) { deal(run); res.dealt = true; }
  checkEnd(run);
  if (r.windFired) { r.windFired = false; res.secondWind = true; res.dealt = true; }
  res.won = r.won; res.lost = r.lost; res.stuck = r.stuck;
  return res;
}

// What placing tray piece ti at (x, y) would score, without touching the run (Balatro
// shows a hand's value before you play it; this does the same for a drag or cursor).
// Runs `place` on a JSON clone, so charm state (Glutton, Snowball...) counts correctly.
let PV = { key: '', out: null };
export function preview(run, ti, x, y) {
  const r = run.round;
  const key = `${run.seed}|${run.ante}|${run.ri}|${r.placed}|${r.score}|${ti}|${x}|${y}`;
  if (PV.key === key) return PV.out;
  let out = null;
  const p = r.tray[ti];
  if (p && canPlace(r.board, p.cells, x, y)) {
    const { rows, cols } = linesWithPiece(r.board, p.cells, x, y, r.boss === 'pillar');
    if (rows.length || cols.length) {
      const clone = JSON.parse(JSON.stringify(run));
      if (clone.round.left === null) clone.round.left = Infinity;
      const res = place(clone, ti, x, y);
      if (res && res.score) out = { chips: res.score.chips, mult: res.score.mult, total: res.score.total, money: res.score.money, lines: res.lines, won: clone.round.won, streak: res.streakAfter };
    }
  }
  PV = { key, out };
  return out;
}

export const RESCUE = ['redeal', 'bomb', 'shrink', 'undo'];
// Second Wind: once per run (Run and Daily below Silver stake) a board-full with no rescue
// glyph reshuffles the tray instead of ending the run. A loss should come from the target,
// not from the deal, the first time someone plays.
export const windAllowed = run => run.mode !== 'zen' && run.stake < 2 && !run.secondWind;
export function checkEnd(run) {
  const r = run.round;
  r.stuck = false;
  if (run.mode !== 'zen' && r.score >= r.target) { r.won = true; return; }
  let canMove = r.tray.some(p => pieceFits(r.board, p));
  if (!canMove && r.left > 0 && windAllowed(run) && !run.glyphs.some(g => RESCUE.includes(g))) {
    run.secondWind = true; r.windFired = true; r.undo = null;
    r.dealt = Math.max(r.dealt, 3); deal(run);
    canMove = r.tray.some(p => pieceFits(r.board, p));
  }
  if (!canMove) {
    r.stuck = true;
    if (run.mode === 'zen' || !run.glyphs.some(g => RESCUE.includes(g))) r.lost = true;
  } else if (r.left <= 0) r.lost = true;
}

// ---------------------------------------------------------------- end of round
export function roundRewards(run) {
  const r = run.round, lines = [];
  const base = run.stake >= 3 && run.ri === 0 ? 0 : ROUND_GOLD[run.ri];
  lines.push({ label: run.ri === 2 ? 'Boss beaten' : 'Round cleared', amt: base });
  const spare = Math.floor(r.left / 2);
  if (spare) lines.push({ label: `${r.left} placements left`, amt: spare });
  for (const s of run.charms) { const g = byId[s.id].roundEnd?.(run, s); if (g) lines.push({ label: byId[s.id].name, amt: g }); }
  const cap = passiveMax(run, 'interestCap', 5);
  const interest = Math.min(cap, Math.floor(run.gold / 5));
  if (interest) lines.push({ label: `Interest ($1 per $5, max $${cap})`, amt: interest });
  const total = lines.reduce((a, l) => a + l.amt, 0);
  return { lines, total };
}
export function finishRound(run) {
  const rew = roundRewards(run);
  run.gold += rew.total;
  run.stats.rounds++;
  run.log.push({ ante: run.ante, ri: run.ri, score: run.round.score, target: run.round.target, won: true });
  if (run.ante === ANTES && run.ri === 2) { run.won = true; run.over = true; return rew; }
  openShop(run);
  return rew;
}
export function nextRound(run) {
  run.shop = null;
  run.ri++;
  if (run.ri > 2) { run.ri = 0; run.ante++; }
  startRound(run);
}

// ---------------------------------------------------------------- shop
const priceUp = run => (run.stake >= 5 ? 1 : 0) + (deckById[run.deckId].priceUp || 0);
export const charmPrice = (run, id) => CHARM_COST[byId[id].r] + priceUp(run);
export const glyphPrice = run => GLYPH_COST + priceUp(run);
export const sellPrice = (run, id) => Math.max(1, Math.floor(charmPrice(run, id) / 2));
export function rerollPrice(run) {
  const s = run.shop; if (!s) return 0;
  if (s.free > 0) return 0;
  return Math.max(0, 4 + s.rerolls - passive(run, 'rerollDiscount'));
}
function genOffers(run) {
  const s = run.shop;
  const rng = stream(run.seed, 'shop', run.ante, run.ri, s.rerolls);
  const D = deckById[run.deckId];
  const owned = new Set(run.charms.map(c => c.id));
  const offers = [];
  const first = run.ante === 1 && run.ri === 0 && s.rerolls === 0 && run.mode !== 'zen';
  if (first) for (const id of STARTER_CHARMS.slice(0, 2)) if (!owned.has(id)) offers.push(id);
  while (offers.length < 3) {
    let r = rng.weighted([0, 1, 2, 3], k => (D.copperOnly && k > 0) ? 0 : RARITY_WEIGHT[k] * (k >= 2 ? Math.min(1.6, 0.7 + run.ante * 0.12) : 1));
    const pool = CHARMS.filter(c => c.r === r && !owned.has(c.id) && !offers.includes(c.id));
    if (!pool.length) { if (!CHARMS.some(c => !owned.has(c.id) && !offers.includes(c.id))) break; continue; }
    offers.push(rng.pick(pool).id);
  }
  s.charms = offers.map(id => ({ id, sold: false }));
  const gl = rng.shuffle(GLYPHS.map(g => g.id)).slice(0, 2);
  s.glyphs = gl.map(id => ({ id, sold: false }));
  if (s.rerolls === 0) s.edit = genEdit(run, rng);
  for (const o of offers) if (!run.seen.includes(o)) run.seen.push(o);
}
function genEdit(run, rng) {
  const active = Object.keys(run.deck).filter(f => run.deck[f].w > 0);
  const opts = [];
  if (active.length > 5) for (const f of active) if (!['sq2', 'bar3', 'bar5'].includes(f)) opts.push({ t: 'remove', f, cost: 3, w: 1 });
  for (const f of Object.keys(FAMILIES)) if (!run.deck[f] || run.deck[f].w === 0) if (['plus', 'diag', 'sq3', 'rect', 'bigL', 'bar5'].includes(f)) opts.push({ t: 'add', f, cost: 3, w: 1 });
  for (const f of active) if (!run.deck[f].foil && !run.deck[f].gold) { opts.push({ t: 'foil', f, cost: 5, w: 0.8 }); opts.push({ t: 'gild', f, cost: 5, w: 0.6 }); }
  if (!opts.length) return null;
  const o = rng.weighted(opts, o => o.w);
  return { ...o, cost: o.cost + priceUp(run), sold: false };
}
export function editText(e) {
  const n = FAMILIES[e.f].name;
  return e.t === 'remove' ? { title: 'Cut', d: `Remove ${n} from your deck` }
    : e.t === 'add' ? { title: 'Add', d: `Add ${n} to your deck` }
    : e.t === 'foil' ? { title: 'Foil', d: `${n[0].toUpperCase() + n.slice(1)} are always foil (+2 Mult per block)` }
    : { title: 'Gild', d: `${n[0].toUpperCase() + n.slice(1)} are always gold ($1 per block)` };
}
export function openShop(run) {
  run.shop = { rerolls: 0, free: passive(run, 'freeReroll'), charms: [], glyphs: [], edit: null };
  genOffers(run);
}
export function reroll(run) {
  const cost = rerollPrice(run);
  if (run.gold < cost) return false;
  run.gold -= cost; run.stats.spent += cost;
  if (run.shop.free > 0) run.shop.free--;
  run.shop.rerolls++;
  const keepEdit = run.shop.edit;
  genOffers(run); run.shop.edit = keepEdit;
  return true;
}
const bought = run => { for (const s of run.charms) byId[s.id].buy?.(run, s); };
export function buyCharm(run, k) {
  const o = run.shop.charms[k]; if (!o || o.sold) return 'gone';
  const cost = charmPrice(run, o.id);
  if (run.gold < cost) return 'gold';
  if (run.charms.length >= charmSlots(run) && !byId[o.id].slots) return 'full';
  run.gold -= cost; run.stats.spent += cost; o.sold = true;
  run.charms.push(mkCharm(o.id)); bought(run);
  return 'ok';
}
export function buyGlyph(run, k) {
  const o = run.shop.glyphs[k]; if (!o || o.sold) return 'gone';
  const cost = glyphPrice(run);
  if (run.gold < cost) return 'gold';
  if (run.glyphs.length >= run.glyphSlots) return 'full';
  run.gold -= cost; run.stats.spent += cost; o.sold = true;
  run.glyphs.push(o.id); bought(run);
  return 'ok';
}
export function buyEdit(run) {
  const e = run.shop.edit; if (!e || e.sold) return 'gone';
  if (run.gold < e.cost) return 'gold';
  run.gold -= e.cost; run.stats.spent += e.cost; e.sold = true;
  if (e.t === 'remove') run.deck[e.f].w = 0;
  else if (e.t === 'add') run.deck[e.f] = { w: e.f === 'plus' ? 1.6 : 1.4, foil: false, gold: false };
  else if (e.t === 'foil') run.deck[e.f].foil = true;
  else run.deck[e.f].gold = true;
  bought(run);
  return 'ok';
}
export function sellCharm(run, slot) {
  const s = run.charms[slot]; if (!s) return 0;
  const g = sellPrice(run, s.id);
  run.charms.splice(slot, 1); run.gold += g;
  return g;
}
export function moveCharm(run, slot, dir) {
  const j = slot + dir; if (j < 0 || j >= run.charms.length) return false;
  [run.charms[slot], run.charms[j]] = [run.charms[j], run.charms[slot]];
  return true;
}

// ---------------------------------------------------------------- glyphs
export function useGlyph(run, gi, target) {
  const g = run.glyphs[gi], r = run.round;
  if (!g || r.won || r.lost) return null;
  const out = { g };
  if (glyphById[g].t === 'piece') {
    const p = r.tray[target]; if (!p) return null;
    if (g === 'rotate') { p.rot = true; p.cells = rotateCells(p.cells); }
    else if (g === 'gild') p.mat = 'gold';
    else if (g === 'foil') p.mat = 'foil';
    else if (g === 'shrink') { p.cells = [[0, 0]]; p.f = 'dot'; p.gem = -1; }
  } else if (g === 'bomb') {
    const cx = target % N, cy = Math.floor(target / N), hit = [];
    r.undo = null;
    for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) {
      if (x < 0 || y < 0 || x >= N || y >= N) continue;
      const i = idx(x, y), v = r.board.cells[i];
      if (v && v.m !== 'void') { hit.push({ ...v, i }); r.board.cells[i] = null; }
    }
    out.hit = hit;
  } else if (g === 'redeal') { r.undo = null; r.dealt = Math.max(r.dealt, 3); deal(run); }
  else if (g === 'extend') { r.left += 3; r.max += 3; }
  else if (g === 'undo') { if (!r.undo) return null; restore(run, r.undo); r.undo = null; }
  run.glyphs.splice(gi, 1);
  checkEnd(run);
  if (r.windFired) { r.windFired = false; out.secondWind = true; }
  out.won = r.won; out.lost = r.lost;
  return out;
}
export function rotatePiece(run, ti, dir) {
  const p = run.round.tray[ti]; if (!p || !p.rot) return false;
  p.cells = rotateCells(p.cells, dir); return true;
}

// ---------------------------------------------------------------- bot
// Greedy evaluator used by the title-screen attract board, the tests and tools/sim.mjs.
const PROBES = [FAMILIES.sq3.v[0], FAMILIES.bar5.v[0], FAMILIES.bar5.v[1], FAMILIES.bigL.v[0], FAMILIES.bar4.v[0], FAMILIES.sq2.v[0]];
function evalBoard(cells) {
  const b = { cells };
  let s = 0;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = cells[idx(x, y)];
    if (v) continue;
    let nb = 0;
    if (x === 0 || cells[idx(x - 1, y)]) nb++;
    if (x === N - 1 || cells[idx(x + 1, y)]) nb++;
    if (y === 0 || cells[idx(x, y - 1)]) nb++;
    if (y === N - 1 || cells[idx(x, y + 1)]) nb++;
    if (nb === 4) s -= 14; else if (nb === 3) s -= 4;
    s += 1.2;
  }
  for (let y = 0; y < N; y++) for (let x = 1; x < N; x++) { if (!!cells[idx(x, y)] !== !!cells[idx(x - 1, y)]) s -= 0.6; if (!!cells[idx(y, x)] !== !!cells[idx(y, x - 1)]) s -= 0.6; }
  for (const p of PROBES) if (fits(b, p)) s += 6;
  return s;
}
export function botMove(run) {
  const r = run.round; let best = null;
  r.tray.forEach((p, ti) => {
    if (!p) return;
    const { w, h } = dims(p.cells);
    for (let y = 0; y <= N - h; y++) for (let x = 0; x <= N - w; x++) {
      if (!canPlace(r.board, p.cells, x, y)) continue;
      const cells = r.board.cells.slice();
      for (const [cx, cy] of p.cells) cells[idx(x + cx, y + cy)] = { c: 0, m: 'n' };
      const { rows, cols } = fullLines({ cells }, r.boss === 'pillar');
      for (const yy of rows) for (let k = 0; k < N; k++) if (cells[idx(k, yy)]?.m !== 'void') cells[idx(k, yy)] = null;
      for (const xx of cols) for (let k = 0; k < N; k++) if (cells[idx(xx, k)]?.m !== 'void') cells[idx(xx, k)] = null;
      const L = rows.length + cols.length;
      const sc = evalBoard(cells) + L * L * 22 + (L ? 10 + r.streak * 4 : 0) + p.cells.length * 0.8;
      if (!best || sc > best.sc) best = { ti, x, y, sc };
    }
  });
  return best;
}
// simple shopping brain for the sim and tests
export function botShop(run) {
  const s = run.shop; if (!s) return;
  const val = id => { const c = byId[id]; return c.r * 10 + (/x\d|Mult/.test(c.d) ? 3 : 0) + (c.score ? 2 : 0); };
  const order = s.charms.map((o, k) => ({ o, k })).filter(z => !z.o.sold).sort((a, b) => val(b.o.id) - val(a.o.id));
  for (const { k } of order) {
    if (run.charms.length >= charmSlots(run)) {
      // swap out the weakest if the offer is clearly better
      const weakest = run.charms.map((c, i) => ({ i, v: val(c.id) })).sort((a, b) => a.v - b.v)[0];
      if (weakest && val(s.charms[k].id) > weakest.v + 8 && run.gold + sellPrice(run, run.charms[weakest.i].id) >= charmPrice(run, s.charms[k].id)) sellCharm(run, weakest.i);
      else continue;
    }
    buyCharm(run, k);
  }
  if (run.gold >= 9 && run.glyphs.length < run.glyphSlots) for (let k = 0; k < s.glyphs.length; k++) if (['undo', 'redeal', 'bomb', 'extend'].includes(s.glyphs[k].id)) { buyGlyph(run, k); break; }
  // x-mult charms go last, like in Balatro
  run.charms.sort((a, b) => (/^x/.test(byId[a.id].d) ? 1 : 0) - (/^x/.test(byId[b.id].d) ? 1 : 0));
}
