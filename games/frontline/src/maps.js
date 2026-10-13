// Three battlefields. Each map is: a ground height function, a list of collision boxes
// (which are also drawn), a list of visual-only decoration, capture points, spawns and
// named regions used for AI call-outs. Team 0 (VANGUARD) holds the south (+z), team 1 (IRONCLAW) the north.
import { rng, noise2, clamp, smooth, segDist } from './util.js';

const W = 120, D = 160;

function edgeRise(x, z) {
  const e = Math.min(W / 2 - Math.abs(x), D / 2 - Math.abs(z));
  return e < 7 ? Math.pow(7 - e, 1.5) * 0.55 : 0;
}

class MB {
  constructor(ground, seed) {
    this.ground = ground; this.boxes = []; this.deco = []; this.r = rng(seed);
  }
  g(x, z) { return this.ground(x, z); }
  minG(x, z, w, d) {
    return Math.min(this.g(x, z), this.g(x - w / 2, z - d / 2), this.g(x + w / 2, z - d / 2), this.g(x - w / 2, z + d / 2), this.g(x + w / 2, z + d / 2));
  }
  // centre x,z, size w (x) d (z), height h above base
  box(x, z, w, d, h, col, o = {}) {
    const base = o.y !== undefined ? o.y : this.minG(x, z, w, d) - (o.sink ?? 0.15);
    const b = { x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2, y0: base, y1: base + h + (o.y !== undefined ? 0 : (o.sink ?? 0.15)), col, mat: o.mat || 'stone' };
    if (o.solid !== undefined) b.solid = o.solid;
    if (o.sight !== undefined) b.sight = o.sight;
    if (o.walk !== undefined) b.walk = o.walk;
    if (o.hidden) b.hidden = true;
    if (o.jit !== undefined) b.jit = o.jit;
    this.boxes.push(b);
    return b;
  }
  rawBox(x0, y0, z0, x1, y1, z1, col, o = {}) {
    const b = { x0, y0, z0, x1, y1, z1, col, mat: o.mat || 'stone' };
    Object.assign(b, o);
    this.boxes.push(b);
    return b;
  }
  d(o) { this.deco.push(o); return o; }

  // ---------- building blocks ----------
  // wall segment along x (axis 'x') or z, from a to b at fixed c, with openings [{at, w, y0, y1}]
  wall(axis, c, a, b, base, h, th, col, openings = [], ruin = 0, mat = 'stone') {
    const ops = openings.slice().sort((p, q) => p.at - q.at);
    let cur = a;
    const piece = (s, e, y0, y1) => {
      if (e - s < 0.05 || y1 - y0 < 0.05) return;
      if (axis === 'x') this.rawBox(s, y0, c - th / 2, e, y1, c + th / 2, col, { mat });
      else this.rawBox(c - th / 2, y0, s, c + th / 2, y1, e, col, { mat });
    };
    const segTop = () => {
      if (ruin <= 0) return base + h;
      const r = this.r();
      return r < ruin ? base + Math.max(0.9, h * (0.35 + this.r() * 0.5)) : base + h;
    };
    for (const op of ops) {
      const s = op.at - op.w / 2, e = op.at + op.w / 2;
      // split long solid stretches so ruin heights vary
      let p = cur;
      while (p < s - 0.01) { const q = Math.min(s, p + 2.5 + this.r() * 1.5); piece(p, q, base, segTop()); p = q; }
      if (op.y0 > 0.01) piece(s, e, base, base + op.y0); // sill
      const top = segTop();
      if (top > base + op.y1 + 0.05) piece(s, e, base + op.y1, top); // lintel
      cur = e;
    }
    let p = cur;
    while (p < b - 0.01) { const q = Math.min(b, p + 2.5 + this.r() * 1.5); piece(p, q, base, segTop()); p = q; }
  }

