// =====================================================================
// CROSSING :: art.js - THE PIXELS
// =====================================================================
//
// Liam: *"better 2D pixelated grind city graphics for crossing"*.
//
// CROSSING used to be drawn straight onto the cabinet canvas with
// roundRect, arc and a linear gradient. That is vector art. Scaled up to
// fill a 3440-wide monitor it stays smooth and slightly soft, and a flat
// rounded rectangle with one dark stripe on it is a rounded rectangle,
// not a car. This file replaces all of it with real pixel art, drawn the
// way GRIND CITY draws (see skate/src/art/palette.js): ONE palette, every
// material a 3-4 step ramp so a surface can be shaded without inventing a
// colour, and outlines in plum-black rather than pure black - black ink
// next to a saturated colour reads as a hole, a dark tint of the same
// world reads as a line.
//
// -------------------------------------------------------------------
// HOW THE PIXEL GRID WORKS
// -------------------------------------------------------------------
// The whole world is drawn into ONE offscreen canvas at half the
// cabinet's resolution - 330x323 instead of 660x646 - and that buffer is
// then blitted over the cabinet canvas at 2x with imageSmoothingEnabled
// off. So:
//
//   * every fillRect in this file is a rectangle of WHOLE art pixels,
//     because the buffer has no sub-pixels to fall between. There is no
//     way to accidentally draw a half-pixel edge;
//   * a car at x = 137.4 virtual px is drawn at art pixel 69 and jumps in
//     2-virtual-px steps, which is how pixel art moves. Sub-pixel sliding
//     is the main thing that gives "pixel-looking" art away;
//   * the canvas is then CSS-scaled to whatever the window is, and
//     index.html asks for image-rendering:pixelated, so the chunkiness
//     survives any screen size.
//
// PX = 2 was chosen against the cell size, not picked for roundness. A
// cell is 44 virtual px; at PX = 2 that is 22 art pixels, which is enough
// to give a frog two eyes, four legs and a shaded back. PX = 4 was tried
// first - 11 px a cell - and at that size the frog is a smudge with no
// room for an eye, and the turtles and cars all collapse into the same
// lozenge. Fullscreen on a 1440-tall screen the cabinet scales by ~2.2,
// so one art pixel lands as a ~4.5 screen pixel block.
//
// Sprites that never change size (frog, trees, turtles, the ground
// textures) are drawn ONCE into small canvases at startup and blitted
// after that. Things whose width is decided by the row generator (cars,
// trucks, logs) are drawn as integer rects instead, because their widths
// are continuous - caching a sprite per width would be a cache with no
// upper bound on an endless game.

export const PX = 2;                 // virtual pixels per art pixel
export const CELL_A = 22;            // one grid cell, in art pixels (44 / PX)

// ---------------------------------------------------------------------
// THE PALETTE
// ---------------------------------------------------------------------
// Warm and saturated, the same family as GRIND CITY, so the two games
// look like they came out of the same box. Ramps run light -> dark and
// nothing in this game is allowed a colour that is not in here.
export const P = {
  // ink. Plum-black. Everything with a silhouette gets outlined in ink,
  // and the two lighter steps are for inner detail lines that would
  // otherwise read as cracks.
  ink: '#241b2b', ink2: '#3a2c44', ink3: '#54415f',

  // grass / verge. Straight out of the GRIND CITY palette so the two
  // games' greens match exactly.
  grs1: '#a9d95e', grs2: '#78b23f', grs3: '#4f8129', grs4: '#33571c',

  // tarmac. Warm grey with plum in it rather than the old near-black
  // #191d24, which made the road a hole in the screen.
  tar1: '#7a7284', tar2: '#5e5769', tar3: '#4a4455', tar4: '#382f42',
  paint1: '#ffe9c0', paint2: '#c9b48e',      // lane markings, sun-bleached

  // river. Bright enough to read as water rather than as a dark gap, and
  // four steps so a wave can have a lit top and a shaded underside.
  wat1: '#9fe2f0', wat2: '#5bb4d8', wat3: '#3684b0', wat4: '#24618c',
  foam: '#e4f6fc', deep: '#1a4d72',          // what a thing under the surface looks like

  // wood, for logs and trunks
  wood1: '#e0a765', wood2: '#b87c42', wood3: '#8a5729', wood4: '#5c3919',

  // turtles: green body, tan shell
  trt1: '#8fd46a', trt2: '#5da844', trt3: '#3c7530',
  shl1: '#e8c079', shl2: '#b98a45', shl3: '#7d5828',

  // the frog
  frg1: '#c4f078', frg2: '#8ad44e', frg3: '#589c31', frg4: '#3a6b21',
  eye1: '#fff6e0', dead1: '#ff8a7a', dead2: '#d9423c', dead3: '#93221f',

  // ui
  ui1: '#ffcf70', ui2: '#ff8a3d', ui3: '#7fd4e8', ui4: '#f4e3c6',
  uiDim: '#a08fb0',
};

