// =====================================================================
// HIGHRISE :: tex.js - COMPLEX TEXTURES, SIMPLE MODELS
// =====================================================================
//
// Liam: *"really go for that nostalgic 2000s complex texture but not
// complex models feeling"*. That is a precise brief and it describes a
// real technique, not a vibe. A 2004 shooter had a triangle budget that
// could not spare geometry for a skirting board, a light switch or the
// grout between two tiles - so all of it went into the TEXTURE, at a
// resolution that was generous for the time, and the models stayed
// blocky. What reads as "that era" is the mismatch: flat, hard-edged
// geometry wearing a surface with far more information in it than the
// shape has.
//
// So every surface in this game is 256 or 512 pixels of hand-written
// pattern, and the rules are always the same three:
//
//   1. A BASE with real variation, never a flat fill.
//   2. HARD DETAIL on top - panel lines, grout, scuffs, stains, screws.
//      Hard, because a soft gradient is a 2010s normal map and reads as
//      the wrong decade.
//   3. GRIME LAST, unevenly, heavier in corners and along the floor.
//      Nothing in a New York office building is clean.
//
// Everything returns a THREE.CanvasTexture set to repeat, so a wall is
// two triangles and a 512-pixel surface.
import * as THREE from '../vendor/three.module.js';
import { rng } from './rng.js';

// =====================================================================
// WHAT LIAM'S REFERENCE PACK ACTUALLY TAUGHT
// =====================================================================
//
// He sent five assets - a bench, a bin, an axe, an extinguisher and a
// fifteen-piece office set - as *"exactly how everything should look"*.
// Rendered beside this project's own props (tools/ref.mjs) the gap was
// not subtle, and it was not about polygons. Three things:
//
//   1. NEAREST FILTERING. Every texture in the pack is sampler magFilter
//      9728. The hardware of that era could not filter texels, so a
//      surface up close is CHUNKY - and the eye reads the chunk before it
//      reads anything else. This project was drawing beautiful 512-pixel
//      sheets and then bilinear-filtering and 8x-anisotropy-ing every
//      last trace of the era straight back out of them.
//   2. SMALL. The pack is 128 pixels, with some textures at 64, 32, even
//      16. Not as a saving - as the LOOK. A 512 sheet has room for
//      detail nobody in 2004 could have painted, and the result reads as
//      a modern game pretending.
//   3. COLOUR. The reference set is red, green, teal, orange. This
//      project's palette was grey-beige from the carpet to the ceiling.
//
// One and two are this function. Three is in the surfaces below.
// ---- AND THEN LIAM LOOKED AT IT NEXT TO THE REFERENCES ------------
//
// *"recreate the textures and 3D models you make use the exact model and
// texture type that the references show right now they are too blocky and
// too pixelated"*.
//
// Everything above is true about his FIRST pack and I over-applied it.
// Reading the samplers out of all six reference files splits them clean
// in two:
//
//   asset_no_estilo_de_ps1    NEAREST / NEAREST      128-256 px
//   lata_de_lixo_de_ps1       NEAREST / NEAREST      128
//   office_pack_models        LINEAR / LINEAR_MIPMAP_LINEAR   256-1024
//   furniture_pack            LINEAR / LINEAR_MIPMAP_LINEAR   512-1024
//   garbage_pack_2            LINEAR / LINEAR_MIPMAP_LINEAR   256-1024
//   ps2_old_table             LINEAR / LINEAR_MIPMAP_LINEAR   512
//
// Four of the six - and every one of the second batch, which is what he
// has been pointing at since - are filtered and mipmapped. So the game
// was drawing its own surfaces at 128 pixels with point sampling and
// standing them next to imported models at 512 and 1024 with bilinear
// and mipmaps. That is the mismatch he is describing, and it is visible
// in every screenshot: the desks are smooth and the walls they stand on
// are chunky.
//
// So the house style now matches the packs he actually chose. Point
// sampling is gone, the sheets are four times the size, and the era is
// carried where it was always really carried - by flat shading, low
// polygon counts and painted-in value rather than by throwing away
// texels.
const NEAREST = false;
const cache = new Map();

// ---- THE SHEET SIZE -----------------------------------------------
//
// Doubled, and floored at 256: the 128s become 256 and the 256-cell
// fittings atlas becomes 512. The drawing code is written against `size`
// so it scales with it and nothing needs re-tuning.
//
// I went to 512/1024 first and it was 130 MB of texture with mipmaps for
// no visible gain - side by side with this the two are indistinguishable,
// because these are TILING surfaces and what you actually see is texels
// per metre, not texels per sheet. 512 only pays for itself on a sheet
// that is stretched over a whole object once, which is what the imported
// props are and what the walls and floors are not.
//
// 57 MB, and the pixelation Liam was seeing was never really the
// resolution anyway - it was the point sampling above.
const RES = (n) => Math.min(512, Math.max(256, n * 2));

