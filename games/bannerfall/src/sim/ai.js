// BANNERFALL :: sim/ai.js - the Varkhal war council (DESIGN.md 6), three layers:
//   strategist  doctrine -> army composition from a gold budget, plus counter-picks that read
//               the player's army (archers? send horse. horse? spears. walls? engines.)
//   builder     raises the battle's fort, or digs trench arcs across the approach corridors it
//               finds with the same A* the soldiers use, plants stakes, rings its flag
//   tactician   attack posture (waves gather, engines batter towers then the gate, the line waits
//               for a breach, the cavalry hammer swings wide to the flank, shooters focus fire,
//               monks follow the line) or defend posture (posts, focus fire, reserves plug
//               breaches, horse sally at engines, everyone hunts what reaches the flag);
//               squads fall back to the monks when shaken; the army sounds a general retreat.
// It only ever uses the command API (orders.js) once squads are in the field, like the player.
// The bot that plays YOUR side in tests and on the title screen is this same code.
import { issue, buy, deploy, build, previewBuild, useAbility } from './orders.js';
import { createSquad, placeSquad, squadWidth, structDist } from './squads.js';
import { startRout } from './morale.js';
import { findPath } from './nav.js';
import { structList, segCross } from './structures.js';
import { pointInPoly } from './mapgen.js';
import { mulberry32 } from './rng.js';
import { UNIT_TYPES } from '../data/units.js';

const DIFF = {
  recruit: { tick: 2.0, hunt: 1.3, focus: false, flank: false, feint: false, secondTrench: false },
  captain: { tick: 1.0, hunt: 2.0, focus: true, flank: true, feint: false, secondTrench: false },
  warlord: { tick: 0.5, hunt: 2.5, focus: true, flank: true, feint: true, secondTrench: true },
};

export const DOCTRINES = {
  horde: { name: 'Horde', w: { spear: 0.45, sword: 0.15, archer: 0.22, outrider: 0.1, healer: 0.05, xbow: 0.03 } },
  shieldbow: { name: 'Shield and Bow', w: { spear: 0.3, sword: 0.2, archer: 0.3, xbow: 0.06, healer: 0.08, outrider: 0.06 } },
  hammer: { name: 'Hammer and Anvil', w: { spear: 0.3, sword: 0.14, archer: 0.2, outrider: 0.22, healer: 0.08, xbow: 0.06 } },
  turtle: { name: 'Turtle', w: { spear: 0.24, sword: 0.16, archer: 0.3, xbow: 0.16, healer: 0.14 } },
  siege: { name: 'Siege Train', w: { spear: 0.26, sword: 0.2, archer: 0.22, xbow: 0.1, healer: 0.1, outrider: 0.07, mangonel: 0.05 } },
  royal: { name: 'Royal Host', w: { spear: 0.2, sword: 0.2, archer: 0.18, xbow: 0.12, knight: 0.14, healer: 0.1, outrider: 0.06 } },
  // war maps (sim/war.js, sim/warai.js): the v3.1 roster. The v1 battles keep the doctrines above.
  w_horde: { name: 'Horde', w: { spear: 0.24, militia: 0.12, sword: 0.14, archer: 0.14, javelin: 0.08, outrider: 0.1, horseArcher: 0.08, healer: 0.04, xbow: 0.03, standard: 0.03 } },
  w_shieldbow: { name: 'Shield and Bow', w: { spear: 0.2, sword: 0.14, pike: 0.06, archer: 0.2, longbow: 0.08, shieldbearer: 0.06, xbow: 0.06, healer: 0.08, outrider: 0.06, standard: 0.03, surgeon: 0.03 } },
  w_hammer: { name: 'Hammer and Anvil', w: { spear: 0.18, pike: 0.08, sword: 0.1, archer: 0.14, longbow: 0.06, javelin: 0.06, outrider: 0.14, horseArcher: 0.1, healer: 0.07, standard: 0.04 } },
  w_turtle: { name: 'Turtle', w: { spear: 0.14, pike: 0.12, sword: 0.1, menAtArms: 0.06, archer: 0.16, xbow: 0.16, shieldbearer: 0.08, healer: 0.1, ballista: 0.03, standard: 0.03 } },
  w_royal: { name: 'Royal Host', w: { spear: 0.12, pike: 0.06, sword: 0.12, menAtArms: 0.1, halberd: 0.06, archer: 0.12, longbow: 0.05, xbow: 0.1, knight: 0.1, heavyCav: 0.04, healer: 0.07, outrider: 0.04, standard: 0.03 } },
  w_siege: { name: 'Siege Train', w: { spear: 0.18, sword: 0.14, halberd: 0.06, archer: 0.16, xbow: 0.1, healer: 0.08, outrider: 0.06, mangonel: 0.04, ballista: 0.03, standard: 0.03 } },
};
export const warDoctrine = (d) => (DOCTRINES['w_' + d] ? 'w_' + d : d);

// ---------------------------------------------------------------- strategist
export function compose(world, budget, doctrine, must = [], rng = world.rng, cap = 60, team = 1) {
  const W = (DOCTRINES[doctrine] || DOCTRINES.horde).w;
  const D = world.defs[team];
  const out = [];
  let left = budget;
  for (const u of must) { out.push(u); left -= D[u].cost; }
  const keys = Object.keys(W);
  const total = keys.reduce((a, k) => a + W[k], 0);
  const minCost = Math.min(...keys.map((k) => D[k].cost));
  let guard = 0;
  while (left >= minCost && out.length < cap && guard++ < 400) {
    let r = rng() * total, pick = keys[0];
    for (const k of keys) { r -= W[k]; if (r <= 0) { pick = k; break; } }
    if (D[pick].cost > left) continue;
    out.push(pick); left -= D[pick].cost;
  }
  return out;
}

// read the other side's army and pick what beats it
export function counterPicks(world, team, budget, rng = world.rng) {
  const c = { ranged: 0, cav: 0, spear: 0, sword: 0, heal: 0, engine: 0 };
  for (const s of world.squads.values()) {
    if (s.team === team || s.alive <= 0 || s.state === 'gone') continue;
    if (s.def.engine) c.engine++;
    else if (s.def.heal) c.heal += s.alive;
    else if (s.def.ranged) c.ranged += s.alive;
    else if (s.def.tags.includes('cavalry')) c.cav += s.alive;
    else if (s.type === 'spear') c.spear += s.alive;
    else c.sword += s.alive;
  }
  const walls = structList(world).filter((s) => s.team !== team && (s.kind === 'wall' || s.kind === 'tower')).length;
  const w = {
    outrider: c.ranged * 1.2 + c.heal * 3 + c.engine * 12,
    spear: c.cav * 2.5 + 4,
    sword: c.spear * 1.2 + c.ranged * 0.6 + 4,
    archer: c.spear * 1.0 + c.heal * 1.5 + 4,
    xbow: c.sword * 0.8 + c.cav * 0.6,
  };
  if (walls > 6 && world.mode === 'defend') w.mangonel = walls * 0.6;
  const keys = Object.keys(w), total = keys.reduce((a, k) => a + w[k], 0);
  const out = [], D = world.defs[1];
  let left = budget, guard = 0;
  while (left >= 60 && guard++ < 100) {
    let r = rng() * total, pick = keys[0];
    for (const k of keys) { r -= w[k]; if (r <= 0) { pick = k; break; } }
    if (D[pick].cost > left) { if (left < 120) break; continue; }
    out.push(pick); left -= D[pick].cost;
  }
  return out;
}

