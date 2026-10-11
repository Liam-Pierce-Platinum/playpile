// BANNERFALL :: sim/warai.js - the rival kingdoms' war council on a huge map (DESIGN.md 9.3, lite).
// Builder A's version, shaped as General -> hosts so builder B can grow it into sim/strategy.js:
//   strategic (every 4 s per kingdom, staggered): recruit at its castles by doctrine, keep its
//     garrisons manned, gather new squads into a MUSTER by the capital, form HOSTS (a commander and
//     5-10 squads), and give each idle host a goal scored by value, distance, odds and personality:
//     tax or pillage a village, raid a stronghold, storm a castle or capital, defend its own seats.
//     Rival kingdoms pick each other as targets too, so they fight each other.
//   operational (every second): a host marches in hops toward its goal as a formed line, attack-
//     moving through whatever it meets; within 220 m it switches to the v1 tactician (ai.attackTick)
//     scoped to the host and the goal; it comes home when it has lost two thirds of its men.
// The player's own side runs the same code when world.botPlayer is set (tests, attract mode).
import { NEUTRAL, PERSONALITY } from '../data/factions.js';
import { UNIT_TYPES } from '../data/units.js';
import { UPKEEP } from '../data/economy.js';
import { DOCTRINES, attackTick, AI_DIFF, warDoctrine } from './ai.js';
import { issue, keepSiteWhy, previewBuild, seatGap } from './orders.js';
import { hostile } from './factions.js';
import { structList } from './structures.js';
import { recruit, bannerCap, bannersUsed, canRecruitAt, ownedSeat } from './war.js';
import { placeBlueprint, cancelBlueprint } from './construction.js';
import { paidTarget } from './diplomacy.js';

const HOST = { conqueror: 9, ambusher: 7, merchant: 8, raider: 6 };

export function setupWarAI(world) {
  world.ai.fac = {};
  for (const slot of world.war.slots) world.ai.fac[slot] = { muster: [], hosts: [], next: 2 + slot * 0.9, hostSeq: 0, lastTac: 0 };
}

const alive = (world, id) => { const s = world.squads.get(id); return s && s.alive > 0 && s.state !== 'gone' && s.state !== 'dead' && s.deployed ? s : null; };
function centroid(sqs) { let x = 0, z = 0, n = 0; for (const s of sqs) { x += s.cx * s.alive; z += s.cz * s.alive; n += s.alive; } return n ? [x / n, z / n] : null; }
function men(sqs) { let n = 0; for (const s of sqs) n += Math.max(0, s.alive); return n; }

export function warAI(world) {
  const W = world.war;
  for (const slot of W.slots) {
    if (slot === 0 && !world.botPlayer) continue;
    if (world.aiOff && world.aiOff.includes(slot)) continue;
    if (!W.factions[slot].alive) continue;
    const F = world.ai.fac[slot];
    const D = AI_DIFF[world.difficulty] || AI_DIFF.captain;
    if (world.t >= F.next) { F.next = world.t + 4; strategic(world, slot, F); }
    if (world.t - F.lastTac >= D.tick) { F.lastTac = world.t; for (const H of F.hosts) operate(world, slot, F, H, D); }
  }
}

