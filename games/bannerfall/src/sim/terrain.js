// BANNERFALL :: sim/terrain.js - the heightfield, its materials and real trench digging.
// Pure JS (no three, no DOM) so the whole battle runs in node.
//
// Samples every RES metres: SIZE 256 m at 0.5 m gives 513 x 513 samples.
// mat: 0 grass, 1 dirt/road, 2 mud (trench), 3 rock, 4 riverbed, 5 crop field
// trench: 0..1 mask, 1 = inside a dug trench

export const MAT = { GRASS: 0, DIRT: 1, MUD: 2, ROCK: 3, BED: 4, FIELD: 5, SAND: 6, SNOW: 7, PAVE: 8, MARSH: 9, ROAD: 10 };

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export class Heightfield {
  constructor(size = 256, res = 0.5, opts = {}) {
    this.size = size; this.res = res;
    this.n = Math.round(size / res) + 1;
    const nn = this.n * this.n;
    this.h = new Float32Array(nn);
    this.mat = new Uint8Array(nn);
    // a lite field (the 2 m coarse layer of a WorldTerrain) never holds trenches
    this.trench = opts.lite ? null : new Float32Array(nn);
    this.parapet = opts.lite ? null : new Float32Array(nn);   // raised bank mask (render dressing + cover)
    this.waterLevel = 0;
    this.version = 0;
    this.dirty = [];                       // [{x0,z0,x1,z1}] in metres, drained by render
    this.trenchLines = [];                 // [{pts:[[x,z]...], side:[...], metres}]
  }
  idx(i, j) { return j * this.n + i; }
  clampI(i) { return i < 0 ? 0 : i >= this.n ? this.n - 1 : i; }

  height(x, z) {
    const fx = x / this.res, fz = z / this.res;
    let i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const n = this.n;
    if (i < 0) i = 0; if (j < 0) j = 0; if (i > n - 2) i = n - 2; if (j > n - 2) j = n - 2;
    const k = j * n + i, h = this.h;
    const a = h[k], b = h[k + 1], c = h[k + n], d = h[k + n + 1];
    return (a + (b - a) * tx) * (1 - tz) + (c + (d - c) * tx) * tz;
  }
  // ground or water surface, whichever is higher (what a walker stands on visually)
  surface(x, z) { const g = this.height(x, z); return g < this.waterLevel - 0.25 ? this.waterLevel - 0.25 : g; }
  waterDepth(x, z) { return Math.max(0, this.waterLevel - this.height(x, z)); }
  sample(arr, x, z) {
    const i = this.clampI(Math.round(x / this.res)), j = this.clampI(Math.round(z / this.res));
    return arr[j * this.n + i];
  }
  matAt(x, z) { return this.sample(this.mat, x, z); }
  isTrench(x, z) { return this.trench ? this.sample(this.trench, x, z) > 0.5 : false; }
  trenchAmt(x, z) { return this.trench ? this.sample(this.trench, x, z) : 0; }
  parapetAmt(x, z) { return this.parapet ? this.sample(this.parapet, x, z) : 0; }
  slope(x, z) {
    const e = 1;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }
  normal(x, z) {
    const e = this.res;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }
  inside(x, z, m = 0) { return x >= m && z >= m && x <= this.size - m && z <= this.size - m; }

  // terrain line of sight between two 3D points (eye heights included)
  raycast(a, b) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(len / 1.0));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t, z = a[2] + dz * t, y = a[1] + (b[1] - a[1]) * t;
      if (this.height(x, z) > y) return false;
    }
    return true;
  }

  // smooth and resample a freehand polyline (Chaikin x2, then every `step` metres)
  static prepLine(points, step = 1) {
    let p = points.map((q) => [q[0], q[1]]);
    for (let pass = 0; pass < 2 && p.length > 2; pass++) {
      const out = [p[0]];
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1];
        out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        out.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      out.push(p[p.length - 1]);
      p = out;
    }
    const res = [p[0]];
    let carry = 0;
    for (let i = 0; i < p.length - 1; i++) {
      const a = p[i], b = p[i + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = step - carry;
      while (d <= L) { const t = d / L; res.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); d += step; }
      carry = L - (d - step);
    }
    const last = p[p.length - 1], lr = res[res.length - 1];
    if (Math.hypot(last[0] - lr[0], last[1] - lr[1]) > step * 0.3) res.push(last);
    return res;
  }
  static lineLength(pts) {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  }

  // Which samples of a prepared line can be dug: not rock, not water.
  diggable(x, z) {
    if (!this.inside(x, z, 3)) return false;
    if (this.matAt(x, z) === MAT.ROCK) return false;
    if (this.height(x, z) < this.waterLevel + 0.3) return false;
    return true;
  }

  // Dig a trench along a prepared polyline. enemyDir: [dx,dz] unit vector toward the enemy;
  // the parapet bank rises on that side. Returns {metres, bbox}.
  dig(pts, { depth = 1.6, width = 2.5, parapet = 0.6, enemyDir = [0, 1], team = 0, moat = false } = {}) {
    if (pts.length < 2) return { metres: 0 };
    const fw = width * 0.28;                     // flat floor half-width
    const tw = fw + depth / Math.tan(55 * Math.PI / 180) * 0.9 + 0.15; // top half-width
    const pw = 2.4;                              // parapet run beyond the lip
    const reach = tw + pw;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    x0 -= reach + 1; z0 -= reach + 1; x1 += reach + 1; z1 += reach + 1;
    const i0 = this.clampI(Math.floor(x0 / this.res)), i1 = this.clampI(Math.ceil(x1 / this.res));
    const j0 = this.clampI(Math.floor(z0 / this.res)), j1 = this.clampI(Math.ceil(z1 / this.res));
    const segs = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k], b = pts[k + 1];
      const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz || 1e-6;
      // the enemy side of this segment
      let nx = -dz, nz = dx; const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
      if (nx * enemyDir[0] + nz * enemyDir[1] < 0) { nx = -nx; nz = -nz; }
      segs.push({ a, dx, dz, L2, nx, nz });
    }
    const end0 = pts[0], end1 = pts[pts.length - 1];
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const x = i * this.res, z = j * this.res;
        let best = Infinity, side = 0, endT = 1;
        for (const s of segs) {
          let t = ((x - s.a[0]) * s.dx + (z - s.a[1]) * s.dz) / s.L2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const px = s.a[0] + s.dx * t, pz = s.a[1] + s.dz * t;
          const d = Math.hypot(x - px, z - pz);
          if (d < best) { best = d; side = (x - px) * s.nx + (z - pz) * s.nz; }
        }
        if (best > reach) continue;
        // round the ends off a little so trench tips are not square
        const de = Math.min(Math.hypot(x - end0[0], z - end0[1]), Math.hypot(x - end1[0], z - end1[1]));
        endT = smooth(de / 1.2 + 0.25);
        const k = this.idx(i, j);
        if (!this.diggable(x, z) && this.mat[k] === MAT.ROCK) continue;
        if (this.h[k] < this.waterLevel + 0.2) continue;
        if (best < tw) {
          const wall = best <= fw ? 1 : 1 - smooth((best - fw) / (tw - fw));
          const lip = this.base ? this.base[k] : this.h[k];
          const target = lip - depth * wall * endT;
          if (target < this.h[k]) this.h[k] = target;
          if (wall > 0.25) { this.mat[k] = MAT.MUD; }
          // a moat's floor is marked 2: deep enough to swim (sim/nav.js, sim/squads.js)
          this.trench[k] = Math.max(this.trench[k], best <= tw - 0.35 ? (moat && wall > 0.6 ? 2 : 1) : 0.4);
        } else if (side > 0 && this.trench[k] < 0.3) {
          // dirt parapet on the enemy side
          const u = (best - tw) / pw;
          const bump = Math.sin(Math.min(1, u) * Math.PI) * parapet * endT;
          const lip = this.base ? this.base[k] : this.h[k];
          if (lip + bump > this.h[k]) this.h[k] = lip + bump;
          this.parapet[k] = Math.max(this.parapet[k], bump / parapet);
          if ((this.mat[k] === MAT.GRASS || this.mat[k] === MAT.FIELD) && bump > parapet * 0.35) this.mat[k] = MAT.DIRT;
        } else if (side <= 0 && best < tw + 0.7 && (this.mat[k] === MAT.GRASS || this.mat[k] === MAT.FIELD)) {
          this.mat[k] = MAT.DIRT;  // trampled rear lip
        }
      }
    }
    const metres = Heightfield.lineLength(pts);
    this.trenchLines.push({ pts: pts.map((p) => [p[0], p[1]]), enemyDir, metres, depth, team });
    this.version++;
    const box = { x0, z0, x1, z1 };
    this.dirty.push(box);
    return { metres, bbox: box };
  }

  // snapshot / restore for prepare-phase undo
  snapshot() { return { h: this.h.slice(), mat: this.mat.slice(), trench: this.trench.slice(), parapet: this.parapet.slice(), lines: this.trenchLines.length }; }
  restore(s) {
    this.h.set(s.h); this.mat.set(s.mat); this.trench.set(s.trench); this.parapet.set(s.parapet);
    this.trenchLines.length = s.lines;
    this.version++;
    this.dirty.push({ x0: 0, z0: 0, x1: this.size, z1: this.size });
  }
}

