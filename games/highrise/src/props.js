// =====================================================================
// HIGHRISE :: props.js - THE THINGS IN THE ROOMS
// =====================================================================
//
// Liam: *"make the game not cubular but take your time making tables
// computers ventalation systems lots of propps"*.
//
// The floor was boxes because the first pass spent its whole budget on
// the PLAN, and a plan is not a place. What makes an office an office is
// not its walls - it is a desk with legs under it, a CRT with a keyboard
// in front of it, a chair pushed in at an angle, and a duct running the
// length of the ceiling. None of that needs to be expensive: a desk here
// is nine boxes, a chair is eight, a monitor is five. It is still the
// same premise - simple models, complex textures - but "simple" has to
// mean FEW PARTS, not ONE BOX. A box is not a simple desk; it is no desk.
//
// Everything below is built in its own local space, metres, sitting on
// y=0 and facing +z, and returns:
//
//   parts   [{ mat, geo }]   merged by material at build time
//   solid   [{ x,y,z,w,h,d }] what you cannot walk through
//   cover   number            0 = none, 1 = crouch behind, 2 = stand behind
//
// COVER IS A PROPERTY OF THE PROP, not a guess made later. A filing
// cabinet is cover and a keyboard is not, and the AI needs to know which
// without measuring anything.
import * as THREE from '../vendor/three.module.js';
import { rng } from './rng.js';

// ---------------------------------------------------------------------
// TEXELS PER METRE, AND WHY THE PROPS LOOKED SMOOTH.
//
// Liam: *"the textures you made are too smooth not rigid and pixelated
// enough"*. They are drawn at 128 pixels with nearest filtering, so the
// pixels were there - they were being STRETCHED away.
//
// A BoxGeometry's UVs run 0..1 across every face however big the face is,
// and propMaterials() asks for repeat [1,1]. So one 128-pixel sheet was
// spread over each face whole: a 2 m desk top got 64 texels to the metre
// and read as a soft blur, while a 5 cm chair-base spoke got 2,560 and
// read as a flat colour. Nothing in the game shared a texel density with
// anything else, and the biggest surfaces - the ones you actually look at
// - got the least detail.
//
// This is the same fault as THWIP's ground planes and it has the same
// fix: write the UVs in METRES. At TPM = 1 a 128-pixel sheet covers one
// metre, so every surface in the building is 128 texels to the metre,
// which is inside the range the reference pack sits at (its 0.78 m bin
// carries a 128 sheet, ~164/m) and is chunky enough to read as the era at
// arm's length.
const TPM = 1.0;

/** rewrite a box's 0..1 face UVs as metres. Same shape as bayUVs/metreUVs. */
function boxUV(g, w, h, d) {
  const uv = g.attributes.uv;
  if (!uv) return g;
  const su = [d, d, w, w, w, w];          // +x -x +y -y +z -z
  const sv = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (k >= uv.count) return g;
      uv.setXY(k, uv.getX(k) * su[f] * TPM, uv.getY(k) * sv[f] * TPM);
    }
  }
  uv.needsUpdate = true;
  return g;
}

const box = (w, h, d, x, y, z, ry) => {
  const g = new THREE.BoxGeometry(w, h, d);
  boxUV(g, w, h, d);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
};
/** glue a few geometries into one, without pulling in a merge library */
const weld = (list) => {
  const flat = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const g of flat) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of flat) {
    const p = g.attributes.position, t = g.attributes.uv;
    pos.set(p.array.subarray(0, p.count * 3), o * 3);
    if (t) uv.set(t.array.subarray(0, t.count * 2), o * 2);
    o += p.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeVertexNormals();
  // AND AN INDEX, trivial though it is. Everything else in the prop set
  // is a BoxGeometry, which is indexed, and level.js merges a floor's
  // props by concatenating attribute arrays - hand it one non-indexed
  // geometry among indexed ones and it dereferences a null index buffer.
  const idx = new Uint32Array(n);
  for (let i = 0; i < n; i++) idx[i] = i;
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
};

/**
 * A BOX WITH ITS EDGES TAKEN OFF.
 *
 * Liam: *"the 3D models you make ... are too blocky"*.
 *
 * He is right, and it is not really the triangle count - mine run a
 * median of 120 against the reference packs' 109 to 480, so I am in the
 * same bracket. It is WHERE the triangles go. A reference prop spends
 * them on its SILHOUETTE: a tapered pot, a rounded bin, a folded edge
 * down the corner of a cabinet. Mine spent them subdividing flat faces
 * nobody looks at, so a filing cabinet was a rectangular prism with
 * knife-sharp arrises and read exactly like one.
 *
 * Three interpenetrating boxes, each pulled in by the chamfer on a
 * different pair of axes. Their union has a stepped corner instead of a
 * square one, which under flat shading is a bright edge down every arris -
 * and a bright edge is the entire difference between "a primitive" and
 * "a manufactured object". It needs no hull maths and cannot go wrong,
 * which a hand-built bevel absolutely can: my first attempt at this was a
 * custom index buffer and it was inside-out.
 *
 * `c` is the chamfer in metres. Furniture has about 8-15 mm of it.
 */
const cbox = (w, h, d, x, y, z, c = 0.012, ry) => {
  // ---- ONLY WHERE IT SHOWS ----------------------------------------
  //
  // Chamfering everything tripled the whole catalogue: the server rack
  // went from 564 triangles to 1,692 and the computer from 384 to 1,152,
  // and almost all of that went on parts a centimetre across - shelf
  // lips, buttons, cable stubs. You cannot see a 12 mm bevel on a 20 mm
  // object; you can only pay for it.
  //
  // So anything whose smallest dimension is under 5 cm stays a plain box.
  // That is the difference between spending the triangles on silhouette,
  // which is what the reference props do, and spending them on detail
  // nobody resolves.
  if (Math.min(w, h, d) < 0.05) return box(w, h, d, x, y, z, ry);
  const k = Math.min(c, w / 3, h / 3, d / 3);
  // ---- EACH BOX GETS ITS OWN UVs, BEFORE THEY ARE WELDED -----------
  //
  // Liam: *"less of that weird smoothness"*. The leather was only half
  // the story; this was the other half, and it has been quietly flatting
  // every chamfered prop in the game since the day cbox was written.
  //
  // boxUV rewrites a BoxGeometry's UVs in METRES - that is the whole
  // basis of the look, 128 texels to the metre on everything. But it
  // walks 6 faces of 4 vertices and stops, and a welded triple-box has
  // 108 vertices. So exactly the first 24 got metres and the other 84
  // kept their raw 0..1, which stretches one whole sheet across each
  // face: a 0.9 m chair panel wearing a texture meant to cover 0.9 m
  // AND a 0.06 m chamfer strip wearing the same one.
  //
  // Applying it per box, before the weld, is both correct and simpler -
  // each piece knows its own dimensions, and toNonIndexed() carries the
  // UVs through the expansion for free.
  const mk = (bw, bh, bd) => boxUV(new THREE.BoxGeometry(bw, bh, bd), bw, bh, bd);
  const g = weld([
    mk(w - k * 2, h, d - k * 2),
    mk(w, h - k * 2, d - k * 2),
    mk(w - k * 2, h - k * 2, d),
  ]);
  if (ry) g.rotateY(ry);
  g.translate(x, y + h / 2, z);
  return g;
};

// SIXTEEN SIDES, NOT EIGHT.
//
// Eight is a stop sign, and every round thing in this project was one:
// bin, pot, cooler bottle, cone, hydrant. The reference bin spends 168
// triangles on a shape that size and reads as a cylinder. Sixteen is the
// cheapest count that stops the facets reading as facets at arm's length,
// and it costs eight triangles a ring.
const cyl = (r1, r2, h, x, y, z, seg = 16) => {
  const g = new THREE.CylinderGeometry(r1, r2, h, seg);
  // a cylinder's u wraps once round the circumference and its v runs the
  // height, so the same correction is two multiplies
  const uv = g.attributes.uv;
  if (uv) {
    const circ = Math.PI * (r1 + r2);
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, uv.getX(i) * circ * TPM, uv.getY(i) * h * TPM);
    }
    uv.needsUpdate = true;
  }
  g.translate(x, y + h / 2, z);
  return g;
};
/**
 * A panel that carries ONE PICTURE, with its UVs left at 0..1.
 *
 * Everything else in this file writes UVs in METRES (see STYLE.md R9) so
 * that texel density is constant however big the part is - which is right
 * for a tiling surface and exactly wrong for an image OF something. The
 * vending machine's printed fascia is 1.44 m tall, so at one repeat per
 * metre it wore one and a half machine fronts stacked up itself.
 *
 * A raw BoxGeometry already has 0..1 per face; the whole helper is
 * "don't call boxUV".
 */
const plate = (w, h, d, x, y, z) => {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y + h / 2, z);
  return g;
};

const P = (mat, geo) => ({ mat, geo });

// ---------------------------------------------------------------------
// A NOTE ON SILHOUETTE, after Liam counted the boxes for me
// ---------------------------------------------------------------------
//
// *"right now you are only working in cubes it seems ... upgrade how you
// make your models ... put in lots of detail like the coolers or cork
// boards from the packs"*.
//
// He was right and it was measurable: 81% of every part in this file was
// a box, and 28 of 44 props were nothing BUT boxes. The reference props
// he keeps pointing at are not - the cooler's bottle is a stack of
// many-sided cylinders, its body is a tapered box with softened corners,
// the aircon's fan is modelled rather than painted.
//
// The three things that take a prop out of "a box with a texture":
//
//   1. A TAPER or a step in the profile. Almost nothing manufactured is
//      a constant cross-section top to bottom - there is a plinth, a
//      recess, a lip, a sloped fascia.
//   2. A ROUND THING. One cylinder in the silhouette does more than
//      twenty painted details, because the outline is what you read
//      first and a straight edge says "box" from any distance.
//   3. A HOLE, or something proud of the face. A recessed panel with a
//      lit lower edge, a handle standing off the door, a foot.
//
// It is not about triangle count. These rewrites run 200-600 triangles,
// which is what the packs run.

// A tapered box: like cbox but the top face is inset, which is the single
// cheapest way to stop something reading as a cuboid.
const taper = (w, h, d, x, y, z, shrink = 0.06) => {
  const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 4, 1);
  g.rotateY(Math.PI / 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const top = p.getY(i) > 0;
    const k = top ? 1 - shrink : 1;
    p.setX(i, p.getX(i) * Math.SQRT2 * w * k);
    p.setZ(i, p.getZ(i) * Math.SQRT2 * d * k);
    p.setY(i, (p.getY(i) + 0.5) * h);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
  boxUV(g, w, h, d);
  g.translate(x, y, z);
  return g;
};

// Floor to ceiling. level.js calls the same number WALL_H; a prop cannot
// see that, and a pillar is the one prop that has to know it.
const PILLAR_H = 2.70;

// ---------------------------------------------------------------------
// DOORS
// ---------------------------------------------------------------------
//
// One builder, three entries in the prop table: single hinged left,
// single hinged right, and a pair. `kind` picks how many leaves and
// `right` which jamb a single one hangs on.
//
// THE STOP BEAD IS THREE STRIPS, NOT A PANEL.
//
// Liam: *"right now they have the animation but there is still a physical
// wooden board"*. He was looking at this. The first version of the stop
// was `cbox(lw + 0.01, lh, 0.014, ...)` - written as "a bead", but those
// are the dimensions of a 0.89 x 2.03 m sheet of plywood, 14 mm thick,
// filling the entire opening a centimetre behind the leaf. The door swung
// wide and a full wooden panel stayed in the doorway. It was never in the
// hull, so you could walk through it, which made it worse rather than
// better: an obviously solid-looking board you pass through like fog.
//
// A door stop is an L-section round the head and the two jambs. Three
// strips, 20 mm proud, and the middle of the opening is empty.
function doorLeaf(lw, lh, lt) {
  const gx = lw / 2, gy = 1.30, gw = 0.30, gh = 0.54;
  const g0 = gy - gh / 2, g1 = gy + gh / 2;     // the opening, top and bottom
  const s0 = gx - gw / 2, s1 = gx + gw / 2;     // the opening, left and right
  const L = [];
  // FOUR PIECES ROUND THE OPENING, not one slab with a pane laid on it.
  // An 8 mm pane inside a 50 mm door is simply buried: the first version
  // rendered as a plain wooden door with a faint outline scratched on it.
  L.push(P('wood', cbox(lw, g0 - 0.02, lt, lw / 2, 0.02, 0, 0.006)));        // bottom rail
  L.push(P('wood', cbox(lw, lh - g1, lt, lw / 2, g1, 0, 0.006)));            // top rail
  L.push(P('wood', cbox(s0, gh, lt, s0 / 2, g0, 0, 0.006)));                 // hinge stile
  L.push(P('wood', cbox(lw - s1, gh, lt, (lw + s1) / 2, g0, 0, 0.006)));     // lock stile
  L.push(P('glassy', box(gw + 0.01, gh + 0.01, 0.008, gx, g0 - 0.005, 0)));  // the pane
  for (const sz of [-1, 1]) {
    const z0 = sz * (lt / 2 + 0.004);
    L.push(P('wood', box(gw + 0.05, 0.025, 0.014, gx, g0 - 0.012, z0)));
    L.push(P('wood', box(gw + 0.05, 0.025, 0.014, gx, g1 + 0.012, z0)));
    L.push(P('wood', box(0.025, gh + 0.05, 0.014, s0 - 0.012, g0 - 0.025, z0)));
    L.push(P('wood', box(0.025, gh + 0.05, 0.014, s1 + 0.012, g0 - 0.025, z0)));
  }
  L.push(P('chrome', box(lw - 0.10, 0.22, 0.006, lw / 2, 0.09, lt / 2 + 0.004)));   // kick plate
  L.push(P('chrome', box(lw - 0.10, 0.22, 0.006, lw / 2, 0.09, -lt / 2 - 0.004)));
  for (const y of [0.28, 1.02, 1.76])
    L.push(P('chrome', cyl(0.019, 0.019, 0.09, 0.012, y, -lt / 2 + 0.012, 8)));     // hinge barrels
  // A lever handle on both faces: rose, neck, lever. About forty
  // triangles, and it is the part anyone actually looks at.
  for (const sz of [-1, 1]) {
    const z0 = sz * (lt / 2);
    const rose = new THREE.CylinderGeometry(0.035, 0.035, 0.014, 12);
    rose.rotateX(Math.PI / 2); rose.translate(lw - 0.085, 1.02, z0 + sz * 0.007);
    L.push(P('chrome', rose));
    const nk = new THREE.CylinderGeometry(0.014, 0.014, 0.05, 8);
    nk.rotateX(Math.PI / 2); nk.translate(lw - 0.085, 1.02, z0 + sz * 0.032);
    L.push(P('chrome', nk));
    L.push(P('chrome', cbox(0.115, 0.026, 0.026, lw - 0.155, 1.007, z0 + sz * 0.05, 0.008)));
  }
  return L;
}

