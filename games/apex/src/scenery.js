// =====================================================================
// APEX :: scenery.js - THE WORLD EITHER SIDE OF THE TRACK
// =====================================================================
//
// Low-poly is a budget for TRIANGLES, not a budget for things. A flat
// green plane with a cone on it is cheap because there is nothing there,
// not because it is stylised - and a circuit with nothing either side of
// it reads as unfinished however good the road is.
//
// So everything here makes the same trade on purpose: each individual
// object is almost nothing - a tuft of grass is nine triangles, a tree
// between thirty and a hundred and forty depending on how close to the
// track it stands - and there are tens of thousands of them, drawn in a
// couple of dozen calls because they are instanced. The cost goes into
// the COUNT, which the GPU does not care about, instead of into the
// detail of any one thing, which it does.
//
// WHAT IS IN HERE
//   WIND / windify   one clock, and a shader that bends things with it
//   makeGround       hills made of noise, flattened where the track is
//   makeGrass        instanced tufts in a band outside the barriers
//   makeTrees        six species, in clumps, swaying, near ones detailed
//   makeBushes       low scrub, the step between grass and treeline
//   makeSky          a gradient dome, and a layer of soft lit clouds
//   makeMountains    a ring of hazy shapes on the horizon
//
// THE ONE RULE ABOUT SWAY
// The shader moves a vertex sideways in proportion to its own HEIGHT
// above the geometry origin, so every one of these is modelled with its
// base at y = 0. Get that wrong and the grass slides around the field
// instead of bending.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------
// noise - the shape of the land
// ---------------------------------------------------------------------
// Deterministic on purpose. The same circuit has to come out the same
// hills every time, or the trees standing on them move when you restart.
const hash2 = (x, y) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

/** four octaves - enough for a skyline, cheap enough to call 50,000 times */
function fbm(x, y) {
  let s = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i++) { s += amp * vnoise(x * f, y * f); amp *= 0.5; f *= 2.1; }
  return s * 1.07 - 0.53;   // roughly centred on zero
}

/** a seeded random, so the scatter is repeatable too */
export function rng(seed) {
  let s = (seed | 0) || 1;
  return () => (s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
}

/** an offset that is either a number or a function of (sample, side) */
const at = (v, i, side) => (typeof v === 'function' ? v(i, side) : v);

const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------------
// WIND
// ---------------------------------------------------------------------
// One clock, shared by every material that sways, so the whole valley
// moves as one weather system instead of each mesh having a private
// breeze. main.js advances it; nothing else touches it.
export const WIND = { uTime: { value: 0 } };

/**
 * Bend a material's geometry in the wind.
 *
 * This is a vertex shader edit rather than CPU animation because there is
 * no other way to afford it: thirty thousand tufts of grass is a quarter
 * of a million vertices, and rewriting those every frame would cost more
 * than the rest of the game together. On the GPU it is four lines of
 * arithmetic per vertex and it is free.
 *
 * `amp` is how far the top of a one-metre-tall thing moves, in metres.
 * `rate` is how fast it flutters: grass is quick, a tree crown is slow
 * and heavy.
 */
export function windify(material, amp = 0.3, rate = 1.0) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = WIND.uTime;
    shader.uniforms.uAmp = { value: amp };
    shader.uniforms.uRate = { value: rate };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', [
        '#include <common>',
        'uniform float uTime;',
        'uniform float uAmp;',
        'uniform float uRate;',
      ].join('\n'))
      .replace('#include <begin_vertex>', [
        '#include <begin_vertex>',
        '{',
        // Where this instance stands, so no two clumps are in step. The
        // translation of an instance matrix is its fourth column.
        '  #ifdef USE_INSTANCING',
        '    vec3 wp = instanceMatrix[3].xyz;',
        '  #else',
        '    vec3 wp = vec3(0.0);',
        '  #endif',
        '  float phase = wp.x * 0.35 + wp.z * 0.41;',
        // a slow gust rolling across the field, times a fast flutter
        '  float gust = 0.55 + 0.45 * sin(uTime * 0.33 + wp.x * 0.010 + wp.z * 0.013);',
        '  float flut = sin(uTime * 2.1 * uRate + phase)',
        '             + 0.45 * sin(uTime * 3.7 * uRate + phase * 1.7);',
        // ...and IN PROPORTION TO HEIGHT, so the roots stay in the ground
        '  float hh = max(transformed.y, 0.0);',
        '  transformed.x += flut * uAmp * gust * hh;',
        '  transformed.z += flut * uAmp * gust * hh * 0.42;',
        '}',
      ].join('\n'));
  };
  // Two materials with different amplitudes must not share a compiled
  // program, or the second silently inherits the first one's wind.
  material.customProgramCacheKey = () => 'wind:' + amp + ':' + rate;
  return material;
}

const std = (c, o = {}) => new THREE.MeshStandardMaterial({
  color: c, flatShading: true, roughness: 0.9, ...o });

// ---------------------------------------------------------------------
// THE GROUND
// ---------------------------------------------------------------------
/**
 * Rolling country, with a level hole cut in it around the circuit.
 *
 * A circuit is built on graded land - it has to be - so the hills must
 * STOP before they reach it, or the first thing that happens is a
 * hillside erupting through the racing surface. `flat` is how far out the
 * ground stays dead level and `rise` is how far beyond that it takes to
 * reach full height, faded with a smoothstep so there is no crease where
 * the two meet.
 *
 * Returns the mesh and, just as importantly, the height function itself,
 * because every tree and bush has to stand ON this rather than in it.
 */
