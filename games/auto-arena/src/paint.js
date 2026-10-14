// paint.js - the watercolor kit everything in Inkvale is drawn with.
//
// The wash technique is Tyler Hobbs' "stacked deformed polygons": deform a
// shape once into a base, then stack many low-alpha copies that are each
// deformed a little more. Where the copies agree the paint is dense; at the
// ragged edges only a few copies reach, so the colour fades out the way a wet
// wash does. A darker stroke along the base outline fakes edge-darkening (the
// pigment that piles up where the water dries last).
//
// Everything takes a seeded random source so a map or a sprite paints the
// same way every time.

export function rng(seed = 1) {
  let a = (seed * 2654435761) >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + f() * (hi - lo);
  f.int = (lo, hi) => Math.floor(lo + f() * (hi - lo + 1));
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = f();
    while (v === 0) v = f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  return f;
}

// ---------- colour ----------
const cache = new Map();
export function rgb(hex) {
  let c = cache.get(hex);
  if (c) return c;
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  cache.set(hex, c);
  return c;
}
export function rgba(col, a = 1) {
  const [r, g, b] = typeof col === 'string' ? rgb(col) : col;
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}
// f < 0 darkens toward ink, f > 0 lightens toward paper
export function shade(col, f) {
  const c = typeof col === 'string' ? rgb(col) : col;
  if (f < 0) return c.map((v, i) => v * (1 + f) + [40, 30, 50][i] * -f * 0.6);
  return c.map((v) => v + (250 - v) * f);
}
export function mix(a, b, t) {
  const A = typeof a === 'string' ? rgb(a) : a, B = typeof b === 'string' ? rgb(b) : b;
  return A.map((v, i) => v + (B[i] - v) * t);
}
export function hex(c) {
  return '#' + c.map(v => Math.max(0, Math.min(255, v | 0)).toString(16).padStart(2, '0')).join('');
}

export const INK = '#2a2230';

// ---------- shapes ----------
export function ellipsePts(cx, cy, rx, ry, n = 14, rot = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push({ x: cx + x * Math.cos(rot) - y * Math.sin(rot), y: cy + x * Math.sin(rot) + y * Math.cos(rot) });
  }
  return out;
}
export function rectPts(x, y, w, h) {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}
export function P(arr) { // [[x,y],...] -> [{x,y}]
  return arr.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p);
}

// Recursive midpoint displacement. Each vertex carries its own variance `v`,
// so one shape can be ragged on one side and tidy on the other.
export function deform(pts, depth, amt, R, closed = true) {
  let cur = pts.map(p => ({ x: p.x, y: p.y, v: p.v ?? 1 }));
  for (let d = 0; d < depth; d++) {
    const nxt = [];
    const n = cur.length;
    const segs = closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const a = cur[i], c = cur[(i + 1) % n];
      nxt.push(a);
      const len = Math.hypot(c.x - a.x, c.y - a.y);
      const v = (a.v + c.v) / 2 * (0.7 + R() * 0.4);
      const s = len * amt * v * 0.5;
      nxt.push({ x: (a.x + c.x) / 2 + R.gauss() * s, y: (a.y + c.y) / 2 + R.gauss() * s, v });
    }
    if (!closed) nxt.push(cur[n - 1]);
    cur = nxt;
  }
  return cur;
}

export function tracePoly(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

// smooth closed curve through points (quadratic midpoints)
export function traceSmooth(ctx, pts, closed = true) {
  const n = pts.length;
  ctx.beginPath();
  if (!closed) {
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < n - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
    return;
  }
  const m0x = (pts[n - 1].x + pts[0].x) / 2, m0y = (pts[n - 1].y + pts[0].y) / 2;
  ctx.moveTo(m0x, m0y);
  for (let i = 0; i < n; i++) {
    const p = pts[i], q = pts[(i + 1) % n];
    ctx.quadraticCurveTo(p.x, p.y, (p.x + q.x) / 2, (p.y + q.y) / 2);
  }
  ctx.closePath();
}

// ---------- the wash ----------
// opts: layers, alpha, amt (raggedness), edge (0..1 edge darkening), base depth
export function wash(ctx, pts, col, R, o = {}) {
  const layers = o.layers ?? 18;
  const alpha = o.alpha ?? 0.06;
  const amt = o.amt ?? 0.35;
  const base = deform(pts, o.depth ?? 2, amt, R);
  const c = typeof col === 'string' ? rgb(col) : col;
  ctx.save();
  ctx.fillStyle = rgba(c, alpha);
  for (let i = 0; i < layers; i++) {
    const p = deform(base, o.layerDepth ?? 2, amt * 0.55, R);
    tracePoly(ctx, p);
    ctx.fill();
  }
  if ((o.edge ?? 0.5) > 0) {
    ctx.strokeStyle = rgba(shade(c, -0.35), (o.edge ?? 0.5) * 0.5);
    ctx.lineWidth = o.edgeW ?? 1.1;
    ctx.lineJoin = 'round';
    tracePoly(ctx, deform(base, 1, amt * 0.2, R));
    ctx.stroke();
  }
  if (o.granulate) granulate(ctx, base, c, R, o.granulate);
  ctx.restore();
  return base;
}

// pigment specks that settle into the paper inside a shape
export function granulate(ctx, pts, c, R, amount = 1) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  ctx.save();
  tracePoly(ctx, pts);
  ctx.clip();
  const n = Math.min(4000, ((x1 - x0) * (y1 - y0)) / 40 * amount);
  const dark = shade(c, -0.3);
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = rgba(dark, R() * 0.18);
    const r = R() * 1.3 + 0.3;
    ctx.fillRect(x0 + R() * (x1 - x0), y0 + R() * (y1 - y0), r, r);
  }
  ctx.restore();
}

