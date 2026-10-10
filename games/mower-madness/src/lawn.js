// The lawn: a per-cell grid (what is grass, what is cut, which way it was cut)
// plus three world-size canvases that are what you actually see:
//   cut     the striped short grass (each pass stamps the texture for its direction)
//   tall    the uncut grass; mowing erases it (destination-out)
//   shade   a dark copy of "tall", drawn offset, so long grass casts a shadow on cut grass
export const CELL = 8;
export const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // E S W N (y points down)

export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return (s >>> 0) / 4294967296; };
}

export function inside(sh, x, y, pad = 0) {
  if (sh.t === 'r') return x >= sh.x - pad && x <= sh.x + sh.w + pad && y >= sh.y - pad && y <= sh.y + sh.h + pad;
  const dx = x - sh.x, dy = y - sh.y, r = sh.r + pad;
  return dx * dx + dy * dy <= r * r;
}

// ---------------------------------------------------------------- textures
const TEX = {};
function tile(seed, base, cols, n, len, ang, spread, wid) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d'), r = rng(seed);
  x.fillStyle = base; x.fillRect(0, 0, S, S);
  // soft large-scale mottling so it never looks like flat paint
  for (let i = 0; i < 26; i++) {
    const px = r() * S, py = r() * S, rad = 20 + r() * 40;
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    const lite = r() < 0.5;
    g.addColorStop(0, lite ? 'rgba(255,255,200,0.07)' : 'rgba(0,40,0,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0)');
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) { x.save(); x.translate(ox, oy); x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2); x.restore(); }
  }
  x.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const px = r() * S, py = r() * S, a = ang + (r() - 0.5) * spread, l = len[0] + r() * (len[1] - len[0]);
    x.strokeStyle = cols[(r() * cols.length) | 0]; x.lineWidth = wid[0] + r() * (wid[1] - wid[0]);
    const ex = Math.cos(a) * l, ey = Math.sin(a) * l;
    for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
      const qx = px + ox, qy = py + oy;
      if (qx < -12 || qx > S + 12 || qy < -12 || qy > S + 12) continue;
      x.beginPath(); x.moveTo(qx, qy); x.lineTo(qx + ex, qy + ey); x.stroke();
    }
  }
  return c;
}
export function makeTextures() {
  if (TEX.tall) return TEX;
  TEX.tall = tile(11, '#3b8a2a', ['#2a6b1c', '#317a22', '#459a31', '#4fa637', '#5cb540', '#28661b', '#3a8e2a'], 9000, [4, 9], -Math.PI / 2, 2.2, [1.1, 2.0]);
  // light/dark per mowing direction: E light, S dark-ish, W dark, N light-ish
  const cut = [
    ['#93d35c', ['#86c752', '#9fdc68', '#8ccd57', '#a8e070']],
    ['#6aae43', ['#5fa23b', '#74b84b', '#66aa40', '#7cbf50']],
    ['#63a63e', ['#589a37', '#6db146', '#5e9f3a', '#73b54a']],
    ['#8ccd57', ['#80c24e', '#98d662', '#86c753', '#a0da69']],
  ];
  TEX.cut = cut.map(([b, cs], i) => tile(100 + i, b, cs, 7000, [2, 4], DIRS[i][0] ? 0 : Math.PI / 2, 0.5, [0.8, 1.4]));
  TEX.base = cut.map(([b]) => b);
  return TEX;
}