export function makeGround(bbox, distTo, opts = {}) {
  const { flat = 75, rise = 300, amp = 36, base = -0.30, city = false } = opts;
  const pad = opts.pad === undefined ? 1500 : opts.pad;
  const x0 = bbox.minX - pad, x1 = bbox.maxX + pad;
  const z0 = bbox.minZ - pad, z1 = bbox.maxZ + pad;
  const w = x1 - x0, d = z1 - z0;
  const seg = Math.min(200, Math.max(80, Math.round(Math.max(w, d) / 30)));

  const heightAt = (x, z) => {
    if (city) return base;
    const k = smoothstep(flat, flat + rise, distTo(x, z));
    if (k <= 0) return base;
    const big = fbm(x * 0.0016, z * 0.0016);
    const med = fbm(x * 0.0067 + 40, z * 0.0067 - 17) * 0.35;
    return base + (big + med) * amp * k;
  };

  const geo = new THREE.PlaneGeometry(w, d, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const pos = geo.attributes.position;
  const col = new Float32Array(pos.count * 3);

  // Four greens picked by height and by a second noise field, so the land
  // is patchy instead of one flat colour - which is most of what stops a
  // big empty plane reading as a big empty plane.
  // lighter than they would be as flat colour, because the grass texture
  // multiplies over them and takes about a third back off
  /* DESATURATED, AND MORE OF THEM. Liam: "make realistic ... grass". The
     patching was right; the colours were poster greens - 0x6a9450 is a
     billiard table - and three of them lerped together still only ever
     make one kind of green. Turf at a circuit is olive, straw and mud
     and most of it is duller than people remember. */
  const cLow = new THREE.Color(0x5c7a49);
  const cMid = new THREE.Color(0x49633c);
  const cHigh = new THREE.Color(0x7d8768);
  const cDry = new THREE.Color(0x938b5e);
  const cBare = new THREE.Color(0x6d6148);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const y = heightAt(x, z);
    pos.setY(i, y);
    if (city) { col[i * 3] = 0.93; col[i * 3 + 1] = 0.88; col[i * 3 + 2] = 0.80; continue; }
    const up = smoothstep(base + amp * 0.10, base + amp * 0.70, y);
    const patch = vnoise(x * 0.012, z * 0.012);
    // a second, much finer band of noise, so the field has grain inside
    // its patches instead of four big soft blobs of colour
    const fine = vnoise(x * 0.09 + 31, z * 0.09 - 17);
    tmp.copy(cLow).lerp(cMid, patch);
    tmp.lerp(cDry, Math.max(0, patch - 0.55) * 1.7);
    tmp.lerp(cBare, Math.max(0, fine - 0.78) * 1.4);
    tmp.lerp(cHigh, up);
    const shade = 0.90 + fine * 0.20;
    tmp.multiplyScalar(shade);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();

  // A DETAIL TEXTURE over the vertex colours: the colours give the land its
  // patches at the scale of a field, the texture gives it grain at the
  // scale of a footstep. Either alone looks like a carpet or like paint.
  let map = null;
  if (opts.map) {
    map = opts.map.clone();
    map.needsUpdate = true;
    map.repeat.set(w / (opts.tile || 7), d / (opts.tile || 7));
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
    color: 0xffffff, vertexColors: true, roughness: 1, map }));
  mesh.position.set(cx, 0, cz);
  mesh.receiveShadow = true;
  return { mesh, heightAt };
}

// ---------------------------------------------------------------------
// GRASS
// ---------------------------------------------------------------------
/**
 * One tuft: a handful of blades leaning out from a common root.
 *
 * Each blade is three triangles - a wide base narrowing to a point - and
 * double-sided, because you see them from every angle and a one-sided
 * blade vanishes as you drive past it. The blades of a tuft lean in
 * different directions so a tuft has a silhouette rather than being a
 * single flat card.
 */
function tuftGeometry(rnd, blades) {
  const v = [];
  for (let b = 0; b < blades; b++) {
    const a = rnd() * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    const h = 0.55 + rnd() * 0.55;
    const lean = 0.25 + rnd() * 0.5;
    const wid = 0.035 + rnd() * 0.022;
    // across the blade, and where its tip ends up
    const px = ca * wid, pz = sa * wid;
    const lx = -sa * lean * h, lz = ca * lean * h;
    const p = (t, s) => [
      lx * t * t + px * s * (1 - t * 0.7),
      h * t,
      lz * t * t + pz * s * (1 - t * 0.7),
    ];
    const A = p(0, -1), B = p(0, 1), C = p(0.55, -0.55), D = p(0.55, 0.55), E = p(1, 0);
    v.push(...A, ...B, ...D, ...A, ...D, ...C, ...C, ...D, ...E);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Tufts scattered in a band outside the barriers, the whole way round.
 *
 * Split into chunks along the lap so the ones behind you get culled. A
 * single instanced mesh covering a seven-kilometre circuit has a bounding
 * sphere the size of the circuit and is therefore never off screen, so
 * every tuft on the far side of the lap would still be drawn every frame.
 */
export function makeGrass(points, leftOf, from, to, heightAt, opts = {}) {
  const { perSample = 10, step = 2, chunks = 26, seed = 51 } = opts;
  const rnd = rng(seed);
  const n = points.length;
  const group = new THREE.Group();

  const geos = [tuftGeometry(rnd, 5), tuftGeometry(rnd, 6), tuftGeometry(rnd, 4)];
  const buckets = [];
  for (let c = 0; c < chunks; c++) buckets.push([[], [], []]);

  const { keep } = opts;
  for (let i = 0; i < n - 1; i += step) {
    const p = points[i], l = leftOf(p.h);
    const c = Math.min(chunks - 1, Math.floor((i / n) * chunks));
    for (let k = 0; k < perSample; k++) {
      const side = rnd() < 0.5 ? 1 : -1;
      const f = at(from, i, side), t = at(to, i, side);
      const off = side * (f + rnd() * (t - f));
      // jitter along the track as well, or they line up in visible rows
      const ahead = (rnd() - 0.5) * step * 2.4;
      const x = p.x + l[0] * off + Math.sin(p.h) * ahead;
      const z = p.z + l[1] * off + Math.cos(p.h) * ahead;
      if (keep && !keep(x, z)) { rnd(); rnd(); rnd(); continue; }
      buckets[c][k % 3].push({
        x, y: heightAt(x, z), z,
        s: 0.75 + rnd() * 0.9, r: rnd() * Math.PI * 2, t: rnd(),
      });
    }
  }

  const lush = new THREE.Color(0x466b34), dry = new THREE.Color(0x7d8052);
  const tmp = new THREE.Color();
  const d = new THREE.Object3D();

  for (let c = 0; c < chunks; c++) {
    for (let gi = 0; gi < 3; gi++) {
      const list = buckets[c][gi];
      if (!list.length) continue;
      const m = new THREE.InstancedMesh(geos[gi],
        windify(std(0xffffff, { side: THREE.DoubleSide, roughness: 1 }), 0.30, 1.0),
        list.length);
      list.forEach((t, i) => {
        d.position.set(t.x, t.y, t.z);
        d.rotation.set(0, t.r, 0);
        d.scale.set(t.s, t.s * (0.8 + t.t * 0.6), t.s);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
        m.setColorAt(i, tmp.copy(lush).lerp(dry, t.t * t.t));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      // Shadows off deliberately. Thirty thousand tufts in the shadow pass
      // costs more than everything else on screen and, at grass scale,
      // buys a shimmer nobody can see at 200 km/h.
      m.castShadow = false; m.receiveShadow = false;
      m.computeBoundingSphere();
      group.add(m);
    }
  }
  return group;
}

// ---------------------------------------------------------------------
// TREES
// ---------------------------------------------------------------------
// A hillside of one kind is a texture; a hillside of several is a wood.
// Every species here is modelled base-at-zero so the wind shader works on
// it, and split trunk-from-crown so only the crown moves - a swaying
// trunk looks like an earthquake.
//
// WHERE THE BUDGET GOES NOW
// The first pass gave every tree the same seventy-odd triangles whether it
// stood twelve metres from the centre line or a hundred and twenty. That
// is exactly backwards: at 300 km/h the tree beside the barrier is on
// screen for a tenth of a second but it fills a third of it, and the ones
// on the far ridge are four pixels of silhouette.
//
// So there are two sets of species - a near set with tiered ragged crowns
// and visible branches, and a far set cut down to the outline - and the
// scatter picks by how far out the tree stands. Measured at Monza: a near
// tree is 78-140 triangles where it used to be 60-94, a far one 30-80,
// and the average over the whole scatter went from 77 to 97. That 26% is
// paid for several times over by the draw calls, which went the other way:
// the tree scatter is 84 calls where it was 144, because all six species
// now share one trunk mesh per chunk (see makeTrees). Over a whole frame
// at ten matched viewpoints across four circuits that came out at about
// +3% triangles and -17% draw calls.
const TAU = Math.PI * 2;

/**
 * Wobble a solid of revolution so it stops looking like one.
 *
 * A ConeGeometry is perfectly round and perfectly straight, and five of
 * them stacked is still unmistakably five cones - which is what made the
 * old treeline read as green triangles. Scaling each vertex's distance
 * from the axis by a smooth function of its ANGLE, and letting the wide
 * end sag, turns the same triangles into a ragged, drooping skirt.
 *
 * It has to be a function of the angle and not of a random number per
 * vertex: the seam vertex of a cone exists twice, and two different
 * random pushes tear it open. sin(3a) and sin(5a) are periodic over a
 * full turn, so the seam closes by construction.
 */
function ragged(geo, phase, amt = 0.24, droop = 0) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-4) continue;
    const a = Math.atan2(z, x);
    const k = 1 + amt * (Math.sin(a * 3 + phase) * 0.62 + Math.sin(a * 5 - phase * 1.3) * 0.38);
    p.setX(i, x * k); p.setZ(i, z * k);
    if (droop) p.setY(i, p.getY(i) - droop * r);
  }
  return geo;
}

/**
 * A top-lit gradient baked into a crown's vertices.
 *
 * Flat shading gives a crown facets, but every facet of a roughly
 * spherical blob catches roughly the same amount of a sky that is
 * everywhere, so the whole thing settles to one value and the tree goes
 * back to being a flat green silhouette. Real foliage is a gradient: the
 * top of a crown sees the whole sky, the underside sees the ground.
 *
 * Baking that as a vertex colour costs three floats a vertex and no
 * shader work at all, and it MULTIPLIES with the per-instance hue that
 * three.js already applies, so every tree keeps its own green and gains
 * the same internal shading. 0.50 to 1.16 was chosen against the species
 * greens below: shallower and the crown is flat again, deeper and the
 * sunlit tops of the pale species clip to white.
 */
function shadeByHeight(geo, lo = 0.50, hi = 1.16) {
  const p = geo.attributes.position;
  let y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i); if (y < y0) y0 = y; if (y > y1) y1 = y; }
  const span = Math.max(0.001, y1 - y0);
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = (p.getY(i) - y0) / span;
    const v = lo + (hi - lo) * (t * t * (3 - 2 * t));
    c[i * 3] = v; c[i * 3 + 1] = v; c[i * 3 + 2] = v;
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
  return geo;
}

