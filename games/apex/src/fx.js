// =====================================================================
// APEX :: fx.js - TYRE SMOKE AND THE MARKS IT LEAVES
// =====================================================================
//
// Two effects, both of them one mesh each.
//
// Smoke is a single Points cloud with a fixed pool of particles that get
// reused, so there is no allocation and no garbage in the middle of a
// lap. Skid marks are one big triangle strip per wheel written into a
// pre-allocated buffer that wraps around when it fills - a ring buffer of
// geometry. Neither ever creates an object once the game is running,
// which is the whole reason a lock-up does not cost a frame.
import * as THREE from '../vendor/three.module.js';

export class Smoke {
  constructor(scene, max = 700) {
    this.max = max;
    this.i = 0;
    this.life = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    const pos = new Float32Array(max * 3);
    const size = new Float32Array(max);
    const alpha = new Float32Array(max);
    for (let k = 0; k < max; k++) pos[k * 3 + 1] = -9999;

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alpha, 1));
    this.g = g;

    // a soft round blob, drawn in the shader - no texture to load and it
    // stays sharp at any resolution
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.NormalBlending,
      uniforms: { uScale: { value: innerHeight * 0.5 } },
      vertexShader: `
        attribute float aSize; attribute float aAlpha;
        varying float vA;
        uniform float uScale;
        void main() {
          vA = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSize * uScale / max(1.0, -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float soft = smoothstep(0.5, 0.06, r);
          gl_FragColor = vec4(0.86, 0.87, 0.88, soft * vA);
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** one puff at a contact patch; strength is how hard the tyre is working */
  puff(x, y, z, strength) {
    const n = Math.min(3, 1 + Math.floor(strength * 2));
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.max;
      const p = this.g.attributes.position.array;
      p[i * 3] = x + (Math.random() - 0.5) * 0.4;
      p[i * 3 + 1] = y + Math.random() * 0.2;
      p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      this.vel[i * 3] = (Math.random() - 0.5) * 1.4;
      this.vel[i * 3 + 1] = 0.7 + Math.random() * 1.2;
      this.vel[i * 3 + 2] = (Math.random() - 0.5) * 1.4;
      this.life[i] = 1;
      this.g.attributes.aSize.array[i] = 0.5 + Math.random() * 0.6;
      this.g.attributes.aAlpha.array[i] = Math.min(0.5, 0.14 + strength * 0.3);
    }
  }

  step(dt) {
    const p = this.g.attributes.position.array;
    const a = this.g.attributes.aAlpha.array;
    const s = this.g.attributes.aSize.array;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt * 0.75;
      if (this.life[i] <= 0) { p[i * 3 + 1] = -9999; a[i] = 0; continue; }
      p[i * 3] += this.vel[i * 3] * dt;
      p[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      p[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 0.97; this.vel[i * 3 + 2] *= 0.97;
      this.vel[i * 3 + 1] *= 0.985;
      s[i] += dt * 2.4;                 // it billows as it drifts
      a[i] *= 0.965;
    }
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.aSize.needsUpdate = true;
    this.g.attributes.aAlpha.needsUpdate = true;
  }
}

export class Skids {
  /**
   * One quad per wheel per frame, laid between where that wheel was last
   * frame and where it is now.
   *
   * EACH WHEEL KEEPS ITS OWN LAST POSITION. Sharing one would stitch the
   * front-left to the rear-right and back again every frame and draw a
   * zigzag across the car instead of four separate lines.
   */
  constructor(scene, maxQuads = 6000) {
    this.max = maxQuads;
    this.i = 0;
    this.last = [null, null, null, null];
    const pos = new Float32Array(maxQuads * 18);
    const alp = new Float32Array(maxQuads * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(alp, 1));
    this.g = g;
    const m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      vertexShader: `
        attribute float aAlpha; varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `
        varying float vA;
        void main() { gl_FragColor = vec4(0.04, 0.04, 0.05, vA); }`,
    });
    this.mesh = new THREE.Mesh(g, m);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  /** lay a patch of rubber for wheel k between last frame and this one */
  mark(k, x, z, yaw, strength) {
    const prev = this.last[k];
    this.last[k] = { x, z };
    if (!prev) return;
    const dx = x - prev.x, dz = z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 0.02) return;
    if (len > 6) return;                 // teleported (a reset) - do not join it up
    // across the direction of travel
    const nx = -dz / len * 0.17, nz = dx / len * 0.17;
    const i = this.i = (this.i + 1) % this.max;
    const p = this.g.attributes.position.array;
    const a = this.g.attributes.aAlpha.array;
    const y = 0.014;
    const o = i * 18;
    const put = (j, X, Z) => { p[o + j * 3] = X; p[o + j * 3 + 1] = y; p[o + j * 3 + 2] = Z; };
    put(0, prev.x - nx, prev.z - nz);
    put(1, prev.x + nx, prev.z + nz);
    put(2, x + nx, z + nz);
    put(3, prev.x - nx, prev.z - nz);
    put(4, x + nx, z + nz);
    put(5, x - nx, z - nz);
    const al = Math.min(0.65, strength * 0.6);
    for (let j = 0; j < 6; j++) a[i * 6 + j] = al;
    this.dirty = true;
  }

  /** a wheel that stopped sliding must not join its next mark to this one */
  lift(k) { this.last[k] = null; }

  step() {
    if (!this.dirty) return;
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.aAlpha.needsUpdate = true;
    this.dirty = false;
  }

  clear() {
    this.g.attributes.aAlpha.array.fill(0);
    this.g.attributes.aAlpha.needsUpdate = true;
    this.last = [null, null, null, null];
    this.i = 0;
  }
}
