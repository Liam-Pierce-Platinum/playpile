// BANNERFALL :: sim/war.js - a whole war on one huge generated map (DESIGN.md 3-5, 13.2, 14).
//
// createWarWorld() runs worldgen, raises every rival's capital, castles and strongholds (stone or
// timber rings with gates and towers, garrisons on the walls), puts militia in the villages and
// gives the player a free home keep, a Marshal, builders and a big opening budget for FOUNDING.
// warStep() is the war's fixed 20 Hz step: the v1 battle systems (squads, projectiles, healing,
// morale, structures) plus regions, settlements (take a village, raid a stronghold, storm a
// castle), the economy, recruiting at castles, builders, the rival kingdoms' AI and victory.
// Everything here is pure JS and runs headless in node (tools/war.mjs).
import { C } from '../data/constants.js';
import { UNIT_TYPES, TRAIN, WAR_RECRUITABLE, OUTPOST_RECRUITABLE } from '../data/units.js';
import { BANNERS, HEAL, LOOT } from '../data/economy.js';
import { incomeOf, upkeepOf, economyTick } from './economy.js';
import { setupDiplomacy, updateDiplomacy } from './diplomacy.js';
import { BUILD_TYPES } from '../data/builds.js';
import { FACTIONS, RIVALS, NEUTRAL, WILD, NEUTRAL_COL, WILD_COL, PERSONALITY } from '../data/factions.js';
import { BIOMES } from '../data/biomes.js';
import { mulberry32 } from './rng.js';
import { generateWorld } from './worldgen.js';
import { setupRelations, hostile } from './factions.js';
import { rebuildHash, forNear, applyDamage, kill } from './combat.js';
import { createSquad, placeSquad, updateSquad, updateSoldiers, resetSquadIds, enterGarrison, leaveGarrison, addSoldier, squadGrid } from './squads.js';
import { updateProjectiles } from './projectiles.js';
import { updateHealing } from './healing.js';
import { updateMorale, startRout } from './morale.js';
import { makeSegment, makeTower, resetStructureIds, updateStructures, structList } from './structures.js';
import { build, issue } from './orders.js';
import { compose, warDoctrine } from './ai.js';
import { buildDefs } from './world.js';
import { updateRegions, setOwner, regionsOf, ownerAt, updateSupply, regionAt } from './regions.js';
import { resetBlueprintIds } from './construction.js';
import { warAI, setupWarAI } from './warai.js';
import { setupVision, updateVision } from './vision.js';

export const PRICE_MULT = 5;
const DIFF = { recruit: 0.75, captain: 1, warlord: 1.3 };

