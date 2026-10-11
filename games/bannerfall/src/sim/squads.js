// BANNERFALL :: sim/squads.js - squads, soldiers, formations, movement and fighting behaviour.
//
// A squad has a virtual LEADER point (lx,lz) and a facing. Formation slots hang off the
// leader; each soldier steers to its slot unless it is fighting. Facing convention:
// facing f means forward = (sin f, cos f), so f = 0 looks north (+z), toward Varkhal.
// Siege engines are one-man squads (the engine is the "soldier"; the crew is drawn around it).
import { C } from '../data/constants.js';
import { UNIT_TYPES } from '../data/units.js';
import { forNear, nearestEnemy, applyDamage, kill } from './combat.js';
import { fire } from './projectiles.js';
import { findPath, straightClear } from './nav.js';
import { structList, structsNear, segClosest, blocks, damageStructure, garrisonSlots } from './structures.js';
import { Heightfield } from './terrain.js';
import { hostile } from './factions.js';
import { updateBuilder } from './construction.js';

// a routing squad in a war runs for its nearest castle or fort (rallies there twice as fast), or
// for the nearest map edge when it has none; shattered squads leave the field
function routeWar(world, sq, dt, speed) {
  if (!sq.routeTo || world.t - sq.routeT > 4) {
    let best = null, bd = Infinity;
    for (const s of world.war.settlements) {
      if (s.owner !== sq.team || s.kind === 'village') continue;
      const d = Math.hypot(s.pos[0] - sq.cx, s.pos[1] - sq.cz);
      if (d < bd) { bd = d; best = s; }
    }
    const S = world.terrain.size;
    if (best && !sq.leaving) sq.routeTo = best.point;
    else {
      const ex = [[sq.cx, -12], [sq.cx, S + 12], [-12, sq.cz], [S + 12, sq.cz]];
      ex.sort((a, b) => Math.hypot(a[0] - sq.cx, a[1] - sq.cz) - Math.hypot(b[0] - sq.cx, b[1] - sq.cz));
      sq.routeTo = ex[0]; sq.toEdge = true;
    }
    sq.routeT = world.t;
    sq.path = findPath(world, sq.team, [sq.cx, sq.cz], [Math.max(2, Math.min(world.terrain.size - 2, sq.routeTo[0])), Math.max(2, Math.min(world.terrain.size - 2, sq.routeTo[1]))]);
    sq.pathI = 0; sq.lx = sq.cx; sq.lz = sq.cz;
  }
  const d = Math.hypot(sq.routeTo[0] - sq.cx, sq.routeTo[1] - sq.cz);
  if (!sq.toEdge && d < 28) { sq.morale = Math.min(100, sq.morale + 3 * dt); sq.calmT += dt; return; }
  followPath(world, sq, dt * 1.6, speed);
  const S = world.terrain.size;
  if (sq.toEdge && (sq.cx < 6 || sq.cz < 6 || sq.cx > S - 6 || sq.cz > S - 6)) {
    sq.state = 'gone'; sq.deployed = false;
    for (const so of sq.soldiers) if (so.alive) { so.alive = false; so.fled = true; so.deadT = -999; }
    world.events.push({ type: 'fled', sq: sq.id, team: sq.team, name: sq.name });
  }
}

let SQ_ID = 1, SO_ID = 1;
export function resetSquadIds() { SQ_ID = 1; SO_ID = 1; }
export const squadIdState = { get: () => [SQ_ID, SO_ID], set: (s) => { SQ_ID = s[0]; SO_ID = s[1]; } };

const ORD = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th', '11th', '12th'];
const PLACE = ['Millbrook', 'Aldmere', 'River', 'Wheatsheaf', 'Ford', 'Mill', 'Ashwood', 'Greywater'];
const EPLACE = ['Varkhal', 'Iron', 'Crimson', 'Black', 'Oswin\'s', 'Border', 'Brannoc', 'Ravenmoor'];

export function createSquad(world, team, type, opts = {}) {
  const def = (world.defs && world.defs[team] && world.defs[team][type]) || UNIT_TYPES[type];
  const count = world.teamCount[team][type] = (world.teamCount[team][type] || 0) + 1;
  const place = (team === 0 ? PLACE : EPLACE)[(count + type.length) % PLACE.length];
  const vet = opts.vet || 0;
  let name = opts.name;
  if (!name) {
    if (type === 'commander') name = team === 0 ? 'The Marshal' : 'Enemy Captain';
    else if (type === 'king') name = 'King Oswin';
    else if (opts.guard) name = `Royal Guard ${def.short}`;
    else name = `${ORD[count - 1] || count + 'th'} ${place} ${def.short}`;
  }
  const men = Math.max(1, Math.min(def.men, opts.men || def.men));
  const sq = {
    id: 'q' + SQ_ID++, uid: opts.uid || null, team, type, def, name,
    vet, xp: opts.xp || 0, xp0: opts.xp || 0,
    menMax: def.men, alive: 0, lost: 0, kills: 0, soldiers: [], startMen: men,
    formation: 'line', stance: defaultStance(type), cols: 0, slots: [],
    morale: C.MORALE_START + 5 * vet, moraleEff: C.MORALE_START, state: 'steady', routs: 0, calmT: 0, leaving: false,
    order: null, queue: [], path: null, pathI: 0, post: null,
    lx: 0, lz: 0, facing: team === 0 ? 0 : Math.PI, wantFacing: team === 0 ? 0 : Math.PI,
    cx: 0, cz: 0, cy: 0, deployed: false, cost: def.cost, gift: !!opts.gift,
    target: null, targetSoldiers: null, engageT: 0, mode: 'idle',
    entrenched: false, stillT: 0, inContact: false, lastContactT: -99, lastHitT: -99, flankHits: 0,
    inAura: false, auraBoost: 1, nearCmd: false, healing: false, healed: 0,
    dmgDealt: 0, dmgTaken: 0, abilityCd: 0, abilityUntil: 0, sanctuaryUntil: 0, volleyUntil: 0, pavise: 0, chargeUntil: 0, cryUntil: 0,
    shieldWall: false, fireArrows: false, garrison: null, garrisonPending: null, garrisonWall: false,
    blockT: 0, blockStruct: null, structTarget: null, skirmishT: 0, repathT: 0, wave: opts.wave, role: opts.role || null,
    digJob: null, bashT: 0,
  };
  for (let i = 0; i < men; i++) {
    const so = {
      id: SO_ID++, sq, idx: i, x: 0, z: 0, y: 0, vx: 0, vz: 0, spd: 0, facing: sq.facing,
      hp: def.hp * (1 + 0.05 * vet), maxHp: def.hp * (1 + 0.05 * vet), alive: true, deadT: 0, downed: 0,
      cd: world.rng() * (def.melee ? def.melee.interval : 1), reload: def.ranged ? def.ranged.reload * (0.3 + world.rng() * 0.7) : 0,
      act: 'idle', actT: 0, hitT: -9, healedT: -9, healT: -9, chargeReady: true, knockUntil: 0, inTrench: false, disordered: false,
      slot: i, phase: world.rng() * 6.28, burnT: 0, healers: 0, healStamp: -1, shotT: -9, swingT: -9, healTarget: null, fallT: 0,
    };
    if (world.war && def.ammo && !def.engine) so.ammo = def.ammo;
    sq.soldiers.push(so);
    world.soldiers.push(so);
  }
  sq.alive = men;
  world.squads.set(sq.id, sq);
  computeSlots(sq);
  return sq;
}

// a fresh recruit joins a depleted squad (castle refill, DESIGN.md 5.4): he walks in from the rear
export function addSoldier(world, sq) {
  const def = sq.def, vet = sq.vet || 0;
  if (sq.alive >= def.men || sq.alive <= 0) return null;
  const so = {
    id: SO_ID++, sq, idx: sq.soldiers.length, x: sq.cx, z: sq.cz, y: sq.cy, vx: 0, vz: 0, spd: 0, facing: sq.facing,
    hp: def.hp * (1 + 0.05 * vet), maxHp: def.hp * (1 + 0.05 * vet), alive: true, deadT: 0, downed: 0,
    cd: world.rng() * (def.melee ? def.melee.interval : 1), reload: def.ranged ? def.ranged.reload : 0,
    act: 'idle', actT: 0, hitT: -9, healedT: -9, healT: -9, chargeReady: true, knockUntil: 0, inTrench: false, disordered: false,
    slot: sq.alive, phase: world.rng() * 6.28, burnT: 0, healers: 0, healStamp: -1, shotT: -9, swingT: -9, healTarget: null, fallT: 0,
  };
  { const bd = world.defs && world.defs[sq.team] ? world.defs[sq.team][sq.type] : def; if (world.war && bd.ammo && !bd.engine) so.ammo = bd.ammo; }
  const f = sq.facing;
  so.x = sq.cx - Math.sin(f) * 4 + (world.rng() - 0.5) * 3; so.z = sq.cz - Math.cos(f) * 4 + (world.rng() - 0.5) * 3;
  so.y = world.terrain.surface(so.x, so.z); so.px = so.x; so.pz = so.z; so.py = so.y;
  // drop the oldest corpse record of this squad so the list does not grow forever
  sq.soldiers.push(so);
  world.soldiers.push(so);
  sq.alive++; sq.lost = Math.max(0, sq.lost - 1); sq.reslot = true;
  return so;
}