// Six cars, each a three-step ramp: lid / side / shadow. They are written
// out rather than derived from one hue, because a mechanically darkened
// yellow goes olive and a mechanically darkened red goes brown.
export const CAR_PAINT = [
  { c1: '#ffdc6b', c2: '#e8b43a', c3: '#a87a1f' },   // taxi yellow
  { c1: '#9fe8f2', c2: '#5fc0d8', c3: '#3a83a0' },   // pale blue
  { c1: '#f2705f', c2: '#cf4038', c3: '#8f2422' },   // red
  { c1: '#c79ef0', c2: '#9a63cf', c3: '#653a92' },   // purple
  { c1: '#ffb063', c2: '#e0742c', c3: '#9c4818' },   // orange
  { c1: '#a8e87a', c2: '#6fbf45', c3: '#44802a' },   // green
];
const GLASS = '#3f5a6b', GLASS_HI = '#8fb0c0';
const LAMP = '#ffe9a8', LAMP_RED = '#ff5b4a';

// ---------------------------------------------------------------------
// the smallest possible drawing kit
// ---------------------------------------------------------------------
/** a rectangle of whole art pixels. Everything in this file goes through here. */
export function px(g, x, y, w, h, c) {
  if (w <= 0 || h <= 0) return;
  g.fillStyle = c;
  g.fillRect(x | 0, y | 0, w | 0, h | 0);
}

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  return { c, g };
}

/**
 * A symmetrical blob with a 1px ink outline, built from a width profile.
 *
 * `prof` is one entry per row, top to bottom: the width of the shape on
 * that row in art pixels. The outline is done by painting each row one
 * pixel wider and one taller in ink FIRST and then the colour on top -
 * which gives a clean silhouette edge for free, including the little
 * steps where the profile changes, without tracing an outline path.
 *
 * `col(i)` picks the colour for row i, and is where the ramp gets stepped.
 */
function blob(g, cx, y0, prof, col) {
  for (let i = 0; i < prof.length; i++) {
    const w = prof[i]; if (w <= 0) continue;
    px(g, cx - w / 2 - 1, y0 + i - 1, w + 2, 3, P.ink);
  }
  for (let i = 0; i < prof.length; i++) {
    const w = prof[i]; if (w <= 0) continue;
    px(g, cx - w / 2, y0 + i, w, 1, col(i));
  }
}

// A tiny deterministic random, so a texture tile looks the same every
// time the page is loaded. Math.random would give a different road every
// refresh, which is harmless but makes an art change impossible to
// compare against the shot you took a minute ago.
function seeded(s) {
  let a = s >>> 0;
  return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
}

