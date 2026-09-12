// =====================================================================
// HIGHRISE :: level.js - a floor plan turned into geometry
// =====================================================================
//
// The PLAN is in src/plan.js and imports nothing, so it can be generated
// and inspected in Node without a browser - which is the only sane way to
// tell whether a floor has rooms, doors and a route through it. This file
// is only the part that needs three.js.
import * as THREE from '../vendor/three.module.js';
import { T, surf } from './tex.js';
import { PROPS, duct, grille, troffer, pipe, propMaterials , categoryOf } from './props.js';
import { CELL, WALL_H, W, D, GLASS, CORE } from './plan.js';

// THE PLAN GRID, for the tools. tools/middles.mjs has to ask the same
// question clearMiddles() asks - "is this prop against anything" - and it
// cannot do that without knowing how big a cell is. Exported here rather
// than duplicated in the tool, so the two can never drift apart.
if (typeof window !== 'undefined') window.__grid = { CELL, W, D };
import { weaponMesh } from './guns.js';
import { buildNav } from './nav.js';
import { refProp, refReady, refSize, refHull, refNames } from './refprops.js';
import { placeColliders, colliders } from './collide.js';
import * as Doors from './doors.js';
import { rng } from './rng.js';
import { GEN } from './mode.js';
export * from './plan.js';