// ---------------------------------------------------------------- the lawn
export class Lawn {
  constructor(lv) {
    makeTextures();
    this.w = lv.w; this.h = lv.h;
    const cw = this.cw = Math.ceil(lv.w / CELL), ch = this.ch = Math.ceil(lv.h / CELL);
    const N = cw * ch;
    this.kind = new Uint8Array(N);   // 0 nothing, 1 grass, 2 flower bed, 3 walkable non-grass, 4 solid
    this.cut = new Uint8Array(N);    // 0 uncut, else dir+1
    this.straight = new Uint8Array(N);
    const solid = [...(lv.water || []), ...(lv.hedges || []), ...(lv.walls || []), ...(lv.houses || []), ...(lv.sheds || []), ...(lv.tents || []), ...(lv.kennels || []),
      ...(lv.towers || []), ...(lv.fountains || []), ...(lv.keep || []), ...(lv.goals || []), ...(lv.bushes || [])];
    const walk = [...(lv.paths || []), ...(lv.patios || []), ...(lv.sand || [])];
    const trunks = (lv.trees || []).map(([x, y]) => C0(x, y, 13));
    this.grass = 0;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const x = i * CELL + CELL / 2, y = j * CELL + CELL / 2, k = j * cw + i;
      let v = 1;
      if (solid.some((s) => inside(s, x, y)) || trunks.some((s) => inside(s, x, y))) v = 4;
      else if ((lv.beds || []).some((s) => inside(s, x, y))) v = 2;
      else if (walk.some((s) => inside(s, x, y))) v = 3;
      this.kind[k] = v;
      if (v === 1) this.grass++;
    }
    this.cutCount = 0; this.stripeCount = 0;
    const mk = () => { const c = document.createElement('canvas'); c.width = lv.w; c.height = lv.h; return c; };
    this.cutCv = mk(); this.tallCv = mk(); this.shadeCv = mk();
    this.cx = this.cutCv.getContext('2d'); this.tx = this.tallCv.getContext('2d'); this.sx = this.shadeCv.getContext('2d');
    this.pats = TEX.cut.map((t) => this.cx.createPattern(t, 'repeat'));
    this.cx.fillStyle = this.pats[0]; this.cx.fillRect(0, 0, lv.w, lv.h);
    this.tx.fillStyle = this.tx.createPattern(TEX.tall, 'repeat'); this.tx.fillRect(0, 0, lv.w, lv.h);
    this.sx.fillStyle = '#0d2a06'; this.sx.fillRect(0, 0, lv.w, lv.h);
    // only grass is tall; everything else is drawn by the ground layer
    this.tx.globalCompositeOperation = 'destination-out'; this.sx.globalCompositeOperation = 'destination-out';
    for (let k = 0; k < N; k++) if (this.kind[k] !== 1) {
      const i = k % cw, j = (k / cw) | 0;
      this.tx.fillRect(i * CELL, j * CELL, CELL, CELL); this.sx.fillRect(i * CELL, j * CELL, CELL, CELL);
    }
    this.jit = rng(7);
  }
  idx(x, y) { const i = (x / CELL) | 0, j = (y / CELL) | 0; return i < 0 || j < 0 || i >= this.cw || j >= this.ch ? -1 : j * this.cw + i; }
  kindAt(x, y) { const k = this.idx(x, y); return k < 0 ? 4 : this.kind[k]; }
  get pct() { return this.grass ? this.cutCount / this.grass : 0; }

  // Mow the deck rectangle centred (cx,cy), facing (ax,ay). Returns newly cut cells.
  mow(cx, cy, ax, ay, halfLen, halfW, dir, straight) {
    // ragged polygon for the visual stamp: a little jitter on the edges
    const p = new Path2D(), lx = -ay, ly = ax, r = this.jit;
    const pts = [];
    const n = 5;
    for (let s = 0; s <= n; s++) { const t = -halfW + (2 * halfW * s) / n; pts.push([halfLen + (r() - 0.5) * 2.2, t]); }
    for (let s = n; s >= 0; s--) { const t = -halfW + (2 * halfW * s) / n; pts.push([-halfLen, t]); }
    pts.forEach(([f, l], i) => { const x = cx + ax * f + lx * l, y = cy + ay * f + ly * l; if (i) p.lineTo(x, y); else p.moveTo(x, y); });
    p.closePath();
    this.cx.fillStyle = this.pats[dir]; this.cx.fill(p);
    this.tx.fill(p); this.sx.fill(p);
    // the grid
    const ext = Math.abs(ax) * halfLen + Math.abs(lx) * halfW, eyt = Math.abs(ay) * halfLen + Math.abs(ly) * halfW;
    const i0 = Math.max(0, ((cx - ext) / CELL) | 0), i1 = Math.min(this.cw - 1, ((cx + ext) / CELL) | 0);
    const j0 = Math.max(0, ((cy - eyt) / CELL) | 0), j1 = Math.min(this.ch - 1, ((cy + eyt) / CELL) | 0);
    let fresh = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * this.cw + i;
      if (this.kind[k] !== 1) continue;
      const dx = i * CELL + CELL / 2 - cx, dy = j * CELL + CELL / 2 - cy;
      if (Math.abs(dx * ax + dy * ay) > halfLen + 1 || Math.abs(dx * lx + dy * ly) > halfW) continue;
      if (!this.cut[k]) { fresh++; this.cutCount++; }
      this.cut[k] = dir + 1; this.straight[k] = straight ? 1 : 0;
    }
    return fresh;
  }
  // Uncut this one cell (used by nothing yet, kept tiny for tests)
  // Stripe quality: a cut cell counts if it was cut on a straight pass and the two
  // cells either side of it along that direction were cut the same way.
  stripes() {
    const { cw, ch, cut, straight } = this;
    let s = 0, n = 0;
    for (let j = 0; j < ch; j++) for (let i = 0; i < cw; i++) {
      const k = j * cw + i, d = cut[k];
      if (!d) continue;
      n++;
      if (!straight[k]) continue;
      const [ox, oy] = DIRS[d - 1];
      let ok = true;
      for (const m of [-2, -1, 1, 2]) {
        const ii = i + ox * m, jj = j + oy * m;
        if (ii < 0 || jj < 0 || ii >= cw || jj >= ch) continue;
        const kk = jj * cw + ii;
        if (this.kind[kk] !== 1) continue;
        if (cut[kk] !== d) { ok = false; break; }
      }
      if (ok) s++;
    }
    this.stripeCount = s;
    return n ? s / n : 0;
  }
  // Breadth-first search from (x,y) to the nearest uncut grass cell, through cells the
  // mower can drive (block = Uint8Array of impassable cells). Returns the path as cells.
  nearestUncut(x, y, block, avoid, okTarget) {
    const { cw, ch } = this, N = cw * ch;
    const start = this.idx(x, y);
    if (start < 0) return null;
    if (!this.prev || this.prev.length !== N) { this.prev = new Int32Array(N); this.q = new Int32Array(N); }
    const prev = this.prev, q = this.q;
    prev.fill(-2);
    let h = 0, t = 0;
    q[t++] = start; prev[start] = -1;
    while (h < t) {
      const k = q[h++];
      if (this.kind[k] === 1 && !this.cut[k] && k !== start && !(avoid && avoid[k]) && !(okTarget && okTarget[k])) {
        const path = [];
        for (let c = k; c !== -1; c = prev[c]) path.push(c);
        return path.reverse();
      }
      const i = k % cw, j = (k / cw) | 0;
      if (i > 0) { const n = k - 1; if (prev[n] === -2 && (!block[n] || block[k])) { prev[n] = k; q[t++] = n; } }
      if (i < cw - 1) { const n = k + 1; if (prev[n] === -2 && (!block[n] || block[k])) { prev[n] = k; q[t++] = n; } }
      if (j > 0) { const n = k - cw; if (prev[n] === -2 && (!block[n] || block[k])) { prev[n] = k; q[t++] = n; } }
      if (j < ch - 1) { const n = k + cw; if (prev[n] === -2 && (!block[n] || block[k])) { prev[n] = k; q[t++] = n; } }
    }
    return null;
  }
  cellXY(k) { return [(k % this.cw) * CELL + CELL / 2, ((k / this.cw) | 0) * CELL + CELL / 2]; }
}
function C0(x, y, r) { return { t: 'c', x, y, r }; }
