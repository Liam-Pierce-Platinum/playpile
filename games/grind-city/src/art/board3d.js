// The deck is drawn as an actual little 3D object -- eight deck corners, four
// wheels -- rotated by the same three angles the physics uses and flattened
// with an orthographic projection.
//
// This is not decoration. It is the only way a 2D side view can show the
// difference between a kickflip (the deck rolls, you see the graphic flash
// past), a shove-it (it foreshortens and swaps ends) and an impossible (it
// wraps end over end). Faking those with squash factors reads as mush.

import { P } from './palette.js';

const L = 9.5;    // half length
const Wd = 3.2;   // half width
const T = 0.9;    // half thickness
const KICK = 1.9; // how far the tips turn up

// Deck outline along its length: [x, yOffsetOfTip]
const SPINE = [
  [-L, KICK], [-L * 0.72, 0.25], [L * 0.72, 0.25], [L, KICK],
];

const LIGHT = norm([-0.42, 0.86, 0.30]);

// The camera is tipped down a few degrees. Dead side-on, a deck is exactly edge
// on and draws as a featureless bar -- no griptape, no graphic, no wheels. A
// small fixed tilt costs nothing and buys the whole silhouette: you see the top
// when it is flat and the graphic when it is upside down, which is what makes a
// flip legible at all.
const VIEW_TILT = 0.34;

