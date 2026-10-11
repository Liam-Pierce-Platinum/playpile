// BANNERFALL :: sim/combat.js - the damage formula, kills, XP, and the spatial hash queries.
// final = max(1, raw * 10 / (10 + armour * (1 - pierce))) * cover      (DESIGN.md 2.2)
import { C } from '../data/constants.js';
import { UNIT_TYPES } from '../data/units.js';
import { hostile } from './factions.js';

// ---- spatial hash of living soldiers (rebuilt every step by world.step) ----
// Only the cells used last step are cleared (a 4 km map has a million cells; a battle uses a few
// thousand of them), so the rebuild costs the same on a 256 m field and on a 4 km war map.
export function rebuildHash(world) {
  const cs = C.CELL, W = Math.ceil(world.terrain.size / cs);
  let H = world.hash;
  if (!H || H.W !== W) { H = world.hash = { W, cs, head: new Int32Array(W * W).fill(-1), next: new Int32Array(1024), used: new Int32Array(1024), nUsed: 0 }; }
  const list = world.soldiers;
  if (H.next.length < list.length) { H.next = new Int32Array(list.length * 2); }
  if (H.used.length < list.length) { const u = new Int32Array(list.length * 2); u.set(H.used.subarray(0, H.nUsed)); H.used = u; }
  const head = H.head, used = H.used;
  for (let k = 0; k < H.nUsed; k++) head[used[k]] = -1;
  let nu = 0;
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!s.alive) continue;
    let ci = Math.floor(s.x / cs), cj = Math.floor(s.z / cs);
    if (ci < 0) ci = 0; if (cj < 0) cj = 0; if (ci >= W) ci = W - 1; if (cj >= W) cj = W - 1;
    const c = cj * W + ci;
    if (head[c] === -1) used[nu++] = c;
    H.next[i] = head[c];
    head[c] = i;
  }
  H.nUsed = nu;
}

export function forNear(world, x, z, r, fn) {
  const H = world.hash, cs = H.cs, W = H.W, list = world.soldiers;
  const i0 = Math.max(0, Math.floor((x - r) / cs)), i1 = Math.min(W - 1, Math.floor((x + r) / cs));
  const j0 = Math.max(0, Math.floor((z - r) / cs)), j1 = Math.min(W - 1, Math.floor((z + r) / cs));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    for (let k = H.head[j * W + i]; k !== -1; k = H.next[k]) fn(list[k]);
  }
}

// nearest living enemy soldier within r, optional filter
export function nearestEnemy(world, so, r, filter) {
  let best = null, bd = r * r;
  const team = so.sq.team;
  forNear(world, so.x, so.z, r, (o) => {
    if (!o.alive || o.sq.garrison || !hostile(world, team, o.sq.team)) return;
    if (filter && !filter(o)) return;
    const dx = o.x - so.x, dz = o.z - so.z;
    let d = dx * dx + dz * dz;
    if (o.sq.def.engine) d -= 1.5;   // the big engine is easy to reach
    if (d < bd) { bd = d; best = o; }
  });
  return best;
}

// ---- damage ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// which side of the target the blow comes from: 0 front, 1 side, 2 rear
export function flankSide(tgt, fromX, fromZ) {
  const dx = fromX - tgt.x, dz = fromZ - tgt.z;
  const l = Math.hypot(dx, dz) || 1;
  const c = (dx * Math.sin(tgt.facing) + dz * Math.cos(tgt.facing)) / l;
  return c > 0.5 ? 0 : c > -0.5 ? 1 : 2;
}

/**
 * opts: { melee, ranged, kind:'arrow'|'bolt'|'fire'|'stone', pierce, fromX, fromZ, fromY, splash }
 * returns the final damage dealt (0 if blocked)
 */