  // house: doors [{side:'n'|'s'|'e'|'w', at:-0.5..0.5}], windows per side
  house(cx, cz, w, d, o = {}) {
    const h = o.h ?? 3.0, th = 0.35;
    const base = this.minG(cx, cz, w, d) - 0.1;
    const col = o.col ?? '#d8c7a3', roofCol = o.roofCol ?? '#a8553a', ruin = o.ruin ?? 0;
    const x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
    const sides = { n: [], s: [], e: [], w: [] };
    for (const dr of o.doors || []) {
      const L = dr.side === 'n' || dr.side === 's' ? w : d;
      sides[dr.side].push({ at: dr.at * (L - 3), w: 2.2, y0: 0, y1: 2.35, door: true });
    }
    const win = o.windows ?? 1;
    for (const sd of ['n', 's', 'e', 'w']) {
      const L = sd === 'n' || sd === 's' ? w : d;
      const n = Math.max(0, Math.floor(win * (L / 5)));
      for (let i = 0; i < n; i++) {
        const at = (-0.5 + (i + 0.5) / n) * (L - 2.2);
        if (sides[sd].some((p) => Math.abs(p.at - at) < 2.2)) continue;
        sides[sd].push({ at, w: 1.3, y0: 1.0, y1: 2.05 });
      }
    }
    const mk = (sd, axis, c, a, b) => {
      const mid = (a + b) / 2;
      const ops = sides[sd].map((p) => ({ ...p, at: mid + p.at }));
      this.wall(axis, c, a, b, base, h, th, col, ops, ruin, o.mat || 'stone');
      // window frames + shutters (visual)
      for (const p of ops) {
        if (p.door) {
          if (axis === 'x') this.d({ t: 'box', x: p.at, y: base + 2.42, z: c, sx: p.w + 0.3, sy: 0.16, sz: th + 0.12, col: o.trim ?? '#6b4a33' });
          else this.d({ t: 'box', x: c, y: base + 2.42, z: p.at, sx: th + 0.12, sy: 0.16, sz: p.w + 0.3, col: o.trim ?? '#6b4a33' });
          continue;
        }
        const sh = o.shutter ?? '#4f7a6a';
        if (axis === 'x') {
          this.d({ t: 'box', x: p.at, y: base + p.y0 - 0.05, z: c, sx: p.w + 0.25, sy: 0.12, sz: th + 0.16, col: o.trim ?? '#6b4a33' });
          if (ruin < 0.5) { this.d({ t: 'box', x: p.at - p.w / 2 - 0.32, y: base + 1.52, z: c + (sd === 's' ? th / 2 + 0.03 : -th / 2 - 0.03), sx: 0.6, sy: 1.1, sz: 0.06, col: sh }); this.d({ t: 'box', x: p.at + p.w / 2 + 0.32, y: base + 1.52, z: c + (sd === 's' ? th / 2 + 0.03 : -th / 2 - 0.03), sx: 0.6, sy: 1.1, sz: 0.06, col: sh }); }
        } else {
          this.d({ t: 'box', x: c, y: base + p.y0 - 0.05, z: p.at, sx: th + 0.16, sy: 0.12, sz: p.w + 0.25, col: o.trim ?? '#6b4a33' });
          if (ruin < 0.5) { this.d({ t: 'box', x: c + (sd === 'e' ? th / 2 + 0.03 : -th / 2 - 0.03), y: base + 1.52, z: p.at - p.w / 2 - 0.32, sx: 0.06, sy: 1.1, sz: 0.6, col: sh }); this.d({ t: 'box', x: c + (sd === 'e' ? th / 2 + 0.03 : -th / 2 - 0.03), y: base + 1.52, z: p.at + p.w / 2 + 0.32, sx: 0.06, sy: 1.1, sz: 0.6, col: sh }); }
        }
      }
    };
    mk('n', 'x', z0 + th / 2, x0, x1);
    mk('s', 'x', z1 - th / 2, x0, x1);
    mk('w', 'z', x0 + th / 2, z0 + th, z1 - th);
    mk('e', 'z', x1 - th / 2, z0 + th, z1 - th);
    // floor
    this.rawBox(x0 + th, base, z0 + th, x1 - th, base + 0.22, z1 - th, o.floor ?? '#8a7560', { mat: 'wood' });
    // base trim strip (visual)
    this.d({ t: 'box', x: cx, y: base + 0.25, z: cz, sx: w + 0.08, sy: 0.5, sz: d + 0.08, col: o.plinth ?? '#8d8172' });
    if (ruin < 0.45 && o.roof !== 'none') {
      // roof: collision slab + stepped ridge, visual gable
      const along = w >= d ? 'x' : 'z';
      const span = along === 'x' ? d : w, len = along === 'x' ? w : d;
      const rh = span * 0.42;
      this.rawBox(x0 - 0.2, base + h, z0 - 0.2, x1 + 0.2, base + h + 0.3, z1 + 0.2, roofCol, { hidden: true, mat: 'wood' });
      if (along === 'x') this.rawBox(x0, base + h + 0.3, cz - span * 0.25, x1, base + h + rh * 0.55, cz + span * 0.25, roofCol, { hidden: true, mat: 'wood' });
      else this.rawBox(cx - span * 0.25, base + h + 0.3, z0, cx + span * 0.25, base + h + rh * 0.55, z1, roofCol, { hidden: true, mat: 'wood' });
      this.d({ t: 'prism', x: cx, y: base + h, z: cz, sx: span + 0.8, sy: rh, sz: len + 0.6, ry: along === 'x' ? Math.PI / 2 : 0, col: roofCol });
      // chimney
      if (this.r() < 0.6) this.d({ t: 'box', x: cx + (this.r() - 0.5) * w * 0.5, y: base + h + rh * 0.6, z: cz + (this.r() - 0.5) * d * 0.4, sx: 0.6, sy: rh * 0.9, sz: 0.6, col: '#7a6a5e' });
    } else if (ruin >= 0.45) {
      // charred beams + rubble inside
      for (let i = 0; i < 3; i++) this.d({ t: 'box', x: cx + (this.r() - 0.5) * w * 0.7, y: base + 0.5 + this.r() * 1.5, z: cz + (this.r() - 0.5) * d * 0.6, sx: 0.22, sy: 0.22, sz: Math.max(w, d) * 0.7, ry: this.r() * 3, rx: (this.r() - 0.5) * 0.9, col: '#3a2e28' });
      this.rubble(cx + (this.r() - 0.5) * w * 0.4, cz + (this.r() - 0.5) * d * 0.4, 1.6, col);
    }
    if (o.props !== false) {
      // interior cover: a table or crates
      const r = this.r();
      if (r < 0.5) this.crate(cx + (this.r() - 0.5) * (w - 3), cz + (this.r() - 0.5) * (d - 3), 0.9);
      else this.table(cx + (this.r() - 0.5) * (w - 3.5), cz + (this.r() - 0.5) * (d - 3.5));
    }
    return { base, h };
  }
  table(x, z) {
    const g = this.g(x, z);
    this.box(x, z, 1.6, 0.9, 0.85, '#7b5536', { mat: 'wood' });
    this.d({ t: 'box', x, y: g + 0.9, z, sx: 1.8, sy: 0.08, sz: 1.0, col: '#8e6542' });
  }
  crate(x, z, s = 1.0, col = '#9a7444', y) {
    const g = y ?? this.minG(x, z, s, s);
    this.rawBox(x - s / 2, g - 0.05, z - s / 2, x + s / 2, g + s, z + s / 2, col, { mat: 'wood' });
    this.d({ t: 'box', x, y: g + s / 2, z, sx: s + 0.04, sy: 0.1, sz: s + 0.04, col: '#6d5030' });
    return g + s;
  }
  crates(x, z, n = 3) {
    const s = 1.1;
    for (let i = 0; i < n; i++) {
      const ox = (i % 2) * s * 1.02 - s / 2, oz = Math.floor(i / 2) * s * 1.02 - s / 2;
      const top = this.crate(x + ox, z + oz, s);
      if (i === 0 && n >= 3) this.crate(x + ox + 0.1, z + oz, s * 0.9, '#8a6a40', top);
    }
  }
  barrel(x, z, col = '#4f6a3a') {
    const g = this.g(x, z);
    this.rawBox(x - 0.36, g - 0.05, z - 0.36, x + 0.36, g + 1.05, z + 0.36, col, { hidden: true, mat: 'metal' });
    this.d({ t: 'cyl', x, y: g + 0.5, z, sx: 0.4, sy: 1.0, sz: 0.4, seg: 8, col });
    this.d({ t: 'cyl', x, y: g + 0.3, z, sx: 0.42, sy: 0.07, sz: 0.42, seg: 8, col: '#333' });
    this.d({ t: 'cyl', x, y: g + 0.75, z, sx: 0.42, sy: 0.07, sz: 0.42, seg: 8, col: '#333' });
  }
  // sandbag wall along axis, centre x,z length L, height h (1.0 = crouch cover)
  sandbags(x, z, L, axis = 'x', h = 1.05, col = '#b49a6a') {
    const g = this.minG(x, z, axis === 'x' ? L : 0.9, axis === 'x' ? 0.9 : L);
    if (axis === 'x') this.rawBox(x - L / 2, g - 0.1, z - 0.45, x + L / 2, g + h, z + 0.45, col, { hidden: true, mat: 'sand' });
    else this.rawBox(x - 0.45, g - 0.1, z - L / 2, x + 0.45, g + h, z + L / 2, col, { hidden: true, mat: 'sand' });
    const rows = Math.round(h / 0.26);
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * 0.35;
      const n = Math.floor(L / 0.7);
      for (let i = 0; i < n; i++) {
        const a = -L / 2 + off + i * 0.7 + 0.35;
        if (a > L / 2 - 0.2) continue;
        const c = this.r() < 0.5 ? col : shade(col, 0.92);
        if (axis === 'x') this.d({ t: 'bag', x: x + a, y: g + r * 0.26 + 0.13, z, sx: 0.68, sy: 0.27, sz: 0.88 - r * 0.04, ry: (this.r() - 0.5) * 0.1, col: c });
        else this.d({ t: 'bag', x, y: g + r * 0.26 + 0.13, z: z + a, sx: 0.88 - r * 0.04, sy: 0.27, sz: 0.68, ry: (this.r() - 0.5) * 0.1, col: c });
      }
    }
  }
  // sandbag ring (U shape) around a point, opening toward `open` ('n','s','e','w')
  bagNest(x, z, s = 4, open = 's') {
    if (open !== 'n') this.sandbags(x, z - s / 2, s, 'x');
    if (open !== 's') this.sandbags(x, z + s / 2, s, 'x');
    if (open !== 'w') this.sandbags(x - s / 2, z, s - 0.9, 'z');
    if (open !== 'e') this.sandbags(x + s / 2, z, s - 0.9, 'z');
  }
  rubble(x, z, s, col = '#a89f90') {
    const g = this.g(x, z);
    this.rawBox(x - s * 0.55, g - 0.1, z - s * 0.45, x + s * 0.55, g + s * 0.55, z + s * 0.45, col, { hidden: true, mat: 'stone' });
    for (let i = 0; i < 6; i++) {
      this.d({ t: 'box', x: x + (this.r() - 0.5) * s * 1.1, y: g + this.r() * s * 0.35, z: z + (this.r() - 0.5) * s * 0.9, sx: 0.3 + this.r() * s * 0.5, sy: 0.25 + this.r() * 0.4, sz: 0.3 + this.r() * s * 0.4, ry: this.r() * 3, rx: (this.r() - 0.5) * 0.6, rz: (this.r() - 0.5) * 0.6, col: this.r() < 0.5 ? col : shade(col, 0.8) });
    }
  }
  rock(x, z, s, h, col = '#8c8378') {
    const g = this.g(x, z);
    this.rawBox(x - s * 0.42, g - 0.3, z - s * 0.42, x + s * 0.42, g + h * 0.9, z + s * 0.42, col, { hidden: true, mat: 'stone' });
    this.d({ t: 'ico', x, y: g + h * 0.42, z, sx: s * 0.62, sy: h * 0.62, sz: s * 0.62, ry: this.r() * 3, col, jit: 0.22 });
  }
  pine(x, z, s = 1) {
    const g = this.g(x, z);
    this.rawBox(x - 0.25 * s, g - 0.2, z - 0.25 * s, x + 0.25 * s, g + 4 * s, z + 0.25 * s, '#5b3d27', { hidden: true, mat: 'wood', walk: false });
    this.d({ t: 'cyl', x, y: g + 1.4 * s, z, sx: 0.24 * s, sy: 2.8 * s, sz: 0.24 * s, seg: 6, col: '#5b3d27' });
    const greens = ['#2f6b3c', '#2a5f37', '#367a43', '#2c6640'];
    const gc = greens[Math.floor(this.r() * greens.length)];
    for (let i = 0; i < 3; i++) this.d({ t: 'cone', x, y: g + (2.0 + i * 1.5) * s, z, sx: (2.2 - i * 0.55) * s, sy: 2.4 * s, sz: (2.2 - i * 0.55) * s, seg: 7, ry: this.r() * 3, col: i === 1 ? shade(gc, 1.08) : gc });
  }
  oak(x, z, s = 1, cols = ['#5d8a3a', '#6b9a40', '#4f7d35']) {
    const g = this.g(x, z);
    this.rawBox(x - 0.3 * s, g - 0.2, z - 0.3 * s, x + 0.3 * s, g + 3.2 * s, z + 0.3 * s, '#5b4030', { hidden: true, mat: 'wood', walk: false });
    this.d({ t: 'cyl', x, y: g + 1.4 * s, z, sx: 0.28 * s, sy: 2.8 * s, sz: 0.28 * s, seg: 6, col: '#5b4030' });
    const c = cols[Math.floor(this.r() * cols.length)];
    this.d({ t: 'ico', x, y: g + 3.6 * s, z, sx: 2.0 * s, sy: 1.7 * s, sz: 2.0 * s, ry: this.r() * 3, col: c, jit: 0.12 });
    this.d({ t: 'ico', x: x + 0.9 * s, y: g + 3.0 * s, z: z + 0.4 * s, sx: 1.2 * s, sy: 1.1 * s, sz: 1.2 * s, col: shade(c, 0.9), jit: 0.1 });
  }
  bush(x, z, s = 1, col = '#4d7a35') {
    const g = this.g(x, z);
    // soft: blocks sight, not bullets or movement
    this.rawBox(x - 0.8 * s, g, z - 0.8 * s, x + 0.8 * s, g + 1.15 * s, z + 0.8 * s, col, { hidden: true, solid: false, sight: true, walk: false, mat: 'foliage' });
    this.d({ t: 'ico', x, y: g + 0.55 * s, z, sx: 1.0 * s, sy: 0.75 * s, sz: 1.0 * s, ry: this.r() * 3, col, jit: 0.18 });
    this.d({ t: 'ico', x: x + 0.5 * s, y: g + 0.4 * s, z: z - 0.3 * s, sx: 0.6 * s, sy: 0.5 * s, sz: 0.6 * s, col: shade(col, 1.1), jit: 0.15 });
  }
  log(x, z, L, axis = 'x') {
    const g = this.g(x, z);
    if (axis === 'x') this.rawBox(x - L / 2, g - 0.1, z - 0.4, x + L / 2, g + 0.8, z + 0.4, '#6a4a30', { hidden: true, mat: 'wood' });
    else this.rawBox(x - 0.4, g - 0.1, z - L / 2, x + 0.4, g + 0.8, z + L / 2, '#6a4a30', { hidden: true, mat: 'wood' });
    this.d({ t: 'cyl', x, y: g + 0.4, z, sx: 0.42, sy: L, sz: 0.42, seg: 7, rz: axis === 'x' ? Math.PI / 2 : 0, rx: axis === 'z' ? Math.PI / 2 : 0, col: '#6a4a30' });
  }
  // staircase rising along dir from (x,z) to a top height; each step 0.45 x 0.7
  stairs(x, z, dir, topY, width, col, mat = 'stone') {
    const g = this.g(x, z);
    const n = Math.max(1, Math.ceil((topY - g) / 0.3));
    const dz = dir === 'n' ? -1 : dir === 's' ? 1 : 0, dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0;
    for (let i = 0; i < n; i++) {
      const cx = x + dx * (i * 0.7 + 0.35), cz = z + dz * (i * 0.7 + 0.35);
      const top = g + (topY - g) * ((i + 1) / (n + 1));
      if (dx) this.rawBox(cx - 0.35, g - 0.3, cz - width / 2, cx + 0.35, top, cz + width / 2, i % 2 ? col : shade(col, 0.94), { mat });
      else this.rawBox(cx - width / 2, g - 0.3, cz - 0.35, cx + width / 2, top, cz + 0.35, i % 2 ? col : shade(col, 0.94), { mat });
    }
    return n * 0.7;
  }
  // solid tower you can climb: block w x d of height h, stairs on side, parapet on top
  tower(x, z, w, d, h, stairSide, col, o = {}) {
    const g = this.minG(x, z, w, d) - 0.2;
    this.rawBox(x - w / 2, g, z - d / 2, x + w / 2, g + h, z + d / 2, col, { mat: o.mat || 'stone' });
    const pc = o.parapet ?? shade(col, 0.9);
    const ph = 0.95, pt = 0.3;
    // parapet with a gap at the stair top
    const gap = 2.0;
    const sides = { n: [x - w / 2, z - d / 2 + pt / 2, x + w / 2, 'x'], s: [x - w / 2, z + d / 2 - pt / 2, x + w / 2, 'x'], w: [x - w / 2 + pt / 2, z - d / 2, z + d / 2, 'z'], e: [x + w / 2 - pt / 2, z - d / 2, z + d / 2, 'z'] };
    for (const k of ['n', 's', 'w', 'e']) {
      const [a, c, b, axis] = sides[k];
      if (axis === 'x') {
        const ops = k === stairSide ? [{ at: x, w: gap, y0: 0, y1: 5 }] : [];
        this.wall('x', c, a, b, g + h, ph, pt, pc, ops, 0, o.mat || 'stone');
      } else {
        const ops = k === stairSide ? [{ at: z, w: gap, y0: 0, y1: 5 }] : [];
        this.wall('z', a, c, b, g + h, ph, pt, pc, ops, 0, o.mat || 'stone');
      }
    }
    // stairs go out from the stair side, back down to the ground
    const run = Math.ceil((h - 0.2) / 0.3) * 0.7;
    if (stairSide === 's') this.stairsDown(x, z + d / 2, 's', g + h, run, col, o.mat);
    if (stairSide === 'n') this.stairsDown(x, z - d / 2, 'n', g + h, run, col, o.mat);
    if (stairSide === 'e') this.stairsDown(x + w / 2, z, 'e', g + h, run, col, o.mat);
    if (stairSide === 'w') this.stairsDown(x - w / 2, z, 'w', g + h, run, col, o.mat);
    if (o.roof) {
      // posts + roof on top (visual + collision roof)
      const ry = g + h + 2.5;
      for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.rawBox(x + px * (w / 2 - 0.25) - 0.12, g + h, z + pz * (d / 2 - 0.25) - 0.12, x + px * (w / 2 - 0.25) + 0.12, ry, z + pz * (d / 2 - 0.25) + 0.12, '#5a4632', { mat: 'wood' });
      this.d({ t: 'cone', x, y: ry + 0.6, z, sx: Math.max(w, d) * 0.85, sy: 1.6, sz: Math.max(w, d) * 0.85, seg: 4, ry: Math.PI / 4, col: o.roof });
      this.rawBox(x - w / 2, ry, z - d / 2, x + w / 2, ry + 0.4, z + d / 2, o.roof, { hidden: true });
    }
    return g + h;
  }
  stairsDown(x, z, dir, topY, run, col, mat = 'stone') {
    const dx = dir === 'e' ? 1 : dir === 'w' ? -1 : 0, dz = dir === 's' ? 1 : dir === 'n' ? -1 : 0;
    const n = Math.round(run / 0.7);
    for (let i = 0; i < n; i++) {
      const cx = x + dx * (i * 0.7 + 0.35), cz = z + dz * (i * 0.7 + 0.35);
      const g = this.g(cx, cz) - 0.3;
      const top = topY - (topY - this.g(x + dx * run, z + dz * run)) * ((i + 1) / (n + 1));
      if (top <= g + 0.32) break;
      const c = i % 2 ? col : shade(col, 0.93);
      if (dx) this.rawBox(cx - 0.35, g, cz - 1.0, cx + 0.35, top, cz + 1.0, c, { mat });
      else this.rawBox(cx - 1.0, g, cz - 0.35, cx + 1.0, top, cz + 0.35, c, { mat });
    }
  }
  fence(x0, z0, x1, z1, col = '#7a5a3a') {
    const L = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(L / 2));
    for (let i = 0; i <= n; i++) {
      const x = x0 + (x1 - x0) * i / n, z = z0 + (z1 - z0) * i / n;
      this.d({ t: 'box', x, y: this.g(x, z) + 0.55, z, sx: 0.14, sy: 1.1, sz: 0.14, col });
    }
    const ry = Math.atan2(x1 - x0, z1 - z0);
    const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2, g = this.g(mx, mz);
    this.d({ t: 'box', x: mx, y: g + 0.85, z: mz, sx: 0.06, sy: 0.12, sz: L, ry, col });
    this.d({ t: 'box', x: mx, y: g + 0.45, z: mz, sx: 0.06, sy: 0.12, sz: L, ry, col });
  }
  wreck(x, z, axis = 'x', col = '#5a5f4a') {
    // burned-out truck: cab + bed + wheels; solid
    const g = this.g(x, z);
    const L = 5.2, Wd = 2.2;
    if (axis === 'x') { this.rawBox(x - L / 2, g - 0.1, z - Wd / 2, x + L / 2, g + 1.5, z + Wd / 2, col, { hidden: true, mat: 'metal' }); }
    else { this.rawBox(x - Wd / 2, g - 0.1, z - L / 2, x + Wd / 2, g + 1.5, z + L / 2, col, { hidden: true, mat: 'metal' }); }
    const ry = axis === 'x' ? 0 : Math.PI / 2;
    const cs = Math.cos(ry), sn = Math.sin(ry);
    const P = (lx, lz) => [x + lx * cs + lz * sn, z - lx * sn + lz * cs];
    let [px, pz] = P(-1.6, 0); this.d({ t: 'box', x: px, y: g + 1.25, z: pz, sx: 1.8, sy: 1.5, sz: 2.1, ry, col: shade(col, 0.85) });
    this.d({ t: 'box', x: px - (axis === 'x' ? 0.2 : 0), y: g + 1.75, z: pz, sx: 1.2, sy: 0.5, sz: 2.12, ry, col: '#2a2a2a' });
    [px, pz] = P(1.0, 0); this.d({ t: 'box', x: px, y: g + 0.95, z: pz, sx: 3.2, sy: 0.9, sz: 2.2, ry, col });
    [px, pz] = P(1.0, 0); this.d({ t: 'box', x: px, y: g + 0.55, z: pz, sx: 4.8, sy: 0.25, sz: 1.6, ry, col: '#2b2622' });
    for (const [lx, lz] of [[-1.7, -1.05], [-1.7, 1.05], [1.6, -1.05], [1.6, 1.05]]) {
      [px, pz] = P(lx, lz);
      this.d({ t: 'cyl', x: px, y: g + 0.42, z: pz, sx: 0.45, sy: 0.35, sz: 0.45, seg: 8, rx: Math.PI / 2, ry, col: '#1f1f1f' });
    }
  }
  tent(x, z, w, d, col = '#7d7a55') {
    const g = this.minG(x, z, w, d);
    this.rawBox(x - w / 2, g - 0.1, z - d / 2, x + w / 2, g + 1.8, z + d / 2, col, { hidden: true, mat: 'cloth' });
    this.d({ t: 'prism', x, y: g, z, sx: w, sy: 2.4, sz: d, col });
  }
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k)), g = Math.min(255, Math.round(((n >> 8) & 255) * k)), b = Math.min(255, Math.round((n & 255) * k));
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