// A cheap, fast wash for sprites: few layers, high alpha, tighter edges.
export function dab(ctx, pts, col, R, o = {}) {
  return wash(ctx, pts, col, R, {
    layers: o.layers ?? 5, alpha: o.alpha ?? 0.32, amt: o.amt ?? 0.12, depth: 1, layerDepth: 1,
    edge: o.edge ?? 0.9, edgeW: o.edgeW ?? 0.8,
  });
}

// ---------- ink ----------
// Wobbly pen line. Resamples the polyline and draws it as short segments whose
// width breathes, so it reads as a dip pen, not a vector stroke.
export function ink(ctx, pts, R, o = {}) {
  const w = o.w ?? 1.4;
  const col = o.color ?? INK;
  const jit = o.jitter ?? 0.6;
  const closed = o.closed ?? false;
  const src = closed ? [...pts, pts[0]] : pts;
  const out = [];
  for (let i = 0; i < src.length - 1; i++) {
    const a = src[i], b = src[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / (o.step ?? 4)));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }
  out.push(src[src.length - 1]);
  // low-frequency wobble
  let ox = 0, oy = 0;
  for (const p of out) {
    ox = ox * 0.8 + R.gauss() * jit * 0.35;
    oy = oy * 0.8 + R.gauss() * jit * 0.35;
    p.x += ox; p.y += oy;
  }
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = typeof col === 'string' ? col : rgba(col, 1);
  ctx.globalAlpha *= o.alpha ?? 0.92;
  let width = w;
  for (let i = 0; i < out.length - 1; i++) {
    width = Math.max(w * 0.35, Math.min(w * 1.5, width + R.gauss() * w * 0.12));
    // taper the ends of open lines
    const t = i / (out.length - 1);
    const taper = closed || o.noTaper ? 1 : Math.min(1, t * 6, (1 - t) * 6) * 0.7 + 0.3;
    ctx.lineWidth = width * taper;
    ctx.beginPath();
    ctx.moveTo(out[i].x, out[i].y);
    ctx.lineTo(out[i + 1].x, out[i + 1].y);
    ctx.stroke();
  }
  ctx.restore();
}

export function inkPoly(ctx, pts, R, o = {}) { ink(ctx, pts, R, { ...o, closed: true }); }

