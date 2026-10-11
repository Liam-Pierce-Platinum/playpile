// BANNERFALL :: sim/realm/engage.js - when armies meet (DESIGN.md 19.6).
//   detection   hostile armies standing in one province fight. An AVOID-battle army that is
//               weaker slips away one edge, losing 5% to the rearguard. Allies in the province
//               join their side.
//   the player  an engagement with the player's kingdom in it waits (the realm pauses) for the
//               Engagement card: fight it live (a battle at a tier), let the General fight it live,
//               auto-resolve, withdraw or parley. Every other engagement resolves at once in the
//               abstract battle sim.
//   abstract    squads are blobs with a weight (their price per man) x men; the defenders get the
//               ground (forest, hills, snow, marsh), the walls when it is an assault on a seat, and
//               every side its general's level. Rounds trade losses until a side has lost 45% of
//               its men (70% behind walls) and breaks. About 30 rounds: under a millisecond.
import { UNIT_TYPES } from '../../data/units.js';
import { R_SIEGE, R_WAR, R_ARMY } from '../../data/realm.js';
import { atWar, unitWeight, addWarScore, remember, transferProvince, log, rel, liegeOf, treaty } from './diplomacy.js';
import { armyMen, edgeBetween, newArmy } from './armies.js';

export const hostileK = (R, a, b) => a !== b && (a < 0 || b < 0 || atWar(R, a, b));

// ---------------------------------------------------------------- detection (daily)
export function detectEngagements(R) {
  const byProv = new Map();
  for (const A of R.armies) {
    if (A.edge || !A.squads.length) continue;
    if (!byProv.has(A.prov)) byProv.set(A.prov, []);
    byProv.get(A.prov).push(A);
  }
  for (const [pid, list] of byProv) {
    if (R.engagements.some((E) => E.prov === pid && (E.status === 'pending' || E.status === 'live'))) continue;
    const ks = [...new Set(list.map((A) => A.kingdom))];
    if (ks.length < 2) continue;
    // the newest arrival attacks; the side it is at war with defends
    const sorted = list.slice().sort((a, b) => (b.arrived || 0) - (a.arrived || 0));
    const att = sorted[0].kingdom;
    const foes = ks.filter((k) => hostileK(R, att, k));
    if (!foes.length) continue;
    const P = R.provinces[pid];
    const def = foes.includes(P.owner) ? P.owner : foes.sort((a, b) => sideMen(list, b) - sideMen(list, a))[0];
    const sideOf = (k) => (k === att || (!hostileK(R, k, att) && hostileK(R, k, def) && friends(R, k, att)) ? 'att' : k === def || (!hostileK(R, k, def) && hostileK(R, k, att) && friends(R, k, def)) ? 'def' : null);
    const E = { id: 'E' + (R.seq.eng++), prov: pid, attK: att, defK: def, att: [], def: [], day: R.day, status: 'new', assault: false };
    for (const A of list) { const s = sideOf(A.kingdom); if (s) E[s].push(A.id); }
    // avoid battle: a weaker army that is not cornered slips away (DESIGN.md 19.6 rule 1)
    let slipped = false;
    for (const side of ['att', 'def']) {
      const mine = E[side].map((id) => R.armies.find((x) => x.id === id));
      const other = side === 'att' ? 'def' : 'att';
      const ms = mine.reduce((a, A) => a + power(A.squads), 0), os = E[other].reduce((a, id) => a + power(R.armies.find((x) => x.id === id).squads), 0);
      if (mine.length && mine.every((A) => A.stance === 'avoid') && ms < os * 0.8) {
        for (const A of mine) {
          const back = R.provinces[pid].neighbors.find((n) => R.provinces[n].owner === A.kingdom) ?? (A.edge ? A.edge.from : R.provinces[pid].neighbors[0]);
          for (const s of A.squads) s.men = Math.max(1, Math.round(s.men * (1 - R_ARMY.avoidLoss)));
          A.path = [back]; A.order = { type: 'march', target: back };
          log(R, `${A.name} slips away from ${P.name} before the enemy.`, 'info', [A.kingdom]);
        }
        slipped = true;
      }
    }
    if (slipped) continue;
    R.engagements.push(E);
    const playerIn = [...E.att, ...E.def].some((id) => { const A = R.armies.find((x) => x.id === id); return A && R.kingdoms[A.kingdom].player; });
    if (playerIn && !R.kingdoms.find((k) => k.player).regent) { E.status = 'pending'; R.events.push({ type: 'engagement', id: E.id, prov: pid }); R.pauseFor = E.id; }
    else resolveAbstract(R, E);
  }
  R.engagements = R.engagements.filter((E) => E.status === 'pending' || E.status === 'live' || R.day - E.day < 30);
}
function friends(R, a, b) { return !!(treaty(R, 'alliance', a, b) || treaty(R, 'defAlliance', a, b) || liegeOf(R, a) === b || liegeOf(R, b) === a); }
function sideMen(list, k) { return list.filter((A) => A.kingdom === k).reduce((a, A) => a + armyMen(A), 0); }
export function power(squads) { let p = 0; for (const s of squads) p += s.men * unitWeight(s.type); return p; }

