// BANNERFALL :: sim/realm/armies.js - raising armies and marching them across the realm (DESIGN.md 19.5).
//   raise     at a province with a castle seat: a squad every 2 days per seat (a queue of 5),
//             paid at the v2 war prices; new squads join an army there or form a new one
//   orders    march to, attack (march then engage the seat), besiege, raid (pillage its villages),
//             defend (stand as a field army), winter quarters; merge and split
//   stance    avoid battle / accept battle / seek battle
//   marching  along edges, a day at a time: edge days x the season x the slowest unit (siege
//             x1.4, all-horse x0.7); passes shut in winter; peace means no entry without access
//   supply    an army in hostile land with no friendly seat within one edge loses 1% of its men
//             every 5 days (half in summer); winter outside a friendly seat costs 1% per 3 days
import { UNIT_TYPES } from '../../data/units.js';
import { R_ARMY, R_ECON, SEASON_FX } from '../../data/realm.js';
import { newSquad } from './realmgen.js';
import { atWar, atTruce, treaty, liegeOf, log, remember } from './diplomacy.js';

export function armiesOf(R, k) { return R.armies.filter((A) => A.kingdom === k && A.squads.length); }
export function armyMen(A) { let n = 0; for (const s of A.squads) n += s.men; return n; }
export function edgeBetween(R, a, b) { return R.edges.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a)); }

// how many armies a kingdom may field: one per castle seat, plus one for the capital
export function armyCap(R, k) {
  let n = 0;
  for (const P of R.provinces) if (P.owner === k && (P.seat === 'castle' || P.seat === 'capital')) n += P.seat === 'capital' ? 2 : 1;
  return Math.max(R.kingdoms[k].landless ? 2 : 1, n);
}
export function newArmy(R, k, prov, squads = [], name) {
  const K = R.kingdoms[k];
  const n = K.armySeq = (K.armySeq || 0) + 1;
  const ORD = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth', 'Eleventh', 'Twelfth'];
  const A = {
    id: 'A' + (R.seq.army++), kingdom: k, name: name || `${K.short}'s ${ORD[n - 1] || n + 'th'} Host`,
    general: { name: generalName(R, k, n), level: 1 + (K.player && n === 1 ? 1 : 0) }, prov, edge: null, path: [], order: { type: 'defend' }, stance: 'accept',
    squads, morale: 0, lastBattle: -99, raidDays: 0, wounded: 0,
  };
  R.armies.push(A);
  return A;
}
const GN = ['Sir Aldous', 'Dame Brenna', 'Lord Cuthbert', 'Sir Edwy', 'Lady Gytha', 'Lord Hereward', 'Sir Oswy', 'Dame Wynn', 'Lord Ranulf', 'Sir Tobin', 'Dame Elfreda', 'Lord Garrick'];
function generalName(R, k, n) { return R.kingdoms[k].player && n === 1 ? 'The Marshal' : GN[(k * 5 + n * 3 + R.seq.army) % GN.length]; }

// ---------------------------------------------------------------- raising (DESIGN.md 19.5)
export function canRaiseAt(R, k, P) { return P.owner === k && (P.seat === 'castle' || P.seat === 'capital') && !(P.siegedBy >= 0); }
export function unitCost(type) { return (UNIT_TYPES[type].cost || 50) * R_ECON.priceMult; }
export function raise(R, k, provId, type) {
  const K = R.kingdoms[k], P = R.provinces[provId];
  if (!P || !canRaiseAt(R, k, P)) return { error: 'Raise troops at one of your castles' };
  if (!UNIT_TYPES[type] || type === 'king' || type === 'commander') return { error: 'No such troops' };
  const cost = Math.round(unitCost(type) * (SEASON_FX[R.season] ? SEASON_FX[R.season].recruit : 1));
  if (K.gold < cost) return { error: 'Not enough gold (' + cost.toLocaleString() + ' g)' };
  const q = K.queue.filter((e) => e.prov === provId);
  if (q.length >= R_ARMY.queue) return { error: 'The muster is full here (5)' };
  if (bannersOf(R, k) + 1 > R_ARMY.maxBanners * Math.max(1, Math.ceil(armyCap(R, k) / 2))) return { error: 'Too many banners for your castles' };
  K.gold -= cost;
  K.queue.push({ prov: provId, type, days: R_ARMY.trainDays + q.length * R_ARMY.trainDays, cost });
  return { ok: true, cost };
}
export function bannersOf(R, k) {
  let n = 0;
  for (const A of R.armies) if (A.kingdom === k) n += A.squads.length;
  for (const e of R.kingdoms[k].queue) n++;
  return n;
}
// a day of training: finished squads join an army in that province (or a new one, if the cap allows; else the garrison)
export function trainDay(R) {
  for (const K of R.kingdoms) {
    if (!K.alive || !K.queue.length) continue;
    for (const e of K.queue) e.days -= 1;
    const done = K.queue.filter((e) => e.days <= 0);
    K.queue = K.queue.filter((e) => e.days > 0);
    for (const e of done) {
      const P = R.provinces[e.prov];
      if (P.owner !== K.id) { K.gold += e.cost; continue; }
      const sq = newSquad(R, e.type);
      let A = R.armies.find((x) => x.kingdom === K.id && x.prov === e.prov && !x.edge && x.squads.length < R_ARMY.maxBanners);
      if (!A && armiesOf(R, K.id).length < armyCap(R, K.id)) A = newArmy(R, K.id, e.prov);
      if (A) A.squads.push(sq); else P.garrison.push(sq);
    }
  }
}
// move squads from a province's garrison into an army there (or a new one)
export function musterGarrison(R, k, provId, n = 99, keep = 2) {
  const P = R.provinces[provId];
  if (P.owner !== k) return null;
  const take = P.garrison.splice(0, Math.max(0, P.garrison.length - keep)).slice(0, n);
  if (!take.length) return null;
  let A = R.armies.find((x) => x.kingdom === k && x.prov === provId && !x.edge);
  if (!A) { if (armiesOf(R, k).length >= armyCap(R, k)) { P.garrison.push(...take); return null; } A = newArmy(R, k, provId); }
  A.squads.push(...take);
  return A;
}

