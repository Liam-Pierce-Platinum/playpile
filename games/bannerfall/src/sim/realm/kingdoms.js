// BANNERFALL :: sim/realm/kingdoms.js - kingdoms rise and fall (DESIGN.md 19.10, 19.11).
//   loyalty     +2 a season held, -5 a season with war on its soil, +10 with a garrison of 4+,
//               -10 when it was someone else's land at the start; -20 when conquered and -10 per
//               pillaged village happen as they occur (diplomacy.transferProvince, sieges.raid)
//   unrest      under 30 loyalty a province pays half, and each season rebels may rise (10%, 20%
//               under 15): a rebel host of militia and spearmen that besieges the seat
//   rising      rebels who hold a province for a full season become a NEW KINGDOM with a name,
//               colours and a personality: this is how kingdoms rise
//   falling     a landed kingdom with no province is gone; its armies scatter. The Black Hounds
//               hold no land: destroyed, they ride again a year or two later
//   rulers      age a year every realm year; from 60 they may die (5% a year, rising): the heir
//               takes the crown and every province is restless for a season
//   victory     dominion (a share of all provinces held for a full year), crown of crowns (every
//               original capital), hegemony (everyone else a vassal or an ally); defeat when you
//               hold no province, or your capital falls while you hold no other castle
import { R_KINGDOM, R_ECON } from '../../data/realm.js';
import { atWar, declareWar, log, rel, key, personality, treaty, liegeOf, allies } from './diplomacy.js';
import { makeKingdom, newSquad, rulerName, traitsFor, NEW_COLOURS, EMBLEMS, KINGDOM_FORMS } from './realmgen.js';
import { newArmy, order } from './armies.js';
import { mulberry32 } from '../rng.js';

const rngOf = (R) => { const r = mulberry32(R.rngState || 1); return r; };

