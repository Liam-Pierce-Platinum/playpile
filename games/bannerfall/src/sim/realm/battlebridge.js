// BANNERFALL :: sim/realm/battlebridge.js - from the realm to a fought battle and back (DESIGN.md 19.7, 19.8, 24.4).
//   to battle   battleOptions() turns an engagement into createWarWorld() options: the province's
//               own map (its battle seed, its biome, its villages), its seat for whoever holds it
//               (stone for castles and capitals, a palisade fort for strongholds) and a palisade war
//               camp for the other side, every squad of both hosts by persistent id with its men
//               and veterancy, the garrison on the walls, the enemy's colours and its general, and
//               the battle chest (never below the Royal Grant) from the treasury.
//   the aim     win by breaking the enemy host (a quarter of its men left) or storming the seat;
//               lose the same way; at the second nightfall (24 minutes) whoever kept more of their
//               host holds the field.
//   back        writeBack() returns every man, every new recruit, the unspent chest and the loot to
//               the realm, burns the villages that were burnt, and applies the result like any other
//               engagement (war score, exhaustion, a stormed seat changes hands).
import { FACTIONS } from '../../data/factions.js';
import { R_ECON } from '../../data/realm.js';
import { applyResult } from './engage.js';
import { newSquad } from './realmgen.js';
import { log } from './diplomacy.js';

const BASE = { royal: 'varkhal', hammer: 'thornwood', turtle: 'saltmere', horde: 'hounds', shieldbow: 'thornwood' };
export function playerSide(R, E) {
  const me = R.kingdoms.find((k) => k.player).id;
  const has = (ids) => ids.some((id) => { const A = R.armies.find((x) => x.id === id); return A && A.kingdom === me; });
  return has(E.att) ? 'att' : has(E.def) ? 'def' : null;
}
export function battleOptions(R, E, o = {}) {
  const P = R.provinces[E.prov];
  const me = R.kingdoms.find((k) => k.player);
  const side = playerSide(R, E) || 'att';
  const mine = (side === 'att' ? E.att : E.def).map((id) => R.armies.find((x) => x.id === id)).filter(Boolean);
  const theirs = (side === 'att' ? E.def : E.att).map((id) => R.armies.find((x) => x.id === id)).filter(Boolean);
  const enemyK = side === 'att' ? E.defK : E.attK;
  const EK = enemyK >= 0 ? R.kingdoms[enemyK] : null;
  const baseKey = EK && FACTIONS[EK.key] && EK.key !== 'aldmere' ? EK.key : BASE[EK ? EK.doctrine : 'shieldbow'] || 'thornwood';
  const seatSlot = P.owner === me.id ? 0 : (P.owner === enemyK || (enemyK < 0 && P.owner < 0)) ? 1 : -1;
  const seatKind = P.seat !== 'none' && P.seatHp > 0 ? P.seat : 'none';
  const chest = Math.max(R_ECON.royalGrant, Math.round(Math.max(0, me.gold) * (o.chestShare ?? 0.3)));
  const paid = Math.min(Math.max(0, me.gold), chest);
  const general = mine[0] ? mine[0].general.name : 'The Marshal';
  return {
    seed: P.battleSeed, size: o.size || (P.seat === 'capital' ? 'medium' : 'small'), biome: P.biome, enemies: 1, factions: [baseKey], gold: chest,
    difficulty: o.difficulty || 'captain', win: 'realm', castles: 0, strongholds: 0, villageCount: Math.min(4, P.villages.length),
    name: 'Battle of ' + P.name,
    factionDefs: {
      0: { name: me.name, short: me.short, leader: general, main: me.main, trim: me.trim },
      1: EK ? { name: EK.name, short: EK.short, leader: EK.leader, main: EK.main, trim: EK.trim, personality: EK.personality || 'conqueror', doctrine: EK.doctrine, general: theirs[0] ? theirs[0].general.name : EK.short + ' Captain' }
        : { name: 'The free men of ' + P.name, short: P.name, leader: 'The Reeve of ' + P.name, main: 0x8a7a5c, trim: 0xd8ceb4, personality: 'merchant', doctrine: 'shieldbow' },
    },
    realm: {
      eng: E.id, prov: P.id, side, seatSlot, seatKind: seatSlot >= 0 ? seatKind : 'none',
      playerSquads: mine.flatMap((A) => A.squads).slice(0, 40).map((s) => ({ ...s })),
      enemySquads: theirs.flatMap((A) => A.squads).slice(0, 44).map((s) => ({ ...s })),
      playerGarrison: seatSlot === 0 ? P.garrison.map((s) => ({ ...s })) : [],
      enemyGarrison: seatSlot === 1 ? P.garrison.map((s) => ({ ...s })) : [],
      enemyKing: seatSlot === 1 && P.seat === 'capital' && EK && EK.capital === P.id,
      enemyGold: EK ? Math.round(Math.min(EK.gold * 0.3, 30000)) : 4000,
      chest, paid, maxT: 1440, aim: side === 'att' ? (seatSlot === 1 ? 'Take the seat' : 'Break their army') : seatSlot === 0 ? 'Hold the seat' : 'Break their army',
    },
  };
}
// pay the chest before the battle (the Royal Grant tops it up for free)
export function payChest(R, opts) { const me = R.kingdoms.find((k) => k.player); me.gold -= opts.realm.paid; return opts.realm.chest; }

