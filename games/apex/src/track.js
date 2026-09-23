// =====================================================================
// APEX :: track.js - TURNING A CENTRE LINE INTO A CIRCUIT
// =====================================================================
//
// Everything here hangs off the centre line circuits.js produces: the
// asphalt, the kerbs, the runoff, the barriers, the pits, the stands and
// the trees are all offsets from it at some distance round the lap.
//
//   heading h  ->  forward = ( sin h, cos h )
//                  LEFT    = ( cos h, -sin h )
//
// ---------------------------------------------------------------------
// THE RULE THE FIRST VERSION BROKE: THE REST OF THE LAP IS THERE TOO
// ---------------------------------------------------------------------
// Liam: "there are buildings trees and barriers in the road". Every object
// was placed as an offset from the LOCAL centre line and knew nothing
// about the rest of the lap - so wherever the lap came back past itself (a
// hairpin, two parallel straights, a crossover) the barrier of one part
// stood in the middle of the asphalt of another, and the trees of one
// grew out of the other's racing line.
//
// Two things fix it, and everything below uses them:
//
//   THE BARRIER LINE IS A VORONOI EDGE. Walking out sideways from each
//   sample, the barrier goes where the point becomes closer to some OTHER
//   part of the lap than to this one - the halfway line between two roads
//   - or at the normal runoff width if nothing is nearer. Two roads side
//   by side end up with a barrier each, a metre apart, down the middle.
//
//   NOTHING IS PLACED WITHOUT ASKING EVERY ROAD. `inside(x, z, margin)`
//   checks a point against every centre line sample near it, with that
//   sample's own barrier offset, so a tree is refused if it would stand
//   inside ANY part of the circuit.
//
// "Other part of the lap" means far away by lap distance AND at the same
// height - which is what lets Suzuka's bridge pass over the road beneath
// without either one's barrier being pulled to the middle of the other.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';
import { centreline } from './circuits.js';
import { makeGround, makeGrass, makeTrees, makeBushes, makeSky, makeMountains, rng } from './scenery.js';
import * as TX from './textures.js';

const leftOf = (h) => [Math.cos(h), -Math.sin(h)];

// ---------------------------------------------------------------------
// materials
// ---------------------------------------------------------------------
function tex(t, rx = 1, ry = 1) {
  const c = t.clone();
  c.needsUpdate = true;
  c.repeat.set(rx, ry);
  return c;
}
const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.9, metalness: 0, ...o });