// ------------------------------------------------------------------ creation
export function createWarWorld(o = {}) {
  resetSquadIds(); resetStructureIds(); resetBlueprintIds();
  const seed = (o.seed >>> 0) || 1;
  const rng = mulberry32(seed * 31 + 7);
  const sizeKey = o.size || 'medium';
  const biome = o.biome && BIOMES[o.biome] ? o.biome : rng.pick(['spring', 'forest', 'river', 'farmland', 'autumn', 'highland']);
  const nEnemies = Math.max(1, Math.min(4, o.enemies || 2));
  let keys = (o.factions || []).filter((k) => RIVALS.includes(k));
  const pool = RIVALS.filter((k) => !keys.includes(k));
  while (keys.length < nEnemies) keys.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  keys = keys.slice(0, nEnemies);
  // the MAIN ENEMY: Varkhal when it is in the war (the Iron Crown), else the first rival
  const mainKey = o.mainKey && keys.includes(o.mainKey) ? o.mainKey : keys.includes('varkhal') ? 'varkhal' : keys[0];
  const main = keys.indexOf(mainKey) + 1;
  const slots = [0, ...keys.map((_, i) => i + 1)];
  const gen = o.gen || generateWorld({ seed, size: sizeKey, biome, slots, villages: o.villages, progress: o.progress, main, castles: o.castles, strongholds: o.strongholds, villageCount: o.villageCount });
  const difficulty = o.difficulty || 'captain';
  const T = gen.terrain;
  const allSlots = [...slots, NEUTRAL, WILD];
  const factions = {};
  factions[0] = { slot: 0, ...FACTIONS.aldmere, ...(o.factionDefs && o.factionDefs[0] || {}), alive: true };
  keys.forEach((k, i) => { factions[i + 1] = { slot: i + 1, ...FACTIONS[k], ...(o.factionDefs && o.factionDefs[i + 1] || {}), alive: true }; });
  factions[NEUTRAL] = { slot: NEUTRAL, id: 'neutral', name: 'Free villages', short: 'Villagers', ...NEUTRAL_COL, alive: true };
  factions[WILD] = { slot: WILD, id: 'wild', name: 'Bandits', short: 'Bandits', ...WILD_COL, alive: true };
  const techs = {}, defs = {}, teams = {}, teamCount = {}, undo = {};
  for (const s of allSlots) {
    techs[s] = new Set(o.tech && s === 0 ? o.tech : []);
    defs[s] = buildDefs(techs[s], PRICE_MULT);
    teams[s] = { gold: 0, spent: 0, lost: 0, healed: 0, earned: 0, income: 0, looted: 0 };
    teamCount[s] = {};
    undo[s] = [];
  }
  const gold = o.gold !== undefined ? o.gold : 50000;
  teams[0].gold = Math.round(gold * (difficulty === 'recruit' ? 1.2 : 1));
  const startGold = teams[0].gold;
  const cap0 = gen.capitals.find((c) => c.faction === 0);
  const world = {
    def: {
      id: 'free', name: o.name || 'Free Play', type: 'war', deployCap: 48, timeLimit: 0, blurb: '',
      zones: { player: null, enemy: null, flag: { pos: cap0.pos, r: 14, name: 'your keep' }, pflag: { pos: cap0.pos }, eflag: { pos: cap0.pos } },
      stars: { maxLossPct: 40, objective: 'none', objectiveText: '' }, enemy: { waves: [] }, terrain: {},
    },
    mode: 'war', seed, rng: mulberry32(seed * 7 + 3), difficulty,
    t: 0, tick: 0, phase: 'prepare', paused: false, speed: 1,
    terrain: T, trees: gen.trees, boulders: gen.boulders, hedges: [], props: gen.props, scenery: [],
    obstacles: [], structures: new Map(), structVersion: 0, blueprints: new Map(),
    squads: new Map(), soldiers: [], projectiles: [], projSeq: 0,
    techs, defs, teams, teamCount, undo, events: [], result: null,
    flag: { hold: 0, mine: 0, theirs: 0, touched: false, owner: 0 },
    ai: { spawned: [], waves: [], plan: [] },
    unlocked: null, builds: null, priceMult: PRICE_MULT,
    enemyScale: DIFF[difficulty] || 1, mudSpeed: 1,
    homeFlag: {}, stage: 0, timeEnd: 0, flagActive: false, objectives: [], firstBreachT: 0, kingSlain: false,
    breaches: {},
    war: {
      gen, sizeKey, size: gen.size, biome, env: BIOMES[biome].env, slots, factions, keys,
      regions: gen.regions, regGrid: gen.regGrid, RG: gen.RG, GW: gen.GW, roads: gen.roads, rivers: gen.rivers, bridges: gen.bridges, fords: gen.fords,
      settlements: [], territoryV: 1, win: o.win || 'main', startGold, keepSites: gen.keepSites, alerts: [],
      defeatT: null, choices: [], bannerCap: {}, queues: {}, mustered: 0, main, mainSeats: [],
      opts: { seed, size: sizeKey, biome, enemies: nEnemies, factions: keys.slice(), mainKey, gold, difficulty, win: o.win || 'main', villages: o.villages, tech: o.tech || [], castles: o.castles, strongholds: o.strongholds, villageCount: o.villageCount, factionDefs: o.factionDefs, province: o.province },
    },
  };
  for (const s of slots) world.breaches[s] = [];
  world.stepFn = warStep;
  setupRelations(world, slots);
  // obstacles: trees, boulders and the buildings worldgen placed
  for (const t of gen.trees) world.obstacles.push({ x: t.x, z: t.z, r: 0.55 * t.s, kind: 'tree' });
  for (const b of gen.boulders) world.obstacles.push({ x: b.x, z: b.z, r: b.s * 0.75, kind: 'rock' });
  const OB = { windmill: 4.2, cottage: 3.6, hay: 1.3, tent: 2.2, house: 4.0, well: 1.3, campfire: 0.8, abbeySmall: 5.0 };
  for (const p of gen.props) {
    let r = OB[p.type]; if (!r) continue;
    if (p.big) r *= p.type === 'tent' ? 1.6 : 1.3;
    world.obstacles.push({ x: p.pos[0], z: p.pos[1], r, kind: 'building' });
  }
  // settlements
  for (const g of gen.settlements) world.war.settlements.push(makeSettlement(world, g));
  // the keeps (a big stone building in every castle yard, the player's home keep included)
  for (const s of world.war.settlements) {
    if (s.kind !== 'capital' && s.kind !== 'castle') continue;
    world.props.push({ type: 'keep', pos: s.keepPos, rot: Math.PI - s.gateDir, small: s.kind === 'castle', settle: s.id, team: s.owner });
    world.obstacles.push({ x: s.keepPos[0], z: s.keepPos[1], r: s.kind === 'castle' ? 9 : 12, kind: 'building' });
    world.homeFlag[s.owner] = world.homeFlag[s.owner] || s.point;
  }
  buildObstacleHash(world);
  // fortify the rivals' seats (a Long War battle: the province's own seat for whoever holds it,
  // a palisade war camp for the other side; see sim/realm/battlebridge.js)
  const D = DIFF[difficulty] || 1;
  const RL = o.realm || null;
  const SEATSPEC = {
    capital: { sides: 16, wall: 'stoneWall', gate: 'stoneGate', tower: 'stoneTower', towerEvery: 2 },
    castle: { sides: 12, wall: 'stoneWall', gate: 'stoneGate', tower: 'stoneTower', towerEvery: 3 },
    stronghold: { sides: 12, wall: 'palisade', gate: 'gate', tower: 'tower', towerEvery: 3, trench: true },
    camp: { sides: 10, wall: 'palisade', gate: 'gate', tower: 'tower', towerEvery: 5 },
  };
  if (RL) for (const s of world.war.settlements) {
    if (s.kind !== 'capital') continue;
    const kind = s.owner === RL.seatSlot ? RL.seatKind : 'camp';
    if (kind === 'none' || (s.owner === 0 && kind === 'camp')) continue;
    fortifyCastle(world, s, { r: s.r - 6, ...SEATSPEC[kind] });
    s.realmSeat = kind;
  }
  for (const s of world.war.settlements) {
    if (s.owner === 0 || RL) continue;
    if (s.kind === 'capital') fortifyCastle(world, s, { r: s.r - 6, sides: 16, wall: 'stoneWall', gate: 'stoneGate', tower: 'stoneTower', towerEvery: 2 });
    else if (s.kind === 'castle') fortifyCastle(world, s, { r: s.r - 6, sides: 12, wall: 'stoneWall', gate: 'stoneGate', tower: 'stoneTower', towerEvery: 3 });
    else if (s.kind === 'stronghold') fortifyCastle(world, s, { r: s.r - 6, sides: 12, wall: 'palisade', gate: 'gate', tower: 'tower', towerEvery: 3, trench: true });
  }
  // garrisons
  for (const s of world.war.settlements) {
    if (RL && s.kind === 'capital') {
      // the realm's own squads man the walls (by persistent id, with their men and veterancy)
      const list = s.owner === 0 ? RL.playerGarrison : RL.enemyGarrison;
      if (list && list.length) garrisonRealm(world, s, list);
      if (s.owner !== 0 && RL.enemyKing) { const k = createSquad(world, s.owner, 'king', { name: factions[s.owner].leader }); placeSquad(world, k, s.point[0], s.point[1], s.gateAng); k.post = [k.lx, k.lz]; k.home = k.post; k.role = 'guard'; k.settle = s.id; }
      continue;
    }
    if (s.owner === 0) continue;
    if (s.kind === 'village') { villageMilitia(world, s); continue; }
    const doctrine = warDoctrine(factions[s.owner].doctrine || 'shieldbow');
    const budget = (s.kind === 'capital' ? 1300 : s.kind === 'castle' ? 650 : 330) * PRICE_MULT * D;
    const cap = s.kind === 'capital' ? 10 : s.kind === 'castle' ? 5 : 3;
    garrison(world, s, compose(world, budget, doctrine, s.kind === 'capital' ? ['healer', 'archer', 'archer'] : ['archer'], world.rng, cap, s.owner));
    if (s.kind === 'capital') {
      const k = createSquad(world, s.owner, 'king', { name: factions[s.owner].leader });
      placeSquad(world, k, s.point[0], s.point[1], s.gateAng); k.post = [k.lx, k.lz]; k.home = k.post; k.role = 'guard'; k.settle = s.id;
    }
  }
  // the player: Marshal, two builder squads and a few gifted squads by the keep
  const home = world.war.settlements.find((s) => s.owner === 0 && s.kind === 'capital');
  world.war.home = home.id;
  const gifts = RL ? ['commander', 'builder'].concat(RL.playerSquads.map((q) => q)) : ['commander', 'builder', 'builder', 'spear', 'spear', 'archer'];
  gifts.forEach((type, i) => {
    const sq = typeof type === 'string' ? createSquad(world, 0, type, { gift: true }) : realmSquad(world, 0, type);
    if (RL) {
      // a Long War host is drawn up in ranks before the camp gate
      const gd = [Math.sin(home.gateDir), Math.cos(home.gateDir)], pp = [-gd[1], gd[0]], k = i % 8, row = Math.floor(i / 8);
      const d = home.r * 0.6 + 30 + row * 13 - (sq.def.ranged ? 6 : 0);
      placeSquad(world, sq, home.pos[0] + gd[0] * d + pp[0] * (k - 3.5) * 12, home.pos[1] + gd[1] * d + pp[1] * (k - 3.5) * 12, home.gateAng);
      return;
    }
    const a = home.gateAng + (i - 2.5) * 0.32, d = home.r * 0.3 + 18;
    placeSquad(world, sq, home.pos[0] + Math.sin(a) * d, home.pos[1] + Math.cos(a) * d, home.gateAng);
  });
  setupWarAI(world, o);
  // each rival's first field army waits by its capital
  for (const slot of slots) {
    if (slot === 0) continue;
    const cap = world.war.settlements.find((s) => s.owner === slot && s.kind === 'capital');
    if (RL) { if (RL.enemySquads.length) fieldArmy(world, slot, cap, RL.enemySquads); teams[slot].gold = RL.enemyGold || 0; continue; }
    const budget = Math.round(startGold * 0.2 * D);
    const units = compose(world, budget, warDoctrine(factions[slot].doctrine || 'horde'), [], world.rng, 12, slot);
    fieldArmy(world, slot, cap, units);
    teams[slot].gold = Math.round(startGold * 0.25 * D);
  }
  // the main enemy's seats: the objective line in the HUD counts these
  world.war.mainSeats = world.war.settlements.filter((s) => s.owner === main && s.kind !== 'village').map((s) => s.id);
  if (RL) {
    world.war.realm = { ...RL, start: {} };
    for (const t of [0, 1]) world.war.realm.start[t] = [...world.squads.values()].filter((q) => q.team === t && q.realmId).reduce((a, q) => a + q.alive, 0);
  }
  setupDiplomacy(world);
  updateSupply(world);
  setupVision(world, [0]);
  updateVision(world);
  return world;
}

function buildObstacleHash(world) {
  // compact cell lists (CSR): 8 m cells over the whole map
  const cs = 8, W = Math.ceil(world.terrain.size / cs) + 1;
  const count = new Int32Array(W * W + 1);
  const cellsOf = (o, fn) => {
    const r = o.r + 1.5;
    const i0 = Math.max(0, Math.floor((o.x - r) / cs)), i1 = Math.min(W - 1, Math.floor((o.x + r) / cs));
    const j0 = Math.max(0, Math.floor((o.z - r) / cs)), j1 = Math.min(W - 1, Math.floor((o.z + r) / cs));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) fn(j * W + i);
  };
  for (const o of world.obstacles) cellsOf(o, (c) => count[c + 1]++);
  for (let k = 1; k <= W * W; k++) count[k] += count[k - 1];
  const fill = count.slice();
  const items = new Array(count[W * W]);
  for (const o of world.obstacles) cellsOf(o, (c) => { items[fill[c]++] = o; });
  const empty = [];
  const cache = new Map();
  world.obstacleCells = (x, z) => {
    const i = Math.floor(x / cs), j = Math.floor(z / cs);
    if (i < 0 || j < 0 || i >= W || j >= W) return empty;
    const c = j * W + i, a = count[c], b = count[c + 1];
    if (a === b) return empty;
    let l = cache.get(c);
    if (!l) { l = items.slice(a, b); if (cache.size > 20000) cache.clear(); cache.set(c, l); }
    return l;
  };
}