const describe = (units) => {
  const c = {}; for (const u of units) c[u] = (c[u] || 0) + 1;
  const name = { spear: 'spears', sword: 'swords', archer: 'archers', xbow: 'crossbows', outrider: 'horse', knight: 'knights', healer: 'monks', mangonel: 'mangonels', ram: 'rams', trebuchet: 'trebuchets', sapper: 'sappers' };
  return Object.entries(c).map(([k, v]) => v + ' ' + (name[k] || k)).join(', ');
};
export { describe as describeUnits };

// ---------------------------------------------------------------- waves (defend battles)
export function prepareWaves(world) {
  const E = world.def.enemy || {};
  const rng = mulberry32(world.seed * 13 + 5);
  const scale = world.enemyScale;
  let plan = [];
  if (E.waves) {
    for (const wv of E.waves) {
      let units = wv.units;
      if (scale < 0.95) units = units.filter((u, i) => (i * 0.37 + 0.1) % 1 < scale);
      if (scale > 1.05) { const extra = []; let acc = 0; units.forEach((u) => { acc += scale - 1; while (acc >= 1) { extra.push(u); acc -= 1; } }); units = units.concat(extra); }
      plan.push({ t: wv.t, spawn: wv.spawn || 0, units, counter: 0 });
    }
  } else {
    const P = E.wavePlan || {};
    const count = P.count || 4, first = P.first || 15, gap = P.gap || 70;
    const budget = (E.budget || 4000) * scale;
    const shares = [1, 1.25, 1.55, 1.9, 2.3, 2.7].slice(0, count);
    const tot = shares.reduce((a, b) => a + b, 0);
    const must = (P.must || []).slice();
    for (let i = 0; i < count; i++) {
      const b = budget * shares[i] / tot;
      // heavy kit comes later: engines from wave 2, knights from the middle on
      const mine = [];
      for (let k = must.length - 1; k >= 0; k--) {
        const u = must[k];
        const okNow = (u === 'mangonel' || u === 'ram' || u === 'trebuchet') ? i >= 1 : u === 'knight' ? i >= Math.floor(count / 2) - 1 : true;
        if (okNow && mine.filter((x) => x === u).length < Math.ceil(must.filter((x) => x === u).length / Math.max(1, count - i))) { mine.push(u); must.splice(k, 1); }
      }
      const counter = i >= 1 ? Math.round(b * 0.25) : 0;
      plan.push({ t: first + i * gap, spawn: i % Math.max(1, world.def.zones.enemySpawn.length), units: compose(world, b - counter, E.doctrine, mine, rng, 30), counter });
    }
  }
  world.ai.plan = plan;
  world.ai.spawned = plan.map(() => false);
  world.def.enemy = { ...E, waves: plan };   // the HUD and scout report read these
}

export function spawnWaves(world) {
  const A = world.ai;
  const plan = A.plan;
  if (!plan || !plan.length || world.mode !== 'defend') return;
  for (let w = 0; w < plan.length; w++) {
    const wave = plan[w];
    if (A.spawned[w] || world.t < wave.t) continue;
    A.spawned[w] = true;
    let units = wave.units;
    if (wave.counter) units = units.concat(counterPicks(world, 1, wave.counter));
    const sp = world.def.zones.enemySpawn[wave.spawn || 0];
    const ids = [];
    const rows = { front: [], back: [], wing: [], siege: [] };
    for (const type of units) {
      const d = UNIT_TYPES[type];
      (d.engine ? rows.siege : d.tags.includes('cavalry') ? rows.wing : d.ranged || d.heal ? rows.back : rows.front).push(type);
    }
    const size = world.terrain.size;
    const put = (type, x, z) => {
      const sq = createSquad(world, 1, type, { wave: w });
      placeSquad(world, sq, Math.max(14, Math.min(size - 14, x)), Math.min(size - 6, z), Math.PI);
      sq.muster = world.t + 4 + world.rng() * 2;
      ids.push(sq.id);
      A.menSpawned += sq.menMax;
    };
    rows.front.forEach((type, i) => put(type, sp[0] + (i - (rows.front.length - 1) / 2) * 17, sp[1] - 4));
    rows.back.forEach((type, i) => put(type, sp[0] + (i - (rows.back.length - 1) / 2) * 15, sp[1] + 8));
    rows.siege.forEach((type, i) => put(type, sp[0] + (i - (rows.siege.length - 1) / 2) * 18, sp[1] + 3));
    const half = (rows.front.length - 1) / 2 * 17 + 16;
    rows.wing.forEach((type, i) => put(type, sp[0] + (i % 2 ? 1 : -1) * (half + Math.floor(i / 2) * 14), sp[1]));
    A.waves.push({ ids, t: world.t, phase: 'gather', n: w });
    world.events.push({ type: 'wave', n: w + 1, total: plan.length, x: sp[0], z: sp[1] });
    world.events.push({ type: 'toast', team: 0, text: `Wave ${w + 1} of ${plan.length}: ${describe(units)}`, horn: true });
  }
}

// ---------------------------------------------------------------- builder
const unit = (dx, dz) => { const l = Math.hypot(dx, dz) || 1; return [dx / l, dz / l]; };
function zoneCentre(poly) { let x = 0, z = 0; for (const p of poly) { x += p[0]; z += p[1]; } return [x / poly.length, z / poly.length]; }

// build an authored fort spec; opts.free skips the cost
export function fortify(world, team, spec, opts = {}) {
  const o = { free: !!opts.free, force: true, anywhere: true };
  const built = { towers: [], gates: [] };
  const homeSign = team === 0 ? -1 : 1;
  for (const R of spec.rects || []) {
    const [cx, cz] = R.c, hw = R.w / 2, hd = R.d / 2;
    const C4 = [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]];
    if (R.corners) for (const p of C4) { const r = build(world, team, R.corners, [p], o); if (r.ids) built.towers.push(r.ids[0]); }
    const inset = R.corners ? 3.2 : 0;
    for (let i = 0; i < 4; i++) {
      const a = C4[i], b = C4[(i + 1) % 4];
      const [ux, uz] = unit(b[0] - a[0], b[1] - a[1]);
      build(world, team, R.wall, [[a[0] + ux * inset, a[1] + uz * inset], [b[0] - ux * inset, b[1] - uz * inset]], o);
    }
    if (R.gate) {
      const side = R.gateSide || (team === 1 ? 'south' : 'north');
      const gp = side === 'south' ? [cx, cz - hd] : side === 'north' ? [cx, cz + hd] : side === 'east' ? [cx + hw, cz] : [cx - hw, cz];
      const r = build(world, team, R.gate, [gp], { ...o, tag: R.tag });
      if (r.ids) built.gates.push(r.ids[r.ids.length - 1]);
    }
  }
  for (const R of spec.rings || []) {
    const [cx, cz] = R.c, n = R.sides || 12;
    const pts = [];
    for (let i = 0; i <= n; i++) { const a = R.gateDir + Math.PI / n + (i / n) * Math.PI * 2; pts.push([cx + Math.cos(a) * R.r, cz + Math.sin(a) * R.r]); }
    build(world, team, R.wall, pts, o);
    if (R.gate) {
      const gp = [cx + Math.cos(R.gateDir) * R.r * 0.985, cz + Math.sin(R.gateDir) * R.r * 0.985];
      const r = build(world, team, R.gate, [gp], { ...o, tag: R.tag });
      if (r.ids) built.gates.push(r.ids[r.ids.length - 1]);
    }
  }
  for (const L of spec.lines || []) build(world, team, L.type, L.pts, { ...o, enemyDir: [0, -homeSign] });
  for (const G of spec.gates || []) { const r = build(world, team, G.type, [G.pos], { ...o, tag: G.tag }); if (r.ids) built.gates.push(r.ids[r.ids.length - 1]); }
  for (const T of spec.towers || []) { const r = build(world, team, T.type, [T.pos], o); if (r.ids) built.towers.push(r.ids[0]); }
  return built;
}