// ---------------------------------------------------------------------
// THE PIXEL FONT
// ---------------------------------------------------------------------
// 3x5 capitals and digits. The cabinet's D.text is a real system font: it
// is crisp, but it is also anti-aliased and proportional, and one line of
// smooth grey text sitting on top of chunky pixels is the single loudest
// tell that the art is a filter rather than the real thing. The HUD is
// the only text drawn inside the pixel buffer; the home screen and the
// GAME OVER card are the cabinet's own furniture, shared with 23 other
// games, and are deliberately left alone.
//
// 0 and O are the same glyph. At three pixels wide they always are.
const GLYPH = {
  A: '111101111101101', B: '110101110101110', C: '111100100100111',
  D: '110101101101110', E: '111100111100111', F: '111100111100100',
  G: '111100101101011', H: '101101111101101', I: '111010010010111',
  J: '001001001101111', K: '101101110101101', L: '100100100100111',
  M: '101111111101101', N: '110101101101101', O: '111101101101111',
  P: '111101111100100', Q: '111101101111001', R: '111101110101101',
  S: '111100111001111', T: '111010010010010', U: '101101101101111',
  V: '101101101101010', W: '101101111111101', X: '101101010101101',
  Y: '101101010010010', Z: '111001010100111',
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111',
  3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111',
  9: '111101111001111',
  ' ': '000000000000000', '-': '000000111000000', '.': '000000000000010',
  '·': '000000010000000',                // the middot the hints use
};
export const FONT_H = 5, FONT_ADV = 4;        // glyph 3 wide + 1 of air

/** width of a string in art pixels at the given scale */
export function textW(s, scale = 1) { return (s.length * FONT_ADV - 1) * scale; }

/**
 * Draw text with its top-left at (x, y). Drawn as individual pixel rects
 * rather than from a pre-rendered atlas: the HUD is about twenty glyphs,
 * so this is at most a few hundred fillRects of 2x2 into a 330-wide
 * buffer, which does not show up in a frame time at all, and it means the
 * colour is free rather than needing an atlas per colour.
 */
export function text(g, s, x, y, col, scale = 1, align = 'left') {
  s = String(s).toUpperCase();
  let ox = x | 0;
  if (align === 'center') ox = (x - textW(s, scale) / 2) | 0;
  if (align === 'right') ox = (x - textW(s, scale)) | 0;
  g.fillStyle = col;
  for (let i = 0; i < s.length; i++) {
    const bits = GLYPH[s[i]] || GLYPH[' '];
    for (let r = 0; r < 5; r++) {
      // one fillRect per horizontal run, so a solid 3-wide row costs one
      // call instead of three
      let run = 0;
      for (let c = 0; c <= 3; c++) {
        const on = c < 3 && bits[r * 3 + c] === '1';
        if (on) { run++; continue; }
        if (run) {
          g.fillRect(ox + (c - run) * scale, (y | 0) + r * scale, run * scale, scale);
          run = 0;
        }
      }
    }
    ox += FONT_ADV * scale;
  }
}

// ---------------------------------------------------------------------
// GROUND TEXTURES
// ---------------------------------------------------------------------
// Three cells wide (66 art px) rather than one, so the repeat is not on
// the same beat as the grid the game is played on - tile at one cell and
// the eye locks onto the pattern immediately and the ground reads as
// graph paper.
const TILE_W = CELL_A * 3, TILE_H = CELL_A;

/**
 * Tarmac. Base coat, then chippings: single pixels of the step above and
 * the step below, plus a few 2-3px smears which are the patches and tyre
 * polish. The density (about one speckle in six pixels) was picked by
 * eye at 2x - much less and the road is flat again, much more and it
 * boils when the screen scrolls.
 */
function tarmacTile(seed) {
  const { c, g } = mk(TILE_W, TILE_H);
  px(g, 0, 0, TILE_W, TILE_H, P.tar3);
  const R = seeded(seed);
  for (let i = 0; i < 230; i++) {
    const x = (R() * TILE_W) | 0, y = (R() * TILE_H) | 0;
    px(g, x, y, 1, 1, R() < 0.55 ? P.tar2 : P.tar4);
  }
  for (let i = 0; i < 14; i++) {
    const x = (R() * TILE_W) | 0, y = (R() * TILE_H) | 0;
    px(g, x, y, 2 + ((R() * 3) | 0), 1, R() < 0.5 ? P.tar1 : P.tar4);
  }
  return c;
}

