// BANNERFALL :: ai/king.js - the AI King of a Long War kingdom (DESIGN.md 20.5, 20.6, 21.8).
// Every few days (staggered per kingdom):
//   treasury   raise troops at its castles by doctrine while it keeps a reserve and the books balance
//   hosts      gather garrisons and fresh squads into armies; winter quarters when the snow comes
//   war aims   for every idle army: defend a threatened province first, else march on the best
//              target it is at war with (value x aggression / distance x odds), raid when greedy,
//              take free land when ambitious. Raiders ride for the richest weak province.
//   sieges     handled by sieges.siegeAI (assault, starve, terms, lift)
// Every season, its diplomacy:
//   war        warDesire = 40 x aggression + 25 (a weak neighbour) - 0.3 x opinion + 10 (border)
//              - 0.5 x exhaustion. Above 40 it masses troops on the border (a 10-day warning, the
//              player gets a rumour), then declares. A truce or treaty in the way needs its honour
//              to fail (betrayal); trust and memory pay for it afterwards.
//   peace      a weary or losing kingdom offers a truce or peace; a winning one demands land
//   friends    alliances against a common threat, trade for the greedy, tribute from the weak
// The same code can run the player's kingdom as REGENT (K.regent): builder D wires the seat; the
// Long War soak test (tools/longwar.mjs) runs every kingdom this way.
import { UNIT_TYPES } from '../data/units.js';
import { DOCTRINES, warDoctrine } from '../sim/ai.js';
import { R_WAR, SEASON_FX, R_ARMY } from '../data/realm.js';
import { atWar, atTruce, treaty, strength, opinion, personality, declareWar, propose, judge, enact, scoreFor, sharesBorder, log, sendLetter, allies, liegeOf, rel } from '../sim/realm/diplomacy.js';
import { armiesOf, armyMen, armyCap, raise, canRaiseAt, order, findPath, pathDays, musterGarrison, unitCost, bannersOf } from '../sim/realm/armies.js';
import { power, wallMult, hostileK } from '../sim/realm/engage.js';

const pickW = (rng, w) => { const ks = Object.keys(w).filter((k) => UNIT_TYPES[k]); let t = 0; for (const k of ks) t += w[k]; let r = rng() * t; for (const k of ks) { r -= w[k]; if (r <= 0) return k; } return ks[0]; };

