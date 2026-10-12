// Spring-mass warping grid (the Geometry Wars background). Points sit on a
// regular lattice; each is tied to its neighbours and, weakly, to its rest
// spot. Explosions push points away, black holes pull them in, bullets nudge
// them along their path. Edge points are pinned so the grid always snaps back.
export class Grid {
  constructor(w, h, spacing = 40) {
    this.sp = spacing;
    this.cols = Math.round(w / spacing) + 1;
    this.rows = Math.round(h / spacing) + 1;
    const n = this.cols * this.rows;
    this.n = n;
    this.x = new Float32Array(n); this.y = new Float32Array(n);
    this.rx = new Float32Array(n); this.ry = new Float32Array(n);
    this.vx = new Float32Array(n); this.vy = new Float32Array(n);
    this.ax = new Float32Array(n); this.ay = new Float32Array(n);
    this.inv = new Float32Array(n);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c;
      this.x[i] = this.rx[i] = c * spacing; this.y[i] = this.ry[i] = r * spacing;
      const edge = r === 0 || c === 0 || r === this.rows - 1 || c === this.cols - 1;
      this.inv[i] = edge ? 0 : 1;
    }
    // springs: horizontal + vertical neighbours
    const sa = [], sb = [];
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const i = r * this.cols + c;
      if (c < this.cols - 1) { sa.push(i); sb.push(i + 1); }
      if (r < this.rows - 1) { sa.push(i); sb.push(i + this.cols); }
    }
    this.sa = Int32Array.from(sa); this.sb = Int32Array.from(sb);
    this.rest = spacing * 0.95;
    this.energy = 0;
  }
  // index box of points inside a circle, then call fn(i, dx, dy, d2)
  _each(px, py, radius, fn) {
    const sp = this.sp;
    const c0 = Math.max(1, Math.floor((px - radius) / sp)), c1 = Math.min(this.cols - 2, Math.ceil((px + radius) / sp));
    const r0 = Math.max(1, Math.floor((py - radius) / sp)), r1 = Math.min(this.rows - 2, Math.ceil((py + radius) / sp));
    const R2 = radius * radius;
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
      const i = r * this.cols + c;
      const dx = this.x[i] - px, dy = this.y[i] - py, d2 = dx * dx + dy * dy;
      if (d2 < R2) fn(i, dx, dy, d2);
    }
  }
  explode(px, py, force, radius) {
    this._each(px, py, radius, (i, dx, dy, d2) => {
      const d = Math.sqrt(d2) + 0.001, f = force * (1 - d / radius) / d;
      this.vx[i] += dx * f; this.vy[i] += dy * f;
    });
  }
  implode(px, py, force, radius) {
    this._each(px, py, radius, (i, dx, dy, d2) => {
      const d = Math.sqrt(d2) + 0.001, k = (1 - d / radius);
      const f = -force * k * k / d * Math.min(1, d / 30);
      // a little swirl makes holes look like they spin space around them
      this.ax[i] += dx * f - dy * f * 0.35; this.ay[i] += dy * f + dx * f * 0.35;
    });
  }
  push(px, py, dirx, diry, force, radius) {
    this._each(px, py, radius, (i, dx, dy, d2) => {
      const k = 1 - Math.sqrt(d2) / radius;
      this.ax[i] += dirx * force * k; this.ay[i] += diry * force * k;
    });
  }
  update() {
    const { x, y, vx, vy, ax, ay, sa, sb, inv, rx, ry } = this;
    const rest = this.rest, K = 0.28, D = 0.06;
    for (let s = 0; s < sa.length; s++) {
      const a = sa[s], b = sb[s];
      const dx = x[b] - x[a], dy = y[b] - y[a];
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len <= rest) continue;
      const f = (len - rest) / len * K;
      const fx = dx * f + (vx[b] - vx[a]) * D, fy = dy * f + (vy[b] - vy[a]) * D;
      ax[a] += fx; ay[a] += fy; ax[b] -= fx; ay[b] -= fy;
    }
    let e = 0;
    for (let i = 0; i < this.n; i++) {
      if (inv[i] === 0) { ax[i] = ay[i] = 0; continue; }
      ax[i] += (rx[i] - x[i]) * 0.012; ay[i] += (ry[i] - y[i]) * 0.012;
      vx[i] = (vx[i] + ax[i]) * 0.93; vy[i] = (vy[i] + ay[i]) * 0.93;
      // hard cap so a giant blast can never fold the lattice inside out
      const v2 = vx[i] * vx[i] + vy[i] * vy[i];
      if (v2 > 900) { const k = 30 / Math.sqrt(v2); vx[i] *= k; vy[i] *= k; }
      x[i] += vx[i]; y[i] += vy[i];
      ax[i] = ay[i] = 0;
      e += v2;
    }
    this.energy = e / this.n;
  }
}
