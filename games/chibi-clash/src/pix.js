// Pixel-grid core shared by the creature engine, eggs and icons. Pure JS (no DOM) so the
// node tools (tools/check.mjs) can rasterise creatures without a browser. Only toCanvas
// needs a document.

export function hex2rgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
export function rgb2hex(r, g, b) { return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
const mixCache = new Map();
export function mix(a, b, t) {
  const key = a + b + t; let v = mixCache.get(key);
  if (v) return v;
  const A = hex2rgb(a), B = hex2rgb(b);
  v = rgb2hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t);
  if (mixCache.size > 20000) mixCache.clear();
  mixCache.set(key, v); return v;
}
// darker with a hue shift toward purple (classic pixel-art shading), lighter toward warm white
export const dk = (c, t = 0.35) => mix(c, '#2a1840', t);
export const lt = (c, t = 0.4) => mix(c, '#fff8e8', t);
export const luma = (c) => { const [r, g, b] = hex2rgb(c); return r * 0.3 + g * 0.59 + b * 0.11; };

export class Grid {
  constructor(w, h) { this.w = w; this.h = h; this.px = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.px[y * this.w + x] = c; }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); if (x < 0 || y < 0 || x >= this.w || y >= this.h) return null; return this.px[y * this.w + x]; }
  ell(cx, cy, rx, ry, c) {
    rx = Math.max(0.5, rx); ry = Math.max(0.5, ry);
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
      const nx = (x + 0.5 - cx) / rx, ny = (y + 0.5 - cy) / ry;
      if (nx * nx + ny * ny <= 1) { const v = typeof c === 'function' ? c(nx, ny, x, y) : c; if (v) this.set(x, y, v); }
    }
  }
  rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c); }
  poly(pts, c) {
    if (pts.length < 3) return;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    for (let y = Math.floor(y0); y <= y1; y++) for (let x = Math.floor(x0); x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5; let ins = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) ins = !ins;
      }
      if (ins) { const v = typeof c === 'function' ? c(x, y) : c; if (v) this.set(x, y, v); }
    }
  }
  line(x0, y0, x1, y1, c) {
    x0 = Math.floor(x0); y0 = Math.floor(y0); x1 = Math.floor(x1); y1 = Math.floor(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 400; n++) { this.set(x0, y0, c); if (x0 === x1 && y0 === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0 += sy; } }
  }
  // tapered capsule from (x0,y0,r0) to (x1,y1,r1)
  capsule(x0, y0, x1, y1, r0, r1, c) {
    const d = Math.hypot(x1 - x0, y1 - y0), n = Math.max(2, Math.ceil(d * 1.5));
    for (let i = 0; i <= n; i++) { const t = i / n; const r = r0 + (r1 - r0) * t; this.ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, r, c); }
  }
  outline(c) {
    const add = [];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.get(x, y)) continue;
      if (this.get(x + 1, y) || this.get(x - 1, y) || this.get(x, y + 1) || this.get(x, y - 1)) add.push([x, y]);
    }
    for (const [x, y] of add) this.set(x, y, typeof c === 'function' ? c(x, y) : c);
  }
  bbox() {
    let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) if (this.px[y * this.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, x1, y1 };
  }
  crop(x0, y0, w, h) {
    const g = new Grid(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) g.px[y * w + x] = this.get(x0 + x, y0 + y);
    return g;
  }
  toCanvas() {
    const cv = document.createElement('canvas'); cv.width = this.w; cv.height = this.h;
    const cx = cv.getContext('2d'); const img = cx.createImageData(this.w, this.h);
    for (let i = 0; i < this.px.length; i++) { const c = this.px[i]; if (!c) continue; const [r, g, b] = hex2rgb(c); img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255; }
    cx.putImageData(img, 0, 0); return cv;
  }
}
