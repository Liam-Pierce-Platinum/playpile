// BANNERFALL :: sim/diplomacy.js - diplomacy-lite inside one war on a huge map (DESIGN.md 9.4,
// LIAM_BRIEF items 5-6: "politics so the player can make truces", usable MID-WAR).
// The Long War has the full system (sim/realm/diplomacy.js); this is the battle-sized version:
//   TRUCE        pay a price (by their strength against yours); they accept by personality, by how
//                badly the war goes for them and by what they think of you. 6 minutes of peace.
//   TRIBUTE      when you are 1.5x their strength they may pay you 4,000-15,000 g (or refuse).
//   PAY TO ATTACK  5,000 g: a kingdom you are not fighting turns on a rival you name for 4 min.
//   BETRAYAL     a kingdom under truce rolls its betrayal chance every 30 s when it is strong and
//                you are busy elsewhere; 10 s of warning ("banners gather"), then it breaks.
//   BREAKING     if YOU break a truce, every kingdom's truce price doubles for 10 minutes.
//   MEMORY       pillaged villages, taken castles, kept and broken truces move each kingdom's mood.
// AI kingdoms also make (and break) truces with each other, and a kingdom that is losing badly
// sends you an envoy to ask for one. Relations live in world.hostM (sim/factions.js), so every
// system that asks hostile() sees a truce at once.
import { PERSONALITY, NEUTRAL } from '../data/factions.js';
import { setRelation, hostile } from './factions.js';
import { capitulate } from './war.js';

export const TRUCE_TIME = 360, BETRAY_WARN = 10, PAY_ATTACK = 5000, PAY_TIME = 240;
const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

export function setupDiplomacy(world) {
  const W = world.war;
  const dip = {
    rel: {}, tribute: [], pay: [], priceUntil: 0, memory: {}, warn: [], offers: [], log: [], nextAI: 60, nextBetray: 30,
    onPillage(world, team, old, s) { if (old >= 0 && old < NEUTRAL && old !== team) remember(world, old, team, -8, `pillaged ${s.name}`); },
    onCapture(world, team, old, s) { if (old >= 0 && old < NEUTRAL && old !== team) remember(world, old, team, s.kind === 'capital' ? -40 : s.kind === 'castle' ? -20 : -10, `took ${s.name}`); },
  };
  for (const a of W.slots) for (const b of W.slots) if (a < b) dip.rel[key(a, b)] = { state: 'war', since: 0, until: 0 };
  for (const a of W.slots) dip.memory[a] = {};
  world.dip = dip;
}

export function relation(world, a, b) { return world.dip ? world.dip.rel[key(a, b)] : null; }
export function atTruce(world, a, b) { const r = relation(world, a, b); return !!(r && r.state === 'truce'); }

function remember(world, who, about, v, text) {
  const D = world.dip; if (!D) return;
  const m = (D.memory[who] = D.memory[who] || {});
  const list = (m[about] = m[about] || []);
  list.push({ t: world.t, v, text });
  if (list.length > 12) list.shift();
}
// what kingdom `who` thinks of `about`: the sum of what it remembers, fading by half every 10 minutes
export function opinion(world, who, about) {
  const D = world.dip; if (!D || !D.memory[who] || !D.memory[who][about]) return 0;
  let o = 0;
  for (const e of D.memory[who][about]) o += e.v * Math.pow(0.5, (world.t - e.t) / 600);
  return Math.round(o);
}
export function mood(world, who, about) {
  const o = opinion(world, who, about);
  return o <= -30 ? 'Hostile' : o < -5 ? 'Wary' : o >= 15 ? 'Friendly' : 'Neutral';
}

// army strength: men in the field and on the walls
export function strength(world, team) {
  let n = 0;
  for (const q of world.squads.values()) if (q.team === team && q.alive > 0 && q.deployed && q.state !== 'gone') n += q.alive * (q.def.engine ? 4 : q.def.tags.includes('cavalry') ? 1.6 : 1);
  return n;
}
function losses(world, team) {
  // how badly the war goes for them: seats lost since the start, and men down
  const W = world.war;
  const start = W.settlements.filter((s) => s.founder === team && s.kind !== 'village').length || 1;
  const now = W.settlements.filter((s) => s.owner === team && s.kind !== 'village').length;
  return Math.max(0, 1 - now / start);
}

