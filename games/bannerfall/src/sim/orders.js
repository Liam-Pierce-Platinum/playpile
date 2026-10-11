// BANNERFALL :: sim/orders.js - THE command API. The player, the AI and the tests all use it.
import { ABILITIES } from '../data/units.js';
import { BUILD_TYPES } from '../data/builds.js';
import { C } from '../data/constants.js';
import { Heightfield } from './terrain.js';
import { regionAt } from './regions.js';
import { pointInPoly } from './mapgen.js';
import { createSquad, placeSquad, setMoveTarget, computeSlots, makeSlots, squadWidth, leaveGarrison, startDig, structDist } from './squads.js';
import { makeSegment, makeTower, makeCaltrops, makeStairs, segClosest, structList, canGarrison, stairsFor } from './structures.js';
import { rally } from './morale.js';
import { hostile } from './factions.js';
import { ownerAt } from './regions.js';
import { bannerCap, bannersUsed } from './war.js';

export const inZone = (world, team, x, z) => {
  if (world.war) return ownerAt(world, x, z) === team;
  const poly = team === 0 ? world.def.zones.player : world.def.zones.enemy;
  return poly ? pointInPoly(x, z, poly) : true;
};

// ------------------------------------------------------------------ battle commands
export function issue(world, team, ids, cmd) {
  const sqs = ids.map((id) => world.squads.get(id)).filter((s) => s && s.team === team && s.alive > 0 && s.deployed && s.state !== 'routing' && s.state !== 'gone');
  if (!sqs.length) return false;
  switch (cmd.type) {
    case 'line': return lineOrder(world, sqs, cmd);
    case 'move': {
      if (sqs.length === 1) { moveOne(world, sqs[0], cmd.to, cmd.facing, cmd); return true; }
      let cx = 0, cz = 0; for (const s of sqs) { cx += s.cx; cz += s.cz; } cx /= sqs.length; cz /= sqs.length;
      const d = Math.hypot(cmd.to[0] - cx, cmd.to[1] - cz);
      if (d > 4 && cmd.facing === undefined) {
        // fold the group into a line facing the way it is going
        const f = Math.atan2(cmd.to[0] - cx, cmd.to[1] - cz);
        let w = 0; for (const s of sqs) w += squadWidth(s) + 1.5;
        const rx = Math.cos(f), rz = -Math.sin(f);
        const a = [cmd.to[0] - rx * w / 2, cmd.to[1] - rz * w / 2], b = [cmd.to[0] + rx * w / 2, cmd.to[1] + rz * w / 2];
        return lineOrder(world, sqs, { ...cmd, a, b, keepWidth: true, ranks: true });
      }
      for (const s of sqs) moveOne(world, s, [cmd.to[0] + s.cx - cx, cmd.to[1] + s.cz - cz], cmd.facing, cmd);
      return true;
    }
    case 'attack': {
      const t = world.squads.get(cmd.targetId);
      if (!t || t.team === team) return false;
      if (!hostile(world, team, t.team) && world.hostM) return false;
      for (const s of sqs) {
        if (s.def.heal) { moveOne(world, s, [t.cx + (s.cx - t.cx) * 0.4, t.cz + (s.cz - t.cz) * 0.4], undefined, {}); continue; }
        if (s.def.engine === 'ram') continue;
        if (s.garrison && !s.def.ranged) leaveGarrison(world, s);
        s.order = { type: 'attack', targetId: t.id }; s.target = t; s.structTarget = null; s.path = null; s.repathT = 0; s.queue = [];
      }
      world.events.push({ type: 'order', kind: 'attack', team, to: [t.cx, t.cz], ids: sqs.map((s) => s.id) });
      return true;
    }
    case 'attackStruct': {
      const st = world.structures.get(cmd.structureId);
      if (!st || st.team === team || !st.alive) return false;
      if (!hostile(world, team, st.team) && world.hostM) return false;
      let any = false;
      for (const s of sqs) {
        if (s.def.heal) continue;
        if (s.garrison && !s.def.ranged) leaveGarrison(world, s);
        s.structTarget = st.id; s.target = null; s.path = null; s.repathT = 0; s.queue = [];
        s.order = { type: 'attackStruct', structureId: st.id };
        any = true;
      }
      if (any) world.events.push({ type: 'order', kind: 'attack', team, to: st.pos || [(st.a[0] + st.b[0]) / 2, (st.a[1] + st.b[1]) / 2], ids: sqs.map((s) => s.id) });
      return any;
    }
    case 'garrison': {
      const tw = world.structures.get(cmd.structureId);
      if (!canGarrison(tw, world) || tw.team !== team || tw.garrison) return false;
      // towers take shooters; a wall-walk takes any foot squad (shooters first)
      const foot = (q) => !q.def.engine && !q.def.heal && !q.def.builder && !q.def.tags.includes('cavalry') && q.type !== 'commander' && q.type !== 'king';
      const s = sqs.find((q) => q.def.ranged && !q.def.engine && !q.garrison) || sqs.find((q) => q.def.ranged && !q.def.engine) || (tw.kind === 'wall' ? sqs.find((q) => foot(q) && !q.garrison) : null);
      if (!s) return false;
      const home = team === 0 ? -1 : 1;
      let to;
      if (tw.kind === 'tower') to = tw.inward ? [tw.pos[0] + tw.inward[0] * (tw.size / 2 + 2), tw.pos[1] + tw.inward[1] * (tw.size / 2 + 2)] : [tw.pos[0], tw.pos[1] + home * (tw.size / 2 + 2)];
      else {
        // up the stairs when there are some, else to the foot of the wall on the inside
        const stp = stairsFor(world, tw);
        if (stp && tw.type !== 'stoneWall') to = [stp.pos[0], stp.pos[1]];
        else { const c = segClosest(tw, s.cx, s.cz); to = tw.inward ? [c.px + tw.inward[0] * (tw.thick / 2 + 2.2), c.pz + tw.inward[1] * (tw.thick / 2 + 2.2)] : [c.px, c.pz + home * (tw.thick / 2 + 2.2)]; }
      }
      if (s.garrison) leaveGarrison(world, s);
      moveOne(world, s, to, undefined, {});
      s.garrisonPending = tw.id;
      if (world.phase === 'prepare') {
        placeSquad(world, s, to[0], to[1], s.facing);
        s.garrisonPending = tw.id;
      }
      return true;
    }
    case 'formation':
      for (const s of sqs) { if (s.def.engine) continue; s.formation = cmd.value; computeSlots(s); }
      return true;
    case 'stance':
      for (const s of sqs) { s.stance = cmd.value; }
      return true;
    case 'halt':
      for (const s of sqs) { s.order = null; s.path = null; s.queue = []; s.target = null; s.structTarget = null; s.lx = s.cx; s.lz = s.cz; s.post = [s.cx, s.cz]; s.digJob = null; }
      return true;
    case 'retreat': {
      for (const s of sqs) {
        let best = null, bd = Infinity;
        for (const h of world.squads.values()) if (h.team === team && h.def.heal && h.alive > 0 && h !== s && h.deployed) {
          const d = Math.hypot(h.cx - s.cx, h.cz - s.cz); if (d < bd) { bd = d; best = h; }
        }
        const homeFlag = world.homeFlag[team];
        const to = best ? [best.cx, best.cz + (team === 0 ? -4 : 4)] : homeFlag;
        moveOne(world, s, [to[0] + (world.rng() - 0.5) * 6, to[1]], team === 0 ? 0 : Math.PI, { force: true });
        s.order.retreat = true;
      }
      return true;
    }
    case 'ability': {
      let any = false;
      for (const s of sqs) any = useAbility(world, s) || any;
      return any;
    }
  }
  return false;
}