function make(key, size0, draw) {
  if (cache.has(key)) return cache.get(key);
  const size = RES(size0);
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  // The drawing code is written against `size`, so it scales with it and
  // nothing has to be re-tuned when a surface drops from 256 to 128.
  x.imageSmoothingEnabled = false;
  draw(x, size, rng(hash(key)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (NEAREST) {
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestMipmapLinearFilter;
    t.anisotropy = 1;
  } else {
    // EXACTLY WHAT THE PACKS DECLARE: LINEAR magnification, trilinear
    // minification. Written out rather than left to three's defaults,
    // because the whole point is that this matches the reference files
    // and a default is not a statement of intent.
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    // Anisotropy is not in a glTF sampler at all, so there is nothing to
    // copy - it is the renderer's call. Four is enough to stop a corridor
    // floor smearing at a grazing angle without being the thing that
    // makes it look like a modern game.
    t.anisotropy = 4;
  }
  cache.set(key, t);
  return t;
}
function hash(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

// ---------------------------------------------------------------------
// the three shared passes
// ---------------------------------------------------------------------
/** speckle: the base variation that stops a fill being a fill */
function speckle(x, n, r, amt, size, dark) {
  for (let i = 0; i < n; i++) {
    const s = r.range(1, size * 0.012);
    x.fillStyle = 'rgba(' + (dark ? '0,0,0,' : '255,255,255,') + (r.range(0, amt)).toFixed(3) + ')';
    x.fillRect(r.range(0, size), r.range(0, size), s, s);
  }
}
/** fibre: short strokes, for carpet and fabric */
function fibre(x, n, r, size, len, alpha) {
  for (let i = 0; i < n; i++) {
    const px = r.range(0, size), py = r.range(0, size), a = r.range(0, Math.PI * 2);
    x.strokeStyle = 'rgba(' + (r.chance(0.5) ? '255,255,255,' : '0,0,0,') + r.range(0, alpha).toFixed(3) + ')';
    x.lineWidth = r.range(0.5, 1.4);
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len);
    x.stroke();
  }
}
/** grime: uneven soft dirt, heavier toward one or more edges */
function grime(x, r, size, amt, edges) {
  for (let i = 0; i < 26; i++) {
    const px = r.range(0, size), py = r.range(0, size);
    const rad = r.range(size * 0.06, size * 0.34);
    const g = x.createRadialGradient(px, py, 0, px, py, rad);
    g.addColorStop(0, 'rgba(20,16,12,' + r.range(0.02, amt).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(20,16,12,0)');
    x.fillStyle = g;
    x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
  }
  if (edges) {
    const g = x.createLinearGradient(0, size, 0, size * 0.72);
    g.addColorStop(0, 'rgba(14,11,8,' + (amt * 1.6).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(14,11,8,0)');
    x.fillStyle = g;
    x.fillRect(0, size * 0.72, size, size * 0.28);
  }
}
/** a hard scuff or scratch - no soft edges, this is the 2000s */
/**
 * Scratches, and they are drawn ON THE PIXEL GRID.
 *
 * Liam: *"the textures you made are too smooth not rigid and pixelated
 * enough"*.
 *
 * `make()` sets imageSmoothingEnabled = false, which stops canvas
 * INTERPOLATING an image it draws - and does nothing at all to a stroked
 * line, which is antialiased by the rasteriser regardless. So every
 * scratch, every crack and every panel line in this file was being laid
 * down as a soft two-or-three-pixel gradient. On a 128-pixel sheet at
 * arm's length that is most of the surface, and it is exactly the "not
 * rigid enough" complaint: the sheet was nearest-FILTERED and
 * antialias-DRAWN, so the chunky sampling had soft texels to sample.
 *
 * Snapping the endpoints to whole pixels and stepping the line as filled
 * 1x1 rects gives a hard, aliased, unmistakably-a-texel mark. It is a
 * Bresenham walk in eight lines and it is the difference between "a
 * texture with scratches on it" and "a scratched texture".
 *
 * Also: a scratch is only sometimes dark. A scuff on a painted surface
 * takes the paint OFF, so half of them are lighter than what they cross -
 * which is what stops a worn panel reading as a dirty one.
 */
function scratch(x, r, size, n, alpha) {
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2);
    const l = r.range(size * 0.03, size * 0.3);
    let px = Math.round(r.range(0, size)), py = Math.round(r.range(0, size));
    const ex = Math.round(px + Math.cos(a) * l), ey = Math.round(py + Math.sin(a) * l);
    const light = r.chance(0.42);
    x.fillStyle = (light ? 'rgba(255,252,244,' : 'rgba(0,0,0,')
      + r.range(alpha * 0.4, alpha).toFixed(3) + ')';
    const dx = Math.abs(ex - px), dy = Math.abs(ey - py);
    const sx = px < ex ? 1 : -1, sy = py < ey ? 1 : -1;
    let err = dx - dy;
    const w = r.chance(0.82) ? 1 : 2;
    for (let guard = 0; guard < 400; guard++) {
      x.fillRect(px, py, w, w);
      if (px === ex && py === ey) break;
      const e2 = err * 2;
      if (e2 > -dy) { err -= dy; px += sx; }
      if (e2 < dx) { err += dx; py += sy; }
    }
  }
}

// ---------------------------------------------------------------------
// the surfaces
// ---------------------------------------------------------------------
export const T = {
  /** office carpet tile - the single most 2000s-office surface there is */
  /**
   * BUTTONED LEATHER, for the armchair.
   *
   * Liam: *"make a new texture for the built in arm chair that matches
   * the rest and is more pixelated and less of that weird smoothness"*.
   *
   * It was wearing `metal` tinted brown - a smooth, faintly brushed
   * surface with nothing in it at this scale, which is exactly the "weird
   * smoothness" he is describing. A texture is supposed to be doing the
   * work the geometry cannot, and that one was doing none.
   *
   * "More pixelated" does not mean point sampling - that argument was
   * settled by the reference packs, see section 9 of STYLE.md. It means
   * VISIBLE, HARD-EDGED DETAIL: grain you can pick out, a seam you can
   * follow, wear that sits somewhere specific. Soft gradients are what
   * read as a modern normal map; hard marks at texel scale are what read
   * as 2003.
   *
   * So: a hide base with real tonal variation, a pebbled grain, the
   * panel seams and stitching an armchair actually has, buttons at the
   * intersections, and the shine worn off the places a person touches.
   */
  leather: (tint = '#5a3128') => make('leather' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);

    // ---- the hide: broad blotches, then a hard pebble grain ---------
    for (let i = 0; i < 90; i++) {
      const rad = r.range(s * 0.05, s * 0.22);
      x.fillStyle = 'rgba(' + (r.chance(0.5) ? '255,235,215,' : '0,0,0,')
        + r.range(0.015, 0.055).toFixed(3) + ')';
      x.beginPath();
      x.arc(r.range(0, s), r.range(0, s), rad, 0, 7);
      x.fill();
    }
    // PEBBLING, one texel at a time. This is the "pixelated" he is after:
    // marks the size of a texel, not a blur across forty of them.
    for (let i = 0; i < 4200; i++) {
      const px = r.range(0, s), py = r.range(0, s);
      const w2 = r.chance(0.75) ? 1 : 2;
      x.fillStyle = 'rgba(' + (r.chance(0.42) ? '255,228,205,' : '0,0,0,')
        + r.range(0.05, 0.20).toFixed(3) + ')';
      x.fillRect(px, py, w2, w2);
    }

    // ---- panel seams: two lines across, two down ---------------------
    const seam = (a2, b2, horiz) => {
      x.strokeStyle = 'rgba(0,0,0,0.42)'; x.lineWidth = 2;
      x.beginPath();
      if (horiz) { x.moveTo(0, a2); x.lineTo(s, a2); } else { x.moveTo(a2, 0); x.lineTo(a2, s); }
      x.stroke();
      // the lit side of the fold, one texel off it
      x.strokeStyle = 'rgba(255,232,210,0.16)'; x.lineWidth = 1;
      x.beginPath();
      if (horiz) { x.moveTo(0, a2 + 2); x.lineTo(s, a2 + 2); }
      else { x.moveTo(a2 + 2, 0); x.lineTo(a2 + 2, s); }
      x.stroke();
      // and the stitching along it - dashes, not a line
      x.fillStyle = 'rgba(232,214,188,0.34)';
      for (let d = 3; d < s; d += 7)
        if (horiz) x.fillRect(d, a2 - 1, 3, 1); else x.fillRect(a2 - 1, d, 1, 3);
    };
    const q = s / 2;
    seam(q, 0, true);
    seam(q, 0, false);

    // ---- buttons where the seams cross -------------------------------
    for (const by of [q]) for (const bx of [q]) {
      x.fillStyle = 'rgba(0,0,0,0.40)';
      x.beginPath(); x.arc(bx, by, 3.4, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,226,200,0.13)';
      x.beginPath(); x.arc(bx - 0.8, by - 0.8, 2.0, 0, 7); x.fill();
    }

    // ---- and the shine worn off the corners --------------------------
    for (let i = 0; i < 26; i++) {
      const px = r.chance(0.5) ? r.range(0, s * 0.16) : r.range(s * 0.84, s);
      x.fillStyle = 'rgba(210,180,150,' + r.range(0.03, 0.10).toFixed(3) + ')';
      x.fillRect(px, r.range(0, s), r.range(2, 9), r.range(1, 3));
    }
    grime(x, r, s, 0.13, false);
  }),

  carpet: (tint = '#4a4a52') => make('carpet' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    fibre(x, 9000, r, s, 3, 0.16);
    speckle(x, 700, r, 0.10, s, true);
    // the tile seam, which is the detail that names the surface
    x.strokeStyle = 'rgba(0,0,0,0.30)'; x.lineWidth = 2;
    x.strokeRect(0.5, 0.5, s - 1, s - 1);
    x.strokeStyle = 'rgba(255,255,255,0.05)';
    x.strokeRect(2.5, 2.5, s - 5, s - 5);
    grime(x, r, s, 0.16, false);
  }),

  /** painted drywall, scuffed along the bottom where chairs hit it */
  wall: (tint = '#b6ad9c') => make('wall' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    speckle(x, 2600, r, 0.055, s, r.chance(0.5));
    // roller texture: faint vertical banding
    for (let i = 0; i < s; i += 2) {
      x.fillStyle = 'rgba(0,0,0,' + (r.range(0, 0.03)).toFixed(3) + ')';
      x.fillRect(i, 0, 1, s);
    }
    scratch(x, r, s, 22, 0.16);
    grime(x, r, s, 0.13, true);
  }),

  /**
   * A WHOLE WALL, FLOOR TO CEILING, IN ONE TEXTURE.
   * ---------------------------------------------------------------
   * Liam: *"redo all of the walls interiors"*.
   *
   * The walls were a tiling drywall swatch, and a tiling swatch has no
   * TOP and no BOTTOM - so every wall in the building was a flat field of
   * the same noise from the carpet to the ceiling, which is why a room
   * read as a box rather than as a room. What is missing from a blank
   * wall is not detail, it is STRUCTURE: a skirting board, a shadow where
   * it meets the ceiling, scuffs that only happen at chair height, sheet
   * joints. Those are the things your eye uses to read a scale and a
   * floor level, and none of them can exist in a texture that tiles
   * vertically.
   *
   * They can all exist here, for free, because of how the geometry
   * happens to be built: every wall cell is its own 1 m by 3 m box, and a
   * BoxGeometry's side faces run v from 0 at the bottom to 1 at the top.
   * So one texture at repeat [1,1] IS an elevation - v maps to height in
   * metres, the same way on every wall in the building, and a band drawn
   * at the bottom of this canvas is a skirting board on all of them.
   *
   * That is the entire trick, and it costs one texture instead of two
   * skirting boards per wall cell.
   */
  // 256 on purpose: this ONE sheet covers a 1 m by 3 m elevation, so at
  // 128 the skirting board is four pixels tall and the ceiling shadow is
  // three. The reference pack has 256s in it for the same reason.
  wallFace: (tint = '#b6ad9c', style = 'plain') => make('wf' + tint + style, 256, (x, s, r) => {
    const H = 3.0;                      // the wall's real height, metres
    const yAt = (m) => s * (1 - m / H);  // metres above the floor -> canvas y

    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // roller banding, and it is VERTICAL because a wall is rolled vertically
    for (let i = 0; i < s; i += 2) {
      x.fillStyle = 'rgba(0,0,0,' + r.range(0, 0.028).toFixed(3) + ')';
      x.fillRect(i, 0, 1, s);
    }
    speckle(x, 3400, r, 0.045, s, r.chance(0.5));

    // ---- plasterboard joints -------------------------------------
    // The sheet is 1.2 m wide and the cell is 1 m, so a joint at each
    // edge of the texture lines up with the cell edge and reads as a run
    // of boards. The butt joint across is at shoulder height, taped.
    const joint = (jy, horiz) => {
      x.fillStyle = 'rgba(0,0,0,0.10)';
      horiz ? x.fillRect(0, jy, s, 2) : x.fillRect(jy, 0, 2, s);
      x.fillStyle = 'rgba(255,255,255,0.05)';
      horiz ? x.fillRect(0, jy + 2, s, 1) : x.fillRect(jy + 2, 0, 1, s);
    };
    joint(1, false); joint(s - 3, false);
    if (r.chance(0.7)) joint(yAt(2.40), true);

    // ---- a wainscot or a chair rail, on some floors ----------------
    if (style === 'rail') {
      const ry = yAt(0.95);
      x.fillStyle = 'rgba(0,0,0,0.13)'; x.fillRect(0, ry, s, s - ry);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, ry - 4, s, 8);
      x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(0, ry - 7, s, 3);
      // panel divisions below it
      for (let u = 0; u < s; u += s / 2) {
        x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(u + 6, ry + 10, 2, s - ry - 30);
      }
    }

    // ---- SCUFFS HAPPEN AT CHAIR HEIGHT, not everywhere -------------
    for (let i = 0; i < 40; i++) {
      const m = Math.pow(r.range(0, 1), 2.2) * 1.15;      // biased low
      const py = yAt(m), px = r.range(0, s);
      x.strokeStyle = 'rgba(0,0,0,' + r.range(0.04, 0.15).toFixed(3) + ')';
      x.lineWidth = r.range(1, 3);
      x.beginPath(); x.moveTo(px, py);
      x.lineTo(px + r.range(-40, 40), py + r.range(-4, 4));
      x.stroke();
    }
    scratch(x, r, s, 14, 0.12);

    // ---- the ceiling shadow, and the crown line -------------------
    {
      const cy = yAt(2.86);
      const g = x.createLinearGradient(0, 0, 0, yAt(2.55));
      g.addColorStop(0, 'rgba(0,0,0,0.38)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.fillRect(0, 0, s, yAt(2.55));
      x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(0, cy, s, 2);
    }

    // ---- THE SKIRTING BOARD ---------------------------------------
    // The single most missed thing in a bare 3D interior. It is 11 cm of
    // slightly darker paint with a highlight along the top and a hard
    // shadow underneath, and its absence is most of why an untextured
    // room reads as a cardboard box.
    {
      const ky = yAt(0.11);
      x.fillStyle = 'rgba(0,0,0,0.22)'; x.fillRect(0, ky, s, s - ky);
      x.fillStyle = 'rgba(255,255,255,0.13)'; x.fillRect(0, ky, s, 2);
      x.fillStyle = 'rgba(0,0,0,0.30)'; x.fillRect(0, ky + 3, s, 2);
      x.fillStyle = 'rgba(0,0,0,0.45)'; x.fillRect(0, s - 5, s, 5);
      // black marks along the very bottom, where a mop and a vacuum go
      for (let i = 0; i < 26; i++) {
        x.fillStyle = 'rgba(0,0,0,' + r.range(0.05, 0.22).toFixed(3) + ')';
        x.fillRect(r.range(0, s), s - r.range(4, 16), r.range(6, 40), r.range(2, 8));
      }
    }

    // ---- and the odd bit of damage --------------------------------
    if (r.chance(0.45)) {
      // a patch of filler somebody never painted over
      const px = r.range(20, s - 60), py = yAt(r.range(0.6, 2.0));
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.beginPath();
      for (let i = 0; i <= 10; i++) {
        const a = i / 10 * 6.283, rad = r.range(10, 26);
        const qx = px + Math.cos(a) * rad, qy = py + Math.sin(a) * rad * 0.7;
        i ? x.lineTo(qx, qy) : x.moveTo(qx, qy);
      }
      x.closePath(); x.fill();
    }
    if (r.chance(0.3)) {
      // the ghost of a poster somebody pulled down
      const px = r.range(20, s - 120), py = yAt(r.range(1.5, 2.3));
      x.fillStyle = 'rgba(255,255,255,0.07)';
      x.fillRect(px, py, r.range(60, 110), r.range(50, 90));
    }
    grime(x, r, s, 0.10, true);
  }),

  /**
   * EVERYTHING THAT HANGS ON A WALL, on one sheet.
   * ---------------------------------------------------------------
   * A wall with a skirting board is a wall. A wall with a light switch
   * beside the door, a socket at ankle height, a fire notice and somebody's
   * framed print is a wall in a BUILDING - and the difference is what
   * makes one office distinguishable from the next when you are running
   * through it backwards.
   *
   * All sixteen are cells of one 512 atlas, so the entire set of wall
   * fittings on a floor is a single merged mesh and one draw call. They
   * are alpha-cut quads, which is exactly how this era did every sign,
   * grille and poster in a level.
   */
  // and 256 here because it is an ATLAS of sixteen - at 128 each fitting
  // gets 32 pixels, which is not enough to read a light switch.
  /**
   * FOLIAGE, AS AN ALPHA-CUT SHEET.
   *
   * Liam: *"the plants improve them"*. The old plant was five to nine
   * rotated BOXES in a flat green Lambert, and from any angle it read as
   * exactly that - a handful of green bricks in a pot.
   *
   * A plant is the one thing in an office that has no silhouette a box
   * can approximate, and the era had a good answer for it that this
   * project was not using anywhere: a CROSS-PLANED CARD. Two quads at
   * right angles, an alpha-cut leaf shape painted on them, and from any
   * horizontal angle you see foliage rather than a plane. Four triangles
   * per frond instead of twelve, and it actually looks like a plant.
   *
   * Three cells: a strap leaf for a dracaena, a round-leaf spray for a
   * ficus, and an upright blade for a snake plant.
   */
  frond: () => make('frond', 128, (x, s, r) => {
    x.clearRect(0, 0, s, s);
    const H = s / 2;
    // one leaf: a pointed lozenge with a midrib, drawn into a half-cell
    const leaf = (cx, cy, len, wid, ang, col, rib) => {
      x.save(); x.translate(cx, cy); x.rotate(ang);
      x.fillStyle = col;
      x.beginPath();
      x.moveTo(0, 0);
      x.quadraticCurveTo(wid, -len * 0.42, 0, -len);
      x.quadraticCurveTo(-wid, -len * 0.42, 0, 0);
      x.fill();
      x.strokeStyle = rib; x.lineWidth = Math.max(1, s / 96);
      x.beginPath(); x.moveTo(0, 0); x.lineTo(0, -len * 0.94); x.stroke();
      x.restore();
    };
    // ---- cell 0,0: strap leaves, a dracaena ------------------------
    for (let i = 0; i < 7; i++) {
      const a2 = -1.15 + i * 0.38 + r.range(-0.06, 0.06);
      leaf(H * 0.5, H * 0.97, H * (0.62 + r.range(0, 0.30)), H * 0.085,
           a2, i % 2 ? '#2f6b2c' : '#3d7d34', 'rgba(20,50,18,0.55)');
    }
    // ---- cell 1,0: a round-leaved spray, a ficus --------------------
    for (let i = 0; i < 11; i++) {
      const a2 = -1.35 + i * 0.27 + r.range(-0.08, 0.08);
      leaf(H * 1.5, H * 0.98, H * (0.34 + r.range(0, 0.34)), H * 0.20,
           a2, i % 3 ? '#2b5f28' : '#3a7431', 'rgba(18,44,16,0.5)');
    }
    // ---- cell 0,1: upright blades, a snake plant -------------------
    for (let i = 0; i < 6; i++) {
      const a2 = -0.42 + i * 0.17 + r.range(-0.05, 0.05);
      leaf(H * 0.5, H * 1.98, H * (0.72 + r.range(0, 0.24)), H * 0.062,
           a2, i % 2 ? '#3f6f34' : '#54843c', 'rgba(24,52,20,0.5)');
    }
    // ---- cell 1,1: a tired one, for the gutted floors --------------
    for (let i = 0; i < 8; i++) {
      const a2 = -1.2 + i * 0.34 + r.range(-0.1, 0.1);
      leaf(H * 1.5, H * 1.97, H * (0.42 + r.range(0, 0.30)), H * 0.13,
           a2, i % 2 ? '#5d6330' : '#6b5c2c', 'rgba(46,42,18,0.5)');
    }
  }),

  fittings: () => make('fittings', 256, (x, s) => {
    const r = rng(31337);
    const N = 4, C = s / N;                       // 4x4 grid of 128px cells
    x.clearRect(0, 0, s, s);
    const cell = (i, j, draw) => { x.save(); x.translate(i * C, j * C); draw(C); x.restore(); };
    const plate = (c, w, h, col, edge) => {
      x.fillStyle = edge || 'rgba(0,0,0,0.45)';
      x.fillRect(c/2 - w/2 - 2, c/2 - h/2 - 2, w + 4, h + 4);
      x.fillStyle = col;
      x.fillRect(c/2 - w/2, c/2 - h/2, w, h);
    };

    // ---- 0,0 light switch -----------------------------------------
    cell(0, 0, (c) => {
      plate(c, c * 0.34, c * 0.46, '#e6e2d6');
      x.fillStyle = '#cfc9bb'; x.fillRect(c/2 - c*0.10, c/2 - c*0.16, c*0.20, c*0.32);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(c/2 - c*0.10, c/2 - c*0.02, c*0.20, 3);
    });
    // ---- 1,0 double socket ----------------------------------------
    cell(1, 0, (c) => {
      plate(c, c * 0.56, c * 0.34, '#e6e2d6');
      x.fillStyle = '#2a2a2a';
      for (const dx of [-0.14, 0.14]) {
        x.fillRect(c/2 + c*dx - c*0.045, c/2 - c*0.08, c*0.03, c*0.07);
        x.fillRect(c/2 + c*dx - c*0.01, c/2 - c*0.08, c*0.03, c*0.07);
        x.fillRect(c/2 + c*dx - c*0.018, c/2 + c*0.02, c*0.035, c*0.055);
      }
    });
    // ---- 2,0 wall vent grille -------------------------------------
    cell(2, 0, (c) => {
      plate(c, c * 0.74, c * 0.46, '#9aa0a6');
      x.fillStyle = 'rgba(0,0,0,0.55)';
      for (let i = 0; i < 7; i++) x.fillRect(c*0.15, c*0.30 + i * c*0.055, c*0.70, c*0.028);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      for (const dx of [0.17, 0.83]) x.beginPath(), x.arc(c*dx, c/2, 3, 0, 7), x.fill();
    });
    // ---- 3,0 wall clock -------------------------------------------
    cell(3, 0, (c) => {
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.beginPath(); x.arc(c/2, c/2, c*0.34, 0, 7); x.fill();
      x.fillStyle = '#e8e5dc'; x.beginPath(); x.arc(c/2, c/2, c*0.30, 0, 7); x.fill();
      x.strokeStyle = '#1a1a1a'; x.lineWidth = 2;
      for (let i = 0; i < 12; i++) {
        const a = i / 12 * 6.283;
        x.beginPath();
        x.moveTo(c/2 + Math.cos(a) * c*0.25, c/2 + Math.sin(a) * c*0.25);
        x.lineTo(c/2 + Math.cos(a) * c*0.28, c/2 + Math.sin(a) * c*0.28);
        x.stroke();
      }
      x.lineWidth = 3;
      x.beginPath(); x.moveTo(c/2, c/2); x.lineTo(c/2 + c*0.16, c/2 - c*0.09); x.stroke();
      x.beginPath(); x.moveTo(c/2, c/2); x.lineTo(c/2 - c*0.05, c/2 - c*0.21); x.stroke();
    });
    // ---- 0,1 and 1,1 framed prints ---------------------------------
    for (const [i, pal] of [[0, ['#4a5a6a', '#6a7a5a', '#8a7a5a']],
                            [1, ['#6a4a4a', '#4a4a6a', '#7a6a4a']]]) {
      cell(i, 1, (c) => {
        x.fillStyle = '#2a231c'; x.fillRect(c*0.10, c*0.16, c*0.80, c*0.68);
        x.fillStyle = '#e8e4d8'; x.fillRect(c*0.14, c*0.20, c*0.72, c*0.60);
        x.fillStyle = pal[0]; x.fillRect(c*0.20, c*0.26, c*0.60, c*0.48);
        // something abstract, because a readable picture is a distraction
        for (let k = 0; k < 5; k++) {
          x.fillStyle = pal[1 + (k % 2)];
          x.fillRect(c*(0.20 + r.range(0, 0.40)), c*(0.26 + r.range(0, 0.34)),
                     c * r.range(0.06, 0.22), c * r.range(0.05, 0.18));
        }
        x.fillStyle = 'rgba(255,255,255,0.10)'; x.fillRect(c*0.20, c*0.26, c*0.60, c*0.06);
      });
    }
    // ---- 2,1 noticeboard -------------------------------------------
    cell(2, 1, (c) => {
      x.fillStyle = '#3a3026'; x.fillRect(c*0.06, c*0.12, c*0.88, c*0.76);
      x.fillStyle = '#8a7a5c'; x.fillRect(c*0.09, c*0.15, c*0.82, c*0.70);
      for (let k = 0; k < 7; k++) {
        x.fillStyle = ['#e8e6de', '#dfe4ea', '#e9e2c9'][k % 3];
        const px = c * r.range(0.12, 0.62), py = c * r.range(0.18, 0.58);
        x.save(); x.translate(px, py); x.rotate(r.range(-0.12, 0.12));
        x.fillRect(0, 0, c * r.range(0.16, 0.26), c * r.range(0.14, 0.24));
        x.fillStyle = 'rgba(0,0,0,0.30)';
        for (let l = 0; l < 4; l++) x.fillRect(3, 5 + l * 5, c * 0.14, 1.5);
        x.restore();
      }
    });
    // ---- 3,1 EXIT sign ---------------------------------------------
    cell(3, 1, (c) => {
      x.fillStyle = '#1d3a24'; x.fillRect(c*0.08, c*0.34, c*0.84, c*0.32);
      x.fillStyle = '#2f7d43'; x.fillRect(c*0.10, c*0.36, c*0.80, c*0.28);
      x.fillStyle = '#eaf6ec';
      x.font = 'bold ' + (c * 0.20) + 'px monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('EXIT', c * 0.52, c * 0.50);
    });
    // ---- 0,2 room number -------------------------------------------
    cell(0, 2, (c) => {
      plate(c, c * 0.62, c * 0.28, '#b9bcc0', 'rgba(0,0,0,0.35)');
      x.fillStyle = '#20242a';
      x.font = 'bold ' + (c * 0.17) + 'px monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('14-B', c / 2, c / 2);
    });
    // ---- 1,2 fire extinguisher cabinet ------------------------------
    cell(1, 2, (c) => {
      x.fillStyle = '#8e2018'; x.fillRect(c*0.24, c*0.08, c*0.52, c*0.84);
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(c*0.24, c*0.08, c*0.52, c*0.06);
      x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(c*0.28, c*0.14, c*0.10, c*0.72);
      x.fillStyle = '#e8e4d8';
      x.font = 'bold ' + (c * 0.11) + 'px monospace';
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.fillText('FIRE', c * 0.55, c * 0.30);
      x.fillStyle = '#1a1a1a'; x.fillRect(c*0.60, c*0.44, c*0.10, c*0.34);
    });
    // ---- 2,2 a poster ----------------------------------------------
    cell(2, 2, (c) => {
      x.fillStyle = '#e6e2d4'; x.fillRect(c*0.16, c*0.10, c*0.68, c*0.80);
      x.fillStyle = '#2b4a6a'; x.fillRect(c*0.16, c*0.10, c*0.68, c*0.26);
      x.fillStyle = 'rgba(255,255,255,0.85)';
      for (let l = 0; l < 3; l++) x.fillRect(c*0.21, c*0.16 + l * c*0.06, c*0.5 - l * c*0.1, c*0.025);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      for (let l = 0; l < 8; l++) x.fillRect(c*0.21, c*0.42 + l * c*0.055, c * r.range(0.25, 0.58), c*0.018);
    });
    // ---- 3,2 thermostat / panel ------------------------------------
    cell(3, 2, (c) => {
      plate(c, c * 0.38, c * 0.30, '#dcd8cc');
      x.fillStyle = '#33383f'; x.fillRect(c/2 - c*0.13, c/2 - c*0.09, c*0.26, c*0.11);
      x.fillStyle = '#7de08a'; x.fillRect(c/2 - c*0.11, c/2 - c*0.07, c*0.10, c*0.06);
    });
    // ---- 0,3 fire evacuation plan -----------------------------------
    cell(0, 3, (c) => {
      x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(c*0.08, c*0.18, c*0.84, c*0.64);
      x.fillStyle = '#e9e6da'; x.fillRect(c*0.10, c*0.20, c*0.80, c*0.60);
      x.strokeStyle = '#3a3a3a'; x.lineWidth = 1.5;
      for (let k = 0; k < 5; k++)
        x.strokeRect(c * r.range(0.14, 0.55), c * r.range(0.26, 0.60),
                     c * r.range(0.10, 0.24), c * r.range(0.08, 0.18));
      x.strokeStyle = '#2f7d43'; x.lineWidth = 3;
      x.beginPath(); x.moveTo(c*0.18, c*0.70); x.lineTo(c*0.62, c*0.70);
      x.lineTo(c*0.62, c*0.40); x.stroke();
      x.fillStyle = '#8e2018'; x.fillRect(c*0.12, c*0.21, c*0.76, c*0.05);
    });
    // ---- 1,3 riser access panel -------------------------------------
    cell(1, 3, (c) => {
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(c*0.12, c*0.08, c*0.76, c*0.84);
      x.fillStyle = '#a9a99e'; x.fillRect(c*0.15, c*0.11, c*0.70, c*0.78);
      x.strokeStyle = 'rgba(0,0,0,0.25)'; x.lineWidth = 2;
      x.strokeRect(c*0.19, c*0.15, c*0.62, c*0.70);
      x.fillStyle = '#5a5a5a';
      for (const [px, py] of [[0.22, 0.18], [0.78, 0.18], [0.22, 0.82], [0.78, 0.82]])
        x.beginPath(), x.arc(c*px, c*py, 3, 0, 7), x.fill();
      x.fillStyle = '#33383f'; x.fillRect(c*0.62, c*0.46, c*0.14, c*0.06);
    });
    // ---- 2,3 a hole somebody put in the drywall ----------------------
    cell(2, 3, (c) => {
      x.fillStyle = 'rgba(20,18,16,0.92)';
      x.beginPath();
      for (let i = 0; i <= 12; i++) {
        const a = i / 12 * 6.283, rad = c * r.range(0.14, 0.26);
        const px = c/2 + Math.cos(a) * rad, py = c/2 + Math.sin(a) * rad;
        i ? x.lineTo(px, py) : x.moveTo(px, py);
      }
      x.closePath(); x.fill();
      x.strokeStyle = 'rgba(240,238,230,0.55)'; x.lineWidth = 2;
      for (let i = 0; i < 9; i++) {
        const a = r.range(0, 7);
        x.beginPath(); x.moveTo(c/2 + Math.cos(a) * c*0.18, c/2 + Math.sin(a) * c*0.18);
        x.lineTo(c/2 + Math.cos(a) * c*0.30, c/2 + Math.sin(a) * c*0.30); x.stroke();
      }
    });
    // 3,3 stays empty on purpose - the "nothing here" slot
  }),

  /** suspended ceiling tile with its grid - reads "office" instantly */
  ceiling: () => make('ceiling', 128, (x, s, r) => {
    x.fillStyle = '#cfcabb'; x.fillRect(0, 0, s, s);
    // the pinholes an acoustic tile is covered in
    for (let i = 0; i < 2400; i++) {
      x.fillStyle = 'rgba(0,0,0,' + r.range(0.06, 0.22).toFixed(3) + ')';
      x.fillRect(r.range(0, s), r.range(0, s), 1.5, 1.5);
    }
    // the T-bar grid
    x.fillStyle = '#8f8a80'; x.fillRect(0, 0, s, 5); x.fillRect(0, 0, 5, s);
    x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(0, 0, s, 1.5); x.fillRect(0, 0, 1.5, s);
    // water stains, because there is always one
    if (r.chance(0.55)) {
      const px = r.range(40, s - 40), py = r.range(40, s - 40), rad = r.range(18, 48);
      const g = x.createRadialGradient(px, py, rad * 0.2, px, py, rad);
      g.addColorStop(0, 'rgba(120,96,58,0.34)');
      g.addColorStop(0.7, 'rgba(120,96,58,0.16)');
      g.addColorStop(1, 'rgba(120,96,58,0)');
      x.fillStyle = g; x.fillRect(px - rad, py - rad, rad * 2, rad * 2);
    }
    grime(x, r, s, 0.08, false);
  }),

  /** office wood: desk tops, doors, skirting */
  wood: (tint = '#6b4a2c') => make('wood' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // THE GRAIN IS ROWS OF TEXELS, not stroked curves.
    //
    // A stroked sine at lineWidth 0.6-2.4 is antialiased into a soft
    // three-pixel smear whatever the sampler does with it afterwards, and
    // 130 of them averaged into the flat brown that read as "smooth".
    // Filled 1-pixel rects stepped along the grain give a hard-edged line
    // that survives being magnified by nearest filtering, which is the
    // whole point of drawing at 128 in the first place.
    for (let i = 0; i < 150; i++) {
      const y0 = r.range(0, s);
      const light = r.chance(0.45);
      x.fillStyle = (light ? 'rgba(255,222,172,' : 'rgba(0,0,0,')
        + r.range(0.05, 0.20).toFixed(3) + ')';
      const amp = r.range(1, 3.5), ph = r.range(0, 6.28), th = r.chance(0.75) ? 1 : 2;
      for (let px = 0; px < s; px++) {
        x.fillRect(px, Math.round(y0 + Math.sin(px * 0.05 + ph) * amp), 1, th);
      }
    }
    // knots: two or three, and they are the thing you can NAME on a wooden
    // surface (R4). Concentric rings, stepped, no gradient.
    for (let k = 0; k < 3; k++) {
      const kx = r.range(0, s), ky = r.range(0, s), kr = r.range(3, 7);
      for (let ring = kr; ring > 0; ring -= 1.6) {
        x.fillStyle = 'rgba(0,0,0,' + r.range(0.10, 0.22).toFixed(3) + ')';
        for (let a2 = 0; a2 < 6.283; a2 += 0.22) {
          x.fillRect(Math.round(kx + Math.cos(a2) * ring),
                     Math.round(ky + Math.sin(a2) * ring * 0.7), 1, 1);
        }
      }
    }
    scratch(x, r, s, 16, 0.22);
    grime(x, r, s, 0.10, false);
  }),

  /**
   * RED BRICK - the stairwells, the cores, the party walls.
   *
   * Liam asked for "more red brick stair wells". The old one was brown and
   * sooty and read as mud. A New York brick is RED, it varies course to
   * course, the mortar is pale and sits back, and every fourth brick is a
   * shade off its neighbours. That variation IS the texture: a brick wall
   * with uniform bricks reads as wallpaper of bricks.
   */
  brick: (tint) => make('brick' + (tint || ''), 128, (x, s, r) => {
    x.fillStyle = '#8e887c'; x.fillRect(0, 0, s, s);          // mortar
    const bh = 30, bw = 64;
    const base = tint === 'pale' ? [132, 110, 98] : [118, 52, 40];
    for (let row = 0, y = 0; y < s + bh; y += bh, row++) {
      const off = (row % 2) * bw * 0.5;
      for (let bx = -bw; bx < s; bx += bw) {
        const v = r.range(-26, 22), w2 = r.range(-10, 10);
        x.fillStyle = 'rgb(' + Math.round(base[0]+v) + ',' + Math.round(base[1]+v*0.55+w2*0.3)
          + ',' + Math.round(base[2]+v*0.45) + ')';
        x.fillRect(bx + off + 3, y + 3, bw - 6, bh - 6);
        // the top arris catches the light, the bottom sits in shadow. Two
        // one-pixel lines, doing all the relief a normal map would.
        x.fillStyle = 'rgba(255,238,225,0.16)';
        x.fillRect(bx + off + 3, y + 3, bw - 6, 1);
        x.fillStyle = 'rgba(0,0,0,0.22)';
        x.fillRect(bx + off + 3, y + bh - 4, bw - 6, 1);
        for (let i = 0; i < 14; i++) {                        // pitting
          x.fillStyle = 'rgba(0,0,0,' + r.range(0.03, 0.13).toFixed(3) + ')';
          x.fillRect(bx + off + 4 + r.range(0, bw - 9), y + 4 + r.range(0, bh - 9),
                     r.range(1, 3), r.range(1, 3));
        }
      }
    }
    speckle(x, 2600, r, 0.07, s, true);
    grime(x, r, s, 0.34, true);
  }),

  /** period wallpaper, for the residential conversions */
  paper2: (tint = '#8a8168') => make('paper2' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 32) { x.fillStyle = 'rgba(255,255,255,0.05)'; x.fillRect(i, 0, 16, s); }
    for (let gy = 0; gy < s; gy += 64) for (let gx = 0; gx < s; gx += 64) {
      x.strokeStyle = 'rgba(255,255,255,0.09)'; x.lineWidth = 2;
      x.beginPath(); x.arc(gx + 32, gy + 32, 13, 0, 7); x.stroke();
      x.beginPath(); x.arc(gx + 32, gy + 32, 5, 0, 7); x.stroke();
    }
    speckle(x, 1400, r, 0.05, s, true);
    scratch(x, r, s, 26, 0.20);
    grime(x, r, s, 0.22, true);
  }),

  /** a wall stripped back to the studs - the gutted floors */
  studs: () => make('studs', 128, (x, s, r) => {
    x.fillStyle = '#2a2622'; x.fillRect(0, 0, s, s);          // the dark cavity
    for (let i = 0; i < 3; i++) {
      const px = 20 + i * 84;
      x.fillStyle = '#8a6a44'; x.fillRect(px, 0, 26, s);
      for (let k = 0; k < 90; k++) {
        x.strokeStyle = 'rgba(0,0,0,' + r.range(0.04, 0.12).toFixed(3) + ')';
        x.lineWidth = r.range(0.5, 1.6);
        const y = r.range(0, s);
        x.beginPath(); x.moveTo(px, y); x.lineTo(px + 26, y + r.range(-3, 3)); x.stroke();
      }
      x.fillStyle = 'rgba(255,235,200,0.10)'; x.fillRect(px, 0, 2, s);
    }
    x.fillStyle = '#8a6a44'; x.fillRect(0, 150, s, 22);        // a noggin
    x.fillStyle = 'rgba(190,160,90,0.30)';                     // insulation
    for (let i = 0; i < 300; i++) x.fillRect(r.range(0, s), r.range(0, s), r.range(3, 12), 2);
    grime(x, r, s, 0.24, true);
  }),

  /** bare concrete: stairwells, service cores, ledges */
  concrete: (tint = '#7d7b75') => make('concrete' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    speckle(x, 4200, r, 0.13, s, true);
    speckle(x, 1400, r, 0.09, s, false);
    // form-work seams
    x.strokeStyle = 'rgba(0,0,0,0.20)'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, s * 0.5); x.lineTo(s, s * 0.5); x.stroke();
    for (let i = 0; i < 5; i++) {              // tie holes
      x.fillStyle = 'rgba(0,0,0,0.34)';
      x.beginPath(); x.arc(r.range(0, s), s * 0.5 + r.range(-3, 3), 3, 0, 7); x.fill();
    }
    scratch(x, r, s, 30, 0.14);
    grime(x, r, s, 0.20, true);
  }),

  /** lobby / bathroom tile */
  tile: () => make('tile', 128, (x, s, r) => {
    x.fillStyle = '#8e8b83'; x.fillRect(0, 0, s, s);
    const n = 4, w = s / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = r.range(-10, 10);
      x.fillStyle = 'rgb(' + (166 + v) + ',' + (162 + v) + ',' + (152 + v) + ')';
      x.fillRect(i * w + 2, j * w + 2, w - 4, w - 4);
      x.fillStyle = 'rgba(255,255,255,0.10)';
      x.fillRect(i * w + 2, j * w + 2, w - 4, 1.5);
    }
    speckle(x, 2000, r, 0.06, s, true);
    grime(x, r, s, 0.18, true);
  }),

  /** painted steel: lockers, doors, cabinets, gun receivers */
  metal: (tint = '#3d4249') => make('metal' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // brushed grain: whole rows, already on the grid
    for (let i = 0; i < s; i += 1) {
      x.fillStyle = 'rgba(255,255,255,' + r.range(0, 0.05).toFixed(3) + ')';
      x.fillRect(0, i, s, 1);
    }
    // A PANEL LINE. The one nameable thing on a sheet of painted steel
    // (R4), and hard-edged: a dark texel with a lit texel under it, which
    // is how a pressed seam catches light.
    const py = Math.round(r.range(s * 0.3, s * 0.7));
    x.fillStyle = 'rgba(0,0,0,.34)'; x.fillRect(0, py, s, 1);
    x.fillStyle = 'rgba(255,255,255,.14)'; x.fillRect(0, py + 1, s, 1);
    scratch(x, r, s, 44, 0.34);
    // chipped paint down to bare metal, snapped to the grid so the chip
    // has corners rather than a soft edge
    for (let i = 0; i < 22; i++) {
      x.fillStyle = 'rgba(158,158,166,' + r.range(0.25, 0.6).toFixed(2) + ')';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)),
                 Math.round(r.range(1, 4)), Math.round(r.range(1, 3)));
      // and the dark rim a chip has on its lower edge
      if (r.chance(0.5)) {
        x.fillStyle = 'rgba(0,0,0,.30)';
        x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)), 2, 1);
      }
    }
    grime(x, r, s, 0.14, false);
  }),

  /** the surface of every 2000s office window, seen from inside */
  glass: () => make('glass', 128, (x, s, r) => {
    x.fillStyle = '#20303c'; x.fillRect(0, 0, s, s);
    const g = x.createLinearGradient(0, 0, s, s);
    g.addColorStop(0, 'rgba(150,190,220,0.34)');
    g.addColorStop(0.5, 'rgba(90,120,150,0.10)');
    g.addColorStop(1, 'rgba(190,215,235,0.24)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 40; i++) {
      x.strokeStyle = 'rgba(255,255,255,' + r.range(0.02, 0.07).toFixed(3) + ')';
      x.lineWidth = r.range(1, 3);
      const y = r.range(0, s);
      x.beginPath(); x.moveTo(0, y); x.lineTo(s, y + r.range(-8, 8)); x.stroke();
    }
    grime(x, r, s, 0.12, true);
  }),

  /** stained office ceiling-to-floor: paper, files, clutter on a desk top */
  paper: () => make('paper', 128, (x, s, r) => {
    x.fillStyle = '#b9b3a4'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 26; i++) {
      x.save();
      x.translate(r.range(0, s), r.range(0, s));
      x.rotate(r.range(-0.4, 0.4));
      x.fillStyle = 'rgba(238,234,222,0.9)';
      const w = r.range(30, 70), h = w * 1.3;
      x.fillRect(-w/2, -h/2, w, h);
      x.fillStyle = 'rgba(60,60,66,0.45)';
      for (let l = 0; l < 7; l++) x.fillRect(-w/2 + 5, -h/2 + 8 + l * 7, w - 12 - r.range(0, 14), 1.6);
      x.restore();
    }
    grime(x, r, s, 0.16, false);
  }),
};