// ------------------------------------------------------------------ strategy
function strategic(world, slot, F) {
  const W = world.war;
  const fac = W.factions[slot];
  const P = PERSONALITY[fac.personality] || PERSONALITY.conqueror;
  const T = world.teams[slot];
  // book-keeping: drop the dead, collect new squads into the muster
  const assigned = new Set();
  F.muster = F.muster.filter((id) => alive(world, id));
  for (const H of F.hosts) { H.ids = H.ids.filter((id) => alive(world, id)); for (const id of H.ids) assigned.add(id); }
  for (const id of F.muster) assigned.add(id);
  for (const s of world.squads.values()) {
    if (s.team !== slot || s.alive <= 0 || !s.deployed || s.state === 'gone' || assigned.has(s.id)) continue;
    if (s.role === 'garrison' || s.role === 'guard' || s.role === 'escort' || s.type === 'king' || s.def.builder || s.giftOf) continue;
    F.muster.push(s.id);
  }
  // hosts too thin to fight fold back into the muster
  F.hosts = F.hosts.filter((H) => {
    const sqs = H.ids.map((id) => alive(world, id)).filter(Boolean);
    const fight = sqs.filter((s) => s.type !== 'commander');
    if (fight.length >= 2) return true;
    F.muster.push(...H.ids);
    return false;
  });
  const seats = W.settlements.filter((s) => s.owner === slot && s.kind !== 'village');
  const capital = seats.find((s) => s.kind === 'capital') || seats[0];
  if (!capital) return;
  // garrisons: keep a few squads at home in every seat
  for (const s of seats) {
    const want = s.kind === 'capital' ? 3 : s.kind === 'castle' ? 2 : 1;
    let have = 0;
    for (const q of world.squads.values()) if (q.team === slot && q.settle === s.id && q.alive > 0 && q.state !== 'gone' && q.role === 'garrison') have++;
    while (have < want) {
      const id = F.muster.find((m) => { const q = alive(world, m); return q && q.type !== 'commander' && !q.def.tags.includes('cavalry') && !q.def.engine; });
      if (!id) break;
      F.muster = F.muster.filter((m) => m !== id);
      const q = world.squads.get(id);
      q.role = 'garrison'; q.settle = s.id; have++;
      const a = world.rng() * Math.PI * 2, d = 6 + world.rng() * 8;
      issue(world, slot, [id], { type: 'move', to: [s.point[0] + Math.sin(a) * d, s.point[1] + Math.cos(a) * d], attackMove: true });
    }
  }
  // recruit with the war chest (keeping some back), at the seat nearest its hosts' goals
  const doctrine = DOCTRINES[warDoctrine(fac.doctrine)] || DOCTRINES.w_horde;
  const reserve = 1500 + world.t * 0.5;
  // a siege train: walls are cracked with rams, siege towers and mangonels, not spearmen's knuckles
  let engines = 0;
  for (const q of world.squads.values()) if (q.team === slot && q.def.engine && q.alive > 0) engines++;
  for (const e of (world.war.queues[slot] || [])) if (UNIT_TYPES[e.type].engine) engines++;
  const wantEngines = world.t > 120 ? (world.t > 900 ? 6 : 4) : 0;
  const TRAIN_ENG = ['ram', 'siegeTower', 'mangonel', 'ram', 'siegeTower', 'mangonel'];
  // builders: one squad to build with (two for a kingdom that expands)
  let builders = 0;
  for (const q of world.squads.values()) if (q.team === slot && q.def.builder && q.alive > 0) builders++;
  for (const e of (world.war.queues[slot] || [])) if (UNIT_TYPES[e.type].builder) builders++;
  F.capped = bannersUsed(world, slot) + 1 > bannerCap(world, slot) && T.gold > 30000;
  const wantBuilders = P.expansion >= 0.5 ? 2 : P.expansion > 0.2 || F.capped ? 1 : 0;
  // upkeep: a kingdom whose books do not balance stops recruiting until it is rich again
  const net = (T.income || 0) - (T.upkeep || 0);
  for (let k = 0; k < 3; k++) {
    if (bannersUsed(world, slot) + 1 > bannerCap(world, slot)) break;
    const type = builders < wantBuilders && world.t > 30 ? 'builder' : engines < wantEngines && T.gold > 6000 ? TRAIN_ENG[engines % TRAIN_ENG.length] : pickByWeight(world, doctrine.w);
    if (UNIT_TYPES[type].engine) engines++;
    if (UNIT_TYPES[type].builder) builders++;
    const cost = world.defs[slot][type].cost;
    if (T.gold - cost < reserve) break;
    if (net - (UPKEEP[type] || 15) < -200 && T.gold < 20000) break;
    const at = seats.find((s) => canRecruitAt(s, type) && (s.kind !== 'stronghold')) || seats.find((s) => canRecruitAt(s, type));
    if (!at) break;
    const r = recruit(world, slot, at.id, type);
    if (r.error) break;
  }
  // a commander for every host (free, three at most)
  // form a host from the muster when it is big enough, or when the muster has waited long
  const size = Math.round((HOST[fac.personality] || 8) * (0.85 + 0.15 * (world.enemyScale || 1)));
  const ready = F.muster.map((id) => alive(world, id)).filter((s) => s && s.type !== 'commander');
  if (ready.length >= size || (ready.length >= 4 && world.t - (F.lastHostT || 0) > 160)) {
    const pick = ready.slice(0, size + 2);
    const cmd = F.muster.map((id) => alive(world, id)).find((s) => s && s.type === 'commander');
    const ids = pick.map((s) => s.id).concat(cmd ? [cmd.id] : []);
    F.muster = F.muster.filter((id) => !ids.includes(id));
    F.hosts.push({ id: slot + 'h' + F.hostSeq++, ids, goal: null, phase: 'idle', t0: world.t, startMen: men(pick) });
    F.lastHostT = world.t;
  }
  // threats to our seats: the nearest host turns back to defend
  for (const s of seats) {
    let threat = 0, tx = 0, tz = 0;
    for (const q of world.squads.values()) {
      if (!q.deployed || q.alive <= 0 || q.state === 'routing' || q.garrison || q.role === 'garrison' || !hostile(world, slot, q.team) || q.team >= NEUTRAL) continue;
      const d = Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]);
      if (d < 260) { threat += q.alive; tx += q.cx * q.alive; tz += q.cz * q.alive; }
    }
    if (threat < 20) continue;
    if (F.hosts.some((H) => H.goal && H.goal.defend === s.id)) continue;
    // a seat just defended is not called for again for two minutes unless a real army is there
    if (world.t - ((F.defended || {})[s.id] || -999) < 120 && threat < 60) continue;
    (F.defended = F.defended || {})[s.id] = world.t;
    let best = null, bd = Infinity;
    for (const H of F.hosts) {
      if ((H.goal && H.goal.defend) || H.grand) continue;
      const c = centroid(H.ids.map((id) => alive(world, id)).filter(Boolean));
      if (!c) continue;
      const d = Math.hypot(c[0] - s.pos[0], c[1] - s.pos[1]);
      if (d < bd && d < 1400) { bd = d; best = H; }
    }
    if (best) { best.goal = { defend: s.id, pos: s.point, kind: s.kind, id: s.id }; best.phase = 'march'; best.orderT = -99; best.goalT = world.t; }
  }
  // idle hosts near each other join up: one strong host takes castles that two weak ones cannot
  const idle = F.hosts.filter((H) => !H.goal || H.phase === 'idle');
  if (idle.length >= 2) {
    const A = idle[0], ca = centroid(A.ids.map((id) => alive(world, id)).filter(Boolean));
    for (const B of idle.slice(1)) {
      const cb = centroid(B.ids.map((id) => alive(world, id)).filter(Boolean));
      if (!ca || !cb || Math.hypot(ca[0] - cb[0], ca[1] - cb[1]) > 2500) continue;
      A.ids.push(...B.ids); A.startMen += B.startMen; B.ids = [];
    }
    F.hosts = F.hosts.filter((H) => H.ids.length);
  }
  // the grand assault: a long war turns on the capitals. After 12 minutes, when our field army
  // outnumbers what holds a rival capital, every host and the muster march on it together.
  grandAssault(world, slot, F);
  // builders: found outposts and castles on the frontier (DESIGN.md 9.3 "Expand")
  expand(world, slot, F, P);
  // goals for idle hosts
  for (const H of F.hosts) {
    if (H.goal && H.phase !== 'idle') continue;
    const g = chooseGoal(world, slot, H, P);
    if (g) { H.goal = g; H.phase = 'march'; H.orderT = -99; H.goalT = world.t; }
  }
}

