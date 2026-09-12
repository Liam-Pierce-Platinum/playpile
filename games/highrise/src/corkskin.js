// =====================================================================
// HIGHRISE :: corkskin.js - THE SAME NOTICEBOARD, RE-PINNED
// =====================================================================
//
// Liam: *"now do that for the pin boards too use the cork and make those
// poster flyer things use those textures and all that just make the order
// of the flyers and all of that slightly different"*.
//
// Same job as vendskin.js and the same reason. `pinboard` was procedural:
// a chrome frame, a flat cork panel and nine plain white boxes pinned to
// it at random. The office pack has a real one - mesh 7, the large
// corkboard - and its 256 x 128 sheet has a wooden frame, proper cork,
// a red poster, two typed letters, a stamped docket and four yellow
// notes printed on it. That is the art; the boxes were a stand-in for it.
//
// So the pinboards are the pack board. What varies is the ARRANGEMENT:
// each one erases the flyers back to bare cork and pins them up again in
// a different order, at different places, at slight angles, with one or
// two left off. Which is what a noticeboard in a different corridor
// looks like - the same notices, put up by somebody else.
//
// ---------------------------------------------------------------------
// WHERE EVERYTHING IS ON THE SHEET
// ---------------------------------------------------------------------
//
// Measured off the atlas at 256 x 128 (tools/packtex.mjs, then a grid):
//
//   the wooden frame     the border outside x 27..238, y 18..115
//   bare cork            x 150..200 is the cleanest run of it
//   red poster           x 36..96,  y 27..113
//   typed letter         x 72..116, y 32..93
//   angled letter        x 110..150, y 48..102
//   stamped docket       x 107..150, y 95..110
//   four yellow notes    x 202..243, y 30..96
//
// Everything below is in fractions of the sheet, so it survives the
// texture being loaded at a different size.
const F = (x0, y0, x1, y1, name, big) => ({
  x0: x0 / 256, y0: y0 / 128, x1: x1 / 256, y1: y1 / 128, name, big: !!big,
});

// THE BOARD ITSELF - the cork inside the frame. Nothing is pinned outside
// this, or it lands on the woodwork.
//
// x 30..235, y 21..112 was read off a magnified grid and it was too
// tight: scanning the wiped board for surviving poster-red found it at
// x 25..38 and y 14..107, and paper at y 18..20 - all of it OUTSIDE the
// rectangle, left behind as a red L down the left edge and a pale line
// along the top. These bounds come from that scan instead, and stop
// clear of the frame, whose innermost wood is at x 15 and y 9.
const BOARD = F(21, 13, 241, 116, 'board');

// ---------------------------------------------------------------------
// THE NOTICES ARE FOUND, NOT LISTED
// ---------------------------------------------------------------------
//
// A hand-written table of rectangles was the first attempt and it was
// wrong by about nine pixels on every entry - enough that the poster came
// out as a small red square and its real left edge was left behind on the
// board. Reading them off a magnified screenshot is not a measurement.
//
// So they are detected: three colour classes, connected components of
// each, and the component's own bounding box. Which cannot drift, and
// picks up the fact that the stamped docket touches the angled letter and
// is really one piece of paper overlapping another.
//
// The `big` classes go up first so the small notes land on top of them,
// the way they were pinned.
const CLASSES = [
  { name: 'poster', big: true, side: 'left',
    test: (r, g, b) => r > 110 && r - g > 50 && g - b < 30 },
  { name: 'paper', big: false, side: 'left',
    test: (r, g, b) => r > 200 && g > 195 && b > 180 },
  { name: 'note', big: false, side: 'right',
    test: (r, g, b) => r > 195 && g > 185 && b > 120 && b < 185
      && r - b > 35 && r - b < 95 },
];

/**
 * Is this pixel bare cork?
 *
 * THE GREEN CHANNEL IS THE WHOLE TEST. My first attempt asked for warm,
 * mid-toned and red-above-green-above-blue, and the RED POSTER passes all
 * three - it is warm, it is mid, and its channels descend. It is also far
 * flatter than speckled cork, so a "least varying" search went straight
 * to the middle of it and tiled the poster across the entire board.
 *
 * Cork sits at roughly (200, 150, 100): green is halfway between red and
 * blue. The poster is nearer (180, 80, 60): green has collapsed onto
 * blue. So the discriminator is where green falls in the red-to-blue
 * span, and it separates them cleanly.
 */