function crater(x, z, cx, cz, r, depth) {
  const d = Math.hypot(x - cx, z - cz);
  if (d > r * 1.35) return 0;
  if (d < r) return -depth * (1 - (d / r) ** 2) + 0.25 * depth * (d / r) ** 4;
  return 0.25 * depth * (1 - (d - r) / (r * 0.35));
}

function finish(mb, def) {
  // invisible boundary walls
  const t = 2;
  mb.rawBox(-W / 2 - t, -5, -D / 2 - t, W / 2 + t, 30, -D / 2 + 1, '#000', { hidden: true });
  mb.rawBox(-W / 2 - t, -5, D / 2 - 1, W / 2 + t, 30, D / 2 + t, '#000', { hidden: true });
  mb.rawBox(-W / 2 - t, -5, -D / 2, -W / 2 + 1, 30, D / 2, '#000', { hidden: true });
  mb.rawBox(W / 2 - 1, -5, -D / 2, W / 2 + t, 30, D / 2, '#000', { hidden: true });
  return Object.assign({ w: W, d: D, boxes: mb.boxes, deco: mb.deco, ground: mb.ground }, def);
}

// helper: spawn points spread across a base
function baseSpawns(z, n = 10) {
  const out = [];
  for (let i = 0; i < n; i++) out.push({ x: -14 + (i % 5) * 7, z: z + (i < 5 ? 0 : (z > 0 ? 4 : -4)) });
  return out;
}