// the corridor builder (DESIGN.md 6.2): A* from the attacker's ground to the flag, three ways,
// a trench arc across each corridor 40-70 m out, stakes where horse could charge, then a ring
export function autoFort(world, team, budget, opts = {}) {
  const T = world.teams[team];
  const keep = T.gold;
  T.gold = budget;
  const F = opts.at || world.homeFlag[team];
  const foeZone = team === 1 ? world.def.zones.player : world.def.zones.enemy;
  const [zx, zz] = zoneCentre(foeZone);
  const D = DIFF[world.difficulty] || DIFF.captain;
  const arcs = [];
  const dist = opts.dist || 52;
  for (const dx of [0, -55, 55]) {
    const start = [Math.max(10, Math.min(world.terrain.size - 10, zx + dx)), zz];
    const path = [start].concat(findPath(world, 1 - team, start, F));
    // walk back from the flag along the path, 2 m at a time, until dist metres out
    let P = null, dir = null;
    outer: for (let i = path.length - 1; i > 0; i--) {
      const A = path[i], B = path[i - 1], L = Math.hypot(B[0] - A[0], B[1] - A[1]);
      for (let u = 0; u <= L; u += 2) {
        const x = A[0] + (B[0] - A[0]) * (u / L), z = A[1] + (B[1] - A[1]) * (u / L);
        if (Math.hypot(x - F[0], z - F[1]) >= dist) { P = [x, z]; dir = unit(B[0] - A[0], B[1] - A[1]); break outer; }
      }
    }
    if (!P) continue;
    if (arcs.some((a) => Math.hypot(a[0] - P[0], a[1] - P[1]) < 26)) continue;
    arcs.push(P);
    const px = -dir[1], pz = dir[0], half = 18;
    const pts = [];
    for (let u = -half; u <= half; u += 4) { const bow = (1 - (u / half) ** 2) * 3; pts.push([P[0] + px * u + dir[0] * bow, P[1] + pz * u + dir[1] * bow]); }
    build(world, team, 'trench', pts, { anywhere: true, enemyDir: dir });
    // stakes in front where it is flat and open
    const sp = [[P[0] + px * -12 + dir[0] * 7, P[1] + pz * -12 + dir[1] * 7], [P[0] + px * 12 + dir[0] * 7, P[1] + pz * 12 + dir[1] * 7]];
    if (world.terrain.slope(P[0] + dir[0] * 7, P[1] + dir[1] * 7) < 0.25) build(world, team, 'stakes', sp, { anywhere: true });
    if (D.secondTrench && T.gold > 200) {
      const Q = [P[0] + dir[0] * 22, P[1] + dir[1] * 22];
      const p2 = []; for (let u = -half; u <= half; u += 4) p2.push([Q[0] + px * u, Q[1] + pz * u]);
      build(world, team, 'trench', p2, { anywhere: true, enemyDir: dir });
    }
  }
  if (opts.ring && T.gold > 600) {
    const [fx, fz] = unit(zx - F[0], zz - F[1]);
    const rear = Math.atan2(-fz, -fx);
    fortify(world, team, { rings: [{ c: F, r: 26, sides: 12, wall: 'palisade', gate: 'gate', gateDir: rear }] });
    for (const s of [-1, 1]) { const a = Math.atan2(fz, fx) + s * 0.9; build(world, team, 'tower', [[F[0] + Math.cos(a) * 18, F[1] + Math.sin(a) * 18]], { anywhere: true }); }
  }
  const spent = budget - T.gold;
  T.gold = keep;
  return spent;
}

// the garrison of an assault or field battle: fort, army, posts
export function enemyPrepare(world) {
  const E = world.def.enemy || {};
  const G = E.garrison || { budget: 2400, doctrine: E.doctrine || 'shieldbow' };
  const rng = mulberry32(world.seed * 11 + 7);
  world.teams[1].gold = 1e6;
  const field = world.mode === 'field';
  if (E.fort && !E.fort.auto && world.mode === 'attack' && world.def.campaignType === 'attack') fortify(world, 1, E.fort, { free: true });
  else autoFort(world, 1, Math.round((E.fort && E.fort.budget) || (field ? 420 : 1300) * world.enemyScale), field ? { at: zoneCentre(world.def.zones.enemy), dist: 30 } : { ring: true });
  world.teams[1].gold = 0;
  const budget = G.budget * world.enemyScale;
  const reserveB = Math.round(budget * 0.18);
  const units = compose(world, budget - reserveB, G.doctrine || E.doctrine, G.must || [], rng, 36);
  world.ai.reserveBudget = reserveB;
  deployGarrison(world, units, field);
}

// find the line Varkhal defends: the nearest own wall or trench out toward the player
function frontLine(world, team, F, dir) {
  const ss = structList(world).filter((s) => s.team === team && (s.kind === 'wall' || s.kind === 'gate'));
  let wallD = null;
  for (let d = 4; d < 110; d += 2) {
    const x0 = F[0] + dir[0] * (d - 2), z0 = F[1] + dir[1] * (d - 2), x1 = F[0] + dir[0] * d, z1 = F[1] + dir[1] * d;
    if (ss.some((s) => segCross(x0, z0, x1, z1, s) >= 0)) { wallD = d - 1; break; }
  }
  let trenchD = null;
  for (let d = 4; d < 110; d += 1) if (world.terrain.isTrench(F[0] + dir[0] * d, F[1] + dir[1] * d)) { trenchD = d; break; }
  return { wallD, trenchD };
}