export function grandAssault(world, slot, F) {
  if (world.t < 720 || F.hosts.some((H) => H.grand)) return;
  const W = world.war;
  const field = [];
  for (const H of F.hosts) if (!(H.goal && H.goal.defend)) for (const id of H.ids) { const q = alive(world, id); if (q) field.push(q); }
  for (const id of F.muster) { const q = alive(world, id); if (q && !q.def.builder) field.push(q); }
  const mine = men(field.filter((q) => q.type !== 'commander'));
  if (mine < 60) return;
  let best = null, bs = 0;
  for (const s of W.settlements) {
    if (s.kind !== 'capital' || s.owner === slot || s.owner < 0 || s.owner >= NEUTRAL || !hostile(world, slot, s.owner) || s.founder !== s.owner) continue;
    let def = 0;
    for (const q of world.squads.values()) if (q.team === s.owner && q.alive > 0 && q.deployed && Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]) < s.r + 60) def += q.alive;
    const odds = mine / Math.max(10, def);
    if (odds > bs) { bs = odds; best = s; }
  }
  if (!best || bs < 0.75) return;
  const ids = field.map((q) => q.id);
  const keep = F.hosts.filter((H) => H.goal && H.goal.defend);
  F.hosts = keep;
  F.muster = F.muster.filter((id) => { const q = alive(world, id); return q && q.def.builder; });
  F.hosts.push({ id: slot + 'g' + F.hostSeq++, ids, goal: { id: best.id, pos: best.point, kind: best.kind }, phase: 'march', orderT: -99, t0: world.t, goalT: world.t, startMen: mine, grand: true });
  world.events.push({ type: 'alert', team: -1, text: `${W.factions[slot].short} marches on ${best.name} with everything it has!`, pos: best.pos, tone: slot === 0 ? 'good' : best.owner === 0 ? 'bad' : 'info', t: world.t });
}

