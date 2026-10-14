// Static collision: every wall, slab, step, fence, car and dumpster is an axis-aligned box.
// A uniform spatial hash answers "what is near this point", ground height, circle push-out
// and line-of-sight rays. Kinds: SOLID, VAULT (fences, cars, dumpsters: can be vaulted / climbed),
// LOW (a barrier you slide or crawl under: blocks only the upper body).
export const SOLID = 0, VAULT = 1, LOW = 2;

export class Statics {
  constructor(cell = 4) {
    this.cell = cell;
    this.boxes = [];
    this.grid = new Map();
    this.stamp = new Uint32Array(1024);
    this.tick = 1;
  }
  // b: {x0,x1,y0,y1,z0,z1,k,see,tag}
  add(b) {
    if (b.x1 < b.x0) [b.x0, b.x1] = [b.x1, b.x0];
    if (b.z1 < b.z0) [b.z0, b.z1] = [b.z1, b.z0];
    if (b.y1 < b.y0) [b.y0, b.y1] = [b.y1, b.y0];
    b.k = b.k || 0;
    b.id = this.boxes.length;
    this.boxes.push(b);
    const c = this.cell;
    for (let i = Math.floor(b.x0 / c); i <= Math.floor(b.x1 / c); i++)
      for (let j = Math.floor(b.z0 / c); j <= Math.floor(b.z1 / c); j++) {
        const key = (i + 2048) * 4096 + (j + 2048);
        let a = this.grid.get(key);
        if (!a) this.grid.set(key, a = []);
        a.push(b);
      }
    if (this.boxes.length > this.stamp.length) { const s = new Uint32Array(this.stamp.length * 2); s.set(this.stamp); this.stamp = s; }
    return b;
  }
  box(x0, x1, y0, y1, z0, z1, k = SOLID, extra) { return this.add(Object.assign({ x0, x1, y0, y1, z0, z1, k }, extra)); }

  // call fn(b) once for each box overlapping the XZ rectangle
  query(x0, z0, x1, z1, fn) {
    const c = this.cell, t = ++this.tick, st = this.stamp;
    for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++)
      for (let j = Math.floor(z0 / c); j <= Math.floor(z1 / c); j++) {
        const a = this.grid.get((i + 2048) * 4096 + (j + 2048));
        if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const b = a[n];
          if (st[b.id] === t) continue;
          st[b.id] = t;
          if (b.x1 < x0 || b.x0 > x1 || b.z1 < z0 || b.z0 > z1) continue;
          if (fn(b) === false) return;
        }
      }
  }

  // highest walkable top at (x,z) not above yMax (r widens the probe so you do not drop off edges)
  groundAt(x, z, yMax, r = 0) {
    let g = 0;
    this.query(x - r, z - r, x + r, z + r, b => {
      if (b.k === LOW || b.noFloor) return;
      if (b.y1 <= yMax && b.y1 > g) g = b.y1;
    });
    return g;
  }
  // lowest underside above y at (x,z)
  ceilingAt(x, z, y, r = 0) {
    let c = 1e9;
    this.query(x - r, z - r, x + r, z + r, b => { if (b.y0 >= y && b.y0 < c) c = b.y0; });
    return c;
  }

  // Push a vertical cylinder (centre x,z, radius r, spanning yLo..yHi) out of every box it overlaps.
  // Returns the summed push normal (x,z) in out, and the list of boxes touched.
  resolveCircle(p, r, yLo, yHi, out, skip) {
    out.x = 0; out.z = 0; out.hits = 0; out.box = null;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      this.query(p.x - r, p.z - r, p.x + r, p.z + r, b => {
        if (b.y1 <= yLo || b.y0 >= yHi) return;
        if (skip && skip(b)) return;
        const cx = Math.max(b.x0, Math.min(p.x, b.x1)), cz = Math.max(b.z0, Math.min(p.z, b.z1));
        let dx = p.x - cx, dz = p.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) return;
        let nx, nz, pen;
        if (d2 > 1e-10) {
          const d = Math.sqrt(d2); nx = dx / d; nz = dz / d; pen = r - d;
        } else {
          // centre inside the box: leave by the shortest side
          const l = p.x - b.x0, rr = b.x1 - p.x, f = p.z - b.z0, bk = b.z1 - p.z;
          const m = Math.min(l, rr, f, bk);
          if (m === l) { nx = -1; nz = 0; pen = l + r; } else if (m === rr) { nx = 1; nz = 0; pen = rr + r; }
          else if (m === f) { nx = 0; nz = -1; pen = f + r; } else { nx = 0; nz = 1; pen = bk + r; }
        }
        p.x += nx * pen; p.z += nz * pen;
        out.x += nx; out.z += nz; out.hits++; out.box = b;
        moved = true;
      });
      if (!moved) break;
    }
    return out;
  }

  // Is the segment a->b blocked? (sight: see-through boxes such as chain-link are ignored)
  blocked(ax, ay, az, bx, by, bz, sight = true) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dz);
    const steps = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    const t = ++this.tick, st = this.stamp, c = this.cell;
    for (let s = 0; s <= steps; s++) {
      const x = ax + dx * s / steps, z = az + dz * s / steps;
      const i = Math.floor(x / c), j = Math.floor(z / c);
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        const a = this.grid.get((i + di + 2048) * 4096 + (j + dj + 2048));
        if (!a) continue;
        for (let n = 0; n < a.length; n++) {
          const b = a[n];
          if (st[b.id] === t) continue;
          st[b.id] = t;
          if (sight && b.see) continue;
          if (segBox(ax, ay, az, dx, dy, dz, b)) return true;
        }
      }
    }
    return false;
  }
}

// slab test, segment p + t*d for t in [0,1]
function segBox(px, py, pz, dx, dy, dz, b) {
  let t0 = 0, t1 = 1;
  const ax = [[px, dx, b.x0, b.x1], [py, dy, b.y0, b.y1], [pz, dz, b.z0, b.z1]];
  for (const [p, d, lo, hi] of ax) {
    if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) return false; continue; }
    let a = (lo - p) / d, c = (hi - p) / d;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return false;
  }
  return true;
}
