// BANNERFALL :: sim/save.js - snapshot and restore of a live war (DESIGN.md 19.12, 24.3).
//
// serializeWorld() turns a running war into plain JSON: the map is NOT stored (it is regenerated
// from the seed and the creation options), every dug trench is stored as its dig command and
// replayed in order (so the ground comes back bit for bit), and every squad, soldier, structure,
// blueprint, projectile, settlement, region, queue and AI host is stored with its references
// turned into ids. restoreWorld() rebuilds a world that steps on exactly as the original would:
// tools/serial.mjs checks that the state hash after "run 300 ticks, save, load, run 300 more"
// equals the hash of running 600 ticks straight.
import { createWarWorld } from './war.js';
import { squadIdState } from './squads.js';
import { structIdState } from './structures.js';
import { blueprintIdState } from './construction.js';

const SKIP_SQ = new Set(['def', 'soldiers', '_chain']);
const SKIP_ST = new Set(['_chain']);

// references inside squads (targets, threats) become { $sq: id }; soldiers inside projectiles
// and monks' targets become { $so: id }
function pack(v, depth = 0) {
  if (v === null || typeof v !== 'object') return v;
  if (v.soldiers && v.def && typeof v.id === 'string') return { $sq: v.id };
  if (v.sq && v.sq.soldiers && typeof v.id === 'number') return { $so: v.id };
  if (Array.isArray(v)) return v.map((x) => pack(x, depth + 1));
  if (v instanceof Map) return { $map: [...v.entries()].map(([k, x]) => [k, pack(x, depth + 1)]) };
  if (v instanceof Set) return { $set: [...v] };
  if (ArrayBuffer.isView(v)) return { $ta: v.constructor.name, d: Array.from(v) };
  if (depth > 12) return null;
  const o = {};
  for (const k of Object.keys(v)) { const x = v[k]; if (typeof x === 'function') continue; o[k] = pack(x, depth + 1); }
  return o;
}
function unpack(v, ctx) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => unpack(x, ctx));
  if (v.$sq !== undefined) return ctx.squads.get(v.$sq) || null;
  if (v.$so !== undefined) return ctx.soldiers.get(v.$so) || null;
  if (v.$map) return new Map(v.$map.map(([k, x]) => [k, unpack(x, ctx)]));
  if (v.$set) return new Set(v.$set);
  if (v.$ta) { const C = globalThis[v.$ta]; return C ? C.from(v.d) : v.d; }
  const o = {};
  for (const k of Object.keys(v)) o[k] = unpack(v[k], ctx);
  return o;
}

export function serializeWorld(world) {
  const W = world.war;
  if (!W) throw new Error('serializeWorld: war worlds only');
  const squads = [];
  for (const sq of world.squads.values()) {
    const o = {};
    for (const k of Object.keys(sq)) if (!SKIP_SQ.has(k)) o[k] = pack(sq[k], 1);
    o.soldierIds = sq.soldiers.map((so) => so.id);
    squads.push(o);
  }
  const soldiers = world.soldiers.map((so) => { const o = {}; for (const k of Object.keys(so)) { if (k === 'sq') continue; o[k] = pack(so[k], 1); } o.sqId = so.sq.id; return o; });
  // soldiers that left world.soldiers (long-dead bodies) but are still in a squad's list
  const listed = new Set(world.soldiers.map((so) => so.id));
  const extra = [];
  for (const sq of world.squads.values()) for (const so of sq.soldiers) if (!listed.has(so.id)) { const o = {}; for (const k of Object.keys(so)) { if (k === 'sq') continue; o[k] = pack(so[k], 1); } o.sqId = sq.id; extra.push(o); }
  const structures = [...world.structures.values()].map((s) => { const o = {}; for (const k of Object.keys(s)) if (!SKIP_ST.has(k)) o[k] = pack(s[k], 1); return o; });
  const T = world.terrain;
  return {
    v: 1, opts: W.opts,
    t: world.t, tick: world.tick, phase: world.phase, rng: world.rng.getState(), result: world.result,
    ids: { sq: squadIdState.get(), st: structIdState.get(), bp: blueprintIdState.get() },
    teams: pack(world.teams), structVersion: world.structVersion, projSeq: world.projSeq,
    digs: T.trenchLines.map((L) => ({ pts: L.pts, opts: L.opts || { depth: L.depth, enemyDir: L.enemyDir, team: L.team } })),
    terrainVersion: T.version, tilesV: T.tilesV, touch: T.touch || 0,
    squads, soldiers, extraSoldiers: extra, structures,
    blueprints: [...world.blueprints.values()].map((b) => pack(b)),
    projectiles: world.projectiles.filter((p) => p.alive).map((p) => pack(p)),
    breaches: pack(world.breaches), homeFlag: pack(world.homeFlag), botPlayer: !!world.botPlayer,
    teamCount: pack(world.teamCount), ai: pack(world.ai), firstBreachT: world.firstBreachT,
    war: {
      settlements: W.settlements.map((s) => pack(s)),
      regions: W.regions.map((R) => ({ owner: R.owner, claim: R.claim || null, supplied: R.supplied, contested: !!R.contested, settlement: R.settlement ?? null, kind: R.kind ?? null })),
      factions: Object.fromEntries(Object.entries(W.factions).map(([k, f]) => [k, { alive: f.alive, fellT: f.fellT, fellTo: f.fellTo }])),
      queues: pack(W.queues), choices: pack(W.choices), defeatT: W.defeatT, territoryV: W.territoryV, alerts: pack(W.alerts.slice(-20)),
      supplyT: W.supplyT, home: W.home, startedAt: W.startedAt, seq: W.seq || 0, mainSeats: W.mainSeats,
      hostM: Array.from(world.hostM), dip: world.dip ? pack(world.dip) : null,
    },
    navFail: world._navW && world._navW.fail ? [...world._navW.fail.entries()] : [],
  };
}