/** a lit, unlit-looking material - the era did not have real-time lights */


// =====================================================================
//  SURFACE FAMILIES - one considered texture per material, not one
//  noise function wearing nine colours
// =====================================================================
//
// Liam: *"your textures are not retro ... you have the exact same scratch
// texture for everything"*, and then: *"that scratch texture is on
// everything even things it shouldn't be on like the rug ... give things
// patterns, each thing should be thought through and made to perfection,
// like that in itself was a project"*.
//
// Both true, and tools/retro.mjs put numbers on the first one. Every
// sheet in every reference GLB, and ours, measured the same way:
//
//                       packs (mean)      ours
//   distinct colours        331          22 - 90
//   contrast                161          61 - 143
//   edge texels            25.6%        0.4 - 9%
//
// Three findings:
//
//  1. WE USED A FIFTH OF THE COLOURS. A flat tint plus value noise is one
//     hue in twenty shades. The packs drift in HUE as well as value -
//     dirt browner, highlights cooler - and that is most of what
//     "painted by a person" looks like.
//
//  2. OUR CONTRAST WAS ABOUT HALF THEIRS.
//
//  3. REAL PS1 TEXTURES ARE BUSY. A quarter of their texels are an edge;
//     under a tenth of ours were. Geometry was the expensive thing in
//     1999 so everything went into the sheet - panel lines, bolts, vents,
//     labels, grilles, weave. A flat field with four scratches on it is
//     not a retro texture, it is an untextured surface.
//
// This contradicts R4 as written ("the texture is modest and mostly
// flat"). R4 was derived from the two props Liam first pointed at, the
// aircon and the cooler - which measure 0.2% and 0.7% edges and are the
// two flattest sheets in the whole reference set. Generalising from the
// outliers was the mistake.
//
// And the second complaint was the sharper one. grime() was called by 15
// of 16 generators and scratch() by 7, so the SAME wear pass ran over
// carpet, leather, paper, glass and brick. A rug had scratched metal
// round its border because 'dark' was T.metal(). Wear is not a layer you
// add to everything; it is part of what a material IS. Cork does not
// scratch, it crumbles. Carpet does not chip, it wears flat and stains.
// Melamine does not corrode, it chips at the edge and shows chipboard.
//
// So: a generator per family, each with its own PATTERN and its own
// failure mode, and none of them sharing a dirt pass.