// ---------------------------------------------------------------------------------------------
// WorldTerrain (DESIGN.md 3.2): a huge map = a coarse 2 m field plus 64 m detail tiles at 0.5 m.
// A detail tile is made the first time something digs there (bilinear from the coarse field), so
// a trench keeps the full v1 cross-section, cover and look. Same query API as Heightfield, so the
// sim does not care which one it is talking to.
export class WorldTerrain {
  constructor(size, cres = 2) {
    this.isWorld = true;
    this.size = size; this.cres = cres; this.res = 0.5;
    this.coarse = new Heightfield(size, cres, { lite: true });
    this.cn = this.coarse.n;
    this.forest = new Uint8Array(this.cn * this.cn);     // 0..255 forest density
    this.waterLevel = 0;
    this.TS = 64; this.NT = Math.ceil(size / 64);
    this.tiles = new Map();                               // key -> Heightfield (with ox, oz)
    this.tilesV = 0;                                      // bumps when tiles are made or dropped
    this.version = 0;
    this.dirty = [];
    this.trenchLines = [];
  }
  get base() { return this.coarse.base; }
  tileAtXZ(x, z) {
    const i = Math.floor(x / 64), j = Math.floor(z / 64);
    if (i < 0 || j < 0 || i >= this.NT || j >= this.NT) return null;
    return this.tiles.get(j * this.NT + i) || null;
  }
  makeTile(i, j) {
    const key = j * this.NT + i;
    let t = this.tiles.get(key);
    if (t) return t;
    t = new Heightfield(64, 0.5);
    t.ox = i * 64; t.oz = j * 64; t.key = key; t.i = i; t.j = j;
    t.waterLevel = this.waterLevel;
    const n = t.n, C = this.coarse;
    for (let jj = 0; jj < n; jj++) for (let ii = 0; ii < n; ii++) {
      const x = t.ox + ii * 0.5, z = t.oz + jj * 0.5, k = jj * n + ii;
      t.h[k] = C.height(Math.min(this.size, x), Math.min(this.size, z));
      t.mat[k] = C.matAt(Math.min(this.size, x), Math.min(this.size, z));
    }
    t.base = t.h.slice();
    this.tiles.set(key, t);
    this.tilesV++;
    return t;
  }
  height(x, z) {
    const t = this.tileAtXZ(x, z);
    return t ? t.height(x - t.ox, z - t.oz) : this.coarse.height(x, z);
  }
  surface(x, z) { const g = this.height(x, z); return g < this.waterLevel - 0.25 ? this.waterLevel - 0.25 : g; }
  waterDepth(x, z) { return Math.max(0, this.waterLevel - this.height(x, z)); }
  matAt(x, z) {
    const t = this.tileAtXZ(x, z);
    return t ? t.matAt(x - t.ox, z - t.oz) : this.coarse.matAt(x, z);
  }
  isTrench(x, z) { return this.trenchAmt(x, z) > 0.5; }
  trenchAmt(x, z) { const t = this.tileAtXZ(x, z); return t ? t.trenchAmt(x - t.ox, z - t.oz) : 0; }
  parapetAmt(x, z) { const t = this.tileAtXZ(x, z); return t ? t.parapetAmt(x - t.ox, z - t.oz) : 0; }
  forestAt(x, z) {
    const c = this.cres, n = this.cn;
    let i = Math.round(x / c), j = Math.round(z / c);
    if (i < 0) i = 0; if (j < 0) j = 0; if (i >= n) i = n - 1; if (j >= n) j = n - 1;
    return this.forest[j * n + i] / 255;
  }
  slope(x, z) {
    const e = 1;
    const dx = this.height(x + e, z) - this.height(x - e, z);
    const dz = this.height(x, z + e) - this.height(x, z - e);
    return Math.sqrt(dx * dx + dz * dz) / (2 * e);
  }
  normal(x, z) {
    const e = 0.5;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const l = Math.hypot(dx, 1, dz);
    return [-dx / l, 1 / l, -dz / l];
  }
  inside(x, z, m = 0) { return x >= m && z >= m && x <= this.size - m && z <= this.size - m; }
  raycast(a, b) {
    const dx = b[0] - a[0], dz = b[2] - a[2];
    const len = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(len / 1.5));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a[0] + dx * t, z = a[2] + dz * t, y = a[1] + (b[1] - a[1]) * t;
      if (this.height(x, z) > y) return false;
    }
    return true;
  }
  diggable(x, z) {
    if (!this.inside(x, z, 3)) return false;
    const m = this.matAt(x, z);
    if (m === MAT.ROCK || m === MAT.PAVE) return false;
    if (this.height(x, z) < this.waterLevel + 0.3) return false;
    return true;
  }
  // tiles touched by a box in metres
  tileRange(x0, z0, x1, z1) {
    const i0 = Math.max(0, Math.floor(x0 / 64)), i1 = Math.min(this.NT - 1, Math.floor(x1 / 64));
    const j0 = Math.max(0, Math.floor(z0 / 64)), j1 = Math.min(this.NT - 1, Math.floor(z1 / 64));
    return { i0, i1, j0, j1 };
  }
  dig(pts, opts = {}) {
    if (pts.length < 2) return { metres: 0 };
    const reach = Math.max(6, (opts.width || 2.5) * 0.28 + (opts.depth || 1.6) * 0.64 + 3.8);
    // a moat that reaches a river or a pool fills with water (decided once, before any digging)
    if (opts.moat && opts.wet === undefined) {
      let wet = false;
      for (const p of [pts[0], pts[pts.length - 1], pts[Math.floor(pts.length / 2)]]) for (let a = 0; a < 8 && !wet; a++) for (const r of [6, 14, 24]) { if (this.coarse.height(Math.max(0, Math.min(this.size, p[0] + Math.cos(a * 0.785) * r)), Math.max(0, Math.min(this.size, p[1] + Math.sin(a * 0.785) * r))) < this.waterLevel - 0.15) { wet = true; break; } }
      opts = { ...opts, wet };
    }
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (const p of pts) { x0 = Math.min(x0, p[0]); z0 = Math.min(z0, p[1]); x1 = Math.max(x1, p[0]); z1 = Math.max(z1, p[1]); }
    x0 -= reach; z0 -= reach; x1 += reach; z1 += reach;
    const R = this.tileRange(x0, z0, x1, z1);
    for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) {
      const t = this.makeTile(i, j);
      const local = pts.map((p) => [p[0] - t.ox, p[1] - t.oz]);
      t.dig(local, opts);
      t.trenchLines.length = 0; t.dirty.length = 0;
      t.hasTrench = true; t.touchT = (this.touch = (this.touch || 0) + 1);
    }
    const metres = Heightfield.lineLength(pts);
    this.trenchLines.push({ pts: pts.map((p) => [p[0], p[1]]), enemyDir: opts.enemyDir || [0, 1], metres, depth: opts.depth || 1.6, team: opts.team || 0, opts: { ...opts } });
    this.version++;
    const box = { x0, z0, x1, z1 };
    this.dirty.push(box);
    return { metres, bbox: box };
  }
  // undo support for FOUNDING: only the tiles a dig can touch are saved
  snapshot(box) {
    const keys = [];
    if (box) { const R = this.tileRange(box.x0 - 8, box.z0 - 8, box.x1 + 8, box.z1 + 8); for (let j = R.j0; j <= R.j1; j++) for (let i = R.i0; i <= R.i1; i++) keys.push(j * this.NT + i); }
    else keys.push(...this.tiles.keys());
    return { tiles: keys.map((k) => [k, this.tiles.has(k) ? this.tiles.get(k).snapshot() : null]), lines: this.trenchLines.length };
  }
  restore(s) {
    for (const [k, snap] of s.tiles) {
      const t = this.tiles.get(k);
      if (!snap) { if (t) { this.tiles.delete(k); this.tilesV++; } }
      else if (t) { t.restore(snap); t.dirty.length = 0; }
      const i = k % this.NT, j = Math.floor(k / this.NT);
      this.dirty.push({ x0: i * 64, z0: j * 64, x1: i * 64 + 64, z1: j * 64 + 64 });
    }
    this.trenchLines.length = s.lines;
    this.version++;
  }
}
