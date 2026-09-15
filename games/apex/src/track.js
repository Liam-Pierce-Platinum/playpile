// =====================================================================
// APEX :: track.js - TURNING A CENTRE LINE INTO A CIRCUIT
// =====================================================================
//
// Everything here hangs off the one centre line that circuits.js walks
// out: the asphalt, the white lines, the kerbs, the runoff, the barriers,
// the fencing, the grandstands and the trees are all just offsets from it
// at some distance round the lap. Nothing is placed by hand, which is why
// adding a sixth circuit costs one array of corners and no modelling.
//
// THE ONE PIECE OF VECTOR MATHS EVERYTHING USES
//
//   heading h  ->  forward = ( sin h, cos h )
//                  LEFT    = ( cos h, -sin h )
//
// so a point `o` metres to the left of the centre line at sample i is
// just p + left*o. Every ribbon below is two of those with a different o.
//
// WHY SO MUCH OF IT IS MERGED OR INSTANCED
// A lap is five to seven kilometres. At two-metre spacing that is three
// thousand samples, and a barrier post at every one of them on both sides
// is six thousand objects - which is a slideshow if they are six thousand
// draw calls and nothing at all if they are two. So the long continuous
// things get merged into single geometries and the repeated things become
// instanced meshes.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { centreline } from './circuits.js';
import { makeGround, makeGrass, makeTrees, makeBushes, makeSky, makeMountains } from './scenery.js';

const ASPHALT = 0x37393d;
const RUNOFF  = 0x6d5f52;
const GRASS   = 0x3f5a33;
const KERB_R  = 0xc4342c;
const KERB_W  = 0xe8e8e4;
const LINE    = 0xdededa;
const ARMCO   = 0x9aa3ad;
const POST    = 0x4a4f57;
const TYREW   = 0x1a1c20;
const CONCRETE= 0x8d8f8c;

const mat = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.85, ...o });

/**
 * How far any point in the world is from the centre line - fast.
 *
 * The scenery needs this tens of thousands of times: the hills have to be
 * flattened near the circuit, and every tree and tuft has to know what
 * height the ground is under it. Asking the real answer each time is a
 * scan of three thousand samples, which at forty thousand ground vertices
 * is a hundred million distance sums and several seconds of a frozen tab.
 *
 * So it is baked once into a coarse grid and read back with a bilinear
 * blend. Interpolating a distance field OVERSTATES the distance in the
 * dip between two nodes, and overstating it here means a hillside allowed
 * to creep closer to the track than intended - so a cell's worth is
 * subtracted off the answer. It is deliberately the pessimistic version.
 */
function distanceField(points, minX, maxX, minZ, maxZ, pad) {
  const CELL = 48;
  const x0 = minX - pad, z0 = minZ - pad;
  const nx = Math.ceil((maxX - minX + pad * 2) / CELL) + 1;
  const nz = Math.ceil((maxZ - minZ + pad * 2) / CELL) + 1;
  // every third sample is still only six metres apart, far finer than the grid
  const px = [], pz = [];
  for (let i = 0; i < points.length; i += 3) { px.push(points[i].x); pz.push(points[i].z); }
  const f = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * CELL;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL;
      let best = Infinity;
      for (let k = 0; k < px.length; k++) {
        const dx = px[k] - x, dz = pz[k] - z;
        const d = dx * dx + dz * dz;
        if (d < best) best = d;
      }
      f[j * nx + i] = Math.sqrt(best);
    }
  }
  return (x, z) => {
    const gx = (x - x0) / CELL, gz = (z - z0) / CELL;
    if (gx < 0 || gz < 0 || gx > nx - 1 || gz > nz - 1) return 1e6;
    const i = Math.floor(gx), j = Math.floor(gz);
    const i1 = Math.min(i + 1, nx - 1), j1 = Math.min(j + 1, nz - 1);
    const tx = gx - i, tz = gz - j;
    const a = f[j * nx + i], b = f[j * nx + i1], c = f[j1 * nx + i], d = f[j1 * nx + i1];
    return Math.max(0, (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz - CELL * 0.75);
  };
}

/** left-hand normal of a heading */
const leftOf = (h) => [Math.cos(h), -Math.sin(h)];

/**
 * A ribbon between two offsets from the centre line.
 *
 * `inner` and `outer` are how far left of the line each edge sits - so a
 * road is (+w/2, -w/2), a kerb is (+w/2, +w/2+1.2), and the sign does all
 * the work of putting things on the correct side.
 */