const isCork = (r, g, b) => r > g && g > b
  && r > 120 && r < 245
  && (r - b) > 30 && (r - b) < 150
  && (g - b) > (r - b) * 0.35;

/**
 * The most cork-like window on the board.
 *
 * Scored by how MUCH of the window is cork rather than by how flat it is,
 * because cork is not flat - being speckled is what it is - and anything
 * that scores well on flatness is by definition a printed flyer.
 */
function findCork(src, W, H, bd) {
  const S = 20;
  const d = src.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, W, H).data;
  const cand = [];
  for (let y = bd.y + 2; y + S < bd.y + bd.h - 2; y += 2) {
    for (let x2 = bd.x + 2; x2 + S < bd.x + bd.w - 2; x2 += 2) {
      let hit = 0;
      for (let j = 0; j < S; j++) for (let i = 0; i < S; i++) {
        const k = ((y + j) * W + x2 + i) * 4;
        if (isCork(d[k], d[k + 1], d[k + 2])) hit++;
      }
      cand.push({ x: x2, y, w: S, h: S, hit });
    }
  }
  cand.sort((a, b) => b.hit - a.hit);
  // ---- SEVERAL PATCHES, NOT ONE -------------------------------------
  //
  // One patch tiled across a 220-pixel board repeats eleven times over
  // and five down, and cork has enough character in it - a pin hole, a
  // dark fleck - that the repeat reads as a lattice rather than as cork.
  // Flipping each tile helped and did not fix it. Half a dozen patches
  // drawn from different parts of the board, picked at random per tile,
  // does: there is no motif left to line up.
  //
  // They are spaced out so they are not six overlapping copies of the
  // same twenty pixels.
  const out = [];
  for (const q of cand) {
    if (out.length >= 6) break;
    if (out.every((p) => Math.abs(p.x - q.x) > S || Math.abs(p.y - q.y) > S)) out.push(q);
  }
  return out.length ? out : [{ x: bd.x, y: bd.y, w: S, h: S }];
}

/**
 * Every notice on the board, as its own little RGBA canvas.
 *
 * PER-PIXEL, NOT PER-RECTANGLE. The notices overlap - the typed letter
 * sits across the poster - so cutting a letter out as a rectangle brings
 * a wedge of poster-red along with it, and pinning that up somewhere else
 * puts a red fringe on bare cork.
 *
 * So each one is cut through its own mask and everything outside is
 * transparent. That also lets them be rotated and laid over each other in
 * the new arrangement without any of them carrying a background.
 *
 * The mask is filled by ROW SPANS - from the first matching pixel in a
 * row to the last - because a colour test punches holes through the black
 * text on a white letter, and a sheet of paper is convex enough that its
 * span is its shape.
 */
