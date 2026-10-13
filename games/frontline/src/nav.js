// Navigation grid (1 m cells): walkable surface height per cell, A* with optional
// danger costs, path smoothing, and a static set of cover points (cells next to
// something solid, tagged with which directions they are covered from and how high).
import { STEP } from './world.js';
import { clamp } from './util.js';

const MAXDH = 0.65;
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
export const COVER_DIRS = [];
for (let i = 0; i < 16; i++) { const a = (i / 16) * Math.PI * 2; COVER_DIRS.push([Math.cos(a), Math.sin(a)]); }

export class Nav {
  constructor(world) {
    this.world = world;
    this.nx = Math.round(world.w); this.nz = Math.round(world.d);
    this.ox = -world.w / 2; this.oz = -world.d / 2;
    const N = this.nx * this.nz;
    this.N = N;
    this.h = new Float32Array(N);
    this.walk = new Uint8Array(N);
    this.cost = new Float32Array(N).fill(1);
    this.water = new Uint8Array(N);
    this.g = new Float32Array(N);
    this.par = new Int32Array(N);
    this.mark = new Uint32Array(N);
    this.closed = new Uint32Array(N);
    this.stamp = 0;
    this.heap = new Int32Array(N + 8);
    this.f = new Float32Array(N);
    this.dyn = new Float32Array(N); // dynamic extra cost (temporary danger)
    this.reach = new Uint8Array(N);
    this.build();
    this.label();
    this.buildCover();
  }
  idx(x, z) {
    const ix = Math.floor(x - this.ox), iz = Math.floor(z - this.oz);
    if (ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz) return -1;
    return iz * this.nx + ix;
  }
  cx(i) { return this.ox + (i % this.nx) + 0.5; }
  cz(i) { return this.oz + Math.floor(i / this.nx) + 0.5; }
  build() {
    const w = this.world, q = [];
    for (let iz = 0; iz < this.nz; iz++) for (let ix = 0; ix < this.nx; ix++) {
      const i = iz * this.nx + ix;
      const x = this.ox + ix + 0.5, z = this.oz + iz + 0.5;
      let h = w.groundY(x, z);
      const list = w.query(x - 0.45, z - 0.45, x + 0.45, z + 0.45, q).slice().sort((a, b) => a.y0 - b.y0);
      for (let pass = 0; pass < 4; pass++) {
        let ch = false;
        for (const b of list) {
          if (!b.walk) continue;
          if (x < b.x0 || x > b.x1 || z < b.z0 || z > b.z1) continue;
          if (b.y0 <= h + STEP && b.y1 > h + 0.001) { h = b.y1; ch = true; }
        }
        if (!ch) break;
      }
      this.h[i] = h;
      let ok = true;
      const e = Math.min(w.w / 2 - Math.abs(x), w.d / 2 - Math.abs(z));
      if (e < 3) ok = false;
      if (ok) for (const b of list) {
        if (!b.solid) continue;
        if (b.y1 <= h + STEP || b.y0 >= h + 1.75) continue;
        if (x + 0.42 <= b.x0 || x - 0.42 >= b.x1 || z + 0.42 <= b.z0 || z - 0.42 >= b.z1) continue;
        ok = false; break;
      }
      this.walk[i] = ok ? 1 : 0;
      if (w.waterY > -50 && h < w.waterY - 0.3) { this.water[i] = 1; this.cost[i] = 3.2; }
    }
    // soften: cells hugging walls cost a little more so paths do not scrape corners
    for (let i = 0; i < this.N; i++) {
      if (!this.walk[i]) continue;
      const ix = i % this.nx, iz = (i / this.nx) | 0;
      let near = 0;
      for (const [dx, dz] of DIRS) { const j = this.at(ix + dx, iz + dz); if (j < 0 || !this.walk[j]) near++; }
      if (near) this.cost[i] += 0.35;
    }
  }
  // flood fill the walk graph; only the biggest connected region counts as reachable
  label() {
    const comp = new Int32Array(this.N).fill(-1), sizes = [], st = new Int32Array(this.N);
    for (let s0 = 0; s0 < this.N; s0++) {
      if (!this.walk[s0] || comp[s0] >= 0) continue;
      const id = sizes.length; let n = 0, sp = 0; st[sp++] = s0; comp[s0] = id;
      while (sp) {
        const i = st[--sp]; n++;
        const ix = i % this.nx, iz = (i / this.nx) | 0;
        for (let k = 0; k < 4; k++) { const [dx, dz] = DIRS[k]; const j = this.at(ix + dx, iz + dz); if (j < 0 || !this.walk[j] || comp[j] >= 0 || Math.abs(this.h[j] - this.h[i]) > MAXDH) continue; comp[j] = id; st[sp++] = j; }
      }
      sizes.push(n);
    }
    let big = 0; for (let k = 1; k < sizes.length; k++) if (sizes[k] > sizes[big]) big = k;
    for (let i = 0; i < this.N; i++) this.reach[i] = comp[i] === big ? 1 : 0;
  }
  at(ix, iz) { return ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz ? -1 : iz * this.nx + ix; }
  heightAt(x, z) { const i = this.idx(x, z); return i < 0 ? 0 : this.h[i]; }
  isWalk(x, z) { const i = this.idx(x, z); return i >= 0 && this.walk[i] === 1; }
  nearestWalkable(x, z, maxR = 8) {
    let i = this.idx(x, z);
    if (i >= 0 && this.reach[i]) return i;
    const ix = Math.floor(x - this.ox), iz = Math.floor(z - this.oz);
    for (let r = 1; r <= maxR; r++) {
      let best = -1, bd = 1e9;
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dz) !== r) continue;
        const j = this.at(ix + dx, iz + dz);
        if (j >= 0 && this.reach[j]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = j; } }
      }
      if (best >= 0) return best;
    }
    return -1;
  }
  // A* from world pos to world pos. opts.danger(x,z) -> extra cost per cell (flanking routes)
  findPath(sx, sz, tx, tz, opts = {}) {
    const s = this.nearestWalkable(sx, sz), t = this.nearestWalkable(tx, tz);
    if (s < 0 || t < 0) return null;
    if (s === t) return [{ x: tx, z: tz, y: this.h[t] }];
    const st = ++this.stamp;
    const nx = this.nx;
    const tix = t % nx, tiz = (t / nx) | 0;
    const H = (i) => { const dx = Math.abs((i % nx) - tix), dz = Math.abs(((i / nx) | 0) - tiz); return (dx + dz) + (1.4142 - 2) * Math.min(dx, dz); };
    const heap = this.heap; let hn = 0;
    const f = this.f, g = this.g;
    const push = (i) => { let k = hn++; heap[k] = i; while (k > 0) { const p = (k - 1) >> 1; if (f[heap[p]] <= f[i]) break; heap[k] = heap[p]; k = p; } heap[k] = i; };
    const pop = () => { const top = heap[0]; const last = heap[--hn]; let k = 0; while (true) { let c = 2 * k + 1; if (c >= hn) break; if (c + 1 < hn && f[heap[c + 1]] < f[heap[c]]) c++; if (f[heap[c]] >= f[last]) break; heap[k] = heap[c]; k = c; } heap[k] = last; return top; };
    g[s] = 0; f[s] = H(s); this.mark[s] = st; this.par[s] = -1; push(s);
    const danger = opts.danger;
    const maxIter = opts.maxIter || 30000;
    let found = false, iter = 0, bestI = s, bestH = H(s);
    while (hn > 0 && iter++ < maxIter) {
      const i = pop();
      if (this.closed[i] === st) continue;
      this.closed[i] = st;
      if (i === t) { found = true; break; }
      const hi = H(i); if (hi < bestH) { bestH = hi; bestI = i; }
      const ix = i % nx, iz = (i / nx) | 0;
      for (let k = 0; k < 8; k++) {
        const [dx, dz] = DIRS[k];
        const j = this.at(ix + dx, iz + dz);
        if (j < 0 || !this.walk[j] || this.closed[j] === st) continue;
        if (Math.abs(this.h[j] - this.h[i]) > MAXDH) continue;
        if (k >= 4) { // no corner cutting
          const a = this.at(ix + dx, iz), b = this.at(ix, iz + dz);
          if (!this.walk[a] || !this.walk[b] || Math.abs(this.h[a] - this.h[i]) > MAXDH || Math.abs(this.h[b] - this.h[i]) > MAXDH) continue;
        }
        let c = (k >= 4 ? 1.4142 : 1) * (this.cost[j] + this.dyn[j]);
        if (danger) c += danger(this.ox + (j % nx) + 0.5, this.oz + ((j / nx) | 0) + 0.5);
        const ng = g[i] + c;
        if (this.mark[j] !== st || ng < g[j]) {
          this.mark[j] = st; g[j] = ng; f[j] = ng + H(j); this.par[j] = i; push(j);
        }
      }
    }
    let end = found ? t : bestI;
    const cells = [];
    for (let i = end; i >= 0; i = this.par[i]) { cells.push(i); if (cells.length > 5000) break; }
    cells.reverse();
    // string-pull smoothing
    const pts = [];
    let a = 0;
    pts.push(cells[0]);
    while (a < cells.length - 1) {
      let b = cells.length - 1;
      while (b > a + 1 && !this.lineWalk(cells[a], cells[b])) b--;
      pts.push(cells[b]); a = b;
    }
    const out = pts.slice(1).map((i) => ({ x: this.cx(i), z: this.cz(i), y: this.h[i] }));
    if (found && out.length) { out[out.length - 1].x = tx; out[out.length - 1].z = tz; }
    if (!out.length) out.push({ x: this.cx(end), z: this.cz(end), y: this.h[end] });
    out.partial = !found;
    return out;
  }
  lineWalk(ia, ib) {
    const ax = this.cx(ia), az = this.cz(ia), bx = this.cx(ib), bz = this.cz(ib);
    const L = Math.hypot(bx - ax, bz - az);
    const n = Math.ceil(L / 0.35);
    let prevH = this.h[ia];
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      // check the cell and a radius around it
      for (const [ox, oz] of [[0, 0], [0.4, 0], [-0.4, 0], [0, 0.4], [0, -0.4]]) {
        const j = this.idx(x + ox, z + oz);
        if (j < 0 || !this.walk[j]) return false;
        if (this.water[j] && !this.water[ia]) return false;
      }
      const j = this.idx(x, z);
      if (Math.abs(this.h[j] - prevH) > MAXDH) return false;
      if (this.dyn[j] > 0) return false;
      prevH = this.h[j];
    }
    return true;
  }
  buildCover() {
    const w = this.world, q = [];
    this.cover = [];
    this.coverGrid = new Map();
    for (let i = 0; i < this.N; i++) {
      if (!this.reach[i] || this.water[i]) continue;
      const x = this.cx(i), z = this.cz(i), h = this.h[i];
      let low = 0, high = 0;
      for (let k = 0; k < 16; k++) {
        const [dx, dz] = COVER_DIRS[k];
        const px = x + dx * 0.95, pz = z + dz * 0.95;
        let top = w.groundY(px, pz);
        const list = w.query(px - 0.05, pz - 0.05, px + 0.05, pz + 0.05, q);
        for (const b of list) {
          if (!b.solid) continue;
          if (px < b.x0 || px > b.x1 || pz < b.z0 || pz > b.z1) continue;
          if (b.y0 > h + 0.6) continue; // overhead
          if (b.y1 > top) top = b.y1;
        }
        const rel = top - h;
        if (rel >= 1.55) high |= 1 << k; else if (rel >= 0.8) low |= 1 << k;
      }
      if (!low && !high) continue;
      const c = { id: this.cover.length, i, x, z, h, low, high, claim: null, claimT: 0 };
      this.cover.push(c);
      const key = (Math.floor(x / 8) + 100) * 1000 + Math.floor(z / 8) + 100;
      if (!this.coverGrid.has(key)) this.coverGrid.set(key, []);
      this.coverGrid.get(key).push(c);
    }
  }
  coverNear(x, z, r, out = []) {
    out.length = 0;
    const r2 = r * r;
    const k0 = Math.floor((x - r) / 8), k1 = Math.floor((x + r) / 8), m0 = Math.floor((z - r) / 8), m1 = Math.floor((z + r) / 8);
    for (let a = k0; a <= k1; a++) for (let b = m0; b <= m1; b++) {
      const list = this.coverGrid.get((a + 100) * 1000 + b + 100);
      if (!list) continue;
      for (const c of list) if ((c.x - x) ** 2 + (c.z - z) ** 2 <= r2) out.push(c);
    }
    return out;
  }
  // direction index (0..15) of a world vector
  static dirIndex(dx, dz) {
    let a = Math.atan2(dz, dx); if (a < 0) a += Math.PI * 2;
    return Math.round(a / (Math.PI * 2) * 16) & 15;
  }
  // how well a cover point is covered from direction (dx,dz) pointing TO the threat: 0 none, 1 low, 2 high
  static coverFrom(c, dx, dz) {
    const k = Nav.dirIndex(dx, dz);
    let best = 0;
    for (const o of [0, 1, 15]) {
      const kk = (k + o) & 15;
      if (c.high & (1 << kk)) best = Math.max(best, o === 0 ? 2 : 1.6);
      else if (c.low & (1 << kk)) best = Math.max(best, o === 0 ? 1 : 0.8);
    }
    return best;
  }
}
export { clamp };