function makeSettlement(world, g) {
  const ang = g.gateDir || 0;
  const s = {
    id: g.id, kind: g.kind, name: g.name, pos: g.pos.slice(), r: g.r, tier: g.tier, region: g.region,
    owner: g.faction, founder: g.faction, gateDir: ang, gateAng: ang,
    point: g.pos.slice(), capR: 20, need: 15, capT: 0, capTeam: -1, state: g.kind === 'village' ? 'free' : 'held',
    ravagedUntil: 0, structIds: [], militia: [], houses: g.houses || [], taxedBy: -1,
  };
  if (g.kind === 'capital' || g.kind === 'castle') {
    const back = s.kind === 'capital' ? 0.3 : 0.28;
    s.keepPos = [g.pos[0] - Math.sin(ang) * g.r * back, g.pos[1] - Math.cos(ang) * g.r * back];
    s.point = [g.pos[0] + Math.sin(ang) * g.r * 0.32, g.pos[1] + Math.cos(ang) * g.r * 0.32];
    s.capR = 12; s.need = 30;
  } else if (g.kind === 'stronghold') { s.capR = 8; s.need = 15; }
  // gold for taking it (DESIGN.md 4.4)
  s.loot = g.kind === 'village' ? [0, 6000, 10000, 16000][g.tier || 1] : g.kind === 'stronghold' ? 12000 + Math.round(world.rng() * 13000) : g.kind === 'castle' ? 20000 + Math.round(world.rng() * 20000) : 60000;
  s.tax = g.kind === 'village' ? [0, 150, 250, 400][g.tier || 1] : 0;
  return s;
}

