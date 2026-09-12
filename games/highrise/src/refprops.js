// =====================================================================
// HIGHRISE :: refprops.js - LIAM'S REFERENCE PACK, IN THE GAME
// =====================================================================
//
// He sent five GLBs with *"these are good quality exactly how everything
// should look assets so use these and remake the graphics"*. So they are
// not a mood board - they are the art, and this is where they get put in
// the building.
//
// The fifth file is a fifteen-piece set, and its meshes are named
// Object_4 .. Object_35, so the only way to find out what is in it was to
// photograph each one on its own (tools/ref.mjs --parts). What came back:
//
//     0  black rubbish sack        7  crate of junk, colourful top
//     1  green dumpster body       8  wooden pallet
//     2  castor wheels             10 a standing figure
//     3  dumpster lid              11 A VENDING MACHINE - the best thing
//     5  air-conditioning unit        in the pack, and exactly what an
//     6  conduit bend                 office corridor needs
//     12 traffic cone              13 teal tarpaulin
//
// EVERYTHING IS LOADED ONCE AND CLONED. A floor has a dozen of these on
// it and every clone shares one geometry and one texture, which is the
// only way an imported asset is affordable at this count.
//
// They arrive in whatever units their author used - the axe is 16.7 long,
// the bin 1.3 - so every one declares the size it should be in METRES and
// gets scaled to it. A prop that is the wrong size is worse than no prop.
import * as THREE from '../vendor/three.module.js';
import { asset } from './base.js';
import { loadGLB, fit } from './glb.js';
import { colliders } from './collide.js';
import { vendingSkin } from './vendskin.js';
import { corkSkin } from './corkskin.js';

const FILES = {
  axe:   'machado_no_estilo_de_ps1.glb',
  bin:   'lata_de_lixo_de_ps1.glb',
  ext:   'extintor_de_incendio_estilo_ps1.glb',
  bench: 'banco_no_estilo_de_ps1.glb',
  set:   'asset_no_estilo_de_ps1_v3.glb',
  // ---- the second batch ---------------------------------------------
  //
  // Same kind of asset, built at modern fidelity: 512 and 1024 sheets
  // with linear filtering. glb.js downsamples every one of them to 256
  // and forces nearest on the way in, so they land in the house style
  // rather than being the sharpest thing in the building by a factor of
  // eight. See STYLE.md.
  office:  'office_pack_models.glb',
  garbage: 'garbage_pack_2.glb',
  table:   'ps2_old_table.glb',
  tower:   'brutalist_building_ps1_style.glb',
  // NEVER LOADED UNTIL NOW. Liam sent this with the second batch and it
  // sat in assets/ref unopened - seven textures at 512 and 1024, and I
  // was building sofas out of boxes the whole time. Photographed one
  // primitive at a time (node tools/ref.mjs shots/x.png --pack=furniture_pack)
  // because material names have lied twice: most of it is disassembled
  // parts - loose cushions, a castor base, panels - but mesh 8 is a
  // complete buttoned leather armchair at 3,062 triangles and it is the
  // best seat in any of the packs.
  furn:    'furniture_pack.glb',
};

