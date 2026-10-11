// BANNERFALL :: sim/economy.js - the money of a war on a huge map (DESIGN.md 4).
// Income and upkeep are per MINUTE and paid every 10 s (a sixth at a time). A kingdom whose gold
// falls below zero is BANKRUPT: every squad loses morale each payday, castles stop refilling and
// nothing new can be bought until the books balance. Events for the coin FX are pushed here.
import { NEUTRAL } from '../data/factions.js';
import { INCOME, UPKEEP, GARRISON_UPKEEP, STRUCT_UPKEEP } from '../data/economy.js';
import { hostile } from './factions.js';

export function incomeOf(world, team) {
  const W = world.war;
  let g = 0;
  const parts = { keep: 0, castles: 0, forts: 0, land: 0, tax: 0, tribute: 0 };
  for (const s of W.settlements) {
    if (s.owner !== team) continue;
    if (s.kind === 'capital') { const v = s.founder === team ? INCOME.homeKeep : INCOME.capital; g += v; parts.keep += v; }
    else if (s.kind === 'castle') { g += INCOME.castle; parts.castles += INCOME.castle; }
    else if (s.kind === 'outpost') { g += INCOME.outpost; parts.castles += INCOME.outpost; }
    else if (s.kind === 'stronghold') { g += INCOME.stronghold; parts.forts += INCOME.stronghold; }
    else if (s.kind === 'village' && s.state === 'taxed' && s.taxedBy === team) {
      // paused while hostile soldiers are within 150 m
      let threat = false;
      for (const q of world.squads.values()) if (q.deployed && q.alive > 0 && q.team < NEUTRAL && hostile(world, team, q.team) && Math.abs(q.cx - s.pos[0]) < 150 && Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]) < 150) { threat = true; break; }
      const v = Math.round(s.tax * (s.fearUntil > world.t ? 0.75 : 1));
      if (!threat) { g += v; parts.tax += v; }
    }
  }
  for (const R of W.regions) {
    if (R.owner !== team || !R.cells || R.settlement) continue;
    const v = (R.supplied === false ? INCOME.cutOff : 1) * INCOME.region;
    g += v; parts.land += v;
  }
  // tribute that another kingdom pays us (diplomacy-lite)
  const D = world.dip;
  if (D) for (const tr of D.tribute) if (tr.to === team && tr.until > world.t) { g += tr.perMin; parts.tribute += tr.perMin; }
  return { total: Math.round(g), parts };
}

export function upkeepOf(world, team) {
  let g = 0;
  const parts = { troops: 0, garrison: 0, works: 0, tribute: 0 };
  for (const sq of world.squads.values()) {
    if (sq.team !== team || sq.alive <= 0 || sq.state === 'gone' || !sq.deployed) continue;
    const u = UPKEEP[sq.type] ?? 15;
    if (!u) continue;
    const gar = sq.garrison || sq.role === 'garrison';
    const v = u * (gar ? GARRISON_UPKEEP : 1);
    g += v; parts[gar ? 'garrison' : 'troops'] += v;
  }
  for (const st of world.structures.values()) {
    if (!st.alive || st.team !== team) continue;
    const v = STRUCT_UPKEEP[st.type]; if (!v) continue;
    g += v; parts.works += v;
  }
  const D = world.dip;
  if (D) for (const tr of D.tribute) if (tr.from === team && tr.until > world.t) { g += tr.perMin; parts.tribute += tr.perMin; }
  return { total: Math.round(g), parts };
}

// every 10 s of war
export function economyTick(world) {
  for (const team of world.war.slots) {
    if (!world.war.factions[team].alive) continue;
    const inc = incomeOf(world, team), up = upkeepOf(world, team);
    const T = world.teams[team];
    T.income = inc.total; T.incomeParts = inc.parts;
    T.upkeep = up.total; T.upkeepParts = up.parts;
    const pay = Math.round((inc.total - up.total) / 6);
    T.gold += pay;
    if (pay > 0) T.earned += pay;
    if (team === 0 && pay) world.events.push({ type: 'income', gold: pay });
    const was = !!T.bankrupt;
    T.bankrupt = T.gold < 0;
    if (T.bankrupt) {
      for (const sq of world.squads.values()) if (sq.team === team && sq.alive > 0 && sq.state !== 'gone') sq.morale = Math.max(5, sq.morale - INCOME.bankruptMorale);
      if (!was) world.events.push({ type: 'alert', team, text: 'The treasury is empty! Upkeep is unpaid and the men lose heart.', pos: null, tone: 'bad', t: world.t });
    } else if (was) world.events.push({ type: 'alert', team, text: 'The treasury is solvent again.', pos: null, tone: 'good', t: world.t });
  }
}

// net gold per minute
export function netOf(world, team) { const T = world.teams[team]; return (T.income || 0) - (T.upkeep || 0); }
