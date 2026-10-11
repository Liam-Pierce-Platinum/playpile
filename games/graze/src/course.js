// The course: ceiling and floor polylines (x never decreases; equal x = a
// vertical step), spikes and saws, portals, the guaranteed safe line ("path")
// every chunk is built around, and chunk-start checkpoints for practice mode.
import { segNearest } from './util.js';

const BUCKET = 128;

export class Course {
  constructor() {
    this.cx = []; this.cy = [];
    this.fx = []; this.fy = [];
    this.px = []; this.py = [];
    this.obs = [];
    this.buckets = new Map();
    this.portals = [];
    this.checks = [];   // { x, y, mini, grav, speed, mirror }
    this.chunks = [];   // { x0, x1, type }
    this.genX = 0;
    this.finishX = Infinity;
    this.length = Infinity;
    this.nextId = 1;
    this._near = { x: 0, y: 0 };
    this._stamp = 0;
  }

  addCeil(x, y) { this.cx.push(x); this.cy.push(y); }
  addFloor(x, y) { this.fx.push(x); this.fy.push(y); }
  addPath(x, y) {
    const n = this.px.length;
    if (n && Math.abs(this.px[n - 1] - x) < 1e-6 && Math.abs(this.py[n - 1] - y) < 1e-6) return;
    this.px.push(x); this.py.push(y);
  }
  addObs(o) {
    o.id = this.nextId++;
    if (o.type === 'spike') {
      const p = o.pts;
      o.minx = Math.min(p[0], p[2], p[4]); o.maxx = Math.max(p[0], p[2], p[4]);
      o.miny = Math.min(p[1], p[3], p[5]); o.maxy = Math.max(p[1], p[3], p[5]);
    } else {
      o.minx = o.x - o.r; o.maxx = o.x + o.r;
    }
    this.obs.push(o);
    for (let b = Math.floor(o.minx / BUCKET); b <= Math.floor(o.maxx / BUCKET); b++) {
      let l = this.buckets.get(b);
      if (!l) this.buckets.set(b, (l = []));
      l.push(o);
    }
    return o;
  }

  // index of the last x <= v
  static idx(xs, v) {
    let lo = 0, hi = xs.length - 1;
    if (hi < 0 || v < xs[0]) return -1;
    while (lo < hi) {
      const m = (lo + hi + 1) >> 1;
      if (xs[m] <= v) lo = m; else hi = m - 1;
    }
    return lo;
  }
  static yAt(xs, ys, x) {
    const i = Course.idx(xs, x);
    if (i < 0) return ys[0];
    if (i >= xs.length - 1) return ys[xs.length - 1];
    const x0 = xs[i], x1 = xs[i + 1];
    if (x1 <= x0) return ys[i + 1];
    return ys[i] + (ys[i + 1] - ys[i]) * ((x - x0) / (x1 - x0));
  }
  ceilY(x) { return Course.yAt(this.cx, this.cy, x); }
  floorY(x) { return Course.yAt(this.fx, this.fy, x); }
  pathY(x) { return Course.yAt(this.px, this.py, x); }

  // min distance to a polyline within x +- R; out gets the nearest point
  static lineDist(xs, ys, x, y, R, out) {
    let i = Course.idx(xs, x - R); if (i < 0) i = 0;
    let best = 1e9; const tmp = { x: 0, y: 0 };
    for (; i < xs.length - 1; i++) {
      if (xs[i] > x + R) break;
      const d = segNearest(x, y, xs[i], ys[i], xs[i + 1], ys[i + 1], tmp);
      if (d < best) { best = d; out.x = tmp.x; out.y = tmp.y; }
    }
    return best;
  }

  // Nearest solid thing to (x, y). Returns { d, id, nx, ny }: d < 0 means inside.
  query(x, y, R, res) {
    res.d = 1e9; res.id = 0; res.kind = ''; res.nx = x; res.ny = y;
    const o = this._near;
    // ceiling
    if (this.cx.length) {
      const cy = this.ceilY(x);
      let d = Course.lineDist(this.cx, this.cy, x, y, R, o);
      if (y < cy) d = -1;
      if (d < res.d) { res.d = d; res.id = -1; res.kind = 'wall'; res.nx = o.x; res.ny = o.y; if (d < 0) { res.nx = x; res.ny = cy; } }
    }
    if (this.fx.length) {
      const fy = this.floorY(x);
      let d = Course.lineDist(this.fx, this.fy, x, y, R, o);
      if (y > fy) d = -1;
      if (d < res.d) { res.d = d; res.id = -2; res.kind = 'wall'; res.nx = o.x; res.ny = o.y; if (d < 0) { res.nx = x; res.ny = fy; } }
    }
    const stamp = ++this._stamp;
    for (let b = Math.floor((x - R) / BUCKET); b <= Math.floor((x + R) / BUCKET); b++) {
      const l = this.buckets.get(b);
      if (!l) continue;
      for (const ob of l) {
        if (ob._s === stamp) continue;
        ob._s = stamp;
        if (ob.maxx < x - R || ob.minx > x + R) continue;
        let d;
        if (ob.type === 'saw') {
          const dx = x - ob.x, dy = y - ob.y, h = Math.hypot(dx, dy);
          d = h - ob.r;
          if (d < res.d) { res.d = d < 0 ? -1 : d; res.id = ob.id; res.kind = 'saw'; res.nx = ob.x + (h ? dx / h : 0) * ob.r; res.ny = ob.y + (h ? dy / h : 1) * ob.r; }
        } else {
          const p = ob.pts;
          if (inTri(x, y, p)) d = -1;
          else {
            d = segNearest(x, y, p[0], p[1], p[2], p[3], o); let nx = o.x, ny = o.y;
            let d2 = segNearest(x, y, p[2], p[3], p[4], p[5], o); if (d2 < d) { d = d2; nx = o.x; ny = o.y; }
            d2 = segNearest(x, y, p[4], p[5], p[0], p[1], o); if (d2 < d) { d = d2; nx = o.x; ny = o.y; }
            o.x = nx; o.y = ny;
          }
          if (d < res.d) { res.d = d; res.id = ob.id; res.kind = 'spike'; res.nx = d < 0 ? x : o.x; res.ny = d < 0 ? y : o.y; }
        }
      }
    }
    return res;
  }

  obsInRange(x0, x1, out) {
    out.length = 0;
    const stamp = ++this._stamp;
    for (let b = Math.floor(x0 / BUCKET); b <= Math.floor(x1 / BUCKET); b++) {
      const l = this.buckets.get(b);
      if (!l) continue;
      for (const ob of l) { if (ob._s !== stamp) { ob._s = stamp; out.push(ob); } }
    }
    return out;
  }

  checkAt(x) {
    let c = this.checks[0];
    for (const k of this.checks) { if (k.x <= x) c = k; else break; }
    return c;
  }
  chunkAt(x) {
    for (let i = this.chunks.length - 1; i >= 0; i--) if (this.chunks[i].x0 <= x) return this.chunks[i];
    return this.chunks[0];
  }
}

function inTri(x, y, p) {
  const s = (ax, ay, bx, by) => (bx - ax) * (y - ay) - (by - ay) * (x - ax);
  const a = s(p[0], p[1], p[2], p[3]), b = s(p[2], p[3], p[4], p[5]), c = s(p[4], p[5], p[0], p[1]);
  return (a >= 0 && b >= 0 && c >= 0) || (a <= 0 && b <= 0 && c <= 0);
}
