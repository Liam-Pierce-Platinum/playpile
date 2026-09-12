// =====================================================================
// HIGHRISE :: collide.js - COLLIDERS THAT ARE THE SHAPE OF THE THING
// =====================================================================
//
// Liam: *"make colliders better and more accurate all around there will
// be some things the player can phase through and other things they can't
// fix that"*.
//
// Both halves of that came from the same shortcut. Every imported prop
// got ONE axis-aligned box, taken straight off its bounding box, and a
// bounding box is a terrible description of furniture:
//
//   - A TABLE is mostly air. Its bounding box is a solid cube from the
//     floor to the top, so you cannot walk under it, cannot slide beneath
//     it, and cannot shoot through the gap between its legs - and neither
//     can anybody else. That is the "things they can't [get through]".
//   - An L-SHAPED WORKSTATION's bounding box is the whole L filled in.
//     Half of what it blocks is empty floor you can see straight across.
//   - And anything placed WITHOUT a solid - the desk-top clutter, the
//     wall art, several of the reference props - has no collider at all,
//     which is the "phase through".
//
// The fix is to stop describing a prop with one box and start describing
// it with a handful. Not a mesh collider: a mesh collider would be exact
// and would cost a triangle test per prop per frame, and this game has
// hundreds of props and runs its collision every step for the player and
// every actor. A HANDFUL OF BOXES is the right trade - it keeps the loop
// a cheap AABB test and gets the shape right to within a few centimetres.
//
// HOW THEY ARE FOUND
//
// Voxelise, then merge. Lay a coarse grid over the prop, mark every cell
// a triangle passes through, then greedily merge runs of marked cells
// back into boxes. A table comes out as a slab and four legs. A chair
// comes out as a seat, a back and a base. The gaps are real gaps.
//
// This runs ONCE per prop kind at load, not per instance, so a floor with
// forty tables pays for it once.
import * as THREE from '../vendor/three.module.js';

/** every triangle of an object, in the object's own space */
function triangles(obj) {
  const out = [];
  obj.updateWorldMatrix(true, true);
  const inv = new THREE.Matrix4().copy(obj.matrixWorld).invert();
  obj.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const g = o.geometry;
    const pos = g.attributes.position;
    if (!pos) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const idx = g.index;
    const n = idx ? idx.count : pos.count;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i < n; i += 3) {
      const i0 = idx ? idx.getX(i) : i, i1 = idx ? idx.getX(i+1) : i+1,
            i2 = idx ? idx.getX(i+2) : i+2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m);
      b.fromBufferAttribute(pos, i1).applyMatrix4(m);
      c.fromBufferAttribute(pos, i2).applyMatrix4(m);
      out.push([a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z]);
    }
  });
  return out;
}

/**
 * Boxes describing `obj`, in its own space.
 *
 * `cell` is the target voxel size in metres. 0.10 gets a chair's legs;
 * going finer mostly finds screws and costs boxes.
 */
