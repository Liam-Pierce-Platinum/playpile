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
// about sixty - and there are tens of thousands of them, drawn in a
// couple of dozen calls because they are instanced. The cost goes into
// the COUNT, which the GPU does not care about, instead of into the
// detail of any one thing, which it does.
//
// WHAT IS IN HERE
//   WIND / windify   one clock, and a shader that bends things with it
//   makeGround       hills made of noise, flattened where the track is
//   makeGrass        instanced tufts in a band outside the barriers
//   makeTrees        conifers and broadleaves, in clumps, swaying
//   makeBushes       low scrub, the step between grass and treeline
//   makeSky          a gradient dome, and clouds
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
  const cLow = new THREE.Color(0x6a9450);
  const cMid = new THREE.Color(0x587f44);
  const cHigh = new THREE.Color(0x8a9a6c);
  const cDry = new THREE.Color(0x9ea062);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + cx, z = pos.getZ(i) + cz;
    const y = heightAt(x, z);
    pos.setY(i, y);
    if (city) { col[i * 3] = 0.93; col[i * 3 + 1] = 0.88; col[i * 3 + 2] = 0.80; continue; }
    const up = smoothstep(base + amp * 0.10, base + amp * 0.70, y);
    const patch = vnoise(x * 0.012, z * 0.012);
    tmp.copy(cLow).lerp(cMid, patch);
    tmp.lerp(cDry, Math.max(0, patch - 0.62) * 1.6);
    tmp.lerp(cHigh, up);
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

  const lush = new THREE.Color(0x4e7a35), dry = new THREE.Color(0x818a49);
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
// Two kinds, because a hillside of one kind is a texture and a hillside
// of two is a wood. Both are modelled base-at-zero so the wind shader
// works on them, and both are split trunk-from-crown so only the crown
// moves - a swaying trunk looks like an earthquake.
function conifer(rnd) {
  const h = 7 + rnd() * 5;
  const parts = [];
  for (let i = 0; i < 3; i++) {
    const t = i / 3;
    const r = (2.5 - t * 1.25) * (0.85 + rnd() * 0.3);
    const ch = h * (0.44 - t * 0.07);
    const g = new THREE.ConeGeometry(r, ch, 6);
    // The first pass started the lowest cone at 30% of the tree's height
    // and every tree on the circuit was a lollipop on a bare pole. Real
    // conifer skirts reach most of the way down.
    g.translate(0, h * (0.15 + t * 0.25) + ch / 2, 0);
    parts.push(g);
  }
  return { crown: mergeGeometries(parts), trunkH: h * 0.20, trunkR: 0.26 };
}

function broadleaf(rnd) {
  const h = 6 + rnd() * 4;
  const parts = [];
  const blobs = 3 + Math.floor(rnd() * 2);
  for (let i = 0; i < blobs; i++) {
    const r = (2.0 + rnd() * 1.4) * (i === 0 ? 1.15 : 0.8);
    const g = new THREE.IcosahedronGeometry(r, 0);
    g.scale(1, 0.82, 1);
    const a = (i / blobs) * Math.PI * 2 + rnd();
    const rad = i === 0 ? 0 : 1.2 + rnd() * 1.1;
    g.translate(Math.cos(a) * rad, h * 0.50 + (rnd() - 0.4) * 1.6, Math.sin(a) * rad);
    parts.push(g);
  }
  return { crown: mergeGeometries(parts), trunkH: h * 0.50, trunkR: 0.3 };
}

/**
 * Trees, in clumps.
 *
 * Scattering them evenly is exactly what makes a field of trees look like
 * a field of cones: real woodland comes in stands, with gaps. So the
 * scatter picks clump centres along the lap and throws a handful of trees
 * around each. It costs nothing and it is most of the difference.
 */
