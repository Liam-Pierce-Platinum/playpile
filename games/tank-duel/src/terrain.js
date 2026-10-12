// Destructible terrain: a 1-byte-per-pixel solid mask the size of the world,
// rendered into an offscreen canvas. Only the columns touched by a blast are
// re-rendered. Overhangs and tunnels are allowed (Worms-style).
export const W = 1600, H = 900;
const BEDROCK = 6; // bottom rows can never be carved

export const THEMES = {
  meadow: { name: 'Meadow', sky: ['#4fb3ff', '#9fe0ff', '#e9f9ff'], far: '#b4e3cb', mid: '#8fd0a4', grass: [120, 214, 70], grassDark: [70, 160, 52], lip: [56, 112, 40],
    bands: [[176, 120, 72], [156, 102, 60], [134, 86, 52], [112, 72, 46]], sun: '#fff6b0', cloud: '#ffffff' },
  desert: { name: 'Desert', sky: ['#ff9d5c', '#ffd28a', '#fff1cf'], far: '#fbd0a2', mid: '#f3b98a', grass: [244, 206, 120], grassDark: [222, 172, 92], lip: [150, 92, 48],
    bands: [[196, 118, 66], [176, 100, 56], [154, 84, 48], [132, 70, 42]], sun: '#fffbe0', cloud: '#fff4e6' },
  snow: { name: 'Snowfield', sky: ['#6aa8e8', '#b9d9f7', '#f2f8ff'], far: '#dbe7f4', mid: '#c3d5ea', grass: [250, 252, 255], grassDark: [206, 222, 240], lip: [140, 160, 190],
    bands: [[118, 132, 170], [100, 114, 152], [86, 98, 136], [72, 84, 120]], sun: '#ffffff', cloud: '#ffffff' },
  dusk: { name: 'Dusk', sky: ['#2b1c5c', '#a03f87', '#ff9a6b'], far: '#b0629a', mid: '#87508e', grass: [255, 120, 170], grassDark: [200, 80, 140], lip: [120, 50, 100],
    bands: [[70, 44, 98], [58, 36, 86], [48, 30, 74], [40, 24, 64]], sun: '#ffe2a8', cloud: '#ffc4d8' },
};
export const THEME_KEYS = Object.keys(THEMES);