export function colliders(obj, opts = {}) {
  const CELL = opts.cell || 0.11;
  const MAXBOX = opts.maxBox || 12;
  const MINFILL = opts.minFill ?? 0.02;      // ignore specks

  const tris = triangles(obj);
  if (!tris.length) return [];

  let x0 = 1e9, y0 = 1e9, z0 = 1e9, x1 = -1e9, y1 = -1e9, z1 = -1e9;
  for (const t of tris) for (let k = 0; k < 9; k += 3) {
    if (t[k] < x0) x0 = t[k];      if (t[k] > x1) x1 = t[k];
    if (t[k+1] < y0) y0 = t[k+1];  if (t[k+1] > y1) y1 = t[k+1];
    if (t[k+2] < z0) z0 = t[k+2];  if (t[k+2] > z1) z1 = t[k+2];
  }
  const sx = x1 - x0, sy = y1 - y0, sz = z1 - z0;
  // A CAP ON THE GRID, not a fixed resolution. A 12 m workstation run at
  // 11 cm would be a hundred cells across and take longer to voxelise
  // than to draw.
  const NX = Math.max(1, Math.min(24, Math.round(sx / CELL)));
  const NY = Math.max(1, Math.min(24, Math.round(sy / CELL)));
  const NZ = Math.max(1, Math.min(24, Math.round(sz / CELL)));
  const dx = sx / NX, dy = sy / NY, dz = sz / NZ;

  const occ = new Uint8Array(NX * NY * NZ);
  const at = (i, j, k) => occ[(k * NY + j) * NX + i];
  const set = (i, j, k) => { occ[(k * NY + j) * NX + i] = 1; };

  // MARK BY TRIANGLE BOUNDING BOX. Conservative - it can mark a cell a
  // triangle only clips the corner of - and that is the right way to be
  // wrong for a collider: slightly too solid beats a hole you fall in.
  for (const t of tris) {
    const ax = Math.min(t[0], t[3], t[6]), bx = Math.max(t[0], t[3], t[6]);
    const ay = Math.min(t[1], t[4], t[7]), by = Math.max(t[1], t[4], t[7]);
    const az = Math.min(t[2], t[5], t[8]), bz = Math.max(t[2], t[5], t[8]);
    const i0 = Math.max(0, Math.floor((ax - x0) / dx)), i1 = Math.min(NX - 1, Math.floor((bx - x0) / dx));
    const j0 = Math.max(0, Math.floor((ay - y0) / dy)), j1 = Math.min(NY - 1, Math.floor((by - y0) / dy));
    const k0 = Math.max(0, Math.floor((az - z0) / dz)), k1 = Math.min(NZ - 1, Math.floor((bz - z0) / dz));
    for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) set(i, j, k);
  }

  let filled = 0;
  for (let i = 0; i < occ.length; i++) filled += occ[i];
  if (!filled) return [];
  if (filled / occ.length < MINFILL) return [];

  // ---- GREEDY MERGE: grow a box in x, then z, then y ----------------
  //
  // The order matters. Furniture is made of horizontal slabs and vertical
  // posts, so growing the footprint first and the height last produces
  // "a table top" and "a leg" rather than a stack of thin plates.
  const boxes = [];
  const used = new Uint8Array(occ.length);
  const idx = (i, j, k) => (k * NY + j) * NX + i;
  for (let j = 0; j < NY; j++) for (let k = 0; k < NZ; k++) for (let i = 0; i < NX; i++) {
    if (!at(i, j, k) || used[idx(i, j, k)]) continue;
    let wi = 1;
    while (i + wi < NX && at(i + wi, j, k) && !used[idx(i + wi, j, k)]) wi++;
    let wk = 1;
    grow:
    while (k + wk < NZ) {
      for (let a = 0; a < wi; a++)
        if (!at(i + a, j, k + wk) || used[idx(i + a, j, k + wk)]) break grow;
      wk++;
    }
    let wj = 1;
    growY:
    while (j + wj < NY) {
      for (let b = 0; b < wk; b++) for (let a = 0; a < wi; a++)
        if (!at(i + a, j + wj, k + b) || used[idx(i + a, j + wj, k + b)]) break growY;
      wj++;
    }
    for (let b = 0; b < wj; b++) for (let c = 0; c < wk; c++) for (let a = 0; a < wi; a++)
      used[idx(i + a, j + b, k + c)] = 1;
    boxes.push({
      x: x0 + (i + wi / 2) * dx, y: y0 + (j + wj / 2) * dy, z: z0 + (k + wk / 2) * dz,
      w: wi * dx, h: wj * dy, d: wk * dz,
    });
  }

  // ---- AND NOT TOO MANY OF THEM ------------------------------------
  //
  // The collision loop is linear in the number of boxes on the floor, so
  // a prop is allowed a budget. Over it, the smallest boxes are dropped
  // into whichever surviving box is nearest - a chair's castors become
  // part of its base, which is what a player feels anyway.
  boxes.sort((a, b) => b.w * b.h * b.d - a.w * a.h * a.d);
  if (boxes.length > MAXBOX) {
    const keep = boxes.slice(0, MAXBOX);
    for (const s of boxes.slice(MAXBOX)) {
      let best = keep[0], bd = 1e9;
      for (const q of keep) {
        const d2 = (q.x - s.x) ** 2 + (q.y - s.y) ** 2 + (q.z - s.z) ** 2;
        if (d2 < bd) { bd = d2; best = q; }
      }
      // widen the survivor to swallow it
      const nx0 = Math.min(best.x - best.w/2, s.x - s.w/2), nx1 = Math.max(best.x + best.w/2, s.x + s.w/2);
      const ny0 = Math.min(best.y - best.h/2, s.y - s.h/2), ny1 = Math.max(best.y + best.h/2, s.y + s.h/2);
      const nz0 = Math.min(best.z - best.d/2, s.z - s.d/2), nz1 = Math.max(best.z + best.d/2, s.z + s.d/2);
      best.x = (nx0 + nx1) / 2; best.w = nx1 - nx0;
      best.y = (ny0 + ny1) / 2; best.h = ny1 - ny0;
      best.z = (nz0 + nz1) / 2; best.d = nz1 - nz0;
    }
    return keep;
  }
  return boxes;
}

/**
 * Place a prop's boxes into the world at (wx, wz), turned by `ry`.
 *
 * Rotation is applied to the box CENTRES exactly, and to their extents by
 * swapping width and depth on a quarter turn. Props are placed on quarter
 * turns almost everywhere; for anything in between the extent is taken as
 * the rotated box's own bounding box, which is a little generous and
 * never leaves a gap.
 */
