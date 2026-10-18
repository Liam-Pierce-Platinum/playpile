// Blood (the only colour in the game): arterial spurts, spray cones, droplets that splat by impact angle,
// wall drips that run, pools, stains on bodies. Plus sparks, concrete debris, craters, shockwaves, claw trails.
import * as THREE from 'three';
import { pointInBox, hitNormal } from './world.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _t = new THREE.Vector3();
const Z = new THREE.Vector3(0, 0, 1), UP = new THREE.Vector3(0, 1, 0);

function splatTex(kind) {
  const c = document.createElement('canvas'); c.width = 128; c.height = kind === 'drip' ? 256 : 128;
  const g = c.getContext('2d'); g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); };
  if (kind === 'splat') { // main blob, with the satellite droplets thrown toward the top (= direction of travel)
    blob(64, 70, 26); blob(60, 78, 18); blob(70, 60, 16);
    for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, d = 22 + Math.random() * 40; blob(64 + Math.cos(a) * d, 70 + Math.sin(a) * d, 1.5 + Math.random() * 7 * (1 - d / 66)); }
    for (let i = 0; i < 8; i++) { const a = Math.random() * 6.28, d = 20 + Math.random() * 12; blob(64 + Math.cos(a) * d, 70 + Math.sin(a) * d, 2 + Math.random() * 4); }
  } else if (kind === 'drip') { // a splat at the top with a run trailing down
    blob(64, 30, 20);
    const w = 7; g.fillRect(64 - w / 2, 30, w, 210); blob(64, 240, 7);
  } else { // crater: cracked dark impact
    g.strokeStyle = '#fff'; g.lineCap = 'round';
    const rg = g.createRadialGradient(64, 64, 4, 64, 64, 46); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 16; i++) {
      let x = 64, y = 64, a = i / 16 * 6.28 + Math.random() * 0.3; g.lineWidth = 3.5; g.beginPath(); g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { a += (Math.random() - 0.5) * 0.7; const l = 6 + Math.random() * 6; x += Math.cos(a) * l; y += Math.sin(a) * l; g.lineTo(x, y); g.lineWidth *= 0.8; }
      g.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const BLOOD = 0x5a0000;

// Claw groove: a long gouge with a dark deep core, pale chipped lips and jagged edges. Returns {map, normalMap}.
function grooveTex() {
  const W = 64, H = 256, c = document.createElement('canvas'); c.width = W; c.height = H;
  const nc = document.createElement('canvas'); nc.width = W; nc.height = H;
  const g = c.getContext('2d'), ng = nc.getContext('2d');
  const img = g.createImageData(W, H), nimg = ng.createImageData(W, H), h = new Float32Array(W * H);
  const jag = new Float32Array(H); let j = 0; for (let y = 0; y < H; y++) { j += (Math.random() - 0.5) * 0.25; j *= 0.92; jag[y] = j; }
  for (let y = 0; y < H; y++) {
    const taper = Math.min(1, y / 40, (H - 1 - y) / 26);           // pointed entry, ragged exit
    const half = (0.16 + 0.18 * taper + Math.abs(jag[y]) * 0.25) * W * 0.5 * Math.max(0.15, taper);
    for (let x = 0; x < W; x++) {
      const u = Math.abs(x - W / 2 + jag[y] * 6) / Math.max(1, half), i = y * W + x;
      h[i] = u < 1 ? -Math.sqrt(1 - u * u) : u < 1.6 && Math.random() < 0.55 * (1.6 - u) ? 0.25 : 0; // groove + chipped lip
    }
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, o = i * 4, d = h[i];
    const l = d < 0 ? 18 + (1 + d) * 60 : d > 0 ? 200 : 0;          // dark core, lighter walls, pale chipped lips
    img.data[o] = img.data[o + 1] = img.data[o + 2] = l; img.data[o + 3] = d < 0 ? 255 : d > 0 ? 170 : 0;
    const dx = (h[y * W + Math.min(W - 1, x + 1)] - h[y * W + Math.max(0, x - 1)]) * 2.2;
    const dy = (h[Math.min(H - 1, y + 1) * W + x] - h[Math.max(0, y - 1) * W + x]) * 2.2;
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    nimg.data[o] = (n.x * 0.5 + 0.5) * 255; nimg.data[o + 1] = (n.y * 0.5 + 0.5) * 255; nimg.data[o + 2] = (n.z * 0.5 + 0.5) * 255; nimg.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0); ng.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 8;
  const normalMap = new THREE.CanvasTexture(nc); normalMap.anisotropy = 8;
  return { map, normalMap };
}

export class FX {
  constructor(scene) {
    this.scene = scene;
    // --- blood droplets (stretched along velocity) ---
    this.N = 1400;
    this.drops = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.5, 1),
      new THREE.MeshStandardMaterial({ color: 0x4a0000, roughness: 0.25, emissive: 0x0c0000 }), this.N);
    this.drops.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.drops.frustumCulled = false; this.drops.count = 0;
    scene.add(this.drops);
    this.d = []; // {p, prev, v, life, size}
    // --- decals: splats, drips, scratches, craters ---
    const decMat = (kind, extra = {}) => new THREE.MeshStandardMaterial({ map: splatTex(kind), color: 0xffffff, transparent: true, depthWrite: false, roughness: 0.35, metalness: 0.0, envMapIntensity: 0.6, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, ...extra });
    this.DN = 2000;
    this.splats = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), decMat('splat'), this.DN);
    this.drips = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 2).translate(0, -0.85, 0), decMat('drip'), 500);
    const gt = grooveTex();
    this.scratches = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: gt.map, normalMap: gt.normalMap, normalScale: new THREE.Vector2(2.2, 2.2), color: 0xffffff, roughness: 0.95, transparent: true, alphaTest: 0.05, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }), 900);
    this.craters = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), decMat('crater', { color: 0x1c1c1c, roughness: 0.95, envMapIntensity: 0.1 }), 40);
    for (const im of [this.splats, this.drips, this.scratches, this.craters]) { im.count = 0; im.frustumCulled = false; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(im); im.userData.next = 0; }
    this.splats.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.DN * 3), 3);
    this.drips.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(500 * 3), 3);
    this.decalCount = 0;
    this.running = []; // drips still running down: {i, p, q, w, len, max, speed}
    // --- sparks (white-hot, colourless) ---
    this.SN = 260;
    this.sparks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false }), this.SN);
    this.sparks.frustumCulled = false; this.sparks.count = 0; scene.add(this.sparks);
    this.sp = [];
    // --- concrete chunks and dust ---
    this.CN = 220;
    this.chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8c8c8c, roughness: 1 }), this.CN);
    this.chunks.frustumCulled = false; this.chunks.count = 0; this.chunks.castShadow = true; scene.add(this.chunks);
    this.ch = [];
    // --- shockwave rings ---
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
    // --- pools under bodies ---
    this.pools = [];
    this.poolMat = new THREE.MeshStandardMaterial({ map: splatTex('splat'), color: 0x3a0002, transparent: true, depthWrite: false, roughness: 0.08, metalness: 0.2, envMapIntensity: 1.2, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.poolGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.emitters = []; // {obj, local, dir, t, rate, pulse}
    // --- stains stuck to bodies and claws ---
    this.stainGeo = new THREE.BoxGeometry(1, 1, 1);
    this.stainMat = new THREE.MeshStandardMaterial({ color: 0x4a0002, roughness: 0.3, emissive: 0x080000 });
    this.gashMat = new THREE.MeshStandardMaterial({ color: 0x6a0004, roughness: 0.15, emissive: 0x100000 });
    this.gashCore = new THREE.MeshStandardMaterial({ color: 0x140000, roughness: 0.5 });
    this.stains = [];
  }

  // level unload: every drop, decal, pool, ring and emitter goes
  clear() {
    this.d.length = 0; this.drops.count = 0; this.running.length = 0; this.emitters.length = 0; this.sp.length = 0; this.sparks.count = 0; this.ch.length = 0; this.chunks.count = 0;
    for (const im of [this.splats, this.drips, this.scratches, this.craters]) { im.count = 0; im.userData.next = 0; }
    this.decalCount = 0;
    for (const r of this.rings) this.scene.remove(r.m); this.rings.length = 0;
    for (const p of this.pools) this.scene.remove(p.m); this.pools.length = 0;
    for (const t of this.tracers || []) this.scene.remove(t.m); if (this.tracers) this.tracers.length = 0;
    for (const o of this.stains) o.parent?.remove(o); this.stains.length = 0;
  }
  // spray blood from p in a cone along dir
  blood(p, dir, n = 30, speed = 6, spread = 0.6, size = 1) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(dir.x + (Math.random() - 0.5) * spread * 2, dir.y + (Math.random() - 0.35) * spread * 2, dir.z + (Math.random() - 0.5) * spread * 2).normalize().multiplyScalar(speed * (0.25 + Math.random() * 0.95));
      if (this.d.length >= this.N) this.d.shift();
      this.d.push({ p: p.clone(), prev: p.clone(), v, life: 3, size: (0.012 + Math.random() * 0.03) * size });
    }
  }
  // a slash: tight fast cone along the cut + a slower heavy gush + mist
  slashBlood(p, dir, heavy = 1) {
    this.blood(p, dir, Math.round(45 * heavy), 9 * heavy, 0.28);
    this.blood(p, dir.clone().setY(dir.y + 0.4), Math.round(25 * heavy), 4.5, 0.6, 1.4);
    this.blood(p, dir, Math.round(20 * heavy), 3, 1, 0.5);
  }
  // pulsing arterial jet from a point on a moving object
  bleed(obj, local, dir, dur = 3, rate = 40, pulse = true, spd = pulse ? 1 : 0.25) { this.emitters.push({ obj, local: local.clone(), dir: dir.clone(), t: dur, dur, rate, acc: 0, pulse, spd, ph: Math.random() * 6 }); }

  _decal(im, p, n, size, stretch = 1, along = null, dark = 0) {
    const i = im.userData.next; im.userData.next = (i + 1) % im.instanceMatrix.count; im.count = Math.max(im.count, i + 1);
    if (im === this.drips) along = _t.set(0, -1, 0); // drips hang straight down the wall, tail = run
    if (along && along.lengthSq() > 1e-6) { // stretch axis (+y of the quad) points along the impact's slide direction
      _y.copy(along).addScaledVector(n, -along.dot(n)).normalize(); if (im === this.drips) _y.negate();
      _x.crossVectors(_y, n).normalize(); _m.makeBasis(_x, _y, n); _q.setFromRotationMatrix(_m);
    } else { _q.setFromUnitVectors(Z, n); _q.multiply(new THREE.Quaternion().setFromAxisAngle(Z, Math.random() * 6.28)); }
    _p.copy(p).addScaledVector(n, 0.01 + Math.random() * 0.006);
    _m.compose(_p, _q, _s.set(size, size * stretch, 1)); im.setMatrixAt(i, _m); im.instanceMatrix.needsUpdate = true;
    if (im.instanceColor) { const v = 0.5 + Math.random() * 0.35 - dark; im.setColorAt(i, _c.setRGB(v * 0.17, v * 0.004, v * 0.006)); im.instanceColor.needsUpdate = true; }
    this.decalCount++;
    return i;
  }
  scratch(p, n, len = 0.6, along = null) { // claw gouges: three parallel streaks
    const dir = along ? along.clone() : new THREE.Vector3(0, 1, 0).addScaledVector(n, -n.y).normalize();
    if (dir.lengthSq() < 0.01) dir.set(1, 0, 0);
    const side = new THREE.Vector3().crossVectors(n, dir).normalize();
    for (let k = -1; k <= 1; k++) this._decal(this.scratches, p.clone().addScaledVector(side, k * 0.045).addScaledVector(dir, (Math.random() - 0.5) * 0.04), n, 0.034, len / 0.034, dir);
  }
  // a claw strike into concrete: three grooves along the stroke + chips, dust and sparks
  gouge(p, n, len = 0.5, along = null, power = 1) {
    this.scratch(p, n, len, along);
    this.sparksAt(p, n, Math.round(6 * power), 0.8);
    this.debris(p, n, Math.round(4 * power), 2.5);
  }
  // three red gashes cut into a body cube face, oriented to the slash, dripping blood
  gash(mesh, worldP, worldDir) {
    const s = mesh.userData.size; if (!s) return;
    const l = mesh.worldToLocal(worldP.clone());
    const ax = [Math.abs(l.x) / s[0], Math.abs(l.y) / s[1], Math.abs(l.z) / s[2]], f = ax.indexOf(Math.max(...ax));
    const nrm = new THREE.Vector3().setComponent(f, Math.sign(l.getComponent(f) || 1));
    mesh.updateMatrixWorld(); const inv = new THREE.Matrix4().copy(mesh.matrixWorld).invert();
    const d = (worldDir && worldDir.lengthSq() > 1e-6 ? worldDir.clone() : new THREE.Vector3(1, -0.3, 0)).transformDirection(inv);
    d.addScaledVector(nrm, -d.dot(nrm)); if (d.lengthSq() < 1e-4) d.set(f === 1 ? 1 : 0, f === 1 ? 0 : 1, 0); d.normalize();
    const side = new THREE.Vector3().crossVectors(nrm, d).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, d, nrm));
    const span = [s[0], s[1], s[2]]; span[f] = 0; const L = Math.min(0.3, Math.max(0.12, Math.hypot(...span) * 0.6));
    const c = l.clone(); for (let a = 0; a < 3; a++) if (a !== f) c.setComponent(a, Math.max(-s[a] / 2 + 0.03, Math.min(s[a] / 2 - 0.03, c.getComponent(a))));
    c.setComponent(f, nrm.getComponent(f) * s[f] / 2);
    for (let k = -1; k <= 1; k++) {
      const cen = c.clone().addScaledVector(side, k * 0.042);
      for (const [mat, w, t] of [[this.gashMat, 0.026, 0.005], [this.gashCore, 0.011, 0.009]]) {
        const m = new THREE.Mesh(this.stainGeo, mat); m.position.copy(cen).addScaledVector(nrm, t * 0.5); m.quaternion.copy(q);
        m.scale.set(w, L * (0.8 + Math.random() * 0.3), t); mesh.add(m); this.stains.push(m);
      }
    }
    while (this.stains.length > 270) { const o = this.stains.shift(); o.parent?.remove(o); }
    const drip = c.clone().addScaledVector(nrm, 0.01);
    if (this.emitters.length < 70) this.bleed(mesh, drip, nrm.clone().multiplyScalar(0.4).add(new THREE.Vector3(0, -1, 0).transformDirection(inv)).normalize(), 2.5 + Math.random() * 2, 9, false);
  }
  // a vertical wiped streak of blood on a wall (bodies sliding down)
  smear(p, n, len) { this._decal(this.splats, p, n, 0.28 + Math.random() * 0.08, len / 0.3 * 2.2, new THREE.Vector3(0, -1, 0), 0.1); if (Math.random() < 0.4) this.runDrip(p.clone().add(new THREE.Vector3(0, -0.05, 0)), n, 0.05); }
  tracer(a, b) { // a bullet streak, gone in a blink
    const d = b.clone().sub(a), L = d.length();
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.012, L).translate(0, 0, L / 2), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }));
    m.position.copy(a); m.lookAt(b); this.scene.add(m); this.tracers = this.tracers || []; this.tracers.push({ m, t: 0.09 });
  }
  crater(p, size = 3.6, n = UP) { this._decal(this.craters, p, n, size, 1); }
  sparksAt(p, n, count = 14, power = 1) {
    for (let i = 0; i < count; i++) {
      const v = n.clone().multiplyScalar((2 + Math.random() * 3) * power).add(new THREE.Vector3((Math.random() - 0.5) * 5, Math.random() * 4, (Math.random() - 0.5) * 5).multiplyScalar(power));
      if (this.sp.length >= this.SN) this.sp.shift();
      this.sp.push({ p: p.clone(), v, life: 0.2 + Math.random() * 0.35 });
    }
  }
  debris(p, n, count = 10, power = 5) { // concrete chunks knocked out of walls and floors
    for (let i = 0; i < count; i++) {
      const v = n.clone().multiplyScalar(power * (0.4 + Math.random() * 0.8)).add(new THREE.Vector3((Math.random() - 0.5) * power, Math.random() * power * 0.8, (Math.random() - 0.5) * power));
      if (this.ch.length >= this.CN) this.ch.shift();
      this.ch.push({ p: p.clone(), v, life: 1.2 + Math.random() * 1.2, s: 0.03 + Math.random() * 0.09, r: new THREE.Euler(Math.random() * 6, Math.random() * 6, 0), w: (Math.random() - 0.5) * 20 });
    }
  }
  shockwave(p, radius = 7) {
    const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
    m.position.set(p.x, p.y + 0.06, p.z); m.scale.setScalar(0.3); this.scene.add(m); this.rings.push({ m, t: 0, radius });
  }
  pool(p, max = 1.6, rate = 0.35) {
    const m = new THREE.Mesh(this.poolGeo, this.poolMat); m.position.set(p.x, p.y + 0.008 + (this.pools.length % 20) * 0.0004, p.z); m.rotation.y = Math.random() * 6; m.scale.setScalar(0.1); m.receiveShadow = true;
    this.scene.add(m); const pl = { m, max, s: 0.1, rate }; this.pools.push(pl);
    if (this.pools.length > 40) { const o = this.pools.shift(); this.scene.remove(o.m); }
    return pl;
  }
  // a blood stain stuck on a body part's surface (hero arms, enemy torsos, claws)
  stain(mesh, worldP) {
    const s = mesh.userData.size; if (!s) return;
    const l = mesh.worldToLocal(worldP.clone());
    const ax = [Math.abs(l.x) / s[0], Math.abs(l.y) / s[1], Math.abs(l.z) / s[2]], f = ax.indexOf(Math.max(...ax));
    const st = new THREE.Mesh(this.stainGeo, this.stainMat), sz = 0.05 + Math.random() * 0.09;
    const pos = [Math.max(-s[0] / 2, Math.min(s[0] / 2, l.x)), Math.max(-s[1] / 2, Math.min(s[1] / 2, l.y)), Math.max(-s[2] / 2, Math.min(s[2] / 2, l.z))];
    pos[f] = Math.sign(l.getComponent(f) || 1) * (s[f] / 2 + 0.003);
    const sc = [sz, sz * (0.6 + Math.random()), sz]; sc[f] = 0.006;
    st.position.set(...pos); st.scale.set(...sc); mesh.add(st);
    this.stains.push(st); if (this.stains.length > 220) { const o = this.stains.shift(); o.parent?.remove(o); }
  }

  update(dt) {
    // emitters (stumps, wounds): arterial pulses, fading out
    for (let i = this.emitters.length - 1; i >= 0; i--) {
      const e = this.emitters[i]; e.t -= dt; if (e.t <= 0 || !e.obj.parent) { this.emitters.splice(i, 1); continue; }
      e.ph += dt * 9;
      const life = Math.min(1, e.t / (e.dur * 0.5)), beat = e.pulse ? Math.pow(Math.max(0, Math.sin(e.ph)), 3) * 2.2 + 0.15 : 1;
      e.acc += e.rate * dt * life * beat;
      if (e.acc >= 1) {
        e.obj.updateMatrixWorld();
        const p = e.obj.localToWorld(e.local.clone()), d = e.dir.clone().transformDirection(e.obj.matrixWorld);
        this.blood(p, d, Math.floor(e.acc), (2.5 + beat * 2.2) * (0.5 + life * 0.5) * e.spd, e.pulse ? 0.14 : 0.3, e.pulse ? 1.1 : 0.7); e.acc %= 1;
      }
    }
    // droplets
    let n = 0;
    for (let i = this.d.length - 1; i >= 0; i--) {
      const b = this.d[i]; b.life -= dt;
      b.prev.copy(b.p); b.v.y -= 18 * dt; b.p.addScaledVector(b.v, dt);
      const box = pointInBox(b.p);
      if (box || b.life <= 0) {
        if (box) {
          const nrm = hitNormal(box, b.p, b.prev), speed = b.v.length(), vn = Math.abs(b.v.dot(nrm));
          const sz = b.size * (4 + Math.random() * 6) * (0.8 + Math.min(1, speed * 0.08));
          const stretch = 1 + Math.min(3.2, (speed - vn) / Math.max(1, vn) * 0.9); // grazing hits smear long
          if (nrm.y > 0.5) { b.p.y = box.max.y; this._decal(this.splats, b.p, nrm, sz, stretch, b.v); }
          else if (nrm.y < -0.5) { /* ceiling: lost */ }
          else {
            if (nrm.x) b.p.x = nrm.x > 0 ? box.max.x : box.min.x; else b.p.z = nrm.z > 0 ? box.max.z : box.min.z;
            this._decal(this.splats, b.p, nrm, sz, stretch, b.v);
            if (Math.random() < 0.3 && b.p.y - box.min.y > 0.3) this.runDrip(b.p, nrm, sz * 0.5);
          }
        }
        this.d.splice(i, 1); continue;
      }
    }
    for (const b of this.d) {
      const s = b.size, sp = b.v.length();
      _q.setFromUnitVectors(UP, _t.copy(b.v).divideScalar(sp || 1));
      _m.compose(b.p, _q, _s.set(s, s * (1 + Math.min(4, sp * 0.3)), s)); this.drops.setMatrixAt(n++, _m);
    }
    this.drops.count = n; this.drops.instanceMatrix.needsUpdate = true;
    // wall drips run down, slowing as they go
    for (let i = this.running.length - 1; i >= 0; i--) {
      const r = this.running[i]; r.len = Math.min(r.max, r.len + r.speed * dt); r.speed *= Math.exp(-0.6 * dt);
      _m.compose(r.p, r.q, _s.set(r.w, r.len, 1)); this.drips.setMatrixAt(r.i, _m); this.drips.instanceMatrix.needsUpdate = true;
      if (r.len >= r.max || r.speed < 0.02) this.running.splice(i, 1);
    }
    // sparks
    n = 0;
    for (let i = this.sp.length - 1; i >= 0; i--) { const s = this.sp[i]; s.life -= dt; if (s.life <= 0) { this.sp.splice(i, 1); continue; } s.v.y -= 14 * dt; s.p.addScaledVector(s.v, dt); }
    for (const s of this.sp) { const k = 0.028 * Math.min(1, s.life * 4); _q.setFromUnitVectors(UP, _t.copy(s.v).normalize()); _m.compose(s.p, _q, _s.set(k, k * 4, k)); this.sparks.setMatrixAt(n++, _m); }
    this.sparks.count = n; this.sparks.instanceMatrix.needsUpdate = true;
    // chunks
    n = 0;
    for (let i = this.ch.length - 1; i >= 0; i--) {
      const c = this.ch[i]; c.life -= dt; if (c.life <= 0) { this.ch.splice(i, 1); continue; }
      c.v.y -= 20 * dt; c.p.addScaledVector(c.v, dt); c.r.x += c.w * dt; c.r.y += c.w * 0.7 * dt;
      const bx = pointInBox(c.p); if (bx) { c.p.addScaledVector(c.v, -dt); c.v.multiplyScalar(-0.3); c.w *= 0.5; }
    }
    for (const c of this.ch) { const k = c.s * Math.min(1, c.life * 2); _q.setFromEuler(c.r); _m.compose(c.p, _q, _s.set(k, k * 0.8, k * 1.1)); this.chunks.setMatrixAt(n++, _m); }
    this.chunks.count = n; this.chunks.instanceMatrix.needsUpdate = true;
    // shockwaves
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = Math.min(1, r.t / 0.35);
      r.m.scale.setScalar(0.3 + (1 - Math.pow(1 - k, 3)) * r.radius); r.m.material.opacity = 0.7 * (1 - k);
      if (k >= 1) { this.scene.remove(r.m); r.m.material.dispose(); this.rings.splice(i, 1); }
    }
    if (this.tracers) for (let i = this.tracers.length - 1; i >= 0; i--) { const r = this.tracers[i]; r.t -= dt; r.m.material.opacity = Math.max(0, r.t / 0.09) * 0.85; if (r.t <= 0) { this.scene.remove(r.m); r.m.geometry.dispose(); r.m.material.dispose(); this.tracers.splice(i, 1); } }
    // pools grow
    for (const pl of this.pools) if (pl.s < pl.max) { pl.s = Math.min(pl.max, pl.s + dt * pl.rate); pl.m.scale.setScalar(pl.s); }
  }
  runDrip(p, n, w) {
    const i = this._decal(this.drips, p, n, w, 0.05);
    this.drips.getMatrixAt(i, _m); const q = new THREE.Quaternion(), pp = new THREE.Vector3(); _m.decompose(pp, q, _s);
    this.running.push({ i, p: pp, q, w, len: 0.05, max: 0.4 + Math.random() * 1.6, speed: 0.4 + Math.random() * 0.6 });
  }
}

