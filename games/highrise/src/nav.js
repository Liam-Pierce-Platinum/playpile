// =====================================================================
// HIGHRISE :: nav.js - WHAT A MAN CAN WALK THROUGH, AND WHAT HE CANNOT
// =====================================================================
//
// Liam: *"the enemies can just phase through walls partitions objects
// make them react to colliders and use path finding to get to the
// player"*.
//
// He is right, and the reason is worth writing down because it explains
// three other things about this game that felt wrong.
//
// EVERY ACTOR MOVED ON THE PLAN GRID AND NOTHING ELSE:
//
//     if (P.at(cx, cz) === EMPTY) a.x = nx;
//
// One cell lookup, at the destination's CENTRE, with no radius. So:
//
//   * A DESK IS NOT IN THE PLAN. Neither is a partition, a locker bank,
//     a filing cabinet or a sofa - the plan holds walls, glass and the
//     core, and every other solid thing in the building is a PROP. Men
//     walked through all of it.
//   * NO RADIUS means the test passes as long as his centre is in an
//     empty cell, so a 34 cm man clipped every wall corner he rounded
//     and could stand half inside the drywall.
//   * THE FLOW FIELD HAD THE SAME BLIND SPOT, which is worse than the
//     movement one: a man would path straight at a desk because the
//     route through it was shorter, then grind against it forever
//     because the goal on the far side never got closer.
//
// So there are two structures here and they do different jobs:
//
//   THE MASK  (buildNav)  one byte per plan cell, walls OR props. It is
//                         what the flow field floods, so a route already
//                         goes round the furniture instead of into it.
//   THE GRID  (bucket)    the real boxes, in 2 m buckets, for the actual
//                         per-frame collision with a radius and a slide.
//
// Pathing wants to be coarse and global; collision wants to be exact and
// local. Trying to do both with one of them is what was wrong.
import { W, D, CELL, EMPTY, toCell, toWorld } from './plan.js';

// A man steps over anything this low and walks under anything this high,
// so neither blocks him. Same numbers the player uses (player.js).
const STEP_UP = 0.46;
const HEAD = 1.7;
// A box has to cover the middle of a cell to close it. Marking a cell
// because a box clips its corner seals a 1 m corridor that a man can
// walk straight down, and the flow field then routes him the long way
// round a building for no reason anybody can see.
const CORE = 0.62;
const BUCKET = 2.0;

/** does this box stop a walking man? */
function stops(s) {
  return s.y + s.h / 2 > STEP_UP && s.y - s.h / 2 < HEAD;
}

/**
 * The mask the flow field floods: 1 where a man cannot stand.
 *
 * Doors are deliberately LEFT OUT. A door is the one solid thing in the
 * building that moves, and a man who will not path through a shut door
 * is a man who stands in a corridor forever waiting for it to open by
 * itself - so the route goes through it and doors.js lets him shove it.
 * That is also how a real building works.
 */
export function buildNav(world) {
  const P = world && world.plan;
  // syncProps runs DURING build(), before Building.ensure has attached
  // the plan to the world - so this is called once with nothing to read.
  // The real build happens the moment the plan is there; see building.js.
  if (!P) return null;
  const n = new Uint8Array(W * D);
  for (let z = 0; z < D; z++)
    for (let x = 0; x < W; x++)
      if (P.at(x, z) !== EMPTY) n[z * W + x] = 1;

  for (const s of world.props || []) {
    if (!stops(s) || s.isDoor) continue;
    // the cells whose middles this box covers
    const x0 = s.x - s.w / 2, x1 = s.x + s.w / 2;
    const z0 = s.z - s.d / 2, z1 = s.z + s.d / 2;
    const [ax, az] = toCell(x0, z0);
    const [bx, bz] = toCell(x1, z1);
    for (let cz = Math.max(0, az); cz <= Math.min(D - 1, bz); cz++) {
      for (let cx = Math.max(0, ax); cx <= Math.min(W - 1, bx); cx++) {
        const [wx, wz] = toWorld(cx, cz);
        const h = CORE / 2;
        if (x0 < wx + h && x1 > wx - h && z0 < wz + h && z1 > wz - h) n[cz * W + cx] = 1;
      }
    }
  }
  world.nav = n;
  world.navBuckets = bucket(world);
  return n;
}

