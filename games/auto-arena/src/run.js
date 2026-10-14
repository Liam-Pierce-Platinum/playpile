// run.js - one run of AUTO ARENA: gold, shop, bench, board, combining, levels,
// hearts, the seven rivals and their AI. Pure (no DOM) so tools can play whole
// runs in node.

import {
  UNITS, UNIT, ITEMS, RIVALS, SHOP_ODDS, POOL_SIZE, XP_TO_NEXT, START_GOLD, START_LEVEL, MAX_LEVEL,
  BUY_XP_COST, BUY_XP_AMT, REROLL_COST, BASE_INCOME, MAX_INTEREST, BENCH_SIZE, BOARD_COLS, BOARD_ROWS,
  START_HEARTS, WINS_TO_WIN, SHOP_SIZE, ITEM_ROUNDS, streakBonus, tierIndex,
} from './data.js';
import { rng } from './rng.js';
import { traitCounts } from './sim.js';

export const BOARD_SLOTS = BOARD_COLS * BOARD_ROWS;
let NID = 1;
const mk = (id, star = 1, items = []) => ({ nid: NID++, id, star, items: items.slice() });

export function newRun({ seed = (Math.random() * 1e9) | 0, daily = false, rating = 1000 } = {}) {
  const run = {
    seed, daily, rating, tier: tierIndex(rating),
    rs: 0, round: 1, hearts: START_HEARTS, wins: 0, losses: 0, gold: START_GOLD, level: START_LEVEL, xp: 0, streak: 0,
    bench: Array(BENCH_SIZE).fill(null), board: Array(BOARD_SLOTS).fill(null),
    shop: Array(SHOP_SIZE).fill(null), locked: false, items: [], itemChoice: null,
    pool: Object.fromEntries(UNITS.map(u => [u.id, POOL_SIZE[u.cost]])),
    rivals: RIVALS.map((r, i) => ({ ...r, gold: START_GOLD, level: START_LEVEL, xp: 0, units: [], items: [], w: 0, l: 0 })),
    order: [], history: [], over: false, victory: false, stats: { bought: 0, rerolls: 0, combines: 0, star3: 0 },
  };
  const R = rng(seed);
  // the order you meet the rivals in: every rival once per cycle, shuffled per cycle
  for (let c = 0; c < 4; c++) { const ids = [0, 1, 2, 3, 4, 5, 6]; for (let i = 6; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } run.order.push(...ids); }
  run.rs = R.state();
  rivalsTurn(run);
  rollShop(run, true);
  return run;
}

function withR(run, fn) { const R = rng(1); R.setState(run.rs); const out = fn(R); run.rs = R.state(); return out; }

export const xpNeeded = lvl => XP_TO_NEXT[lvl] || 999;
export const boardCount = run => run.board.filter(Boolean).length;
export const opponent = run => run.rivals[run.order[(run.round - 1) % run.order.length]];
export const interestOf = g => Math.min(MAX_INTEREST, Math.floor(g / 10));
export function sellValue(u) { const c = UNIT[u.id].cost; return u.star === 1 ? c : u.star === 2 ? c * 3 - (c > 1 ? 1 : 0) : c * 9 - 2; }

function pickCost(R, level) {
  const odds = SHOP_ODDS[Math.min(MAX_LEVEL, level)]; let x = R() * 100;
  for (let i = 0; i < 5; i++) { x -= odds[i]; if (x < 0) return i + 1; }
  return 1;
}
function drawUnit(R, level, pool) {
  for (let tries = 0; tries < 8; tries++) {
    const cost = pickCost(R, level);
    const opts = UNITS.filter(u => u.cost === cost && (!pool || pool[u.id] > 0));
    const tot = opts.reduce((s, u) => s + (pool ? pool[u.id] : 1), 0);
    if (!tot) continue;
    let x = R() * tot;
    for (const u of opts) { x -= pool ? pool[u.id] : 1; if (x < 0) return u.id; }
  }
  return UNITS[0].id;
}

export function rollShop(run, free = false) {
  if (run.locked && !free) return;
  withR(run, R => { for (let i = 0; i < SHOP_SIZE; i++) run.shop[i] = drawUnit(R, run.level, run.pool); });
}

// ---------------------------------------------------------------- player actions
export function reroll(run) {
  if (run.gold < REROLL_COST) return false;
  run.gold -= REROLL_COST; run.stats.rerolls++;
  run.locked = false; rollShop(run);
  return true;
}
export function buyXp(run) {
  if (run.gold < BUY_XP_COST || run.level >= MAX_LEVEL) return false;
  run.gold -= BUY_XP_COST; addXp(run, BUY_XP_AMT); return true;
}
export function addXp(run, n) {
  run.xp += n;
  let up = false;
  while (run.level < MAX_LEVEL && run.xp >= xpNeeded(run.level)) { run.xp -= xpNeeded(run.level); run.level++; up = true; }
  if (run.level >= MAX_LEVEL) run.xp = 0;
  return up;
}
export function toggleLock(run) { run.locked = !run.locked; return run.locked; }