function ribbon(pts, inner, outer, y, range) {
  const v = [], from = range ? range[0] : 0, to = range ? range[1] : pts.length - 1;
  for (let i = from; i < to; i++) {
    const a = pts[i], b = pts[i + 1];
    const la = leftOf(a.h), lb = leftOf(b.h);
    const ia = typeof inner === 'function' ? inner(a, i) : inner;
    const oa = typeof outer === 'function' ? outer(a, i) : outer;
    const ib = typeof inner === 'function' ? inner(b, i + 1) : inner;
    const ob = typeof outer === 'function' ? outer(b, i + 1) : outer;
    const ya = typeof y === 'function' ? y(a, i) : y;
    const yb = typeof y === 'function' ? y(b, i + 1) : y;
    const A = [a.x + la[0] * ia, ya, a.z + la[1] * ia];
    const B = [a.x + la[0] * oa, ya, a.z + la[1] * oa];
    const C = [b.x + lb[0] * ib, yb, b.z + lb[1] * ib];
    const D = [b.x + lb[0] * ob, yb, b.z + lb[1] * ob];
    // WOUND SO THE NORMAL POINTS UP. Going A-C-D puts it the other way:
    // the cross product comes out as -Y, every triangle of the road faces
    // the earth, and the whole racing surface is back-face culled. The
    // circuit still had barriers, trees and grandstands, so it looked
    // built - the car was simply driving on grass with the asphalt
    // invisible underneath it. A ray fired straight down at the centre
    // line hit nothing but the ground, which is what found it.
    v.push(...A, ...D, ...C, ...A, ...B, ...D);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** an upright wall: a vertical strip standing at one offset */
function wall(pts, offset, y0, y1, range) {
  const v = [], from = range ? range[0] : 0, to = range ? range[1] : pts.length - 1;
  for (let i = from; i < to; i++) {
    const a = pts[i], b = pts[i + 1];
    const la = leftOf(a.h), lb = leftOf(b.h);
    const oa = typeof offset === 'function' ? offset(a, i) : offset;
    const ob = typeof offset === 'function' ? offset(b, i + 1) : offset;
    const ax = a.x + la[0] * oa, az = a.z + la[1] * oa;
    const bx = b.x + lb[0] * ob, bz = b.z + lb[1] * ob;
    v.push(ax, y0, az,  bx, y0, bz,  bx, y1, bz);
    v.push(ax, y0, az,  bx, y1, bz,  ax, y1, az);
    // and the back face, so it is solid from either side
    v.push(ax, y0, az,  bx, y1, bz,  bx, y0, bz);
    v.push(ax, y0, az,  ax, y1, az,  bx, y1, bz);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/** a grandstand: a raked bank of seats under a roof */
function grandstand(len = 60, rows = 14) {
  const parts = [];
  const seatH = 0.55, seatD = 0.85;
  for (let r = 0; r < rows; r++) {
    const g = new THREE.BoxGeometry(len, seatH, seatD);
    g.translate(0, seatH / 2 + r * seatH * 0.8, -r * seatD);
    parts.push(g);
  }
  const deck = mergeGeometries(parts);
  const stand = new THREE.Group();
  const seats = new THREE.Mesh(deck, mat(CONCRETE, { roughness: 0.9 }));
  stand.add(seats);

  // the crowd: a block of colour per row, which at any distance you would
  // ever see it from reads as people and costs four triangles a row
  const crowdG = [];
  for (let r = 0; r < rows; r++) {
    const g = new THREE.BoxGeometry(len * 0.98, 0.5, 0.3);
    g.translate(0, seatH + r * seatH * 0.8 + 0.25, -r * seatD + 0.2);
    crowdG.push(g);
  }
  const crowd = new THREE.Mesh(mergeGeometries(crowdG), new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: false, flatShading: true, roughness: 1.0 }));
  crowd.material.color.setHSL(0.08, 0.25, 0.55);
  stand.add(crowd);

  // roof on columns
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 3, 0.5, rows * seatD + 4),
    mat(0x30343a, { roughness: 0.6, metalness: 0.3 }));
  roof.position.set(0, rows * seatH * 0.8 + 3.2, -rows * seatD / 2 + 1);
  stand.add(roof);
  for (const s of [-1, 1]) {
    for (const d of [0.15, 0.5, 0.85]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, rows * seatH * 0.8 + 3, 0.5), mat(0x40454c));
      col.position.set(s * len * 0.45, (rows * seatH * 0.8 + 3) / 2, -rows * seatD * d);
      stand.add(col);
    }
  }
  return stand;
}