// Mirror a leaf about x = 0, so a right-hung door is the same joinery the
// other way round rather than a second copy of it to keep in step.
function mirrorLeaf(L) {
  return L.map((p) => {
    const g = p.geo.clone();
    g.scale(-1, 1, 1);
    // scaling by -1 turns every triangle inside out
    if (!g.index) g.setIndex([...Array(g.attributes.position.count).keys()]);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 2]; ix[i + 2] = t; }
    g.index.needsUpdate = true;
    g.computeVertexNormals();
    return P(p.mat, g);
  });
}

// The building's doorways are cut on the plan grid: CELL is 1 m, so a
// single opening is 1.00 m wide and a double is 2.00, and DOOR_H in
// level.js is 2.12. A door that does not add up to those numbers stands
// in a hole with a gap down one side.
//
// Liam: *"make sure double doors fit proportionally to door ways"*. The
// pair measured 1.67 across against a 2.00 opening - a third of a metre
// of daylight. Work backwards from the opening instead: the two jambs are
// 75 mm each, so the leaves have to make up the rest exactly.
const CELL_M = 1.0, JAMB_W = 0.075;
function builtDoor(kind, right) {
  const dbl = kind === 'double';
  const ow = (dbl ? 2 : 1) * CELL_M - JAMB_W * 2;   // clear opening
  const lw = dbl ? ow / 2 : ow;                     // one leaf
  const lh = 2.03, lt = 0.05;
  const jw = JAMB_W, jd = 0.20;

  const parts = [];
  for (const sx of [-1, 1])
    parts.push(P('wood', cbox(jw, lh + 0.09, jd, sx * (ow / 2 + jw / 2), 0, 0, 0.01)));
  parts.push(P('wood', cbox(ow + jw * 2, 0.09, jd, 0, lh, 0, 0.01)));
  // the stop: head and two jambs, 20 mm proud, opening left empty
  const bz = -(lt / 2) - 0.008;
  parts.push(P('wood', box(ow + 0.04, 0.02, 0.020, 0, lh - 0.01, bz)));
  for (const sx of [-1, 1])
    parts.push(P('wood', box(0.02, lh, 0.020, sx * (ow / 2 + 0.01), 0, bz)));
  parts.push(P('metal', box(ow + jw, 0.008, 0.06, 0, 0.004, 0)));            // threshold

  const solid = [
    { x: -(ow / 2 + jw / 2), y: (lh + 0.09) / 2, z: 0, w: jw, h: lh + 0.09, d: jd },
    { x:  (ow / 2 + jw / 2), y: (lh + 0.09) / 2, z: 0, w: jw, h: lh + 0.09, d: jd },
  ];

  // A CENTIMETRE WIDER THAN THE LEAF, on purpose. Two leaves of a double
  // door meet on an exact plane, and a round fired straight down that
  // plane threads between them - measured, with a rifle at chest height
  // through a shut pair. Real double doors have a meeting stile lapping
  // the joint for the same reason. The extra centimetre at the hinge end
  // is inside the jamb and costs nothing.
  const leafSolid = [{ x: lw / 2, y: lh / 2, z: 0, w: lw + 0.02, h: lh, d: lt + 0.02 }];
  const mk = (hingeX, flip) => ({
    x: hingeX, z: 0,
    parts: flip ? mirrorLeaf(doorLeaf(lw, lh, lt)) : doorLeaf(lw, lh, lt),
    // The leaf's own box, from the hinge. One clean slab: voxels would
    // round a 50 mm leaf up to a 90 mm cell and give the handle a lump of
    // its own, and a door is the one collider you feel every time.
    solid: flip ? leafSolid.map((b) => ({ ...b, x: -b.x })) : leafSolid,
    span: lw, open: 1.75, flip: !!flip,
  });

  const swings = dbl
    ? [mk(-ow / 2, false), mk(ow / 2, true)]
    : right ? [mk(ow / 2, true)] : [mk(-ow / 2, false)];

  return { parts, solid, hull: 'solid', cover: 1, swings };
}


/**
 * Point a quad at one cell of the 2x2 foliage sheet (T.frond).
 *
 * A PlaneGeometry's uvs run 0..1 across the whole texture, so without
 * this every frond wears all four plants at once.
 */
const uvCell = (g, i, j) => {
  const uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++)
    uv.setXY(k, (i + uv.getX(k)) / 2, (j + uv.getY(k)) / 2);
  uv.needsUpdate = true;
};

