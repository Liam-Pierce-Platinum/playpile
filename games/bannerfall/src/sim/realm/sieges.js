// BANNERFALL :: sim/realm/sieges.js - sieges, raids and occupation (DESIGN.md 19.9).
//   siege     an army in a province whose seat is hostile, with no hostile field army there, sits
//             down before the walls. The seat's supplies (fort 30 days, castle 60, capital 90) fall
//             a day at a time; at 0 the garrison loses 2% a day. Siege works wear the walls down.
//   choices   each day the besieger may ASSAULT (an engagement at the walls), STARVE (wait),
//             offer TERMS (the garrison marches out and the seat is handed over: accepted when
//             supplies are under 10 days or the garrison is under 0.4 of the besiegers) or LIFT
//             the siege. The defender may SALLY when it is the stronger. AI kings make the same
//             choices; the player makes them on the realm map (or the AI does, when it is regent).
//   raid      an army with a raid order pillages a village every 3 days: gold, ashes, a grudge.
//   occupy    a province with no seat falls to an uncontested army after 5 days.
import { R_SIEGE } from '../../data/realm.js';
import { transferProvince, remember, log, addWarScore } from './diplomacy.js';
import { hostileK, power, wallMult, resolveAbstract } from './engage.js';
import { armyMen, newArmy } from './armies.js';
import { R_ECON } from '../../data/realm.js';