/**
 * Grass. `dark` is the second of the two tints the row generator already
 * picks between, kept because alternating bands are what stop a wide
 * verge from looking like a painted wall.
 *
 * The tufts are three-pixel chevrons rather than single dots. A single
 * lighter dot on green reads as dirt; a chevron reads as a blade.
 */
function grassTile(seed, dark) {
  const { c, g } = mk(TILE_W, TILE_H);
  const base = dark ? P.grs4 : P.grs3;
  const tuft = dark ? P.grs3 : P.grs2;
  const hi = dark ? P.grs2 : P.grs1;
  px(g, 0, 0, TILE_W, TILE_H, base);
  const R = seeded(seed);
  for (let i = 0; i < 90; i++) px(g, (R() * TILE_W) | 0, (R() * TILE_H) | 0, 1, 1, tuft);
  for (let i = 0; i < 26; i++) {
    const x = 1 + ((R() * (TILE_W - 2)) | 0), y = 1 + ((R() * (TILE_H - 2)) | 0);
    px(g, x, y - 1, 1, 2, hi);
    px(g, x - 1, y, 1, 1, tuft);
    px(g, x + 1, y, 1, 1, tuft);
  }
  return c;
}

/** Still water: depth mottling only. The moving highlights are drawn live. */
function waterTile(seed) {
  const { c, g } = mk(TILE_W, TILE_H);
  px(g, 0, 0, TILE_W, TILE_H, P.wat3);
  const R = seeded(seed);
  for (let i = 0; i < 60; i++) {
    const x = (R() * TILE_W) | 0, y = (R() * TILE_H) | 0;
    px(g, x, y, 1 + ((R() * 3) | 0), 1, R() < 0.5 ? P.wat2 : P.wat4);
  }
  return c;
}

// ---------------------------------------------------------------------
// TREES
// ---------------------------------------------------------------------
// Two conifers and one round tree. The conifers keep the old version's
// triangle, because a triangle IS what that art was reaching for - it is
// just stepped into tiers with a lit left face and a shaded right one now,
// which is the whole difference between a shape and a tree.
//
// The light in this game comes from the top left, and every sprite in the
// file shades to that: highlight on the top-left of a mass, the darkest
// ramp step on the bottom-right.
// The sprite is one cell wide and four art pixels taller than a cell, so a
// tree overhangs the row above it just enough to have some height without
// ever being mistaken for scenery belonging to that row.
function coniferSprite(tiers, seed) {
  const W = 22, H = 26;
  const { c, g } = mk(W, H);
  const cx = W / 2;
  const R = seeded(seed);

  px(g, cx - 3, H - 8, 6, 8, P.ink);
  px(g, cx - 2, H - 8, 4, 7, P.wood3);
  px(g, cx - 2, H - 8, 2, 7, P.wood2);

  // Each tier is a triangle: a run of rows getting wider, then a step in
  // where the next tier starts. Widths are even so the tree stays
  // symmetrical about cx.
  let y = 2;
  const tierH = tiers === 3 ? 7 : 9;
  for (let t = 0; t < tiers; t++) {
    const wide = 8 + t * 5;
    const prof = [];
    for (let i = 0; i < tierH; i++) prof.push(Math.max(2, Math.round(wide * (i + 1) / tierH / 2) * 2));
    blob(g, cx, y, prof, (i) => (i < 2 ? P.grs2 : i > tierH - 3 ? P.grs4 : P.grs3));
    // the lit left face: half the row, one ramp step up
    for (let i = 1; i < tierH - 1; i++) {
      const w = prof[i];
      px(g, cx - w / 2, y + i, Math.max(1, (w / 2) | 0) - 1, 1, i < 2 ? P.grs1 : P.grs2);
    }
    y += tierH - 2;
  }
  // a couple of stray needles on the silhouette so the edge is not a
  // perfectly clean staircase
  for (let i = 0; i < 4; i++) px(g, 3 + ((R() * 16) | 0), 6 + ((R() * 16) | 0), 1, 1, P.grs1);
  return c;
}