/**
 * Build the whole circuit.
 *
 * Returns the scene group plus what the game needs to know: the centre
 * line, the lap length, where the start line is and which way it faces,
 * and a way to ask how far off the racing surface a point is.
 */
export function buildTrack(spec) {
  const { points, length, corners } = centreline(spec, 2);
  const n = points.length;
  const group = new THREE.Group();
  const HW = spec.width / 2;
  const walls = !!spec.walls;
  const runoffW = walls ? 2.5 : 16;
  const barrierAt = HW + (walls ? 1.2 : runoffW);

  // ---- the ground everything sits on ----------------------------------
  // Sized from how far the circuit actually sprawls, plus a margin, so a
  // short lap does not get a plain the size of Suzuka.
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  // A FLAT PLANE IN ONE COLOUR WAS THE SINGLE BIGGEST THING MAKING THIS
  // LOOK UNFINISHED. It is now rolling country - noise, vertex-coloured,
  // and levelled off around the circuit, because a real one is built on
  // graded land and a hill through the racing surface is not a style.
  const pad = 1500;
  const distTo = distanceField(points, minX, maxX, minZ, maxZ, pad);
  const land = makeGround({ minX, maxX, minZ, maxZ }, distTo,
    { pad, city: !!spec.city, flat: 75, rise: 300, amp: 36 });
  const heightAt = land.heightAt;
  group.add(land.mesh);

  // ---- runoff, then asphalt on top of it ------------------------------
  const apron = new THREE.Mesh(ribbon(points, HW + runoffW, -(HW + runoffW), -0.12),
    mat(spec.city ? CONCRETE : RUNOFF, { roughness: 1 }));
  apron.receiveShadow = true;
  group.add(apron);

  const road = new THREE.Mesh(ribbon(points, HW, -HW, 0), mat(ASPHALT, { roughness: 0.92 }));
  road.receiveShadow = true;
  group.add(road);

  // the white lines that define the track limits
  const lineMat = mat(LINE, { roughness: 0.7 });
  group.add(new THREE.Mesh(ribbon(points, HW, HW - 0.22, 0.012), lineMat));
  group.add(new THREE.Mesh(ribbon(points, -HW + 0.22, -HW, 0.012), lineMat));

  // ---- KERBS -----------------------------------------------------------
  //
  // On the inside of anything tighter than a 250 m radius, and on the
  // outside too once it is tighter than 120 - which is the real rule of
  // thumb, and is why a fast sweeper has a kerb only on the apex side
  // while a chicane is striped on both.
  const kerbRed = [], kerbWhite = [];
  for (let i = 0; i < n - 1; i++) {
    const c = points[i].curve;
    if (Math.abs(c) < 1 / 250) continue;
    const r = 1 / Math.abs(c);
    const inside = c > 0 ? 1 : -1;            // left turn -> inside is left
    const bucket = (Math.floor(i / 2) % 2) ? kerbRed : kerbWhite;
    const seg = [i, i + 1];
    bucket.push(ribbon(points, inside * HW, inside * (HW + 1.3), 0.055, seg));
    if (r < 120) bucket.push(ribbon(points, -inside * (HW + 1.3), -inside * HW, 0.055, seg));
  }
  if (kerbRed.length) group.add(new THREE.Mesh(mergeGeometries(kerbRed), mat(KERB_R, { roughness: 0.7 })));
  if (kerbWhite.length) group.add(new THREE.Mesh(mergeGeometries(kerbWhite), mat(KERB_W, { roughness: 0.7 })));

  // ---- BARRIERS --------------------------------------------------------
  //
  // Armco both sides, the whole way round, on posts. This is the "rails"
  // part and it is what stops a circuit looking like a road painted on a
  // field: there is always something defining the edge of the world.
  const railG = [], postG = [];
  const postBox = new THREE.BoxGeometry(0.14, 1.05, 0.14);
  for (const side of [1, -1]) {
    const off = side * barrierAt;
    railG.push(wall(points, off, 0.45, 0.95));
    railG.push(wall(points, off, 0.05, 0.35));
    for (let i = 0; i < n; i += 6) {
      const p = points[i], l = leftOf(p.h);
      const g = postBox.clone();
      g.translate(p.x + l[0] * off, 0.52, p.z + l[1] * off);
      postG.push(g);
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(railG),
    mat(ARMCO, { roughness: 0.42, metalness: 0.65, side: THREE.DoubleSide })));
  group.add(new THREE.Mesh(mergeGeometries(postG), mat(POST, { metalness: 0.4 })));

  // ---- CATCH FENCING ---------------------------------------------------
  // Above the barrier on the outside of every corner, which is where it
  // really goes, and it is most of the height and texture of a circuit.
  const fenceG = [], fpostG = [];
  const fpostBox = new THREE.BoxGeometry(0.12, 4.2, 0.12);
  for (let i = 0; i < n - 1; i++) {
    const c = points[i].curve;
    if (Math.abs(c) < 1 / 400 && !walls) continue;
    const outside = c > 0 ? -1 : 1;
    const off = outside * (barrierAt + 0.5);
    fenceG.push(wall(points, off, 1.0, 4.4, [i, i + 1]));
    if (i % 8 === 0) {
      const p = points[i], l = leftOf(p.h);
      const g = fpostBox.clone();
      g.translate(p.x + l[0] * off, 2.5, p.z + l[1] * off);
      fpostG.push(g);
    }
  }
  if (fenceG.length) {
    group.add(new THREE.Mesh(mergeGeometries(fenceG), new THREE.MeshStandardMaterial({
      color: 0x9fb0bd, transparent: true, opacity: 0.20, roughness: 0.5,
      metalness: 0.4, side: THREE.DoubleSide, depthWrite: false })));
    group.add(new THREE.Mesh(mergeGeometries(fpostG), mat(POST, { metalness: 0.4 })));
  }

  // ---- TYRE WALLS ------------------------------------------------------
  // Stacked at the outside of the slowest corners, where the real ones go.
  const tyres = [];
  for (let i = 0; i < n; i += 3) {
    const c = points[i].curve;
    if (Math.abs(c) < 1 / 90) continue;
    const outside = c > 0 ? -1 : 1;
    const p = points[i], l = leftOf(p.h);
    const off = outside * (barrierAt - 0.55);
    for (let s = 0; s < 2; s++) {
      tyres.push({ x: p.x + l[0] * off, y: 0.28 + s * 0.52, z: p.z + l[1] * off });
    }
  }
  if (tyres.length) {
    const tm = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.34, 0.34, 0.48, 8), mat(TYREW, { roughness: 1 }), tyres.length);
    const d = new THREE.Object3D();
    tyres.forEach((t, i) => { d.position.set(t.x, t.y, t.z); d.updateMatrix(); tm.setMatrixAt(i, d.matrix); });
    group.add(tm);
  }

  // ---- GRANDSTANDS -----------------------------------------------------
  const at = (dist) => points[Math.max(0, Math.min(n - 1, Math.round(dist / 2)))];
  for (const d of spec.stands || []) {
    const p = at(d);
    if (!p) continue;
    const l = leftOf(p.h);
    const off = barrierAt + 26;
    const st = grandstand(70, 14);
    st.position.set(p.x + l[0] * off, 0, p.z + l[1] * off);
    st.rotation.y = p.h + Math.PI / 2;
    group.add(st);
  }

  // ---- TREES, or buildings if it is a street circuit -------------------
  const density = { none: 0, light: 0.30, dense: 0.62, forest: 0.85 }[spec.trees || 'light'] || 0;
  if (spec.city) {
    // Monaco: blocks of flats right up against the barriers
    const blocks = [];
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < n; i += 14) {
      for (const side of [1, -1]) {
        if (rnd() > 0.55) continue;
        const p = points[i], l = leftOf(p.h);
        const off = side * (barrierAt + 14 + rnd() * 14);
        const h = 14 + rnd() * 26;
        const g = new THREE.BoxGeometry(10 + rnd() * 12, h, 10 + rnd() * 12);
        g.translate(p.x + l[0] * off, h / 2, p.z + l[1] * off);
        blocks.push(g);
      }
    }
    if (blocks.length) group.add(new THREE.Mesh(mergeGeometries(blocks), mat(0xc9c2b4, { roughness: 0.9 })));
  } else {
    // A tree used to be one cylinder and one cone, scattered evenly. Now
    // it is a stack of cones or a cluster of leaf blobs on a tapered
    // trunk, in six shapes, in clumps, with the crowns moving - and there
    // is grass and scrub underneath them, which is the part that actually
    // fills the gap between the barrier and the treeline.
    group.add(makeTrees(points, leftOf, barrierAt + 26, barrierAt + 130, heightAt,
      { density, seed: 23 }));
    group.add(makeBushes(points, leftOf, barrierAt + 13, barrierAt + 55, heightAt,
      { density: Math.max(0.3, density), seed: 77 }));
  }
  if (!spec.city) {
    group.add(makeGrass(points, leftOf, barrierAt + 1.5, barrierAt + 18, heightAt,
      { perSample: 14, step: 2, seed: 51 }));
  }

  // ---- START / FINISH --------------------------------------------------
  const s0 = points[0], sl = leftOf(s0.h);
  const startLine = new THREE.Mesh(ribbon(points, HW, -HW, 0.016, [2, 5]), mat(0xf2f2ee, { roughness: 0.6 }));
  group.add(startLine);

  // the gantry over the line
  const gantry = new THREE.Group();
  const beam = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 6, 0.7, 0.9), mat(0x2b2f36, { metalness: 0.4 }));
  beam.position.y = 7.0;
  gantry.add(beam);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7, 0.9), mat(0x2b2f36, { metalness: 0.4 }));
    leg.position.set(s * (spec.width / 2 + 2.6), 3.5, 0);
    gantry.add(leg);
  }
  // the five red lights
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a0000, emissive: 0x220000, flatShading: true }));
    l.position.set((i - 2) * 0.85, 6.3, 0.5);
    gantry.add(l);
  }
  const p6 = points[6];
  gantry.position.set(p6.x, 0, p6.z);
  gantry.rotation.y = p6.h;
  group.add(gantry);

  // ---- PIT WALL, along the start straight ------------------------------
  const pitEnd = Math.min(n - 2, 140);
  const pitWall = new THREE.Mesh(wall(points, HW + 3.0, 0.0, 1.15, [10, pitEnd]),
    mat(CONCRETE, { roughness: 0.9, side: THREE.DoubleSide }));
  group.add(pitWall);
  const pitBuild = new THREE.Mesh(wall(points, HW + 16, 0.0, 9.0, [10, pitEnd]),
    mat(0x6f7681, { roughness: 0.8, side: THREE.DoubleSide }));
  group.add(pitBuild);

  // ---- MARSHAL POSTS and distance boards --------------------------------
  const boards = [];
  for (let i = 20; i < n; i += 90) {
    const p = points[i], l = leftOf(p.h);
    const off = -(barrierAt + 1.2);
    const g = new THREE.BoxGeometry(0.08, 1.1, 1.6);
    g.translate(p.x + l[0] * off, 1.6, p.z + l[1] * off);
    boards.push(g);
  }
  if (boards.length) group.add(new THREE.Mesh(mergeGeometries(boards), mat(0xdadfe4, { roughness: 0.8 })));

  // ---- how the game asks questions of the track ------------------------
  //
  // A coarse grid of which samples are near which square of the world, so
  // "how far off line am I" is a handful of comparisons rather than three
  // thousand.
  const CELL = 40;
  const grid = new Map();
  const key = (x, z) => Math.floor(x / CELL) + ',' + Math.floor(z / CELL);
  points.forEach((p, i) => {
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const k = Math.floor(p.x / CELL) + dx + ',' + (Math.floor(p.z / CELL) + dz);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
  });

  // A ring of hazy ridges out past the fog, because distance in a game is
  // almost entirely a matter of having something at that distance.
  const mid = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const reach = Math.max(maxX - minX, maxZ - minZ) / 2;
  group.add(makeMountains(mid, { inner: reach + 2400, outer: reach + 4200 }));

  // The dome is returned rather than added to the track group, because it
  // has to follow the camera and main.js is what knows where that is.
  const sky = makeSky();
  group.add(sky);

  return {
    group, points, length, corners, halfWidth: HW, spec, sky, heightAt,
    /** the pose on the centre line a given distance round the lap */
    at(dist) {
      const i = Math.max(0, Math.min(n - 1, Math.round(((dist % length) + length) % length / 2)));
      return points[i];
    },
    /**
     * The nearest point on the centre line, and how far off it you are.
     * Used for lap timing, for knowing when a car has gone off, and for
     * putting it back on again.
     */
    nearest(x, z) {
      const cand = grid.get(key(x, z));
      let best = null, bestD = 1e18;
      const list = cand || points.map((_, i) => i);
      for (const i of list) {
        const p = points[i];
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) { bestD = d; best = p; }
      }
      return best ? { point: best, off: Math.sqrt(bestD), dist: best.dist } : null;
    },
  };
}