//
// Everything merges into a handful of meshes, one per material. A floor
// is around forty boxes' worth of triangles and eight textures, which is
// exactly the budget the look is built on.
export function build(P) {
  const group = new THREE.Group();
  const solids = [];                       // AABBs, for collision
  const r = P.r;

  const box = (list, x, y, z, w, h, d) => {
    list.push({ x, y, z, w, h, d });
    return { x, y, z, w, h, d };
  };
  const push = (arr, b) => {
    const g = new THREE.BoxGeometry(b.w, b.h, b.d);
    g.translate(b.x, b.y, b.z);
    arr.push(g);
  };
  const wallG = [], glassG = [], coreG = [];

  for (let z = 0; z < D; z++) for (let x = 0; x < W; x++) {
    const v = P.at(x, z);
    if (!v) continue;
    const cx = (x - W/2 + 0.5) * CELL, cz = (z - D/2 + 0.5) * CELL;
    if (v === GLASS) {
      push(glassG, box(solids, cx, WALL_H/2, cz, CELL, WALL_H, CELL));
    } else if (v === CORE) {
      push(coreG, box(solids, cx, WALL_H/2, cz, CELL, WALL_H, CELL));
    } else {
      push(wallG, box(solids, cx, WALL_H/2, cz, CELL, WALL_H, CELL));
    }
  }

  // A LABEL, so a diagnostic can say WHICH merged mesh you walked
  // through. tools/probe.mjs found 163 rays a frame passing through
  // visible structure in empty plan cells and could only call it
  // "structure", because every merged mesh on the floor was anonymous.
  const merge = (geos, mat, label) => {
    if (!geos.length) return null;
    const m = mergeGeometries(geos);
    const mesh = new THREE.Mesh(m, mat);
    if (label) mesh.name = label;
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    return mesh;
  };
  const FW = W * CELL, FD = D * CELL;
  // THE WALLS BELONG TO THE FLOOR'S KIND. An office is painted board, a
  // residential conversion is papered, and a floor stripped to the slab is
  // open studwork with the insulation showing. One line, and two floors
  // stop reading as the same floor with the furniture moved.
  // EVERY WALL IS AN ELEVATION NOW, not a tile. See the long note on
  // T.wallFace: each cell is a 1 m by 3 m box whose v runs floor to
  // ceiling, so one texture at repeat [1,1] carries a skirting board, a
  // ceiling shadow and scuffs at chair height on every wall in the
  // building. Repeat must stay [1,1] or the skirting tiles up the wall.
  const TINTS = {
    office:   ['#b6ad9c', '#a9a99e', '#c2b7a4'],
    cellular: ['#c2b7a4', '#9aa2a4', '#cfc4ad'],
    trading:  ['#9aa2a4', '#aeb4b2'],
    apart:    ['#8a8168', '#7d6f66', '#6d7a70'],
    gutted:   ['#8e857a'],
    // the upper tower. Plant is painted block in the colours plant rooms
    // are actually painted; the sky lobby and the executive floors are
    // where the money went, so they are paler and warmer than anything
    // below them; the penthouse is domestic.
    mech:     ['#7c8a90', '#6f7a72'],
    sky:      ['#cdc6b6', '#c4bfb4', '#d2cabb'],
    exec:     ['#8c7a63', '#7f6e5c', '#a2917a'],
    pent:     ['#b3a996', '#9d9483', '#a89c8a'],
  };
  // THE TINT IS PICKED ONCE and kept, because the wall above a doorway has
  // to be the same colour as the wall beside it. Picking it inside the
  // material factory meant the door heads came out a different shade of
  // the same paint on every floor, which reads as a rendering fault.
  const wallTint = r.pick(TINTS[P.kind] || TINTS.office);
  // A DADO RAIL IS A DOMESTIC AND AN EXPENSIVE DETAIL, so it is on the
  // residential floors, some cellular offices, and everything above the
  // sky lobby - which is the cheapest way of saying "this half of the
  // building cost more" without a single new texture.
  const wallStyle = (P.kind === 'apart' || P.kind === 'exec' || P.kind === 'pent'
    || (P.kind === 'cellular' && r.chance(0.45))) ? 'rail' : 'plain';
  const WALLMAT = {
    gutted: () => surf(T.studs(), [1, 1]),
    // A PLANT FLOOR IS NOT PLASTERED. Painted blockwork, floor to
    // ceiling, and it makes floors 12 and 24 unmistakable from the
    // doorway.
    mech: () => surf(T.painted(wallTint), [1, 1]),
  };
  const wallMat = (WALLMAT[P.kind] || (() => surf(T.wallFace(wallTint, wallStyle), [1, 1])))();
  // The plaster ABOVE a doorway is painted plaster, not an elevation: a
  // 90 cm head with the full floor-to-ceiling texture on it puts a
  // skirting board over the door, which is exactly what the first pass
  // did. Same paint, tiling.
  const soffitMat = surf(T.wall(wallTint), [1, 1]);
  merge(wallG, wallMat, 'walls');
  // THE CORE IS BRICK - it is the oldest part of the building and the part
  // the stairs are cut into.
  // THREE COURSES TO A METRE, not one. A brick face is about 22 cm by
  // 8 cm, and at repeat [1,1] one 512-pixel sheet was being stretched
  // over a whole three-metre storey - so every brick came out the size of
  // a breeze block and the core read as toy masonry. The vertical repeat
  // has to match the wall's actual height.
  merge(coreG, surf(T.brick(), [1.15, 3.2]), 'core');
  const glass = merge(glassG, new THREE.MeshLambertMaterial({
    map: T.glass(), transparent: true, opacity: 0.42, side: THREE.DoubleSide }));

  // =====================================================================
  // DOORWAYS, AND WHAT IS ON THE WALLS
  // =====================================================================
  //
  // Liam: *"redo all of the walls interiors"*.
  //
  // Two things were missing and they are different problems.
  //
  // A DOORWAY WAS A GAP. The plan cut a hole in a wall and the geometry
  // dutifully built a hole - no frame, no head, no threshold - so every
  // opening in the building was an absence rather than a thing. A door
  // frame is four boxes and it is the difference between "there is no
  // wall here" and "this is the way through".
  //
  // AND A WALL WAS BLANK. Even with a skirting board painted on it (see
  // T.wallFace), a wall with nothing ON it reads as a surface rather than
  // as part of a building. Switches, sockets, signage, a noticeboard, a
  // fire plan, somebody's framed print - all of it is alpha-cut quads off
  // one atlas, which is exactly how this era did it and costs one mesh
  // for the whole floor.
  // ---- WHERE THE CEILING HANGS -------------------------------------
  //
  // Liam: *"glitches with the roof"* - the tiles tearing into themselves
  // in long diagonal bands.
  //
  // The planes used to be at exactly WALL_H, and so is the TOP FACE of
  // every wall box in the building: walls run 0 to WALL_H. Two surfaces
  // at identical depth is a coin toss per pixel per frame, and 110 of 259
  // upward samples had a wall top and a ceiling tile arguing over the
  // same pixels. 15 mm was not enough either - at a 0.12/700 near-far
  // ratio that is still inside the depth buffer's noise, the same
  // precision problem that made the bullet holes invisible.
  //
  // 6 cm settles it, and it is not a fudge: a suspended ceiling hangs
  // below the structure, and the reveal at the wall is exactly what you
  // see in a real office. Everything hung from the ceiling keys off this,
  // so the grid and the fittings can never drift apart again.
  const CEIL_Y = WALL_H - 0.06;
  const CEIL = CEIL_Y - 0.008;          // the highest a fitting may reach
  let stairTop = null, hole = null;
  // Declared here rather than beside the wall-case block that fills it:
  // the art placement further down needs to know where the cases are so
  // it does not hang a picture on one, and that code runs first.
  const cabinets = [];
  const cwx = (x) => (x - W/2 + 0.5) * CELL;
  const cwz = (z) => (z - D/2 + 0.5) * CELL;
  const DOOR_H = 2.12;

  const frameG = [], soffitG = [];
  const doorLeafG = [];
  const openings = [];                 // remembered, so no fitting lands in one
  for (const d of P.doors) {
    if (!d || d.along === undefined) continue;
    const x2 = d.x2 === undefined ? d.x : d.x2, z2 = d.z2 === undefined ? d.z : d.z2;
    const mx = (cwx(d.x) + cwx(x2)) / 2, mz = (cwz(d.z) + cwz(z2)) / 2;
    const span = (Math.abs(d.x - x2) + Math.abs(d.z - z2) + 1) * CELL;
    const alongX = d.along === 'x';
    // the wall's thickness runs across the opening; the opening runs along
    const half = span / 2;
    openings.push({ x: mx, z: mz, r: half + 0.6 });

    // ---- THE ARCHITRAVE IS A TRIM, NOT A PORTAL ---------------------
    //
    // The first pass made each jamb a full metre deep - the whole
    // thickness of the wall - out of dark timber, and put a metre-deep
    // wooden lintel across the top. The result was a doorway made of
    // railway sleepers: every opening on the floor was a great brown slab
    // and the corridor shots were unreadable.
    //
    // A real frame is a 7 cm band of trim on EACH FACE of the wall, and
    // nothing in between - the reveal is just the cut edge of the wall,
    // which is already textured. Four thin pieces instead of two thick
    // ones, and the opening stops looking like a mineshaft.
    const TR = 0.075, TD = 0.035;                 // trim width, how proud
    for (const face of [-1, 1]) {
      const fo = (CELL / 2 + TD / 2) * face;
      for (const s of [-1, 1]) {
        const jx = alongX ? mx + s * (half - TR / 2) : mx + fo;
        const jz = alongX ? mz + fo : mz + s * (half - TR / 2);
        push(frameG, { x: jx, y: DOOR_H / 2, z: jz,
                       w: alongX ? TR : TD, h: DOOR_H, d: alongX ? TD : TR });
      }
      // and the head trim across the top of the two jambs
      push(frameG, { x: alongX ? mx : mx + fo, y: DOOR_H - TR / 2,
                     z: alongX ? mz + fo : mz,
                     w: alongX ? span : TD, h: TR, d: alongX ? TD : span });
    }
    // ---- THE JAMBS ARE SOLID TOO ------------------------------------
    //
    // The single biggest source of walk-through on a floor: 141 of 181
    // rays in tools/probe.mjs. It is only 7.5 cm of trim standing in the
    // doorway, which is why I nearly left it - but "nearly invisible" and
    // "not there" are different, and a door frame you clip the corner of
    // is the kind of thing you feel without being able to name.
    //
    // ONE BOX PER JAMB, spanning both faces of the wall rather than two
    // boxes per face. Half the colliders for a difference of 3.5 cm that
    // nothing could ever detect, and the doorway is still 1.21 m wide -
    // room to run through sideways, which was the point of two-cell
    // doors in the first place.
    for (const s of [-1, 1]) {
      const jx = alongX ? mx + s * (half - TR / 2) : mx;
      const jz = alongX ? mz : mz + s * (half - TR / 2);
      solids.push({ x: jx, y: DOOR_H / 2, z: jz,
                    w: alongX ? TR : CELL + TD * 2, h: DOOR_H,
                    d: alongX ? CELL + TD * 2 : TR });
    }
    // ---- the plaster above it, in the WALL's paint -------------------
    push(soffitG, { x: mx, y: (DOOR_H + WALL_H) / 2, z: mz,
                    w: alongX ? span : CELL, h: WALL_H - DOOR_H,
                    d: alongX ? CELL : span });
    // ---- and a threshold strip on the floor -------------------------
    push(frameG, { x: mx, y: 0.008, z: mz,
                   w: alongX ? span : CELL * 0.55, h: 0.016,
                   d: alongX ? CELL * 0.55 : span });

    // ---- a leaf, standing WIDE open, on some of them -----------------
    //
    // Open, always. A closed door is a door the player has to be taught
    // to interact with, and this game never stops for anything. It also
    // has to be swung near ninety degrees so it lies inside the reveal of
    // a metre-thick wall - at forty degrees it stood across the middle of
    // the doorway and filled the screen, which was worse than no door.
    if (r.chance(0.40)) {
      const s = r.chance(0.5) ? -1 : 1;
      const swing = r.range(1.42, 1.60) * s;
      const leafW = Math.min(0.86, span / 2 - 0.06);
      const g = new THREE.BoxGeometry(leafW, DOOR_H - 0.08, 0.042);
      g.translate(leafW / 2, 0, 0);                    // hinge at one end
      g.rotateY(swing);
      if (!alongX) g.rotateY(Math.PI / 2);
      const hx = alongX ? mx + s * (half - 0.05) : mx;
      const hz = alongX ? mz : mz + s * (half - 0.05);
      g.translate(hx, (DOOR_H - 0.08) / 2 + 0.04, hz);
      doorLeafG.push(g);
      // ---- AND THE DOOR IS SOLID -----------------------------------
      //
      // It was not. An open door leaf standing out into the room is one
      // of the most obviously physical things on a floor and you walked
      // straight through it. tools/probe.mjs found it by name once the
      // merged meshes were labelled - before that it was just part of a
      // count called "structure".
      //
      // The leaf hangs from a hinge and swings, so its collider is the
      // rotated box: hinge at (hx, hz), swung by `swing`, half a leaf
      // out along that heading.
      {
        const th = alongX ? swing : swing + Math.PI / 2;
        const cxo = Math.cos(th) * leafW / 2, czo = -Math.sin(th) * leafW / 2;
        solids.push({
          x: hx + cxo, y: (DOOR_H - 0.08) / 2 + 0.04, z: hz + czo,
          w: Math.abs(leafW * Math.cos(th)) + Math.abs(0.042 * Math.sin(th)),
          h: DOOR_H - 0.08,
          d: Math.abs(leafW * Math.sin(th)) + Math.abs(0.042 * Math.cos(th)),
        });
      }
    }
  }
  merge(soffitG, soffitMat, 'doorheads');
  merge(frameG, surf(T.wood('#6b5540'), [1, 1]), 'architraves');
  merge(doorLeafG, surf(T.wood('#5a4028'), [1, 1]), 'doorleaves');

  // ---- the fittings --------------------------------------------------
  const fitG = [];
  const FIT = {                       // atlas cell, metres wide/high, height
    sw:     { i: 0, j: 0, w: 0.09, h: 0.13, y: 1.22, p: 0.30 },
    socket: { i: 1, j: 0, w: 0.12, h: 0.09, y: 0.34, p: 0.30 },
    vent:   { i: 2, j: 0, w: 0.46, h: 0.28, y: 2.42, p: 0.16 },
    clock:  { i: 3, j: 0, w: 0.30, h: 0.30, y: 2.25, p: 0.05 },
    artA:   { i: 0, j: 1, w: 0.52, h: 0.42, y: 1.68, p: 0.12 },
    artB:   { i: 1, j: 1, w: 0.46, h: 0.38, y: 1.72, p: 0.12 },
    notice: { i: 2, j: 1, w: 0.86, h: 0.62, y: 1.58, p: 0.10 },
    exit:   { i: 3, j: 1, w: 0.42, h: 0.16, y: 2.32, p: 0 },   // doors only
    num:    { i: 0, j: 2, w: 0.26, h: 0.12, y: 1.72, p: 0 },   // doors only
    fire:   { i: 1, j: 2, w: 0.30, h: 0.56, y: 1.20, p: 0.07 },
    poster: { i: 2, j: 2, w: 0.44, h: 0.60, y: 1.62, p: 0.12 },
    therm:  { i: 3, j: 2, w: 0.12, h: 0.10, y: 1.42, p: 0.07 },
    plan:   { i: 0, j: 3, w: 0.40, h: 0.32, y: 1.60, p: 0.07 },
    panel:  { i: 1, j: 3, w: 0.42, h: 0.60, y: 1.10, p: 0.07 },
    hole:   { i: 2, j: 3, w: 0.34, h: 0.34, y: 1.35, p: 0.09 },
  };
  const N = 4;
  const fit = (k, px, py, pz, rotY) => {
    const F = FIT[k];
    const g = new THREE.PlaneGeometry(F.w, F.h);
    const uv = g.attributes.uv;
    const u0 = F.i / N, v0 = 1 - (F.j + 1) / N, u1 = (F.i + 1) / N, v1 = 1 - F.j / N;
    uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0);
    uv.needsUpdate = true;
    g.rotateY(rotY);
    g.translate(px, py, pz);
    fitG.push(g);
  };
  // a sign over every doorway, and a room number beside about half
  for (const o of openings) {
    // Facing both ways, because a doorway is used from both sides and a
    // sign you can only read from one is worse than no sign.
    for (const ry of [0, Math.PI]) fit('exit', o.x, FIT.exit.y, o.z + (ry ? -0.02 : 0.02), ry);
  }
  // and everything else, on wall faces that something can actually see
  const SIDES = [[1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2], [0, 1, 0], [0, -1, Math.PI]];
  const KEYS = Object.keys(FIT).filter((k) => FIT[k].p > 0);
  for (let z = 1; z < D - 1; z++) for (let x = 1; x < W - 1; x++) {
    if (P.at(x, z) === 0) continue;                 // only on walls
    const wx = cwx(x), wz = cwz(z);
    for (const [ox, oz, ry] of SIDES) {
      if (P.at(x + ox, z + oz) !== 0) continue;     // that face is buried
      // NOT IN A DOORWAY, and not right beside one - a light switch
      // floating in the middle of an opening is the sort of thing that
      // only shows up once there are five hundred of them.
      const fx = wx + ox * (CELL / 2 + 0.015), fz = wz + oz * (CELL / 2 + 0.015);
      if (openings.some((o) => Math.hypot(fx - o.x, fz - o.z) < o.r)) continue;
      if (!r.chance(0.30)) continue;
      const k = r.pick(KEYS);
      if (!r.chance(FIT[k].p * 3.2)) continue;
      fit(k, fx, FIT[k].y, fz, ry);
    }
  }
  merge(fitG, new THREE.MeshLambertMaterial({
    map: T.fittings(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide }));

  // ---- WHERE THE STAIRWELL COMES THROUGH ----------------------------
  //
  // Worked out here rather than down in the ceiling block, because THREE
  // things have to agree about it: the ceiling planes, the slab
  // colliders, and - the one that was missing - the floor you walk on.
  const SW = P.stair;
  const cX = cwx(SW.x) + (SW.w - 1) / 2;
  const hx0 = cX - 2.0, hx1 = cX + 2.0;
  const hz0 = cwz(SW.z) - 0.5, hz1 = cwz(SW.z) - 0.5 + SW.d;

  // floor and ceiling
  const FLOORMAT = {
    apart:   () => surf(T.wood(r.pick(['#6b4a2c', '#7a5a34'])), [W/2, D/2]),
    gutted:  () => surf(T.concrete('#6e6a63'), [W/2, D/2]),
    trading: () => surf(T.carpet(r.pick(['#3f4a44', '#3a3f4a'])), [W/2, D/2]),
    // The plant floor is a slab like the gutted floors, but a sealed and
    // painted one rather than a broken one.
    mech:    () => surf(T.concrete('#7a7d80'), [W/2, D/2]),
    // Stone in the sky lobby. It is the one public room this high up and
    // the only floor in the building you cross on something hard.
    sky:     () => surf(T.tile(), [W, D]),
    // Deep, quiet, expensive carpet upstairs, and boards in the
    // penthouse because it is somebody's home.
    exec:    () => surf(T.weave(r.pick(['#4a3f46', '#3d4640']), 'greek'), [W/3, D/3]),
    pent:    () => surf(T.wood(r.pick(['#7a5a34', '#8a6a3e'])), [W/2, D/2]),
  };
  const floorMat = (FLOORMAT[P.kind]
    || (() => surf(T.carpet(r.pick(['#4a4a52', '#3f4a44', '#544a44'])), [W/2, D/2])))();

  // ---- AND THE FLOOR HAS THE SAME HOLE IN IT ------------------------
  //
  // Liam: *"when the player goes up another floor from first to second
  // you don't see the floor but once you pass the floor its visible ...
  // the floor although the collider is gone is still visibly blocking the
  // stairs"*.
  //
  // Exactly that. The ceiling of a storey was four planes round a hole
  // and its slab COLLIDER was four boxes round the same hole, but the
  // floor you stand on was one plane across the whole plate - so storey
  // two's carpet was stretched over the opening you climb through. You
  // walked up into it, saw nothing but carpet, and the floor above
  // appeared only once your eye had passed the plane. From above, the
  // same plane covered the well.
  //
  // Four pieces round the hole, the same rectangles the other two use.
  // The UVs are set from world position over the whole plate rather than
  // 0..1 per piece, so the tiles stay the size they were and line up
  // across the seams instead of restarting at every cut.
  const plate = (x0, z0, x1, z1) => {
    if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
    const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI/2);
    g.translate((x0 + x1) / 2, 0, (z0 + z1) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++)
      uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0) + FW / 2) / FW,
                  (z0 + uv.getY(i) * (z1 - z0) + FD / 2) / FD);
    uv.needsUpdate = true;
    group.add(new THREE.Mesh(g, floorMat));
  };
  {
    const L = -FW/2, R = FW/2, Tp = -FD/2, B = FD/2;
    // NOBODY IS UNDERNEATH THE GROUND FLOOR - the same rule the slab
    // collider already uses. A hole in floor one is a pit, not a stairwell.
    if (P.floor <= 1) plate(L, Tp, R, B);
    else {
      plate(L, Tp, R, hz0);
      plate(L, hz1, R, B);
      plate(L, hz0, hx0, hz1);
      plate(hx1, hz0, R, hz1);
    }
  }
  // THE CEILING HAS A HOLE IN IT, over the stairs. One plane cannot have
  // a hole, so it is four planes round one - which is also the only way
  // the second flight can arrive anywhere, and it means you can stand at
  // the bottom of the stairwell and see daylight from the floor above.
  {
    // OVER THE WHOLE WELL. Not over the top landing: a stairwell is a
    // SHAFT, and it has to be, because the arithmetic does not work
    // otherwise. Nine treads lift you 1.71 m, a player is 1.78 m tall and
    // the slab is at 3.0 m - so under a ceiling he tops out at 1.19 m and
    // the first flight is unclimbable by 52 centimetres. The climb test
    // stalled at exactly 1.19 twice before this was obvious.
    //
    // hx0/hx1/hz0/hz1 are worked out once, further up, where the floor is
    // built - three things have to cut the same hole and they used to
    // agree by having the arithmetic written out twice.
    const ceilMat = surf(T.ceiling(), [W/2, D/2]);
    const slab = (x0, z0, x1, z1) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
      // ---- 15 MM BELOW THE SLAB, NOT ON IT -------------------------
      //
      // Liam: *"glitches with the roof"*, with a screenshot of the
      // ceiling tearing into itself in long diagonal bands.
      //
      // These planes were at exactly WALL_H, and so is the TOP FACE of
      // every wall box in the building - walls run 0 to WALL_H. Two
      // surfaces at identical depth is a coin toss per pixel per frame,
      // and 110 of 259 upward samples had a wall top and a ceiling tile
      // fighting over the same pixels.
      //
      // A suspended ceiling hangs below the structure anyway, which is
      // what makes this the right fix rather than a nudge: 15 mm is
      // enough to settle the depth test at this near/far ratio and is
      // exactly what a ceiling grid does in a real office.
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(Math.PI/2);
      g.translate((x0 + x1) / 2, CEIL_Y, (z0 + z1) / 2);
      // the texture must keep the same scale on every piece, or the grid
      // steps where two of them meet
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++)
        uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / 2, (z0 + uv.getY(i) * (z1 - z0)) / 2);
      uv.needsUpdate = true;
      group.add(new THREE.Mesh(g, ceilMat));
    };
    // ---- A LANDING PAD AT THE FOOT OF THE NEXT FLIGHT ---------------
    //
    // The hole used to be the whole well, and the well is where BOTH
    // flights are: the one arriving from below and the one leaving for
    // above. Those are side by side (see the dog-leg note further down),
    // so the near end of the well has the top of the incoming flight on
    // the DOWN side and the foot of the outgoing flight on the UP side -
    // and the foot needs something to stand on.
    //
    // Without this you climb onto the storey, walk two steps to start the
    // next flight, and drop through the floor back to where you came
    // from. The climb test read it as an endless 1-2-1-2, which looked
    // like a broken staircase and was actually a missing floor.
    //
    // It costs no headroom: a man standing at the foot of a flight is at
    // zero, and his head is 1.78 m under a slab at 3.0.
    hole = { x0: hx0, z0: hz0, x1: hx1, z1: hz1 };
    const L = -FW/2, R = FW/2, Tp = -FD/2, B = FD/2;
    slab(L, Tp, R, hz0);
    slab(L, hz1, R, B);
    slab(L, hz0, hx0, hz1);
    slab(hx1, hz0, R, hz1);

    // ---- AND THE SLAB IS SOLID ------------------------------------
    //
    // Liam: *"I meant in like a each level is physical ... its like a
    // physical building with levels"*. It is now: every storey exists at
    // its true height at the same time and the stairs simply take you
    // there, so this slab has to be something you can stand on and
    // something that stops your head - because it is BOTH. The floor you
    // walk on is the underside of the ceiling of the storey below.
    //
    // That deletes two hacks from player.js: a hard floor at y = 0 and a
    // hard ceiling at 2.97 with a special case cut in it for the
    // stairwell. There is no special case any more - the hole in the slab
    // is a hole in the collision because the four boxes go round it, in
    // exactly the same rectangles as the four ceiling planes above.
    //
    // 0.6 m thick, buried under the floor where nobody sees it: a thin
    // slab is a slab you fall through, because a man at terminal velocity
    // in a three-metre drop covers 0.4 m in a 50 ms frame.
    const SLAB_T = 0.6;
    const slabBox = (x0, z0, x1, z1) => {
      if (x1 - x0 < 0.05 || z1 - z0 < 0.05) return;
      solids.push({ x: (x0 + x1) / 2, y: -SLAB_T / 2, z: (z0 + z1) / 2,
                    w: x1 - x0, h: SLAB_T, d: z1 - z0, slab: true });
    };
    if (P.floor <= 1) {
      // NOBODY IS UNDERNEATH THE GROUND FLOOR, so it has no hole in it.
      // The hole exists to let you come UP through a slab; on floor one
      // it would just be a pit.
      slabBox(L, Tp, R, B);
    } else {
      slabBox(L, Tp, R, hz0);
      slabBox(L, hz1, R, B);
      slabBox(L, hz0, hx0, hz1);
      slabBox(hx1, hz0, R, hz1);
    }

    // and a lip round the hole, so it is a slab you have cut and not a gap
    const lip = [];
    const LT = 0.12;
    lip.push({ x: (hx0+hx1)/2, y: WALL_H - LT/2, z: hz0 - 0.06, w: hx1-hx0, h: LT, d: 0.12 });
    lip.push({ x: (hx0+hx1)/2, y: WALL_H - LT/2, z: hz1 + 0.06, w: hx1-hx0, h: LT, d: 0.12 });
    lip.push({ x: hx0 - 0.06, y: WALL_H - LT/2, z: (hz0+hz1)/2, w: 0.12, h: LT, d: hz1-hz0 });
    lip.push({ x: hx1 + 0.06, y: WALL_H - LT/2, z: (hz0+hz1)/2, w: 0.12, h: LT, d: hz1-hz0 });
    const lg2 = [];
    for (const b of lip) push(lg2, b);
    merge(lg2, surf(T.concrete('#7a766e'), [1, 1]), 'holelip');
  }

  // ---- FURNITURE ----------------------------------------------------
  //
  // Rooms are given a USE and then furnished for it, rather than sprayed
  // with random objects. A floor where one room is clearly a server room
  // and the next is clearly somebody's office is a floor you can navigate
  // by memory in a firefight, which is worth more than variety for its
  // own sake.
  const mats = propMaterials(T, surf);
  const bucket = {};
  const props = [];
  // EVERY PROP IS ITS OWN OBJECT, and that is a deliberate reversal.
  //
  // Liam: *"you can't select the objects you made like the computer the
  // chairs and the tables you made I can't move them which is an issue"*.
  //
  // He is right and the cause was here. This used to pour each prop's
  // parts straight into floor-wide buckets keyed by material, so the
  // whole floor's woodwork ended up as ONE mesh, all its metal as
  // another, and so on. Rendering-wise that is ideal - eight draw calls
  // for the furniture on a whole floor. But a merged mesh has no notion
  // of "this desk": clicking a desk in the editor selected the mesh
  // containing every wooden surface on the storey, and the arrow keys
  // then dragged all of it at once. The imported reference props were
  // selectable the whole time, which is exactly why the difference was
  // confusing - the ones that could not be moved were the ones we built.
  //
  // So a prop is now a Group holding one merged mesh PER MATERIAL IT
  // ACTUALLY USES. A desk touches four materials, so it is four draws
  // instead of contributing to four floor-wide ones. That is the real
  // cost and it is affordable here in a way it would not be in THWIP:
  // this game shows one floor at a time, the scene already carries ~700
  // meshes across the building, and the renderer culls all but the
  // storey you are on.
  //
  // The parts are still merged WITHIN the prop, so a chair is 3 meshes
  // and not 24.
  // Procedural name -> the reference model that does the same job
  // better. Liam: *"the quality of the current models and textures you
  // made are still bad"* - and he is right about every one of these:
  // a bin, a vending machine and a water cooler built out of boxes are
  // no match for the ones he sent, and a leather armchair is not
  // something worth approximating at all.
  // 'sofa: armchair' was here and is gone with the import it pointed at.
  const BETTER = { bin: 'bin', vending: 'vending', cooler: 'cooler' };

  const put = (name, x, z, ry, rr) => {
    // THE RANDOM DRAWS HAPPEN EITHER WAY, and that is deliberate.
    //
    // A floor is generated from a seed, so the SEQUENCE of draws is the
    // floor. Skipping the procedural builder when a reference model wins
    // would consume less randomness and re-roll every prop placed after
    // it - which moves things Liam has already positioned by hand. So the
    // builder still runs and its geometry is thrown away. It costs a few
    // hundred microseconds per floor and it keeps every floor, and every
    // saved edit, exactly where it was.
    // ---- EACH PROP GETS ITS OWN RANDOM STREAM ---------------------
    //
    // Liam: *"make sure when you update this stuff you don't undo the
    // changes I do to the map"*.
    //
    // A prop used to draw from the FLOOR's generator, so the number of
    // random calls inside a chair was part of the floor's layout. Improve
    // the plant - which needed doing, it was five boxes - and every prop
    // placed after it re-rolls, because the stream moved on by a
    // different amount. Five of his saved edits went with it, and that is
    // a trap that fires on every future change to any prop.
    //
    // So a prop's internals are seeded from WHERE IT IS. Same position,
    // same prop, same result, for ever - and how many numbers it draws
    // internally is now nobody else's business. The floor's own stream is
    // only used for the decisions the floor makes: which cell, which
    // prop, which way round.
    //
    // This costs one shuffle now, today, to buy immunity from every
    // shuffle after it.
    const made = PROPS[name](rr || rng(
      ((Math.round(x * 16) & 0xffff) * 73856093
        ^ (Math.round(z * 16) & 0xffff) * 19349663
        ^ name.length * 83492791 ^ P.floor * 2654435761) >>> 0));
    const swap = refReady() && BETTER[name] && refHull(BETTER[name]);
    if (swap) {
      // AND THE TWO UV-OFFSET DRAWS BELOW HAPPEN TOO.
      //
      // I wrote the note above about preserving the draw sequence and
      // then returned early past two r.range() calls one line later, and
      // tools/edits.mjs immediately reported five of Liam's edits
      // stranded - a cooler and a crate that had shuffled because a
      // random number was not taken. The rule is not "call the builder",
      // it is "take every draw the other branch takes".
      r.range(0, 64); r.range(0, 64);
      const g = refProp(BETTER[name], { ry });
      if (g) {
        g.position.set(x, 0, z);
        g.userData.propName = name;
        group.add(g);
        // THE HULL RIDES ON THE OBJECT. See syncProps() at the bottom
        // of this file: nothing pushes collision boxes any more, they are
        // derived from wherever each prop currently IS.
        g.userData.hull = refHull(BETTER[name]);
        g.userData.cover = made.cover;
        return;
      }
    }
    const byMat = {};
    for (const p of made.parts) {
      const g = p.geo.clone();
      if (ry) g.rotateY(ry);
      (byMat[p.mat] || (byMat[p.mat] = [])).push(g);
    }
    // ---- AND NO TWO OF THEM WEAR THE SAME SCRATCHES ----
    //
    // Liam: *"all with the same scratch marks each one needs to be unique
    // almost good but not perfect"*.
    //
    // tex.js's make() caches by key, which is correct - one 'metal#cfc7b0'
    // sheet shared by every beige surface in the building is what keeps
    // this affordable. But every CRT, every tower, every drawer front then
    // wore the SAME four diagonal scratches in the same places, and once
    // you have seen that you cannot unsee it: the room reads as one object
    // stamped out repeatedly.
    //
    // The sheets tile (RepeatWrapping), so sliding a prop's UVs by a
    // random offset shows a different part of the same sheet. Different
    // scratches, different chips, different grime, on every instance -
    // for no extra texture, no extra material and no extra draw call.
    // "Almost good but not perfect" is exactly what an offset gives you:
    // the same paint, wearing differently.
    const uo = r.range(0, 64), vo = r.range(0, 64);
    const grp = new THREE.Group();
    // Named so the editor's label() has something to say, and so `P` in
    // the editor prints a line you can actually act on.
    grp.name = name;
    grp.userData.propName = name;
    // NOT `editorContainer`. That flag means "stop climbing BELOW me", and
    // building.js already sets it on the floor's own group - so the
    // editor's walk-up climbs mesh -> prop group -> sees the floor group is
    // a container -> stops, and selects the prop. Setting it here as well
    // stops the climb one level too early and selects a single merged
    // material inside the prop, which drags a chair's castors off the
    // chair. The absence of this line is what makes selection work.
    for (const [mat, geos] of Object.entries(byMat)) {
      const m = mergeGeometries(geos);
      const uv = m.attributes.uv;
      if (uv) {
        // a different offset per MATERIAL as well as per prop, so a desk's
        // wood and its metal do not slide together and stay correlated
        const du = uo + mat.length * 7.3, dv = vo + mat.length * 3.1;
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) + du, uv.getY(i) + dv);
        uv.needsUpdate = true;
      }
      grp.add(new THREE.Mesh(m, mats[mat] || mats.metal));
    }
    grp.position.set(x, 0, z);
    group.add(grp);

    // ---- THE COLLIDER TURNS WITH THE MODEL ------------------------
    //
    // This used to decide rotation with `flip = |sin(ry)| > 0.5` - swap
    // width and depth, or do not. That is right for a quarter turn and
    // nonsense for anything else, and half the furnisher calls this with
    // `r.range(0, 6.283)`. So a desk turned 40 degrees was DRAWN at 40
    // degrees and COLLIDED as if it were square on, with its box centre
    // never moved at all: the offset parts of a prop - a drawer bank, a
    // chair's back - ended up somewhere the model is not.
    //
    // That is both halves of what Liam reported at once. Where the box
    // missed the model you walked through a desk; where it landed clear
    // of the model you were stopped by nothing.
    //
    // placeColliders() does the same job for the imported props and does
    // it properly - centres rotated exactly, extents taken as the rotated
    // box's own bounds - so this uses it too rather than keeping a second
    // half-right implementation.
    // ---- ITS COLLIDER COMES OFF ITS GEOMETRY -----------------------
    //
    // Not from `made.solid`, which is one hand-written box per prop kind
    // and was wrong for most of them. tools/probe.mjs put numbers on it:
    // of 322 rays that hit something with nothing to stop them, 78 were
    // the COMPUTER (its box covers the tower and not the monitor), 37 the
    // CHAIR and 24 the PLANT (whose leaves spread far wider and higher
    // than the 0.36 x 0.6 stub it declared). Every one of those is a hand
    // measurement that drifted from the model it describes, and there are
    // sixteen of them to keep in step by eye.
    //
    // So procedural props are voxelised exactly like the imported ones -
    // same collide.js, same result - and `solid` is now only a fallback
    // for anything that produces no geometry. It costs a couple of
    // milliseconds per prop at floor build and nothing at all per frame,
    // and it cannot drift, because it IS the model.
    //
    // The geometry inside `grp` is already turned by `ry` (put() rotates
    // the geometries themselves), so these are placed unrotated.
    // The geometry inside `grp` is already turned by `ry` (put() rotates
    // the geometries themselves), so the hull is stored unrotated and
    // syncProps applies whatever rotation the group ends up with.
    const hull = colliders(grp, { cell: 0.09 });
    grp.userData.hull = hull.length ? hull
      : placeColliders(made.solid, 0, 0, ry || 0, 0, made.cover);
    grp.userData.cover = made.cover;
  };
  // ---- CEILING FITTINGS STAY UNDER THE CEILING ---------------------
  //
  // Liam: *"lights are visible in the floor after the first floor"*.
  //
  // They were, and it is a stacked-building problem that could not exist
  // before: a light fixture hung at WALL_H - 0.06 with a part of it
  // reaching 4 cm higher is 4 cm ABOVE the carpet of the storey above,
  // and you stand on floor two looking at floor one's light fittings
  // poking out of the floor. Measured: fixed:metal reached 3.040 and
  // fixed:chrome 3.280, against a slab at 3.000.
  //
  // Rather than re-tune every hanging height by hand and get it wrong
  // again the next time something is added, everything that goes on a
  // ceiling is checked here and pushed down if it breaks the plane. One
  // guard, and it covers whatever gets hung up there in future.
  const raw = (parts, x, y, z, ry) => {
    // ---- CLAMPED AS ONE OBJECT, NOT PART BY PART -------------------
    //
    // The first version measured and shifted each part on its own, which
    // pulls a fitting apart: an air grille is a plate with slats 12 mm
    // under it, and if the plate overshoots the ceiling by 20 mm and the
    // slats by 8, they get different corrections and end up in the same
    // plane - two coplanar surfaces fighting, which is exactly what
    // tools showed as "fixed:metal vs fixed:dark". One shift for the
    // whole fitting keeps it assembled.
    const made = [];
    let over = 0;
    for (const p of parts) {
      const g = p.geo.clone();
      if (ry) g.rotateY(ry);
      g.translate(x, y, z);
      g.computeBoundingBox();
      over = Math.max(over, g.boundingBox.max.y - CEIL);
      made.push([p.mat, g]);
    }
    for (const [mat, g] of made) {
      if (over > 0) g.translate(0, -over, 0);
      (bucket[mat] || (bucket[mat] = [])).push(g);
    }
  };
  // NOTHING WHERE YOU ARRIVE. The player spawns in the middle of a room
  // and the furnisher was quite happy to put a bookshelf in the same
  // square metre - so the first thing the third-person camera showed was
  // a man standing inside a bookcase.
  const free = (cx, cz) =>
    P.at(cx, cz) === 0 && Math.abs(cx - P.spawn.x) + Math.abs(cz - P.spawn.z) > 2;
  const wpos = (cx, cz) => [(cx - W/2 + 0.5) * CELL, (cz - D/2 + 0.5) * CELL];

  // ---- FURNITURE, WHICH BUILD MODE DOES NOT WANT -------------------
  //
  // Liam: *"empty out all the levels of enemies and tables and screens so
  // I can just make the levels from scratch"*. Everything from here to
  // the end of the furnisher is skipped in build mode; the shell, the
  // doors, the glass, the lights and the staircase are not, because
  // without those there is nothing to build IN.
  for (const rm of GEN.props ? P.rooms : []) {
    const rw = rm.x1 - rm.x0, rh = rm.z1 - rm.z0;
    if (rw < 2 || rh < 2) continue;
    const area = rw * rh;
    const use = area > 40 ? r.pick(['openplan', 'openplan', 'meeting'])
              : area > 18 ? r.pick(['office', 'openplan', 'break', 'storage'])
                          : r.pick(['office', 'server', 'storage']);

    // which way the room faces: toward its longest wall
    const ry = rw >= rh ? 0 : Math.PI / 2;

    if (use === 'openplan') {
      // rows of desks back to back with a partition down the middle -
      // the arrangement that makes a cubicle farm a cubicle farm
      for (let z = rm.z0 + 1; z <= rm.z1 - 1; z += 3) {
        for (let x = rm.x0 + 1; x <= rm.x1 - 1; x += 3) {
          if (!free(x, z)) continue;
          const [wx, wz] = wpos(x, z);
          const face = r.chance(0.5) ? 0 : Math.PI;
          put('desk', wx, wz, face);
          if (r.chance(0.85)) put('computer', wx, wz, face);
          if (r.chance(0.7)) put('chair', wx + Math.sin(face) * 0.0, wz + (face ? -0.85 : 0.85), face);
          if (r.chance(0.45) && free(x, z + 1)) {
            const [px, pz] = wpos(x, z + 1);
            put('partition', px, pz + 0.5, 0);
          }
        }
      }
    } else if (use === 'office') {
      const [cx, cz] = wpos((rm.x0 + rm.x1) >> 1, (rm.z0 + rm.z1) >> 1);
      put('desk', cx, cz, ry);
      put('computer', cx, cz, ry);
      put('chair', cx + Math.cos(ry) * 0.0, cz + 0.9, ry);
      if (r.chance(0.7)) put('cabinet', cx + (rw > rh ? 1.6 : 0), cz + (rw > rh ? 0 : 1.6), ry);
      if (r.chance(0.5)) put('shelf', cx - 1.4, cz - 0.8, ry);
      if (r.chance(0.4)) put('plant', cx + 1.2, cz - 1.2, 0);
      // A CORNER OF THE ROOM THAT IS NOT A DESK. A private office with
      // nothing but a desk in it reads as a cubicle with walls.
      if (r.chance(0.35)) put('armchair', cx - 1.5, cz + 1.4, ry + r.range(-0.6, 0.6));
      if (r.chance(0.30)) put('lamp', cx + 1.7, cz + 1.5, 0);
      if (r.chance(0.25)) put('coffeetable', cx - 1.5, cz + 0.4, ry);
    } else if (use === 'meeting') {
      const [cx, cz] = wpos((rm.x0 + rm.x1) >> 1, (rm.z0 + rm.z1) >> 1);
      // a long table is three desks pushed together, which is also what
      // it is in real life
      for (let i = -1; i <= 1; i++)
        put('desk', cx + (ry ? 0 : i * 1.7), cz + (ry ? i * 1.7 : 0), ry);
      for (let i = -2; i <= 2; i++) {
        if (!i) continue;
        put('chair', cx + (ry ? 1.2 : i * 0.8), cz + (ry ? i * 0.8 : 1.2), ry);
        put('chair', cx + (ry ? -1.2 : i * 0.8), cz + (ry ? i * 0.8 : -1.2), ry + Math.PI);
      }
      put('board', cx + (ry ? 2.4 : 0), cz + (ry ? 0 : 2.4), ry);
    } else if (use === 'server') {
      for (let x = rm.x0 + 1; x <= rm.x1 - 1; x += 2) {
        if (!free(x, rm.z0 + 1)) continue;
        const [wx, wz] = wpos(x, rm.z0 + 1);
        put('rack', wx, wz, 0);
      }
    } else if (use === 'break') {
      // A BREAK ROOM WITH A KITCHEN IN IT.
      //
      // Liam: *"add way more objects"*. This had a sofa, a vending
      // machine, a cooler, a plant and a bin - five things, and four of
      // them were against the same wall. A break room is the one place in
      // an office with actual appliances in it, and every one of them is
      // cover you can fight behind.
      const [cx, cz] = wpos((rm.x0 + rm.x1) >> 1, (rm.z0 + rm.z1) >> 1);
      put('sofa', cx, cz, ry);
      put('coffeetable', cx, cz + 1.1, ry);
      if (r.chance(0.7)) put('armchair', cx - 1.5, cz + 0.9, ry + 0.7);
      put('vending', cx - 1.8, cz - 1.2, ry);
      put('cooler', cx + 1.8, cz - 1.2, 0);
      if (r.chance(0.8)) put('fridge', cx + 2.4, cz + 0.6, ry);
      if (r.chance(0.6)) put('microwave', cx + 2.4, cz + 1.5, ry);
      if (r.chance(0.5)) put('tv', cx - 2.3, cz - 0.2, ry + Math.PI / 2);
      if (r.chance(0.4)) put('lamp', cx + 1.4, cz + 1.9, 0);
      put('plant', cx + 1.6, cz + 1.4, 0);
      put('bin', cx - 1.2, cz + 1.3, 0);
    } else {
      for (let i = 0; i < Math.min(6, Math.round(area / 6)); i++) {
        const x = Math.round(r.range(rm.x0 + 1, rm.x1 - 1));
        const z = Math.round(r.range(rm.z0 + 1, rm.z1 - 1));
        if (!free(x, z)) continue;
        const [wx, wz] = wpos(x, z);
        put(r.pick(['cabinet', 'shelf', 'copier', 'cabinet']), wx, wz, r.chance(0.5) ? 0 : Math.PI/2);
      }
    }
  }


  // ---- THE STAIRWELL ------------------------------------------------
  //
  // Liam: *"more red brick stair wells and stuff adding strategy and stuff
  // to going up"*.
  //
  // The stairs used to be a marker on the floor you stood near. Building
  // them properly does two things at once. It looks like the inside of a
  // real building - bare treads, a steel handrail, a half-landing, brick
  // on every side - and it changes the fight, because a flight of stairs
  // is the one place on the floor where somebody ABOVE you has the angle
  // and you cannot back off without losing the ground you paid for. That
  // is the strategy: the stairwell is the fastest way up and the worst
  // place to be caught.
  {
    const S = P.stair;
    const [sx0, sz0] = wpos(S.x, S.z);
    // EXACTLY ONE STOREY, in sixteen treads. It used to be 9 + 9 at 0.19 =
    // 3.42 m, which is not a floor height, so the top of the stairs was
    // half a metre above the slab it was supposed to arrive at and the
    // transition could only ever be a teleport. Sixteen treads of
    // WALL_H/16 land you on the next floor's level, exactly.
    const treadN = 8, rise = WALL_H / 16, run = 0.30, TW = 1.60;
    const stepG = [], railG = [];
    const flight = (x0, z0, dirZ, y0) => {
      for (let i = 0; i < treadN; i++) {
        const y = y0 + i * rise;
        const z = z0 + dirZ * (i * run);
        const g = new THREE.BoxGeometry(TW, rise + 0.02, run);
        g.translate(x0, y + rise/2, z);
        stepG.push(g);
        solids.push({ x: x0, y: y + rise/2, z, w: TW, h: rise + 0.02, d: run });
        // the nosing: one strip of a different value along the front edge,
        // which is what stops a stair reading as a ramp
        const n = new THREE.BoxGeometry(TW, 0.03, 0.05);
        n.translate(x0, y + rise, z + dirZ * run * 0.5);
        railG.push(n);
      }
      // the handrail beside it
      for (const s of [-1, 1]) {
        const len = treadN * run;
        const g = new THREE.BoxGeometry(0.05, 0.05, len);
        g.translate(x0 + s * (TW / 2 + 0.03), y0 + treadN * rise * 0.5 + 0.95,
                    z0 + dirZ * len * 0.5);
        railG.push(g);
        for (let i = 0; i < treadN; i += 3) {
          const p2 = new THREE.BoxGeometry(0.035, 0.95, 0.035);
          p2.translate(x0 + s * (TW / 2 + 0.03), y0 + i * rise + 0.48, z0 + dirZ * i * run);
          railG.push(p2);
        }
      }
    };
    // ---- AND IT GOES ALL THE WAY UP ----------------------------------
    //
    // Liam: *"make the stair wells a physical thing"*.
    //
    // It was half a physical thing: nine real treads with real collision
    // that climbed to a half-landing at 1.71 m and stopped, under a solid
    // ceiling, with the actual way up being an invisible trigger on the
    // floor at the bottom. So you could climb the stairs, and climbing
    // them achieved nothing, and standing next to them achieved
    // everything - which is the worst of both.
    //
    // Now: a flight up, a landing, a flight BACK the other way, and a
    // hole in the slab it comes out through. The trigger moves to the top
    // and asks for your height, so the only way off this floor by the
    // stairs is to be at the top of them. That is what makes the stairwell
    // dangerous ground rather than a doorway - somebody above you on that
    // second flight has the angle and you have nowhere to go.
    // ---- LAID OUT INSIDE THE WELL, WITH ROOM TO STAND AT THE BOTTOM --
    //
    // The first version started the flight 1.2 m BEFORE the stair box, so
    // the first tread was thirty centimetres from the inner face of the
    // core wall - and there was nowhere at all to stand in front of it.
    // Walking at the stairs simply pressed you into brick, which the
    // climb test caught immediately: five and a half seconds of holding
    // forward and zero metres of height gained.
    //
    // So everything below is measured from the near edge of the well and
    // fits inside it: a landing you arrive on, up, a half-landing, back,
    // and out through the slab.
    // THE TWO FLIGHTS GO SIDE BY SIDE, not one above the other.
    //
    // Stacking them is the obvious way to draw a dog-leg stair and it does
    // not work at these dimensions: nine treads only lift you 1.71 m, so
    // the underside of the upper flight is 1.83 m off the lower one, and a
    // 1.78 m player's head hits it at the fifth tread. The climb test read
    // exactly that - up to 0.96 m and then flat for five seconds.
    //
    // A real dog-leg puts the flights beside each other with the landing
    // spanning both, and there is then no headroom problem at all because
    // there is nothing above either flight.
    const ENTER = 0.9;                      // standing room at the foot
    const z0 = sz0 - 0.5;                   // the near edge of the well
    const cx = sx0 + (S.w - 1) / 2;         // the centre of the well
    const xUp = cx - 0.86, xDn = cx + 0.86; // the two flights
    const f1 = z0 + ENTER;
    flight(xUp, f1, 1, 0);
    const landY = treadN * rise;
    const landZ = f1 + treadN * run + 0.75;
    const lg = new THREE.BoxGeometry(TW * 2 + 0.4, 0.12, 1.6);
    lg.translate(cx, landY + 0.06, landZ);
    stepG.push(lg);
    solids.push({ x: cx, y: landY - 0.06, z: landZ, w: TW * 2 + 0.4, h: 0.12, d: 1.6 });
    // the second flight, doubling back up the other half, through the slab
    const f2 = landZ - 0.75;
    flight(xDn, f2, -1, landY);
    const topY = landY + treadN * rise;      // = WALL_H, the next floor
    const topZ = f2 - treadN * run - 0.8;
    const tg = new THREE.BoxGeometry(TW + 0.3, 0.12, 1.7);
    tg.translate(xDn, topY - 0.06, topZ);
    stepG.push(tg);

    // ---- AND THE WELL HAS A FLOOR ---------------------------------
    //
    // Liam: *"fix the flooring in the stair well"*.
    //
    // It had none. The slab is cut away over the whole well so a climber
    // can get his head through it, and on every storey above the first
    // that left a four-by-six-metre hole with two flights of stairs
    // hanging in it. Measured: 108 of 108 sample points in the well had
    // nothing under them. Step off the treads and you fall to the lobby.
    //
    // The opening only has to exist where somebody's HEAD comes through
    // it, and that is over the flights and the half-landing - not over
    // the whole rectangle. So everything else gets floored: the strips
    // either side of the flights, the far end past the landing, and the
    // near end on the UP side, where a climber is still at ankle height
    // and needs no headroom at all.
    //
    // The near end on the DOWN side stays open, because that is where the
    // flight from below arrives. This is the L-shaped hole a real
    // stairwell has, and getting it wrong in the other direction is what
    // put a ceiling over the last four treads two rounds ago.
    if (P.floor > 1 && hole) {
      const PT = 0.16;
      const plate = (x0, z0, x1, z1) => {
        if (x1 - x0 < 0.10 || z1 - z0 < 0.10) return;
        const g = new THREE.BoxGeometry(x1 - x0, PT, z1 - z0);
        g.translate((x0 + x1) / 2, -PT / 2, (z0 + z1) / 2);
        stepG.push(g);
        solids.push({ x: (x0 + x1) / 2, y: -PT / 2, z: (z0 + z1) / 2,
                      w: x1 - x0, h: PT, d: z1 - z0, slab: true });
      };
      const M = 0.06;
      const upL = xUp - TW / 2 - M, upR = xUp + TW / 2 + M;
      const dnL = xDn - TW / 2 - M, dnR = xDn + TW / 2 + M;
      plate(hole.x0, hole.z0, upL, hole.z1);          // outboard of the up flight
      plate(dnR, hole.z0, hole.x1, hole.z1);          // outboard of the down flight
      plate(upR, hole.z0, dnL, hole.z1);              // between them, if there is a gap
      plate(upL, landZ + 0.85, dnR, hole.z1);         // past the half landing
      plate(upL, hole.z0, upR, f1 - 0.12);            // the foot of the next flight
      // NO PLATE OVER THE UP FLIGHT, and I tried twice.
      //
      // On paper there is room: that plate is the ceiling of the storey
      // below, and a climber on the lower half of the flight is still low
      // enough to pass under it. In practice a 3 m storey does not have
      // the clearance - a step UP is collision-checked at the height you
      // are stepping TO while your feet are still under the plate, so the
      // margin has to cover a whole tread and there is not one to spare.
      // Both attempts stopped the climb dead at 0.95 m.
      //
      // It is no loss. The only thing that plate would have floored is
      // the space directly above the flight, and the flight is already
      // what you stand on there.

    }
    // ---- THE TOP LANDING SPANS BOTH FLIGHTS -----------------------
    //
    // It used to be the width of the arriving flight only, and the well
    // is wide enough for two. So you climbed onto the storey, took two
    // steps sideways to start the next flight, and dropped straight back
    // through the hole in the slab that you had just come up through. The
    // climb test read it as an endless 1-2-1-2.
    //
    // The obvious repair - a pad of SLAB under the foot of the next
    // flight - is wrong, and wrong in an instructive way: that pad is
    // also the CEILING over the flight below, and it stopped the climb
    // dead at 0.57 m with the player's head against it. A landing works
    // where a slab does not because it is 12 cm thick instead of 60, and
    // 12 cm is inside the headroom the flight underneath already has.
    solids.push({ x: cx, y: topY - 0.06, z: topZ, w: TW * 2 + 0.4, h: 0.12, d: 1.7 });
    // The half-landing is published too, because anything that has to
    // NAVIGATE this - the climb test today, an NPC that chases you up it
    // tomorrow - needs the turn, not just the two ends.
    stairTop = { x: xDn, y: topY, z: topZ,
                 // CLEAR OF THE FIRST TREAD, by more than the player's
                 // radius. This was z0 + 0.45, which put him two
                 // centimetres inside it - close enough that a change
                 // anywhere in the geometry flipped it either way.
                 foot: { x: xUp, z: z0 + 0.18 },
                 mid: { x: cx, y: landY, z: landZ },
                 up: { x: xUp }, down: { x: xDn } };

    // ---- AND IT COMES UP INTO A SHAFT --------------------------------
    //
    // The first version of the second flight climbed through the hole and
    // arrived at 3.5 m, above the ceiling of the only floor that exists -
    // so the top of the stairs looked out over the tops of the walls into
    // nothing, which is worse than the stairs not working at all.
    //
    // A tower has a stairwell that goes ALL the way, so build the next
    // four metres of it: brick on four sides, a flight disappearing
    // upward, and a cap you never quite see. It costs a dozen boxes and it
    // turns the top of the stairs from a hole in the world into the moment
    // you can see how far up this building goes.
    if (hole) {
      const shaftG = [], upG = [];
      const TOP = WALL_H + 4.2, TH = 0.5;
      const sh = (x, y, z, w, h, d) => push(shaftG, { x, y, z, w, h, d });
      const w0 = hole.x1 - hole.x0 + TH * 2, d0 = hole.z1 - hole.z0 + TH * 2;
      const mxh = (hole.x0 + hole.x1) / 2, mzh = (hole.z0 + hole.z1) / 2;
      // ---- THE WELL ENCLOSURE, AND IT IS SOLID --------------------
      //
      // Liam: *"the player can phase through walls"* at the staircase.
      // He was right and this was it. These four walls stand from the
      // ceiling of THIS floor up past the one above - they are what you
      // see round the opening when you look up the well - and not one of
      // them had a collider. So on the floor above they were four brick
      // walls round the stair opening that you walked straight through,
      // and while climbing the second flight your head passed through
      // them from the inside.
      //
      // They are also the parapet that stops you falling into the hole,
      // which is the other half of why they have to be there.
      const solidShaft = (x, y, z, w, h, d) => {
        sh(x, y, z, w, h, d);
        solids.push({ x, y, z, w, h, d });
      };
      const midY = (WALL_H + TOP) / 2, hgt = TOP - WALL_H;

      // ---- AND A WAY OUT OF IT ------------------------------------
      //
      // Liam: *"make exits for the stair well"*. There was no doorway at
      // all - the enclosure was a closed box, and the only reason the
      // floor stayed connected was that the walls were not solid. Making
      // them solid without cutting a door would have sealed the stairs
      // off completely.
      //
      // It goes in the NEAR wall, on the side the arriving flight comes
      // up: you climb out of the well and step straight through it onto
      // the floor, rather than walking round the opening to find a gap.
      // WIDE, AND CENTRED ON THE WELL - not on the arriving flight.
      //
      // Centred on xDn it looked right and wedged the player: the FOOT of
      // the next flight is at xUp, 18 cm from the near wall, and a player
      // with a 32 cm radius was standing inside the solid half of it. He
      // reached floor two and could not take a step. The opening has to
      // clear both flights, because you arrive on one and leave on the
      // other.
      const DW = 2.6, DH = DOOR_H;
      const dcx = mxh;
      const zNear = hole.z0 - TH / 2;
      const leftW = (dcx - DW / 2) - (mxh - w0 / 2);
      const rightW = (mxh + w0 / 2) - (dcx + DW / 2);
      if (leftW > 0.05)
        solidShaft(mxh - w0 / 2 + leftW / 2, midY, zNear, leftW, hgt, TH);
      if (rightW > 0.05)
        solidShaft(mxh + w0 / 2 - rightW / 2, midY, zNear, rightW, hgt, TH);
      // the head above the opening
      solidShaft(dcx, WALL_H + DH + (hgt - DH) / 2, zNear, DW, hgt - DH, TH);

      solidShaft(mxh, midY, hole.z1 + TH / 2, w0, hgt, TH);
      solidShaft(hole.x0 - TH / 2, midY, mzh, TH, hgt, d0);
      solidShaft(hole.x1 + TH / 2, midY, mzh, TH, hgt, d0);
      merge(shaftG, surf(T.brick(), [1.15, 3.2]), 'shaft');
      // the flight going on up, seen from below and never reached
      for (let i = 0; i < 7; i++) {
        const g = new THREE.BoxGeometry(TW, rise + 0.02, run);
        g.translate(xUp, topY + 0.1 + i * rise, topZ + 0.9 + i * run);
        upG.push(g);
      }
      const cap = new THREE.BoxGeometry(w0, 0.3, d0);
      cap.translate(mxh, TOP + 0.15, mzh);
      upG.push(cap);
      merge(upG, surf(T.concrete('#6e6a63'), [1, 1]), 'landings');
    }

    merge(stepG, surf(T.concrete('#8a867e'), [1, 1]), 'treads');
    merge(railG, surf(T.metal('#6a6f76'), [1, 1]), 'handrails');
  }

  // ---- RADIATORS UNDER THE WINDOWS ---------------------------------
  //
  // Every one of these buildings has them and none of them was here. They
  // go on the glazed perimeter, which is also the one wall the furnisher
  // never touched - so this fills a band of the floor that was empty on
  // every storey.
  for (let i = 0; GEN.props && i < 22; i++) {
    const onX = r.chance(0.5);
    const cx = onX ? Math.round(r.range(3, W - 4)) : (r.chance(0.5) ? 1 : W - 2);
    const cz = onX ? (r.chance(0.5) ? 1 : D - 2) : Math.round(r.range(3, D - 4));
    if (!free(cx, cz)) continue;
    const [wx, wz] = wpos(cx, cz);
    put('radiator', wx, wz, onX ? 0 : Math.PI / 2);
  }
  // and a bank of lockers somewhere on the core wall
  for (let i = 0, put2 = 0; GEN.props && i < 20 && put2 < 2; i++) {
    const onX = r.chance(0.5);
    const cx = onX ? Math.round(r.range(P.core.cx0, P.core.cx1)) : (r.chance(0.5) ? P.core.cx0 - 1 : P.core.cx1 + 1);
    const cz = onX ? (r.chance(0.5) ? P.core.cz0 - 1 : P.core.cz1 + 1) : Math.round(r.range(P.core.cz0, P.core.cz1));
    if (!free(cx, cz)) continue;
    const [wx, wz] = wpos(cx, cz);
    put('lockers', wx, wz, onX ? 0 : Math.PI / 2);
    put2++;
  }

  // ---- the ring corridor gets what a corridor gets ------------------
  //
  // A SECOND furnisher, and I missed it the first time I emptied the
  // building: the room loop above was gated and this was not, so a
  // "blank" floor still came with eight vending machines and six plants
  // down the corridor.
  const C = P.core;
  for (let i = 0; GEN.props && i < 26; i++) {
    const onX = r.chance(0.5);
    const cx = onX ? Math.round(r.range(C.cx0 - 2, C.cx1 + 2)) : (r.chance(0.5) ? C.cx0 - 2 : C.cx1 + 2);
    const cz = onX ? (r.chance(0.5) ? C.cz0 - 2 : C.cz1 + 2) : Math.round(r.range(C.cz0 - 2, C.cz1 + 2));
    if (!free(cx, cz)) continue;
    const [wx, wz] = wpos(cx, cz);
    put(r.pick(['cooler', 'plant', 'bin', 'vending', 'copier', 'plant', 'bin']), wx, wz,
        r.chance(0.5) ? 0 : Math.PI);
  }

  // =====================================================================
  // AND LIAM'S REFERENCE PROPS, WHICH ARE THE BEST THINGS ON THE FLOOR
  // =====================================================================
  //
  // *"these are good quality exactly how everything should look assets so
  // use these"*. They are, and the vending machine in particular is worth
  // more to a corridor than anything this project has built procedurally -
  // it has a printed front with rows of actual product on it, which is a
  // level of painted detail that only makes sense to author once and
  // reuse, and is exactly what a real asset is FOR.
  //
  // They are placed by ROOM USE, not sprayed: an air-conditioning unit
  // belongs in a server room, a pallet and a cone belong on a floor the
  // builders left, a vending machine belongs on the corridor. A prop in
  // the wrong room is worse than an empty room, because it stops the
  // floor meaning anything.
  if (refReady() && GEN.props) {
    const drop = (name, wx, wz, ry, solid) => {
      const g = refProp(name, { ry });
      if (!g) return false;
      g.position.set(wx, 0, wz);
      group.add(g);
      const sz = refSize(name);
      if (solid !== false && sz) {
        const cover = sz.y > 1.1 ? 1 : 0.6;
        const hull = refHull(name);
        // ITS REAL SHAPE, carried on the object rather than pushed into
        // a list - so it follows the object when anything moves it.
        g.userData.hull = (hull && hull.length) ? hull
          : [{ x: 0, y: sz.y / 2, z: 0, w: sz.x, h: sz.y, d: sz.z }];
        g.userData.cover = cover;
      }
      return true;
    };

    // the corridor: vending machines and a bin by them
    let placedVend = 0;
    for (let i = 0; i < 40 && placedVend < 3; i++) {
      const onX = r.chance(0.5);
      const cx = onX ? Math.round(r.range(C.cx0 - 1, C.cx1 + 1)) : (r.chance(0.5) ? C.cx0 - 1 : C.cx1 + 1);
      const cz = onX ? (r.chance(0.5) ? C.cz0 - 1 : C.cz1 + 1) : Math.round(r.range(C.cz0 - 1, C.cz1 + 1));
      if (!free(cx, cz)) continue;
      const [wx, wz] = wpos(cx, cz);
      const ry = r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
      if (drop('vending', wx, wz, ry)) {
        placedVend++;
        const [bx, bz] = wpos(cx + (onX ? 1 : 0), cz + (onX ? 0 : 1));
        if (free(cx + (onX ? 1 : 0), cz + (onX ? 0 : 1))) drop('bin', bx, bz, 0);
      }
    }

    // A WATER COOLER ON THE CORRIDOR.
    //
    // This slot used to hold 'printer', which was never a printer - it is
    // the pack's DESK, and it stood here on its end. The office pack does
    // contain the right object for a corridor and I had simply never
    // looked at it: WaterCooler1Mtl, mesh 12, unused until now.
    for (let i = 0, put = 0; i < 30 && put < 2; i++) {
      const onX = r.chance(0.5);
      const cx = onX ? Math.round(r.range(C.cx0 - 1, C.cx1 + 1)) : (r.chance(0.5) ? C.cx0 - 1 : C.cx1 + 1);
      const cz = onX ? (r.chance(0.5) ? C.cz0 - 1 : C.cz1 + 1) : Math.round(r.range(C.cz0 - 1, C.cz1 + 1));
      if (!free(cx, cz)) continue;
      const [wx, wz] = wpos(cx, cz);
      if (drop('cooler', wx, wz, r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]))) put++;
    }

    // a payphone or two on the corridor, which is the most 2000s object
    // in the whole pack and belongs exactly there
    for (let i = 0; i < 24; i++) {
      const onX = r.chance(0.5);
      const cx = onX ? Math.round(r.range(C.cx0 - 1, C.cx1 + 1)) : (r.chance(0.5) ? C.cx0 - 1 : C.cx1 + 1);
      const cz = onX ? (r.chance(0.5) ? C.cz0 - 1 : C.cz1 + 1) : Math.round(r.range(C.cz0 - 1, C.cz1 + 1));
      if (!free(cx, cz)) continue;
      const [wx, wz] = wpos(cx, cz);
      if (drop('payphone', wx, wz, r.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]))) break;
    }

    // and whatever the floor's kind calls for
    const BYKIND = {
      // 'binSpill' is mesh 8 - a bin knocked over with its contents out.
      // On a gutted floor lying down IS its correct pose, which is the
      // only place it can be used honestly.
      gutted: ['pallet', 'plywood', 'cone', 'conduit', 'binbag', 'crate', 'tarp', 'binSpill',
               'pallet', 'plywood', 'cone', 'skipRust', 'junkpile', 'mattress'],
      apart:  ['bin', 'binbag', 'crate', 'bench', 'bin', 'mattress', 'table', 'laundry'],
      // THE OFFICE PACK'S 'desk' AND 'chair' ARE NOT A DESK AND A CHAIR.
      //
      // Photographed one primitive at a time (see the long note in
      // refprops.js): mesh 6 is a whole L-shaped workstation CLUSTER with
      // a printer and a shelf tower on it, and mesh 0 is a seat pad and a
      // back pad with no frame, no legs and no base - two floating
      // cushions. Both were being placed as single pieces of furniture,
      // and the desk was being squashed from a 7 m run into 2.9 m by a
      // fit() on the wrong axis.
      //
      // So neither is in these pools any more. The procedural desk and
      // chair in props.js are honest about what they are, and since
      // put() gives every one of them its own selectable Group they are
      // also the ones Liam can actually move.
      //
      // 'cabinets' (mesh 11, two tall vending-style units) and 'cooler'
      // are real objects and stay.
      trading:['cabinets', 'crate', 'aircon', 'binbag', 'table', 'cooler', 'bin'],
      office: ['cabinets', 'bench', 'table', 'books', 'cooler', 'crate', 'bin'],
      cellular: ['binbag', 'crate', 'table', 'books', 'cooler', 'cabinets', 'bin'],
      // ---- the upper tower --------------------------------------------
      // The plant floor is the gutted pool without the abandonment: the
      // same conduit, pallets and air handling, but it is all in service.
      // It gets as many pieces as a gutted floor because the machines ARE
      // the cover up there - take them out and it is an empty slab.
      mech:   ['aircon', 'conduit', 'crate', 'pallet', 'cone', 'cabinets', 'aircon',
               'conduit', 'plywood', 'tarp', 'cooler', 'aircon'],
      // The sky lobby is a public room. It is nearly empty on purpose -
      // that is the whole point of the archetype - so it gets seating,
      // planting and nothing to hide behind in the middle.
      sky:    ['bench', 'seatpad', 'bench', 'cooler', 'bin', 'artA', 'payphone'],
      // Executive and penthouse floors are furnished, not cluttered.
      exec:   ['bench', 'books', 'table', 'artA', 'cabinets', 'clock', 'books'],
      pent:   ['bench', 'table', 'artB', 'books', 'mattress', 'seatpad', 'laundry'],
    };
    const pool = BYKIND[P.kind] || BYKIND.office;
    const n = P.kind === 'gutted' ? 16
            : P.kind === 'mech'   ? 16          // the machines are the cover
            : P.kind === 'sky'    ? 5           // crossed in the open
            : 8;
    for (let i = 0; i < n * 4 && i < 90; i++) {
      const rm = r.pick(P.rooms);
      if (!rm) break;
      const cx = Math.round(r.range(rm.x0 + 1, rm.x1 - 1));
      const cz = Math.round(r.range(rm.z0 + 1, rm.z1 - 1));
      if (!free(cx, cz)) continue;
      const [wx, wz] = wpos(cx, cz);
      drop(r.pick(pool), wx, wz, r.range(0, 6.283));
    }
    // a server room gets its condenser, wherever one is
    for (const rm of P.rooms) {
      if (rm.use !== 'server') continue;
      const cx = Math.round((rm.x0 + rm.x1) / 2), cz = rm.z0 + 1;
      if (!free(cx, cz)) continue;
      const [wx, wz] = wpos(cx, cz);
      drop('aircon', wx, wz, 0);
    }

    // ---- AND WHAT GOES ON A DESK AND ON A WALL ----------------------
    //
    // The office pack's small things are what makes a room look OCCUPIED
    // rather than furnished: a monitor and a stack of books on a desk, a
    // framed print and a clock on the wall. They are the difference
    // between a room somebody works in and a room with a table in it.
    //
    // Desk things sit ON the existing desks, which the furnisher already
    // recorded as solids - so this reads the props list rather than
    // guessing at where a desk top is.
    const desks = GEN.clutter
      ? props.filter((p) => p.h > 0.6 && p.h < 0.95 && p.w > 0.9 && p.d > 0.5) : [];
    for (const d of desks) {
      if (!r.chance(0.55)) continue;
      // DESK THINGS ONLY.
      //
      // AND THESE ARE THINGS THAT GO ON A DESK.
      //
      // The list used to be ['monitor', 'monitor', 'books', 'openbook',
      // 'clock'] and three of those five names were wrong about what they
      // were pointing at: 'monitor' is the pack's waste bin and 'clock'
      // is a wall clock. So every other desk in the building had a bin
      // balanced on it, lying on its side.
      // ...and 'pctower' was the fourth mislabelling: mesh 9 is a VCR or
      // disc player, not a PC tower. It is a perfectly good thing to have
      // on a 2000s desk, so it stays - under its real name.
      const which = r.pick(['vcr', 'books', 'deskmat', 'books', 'vcr']);
      // ONE DRAW FROM THE RANDOM STREAM, USED TWICE.
      //
      // The first version of this took a fresh r.range() for the collider
      // as well as the model. A floor is generated from a seed, so the
      // sequence of draws IS the floor: taking one extra shifts every
      // subsequent draw and re-rolls every prop placed after this line.
      // tools/edits.mjs caught it immediately - one of Liam's saved edits
      // pointed at a video deck that had moved 40 cm because of an extra
      // call to a random number generator three hundred lines earlier.
      //
      // ADDING A DRAW IS A BREAKING CHANGE TO EVERY FLOOR. If a new draw
      // is genuinely needed, it goes at the END of the generator.
      const dry = r.range(0, 6.283);
      const g = refProp(which, { ry: dry });
      if (!g) continue;
      const dx2 = d.x + r.range(-0.25, 0.25), dz2 = d.z + r.range(-0.15, 0.15);
      const dy2 = d.y + d.h / 2;
      g.position.set(dx2, dy2, dz2);
      group.add(g);
      // ---- AND IT IS SOLID ------------------------------------------
      //
      // Liam: *"some things the player can phase through"*. These were
      // the biggest single group of them: a video deck and a row of
      // books sitting on a desk, placed straight through refProp, which
      // - unlike drop() - never registered a collider. Twenty-one of the
      // thirty-two objects tools/solids.mjs found you could walk through
      // were desk clutter.
      const dh = refHull(which);
      if (dh && dh.length) { g.userData.hull = dh; g.userData.cover = 0.4; }
      // and a bin UNDER it, where an office bin actually lives.
      //
      // The PROCEDURAL bin, not the pack's. Mesh 8 is modelled KNOCKED
      // OVER with its contents spilling out, so standing it upright under
      // a desk gave the bucket-with-a-photo-wrapped-round-it in Liam's
      // screenshot. The spilled one is still used - as litter, on gutted
      // floors, lying down, which is what it is.
      if (r.chance(0.4)) {
        put('bin', d.x + r.range(-0.9, 0.9), d.z + r.range(-0.7, 0.7),
            r.range(0, 6.283));
      }
    }
    // pictures and clocks, on wall faces, at the right height
    let art = 0;
    for (let z = 2; GEN.clutter && z < D - 2 && art < 14; z++) for (let x = 2; x < W - 2; x++) {
      if (P.at(x, z) === 0) continue;
      for (const [ox, oz, ry] of SIDES) {
        if (P.at(x + ox, z + oz) !== 0) continue;
        if (!r.chance(0.045)) continue;
        const fx = cwx(x) + ox * (CELL / 2 + 0.05), fz = cwz(z) + oz * (CELL / 2 + 0.05);
        if (openings.some((o) => Math.hypot(fx - o.x, fz - o.z) < o.r + 0.4)) continue;
        if (cabinets.some((c) => Math.hypot(fx - c.x, fz - c.z) < 1.2)) continue;
        // AND CORKBOARDS. Both of them were in the pack from the start
        // and both went unused, because I had labelled the office meshes
        // by eye instead of reading the material names off the file -
        // see the table in refprops.js. A corkboard is the single most
        // office thing that goes on a wall short of a clock.
        const which = r.chance(0.22) ? 'clock'
          : r.chance(0.35) ? r.pick(['corkA', 'corkB'])
          : r.pick(['artA', 'artB']);
        const g = refProp(which);
        if (!g) continue;
        // flat against the wall: the prints are modelled facing +Z
        g.rotation.y = ry;
        g.position.set(fx, which === 'clock' ? 2.25 : 1.68, fz);
        group.add(g);
        art++;
        break;
      }
    }
  }

  // ---- CEILING: lights everywhere, ducts down the corridors ---------
  //
  // The lights go on a grid because that is how a ceiling grid works, and
  // the ducts follow the corridors because that is where the ceiling void
  // is free. Neither is decoration: a ceiling is half of what you can see
  // from anywhere in a room, and it was empty.
  for (let z = 2; z < D - 2; z += 4) for (let x = 2; x < W - 2; x += 5) {
    if (!free(x, z)) continue;
    const [wx, wz] = wpos(x, z);
    raw(troffer(), wx, WALL_H - 0.06, wz);
  }
  // trunks: all the way round the ring, on both axes
  {
    const [x0, z0] = wpos(C.cx0 - 2, C.cz0 - 2);
    const [x1, z1] = wpos(C.cx1 + 2, C.cz1 + 2);
    raw(duct(x1 - x0, true), (x0 + x1) / 2, WALL_H - 0.42, z0);
    raw(duct(x1 - x0, true), (x0 + x1) / 2, WALL_H - 0.42, z1);
    raw(duct(z1 - z0, false), x0, WALL_H - 0.42, (z0 + z1) / 2);
    raw(duct(z1 - z0, false), x1, WALL_H - 0.42, (z0 + z1) / 2);
  }
  // a grille in most rooms, so the duct is going somewhere
  for (const rm of P.rooms) {
    const cx = (rm.x0 + rm.x1) >> 1, cz = (rm.z0 + rm.z1) >> 1;
    if (!free(cx, cz)) continue;
    const [wx, wz] = wpos(cx, cz);
    raw(grille(r.chance(0.5)), wx, WALL_H - 0.03, wz);
  }
  // sprinkler main round the core, at head height on the wall
  {
    const [x0, z0] = wpos(C.cx0, C.cz0);
    const [x1, z1] = wpos(C.cx1, C.cz1);
    raw(pipe(x1 - x0, true), (x0 + x1) / 2, WALL_H - 0.22, z0 - 0.55);
    raw(pipe(x1 - x0, true), (x0 + x1) / 2, WALL_H - 0.22, z1 + 0.55);
    raw(pipe(z1 - z0, false), x0 - 0.55, WALL_H - 0.22, (z0 + z1) / 2);
    raw(pipe(z1 - z0, false), x1 + 0.55, WALL_H - 0.22, (z0 + z1) / 2);
  }

  // ---- CLEAR THE SQUARE YOU ARRIVE IN -------------------------------
  //
  // The office, meeting and break-room branches all place their
  // centrepiece at the room's centre WITHOUT asking free() - and the
  // spawn is chosen as a room centre. So the game began with the player
  // standing inside a desk: every axis of movement collided, the velocity
  // was zeroed the instant it was set, and he could look around but not
  // move a millimetre.
  //
  // Adding a free() call to each of those three branches would fix
  // today's three cases and miss the next one. Sweeping the spawn square
  // afterwards fixes every case, now and later, in two lines.
  {
    const [px, pz] = wpos(P.spawn.x, P.spawn.z);
    for (let i = props.length - 1; i >= 0; i--) {
      const b = props[i];
      if (Math.abs(b.x - px) < b.w/2 + 0.8 && Math.abs(b.z - pz) < b.d/2 + 0.8) props.splice(i, 1);
    }
  }

  for (const [name, geos] of Object.entries(bucket)) merge(geos, mats[name] || mats.metal, 'fixed:' + name);

  // =====================================================================
  // WHAT IS BOLTED TO THE WALLS
  // =====================================================================
  //
  // Liam: *"add in a flare gun being able to be taken off of walls by
  // smashing open cases or taking it off the wall"*, plus the fire axe,
  // the extinguisher, and bandages.
  //
  // This is the other half of the ammunition economy. Bodies now carry
  // almost nothing, so if the building itself carried nothing either you
  // would simply run out and lose - which is not tension, it is a wall.
  // A floor has four to seven of these on it, they are visible from a
  // distance because they are red and lit, and they are the reason it is
  // worth knowing where you are rather than only where the next man is.
  //
  // BREAK IT OR TAKE IT. Shoot the glass from across the room, or walk
  // into it. Both work, neither needs a key, and neither stops you moving.
  {
    const CAB = {
      axe:   { w: 0.44, h: 0.72, col: '#8e2018', glass: true,  label: 'axe' },
      ext:   { w: 0.30, h: 0.58, col: '#8e2018', glass: false, label: 'ext' },
      flare: { w: 0.34, h: 0.30, col: '#c8571a', glass: true,  label: 'flare' },
      bandage: { w: 0.36, h: 0.34, col: '#e8e6de', glass: false, label: 'bandage' },
    };
    const caseMat = {};
    for (const k in CAB) caseMat[k] = surf(T.metal(CAB[k].col), [1, 1]);
    const paneMat = new THREE.MeshLambertMaterial({
      map: T.glass(), transparent: true, opacity: 0.34, side: THREE.DoubleSide });
    const backMat = surf(T.metal('#1a1c20'), [1, 1]);

    // candidate faces: a wall cell with open floor in front of it, not in
    // a doorway, and not within three metres of another cabinet
    const spots = [];
    for (let z = 2; GEN.cases && z < D - 2; z++) for (let x = 2; x < W - 2; x++) {
      if (P.at(x, z) === 0) continue;
      for (const [ox, oz, ry] of SIDES) {
        if (P.at(x + ox, z + oz) !== 0) continue;
        const fx = cwx(x) + ox * (CELL / 2), fz = cwz(z) + oz * (CELL / 2);
        if (openings.some((o) => Math.hypot(fx - o.x, fz - o.z) < o.r + 0.5)) continue;
        spots.push({ x: fx, z: fz, ry, ox, oz });
      }
    }
    const want = 4 + Math.floor(r.range(0, 4));
    const kinds = ['axe', 'ext', 'flare', 'bandage', 'bandage', 'ext'];
    for (let i = 0; i < want && spots.length; i++) {
      const s = spots.splice(Math.floor(r.range(0, spots.length)), 1)[0];
      if (cabinets.some((c) => Math.hypot(c.x - s.x, c.z - s.z) < 5)) { i--; continue; }
      const item = i === 0 ? 'axe' : (i === 1 ? 'flare' : r.pick(kinds));
      const C = CAB[item];
      const g = new THREE.Group();
      g.name = 'case:' + item;          // so the editor can name what you click
      const y = item === 'ext' ? 0.95 : 1.35;
      // the case: a back, a rim, and a pane you can see the thing through
      const bg = new THREE.BoxGeometry(C.w, C.h, 0.14);
      bg.translate(0, 0, -0.02);
      g.add(new THREE.Mesh(bg, backMat));
      const rim = new THREE.BoxGeometry(C.w + 0.05, C.h + 0.05, 0.10);
      g.add(new THREE.Mesh(rim, caseMat[item]));
      // the thing itself, sitting in it
      const inner = weaponInCase(item, C);
      if (inner) g.add(inner);
      let pane = null;
      if (C.glass) {
        pane = new THREE.Mesh(new THREE.PlaneGeometry(C.w - 0.04, C.h - 0.04), paneMat);
        pane.position.z = 0.055;
        g.add(pane);
      }
      g.position.set(s.x + s.ox * 0.07, y, s.z + s.oz * 0.07);
      g.rotation.y = s.ry;
      group.add(g);
      cabinets.push({ x: g.position.x, y, z: g.position.z, item, mesh: g, pane,
                      broken: false, r: Math.max(C.w, C.h) * 0.65 });
      // ---- AND THE CASE IS SOLID ------------------------------------
      //
      // A glazed box bolted to a wall with a fire axe in it, and you
      // could stand inside it. It stands 14 cm proud - three times the
      // depth of anything else on these walls, and well past "you would
      // never notice". tools/probe.mjs named it once the merged meshes
      // were labelled; before that it was part of a count called
      // "structure" and I had no way to see it.
      //
      // Not removed when it is smashed: breaking the glass takes the axe
      // out of the case, it does not take the case off the wall.
      const sideOn = Math.abs(Math.sin(s.ry)) > 0.5;
      solids.push({ x: g.position.x, y, z: g.position.z,
                    w: sideOn ? 0.16 : C.w, h: C.h, d: sideOn ? C.w : 0.16 });
    }
  }

  const world = { group, struct: solids, props: [], glassMesh: glass,
                  cabinets, stairTop, hole, base: 0 };
  world.plan = P;
  syncProps(world);
  clearDoorways(world);
  clearMiddles(world);
  thinOut(world);
  world.solids = solids.concat(world.props);
  return world;
}