function countCopies(run, id, star) {
  return [...run.bench, ...run.board].filter(u => u && u.id === id && u.star === star).length;
}
// would buying this unit complete a combine? (lets you buy with a full bench)
export function buyCompletes(run, id) { return countCopies(run, id, 1) >= 2; }

export function canBuy(run, slot) {
  const id = run.shop[slot]; if (!id) return false;
  if (run.gold < UNIT[id].cost) return false;
  return run.bench.some(b => !b) || buyCompletes(run, id) || (boardCount(run) < run.level && run.board.some(b => !b));
}

// buy to bench (or a given target). Returns { ok, merged:[...] }
export function buy(run, slot, to = null) {
  const id = run.shop[slot];
  if (!canBuy(run, slot)) return { ok: false };
  const u = mk(id);
  run.gold -= UNIT[id].cost; run.pool[id]--; run.shop[slot] = null; run.stats.bought++;
  let placed = false;
  if (to && to.zone === 'board' && !run.board[to.idx] && boardCount(run) < run.level) { run.board[to.idx] = u; placed = true; }
  else if (to && to.zone === 'bench' && !run.bench[to.idx]) { run.bench[to.idx] = u; placed = true; }
  if (!placed) {
    const bi = run.bench.indexOf(null);
    if (bi >= 0) run.bench[bi] = u;
    else if (boardCount(run) < run.level && run.board.indexOf(null) >= 0) run.board[run.board.indexOf(null)] = u;
    else { // full bench but it completes a trio: park it virtually and combine right away
      run._limbo = u;
    }
  }
  const merged = combineAll(run);
  if (run._limbo) { const bi = run.bench.indexOf(null); if (bi >= 0) run.bench[bi] = run._limbo; run._limbo = null; }
  return { ok: true, unit: u, merged };
}

export function getAt(run, loc) { return loc.zone === 'board' ? run.board[loc.idx] : loc.zone === 'bench' ? run.bench[loc.idx] : null; }
function setAt(run, loc, u) { if (loc.zone === 'board') run.board[loc.idx] = u; else run.bench[loc.idx] = u; }

export function move(run, from, to) {
  if (from.zone === to.zone && from.idx === to.idx) return false;
  const a = getAt(run, from), b = getAt(run, to);
  if (!a) return false;
  // board cap: moving from bench onto an EMPTY board slot needs room
  if (to.zone === 'board' && from.zone !== 'board' && !b && boardCount(run) >= run.level) return false;
  setAt(run, to, a); setAt(run, from, b);
  return true;
}

export function sell(run, loc) {
  const u = getAt(run, loc); if (!u) return 0;
  const v = sellValue(u);
  run.gold += v;
  run.pool[u.id] = (run.pool[u.id] || 0) + (u.star === 1 ? 1 : u.star === 2 ? 3 : 9);
  run.items.push(...u.items);
  setAt(run, loc, null);
  return v;
}

export function equip(run, itemIdx, loc) {
  const u = getAt(run, loc); const it = run.items[itemIdx];
  if (!u || !it || u.items.length >= 3) return false;
  u.items.push(it); run.items.splice(itemIdx, 1); return true;
}

// three of a kind -> one of the next star. Loops so a star-2 trio chains to star-3.
export function combineAll(run) {
  const merged = [];
  for (let guard = 0; guard < 6; guard++) {
    const all = [];
    run.board.forEach((u, i) => u && all.push({ u, loc: { zone: 'board', idx: i } }));
    run.bench.forEach((u, i) => u && all.push({ u, loc: { zone: 'bench', idx: i } }));
    if (run._limbo) all.push({ u: run._limbo, loc: { zone: 'limbo' } });
    let did = false;
    for (const star of [1, 2]) {
      const groups = {};
      for (const e of all) if (e.u.star === star) (groups[e.u.id] = groups[e.u.id] || []).push(e);
      for (const [id, g] of Object.entries(groups)) {
        if (g.length < 3) continue;
        const three = g.slice(0, 3).sort((a, b) => (a.loc.zone === 'board' ? 0 : 1) - (b.loc.zone === 'board' ? 0 : 1));
        const items = three.flatMap(e => e.u.items);
        const nu = mk(id, star + 1, items.slice(0, 3));
        run.items.push(...items.slice(3));
        for (const e of three) { if (e.loc.zone === 'limbo') run._limbo = null; else setAt(run, e.loc, null); }
        const home = three.find(e => e.loc.zone !== 'limbo')?.loc || { zone: 'bench', idx: run.bench.indexOf(null) };
        if (home.idx < 0) run._limbo = nu; else setAt(run, home, nu);
        merged.push({ id, star: star + 1, loc: home, nid: nu.nid });
        run.stats.combines++; if (star + 1 === 3) run.stats.star3++;
        did = true; break;
      }
      if (did) break;
    }
    if (!did) break;
  }
  return merged;
}

