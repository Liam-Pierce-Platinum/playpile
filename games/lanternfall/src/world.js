// The forest floor: painted procedurally and baked once per 512-unit chunk.
// Items are generated per chunk from a seed and drawn into the 3x3 neighbourhood
// so roots and moss cross chunk seams cleanly.
import { RNG, hash2, fbm, makeCanvas, TAU } from './util.js';

export const CH = 512;

const PAL = {
  forest: { base: '#1c2c27', moss: ['#2c4a30', '#355a34', '#263f2c'], dark: '#0f1a18', leaves: ['#7a3f1c', '#94521f', '#a8652a', '#6b2f17', '#5c4420', '#b77a2e', '#82361e'],
    root: '#2b1d14', rootHi: '#57402a', stone: '#3c4549', stoneHi: '#62707a', fern: ['#2e4c2b', '#3a5e33'], grass: '#46663a' },
  marsh: { base: '#1a2a28', moss: ['#2c4436', '#34503a', '#253c33'], dark: '#0d1716', leaves: ['#6a5a28', '#7a6a30', '#5a4a22', '#8a7238', '#4d5a2a'],
    root: '#22201a', rootHi: '#4a4430', stone: '#384446', stoneHi: '#5a6a6c', fern: ['#2a4a34', '#38583c'], grass: '#54703e' },
};