function pickByWeight(world, w) {
  const keys = Object.keys(w).filter((k) => UNIT_TYPES[k]);
  let tot = 0; for (const k of keys) tot += w[k];
  let r = world.rng() * tot;
  for (const k of keys) { r -= w[k]; if (r <= 0) return k; }
  return keys[0];
}

// score every settlement this host could go for (DESIGN.md 9.3)
function chooseGoal(world, slot, H, P) {
  const W = world.war;
  const sqs = H.ids.map((id) => alive(world, id)).filter(Boolean);
  const c = centroid(sqs);
  if (!c) return null;
  const mine = men(sqs);
  // the strongest rival (for conquerors) and the richest (for raiders)
  const paid = paidTarget(world, slot);
  const strength = {};
  for (const q of world.squads.values()) if (q.alive > 0 && q.team < NEUTRAL) strength[q.team] = (strength[q.team] || 0) + q.alive;
  let best = null, bs = 0;
  for (const s of W.settlements) {
    if (s.owner === slot) continue;
    if (s.owner >= 0 && s.owner < NEUTRAL && !hostile(world, slot, s.owner)) continue;
    if (s.kind === 'village' && s.state === 'ravaged') continue;
    if (H.failed && H.failed.includes(s.id) && world.t - (H.failT || 0) < 600) continue;
    const d = Math.hypot(s.pos[0] - c[0], s.pos[1] - c[1]);
    let defenders = 0;
    for (const q of world.squads.values()) {
      if (q.alive <= 0 || !q.deployed || q.state === 'routing' || !hostile(world, slot, q.team)) continue;
      if (Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]) < s.r + 60) defenders += q.alive * (q.garrison ? 1.6 : 1);
    }
    const stone = s.kind === 'capital' || s.kind === 'castle';
    const siege = sqs.filter((q) => q.def.engine).length;
    const odds = mine / Math.max(8, defenders) * (stone ? (siege ? 1.25 : 0.75) : 1);
    const late = world.t > 1200 || !!W.realm;
    if (odds < (s.kind === 'capital' ? (late ? 0.9 : 1.2) : late ? 0.6 : 0.8)) continue;
    let v = { village: 1.0, stronghold: 1.35, castle: 1.7, capital: 2.3 }[s.kind] || 1;
    if (s.kind === 'village') v *= 0.8 + (P.pillage || 0.3) * 0.6;
    if (s.owner === 0) v *= 1.35;                         // Liam wants a war: the rivals come for you
    if (s.owner >= 0 && s.owner < NEUTRAL) {
      if (P.targets === 'strongest') { const top = Object.entries(strength).filter(([t]) => +t !== slot).sort((a, b) => b[1] - a[1])[0]; if (top && +top[0] === s.owner) v *= 1.3; }
      if (P.targets === 'weakest') v *= 1 + 30 / Math.max(30, strength[s.owner] || 30);
    }
    if (s.kind === 'capital' && world.t < 240) v *= 0.3;   // nobody storms a capital in the first minutes
    if (paid >= 0 && s.owner === paid) v *= 3;             // somebody paid us to go for them
    if (s.kind === 'outpost') v *= 1.2;                    // a fresh outpost is a soft target
    if (s.kind === 'capital' && late) v *= 2;              // a long war turns on the capitals
    if (W.realm) {                                         // a Long War battle has one aim: the seat
      if (s.realmSeat && s.realmSeat !== 'camp' && s.owner !== slot) v *= 4;
      if (s.kind === 'village') v *= 0.35;
    }
    const score = v * Math.min(2.2, odds) / (1 + d / 650) * (0.85 + world.rng() * 0.3);
    if (score > bs) { bs = score; best = s; }
  }
  if (!best) return null;
  return { id: best.id, pos: best.point, kind: best.kind };
}

