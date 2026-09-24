// =====================================================================
// NASCAR :: track.js - THE SPEEDWAY YOU CAN SEE
// =====================================================================
//
// oval.js decided the shape, the banking, the walls and the pit road as
// NUMBERS. This turns exactly those numbers into geometry, and it does
// not decide anything of its own - if the car drives over a bump that is
// not drawn, or under a wall that is not there, the bug is in one file
// and not in the join between two.
//
// THE BANKING IS REAL GEOMETRY. It would have been much easier to draw a
// flat ribbon and tilt the car on top of it, and it would have been wrong
// the moment you looked down the backstretch at a corner and saw a wall
// nine metres in the air with a flat road under it. Every quad of the
// racing surface takes its height from the same heightAt(i, lat) the
// physics uses, so the wall really is nine metres above the infield at
// Daytona, the apron really does fall away below you, and a car running
// the top really is looking down at the car running the bottom.
//
// Everything is built as ONE quad soup per material and merged, because a
// two-and-a-half-mile racetrack sampled every two metres is two thousand
// cross sections and nobody wants two thousand draw calls.
import * as THREE from '../vendor/three.module.js';
import * as TX from './textures.js';
import { grassBand, treeGeometry, canopyMaterial } from './flora.js';
import { buildDetail } from './detail.js';
import { Crowd, motorhomes, flags } from './crowd.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

const DEG = Math.PI / 180;
const leftOf = (h) => [Math.cos(h), -Math.sin(h)];

/** a heap of quads that becomes one mesh */
class Soup {
  constructor() { this.pos = []; this.uv = []; }
  /** four corners, anticlockwise seen from the front, with their uvs */
  quad(A, B, C, D, ua, ub, uc, ud) {
    this.pos.push(...A, ...B, ...C, ...A, ...C, ...D);
    this.uv.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
  }
  get count() { return this.pos.length / 3; }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  }
  add(group, material, { shadow = true, cast = false, name = '' } = {}) {
    if (!this.pos.length) return null;
    const m = new THREE.Mesh(this.geometry(), material);
    m.receiveShadow = shadow;
    m.castShadow = cast;
    m.name = name;
    group.add(m);
    return m;
  }
}

const std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.0, ...o });

/**
 * Build the whole speedway.
 * @param oval  a buildOval()
 */