// name -> which file, which mesh out of it, and how big it really is
//
// The mesh indices were established by photographing every piece on its
// own (`node tools/ref.mjs out --pack=<file>`); the files name everything
// Object_2..Object_20 and there is no other way to know. Do not guess
// them - the mapping is in STYLE.md.
const DEF = {
  axe:     { f: 'axe',   size: 0.90, axis: 'y' },
  ext:     { f: 'ext',   size: 0.52, axis: 'y' },
  bin:     { f: 'bin',   size: 0.78, axis: 'y' },
  bench:   { f: 'bench', size: 1.70, axis: 'x' },
  // ---- the street/office set ---------------------------------------
  binbag:  { f: 'set', mesh: 0,  size: 0.62, axis: 'y' },
  dumpster:{ f: 'set', mesh: 1,  size: 1.25, axis: 'y' },
  hydrant: { f: 'set', mesh: 4,  size: 0.78, axis: 'y' },
  aircon:  { f: 'set', mesh: 5,  size: 0.95, axis: 'y' },
  conduit: { f: 'set', mesh: 6,  size: 1.60, axis: 'y' },
  laundry: { f: 'set', mesh: 7,  size: 0.85, axis: 'y' },
  pallet:  { f: 'set', mesh: 8,  size: 0.16, axis: 'y' },
  plywood: { f: 'set', mesh: 9,  size: 0.14, axis: 'y' },
  vending: { f: 'set', mesh: 11, size: 1.95, axis: 'y' },
  // ---- AND ITS THREE VARIANTS ARE THE SAME MACHINE ------------------
  //
  // Liam: *"for the vending machine variants you made just make it the
  // from the pack vending machine"*.
  //
  // They were not. Nothing named vendingA/B/C existed here, so spawnProp
  // fell past the pack and built them out of boxes in props.js - three
  // different machines standing next to the real one. Same mesh, same
  // size, different paint and different stock: see vendskin.js.
  vendingA: { f: 'set', mesh: 11, size: 1.95, axis: 'y', skin: 'A' },
  vendingB: { f: 'set', mesh: 11, size: 1.95, axis: 'y', skin: 'B' },
  vendingC: { f: 'set', mesh: 11, size: 1.95, axis: 'y', skin: 'C' },
  cone:    { f: 'set', mesh: 12, size: 0.72, axis: 'y' },
  tarp:    { f: 'set', mesh: 13, size: 1.10, axis: 'y' },
  payphone:{ f: 'set', mesh: 14, size: 1.35, axis: 'y' },
  // ---- the office pack ---------------------------------------------
  //
  // THE MATERIAL NAMES SAY WHAT EACH MESH IS, and I should have read
  // them the first time instead of guessing from a thumbnail. Every
  // primitive in this file has its own material and the author named
  // them: Desk1Mtl, TrashCan1Mtl, Tower1Mtl, WaterCooler1Mtl. Three of
  // these were labelled wrong, and one of the three was Liam's
  // *"desks are overturned"* - it was being placed as a floor-standing
  // photocopier in a corridor, and before that balanced on a desktop.
  //
  //   mesh | material              | what it is
  //   -----+-----------------------+---------------------------
  //     0  | CafeteriaChair1Mtl    | office chair
  //     1  | Corkboard011Mtl       | corkboard (small)
  //     2  | Clock1Mtl             | wall clock
  //     3  | Books21Mtl            | a row of books
  //     4  | PortraitPaintingG1Mtl | framed print
  //     5  | Meshpart1Mtl          | desk mat / open folder
  //     6  | Desk1Mtl              | DESK  (was 'printer')
  //     7  | Corkboard1Mtl         | corkboard (large)
  //     8  | TrashCan1Mtl          | office waste bin  (was 'monitor')
  //     9  | Tower1Mtl             | PC tower  (was 'vcr')
  //    10  | PortraitPaintingF1Mtl | framed print
  //    11  | TableDrafting11Mtl    | drafting table
  //    12  | WaterCooler1Mtl       | water cooler
  //
  // Read them with: node tools/pack.mjs office_pack_models.glb
  // ---- AND THE MATERIAL NAMES LIED TOO. Third time, new mechanism. ----
  //
  // The block above says to read the material names instead of guessing
  // from a thumbnail. That was better than guessing and it is still not
  // the truth: a material name is what the AUTHOR called the material,
  // not what the mesh is, and this pack reuses and mislabels them. Liam:
  // *"the trash cans and desktops have the same issue ... I think the
  // texture isn't on it right"* - the texture was fine every time; the
  // OBJECT was not what its name said.
  //
  // Photographed one primitive at a time with
  //   node tools/ref.mjs shots/_office_parts.png --pack=office_pack_models
  // which is the only thing that has ever been right about this pack:
  //
  //   mesh | material name       | what it ACTUALLY is
  //   -----+---------------------+--------------------------------------
  //     0  | CafeteriaChair1Mtl  | a seat pad and a back pad. NO frame,
  //        |                     | no legs, no base - two cushions.
  //     6  | Desk1Mtl            | a whole L-shaped WORKSTATION CLUSTER
  //        |                     | with a printer and a shelf tower on
  //        |                     | it. 4,987 tris, 8.8 x 3.2 x 12.3 -
  //        |                     | an aspect ratio no single desk has.
  //     8  | TrashCan1Mtl        | a bin KNOCKED OVER, with its contents
  //        |                     | spilling out. It is modelled lying on
  //        |                     | its side.
  //     9  | Tower1Mtl           | a VCR / disc player, not a PC tower.
  //    11  | TableDrafting11Mtl  | two tall vending-style cabinets.
  //
  // THE RULE THAT SURVIVES ALL THREE ROUNDS: nothing about an imported
  // mesh is known until it has been rendered on its own. Not the file
  // name, not the mesh name, not the material name, not the thumbnail.
  //
  // These four are renamed to what they are and the ones that cannot be
  // used honestly are no longer placed - see the pools in level.js.
  seatpad: { f: 'office', mesh: 0,  size: 0.46, axis: 'y' },
  corkB:   { f: 'office', mesh: 1,  size: 0.70, axis: 'y' },
  clock:   { f: 'office', mesh: 2,  size: 0.34, axis: 'y' },
  books:   { f: 'office', mesh: 3,  size: 0.30, axis: 'y' },
  artA:    { f: 'office', mesh: 4,  size: 0.62, axis: 'y' },
  deskmat: { f: 'office', mesh: 5,  size: 0.42, axis: 'x' },
  // The cluster. Pinned on its LONG axis because that is the only
  // dimension of it that means anything - its height is a shelf tower's,
  // not a desk's, so pinning y made a 7 m run of furniture 2.9 m deep and
  // it rendered as the dark scattered mess in shots/props.html.
  workstation:{ f: 'office', mesh: 6, size: 3.20, axis: 'z' },
  corkA:   { f: 'office', mesh: 7,  size: 0.90, axis: 'y' },
  // ---- THE PINBOARDS ARE THAT BOARD, RE-PINNED ----------------------
  //
  // Liam: *"now do that for the pin boards too use the cork and make
  // those poster flyer things use those textures"*.
  //
  // `pinboard` was procedural - a frame, a flat cork panel and nine
  // white boxes - while the pack has a real corkboard with a poster,
  // two letters, a docket and four yellow notes printed on it. So all
  // four pinboards are that mesh; each shuffles the notices into a
  // different arrangement (corkskin.js). corkA and corkB stay exactly
  // as the pack drew them.
  pinboard:  { f: 'office', mesh: 7, size: 0.90, axis: 'y', cork: 'P' },
  pinboardA: { f: 'office', mesh: 7, size: 0.90, axis: 'y', cork: 'A' },
  pinboardB: { f: 'office', mesh: 7, size: 0.90, axis: 'y', cork: 'B' },
  pinboardC: { f: 'office', mesh: 7, size: 0.90, axis: 'y', cork: 'C' },
  // Modelled ON ITS SIDE with the rubbish coming out, so it is litter,
  // not a bin. Placing it upright under a desk is what Liam photographed.
  binSpill: { f: 'office', mesh: 8, size: 0.62, axis: 'x' },
  vcr:     { f: 'office', mesh: 9,  size: 0.43, axis: 'x' },
  artB:    { f: 'office', mesh: 10, size: 0.56, axis: 'y' },
  cabinets:{ f: 'office', mesh: 11, size: 1.85, axis: 'y' },
  cooler:  { f: 'office', mesh: 12, size: 1.25, axis: 'y' },
  // ---- the furniture pack ------------------------------------------
  //
  // NOTHING FROM IT IS DECLARED, and that is deliberate. Mesh 8 was
  // wired in as `armchair` and it is half a chair - a back and one arm,
  // 12,548 triangles of it. Worse, the name collided with the procedural
  // armchair in props.js, and spawnProp looks at the imported table
  // FIRST: so every "armchair" placed from the asset bar was the broken
  // import, and the good one could not be reached at all. Liam asked why
  // the built-in armchair looked smooth and the answer was that he had
  // never seen it.
  //
  // The pack is still loaded - it is mostly disassembled parts and there
  // may be something worth having in it later - but nothing is named
  // out of it until it has been rendered on its own and is whole.
  // ---- the garbage pack --------------------------------------------
  junkpile:{ f: 'garbage', mesh: 0, size: 1.00, axis: 'x' },
  crate:   { f: 'garbage', mesh: 1, size: 0.90, axis: 'y' },
  skipRust:{ f: 'garbage', mesh: 2, size: 1.45, axis: 'y' },
  mattress:{ f: 'garbage', mesh: 3, size: 0.85, axis: 'x' },
  skipBlue:{ f: 'garbage', mesh: 4, size: 1.40, axis: 'y' },
  // ---- and a table that is already in metres ------------------------
  table:   { f: 'table', size: 1.55, axis: 'x' },
};