function moveOne(world, s, to, facing, cmd) {
  if (s.garrison) leaveGarrison(world, s);
  s.garrisonPending = null;
  s.digJob = null; s.job = null;
  const order = { type: 'move', to: [to[0], to[1]], facing, attackMove: !!cmd.attackMove, force: !!cmd.force };
  if (cmd.queue && s.order) { s.queue.push(order); return; }
  s.order = order; s.queue = [];
  s.target = null; s.structTarget = null;
  if (cmd.width && !s.def.engine) { s.cols = 0; computeSlots(s, cmd.width); }
  setMoveTarget(world, s, to, facing);
  if (facing === undefined || facing === null) s.wantFacing = Math.atan2(to[0] - s.cx, to[1] - s.cz);
  s.post = [to[0], to[1]];
  world.events.push({ type: 'order', kind: cmd.attackMove ? 'attackMove' : 'move', team: s.team, to: s.order.to, ids: [s.id] });
}

// drag a line a -> b: squads share it side by side. Facing is cmd.facing if given
// (the input layer picks the side away from the camera), else perpendicular to the drag.
export function planLine(world, sqs, cmd) {
  const a = cmd.a, b = cmd.b;
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
  if (L < 2) return null;
  const rx = dx / L, rz = dz / L;
  const facing = cmd.facing !== undefined && cmd.facing !== null ? cmd.facing : Math.atan2(-rz, rx);
  // ranged squads stand behind melee when several are moved together; engines at the back
  const melee = sqs.filter((s) => !s.def.ranged && !s.def.heal && !s.def.engine), back = sqs.filter((s) => s.def.ranged && !s.def.engine), heal = sqs.filter((s) => s.def.heal), eng = sqs.filter((s) => s.def.engine);
  const rows = cmd.ranks && melee.length && (back.length || heal.length || eng.length) ? [melee, back, heal, eng].filter((r) => r.length) : [sqs.filter((s) => !s.def.heal && !s.def.engine), heal, eng].filter((r) => r.length);
  const fx = Math.sin(facing), fz = Math.cos(facing);
  const plan = [];
  let rowBack = 0;
  for (const row of rows) {
    row.sort((p, q) => (p.cx - a[0]) * rx + (p.cz - a[1]) * rz - ((q.cx - a[0]) * rx + (q.cz - a[1]) * rz));
    const nat = row.map((s) => squadWidth(s));
    const total = nat.reduce((p, q) => p + q, 0);
    const gap = 1.5;
    const keep = cmd.keepWidth || (row === heal || row === eng) && rows.length > 1;
    const avail = keep ? total + gap * (row.length - 1) : L;
    const scale = keep ? 1 : (L - gap * (row.length - 1)) / total;
    let u = (L - avail) / 2;
    let deepest = 0;
    for (let i = 0; i < row.length; i++) {
      const w = Math.max(2, nat[i] * scale);
      const mid = u + w / 2;
      const to = [a[0] + rx * mid - fx * rowBack, a[1] + rz * mid - fz * rowBack];
      const width = keep || row[i].def.engine ? undefined : w;
      const { slots } = makeSlots(row[i], width);
      for (const sl of slots) deepest = Math.max(deepest, sl[1]);
      plan.push({ sq: row[i], to, facing, width, slots });
      u += w + gap;
    }
    rowBack += deepest + (row === eng ? 8 : 6);
  }
  return plan;
}

