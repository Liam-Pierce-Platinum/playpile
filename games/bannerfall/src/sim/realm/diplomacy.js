// BANNERFALL :: sim/realm/diplomacy.js - the Long War's diplomacy (DESIGN.md 20.1-20.5).
//   relations   every pair of kingdoms is at PEACE, WAR or TRUCE (timed), plus treaties: a
//               non-aggression pact, trade, military access, a defensive or full alliance, vassalage
//   opinion     personality base + memory (decaying to a floor that never fades) + treaties +
//               the situation (a shared border, a common enemy, strength, being at war)
//   trust       one number per kingdom that everyone sees: broken truces and treaties cost 30
//   war score   per war, from the attacker's side; exhaustion per kingdom
//   proposals   judged by one number U (accept above 10) with the top reasons in words; the AI
//               kings propose too (envoy letters to the player), declare war after a warning, and
//               break their word when it pays and their honour allows
import { REALM_PERSONALITY, MEMORY, TRAITS } from '../../data/personalities.js';
import { R_WAR, R_ECON } from '../../data/realm.js';

export const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
export function rel(R, a, b) { return R.rel[key(a, b)] || (R.rel[key(a, b)] = { state: 'peace', since: R.day, until: 0 }); }
export const atWar = (R, a, b) => a !== b && rel(R, a, b).state === 'war';
export const atTruce = (R, a, b) => rel(R, a, b).state === 'truce';
export function treaty(R, type, a, b) { return R.treaties.find((t) => t.type === type && ((t.a === a && t.b === b) || (t.a === b && t.b === a))); }
export function allies(R, k) { const out = []; for (const t of R.treaties) if (t.type === 'alliance' || t.type === 'defAlliance') { if (t.a === k) out.push(t.b); else if (t.b === k) out.push(t.a); } return out; }
export function liegeOf(R, k) { const t = R.treaties.find((x) => x.type === 'vassal' && x.b === k); return t ? t.a : -1; }
export function personality(R, k) {
  const K = R.kingdoms[k];
  const P = { ...(REALM_PERSONALITY[K.personality] || REALM_PERSONALITY.steadfast) };
  for (const t of K.traits || []) for (const f in TRAITS[t] || {}) P[f] = (P[f] || 0) + TRAITS[t][f];
  return P;
}

// ---------------------------------------------------------------- memory (DESIGN.md 20.3)
export function remember(R, victim, actor, kind, mult = 1, text) {
  if (victim === actor || !R.kingdoms[victim] || !R.kingdoms[actor]) return;
  const M = MEMORY[kind]; if (!M) return;
  const add = (who, v) => {
    if (who === actor || !v) return;
    const m = (R.memory[who] = R.memory[who] || {});
    const list = (m[actor] = m[actor] || []);
    // repeated events of a kind stack into one line (pillage to -40, gifts to +25)
    const cap = kind === 'pillaged' ? -40 : kind === 'trespass' ? -20 : kind === 'gift' ? 25 : kind === 'foughtBeside' ? 40 : null;
    const ex = cap !== null ? list.find((e) => e.kind === kind) : null;
    if (ex) { ex.v = cap < 0 ? Math.max(cap, ex.v + v) : Math.min(cap, ex.v + v); ex.day = R.day; return; }
    list.push({ kind, v, floor: Math.sign(v) === Math.sign(M[3]) ? M[3] * Math.abs(v / (M[0] || 1)) : 0, decay: M[2], day: R.day, text: text || kind });
    if (list.length > 14) list.splice(list.findIndex((e) => e.floor === 0), 1);
  };
  add(victim, M[0] * mult);
  if (M[1]) for (const K of R.kingdoms) if (K.alive && K.id !== victim && K.id !== actor) add(K.id, M[1] * mult);
}
// once a season: memories fade toward their floor (grudge divides the decay)
export function decayMemory(R) {
  for (const who in R.memory) {
    const g = personality(R, +who).grudge || 1;
    for (const about in R.memory[who]) {
      const list = R.memory[who][about];
      for (const e of list) {
        const d = e.decay / g;
        if (e.v > e.floor) e.v = Math.max(e.floor, e.v - d); else if (e.v < e.floor) e.v = Math.min(e.floor, e.v + d);
      }
      R.memory[who][about] = list.filter((e) => Math.abs(e.v) > 0.5 || e.floor);
    }
  }
}