// ---------------------------------------------------------------------
// THE LIBRARY
// ---------------------------------------------------------------------
export const PROPS = {

  // ---- desks: a top, four legs, a modesty panel, and a drawer bank --
  //
  // Liam: *"the table chair and computer have a lack of detail not just
  // in their textures but the 3D models lack character"*.
  //
  // He is right and STYLE.md already names the rule he is invoking - R5,
  // silhouette: *spend geometry only where it makes the object
  // identifiable at a glance across a room.* The old desk was a slab on
  // four sticks. Everything that makes a desk read as an OFFICE desk
  // rather than a table was missing, and all of it is cheap:
  //
  //   * a bullnose EDGE band, so the top has a thickness you can see
  //   * a CABLE TRAY slung under the back, which is the single most
  //     office-specific thing on the object
  //   * a GROMMET in the top for the cables to come up through
  //   * drawer FRONTS that are proud of the pedestal with a recessed
  //     gap between them, instead of lines drawn on a box
  //   * a plinth under the pedestal, so it sits rather than floats
  //   * FEET on the legs
  //
  // That is 12 boxes on top of the 9 that were there. A desk is now ~21
  // boxes, which is still nothing beside the 4,987-triangle desk in the
  // reference pack.
  desk(r) {
    const w = r.range(1.5, 2.0), d = r.range(0.72, 0.88), h = 0.74;
    const T2 = 0.035;                                  // top thickness
    const parts = [
      P('wood', cbox(w, T2, d, 0, h, 0)),                          // top
      // the edge band: a slightly proud lip round the front and sides.
      // A desk top with a visible edge reads as a manufactured panel; one
      // without reads as a plane floating in the air.
      P('dark', cbox(w + 0.02, 0.022, 0.02, 0, h - 0.004, d / 2)),
      P('dark', cbox(0.02, 0.022, d, -w / 2, h - 0.004, 0)),
      P('dark', cbox(0.02, 0.022, d, w / 2, h - 0.004, 0)),
      // a cable grommet, off to one side where one actually goes
      P('dark', cbox(0.09, 0.006, 0.09, w * 0.28, h + T2, -d * 0.30)),
    ];
    // legs, with feet
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const lx = sx * (w / 2 - 0.06), lz = sz * (d / 2 - 0.06);
      parts.push(P('metal', cbox(0.05, h - 0.02, 0.05, lx, 0.02, lz)));
      parts.push(P('dark', cbox(0.07, 0.02, 0.07, lx, 0, lz)));
    }
    parts.push(P('metal', cbox(w - 0.16, 0.34, 0.02, 0, 0.30, -d/2 + 0.07))); // modesty panel
    // THE CABLE TRAY. A wire basket slung under the back edge, which is
    // on every office desk built since about 1995 and on no other kind of
    // table - so it is the cheapest thing that says "office".
    parts.push(P('chrome', cbox(w - 0.30, 0.012, 0.10, 0, 0.60, -d / 2 + 0.16)));
    parts.push(P('chrome', cbox(w - 0.30, 0.06, 0.012, 0, 0.60, -d / 2 + 0.21)));
    for (let i = 0; i < 5; i++) {
      parts.push(P('chrome', cbox(0.012, 0.05, 0.10,
        -w / 2 + 0.20 + i * (w - 0.40) / 4, 0.61, -d / 2 + 0.16)));
    }

    // a pedestal of drawers under one end
    const side = r.chance(0.5) ? -1 : 1;
    const px = side * (w/2 - 0.26);
    parts.push(P('metal', cbox(0.44, 0.60, d - 0.14, px, 0.04, 0)));
    parts.push(P('dark', cbox(0.46, 0.04, d - 0.12, px, 0, 0)));       // plinth
    // DRAWER FRONTS, PROUD. Three lines scribed on a box is a box with
    // lines on it; three panels standing 1 cm out of it, with a shadow
    // gap between them, is a set of drawers.
    for (let i = 0; i < 3; i++) {
      const dy = 0.10 + i * 0.185;
      parts.push(P('metal', cbox(0.42, 0.165, 0.012, px, dy, d/2 - 0.075)));
      parts.push(P('chrome', cbox(0.16, 0.022, 0.022, px, dy + 0.10, d/2 - 0.085)));
    }
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w, h, d }], cover: 1 };
  },

  // ---- a 2000s workstation: CRT, keyboard, mouse, tower ------------
  // A CRT IS NOT A BOX WITH A BLUE RECTANGLE ON IT.
  //
  // The old one was: a body box, a bezel box, and a flat screen quad
  // sitting on the front. From any angle but dead-on it read as a white
  // brick, which is what Liam photographed.
  //
  // What actually names a CRT at a glance is the taper - the case is
  // deepest at the back and narrows toward the tube - plus a screen that
  // is RECESSED behind a bezel rather than stuck onto it. Both are cheap:
  // the taper is two stacked boxes of different widths, and the recess is
  // the bezel standing 3 cm proud of a screen set back into it. Add the
  // things every beige-box monitor had on its face - a power LED, a strip
  // of control buttons, a vent grille across the top - and it is
  // identifiable from across a room, which is the whole job (R5).
  computer(r) {
    const sy = 0.74;                              // desk top height
    const parts = [
      // ---- the CRT: back shell, tapered mid, and a proud bezel ----
      P('beige', cbox(0.34, 0.30, 0.14, 0, sy + 0.05, -0.19)),      // back shell
      P('beige', cbox(0.40, 0.34, 0.16, 0, sy + 0.03, -0.06)),      // taper
      P('beige', cbox(0.44, 0.38, 0.10, 0, sy + 0.02, 0.05)),       // front mass
      // the bezel: a picture frame of four bars, so the glass sits BEHIND
      P('beige', cbox(0.44, 0.05, 0.03, 0, sy + 0.35, 0.11)),       // top brow
      P('beige', cbox(0.44, 0.07, 0.03, 0, sy + 0.02, 0.11)),       // chin
      P('beige', cbox(0.05, 0.32, 0.03, -0.195, sy + 0.05, 0.11)),  // left
      P('beige', cbox(0.05, 0.32, 0.03, 0.195, sy + 0.05, 0.11)),   // right
      P('screen', cbox(0.35, 0.27, 0.01, 0, sy + 0.07, 0.095)),     // the glass, recessed
      // face furniture
      P('led', cbox(0.018, 0.018, 0.012, -0.15, sy + 0.045, 0.128)),
      P('dark', cbox(0.10, 0.014, 0.012, 0.10, sy + 0.045, 0.128)), // button strip
      // vents across the top of the case, which every CRT had
      ...[0, 1, 2, 3].map((i) =>
        P('dark', cbox(0.26, 0.006, 0.012, 0, sy + 0.395, -0.16 + i * 0.05))),
      // ---- the stand: a neck and a foot, not a slab ----
      P('beige', cbox(0.16, 0.04, 0.16, 0, sy + 0.01, -0.02)),
      P('dark', cbox(0.26, 0.012, 0.22, 0, sy, -0.02)),
      // ---- keyboard: a wedge with a key field and a wrist lip ----
      P('beige', cbox(0.45, 0.022, 0.16, 0, sy, 0.36)),
      P('dark', cbox(0.40, 0.008, 0.115, 0, sy + 0.022, 0.345)),
      P('beige', cbox(0.45, 0.012, 0.03, 0, sy + 0.006, 0.445)),
      P('beige', cbox(0.07, 0.03, 0.11, 0.34, sy, 0.34)),           // mouse
      P('dark', cbox(0.05, 0.006, 0.03, 0.34, sy + 0.03, 0.31)),    // its buttons
    ];
    // ---- the tower, on the floor beside the desk ----
    // Standing on a plinth with a recessed front panel, a drive bay, a
    // power button and a vent - a beige box with nothing on it is the
    // thing it was before.
    const tx = r.chance(0.5) ? -0.62 : 0.62;
    parts.push(P('beige', cbox(0.20, 0.42, 0.46, tx, 0.02, 0)));
    parts.push(P('dark', cbox(0.21, 0.02, 0.47, tx, 0, 0)));         // plinth
    parts.push(P('beige', cbox(0.185, 0.30, 0.02, tx, 0.10, 0.235))); // front panel, proud
    parts.push(P('dark', cbox(0.14, 0.028, 0.014, tx, 0.36, 0.245))); // 5.25" bay
    parts.push(P('dark', cbox(0.14, 0.020, 0.014, tx, 0.32, 0.245))); // floppy
    parts.push(P('chrome', cbox(0.028, 0.028, 0.012, tx, 0.09, 0.245))); // power
    parts.push(P('led', cbox(0.012, 0.012, 0.010, tx, 0.06, 0.245)));
    for (let i = 0; i < 4; i++) {
      parts.push(P('dark', cbox(0.10, 0.006, 0.010, tx, 0.16 + i * 0.02, 0.245)));
    }
    return { parts, solid: [{ x: tx, y: 0.22, z: 0, w: 0.22, h: 0.44, d: 0.48 }], cover: 0 };
  },

  // ---- office chair: seat, back, gas lift, five-star base ----------
  // A task chair, and the parts that make it one.
  //
  // The old chair was a seat slab, a back slab, a post and a star base -
  // eight boxes, and it read as two grey tiles balanced on a stick. What
  // was missing is the stuff that makes a chair look SAT IN: a cushion
  // that is thicker at the front than the back, a lumbar gap between seat
  // and back (a real task chair does not have them touching), ARMRESTS,
  // the gas-lift shroud, and a tilt on the backrest.
  //
  // The armrests matter most. They are the widest part of the silhouette
  // and the only part at eye height when you are standing over it, which
  // is how the player usually sees a chair in this game.
  chair(r) {
    const back = r.range(-0.10, -0.03);            // how far it reclines
    const parts = [
      // ---- seat: a pad, a front nose, and a shell under it ----
      P('fabric', cbox(0.46, 0.07, 0.42, 0, 0.44, 0.01)),
      P('fabric', cbox(0.44, 0.05, 0.09, 0, 0.42, 0.22)),           // waterfall front
      P('dark', cbox(0.42, 0.03, 0.38, 0, 0.41, 0.01)),             // the shell
      // ---- back: raised clear of the seat, and leaning ----
      P('fabric', cbox(0.42, 0.42, 0.07, 0, 0.60, -0.20 + back * 0.5)),
      P('fabric', cbox(0.40, 0.10, 0.09, 0, 0.66, -0.17 + back * 0.5)), // lumbar bulge
      // the stem that carries the back, which is the gap you can see through
      P('dark', cbox(0.09, 0.14, 0.05, 0, 0.50, -0.19)),
      // ---- armrests ----
      ...[-1, 1].flatMap((s) => [
        P('dark', cbox(0.035, 0.17, 0.035, s * 0.245, 0.45, -0.05)),
        P('dark', cbox(0.05, 0.028, 0.22, s * 0.245, 0.62, 0.0)),
      ]),
      // ---- column: a lift, a shroud over it, and the hub ----
      P('chrome', cyl(0.026, 0.026, 0.22, 0, 0.19, 0, 8)),
      P('dark', cyl(0.045, 0.038, 0.16, 0, 0.14, 0, 8)),           // shroud
      P('dark', cyl(0.055, 0.075, 0.05, 0, 0.09, 0, 10)),          // hub
    ];
    // ---- the five-star base: tapered spokes and real castors ----
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const sx = Math.sin(a), cz = Math.cos(a);
      parts.push(P('dark', cbox(0.30, 0.035, 0.055, sx * 0.15, 0.065, cz * 0.15, -a)));
      // a castor is a fork and a wheel, not a peg
      parts.push(P('dark', cbox(0.035, 0.05, 0.035, sx * 0.28, 0.035, cz * 0.28, -a)));
      parts.push(P('dark', cyl(0.032, 0.032, 0.022, sx * 0.29, 0.005, cz * 0.29, 8)));
    }
    return { parts, solid: [{ x: 0, y: 0.3, z: 0, w: 0.5, h: 0.6, d: 0.5 }], cover: 0 };
  },

  // ---- filing cabinet: real cover, and it looks like it -------------
  cabinet(r) {
    const n = r.int(2, 4), h = 0.34 * n + 0.06;
    const parts = [P('metal', cbox(0.47, h, 0.62, 0, 0, 0))];
    for (let i = 0; i < n; i++) {
      const y = 0.05 + i * 0.34;
      parts.push(P('metal', cbox(0.44, 0.30, 0.015, 0, y, 0.315)));
      parts.push(P('chrome', cbox(0.16, 0.03, 0.03, 0, y + 0.20, 0.325)));
      parts.push(P('paperw', cbox(0.09, 0.035, 0.005, -0.13, y + 0.20, 0.328)));  // the label
    }
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w: 0.5, h, d: 0.64 }], cover: h > 1.1 ? 2 : 1 };
  },

  // ---- cubicle partition: fabric panel on feet ----------------------
  // ---- ONE SIZE, EVERY TIME ------------------------------------------
  //
  // Liam: *"the partiotions are random size make it the same every
  // time"*.
  //
  // These were r.range(1.6, 3.2) wide by r.range(1.25, 1.55) high, so no
  // two screens in a row matched and a bank of them came out as a ragged
  // fence. That is wrong about the object as well as ugly: an office
  // screen system is a MODULAR KIT. You buy one panel and you buy forty
  // of them, and the fact that they all line up is the entire point of
  // the product.
  //
  // Randomness belongs where a thing really does vary - how worn it is,
  // which way it faces, whether it is there at all - not in the
  // dimensions of a manufactured part.
  partition(r) {
    const w = 1.60, h = 1.40;
    const parts = [
      P('fabric', cbox(w, h - 0.10, 0.06, 0, 0.10, 0)),
      P('metal', cbox(w, 0.05, 0.09, 0, h - 0.05, 0)),           // capping rail
      P('metal', cbox(0.08, 0.10, 0.34, -w/2 + 0.05, 0, 0)),      // feet
      P('metal', cbox(0.08, 0.10, 0.34,  w/2 - 0.05, 0, 0)),
    ];
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w, h, d: 0.12 }], cover: 2 };
  },

  // ---- DOORS THAT SWING --------------------------------------------
  //
  // Liam: *"make doors that I can put in that swing open when hit by
  // players"*, then *"make the doors double doors and single doors ...
  // let me change which direction the door is on ... and make doors take
  // bullets to so the player doesn't get shot through them"*.
  //
  // These are the only props in the game with a MOVING PART, so they
  // return a field nothing else returns: `swings`, a LIST of leaves. Each
  // one says where its hinge is in prop-local space, the geometry of the
  // leaf measured from that hinge, and the box that is solid while it
  // turns. level.js hangs each as a child group; doors.js turns them and
  // rewrites their collision every frame, which is what makes them stop a
  // bullet - the leaf's box is in the same list cover is read from.
  //
  // A list rather than a single leaf is the whole of what makes double
  // doors work: two leaves, hinged at opposite jambs, each swinging on
  // its own.
  //
  // THE FRAME'S HULL IS THE FRAME ALONE. Voxelise it with a shut leaf in
  // place and the closed door is baked into the doorway forever - you
  // would watch it swing wide and still walk into it.

  doorA(r) { return builtDoor('single', false); },   // hinge on the left
  doorB(r) { return builtDoor('single', true); },    // hinge on the right
  doorC(r) { return builtDoor('double', false); },   // double doors



  // ---- server rack: the only thing on the floor with lights on it ---
  rack(r) {
    const w = r.range(0.58, 0.68), d = r.range(0.82, 0.98), h = r.range(1.75, 2.00);
    const glass = r.chance(0.45);
    const parts = [
      P('dark', box(w - 0.05, 0.06, d - 0.05, 0, 0, 0)),
      P('dark', taper(w, h - 0.06, d, 0, 0.06, 0, 0.012)),
      P('metal', taper(w + 0.04, 0.05, d + 0.03, 0, h - 0.02, 0, 0.18)),
    ];
    for (let i = 0; i < 4; i++) {
      const a = [[-1,-1],[1,-1],[-1,1],[1,1]][i];
      parts.push(P('chrome', cyl(0.016, 0.016, h - 0.08, a[0]*(w/2-0.02), 0.06, a[1]*(d/2-0.02), 8)));
      parts.push(P('dark', cyl(0.028, 0.032, 0.06, a[0]*(w/2-0.08), 0, a[1]*(d/2-0.10), 10)));
    }
    // the door: perforated steel or smoked glass, and it is inset
    if (glass) parts.push(P('glassy', box(w - 0.07, h - 0.18, 0.008, 0, 0.10, d/2 + 0.004)));
    else for (let i = 0; i < 14; i++)
      parts.push(P('metal', box(w - 0.07, (h - 0.20)/16, 0.012, 0, 0.11 + i * (h - 0.20)/14, d/2 + 0.004)));
    parts.push(P('chrome', cyl(0.012, 0.012, 0.14, w/2 - 0.06, h * 0.48, d/2 + 0.022, 8)));
    // the kit inside: units with handles, drives and lights
    const n = r.int(6, 10);
    for (let i = 0; i < n; i++) {
      const y = 0.16 + i * ((h - 0.34) / n);
      parts.push(P('metal', box(w - 0.13, (h - 0.34)/n - 0.02, 0.03, 0, y, d/2 - 0.06)));
      for (const sx of [-1, 1])
        parts.push(P('chrome', box(0.03, 0.010, 0.02, sx * (w/2 - 0.10), y + 0.012, d/2 - 0.045)));
      for (let k = 0; k < 3; k++)
        parts.push(P(k === 0 && r.chance(0.7) ? 'led' : 'dark',
          box(0.012, 0.008, 0.006, -0.06 + k * 0.04, y + 0.010, d/2 - 0.042)));
    }
    // and a bundle of cable out of the back, which is what a rack looks like
    for (let i = 0; i < 5; i++)
      parts.push(P('dark', cyl(0.012, 0.012, r.range(0.3, 0.8),
        -w/2 + 0.08 + i * 0.05, 0.10, -d/2 + 0.05, 6)));
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w, h, d }], cover: 1 };
  },

  // ---- photocopier ---------------------------------------------------
  copier(r) {
    const w = r.range(0.66, 0.82), d = r.range(0.58, 0.70);
    const bh = r.range(0.62, 0.78);                 // body height
    const big = r.chance(0.45);                     // a floor unit or a desktop one
    const parts = [
      P('dark',  box(w - 0.06, 0.07, d - 0.06, 0, 0, 0)),
      P('beige', taper(w, bh, d, 0, 0.07, 0, 0.035)),
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(P('dark', cyl(0.035, 0.035, 0.07, sx*(w/2-0.09), 0, sz*(d/2-0.09), 10)));
    // paper drawers: real recessed fronts with handles
    const drawers = big ? 3 : 2;
    for (let i = 0; i < drawers; i++) {
      const y = 0.12 + i * ((bh - 0.20) / drawers);
      parts.push(P('beige', box(w - 0.06, (bh - 0.22) / drawers, 0.014, 0, y, d/2 + 0.006)));
      parts.push(P('dark',  box(w - 0.08, 0.012, 0.02, 0, y + (bh - 0.30) / drawers, d/2 + 0.014)));
    }
    // the scanner deck, its lid, and the hinge - three cross-sections
    const sy = bh + 0.07;
    parts.push(P('beige', taper(w + 0.03, 0.085, d + 0.02, 0, sy, 0, 0.06)));
    parts.push(P('dark',  box(w * 0.72, 0.008, d * 0.68, -0.02, sy + 0.085, -0.01)));
    parts.push(P('beige', box(w * 0.80, 0.035, d * 0.76, -0.02, sy + 0.093, -0.01)));
    for (const sx of [-1, 1])
      parts.push(P('dark', cyl(0.014, 0.014, 0.05, sx * w * 0.28, sy + 0.09, -d/2 + 0.04, 8)));
    // control panel, angled off the front corner
    const cp = new THREE.BoxGeometry(w * 0.42, 0.012, 0.16);
    cp.rotateX(-0.45); cp.translate(w * 0.22, sy + 0.10, d/2 - 0.02);
    parts.push(P('beige', cp));
    parts.push(P('screen', box(w * 0.16, 0.006, 0.05, w * 0.22, sy + 0.135, d/2 - 0.04)));
    for (let i = 0; i < 6; i++)
      parts.push(P('dark', box(0.018, 0.006, 0.018, w*0.10 + (i%3)*0.032,
        sy + 0.125, d/2 + 0.02 - ((i/3)|0) * 0.028)));
    // and the output tray, standing off the side
    parts.push(P('beige', box(w * 0.5, 0.012, d * 0.4, -w * 0.26, sy + 0.02, 0.02)));
    if (r.chance(0.5)) parts.push(P('led', box(0.02, 0.008, 0.008, w*0.36, sy + 0.13, d/2 - 0.05)));
    return { parts, solid: [{ x: 0, y: (sy + 0.13)/2, z: 0,
      w: w + 0.03, h: sy + 0.13, d: d + 0.02 }], cover: 1 };
  },

  // ---- water cooler --------------------------------------------------
  cooler(r) {
    // The prop Liam keeps holding up as the standard. Its bottle is a
    // stack of many-sided cylinders and its body is a tapered box - so
    // this is built the same way rather than as a box with a jug on it.
    const w = r.range(0.32, 0.38), d = w * r.range(0.88, 0.98);
    const bh = r.range(0.92, 1.06);
    const parts = [
      P('dark',  box(w - 0.04, 0.05, d - 0.04, 0, 0, 0)),
      P('white', taper(w, bh - 0.05, d, 0, 0.05, 0, 0.05)),
      P('white', taper(w * 0.86, 0.10, d * 0.86, 0, bh + 0.05, 0, 0.34)),  // the collar
    ];
    // the bottle: neck, shoulder, body, all round
    const br = w * r.range(0.40, 0.46);
    parts.push(P('glassy', cyl(br * 0.34, br * 0.34, 0.05, 0, bh + 0.13, 0, 14)));
    parts.push(P('glassy', cyl(br * 0.36, br, 0.13, 0, bh + 0.18, 0, 16)));
    parts.push(P('glassy', cyl(br, br, r.range(0.26, 0.34), 0, bh + 0.31, 0, 16)));
    parts.push(P('glassy', cyl(br, br * 0.82, 0.07, 0, bh + 0.31 + r.range(0.26, 0.34), 0, 16)));
    // the dispensing recess, taps, and a drip grille
    const ry = bh * r.range(0.52, 0.60);
    parts.push(P('dark', box(w * 0.60, 0.20, 0.05, 0, ry, d/2 - 0.02)));
    for (const [sx, mt] of [[-1, 'vend'], [1, 'chrome']]) {
      parts.push(P(mt, cbox(0.035, 0.075, 0.055, sx * w * 0.15, ry + 0.10, d/2 - 0.01, 0.008)));
      parts.push(P(mt, cyl(0.011, 0.011, 0.045, sx * w * 0.15, ry + 0.055, d/2 + 0.005, 8)));
    }
    parts.push(P('chrome', box(w * 0.56, 0.008, 0.055, 0, ry - 0.005, d/2 - 0.005)));
    for (let i = 0; i < 5; i++)
      parts.push(P('dark', box(0.008, 0.010, 0.05, -w*0.2 + i * w*0.1, ry - 0.004, d/2 - 0.005)));
    if (r.chance(0.5)) parts.push(P('led', box(0.02, 0.012, 0.005, 0, ry + 0.16, d/2 + 0.002)));
    return { parts, solid: [{ x: 0, y: bh/2, z: 0, w, h: bh, d }], cover: 1 };
  },

  // ---- a pot plant, built the way the era built plants --------------
  //
  // Liam: *"the plants improve them"*.
  //
  // The old one was five to nine rotated BOXES in flat green. It read as
  // green bricks in a pot, because that is what it was.
  //
  // A plant has no silhouette a box can stand in for, and the answer the
  // hardware this game imitates actually used is the CROSS-PLANED CARD:
  // two quads at right angles wearing an alpha-cut leaf texture. From any
  // horizontal angle you see leaves and not a plane, it costs four
  // triangles a frond instead of twelve, and it is the single cheapest
  // thing in the whole prop set that looks like the object it is.
  //
  // Three kinds, because one plant repeated forty times is wallpaper: a
  // dracaena with strap leaves, a low bushy ficus, and an upright snake
  // plant. On a stripped floor they are all the dead one.
  plant(r) {
    const KIND = r.pick(['dracaena', 'ficus', 'snake', 'dracaena', 'ficus']);
    const CELL = { dracaena: [0, 0], ficus: [1, 0], snake: [0, 1], dead: [1, 1] }[KIND];
    const potH = KIND === 'snake' ? 0.30 : 0.34;
    const potR = KIND === 'ficus' ? 0.20 : 0.17;
    const parts = [
      // a tapered pot with a rim, not a plain cylinder: the lip is the
      // one detail that stops it reading as a bucket
      P('dark', cyl(potR, potR * 0.76, potH, 0, 0, 0, 8)),
      P('dark', cyl(potR * 1.06, potR * 1.06, 0.045, 0, potH - 0.02, 0, 8)),
      P('soil', cyl(potR * 0.92, potR * 0.92, 0.03, 0, potH - 0.03, 0, 8)),
    ];

    // ---- the fronds ------------------------------------------------
    const nF = KIND === 'ficus' ? r.int(4, 6) : r.int(3, 5);
    const spread = KIND === 'ficus' ? 0.34 : KIND === 'snake' ? 0.10 : 0.22;
    const tall = KIND === 'snake' ? r.range(0.80, 1.10)
               : KIND === 'ficus' ? r.range(0.52, 0.74)
                                  : r.range(0.86, 1.25);
    for (let i = 0; i < nF; i++) {
      const yaw = (i / nF) * 6.283 + r.range(-0.3, 0.3);
      const h = tall * r.range(0.72, 1.0);
      const w = h * (KIND === 'snake' ? 0.55 : 0.95);
      const lean = r.range(0, spread);
      // TWO QUADS AT RIGHT ANGLES. Both get the same texture cell, and
      // the second is the first turned ninety degrees about the stem.
      for (const turn of [0, Math.PI / 2]) {
        const g = new THREE.PlaneGeometry(w, h);
        uvCell(g, CELL[0], CELL[1]);
        g.translate(0, h / 2, 0);
        g.rotateZ(r.range(-0.10, 0.10));
        g.rotateY(yaw + turn);
        g.translate(Math.sin(yaw) * lean, potH - 0.02, Math.cos(yaw) * lean);
        parts.push(P('leaf', g));
      }
      // a stem, so the leaves are attached to something
      const st = new THREE.CylinderGeometry(0.012, 0.018, h * 0.45, 5);
      st.translate(Math.sin(yaw) * lean, potH + h * 0.20, Math.cos(yaw) * lean);
      parts.push(P('stem', st));
    }

    // The collider comes off the geometry now (see put() in level.js), so
    // this is only the fallback - and a plant should not stop you dead
    // anyway: cover 0, and low enough to walk into rather than bounce off.
    return { parts, solid: [{ x: 0, y: potH / 2, z: 0,
                              w: potR * 2.2, h: potH, d: potR * 2.2 }], cover: 0 };
  },

  // ---- a reception / kitchen counter ---------------------------------
  counter(r) {
    const w = r.range(1.6, 2.4), h = 1.05, d = 0.62;
    const parts = [
      P('wood', cbox(w, h - 0.06, d, 0, 0, 0, 0.014)),
      P('wood', cbox(w + 0.08, 0.06, d + 0.06, 0, h - 0.06, 0, 0.014)),   // the worktop lip
      P('dark', box(w - 0.10, 0.04, 0.02, 0, 0.06, d / 2)),               // a kick rail
    ];
    // drawer fronts down one end, a modesty panel down the other
    for (let i = 0; i < 3; i++)
      parts.push(P('wood', cbox(w * 0.30, 0.22, 0.02, -w / 2 + w * 0.19, 0.16 + i * 0.26, d / 2, 0.008)));
    for (let i = 0; i < 3; i++)
      parts.push(P('chrome', box(w * 0.14, 0.02, 0.025, -w / 2 + w * 0.19, 0.30 + i * 0.26, d / 2 + 0.02)));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 1 };
  },

  // ---- a wall cupboard unit ------------------------------------------
  cupboard(r) {
    const w = r.range(0.8, 1.1), h = r.range(1.7, 2.0), d = 0.42;
    const parts = [P('wood', cbox(w, h, d, 0, 0, 0, 0.014))];
    // two doors, a shadow gap between them, and a handle each
    for (const sx of [-1, 1]) {
      parts.push(P('wood', cbox(w / 2 - 0.02, h - 0.08, 0.025, sx * w / 4, 0.04, d / 2, 0.008)));
      parts.push(P('chrome', box(0.022, 0.13, 0.025, sx * 0.035, h * 0.52, d / 2 + 0.022)));
    }
    parts.push(P('dark', box(w, 0.03, 0.02, 0, 0.01, d / 2 + 0.005)));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 2 };
  },

  // ---- a sink unit, for the break room -------------------------------
  sink(r) {
    // Liam: *"go back to the old sink just make the faucet a faucet"*.
    //
    // The rewrite added a twin bowl built from six plates, cupboard doors
    // and a plinth, and it was busier without being better. This is the
    // old shape - a unit, a worktop, one inset bowl - and the only thing
    // that changed is the tap, which was three cylinders in a row and is
    // now an actual mixer: a body, a swan neck that BENDS, an aerator
    // pointing down at the bowl, and two handles.
    const w = r.range(0.58, 0.76), d = r.range(0.44, 0.52), h = 0.90;
    const bw = w * 0.62, bd = d * 0.58, bdep = 0.17;
    const parts = [
      P('white',  cbox(w, h - 0.06, d, 0, 0, 0, 0.012)),
      P('chrome', cbox(w + 0.02, 0.05, d + 0.02, 0, h - 0.05, 0, 0.008)),
      P('dark',   box(w - 0.05, 0.055, d - 0.06, 0, 0, 0.02)),          // toe recess
    ];
    // the bowl, as a recess: floor and four walls
    parts.push(P('chrome', box(bw, 0.010, bd, 0, h - bdep, 0.02)));
    for (const q of [-1, 1]) {
      parts.push(P('chrome', box(0.010, bdep, bd, q * bw / 2, h - bdep, 0.02)));
      parts.push(P('chrome', box(bw, bdep, 0.010, 0, h - bdep, 0.02 + q * bd / 2)));
    }
    parts.push(P('dark', cyl(0.026, 0.026, 0.008, 0, h - bdep + 0.008, 0.02, 12)));

    // ---- the faucet ------------------------------------------------
    const fz = -d / 2 + 0.07, fy = h;
    const rise = r.range(0.13, 0.18);
    parts.push(P('chrome', cyl(0.032, 0.027, 0.028, 0, fy, fz, 14)));      // base
    parts.push(P('chrome', cyl(0.017, 0.016, rise, 0, fy + 0.02, fz, 12)));// column
    // the swan neck: four short segments swept over, so it is a CURVE and
    // not the flat elbow the old one had
    const N = 4, reach = 0.13, top = fy + 0.02 + rise;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * (Math.PI / 2), a1 = ((i + 1) / N) * (Math.PI / 2);
      const z0 = fz + Math.sin(a0) * reach, z1 = fz + Math.sin(a1) * reach;
      const y0 = top + Math.cos(a0) * 0.045 - 0.045, y1 = top + Math.cos(a1) * 0.045 - 0.045;
      const len = Math.hypot(z1 - z0, y1 - y0) + 0.006;
      const g = new THREE.CylinderGeometry(0.015, 0.015, len, 10);
      g.rotateX(Math.PI / 2 - Math.atan2(y1 - y0, z1 - z0));
      g.translate(0, (y0 + y1) / 2, (z0 + z1) / 2);
      parts.push(P('chrome', g));
    }
    // the aerator, pointing DOWN into the bowl - which is the detail that
    // makes it read as a tap rather than a bent pipe
    const spoutZ = fz + reach;
    parts.push(P('chrome', cyl(0.019, 0.016, 0.035, 0, top - 0.075, spoutZ, 10)));
    parts.push(P('dark',   cyl(0.014, 0.014, 0.006, 0, top - 0.079, spoutZ, 10)));
    // two handles, on stubs, turned outward
    for (const sx of [-1, 1]) {
      parts.push(P('chrome', cyl(0.011, 0.011, 0.05, sx * 0.055, fy + 0.012, fz, 8)));
      const lever = cbox(0.055, 0.016, 0.016, sx * 0.075, fy + 0.028, fz, 0.004);
      parts.push(P('chrome', lever));
      parts.push(P('chrome', cyl(0.014, 0.014, 0.012, sx * 0.055, fy + 0.030, fz, 10)));
    }
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 0.7 };
  },

  // ---- a structural pillar, to break up an open floor -----------------
  pillar(r) {
    const s = r.range(0.42, 0.58);
    return { parts: [
      // 2.70, not WALLH: that name is level.js's and has never been in
      // this module. Nothing caught it because nothing had ever spawned a
      // pillar on its own until tools/assets.mjs walked the whole bar.
      P('white', cbox(s, PILLAR_H - 0.10, s, 0, 0.05, 0, 0.02)),
      P('white', cbox(s + 0.10, 0.06, s + 0.10, 0, 0, 0, 0.014)),
      P('white', cbox(s + 0.10, 0.06, s + 0.10, 0, PILLAR_H - 0.11, 0, 0.014)),
    ], solid: [{ x: 0, y: 1.5, z: 0, w: s + 0.1, h: 3.0, d: s + 0.1 }], cover: 2 };
  },

  // ---- a site barrier, for the floors that are still being worked on --
  barrier(r) {
    const w = r.range(1.5, 2.0), h = 1.05;
    const parts = [
      P('vend', cbox(w, 0.12, 0.06, 0, h - 0.14, 0, 0.01)),
      P('vend', cbox(w, 0.12, 0.06, 0, h - 0.46, 0, 0.01)),
    ];
    for (const sx of [-1, 1]) {
      parts.push(P('metal', cyl(0.028, 0.028, h, sx * (w / 2 - 0.05), 0, 0, 10)));
      parts.push(P('metal', cbox(0.34, 0.03, 0.34, sx * (w / 2 - 0.05), 0, 0, 0.008)));
    }
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d: 0.36 }], cover: 1 };
  },

  // ---- AN ARMCHAIR, BUILT THE WAY THE REFERENCES ARE ----------------
  //
  // Liam: *"make me an armchair the current one looks bad"*. The one in
  // the game was furniture_pack mesh 8, and rendered on its own it is
  // half a chair - a back and ONE arm, 12,548 triangles of it.
  //
  // What the reference props actually do, measured off the two he pointed
  // at (aircon 294 tris, cooler 1,956, bench 1,428, all on 256 px sheets):
  //
  //   * the triangles go into SILHOUETTE. The cooler's bottle is a stack
  //     of many-sided cylinders; its body is a tapered box with softened
  //     corners. Nothing in that pack is a bare cuboid.
  //   * a distinctive feature gets REAL GEOMETRY - the aircon's fan is a
  //     modelled grille, not a circle painted on a flat face.
  //   * the texture is modest and mostly flat. It is not carrying the
  //     shape; the shape carries the shape.
  //
  // So: rolled arms and a rolled back as actual cylinders, cushions with
  // a deep chamfer so they read as stuffed rather than sawn, a plinth and
  // feet. About 900 triangles - half a water cooler.
  armchair(r) {
    const w = r.range(0.86, 0.98), d = r.range(0.84, 0.94);
    const seatY = 0.40, armY = 0.62, backY = 0.86, aw = 0.15;
    const parts = [P('dark', cbox(w - 0.06, 0.10, d - 0.06, 0, 0.06, 0, 0.02))];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(P('dark', cyl(0.028, 0.022, 0.06, sx * (w / 2 - 0.10), 0, sz * (d / 2 - 0.10), 10)));
    parts.push(P('leather', cbox(w - 2 * aw, 0.20, d - aw - 0.04, 0, seatY - 0.20, 0.02, 0.055)));
    parts.push(P('leather', cbox(w - 2 * aw, backY - seatY + 0.06, 0.20, 0, seatY - 0.06,
                                 -(d / 2) + 0.12, 0.05)));
    const roll = new THREE.CylinderGeometry(0.10, 0.10, w - 2 * aw, 12);
    roll.rotateZ(Math.PI / 2);
    roll.translate(0, backY + 0.02, -(d / 2) + 0.12);
    parts.push(P('leather', roll));
    for (const sx of [-1, 1]) {
      const ax = sx * (w / 2 - aw / 2);
      parts.push(P('leather', cbox(aw, armY - 0.10, d - 0.06, ax, 0.10, 0, 0.035)));
      const ar = new THREE.CylinderGeometry(aw / 2, aw / 2, d - 0.06, 12);
      ar.rotateX(Math.PI / 2);
      ar.translate(ax, armY, 0);
      parts.push(P('leather', ar));
    }
    // A skirt closing the gap between the plinth and the underside of the
    // cushion. Without it there is a 4 cm slot across the front of the
    // chair and you look straight through it to the floor, which at a
    // standing camera reads as a black bar sawn through the seat.
    parts.push(P('leather', cbox(w - 2 * aw, seatY - 0.20 - 0.14, d - aw - 0.04, 0, 0.14, 0.02, 0.02)));
    // Front piping. In leather, not 'dark' - a dark strip along the top
    // front edge is indistinguishable from the shadow it sits next to.
    parts.push(P('leather', (() => {
      const g = new THREE.CylinderGeometry(0.018, 0.018, w - 2 * aw - 0.02, 8);
      g.rotateZ(Math.PI / 2);
      g.translate(0, seatY - 0.02, (d - aw) / 2 - 0.05);
      return g;
    })()));
    return { parts, solid: [{ x: 0, y: 0.43, z: 0, w, h: 0.86, d }], cover: 1 };
  },

  // ---- a low table to put in front of it -----------------------------
  coffeetable(r) {
    const w = r.range(0.9, 1.2), d = r.range(0.5, 0.62), h = 0.42;
    const parts = [P('wood', cbox(w, 0.05, d, 0, h - 0.05, 0, 0.012))];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(P('dark', cyl(0.022, 0.018, h - 0.05, sx * (w / 2 - 0.08), 0, sz * (d / 2 - 0.07), 10)));
    parts.push(P('wood', cbox(w - 0.16, 0.03, d - 0.14, 0, 0.12, 0, 0.01)));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 0.6 };
  },

  // ---- a standing lamp: a room needs a light that is not the ceiling --
  lamp(r) {
    const h = r.range(1.45, 1.68);
    return { parts: [
      P('dark', cyl(0.15, 0.16, 0.03, 0, 0, 0, 20)),
      P('chrome', cyl(0.018, 0.018, h - 0.26, 0, 0.03, 0, 10)),
      P('shade', cyl(0.13, 0.19, 0.24, 0, h - 0.24, 0, 16)),
      P('lamp', cyl(0.12, 0.12, 0.01, 0, h - 0.03, 0, 16)),
    ], solid: [{ x: 0, y: 0.5, z: 0, w: 0.34, h: 1.0, d: 0.34 }], cover: 0 };
  },

  // ---- a bank of lockers ---------------------------------------------
  lockers(r) {
    const n = r.int(3, 5), cw = 0.34, h = 1.82, d = 0.46;
    const parts = [P('metal', cbox(n * cw, h, d, 0, 0, 0, 0.012))];
    for (let i = 0; i < n; i++) {
      const x = -n * cw / 2 + cw * (i + 0.5);
      parts.push(P('metal', cbox(cw - 0.03, h - 0.06, 0.02, x, 0.03, d / 2, 0.008)));
      for (let v = 0; v < 3; v++)
        parts.push(P('dark', box(cw - 0.14, 0.012, 0.01, x, h - 0.22 + v * 0.035, d / 2 + 0.015)));
      parts.push(P('chrome', box(0.03, 0.10, 0.02, x + cw / 2 - 0.07, h * 0.52, d / 2 + 0.015)));
    }
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w: n * cw, h, d }], cover: 2 };
  },

  // ---- a break-room fridge -------------------------------------------
  fridge(r) {
    // Liam: *"make the fridge be rounder on the edges"*. A fridge is the
    // most rounded thing in any kitchen - the case is a pressed shell
    // with a big radius on every vertical corner and a rolled top. The
    // chamfer here was 18 mm, which at two metres away is a sharp box.
    const w = r.range(0.58, 0.66), h = r.range(1.42, 1.68), d = 0.62;
    const split = h * r.range(0.58, 0.66);
    const C = 0.055;                       // the radius, three times what it was
    const parts = [
      P('enamel', cbox(w, h, d, 0, 0, 0, C)),
      // a rolled top cap, so the lid is not a sharp lip
      P('enamel', cbox(w - 0.03, 0.05, d - 0.03, 0, h - 0.025, 0, 0.022)),
      P('dark',   box(w - 0.06, 0.05, d - 0.08, 0, 0, 0.02)),           // plinth recess
    ];
    // the two doors, proud of the case and rounded on their own edges
    const doors = [[0.02, split - 0.05], [split + 0.015, h - split - 0.045]];
    for (const [y0, dh] of doors) {
      parts.push(P('enamel', cbox(w - 0.03, dh, 0.035, 0, y0, d / 2 - 0.005, 0.026)));
      // The seal is a GASKET - a thin band round the perimeter of the
      // door. Drawn as one filled panel it covered the whole door in
      // black moulded tread and the fridge came out looking like a
      // gym locker.
      const sw = w - 0.075, sy = y0 + 0.022, sh2 = dh - 0.045, sz = d / 2 + 0.014;
      parts.push(P('rubberdark', box(sw, 0.014, 0.010, 0, sy, sz)));
      parts.push(P('rubberdark', box(sw, 0.014, 0.010, 0, sy + sh2, sz)));
      for (const q of [-1, 1])
        parts.push(P('rubberdark', box(0.014, sh2, 0.010, q * sw / 2, sy, sz)));
    }
    // full-height bar handles on stand-offs
    for (const [y0, dh] of doors) {
      const hx = w / 2 - 0.075;
      parts.push(P('chrome', cyl(0.014, 0.014, dh - 0.16, hx, y0 + 0.08, d / 2 + 0.062, 10)));
      for (const e of [0.06, dh - 0.10])
        parts.push(P('chrome', box(0.020, 0.018, 0.045, hx, y0 + e, d / 2 + 0.038)));
    }
    // the gap between the doors, which is what tells you there are two
    parts.push(P('dark', box(w - 0.03, 0.014, 0.02, 0, split - 0.03, d / 2 + 0.012)));
    if (r.chance(0.5))
      parts.push(P('screen', box(0.10, 0.05, 0.006, -w / 4, h - 0.22, d / 2 + 0.026)));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 2 };
  },

  // ---- and a microwave to stand on something -------------------------
  microwave(r) {
    const w = r.range(0.46, 0.56), h = r.range(0.27, 0.32), d = r.range(0.34, 0.40);
    const dw = w * r.range(0.60, 0.68);                 // the door
    const silver = r.chance(0.5);
    const shell = silver ? 'chrome' : 'enamel';
    const parts = [
      P(shell, taper(w, h, d, 0, 0.012, 0, 0.02)),
      P('dark', box(w - 0.03, 0.012, d - 0.03, 0, 0, 0)),   // it stands off the counter
    ];
    for (const sx of [-1, 1]) for (const sz of [-1, 1])
      parts.push(P('dark', cyl(0.012, 0.012, 0.014, sx * (w/2 - 0.05), 0, sz * (d/2 - 0.05), 8)));
    // the door: a frame, a smoked window and the mesh behind it
    const dx = -(w - dw) / 2;
    parts.push(P(shell, box(dw, h - 0.03, 0.014, dx, 0.026, d/2 + 0.004)));
    parts.push(P('dark', box(dw - 0.05, h - 0.09, 0.008, dx, 0.056, d/2 + 0.012)));
    parts.push(P('glassy', box(dw - 0.06, h - 0.10, 0.004, dx, 0.061, d/2 + 0.017)));
    for (let i = 0; i < 6; i++)
      parts.push(P('dark', box(dw - 0.06, 0.004, 0.004, dx, 0.07 + i * 0.028, d/2 + 0.019)));
    // handle: a bar on two stand-offs, which is the whole silhouette
    const hx = dx + dw/2 - 0.02;
    parts.push(P('chrome', cyl(0.014, 0.014, h - 0.09, hx, 0.055, d/2 + 0.048, 10)));
    for (const y of [0.06, h - 0.04])
      parts.push(P('chrome', box(0.016, 0.014, 0.05, hx, y, d/2 + 0.022)));
    // and the control column
    const cx = w/2 - (w - dw) / 2;
    parts.push(P('dark', box((w - dw) - 0.03, h - 0.05, 0.006, cx, 0.036, d/2 + 0.008)));
    parts.push(P('screen', box((w - dw) - 0.06, 0.030, 0.005, cx, h - 0.07, d/2 + 0.012)));
    for (let i = 0; i < 8; i++)
      parts.push(P('chrome', box(0.016, 0.012, 0.004, cx - 0.018 + (i % 2) * 0.036,
        0.06 + ((i / 2) | 0) * 0.032, d/2 + 0.012)));
    if (r.chance(0.5))
      parts.push(P('chrome', cyl(0.022, 0.022, 0.012, cx, 0.075, d/2 + 0.012, 12)));
    return { parts, solid: [{ x: 0, y: (h + 0.012)/2, z: 0, w, h: h + 0.012, d }], cover: 0.5 };
  },

  // ---- a television, the most 2003 object in the building -------------
  tv(r) {
    // A 2001 office television is a CRT: a deep tapered back, a bezel
    // that is proud of the tube, and a curved glass face. Drawn as a
    // slab it may as well be a poster.
    const w = r.range(0.44, 0.62), h = w * r.range(0.74, 0.80);
    const d = w * r.range(0.80, 0.95);
    const shell = r.chance(0.6) ? 'beige' : 'dark';
    const parts = [
      P(shell, taper(w * 0.62, h * 0.86, d - 0.06, 0, h * 0.07, -d * 0.30, 0.30)),
      P(shell, box(w, h, d * 0.34, 0, 0, d * 0.16)),
      P('dark', box(w - 0.05, h - 0.06, 0.012, 0, 0.03, d * 0.33)),
      P('screen', box(w - 0.07, h - 0.08, 0.006, 0, 0.04, d * 0.338)),
    ];
    // the stand, and it is round
    parts.push(P('dark', cyl(w * 0.26, w * 0.30, 0.022, 0, -0.022, 0, 14)));
    // vents across the top and a speaker grille down one side
    for (let i = 0; i < 7; i++)
      parts.push(P('dark', box(w * 0.5, 0.005, 0.02, 0, h - 0.012, -0.06 + i * 0.02)));
    if (r.chance(0.5)) {
      for (let i = 0; i < 5; i++)
        parts.push(P('dark', box(0.05, 0.006, 0.005, w/2 - 0.05, 0.06 + i * 0.018, d * 0.33)));
      parts.push(P('led', box(0.014, 0.008, 0.005, -w/2 + 0.05, 0.05, d * 0.335)));
    } else {
      parts.push(P('led', box(0.012, 0.008, 0.005, 0, 0.045, d * 0.335)));
      for (let i = 0; i < 3; i++)
        parts.push(P('chrome', cyl(0.010, 0.010, 0.006, -0.05 + i * 0.05, 0.055, d * 0.335, 10)));
    }
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w, h, d }], cover: 0.5 };
  },

  // ---- a cast-iron radiator under a window ---------------------------
  radiator(r) {
    const n = r.int(7, 11), h = r.range(0.52, 0.66), fin = 0.055;
    const parts = [];
    for (let i = 0; i < n; i++)
      parts.push(P('enamel', cyl(0.035, 0.035, h, -n * fin / 2 + fin * (i + 0.5), 0.08, 0, 10)));
    parts.push(P('enamel', box(n * fin, 0.05, 0.06, 0, 0.05, 0)));
    parts.push(P('enamel', box(n * fin, 0.05, 0.06, 0, h + 0.08, 0)));
    parts.push(P('chrome', cyl(0.022, 0.022, 0.10, -n * fin / 2 + 0.03, 0, 0, 8)));
    return { parts, solid: [{ x: 0, y: (h + 0.13) / 2, z: 0, w: n * fin, h: h + 0.13, d: 0.14 }],
             cover: 0.6 };
  },

  // ---- sofa, for the reception suites --------------------------------
  sofa(r) {
    const w = r.range(1.6, 2.1);
    const parts = [
      P('fabric', cbox(w, 0.34, 0.82, 0, 0.06, 0)),
      P('fabric', cbox(w, 0.46, 0.18, 0, 0.40, -0.32)),
      P('fabric', cbox(0.16, 0.28, 0.82, -w/2 + 0.08, 0.40, 0)),
      P('fabric', cbox(0.16, 0.28, 0.82,  w/2 - 0.08, 0.40, 0)),
      P('dark', cbox(0.06, 0.06, 0.06, -w/2 + 0.12, 0, -0.3)),
      P('dark', cbox(0.06, 0.06, 0.06,  w/2 - 0.12, 0, -0.3)),
    ];
    return { parts, solid: [{ x: 0, y: 0.4, z: 0, w, h: 0.8, d: 0.86 }], cover: 1 };
  },

  // ---- bookshelf -----------------------------------------------------
  shelf(r) {
    const h = r.range(1.5, 2.0), w = r.range(0.8, 1.2);
    const parts = [
      P('wood', cbox(0.04, h, 0.34, -w/2, 0, 0)),
      P('wood', cbox(0.04, h, 0.34,  w/2, 0, 0)),
      P('wood', cbox(w, 0.03, 0.34, 0, h - 0.03, 0)),
    ];
    const rows = Math.floor(h / 0.38);
    for (let i = 0; i < rows; i++) {
      const y = 0.06 + i * 0.38;
      parts.push(P('wood', cbox(w, 0.025, 0.34, 0, y, 0)));
      let x = -w/2 + 0.05;
      while (x < w/2 - 0.08) {
        const bw = r.range(0.025, 0.055), bh = r.range(0.22, 0.32);
        parts.push(P(r.pick(['book1', 'book2', 'book3']), box(bw, bh, 0.24, x + bw/2, y + 0.025, 0)));
        x += bw + 0.004;
      }
    }
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w, h, d: 0.36 }], cover: 2 };
  },

  // ---- whiteboard on a stand ------------------------------------------
  board(r) {
    const w = r.range(1.2, 1.9), h = r.range(0.85, 1.15);
    const cork = r.chance(0.45);
    const frame = cork ? 'wood' : 'chrome';
    const parts = [
      P(frame, cbox(w + 0.06, h + 0.06, 0.035, 0, 0, 0, 0.008)),
      P(cork ? 'corkface' : 'white', box(w, h, 0.012, 0, 0.03, 0.020)),
    ];
    if (cork) {
      // Liam pointed at the packs' cork board by name. Pins and paper,
      // each standing off the face - that is what makes it a board.
      for (let i = 0; i < 11; i++) {
        const px = r.range(-w/2 + 0.10, w/2 - 0.10), py = r.range(0.12, h - 0.10);
        const pw = r.range(0.10, 0.19), ph = r.range(0.11, 0.20);
        parts.push(P('paperw', box(pw, ph, 0.004, px, py, 0.028)));
        parts.push(P('dark', box(pw, 0.006, 0.004, px, py, 0.027)));
        parts.push(P('vend', cyl(0.007, 0.007, 0.012, px, py + ph - 0.02, 0.034, 8)));
      }
    } else {
      // a whiteboard: a pen tray on brackets, and a wiped ghost
      parts.push(P('chrome', box(w * 0.9, 0.012, 0.055, 0, 0.02, 0.045)));
      for (const sx of [-1, 1])
        parts.push(P('chrome', box(0.03, 0.030, 0.05, sx * w * 0.4, 0.02, 0.04)));
      for (let i = 0; i < 3; i++)
        parts.push(P(['vend', 'dark', 'stem'][i], cyl(0.009, 0.009, 0.10,
          -0.10 + i * 0.10, 0.033, 0.062, 8)));
      for (let i = 0; i < 4; i++)
        parts.push(P('dark', box(r.range(0.15, 0.4), 0.008, 0.002,
          r.range(-w/2 + 0.2, w/2 - 0.3), r.range(0.2, h - 0.1), 0.027)));
    }
    return { parts, solid: [{ x: 0, y: h/2 + 0.03, z: 0, w: w + 0.06, h: h + 0.06, d: 0.08 }],
             cover: 0 };
  },

  // ---- vending machine -------------------------------------------------
  vending(r) {
    const w = r.range(0.86, 1.00), d = r.range(0.72, 0.84), h = r.range(1.80, 1.95);
    const snack = r.chance(0.5);           // snacks behind glass, or cans
    const parts = [
      P('dark', box(w - 0.05, 0.09, d - 0.05, 0, 0, 0.01)),      // recessed plinth
      P('vend', taper(w, h - 0.09, d, 0, 0.09, 0, 0.015)),
      P('vend', taper(w + 0.02, 0.06, d + 0.02, 0, h - 0.03, 0, 0.10)),  // capping
    ];
    const gw = w - 0.14, gh = h * 0.52, gy = h * 0.40;
    if (r.chance(0.34)) {
      // ---- the old solid-fronted machine: a printed fascia -----------
      // This is what T.vendfront() is FOR - one flat panel, one image,
      // the way a real machine's front is a single printed sheet.
      parts.push(P('vendart', plate(w - 0.06, h * 0.80, 0.012, 0, h * 0.12, d/2 + 0.006)));
      parts.push(P('dark', box(w - 0.04, 0.02, 0.02, 0, h * 0.11, d/2 + 0.010)));
    } else {
      // ---- the glazed one: a real recess with real product in it -----
      parts.push(P('dark', box(gw + 0.04, gh + 0.04, 0.02, 0, gy, d/2 - 0.012)));
      parts.push(P('glassy', box(gw, gh, 0.008, 0, gy + 0.02, d/2 + 0.004)));
      const cols = snack ? 5 : 4, rows = snack ? 5 : 4;
      for (let cy = 0; cy < rows; cy++) for (let cx = 0; cx < cols; cx++) {
        const px = -gw/2 + (cx + 0.5) * (gw / cols);
        const py = gy + 0.04 + cy * ((gh - 0.06) / rows);
        if (snack) {
          parts.push(P('paperw', box(gw/cols - 0.03, (gh-0.06)/rows - 0.03, 0.012,
            px, py, d/2 - 0.03)));
          parts.push(P('chrome', cyl(0.005, 0.005, gw/cols - 0.02, px, py - 0.008, d/2 - 0.05, 6)));
        } else {
          parts.push(P('vend', cyl(0.032, 0.032, (gh-0.06)/rows - 0.035, px, py, d/2 - 0.05, 10)));
        }
      }
      parts.push(P('lamp', box(w - 0.12, h * 0.16, 0.01, 0, h * 0.79, d/2 + 0.005)));
      parts.push(P('dark', box(w - 0.10, 0.02, 0.02, 0, h * 0.78, d/2 + 0.004)));
    }
    // keypad, coin slot, and the delivery flap - all proud of the face
    const kx = w/2 - 0.11;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++)
      parts.push(P('dark', box(0.026, 0.026, 0.008,
        kx - 0.03 + j * 0.03, h * 0.36 - i * 0.032, d/2 + 0.006)));
    parts.push(P('chrome', box(0.05, 0.012, 0.012, kx, h * 0.45, d/2 + 0.008)));
    parts.push(P('screen', box(0.10, 0.03, 0.006, kx, h * 0.50, d/2 + 0.006)));
    parts.push(P('dark', box(w * 0.44, 0.16, 0.03, -w * 0.20, 0.20, d/2 - 0.005)));
    parts.push(P('chrome', box(w * 0.44, 0.012, 0.02, -w * 0.20, 0.30, d/2 + 0.008)));
    return { parts, solid: [{ x: 0, y: h/2, z: 0, w, h, d }], cover: 1 };
  },

  bin(r) {
    // A bin is a truncated cone. It was a box.
    const kind = r.int(0, 2);           // 0 mesh, 1 pedal, 2 open cone
    const h = r.range(0.34, 0.46);
    const rb = r.range(0.115, 0.145), rt = rb * r.range(1.10, 1.26);
    const mat = kind === 1 ? 'chrome' : kind === 0 ? 'metal' : 'rubber';
    const parts = [
      P(mat, cyl(rb, rt, h, 0, kind === 1 ? 0.03 : 0, 0, 16)),
      P('dark', cyl(rt * 0.97, rt * 0.97, 0.012, 0, (kind === 1 ? 0.03 : 0) + h - 0.012, 0, 16)),
    ];
    if (kind === 0) {
      // the mesh: real slots, cut as a ring of thin bars
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, rr = (rb + rt) / 2;
        const g = new THREE.BoxGeometry(0.012, h * 0.66, 0.014);
        g.rotateY(-a);
        g.translate(Math.cos(a) * rr, h * 0.14 + h * 0.33, Math.sin(a) * rr);
        parts.push(P('dark', g));
      }
    } else if (kind === 1) {
      // pedal bin: a lid with a hinge, a foot pedal, and it stands on feet
      parts.push(P(mat, cyl(rt + 0.006, rt * 0.86, 0.045, 0, 0.03 + h - 0.004, 0, 16)));
      parts.push(P('dark', box(rt * 0.9, 0.012, 0.03, 0, 0.012, -rt * 0.7)));
      parts.push(P('dark', cyl(0.008, 0.008, rt * 1.2, 0, 0.03 + h + 0.02, 0, 8)));
      for (let i = 0; i < 3; i++) {
        const a = i * 2.094;
        parts.push(P('dark', cyl(0.012, 0.014, 0.03, Math.cos(a) * rb * 0.7, 0, Math.sin(a) * rb * 0.7, 8)));
      }
    } else {
      parts.push(P('dark', cyl(rt * 0.9, rt * 0.9, 0.006, 0, h * 0.55, 0, 14)));  // liner
    }
    const H = h + (kind === 1 ? 0.09 : 0.01);
    return { parts, solid: [{ x: 0, y: H/2, z: 0, w: rt*2, h: H, d: rt*2 }], cover: 0.4 };
  },
};

