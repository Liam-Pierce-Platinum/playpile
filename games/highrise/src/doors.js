// ============================================================================
//  DOORS - the first thing in this building that moves on its own
// ============================================================================
//
// Liam: *"make doors that I can put in that swing open when hit by players
// making an oldschool satisfying pysics of the enviorment"*.
//
// The whole trick is that a swinging door is only satisfying if you can
// FEEL it, and you only feel it if its collision turns with it. Every
// other prop in the game gets its collider from a static transform once,
// at build time. A door's leaf gets one every frame, off the same live
// world matrix - which is exactly the rule the rest of the game already
// follows (syncProps), just run at 60 Hz instead of once.
//
// THE BOXES ARE REWRITTEN IN PLACE. `world.props` boxes are copied by
// reference into `world.solidsAbs` and again into `building.solids`, so
// three arrays share one object. Mutate the object and all three see it.
// Push a new object and only the one you touched does, and the player
// walks through a door he can see swinging. That is why this file only
// ever assigns to fields of an existing box and never replaces one.

import * as THREE from '../vendor/three.module.js';
import { placeColliders } from './collide.js';

// ---- how a door feels ------------------------------------------------
//
// Not a physical simulation of a door - a simulation of what a door in a
// 2001 shooter felt like. Barely any spring (it drifts shut over a few
// seconds rather than snapping), enough damping that it settles instead
// of flapping, and a hard stop it bounces off so a hard shove BANGS.
const SPRING = 2.2;      // rad/s^2 per rad - the slow drift back to shut
const DAMP = 1.5;        // 1/s
const STOP_BOUNCE = 0.34;
const MAX_W = 7.0;       // rad/s
const GAIN = 5.2;        // shove -> spin
const REACH = 0.30;      // how close the player gets before he is pushing
// How much of a shove the OTHER half of a double door gets. Not all of
// it: you are pushing one leaf and the other is coming along, so it
// should trail rather than move in lockstep, which is what makes a
// double door read as two doors instead of one wide one.
const PAIR_SHARE = 0.72;
// A leaf parks HERE, not at its modelled limit: an axis-aligned collider
// round a leaf is 8 cm deep at a right angle and grows fast either side.
const FLAT = Math.PI / 2;
// How long a leaf stays flat after the last shove - long enough to walk
// through the doorway you just opened.
const HOLD = 0.85;

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();

/** Every hinged leaf on `world`, rediscovered after any edit. */
export function collect(world) {
  const out = [];
  if (!world || !world.group) return out;
  for (const o of world.group.children) {
    if (o.visible === false) continue;
    const hinges = (o.userData && o.userData.hinges) || [];
    // WHICH LEAVES BELONG TO THE SAME DOOR. A double door is two leaves
    // in one group and they have to move together - see the note in
    // step(). Collected here rather than derived in the loop because it
    // is a property of the door, and this is the one place that knows
    // what a door is.
    const pair = hinges.map((l) => l.userData.door);
    for (const leaf of hinges) {
      if (pair.length > 1) leaf.userData.door.pair = pair;
      out.push(leaf);
    }
  }
  world.doors = out;
  return out;
}

// Rebind each leaf to the collision boxes syncProps just made for it.
// Call after anything that rebuilds world.props.
export function bind(world) {
  const doors = world.doors || collect(world);
  for (const leaf of doors) {
    const d = leaf.userData.door;
    d.boxes = (world.props || []).filter((b) => b.oid === leaf.id);
    d.base = world.base || 0;
  }
  return doors;
}

/**
 * Turn every door on `world` by `dt`, shoved by `player` if he is leaning
 * on one, and write the new collision.
 */
