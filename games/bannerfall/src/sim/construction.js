// BANNERFALL :: sim/construction.js - building in the middle of a war (DESIGN.md 6).
// FOUNDING builds everything at once (orders.build, the royal masons). Once the war starts, a
// build is placed as a BLUEPRINT (paid at placement) and BUILDER squads walk over and raise it:
// one builder = 1 work point per second. A trench run sinks when its work is done, a wall piece
// stands. Idle builders take the nearest blueprint within 150 m; they back off from enemies.
import { BUILD_TYPES } from '../data/builds.js';
import { Heightfield } from './terrain.js';
import { previewBuild, earthSpec } from './orders.js';
import { makeSegment, makeTower, makeCaltrops, makeStairs, makeKeep, structList, segClosest } from './structures.js';
import { foundSettlement } from './war.js';
import { setMoveTarget, structDist } from './squads.js';
import { hostile } from './factions.js';
import { ownerAt } from './regions.js';

// work points per build piece (DESIGN.md 6.3)
export const WP = { trench: 4, moat: 9, stakes: 10, caltrops: 8, palisade: 24, gate: 60, tower: 120, stoneWall: 90, stoneGate: 480, stoneTower: 600, stairs: 40, outpost: 900, castleKeep: 2400 };
let BP = 1;
export function resetBlueprintIds() { BP = 1; }
export const blueprintIdState = { get: () => BP, set: (n) => { BP = n; } };

// may this team raise field works here mid-war? own territory, or within 60 m of its soldiers
// and at least 15 m from hostile ones
export function canBuildAt(world, team, x, z) {
  if (!world.war) return true;
  let mine = false, foe = false;
  for (const sq of world.squads.values()) {
    if (!sq.deployed || sq.alive <= 0 || sq.state === 'gone') continue;
    const d = Math.hypot(sq.cx - x, sq.cz - z);
    if (sq.team === team && d < 60) mine = true;
    if (d < 15 && hostile(world, team, sq.team)) foe = true;
  }
  if (foe) return false;
  return ownerAt(world, x, z) === team || mine;
}

// place blueprints for a drawn build; returns { ids, cost } or { error }
export function placeBlueprint(world, team, type, points, opts = {}) {
  const B = BUILD_TYPES[type];
  if (!B) return { error: 'No such build' };
  const pv = previewBuild(world, team, type, points, { ...opts, anywhere: true });
  if (!pv.ok) return { error: pv.why || (B.kind === 'earth' ? 'Draw a longer ' + B.name.toLowerCase() + ' on open ground' : 'Cannot build there') };
  if (world.teams[team].bankrupt) return { error: 'The treasury is empty: nothing new until the books balance' };
  // every piece must be on ground this side may build on
  const pts = B.kind === 'earth' ? pv.runs.flat() : pv.segs ? pv.segs.filter((s) => s.ok).flatMap((s) => [s.a, s.b]) : [pv.pos];
  if (!opts.anywhere && B.kind !== 'keep' && pts.some((p) => !canBuildAt(world, team, p[0], p[1]))) return { error: 'Build in your own land, or near your soldiers and away from the enemy' };
  const T = world.teams[team];
  if (pv.cost > T.gold) return { error: 'Not enough gold (' + pv.cost + ' g)' };
  T.gold -= pv.cost;
  T.spent += pv.cost;
  const ids = [];
  const add = (bp) => { bp.id = 'b' + BP++; bp.team = team; bp.type = type; bp.wp = 0; bp.t0 = world.t; world.blueprints.set(bp.id, bp); ids.push(bp.id); };
  const per = pv.cost;
  if (B.kind === 'earth') {
    const spec = earthSpec(world, team, type);
    // cut each run into ~10 m pieces so the trench sinks bit by bit
    for (const run of pv.runs) {
      let piece = [run[0]], len = 0;
      for (let i = 1; i < run.length; i++) {
        piece.push(run[i]); len += Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
        if (len >= 10 || i === run.length - 1) {
          if (piece.length > 1) add({ pts: piece.slice(), need: WP[type] * len, cost: Math.round(len * spec.perM), enemyDir: opts.enemyDir || null, pos: piece[Math.floor(piece.length / 2)] });
          piece = [run[i]]; len = 0;
        }
      }
    }
  } else if (pv.segs) {
    const okSegs = pv.segs.filter((s) => s.ok);
    for (const s of okSegs) add({ a: s.a, b: s.b, need: WP[type], cost: Math.round(per / okSegs.length), pos: [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2], replace: pv.replace || null });
  } else add({ at: pv.pos, need: WP[type], cost: per, pos: pv.pos, wallId: pv.wallId, rot: pv.rot });
  world.events.push({ type: 'blueprint', ids, team, stype: type });
  return { ids, cost: pv.cost };
}

export function cancelBlueprint(world, team, id) {
  const bp = world.blueprints.get(id);
  if (!bp || bp.team !== team) return false;
  world.blueprints.delete(id);
  world.teams[team].gold += bp.wp > 0 ? Math.round(bp.cost * 0.5) : bp.cost;
  return true;
}