function deployGarrison(world, units, field) {
  const F = field ? zoneCentre(world.def.zones.enemy) : world.homeFlag[1];
  const [zx, zz] = zoneCentre(world.def.zones.player);
  const dir = unit(zx - F[0], zz - F[1]);
  const perp = [-dir[1], dir[0]];
  const { wallD, trenchD } = frontLine(world, 1, F, dir);
  const S = world.terrain.size;
  const at = (d, u) => [Math.max(12, Math.min(S - 12, F[0] + dir[0] * d + perp[0] * u)), Math.max(12, Math.min(S - 12, F[1] + dir[1] * d + perp[1] * u))];
  const facing = Math.atan2(dir[0], dir[1]);
  const sqs = units.map((u) => createSquad(world, 1, u, {}));
  createSquad(world, 1, 'commander', {});
  const all = [...world.squads.values()].filter((s) => s.team === 1);
  const shooters = all.filter((s) => s.def.ranged && !s.def.engine);
  const engines = all.filter((s) => s.def.engine);
  const melee = all.filter((s) => !s.def.ranged && !s.def.heal && !s.def.engine && !s.def.tags.includes('cavalry'));
  const cav = all.filter((s) => s.def.tags.includes('cavalry') && s.type !== 'commander');
  const heal = all.filter((s) => s.def.heal);
  const cmd = all.filter((s) => s.type === 'commander');
  const row = (list, d, spacing) => list.forEach((s, i) => { const [x, z] = at(d, (i - (list.length - 1) / 2) * spacing); placeSquad(world, s, x, z, facing); s.post = [x, z]; s.role = s.role || 'post'; });
  // shooters: towers first, then the stone wall-walk, then a line behind the earthworks
  const towers = structList(world).filter((s) => s.team === 1 && s.kind === 'tower').sort((p, q) => Math.hypot(p.pos[0] - zx, p.pos[1] - zz) - Math.hypot(q.pos[0] - zx, q.pos[1] - zz));
  for (const tw of towers) { const a = shooters.shift(); if (!a) break; placeSquad(world, a, tw.pos[0], tw.pos[1] + 4, facing); issue(world, 1, [a.id], { type: 'garrison', structureId: tw.id }); a.role = 'post'; }
  const walls = structList(world).filter((s) => s.team === 1 && s.type === 'stoneWall');
  if (walls.length) {
    // spread shooters along the wall facing the player, nearest the gate first
    const front = walls.filter((s) => { const m = [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]; return ((m[0] - F[0]) * dir[0] + (m[1] - F[1]) * dir[1]) > 0; });
    front.sort((p, q) => Math.abs(((p.a[0] + p.b[0]) / 2 - F[0]) * perp[0] + ((p.a[1] + p.b[1]) / 2 - F[1]) * perp[1]) - Math.abs(((q.a[0] + q.b[0]) / 2 - F[0]) * perp[0] + ((q.a[1] + q.b[1]) / 2 - F[1]) * perp[1]));
    const used = [];
    for (const w of front) {
      if (!shooters.length) break;
      const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
      if (used.some((u) => Math.hypot(u[0] - m[0], u[1] - m[1]) < 15)) continue;
      used.push(m);
      const a = shooters.shift();
      placeSquad(world, a, m[0] - dir[0] * 4, m[1] - dir[1] * 4, facing);
      issue(world, 1, [a.id], { type: 'garrison', structureId: w.id });
      a.role = 'post';
    }
  }
  const base = wallD !== null ? wallD : trenchD !== null ? trenchD : field ? 6 : 30;
  if (wallD !== null) {
    row(shooters, base - 6, 14);
    row(melee, base - 9 - (shooters.length ? 6 : 0), 15);
  } else {
    row(shooters, base, 13);
    row(melee, base + 6, 15);
  }
  row(engines, Math.max(4, base - 26), 26);
  row(heal, base - 16, 26);
  const fl = Math.max(30, Math.min(70, melee.length * 8));
  cav.forEach((s, i) => { const [x, z] = at(base - 22, (i % 2 ? 1 : -1) * (fl * 0.6 + Math.floor(i / 2) * 12)); placeSquad(world, s, x, z, facing); s.post = [x, z]; s.role = 'hammer'; });
  for (const s of cmd) { const [x, z] = at(base - 20, 0); placeSquad(world, s, x, z, facing); s.post = [x, z]; }
  for (const s of melee.slice(-Math.ceil(melee.length * 0.3))) if (!field) s.role = 'reserve';
  // in a field battle the whole army will march; give the line its post anyway
}

// assault/field battles: at the horn, Varkhal reads your deployed army and adds counters
export function battleStartAI(world) {
  if (world.mode === 'defend' || !world.ai.reserveBudget) return;
  const picks = counterPicks(world, 1, world.ai.reserveBudget);
  const F = world.mode === 'field' ? zoneCentre(world.def.zones.enemy) : world.homeFlag[1];
  const [zx, zz] = zoneCentre(world.def.zones.player);
  const dir = unit(zx - F[0], zz - F[1]);
  const facing = Math.atan2(dir[0], dir[1]);
  picks.forEach((u, i) => {
    const sq = createSquad(world, 1, u, {});
    const x = F[0] - dir[0] * 14 + (-dir[1]) * (i - (picks.length - 1) / 2) * 14, z = F[1] - dir[1] * 14 + dir[0] * (i - (picks.length - 1) / 2) * 14;
    placeSquad(world, sq, Math.max(12, Math.min(world.terrain.size - 12, x)), Math.max(12, Math.min(world.terrain.size - 12, z)), facing);
    sq.post = [sq.lx, sq.lz]; sq.home = sq.post;
    sq.role = sq.def.tags.includes('cavalry') ? 'hammer' : 'reserve';
  });
  if (picks.length) world.events.push({ type: 'toast', team: 1, text: 'Scouts report Varkhal adding ' + describe(picks) + ' to answer your army.' });
}

// the capital's last stand: the Royal Guard and King Oswin
export function spawnReserves(world) {
  const R = world.def.enemy && world.def.enemy.reserves;
  if (!R || world.ai.reservesOut) return;
  world.ai.reservesOut = true;
  const at = R.at;
  const list = R.units.slice();
  const facing = Math.PI;
  list.forEach((u, i) => {
    const sq = createSquad(world, 1, u, { vet: R.vet || 0, guard: true });
    const k = i - (list.length - 1) / 2;
    placeSquad(world, sq, at[0] + k * 9, at[1] + (i % 2) * 6, facing);
    sq.post = [sq.lx, sq.lz]; sq.home = sq.post; sq.role = 'guard';
  });
  if (R.king) { const k = createSquad(world, 1, 'king', {}); placeSquad(world, k, at[0], at[1] + 4, facing); k.post = [k.lx, k.lz]; k.role = 'guard'; }
  world.events.push({ type: 'toast', team: 1, text: 'King Oswin rides out with his Royal Guard!', horn: true });
}

// ---------------------------------------------------------------- tactician
export const AI_DIFF = DIFF;
export function aiTick(world, team, difficulty = 'captain') {
  const D = DIFF[difficulty] || DIFF.captain;
  const A = world.ai;
  const lk = 'last' + team;
  if (world.t - (A[lk] ?? -99) < D.tick) return;
  A[lk] = world.t;
  const mine = [...world.squads.values()].filter((s) => s.team === team && s.deployed && s.alive > 0 && s.state !== 'gone');
  const foes = [...world.squads.values()].filter((s) => s.team !== team && s.deployed && s.alive > 0 && s.state !== 'gone');
  if (team === 1 && !A.retreat && generalRetreat(world, mine, foes)) return;
  const attacking = team === 1 ? world.mode !== 'attack' : world.mode !== 'defend';
  const ctx = { world, team, D, mine, foes, objective: world.def.zones.flag.pos };
  if (attacking) attackTick(ctx); else defendTick(ctx);
}

function generalRetreat(world, mine, foes) {
  const A = world.ai;
  let alive = 0, total = 0;
  for (const s of world.squads.values()) if (s.team === 1 && s.type !== 'commander') { total += s.startMen || s.menMax; if (s.alive > 0 && s.state !== 'routing' && s.state !== 'gone') alive += s.alive; }
  if (world.mode === 'defend' && !A.spawned.every(Boolean)) return false;
  if (world.def.stages && world.stage < world.def.stages.length - 1) return false;
  if (world.ai.reserves && !world.ai.reservesOut) return false;
  const lostFrac = total ? 1 - alive / total : 0;
  let foeMen = 0; for (const s of foes) if (s.state !== 'routing') foeMen += s.alive;
  if (total && (lostFrac > 0.6 || (alive / Math.max(1, foeMen) < 0.35 && alive < 40))) {
    A.retreat = true;
    world.events.push({ type: 'toast', team: 0, text: 'Varkhal sounds the retreat!', horn: true });
    world.events.push({ type: 'retreat', team: 1 });
    for (const s of mine) startRout(world, s);
    return true;
  }
  return false;
}

