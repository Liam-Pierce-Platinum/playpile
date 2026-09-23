// =====================================================================
// APEX :: fx.js - SMOKE, SPRAY, TYRE MARKS, SPARKS AND SPEED LINES
// =====================================================================
//
// Smoke (and, in a second colour, the spray off wet tyres) is a single
// Points cloud with a fixed pool of particles that get reused, so there
// is no allocation and no garbage in the middle of a lap. Sparks are the
// same idea drawn as streaks. Tyre marks are allowed to grow - they are
// kept for the whole race - but in big pre-allocated chunks, so a lock-up
// still does not cost a frame.
import * as THREE from '../vendor/three.module.js';

export class Smoke {
  constructor(scene, max = 700, colour = [0.86, 0.87, 0.88]) {
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
          gl_FragColor = vec4(${colour.map((c) => c.toFixed(3)).join(", ")}, soft * vA);
        }`,
    });
    this.points = new THREE.Points(g, m);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** one puff at a contact patch; strength is how hard the tyre is working */
  puff(x, y, z, strength, size = 1, vx = 0, vz = 0) {
    const n = Math.min(3, 1 + Math.floor(strength * 2));
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.max;
      const p = this.g.attributes.position.array;
      p[i * 3] = x + (Math.random() - 0.5) * 0.4;
      p[i * 3 + 1] = y + Math.random() * 0.2;
      p[i * 3 + 2] = z + (Math.random() - 0.5) * 0.4;
      this.vel[i * 3] = vx + (Math.random() - 0.5) * 1.4;
      this.vel[i * 3 + 1] = 0.7 + Math.random() * 1.2;
      this.vel[i * 3 + 2] = vz + (Math.random() - 0.5) * 1.4;
      this.life[i] = 1;
      this.g.attributes.aSize.array[i] = (0.5 + Math.random() * 0.6) * size;
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


// =====================================================================
// TYRE MARKS THAT STAY
// =====================================================================
//
// Liam: "the tire marks should be permanent for every race". The old
// marks were one ring buffer that wrapped round and wrote over the
// oldest, and only the player's car laid any. Now every car lays them,
// and nothing is overwritten during a race: the geometry is CHUNKS, a new
// one allocated whenever the last is full, and the lot is cleared only
// when a new session starts. Only past the ceiling below - several races
// of sixteen cars sliding about - is the oldest chunk reused.
//
// Four vertices a quad and byte colours: 64 bytes a quad, so the ceiling
// is about 16 MB. The index buffer is the same for every chunk and shared.
const CHUNK = 8192;
const MAX_CHUNKS = 32;

export const MARK = {
  rubber: [16, 16, 18],
  grass: [58, 44, 26],
  gravel: [92, 80, 64],
  rim: [196, 196, 200],      // a bare rim scoring the asphalt
  water: [18, 20, 24],       // the line a tyre cuts through standing water
};

export class Marks {
  constructor(scene) {
    this.scene = scene;
    this.chunks = [];
    this.cur = null;
    this.last = new Map();       // `${car}:${wheel}` -> { x, y, z }
    const idx = new Uint16Array(CHUNK * 6);
    for (let q = 0; q < CHUNK; q++) {
      const v = q * 4, o = q * 6;
      idx[o] = v; idx[o + 1] = v + 1; idx[o + 2] = v + 2; idx[o + 3] = v; idx[o + 4] = v + 2; idx[o + 5] = v + 3;
    }
    this.index = new THREE.BufferAttribute(idx, 1);
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
      vertexShader: `
        attribute vec4 aCol; varying vec4 vC;
        void main() { vC = aCol; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
        varying vec4 vC;
        void main() { gl_FragColor = vC; }`,
    });
  }

  chunk() {
    if (this.cur && this.cur.n < CHUNK) return this.cur;
    if (this.chunks.length >= MAX_CHUNKS) {
      // the ceiling: reuse the oldest
      const c = this.chunks.shift();
      c.n = 0; c.from = 0; c.col.array.fill(0);
      c.col.clearUpdateRanges(); c.col.needsUpdate = true;
      this.chunks.push(c);
      this.cur = c;
      return c;
    }
    const g = new THREE.BufferGeometry();
    const pos = new THREE.BufferAttribute(new Float32Array(CHUNK * 12), 3);
    const col = new THREE.BufferAttribute(new Uint8Array(CHUNK * 16), 4, true);
    pos.setUsage(THREE.DynamicDrawUsage); col.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', pos);
    g.setAttribute('aCol', col);
    g.setIndex(this.index);
    const mesh = new THREE.Mesh(g, this.material);
    mesh.frustumCulled = false;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    const c = { g, pos, col, mesh, n: 0, from: 0 };
    g.setDrawRange(0, 0);
    this.chunks.push(c);
    this.cur = c;
    return c;
  }

  /**
   * Lay rubber for one wheel from where it last laid some to here. `key`
   * names the wheel; `width` is half the stripe; `rgb` one of MARK.
   */
  mark(key, x, y, z, width, rgb, alpha) {
    const prev = this.last.get(key);
    if (!prev) { this.last.set(key, { x, y, z }); return; }
    const dx = x - prev.x, dz = z - prev.z, len = Math.hypot(dx, dz);
    if (len > 9) { this.last.set(key, { x, y, z }); return; }   // teleported (a reset)
    // short steps are joined into longer segments: the same line for a
    // fraction of the quads
    if (len < 0.6) return;
    const nx = -dz / len * width, nz = dx / len * width;
    const c = this.chunk();
    const q = c.n++;
    const p = c.pos.array, o = q * 12;
    const put = (j, X, Y, Z) => { p[o + j * 3] = X; p[o + j * 3 + 1] = Y; p[o + j * 3 + 2] = Z; };
    put(0, prev.x - nx, prev.y, prev.z - nz);
    put(1, prev.x + nx, prev.y, prev.z + nz);
    put(2, x + nx, y, z + nz);
    put(3, x - nx, y, z - nz);
    const a = c.col.array, ao = q * 16, A = Math.round(Math.min(1, alpha) * 255);
    for (let j = 0; j < 4; j++) { a[ao + j * 4] = rgb[0]; a[ao + j * 4 + 1] = rgb[1]; a[ao + j * 4 + 2] = rgb[2]; a[ao + j * 4 + 3] = A; }
    c.dirty = true;
    this.last.set(key, { x, y, z });
  }

  /** a wheel that stopped marking must not join its next mark to this one */
  lift(key) { this.last.delete(key); }

  step() {
    for (const c of this.chunks) {
      if (!c.dirty) continue;
      // upload only what was written since the last upload
      c.pos.clearUpdateRanges(); c.col.clearUpdateRanges();
      c.pos.addUpdateRange(c.from * 12, (c.n - c.from) * 12);
      c.col.addUpdateRange(c.from * 16, (c.n - c.from) * 16);
      c.pos.needsUpdate = true; c.col.needsUpdate = true;
      c.g.setDrawRange(0, c.n * 6);
      c.from = c.n;
      c.dirty = false;
    }
  }

  /** a new session: every mark goes */
  clear() {
    for (const c of this.chunks) { this.scene.remove(c.mesh); c.g.dispose(); }
    this.chunks = [];
    this.cur = null;
    this.last.clear();
  }

  get quads() { return this.chunks.reduce((s, c) => s + c.n, 0); }
}

// =====================================================================
// SPARKS
// =====================================================================
//
// Carbon and titanium on concrete. Each spark is a short line from where
// it is to where it was a moment ago, so a fast one draws as a streak,
// ADDED to the scene rather than blended, so a shower of them glows.
// Gravity pulls them down; they bounce once off the road and die.
export class Sparks {
  constructor(scene, max = 2400) {
    this.max = max;
    this.i = 0;
    this.p = new Float32Array(max * 3);
    this.v = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.floor = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 6), 3).setUsage(THREE.DynamicDrawUsage));
    this.g = g;
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 4;
    scene.add(this.lines);
    this.alive = 0;
  }

  /**
   * A burst at (x, y, z). (vx, vz) is the velocity the sparks inherit -
   * the car's; `n` how many; `kick` how hard they are thrown; (nx, nz)
   * the direction away from the wall, if there is one.
   */
  emit(x, y, z, vx, vz, n, kick = 4, nx = 0, nz = 0) {
    n = Math.min(80, Math.round(n));
    for (let k = 0; k < n; k++) {
      const i = this.i = (this.i + 1) % this.max;
      const i3 = i * 3;
      this.p[i3] = x + (Math.random() - 0.5) * 0.3; this.p[i3 + 1] = y + Math.random() * 0.2; this.p[i3 + 2] = z + (Math.random() - 0.5) * 0.3;
      const f = 0.55 + Math.random() * 0.4;
      this.v[i3] = vx * f + (Math.random() - 0.5) * kick + nx * Math.random() * kick;
      this.v[i3 + 1] = Math.random() * kick * 0.8 + 0.5;
      this.v[i3 + 2] = vz * f + (Math.random() - 0.5) * kick + nz * Math.random() * kick;
      this.life[i] = 0.25 + Math.random() * 0.45;
      this.floor[i] = y - 0.3;
    }
  }

  step(dt) {
    const pos = this.g.attributes.position.array, col = this.g.attributes.color.array;
    const p = this.p, v = this.v;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const i3 = i * 3, i6 = i * 6;
      if (this.life[i] <= 0) {
        if (col[i6] !== 0 || col[i6 + 3] !== 0) { col.fill(0, i6, i6 + 6); pos.fill(0, i6, i6 + 6); }
        continue;
      }
      alive++;
      this.life[i] -= dt;
      v[i3 + 1] -= 9.81 * dt;
      v[i3] *= 1 - dt * 1.5; v[i3 + 2] *= 1 - dt * 1.5;
      p[i3] += v[i3] * dt; p[i3 + 1] += v[i3 + 1] * dt; p[i3 + 2] += v[i3 + 2] * dt;
      if (p[i3 + 1] < this.floor[i] && v[i3 + 1] < 0) { p[i3 + 1] = this.floor[i]; v[i3 + 1] *= -0.3; this.life[i] = Math.min(this.life[i], 0.12); }
      // the tail is where it was 1/40 s ago, so it streaks with speed
      const tl = 0.025;
      pos[i6] = p[i3]; pos[i6 + 1] = p[i3 + 1]; pos[i6 + 2] = p[i3 + 2];
      pos[i6 + 3] = p[i3] - v[i3] * tl; pos[i6 + 4] = p[i3 + 1] - v[i3 + 1] * tl; pos[i6 + 5] = p[i3 + 2] - v[i3 + 2] * tl;
      // white-yellow at the head, orange in the tail, dimming with age
      const heat = Math.min(1, this.life[i] * 3);
      col[i6] = heat + 0.3; col[i6 + 1] = 0.75 * heat + 0.15; col[i6 + 2] = 0.35 * heat;
      col[i6 + 3] = 0.9 * heat; col[i6 + 4] = 0.35 * heat; col[i6 + 5] = 0.05 * heat;
    }
    this.alive = alive;
    this.g.attributes.position.needsUpdate = true;
    this.g.attributes.color.needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// =====================================================================
// SPEED LINES
// =====================================================================
//
// Liam: "lines that appear on the screen kind of animated style to really
// convey the speed". Streaks on a 2D canvas over the game, flying outward
// from the point the car is heading for, the way a manga panel draws
// speed. None below about 140 km/h; they lengthen and multiply toward top
// speed and with the DRS open, and the middle of the screen - where you
// are looking - is always left clear.
export class SpeedLines {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.lines = [];
    this.w = 0; this.h = 0;
  }

  /** half resolution: they are soft streaks, and it quarters the fill */
  size() {
    const w = Math.round(innerWidth * 0.5), h = Math.round(innerHeight * 0.5);
    if (w !== this.w || h !== this.h) { this.c.width = this.w = w; this.c.height = this.h = h; }
  }

  /**
   * @param kph   the car's speed
   * @param vp    [x, y] in 0..1 of the screen: where the lines stream from
   * @param boost 0..1 extra, for DRS
   */
  step(dt, kph, vp, boost = 0) {
    this.size();
    const g = this.g, W = this.w, H = this.h;
    g.clearRect(0, 0, W, H);
    const k = Math.min(1.2, Math.max(0, (kph - 140) / 170) + boost * 0.2);
    const R = Math.hypot(W, H) / 2;
    const cx = vp[0] * W, cy = vp[1] * H;
    let n = (k * 90 + k * k * 160) * dt + (k > 0 ? Math.random() : 0);
    while (n-- >= 1 && this.lines.length < 220) {
      this.lines.push({
        a: Math.random() * Math.PI * 2,
        r: R * (0.40 + Math.random() * 0.38),
        len: R * (0.10 + Math.random() * 0.24) * (0.6 + k),
        w: (2 + Math.random() * 4) * (0.6 + k) * (W / 700),
        v: R * (0.9 + Math.random() * 0.9) * (0.7 + k * 0.6),
        t: 0, life: 0.18 + Math.random() * 0.22,
      });
    }
    
    for (let i = this.lines.length - 1; i >= 0; i--) {
      const L = this.lines[i];
      L.t += dt; L.r += L.v * dt;
      if (L.t > L.life || L.r > R * 1.3) { this.lines.splice(i, 1); continue; }
      const f = Math.sin(Math.PI * L.t / L.life);
      const ca = Math.cos(L.a), sa = Math.sin(L.a);
      const x0 = cx + ca * L.r, y0 = cy + sa * L.r;
      const x1 = cx + ca * (L.r + L.len), y1 = cy + sa * (L.r + L.len);
      // a wedge: a point at the inner end, its full width at the outer
      const px = -sa * L.w, py = ca * L.w;
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(255,255,255,0)');
      grad.addColorStop(1, 'rgba(255,255,255,' + (0.7 * f * Math.min(1, k * 1.6)).toFixed(3) + ')');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x0, y0);
      g.lineTo(x1 + px, y1 + py);
      g.lineTo(x1 - px, y1 - py);
      g.closePath();
      g.fill();
    }
  }

  clear() { this.lines.length = 0; if (this.w) this.g.clearRect(0, 0, this.w, this.h); }
}
