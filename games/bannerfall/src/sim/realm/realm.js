// BANNERFALL :: sim/realm/realm.js - the Long War's state and day clock (DESIGN.md 19.1, 19.2, 24.2).
// createRealm() builds a realm from a seed (realmgen.js). realmDay() advances it one day:
//   training, marching, engagements (abstract unless the player is in them), sieges and raids,
//   attrition, money, the AI kings (each every 3 days, staggered), letters and truces running
//   out; at the turn of a season: loyalty and rebellions, memory fading, exhaustion, war score
//   drift and the AI kings' diplomacy. Then falls, risings and the victory check.
// A day is 2 s at 1x in the browser; node tools run thousands of days a second.
import { generateRealm } from './realmgen.js';
import { SEASONS, CLOCK, R_WAR } from '../../data/realm.js';
import { trainDay, marchDay, attritionDay, newArmy } from './armies.js';
import { newSquad } from './realmgen.js';
import { detectEngagements } from './engage.js';
import { siegeDay } from './sieges.js';
import { economyDay, seasonIncome, seasonUpkeep } from './economy.js';
import { seasonKingdoms, checkFalls, checkVictory } from './kingdoms.js';
import { decayMemory, atWar, rel, log, key, war } from './diplomacy.js';
import { kingTick, kingSeason } from '../../ai/king.js';
import { mulberry32 } from '../rng.js';

export function createRealm(o = {}) {
  const R = generateRealm(o);
  R.events = []; R.tributes = []; R.claims = []; R.paid = [];
  R.pauseFor = null; R.result = null;
  // the Black Hounds ride from the start: a raiding host in the wildest free province
  const H = R.kingdoms.find((k) => k.landless);
  if (H && !R.armies.some((A) => A.kingdom === H.id)) { const sq = ['outrider', 'sword', 'horseArcher', 'sword', 'knight', 'outrider', 'javelin', 'spear'].map((t) => newSquad(R, t)); const A = newArmy(R, H.id, H.home ?? 0, sq, "Drogan's Black Hounds"); A.arrived = 0; }
  setSeason(R);
  for (const K of R.kingdoms) { K.seasonIncome = seasonIncome(R, K.id).total; K.seasonUpkeep = seasonUpkeep(R, K.id).total; }
  if (o.allAI) for (const K of R.kingdoms) if (K.player) K.regent = true;
  // fast-forward N days all-AI before handing over (DESIGN.md 25.5 &day=N)
  if (o.day) { const was = R.kingdoms.find((k) => k.player).regent; R.kingdoms.find((k) => k.player).regent = true; realmAdvance(R, o.day); R.kingdoms.find((k) => k.player).regent = was; }
  return R;
}
export function setSeason(R) {
  R.seasonIndex = Math.floor(R.day / CLOCK.seasonDays);
  R.season = SEASONS[R.seasonIndex % 4];
  R.year = 1 + Math.floor(R.day / CLOCK.yearDays);
  R.dayOfSeason = R.day % CLOCK.seasonDays;
}
export function dateText(R) { return `${R.season}, day ${R.dayOfSeason + 1}, year ${R.year}`; }

export function realmDay(R) {
  if (R.result) return;
  const rng = mulberry32(R.rngState);
  R.day++;
  setSeason(R);
  trainDay(R);
  marchDay(R);
  detectEngagements(R);
  siegeDay(R);
  attritionDay(R);
  economyDay(R);
  // the AI kings: one in three each day
  for (const K of R.kingdoms) if (K.alive && (!K.player || K.regent) && (R.day + K.id) % 3 === 0) kingTick(R, K.id, rng);
  // letters and truces run out
  R.letters = R.letters.filter((L) => L.until > R.day || L.kind === 'call');
  for (const k in R.rel) {
    const r = R.rel[k];
    if (r.state === 'truce' && r.until <= R.day) {
      const [a, b] = k.split('|').map(Number);
      if (r.peace || !R.kingdoms[a].alive || !R.kingdoms[b].alive) { r.state = 'peace'; r.peace = false; }
      else { r.state = 'war'; r.since = R.day; if (!war(R, a, b)) R.wars.push({ a, b, start: R.day, score: 0 }); log(R, `The truce between ${R.kingdoms[a].short} and ${R.kingdoms[b].short} is over: the war goes on.`, 'war', [a, b]); }
    }
  }
  R.treaties = R.treaties.filter((t) => !t.until || t.until > R.day);
  if (R.paid) R.paid = R.paid.filter((p) => p.until > R.day);
  // a new season
  if (R.dayOfSeason === 0) newSeason(R, rng);
  checkFalls(R);
  checkVictory(R);
  R.rngState = rng.getState();
}
function newSeason(R, rng) {
  seasonKingdoms(R);
  decayMemory(R);
  for (const K of R.kingdoms) {
    if (!K.alive) continue;
    const wars = R.kingdoms.filter((o) => o.alive && o.id !== K.id && atWar(R, K.id, o.id)).length;
    const lostLand = R.provinces.filter((P) => P.startOwner === K.id && P.owner !== K.id).length;
    if (wars) K.exhaustion = Math.min(100, (K.exhaustion || 0) + R_WAR.exhaustionPerSeason + Math.min(15, lostLand * 2));
    else K.exhaustion = Math.max(0, (K.exhaustion || 0) - R_WAR.peaceRelief * 3);
    if (!wars) K.trust = Math.min(100, K.trust + (R.season === 'Spring' ? 5 : 0));
  }
  // war score drifts toward 0 for a side that holds nothing
  for (const w of R.wars) w.score = Math.round(w.score * 0.92);
  for (const K of R.kingdoms) if (K.alive && (!K.player || K.regent)) kingSeason(R, K.id, rng);
  R.events.push({ type: 'season', season: R.season, year: R.year });
  if (R.season === 'Spring') log(R, `Year ${R.year} of the war begins.`, 'season', []);
}
// advance N days (stops when the player must answer an engagement, unless every seat is AI)
export function realmAdvance(R, days) {
  for (let i = 0; i < days && !R.result; i++) {
    if (R.pauseFor && R.engagements.some((E) => E.id === R.pauseFor && E.status === 'pending')) break;
    R.pauseFor = null;
    realmDay(R);
  }
  return R;
}
// a hash of the realm's state (save -> load -> continue must match a straight run)
export function realmHash(R) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const x = Math.round(v * 100) | 0; h = Math.imul(h ^ (x & 0xffff), 16777619) >>> 0; h = Math.imul(h ^ (x >>> 16), 16777619) >>> 0; };
  mix(R.day); mix(R.rngState);
  for (const P of R.provinces) { mix(P.owner); mix(P.loyalty); mix(P.garrison.length); mix(P.supplies); }
  for (const K of R.kingdoms) { mix(K.gold); mix(K.alive ? 1 : 0); mix(K.exhaustion || 0); mix(K.trust); }
  for (const A of R.armies) { mix(A.prov); for (const s of A.squads) mix(s.men); }
  for (const k in R.rel) mix(['peace', 'war', 'truce'].indexOf(R.rel[k].state));
  mix(R.treaties.length);
  return h.toString(16);
}
export { key, rel };