export function defaultStance(type) {
  const D = UNIT_TYPES[type];
  if (D && D.ability === 'hitAndRun') return D.ranged && !D.tags.includes('cavalry') ? 'skirmish' : 'aggressive';
  if (D && (D.heal || (D.ranged && !D.engine) || D.aura || D.cover)) return 'hold';
  if (type === 'archer' || type === 'xbow' || type === 'healer' || type === 'commander' || type === 'king' || type === 'mangonel' || type === 'trebuchet') return 'hold';
  return 'aggressive';
}

// ---- formation slots (local: x = right, z = back) ----
export function computeSlots(sq, width) {
  const r = makeSlots(sq, width);
  if (width) sq.cols = r.cols;
  sq.slots = r.slots;
  sq.reslot = false;
  const alive = sq.soldiers.filter((s) => s.alive);
  alive.forEach((s, i) => { s.slot = i; });
}
// pure: the slot layout a squad would take (local: x = lateral, z = back)
export function makeSlots(sq, width, formation = sq.formation) {
  const def = sq.def, n = Math.max(1, sq.alive || def.men);
  const cav = def.tags.includes('cavalry');
  let sp = cav ? 2.4 : 1.35;
  if (formation === 'loose') sp *= 2.2;
  const depth = def.heal ? 1 : cav ? 2 : def.ranks || 2;
  let cols = width ? Math.round(width / sp) : sq.cols || Math.ceil(n / depth);
  cols = Math.max(def.heal ? 1 : 2, Math.min(n, cols));
  const slots = [];
  if (n === 1) slots.push([0, 0]);
  else if (formation === 'wedge' && !def.ranged && n > 2) {
    let row = 0, placed = 0;
    while (placed < n) {
      const inRow = Math.min(n - placed, row * 2 + 1);
      for (let k = 0; k < inRow; k++) slots.push([(k - (inRow - 1) / 2) * sp, row * sp * 0.9]);
      placed += inRow; row++;
    }
  } else if (def.heal) {
    for (let k = 0; k < n; k++) slots.push([(k - (n - 1) / 2) * 2.6, (k % 2) * 1.2]);
  } else {
    const rows = Math.ceil(n / cols);
    let k = 0;
    for (let r = 0; r < rows; r++) {
      const inRow = Math.min(cols, n - k);
      const stagger = r % 2 ? sp * 0.5 * (formation === 'loose' ? 0.5 : 0) : 0;
      for (let c = 0; c < inRow; c++, k++) slots.push([(c - (inRow - 1) / 2) * sp + stagger, r * sp * (cav ? 1.25 : 1.05)]);
    }
  }
  // centre the block on the leader
  let mz = 0; for (const s of slots) mz += s[1]; mz /= slots.length;
  for (const s of slots) s[1] -= mz * 0.35;
  return { slots, cols };
}
export function squadWidth(sq) {
  if (sq.def.engine) return 4;
  if (!sq.slots.length) return 4;
  let a = Infinity, b = -Infinity; for (const s of sq.slots) { a = Math.min(a, s[0]); b = Math.max(b, s[0]); }
  return b - a + 1.4;
}
const ZERO2 = [0, 0];
export function slotWorld(sq, so) {
  const s = sq.slots[so.slot] || [0, 0];
  const f = sq.facing, sn = Math.sin(f), cs = Math.cos(f);
  // right = (cos f, -sin f), forward = (sin f, cos f)
  return [sq.lx + s[0] * cs - s[1] * sn, sq.lz - s[0] * sn - s[1] * cs];
}

export function placeSquad(world, sq, x, z, facing) {
  sq.lx = x; sq.lz = z; sq.facing = facing; sq.wantFacing = facing; sq.post = [x, z];
  computeSlots(sq);
  for (const so of sq.soldiers) {
    if (!so.alive) continue;
    const [px, pz] = slotWorld(sq, so);
    so.x = px; so.z = pz; so.y = world.terrain.surface(px, pz); so.facing = facing; so.vx = so.vz = 0;
    so.px = so.x; so.pz = so.z; so.py = so.y;
  }
  sq.deployed = true;
  sq.order = null; sq.path = null; sq.mode = 'idle';
  updateCentre(world, sq);
}

export function updateCentre(world, sq) {
  let x = 0, z = 0, y = 0, n = 0;
  for (const so of sq.soldiers) if (so.alive) { x += so.x; z += so.z; y += so.y; n++; }
  if (n) { sq.cx = x / n; sq.cz = z / n; sq.cy = y / n; }
}

// ---- orders become paths ----
export function setMoveTarget(world, sq, to, facing) {
  sq.dest = [to[0], to[1]];
  // short hops in the open (chasing, closing in) need no search
  const d = Math.hypot(to[0] - sq.lx, to[1] - sq.lz);
  sq.path = d < 45 && straightClear(world, sq.team, [sq.lx, sq.lz], to) ? [[to[0], to[1]]] : findPath(world, sq.team, [sq.lx, sq.lz], to);
  sq.pathI = 0;
  if (facing !== undefined && facing !== null) sq.wantFacing = facing;
  else sq.wantFacing = Math.atan2(to[0] - sq.lx, to[1] - sq.lz);
}

const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const turn = (a, b, max) => { const d = angDiff(a, b); return a + Math.max(-max, Math.min(max, d)); };

// advance the leader along its path; returns true when it arrived
function followPath(world, sq, dt, speed) {
  if (!sq.path || sq.pathI >= sq.path.length) return true;
  // the leader waits for stragglers
  let lag = 0, n = 0;
  {
    const f = sq.facing, sn = Math.sin(f), cs = Math.cos(f), SL = sq.slots;
    for (const so of sq.soldiers) {
      if (!so.alive) continue;
      const s = SL[so.slot] || ZERO2;
      const dl = Math.hypot(sq.lx + s[0] * cs - s[1] * sn - so.x, sq.lz - s[0] * sn - s[1] * cs - so.z);
      if (dl > 30) continue;          // a man cut off from his squad finds his own way back (updateSoldiers)
      lag += dl; n++;
    }
  }
  lag = n ? lag / n : 0;
  const k = lag > 6 ? 0.15 : lag > 3 ? 0.6 : 1;
  let move = speed * k * dt;
  while (move > 0 && sq.pathI < sq.path.length) {
    const w = sq.path[sq.pathI];
    const dx = w[0] - sq.lx, dz = w[1] - sq.lz, d = Math.hypot(dx, dz);
    if (d < 0.05) { sq.pathI++; continue; }
    const head = Math.atan2(dx, dz);
    sq.facing = turn(sq.facing, head, (sq.def.engine ? 1.2 : 3.2) * dt);
    const step = Math.min(d, move);
    sq.lx += (dx / d) * step; sq.lz += (dz / d) * step;
    move -= step;
    if (step >= d) sq.pathI++;
  }
  return sq.pathI >= sq.path.length;
}

function squadSpeed(world, sq) {
  let v = sq.def.speed;
  if (sq.state === 'wavering') v *= 0.85;
  if (sq.state === 'routing') v *= 1.1;
  if (sq.shieldWall) v *= 0.5;
  if (sq.chargeUntil > 0 && sq.chargeUntil > sq._t) v = 9.5;
  if (sq.cryUntil > sq._t) v *= 1.3;
  return v * (world.mudSpeed || 1);
}

// a point on a structure to shoot at or walk up to
export function structPoint(st, fromX, fromZ) {
  if (st.kind === 'tower' || st.kind === 'caltrops') return { x: st.pos[0], z: st.pos[1], y: st.base + st.height * 0.7 };
  const c = segClosest(st, fromX, fromZ);
  return { x: c.px, z: c.pz, y: st.base + st.height * 0.6 };
}
export function structDist(st, x, z) {
  if (st.kind === 'tower' || st.kind === 'caltrops') return Math.max(0, Math.hypot(x - st.pos[0], z - st.pos[1]) - st.size / 2);
  return Math.max(0, segClosest(st, x, z).d - (st.thick || 0.6) / 2);
}

