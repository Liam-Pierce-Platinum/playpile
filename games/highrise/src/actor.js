// =====================================================================
// HIGHRISE :: actor.js - EVERY BODY IN THE BUILDING
// =====================================================================
//
// One base mesh - the 792-triangle PS1 man - carrying its own UVs, is
// what makes a hundred men on a floor cost nothing and still look like
// they came out of the same game. What separates a guard from a suit
// from the man with the shotgun is exactly two things:
//
//   1. MUSCLE, five numbers, applied to the bind pose in rig.js.
//   2. TEXTURE. His whole wardrobe is painted into one 512 sheet on the
//      model's own UVs - shirt, tie, vest, jeans, boots, skin, hair,
//      face. Nothing is modelled. That is the era exactly, and it is why
//      they can all be different without one extra triangle.
//
// What is NEW here is that the body underneath is skinned (rig.js) and
// animated (anim.js), so this file is only about what a man LOOKS like.
// The old version also had to bend the arms down out of a T-pose by hand
// and correct the facing; both of those are gone, baked into the asset.
import * as THREE from '../vendor/three.module.js';
// ---------------------------------------------------------------------
// THE SAME ASSET THE BODY IS BUILT FROM
// ---------------------------------------------------------------------
//
// This said `ps1man.js` - the OLD template, the one rig.js's own note
// says was replaced by refman and left on disk "in case". rig.js builds
// the mesh from refman, so the model carried REFMAN's unwrap while this
// file painted its clothes onto PS1MAN's, and the two atlases share
// nothing: refman's head island is 102 x 138 px at the top-left, ps1man's
// is 64 x 97, and every other island is somewhere else again.
//
// Proved rather than assumed (tools/atlas2.mjs): the pixel at (140, 40)
// is bare head skin in refman's layout and the middle of the SHIRT in
// ps1man's, and on every seed it comes out shirt-dark.
//
// So every man in the building was wearing his texture in the wrong
// places - which is the real answer to Liam's *"the players face texture
// is still too small"*. The face was being painted into a 64 x 97 corner
// of the 102 x 138 island his head actually samples: 44% of the area,
// pushed into one corner of it, with the rest of his head showing
// whatever the old atlas happened to put there. No amount of enlarging
// the face inside the wrong rectangle was ever going to fix that.
//
// It also explains the mixture this file was already living with: LM
// comes through rig.js and so was refman's all along, while ISL below
// was ps1man's.
import ASSET from '../assets/refman.js';
import { buildBody, LM } from './rig.js';
import { Animator } from './anim.js';
import { rng } from './rng.js';

const REG = ASSET.region, POS = ASSET.pos;

// ---------------------------------------------------------------------
// THE ATLAS
// ---------------------------------------------------------------------
//
// The baker generates the unwrap (the downloaded model has no usable one
// - its "texture" is a 128-pixel white mask), and because it generates
// it, the layout is KNOWN. Every island is a named rectangle with a
// declared projection, so painting is a lookup instead of a search.
//
// The version before this had to LEAST-SQUARES FIT a map from position to
// UV over the front-facing head triangles just to find out where an eye
// went. That was a good answer to the wrong problem - it was only ever
// necessary because the layout was inherited and opaque. Owning the
// unwrap deletes the whole apparatus and makes the result exact rather
// than fitted.
//
//   headFront  headBack  torsoFront torsoBack     <- planar, x across, y up
//   armR armL legR legL                           <- tubes: across, along
//   hipsFront hipsBack  handR handL  footR footL
const ISL = ASSET.islands;

/** a point in the island's own 2D frame -> pixels on the sheet */
function px(name, a, b, S) {
  const I = ISL[name];
  if (!I || !I.used) return [0, 0];
  const u = I.ox + (a - I.src[0]) * I.k;
  const v = I.oy + (b - I.src[1]) * I.k;
  return [u * S, (1 - v) * S];
}

/** the pixel box an island occupies, in canvas coordinates */
function box(name, S) {
  const I = ISL[name];
  if (!I) return { x: 0, y: 0, w: 0, h: 0 };
  const r = I.rect;
  return { x: r[0] * S, y: (1 - r[3]) * S, w: (r[2] - r[0]) * S, h: (r[3] - r[1]) * S };
}

/**
 * Draw inside one island, clipped to it, in FRACTIONS of the island:
 * (0,0) is its top-left. For an arm or a leg the top is the shoulder or
 * the hip end, because the tube projection runs down the bone - which is
 * what makes "a sleeve is the top 55% of the arm" a thing you can write.
 */