/**
 * Take the furniture out of the doorways.
 *
 * Liam: *"the most right room with the only one guy nothing else
 * rectangle there is something blocking the door there so in short work
 * on colliders"*. A flood of every room with the player's real footprint
 * (tools/rooms.mjs) found eleven of fourteen rooms on floor 1 with at
 * least one doorway you could not reach, sealed by copiers, vending
 * machines, desks and lockers standing in them.
 *
 * The furnisher places by ROOM, and a room's rectangle includes the
 * cells its doors are cut through - so nothing in it was ever wrong on
 * its own terms. This is the rule it was missing, and it belongs here
 * rather than inside the placement code because it has to hold however
 * a prop got there.
 *
 * A DOORWAY IS NOT JUST THE HOLE. A metre of approach on both sides has
 * to stay clear too, or you get a desk you have to squeeze past on the
 * way in, which is the same complaint one step further back.
 *
 * (Doors themselves are exempt, obviously, and so is anything Liam
 * placed by hand - if he puts a filing cabinet in a doorway that is a
 * decision, not a bug.)
 */
export function clearDoorways(w) {
  const P = w.plan;
  if (!P || !P.doors) return 0;
  // HOW FAR IS "THE APPROACH"? 1.05 m was not far enough, and the miss
  // was small enough to look like a fix: tools/doorprop.mjs finds a
  // partition 1.22 m off the far-right room's door and a cabinet 1.29 m
  // off another, both just outside the old zone, both spanning most of
  // the opening. That is Liam's *"rectangle there is something blocking
  // the door"* and the reason he could still only get out by going round.
  //
  // AND IT IS NOT SQUARE. The old zone grew by the same amount in x and
  // z, so widening it to reach far enough THROUGH a door also ate the
  // furniture standing harmlessly BESIDE it. The approach only needs
  // depth on the axis you walk in on, so the pad is now split: a long
  // reach across the threshold, a short one along the wall.
  const REACH = 1.85;          // through the doorway, each side
  const SIDE = 0.55;           // along the wall, past the jambs
  const zones = [];
  for (const d of P.doors) {
    // level.js has its own cell->world helpers (cwx/cwz) rather than
    // importing plan's; they are the same arithmetic
    // x and z use DIFFERENT grid sizes - the plate is 46 x 34 - and
    // using W for both put every doorway zone eight metres out of place
    const cx0 = (v) => (v - W / 2 + 0.5) * CELL;
    const cz0 = (v) => (v - D / 2 + 0.5) * CELL;
    const ax = cx0(d.x), az = cz0(d.z);
    const bx = cx0(d.x2 === undefined ? d.x : d.x2);
    const bz = cz0(d.z2 === undefined ? d.z : d.z2);
    // which way the opening runs, and therefore which way you walk in
    const runX = Math.abs(bx - ax), runZ = Math.abs(bz - az);
    const padX = runX > runZ ? SIDE : REACH;
    const padZ = runZ > runX ? SIDE : REACH;
    zones.push({
      x0: Math.min(ax, bx) - padX, x1: Math.max(ax, bx) + padX,
      z0: Math.min(az, bz) - padZ, z1: Math.max(az, bz) + padZ,
    });
  }
  // which prop groups have a collider standing in one
  const doomed = new Set();
  for (const s of w.props) {
    if (s.oid === undefined) continue;
    // low enough to step over, or high enough to walk under: not in the way
    if (!inTheWay(s, w)) continue;
    for (const z of zones) {
      if (s.x + s.w / 2 > z.x0 && s.x - s.w / 2 < z.x1
       && s.z + s.d / 2 > z.z0 && s.z - s.d / 2 < z.z1) { doomed.add(s.oid); break; }
    }
  }
  if (!doomed.size) return 0;

  let gone = 0;
  for (const o of w.group.children.slice()) {
    if (!doomed.has(o.id)) continue;
    if (o.userData.handmade || o.userData.isMarker) continue;   // his, not ours
    if ((o.userData.hinges || []).length) continue;             // it IS the door
    w.group.remove(o);
    o.traverse((q) => { if (q.isMesh && q.geometry) q.geometry.dispose(); });
    gone++;
  }
  if (gone) syncProps(w);
  return gone;
}

