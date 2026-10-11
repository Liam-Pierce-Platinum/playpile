// BANNERFALL :: sim/regions.js - regions, waystones, territory and claims (DESIGN.md 3.6).
// The map is cut into regions on an 8 m grid (worldgen). Each region has an owner (a faction slot,
// NEUTRAL for an untaken village, or -1 for wild land) and a waystone. Holding a waystone with
// soldiers for 20 s, with no hostile soldier within 15 m, claims the region. Settlement regions
// follow their settlement (sim/settlements in war.js). Supply lines: a region pays full income
// only when it connects through owned regions to an owned castle or stronghold.
import { forNear } from './combat.js';
import { hostile } from './factions.js';
import { NEUTRAL } from '../data/factions.js';

export const CLAIM_TIME = 20, WAYSTONE_R = 15;

export function regionAt(world, x, z) {
  const W = world.war; if (!W) return -1;
  const i = Math.floor(x / W.RG), j = Math.floor(z / W.RG);
  if (i < 0 || j < 0 || i >= W.GW || j >= W.GW) return -1;
  const r = W.regGrid[j * W.GW + i];
  return r === 65535 ? -1 : r;
}
export function ownerAt(world, x, z) {
  const r = regionAt(world, x, z);
  return r < 0 ? -1 : world.war.regions[r].owner;
}

export function setOwner(world, R, team, why) {
  if (R.owner === team) return;
  const old = R.owner;
  R.owner = team;
  R.claim = null;
  world.war.territoryV++;
  world.events.push({ type: 'region', id: R.id, team, old, name: R.name, why: why || 'claim', x: R.waystone[0], z: R.waystone[1] });
}

// once a second
export function updateRegions(world) {
  const W = world.war;
  for (const R of W.regions) {
    if (R.settlement || !R.cells) continue;
    const [x, z] = R.waystone;
    const present = new Map();
    forNear(world, x, z, WAYSTONE_R, (so) => {
      if (!so.alive || so.sq.state === 'routing' || so.sq.garrison) return;
      if ((so.x - x) ** 2 + (so.z - z) ** 2 > WAYSTONE_R * WAYSTONE_R) return;
      const t = so.sq.team;
      if (t >= NEUTRAL) return;
      present.set(t, (present.get(t) || 0) + 1);
    });
    const teams = [...present.keys()];
    let holder = -1, contested = false;
    for (const t of teams) {
      if (teams.some((u) => u !== t && hostile(world, t, u))) { contested = true; break; }
      if (holder === -1 || present.get(t) > present.get(holder)) holder = t;
    }
    R.contested = contested;
    if (contested || holder < 0 || holder === R.owner) {
      if (R.claim && !contested) { R.claim.t -= 2; if (R.claim.t <= 0) R.claim = null; }
      continue;
    }
    // an owner's soldiers anywhere near also block (the region is defended)
    if (!R.claim || R.claim.team !== holder) R.claim = { team: holder, t: 0 };
    R.claim.t += 1;
    if (R.claim.t >= CLAIM_TIME) setOwner(world, R, holder, 'claim');
  }
  // supply lines every 10 s
  if (world.t - (W.supplyT ?? -99) >= 10) { W.supplyT = world.t; updateSupply(world); }
}

// flood fill from every owned castle / stronghold region through owned regions
export function updateSupply(world) {
  const W = world.war;
  for (const R of W.regions) R.supplied = false;
  const roots = new Map();
  for (const s of W.settlements) {
    if (s.kind === 'village' || s.owner < 0 || s.owner >= NEUTRAL) continue;
    const R = W.regions[s.region]; if (!R || R.owner !== s.owner) continue;
    if (!roots.has(s.owner)) roots.set(s.owner, []);
    roots.get(s.owner).push(R);
  }
  for (const [team, list] of roots) {
    const stack = list.slice();
    for (const R of stack) R.supplied = true;
    while (stack.length) {
      const R = stack.pop();
      for (const n of R.neighbors) { const Q = W.regions[n]; if (Q.owner === team && !Q.supplied) { Q.supplied = true; stack.push(Q); } }
    }
  }
}

export function regionsOf(world, team) { let n = 0; for (const R of world.war.regions) if (R.owner === team && R.cells) n++; return n; }

// territory as an owner-per-cell array (for the renderer and the minimap): -1 wild
export function territoryGrid(world) {
  const W = world.war;
  const out = new Int8Array(W.GW * W.GW);
  for (let k = 0; k < out.length; k++) { const r = W.regGrid[k]; out[k] = r === 65535 ? -2 : W.regions[r].owner; }
  return out;
}
