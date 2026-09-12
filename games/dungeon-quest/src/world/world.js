// Collision world.
//
// AABB-only on purpose. N64 games used simple convex collision and so does
// this: it is predictable, it is fast, and the player can feel where it is.
import * as THREE from 'three';
import { ColliderGrid } from './grid.js';

const PLAYER_HEIGHT = 1.75;

export class World {
  constructor(scene) {
    this.scene = scene;
    // Everything a level builds goes under one group, so switching levels is
    // a single remove + dispose instead of hunting individual objects.
    this.root = new THREE.Group();
    scene.add(this.root);
    this.boxes = [];          // { min, max, solid, walkable }
    // Round things get ROUND colliders. A box around a tree trunk juts out at
    // the corners, and catching on those corners is what makes a forest
    // miserable to walk through.
    this.cylinders = [];      // { x, z, r, minY, maxY, solid, walkable }
    this.colliders = [];      // meshes the camera raycasts against
    this.baseGround = 0;
    // A level with real relief supplies terrain(x, z) -> height. Levels 1 and
    // 2 are flat and leave it null, which keeps their ground lookup a constant.
    this.terrain = null;
    // Spatial index. Built lazily the first time anything asks a collision
    // question, and thrown away whenever a collider is added.
    this.grid = new ColliderGrid();
    this._bigs = [];       // colliders too large to bucket
    this._hits = [];       // scratch, reused every query -- no per-frame garbage
    this._pen = [];        // a second one, because depenetrate holds its set
  }

  /**
   * Register a circular footprint. `r` is the real radius -- no padding, since
   * the mover's own radius is added at test time.
   */
  addCylinder(x, z, r, minY, maxY, { solid = true, walkable = false } = {}) {
    this.cylinders.push({ x, z, r, minY, maxY, solid, walkable });
    this.grid.dirty = true;
  }

  /** Add a mesh to the scene with a cylinder footprint at its position. */
  placeRound(mesh, r, height, opts = {}) {
    this.root.add(mesh);
    const y = mesh.position.y;
    this.addCylinder(mesh.position.x, mesh.position.z, r, y, y + height, opts);
    if (opts.camera !== false) this.colliders.push(mesh);
    return mesh;
  }

  /** Register a mesh (already positioned) as collision geometry. */
  addCollider(mesh, { solid = true, walkable = true, camera = true, shrink = 0 } = {}) {
    mesh.updateMatrixWorld(true);
    // A prop can nominate a sub-mesh as its collision shape -- a tree should
    // block you at the trunk, not out at the edge of its canopy.
    const bb = new THREE.Box3().setFromObject(mesh.userData.collider ?? mesh);
    if (shrink) {
      bb.min.x += shrink; bb.min.z += shrink;
      bb.max.x -= shrink; bb.max.z -= shrink;
    }
    this.boxes.push({ min: bb.min.clone(), max: bb.max.clone(), solid, walkable });
    this.grid.dirty = true;
    if (camera) this.colliders.push(mesh);
    return mesh;
  }

  /** Add to the level and register collision in one go. */
  place(mesh, opts) {
    this.root.add(mesh);
    return this.addCollider(mesh, opts);
  }