export function buildTrack(oval) {
  const spec = oval.spec;
  const P = oval.points, n = P.length, ds = oval.spacing;
  const HW = oval.halfWidth, APRON = oval.apron;
  const group = new THREE.Group();
  group.name = 'speedway';

  // the world position of a point `lat` left of sample i, at its own height
  const at = (i, lat, lift = 0) => {
    const p = P[i], l = leftOf(p.h);
    return [p.x + l[0] * lat, oval.heightAt(i, lat) + lift, p.z + l[1] * lat];
  };
  const wrapI = (i) => (i + n) % n;

  // =====================================================================
  // THE RACING SURFACE, THE APRON AND THE SHOULDER
  // =====================================================================
  //
  // One ribbon, sampled across in stations. The station list is where the
  // cross section changes slope or material, plus enough in between that
  // the banking shades smoothly rather than as one big flat facet.
  const OUT = HW + spec.outerRun;                  // the base of the outside wall
  const IN = HW + APRON;                           // where the apron meets the infield
  const road = new Soup();
  const apron = new Soup();
  const infield = new Soup();

  const across = [];                               // stations across the racing surface
  const NA = 8;
  for (let k = 0; k <= NA; k++) across.push(-OUT + (IN + OUT) * k / NA);
  // make sure the edges of the racing surface and the apron are exact
  const stations = Array.from(new Set(across.concat([-OUT, -HW, 0, HW, IN]))).sort((a, b) => a - b);

  for (let i = 0; i < n; i++) {
    const j = wrapI(i + 1);
    const v0 = P[i].dist / 8, v1 = (P[i].dist + ds) / 8;
    for (let k = 0; k < stations.length - 1; k++) {
      const a = stations[k], b = stations[k + 1];
      const mid = (a + b) / 2;
      const soup = mid > IN ? infield : mid > HW ? apron : road;
      const u0 = a / 8, u1 = b / 8;
      soup.quad(at(i, a), at(j, a), at(j, b), at(i, b),
                [u0, v0], [u0, v1], [u1, v1], [u1, v0]);
    }
  }
  const surfaceTex = spec.concrete ? TX.concrete() : TX.asphalt();
  surfaceTex.repeat.set(1, 1);
  road.add(group, std({ map: surfaceTex, roughness: 0.94 }), { name: 'road' });
  apron.add(group, std({ map: TX.asphalt(), roughness: 0.95, color: 0x9aa0a6 }), { name: 'apron' });
  infield.add(group, std({ map: TX.grass(), roughness: 1.0 }), { name: 'infieldEdge' });

  // =====================================================================
  // THE GROOVE - where the rubber has gone down
  // =====================================================================
  //
  // A transparent strip laid a centimetre over the racing surface, three
  // and a half metres wide, sitting where the cars actually run: down at
  // the bottom in the corners, drifting out on the straights. It is drawn
  // as its own thing rather than painted into the asphalt because the
  // groove is not where the road is, it is where the RACING is.
  {
    const s = new Soup();
    const grooveLat = (i) => {
      const k = Math.abs(P[i].curve) * (1 / Math.max(1e-6, maxCurve));
      return HW - 1.9 - (1 - k) * 1.4;             // the bottom in the turns, wider out on the straights
    };
    let maxCurve = 0;
    for (const p of P) maxCurve = Math.max(maxCurve, Math.abs(p.curve));
    for (let i = 0; i < n; i++) {
      const j = wrapI(i + 1);
      const li = grooveLat(i), lj = grooveLat(j);
      const w = 1.9;
      const v0 = P[i].dist / 12, v1 = (P[i].dist + ds) / 12;
      s.quad(at(i, li - w, 0.012), at(j, lj - w, 0.012), at(j, lj + w, 0.012), at(i, li + w, 0.012),
             [0, v0], [0, v1], [1, v1], [1, v0]);
    }
    s.add(group, new THREE.MeshStandardMaterial({
      map: TX.groove(), transparent: true, depthWrite: false, roughness: 0.75,
      polygonOffset: true, polygonOffsetFactor: -2,
    }), { name: 'groove' });
  }

  // =====================================================================
  // THE WHITE LINES and the START/FINISH
  // =====================================================================
  {
    const s = new Soup();
    for (let i = 0; i < n; i++) {
      const j = wrapI(i + 1);
      for (const lat of [HW - 0.06, -HW + 0.06]) {
        s.quad(at(i, lat - 0.11, 0.015), at(j, lat - 0.11, 0.015), at(j, lat + 0.11, 0.015), at(i, lat + 0.11, 0.015),
               [0, 0], [0, 1], [1, 1], [1, 0]);
      }
    }
    s.add(group, new THREE.MeshStandardMaterial({
      color: 0xf0f2f4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -3,
    }), { name: 'lines' });
  }
  {
    // the chequered band, 1.2 m of it, right on the line
    const s = new Soup();
    const i0 = oval.index(-0.6), i1 = oval.index(0.6);
    const steps = Math.max(1, Math.round(1.2 / ds));
    for (let k = 0; k < steps; k++) {
      const i = wrapI(i0 + k), j = wrapI(i0 + k + 1);
      const v0 = k / steps, v1 = (k + 1) / steps;
      s.quad(at(i, -HW, 0.018), at(j, -HW, 0.018), at(j, IN, 0.018), at(i, IN, 0.018),
             [0, v0], [0, v1], [3, v1], [3, v0]);
    }
    s.add(group, new THREE.MeshStandardMaterial({
      map: TX.startLine(), roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -4,
    }), { name: 'startline' });
  }

  // =====================================================================
  // THE OUTSIDE WALL, and the catchfence on top of it
  // =====================================================================
  const WALL_H = 1.35, FENCE_H = 6.4;
  {
    const wallSoup = new Soup(), fenceSoup = new Soup(), capSoup = new Soup();
    for (let i = 0; i < n; i++) {
      const j = wrapI(i + 1);
      const a = at(i, -OUT), b = at(j, -OUT);
      const u0 = P[i].dist / 12, u1 = (P[i].dist + ds) / 12;
      // ...and the same thing running the other way, for the hoardings.
      // Facing the outside wall from the racing surface, the direction of
      // travel is to your LEFT, so text laid out along increasing lap
      // distance reads as a mirror image.
      const w0 = -u0, w1 = -u1;
      // the track face
      wallSoup.quad([a[0], a[1], a[2]], [b[0], b[1], b[2]],
                    [b[0], b[1] + WALL_H, b[2]], [a[0], a[1] + WALL_H, a[2]],
                    [w0, 0], [w1, 0], [w1, 1], [w0, 1]);
      // ...and its back, one wall thickness out, so it is solid from both sides
      const ao = at(i, -OUT - 0.6), bo = at(j, -OUT - 0.6);
      wallSoup.quad([bo[0], bo[1], bo[2]], [ao[0], ao[1], ao[2]],
                    [ao[0], ao[1] + WALL_H, ao[2]], [bo[0], bo[1] + WALL_H, bo[2]],
                    [w1, 0], [w0, 0], [w0, 1], [w1, 1]);
      // the cap
      capSoup.quad([a[0], a[1] + WALL_H, a[2]], [b[0], b[1] + WALL_H, b[2]],
                   [bo[0], bo[1] + WALL_H, bo[2]], [ao[0], ao[1] + WALL_H, ao[2]],
                   [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      // the catchfence, standing on the cap
      const fy0 = a[1] + WALL_H, fy1 = b[1] + WALL_H;
      fenceSoup.quad([a[0], fy0, a[2]], [b[0], fy1, b[2]],
                     [b[0], fy1 + FENCE_H, b[2]], [a[0], fy0 + FENCE_H, a[2]],
                     [u0 * 12, 0], [u1 * 12, 0], [u1 * 12, 13], [u0 * 12, 13]);
    }
    wallSoup.add(group, std({ map: TX.wall(), roughness: 0.8 }), { name: 'wall', cast: true });
    capSoup.add(group, std({ color: 0x9fa4aa, roughness: 0.85 }), { name: 'wallcap' });
    fenceSoup.add(group, new THREE.MeshStandardMaterial({
      map: TX.catchfence(), transparent: true, alphaTest: 0.25, side: THREE.DoubleSide,
      roughness: 0.6, metalness: 0.5,
    }), { name: 'catchfence', shadow: false });
  }

  // =====================================================================
  // THE INSIDE WALL, all the way round except where the pit road is
  // =====================================================================
  {
    const s = new Soup();
    const lat = IN + spec.innerRun;
    for (let i = 0; i < n; i++) {
      if (oval.pit.wallAt(i) || oval.pit.roadAt(i)) continue;
      const j = wrapI(i + 1);
      const a = at(i, lat), b = at(j, lat);
      const u0 = P[i].dist / 12, u1 = (P[i].dist + ds) / 12;
      s.quad([b[0], b[1], b[2]], [a[0], a[1], a[2]],
             [a[0], a[1] + 1.0, a[2]], [b[0], b[1] + 1.0, b[2]],
             [u1, 0.55], [u0, 0.55], [u0, 1], [u1, 1]);
    }
    s.add(group, std({ map: TX.wall(), roughness: 0.85 }), { name: 'innerwall', cast: true });
  }

  // =====================================================================
  // THE PIT ROAD
  // =====================================================================
  buildPits(oval, group, at, wrapI);

  // =====================================================================
  // THE GRANDSTANDS
  // =====================================================================
  const crowd = new Crowd();
  buildStands(oval, group, at, wrapI, WALL_H + FENCE_H, crowd);
  group.add(crowd.group);

  // =====================================================================
  // THE THOUSAND THINGS THAT MAKE IT A PLACE
  // =====================================================================
  // Liam: "lack of detial". detail.js is everything you would notice was
  // missing without ever being able to name it - the gantry, the pylon,
  // the tyre packs, the fence posts, the floodlights, the pit equipment.
  const detail = buildDetail(oval, group, at, wrapI, WALL_H, FENCE_H, crowd);

  // =====================================================================
  // THE INFIELD, and the world outside
  // =====================================================================
  {
    // a big flat disc of grass under everything, at infield level
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const p of P) {
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const reach = Math.max(maxX - minX, maxZ - minZ) * 3;
    const gTex = TX.grass();
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(reach, reach, 1, 1),
      std({ map: cloneRepeat(gTex, reach / 14, reach / 14), roughness: 1, color: 0xa8b49a }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(cx, -0.06, cz);
    ground.receiveShadow = true;
    group.add(ground);
    group.userData.centre = { x: cx, z: cz, reach };

    // GRASS WITH BLADES IN IT, but only on the two strips a driver
    // actually looks at: the verge just inside the apron, which is the
    // edge of the world in every corner, and the strip between the
    // racing surface and the pit wall down the front stretch. The other
    // quarter of a square mile of infield keeps its textured plane,
    // because at two hundred metres nothing else would read differently.
    //
    // 21,000 tufts of three blades: 189,000 triangles in two draw
    // calls, about seven per cent of the frame.
    //
    // The band stops at IN + 2.7 because the PIT WALL stands at
    // IN + 3.0 and the pit lane behind it: a band six metres wide put
    // tufts of grass straight through the wall and out across the
    // painted boxes, which is a thing you notice immediately.
    const grass = [
      grassBand(oval, at, IN + 0.10, IN + 1.40, 14000, 4021),
      grassBand(oval, at, IN + 1.40, IN + 2.70, 7000, 991),
    ];
    for (const gr of grass) group.add(gr);
    group.userData.grass = grass;

    // the infield lake every speedway seems to have, the trees, and the
    // small town of motorhomes that lives in there on a race weekend
    group.add(infieldFeatures(oval, cx, cz));
    group.add(buildCamp(oval, cx, cz));
  }

  // the sky belongs to sky.js, which also lights everything - a speedway
  // does not get to have its own
  return { group, oval, crowd, detail };
}

function cloneRepeat(tex, u, v) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(u, v);
  return t;
}

// =====================================================================
// THE PIT ROAD
// =====================================================================
//
// A flat road on the inside of the frontstretch, a wall between it and
// the racing surface, forty painted boxes and a garage block behind. It
// is drawn in the pit road's own coordinates - metres from the start
// line, metres left of the centre line - which are the same coordinates
// world.js keeps a car in the lane with.
function buildPits(oval, group, at, wrapI) {
  const P = oval.points, n = P.length, ds = oval.spacing;
  const PIT = oval.pit;
  const road = new Soup(), wall = new Soup(), cap = new Soup(), garage = new Soup();
  const boxes = [];

  const idxFor = (d) => oval.index(d);
  const from = idxFor(PIT.from), to = idxFor(PIT.to);
  const span = [];
  for (let k = 0; ; k++) {
    const i = wrapI(from + k);
    span.push(i);
    if (i === to || k > n) break;
  }

  for (let s = 0; s < span.length - 1; s++) {
    const i = span[s], j = span[s + 1];
    const di = PIT.rel(P[i].dist), dj = PIT.rel(P[j].dist);
    const ci = PIT.centre(di), cj = PIT.centre(dj);
    if (ci === null || cj === null) continue;
    const u0 = P[i].dist / 8, u1 = P[j].dist / 8;
    // the lane itself, from the wall out to the garages where there is a
    // wall, or just the road width where there is not
    const wallHere = PIT.wallAt(i) && PIT.wallAt(j);
    const inner = wallHere ? PIT.wall : ci - PIT.halfRoad;
    const outer = wallHere ? PIT.garage : ci + PIT.halfRoad;
    road.quad(at(i, inner, 0.02), at(j, inner, 0.02), at(j, outer, 0.02), at(i, outer, 0.02),
              [0, u0], [0, u1], [(outer - inner) / 8, u1], [(outer - inner) / 8, u0]);

    if (wallHere) {
      // the pit wall, solid from both faces
      const a = at(i, PIT.wall), b = at(j, PIT.wall);
      const ao = at(i, PIT.wall + 0.4), bo = at(j, PIT.wall + 0.4);
      const H = 1.05;
      wall.quad([b[0], b[1], b[2]], [a[0], a[1], a[2]], [a[0], a[1] + H, a[2]], [b[0], b[1] + H, b[2]],
                [u1 / 1.5, 0.55], [u0 / 1.5, 0.55], [u0 / 1.5, 1], [u1 / 1.5, 1]);
      // the garage side of the pit wall reads from the other direction,
      // so its U is negated rather than swapped - swapping it would run
      // the texture backwards inside each twelve-metre tile and chop the
      // words up, which is exactly what it did on the outside wall
      wall.quad([ao[0], ao[1], ao[2]], [bo[0], bo[1], bo[2]], [bo[0], bo[1] + H, bo[2]], [ao[0], ao[1] + H, ao[2]],
                [-u0 / 1.5, 0.55], [-u1 / 1.5, 0.55], [-u1 / 1.5, 1], [-u0 / 1.5, 1]);
      cap.quad([a[0], a[1] + H, a[2]], [b[0], b[1] + H, b[2]], [bo[0], bo[1] + H, bo[2]], [ao[0], ao[1] + H, ao[2]],
               [0, u0], [0, u1], [1, u1], [1, u0]);
      // the garage block behind the lane
      const gi = at(i, PIT.garage), gj = at(j, PIT.garage);
      const GH = 5.5;
      garage.quad([gj[0], gj[1], gj[2]], [gi[0], gi[1], gi[2]],
                  [gi[0], gi[1] + GH, gi[2]], [gj[0], gj[1] + GH, gj[2]],
                  [u1 / 3, 0], [u0 / 3, 0], [u0 / 3, 1], [u1 / 3, 1]);
    }
  }
  road.add(group, std({ map: TX.asphalt(), color: 0x8f9499, roughness: 0.93 }), { name: 'pitroad' });
  wall.add(group, std({ map: TX.wall(), roughness: 0.85 }), { name: 'pitwall', cast: true });
  cap.add(group, std({ color: 0xa8adb3, roughness: 0.85 }), { name: 'pitwallcap' });
  garage.add(group, std({ map: TX.garages(), roughness: 0.9 }), { name: 'garages', cast: true });

  // the painted boxes, one per stall
  const boxGroup = new THREE.Group();
  boxGroup.name = 'pitboxes';
  for (let k = 0; k < PIT.stalls; k++) {
    const pose = PIT.stallPose(k, PIT.box);
    const i = pose.i;
    const g = new Soup();
    const halfL = Math.min(5.0, PIT.boxGap * 0.44), halfW = 2.6;
    const d0 = pose.at - halfL, d1 = pose.at + halfL;
    const i0 = oval.index(d0), i1 = oval.index(d1);
    const steps = Math.max(1, Math.round((d1 - d0) / ds));
    for (let s = 0; s < steps; s++) {
      const a = wrapI(i0 + s), b = wrapI(i0 + s + 1);
      const v0 = s / steps, v1 = (s + 1) / steps;
      g.quad(at(a, PIT.box - halfW, 0.03), at(b, PIT.box - halfW, 0.03),
             at(b, PIT.box + halfW, 0.03), at(a, PIT.box + halfW, 0.03),
             [0, v0], [0, v1], [1, v1], [1, v0]);
    }
    g.add(boxGroup, new THREE.MeshStandardMaterial({
      map: TX.pitBox(k + 1, '#f2c200'), roughness: 0.88,
      polygonOffset: true, polygonOffsetFactor: -3,
    }), { name: 'box' + k });
  }
  group.add(boxGroup);
  group.userData.pitBoxes = boxGroup;
}

/**
 * YOUR BOX.
 *
 * Liam: "there is no pit crew in you lane for the nascar and their is no
 * way to actually get car fixed".
 *
 * Both halves of that are one thing. The pit road is forty identical
 * yellow rectangles with a number painted flat on the tarmac, which you
 * are reading at fifty-five miles an hour from a car whose nose is in the
 * way - and the crew only exist once you have STOPPED on the right one.
 * Miss it and there is no crew, no fuel, no tyres and no repair, and
 * nothing anywhere tells you that you missed it or by how much. The stop
 * was not broken; it was unfindable.
 *
 * So the player's stall gets what a real team gives its driver: the box
 * repainted in a colour nobody else has, and a BOARD ON A POLE above it,
 * which is the thing you actually look for down a pit lane because it is
 * the only part of a pit box that is not lying flat on the floor.
 */
export function markPitStall(group, oval, k, number) {
  const PIT = oval.pit;
  const old = group.getObjectByName('yourbox');
  if (old) {
    group.remove(old);
    old.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }
  const mark = new THREE.Group();
  mark.name = 'yourbox';
  const pose = PIT.stallPose(k, PIT.box);

  // the box itself, repainted. Sitting a little higher than the yellow one
  // so it wins the depth fight rather than flickering through it.
  {
    const halfL = Math.min(5.0, PIT.boxGap * 0.44), halfW = 2.6;
    const steps = 10;
    const geo = [];
    for (let i = 0; i < steps; i++) {
      const d0 = pose.at - halfL + (2 * halfL * i) / steps;
      const d1 = pose.at - halfL + (2 * halfL * (i + 1)) / steps;
      const p0i = oval.pos(d0, PIT.box - halfW), p0o = oval.pos(d0, PIT.box + halfW);
      const p1i = oval.pos(d1, PIT.box - halfW), p1o = oval.pos(d1, PIT.box + halfW);
      const g = new THREE.BufferGeometry();
      const v0 = i / steps, v1 = (i + 1) / steps;
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        p0i.x, p0i.y + 0.045, p0i.z, p1i.x, p1i.y + 0.045, p1i.z, p1o.x, p1o.y + 0.045, p1o.z,
        p0i.x, p0i.y + 0.045, p0i.z, p1o.x, p1o.y + 0.045, p1o.z, p0o.x, p0o.y + 0.045, p0o.z,
      ], 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute([
        0, v0, 0, v1, 1, v1, 0, v0, 1, v1, 1, v0,
      ], 2));
      g.computeVertexNormals();
      geo.push(g);
    }
    const merged = mergeGeometries(geo);
    for (const g of geo) g.dispose();
    mark.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({
      map: TX.pitBox(number, '#3ddcff'), roughness: 0.86,
      polygonOffset: true, polygonOffsetFactor: -6,
    })));
  }

  // THE BOARD. On the wall side, up where a windscreen can see it, with
  // the car number on both faces because you come past it one way and
  // leave the other.
  {
    const q = oval.pos(pose.at, PIT.box + 5.6);
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 3.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x20242b, roughness: 0.7, metalness: 0.4 }),
    );
    post.position.set(q.x, q.y + 1.55, q.z);
    post.castShadow = true;
    mark.add(post);
    const board = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.05),
      new THREE.MeshStandardMaterial({ map: TX.pitBox(number, '#3ddcff'), roughness: 0.7,
        emissive: 0x0a2630, emissiveIntensity: 0.6, side: THREE.DoubleSide }),
    );
    board.position.set(q.x, q.y + 3.0, q.z);
    board.rotation.y = q.h + Math.PI / 2;
    board.castShadow = true;
    mark.add(board);
  }
  group.add(mark);
  return mark;
}