export function makeTrees(points, leftOf, from, to, heightAt, opts = {}) {
  const { density = 0.5, chunks = 12, seed = 23, variants = 6 } = opts;
  const rnd = rng(seed);
  const n = points.length;
  const group = new THREE.Group();
  if (density <= 0) return group;

  // Six shapes, reused. That is plenty of variety once scale, lean and
  // hue are varied per instance on top of them.
  const kinds = [];
  for (let i = 0; i < variants; i++) kinds.push(i % 2 === 0 ? conifer(rnd) : broadleaf(rnd));

  const buckets = [];
  for (let c = 0; c < chunks; c++) buckets.push(kinds.map(() => []));

  const { keep } = opts;
  for (let i = 0; i < n - 1; i += 6) {
    const c = Math.min(chunks - 1, Math.floor((i / n) * chunks));
    for (const side of [1, -1]) {
      if (rnd() > density * 0.55) continue;
      const p = points[i], l = leftOf(p.h);
      const f = at(from, i, side), t = at(to, i, side);
      const off = side * (f + rnd() * (t - f));
      const cx = p.x + l[0] * off, cz = p.z + l[1] * off;
      const count = 2 + Math.floor(rnd() * 7);
      for (let k = 0; k < count; k++) {
        const a = rnd() * Math.PI * 2, rad = rnd() * 17;
        const x = cx + Math.cos(a) * rad, z = cz + Math.sin(a) * rad;
        // EVERY tree asks, not just the clump: a clump centred safely
        // beside one road still throws trees seventeen metres, which is
        // onto the next one
        if (keep && !keep(x, z)) { rnd(); rnd(); rnd(); rnd(); rnd(); continue; }
        buckets[c][Math.floor(rnd() * kinds.length)].push({
          x, y: heightAt(x, z), z,
          s: 0.65 + rnd() * 0.9,
          r: rnd() * Math.PI * 2,
          lean: (rnd() - 0.5) * 0.11,
          hue: rnd(),
        });
      }
    }
  }

  const dark = new THREE.Color(0x24401f), light = new THREE.Color(0x4f7233);
  const olive = new THREE.Color(0x6b7739);
  const tmp = new THREE.Color();
  const d = new THREE.Object3D();
  const trunkMat = std(0x4a3a2a, { roughness: 1 });

  for (let c = 0; c < chunks; c++) {
    for (let ki = 0; ki < kinds.length; ki++) {
      const list = buckets[c][ki];
      if (!list.length) continue;
      const kind = kinds[ki];

      const trunkGeo = new THREE.CylinderGeometry(kind.trunkR * 0.7, kind.trunkR, kind.trunkH, 6);
      trunkGeo.translate(0, kind.trunkH / 2, 0);
      const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, list.length);
      const crowns = new THREE.InstancedMesh(kind.crown,
        windify(std(0xffffff, { roughness: 1 }), 0.035, 0.42), list.length);

      list.forEach((t, i) => {
        d.position.set(t.x, t.y, t.z);
        d.rotation.set(t.lean, t.r, t.lean * 0.7);
        d.scale.set(t.s, t.s * (0.88 + t.hue * 0.35), t.s);
        d.updateMatrix();
        trunks.setMatrixAt(i, d.matrix);
        crowns.setMatrixAt(i, d.matrix);
        tmp.copy(dark).lerp(light, t.hue);
        if (t.hue > 0.86) tmp.lerp(olive, 0.6);
        crowns.setColorAt(i, tmp);
      });
      trunks.instanceMatrix.needsUpdate = true;
      crowns.instanceMatrix.needsUpdate = true;
      if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
      crowns.castShadow = true;
      trunks.computeBoundingSphere();
      crowns.computeBoundingSphere();
      group.add(trunks); group.add(crowns);
    }
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

  // Clouds: flattened lumps, lit by nothing, high enough that they are
  // only ever seen from below. Cheap, and the sky stops being a wash.
  const rnd = rng(9001);
  const parts = [];
  for (let i = 0; i < 40; i++) {
    const a = rnd() * Math.PI * 2, rad = 1100 + rnd() * 2600;
    const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
    const cy = 620 + rnd() * 460;
    const lumps = 3 + Math.floor(rnd() * 4);
    for (let k = 0; k < lumps; k++) {
      const g = new THREE.IcosahedronGeometry(26 + rnd() * 42, 0);
      g.scale(1.7, 0.4, 1.2);
      g.translate(cx + (rnd() - 0.5) * 150, cy + (rnd() - 0.5) * 22, cz + (rnd() - 0.5) * 150);
      parts.push(g);
    }
  }
  const clouds = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshBasicMaterial({
    color: 0xeef4f9, fog: false, transparent: true, opacity: 0.82, depthWrite: false }));
  clouds.frustumCulled = false;
  clouds.renderOrder = -1;
  sky.add(clouds);
  return sky;
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