/**
 * One icosahedral lump of foliage, squashed and wobbled.
 *
 * The wobble is deliberately small - 0.14, where the conifer skirts take
 * 0.26. A twenty-face ball pushed hard enough to look ragged just looks
 * like a crumpled sheet of paper, because there are not enough faces left
 * to read as a surface. A crown is made ragged by having several lumps,
 * not by mangling one.
 */
function lump(rnd, r, flat, x, y, z) {
  const g = new THREE.IcosahedronGeometry(r, 0);
  g.scale(1, flat, 1);
  ragged(g, rnd() * TAU, 0.14);
  g.translate(x, y, z);
  return g;
}

/** a limb: a four-sided open cone, six triangles, and the thing that makes a broadleaf a tree */
function limb(x0, y0, z0, x1, y1, z1, r) {
  const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0);
  const g = new THREE.CylinderGeometry(r * 0.45, r, len, 4, 1, true);
  g.translate(0, len / 2, 0);
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(x1 - x0, y1 - y0, z1 - z0).normalize());
  g.applyQuaternion(q);
  g.translate(x0, y0, z0);
  return g;
}

/**
 * Glue a species' parts into one crown.
 *
 * Everything is forced non-indexed first. ConeGeometry and
 * CylinderGeometry come indexed and IcosahedronGeometry does not, and
 * mergeGeometries refuses a mixture - which is why the old shapes were
 * all-cones or all-blobs and never a blob on a branch. The cost is a
 * third more vertices on the coniferous ones and not one extra triangle,
 * on six geometries that the whole circuit shares.
 */
const species = (parts, rest) => ({
  crown: shadeByHeight(mergeGeometries(parts.map((g) => (g.index ? g.toNonIndexed() : g)))),
  ...rest,
});

// SPRUCE - the classic conifer, but as five ragged drooping skirts rather
// than three clean cones. The lowest skirt reaches down to a tenth of the
// tree's height, because a conifer whose branches start half way up is a
// lollipop on a pole.
function spruce(rnd, near) {
  const h = 9 + rnd() * 7;
  const tiers = near ? 5 : 3, seg = near ? 7 : 5;
  const parts = [];
  for (let i = 0; i < tiers; i++) {
    const t = i / tiers;
    const r = (2.9 - t * 1.7) * (0.85 + rnd() * 0.3);
    // The far one's three tiers used to sit so deep inside each other that
    // they merged back into a single smooth cone - the exact thing this
    // was meant to stop. Shorter tiers, spaced further apart, leave a step
    // in the outline, which is all a four-pixel tree has to offer.
    const ch = h * (near ? 0.34 - t * 0.05 : 0.40 - t * 0.06);
    const g = new THREE.ConeGeometry(r, ch, seg);
    ragged(g, rnd() * TAU, near ? 0.26 : 0.22, near ? 0.20 : 0.13);
    g.translate(0, h * (near ? 0.10 + t * 0.155 : 0.12 + t * 0.26) + ch / 2, 0);
    parts.push(g);
  }
  // the leader: the thin spike above the top skirt that gives a spruce its
  // point. Eight triangles, and it is most of the silhouette
  if (near) {
    const g = new THREE.ConeGeometry(0.62, h * 0.20, 4);
    g.translate(0, h * 0.86, 0);
    parts.push(g);
  }
  return species(parts, {
    trunkH: h * 0.26, trunkR: 0.22, sway: [0.020, 0.30],
    bark: 0x4a3226, hue: [0x1c3a24, 0x315434],
  });
}