// the battle is over (or abandoned): write it back to the realm
export function writeBack(R, E, world) {
  const W = world.war, RL = W.realm;
  const me = R.kingdoms.find((k) => k.player);
  const P = R.provinces[E.prov];
  const side = RL.side;
  const byId = new Map();
  for (const A of R.armies) for (const s of A.squads) byId.set(s.id, s);
  for (const s of P.garrison) byId.set(s.id, s);
  const sideMen = (ids) => ids.map((id) => R.armies.find((x) => x.id === id)).filter(Boolean).reduce((a, A) => a + A.squads.reduce((b, s) => b + s.men, 0), 0);
  const start = [sideMen(E.att) + (E.assault || (RL.seatSlot >= 0 && (side === 'att') === (RL.seatSlot === 1)) ? 0 : 0), sideMen(E.def)];
  const gStart = P.garrison.reduce((a, s) => a + s.men, 0);
  // men back to their squads by persistent id
  const seen = new Set();
  for (const q of world.squads.values()) {
    if (!q.realmId) continue;
    const s = byId.get(q.realmId); if (!s) continue;
    seen.add(q.realmId);
    s.men = Math.max(0, q.alive);
    s.xp = Math.min(400, (s.xp || 0) + Math.round((q.kills || 0) * 2 + (q.xp - (q.xp0 || 0)) * 0.5));
    if (q.soldiers.length && q.soldiers[0].ammo !== undefined) s.ammo = Math.round(q.soldiers.filter((so) => so.alive).reduce((a, so) => a + (so.ammo || 0), 0) / Math.max(1, q.alive));
  }
  for (const A of R.armies) A.squads = A.squads.filter((s) => s.men > 0);
  P.garrison = P.garrison.filter((s) => s.men > 0);
  // fresh squads raised during the battle join the player's host
  const host = (side === 'att' ? E.att : E.def).map((id) => R.armies.find((x) => x.id === id)).filter(Boolean)[0];
  let raised = 0;
  for (const q of world.squads.values()) {
    if (q.team !== 0 || q.realmId || q.alive <= 0 || q.state === 'gone' || q.type === 'commander' || q.type === 'king' || q.def.builder || !host) continue;
    const s = newSquad(R, q.type); s.men = q.alive; host.squads.push(s); raised++;
  }
  // gold: what is left of the chest, plus loot and pillage
  me.gold += Math.max(0, Math.round(world.teams[0].gold));
  // villages burnt on the field are burnt in the realm
  let burnt = 0;
  for (const s of W.settlements) if (s.kind === 'village' && s.state === 'ravaged') burnt++;
  for (let i = 0; i < Math.min(burnt, P.villages.length); i++) { P.villages[i].state = 'ravaged'; P.villages[i].ravagedDay = R.day; }
  // the province remembers its earthworks (the delta the next battle here starts from)
  P.delta.trenches += world.terrain.trenchLines.length;
  P.delta.walls += [...world.structures.values()].filter((st) => st.alive && st.team === 0 && !st.prebuilt).length;
  // the result
  const res = world.result;
  const won = res && res.winner === 0;
  const seat = W.settlements.find((s) => s.kind === 'capital' && s.realmSeat && s.realmSeat !== 'camp');
  if (seat && seat.owner !== seat.founder) E.assault = true;
  const winSide = won ? side : side === 'att' ? 'def' : 'att';
  const end = [sideMen(E.att), sideMen(E.def)];
  const r = applyResult(R, E, winSide, { start: [Math.max(start[0], end[0]), Math.max(start[1] + gStart, end[1])], end }, true);
  log(R, `${me.short} ${won ? 'wins' : 'loses'} the Battle of ${P.name}${raised ? ' (' + raised + ' squads raised on the field)' : ''}.`, 'battle', [me.id]);
  return { won, raised, gold: Math.round(world.teams[0].gold), reason: res ? res.reason : 'The battle was left', E: r };
}
