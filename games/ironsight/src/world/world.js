// Static collision world: axis-aligned boxes in a uniform XZ grid. Used for player movement, bullet
// ballistics (with penetration through thin cover), line of sight, a navigation grid for the NPCs
// and auto-generated cover points.
import * as THREE from 'three';

// Surface materials. resist = how hard a bullet finds it per metre (penetration budget units),
// Infinity = never penetrates. fx/decal pick particles and bullet-hole style; snd the impact sound.
export const SURF = {
  concrete: { resist: 14, fx: 'dust', decal: 'concrete', snd: 'hard', col: [0.62, 0.6, 0.57] },
  brick: { resist: 12, fx: 'dust', decal: 'concrete', snd: 'hard', col: [0.55, 0.32, 0.25] },
  asphalt: { resist: Infinity, fx: 'dust', decal: 'concrete', snd: 'hard', col: [0.25, 0.25, 0.26] },
  dirt: { resist: Infinity, fx: 'dirt', decal: 'dirt', snd: 'soft', col: [0.42, 0.34, 0.25] },
  sand: { resist: Infinity, fx: 'sand', decal: 'dirt', snd: 'soft', col: [0.78, 0.66, 0.47] },
  snow: { resist: Infinity, fx: 'snow', decal: 'snow', snd: 'soft', col: [0.92, 0.94, 0.97] },
  metal: { resist: 30, fx: 'spark', decal: 'metal', snd: 'metal', col: [0.5, 0.5, 0.5] },
  sheet: { resist: 22, fx: 'spark', decal: 'metal', snd: 'metal', col: [0.5, 0.5, 0.5] },   // thin sheet metal: car doors, containers, lockers
  wood: { resist: 2.2, fx: 'wood', decal: 'wood', snd: 'wood', col: [0.5, 0.38, 0.24] },
  drywall: { resist: 1.0, fx: 'dust', decal: 'drywall', snd: 'soft', col: [0.86, 0.85, 0.82] },
  glass: { resist: 0.4, fx: 'glass', decal: 'glass', snd: 'glass', col: [0.8, 0.9, 0.95] },
  plastic: { resist: 1.5, fx: 'dust', decal: 'drywall', snd: 'soft', col: [0.3, 0.3, 0.3] },
  foliage: { resist: 0.05, fx: 'leaf', decal: null, snd: 'soft', col: [0.2, 0.3, 0.15] },
  flesh: { resist: 3, fx: 'blood', decal: 'blood', snd: 'flesh', col: [0.4, 0.05, 0.04] },
};

const EPS = 1e-4;