export function step(world, player, dt, crowd) {
  const doors = world && world.doors;
  if (!doors || !doors.length) return;

  // ---- EVERYONE WHO CAN OPEN A DOOR ---------------------------------
  //
  // Liam: *"the enemies need to be able to push through doors too"*.
  //
  // They could not, and the reason is that they never touched a door at
  // all: the AI walks on the PLAN GRID, which knows about walls and
  // nothing about props, so a man crossed a shut door as if it were open
  // and the leaf never moved. It looked like the door was ignoring him;
  // in fact he was ignoring the door.
  //
  // A pusher is anything with a position and a direction of travel. The
  // player supplies intent (player.wish); an actor has no such thing, so
  // his shove comes from how far he has moved since the last frame -
  // which is why `prev` is remembered on him here rather than computed
  // by the AI.
  const pushers = [{
    x: player.pos.x, z: player.pos.z, y: player.pos.y,
    vx: player.wish ? player.wish.x * (player.wishSpeed || 0)
                    : (player.vel ? player.vel.x : 0),
    vz: player.wish ? player.wish.z * (player.wishSpeed || 0)
                    : (player.vel ? player.vel.z : 0),
    r: 0.32,
  }];
  if (crowd) for (const a of crowd) {
    if (!a.alive) continue;
    const p0 = a._doorPrev;
    const vx = p0 ? (a.x - p0.x) / Math.max(dt, 1e-4) : 0;
    const vz = p0 ? (a.z - p0.z) / Math.max(dt, 1e-4) : 0;
    if (p0) { p0.x = a.x; p0.z = a.z; } else a._doorPrev = { x: a.x, z: a.z };
    if (Math.hypot(vx, vz) < 0.3) continue;            // standing still
    pushers.push({ x: a.x, z: a.z, y: a.base || 0, vx, vz, r: 0.34 });
  }

  const px = player.pos.x, pz = player.pos.z, py = player.pos.y;
  // HIS INTENT, NOT HIS VELOCITY. A shut door is solid, so the frame he
  // walks into it the collision pass zeroes the velocity going that way -
  // and a door that read vel would see a man standing perfectly still
  // against it and never move. player.wish is what he is asking for, and
  // it keeps saying "forward" for as long as he leans on the handle.
  const wsh = player.wish, wsp = player.wishSpeed || 0;
  const vx = wsh ? wsh.x * wsp : (player.vel ? player.vel.x : 0);
  const vz = wsh ? wsh.z * wsp : (player.vel ? player.vel.z : 0);
  const rad = (player.radius || 0.32) + REACH;

  for (const leaf of doors) {
    const d = leaf.userData.door;

    // ---- the shove ---------------------------------------------------
    //
    // The leaf runs along its local +x. At world yaw phi that axis points
    // (cos phi, -sin phi) and its face normal points (sin phi, cos phi);
    // increasing phi sweeps the leaf towards -normal. So a man standing
    // on the +normal side and walking into it wants phi to RISE, and the
    // sign of his side is the sign of the torque. That one line is the
    // whole of "it opens the way you were going".
    // The parent's own yaw counts too - the editor can turn a whole door
    // frame, and then the leaf's world angle is the frame's plus its own.
    const phi = (d.pyaw || 0) + d.rest + d.a;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    const dx = px - d.hx, dz = pz - d.hz;
    // A RIGHT-HUNG LEAF RUNS ALONG LOCAL -X. Its geometry is the same
    // joinery mirrored, so the distance from the hinge is measured the
    // other way and a shove on a given face has to turn it the other way
    // - without `turn` a right-hung door opens when you pull it and jams
    // when you walk into it.
    const turn = d.flip ? -1 : 1;
    const along = (dx * cs - dz * sn) * turn;    // distance from the hinge
    const norm = dx * sn + dz * cs;              // which side, how far off

    for (const m of pushers) {
      const mdx = m.x - d.hx, mdz = m.z - d.hz;
      const mAlong = (mdx * cs - mdz * sn) * turn;
      const mNorm = mdx * sn + mdz * cs;
      if (!(m.y < d.base + d.h && m.y + 1.7 > d.base)) continue;
      if (mAlong <= -0.10 || mAlong >= d.span + 0.22) continue;
      if (Math.abs(mNorm) >= m.r + REACH) continue;
      const face = mNorm >= 0 ? 1 : -1;         // which side of the leaf he is on
      const into = -face * (m.vx * sn + m.vz * cs);
      if (into > 0.25) {
        const arm = Math.min(1, Math.max(0.22, mAlong / d.span));
        d.v += face * turn * into * arm * GAIN * dt;
        d.hold = HOLD;
        // ---- AND THE OTHER LEAF GOES WITH IT ---------------------------
        //
        // You shove a double door and BOTH halves swing. Ours pushed only
        // the leaf you were touching, and that is the whole of Liam's
        // "some collider the player needs to go around to get out of the
        // door of the starting room":
        //
        //   walk at the north half of a 2 m doorway
        //   -> the north leaf opens to 82 degrees and parks against the
        //      jamb, where its 20 cm THICKNESS still overlaps the opening
        //   -> the south leaf never hears about it and stays shut,
        //      taking 95 cm
        //   -> the gap left is 76 cm of a 200 cm doorway, and it is not
        //      where you were walking. He stopped dead 8 cm short.
        //
        // Sharing the shove is both the fix and the truth about doors.
        // `face`, `into` and `arm` are properties of the PUSHER against
        // the door's plane, which both leaves share; only `turn` differs,
        // because the leaves are hung on opposite sides.
        if (d.pair) for (const other of d.pair) {
          if (other === d) continue;
          other.v += face * (other.flip ? -1 : 1) * into * arm * GAIN * dt * PAIR_SHARE;
          other.hold = HOLD;
        }
      }
    }

    // ---- integrate -----------------------------------------------------
    //
    // A DOOR YOU ARE WALKING THROUGH HAS TO STAY FLAT AGAINST THE WALL.
    //
    // This is the second half of Liam's "collider you have to go around",
    // and it is a collision-shape problem rather than a door problem. A
    // leaf's collider is an AXIS-ALIGNED box, so its footprint depends on
    // its angle: 8 cm at 90 degrees, 21 cm at 82, and SEVENTY CENTIMETRES
    // at 46. The old door bounced off its stop and then oscillated
    // between 46 and 82 for as long as you leaned on it, which put half a
    // metre of collider across the opening the whole time you were trying
    // to walk through it. He got within eight centimetres and stopped.
    //
    // So: while somebody is actually pushing, the spring is nearly off
    // and the stop does not bounce - the leaf goes flat and STAYS there,
    // and for a moment afterwards, which is the moment you walk through.
    // Then it drifts shut as before.
    //
    // The stop is also pulled back to a right angle. `open` was 100
    // degrees, and past 90 the leaf starts swinging back INTO the
    // doorway - a door that opens too far is exactly as much in the way
    // as one that does not open enough.
    d.hold = Math.max(0, (d.hold || 0) - dt);
    const holding = d.hold > 0;
    d.v += ((holding ? SPRING * 0.06 : SPRING) * -d.a - DAMP * d.v) * dt;
    if (d.v > MAX_W) d.v = MAX_W; else if (d.v < -MAX_W) d.v = -MAX_W;
    d.a += d.v * dt;
    const stop = Math.min(d.open, FLAT);
    if (d.a > stop) { d.a = stop; d.v = holding ? 0 : -d.v * STOP_BOUNCE; }
    else if (d.a < -stop) { d.a = -stop; d.v = holding ? 0 : -d.v * STOP_BOUNCE; }
    // Park it. Without this every door in the building keeps a
    // micro-oscillation forever and pays for a collider rebuild to do it.
    if (Math.abs(d.a) < 0.004 && Math.abs(d.v) < 0.02) {
      if (!d.parked) { d.a = 0; d.v = 0; d.parked = true; write(leaf, d); }
      continue;
    }
    d.parked = false;

    leaf.rotation.y = d.rest + d.a;
    write(leaf, d);
  }
}

