// =====================================================================
// NASCAR :: flora.js - GRASS THAT MOVES, AND TREES WITH LEAVES ON THEM
// =====================================================================
//
// Liam: "real grass trees". A textured green plane is not grass. What
// makes grass read as grass at the edge of a racetrack is that it has
// BLADES - individual things with a silhouette against the asphalt - and
// that the whole bank of them moves together when the wind crosses it,
// and flattens away from a car that goes past.
//
// The cost is the whole problem. Daytona is two and a half miles round;
// a verge six metres wide either side of the racing surface is about
// fifty thousand square metres, and grass at any believable density is
// hundreds of blades per square metre. That is tens of millions of
// blades, which is not a budget, it is a joke.
//
// So this does three things:
//
//   ONE INSTANCED MESH, THREE TRIANGLES PER BLADE, NO TEXTURE. A blade
//   is a strip tapered to a point, drawn double-sided with no alpha test
//   - no texture fetch, no sorting, no discard. Thirty-six thousand
//   blades is a hundred and eight thousand triangles in ONE draw call,
//   which against a 2.3 M triangle frame is four and a half per cent.
//
//   ONLY WHERE YOU LOOK. The blades go in a band along the inside edge
//   of the racing surface - the strip between the apron and the infield
//   that a driver's eye crosses every corner - and NOT over the
//   quarter-square-mile of infield nobody gets within two hundred metres
//   of. That keeps its textured plane, and at that distance a textured
//   plane is indistinguishable from anything better.
//
//   THE MOVEMENT IS FREE. Each blade carries its own world position and
//   its own heading as instanced attributes; the vertex shader leans the
//   tip by a travelling sine and bends it away from wherever the game
//   says the nearest car is. Nothing is uploaded per frame but two
//   uniforms.
//
// WHY THE WIND IS APPLIED IN OBJECT SPACE. The obvious way is to build
// the world position in the shader and push it about, but three declares
// `vec4 worldPosition` itself inside <worldpos_vertex> whenever a shadow
// or a fog or a clipping plane needs it, and declaring your own is a
// redeclaration error that only shows up on the machines that happen to
// have shadows on. So each blade knows its own heading, and the world
// wind vector is rotated backwards into the blade's own frame before it
// is added to `transformed`. Same answer, no fight with three.
import * as THREE from '../vendor/three.module.js';
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