function lineOrder(world, sqs, cmd) {
  const plan = planLine(world, sqs, cmd);
  if (!plan) return issue(world, sqs[0].team, sqs.map((s) => s.id), { type: 'move', to: cmd.a, attackMove: cmd.attackMove });
  for (const p of plan) moveOne(world, p.sq, p.to, p.facing, { ...cmd, width: p.width });
  return true;
}

export function useAbility(world, s) {
  const ab = s.def.ability;
  if (s.abilityCd > 0) return false;
  const A = ABILITIES[ab];
  if (!A) return false;
  switch (ab) {
    case 'brace': s.stance = 'hold'; break;
    case 'warCry': s.morale = Math.min(100, s.morale + 20); s.cryUntil = world.t + 4; break;
    case 'shieldWall': s.shieldWall = !s.shieldWall; break;
    case 'volley': s.volleyUntil = world.t + 12; break;
    case 'fireArrows': s.fireArrows = !s.fireArrows; break;
    case 'pavise': s.pavise = world.t + 20; break;
    case 'sanctuary': s.sanctuaryUntil = world.t + C.SANCTUARY_TIME; break;
    case 'hitAndRun': s.stance = s.stance === 'skirmish' ? 'aggressive' : 'skirmish'; break;
    case 'charge': s.chargeUntil = world.t + 4; for (const so of s.soldiers) so.chargeReady = true; break;
    case 'dig': {
      if (world.phase !== 'battle') return false;
      const r = startDig(world, s);
      if (r.error) { world.events.push({ type: 'toast', team: s.team, text: r.error, bad: true }); return false; }
      break;
    }
    case 'rally':
      for (const o of world.squads.values()) {
        if (o.team !== s.team || !o.deployed || o.alive <= 0) continue;
        if (Math.hypot(o.cx - s.cx, o.cz - s.cz) > C.CMD_AURA) continue;
        o.morale = Math.min(100, o.morale + C.RALLY_BOOST);
        if (o.state === 'routing' && !o.leaving) rally(world, o, 0);
      }
      break;
    default: return false;
  }
  s.abilityCd = A.cd;
  world.events.push({ type: 'ability', ability: ab, sq: s.id, x: s.cx, z: s.cz, team: s.team, on: ab === 'fireArrows' ? s.fireArrows : ab === 'shieldWall' ? s.shieldWall : undefined });
  return true;
}