// =====================================================================
// THINGS THAT ARE NOT FURNITURE
// =====================================================================
//
// Liam: *"make it so I can add in enemies counters coupards and way more
// things flare guns to just so I can really feel this out"*.
//
// A man and a fire axe are not props - one thinks and one goes in your
// hands - so the obvious thing would be a separate placement system for
// each. That is two more things to save, two more things to select, two
// more things to get wrong.
//
// Instead they are placed as MARKERS: ordinary props, in the ordinary
// catalogue, that the game turns into a man or a pickup when the floor
// comes up. Everything already built works on them for free - they are
// in the asset bar, the gizmo moves them, DELETE removes them, and
// edits.json saves them exactly like a desk.
//
// A marker is visible while you are building and invisible once it has
// become the thing it stands for.
const MARK = (col, tall) => (r) => {
  const h = tall ? 1.70 : 0.35;
  return { parts: [
    P('dark', cyl(0.20, 0.24, 0.03, 0, 0, 0, 20)),
    P(col, cyl(0.05, 0.05, h, 0, 0.03, 0, 10)),
    P(col, cyl(0.11, 0.0, 0.16, 0, h, 0, 12)),
  ], solid: [], cover: 0, marker: true };
};

/** who and what the asset bar can drop, and what each becomes */
export const MARKERS = {
  foe_guard:   { kind: 'foe', what: 'guard' },
  // ---- AND TWO THAT NAME THE WEAPON --------------------------------
  //
  // Liam: *"make them all the people who have the glocks and then make
  // one of them have an AK 47"*.
  //
  // Every marker above drops a man of a KIND, and a kind draws its
  // weapon from a weighted list - so `foe_guard` is a glock two times
  // in four and something else the rest of the time. That is right for
  // a floor the generator fills and wrong for a floor he is placing by
  // hand, where the point of putting a man somewhere is usually what he
  // is holding. These two are the same mercenary with the choice taken
  // out of it.
  foe_pistol:  { kind: 'foe', what: 'guard', gun: 'glock' },
  foe_ak:      { kind: 'foe', what: 'guard', gun: 'ak' },
  foe_suit:    { kind: 'foe', what: 'suit' },
  foe_rifle:   { kind: 'foe', what: 'rifle' },
  foe_runner:  { kind: 'foe', what: 'runner' },
  foe_heavy:   { kind: 'foe', what: 'heavy' },
  foe_brawler: { kind: 'foe', what: 'brawler' },
  gun_glock:   { kind: 'gun', what: 'glock' },
  gun_ak:      { kind: 'gun', what: 'ak' },
  gun_shotgun: { kind: 'gun', what: 'shotgun' },
  gun_flare:   { kind: 'gun', what: 'flare' },
  gun_axe:     { kind: 'gun', what: 'axe' },
  gun_machete: { kind: 'gun', what: 'machete' },
  gun_bat:     { kind: 'gun', what: 'bat' },
  gun_ext:     { kind: 'gun', what: 'ext' },
  gun_bandage: { kind: 'gun', what: 'bandage' },
};