export function kingTick(R, k, rng) {
  const K = R.kingdoms[k];
  if (!K.alive) return;
  const P = personality(R, k);
  const fx = SEASON_FX[R.season] || {};
  // ---------------------------------------------------------------- treasury: raise troops
  const seats = R.provinces.filter((q) => canRaiseAt(R, k, q));
  const reserve = 12000 + (K.seasonUpkeep || 0) * 0.5;
  const net = (K.seasonIncome || 0) - (K.seasonUpkeep || 0);
  const doctrine = (DOCTRINES[warDoctrine(K.doctrine)] || DOCTRINES.w_shieldbow).w;
  const atWarAny = R.kingdoms.some((o) => o.alive && o.id !== k && atWar(R, k, o.id));
  const wantBanners = Math.round((atWarAny ? 26 : 14) * (0.7 + P.aggression * 0.6) * (K.minor ? 0.6 : 1) + seats.length * 2);
  for (let i = 0; i < 3 && seats.length; i++) {
    if (K.gold < reserve || net < -2500 || bannersOf(R, k) >= wantBanners) break;
    const type = i === 0 && atWarAny && rng() < 0.15 ? (rng() < 0.5 ? 'ram' : 'mangonel') : pickW(rng, doctrine);
    const at = seats[Math.floor(rng() * seats.length)];
    if (raise(R, k, at.id, type).error) break;
  }
  // landless raiders recruit wherever their host stands (mercenaries), from loot
  if (K.landless && K.gold > 15000 && rng() < 0.3) {
    const A = armiesOf(R, k)[0];
    if (A && A.squads.length < 16) { A.squads.push(newMerc(R, rng)); K.gold -= 3000; }
  }
  // ---------------------------------------------------------------- hosts
  // garrisons swell from training; a seat keeps 2 squads (4 at the capital), the rest march
  for (const q of seats) {
    const keep = q.seat === 'capital' ? 4 : 2;
    if (q.garrison.length > keep + 1 && (atWarAny || q.garrison.length > keep + 4) && !q.siegedBy) musterGarrison(R, k, q.id, 99, keep);
  }
  const armies = armiesOf(R, k);
  for (const A of armies) {
    if (A.edge || A.path.length) continue;
    if (A.siegeOf >= 0 && R.provinces[A.siegeOf].siegedBy === A.id) continue;     // sitting a siege
    if (A.order && ['attack', 'besiege', 'raid'].includes(A.order.type) && A.prov === A.order.target && R.provinces[A.prov].owner !== k && hostileK(R, k, R.provinces[A.prov].owner) && R.day - (A.arrived || 0) < 25) continue; // still about it
    if (R.day - (A.lastBattle || -99) < 4) continue;                               // licking wounds
    // winter quarters
    if (R.season === 'Winter' && !K.landless && armyMen(A) < 400) {
      const here = R.provinces[A.prov];
      if (!(here.owner === k && here.seat !== 'none')) { const home = nearestOwnSeat(R, k, A.prov); if (home !== null) { order(R, A, { type: 'winter', target: home }); continue; } }
      else continue;
    }
    // defend first
    const threat = threatened(R, k, A);
    if (threat) { order(R, A, { type: 'defend', target: threat }); continue; }
    // a target
    const tgt = chooseTarget(R, k, A, P, rng);
    if (tgt) { order(R, A, { type: tgt.type, target: tgt.prov }); A.goalT = R.day; continue; }
    // nothing to do: merge small armies at the same place, or go home to refill
    const other = armies.find((B) => B !== A && B.prov === A.prov && !B.edge && B.squads.length);
    if (other) order(R, A, { type: 'merge', with: other.id });
  }
}
function newMerc(R, rng) { const t = ['sword', 'outrider', 'javelin', 'horseArcher', 'spear'][Math.floor(rng() * 5)]; return { id: 'r' + (R.seq.sq++), type: t, men: UNIT_TYPES[t].men, max: UNIT_TYPES[t].men, xp: 40, ammo: UNIT_TYPES[t].ammo || 0, morale: 0 }; }
function nearestOwnSeat(R, k, from) {
  let best = null, bd = Infinity;
  for (const P of R.provinces) if (P.owner === k && P.seat !== 'none') { const path = findPath(R, k, from, P.id); if (!path) continue; const d = pathDays(R, from, path); if (d < bd) { bd = d; best = P.id; } }
  return best;
}
// an own province with an enemy army in it or besieging it, close enough and beatable
function threatened(R, k, A) {
  let best = null, bs = 0;
  for (const B of R.armies) {
    if (!B.squads.length || !atWar(R, k, B.kingdom)) continue;
    const p = B.edge ? B.edge.to : B.prov;
    const P = R.provinces[p];
    if (P.owner !== k) continue;
    const path = findPath(R, k, A.prov, p); if (!path) continue;
    const days = pathDays(R, A.prov, path);
    if (days > 14) continue;
    const odds = power(A.squads) / Math.max(1, power(B.squads));
    if (odds < 0.7) continue;
    const s = (P.seat === 'capital' ? 3 : P.seat === 'castle' ? 2 : 1) * odds / (1 + days / 6);
    if (s > bs) { bs = s; best = p; }
  }
  return best;
}
function chooseTarget(R, k, A, P, rng) {
  const K = R.kingdoms[k];
  const mine = power(A.squads);
  const paid = (R.paid || []).find((x) => x.who === k && x.until > R.day);
  let best = null, bs = 0;
  for (const Q of R.provinces) {
    if (Q.owner === k) continue;
    const free = Q.owner < 0;
    if (!free && !atWar(R, k, Q.owner)) continue;
    if (free && K.landless) continue;
    // reachable within 3 weeks
    const path = findPath(R, k, A.prov, Q.id, { anywhere: true });
    if (!path) continue;
    const days = pathDays(R, A.prov, path);
    if (days > 22) continue;
    let def = power(Q.garrison) * (Q.seat !== 'none' ? wallMult(Q) : 1);
    for (const B of R.armies) if ((B.prov === Q.id || R.provinces[Q.id].neighbors.includes(B.prov)) && !B.edge && B.squads.length && B.kingdom !== k && hostileK(R, k, B.kingdom)) def += power(B.squads) * (B.prov === Q.id ? 1 : 0.5);
    const odds = mine / Math.max(30, def);
    let v = 1 + Q.dev * 0.4 + (Q.seat === 'capital' ? 3 : Q.seat === 'castle' ? 1.5 : Q.seat === 'stronghold' ? 0.6 : 0.2) + Q.villages.length * 0.15;
    let type = 'attack';
    if (K.landless || (P.greed > 1.2 && Q.villages.some((v2) => v2.state !== 'ravaged') && odds < 1.6)) { type = 'raid'; if (odds < 0.6) continue; v = 1 + Q.villages.filter((v2) => v2.state !== 'ravaged').reduce((a, v2) => a + v2.tier, 0) * 0.5; }
    else if (odds < 1.25) continue;
    if (free) v *= 0.5 + P.ambition * 0.8;
    else v *= 0.6 + P.aggression;
    if (paid && Q.owner === paid.target) v *= 2.5;
    if (Q.owner === R.main && k !== R.main && atWar(R, k, R.main)) v *= 1.1;
    if (Q.owner >= 0 && R.kingdoms[Q.owner].player) v *= 1.15;       // the war is about you
    if (sharesBorderProv(R, k, Q)) v *= 1.4;
    const s = v * Math.min(2.5, odds) / (1 + days / 8) * (0.85 + rng() * 0.3);
    if (s > bs) { bs = s; best = { prov: Q.id, type }; }
  }
  return best;
}
function sharesBorderProv(R, k, Q) { return Q.neighbors.some((n) => R.provinces[n].owner === k); }