export function drawBoard(v, cx, cy, roll, yaw, pitch, scale, opts = {}) {
  const s = scale || 1;
  const L4 = opts.look || DEFAULT_LOOK;
  const ART = L4.art, GRIP = L4.grip, WHL = L4.wheels, TRK = L4.trucks;
  // the ply -- the edge of the deck you see side on. It follows the board, or a
  // custom print's own colour, rather than being bare maple forever.
  const PLY = L4.ply || [P.deck1, P.deck2, P.deck3];
  const faces = [];

  // --- build the deck as quads --------------------------------------------
  for (let i = 0; i + 1 < SPINE.length; i++) {
    const a = SPINE[i], b = SPINE[i + 1];
    // top (griptape) and bottom (graphic) of this section
    faces.push({
      pts: [[a[0], a[1] + T, -Wd], [b[0], b[1] + T, -Wd], [b[0], b[1] + T, Wd], [a[0], a[1] + T, Wd]],
      ramp: [GRIP[0], GRIP[1], GRIP[1]], key: 'grip', section: i,
    });
    faces.push({
      pts: [[a[0], a[1] - T, Wd], [b[0], b[1] - T, Wd], [b[0], b[1] - T, -Wd], [a[0], a[1] - T, -Wd]],
      ramp: ART, key: 'art', section: i,
    });
    // the two long rims, showing the ply
    // The two long rims. They carry a SIDE, because each one shows the graphic's
    // outermost row on its own side of the board -- and the belly quad runs its
    // width from +Wd (w = 0) to -Wd (w = 1), so those are the rows to sample.
    faces.push({
      pts: [[a[0], a[1] + T, Wd], [b[0], b[1] + T, Wd], [b[0], b[1] - T, Wd], [a[0], a[1] - T, Wd]],
      ramp: PLY, key: 'ply', section: i, edge: 0,
    });
    faces.push({
      pts: [[a[0], a[1] - T, -Wd], [b[0], b[1] - T, -Wd], [b[0], b[1] + T, -Wd], [a[0], a[1] + T, -Wd]],
      ramp: PLY, key: 'ply', section: i, edge: 1,
    });
  }
  // the two end caps
  faces.push({ pts: [[-L, KICK + T, -Wd], [-L, KICK + T, Wd], [-L, KICK - T, Wd], [-L, KICK - T, -Wd]],
    ramp: PLY, key: 'ply' });
  faces.push({ pts: [[L, KICK - T, -Wd], [L, KICK - T, Wd], [L, KICK + T, Wd], [L, KICK + T, -Wd]],
    ramp: PLY, key: 'ply' });

  // --- trucks and wheels ---------------------------------------------------
  if (!opts.deckOnly) for (const tx of [-L * 0.55, L * 0.55]) {
    // hanger
    faces.push({ pts: [[tx - 1.1, -T, -Wd * 0.9], [tx + 1.1, -T, -Wd * 0.9], [tx + 1.1, -T - 1.5, -Wd * 0.9], [tx - 1.1, -T - 1.5, -Wd * 0.9]],
      ramp: TRK, key: 'trk' });
    faces.push({ pts: [[tx - 1.1, -T, Wd * 0.9], [tx - 1.1, -T - 1.5, Wd * 0.9], [tx + 1.1, -T - 1.5, Wd * 0.9], [tx + 1.1, -T, Wd * 0.9]],
      ramp: TRK, key: 'trk' });
    for (const wz of [-Wd * 1.05, Wd * 1.05]) {
      faces.push({ wheel: true, cx: tx, cy: -T - 2.2, cz: wz, r: 1.65,
        ramp: WHL, key: 'whl' });
    }
  }

  // --- rotate, project, sort ------------------------------------------------
  const cyw = Math.cos(yaw), syw = Math.sin(yaw);
  const cr = Math.cos(roll + VIEW_TILT), sr = Math.sin(roll + VIEW_TILT);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);

  function rot(pt) {
    // yaw about the board's vertical axis
    let x = pt[0] * cyw + pt[2] * syw;
    let z = -pt[0] * syw + pt[2] * cyw;
    let y = pt[1];
    // roll about the board's length
    const y2 = y * cr - z * sr;
    z = y * sr + z * cr; y = y2;
    // pitch, end over end, in the screen plane
    const x2 = x * cp - y * sp;
    y = x * sp + y * cp; x = x2;
    return [x, y, z];
  }

  // Facing left is a straight screen-space mirror of the finished projection --
  // a mirror image of a 3D object is still a valid 3D object, and doing it here
  // keeps the rotation maths above in one handedness.
  const fx = opts.flip ? -1 : 1;

  const drawn = [];
  for (const f of faces) {
    if (f.wheel) {
      const c = rot([f.cx, f.cy, f.cz]);
      drawn.push({ z: c[2], wheel: true, x: cx + c[0] * s * fx, y: cy - c[1] * s, r: f.r * s, ramp: f.ramp });
      continue;
    }
    const r = f.pts.map(rot);
    const n = faceNormal(r);
    if (n[2] > 0.02) continue;                 // back face, camera looks down -z
    const lit = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    const shade = lit > 0.62 ? 0 : lit > 0.24 ? 1 : 2;
    const zc = (r[0][2] + r[1][2] + r[2][2] + r[3][2]) / 4;
    drawn.push({
      z: zc, ramp: f.ramp, shade, key: f.key, section: f.section, edge: f.edge,
      poly: r.map((q) => [cx + q[0] * s * fx, cy - q[1] * s]),
    });
  }
  drawn.sort((a, b) => b.z - a.z);

  const g = v.g;
  for (const d of drawn) {
    if (d.wheel) {
      v.disc(d.x, d.y, d.r + 0.6, P.ink);
      v.disc(d.x, d.y, d.r, d.ramp[1]);
      v.disc(d.x - d.r * 0.3, d.y - d.r * 0.3, d.r * 0.45, d.ramp[0]);
      if (L4.wheelPrint) wheelFace(v, d, L4);
      continue;
    }
    v.poly(d.poly, d.ramp[d.shade]);
    // THE EDGE OF THE BOARD SHOWS THE EDGE OF THE DESIGN. Column by column,
    // sampled from the same description that paints the belly, so a checker
    // ends in a checker and a flame runs round the fold instead of stopping
    // dead at it. Where the graphic leaves the wood bare, so does the rim.
    if (d.key === 'ply' && d.edge !== undefined && L4.graphic !== 'plain') {
      rimStrip(v, d, L4);
    }
    // the graphic on the underside. It is what makes a flip read at all -- a
    // flat-coloured belly just goes dark and light again.
    if (d.key === 'art') {
      graphic(v, d.poly, L4.graphic, ART, d.shade, d.section, L4);
    }
    // and the griptape, which is the same idea on the side you stand on
    if (d.key === 'grip' && L4.gripPrint) {
      gridOnto(v, d.poly, d.section, L4.gripPrint, L4.printCols, L4.printRows, L4.printPalette);
    }
  }

  // one clean silhouette in ink around the deck, so it never dissolves into
  // the background at speed
  if (opts.outline !== false) {
    const corners = [];
    for (const sp2 of SPINE) {
      for (const ty of [-T, T]) for (const tz of [-Wd, Wd]) {
        const r = rot([sp2[0], sp2[1] + ty, tz]);
        corners.push([cx + r[0] * s * fx, cy - r[1] * s]);
      }
    }
    const hull = convexHull(corners);
    v.polyLine(hull, P.ink, true);
  }
}

// A painted design across a deck face, in whole-deck coordinates so the three
// sections do not stretch it. Index 0 means leave the base colour showing.
function gridOnto(v, q, section, grid, cols, rows, pal) {
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const col = pal[grid[r * cols + c] | 0];
      if (!col) continue;
      drawBand(v, q, section, c / cols, (c + 1) / cols, r / rows, (r + 1) / rows, col);
    }
  }
}