// the strength bars on the Engagement card
export function engagementInfo(R, E) {
  const side = (ids) => ids.map((id) => R.armies.find((x) => x.id === id)).filter(Boolean);
  const A = side(E.att), D = side(E.def);
  const P = R.provinces[E.prov];
  const garrison = E.assault ? P.garrison : [];
  return {
    prov: P, att: A, def: D, attK: R.kingdoms[E.attK], defK: R.kingdoms[E.defK],
    attMen: A.reduce((a, x) => a + armyMen(x), 0), defMen: D.reduce((a, x) => a + armyMen(x), 0) + garrison.reduce((a, s) => a + s.men, 0),
    attPow: A.reduce((a, x) => a + power(x.squads), 0), defPow: D.reduce((a, x) => a + power(x.squads), 0) * groundMult(P) + power(garrison) * (E.assault ? wallMult(P) : 1),
    season: R.season, weather: seasonWeather(R, P), assault: E.assault,
  };
}
export function seasonWeather(R, P) {
  const s = R.season;
  if (P.biome === 'snow' && s === 'Winter') return 'snow';
  if (s === 'Winter') return P.biome === 'marsh' ? 'fog' : 'snow';
  if (s === 'Spring') return (P.id + R.day) % 3 === 0 ? 'rain' : 'clear';
  if (s === 'Autumn') return (P.id + R.day) % 4 === 0 ? 'wind' : (P.id + R.day) % 4 === 1 ? 'rain' : 'clear';
  return 'clear';
}
export const groundMult = (P) => ({ forest: 1.12, highland: 1.15, snow: 1.1, marsh: 1.1, river: 1.05 }[P.biome] || 1);
export function wallMult(P) { return Math.max(1.1, (R_SIEGE.wall[P.seat] || 1) - (P.siegeDays || 0) * R_SIEGE.worksPerDay) * Math.max(0.5, P.seatHp ?? 1); }

// ---------------------------------------------------------------- the abstract battle (DESIGN.md 19.6.1)
export function abstractBattle(R, sides, o = {}) {
  // sides: [{ squads: [...], mult, breakAt }, { ... }]
  const start = sides.map((S) => S.squads.reduce((a, s) => a + s.men, 0));
  // losses are men: each side banks the (weighted) damage it takes, and every whole man it adds
  // up to falls in the squad hit hardest so far relative to its share (largest remainder)
  const owed = [0, 0], frac = sides.map((S) => new Map(S.squads.map((s) => [s, 0])));
  let rounds = 0, broke = -1;
  for (; rounds < 60; rounds++) {
    const pow = sides.map((S) => power(S.squads.filter((s) => s.men > 0)) * S.mult);
    for (let i = 0; i < 2; i++) {
      const j = 1 - i, T = sides[j];
      const alive = T.squads.filter((s) => s.men > 0);
      const tot = alive.reduce((a, s) => a + s.men * unitWeight(s.type), 0);
      if (!tot) continue;
      const dmg = pow[i] * 0.03;                       // weighted men lost this round
      for (const s of alive) frac[j].set(s, frac[j].get(s) + dmg * (s.men * unitWeight(s.type)) / tot / unitWeight(s.type));
      owed[j] += alive.reduce((a, s) => a + dmg * (s.men * unitWeight(s.type)) / tot / unitWeight(s.type), 0);
      while (owed[j] >= 1) {
        let pick = null, pf = -1;
        for (const s of alive) if (s.men > 0 && frac[j].get(s) > pf) { pf = frac[j].get(s); pick = s; }
        if (!pick) break;
        pick.men--; frac[j].set(pick, frac[j].get(pick) - 1); owed[j] -= 1;
      }
    }
    const now = sides.map((S) => S.squads.reduce((a, s) => a + s.men, 0));
    for (let i = 0; i < 2; i++) if (now[i] <= start[i] * (1 - sides[i].breakAt)) { broke = broke < 0 ? i : now[i] / start[i] < now[broke] / start[broke] ? i : broke; }
    if (broke >= 0) break;
  }
  if (broke < 0) { const now = sides.map((S, i) => S.squads.reduce((a, s) => a + s.men, 0) / Math.max(1, start[i])); broke = now[0] < now[1] ? 0 : 1; }
  return { winner: 1 - broke, loser: broke, rounds, start, end: sides.map((S) => S.squads.reduce((a, s) => a + s.men, 0)) };
}