export function placeColliders(list, wx, wz, ry = 0, base = 0, cover = 1) {
  const c = Math.cos(ry), s = Math.sin(ry);
  const quarter = Math.abs(Math.sin(2 * ry)) < 1e-3;      // 0, 90, 180, 270
  const out = [];
  for (const b of list) {
    const rx = b.x * c + b.z * s;
    const rz = -b.x * s + b.z * c;
    let w, d;
    if (quarter) {
      const flip = Math.abs(Math.sin(ry)) > 0.5;
      w = flip ? b.d : b.w; d = flip ? b.w : b.d;
    } else {
      w = Math.abs(b.w * c) + Math.abs(b.d * s);
      d = Math.abs(b.w * s) + Math.abs(b.d * c);
    }
    out.push({ x: wx + rx, y: base + b.y, z: wz + rz, w, h: b.h, d, cover });
  }
  return out;
}

// ---------------------------------------------------------------------
// WHAT IS BETWEEN TWO POINTS
// ---------------------------------------------------------------------
//
// Liam: *"make it so the player can use objects so they don't get hit by
// bullets like a barrier to hide behind"*.
//
// Until this, nothing in the game stopped a bullet except the plan grid -
// the walls, at 1 m resolution, and only via canSee(). Every prop in the
// building was see-through and shoot-through. You could crouch behind a
// concrete barrier and be shot dead through it, which is the opposite of
// what a barrier is for.
//
// This is deliberately a SEGMENT test, not a "am I near cover" score. It
// has to be, because the two things that make cover feel good are both
// three-dimensional:
//
//   * crouching. A 1.4 m partition covers a crouched man and not a
//     standing one, and the only difference between those two cases is
//     the height of one endpoint.
//   * leaning. The player and the enemies both shoot from a point that
//     moves sideways out of cover. Lean out and the segment clears the
//     barrier; duck back and it does not. That already works everywhere
//     else in the game because everything aims at a published point -
//     this makes the cover agree with it.
//
// Returns the blocking box, or null.

/**
 * The first solid on the segment a->b, or null if it is clear.
 *
 * `skipInside` drops any box that already contains the start point, which
 * is how a man shoots from behind his own cover: he is leaning out over
 * the top of a barrier his muzzle is technically inside the bounds of.
 */
export function blocker(solids, ax, ay, az, bx, by, bz, skipInside = true) {
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-4) return null;

  // A cheap reject box round the whole segment. Three storeys of solids
  // is a few thousand entries and a firefight asks this question dozens
  // of times a second; the six comparisons below throw out all but a
  // handful before any real work happens.
  const lox = Math.min(ax, bx), hix = Math.max(ax, bx);
  const loy = Math.min(ay, by), hiy = Math.max(ay, by);
  const loz = Math.min(az, bz), hiz = Math.max(az, bz);

  let best = null, bestT = 1;
  for (let i = 0; i < solids.length; i++) {
    const s = solids[i];
    // FLIMSY THINGS DO NOT STOP ROUNDS. cover 0 is what the prop table
    // uses for a standing lamp or a pot plant - things the AI already
    // knows are not worth hiding behind. A bullet should agree.
    if (s.cover === 0) continue;
    const hw = s.w / 2, hh = s.h / 2, hd = s.d / 2;
    if (s.x - hw > hix || s.x + hw < lox) continue;
    if (s.y - hh > hiy || s.y + hh < loy) continue;
    if (s.z - hd > hiz || s.z + hd < loz) continue;

    if (skipInside
        && Math.abs(ax - s.x) < hw && Math.abs(ay - s.y) < hh && Math.abs(az - s.z) < hd)
      continue;

    // slab method, in segment parameter t
    let t0 = 0, t1 = bestT;
    let ok = true;
    for (let k = 0; k < 3 && ok; k++) {
      const o = k === 0 ? ax : k === 1 ? ay : az;
      const d = k === 0 ? dx : k === 1 ? dy : dz;
      const c = k === 0 ? s.x : k === 1 ? s.y : s.z;
      const h = k === 0 ? hw : k === 1 ? hh : hd;
      if (Math.abs(d) < 1e-9) { if (o < c - h || o > c + h) ok = false; continue; }
      let na = (c - h - o) / d, nb = (c + h - o) / d;
      if (na > nb) { const tmp = na; na = nb; nb = tmp; }
      if (na > t0) t0 = na;
      if (nb < t1) t1 = nb;
      if (t0 > t1) ok = false;
    }
    if (ok && t0 >= 0 && t0 < bestT) { bestT = t0; best = s; }
  }
  if (best) best.hitT = bestT;
  return best;
}

/** Is the line a->b clear of everything solid? */
export function clearLine(solids, ax, ay, az, bx, by, bz, skipInside = true) {
  return !blocker(solids, ax, ay, az, bx, by, bz, skipInside);
}