// =====================================================================
// THE GRANDSTANDS
// =====================================================================
//
// A raked bank of seating outside the catchfence along the frontstretch,
// plus smaller stands round the outside of the turns. Each is built as a
// flight of steps - a riser and a tread per row - with the crowd texture
// mapped so that one row of seats is one row of pixels.
function buildStands(oval, group, at, wrapI, fenceTop, crowd) {
  const P = oval.points, n = P.length, ds = oval.spacing;
  const spec = oval.spec, HW = oval.halfWidth;
  const OUT = HW + spec.outerRun;
  const G = spec.grandstand || { from: -600, to: 400, rows: 40, height: 30 };
  const steps = new Soup(), fronts = new Soup(), roof = new Soup(), back = new Soup();
  const seats = [];
  // its own generator, seeded, so a track builds the same stand twice and
  // the empty seats do not move when anything else in here changes
  let seatSeed = 20773;
  const seatRnd = () => (seatSeed = (Math.imul(seatSeed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;

  // `depth` and not `back`: the parameter used to be called back and it
  // shadowed the Soup of the same name, so the stands' back wall tried to
  // call quad() on a number and the whole speedway failed to build.
  const section = (dFrom, dTo, rows, height, depth) => {
    const i0 = oval.index(dFrom), i1 = oval.index(dTo);
    const count = Math.max(2, Math.round(((dTo - dFrom) + oval.length) % oval.length / ds));
    const rise = height / rows, run = depth / rows;
    for (let s = 0; s < count; s++) {
      const i = wrapI(i0 + s), j = wrapI(i0 + s + 1);
      const u0 = P[i].dist / 9, u1 = P[j].dist / 9;
      const base = oval.heightAt(i, -OUT);
      for (let r = 0; r < rows; r++) {
        const lat0 = -OUT - 3.5 - r * run, lat1 = lat0 - run;
        const y0 = base + 1.2 + r * rise, y1 = y0 + rise;
        const a = at(i, lat0), b = at(j, lat0), c = at(j, lat1), d = at(i, lat1);
        // THE CROWD GOES ON THE RISERS, not on the treads. From the racing
        // surface you are looking at a raked bank almost edge on, so what
        // fills your eye is the VERTICAL face of each row - the people -
        // and the horizontal tread between them is barely a line. Putting
        // the crowd on the treads made every grandstand at every speedway
        // read as one flat grey slab of concrete.
        // ---- AND PUT PEOPLE ON IT ----------------------------------
        // Every third row, every other sample, two across: about fifteen
        // thousand real bodies across the speedway. The rows in between
        // are carried by the crowd texture on the riser behind them,
        // which at sixty metres through a catch fence is indistinguishable
        // and costs nothing.
        if (crowd && r % 2 === 1) {
          const mid = at(i, (lat0 + lat1) / 2);
          for (let q = -2; q <= 2; q += 2) {
            // AN EMPTY SEAT HERE AND THERE. Three people at exactly the
            // same spacing on every other row of every section is a
            // lattice, and the eye finds a lattice instantly however good
            // the individual figure is. One in eleven left empty, plus the
            // jitter below, is enough to break the grid without the stand
            // looking like it failed to sell out.
            if (seatRnd() < 0.09) continue;
            const along = (seatRnd() - 0.5) * 0.30;     // shuffle along the row
            const across = (seatRnd() - 0.5) * 0.22;    // and forward in the seat
            seats.push({
              x: mid[0] + Math.sin(P[i].h) * (q * 0.33 + along) + Math.cos(P[i].h) * across,
              y: y1 + 0.02,
              z: mid[2] + Math.cos(P[i].h) * (q * 0.33 + along) - Math.sin(P[i].h) * across,
              // FACING THE TRACK. The person geometry looks down +Z, and
              // rotating by h - 90 turns it to -leftOf(h), which from
              // outside the wall is straight at the racing surface. With
              // +90 the entire grandstand sat watching the car park.
              h: P[i].h - Math.PI / 2,
            });
          }
        }
        const cv = (r % 10) / 10;
        fronts.quad([a[0], y0, a[2]], [b[0], y0, b[2]], [b[0], y1, b[2]], [a[0], y1, a[2]],
                    [u0, cv], [u1, cv], [u1, cv + 0.1], [u0, cv + 0.1]);
        steps.quad([a[0], y1, a[2]], [b[0], y1, b[2]], [c[0], y1, c[2]], [d[0], y1, d[2]],
                   [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      }
      // A ROOF OVER THE BACK HALF, and only the back half - a real stand
      // has open seating at the front. It is drawn from both sides because
      // the people underneath can see it, and it is lit rather than left
      // black: a forty-metre slab of pure black hanging over the
      // frontstretch was the first thing you saw in every screenshot.
      const rl = -OUT - 3.5 - rows * run;
      const ry = base + 1.2 + rows * rise + 3.2;
      const a = at(i, -OUT - 3.5 - rows * run * 0.52), b = at(j, -OUT - 3.5 - rows * run * 0.52);
      const c = at(j, rl - 3), d = at(i, rl - 3);
      roof.quad([a[0], ry, a[2]], [b[0], ry, b[2]], [c[0], ry, c[2]], [d[0], ry, d[2]],
                [u0, 0], [u1, 0], [u1, 1], [u0, 1]);
      // ...and a back wall, so the stand is a building and not a sheet
      const bw0 = at(i, rl - 3), bw1 = at(j, rl - 3);
      const byTop = ry, byBot = base + 1.2;
      back.quad([bw1[0], byBot, bw1[2]], [bw0[0], byBot, bw0[2]],
                [bw0[0], byTop, bw0[2]], [bw1[0], byTop, bw1[2]],
                [u1, 0], [u0, 0], [u0, 1], [u1, 1]);
    }
  };

  section(G.from, G.to, G.rows, G.height, G.rows * 0.9);
  // smaller stands round the outside of both corners, where the sight
  // lines are - every speedway has them and they are most of what you see
  // when you are in the middle of a corner
  const L = oval.length;
  // WHERE THE ROAD ACTUALLY BENDS, not at fixed fractions of the lap. The
  // first version put them at 26-40% and 60-74%, which at Daytona is the
  // backstretch - so the corners were empty and there was a grandstand in
  // the middle of a straight.
  const corners = [];
  {
    let run = null;
    for (let i = 0; i < P.length; i++) {
      const bend = Math.abs(P[i].curve) > 0.5 / Math.max(120, 1 / Math.max(1e-9, maxCurveOf(P)));
      if (bend && !run) run = { from: P[i].dist };
      if (!bend && run) { run.to = P[i].dist; if (run.to - run.from > oval.length * 0.06) corners.push(run); run = null; }
    }
    if (run) { run.to = oval.length; if (run.to - run.from > oval.length * 0.06) corners.push(run); }
  }
  for (const c of corners) {
    // ...and only the part of the corner that is not already behind the
    // main stand
    const from = c.from + (c.to - c.from) * 0.12, to = c.to - (c.to - c.from) * 0.12;
    section(from, to, Math.round(G.rows * 0.45), G.height * 0.5, G.rows * 0.42);
  }

  if (crowd && seats.length) crowd.fill(seats, { name: 'spectators' });
  steps.add(group, std({ color: 0x585e66, roughness: 0.95, side: THREE.DoubleSide }), { name: 'standtreads' });
  fronts.add(group, std({ map: TX.crowd(), roughness: 0.95, side: THREE.DoubleSide }), { name: 'crowd' });
  // A ROOF THAT IS NOT A BLACK SLAB. It is a big flat plane forty metres
  // up with its normal pointing at the sky, so from the racing surface you
  // are looking at its unlit underside - physically correct and visually
  // a hole punched in the picture. A grey underside and enough emissive to
  // stand for the light bouncing off the crowd below it fixes it without
  // pretending the sun is underneath.
  roof.add(group, std({ color: 0x9aa1a9, roughness: 0.82, side: THREE.DoubleSide,
    emissive: 0x3c434c, emissiveIntensity: 1 }), { name: 'standroof', cast: true });
  back.add(group, std({ color: 0x8c939b, roughness: 0.9, side: THREE.DoubleSide }), { name: 'standback' });
}

// =====================================================================
// THE INFIELD
// =====================================================================
//
// A lake, a row of haulers and a scattering of trees, because the middle
// of a superspeedway is not an empty green disc and the eye notices.
function infieldFeatures(oval, cx, cz) {
  const g = new THREE.Group();
  g.name = 'infield';
  const P = oval.points;
  const inside = (x, z, margin) => {
    // far enough from every part of the racetrack to build on
    let best = Infinity;
    for (let i = 0; i < P.length; i += 4) {
      const d = Math.hypot(P[i].x - x, P[i].z - z);
      if (d < best) best = d;
    }
    return best > margin;
  };

  // the lake
  const scale = Math.min(140, oval.length * 0.045);
  const lakeGeo = new THREE.CircleGeometry(1, 28);
  // scaled and turned in the GEOMETRY, not on the mesh: rotating the mesh
  // first turns its local axes with it, so scaling y after that stretches
  // the lake vertically into the sky and leaves a thin white ellipse
  lakeGeo.scale(scale, scale * 0.62, 1);
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, new THREE.MeshStandardMaterial({
    color: 0x2c5b6e, roughness: 0.16, metalness: 0.2, side: THREE.DoubleSide,
  }));
  lake.position.set(cx + scale * 0.2, 0.03, cz);
  lake.receiveShadow = true;
  g.add(lake);

  // haulers, parked in rows in the middle
  const haulGeo = new THREE.BoxGeometry(2.6, 4.1, 21);
  const haulMat = new THREE.MeshStandardMaterial({ color: 0xd8dade, roughness: 0.55, metalness: 0.15 });
  const haulers = new THREE.InstancedMesh(haulGeo, haulMat, 24);
  haulers.castShadow = true;
  const dummy = new THREE.Object3D();
  let placed = 0;
  for (let r = 0; r < 2 && placed < 24; r++) {
    for (let k = 0; k < 12 && placed < 24; k++) {
      const x = cx - scale * 1.4 + r * 4.0, z = cz - 130 + k * 24;
      if (!inside(x, z, 55)) continue;
      dummy.position.set(x, 2.05, z);
      dummy.rotation.y = 0;
      dummy.updateMatrix();
      haulers.setMatrixAt(placed++, dummy.matrix);
    }
  }
  haulers.count = placed;
  if (placed) g.add(haulers);

  // TREES, outside the racetrack, where there is room. Four overlapping
  // clumps each rather than one icosahedron, because the thing that says
  // "tree" at two hundred metres is a ragged outline, and a single
  // twenty-triangle ball has the most regular outline there is.
  const { trunk, canopy: crown } = treeGeometry();
  const treeMat = canopyMaterial();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2a, roughness: 1, flatShading: true });
  const N = 260;
  const crowns = new THREE.InstancedMesh(crown, treeMat, N);
  const trunks = new THREE.InstancedMesh(trunk, trunkMat, N);
  crowns.castShadow = true;
  let t = 0;
  let seed = 7;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  const reach = oval.length * 0.55;
  for (let k = 0; k < N * 16 && t < N; k++) {
    const a = rnd() * Math.PI * 2, rr = reach * (0.52 + rnd() * 1.0);
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    // they stand in belts rather than scattered evenly, which is what
    // the land round a speedway actually looks like from the banking
    if (Math.sin(x * 0.006) * Math.cos(z * 0.0075) < -0.25) continue;
    if (!inside(x, z, 120)) continue;
    dummy.position.set(x, 0, z);
    dummy.rotation.y = rnd() * 6.28;
    const s = 0.8 + rnd() * 1.1;
    dummy.scale.set(s, s * (0.85 + rnd() * 0.5), s);
    dummy.updateMatrix();
    crowns.setMatrixAt(t, dummy.matrix);
    trunks.setMatrixAt(t, dummy.matrix);
    t++;
  }
  crowns.count = trunks.count = t;
  if (t) { g.add(crowns); g.add(trunks); }
  crowns.frustumCulled = trunks.frustumCulled = false;
  return g;
}

/** the tightest the road ever bends, for deciding where the corners are */
function maxCurveOf(P) {
  let m = 0;
  for (const p of P) m = Math.max(m, Math.abs(p.curve));
  return m;
}


// =====================================================================
// THE INFIELD CAMP
// =====================================================================
//
// The Daytona infield is a town for a week: motorhomes parked nose to
// tail on the banks, awnings out, flags on poles, people on the roofs.
// It is what you look at down the backstretch, and an empty green field
// there is as wrong as an empty grandstand.
//
// The rows are laid out ALONG the racetrack rather than on a grid,
// because that is how people park: everybody wants to see the cars, so
// every rig points at the fence.
function buildCamp(oval, cx, cz) {
  const g = new THREE.Group();
  g.name = 'camp';
  const inner = oval.innerEdge + oval.spec.innerRun + 14;
  const poses = [], flagPoses = [];
  const rows = 3;
  for (let row = 0; row < rows; row++) {
    const lat = inner + 16 + row * 15;
    const step = 13.5;
    for (let d = 0; d < oval.length; d += step) {
      // skip the stretch the pit road and the garages are on
      const rel = oval.pit.rel(d);
      if (rel > oval.pit.from - 60 && rel < oval.pit.to + 60) continue;
      const q = oval.pos(d, lat);
      poses.push({ x: q.x, z: q.z, h: q.h + Math.PI / 2 });
      if ((poses.length % 7) === 0) flagPoses.push({ x: q.x, y: 0, z: q.z, h: q.h });
    }
  }
  g.add(motorhomes(poses));
  g.add(flags(flagPoses, [0xd93a2b, 0x1b3fa0, 0xf5d020, 0x0e7a54, 0xf2f4f7, 0x23262c]));
  return g;
}
