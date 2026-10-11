// BANNERFALL :: sim/world.js - the world object and the fixed 20 Hz step.
// Pure JS: node runs whole battles with this (tools/bot.mjs, tools/balance.mjs).
import { C } from '../data/constants.js';
import { UNIT_TYPES } from '../data/units.js';
import { mulberry32 } from './rng.js';
import { generateMap } from './mapgen.js';
import { rebuildHash, forNear, applyDamage } from './combat.js';
import { updateSquad, updateSoldiers, createSquad, resetSquadIds } from './squads.js';
import { updateProjectiles } from './projectiles.js';
import { updateHealing } from './healing.js';
import { updateMorale } from './morale.js';
import { spawnWaves, aiTick, enemyPrepare, prepareWaves, battleStartAI, fortify } from './ai.js';
import { updateFlag, checkVictory, updateObjectives } from './victory.js';
import { resetStructureIds, updateStructures } from './structures.js';

export const BASE_BUILDS = ['trench', 'stakes', 'palisade', 'gate', 'tower', 'stoneWall'];

// the unit table for one team, with its techs applied (sq.def points at these)
export function buildDefs(techs, priceMult = 1) {
  const D = JSON.parse(JSON.stringify(UNIT_TYPES));
  if (priceMult !== 1) for (const k in D) D[k].cost = Math.round(D[k].cost * priceMult);
  const has = (t) => techs.has(t);
  for (const k of ['spear', 'sword', 'sapper', 'builder']) {
    if (has('chainmail')) D[k].armour += 2;
    if (has('plate')) { D[k].armour += 4; D[k].speed *= 0.95; }
  }
  if (has('barding')) for (const k of ['outrider', 'knight', 'commander']) D[k].hp += 40;
  if (has('lances')) D.knight.impact = 70;
  if (has('longbows')) D.archer.ranged.range += 15;
  if (has('bodkin')) D.archer.ranged.pierce = 0.3;
  if (has('fireArrows')) D.archer.ability = 'fireArrows';
  if (has('shieldWall')) D.sword.ability = 'shieldWall';
  if (has('pavise')) D.xbow.ability = 'pavise';
  if (has('abbey')) D.healer.cost = Math.round(D.healer.cost * 0.75);
  if (has('hymns')) D.healer.heal.radius += 6;
  return D;
}