function roundTreeSprite(seed) {
  const W = 22, H = 26;
  const { c, g } = mk(W, H);
  const cx = W / 2;
  // The trunk starts at 14, two rows INSIDE the canopy. Started at the
  // row below the canopy it left a one-pixel gap and the tree's head
  // floated off its stick.
  px(g, cx - 3, 14, 6, H - 14, P.ink);
  px(g, cx - 2, 14, 4, H - 15, P.wood3);
  px(g, cx - 2, 14, 2, H - 15, P.wood2);

  // A deliberately lumpy circle - a clean one looks like a lollipop.
  const prof = [6, 10, 14, 16, 18, 18, 18, 18, 16, 16, 14, 12, 10, 6];
  blob(g, cx, 2, prof, (i) => (i < 3 ? P.grs2 : i > prof.length - 5 ? P.grs4 : P.grs3));
  const R = seeded(seed);
  for (let i = 0; i < 22; i++) {
    const y = 3 + ((R() * 10) | 0);
    const w = prof[y - 2] || 8;
    px(g, cx - w / 2 + 1 + ((R() * (w / 2)) | 0), y, 1 + ((R() * 2) | 0), 1, P.grs1);
  }
  for (let i = 0; i < 14; i++) {
    const y = 8 + ((R() * 5) | 0);
    const w = prof[y - 2] || 8;
    px(g, cx + ((R() * (w / 2 - 1)) | 0), y, 1 + ((R() * 2) | 0), 1, P.grs4);
  }
  return c;
}

// ---------------------------------------------------------------------
// TURTLES
// ---------------------------------------------------------------------
// One cell each, so they are sprites. Built facing right and mirrored for
// the left-running lanes: a horizontal flip of a pixel sprite is exact,
// no resampling, so the mirrored one is just as crisp.
function turtleSprite(sunk) {
  const S = CELL_A;
  const { c, g } = mk(S, S);
  const cy = S / 2;

  if (sunk) {
    // A DIVING TURTLE HAS TO LOOK LIKE ONE. This is the only thing in the
    // game that stops holding you up while you are stood on it, so it
    // cannot be the same sprite at 30% alpha, which is what it used to be
    // - that reads as "drawn wrong", not as "about to drop you".
    //
    // So: the same shell, same silhouette, but WITH NO INK OUTLINE and in
    // water colours. Nothing under water has a hard edge, and losing the
    // outline is what makes the eye read it as below the surface rather
    // than as a turtle someone forgot to colour in. Light on the top of
    // the dome, deep shadow underneath, and ripples where it went down.
    const prof = [8, 12, 14, 16, 16, 16, 16, 14, 12, 8];
    for (let i = 0; i < prof.length; i++) {
      px(g, 8 - prof[i] / 2, cy - 5 + i, prof[i], 1, i < 2 ? P.wat2 : i < 5 ? P.wat4 : P.deep);
    }
    px(g, 7, cy - 4, 2, 8, P.deep);                  // the scutes, just about
    px(g, 3, cy - 1, 11, 1, P.deep);
    px(g, 2, cy - 8, 6, 1, P.wat1); px(g, 11, cy - 9, 5, 1, P.wat1);
    px(g, 1, cy + 7, 7, 1, P.wat1); px(g, 12, cy + 8, 6, 1, P.wat1);
    return c;
  }

  // The shell sits left of centre so the head has somewhere to be: with
  // the shell centred, the head is a two-pixel nub sticking out of the
  // silhouette and the turtle reads as a stone.
  const sx = 8;

  // Flippers, as two stepped rects each so they taper to a paddle rather
  // than being green squares stuck on a lump. They sit one row INTO the
  // shell's outline: a pixel of clear water between a limb and the shell
  // reads as two separate objects, and the first version had four green
  // tabs floating around a brown oval.
  for (const s of [-1, 1]) {
    const yy = s < 0 ? cy - 8 : cy + 5;
    px(g, 11, yy, 5, 3, P.ink);  px(g, 11, yy + (s < 0 ? 1 : 0), 4, 2, P.trt3);
    px(g, 2, yy, 5, 3, P.ink);   px(g, 3, yy + (s < 0 ? 1 : 0), 4, 2, P.trt3);
  }

  const prof = [8, 12, 14, 16, 16, 16, 16, 14, 12, 8];
  blob(g, sx, cy - 5, prof, (i) => (i < 2 ? P.shl1 : i > 6 ? P.shl3 : P.shl2));

  // The head goes on AFTER the shell, overlapping it, for the same reason
  // - drawn first, the shell's own outline sat between the two and the
  // head looked like a green brick floating off the front. It is also the
  // LIGHTEST green on the sprite while the flippers are the darkest,
  // which is the only way to tell a head from a foot at this size.
  px(g, 14, cy - 4, 8, 8, P.ink);                    // head, pointing right
  px(g, 15, cy - 3, 6, 6, P.trt2);
  px(g, 15, cy - 3, 6, 2, P.trt1);
  px(g, 19, cy - 1, 1, 2, P.ink);                    // eye
  // scutes: a dark cross plus corner marks, which is the least you can
  // draw and still have it read as a shell rather than a pebble
  px(g, sx - 1, cy - 4, 2, 9, P.shl3);
  px(g, sx - 6, cy - 1, 12, 2, P.shl3);
  px(g, sx - 5, cy - 3, 3, 1, P.shl1); px(g, sx + 2, cy - 3, 3, 1, P.shl1);
  px(g, sx - 5, cy + 2, 3, 1, P.shl3); px(g, sx + 2, cy + 2, 3, 1, P.shl3);
  return c;
}