export function seasonKingdoms(R) {
  const rng = mulberry32((R.rngState ^ (R.day * 2654435761)) >>> 0);
  for (const P of R.provinces) {
    if (P.owner < 0) continue;
    const K = R.kingdoms[P.owner];
    let d = R_KINGDOM.loyaltyHeld;
    const warHere = R.armies.some((A) => A.prov === P.id && A.squads.length && atWar(R, A.kingdom, P.owner));
    if (warHere) d += R_KINGDOM.loyaltyWar;
    if (P.garrison.length >= 4) d += 3;
    if (P.startOwner >= 0 && P.startOwner !== P.owner) d -= 2;
    if (K.taxPolicy === 'high') d -= 10;
    if (K.heirSeason === R.seasonIndex) d -= 10;
    P.loyalty = Math.max(0, Math.min(100, P.loyalty + d));
    // villages rebuild a season after a pillage
    for (const v of P.villages) if (v.state === 'ravaged' && R.day - (v.ravagedDay || 0) > 30) { v.state = 'taxed'; v.owner = P.owner; }
    // unrest: rebels rise
    // (a strong garrison keeps the peace; a kingdom already burning with three risings is spared a fourth)
    const risings = R.kingdoms.filter((x) => x.alive && x.rebel).length;
    if (P.loyalty < R_KINGDOM.unrest && !K.rebel && P.garrison.length < 4 && risings < 3 && !R.armies.some((A) => R.kingdoms[A.kingdom].rebel && A.prov === P.id)) {
      const ch = P.loyalty < 15 ? R_KINGDOM.rebelChanceLow : R_KINGDOM.rebelChance;
      if (rng() < ch) rise(R, P, rng);
    }
  }
  // rebels who held land a whole season become a kingdom
  for (const K of R.kingdoms) {
    if (!K.alive || !K.rebel) continue;
    const held = R.provinces.filter((P) => P.owner === K.id);
    if (held.length && R.day - (K.heldSince ?? R.day) >= 30 * R_KINGDOM.breakawaySeasons) becomeKingdom(R, K, held, rng);
    else if (held.length && K.heldSince === undefined) K.heldSince = R.day;
  }
  // rulers age (once a year, in spring)
  if (R.season === 'Spring') for (const K of R.kingdoms) {
    if (!K.alive || !K.ruler) continue;
    K.ruler.age++;
    if (K.ruler.age >= R_KINGDOM.rulerDeathFrom && rng() < R_KINGDOM.rulerDeath * (1 + (K.ruler.age - 60) * 0.15)) {
      const old = K.ruler.name;
      K.ruler = { name: rulerName(rng), age: 18 + Math.floor(rng() * 20) };
      if (!K.player) K.leader = K.ruler.name;
      K.heirSeason = R.seasonIndex + 1;
      log(R, `${old} of ${K.short} is dead. ${K.ruler.name} takes the crown.`, 'ruler', [K.id]);
      R.events.push({ type: 'heir', kingdom: K.id });
    }
  }
}
// rebels rise in a province: a new rebel faction with a host at the gates
export function rise(R, P, rng) {
  const c = NEW_COLOURS[R.kingdoms.length % NEW_COLOURS.length];
  const K = makeKingdom(R, { key: 'rebel' + R.kingdoms.length, name: 'The ' + P.name + ' Rising', short: P.name + ' Rebels', leader: rulerName(rng), main: c[0], trim: c[1], emblem: EMBLEMS[R.kingdoms.length % EMBLEMS.length], personality: 'zealot', doctrine: 'horde', rebel: true, gold: 8000, traits: traitsFor(rng), age: 30 });
  R.memory[K.id] = {};
  for (const o of R.kingdoms) if (o.id !== K.id) R.rel[key(o.id, K.id)] = { state: o.id === P.owner ? 'war' : 'peace', since: R.day, until: 0, aggressor: K.id };
  R.wars.push({ a: K.id, b: P.owner, start: R.day, score: 0 });
  const n = 4 + Math.floor(rng() * 6);
  const squads = [];
  for (let i = 0; i < n; i++) squads.push(newSquad(R, i % 3 === 2 ? 'spear' : i % 4 === 3 ? 'militiaBow' : 'militia'));
  const A = newArmy(R, K.id, P.id, squads, 'The ' + P.name + ' rebel host');
  A.arrived = R.day; A.order = { type: 'besiege', target: P.id };
  log(R, `Rebels rise in ${P.name} against ${R.kingdoms[P.owner].short}!`, 'rebellion', [P.owner, K.id]);
  R.events.push({ type: 'rebellion', prov: P.id, kingdom: K.id, against: P.owner });
  return K;
}
function becomeKingdom(R, K, held, rng) {
  K.rebel = false;
  K.name = KINGDOM_FORMS[(K.id + held[0].id) % KINGDOM_FORMS.length].replace('{p}', held[0].name);
  K.short = held[0].name;
  K.personality = ['steadfast', 'opportunist', 'zealot'][Math.floor(rng() * 3)];
  K.capital = held[0].id;
  if (held[0].seat === 'none' || held[0].seat === 'stronghold') held[0].seat = 'castle';
  K.risen = R.day;
  log(R, `A new kingdom rises: ${K.name}!`, 'rise', [K.id]);
  R.events.push({ type: 'rise', kingdom: K.id });
  // peace with its old lord comes slowly: a truce if both are weary
}
// a kingdom with no land is gone; the Black Hounds come back
export function checkFalls(R) {
  for (const K of R.kingdoms) {
    if (!K.alive) {
      if (K.key === 'hounds' && K.reformDay && R.day >= K.reformDay) reformHounds(R, K);
      continue;
    }
    const land = R.provinces.some((P) => P.owner === K.id);
    const armies = R.armies.some((A) => A.kingdom === K.id && A.squads.length);
    if (K.landless || (K.rebel && !K.risen)) {
      if (!armies && (K.landless || !land)) fall(R, K, K.landless ? 'scattered' : 'crushed');
      continue;
    }
    if (!land) fall(R, K, 'conquered');
  }
}
function fall(R, K, why) {
  K.alive = false; K.fellDay = R.day;
  R.armies = R.armies.filter((A) => A.kingdom !== K.id);
  R.treaties = R.treaties.filter((t) => t.a !== K.id && t.b !== K.id);
  R.wars = R.wars.filter((w) => w.a !== K.id && w.b !== K.id);
  for (const k in R.rel) { const [a, b] = k.split('|').map(Number); if (a === K.id || b === K.id) R.rel[k].state = 'peace'; }
  K.queue = [];
  if (K.key === 'hounds') K.reformDay = R.day + R_KINGDOM.houndsReform[0] + ((R.day * 7) % (R_KINGDOM.houndsReform[1] - R_KINGDOM.houndsReform[0]));
  log(R, why === 'crushed' ? `The ${K.short} are crushed.` : why === 'scattered' ? `${K.name} are scattered to the winds.` : `${K.name} has fallen!`, 'fall', [K.id]);
  R.events.push({ type: 'fall', kingdom: K.id, why });
}
function reformHounds(R, K) {
  const P = R.provinces.filter((q) => q.owner >= 0).sort((a, b) => a.loyalty - b.loyalty)[0] || R.provinces[0];
  K.alive = true; K.reformDay = 0; K.gold = 20000; K.fellDay = -1;
  for (const o of R.kingdoms) if (o.id !== K.id && o.alive) { R.rel[key(o.id, K.id)] = { state: 'war', since: R.day, until: 0, aggressor: K.id }; R.wars.push({ a: K.id, b: o.id, start: R.day, score: 0 }); }
  const squads = []; for (let i = 0; i < 7; i++) squads.push(newSquad(R, ['outrider', 'sword', 'horseArcher', 'sword', 'knight', 'outrider', 'javelin'][i]));
  const A = newArmy(R, K.id, P.id, squads, "Drogan's Black Hounds");
  A.arrived = R.day;
  log(R, `The Black Hounds ride again, out of ${P.name}!`, 'rise', [K.id]);
  R.events.push({ type: 'rise', kingdom: K.id, hounds: true });
}