export function createWorld(def0, opts = {}) {
  resetSquadIds(); resetStructureIds();
  const mode = opts.mode || def0.type;
  const zones = { ...def0.zones };
  zones.flag = mode === 'defend' ? zones.pflag : mode === 'attack' ? zones.eflag : (zones.cflag || zones.pflag);
  const def = { ...def0, type: mode, zones, campaignType: def0.type };
  if (opts.deployCap) def.deployCap = opts.deployCap;
  if (opts.timeLimit) def.timeLimit = opts.timeLimit;
  if (mode !== def0.type) {
    // Skirmish played the other way round: generic stars and no stages
    def.stars = mode === 'defend' ? { maxLossPct: 40, objective: 'noEnemyInFlag', objectiveText: 'No enemy reaches ' + zones.flag.name }
      : mode === 'attack' ? { maxLossPct: 45, objective: 'lowLoss', objectiveText: 'Win losing under 30% of your men', lossPct: 30 }
      : { maxLossPct: 45, objective: 'holdHill', objectiveText: 'Your banner stands on ' + zones.flag.name + ' at the end' };
    def.stages = null;
    if (!def.timeLimit || mode === 'attack') def.timeLimit = mode === 'attack' ? 540 : mode === 'field' ? 420 : 360;
  }
  const seed = opts.seed || def.seed;
  const map = opts.flat ? flatMap(def) : generateMap(def);
  const difficulty = opts.difficulty || 'captain';
  const techs = { 0: new Set(opts.tech || []), 1: new Set((def.enemy && def.enemy.tech) || []) };
  if (opts.unlockAll) for (const t of ['chainmail', 'longbows', 'fireArrows', 'shieldWall', 'pavise', 'masonry']) techs[0].add(t);
  const world = {
    def, mode, seed, rng: mulberry32(seed * 7 + 3), difficulty,
    t: 0, tick: 0, phase: 'prepare', paused: false, speed: 1,
    terrain: map.terrain, trees: map.trees, boulders: map.boulders, hedges: map.hedges || [], props: map.props, scenery: map.scenery || [],
    obstacles: [], structures: new Map(), structVersion: 0,
    squads: new Map(), soldiers: [], projectiles: [], projSeq: 0,
    techs, defs: { 0: buildDefs(techs[0]), 1: buildDefs(techs[1]) },
    teams: {
      0: { gold: opts.gold !== undefined ? opts.gold : Math.round(def.levy * (difficulty === 'recruit' ? 1.2 : 1)), spent: 0, lost: 0, healed: 0 },
      1: { gold: 0, spent: 0, lost: 0, healed: 0 },
    },
    teamCount: { 0: {}, 1: {} },
    undo: { 0: [], 1: [] },
    events: [], result: null,
    flag: { hold: 0, mine: 0, theirs: 0, touched: false, owner: mode === 'attack' ? 1 : mode === 'field' ? -1 : 0, horseCrossed: false },
    ai: { spawned: [], waves: [], lastTick: -99, menSpawned: 0, retreat: false, plan: [] },
    unlocked: opts.unlockAll ? null : (opts.unlocked || def.unlockUnits || null),
    builds: opts.unlockAll ? null : (opts.builds || BASE_BUILDS.concat(def.unlockBuilds || [])),
    enemyScale: (opts.enemyScale || 1) * (difficulty === 'recruit' ? 0.8 : difficulty === 'warlord' ? 1.25 : 1),
    mudSpeed: (def.terrain && def.terrain.mudSpeed) || 1,
    homeFlag: { 0: def.zones.pflag.pos, 1: def.zones.eflag.pos },
    stage: 0, timeEnd: def.timeLimit, flagActive: !(def.stages && def.stages.length > 1 && mode === 'attack'),
    objectives: (mode === 'attack' && def.zones.wagons ? def.zones.wagons : []).map((w) => ({ pos: w.pos, r: w.r, hold: 0, taken: false })),
    firstBreachT: 0, kingSlain: false, skirmish: !!opts.skirmish,
  };
  // static obstacles: tree trunks, boulders, buildings, hedges
  for (const t of map.trees) world.obstacles.push({ x: t.x, z: t.z, r: 0.55 * t.s, kind: 'tree' });
  for (const b of map.boulders) world.obstacles.push({ x: b.x, z: b.z, r: b.s * 0.75, kind: 'rock' });
  for (const h of world.hedges) world.obstacles.push({ x: h.x, z: h.z, r: 1.05 * h.s, kind: 'hedge' });
  const OB = { windmill: 4.2, cottage: 3.6, hay: 1.3, tent: 2.2, abbey: 7.5, house: 4.0, keep: 9.5, wagon: 2.0, well: 1.3, cart: 1.6, ruin: 3.0, campfire: 0.8 };
  for (const p of map.props) {
    let r = OB[p.type];
    if (!r) continue;
    if (p.big) r *= 1.4;
    if (p.small) r *= 0.75;
    if (p.type === 'abbey') {
      // a long nave: three circles along it
      for (const k of [-6, 0, 6]) world.obstacles.push({ x: p.pos[0], z: p.pos[1] + k, r: 4.6, kind: 'building' });
      continue;
    }
    world.obstacles.push({ x: p.pos[0], z: p.pos[1], r, kind: 'building' });
  }
  buildObstacleHash(world);
  // the player's army: the campaign roster, or the battle's gifts
  if (opts.roster) {
    for (const r of opts.roster) createSquad(world, 0, r.type, { uid: r.uid, name: r.name, men: r.men, vet: r.vet, xp: r.xp });
    createSquad(world, 0, 'commander', { gift: true });
  } else if (!opts.noGifts) {
    for (const g of def.gift || []) createSquad(world, 0, g, { gift: true });
    createSquad(world, 0, 'commander', { gift: true });
  }
  // walls the player already holds (the abbey)
  if (def.playerFort && mode === 'defend') {
    const before = new Set(world.structures.keys());
    world.teams[0].gold += 1e6;
    fortify(world, 0, def.playerFort, { free: true });
    world.teams[0].gold -= 1e6;
    for (const [id, s] of world.structures) if (!before.has(id)) s.prebuilt = true;
    world.undo[0].length = 0;
  }
  // Varkhal readies itself
  if (!opts.noEnemy) {
    if (mode === 'defend') prepareWaves(world);
    else enemyPrepare(world);
  }
  return world;
}