// ------------------------------------------------------------------ truces
export function truceTerms(world, from, to) {
  const W = world.war, F = W.factions[to];
  const P = PERSONALITY[F.personality] || PERSONALITY.merchant;
  const sTo = strength(world, to), sFrom = Math.max(1, strength(world, from));
  let price = Math.round(Math.max(2000, Math.min(15000, 3000 * (sTo / sFrom))) / 100) * 100;
  if (from === 0 && world.dip.priceUntil > world.t) price *= 2;
  const otherWars = W.slots.filter((s) => s !== to && s !== from && W.factions[s].alive && hostile(world, to, s)).length;
  const lost = losses(world, to);
  const op = opinion(world, to, from);
  let chance = P.truce * (1 + 0.5 * Math.min(1, otherWars)) * (1 + 1.5 * lost) * (sTo < sFrom ? 1.3 : sTo > sFrom * 2 ? 0.6 : 1) * (1 + op / 100);
  chance = Math.max(0.02, Math.min(0.95, chance));
  const reasons = [];
  if (lost > 0.2) reasons.push(`They have lost ${Math.round(lost * 100)}% of their castles`);
  if (otherWars) reasons.push('They fight on another front too');
  if (sTo > sFrom * 1.5) reasons.push('They think they are winning');
  if (op <= -20) reasons.push('They remember what you did');
  if (op >= 10) reasons.push('They think well of you');
  if (P.truce >= 0.6) reasons.push('Their lords like a bargain'); else if (P.truce <= 0.2) reasons.push('Their king rarely makes peace');
  if (from === 0 && world.dip.priceUntil > world.t) reasons.push('You broke a truce: the price is doubled');
  return { price, chance, reasons, word: chance > 0.7 ? 'Eager' : chance > 0.45 ? 'Likely' : chance > 0.25 ? 'Maybe' : chance > 0.1 ? 'Unlikely' : 'Refuse' };
}

export function setTruce(world, a, b, dur = TRUCE_TIME, why = 'truce') {
  const R = relation(world, a, b); if (!R) return;
  R.state = 'truce'; R.since = world.t; R.until = world.t + dur; R.why = why;
  setRelation(world, a, b, false);
  // men already locked in a fight let go
  for (const sq of world.squads.values()) {
    if ((sq.team === a && sq.target && sq.target.team === b) || (sq.team === b && sq.target && sq.target.team === a)) sq.target = null;
    if (sq.order && sq.order.type === 'attack') { const t = world.squads.get(sq.order.targetId); if (t && ((sq.team === a && t.team === b) || (sq.team === b && t.team === a))) sq.order = null; }
  }
  for (const p of world.projectiles) if (p.alive && p.team !== undefined && ((p.team === a && p.tteam === b) || (p.team === b && p.tteam === a))) p.alive = false;
  world.dip.warn = world.dip.warn.filter((w) => !(key(w.a, w.b) === key(a, b)));
  const W = world.war;
  world.events.push({ type: 'truce', a, b, until: R.until });
  const txt = `${W.factions[a].short} and ${W.factions[b].short} agree a truce`;
  world.events.push({ type: 'alert', team: a === 0 || b === 0 ? 0 : -1, text: txt + (a === 0 || b === 0 ? ' for ' + Math.round(dur / 60) + ' minutes.' : '.'), pos: null, tone: 'info', t: world.t });
  world.dip.log.push({ t: world.t, text: txt });
}

export function endTruce(world, a, b, why) {
  const R = relation(world, a, b); if (!R || R.state === 'war') return;
  R.state = 'war'; R.since = world.t; R.until = 0;
  setRelation(world, a, b, true);
  const W = world.war;
  const txt = why === 'betrayal' ? `${W.factions[a].leader} has broken the truce!` : why === 'declared' ? `${W.factions[a].short} declares war on ${W.factions[b].short}!` : `The truce between ${W.factions[a].short} and ${W.factions[b].short} is over.`;
  world.events.push({ type: 'truceEnd', a, b, why });
  world.events.push({ type: 'alert', team: a === 0 || b === 0 ? 0 : -1, text: txt, pos: null, tone: why === 'betrayal' && b === 0 ? 'bad' : 'info', t: world.t });
  world.dip.log.push({ t: world.t, text: txt });
}

// the player (or any kingdom) offers a truce for gold
export function offerTruce(world, from, to) {
  const W = world.war;
  if (!W.factions[to] || !W.factions[to].alive) return { error: 'That kingdom has fallen' };
  if (!hostile(world, from, to)) return { error: 'You are not at war with them' };
  const T = truceTerms(world, from, to);
  if (world.teams[from].gold < T.price) return { error: `Not enough gold: they want ${T.price.toLocaleString()} g` };
  world.dip.lastOffer = world.dip.lastOffer || {};
  if (world.t - (world.dip.lastOffer[to] ?? -999) < 30) return { error: 'Their envoy has only just left: wait a little' };
  world.dip.lastOffer[to] = world.t;
  if (world.rng() < T.chance) {
    world.teams[from].gold -= T.price; world.teams[to].gold += T.price;
    setTruce(world, from, to, TRUCE_TIME, 'bought');
    remember(world, to, from, Math.round(T.price / 1000), 'paid for a truce');
    return { ok: true, text: `${W.factions[to].leader} accepts ${T.price.toLocaleString()} g and a truce.` };
  }
  remember(world, to, from, -3, 'pestered us for peace');
  return { refused: true, text: `${W.factions[to].leader} refuses the truce.` };
}

