// Visual effects: GPU point particles (smoke, fire, sparks, flashes), bullet tracers, falling
// debris chunks, shockwave rings. All pooled - nothing is allocated per shot.
import * as THREE from '../vendor/three.module.js';
import { HORIZON } from './world.js';

const VS = `
attribute float size; attribute float alpha; attribute vec3 color;
uniform float uScale; varying vec3 vCol; varying float vA; varying float vDepth;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  vDepth = -mv.z;
  gl_PointSize = min(size * uScale / max(1.0, -mv.z), 360.0);
  vCol = color; vA = alpha;
}`;
const FS = `
uniform vec3 fogCol; uniform float fogNear, fogFar; uniform float soft;
varying vec3 vCol; varying float vA; varying float vDepth;
void main(){
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c) * 2.0;
  if (d > 1.0) discard;
  float a = vA * pow(1.0 - d, soft) * smoothstep(4.0, 22.0, vDepth);
  vec3 col = vCol;
  float f = smoothstep(fogNear, fogFar, vDepth);
  col = mix(col, fogCol, f);
  a *= (1.0 - f * 0.7);
  gl_FragColor = vec4(col, a);
}`;

class Particles {
  constructor(scene, n, additive) {
    this.n = n; this.i = 0;
    this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3);
    this.size = new Float32Array(n); this.alpha = new Float32Array(n);
    this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n);
    this.s0 = new Float32Array(n); this.s1 = new Float32Array(n); this.a0 = new Float32Array(n);
    this.c0 = new Float32Array(n * 3); this.c1 = new Float32Array(n * 3); this.drag = new Float32Array(n); this.grav = new Float32Array(n);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e7);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 400 }, fogCol: { value: HORIZON }, fogNear: { value: 1400 }, fogFar: { value: 7800 }, soft: { value: additive ? 1.6 : 0.9 } },
    });
    this.pts = new THREE.Points(g, this.mat);
    this.pts.frustumCulled = false;
    this.pts.renderOrder = additive ? 3 : 2;
    scene.add(this.pts);
    this.geo = g;
  }
  emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0 = 1, drag = 0.5, grav = 0) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    const i3 = i * 3;
    this.pos[i3] = x; this.pos[i3 + 1] = y; this.pos[i3 + 2] = z;
    this.vel[i3] = vx; this.vel[i3 + 1] = vy; this.vel[i3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.a0[i] = a0;
    this.c0[i3] = c0.r; this.c0[i3 + 1] = c0.g; this.c0[i3 + 2] = c0.b;
    this.c1[i3] = c1.r; this.c1[i3 + 1] = c1.g; this.c1[i3 + 2] = c1.b;
    this.drag[i] = drag; this.grav[i] = grav;
  }
  update(dt) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; this.size[i] = 0; } continue; }
      this.life[i] -= dt;
      const i3 = i * 3, k = Math.exp(-this.drag[i] * dt);
      this.vel[i3] *= k; this.vel[i3 + 1] = this.vel[i3 + 1] * k - this.grav[i] * dt; this.vel[i3 + 2] *= k;
      this.pos[i3] += this.vel[i3] * dt; this.pos[i3 + 1] += this.vel[i3 + 1] * dt; this.pos[i3 + 2] += this.vel[i3 + 2] * dt;
      const t = 1 - Math.max(0, this.life[i]) / this.max[i];
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      this.alpha[i] = this.a0[i] * (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92);
      this.col[i3] = this.c0[i3] + (this.c1[i3] - this.c0[i3]) * t;
      this.col[i3 + 1] = this.c0[i3 + 1] + (this.c1[i3 + 1] - this.c0[i3 + 1]) * t;
      this.col[i3 + 2] = this.c0[i3 + 2] + (this.c1[i3 + 2] - this.c0[i3 + 2]) * t;
    }
    for (const k of ['position', 'color', 'size', 'alpha']) this.geo.attributes[k].needsUpdate = true;
  }
}