// ---- shared drawing helpers, used by the families below --------------

/**
 * THE LAST PASS ON EVERY SURFACE: colour, and contrast.
 *
 * Measured against the packs, the new families were right in character
 * (their grain figures run 1.0 to 19.8, so a brushed rail and a woven rug
 * are now genuinely different surfaces) and still wrong in two numbers:
 *
 *                  packs    families as first drawn
 *   colours         331            9 - 76
 *   contrast        161           29 - 195
 *
 * The reason is structural. Drawing a pattern as rgba() overlays of a
 * handful of fixed colours over one flat base can only ever produce a
 * handful of distinct results, however busy the pattern is. The reference
 * sheets are hand-painted or photo-derived, so almost every texel differs
 * slightly from its neighbour - and that near-neighbour colour noise is a
 * large part of what reads as "a real texture" rather than "a diagram".
 *
 * So this walks the finished image once and does three things:
 *
 *   1. A LOW-FREQUENCY HUE FIELD. A few sine octaves per channel, so one
 *      corner of the sheet is a little warmer and another a little
 *      cooler. This is what stops a large flat area reading as plastic.
 *   2. PER-CHANNEL JITTER. R, G and B each move independently by a few
 *      levels. Moving them TOGETHER is value noise and adds no colours at
 *      all - that was the old mistake, and it is why nine materials that
 *      each had noise on them still measured 22 to 90 colours.
 *   3. A CONTRAST STRETCH about mid grey.
 *
 * It is deliberately the last thing that happens, so it lands on top of
 * the hard-edged pattern rather than being smeared by it.
 */