function findFlyers(src, W, H, bd) {
  const d = src.getContext('2d', { willReadFrequently: true })
    .getImageData(0, 0, W, H).data;
  const out = [];
  for (const cls of CLASSES) {
    const mark = new Uint8Array(W * H);
    for (let y = bd.y; y < bd.y + bd.h; y++)
      for (let x = bd.x; x < bd.x + bd.w; x++) {
        const k = (y * W + x) * 4;
        if (cls.test(d[k], d[k + 1], d[k + 2])) mark[y * W + x] = 1;
      }
    const seen = new Uint8Array(W * H);
    for (let y = bd.y; y < bd.y + bd.h; y++)
      for (let x = bd.x; x < bd.x + bd.w; x++) {
        const s = y * W + x;
        if (!mark[s] || seen[s]) continue;
        // one notice: flood it, keeping its bounds and its cells
        let x0 = x, y0 = y, x1 = x, y1 = y, n = 0;
        const cells = [], st = [s];
        seen[s] = 1;
        while (st.length) {
          const k = st.pop(); n++; cells.push(k);
          const kx = k % W, ky = (k / W) | 0;
          if (kx < x0) x0 = kx; if (kx > x1) x1 = kx;
          if (ky < y0) y0 = ky; if (ky > y1) y1 = ky;
          for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1],
                                  [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
            const nx = kx + ox, ny = ky + oy;
            if (nx < bd.x || ny < bd.y || nx >= bd.x + bd.w || ny >= bd.y + bd.h) continue;
            const q = ny * W + nx;
            if (mark[q] && !seen[q]) { seen[q] = 1; st.push(q); }
          }
        }
        if (n < 90) continue;                     // a speck, not a notice

        // ---- SPANS BOTH WAYS ------------------------------------------
        //
        // Row spans alone gave a torn-looking sheet: where a letter's
        // edge is shaded the colour test drops out for a few pixels, and
        // a row whose first and last hit are both inside the real edge
        // comes out short. Filling columns as well and taking the union
        // closes those, because a notch has to be missed by BOTH passes
        // to survive, and paper is convex enough that it never is.
        const w = x1 - x0 + 1, h = y1 - y0 + 1;
        const fill = new Uint8Array(w * h);
        const rows = new Int32Array(h * 2).fill(-1);
        const cols = new Int32Array(w * 2).fill(-1);
        for (const k of cells) {
          const kx = (k % W) - x0, ky = ((k / W) | 0) - y0;
          if (rows[ky * 2] < 0 || kx < rows[ky * 2]) rows[ky * 2] = kx;
          if (kx > rows[ky * 2 + 1]) rows[ky * 2 + 1] = kx;
          if (cols[kx * 2] < 0 || ky < cols[kx * 2]) cols[kx * 2] = ky;
          if (ky > cols[kx * 2 + 1]) cols[kx * 2 + 1] = ky;
        }
        for (let ky = 0; ky < h; ky++) {
          const a = rows[ky * 2];
          if (a < 0) continue;
          for (let kx = a; kx <= rows[ky * 2 + 1]; kx++) fill[ky * w + kx] = 1;
        }
        for (let kx = 0; kx < w; kx++) {
          const a = cols[kx * 2];
          if (a < 0) continue;
          for (let ky = a; ky <= cols[kx * 2 + 1]; ky++) fill[ky * w + kx] = 1;
        }
        const cut = document.createElement('canvas');
        cut.width = w; cut.height = h;
        const cx2 = cut.getContext('2d');
        const im2 = cx2.createImageData(w, h);
        for (let ky = 0; ky < h; ky++)
          for (let kx = 0; kx < w; kx++) {
            if (!fill[ky * w + kx]) continue;
            const from = ((y0 + ky) * W + x0 + kx) * 4, to = (ky * w + kx) * 4;
            im2.data[to] = d[from]; im2.data[to + 1] = d[from + 1];
            im2.data[to + 2] = d[from + 2]; im2.data[to + 3] = 255;
          }
        cx2.putImageData(im2, 0, 0);
        out.push({ name: cls.name, big: cls.big, side: cls.side,
          x: x0, y: y0, w, h, cut });
      }
  }
  return out;
}

/**
 * A copy of the pack's corkboard sheet with the notices rearranged.
 *
 * `image` is the atlas as loaded; the result is a canvas for a texture.
 * Deterministic per variant - B is always the same B - because a
 * noticeboard that reshuffles itself every time the floor is built is
 * not a prop, it is a distraction.
 */
