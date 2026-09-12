// =====================================================================
// HIGHRISE :: vendskin.js - THE VENDING MACHINE, IN OTHER COLOURS
// =====================================================================
//
// Liam: *"for the vending machine variants you made just make it the from
// the pack vending machine just with that orangish cream main color and
// swap that textures color for a different one and for the texture for
// the stuff inside of the vending machine you can delete some and swap
// some of the items around"*.
//
// WHAT WAS WRONG. `vending` is the pack mesh - mesh 11 of the PS1 set,
// 35 triangles with a printed 256 sheet. `vendingA/B/C` were not: no
// entry existed for them in refprops, so they fell through to the
// procedural builder in props.js, which draws a whole machine out of
// boxes from a seed. Three completely different machines standing next
// to the real one.
//
// So the variants are the pack mesh too. What varies is the PAINT, which
// is what varies between two real vending machines: same box, different
// livery, different stock.
//
// ---------------------------------------------------------------------
// HOW THE SHEET IS LAID OUT
// ---------------------------------------------------------------------
//
// Read off the atlas with tools/vendtex.mjs, at 256 x 256:
//
//   the machine occupies u 0.004..0.831, v 0.004..0.996
//   its shell is warm cream - #c5ac95 on the door, #ad957f on the band,
//   #776653 on the ribbed panels
//   the glazed front, with the goods behind it, is x 14..74, y 130..256
//   inside that the product shelves run y 167..256 in five rows
//
// The shell is recoloured by rotating hue and holding lightness, so the
// grain, the scuffs and the shading all survive - a flat repaint would
// throw away everything that makes the pack texture look like a pack
// texture. The goods rectangle is left out of that pass, because a red
// machine does not have red crisps in it.
//
// EACH VARIANT GETS ITS OWN COPY of the sheet. The atlas is shared by
// fifteen props - the dumpster, the pallet, the payphone and the rest are
// all on it - so painting it in place would turn half the street blue.