// ---------------------------------------------------------------- victory (DESIGN.md 19.11)
export function checkVictory(R) {
  if (R.result) return R.result;
  const me = R.kingdoms.find((k) => k.player);
  const total = R.provinces.length;
  const mine = R.provinces.filter((P) => P.owner === me.id).length;
  const win = R.opts.win || 'dominion60';
  if (!me.alive || mine === 0) return (R.result = { winner: -1, reason: 'Aldmere holds no land. The Long War is lost.', day: R.day });
  if (me.capital < 0 && !R.provinces.some((P) => P.owner === me.id && (P.seat === 'castle' || P.seat === 'capital'))) return (R.result = { winner: -1, reason: 'Your capital has fallen and you hold no castle.', day: R.day });
  if (win.startsWith('dominion')) {
    const need = (+win.slice(8) || 60) / 100;
    if (mine / total >= need) { R.domSince = R.domSince ?? R.day; if (R.day - R.domSince >= 120) return (R.result = { winner: me.id, reason: `Aldmere has held ${Math.round(need * 100)}% of the realm for a year. Dominion!`, day: R.day }); }
    else R.domSince = null;
  }
  if (win === 'crowns') {
    const caps = R.provinces.filter((P) => P.wasCapitalOf >= 0);
    if (caps.every((P) => P.owner === me.id)) return (R.result = { winner: me.id, reason: 'Every crown of the realm is yours.', day: R.day });
  }
  if (win === 'hegemony') {
    const others = R.kingdoms.filter((k) => k.alive && k.id !== me.id && !k.landless);
    if (others.every((k) => liegeOf(R, k.id) === me.id || treaty(R, 'alliance', k.id, me.id))) return (R.result = { winner: me.id, reason: 'Every kingdom left is your vassal or your ally.', day: R.day });
  }
  // the main enemy broken and every kingdom at peace with you also wins a war that is not endless
  return null;
}
export { rngOf, allies, personality, declareWar, rel };