// ------------------------------------------------------------------ prepare phase
export function ownedCount(world, team) {
  let n = 0; for (const s of world.squads.values()) if (s.team === team && s.type !== 'commander' && s.type !== 'king' && s.state !== 'gone') n++; return n;
}
export function unitCost(world, team, type) { return world.defs[team][type].cost; }

export function buy(world, team, type, opts = {}) {
  const def = world.defs[team][type];
  if (!def) return { error: 'No such unit' };
  if (world.phase !== 'prepare' && !opts.anytime) return { error: 'Recruit before the battle' };
  const T = world.teams[team];
  if (team === 0 && !opts.free && world.unlocked && !world.unlocked.includes(type)) return { error: def.name + ' are locked' };
  if (!opts.free && T.gold < def.cost) return { error: 'Not enough gold' };
  if (world.war) { if (type !== 'commander' && bannersUsed(world, team) + (def.builder ? 0.5 : 1) > bannerCap(world, team)) return { error: 'Banner cap reached (' + bannerCap(world, team) + ' squads): take castles to raise more' }; }
  else if (team === 0 && type !== 'commander' && ownedCount(world, team) >= world.def.deployCap) return { error: 'Army is full (' + world.def.deployCap + ' squads)' };
  if (!opts.free) T.gold -= def.cost;
  const sq = createSquad(world, team, type, opts);
  sq.bought = !opts.free;
  if (!opts.free) T.spent += def.cost;
  world.undo[team].push({ kind: 'buy', id: sq.id, cost: opts.free ? 0 : def.cost });
  return { id: sq.id, sq };
}

export function deploy(world, team, id, x, z, facing) {
  const sq = world.squads.get(id);
  if (!sq || sq.team !== team) return { error: 'No squad' };
  if (world.phase === 'prepare' && team === 0 && !inZone(world, team, x, z)) return { error: 'Deploy inside the blue zone' };
  if (world.terrain.waterDepth(x, z) > 0.8) return { error: 'Too deep' };
  if (facing === undefined) facing = team === 0 ? 0 : Math.PI;
  if (sq.garrison) leaveGarrison(world, sq);
  placeSquad(world, sq, x, z, facing);
  return { ok: true };
}

export function undeploy(world, team, id) {
  const sq = world.squads.get(id);
  if (!sq || sq.team !== team || world.phase !== 'prepare') return false;
  if (sq.garrison) leaveGarrison(world, sq);
  sq.deployed = false;
  return true;
}

// trench price per metre and depth for a team, after techs
export function trenchSpec(world, team) {
  const B = BUILD_TYPES.trench, tech = world.techs[team];
  return { perM: (tech.has('earthCrew') ? 1.4 : B.costPerM) * (world.priceMult || 1), depth: tech.has('deepTrench') ? 2.2 : B.depth, width: B.width, parapet: B.parapet };
}

// trench or moat: the cross-section and the price per metre
export function earthSpec(world, team, type) {
  if (type !== 'moat') return trenchSpec(world, team);
  const B = BUILD_TYPES.moat;
  return { perM: B.costPerM * (world.priceMult || 1), depth: B.depth, width: B.width, parapet: B.parapet, moat: true };
}

