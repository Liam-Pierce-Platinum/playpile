// BANNERFALL :: sim/realm/economy.js - the treasury of a Long War kingdom (DESIGN.md 19.4).
// Income and upkeep are reckoned PER SEASON and paid out every day (a thirtieth at a time):
//   province  2,000 x development x (0.5 + loyalty / 200), halved under unrest
//   villages  taxed hamlet / village / town 1,500 / 2,500 / 4,000
//   seats     capital +8,000, castle +4,000 (fort +1,500), a market +2,000
//   trade     +10% of gross income per trade partner (three at most)
//   tribute   paid and received as agreed; a vassal pays its liege 30% of its income
//   upkeep    every squad's war upkeep per minute x 20 a season (garrisons half)
//   harvest   farmland pays x1.5 in autumn; winter income x0.8
import { R_ECON, SEASON_FX, R_KINGDOM } from '../../data/realm.js';
import { UPKEEP } from '../../data/economy.js';
import { treaty, liegeOf } from './diplomacy.js';

export function seasonIncome(R, k) {
  const parts = { land: 0, villages: 0, seats: 0, trade: 0, tribute: 0, vassals: 0 };
  const fx = SEASON_FX[R.season] || {};
  for (const P of R.provinces) {
    if (P.owner !== k) continue;
    let land = R_ECON.provinceBase * P.dev * (0.5 + P.loyalty / 200);
    if (P.loyalty < R_KINGDOM.unrest) land *= 0.5;
    if (fx.harvest && (P.biome === 'farmland' || P.biome === 'river' || P.biome === 'spring')) land *= fx.harvest;
    parts.land += land;
    for (const v of P.villages) if (v.state === 'taxed' && v.owner === k) parts.villages += R_ECON.village[v.tier];
    parts.seats += (R_ECON.seat[P.seat] || 0) + (P.yard && P.yard.includes('market') ? R_ECON.market : 0);
  }
  let gross = (parts.land + parts.villages + parts.seats) * (fx.income || 1);
  const partners = R.treaties.filter((t) => t.type === 'trade' && (t.a === k || t.b === k)).length;
  parts.trade = gross * R_ECON.tradeShare * Math.min(R_ECON.tradeMax, partners);
  for (const T of R.tributes || []) if (T.to === k && T.until > R.day) parts.tribute += T.perSeason;
  for (const t of R.treaties) if (t.type === 'vassal' && t.a === k) parts.vassals += Math.round(grossOf(R, t.b) * 0.3);
  const total = Math.round(gross + parts.trade + parts.tribute + parts.vassals);
  return { total, parts };
}
function grossOf(R, k) { let g = 0; for (const P of R.provinces) if (P.owner === k) g += R_ECON.provinceBase * P.dev * (0.5 + P.loyalty / 200) + (R_ECON.seat[P.seat] || 0); return g; }
export function seasonUpkeep(R, k) {
  let troops = 0, garrison = 0, tribute = 0, liege = 0;
  for (const A of R.armies) if (A.kingdom === k) for (const s of A.squads) troops += (UPKEEP[s.type] ?? 15) * R_ECON.upkeepPerMin;
  for (const P of R.provinces) if (P.owner === k) for (const s of P.garrison) garrison += (UPKEEP[s.type] ?? 10) * R_ECON.upkeepPerMin * R_ECON.garrisonShare;
  for (const T of R.tributes || []) if (T.from === k && T.until > R.day) tribute += T.perSeason;
  if (liegeOf(R, k) >= 0) liege = Math.round(grossOf(R, k) * 0.3);
  return { total: Math.round(troops + garrison + tribute + liege), parts: { troops, garrison, tribute, liege } };
}
// one day of money for every kingdom
export function economyDay(R) {
  for (const K of R.kingdoms) {
    if (!K.alive) continue;
    // reckoned once a week (cheap), paid every day
    if (R.day % 7 === 0 || K.seasonIncome === undefined) { K.seasonIncome = seasonIncome(R, K.id).total; K.seasonUpkeep = seasonUpkeep(R, K.id).total; }
    let pay = (K.seasonIncome - K.seasonUpkeep) / 30;
    // landless raiders live off the land they ride through (and their loot)
    if (K.landless) pay = Math.max(pay, 120);
    K.gold += pay;
    K.lastIncome = Math.round(pay * 30);
    if (K.gold < 0) {
      // bankrupt: the men desert, a squad at a time, until the books balance
      K.bankrupt = true;
      const A = R.armies.filter((x) => x.kingdom === K.id && x.squads.length).sort((a, b) => b.squads.length - a.squads.length)[0];
      if (A && R.day % 3 === 0) { const s = A.squads.pop(); if (s) R.events.push({ type: 'desert', kingdom: K.id, army: A.id }); }
    } else K.bankrupt = false;
  }
  // tributes run out
  if (R.tributes) R.tributes = R.tributes.filter((T) => T.until > R.day);
}
export { treaty };