/**
 * Is this collider actually in a player's way?
 *
 * Between the knee and the top of the head - so a ceiling duct, a
 * troffer, a skirting cable tray and a floor vent are all ignored,
 * because you walk under or over them.
 *
 * THE STOREY BASE IS THE WHOLE POINT. A prop's collider is stored in
 * ABSOLUTE world Y once a floor has been streamed in: floor 12's desks
 * sit at y = 33.1, not 0.74. Every pass in this file used to test the
 * raw y against 0.46 and 1.7, so on any storey above the ground NOTHING
 * was ever in the way, and clearDoorways() and thinOut() found nothing
 * to do on floors 2 to 31. Floor 1 is the only storey with a base of
 * zero, which is exactly why it worked and hid this for so long.
 */
function inTheWay(s, w) {
  const y = s.y - (w.base || 0);
  return y + s.h / 2 > 0.46 && y - s.h / 2 < 1.7;
}

/**
 * NOTHING STANDS IN THE MIDDLE OF A ROOM.
 *
 * Liam: *"remove all furniture that is in the middle of any rooms in
 * highrise, it looks bad and is hard to maneuver around in game"*.
 *
 * thinOut() below already stops a room being over-furnished, but it
 * measures the WRONG THING for this: it counts how much floor is left
 * and does not care where the floor is. A room can be 60% walkable and
 * still have a copier marooned in the middle of it, and that copier is
 * the one you keep catching your shoulder on - you never bump the
 * cabinet against the back wall, because you were never going to walk
 * through the back wall.
 *
 * So this is a different question: is this thing AGAINST something? A
 * prop is kept if any part of its footprint comes within 'margin' of a
 * wall, a pillar, a core, or the edge of the floor plate. Anything
 * floating free in open floor is an island and goes.
 *
 * It is deliberately about the plan grid and not about the room
 * rectangle, so an alcove, a structural column or a partition all count
 * as something to stand against - which is what stops this from
 * stripping a big open-plan floor back to bare boards.
 *
 * HIS OWN PROPS ARE NEVER TOUCHED ('handmade'), the same rule the other
 * two passes keep: if he puts a desk in the middle of a room in the
 * editor, he meant it.
 */