// ---------------------------------------------------------------- strength and opinion
export function strength(R, k) {
  let n = 0;
  for (const A of R.armies) if (A.kingdom === k) for (const s of A.squads) n += s.men * unitWeight(s.type);
  for (const P of R.provinces) if (P.owner === k) for (const s of P.garrison) n += s.men * unitWeight(s.type) * 0.8;
  return Math.round(n);
}
import { UNIT_TYPES } from '../../data/units.js';
const WCACHE = {};
export function unitWeight(type) {
  if (WCACHE[type]) return WCACHE[type];
  const D = UNIT_TYPES[type];
  return (WCACHE[type] = D ? Math.max(0.5, Math.pow((D.cost || 40) / Math.max(1, D.men), 0.6) / 3.2) * (D.engine ? 1.5 : 1) : 1);
}
const provincesOf = (R, k) => R.provinces.filter((P) => P.owner === k);
export function sharesBorder(R, a, b) {
  for (const P of R.provinces) if (P.owner === a) for (const n of P.neighbors) if (R.provinces[n].owner === b) return true;
  return false;
}
export function opinion(R, who, about, withReasons = false) {
  if (who === about) return withReasons ? { v: 100, reasons: [] } : 100;
  const P = personality(R, who);
  const reasons = [];
  let v = P.base || 0;
  if (v) reasons.push([v, 'Their nature']);
  const mem = (R.memory[who] || {})[about] || [];
  for (const e of mem) { v += e.v; reasons.push([Math.round(e.v), memText(e)]); }
  // treaties
  if (treaty(R, 'alliance', who, about)) { v += 25; reasons.push([25, 'Allies']); }
  else if (treaty(R, 'defAlliance', who, about)) { v += 15; reasons.push([15, 'Defensive allies']); }
  if (treaty(R, 'trade', who, about)) { const t = treaty(R, 'trade', who, about); const b = Math.min(20, 2 * Math.floor((R.day - t.since) / 30) + 5); v += b; reasons.push([b, 'Trade between us']); }
  if (treaty(R, 'nap', who, about)) { v += 5; reasons.push([5, 'A pact of peace']); }
  // situation
  if (sharesBorder(R, who, about)) { v -= 5; reasons.push([-5, 'A shared border']); }
  if (atWar(R, who, about)) { v -= 50; reasons.push([-50, 'At war with us']); }
  const common = R.kingdoms.find((K) => K.alive && K.id !== who && K.id !== about && atWar(R, who, K.id) && atWar(R, about, K.id));
  if (common) { v += 15; reasons.push([15, 'A common enemy: ' + common.short]); }
  const sw = strength(R, who), sa = strength(R, about);
  if (sa > sw * 1.4) {
    if (R.kingdoms[who].personality === 'conqueror' || R.kingdoms[who].personality === 'zealot') { v -= 10; reasons.push([-10, 'They resent your strength']); }
    else if (R.kingdoms[who].personality === 'ambusher' || R.kingdoms[who].personality === 'merchant' || R.kingdoms[who].personality === 'opportunist') { v += 10; reasons.push([10, 'They respect your strength']); }
  }
  v = Math.max(-100, Math.min(100, Math.round(v)));
  if (!withReasons) return v;
  reasons.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
  return { v, reasons };
}
function memText(e) {
  const T = { trespass: 'Your armies marched through their land', brokeTruce: 'You broke a truce', brokeTreaty: 'You broke a treaty', warNoClaim: 'You declared war on them', warClaim: 'You declared war (with a claim)', pillaged: 'You pillaged their villages', spared: 'You spared their villages', tookProvince: 'You took their land', honouredCall: 'You answered their call', refusedCall: 'You refused their call', gift: 'Your gifts and tribute', freedCaptive: 'You freed their captain', slewRuler: 'You slew their ruler', foughtBeside: 'You fought beside them', harshPeace: 'You dictated a harsh peace', turnedAway: 'You turned their envoy away' };
  return (T[e.kind] || e.text) + (e.floor && Math.abs(e.v - e.floor) < 1 ? ' (never forgotten)' : '');
}
export const moodWord = (v) => (v <= -60 ? 'Hateful' : v <= -30 ? 'Hostile' : v < -10 ? 'Cold' : v < 10 ? 'Neutral' : v < 30 ? 'Cordial' : v < 60 ? 'Friendly' : 'Devoted');

