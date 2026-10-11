// BANNERFALL :: sim/testkit.js - set-pieces for the perf proof and the tests (node and browser).
// stageBattle() drops two big armies facing each other on open ground and sends them in, so the
// perf numbers come from a real fight: melee, volleys, charges, routs and healing all running.
import { createSquad, placeSquad } from './squads.js';
import { issue } from './orders.js';

const MIX = ['spear', 'spear', 'sword', 'archer', 'archer', 'spear', 'sword', 'xbow', 'healer', 'outrider', 'archer', 'spear', 'knight', 'sword'];

// the flattest open spot near (x, z): no water, little slope, few trees
export function openGround(world, x, z, r = 140) {
  const T = world.terrain;
  let best = [x, z], bs = -Infinity;
  for (let k = 0; k < 160; k++) {
    const a = k * 2.399, d = Math.sqrt(k) * (r / 10);
    const px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d;
    if (!T.inside(px, pz, 300)) continue;
    let s = 0;
    for (const [dx, dz] of [[0, 0], [60, 0], [-60, 0], [0, 60], [0, -60], [40, 40], [-40, -40]]) {
      const h = T.height(px + dx, pz + dz);
      if (h < 0.6) s -= 50;
      s -= T.slope(px + dx, pz + dz) * 30 + (T.forestAt ? T.forestAt(px + dx, pz + dz) * 20 : 0);
    }
    // keep clear of castles, forts and villages
    if (world.war) for (const st of world.war.settlements) { const d = Math.hypot(st.pos[0] - px, st.pos[1] - pz); if (d < 260) s -= (260 - d); }
    if (s > bs) { bs = s; best = [px, pz]; }
  }
  return best;
}

// perSide squads for each of teams [a, b], lines 140 m apart, facing each other, then attack-move
export function stageBattle(world, opts = {}) {
  const S = world.terrain.size;
  const [a, b] = opts.teams || [0, 1];
  const per = opts.perSide || 70;
  const c = opts.at || openGround(world, S / 2, S / 2, 400);
  const ang = opts.facing ?? 0.3;
  const fx = Math.sin(ang), fz = Math.cos(ang), rx = Math.cos(ang), rz = -Math.sin(ang);
  const made = { [a]: [], [b]: [] };
  for (const [team, side] of [[a, -1], [b, 1]]) {
    for (let i = 0; i < per; i++) {
      const type = MIX[(i + (side > 0 ? 3 : 0)) % MIX.length];
      const sq = createSquad(world, team, type, {});
      const row = sq.def.ranged || sq.def.heal ? 1 : sq.def.tags.includes('cavalry') ? 2 : 0;
      const cols = Math.ceil(per / 3);
      const k = (i % cols) - cols / 2, r = Math.floor(i / cols) + row * 0.4;
      const d = 70 + r * 14;
      const x = c[0] + fx * d * side + rx * k * 13, z = c[1] + fz * d * side + rz * k * 13;
      placeSquad(world, sq, x, z, Math.atan2(-fx * side, -fz * side));
      sq.post = [sq.lx, sq.lz]; sq.home = sq.post; sq.role = 'staged';
      made[team].push(sq.id);
    }
  }
  if (opts.engage !== false) {
    issue(world, a, made[a], { type: 'move', to: c, attackMove: true });
    issue(world, b, made[b], { type: 'move', to: c, attackMove: true });
  }
  return { at: c, ids: made };
}