// The wheel's face, clipped to the circle. A wheel is only a few pixels across
// in the park, so this is mostly for the shop -- but it is the same design.
function wheelFace(v, d, L4) {
  const cols = L4.wheelCols, rows = L4.wheelRows, pal = L4.printPalette;
  const grid = L4.wheelPrint;
  const cw = (d.r * 2) / cols, ch = (d.r * 2) / rows;
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const col = pal[grid[r * cols + c] | 0];
      if (!col) continue;
      const x = d.x - d.r + c * cw, y = d.y - d.r + r * ch;
      // only the cells whose centre is actually on the wheel
      const dx = x + cw / 2 - d.x, dy = y + ch / 2 - d.y;
      if (dx * dx + dy * dy > d.r * d.r) continue;
      v.rect(x, y, Math.max(1, cw), Math.max(1, ch), col);
    }
  }
}

// Paint one rim from the graphic's outermost row. The strip is a colour per
// column of the whole deck; this walks the run of columns that fall inside this
// section of the deck and fills each one, shaded to match the face it is on.
function rimStrip(v, d, L4) {
  const cols = L4.graphic === 'custom' ? (L4.printCols || 26) : 48;
  const strip = edgeStrip(L4.graphic, L4.art, L4, d.edge === 0 ? 0.02 : 0.98, cols, d.shade);
  const sec = SECT[d.section];
  if (!sec) return;
  const span = sec[1] - sec[0] || 1;
  const k = d.shade === 0 ? 1 : d.shade === 1 ? 0.82 : 0.6;

  const base = L4.art[Math.min(2, d.shade)];
  for (let i = 0; i < cols; i++) {
    const col = strip[i] || base;
    const u0 = Math.max(i / cols, sec[0]);
    const u1 = Math.min((i + 1) / cols, sec[1]);
    if (u1 <= u0) continue;
    v.poly(cell(d.poly, (u0 - sec[0]) / span, (u1 - sec[0]) / span, 0, 1), shade(col, k));
  }
}

function shade(hex, k) {
  if (k >= 1 || !hex || hex[0] !== '#' || hex.length !== 7) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * k);
  const g = Math.round(((n >> 8) & 255) * k);
  const b = Math.round((n & 255) * k);
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

// --- small maths -------------------------------------------------------------
function faceNormal(r) {
  const ax = r[1][0] - r[0][0], ay = r[1][1] - r[0][1], az = r[1][2] - r[0][2];
  const bx = r[2][0] - r[0][0], by = r[2][1] - r[0][1], bz = r[2][2] - r[0][2];
  return norm([ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx]);
}
function norm(n) {
  const m = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / m, n[1] / m, n[2] / m];
}
function lerp2(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]; }

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  lower.pop(); upper.pop();
  return lower.concat(upper);
}


const DEFAULT_LOOK = {
  art: [P.art1, P.art2, P.art3],
  ply: [P.deck1, P.deck2, P.deck3],
  graphic: 'stripe',
  grip: [P.grip1, P.grip2],
  wheels: [P.whl1, P.whl2, P.whl3],
  trucks: [P.trk1, P.trk2, P.trk3],
};

// The projection is orthographic and therefore affine, so a cell of the deck's
// underside can be found by plain bilinear interpolation of the four projected
// corners. q0->q1 runs along the length, q0->q3 runs across the width.
function cell(q, u0, u1, w0, w1) {
  const at = (u, w) => {
    const a = lerp2(q[0], q[1], u), b = lerp2(q[3], q[2], u);
    return lerp2(a, b, w);
  };
  return [at(u0, w0), at(u1, w0), at(u1, w1), at(u0, w1)];
}

// Where each of the three deck sections sits along the WHOLE deck, 0 at the tail
// tip and 1 at the nose. The sections are nothing like equal -- the middle is
// about five times the length of either kicked tip -- so a graphic that hands
// each section the same number of columns comes out with the middle stretched
// five to one. Everything below is therefore laid out in whole-deck coordinates
// and clipped into whichever section is being drawn.
const SECT = [];
for (let i = 0; i + 1 < SPINE.length; i++) {
  SECT.push([(SPINE[i][0] + L) / (2 * L), (SPINE[i + 1][0] + L) / (2 * L)]);
}