function on(x, S, name, draw) {
  const b = box(name, S);
  if (!b.w) return;
  x.save();
  x.beginPath(); x.rect(b.x, b.y, b.w, b.h); x.clip();
  draw((fx, fy, fw, fh) => [b.x + fx * b.w, b.y + fy * b.h, fw * b.w, fh * b.h], b);
  x.restore();
}

// ---------------------------------------------------------------------
// THE WARDROBE, PAINTED
// ---------------------------------------------------------------------
const SKIN = ['#c99c72', '#a97b52', '#7d5433', '#5a3a24', '#dcb18c', '#8d6142'];
const SHIRT = ['#d8d6cf', '#4a5a72', '#2c3038', '#7a2f2a', '#3f5545', '#c9c2ae', '#6a6f56'];
const PANTS = ['#22262e', '#31343a', '#403528', '#1b2430', '#2a2a2a'];
const SUITS = ['#20242c', '#2e2a33', '#1a2030', '#33302b'];
const BOOT = '#191a1c';

/** the same colour, darker - for a fold, a shadow, or a collar */
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
  return 'rgb(' + c.join(',') + ')';
}

export function sheet(seed, kind) {
  const r = rng(seed);
  // 256, NOT 512. Liam's reference pack is 128s with a few 256s, and a
  // 512-pixel character sheet is most of why these men read as a modern
  // game doing a retro filter rather than as the era. The face still gets
  // a quarter of it, which at 256 is a 128-pixel head - about what a PS1
  // character actually had.
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');

  const skin = r.pick(SKIN);
  const shirt = kind === 'suit' ? r.pick(SUITS) : r.pick(SHIRT);
  const pant = kind === 'suit' ? shirt : r.pick(PANTS);
  const sleeves = kind === 'vest' ? r.chance(0.5) : kind !== 'plain';
  const rolled = !sleeves || r.chance(0.4);         // sleeves pushed up

  // ---- base coats, one island at a time ------------------------------
  //
  // Filling the WHOLE atlas rectangle, not just the part the triangles
  // use, is deliberate: the inset margin round each island is what the
  // texture filter samples at the very edge, and leaving it as whatever
  // was underneath puts a bright halo round every seam on the model.
  const coat = (name, col) => {
    const b = box(name, S);
    x.fillStyle = col; x.fillRect(b.x, b.y, b.w, b.h);
  };
  coat('headFront', skin); coat('headBack', skin);
  coat('torsoFront', shirt); coat('torsoBack', shirt);
  coat('hipsFront', pant); coat('hipsBack', pant);
  coat('armR', skin); coat('armL', skin);
  coat('legR', pant); coat('legL', pant);
  coat('handR', skin); coat('handL', skin);
  coat('footR', BOOT); coat('footL', BOOT);
  coat('spare', skin);

  // ---- sleeves: the top of the arm island ----------------------------
  //
  // The arm's UV runs ALONG the bone, shoulder at the top, so a sleeve
  // is a fraction and a cuff is a line. On the model's own inherited UVs
  // this was not expressible at all - the arms had no texture space.
  for (const A of ['armR', 'armL']) {
    if (!sleeves) continue;
    const len = rolled ? r.range(0.38, 0.52) : r.range(0.78, 0.92);
    on(x, S, A, (f) => {
      x.fillStyle = shirt; x.fillRect(...f(0, 0, 1, len));
      x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(...f(0, len - 0.025, 1, 0.025));
      // a seam down the outside of the sleeve
      x.fillStyle = 'rgba(0,0,0,0.18)'; x.fillRect(...f(0.48, 0, 0.012, len));
    });
  }

  // ---- boots up the leg, and a knee crease ---------------------------
  const bootH = r.range(0.10, 0.22);
  for (const L of ['legR', 'legL']) on(x, S, L, (f) => {
    x.fillStyle = BOOT; x.fillRect(...f(0, 1 - bootH, 1, bootH));
    x.fillStyle = 'rgba(255,255,255,0.06)'; x.fillRect(...f(0, 1 - bootH, 1, 0.012));
    for (let i = 0; i < 3; i++) {
      x.fillStyle = 'rgba(0,0,0,0.14)';
      x.fillRect(...f(0, 0.46 + i * 0.035, 1, 0.014));       // knee
    }
    x.fillStyle = 'rgba(0,0,0,0.16)'; x.fillRect(...f(0.02, 0, 0.014, 1));  // outseam
  });

  // ---- torso gear ----------------------------------------------------
  //
  // Anything that would be a modelled pouch in a later game is a
  // rectangle here. At the range you see these men it reads identically
  // and it costs a fill instead of two hundred triangles.
  const vest = kind === 'vest' || r.chance(0.30);
  if (vest) for (const T of ['torsoFront', 'torsoBack']) on(x, S, T, (f) => {
    x.fillStyle = '#23262b'; x.fillRect(...f(0.06, 0.10, 0.88, 0.56));
    x.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 0; i < 4; i++) x.fillRect(...f(0.06, 0.16 + i * 0.13, 0.88, 0.014));
    x.fillStyle = '#3a3f46'; x.fillRect(...f(0.06, 0.50, 0.88, 0.07));    // strap
    if (T === 'torsoFront') {
      x.fillStyle = '#31353c';
      for (let i = 0; i < 3; i++) x.fillRect(...f(0.13 + i * 0.26, 0.26, 0.18, 0.17));
    }
  });
  if (kind === 'suit') on(x, S, 'torsoFront', (f) => {
    x.fillStyle = '#e8e6df'; x.fillRect(...f(0.36, 0.02, 0.28, 0.42));    // the shirt
    x.fillStyle = 'rgba(0,0,0,0.32)';
    const tri = (pts) => { x.beginPath(); pts.forEach((p, i) => {
      const q = f(p[0], p[1], 0, 0); i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
      x.closePath(); x.fill(); };
    tri([[0.30, 0.00], [0.52, 0.46], [0.20, 0.40]]);
    tri([[0.70, 0.00], [0.48, 0.46], [0.80, 0.40]]);
    x.fillStyle = r.pick(['#7a2028', '#20407a', '#5a5020', '#3a1a2a']);
    x.fillRect(...f(0.455, 0.06, 0.09, 0.44));                            // the tie
  });
  // ---- THE THROAT AND THE COLLAR -------------------------------------
  //
  // The head and torso islands meet on a horizontal cut through the neck,
  // so the top of the torso island is not chest at all - it is the front
  // and back of the NECK, and on this model that is a big wedge of
  // geometry. Left as plain shirt it shows up as a bright bib on every
  // man's chest, which is what the first pass did: the vest covers the
  // torso from 10% down, and the 10% it does not cover is exactly that
  // wedge.
  //
  // So: skin up the middle where the throat is, in shadow because it is
  // under a jaw, and a collar round it.
  for (const T of ['torsoFront', 'torsoBack']) on(x, S, T, (f) => {
    const poly = (pts, col) => {
      x.fillStyle = col; x.beginPath();
      pts.forEach((p, i) => { const q = f(p[0], p[1], 0, 0);
        i ? x.lineTo(q[0], q[1]) : x.moveTo(q[0], q[1]); });
      x.closePath(); x.fill();
    };
    poly([[0.30, -0.02], [0.70, -0.02], [0.63, 0.20], [0.37, 0.20]], shade(skin, 0.62));
    poly([[0.30, -0.02], [0.44, -0.02], [0.44, 0.20], [0.37, 0.20]], shade(skin, 0.48));
    // the collar itself, folded down either side of it
    poly([[0.00, -0.02], [0.40, -0.02], [0.34, 0.17], [0.00, 0.13]], shade(shirt, 0.80));
    poly([[1.00, -0.02], [0.60, -0.02], [0.66, 0.17], [1.00, 0.13]], shade(shirt, 0.92));
    x.fillStyle = 'rgba(0,0,0,0.28)'; x.fillRect(...f(0, 0.16, 1, 0.022));
  });
  // The hips island runs from the waist down, and a shirt does not stop
  // at the waist - so the top of it is still shirt, then the belt, then
  // the trousers.
  for (const H of ['hipsFront', 'hipsBack']) on(x, S, H, (f) => {
    x.fillStyle = shirt; x.fillRect(...f(0, 0, 1, 0.30));
    x.fillStyle = '#1a1614'; x.fillRect(...f(0, 0.28, 1, 0.16));
    if (H === 'hipsFront') { x.fillStyle = '#8a7a4a'; x.fillRect(...f(0.42, 0.30, 0.16, 0.12)); }
  });
  // knuckles, so a fist is not a flat mitten
  for (const Hd of ['handR', 'handL']) on(x, S, Hd, (f) => {
    x.fillStyle = 'rgba(0,0,0,0.20)';
    for (let i = 0; i < 4; i++) x.fillRect(...f(0.12 + i * 0.20, 0.30, 0.03, 0.45));
    if (r.chance(0.35)) { x.fillStyle = '#2b2f36'; x.fillRect(...f(0, 0, 1, 0.55)); }  // glove
  });
  // boot sole and laces
  for (const F of ['footR', 'footL']) on(x, S, F, (f) => {
    x.fillStyle = '#0e0f10'; x.fillRect(...f(0, 0.82, 1, 0.18));
    x.fillStyle = 'rgba(190,180,160,0.35)';
    for (let i = 0; i < 4; i++) x.fillRect(...f(0.34, 0.12 + i * 0.14, 0.32, 0.03));
  });

  // ---- and the grime, over everything --------------------------------
  //
  // Last, unevenly. Nothing in this building is clean and nothing that
  // has been carried up sixty floors of it is either.
  for (let i = 0; i < 1600; i++) {
    x.fillStyle = 'rgba(0,0,0,' + r.range(0.01, 0.09).toFixed(3) + ')';
    x.fillRect(r.range(0, S), r.range(0, S), r.range(2, 30), r.range(1, 5));
  }
  for (let i = 0; i < 450; i++) {
    x.fillStyle = 'rgba(255,255,255,' + r.range(0.01, 0.05).toFixed(3) + ')';
    x.fillRect(r.range(0, S), r.range(0, S), r.range(2, 18), r.range(1, 3));
  }

  paintHead(x, S, r, skin, kind);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  // CHUNKY, like the reference. See the long note in tex.js: filtering
  // this smooth was throwing the era away one texel at a time.
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.anisotropy = 1;
  t.needsUpdate = true;
  return t;
}

// ---------------------------------------------------------------------
// THE HEAD
// ---------------------------------------------------------------------
//
// Everything is placed in the mesh's own units and converted by the
// island's projection, so an eye is where an eye is. All of it is
// TEXTURE - there is not one extra triangle in a face or a head of hair,
// which is the whole aesthetic.
function paintHead(x, S, r, skin, kind) {
  const HY = LM.headY, HH = 1 - LM.headY;

  // ---- THE FACE HAS TO FILL THE FRONT OF THE HEAD -------------------
  //
  // Liam: *"they are too small on the texture"*. Enlarging the head's
  // island in the atlas was only half of it, and on its own it changed
  // almost nothing - because the face was not small relative to the
  // SHEET, it was small relative to the HEAD.
  //
  // `A()` measured across in units of LM.headHalf, which is the landmark
  // for the skull's half width at the temples: 0.0494. But the head
  // island's own projected half width is 0.0716 - the measurement was
  // 31% short before anything was drawn with it. On top of that the eyes
  // were placed at A(0.36), so they sat at a quarter of a half-head from
  // the centre. A real pair of eyes is about 42% of a half-head apart.
  // Between the two the whole face was drawn at roughly 40% scale, which
  // is why it read as a doll's face floating in a big blank head - and
  // why it stayed that way when the island got bigger.
  //
  // So the unit comes off the island's real width now, not off a
  // landmark that measures something else.
  // ...but the island's half width is not the FACE's half width either.
  // The island is a planar projection of the whole box, so its width is
  // the head's full depth-and-all silhouette; the flat slab you look at
  // is 56 of its 102 px. `A(1.0)` therefore came out at 57 px used as a
  // RADIUS, on a face that only reaches 28 px from the centre - so an eye
  // written as A(0.225) wide was drawn to the edge of his head, and the
  // "half-heads" the code below is written in were double size.
  //
  // Measured (tools/faceband.mjs): the slab is 56 px across, which is
  // 0.0405 in model units. That is the half-face, and every number below
  // reads correctly against it.
  const HW = 0.0405;

  // ---- AND IT HAS TO SIT ON THE PART THAT IS ACTUALLY HIS FACE ------
  //
  // Liam, a pass later: *"the players face texture is still too small
  // remodle the texture"*. Widening it was right and not enough, because
  // the VERTICAL mapping was aimed at the wrong thing.
  //
  // tools/faceband.mjs walks the head's triangles and prints which rows
  // of the island are on forward-facing surface, and how wide that
  // surface is at each row. The head is a low-polygon box, so the answer
  // is blunt: rows 24-99 of 138 are a slab a constant 56 px wide - that
  // is the face - rows 4-20 are the narrow cap on the crown, and
  // everything from row 100 down is the NECK, two-thirds the width.
  //
  // In model units that slab runs y 0.858 (chin) to 0.967 (hairline).
  // The old `at()` spread the face over 0.815 to 0.999 - 1.7 times the
  // real thing - which put the brow up on the crown cap and the mouth at
  // y 0.856, one thousandth BELOW the chin. That is the whole story of
  // the "eyes and nothing else" face: the nose and mouth were being
  // painted onto his throat, off the front of the head, where you cannot
  // see them. It is also why the previous fix noted a mouth at row 101
  // landing under the jaw and concluded the lower island was unusable -
  // row 101 is not the lower face, it is the neck.
  //
  // So the band is the measured one, and `f` now means something plain:
  // 0 is the point of his chin, 1 is his hairline.
  const FACE_BOT = 0.858, FACE_TOP = 0.967;
  const FH = FACE_TOP - FACE_BOT;
  // Sizes below are written in this unit. It is deliberately NOT FH: the
  // feature sizes were tuned against the old, taller band and they were
  // the one part that looked right, so the unit keeps their absolute
  // scale (0.2 * 1.835 = FH) while the placement above is corrected.
  const FU = FH * 1.835;
  // AND IT STAYS IN THE BAND THAT IS ACTUALLY ON HIS FACE.
  //
  // The head island is a planar projection of the WHOLE head - crown,
  // face, jaw, and the underside down to the collar. Only the top half of
  // it lands on the part of the mesh you can see from the front. I found
  // that the expensive way: dropping the features to sit "properly" in
  // the island took the mouth to row 101 of 138, which looked correct in
  // the texture and put the mouth on the underside of his jaw in the
  // game. Twelve men with eyes and no mouth.
  //
  // So the vertical range is COMPRESSED slightly and centred high. The
  // face got its size back from being drawn wider (see HW above), which
  // is where the room was - not from being spread further down.
  const at = (f) => FACE_BOT + FH * f;              // 0 = chin, 1 = hairline
  const A = (f) => f * HW;                          // across, in half-heads
  const dark = (a) => 'rgba(30,18,12,' + a + ')';
  const brow = r.pick(['#241a12', '#3a2a1c', '#4d3826', '#15100c']);
  const iris = r.pick(['#3a2c1e', '#2a3f4a', '#3f4a2a', '#241a14', '#4a3a2a']);
  const hair = r.pick(['#161310', '#2e2118', '#4a3a2a', '#6b6560', '#0f0d0c', '#5a3c22', '#7a2a18']);
  const bald = r.chance(0.15);
  const hairline = at(r.range(0.60, 0.72));

  // ---- hair: everything above the hairline, on BOTH islands ---------
  //
  // Not a cap-shaped blob. A blob only ever covers the front island and
  // leaves the back of the skull bare, and the head is the one part of
  // this man anybody actually looks at.
  if (!bald) for (const isl of ['headFront', 'headBack']) {
    const b = box(isl, S);
    const top = px(isl, 0, hairline, S)[1];
    x.save();
    x.beginPath(); x.rect(b.x, b.y, b.w, b.h); x.clip();
    x.fillStyle = hair;
    x.beginPath();
    x.moveTo(b.x - 4, b.y - 4);
    x.lineTo(b.x + b.w + 4, b.y - 4);
    for (let i = 20; i >= 0; i--) {
      const t = i / 20;
      x.lineTo(b.x + t * b.w, top + Math.sin(t * 11 + r.range(0, 0.3)) * b.h * 0.035);
    }
    x.closePath(); x.fill();
    x.globalAlpha = 0.30;
    for (let i = 0; i < 260; i++) {
      const hx = b.x + r.range(0, b.w), hy = r.range(b.y, top);
      x.strokeStyle = r.chance(0.5) ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.6)';
      x.lineWidth = 1;
      x.beginPath(); x.moveTo(hx, hy); x.lineTo(hx + r.range(-4, 4), hy + r.range(-7, 7)); x.stroke();
    }
    x.restore();
  }

  // ---- the neck: the bottom of both head islands --------------------
  //
  // Below the jaw the head island is still skin, and left flat it reads
  // as a bright tan wedge sitting on a dark shirt. A neck is in shadow
  // from the jaw above it and that shadow is what makes a head sit ON a
  // body rather than float above one.
  for (const isl of ['headFront', 'headBack']) {
    const bb = box(isl, S);
    const jaw = px(isl, 0, at(0.06), S)[1];
    const g = x.createLinearGradient(0, jaw - bb.h * 0.10, 0, bb.y + bb.h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.30)');
    x.save();
    x.beginPath(); x.rect(bb.x, jaw - bb.h * 0.10, bb.w, bb.y + bb.h - jaw + bb.h * 0.10); x.clip();
    x.fillStyle = g; x.fillRect(bb.x, bb.y, bb.w, bb.h);
    x.restore();
  }

  // ---- the face, on the front island only ---------------------------
  const b = box('headFront', S);
  x.save();
  x.beginPath(); x.rect(b.x, b.y, b.w, b.h); x.clip();
  const ell = (y, off, rw, rh, col, rot) => {
    const [cx, cy] = px('headFront', off, y, S);
    const [ex] = px('headFront', off + rw, y, S);
    const [, ey] = px('headFront', off, y + rh, S);
    x.save(); x.translate(cx, cy); if (rot) x.rotate(rot);
    x.fillStyle = col; x.beginPath();
    x.ellipse(0, 0, Math.abs(ex - cx), Math.abs(ey - cy), 0, 0, 7); x.fill(); x.restore();
  };
  // ---- A FACE IS ITS PROPORTIONS, NOT ITS COLOURS -------------------
  //
  // Liam: *"all faces are the exact same"*.
  //
  // They were, and the reason is worth writing down: everything below
  // USED to be a fixed constant, and the only things that varied per man
  // were the palette entries - hair, brow, iris, lip - plus a coin flip
  // on stubble and a scar. So every man in the building had the same eyes
  // in the same place, the same distance apart, above the same nose. That
  // reads as one face wearing different wigs, because it is.
  //
  // What actually makes two people look different is the SPACING: how far
  // apart the eyes sit, how deep the brow is over them, how long the nose
  // is between them and the mouth, how wide the mouth is. Those are the
  // measurements a police artist takes, and they are the ones that were
  // hard-coded here. Every one of them is now drawn per man, off his own
  // seed, so the variation is stable - a given guard has the same face
  // every time the floor is generated.
  // Re-spaced for the measured band. `f` is now the fraction of the way
  // up his face from the point of the chin, so these read as the
  // proportions they are: eyes just under halfway up, nose base a third,
  // mouth a fifth - and every one of them lands on the slab.
  const EW = A(r.range(0.38, 0.50));            // how far apart the eyes are
  const eyeY = 0.550 + r.range(-0.030, 0.030);  // and how high in the skull
  const eyeW = r.range(0.85, 1.20);             // and how big
  const eyeH = r.range(0.80, 1.25);
  const browY = eyeY + r.range(0.075, 0.115);   // brow depth over the eye
  const browT = r.range(0.7, 1.5);              // and how heavy it is
  const browA = r.range(0.02, 0.20);            // and its angle
  const noseY = eyeY - r.range(0.190, 0.250);   // nose length
  const noseW = r.range(0.80, 1.35);
  const mouthY = noseY - r.range(0.100, 0.150); // and the gap down to the mouth
  const mouthW = r.range(0.78, 1.30);
  const mouthH = r.range(0.75, 1.45);
  const jawW = r.range(0.86, 1.16);             // a wide jaw or a narrow one

  ell(at(0.50), 0, A(0.80), FU * 0.30, 'rgba(255,236,214,0.10)');
  ell(at(0.14), 0, A(0.62 * jawW), FU * 0.11, dark(0.13));         // under the jaw
  for (const s of [-1, 1]) {
    ell(at(eyeY + 0.020), s * EW, A(0.30 * eyeW), FU * 0.075 * eyeH, dark(0.28));  // socket
    ell(at(eyeY + 0.020), s * EW, A(0.225 * eyeW), FU * 0.048 * eyeH, '#efe8dc');  // the white
    ell(at(eyeY + 0.018), s * EW, A(0.098 * eyeW), FU * 0.030 * eyeH, iris);
    ell(at(eyeY + 0.018), s * EW, A(0.044 * eyeW), FU * 0.014 * eyeH, '#120c08');  // pupil
    ell(at(eyeY + 0.024), s * EW - A(0.03), A(0.026), FU * 0.009, 'rgba(255,255,255,0.85)');
    ell(at(eyeY + 0.037), s * EW, A(0.250 * eyeW), FU * 0.016, dark(0.55));        // upper lid
    ell(at(browY), s * (EW + A(0.02)), A(0.30 * eyeW), FU * 0.026 * browT, brow, s * browA);
  }
  // ---- NOSE AND MOUTH, AT THE STRENGTH THE NEW SCALE NEEDS ----------
  //
  // These were tuned against a face drawn at 40% size, where a 14% black
  // wash over eight pixels was a nose. At full size the same wash is a
  // faint smudge across twenty, and the first render after the rescale
  // had twelve men with good eyes and nothing at all below them.
  //
  // A nose on a low-polygon face is not a shape, it is a SHADOW down one
  // side and a highlight down the other - the light in this game comes
  // from the front, so the shadow has to be painted or there is nothing.
  ell(at(noseY + 0.010), -A(0.05 * noseW), A(0.085 * noseW), FU * 0.085,
      'rgba(255,240,222,0.13)');                                   // the bridge, lit
  ell(at(noseY), A(0.055 * noseW), A(0.085 * noseW), FU * 0.085, dark(0.26));  // and shaded
  ell(at(noseY - 0.055), 0, A(0.115 * noseW), FU * 0.030, dark(0.30));         // the tip
  for (const s of [-1, 1])                                                     // nostrils
    ell(at(noseY - 0.062), s * A(0.105 * noseW), A(0.040 * noseW), FU * 0.013, dark(0.72));

  // A MOUTH IS A LINE WITH LIPS EITHER SIDE, not a dark oval. The first
  // pass at this scale put a 34%-wide filled ellipse on every man and
  // twelve of them came out wearing the same moustache.
  const lip = r.chance(0.5) ? '#7d4a42' : '#6b3c34';
  ell(at(mouthY + 0.004), 0, A(0.26 * mouthW), FU * 0.020 * mouthH, lip);      // upper lip
  ell(at(mouthY - 0.014), 0, A(0.24 * mouthW), FU * 0.017 * mouthH, lip);      // lower lip
  ell(at(mouthY - 0.004), 0, A(0.27 * mouthW), FU * 0.006, dark(0.62));        // the line
  ell(at(mouthY - 0.040), 0, A(0.16), FU * 0.020, dark(0.12));                 // under the lip

  // ---- AND THE JAW BELOW IT ----------------------------------------
  //
  // Everything above stops at the mouth, and on a head island that runs
  // down to the collarbone that left the bottom third of every face as a
  // flat sheet of skin - which is what makes these read as masks rather
  // than heads. There is no geometry down there to catch a light, so the
  // chin and the jaw have to be painted or they do not exist.
  ell(at(mouthY - 0.075), 0, A(0.30 * jawW), FU * 0.040, 'rgba(255,240,222,0.09)'); // the chin, lit
  ell(at(mouthY - 0.125), 0, A(0.40 * jawW), FU * 0.032, dark(0.12));                // under it
  // KEPT WELL INSIDE THE CHEEK. At A(0.66) these ran off the front of the
  // head and joined up behind it, so from the front they read as one dark
  // band ruled straight across the face rather than as two hollows.
  for (const s of [-1, 1]) {
    ell(at(mouthY - 0.045), s * A(0.46 * jawW), A(0.16), FU * 0.050, dark(0.10), s * 0.35);
    ell(at(eyeY - 0.105), s * A(0.50 * jawW), A(0.14), FU * 0.045, dark(0.07));
  }
  // THE SIDE SHADOW STAYS ON THE FRONT OF THE HEAD.
  //
  // This was at A(0.90 * jawW), and with a wide jaw that is A(1.04) -
  // further from the centre than the head's own half width. The island is
  // a PLANAR projection, so anything painted past the silhouette lands on
  // the triangles that wrap round the side, where a few texels get
  // stretched over a lot of surface. Every man in the building had the
  // same black wedge down his right cheek and it read as a crack in the
  // model. Anything that goes near the edge of a planar island has to be
  // checked against the silhouette, not against a number that looked
  // about right.
  for (const s of [-1, 1]) ell(at(0.44), s * A(0.74 * jawW), A(0.09), FU * 0.09, dark(0.16));

  if (r.chance(0.45)) {                                            // stubble
    const [jx, jy] = px('headFront', 0, at(0.30), S);
    const [wx] = px('headFront', A(0.75), at(0.26), S);
    const [, wy] = px('headFront', 0, at(0.30) + FU * 0.14, S);
    x.globalAlpha = 0.17; x.fillStyle = '#3a2a1e';
    for (let i = 0; i < 900; i++) {
      const a = r.range(0, 7);
      x.fillRect(jx + Math.cos(a) * r.range(0, Math.abs(wx - jx)),
                 jy + Math.abs(Math.sin(a)) * r.range(0, Math.abs(wy - jy)), 1.6, 1.6);
    }
    x.globalAlpha = 1;
  }
  if (r.chance(0.22)) {                                            // a scar
    // ONE PIXEL, AND SHORT. At two pixels and up to eighteen long it was
    // wider than an eyelid and darker than the brow - at the range you
    // actually see these men it read as a crack in the model rather than
    // as a mark on a face.
    const [sx, sy] = px('headFront', r.range(-A(0.55), A(0.55)), at(0.56), S);
    x.strokeStyle = 'rgba(150,90,80,0.40)'; x.lineWidth = 1;
    x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + r.range(-4, 4), sy + r.range(5, 11)); x.stroke();
  }
  x.restore();
}