const hpFrac = (q) => { let hp = 0, mx = 0; for (const so of q.soldiers) if (so.alive) { hp += so.hp; mx += so.maxHp; } return mx ? hp / mx : 1; };
const dist2 = (a, b) => Math.hypot(a.cx - b.cx, a.cz - b.cz);

// score a foe for a squad (DESIGN.md 6.3 target score)
function score(s, f, D) {
  const d = Math.hypot(f.cx - s.cx, f.cz - s.cz);
  const def = s.def, cav = def.tags.includes('cavalry');
  let v = 100 / (1 + d / 30);
  if (f.def.heal || f.def.aura) v *= D.hunt;
  if (f.def.engine) v *= 1.8;
  if (f.state === 'wavering') v *= 1.5;
  if (f.state === 'routing') v *= 0.2;
  if (cav) {
    if (f.def.ranged || f.def.heal || f.def.engine) v *= 2.2;
    if (f.type === 'spear' && f.stance === 'hold') v *= 0.25;
    if (f.entrenched) v *= 0.4;
  } else if (def.ranged) {
    if (f.entrenched) v *= 0.7;
    if (f.def.engine) v *= 0.4;
    if (d > def.ranged.range + 30) v *= 0.3;
  } else {
    if (f.def.ranged) v *= 1.25;
    if (d > 60) v *= 0.5;
  }
  if (f.garrison && !def.ranged) v *= 0.05;
  return v;
}
function bestFoe(s, foes, D, filter) {
  let best = null, bs = -Infinity;
  for (const f of foes) { if (filter && !filter(f)) continue; const v = score(s, f, D); if (v > bs) { bs = v; best = f; } }
  return best;
}

function commonUpkeep(ctx, s) {
  const { world, team, mine } = ctx;
  // shaken and thin: fall back on the monks
  if (s.state === 'wavering' && s.alive < s.menMax * 0.45 && !s.def.heal && !s.def.engine && !s.garrison) {
    const h = mine.find((q) => q.def.heal && q !== s);
    if (h && !(s.order && s.order.retreat)) { issue(world, team, [s.id], { type: 'retreat' }); return true; }
    if (s.order && s.order.retreat) return true;
  }
  return false;
}
function healerTick(ctx, s, towardEnemy) {
  const { world, team, mine } = ctx;
  let worst = null, wh = 1.01;
  for (const q of mine) if (!q.def.heal && !q.def.ranged && !q.def.engine && !q.garrison) { const r = hpFrac(q) - (q.inContact ? 0.1 : 0); if (r < wh) { wh = r; worst = q; } }
  if (!worst) worst = mine.find((q) => q.def.ranged && !q.garrison);
  if (!worst) return;
  const back = 8;
  const to = [worst.cx - towardEnemy[0] * back, worst.cz - towardEnemy[1] * back];
  const cur = s.order && s.order.to;
  if (!cur || Math.hypot(cur[0] - to[0], cur[1] - to[1]) > 7) issue(world, team, [s.id], { type: 'move', to, facing: Math.atan2(towardEnemy[0], towardEnemy[1]) });
  // Sanctuary when the line it follows is bleeding
  if (s.abilityCd <= 0 && worst.inContact && hpFrac(worst) < 0.6) useAbility(world, s);
}

function cmdTick(ctx, s, centre) {
  const { world, team, mine } = ctx;
  if (!centre) return;
  const to = [centre[0], centre[1]];
  const cur = s.order && s.order.to;
  if (!cur || Math.hypot(cur[0] - to[0], cur[1] - to[1]) > 12) issue(world, team, [s.id], { type: 'move', to });
  let shaken = 0;
  for (const q of mine) if (q !== s && (q.state === 'wavering' || q.state === 'routing') && dist2(q, s) < 30) shaken++;
  if (shaken >= 2 && s.abilityCd <= 0) useAbility(world, s);
}

function abilities(ctx, s, target) {
  const { world } = ctx;
  if (s.abilityCd > 0 || !target) return;
  const d = dist2(s, target);
  if (s.def.ability === 'charge' && d < 35 && d > 8) useAbility(world, s);
  if (s.def.ranged && s.def.ranged.kind === 'arrow' && s.def.ability === 'volley' && d < s.def.ranged.range && target.inContact) useAbility(world, s);
  if (s.def.ranged && s.def.ranged.kind === 'bolt' && !s.def.engine && s.def.ability === 'volley' && d < s.def.ranged.range) useAbility(world, s);
  if (s.def.ability === 'warCry' && d < 20) useAbility(world, s);
}

function focusFire(ctx, shooters) {
  const { foes, D } = ctx;
  if (!D.focus || !shooters.length) return;
  // the call goes to the enemy that most of them can reach: monks and wavering men first
  let best = null, bs = -Infinity;
  for (const f of foes) {
    if (f.state === 'routing' || f.def.engine) continue;
    let reach = 0;
    for (const s of shooters) if (dist2(s, f) < s.def.ranged.range) reach++;
    if (!reach) continue;
    const v = reach * (f.def.heal ? D.hunt * 1.5 : 1) * (f.state === 'wavering' ? 1.4 : 1) * (f.def.ranged ? 1.2 : 1) * (f.entrenched ? 0.6 : 1);
    if (v > bs) { bs = v; best = f; }
  }
  for (const s of shooters) s.focus = best ? best.id : null;
}

