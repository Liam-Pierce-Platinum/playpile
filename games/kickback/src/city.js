/* =====================================================================
   city.js — downtown Manhattan, across the water
   =====================================================================
   The view is from a warehouse on the far shore looking at the tip of the
   island: sky, then the skyline, then a mile of harbour, then the pier
   you are standing over.

   THE TOWERS ARE REAL ONES, at their real relative heights. One World
   Trade is 541 metres, 70 Pine is 290, the Woolworth is 241, and every
   one of them here is that number times the same scale. That is the whole
   difference between "a skyline" and "downtown Manhattan": the eye does
   not know the numbers but it knows the shape, and the shape is one
   enormous tapering spire with a shoulder of glass round it and a scatter
   of stone crowns from the twenties standing in front.

   THE CROWNS ARE THE IDENTITY. At this size a tower is nine pixels wide,
   so the body of it says nothing at all - everything you recognise is in
   the last twenty pixels at the top. The pyramid on 40 Wall, the stepped
   deco cap on 70 Pine, the green-copper mansard on the Woolworth, the
   jenga stagger of 56 Leonard, the antenna over One WTC. Those are
   modelled and the rest is a box.

   IT IS DRAWN ONCE. The whole backdrop is rendered into a wide offscreen
   buffer at load and then blitted with a parallax offset, so panning
   along the building costs one drawImage rather than four hundred
   polygons a frame.
   ===================================================================== */
import { W, H, P, px, ditherRamp, ditherBand, hash, rng } from './pix.js';

const BW = 1080, BH = 270;          // the backdrop buffer: wider than the screen
export const WATERLINE = 196;        // screen row of the far shore, at camY 0
const SCALE = 0.244;                 // pixels per metre of real building height

/* ---- what is actually over there ----------------------------------------
   [x, real height in metres, width px, crown, name]. x is measured across
   the buffer; the cluster round the Trade Center sits left of centre and
   the older financial district stone runs off to the right, which is how
   the island reads from the harbour. */
const TOWERS = [
  [286, 225, 17, 'hip', '200 Vesey'],
  [305, 226, 14, 'flat', '7 WTC'],
  [322, 541, 21, 'onewtc', 'One World Trade Center'],
  [348, 329, 15, 'slant', '3 WTC'],
  [366, 298, 14, 'flat', '4 WTC'],
  [383, 226, 12, 'flat', 'One Liberty Plaza'],
  [400, 250, 13, 'jenga', '56 Leonard'],
  [416, 241, 14, 'mansard', 'Woolworth'],
  [434, 265, 12, 'ripple', '8 Spruce'],
  [449, 282, 13, 'setback', '30 Park Place'],
  [466, 290, 14, 'deco', '70 Pine'],
  [484, 283, 13, 'pyramid', '40 Wall'],
  [500, 195, 15, 'flat', '1 New York Plaza'],
  [517, 172, 11, 'round', '17 State'],
  [531, 140, 13, 'flat', '55 Water'],
];
/* and a low rank of everything else, so the island has a base to it */
const FILLERS = 46;

let buf = null, bctx = null;