// ---------------------------------------------------------------- diplomacy, once a season
export function kingSeason(R, k, rng) {
  const K = R.kingdoms[k];
  if (!K.alive) return;
  const P = personality(R, k);
  const fx = SEASON_FX[R.season] || {};
  const me = Math.max(1, strength(R, k));
  const others = R.kingdoms.filter((o) => o.alive && o.id !== k);
  let letters = 0;
  const say = (to, deal) => { if (R.kingdoms[to].player && !R.kingdoms[to].regent) { if (letters >= 1 || R.letters.some((l) => l.from === k)) return; letters++; } return propose(R, k, to, deal); };
  // 1. wars that go badly: truce or peace
  for (const o of others) {
    if (!atWar(R, k, o.id)) continue;
    const ws = scoreFor(R, k, o.id), ex = K.exhaustion || 0;
    if (K.landless) {
      // raiders take tribute to leave a kingdom alone
      if (rng() < 0.25 && strength(R, o.id) < me * 1.2) say(o.id, { type: 'tribute', gold: 8000 + Math.round(rng() * 8) * 1000 });
      continue;
    }
    if (ex > 55 || ws < -35 || (fx.truceBias && ex > 35 && rng() < 0.5)) {
      // a war that has already had its truce ends in a (white) peace
      const truced = (K.truces = K.truces || {})[o.id] || 0;
      const deal = (ws < -50 && ex > 70) || truced >= 1 || (ex > 70 && Math.abs(ws) < 40) ? { type: 'peace' } : { type: 'truce', seasons: 2 };
      if (deal.type === 'truce') K.truces[o.id] = truced + 1;
      const r = say(o.id, deal);
      if (r && r.ok) continue;
    }
    // winning: demand land for peace
    if (ws > 45 && (R.kingdoms[o.id].exhaustion || 0) > 40 && !R.kingdoms[o.id].player) {
      const land = R.provinces.filter((q) => q.owner === o.id && q.neighbors.some((n) => R.provinces[n].owner === k) && q.seat !== 'capital').slice(0, 1).map((q) => q.id);
      const J = judge(R, k, o.id, { type: 'peace', demandProvinces: land });
      if (J.accept) enact(R, k, o.id, { type: 'peace', demandProvinces: land });
    }
  }
  // 2. war declarations (with the 10-day warning)
  for (const o of others) {
    if (atWar(R, k, o.id) || K.landless || liegeOf(R, k) >= 0) continue;
    const r = rel(R, k, o.id);
    if (K.warned[o.id] && R.day >= K.warned[o.id]) {
      delete K.warned[o.id];
      const bound = r.state === 'truce' || treaty(R, 'nap', k, o.id) || treaty(R, 'alliance', k, o.id) || treaty(R, 'defAlliance', k, o.id);
      const ratio = me / Math.max(1, strength(R, o.id));
      if (bound && !(rng() < (1 - P.honour) * (ratio > 1.5 ? 1 : 0.2))) continue;
      declareWar(R, k, o.id);
      continue;
    }
    if (K.warned[o.id]) continue;
    const border = sharesBorder(R, k, o.id);
    if (!border && !(R.paid || []).some((x) => x.who === k && x.target === o.id)) continue;
    const theirs = Math.max(1, strength(R, o.id));
    const active = R.kingdoms.filter((x) => x.alive && x.id !== k && atWar(R, k, x.id)).length;
    const desire = 40 * (P.aggression + (fx.aggression || 0)) + (theirs < me * 0.7 ? 25 : 0) - 0.3 * opinion(R, k, o.id) + (border ? 10 : 0) - 0.5 * (K.exhaustion || 0) - active * 18 + (R.kingdoms[o.id].player ? 4 : 0);
    if (desire > R_WAR.declareAt && rng() < 0.6) {
      K.warned[o.id] = R.day + R_WAR.warning;
      log(R, `Rumours: ${K.short} masses troops on the border of ${R.kingdoms[o.id].short}.`, 'rumour', [k, o.id]);
      if (R.kingdoms[o.id].player) sendLetter(R, { from: k, to: o.id, kind: 'warning', text: `Your spies report ${K.short} banners gathering on your border.` });
    }
  }
  // 3. friends: an alliance against a common threat, trade for the greedy, non-aggression for the fearful
  const threat = others.filter((o) => atWar(R, k, o.id) && !o.landless).sort((a, b) => strength(R, b.id) - strength(R, a.id))[0];
  for (const o of others) {
    if (o.landless || atWar(R, k, o.id) || rng() > 0.35) continue;
    if (threat && atWar(R, o.id, threat.id) && !treaty(R, 'defAlliance', k, o.id) && !treaty(R, 'alliance', k, o.id) && P.honour >= 0.6) { if (say(o.id, { type: 'defAlliance' })) continue; }
    if (P.greed >= 1.2 && sharesBorder(R, k, o.id) && !treaty(R, 'trade', k, o.id)) { if (say(o.id, { type: 'trade' })) continue; }
    if (P.fear >= 0.6 && strength(R, o.id) > me * 1.3 && !treaty(R, 'nap', k, o.id)) say(o.id, { type: 'nap' });
  }
  // 4. a merchant pays others to fight the leader
  if (K.personality === 'merchant' && K.gold > 40000 && rng() < 0.3) {
    const leader = others.filter((o) => !o.landless).sort((a, b) => strength(R, b.id) - strength(R, a.id))[0];
    const hired = leader && others.find((o) => o.id !== leader.id && !o.player && !atWar(R, k, o.id) && !o.landless && sharesBorder(R, o.id, leader.id));
    if (hired) propose(R, k, hired.id, { type: 'payAttack', gold: 10000, target: leader.id });
  }
}
export { R_ARMY };