// ---- attack posture: waves on your flag, the bot storming a fort, both sides in a field battle
export function attackTick(ctx) {
  const { world, team, D, mine, foes, objective } = ctx;
  const age = ctx.age ?? world.t;
  const foeStructs = ctx.foeStructs || structList(world).filter((s) => s.team !== team && s.alive && (s.kind === 'wall' || s.kind === 'gate' || s.kind === 'tower'));
  const fortified = foeStructs.filter((s) => s.kind !== 'tower').length > 3;
  const breached = ctx.breached !== undefined ? ctx.breached : !!(world.breaches && world.breaches[1 - team] && world.breaches[1 - team].length);
  const engines = mine.filter((s) => s.def.engine && s.state !== 'routing');
  // storm when there is a way in AND the wall-walks and towers are mostly cleared (or time presses)
  const wallShooters = foes.filter((f) => f.garrison && f.def.ranged).length;
  const stormReady = breached && (wallShooters <= 2 || age > (team === 0 ? 200 : 140));
  const waitForSiege = fortified && !stormReady && engines.length > 0 && age < (ctx.siegeWait || (team === 0 ? 300 : 160));
  // how far their bows reach from the walls (range + the height of a wall-walk)
  let reach = 0;
  for (const f of foes) if (f.def.ranged && !f.def.engine) reach = Math.max(reach, f.def.ranged.range + (f.garrison ? 9 : 0));
  const holdDist = reach + 12;
  const myCentre = (() => { let x = 0, z = 0, n = 0; for (const s of mine) if (!s.def.engine && !s.garrison && s.state !== 'routing') { x += s.cx; z += s.cz; n++; } return n ? [x / n, z / n] : objective; })();
  const toward = unit(objective[0] - myCentre[0], objective[1] - myCentre[1]);
  const perp = [-toward[1], toward[0]];
  const lineSqs = mine.filter((s) => !s.def.ranged && !s.def.heal && !s.def.engine && !s.def.tags.includes('cavalry'));
  const lineInContact = lineSqs.some((s) => s.inContact);
  // waves: gather at the staging point, wait for stragglers (20 s cap), then go together
  if (team === 1 && world.mode === 'defend') {
    for (const W of world.ai.waves) {
      if (W.phase !== 'gather') continue;
      const sqs = W.ids.map((id) => world.squads.get(id)).filter((s) => s && s.alive > 0 && s.deployed);
      if (!W.stage) {
        const sp = world.def.zones.enemySpawn[world.ai.plan[W.n].spawn || 0];
        W.stage = [sp[0] + (objective[0] - sp[0]) * 0.3, sp[1] + (objective[1] - sp[1]) * 0.3];
        const mus = sqs.filter((s) => !s.def.tags.includes('cavalry'));
        if (mus.length) issue(world, 1, mus.map((s) => s.id), { type: 'move', to: W.stage, attackMove: true });
        W.gT = world.t;
      }
      const ready = sqs.every((s) => s.mode === 'idle' || s.mode === 'melee' || s.mode === 'shoot' || s.def.tags.includes('cavalry'));
      if ((ready && world.t - W.gT > 6) || world.t - W.gT > 20 || sqs.some((s) => s.inContact)) { W.phase = 'go'; for (const s of sqs) s.flanked = false; }
    }
  }
  const gathering = (s) => team === 1 && world.mode === 'defend' && s.wave !== undefined && world.ai.waves.find((W) => W.n === s.wave && W.phase === 'gather');
  const shooters = mine.filter((s) => s.def.ranged && !s.def.engine);
  focusFire(ctx, shooters);
  const canFire = (team === 1 && world.def.enemy && world.def.enemy.fireArrows) || world.defs[team].archer.ability === 'fireArrows';
  const bodies = new Map();   // marching squads grouped by wave: they advance as one formed line
  for (const s of mine) {
    if (s.state === 'routing' || s.garrison) continue;
    if (s.muster && world.t < s.muster) continue;
    if (s.type === 'commander' || s.type === 'king') { cmdTick(ctx, s, [myCentre[0] - toward[0] * 16, myCentre[1] - toward[1] * 16]); continue; }
    if (gathering(s)) continue;
    if (commonUpkeep(ctx, s)) continue;
    const def = s.def, cav = def.tags.includes('cavalry');
    if (def.heal) { healerTick(ctx, s, toward); continue; }
    // engines: batter towers, then the gate, then walls; rams for gates
    if (def.engine) {
      if (s.structTarget && world.structures.get(s.structTarget)?.alive) continue;
      let best = null, bs = -Infinity;
      for (const st of foeStructs) {
        if (def.engine === 'ram' && st.kind === 'tower') continue;
        // a siege tower only docks against a wall piece (stone first) nobody else has docked on
        if (def.engine === 'siegeTower' && (st.kind !== 'wall' || (st.dock && st.dock.sq !== s.id))) continue;
        const d = structDist(st, s.cx, s.cz);
        const toObj = Math.hypot((st.pos ? st.pos[0] : (st.a[0] + st.b[0]) / 2) - objective[0], (st.pos ? st.pos[1] : (st.a[1] + st.b[1]) / 2) - objective[1]);
        let v = -d * 0.4 - toObj * 0.3;
        if (def.engine === 'ram') v += st.kind === 'gate' ? 80 : 0;
        else if (def.engine === 'siegeTower') v += st.type === 'stoneWall' ? 40 : 0;
        else v += st.kind === 'tower' ? (st.garrison ? 60 : 30) : st.kind === 'gate' ? 40 : 10;
        if (v > bs) { bs = v; best = st; }
      }
      // rams wait for the towers over their gate to fall, unless time is pressing
      if (best && def.engine === 'ram' && waitForSiege && engines.some((e) => e.def.ranged)) {
        const bx = best.pos ? best.pos[0] : (best.a[0] + best.b[0]) / 2, bz = best.pos ? best.pos[1] : (best.a[1] + best.b[1]) / 2;
        const covering = foeStructs.some((st) => st.kind === 'tower' && st.garrison && structDist(st, bx, bz) < 40);
        if (covering && age < 80) { if (!s.order) issue(world, team, [s.id], { type: 'move', to: [myCentre[0] - toward[0] * 6, myCentre[1] - toward[1] * 6] }); continue; }
      }
      if (best) issue(world, team, [s.id], { type: 'attackStruct', structureId: best.id });
      else if (def.ranged) {
        const t = bestFoe(s, foes, D, (f) => dist2(s, f) > def.ranged.minRange);
        if (t && (!s.order || s.order.targetId !== t.id)) issue(world, team, [s.id], { type: 'attack', targetId: t.id });
      } else if (!s.order) issue(world, team, [s.id], { type: 'move', to: [myCentre[0] - toward[0] * 10, myCentre[1] - toward[1] * 10] });
      continue;
    }
    const best = bestFoe(s, foes, D, waitForSiege ? (f) => !f.garrison && dist2(s, f) < 45 : null);
    const dBest = best ? dist2(s, best) : Infinity;
    abilities(ctx, s, best);
    if ((s.def.ability === 'brace') && foes.some((f) => f.def.tags.includes('cavalry') && dist2(s, f) < 35 && f.state !== 'routing')) { if (s.stance !== 'hold') issue(world, team, [s.id], { type: 'stance', value: 'hold' }); }
    else if (s.def.ability === 'brace' && s.stance === 'hold') issue(world, team, [s.id], { type: 'stance', value: 'aggressive' });
    // fire arrows: half the archers set the timber alight
    if (canFire && s.def.ranged && s.def.ranged.kind === 'arrow' && !s.def.engine) {
      const wood = foeStructs.filter((st) => st.wood && !st.burning && structDist(st, s.cx, s.cz) < def.ranged.range * 0.9);
      if (wood.length && (s.id.charCodeAt(s.id.length - 1) % 2 === 0)) {
        if (!s.fireArrows && s.def.ability === 'fireArrows') useAbility(world, s);
        if (team === 1) s.fireArrows = true;
        if (!s.structTarget || !world.structures.get(s.structTarget)?.alive) issue(world, team, [s.id], { type: 'attackStruct', structureId: wood.sort((p, q) => structDist(p, s.cx, s.cz) - structDist(q, s.cx, s.cz))[0].id });
        continue;
      }
    }
    // the hammer: swing wide, then hit the rear when the line is engaged
    if (cav && D.flank && !s.flanked && !waitForSiege) {
      if (!s.flankPt) {
        const side = (s.id.charCodeAt(s.id.length - 1) % 2 ? 1 : -1) * (D.feint && world.rng() < 0.3 ? -1 : 1);
        s.flankPt = [objective[0] - toward[0] * 30 + perp[0] * side * 65, objective[1] - toward[1] * 30 + perp[1] * side * 65];
        s.flankPt = [Math.max(10, Math.min(world.terrain.size - 10, s.flankPt[0])), Math.max(10, Math.min(world.terrain.size - 10, s.flankPt[1]))];
        issue(world, team, [s.id], { type: 'move', to: s.flankPt });
        s.flankT = world.t;
      }
      const there = Math.hypot(s.cx - s.flankPt[0], s.cz - s.flankPt[1]) < 14;
      if ((there && (lineInContact || world.t - s.flankT > 45)) || world.t - s.flankT > 70 || (best && dBest < 22)) s.flanked = true;
      else continue;
    }
    if (cav && waitForSiege) {
      // horse guards the engines until the breach
      const t = bestFoe(s, foes, D, (f) => engines.some((e) => dist2(e, f) < 45));
      if (t) { if (s.order?.targetId !== t.id) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); }
      else if (!s.order) { const e = engines[0]; issue(world, team, [s.id], { type: 'move', to: [e.cx + perp[0] * 14, e.cz + perp[1] * 14] }); }
      continue;
    }
    const engage = team === 0 ? (def.ranged ? def.ranged.range + 10 : cav ? 70 : 34) : def.ranged ? def.ranged.range + 20 : cav ? 90 : 38;
    if (best && dBest < engage) {
      if (!s.order || s.order.type !== 'attack' || s.order.targetId !== best.id) issue(world, team, [s.id], { type: 'attack', targetId: best.id });
      continue;
    }
    if (cav) { if (!s.order || !s.order.attackMove) issue(world, team, [s.id], { type: 'move', to: objective, attackMove: true }); continue; }
    const key = s.wave !== undefined ? 'w' + s.wave : 'all';
    if (!bodies.has(key)) bodies.set(key, []);
    bodies.get(key).push(s);
  }
  // march each body as one formed line: melee in front, shooters behind
  const A = world.ai;
  A.body = A.body || {};
  for (const [key, list] of bodies) {
    const bk = (ctx.bodyKey || '') + team + key;
    let cx = 0, cz = 0; for (const s of list) { cx += s.cx; cz += s.cz; } cx /= list.length; cz /= list.length;
    const tw = unit(objective[0] - cx, objective[1] - cz);
    const dObj = Math.hypot(objective[0] - cx, objective[1] - cz);
    let p;
    if (waitForSiege) {
      let dW = 1e9;
      for (const st of foeStructs) dW = Math.min(dW, structDist(st, cx, cz));
      const adv = Math.max(-30, Math.min(35, dW - holdDist));
      p = [cx + tw[0] * adv, cz + tw[1] * adv];
    } else p = dObj < (ctx.hop || 45) ? objective : [cx + tw[0] * (ctx.hop || 40), cz + tw[1] * (ctx.hop || 40)];
    const prev = A.body[bk];
    if (prev && world.t - prev.t < 6 && Math.hypot(prev.p[0] - p[0], prev.p[1] - p[1]) < 10) continue;
    if (prev && waitForSiege && Math.hypot(prev.p[0] - p[0], prev.p[1] - p[1]) < 6) continue;
    A.body[bk] = { t: world.t, p };
    const melee = list.filter((s) => !s.def.ranged);
    let W = 0; for (const s of (melee.length ? melee : list)) W += squadWidth(s) + 1.5;
    W = Math.min(W, 170);
    const pp = [-tw[1], tw[0]];
    const a = [p[0] - pp[0] * W / 2, p[1] - pp[1] * W / 2], b = [p[0] + pp[0] * W / 2, p[1] + pp[1] * W / 2];
    issue(world, team, list.map((s) => s.id), { type: 'line', a, b, facing: Math.atan2(tw[0], tw[1]), ranks: true, attackMove: !waitForSiege, keepWidth: true });
  }
}