// ---------------------------------------------------------------------
// A GEOMETRY ACCUMULATOR
// Quads go in one at a time and come out as one BufferGeometry, so a whole
// lap of kerb is one draw call however many corners it has.
// ---------------------------------------------------------------------
class Mesh {
  constructor(colours = false) { this.pos = []; this.uv = []; this.col = colours ? [] : null; }
  /** a quad A B C D in order round its edge; faces up (or out) as given */
  quad(A, B, C, D, ua, ub, uc, ud, ca, cb, cc, cd) {
    this.pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    this.uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
    if (this.col) this.col.push(...ca, ...cb, ...cc, ...ca, ...cc, ...cd);
  }
  geometry() {
    if (!this.pos.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeVertexNormals();
    return g;
  }
  add(group, material, { shadow = true, cast = false } = {}) {
    const g = this.geometry();
    if (!g) return null;
    const m = new THREE.Mesh(g, material);
    m.receiveShadow = shadow; m.castShadow = cast;
    group.add(m);
    return m;
  }
}

/**
 * How far any point in the world is from the centre line - fast, and
 * deliberately pessimistic. Baked into a coarse grid for the hills, which
 * ask it tens of thousands of times; interpolating a distance field
 * overstates it between nodes, so a cell's worth is taken off.
 */
function distanceField(points, minX, maxX, minZ, maxZ, pad) {
  const CELL = 48;
  const x0 = minX - pad, z0 = minZ - pad;
  const nx = Math.ceil((maxX - minX + pad * 2) / CELL) + 1;
  const nz = Math.ceil((maxZ - minZ + pad * 2) / CELL) + 1;
  const px = [], pz = [];
  for (let i = 0; i < points.length; i += 3) { px.push(points[i].x); pz.push(points[i].z); }
  const f = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const z = z0 + j * CELL;
    for (let i = 0; i < nx; i++) {
      const x = x0 + i * CELL;
      let best = Infinity;
      for (let k = 0; k < px.length; k++) {
        const dx = px[k] - x, dz = pz[k] - z, d = dx * dx + dz * dz;
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

/** closed sliding minimum, then a closed box blur - never ends up above the raw value */
function minThenBlur(arr, minHalf, blurHalf) {
  const n = arr.length, m = new Float32Array(n), out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let v = Infinity;
    for (let k = -minHalf; k <= minHalf; k++) v = Math.min(v, arr[(i + k + n) % n]);
    m[i] = v;
  }
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -blurHalf; k <= blurHalf; k++) s += m[(i + k + n) % n];
    out[i] = s / (blurHalf * 2 + 1);
  }
  return out;
}

/** a grandstand, built facing +Z: rows climb away towards -Z */
function grandstand(len, rows) {
  const g = new THREE.Group();
  const rise = 0.52, depth = 0.85, H = rows * rise, D = rows * depth;
  const concrete = std({ map: tex(TX.concrete(), len / 6, 1), color: 0xcfd2d4 });
  const treads = new Mesh();
  for (let r = 0; r < rows; r++) {
    const y = 1.2 + r * rise, z = -r * depth;
    treads.quad([-len / 2, y, z], [len / 2, y, z], [len / 2, y, z - depth], [-len / 2, y, z - depth],
      [0, 0], [len / 6, 0], [len / 6, 0.2], [0, 0.2]);
    treads.quad([-len / 2, y - rise, z], [len / 2, y - rise, z], [len / 2, y, z], [-len / 2, y, z],
      [0, 0], [len / 6, 0], [len / 6, 0.4], [0, 0.4]);
  }
  treads.add(g, concrete);
  // THE CROWD is a picture laid up the rake, a hand's width above the seats.
  // At any distance a stand is ever seen from, rows of coloured shirts and
  // heads read as people, and it costs two triangles.
  const crowd = new Mesh();
  const lift = 0.35;
  crowd.quad([-len / 2, 1.2 + lift, 0], [len / 2, 1.2 + lift, 0],
    [len / 2, 1.2 + H - rise + lift, -D + depth], [-len / 2, 1.2 + H - rise + lift, -D + depth],
    [0, 0], [len / 12, 0], [len / 12, rows / 6], [0, rows / 6]);
  crowd.add(g, std({ map: tex(TX.crowd()), roughness: 1, side: THREE.DoubleSide }), { shadow: false });
  // front wall with advertising, back wall, ends
  const walls = new Mesh();
  walls.quad([-len / 2, 0, 0.02], [len / 2, 0, 0.02], [len / 2, 1.2, 0.02], [-len / 2, 1.2, 0.02], [0, 0], [len / 24, 0], [len / 24, 1], [0, 1]);
  walls.add(g, std({ map: tex(TX.adverts()), roughness: 0.6 }));
  const back = new Mesh();
  back.quad([len / 2, 0, -D], [-len / 2, 0, -D], [-len / 2, H + 1.2, -D], [len / 2, H + 1.2, -D], [0, 0], [len / 6, 0], [len / 6, 5], [0, 5]);
  for (const s of [-1, 1]) {
    back.quad([s * len / 2, 0, 0], [s * len / 2, 0, -D], [s * len / 2, H + 1.2, -D], [s * len / 2, 1.2, 0],
      [0, 0], [D / 6, 0], [D / 6, 5], [0, 1]);
  }
  back.add(g, std({ map: tex(TX.concrete()), color: 0xe2e4e6, side: THREE.DoubleSide }), { cast: true });
  // the roof, with a fascia of adverts along its front edge
  const roofY = H + 5.2;
  const roof = new THREE.Mesh(new THREE.BoxGeometry(len + 2, 0.5, D + 3), std({ color: 0xb9c0c8, roughness: 0.6, metalness: 0.2 }));
  roof.position.set(0, roofY, -D / 2 + 0.5);
  roof.castShadow = true;
  g.add(roof);
  const fascia = new Mesh();
  fascia.quad([-len / 2 - 1, roofY - 1.1, 2.02], [len / 2 + 1, roofY - 1.1, 2.02], [len / 2 + 1, roofY + 0.25, 2.02], [-len / 2 - 1, roofY + 0.25, 2.02],
    [0, 0], [(len + 2) / 24, 0], [(len + 2) / 24, 1], [0, 1]);
  fascia.add(g, std({ map: tex(TX.adverts()), roughness: 0.5, side: THREE.DoubleSide }));
  const colGeo = [];
  for (let x = -len / 2; x <= len / 2 + 0.1; x += len / 4) {
    const c = new THREE.BoxGeometry(0.4, roofY, 0.4);
    c.translate(x, roofY / 2, -D + 0.3);
    colGeo.push(c);
  }
  const cols = new THREE.Mesh(mergeGeometries(colGeo), std({ color: 0x50565e, metalness: 0.5, roughness: 0.5 }));
  g.add(cols);
  return { group: g, depth: D + 3 };
}

/** a block of flats with UVs in storeys and bays, so the windows are the right size */
function flats(w, h, d, x, z, rot, colour, out) {
  const c = Math.cos(rot), s = Math.sin(rot);
  const P = (lx, y, lz) => [x + lx * c + lz * s, y, z - lx * s + lz * c];
  const floors = h / 3.2;
  const col = [colour.r, colour.g, colour.b];
  const face = (a, b, width) => {
    out.walls.quad(P(a[0], 0, a[1]), P(b[0], 0, b[1]), P(b[0], h, b[1]), P(a[0], h, a[1]),
      [0, 0], [width / 4, 0], [width / 4, floors], [0, floors], col, col, col, col);
  };
  face([-w / 2, d / 2], [w / 2, d / 2], w);
  face([w / 2, d / 2], [w / 2, -d / 2], d);
  face([w / 2, -d / 2], [-w / 2, -d / 2], w);
  face([-w / 2, -d / 2], [-w / 2, d / 2], d);
  const r = [0.72, 0.42, 0.33];
  out.roofs.quad(P(-w / 2, h, d / 2), P(w / 2, h, d / 2), P(w / 2, h, -d / 2), P(-w / 2, h, -d / 2),
    [0, 0], [w / 6, 0], [w / 6, d / 6], [0, d / 6], r, r, r, r);
}

/**
 * Build the whole circuit.
 */
export function buildTrack(spec) {
  const C = centreline(spec, 2);
  const { points, length, corners, crossings } = C;
  const n = points.length, ds = C.spacing;
  const group = new THREE.Group();
  const HW = spec.width / 2;
  const walls = !!spec.walls;
  const STD = walls ? HW + 1.3 : HW + 18;
  const sampleAt = (dist) => (Math.round((((dist % length) + length) % length) / ds)) % n;
  const lapGap = (i, j) => { const d = Math.abs(i - j); return Math.min(d, n - d) * ds; };

  // ---- the spatial grid everything asks questions of --------------------
  const CELL = 40;
  const grid = new Map();
  const cellKey = (cx, cz) => cx * 73856093 ^ cz * 19349663;
  points.forEach((p, i) => {
    const k = cellKey(Math.floor(p.x / CELL), Math.floor(p.z / CELL));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  const around = (x, z, fn) => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const list = grid.get(cellKey(cx + a, cz + b));
      if (list) for (const i of list) fn(i);
    }
  };
  /** distance to the nearest OTHER part of the lap: far by lap distance, and at this height */
  const otherDist = (i, x, z) => {
    let best = Infinity;
    const yi = points[i].y;
    around(x, z, (j) => {
      if (lapGap(i, j) < 90 || Math.abs(points[j].y - yi) > 3) return;
      const d = Math.hypot(points[j].x - x, points[j].z - z);
      if (d < best) best = d;
    });
    return best;
  };

  // ---- the pits -------------------------------------------------------
  // On the inside of the start straight: the right for a clockwise lap.
  const pitSide = spec.pitSide || -1;

  // HOW MUCH STRAIGHT IS THERE? The pit road runs along the start straight
  // at an offset, and an offset line round a tight corner folds over
  // itself - at Spa a fixed 800 m of pit road ran its exit through La
  // Source, 244 m after the line. So it is fitted to each circuit: as far
  // back and forward from the line as the road stays gentler than a 120 m
  // radius, and the entry road, the walled lane and the exit road are
  // shared out of that. Monaco gets 300 m; Monza gets the full layout.
  const bendy = (d) => Math.abs(points[sampleAt(d)].curve) > 1 / 120;
  let fwdRoom = 0; while (fwdRoom < 520 && !bendy(fwdRoom)) fwdRoom += ds;
  let backRoom = 0; while (backRoom < 400 && !bendy(-backRoom)) backRoom += ds;
  const pitTo = Math.max(80, fwdRoom - 20), pitFrom = -Math.max(80, backRoom - 20);
  const pitSpan = pitTo - pitFrom;
  const roadIn = Math.max(55, Math.min(220, pitSpan * 0.26)), roadOut = Math.max(50, Math.min(180, pitSpan * 0.2));
  const wallFrom = pitFrom + roadIn, wallTo = pitTo - roadOut;
  const PIT_FROM = wallFrom - 40, PIT_TO = wallTo + 40;
  const pitT = new Float32Array(n);                  // 0 outside the pit lane, 1 in it, tapering at the ends
  for (let i = 0; i < n; i++) {
    let d = points[i].dist;
    if (d > length / 2) d -= length;
    if (d < PIT_FROM || d > PIT_TO) continue;
    pitT[i] = Math.min(1, (d - PIT_FROM) / 70, (PIT_TO - d) / 70);
  }

  // ---- THE PIT ROAD, DRIVEN FOR REAL --------------------------------------
  // Liam: "make pit stops physical". The lane used to sit behind an
  // unbroken pit wall and a car was carried through it. Now there is a road
  // in: it leaves the track edge before the line and curves out into
  // the fast lane, and the pit wall only starts once it has - so the wall
  // is between the lane and the track, never across the entry. The same at
  // the exit. Everything below is metres from the start line (negative
  // before it) and metres out from the centre line on the pit side.
  const PIT = {
    from: pitFrom, wallFrom, wallTo, to: pitTo,
    // the boxes: evenly down the lane, as far apart as it allows (17 m, or
    // down to 8 on a street circuit's short straight)
    // TWENTY-FOUR BOXES, not sixteen: the gap shrinks to fit whatever the
    // straight allows, down to six metres, which is about what Monaco's
    // pit lane really gives a car.
    boxFirst: wallFrom + 34, boxGap: Math.max(6, Math.min(17, (wallTo - wallFrom - 70) / 23)),
    wall: HW + 2.0,            // the track face of the pit wall; it is 0.35 m thick
    laneIn: HW + 2.4,          // the lane's inner edge, against the wall
    fast: HW + 5.4,            // the middle of the fast lane
    box: HW + 11.2,            // where a car stops, at its garage
    limit: 80 / 3.6,           // m/s, between the two white lines
    halfRoad: 3.2,             // half the width of the entry and exit roads
  };
  const pitRel = (dist) => (dist > length / 2 ? dist - length : dist);
  const ease = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  /** the middle of the pit road at d, as metres out from the centre line, or null off it */
  const pitCentre = (d) => {
    if (d < PIT.from || d > PIT.to) return null;
    if (d < PIT.wallFrom) return HW - 1.5 + (PIT.fast - HW + 1.5) * ease((d - PIT.from) / (PIT.wallFrom - PIT.from));
    if (d <= PIT.wallTo) return PIT.fast;
    return PIT.fast + (HW - 1.5 - PIT.fast) * ease((d - PIT.wallTo) / (PIT.to - PIT.wallTo));
  };
  const wallAt = new Uint8Array(n), pitRoad = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const d = pitRel(points[i].dist);
    if (d >= PIT.wallFrom && d <= PIT.wallTo) wallAt[i] = 1;
    else if (d >= PIT.from && d <= PIT.to) pitRoad[i] = 1;
  }