export function siegeDay(R) {
  for (const A of R.armies) {
    if (A.edge || !A.squads.length) continue;
    const P = R.provinces[A.prov];
    const hostile = P.owner !== A.kingdom && hostileK(R, A.kingdom, P.owner);
    const goal = A.order && A.order.target === P.id && ['attack', 'besiege', 'raid'].includes(A.order.type);
    const enemyField = R.armies.some((B) => B.prov === P.id && !B.edge && B.squads.length && hostileK(R, A.kingdom, B.kingdom));
    if (!hostile || enemyField) continue;
    // RAID: pillage a village every three days
    if (goal && A.order.type === 'raid') {
      A.raidDays = (A.raidDays || 0) + 1;
      const v = P.villages.find((x) => x.state !== 'ravaged');
      if (!v) { A.order = { type: 'defend' }; continue; }
      if (A.raidDays % 3 === 0) {
        v.state = 'ravaged'; v.owner = -1; v.ravagedDay = R.day;
        const g = [0, 6000, 10000, 16000][v.tier];
        R.kingdoms[A.kingdom].gold += g;
        P.loyalty = Math.max(0, P.loyalty - 10);
        if (P.owner >= 0) remember(R, P.owner, A.kingdom, 'pillaged', 1, 'pillaged ' + P.name);
        log(R, `${R.kingdoms[A.kingdom].short} pillages a village in ${P.name} (+${g.toLocaleString()} g).`, 'raid', [A.kingdom, P.owner]);
        R.events.push({ type: 'pillage', prov: P.id, by: A.kingdom, gold: g });
      }
      continue;
    }
    if (!goal) continue;
    // a province with no seat: occupied after five uncontested days
    if (P.seat === 'none' || P.seatHp <= 0) {
      A.occupy = (A.occupyProv === P.id ? (A.occupy || 0) : 0) + 1; A.occupyProv = P.id;
      if (A.occupy >= 5) { const old = P.owner; transferProvince(R, P, A.kingdom, 'occupied'); if (old >= 0) addWarScore(R, A.kingdom, old, 8); log(R, `${R.kingdoms[A.kingdom].short} occupies ${P.name}.`, 'battle', [A.kingdom, old]); A.order = { type: 'defend' }; A.occupy = 0; }
      continue;
    }
    // the siege
    if (P.siegedBy !== A.id && !(P.siegedBy && R.armies.some((x) => x.id === P.siegedBy && x.prov === P.id))) {
      P.siegedBy = A.id; P.siegeDays = 0; A.siegeOf = P.id;
      log(R, `${A.name} lays siege to ${P.name}.`, 'siege', [A.kingdom, P.owner]);
      R.events.push({ type: 'siege', prov: P.id, by: A.kingdom });
    }
    if (P.siegedBy !== A.id) continue;
    P.siegeDays++;
    P.supplies = Math.max(0, P.supplies - 1);
    if (P.supplies <= 0) for (const s of P.garrison) s.men = Math.max(0, Math.floor(s.men * (1 - R_SIEGE.starveLoss) - ((R.day + s.men) % 3 === 0 ? 1 : 0)));
    P.garrison = P.garrison.filter((s) => s.men > 0);
    if (!P.garrison.length) { takeSeat(R, P, A, 'starved'); continue; }
    const K = R.kingdoms[A.kingdom];
    const choice = (K.player && !K.regent) ? (A.siegeChoice || 'starve') : siegeAI(R, A, P);
    A.siegeChoice = (K.player && !K.regent) ? A.siegeChoice : null;
    if (choice === 'assault') { A.siegeChoice = null; assault(R, A, P); }
    else if (choice === 'terms') { A.siegeChoice = null; offerTerms(R, A, P); }
    else if (choice === 'lift') { A.siegeChoice = null; P.siegedBy = -1; P.siegeDays = 0; A.siegeOf = -1; A.order = { type: 'defend' }; log(R, `${A.name} lifts the siege of ${P.name}.`, 'siege', [A.kingdom]); }
    // the defender sallies when it is the stronger
    else if (P.siegedBy === A.id && P.owner >= 0 && power(P.garrison) * 0.9 > power(A.squads) * 1.25) sally(R, A, P);
  }
}
// what an AI besieger does today
export function siegeAI(R, A, P) {
  const ratio = power(A.squads) / Math.max(1, power(P.garrison) * wallMult(P));
  if (P.siegeDays >= 3 && ratio > 1.35) return 'assault';
  if (P.supplies <= 0 && ratio > 0.8) return 'assault';
  if ((P.supplies < R_SIEGE.termsSupplies || power(P.garrison) < power(A.squads) * R_SIEGE.termsRatio) && P.siegeDays % 4 === 0) return 'terms';
  if (P.siegeDays > 50 && ratio < 0.5) return 'lift';
  return 'starve';
}
export function assault(R, A, P) {
  const E = { id: 'E' + (R.seq.eng++), prov: P.id, attK: A.kingdom, defK: P.owner, att: [A.id], def: [], day: R.day, status: 'new', assault: true };
  // armies of the defender in the province join from the walls
  for (const B of R.armies) if (B.prov === P.id && !B.edge && B.kingdom === P.owner) E.def.push(B.id);
  R.engagements.push(E);
  const K = R.kingdoms[A.kingdom];
  if (K.player && !K.regent) { E.status = 'pending'; R.events.push({ type: 'engagement', id: E.id, prov: P.id }); R.pauseFor = E.id; return E; }
  return resolveAbstract(R, E);
}
export function offerTerms(R, A, P) {
  const accept = P.supplies < R_SIEGE.termsSupplies || power(P.garrison) < power(A.squads) * R_SIEGE.termsRatio;
  if (!accept) { log(R, `The garrison of ${P.name} refuses terms.`, 'siege', [A.kingdom, P.owner]); return false; }
  // the garrison marches out armed to the nearest friendly province
  const owner = P.owner;
  const home = owner >= 0 ? P.neighbors.map((n) => R.provinces[n]).find((q) => q.owner === owner) : null;
  if (home && P.garrison.length) { home.garrison.push(...P.garrison); }
  P.garrison = [];
  takeSeat(R, P, A, 'terms');
  return true;
}
function takeSeat(R, P, A, why) {
  const old = P.owner;
  transferProvince(R, P, A.kingdom, why);
  P.siegedBy = -1; P.siegeDays = 0; A.siegeOf = -1; P.supplies = Math.round((R_SIEGE.supplies[P.seat] || 0) * 0.5);
  // a squad or two stays as the new garrison
  const stay = A.squads.splice(0, Math.min(2, Math.max(0, A.squads.length - 2)));
  P.garrison.push(...stay);
  if (old >= 0) addWarScore(R, A.kingdom, old, P.seat === 'capital' ? 40 : 15);
  log(R, `${P.name} ${why === 'terms' ? 'surrenders on terms' : 'starves and falls'} to ${R.kingdoms[A.kingdom].short}.`, 'siege', [A.kingdom, old]);
  R.events.push({ type: 'seatFell', prov: P.id, to: A.kingdom, from: old });
  A.order = { type: 'defend' };
}
function sally(R, A, P) {
  // the garrison comes out as a little army and fights in the field
  const G = newArmy(R, P.owner, P.id, P.garrison.splice(0), 'The ' + P.name + ' garrison');
  const E = { id: 'E' + (R.seq.eng++), prov: P.id, attK: P.owner, defK: A.kingdom, att: [G.id], def: [A.id], day: R.day, status: 'new', sally: true };
  R.engagements.push(E);
  log(R, `The garrison of ${P.name} sallies out!`, 'siege', [P.owner, A.kingdom]);
  resolveAbstract(R, E);
  // survivors go back behind the walls
  if (G.squads.length && R.provinces[P.id].owner === G.kingdom) { P.garrison.push(...G.squads.splice(0)); }
  R.armies = R.armies.filter((x) => x.squads.length);
}
export { armyMen, R_ECON };