// resolve an engagement in the abstract sim and write everything back to the realm
export function resolveAbstract(R, E) {
  const P = R.provinces[E.prov];
  const arm = (ids) => ids.map((id) => R.armies.find((x) => x.id === id)).filter(Boolean);
  const A = arm(E.att), D = arm(E.def);
  if (!A.length || !D.length && !E.assault) { E.status = 'done'; return null; }
  const gen = (list) => 1 + 0.05 * Math.max(0, ...list.map((x) => x.general.level - 1));
  const winterA = R.season === 'Winter' ? 0.92 : 1;
  const attSquads = A.flatMap((x) => x.squads), defSquads = D.flatMap((x) => x.squads).concat(E.assault ? P.garrison : []);
  const defMult = groundMult(P) * gen(D) * (E.assault ? wallMult(P) : 1) * (E.sally ? 0.9 : 1);
  const res = abstractBattle(R, [{ squads: attSquads, mult: gen(A) * winterA, breakAt: 0.45 }, { squads: defSquads, mult: defMult, breakAt: E.assault ? 0.7 : 0.45 }]);
  return applyResult(R, E, res.winner === 0 ? 'att' : 'def', res, false);
}
// write a result back (abstract or live): who won, losses already applied to the squad records
export function applyResult(R, E, winSide, res, live) {
  const P = R.provinces[E.prov];
  const arm = (ids) => ids.map((id) => R.armies.find((x) => x.id === id)).filter(Boolean);
  const W = winSide === 'att' ? arm(E.att) : arm(E.def), L = winSide === 'att' ? arm(E.def) : arm(E.att);
  const wk = winSide === 'att' ? E.attK : E.defK, lk = winSide === 'att' ? E.defK : E.attK;
  E.status = 'done'; E.winner = wk; E.result = { winSide, live: !!live, start: res.start, end: res.end };
  // the beaten armies fall back one edge toward home, losing more in the pursuit; a broken husk is destroyed
  for (const X of L) {
    for (const s of X.squads) s.men = Math.floor(s.men * 0.9);
    X.squads = X.squads.filter((s) => s.men > 0);
    if (!X.squads.length || armyMen(X) < 25) { log(R, `${X.name} is destroyed at ${P.name}.`, 'battle', [X.kingdom, wk]); if (wk >= 0) addWarScore(R, wk, lk, R_WAR.armyDestroyed); X.squads = []; continue; }
    const home = P.neighbors.map((n) => R.provinces[n]).filter((q) => q.owner === X.kingdom).sort((a, b) => b.dev - a.dev)[0] || R.provinces[(X.edge && X.edge.from) ?? P.neighbors[0]];
    X.path = [home.id]; X.order = { type: 'march', target: home.id }; X.morale = -10; X.lastBattle = R.day;
    if (P.siegedBy === X.id) { P.siegedBy = -1; P.siegeDays = 0; }
    X.siegeOf = -1;
  }
  for (const X of W) { X.lastBattle = R.day; for (const s of X.squads) s.xp = Math.min(400, (s.xp || 0) + 20); if (X.general.level < 5 && R.day % 2 === 0) X.general.level++; }
  R.armies = R.armies.filter((X) => X.squads.length);
  // the garrison of a stormed seat, and the seat itself
  P.garrison = P.garrison.filter((s) => s.men > 0);
  if (E.assault && winSide === 'att') {
    const old = P.owner;
    P.garrison = [];
    transferProvince(R, P, wk, 'stormed');
    P.siegedBy = -1; P.siegeDays = 0; P.supplies = R_SIEGE.supplies[P.seat] || 0; P.seatHp = 0.6;
    const loot = P.seat === 'capital' ? 60000 : P.seat === 'castle' ? 25000 : 12000;
    if (wk >= 0) { R.kingdoms[wk].gold += loot; if (old >= 0) addWarScore(R, wk, old, P.seat === 'capital' ? R_WAR.capitalHeld : R_WAR.provinceTaken); }
    log(R, `${R.kingdoms[wk].short} storms ${P.name}${P.seat !== 'none' ? ' (' + P.seat + ')' : ''}!`, 'battle', [wk, old]);
    R.events.push({ type: 'seatFell', prov: P.id, to: wk, from: old });
  }
  const size = res.start[0] + res.start[1];
  if (wk >= 0 && lk >= 0) {
    addWarScore(R, wk, lk, Math.round(Math.min(R_WAR.battleWon[1], R_WAR.battleWon[0] + size / 120)));
    // fought beside us
    for (const X of W) if (X.kingdom !== wk) remember(R, wk, X.kingdom, 'foughtBeside');
  }
  // exhaustion: +1 per 1% of a kingdom's men lost
  for (const [ids, i] of [[E.att, 0], [E.def, 1]]) {
    const ks = new Set(arm(ids).map((x) => x.kingdom).concat(i === 1 && E.assault && P.owner >= 0 ? [P.owner] : []));
    const lostPct = (res.start[i] - res.end[i]) / Math.max(1, res.start[i] + 200) * 100;
    for (const k of ks) if (R.kingdoms[k]) R.kingdoms[k].exhaustion = Math.min(100, (R.kingdoms[k].exhaustion || 0) + lostPct * R_WAR.exhaustionPerPct * 0.5);
  }
  log(R, `Battle of ${P.name}: ${R.kingdoms[wk] ? R.kingdoms[wk].short : 'the rebels'} win${live ? ' (fought on the field)' : ''}. Losses ${res.start[0] - res.end[0]} and ${res.start[1] - res.end[1]}.`, 'battle', [E.attK, E.defK]);
  R.events.push({ type: 'battle', id: E.id, prov: P.id, winner: wk, loser: lk, live: !!live });
  return E;
}
export { rel, edgeBetween, newArmy, UNIT_TYPES };