export function computeDamage(world, att, tgt, base, opts) {
  const aDef = att ? att.sq.def : null, tDef = tgt.sq.def, tsq = tgt.sq;
  let raw = base;
  // counter
  if (aDef && opts.melee && aDef.melee && aDef.melee.vs) raw *= aDef.melee.vs[tDef.cls] || 1;
  // height
  if (att && !opts.splash) {
    const dh = (opts.fromY !== undefined ? opts.fromY : att.y) - tgt.y;
    if (opts.ranged) raw *= clamp(1 + 0.03 * dh, 0.8, 1.3);
    else if (dh > 1.5) raw *= 1.1; else if (dh < -1.5) raw *= 0.9;
  }
  // flank
  const side = opts.splash ? 0 : flankSide(tgt, opts.fromX, opts.fromZ);
  if (side === 1) raw *= tsq.formation === 'wedge' ? 1.4 : 1.25;
  else if (side === 2) raw *= 1.5;
  if (side > 0 && opts.melee) tsq.flankHits += side === 1 ? C.MORALE_FLANK_SIDE : C.MORALE_FLANK_REAR;
  // veterancy, disorder, wavering, formation
  if (att) {
    const asq = att.sq;
    raw *= 1 + 0.08 * asq.vet;
    if (att.disordered) raw *= C.DISORDER_DMG;
    if (asq.state === 'wavering') raw *= 0.8;
    if (opts.melee && asq.formation === 'loose') raw *= 0.85;
  }
  if (tgt.disordered) raw *= C.DISORDER_TAKEN;
  const effArm = tDef.armour * (1 - (opts.pierce || 0));
  let final = Math.max(1, (raw * 10) / (10 + effArm));
  // cover (ranged only)
  if (opts.ranged) {
    if (tDef.arrowMult && !opts.splash) final *= tDef.arrowMult;
    if (tsq.entrenched && tgt.inTrench) final *= opts.kind === 'bolt' ? C.TRENCH_COVER_BOLT : world.techs[tsq.team].has('deepTrench') ? 0.4 : C.TRENCH_COVER;
    if (tsq.pavise > world.t && tsq.stillT > 1) final *= 0.5;
    if (tDef.tags.includes('shield') && side === 0 && !opts.splash) {
      final *= tsq.shieldWall ? C.SHIELD_WALL_FRONT : C.SHIELD_FRONT;
      world.events.push({ type: 'tink', x: tgt.x, y: tgt.y + 1.2, z: tgt.z });
    }
    if (tsq.garrison) final *= tsq.garrisonWall ? 0.3 : 0.6;
    // shieldbearers: a moving pavise wall in front of friendly shooters (v3.1 roster)
    if (world.war && !opts.splash && tDef.ranged) final *= paviseCover(world, tgt, opts.fromX, opts.fromZ);
    if (opts.splash && tsq.formation === 'loose') final *= 0.6;
  }
  return final;
}

function paviseCover(world, tgt, fx, fz) {
  if (fx === undefined) return 1;
  if (world._coverT !== world.tick) { world._coverT = world.tick; world._covers = []; for (const p of world.squads.values()) if (p.def.cover && p.alive > 0 && p.deployed && p.state !== 'routing') world._covers.push(p); }
  for (const p of world._covers) {
    if (p.team !== tgt.sq.team) continue;
    const R = p.def.cover.radius;
    const dx = tgt.x - p.cx, dz = tgt.z - p.cz;
    if (dx * dx + dz * dz > R * R) continue;
    // the shot must come from in front of the shields
    const sx = fx - p.cx, sz = fz - p.cz;
    if (sx * Math.sin(p.facing) + sz * Math.cos(p.facing) > 0) return p.def.cover.mult;
  }
  return 1;
}

export function applyDamage(world, att, tgt, base, opts) {
  if (!tgt.alive) return 0;
  const dmg = computeDamage(world, att, tgt, base, opts);
  tgt.hp -= dmg;
  tgt.hitT = world.t;
  tgt.sq.lastHitT = world.t;
  tgt.sq.dmgTaken += dmg;
  if (att) {
    att.sq.xp += dmg / 10;
    att.sq.dmgDealt += dmg;
    att.sq.lastContactT = world.t;
  }
  if (!opts.quiet) world.events.push({ type: 'hit', x: tgt.x, y: tgt.y + (tgt.sq.def.tags.includes('cavalry') ? 1.8 : 1.1), z: tgt.z, melee: !!opts.melee, team: tgt.sq.team, big: dmg > 30, metal: tgt.sq.def.armour >= 5, engine: !!tgt.sq.def.engine });
  if (tgt.hp <= 0) kill(world, tgt, att);
  return dmg;
}