// The tower is not a prop and is not scaled like one - see cityscape().
const TOWER = 'tower';

const loaded = {};
const built = {};
let ready = false;

/** call once at boot, before the first floor is generated */
export async function preloadRef() {
  await Promise.all(Object.entries(FILES).map(async ([k, f]) => {
    try { loaded[k] = await loadGLB(asset('assets/ref/' + f)); }
    catch (e) { console.warn('reference asset missing: ' + f, e); loaded[k] = null; }
  }));

  for (const [name, d] of Object.entries(DEF)) {
    const src = loaded[d.f];
    if (!src) continue;
    let node = src;
    if (d.mesh !== undefined) {
      const meshes = [];
      src.traverse((o) => { if (o.isMesh) meshes.push(o); });
      if (!meshes[d.mesh]) continue;
      // ITS OWN TRANSFORM, DROPPED. A mesh inside a set carries wherever
      // the author put it in the scene, and a vending machine that
      // remembers it used to be nine metres to the left is a vending
      // machine floating outside the building.
      // KEEP THE WAY THE AUTHOR STOOD IT UP.
      //
      // Liam: *"the desks are overturned and the textures are wrong"*.
      //
      // This used to clear the mesh's position, rotation AND scale, and
      // the comment above only justifies the position. Clearing the other
      // two threw away the pack's own orientation - every one of these
      // files carries a Z-up-to-Y-up matrix on its root node, because
      // that is how Blender exports - so a desk whose long axis is Z came
      // out standing on its end, twelve metres tall before scaling, and
      // then got squashed to 1.3 m by fit(). That is the object in his
      // screenshot, and the black smears on it are the underside and the
      // inside of the drawer voids, which you are only ever meant to see
      // if the desk has been tipped over.
      //
      // Baking the WORLD matrix into a copy of the geometry is the fix
      // and it is also the simplest correct thing: it keeps every
      // rotation and scale between the mesh and the file root, and drops
      // the position for free because fit() re-centres on the bounding
      // box straight afterwards.
      const src2 = meshes[d.mesh];
      src2.updateWorldMatrix(true, false);
      const geo = src2.geometry.clone().applyMatrix4(src2.matrixWorld);
      geo.computeBoundingBox();
      node = new THREE.Group();
      node.add(new THREE.Mesh(geo, (d.skin || d.cork)
        ? reskin(src2.material, d.skin ? vendingSkin : corkSkin, d.skin || d.cork)
        : src2.material));
    } else {
      node = src.clone(true);
    }
    built[name] = fit(node, d.size, d.axis);
    // THE SHAPE IT ACTUALLY IS, not the box it fits in.
    //
    // Liam: *"make colliders better and more accurate ... some things the
    // player can phase through and other things they can't"*. A bounding
    // box says a table is a solid cube; this says it is a top and four
    // legs, so you can slide under it and shoot between them. Computed
    // once per prop KIND here, never per instance.
    built[name].userData.hull = colliders(built[name], d.cell ? { cell: d.cell } : {});
    // and measure it, so the collider below is the size of the thing
    const b = new THREE.Box3().setFromObject(built[name]);
    built[name].userData.size = b.getSize(new THREE.Vector3());
  }
  ready = true;
  return built;
}