function flipped(src) {
  const { c, g } = mk(src.width, src.height);
  g.translate(src.width, 0); g.scale(-1, 1);
  g.drawImage(src, 0, 0);
  return c;
}

// ---------------------------------------------------------------------
// THE FROG
// ---------------------------------------------------------------------
// Top-down, facing UP, in one cell. The other three facings are exact 90
// degree rotations of it - which is right rather than lazy, because a
// frog seen from above has its eyes on top of its head and looks the same
// from any side. Rotating a square sprite by a right angle lands every
// pixel on a pixel, so the turned ones are as sharp as the original.
function frogSprite(dead) {
  const S = CELL_A;
  const { c, g } = mk(S, S);
  const cx = S / 2;
  const c1 = dead ? P.dead1 : P.frg1, c2 = dead ? P.dead2 : P.frg2;
  const c3 = dead ? P.dead3 : P.frg3, c4 = dead ? P.dead3 : P.frg4;

  // Legs go down FIRST and the body is painted over them, so the body
  // silhouette stays clean and the limbs read as sticking out from under
  // it. The body is 14 wide at its widest out of a 22-wide cell, which is
  // the only reason there is anywhere for the legs to be seen.
  px(g, 0, 12, 6, 8, P.ink); px(g, S - 6, 12, 6, 8, P.ink);       // back legs
  px(g, 1, 13, 4, 6, c3); px(g, S - 5, 13, 4, 6, c3);
  px(g, 1, 17, 4, 2, c4); px(g, S - 5, 17, 4, 2, c4);             // webbed feet
  px(g, 0, 6, 5, 6, P.ink); px(g, S - 5, 6, 5, 6, P.ink);         // front legs
  px(g, 1, 7, 3, 4, c2); px(g, S - 4, 7, 3, 4, c2);

  // the body. Widest across the shoulders, tapering to the rump, shaded
  // by walking down the ramp - the light step where the light hits, base
  // through the middle, the dark step under the rump.
  const prof = [8, 12, 14, 14, 14, 14, 14, 14, 14, 12, 12, 10, 10, 8];
  blob(g, cx, 3, prof, (i) => (i < 2 ? c1 : i < 8 ? c2 : i < 12 ? c3 : c4));
  // a wet highlight down the left of the back, and speckles so the back
  // is not a flat field of one colour
  px(g, cx - 5, 6, 2, 5, c1);
  px(g, cx - 3, 5, 1, 3, c1);
  px(g, cx + 2, 9, 2, 1, c3); px(g, cx - 1, 12, 2, 1, c3); px(g, cx + 3, 13, 2, 1, c3);

  // eyes: two bulges that break the head's outline, which is what makes
  // the silhouette read as a frog at a glance rather than as a lozenge
  for (const ex of [4, 13]) {
    px(g, ex, 2, 5, 5, P.ink);
    px(g, ex + 1, 3, 3, 3, dead ? P.dead1 : P.eye1);
    if (dead) {                     // crossed out
      px(g, ex + 1, 3, 1, 1, P.ink); px(g, ex + 3, 3, 1, 1, P.ink);
      px(g, ex + 2, 4, 1, 1, P.ink);
      px(g, ex + 1, 5, 1, 1, P.ink); px(g, ex + 3, 5, 1, 1, P.ink);
    } else {
      px(g, ex + (ex < cx ? 2 : 1), 4, 2, 2, P.ink);   // pupils, looking in
    }
  }
  return c;
}

