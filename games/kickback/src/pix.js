/* =====================================================================
   pix.js — the canvas, the palette, and ONE coordinate frame
   =====================================================================
   This is a 2D game drawn with 2D drawing. There is no depth, no
   perspective, no shadows and no lighting model: every pixel is a colour
   somebody chose, put down by hand.

   ONE RULE MAKES EVERYTHING ELSE WORK, and it exists because the last
   version got it wrong three times:

       WORLD SPACE IS Y-UP. A PART AT ANGLE 0 POINTS ALONG +X.

   Canvas is y-down, so somewhere a sign has to flip. It flips in exactly
   one function - `toScreen` - and nowhere else in the entire game. Nobody
   calls ctx.rotate, nobody nests a transform inside another transform,
   and no drawing code ever mixes screen units with world units. Every
   shape is a list of points in its own local frame, rotated by a plain
   two-by-two matrix, translated into the world, and only then converted
   to pixels.

   That means aiming a gun is `ang = aim`. Not `-aim`, not `aim + PI/2`,
   not `facing * (aim + PI/2)`. Just `aim`. Which is the whole reason for
   doing it this way.
   ===================================================================== */

export const W = 480, H = 270;          // the real resolution. Everything else is a magnification.

/* ---- the palette -----------------------------------------------------------
   Thirty-two colours and nothing else in the game may invent one. A fixed
   palette is most of what makes a picture look drawn rather than
   rendered: every shadow in the scene is the same shadow, so the whole
   frame hangs together whether it is a wall, a face or a barrel. */
export const P = {
  /* the dark ramp: everything indoors is built out of these five */
  ink: '#15121e', deep: '#241f33', slate: '#382f4b', ash: '#4e4363', mid: '#6a5c82',
  bone: '#948aa8', pale: '#c2bcd0', white: '#ece9f4',
  /* structure */
  /* The concrete is DARK and slightly warm. It was a cool mid-grey, which
     put it within a shade of the sky behind the openings, and a building
     the same value as the sky behind it has no silhouette at all - which
     is the entire composition here. */
  cret1: '#2a2733', cret2: '#3b3745', cret3: '#544e60', cret4: '#6e6779',
  rust1: '#4a2a22', rust2: '#7a4630', rust3: '#a8663c', rust4: '#c98a4e',
  steel1: '#3e4658', steel2: '#5c6a80', steel3: '#8494a8', steel4: '#b3c0d0',
  /* the sky and the harbour */
  sky1: '#1c3f7a', sky2: '#2a5da8', sky3: '#3f81c8', sky4: '#63a5df',
  sky5: '#96c8ee', sky6: '#c6e2f6', sun: '#ffe6b0',
  sea1: '#12294d', sea2: '#1c3d6b', sea3: '#2b578c', sea4: '#4179b0',
  city1: '#2c3f60', city2: '#3a5479', city3: '#4a6b96', city4: '#6289b4',
  /* people and things that matter */
  skin: '#f0c090', skin2: '#c68a5e', hair: '#2a2233',
  coat1: '#2e4166', coat2: '#3f5a86', coat3: '#587aab',
  foe1: '#5a2a34', foe2: '#7d3a46', foe3: '#a04f5c',
  red: '#d8443c', gold: '#e8b83c', flame: '#ffd06a', hot: '#fff3c8',
  toxic: '#7ad84c', tag1: '#e0503a', tag2: '#3ab0e0', tag3: '#e8c840',
  tag4: '#8a5ad8', tag5: '#40c880',
};

/* ---- the canvas ------------------------------------------------------------
   Drawn at 480x270 into an offscreen buffer, then blitted to the visible
   canvas at an integer magnification with smoothing off. Integer is the
   important word: a 2.5x scale puts some pixels two screen pixels wide
   and some three, and the eye picks that up instantly as "wrong". */
let cv, ctx, out, octx, SCALE = 1;

export function initCanvas(target) {
  out = target;
  octx = out.getContext('2d');
  cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  resize();
  addEventListener('resize', resize);
  return ctx;
}
export function resize() {
  const avail = Math.min(innerWidth - 40, 1440);
  SCALE = Math.max(1, Math.floor(avail / W));
  out.width = W * SCALE; out.height = H * SCALE;
  out.style.width = (W * SCALE) + 'px';
  out.style.height = (H * SCALE) + 'px';
  octx = out.getContext('2d');
  octx.imageSmoothingEnabled = false;
}
export function present() {
  octx.imageSmoothingEnabled = false;
  octx.drawImage(cv, 0, 0, W, H, 0, 0, W * SCALE, H * SCALE);
}
export const gfx = () => ctx;
export const scale = () => SCALE;

/* ---- the camera ------------------------------------------------------------
   One place converts world metres to pixels. PPM is fixed at 32 so that a
   metre is always the same number of pixels and nothing ever lands on a
   half-pixel; the camera position is snapped to whole pixels for the same
   reason, because a camera on a fractional pixel makes the entire world
   shimmer as it moves. */