export class Terrain {
  constructor() {
    this.mask = new Uint8Array(W * H);
    this.canvas = document.createElement('canvas');
    this.canvas.width = W; this.canvas.height = H;
    this.cx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.theme = THEMES.meadow;
    this.bandNoise = new Float32Array(W);
    this.origTop = new Int16Array(W);
  }
  generate(rng, themeKey, compact = false) {
    this.theme = THEMES[themeKey] || THEMES.meadow;
    const m = this.mask; m.fill(0);
    // layered sines with random phases + a random feature in the middle
    const waves = [];
    for (let i = 0; i < 5; i++) waves.push({ f: (0.6 + i * 1.3 + rng() * 0.8) * Math.PI * 2 / W, a: 90 / (i + 1) * (0.6 + rng() * 0.8), p: rng() * 7 });
    const feature = rng(); // 0..0.45 hill, 0.45..0.75 valley, else plateau-ish
    const base = 560 + rng() * 80;
    const hgt = new Float32Array(W);
    for (let x = 0; x < W; x++) {
      let y = base;
      for (const w of waves) y += Math.sin(x * w.f + w.p) * w.a;
      const u = (x - W / 2) / (W * 0.18);
      if (feature < 0.45) y -= Math.exp(-u * u) * (120 + rng() * 0); // central hill
      else if (feature < 0.75) y += Math.exp(-u * u) * 90; // valley
      hgt[x] = y;
    }
    // flatten pads where the tanks spawn
    // compact = phone portrait: tanks closer together so the camera can zoom in on both
    const pa = rng(), pb = rng();
    this.pads = compact ? [W * (0.28 + pa * 0.05), W * (0.67 + pb * 0.05)] : [W * (0.1 + pa * 0.08), W * (0.82 + pb * 0.08)];
    for (const px of this.pads) {
      const h0 = hgt[Math.round(px)];
      for (let x = Math.max(0, px - 50); x < Math.min(W, px + 50); x++) {
        const t = Math.max(0, 1 - Math.abs(x - px) / 50);
        hgt[Math.round(x)] = hgt[Math.round(x)] * (1 - t) + h0 * t;
      }
    }
    for (let x = 0; x < W; x++) {
      const top = Math.max(300, Math.min(H - 80, Math.round(hgt[x])));
      for (let y = top; y < H; y++) m[y * W + x] = 1;
      this.origTop[x] = top;
      this.bandNoise[x] = Math.sin(x * 0.011 + 1.3) * 10 + Math.sin(x * 0.037) * 5;
    }
    this.renderCols(0, W - 1);
    this.version0 = (this.version0 || 0) + 1;
  }
  solid(x, y) {
    x |= 0; y |= 0;
    if (x < 0 || x >= W) return false;
    if (y >= H) return true;
    if (y < 0) return false;
    return this.mask[y * W + x] === 1;
  }
  // first solid pixel scanning down from y (returns H if none)
  surfaceBelow(x, y) {
    x = Math.max(0, Math.min(W - 1, x | 0)); y = Math.max(0, y | 0);
    for (; y < H; y++) if (this.mask[y * W + x]) return y;
    return H;
  }
  topAt(x) { return this.surfaceBelow(x, 0); }
  carve(cx, cy, r) {
    const m = this.mask, r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1 - BEDROCK, Math.ceil(cy + r));
    let removed = 0;
    for (let y = y0; y <= y1; y++) {
      const dy = y - cy, row = y * W;
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        if (dx * dx + dy * dy <= r2 && m[row + x]) { m[row + x] = 0; removed++; }
      }
    }
    if (x1 >= x0) this.renderCols(x0, x1);
    return removed;
  }
  add(cx, cy, r) { // dirt
    const m = this.mask, r2 = r * r;
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(W - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(H - 1, Math.ceil(cy + r));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy <= r2) m[y * W + x] = 1; }
    this.renderCols(x0, x1);
  }
  // surface normal from mask gradient around (x,y)
  normal(x, y) {
    let nx = 0, ny = 0;
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2, dx = Math.cos(ang), dy = Math.sin(ang);
      if (this.solid(x + dx * 7, y + dy * 7)) { nx -= dx; ny -= dy; }
    }
    const l = Math.hypot(nx, ny) || 1;
    return { x: nx / l, y: ny / l };
  }
  // colour of the terrain at a point (for debris)
  colorAt(x, y) {
    x = Math.max(0, Math.min(W - 1, x | 0)); if (!(y > 0)) y = 0;
    const d = y - this.topAt(x);
    if (d < 9 && Math.abs(this.topAt(x) - this.origTop[x | 0]) < 3) { const g = this.theme.grass; return `rgb(${g[0]},${g[1]},${g[2]})`; }
    const b = this.band(x, y); return `rgb(${b[0]},${b[1]},${b[2]})`;
  }
  band(x, y) {
    const bands = this.theme.bands;
    const k = Math.floor(((y + this.bandNoise[x | 0]) - 380) / 90);
    return bands[Math.max(0, Math.min(bands.length - 1, k))];
  }
  renderCols(x0, x1) {
    x0 = Math.max(0, x0 | 0); x1 = Math.min(W - 1, x1 | 0);
    const w = x1 - x0 + 1;
    const img = this.cx.createImageData(w, H), d = img.data, m = this.mask, th = this.theme;
    const g = th.grass, gd = th.grassDark, lip = th.lip, bands = th.bands;
    for (let xi = 0; xi < w; xi++) {
      const x = xi + x0, bn = this.bandNoise[x];
      let depth = 9999; // distance below the nearest air pixel above
      let airAbove = true, natural = true;
      for (let y = 0; y < H; y++) {
        const i = (y * w + xi) * 4;
        if (!m[y * W + x]) { depth = -1; airAbove = true; continue; }
        depth++;
        if (depth === 0) natural = Math.abs(y - this.origTop[x]) < 3;
        let r, gg, b;
        // natural surface gets grass; crater walls get a dark rim then dirt
        if (depth <= 1) { r = lip[0] * 0.55; gg = lip[1] * 0.55; b = lip[2] * 0.55; }
        else if (natural && depth < 4) { r = Math.min(255, g[0] * 1.12 + 14); gg = Math.min(255, g[1] * 1.1 + 14); b = Math.min(255, g[2] * 1.1 + 14); }
        else if (natural && depth < 15) { r = g[0]; gg = g[1]; b = g[2]; }
        else if (natural && depth < 18) { r = gd[0]; gg = gd[1]; b = gd[2]; }
        else if (natural && depth < 20) { r = lip[0]; gg = lip[1]; b = lip[2]; }
        else {
          const yy = (y + bn) - 380;
          const k = Math.floor(yy / 90);
          const c = bands[k < 0 ? 0 : k > 3 ? 3 : k];
          let sh = natural ? (depth < 30 ? 0.86 + (depth - 20) / 10 * 0.14 : 1) : (depth < 7 ? 0.6 + depth * 0.05 : 1);
          const ym = ((yy % 90) + 90) % 90;
          if (k >= 0 && ym < 3) sh *= 0.86; // strata line
          // rounded pebbles: one per 46px cell
          const cx = (x / 46) | 0, cy = (y / 46) | 0;
          const hh = (Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) >>> 0;
          const px = cx * 46 + 8 + (hh % 30), py = cy * 46 + 8 + ((hh >>> 8) % 30), pr = 3 + ((hh >>> 16) % 5);
          const ddx = x - px, ddy = y - py, dd = ddx * ddx + ddy * ddy;
          if (dd < pr * pr) sh *= dd < (pr - 1.5) * (pr - 1.5) ? (ddy < 0 ? 1.14 : 1.05) : 0.8;
          r = c[0] * sh; gg = c[1] * sh; b = c[2] * sh;
        }
        d[i] = r; d[i + 1] = gg; d[i + 2] = b; d[i + 3] = 255;
      }
    }
    // clear previous pixels and put the new ones
    this.cx.putImageData(img, x0, 0);
    this.version = (this.version || 0) + 1;
  }
}