function rot90(src, times) {
  let cur = src;
  for (let n = 0; n < times; n++) {
    const { c, g } = mk(cur.height, cur.width);
    g.translate(c.width / 2, c.height / 2);
    g.rotate(Math.PI / 2);
    g.drawImage(cur, -cur.width / 2, -cur.height / 2);
    cur = c;
  }
  return cur;
}

// ---------------------------------------------------------------------
// everything, built once
// ---------------------------------------------------------------------
export function buildSprites() {
  const up = frogSprite(false), upDead = frogSprite(true);
  const turtleR = turtleSprite(false);
  return {
    // dir in the game is 0 up, 1 right, 2 down, 3 left. Rotating the
    // up-facing sprite clockwise n times gives exactly that order.
    frog: [up, rot90(up, 1), rot90(up, 2), rot90(up, 3)],
    frogDead: [upDead, rot90(upDead, 1), rot90(upDead, 2), rot90(upDead, 3)],
    trees: [coniferSprite(3, 11), coniferSprite(2, 27), roundTreeSprite(5)],
    turtle: [turtleR, flipped(turtleR)],           // [right-facing, left-facing]
    turtleDive: turtleSprite(true),
    tarmac: [tarmacTile(3), tarmacTile(91)],
    grass: [grassTile(7, false), grassTile(43, true)],
    water: waterTile(19),
  };
}

// ---------------------------------------------------------------------
// the things whose width the game decides
// ---------------------------------------------------------------------
/**
 * A car, drawn nose-first in the direction it is travelling.
 *
 * Not a sprite: the row generator gives trucks a width anywhere between
 * 1.7 and 2.5 cells, continuously, and an endless game makes new rows for
 * ever - a sprite cache keyed on width would grow without limit. Every
 * coordinate here is already a whole art pixel because this draws into
 * the art-resolution buffer, so it is pixel art either way.
 *
 * @param dir  +1 travelling right, -1 travelling left
 */