function tower(c, x, hMetres, w, crown, rand, band) {
  const h = Math.round(hMetres * SCALE);
  const base = WATERLINE;
  const top = base - h;
  /* three values per rank: the lit face, the body, and the shadow side.
     Which rank a tower is in comes from how far back it is - and that is
     the only depth cue there is, so it does the work of all of them. */
  const body = [P.city1, P.city2, P.city3][band];
  const lit = [P.city2, P.city3, P.city4][band];
  const dark = [P.sea1, P.city1, P.city2][band];

  const put = (bx, by, bw, bh, col) => {
    c.fillStyle = col;
    c.fillRect(Math.round(bx), Math.round(by), Math.max(1, Math.round(bw)), Math.max(1, Math.round(bh)));
  };

  /* the shaft */
  put(x, top, w, h, body);
  put(x, top, Math.max(1, w * 0.3), h, lit);          // sun down the west face
  put(x + w - 1, top, 1, h, dark);                    // and the shaded corner

  /* the crowns - the only part anybody recognises */
  if (crown === 'onewtc') {
    /* One WTC: a square base that twists into a rotated square at the top,
       so in silhouette it is a long taper - then a mast half as tall again
       as the top of the building. Both are unmistakable. */
    for (let i = 0; i < h; i++) {
      const t = i / h;
      const ww = Math.round(w * (1 - t * 0.42));
      const bx = x + Math.round((w - ww) / 2);
      put(bx, base - i - 1, ww, 1, body);
      put(bx, base - i - 1, Math.max(1, ww * 0.3), 1, lit);
      put(bx + ww - 1, base - i - 1, 1, 1, dark);
    }
    const tw = Math.round(w * 0.58);
    const tx = x + Math.round((w - tw) / 2);
    put(tx - 1, top - 2, tw + 2, 3, lit);             // the parapet ring
    put(tx + Math.round(tw / 2) - 1, top - 26, 2, 26, body);   // the mast
    put(tx + Math.round(tw / 2) - 1, top - 26, 1, 26, lit);
    put(tx + Math.round(tw / 2) - 2, top - 14, 4, 2, dark);
  } else if (crown === 'pyramid') {
    /* 40 Wall: a steep green pyramid and a needle */
    for (let i = 0; i < 11; i++) {
      const ww = Math.max(1, w - i * 1.2);
      put(x + (w - ww) / 2, top - i - 1, ww, 1, i > 6 ? lit : body);
    }
    put(x + w / 2 - 0.5, top - 20, 1, 9, lit);
  } else if (crown === 'deco') {
    /* 70 Pine: a stepped deco lantern, each step half the last */
    let ww = w, ty = top;
    for (let i = 0; i < 4; i++) {
      ww = Math.max(2, ww * 0.72);
      put(x + (w - ww) / 2, ty - 4, ww, 4, i % 2 ? lit : body);
      ty -= 4;
    }
    put(x + w / 2 - 0.5, ty - 7, 1, 7, lit);
  } else if (crown === 'mansard') {
    /* the Woolworth: a tall stone tower rising out of the block, with the
       green copper roof that everything else downtown is measured against */
    const tw = Math.max(3, Math.round(w * 0.5));
    const tx = x + Math.round((w - tw) / 2);
    put(tx, top - 16, tw, 16, body);
    put(tx, top - 16, Math.max(1, tw * 0.34), 16, lit);
    for (let i = 0; i < 7; i++) {
      const ww = Math.max(1, tw - i * 0.8);
      put(tx + (tw - ww) / 2, top - 16 - i - 1, ww, 1, '#3f7a68');
    }
    put(tx + tw / 2 - 0.5, top - 29, 1, 6, '#3f7a68');
  } else if (crown === 'jenga') {
    /* 56 Leonard: the stagger, which is all anybody calls it */
    for (let i = 0; i < 6; i++) {
      const off = ((i % 2) ? 3 : -2);
      put(x + off, top - i * 3 - 3, w, 3, i % 2 ? lit : body);
    }
  } else if (crown === 'ripple') {
    /* 8 Spruce: the west face is a rippled curtain wall - at this size it
       is a column of one-pixel notches, and that is enough */
    for (let i = 0; i < h; i += 3)
      put(x + (((i / 3) | 0) % 2 ? 0 : 1), base - i, 1, 2, lit);
    put(x, top - 2, w, 2, lit);
  } else if (crown === 'setback') {
    let ww = w, ty = top;
    for (let i = 0; i < 3; i++) {
      ww = Math.max(2, ww * 0.68);
      put(x + (w - ww) / 2, ty - 5, ww, 5, body);
      put(x + (w - ww) / 2, ty - 5, Math.max(1, ww * 0.34), 5, lit);
      ty -= 5;
    }
  } else if (crown === 'slant') {
    for (let i = 0; i < 7; i++) put(x, top - i - 1, Math.max(1, w - i * 1.6), 1, body);
  } else if (crown === 'hip') {
    for (let i = 0; i < 6; i++) {
      const ww = Math.max(2, w - i * 2.2);
      put(x + (w - ww) / 2, top - i - 1, ww, 1, i > 3 ? lit : body);
    }
  } else if (crown === 'round') {
    for (let i = 0; i < 4; i++) put(x + i * 0.5, top - i - 1, Math.max(1, w - i), 1, body);
  } else {
    put(x, top - 2, w, 2, dark);                       // a plain flat parapet
  }

  /* the windows. Not a grid - a grid at this size turns into moire. A
     scatter of lit rooms, denser low down where the offices still are. */
  const litCol = band === 2 ? P.city4 : P.city3;
  for (let i = 0; i < h * 0.5; i++) {
    const wy = base - 2 - Math.floor(rand() * h * 0.94);
    const wx = x + 1 + Math.floor(rand() * Math.max(1, w - 2));
    if (rand() > 0.5 - (base - wy) / h * 0.2) continue;
    put(wx, wy, 1, 1, litCol);
  }
  return { x, w, h, top, band, body, lit };
}