// a ring of wall pieces with a gate facing the road, towers at its corners
export function fortifyCastle(world, s, spec) {
  const team = s.owner, n = spec.sides, R = spec.r;
  const c = s.pos;
  const a0 = Math.PI / 2 - s.gateDir;            // polar angle of the gate side's middle
  const V = [];
  for (let k = 0; k < n; k++) { const a = a0 + (k - 0.5) * (Math.PI * 2 / n); V.push([c[0] + Math.cos(a) * R, c[1] + Math.sin(a) * R]); }
  const ids = [];
  const inward = (m) => { const dx = c[0] - m[0], dz = c[1] - m[1], l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
  for (let k = 0; k < n; k++) {
    const A = V[k], B = V[(k + 1) % n];
    if (k === 0) {
      // the gate side: two stubs and the gatehouse
      const gw = BUILD_TYPES[spec.gate].segLen, L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      const ux = (B[0] - A[0]) / L, uz = (B[1] - A[1]) / L, m = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2];
      const g1 = [m[0] - ux * gw / 2, m[1] - uz * gw / 2], g2 = [m[0] + ux * gw / 2, m[1] + uz * gw / 2];
      ids.push(makeSegment(world, team, spec.wall, A, g1).id, makeSegment(world, team, spec.wall, g2, B).id);
      const gate = makeSegment(world, team, spec.gate, g1, g2);
      ids.push(gate.id); s.gateId = gate.id;
    } else ids.push(makeSegment(world, team, spec.wall, A, B).id);
  }
  for (let k = 0; k < n; k += spec.towerEvery) ids.push(makeTower(world, team, V[k], spec.tower).id);
  for (const id of ids) { const st = world.structures.get(id); st.settle = s.id; st.prebuilt = true; const m = st.pos || [(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2]; st.inward = inward(m); }
  s.structIds = ids;
  s.wallR = R;
  // a trench arc across the approach (timber forts)
  if (spec.trench) {
    const pts = [], gd = [Math.sin(s.gateDir), Math.cos(s.gateDir)], pp = [-gd[1], gd[0]];
    for (let u = -26; u <= 26; u += 4) { const d = R + 22 - (u / 26) ** 2 * 5; pts.push([c[0] + gd[0] * d + pp[0] * u, c[1] + gd[1] * d + pp[1] * u]); }
    const keep = world.teams[team].gold; world.teams[team].gold = 1e9;
    // leave the road open: split the trench around the gate line
    build(world, team, 'trench', pts.filter((p) => Math.abs((p[0] - c[0]) * pp[0] + (p[1] - c[1]) * pp[1]) > 5), { anywhere: true, enemyDir: gd, free: true });
    world.teams[team].gold = keep;
    world.undo[team].length = 0;
  }
}

function villageMilitia(world, s) {
  const n = s.tier === 1 ? 1 : s.tier === 2 ? 2 : 3;
  for (let k = 0; k < n; k++) {
    const type = k === 1 ? 'militiaBow' : 'militia';
    const sq = createSquad(world, NEUTRAL, type, { name: s.name + (type === 'militia' ? ' Militia' : ' Bowmen') });
    const a = (k / n) * Math.PI * 2 + 0.4;
    placeSquad(world, sq, s.pos[0] + Math.sin(a) * 9, s.pos[1] + Math.cos(a) * 9, a);
    sq.stance = 'hold'; sq.post = [sq.lx, sq.lz]; sq.home = sq.post; sq.role = 'militia'; sq.settle = s.id;
    s.militia.push(sq.id);
  }
}

// garrison a castle or stronghold: shooters on towers and wall-walks, the rest in the yard
function garrison(world, s, units) {
  const team = s.owner;
  const shooters = [], rest = [];
  for (const u of units) { const sq = createSquad(world, team, u, {}); sq.settle = s.id; sq.role = 'garrison'; (sq.def.ranged && !sq.def.engine ? shooters : rest).push(sq); }
  const towers = s.structIds.map((id) => world.structures.get(id)).filter((st) => st && st.kind === 'tower');
  const walls = s.structIds.map((id) => world.structures.get(id)).filter((st) => st && st.type === 'stoneWall');
  const gd = [Math.sin(s.gateDir), Math.cos(s.gateDir)];
  // towers nearest the gate first
  towers.sort((p, q) => ((q.pos[0] - s.pos[0]) * gd[0] + (q.pos[1] - s.pos[1]) * gd[1]) - ((p.pos[0] - s.pos[0]) * gd[0] + (p.pos[1] - s.pos[1]) * gd[1]));
  walls.sort((p, q) => (((q.a[0] + q.b[0]) / 2 - s.pos[0]) * gd[0] + ((q.a[1] + q.b[1]) / 2 - s.pos[1]) * gd[1]) - (((p.a[0] + p.b[0]) / 2 - s.pos[0]) * gd[0] + ((p.a[1] + p.b[1]) / 2 - s.pos[1]) * gd[1]));
  const perches = [...towers.slice(0, 3), ...walls.filter((_, i) => i % 2 === 0)];
  for (const sq of shooters) {
    const st = perches.shift();
    if (st) {
      const m = st.pos || [(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2];
      placeSquad(world, sq, m[0] + st.inward[0] * 4, m[1] + st.inward[1] * 4, s.gateAng);
      enterGarrison(world, sq, st);
    } else rest.push(sq);
  }
  // the yard: a ring of posts around the courtyard
  rest.forEach((sq, i) => {
    const a = s.gateAng + (i / Math.max(1, rest.length)) * Math.PI * 2;
    const d = Math.min(s.r * 0.42, 10 + rest.length * 1.2);
    const x = s.point[0] + Math.sin(a) * d * 0.7, z = s.point[1] + Math.cos(a) * d * 0.7;
    placeSquad(world, sq, x, z, s.gateAng);
    sq.post = [sq.lx, sq.lz]; sq.home = sq.post;
    if (!sq.def.ranged && !sq.def.heal) sq.stance = 'aggressive';
  });
}

// a squad from a Long War army: its persistent id, its men and its veterancy come with it
function realmSquad(world, team, r) {
  const sq = createSquad(world, team, r.type, { men: Math.max(1, r.men), xp: r.xp || 0, vet: Math.min(3, Math.floor((r.xp || 0) / 100)) });
  sq.realmId = r.id; sq.menMax = Math.max(sq.menMax, r.max || sq.menMax);
  return sq;
}
function garrisonRealm(world, s, list) {
  const team = s.owner;
  const shooters = [], rest = [];
  for (const r of list) { const sq = realmSquad(world, team, r); sq.settle = s.id; sq.role = 'garrison'; (sq.def.ranged && !sq.def.engine ? shooters : rest).push(sq); }
  const perches = s.structIds.map((id) => world.structures.get(id)).filter((st) => st && (st.kind === 'tower' || st.type === 'stoneWall'));
  for (const sq of shooters) {
    const st = perches.shift();
    if (st) { const m = st.pos || [(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2]; placeSquad(world, sq, m[0] + st.inward[0] * 4, m[1] + st.inward[1] * 4, s.gateAng); enterGarrison(world, sq, st); }
    else rest.push(sq);
  }
  rest.forEach((sq, i) => {
    const a = s.gateAng + (i / Math.max(1, rest.length)) * Math.PI * 2, d = Math.min(s.r * 0.42, 10 + rest.length * 1.2);
    placeSquad(world, sq, s.point[0] + Math.sin(a) * d * 0.7, s.point[1] + Math.cos(a) * d * 0.7, s.gateAng);
    sq.post = [sq.lx, sq.lz]; sq.home = sq.post;
  });
}

// a rival's first field army, drawn up outside its capital's gate
function fieldArmy(world, team, cap, units) {
  const gd = [Math.sin(cap.gateDir), Math.cos(cap.gateDir)], pp = [-gd[1], gd[0]];
  const ids = [];
  units.forEach((u, i) => {
    const sq = typeof u === 'string' ? createSquad(world, team, u, {}) : realmSquad(world, team, u);
    const row = sq.def.ranged || sq.def.heal ? 1 : sq.def.tags.includes('cavalry') ? 2 : 0;
    const k = i - units.length / 2;
    const d = cap.r + 34 + row * 12;
    placeSquad(world, sq, cap.pos[0] + gd[0] * d + pp[0] * k * 9, cap.pos[1] + gd[1] * d + pp[1] * k * 9, cap.gateAng);
    sq.post = [sq.lx, sq.lz]; sq.home = sq.post;
    ids.push(sq.id);
  });
  const c = createSquad(world, team, 'commander', { name: (world.war.factions[team].general || (world.war.factions[team].short || 'Enemy') + ' Captain') });
  placeSquad(world, c, cap.pos[0] + gd[0] * (cap.r + 20), cap.pos[1] + gd[1] * (cap.r + 20), cap.gateAng);
  ids.push(c.id);
  world.ai.fac[team].muster.push(...ids);
}

// ------------------------------------------------------------------ the war step
export function warStep(world, dt = C.DT) {
  world.tick++;
  const PF = world._prof; let pt = PF ? performance.now() : 0;
  const lap = PF ? (k) => { const n = performance.now(); PF[k] = (PF[k] || 0) + n - pt; PF.max = PF.max || {}; if (n - pt > (PF.max[k] || 0)) PF.max[k] = n - pt; pt = n; } : null;
  if (world.tick % 5 === 0) updateVision(world);
  if (world.phase === 'prepare') {
    rebuildHash(world);
    for (const sq of world.squads.values()) { if (!sq.deployed) continue; updateSquad(world, sq, dt); updateSoldiers(world, sq, dt); }
    return;
  }
  world.t += dt;
  const live = world.phase === 'battle';
  rebuildHash(world);
  if (live) warAI(world);
  if (lap) lap('ai');
  for (const sq of world.squads.values()) updateSquad(world, sq, dt);
  if (lap) lap('squads');
  // sim LOD (DESIGN.md 16.1): a squad standing still with no enemy within 160 m steps its soldiers
  // a quarter as often (garrisons, mustered hosts, idle militia are most of a war's men)
  if (world.tick % 20 === 0) markQuiet(world);
  for (const sq of world.squads.values()) {
    if (sq.quiet) { if ((world.tick + sq.qPhase) % 4) continue; updateSoldiers(world, sq, dt * 4); }
    else updateSoldiers(world, sq, dt);
  }
  if (lap) lap('soldiers');
  updateProjectiles(world, dt);
  if (lap) lap('projectiles');
  updateStructures(world, dt);
  if (lap) lap('structures');
  if (world._oil && world._oil.length) {
    for (const o of world._oil) forNear(world, o.x, o.z, 5, (so) => { if (so.alive && hostile(world, o.team, so.sq.team) && (so.x - o.x) ** 2 + (so.z - o.z) ** 2 < 16) { applyDamage(world, null, so, 60, { ranged: true, splash: true, kind: 'oil', fromX: o.x, fromZ: o.z, quiet: true }); so.burnT = world.t + 2; } });
    world._oil.length = 0;
  }
  updateHealing(world, dt);
  updateMorale(world, dt);
  updateRecruits(world, dt);
  if (lap) lap('heal_morale_recruit');
  if (live && world.tick % 20 === 0) {
    updateRegions(world);
    if (lap) lap('regions');
    updateSettlements(world);
    if (lap) lap('settlements');
    updateCastleHealing(world);
    updateSieges(world);
    if (lap) lap('castles_sieges');
    checkWarVictory(world);
    if (lap) lap('victory');
  }
  if (live && world.tick % 200 === 100) economyTick(world);
  if (live && world.tick % 20 === 10) updateDiplomacy(world);
  if (lap) lap('econ_dip');
  if (world.tick % 100 === 0) {
    const keep = world.soldiers.filter((s) => s.alive || world.t - s.deadT < C.BODY_TIME + 6);
    if (keep.length !== world.soldiers.length) world.soldiers = keep;
    // squads that are gone for good leave the books
    for (const [id, sq] of world.squads) if ((sq.state === 'gone' || (sq.alive <= 0 && world.t - (sq.deadAt || (sq.deadAt = world.t)) > 40)) && sq.type !== 'king') {
      if (sq.alive <= 0 && !sq.soldiers.some((so) => !so.alive && world.t - so.deadT < C.BODY_TIME + 6)) world.squads.delete(id);
      else if (sq.state === 'gone') world.squads.delete(id);
    }
  }
  if (lap) lap('cleanup');
}

function markQuiet(world) {
  const G = squadGrid(world);
  for (const sq of world.squads.values()) {
    sq.qPhase = sq.qPhase ?? (sq.soldiers.length ? sq.soldiers[0].id % 4 : 0);
    let q = sq.deployed && sq.alive > 0 && sq.state === 'steady' && !sq.inContact && !sq.path && !sq.order && sq.mode === 'idle' && !sq.def.engine && !sq.structTarget && !sq.building && !sq.garrisonPending;
    if (q) {
      const R = 160;
      const i0 = Math.max(0, Math.floor((sq.cx - R) / G.cs)), i1 = Math.min(G.W - 1, Math.floor((sq.cx + R) / G.cs));
      const j0 = Math.max(0, Math.floor((sq.cz - R) / G.cs)), j1 = Math.min(G.W - 1, Math.floor((sq.cz + R) / G.cs));
      outer: for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const cell = G.map.get(j * G.W + i); if (!cell) continue;
        for (const e of cell) if (e.alive > 0 && hostile(world, sq.team, e.team) && Math.hypot(e.cx - sq.cx, e.cz - sq.cz) < R) { q = false; break outer; }
      }
    }
    sq.quiet = q;
  }
}

export function startWar(world) {
  if (world.phase !== 'prepare') return false;
  world.phase = 'battle';
  world.t = 0;
  for (const s of Object.keys(world.undo)) world.undo[s] = [];
  world.events.push({ type: 'battleStart' });
  for (const s of world.squads.values()) if (s.deployed) { s.post = s.post || [s.lx, s.lz]; s.home = s.home || [s.lx, s.lz]; s.startMen = s.alive; }
  world.war.startedAt = world.t;
  return true;
}

// ------------------------------------------------------------------ settlements
function soldiersNear(world, x, z, r) {
  const by = new Map();
  forNear(world, x, z, r, (so) => {
    if (!so.alive || so.sq.state === 'routing' || so.sq.def.engine) return;
    if ((so.x - x) ** 2 + (so.z - z) ** 2 > r * r) return;
    by.set(so.sq.team, (by.get(so.sq.team) || 0) + 1);
  });
  return by;
}

export function updateSettlements(world) {
  const W = world.war;
  for (const s of W.settlements) {
    if (s.state === 'razed') continue;
    if (s.state === 'ravaged' && world.t > s.ravagedUntil) { s.state = 'free'; if (s.owner >= 0 && s.owner < NEUTRAL) { s.state = 'taxed'; s.taxedBy = s.owner; } }
    // a built keep knocked down: the seat is razed
    if (s.keepId) { const k = world.structures.get(s.keepId); if (!k || !k.alive) { razeSettlement(world, s); continue; } }
    // a pending choice (yours) is lost when an enemy stands on the square before you pick
    if (s.pending || s.pendingFort) {
      const g = soldiersNear(world, s.point[0], s.point[1], s.capR + 10);
      let foe = false; for (const [t, c] of g) if (c > 2 && hostile(world, 0, t)) foe = true;
      if (foe) {
        s.pending = false; s.capT = 0; s.capTeam = -1;
        if (s.pendingFort) s.pendingFort = false;
        W.choices = W.choices.filter((c) => c.id !== s.id);
        world.events.push({ type: 'choiceLost', settle: s.id });
        alert(world, 0, 'The enemy is back in ' + s.name + ': the chance to choose is lost.', s.point, 'bad');
      }
      continue;
    }
    // a protected village sends its lord a free militia squad every 4 minutes (two at most)
    if (s.kind === 'village' && s.state === 'taxed' && s.taxedBy >= 0 && s.taxedBy < NEUTRAL && world.t - (s.giftT ?? (s.giftT = world.t)) > 240) {
      s.giftT = world.t;
      let have = 0; for (const q of world.squads.values()) if (q.giftOf === s.id && q.alive > 0 && q.state !== 'gone') have++;
      if (have < 2) {
        const q = createSquad(world, s.taxedBy, 'militia', { name: s.name + ' Levy' });
        placeSquad(world, q, s.pos[0] + 6, s.pos[1] + 6, 0);
        q.post = [q.lx, q.lz]; q.home = q.post; q.giftOf = s.id; q.startMen = q.alive; q.free = true;
        world.events.push({ type: 'recruited', sq: q.id, team: s.taxedBy, at: s.id, x: q.lx, z: q.lz });
        if (s.taxedBy === 0) alert(world, 0, s.name + ' sends a levy of militia to your banner.', s.pos, 'good');
      }
    }
    const near = soldiersNear(world, s.point[0], s.point[1], s.capR);
    // the defenders: the owner's men anywhere close, or a village's militia
    const guard = soldiersNear(world, s.point[0], s.point[1], s.capR + (s.kind === 'village' ? 22 : 14));
    let taker = -1, n = 0;
    for (const [t, c] of near) {
      if (t >= NEUTRAL || t === s.owner) continue;
      if (c > n) { n = c; taker = t; }
    }
    // contested: anyone hostile to the taker is still standing there
    let blocked = taker < 0;
    if (!blocked) for (const [t, c] of guard) if (c > 0 && t !== taker && hostile(world, taker, t)) { blocked = true; break; }
    if (blocked) {
      if (s.capT > 0) { s.capT = Math.max(0, s.capT - (taker < 0 ? 2 : 0.5)); if (s.capT === 0) s.capTeam = -1; }
      s.contested = taker >= 0;
      continue;
    }
    s.contested = false;
    if (s.capTeam !== taker) { s.capTeam = taker; s.capT = 0; if (s.owner >= 0 && s.owner < NEUTRAL) alert(world, s.owner, (s.kind === 'village' ? s.name : s.name) + ' is under attack!', s.point, 'bad'); }
    s.capT += 1;
    if (s.capT >= s.need) takeSettlement(world, s, taker);
  }
}

export function takeSettlement(world, s, team, choice) {
  const W = world.war;
  const old = s.owner;
  s.capT = 0; s.capTeam = -1;
  // somebody else took it while your choice was waiting
  if (team !== 0 && (s.pending || s.pendingFort)) { s.pending = false; s.pendingFort = false; W.choices = W.choices.filter((c) => c.id !== s.id); }
  const T = world.teams[team];
  const R = W.regions[s.region];
  const F = W.factions[team];
  if (s.kind === 'village') {
    // pillage or tax: the player is asked; the AI picks by personality
    if (!choice) {
      if (team === 0 && !world.botPlayer && !world.autoChoice) { W.choices.push({ id: s.id, kind: 'village', t: world.t }); s.capT = s.need; s.pending = true; world.events.push({ type: 'choice', settle: s.id, kind: 'village' }); return; }
      const P = PERSONALITY[F.personality] || { pillage: team === 0 ? 0.3 : 0.4 };
      choice = world.rng() < P.pillage ? 'pillage' : 'tax';
    }
    s.pending = false;
    W.choices = W.choices.filter((c) => c.id !== s.id);
    if (choice === 'pillage') {
      const gold = s.state === 'ravaged' ? 0 : s.loot;
      T.gold += gold; T.earned += gold; T.looted += gold;
      s.state = 'ravaged'; s.ravagedUntil = world.t + 480; s.taxedBy = -1; s.burnT = world.t;
      world.events.push({ type: 'loot', x: s.pos[0], z: s.pos[1], gold, team, kind: 'pillage', settle: s.id });
      alert(world, team, `${s.name} pillaged: +${gold.toLocaleString()} g`, s.pos, 'good');
      // fear spreads: villages within 900 m pay a quarter less for five minutes
      for (const o of W.settlements) if (o !== s && o.kind === 'village' && Math.hypot(o.pos[0] - s.pos[0], o.pos[1] - s.pos[1]) < 900) o.fearUntil = world.t + 300;
      if (world.dip) world.dip.onPillage(world, team, old, s);
      if (old >= 0 && old < NEUTRAL && old !== team) alert(world, old, `${F.short} pillaged ${s.name}!`, s.pos, 'bad');
    } else {
      s.state = 'taxed'; s.taxedBy = team;
      world.events.push({ type: 'loot', x: s.pos[0], z: s.pos[1], gold: 0, team, kind: 'tax', settle: s.id });
      alert(world, team, `${s.name} pays you tax: +${s.tax} g/min`, s.pos, 'good');
    }
    s.owner = team;
    if (R) setOwner(world, R, team, choice);
    return;
  }
  // strongholds, castles and capitals: the treasury or the vault, then it is yours
  // (a raided fort can then be BURNED for 15% more, or HELD: the player is asked)
  if (s.kind === 'stronghold' && !choice) {
    if (team === 0 && !world.botPlayer && !world.autoChoice) { s.pendingFort = true; W.choices.push({ id: s.id, kind: 'fort', t: world.t }); world.events.push({ type: 'choice', settle: s.id, kind: 'fort' }); }
    else { const P = PERSONALITY[F.personality] || {}; choice = (P.pillage || 0) >= 0.7 || (world.rng() < 0.2 && !ownedSeat(world, team)) ? 'burn' : 'hold'; }
  }
  let gold = s.loot;
  if (s.kind === 'capital' && s.founder === team) gold = 0;          // taking back your own seat
  s.loot = Math.round(s.loot * 0.25);                                  // it can be raided again, for less
  T.gold += gold; T.earned += gold; T.looted += gold;
  s.lootPaid = gold;
  s.owner = team;
  s.state = 'held';
  if (world.dip) world.dip.onCapture(world, team, old, s);
  world.events.push({ type: 'loot', x: s.point[0], z: s.point[1], gold, team, kind: s.kind, settle: s.id });
  for (const id of s.structIds) {
    const st = world.structures.get(id);
    if (!st || !st.alive) continue;
    if (st.garrison) { const g = world.squads.get(st.garrison); if (g && g.team !== team) leaveGarrison(world, g); }
    st.team = team;
  }
  world.structVersion++;
  if (R) {
    setOwner(world, R, team, 'capture');
    if (s.kind !== 'stronghold') for (const nb of R.neighbors) { const Q = W.regions[nb]; if (Q.owner < 0 && !Q.settlement) setOwner(world, Q, team, 'castle'); }
  }
  const what = s.kind === 'stronghold' ? 'raided' : 'taken';
  alert(world, team, `${s.name} ${what}${gold ? ': +' + gold.toLocaleString() + ' g' : ''}`, s.point, 'good');
  if (old >= 0 && old < NEUTRAL) alert(world, old, `${s.name} has fallen to ${F.short}!`, s.point, 'bad');
  world.events.push({ type: 'settlement', settle: s.id, team, old, kind: s.kind });
  // a capital falling ends that kingdom
  // (the player's kingdom only falls when it holds no castle for a minute: checkWarVictory)
  if (s.kind === 'capital' && old > 0 && old < NEUTRAL && s.founder === old) eliminate(world, old, team);
  if (s.kind === 'capital' || s.kind === 'castle') { world.homeFlag[team] = world.homeFlag[team] || s.point; if (old >= 0) world.homeFlag[old] = ownedSeat(world, old)?.point || world.homeFlag[old]; }
  if (choice === 'burn') burnFort(world, s, team);
}

// BURN a raided fort: +15% loot, its walls come down and it is nobody's recruit point any more
function burnFort(world, s, team) {
  const W = world.war;
  const extra = Math.round((s.lootPaid || 12000) * LOOT.burnBonus);
  world.teams[team].gold += extra; world.teams[team].earned += extra; world.teams[team].looted += extra;
  for (const id of s.structIds) {
    const st = world.structures.get(id);
    if (!st || !st.alive) continue;
    if (st.garrison) { const g = world.squads.get(st.garrison); if (g) leaveGarrison(world, g); }
    st.hp = 0; st.alive = false;
    world.events.push({ type: 'destroyed', id: st.id, kind: st.kind, stype: st.type, a: st.a, b: st.b, pos: st.pos, team: st.team, base: st.base, height: st.height });
  }
  world.structVersion++;
  s.state = 'razed'; s.owner = -1; s.burnedBy = team; s.pendingFort = false; s.burnT = world.t;
  const R = W.regions[s.region]; if (R) { setOwner(world, R, -1, 'burned'); if (R.settlement === s.id) R.settlement = null; }
  world.events.push({ type: 'loot', x: s.pos[0], z: s.pos[1], gold: extra, team, kind: 'burn', settle: s.id });
  world.events.push({ type: 'razed', settle: s.id, team });
  alert(world, team, s.name + ' burns: +' + extra.toLocaleString() + ' g', s.pos, 'good');
}
export function chooseFort(world, id, choice) {
  const s = world.war.settlements.find((q) => q.id === id);
  if (!s || !s.pendingFort) return false;
  s.pendingFort = false;
  world.war.choices = world.war.choices.filter((c) => c.id !== s.id);
  if (choice === 'burn') burnFort(world, s, 0);
  else alert(world, 0, s.name + ' is yours: a forward fort that recruits and heals.', s.pos, 'good');
  return true;
}

// a keep somebody built was knocked down: the seat is razed and its land goes wild
function razeSettlement(world, s) {
  const W = world.war;
  const old = s.owner;
  // the sackers: whoever stands nearest the ruins
  let by = -1, bd = 160;
  for (const q of world.squads.values()) {
    if (!q.deployed || q.alive <= 0 || q.team >= NEUTRAL || q.team === old) continue;
    const d = Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]);
    if (d < bd) { bd = d; by = q.team; }
  }
  s.state = 'razed'; s.owner = -1; s.burnT = world.t;
  for (const id of s.structIds) { const st = world.structures.get(id); if (st && st.alive && st.id !== s.keepId) st.team = WILD; }
  world.structVersion++;
  const R = W.regions[s.region]; if (R) { setOwner(world, R, -1, 'razed'); if (R.settlement === s.id) R.settlement = null; }
  if (by >= 0) {
    const g = s.kind === 'castle' ? LOOT.outpostRaze * 3 : LOOT.outpostRaze;
    world.teams[by].gold += g; world.teams[by].earned += g; world.teams[by].looted += g;
    world.events.push({ type: 'loot', x: s.pos[0], z: s.pos[1], gold: g, team: by, kind: 'raze', settle: s.id });
  }
  world.events.push({ type: 'razed', settle: s.id, team: by });
  alert(world, -1, s.name + ' is razed' + (by >= 0 ? ' by ' + W.factions[by].short : '') + '.', s.pos, old === 0 ? 'bad' : by === 0 ? 'good' : 'info');
}