export function car(g, x, y, w, h, paint, dir, truck) {
  const right = dir > 0;

  // Wheels first: dark blocks poking out under the shell at both ends.
  // Drawn UNDER the body rather than inside it, because a top-down car
  // whose tyres are inside its own outline is a brick.
  px(g, x + 2, y + h - 2, 5, 4, P.ink);
  px(g, x + w - 7, y + h - 2, 5, 4, P.ink);

  px(g, x, y, w, h, P.ink);                   // silhouette
  px(g, x + 1, y + 1, w - 2, h - 2, paint.c2);
  px(g, x + 1, y + 1, w - 2, 2, paint.c1);    // lit top edge
  px(g, x + 1, y + h - 3, w - 2, 2, paint.c3);// shaded flank

  if (truck) {
    // Cab at the nose, box behind it, with the join inked in. A truck
    // that is just a long car is indistinguishable from a long car at
    // this size; the join and the white box are the whole read.
    const cabW = Math.max(8, Math.round(CELL_A * 0.6));
    const cabX = right ? x + w - cabW : x;
    px(g, right ? cabX - 1 : cabX + cabW, y, 1, h, P.ink);
    const boxX = right ? x + 1 : x + cabW + 1;
    const boxW = w - cabW - 2;
    px(g, boxX, y + 1, boxW, h - 2, P.ui4);
    px(g, boxX, y + 1, boxW, 1, '#fffaf0');
    px(g, boxX, y + h - 3, boxW, 2, P.paint2);
    for (let i = 3; i < boxW - 1; i += 4) px(g, boxX + i, y + 2, 1, h - 4, P.paint2);
    // the cab keeps the paint and gets a windscreen across its nose
    const wsX = right ? cabX + cabW - 4 : cabX + 2;
    px(g, wsX, y + 3, 2, h - 6, GLASS);
    px(g, wsX, y + 3, 2, 1, GLASS_HI);
  } else {
    // A SALOON SEEN FROM ABOVE IS MOSTLY ROOF, BUT NOT ONLY ROOF.
    //
    // Two goes at this were wrong. Filling the cabin with glass made
    // every car a minibus with one long window. Making the cabin the full
    // height of the car made it a bright box with a blue end - there was
    // no bodywork left anywhere to say where the car stopped and the
    // cabin began. The cabin is inset on ALL FOUR sides now, so a band of
    // paint runs down each flank and there is a bonnet and a boot, which
    // is what a car looks like from a helicopter.
    // NO CABIN PANEL AT ALL. Three goes at drawing a lighter roof inside
    // an outlined cabin gave, in order: a minibus, a bright box, and a
    // television - because as soon as the cabin has its own outline the
    // car reads as a frame with a screen in it. All a car needs from
    // above is its own colour with TWO dark holes in it, the windscreen
    // and the rear window; everything between and around them is roof,
    // bonnet and boot, and it is all the same paint.
    const winW = Math.max(3, Math.round(w * 0.16));
    const gy = y + 3, gh = h - 6;
    for (const gx of [x + 4, x + w - 4 - winW]) {
      px(g, gx - 1, gy - 1, winW + 2, gh + 2, P.ink);
      px(g, gx, gy, winW, gh, GLASS);
    }
    px(g, right ? x + w - 4 - winW : x + 4, gy, winW, 1, GLASS_HI);
    // a glint along the roof ridge, between the two windows
    px(g, x + 5 + winW, gy + 1, w - 10 - winW * 2, 1, paint.c1);
  }

  // lamps: white pairs at the nose, red pairs at the tail
  const nx = right ? x + w - 3 : x + 1, bx = right ? x + 1 : x + w - 3;
  px(g, nx, y + 2, 2, 3, LAMP);       px(g, nx, y + h - 5, 2, 3, LAMP);
  px(g, bx, y + 2, 2, 3, LAMP_RED);   px(g, bx, y + h - 5, 2, 3, LAMP_RED);
}

/**
 * A log. Same reasoning as the car: the generator picks 2-4 cells of
 * width, so it is drawn rather than stamped.
 *
 * The end grain is the thing that makes it read as a cut log rather than
 * a brown bar, so both ends get rings.
 */
export function log(g, x, y, w, h) {
  px(g, x, y, w, h, P.ink);
  px(g, x + 1, y + 1, w - 2, h - 2, P.wood3);
  px(g, x + 1, y + 1, w - 2, 2, P.wood2);       // lit top
  px(g, x + 1, y + 2, w - 2, 1, P.wood1);
  px(g, x + 1, y + h - 3, w - 2, 2, P.wood4);   // shaded underside

  // bark: short dark nicks along the length, at whole-pixel spacing
  for (let i = 4; i < w - 4; i += 5) {
    px(g, x + i, y + 4, 1, h - 8, P.wood4);
    px(g, x + i + 1, y + 5, 1, h - 10, P.wood2);
  }
  // end grain, both ends
  for (const ex of [x + 1, x + w - 4]) {
    px(g, ex, y + 2, 3, h - 4, P.wood2);
    px(g, ex + 1, y + 4, 1, h - 8, P.wood1);
    px(g, ex + 1, y + (h >> 1) - 1, 1, 2, P.wood4);
  }
}