function chroma(x, size, r, amt = 1) {
  const img = x.getImageData(0, 0, size, size);
  const d = img.data;
  // one random phase set per sheet, so two materials never share a field
  const ph = [];
  for (let i = 0; i < 9; i++) ph.push(r.range(0, Math.PI * 2));
  // HUE-SAFE, and that correction is the whole lesson here.
  //
  // The first version moved R, G and B independently by up to 13 levels
  // and stretched contrast by 22%. It hit the colour target - 22-90
  // colours became 68-579 against the packs' 331 - and it looked awful:
  // painted steel came out an oil slick of purple and green, brushed
  // aluminium came out pastel rainbow stripes, and a grey wool rug came
  // out violet. I had chased the measurement instead of the thing the
  // measurement was standing in for.
  //
  // The packs are not full of hue noise. They are full of TONE: hundreds
  // of shades of the same few hues. So:
  //
  //   * the low-frequency field is MULTIPLICATIVE and shared by all three
  //     channels, which varies brightness and leaves the hue alone;
  //   * the per-channel jitter stays, but at +/-3 levels. That is under
  //     the threshold where the eye reads a colour cast, and it still
  //     gives 7^3 combinations per neighbourhood - which is where the
  //     colour count comes from, honestly, without a rainbow.
  const con = 1 + 0.10 * amt;
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let px = 0; px < size; px++) {
      const u = px / size;
      const i = ((y * size + px) << 2);
      // one shading factor for the texel, so its hue survives
      const f0 = Math.sin(u * 3.1 + ph[0]) * Math.cos(v * 2.3 + ph[3]);
      const f1 = Math.sin((u + v) * 7.7 + ph[6]);
      const k = 1 + (f0 * 0.055 + f1 * 0.028) * amt;
      for (let c = 0; c < 3; c++) {
        let val = d[i + c] * k + r.range(-1, 1) * 3 * amt;
        val = (val - 128) * con + 128;
        d[i + c] = val < 0 ? 0 : val > 255 ? 255 : val;
      }
    }
  }
  x.putImageData(img, 0, 0);
}

