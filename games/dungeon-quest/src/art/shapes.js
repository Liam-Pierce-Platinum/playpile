// Low-poly primitive kit -- the Mario 64 body language.
//
// N64 characters were not boxes. They were tapered cylinders, low-segment
// spheres and rounded caps, smooth-shaded so 8 sides read as a curve. Every
// shape here keeps its segment count in that era's range.
import * as THREE from 'three';

/**
 * Hard segment cap. The N64 look is FACETED -- you should be able to count the
 * sides. Anything with more than six goes circular and soft, so every helper
 * clamps to this regardless of what the caller asks for.
 */
const HEX = 6;
const HEX_RINGS = 4;

/**
 * Everything is FLAT SHADED.
 *
 * This used to be the "organic" material, smooth-shaded so six sides read as a
 * curve -- which is the later, softer look. It is not the one we want: six
 * smooth-shaded sides read as a circle, and the whole game went blobby. Flat
 * shading makes you count the faces, which is the point.
 *
 * The name is kept because half the art files call it, and the distinction it
 * used to draw (organic vs hard) is no longer one we make.
 */
export function smooth(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, fog: true, flatShading: true, ...opts });
}

/** Flat-shaded material for hard surfaces -- plate armour, blades, stone. */
export function faceted(map, opts = {}) {
  return new THREE.MeshLambertMaterial({ map, fog: true, flatShading: true, ...opts });
}

/* ---------------- primitives ---------------- */

/**
 * Tapered cylinder. This is the workhorse: limbs, torsos, tree trunks.
 * 4 sides gives a tapered box, 6-8 gives the classic rounded-but-cheap look.
 */
