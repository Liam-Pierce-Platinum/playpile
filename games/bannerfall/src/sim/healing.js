// BANNERFALL :: sim/healing.js - the monks' aura (DESIGN.md 2.1 healer details).
// Each living monk heals perMan HP/s on the most wounded friendly soldier within the radius.
// With Field Surgeons a monk walks to a downed man and raises him after a 4 s channel.
import { C } from '../data/constants.js';
import { forNear, revive } from './combat.js';

export function updateHealing(world, dt) {
  for (const sq of world.squads.values()) { sq.inAura = false; sq.auraBoost = 1; }
  for (const hs of world.squads.values()) {
    if (!hs.def.heal || hs.alive <= 0 || !hs.deployed || hs.state === 'routing') continue;
    const H = hs.def.heal;
    const R = H.radius;
    const sanct = hs.sanctuaryUntil > world.t;
    const hymns = world.techs[hs.team].has('hymns');
    const mult = (sanct ? C.SANCTUARY_MULT : 1) * (1 + 0.1 * hs.vet);
    // squads whose centre is inside the aura get morale regen
    for (const o of world.squads.values()) {
      if (o.team !== hs.team || o.alive <= 0) continue;
      if (Math.hypot(o.cx - hs.cx, o.cz - hs.cz) < R + 3) { o.inAura = true; o.auraBoost = Math.max(o.auraBoost, (sanct ? 2 : 1) * (hymns ? 2 : 1)); }
    }
    hs.healing = false;
    const surgeons = world.techs[hs.team].has('surgeons');
    for (const monk of hs.soldiers) {
      if (!monk.alive) continue;
      monk.healTarget = null;
      // Field Surgeons: raise the downed first
      if (surgeons) {
        let down = monk.reviveTarget;
        if (down && (down.alive || !down.downed || down.downed < world.t)) { down = null; monk.reviveTarget = null; monk.reviveAcc = 0; }
        if (!down && world.tick % 10 === monk.idx % 10) {
          let bd = R * R;
          for (const so of world.soldiers) {
            if (so.alive || !so.downed || so.downed < world.t || so.sq.team !== hs.team || so.claimed) continue;
            const d = (so.x - monk.x) ** 2 + (so.z - monk.z) ** 2;
            if (d < bd) { bd = d; down = so; }
          }
          if (down) { down.claimed = monk.id; monk.reviveTarget = down; monk.reviveAcc = 0; }
        }
        if (down) {
          monk.healTarget = down;
          if ((down.x - monk.x) ** 2 + (down.z - monk.z) ** 2 < 2.6 * 2.6) {
            monk.reviveAcc = (monk.reviveAcc || 0) + dt;
            monk.reviveT = world.t + 0.2; monk.healT = world.t; hs.healing = true;
            if (monk.reviveAcc >= 4) { revive(world, down); down.claimed = 0; monk.reviveTarget = null; monk.reviveAcc = 0; hs.xp += 6; }
          } else monk.goTo = [down.x, down.z];
          continue;
        }
        monk.goTo = null;
      }
      let best = null, bp = 0.999;
      forNear(world, monk.x, monk.z, R, (o) => {
        if (o.sq.team !== hs.team || !o.alive) return;
        const p = o.hp / o.maxHp;
        if (p >= bp) return;
        if ((o.x - monk.x) ** 2 + (o.z - monk.z) ** 2 > R * R) return;
        if (o.healers >= 2 && o.healStamp === world.tick) return;
        bp = p; best = o;
      });
      if (!best) continue;
      if (best.healStamp !== world.tick) { best.healStamp = world.tick; best.healers = 0; }
      best.healers++;
      const amt = Math.min(best.maxHp - best.hp, H.perMan * mult * dt);
      best.hp += amt;
      best.healedT = world.t;
      monk.healTarget = best;
      monk.healT = world.t;
      hs.healing = true;
      hs.xp += amt / 15;
      hs.healed += amt;
      world.teams[hs.team].healed += amt;
    }
  }
}
