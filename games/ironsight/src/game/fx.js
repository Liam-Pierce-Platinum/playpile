// Combat effects: billboard particles (dust, sparks, wood chips, snow, blood mist, smoke),
// tracers, ejected shell casings with physics, bullet-hole decals by material, laser beam + dot,
// world-space muzzle flashes with a small pooled light set (fixed count: no shader recompiles).
import * as THREE from 'three';
import { SURF } from '../world/world.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3();

function softTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
function smokeTex() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), img = g.createImageData(128, 128);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const dx = (x - 64) / 64, dy = (y - 64) / 64, r = Math.sqrt(dx * dx + dy * dy);
    let v = 0, a = 1, f = 3; for (let o = 0; o < 4; o++) { v += a * (Math.sin(x / 128 * f * 6.28 + o * 1.7) * Math.sin(y / 128 * f * 5.1 + o * 2.3) * 0.5 + 0.5); a *= 0.5; f *= 2; }
    const al = Math.max(0, 1 - r) ** 1.3 * (0.5 + 0.5 * v / 1.9), i = (y * 128 + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = 255; img.data[i + 3] = al * 255;
  }
  g.putImageData(img, 0, 0); return new THREE.CanvasTexture(c);
}
// bullet-hole atlas 4x2: concrete, metal, wood, drywall, glass, dirt, snow, blood
function holeAtlas() {
  const S = 128, c = document.createElement('canvas'); c.width = S * 4; c.height = S * 2; const g = c.getContext('2d');
  const R = (() => { let s = 5; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2); fn(); g.restore(); };
  const rad = (r0, r1, c0, c1) => { const gr = g.createRadialGradient(0, 0, r0, 0, 0, r1); gr.addColorStop(0, c0); gr.addColorStop(1, c1); return gr; };
  // concrete: chipped crater
  cell(0, () => { g.fillStyle = rad(0, 34, 'rgba(70,66,62,.9)', 'rgba(120,115,108,0)'); g.beginPath(); for (let a = 0; a < 6.3; a += 0.4) g.lineTo(Math.cos(a) * (22 + R() * 14), Math.sin(a) * (22 + R() * 14)); g.fill(); g.fillStyle = 'rgba(15,14,13,1)'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); g.strokeStyle = 'rgba(30,28,26,.6)'; for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(0, 0); const a = R() * 6.3; g.lineTo(Math.cos(a) * 30, Math.sin(a) * 30); g.stroke(); } });
  // metal: bright rim, dark hole
  cell(1, () => { g.fillStyle = rad(6, 22, 'rgba(210,205,195,.9)', 'rgba(120,120,120,0)'); g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.fillStyle = '#060606'; g.beginPath(); g.arc(0, 0, 6, 0, 7); g.fill(); });
  // wood: splintered
  cell(2, () => { g.fillStyle = 'rgba(200,160,110,.85)'; for (let k = 0; k < 9; k++) { g.save(); g.rotate((R() - 0.5) * 0.5); g.fillRect(-3, -24 + R() * 8, 6, 44 - R() * 10); g.restore(); } g.fillStyle = '#120a05'; g.beginPath(); g.arc(0, 0, 6.5, 0, 7); g.fill(); });
  // drywall: clean round with powdery ring
  cell(3, () => { g.fillStyle = rad(5, 26, 'rgba(255,255,255,.7)', 'rgba(255,255,255,0)'); g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill(); g.fillStyle = '#1a1816'; g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fill(); });
  // glass: radial cracks
  cell(4, () => { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.4; for (let k = 0; k < 12; k++) { g.beginPath(); g.moveTo(0, 0); let x = 0, y = 0; const a = k / 12 * 6.28; for (let s = 0; s < 5; s++) { x += Math.cos(a + (R() - 0.5) * 0.5) * 12; y += Math.sin(a + (R() - 0.5) * 0.5) * 12; g.lineTo(x, y); } g.stroke(); } for (let r = 12; r < 50; r += 14) { g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke(); } g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(0, 0, 5, 0, 7); g.fill(); });
  // dirt: dark scatter
  cell(5, () => { g.fillStyle = rad(0, 30, 'rgba(40,30,20,.85)', 'rgba(40,30,20,0)'); g.beginPath(); g.arc(0, 0, 30, 0, 7); g.fill(); });
  // snow: blue-grey dimple
  cell(6, () => { g.fillStyle = rad(0, 26, 'rgba(90,110,140,.7)', 'rgba(150,170,200,0)'); g.beginPath(); g.arc(0, 0, 26, 0, 7); g.fill(); });
  // blood splatter
  cell(7, () => { for (let k = 0; k < 26; k++) { const a = R() * 6.3, r = R() * 46; g.fillStyle = `rgba(${90 + R() * 40},6,6,${0.6 + R() * 0.4})`; g.beginPath(); g.arc(Math.cos(a) * r, Math.sin(a) * r, 2 + R() * (12 - r / 5), 0, 7); g.fill(); } });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const DECAL_IDX = { concrete: 0, metal: 1, wood: 2, drywall: 3, glass: 4, dirt: 5, snow: 6, blood: 7 };