// UMBRELLA PINE - a long bare trunk and a flat wide head. Kept for the far
// set because that flat-topped silhouette is what tells a distant ridge
// apart from a row of spruce spikes.
function pine(rnd, near) {
  // A stone pine is about as wide as it is tall. The first pass made it
  // eleven to eighteen metres with a four-metre head and every one of them
  // came out a lamp post with a lid on. Shorter and much wider: a crown
  // that spans roughly 12 m on a 12 m tree, which is the real proportion.
  const h = 8.5 + rnd() * 4.5;
  const parts = [];
  const blobs = near ? 5 : 4;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rnd();
    const rad = i === 0 ? 0 : 2.7 + rnd() * 1.7;
    parts.push(lump(rnd, 3.1 + rnd() * 1.5, 0.34,
      Math.cos(a) * rad, h * (0.84 + (rnd() - 0.5) * 0.07), Math.sin(a) * rad));
  }
  if (near) for (let i = 0; i < 2; i++) {
    const a = rnd() * TAU;
    parts.push(limb(0, h * 0.58, 0, Math.cos(a) * 3.0, h * 0.82, Math.sin(a) * 3.0, 0.24));
  }
  return species(parts, {
    trunkH: h * 0.82, trunkR: 0.34, sway: [0.026, 0.34],
    bark: 0x6b4a33, hue: [0x2c4a2a, 0x4a6b33],
  });
}

// OAK - wide, heavy and lumpy, with the fork of limbs showing under the
// crown. The limbs are eighteen triangles and they are the difference
// between a tree and a ball balanced on a stick.
function oak(rnd, near) {
  const h = 7 + rnd() * 5;
  const parts = [];
  // Five modest lumps spread wide beat one big one with four beside it:
  // the crown gets a bumpy outline all the way round instead of a single
  // dominant polyhedron with warts.
  const blobs = near ? 5 : 2;
  for (let i = 0; i < blobs; i++) {
    const a = (i / blobs) * TAU + rnd();
    const rad = i === 0 ? 0 : 2.0 + rnd() * 1.1;
    parts.push(lump(rnd, (1.7 + rnd() * 0.8) * (i === 0 ? 1.35 : 1), 0.86,
      Math.cos(a) * rad, h * (0.66 + (rnd() - 0.4) * 0.18), Math.sin(a) * rad));
  }
  if (near) for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + rnd() * 0.8;
    parts.push(limb(0, h * 0.40, 0, Math.cos(a) * 1.9, h * 0.66, Math.sin(a) * 1.9, 0.26));
  }
  return species(parts, {
    trunkH: h * 0.46, trunkR: 0.40, sway: [0.032, 0.40],
    bark: 0x4a3f31, hue: [0x33511f, 0x63803a],
  });
}

// POPLAR - the tall thin one planted in rows down the side of a circuit.
// Narrow enough that it sways visibly where the others barely move, which
// is the only thing on the verge that reads as wind from a cockpit.
function poplar(rnd) {
  const h = 13 + rnd() * 8;
  const parts = [];
  // Seven small lumps, overlapping, not four big stretched ones. Stretching
  // an icosahedron to 1.7 turns its twenty faces into long diamonds, and
  // four of those stacked came out looking like a corn cob. Seven rounder
  // lumps at 1.15, spaced well under their own height so they merge, give
  // the same slender column with a soft edge to it.
  for (let i = 0; i < 7; i++) {
    const t = i / 6;
    // and each one a different size, thrown off the axis: a perfectly
    // regular stack reads as beads on a string however much they overlap
    parts.push(lump(rnd, (1.05 + Math.sin((0.25 + t * 0.7) * Math.PI) * 0.8) * (0.82 + rnd() * 0.36), 1.15,
      (rnd() - 0.5) * 1.1, h * (0.34 + t * 0.50), (rnd() - 0.5) * 1.1));
  }
  return species(parts, {
    trunkH: h * 0.40, trunkR: 0.24, sway: [0.055, 0.78],
    bark: 0x7d7768, hue: [0x4a6b2c, 0x7f9445],
  });
}

/**
 * Trees, in clumps.
 *
 * Scattering them evenly is exactly what makes a field of trees look like
 * a field of cones: real woodland comes in stands, with gaps. So the
 * scatter picks clump centres along the lap and throws a handful of trees
 * around each. It costs nothing and it is most of the difference.
 *
 * SIX SPECIES, THREE NEAR AND THREE FAR. A tree lands in the near set if
 * it is inside the first 35% of the band this circuit plants in - a
 * fraction rather than a fixed distance, because the band starts at the
 * edge of the run-off and Spa's run-off is not Monza's.
 *
 * ONE TRUNK GEOMETRY FOR ALL SIX. Every species used to bring its own
 * trunk mesh, so a chunk of lap cost twelve draw calls of which six were
 * posts. They are all the same tapered post with a root flare; the
 * species only differ in how tall and how thick, which is a scale applied
 * after the tree's own transform. That is one call per chunk instead of
 * six, and the whole scatter dropped from 144 draw calls to 84.
 */
