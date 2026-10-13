// Visual effects: tracers, impact decals, spark/dust particles, explosions (fireball,
// smoke, debris, light), smoke-grenade clouds, shell casings, pooled flash lights, shake.
import * as THREE from '../vendor/three.module.js';

const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);

export class FX {
  constructor(scene) {
    this.scene = scene;
    this.shake = 0;
    this.time = 0;
    // tracers: thin stretched boxes
    this.tracers = [];
    const tg = new THREE.BoxGeometry(0.025, 0.025, 1); tg.translate(0, 0, -0.5);
    for (let i = 0; i < 48; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m);
      this.tracers.push({ m, life: 0 });
    }
    this.ti = 0;
    // decals
    this.decals = [];
    const dg = new THREE.CircleGeometry(0.07, 6);
    const dm = new THREE.MeshBasicMaterial({ color: 0x1a1612, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const scorchG = new THREE.CircleGeometry(1, 9);
    const sm = new THREE.MeshBasicMaterial({ color: 0x15110e, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    for (let i = 0; i < 160; i++) { const m = new THREE.Mesh(dg, dm); m.visible = false; m.matrixAutoUpdate = false; scene.add(m); this.decals.push(m); }
    this.scorch = [];
    for (let i = 0; i < 16; i++) { const m = new THREE.Mesh(scorchG, sm); m.visible = false; scene.add(m); this.scorch.push(m); }
    this.di = 0; this.si = 0;
    // particles: two point clouds
    this.dot = dotTexture();
    this.parts = [this.makeCloud(900, true, 0.14), this.makeCloud(700, false, 0.32)];
    // explosions / smoke puffs (icosahedron meshes)
    this.puffs = [];
    const pg = new THREE.IcosahedronGeometry(1, 0);
    for (let i = 0; i < 90; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshLambertMaterial({ color: 0x777777, transparent: true, opacity: 0.8, flatShading: true, depthWrite: false }));
      m.visible = false; scene.add(m);
      this.puffs.push({ m, life: 0, max: 1, vx: 0, vy: 0, vz: 0, s0: 1, s1: 2, kind: 'smoke' });
    }
    this.pi = 0;
    this.fireballs = [];
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ color: 0xffb347, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; scene.add(m); this.fireballs.push({ m, life: 0 });
    }
    // lights pool (fixed count so shaders never recompile)
    this.lights = [];
    for (let i = 0; i < 3; i++) { const l = new THREE.PointLight(0xffb060, 0, 12, 2); scene.add(l); this.lights.push({ l, life: 0, max: 0.05, I: 0 }); }
    this.li = 0;
    // debris chunks
    this.debris = [];
    const bg = new THREE.BoxGeometry(1, 1, 1);
    for (let i = 0; i < 40; i++) { const m = new THREE.Mesh(bg, new THREE.MeshLambertMaterial({ color: 0x5a4a3a })); m.visible = false; m.castShadow = true; scene.add(m); this.debris.push({ m, life: 0, v: new THREE.Vector3(), w: new THREE.Vector3() }); }
    this.bi = 0;
    // smoke clouds (smoke grenades)
    this.clouds = [];
  }
  makeCloud(n, additive, size) {
    const g = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3).fill(0), col = new Float32Array(n * 3);
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size, map: this.dot, alphaTest: 0.02, vertexColors: true, transparent: true, opacity: additive ? 1 : 0.8, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, sizeAttenuation: true });
    const pts = new THREE.Points(g, mat);
    pts.frustumCulled = false;
    this.scene.add(pts);
    const data = [];
    for (let i = 0; i < n; i++) data.push({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1, grav: 9 });
    return { pts, pos, col, data, i: 0, n };
  }
  emit(cloud, x, y, z, vx, vy, vz, life, r, g, b, grav = 9) {
    const c = this.parts[cloud];
    const p = c.data[c.i]; c.i = (c.i + 1) % c.n;
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.r = r; p.g = g; p.b = b; p.grav = grav;
  }
  tracer(ax, ay, az, bx, by, bz, color = '#ffd27a', width = 1) {
    const t = this.tracers[this.ti]; this.ti = (this.ti + 1) % this.tracers.length;
    const L = Math.hypot(bx - ax, by - ay, bz - az);
    if (L < 1) return;
    t.m.material.color.set(color);
    t.ax = ax; t.ay = ay; t.az = az; t.dx = (bx - ax) / L; t.dy = (by - ay) / L; t.dz = (bz - az) / L; t.L = L; t.d = 0; t.life = 1;
    t.speed = 420; t.len = Math.min(9, L * 0.4); t.own = !!this.ownNext; this.ownNext = false;
    t.m.scale.set(width, width, t.len);
    t.m.visible = true;
  }
  decal(x, y, z, nx, ny, nz, scale = 1) {
    const m = this.decals[this.di]; this.di = (this.di + 1) % this.decals.length;
    tmp.set(nx, ny, nz).normalize();
    m.position.set(x + tmp.x * 0.012, y + tmp.y * 0.012, z + tmp.z * 0.012);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tmp);
    m.rotateZ(Math.random() * 6);
    m.scale.setScalar(scale * (0.8 + Math.random() * 0.5));
    m.updateMatrix();
    m.visible = true;
  }
  impact(x, y, z, nx, ny, nz, mat) {
    this.decal(x, y, z, nx, ny, nz, mat === 'metal' ? 0.7 : 1);
    const spark = mat === 'metal' || mat === 'stone';
    if (spark) for (let i = 0; i < 6; i++) this.emit(0, x, y, z, nx * 3 + (Math.random() - 0.5) * 6, ny * 3 + Math.random() * 4, nz * 3 + (Math.random() - 0.5) * 6, 0.18 + Math.random() * 0.15, 1, 0.75, 0.35, 14);
    const dust = mat === 'sand' ? [0.85, 0.72, 0.5] : mat === 'wood' ? [0.55, 0.4, 0.25] : mat === 'foliage' ? [0.35, 0.55, 0.25] : mat === 'dirt' ? [0.5, 0.42, 0.32] : [0.7, 0.67, 0.6];
    for (let i = 0; i < 7; i++) this.emit(1, x, y, z, nx * 1.5 + (Math.random() - 0.5) * 1.6, ny * 1.5 + Math.random() * 1.5, nz * 1.5 + (Math.random() - 0.5) * 1.6, 0.45 + Math.random() * 0.4, dust[0], dust[1], dust[2], 3);
  }
  blood(x, y, z, dx, dz) {
    for (let i = 0; i < 9; i++) this.emit(1, x, y, z, dx * 2 + (Math.random() - 0.5) * 2, Math.random() * 2, dz * 2 + (Math.random() - 0.5) * 2, 0.35 + Math.random() * 0.25, 0.55, 0.06, 0.05, 8);
  }
  splash(x, y, z) {
    for (let i = 0; i < 12; i++) this.emit(1, x, y, z, (Math.random() - 0.5) * 2, 2 + Math.random() * 3, (Math.random() - 0.5) * 2, 0.6, 0.75, 0.88, 0.95, 10);
  }
  flashLight(x, y, z, I = 6, dur = 0.05, color = 0xffb060, dist = 12) {
    const L = this.lights[this.li]; this.li = (this.li + 1) % this.lights.length;
    L.l.position.set(x, y, z); L.l.color.set(color); L.l.distance = dist; L.I = I; L.l.intensity = I; L.life = dur; L.max = dur;
  }
  puff(x, y, z, vx, vy, vz, life, s0, s1, color, opacity = 0.75) {
    const p = this.puffs[this.pi]; this.pi = (this.pi + 1) % this.puffs.length;
    p.m.position.set(x, y, z); p.vx = vx; p.vy = vy; p.vz = vz; p.life = life; p.max = life; p.s0 = s0; p.s1 = s1; p.op = opacity;
    p.m.material.color.set(color); p.m.material.opacity = opacity; p.m.scale.setScalar(s0); p.m.rotation.set(Math.random() * 3, Math.random() * 3, 0);
    p.m.visible = true;
  }
  explosion(x, y, z, size = 1, groundY = null) {
    const f = this.fireballs.find((q) => q.life <= 0) || this.fireballs[0];
    f.m.position.set(x, y + 0.3, z); f.life = 0.45; f.size = 3.2 * size; f.m.visible = true;
    this.flashLight(x, y + 1, z, 40 * size, 0.25, 0xffa040, 28);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * 6.28, s = Math.random();
      this.puff(x + Math.cos(a) * s, y + 0.5 + Math.random(), z + Math.sin(a) * s, Math.cos(a) * 2.5 * size, 1.5 + Math.random() * 2.5, Math.sin(a) * 2.5 * size, 2.0 + Math.random() * 1.5, 0.6 * size, 2.4 * size, i < 4 ? '#3a3632' : '#6a645c', 0.85);
    }
    for (let i = 0; i < 40; i++) { const a = Math.random() * 6.28, sp = 6 + Math.random() * 12; this.emit(0, x, y + 0.3, z, Math.cos(a) * sp, 3 + Math.random() * 10, Math.sin(a) * sp, 0.4 + Math.random() * 0.5, 1, 0.6 + Math.random() * 0.3, 0.2, 12); }
    for (let i = 0; i < 8; i++) {
      const d = this.debris[this.bi]; this.bi = (this.bi + 1) % this.debris.length;
      d.m.position.set(x, y + 0.4, z); d.m.scale.setScalar(0.1 + Math.random() * 0.18);
      d.v.set((Math.random() - 0.5) * 12, 5 + Math.random() * 9, (Math.random() - 0.5) * 12);
      d.w.set(Math.random() * 10, Math.random() * 10, Math.random() * 10);
      d.life = 2.5; d.m.visible = true; d.ground = groundY ?? y;
    }
    if (groundY !== null && Math.abs(y - groundY) < 1.2) {
      const s = this.scorch[this.si]; this.si = (this.si + 1) % this.scorch.length;
      s.position.set(x, groundY + 0.04, z); s.rotation.set(-Math.PI / 2, 0, Math.random() * 6); s.scale.setScalar(1.8 * size); s.visible = true;
    }
  }
  smokeCloud(x, y, z, r, dur) {
    const c = { x, y: y + 1.2, z, r, life: dur, max: dur, k: 0, t: 0 };
    this.clouds.push(c);
    return c;
  }
  addShake(a) { this.shake = Math.min(1.2, this.shake + a); }
  update(dt, cam) {
    this.time += dt;
    this.shake = Math.max(0, this.shake - dt * 2.2);
    for (const t of this.tracers) {
      if (t.life <= 0) continue;
      t.d += t.speed * dt;
      const head = Math.min(t.L, t.d);
      const tail = Math.max(0, head - t.len);
      if (tail >= t.L - 0.01) { t.life = 0; t.m.visible = false; continue; }
      t.m.position.set(t.ax + t.dx * head, t.ay + t.dy * head, t.az + t.dz * head);
      tmp.set(t.ax + t.dx * tail, t.ay + t.dy * tail, t.az + t.dz * tail);
      t.m.lookAt(tmp);
      t.m.rotateY(Math.PI);
      t.m.scale.z = Math.max(0.05, head - tail);
      t.m.material.opacity = 0.9;
      if (this.cam) { const cp = this.cam.position; const hx = t.m.position.x - cp.x, hy = t.m.position.y - cp.y, hz = t.m.position.z - cp.z; t.m.visible = hx * hx + hy * hy + hz * hz > 6.25 || t.own; }
    }
    for (const c of this.parts) {
      const P = c.pos, C = c.col;
      for (let i = 0; i < c.n; i++) {
        const p = c.data[i];
        if (p.life <= 0) { if (P[i * 3 + 1] !== -999) { P[i * 3 + 1] = -999; } continue; }
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        const k = Math.max(0, p.life / p.max);
        P[i * 3] = p.x; P[i * 3 + 1] = p.life > 0 ? p.y : -999; P[i * 3 + 2] = p.z;
        C[i * 3] = p.r * (0.4 + 0.6 * k); C[i * 3 + 1] = p.g * (0.4 + 0.6 * k); C[i * 3 + 2] = p.b * (0.4 + 0.6 * k);
      }
      c.pts.geometry.attributes.position.needsUpdate = true;
      c.pts.geometry.attributes.color.needsUpdate = true;
    }
    for (const p of this.puffs) {
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { p.m.visible = false; continue; }
      const k = 1 - p.life / p.max;
      p.vx *= 1 - dt * 1.5; p.vz *= 1 - dt * 1.5; p.vy *= 1 - dt * 0.8;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(p.s0 + (p.s1 - p.s0) * Math.sqrt(k));
      p.m.material.opacity = p.op * (1 - k * k);
      p.m.rotation.y += dt * 0.3;
    }
    for (const f of this.fireballs) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) { f.m.visible = false; continue; }
      const k = 1 - f.life / 0.45;
      f.m.scale.setScalar(f.size * (0.4 + k * 0.8));
      f.m.material.opacity = 1 - k;
      f.m.material.color.setHSL(0.09 - k * 0.06, 1, 0.65 - k * 0.3);
    }
    for (const L of this.lights) {
      if (L.life <= 0) { L.l.intensity = 0; continue; }
      L.life -= dt; L.l.intensity = Math.max(0, L.I * (L.life / L.max));
    }
    for (const d of this.debris) {
      if (d.life <= 0) continue;
      d.life -= dt;
      d.v.y -= 20 * dt;
      d.m.position.addScaledVector(d.v, dt);
      d.m.rotation.x += d.w.x * dt; d.m.rotation.y += d.w.y * dt;
      if (d.m.position.y < d.ground) { d.m.position.y = d.ground; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; d.w.multiplyScalar(0.5); }
      if (d.life <= 0) d.m.visible = false;
    }
    // smoke clouds: keep emitting big grey puffs while alive
    for (let i = this.clouds.length - 1; i >= 0; i--) {
      const c = this.clouds[i];
      c.life -= dt; c.t += dt;
      c.k = Math.min(1, c.t / 1.5) * Math.min(1, c.life / 2.5);
      if (c.life <= 0) { this.clouds.splice(i, 1); continue; }
      if (Math.random() < dt * 14 && c.life > 1.5) {
        const a = Math.random() * 6.28, rr = Math.random() * c.r * 0.8 * Math.min(1, c.t / 1.2);
        this.puff(c.x + Math.cos(a) * rr, c.y - 1 + Math.random() * 2.2, c.z + Math.sin(a) * rr, 0, 0.15, 0, 3.4, 1.5, 3.2, Math.random() < 0.5 ? '#c8c8c4' : '#b0b0ac', 0.9);
      }
    }
  }
}
function dotTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 32;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export { up, tmp2 };
