// =====================================================================
// NASCAR :: crowd.js - A HUNDRED THOUSAND PEOPLE
// =====================================================================
//
// Liam, ten seconds after opening it: "lack of detial no audience car
// models are the same".
//
// He is right, and the audience is the worst of the three, because a
// speedway with an empty grandstand does not read as a quiet race - it
// reads as a TEST TRACK. Daytona holds a hundred thousand people and the
// wall of them behind the fence is half of what the place looks like.
//
// ---------------------------------------------------------------------
// HOW TO DRAW A HUNDRED THOUSAND PEOPLE
// ---------------------------------------------------------------------
//
// One InstancedMesh per stand, one instance per person, about forty
// triangles each. Twelve thousand of them is half a million triangles,
// which sounds enormous and costs one draw call and about a millisecond -
// instancing is very nearly free and the geometry is tiny.
//
// THEY MOVE, and that is what stops them reading as a texture. Every
// instance carries a PHASE and an EAGERNESS, and the vertex shader uses
// them to stand the person up, bob them and sway them when the
// `uExcite` uniform goes up. main.js raises it when the field comes
// past and slams it to one when somebody hits the wall, so the stand in
// front of the leader is on its feet and the far end of the backstretch
// is still sitting down. That one detail is the difference between a
// crowd and wallpaper.
//
// No skeletons, no bones, no per-frame CPU work at all: two floats per
// person uploaded once, and a uniform.
import * as THREE from '../vendor/three.module.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * A seated spectator: thirty-two triangles, hand-built out of quads.
 *
 * IT USED TO BE THIRTY-SIX AND IT USED TO READ AS A BOWLING PIN. Three
 * primitives were merged - a six-sided cylinder, a head box and a knee
 * box - and the whole thing was tinted one colour by the instance, so
 * every spectator was a pillar of a single shade with no head, no
 * shoulders and no shading down it. Fifty thousand of those is a pastel
 * lattice, which is exactly what Liam has now complained about twice.
 *
 * What a person needs to read as a person at forty metres, in order of
 * how much each one buys:
 *
 *   A HEAD THAT IS NOT THE COLOUR OF THE SHIRT. One value break at the
 *   right height and the silhouette snaps into a body with something on
 *   top of it. This is most of the whole fix.
 *   SHOULDERS WIDER THAN THE WAIST, because the T is the shape the eye
 *   reads as human and a plain cylinder is the shape it reads as a post.
 *   SHADING DOWN THE BODY. In a packed stand your legs are in the shade
 *   of the row in front and your head is in the sky; flat lighting on a
 *   flat colour is what makes a crowd look printed on.
 *
 * All three are per-vertex data, not geometry, so they are free.
 *
 * Every quad is written out by hand rather than merged from primitives
 * because FACES THAT CANNOT BE SEEN ARE NOT BUILT: the underside of the
 * thighs, the back of the lap and the top of the head never face a camera
 * that is down on the racing surface looking UP into a raked stand. That
 * is where the four triangles came from that paid for the shoulders.
 *
 * Two attributes ride along with every vertex:
 *   aPart  0 = clothing (takes the instance colour). On the head it runs
 *          1 at the chin to 2 at the crown, so the same number says both
 *          "this is skin" and "how far up the face you are" - which is
 *          what puts a hairline on a head made of four flat quads.
 *   aTone  a baked ambient-occlusion multiplier, 0.52 at the feet to 1.05
 *          at the head - matched to photographs of a full grandstand,
 *          where the seat backs eat about a third of the light at knee
 *          height. It went down to 0.4 on the first attempt and the lower
 *          half of every stand turned into a black band.
 */