// the gap between seats: 450 m on a Large map (DESIGN.md 6.5), 370 m on Medium, 250 m on a 2 km map
export const seatGap = (world) => Math.round(Math.min(450, Math.max(220, world.war.size * 0.12)) / 10) * 10;
// a keep (outpost or castle) may stand here? (DESIGN.md 6.5) -> '' or the reason it may not
export function keepSiteWhy(world, team, p, type) {
  const W = world.war;
  if (!W) return 'Keeps are built on the war map';
  const gap = seatGap(world);
  for (const s of W.settlements) if (s.kind !== 'village' && s.state !== 'razed' && Math.hypot(s.pos[0] - p[0], s.pos[1] - p[1]) < gap) return 'Too close to ' + s.name + ' (' + gap + ' m between seats)';
  for (const b of (world.blueprints ? world.blueprints.values() : [])) if ((b.type === 'outpost' || b.type === 'castleKeep') && Math.hypot(b.pos[0] - p[0], b.pos[1] - p[1]) < gap) return 'Another keep is planned within ' + gap + ' m';
  const rid = regionAt(world, p[0], p[1]);
  if (rid < 0) return 'Not on wild mountains';
  const R = W.regions[rid];
  if (R.settlement) {
    // a village you hold (taxed or burnt) can have a keep beside it; a castle or fort cannot
    const s = W.settlements.find((q) => q.id === R.settlement);
    if (s && !(s.kind === 'village' && (s.owner === team || s.taxedBy === team)) && s.state !== 'razed') return 'A castle or fort already holds this region';
  }
  const near = R.owner === team || (R.owner === -1 && R.neighbors.some((n) => W.regions[n].owner === team));
  if (!near) return 'Build in your own land or wild land next to it';
  // the waystone must be held: none of an enemy's soldiers within 60 m
  for (const q of world.squads.values()) if (q.deployed && q.alive > 0 && q.team < 7 && q.team !== team && world.hostM && world.hostM[team * 9 + q.team] && Math.hypot(q.cx - p[0], q.cz - p[1]) < 60) return 'The enemy is too close';
  return '';
}