// builders finished a keep: a new seat (DESIGN.md 6.3). Outposts recruit light troops, heal and
// rally; a Castle Keep is a full castle that claims the wild land around it.
export function foundSettlement(world, team, type, pos, keepId) {
  const W = world.war;
  const kind = BUILD_TYPES[type].seat;
  const rid = regionAt(world, pos[0], pos[1]);
  const R = rid >= 0 ? W.regions[rid] : null;
  // the gate (and the rally side) faces the nearest hostile seat
  let tgt = [W.size / 2, W.size / 2], bd = Infinity;
  for (const o of W.settlements) if (o.kind !== 'village' && o.owner >= 0 && o.owner < NEUTRAL && o.owner !== team) { const d = Math.hypot(o.pos[0] - pos[0], o.pos[1] - pos[1]); if (d < bd) { bd = d; tgt = o.pos; } }
  const gateDir = Math.atan2(tgt[0] - pos[0], tgt[1] - pos[1]);
  W.seq = (W.seq || 0) + 1;
  const base = R && R.name ? R.name : 'New';
  const s = makeSettlement(world, { id: (kind === 'castle' ? 'K' : 'O') + W.seq, kind: 'outpost', name: base + (kind === 'castle' ? ' Castle' : ' Keep'), pos: pos.slice(), r: kind === 'castle' ? 40 : 26, tier: kind === 'castle' ? 2 : 1, region: rid, faction: team, gateDir });
  s.kind = kind;
  s.keepPos = pos.slice(); s.keepId = keepId; s.built = true; s.builtT = world.t;
  s.point = [pos[0] + Math.sin(gateDir) * 14, pos[1] + Math.cos(gateDir) * 14];
  s.capR = kind === 'castle' ? 12 : 10; s.need = kind === 'castle' ? 30 : 20;
  s.loot = kind === 'castle' ? 15000 : 4000;
  s.structIds = [keepId];
  s.wallR = 12;
  W.settlements.push(s);
  if (R) {
    // a keep beside a village you hold leaves the village the region's settlement
    if (!R.settlement || (W.settlements.find((q) => q.id === R.settlement) || {}).state === 'razed') { R.settlement = s.id; R.kind = kind; }
    s.ownRegion = R.settlement === s.id;
    setOwner(world, R, team, 'found');
    if (kind === 'castle') for (const nb of R.neighbors) { const Q = W.regions[nb]; if (Q.owner < 0 && !Q.settlement) setOwner(world, Q, team, 'castle'); }
  }
  world.homeFlag[team] = world.homeFlag[team] || s.point;
  world.events.push({ type: 'founded', settle: s.id, team, kind, x: pos[0], z: pos[1] });
  alert(world, team, (kind === 'castle' ? 'A new castle: ' : 'A new outpost: ') + s.name + '. It recruits, heals and rallies.', s.pos, 'good');
  if (team !== 0 && W.factions[team]) alert(world, 0, W.factions[team].short + ' raises ' + s.name + '.', s.pos, 'info');
  updateSupply(world);
  return s;
}