/** 2 m buckets over the floor's solids, so a query is nine cells not five hundred */
function bucket(world) {
  const map = new Map();
  const list = world.props || [];
  for (let i = 0; i < list.length; i++) {
    const s = list[i];
    if (!stops(s)) continue;
    const x0 = Math.floor((s.x - s.w / 2) / BUCKET), x1 = Math.floor((s.x + s.w / 2) / BUCKET);
    const z0 = Math.floor((s.z - s.d / 2) / BUCKET), z1 = Math.floor((s.z + s.d / 2) / BUCKET);
    for (let bz = z0; bz <= z1; bz++)
      for (let bx = x0; bx <= x1; bx++) {
        const k = bx + ',' + bz;
        let arr = map.get(k);
        if (!arr) map.set(k, arr = []);
        arr.push(s);
      }
  }
  return map;
}

const _near = [];
/** every solid within a bucket of (x, z) - reused array, do not keep it */
export function nearSolids(world, x, z) {
  _near.length = 0;
  const m = world.navBuckets;
  if (!m) return _near;
  const bx = Math.floor(x / BUCKET), bz = Math.floor(z / BUCKET);
  for (let dz = -1; dz <= 1; dz++)
    for (let dx = -1; dx <= 1; dx++) {
      const arr = m.get((bx + dx) + ',' + (bz + dz));
      if (arr) for (const s of arr) _near.push(s);
    }
  return _near;
}

/** is a body of radius `r` at (x, z) clear of the walls AND the furniture? */
export function standable(world, x, z, r) {
  const P = world.plan;
  // the plan, with a radius - four corners of the body's box, which is
  // what stops a man standing half inside a wall
  for (const [ox, oz] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
    const [cx, cz] = toCell(x + ox, z + oz);
    if (cx < 0 || cz < 0 || cx >= W || cz >= D) return false;
    if (P.at(cx, cz) !== EMPTY) return false;
  }
  for (const s of nearSolids(world, x, z)) {
    if (Math.abs(x - s.x) < s.w / 2 + r && Math.abs(z - s.z) < s.d / 2 + r) return false;
  }
  return true;
}

/**
 * Move a body from where it is towards (nx, nz), sliding.
 *
 * Per axis, like the player: try x, then z. A man who is refused BOTH
 * stops dead, which is right; a man refused one slides along the other,
 * which is what stops him grinding into a corner of a desk for the rest
 * of the level.
 *
 * Returns how far he actually got, which the animator needs - a man
 * walking on the spot at a wall should be playing an idle, not a walk.
 */
export function slide(world, body, nx, nz, r) {
  let moved = 0;
  if (standable(world, nx, body.z, r)) { moved += Math.abs(nx - body.x); body.x = nx; }
  if (standable(world, body.x, nz, r)) { moved += Math.abs(nz - body.z); body.z = nz; }
  return moved;
}

/**
 * Push a body out of anything it is already inside.
 *
 * Needed because the world moves underneath men: a door swings into one,
 * Liam drops a filing cabinet on one in the editor, a floor is rebuilt
 * around one. Without this a man who ends up inside a box has every
 * direction refused and is welded there for the rest of the game.
 */
export function unstick(world, body, r) {
  if (standable(world, body.x, body.z, r)) return false;
  for (let rad = 0.25; rad <= 2.5; rad += 0.25) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const x = body.x + Math.cos(a) * rad, z = body.z + Math.sin(a) * rad;
      if (standable(world, x, z, r)) { body.x = x; body.z = z; return true; }
    }
  }
  return false;
}
