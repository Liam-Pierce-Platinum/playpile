// The screen is a small pixel buffer that gets blown up with nearest-neighbour.
// EVERYTHING is drawn into this buffer at integer coordinates -- no canvas
// strokes, no antialiased fills -- so the game stays honestly pixelated at any
// window size. Polygons go through a scanline filler for the same reason.

export const W = 384;
export const H = 216;

// opts.fixed = { w, h, scale } makes a small self-contained view that does not
// follow the window -- used for the shop's live preview of your rider.
export function createView(canvas, opts = {}) {
  const fixed = opts.fixed || null;
  const bw = fixed ? fixed.w : W, bh = fixed ? fixed.h : H;
  const buf = document.createElement('canvas');
  buf.width = bw; buf.height = bh;
  const g = buf.getContext('2d', { alpha: false });
  g.imageSmoothingEnabled = false;

  const out = canvas.getContext('2d', { alpha: false });
  out.imageSmoothingEnabled = false;

  const v = {
    g, W: bw, H: bh,
    cam: { x: 0, y: 0 },
    scale: 1,

    // ---- camera -------------------------------------------------------
    // Camera is snapped to whole pixels; a fractional camera makes every
    // static sprite in the scene shimmer as it scrolls.
    begin() {
      g.setTransform(1, 0, 0, 1, -Math.round(v.cam.x), -Math.round(v.cam.y));
    },
    ui() { g.setTransform(1, 0, 0, 1, 0, 0); },
    left()  { return Math.round(v.cam.x); },
    right() { return Math.round(v.cam.x) + bw; },
    top()   { return Math.round(v.cam.y); },
    bot()   { return Math.round(v.cam.y) + bh; },

    // ---- primitives ---------------------------------------------------
    clear(c) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = c; g.fillRect(0, 0, bw, bh); },

    rect(x, y, w, h, c) {
      if (w <= 0 || h <= 0) return;
      g.fillStyle = c;
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    },

    frame(x, y, w, h, c) {
      v.rect(x, y, w, 1, c); v.rect(x, y + h - 1, w, 1, c);
      v.rect(x, y, 1, h, c); v.rect(x + w - 1, y, 1, h, c);
    },

    // Bresenham, one pixel at a time.
    line(x0, y0, x1, y1, c, thick = 1) {
      x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
      const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
      const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
      let err = dx + dy;
      g.fillStyle = c;
      const o = (thick - 1) >> 1;
      for (let i = 0; i < 4096; i++) {
        g.fillRect(x0 - o, y0 - o, thick, thick);
        if (x0 === x1 && y0 === y1) break;
        const e2 = err * 2;
        if (e2 >= dy) { err += dy; x0 += sx; }
        if (e2 <= dx) { err += dx; y0 += sy; }
      }
    },

    // Scanline convex/concave polygon fill. pts = [[x,y], ...]
    poly(pts, c) {
      let lo = 1e9, hi = -1e9;
      for (const p of pts) { if (p[1] < lo) lo = p[1]; if (p[1] > hi) hi = p[1]; }
      lo = Math.round(lo); hi = Math.round(hi);
      if (hi - lo > 4096) return;
      g.fillStyle = c;
      const xs = [];
      for (let y = lo; y <= hi; y++) {
        xs.length = 0;
        const cy = y + 0.5;
        for (let i = 0, n = pts.length; i < n; i++) {
          const a = pts[i], b = pts[(i + 1) % n];
          if ((a[1] <= cy && b[1] > cy) || (b[1] <= cy && a[1] > cy)) {
            xs.push(a[0] + (cy - a[1]) / (b[1] - a[1]) * (b[0] - a[0]));
          }
        }
        if (!xs.length) continue;
        xs.sort((p, q) => p - q);
        for (let i = 0; i + 1 < xs.length; i += 2) {
          const x0 = Math.round(xs[i]), x1 = Math.round(xs[i + 1]);
          if (x1 > x0) g.fillRect(x0, y, x1 - x0, 1);
        }
      }
    },

    polyLine(pts, c, close = true) {
      for (let i = 0; i + 1 < pts.length; i++) v.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
      if (close && pts.length > 2) v.line(pts[pts.length - 1][0], pts[pts.length - 1][1], pts[0][0], pts[0][1], c);
    },

    disc(cx, cy, r, c) {
      cx = Math.round(cx); cy = Math.round(cy);
      g.fillStyle = c;
      const ri = Math.max(1, Math.round(r));
      for (let y = -ri; y <= ri; y++) {
        const w = Math.floor(Math.sqrt(Math.max(0, ri * ri - y * y)) + 0.35);
        if (w > 0) g.fillRect(cx - w, cy + y, w * 2, 1);
      }
    },

    ring(cx, cy, r, c) {
      const n = Math.max(8, Math.round(r * 3));
      let px = cx + r, py = cy;
      for (let i = 1; i <= n; i++) {
        const a = i / n * Math.PI * 2;
        const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
        v.line(px, py, x, y, c); px = x; py = y;
      }
    },

    // A 4x4 ordered-dither band. Used to blend two shades of the same ramp
    // over a big surface instead of drawing a hard seam.
    //
    // Done with a cached 4x4 repeating PATTERN, not a pixel loop. The obvious
    // per-pixel version costs one fillRect per lit pixel, and the sky gradient
    // alone lights several thousand of them a frame -- that one function was
    // most of the frame budget on a software renderer.
    dither(x, y, w, h, cA, cB, amount) {
      if (cA !== 'rgba(0,0,0,0)') v.rect(x, y, w, h, cA);
      const t = Math.min(16, Math.round(amount * 16));
      if (t <= 0) return;
      g.fillStyle = pattern(cB, t);
      g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    },

    // ---- presentation ---------------------------------------------------
    // INTEGER SCALING, EXCEPT WHEN IT WOULD LEAVE HALF THE SCREEN BLACK.
    //
    // Whole-number scaling is the right default for pixel art: every
    // source pixel becomes the same square block and nothing shimmers.
    // On a monitor it lands on 2x or 3x and looks perfect.
    //
    // On a phone it lands on 1x, because the screen is not two canvases
    // wide - so a 412-pixel handset showed a 440-pixel strip across the
    // middle of a black page with the game about a fifth of the area. A
    // phone is two thirds of this platform's traffic; a game that plays
    // in a letterbox there is not shipped.
    //
    // So: integer whenever it reaches 2x, and an exact fit below that.
    // Fractional scaling on a `pixelated` canvas gives slightly uneven
    // pixel widths, which is what every pixel game on a phone does, and
    // is a great deal better than throwing away four fifths of the glass.
    resize() {
      const whole = Math.min(Math.floor(window.innerWidth / bw), Math.floor(window.innerHeight / bh));
      const s = fixed ? fixed.scale
        : whole >= 2 ? whole
        : Math.max(0.35, Math.min(window.innerWidth / bw, window.innerHeight / bh));
      v.scale = s;
      // the backing store must be whole pixels even when the scale is
      // not - a fractional canvas.width is silently floored by the
      // browser and the CSS size then disagrees with it by up to a pixel,
      // which shows up as a shimmering seam down one edge
      const cw = Math.max(1, Math.round(bw * s)), ch = Math.max(1, Math.round(bh * s));
      canvas.width = cw; canvas.height = ch;
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      out.imageSmoothingEnabled = false;
    },

    present() {
      out.imageSmoothingEnabled = false;
      out.drawImage(buf, 0, 0, bw, bh, 0, 0, canvas.width, canvas.height);
    },
  };

  v.resize();
  if (!fixed) window.addEventListener('resize', v.resize);
  return v;
}

const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

// 4x4 ordered-dither tiles, built once per (colour, level) and reused.
const patCache = new Map();
function pattern(col, t) {
  const key = col + '|' + t;
  let p = patCache.get(key);
  if (p) return p;
  const c = document.createElement('canvas');
  c.width = 4; c.height = 4;
  const cg = c.getContext('2d');
  cg.fillStyle = col;
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) if (BAYER[y * 4 + x] < t) cg.fillRect(x, y, 1, 1);
  }
  p = cg.createPattern(c, 'repeat');
  patCache.set(key, p);
  return p;
}