export function tube(rTop, rBot, len, material, segs = HEX, pos = [0, 0, 0]) {
  const n = Math.min(segs, HEX);
  const g = new THREE.CylinderGeometry(rTop, rBot, len, n, 1, false);
  // Turn it half a segment so a FLAT FACE points at the camera instead of an
  // edge. A hexagon seen corner-on reads as a circle; seen face-on it reads as
  // a hexagon, and that is the entire difference between the two looks.
  g.rotateY(Math.PI / n);
  const m = new THREE.Mesh(g, material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/** Low-segment sphere: heads, joints, gloves, orbs. */
export function ball(r, material, wSegs = HEX, hSegs = HEX_RINGS, pos = [0, 0, 0]) {
  const n = Math.min(wSegs, HEX);
  const g = new THREE.SphereGeometry(r, n, Math.min(hSegs, HEX_RINGS));
  g.rotateY(Math.PI / n);              // flat face forward, same as the tube
  const m = new THREE.Mesh(g, material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/** Squashable sphere -- an egg, a snout, a shoulder pad. */
export function blob(r, material, scale = [1, 1, 1], wSegs = 8, hSegs = 6, pos = [0, 0, 0]) {
  const m = ball(r, material, wSegs, hSegs, pos);
  m.scale.set(scale[0], scale[1], scale[2]);
  return m;
}

/** Cone: hats, spikes, tree tiers, arrowheads. */
export function cone(r, len, material, segs = HEX, pos = [0, 0, 0]) {
  const n = Math.min(segs, HEX);
  const g = new THREE.ConeGeometry(r, len, n);
  g.rotateY(Math.PI / n);
  const m = new THREE.Mesh(g, material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/** Plain box -- still right for blades, planks, crates and shield faces. */
export function slab(w, h, d, material, pos = [0, 0, 0]) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/**
 * A rounded limb segment: tapered tube with a ball at the joint end, so
 * elbows and knees do not show a seam when they bend.
 */
export function limbSegment(rTop, rBot, len, material, segs = 8) {
  const g = new THREE.Group();
  g.add(tube(rTop, rBot, len, material, segs, [0, -len / 2, 0]));
  g.add(ball(rTop * 1.02, material, segs, 4, [0, 0, 0]));
  return g;
}

/**
 * A shoe / foot: a squashed sphere stretched forward. Reads far better than a
 * box at low resolution because the toe catches the light.
 */
export function shoe(len, width, height, material, pos = [0, 0, 0]) {
  const g = new THREE.Group();
  const b = blob(width / 2, material, [1, height / width, len / width], 8, 5);
  b.position.set(0, 0, len * 0.18);
  g.add(b);
  g.position.set(pos[0], pos[1], pos[2]);
  return g;
}

/* ---------------- lathed profiles ---------------- */

/**
 * Revolve a 2D profile into a solid. Used for anything with a silhouette that
 * a stack of cylinders cannot express: potions, chalices, helmets, tree crowns.
 * @param profile array of [radius, y] pairs, bottom to top
 */
export function lathe(profile, material, segs = 8, pos = [0, 0, 0]) {
  const pts = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const n = Math.min(segs, HEX);
  const g = new THREE.LatheGeometry(pts, n);
  g.rotateY(Math.PI / n);
  const m = new THREE.Mesh(g, material);
  m.position.set(pos[0], pos[1], pos[2]);
  return m;
}

/* ---------------- terrain ---------------- */

/**
 * Displace a geometry's vertices by a function of their POSITION.
 *
 * This matters more than it sounds. A cylinder or a cone stores the cap ring
 * and the side ring as SEPARATE vertices sitting on top of each other; jitter
 * them with an ordinary random number and the two rings walk apart, and the
 * mesh tears open along the rim. Hashing the offset from the position means
 * co-located vertices always move together, so the surface stays closed.
 */
function displaceByPosition(geo, seed, fn) {
  const pos = geo.attributes.position;
  const hash = (x, y, z) => {
    // quantise first: two vertices "at the same place" differ in the last bits
    let h = seed >>> 0;
    h = Math.imul(h ^ Math.round(x * 512), 0x27d4eb2d) >>> 0;
    h = Math.imul(h ^ Math.round(y * 512), 0x165667b1) >>> 0;
    h = Math.imul(h ^ Math.round(z * 512), 0x9e3779b1) >>> 0;
    return h;
  };
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    let h = hash(x, y, z);
    const r = () => { h = Math.imul(h ^ (h >>> 15), 0x2545f491) >>> 0; return h / 4294967296; };
    const [nx, ny, nz] = fn(x, y, z, r);
    pos.setXYZ(i, nx, ny, nz);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * A low-poly mountain: a cone with its vertices pushed around so it reads as
 * rock rather than a party hat, plus a flattened peak.
 */
export function mountain(radius, height, material, segs = 6, seed = 1) {
  const geo = new THREE.ConeGeometry(radius, height, Math.min(segs, HEX), 3);
  geo.rotateY(Math.PI / Math.min(segs, HEX));
  displaceByPosition(geo, seed || 1, (x, y, z, r) => {
    const up = (y + height / 2) / height;             // 0 at base, 1 at peak
    const jitter = (1 - up) * radius * 0.22;
    return [
      x + (r() - 0.5) * jitter,
      y + (r() - 0.5) * height * 0.05,
      z + (r() - 0.5) * jitter,
    ];
  });
  const m = new THREE.Mesh(geo, material);
  m.position.y = height / 2;
  return m;
}

/**
 * A rounded boulder -- an icosahedron with jittered vertices.
 */
export function boulder(radius, material, seed = 1, detail = 0) {
  // A jittered icosahedron is a potato: twenty faces, all about the same size,
  // no edges you can read. A short six-sided drum with the rings pushed around
  // gives a rock with a top, a side and a visible shoulder -- which is what
  // the era's rocks actually looked like.
  const geo = new THREE.CylinderGeometry(radius * 0.62, radius * 0.86,
    radius * 1.35, HEX, 3);
  geo.rotateY(Math.PI / HEX);
  displaceByPosition(geo, seed || 1, (x, y, z, r) => {
    const k = 0.84 + r() * 0.34;
    return [x * k, y + (r() - 0.5) * radius * 0.22, z * k];
  });
  const m = new THREE.Mesh(geo, material);
  let t = (seed >>> 0) || 1;
  t = Math.imul(t ^ (t >>> 13), 0x5bd1e995) >>> 0;
  m.rotation.y = (t / 4294967296) * Math.PI;
  m.rotation.z = ((t >>> 16) / 65536 - 0.5) * 0.26;
  return m;
}

/* ---------------- helpers ---------------- */

/** Count triangles under an object, so the N64 budget stays honest. */
export function triCount(obj) {
  let n = 0;
  obj.traverse(o => {
    if (!o.isMesh || !o.geometry) return;
    n += o.geometry.index
      ? o.geometry.index.count / 3
      : o.geometry.attributes.position.count / 3;
  });
  return n;
}

/** Dispose every geometry under an object. */
export function disposeTree(obj) {
  obj.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
}

/**
 * A partial cylinder wall -- a curved sheet. Capes, shield faces, robe flares
 * and tower walls. thetaLength = PI gives a half-shell.
 */
export function shell(rTop, rBot, len, thetaStart, thetaLength, material, segs = 6) {
  const geo = new THREE.CylinderGeometry(
    rTop, rBot, len, Math.min(segs, HEX), 1, true, thetaStart, thetaLength
  );
  const m = new THREE.Mesh(geo, material);
  m.material.side = THREE.DoubleSide;
  return m;
}