export function clearMiddles(w, margin = 0.6) {
  const P = w.plan;
  if (!P || !P.rooms) return 0;

  // one bounding box per PROP, not per collider: a desk is several boxes
  // and any one of them touching a wall keeps the whole desk
  const box = new Map();
  for (const s of w.props) {
    if (s.oid === undefined) continue;
    // only things that are actually in the way at body height - a ceiling
    // duct or a floor cable is not what he is walking into
    if (!inTheWay(s, w)) continue;
    const b = box.get(s.oid)
      || { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
    b.x0 = Math.min(b.x0, s.x - s.w / 2); b.x1 = Math.max(b.x1, s.x + s.w / 2);
    b.z0 = Math.min(b.z0, s.z - s.d / 2); b.z1 = Math.max(b.z1, s.z + s.d / 2);
    box.set(s.oid, b);
  }

  /** is this point inside a wall, a column, the core, or off the plate? */
  const solid = (x, z) => {
    const cx = Math.floor(x / CELL + W / 2), cz = Math.floor(z / CELL + D / 2);
    if (cx < 0 || cz < 0 || cx >= W || cz >= D) return true;
    return P.at(cx, cz) !== 0;
  };

  let gone = 0;
  for (const [oid, b] of box) {
    const o = w.group.getObjectById(oid);
    if (!o || o.userData.handmade || o.userData.isMarker) continue;
    if ((o.userData.hinges || []).length) continue;          // it is a door

    // walk the four sides, a margin out, looking for something to lean on
    let against = false;
    for (let x = b.x0; x <= b.x1 + 1e-6 && !against; x += 0.3) {
      if (solid(x, b.z0 - margin) || solid(x, b.z1 + margin)) against = true;
    }
    for (let z = b.z0; z <= b.z1 + 1e-6 && !against; z += 0.3) {
      if (solid(b.x0 - margin, z) || solid(b.x1 + margin, z)) against = true;
    }
    if (against) continue;

    w.group.remove(o);
    o.traverse((q) => { if (q.isMesh && q.geometry) q.geometry.dispose(); });
    gone++;
  }
  if (gone) syncProps(w);
  return gone;
}

/**
 * Stop a room being furnished until you cannot walk in it.
 *
 * The doorway rule above takes the desk out of the door. It does not
 * help with the room Liam actually walked into, which was a break room
 * whose north wall was a solid run of counter with a microwave, a coffee
 * machine, a fridge and a copier on it, and more furniture in front of
 * that: **22% of its floor was standable**. Six of its eight ways out
 * were unreachable, and not because anything was in the doorway - there
 * was no route across the room to reach them.
 *
 * The furnisher places by room USE and each choice is reasonable on its
 * own; nothing counts what they add up to. So this counts, with the
 * player's real footprint, and takes the biggest things out until there
 * is a room again.
 *
 * BIGGEST FIRST is deliberate. Removing small things needs many removals
 * to free the same floor, and the small things - a bin, a chair, a
 * plant - are what make a room look lived in. One copier is worth six
 * chairs of walking space and costs almost nothing to look at.
 */
export function thinOut(w, target = 0.55) {
  const P = w.plan;
  if (!P || !P.rooms) return 0;
  const R = 0.32, STEP = 0.34;
  let gone = 0;

  for (const room of P.rooms) {
    const ax = (room.x0 - W / 2 + 0.5) * CELL - 0.5;
    const bx = (room.x1 - W / 2 + 0.5) * CELL + 0.5;
    const az = (room.z0 - D / 2 + 0.5) * CELL - 0.5;
    const bz = (room.z1 - D / 2 + 0.5) * CELL + 0.5;

    // the room's own props, biggest footprint first
    const mine = new Map();
    for (const s of w.props) {
      if (s.oid === undefined) continue;
      if (!inTheWay(s, w)) continue;
      if (s.x < ax || s.x > bx || s.z < az || s.z > bz) continue;
      mine.set(s.oid, (mine.get(s.oid) || 0) + s.w * s.d);
    }
    const order = [...mine.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);

    const dead = new Set();
    const frac = () => {
      let free = 0, all = 0;
      for (let x = ax + STEP; x < bx; x += STEP)
        for (let z = az + STEP; z < bz; z += STEP) {
          const [cx, cz] = [Math.floor(x / CELL + W / 2), Math.floor(z / CELL + D / 2)];
          if (cx < 0 || cz < 0 || cx >= W || cz >= D || P.at(cx, cz) !== 0) continue;
          all++;
          let hit = false;
          for (const s of w.props) {
            if (dead.has(s.oid)) continue;
            if (!inTheWay(s, w)) continue;
            if (Math.abs(x - s.x) < s.w / 2 + R && Math.abs(z - s.z) < s.d / 2 + R) { hit = true; break; }
          }
          if (!hit) free++;
        }
      return all ? free / all : 1;
    };

    let f = frac();
    for (const oid of order) {
      if (f >= target) break;
      const o = w.group.getObjectById(oid);
      if (!o || o.userData.handmade || o.userData.isMarker) continue;
      if ((o.userData.hinges || []).length) continue;
      dead.add(oid);
      f = frac();
    }
    for (const oid of dead) {
      const o = w.group.getObjectById(oid);
      if (!o) continue;
      w.group.remove(o);
      o.traverse((q) => { if (q.isMesh && q.geometry) q.geometry.dispose(); });
      gone++;
    }
  }
  if (gone) syncProps(w);
  return gone;
}

/**
 * Rebuild a storey's prop colliders from where its props actually ARE.
 *
 * Liam: *"make it so that if I move something it collider goes with the
 * object that is the issue"*.
 *
 * He is exactly right and I flagged this myself two rounds ago as a
 * limitation worth living with, which was the wrong call. Collision boxes
 * used to be pushed into a flat list at the moment a prop was created, so
 * the box recorded where the GENERATOR put the thing. Move a desk in the
 * editor and you got the worst of both faults at once: an invisible wall
 * where it used to be, and a desk you walk through where it now is. Every
 * edit he made actively made the collision worse.
 *
 * So nothing pushes boxes any more. Each prop carries its own hull in
 * `userData.hull` - in its own local space - and this derives the world
 * boxes from the group's current position, rotation and SCALE. Run it
 * after anything moves: loading saved edits, or a nudge in the editor.
 *
 * It is cheap - a few hundred boxes of arithmetic, no voxelising, the
 * hulls were computed once at build - so it can run on every keypress.
 */
export function syncProps(w) {
  const out = [];
  for (const o of w.group.children) {
    if (o.visible === false) continue;          // a prop hidden in the editor
    // A HINGED CHILD IS SYNCED IN ITS OWN RIGHT. Its boxes have to come
    // from where it is NOW, not from the parent's transform, because the
    // whole point of it is that the two differ.
    for (const lf of (o.userData.hinges || [])) {
      const d = lf.userData.door;
      // the hinge in world x/z, which is all doors.js needs to know about
      // where its parent has been dragged to
      const c = Math.cos(o.rotation.y), s2 = Math.sin(o.rotation.y);
      d.hx = o.position.x + lf.position.x * c + lf.position.z * s2;
      d.hz = o.position.z - lf.position.x * s2 + lf.position.z * c;
      d.base = w.base || 0;
      d.pyaw = o.rotation.y;
      lf.updateWorldMatrix(true, false);
      for (const b of placeColliders(d.hull, d.hx, d.hz, o.rotation.y + d.rest + d.a,
                                     (w.base || 0) + o.position.y, 1)) {
        b.owner = 'doorleaf'; b.oid = lf.id;
        out.push(b);
      }
    }
    const h = o.userData.hull;
    if (!h || !h.length) continue;
    // ---- WIDTH, HEIGHT AND LENGTH, SEPARATELY ------------------------
    //
    // Liam: *"let me create and shape my walls not just a scale but size
    // so width height and length scaling like unity"*.
    //
    // This read o.scale.x and multiplied everything by it, so a wall
    // stretched to four metres long and left 2.7 high got a collider four
    // metres long AND eleven metres high. You could not walk under it and
    // you could not see why.
    //
    // The scaling happens in the prop's LOCAL frame, before
    // placeColliders turns it - which is the correct order, because the
    // object's own scale is applied before its rotation too.
    const sx = o.scale.x || 1, sy = o.scale.y || 1, sz = o.scale.z || 1;
    const scaled = (sx === 1 && sy === 1 && sz === 1) ? h : h.map((b) => ({
      x: b.x * sx, y: b.y * sy, z: b.z * sz,
      w: b.w * sx, h: b.h * sy, d: b.d * sz }));
    // Each box remembers which prop it came from. It costs one field and
    // it is the difference between a diagnostic that can say "the desk's
    // collision is still at its old position" and one that can only count
    // boxes in a radius and guess.
    const own = o.userData.refName || o.userData.propName || o.name || 'prop';
    for (const b of placeColliders(scaled, o.position.x, o.position.z,
                                   o.rotation.y, (w.base || 0) + o.position.y,
                                   o.userData.cover ?? 1)) {
      b.owner = own;
      b.oid = o.id;
      out.push(b);
    }
  }
  w.props = out;
  // Doors hold direct references to their own boxes so they can rewrite
  // them every frame without rebuilding this whole list. Those references
  // are only valid until the next time this function runs - so rebinding
  // them is part of this function, not something a caller can forget.
  Doors.collect(w);
  Doors.bind(w);
  // AND THE MEN'S MAP OF THE FLOOR. The nav mask is the plan grid OR'd
  // with every prop, so it has to be rebuilt whenever the props change -
  // which is exactly what this function means. Doing it here rather than
  // at a call site is the same reasoning as the door rebind above: it is
  // part of "the props changed", not something a caller can forget.
  buildNav(w);
  return out;
}

// three's BufferGeometryUtils, inlined for the two calls this needs
function mergeGeometries(list) {
  const out = new THREE.BufferGeometry();
  let n = 0, ni = 0;
  for (const g of list) { n += g.attributes.position.count; ni += g.index ? g.index.count : 0; }
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  const idx = new Uint32Array(ni);
  let vo = 0, io = 0;
  for (const g of list) {
    const p = g.attributes.position, nn = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array, vo * 3);
    if (nn) nor.set(nn.array, vo * 3);
    if (u) uv.set(u.array, vo * 2);
    const gi = g.index.array;
    for (let i = 0; i < gi.length; i++) idx[io + i] = gi[i] + vo;
    vo += p.count; io += gi.length;
    g.dispose();
  }
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}