// how close a kingdom is to giving up against `by`: true when its army is under 0.3 of theirs and
// it has lost half its seats, or under 0.15 of theirs whatever it holds (DESIGN.md 20.4)
export function broken(world, team, by) {
  const s = strength(world, team), b = strength(world, by);
  const lost = losses(world, team);
  return (s < b * 0.3 && lost >= 0.5) || s < b * 0.15 || (lost >= 0.75 && s < b * 0.6) || (exhaustion(world, team) >= 100 && s < b);
}
// WAR EXHAUSTION (DESIGN.md 20.2, battle-sized): men lost against the most men it ever fielded,
// seats lost, and plain weariness once a war runs past 25 minutes. A kingdom at 100 that is not
// the strongest gives up: it surrenders to whoever has hurt it most.
export function exhaustion(world, team) {
  const T = world.teams[team], W = world.war;
  const peak = Math.max(150, T.peakMen || 0);
  const start = W.settlements.filter((s) => s.founder === team && s.kind !== 'village').length;
  const now = W.settlements.filter((s) => s.owner === team && s.kind !== 'village' && s.state !== 'razed').length;
  const seats = Math.max(0, start - now);
  const weary = Math.max(0, (world.t - 1500) / 60) * 2.5;
  return Math.round((T.lost || 0) / (peak * 3) * 100 + seats * 14 + weary);
}
// the player demands that a beaten kingdom lay down its arms
export function demandSurrender(world, from, to) {
  const W = world.war;
  if (!W.factions[to] || !W.factions[to].alive) return { error: 'That kingdom has already fallen' };
  if (!hostile(world, from, to)) return { error: 'You are not at war with them' };
  world.dip.lastSurrender = world.dip.lastSurrender || {};
  if (world.t - (world.dip.lastSurrender[to] ?? -999) < 60) return { error: 'They answered a minute ago' };
  world.dip.lastSurrender[to] = world.t;
  if (!broken(world, to, from)) { remember(world, to, from, -5, 'demanded our surrender'); return { refused: true, text: W.factions[to].leader + ' laughs: "Come and take it."' }; }
  capitulate(world, to, from);
  return { ok: true, text: W.factions[to].leader + ' lays down the crown. ' + W.factions[to].short + ' surrenders.' };
}
export function surrenderTerms(world, from, to) {
  const s = strength(world, to), b = Math.max(1, strength(world, from));
  return { ratio: s / b, lost: losses(world, to), likely: broken(world, to, from) };
}

// tribute: only when you are 1.5x their strength
export function demandTribute(world, from, to) {
  const W = world.war;
  const sTo = strength(world, to), sFrom = strength(world, from);
  if (sFrom < sTo * 1.5) return { error: 'You need half again their strength to demand tribute' };
  world.dip.lastDemand = world.dip.lastDemand || {};
  if (world.t - (world.dip.lastDemand[to] ?? -999) < 120) return { error: 'They answered you two minutes ago' };
  world.dip.lastDemand[to] = world.t;
  const P = PERSONALITY[W.factions[to].personality] || PERSONALITY.merchant;
  const fear = sFrom / Math.max(1, sTo);
  const chance = Math.min(0.9, 0.2 + (fear - 1.5) * 0.25 + P.truce * 0.3 + losses(world, to) * 0.4);
  if (world.rng() < chance) {
    const amt = Math.round(Math.max(4000, Math.min(15000, world.teams[to].gold * 0.4)) / 100) * 100;
    world.teams[to].gold -= amt; world.teams[from].gold += amt; world.teams[from].earned += amt;
    remember(world, to, from, -6, 'took tribute from us');
    world.events.push({ type: 'loot', x: 0, z: 0, gold: amt, team: from, kind: 'tribute' });
    return { ok: true, text: `${W.factions[to].short} pays ${amt.toLocaleString()} g in tribute.` };
  }
  remember(world, to, from, -12, 'demanded tribute');
  return { refused: true, text: `${W.factions[to].leader} spits on your demand. Their mood is hostile.` };
}