  // ---- BARRIER OFFSETS, per sample, per side ---------------------------
  const rawL = new Float32Array(n), rawR = new Float32Array(n);
  const limited = [new Uint8Array(n), new Uint8Array(n)];   // [left, right]: pulled in by another road
  for (let i = 0; i < n; i++) {
    const p = points[i], l = leftOf(p.h);
    for (const side of [1, -1]) {
      let lim = STD;
      // INSIDE A CORNER, never further out than the radius, or the ribbon
      // folds back over itself and draws a bow tie across the apex
      if (p.curve * side > 0) lim = Math.min(lim, Math.max(HW + 1.0, 0.9 / Math.abs(p.curve)));
      // raised roads have walls, not runoff
      if (p.y > 1.0) lim = Math.min(lim, HW + 2.2);
      // the pit wall is the barrier on the pit side
      if (side === pitSide && wallAt[i]) lim = Math.min(lim, PIT.wall);
      if (side === pitSide && pitRoad[i]) lim = Math.max(lim, pitCentre(pitRel(p.dist)) + PIT.halfRoad + 1.2);
      let hit = false;
      for (let o = HW + 1; o <= Math.max(lim, HW + 31) + 0.01; o += 1) {
        if (otherDist(i, p.x + l[0] * o * side, p.z + l[1] * o * side) < o) {
          if (o - 1.2 < lim) { lim = Math.max(HW + 1.0, o - 1.2); hit = true; }
          break;
        }
      }
      (side > 0 ? rawL : rawR)[i] = lim;
      limited[side > 0 ? 0 : 1][i] = hit ? 1 : 0;
    }
  }
  const barL = minThenBlur(rawL, 6, 3), barR = minThenBlur(rawR, 6, 3);
  // THE PIT LINES ARE EXACT. The blur above takes the minimum over twelve
  // metres either way, which dragged the start of the pit wall back across
  // the entry road and every car turning in hit it. On the pit side the
  // wall and the road edges are put back where they really are.
  {
    const bp = pitSide > 0 ? barL : barR;
    for (let i = 0; i < n; i++) {
      if (wallAt[i]) bp[i] = PIT.wall;
      else if (pitRoad[i]) bp[i] = Math.max(bp[i], pitCentre(pitRel(points[i].dist)) + PIT.halfRoad + 1.2);
    }
  }
  const bar = (i, side) => (side > 0 ? barL[i] : barR[i]);

  // ---- where a raised road is actually OVER another one -----------------
  // Its retaining walls must stop there, or they are a dam across the road
  // beneath. The span reaches past the lower road's barriers on both sides.
  const onSpan = new Uint8Array(n);
  for (const c of crossings) {
    const low = c.lower;
    const reach = Math.max(barL[low], barR[low]) + 4;
    c.span = reach / Math.max(0.35, Math.abs(Math.sin(c.angle)));
    const u0 = sampleAt(c.upperDist - c.span), count = Math.round(c.span * 2 / ds);
    for (let k = 0; k <= count; k++) onSpan[(u0 + k) % n] = 1;
  }

  // how far from the centre line things must keep - the barrier, or the
  // back of the pit building in the pits
  const keepOff = (i, side) => (side === pitSide && pitT[i] > 0 ? Math.max(bar(i, side), HW + 32) : bar(i, side));