// ---------------------------------------------------------------------
// what you can see inside a wall case
// ---------------------------------------------------------------------
//
// The real weapon model, shrunk and turned flat against the back of the
// box - so a fire axe cabinet has a fire axe in it and you can tell from
// across the room which case is worth crossing for. A silhouette would
// have been cheaper and would have made every case identical.
function weaponInCase(item, C) {
  if (item === 'bandage') {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(C.w * 0.8, C.h * 0.7, 0.10),
      new THREE.MeshLambertMaterial({ color: 0xe8e6de }));
    box.position.z = 0.04;
    g.add(box);
    // the cross, which is the only thing anyone reads on a first-aid box
    const gm = new THREE.MeshBasicMaterial({ color: 0x2f7d43 });
    const a = new THREE.Mesh(new THREE.BoxGeometry(C.w * 0.46, C.h * 0.16, 0.01), gm);
    const b = new THREE.Mesh(new THREE.BoxGeometry(C.w * 0.16, C.h * 0.46, 0.01), gm);
    a.position.z = b.position.z = 0.095;
    g.add(a, b);
    return g;
  }
  const src = { axe: 'axe', ext: 'ext', flare: 'flare' }[item];
  if (!src) return null;
  const m = weaponMesh(src);
  // lying flat in the case, pointing up, scaled to fit behind the pane
  const box = new THREE.Box3().setFromObject(m);
  const size = box.getSize(new THREE.Vector3());
  const k = Math.min((C.w * 0.72) / Math.max(0.01, size.x),
                     (C.h * 0.80) / Math.max(0.01, Math.max(size.y, size.z)));
  const g = new THREE.Group();
  m.rotation.x = Math.PI / 2;                 // stand it up in the frame
  m.scale.setScalar(k);
  const c2 = box.getCenter(new THREE.Vector3()).multiplyScalar(k);
  m.position.set(-c2.x, c2.z, 0.02);
  g.add(m);
  return g;
}