// Preview: what a drawn line would build, segment by segment, with the cost.
export function previewBuild(world, team, type, points, opts = {}) {
  const B = BUILD_TYPES[type];
  const hf = world.terrain;
  const T = world.teams[team];
  if (!B) return { cost: 0, ok: false };
  const free = opts.free;
  if (B.kind === 'earth') {
    const spec = earthSpec(world, team, type);
    const pts = Heightfield.prepLine(points, 1);
    const runs = []; let cur = []; const bad = [];
    for (const p of pts) {
      const ok = hf.diggable(p[0], p[1]) && (team !== 0 || opts.anywhere || inZone(world, team, p[0], p[1])) && !nearObstacle(world, p[0], p[1], 1.6) && !nearStruct(world, p[0], p[1], 1.8);
      if (ok) cur.push(p); else { bad.push(p); if (cur.length > 1) runs.push(cur); cur = []; }
    }
    if (cur.length > 1) runs.push(cur);
    let metres = 0; for (const r of runs) metres += Heightfield.lineLength(r);
    const cost = free ? 0 : Math.round(metres * spec.perM);
    return { type, pts, runs, bad, metres, cost, ok: metres >= (type === 'moat' ? 6 : 2), afford: T.gold >= cost };
  }
  if (type === 'stairs') {
    // snap against the nearest own palisade or stone wall, on its inner side
    const p = points[points.length - 1];
    let best = null, bd = 6;
    for (const s of structList(world)) if (s.team === team && s.kind === 'wall') { const c = segClosest(s, p[0], p[1]); if (c.d < bd) { bd = c.d; best = { s, c }; } }
    const pc = B.cost * (world.priceMult || 1);
    if (!best) return { type, pos: p, cost: free ? 0 : pc, ok: false, afford: T.gold >= pc, size: B.size, why: 'Place it against one of your walls' };
    const s = best.s, inw = s.inward || [0, -1], off = (s.thick || 0.7) / 2 + 1.7;
    const pos = [best.c.px + inw[0] * off, best.c.pz + inw[1] * off];
    const ok = hf.inside(pos[0], pos[1], 2) && hf.height(pos[0], pos[1]) > hf.waterLevel + 0.2 && !structList(world).some((o) => o.kind === 'stairs' && Math.hypot(o.pos[0] - pos[0], o.pos[1] - pos[1]) < 6);
    return { type, pos, wallId: s.id, rot: Math.atan2(inw[0], inw[1]), cost: free ? 0 : pc, ok, afford: T.gold >= pc, size: B.size, height: s.height };
  }
  if (B.kind === 'keep') {
    const p = points[points.length - 1];
    const pc = B.cost * (world.priceMult || 1);
    const why = keepSiteWhy(world, team, p, type) || (towerOk(world, team, p, B.size, { ...opts, anywhere: true }) && hf.slope(p[0], p[1]) < 0.16 ? '' : 'Needs flat open ground');
    return { type, pos: p, cost: free ? 0 : pc, ok: !why, why, afford: T.gold >= pc, size: B.size, height: B.height };
  }
  if (type === 'caltrops') {
    const p = points[points.length - 1];
    const h = B.size / 2;
    let ok = true;
    for (const [dx, dz] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) if (!hf.diggable(p[0] + dx, p[1] + dz) || (team === 0 && !opts.anywhere && !inZone(world, team, p[0] + dx, p[1] + dz))) ok = false;
    if (ok) for (const s of structList(world)) if (s.kind === 'caltrops' && Math.abs(s.pos[0] - p[0]) < B.size && Math.abs(s.pos[1] - p[1]) < B.size) ok = false;
    const pc = B.cost * (world.priceMult || 1);
    return { type, pos: p, size: B.size, cost: free ? 0 : pc, ok, afford: T.gold >= pc };
  }
  if (type === 'tower' || type === 'stoneTower' || type === 'gate' || type === 'stoneGate') {
    const p = points[points.length - 1];
    if (type === 'gate' || type === 'stoneGate') {
      // snap onto the nearest own wall segment
      let best = null, bd = 4;
      for (const s of structList(world)) if (s.team === team && s.kind === 'wall') { const c = segClosest(s, p[0], p[1]); if (c.d < bd) { bd = c.d; best = s; } }
      let a, b;
      const half = B.segLen / 2;
      if (best) {
        const dx = best.b[0] - best.a[0], dz = best.b[1] - best.a[1], L = Math.hypot(dx, dz) || 1;
        const m = [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2];
        a = [m[0] - (dx / L) * half, m[1] - (dz / L) * half]; b = [m[0] + (dx / L) * half, m[1] + (dz / L) * half];
      } else { const f = opts.facing ?? (team === 0 ? 0 : Math.PI); const rx = Math.cos(f) * half, rz = -Math.sin(f) * half; a = [p[0] - rx, p[1] - rz]; b = [p[0] + rx, p[1] + rz]; }
      const ok = segOk(world, team, a, b, true, opts);
      const pc = B.cost * (world.priceMult || 1);
      return { type, segs: [{ a, b, ok }], replace: best ? best.id : null, cost: free ? 0 : pc, ok, afford: T.gold >= pc };
    }
    const ok = towerOk(world, team, p, B.size, opts);
    const pc = B.cost * (world.priceMult || 1);
    return { type, pos: p, cost: free ? 0 : pc, ok, afford: T.gold >= pc, size: B.size, height: B.height };
  }
  // segment walls: snap to segLen pieces along the line
  const pts = Heightfield.prepLine(points, 0.5);
  const segs = [];
  let start = pts[0];
  for (let i = 1; i < pts.length; i++) {
    const d = Math.hypot(pts[i][0] - start[0], pts[i][1] - start[1]);
    if (d >= B.segLen) {
      const k = B.segLen / d;
      const end = [start[0] + (pts[i][0] - start[0]) * k, start[1] + (pts[i][1] - start[1]) * k];
      segs.push({ a: start, b: end, ok: segOk(world, team, start, end, false, opts) });
      start = end; i--;
      if (segs.length > 120) break;
    }
  }
  const okSegs = segs.filter((s) => s.ok);
  const cost = free ? 0 : okSegs.length * B.costPerSeg * (world.priceMult || 1);
  return { type, segs, cost, ok: okSegs.length > 0, afford: T.gold >= cost };
}