export function corkSkin(image, which, opts = {}) {
  const W = image.width, H = image.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingEnabled = false;
  x.drawImage(image, 0, 0);

  // KEEP AN UNTOUCHED COPY TO CUT FROM. The flyers have to be lifted off
  // before the board is wiped, or every one of them would be lifted off
  // a board that has already had it erased.
  const src = document.createElement('canvas');
  src.width = W; src.height = H;
  src.getContext('2d').drawImage(image, 0, 0);

  let seed = 0x1f35 ^ (String(which).charCodeAt(0) * 2654435761);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const range = (a, b) => a + rnd() * (b - a);

  const px = (f) => ({
    x: Math.round(f.x0 * W), y: Math.round(f.y0 * H),
    w: Math.round((f.x1 - f.x0) * W), h: Math.round((f.y1 - f.y0) * H),
  });

  // ---- 1. STRIP THE BOARD -------------------------------------------
  //
  // WIPE THE WHOLE INTERIOR, not each flyer's rectangle. Two reasons,
  // both learned the hard way on the first attempt:
  //
  //   the rectangles are approximations. The printed flyers have soft
  //   drop shadows and the angled letter's corners run outside any box
  //   you draw round it, so per-flyer patching left slivers of white and
  //   red behind - ghosts of notices that had been taken down.
  //
  //   and they overlap. Patching one put cork over part of its
  //   neighbour, which then had to be patched too.
  //
  // The whole board under the notices is cork, so covering all of it and
  // starting again cannot leave anything behind.
  //
  // AND THE PATCH HAS TO BE ACTUALLY CLEAN. A hand-picked "clean run"
  // turned out to clip the edge of the angled letter, and tiling it
  // stamped that sliver across the board twenty times - the red bars in
  // the first render. So the patch is FOUND: the least varying window on
  // the board that is still cork-coloured.
  const bd = px(BOARD);
  const patches = findCork(src, W, H, bd);
  const P0 = patches[0];
  for (let yy = bd.y; yy < bd.y + bd.h; yy += P0.h - 2) {
    for (let xx = bd.x; xx < bd.x + bd.w; xx += P0.w - 2) {
      const patch = patches[(rnd() * patches.length) | 0];
      const cw = Math.min(patch.w, bd.x + bd.w - xx);
      const ch = Math.min(patch.h, bd.y + bd.h - yy);
      // a random flip on top of the random patch
      x.save();
      x.translate(xx + cw / 2, yy + ch / 2);
      x.scale(rnd() < 0.5 ? -1 : 1, rnd() < 0.5 ? -1 : 1);
      x.drawImage(src, patch.x, patch.y, cw, ch, -cw / 2, -ch / 2, cw, ch);
      x.restore();
    }
  }

  // `bare` stops here, with an empty board. Only tools/corkstep.mjs asks
  // for it: when something red was left on the finished board there was
  // no way to tell whether the wipe had missed it or a paste had put it
  // there, and guessing at that twice is slower than being able to look.
  if (opts.bare) return c;

  // ---- 2. PIN THEM UP AGAIN -----------------------------------------
  //
  // A different order, a different place, a slight angle, and one or two
  // not put back at all. The poster is kept on the left half and the
  // notes on the right, because a big poster in the corner of a small
  // board just looks like a mistake - what changes is where within that.

  const order = findFlyers(src, W, H, bd);
  for (let i = order.length - 1; i > 0; i--) {          // shuffle
    const j = (rnd() * (i + 1)) | 0;
    const t = order[i]; order[i] = order[j]; order[j] = t;
  }
  // ---- ONE OR TWO NEVER GO BACK UP ----------------------------------
  //
  // But never the poster. It is the only large block of colour on the
  // board and dropping it leaves four bits of paper adrift on bare cork -
  // which is not "arranged differently", it is "mostly empty".
  // MARKED ON THE NOTICE, NOT BY INDEX. The indices were chosen here and
  // then the list was SORTED two lines later, so "drop number 0" stopped
  // meaning the notice it had been chosen for and started meaning
  // whatever sorted to the front - which was always the poster, the one
  // thing excluded from being dropped. That is why variant A came out
  // with no poster on it.
  const droppable = order.filter((f) => !f.big);
  const nDrop = Math.min(droppable.length, rnd() < 0.5 ? 2 : 1);
  for (let i = 0; i < nDrop; i++) {
    const pick2 = droppable[(rnd() * droppable.length) | 0];
    if (pick2) pick2.gone = true;
  }

  // big things first so the small notes end up on top of them
  order.sort((a, b) => (b.big ? 1 : 0) - (a.big ? 1 : 0));

  const put = [];
  order.forEach((f) => {
    if (f.gone) return;
    const r = f;
    // where it can go: inside the board, and biased to the side of it
    // this kind of thing belongs on
    const left = f.side === 'left';
    const zx0 = left ? bd.x : bd.x + Math.round(bd.w * 0.58);
    const zx1 = (left ? bd.x + Math.round(bd.w * 0.72) : bd.x + bd.w) - r.w;
    let nx = 0, ny = 0, ok = false;
    for (let a = 0; a < 24 && !ok; a++) {
      nx = Math.round(range(zx0, Math.max(zx0, zx1)));
      ny = Math.round(range(bd.y, Math.max(bd.y, bd.y + bd.h - r.h)));
      // do not stack the small notes exactly on each other
      ok = f.big || put.every((q) => Math.abs(q.x - nx) > q.w * 0.45
        || Math.abs(q.y - ny) > q.h * 0.45);
    }
    put.push({ x: nx, y: ny, w: r.w, h: r.h });
    // PAPER IS NEVER STRAIGHT. A few degrees is the difference between a
    // noticeboard and a spreadsheet.
    const ang = range(-0.075, 0.075);
    x.save();
    x.translate(nx + r.w / 2, ny + r.h / 2);
    x.rotate(ang);
    x.drawImage(f.cut, -r.w / 2, -r.h / 2);
    x.restore();
  });

  return c;
}