// ---------------------------------------------------------------- billboard particles
class Particles {
  constructor(scene, max, additive, map) {
    this.max = max; this.n = 0;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);   // xyz, size
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);   // rgb, alpha
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);   // stretch dir xyz, rot
    g.setAttribute('aPos', this.aPos); g.setAttribute('aCol', this.aCol); g.setAttribute('aVel', this.aVel);
    g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: map } },
      vertexShader: /* glsl */`
        attribute vec4 aPos, aCol, aVel; varying vec2 vUv; varying vec4 vCol;
        void main(){
          vUv = uv; vCol = aCol;
          vec4 mv = modelViewMatrix * vec4(aPos.xyz, 1.0);
          vec2 q = position.xy * aPos.w;
          float c = cos(aVel.w), s = sin(aVel.w); q = mat2(c, -s, s, c) * q;
          // velocity stretch (sparks): stretch along screen-space motion
          vec3 sv = (viewMatrix * vec4(aVel.xyz, 0.0)).xyz;
          float L = length(sv.xy);
          if (L > 0.001) { vec2 d = sv.xy / L; vec2 n = vec2(-d.y, d.x); q = d * position.y * (aPos.w + L) + n * position.x * aPos.w * 0.35; }
          mv.xy += q;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `uniform sampler2D tMap; varying vec2 vUv; varying vec4 vCol; void main(){ vec4 t = texture2D(tMap, vUv); gl_FragColor = vec4(vCol.rgb * t.rgb, t.a * vCol.a); }`,
      transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = additive ? 8 : 7;
    scene.add(this.mesh);
    this.p = [];
  }
  // opts: pos, vel, size, grow, life, color [r,g,b], alpha, drag, grav, stretch, spin
  emit(o) {
    if (this.p.length >= this.max) this.p.shift();
    this.p.push({ x: o.pos.x, y: o.pos.y, z: o.pos.z, vx: o.vel?.x || 0, vy: o.vel?.y || 0, vz: o.vel?.z || 0, s: o.size || 0.1, grow: o.grow || 0, life: o.life || 1, age: 0,
      r: o.color[0], g: o.color[1], b: o.color[2], a: o.alpha ?? 1, drag: o.drag ?? 1, grav: o.grav ?? 0, stretch: o.stretch || 0, rot: Math.random() * 6.28, spin: o.spin || 0, floor: o.floor ?? -999 });
  }
  update(dt) {
    let n = 0; const P = this.aPos.array, C = this.aCol.array, V = this.aVel.array;
    const keep = [];
    for (const p of this.p) {
      p.age += dt; if (p.age >= p.life) continue;
      const dr = Math.exp(-p.drag * dt);
      p.vx *= dr; p.vy = p.vy * dr - p.grav * dt; p.vz *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < p.floor) { p.y = p.floor; p.vy *= -0.3; p.vx *= 0.6; p.vz *= 0.6; }
      p.s += p.grow * dt; p.rot += p.spin * dt;
      const k = p.age / p.life, fade = Math.min(1, (1 - k) * 2.5) * Math.min(1, p.age * 30 + 0.2);
      P[n * 4] = p.x; P[n * 4 + 1] = p.y; P[n * 4 + 2] = p.z; P[n * 4 + 3] = p.s;
      C[n * 4] = p.r; C[n * 4 + 1] = p.g; C[n * 4 + 2] = p.b; C[n * 4 + 3] = p.a * fade;
      V[n * 4] = p.vx * p.stretch; V[n * 4 + 1] = p.vy * p.stretch; V[n * 4 + 2] = p.vz * p.stretch; V[n * 4 + 3] = p.rot;
      n++; keep.push(p);
    }
    this.p = keep;
    this.mesh.geometry.instanceCount = n;
    this.aPos.needsUpdate = this.aCol.needsUpdate = this.aVel.needsUpdate = true;
  }
  clear() { this.p = []; this.mesh.geometry.instanceCount = 0; }
}

// ---------------------------------------------------------------- tracers (camera-facing streaks)
class Streaks {
  constructor(scene, max = 256) {
    this.max = max;
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([-1, 0, 0, 1, 0, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    this.aA = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aB = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    this.aC = new THREE.InstancedBufferAttribute(new Float32Array(max * 4), 4).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aA', this.aA); g.setAttribute('aB', this.aB); g.setAttribute('aC', this.aC); g.instanceCount = 0;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: /* glsl */`
        attribute vec4 aA, aB, aC; varying float vY; varying vec4 vC; varying float vX;
        void main(){
          vec3 p = mix(aA.xyz, aB.xyz, position.y);
          vec3 dir = normalize(aB.xyz - aA.xyz);
          vec3 toCam = normalize(cameraPosition - p);
          vec3 side = normalize(cross(dir, toCam));
          float d = distance(p, cameraPosition);
          float w = max(aA.w, d * 0.0012);
          p += side * position.x * w;
          vY = position.y; vX = position.x; vC = aC; vC.a *= aA.w / w;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `varying float vY, vX; varying vec4 vC; void main(){ float a = vC.a * smoothstep(0.0, 0.25, vY) * (1.0 - abs(vX)); gl_FragColor = vec4(vC.rgb, a); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    this.mesh = new THREE.Mesh(g, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 9;
    scene.add(this.mesh);
    this.list = [];
  }
  set(i, a, b, w, col, alpha) {
    const A = this.aA.array, B = this.aB.array, C = this.aC.array;
    A[i * 4] = a.x; A[i * 4 + 1] = a.y; A[i * 4 + 2] = a.z; A[i * 4 + 3] = w;
    B[i * 4] = b.x; B[i * 4 + 1] = b.y; B[i * 4 + 2] = b.z;
    C[i * 4] = col[0]; C[i * 4 + 1] = col[1]; C[i * 4 + 2] = col[2]; C[i * 4 + 3] = alpha;
  }
}

export class FX {
  constructor(scene, world) {
    this.scene = scene; this.world = world;
    const soft = softTex(), smoke = smokeTex();
    this.alpha = new Particles(scene, 2500, false, smoke);
    this.add = new Particles(scene, 2000, true, soft);
    this.streaks = new Streaks(scene, 300);
    this.tracers = [];
    // decals
    const dg = new THREE.PlaneGeometry(1, 1);
    this.decalOff = new THREE.InstancedBufferAttribute(new Float32Array(800 * 2), 2);
    dg.setAttribute('aOff', this.decalOff);
    const dm = new THREE.MeshStandardMaterial({ map: holeAtlas(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, roughness: 0.9 });
    dm.onBeforeCompile = sh => {
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aOff;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv * vec2(0.25, 0.5) + aOff;\n#endif');
    };
    this.decals = new THREE.InstancedMesh(dg, dm, 800); this.decals.count = 0; this.decals.frustumCulled = false; this.decals.renderOrder = 2; this.decalHead = 0;
    scene.add(this.decals);
    // shells
    const sg = new THREE.CylinderGeometry(0.0048, 0.0048, 0.045, 8).rotateX(Math.PI / 2);
    this.shellMesh = new THREE.InstancedMesh(sg, new THREE.MeshPhysicalMaterial({ color: 0xc9a25a, metalness: 1, roughness: 0.25 }), 160);
    this.shellMesh.count = 0; this.shellMesh.frustumCulled = false; this.shellMesh.castShadow = false;
    scene.add(this.shellMesh);
    this.shells = [];
    // laser
    this.laserBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0012, 1, 6, 1, true).translate(0, 0.5, 0).rotateX(Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xff2020, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.laserBeam.frustumCulled = false; this.laserBeam.visible = false; this.laserBeam.renderOrder = 9;
    this.laserDot = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: 0xff2020, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: true, toneMapped: false, transparent: true }));
    this.laserDot.visible = false; this.laserDot.renderOrder = 10;
    scene.add(this.laserBeam, this.laserDot);
    // world muzzle flash sprites + lights (fixed pool)
    this.flashes = [];
    this.flashLights = [0, 1, 2].map(() => { const l = new THREE.PointLight(0xffaa55, 0, 9, 2); scene.add(l); return l; });
    this.flashSprites = [0, 1, 2, 3, 4, 5].map(() => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: soft, color: new THREE.Color(4, 2.6, 1.2), blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })); s.visible = false; scene.add(s); return s; });
    this.flashIdx = 0;
    this.time = 0;
  }
  setWorld(world) { this.world = world; }
  clear() {
    this.alpha.clear(); this.add.clear(); this.tracers = []; this.streaks.mesh.geometry.instanceCount = 0;
    this.decals.count = 0; this.decalHead = 0; this.shells = []; this.shellMesh.count = 0;
    this.flashes = []; this.flashLights.forEach(l => l.intensity = 0); this.flashSprites.forEach(s => s.visible = false);
  }
  // ---------------- impacts
  impact(point, normal, surf, dir, power = 1) {
    const S = SURF[surf] || SURF.concrete, col = S.col;
    const n = normal;
    const kick = (sp, spread) => _v.copy(n).multiplyScalar(sp).add(_v2.set((Math.random() - 0.5) * spread, (Math.random() - 0.2) * spread, (Math.random() - 0.5) * spread)).clone();
    switch (S.fx) {
      case 'spark':
        for (let i = 0; i < 10 * power; i++) this.add.emit({ pos: point, vel: kick(4 + Math.random() * 6, 7), size: 0.012, life: 0.25 + Math.random() * 0.3, color: [4, 2.6, 1.1], grav: 9, drag: 1.5, stretch: 0.02 });
        this.alpha.emit({ pos: point, vel: kick(0.6, 0.4), size: 0.15, grow: 0.5, life: 0.6, color: [0.5, 0.5, 0.5], alpha: 0.35, drag: 3 });
        break;
      case 'wood':
        for (let i = 0; i < 7 * power; i++) this.alpha.emit({ pos: point, vel: kick(2.5 + Math.random() * 3, 3), size: 0.025, life: 0.9, color: [0.55, 0.42, 0.28], grav: 9, drag: 1, spin: 20, floor: 0.01 });
        this.alpha.emit({ pos: point, vel: kick(0.8, 0.5), size: 0.2, grow: 0.6, life: 0.9, color: [0.55, 0.47, 0.38], alpha: 0.5, drag: 3 });
        break;
      case 'glass':
        for (let i = 0; i < 12 * power; i++) this.add.emit({ pos: point, vel: kick(2 + Math.random() * 3, 3).add(_v.copy(dir).multiplyScalar(2)), size: 0.012, life: 0.7, color: [0.8, 0.9, 1], alpha: 0.7, grav: 9, floor: 0.01 });
        break;
      case 'blood':
        for (let i = 0; i < 6 * power; i++) this.alpha.emit({ pos: point, vel: _v.copy(dir).multiplyScalar(1.5 + Math.random() * 2).add(_v2.set((Math.random() - 0.5) * 1.6, (Math.random() - 0.3) * 1.6, (Math.random() - 0.5) * 1.6)).clone(), size: 0.06 + Math.random() * 0.06, grow: 0.5, life: 0.5, color: [0.28, 0.02, 0.02], alpha: 0.85, grav: 4, drag: 2.5 });
        this.alpha.emit({ pos: point, vel: _v.copy(dir).multiplyScalar(0.6).clone(), size: 0.18, grow: 0.9, life: 0.7, color: [0.35, 0.03, 0.03], alpha: 0.6, drag: 3 });
        break;
      case 'snow':
        for (let i = 0; i < 6; i++) this.alpha.emit({ pos: point, vel: kick(1.5 + Math.random() * 2.5, 2), size: 0.12, grow: 0.6, life: 1.0, color: [0.95, 0.97, 1], alpha: 0.8, grav: 3, drag: 2.5 });
        break;
      case 'leaf': break;
      default: { // dust / dirt / sand: chunks + puff
        for (let i = 0; i < 5 * power; i++) this.alpha.emit({ pos: point, vel: kick(2 + Math.random() * 4, 3), size: 0.02, life: 0.8, color: col.map(c => c * 0.6), grav: 9.8, drag: 0.6, floor: 0.01 });
        this.alpha.emit({ pos: point, vel: kick(1.2, 0.6), size: 0.18, grow: 0.9, life: 1.0 + Math.random() * 0.5, color: col, alpha: 0.6, drag: 2.5 });
        this.alpha.emit({ pos: point, vel: kick(0.5, 0.6), size: 0.3, grow: 0.6, life: 1.8, color: col, alpha: 0.3, drag: 2 });
      }
    }
    if (S.decal) this.decal(point, normal, S.decal, surf === 'sand' || surf === 'snow' ? 0.12 : 0.07);
  }
  decal(point, normal, kind, size = 0.07) {
    const i = this.decalHead; this.decalHead = (this.decalHead + 1) % 800; this.decals.count = Math.max(this.decals.count, i + 1);
    const idx = DECAL_IDX[kind] ?? 0;
    this.decalOff.array[i * 2] = (idx % 4) * 0.25; this.decalOff.array[i * 2 + 1] = (1 - Math.floor(idx / 4)) * 0.5; this.decalOff.needsUpdate = true;
    _q.setFromUnitVectors(_v.set(0, 0, 1), normal); _q.multiply(new THREE.Quaternion().setFromAxisAngle(_v.set(0, 0, 1), Math.random() * 6.28));
    const s = size * (0.8 + Math.random() * 0.4) * (kind === 'blood' ? 6 : 1);
    _m.compose(_v2.copy(point).addScaledVector(normal, 0.003), _q, _s.set(s, s, 1));
    this.decals.setMatrixAt(i, _m); this.decals.instanceMatrix.needsUpdate = true;
  }
  tracer(a, dir, speed, opts = {}) {
    this.tracers.push({ p: a.clone(), d: dir.clone().normalize(), sp: speed, len: opts.len ?? Math.min(3.5, speed * 0.004), w: opts.w ?? 0.006, col: opts.col || [3.2, 2.2, 1.2], life: opts.life ?? 1.2, age: 0, alpha: opts.alpha ?? 0.6, maxD: opts.maxD ?? 600, travelled: 0 });
  }
  muzzleSmoke(pos, dir, k = 1) {
    for (let i = 0; i < 2; i++) this.alpha.emit({ pos, vel: _v.copy(dir).multiplyScalar(0.6 + Math.random()).add(_v2.set(0, 0.3, 0)).clone(), size: 0.06, grow: 0.5 * k, life: 1.2, color: [0.7, 0.7, 0.72], alpha: 0.18 * k, drag: 2 });
  }
  worldFlash(pos, dir, strength = 1) {
    const s = this.flashSprites[this.flashIdx % this.flashSprites.length]; this.flashIdx++;
    s.position.copy(pos).addScaledVector(dir, 0.08); s.scale.setScalar(0.35 * strength); s.visible = true; s.material.rotation = Math.random() * 6;
    const l = this.flashLights[this.flashIdx % this.flashLights.length]; l.position.copy(pos); l.intensity = 6 * strength;
    this.flashes.push({ s, l, t: 0.05 });
  }
  ejectShell(pos, vel, surfAt) {
    if (this.shells.length >= 160) this.shells.shift();
    this.shells.push({ p: pos.clone(), v: vel.clone(), q: new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.random() * 6, Math.random() * 6, 0)), w: new THREE.Vector3((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40, (Math.random() - 0.5) * 40), age: 0, rest: false, bounces: 0 });
  }
  setLaser(on, from, to, color, visibility = 0.25) {
    this.laserBeam.visible = on && !!from; this.laserDot.visible = on && !!to;
    if (!on) return;
    this.laserBeam.material.color.set(color); this.laserDot.material.color.set(color).multiplyScalar(3);
    if (from && to) {
      const L = from.distanceTo(to);
      this.laserBeam.position.copy(from); this.laserBeam.lookAt(to); this.laserBeam.scale.set(1, 1, L);
      this.laserBeam.material.opacity = visibility;
    }
    if (to) { this.laserDot.position.copy(to); const d = to.distanceTo(this.scene.userData.camPos || to); this.laserDot.scale.setScalar(Math.max(0.025, d * 0.006)); }
  }
  update(dt, audio) {
    this.time += dt;
    this.alpha.update(dt); this.add.update(dt);
    // tracers advance with their bullets' speed
    let n = 0;
    const keep = [];
    for (const t of this.tracers) {
      t.age += dt; const step = t.sp * dt; t.p.addScaledVector(t.d, step); t.travelled += step;
      if (t.age > t.life || t.travelled > t.maxD + t.len) continue;
      if (n < this.streaks.max) { const tail = _v.copy(t.p).addScaledVector(t.d, -Math.min(t.len, t.travelled)); this.streaks.set(n++, tail, t.p, t.w, t.col, t.alpha); }
      keep.push(t);
    }
    this.tracers = keep;
    this.streaks.mesh.geometry.instanceCount = n;
    this.streaks.aA.needsUpdate = this.streaks.aB.needsUpdate = this.streaks.aC.needsUpdate = true;
    // shells
    const W = this.world;
    let si = 0;
    for (const s of this.shells) {
      s.age += dt;
      if (!s.rest) {
        s.v.y -= 9.8 * dt;
        const L = s.v.length() * dt;
        if (W && L > 0) {
          const d = _v.copy(s.v).normalize();
          const hit = W.raycast(s.p, d, L + 0.005, b => b.solid, this._hit || (this._hit = {}));
          if (hit) {
            s.p.copy(hit.point).addScaledVector(hit.normal, 0.004);
            const vn = s.v.dot(hit.normal); s.v.addScaledVector(hit.normal, -1.45 * vn).multiplyScalar(0.45);
            s.w.multiplyScalar(0.5); s.bounces++;
            if (s.bounces <= 2 && audio) audio.shell(s.p, hit.box.surf);
            if (s.v.length() < 0.35 || s.bounces > 4) { s.rest = true; s.q.setFromEuler(new THREE.Euler(0, Math.random() * 6, 0)).multiply(new THREE.Quaternion().setFromAxisAngle(_v2.set(0, 0, 1), Math.PI / 2)); s.p.y = hit.point.y + 0.0048; }
          } else s.p.addScaledVector(s.v, dt);
        } else s.p.addScaledVector(s.v, dt);
        if (!s.rest) s.q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.w.x * dt, s.w.y * dt, s.w.z * dt)));
      }
      const scale = s.age > 20 ? Math.max(0, 1 - (s.age - 20)) : 1;
      _m.compose(s.p, s.q, _s.setScalar(scale));
      this.shellMesh.setMatrixAt(si++, _m);
    }
    this.shells = this.shells.filter(s => s.age < 21);
    this.shellMesh.count = si; this.shellMesh.instanceMatrix.needsUpdate = true;
    // flashes
    for (const f of this.flashes) { f.t -= dt; if (f.t <= 0) { f.s.visible = false; f.l.intensity = 0; } }
    this.flashes = this.flashes.filter(f => f.t > 0);
  }
}