export function refReady() { return ready; }
export function refNames() { return Object.keys(built); }

/**
 * A copy, placed. Returns null if the pack failed to load, so every call
 * site can fall back to the procedural prop rather than crashing a floor.
 */
/**
 * The same material with a repainted copy of its sheet.
 *
 * A VARIANT NEEDS ITS OWN TEXTURE, not its own tint. `material.color`
 * would multiply the whole machine including the crisps, and it cannot
 * empty a shelf. So the sheet is redrawn - see vendskin.js - and only
 * this one material points at the copy. The pack's own atlas is shared by
 * fifteen props and is never touched.
 *
 * The sampler settings are copied across by hand because a new texture
 * gets three.js's defaults, and linear filtering on a 256 sheet is the
 * one thing that would make this prop look like it came from a different
 * game than everything beside it.
 */
function reskin(mat, draw, which) {
  const m0 = Array.isArray(mat) ? mat[0] : mat;
  const out = m0.clone();
  const img = m0.map && m0.map.image;
  if (!img) return out;
  const tex = new THREE.CanvasTexture(draw(img, which));
  tex.wrapS = m0.map.wrapS; tex.wrapT = m0.map.wrapT;
  tex.magFilter = m0.map.magFilter; tex.minFilter = m0.map.minFilter;
  tex.generateMipmaps = m0.map.generateMipmaps;
  tex.colorSpace = m0.map.colorSpace;
  // ---- AND IT MUST NOT BE FLIPPED TWICE -----------------------------
  //
  // The pack's map is an ImageBitmap, decoded with its rows already the
  // way the sampler wants them - glTF textures are stored upside down
  // relative to a canvas, and the loader resolves that at decode time
  // while leaving flipY reading `true`. Copying that flag onto a canvas
  // that already holds the flipped pixels flips them a second time: the
  // first render of this came out mirrored top to bottom, with the
  // ribbed panel from the top of the atlas showing where the goods
  // should be and no shelves anywhere.
  //
  // So a canvas copy of an ImageBitmap is never flipped again. An
  // ordinary <img> source has not been pre-flipped and keeps the flag.
  tex.flipY = (typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap)
    ? false : m0.map.flipY;
  tex.needsUpdate = true;
  out.map = tex;
  return out;
}

