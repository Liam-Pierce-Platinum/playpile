// BANNERFALL :: sim/campaign.js - the war of the Iron Crown: treasury, roster of veteran squads,
// tech, the route with its forks, and what a won or lost battle does to all of it.
// Pure data in and out (main.js keeps it in localStorage pd.warfront).
import { BATTLES, ROUTE, FORKS, battleById } from '../data/battles.js';
import { UNIT_TYPES } from '../data/units.js';
import { TECH, techCost, techPrereq, TECH_UNITS, TECH_BUILDS } from '../data/tech.js';
import { BASE_BUILDS } from './world.js';
import { rankFor, RANKS } from './victory.js';

export const BASE_UNITS = ['spear', 'sword', 'archer', 'healer'];
const DIFF_LEVY = { recruit: 1.2, captain: 1, warlord: 1 };

export function newCampaign(difficulty = 'captain') {
  return { v: 1, difficulty, treasury: 0, roster: [], tech: [], done: {}, path: [], closed: [], giftsGiven: {}, uid: 1, started: Date.now(), at: null };
}

// the battles you can march on now
export function available(c) {
  if (!c.path.length) return ['1'];
  const last = c.path[c.path.length - 1];
  return (ROUTE[last] || []).map(String).filter((id) => !c.closed.includes(id));
}
export const finished = (c) => c.path.includes('10');
export const battleState = (c, id) => (c.path.includes(String(id)) ? 'won' : available(c).includes(String(id)) ? 'open' : c.closed.includes(String(id)) ? 'closed' : 'locked');

function battlesUpTo(id) {
  // every battle on the way to (and including) id, ignoring forks you skipped
  const i = BATTLES.findIndex((b) => String(b.id) === String(id));
  return BATTLES.slice(0, i + 1);
}
export function unitsUnlocked(c, forId) {
  const set = new Set(BASE_UNITS);
  for (const b of battlesUpTo(forId)) for (const u of b.unlockUnits || []) set.add(u);
  for (const id of c.path) for (const u of battleById(id).unlockAfter || []) set.add(u);
  for (const t of c.tech) if (TECH_UNITS[t]) set.add(TECH_UNITS[t]);
  return [...set];
}
export function buildsUnlocked(c, forId) {
  const set = new Set(BASE_BUILDS);
  for (const b of battlesUpTo(forId)) for (const u of b.unlockBuilds || []) set.add(u);
  for (const t of c.tech) for (const u of TECH_BUILDS[t] || []) set.add(u);
  return [...set];
}
export function warChest(c, def) {
  return Math.max(Math.round(c.treasury + def.levy * (DIFF_LEVY[c.difficulty] || 1)), def.floor || def.levy);
}

// everything createWorld needs for a campaign battle
export function battleOptions(c, id) {
  const def = battleById(id);
  const key = String(def.id);
  if (!c.giftsGiven[key]) {
    c.giftsGiven[key] = true;
    for (const g of def.gift || []) c.roster.push(newEntry(c, g));
  }
  return {
    roster: c.roster.map((r) => ({ ...r })), gold: warChest(c, def), tech: c.tech.slice(),
    unlocked: unitsUnlocked(c, id), builds: buildsUnlocked(c, id), difficulty: c.difficulty,
  };
}

function newEntry(c, type, name) {
  return { uid: 'u' + c.uid++, type, name: name || null, men: UNIT_TYPES[type].men, vet: 0, xp: 0 };
}

