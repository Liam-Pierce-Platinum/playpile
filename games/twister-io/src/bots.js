// Bot brains. Four personalities share one toolkit: find food, chase smaller
// storms, flee bigger ones, wander. Skill (0..1) sets reaction time, aim,
// steering noise and how often they fling or dash.
import { S, canLift } from './world.js';

// Rubber band (Hole.io keeps the leader within reach): a bot well below the
// player's mass plays a little sharper, one far above it plays a little lazier.
function eff(st, g) {
  const p = g.player;
  if (!p || st.isPlayer) return st.skill;
  const k = st.mass < p.mass * 0.5 ? 0.15 : st.mass > p.mass * 2 + 10 ? -0.1 : 0;
  return Math.max(0.05, Math.min(0.98, st.skill + k));
}

export function think(st, g, dt) {
  const ai = st.ai;
  ai.t -= dt;
  const sk = eff(st, g);
  if (ai.t <= 0) {
    ai.t = (0.45 - sk * 0.3) * (0.7 + Math.random() * 0.6);
    decide(st, g, sk);
  }
  // steer toward the current goal with a bit of skill-dependent wobble
  let dx = ai.tx - st.x, dz = ai.tz - st.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.5) { dx /= d; dz /= d; } else { dx = 0; dz = 0; }
  const n = (1 - sk) * 0.6 * Math.sin(g.time * 1.3 + st.id * 4);
  const c = Math.cos(n), s = Math.sin(n);
  st.steerX = dx * c - dz * s; st.steerZ = dx * s + dz * c;
  st.thr = (st.sleepy ? 0.55 : 0.82 + sk * 0.18) * Math.min(1, d / 3 + 0.2);
}

function decide(st, g, sk) {
  const ai = st.ai;
  st.wantDash = false;
  // threats and prey
  let threat = null, td = 1e9, prey = null, pd = 1e9;
  for (const o of g.storms) {
    if (o === st || o.dead) continue;
    const d = Math.hypot(o.x - st.x, o.z - st.z);
    if (o.mass > st.mass * 1.12 + 2 && d < 16 + o.R * 1.5 && d < td) { threat = o; td = d; }
    if (o.mass * 1.25 + 2 < st.mass && o.inv <= 0 && d < 55 && d < pd) { prey = o; pd = d; }
  }
  const scared = st.pers === 'coward' ? 1 : st.pers === 'hunter' ? 0.35 : 0.65;
  if (threat && !st.sleepy && Math.random() < scared * (0.4 + sk * 0.6)) {
    const dx = st.x - threat.x, dz = st.z - threat.z, d = Math.hypot(dx, dz) || 1;
    // flee, sliding sideways a little so they do not pin themselves to a wall
    const side = st.id % 2 ? 1 : -1;
    aimAt(st, g, st.x + (dx / d) * 30 - (dz / d) * 10 * side, st.z + (dz / d) * 30 + (dx / d) * 10 * side);
    if (td < threat.s + st.s + 6 && st.mass > 15 && Math.random() < sk) st.wantDash = true;
    if (st.ring.length > 2 && td < 30 && Math.random() < sk * 0.5) st.wantFling = true;
    return;
  }
  const hunts = st.pers === 'hunter' ? 0.9 : st.pers === 'greedy' ? 0.3 : st.pers === 'wanderer' ? 0.25 : 0.1;
  if (prey && !st.sleepy && Math.random() < hunts * (0.5 + sk * 0.5)) {
    const lead = (pd / 16) * sk;
    aimAt(st, g, prey.x + prey.vx * lead, prey.z + prey.vz * lead);
    if (pd < 22 && pd > st.s + prey.s && Math.random() < sk * 0.6) st.wantDash = true;
    if (prey.ring.length && pd < 32 && st.ring.length > 3 && Math.random() < sk * 0.45) st.wantFling = true;
    return;
  }
  // bigger rivals with debris are targets for flings too (skilled small storms)
  if (!st.sleepy && st.ring.length > 4 && Math.random() < sk * 0.12) {
    for (const o of g.storms) if (o !== st && !o.dead && o.ring.length > 2 && Math.hypot(o.x - st.x, o.z - st.z) < 30) { st.wantFling = true; break; }
  }
  if (st.pers === 'wanderer' && Math.random() < 0.5) {
    ai.wander -= 1;
    if (ai.wander <= 0 || Math.hypot(ai.tx - st.x, ai.tz - st.z) < 4) {
      const b = g.world.bounds;
      ai.tx = b.minX + 20 + Math.random() * (b.maxX - b.minX - 40);
      ai.tz = Math.max(g.world.town.harbour ? g.world.town.waterZ : -1e9, b.minZ + 20 + Math.random() * (b.maxZ - b.minZ - 40));
      ai.wander = 8 + Math.random() * 8;
    }
    return;
  }
  food(st, g);
}

function aimAt(st, g, x, z) {
  const b = g.world.bounds;
  st.ai.tx = Math.max(b.minX + 4, Math.min(b.maxX - 4, x));
  st.ai.tz = Math.max(b.minZ + 4, Math.min(b.maxZ - 4, z));
}

// Best nearby liftable thing, scored by mass over distance; ties to the
// current target keep them from dithering.
function food(st, g) {
  const ai = st.ai;
  let best = null, bs = 0;
  const rad = 26 + st.s * 3;
  g.world.near(st.x, st.z, rad, (o) => {
    if (o.state !== S.GROUND || !canLift(o, st) || o.decor) return;
    const d = Math.hypot(o.x - st.x, o.z - st.z);
    let v = o.def.mass * (o.def.tier === st.tier ? 1.4 : 1) / (d + 6);
    if (o === ai.target) v *= 1.3;
    if (v > bs) { bs = v; best = o; }
  });
  if (best) { ai.target = best; aimAt(st, g, best.x, best.z); return; }
  // nothing near: head for the busiest part of town / somewhere new
  if (Math.hypot(ai.tx - st.x, ai.tz - st.z) < 6 || Math.random() < 0.1) {
    const b = g.world.bounds;
    ai.tx = b.minX + 20 + Math.random() * (b.maxX - b.minX - 40);
    ai.tz = Math.max(g.world.town.harbour ? g.world.town.waterZ : -1e9, b.minZ + 20 + Math.random() * (b.maxZ - b.minZ - 40));
  }
}