const C = (h) => new THREE.Color(h);
const COL = {
  fire: C(0xffd27a), fire2: C(0xff5a1f), smoke: C(0x555555), smoke2: C(0x9a9a9a), dark: C(0x3b3633), darkEnd: C(0x8a8580),
  white: C(0xffffff), spark: C(0xfff2b0), spark2: C(0xff8a2a), water: C(0xe8f6ff), water2: C(0xb5d8ea), trail: C(0xe6e9ee), trail2: C(0xcfd6de),
  flash: C(0xfff6d0), fireHot: C(0xffd25a), fireDeep: C(0x9a2a0a),
};

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.smoke = new Particles(scene, 3500, false);
    this.glow = new Particles(scene, 2500, true);
    // tracers
    this.maxTr = 700;
    const tg = new THREE.BoxGeometry(0.55, 0.55, 1); tg.translate(0, 0, -0.5);
    this.tracers = new THREE.InstancedMesh(tg, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 1, depthWrite: false, fog: false }), this.maxTr);
    this.tracers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.tracers.frustumCulled = false; this.tracers.count = 0;
    this.tracers.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.maxTr * 3), 3);
    scene.add(this.tracers);
    // debris
    this.debris = [];
    const dg = [new THREE.BoxGeometry(1.2, 0.15, 0.8), new THREE.BoxGeometry(0.5, 0.5, 0.9), new THREE.TetrahedronGeometry(0.7)];
    for (let i = 0; i < 80; i++) {
      const m = new THREE.Mesh(dg[i % 3], new THREE.MeshStandardMaterial({ color: 0x777777, roughness: 0.7 }));
      m.visible = false; scene.add(m);
      this.debris.push({ m, v: new THREE.Vector3(), w: new THREE.Vector3(), life: 0, smoke: false });
    }
    this.di = 0;
    // shockwave rings
    this.rings = [];
    for (let i = 0; i < 10; i++) {
      const r = new THREE.Mesh(new THREE.RingGeometry(0.82, 1, 40), new THREE.MeshBasicMaterial({ color: 0xfff1d0, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false }));
      r.visible = false; scene.add(r); this.rings.push({ m: r, t: 0, max: 0, size: 1 });
    }
    this.ri = 0;
    this.M = new THREE.Matrix4(); this.Q = new THREE.Quaternion(); this.S = new THREE.Vector3(); this.P = new THREE.Vector3(); this.F = new THREE.Vector3(0, 0, -1);
  }
  setScale(h, proj) { const s = h * 0.5 * proj; this.smoke.mat.uniforms.uScale.value = s; this.glow.mat.uniforms.uScale.value = s; }

  muzzle(p, f, v) {
    this.glow.emit(p.x + f.x * 0.6, p.y + f.y * 0.6, p.z + f.z * 0.6, v.x + f.x * 20, v.y + f.y * 20, v.z + f.z * 20, 0.06, 2.4, 1.0, COL.flash, COL.fire2, 1, 0);
  }
  spark(p, n = 6, size = 1) {
    for (let i = 0; i < n; i++) {
      const s = 40 * size;
      this.glow.emit(p.x, p.y, p.z, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s, 0.25 + Math.random() * 0.2, 0.9 * size, 0.2, COL.spark, COL.spark2, 1, 3, 10);
    }
    this.smoke.emit(p.x, p.y, p.z, 0, 0, 0, 0.6, 1.2 * size, 4 * size, COL.dark, COL.darkEnd, 0.5, 1);
  }
  /** trailing smoke/fire from a damaged plane: level 0..1 (1 = burning) */
  damageTrail(p, v, level, dt) {
    if (level <= 0) return;
    const rate = 20 + level * 50;
    let n = rate * dt; while (n > 0) {
      if (Math.random() > n) break; n -= 1;
      const j = () => (Math.random() - 0.5) * 2;
      const dark = level > 0.5 ? COL.dark : COL.smoke;
      this.smoke.emit(p.x + j(), p.y + j(), p.z + j(), v.x * 0.1 + j() * 2, v.y * 0.1 + 2, v.z * 0.1 + j() * 2, 1.4 + level * 1.2, 1.5 + level, 5 + level * 6, dark, COL.darkEnd, 0.45 + level * 0.25, 0.8);
      if (level > 0.5) this.smoke.emit(p.x + j() * 0.5, p.y + j() * 0.5, p.z + j() * 0.5, v.x * 0.7, v.y * 0.7, v.z * 0.7, 0.3, 2.8, 1.2, COL.fireHot, COL.fireDeep, 1, 2);
    }
  }
  contrail(p, v, a = 0.35) {
    this.smoke.emit(p.x, p.y, p.z, v.x * 0.05, v.y * 0.05, v.z * 0.05, 0.9, 0.5, 2.2, COL.trail, COL.trail2, a, 0.3);
  }
  boostFlame(p, f, v, jet) {
    this.glow.emit(p.x, p.y, p.z, v.x - f.x * 30, v.y - f.y * 30, v.z - f.z * 30, jet ? 0.12 : 0.08, jet ? 2.6 : 1.4, 0.6, COL.fire, COL.fire2, 0.9, 1);
  }
  missileTrail(p, v) {
    this.smoke.emit(p.x, p.y, p.z, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 1.6, 1, 6, COL.white, COL.smoke2, 0.7, 0.5);
    this.smoke.emit(p.x, p.y, p.z, v.x * 0.3, v.y * 0.3, v.z * 0.3, 0.07, 1.6, 0.6, COL.fireHot, COL.fire2, 1, 0);
  }
  explosion(p, size = 1, v) {
    const vx = v ? v.x * 0.3 : 0, vy = v ? v.y * 0.3 : 0, vz = v ? v.z * 0.3 : 0;
    const d = new THREE.Vector3();
    // smoke first (drawn underneath), then the fireball on top - normal blending so it reads on a bright sky
    for (let i = 0; i < 26 * size; i++) {
      d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(5 + Math.random() * 14 * size);
      this.smoke.emit(p.x + d.x * 0.3, p.y + d.y * 0.3, p.z + d.z * 0.3, vx + d.x, vy + d.y + 4, vz + d.z, 2.5 + Math.random() * 2, 5 * size, 22 * size, COL.dark, COL.darkEnd, 0.6, 1.1);
    }
    for (let i = 0; i < 34 * size; i++) {
      d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(8 + Math.random() * 26 * size);
      this.smoke.emit(p.x, p.y, p.z, vx + d.x, vy + d.y, vz + d.z, 0.6 + Math.random() * 0.7, 10 * size, 24 * size, COL.fireHot, COL.fireDeep, 1, 2.6);
    }
    for (let i = 0; i < 12 * size; i++) {
      d.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize().multiplyScalar(4 + Math.random() * 10 * size);
      this.glow.emit(p.x, p.y, p.z, vx + d.x, vy + d.y, vz + d.z, 0.35 + Math.random() * 0.3, 9 * size, 16 * size, COL.fire, COL.fire2, 0.9, 2);
    }
    for (let i = 0; i < 30 * size; i++) {
      const s = 110 * size;
      this.smoke.emit(p.x, p.y, p.z, vx + (Math.random() - 0.5) * s, vy + (Math.random() - 0.3) * s, vz + (Math.random() - 0.5) * s, 0.6 + Math.random() * 0.7, 1.3 * Math.sqrt(size), 0.4, COL.spark, COL.spark2, 1, 1.2, 25);
    }
    this.smoke.emit(p.x, p.y, p.z, 0, 0, 0, 0.16, 22 * size, 40 * size, COL.flash, COL.fireHot, 1, 0);
    this.glow.emit(p.x, p.y, p.z, 0, 0, 0, 0.2, 34 * size, 55 * size, COL.flash, COL.fire, 1, 0);
    const r = this.rings[this.ri++ % this.rings.length];
    r.m.position.copy(p); r.t = 0; r.max = 0.45; r.size = 30 * size; r.m.visible = true;
  }
  splash(p, size = 1) {
    for (let i = 0; i < 50 * size; i++) {
      const a = Math.random() * Math.PI * 2, s = Math.random() * 14 * size;
      this.smoke.emit(p.x, 0.5, p.z, Math.cos(a) * s, 18 + Math.random() * 30 * size, Math.sin(a) * s, 1.6 + Math.random(), 2.5 * size, 7 * size, COL.water, COL.water2, 0.9, 0.6, 22);
    }
  }
  debrisBurst(p, v, color, n = 4, smoke = false) {
    for (let i = 0; i < n; i++) {
      const d = this.debris[this.di++ % this.debris.length];
      d.m.visible = true; d.m.position.copy(p);
      d.m.material.color.setHex(color);
      d.v.set(v.x * 0.6 + (Math.random() - 0.5) * 30, v.y * 0.6 + Math.random() * 18, v.z * 0.6 + (Math.random() - 0.5) * 30);
      d.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      const sc = 0.6 + Math.random() * 1.2; d.m.scale.setScalar(sc);
      d.life = 3 + Math.random() * 2; d.smoke = smoke && i < 3;
    }
  }
  update(dt, bullets, camera) {
    this.smoke.update(dt); this.glow.update(dt);
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 9.8 * dt * 2; d.v.multiplyScalar(Math.exp(-0.4 * dt));
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt; d.m.rotation.z += d.w.z * dt;
      if (d.smoke && Math.random() < 0.6) this.smoke.emit(d.m.position.x, d.m.position.y, d.m.position.z, 0, 1, 0, 1.2, 1.5, 5, COL.dark, COL.darkEnd, 0.6, 0.5);
      if (d.m.position.y < 0) { d.life = 0; if (Math.random() < 0.5) this.splash(d.m.position, 0.25); }
      if (d.life <= 0) d.m.visible = false;
    }
    for (const r of this.rings) {
      if (!r.m.visible) continue;
      r.t += dt;
      const k = r.t / r.max;
      r.m.scale.setScalar(r.size * (0.3 + k * 1.4));
      r.m.material.opacity = 0.55 * (1 - k) * (1 - k);
      if (camera) r.m.quaternion.copy(camera.quaternion);
      if (k >= 1) r.m.visible = false;
    }
    // tracers
    let n = 0;
    const M = this.M, Q = this.Q, S = this.S, P = this.P, F = this.F;
    const col = this.tracers.instanceColor;
    for (const b of bullets) {
      if (!b.alive || n >= this.maxTr) continue;
      const sp = b.vel.length();
      P.copy(b.vel).divideScalar(sp);
      Q.setFromUnitVectors(F, P);
      // thin tracers that pass right by the camera, or they read as giant planks
      const th = (b.big ? 1.6 : 1) * (camera ? Math.min(1, Math.max(0.12, (b.pos.distanceTo(camera.position) - 6) / 60)) : 1);
      S.set(th, th, Math.min(22, sp * 0.026));
      M.compose(b.pos, Q, S);
      this.tracers.setMatrixAt(n, M);
      col.setXYZ(n, b.col.r, b.col.g, b.col.b);
      n++;
    }
    this.tracers.count = n;
    this.tracers.instanceMatrix.needsUpdate = true;
    col.needsUpdate = true;
  }
}