export class World {
  constructor(map, seed, bake = 1.5) {
    this.map = map; this.seed = seed | 0; this.pal = PAL[map] || PAL.forest;
    this.cache = new Map(); this.items = new Map(); this.BK = bake;
    this.fogs = [];
  }
  waterAt(x, y) {
    if (this.map !== 'marsh') return false;
    if (x * x + y * y < 260 * 260) return false;
    return fbm(x / 280, y / 280, this.seed + 7, 3) > 0.6;
  }
  itemsFor(cx, cy) {
    const k = cx + ',' + cy;
    let it = this.items.get(k);
    if (it) return it;
    const r = new RNG(Math.floor(hash2(cx, cy, this.seed) * 4294967295));
    const ox = cx * CH, oy = cy * CH, P = this.pal;
    it = { blobs: [], roots: [], stones: [], leaves: [], shrooms: [], ferns: [], grass: [], twigs: [], glows: [] };
    for (let i = 0; i < 14; i++) it.blobs.push({ x: ox + r.f() * CH, y: oy + r.f() * CH, r: r.range(50, 150), c: r.chance(0.35) ? P.dark : r.pick(P.moss), a: r.range(0.25, 0.55) });
    const nr = r.int(3) + (r.chance(0.5) ? 1 : 0);
    for (let i = 0; i < nr; i++) {
      const x = ox + r.f() * CH, y = oy + r.f() * CH, n = 2 + r.int(3);
      for (let j = 0; j < n; j++) {
        const a = r.f() * TAU, len = r.range(70, 190);
        it.roots.push({ x, y, a, len, w: r.range(5, 9), bend: r.range(-0.6, 0.6) });
      }
    }
    for (let i = 0; i < 7; i++) it.stones.push({ x: ox + r.f() * CH, y: oy + r.f() * CH, rx: r.range(6, 20), ry: r.range(5, 13), rot: r.f() * TAU, moss: r.chance(0.5) });
    for (let i = 0; i < 260; i++) {
      // leaves gather in drifts
      const dx = fbm((ox + i * 37) / 90, (oy + i * 13) / 90, this.seed);
      it.leaves.push({ x: ox + r.f() * CH, y: oy + r.f() * CH, l: r.range(3.5, 7.5), w: r.range(1.6, 3.2), rot: r.f() * TAU, c: r.pick(P.leaves), a: 0.55 + dx * 0.45 });
    }
    for (let i = 0; i < 6; i++) {
      const x = ox + r.f() * CH, y = oy + r.f() * CH, n = 2 + r.int(4), kind = r.int(3);
      const caps = [];
      for (let j = 0; j < n; j++) caps.push({ x: x + r.range(-10, 10), y: y + r.range(-7, 7), s: r.range(0.6, 1.3) });
      it.shrooms.push({ caps, kind });
    }
    for (let i = 0; i < 6; i++) it.ferns.push({ x: ox + r.f() * CH, y: oy + r.f() * CH, n: 4 + r.int(4), len: r.range(18, 34), rot: r.f() * TAU, c: r.pick(P.fern) });
    for (let i = 0; i < 36; i++) it.grass.push({ x: ox + r.f() * CH, y: oy + r.f() * CH, n: 4 + r.int(5), h: r.range(5, 11) });
    for (let i = 0; i < 18; i++) it.twigs.push({ x: ox + r.f() * CH, y: oy + r.f() * CH, a: r.f() * TAU, l: r.range(10, 26) });
    const ng = r.int(4);
    for (let i = 0; i < ng; i++) {
      const x = ox + r.f() * CH, y = oy + r.f() * CH, n = 2 + r.int(4);
      const col = this.map === 'marsh' ? (r.chance(0.5) ? '#9dffb0' : '#6fe6ff') : (r.chance(0.6) ? '#5ff2d0' : '#9fd0ff');
      for (let j = 0; j < n; j++) it.glows.push({ x: x + r.range(-9, 9), y: y + r.range(-6, 6), s: r.range(1.4, 2.6), ph: r.f() * TAU, col });
    }
    this.items.set(k, it);
    return it;
  }
  chunk(cx, cy) {
    const k = cx + ',' + cy;
    let c = this.cache.get(k);
    if (c) { c.used = performance.now(); return c; }
    c = { canvas: this.bake(cx, cy), glows: this.itemsFor(cx, cy).glows, used: performance.now() };
    this.cache.set(k, c);
    if (this.cache.size > 30) {
      let oldK = null, oldT = Infinity;
      for (const [kk, v] of this.cache) if (v.used < oldT) { oldT = v.used; oldK = kk; }
      if (oldK) this.cache.delete(oldK);
    }
    return c;
  }
  bake(cx, cy) {
    const B = this.BK, cv = makeCanvas(CH * B, CH * B), g = cv.getContext('2d');
    const P = this.pal, ox = cx * CH, oy = cy * CH;
    g.setTransform(B, 0, 0, B, -ox * B, -oy * B);
    g.fillStyle = P.base; g.fillRect(ox, oy, CH, CH);
    const near = [];
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push(this.itemsFor(cx + dx, cy + dy));
    const inb = (x, y, pad) => x > ox - pad && x < ox + CH + pad && y > oy - pad && y < oy + CH + pad;
    // soft moss / shadow blotches
    for (const it of near) for (const b of it.blobs) {
      if (!inb(b.x, b.y, b.r)) continue;
      const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, b.r);
      gr.addColorStop(0, hexA(b.c, b.a)); gr.addColorStop(1, hexA(b.c, 0));
      g.fillStyle = gr; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.fill();
    }
    // fine speckle so the floor has grain
    const r = new RNG(Math.floor(hash2(cx, cy, this.seed + 99) * 4294967295));
    for (let i = 0; i < 900; i++) {
      g.fillStyle = r.chance(0.5) ? 'rgba(0,0,0,0.18)' : 'rgba(120,160,120,0.08)';
      g.fillRect(ox + r.f() * CH, oy + r.f() * CH, r.range(1, 3), r.range(1, 3));
    }
    if (this.map === 'marsh') this.bakeWater(g, ox, oy, r);
    // roots
    for (const it of near) for (const ro of it.roots) {
      if (!inb(ro.x, ro.y, ro.len + 20)) continue;
      drawRoot(g, ro, P);
    }
    // stones
    for (const it of near) for (const s of it.stones) {
      if (!inb(s.x, s.y, 30)) continue;
      g.save(); g.translate(s.x, s.y); g.rotate(s.rot);
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(2, 3, s.rx, s.ry, 0, 0, TAU); g.fill();
      g.fillStyle = P.stone; g.beginPath(); g.ellipse(0, 0, s.rx, s.ry, 0, 0, TAU); g.fill();
      g.fillStyle = P.stoneHi; g.beginPath(); g.ellipse(-s.rx * 0.25, -s.ry * 0.3, s.rx * 0.55, s.ry * 0.45, 0, 0, TAU); g.fill();
      if (s.moss) { g.fillStyle = 'rgba(80,130,60,0.7)'; g.beginPath(); g.ellipse(s.rx * 0.2, -s.ry * 0.5, s.rx * 0.5, s.ry * 0.3, 0.3, 0, TAU); g.fill(); }
      g.restore();
    }
    // twigs
    g.lineCap = 'round';
    for (const it of near) for (const t of it.twigs) {
      if (!inb(t.x, t.y, 30)) continue;
      g.strokeStyle = 'rgba(70,48,30,0.85)'; g.lineWidth = 1.4;
      g.beginPath(); g.moveTo(t.x, t.y); g.lineTo(t.x + Math.cos(t.a) * t.l, t.y + Math.sin(t.a) * t.l);
      g.moveTo(t.x + Math.cos(t.a) * t.l * 0.5, t.y + Math.sin(t.a) * t.l * 0.5); g.lineTo(t.x + Math.cos(t.a + 0.6) * t.l * 0.8, t.y + Math.sin(t.a + 0.6) * t.l * 0.8);
      g.stroke();
    }
    // ferns
    for (const it of near) for (const f of it.ferns) {
      if (!inb(f.x, f.y, 40)) continue;
      for (let i = 0; i < f.n; i++) drawFern(g, f.x, f.y, f.rot + i * TAU / f.n + (i % 2) * 0.3, f.len * (0.75 + (i % 3) * 0.15), f.c);
    }
    // leaf litter
    for (const it of near) for (const l of it.leaves) {
      if (!inb(l.x, l.y, 10)) continue;
      g.save(); g.translate(l.x, l.y); g.rotate(l.rot);
      g.globalAlpha = l.a;
      g.fillStyle = l.c; g.beginPath(); g.moveTo(-l.l, 0); g.quadraticCurveTo(0, -l.w * 1.6, l.l, 0); g.quadraticCurveTo(0, l.w * 1.6, -l.l, 0); g.fill();
      g.strokeStyle = 'rgba(30,15,5,0.55)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-l.l, 0); g.lineTo(l.l * 0.8, 0); g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
    // grass tufts
    g.strokeStyle = P.grass; g.lineWidth = 1.2;
    for (const it of near) for (const t of it.grass) {
      if (!inb(t.x, t.y, 12)) continue;
      g.beginPath();
      for (let i = 0; i < t.n; i++) { const a = -Math.PI / 2 + (i / (t.n - 1) - 0.5) * 1.6; g.moveTo(t.x + i - t.n / 2, t.y); g.quadraticCurveTo(t.x + Math.cos(a) * t.h * 0.5, t.y + Math.sin(a) * t.h * 0.6, t.x + Math.cos(a) * t.h, t.y + Math.sin(a) * t.h); }
      g.stroke();
    }
    // mushrooms
    for (const it of near) for (const m of it.shrooms) {
      if (!inb(m.caps[0].x, m.caps[0].y, 20)) continue;
      const capC = ['#b5422e', '#a87a46', '#c79a3a'][m.kind];
      for (const c of m.caps) {
        const s = c.s;
        g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.ellipse(c.x + 1, c.y + 1, 5 * s, 2 * s, 0, 0, TAU); g.fill();
        g.fillStyle = '#d8c8a4'; g.fillRect(c.x - 1.2 * s, c.y - 6 * s, 2.4 * s, 6 * s);
        g.fillStyle = capC; g.beginPath(); g.ellipse(c.x, c.y - 6 * s, 5.5 * s, 4 * s, 0, Math.PI, TAU); g.fill();
        g.fillStyle = 'rgba(255,240,210,0.8)';
        if (m.kind === 0) { g.beginPath(); g.arc(c.x - 2 * s, c.y - 8 * s, 0.9 * s, 0, TAU); g.arc(c.x + 1.8 * s, c.y - 7.4 * s, 0.8 * s, 0, TAU); g.fill(); }
      }
    }
    // glow-cap bases (the glow itself is drawn above the darkness)
    for (const it of near) for (const gl of it.glows) {
      if (!inb(gl.x, gl.y, 8)) continue;
      g.fillStyle = '#c9f7ea'; g.beginPath(); g.ellipse(gl.x, gl.y - gl.s, gl.s * 1.6, gl.s, 0, Math.PI, TAU); g.fill();
    }
    return cv;
  }
  bakeWater(g, ox, oy, r) {
    const S = 8, pad = 24;
    const cells = [];
    for (let y = oy - pad; y < oy + CH + pad; y += S) for (let x = ox - pad; x < ox + CH + pad; x += S) if (this.waterAt(x, y)) cells.push(x, y);
    g.fillStyle = '#18201a';
    for (let i = 0; i < cells.length; i += 2) { g.beginPath(); g.arc(cells[i], cells[i + 1], 11, 0, TAU); g.fill(); }
    g.fillStyle = '#0b1517';
    for (let i = 0; i < cells.length; i += 2) { g.beginPath(); g.arc(cells[i], cells[i + 1], 7.5, 0, TAU); g.fill(); }
    // glints and lily pads
    for (let i = 0; i < cells.length; i += 2) {
      const x = cells[i], y = cells[i + 1], h = hash2(x, y, this.seed + 3);
      if (h < 0.04) { g.strokeStyle = 'rgba(160,200,210,0.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x - 6, y); g.lineTo(x + 6, y); g.stroke(); }
      else if (h > 0.985) {
        g.fillStyle = '#2f5a34'; g.beginPath(); g.arc(x, y, 6, 0.4, TAU); g.lineTo(x, y); g.fill();
        if (h > 0.996) { g.fillStyle = '#f0d8e8'; g.beginPath(); g.arc(x + 1, y - 1, 2, 0, TAU); g.fill(); }
      } else if (h > 0.9 && h < 0.92) {
        // reeds at the shore
        g.strokeStyle = '#4a5a30'; g.lineWidth = 1.3; g.beginPath();
        for (let k = 0; k < 4; k++) { g.moveTo(x + k * 2, y); g.lineTo(x + k * 2 + (k - 1.5) * 2, y - 12 - k * 2); }
        g.stroke();
        g.fillStyle = '#5a3a20'; g.fillRect(x + 1, y - 16, 2, 5);
      }
    }
  }
  // Marsh fog banks: big soft blobs that drift and get recycled around the camera.
  updateFog(dt, px, py, viewR) {
    if (this.map !== 'marsh') return;
    while (this.fogs.length < 9) this.fogs.push(this.newFog(px, py, viewR, this.fogs.length < 4));
    for (const f of this.fogs) {
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (Math.hypot(f.x - px, f.y - py) > viewR * 2.2) Object.assign(f, this.newFog(px, py, viewR, false));
    }
  }
  newFog(px, py, viewR, near) {
    const a = Math.random() * TAU, d = near ? Math.random() * viewR : viewR * (1.3 + Math.random() * 0.6);
    const ang = Math.random() * TAU;
    return { x: px + Math.cos(a) * d, y: py + Math.sin(a) * d, r: 150 + Math.random() * 170, vx: Math.cos(ang) * 14, vy: Math.sin(ang) * 10, ph: Math.random() * TAU };
  }
  fogAt(x, y) {
    let v = 0;
    for (const f of this.fogs) { const d = Math.hypot(x - f.x, y - f.y); if (d < f.r) v = Math.max(v, 1 - d / f.r); }
    return v;
  }
}

function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function drawRoot(g, ro, P) {
  const steps = 10;
  let x = ro.x, y = ro.y, a = ro.a;
  const pts = [[x, y]];
  for (let i = 0; i < steps; i++) { a += ro.bend * 0.18 + Math.sin(i * 1.7 + ro.x) * 0.12; x += Math.cos(a) * ro.len / steps; y += Math.sin(a) * ro.len / steps; pts.push([x, y]); }
  g.lineCap = 'round';
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < steps; i++) {
      const w = ro.w * (1 - i / steps * 0.85);
      g.strokeStyle = pass === 0 ? 'rgba(0,0,0,0.35)' : pass === 1 ? P.root : P.rootHi;
      g.lineWidth = pass === 2 ? w * 0.3 : w;
      const o = pass === 0 ? 2 : pass === 2 ? -w * 0.22 : 0;
      g.beginPath(); g.moveTo(pts[i][0] + o, pts[i][1] + o); g.lineTo(pts[i + 1][0] + o, pts[i + 1][1] + o); g.stroke();
    }
  }
}
function drawFern(g, x, y, a, len, col) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.12, len, 0); g.stroke();
  for (let i = 1; i < 9; i++) {
    const t = i / 9, px = len * t, py = -len * 0.12 * Math.sin(t * Math.PI), s = (1 - t) * len * 0.22 + 2;
    for (const sd of [-1, 1]) { g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + s * 0.3, py + sd * s * 0.7, px + s * 0.8, py + sd * s * 0.9); g.quadraticCurveTo(px + s * 0.6, py + sd * s * 0.3, px, py); g.fill(); }
  }
  g.restore();
}