/** rgb 0..255 -> hsl 0..1 */
function toHSL(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  const l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn;
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h;
  if (mx === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (mx === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hue2rgb(p, q, t) {
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
}

/** hsl 0..1 -> rgb 0..255 */
function toRGB(h, s, l) {
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
          Math.round(hue2rgb(p, q, h) * 255),
          Math.round(hue2rgb(p, q, h - 1 / 3) * 255)];
}

// ---------------------------------------------------------------------
// THE THREE LIVERIES
// ---------------------------------------------------------------------
//
// `hue` is where the shell ends up; `sat` scales what chroma the pixel
// already had, so the flat panels stay nearly flat and the dirty corners
// stay dirty. `lift` nudges lightness, because a dark blue machine and a
// pale mint one are different objects even at the same hue.
//
// The plain `vending` is untouched: it stays the orangish cream the pack
// came in, which is the one he wants kept.
export const LIVERY = {
  A: { hue: 0.58, sat: 0.85, lift: -0.04, name: 'blue' },    // cold blue-grey
  B: { hue: 0.02, sat: 1.15, lift: -0.02, name: 'red' },     // drinks-machine red
  C: { hue: 0.33, sat: 0.70, lift: +0.01, name: 'green' },   // institutional green
};

// the glazed front, as fractions of the sheet - so this survives the
// texture being a different size
const GOODS = { x0: 14 / 256, y0: 130 / 256, x1: 74 / 256, y1: 1 };
// ---- AND THE SHELVES INSIDE IT, MEASURED ---------------------------
//
// Not read off a screenshot. Averaging brightness down each column and
// across each row of the atlas gives the rack's own structure: the
// product columns run x 20..60 and fall off a cliff at 61, the shelf
// bars are the dark rows at y 155-162, 177, 190, 201-204, 221-224 and
// 239, and the bright bands between them are the goods.
//
// x 69 is a spike of 163 against a local average of 20 - the polished
// edge of the door - and the first pass had the shelf running to x 71,
// so every swap dragged that white strip into the middle of a shelf.
// That is the bright vertical bar in the first render.
const SHELF = { x0: 20 / 256, x1: 60 / 256 };
const ROWS = [[163, 177], [179, 190], [191, 201], [205, 221], [225, 239]]
  .map(([a, b]) => [a / 256, b / 256]);

/**
 * A repainted, restocked copy of the pack's sheet.
 *
 * `image` is the atlas the pack loaded; the result is a canvas the caller
 * wraps in a texture. Deterministic per variant: B is always the same B,
 * which is the whole point of having named variants at all.
 */
export function vendingSkin(image, which) {
  const L = LIVERY[which] || LIVERY.A;
  const W = image.width, H = image.height;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(image, 0, 0);
  const im = x.getImageData(0, 0, W, H);
  const d = im.data;

  const gx0 = Math.round(GOODS.x0 * W), gx1 = Math.round(GOODS.x1 * W);
  const gy0 = Math.round(GOODS.y0 * H), gy1 = Math.round(GOODS.y1 * H);

  // ---- 1. THE PAINT -------------------------------------------------
  //
  // Everything except the glazed front. Hue is replaced outright rather
  // than rotated: the shell is all one colour to begin with, so rotating
  // it by a fixed amount would keep the differences between the panels
  // and lose the point, while replacing it keeps LIGHTNESS - which is
  // where the grain and the shadows live - and repaints the rest.
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      if (px >= gx0 && px < gx1 && py >= gy0 && py < gy1) continue;   // the goods
      const i = (py * W + px) * 4;
      if (d[i + 3] === 0) continue;
      const [, s, l] = toHSL(d[i], d[i + 1], d[i + 2]);
      // BLACK STAYS BLACK. The sheet's unused margin and the machine's
      // own shadow lines are near-zero lightness, and painting those
      // turns every crevice into a coloured smear.
      if (l < 0.06) continue;
      const [r2, g2, b2] = toRGB(L.hue,
        Math.min(1, s * L.sat),
        Math.max(0, Math.min(1, l + L.lift)));
      d[i] = r2; d[i + 1] = g2; d[i + 2] = b2;
    }
  }

  // ---- 2. THE STOCK -------------------------------------------------
  //
  // Liam: *"you can delete some and swap some of the items around"*.
  //
  // Five shelves, four cells each. Some cells are sold out - filled with
  // the dark of the shelf behind, which is what an empty coil looks like
  // - and some are swapped with another cell on the same shelf, which
  // reads as a machine stocked by somebody else.
  //
  // Same shelf only: the rows are different heights, and swapping across
  // them would put half a bottle among the crisps.
  let seed = 0x9e37 ^ (which.charCodeAt(0) * 2654435761);
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

  // ---- EVERY CELL THE SAME WIDTH, IN WHOLE PIXELS -------------------
  //
  // This divided the shelf into four and rounded each edge, so cells came
  // out 10 and 11 pixels wide depending on where they fell. Copying an
  // 11-wide block into a 10-wide slot walks the destination one pixel
  // further every row, which is a shear - and the first render had white
  // diagonal streaks torn across three shelves because of it. A single
  // integer width, with the remainder left as untouched margin at the
  // right, cannot do that.
  const sx0 = Math.round(SHELF.x0 * W), sx1 = Math.round(SHELF.x1 * W);
  const cellW = Math.floor((sx1 - sx0) / 4);
  const cellX = (cx) => sx0 + cx * cellW;

  const cut = (cx, ry0, ry1) => {
    const x0 = cellX(cx);
    const out = new Uint8ClampedArray(cellW * (ry1 - ry0) * 4);
    let k = 0;
    for (let py = ry0; py < ry1; py++)
      for (let px = x0; px < x0 + cellW; px++) {
        const i = (py * W + px) * 4;
        out[k++] = d[i]; out[k++] = d[i + 1]; out[k++] = d[i + 2]; out[k++] = d[i + 3];
      }
    return out;
  };
  const paste = (buf, cx, ry0, ry1) => {
    const x0 = cellX(cx);
    let k = 0;
    for (let py = ry0; py < ry1; py++)
      for (let px = x0; px < x0 + cellW; px++) {
        const i = (py * W + px) * 4;
        d[i] = buf[k++]; d[i + 1] = buf[k++];
        d[i + 2] = buf[k++]; d[i + 3] = buf[k++];
      }
  };

  for (const [f0, f1] of ROWS) {
    const ry0 = Math.round(f0 * H), ry1 = Math.round(f1 * H);
    if (ry1 <= ry0) continue;

    // the dark of this shelf: the tenth-percentile lightness across it,
    // which is the gap behind the product rather than any one item
    const dark = [];
    for (let py = ry0; py < ry1; py++)
      for (let px = sx0; px < sx0 + cellW * 4; px++) {
        const i = (py * W + px) * 4;
        dark.push([(d[i] * 3 + d[i + 1] * 6 + d[i + 2]) / 10, i]);
      }
    dark.sort((a, b) => a[0] - b[0]);
    const pick2 = dark[Math.floor(dark.length * 0.1)][1];
    const back = [d[pick2], d[pick2 + 1], d[pick2 + 2]];

    // one or two sold out on this shelf
    const gone = new Set();
    const n = rnd() < 0.45 ? 2 : 1;
    while (gone.size < n) gone.add((rnd() * 4) | 0);
    for (const cx of gone) {
      const x0 = cellX(cx);
      for (let py = ry0; py < ry1; py++)
        for (let px = x0; px < x0 + cellW; px++) {
          const i = (py * W + px) * 4;
          // not flat: a fifth of what was there survives, so an empty
          // slot keeps the shelf's own shading and still has a back and
          // a floor rather than being a hole cut in the picture
          const k = 0.8;
          d[i] = back[0] * k + d[i] * (1 - k);
          d[i + 1] = back[1] * k + d[i + 1] * (1 - k);
          d[i + 2] = back[2] * k + d[i + 2] * (1 - k);
        }
    }

    // and one swap between two that are still stocked
    const left = [0, 1, 2, 3].filter((q) => !gone.has(q));
    if (left.length >= 2) {
      const a = left[(rnd() * left.length) | 0];
      let b2 = left[(rnd() * left.length) | 0];
      if (b2 === a) b2 = left[(left.indexOf(a) + 1) % left.length];
      if (b2 !== a) {
        const ca = cut(a, ry0, ry1), cb = cut(b2, ry0, ry1);
        paste(cb, a, ry0, ry1);
        paste(ca, b2, ry0, ry1);
      }
    }
  }

  x.putImageData(im, 0, 0);
  return c;
}