// ---------------------------------------------------------------- paths
// may kingdom k's armies enter province P? (its own, an enemy's, free land, or a friend's with access)
export function mayEnter(R, k, P) {
  if (P.owner < 0 || P.owner === k) return true;
  if (atWar(R, k, P.owner)) return true;
  if (treaty(R, 'access', k, P.owner) || treaty(R, 'alliance', k, P.owner) || liegeOf(R, k) === P.owner || liegeOf(R, P.owner) === k) return true;
  return false;
}
export function marchSpeed(R, A) {
  let k = SEASON_FX[R.season] ? SEASON_FX[R.season].march : 1;
  const engines = A.squads.some((s) => UNIT_TYPES[s.type].engine);
  const allHorse = A.squads.length && A.squads.every((s) => UNIT_TYPES[s.type].tags.includes('cavalry'));
  if (engines) k /= 1.4; else if (allHorse) k /= 0.7;
  return k;
}
export function findPath(R, k, from, to, opts = {}) {
  if (from === to) return [];
  const N = R.provinces.length, dist = new Float64Array(N).fill(Infinity), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[from] = 0;
  for (;;) {
    let u = -1, bd = Infinity;
    for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
    if (u < 0 || u === to) break;
    done[u] = 1;
    for (const e of R.edges) {
      if (e.a !== u && e.b !== u) continue;
      const v = e.a === u ? e.b : e.a;
      if (done[v]) continue;
      if (R.season === 'Winter' && e.crossing === 'pass' && !opts.ignoreSeason) continue;
      // a kingdom at peace lets an army pass, slowly and resentfully (no access: +3 days and a grudge)
      const free = mayEnter(R, k, R.provinces[v]);
      if (!free && atTruce(R, k, R.provinces[v].owner) && v !== to) continue;
      const d = dist[u] + e.days + (free ? 0 : 3);
      if (d < dist[v]) { dist[v] = d; prev[v] = u; }
    }
  }
  if (!isFinite(dist[to])) return null;
  const path = [];
  for (let v = to; v !== from; v = prev[v]) path.unshift(v);
  return path;
}
export function pathDays(R, from, path) { let d = 0, a = from; for (const b of path) { const e = edgeBetween(R, a, b); d += e ? e.days : 5; a = b; } return d; }