// ---- the squad brain: targets, modes, leader movement ----
export function updateSquad(world, sq, dt) {
  if (!sq.deployed || sq.alive <= 0 || sq.state === 'gone') return;
  sq._t = world.t;
  if (world.war) ammoState(world, sq);
  if (sq.reslot) computeSlots(sq);
  updateCentre(world, sq);
  const def = sq.def;
  const speed = squadSpeed(world, sq);
  const prevL = [sq.lx, sq.lz];

  if (sq.abilityCd > 0) sq.abilityCd -= dt;

  // routing: run for our own edge
  if (sq.state === 'routing') {
    sq.mode = 'route';
    sq.garrison = leaveGarrison(world, sq);
    if (world.war) { routeWar(world, sq, dt, speed); return; }
    const edgeZ = sq.team === 0 ? -6 : world.terrain.size + 6;
    if (!sq.routePath || world.t - sq.routeT > 4) {
      sq.routePath = findPath(world, sq.team, [sq.cx, sq.cz], [sq.cx, sq.team === 0 ? 2 : world.terrain.size - 2]);
      sq.routeT = world.t; sq.path = sq.routePath; sq.pathI = 0;
      sq.lx = sq.cx; sq.lz = sq.cz;
    }
    followPath(world, sq, dt * 1.6, speed);
    if (Math.abs(sq.cz - edgeZ) < 10 || (sq.team === 0 ? sq.cz < 4 : sq.cz > world.terrain.size - 4)) {
      if (sq.leaving || sq.team === 1 || world.t - sq.lastHitT < 10 || sq.morale < 20) {
        sq.state = 'gone'; sq.deployed = false;
        for (const so of sq.soldiers) if (so.alive) { so.alive = false; so.fled = true; so.deadT = -999; }
        world.events.push({ type: 'fled', sq: sq.id, team: sq.team, name: sq.name });
      }
    }
    return;
  }

  if (def.engine) { updateEngine(world, sq, dt, speed); finishSquad(world, sq, prevL); return; }
  // builders raise blueprints mid-war (sim/construction.js)
  if (def.builder && world.war && world.phase === 'battle' && !sq.garrison) {
    sq.repathT -= dt;
    if (updateBuilder(world, sq, dt, () => followPath(world, sq, dt, speed))) { finishSquad(world, sq, prevL); return; }
    sq.repathT += dt;
  }

  // garrison handling
  if (sq.garrisonPending) {
    const tw = world.structures.get(sq.garrisonPending);
    if (!tw || !tw.alive || tw.garrison) { sq.garrisonPending = null; }
    else if (tw.type === 'palisade') {
      // a palisade is climbed by its stairs
      const stp = structList(world).find((o) => o.alive && o.kind === 'stairs' && o.team === sq.team && Math.hypot(o.pos[0] - sq.lx, o.pos[1] - sq.lz) < 7 && Math.hypot(o.pos[0] - sq.cx, o.pos[1] - sq.cz) < 30 && world.structures.get(o.wallId) && world.structures.get(o.wallId).type === 'palisade');
      if (stp) enterGarrison(world, sq, tw);
    } else if (structDist(tw, sq.cx, sq.cz) < 6) enterGarrison(world, sq, tw);
  }

  // sappers: dig jobs and repairs
  if (sq.digJob) {
    sq.digJob.t += dt;
    sq.mode = 'dig';
    if (sq.digJob.t >= sq.digJob.dur) finishDig(world, sq);
    finishSquad(world, sq, prevL); return;
  }
  if (def.tags.includes('sapper') && world.phase === 'battle' && !sq.inContact && world.tick % 10 === 0) repairNear(world, sq, dt * 10);

  // choose what to fight
  const o = sq.order;
  sq.repathT -= dt;
  if (world.tick % 4 === (sq.id.length + sq.soldiers[0].id) % 4) acquire(world, sq);

  const T = sq.target && sq.target.alive > 0 && sq.target.deployed && sq.target.state !== 'gone' ? sq.target : null;
  if (!T) sq.target = null;
  const ranged = def.ranged;
  let arrived = false;

  if (sq.garrison) {
    sq.mode = T ? 'shoot' : 'idle';
  } else if (sq.structTarget && ranged) {
    // shooters loosing at a wall, gate or tower (fire arrows!)
    const st = world.structures.get(sq.structTarget);
    if (!st || !st.alive) { sq.structTarget = null; sq.mode = 'idle'; }
    else {
      const d = structDist(st, sq.cx, sq.cz);
      const R = ranged.range + (sq.techRange || 0);
      if (d <= R * 0.95) { sq.mode = 'shoot'; const p = structPoint(st, sq.cx, sq.cz); sq.facing = turn(sq.facing, Math.atan2(p.x - sq.lx, p.z - sq.lz), 2.5 * dt); }
      else {
        sq.mode = 'advance';
        if (sq.repathT <= 0) { const p = structPoint(st, sq.cx, sq.cz); const dx = sq.cx - p.x, dz = sq.cz - p.z, l = Math.hypot(dx, dz) || 1; setMoveTarget(world, sq, [p.x + (dx / l) * R * 0.8, p.z + (dz / l) * R * 0.8]); sq.repathT = 2; }
        followPath(world, sq, dt, speed);
      }
    }
  } else if (sq.structTarget) {
    const st = world.structures.get(sq.structTarget);
    if (!st || !st.alive) { sq.structTarget = null; sq.blockT = 0; if (sq.dest && sq.order) setMoveTarget(world, sq, sq.dest, sq.wantFacing); }
    else {
      sq.mode = 'bash';
      const p = structPoint(st, sq.cx, sq.cz);
      const d = Math.hypot(p.x - sq.lx, p.z - sq.lz);
      if (d > 14) {
        // walk up to it first
        if (sq.repathT <= 0 || !sq.path) { setMoveTarget(world, sq, [p.x + (sq.cx - p.x) / (d || 1) * 3, p.z + (sq.cz - p.z) / (d || 1) * 3]); sq.repathT = 2; }
        followPath(world, sq, dt, speed); sq.mode = 'move';
      } else if (d > 1.5) { const k = Math.min(1, (speed * dt) / d); sq.lx += (p.x - sq.lx) * k; sq.lz += (p.z - sq.lz) * k; }
      sq.facing = turn(sq.facing, Math.atan2(p.x - sq.cx, p.z - sq.cz), 3 * dt);
      if (T && Math.hypot(T.cx - sq.cx, T.cz - sq.cz) < 8 && !ranged && !(o && o.type === 'attackStruct')) { sq.structTarget = null; }
    }
  } else if (T && (!o || o.type !== 'move' || o.attackMove) && !(ranged && o && o.type === 'move' && sq.stance === 'hold' && Math.hypot(T.cx - sq.cx, T.cz - sq.cz) > effRange(sq, T) * 0.97)) {
    // (a hold-stance shooter on an attack-move keeps marching until something is in range)
    if (o && o.type === 'move') sq.fought = true;
    const d = Math.hypot(T.cx - sq.cx, T.cz - sq.cz);
    if (ranged) {
      const eff = effRange(sq, T);
      if (d <= eff * 0.97) { sq.mode = 'shoot'; sq.facing = turn(sq.facing, Math.atan2(T.cx - sq.lx, T.cz - sq.lz), 2.5 * dt); }
      else if (sq.stance !== 'hold' || (o && o.type === 'attack')) {
        sq.mode = 'advance';
        if (sq.repathT <= 0) { setMoveTarget(world, sq, towards(sq, T, eff * 0.85)); sq.repathT = 1.5; }
        followPath(world, sq, dt, speed);
      } else sq.mode = 'idle';
      // skirmish: back off from melee that comes close
      if (sq.stance === 'skirmish') {
        const threat = closestMelee(world, sq, C.SKIRMISH_TRIGGER);
        if (threat) {
          const ax = sq.cx - threat.cx, az = sq.cz - threat.cz, l = Math.hypot(ax, az) || 1;
          const to = [sq.cx + (ax / l) * C.SKIRMISH_BACKOFF, sq.cz + (az / l) * C.SKIRMISH_BACKOFF];
          if (sq.repathT <= 0) { setMoveTarget(world, sq, to, Math.atan2(-ax, -az)); sq.repathT = 2; }
          followPath(world, sq, dt, speed); sq.mode = 'advance';
        }
      }
    } else if (def.heal) {
      sq.mode = 'idle';
    } else {
      // melee: hold stance only fights what reaches it
      const post = sq.post || [sq.lx, sq.lz];
      if (sq.stance === 'hold' && !(o && o.type === 'attack')) {
        sq.mode = d < C.HOLD_REACH + squadWidth(sq) * 0.5 + 3 ? 'melee' : 'idle';
        sq.facing = turn(sq.facing, Math.atan2(T.cx - sq.lx, T.cz - sq.lz), (d < 25 ? 1.2 : 0) * dt);
      } else {
        const leash = o && o.type === 'attack' ? 1e9 : (o && o.attackMove ? 70 : C.CHASE_RANGE + 10);
        if (Math.hypot(T.cx - post[0], T.cz - post[1]) > leash && !(o && o.attackMove)) { sq.target = null; sq.mode = 'idle'; }
        else {
          sq.mode = d < 12 ? 'melee' : 'charge';
          // cavalry skirmish: hit, wheel away, come again
          if (sq.stance === 'skirmish' && def.tags.includes('cavalry')) {
            if (sq.mode === 'melee') sq.skirmishT += dt; else sq.skirmishT = Math.max(0, sq.skirmishT - dt * 0.2);
            if (sq.skirmishT > 2.5) {
              const ax = sq.cx - T.cx, az = sq.cz - T.cz, l = Math.hypot(ax, az) || 1;
              sq.order = { type: 'move', to: [sq.cx + (ax / l) * 32, sq.cz + (az / l) * 32], wheel: true };
              setMoveTarget(world, sq, sq.order.to); sq.skirmishT = 0; sq.target = null;
              for (const so of sq.soldiers) so.chargeReady = true;
            }
          }
          if (sq.target) {
            if (sq.repathT <= 0 || !sq.path) {
              const lead = T.state === 'routing' ? 4 : 0;
              setMoveTarget(world, sq, [T.cx + (T.cx - (T._pcx || T.cx)) * lead, T.cz + (T.cz - (T._pcz || T.cz)) * lead]);
              sq.repathT = d < 20 ? 0.5 : 1.5;
            }
            if (d > 3) followPath(world, sq, dt, speed);
          }
        }
      }
    }
  } else {
    sq.mode = 'idle';
    if (o && (o.type === 'move' || o.type === 'attack' || o.type === 'retreat')) {
      if (!sq.path || sq.fought) { sq.fought = false; setMoveTarget(world, sq, o.to || [sq.lx, sq.lz], o.facing); }
      arrived = followPath(world, sq, dt, speed);
      sq.mode = 'move';
      if (arrived) {
        sq.post = [sq.lx, sq.lz];
        sq.order = null; sq.path = null;
        if (sq.queue.length) { const nx = sq.queue.shift(); sq.order = nx; if (nx.type === 'move') setMoveTarget(world, sq, nx.to, nx.facing); }
      }
    } else {
      // idle: settle on the post, turn to the wanted facing
      sq.facing = turn(sq.facing, sq.wantFacing, 1.5 * dt);
      if (sq.post && Math.hypot(sq.post[0] - sq.lx, sq.post[1] - sq.lz) > 2) {
        if (!sq.path || sq.repathT <= 0) { setMoveTarget(world, sq, sq.post, sq.wantFacing); sq.repathT = 2; }
        followPath(world, sq, dt, speed);
      }
    }
  }
  finishSquad(world, sq, prevL);
}