// pay a kingdom you are not fighting to turn on a rival
export function payToAttack(world, payer, attacker, target) {
  const W = world.war;
  if (hostile(world, payer, attacker)) return { error: 'They are at war with you: make a truce first' };
  if (!hostile(world, attacker, target)) return { error: `${W.factions[attacker].short} is at peace with ${W.factions[target].short}` };
  if (world.teams[payer].gold < PAY_ATTACK) return { error: 'It costs ' + PAY_ATTACK.toLocaleString() + ' g' };
  world.teams[payer].gold -= PAY_ATTACK; world.teams[attacker].gold += PAY_ATTACK;
  world.dip.pay = world.dip.pay.filter((p) => p.attacker !== attacker);
  world.dip.pay.push({ payer, attacker, target, until: world.t + PAY_TIME });
  remember(world, attacker, payer, 5, 'paid us well');
  return { ok: true, text: `${W.factions[attacker].short} takes your gold and marches on ${W.factions[target].short}.` };
}
// warai asks: is somebody paying us to go for this kingdom?
export function paidTarget(world, slot) {
  const D = world.dip; if (!D) return -1;
  const p = D.pay.find((q) => q.attacker === slot && q.until > world.t);
  return p ? p.target : -1;
}

// the player breaks a truce: war again, and every kingdom's truce price doubles for 10 minutes
export function declareWar(world, from, to) {
  if (hostile(world, from, to)) return { error: 'Already at war' };
  const truce = atTruce(world, from, to);
  endTruce(world, from, to, 'declared');
  if (truce) {
    if (from === 0) world.dip.priceUntil = world.t + 600;
    for (const s of world.war.slots) if (s !== from) remember(world, s, from, s === to ? -40 : -15, 'broke a truce');
  }
  return { ok: true };
}

// an AI kingdom's envoy offers the player a truce (it pays): accept or decline
export function answerOffer(world, id, yes) {
  const D = world.dip, o = D.offers.find((q) => q.id === id);
  if (!o) return false;
  D.offers = D.offers.filter((q) => q !== o);
  if (yes) {
    if (o.gold) { world.teams[o.from].gold -= o.gold; world.teams[0].gold += o.gold; world.teams[0].earned += o.gold; }
    setTruce(world, o.from, 0, TRUCE_TIME, 'offered');
  } else remember(world, o.from, 0, -4, 'turned our envoy away');
  return true;
}

// a beaten rival at war with the player sends word that it will yield (the Banners panel then
// shows DEMAND SURRENDER as likely); returns true when a herald was sent
function by0Envoy(world) {
  const W = world.war, D = world.dip;
  if (world.botPlayer) return false;
  for (const s of W.slots) {
    if (s === 0 || !W.factions[s].alive || !hostile(world, s, 0)) continue;
    if (!broken(world, s, 0) || (D.yieldSaid || {})[s]) continue;
    (D.yieldSaid = D.yieldSaid || {})[s] = world.t;
    world.events.push({ type: 'alert', team: 0, text: W.factions[s].short + ' is beaten. Demand their surrender in the Banners panel (U).', pos: null, tone: 'good', t: world.t });
    return true;
  }
  return false;
}