export function chooseVillage(world, id, choice) {
  const s = world.war.settlements.find((q) => q.id === id);
  if (!s || !s.pending) return false;
  takeSettlement(world, s, 0, choice);
  return true;
}

function eliminate(world, team, by) {
  const W = world.war, F = W.factions[team];
  if (!F.alive) return;
  F.alive = false; F.fellT = world.t; F.fellTo = by;
  world.events.push({ type: 'eliminated', team, by, name: F.name });
  alert(world, -1, `${F.name} has fallen!`, null, team === 0 ? 'bad' : 'good');
  // the army breaks; its forts are left to whoever comes for them
  for (const sq of world.squads.values()) if (sq.team === team && sq.alive > 0 && sq.deployed) { sq.leaving = true; sq.routs = 2; startRout(world, sq); }
  for (const s of W.settlements) if (s.owner === team) { s.owner = -1; s.state = 'abandoned'; const R = W.regions[s.region]; if (R) setOwner(world, R, -1, 'abandoned'); for (const id of s.structIds) { const st = world.structures.get(id); if (st) st.team = WILD; } }
  for (const R of W.regions) if (R.owner === team) setOwner(world, R, -1, 'abandoned');
  world.structVersion++;
}

// a beaten kingdom CAPITULATES (DESIGN.md 20.4 "Demand surrender"): its castles, forts, villages
// and land go to the victor with their walls intact, its men lay down their arms (squads disband,
// the victor takes half their worth as spoils) and its treasury is the victor's
export function capitulate(world, team, victor, why = 'surrender') {
  const W = world.war, F = W.factions[team];
  if (!F.alive || !W.factions[victor] || !W.factions[victor].alive) return false;
  F.alive = false; F.fellT = world.t; F.fellTo = victor; F.surrendered = true;
  let spoils = Math.max(0, Math.round(world.teams[team].gold));
  for (const sq of world.squads.values()) {
    if (sq.team !== team || sq.alive <= 0 || sq.state === 'gone') continue;
    spoils += Math.round((sq.def.cost || 0) * 0.5 * sq.alive / Math.max(1, sq.def.men));
    if (sq.garrison) leaveGarrison(world, sq);
    sq.state = 'gone'; sq.deployed = false;
    for (const so of sq.soldiers) if (so.alive) { so.alive = false; so.fled = true; so.deadT = -999; }
  }
  world.teams[team].gold = 0;
  world.teams[victor].gold += spoils; world.teams[victor].earned += spoils; world.teams[victor].looted = (world.teams[victor].looted || 0) + spoils;
  for (const s of W.settlements) {
    if (s.owner !== team && !(s.kind === 'village' && s.taxedBy === team)) continue;
    s.owner = victor; s.capT = 0; s.capTeam = -1; s.siegeT = 0;
    if (s.kind === 'village') { if (s.state === 'taxed') s.taxedBy = victor; }
    else s.state = 'held';
    for (const id of s.structIds) { const st = world.structures.get(id); if (st) st.team = victor; }
  }
  for (const R of W.regions) if (R.owner === team) setOwner(world, R, victor, 'surrender');
  world.structVersion++;
  world.events.push({ type: 'eliminated', team, by: victor, name: F.name, surrender: true });
  world.events.push({ type: 'loot', x: 0, z: 0, gold: spoils, team: victor, kind: 'surrender' });
  alert(world, -1, `${F.leader} surrenders to ${W.factions[victor].short}! ${F.short}'s castles and land are ${victor === 0 ? 'yours' : 'theirs'}${victor === 0 ? ' (+' + spoils.toLocaleString() + ' g)' : ''}.`, null, victor === 0 ? 'good' : team === 0 ? 'bad' : 'info');
  if (why) W.lastSurrender = { team, victor, t: world.t, why };
  return true;
}

export function ownedSeat(world, team) {
  const W = world.war;
  return W.settlements.find((s) => s.owner === team && s.kind === 'capital') || W.settlements.find((s) => s.owner === team && s.kind === 'castle') || W.settlements.find((s) => s.owner === team && s.kind === 'outpost') || W.settlements.find((s) => s.owner === team && s.kind === 'stronghold');
}