function finishSquad(world, sq, prevL) {
  // stationary + in a trench = entrenched
  const moved = Math.hypot(sq.lx - prevL[0], sq.lz - prevL[1]) > 0.01;
  if (moved || sq.mode === 'move' || sq.mode === 'advance') sq.stillT = 0; else sq.stillT += C.DT;
  let inT = 0;
  for (const so of sq.soldiers) if (so.alive && so.inTrench) inT++;
  sq.entrenched = !sq.def.engine && sq.stillT >= C.ENTRENCH_TIME && inT >= sq.alive * 0.5 && !sq.garrison;
  sq._pcx = sq.cx; sq._pcz = sq.cz;
}

// ---- siege engines ----
function updateEngine(world, sq, dt, speed) {
  const def = sq.def, so = sq.soldiers[0];
  const o = sq.order;
  sq.repathT -= dt;
  if (o && o.type === 'move') {
    sq.mode = 'move';
    if (!sq.path) setMoveTarget(world, sq, o.to, o.facing);
    if (followPath(world, sq, dt, speed * 0.8)) { sq.post = [sq.lx, sq.lz]; sq.order = null; sq.path = null; }
    return;
  }
  // pick a target every so often
  if (world.tick % 8 === (sq.soldiers[0].id % 8)) engineAcquire(world, sq);
  const st = sq.structTarget ? world.structures.get(sq.structTarget) : null;
  if (sq.structTarget && (!st || !st.alive)) sq.structTarget = null;
  const T = !st && sq.target && sq.target.alive > 0 && sq.target.deployed && sq.target.state !== 'gone' ? sq.target : null;
  if (!st && !T) {
    sq.mode = 'idle'; sq.target = null;
    if (sq.post && Math.hypot(sq.post[0] - sq.lx, sq.post[1] - sq.lz) > 2) { if (!sq.path || sq.repathT <= 0) { setMoveTarget(world, sq, sq.post); sq.repathT = 3; } followPath(world, sq, dt, speed); }
    return;
  }
  if (def.engine === 'siegeTower') {
    // roll up to the wall and drop the bridge: while it stands docked, that wall piece is a road
    // for its own side (sim/structures.js blocks(), sim/nav.js overlays)
    if (!st) { sq.mode = 'idle'; return; }
    const p = structPoint(st, so.x, so.z);
    const d = structDist(st, so.x, so.z);
    sq.facing = turn(sq.facing, Math.atan2(p.x - so.x, p.z - so.z), 1.0 * dt);
    if (d > 3.2) {
      if (st.dock && st.dock.sq === sq.id) { st.dock = null; world.structVersion++; }
      sq.mode = 'move';
      if (sq.repathT <= 0 || !sq.path) { const dx = so.x - p.x, dz = so.z - p.z, l = Math.hypot(dx, dz) || 1; setMoveTarget(world, sq, [p.x + (dx / l) * 2.6, p.z + (dz / l) * 2.6]); sq.repathT = 2.5; }
      followPath(world, sq, dt, speed);
      sq.dockT = 0;
    } else {
      sq.mode = 'bash'; sq.path = null; sq.lx = so.x; sq.lz = so.z;
      sq.dockT = (sq.dockT || 0) + dt;
      if (sq.dockT >= def.siege.dock && (!st.dock || st.dock.sq !== sq.id)) {
        st.dock = { team: sq.team, sq: sq.id }; world.structVersion++;
        world.events.push({ type: 'docked', sq: sq.id, team: sq.team, x: p.x, z: p.z, st: st.id });
        world.events.push({ type: 'toast', team: sq.team, text: sq.team === 0 ? 'The siege tower is on the wall: over you go!' : 'A siege tower is on our wall!' });
      }
      sq.lastContactT = world.t;
    }
    return;
  }
  if (def.engine === 'ram') {
    // drive up to the gate or wall and batter it
    const p = structPoint(st, so.x, so.z);
    const d = structDist(st, so.x, so.z);
    sq.facing = turn(sq.facing, Math.atan2(p.x - so.x, p.z - so.z), 1.2 * dt);
    if (d > 2.4) {
      sq.mode = 'move';
      if (sq.repathT <= 0 || !sq.path) {
        const dx = so.x - p.x, dz = so.z - p.z, l = Math.hypot(dx, dz) || 1;
        setMoveTarget(world, sq, [p.x + (dx / l) * 2.2, p.z + (dz / l) * 2.2]); sq.repathT = 2.5;
      }
      followPath(world, sq, dt, speed);
      if (d < 6) { const k = Math.min(1, (speed * dt) / Math.max(0.1, d)); sq.lx += (p.x - sq.lx) * k * 0.5; sq.lz += (p.z - sq.lz) * k * 0.5; }
      sq.bashT = Math.min(sq.bashT, def.siege.interval * 0.5);
    } else {
      sq.mode = 'bash'; sq.path = null;
      sq.lx = so.x; sq.lz = so.z;
      sq.bashT += dt;
      if (sq.bashT >= def.siege.interval) {
        sq.bashT = 0;
        so.swingT = world.t;
        damageStructure(world, st, def.siege.structDmg * (1 + 0.08 * sq.vet), [p.x, st.base + 1.6, p.z], { kind: 'ram' });
        world.events.push({ type: 'ramHit', x: p.x, y: st.base + 1.5, z: p.z, team: sq.team, stone: !st.wood });
        sq.lastContactT = world.t;
      }
    }
    return;
  }
  // artillery: get in range, set up, loose
  const R = def.ranged;
  const tp = st ? structPoint(st, so.x, so.z) : { x: T.cx, z: T.cz, y: T.cy };
  const d = Math.hypot(tp.x - so.x, tp.z - so.z);
  if (d > R.range * 0.97 || d < R.minRange) {
    if (sq.stance === 'hold' && !(o && (o.type === 'attack' || o.type === 'attackStruct')) && !sq.aiMove) { sq.mode = 'idle'; sq.target = null; if (!st) return; }
    sq.mode = 'advance';
    if (sq.repathT <= 0 || !sq.path) {
      const dx = so.x - tp.x, dz = so.z - tp.z, l = Math.hypot(dx, dz) || 1;
      const want = d < R.minRange ? R.minRange + 15 : R.range * 0.85;
      setMoveTarget(world, sq, [tp.x + (dx / l) * want, tp.z + (dz / l) * want]); sq.repathT = 3;
    }
    followPath(world, sq, dt, speed);
    return;
  }
  sq.path = null; sq.lx = so.x; sq.lz = so.z;
  const head = Math.atan2(tp.x - so.x, tp.z - so.z);
  sq.facing = turn(sq.facing, head, 0.8 * dt);
  sq.mode = sq.stillT >= (def.deployTime || 0) ? 'shoot' : 'deploy';
  if (sq.mode !== 'shoot' || Math.abs(angDiff(sq.facing, head)) > 0.25) return;
  so.reload -= dt;
  if (so.reload > 0) return;
  const p = fire(world, so, { x: tp.x, y: tp.y, z: tp.z, pt: true, structId: st ? st.id : null });
  if (p) { so.reload = R.reload * Math.pow(0.95, sq.vet); so.shotT = world.t; sq.lastContactT = world.t; }
  else so.reload = 1;
}

