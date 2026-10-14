// bot.js - a simple autopilot used by the headless tests (node + browser via __G).
// It plays a decent "buy pairs, follow the level curve, tanks in front" game.
import { UNIT, BUY_XP_COST } from './data.js';
import * as Run from './run.js';

const CURVE = [2, 3, 3, 4, 5, 5, 6, 6, 7, 7, 7, 8, 8, 8, 8, 9];

export function botShop(run, R = Math.random) {
  if (run.itemChoice) Run.takeItem(run, run.itemChoice[0]);
  const want = CURVE[Math.min(CURVE.length - 1, run.round - 1)];
  while (run.level < want && run.gold >= BUY_XP_COST + 2) Run.buyXp(run);
  const owned = id => [...run.bench, ...run.board].filter(u => u && u.id === id).length;
  // chase the two traits we already have most of
  const tc = {};
  for (const u of [...run.bench, ...run.board].filter(Boolean)) for (const t of [UNIT[u.id].origin, UNIT[u.id].cls]) tc[t] = (tc[t] || 0) + 1;
  const fav = Object.entries(tc).sort((a, b) => b[1] - a[1]).slice(0, 2).map(e => e[0]);
  const score = id => owned(id) * 3 + UNIT[id].cost + (run.round > 3 ? (fav.includes(UNIT[id].origin) ? 2 : 0) + (fav.includes(UNIT[id].cls) ? 2 : 0) : 0);
  for (let pass = 0; pass < 6; pass++) {
    const order = run.shop.map((id, i) => ({ id, i })).filter(x => x.id).sort((a, b) => score(b.id) - score(a.id));
    let any = false;
    for (const { i, id } of order) {
      const keep = run.round > 6 ? 10 : 0;
      if (run.gold - UNIT[id].cost < keep && owned(id) < 2) continue;
      if (run.round > 3 && score(id) < 3 && run.bench.filter(Boolean).length > 3) continue;
      if (Run.canBuy(run, i)) { Run.buy(run, i); any = true; }
    }
    if (run.gold >= 12 + (run.round > 6 ? 10 : 0)) { Run.reroll(run); continue; }
    if (!any) break;
  }
  arrange(run);
  // keep the bench lean: sell cheap singles nobody pairs with
  for (let k = 0; k < 8 && run.bench.filter(Boolean).length > 4; k++) {
    const i = run.bench.map((u, k) => ({ u, k })).filter(x => x.u).sort((a, b) => (UNIT[a.u.id].cost + owned(a.u.id) * 2) - (UNIT[b.u.id].cost + owned(b.u.id) * 2))[0].k;
    Run.sell(run, { zone: 'bench', idx: i });
  }
  // hand out items
  while (run.items.length) {
    const best = run.board.map((u, k) => ({ u, k })).filter(x => x.u && x.u.items.length < 3).sort((a, b) => (UNIT[b.u.id].cost * b.u.star) - (UNIT[a.u.id].cost * a.u.star))[0];
    if (!best) break;
    Run.equip(run, 0, { zone: 'board', idx: best.k });
  }
}

// strongest units onto the board, melee front, ranged back
export function arrange(run) {
  const all = [...run.board, ...run.bench].filter(Boolean);
  all.sort((a, b) => (UNIT[b.id].cost * b.star * b.star) - (UNIT[a.id].cost * a.star * a.star));
  const chosen = all.slice(0, run.level);
  run.board.fill(null); run.bench.fill(null);
  const front = [2, 1, 3, 0, 4], back = [7, 6, 8, 5, 9];
  for (const u of chosen) {
    const melee = UNIT[u.id].range <= 1 && UNIT[u.id].cls !== 'rogue';
    let s = melee ? front.shift() : back.shift();
    if (s == null) s = melee ? back.shift() : front.shift();
    run.board[s] = u;
  }
  all.slice(run.level).forEach((u, i) => { if (i < run.bench.length) run.bench[i] = u; });
}
