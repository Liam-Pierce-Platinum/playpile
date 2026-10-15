// Juice: speed streaks, sparks, voxel debris, nitro flame, light glows (+ wet-road reflections).
import * as THREE from '../vendor/three.module.js';

function dotTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.7)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const DOT = dotTex();

class PointPool {
  constructor(scene, n, size, blending = THREE.AdditiveBlending) {
    this.n = n; this.p = new Float32Array(n * 3); this.c = new Float32Array(n * 3);
    this.v = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n); this.col = new Float32Array(n * 3);
    this.i = 0;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.p, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.c, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending, sizeAttenuation: true }));
    this.pts.frustumCulled = false; scene.add(this.pts);
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life) {
    const i = this.i; this.i = (this.i + 1) % this.n;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b; this.life[i] = this.max[i] = life;
  }
  update(dt, grav) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) { this.c[i * 3] = this.c[i * 3 + 1] = this.c[i * 3 + 2] = 0; this.p[i * 3 + 1] = -999; continue; }
      this.life[i] -= dt; const k = Math.max(0, this.life[i] / this.max[i]);
      this.v[i * 3 + 1] -= grav * dt;
      this.p[i * 3] += this.v[i * 3] * dt; this.p[i * 3 + 1] += this.v[i * 3 + 1] * dt; this.p[i * 3 + 2] += this.v[i * 3 + 2] * dt;
      this.c[i * 3] = this.col[i * 3] * k; this.c[i * 3 + 1] = this.col[i * 3 + 1] * k; this.c[i * 3 + 2] = this.col[i * 3 + 2] * k;
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.sparks = new PointPool(scene, 400, 0.35);
    this.flame = new PointPool(scene, 260, 0.6);
    this.smoke = new PointPool(scene, 160, 2.2, THREE.NormalBlending);
    this.smoke.pts.material.opacity = 0.35;
    // speed streaks
    const N = 70; this.streakN = N;
    this.streaks = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1), new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, fog: false }), N);
    this.streaks.frustumCulled = false; scene.add(this.streaks);
    this.sd = Array.from({ length: N }, () => this.newStreak(10 + Math.random() * 130));
    // debris cubes
    this.debN = 120;
    this.deb = new THREE.InstancedMesh(new THREE.BoxGeometry(0.24, 0.24, 0.24), new THREE.MeshLambertMaterial(), this.debN);
    this.deb.castShadow = true; this.deb.frustumCulled = false; scene.add(this.deb);
    this.dd = Array.from({ length: this.debN }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Vector3(), w: new THREE.Vector3() }));
    this.di = 0; this.dummy = new THREE.Object3D(); this.tc = new THREE.Color();
    for (let i = 0; i < this.debN; i++) { this.deb.setColorAt(i, this.tc.set('#ffffff')); }
    // glows
    this.glowN = 400;
    const g = new THREE.BufferGeometry();
    this.gp = new Float32Array(this.glowN * 3); this.gc = new Float32Array(this.glowN * 3);
    g.setAttribute('position', new THREE.BufferAttribute(this.gp, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.gc, 3));
    this.glow = new THREE.Points(g, new THREE.PointsMaterial({ size: 1.4, map: DOT, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.glow.frustumCulled = false; scene.add(this.glow);
  }
  newStreak(ds) { return { lat: (Math.random() < 0.5 ? -1 : 1) * (1.6 + Math.random() * 7), h: 0.2 + Math.random() * 3.2, ds: ds ?? 70 + Math.random() * 80 }; }

  burstSparks(p, n, dir, speed) {
    for (let i = 0; i < n; i++) this.sparks.emit(p.x, p.y, p.z, dir.x * speed * 0.5 + (Math.random() - 0.5) * 8, Math.random() * 6 + 1, dir.z * speed * 0.5 + (Math.random() - 0.5) * 8, 1, 0.6 + Math.random() * 0.3, 0.2, 0.3 + Math.random() * 0.4);
  }
  debris(p, color, n, vel) {
    const c = this.tc.set(color);
    for (let i = 0; i < n; i++) {
      const d = this.dd[this.di]; const idx = this.di; this.di = (this.di + 1) % this.debN;
      d.life = 2.2 + Math.random(); d.p.copy(p).add(new THREE.Vector3((Math.random() - 0.5) * 1.5, Math.random() * 1.2, (Math.random() - 0.5) * 2));
      d.v.set(vel.x + (Math.random() - 0.5) * 10, 3 + Math.random() * 7, vel.z + (Math.random() - 0.5) * 10);
      d.w.set(Math.random() * 12, Math.random() * 12, Math.random() * 12); d.s = 0.5 + Math.random() * 0.9;
      this.deb.setColorAt(idx, Math.random() < 0.3 ? this.tc.set('#222428') : c.set(color));
    }
    this.deb.instanceColor.needsUpdate = true;
  }
  update(dt, ctx) {
    const { T, ps, v, vmax, groundY } = ctx;
    this.sparks.update(dt, 14); this.flame.update(dt, -1); this.smoke.update(dt, -1.5);
    // streaks
    const k = Math.max(0, (v - vmax * 0.45) / (vmax * 0.6));
    this.streaks.material.opacity = Math.min(0.32, k * 0.4) + (ctx.nitro ? 0.25 : 0);
    const len = 1 + v * 0.11, dm = this.dummy, f = new THREE.Vector3();
    for (let i = 0; i < this.streakN; i++) {
      const sd = this.sd[i]; sd.ds -= v * dt * 1.4;
      if (sd.ds < 7) Object.assign(sd, this.newStreak());
      T.pos(ps + sd.ds, ctx.plat + sd.lat, sd.h, dm.position);
      dm.rotation.set(0, T.frame(ps + sd.ds).yaw, 0); dm.scale.set(1, 1, len); dm.updateMatrix(); this.streaks.setMatrixAt(i, dm.matrix);
    }
    this.streaks.instanceMatrix.needsUpdate = true;
    // debris
    for (let i = 0; i < this.debN; i++) {
      const d = this.dd[i];
      if (d.life <= 0) { dm.position.set(0, -999, 0); dm.scale.setScalar(0.001); dm.updateMatrix(); this.deb.setMatrixAt(i, dm.matrix); continue; }
      d.life -= dt; d.v.y -= 22 * dt; d.p.addScaledVector(d.v, dt);
      const gy = T.frame(-d.p.z).y + 0.17;
      if (d.p.y < gy) { d.p.y = gy; d.v.y *= -0.35; d.v.x *= 0.7; d.v.z *= 0.7; d.w.multiplyScalar(0.7); }
      d.r.addScaledVector(d.w, dt);
      dm.position.copy(d.p); dm.rotation.set(d.r.x, d.r.y, d.r.z); dm.scale.setScalar(d.s * Math.min(1, d.life * 2)); dm.updateMatrix(); this.deb.setMatrixAt(i, dm.matrix);
    }
    this.deb.instanceMatrix.needsUpdate = true;
  }
  // lights: list of [x,y,z,r,g,b]; wet = mirror reflections under them
  setGlows(list, wet, refY) {
    let n = 0; const gp = this.gp, gc = this.gc;
    for (const L of list) {
      if (n >= this.glowN) break;
      gp[n * 3] = L[0]; gp[n * 3 + 1] = L[1]; gp[n * 3 + 2] = L[2]; gc[n * 3] = L[3]; gc[n * 3 + 1] = L[4]; gc[n * 3 + 2] = L[5]; n++;
      if (wet && !L[7] && n < this.glowN) { gp[n * 3] = L[0]; gp[n * 3 + 1] = 2 * L[6] - L[1]; gp[n * 3 + 2] = L[2]; gc[n * 3] = L[3] * 0.4; gc[n * 3 + 1] = L[4] * 0.4; gc[n * 3 + 2] = L[5] * 0.4; n++; }
    }
    for (let i = n; i < this.glowN; i++) { gp[i * 3 + 1] = -999; gc[i * 3] = gc[i * 3 + 1] = gc[i * 3 + 2] = 0; }
    this.glow.geometry.attributes.position.needsUpdate = true; this.glow.geometry.attributes.color.needsUpdate = true;
  }
}