export function boardTeam(run) {
  const out = [];
  run.board.forEach((u, i) => { if (u) out.push({ id: u.id, star: u.star, items: u.items, c: i % BOARD_COLS, r: Math.floor(i / BOARD_COLS) }); });
  return out;
}
export function boardTraits(run) { return traitCounts(run.board.filter(Boolean).map(u => u.id)); }

// If the board has room and units sit on the bench, fill the board (used before a fight
// so a forgetful player never fights short-handed).
export function autoFill(run) {
  while (boardCount(run) < run.level) {
    const bi = run.bench.findIndex(Boolean); if (bi < 0) break;
    const u = run.bench[bi]; const melee = UNIT[u.id].range <= 1;
    const order = melee ? [2, 1, 3, 0, 4, 7, 6, 8, 5, 9] : [7, 6, 8, 5, 9, 2, 1, 3, 0, 4];
    const slot = order.find(i => !run.board[i]); if (slot == null) break;
    run.board[slot] = u; run.bench[bi] = null;
  }
}

// ---------------------------------------------------------------- after a fight
// result: 0 you won, 1 you lost, -1 draw
export function finishRound(run, result) {
  const opp = opponent(run);
  const rec = { round: run.round, rival: opp.id, result };
  run.history.push(rec);
  if (result === 0) { run.wins++; opp.l++; run.streak = run.streak > 0 ? run.streak + 1 : 1; }
  else if (result === 1) { run.hearts--; run.losses++; opp.w++; run.streak = run.streak < 0 ? run.streak - 1 : -1; }
  if (run.wins >= WINS_TO_WIN) { run.over = true; run.victory = true; }
  if (run.hearts <= 0) { run.over = true; run.victory = false; }
  const income = { base: BASE_INCOME, interest: interestOf(run.gold), streak: streakBonus(run.streak), win: result === 0 ? 1 : 0 };
  income.total = income.base + income.interest + income.streak + income.win;
  rec.income = income;
  if (run.over) return rec;
  run.gold += income.total;
  run.round++;
  addXp(run, 2);
  rivalsTurn(run);
  if (ITEM_ROUNDS.includes(run.round)) run.itemChoice = withR(run, R => { const pool = ITEMS.slice(); const out = []; while (out.length < 3) out.push(pool.splice(Math.floor(R() * pool.length), 1)[0].id); return out; });
  rollShop(run);
  return rec;
}
export function takeItem(run, id) { if (run.itemChoice && run.itemChoice.includes(id)) { run.items.push(id); run.itemChoice = null; return true; } return false; }

// round-1 bonus item so items appear early too
export function ratingDelta(run) {
  const expected = 3.5 + run.tier * 0.5;
  return Math.max(-45, Math.round(12 * (run.wins - expected) + (run.victory ? 30 : 0)));
}

// ---------------------------------------------------------------- the rivals
const LEVEL_CURVE = [2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9, 9, 9];
function rivalsTurn(run) {
  withR(run, R => { for (const rv of run.rivals) rivalTurn(run, rv, R); });
}

function unitValue(rv, id, star, owned) {
  const d = UNIT[id];
  let v = d.cost * 2 + (star - 1) * d.cost * 3.2;
  if (rv.fav.includes(d.origin)) v += 3;
  if (rv.fav.includes(d.cls)) v += 4;
  if (rv.id === 'crane') v += d.cost * 1.5;
  if (owned) v += 1;
  return v;
}

