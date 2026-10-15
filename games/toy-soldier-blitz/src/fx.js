// Juice: plastic/wood chips, tracers, muzzle flashes, smoke, sparks, boom light.
import * as THREE from '../vendor/three.module.js';
import { roundedBox, rand } from './util.js';
import { softDot } from './world.js';

const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(), tmpV = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();

export class FX {
  constructor(scene) {
    this.scene = scene;
    const N = this.N = 360;
    this.chips = new THREE.InstancedMesh(roundedBox(1, 1, 1, 0.2, 1), new THREE.MeshStandardMaterial({ roughness: 0.5 }), N);
    this.chips.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.chips.castShadow = true; this.chips.frustumCulled = false;
    for (let i = 0; i < N; i++) { this.chips.setColorAt(i, tmpC.set(0xffffff)); }
    this.cp = Array.from({ length: N }, () => ({ life: 0, x: 0, y: -99, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, rz: 0, s: 0.1, spin: 0 }));
    this.ci = 0; scene.add(this.chips);
    this.hideAllChips();
    const dot = softDot();
    this.sprites = []; // smoke + flashes + sparks
    for (let i = 0; i < 70; i++) {
      const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, transparent: true, depthWrite: false, color: 0xffffff }));
      m.visible = false; scene.add(m); this.sprites.push({ m, life: 0, max: 1, grow: 1, vy: 0, vx: 0, vz: 0, add: false, a0: 1 });
    }
    this.si = 0;
    this.tracers = [];
    const tg = new THREE.CylinderGeometry(0.025, 0.025, 1, 6, 1, true); tg.rotateX(Math.PI / 2); tg.translate(0, 0, 0.5);
    for (let i = 0; i < 40; i++) {
      const m = new THREE.Mesh(tg, new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false; m.frustumCulled = false; scene.add(m); this.tracers.push({ m, life: 0 });
    }
    this.ti = 0;
    this.light = new THREE.PointLight(0xffb060, 0, 14, 2); scene.add(this.light); this.lightT = 0;
  }
  hideAllChips() { for (let i = 0; i < this.N; i++) { tmpM.makeScale(0, 0, 0); this.chips.setMatrixAt(i, tmpM); } this.chips.instanceMatrix.needsUpdate = true; }
  clear() { for (const c of this.cp) c.life = 0; this.hideAllChips(); for (const s of this.sprites) { s.life = 0; s.m.visible = false; } for (const t of this.tracers) { t.life = 0; t.m.visible = false; } }

  chip(x, y, z, color, n = 6, speed = 4, size = 0.12) {
    for (let k = 0; k < n; k++) {
      const c = this.cp[this.ci]; this.chips.setColorAt(this.ci, tmpC.set(color).offsetHSL(0, 0, rand(-0.08, 0.08)));
      this.ci = (this.ci + 1) % this.N;
      const a = Math.random() * 6.283, u = Math.random();
      c.x = x; c.y = y; c.z = z; c.vx = Math.cos(a) * speed * u; c.vz = Math.sin(a) * speed * u; c.vy = rand(0.4, 1.2) * speed;
      c.rx = rand(0, 6); c.ry = rand(0, 6); c.rz = rand(0, 6); c.spin = rand(-12, 12); c.s = size * rand(0.6, 1.4); c.life = rand(1.2, 2.4);
    }
    this.chips.instanceColor.needsUpdate = true;
  }
  sprite(x, y, z, { color = 0xffffff, size = 1, life = 0.6, grow = 1.5, vy = 0.6, add = false, a0 = 0.8, vx = 0, vz = 0 } = {}) {
    const s = this.sprites[this.si]; this.si = (this.si + 1) % this.sprites.length;
    s.m.visible = true; s.m.position.set(x, y, z); s.m.scale.setScalar(size); s.m.material.color.set(color);
    s.m.material.blending = add ? THREE.AdditiveBlending : THREE.NormalBlending; s.m.material.opacity = a0;
    s.life = life; s.max = life; s.grow = grow; s.vy = vy; s.vx = vx; s.vz = vz; s.a0 = a0; s.size = size;
  }
  tracer(ax, ay, az, bx, by, bz, color = 0xffe08a) {
    const t = this.tracers[this.ti]; this.ti = (this.ti + 1) % this.tracers.length;
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    t.m.visible = true; t.m.position.set(ax, ay, az); t.m.lookAt(bx, by, bz); t.m.scale.set(1, 1, len); t.m.material.color.set(color); t.m.material.opacity = 1; t.life = 0.07;
  }
  muzzle(x, y, z) {
    this.sprite(x, y, z, { color: 0xffc860, size: 0.55, life: 0.05, grow: 0.5, vy: 0, add: true, a0: 1 });
    this.flashLight(x, y, z, 6, 0.05);
  }
  flashLight(x, y, z, i, t) { this.light.position.set(x, y, z); this.light.intensity = Math.max(this.light.intensity, i); this.lightT = Math.max(this.lightT, t); }
  impact(x, y, z, color, wood) {
    this.chip(x, y, z, color, wood ? 5 : 3, 3.5, wood ? 0.1 : 0.06);
    this.sprite(x, y, z, { color: 0xfff0c0, size: 0.35, life: 0.07, grow: 0.3, vy: 0, add: true, a0: 1 });
    this.sprite(x, y, z, { color: wood ? 0xd8c09a : 0xcccccc, size: 0.3, life: 0.5, grow: 2.2, vy: 0.5, a0: 0.45 });
  }
  boom(x, y, z) {
    this.sprite(x, y + 0.5, z, { color: 0xffd080, size: 3, life: 0.16, grow: 2, vy: 0, add: true, a0: 1 });
    this.sprite(x, y + 0.5, z, { color: 0xff7a30, size: 2, life: 0.3, grow: 3, vy: 1, add: true, a0: 0.9 });
    for (let i = 0; i < 9; i++) this.sprite(x + rand(-1, 1), y + rand(0.2, 1.4), z + rand(-1, 1), { color: 0x777068, size: rand(1.2, 2), life: rand(1.2, 2.2), grow: 2.6, vy: rand(0.6, 1.6), a0: 0.6, vx: rand(-1, 1), vz: rand(-1, 1) });
    this.chip(x, y + 0.3, z, 0xffcc66, 10, 9, 0.08);
    this.chip(x, y + 0.3, z, 0x333333, 8, 7, 0.1);
    this.flashLight(x, y + 1, z, 60, 0.18);
  }
  update(dt) {
    let any = false;
    for (let i = 0; i < this.N; i++) {
      const c = this.cp[i]; if (c.life <= 0) continue;
      any = true; c.life -= dt;
      c.vy -= 22 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      if (c.y < c.s * 0.5) { c.y = c.s * 0.5; c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; c.spin *= 0.6; }
      c.rx += c.spin * dt; c.rz += c.spin * dt * 0.7;
      const s = c.life < 0.3 ? c.s * c.life / 0.3 : c.s;
      tmpQ.setFromEuler(tmpE.set(c.rx, c.ry, c.rz)); tmpS.set(s, s * 0.6, s);
      tmpM.compose(tmpV.set(c.x, c.y, c.z), tmpQ, tmpS);
      if (c.life <= 0) tmpM.makeScale(0, 0, 0);
      this.chips.setMatrixAt(i, tmpM);
    }
    if (any) this.chips.instanceMatrix.needsUpdate = true;
    for (const s of this.sprites) {
      if (s.life <= 0) continue;
      s.life -= dt; const k = 1 - s.life / s.max;
      s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt;
      s.m.scale.setScalar(s.size * (1 + k * s.grow)); s.m.material.opacity = s.a0 * (1 - k);
      if (s.life <= 0) s.m.visible = false;
    }
    for (const t of this.tracers) { if (t.life <= 0) continue; t.life -= dt; t.m.material.opacity = Math.max(0, t.life / 0.07); if (t.life <= 0) t.m.visible = false; }
    if (this.lightT > 0) { this.lightT -= dt; if (this.lightT <= 0) this.light.intensity = 0; } else this.light.intensity *= 0.5;
  }
}