// ---------------------------------------------------------------------
// THE ROSTER
// ---------------------------------------------------------------------
//
// Liam: *"make the NPC's smart able to shoot and have random weapons and
// capable of hand to hand combat"*.
//
// So a type no longer owns ONE gun. It owns a weighted list, and it has
// a `fist` rating - how good he is with nothing, which is what he falls
// back on when his magazine is empty and you are too close for him to
// reload. That is the whole reason for closing the distance: a rifleman
// at two metres is a worse fighter than a runner.
export const KINDS = {
  guard: {
    build: { chest: 1.14, shoulder: 1.18, arm: 1.08, gut: 1.04, height: 1.84 },
    hp: 55, kind: 'vest', acc: 0.60, aggro: 0.55, fist: 0.9, react: 0.55,
    guns: [['glock', 4], ['ak', 2], ['bat', 1], ['shotgun', 1]],
  },
  heavy: {
    build: { chest: 1.38, shoulder: 1.36, arm: 1.26, gut: 1.28, height: 1.93 },
    hp: 110, kind: 'vest', acc: 0.48, aggro: 0.85, fist: 1.5, react: 0.85,
    guns: [['shotgun', 4], ['ak', 2], ['axe', 2], ['ext', 1]],
  },
  rifle: {
    build: { chest: 1.12, shoulder: 1.16, arm: 1.05, gut: 0.98, height: 1.86 },
    hp: 62, kind: 'vest', acc: 0.66, aggro: 0.40, fist: 0.8, react: 0.45,
    guns: [['ak', 5], ['shotgun', 1], ['glock', 1]],
  },
  suit: {
    build: { chest: 1.00, shoulder: 1.02, arm: 0.96, gut: 1.06, height: 1.79 },
    hp: 38, kind: 'suit', acc: 0.44, aggro: 0.30, fist: 0.6, react: 0.80,
    guns: [['glock', 5], ['knife', 2], ['bat', 1]],
  },
  runner: {
    build: { chest: 0.96, shoulder: 1.00, arm: 0.94, gut: 0.90, height: 1.76 },
    hp: 44, kind: 'plain', acc: 0.38, aggro: 1.00, fist: 1.3, react: 0.40,
    guns: [['knife', 4], ['bat', 3], ['axe', 2], ['glock', 1]],
  },
  // no weapon at all, and he does not need one to be a problem in a
  // corridor - he is the reason you keep something with a swing on you
  brawler: {
    build: { chest: 1.26, shoulder: 1.30, arm: 1.22, gut: 1.02, height: 1.88 },
    hp: 78, kind: 'plain', acc: 0, aggro: 1.0, fist: 1.9, react: 0.40,
    guns: [[null, 1]],
  },
};