// Ribbon trail between a base and a tip point, fading with age.
export class Trail {
  constructor(scene, n = 14) {
    this.n = n; this.pts = []; this.on = false;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(n * 2 * 3); this.al = new Float32Array(n * 2);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('a', new THREE.BufferAttribute(this.al, 1));
    const idx = []; for (let i = 0; i < n - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
    this.mesh = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute float a; varying float va; void main(){ va=a; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
      fragmentShader: 'varying float va; void main(){ gl_FragColor=vec4(vec3(0.9),va*0.6); }',
    }));
    this.mesh.frustumCulled = false; scene.add(this.mesh);
  }
  push(base, tip) {
    this.pts.unshift([base.clone(), tip.clone()]); if (this.pts.length > this.n) this.pts.pop();
  }
  update(dt, active) {
    if (!active && this.pts.length) this.pts.pop();
    if (!active && this.pts.length) this.pts.pop();
    const L = this.pts.length;
    for (let i = 0; i < this.n; i++) {
      const p = this.pts[Math.min(i, L - 1)];
      for (let k = 0; k < 2; k++) {
        const v = p ? p[k] : null, o = (i * 2 + k) * 3;
        if (v) { this.pos[o] = v.x; this.pos[o + 1] = v.y; this.pos[o + 2] = v.z; } else this.pos[o] = this.pos[o + 1] = this.pos[o + 2] = 0;
        this.al[i * 2 + k] = p && i < L ? (1 - i / this.n) * (k ? 1 : 0.2) : 0;
      }
    }
    this.mesh.geometry.attributes.position.needsUpdate = true; this.mesh.geometry.attributes.a.needsUpdate = true;
    this.mesh.visible = L > 1;
  }
}