export function buildCity() {
  buf = document.createElement('canvas');
  buf.width = BW; buf.height = BH;
  const c = buf.getContext('2d');
  c.imageSmoothingEnabled = false;

  /* ---- the sky ---------------------------------------------------------
     Eight bands, dithered between, deep at the top and burning out to
     nearly white at the horizon. This is the only bright thing in the
     game and everything indoors is read against it. */
  {
    const tmp = document.createElement('canvas');
    tmp.width = BW; tmp.height = WATERLINE + 2;
    /* draw the ramp through the shared dither helper by borrowing the
       main context is not possible here, so it is inlined - same Bayer */
    const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
    const cols = [P.sky1, P.sky2, P.sky3, P.sky4, P.sky5, P.sky6, P.sun];
    const n = cols.length - 1;
    for (let j = 0; j < WATERLINE + 2; j++) {
      const f = Math.pow(j / (WATERLINE + 1), 1.5);
      const s = Math.min(n - 0.0001, f * n);
      const i0 = Math.floor(s), t = (s - i0) * 16;
      for (let i = 0; i < BW; i++) {
        c.fillStyle = BAYER[j & 3][i & 3] < t ? cols[i0 + 1] : cols[i0];
        c.fillRect(i, j, 1, 1);
      }
    }
  }

  /* ---- the far ranks, then the island ---------------------------------- */
  const rand = rng(20011);
  const built = [];
  /* a low blue haze of everything behind: Jersey on the left, Brooklyn on
     the right, nothing you can name */
  for (let i = 0; i < FILLERS; i++) {
    const x = 40 + rand() * (BW - 120);
    const h = 14 + rand() * 34;
    const w = 8 + rand() * 16;
    c.fillStyle = P.city1;
    c.fillRect(x | 0, WATERLINE - h, w | 0, h);
    c.fillStyle = P.city2;
    c.fillRect(x | 0, WATERLINE - h, 2, h);
  }
  /* the second rank, a shade nearer */
  for (let i = 0; i < 26; i++) {
    const x = 240 + rand() * 330;
    const h = 20 + rand() * 46;
    const w = 9 + rand() * 13;
    c.fillStyle = P.city2;
    c.fillRect(x | 0, WATERLINE - h, w | 0, h);
    c.fillStyle = P.city3;
    c.fillRect(x | 0, WATERLINE - h, 2, h);
  }
  /* and the ones with names on them */
  for (const [x, m, w, crown] of TOWERS) built.push(tower(c, x, m, w, crown, rand, 2));

  /* ---- the harbour ------------------------------------------------------
     Bands of blue getting darker toward the viewer, the reflection of the
     city broken into slices, and a path of glitter under the sun. */
  {
    const cols = [P.sea3, P.sea2, P.sea1];
    for (let j = WATERLINE; j < BH; j++) {
      const f = (j - WATERLINE) / (BH - WATERLINE);
      const s = Math.min(1.9999, f * 2);
      const i0 = Math.floor(s), t = (s - i0) * 16;
      const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
      for (let i = 0; i < BW; i++) {
        c.fillStyle = BAYER[j & 3][i & 3] < t ? cols[i0 + 1] : cols[i0];
        c.fillRect(i, j, 1, 1);
      }
    }
    /* THE REFLECTION. Each tower mirrored below the line, squashed to a
       little over half, and every row shifted a pixel or two sideways -
       which is exactly what a real reflection in chop does, and is the
       single thing that stops water from looking like a blue rectangle. */
    for (const b of built) {
      const rh = Math.round(b.h * 0.55);
      for (let j = 0; j < rh && WATERLINE + j < BH; j++) {
        const t = j / rh;
        const wob = Math.round(Math.sin(j * 0.55 + b.x) * 1.6 + Math.sin(j * 0.21) * 1.2);
        const wid = Math.max(1, Math.round(b.w * (1 - t * 0.12)));
        c.globalAlpha = 0.5 * (1 - t * 0.85);
        c.fillStyle = b.lit;
        c.fillRect(b.x + wob, WATERLINE + j, wid, 1);
        c.globalAlpha = 1;
      }
    }
    /* the chop: short bright dashes, denser toward the sun */
    for (let i = 0; i < 2400; i++) {
      const x = rand() * BW, y = WATERLINE + rand() * rand() * (BH - WATERLINE);
      const f = 1 - (y - WATERLINE) / (BH - WATERLINE);
      const near = 1 - Math.abs(x - 430) / 400;
      c.fillStyle = rand() < 0.25 + near * 0.5 ? P.sea4 : P.sea2;
      c.fillRect(x | 0, y | 0, 1 + ((rand() * 3) | 0), 1);
      if (rand() < 0.05 + Math.max(0, near) * 0.22 && f > 0.2)
        c.fillRect(x | 0, y | 0, 2 + ((rand() * 4) | 0), 1);
    }
    /* and a couple of boats, because a mile of empty water reads as paint */
    for (const [bx, by, s] of [[196, WATERLINE + 22, 1], [612, WATERLINE + 41, 1.6], [380, WATERLINE + 12, 0.7]]) {
      c.fillStyle = P.ink;
      c.fillRect(bx, by, 11 * s, 2 * s);
      c.fillRect(bx + 3 * s, by - 3 * s, 4 * s, 3 * s);
      c.fillStyle = P.sea4;
      c.fillRect(bx - 9 * s, by + 2 * s, 22 * s, 1);
    }
  }
  bctx = c;
  return buf;
}

/* ---- putting it on the screen ---------------------------------------------
   Parallax: a twelfth of the horizontal camera movement, a twentieth of
   the vertical. Small numbers on purpose. The skyline is two kilometres
   away, so it should barely move - and the little it does move is what
   tells you that you are the one moving. */
export function drawCity(ctx, cam) {
  if (!buf) buildCity();
  /* The window into the buffer has to be centred on the CLUSTER, not on
     the middle of the buffer - the named towers sit left of centre and the
     first version panned straight past them and showed the anonymous
     filler on the right. */
  const ox = Math.round(415 - W / 2 - cam.x * 2.4);
  const oy = Math.round(-cam.y * 1.6);
  const sx = Math.max(0, Math.min(BW - W, ox));
  ctx.drawImage(buf, sx, 0, W, BH, 0, oy, W, BH);
  /* below the buffer, the near water carries on to the bottom of the frame */
  if (oy + BH < H) px(0, oy + BH, W, H - (oy + BH), P.sea1);
  if (oy > 0) px(0, 0, W, oy, P.sky1);
}