function nearObstacle(world, x, z, r) {
  for (const o of world.obstacleCells(x, z)) if (Math.hypot(o.x - x, o.z - z) < o.r + r) return true;
  return false;
}
function nearStruct(world, x, z, r, ignore) {
  for (const s of structList(world)) {
    if (s.id === ignore || s.kind === 'caltrops') continue;
    const c = segClosest(s, x, z);
    const half = s.kind === 'tower' ? s.size / 2 : (s.thick || 0.6) / 2;
    if (c.d < half + r) return true;
  }
  return false;
}
function segOk(world, team, a, b, isGate, opts = {}) {
  const hf = world.terrain;
  for (let k = 0; k <= 4; k++) {
    const x = a[0] + (b[0] - a[0]) * (k / 4), z = a[1] + (b[1] - a[1]) * (k / 4);
    if (team === 0 && !opts.anywhere && !inZone(world, team, x, z)) return false;
    if (opts.force) { if (!hf.inside(x, z, 1) || hf.height(x, z) < hf.waterLevel + 0.2) return false; continue; }
    if (!hf.diggable(x, z)) return false;
    if (hf.trenchAmt(x, z) > 0.3) return false;
    if (nearObstacle(world, x, z, 0.4)) return false;
  }
  if (!isGate && !opts.force) {
    const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
    for (const s of structList(world)) {
      if (s.kind === 'caltrops') continue;
      const c = segClosest(s, mx, mz);
      if (c.d < 1.2 + (s.kind === 'tower' ? s.size / 2 : 0)) return false;
    }
  }
  return true;
}
function towerOk(world, team, p, size = 4, opts = {}) {
  const hf = world.terrain, h = size / 2;
  for (const [dx, dz] of [[0, 0], [-h, -h], [h, -h], [-h, h], [h, h]]) {
    const x = p[0] + dx, z = p[1] + dz;
    if (team === 0 && !opts.anywhere && !inZone(world, team, x, z)) return false;
    if (opts.force) continue;
    if (!hf.diggable(x, z) || hf.trenchAmt(x, z) > 0.2) return false;
  }
  if (opts.force) return true;
  if (hf.slope(p[0], p[1]) > 0.42) return false;
  if (nearObstacle(world, p[0], p[1], h + 0.4) || nearStruct(world, p[0], p[1], h + 0.4)) return false;
  return true;
}

export function buildAllowed(world, team, type) {
  if (team !== 0) return true;
  return !world.builds || world.builds.includes(type);
}

// opts: { free, enemyDir, tag, anywhere }
export function build(world, team, type, points, opts = {}) {
  if (world.phase !== 'prepare' && !opts.anytime) return { error: 'Build before the battle' };
  if (!buildAllowed(world, team, type)) return { error: BUILD_TYPES[type].name + ' needs a tech' };
  if (BUILD_TYPES[type].kind === 'keep' && !opts.anytime) return { error: 'Found new keeps in the war: builders raise them on land you take' };
  const pv = previewBuild(world, team, type, points, opts);
  const T = world.teams[team];
  if (!pv.ok) return { error: pv.why || (BUILD_TYPES[type].kind === 'earth' ? 'Draw a longer ' + BUILD_TYPES[type].name.toLowerCase() + ' on open ground' : 'Cannot build there') };
  if (pv.cost > T.gold) return { error: 'Not enough gold (' + pv.cost + ' g)' };
  if (type === 'stairs') {
    const s = makeStairs(world, team, pv.pos, pv.rot, pv.wallId);
    T.gold -= pv.cost;
    world.undo[team].push({ kind: 'struct', ids: [s.id], cost: pv.cost });
    world.events.push({ type: 'built', ids: [s.id], team, stype: type });
    return { cost: pv.cost, ids: [s.id] };
  }
  if (BUILD_TYPES[type].kind === 'earth') {
    const spec = earthSpec(world, team, type);
    const snap = world.terrain.snapshot();
    const enemyDir = opts.enemyDir || (team === 0 ? [0, 1] : [0, -1]);
    let metres = 0;
    for (const r of pv.runs) metres += world.terrain.dig(r, { depth: spec.depth, width: spec.width, parapet: spec.parapet, enemyDir, team, moat: !!spec.moat }).metres;
    T.gold -= pv.cost;
    world.undo[team].push({ kind: 'trench', snap, cost: pv.cost });
    if (world.undo[team].filter((u) => u.snap).length > 12) { const u = world.undo[team].find((q) => q.snap); u.snap = null; u.locked = true; }
    world.events.push({ type: 'dig', runs: pv.runs, team, metres });
    return { cost: pv.cost, metres };
  }
  const ids = [];
  if (type === 'tower' || type === 'stoneTower') {
    ids.push(makeTower(world, team, pv.pos, type).id);
  } else if (type === 'caltrops') {
    ids.push(makeCaltrops(world, team, pv.pos).id);
  } else if (type === 'gate' || type === 'stoneGate') {
    let restore = null;
    if (pv.replace) {
      const old = world.structures.get(pv.replace);
      restore = { type: old.type, a: old.a, b: old.b };
      old.alive = false; world.structures.delete(old.id); world.structVersion++;
      // a gatehouse is wider than one wall piece: keep the stubs either side
      const L = Math.hypot(old.b[0] - old.a[0], old.b[1] - old.a[1]);
      const gw = BUILD_TYPES[type].segLen;
      if (gw < L - 0.5) {
        const ux = (old.b[0] - old.a[0]) / L, uz = (old.b[1] - old.a[1]) / L;
        const m = [(old.a[0] + old.b[0]) / 2, (old.a[1] + old.b[1]) / 2];
        ids.push(makeSegment(world, team, old.type, old.a, [m[0] - ux * gw / 2, m[1] - uz * gw / 2]).id, makeSegment(world, team, old.type, [m[0] + ux * gw / 2, m[1] + uz * gw / 2], old.b).id);
      }
    }
    ids.push(makeSegment(world, team, type, pv.segs[0].a, pv.segs[0].b, { tag: opts.tag }).id);
    T.gold -= pv.cost;
    world.undo[team].push({ kind: 'struct', ids, cost: pv.cost, restore });
    world.events.push({ type: 'built', ids, team, stype: type });
    return { cost: pv.cost, ids };
  } else {
    for (const s of pv.segs) if (s.ok) ids.push(makeSegment(world, team, type, s.a, s.b, { tag: opts.tag }).id);
  }
  T.gold -= pv.cost;
  world.undo[team].push({ kind: 'struct', ids, cost: pv.cost });
  world.events.push({ type: 'built', ids, team, stype: type });
  return { cost: pv.cost, ids };
}