export class World {
  constructor() {
    this.boxes = [];
    this.big = [];
    this.cell = 4;
    this.grid = new Map();
    this.stamp = 1;
    this.bounds = { minX: -100, maxX: 100, minZ: -100, maxZ: 100 };
  }
  // add an axis-aligned box. opts: { surf, nav:false (ignored by nav), shoot:false (bullets pass), see:false (does not block sight), climb }
  add(minx, miny, minz, maxx, maxy, maxz, surf = 'concrete', opts = {}) {
    const b = {
      id: this.boxes.length, min: new THREE.Vector3(minx, miny, minz), max: new THREE.Vector3(maxx, maxy, maxz),
      surf, nav: opts.nav !== false, shoot: opts.shoot !== false, see: opts.see !== false, solid: opts.solid !== false, tag: opts.tag || null, _s: 0,
    };
    this.boxes.push(b);
    return b;
  }
  addCentered(x, y, z, w, h, d, surf, opts) { return this.add(x - w / 2, y, z - d / 2, x + w / 2, y + h, z + d / 2, surf, opts); }
  build() {
    this.grid.clear(); this.big = [];
    const c = this.cell;
    for (const b of this.boxes) {
      const x0 = Math.floor(b.min.x / c), x1 = Math.floor(b.max.x / c), z0 = Math.floor(b.min.z / c), z1 = Math.floor(b.max.z / c);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64) { this.big.push(b); continue; }
      for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
        const k = x * 73856093 ^ z * 19349663;
        let a = this.grid.get(k); if (!a) this.grid.set(k, a = []);
        a.push(b);
      }
    }
  }
  _cellList(cx, cz) { return this.grid.get(cx * 73856093 ^ cz * 19349663); }
  // call fn(box) for each box overlapping the XZ rectangle (each box once)
  query(minx, minz, maxx, maxz, fn) {
    const s = ++this.stamp, c = this.cell;
    for (const b of this.big) { if (b.max.x >= minx && b.min.x <= maxx && b.max.z >= minz && b.min.z <= maxz) { b._s = s; if (fn(b) === true) return; } }
    const x0 = Math.floor(minx / c), x1 = Math.floor(maxx / c), z0 = Math.floor(minz / c), z1 = Math.floor(maxz / c);
    for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) {
      const a = this._cellList(x, z); if (!a) continue;
      for (const b of a) {
        if (b._s === s) continue; b._s = s;
        if (b.max.x >= minx && b.min.x <= maxx && b.max.z >= minz && b.min.z <= maxz) if (fn(b) === true) return;
      }
    }
  }

  // ray vs single box (slab). returns [tEnter, tExit, axisEnter, signEnter] or null
  static rayBox(o, d, b, tMax) {
    let t0 = 0, t1 = tMax, ax = -1, sg = 0;
    for (let i = 0; i < 3; i++) {
      const oi = i === 0 ? o.x : i === 1 ? o.y : o.z, di = i === 0 ? d.x : i === 1 ? d.y : d.z;
      const lo = i === 0 ? b.min.x : i === 1 ? b.min.y : b.min.z, hi = i === 0 ? b.max.x : i === 1 ? b.max.y : b.max.z;
      if (Math.abs(di) < 1e-12) { if (oi < lo || oi > hi) return null; continue; }
      let ta = (lo - oi) / di, tb = (hi - oi) / di, s = -1;
      if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; s = 1; }
      if (ta > t0) { t0 = ta; ax = i; sg = s; }
      if (tb < t1) t1 = tb;
      if (t0 > t1) return null;
    }
    return [t0, t1, ax, sg];
  }

  // nearest hit along a ray. filter(box) -> false to skip. returns {t, point, normal, box, tExit} or null
  raycast(o, d, maxT, filter = null, out = {}) {
    let best = null, bestT = maxT, bestR = null;
    const test = (b) => {
      if (filter && !filter(b)) return;
      const r = World.rayBox(o, d, b, bestT);
      if (!r) return;
      if (r[0] <= EPS && r[2] === -1) {
        // origin inside this box: ignore (lets bullets leave the box they exited)
        return;
      }
      if (r[0] < bestT) { bestT = r[0]; best = b; bestR = r; }
    };
    for (const b of this.big) test(b);
    // 2D DDA through grid cells
    const c = this.cell, s = ++this.stamp;
    let cx = Math.floor(o.x / c), cz = Math.floor(o.z / c);
    const stepX = d.x > 0 ? 1 : -1, stepZ = d.z > 0 ? 1 : -1;
    const tDX = Math.abs(d.x) > 1e-9 ? c / Math.abs(d.x) : Infinity, tDZ = Math.abs(d.z) > 1e-9 ? c / Math.abs(d.z) : Infinity;
    let tMX = Math.abs(d.x) > 1e-9 ? ((d.x > 0 ? (cx + 1) * c - o.x : o.x - cx * c) / Math.abs(d.x)) : Infinity;
    let tMZ = Math.abs(d.z) > 1e-9 ? ((d.z > 0 ? (cz + 1) * c - o.z : o.z - cz * c) / Math.abs(d.z)) : Infinity;
    let tCell = 0;
    for (let guard = 0; guard < 4096; guard++) {
      const a = this._cellList(cx, cz);
      if (a) for (const b of a) { if (b._s === s) continue; b._s = s; test(b); }
      const tNext = Math.min(tMX, tMZ);
      if (bestT <= tNext || tNext > maxT) break;
      tCell = tNext;
      if (tMX < tMZ) { cx += stepX; tMX += tDX; } else { cz += stepZ; tMZ += tDZ; }
    }
    if (!best) return null;
    out.t = bestT; out.box = best; out.tExit = bestR[1];
    out.point = (out.point || new THREE.Vector3()).copy(d).multiplyScalar(bestT).add(o);
    out.normal = (out.normal || new THREE.Vector3()).set(0, 0, 0);
    if (bestR[2] >= 0) out.normal.setComponent(bestR[2], bestR[3]);
    else out.normal.copy(d).negate();
    return out;
  }
  // true when nothing that blocks sight lies between a and b
  los(a, b, ignoreBox = null) {
    const d = _v1.subVectors(b, a); const L = d.length(); if (L < 1e-4) return true; d.multiplyScalar(1 / L);
    return !this.raycast(a, d, L - 0.05, bx => bx.see && bx !== ignoreBox, _hit);
  }

  overlaps(minx, miny, minz, maxx, maxy, maxz, fn) {
    let hit = null;
    this.query(minx, minz, maxx, maxz, b => {
      if (!b.solid) return;
      if (b.max.y > miny + EPS && b.min.y < maxy - EPS && b.max.x > minx + EPS && b.min.x < maxx - EPS && b.max.z > minz + EPS && b.min.z < maxz - EPS) {
        if (!fn || fn(b)) { hit = b; return true; }
      }
    });
    return hit;
  }
  free(x, y, z, r, h) { return !this.overlaps(x - r, y, z - r, x + r, y + h, z + r); }

  // Move an upright box (feet at pos, half width r, height h) by delta with step-up. Mutates pos.
  move(pos, delta, r, h, step, res = {}) {
    res.ground = false; res.wall = false; res.ceil = false; res.stepped = 0; res.wallN = res.wallN || new THREE.Vector3(); res.wallN.set(0, 0, 0);
    for (const axis of ['x', 'z']) {
      const dv = delta[axis]; if (!dv) continue;
      pos[axis] += dv;
      let guard = 0, b;
      while ((b = this.overlaps(pos.x - r, pos.y, pos.z - r, pos.x + r, pos.y + h, pos.z + r)) && guard++ < 6) {
        const rise = b.max.y - pos.y;
        if (step > 0 && rise > 0 && rise <= step && this.free(pos.x, b.max.y + 0.001, pos.z, r, h)) { pos.y = b.max.y + 0.001; res.stepped += rise; continue; }
        if (dv > 0) pos[axis] = b.min[axis] - r - 0.001; else pos[axis] = b.max[axis] + r + 0.001;
        res.wall = true; res.wallN[axis] = dv > 0 ? -1 : 1;
      }
    }
    if (delta.y) {
      pos.y += delta.y;
      let b, guard = 0;
      while ((b = this.overlaps(pos.x - r, pos.y, pos.z - r, pos.x + r, pos.y + h, pos.z + r)) && guard++ < 6) {
        if (delta.y < 0) { pos.y = b.max.y + 0.0005; res.ground = true; } else { pos.y = b.min.y - h - 0.001; res.ceil = true; }
      }
    }
    if (!res.ground) {
      // standing check: anything right under the feet
      if (this.overlaps(pos.x - r * 0.9, pos.y - 0.04, pos.z - r * 0.9, pos.x + r * 0.9, pos.y, pos.z + r * 0.9)) res.ground = delta.y <= 0;
    }
    return res;
  }

  // highest walkable top under (x,z) at or below y (for NPC feet and decals)
  groundAt(x, z, y = 50, r = 0.05) {
    let top = -10;
    this.query(x - r, z - r, x + r, z + r, b => { if (b.solid && b.nav && b.max.y <= y + 0.01 && b.max.y > top && x >= b.min.x - r && x <= b.max.x + r && z >= b.min.z - r && z <= b.max.z + r) top = b.max.y; });
    return top;
  }

  // ---------------------------------------------------------------- navigation grid
  buildNav(cell = 1, clearance = 0.35) {
    const B = this.bounds;
    const nx = Math.ceil((B.maxX - B.minX) / cell), nz = Math.ceil((B.maxZ - B.minZ) / cell);
    const h = new Float32Array(nx * nz), ok = new Uint8Array(nx * nz);
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const x = B.minX + (i + 0.5) * cell, z = B.minZ + (j + 0.5) * cell;
      let g = -10;
      this.query(x - 0.05, z - 0.05, x + 0.05, z + 0.05, b => { if (b.solid && b.nav && b.max.y <= 0.55 && b.max.y > g && x >= b.min.x && x <= b.max.x && z >= b.min.z && z <= b.max.z) g = b.max.y; });
      h[i * nz + j] = g;
      if (g < -5) continue;
      const blocked = this.overlaps(x - clearance, g + 0.4, z - clearance, x + clearance, g + 1.7, z + clearance, bx => bx.nav);
      ok[i * nz + j] = blocked ? 0 : 1;
    }
    this.nav = { cell, nx, nz, h, ok, minX: B.minX, minZ: B.minZ };
  }
  navCell(x, z) {
    const N = this.nav; const i = Math.floor((x - N.minX) / N.cell), j = Math.floor((z - N.minZ) / N.cell);
    if (i < 0 || j < 0 || i >= N.nx || j >= N.nz) return -1; return i * N.nz + j;
  }
  walkable(x, z) { const c = this.navCell(x, z); return c >= 0 && this.nav.ok[c] === 1; }
  cellCenter(c, out = new THREE.Vector3()) { const N = this.nav; const i = Math.floor(c / N.nz), j = c % N.nz; return out.set(N.minX + (i + 0.5) * N.cell, N.h[c], N.minZ + (j + 0.5) * N.cell); }
  nearestWalkable(x, z, maxR = 8) {
    const c = this.navCell(x, z); if (c >= 0 && this.nav.ok[c]) return c;
    const N = this.nav, i0 = Math.floor((x - N.minX) / N.cell), j0 = Math.floor((z - N.minZ) / N.cell);
    for (let r = 1; r <= maxR / N.cell; r++) for (let di = -r; di <= r; di++) for (let dj = -r; dj <= r; dj++) {
      if (Math.abs(di) !== r && Math.abs(dj) !== r) continue;
      const i = i0 + di, j = j0 + dj; if (i < 0 || j < 0 || i >= N.nx || j >= N.nz) continue;
      const k = i * N.nz + j; if (N.ok[k]) return k;
    }
    return -1;
  }
  // straight walk check on the grid (for path smoothing)
  navLine(ax, az, bx, bz) {
    const N = this.nav, L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / (N.cell * 0.4));
    let prevH = null;
    for (let k = 0; k <= n; k++) {
      const t = k / Math.max(1, n), c = this.navCell(ax + (bx - ax) * t, az + (bz - az) * t);
      if (c < 0 || !N.ok[c]) return false;
      if (prevH !== null && Math.abs(N.h[c] - prevH) > 0.45) return false;
      prevH = N.h[c];
    }
    return true;
  }
  findPath(from, to, maxIter = 60000) {
    const N = this.nav; if (!N) return null;
    const s = this.nearestWalkable(from.x, from.z), g = this.nearestWalkable(to.x, to.z);
    if (s < 0 || g < 0) return null;
    if (this.navLine(from.x, from.z, to.x, to.z)) return [this.cellCenter(g).setX(to.x).setZ(to.z)];
    const nz = N.nz, gi = Math.floor(g / nz), gj = g % nz;
    const gScore = this._gs || (this._gs = new Float32Array(N.nx * N.nz)), came = this._cf || (this._cf = new Int32Array(N.nx * N.nz));
    const seen = this._seen || (this._seen = new Uint32Array(N.nx * N.nz)); const stamp = (this._ps = (this._ps || 0) + 1);
    const heap = [];
    const push = (k, f) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
    const hfn = k => { const i = Math.floor(k / nz), j = k % nz; const dx = Math.abs(i - gi), dz = Math.abs(j - gj); return (dx + dz) + (1.414 - 2) * Math.min(dx, dz); };
    seen[s] = stamp; gScore[s] = 0; came[s] = -1; push(s, hfn(s));
    let found = false, it = 0;
    while (heap.length && it++ < maxIter) {
      const [, k] = pop();
      if (k === g) { found = true; break; }
      const i = Math.floor(k / nz), j = k % nz, hk = N.h[k];
      for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
        if (!di && !dj) continue;
        const ii = i + di, jj = j + dj; if (ii < 0 || jj < 0 || ii >= N.nx || jj >= nz) continue;
        const n = ii * nz + jj; if (!N.ok[n] || Math.abs(N.h[n] - hk) > 0.45) continue;
        if (di && dj && (!N.ok[i * nz + jj] || !N.ok[ii * nz + j])) continue;
        const ng = gScore[k] + (di && dj ? 1.414 : 1);
        if (seen[n] !== stamp || ng < gScore[n]) { seen[n] = stamp; gScore[n] = ng; came[n] = k; push(n, ng + hfn(n)); }
      }
    }
    if (!found) return null;
    const cells = []; for (let k = g; k !== -1; k = came[k]) cells.push(k);
    cells.reverse();
    // string pull
    const pts = cells.map(k => this.cellCenter(k));
    pts[pts.length - 1].x = to.x; pts[pts.length - 1].z = to.z;
    const out = []; let a = new THREE.Vector3(from.x, 0, from.z), i = 0;
    while (i < pts.length - 1) {
      let j = pts.length - 1;
      while (j > i + 1 && !this.navLine(a.x, a.z, pts[j].x, pts[j].z)) j--;
      out.push(pts[j]); a = pts[j]; i = j;
    }
    if (!out.length) out.push(pts[pts.length - 1]);
    return out;
  }

  // ---------------------------------------------------------------- cover points
  buildCover() {
    const pts = [];
    for (const b of this.boxes) {
      if (!b.nav || !b.solid || !b.shoot) continue;
      const g = 0; const ht = b.max.y - Math.max(g, b.min.y);
      if (b.min.y > 0.6 || ht < 0.9) continue;
      const sx = b.max.x - b.min.x, sz = b.max.z - b.min.z;
      if (sx > 60 || sz > 60 || Math.min(sx, sz) < 0.3) continue;
      const low = b.max.y < 1.45;
      const faces = [
        { n: [1, 0], a: [b.max.x, b.min.z], b: [b.max.x, b.max.z] }, { n: [-1, 0], a: [b.min.x, b.min.z], b: [b.min.x, b.max.z] },
        { n: [0, 1], a: [b.min.x, b.max.z], b: [b.max.x, b.max.z] }, { n: [0, -1], a: [b.min.x, b.min.z], b: [b.max.x, b.min.z] },
      ];
      for (const f of faces) {
        const L = Math.hypot(f.b[0] - f.a[0], f.b[1] - f.a[1]);
        const n = Math.max(1, Math.round(L / 1.6));
        for (let k = 0; k < n; k++) {
          const t = (k + 0.5) / n, x = f.a[0] + (f.b[0] - f.a[0]) * t + f.n[0] * 0.6, z = f.a[1] + (f.b[1] - f.a[1]) * t + f.n[1] * 0.6;
          const gy = this.groundAt(x, z, 0.6, 0.2); if (gy < -5) continue;
          if (!this.free(x, gy + 0.35, z, 0.28, 1.3) || this.nearestWalkable(x, z, 1.5) < 0) continue;
          const edgeDist = Math.min(t, 1 - t) * L;
          // side of the box edge we can lean/step out from
          const sideDir = new THREE.Vector3(f.b[0] - f.a[0], 0, f.b[1] - f.a[1]).normalize().multiplyScalar(t < 0.5 ? -1 : 1);
          pts.push({ pos: new THREE.Vector3(x, gy, z), n: new THREE.Vector3(f.n[0], 0, f.n[1]), low, edge: !low && edgeDist < 1.0, side: sideDir, box: b, taken: null });
        }
      }
    }
    // drop near duplicates
    const out = [];
    for (const p of pts) if (!out.some(q => q.pos.distanceToSquared(p.pos) < 0.7)) out.push(p);
    this.cover = out;
    return out;
  }
}
const _v1 = new THREE.Vector3(), _hit = {};