/** hue-drifted patches: the cheapest route to a bigger palette */
function tintPatch(x, r, size, n, hues, amt) {
  for (let i = 0; i < n; i++) {
    const w = Math.round(r.range(size * 0.05, size * 0.4));
    const h = Math.round(r.range(size * 0.05, size * 0.32));
    const c = hues[r.int(0, hues.length - 1)];
    x.fillStyle = c.replace('A', r.range(amt * 0.25, amt).toFixed(3));
    x.fillRect(Math.round(r.range(-4, size)), Math.round(r.range(-4, size)), w, h);
  }
}

/** a pressed seam: one dark texel with a lit texel under it */
function seam(x, size, at, horizontal = true) {
  x.fillStyle = 'rgba(0,0,0,.42)';
  horizontal ? x.fillRect(0, at, size, 1) : x.fillRect(at, 0, 1, size);
  x.fillStyle = 'rgba(255,255,255,.17)';
  horizontal ? x.fillRect(0, at + 1, size, 1) : x.fillRect(at + 1, 0, 1, size);
}

/** a row of fixings, on the grid, each with its own shadow */
function rivets(x, r, size, y, step) {
  for (let px = Math.round(r.range(2, step)); px < size; px += step) {
    x.fillStyle = 'rgba(0,0,0,.45)';   x.fillRect(px, y, 2, 2);
    x.fillStyle = 'rgba(255,255,255,.24)'; x.fillRect(px, y + 2, 2, 1);
  }
}

/** louvre slots - the most PS1 thing you can paint on a box */
function louvres(x, r, size, x0, y0, w, h, n) {
  const step = Math.max(2, Math.round(h / n));
  for (let i = 0; i < n; i++) {
    const y = Math.round(y0 + i * step);
    x.fillStyle = 'rgba(0,0,0,.58)';
    x.fillRect(x0, y, w, Math.max(1, step - 2));
    x.fillStyle = 'rgba(255,255,255,.22)';
    x.fillRect(x0, y + Math.max(1, step - 2), w, 1);
  }
}