function removeStruct(world, id) {
  const s = world.structures.get(id);
  if (!s) return;
  if (s.garrison) { const g = world.squads.get(s.garrison); if (g) leaveGarrison(world, g); }
  world.structures.delete(id);
}

export function undo(world, team) {
  if (world.phase !== 'prepare') return false;
  const st = world.undo[team];
  while (st.length) {
    const u = st.pop();
    if (u.kind === 'trench') {
      if (!u.snap) continue;
      world.terrain.restore(u.snap);
      world.teams[team].gold += u.cost;
      world.events.push({ type: 'undo', what: 'trench' });
      return true;
    }
    if (u.kind === 'struct') {
      for (const id of u.ids) removeStruct(world, id);
      world.structVersion++;
      world.teams[team].gold += u.cost;
      if (u.restore) makeSegment(world, team, u.restore.type, u.restore.a, u.restore.b);
      world.events.push({ type: 'undo', what: 'build' });
      return true;
    }
    if (u.kind === 'buy') {
      const sq = world.squads.get(u.id);
      if (!sq) continue;
      if (sq.garrison) leaveGarrison(world, sq);
      world.squads.delete(u.id);
      world.soldiers = world.soldiers.filter((s) => s.sq !== sq);
      world.teams[team].gold += u.cost;
      world.events.push({ type: 'undo', what: 'buy' });
      return true;
    }
  }
  return false;
}

// Delete one structure under the cursor during prepare (full refund; a gate gives its wall back).
export function demolish(world, team, id) {
  if (world.phase !== 'prepare') return false;
  const s = world.structures.get(id);
  if (!s || s.team !== team || s.prebuilt) return false;
  const B = BUILD_TYPES[s.type];
  removeStruct(world, id);
  world.structVersion++;
  const refund = (B.cost || B.costPerSeg || 0) * (world.priceMult || 1);
  world.teams[team].gold += refund;
  if (s.kind === 'gate') {
    // give back the wall piece the gate replaced (unrefunded: it was already paid for)
    const u = world.undo[team].find((q) => q.kind === 'struct' && q.ids.includes(id) && q.restore);
    if (u) { makeSegment(world, team, u.restore.type, s.a, s.b); u.restore = null; u.cost = 0; }
  }
  // the undo entry for it no longer refunds
  for (const q of world.undo[team]) if (q.kind === 'struct' && q.ids.includes(id)) { q.ids = q.ids.filter((x) => x !== id); q.cost = q.ids.length ? Math.max(0, q.cost - refund) : 0; }
  return true;
}

export { structDist };