function personGeometry() {
  const pos = [], nor = [], uv = [], part = [], tone = [];
  // a quad, counter-clockwise seen from the front, plus the per-vertex
  // extras that are constant across it
  const quad = (a, b, c, d, pt, tn) => {
    const ux = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const vx = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
    let n = [ux[1] * vx[2] - ux[2] * vx[1], ux[2] * vx[0] - ux[0] * vx[2], ux[0] * vx[1] - ux[1] * vx[0]];
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / len, n[1] / len, n[2] / len];
    // a, b are the bottom edge and c, d the top, so a value written as
    // [bottom, top] can be ramped up the face. That is what gives the
    // torso its shading gradient and the head its hairline.
    const ramp = (v, lo, hi) => (Array.isArray(v) ? [v[lo], v[lo], v[hi], v[lo], v[hi], v[hi]] : [v, v, v, v, v, v]);
    const pv = ramp(pt, 0, 1), tv = ramp(tn, 0, 1);
    const corners = [[a, [0, 0]], [b, [1, 0]], [c, [1, 1]], [a, [0, 0]], [c, [1, 1]], [d, [0, 1]]];
    for (let k = 0; k < 6; k++) {
      const v = corners[k][0], t = corners[k][1];
      pos.push(v[0], v[1], v[2]);
      nor.push(n[0], n[1], n[2]);
      uv.push(t[0], t[1]);
      part.push(pv[k]);
      tone.push(tv[k]);
    }
  };

  // ---- the lap: thighs forward off the seat, 8 triangles ---------------
  // no underside and no back face: both are inside the seat.
  const LX = 0.17, LY = 0.155, LZ = 0.33;
  quad([-LX, LY, 0], [LX, LY, 0], [LX, LY, LZ], [-LX, LY, LZ], 0, [0.70, 0.70]);   // top of the thighs
  quad([-LX, 0, LZ], [LX, 0, LZ], [LX, LY, LZ], [-LX, LY, LZ], 0, [0.52, 0.66]);   // knees
  quad([LX, 0, 0], [LX, 0, LZ], [LX, LY, LZ], [LX, LY, 0], 0, [0.54, 0.68]);
  quad([-LX, 0, LZ], [-LX, 0, 0], [-LX, LY, 0], [-LX, LY, LZ], 0, [0.54, 0.68]);

  // ---- the torso: a five-sided tapered prism, open top and bottom ------
  // Five and not six: at forty metres one flat is a quarter of a pixel,
  // and the two triangles it saves are the shoulders.
  const TY0 = 0.13, TY1 = 0.58;
  for (let i = 0; i < 5; i++) {
    const a0 = (i / 5) * Math.PI * 2 + 0.6, a1 = ((i + 1) / 5) * Math.PI * 2 + 0.6;
    const rb = 0.155, rt = 0.175;      // waist to chest
    const P = (a, r, y) => [Math.cos(a) * r, y, Math.sin(a) * r * 0.82];
    quad(P(a0, rb, TY0), P(a1, rb, TY0), P(a1, rt, TY1), P(a0, rt, TY1), 0, [0.74, 0.97]);
  }

  // ---- shoulders and upper arms: three quads, 6 triangles ---------------
  // The back is never built - there is another spectator directly behind
  // it in every row but the last.
  const SX = 0.245, SY0 = 0.42, SY1 = 0.60, SZ = 0.105;
  quad([-SX, SY0, SZ], [SX, SY0, SZ], [SX, SY1, SZ], [-SX, SY1, SZ], 0, [0.82, 1.0]);
  quad([SX, SY0, -SZ], [SX, SY0, SZ], [SX, SY1, SZ], [SX, SY1, -SZ], 0, [0.80, 0.98]);
  quad([-SX, SY0, SZ], [-SX, SY0, -SZ], [-SX, SY1, -SZ], [-SX, SY1, SZ], 0, [0.80, 0.98]);

  // ---- the head: four quads of skin, 8 triangles ------------------------
  // The top face is missing on purpose. Everybody looking at this crowd
  // is below it looking up.
  const HX = 0.088, HY0 = 0.615, HY1 = 0.795, HZ = 0.088;
  // the face keeps a little more skin than the sides and the back does:
  // a hairline sits lower behind the ear than it does over the brow.
  const FACE = [1.0, 1.72], SIDE = [1.0, 1.9], BACK = [1.25, 2.0];
  quad([-HX, HY0, HZ], [HX, HY0, HZ], [HX, HY1, HZ], [-HX, HY1, HZ], FACE, [1.0, 1.05]);
  quad([HX, HY0, -HZ], [-HX, HY0, -HZ], [-HX, HY1, -HZ], [HX, HY1, -HZ], BACK, [0.86, 0.92]);
  quad([HX, HY0, -HZ], [HX, HY0, HZ], [HX, HY1, HZ], [HX, HY1, -HZ], SIDE, [0.94, 1.0]);
  quad([-HX, HY0, HZ], [-HX, HY0, -HZ], [-HX, HY1, -HZ], [-HX, HY1, HZ], SIDE, [0.94, 1.0]);

  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('aPart', new THREE.Float32BufferAttribute(part, 1));
  g.setAttribute('aTone', new THREE.Float32BufferAttribute(tone, 1));
  return g;
}

let PERSON = null;

/**
 * THE SHADER INJECTION.
 *
 * Stock MeshStandardMaterial, with three extra lines of vertex shader
 * bolted on through onBeforeCompile. `aPhase` spreads them out in time so
 * they are not a Mexican wave of clones; `aEager` decides who is on their
 * feet first, so the crowd stands up raggedly the way a real one does.
 */