export function makeTrees(points, leftOf, from, to, heightAt, opts = {}) {
  const { density = 0.5, chunks = 12, seed = 23 } = opts;
  const rnd = rng(seed);
  const n = points.length;
  const group = new THREE.Group();
  if (density <= 0) return group;

  // 0-2 are the trees you drive past; 3-5 are the ones on the ridge
  const kinds = [
    spruce(rnd, true), oak(rnd, true), poplar(rnd),
    spruce(rnd, false), oak(rnd, false), pine(rnd, false),
  ];

  const buckets = [];
  for (let c = 0; c < chunks; c++) buckets.push(kinds.map(() => []));

  const { keep } = opts;
  for (let i = 0; i < n - 1; i += 6) {
    const c = Math.min(chunks - 1, Math.floor((i / n) * chunks));
    for (const side of [1, -1]) {
      if (rnd() > density * 0.55) continue;
      const p = points[i], l = leftOf(p.h);
      const f = at(from, i, side), t = at(to, i, side);
      const lat = f + rnd() * (t - f);
      const off = side * lat;
      const set = lat - f < (t - f) * 0.35 ? 0 : 3;
      const cx = p.x + l[0] * off, cz = p.z + l[1] * off;
      const count = 2 + Math.floor(rnd() * 7);
      for (let k = 0; k < count; k++) {
        const a = rnd() * Math.PI * 2, rad = rnd() * 17;
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        // EVERY tree asks, not just the clump: a clump centred safely
        // beside one road still throws trees seventeen metres, which is
        // onto the next one
        if (keep && !keep(x, z)) { rnd(); rnd(); rnd(); rnd(); rnd(); continue; }
        buckets[c][set + Math.floor(rnd() * 3)].push({
          x, y: heightAt(x, z), z,
          s: 0.65 + rnd() * 0.9,
          r: rnd() * Math.PI * 2,
          lean: (rnd() - 0.5) * 0.11,
          hue: rnd(),
        });
      }
    }
  }

  // THE TRUNK, once. Base at y=0, one metre tall, one metre across, so a
  // scale of (trunkR, trunkH, trunkR) makes any species' post. Open-ended
  // because you never see either end - the bottom is in the ground and the
  // top is inside the crown - which pays for the second height segment
  // that the root flare needs, so it is the same 24 triangles as the
  // straight-sided cylinder it replaces.
  const trunkGeo = new THREE.CylinderGeometry(0.58, 1, 1, 6, 2, true);
  trunkGeo.translate(0, 0.5, 0);
  {
    const p = trunkGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // the bottom ring only: a real trunk swells where it meets the ground
      if (p.getY(i) > 0.01) continue;
      p.setX(i, p.getX(i) * 1.45); p.setZ(i, p.getZ(i) * 1.45);
    }
  }
  const trunkMat = std(0xffffff, { roughness: 1 });

  // One crown material per SPECIES, hoisted out of the chunk loop. The old
  // code built a fresh material inside it, so a circuit carried seventy-two
  // identical materials and the renderer re-uploaded their uniforms for
  // each one. Six is also six wind programs, which is the point: a poplar
  // has to flutter where a spruce stands still.
  const crownMats = kinds.map((k) => windify(
    std(0xffffff, { roughness: 1, vertexColors: true }), k.sway[0], k.sway[1]));
  const hues = kinds.map((k) => [new THREE.Color(k.hue[0]), new THREE.Color(k.hue[1])]);
  const barks = kinds.map((k) => new THREE.Color(k.bark));
  // a few trees on the turn, which is what stops a wood being one colour
  const turning = new THREE.Color(0x9a7d33);
  // the far treeline has three hundred metres of air in front of it, and
  // air is blue: without this a ridge two kilometres away is exactly as
  // saturated as the tree you are about to hit, which is the single
  // biggest reason a scatter reads as scenery rather than as distance
  const HAZE = new THREE.Color(0x7d93a8);

  const tmp = new THREE.Color();
  const d = new THREE.Object3D();
  const m = new THREE.Matrix4(), sc = new THREE.Vector3();

  for (let c = 0; c < chunks; c++) {
    const total = buckets[c].reduce((s, l) => s + l.length, 0);
    if (!total) continue;
    const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, total);
    let ti = 0;

    for (let ki = 0; ki < kinds.length; ki++) {
      const list = buckets[c][ki];
      if (!list.length) continue;
      const kind = kinds[ki];
      const crowns = new THREE.InstancedMesh(kind.crown, crownMats[ki], list.length);

      list.forEach((t, i) => {
        d.position.set(t.x, t.y, t.z);
        d.rotation.set(t.lean, t.r, t.lean * 0.7);
        d.scale.set(t.s, t.s * (0.88 + t.hue * 0.35), t.s);
        d.updateMatrix();
        crowns.setMatrixAt(i, d.matrix);
        m.copy(d.matrix).scale(sc.set(kind.trunkR, kind.trunkH, kind.trunkR));
        trunks.setMatrixAt(ti, m);
        trunks.setColorAt(ti, tmp.copy(barks[ki]).multiplyScalar(0.8 + t.hue * 0.4));
        ti++;
        /* A WOOD IS NOT ONE COLOUR, and lerping between a species' two
           hues on a single random number only ever made a smooth ramp
           between the same two greens - which from the cockpit is one
           green. Liam: "make realistic ... trees". Three things on top of
           the ramp: a second, independent number that lightens or darkens
           the individual tree, a few more on the turn, and a cool shift
           on the ones far enough back to have air in front of them.
           None of it costs a draw call - it is a colour per instance. */
        tmp.copy(hues[ki][0]).lerp(hues[ki][1], t.hue);
        const vary = ((Math.sin(t.x * 0.37 + t.z * 0.71) * 43758.5) % 1 + 1) % 1;
        tmp.multiplyScalar(0.74 + vary * 0.52);
        if (t.hue > 0.88) tmp.lerp(turning, 0.30 + (t.hue - 0.88) * 3.4);
        if (ki >= 3) tmp.lerp(HAZE, 0.22);
        crowns.setColorAt(i, tmp);
      });
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      crowns.castShadow = true;
      crowns.computeBoundingSphere();
      group.add(crowns);
    }
    trunks.instanceMatrix.needsUpdate = true;
    if (trunks.instanceColor) trunks.instanceColor.needsUpdate = true;
    trunks.computeBoundingSphere();
    group.add(trunks);
  }
  return group;
}

// ---------------------------------------------------------------------
// BUSHES
// ---------------------------------------------------------------------
// The step between ankle-high grass and a seven-metre tree, without which
// the treeline starts abruptly out of a lawn.
export function makeBushes(points, leftOf, from, to, heightAt, opts = {}) {
  const { density = 0.5, chunks = 10, seed = 77 } = opts;
  const rnd = rng(seed);
  const n = points.length;
  const group = new THREE.Group();
  if (density <= 0) return group;

  const shapes = [];
  for (let i = 0; i < 3; i++) {
    const parts = [];
    for (let b = 0; b < 3; b++) {
      const g = new THREE.IcosahedronGeometry(0.7 + rnd() * 0.5, 0);
      g.scale(1.2, 0.75, 1.2);
      g.translate((rnd() - 0.5) * 1.3, 0.5 + rnd() * 0.35, (rnd() - 0.5) * 1.3);
      parts.push(g);
    }
    shapes.push(mergeGeometries(parts));
  }

  const buckets = [];
  for (let c = 0; c < chunks; c++) buckets.push([[], [], []]);
  const { keep } = opts;
  for (let i = 0; i < n - 1; i += 3) {
    const c = Math.min(chunks - 1, Math.floor((i / n) * chunks));
    for (const side of [1, -1]) {
      if (rnd() > density * 0.5) continue;
      const p = points[i], l = leftOf(p.h);
      const f = at(from, i, side), t = at(to, i, side);
      const off = side * (f + rnd() * (t - f));
      const x = p.x + l[0] * off, z = p.z + l[1] * off;
      if (keep && !keep(x, z)) { rnd(); rnd(); rnd(); continue; }
      buckets[c][Math.floor(rnd() * 3)].push({
        x, y: heightAt(x, z), z, s: 0.7 + rnd() * 1.1,
        r: rnd() * Math.PI * 2, hue: rnd(),
      });
    }
  }

  const a = new THREE.Color(0x2f4a26), b = new THREE.Color(0x55703a);
  const tmp = new THREE.Color(), d = new THREE.Object3D();
  for (let c = 0; c < chunks; c++) {
    for (let si = 0; si < 3; si++) {
      const list = buckets[c][si];
      if (!list.length) continue;
      const m = new THREE.InstancedMesh(shapes[si],
        windify(std(0xffffff, { roughness: 1 }), 0.055, 0.7), list.length);
      list.forEach((t, i) => {
        d.position.set(t.x, t.y, t.z);
        d.rotation.set(0, t.r, 0);
        d.scale.setScalar(t.s);
        d.updateMatrix();
        m.setMatrixAt(i, d.matrix);
        m.setColorAt(i, tmp.copy(a).lerp(b, t.hue));
      });
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.castShadow = true;
      m.computeBoundingSphere();
      group.add(m);
    }
  }
  return group;
}