// ---------- splats & drops ----------
export function splat(ctx, x, y, r, col, R, o = {}) {
  wash(ctx, ellipsePts(x, y, r, r * (o.squash ?? 0.75), 10), col, R, {
    layers: o.layers ?? 10, alpha: o.alpha ?? 0.12, amt: 0.6, edge: 0.7, depth: 2, layerDepth: 1,
  });
  const drops = o.drops ?? 6;
  ctx.save();
  for (let i = 0; i < drops; i++) {
    const a = R() * Math.PI * 2, d = r * (1.1 + R() * 0.9);
    const rr = r * (0.06 + R() * 0.12);
    ctx.fillStyle = rgba(col, 0.35 + R() * 0.3);
    ctx.beginPath();
    ctx.ellipse(x + Math.cos(a) * d, y + Math.sin(a) * d * (o.squash ?? 0.75), rr, rr * 0.85, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- paper ----------
export function makeCanvas(w, h) {
  const c = typeof OffscreenCanvas !== 'undefined' && false ? new OffscreenCanvas(w, h) : document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  return c;
}

// value noise, used for paper blotches and terrain variation
export function noise2(seed = 7) {
  const R = rng(seed);
  const N = 256, perm = new Uint8Array(N * 2), val = new Float32Array(N);
  for (let i = 0; i < N; i++) { perm[i] = i; val[i] = R(); }
  for (let i = N - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [perm[i], perm[j]] = [perm[j], perm[i]]; }
  for (let i = 0; i < N; i++) perm[i + N] = perm[i];
  const sm = t => t * t * (3 - 2 * t);
  const at = (x, y) => val[perm[(perm[x & 255] + y) & 255]];
  const n = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    const a = at(xi, yi), b = at(xi + 1, yi), c = at(xi, yi + 1), d = at(xi + 1, yi + 1);
    const u = sm(xf), v = sm(yf);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  n.fbm = (x, y, oct = 4) => {
    let s = 0, amp = 0.5, f = 1, norm = 0;
    for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * amp; norm += amp; amp *= 0.5; f *= 2; }
    return s / norm;
  };
  return n;
}

// A tile of cold-press paper: blotchy warm base, fibres, pits.
// Used as the base of every map and as a multiply overlay over the whole frame.
export function paperTile(size = 512, seed = 3, o = {}) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const nz = noise2(seed);
  const base = rgb(o.base ?? '#f4ecd8');
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // tileable: blend noise at wrapped positions
      const fx = x / size, fy = y / size;
      const s = 6;
      const n1 = nz.fbm(fx * s, fy * s, 4), n2 = nz.fbm((fx - 1) * s, fy * s, 4);
      const n3 = nz.fbm(fx * s, (fy - 1) * s, 4), n4 = nz.fbm((fx - 1) * s, (fy - 1) * s, 4);
      const n = (n1 * (1 - fx) + n2 * fx) * (1 - fy) + (n3 * (1 - fx) + n4 * fx) * fy;
      const grain = (Math.random() - 0.5) * 10;
      const k = (n - 0.5) * 26 + grain;
      const i = (y * size + x) * 4;
      img.data[i] = base[0] + k; img.data[i + 1] = base[1] + k * 0.95; img.data[i + 2] = base[2] + k * 0.85; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const R = rng(seed + 11);
  // fibres
  g.lineCap = 'round';
  for (let i = 0; i < 260; i++) {
    const x = R() * size, y = R() * size, a = R() * Math.PI, l = 3 + R() * 9;
    g.strokeStyle = `rgba(${R() < 0.5 ? '120,100,80' : '255,255,245'},${0.05 + R() * 0.08})`;
    g.lineWidth = 0.6;
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + R() * 2, y + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  return c;
}

// Multiply-mode grain to lay over the finished frame so sprites, UI and map
// all sit "in" the same sheet of paper.
export function grainTile(size = 256, seed = 5) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  const nz = noise2(seed);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const fx = x / size, fy = y / size, s = 16;
    const n1 = nz.fbm(fx * s, fy * s, 3), n2 = nz.fbm((fx - 1) * s, fy * s, 3);
    const n3 = nz.fbm(fx * s, (fy - 1) * s, 3), n4 = nz.fbm((fx - 1) * s, (fy - 1) * s, 3);
    const n = (n1 * (1 - fx) + n2 * fx) * (1 - fy) + (n3 * (1 - fx) + n4 * fx) * fy;
    const v = 255 - Math.max(0, (n - 0.35)) * 40 - Math.random() * 14;
    const i = (y * size + x) * 4;
    img.data[i] = v; img.data[i + 1] = v * 0.985; img.data[i + 2] = v * 0.95; img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}

// Darken the corners of a canvas like a soaked sheet whose edges dried slower.
export function vignette(ctx, w, h, strength = 0.35, col = [90, 60, 40]) {
  const g = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, rgba(col, 0));
  g.addColorStop(1, rgba(col, strength));
  ctx.save();
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Torn/deckled paper card used for panels and tooltips.
export function paperCard(ctx, x, y, w, h, R, o = {}) {
  const pts = [];
  const step = 10;
  for (let i = 0; i <= w; i += step) pts.push({ x: x + i, y: y + R.gauss() * 1.2 });
  for (let i = 0; i <= h; i += step) pts.push({ x: x + w + R.gauss() * 1.2, y: y + i });
  for (let i = w; i >= 0; i -= step) pts.push({ x: x + i, y: y + h + R.gauss() * 1.2 });
  for (let i = h; i >= 0; i -= step) pts.push({ x: x + R.gauss() * 1.2, y: y + i });
  ctx.save();
  if (o.shadow !== false) {
    ctx.fillStyle = 'rgba(40,25,20,0.28)';
    ctx.translate(3, 4); tracePoly(ctx, pts); ctx.fill(); ctx.translate(-3, -4);
  }
  ctx.fillStyle = o.fill ?? '#f3e9d2';
  tracePoly(ctx, pts); ctx.fill();
  if (o.tint) {
    ctx.save(); tracePoly(ctx, pts); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + h);
    g.addColorStop(0, rgba(o.tint, 0.0)); g.addColorStop(1, rgba(o.tint, 0.22));
    ctx.fillStyle = g; ctx.fillRect(x - 4, y - 4, w + 8, h + 8);
    ctx.restore();
  }
  ctx.strokeStyle = o.stroke ?? 'rgba(80,55,40,0.55)';
  ctx.lineWidth = 1.2;
  tracePoly(ctx, pts); ctx.stroke();
  ctx.restore();
}