function baseCamp(mb, z, team, col) {
  const s = z > 0 ? 1 : -1;
  mb.tent(-20, z + 3 * s, 5, 4, col.tent);
  mb.tent(20, z + 3 * s, 5, 4, col.tent);
  mb.crates(-9, z - 6 * s, 3);
  mb.crates(10, z - 6 * s, 2);
  mb.sandbags(-4, z - 10 * s, 6, 'x');
  mb.sandbags(5, z - 10 * s, 5, 'x');
  // flag
  mb.d({ t: 'cyl', x: 0, y: mb.g(0, z + 6 * s) + 3, z: z + 6 * s, sx: 0.08, sy: 6, sz: 0.08, seg: 6, col: '#cccccc' });
  mb.d({ t: 'box', x: 0.75, y: mb.g(0, z + 6 * s) + 5.4, z: z + 6 * s, sx: 1.5, sy: 0.9, sz: 0.04, col: team === 0 ? '#3d7fd9' : '#e0582e', glow: true });
  // ammo crate (resupply)
  mb.box(-2.5, z - 6 * s, 1.4, 0.9, 0.8, '#4c5a32', { mat: 'wood' });
  mb.d({ t: 'box', x: -2.5, y: mb.g(-2.5, z - 6 * s) + 0.82, z: z - 6 * s, sx: 1.45, sy: 0.08, sz: 0.95, col: '#e8c33a' });
}