function flatMap(def) {
  // a flat empty field for balance duels
  const m = generateMap({ ...def, terrain: { base: 0, hills: [], forests: [], rocks: [] }, props: [] });
  m.terrain.h.fill(2); m.terrain.base = m.terrain.h.slice(); m.terrain.mat.fill(0);
  m.trees = []; m.boulders = []; m.hedges = [];
  return m;
}

function buildObstacleHash(world) {
  const cs = 8, W = Math.ceil(world.terrain.size / cs) + 1;
  const cells = Array.from({ length: W * W }, () => []);
  for (const o of world.obstacles) {
    const r = o.r + 1.5;
    for (let j = Math.floor((o.z - r) / cs); j <= Math.floor((o.z + r) / cs); j++)
      for (let i = Math.floor((o.x - r) / cs); i <= Math.floor((o.x + r) / cs); i++)
        if (i >= 0 && j >= 0 && i < W && j < W) cells[j * W + i].push(o);
  }
  const empty = [];
  world.obstacleCells = (x, z) => {
    const i = Math.floor(x / cs), j = Math.floor(z / cs);
    if (i < 0 || j < 0 || i >= W || j >= W) return empty;
    return cells[j * W + i];
  };
}

export function startBattle(world) {
  if (world.phase !== 'prepare') return false;
  // squads left in reserve stay out of this fight
  world.phase = 'battle';
  world.t = 0;
  world.undo = { 0: [], 1: [] };
  world.events.push({ type: 'battleStart' });
  for (const s of world.squads.values()) if (s.deployed) { s.post = [s.lx, s.lz]; s.home = [s.lx, s.lz]; s.startMen = s.alive; }
  battleStartAI(world);
  return true;
}

export function step(world, dt = C.DT) {
  if (world.stepFn) return world.stepFn(world, dt);
  world.tick++;
  if (world.phase === 'prepare') { prepStep(world, dt); return; }
  world.t += dt;
  if (world.phase === 'battle') {
    spawnWaves(world);
    aiTick(world, 1, world.difficulty);
    if (world.botPlayer) aiTick(world, 0, world.difficulty);
  }
  rebuildHash(world);
  for (const sq of world.squads.values()) updateSquad(world, sq, dt);
  for (const sq of world.squads.values()) updateSoldiers(world, sq, dt);
  updateProjectiles(world, dt);
  updateStructures(world, dt);
  if (world._oil && world._oil.length) {
    for (const o of world._oil) forNear(world, o.x, o.z, 5, (so) => { if (so.alive && so.sq.team !== o.team && (so.x - o.x) ** 2 + (so.z - o.z) ** 2 < 16) { applyDamage(world, null, so, 60, { ranged: true, splash: true, kind: 'oil', fromX: o.x, fromZ: o.z, quiet: true }); so.burnT = world.t + 2; } });
    world._oil.length = 0;
  }
  updateHealing(world, dt);
  updateMorale(world, dt);
  if (world.phase === 'battle') {
    updateFlag(world, dt);
    updateObjectives(world, dt);
    checkVictory(world);
  }
  // forget long-dead bodies
  if (world.tick % 100 === 0) {
    const keep = world.soldiers.filter((s) => s.alive || world.t - s.deadT < C.BODY_TIME + 6);
    if (keep.length !== world.soldiers.length) world.soldiers = keep;
  }
}

// prepare: deployed troops shuffle to their slots so drags look alive
function prepStep(world, dt) {
  rebuildHash(world);
  for (const sq of world.squads.values()) {
    if (!sq.deployed) continue;
    updateSquad(world, sq, dt);
    updateSoldiers(world, sq, dt);
  }
}

export function snapshot(world) {
  const sq = [];
  for (const s of world.squads.values()) sq.push({ id: s.id, team: s.team, type: s.type, men: s.alive, max: s.menMax, morale: Math.round(s.moraleEff), state: s.state, pos: [Math.round(s.cx), Math.round(s.cz)], deployed: s.deployed, mode: s.mode, ent: s.entrenched });
  return { phase: world.phase, t: Math.round(world.t * 10) / 10, gold: world.teams[0].gold, flag: world.flag, stage: world.stage, squads: sq, result: world.result };
}