// ---- defend posture: a garrison behind its walls, or the bot holding your trench line
function defendTick(ctx) {
  const { world, team, D, mine, foes } = ctx;
  const home = world.homeFlag[team];
  const flag = world.def.zones.flag;
  const ourFlag = world.mode === 'defend' ? (team === 0) : world.mode === 'attack' ? team === 1 : true;
  const F = ourFlag ? flag.pos : home;
  const [zx, zz] = zoneCentre(team === 1 ? world.def.zones.player : world.def.zones.enemy);
  const toward = unit(zx - F[0], zz - F[1]);
  const shooters = mine.filter((s) => s.def.ranged && !s.def.engine);
  focusFire(ctx, shooters);
  const inFlag = foes.filter((f) => Math.hypot(f.cx - F[0], f.cz - F[1]) < flag.r + 10 && f.state !== 'routing');
  const breaches = (world.breaches && world.breaches[team] || []).filter((b) => world.t - b.t < 90);
  let reservesSent = 0;
  for (const s of mine) {
    if (s.state === 'routing' || s.type === 'commander' && team === 0) continue;
    if (s.garrison) continue;
    if (s.type === 'commander' || s.type === 'king') { if (s.role === 'guard') { const t = bestFoe(s, foes, D, (f) => Math.hypot(f.cx - F[0], f.cz - F[1]) < 40); if (t) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); } else cmdTick(ctx, s, [F[0] - toward[0] * 6, F[1] - toward[1] * 6]); continue; }
    if (commonUpkeep(ctx, s)) continue;
    const def = s.def, cav = def.tags.includes('cavalry');
    if (def.heal) { healerTick(ctx, s, toward); continue; }
    const post = s.home || s.post || [s.cx, s.cz];
    if (def.engine) continue;   // engines in a fort shoot whatever comes in range by themselves
    if (def.ranged) {
      // shooters keep their posts and loose; they only step out to answer the flag
      if (inFlag.length && team === 1 && !s.garrison) { const t = inFlag[0]; if (s.order?.targetId !== t.id) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); continue; }
      if (s.order && s.order.type === 'attack') { const t = world.squads.get(s.order.targetId); if (!t || dist2(s, t) > def.ranged.range + 15) issue(world, team, [s.id], { type: 'move', to: post, facing: Math.atan2(toward[0], toward[1]) }); }
      continue;
    }
    // everyone hunts what reaches the flag
    if (inFlag.length) {
      const t = bestFoe(s, inFlag, D);
      if (t && dist2(s, t) < 90) { if (s.order?.targetId !== t.id) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); continue; }
    }
    // reserves plug a breach
    if ((s.role === 'reserve' || s.role === 'guard') && breaches.length && reservesSent < 4) {
      const b = breaches[breaches.length - 1];
      const t = bestFoe(s, foes, D, (f) => Math.hypot(f.cx - b.x, f.cz - b.z) < 40);
      reservesSent++;
      if (t) { if (s.order?.targetId !== t.id) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); }
      else if (!s.order) issue(world, team, [s.id], { type: 'move', to: [b.x - toward[0] * 8, b.z - toward[1] * 8], attackMove: true });
      continue;
    }
    // horse sally at engines and exposed shooters
    if (cav) {
      const t = bestFoe(s, foes, D, (f) => (f.def.engine || f.def.ranged || f.def.heal) && Math.hypot(f.cx - F[0], f.cz - F[1]) < 95 && !f.garrison);
      if (t) { if (s.order?.targetId !== t.id) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); abilities(ctx, s, t); continue; }
    }
    const leash = cav ? 60 : team === 0 ? 26 : 34;
    const t = bestFoe(s, foes, D, (f) => Math.hypot(f.cx - post[0], f.cz - post[1]) < leash && !f.garrison);
    if (s.type === 'spear' && foes.some((f) => f.def.tags.includes('cavalry') && dist2(s, f) < 40 && f.state !== 'routing') && s.stance !== 'hold') issue(world, team, [s.id], { type: 'stance', value: 'hold' });
    if (t) { if (s.order?.targetId !== t.id) issue(world, team, [s.id], { type: 'attack', targetId: t.id }); abilities(ctx, s, t); }
    else if (s.order && s.order.type === 'attack') issue(world, team, [s.id], { type: 'move', to: post, facing: Math.atan2(toward[0], toward[1]) });
  }
}

// ---------------------------------------------------------------- the bot marshal's preparation
// Used by ?phase=battle, ?bot=1, the title screen battle and the headless tests. It spends the
// war chest the way a sensible marshal would for the battle type.
export function aiPrepare(world, team = 0, opts = {}) {
  if (world.mode === 'defend') return prepDefend(world, team, opts);
  return prepAttack(world, team, opts);
}
const can = (world, type) => !world.unlocked || world.unlocked.includes(type);

function recruit(world, team, plan) {
  for (const u of plan) if (can(world, u)) buy(world, team, u);
}