  /**
   * Slide a prop sideways until its inner face lands on `edgeX`.
   *
   * A cliff chunk is built from a core plus buttresses plus a cap, and it ends
   * up half again as wide as the number you passed in -- then it gets rotated,
   * which widens it further. Guessing that offset is how visible rock ended up
   * hanging two metres over floor the player was allowed to stand on. Measure
   * the thing instead.
   *
   * @param side  -1 to seat it on the left of the valley, +1 for the right
   */
  seatAgainst(mesh, edgeX, side) {
    mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh);
    const inner = side > 0 ? bb.min.x : bb.max.x;
    mesh.position.x += (edgeX - inner);
    return mesh;
  }

  /**
   * Add a prop AND give it a collider measured from the mesh itself.
   *
   * Cliff dressing used to be pure decoration sitting near an invisible wall,
   * and keeping the two lined up was a losing game: chunks are built wider
   * than their nominal size, they are rotated, and the wall takes a tighter
   * line than the level maths. So the player walked into rock they could see.
   * Deriving the collider from the drawn shape makes the two the same thing by
   * construction.
   *
   * @param inset  shrink the radius a little, so you can brush past a rock
   *               face rather than being held off it.
   */
  placeMeasured(mesh, { inset = 0.6, walkable = false, camera = true } = {}) {
    this.root.add(mesh);
    mesh.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(mesh);
    const rx = (bb.max.x - bb.min.x) * 0.5;
    const rz = (bb.max.z - bb.min.z) * 0.5;
    // Hug the rock rather than hiding inside it: min(rx,rz) leaves the wide
    // half of a turned chunk sticking out with nothing behind it. The average
    // of the two extents, less a small inset so you can brush past a face.
    const r = Math.max(0.6, (rx + rz) * 0.5 - inset);
    this.addCylinder((bb.min.x + bb.max.x) * 0.5, (bb.min.z + bb.max.z) * 0.5,
      r, bb.min.y, bb.max.y, { solid: true, walkable });
    if (camera) this.colliders.push(mesh);
    return mesh;
  }

  /** Add as pure decoration -- no collision, no camera raycast. */
  decorate(mesh) {
    this.root.add(mesh);
    return mesh;
  }

  /** An invisible wall, for level edges. */
  /**
   * An invisible wall.
   *
   * @param inward  optional unit vector pointing INTO the play area. A
   *   containment wall is a long thin slab, and the generic "leave by the
   *   nearest face" rule will happily squeeze you out of its END -- straight
   *   into the next segment, which does the same thing, which is how a player
   *   ends up welded to a cliff. If a wall knows which way is out, it pushes
   *   you that way and only that way.
   */
  addWall(minX, minZ, maxX, maxZ, height = 20, inward = null) {
    this.boxes.push({
      min: new THREE.Vector3(minX, -1, minZ),
      max: new THREE.Vector3(maxX, height, maxZ),
      solid: true, walkable: false, inward,
    });
    this.grid.dirty = true;
  }

  /** Highest walkable surface at (x,z) that is not above the player's feet. */
  /** (Re)bucket everything. Cheap, and only ever run once per level. */
  buildGrid() {
    this.grid.clear();
    this._bigs.length = 0;
    for (const b of this.boxes) {
      b._everywhere = false;
      this.grid.insert(b, b.min.x, b.min.z, b.max.x, b.max.z);
      if (b._everywhere) this._bigs.push(b);
    }
    for (const c of this.cylinders) {
      c._everywhere = false;
      this.grid.insert(c, c.x - c.r, c.z - c.r, c.x + c.r, c.z + c.r);
      if (c._everywhere) this._bigs.push(c);
    }
    this.grid.dirty = false;
  }

  /** Colliders that could matter at (x, z). */
  candidates(x, z, pad = 1.2) {
    if (this.grid.dirty) this.buildGrid();
    const out = this.grid.nearPadded(x, z, pad, this._hits);
    for (const b of this._bigs) out.push(b);
    return out;
  }

  groundHeight(x, z, fromY = Infinity) {
    let best = this.terrain ? this.terrain(x, z) : this.baseGround;
    const reach = fromY + 0.35;
    // only what is bucketed near this point, not the whole level
    const near = this.candidates(x, z, 0.1);
    for (const it of near) {
      if (!it.walkable) continue;
      if (it.min) {
        if (x < it.min.x || x > it.max.x || z < it.min.z || z > it.max.z) continue;
        if (it.max.y > best && it.max.y <= reach) best = it.max.y;
      } else {
        const dx = x - it.x, dz = z - it.z;
        if (dx * dx + dz * dz > it.r * it.r) continue;
        if (it.maxY > best && it.maxY <= reach) best = it.maxY;
      }
    }
    return best;
  }

  /**
   * Would a capsule at (x,z) standing on feetY intersect a wall?
   * Anything shorter than stepHeight is walked over instead of blocking.
   */
  blocked(x, z, feetY, radius = 0.32, stepHeight = 0.42) {
    const headY = feetY + PLAYER_HEIGHT;
    for (const it of this.candidates(x, z, radius + 0.4)) {
      if (!it.solid) continue;
      if (it.min) {
        if (it.max.y <= feetY + stepHeight) continue;   // step over it
        if (it.min.y >= headY) continue;                // duck under it
        if (x + radius < it.min.x || x - radius > it.max.x) continue;
        if (z + radius < it.min.z || z - radius > it.max.z) continue;
        return true;
      }
      if (it.maxY <= feetY + stepHeight) continue;
      if (it.minY >= headY) continue;
      const dx = x - it.x, dz = z - it.z;
      const rr = it.r + radius;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }

  /**
   * Push a point OUT of anything it is overlapping.
   *
   * Without this, ending up even slightly inside a trunk means every axis of
   * movement is rejected and you are stuck for good -- which is what makes bad
   * collision feel so awful. With it, a bad collider costs you a nudge instead
   * of the run.
   */
  depenetrate(pos, radius, stepHeight = 0.42) {
    let x = pos.x, z = pos.z;
    const headY = pos.y + PLAYER_HEIGHT;

    for (let iter = 0; iter < 3; iter++) {
      let moved = false;

      // Re-fetched each pass because x and z move as we resolve, and copied
      // into its OWN reusable buffer -- slicing here allocated three arrays
      // per call, and this runs for every enemy every frame.
      const src = this.candidates(x, z, radius + 1.0);
      const cands = this._pen;
      cands.length = 0;
      for (let i = 0; i < src.length; i++) cands.push(src[i]);

      for (const c of cands) {
        if (!c.solid || c.min) continue;
        if (c.maxY <= pos.y + stepHeight || c.minY >= headY) continue;
        const dx = x - c.x, dz = z - c.z;
        const rr = c.r + radius;
        const d2 = dx * dx + dz * dz;
        if (d2 >= rr * rr) continue;
        const d = Math.sqrt(d2);
        // dead centre: shove in an arbitrary but stable direction
        const nx = d > 1e-4 ? dx / d : 1, nz = d > 1e-4 ? dz / d : 0;
        const push = rr - d + 0.002;
        x += nx * push; z += nz * push;
        moved = true;
      }

      for (const b of cands) {
        if (!b.solid || !b.min) continue;
        if (b.max.y <= pos.y + stepHeight || b.min.y >= headY) continue;
        if (x + radius <= b.min.x || x - radius >= b.max.x) continue;
        if (z + radius <= b.min.z || z - radius >= b.max.z) continue;
        // a wall that knows which way is out pushes you that way, always
        if (b.inward) {
          if (b.inward.x < 0) x = b.min.x - radius - 0.002;
          else if (b.inward.x > 0) x = b.max.x + radius + 0.002;
          else if (b.inward.z < 0) z = b.min.z - radius - 0.002;
          else z = b.max.z + radius + 0.002;
          moved = true;
          continue;
        }

        // leave along whichever face is nearest
        const left = x + radius - b.min.x;
        const right = b.max.x - (x - radius);
        const back = z + radius - b.min.z;
        const front = b.max.z - (z - radius);
        const m = Math.min(left, right, back, front);
        if (m === left) x = b.min.x - radius - 0.002;
        else if (m === right) x = b.max.x + radius + 0.002;
        else if (m === back) z = b.min.z - radius - 0.002;
        else z = b.max.z + radius + 0.002;
        moved = true;
      }

      if (!moved) break;
    }

    /* ---- the wedge ----
     * Two colliders can disagree. A cliff prop scattered a little too close to
     * the containment wall will shove you back INTO the wall, the wall shoves
     * you back into the prop, and after three passes you are exactly where you
     * started and welded there.
     *
     * A containment wall is the one collider in the world that knows which way
     * is out, so if we are still stuck, walk that way until we are clear.
     */
    if (this.blocked(x, z, pos.y, radius, stepHeight)) {
      const wall = this.boxes.find(b => b.inward && b.solid
        && b.max.y > pos.y + stepHeight && b.min.y < pos.y + PLAYER_HEIGHT
        && x + radius > b.min.x && x - radius < b.max.x
        && z + radius > b.min.z && z - radius < b.max.z);
      let freed = false;
      if (wall) {
        const nx = wall.inward.x, nz = wall.inward.z;
        for (let step = 0.25; step <= 12; step += 0.25) {
          const tx = x + nx * step, tz = z + nz * step;
          if (!this.blocked(tx, tz, pos.y, radius, stepHeight)) {
            x = tx; z = tz; freed = true; break;
          }
        }
      }

      // Last resort, and it covers the cases a wall normal cannot: wedged
      // against an ISLAND -- a fork massif, a cliff chunk hanging over a drop
      // -- where there is no single "out". Spiral outward in eight directions
      // and take the nearest clear spot. Being moved a metre and a half is
      // always better than being welded in place.
      if (!freed && this.blocked(x, z, pos.y, radius, stepHeight)) {
        let best = null, bestD = Infinity;
        for (let step = 0.35; step <= 9 && !best; step += 0.35) {
          for (let k = 0; k < 8; k++) {
            const a2 = (k / 8) * Math.PI * 2;
            const tx = x + Math.cos(a2) * step, tz = z + Math.sin(a2) * step;
            if (this.blocked(tx, tz, pos.y, radius, stepHeight)) continue;
            if (step < bestD) { best = { x: tx, z: tz }; bestD = step; }
          }
        }
        if (best) { x = best.x; z = best.z; }
      }
    }

    return { x, z };
  }

  /** Straight-line visibility test, used by enemy AI. */
  lineBlocked(ax, az, bx, bz, feetY = 0.9) {
    const dx = bx - ax, dz = bz - az;
    const dist = Math.hypot(dx, dz);
    const steps = Math.min(24, Math.ceil(dist / 0.8));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.blocked(ax + dx * t, az + dz * t, feetY, 0.15, 0.6)) return true;
    }
    return false;
  }
}

/** Tear a level down completely: geometry, materials and collision. */
World.prototype.dispose = function dispose() {
  this.root.traverse(o => {
    if (o.isMesh) {
      o.geometry?.dispose?.();
      const m = o.material;
      if (Array.isArray(m)) m.forEach(x => x.dispose?.());
      else m?.dispose?.();
    }
  });
  this.scene.remove(this.root);
  this.boxes.length = 0;
  this.cylinders.length = 0;
  this.colliders.length = 0;
};