// Field Surgeons: a man who falls inside a friendly healing ring is only downed
function inHealRing(world, so) {
  for (const h of world.squads.values()) {
    if (h.team !== so.sq.team || !h.def.heal || h.alive <= 0 || !h.deployed || h.state === 'routing') continue;
    const R = h.def.heal.radius;
    if ((h.cx - so.x) ** 2 + (h.cz - so.z) ** 2 < R * R) return true;
  }
  return false;
}

export function kill(world, so, att) {
  if (!so.alive) return;
  const sq = so.sq;
  const downed = world.techs[sq.team].has('surgeons') && !sq.def.engine && !sq.def.tags.includes('cavalry') && !sq.def.heal && inHealRing(world, so);
  so.alive = false;
  so.hp = 0;
  so.deadT = world.t;
  so.downed = downed ? world.t + 20 : 0;
  so.deathDir = att ? Math.atan2(so.x - att.x, so.z - att.z) : so.facing + Math.PI;
  sq.alive--;
  sq.reslot = true;
  sq.lost++;
  sq.morale -= C.MORALE_LOSS_PER_PCT * (100 / sq.menMax);
  if (sq.inAura && sq.morale < C.HEAL_FLOOR_MORALE) sq.morale = Math.max(sq.morale, C.HEAL_FLOOR_MORALE);
  if (att) { att.sq.morale = Math.min(100, att.sq.morale + C.MORALE_KILL); att.sq.kills++; }
  world.teams[sq.team].lost++;
  if (att) { const L = world.teams[sq.team].lostTo || (world.teams[sq.team].lostTo = {}); L[att.sq.team] = (L[att.sq.team] || 0) + 1; }
  world.events.push({ type: 'death', x: so.x, y: so.y, z: so.z, team: sq.team, unit: sq.type, sq: sq.id, engine: !!sq.def.engine });
  if (sq.type === 'commander' || sq.type === 'king') {
    for (const o of world.squads.values()) if (o.team === sq.team) o.morale -= C.MORALE_COMMANDER_DEATH;
    world.events.push({ type: 'toast', team: sq.team, text: sq.type === 'king' ? 'King Oswin has fallen!' : sq.team === 0 ? 'The Marshal has fallen!' : 'Their captain is down!' });
    if (sq.type === 'king') world.kingSlain = true;
  }
  if (sq.alive <= 0) {
    sq.state = 'dead';
    if (sq.garrison) { const tw = world.structures.get(sq.garrison); if (tw && tw.garrison === sq.id) tw.garrison = null; sq.garrison = null; }
    world.events.push({ type: 'squadDead', sq: sq.id, team: sq.team, name: sq.name, unit: sq.type });
    // the war banner falls: every squad that could see it loses heart
    if (sq.def.aura) for (const o of world.squads.values()) if (o.team === sq.team && o !== sq && o.alive > 0 && Math.hypot(o.cx - sq.cx, o.cz - sq.cz) < 45) o.morale -= 15;
    if (sq.def.engine) world.events.push({ type: 'toast', team: sq.team, text: sq.team === 0 ? 'Our ' + sq.def.short.toLowerCase() + ' is destroyed!' : 'Their ' + sq.def.short.toLowerCase() + ' is wrecked!' });
  }
}

// a monk raises a downed man (Field Surgeons)
export function revive(world, so) {
  const sq = so.sq;
  if (so.alive || !so.downed || sq.state === 'gone') return false;
  so.alive = true; so.downed = 0; so.hp = so.maxHp * 0.35; so.fallT = 0;
  sq.alive++; sq.lost--; sq.reslot = true;
  world.teams[sq.team].lost--;
  if (sq.state === 'dead') sq.state = 'wavering';
  world.events.push({ type: 'revive', x: so.x, y: so.y, z: so.z, team: sq.team });
  return true;
}

export function unitDef(type) { return UNIT_TYPES[type]; }