function crowdMaterial() {
  // NOT vertexColors. An InstancedMesh's per-instance colour arrives
  // through instanceColor, which three wires up on its own; asking for
  // vertexColors as well makes the shader multiply by a per-VERTEX colour
  // attribute that does not exist, and a missing attribute in WebGL reads
  // as zero. Every one of the eleven thousand spectators came out matt
  // black, which from the racing surface looked exactly like an empty
  // grandstand full of shadow.
  const m = new THREE.MeshStandardMaterial({
    // 0.9 was letting the sky dome light the shirts almost as hard as the
    // sun did, which is what kept the stand pale however dark the palette
    // was written. A spectator is under a roof with forty rows of other
    // people round them; they see about a quarter of the sky.
    roughness: 0.94, metalness: 0.0, envMapIntensity: 0.42,
  });
  m.userData.uniforms = { uTime: { value: 0 }, uExcite: { value: 0.12 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uniforms.uTime;
    sh.uniforms.uExcite = m.userData.uniforms.uExcite;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPhase;
        attribute float aEager;
        attribute float aSkin;
        attribute float aHair;
        attribute float aPart;
        attribute float aTone;
        uniform float uTime;
        uniform float uExcite;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // how far out of their seat this one is, 0 sitting, 1 up and waving.
        // A NEGATIVE aEager MEANS ALREADY STANDING and staying that way:
        // every real grandstand has a scattering of people on their feet in
        // the aisles all race, and without them a quiet crowd is a perfectly
        // level field of heads, which no crowd has ever been.
        float up = aEager < 0.0 ? 1.0 : clamp(uExcite * 1.9 - aEager, 0.0, 1.0);
        float t = uTime * 5.0 + aPhase * 6.28318;
        transformed.y += up * 0.34 + sin(t) * 0.055 * up;
        transformed.x += sin(t * 0.8 + 1.7) * 0.075 * up;
        // and they lean forward as they get up
        transformed.z += up * 0.10 * transformed.y;`)
      // THE HEAD IS NOT THE COLOUR OF THE SHIRT. instanceColor has already
      // been multiplied into vColor by <color_vertex>; this replaces it
      // with skin on the head vertices and shades the whole body down
      // towards the feet. Doing it here rather than in the fragment shader
      // costs five instructions per VERTEX instead of per pixel, and there
      // are a hundred times more spectator pixels than spectator vertices.
      .replace('#include <color_vertex>', `#include <color_vertex>
        // aSkin runs 0 (deep brown) to 1 (pale). These are LINEAR values,
        // because that is the space vColor is in; the pale end is sRGB
        // #c99a80 and the dark end #4c2f22, which between them cover a
        // grandstand.
        vec3 skin = mix(vec3(0.075, 0.036, 0.022), vec3(0.56, 0.33, 0.22), aSkin * aSkin);
        // and the top of the head is hair or a cap, faded in over the
        // upper third of the face. aHair below 0 means bald or bare-headed.
        float hairline = clamp((aPart - 1.0) * 1.6 - 0.6, 0.0, 1.0) * step(0.0, aHair);
        vec3 hair = skin * 0.10 + vec3(0.012, 0.010, 0.010) + vColor.rgb * max(aHair, 0.0) * 0.5;
        float isSkin = step(0.5, aPart);
        vColor.rgb = mix(vColor.rgb, mix(skin, hair, hairline), isSkin) * aTone;`);
  };
  return m;
}

export class Crowd {
  constructor() {
    this.group = new THREE.Group();
    this.group.name = 'crowd';
    this.mats = [];
    this.excite = 0.12;
    if (!PERSON) PERSON = personGeometry();
  }

  /**
   * Fill a bank of seating.
   *
   * @param seats  [{ x, y, z, h }]  one per person: where they sit and
   *               which way they are looking
   */
  fill(seats, { name = 'stand' } = {}) {
    if (!seats.length) return null;
    const mat = crowdMaterial();
    const mesh = new THREE.InstancedMesh(PERSON, mat, seats.length);
    mesh.name = name;
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    const phase = new Float32Array(seats.length);
    const eager = new Float32Array(seats.length);
    const skin = new Float32Array(seats.length);
    const hair = new Float32Array(seats.length);
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let seed = 1337;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
    seats.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      // A WHOLE STAND FACING EXACTLY THE SAME WAY is the other half of
      // why this read as a lattice: identical headings put every shoulder
      // line on the same plane, and forty rows of that is corduroy. A
      // fifth of a radian each way is what people watching the same corner
      // from different seats actually do.
      dummy.rotation.set(0, s.h + (rnd() - 0.5) * 0.42, 0);
      // and they are not all the same size. A seated adult is 1.25 m to
      // the top of the head and a child is 0.95; the geometry is built at
      // 0.80 m, so the scale range is what covers both.
      const sc = 0.88 + rnd() * 0.38;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // MUTED, and that is deliberate: full-saturation shirts turn a
      // grandstand into rainbow static at any distance over fifty metres.
      // A real crowd is mostly white, grey, denim and one person in red.
      // A CROWD IS DARKER THAN YOU THINK. Photograph a full grandstand and
      // it is mostly navy, charcoal, denim and shade, with white shirts as
      // the bright specks rather than the base.
      //
      // IN sRGB, WHICH IS THE BUG THAT MADE THE ABOVE PARAGRAPH A LIE.
      // Color.setHSL defaults to the renderer's WORKING colour space, which
      // is linear-sRGB, so a lightness of 0.5 written here arrived on
      // screen at about 0.74 and every value below was roughly 40 per cent
      // brighter than it reads in the source. The stand has been pastel
      // ever since, whatever the numbers said. Naming the space fixes it.
      const SRGB = THREE.SRGBColorSpace;
      const r = rnd();
      if (r < 0.32) col.setHSL(0.60 + rnd() * 0.05, 0.14 + rnd() * 0.20, 0.21 + rnd() * 0.14, SRGB);
      else if (r < 0.58) col.setHSL(rnd(), 0.04 + rnd() * 0.08, 0.17 + rnd() * 0.14, SRGB);
      else if (r < 0.78) col.setHSL(0.08 + rnd() * 0.06, 0.06 + rnd() * 0.12, 0.34 + rnd() * 0.18, SRGB);
      else if (r < 0.94) col.setHSL(0.10, 0.03 + rnd() * 0.06, 0.54 + rnd() * 0.18, SRGB);
      // ONE IN SIXTEEN, AND NOT A PRIMARY. The first pass at this put a
      // tenth of the stand at 70 per cent saturation and the result was
      // magenta and lime scattered through a bank that is otherwise navy
      // and denim - from the racing surface it read as confetti, not
      // people. A bright shirt in a real crowd is a muted red or a green.
      else col.setHSL(rnd(), 0.26 + rnd() * 0.24, 0.29 + rnd() * 0.16, SRGB);
      mesh.setColorAt(i, col);
      phase[i] = rnd();
      // ABOUT ONE IN FOURTEEN IS ON THEIR FEET WHATEVER THE RACE IS DOING -
      // the aisles, the ones going for a beer, the ones who never sit down.
      // The shader reads a negative eagerness as "already standing".
      eager[i] = rnd() < 0.07 ? -1 : rnd() * 0.95;
      skin[i] = 0.18 + rnd() * 0.82;              // 0 dark, 1 pale
      // WHAT IS ON TOP OF THE HEAD. Below zero is bare - bald, or a head
      // of hair so short it reads as scalp. Zero is dark hair. Above zero
      // is a cap, and the number is how much of the shirt colour it takes,
      // because the caps in a grandstand are team caps and match what the
      // person under them is wearing about as often as not.
      const hat = rnd();
      hair[i] = hat < 0.10 ? -1 : hat < 0.52 ? 0 : 0.25 + rnd() * 0.75;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.geometry = PERSON.clone();
    mesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.geometry.setAttribute('aEager', new THREE.InstancedBufferAttribute(eager, 1));
    mesh.geometry.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 1));
    mesh.geometry.setAttribute('aHair', new THREE.InstancedBufferAttribute(hair, 1));
    this.group.add(mesh);
    this.mats.push(mat);
    return mesh;
  }

  /** every frame: the clock, and how worked up they are */
  step(dt, excite) {
    this.excite += (excite - this.excite) * Math.min(1, dt * 1.8);
    for (const m of this.mats) {
      m.userData.uniforms.uTime.value += dt;
      m.userData.uniforms.uExcite.value = this.excite;
    }
  }

  get count() {
    let n = 0;
    for (const m of this.group.children) n += m.count || 0;
    return n;
  }
}

// =====================================================================
// THE INFIELD, WHICH IS ALSO FULL OF PEOPLE
// =====================================================================
//
// The Daytona infield is a small town for a week: motorhomes parked nose
// to tail on the banks, awnings, flags, people on the roofs. It is the
// thing you look at down the backstretch, and an empty green field there
// is as wrong as an empty grandstand.
function rvTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#e8e6e0'; g.fillRect(0, 0, 256, 128);
  // a stripe down the side, a window band and a door
  g.fillStyle = '#b8bdc4'; g.fillRect(0, 74, 256, 16);
  g.fillStyle = '#8a5a2a'; g.fillRect(0, 90, 256, 8);
  g.fillStyle = '#39424e';
  for (let x = 14; x < 246; x += 34) g.fillRect(x, 34, 22, 26);
  g.fillStyle = '#c9ccd2'; g.fillRect(200, 30, 20, 60);
  // roof clutter
  g.fillStyle = '#d0d3d6'; g.fillRect(0, 0, 256, 22);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Motorhomes, awnings and flags, parked along a line.
 *
 * @param poses  [{ x, z, h }] where each rig sits
 */
export function motorhomes(poses) {
  const g = new THREE.Group();
  g.name = 'infieldCamp';
  if (!poses.length) return g;
  const body = new THREE.BoxGeometry(2.9, 3.3, 10.5);
  body.translate(0, 1.85, 0);
  const mat = new THREE.MeshStandardMaterial({
    map: rvTexture(), roughness: 0.45, metalness: 0.15, envMapIntensity: 1.0,
  });
  const mesh = new THREE.InstancedMesh(body, mat, poses.length);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let seed = 9001;
  const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
  const col = new THREE.Color();
  poses.forEach((p, i) => {
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.h, 0);
    const l = 0.75 + rnd() * 0.6;
    dummy.scale.set(0.9 + rnd() * 0.25, 0.9 + rnd() * 0.2, l);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
    col.setHSL(rnd(), 0.05 + rnd() * 0.22, 0.72 + rnd() * 0.2);
    mesh.setColorAt(i, col);
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  g.add(mesh);

  // awnings out of one side of every other one
  const aw = new THREE.BoxGeometry(3.0, 0.06, 5.0);
  aw.translate(2.4, 2.5, 0);
  const awMat = new THREE.MeshStandardMaterial({ color: 0xdfd6c0, roughness: 0.85, side: THREE.DoubleSide });
  const awns = new THREE.InstancedMesh(aw, awMat, Math.ceil(poses.length / 2));
  let k = 0;
  poses.forEach((p, i) => {
    if (i % 2) return;
    dummy.position.set(p.x, 0, p.z);
    dummy.rotation.set(0, p.h, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    awns.setMatrixAt(k++, dummy.matrix);
  });
  awns.count = k;
  awns.castShadow = true;
  g.add(awns);
  return g;
}

/**
 * A flag on a pole that actually flaps: one strip of geometry, waved in
 * the vertex shader off the same clock as the crowd.
 */
export function flags(poses, colours) {
  const g = new THREE.Group();
  g.name = 'flags';
  if (!poses.length) return g;
  const pole = new THREE.CylinderGeometry(0.05, 0.06, 7, 5);
  pole.translate(0, 3.5, 0);
  const poleMesh = new THREE.InstancedMesh(pole,
    new THREE.MeshStandardMaterial({ color: 0xa8adb4, roughness: 0.4, metalness: 0.6 }), poses.length);
  const cloth = new THREE.PlaneGeometry(2.2, 1.3, 10, 2);
  cloth.translate(1.1, 6.2, 0);
  const clothMat = new THREE.MeshStandardMaterial({
    roughness: 0.9, side: THREE.DoubleSide,
  });
  clothMat.userData.uniforms = { uTime: { value: 0 } };
  clothMat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = clothMat.userData.uniforms.uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float f = transformed.x / 2.2;
        transformed.z += sin(uTime * 4.0 + transformed.x * 2.6) * 0.34 * f;
        transformed.y += sin(uTime * 3.1 + transformed.x * 1.8) * 0.10 * f;`);
  };
  const clothMesh = new THREE.InstancedMesh(cloth, clothMat, poses.length);
  const dummy = new THREE.Object3D();
  const col = new THREE.Color();
  poses.forEach((p, i) => {
    dummy.position.set(p.x, p.y || 0, p.z);
    dummy.rotation.set(0, p.h, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    poleMesh.setMatrixAt(i, dummy.matrix);
    clothMesh.setMatrixAt(i, dummy.matrix);
    col.set(colours[i % colours.length]);
    clothMesh.setColorAt(i, col);
  });
  poleMesh.instanceMatrix.needsUpdate = true;
  clothMesh.instanceMatrix.needsUpdate = true;
  if (clothMesh.instanceColor) clothMesh.instanceColor.needsUpdate = true;
  poleMesh.castShadow = true;
  g.add(poleMesh, clothMesh);
  g.userData.mat = clothMat;
  return g;
}