// ---------------------------------------------------------------------
// SKY
// ---------------------------------------------------------------------
/**
 * A dome, instead of a flat background colour.
 *
 * `scene.background` paints one colour over every pixel that misses
 * everything, so the sky is the same shade at your feet as overhead and
 * the horizon is wherever the ground happens to stop. A gradient dome
 * gives a real horizon for free: deep blue up top, pale and hazy at eye
 * level, meeting the fog colour exactly where the land ends.
 *
 * It follows the camera - main.js does that - so you can never reach the
 * edge of it, and it is unfogged, because fog IS the atmosphere and this
 * is the sky behind it.
 */
export function makeSky(opts = {}) {
  // cMid sits AT the horizon, so it is the fog colour and not a choice:
  // the far edge of the land fades to fog, and if the sky is any other
  // shade there the ground stops along a hard line across the screen.
  const top = new THREE.Color(opts.top === undefined ? 0x3d74c4 : opts.top);
  const mid = new THREE.Color(opts.mid === undefined ? 0x9cc0dd : opts.mid);
  const bot = new THREE.Color(opts.bottom === undefined ? 0xbcd4e2 : opts.bottom);
  const m = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { cTop: { value: top }, cMid: { value: mid }, cBot: { value: bot } },
    vertexShader: [
      'varying float vH;',
      'void main() {',
      '  vH = normalize(position).y;',
      '  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 cTop, cMid, cBot;',
      'varying float vH;',
      'void main() {',
      '  float h = clamp(vH, -1.0, 1.0);',
      '  vec3 c = h > 0.0 ? mix(cMid, cTop, pow(h, 0.62)) : mix(cMid, cBot, -h * 2.2);',
      '  gl_FragColor = vec4(c, 1.0);',
      '}',
    ].join('\n'),
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(4000, 24, 16), m);
  sky.frustumCulled = false;
  sky.renderOrder = -2;

  const clouds = makeClouds();
  sky.add(clouds);
  return sky;
}

// ---------------------------------------------------------------------
// CLOUDS
// ---------------------------------------------------------------------
/**
 * A cloud layer built out of soft billboard puffs.
 *
 * WHAT WAS WRONG. The first pass was forty flattened icosahedra in one
 * unlit MeshBasicMaterial. Three things fell out of that and all three
 * are visible from the cockpit: the edges were straight polygon edges, so
 * a cloud was a white paper cut-out; there was no shading at all, so it
 * had no volume, only an outline; and they sat in a RING between 1.1 and
 * 3.7 km, which leaves a hole directly overhead - look up on the grid and
 * the sky is empty.
 *
 * WHAT THIS IS. Each cloud is a cluster of camera-facing quads with a
 * soft radial falloff. That is the oldest trick in the book and it is
 * still the right one here: two triangles per puff, the whole sky in one
 * draw call, genuinely soft edges, and - because a quad's own local axes
 * ARE the view axes - a free surface normal to light it with. So each
 * puff is shaded like a little sphere, lit from the sun's side and dark
 * underneath, on top of a cloud-wide gradient from a shadowed base to a
 * sunlit top. That gradient is what makes a cumulus look like a tower of
 * something rather than a white shape.
 *
 * It is also CHEAPER than what it replaces: 1,904 triangles against the
 * 3,600-odd of forty icosahedral clouds, in the same single draw call.
 *
 * THE SORT. These are transparent and they do not write depth, so within
 * the mesh they blend in buffer order. Every puff is therefore written
 * top-down by altitude, which is exactly back-to-front for a viewer under
 * the layer - and a driver is always under the layer. Two separate clouds
 * at different heights can still overlap out of order, but both are pale
 * and far away and the error is not findable.
 */