export function restoreWorld(data, opts = {}) {
  const w = createWarWorld({ ...data.opts, gen: opts.gen });
  const W = w.war;
  // the ground: replay every dig in order
  const T = w.terrain;
  for (const L of T.trenchLines.splice(0)) void L;
  // the fresh world already dug its forts' trenches; start the terrain over from the generator's
  // state by replaying exactly the stored list (which includes those) on a clean copy
  for (const t of [...T.tiles.keys()]) T.tiles.delete(t);
  T.trenchLines.length = 0;
  for (const d of data.digs) T.dig(d.pts, d.opts);
  T.dirty.length = 0;
  T.version = data.terrainVersion; T.tilesV = data.tilesV; T.touch = data.touch;
  // everything that moves
  w.squads.clear(); w.soldiers.length = 0; w.structures.clear(); w.blueprints.clear(); w.projectiles = [];
  const ctx = { squads: new Map(), soldiers: new Map() };
  for (const o of data.squads) ctx.squads.set(o.id, { id: o.id });
  const allSo = data.soldiers.concat(data.extraSoldiers || []);
  for (const o of allSo) ctx.soldiers.set(o.id, { id: o.id });
  for (const o of data.squads) {
    const sq = ctx.squads.get(o.id);
    for (const k of Object.keys(o)) { if (k === 'soldierIds') continue; sq[k] = unpack(o[k], ctx); }
    sq.def = w.defs[sq.team][sq.type];
    sq.soldiers = o.soldierIds.map((id) => ctx.soldiers.get(id));
    w.squads.set(sq.id, sq);
  }
  for (const o of allSo) {
    const so = ctx.soldiers.get(o.id);
    for (const k of Object.keys(o)) { if (k === 'sqId') continue; so[k] = unpack(o[k], ctx); }
    so.sq = ctx.squads.get(o.sqId);
  }
  for (const o of data.soldiers) w.soldiers.push(ctx.soldiers.get(o.id));
  for (const o of data.structures) { const s = unpack(o, ctx); w.structures.set(s.id, s); }
  for (const o of data.blueprints) { const b = unpack(o, ctx); w.blueprints.set(b.id, b); }
  w.projectiles = data.projectiles.map((p) => unpack(p, ctx));
  w.teams = unpack(data.teams, ctx);
  w.structVersion = data.structVersion; w.projSeq = data.projSeq;
  w.t = data.t; w.tick = data.tick; w.phase = data.phase; w.result = data.result;
  w.rng.setState(data.rng);
  w.breaches = unpack(data.breaches, ctx); w.homeFlag = unpack(data.homeFlag, ctx);
  w.botPlayer = data.botPlayer; w.teamCount = unpack(data.teamCount, ctx); w.ai = unpack(data.ai, ctx); w.firstBreachT = data.firstBreachT;
  // settlements founded mid-war (outposts, castle keeps) come after the generated ones
  data.war.settlements.forEach((s, i) => { if (W.settlements[i]) Object.assign(W.settlements[i], unpack(s, ctx)); else W.settlements.push(unpack(s, ctx)); });
  data.war.regions.forEach((r, i) => Object.assign(W.regions[i], r));
  for (const k in data.war.factions) Object.assign(W.factions[k], data.war.factions[k]);
  W.queues = unpack(data.war.queues, ctx); W.choices = unpack(data.war.choices, ctx); W.defeatT = data.war.defeatT; W.territoryV = data.war.territoryV;
  W.alerts = unpack(data.war.alerts, ctx); W.supplyT = data.war.supplyT; W.home = data.war.home; W.startedAt = data.war.startedAt;
  W.seq = data.war.seq || 0; if (data.war.mainSeats) W.mainSeats = data.war.mainSeats;
  if (data.war.hostM) w.hostM.set(data.war.hostM);
  if (data.war.dip && w.dip) { const D = unpack(data.war.dip, ctx); for (const k of Object.keys(D)) w.dip[k] = D[k]; }
  squadIdState.set(data.ids.sq); structIdState.set(data.ids.st); blueprintIdState.set(data.ids.bp);
  // derived caches are rebuilt on demand; the nav's short memory of failed goals is part of the state
  w._navW = null; w._structListV = -1; w.hash = null;
  w.events.length = 0;
  w._navFail = data.navFail;
  w._restoredNavFail = data.navFail;
  return w;
}

// a hash of everything that matters to the outcome (positions to the millimetre, hit points, gold,
// owners); equal hashes after the same number of ticks = the same war
export function stateHash(world) {
  let h = 2166136261 >>> 0;
  const mix = (v) => { const x = Math.round(v * 1000) | 0; h = Math.imul(h ^ (x & 0xffff), 16777619) >>> 0; h = Math.imul(h ^ (x >>> 16), 16777619) >>> 0; };
  const mixS = (s) => { for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0; };
  mix(world.t); mix(world.tick);
  for (const sq of world.squads.values()) { mixS(sq.id); mix(sq.alive); mix(sq.morale); mixS(sq.state); mixS(sq.mode); }
  for (const so of world.soldiers) { mix(so.x); mix(so.z); mix(so.hp); mix(so.alive ? 1 : 0); }
  for (const s of world.structures.values()) { mix(s.hp); mix(s.team); }
  for (const k in world.teams) mix(world.teams[k].gold);
  if (world.war) { for (const s of world.war.settlements) { mix(s.owner); mix(s.capT); } for (const R of world.war.regions) mix(R.owner); }
  mix(world.projectiles.filter((p) => p.alive).length);
  return h.toString(16);
}
