// Static collision geometry: ground pieces (x-monotonic polylines that are
// filled down to the bottom when drawn), extra one-sided segments (loops,
// platforms) and lava pools. Segments are bucketed by x for fast queries.
// Every segment is ONE-SIDED: it only pushes things out along its normal,
// which is the left-hand side of its direction (so a left-to-right ground line
// has its normal pointing up in y-down screen space).

export class Terrain {
  constructor() {
    this.cell = 200;
    this.grid = new Map();
    this.segs = [];
    this.pieces = [];
    this.overlays = [];   // drawn on top of ground: conveyors, ice sheen
    this.loops = [];
    this.lava = [];       // {x0, x1, y}
    this.decals = [];     // painted tutorial arrows {x, y, kind}
    this.stamp = 1;
    this.minX = Infinity; this.maxX = -Infinity;
  }

  addSeg(ax, ay, bx, by, props) {
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    if (len < 0.01) return null;
    const tx = dx / len, ty = dy / len;
    const s = { ax, ay, bx, by, tx, ty, nx: ty, ny: -tx, len, mu: 1, conv: 0, kind: 'ground', gate: null, owner: null, mark: 0,
      x0: Math.min(ax, bx), x1: Math.max(ax, bx), y0: Math.min(ay, by), y1: Math.max(ay, by) };
    if (props) Object.assign(s, props);
    this.segs.push(s);
    const c0 = Math.floor(s.x0 / this.cell), c1 = Math.floor(s.x1 / this.cell);
    for (let c = c0; c <= c1; c++) {
      let b = this.grid.get(c);
      if (!b) this.grid.set(c, (b = []));
      b.push(s);
    }
    if (s.x0 < this.minX) this.minX = s.x0;
    if (s.x1 > this.maxX) this.maxX = s.x1;
    return s;
  }

  // pts: flat [x0,y0,x1,y1,...] left to right. props per piece; segProps(i) can override per segment
  addPiece(pts, props = {}, segProps = null) {
    const piece = { pts, x0: pts[0], x1: pts[pts.length - 2], minY: Infinity, maxY: -Infinity, kind: props.kind || 'ground', path: null, dots: null };
    for (let i = 1; i < pts.length; i += 2) { piece.minY = Math.min(piece.minY, pts[i]); piece.maxY = Math.max(piece.maxY, pts[i]); }
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const sp = segProps ? segProps(i / 2) : null;
      this.addSeg(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], Object.assign({ piece }, props.seg || {}, sp || {}));
    }
    this.pieces.push(piece);
    return piece;
  }

  query(x0, x1, out) {
    out.length = 0;
    const st = ++this.stamp;
    const c0 = Math.floor(x0 / this.cell), c1 = Math.floor(x1 / this.cell);
    for (let c = c0; c <= c1; c++) {
      const b = this.grid.get(c);
      if (!b) continue;
      for (let i = 0; i < b.length; i++) { const s = b[i]; if (s.mark !== st) { s.mark = st; out.push(s); } }
    }
    return out;
  }

  // top of the ground at x (smallest y among ground pieces covering x); Infinity over a gap
  surfaceY(x) {
    let best = Infinity;
    for (const p of this.pieces) {
      if (x < p.x0 || x > p.x1) continue;
      const y = pieceY(p, x);
      if (y < best) best = y;
    }
    return best;
  }
  // slope angle (radians, y-down) of the ground at x
  slopeAt(x) {
    const a = this.surfaceY(x - 8), b = this.surfaceY(x + 8);
    if (!isFinite(a) || !isFinite(b)) return 0;
    return Math.atan2(b - a, 16);
  }
  // lowest point anywhere: used for the "fell off the world" line
  get deathY() { let m = -Infinity; for (const p of this.pieces) m = Math.max(m, p.maxY); return m + 700; }
}

export function pieceY(p, x) {
  const pts = p.pts;
  // binary search on x (pieces are x-monotonic, vertical walls allowed)
  let lo = 0, hi = (pts.length >> 1) - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (pts[m * 2] <= x) lo = m; else hi = m; }
  const ax = pts[lo * 2], ay = pts[lo * 2 + 1], bx = pts[hi * 2], by = pts[hi * 2 + 1];
  if (bx - ax < 0.001) return Math.min(ay, by);
  return ay + (by - ay) * ((x - ax) / (bx - ax));
}