// =====================================================================
// PLACING THINGS BY HAND
// =====================================================================
//
// Liam: *"make it so there is a low bar that I can pull stuff out of like
// tables and stuff like an asset list I can pull from"*.
//
// Everything above builds a floor from a seed. This is the other
// direction: one named prop, at a spot he picked, on a floor that already
// exists. The editor's asset bar calls it; nothing in the generator does.
//
// It has to produce something INDISTINGUISHABLE from a generated prop -
// same group shape, same userData.hull, same gen stamp - or the saved
// edits, the colliders and the selection would all treat hand-placed
// things as second class.
let sharedMats = null;

/**
 * Every name the asset bar can offer, in four rows.
 *
 * Liam: *"make it so I can add in enemies counters coupards and way more
 * things flare guns"*. Men and weapons go in the same catalogue as the
 * furniture - they are markers, see props.js - but they must not be
 * BURIED in it: nobody hunts for "foe_rifle" between a fridge and a
 * filing cabinet. So the list is split by what a thing is for.
 */
const BAR_ORDER = ['enemies', 'weapons', 'doors', 'seating', 'kitchen',
                   'decoration', 'office', 'storage', 'structure'];

export function assetList() {
  // ---- ONE BUTTON PER PROP -----------------------------------------
  //
  // The bar is built from two sources - the procedural table and the
  // pack - and anything in both was listed twice. `vending` always was;
  // adding vendingA/B/C to the pack made it four pairs.
  //
  // The pack wins in spawnProp (`refHull` is checked first), so the
  // procedural entry behind a pack name is unreachable: clicking either
  // button gives you the pack one. Listing it twice is just two buttons
  // that do the same thing, one of which lies about what it makes.
  const fromPack = new Set(refNames());
  const all = Object.keys(PROPS)
    .filter((k) => typeof PROPS[k] === 'function' && !fromPack.has(k));
  const rows = new Map(BAR_ORDER.map((g) => [g, []]));
  for (const k of all) {
    const c = categoryOf(k);
    if (!rows.has(c)) rows.set(c, []);
    rows.get(c).push(k);
  }
  // A, B and C next to each other under their own prop, not scattered
  // through the alphabet - deskA deskB deskC, then computerA...
  const key = (s) => (/[ABC]$/.test(s) ? s.slice(0, -1) + ' ' + s.slice(-1) : s);
  const out = [];
  for (const [group, names] of rows)
    if (names.length) out.push({ group, names: names.sort((a, b) => key(a) < key(b) ? -1 : 1) });
  out.push({ group: 'imported', names: refNames().slice().sort() });
  return out;
}