// castles, outposts and forts heal and rally their own men, castles refill depleted squads (one
// man every 2 s for 60% of his share of the squad's price) and every seat hands out arrows to the
// shooters standing near it (+1 per man every 2 s) (DESIGN.md 5.4, LIAM_BRIEF item 6)
function updateCastleHealing(world) {
  const refill = world.tick % 40 === 0;
  for (const s of world.war.settlements) {
    if (s.kind === 'village' || s.owner < 0 || s.owner >= NEUTRAL || s.state === 'razed') continue;
    const [R, hps] = HEAL[s.kind] || [40, 1];
    if (refill && s.kind !== 'stronghold') {
      const T = world.teams[s.owner];
      for (const sq of world.squads.values()) {
        if (sq.team !== s.owner || sq.alive <= 0 || sq.alive >= sq.def.men || sq.def.engine || sq.state === 'routing' || sq.type === 'commander' || sq.type === 'king') continue;
        if (world.t - sq.lastContactT < 8 || Math.hypot(sq.cx - s.pos[0], sq.cz - s.pos[1]) > R) continue;
        const price = Math.round(sq.def.cost / sq.def.men * 0.6);
        if (T.gold < price || T.bankrupt) break;
        T.gold -= price; T.spent += price;
        addSoldier(world, sq);
      }
    }
    forNear(world, s.pos[0], s.pos[1], R, (so) => {
      if (!so.alive || so.sq.team !== s.owner) return;
      if (refill && so.ammo !== undefined) { const mx = world.defs[s.owner][so.sq.type].ammo || 0; if (so.ammo < mx) so.ammo++; }
      if (so.hp >= so.maxHp || world.t - so.hitT < 4) return;
      so.hp = Math.min(so.maxHp, so.hp + hps);
    });
  }
}

// ------------------------------------------------------------------ sieges (DESIGN.md 19.9, in battle)
// A seat ringed by a hostile army much bigger than its garrison is UNDER SIEGE. After two minutes
// the larder runs low: every 15 s each squad inside loses a man to hunger and some heart, and the
// seat can no longer raise troops. Lifting the siege (driving the besiegers off) ends it. This is
// what finally brings stone capitals down in long wars, for the AI kingdoms and for you.
export const SIEGE = { ring: 170, ratio: 1.3, min: 45, starveAfter: 120, every: 10 };
function updateSieges(world) {
  const W = world.war;
  for (const s of W.settlements) {
    if (s.kind === 'village' || s.state === 'razed' || s.owner < 0 || s.owner >= NEUTRAL) { s.siegeT = 0; continue; }
    let out = 0, inn = 0, by = -1, byN = 0;
    const per = new Map();
    for (const q of world.squads.values()) {
      if (!q.deployed || q.alive <= 0 || q.state === 'routing' || q.state === 'gone' || q.def.builder) continue;
      const d = Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]);
      if (q.team === s.owner) { if (d < (s.wallR || s.r) + 30) inn += q.alive; continue; }
      if (q.team >= NEUTRAL || !hostile(world, s.owner, q.team) || d > (s.wallR || s.r) + SIEGE.ring) continue;
      out += q.alive; per.set(q.team, (per.get(q.team) || 0) + q.alive);
    }
    for (const [t, n] of per) if (n > byN) { byN = n; by = t; }
    const was = s.siegeT || 0;
    if (out >= SIEGE.min && out > inn * SIEGE.ratio) {
      s.siegeT = was + 1; s.siegeBy = by;
      if (was === 0) {
        alert(world, s.owner, s.name + ' is besieged!', s.pos, 'bad');
        if (by === 0) alert(world, 0, 'Your army lays siege to ' + s.name + '. Hold the ring and they starve.', s.pos, 'good');
        world.events.push({ type: 'siege', settle: s.id, by, team: s.owner });
      }
      if (s.siegeT === SIEGE.starveAfter) { alert(world, -1, s.name + "'s larder is empty: the garrison starves.", s.pos, s.owner === 0 ? 'bad' : by === 0 ? 'good' : 'info'); }
      if (s.siegeT > SIEGE.starveAfter && s.siegeT % SIEGE.every === 0) {
        for (const q of world.squads.values()) {
          if (q.team !== s.owner || q.alive <= 0 || !q.deployed || q.type === 'king' || q.type === 'commander' || Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]) > (s.wallR || s.r) + 30) continue;
          const so = q.soldiers.find((x) => x.alive);
          if (so) { so.hp = 0; kill(world, so, null); }
          q.morale = Math.max(0, q.morale - 6);
        }
      }
    } else if (was > 0) {
      s.siegeT = Math.max(0, was - 3);
      if (s.siegeT === 0) { alert(world, s.owner, 'The siege of ' + s.name + ' is lifted.', s.pos, 'good'); world.events.push({ type: 'siegeEnd', settle: s.id, team: s.owner }); }
    }
  }
}

// ------------------------------------------------------------------ economy (sim/economy.js)
export { incomeOf, upkeepOf };

// ------------------------------------------------------------------ recruiting at castles
export function bannerCap(world, team) {
  let cap = BANNERS.base;
  for (const s of world.war.settlements) if (s.owner === team && s.state !== 'razed') cap += BANNERS[s.kind] || 0;
  return Math.min(BANNERS.max, cap);
}
export function bannersUsed(world, team) {
  let n = 0;
  for (const s of world.squads.values()) if (s.team === team && s.state !== 'gone' && s.alive > 0 && s.type !== 'commander' && s.type !== 'king' && !s.free) n += s.def.builder ? 0.5 : 1;
  for (const q of world.war.queues[team] || []) n += UNIT_TYPES[q.type].builder ? 0.5 : 1;
  return n;
}
export function canRecruitAt(s, type) {
  if (s.state === 'razed') return false;
  if (s.kind === 'capital' || s.kind === 'castle') return WAR_RECRUITABLE.includes(type);
  if (s.kind === 'outpost' || s.kind === 'stronghold') return OUTPOST_RECRUITABLE.includes(type);
  return false;
}
export function recruit(world, team, settleId, type) {
  const W = world.war;
  const s = W.settlements.find((q) => q.id === settleId);
  if (!s || s.owner !== team) return { error: 'Not your castle' };
  if (!canRecruitAt(s, type)) return { error: 'Cannot raise ' + UNIT_TYPES[type].name.toLowerCase() + ' here' };
  if ((s.siegeT || 0) > SIEGE.starveAfter) return { error: s.name + ' is starving under siege: nobody can be raised there' };
  const cost = world.defs[team][type].cost;
  if (world.teams[team].gold < cost) return { error: 'Not enough gold' };
  if (world.teams[team].bankrupt) return { error: 'The treasury is empty: pay your troops first' };
  const q = (W.queues[team] = W.queues[team] || []);
  if (q.filter((e) => e.at === s.id).length >= 5) return { error: 'The queue is full' };
  if (bannersUsed(world, team) + (UNIT_TYPES[type].builder ? 0.5 : 1) > bannerCap(world, team)) return { error: 'Banner cap reached (' + bannerCap(world, team) + '): take more castles' };
  world.teams[team].gold -= cost; world.teams[team].spent += cost;
  q.push({ type, at: s.id, t: TRAIN[type] || 10, total: TRAIN[type] || 10, cost });
  return { ok: true };
}
function updateRecruits(world, dt) {
  if (world.phase !== 'battle') return;
  const W = world.war;
  for (const team in W.queues) {
    const q = W.queues[team];
    const busy = new Set();
    for (const e of q) {
      if (busy.has(e.at)) continue;     // one at a time per castle
      busy.add(e.at);
      e.t -= dt;
      if (e.t > 0) continue;
      e.done = true;
      const s = W.settlements.find((x) => x.id === e.at);
      if (!s || s.owner !== +team) { world.teams[team].gold += e.cost; continue; }
      const sq = createSquad(world, +team, e.type, {});
      const gd = [Math.sin(s.gateDir), Math.cos(s.gateDir)];
      const out = (s.wallR || s.r * 0.6) + 10;
      const k = (world.rng() - 0.5) * 16;
      const x = s.pos[0] + gd[0] * out - gd[1] * k, z = s.pos[1] + gd[1] * out + gd[0] * k;
      placeSquad(world, sq, x, z, s.gateAng);
      sq.post = [x, z]; sq.home = sq.post; sq.startMen = sq.alive; sq.raisedAt = s.id;
      if (s.rally) issue(world, +team, [sq.id], { type: 'move', to: s.rally });
      world.events.push({ type: 'recruited', sq: sq.id, team: +team, at: s.id, x, z });
      if (+team === 0) alert(world, 0, `${sq.name} are ready at ${s.name}`, [x, z], 'good');
    }
    W.queues[team] = q.filter((e) => !e.done);
  }
}