// ===================================================================================
// MAP 1: ASHFALL - a war-torn village at dusk
// ===================================================================================
function ashfall() {
  const n = noise2(11), n2 = noise2(12);
  const craters = [[-6, 22, 2.6, 0.8], [8, -18, 3, 0.9], [-24, -8, 2.4, 0.7], [26, 12, 2.6, 0.8], [3, 44, 2.2, 0.6], [-3, -46, 2.4, 0.7], [-40, 30, 2.5, 0.7], [38, -30, 2.4, 0.7]];
  const ground = (x, z) => {
    let h = (n(x * 0.05, z * 0.05) - 0.5) * 0.7 + (n2(x * 0.15, z * 0.15) - 0.5) * 0.15;
    // flatten the main roads
    const road = Math.min(Math.abs(x), Math.abs(z) < 5 ? 0 : 99);
    if (road < 6) h *= 0.3 + 0.7 * smooth(road / 6);
    for (const c of craters) h += crater(x, z, c[0], c[1], c[2], c[3]);
    return h + edgeRise(x, z);
  };
  const mb = new MB(ground, 101);
  const walls = ['#e2d3b0', '#d9b98e', '#d6a98a', '#cfc6b3', '#e6cfa4', '#c9b08c'];
  const roofs = ['#a8553a', '#9b4a33', '#b4653f', '#8f4b3a', '#a65e45'];
  const r = mb.r;
  const pick = (a) => a[Math.floor(r() * a.length)];
  // --- houses along the main street (x = +-11..+-18)
  const westRow = [[-15, 58, 8, 9], [-15, 46, 8, 8], [-15, 24, 8, 9], [-16, 12, 9, 7], [-15, -16, 8, 9], [-16, -26, 9, 8], [-15, -50, 8, 9], [-15, -60, 8, 7]];
  const eastRow = [[15, 60, 8, 8], [15, 48, 8, 9], [16, 26, 9, 8], [15, 14, 8, 7], [15, -14, 8, 8], [16, -28, 9, 9], [15, -44, 8, 8], [15, -58, 8, 9]];
  westRow.forEach(([x, z, w, d], i) => mb.house(x, z, w, d, { doors: [{ side: 'e', at: (r() - 0.5) * 0.6 }, { side: i % 2 ? 'w' : 'n', at: 0 }], col: pick(walls), roofCol: pick(roofs), ruin: [0, 0.2, 0.7, 0, 0.5, 0.1, 0, 0.6][i], windows: 1 }));
  eastRow.forEach(([x, z, w, d], i) => mb.house(x, z, w, d, { doors: [{ side: 'w', at: (r() - 0.5) * 0.6 }, { side: i % 2 ? 'e' : 's', at: 0 }], col: pick(walls), roofCol: pick(roofs), ruin: [0.1, 0, 0.6, 0.3, 0, 0.7, 0.2, 0][i], windows: 1 }));
  // --- central square (B) with a well, market stalls, a burned truck
  mb.box(0, 0, 2.4, 2.4, 1.0, '#9a948a', { mat: 'stone' }); // well
  mb.d({ t: 'box', x: 0, y: mb.g(0, 0) + 2.2, z: 0, sx: 2.8, sy: 0.2, sz: 1.2, col: '#6b4a33' });
  mb.d({ t: 'box', x: -1.1, y: mb.g(0, 0) + 1.6, z: 0, sx: 0.15, sy: 1.3, sz: 0.15, col: '#6b4a33' });
  mb.d({ t: 'box', x: 1.1, y: mb.g(0, 0) + 1.6, z: 0, sx: 0.15, sy: 1.3, sz: 0.15, col: '#6b4a33' });
  for (const [x, z, c] of [[-7, -6, '#c94f3d'], [7, 6, '#3d7fb8'], [-7, 7, '#d8a23a'], [7, -7, '#5b9a5a']]) {
    mb.box(x, z, 2.6, 1.2, 1.0, '#7b5536', { mat: 'wood' });
    mb.d({ t: 'prism', x, y: mb.g(x, z) + 2.2, z, sx: 1.8, sy: 0.6, sz: 3.0, ry: Math.PI / 2, col: c });
    for (const sx of [-1.2, 1.2]) mb.d({ t: 'box', x: x + sx, y: mb.g(x, z) + 1.1, z, sx: 0.1, sy: 2.2, sz: 0.1, col: '#5a4030' });
  }
  mb.wreck(4.5, -2.5, 'z');
  mb.sandbags(-4, 9.5, 4, 'x'); mb.sandbags(4, -10, 4, 'x');
  mb.rubble(-9, 1, 1.6); mb.rubble(9.5, -1, 1.4);
  // --- A: the farmyard (south-west, blue side): barn + stone walls + haystacks
  mb.house(-30, 40, 12, 9, { doors: [{ side: 'e', at: 0 }, { side: 'w', at: 0.2 }, { side: 'n', at: -0.2 }], col: '#a8573f', roofCol: '#5d4b3e', windows: 0.6, trim: '#e8dcc0', h: 3.6 });
  mb.wall('x', 30, -42, -36, mb.g(-39, 30), 1.2, 0.5, '#a39a8a', [], 0.3);
  mb.wall('x', 30, -30, -20, mb.g(-25, 30), 1.2, 0.5, '#a39a8a', [], 0.3);
  mb.wall('z', -20, 30, 36, mb.g(-20, 33), 1.2, 0.5, '#a39a8a', [], 0.2);
  mb.wall('z', -20, 44, 50, mb.g(-20, 47), 1.2, 0.5, '#a39a8a', [], 0.2);
  for (const [x, z] of [[-24, 33], [-36, 48], [-25, 47]]) { mb.box(x, z, 1.8, 1.8, 1.4, '#d9b85a', { mat: 'foliage' }); mb.d({ t: 'cyl', x, y: mb.g(x, z) + 0.7, z, sx: 1.0, sy: 1.4, sz: 1.0, seg: 8, rx: Math.PI / 2, col: '#e0c264' }); }
  mb.crates(-35, 34, 3);
  // granary tower (blue marksman perch)
  mb.tower(28, 36, 5, 5, 5.2, 'w', '#b9a487', { parapet: '#a8937a', roof: '#8f4b3a' });
  // --- C: ruined church (north-east, red side) with a bell tower
  mb.house(30, -42, 10, 16, { doors: [{ side: 's', at: 0 }, { side: 'w', at: -0.3 }, { side: 'w', at: 0.3 }], col: '#cfc6b3', ruin: 0.55, windows: 0.8, h: 4.2, props: false });
  for (let i = 0; i < 3; i++) mb.box(29 + (i % 2) * 2 - 1, -44 + i * 3, 3.2, 0.6, 0.85, '#6d4c30', { mat: 'wood' }); // pews
  mb.tower(30, -53.5, 4.5, 4.5, 7, 'w', '#bdb4a2', { parapet: '#a59b88', roof: '#6a5a4a' });
  // graveyard low walls + stones
  mb.wall('z', 40, -50, -34, mb.g(40, -42), 1.0, 0.5, '#a39a8a', [{ at: -42, w: 2.5, y0: 0, y1: 3 }], 0.2);
  for (let i = 0; i < 8; i++) { const x = 43 + (i % 4) * 2.4, z = -48 + Math.floor(i / 4) * 5; mb.box(x, z, 0.7, 0.25, 0.9, '#9c968c'); }
  // --- west orchard flank (rows of fruit trees, low walls)
  for (let zx = -58; zx <= 58; zx += 9) for (let xx = -50; xx <= -34; xx += 8) {
    if (Math.abs(zx - 40) < 12 && xx > -45) continue;
    mb.oak(xx + (r() - 0.5) * 2, zx + (r() - 0.5) * 2, 0.75, ['#6b8a3a', '#7a9440', '#5f8236']);
  }
  mb.wall('z', -27, -10, 4, mb.g(-27, -3), 1.1, 0.5, '#a39a8a', [], 0.4);
  mb.wall('z', -42, -36, -22, mb.g(-42, -29), 1.1, 0.5, '#a39a8a', [], 0.4);
  mb.wall('x', -12, -44, -32, mb.g(-38, -12), 1.1, 0.5, '#a39a8a', [], 0.4);
  mb.wreck(-36, 4, 'z', '#6a5a48');
  mb.sandbags(-30, 16, 5, 'x'); mb.sandbags(-38, -36, 5, 'x');
  // --- east back gardens: fences, sheds, hay
  mb.house(34, 18, 6, 6, { doors: [{ side: 'w', at: 0 }], col: '#c9b08c', roofCol: '#7a5a3a', windows: 0.5 });
  mb.house(36, -12, 7, 6, { doors: [{ side: 'w', at: 0 }, { side: 'e', at: 0 }], col: '#d6a98a', roofCol: '#9b4a33', ruin: 0.3 });
  mb.house(40, 2, 6, 7, { doors: [{ side: 's', at: 0 }], col: '#e2d3b0', roofCol: '#a8553a', ruin: 0.6 });
  mb.wall('x', 6, 26, 32, mb.g(29, 6), 1.1, 0.5, '#a39a8a', [], 0.3);
  mb.wall('x', -4, 44, 52, mb.g(48, -4), 1.1, 0.5, '#a39a8a', [], 0.3);
  mb.fence(24, 24, 24, 40); mb.fence(46, 10, 46, 30); mb.fence(24, -20, 24, -34);
  mb.crates(28, -22, 3); mb.crates(42, 26, 2); mb.barrel(30, -2); mb.barrel(31, -1.2, '#6a3a2a');
  mb.wreck(38, -24, 'x', '#4e5a52');
  // street clutter
  mb.wreck(-3.5, 32, 'z', '#5a4a3a'); mb.wreck(2.5, -30, 'z', '#3e4a5a');
  mb.sandbags(-2, 20, 3.5, 'x'); mb.sandbags(3, -22, 3.5, 'x');
  mb.rubble(5, 38, 1.3); mb.rubble(-5, -38, 1.3); mb.rubble(-7, 52, 1.2); mb.rubble(6, -54, 1.2);
  mb.barrel(-6, 15); mb.barrel(6, -15, '#6a3a2a');
  // street lamps + power poles (visual)
  for (let z = -60; z <= 60; z += 20) { mb.d({ t: 'cyl', x: 6.5, y: mb.g(6.5, z) + 3, z, sx: 0.1, sy: 6, sz: 0.1, seg: 5, col: '#3a3632' }); mb.d({ t: 'box', x: 5.9, y: mb.g(6.5, z) + 5.9, z, sx: 1.2, sy: 0.1, sz: 0.1, col: '#3a3632' }); mb.d({ t: 'box', x: 5.4, y: mb.g(6.5, z) + 5.75, z, sx: 0.35, sy: 0.2, sz: 0.25, col: '#ffd890', glow: true }); }
  baseCamp(mb, 70, 0, { tent: '#6f7a5a' });
  baseCamp(mb, -70, 1, { tent: '#7a6a55' });
  return finish(mb, {
    id: 'ashfall', name: 'ASHFALL', sub: 'War-torn village at dusk',
    gMax: 2.5,
    sky: { top: '#3c4f78', mid: '#d98b5f', bottom: '#f2c48a', fog: '#c98f6e', fogNear: 40, fogFar: 175, sun: [-0.55, 0.32, -0.45], sunCol: '#ffc48a', sunI: 2.4, hemiSky: '#9fb3d6', hemiGround: '#6a5240', hemiI: 1.15, exposure: 1.0 },
    groundCol: (x, z, h) => {
      const road = Math.abs(x) < 4.5 || (Math.abs(z) < 4 && Math.abs(x) < 34) || (Math.abs(x) < 13 && Math.abs(z) < 13);
      if (road) return ((Math.floor(x * 0.9) + Math.floor(z * 0.9)) & 1) ? '#8a8378' : '#958d80';
      if (h < -0.25) return '#4a3a2e';
      const v = n(x * 0.2, z * 0.2);
      return v < 0.35 ? '#7a7a45' : v < 0.6 ? '#87814b' : '#94875a';
    },
    points: [{ id: 'A', name: 'FARMYARD', x: -28, z: 38, r: 9 }, { id: 'B', name: 'SQUARE', x: 0, z: 0, r: 9 }, { id: 'C', name: 'CHURCH', x: 30, z: -42, r: 9 }],
    spawns: [baseSpawns(70), baseSpawns(-70)],
    regions: [['the square', 0, 0], ['the well', 0, 0], ['the farmyard', -28, 38], ['the barn', -30, 40], ['the church', 30, -42], ['the bell tower', 30, -53], ['the granary', 28, 36], ['the orchard', -42, 0], ['the gardens', 34, 0], ['main street south', 0, 30], ['main street north', 0, -30], ['their base', 0, -70], ['our base', 0, 70], ['the west houses', -15, 20], ['the east houses', 15, -20]],
  });
}

