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
import { mergeGeometries } from '../vendor/jsm/utils/BufferGeometryUtils.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/**
 * A seated spectator: thirty-six triangles.
 *
 * Thirty-six, not the four hundred a capsule and a sphere would cost,
 * because there are fifteen thousand of them and the nearest is sixty
 * metres away behind a catch fence. An open-ended six-sided cylinder for
 * the body, a box for the head and a box for the knees is enough to read
 * as a person from the racing surface, which is the only place anyone is
 * looking at them from.
 */
function personGeometry() {
  const parts = [];
  const torso = new THREE.CylinderGeometry(0.19, 0.23, 0.52, 6, 1, true);
  torso.translate(0, 0.30, 0);
  parts.push(torso);
  const head = new THREE.BoxGeometry(0.19, 0.21, 0.18);
  head.translate(0, 0.66, 0);
  parts.push(head);
  const knees = new THREE.BoxGeometry(0.34, 0.16, 0.30);
  knees.translate(0, 0.06, 0.16);
  parts.push(knees);
  const g = mergeGeometries(parts.map((p) => {
    if (!p.attributes.uv) p.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(p.attributes.position.count * 2), 2));
    return p.index ? p.toNonIndexed() : p;
  }));
  g.computeVertexNormals();
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
    roughness: 0.90, metalness: 0.0, envMapIntensity: 0.9,
  });
  m.userData.uniforms = { uTime: { value: 0 }, uExcite: { value: 0.12 } };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = m.userData.uniforms.uTime;
    sh.uniforms.uExcite = m.userData.uniforms.uExcite;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aPhase;
        attribute float aEager;
        uniform float uTime;
        uniform float uExcite;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        // how far out of their seat this one is, 0 sitting, 1 up and waving
        float up = clamp(uExcite * 1.9 - aEager, 0.0, 1.0);
        float t = uTime * 5.0 + aPhase * 6.28318;
        transformed.y += up * 0.34 + sin(t) * 0.055 * up;
        transformed.x += sin(t * 0.8 + 1.7) * 0.075 * up;
        // and they lean forward as they get up
        transformed.z += up * 0.10 * transformed.y;`);
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
    const dummy = new THREE.Object3D();
    const col = new THREE.Color();
    let seed = 1337;
    const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff) / 0x7fffffff;
    seats.forEach((s, i) => {
      dummy.position.set(s.x, s.y, s.z);
      dummy.rotation.set(0, s.h, 0);
      const sc = 0.80 + rnd() * 0.22;
      dummy.scale.set(sc, sc, sc);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // MUTED, and that is deliberate: full-saturation shirts turn a
      // grandstand into rainbow static at any distance over fifty metres.
      // A real crowd is mostly white, grey, denim and one person in red.
      // A CROWD IS DARKER THAN YOU THINK. Photograph a full grandstand and
      // it is mostly navy, charcoal, denim and shade, with white shirts as
      // the bright specks rather than the base. The first version made
      // forty per cent of them pale cream and the whole stand read as a
      // tray of bowling pins.
      const r = rnd();
      if (r < 0.30) col.setHSL(0.60 + rnd() * 0.05, 0.10 + rnd() * 0.16, 0.16 + rnd() * 0.12);
      else if (r < 0.56) col.setHSL(rnd(), 0.04 + rnd() * 0.08, 0.14 + rnd() * 0.12);
      else if (r < 0.76) col.setHSL(0.08 + rnd() * 0.06, 0.06 + rnd() * 0.10, 0.36 + rnd() * 0.18);
      else if (r < 0.90) col.setHSL(0.10, 0.03 + rnd() * 0.05, 0.62 + rnd() * 0.22);
      else col.setHSL(rnd(), 0.30 + rnd() * 0.30, 0.30 + rnd() * 0.16);
      mesh.setColorAt(i, col);
      phase[i] = rnd();
      eager[i] = rnd() * 0.95;
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.geometry = PERSON.clone();
    mesh.geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phase, 1));
    mesh.geometry.setAttribute('aEager', new THREE.InstancedBufferAttribute(eager, 1));
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