Object.assign(T, {

  // ---- PAINTED SHEET STEEL -------------------------------------------
  // Lockers, cabinets, filing drawers, vending machines, radiators.
  // It fails by CHIPPING: paint comes off at corners and edges and shows
  // grey primer, then rust in the chip. It does not get scratched all
  // over - it gets knocked in the places things hit it.
  painted: (tint = '#5a6470') => make('painted' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // uneven spray: hue drift, not value noise
    tintPatch(x, r, s, 26, ['rgba(255,240,215,A)', 'rgba(140,120,90,A)',
                            'rgba(90,110,140,A)', 'rgba(60,50,45,A)'], 0.13);
    // pressed panel: a rectangle of seams, which is what a locker door is
    const m = Math.round(s * 0.12);
    seam(x, s, m, true); seam(x, s, s - m - 2, true);
    seam(x, s, m, false); seam(x, s, s - m - 2, false);
    rivets(x, r, s, Math.round(s * 0.06), Math.round(s / 6));
    rivets(x, r, s, s - Math.round(s * 0.09), Math.round(s / 6));
    // chips: primer, then a rust bloom in some of them
    for (let i = 0; i < 40; i++) {
      const cx = Math.round(r.range(0, s)), cy = Math.round(r.range(0, s));
      const w = Math.round(r.range(1, 5)), h = Math.round(r.range(1, 4));
      x.fillStyle = 'rgba(150,150,156,' + r.range(0.35, 0.8).toFixed(2) + ')';
      x.fillRect(cx, cy, w, h);
      if (r.chance(0.45)) {
        x.fillStyle = 'rgba(122,66,32,' + r.range(0.3, 0.7).toFixed(2) + ')';
        x.fillRect(cx + 1, cy + 1, Math.max(1, w - 1), Math.max(1, h - 1));
      }
      x.fillStyle = 'rgba(0,0,0,.32)'; x.fillRect(cx, cy + h, w, 1);
    }
    // grease shadow along the bottom, where hands and mops reach
    for (let i = 0; i < s * 0.22; i++) {
      x.fillStyle = 'rgba(30,26,22,' + (0.20 * (1 - i / (s * 0.22))).toFixed(3) + ')';
      x.fillRect(0, s - 1 - i, s, 1);
    }
    chroma(x, s, r, 1.0);
  }),

  // ---- BRUSHED / ANODISED METAL --------------------------------------
  // Handrails, kick plates, appliance trim, fire doors. Its whole
  // character is DIRECTIONAL: the grain runs one way and catches light in
  // bands. It never chips - it dents and it smears.
  brushed: (tint = '#9aa0a8') => make('brushed' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i++) {
      const v = r.range(-0.10, 0.10);
      x.fillStyle = (v > 0 ? 'rgba(255,255,255,' : 'rgba(0,0,0,') + Math.abs(v).toFixed(3) + ')';
      x.fillRect(0, i, s, 1);
      // and a second, finer grain broken into runs, so it is not stripes
      let px = 0;
      while (px < s) {
        const w = Math.round(r.range(2, 14));
        x.fillStyle = 'rgba(255,255,255,' + r.range(0, 0.09).toFixed(3) + ')';
        x.fillRect(px, i, w, 1);
        px += w + Math.round(r.range(1, 6));
      }
    }
    // the specular band that makes steel read as steel
    const by = Math.round(r.range(s * 0.2, s * 0.6));
    for (let i = 0; i < Math.round(s * 0.14); i++) {
      const a = 0.16 * Math.sin((i / (s * 0.14)) * Math.PI);
      x.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      x.fillRect(0, by + i, s, 1);
    }
    for (let i = 0; i < 14; i++) {          // dents, not chips
      x.fillStyle = 'rgba(0,0,0,' + r.range(0.10, 0.26).toFixed(2) + ')';
      const w = Math.round(r.range(2, 7));
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)), w, 1);
    }
    chroma(x, s, r, 0.8);
  }),

  // ---- MOULDED PLASTIC ------------------------------------------------
  // PC cases, keyboards, monitor shells, kettles, appliance fascias. Beige
  // 2003 ABS. It does not scratch and it does not rust: it YELLOWS,
  // unevenly, and it carries mould seams and vent slots from the tool.
  plastic: (tint = '#cfc7b0') => make('plastic' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // UV yellowing: a gradient, warmer towards one corner
    for (let y = 0; y < s; y++) for (let xx = 0; xx < s; xx += 4) {
      const k = ((xx / s) * 0.6 + (y / s) * 0.4);
      x.fillStyle = 'rgba(196,164,86,' + (k * 0.16).toFixed(3) + ')';
      x.fillRect(xx, y, 4, 1);
    }
    // the fine pebble the tool leaves - one texel, low contrast, dense
    for (let i = 0; i < s * s * 0.14; i++) {
      x.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.09)';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)), 1, 1);
    }
    // NOT at 0.5: a seam exactly half way across tiles into an obvious
    // stripe every half metre, which is the most visible thing on the
    // sheet once it is on a wall of lockers.
    seam(x, s, Math.round(s * 0.37), false);         // the mould line
    louvres(x, r, s, Math.round(s * 0.58), Math.round(s * 0.18),
            Math.round(s * 0.34), Math.round(s * 0.30), 7);
    // a moulded-in badge recess, because every one of these had one
    x.fillStyle = 'rgba(0,0,0,.22)';
    x.fillRect(Math.round(s * 0.08), Math.round(s * 0.72), Math.round(s * 0.3), Math.round(s * 0.1));
    x.fillStyle = 'rgba(255,255,255,.18)';
    x.fillRect(Math.round(s * 0.08), Math.round(s * 0.82), Math.round(s * 0.3), 1);
    chroma(x, s, r, 0.9);
  }),

  // ---- APPLIANCE ENAMEL ----------------------------------------------
  // Fridges, microwaves, sinks. Nearly flat on purpose - this is the one
  // surface where the reference outliers (aircon, cooler) are the right
  // model. Its detail is a soft sheen and a very few edge chips.
  enamelled: (tint = '#e6e4dd') => make('enamelled' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y++) {
      const a = 0.10 * Math.sin((y / s) * Math.PI * 1.1);
      x.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
      x.fillRect(0, y, s, 1);
    }
    tintPatch(x, r, s, 10, ['rgba(178,190,198,A)', 'rgba(215,205,180,A)',
                            'rgba(150,160,168,A)'], 0.16);
    // The pressed door panel every white good has, and a vent strip.
    const m = Math.round(s * 0.14);
    seam(x, s, m, true); seam(x, s, s - m, true);
    seam(x, s, m, false); seam(x, s, s - m, false);
    louvres(x, r, s, m + 3, Math.round(s * 0.62), Math.round(s * 0.3),
            Math.round(s * 0.18), 5);
    for (let i = 0; i < 7; i++) {
      x.fillStyle = 'rgba(90,90,96,' + r.range(0.2, 0.45).toFixed(2) + ')';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)),
                 Math.round(r.range(1, 3)), Math.round(r.range(1, 2)));
    }
    seam(x, s, Math.round(s * 0.86), true);
    chroma(x, s, r, 0.45);
  }),

  // ---- GALVANISED STEEL ----------------------------------------------
  // Ducting, trays, conduit. The spangle - crystalline patches with hard
  // edges - is unmistakable and is nothing like a scratch.
  galv: () => make('galv', 128, (x, s, r) => {
    x.fillStyle = '#8d9298'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 150; i++) {
      const cx = Math.round(r.range(0, s)), cy = Math.round(r.range(0, s));
      const w = Math.round(r.range(3, 11)), h = Math.round(r.range(3, 10));
      const lit = r.chance(0.5);
      x.fillStyle = (lit ? 'rgba(255,255,255,' : 'rgba(50,58,66,')
        + r.range(0.05, 0.17).toFixed(3) + ')';
      // a lozenge, not a rectangle: two offset bars
      x.fillRect(cx, cy, w, h);
      x.fillRect(cx - 1, cy + 1, w + 2, Math.max(1, h - 2));
    }
    for (let i = 0; i < 4; i++) seam(x, s, Math.round(r.range(4, s - 6)), r.chance(0.5));
    rivets(x, r, s, Math.round(s * 0.5), Math.round(s / 8));
    chroma(x, s, r, 1.0);
  }),

  // ---- CARPET AND RUG WEAVE ------------------------------------------
  // Liam: *"that scratch texture is on everything even things it
  // shouldn't be on like the rug"*.
  //
  // A rug is WOVEN. It has a warp and a weft that interlock at texel
  // scale, a border, and a repeating motif in the field. It wears flat
  // and it stains; it does not chip and it never, ever scratches.
  weave: (tint = '#6e6274', motif = 'greek') => make('weave' + tint + motif, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // Warp and weft, and they have to be STRONG. At 9% over a dark
    // ground the weave measured fine and was invisible to look at - the
    // rug read as a flat navy rectangle with a nice border. A woven thing
    // is legible from across a room or it is not woven.
    for (let y = 0; y < s; y++) {
      for (let px = 0; px < s; px += 2) {
        const up = ((px >> 1) + y) & 1;
        x.fillStyle = up ? 'rgba(255,255,255,.22)' : 'rgba(0,0,0,.26)';
        x.fillRect(px, y, 2, 1);
      }
      // every fourth pick sits proud, which is what gives wool its rib
      if ((y & 3) === 0) {
        x.fillStyle = 'rgba(255,255,255,.10)';
        x.fillRect(0, y, s, 1);
      }
    }
    for (let i = 0; i < 420; i++) {        // slubs in the yarn
      x.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,.18)' : 'rgba(0,0,0,.20)';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)),
                 Math.round(r.range(1, 4)), 1);
    }
    // ---- and here it stops being cloth and becomes a RUG -------------
    //
    // Liam: *"a lot of the fabric ones like partitions and couches have
    // these yellow things which is bad"*. He was looking at this border
    // and this motif, on a cubicle partition and on a sofa, because
    // 'fabric' - the material every upholstered thing in the game uses -
    // was pointed at the rug weave.
    //
    // A rug has a border and a motif. A partition panel and a settee have
    // neither: they are one continuous cloth, and anything woven into
    // them tiles into a repeating pattern of nonsense. So everything
    // above this line is cloth, everything below it is a rug, and
    // motif 'plain' stops here.
    if (motif === 'plain') { chroma(x, s, r, 1.0); return; }
    const b = Math.round(s * 0.09);
    x.fillStyle = 'rgba(0,0,0,.30)';
    x.fillRect(0, 0, s, b); x.fillRect(0, s - b, s, b);
    x.fillRect(0, 0, b, s); x.fillRect(s - b, 0, b, s);
    x.fillStyle = 'rgba(226,206,150,.55)';
    x.fillRect(b - 2, b - 2, s - (b - 2) * 2, 2);
    x.fillRect(b - 2, s - b, s - (b - 2) * 2, 2);
    x.fillRect(b - 2, b - 2, 2, s - (b - 2) * 2);
    x.fillRect(s - b, b - 2, 2, s - (b - 2) * 2);
    // a repeating key motif in the field
    if (motif === 'greek') {
      // Bigger and opaque. A motif at a third alpha on a dark ground is
      // an idea of a motif; at full strength it is a rug.
      const step = Math.round(s / 3.2), u = Math.max(2, Math.round(s / 42));
      for (let gy = b + 6; gy < s - b - u * 9; gy += step)
        for (let gx = b + 6; gx < s - b - u * 9; gx += step) {
          x.fillStyle = 'rgba(0,0,0,.35)';
          x.fillRect(gx + 1, gy + 1, u * 8, u * 2);
          x.fillStyle = 'rgba(228,208,152,.92)';
          x.fillRect(gx, gy, u * 8, u);            // top bar
          x.fillRect(gx, gy, u, u * 6);            // left leg
          x.fillRect(gx + u * 7, gy, u, u * 4);    // right leg
          x.fillRect(gx + u * 3, gy + u * 3, u * 5, u);
          x.fillRect(gx + u * 3, gy + u * 3, u, u * 3);
          x.fillRect(gx, gy + u * 5, u * 4, u);
        }
    } else {
      const step = Math.round(s / 7);
      for (let gy = b + 3; gy < s - b - 4; gy += step)
        for (let gx = b + 3; gx < s - b - 4; gx += step) {
          x.fillStyle = 'rgba(0,0,0,.22)';
          x.fillRect(gx, gy + 2, 5, 1); x.fillRect(gx + 2, gy, 1, 5);
        }
    }
    // traffic wear and two stains - how a rug actually ages
    for (let i = 0; i < 5; i++) {
      x.fillStyle = 'rgba(40,34,28,' + r.range(0.05, 0.13).toFixed(3) + ')';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)),
                 Math.round(r.range(8, 30)), Math.round(r.range(6, 22)));
    }
    chroma(x, s, r, 1.0);
  }),

  // ---- SKIN ------------------------------------------------------------
  //
  // Liam: *"the face and basically all player texturing is bad and the
  // hands you have right now are still basically cubes"*.
  //
  // Half of that was the model and half was this: skin was
  // surf(T.metal('#b98a63')) - literally the painted-steel generator in a
  // flesh tone. So the player's forearm had 44 hard scratches and a
  // pressed panel line down it, which is visible in his screenshot and is
  // exactly as bad as it sounds.
  //
  // Skin has no hard edges anywhere. It is a soft mottle of red and
  // yellow at low contrast, a little denser at the knuckles, with fine
  // creases that are SHORT and follow no direction.
  skin: (tint = '#b98a63') => make('skin' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // blotchy circulation: warm and cool patches, big and soft
    for (let i = 0; i < 90; i++) {
      const w = Math.round(r.range(s * 0.08, s * 0.34));
      const h = Math.round(r.range(s * 0.06, s * 0.28));
      x.fillStyle = r.chance(0.5)
        ? 'rgba(198,110,84,' + r.range(0.05, 0.13).toFixed(3) + ')'
        : 'rgba(222,186,146,' + r.range(0.05, 0.13).toFixed(3) + ')';
      x.fillRect(Math.round(r.range(-6, s)), Math.round(r.range(-6, s)), w, h);
    }
    // pores: one texel, very low contrast, dense
    for (let i = 0; i < s * s * 0.10; i++) {
      x.fillStyle = r.chance(0.5) ? 'rgba(255,236,214,.07)' : 'rgba(120,74,50,.08)';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)), 1, 1);
    }
    // creases - two or three texels, never a line across the sheet
    for (let i = 0; i < 60; i++) {
      const px = Math.round(r.range(0, s)), py = Math.round(r.range(0, s));
      const len = Math.round(r.range(2, 5)), horiz = r.chance(0.5);
      x.fillStyle = 'rgba(122,76,52,' + r.range(0.07, 0.16).toFixed(3) + ')';
      x.fillRect(px, py, horiz ? len : 1, horiz ? 1 : len);
    }
    chroma(x, s, r, 0.5);
  }),

  // ---- CORK ------------------------------------------------------------
  // Liam pointed at the packs' cork board by name. Cork is granules:
  // hundreds of small warm patches with hard edges and no directionality
  // at all, and it goes DARKER where it is handled, never shinier.
  cork: () => make('cork', 128, (x, s, r) => {
    x.fillStyle = '#b58a4e'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < 1500; i++) {
      const w = Math.round(r.range(1, 4)), h = Math.round(r.range(1, 3));
      const k = r.range(-0.42, 0.42);
      x.fillStyle = (k > 0 ? 'rgba(255,232,190,' : 'rgba(86,54,22,') + Math.abs(k).toFixed(3) + ')';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)), w, h);
    }
    // pin holes: a dark texel with no highlight, which is what a hole is
    for (let i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(40,24,10,.55)';
      x.fillRect(Math.round(r.range(2, s - 2)), Math.round(r.range(2, s - 2)), 1, 1);
    }
    tintPatch(x, r, s, 10, ['rgba(70,44,18,A)', 'rgba(220,190,140,A)'], 0.10);
    chroma(x, s, r, 1.1);
  }),

  // ---- MELAMINE / LAMINATE --------------------------------------------
  // Desks, shelves, cupboard doors. A PRINTED woodgrain - a repeating
  // figure, not real grain - with a plastic edge band, and it fails by
  // chipping at that band to show chipboard underneath.
  laminate: (tint = '#9a7548') => make('laminate' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    // the printed figure: long shallow arcs that repeat
    for (let i = 0; i < 26; i++) {
      const y0 = r.range(0, s), amp = r.range(1, 4), ph = r.range(0, 6.28);
      const dark = r.chance(0.55);
      x.fillStyle = (dark ? 'rgba(58,36,16,' : 'rgba(232,205,160,')
        + r.range(0.10, 0.30).toFixed(3) + ')';
      for (let px = 0; px < s; px++) {
        const y = Math.round(y0 + Math.sin(px * 0.06 + ph) * amp);
        x.fillRect(px, ((y % s) + s) % s, 1, Math.round(r.range(1, 3)));
      }
    }
    // knots, sparse, because a print repeats them
    for (let i = 0; i < 3; i++) {
      const cx = Math.round(r.range(0, s)), cy = Math.round(r.range(0, s));
      for (let k = 5; k > 0; k--) {
        x.fillStyle = 'rgba(52,30,12,' + (0.09 * k).toFixed(3) + ')';
        x.fillRect(cx - k, cy - Math.max(1, k >> 1), k * 2, Math.max(1, k));
      }
    }
    // the edge band, and the chips in it
    const b = Math.round(s * 0.055);
    x.fillStyle = 'rgba(30,18,8,.34)'; x.fillRect(0, s - b, s, b);
    x.fillStyle = 'rgba(255,240,215,.18)'; x.fillRect(0, s - b, s, 1);
    for (let i = 0; i < 9; i++) {
      x.fillStyle = 'rgba(206,184,148,' + r.range(0.4, 0.75).toFixed(2) + ')';
      x.fillRect(Math.round(r.range(0, s)), s - b + 1,
                 Math.round(r.range(1, 4)), Math.round(r.range(1, b - 1)));
    }
    chroma(x, s, r, 1.0);
  }),

  // ---- RUBBER / MATTE -------------------------------------------------
  // Bin bodies, mats, cable, monitor bezels. Dense fine speckle, very low
  // contrast, no highlights at all - it absorbs light.
  rubber: (tint = '#3a3e46') => make('rubber' + tint, 128, (x, s, r) => {
    x.fillStyle = tint; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s * s * 0.18; i++) {
      x.fillStyle = r.chance(0.5) ? 'rgba(255,255,255,.10)' : 'rgba(0,0,0,.09)';
      x.fillRect(Math.round(r.range(0, s)), Math.round(r.range(0, s)), 1, 1);
    }
    // moulded tread bands, and a ribbed panel between them - a black
    // rectangle is not a material, and that is what this was
    for (let y = Math.round(s * 0.1); y < s; y += Math.round(s / 5)) {
      x.fillStyle = 'rgba(0,0,0,.42)'; x.fillRect(0, y, s, 2);
      x.fillStyle = 'rgba(255,255,255,.20)'; x.fillRect(0, y + 2, s, 1);
      // A 5-texel rib repeated across a 128 sheet is finer than the
      // filtering can hold: it turned to grey mush at any distance and
      // to moire close up. Bigger blocks, fewer of them.
      for (let px = 0; px < s; px += 16) {
        x.fillStyle = 'rgba(255,255,255,.07)';
        x.fillRect(px, y + 4, 11, Math.round(s / 5) - 7);
        x.fillStyle = 'rgba(0,0,0,.16)';
        x.fillRect(px + 11, y + 4, 5, Math.round(s / 5) - 7);
      }
    }
    tintPatch(x, r, s, 6, ['rgba(90,96,104,A)'], 0.06);
    chroma(x, s, r, 0.7);
  }),

  // ---- VENDING FRONT ---------------------------------------------------
  // A machine's front is a LIT GRAPHIC, and it is the single most
  // period-correct thing in a 2001 office. Painting it is what stops the
  // machine reading as a red box.
  vendfront: () => make('vendfront', 128, (x, s, r) => {
    x.fillStyle = '#8e1f18'; x.fillRect(0, 0, s, s);
    x.fillStyle = 'rgba(0,0,0,.30)'; x.fillRect(0, 0, s, Math.round(s * 0.18));
    x.fillStyle = 'rgba(240,232,210,.90)';
    x.fillRect(Math.round(s * 0.1), Math.round(s * 0.05), Math.round(s * 0.8), Math.round(s * 0.09));
    // the glass, and the racked cans behind it
    const gx = Math.round(s * 0.08), gy = Math.round(s * 0.22);
    const gw = s - gx * 2, gh = Math.round(s * 0.52);
    x.fillStyle = '#161a20'; x.fillRect(gx, gy, gw, gh);
    const cols = 5, rows = 4;
    for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
      const w = Math.round(gw / cols) - 2, h = Math.round(gh / rows) - 3;
      const px = gx + cx * Math.round(gw / cols) + 1, py = gy + cy * Math.round(gh / rows) + 2;
      const hue = ['#c33', '#3a7', '#37c', '#ca3', '#c6c'][r.int(0, 4)];
      x.fillStyle = hue; x.fillRect(px, py, w, h);
      x.fillStyle = 'rgba(255,255,255,.35)'; x.fillRect(px, py, 1, h);
      x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(px, py + h, w, 1);
    }
    x.fillStyle = 'rgba(190,220,255,.14)'; x.fillRect(gx, gy, gw, Math.round(gh * 0.3));
    // keypad and the delivery flap
    const ky = Math.round(s * 0.78);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      x.fillStyle = 'rgba(20,20,24,.8)';
      x.fillRect(Math.round(s * 0.72) + j * 6, ky - 14 + i * 6, 4, 4);
    }
    x.fillStyle = 'rgba(10,10,12,.85)';
    x.fillRect(Math.round(s * 0.08), Math.round(s * 0.82), Math.round(s * 0.5), Math.round(s * 0.14));
    x.fillStyle = 'rgba(255,255,255,.12)';
    x.fillRect(Math.round(s * 0.08), Math.round(s * 0.82), Math.round(s * 0.5), 1);
    chroma(x, s, r, 1.0);
  }),
});


export function surf(tex, repeat = [1, 1], tint = 0xffffff) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  // A CLONE DOES NOT INHERIT THE SAMPLER SETTINGS unless they are copied,
  // and surf() is how nearly every surface in the game is built - so the
  // nearest filtering set up in make() was being silently dropped on all
  // of them and only the handful of raw textures kept it.
  t.magFilter = tex.magFilter;
  t.minFilter = tex.minFilter;
  t.anisotropy = tex.anisotropy;
  t.repeat.set(repeat[0], repeat[1]);
  return new THREE.MeshLambertMaterial({ map: t, color: tint });
}