// after the battle. Returns a summary for the war camp screen.
export function applyResult(c, world, result) {
  const def = world.def;
  const key = String(def.id);
  const d = c.done[key] || (c.done[key] = { stars: 0, wins: 0, losses: 0 });
  if (result.winner !== 0) { d.losses++; return { won: false }; }
  d.wins++; d.stars = Math.max(d.stars, result.nStars);
  // roster: survivors carry over, the fallen are gone
  const roster = [];
  for (const s of result.squads) {
    if (s.type === 'commander' || s.men <= 0) continue;
    const old = s.uid && c.roster.find((r) => r.uid === s.uid);
    const e = old ? { ...old } : newEntry(c, s.type, s.name);
    e.name = s.name; e.men = Math.min(UNIT_TYPES[s.type].men, s.men); e.xp = s.xp; e.vet = Math.max(e.vet, s.vetNew);
    roster.push(e);
  }
  // squads that never left the reserve are kept as they were
  for (const r of c.roster) if (!roster.some((e) => e.uid === r.uid) && !result.squads.some((s) => s.uid === r.uid && (s.fought || s.men <= 0))) roster.push(r);
  c.roster = roster;
  if (!c.path.includes(key)) c.path.push(key);
  for (const f of FORKS) if (f.includes(key)) for (const o of f) if (o !== key && !c.closed.includes(o)) c.closed.push(o);
  const freeTech = [];
  for (const t of def.rewardTech || []) if (!c.tech.includes(t)) { c.tech.push(t); freeTech.push(TECH[t].name); }
  const leftover = Math.max(0, Math.round(world.teams[0].gold));
  c.treasury = leftover + result.reward;
  c.at = key;
  return { won: true, leftover, reward: result.reward, treasury: c.treasury, freeTech, unlocked: (def.unlockAfter || []).map((u) => UNIT_TYPES[u].name) };
}

export function replenishCost(e) {
  const U = UNIT_TYPES[e.type];
  return Math.round((U.cost / U.men) * (U.men - e.men) * 0.6);
}
export function replenish(c, uid) {
  const e = c.roster.find((r) => r.uid === uid);
  if (!e) return { error: 'No such squad' };
  const U = UNIT_TYPES[e.type];
  if (e.men >= U.men) return { error: 'Already at full strength' };
  const cost = replenishCost(e);
  if (c.treasury < cost) return { error: 'Not enough gold' };
  c.treasury -= cost;
  // fewer than half left: the new men dilute the veterans by one rank
  if (e.men < U.men / 2 && e.vet > 0) { e.vet--; e.xp = Math.min(e.xp, e.vet ? RANKS[e.vet - 1] : 0); }
  e.men = U.men;
  return { ok: true, cost };
}
export function dismiss(c, uid) {
  const i = c.roster.findIndex((r) => r.uid === uid);
  if (i < 0) return { error: 'No such squad' };
  const e = c.roster[i], U = UNIT_TYPES[e.type];
  const refund = Math.round(U.cost * (e.men / U.men) * 0.4);
  c.roster.splice(i, 1);
  c.treasury += refund;
  return { ok: true, refund };
}
export function rename(c, uid, name) {
  const e = c.roster.find((r) => r.uid === uid);
  if (e && name && name.trim()) e.name = name.trim().slice(0, 28);
}
export function techState(c, id) {
  if (c.tech.includes(id)) return 'owned';
  const pre = techPrereq(id);
  if (pre && !c.tech.includes(pre)) return 'locked';
  return c.treasury >= techCost(id, c) ? 'buy' : 'poor';
}
export function buyTech(c, id) {
  const st = techState(c, id);
  if (st === 'owned') return { error: 'Already known' };
  if (st === 'locked') return { error: 'Needs ' + TECH[techPrereq(id)].name + ' first' };
  const cost = techCost(id, c);
  if (c.treasury < cost) return { error: 'Not enough gold' };
  c.treasury -= cost;
  c.tech.push(id);
  return { ok: true, cost };
}
export { rankFor };

// battlefields open in Skirmish: the first three, plus anything the campaign has reached
export function skirmishFields(c) {
  const open = new Set(['1', '2', '3']);
  if (c) { for (const id of c.path) open.add(id); for (const id of available(c)) open.add(id); }
  return BATTLES.filter((b) => open.has(String(b.id)));
}