function makeClouds() {
  const rnd = rng(9001);
  const puffs = [];
  // x,z on a disc of area-uniform radius, so the layer is a layer and not
  // a ring. `min` keeps the tall types from sitting on top of the camera,
  // where a 200 m cumulus would fill the screen.
  const spot = (min, max) => {
    const a = rnd() * TAU, r = Math.sqrt(min * min + rnd() * (max * max - min * min));
    return [Math.cos(a) * r, Math.sin(a) * r];
  };
  /**
   * w,h are half-sizes in metres; `up` is height within this cloud, 0 base
   * 1 top; `hard` is where the soft edge starts, as a fraction of the
   * puff's radius. A cumulus has a definite boil to its edge and wants a
   * short falloff; cirrus is half vapour and wants almost all falloff.
   * One number, and it is the difference between cloud and cigarette smoke.
   */
  const puff = (x, y, z, w, h, up, a, hard) =>
    puffs.push({ x, y, z, w, h, up, a, hard, seed: rnd() * 12 });

  // ---- CUMULUS: flat-bottomed, billowing upwards -------------------------
  // The flat base is the whole cue. Packing the vertical placement with
  // u*u puts most puffs low and wide and a few high, which is the shape a
  // fair-weather cumulus actually has.
  /* WHY THESE NUMBERS CHANGED. Liam: "make realistic clouds". The
     machinery was already right - flat-bottomed cumulus, a cloud-wide
     gradient, a silver lining - and it still came out as cotton wool,
     because of three numbers.

     Twenty-eight puffs at 54-100 m across a 300 m cloud is a cloud made
     of about a dozen VISIBLE BALLS, and a ball is what the eye finds.
     Fifty-two smaller ones overlap enough that no single one is the
     outline. Second, hard = 0.56 starts the soft edge halfway out, so
     every puff had a definite rim; real cumulus is crisp on its sunlit
     shoulders and vapour everywhere else, which is 0.30 and let the
     density do the rest. And third, alpha 0.72 meant one puff was nearly
     opaque on its own - so the cloud could not build up thick in the
     middle and thin at the edges, which is the whole of how a cloud
     reads. Half that, and the overlap does it. */
  for (let i = 0; i < 20; i++) {
    const [cx, cz] = spot(420, 3300);
    const base = 700 + rnd() * 340;
    const W = 170 + rnd() * 240, H = 150 + rnd() * 230;
    const squash = 0.6 + rnd() * 0.7;              // some are long, some compact
    for (let k = 0; k < 52; k++) {
      const u = rnd(), hy = u * u;
      const rad = W * Math.sqrt(1 - hy * 0.8) * Math.sqrt(rnd());
      const a = rnd() * TAU;
      const s = (34 + rnd() * 40) * (1 - hy * 0.3);
      puff(cx + Math.cos(a) * rad, base + hy * H + (rnd() - 0.5) * 22, cz + Math.sin(a) * rad * squash,
        s, s * (0.74 + rnd() * 0.34), hy, 0.36, 0.30);
    }
    /* AND THE FLAT BOTTOM, WHICH IS THE ONE THING A CUMULUS HAS. It is
       the condensation level - the height at which the air gets cold
       enough - and it is the same height for every cloud in the sky, and
       dead flat, and in shadow. Without a skirt of wide dark puffs pinned
       to it, all the gradient in the world still reads as a floating
       lump rather than as weather. */
    for (let k = 0; k < 14; k++) {
      const a = rnd() * TAU, rad = W * 0.86 * Math.sqrt(rnd());
      const s = 52 + rnd() * 46;
      puff(cx + Math.cos(a) * rad, base - 4 + (rnd() - 0.5) * 10, cz + Math.sin(a) * rad * squash,
        s, s * 0.30, 0.0, 0.34, 0.22);
    }
  }

  // ---- STRATUS: the flat low stuff, wide and thin and barely shaded ------
  for (let i = 0; i < 18; i++) {
    const [cx, cz] = spot(300, 3300);
    const y = 470 + rnd() * 140;
    const W = 260 + rnd() * 380, D = 120 + rnd() * 200;
    const turn = rnd() * TAU, ct = Math.cos(turn), st = Math.sin(turn);
    for (let k = 0; k < 14; k++) {
      const ox = (rnd() - 0.5) * 2 * W, oz = (rnd() - 0.5) * 2 * D;
      const w = 110 + rnd() * 90;
      puff(cx + ox * ct - oz * st, y + (rnd() - 0.5) * 26, cz + ox * st + oz * ct,
        w, 22 + rnd() * 16, 0.42 + rnd() * 0.2, 0.20, 0.12);
    }
  }

  // ---- CIRRUS: high combed streaks, all on one bearing -------------------
  // One bearing for the whole sky, because cirrus is drawn out by a single
  // jet stream and a sky of streaks pointing every way looks like a mess.
  const comb = rnd() * TAU, cc = Math.cos(comb), cs = Math.sin(comb);
  for (let i = 0; i < 12; i++) {
    const [cx, cz] = spot(200, 3200);
    const y = 1500 + rnd() * 620;
    const L = 420 + rnd() * 520;
    for (let k = 0; k < 7; k++) {
      const t = (k / 6 - 0.5) * 2 * L;
      puff(cx + cc * t, y + (rnd() - 0.5) * 40, cz + cs * t,
        130 + rnd() * 90, 13 + rnd() * 10, 0.95, 0.13 + rnd() * 0.09, 0.03);
    }
  }

  puffs.sort((p, q) => q.y - p.y);

  const N = puffs.length;
  const pos = new Float32Array(N * 12);
  const quad = new Float32Array(N * 16);     // corner.xy, halfsize.xy
  const look = new Float32Array(N * 16);     // up-in-cloud, alpha, seed, hardness
  const idx = new Uint32Array(N * 6);
  const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (let i = 0; i < N; i++) {
    const p = puffs[i];
    for (let v = 0; v < 4; v++) {
      const o = i * 4 + v;
      pos[o * 3] = p.x; pos[o * 3 + 1] = p.y; pos[o * 3 + 2] = p.z;
      quad[o * 4] = CORNERS[v][0]; quad[o * 4 + 1] = CORNERS[v][1];
      quad[o * 4 + 2] = p.w; quad[o * 4 + 3] = p.h;
      look[o * 4] = p.up; look[o * 4 + 1] = p.a;
      look[o * 4 + 2] = p.seed; look[o * 4 + 3] = p.hard;
    }
    const b = i * 4;
    idx.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aQuad', new THREE.BufferAttribute(quad, 4));
  geo.setAttribute('aPuff', new THREE.BufferAttribute(look, 4));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));

  // WHERE THE SUN IS. main.js hangs the key light at a fixed offset from
  // the car - (-90, +150, +70) - so the direction to it never changes and
  // there is nothing to keep in sync; this is that offset, normalised.
  const sun = new THREE.Vector3(-90, 150, 70).normalize();
  const tint = new THREE.Color(0xeef4f9);

  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false,
    uniforms: {
      uTint: { value: tint }, uOpacity: { value: 0.82 }, uSun: { value: sun },
    },
    vertexShader: [
      'attribute vec4 aQuad;',
      'attribute vec4 aPuff;',
      'varying vec2 vUv;',
      'varying vec4 vP;',          // up-in-cloud, alpha, seed, edge hardness
      'void main() {',
      '  vec4 mv = modelViewMatrix * vec4(position, 1.0);',
      // the quad is built in VIEW space, so it always faces the camera and
      // its x/y are the camera's right and up - which is what lets the
      // fragment shader fake a sphere normal for nothing
      '  mv.xy += aQuad.xy * aQuad.zw;',
      '  vUv = aQuad.xy;',
      '  vP = aPuff;',
      '  gl_Position = projectionMatrix * mv;',
      '}',
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uTint;',
      'uniform vec3 uSun;',
      'uniform float uOpacity;',
      'varying vec2 vUv;',
      'varying vec4 vP;',
      'void main() {',
      '  float d = length(vUv);',
      // A circle is a ball, and a cloud made of balls looks like a cloud
      // made of balls the moment you are close enough to tell. Two octaves
      // of sine lobes keyed to the puff\'s own seed break the outline into
      // something irregular, for eight instructions and no texture.
      '  d *= 1.0 + 0.26 * sin(vUv.x * 5.1 + vP.z) * sin(vUv.y * 4.3 - vP.z * 1.7)',
      '            + 0.13 * sin(vUv.x * 9.7 - vP.z * 2.3) * sin(vUv.y * 11.3 + vP.z);',
      '  float a = smoothstep(1.0, vP.w, d) * vP.y * uOpacity;',
      '  if (a < 0.004) discard;',
      // the puff as a sphere, in view space
      '  vec3 n = vec3(vUv, sqrt(max(0.0, 1.0 - min(1.0, d * d))));',
      '  vec3 sunV = normalize((viewMatrix * vec4(uSun, 0.0)).xyz);',
      '  vec3 upV = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);',
      '  float lam = 0.5 + 0.5 * dot(n, sunV);',
      // the cloud-wide gradient does most of the work; the puff\'s own
      // up-facing term rounds each lump inside it
      '  float t = vP.x * 0.66 + 0.34 * (0.5 + 0.5 * dot(n, upV));',
      // the shadowed side of a cloud is not grey, it is blue - it is lit by
      // the sky rather than the sun - and warming the lit side by the same
      // amount is what sells the depth
      '  vec3 shade = uTint * vec3(0.44, 0.50, 0.66);',
      '  vec3 col = mix(shade, uTint, clamp(t * 0.82 + lam * 0.40, 0.0, 1.0));',
      // the silver lining: where the sun grazes a rim, it burns through
      '  col += uTint * pow(max(0.0, lam), 7.0) * smoothstep(0.5, 1.0, d) * 0.55;',
      '  gl_FragColor = vec4(col, a);',
      '}',
    ].join('\n'),
  });

  // THE CONTRACT WITH weather.js. It greys the sky by writing
  // clouds.material.color.setRGB(...) and clouds.material.opacity = x
  // every frame. A ShaderMaterial has neither of those wired to anything,
  // so `color` IS the tint uniform's Color object - mutating it writes
  // straight through - and `opacity` is forwarded to its uniform.
  mat.color = tint;
  Object.defineProperty(mat, 'opacity', {
    get: () => mat.uniforms.uOpacity.value,
    set: (v) => { mat.uniforms.uOpacity.value = v; },
  });

  const clouds = new THREE.Mesh(geo, mat);
  clouds.frustumCulled = false;
  clouds.renderOrder = -1;
  return clouds;
}