// ---------------------------------------------------------------- war score and exhaustion
export function war(R, a, b) { return R.wars.find((w) => (w.a === a && w.b === b) || (w.a === b && w.b === a)); }
export function addWarScore(R, winner, loser, pts) {
  const w = war(R, winner, loser); if (!w) return;
  w.score = Math.max(-100, Math.min(100, w.score + (w.a === winner ? pts : -pts)));
}
// the score of the war between a and b from a's side
export function scoreFor(R, a, b) { const w = war(R, a, b); return w ? (w.a === a ? w.score : -w.score) : 0; }

// ---------------------------------------------------------------- starting and ending wars
export function declareWar(R, a, b, why = 'declared') {
  if (a === b || !R.kingdoms[a].alive || !R.kingdoms[b].alive) return { error: 'No' };
  const r = rel(R, a, b);
  if (r.state === 'war') return { error: 'Already at war' };
  const betrayal = r.state === 'truce' || treaty(R, 'nap', a, b) || treaty(R, 'alliance', a, b) || treaty(R, 'defAlliance', a, b) || treaty(R, 'trade', a, b) && false;
  if (r.state === 'truce') { remember(R, b, a, 'brokeTruce'); R.kingdoms[a].trust = Math.max(0, R.kingdoms[a].trust - 30); }
  else if (betrayal) { remember(R, b, a, 'brokeTreaty'); R.kingdoms[a].trust = Math.max(0, R.kingdoms[a].trust - 30); }
  else remember(R, b, a, R.claims && R.claims.some((c) => c.by === a && R.provinces[c.prov].owner === b) ? 'warClaim' : 'warNoClaim');
  // treaties between them end
  R.treaties = R.treaties.filter((t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a)) || t.type === 'vassal' && false);
  r.state = 'war'; r.since = R.day; r.until = 0; r.aggressor = a;
  R.wars.push({ a, b, start: R.day, score: 0 });
  log(R, `${R.kingdoms[a].short} ${betrayal ? 'BETRAYS' : 'declares war on'} ${R.kingdoms[b].short}!`, betrayal ? 'betrayal' : 'war', [a, b]);
  R.events.push({ type: 'war', a, b, betrayal: !!betrayal, why });
  // calls to arms: b's allies are asked to join; a's allies too if it is a full alliance
  for (const al of allies(R, b)) if (al !== a) callToArms(R, al, b, a);
  for (const t of R.treaties) if (t.type === 'alliance' && (t.a === a || t.b === a)) { const al = t.a === a ? t.b : t.a; if (al !== b) callToArms(R, al, a, b); }
  // a vassal fights its liege's wars
  for (const t of R.treaties) if (t.type === 'vassal' && (t.a === a || t.a === b)) { const v = t.b, enemy = t.a === a ? b : a; if (v !== enemy && !atWar(R, v, enemy)) setWar(R, v, enemy); }
  return { ok: true, betrayal: !!betrayal };
}
function setWar(R, a, b) { const r = rel(R, a, b); if (r.state === 'war') return; r.state = 'war'; r.since = R.day; r.aggressor = a; R.treaties = R.treaties.filter((t) => !((t.a === a && t.b === b) || (t.a === b && t.b === a))); R.wars.push({ a, b, start: R.day, score: 0 }); }
// an ally is called; the AI answers by honour and fear (the player gets a letter)
export function callToArms(R, ally, friend, enemy) {
  const K = R.kingdoms[ally]; if (!K.alive || atWar(R, ally, enemy)) return;
  if (K.player) { sendLetter(R, { from: friend, to: ally, kind: 'call', enemy, text: `${R.kingdoms[friend].leader} calls on you to march against ${R.kingdoms[enemy].short}.` }); return; }
  const P = personality(R, ally);
  if (treaty(R, 'nap', ally, enemy) && P.honour > 0.8) { remember(R, friend, ally, 'refusedCall'); return; }
  const answer = P.honour * 0.8 + (opinion(R, ally, friend) - opinion(R, ally, enemy)) / 200 - (strength(R, enemy) > strength(R, ally) * 2 ? P.fear * 0.5 : 0);
  if (answer > 0.45) { setWar(R, ally, enemy); remember(R, friend, ally, 'honouredCall'); log(R, `${K.short} answers the call and marches against ${R.kingdoms[enemy].short}.`, 'war', [ally, enemy]); }
  else { remember(R, friend, ally, 'refusedCall'); log(R, `${K.short} refuses ${R.kingdoms[friend].short}'s call to arms.`, 'info', [ally, friend]); }
}
export function makeTruce(R, a, b, days = 60) {
  const r = rel(R, a, b);
  r.state = 'truce'; r.since = R.day; r.until = R.day + days;
  R.wars = R.wars.filter((w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
  log(R, `${R.kingdoms[a].short} and ${R.kingdoms[b].short} agree a truce.`, 'truce', [a, b]);
  R.events.push({ type: 'truce', a, b });
}
export function makePeace(R, a, b, terms = {}) {
  const r = rel(R, a, b);
  // a peace treaty comes with a mandatory four-season truce
  r.state = 'truce'; r.since = R.day; r.until = R.day + 120; r.peace = true;
  R.wars = R.wars.filter((w) => !((w.a === a && w.b === b) || (w.a === b && w.b === a)));
  if (terms.cede) for (const pid of terms.cede) { const P = R.provinces[pid]; if (P && P.owner === terms.loser) transferProvince(R, P, terms.winner, 'ceded'); }
  if (terms.gold) { const g = Math.min(terms.gold, Math.max(0, R.kingdoms[terms.loser].gold)); R.kingdoms[terms.loser].gold -= g; R.kingdoms[terms.winner].gold += g; }
  if (terms.tribute) R.tributes.push({ from: terms.loser, to: terms.winner, perSeason: terms.tribute, until: R.day + 120 });
  if (terms.vassal) R.treaties.push({ type: 'vassal', a: terms.winner, b: terms.loser, since: R.day });
  if (terms.harsh) remember(R, terms.loser, terms.winner, 'harshPeace');
  log(R, `Peace between ${R.kingdoms[a].short} and ${R.kingdoms[b].short}${terms.vassal ? ': ' + R.kingdoms[terms.loser].short + ' bends the knee' : terms.cede && terms.cede.length ? ': land changes hands' : ''}.`, 'peace', [a, b]);
  R.events.push({ type: 'peace', a, b });
}
// a province changes hands (conquest, surrender, peace terms)
export function transferProvince(R, P, to, why) {
  const old = P.owner;
  if (old === to) return;
  P.owner = P.controller = to;
  // rebels are locals: a province they free is loyal to them; retaking land from rebels costs little
  if (to >= 0 && R.kingdoms[to].rebel) P.loyalty = 60;
  else P.loyalty = Math.max(12, P.loyalty + (why === 'ceded' ? -10 : old >= 0 && R.kingdoms[old] && R.kingdoms[old].rebel ? -5 : -20) - (P.startOwner !== to && P.startOwner >= 0 ? 5 : 0));
  for (const v of P.villages) if (v.state === 'taxed') v.owner = to;
  P.siegedBy = -1; P.siegeDays = 0;
  if (old >= 0 && to >= 0 && R.kingdoms[old]) remember(R, old, to, 'tookProvince', 1, 'took ' + P.name);
  if (old >= 0 && P.seat === 'capital' && R.kingdoms[old] && R.kingdoms[old].capital === P.id) R.kingdoms[old].capital = -1;
  if (to >= 0) R.kingdoms[to].peakProvinces = Math.max(R.kingdoms[to].peakProvinces, R.provinces.filter((q) => q.owner === to).length);
  R.events.push({ type: 'province', id: P.id, from: old, to, why });
}

// ---------------------------------------------------------------- proposals (DESIGN.md 20.4, 20.5)
// deal = { type, gold, perSeason, seasons, provinces, target, days }
// returns { U, accept, word, reasons: [text], value }
export function judge(R, from, to, deal) {
  const P = personality(R, to), K = R.kingdoms[to], F = R.kingdoms[from];
  const op = opinion(R, to, from);
  const reasons = [];
  let value = 0, bias = 0, strat = 0, trustT = 0;
  const sTo = Math.max(1, strength(R, to)), sFrom = Math.max(1, strength(R, from));
  const ws = scoreFor(R, to, from);
  const ex = K.exhaustion || 0;
  const reliesOnWord = ['truce', 'peace', 'nap', 'alliance', 'defAlliance', 'trade', 'tribute'].includes(deal.type);
  if (reliesOnWord) { trustT = 0.2 * (F.trust - 50); if (Math.abs(trustT) >= 4) reasons.push([trustT, trustT > 0 ? 'They trust your word' : 'They do not trust your word']); }
  if (F.trust < 15 && reliesOnWord) { reasons.push([-100, 'Your word is worthless to them']); bias -= 100; }
  const gold = (deal.gold || 0) + (deal.perSeason || 0) * (deal.seasons || 0) * 0.8;
  switch (deal.type) {
    case 'truce':
      if (!atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['You are not at war'] };
      bias = (P.truce || 0.4) * 30 - 10;
      strat = 0.5 * ex + (ws < 0 ? -ws * 0.6 : -ws * 0.3) + (sFrom > sTo * 1.3 ? 12 : sTo > sFrom * 1.5 ? -15 : 0);
      if (R.season === 'Autumn') { strat += 10; reasons.push([10, 'Winter is coming']); }
      if (ex > 20) reasons.push([Math.round(0.5 * ex), 'They are weary of war']);
      if (ws < -10) reasons.push([Math.round(-ws * 0.6), 'The war goes badly for them']);
      if (ws > 15) reasons.push([Math.round(-ws * 0.3), 'They are winning']);
      break;
    case 'peace': {
      if (!atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['You are not at war'] };
      // terms cost war score: a white peace is free, every concession must be paid for in victories
      let cost = 0;
      if (deal.demandGold) cost += deal.demandGold / 2000;
      if (deal.demandProvinces) cost += deal.demandProvinces.reduce((a, pid) => a + 10 + R.provinces[pid].dev * 4, 0);
      if (deal.demandVassal) cost += 80;
      bias = (P.truce || 0.4) * 25 - 12 + (K.personality === 'zealot' && ex < 80 ? -40 : 0);
      strat = 0.5 * ex - ws * 0.5 - (cost > 0 ? Math.max(0, cost - Math.max(0, -ws)) * 1.2 : 0) + (sFrom > sTo * 1.5 ? 10 : 0);
      if (cost > 0) reasons.push([-Math.round(cost), 'The terms are hard']);
      if (ex > 20) reasons.push([Math.round(0.5 * ex), 'They are weary of war']);
      if (ws < -10) reasons.push([Math.round(-ws * 0.5), 'They are losing']);
      break;
    }
    case 'nap': if (atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['Make peace first'] }; bias = 4 + (op > 0 ? 6 : 0); strat = P.fear * 10; break;
    case 'trade': if (atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['Make peace first'] }; bias = (P.greed || 1) * 12; if (!sharesBorder(R, from, to)) { strat -= 5; } reasons.push([Math.round((P.greed || 1) * 12), 'Trade fills their coffers']); break;
    case 'access': {
      if (atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['Make peace first'] };
      bias = 8;
      const enemy = R.kingdoms.find((x) => x.alive && x.id !== from && x.id !== to && atWar(R, from, x.id) && (atWar(R, to, x.id) || opinion(R, to, x.id) < -10));
      if (enemy) { strat += 15; reasons.push([15, 'You march against ' + enemy.short]); }
      break;
    }
    case 'defAlliance': case 'alliance': {
      if (atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['Make peace first'] };
      if (K.personality === 'raider') return { U: -99, accept: false, word: 'Refuse', reasons: ['Raiders make no alliances'] };
      const need = deal.type === 'alliance' ? 50 : 30, needT = deal.type === 'alliance' ? 40 : 30;
      if (F.trust < needT) { bias -= 40; reasons.push([-40, 'Your trust is too low']); }
      bias += (op - need) * 0.6;
      // an alliance is worth the strength it adds against their worst threat
      const threat = R.kingdoms.filter((x) => x.alive && x.id !== to && x.id !== from).sort((p, q) => (atWar(R, to, q.id) ? 2 : 1) * strength(R, q.id) - (atWar(R, to, p.id) ? 2 : 1) * strength(R, p.id))[0];
      if (threat && (atWar(R, to, threat.id) || strength(R, threat.id) > sTo)) { strat += 20; reasons.push([20, 'They fear ' + threat.short]); }
      const strongest = R.kingdoms.filter((x) => x.alive).sort((p, q) => strength(R, q.id) - strength(R, p.id))[0];
      if (strongest && strongest.id === from) { strat -= 20; reasons.push([-20, 'You are already the strongest']); }
      break;
    }
    case 'tribute': {
      // the player asks THEM to pay (gold now or per season)
      if (sFrom < sTo * 1.5 && !atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['You need half again their strength'] };
      value = -gold;
      bias = (sFrom / sTo - 1.5) * 25 + P.fear * 20 - (K.personality === 'conqueror' ? 25 : 0);
      reasons.push([Math.round((sFrom / sTo - 1.5) * 25), sFrom > sTo * 2 ? 'They fear your armies' : 'You are not so much stronger']);
      break;
    }
    case 'gift': value = gold; bias = 0; break;
    case 'payAttack': {
      const T = deal.target;
      if (atWar(R, from, to)) return { U: -99, accept: false, word: 'Refuse', reasons: ['They are at war with you'] };
      value = gold;
      bias = -5 + (opinion(R, to, T) < -10 ? 15 : -5) + (atWar(R, to, T) ? 15 : 0);
      if (strength(R, T) > sTo * 1.5) { strat -= 25; reasons.push([-25, R.kingdoms[T].short + ' is too strong for them']); }
      if (treaty(R, 'nap', to, T) || treaty(R, 'alliance', to, T) || treaty(R, 'defAlliance', to, T)) { strat -= 40 * P.honour; reasons.push([-Math.round(40 * P.honour), 'They have a treaty with ' + R.kingdoms[T].short]); }
      break;
    }
    case 'vassal': {
      if (sTo > sFrom * 0.4 && ws < 80) return { U: -99, accept: false, word: 'Refuse', reasons: ['They are not that weak'] };
      bias = -15 + P.fear * 30;
      break;
    }
    default: return { U: -99, accept: false, word: 'Refuse', reasons: ['They do not understand'] };
  }
  if (value) reasons.push([Math.round(value / 1000), value > 0 ? 'Your gold' : 'It costs them gold']);
  if (op <= -20 || op >= 20) reasons.push([Math.round(0.3 * op), op > 0 ? 'They think well of you' : 'They think ill of you']);
  const U = value / 1000 + 0.3 * op + trustT + bias + strat;
  reasons.sort((a, b) => Math.abs(b[0]) - Math.abs(a[0]));
  return { U, accept: U > R_WAR.acceptU, word: uWord(U + jitter(R, from, to)), reasons: reasons.slice(0, 3).map(([v, t]) => `${t} ${v > 0 ? '+' : ''}${v}`) };
}
const uWord = (u) => (u < -5 ? 'Refuse' : u < 5 ? 'Unlikely' : u < 15 ? 'Maybe' : u < 30 ? 'Likely' : 'Eager');
// the hidden +-5 on the mood meter: fixed for a pair within a season, so the meter does not flicker
function jitter(R, a, b) { const s = ((a * 73856093) ^ (b * 19349663) ^ (Math.floor(R.day / 30) * 83492791)) >>> 0; return ((s % 1000) / 1000 - 0.5) * 10; }

// carry a deal out (both sides have agreed)
export function enact(R, from, to, deal) {
  const F = R.kingdoms[from], K = R.kingdoms[to];
  switch (deal.type) {
    case 'truce': makeTruce(R, from, to, (deal.seasons || 2) * 30); break;
    case 'peace': makePeace(R, from, to, { winner: from, loser: to, gold: deal.demandGold || 0, cede: deal.demandProvinces || [], vassal: !!deal.demandVassal, harsh: !!(deal.demandProvinces && deal.demandProvinces.length) || !!deal.demandVassal }); break;
    case 'nap': case 'trade': case 'access': case 'defAlliance': case 'alliance':
      R.treaties = R.treaties.filter((t) => !(t.type === deal.type && ((t.a === from && t.b === to) || (t.a === to && t.b === from))));
      R.treaties.push({ type: deal.type, a: from, b: to, since: R.day, until: deal.type === 'nap' ? R.day + 480 : deal.type === 'access' ? R.day + 240 : deal.type === 'defAlliance' ? R.day + 600 : 0 });
      log(R, `${F.short} and ${K.short} sign ${{ nap: 'a pact of peace', trade: 'a trade agreement', access: 'military access', defAlliance: 'a defensive alliance', alliance: 'a full alliance' }[deal.type]}.`, 'treaty', [from, to]);
      break;
    case 'tribute':
      if (deal.gold) { const g = Math.min(deal.gold, Math.max(0, K.gold)); K.gold -= g; F.gold += g; remember(R, to, from, 'harshPeace', 0.5, 'took tribute'); }
      if (deal.perSeason) R.tributes.push({ from: to, to: from, perSeason: deal.perSeason, until: R.day + (deal.seasons || 2) * 30 });
      log(R, `${K.short} pays tribute to ${F.short}.`, 'treaty', [from, to]);
      break;
    case 'gift': { const g = Math.min(deal.gold || 0, Math.max(0, F.gold)); F.gold -= g; K.gold += g; remember(R, to, from, 'gift', g / 1000); log(R, `${F.short} sends ${K.short} a gift of ${g.toLocaleString()} g.`, 'info', [from, to]); break; }
    case 'payAttack': {
      const g = Math.min(deal.gold || 0, Math.max(0, F.gold)); F.gold -= g; K.gold += g;
      if (!atWar(R, to, deal.target)) declareWar(R, to, deal.target, 'paid');
      R.paid = R.paid || []; R.paid.push({ by: from, who: to, target: deal.target, until: R.day + 30 });
      log(R, `${K.short} takes ${F.short}'s gold and marches on ${R.kingdoms[deal.target].short}.`, 'war', [to, deal.target]);
      break;
    }
    case 'vassal': makePeace(R, from, to, { winner: from, loser: to, vassal: true }); break;
  }
  R.events.push({ type: 'deal', from, to, deal: deal.type });
}
// a proposal from one kingdom to another: the AI answers at once (the player's answers come
// through letters, see sendLetter)
export function propose(R, from, to, deal) {
  if (!R.kingdoms[to] || !R.kingdoms[to].alive) return { error: 'That kingdom has fallen' };
  if (deal.type === 'gift' || deal.type === 'payAttack') { if ((deal.gold || 0) > R.kingdoms[from].gold) return { error: 'Not enough gold' }; }
  if (R.kingdoms[to].player && !R.kingdoms[to].regent) { sendLetter(R, { from, to, kind: 'deal', deal, text: dealText(R, from, to, deal) }); return { sent: true }; }
  const J = judge(R, from, to, deal);
  if (J.accept) { enact(R, from, to, deal); return { ok: true, ...J }; }
  if (deal.type === 'tribute') remember(R, to, from, 'turnedAway', 2, 'demanded tribute');
  return { refused: true, ...J };
}
export function dealText(R, from, to, d) {
  const F = R.kingdoms[from];
  switch (d.type) {
    case 'truce': return `${F.leader} offers a truce of ${d.seasons || 2} seasons.`;
    case 'peace': return `${F.leader} offers peace${d.demandGold ? ' if you pay ' + d.demandGold.toLocaleString() + ' g' : ''}${d.demandProvinces && d.demandProvinces.length ? ' and cede ' + d.demandProvinces.map((p) => R.provinces[p].name).join(', ') : ''}.`;
    case 'nap': return `${F.leader} proposes a pact of peace for four years.`;
    case 'trade': return `${F.leader} proposes trade between your realms (+10% income for both).`;
    case 'defAlliance': return `${F.leader} proposes a defensive alliance.`;
    case 'alliance': return `${F.leader} proposes a full alliance: your wars are theirs.`;
    case 'tribute': return `${F.leader} demands ${d.gold ? d.gold.toLocaleString() + ' g' : (d.perSeason || 0).toLocaleString() + ' g a season'} in tribute, or war.`;
    case 'gift': return `${F.leader} sends you a gift of ${(d.gold || 0).toLocaleString()} g.`;
    default: return `${F.leader} sends an envoy.`;
  }
}
export function sendLetter(R, L) {
  L.id = 'L' + (R.seq.letter++); L.day = R.day; L.until = R.day + 15;
  R.letters.push(L);
  R.events.push({ type: 'letter', id: L.id, from: L.from });
}
// the player answers a letter
export function answerLetter(R, id, yes) {
  const L = R.letters.find((l) => l.id === id); if (!L) return null;
  R.letters = R.letters.filter((l) => l !== L);
  if (L.kind === 'call') { if (yes) { if (!atWar(R, L.to, L.enemy)) declareWar(R, L.to, L.enemy, 'call'); remember(R, L.from, L.to, 'honouredCall'); } else remember(R, L.from, L.to, 'refusedCall'); return { ok: true }; }
  if (L.kind === 'warning') return { ok: true };
  if (L.kind === 'deal') {
    if (yes) {
      if (L.deal.type === 'tribute') { const g = L.deal.gold || 0; if (R.kingdoms[L.to].gold < g) return { error: 'Not enough gold' }; R.kingdoms[L.to].gold -= g; R.kingdoms[L.from].gold += g; remember(R, L.from, L.to, 'gift', g / 1000); log(R, `${R.kingdoms[L.to].short} pays ${R.kingdoms[L.from].short} ${g.toLocaleString()} g to keep the peace.`, 'treaty', [L.from, L.to]); }
      else if (L.deal.type === 'gift') { /* already paid on sending */ }
      else enact(R, L.from, L.to, L.deal);
    } else {
      remember(R, L.from, L.to, 'turnedAway');
      if (L.deal.type === 'tribute' && !atWar(R, L.from, L.to)) declareWar(R, L.from, L.to, 'refused tribute');
    }
    return { ok: true };
  }
  return { ok: true };
}

export function log(R, text, kind = 'info', who = []) {
  R.log.push({ day: R.day, text, kind, who });
  if (R.log.length > 200) R.log.splice(0, R.log.length - 200);
  R.events.push({ type: 'log', text, kind, who });
}
export { R_ECON };
