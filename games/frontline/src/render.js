// Scene setup: renderer, sky dome, fog, sun + hemisphere light, terrain mesh, the merged
// static map mesh (chunked for culling), water, and a second scene for the viewmodel.
import * as THREE from '../vendor/three.module.js';
import { Merger, MAT, unitShape } from './models.js';
import { shade } from './maps.js';

export class Renderer {
  constructor(canvas, opts = {}) {
    this.lq = !!opts.lq;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: !this.lq, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.lq ? 1 : 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = !opts.noShadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(78, 1, 0.05, 600);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
    this.vmScene.add(this.vmCamera);
    this.mapGroup = null;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }
  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h; this.vmCamera.updateProjectionMatrix();
  }
  // build everything for a map definition
  loadMap(def, world) {
    if (this.mapGroup) {
      if (this.mapDef === def) return; // same map already built
      this.scene.remove(this.mapGroup);
      this.mapGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.mapDef = def;
    const g = new THREE.Group();
    this.mapGroup = g;
    this.scene.add(g);
    const sky = def.sky;
    this.renderer.toneMappingExposure = sky.exposure ?? 1;
    this.scene.fog = new THREE.Fog(sky.fog, sky.fogNear, sky.fogFar);
    this.scene.background = new THREE.Color(sky.fog);
    // sky dome
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color(sky.top) }, mid: { value: new THREE.Color(sky.mid) }, bot: { value: new THREE.Color(sky.bottom) }, fogc: { value: new THREE.Color(sky.fog) }, sun: { value: new THREE.Vector3(...sky.sun).normalize() }, sunc: { value: new THREE.Color(sky.sunCol) } },
      vertexShader: 'varying vec3 vd; void main(){ vd = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; gl_Position.z = gl_Position.w*0.9999; }',
      fragmentShader: `uniform vec3 top, mid, bot, fogc, sun, sunc; varying vec3 vd;
        void main(){ float h = vd.y; vec3 c = h > 0.0 ? mix(mid, top, pow(clamp(h*1.6,0.0,1.0), 0.8)) : mix(mid, bot, clamp(-h*4.0,0.0,1.0));
          c = mix(fogc, c, smoothstep(-0.02, 0.22, h));
          float s = max(dot(vd, sun), 0.0); c += sunc * (pow(s, 600.0)*3.0 + pow(s, 12.0)*0.35);
          gl_FragColor = vec4(c, 1.0); }`,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(400, 24, 12), skyMat);
    skyMesh.frustumCulled = false;
    skyMesh.renderOrder = -10;
    g.add(skyMesh);
    this.sky = skyMesh;
    // distant low-poly hills ring (silhouette beyond the map)
    {
      const m = new Merger(55);
      const hc = shade(sky.fog, 0.8);
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * Math.PI * 2, r = 150 + (i % 3) * 25;
        m.addShape('cone', Math.cos(a) * r, -2, Math.sin(a) * r, 30 + (i * 7) % 20, 22 + (i * 13) % 26, 30, i % 2 ? hc : shade(hc, 0.9), { seg: 5, ry: i, jit: 0.05, ao: 0.3 });
      }
      g.add(new THREE.Mesh(m.build(), MAT.world));
    }
    // lights
    g.add(new THREE.HemisphereLight(sky.hemiSky, sky.hemiGround, sky.hemiI * 1.25));
    const sun = new THREE.DirectionalLight(sky.sunCol, sky.sunI);
    const sd = new THREE.Vector3(...sky.sun).normalize();
    sun.position.copy(sd).multiplyScalar(120);
    sun.target.position.set(0, 0, 0);
    sun.castShadow = this.renderer.shadowMap.enabled;
    const S = 95;
    sun.shadow.camera.left = -S; sun.shadow.camera.right = S; sun.shadow.camera.top = S; sun.shadow.camera.bottom = -S;
    sun.shadow.camera.near = 10; sun.shadow.camera.far = 300;
    sun.shadow.mapSize.set(this.lq ? 2048 : 4096, this.lq ? 2048 : 4096);
    sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
    g.add(sun); g.add(sun.target);
    this.sun = sun;
    // terrain
    g.add(this.buildTerrain(def, world));
    // water
    if (def.waterY !== undefined) {
      const wg = new THREE.PlaneGeometry(def.w + 40, def.d + 40, 60, 80);
      wg.rotateX(-Math.PI / 2);
      const wm = new THREE.MeshLambertMaterial({ color: '#3f8fa0', transparent: true, opacity: 0.8, emissive: '#0d3a48', emissiveIntensity: 0.4 });
      const water = new THREE.Mesh(wg, wm);
      water.position.y = def.waterY;
      water.receiveShadow = true;
      g.add(water);
      this.water = water;
      this.waterBase = wg.attributes.position.array.slice();
    } else this.water = null;
    // static boxes + deco, chunked into 32 m tiles
    const CH = 32, tiles = new Map();
    const tile = (x, z) => { const k = Math.floor((x + 200) / CH) * 100 + Math.floor((z + 200) / CH); if (!tiles.has(k)) tiles.set(k, { m: new Merger(k), glow: new Merger(k + 7) }); return tiles.get(k); };
    for (const b of def.boxes) {
      if (b.hidden) continue;
      const t = tile((b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2);
      t.m.addBox((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0, b.col, { jit: b.jit ?? 0.05, ao: Math.min(0.3, 0.12 + (b.y1 - b.y0) * 0.05) });
    }
    for (const d of def.deco) {
      const t = tile(d.x, d.z);
      const tgt = d.glow ? t.glow : t.m;
      const o = { rx: d.rx || 0, ry: d.ry || 0, rz: d.rz || 0, seg: d.seg || 8, jit: 0.05, ao: 0.16 };
      if (d.t === 'ico') { o.rock = true; o.rockJ = d.jit; o.seed = d.x * 3.1 + d.z; }
      tgt.addShape(d.t, d.x, d.y, d.z, d.sx, d.sy, d.sz, d.col, o);
    }
    for (const t of tiles.values()) {
      if (t.m.count) { const mesh = new THREE.Mesh(t.m.build(), MAT.world); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); }
      if (t.glow.count) g.add(new THREE.Mesh(t.glow.build(), MAT.glow));
    }
    this.renderer.shadowMap.needsUpdate = true;
  }
  buildTerrain(def, world) {
    const step = 1.25;
    const nx = Math.ceil(def.w / step) + 16, nz = Math.ceil(def.d / step) + 16;
    const x0 = -def.w / 2 - 8 * step, z0 = -def.d / 2 - 8 * step;
    const pos = [], col = [], nor = [];
    const H = (x, z) => {
      if (Math.abs(x) > def.w / 2 || Math.abs(z) > def.d / 2) {
        const e = Math.max(Math.abs(x) - def.w / 2, Math.abs(z) - def.d / 2);
        return world.groundY(Math.max(-def.w / 2, Math.min(def.w / 2, x)), Math.max(-def.d / 2, Math.min(def.d / 2, z))) + e * 0.8;
      }
      return world.groundY(x, z);
    };
    const hv = new Float32Array((nx + 1) * (nz + 1));
    for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) hv[j * (nx + 1) + i] = H(x0 + i * step, z0 + j * step);
    const c = new THREE.Color();
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3(), n = new THREE.Vector3(), t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const tri = (ax, az, bx, bz, cx, cz, ha, hb, hc) => {
      a.set(ax, ha, az); b.set(bx, hb, bz); cc.set(cx, hc, cz);
      t1.subVectors(b, a); t2.subVectors(cc, a); n.crossVectors(t1, t2).normalize(); if (n.y < 0) n.negate();
      const mx = (ax + bx + cx) / 3, mz = (az + bz + cz) / 3, my = (ha + hb + hc) / 3;
      c.set(def.groundCol(Math.max(-def.w / 2, Math.min(def.w / 2, mx)), Math.max(-def.d / 2, Math.min(def.d / 2, mz)), my));
      const f = 0.94 + rnd() * 0.12;
      const sl = 1 - (1 - n.y) * 1.2;
      const k = f * Math.max(0.6, sl);
      for (const v of [a, b, cc]) { pos.push(v.x, v.y, v.z); nor.push(n.x, n.y, n.z); col.push(c.r * k, c.g * k, c.b * k); }
    };
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      const xa = x0 + i * step, xb = xa + step, za = z0 + j * step, zb = za + step;
      const h00 = hv[j * (nx + 1) + i], h10 = hv[j * (nx + 1) + i + 1], h01 = hv[(j + 1) * (nx + 1) + i], h11 = hv[(j + 1) * (nx + 1) + i + 1];
      if ((i + j) & 1) { tri(xa, za, xa, zb, xb, za, h00, h01, h10); tri(xb, za, xa, zb, xb, zb, h10, h01, h11); }
      else { tri(xa, za, xa, zb, xb, zb, h00, h01, h11); tri(xa, za, xb, zb, xb, za, h00, h11, h10); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, MAT.world);
    mesh.receiveShadow = true;
    return mesh;
  }
  update(t) {
    if (this.water) {
      const p = this.water.geometry.attributes.position, base = this.waterBase;
      for (let i = 0; i < p.count; i++) {
        const x = base[i * 3], z = base[i * 3 + 2];
        p.array[i * 3 + 1] = Math.sin(x * 0.35 + t * 1.3) * 0.05 + Math.cos(z * 0.5 + t * 1.1) * 0.05;
      }
      p.needsUpdate = true;
      this.water.geometry.computeVertexNormals();
    }
    if (this.sky) this.sky.position.copy(this.camera.position);
  }
  render(showVM = true) {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (showVM) { r.clearDepth(); r.render(this.vmScene, this.vmCamera); }
  }
}
export { unitShape };
