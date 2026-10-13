// World geometry for physics, bullets and sight. Everything solid is an axis-aligned box;
// the ground is a height function. A uniform 8 m XZ grid accelerates every query.
import { clamp } from './util.js';

export const STEP = 0.6; // max step-up height (physics and nav agree on this)
const CELL = 8;

export class World {
  constructor(def) {
    this.def = def;
    this.w = def.w; this.d = def.d;
    this.minX = -def.w / 2; this.minZ = -def.d / 2;
    this.gw = Math.ceil(def.w / CELL) + 2; this.gd = Math.ceil(def.d / CELL) + 2;
    this.grid = new Array(this.gw * this.gd);
    for (let i = 0; i < this.grid.length; i++) this.grid[i] = [];
    this.boxes = [];
    this.stamp = 1;
    this.smokes = [];
    this.waterY = def.waterY ?? -99;
    this.gMax = def.gMax ?? 1;
    for (const b of def.boxes) this.add(b);
  }
  add(b) {
    b.id = this.boxes.length;
    b.mark = 0;
    if (b.solid === undefined) b.solid = true;
    if (b.sight === undefined) b.sight = true;
    if (b.walk === undefined) b.walk = b.solid;
    this.boxes.push(b);
    const [cx0, cz0] = this.cellOf(b.x0, b.z0), [cx1, cz1] = this.cellOf(b.x1, b.z1);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) this.grid[cz * this.gw + cx].push(b);
  }
  cellOf(x, z) {
    return [clamp(Math.floor((x - this.minX) / CELL) + 1, 0, this.gw - 1), clamp(Math.floor((z - this.minZ) / CELL) + 1, 0, this.gd - 1)];
  }
  groundY(x, z) { return this.def.ground(x, z); }
  inWater(x, z) { return this.groundY(x, z) < this.waterY - 0.25; }
  // boxes overlapping an XZ rectangle
  query(x0, z0, x1, z1, out = []) {
    out.length = 0;
    const s = ++this.stamp;
    const [cx0, cz0] = this.cellOf(x0, z0), [cx1, cz1] = this.cellOf(x1, z1);
    for (let cz = cz0; cz <= cz1; cz++) for (let cx = cx0; cx <= cx1; cx++) {
      const cell = this.grid[cz * this.gw + cx];
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.mark === s) continue;
        b.mark = s;
        if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
        out.push(b);
      }
    }
    return out;
  }
  // highest walkable surface under a small circle that is at most STEP above the feet
  floorAt(x, z, r, feet, out) {
    let h = this.groundY(x, z);
    const list = this.query(x - r, z - r, x + r, z + r, this._q || (this._q = []));
    for (const b of list) {
      if (!b.walk) continue;
      if (b.y1 > feet + STEP || b.y1 <= h) continue;
      if (x + r <= b.x0 || x - r >= b.x1 || z + r <= b.z0 || z - r >= b.z1) continue;
      h = b.y1;
      if (out) out.box = b;
    }
    return h;
  }
  // push a vertical cylinder (feet at p.y) out of solid boxes; returns true if it touched something
  collide(p, r, height) {
    let hit = false;
    const list = this.query(p.x - r - 0.1, p.z - r - 0.1, p.x + r + 0.1, p.z + r + 0.1, this._q2 || (this._q2 = []));
    for (let pass = 0; pass < 2; pass++) {
      for (const b of list) {
        if (!b.solid) continue;
        if (b.y1 <= p.y + STEP || b.y0 >= p.y + height) continue;
        const cx = clamp(p.x, b.x0, b.x1), cz = clamp(p.z, b.z0, b.z1);
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2), k = (r - d) / d;
          p.x += dx * k; p.z += dz * k;
        } else {
          // centre inside the box: shortest way out
          const l = p.x - b.x0, rr = b.x1 - p.x, n = p.z - b.z0, f = b.z1 - p.z;
          const m = Math.min(l, rr, n, f);
          if (m === l) p.x = b.x0 - r; else if (m === rr) p.x = b.x1 + r; else if (m === n) p.z = b.z0 - r; else p.z = b.z1 + r;
        }
      }
    }
    // map bounds
    const mx = this.w / 2 - 1.5, mz = this.d / 2 - 1.5;
    if (p.x < -mx) { p.x = -mx; hit = true; } if (p.x > mx) { p.x = mx; hit = true; }
    if (p.z < -mz) { p.z = -mz; hit = true; } if (p.z > mz) { p.z = mz; hit = true; }
    return hit;
  }
  // is a standing cylinder at p free of solids (used for spawn checks)
  free(x, y, z, r, h) {
    const list = this.query(x - r, z - r, x + r, z + r, this._q3 || (this._q3 = []));
    for (const b of list) {
      if (!b.solid) continue;
      if (b.y1 <= y + STEP || b.y0 >= y + h) continue;
      const cx = clamp(x, b.x0, b.x1), cz = clamp(z, b.z0, b.z1);
      if ((x - cx) ** 2 + (z - cz) ** 2 < r * r) return false;
    }
    return true;
  }
  // ray vs boxes (+terrain, +smoke when sight). Direction must be normalised.
  // mode: 'bullet' (solid boxes), 'sight' (solid + soft + smoke)
  raycast(ox, oy, oz, dx, dy, dz, maxT, sight = false, res = {}) {
    let best = maxT, bestBox = null, bnx = 0, bny = 0, bnz = 0;
    const s = ++this.stamp;
    // 2D DDA over grid
    let [cx, cz] = this.cellOf(ox, oz);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const cellX0 = this.minX + (cx - 1) * CELL, cellZ0 = this.minZ + (cz - 1) * CELL;
    const invDx = Math.abs(dx) > 1e-9 ? 1 / dx : 1e9, invDz = Math.abs(dz) > 1e-9 ? 1 / dz : 1e9;
    let tMaxX = Math.abs(dx) > 1e-9 ? ((dx > 0 ? cellX0 + CELL : cellX0) - ox) * invDx : 1e9;
    let tMaxZ = Math.abs(dz) > 1e-9 ? ((dz > 0 ? cellZ0 + CELL : cellZ0) - oz) * invDz : 1e9;
    const tDX = Math.abs(CELL * invDx), tDZ = Math.abs(CELL * invDz);
    let tEnter = 0;
    for (let iter = 0; iter < 200; iter++) {
      if (cx < 0 || cz < 0 || cx >= this.gw || cz >= this.gd) break;
      if (tEnter > best) break;
      const cell = this.grid[cz * this.gw + cx];
      for (let i = 0; i < cell.length; i++) {
        const b = cell[i];
        if (b.mark === s) continue;
        b.mark = s;
        if (!(b.solid || (sight && b.sight))) continue;
        if (!sight && !b.solid) continue;
        if (sight && !b.sight) continue;
        // slab test
        let t0 = 0, t1 = best, nx = 0, ny = 0, nz = 0;
        let a, c, tt;
        // x
        if (Math.abs(dx) < 1e-9) { if (ox < b.x0 || ox > b.x1) continue; }
        else {
          a = (b.x0 - ox) * invDx; c = (b.x1 - ox) * invDx;
          if (a > c) { tt = a; a = c; c = tt; }
          if (a > t0) { t0 = a; nx = -Math.sign(dx); ny = 0; nz = 0; }
          if (c < t1) t1 = c;
          if (t0 > t1) continue;
        }
        if (Math.abs(dy) < 1e-9) { if (oy < b.y0 || oy > b.y1) continue; }
        else {
          const iy = 1 / dy;
          a = (b.y0 - oy) * iy; c = (b.y1 - oy) * iy;
          if (a > c) { tt = a; a = c; c = tt; }
          if (a > t0) { t0 = a; nx = 0; ny = -Math.sign(dy); nz = 0; }
          if (c < t1) t1 = c;
          if (t0 > t1) continue;
        }
        if (Math.abs(dz) < 1e-9) { if (oz < b.z0 || oz > b.z1) continue; }
        else {
          a = (b.z0 - oz) * invDz; c = (b.z1 - oz) * invDz;
          if (a > c) { tt = a; a = c; c = tt; }
          if (a > t0) { t0 = a; nx = 0; ny = 0; nz = -Math.sign(dz); }
          if (c < t1) t1 = c;
          if (t0 > t1) continue;
        }
        if (t0 < best) {
          best = t0; bestBox = b; bnx = nx; bny = ny; bnz = nz;
          if (t0 === 0) { bnx = -dx; bny = -dy; bnz = -dz; }
        }
      }
      if (tMaxX < tMaxZ) { tEnter = tMaxX; tMaxX += tDX; cx += stepX; }
      else { tEnter = tMaxZ; tMaxZ += tDZ; cz += stepZ; }
    }
    // terrain
    const endY = oy + dy * best;
    if (Math.min(oy, endY) < this.gMax + 0.05) {
      const stepL = 1.0;
      let prevT = 0;
      for (let t = 0.3; t <= best + 1e-6; t += stepL) {
        const tt = Math.min(t, best);
        const x = ox + dx * tt, y = oy + dy * tt, z = oz + dz * tt;
        if (y < this.groundY(x, z)) {
          let lo = prevT, hi = tt;
          for (let k = 0; k < 6; k++) {
            const m = (lo + hi) / 2;
            if (oy + dy * m < this.groundY(ox + dx * m, oz + dz * m)) hi = m; else lo = m;
          }
          best = hi; bestBox = null;
          const hx = ox + dx * hi, hz = oz + dz * hi;
          const gx = this.groundY(hx + 0.3, hz) - this.groundY(hx - 0.3, hz), gz = this.groundY(hx, hz + 0.3) - this.groundY(hx, hz - 0.3);
          const L = Math.hypot(gx, 0.6, gz);
          bnx = -gx / L; bny = 0.6 / L; bnz = -gz / L;
          res.terrain = true;
          break;
        }
        prevT = tt;
        if (tt >= best) break;
      }
    }
    // smoke
    if (sight && this.smokes.length) {
      for (const sm of this.smokes) {
        const t = raySphere(ox, oy, oz, dx, dy, dz, sm.x, sm.y, sm.z, sm.r * sm.k);
        if (t !== null && t < best) { best = t; bestBox = null; res.smoke = true; bnx = -dx; bny = -dy; bnz = -dz; }
      }
    }
    if (best >= maxT) return null;
    res.t = best; res.box = bestBox;
    res.x = ox + dx * best; res.y = oy + dy * best; res.z = oz + dz * best;
    res.nx = bnx; res.ny = bny; res.nz = bnz;
    if (!res.terrain) res.terrain = false;
    if (!res.smoke) res.smoke = false;
    return res;
  }
  // true when the straight line a->b is unobstructed
  clear(ax, ay, az, bx, by, bz, sight = true) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const L = Math.hypot(dx, dy, dz);
    if (L < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / L, dy / L, dz / L, L - 0.05, sight, this._rc || (this._rc = {}));
  }
}

export function raySphere(ox, oy, oz, dx, dy, dz, cx, cy, cz, r) {
  const lx = ox - cx, ly = oy - cy, lz = oz - cz;
  const b = lx * dx + ly * dy + lz * dz;
  const c = lx * lx + ly * ly + lz * lz - r * r;
  if (c < 0) return 0;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