// ------------------------------------------------------------------ once a second
export function updateDiplomacy(world) {
  const D = world.dip; if (!D) return;
  const W = world.war;
  // truces run out
  for (const k in D.rel) {
    const R = D.rel[k];
    if (R.state === 'truce' && world.t >= R.until) { const [a, b] = k.split('|').map(Number); endTruce(world, a, b, 'expired'); }
  }
  D.tribute = D.tribute.filter((t) => t.until > world.t);
  D.pay = D.pay.filter((p) => p.until > world.t);
  D.offers = D.offers.filter((o) => world.t - o.t < 45);
  // betrayal warnings come due
  for (const w of D.warn.slice()) {
    if (world.t < w.at) continue;
    D.warn = D.warn.filter((x) => x !== w);
    if (atTruce(world, w.a, w.b)) { endTruce(world, w.a, w.b, 'betrayal'); for (const s of W.slots) if (s !== w.a) remember(world, s, w.a, s === w.b ? -60 : -25, 'broke a truce'); }
  }
  // every 30 s a kingdom under truce with the player may betray it: when it is the stronger and the
  // player's men are busy fighting somebody else
  if (world.t >= D.nextBetray) {
    D.nextBetray = world.t + 30;
    for (const s of W.slots) {
      if (s === 0 || !W.factions[s].alive || !atTruce(world, s, 0) || D.warn.some((w) => w.a === s)) continue;
      const P = PERSONALITY[W.factions[s].personality] || {};
      if (!P.betrayal) continue;
      let busy = false; for (const q of world.squads.values()) if (q.team === 0 && q.inContact && q.alive > 0) { busy = true; break; }
      if (!busy || strength(world, s) < strength(world, 0) * 1.5) continue;
      if (world.rng() < P.betrayal * 0.35) {
        D.warn.push({ a: s, b: 0, at: world.t + BETRAY_WARN });
        const home = W.settlements.find((q) => q.owner === s && q.kind === 'capital');
        world.events.push({ type: 'alert', team: 0, text: `${W.factions[s].short} banners gather on your border...`, pos: home ? home.pos : null, tone: 'bad', t: world.t });
      }
    }
  }
  // the AI kingdoms' own diplomacy, every 45 s
  if (world.t >= D.nextAI) {
    D.nextAI = world.t + 45;
    // a broken kingdom surrenders to the strongest kingdom at war with it (AI kingdoms only: the
    // player's surrender is never automatic, and a kingdom beaten by the player is surrendered by
    // the player's demand or by the bot standing in for the player)
    for (const s of W.slots) { const m = strength(world, s); world.teams[s].peakMen = Math.max(world.teams[s].peakMen || 0, m); }
    for (const s of W.slots) {
      if ((s === 0 && !world.botPlayer) || !W.factions[s].alive || world.t < 600) continue;
      let by = -1, bs = 0;
      for (const o of W.slots) if (o !== s && W.factions[o].alive && hostile(world, s, o)) { const st = strength(world, o); if (st > bs) { bs = st; by = o; } }
      // an exhausted kingdom yields to whoever has hurt it most (if that one is still in the war and stronger)
      const L = world.teams[s].lostTo || {};
      if (exhaustion(world, s) >= 100) { let hb = -1, hn = 0; for (const o in L) if (+o !== s && W.factions[+o] && W.factions[+o].alive && hostile(world, s, +o) && L[o] > hn && strength(world, +o) > strength(world, s)) { hn = L[o]; hb = +o; } if (hb >= 0) by = hb; }
      if (by < 0 || (by === 0 && !world.botPlayer)) continue;
      if (broken(world, s, by)) { capitulate(world, s, by); break; }
    }
    if (by0Envoy(world)) void 0;
    const rivals = W.slots.filter((s) => s !== 0 && W.factions[s].alive);
    // a kingdom that is losing badly sends the player an envoy
    for (const s of rivals) {
      if (!hostile(world, s, 0) || D.offers.some((o) => o.from === s) || world.t - (D.lastEnvoy?.[s] ?? -999) < 240) continue;
      const lost = losses(world, s);
      const P = PERSONALITY[W.factions[s].personality] || {};
      if (lost >= 0.34 && strength(world, s) < strength(world, 0) * 0.8 && world.rng() < 0.3 + P.truce * 0.5) {
        (D.lastEnvoy = D.lastEnvoy || {})[s] = world.t;
        const gold = Math.round(Math.min(world.teams[s].gold * 0.3, 8000) / 100) * 100;
        D.offers.push({ id: 'o' + Math.round(world.t * 10) + s, from: s, gold: Math.max(0, gold), t: world.t });
        world.events.push({ type: 'envoy', from: s });
        world.events.push({ type: 'alert', team: 0, text: `An envoy from ${W.factions[s].short} asks for a truce${gold ? ' and brings ' + gold.toLocaleString() + ' g' : ''}.`, pos: null, tone: 'info', t: world.t });
      }
    }
    // rival pairs: now and then two kingdoms that are both losing to somebody make a truce; a truce
    // between two rivals is broken early by a betrayer when it pays
    for (let i = 0; i < rivals.length; i++) for (let j = i + 1; j < rivals.length; j++) {
      const a = rivals[i], b = rivals[j];
      const Pa = PERSONALITY[W.factions[a].personality] || {}, Pb = PERSONALITY[W.factions[b].personality] || {};
      if (hostile(world, a, b)) {
        const busy = hostile(world, a, 0) && hostile(world, b, 0) && strength(world, 0) > Math.max(strength(world, a), strength(world, b));
        if (busy && world.rng() < Pa.truce * Pb.truce * 0.25) setTruce(world, a, b, TRUCE_TIME * 0.7, 'ai');
      } else if (atTruce(world, a, b)) {
        for (const [x, y, P] of [[a, b, Pa], [b, a, Pb]]) if (P.betrayal && strength(world, x) > strength(world, y) * 1.6 && world.rng() < P.betrayal * 0.2) { endTruce(world, x, y, 'betrayal'); break; }
      }
    }
  }
}