for (const [name, m] of Object.entries(MARKERS))
  PROPS[name] = MARK(m.kind === 'foe' ? 'vend' : 'led', m.kind === 'foe');


// ---------------------------------------------------------------------
// MORE THINGS TO PUT IN A ROOM
// ---------------------------------------------------------------------
//
// Liam: *"just add more stuff so I can really fill out the office"*.
// Same rules as everything else here (STYLE.md): the triangles go into
// SILHOUETTE, one distinctive feature gets real geometry, and the texture
// stays modest - the shape carries the shape.

Object.assign(PROPS, {

  // ---- decoration ---------------------------------------------------
  clock(r) {
    const R = r.range(0.14, 0.20);
    const square = r.chance(0.3);
    const rim = r.chance(0.5) ? 'dark' : 'chrome';
    const disc = (rad, t, z, seg) => {
      const g = new THREE.CylinderGeometry(rad, rad, t, seg || 20);
      g.rotateX(Math.PI / 2); g.translate(0, R, z);
      return g;
    };
    const parts = [];
    if (square) {
      parts.push(P(rim, cbox(R * 2, R * 2, 0.045, 0, 0, 0, 0.01)));
      parts.push(P('white', box(R * 1.7, R * 1.7, 0.006, 0, R * 0.15, 0.024)));
    } else {
      parts.push(P(rim, disc(R, 0.045, 0)));
      parts.push(P(rim, disc(R * 0.96, 0.05, 0.004)));
      parts.push(P('white', disc(R * 0.86, 0.006, 0.026)));
    }
    // the marks, which is what makes it read as a clock and not a disc
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2, big = i % 3 === 0;
      const rr = R * 0.74;
      const g = new THREE.BoxGeometry(big ? 0.012 : 0.006, big ? 0.030 : 0.018, 0.004);
      g.rotateZ(-a); g.translate(Math.sin(a) * rr, R + Math.cos(a) * rr, 0.031);
      parts.push(P('dark', g));
    }
    const hand = (len, wid, ang) => {
      const g = new THREE.BoxGeometry(wid, len, 0.004);
      g.translate(0, len / 2, 0); g.rotateZ(-ang);
      g.translate(0, R, 0.033);
      return g;
    };
    const hr = r.range(0, 6.28);
    parts.push(P('dark', hand(R * 0.48, 0.014, hr)));
    parts.push(P('dark', hand(R * 0.70, 0.009, r.range(0, 6.28))));
    parts.push(P('vend', hand(R * 0.74, 0.004, r.range(0, 6.28))));
    parts.push(P(rim, disc(0.012, 0.010, 0.035, 10)));
    return { parts, solid: [{ x: 0, y: R, z: 0, w: R * 2, h: R * 2, d: 0.06 }], cover: 0 };
  },

  poster(r) {
    const w = r.range(0.5, 0.72), h = r.range(0.66, 0.92);
    return { parts: [
      P('dark',   cbox(w + 0.03, h + 0.03, 0.018, 0, 0, 0, 0.004)),
      P('paperw', box(w, h, 0.006, 0, 0.015, 0.013)),
    ], solid: [{ x: 0, y: h / 2, z: 0, w, h, d: 0.04 }], cover: 0 };
  },

  rug(r) {
    const w = r.range(1.6, 2.4), d = r.range(1.1, 1.7);
    return { parts: [
      P('rugface', box(w, 0.012, d, 0, 0.006, 0)),
    ], solid: [], cover: 0 };
  },

  // The plant that goes in the corner of a lobby rather than on a desk.
  palm(r) {
    const h = r.range(1.35, 1.75);
    const parts = [
      P('dark', cyl(0.20, 0.23, 0.30, 0, 0, 0, 12)),
      P('soil', cyl(0.185, 0.185, 0.03, 0, 0.29, 0, 12)),
      P('stem', cyl(0.035, 0.055, h - 0.34, 0, 0.30, 0)),
    ];
    for (let i = 0; i < 5; i++) {
      const a = i * 1.257, y = h - 0.30 + (i % 2) * 0.10;
      const g = new THREE.PlaneGeometry(0.86, 0.52);
      g.rotateX(-0.5 + (i % 3) * 0.2); g.rotateY(a);
      g.translate(Math.cos(a) * 0.30, y, Math.sin(a) * 0.30);
      parts.push(P('leaf', g));
    }
    return { parts, solid: [{ x: 0, y: 0.30, z: 0, w: 0.46, h: 0.60, d: 0.46 }], cover: 0 };
  },

  pinboard(r) {
    const w = r.range(1.1, 1.6), h = 0.85;
    const parts = [
      P('pipe',   cbox(w + 0.06, h + 0.06, 0.045, 0, 0, 0, 0.008)),
      P('corkface', box(w, h, 0.01, 0, 0.03, 0.026)),
    ];
    for (let i = 0; i < 9; i++)
      parts.push(P('paperw', box(r.range(0.09, 0.16), r.range(0.10, 0.17), 0.004,
        r.range(-w / 2 + 0.12, w / 2 - 0.12), r.range(0.16, h - 0.08), 0.032)));
    return { parts, solid: [{ x: 0, y: h / 2 + 0.03, z: 0, w, h, d: 0.07 }], cover: 0 };
  },

  // ---- kitchen ------------------------------------------------------
  kettle(r) {
    const jug = r.chance(0.5);                 // a jug kettle or a dome one
    const h = r.range(0.17, 0.23);
    const rt = jug ? r.range(0.062, 0.072) : r.range(0.085, 0.095);
    const rb = jug ? r.range(0.082, 0.092) : r.range(0.075, 0.085);
    const mat = r.chance(0.5) ? 'chrome' : 'enamel';
    const parts = [
      P('dark',   cyl(0.098, 0.106, 0.022, 0, 0, 0, 16)),      // the base unit
      P('dark',   cyl(0.030, 0.030, 0.006, 0, 0.022, 0, 12)),  // the contact
      P('led',    box(0.016, 0.006, 0.006, 0.055, 0.008, 0.09)),
      P(mat,      cyl(rb, rt, h, 0, 0.026, 0, 16)),            // the body, tapered
      P(mat,      cyl(rt + 0.006, rt + 0.004, 0.012, 0, 0.026 + h, 0, 16)),
      P('dark',   cyl(rt * 0.78, rt * 0.78, 0.016, 0, 0.038 + h, 0, 14)),
      // a water window, which every one of these has
      P('glassy', box(0.020, h * 0.6, 0.008, -rb * 0.94, 0.05, 0)),
    ];
    // the handle, three pieces so it has a silhouette instead of a stub
    const hx = rb + 0.028;
    parts.push(P('dark', cbox(0.020, h * 0.62, 0.026, hx, 0.06, 0, 0.006)));
    parts.push(P('dark', box(0.046, 0.020, 0.024, hx - 0.022, 0.042, 0)));
    parts.push(P('dark', box(0.050, 0.020, 0.024, hx - 0.026, 0.052 + h * 0.6, 0)));
    // and the spout
    const sp = new THREE.CylinderGeometry(0.016, 0.026, 0.055, 10);
    sp.rotateX(-0.9); sp.translate(0, 0.036 + h * 0.86, -rb * 0.9);
    parts.push(P(mat, sp));
    return { parts, solid: [{ x: 0, y: (h + 0.06) / 2, z: 0,
      w: 0.22, h: h + 0.06, d: 0.21 }], cover: 0 };
  },

  // Liam: *"make the A B and Cs look different, an example is the coffee
  // machine they all look the same"*. It had not one random draw in it,
  // so its three variants were the same object three times. Now the
  // machine has a TYPE - a filter jug, a bean-to-cup, or a pod machine -
  // and they are different machines, not the same one at three sizes.
  coffeemachine(r) {
    const kind = r.int(0, 2);                      // 0 filter, 1 bean, 2 pod
    const w = kind === 2 ? r.range(0.20, 0.24) : r.range(0.28, 0.34);
    const d = r.range(0.30, 0.38), bh = r.range(0.36, 0.48);
    const parts = [];
    // plinth, body, and a fascia that slopes back - three cross-sections
    parts.push(P('dark', cbox(w + 0.02, 0.035, d + 0.02, 0, 0, 0, 0.008)));
    parts.push(P('dark', taper(w, bh, d, 0, 0.035, 0, 0.05)));
    parts.push(P('enamel', taper(w - 0.02, 0.085, d - 0.03, 0, bh + 0.035, 0, 0.22)));
    // the drip tray, standing proud on its own grille
    parts.push(P('chrome', box(w - 0.06, 0.010, d - 0.12, 0, 0.14, 0.035)));
    for (let i = 0; i < 5; i++)
      parts.push(P('dark', box(w - 0.08, 0.006, 0.008, 0, 0.151, -0.02 + i * 0.022)));
    if (kind === 0) {
      // filter: a glass jug on a warming plate, and the shower head above
      parts.push(P('chrome', cyl(0.075, 0.075, 0.008, 0, 0.15, 0.02, 14)));
      parts.push(P('glassy', cyl(0.072, 0.062, r.range(0.11, 0.15), 0, 0.158, 0.02, 14)));
      parts.push(P('dark', cbox(0.022, 0.10, 0.022, w / 2 - 0.02, 0.17, 0.02, 0.005)));
      parts.push(P('dark', cyl(0.05, 0.045, 0.03, 0, bh - 0.04, 0.02, 12)));
    } else if (kind === 1) {
      // bean to cup: the hopper is the silhouette, and it is a cone
      parts.push(P('glassy', cyl(0.085, 0.055, 0.13, 0, bh + 0.12, -0.02, 14)));
      parts.push(P('dark', cyl(0.058, 0.058, 0.03, 0, bh + 0.09, -0.02, 14)));
      for (const sx of [-1, 1])
        parts.push(P('chrome', cyl(0.011, 0.011, 0.055, sx * 0.028, 0.26, d / 2 - 0.06, 8)));
    } else {
      // pod: small, with a lever on top and a fold-down cup shelf
      parts.push(P('chrome', cyl(0.016, 0.016, 0.09, 0, bh - 0.02, -0.02, 8)));
      parts.push(P('dark', cbox(0.07, 0.02, 0.05, 0, bh + 0.06, -0.02, 0.006)));
      parts.push(P('chrome', cyl(0.010, 0.010, 0.05, 0, 0.24, d / 2 - 0.05, 8)));
    }
    // controls: a screen or a row of buttons, never both
    if (r.chance(0.55)) parts.push(P('screen', box(w * 0.4, 0.04, 0.006, 0, bh - 0.10, d / 2 + 0.002)));
    else for (let i = 0; i < 3; i++)
      parts.push(P('chrome', cyl(0.012, 0.012, 0.008, -0.05 + i * 0.05, bh - 0.09, d / 2, 10)));
    for (const sx of [-1, 1])
      parts.push(P('led', box(0.014, 0.014, 0.005, sx * 0.05, bh - 0.16, d / 2 + 0.002)));
    return { parts, solid: [{ x: 0, y: (bh + 0.16) / 2, z: 0,
      w: w + 0.02, h: bh + 0.16, d: d + 0.02 }], cover: 0.6 };
  },

  // ---- seating ------------------------------------------------------
  stool(r) {
    const h = r.range(0.62, 0.76);
    const parts = [P('leather', cyl(0.17, 0.18, 0.07, 0, h - 0.07, 0, 14))];
    for (let i = 0; i < 3; i++) {
      const a = i * 2.094;
      parts.push(P('chrome', cyl(0.016, 0.020, h - 0.07,
        Math.cos(a) * 0.13, 0, Math.sin(a) * 0.13, 8)));
    }
    parts.push(P('chrome', cyl(0.145, 0.145, 0.014, 0, h * 0.34, 0, 14)));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w: 0.36, h, d: 0.36 }], cover: 0.4 };
  },

  bench(r) {
    const w = r.range(1.5, 2.2), h = 0.44, d = 0.42;
    const parts = [P('wood', cbox(w, 0.06, d, 0, h - 0.06, 0, 0.01))];
    for (const sx of [-1, 1]) {
      parts.push(P('metal', cbox(0.05, h - 0.06, d - 0.06, sx * (w / 2 - 0.13), 0, 0, 0.008)));
      parts.push(P('metal', box(0.05, 0.03, d, sx * (w / 2 - 0.13), 0.015, 0)));
    }
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 0.6 };
  },

  // ---- storage ------------------------------------------------------
  bookcase(r) {
    const w = r.range(0.8, 1.1), h = r.range(1.5, 1.95), d = 0.32;
    const parts = [
      P('wood', cbox(w, h, d, 0, 0, 0, 0.008)),
      P('dark', box(w - 0.06, h - 0.06, 0.01, 0, 0.03, -d / 2 + 0.02)),
    ];
    const shelves = Math.round((h - 0.2) / 0.36);
    const bk = ['book1', 'book2', 'book3'];
    for (let i = 1; i <= shelves; i++) {
      const y = 0.08 + (i * (h - 0.16)) / (shelves + 1);
      parts.push(P('wood', box(w - 0.05, 0.022, d - 0.04, 0, y, 0.01)));
      let x = -w / 2 + 0.06, guard = 0;
      while (x < w / 2 - 0.10 && guard++ < 40) {
        const bw = r.range(0.025, 0.055), bh = r.range(0.19, 0.27);
        parts.push(P(bk[r.int(0, 2)],
          box(bw, bh, d - 0.10, x + bw / 2, y + 0.011 + bh / 2, 0.02)));
        x += bw + 0.004;
      }
    }
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 1 };
  },

  crate(r) {
    const w = r.range(0.5, 0.8), h = r.range(0.4, 0.62);
    const parts = [P('wood', cbox(w, h, w, 0, 0, 0, 0.01))];
    for (const sz of [-1, 1]) for (const y of [h * 0.22, h * 0.78])
      parts.push(P('pipe', box(w + 0.012, 0.035, 0.012, 0, y, sz * (w / 2 + 0.004))));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d: w }], cover: 0.7 };
  },

  // ---- structure ----------------------------------------------------
  //
  // Liam: *"let me make walls"*.
  //
  // Deliberately the plainest things in this file. Every other prop is
  // built to a fixed size because a filing cabinet has a size; a wall is
  // whatever length you drag it to, so it ships at one storey high, two
  // metres long, and gets its shape from the gizmo. That is why the
  // per-axis scaling had to come first - a wall is unusable without it.
  //
  // One skirting board, because a plastered box with no skirting reads as
  // a prop and a plastered box with one reads as a room. It scales with
  // the wall, which is wrong in the way nobody notices and right in the
  // way that matters: it stays proportional.
  wall(r) {
    const w = 2.0, h = 2.70, t = 0.15;
    return { parts: [
      P('plaster', box(w, h, t, 0, 0, 0)),
      P('white',   box(w, 0.10, t + 0.012, 0, 0, 0)),
      P('white',   box(w, 0.035, t + 0.02, 0, h - 0.035, 0)),
    ], solid: [{ x: 0, y: h / 2, z: 0, w, h, d: t }], cover: 2 };
  },

  // A riser, a step, a desk-height ledge, a mezzanine floor. Same idea.
  platform(r) {
    const w = 2.0, h = 0.30, d = 2.0;
    return { parts: [
      P('plaster', box(w, h, d, 0, 0, 0)),
      P('white',   box(w + 0.02, 0.02, d + 0.02, 0, h - 0.02, 0)),
    ], solid: [{ x: 0, y: h / 2, z: 0, w, h, d }], cover: 1 };
  },

  railing(r) {
    const w = r.range(1.6, 2.6), h = 1.02;
    const rail = (rad, y) => {
      const g = new THREE.CylinderGeometry(rad, rad, w, 10);
      g.rotateZ(Math.PI / 2); g.translate(0, y, 0);
      return g;
    };
    const parts = [P('chrome', rail(0.024, h)), P('chrome', rail(0.016, h * 0.55))];
    const n = Math.max(2, Math.round(w / 0.9));
    for (let i = 0; i <= n; i++)
      parts.push(P('chrome', cyl(0.022, 0.022, h, -w / 2 + (w * i) / n, 0, 0, 10)));
    return { parts, solid: [{ x: 0, y: h / 2, z: 0, w, h, d: 0.10 }], cover: 2 };
  },
});