// u0..u1 are along the whole deck; w0..w1 across its width. This is the SINK
// that actually fills quads -- see describe() for the one that just remembers.
function drawBand(v, q, section, u0, u1, w0, w1, col) {
  const sec = SECT[section];
  if (!sec) return;
  const a = Math.max(u0, sec[0]), b = Math.min(u1, sec[1]);
  if (b <= a) return;
  const span = sec[1] - sec[0] || 1;
  v.poly(cell(q, (a - sec[0]) / span, (b - sec[0]) / span, w0, w1), col);
}

// The belly graphic, DESCRIBED rather than drawn: every shape it is made of is
// handed to a sink as a rectangle in whole-deck coordinates. Drawing it means
// giving it a sink that fills quads; asking what colour is at a point means
// giving it one that just remembers. Same description either way, so the edge
// of the board can never disagree with the face of it.
function graphic(v, q, kind, art, shade, section, look) {
  describe({
    band: (u0, u1, w0, w1, col) => drawBand(v, q, section, u0, u1, w0, w1, col),
  }, kind, art, shade, look);
}

// THE LONG EDGE OF THE BOARD, sampled column by column.
//
// The rim used to be one flat colour picked from the deck -- the average of a
// print, in effect -- so a checkerboard had a plain brown edge and a flame died
// at the fold. Running the same description at the outermost row of the graphic
// gives the edge the exact colour the face has at that point, pixel for pixel,
// so the design wraps round the corner instead of stopping at it.
const stripCache = new Map();
function edgeStrip(kind, art, look, w, cols, shd) {
  const key = kind + '|' + art.join('') + '|' + w + '|' + shd + '|'
    + (look && look.print ? look.print.join(',') : '');
  let strip = stripCache.get(key);
  if (strip) return strip;

  strip = new Array(cols).fill(null);
  describe({
    band: (u0, u1, w0, w1, col) => {
      const lo = Math.min(w0, w1), hi = Math.max(w0, w1);
      if (w < lo || w >= hi) return;                  // this shape misses the rim
      const a = Math.max(0, Math.floor(u0 * cols));
      const b = Math.min(cols, Math.ceil(u1 * cols));
      for (let i = a; i < b; i++) strip[i] = col;
    },
  }, kind, art, shd, look);

  if (stripCache.size > 64) stripCache.clear();
  stripCache.set(key, strip);
  return strip;
}

function describe(sink, kind, art, shade, look) {
  const band = (u0, u1, w0, w1, col) => sink.band(u0, u1, w0, w1, col);
  const accent = shade < 1 ? art[2] : art[0];
  const hot = art[1];
  if (kind === 'plain') return;


  if (kind === 'custom') {
    const grid = look && look.print;
    if (!grid) return;
    const cols = look.printCols, rows = look.printRows;
    const pal = look.printPalette;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        const col = pal[grid[r * cols + c] | 0];
        if (!col) continue;
        band(c / cols, (c + 1) / cols, r / rows, (r + 1) / rows, col);
      }
    }
    return;
  }

  if (kind === 'stripe') { band(0.14, 0.86, 0.34, 0.64, accent); return; }
  if (kind === 'split') { band(0, 1, 0, 0.5, accent); return; }

  if (kind === 'checker') {
    const cols = 8, rows = 2;
    for (let c = 0; c < cols; c++) {
      for (let r = 0; r < rows; r++) {
        if (((c + r) & 1) === 0) continue;
        band(c / cols, (c + 1) / cols, r / rows, (r + 1) / rows, accent);
      }
    }
    return;
  }

  if (kind === 'flame') {
    // licks running up the belly, hot core over a darker body
    band(0.10, 0.92, 0.22, 0.78, art[2]);
    band(0.20, 0.80, 0.32, 0.68, accent);
    band(0.30, 0.62, 0.42, 0.58, hot);
    return;
  }

  if (kind === 'eye') {
    // an open palm with an eye set in it, across the middle of the deck
    band(0.30, 0.72, 0.16, 0.84, art[2]);      // the palm
    band(0.36, 0.66, 0.28, 0.72, art[1]);
    band(0.42, 0.60, 0.36, 0.64, accent);      // the white
    band(0.47, 0.55, 0.44, 0.56, art[2]);      // the pupil
    // fingers
    band(0.24, 0.30, 0.30, 0.44, art[2]);
    band(0.24, 0.30, 0.56, 0.70, art[2]);
    band(0.72, 0.78, 0.40, 0.60, art[2]);
    return;
  }

  if (kind === 'bolt') {
    band(0.16, 0.46, 0.30, 0.48, accent);
    band(0.40, 0.62, 0.44, 0.62, accent);
    band(0.56, 0.86, 0.54, 0.72, accent);
    return;
  }
}