// what an engine should hit: towers, then gates, then walls, then (artillery) clumps of men
function engineAcquire(world, sq) {
  const def = sq.def, so = sq.soldiers[0];
  const o = sq.order;
  if (o && o.type === 'attackStruct') { const st = world.structures.get(o.structureId); if (st && st.alive) { sq.structTarget = st.id; return; } sq.order = null; }
  if (o && o.type === 'attack' && def.ranged) { const t = world.squads.get(o.targetId); if (t && t.alive > 0 && t.deployed) { sq.target = t; sq.structTarget = null; return; } sq.order = null; }
  if (sq.structTarget) return;
  if (def.engine === 'ballista') {
    // a giant crossbow hunts the big targets: horses, engines, commanders, armour
    let bt = null, bs2 = 0;
    for (const e of world.squads.values()) {
      if (e.alive <= 0 || !e.deployed || e.state === 'gone' || !hostile(world, sq.team, e.team)) continue;
      const d = Math.hypot(e.cx - so.x, e.cz - so.z);
      if (d > def.ranged.range || d < def.ranged.minRange) continue;
      const sc = (e.def.engine ? 10 : e.def.tags.includes('cavalry') ? 6 : e.def.armour >= 6 ? 4 : 1) * (e.state === 'routing' ? 0.3 : 1) * (1 + e.alive * 0.05) / (1 + d / 200);
      if (sc > bs2) { bs2 = sc; bt = e; }
    }
    if (bt) { sq.target = bt; return; }
  }
  const ram = def.engine === 'ram' || def.engine === 'siegeTower';
  const reach = ram ? (sq.stance === 'hold' ? 12 : 70) : def.ranged.range * (sq.stance === 'hold' ? 0.97 : 1.15);
  let best = null, bs = -Infinity;
  for (const st of structList(world)) {
    if (!st.alive || st.kind === 'caltrops' || !hostile(world, sq.team, st.team)) continue;
    if (ram && st.kind !== 'gate' && st.kind !== 'wall') continue;
    if (def.engine === 'siegeTower' && (st.kind !== 'wall' || (st.dock && st.dock.sq !== sq.id))) continue;
    const d = structDist(st, so.x, so.z);
    if (d > reach || (!ram && d < def.ranged.minRange)) continue;
    let s = -d * 0.5;
    if (!ram) s += st.kind === 'tower' ? (st.garrison ? 70 : 45) : st.kind === 'gate' ? 40 : st.kind === 'wall' ? 18 : 0;
    else if (def.engine === 'ram') s += st.kind === 'gate' ? 60 : 0;
    else s += st.type === 'stoneWall' ? 30 : 0;
    if (st.kind === 'obstacle') s -= 40;
    if (s > bs) { bs = s; best = st; }
  }
  if (best) { sq.structTarget = best.id; sq.target = null; return; }
  if (ram) return;
  // no fort to batter: drop stones on the thickest crowd in reach
  let bt = null, bn = 0;
  for (const e of world.squads.values()) {
    if (e.alive <= 0 || !e.deployed || e.state === 'gone' || !hostile(world, sq.team, e.team)) continue;
    const d = Math.hypot(e.cx - so.x, e.cz - so.z);
    if (d > def.ranged.range || d < def.ranged.minRange) continue;
    const score = e.alive * (e.def.engine ? 8 : 1) * (e.state === 'routing' ? 0.3 : 1);
    if (score > bn) { bn = score; bt = e; }
  }
  sq.target = bt;
}

// ---- garrisons: towers and stone wall-walks ----
export function enterGarrison(world, sq, tw) {
  sq.garrison = tw.id; tw.garrison = sq.id; sq.garrisonPending = null; sq.order = null; sq.path = null;
  sq.garrisonWall = tw.kind !== 'tower';
  const slots = garrisonSlots(world, tw, sq.alive, sq.team);
  sq.gSlots = slots; sq.gN = sq.alive;
  let i = 0, mx = 0, mz = 0;
  for (const so of sq.soldiers) if (so.alive) { const p = slots[i] || slots[slots.length - 1]; so.x = p[0]; so.z = p[1]; so.y = p[2]; so.px = so.x; so.pz = so.z; so.py = so.y; mx += p[0]; mz += p[1]; i++; }
  sq.lx = mx / Math.max(1, i); sq.lz = mz / Math.max(1, i);
  world.events.push({ type: 'garrison', sq: sq.id, tower: tw.id, team: sq.team });
}

export function leaveGarrison(world, sq) {
  if (!sq.garrison) return null;
  const tw = world.structures.get(sq.garrison);
  if (tw) {
    tw.garrison = null;
    const home = sq.team === 0 ? -1 : 1;
    let k = 0;
    if (tw.kind === 'tower') {
      for (const so of sq.soldiers) if (so.alive) {
        const a = (k++ / sq.alive) * 6.283;
        so.x = tw.pos[0] + Math.cos(a) * (tw.size / 2 + 1.5); so.z = tw.pos[1] + Math.sin(a) * (tw.size / 2 + 1.5);
        so.y = world.terrain.surface(so.x, so.z);
      }
      if (tw.inward) { sq.lx = tw.pos[0] + tw.inward[0] * (tw.size / 2 + 3); sq.lz = tw.pos[1] + tw.inward[1] * (tw.size / 2 + 3); }
      else { sq.lx = tw.pos[0]; sq.lz = tw.pos[1] + home * (tw.size / 2 + 3); }
    } else {
      // step down off the wall-walk on the defenders' side
      for (const so of sq.soldiers) if (so.alive) {
        const dd = tw.thick / 2 + 1.6 + (k++ % 2) * 1.2;
        if (tw.inward) { so.x += tw.inward[0] * dd; so.z += tw.inward[1] * dd; } else so.z += home * dd;
        so.y = world.terrain.surface(so.x, so.z);
      }
      updateCentre(world, sq); sq.lx = sq.cx; sq.lz = sq.cz;
    }
  }
  sq.garrison = null; sq.garrisonWall = false; sq.gSlots = null;
  return null;
}

function towards(sq, T, dist) {
  const dx = sq.cx - T.cx, dz = sq.cz - T.cz, l = Math.hypot(dx, dz) || 1;
  return [T.cx + (dx / l) * dist, T.cz + (dz / l) * dist];
}