// ===================================================================================
// MAP 2: DUSTLINE - desert outpost, trench lines, mesas
// ===================================================================================
function dustline() {
  const n = noise2(21), n2 = noise2(22);
  const trenches = [
    [[-46, 30], [-30, 26], [-18, 31], [-4, 26], [10, 31], [24, 26], [40, 30]],
    [[-40, -30], [-24, -26], [-10, -31], [4, -26], [18, -31], [30, -26], [46, -30]],
  ];
  const hills = [[-44, 2, 11, 3.4], [44, -4, 11, 3.4], [-48, -52, 9, 2.4], [48, 52, 9, 2.4]];
  const ground = (x, z) => {
    let h = (n(x * 0.035, z * 0.035) - 0.5) * 1.3 + (n2(x * 0.1, z * 0.1) - 0.5) * 0.25;
    // flatten compound
    const cd = Math.max(Math.abs(x), Math.abs(z));
    if (cd < 22) h *= smooth(clamp((cd - 16) / 6, 0, 1));
    for (const [hx, hz, hr, hh] of hills) { const d = Math.hypot(x - hx, z - hz); if (d < hr) h += hh * smooth(1 - d / hr) * 1.0; }
    for (const tr of trenches) {
      let best = 99;
      for (let i = 0; i < tr.length - 1; i++) best = Math.min(best, segDist(x, z, tr[i][0], tr[i][1], tr[i + 1][0], tr[i + 1][1]));
      if (best < 4.2) h -= 1.35 * clamp((4.2 - best) / 3.0, 0, 1);
    }
    return h + edgeRise(x, z);
  };
  const mb = new MB(ground, 202);
  const r = mb.r;
  const concrete = '#bdb6a6', sand = '#c9a86e';
  // --- compound walls (30x30, gates in the middle of each side)
  const gb = mb.g(0, 0) - 0.1;
  const gate = (at) => [{ at, w: 6, y0: 0, y1: 9 }];
  mb.wall('x', -15, -15, 15, gb, 3.0, 0.8, concrete, gate(0), 0.15);
  mb.wall('x', 15, -15, 15, gb, 3.0, 0.8, concrete, gate(0), 0.15);
  mb.wall('z', -15, -14.6, 14.6, gb, 3.0, 0.8, concrete, gate(0), 0.15);
  mb.wall('z', 15, -14.6, 14.6, gb, 3.0, 0.8, concrete, gate(0), 0.15);
  // HESCO-style blocks at gates
  for (const [x, z] of [[-4.5, -18], [4.5, 18], [-18, 4.5], [18, -4.5]]) mb.box(x, z, 2, 2, 1.6, '#b59a68', { mat: 'sand' });
  // HQ building in the middle
  mb.house(-4, -3, 9, 7, { doors: [{ side: 's', at: 0 }, { side: 'n', at: 0.3 }, { side: 'e', at: 0 }], col: '#c7bda8', roof: 'flat', windows: 0.8, trim: '#7a7062', plinth: '#9a9080', shutter: '#6a7a7a', roofCol: '#a39888' });
  // corner guard posts (high ground, low)
  mb.tower(-11, -11, 4, 4, 3.0, 's', '#b8ae98', { parapet: '#a8a08a' });
  mb.tower(11, 11, 4, 4, 3.0, 'n', '#b8ae98', { parapet: '#a8a08a' });
  // containers
  const cont = (x, z, axis, col) => { if (axis === 'x') mb.box(x, z, 6, 2.4, 2.6, col, { mat: 'metal' }); else mb.box(x, z, 2.4, 6, 2.6, col, { mat: 'metal' }); for (let i = -2; i <= 2; i++) mb.d(axis === 'x' ? { t: 'box', x: x + i * 1.1, y: mb.g(x, z) + 1.3, z, sx: 0.12, sy: 2.5, sz: 2.46, col: shade(col, 0.85) } : { t: 'box', x, y: mb.g(x, z) + 1.3, z: z + i * 1.1, sx: 2.46, sy: 2.5, sz: 0.12, col: shade(col, 0.85) }); };
  cont(8, -7, 'z', '#a3553a'); cont(-10, 7, 'x', '#3d6a8a'); cont(30, 8, 'z', '#5a7a4a'); cont(-30, -8, 'z', '#a3553a');
  mb.sandbags(5, 4, 4, 'x'); mb.sandbags(-6, 10, 3.5, 'z'); mb.crates(9, 9, 3); mb.barrel(-12, -4, '#7a4a2a'); mb.barrel(-12.5, -2.8, '#7a4a2a');
  // --- trench lips: sandbags along the enemy-facing edge with gaps
  const lip = (tr, side) => {
    for (let i = 0; i < tr.length - 1; i++) {
      const [ax, az] = tr[i], [bx, bz] = tr[i + 1];
      const mx = (ax + bx) / 2, mz = (az + bz) / 2 + side * 3.3;
      if (i % 2 === 0) mb.sandbags(mx, mz, Math.abs(bx - ax) * 0.55, 'x', 0.8);
    }
  };
  lip(trenches[0], -1); lip(trenches[1], 1);
  // trench props
  for (const [x, z] of [[-30, 26], [10, 31], [-10, -31], [30, -26]]) mb.crates(x, z, 2);
  // trench planks (visual)
  for (const tr of trenches) for (let i = 0; i < tr.length - 1; i++) {
    const [ax, az] = tr[i], [bx, bz] = tr[i + 1];
    const L = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
    for (let k = 0.1; k < 1; k += 0.25) { const x = ax + (bx - ax) * k, z = az + (bz - az) * k; mb.d({ t: 'box', x, y: mb.g(x, z) + 0.05, z, sx: 1.5, sy: 0.08, sz: L * 0.22, ry, col: '#7a5a3a' }); }
  }
  // --- A: radar station (south-west)
  mb.house(-30, 47, 8, 6, { doors: [{ side: 'n', at: 0 }, { side: 'e', at: 0 }], col: '#bdb6a6', roof: 'flat', windows: 0.6, roofCol: '#a39888', trim: '#6a6a6a' });
  mb.d({ t: 'cyl', x: -22, y: mb.g(-22, 52) + 3, z: 52, sx: 0.25, sy: 6, sz: 0.25, seg: 6, col: '#888' });
  mb.d({ t: 'cone', x: -22, y: mb.g(-22, 52) + 6.4, z: 52, sx: 2.6, sy: 0.8, sz: 2.6, seg: 10, rx: 2.4, col: '#e0e0e0' });
  mb.box(-22, 52, 1.2, 1.2, 1.2, '#888', { mat: 'metal' });
  mb.bagNest(-24, 40, 4.5, 's'); mb.bagNest(-36, 40, 4, 'e');
  mb.wreck(-38, 50, 'z', '#8a7a5a');
  // --- C: fuel depot (north-east)
  for (const [x, z] of [[24, -48], [32, -48], [24, -40]]) { mb.box(x, z, 5, 5, 3.6, '#d0cfc8', { mat: 'metal', hidden: true }); mb.d({ t: 'cyl', x, y: mb.g(x, z) + 1.8, z, sx: 2.6, sy: 3.6, sz: 2.6, seg: 12, col: '#d8d6cc' }); mb.d({ t: 'cyl', x, y: mb.g(x, z) + 3.65, z, sx: 2.4, sy: 0.15, sz: 2.4, seg: 12, col: '#b04030' }); }
  mb.house(36, -38, 6, 6, { doors: [{ side: 'w', at: 0 }, { side: 's', at: 0 }], col: '#bdb6a6', roof: 'flat', windows: 0.6, roofCol: '#a39888' });
  mb.bagNest(30, -34, 4.5, 'n'); mb.barrel(20, -36); mb.barrel(20.8, -35.3); mb.barrel(28, -43, '#7a4a2a');
  // --- mesa outcrops (big rocks), and rock cover in the lanes
  const rockCol = ['#b0703f', '#a8673a', '#bc7d4a'];
  mb.rock(-44, 2, 7, 3.2, rockCol[0]); mb.rock(44, -4, 7, 3.2, rockCol[1]);
  // stairs onto the mesas (worn rock steps)
  mb.tower(-44, -10, 5, 5, 4.5, 'n', '#a8673a', { mat: 'stone', parapet: '#9a5e36' });
  mb.tower(44, 8, 5, 5, 4.5, 's', '#a8673a', { mat: 'stone', parapet: '#9a5e36' });
  for (let i = 0; i < 22; i++) {
    const x = (r() - 0.5) * 104, z = (r() - 0.5) * 136;
    if (Math.max(Math.abs(x), Math.abs(z)) < 22 || Math.abs(z) > 62) continue;
    if (Math.abs(Math.abs(z) - 28) < 6) continue;
    mb.rock(x, z, 1.6 + r() * 2.2, 1.0 + r() * 1.4, rockCol[i % 3]);
  }
  mb.wreck(-6, 40, 'x', '#7a6a4a'); mb.wreck(8, -42, 'x', '#6a6a5a'); mb.wreck(36, 24, 'z', '#5a5a4a'); mb.wreck(-34, -24, 'z', '#7a6a4a');
  // dead shrubs / cacti (visual)
  for (let i = 0; i < 40; i++) { const x = (r() - 0.5) * 108, z = (r() - 0.5) * 144; if (Math.max(Math.abs(x), Math.abs(z)) < 18) continue; mb.d({ t: 'ico', x, y: mb.g(x, z) + 0.25, z, sx: 0.45, sy: 0.35, sz: 0.45, col: '#8a8a4a', jit: 0.3 }); }
  // barbed wire (visual)
  for (const [x, z] of [[-20, 20], [20, -20], [-8, 36], [8, -36]]) for (let k = -2; k <= 2; k++) mb.d({ t: 'box', x: x + k * 1.5, y: mb.g(x + k * 1.5, z) + 0.5, z, sx: 0.08, sy: 1.0, sz: 0.08, rz: 0.3 * (k % 2 ? 1 : -1), col: '#4a4a4a' });
  baseCamp(mb, 70, 0, { tent: '#8a8060' });
  baseCamp(mb, -70, 1, { tent: '#8a7460' });
  return finish(mb, {
    id: 'dustline', name: 'DUSTLINE', sub: 'Desert outpost and trench lines',
    gMax: 6,
    sky: { top: '#4a86c8', mid: '#a9c8e0', bottom: '#f0dcb0', fog: '#e3cfa6', fogNear: 50, fogFar: 200, sun: [0.45, 0.8, 0.3], sunCol: '#fff1d6', sunI: 2.9, hemiSky: '#b8d0e8', hemiGround: '#a08050', hemiI: 1.25, exposure: 1.0 },
    groundCol: (x, z, h) => {
      if (Math.max(Math.abs(x), Math.abs(z)) < 15) return ((Math.floor(x / 2) + Math.floor(z / 2)) & 1) ? '#b8ab90' : '#c2b59a';
      if (h < -0.6) return '#a88552';
      const v = n2(x * 0.3, z * 0.3);
      return v < 0.3 ? '#d2ad72' : v < 0.65 ? '#dbb87c' : '#e2c088';
    },
    points: [{ id: 'A', name: 'RADAR', x: -28, z: 45, r: 9 }, { id: 'B', name: 'OUTPOST', x: 0, z: 0, r: 10 }, { id: 'C', name: 'DEPOT', x: 28, z: -43, r: 9 }],
    spawns: [baseSpawns(70), baseSpawns(-70)],
    regions: [['the outpost', 0, 0], ['the HQ', -4, -3], ['the radar', -28, 45], ['the depot', 28, -43], ['the west mesa', -44, 0], ['the east mesa', 44, 0], ['our trench', 0, 28], ['their trench', 0, -28], ['the south gate', 0, 15], ['the north gate', 0, -15], ['the west gate', -15, 0], ['the east gate', 15, 0], ['their base', 0, -70], ['our base', 0, 70]],
  });
}