// ---------------------------------------------------------------- orders
export function order(R, A, o) {
  if (!A || !A.squads.length) return { error: 'No army' };
  if (o.stance) { A.stance = o.stance; if (!o.type) return { ok: true }; }
  const target = o.target !== undefined ? o.target : A.prov;
  if (o.type === 'merge') {
    const B = R.armies.find((x) => x.id === o.with);
    if (!B || B.kingdom !== A.kingdom || B.prov !== A.prov || B.edge || A.edge) return { error: 'Both armies must stand in the same province' };
    A.squads.push(...B.squads.splice(0)); R.armies = R.armies.filter((x) => x !== B);
    return { ok: true };
  }
  if (o.type === 'split') {
    if (A.edge) return { error: 'Halt first' };
    if (armiesOf(R, A.kingdom).length >= armyCap(R, A.kingdom)) return { error: 'You may not field another army (castles limit your hosts)' };
    const half = A.squads.splice(Math.ceil(A.squads.length / 2));
    const B = newArmy(R, A.kingdom, A.prov, half);
    return { ok: true, army: B.id };
  }
  if (o.type === 'garrison') {
    const P = R.provinces[A.prov];
    if (A.edge || P.owner !== A.kingdom) return { error: 'Garrison your own province' };
    P.garrison.push(...A.squads.splice(0)); R.armies = R.armies.filter((x) => x !== A);
    return { ok: true };
  }
  const start = A.edge ? A.edge.to : A.prov;
  const path = findPath(R, A.kingdom, start, target, { anywhere: o.type === 'attack' || o.type === 'besiege' || o.type === 'raid' });
  if (path === null) return { error: 'No road there (peace closes borders; winter shuts the passes)' };
  A.path = path; A.order = { type: o.type || 'march', target };
  A.siegeOf = -1;
  return { ok: true, days: pathDays(R, start, path) + (A.edge ? Math.max(0, A.edge.days - A.edge.t) : 0) };
}

// ---------------------------------------------------------------- a day of marching
export function marchDay(R) {
  for (const A of R.armies) {
    if (!A.squads.length) continue;
    if (!A.edge && A.path.length) {
      const nxt = A.path[0], e = edgeBetween(R, A.prov, nxt);
      if (!e || (R.season === 'Winter' && e.crossing === 'pass')) { A.path = []; continue; }
      if (!mayEnter(R, A.kingdom, R.provinces[nxt])) {
        const o = R.provinces[nxt].owner;
        if (atTruce(R, A.kingdom, o)) { A.path = []; continue; }
        remember(R, o, A.kingdom, 'trespass', 1, 'marched through our land');
      }
      if (A.siegeOf >= 0) { const P = R.provinces[A.siegeOf]; if (P.siegedBy === A.id) { P.siegedBy = -1; P.siegeDays = 0; } A.siegeOf = -1; }
      A.edge = { e: e.id, from: A.prov, to: nxt, t: 0, days: e.days };
      A.path.shift();
    }
    if (A.edge) {
      A.edge.t += marchSpeed(R, A);
      if (A.edge.t >= A.edge.days) { A.prov = A.edge.to; A.edge = null; A.arrived = R.day; R.events.push({ type: 'arrive', army: A.id, prov: A.prov }); }
    }
  }
}
// supply and winter attrition, once a day
export function attritionDay(R) {
  const fx = SEASON_FX[R.season] || {};
  for (const A of R.armies) {
    if (!A.squads.length || R.kingdoms[A.kingdom].landless && fx.attrition === 0) continue;
    const P = R.provinces[A.edge ? A.edge.to : A.prov];
    const friendly = (p) => p.owner === A.kingdom || (p.owner >= 0 && (treaty(R, 'alliance', A.kingdom, p.owner) || liegeOf(R, A.kingdom) === p.owner));
    const supplied = friendly(P) || P.neighbors.some((n) => friendly(R.provinces[n]) && R.provinces[n].seat !== 'none');
    let loss = 0;
    if (!supplied && !R.kingdoms[A.kingdom].landless) loss += R_ARMY.supplyLoss * (R.season === 'Summer' ? 0.5 : 1);
    if (fx.attrition && !(friendly(P) && P.seat !== 'none')) loss += fx.attrition;
    if (!loss) continue;
    A.attr = (A.attr || 0) + loss;
    if (A.attr >= 0.01) {
      // a man in every few squads, rounded so small armies do not melt to nothing
      const per = A.attr; A.attr = 0;
      for (const s of A.squads) { const lose = Math.floor(s.men * per + ((s.id.charCodeAt(s.id.length - 1) + R.day) % 7) / 7 * 0.999); s.men = Math.max(0, s.men - lose); }
      A.squads = A.squads.filter((s) => s.men > 0);
    }
  }
  R.armies = R.armies.filter((A) => A.squads.length);
}
// who can see this army (DESIGN.md 19.5: in your provinces and next to them, and where allies see)
export function visibleTo(R, k, A) {
  if (A.kingdom === k) return true;
  const p = A.edge ? A.edge.to : A.prov;
  const sees = (kk) => { for (const P of R.provinces) if (P.owner === kk && (P.id === p || P.neighbors.includes(p))) return true; for (const B of R.armies) if (B.kingdom === kk && (B.prov === p || R.provinces[B.prov].neighbors.includes(p))) return true; return false; };
  if (sees(k)) return true;
  for (const t of R.treaties) if (t.type === 'alliance' && (t.a === k || t.b === k) && sees(t.a === k ? t.b : t.a)) return true;
  return false;
}
export { log };