export function refProp(name, opts = {}) {
  const src = built[name];
  if (!src) return null;
  const g = src.clone(true);
  // ITS OWN NAME TRAVELS WITH IT. The editor reads this back off whatever
  // you click on, and it is the difference between "(unnamed group)" and
  // a line you can paste into DEF above.
  g.name = name;
  g.userData.refName = name;
  if (opts.ry) g.rotation.y = opts.ry;
  if (opts.scale) g.scale.multiplyScalar(opts.scale);
  return g;
}

/** the box a reference prop occupies, for collision and cover */
/** the box list describing a prop's real shape - see collide.js */
export function refHull(name) {
  const src = built[name];
  return (src && src.userData.hull) || null;
}

export function refSize(name) {
  const src = built[name];
  return src ? src.userData.size : null;
}

// =====================================================================
// THE CITY OUTSIDE THE WINDOWS
// =====================================================================
//
// The whole premise is that you are most of the way up a tower in
// Manhattan, and until now the glazed perimeter looked out onto nothing
// at all - which quietly undid the premise every time you turned toward a
// window. Liam's brutalist building is 21,000 triangles of concrete slab
// with a lit-window texture on it, and a ring of them around the building
// is the single cheapest thing that makes the height real.
//
// They are placed ONCE and never rebuilt: the city does not change when
// you go up a floor, and rebuilding it per floor would be the most
// expensive thing in the game for no gain.
export function cityscape(seed = 1) {
  const src = loaded[TOWER];
  const g = new THREE.Group();
  if (!src) return g;

  // deterministic, so the skyline is the same building every time
  let s = seed >>> 0 || 1;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);

  const base = fit(src.clone(true), 1, 'y');       // normalised, then scaled per tower

  // A CITY, NOT A FENCE.
  //
  // Liam: *"produce some more buildings that are outside the windows"*.
  // There were twenty, in three tidy rings, and from inside they read as
  // a hedge round a garden: evenly spaced, all facing you, all the same
  // distance apart, with nothing behind them. Manhattan does not look
  // like that from a window. It looks like a lot of buildings, most of
  // them partly hidden by nearer ones, thinning out toward a haze.
  //
  // Three changes, and the third is the one that does the work:
  //
  //   1. FIVE RINGS out to 420 m instead of three out to 150, so there is
  //      something behind the front row and the far ones fade into fog
  //      rather than stopping at an edge.
  //   2. CLUSTERS, not an even spacing. Real blocks come in groups with
  //      gaps between them, and a gap you can see through is what makes
  //      the group next to it read as solid.
  //   3. VARIED FOOTPRINTS. The same model at the same proportions eleven
  //      times is one building repeated; squashed and stretched on X and
  //      Z it is eleven buildings. It costs nothing - same geometry, same
  //      draw call count - and it is most of why the old skyline looked
  //      like wallpaper.
  // THE INNER RING HAS TO CLEAR THE BUILDING YOU ARE IN.
  //
  // First attempt put it at 56 m with footprints up to 1.5x their height.
  // The tower you are standing in is 42 x 30 m, so its own half-width is
  // 25 m and a 100 m-wide neighbour 40 m away is not a skyline, it is a
  // wall pressed against the glass - which is exactly what it looked
  // like. Pushed out, spread over five times the depth, and the footprint
  // variation reined in to something a building could actually have.
  const RING = [
    // [distance, how many, height range]
    [ 92,  8, [34,  76]],
    [148, 12, [48, 118]],
    [222, 14, [62, 150]],
    [310, 15, [70, 178]],
    [418, 13, [50, 155]],
  ];
  let n = 0;
  for (const [dist, count, [h0, h1]] of RING) {
    for (let i = 0; i < count; i++) {
      // CLUSTERED: the angle is jittered by nearly a whole slot, so they
      // bunch and leave gaps instead of sitting on a dial.
      const slot = (Math.PI * 2) / count;
      const a = i * slot + (rnd() - 0.5) * slot * 1.5;
      const d = dist * (0.86 + rnd() * 0.34);
      const h = h0 + rnd() * (h1 - h0);
      const t = base.clone(true);
      // a footprint of its own, so no two are the same building
      t.scale.set(h * (0.74 + rnd() * 0.46), h, h * (0.74 + rnd() * 0.46));
      // DOWN, a long way. The player is sixty floors up; a tower whose
      // base is at his feet reads as a shed in a car park. Sinking them
      // means the windows look out at other buildings' MIDDLES, which is
      // what being high up actually looks like.
      t.position.set(Math.cos(a) * d, -h * (0.52 + rnd() * 0.22) - 6, Math.sin(a) * d);
      t.rotation.y = rnd() * Math.PI * 2;
      g.add(t);
      n++;
    }
  }
  g.userData.towers = n;
  return g;
}