/**
 * Put `name` on `world` at (x, z), facing `ry`. Returns the group.
 *
 * Reference props come out of the pack; anything else is built by
 * props.js. Either way it lands with a hull, so it is solid the instant
 * it appears - see syncProps.
 */
export function spawnProp(world, name, x, z, ry = 0) {
  if (!world) return null;
  let g = null, cover = 1, hull = null;

  const ref = refHull(name);
  if (ref) {
    g = refProp(name, { ry });
    if (!g) return null;
    hull = ref;
    const sz = refSize(name);
    cover = sz && sz.y > 1.1 ? 1 : 0.6;
  } else if (PROPS[name]) {
    if (!sharedMats) sharedMats = propMaterials(T, surf);
    // A PRIVATE STREAM, seeded from where it lands - the same rule the
    // generator follows, so two props dropped on the same spot look the
    // same and dropping one never disturbs anything else.
    const made = PROPS[name](rng(((Math.round(x * 16) & 0xffff) * 73856093
      ^ (Math.round(z * 16) & 0xffff) * 19349663 ^ name.length * 83492791) >>> 0));
    const byMat = {};
    for (const p of made.parts) {
      const geo = p.geo.clone();
      if (ry) geo.rotateY(ry);
      (byMat[p.mat] || (byMat[p.mat] = [])).push(geo);
    }
    g = new THREE.Group();
    for (const [m, geos] of Object.entries(byMat))
      g.add(new THREE.Mesh(mergeGeometries(geos), sharedMats[m] || sharedMats.metal));
    g.name = name;
    g.userData.propName = name;
    cover = made.cover;
    // A prop may say 'do not voxelise me'. A door leaf is 5 cm thick and
    // the voxel cell is 9, so the grid would round it up and give the
    // handle a lump of its own - and a door is the one collider you feel
    // every single time you use it.
    hull = made.hull === 'solid' ? made.solid : colliders(g, { cell: 0.09 });
    if (!hull.length) hull = made.solid;

    // ---- A MOVING PART ------------------------------------------------
    // Built AFTER the frame's hull, and as a child group, so the frame
    // stays voxelled shut around an opening that is genuinely empty.
    for (const sw of (made.swings || (made.swing ? [made.swing] : [])))
      hangLeaf(g, sw, ry, sharedMats);
  } else return null;

  g.position.set(x, 0, z);
  g.userData.hull = hull;
  g.userData.cover = cover;
  // THE SAME STAMP A GENERATED PROP GETS. edits.js keys on this, so
  // without it a hand-placed prop could never be saved.
  g.userData.gen = { x: +x.toFixed(3), y: 0, z: +z.toFixed(3) };
  g.userData.handmade = true;
  // IF SOMETHING IS ALREADY STANDING HERE UNDER THIS NAME, this is a copy
  // and it needs a number of its own - see keyOf() in edits.js.
  let dup = 0;
  for (const o of world.group.children) {
    if (o === g) continue;
    const gn = o.userData.gen;
    if (!gn || (o.userData.refName || o.userData.propName) !== name) continue;
    if (Math.abs(gn.x - x) > 0.005 || Math.abs(gn.z - z) > 0.005) continue;
    dup = Math.max(dup, (o.userData.dup || 0) + 1);
  }
  if (dup) g.userData.dup = dup;
  world.group.add(g);
  return g;
}

/**
 * Hang a swinging leaf on prop `g`.
 *
 * The prop's geometry was already turned by `ry` and baked. The leaf is
 * NOT baked: its geometry stays in hinge-local space and the group it
 * lives in carries the rotation, because that rotation is about to change
 * sixty times a second. So the hinge POSITION gets turned by ry here, and
 * ry becomes the leaf's rest angle.
 */
function hangLeaf(g, sw, ry, mats) {
  const cs = Math.cos(ry), sn = Math.sin(ry);
  const leaf = new THREE.Group();
  const byMat = {};
  for (const p of sw.parts) (byMat[p.mat] || (byMat[p.mat] = [])).push(p.geo.clone());
  for (const [m, geos] of Object.entries(byMat))
    leaf.add(new THREE.Mesh(mergeGeometries(geos), mats[m] || mats.metal));
  leaf.name = 'leaf';
  leaf.position.set(sw.x * cs + sw.z * sn, 0, -sw.x * sn + sw.z * cs);
  leaf.rotation.y = ry;
  leaf.userData.hull = sw.solid;
  leaf.userData.cover = 1;
  leaf.userData.leaf = true;
  leaf.userData.door = {
    a: 0, v: 0, rest: ry, parked: false,
    hull: sw.solid, cover: 1, span: sw.span, open: sw.open ?? 1.75, flip: !!sw.flip,
    h: 2.1, hx: 0, hz: 0, base: 0, boxes: null,
  };
  g.add(leaf);
  // A LIST. A double door is two leaves hinged at opposite jambs, and the
  // only thing that made that hard was this field having been singular.
  (g.userData.hinges || (g.userData.hinges = [])).push(leaf);
  g.userData.hinged = leaf;               // the first one, for old callers
  return leaf;
}

/** take one off the floor again */
export function removeProp(world, o) {
  if (!world || !o || o.parent !== world.group) return false;
  world.group.remove(o);
  o.traverse((m) => { if (m.isMesh && m.geometry) m.geometry.dispose(); });
  return true;
}