// ---------------------------------------------------------------------
// THE ENVIRONMENT PROBE - what the bodywork can see
// ---------------------------------------------------------------------
/**
 * A racing car is a mirror. Two thirds of what you see on a real one is
 * not its paint, it is the sky in its paint: the horizon line lying along
 * the sidepod, the ground darkening the underside of the nose, a white
 * smear of sun across the engine cover that slides as the car turns. Until
 * now APEX had none of that - three lights and nothing to reflect - so the
 * cars read as coloured shapes rather than objects with a surface.
 *
 * This builds the thing they reflect: a tiny scene of sky, ground and sun,
 * blurred by PMREMGenerator into the roughness-aware probe three.js wants,
 * and handed to scene.environment. Every MeshStandard/Physical material in
 * the game picks it up for free - paint, visors, rims, the halo, the wet
 * road - which is the whole reason to do it this way rather than hanging
 * an envMap on each one.
 *
 * It is rebuilt only when the weather has visibly moved (see weather.js),
 * because a 128 px cube map is cheap to make once and not cheap to make
 * sixty times a second.
 */
export function envProbe(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const scene = new THREE.Scene();

  // the same gradient the sky dome uses, so what the car reflects and what
  // you see behind it are the same sky
  const cTop = new THREE.Color(0x3d74c4), cMid = new THREE.Color(0x9cc0dd), cBot = new THREE.Color(0x6a7360);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { cTop: { value: cTop }, cMid: { value: cMid }, cBot: { value: cBot } },
    vertexShader: 'varying float vH;\nvoid main() { vH = normalize(position).y;\n'
      + 'gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'uniform vec3 cTop, cMid, cBot;\nvarying float vH;\nvoid main() {\n'
      + '  float h = clamp(vH, -1.0, 1.0);\n'
      + '  vec3 c = h > 0.0 ? mix(cMid, cTop, pow(h, 0.62)) : mix(cMid, cBot, min(1.0, -h * 3.0));\n'
      + '  gl_FragColor = vec4(c, 1.0);\n}',
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(60, 24, 16), skyMat));

  // THE SUN, as a disc the paint can catch. Without it the reflection is a
  // flat wash and the car never glints; with it there is one bright spot
  // that travels across the bodywork as the car rotates, which is what the
  // eye reads as gloss.
  const sunMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sunBlob = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 8), sunMat);
  scene.add(sunBlob);

  let rt = null;
  return {
    /**
     * top/mid/bottom: the sky. ground: what is under the car, which is
     * mostly grass and asphalt averaged together. dir: where the sun is.
     * strength: how bright it burns, which the cloud cover pulls down.
     */
    update({ top, mid, bottom, ground, dir, strength = 1 }) {
      if (top !== undefined) cTop.set(top);
      if (mid !== undefined) cMid.set(mid);
      if (bottom !== undefined) cBot.set(bottom);
      if (ground !== undefined) cBot.set(ground);
      if (dir) sunBlob.position.copy(dir).normalize().multiplyScalar(44);
      sunMat.color.setRGB(strength * 2.4, strength * 2.3, strength * 2.1);
      sunBlob.visible = strength > 0.06;
      if (rt) rt.dispose();
      rt = pmrem.fromScene(scene, 0, 1, 200);
      return rt.texture;
    },
    dispose() { if (rt) rt.dispose(); pmrem.dispose(); },
  };
}

// ---------------------------------------------------------------------
// MOUNTAINS
// ---------------------------------------------------------------------
/**
 * A ring of ridges out past everything else, in nearly the fog colour.
 *
 * Distance in a game is almost entirely a matter of having something AT
 * that distance. This is forty-odd cones and it is the difference between
 * a circuit that ends in a grey wall and one with a country behind it.
 */
export function makeMountains(centre, opts = {}) {
  const { inner = 2300, outer = 3400, count = 60, seed = 404 } = opts;
  const rnd = rng(seed);
  const parts = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 + (rnd() - 0.5) * 0.14;
    const rad = inner + rnd() * (outer - inner);
    // A mountain is only a mountain at the right ANGULAR size. The first
    // pass put 600 m peaks 1.6 km away and they filled a third of the sky
    // like grey pyramids parked on the infield. Lower, wider and much
    // further out reads as a range; the same shapes up close read as set
    // dressing that fell over.
    const h = 130 + rnd() * 260;
    const r = h * (1.5 + rnd() * 1.4);
    const g = new THREE.ConeGeometry(r, h, 5 + Math.floor(rnd() * 3));
    g.rotateY(rnd() * Math.PI * 2);
    g.scale(1, 1, 0.7 + rnd() * 0.6);
    g.translate(centre.x + Math.cos(a) * rad, h / 2 - 60, centre.z + Math.sin(a) * rad);
    parts.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(parts), std(0x8fa6b8, { roughness: 1 }));
  m.receiveShadow = false;
  return m;
}
