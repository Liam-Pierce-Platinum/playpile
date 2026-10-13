// Visual effects: GPU point particles, flash lights, ground rings, telegraphs, damage numbers.
import * as THREE from '../vendor/three.module.js';

const MAXP = 2400;

export class Particles {
  constructor(scene, tex, additive = true) {
    this.n = 0;
    this.pos = new Float32Array(MAXP * 3); this.col = new Float32Array(MAXP * 3);
    this.size = new Float32Array(MAXP); this.alpha = new Float32Array(MAXP);
    this.vel = new Float32Array(MAXP * 3); this.life = new Float32Array(MAXP); this.max = new Float32Array(MAXP);
    this.grav = new Float32Array(MAXP); this.drag = new Float32Array(MAXP); this.s0 = new Float32Array(MAXP); this.s1 = new Float32Array(MAXP);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/-mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map, gl_PointCoord); gl_FragColor=vec4(vC*t.rgb, t.a*vA); }`,
      transparent: true, depthWrite: false, vertexColors: true,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
  }
  setScale(h) { this.points.material.uniforms.scale.value = h * 0.9; }
  emit(x, y, z, vx, vy, vz, color, size, life, o = {}) {
    if (this.n >= MAXP) return;
    const i = this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    const c = typeof color === 'number' ? _c.setHex(color) : color;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.life[i] = life; this.max[i] = life; this.s0[i] = size; this.s1[i] = o.end ?? size * 0.2;
    this.grav[i] = o.grav ?? 0; this.drag[i] = o.drag ?? 2; this.alpha[i] = 1; this.size[i] = size;
  }
  burst(x, y, z, color, n, speed, size, life, o = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, u = o.flat ? Math.random() * 0.3 : Math.random() * 2 - 1;
      const s = speed * (0.4 + Math.random() * 0.6), h = Math.sqrt(1 - u * u);
      this.emit(x, y, z, Math.cos(a) * h * s, (o.up ?? 0) + u * s, Math.sin(a) * h * s, color, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.6), o);
    }
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this._kill(i); continue; }
      const k = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= k; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * k - this.grav[i] * dt; this.vel[i * 3 + 2] *= k;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      const t = this.life[i] / this.max[i];
      this.alpha[i] = Math.min(1, t * 2.2);
      this.size[i] = this.s1[i] + (this.s0[i] - this.s1[i]) * t;
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.n);
    g.attributes.position.needsUpdate = true; g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true; g.attributes.alpha.needsUpdate = true;
  }
  _kill(i) {
    const j = --this.n;
    if (i === j) return;
    for (let a = 0; a < 3; a++) { this.pos[i * 3 + a] = this.pos[j * 3 + a]; this.vel[i * 3 + a] = this.vel[j * 3 + a]; this.col[i * 3 + a] = this.col[j * 3 + a]; }
    this.life[i] = this.life[j]; this.max[i] = this.max[j]; this.s0[i] = this.s0[j]; this.s1[i] = this.s1[j];
    this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j]; this.alpha[i] = this.alpha[j]; this.size[i] = this.size[j];
  }
  clear() { this.n = 0; }
}
const _c = new THREE.Color();

// A small pool of point lights for spell flashes (fixed count so shaders never recompile).
export class FlashLights {
  constructor(scene, n = 4) {
    this.l = [];
    for (let i = 0; i < n; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 10, 1.6); L.position.set(0, -50, 0);
      scene.add(L); this.l.push({ L, t: 0, max: 1, i0: 0 });
    }
    this.k = 0;
  }
  flash(x, y, z, color, intensity, dist, dur) {
    // take the weakest light
    let best = this.l[0];
    for (const o of this.l) if (o.L.intensity < best.L.intensity) best = o;
    best.L.position.set(x, y, z); best.L.color.setHex(color); best.L.distance = dist;
    best.i0 = intensity; best.t = dur; best.max = dur; best.L.intensity = intensity;
  }
  update(dt) {
    for (const o of this.l) {
      if (o.t <= 0) { o.L.intensity = 0; continue; }
      o.t -= dt; o.L.intensity = o.i0 * Math.max(0, o.t / o.max);
    }
  }
}

const _hot = new THREE.Color(0xffe6a0);
// Ground decals: expanding rings, telegraph circles and lines.
export class Ground {
  constructor(scene, tex) {
    this.scene = scene; this.tex = tex; this.items = [];
    this.circleGeo = new THREE.CircleGeometry(1, 48);
    this.ringGeo = new THREE.RingGeometry(0.94, 1, 64);
    this.planeGeo = new THREE.PlaneGeometry(1, 1); this.planeGeo.translate(0, 0.5, 0);
    this.ringTexGeo = new THREE.PlaneGeometry(2, 2);
  }
  _mat(color, opacity, additive = true, map = null) {
    return new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, map,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide });
  }
  // expanding shock ring
  ring(x, z, r, color, dur = 0.45, y = 0.08, linear = false) {
    const m = new THREE.Mesh(this.ringTexGeo, this._mat(color, 1, true, this.tex.ring));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.setScalar(0.1);
    this.scene.add(m);
    this.items.push({ kind: 'ring', m, r, t: 0, dur, linear });
  }
  // telegraph circle: fill grows from 0 to full over dur
  teleCircle(x, z, r, dur, color = 0xff3030) {
    const g = new THREE.Group(); g.position.set(x, 0.05, z);
    const fill = new THREE.Mesh(this.circleGeo, this._mat(color, 0.35, false)); fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(0.01);
    const edge = new THREE.Mesh(this.ringGeo, this._mat(color, 0.9, false)); edge.rotation.x = -Math.PI / 2; edge.scale.setScalar(r);
    const base = new THREE.Mesh(this.circleGeo, this._mat(color, 0.2, false)); base.rotation.x = -Math.PI / 2; base.scale.setScalar(r); base.position.y = -0.005;
    g.add(base, fill, edge); this.scene.add(g);
    const it = { kind: 'tele', g, fill, r, t: 0, dur, edges: [edge] };
    this.items.push(it); return it;
  }
  // telegraph line from (x,z) along angle a, length len, width w
  teleLine(x, z, a, len, w, dur, color = 0xff3030) {
    const g = new THREE.Group(); g.position.set(x, 0.06, z); g.rotation.y = a;
    const base = new THREE.Mesh(this.planeGeo, this._mat(color, 0.22, false)); base.rotation.x = Math.PI / 2; base.scale.set(w, len, 1);
    const fill = new THREE.Mesh(this.planeGeo, this._mat(color, 0.45, false)); fill.rotation.x = Math.PI / 2; fill.scale.set(w, 0.01, 1); fill.position.y = 0.005;
    g.add(base, fill);
    // bright side rails so the danger lane reads on the warm floor
    const edges = [];
    for (const sx of [-1, 1]) { const e = new THREE.Mesh(this.planeGeo, this._mat(color, 0.9, false)); e.rotation.x = Math.PI / 2; e.scale.set(0.07, len, 1); e.position.set(sx * (w / 2 - 0.035), 0.01, 0); g.add(e); edges.push(e); }
    this.scene.add(g);
    const it = { kind: 'line', g, fill, len, w, t: 0, dur, edges };
    this.items.push(it); return it;
  }
  // telegraph cone/arc (melee swing)
  teleArc(x, z, a, r, spread, dur, color = 0xff3030) {
    const geo = new THREE.CircleGeometry(1, 32, -Math.PI / 2 - spread / 2, spread);
    const g = new THREE.Group(); g.position.set(x, 0.06, z); g.rotation.y = a;
    const base = new THREE.Mesh(geo, this._mat(color, 0.15, false)); base.rotation.x = -Math.PI / 2; base.scale.setScalar(r);
    base.material.opacity = 0.22;
    const fill = new THREE.Mesh(geo, this._mat(color, 0.45, false)); fill.rotation.x = -Math.PI / 2; fill.scale.setScalar(0.01); fill.position.y = 0.005;
    const egeo = new THREE.RingGeometry(1 - 0.08 / r, 1, 32, 1, -Math.PI / 2 - spread / 2, spread);
    const edge = new THREE.Mesh(egeo, this._mat(color, 0.9, false)); edge.rotation.x = -Math.PI / 2; edge.scale.setScalar(r); edge.position.y = 0.01;
    g.add(base, fill, edge); this.scene.add(g);
    const it = { kind: 'arc', g, fill, r, t: 0, dur, geo, egeo, edges: [edge] };
    this.items.push(it); return it;
  }
  remove(it) { it.dead = true; }
  update(dt) {
    for (const it of this.items) {
      it.t += dt;
      const p = Math.min(1, it.t / it.dur);
      if (it.kind === 'ring') {
        it.m.scale.setScalar(0.1 + it.r * (it.linear ? p : 1 - Math.pow(1 - p, 3)));
        it.m.material.opacity = it.linear ? 1 - p * p : 1 - p;
        if (p >= 1) it.dead = true;
      }
      if (it.edges) { const hot = Math.max(0, (p - 0.7) / 0.3); for (const e of it.edges) { const c0 = e.userData.c0 || (e.userData.c0 = e.material.color.clone()); e.material.color.copy(c0).lerp(_hot, hot); e.material.opacity = 0.75 + 0.25 * hot; } }
      if (it.kind === 'ring') { /* handled above */ } else if (it.kind === 'tele') {
        it.fill.scale.setScalar(Math.max(0.01, it.r * p));
        if (it.t > it.dur + 0.05) it.dead = true;
      } else if (it.kind === 'line') {
        it.fill.scale.set(it.w, Math.max(0.01, it.len * p), 1);
        if (it.t > it.dur + 0.05) it.dead = true;
      } else if (it.kind === 'arc') {
        it.fill.scale.setScalar(Math.max(0.01, it.r * p));
        if (it.t > it.dur + 0.05) it.dead = true;
      }
    }
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      if (!it.dead) continue;
      const o = it.m || it.g;
      this.scene.remove(o);
      o.traverse((c) => { if (c.material) c.material.dispose(); });
      if (it.geo) it.geo.dispose();
      if (it.egeo) it.egeo.dispose();
      this.items.splice(i, 1);
    }
  }
  clear() { for (const it of this.items) it.dead = true; this.update(0); }
}

// Floating damage numbers (DOM, projected each frame).
export class DamageNumbers {
  constructor(el) { this.el = el; this.list = []; this.pool = []; this.v = new THREE.Vector3(); }
  add(x, y, z, text, cls = '') {
    if (this.list.length > 60) return;
    const d = this.pool.pop() || document.createElement('div');
    d.className = 'dn ' + cls; d.textContent = text;
    this.el.appendChild(d);
    this.list.push({ d, x: x + (Math.random() - 0.5) * 0.5, y, z, t: 0, vx: (Math.random() - 0.5) * 30 });
  }
  update(dt, camera, w, h) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const n = this.list[i];
      n.t += dt;
      if (n.t > 0.85) { n.d.remove(); this.pool.push(n.d); this.list.splice(i, 1); continue; }
      this.v.set(n.x, n.y + n.t * 1.6, n.z).project(camera);
      const sx = (this.v.x * 0.5 + 0.5) * w + n.vx * n.t, sy = (-this.v.y * 0.5 + 0.5) * h;
      const sc = n.t < 0.1 ? 0.6 + n.t * 6 : 1.2 - n.t * 0.3;
      n.d.style.transform = `translate(${sx | 0}px,${sy | 0}px) translate(-50%,-50%) scale(${sc.toFixed(2)})`;
      n.d.style.opacity = n.t > 0.6 ? (1 - (n.t - 0.6) / 0.25).toFixed(2) : '1';
    }
  }
  clear() { for (const n of this.list) { n.d.remove(); this.pool.push(n.d); } this.list.length = 0; }
}