export const PPM = 32;
export const cam = { x: 0, y: 0, shake: 0, sx: 0, sy: 0 };

export function toScreenX(x) { return Math.round((x - cam.x) * PPM + W / 2 + cam.sx); }
export function toScreenY(y) { return Math.round(H / 2 - (y - cam.y) * PPM + cam.sy); }
export function toWorldX(px) { return (px - W / 2 - cam.sx) / PPM + cam.x; }
export function toWorldY(py) { return (H / 2 - py + cam.sy) / PPM + cam.y; }

export function snapCamera() {
  cam.x = Math.round(cam.x * PPM) / PPM;
  cam.y = Math.round(cam.y * PPM) / PPM;
}

/* ---- drawing ---------------------------------------------------------------
   Everything is a polygon in a local frame. `poly` rotates it by a plain
   2x2, translates it into the world, and converts. There is no other path
   from a shape to the screen. */
export function poly(pts, x, y, ang, col, flipY) {
  const c = Math.cos(ang), s = Math.sin(ang);
  const fy = flipY ? -1 : 1;
  ctx.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const lx = pts[i][0], ly = pts[i][1] * fy;
    const wx = lx * c - ly * s + x;
    const wy = lx * s + ly * c + y;
    const sx = toScreenX(wx), sy = toScreenY(wy);
    if (i) ctx.lineTo(sx, sy); else ctx.moveTo(sx, sy);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
}

/* A LIMB, and the reason the whole file exists: it starts at the pivot and
   runs along +X for `len`. At ang = 0 it points right. At ang = aim it
   points exactly where you are aiming. There is nothing to get wrong. */
export function limb(x, y, len, w, ang, col, taper) {
  const t = taper === undefined ? 1 : taper;
  poly([[0, -w / 2], [len, -w * t / 2], [len, w * t / 2], [0, w / 2]], x, y, ang, col);
}
/* the same shape with a lighter strip along one edge, which is how a
   pixel artist puts a highlight on a cylinder */
export function limbLit(x, y, len, w, ang, col, lit, taper) {
  const t = taper === undefined ? 1 : taper;
  poly([[0, -w / 2], [len, -w * t / 2], [len, w * t / 2], [0, w / 2]], x, y, ang, col);
  poly([[0.02, -w / 2], [len - 0.02, -w * t / 2], [len - 0.02, -w * t / 2 + w * 0.3],
    [0.02, -w / 2 + w * 0.3]], x, y, ang, lit);
}

/* an axis-aligned box in world units, which is most of the level */
export function rect(x, y, w, h, col) {
  const x0 = toScreenX(x), y0 = toScreenY(y + h);
  const x1 = toScreenX(x + w), y1 = toScreenY(y);
  ctx.fillStyle = col;
  ctx.fillRect(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
}
/* the same, in screen pixels, for backdrops that do not live in the world */
export function px(x, y, w, h, col) {
  ctx.fillStyle = col;
  ctx.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0));
}
export function circle(x, y, r, col) {
  ctx.beginPath();
  ctx.arc(toScreenX(x), toScreenY(y), Math.max(1, r * PPM), 0, 6.2832);
  ctx.fillStyle = col;
  ctx.fill();
}
export function clear(col) {
  ctx.fillStyle = col;
  ctx.fillRect(0, 0, W, H);
}

/* ---- dithering -------------------------------------------------------------
   The one honest way to get a gradient out of a small palette. A 4x4
   Bayer matrix decides, per pixel, which of the two neighbouring bands it
   belongs to - so a sky can go from one blue to the next over sixty
   pixels using two colours and no in-between. */
const BAYER = [
  [0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5],
];
export function ditherBand(x0, y0, w, h, colA, colB, t) {
  /* t is how far between A and B this band sits, 0..1 */
  const k = Math.max(0, Math.min(1, t)) * 16;
  for (let j = 0; j < h; j++) {
    let runStart = -1, runIs = -1;
    for (let i = 0; i <= w; i++) {
      const is = i < w ? (BAYER[j & 3][i & 3] < k ? 1 : 0) : -1;
      if (is !== runIs) {
        if (runIs === 1) px(x0 + runStart, y0 + j, i - runStart, 1, colB);
        else if (runIs === 0) px(x0 + runStart, y0 + j, i - runStart, 1, colA);
        runStart = i; runIs = is;
      }
    }
  }
}
/* a whole vertical ramp through a list of palette entries */
export function ditherRamp(x0, y0, w, h, cols, curve) {
  const n = cols.length - 1;
  for (let j = 0; j < h; j++) {
    let f = j / (h - 1);
    if (curve) f = curve(f);
    const s = Math.min(n - 0.0001, f * n);
    const i = Math.floor(s);
    ditherBand(x0, y0 + j, w, 1, cols[i], cols[i + 1], s - i);
  }
}

/* ---- deterministic noise, for anything that has to look the same twice --- */
export function hash(a, b) {
  let n = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
export function rng(seed) {
  let s = seed | 0;
  return () => { s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff; return s / 0x7fffffff; };
}