function rivalTurn(run, rv, R) {
  const r = run.round;
  const skillGold = Math.round(run.tier * 0.8 + (r > 8 ? run.tier * 0.5 : 0)) + (r > 3 ? 1 : 0);
  if (r > 1) rv.gold += BASE_INCOME + interestOf(rv.gold) + 1 + skillGold;
  // keep to the level curve (Greed levels a round early from round 4)
  const want = Math.min(MAX_LEVEL, LEVEL_CURVE[Math.min(LEVEL_CURVE.length - 1, r - 1 + (rv.id === 'crane' && r >= 4 ? 1 : 0))] + (run.tier >= 5 && r >= 8 ? 1 : 0));
  if (r > 1) { rv.xp += 2; while (rv.level < MAX_LEVEL && rv.xp >= xpNeeded(rv.level)) { rv.xp -= xpNeeded(rv.level); rv.level++; } }
  while (rv.level < want && rv.gold >= BUY_XP_COST) { rv.gold -= BUY_XP_COST; rv.xp += BUY_XP_AMT; while (rv.level < MAX_LEVEL && rv.xp >= xpNeeded(rv.level)) { rv.xp -= xpNeeded(rv.level); rv.level++; } }
  if (rv.level < want && r > 3) rv.level = Math.min(want, rv.level + 1); // ghosts are recorded teams; never let one fall two levels behind
  const floor = r <= 3 ? 0 : Math.min(rv.econ, 10 * Math.floor(rv.gold / 10));
  let rolls = 0;
  const maxRolls = r <= 3 ? 0 : rv.roll + (r >= 9 ? 2 : 0) + Math.max(0, run.tier - 2);
  const owned = () => rv.units;
  const cap = rv.level + 3; // board + a little bench
  for (let pass = 0; pass < 12; pass++) {
    const shop = Array.from({ length: SHOP_SIZE }, () => drawUnit(R, rv.level, null));
    const ranked = shop.map(id => ({ id, v: unitValue(rv, id, 1, owned().some(u => u.id === id)) + (owned().filter(u => u.id === id && u.star === 1).length * 3) })).sort((a, b) => b.v - a.v);
    let bought = false;
    for (const c of ranked) {
      const cost = UNIT[c.id].cost;
      if (rv.gold - cost < floor && !(owned().filter(u => u.id === c.id && u.star === 1).length >= 2 && rv.gold >= cost)) continue;
      if (rv.units.length >= cap) {
        // swap out the weakest if this is better
        const weakest = rv.units.slice().sort((a, b) => unitValue(rv, a.id, a.star) - unitValue(rv, b.id, b.star))[0];
        if (unitValue(rv, weakest.id, weakest.star) + 1 >= c.v && !owned().some(u => u.id === c.id)) continue;
        rv.units.splice(rv.units.indexOf(weakest), 1); rv.gold += sellValue(weakest); rv.items.push(...weakest.items);
      }
      rv.gold -= cost; rv.units.push(mk(c.id)); bought = true;
      combineRival(rv);
    }
    // a fresh shop costs a reroll, exactly like yours
    if (rolls < maxRolls && rv.gold - REROLL_COST >= floor + 2) { rv.gold -= REROLL_COST; rolls++; continue; }
    break;
  }
  // items arrive on the same rounds as yours
  if (ITEM_ROUNDS.includes(r) || r === 1 && run.tier >= 4) rv.items.push(ITEMS[Math.floor(R() * ITEMS.length)].id);
  arrangeRival(rv);
}

function combineRival(rv) {
  for (let g = 0; g < 4; g++) {
    let did = false;
    for (const star of [1, 2]) {
      const by = {};
      for (const u of rv.units) if (u.star === star) (by[u.id] = by[u.id] || []).push(u);
      for (const [id, arr] of Object.entries(by)) if (arr.length >= 3) {
        const three = arr.slice(0, 3); const items = three.flatMap(u => u.items);
        rv.units = rv.units.filter(u => !three.includes(u));
        rv.units.push(mk(id, star + 1, items.slice(0, 3))); rv.items.push(...items.slice(3));
        did = true; break;
      }
      if (did) break;
    }
    if (!did) break;
  }
}

function arrangeRival(rv) {
  // choose the best `level` units, preferring ones that switch traits on
  const pool = rv.units.slice().sort((a, b) => unitValue(rv, b.id, b.star) - unitValue(rv, a.id, a.star));
  const chosen = pool.slice(0, rv.level);
  // hand out items to the strongest units
  while (rv.items.length) {
    const u = chosen.find(x => x.items.length < 3); if (!u) break;
    u.items.push(rv.items.shift());
  }
  const front = [2, 1, 3, 0, 4], back = [2, 1, 3, 0, 4];
  const team = [];
  const melee = chosen.filter(u => UNIT[u.id].range <= 1 && UNIT[u.id].cls !== 'rogue');
  const ranged = chosen.filter(u => !melee.includes(u));
  for (const u of melee) { const c = front.shift(); if (c != null) team.push({ id: u.id, star: u.star, items: u.items, c, r: 0 }); else { const c2 = back.shift(); team.push({ id: u.id, star: u.star, items: u.items, c: c2, r: 1 }); } }
  for (const u of ranged) { const c = back.shift(); if (c != null) team.push({ id: u.id, star: u.star, items: u.items, c, r: 1 }); else { const c2 = front.shift(); team.push({ id: u.id, star: u.star, items: u.items, c: c2, r: 0 }); } }
  rv.team = team;
}

// after loading a saved run, keep new unit ids above the saved ones (ids key animations)
export function syncIds(run) {
  for (const u of [...run.bench, ...run.board]) if (u && u.nid >= NID) NID = u.nid + 1;
}