// ---------------------------------------------------------------------
// THE VENTILATION - the thing that makes a ceiling read as a building
// ---------------------------------------------------------------------
//
// Liam asked for it by name and he is right to: a bare ceiling is the
// single biggest tell that a level is a level. Real ducts run in straight
// trunks along the corridors, drop a branch and a grille wherever a room
// needs air, and hang off threaded rod. That is four boxes per metre and
// it does more for the room than anything else here.
export function duct(len, horiz) {
  const parts = [];
  const w = 0.52, h = 0.36;
  parts.push(P('duct', horiz ? box(len, h, w, 0, 0, 0) : box(w, h, len, 0, 0, 0)));
  // the flanged joints every metre and a half, which is what makes it
  // read as ductwork rather than as a beam
  for (let d = -len/2 + 0.75; d < len/2; d += 1.5) {
    parts.push(P('duct', horiz ? box(0.05, h + 0.05, w + 0.05, d, -0.025, 0)
                               : box(w + 0.05, h + 0.05, 0.05, 0, -0.025, d)));
  }
  // hangers up to the slab
  for (let d = -len/2 + 0.5; d < len/2; d += 2.2) {
    for (const s of [-1, 1]) {
      parts.push(P('chrome', horiz ? box(0.02, 0.34, 0.02, d, h, s * w/2)
                                   : box(0.02, 0.34, 0.02, s * w/2, h, d)));
    }
  }
  return parts;
}