// Re-derive the leaf's collision from where it actually is now.
function write(leaf, d) {
  if (!d.boxes || !d.boxes.length) return;
  leaf.updateWorldMatrix(true, false);
  leaf.matrixWorld.decompose(_p, _q, _s);
  const yaw = Math.atan2(2 * (_q.w * _q.y + _q.x * _q.z),
                         1 - 2 * (_q.y * _q.y + _q.x * _q.x));
  const made = placeColliders(d.hull, _p.x, _p.z, yaw, d.base + _p.y, d.cover);
  for (let i = 0; i < d.boxes.length && i < made.length; i++) {
    const b = d.boxes[i], m = made[i];
    b.x = m.x; b.y = m.y; b.z = m.z; b.w = m.w; b.h = m.h; b.d = m.d;
  }
}

/**
 * Knock a door with something that is not the player - a bullet, a body.
 * (`fx`,`fz`) is the direction of travel, `force` is roughly metres per
 * second of shove.
 */
export function impulse(world, x, z, fx, fz, force) {
  const doors = world && world.doors;
  if (!doors) return false;
  let hit = false;
  for (const leaf of doors) {
    const d = leaf.userData.door;
    const phi = (d.pyaw || 0) + d.rest + d.a;
    const cs = Math.cos(phi), sn = Math.sin(phi);
    const dx = x - d.hx, dz = z - d.hz;
    const turn = d.flip ? -1 : 1;
    const along = (dx * cs - dz * sn) * turn, norm = dx * sn + dz * cs;
    if (along < -0.10 || along > d.span + 0.22 || Math.abs(norm) > 0.35) continue;
    const face = norm >= 0 ? 1 : -1;
    const into = -face * (fx * sn + fz * cs);
    if (into <= 0) continue;
    d.v += face * turn * into * Math.min(1, Math.max(0.22, along / d.span)) * force;
    d.parked = false;
    hit = true;
  }
  return hit;
}