function complete(world, bp) {
  world.blueprints.delete(bp.id);
  const team = bp.team;
  let ids = [];
  if (BUILD_TYPES[bp.type].kind === 'earth') {
    const spec = earthSpec(world, team, bp.type);
    // the enemy side: away from the team's nearest keep
    let dir = bp.enemyDir;
    if (!dir) {
      const home = world.homeFlag[team] || [bp.pos[0], bp.pos[1] - 1];
      const a = bp.pts[0], b = bp.pts[bp.pts.length - 1];
      let nx = -(b[1] - a[1]), nz = b[0] - a[0]; const l = Math.hypot(nx, nz) || 1; nx /= l; nz /= l;
      if ((bp.pos[0] - home[0]) * nx + (bp.pos[1] - home[1]) * nz < 0) { nx = -nx; nz = -nz; }
      dir = [nx, nz];
    }
    world.terrain.dig(bp.pts, { depth: spec.depth, width: spec.width, parapet: spec.parapet, enemyDir: dir, team, moat: !!spec.moat });
    world.events.push({ type: 'dig', runs: [bp.pts], team, metres: Heightfield.lineLength(bp.pts), live: true });
  } else if (bp.type === 'tower' || bp.type === 'stoneTower') ids.push(makeTower(world, team, bp.at, bp.type).id);
  else if (bp.type === 'caltrops') ids.push(makeCaltrops(world, team, bp.at).id);
  else if (bp.type === 'stairs') { const w = world.structures.get(bp.wallId); if (w && w.alive) ids.push(makeStairs(world, team, bp.at, bp.rot, bp.wallId).id); }
  else if (BUILD_TYPES[bp.type].kind === 'keep') {
    // a new seat: the keep stands, and the land around it becomes a castle or an outpost
    const k = makeKeep(world, team, bp.at, bp.type, bp.rot || 0);
    ids.push(k.id);
    foundSettlement(world, team, bp.type, bp.at, k.id);
  }
  else {
    if (bp.replace) { const old = world.structures.get(bp.replace); if (old && old.alive && old.team === team) { world.structures.delete(old.id); world.structVersion++; } }
    ids.push(makeSegment(world, team, bp.type, bp.a, bp.b).id);
  }
  for (const id of ids) { const s = world.structures.get(id); if (s) s.raisedT = world.t; }
  world.events.push({ type: 'built', ids, team, stype: bp.type, live: true, x: bp.pos[0], z: bp.pos[1] });
}

// the builder brain: called from updateSquad for squads with def.builder
export function updateBuilder(world, sq, dt, speedFollow) {
  // threatened: drop tools and back off
  if (world.tick % 10 === 0) {
    let threat = null, bd = 25;
    for (const e of world.squads.values()) {
      if (!e.deployed || e.alive <= 0 || e.state === 'routing' || e.def.builder || !hostile(world, sq.team, e.team)) continue;
      const d = Math.hypot(e.cx - sq.cx, e.cz - sq.cz);
      if (d < bd) { bd = d; threat = e; }
    }
    sq.threat = threat;
  }
  const o = sq.order;
  if (o && o.type !== 'build') { sq.building = null; return false; }     // a plain move order wins
  let bp = sq.job ? world.blueprints.get(sq.job) : null;
  if (!bp) { sq.job = null; sq.building = null; }
  // pick up work when idle
  if (!bp && !o && world.tick % 20 === (sq.soldiers[0].id % 20)) {
    let best = null, bd = 150;
    for (const b of world.blueprints.values()) {
      if (b.team !== sq.team) continue;
      const crew = b.crew || 0;
      const d = Math.hypot(b.pos[0] - sq.cx, b.pos[1] - sq.cz) + crew * 25;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) { sq.job = best.id; bp = best; }
  }
  if (!bp) return false;
  if (sq.threat) {
    const t = sq.threat, ax = sq.cx - t.cx, az = sq.cz - t.cz, l = Math.hypot(ax, az) || 1;
    if (sq.repathT <= 0) { setMoveTarget(world, sq, [sq.cx + (ax / l) * 20, sq.cz + (az / l) * 20]); sq.repathT = 2; }
    speedFollow();
    sq.mode = 'move'; sq.building = null;
    return true;
  }
  const work = bp.pts ? bp.pts[Math.floor(bp.pts.length / 2)] : bp.pos;
  const d = Math.hypot(work[0] - sq.lx, work[1] - sq.lz);
  if (d > 9) {
    if (!sq.path || sq.repathT <= 0 || sq.jobPathFor !== bp.id) {
      // stand on the home side of the job
      const home = world.homeFlag[sq.team] || [sq.cx, sq.cz];
      const hx = home[0] - work[0], hz = home[1] - work[1], hl = Math.hypot(hx, hz) || 1;
      setMoveTarget(world, sq, [work[0] + (hx / hl) * 4, work[1] + (hz / hl) * 4]);
      // a long walk keeps its route (re-planning every few seconds flipped between two routes and
      // the crew never left home); it is re-planned when it runs out or goes stale
      sq.repathT = d > 60 ? 15 : 4; sq.jobPathFor = bp.id;
    }
    speedFollow();
    sq.mode = 'move'; sq.building = null;
    return true;
  }
  sq.mode = 'build'; sq.building = bp.id; sq.path = null;
  sq.facing = Math.atan2(work[0] - sq.cx, work[1] - sq.cz);
  const mult = (world.techs[sq.team].has('masons') && /stone/.test(bp.type) ? 1.3 : 1) * (1 + 0.1 * sq.vet);
  bp.wp += sq.alive * dt * mult;
  bp.crew = (bp.crewT === world.tick ? bp.crew : 0) + 1; bp.crewT = world.tick;
  if (world.rng() < dt * 3) world.events.push({ type: 'repair', x: work[0] + (world.rng() - 0.5) * 4, z: work[1] + (world.rng() - 0.5) * 4, team: sq.team, build: true });
  if (bp.wp >= bp.need) { complete(world, bp); sq.job = null; sq.building = null; if (o && o.type === 'build') sq.order = null; }
  return true;
}

export function blueprintList(world, team) { return [...world.blueprints.values()].filter((b) => team === undefined || b.team === team); }
export function finishBlueprints(world) { for (const bp of [...world.blueprints.values()]) complete(world, bp); }
export { structList, segClosest, structDist };