// ===================================================================================
// MAP 3: GREENWATER - forest river crossing
// ===================================================================================
export function riverZ(x) { return 5 * Math.sin(x / 22) + 2 * Math.sin(x / 9); }
function greenwater() {
  const n = noise2(31), n2 = noise2(32);
  const hill = [44, 30, 15, 4.6], hill2 = [-46, -30, 13, 3.6];
  const ground = (x, z) => {
    let h = (n(x * 0.04, z * 0.04) - 0.5) * 1.0 + (n2(x * 0.12, z * 0.12) - 0.5) * 0.3;
    const d = Math.abs(z - riverZ(x));
    let depth = 1.75;
    if (x > 28 && x < 42) depth = 0.85; // the ford
    if (d < 9.5) h = h * smooth(clamp((d - 5) / 4.5, 0, 1)) - depth * (1 - smooth(clamp((d - 4.5) / 5, 0, 1)));
    for (const [hx, hz, hr, hh] of [hill, hill2]) { const dd = Math.hypot(x - hx, z - hz); if (dd < hr) h += hh * smooth(1 - dd / hr); }
    return h + edgeRise(x, z);
  };
  const mb = new MB(ground, 303);
  const r = mb.r;
  // --- stone bridge (B)
  const bz0 = -11, bz1 = 11;
  mb.rawBox(-3.6, -3, bz0, 3.6, 0.3, bz1, '#9a948a', { mat: 'stone' });
  mb.wall('z', -3.3, bz0 + 1, bz1 - 1, 0.3, 1.0, 0.6, '#8a847a', [], 0.15);
  mb.wall('z', 3.3, bz0 + 1, bz1 - 1, 0.3, 1.0, 0.6, '#8a847a', [], 0.15);
  // arches (visual)
  for (const z of [-4, 4]) mb.d({ t: 'box', x: 0, y: -1.2, z, sx: 7.4, sy: 1.6, sz: 1.2, col: '#7a746a' });
  // approach ramps blend: small sandbag posts on each bank
  mb.sandbags(-5.5, 13.5, 3, 'x'); mb.sandbags(5.5, -13.5, 3, 'x');
  mb.sandbags(6, 14, 3, 'z'); mb.sandbags(-6, -14, 3, 'z');
  mb.wreck(-8, 17, 'x', '#4a5a4a'); mb.wreck(9, -18, 'x', '#5a4a3a');
  // --- west wooden footbridge
  const wz = riverZ(-38);
  mb.rawBox(-39.4, -3, wz - 10, -36.6, 0.2, wz + 10, '#7a5a3a', { mat: 'wood' });
  for (let z = wz - 9; z <= wz + 9; z += 2) { mb.d({ t: 'box', x: -39.6, y: 0.7, z, sx: 0.12, sy: 1.0, sz: 0.12, col: '#5a4030' }); mb.d({ t: 'box', x: -36.4, y: 0.7, z, sx: 0.12, sy: 1.0, sz: 0.12, col: '#5a4030' }); }
  mb.d({ t: 'box', x: -39.6, y: 1.15, z: wz, sx: 0.08, sy: 0.08, sz: 19, col: '#5a4030' }); mb.d({ t: 'box', x: -36.4, y: 1.15, z: wz, sx: 0.08, sy: 0.08, sz: 19, col: '#5a4030' });
  // --- ford rocks (east)
  for (let i = 0; i < 6; i++) { const x = 30 + i * 2.2, z = riverZ(30 + i * 2.2) + (r() - 0.5) * 6; mb.rock(x, z, 1.6 + r(), 1.0 + r() * 0.6, '#7a7a74'); }
  // --- A: sawmill (south-west, blue)
  mb.house(-22, 44, 12, 8, { doors: [{ side: 'n', at: 0 }, { side: 'e', at: 0 }, { side: 's', at: -0.3 }], col: '#8a6440', roofCol: '#4a5a3a', windows: 0.6, mat: 'wood', trim: '#5a4030', plinth: '#6a5a4a', floor: '#6a5038' });
  mb.log(-30, 36, 6, 'x'); mb.log(-30, 37.2, 6, 'x'); mb.log(-14, 34, 7, 'z');
  mb.log(-20, 33, 5, 'x');
  mb.crates(-10, 46, 3); mb.sandbags(-24, 33, 4, 'x');
  // saw shed (open roof on posts)
  for (const [x, z] of [[-34, 46], [-34, 52], [-28, 46], [-28, 52]]) mb.box(x, z, 0.3, 0.3, 3.2, '#5a4030', { mat: 'wood', walk: false });
  mb.d({ t: 'prism', x: -31, y: mb.g(-31, 49) + 3.2, z: 49, sx: 7.4, sy: 1.6, sz: 7.4, col: '#5a6a4a' });
  mb.box(-31, 49, 2.5, 1.2, 1.0, '#7a6a5a', { mat: 'metal' });
  // --- C: ranger station + lookout tower (north-east, red)
  mb.house(24, -44, 9, 7, { doors: [{ side: 's', at: 0 }, { side: 'w', at: 0.2 }], col: '#7a5236', roofCol: '#7a3a2a', windows: 0.8, mat: 'wood', trim: '#e8dcc0', floor: '#6a5038' });
  mb.house(34, -36, 6, 5, { doors: [{ side: 'w', at: 0 }], col: '#8a6440', roofCol: '#4a5a3a', windows: 0.6, mat: 'wood', trim: '#e8dcc0' });
  mb.tower(16, -52, 4.5, 4.5, 6.5, 's', '#8a847a', { parapet: '#6a5a4a', roof: '#7a3a2a' });
  mb.log(28, -34, 5, 'x'); mb.sandbags(20, -36, 4, 'x'); mb.crates(30, -48, 2);
  // --- hill ruins (east, high ground) and west hill
  mb.wall('x', 30, 38, 48, mb.g(43, 30), 1.6, 0.6, '#9a948a', [{ at: 42, w: 2.4, y0: 0, y1: 4 }], 0.5);
  mb.wall('z', 38, 31, 38, mb.g(38, 34), 1.2, 0.6, '#9a948a', [], 0.5);
  mb.wall('x', -30, -50, -42, mb.g(-46, -30), 1.4, 0.6, '#9a948a', [], 0.5);
  // --- forest
  const clear = [[-22, 42, 13], [24, -42, 13], [0, 0, 14], [0, 68, 16], [0, -68, 16], [-38, wz, 10], [35, 0, 9], [44, 31, 7]];
  const trail = (x, z) => Math.min(Math.abs(x - 6 * Math.sin(z / 18)) - 2.5, segDist(x, z, -38, wz + 10, -24, 36) - 2, segDist(x, z, -38, wz - 10, -20, -40) - 2, segDist(x, z, 35, -8, 26, -36) - 2, segDist(x, z, 35, 8, 40, 40) - 2);
  let placed = 0;
  for (let tries = 0; tries < 2200 && placed < 210; tries++) {
    const x = (r() - 0.5) * 108, z = (r() - 0.5) * 146;
    if (Math.abs(z - riverZ(x)) < 10) continue;
    if (clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr)) continue;
    if (trail(x, z) < 1.5) continue;
    if (mb.boxes.some((b) => x > b.x0 - 2 && x < b.x1 + 2 && z > b.z0 - 2 && z < b.z1 + 2 && !b.hidden)) continue;
    const k = r();
    if (k < 0.55) mb.pine(x, z, 0.85 + r() * 0.5); else if (k < 0.8) mb.oak(x, z, 0.8 + r() * 0.4); else mb.bush(x, z, 0.8 + r() * 0.6, r() < 0.5 ? '#4d7a35' : '#5a8a3a');
    placed++;
  }
  for (let i = 0; i < 26; i++) {
    const x = (r() - 0.5) * 104, z = (r() - 0.5) * 140;
    if (Math.abs(z - riverZ(x)) < 9 || clear.some(([cx, cz, cr]) => Math.hypot(x - cx, z - cz) < cr * 0.7)) continue;
    if (i % 3 === 0) mb.log(x, z, 3 + r() * 3, r() < 0.5 ? 'x' : 'z'); else mb.rock(x, z, 1.4 + r() * 1.8, 0.9 + r() * 1.2, '#8a8a80');
  }
  // riverside reeds (visual)
  for (let i = 0; i < 70; i++) { const x = (r() - 0.5) * 110, s = r() < 0.5 ? -1 : 1, z = riverZ(x) + s * (6 + r() * 2.5); mb.d({ t: 'cone', x, y: mb.g(x, z) + 0.5, z, sx: 0.25, sy: 1.1, sz: 0.25, seg: 4, col: '#7a9a4a' }); }
  baseCamp(mb, 70, 0, { tent: '#5a6a4a' });
  baseCamp(mb, -70, 1, { tent: '#6a5a4a' });
  return finish(mb, {
    id: 'greenwater', name: 'GREENWATER', sub: 'Forest river crossing',
    gMax: 7, waterY: -0.55,
    sky: { top: '#5d8fc4', mid: '#a8c8d8', bottom: '#d8e4d0', fog: '#a9c2b8', fogNear: 35, fogFar: 165, sun: [-0.4, 0.62, 0.5], sunCol: '#fff4dc', sunI: 2.5, hemiSky: '#c0d8e8', hemiGround: '#4a5a32', hemiI: 1.2, exposure: 1.0 },
    groundCol: (x, z, h) => {
      if (h < -0.4) return h < -1.2 ? '#6a6050' : '#7a7058';
      if (trail(x, z) < 0.3) return '#8a7050';
      const v = n2(x * 0.25, z * 0.25);
      return v < 0.33 ? '#4f7a32' : v < 0.66 ? '#5a8638' : '#66923e';
    },
    points: [{ id: 'A', name: 'SAWMILL', x: -22, z: 42, r: 9 }, { id: 'B', name: 'BRIDGE', x: 0, z: 0, r: 9 }, { id: 'C', name: 'RANGERS', x: 24, z: -42, r: 9 }],
    spawns: [baseSpawns(70), baseSpawns(-70)],
    regions: [['the bridge', 0, 0], ['the sawmill', -22, 44], ['the ranger station', 24, -44], ['the lookout tower', 16, -52], ['the footbridge', -38, wz], ['the ford', 35, 0], ['the east hill', 44, 30], ['the west hill', -46, -30], ['the south bank', 0, 14], ['the north bank', 0, -14], ['their base', 0, -70], ['our base', 0, 70]],
  });
}

export const MAPS = [
  { id: 'ashfall', name: 'ASHFALL', sub: 'War-torn village at dusk', make: ashfall, col: '#d98b5f' },
  { id: 'dustline', name: 'DUSTLINE', sub: 'Desert outpost, trenches, mesas', make: dustline, col: '#dbb87c' },
  { id: 'greenwater', name: 'GREENWATER', sub: 'Forest river and bridges', make: greenwater, col: '#5a8638' },
];
const cache = {};
export function getMap(id) {
  if (!cache[id]) cache[id] = (MAPS.find((m) => m.id === id) || MAPS[0]).make();
  return cache[id];
}
