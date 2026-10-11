// BANNERFALL :: sim/morale.js - morale, wavering, routing, rallying, army break (DESIGN.md 5).
import { C } from '../data/constants.js';

export function updateMorale(world, dt) {
  const cmds = [], stds = [];
  for (const sq of world.squads.values()) {
    if (!sq.deployed || sq.alive <= 0) continue;
    if (sq.type === 'commander' || sq.type === 'king') cmds.push(sq);
    else if (sq.def.aura && sq.state !== 'routing') stds.push(sq);
  }
  for (const sq of world.squads.values()) {
    if (!sq.deployed || sq.state === 'dead' || sq.state === 'gone') continue;
    // flank hits accumulated by combat this step
    if (sq.flankHits) { sq.morale -= sq.flankHits; sq.flankHits = 0; }
    const contact = world.t - sq.lastContactT < 3 || world.t - sq.lastHitT < 3;
    sq.inContact = contact;
    if (sq.inAura) sq.morale += C.MORALE_HEAL_REGEN * (sq.auraBoost || 1) * dt;
    if (!contact && sq.alive / sq.menMax > 0.5) sq.morale += C.MORALE_IDLE_REGEN * dt;
    if (sq.state === 'routing' && !contact) sq.morale += 2 * dt;
    sq.morale = Math.max(0, Math.min(100, sq.morale));
    // effective morale includes situational bonuses
    let bonus = 0;
    if (sq.entrenched) bonus += C.TRENCH_MORALE;
    sq.nearCmd = false;
    for (const c of cmds) {
      if (c.team !== sq.team || c === sq) continue;
      if (Math.hypot(c.cx - sq.cx, c.cz - sq.cz) < C.CMD_AURA) { bonus += C.CMD_AURA_MORALE; sq.nearCmd = true; break; }
    }
    // a standard bearer: steadier nerves and a faster rally near the banner (v3.1 roster)
    for (const b of stds) {
      if (b.team !== sq.team) continue;
      const A = b.def.aura;
      if (Math.abs(b.cx - sq.cx) < A.radius && Math.hypot(b.cx - sq.cx, b.cz - sq.cz) < A.radius) { bonus += 8; sq.morale += A.morale * dt; if (sq.state === 'routing') sq.calmT += dt; break; }
    }
    sq.moraleEff = Math.min(100, sq.morale + bonus);
    // states
    if (sq.state === 'routing') {
      if (!contact) sq.calmT += dt; else sq.calmT = 0;
      if (sq.calmT > C.RALLY_CLEAR_TIME && sq.morale >= C.RALLY_MORALE && !sq.leaving) rally(world, sq);
      continue;
    }
    if (sq.moraleEff <= C.ROUT_AT) startRout(world, sq);
    else if (sq.moraleEff <= C.WAVER_AT) { if (sq.state !== 'wavering') { sq.state = 'wavering'; world.events.push({ type: 'waver', sq: sq.id, team: sq.team }); } }
    else sq.state = 'steady';
  }
}

export function startRout(world, sq) {
  if (sq.state === 'routing' || sq.state === 'dead') return;
  sq.state = 'routing';
  sq.routs++;
  sq.calmT = 0;
  sq.order = null; sq.queue = [];
  sq.garrisonLeave = true;
  if (sq.routs >= 2) sq.leaving = true;   // shattered: will leave the field
  world.events.push({ type: 'rout', sq: sq.id, team: sq.team, name: sq.name });
  if (!world.quiet && (sq.team === 0 || world.t - (world._enemyRoutToast ?? -99) > 10)) {
    if (sq.team === 1) world._enemyRoutToast = world.t;
    world.events.push({ type: 'toast', team: sq.team, text: sq.team === 0 ? sq.name + ' are running!' : 'The enemy ' + sq.def.short.toLowerCase() + ' break and run!' });
  }
  for (const o of world.squads.values()) {
    if (o === sq || o.team !== sq.team || !o.deployed || o.state === 'dead') continue;
    if (Math.hypot(o.cx - sq.cx, o.cz - sq.cz) < 25) o.morale -= C.MORALE_NEAR_ROUT;
  }
}

export function rally(world, sq, boost = 0) {
  if (sq.state !== 'routing' || sq.alive <= 0) return;
  sq.state = 'wavering';
  sq.morale = Math.max(sq.morale, C.RALLY_MORALE) + boost;
  sq.order = null;
  sq.post = [sq.cx, sq.cz];
  sq.lx = sq.cx; sq.lz = sq.cz;
  world.events.push({ type: 'rallied', sq: sq.id, team: sq.team });
  if (sq.team === 0) world.events.push({ type: 'toast', team: 0, text: sq.name + ' rally to the banner!' });
}

// fraction of a team's deployed squads that are routing / dead / gone
export function brokenFraction(world, team) {
  let n = 0, bad = 0;
  for (const sq of world.squads.values()) {
    if (sq.team !== team || !sq.deployed || sq.type === 'commander' || sq.type === 'king' || sq.def.engine) continue;
    n++;
    if (sq.state === 'routing' || sq.state === 'dead' || sq.state === 'gone') bad++;
  }
  return n ? bad / n : 0;
}