// =====================================================================
// ONE BLADE
// =====================================================================
//
// Six vertices, three triangles, tapered: 5 cm across at the root and a
// point at the tip, with one kink in the middle so it can bend rather
// than shear.
function bladeGeometry() {
  const pos = [], nor = [], uv = [];
  const w = 0.036;
  // three blades, each splayed out from the root, leaning different ways
  const blades = [
    { a: 0.0, lean: 0.10, h: 1.00, dx: 0.00, dz: 0.00 },
    { a: 2.1, lean: 0.34, h: 0.80, dx: 0.055, dz: 0.030 },
    { a: 4.3, lean: 0.30, h: 0.88, dx: -0.045, dz: 0.050 },
  ];
  for (const b of blades) {
    const c = Math.cos(b.a), s = Math.sin(b.a);
    // the blade lies in its own plane, turned by a about Y, and its tip
    // is pushed out by lean so a tuft opens like a tuft
    const V = (u, y) => {
      const x = u * c, z = u * s;
      const t = y / b.h;
      const out = b.lean * t * t;
      return [x + b.dx + c * out * 0.0 + s * out, y, z + b.dz - c * out];
    };
    const mid = b.h * 0.6;
    const quad = (y0, y1, w0, w1) => {
      const A = V(-w0, y0), B = V(w0, y0), C = V(w1, y1), D = V(-w1, y1);
      pos.push(...A, ...B, ...C, ...A, ...C, ...D);
      for (let k = 0; k < 6; k++) { nor.push(-s, 0.45, c); }
      uv.push(0, y0 / b.h, 1, y0 / b.h, 1, y1 / b.h, 0, y0 / b.h, 1, y1 / b.h, 0, y1 / b.h);
    };
    quad(0, mid, w, w * 0.55);
    // the tip
    const A = V(-w * 0.55, mid), B = V(w * 0.55, mid), C = V(0, b.h);
    pos.push(...A, ...B, ...C);
    for (let k = 0; k < 3; k++) nor.push(-s, 0.45, c);
    uv.push(0, 0.6, 1, 0.6, 0.5, 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.normalizeNormals();
  return g;
}

const GRASS_HEAD = `
attribute float aPhase;
attribute float aTall;
attribute float aYaw;
attribute vec3 aRoot;
uniform float uTime;
uniform vec3 uCar;
uniform float uWind;
varying float vUp;
`;

const GRASS_BODY = `
  // how far up the blade this vertex is, before the height scale
  vUp = clamp(position.y, 0.0, 1.0);
  float up = vUp * vUp;
  transformed.y *= aTall;

  // THE WIND, as a wave travelling across the bank rather than everything
  // leaning at once, plus a slow gust that swells and dies
  float w = sin(uTime * 1.9 + aPhase * 6.2832 + aRoot.x * 0.055 + aRoot.z * 0.047);
  float gust = 0.55 + 0.45 * sin(uTime * 0.37 + aPhase * 3.1);
  vec2 push = vec2(w, w * 0.62) * uWind * gust * up;

  // THE CAR. Anything inside seven metres of it, and within four metres
  // vertically so a car on the top groove does not flatten the infield
  // nine metres below it, gets blown flat away from the car.
  vec2 away = aRoot.xz - uCar.xz;
  float dist = length(away);
  float blow = smoothstep(7.5, 1.0, dist) * (1.0 - smoothstep(2.5, 5.0, abs(aRoot.y - uCar.y)));
  push += normalize(away + vec2(1e-4)) * blow * up * 1.6;

  // rotate the world-space push backwards into this blade's own frame
  float cs = cos(-aYaw), sn = sin(-aYaw);
  transformed.x += push.x * cs - push.y * sn;
  transformed.z += push.x * sn + push.y * cs;
  transformed.y -= (blow * 0.45 + abs(w) * uWind * 0.35) * up;
`;

/**
 * A band of grass down one side of the racetrack.
 *
 * @param oval   a buildOval()
 * @param at     buildTrack's (i, lat, lift) -> [x, y, z]
 * @param from   the lateral offset the band starts at
 * @param to     ...and ends at
 * @param count  how many blades to spend on it
 */
export function grassBand(oval, at, from, to, count, seed0 = 4021) {
  const P = oval.points, n = P.length;
  const geo = bladeGeometry();
  // Lambert, not Standard: grass has no specular worth having and the
  // cheaper shader matters when it is running on a hundred thousand
  // triangles of two-triangle objects.
  const mat = new THREE.MeshLambertMaterial({ color: 0x6f9a46, side: THREE.DoubleSide });

  const phase = new Float32Array(count);
  const tall = new Float32Array(count);
  const yaw = new Float32Array(count);
  const root = new Float32Array(count * 3);
  const mesh = new THREE.InstancedMesh(geo, mat, count);
  const d = new THREE.Object3D();
  let seed = seed0;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;

  for (let k = 0; k < count; k++) {
    const i = Math.min(n - 1, Math.floor((k / count) * n));
    const lat = from + (to - from) * rnd();
    const p = at(i, lat);
    const x = p[0] + (rnd() - 0.5) * 1.6, z = p[2] + (rnd() - 0.5) * 1.6;
    const a = rnd() * 6.2832;
    d.position.set(x, p[1] - 0.05, z);
    d.rotation.set(0, a, 0);
    const s = 0.85 + rnd() * 0.8;
    d.scale.set(s, s, s);
    d.updateMatrix();
    mesh.setMatrixAt(k, d.matrix);
    phase[k] = rnd();
    tall[k] = 0.36 + rnd() * 0.30;      // 36 to 66 cm, which is verge grass
    yaw[k] = a;
    root[k * 3] = x; root[k * 3 + 1] = p[1]; root[k * 3 + 2] = z;
  }
  geo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
  geo.setAttribute('aTall', new THREE.InstancedBufferAttribute(tall, 1));
  geo.setAttribute('aYaw', new THREE.InstancedBufferAttribute(yaw, 1));
  geo.setAttribute('aRoot', new THREE.InstancedBufferAttribute(root, 3));

  const uniforms = {
    uTime: { value: 0 },
    uCar: { value: new THREE.Vector3(0, -999, 0) },
    uWind: { value: 0.13 },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = GRASS_HEAD + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + GRASS_BODY);
    sh.fragmentShader = 'varying float vUp;\n' + sh.fragmentShader
      .replace('#include <dithering_fragment>',
        '#include <dithering_fragment>\n  gl_FragColor.rgb *= mix(0.40, 1.22, vUp);');
  };
  mat.customProgramCacheKey = () => 'grassblade';
  mesh.userData.uniforms = uniforms;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = 'grass';
  // ONE bounding sphere round the whole speedway, so it is never culled.
  // Deliberate: a per-instance cull would cost more on the CPU than the
  // whole mesh costs on the GPU.
  mesh.frustumCulled = false;
  return mesh;
}

/**
 * A tree: a trunk, and four clumps of leaves at different heights.
 *
 * An icosahedron painted green is a lump. What makes a tree at two
 * hundred metres is a RAGGED SILHOUETTE and two tones of green inside
 * it, so this is four overlapping squashed clumps at different heights
 * and sizes, turned so their facets do not line up - four hundred
 * triangles for an outline that is not a circle.
 *
 * Returned as two geometries so they can be instanced separately: the
 * trunk is one flat brown and the canopy is shaded up the height.
 */
export function treeGeometry() {
  const trunk = new THREE.CylinderGeometry(0.22, 0.44, 4.4, 6, 1);
  trunk.translate(0, 2.2, 0);

  const clumps = [];
  const spec = [
    [0.0, 5.8, 0.0, 3.0],
    [1.7, 4.8, 0.8, 2.1],
    [-1.4, 5.3, -1.1, 2.0],
    [0.4, 7.4, 0.5, 1.7],
  ];
  for (const [x, y, z, r] of spec) {
    const c = new THREE.IcosahedronGeometry(r, 1);
    c.scale(1.0, 0.76, 1.05);
    c.rotateY(x * 1.7 + z * 2.3);
    c.translate(x, y, z);
    clumps.push(c);
  }
  const canopy = mergeGeometries(clumps);
  canopy.computeVertexNormals();
  return { trunk, canopy };
}

/**
 * The canopy material: green, flat shaded, and darker underneath.
 *
 * The gradient is the whole trick. A single green sphere reads as a
 * balloon; the same sphere with the underside in shadow and the top
 * catching the sky reads as foliage, and it costs one varying.
 */
export function canopyMaterial() {
  const m = new THREE.MeshLambertMaterial({ color: 0x4f7a35, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying float vLeafY;\n' + sh.vertexShader
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vLeafY = clamp((position.y - 2.8) / 6.0, 0.0, 1.0);');
    sh.fragmentShader = 'varying float vLeafY;\n' + sh.fragmentShader
      .replace('#include <dithering_fragment>',
        `#include <dithering_fragment>
  gl_FragColor.rgb *= mix(0.46, 1.25, vLeafY);
  gl_FragColor.rgb *= mix(vec3(0.92, 1.0, 0.86), vec3(1.06, 1.0, 0.80), vLeafY);`);
  };
  m.customProgramCacheKey = () => 'canopy';
  return m;
}