// ------------------------------------------------------------------ victory
function checkWarVictory(world) {
  if (world.result) return;
  const W = world.war;
  const rivals = W.slots.filter((s) => s !== 0);
  const alive = rivals.filter((s) => W.factions[s].alive);
  if (!W.factions[0].alive) return warFinish(world, -1, 'Your kingdom has fallen.');
  // a ruler slain breaks his kingdom (DESIGN.md 5.3)
  for (const s of rivals) {
    if (!W.factions[s].alive) continue;
    const king = [...world.squads.values()].find((q) => q.team === s && q.type === 'king');
    if (king && king.alive <= 0) { const by = king.soldiers[0] && king.soldiers[0].killedBy; eliminate(world, s, by ?? 0); alert(world, -1, W.factions[s].leader + ' is slain!', [king.cx, king.cz], 'good'); }
  }
  if (W.win === 'capital' && alive.length < rivals.length) return warFinish(world, 0, 'A rival capital is yours.');
  if (W.win === 'realm' && W.realm) {
    // a Long War battle: the field army that breaks loses; a seat stormed decides it at once. Men
    // running count half (a rout that rallies is not a lost battle; a broken host is)
    const men = (t) => { let n = 0; for (const q of world.squads.values()) if (q.team === t && q.realmId && q.alive > 0 && q.state !== 'gone') n += q.state === 'routing' ? q.alive * 0.5 : q.alive; return n; };
    const seat = W.settlements.find((s) => s.kind === 'capital' && s.realmSeat && s.realmSeat !== 'camp');
    if (seat && seat.founder !== 0 && seat.owner === 0) return warFinish(world, 0, seat.name + ' is stormed. The province is yours.');
    if (seat && seat.founder === 0 && seat.owner !== 0) return warFinish(world, -1, seat.name + ' has fallen to the enemy.');
    if (!W.factions[1].alive) return warFinish(world, 0, W.factions[1].short + ' yields the field.');
    const m0 = men(0), m1 = men(1), s0 = W.realm.start[0] || 1, s1 = W.realm.start[1] || 1;
    if (world.t > 30 && m1 <= s1 * 0.25) return warFinish(world, 0, 'The enemy host is broken.');
    if (world.t > 30 && m0 <= s0 * 0.25) return warFinish(world, -1, 'Your host is broken.');
    // the second nightfall: both armies withdraw to camp (DESIGN.md 19.7)
    if (world.t >= (W.realm.maxT || 1800)) return warFinish(world, m0 / s0 >= m1 / s1 ? 0 : -1, 'Night falls on the second day. The field goes to whoever kept more of their host.');
  }
  if (W.win === 'main' && W.main && !W.factions[W.main].alive) {
    const F = W.factions[W.main];
    // it fell to another rival: that rival takes its castles and becomes the enemy to beat
    if (F.fellTo > 0 && F.fellTo < NEUTRAL && W.factions[F.fellTo].alive && alive.length) {
      W.main = F.fellTo;
      W.mainSeats = W.settlements.filter((s) => s.owner === W.main && s.kind !== 'village').map((s) => s.id);
      alert(world, 0, `${F.short} has fallen to ${W.factions[W.main].short}. ${W.factions[W.main].short} is now the enemy to beat.`, null, 'bad');
    } else return warFinish(world, 0, `${F.name} has fallen. The war is won.`);
  }
  if (!alive.length) return warFinish(world, 0, 'Every rival kingdom has fallen. The realm is yours.');
  // defeat: no castle or stronghold for 60 s
  const seat = ownedSeat(world, 0);
  if (!seat) {
    if (W.defeatT === null) { W.defeatT = world.t; alert(world, 0, 'You hold no castle! Retake one within 60 s.', null, 'bad'); }
    else if (world.t - W.defeatT >= 60) { W.factions[0].alive = false; return warFinish(world, -1, 'You held no castle for a whole minute.'); }
  } else W.defeatT = null;
  // the Marshal can fall: he is carried home and returns (DESIGN.md 8.5)
}

export function warFinish(world, winner, reason) {
  let men = 0, lost = 0, kills = 0;
  for (const s of world.squads.values()) if (s.team === 0 && s.type !== 'commander') { men += s.startMen || s.menMax; lost += s.lost; kills += s.kills; }
  const W = world.war;
  world.result = {
    winner, reason, time: world.t, mode: 'war', stars: [winner === 0, false, false], nStars: winner === 0 ? 1 : 0, reward: 0,
    stats: { men, lost, kills, regions: regionsOf(world, 0), totalRegions: W.regions.filter((R) => R.cells).length, earned: world.teams[0].earned, looted: world.teams[0].looted, gold: world.teams[0].gold, taken: W.settlements.filter((s) => s.owner === 0 && s.founder !== 0).length },
    fallen: W.slots.filter((s) => !W.factions[s].alive).map((s) => W.factions[s].name),
  };
  world.phase = 'over';
  world.events.push({ type: 'over', winner });
  return world.result;
}

export function alert(world, team, text, pos, tone) {
  const a = { team, text, pos: pos ? [pos[0], pos[1]] : null, tone: tone || 'info', t: world.t };
  world.war.alerts.push(a);
  if (world.war.alerts.length > 60) world.war.alerts.shift();
  world.events.push({ type: 'alert', ...a });
}

// ------------------------------------------------------------------ the bot founds a kingdom (?phase=war, tests, attract)
export function autoFound(world, team = 0, opts = {}) {
  const W = world.war;
  const home = W.settlements.find((s) => s.owner === team && s.kind === 'capital');
  const T = world.teams[team];
  const start = T.gold;
  // a palisade ring (or stone if rich) with a gate to the road, towers, a trench across the approach
  const rich = start >= 70000;
  const keep = T.gold;
  const ringR = home.r - 8;
  const gd = [Math.sin(home.gateDir), Math.cos(home.gateDir)], pp = [-gd[1], gd[0]];
  const n = 14, pts = [];
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 - home.gateDir + Math.PI / n + (k / n) * Math.PI * 2; pts.push([home.pos[0] + Math.cos(a) * ringR, home.pos[1] + Math.sin(a) * ringR]); }
  build(world, team, rich ? 'stoneWall' : 'palisade', pts, { anywhere: true });
  build(world, team, rich ? 'stoneGate' : 'gate', [[home.pos[0] + gd[0] * ringR * 0.985, home.pos[1] + gd[1] * ringR * 0.985]], { anywhere: true });
  for (const s of [-1, 1]) for (const f of [0.55, -0.5]) {
    const a = Math.atan2(gd[0], gd[1]) + s * (f > 0 ? 0.55 : 2.2);
    build(world, team, 'tower', [[home.pos[0] + Math.sin(a) * (ringR - 6), home.pos[1] + Math.cos(a) * (ringR - 6)]], { anywhere: true });
  }
  const tp = [];
  for (let u = -40; u <= 40; u += 4) tp.push([home.pos[0] + gd[0] * (ringR + 34) + pp[0] * u, home.pos[1] + gd[1] * (ringR + 34) + pp[1] * u]);
  build(world, team, 'trench', tp.filter((p) => Math.abs((p[0] - home.pos[0]) * pp[0] + (p[1] - home.pos[1]) * pp[1]) > 4), { anywhere: true, enemyDir: gd });
  // an army with what is left, keeping a war chest back
  const reserve = start * 0.25;
  const plan = ['spear', 'archer', 'sword', 'archer', 'spear', 'healer', 'ram', 'archer', 'sword', 'mangonel', 'outrider', 'spear', 'archer', 'xbow', 'sword', 'healer', 'knight', 'spear', 'archer', 'outrider', 'sword', 'archer'];
  const cap = bannerCap(world, team);
  for (const u of plan) {
    if (bannersUsed(world, team) + 1 > cap) break;
    const c = world.defs[team][u].cost;
    if (T.gold - c < reserve) continue;
    const sq = createSquad(world, team, u, { });
    T.gold -= c; T.spent += c; sq.bought = true;
    const i = [...world.squads.values()].filter((q) => q.team === team).length;
    const row = sq.def.ranged || sq.def.heal ? 1 : 0;
    const k = (i % 10) - 5;
    placeSquad(world, sq, home.pos[0] + gd[0] * (ringR + 22 - row * 10) + pp[0] * k * 12, home.pos[1] + gd[1] * (ringR + 22 - row * 10) + pp[1] * k * 12, home.gateAng);
  }
  world.undo[team].length = 0;
  return { spent: start - T.gold, squads: [...world.squads.values()].filter((q) => q.team === team).length };
}

// the player's founding zone: own territory
export function inTerritory(world, team, x, z) { return ownerAt(world, x, z) === team; }

export function warSnapshot(world) {
  const W = world.war;
  return {
    t: Math.round(world.t), phase: world.phase, result: world.result && { winner: world.result.winner, reason: world.result.reason },
    factions: W.slots.map((s) => ({ slot: s, name: W.factions[s].short, alive: W.factions[s].alive, gold: Math.round(world.teams[s].gold), income: world.teams[s].income, regions: regionsOf(world, s), squads: [...world.squads.values()].filter((q) => q.team === s && q.alive > 0 && q.state !== 'gone').length, men: [...world.squads.values()].filter((q) => q.team === s).reduce((a, q) => a + Math.max(0, q.alive), 0) })),
    settlements: W.settlements.map((s) => ({ id: s.id, kind: s.kind, owner: s.owner, state: s.state, capT: s.capT, capTeam: s.capTeam })),
  };
}
export { regionsOf };