// ------------------------------------------------------------------ operations
function operate(world, slot, F, H, D) {
  const W = world.war;
  const sqs = H.ids.map((id) => alive(world, id)).filter(Boolean);
  if (!sqs.length || !H.goal) return;
  const s = W.settlements.find((q) => q.id === H.goal.id);
  const c = centroid(sqs);
  if (!c) return;
  const fighting = sqs.filter((q) => q.state !== 'routing');
  const ids = fighting.map((q) => q.id);
  // a seat we were defending fell: go and take it back
  if (H.goal.defend !== undefined && s && s.owner !== slot) { H.goal = { id: s.id, pos: s.point, kind: s.kind }; H.phase = 'march'; H.orderT = -99; H.goalT = world.t; }
  // done?
  if (s && H.goal.defend === undefined && s.owner === slot) {
    // leave a squad to hold a castle or fort we just took
    if (s.kind !== 'village') {
      const g = fighting.find((q) => q.type !== 'commander' && !q.def.tags.includes('cavalry') && !q.def.engine);
      if (g) { g.role = 'garrison'; g.settle = s.id; H.ids = H.ids.filter((id) => id !== g.id); }
    }
    H.goal = null; H.phase = 'idle'; H.grand = false;
    return;
  }
  if (s && H.goal.defend === undefined && s.owner >= 0 && s.owner < NEUTRAL && !hostile(world, slot, s.owner)) { H.goal = null; H.phase = 'idle'; return; }
  if (H.goal.defend !== undefined) {
    // stand down when the danger has passed
    let near = 0;
    for (const q of world.squads.values()) if (q.deployed && q.alive > 0 && q.state !== 'routing' && !q.garrison && q.role !== 'garrison' && q.role !== 'militia' && hostile(world, slot, q.team) && q.team < NEUTRAL && Math.hypot(q.cx - H.goal.pos[0], q.cz - H.goal.pos[1]) < 300) near += q.alive;
    if (!near) { H.calm = (H.calm || 0) + 1; if (H.calm > 20) { H.goal = null; H.phase = 'idle'; H.calm = 0; return; } } else H.calm = 0;
    if (world.t - (H.goalT || 0) > 240) { H.goal = null; H.phase = 'idle'; return; }
  }
  // beaten: go home and fold into the muster
  if (men(fighting) < H.startMen * (H.grand ? 0.15 : 0.25) && H.phase !== 'return') {
    H.grand = false;
    const home = ownedSeat(world, slot);
    if (home) { H.phase = 'return'; issue(world, slot, ids, { type: 'move', to: home.point, force: true }); }
    return;
  }
  if (H.phase === 'return') {
    const home = ownedSeat(world, slot);
    H.retT = H.retT || world.t;
    if (!home || Math.hypot(c[0] - home.point[0], c[1] - home.point[1]) < 90 || world.t - H.retT > 150) { H.retT = 0; F.muster.push(...H.ids); H.ids = []; H.goal = null; H.phase = 'idle'; }
    return;
  }
  const obj = H.goal.pos;
  const d = Math.hypot(obj[0] - c[0], obj[1] - c[1]);
  // half the host's men close enough counts as arrived (rams and stragglers come on behind)
  let nearMen = 0; for (const q of fighting) if (Math.hypot(q.cx - obj[0], q.cz - obj[1]) < 260) nearMen += q.alive;
  if (d > 230 && nearMen < men(fighting) * 0.5 && H.phase === 'march') {
    // one long march to a staging point short of the goal, as a formed body, attack-moving;
    // re-ordered only when the whole host has stalled for a minute or stands idle
    const stuck = H.orderT > 0 && world.t - H.orderT > 60 && Math.hypot(c[0] - H.orderC[0], c[1] - H.orderC[1]) < 15 && !fighting.some((q) => q.inContact);
    const idleNow = fighting.every((q) => !q.order && q.mode === 'idle');
    if (H.orderT < 0 || stuck || (idleNow && world.t - H.orderT > 6)) {
      H.orderT = world.t; H.orderC = c;
      const ux = (obj[0] - c[0]) / d, uz = (obj[1] - c[1]) / d;
      const back = Math.min(d - 20, 150);
      issue(world, slot, ids, { type: 'move', to: [obj[0] - ux * back, obj[1] - uz * back], attackMove: true });
    } else if (world.t - H.orderT > 60) { H.orderT = world.t; H.orderC = c; }
    return;
  }
  if (H.phase === 'march') { H.phase = 'assault'; H.assaultT = world.t; H.bestProg = 0; H.progT = world.t; }
  // the assault: the v1 tactician, scoped to this host and this goal
  const foes = [];
  for (const q of world.squads.values()) {
    if (!q.deployed || q.alive <= 0 || q.state === 'gone' || !hostile(world, slot, q.team)) continue;
    if (Math.hypot(q.cx - obj[0], q.cz - obj[1]) < 280 || Math.hypot(q.cx - c[0], q.cz - c[1]) < 120) foes.push(q);
  }
  const foeStructs = structList(world).filter((st) => st.alive && (st.kind === 'wall' || st.kind === 'gate' || st.kind === 'tower') && hostile(world, slot, st.team) && Math.hypot((st.pos ? st.pos[0] : (st.a[0] + st.b[0]) / 2) - obj[0], (st.pos ? st.pos[1] : (st.a[1] + st.b[1]) / 2) - obj[1]) < 140);
  const owner = s ? s.owner : -1;
  const breached = (owner >= 0 && !!(world.breaches[owner] || []).some((b) => world.t - b.t < 400 && Math.hypot(b.x - obj[0], b.z - obj[1]) < 120)) || foeStructs.some((st) => st.dock && st.dock.team === slot);
  // the tactician runs the squads at the front; stragglers march up to join them
  const front = fighting.filter((q) => Math.hypot(q.cx - obj[0], q.cz - obj[1]) < 420);
  const behind = fighting.filter((q) => !front.includes(q));
  if (behind.length && world.t - (H.callT || 0) > 20) { H.callT = world.t; issue(world, slot, behind.map((q) => q.id), { type: 'move', to: [obj[0] + (c[0] - obj[0]) * 0.3, obj[1] + (c[1] - obj[1]) * 0.3], attackMove: true }); }
  attackTick({ world, team: slot, D, mine: front.length ? front : fighting, foes, objective: obj, age: world.t - H.assaultT, foeStructs, breached: breached || !foeStructs.some((st) => st.kind === 'gate'), bodyKey: H.id, hop: 70, siegeWait: 420 });
  // the yard is nearly clear: everyone onto the point to take it
  if (s && H.goal.defend === undefined) {
    let held = 0;
    for (const q of foes) if (q.state !== 'routing' && Math.hypot(q.cx - s.pos[0], q.cz - s.pos[1]) < (s.wallR || s.r) + 45) held += q.alive;
    const gate = s.gateId ? world.structures.get(s.gateId) : null;
    const open = !s.structIds.length || !gate || !gate.alive || gate.team === slot || s.structIds.some((id) => { const st = world.structures.get(id); return st && ((!st.alive && st.kind !== 'tower') || (st.dock && st.dock.team === slot)); });
    if (open && held < Math.max(10, men(fighting) * 0.3) && world.t - (H.stormT || 0) > 10) {
      H.stormT = world.t;
      fighting.filter((q) => !q.def.engine).forEach((q, k) => {
        const a = k * 2.399, r = Math.min(s.capR * 0.7, 3 + k * 1.2);
        issue(world, slot, [q.id], { type: 'move', to: [obj[0] + Math.cos(a) * r, obj[1] + Math.sin(a) * r], attackMove: true });
      });
      return;
    }
    if (world.t - (H.stormT || 0) < 10) return;
  }
  // hunt: nobody in a fight but enemies close by -> go for the nearest knot of them
  const live = foes.filter((q) => q.state !== 'routing' && !q.garrison && q.team < NEUTRAL + 1);
  if (live.length && !fighting.some((q) => q.inContact) && world.t - (H.huntT || 0) > 8) {
    let best = null, bd = 260;
    for (const q of live) { const dd = Math.hypot(q.cx - c[0], q.cz - c[1]); if (dd < bd) { bd = dd; best = q; } }
    if (best && bd > 30) { H.huntT = world.t; issue(world, slot, ids.filter((id) => { const q = world.squads.get(id); return !q.def.engine; }), { type: 'move', to: [best.cx, best.cz], attackMove: true }); }
  }
  // no progress for five minutes: give up on it and pick something else
  const prog = s && s.capTeam === slot ? s.capT : 0;
  if (prog > H.bestProg + 0.5) { H.bestProg = prog; H.progT = world.t; }
  // a siege that holds is progress too: the garrison starves (war.js updateSieges)
  if (s && s.siegeBy === slot && s.siegeT > 0) H.progT = world.t;
  const fm = men(live);
  if (H.lastFoeMen !== undefined && fm < H.lastFoeMen - 3) H.progT = world.t;
  H.lastFoeMen = fm;
  if (world.t - H.progT > (H.grand ? 600 : 300) && H.goal.defend === undefined) {
    H.grand = false; H.goal = null; H.phase = 'idle'; H.failed = (H.failed || []).concat(s ? [s.id] : []).slice(-3); H.failT = world.t; }
}