function closestMelee(world, sq, r) {
  let best = null, bd = r;
  for (const o of world.squads.values()) {
    if (o.alive <= 0 || !o.deployed || !hostile(world, sq.team, o.team) || o.def.ranged || o.def.heal || o.def.engine || o.state === 'routing') continue;
    const d = Math.hypot(o.cx - sq.cx, o.cz - sq.cz) - squadWidth(o) * 0.4;
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

export function effRange(sq, T) {
  const R = sq.def.ranged;
  const dh = sq.cy - T.cy;
  return R.range + Math.max(0, Math.min(25, 1.2 * dh));
}

// target acquisition: forced attack target, else the best enemy in reach
function acquire(world, sq) {
  const o = sq.order;
  if (o && o.type === 'attack' && o.targetId) {
    const t = world.squads.get(o.targetId);
    if (t && t.alive > 0 && t.deployed && t.state !== 'gone') { sq.target = t; return; }
    sq.order = null;
  }
  if (o && o.type === 'move' && !o.attackMove) { sq.target = null; return; }
  const def = sq.def;
  let reach;
  if (def.ranged) reach = def.ranged.range + 25;
  else if (def.heal) reach = 0;
  else reach = sq.stance === 'hold' ? C.HOLD_REACH + squadWidth(sq) * 0.5 + 4 : sq.stance === 'aggressive' || o?.attackMove ? (def.tags.includes('cavalry') ? 45 : C.ENGAGE_RANGE + 8) : C.ENGAGE_RANGE;
  if (!reach) { sq.target = null; return; }
  const cav = def.tags.includes('cavalry');
  let best = null, bs = -Infinity;
  // only the squads in the 64 m cells within reach (a war map has hundreds of squads)
  const G = squadGrid(world);
  const maxR = def.ranged ? def.ranged.range + 50 : reach;
  const i0 = Math.max(0, Math.floor((sq.cx - maxR) / G.cs)), i1 = Math.min(G.W - 1, Math.floor((sq.cx + maxR) / G.cs));
  const j0 = Math.max(0, Math.floor((sq.cz - maxR) / G.cs)), j1 = Math.min(G.W - 1, Math.floor((sq.cz + maxR) / G.cs));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
  const cell = G.map.get(j * G.W + i);
  if (!cell) continue;
  for (const e of cell) {
    if (e.alive <= 0 || !e.deployed || e.state === 'gone' || !hostile(world, sq.team, e.team)) continue;
    const d = Math.hypot(e.cx - sq.cx, e.cz - sq.cz);
    const lim = def.ranged ? effRange(sq, e) + (sq.stance === 'hold' || sq.garrison ? 0 : 20) : reach;
    if (d > lim) continue;
    if (!def.ranged && e.garrison) continue;
    let s = -d;
    if (cav && (e.def.ranged || e.def.heal || e.def.engine)) s += 25;
    if (cav && e.type === 'spear' && e.stance === 'hold') s -= 25;
    if (def.ranged && e.def.engine) s -= 20;               // arrows barely scratch engines
    if (e.state === 'routing') s -= def.ranged ? 30 : 8;
    if (sq.focus === e.id) s += 30;                         // the AI's focus-fire call
    if (sq.target === e) s += 6;   // stickiness
    if (s > bs) { bs = s; best = e; }
  }
  }
  sq.target = best;
}

// ---- ammunition (war maps, LIAM_BRIEF item 6): a squad whose men have all emptied their quivers
// fights on as foot with its sidearms (its def is swapped for a copy with no ranged attack) until it
// is resupplied at one of its castles, outposts or forts
const DRY = new WeakMap();
function dryDef(base) {
  let d = DRY.get(base);
  if (!d) { d = { ...base, ranged: null, ability: 'none', dry: true, tags: base.tags.filter((t) => t !== 'ranged').concat('melee') }; DRY.set(base, d); }
  return d;
}
export function ammoState(world, sq) {
  const base = world.defs[sq.team][sq.type];
  if (!base.ranged || !base.ammo || base.engine) return;
  let n = 0, left = 0;
  for (const so of sq.soldiers) if (so.alive) { if (so.ammo === undefined) so.ammo = base.ammo; if (so.ammo > 0) n++; left += so.ammo; }
  sq.ammo = left; sq.ammoMax = sq.alive * base.ammo;
  if (n === 0 && sq.def === base) {
    sq.def = dryDef(base); sq.target = null; sq.structTarget = null;
    if (sq.stance === 'hold' && !sq.garrison) sq.stance = 'aggressive';
    world.events.push({ type: 'dry', sq: sq.id, team: sq.team });
    if (sq.team === 0) world.events.push({ type: 'toast', team: 0, text: sq.name + ' are out of arrows: they draw their swords.' });
  } else if (n > 0 && sq.def !== base) { sq.def = base; if (!base.melee || base.ranged) sq.stance = defaultStance(sq.type); }
}

// squads by 64 m cell, rebuilt once per tick on first use
export function squadGrid(world) {
  if (world._sgT === world.tick && world._sg) return world._sg;
  const cs = 64, W = Math.ceil(world.terrain.size / cs) + 1;
  const g = world._sg && world._sg.W === W ? world._sg : { cs, W, map: new Map() };
  g.map.clear();
  for (const e of world.squads.values()) {
    if (e.alive <= 0 || !e.deployed || e.state === 'gone') continue;
    const i = Math.max(0, Math.min(W - 1, Math.floor(e.cx / cs))), j = Math.max(0, Math.min(W - 1, Math.floor(e.cz / cs)));
    const k = j * W + i;
    let l = g.map.get(k); if (!l) { l = []; g.map.set(k, l); }
    l.push(e);
  }
  world._sg = g; world._sgT = world.tick;
  return g;
}

// ---- sappers ----
export function startDig(world, sq) {
  const near = [...world.squads.values()].some((e) => hostile(world, sq.team, e.team) && e.deployed && e.alive > 0 && e.state !== 'routing' && Math.hypot(e.cx - sq.cx, e.cz - sq.cz) < 15);
  if (near) return { error: 'Too close to the enemy to dig' };
  const f = sq.facing, fx = Math.sin(f), fz = Math.cos(f), rx = Math.cos(f), rz = -Math.sin(f);
  const cx = sq.cx + fx * 3.5, cz = sq.cz + fz * 3.5;
  const raw = [];
  for (let u = -6; u <= 6; u += 2) raw.push([cx + rx * u, cz + rz * u]);
  const pts = Heightfield.prepLine(raw, 1).filter((p) => world.terrain.diggable(p[0], p[1]));
  if (pts.length < 3) return { error: 'Cannot dig here' };
  const perM = world.techs[sq.team].has('earthCrew') ? 1.4 : 2;
  const cost = Math.round(Heightfield.lineLength(pts) * perM);
  if (world.teams[sq.team].gold < cost) return { error: 'Not enough gold to dig (' + cost + ' g)' };
  world.teams[sq.team].gold -= cost;
  sq.digJob = { pts, t: 0, dur: 7 * 6 / Math.max(2, sq.alive), cost };
  sq.order = null; sq.path = null; sq.target = null;
  world.events.push({ type: 'digStart', sq: sq.id, team: sq.team, pts });
  return { ok: true };
}
function finishDig(world, sq) {
  const job = sq.digJob; sq.digJob = null;
  const depth = world.techs[sq.team].has('deepTrench') ? 2.2 : 1.6;
  const enemyDir = [Math.sin(sq.facing), Math.cos(sq.facing)];
  world.terrain.dig(job.pts, { depth, width: 2.5, parapet: 0.6, enemyDir, team: sq.team });
  world.events.push({ type: 'dig', runs: [job.pts], team: sq.team, metres: Heightfield.lineLength(job.pts), live: true });
  world.events.push({ type: 'toast', team: sq.team, text: sq.team === 0 ? sq.name + ' have dug in.' : 'Varkhal sappers dig a trench.' });
}
function repairNear(world, sq, dt) {
  let best = null, bd = 12;
  for (const st of structList(world)) {
    if (st.team !== sq.team || !st.alive || st.hp >= st.maxHp) continue;
    const d = structDist(st, sq.cx, sq.cz);
    if (d < bd) { bd = d; best = st; }
  }
  if (!best) return;
  best.hp = Math.min(best.maxHp, best.hp + 22 * dt * (sq.alive / sq.menMax));
  if (best.burning > 0) best.burning = Math.max(0, best.burning - 3 * dt);
  sq.repairing = world.t;
  if (world.rng() < 0.3) world.events.push({ type: 'repair', x: best.pos ? best.pos[0] : (best.a[0] + best.b[0]) / 2, z: best.pos ? best.pos[1] : (best.a[1] + best.b[1]) / 2, team: sq.team });
}

// ---- soldiers: steering, collisions, melee swings, volleys ----
export function updateSoldiers(world, sq, dt) {
  if (!sq.deployed || sq.state === 'gone') return;
  const def = sq.def, hf = world.terrain;
  const cav = def.tags.includes('cavalry'), eng = !!def.engine;
  const rad = def.radius;
  const routing = sq.state === 'routing';
  const T = sq.target;
  const garrisonTower = sq.garrison ? world.structures.get(sq.garrison) : null;
  if (garrisonTower && (!sq.gSlots || sq.gN !== sq.alive)) { sq.gSlots = garrisonSlots(world, garrisonTower, sq.alive, sq.team); sq.gN = sq.alive; }
  const gSlots = garrisonTower ? sq.gSlots : null;
  const stT = sq.structTarget && def.ranged ? world.structures.get(sq.structTarget) : null;
  let gi = 0;
  let blockedBy = null;
  const fSn = Math.sin(sq.facing), fCs = Math.cos(sq.facing);
  for (const so of sq.soldiers) {
    if (!so.alive) continue;
    if (so.burnT > world.t) { so.hp -= 4 * dt; sq.morale -= 1 * dt / Math.max(1, sq.alive); if (so.hp <= 0) { kill(world, so, null); continue; } }
    let tx, tz, wantSpeed = def.speed, face = null;
    so.act = 'idle';
    // --- garrisoned: stand on the platform / wall-walk and shoot
    if (garrisonTower) {
      const p = gSlots[gi++] || gSlots[gSlots.length - 1];
      so.x = p[0]; so.z = p[1]; so.y = p[2]; so.vx = so.vz = 0; so.spd = 0;
      so.inTrench = false; so.disordered = false;
      if (T && def.ranged) { shootStep(world, sq, so, T, dt); face = Math.atan2(T.cx - so.x, T.cz - so.z); }
      else if (def.melee && !def.ranged) {
        // foot on the wall-walk: strike anyone who comes over (siege towers, ladders) or reaches up
        const f2 = nearestEnemy(world, so, def.melee.reach + 1.2);
        if (f2 && Math.abs(f2.y - so.y) < 3.2) {
          face = Math.atan2(f2.x - so.x, f2.z - so.z); so.cd -= dt; sq.lastContactT = world.t;
          if (so.cd <= 0) { so.cd = def.melee.interval * (0.9 + world.rng() * 0.2); so.swingT = world.t; so.act = 'melee'; applyDamage(world, so, f2, def.melee.dmg * 1.15, { melee: true, fromX: so.x, fromZ: so.z }); }
        }
      }
      if (face !== null) so.facing = turn(so.facing, face, 6 * dt); else so.facing = turn(so.facing, sq.team === 0 ? 0 : Math.PI, 2 * dt);
      continue;
    }
    const sl = sq.slots[so.slot] || ZERO2;
    const sx = sq.lx + sl[0] * fCs - sl[1] * fSn, sz = sq.lz - sl[0] * fSn - sl[1] * fCs;
    tx = sx; tz = sz;
    if (def.heal && so.goTo) { tx = so.goTo[0]; tz = so.goTo[1]; }
    // cut off from the squad (a wall, a river, a crush of men between): walk his own path back
    if (!routing && sq.mode !== 'melee' && sq.mode !== 'bash' && world.war) {
      const far = Math.hypot(tx - so.x, tz - so.z);
      // a man pressed against a wall (his slot is on the far side of it) is stuck: give him a route too
      // (or sliding along it without getting closer: checked once a second)
      if (far > 4 && so.spd < 0.35 && !so.route) so.stuck = (so.stuck || 0) + dt; else if (far <= 4) so.stuck = 0;
      so.chk = (so.chk || 0) + dt;
      if (so.chk > 1) { if (!so.route && far > 6 && so.lastFar !== undefined && so.lastFar - far < 0.6) so.stuck = 2; so.lastFar = far; so.chk = 0; }
      if (far > 22 || so.stuck > 1.5 || (so.route && far > 4)) {
        so.stuck = 0;
        // (a few re-plans per tick at most: a crush of cut-off men must not stall the sim)
        if ((!so.route || world.t > so.routeT + 5 || so.routeI >= so.route.length) && (world._reroute = (world._rerouteT === world.tick ? world._reroute : 0) + 1) <= 6) { world._rerouteT = world.tick; so.route = findPath(world, sq.team, [so.x, so.z], [tx, tz]); so.routeI = 0; so.routeT = world.t + (so.id % 7) * 0.3; }
        if (!so.route || !so.route.length) { so.route = [[tx, tz]]; so.routeI = 0; so.routeT = world.t; }
        so.routeI = so.routeI | 0;
        while (so.routeI < so.route.length - 1 && Math.hypot(so.route[so.routeI][0] - so.x, so.route[so.routeI][1] - so.z) < 2.5) so.routeI++;
        const wp = so.route[Math.min(so.routeI, so.route.length - 1)];
        tx = wp[0]; tz = wp[1];
      } else if (so.route) so.route = null;
    }
    // --- fighting
    let foe = null;
    if (!routing && def.melee && so.knockUntil <= world.t && !sq.digJob && !so.inMoat) {
      const meleeMode = sq.mode === 'melee' || sq.mode === 'charge' || sq.mode === 'bash';
      const searchR = meleeMode ? (sq.stance === 'hold' && !(sq.order && sq.order.type === 'attack') ? C.HOLD_REACH : 9) : (def.ranged || def.heal ? 3.2 : 4.5);
      // the nearest foe is re-found every other tick; in between the last one is kept if still close
      const fr = searchR + (cav ? 2 : 0);
      const c = so.foeC;
      if (c && c.alive && ((world.tick + so.id) & 1) && (c.x - so.x) ** 2 + (c.z - so.z) ** 2 < fr * fr) foe = c;
      else { foe = nearestEnemy(world, so, fr); so.foeC = foe; }
      if (foe && sq.stance === 'hold' && meleeMode && !(sq.order && sq.order.type === 'attack')) {
        if (Math.hypot(foe.x - sx, foe.z - sz) > C.HOLD_REACH + def.melee.reach) foe = null;
      }
      if (foe && sq.order && sq.order.type === 'move' && !sq.order.attackMove && sq.order.force) foe = null;
      if (foe && sq.mode === 'bash' && Math.hypot(foe.x - so.x, foe.z - so.z) > 3) foe = null;
    }
    if (foe) {
      const dx = foe.x - so.x, dz = foe.z - so.z, d = Math.hypot(dx, dz) || 0.001;
      const reach = def.melee.reach + (foe.sq.def.tags.includes('cavalry') ? 0.5 : 0) + (cav ? 0.3 : 0) + (foe.sq.def.engine ? 1.3 : 0);
      face = Math.atan2(dx, dz);
      sq.lastContactT = world.t;
      // cavalry charge impact
      if (cav && so.chargeReady && so.spd > C.CHARGE_SPEED && d < reach + 1.2) chargeImpact(world, so, foe);
      if (d > reach - 0.15) { tx = foe.x - (dx / d) * (reach - 0.3); tz = foe.z - (dz / d) * (reach - 0.3); wantSpeed = def.speed * (cav ? 1 : 1.1); }
      else { tx = so.x; tz = so.z; wantSpeed = 0; }
      so.cd -= dt;
      if (d <= reach + 0.1) {
        so.act = 'melee';
        if (so.cd <= 0) {
          so.cd = def.melee.interval * (0.9 + world.rng() * 0.2);
          so.swingT = world.t;
          applyDamage(world, so, foe, def.melee.dmg, { melee: true, fromX: so.x, fromZ: so.z });
          world.events.push({ type: 'swing', x: so.x, z: so.z, unit: sq.type, team: sq.team });
        }
      }
    } else if (sq.mode === 'bash' && sq.structTarget && def.melee) {
      const st = world.structures.get(sq.structTarget);
      if (st && st.alive) {
        const p = structPoint(st, so.x, so.z);
        const c = st.kind === 'tower' ? { px: p.x, pz: p.z, d: Math.hypot(so.x - p.x, so.z - p.z) } : segClosest(st, so.x, so.z);
        const off = (st.kind === 'tower' ? st.size / 2 : (st.thick || 0.6) / 2) + rad + 0.25;
        const nx = (so.x - c.px) / (c.d || 1), nz = (so.z - c.pz) / (c.d || 1);
        tx = c.px + nx * off + (sx - sq.lx) * 0.3; tz = c.pz + nz * off + (sz - sq.lz) * 0.3;
        face = Math.atan2(c.px - so.x, c.pz - so.z);
        if (c.d < off + 1.4) {
          so.act = 'melee'; so.cd -= dt;
          if (so.cd <= 0) {
            so.cd = def.melee.interval * 1.1; so.swingT = world.t;
            const mult = (st.kind === 'obstacle' ? 2 : st.wood ? 1 : 0.2) * (def.melee.structMult || 1) * (cav ? 0.5 : 1);
            damageStructure(world, st, def.melee.dmg * mult, [c.px, st.base + 1.5, c.pz], { kind: 'melee' });
          }
        }
      }
    } else if (!routing && def.ranged && (T || stT) && sq.mode === 'shoot' && !so.inMoat) {
      shootStep(world, sq, so, stT || T, dt);
      const aim = stT ? structPoint(stT, so.x, so.z) : { x: T.cx, z: T.cz };
      if (so.act === 'shoot' || so.act === 'aim') face = Math.atan2(aim.x - so.x, aim.z - so.z);
    } else if (routing) {
      wantSpeed = def.speed * 1.15;
    }
    if (sq.digJob) { so.act = 'dig'; face = sq.facing; }
    if (def.heal && (so.healT > world.t - 0.3 || so.reviveT > world.t)) { so.act = 'heal'; if (so.healTarget) face = Math.atan2(so.healTarget.x - so.x, so.healTarget.z - so.z); }
    if (eng) { so.act = sq.mode === 'bash' ? 'bash' : sq.mode; if (sq.mode === 'shoot' || sq.mode === 'deploy' || sq.mode === 'bash') face = sq.facing; }

    // --- steering
    let dx = tx - so.x, dz = tz - so.z;
    const dist = Math.hypot(dx, dz);
    let speedMul = world.mudSpeed || 1;
    // terrain effects
    const trenchAmt = hf.trenchAmt(so.x, so.z);
    so.inTrench = trenchAmt > 0.5;
    so.disordered = so.inTrench && !sq.entrenched && so.spd > 0.6 && !eng;
    if (so.inTrench && so.spd > 0.3 && !sq.entrenched) speedMul *= cav || eng ? C.TRENCH_SPEED_CAV : C.TRENCH_SPEED_INF;
    else if (trenchAmt > 0.2) speedMul *= 0.7;
    if (hf.waterDepth(so.x, so.z) > 0.15) speedMul *= C.WATER_SPEED;
    // in a moat: wading or swimming, no fighting until he climbs out
    so.inMoat = trenchAmt > 1.5;
    if (so.inMoat) speedMul *= eng ? 0.12 : 0.3;
    if (sq.shieldWall) speedMul *= 0.5;
    if (sq.state === 'wavering') speedMul *= 0.85;
    if (sq.cryUntil > world.t) speedMul *= 1.3;
    if (so.knockUntil > world.t) speedMul = 0;
    if (cav && sq.chargeUntil > world.t) speedMul *= 9.5 / def.speed;
    // catch-up when far from slot
    let v = wantSpeed * speedMul;
    if (!foe && dist > 1.5) v *= Math.min(1.35, 1 + (dist - 1.5) * 0.1);
    if (dist < 0.8 && !foe) v *= dist / 0.8;
    let mvx = 0, mvz = 0;
    if (dist > 0.05) { mvx = (dx / dist) * v; mvz = (dz / dist) * v; }
    // separation from neighbours
    let px = 0, pz = 0;
    forNear(world, so.x, so.z, eng ? 3.6 : 2.2, (o) => {
      if (o === so || !o.alive || o.sq.garrison) return;
      const r2 = rad + o.sq.def.radius;
      const ex = so.x - o.x, ez = so.z - o.z, e2 = ex * ex + ez * ez;
      if (e2 >= r2 * r2 || e2 < 1e-6) return;
      const e = Math.sqrt(e2), push = (r2 - e) / e;
      let w = o.sq === sq ? 0.5 : o.sq.team === sq.team ? 0.6 : 0.9;
      if (eng) w *= 0.15; else if (o.sq.def.engine) w *= 1.6;
      px += ex * push * w; pz += ez * push * w;
    });
    // inertia (cavalry turn wide, engines lumber)
    const acc = eng ? 2.5 : cav ? 7 : 16;
    so.vx += Math.max(-acc * dt, Math.min(acc * dt, mvx - so.vx));
    so.vz += Math.max(-acc * dt, Math.min(acc * dt, mvz - so.vz));
    let nx = so.x + so.vx * dt + px * 0.5, nz = so.z + so.vz * dt + pz * 0.5;
    // static obstacles (trees, boulders, buildings)
    for (const ob of world.obstacleCells(nx, nz)) {
      const ex = nx - ob.x, ez = nz - ob.z, rr = ob.r + rad * 0.8, e2 = ex * ex + ez * ez;
      if (e2 < rr * rr && e2 > 1e-6) { const e = Math.sqrt(e2); nx = ob.x + (ex / e) * rr; nz = ob.z + (ez / e) * rr; }
    }
    // structures
    for (const st of structsNear(world, nx, nz)) {
      if (!st.alive) continue;
      if (st.kind === 'caltrops') {
        if (hostile(world, sq.team, st.team) && Math.abs(nx - st.pos[0]) < st.size / 2 && Math.abs(nz - st.pos[1]) < st.size / 2) {
          nx = so.x + (nx - so.x) * 0.5; nz = so.z + (nz - so.z) * 0.5;
          if (cav) { so.hp -= 2 * dt * 4; if (so.hp <= 0) { kill(world, so, null); break; } }
        }
        continue;
      }
      if (!blocks(st, sq.team, cav || eng)) {
        if (st.kind === 'obstacle' && !cav) { const c = segClosest(st, nx, nz); if (c.d < 1) { nx = so.x + (nx - so.x) * 0.6; nz = so.z + (nz - so.z) * 0.6; if (hostile(world, sq.team, st.team)) { damageStructure(world, st, 20 * dt * 0.25); } } }
        continue;
      }
      const c = segClosest(st, nx, nz);
      const half = (st.kind === 'tower' || st.kind === 'keep' ? st.size / 2 : (st.thick || 0.6) / 2) + (eng ? rad * 0.55 : rad);   // engines squeeze through a 4 m gate
      if (c.d < half) {
        const ex = nx - c.px, ez = nz - c.pz, e = c.d || 1e-3;
        let ux = ex / e, uz = ez / e;
        if (c.d < 1e-3) { ux = Math.sin(so.facing + Math.PI); uz = Math.cos(so.facing + Math.PI); }
        nx = c.px + ux * half; nz = c.pz + uz * half;
        if (!routing && hostile(world, sq.team, st.team)) blockedBy = st;
        // stakes wound charging horses
        if (st.kind === 'obstacle' && cav && hostile(world, sq.team, st.team) && so.spd > 3 && so.stakeT !== st.id) {
          so.stakeT = st.id;
          const sd = world.techs[st.team].has('stakes80') ? 80 : 50;
          applyDamage(world, null, so, sd, { melee: true, fromX: c.px, fromZ: c.pz });
          damageStructure(world, st, 25);
          so.vx *= 0.1; so.vz *= 0.1; so.chargeReady = false;
          world.events.push({ type: 'stakeHit', x: c.px, z: c.pz });
        }
      }
    }
    if (!so.alive) continue;
    // map bounds
    const m = routing ? -8 : 1;
    nx = Math.max(m, Math.min(hf.size - m, nx)); nz = Math.max(m, Math.min(hf.size - m, nz));
    const realV = Math.hypot(nx - so.x, nz - so.z) / dt;
    so.spd = so.spd * 0.7 + realV * 0.3;
    so.x = nx; so.z = nz;
    const gy = hf.surface(so.x, so.z);
    so.y = so.fallT > 0 ? Math.max(gy, so.y - 9 * dt) : gy;
    // facing
    if (face !== null) so.facing = turn(so.facing, face, (eng ? 1.2 : 8) * dt);
    else if (so.spd > 0.8) so.facing = turn(so.facing, Math.atan2(so.vx, so.vz), (eng ? 1.4 : cav ? 4 : 7) * dt);
    else so.facing = turn(so.facing, sq.facing, (eng ? 1 : 3) * dt);
    if (so.act === 'idle' && so.spd > 0.5) so.act = so.spd > 5 ? 'run' : 'walk';
    if (!cav && so.spd > 0.3) so.chargeReady = true;
    if (cav && !foe) { if (!so.chargeReady && world.t - (so.chargeAt || 0) > 5) so.chargeReady = true; }
  }
  // blocked by an enemy wall long enough: bash it
  if (blockedBy && !sq.structTarget && !eng && (sq.mode === 'move' || sq.mode === 'charge' || sq.mode === 'advance' || sq.mode === 'idle')) {
    sq.blockT += dt;
    if (sq.blockT > 1.2 && !def.ranged && def.melee) { sq.structTarget = blockedBy.id; sq.blockT = 0; }
  } else if (!blockedBy) sq.blockT = Math.max(0, sq.blockT - dt);
}

function shootStep(world, sq, so, T, dt) {
  const R = sq.def.ranged;
  so.reload -= dt * (sq.volleyUntil > world.t ? 2 : 1);
  so.act = 'aim';
  const reload = R.reload * (sq.fireArrows ? 1.3 : 1);
  if (so.reload > 0) { if (so.reload > reload - 0.5) so.act = 'shoot'; return; }
  // an empty quiver (war maps: every shooter carries a fixed number of arrows)
  if (so.ammo !== undefined && so.ammo <= 0) { so.reload = 1; so.act = 'idle'; return; }
  let tgt;
  if (T.kind) {
    // a structure
    const p = structPoint(T, so.x, so.z);
    p.y = T.base + T.height * (0.35 + world.rng() * 0.5);
    tgt = { x: p.x, y: p.y, z: p.z, pt: true, structId: T.id };
    const d = Math.hypot(tgt.x - so.x, tgt.z - so.z);
    if (d > R.range * 1.02 || d < R.minRange) { so.reload = 0.4; return; }
  } else {
    // pick a living soldier from the target squad
    const alive = T.soldiers.filter((s) => s.alive);
    if (!alive.length) return;
    tgt = alive[Math.floor(world.rng() * alive.length)];
    const d = Math.hypot(tgt.x - so.x, tgt.z - so.z);
    const eff = effRange(sq, T) * (sq.garrison ? 1.04 : 1);
    if (d > eff || d < R.minRange) { so.reload = 0.4; return; }
  }
  const p = fire(world, so, tgt);
  if (!p) { so.reload = 0.6; sq.noShotT = world.t; return; }
  so.reload = reload * Math.pow(0.95, sq.vet) * (0.9 + world.rng() * 0.25);
  so.shotT = world.t;
  so.act = 'shoot';
  if (so.ammo !== undefined) so.ammo--;
  sq.lastContactT = Math.max(sq.lastContactT, world.t - 2.2);
}

function chargeImpact(world, rider, foe) {
  rider.chargeReady = false;
  rider.chargeAt = world.t;
  const sq = rider.sq;
  if (foe.inTrench) return;                     // no charging through a trench
  const imp = (sq.def.impact || 10) * (sq.formation === 'wedge' ? 1.2 : 1) * (sq.chargeUntil > world.t ? 1.5 : 1);
  const fsq = foe.sq;
  const dirx = rider.vx, dirz = rider.vz;
  // braced spears: facing the charge, holding still
  const braced = fsq.type === 'spear' && fsq.stance === 'hold' && fsq.state !== 'routing' && foe.spd < 1.2;
  const faceDot = (Math.sin(foe.facing) * -dirx + Math.cos(foe.facing) * -dirz) / (Math.hypot(dirx, dirz) || 1);
  if (braced && faceDot > 0.5) {
    applyDamage(world, foe, rider, C.BRACE_REFLECT, { melee: true, fromX: foe.x, fromZ: foe.z });
    rider.vx *= 0.15; rider.vz *= 0.15;
    world.events.push({ type: 'brace', x: foe.x, y: foe.y + 1.4, z: foe.z });
    return;
  }
  // hit the target and whoever stands just behind it
  let n = 0;
  forNear(world, foe.x, foe.z, 2.2, (o) => {
    if (n >= 3 || !o.alive || !hostile(world, sq.team, o.sq.team)) return;
    n++;
    applyDamage(world, rider, o, imp, { melee: true, fromX: rider.x, fromZ: rider.z });
    if (o.alive && !o.sq.def.tags.includes('cavalry') && !o.sq.def.engine) o.knockUntil = world.t + 1.0;
  });
  if (world.t - (fsq.chargedT || -9) > 2) { fsq.morale -= C.MORALE_CHARGED; fsq.chargedT = world.t; }
  world.events.push({ type: 'charge', x: foe.x, y: foe.y, z: foe.z, team: sq.team });
}