export function grille(horiz) {
  const parts = [P('metal', horiz ? box(0.44, 0.03, 0.30, 0, 0, 0)
                                  : box(0.30, 0.03, 0.44, 0, 0, 0))];
  for (let i = 0; i < 5; i++) {
    const o = -0.16 + i * 0.08;
    parts.push(P('dark', horiz ? box(0.40, 0.012, 0.02, 0, -0.012, o)
                               : box(0.02, 0.012, 0.40, o, -0.012, 0)));
  }
  return parts;
}

/** the fluorescent troffer that lit every office of that decade */
export function troffer() {
  return [
    P('metal', cbox(1.20, 0.10, 0.60, 0, 0, 0)),
    P('lamp', cbox(1.10, 0.02, 0.50, 0, -0.02, 0)),
  ];
}

/** a length of conduit / sprinkler pipe along a wall or the core */
export function pipe(len, horiz, rad = 0.045) {
  const g = new THREE.CylinderGeometry(rad, rad, len, 8);
  if (horiz) g.rotateZ(Math.PI / 2); else g.rotateX(Math.PI / 2);
  return [P('pipe', g)];
}

// ---------------------------------------------------------------------
// MATERIALS - where the "complex texture" half of the brief lives
// ---------------------------------------------------------------------
export function propMaterials(T, surf) {
  return {
    // BACK TO THE OLD WOOD. Liam: *"fix the new wood textures and go
    // back to the old ones"*. T.laminate is a printed melamine figure
    // with an edge band - correct for a 2001 office desk, and wrong on
    // everything else that is made of wood in this building, doors most
    // of all. It is kept and it is used by nothing until it earns a
    // material of its own.
    wood:   surf(T.wood('#6b4a2c'), [1, 1]),
    // Painted sheet steel: it chips at the corners and shows primer.
    metal:  surf(T.painted('#5a5f66'), [1, 1]),
    // Brushed: directional grain and a specular band, never chipped.
    chrome: surf(T.brushed('#9aa0a8'), [1, 1]),
    // Matte rubber: it absorbs light. No highlights, no scratches.
    dark:   surf(T.rubber('#23262b'), [1, 1]),
    // ---- ONE FAMILY PER MATERIAL, not nine tints of one -----------
    //
    // Every one of these used to be T.metal(tint): the same brushed rows,
    // the same 44 scratches, the same grime, on a PC case, a fridge, a
    // locker, a bin and a vending machine. See the note above T.painted.
    beige:  surf(T.plastic('#cfc7b0'), [1, 1]),    // the colour of every 2003 PC
    white:  surf(T.plastic('#d8d8d4'), [1, 1]),
    // Upholstery: woven cloth, no border, no motif. Partitions, settees,
    // chair pads. It tiles, so it must have nothing in it that reads as a
    // corner or an edge.
    fabric: surf(T.weave('#5c5f6b', 'plain'), [1, 1]),
    // A rug, which is a single object with edges - so it may have them.
    rugface: surf(T.weave('#6e6274', 'greek'), [1, 1]),
    paperw: surf(T.paper(), [1, 1]),
    glassy: new THREE.MeshLambertMaterial({ map: T.glass(), transparent: true, opacity: 0.5 }),
    duct:   surf(T.galv(), [1, 1]),
    pipe:   surf(T.painted('#6d5540'), [1, 1]),
    soil:   surf(T.concrete('#3a2c20'), [1, 1]),
    // FOLIAGE IS A CUT-OUT, and it has to be visible from behind: a
    // cross-planed card is half back-faces by definition, and single
    // sided it disappears as you walk round it. alphaTest rather than
    // transparent so it still writes depth and does not need sorting.
    stem:   new THREE.MeshLambertMaterial({ color: 0x4a5c33 }),
    leaf:   new THREE.MeshLambertMaterial({ map: T.frond(), transparent: false,
              alphaTest: 0.5, side: THREE.DoubleSide }),
    screen: new THREE.MeshBasicMaterial({ color: 0x2a3f4a }),
    led:    new THREE.MeshBasicMaterial({ color: 0x62ff7a }),
    lamp:   new THREE.MeshBasicMaterial({ color: 0xf2f0e2 }),
    // ONE IMAGE OF A MACHINE FRONT IS NOT A TILING SURFACE.
    //
    // T.vendfront() draws a complete fascia - sign, glass, racked cans,
    // keypad. Pointed at 'vend', which is the machine's BODY material, it
    // was wrapped round every face: the sides and the back of the machine
    // each wore their own little grid of cans. A texture that depicts a
    // specific object can only go on the face that object is.
    //
    // So the body is painted steel like any other painted steel, and the
    // graphic gets its own slot, used on one flat panel only.
    vend:   surf(T.painted('#8e1f18'), [1, 1]),
    vendart: surf(T.vendfront(), [1, 1]),
    // ITS OWN HIDE, not metal wearing a brown tint - see T.leather.
    // Repeat [2,2] so the seams and buttons land at furniture scale
    // rather than one seam per whole chair.
    leather:surf(T.leather('#5a3128'), [2, 2]),
    enamel: surf(T.enamelled('#e6e4dd'), [1, 1]),
    // Plaster, not tinted metal - see R14. A wall is the largest flat
    // thing in any room and metal's even sheen on that much surface is
    // the single most plastic-looking thing you can do.
    plaster: surf(T.concrete('#c9c6bd'), [1, 1]),
    // Liam pointed at the packs' cork board by name.
    corkface: surf(T.cork(), [1, 1]),
    rubberdark: surf(T.rubber('#26292e'), [1, 1]),
    shade:  new THREE.MeshLambertMaterial({ color: 0xd8cfae }),
    book1:  new THREE.MeshLambertMaterial({ color: 0x6b3a2a }),
    book2:  new THREE.MeshLambertMaterial({ color: 0x2a3f5a }),
    book3:  new THREE.MeshLambertMaterial({ color: 0x4a4a3a }),
  };
}