// ------------------------------------------------------------------ expansion (DESIGN.md 9.3 "Expand")
// A kingdom with builders founds a new seat on its frontier every few minutes, by personality:
// conquerors raise stone Castle Keeps (about every 7 min when rich), others timber outposts;
// raiders never build. A few squads from the muster escort the builders.
const BUILD_COST = { outpost: 600, castleKeep: 1600 };
const RING = [[0, 0]], RING_V = [];
for (const r of [45, 90, 135]) for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + r * 0.01; RING.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]); if (r >= 90) RING_V.push([Math.round(Math.cos(a) * r), Math.round(Math.sin(a) * r)]); }
function expand(world, slot, F, P) {
  const W = world.war, T = world.teams[slot];
  if ((!P.expansion || P.expansion < 0.2) && !F.capped) return;
  if (W.realm) return;                 // one day's battle of the Long War: no new keeps, just the fight
  // builders keep working on what we placed
  const bps = [];
  for (const b of [...world.blueprints.values()]) {
    if (b.team !== slot) continue;
    // a job nobody has touched for ten minutes (its builders died) is given up
    if (world.t - (b.t0 || 0) > 600 && b.wp < b.need * 0.5) { cancelBlueprint(world, slot, b.id); continue; }
    bps.push(b);
  }
  const builders = [];
  for (const q of world.squads.values()) if (q.team === slot && q.def.builder && q.alive > 0 && q.deployed && q.state !== 'routing') builders.push(q);
  for (const b of builders) if (!b.job && bps.length && !b.order) { b.job = bps[0].id; b.path = null; }
  // the escort goes back into the muster when the job is done
  if (F.escort && (world.t > F.escort.until || !bps.length)) { for (const id of F.escort.ids) { const q = world.squads.get(id); if (q && q.role === 'escort') q.role = null; } F.escort = null; }
  if (bps.length || !builders.length) return;
  const every = F.capped ? Math.min(420, 900 - (P.expansion || 0) * 600) : 900 - P.expansion * 600;
  if (world.t < 150 || world.t - (F.expandT ?? -1e9) < every) return;
  F.expandT = world.t;
  const type = P.expansion >= 0.7 && T.gold > 30000 ? 'castleKeep' : 'outpost';
  if (T.gold < BUILD_COST[type] * (world.priceMult || 1) + 6000 || T.bankrupt) return;
  // a site: the waystone of an own (or adjacent wild) region, 460-1300 m from our other seats
  const seats = W.settlements.filter((s) => s.owner === slot && s.kind !== 'village' && s.state !== 'razed');
  if (!seats.length) return;
  let best = null, bs = -Infinity;
  const near = new Set();
  for (const R of W.regions) if (R.owner === slot) { near.add(R.id ?? W.regions.indexOf(R)); for (const n of R.neighbors) { near.add(n); for (const m of W.regions[n].neighbors) near.add(m); } }
  for (const R of W.regions) {
    if (!R.cells || !R.waystone) continue;
    if (!near.has(R.id ?? W.regions.indexOf(R))) continue;
    if (R.owner >= 0 && R.owner !== slot && R.owner < NEUTRAL) continue;
    // beside a village we hold, or on open land near the waystone (keepSiteWhy has the rules)
    let p = null, dn = Infinity;
    for (const [ox, oz] of R.settlement ? RING_V : RING) {
      const q = [R.waystone[0] + ox, R.waystone[1] + oz];
      let dq = Infinity; for (const s of seats) dq = Math.min(dq, Math.hypot(s.pos[0] - q[0], s.pos[1] - q[1]));
      if (dq < seatGap(world) + 10 || dq > 1600) continue;
      if (!previewBuild(world, slot, type, [q], { anywhere: true }).ok) continue;
      p = q; dn = dq; break;
    }
    if (!p) continue;
    const score = -Math.abs(dn - 650) * 0.01 + world.rng() * 2;
    if (score > bs) { bs = score; best = p; }
  }
  // no site (or no money) yet: look again in a minute rather than a whole cycle
  if (!best) { F.expandT = world.t - every + 60; return; }
  const r = placeBlueprint(world, slot, type, [best], { anywhere: true });
  if (r.error) { F.expandT = world.t - every + 60; return; }
  for (const b of builders) { b.job = r.ids[0]; b.order = null; b.path = null; }
  const esc = F.muster.map((id) => alive(world, id)).filter((q) => q && q.type !== 'commander' && !q.def.engine && !q.def.builder).slice(0, 3);
  if (esc.length) {
    F.muster = F.muster.filter((id) => !esc.some((q) => q.id === id));
    for (const q of esc) q.role = 'escort';
    issue(world, slot, esc.map((q) => q.id), { type: 'move', to: best, attackMove: true });
    F.escort = { ids: esc.map((q) => q.id), until: world.t + 420 };
  }
  world.events.push({ type: 'expand', team: slot, kind: type, x: best[0], z: best[1] });
}