/** pick from a weighted list */
function weighted(list, r) {
  let total = 0;
  for (const [, w] of list) total += w;
  let k = r.range(0, total);
  for (const [v, w] of list) { k -= w; if (k <= 0) return v; }
  return list[0][0];
}

let uid = 0;
export function makeActor(type, seed) {
  const K = KINDS[type] || KINDS.guard;
  const r = rng(seed + (++uid) * 7919);
  // a little variation on top of the type, so two guards are not twins
  const build = Object.assign({}, K.build, {
    height: K.build.height * r.range(0.955, 1.045),
    chest: K.build.chest * r.range(0.94, 1.07),
    gut: K.build.gut * r.range(0.90, 1.12),
    shoulder: K.build.shoulder * r.range(0.95, 1.06),
  });
  const mat = new THREE.MeshLambertMaterial({ map: sheet(seed + uid * 131, K.kind) });
  const body = buildBody(build, mat);
  const anim = new Animator(body, (seed % 100) / 15);
  return { body, mesh: body.mesh, anim, K, type, gun: weighted(K.guns, r) };
}

// ---------------------------------------------------------------------
// A DEBUG SKIN
// ---------------------------------------------------------------------
//
// One flat colour per island, so viewer.html can show which triangle
// belongs where. Reading it off the model beats reasoning about it: the
// first pass had a band of bare skin under every man's jaw and three
// plausible explanations, and this settled it in one render.
const DEBUG_COLS = {
  headFront: '#e04040', headBack: '#803030', torsoFront: '#40c040', torsoBack: '#207020',
  armR: '#4060e0', armL: '#80a0ff', legR: '#e0c040', legL: '#a08020',
  hipsFront: '#c040c0', hipsBack: '#702070', handR: '#40e0e0', handL: '#207070',
  footR: '#ff8000', footL: '#a05000', spare: '#ffffff',
};
export function islandSheet() {
  const S = 512;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.fillRect(0, 0, S, S);
  for (const [name, col] of Object.entries(DEBUG_COLS)) {
    const b = box(name, S);
    x.fillStyle = col; x.fillRect(b.x, b.y, b.w, b.h);
    x.fillStyle = 'rgba(0,0,0,0.75)'; x.font = 'bold 13px monospace';
    x.fillText(name, b.x + 4, b.y + 15);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