function prepDefend(world, team, opts) {
  const def = world.def;
  const flag = def.zones.flag.pos;
  const zone = def.zones.player;
  let zMax = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const p of zone) { zMax = Math.max(zMax, p[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  const tz = Math.min(flag[1] + 42, zMax - 16);
  const curve = (x) => tz + Math.cos((x - flag[0]) / 80 * 1.2) * -5;
  const span = Math.min(opts.span || 72, (x1 - x0) / 2 - 6);
  const prebuilt = structList(world).some((s) => s.team === team && s.prebuilt);
  const pts = [];
  for (let x = flag[0] - span; x <= flag[0] + span; x += 4) pts.push([x, curve(x)]);
  build(world, team, 'trench', pts);
  build(world, team, 'stakes', [[flag[0] - 30, curve(flag[0]) + 12], [flag[0] + 30, curve(flag[0]) + 12]]);
  // a stone curtain in front of the trench with a gate on the road: the enemy funnels to it
  if (!opts.small && !prebuilt) {
    const wz = (x) => Math.min(curve(x) + 16, zMax - 2);
    const wpts = [];
    for (let x = flag[0] - span + 8; x <= flag[0] + span - 8; x += 4) wpts.push([x, wz(x)]);
    build(world, team, 'stoneWall', wpts);
    build(world, team, 'gate', [[flag[0], wz(flag[0])]]);
  }
  const towers = [];
  if (!opts.small) for (const dx of [-58, -24, 24, 58]) { if (Math.abs(dx) > span) continue; const r = build(world, team, 'tower', [[flag[0] + dx, curve(flag[0] + dx) - 9]]); if (r.ids) towers.push(r.ids[0]); }
  const plan = opts.small ? ['healer', 'archer', 'spear', 'archer', 'sword']
    : ['healer', 'archer', 'archer', 'spear', 'spear', 'archer', 'sword', 'xbow', 'spear', 'healer', 'archer', 'sword', 'spear', 'archer', 'outrider', 'sword', 'archer', 'spear', 'spear', 'xbow', 'archer', 'spear', 'archer', 'healer', 'xbow', 'sword', 'archer', 'spear', 'knight', 'archer'];
  recruit(world, team, plan);
  const mine = [...world.squads.values()].filter((s) => s.team === team);
  for (const s of mine) s.deployed = false;
  const line = mine.filter((s) => s.type === 'spear');
  const arch = mine.filter((s) => s.def.ranged && !s.def.engine);
  const swords = mine.filter((s) => s.type === 'sword' || s.type === 'sapper' || s.type === 'knight');
  const heal = mine.filter((s) => s.type === 'healer');
  const cav = mine.filter((s) => s.type === 'outrider');
  const eng = mine.filter((s) => s.def.engine);
  const cmd = mine.filter((s) => s.type === 'commander');
  for (const id of towers) { const a = arch.pop(); if (a) { const tw = world.structures.get(id); deploy(world, team, a.id, tw.pos[0], tw.pos[1] - 4, 0); issue(world, team, [a.id], { type: 'garrison', structureId: id }); } }
  // archers onto the stone wall-walk, spaced out
  const used = [];
  for (const w of structList(world).filter((s) => s.team === team && s.type === 'stoneWall' && (s.a[1] + s.b[1]) / 2 > flag[1])) {
    if (arch.length < 4) break;
    const m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
    if (used.some((u) => Math.hypot(u[0] - m[0], u[1] - m[1]) < 26)) continue;
    used.push(m);
    const a = arch.pop(); deploy(world, team, a.id, m[0], m[1] - 4, 0); issue(world, team, [a.id], { type: 'garrison', structureId: w.id });
  }
  const spread = (list, z0, w) => list.forEach((s, i) => { const x = flag[0] + (i - (list.length - 1) / 2) * w; const z = typeof z0 === 'function' ? z0(x) : z0; let r = deploy(world, team, s.id, x, z, 0); if (r.error) deploy(world, team, s.id, flag[0], flag[1] + 6, 0); });
  spread(arch, (x) => curve(x) - 0.2, Math.min(15, (span * 2 - 8) / Math.max(1, arch.length - 1)));
  // spears hold the gap at the gate and the open ends; the rest wait behind the stakes
  spread(line, (x) => Math.min(curve(x) + 7, zMax - 3), Math.min(17, (span * 2) / Math.max(1, line.length - 1)));
  spread(swords, tz - 16, 22);
  spread(heal, tz - 9, 36);
  spread(cav, tz - 22, 60);
  spread(eng, tz - 26, 30);
  for (const s of cmd) deploy(world, team, s.id, flag[0], tz - 24, 0);
  return { gold: world.teams[team].gold, squads: mine.length };
}

function prepAttack(world, team, opts) {
  const def = world.def;
  const zone = def.zones.player;
  let zMax = -Infinity, x0 = Infinity, x1 = -Infinity;
  for (const p of zone) { zMax = Math.max(zMax, p[1]); x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); }
  const cx = Math.max(x0 + 40, Math.min(x1 - 40, def.zones.flag.pos[0]));
  const field = world.mode === 'field';
  if (field) {
    const tz = zMax - 14, pts = [];
    for (let x = cx - 50; x <= cx + 50; x += 5) pts.push([x, tz]);
    build(world, team, 'trench', pts);
  }
  const fortified = structList(world).some((s) => s.team !== team && s.kind === 'wall');
  const stone = structList(world).some((s) => s.team !== team && s.type === 'stoneWall');
  const plan = [];
  if (fortified) { plan.push('ram', 'ram'); if (stone) plan.push('trebuchet', 'mangonel', 'mangonel', 'trebuchet'); else plan.push('mangonel'); }
  plan.push('healer', 'spear', 'sword', 'archer', 'archer', 'sword', 'spear', 'healer', 'sword', 'archer', 'xbow', 'outrider', 'spear', 'sword', 'archer', 'knight', 'sapper', 'sword', 'archer', 'outrider', 'spear', 'xbow', 'healer', 'sword', 'archer', 'knight');
  recruit(world, team, plan);
  const mine = [...world.squads.values()].filter((s) => s.team === team);
  for (const s of mine) s.deployed = false;
  const melee = mine.filter((s) => !s.def.ranged && !s.def.heal && !s.def.engine && !s.def.tags.includes('cavalry'));
  const arch = mine.filter((s) => s.def.ranged && !s.def.engine);
  const eng = mine.filter((s) => s.def.engine);
  const heal = mine.filter((s) => s.def.heal);
  const cav = mine.filter((s) => s.def.tags.includes('cavalry') && s.type !== 'commander');
  const cmd = mine.filter((s) => s.type === 'commander');
  const row = (list, z, w) => list.forEach((s, i) => { const x = Math.max(x0 + 6, Math.min(x1 - 6, cx + (i - (list.length - 1) / 2) * w)); const r = deploy(world, team, s.id, x, z, 0); if (r.error) deploy(world, team, s.id, cx, z - 10, 0); });
  row(melee, zMax - 6, 15);
  row(arch, zMax - 18, 14);
  row(eng, zMax - 30, 18);
  row(heal, zMax - 28, 30);
  cav.forEach((s, i) => { const x = i % 2 ? x1 - 14 - Math.floor(i / 2) * 14 : x0 + 14 + Math.floor(i / 2) * 14; deploy(world, team, s.id, x, zMax - 14, 0); });
  for (const s of cmd) deploy(world, team, s.id, cx, zMax - 36, 0);
  return { gold: world.teams[team].gold, squads: mine.length };
}
