// BANNERFALL :: sim/factions.js - who is at war with whom (DESIGN.md 9.1).
// world.hostM is a 9 x 9 Uint8 matrix: 1 = hostile. Slots 0..4 are kingdoms, 7 neutral, 8 wild.
// The v1 single-arena battles get the plain two-team matrix (0 and 1 at war), so every old
// `team !== team` check keeps its meaning when it becomes `hostile(...)`.
import { NEUTRAL, WILD, NF } from '../data/factions.js';

export { NEUTRAL, WILD, NF };

export function setupRelations(world, slots) {
  const M = new Uint8Array(NF * NF);
  for (const a of slots) for (const b of slots) if (a !== b) M[a * NF + b] = 1;
  // villagers fight anyone who comes for them; bandits fight everyone
  for (const a of slots) { M[a * NF + NEUTRAL] = 1; M[NEUTRAL * NF + a] = 1; M[a * NF + WILD] = 1; M[WILD * NF + a] = 1; }
  M[NEUTRAL * NF + WILD] = M[WILD * NF + NEUTRAL] = 1;
  world.hostM = M;
}

export function hostile(world, a, b) {
  if (a === b) return false;
  const M = world.hostM;
  return M ? M[a * NF + b] === 1 : true;
}

export function setRelation(world, a, b, war) {
  world.hostM[a * NF + b] = world.hostM[b * NF + a] = war ? 1 : 0;
}