// ---------------------------------------------------------------------
// VARIANTS - A, B and C of everything
// ---------------------------------------------------------------------
//
// Liam: *"make variations of everything, an ABC"*.
//
// Every prop in this file already varies: it is built from a seeded
// stream, so two bins in different places are different bins. What it
// could not do is let you CHOOSE which one - the seed comes from where it
// lands, so the only way to get the other bin was to put it somewhere
// else. For furnishing a room by hand that is useless.
//
// So each prop gets three fixed draws, named A, B and C. They are not
// random every time you place one: seed 1, 2 and 3 of that prop's own
// stream, so B is always the same B, it saves and reloads as the same B,
// and you can put a row of five identical chairs down if you want a row
// of five identical chairs.
//
// The unsuffixed name stays and still means "seeded from where it lands",
// because every prop the generator has ever placed and every edit Liam
// has ever made is keyed on it. A is not an alias for it - A is a
// specific chair, the plain name is whatever that spot produces.
const VARIANT_SEEDS = { A: 0x51ed01, B: 0x9e3779, C: 0x2545f4 };
const NO_VARIANTS = new Set(['doorA', 'doorB', 'doorC']);

// A real hash of the name, not name.length. With the length, every
// four-letter prop (desk, sofa, bin2...) shared a seed and their As all
// drew the same numbers - harmless, but the kind of thing that is
// baffling later when two unrelated props change together.
const hashName = (s) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

for (const name of Object.keys(PROPS)) {
  if (name.startsWith('foe_') || name.startsWith('gun_')) continue;
  // doorA/doorB/doorC ARE the variants - left-hung, right-hung, double -
  // and there is no prop called 'door' behind them, so the "is this
  // already a variant" test had nothing to find and cheerfully produced
  // doorAA, doorAB, doorAC, doorBA ... twelve doors where there are three.
  if (NO_VARIANTS.has(name)) continue;
  if (/[ABC]$/.test(name) && PROPS[name.slice(0, -1)]) continue;
  const fn = PROPS[name];
  if (typeof fn !== 'function') continue;
  for (const [suffix, seed] of Object.entries(VARIANT_SEEDS)) {
    if (PROPS[name + suffix]) continue;
    PROPS[name + suffix] = () => fn(rng((seed ^ hashName(name)) >>> 0));
  }
}


// ---------------------------------------------------------------------
// CATEGORIES - what the asset bar sorts by
// ---------------------------------------------------------------------
//
// Liam: *"put them each in there own categories like decorations so
// plants other stuff like that, kitchen which can be microwave counter
// stuff like that fridge you know, weapons, enemies ... and seating like
// couches arm chairs"*.
//
// One list per row of the bar. Anything not named here falls into
// 'office', which is the right default for a building full of offices.
export const CATEGORY = {
  seating:    ['armchair', 'sofa', 'chair', 'stool', 'bench', 'coffeetable'],
  kitchen:    ['fridge', 'microwave', 'sink', 'counter', 'cupboard', 'kettle',
               'coffeemachine', 'cooler', 'vending'],
  decoration: ['plant', 'palm', 'poster', 'clock', 'rug', 'pinboard', 'board', 'lamp', 'tv'],
  doors:      ['doorA', 'doorB', 'doorC'],
  storage:    ['cabinet', 'lockers', 'shelf', 'bookcase', 'crate', 'rack', 'bin'],
  structure:  ['wall', 'platform', 'pillar', 'partition', 'barrier', 'railing', 'radiator'],
  office:     ['desk', 'computer', 'copier'],
};

// name -> category, built once from the table above.
const OF = {};
for (const [cat, names] of Object.entries(CATEGORY)) for (const n of names) OF[n] = cat;

/** Which row of the asset bar a prop belongs on. */
export function categoryOf(name) {
  if (name.startsWith('foe_')) return 'enemies';
  if (name.startsWith('gun_')) return 'weapons';
  const base = /[ABC]$/.test(name) && OF[name.slice(0, -1)] ? name.slice(0, -1) : name;
  return OF[base] || 'office';
}