  /** is this point inside ANY part of the circuit (plus a margin)? */
  const inside = (x, z, margin) => {
    let hit = false;
    around(x, z, (j) => {
      if (hit) return;
      const p = points[j];
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz);
      if (d > 36 + margin) return;
      const l = leftOf(p.h);
      const side = dx * l[0] + dz * l[1] >= 0 ? 1 : -1;
      if (d < keepOff(j, side) + margin) hit = true;
    });
    return hit;
  };

  // ---- the ground -------------------------------------------------------
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const pad = 1500;
  const distTo = distanceField(points, minX, maxX, minZ, maxZ, pad);
  const land = makeGround({ minX, maxX, minZ, maxZ }, distTo,
    { pad, city: !!spec.city, flat: 75, rise: 300, amp: 36,
      map: spec.city ? TX.concrete() : TX.grass(), tile: spec.city ? 6 : 7 });
  const heightAt = land.heightAt;
  group.add(land.mesh);

  // ---- surfaces, one sample at a time ------------------------------------
  const road = new Mesh(true), lines = new Mesh(), kerbs = new Mesh();
  const shoulder = new Mesh(), grassRun = new Mesh(), gravelRun = new Mesh(), pave = new Mesh();
  const armco = new Mesh(), parapet = new Mesh(), retaining = new Mesh(), advert = new Mesh();
  const fence = new Mesh(), tyres = new Mesh();

  // kerb and gravel zones, spread a little beyond the corner that asks for them
  const spread = (fn, back, ahead) => {
    const raw = points.map(fn), out = [new Uint8Array(n), new Uint8Array(n)];
    for (let i = 0; i < n; i++) for (let s = 0; s < 2; s++) {
      if (!raw[i][s]) continue;
      for (let k = -back; k <= ahead; k++) out[s][(i + k + n) % n] = 1;
    }
    return out;
  };
  // inside of anything tighter than 250 m, outside of anything tighter than 130
  const kerbZone = spread((p) => {
    const c = p.curve, r = 1 / Math.max(1e-6, Math.abs(c));
    return [(c > 0 && r < 250) || r < 130, (c < 0 && r < 250) || r < 130];
  }, 4, 6);
  // gravel on the outside of the slower corners, and further on past the exit where cars run wide
  const gravelZone = spread((p) => {
    const c = p.curve, r = 1 / Math.max(1e-6, Math.abs(c));
    return [c < 0 && r < 220, c > 0 && r < 220];
  }, 6, 30);

  const P3 = (p, l, off, y) => [p.x + l[0] * off, y, p.z + l[1] * off];
  const ROAD_COL = [0.9, 1.0, 0.82, 1.0, 0.9];         // rubbered in, lighter at the edges
  const ROAD_OFF = [HW, HW / 2, 0, -HW / 2, -HW];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = points[i], b = points[j];
    const la = leftOf(a.h), lb = leftOf(b.h);
    const va = a.dist / 8, vb = (j === 0 ? length : b.dist) / 8;

    // ---- asphalt: four strips across so the racing groove can be darker
    for (let k = 0; k < 4; k++) {
      const o0 = ROAD_OFF[k], o1 = ROAD_OFF[k + 1];
      const c0 = [ROAD_COL[k], ROAD_COL[k], ROAD_COL[k]], c1 = [ROAD_COL[k + 1], ROAD_COL[k + 1], ROAD_COL[k + 1]];
      road.quad(P3(a, la, o0, a.y), P3(a, la, o1, a.y), P3(b, lb, o1, b.y), P3(b, lb, o0, b.y),
        [o0 / 8, va], [o1 / 8, va], [o1 / 8, vb], [o0 / 8, vb], c0, c1, c1, c0);
    }
    // the white lines marking the track limits
    for (const s of [1, -1]) {
      const o0 = s * (HW - 0.05), o1 = s * (HW - 0.3);
      const A = P3(a, la, o0, a.y + 0.008), B = P3(a, la, o1, a.y + 0.008), Cc = P3(b, lb, o1, b.y + 0.008), D = P3(b, lb, o0, b.y + 0.008);
      if (s > 0) lines.quad(A, B, Cc, D, [0, 0], [1, 0], [1, 1], [0, 1]);
      else lines.quad(B, A, D, Cc, [0, 0], [1, 0], [1, 1], [0, 1]);
    }

    for (const side of [1, -1]) {
      const si = side > 0 ? 0 : 1;
      const barA = bar(i, side), barB = bar(j, side);
      // winding: build every strip from the road outward on the LEFT, and
      // mirror the vertex order on the right, so both face up
      const strip = (m, o0a, o1a, o0b, o1b, ya, yb, u0, u1, vs = 1) => {
        const A = P3(a, la, side * o0a, ya), B = P3(a, la, side * o1a, ya);
        const Cc = P3(b, lb, side * o1b, yb), D = P3(b, lb, side * o0b, yb);
        const vA = va * 8 / vs, vB = vb * 8 / vs;
        if (side > 0) m.quad(B, A, D, Cc, [u1, vA], [u0, vA], [u0, vB], [u1, vB]);
        else m.quad(A, B, Cc, D, [u0, vA], [u1, vA], [u1, vB], [u0, vB]);
      };
      const wallStrip = (m, offA, offB, y0a, y1a, y0b, y1b, period, vRepeat = 1) => {
        const A = P3(a, la, side * offA, y0a), B = P3(b, lb, side * offB, y0b);
        const Cc = P3(b, lb, side * offB, y1b), D = P3(a, la, side * offA, y1a);
        const uA = a.dist / period, uB = (j === 0 ? length : b.dist) / period;
        m.quad(A, B, Cc, D, [uA, 0], [uB, 0], [uB, vRepeat], [uA, vRepeat]);
      };

      let edge = HW;
      // ---- kerb: raised in the middle, flush at the track edge
      if (kerbZone[si][i] && kerbZone[si][j] && barA > HW + 1.9) {
        const w = 1.5;
        strip(kerbs, HW, HW + w * 0.5, HW, HW + w * 0.5, a.y + 0.012, b.y + 0.012, 0, 0.5, 3);
        strip(kerbs, HW + w * 0.5, HW + w, HW + w * 0.5, HW + w, a.y + 0.05, b.y + 0.05, 0.5, 1, 3);
        edge = HW + w;
      }
      // ---- beyond it, to the barrier
      const endA = barA + (limited[si][i] ? 0.2 : 0.6), endB = barB + (limited[si][j] ? 0.2 : 0.6);
      if (walls || a.y > 0.5 || (pitT[i] > 0 || pitRoad[i]) && side === pitSide) {
        strip(pave, edge, endA, edge, endB, a.y - 0.01, b.y - 0.01, 0, (endA - edge) / 8, 8);
      } else {
        const sh = Math.min(HW + 2.4, endA), shb = Math.min(HW + 2.4, endB);
        if (sh > edge) strip(shoulder, edge, sh, edge, shb, a.y - 0.015, b.y - 0.015, edge / 8, sh / 8, 8);
        const m = gravelZone[si][i] ? gravelRun : grassRun;
        const tile = m === gravelRun ? 4 : 7;
        if (endA > sh) strip(m, sh, endA, shb, endB, a.y - 0.03, b.y - 0.03, sh / tile, endA / tile, tile);
        // and a lip down to the ground past the barrier, where nothing else is there
        if (!limited[si][i] && !limited[si][j]) {
          strip(grassRun, endA, endA + 3, endB, endB + 3, a.y - 0.03, b.y - 0.03, endA / 7, (endA + 3) / 7, 7);
        }
      }

      // ---- the barrier itself
      if (walls && !(side === pitSide && wallAt[i]) && a.y <= 1.0) {
        // A STREET CIRCUIT'S BARRIER: armco bolted to a low concrete kerb.
        // Covering every metre of Monaco in adverts was a wall of noise;
        // the hoardings are kept for the start straight, where they belong.
        wallStrip(parapet, barA, barB, a.y, a.y + 0.45, b.y, b.y + 0.45, 6, 0.4);
        wallStrip(parapet, barA + 0.3, barB + 0.3, a.y, a.y + 0.45, b.y, b.y + 0.45, 6, 0.4);
        strip(parapet, barA, barA + 0.3, barB, barB + 0.3, a.y + 0.45, b.y + 0.45, 0, 0.05, 6);
        wallStrip(armco, barA + 0.05, barB + 0.05, a.y + 0.5, a.y + 1.0, b.y + 0.5, b.y + 1.0, 4);
        // and the debris fence above it, which is most of what makes a
        // street circuit look enclosed
        wallStrip(fence, barA + 0.2, barB + 0.2, a.y + 1.0, a.y + 3.6, b.y + 1.0, b.y + 3.6, 3, 1);
      } else if (walls || a.y > 1.0 || (side === pitSide && wallAt[i])) {
        // a concrete wall: two faces and a top, adverts on the pit wall
        const t = 0.35;
        wallStrip(side === pitSide && wallAt[i] ? advert : parapet, barA, barB, a.y, a.y + 1.1, b.y, b.y + 1.1, side === pitSide && wallAt[i] ? 24 : 6);
        wallStrip(parapet, barA + t, barB + t, a.y, a.y + 1.1, b.y, b.y + 1.1, 6);
        strip(parapet, barA, barA + t, barB, barB + t, a.y + 1.1, b.y + 1.1, 0, 0.06, 6);
      } else if (!(side === pitSide && wallAt[i])) {
        // armco: two rails on posts
        wallStrip(armco, barA, barB, a.y + 0.45, a.y + 0.95, b.y + 0.45, b.y + 0.95, 4);
        wallStrip(armco, barA, barB, a.y + 0.02, a.y + 0.40, b.y + 0.02, b.y + 0.40, 4);
      }
      // raised: a retaining wall down to the ground on the outside of the barrier
      if ((a.y > 0.3 || b.y > 0.3) && !onSpan[i]) {
        const gA = heightAt(a.x + la[0] * side * (barA + 0.4), a.z + la[1] * side * (barA + 0.4));
        const gB = heightAt(b.x + lb[0] * side * (barB + 0.4), b.z + lb[1] * side * (barB + 0.4));
        wallStrip(retaining, barA + 0.36, barB + 0.36, gA, a.y + 1.1, gB, b.y + 1.1, 6, 1);
      }
      // catch fencing on the outside of corners
      if (!walls && a.y < 1 && Math.abs(a.curve) > 1 / 500 && a.curve * side < 0 && !(side === pitSide && (wallAt[i] || pitRoad[i]))) {
        wallStrip(fence, barA + 0.25, barB + 0.25, a.y + 1.0, a.y + 4.0, b.y + 1.0, b.y + 4.0, 3, 1);
      }
      // tyre walls in front of the barrier at the slow ones
      if (!walls && Math.abs(a.curve) > 1 / 90 && a.curve * side < 0 && !limited[si][i] && barA > HW + 10) {
        wallStrip(tyres, barA - 1.2, barB - 1.2, a.y, a.y + 1.0, b.y, b.y + 1.0, 2, 1);
        strip(tyres, barA - 1.2, barA - 0.3, barB - 1.2, barB - 0.3, a.y + 1.0, b.y + 1.0, 0, 0.4, 2);
      }
    }
  }

  road.add(group, std({ name: 'wet', map: tex(TX.asphalt()), vertexColors: true, color: 0xd0d0d0, roughness: 0.92 }));
  lines.add(group, std({ name: 'wet', color: 0xf0f0ea, roughness: 0.6 }));
  kerbs.add(group, std({ name: 'wet', map: tex(TX.kerb()), roughness: 0.7 }));
  shoulder.add(group, std({ name: 'wet', map: tex(TX.asphalt()), color: 0xb4b4b0, roughness: 0.95 }));
  grassRun.add(group, std({ map: tex(TX.grass()), color: 0x5f8a45, roughness: 1 }));
  gravelRun.add(group, std({ map: tex(TX.gravel()), roughness: 1 }));
  pave.add(group, std({ name: 'wet', map: tex(TX.asphalt()), color: walls ? 0xa8a8a4 : 0xc4c4c0, roughness: 0.95 }));
  armco.add(group, std({ map: tex(TX.armco()), roughness: 0.4, metalness: 0.6, side: THREE.DoubleSide }), { cast: true });
  parapet.add(group, std({ map: tex(TX.concrete()), side: THREE.DoubleSide }), { cast: true });
  advert.add(group, std({ map: tex(TX.adverts()), roughness: 0.55, side: THREE.DoubleSide }), { cast: true });
  retaining.add(group, std({ map: tex(TX.concrete()), color: 0xb8b8b2, side: THREE.DoubleSide }));
  tyres.add(group, std({ map: tex(TX.tyreWall()), roughness: 1, side: THREE.DoubleSide }), { cast: true });
  const fenceMesh = fence.add(group, new THREE.MeshStandardMaterial({ color: 0xaab6c0, transparent: true, opacity: 0.18,
    roughness: 0.5, metalness: 0.5, side: THREE.DoubleSide, depthWrite: false }), { shadow: false });
  if (fenceMesh) fenceMesh.renderOrder = 1;

  // armco posts and fence posts, instanced
  {
    const posts = [];
    for (let i = 0; i < n; i += Math.max(1, Math.round(4 / ds))) {
      const p = points[i], l = leftOf(p.h);
      for (const side of [1, -1]) {
        if (p.y > 1.0 || (side === pitSide && wallAt[i])) continue;
        const o = side * (bar(i, side) + 0.12);
        posts.push([p.x + l[0] * o, p.y, p.z + l[1] * o, 1.0]);
        if ((walls || Math.abs(p.curve) > 1 / 500 && p.curve * side < 0) && i % Math.round(8 / ds) === 0) {
          const f = side * (bar(i, side) + 0.3);
          posts.push([p.x + l[0] * f, p.y, p.z + l[1] * f, 4.2]);
        }
      }
    }
    const geo = new THREE.BoxGeometry(0.12, 1, 0.12);
    geo.translate(0, 0.5, 0);
    const im = new THREE.InstancedMesh(geo, std({ color: 0x4a5058, metalness: 0.5, roughness: 0.5 }), posts.length);
    const d = new THREE.Object3D();
    posts.forEach(([x, y, z, h], k) => { d.position.set(x, y, z); d.scale.set(1, h, 1); d.updateMatrix(); im.setMatrixAt(k, d.matrix); });
    group.add(im);
  }

  // ---- THE BRIDGE --------------------------------------------------------
  // The raised road already has its walls. Where it passes over the road
  // beneath, the retaining walls would be a dam across that road, so over
  // the span they are replaced by a deck: an underside, two girders, and
  // piers either side of the lower road.
  {
    const deck = new Mesh(), piers = [];
    for (const c of crossings) {
      const low = c.lower;
      const u0 = sampleAt(c.upperDist - c.span), count = Math.round(c.span * 2 / ds);
      for (let k = 0; k < count; k++) {
        const i = (u0 + k) % n, j = (i + 1) % n, a = points[i], b = points[j];
        const la = leftOf(a.h), lb = leftOf(b.h);
        const wA = HW + 2.6, wB = HW + 2.6;
        // underside
        deck.quad(P3(a, la, -wA, a.y - 1.3), P3(a, la, wA, a.y - 1.3), P3(b, lb, wB, b.y - 1.3), P3(b, lb, -wB, b.y - 1.3),
          [0, 0], [1, 0], [1, 1], [0, 1]);
        for (const s of [1, -1]) {
          deck.quad(P3(a, la, s * wA, a.y - 1.3), P3(b, lb, s * wB, b.y - 1.3), P3(b, lb, s * wB, b.y + 0.02), P3(a, la, s * wA, a.y + 0.02),
            [a.dist / 6, 0], [b.dist / 6, 0], [b.dist / 6, 1], [a.dist / 6, 1]);
        }
        if (k % Math.round(10 / ds) === 0) {
          for (const s of [1, -1]) {
            const px = a.x + la[0] * s * (HW + 1.6), pz = a.z + la[1] * s * (HW + 1.6);
            // a pier only where it stands clear of the road below
            let clear = true;
            around(px, pz, (q) => {
              if (lapGap(q, low) < 120 && Math.hypot(points[q].x - px, points[q].z - pz) < HW + 4) clear = false;
            });
            if (clear) piers.push([px, pz, a.y - 1.3, a.h]);
          }
        }
      }
    }
    deck.add(group, std({ map: tex(TX.concrete()), color: 0xc4c4bd, side: THREE.DoubleSide }), { cast: true });
    if (piers.length) {
      const geo = new THREE.BoxGeometry(1.4, 1, 3.2);
      geo.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(geo, std({ map: tex(TX.concrete()), color: 0xb0b0aa }), piers.length);
      const d = new THREE.Object3D();
      piers.forEach(([x, z, top, h], k) => {
        const g0 = heightAt(x, z);
        d.position.set(x, g0, z); d.rotation.set(0, h, 0); d.scale.set(1, top - g0, 1); d.updateMatrix();
        im.setMatrixAt(k, d.matrix);
      });
      im.castShadow = true;
      group.add(im);
    }
  }

  // ---- START LINE, GRID, GANTRY ---------------------------------------------
  const paint = new Mesh();
  const mark = (dist, lat, w, l) => {
    // a painted rectangle `w` across and `l` long, centred `lat` left of the line, starting at `dist`
    const i = sampleAt(dist), p = points[i], lf = leftOf(p.h), f = [Math.sin(p.h), Math.cos(p.h)];
    const c = (a, b) => [p.x + lf[0] * a + f[0] * b, p.y + 0.01, p.z + lf[1] * a + f[1] * b];
    paint.quad(c(lat - w / 2, 0), c(lat + w / 2, 0), c(lat + w / 2, l), c(lat - w / 2, l), [0, 0], [1, 0], [1, 1], [0, 1]);
  };
  for (let x = -HW; x < HW - 0.01; x += 0.5) mark(0, x + 0.25, 0.5, 0.9);
  const gridSlots = [];
  for (let k = 0; k < 26; k++) {
    const dist = -10 - k * 8;
    const lat = (k % 2 ? -1 : 1) * HW * 0.42;
    mark(dist, lat, 2.4, 0.18);                         // the front bar of the box
    mark(dist - 1.3, lat - 1.11, 0.18, 1.3);            // and its two sides
    mark(dist - 1.3, lat + 1.11, 0.18, 1.3);
    const i = sampleAt(dist - 3.2), p = points[i], lf = leftOf(p.h);
    gridSlots.push({ x: p.x + lf[0] * lat, z: p.z + lf[1] * lat, h: p.h, dist: p.dist });
  }
  paint.add(group, std({ name: 'wet', color: 0xf2f2ee, roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -2 }));

  const gantry = new THREE.Group();
  const gm = std({ color: 0x2b2f36, metalness: 0.4, roughness: 0.5 });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(spec.width + 6, 1.1, 0.9), gm);
  beam.position.y = 7.2; beam.castShadow = true;
  gantry.add(beam);
  for (const s of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 7.2, 0.9), gm);
    leg.position.set(s * (spec.width / 2 + 2.6), 3.6, 0);
    gantry.add(leg);
  }
  const startLights = [];
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.12, 14),
      new THREE.MeshStandardMaterial({ color: 0x1a0000, emissive: 0x000000, emissiveIntensity: 3 }));
    l.rotation.x = Math.PI / 2;
    l.position.set((i - 2) * 0.9, 6.9, -0.5);
    gantry.add(l);
    startLights.push(l);
  }
  {
    const p0 = points[0];
    gantry.position.set(p0.x, p0.y, p0.z);
    gantry.rotation.y = p0.h;
  }
  group.add(gantry);

  // ---- THE PITS: lane, garages ----------------------------------------------
  {
    const lane = new Mesh(), front = new Mesh(), roof = new Mesh(), back = new Mesh(), laneLine = new Mesh();
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const a = points[i], b = points[j], la = leftOf(a.h), lb = leftOf(b.h), s = pitSide;
      if ((pitRoad[i] || wallAt[i]) && (pitRoad[j] || wallAt[j]) && !(wallAt[i] && wallAt[j])) {
        // the entry or exit road
        const ca = pitCentre(pitRel(a.dist)), cb = pitCentre(pitRel(b.dist));
        const va = a.dist / 8, vb = (j === 0 ? length : b.dist) / 8;
        const q2 = (m, o0a, o1a, o0b, o1b, dy, uv) => {
          const A = P3(a, la, s * o0a, a.y + dy), B = P3(a, la, s * o1a, a.y + dy), Cc = P3(b, lb, s * o1b, b.y + dy), D = P3(b, lb, s * o0b, b.y + dy);
          if (s > 0) m.quad(B, A, D, Cc, ...uv); else m.quad(A, B, Cc, D, ...uv);
        };
        const R = PIT.halfRoad;
        q2(lane, ca - R, ca + R, cb - R, cb + R, 0.004, [[(ca - R) / 8, va], [(ca + R) / 8, va], [(cb + R) / 8, vb], [(cb - R) / 8, vb]]);
        // white edges, so the way in reads from the cockpit
        for (const e of [-R, R]) q2(laneLine, ca + e - 0.1, ca + e + 0.1, cb + e - 0.1, cb + e + 0.1, 0.012, [[0, 0], [1, 0], [1, 1], [0, 1]]);
        continue;
      }
      if (pitT[i] <= 0 || pitT[j] <= 0 || !wallAt[i] || !wallAt[j]) continue;
      const inA = HW + 2.4, inB = HW + 2.4;
      const outA = HW + 2.4 + 11.5 * pitT[i], outB = HW + 2.4 + 11.5 * pitT[j];
      const q = (m, o0a, o1a, o0b, o1b, ya, yb, uv) => {
        const A = P3(a, la, s * o0a, ya), B = P3(a, la, s * o1a, ya), Cc = P3(b, lb, s * o1b, yb), D = P3(b, lb, s * o0b, yb);
        if (s > 0) m.quad(B, A, D, Cc, ...uv); else m.quad(A, B, Cc, D, ...uv);
      };
      const va = a.dist / 8, vb = (j === 0 ? length : b.dist) / 8;
      q(lane, inA, outA, inB, outB, a.y, b.y, [[inA / 8, va], [outA / 8, va], [outB / 8, vb], [inB / 8, vb]]);
      // the speed-limit lines across the lane, where the wall starts and ends
      for (const lineAt of [PIT.wallFrom, PIT.wallTo]) {
        const dA = pitRel(a.dist);
        if (dA <= lineAt && dA + ds > lineAt) q(laneLine, inA, outA, inB, outB, a.y + 0.012, b.y + 0.012, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      }
      q(laneLine, outA - 5.0, outA - 4.8, outB - 5.0, outB - 4.8, a.y + 0.01, b.y + 0.01, [[0, 0], [1, 0], [1, 1], [0, 1]]);
      // the building, only where there is room for it and it is fully in the pits
      if (pitT[i] > 0.99 && pitT[j] > 0.99) {
        const fx = HW + 14.5, bx = HW + 30;
        const clearHere = otherDist(i, a.x + la[0] * s * bx, a.z + la[1] * s * bx) > bx;
        if (clearHere) {
          const uA = a.dist / 8, uB = b.dist / 8;
          front.quad(P3(a, la, s * fx, a.y), P3(b, lb, s * fx, b.y), P3(b, lb, s * fx, b.y + 10), P3(a, la, s * fx, a.y + 10),
            [uA, 0], [uB, 0], [uB, 1], [uA, 1]);
          q(roof, fx - 1.5, bx, fx - 1.5, bx, a.y + 10, b.y + 10, [[0, 0], [1, 0], [1, 1], [0, 1]]);
          back.quad(P3(a, la, s * bx, a.y), P3(b, lb, s * bx, b.y), P3(b, lb, s * bx, b.y + 10), P3(a, la, s * bx, a.y + 10),
            [uA / 0.75, 0], [uB / 0.75, 0], [uB / 0.75, 8], [uA / 0.75, 8]);
        }
      }
    }
    lane.add(group, std({ name: 'wet', map: tex(TX.asphalt()), color: 0xbcbcbc, roughness: 0.9 }));
    laneLine.add(group, std({ name: 'wet', color: 0xf2f2ee }));
    front.add(group, std({ map: tex(TX.garages()), roughness: 0.6, side: THREE.DoubleSide }), { cast: true });
    roof.add(group, std({ color: 0x9aa0a6, roughness: 0.7, side: THREE.DoubleSide }), { cast: true });
    back.add(group, std({ map: tex(TX.concrete()), color: 0xd8dadc, side: THREE.DoubleSide }));
  }

  // ---- GRANDSTANDS --------------------------------------------------------
  const standSpots = [];
  for (const d of C.stands) {
    const i = sampleAt(d), p = points[i], l = leftOf(p.h);
    // the outside of the corner if there is one, else away from the pits
    let sides = p.curve > 1 / 800 ? [-1, 1] : p.curve < -1 / 800 ? [1, -1] : [-pitSide, pitSide];
    for (const side of sides) {
      const len = 60, off = keepOff(i, side) + 5;
      const st = grandstand(len, 14);
      const depthTo = off + st.depth;
      let ok = true;
      for (const t of [-0.5, 0, 0.5]) for (const o of [off, (off + depthTo) / 2, depthTo]) {
        const f = [Math.sin(p.h), Math.cos(p.h)];
        const x = p.x + l[0] * side * o + f[0] * t * len, z = p.z + l[1] * side * o + f[1] * t * len;
        if (inside(x, z, 1.5)) ok = false;
      }
      if (!ok) continue;
      st.group.position.set(p.x + l[0] * side * off, heightAt(p.x + l[0] * side * off, p.z + l[1] * side * off) + 0.3, p.z + l[1] * side * off);
      st.group.rotation.y = p.h + (side > 0 ? -Math.PI / 2 : Math.PI / 2);
      group.add(st.group);
      standSpots.push({ x: st.group.position.x, z: st.group.position.z, r: len * 0.6 });
      break;
    }
  }
  const nearStand = (x, z, m) => standSpots.some((s) => Math.hypot(s.x - x, s.z - z) < s.r + m);
  const keep = (x, z, margin) => !inside(x, z, margin) && !nearStand(x, z, margin);

  // ---- TREES, or buildings if it is a street circuit ------------------------
  const density = { none: 0, light: 0.30, dense: 0.62, forest: 0.85 }[spec.trees || 'light'] || 0;
  const outer = (extra) => (i, side) => keepOff(i, side) + extra;
  if (spec.city) {
    const out = { walls: new Mesh(true), roofs: new Mesh(true) };
    const placed = [];
    const r = rng(7);
    const palette = [0xf1d9a8, 0xe8c9a0, 0xf4e6c8, 0xdcb48c, 0xf0d0c0, 0xe6e0d0, 0xd9c2a0, 0xf6efe0].map((c) => new THREE.Color(c));
    // two rows deep: the frontage on the barrier, and taller blocks behind
    // it climbing the hill - one row left a car park of empty ground
    for (const row of [0, 1]) for (let i = 0; i < n; i += Math.round((row ? 18 : 12) / ds)) {
      const p = points[i], l = leftOf(p.h);
      for (const side of [1, -1]) {
        if (r() > (row ? 0.9 : 0.8)) continue;
        const w = 12 + r() * 14, d = 10 + r() * 12, h = row ? 24 + r() * 40 : 12 + r() * 30;
        const off = side * (keepOff(i, side) + (row ? 34 + r() * 22 : 5) + d / 2 + r() * 6);
        const x = p.x + l[0] * off, z = p.z + l[1] * off;
        const rot = p.h;
        const f = [Math.sin(rot), Math.cos(rot)];
        let ok = true;
        for (const [ax, az] of [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2], [0, 0]]) {
          const cx = x + ax * Math.cos(rot) + az * f[0], cz = z - ax * Math.sin(rot) + az * f[1];
          if (inside(cx, cz, 3)) { ok = false; break; }
        }
        if (!ok || nearStand(x, z, w)) continue;
        // and not into each other: two blocks at different angles sharing a
        // footprint is a pile of boxes, not a street
        const rad = Math.hypot(w, d) / 2;
        if (placed.some((q) => Math.hypot(q.x - x, q.z - z) < (q.r + rad) * 0.78)) continue;
        placed.push({ x, z, r: rad });
        flats(w, h, d, x, z, rot, palette[Math.floor(r() * palette.length)], out);
      }
    }
    out.walls.add(group, std({ map: tex(TX.facade()), vertexColors: true, roughness: 0.85 }), { cast: true });
    out.roofs.add(group, std({ vertexColors: true, roughness: 0.9 }));
  } else {
    group.add(makeTrees(points, leftOf, outer(12), outer(120), heightAt, { density, seed: 23, keep: (x, z) => keep(x, z, 7) }));
    group.add(makeBushes(points, leftOf, outer(4), outer(45), heightAt,
      { density: Math.max(0.3, density), seed: 77, keep: (x, z) => keep(x, z, 2.5) }));
    group.add(makeGrass(points, leftOf, outer(1.5), outer(18), heightAt,
      { perSample: 12, step: 2, seed: 51, keep: (x, z) => keep(x, z, 1.2) }));
  }

  // ---- distance hoardings before the big stops ------------------------------
  {
    const boards = new Mesh();
    for (const c of corners) {
      const i0 = sampleAt(c.at), p = points[i0];
      if (Math.abs(p.curve) < 1 / 120) continue;
      const side = p.curve > 0 ? -1 : 1;           // outside of the corner, facing the approach
      for (const back of [150, 100, 50]) {
        const i = sampleAt(c.at - back - 30), q = points[i], l = leftOf(q.h);
        const o = side * (keepOff(i, side) + 2.5);
        if (limited[side > 0 ? 0 : 1][i] || walls) continue;
        const x = q.x + l[0] * o, z = q.z + l[1] * o, f = [Math.sin(q.h), Math.cos(q.h)];
        if (inside(x, z, 0.5)) continue;
        const w = 1.6, y0 = q.y + 0.6, y1 = q.y + 2.0;
        const L = [x + l[0] * w / 2, z + l[1] * w / 2], R = [x - l[0] * w / 2, z - l[1] * w / 2];
        // one third of the texture each: three stripes, two, one
        const u0 = { 150: 0, 100: 1 / 3, 50: 2 / 3 }[back], u1 = u0 + 1 / 3;
        boards.quad([L[0], y0, L[1]], [R[0], y0, R[1]], [R[0], y1, R[1]], [L[0], y1, L[1]],
          [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      }
    }
    boards.add(group, std({ map: distanceBoards(), roughness: 0.6, side: THREE.DoubleSide }));
  }

  // ---- sky and mountains --------------------------------------------------
  const mid = { x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 };
  const reach = Math.max(maxX - minX, maxZ - minZ) / 2;
  group.add(makeMountains(mid, { inner: reach + 2400, outer: reach + 4200 }));
  const sky = makeSky();
  group.add(sky);

  return {
    group, points, length, corners, crossings, halfWidth: HW, spec, sky, heightAt, spacing: ds,
    barL, barR, gridSlots, startLights, pitSide,
    /** the pit road: where it is, and the questions a car in it asks */
    pit: {
      ...PIT, side: pitSide,
      rel: pitRel,
      centre: pitCentre,
      /** does the pit wall stand at sample i? */
      wallAt: (i) => wallAt[i] === 1,
      /** the far side of the lane at sample i: the garages */
      outer: (i) => HW + 2.4 + 11.5 * Math.max(0.3, pitT[i]),
      /** the world position and heading of a box, `at` metres from the line */
      boxPose(at, lat = PIT.box) {
        const p = points[sampleAt(at)], l = leftOf(p.h);
        return { x: p.x + l[0] * lat * pitSide, y: p.y, z: p.z + l[1] * lat * pitSide, h: p.h };
      },
    },
    /** the centre line sample a given distance round the lap */
    at(dist) { return points[sampleAt(dist)]; },
    index(dist) { return sampleAt(dist); },
    /**
     * Where a point is relative to the circuit. With a `hint` (the index
     * it was at last frame) it stays on the same PART of the lap - which is
     * the only way to know, at Suzuka's crossover, whether you are on the
     * bridge or under it: both are the same distance away in plan.
     */
    locate(x, z, hint = -1, y = null) {
      let best = -1, bestD = Infinity, near = -1, nearD = Infinity;
      around(x, z, (i) => {
        const p = points[i];
        // HEIGHT FIRST. A car under Suzuka's bridge, five metres off its
        // own centre line, is closer in plan to the centre line of the road
        // ABOVE it - and was put up there, 2.4 km further round the lap,
        // and flung into the bridge's walls. A car at ground level cannot
        // be on a road 7.5 m up, whatever the distances say.
        if (y !== null && Math.abs(p.y - y) > 3) return;
        const d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
        if (d < bestD) { bestD = d; best = i; }
        if (hint >= 0 && lapGap(i, hint) < 160 && d < nearD) { nearD = d; near = i; }
      });
      // The hint only breaks a TIE. Preferring it outright meant that fifty
      // metres before the bridge - where the road beneath is twenty-five
      // metres away and inside the hint's window - the car was put on the
      // lower road and drawn driving under its own bridge.
      if (near >= 0 && Math.sqrt(nearD) < Math.sqrt(bestD) + 4) best = near;
      if (best < 0) {
        for (let i = 0; i < n; i++) {
          const p = points[i], d = (p.x - x) * (p.x - x) + (p.z - z) * (p.z - z);
          if (d < bestD) { bestD = d; best = i; }
        }
      }
      const p = points[best], l = leftOf(p.h);
      const off = (x - p.x) * l[0] + (z - p.z) * l[1];
      return { i: best, point: p, off, dist: p.dist, y: p.y, grade: p.grade, barL: barL[best], barR: barR[best] };
    },
    /** kept for the older tools: nearest sample, unsigned distance off the line */
    nearest(x, z) {
      const r = this.locate(x, z);
      return { point: r.point, off: Math.abs(r.off), dist: r.dist, i: r.i };
    },
    inside,
    /**
     * What a wheel `lat` metres left of sample i is standing on.
     * Returns { grip, drag, kind }. Past the white line is still legal
     * ground to drive on - it is just slower - and past the kerb it is
     * grass or gravel unless the circuit is paved out to the wall.
     */
    surface(i, lat) {
      const a = Math.abs(lat), side = lat >= 0 ? 1 : -1, si = side > 0 ? 0 : 1;
      if (a <= HW) return SURF.asphalt;
      if (kerbZone[si][i] && a <= HW + 1.5) return SURF.kerb;
      if (side === pitSide && (pitRoad[i] || wallAt[i])) {
        const c = pitCentre(pitRel(points[i].dist));
        if (c !== null && Math.abs(a - c) <= PIT.halfRoad + 0.3) return SURF.asphalt;
        if (wallAt[i] && a > PIT.laneIn) return SURF.asphalt;
      }
      if (walls || points[i].y > 0.5 || (side === pitSide && pitT[i] > 0)) return SURF.paved;
      if (a <= HW + 2.4) return SURF.paved;
      return gravelZone[si][i] ? SURF.gravel : SURF.grass;
    },
    /** the lateral offset beyond which a wheel is over the white line */
    limit: HW,
  };
}

// grip is a multiplier on the tyre's own; drag is per second of speed lost
const SURF = {
  asphalt: { kind: 'asphalt', grip: 1.0, drag: 0 },
  kerb:    { kind: 'kerb',    grip: 0.96, drag: 0.02 },
  paved:   { kind: 'paved',   grip: 0.93, drag: 0.02 },
  grass:   { kind: 'grass',   grip: 0.55, drag: 0.35 },
  gravel:  { kind: 'gravel',  grip: 0.42, drag: 1.3 },
};

/** the 150 / 100 / 50 boards: one texture, three panels side by side */
function distanceBoards() {
  const c = document.createElement('canvas');
  c.width = 384; c.height = 128;
  const g = c.getContext('2d');
  for (let k = 0; k < 3; k++) {
    const x = k * 128;
    g.fillStyle = '#ffffff'; g.fillRect(x, 0, 128, 128);
    g.fillStyle = '#16181c'; g.fillRect(x + 4, 4, 120, 120);
    g.fillStyle = '#ffffff'; g.fillRect(x + 10, 10, 108, 108);
    g.fillStyle = '#16181c';
    const bars = 3 - k;
    for (let b = 0; b < bars; b++) {
      const bx = x + 64 + (b - (bars - 1) / 2) * 30 - 9;
      g.save(); g.translate(bx + 9, 64); g.transform(1, 0, -0.35, 1, 0, 0);
      g.fillRect(-9, -42, 18, 84); g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
