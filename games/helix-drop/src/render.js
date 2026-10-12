// HELIX DROP - three.js view of the Game. Reads game state, never changes it.
import * as THREE from '../vendor/three.module.js';
import { SEGS, SEG, R_POLE, R_IN, R_OUT, R_BALL, BALL_R, SPACING, THICK, VMAX, GAP, SAFE, RED, TAU } from './game.js';

export const THEMES = [
  { name: 'mint',   bg: ['#c4f7ea', '#4fb3e8'], pole: '#ffffff', safe: '#18c7a8', ball: '#ff7a1a' },
  { name: 'grape',  bg: ['#efd9ff', '#7b6cf6'], pole: '#fff6e8', safe: '#9257ff', ball: '#ffd23f' },
  { name: 'lemon',  bg: ['#fff3c9', '#ff9e7a'], pole: '#ffffff', safe: '#ffc61a', ball: '#2f7bff' },
  { name: 'sky',    bg: ['#d6f4ff', '#6c8cff'], pole: '#ffffff', safe: '#2f7bff', ball: '#ff5fa2' },
  { name: 'lime',   bg: ['#efffc4', '#5fd0a0'], pole: '#fffaf0', safe: '#6cc51f', ball: '#ff4fd8' },
  { name: 'night',  bg: ['#4a3796', '#15123d'], pole: '#e2deff', safe: '#22d8e0', ball: '#ffe14d' },
];
export const themeFor = (level) => THEMES[(level - 1) % THEMES.length];

const RED_COL = '#f0102c';

function radialTex(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([o, col]) => gr.addColorStop(o, col));
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function splatTex() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = '#fff';
  const blob = (x, y, r) => { g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); };
  blob(S / 2, S / 2, S * 0.24);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU + Math.sin(i * 7.3) * 0.3, d = S * (0.22 + ((i * 37) % 10) / 60);
    blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * (0.05 + ((i * 13) % 5) / 110));
    blob(S / 2 + Math.cos(a) * d * 0.6, S / 2 + Math.sin(a) * d * 0.6, S * 0.1);
  }
  for (let i = 0; i < 6; i++) { const a = i * 1.7 + 0.4, d = S * 0.42; blob(S / 2 + Math.cos(a) * d, S / 2 + Math.sin(a) * d, S * 0.025); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// annular sector spanning n segments starting at local angle 0, top surface at y=0
function sectorGeo(n) {
  const a0 = 0, a1 = n * SEG;
  const bev = 0.07;
  const ri = R_IN + bev, ro = R_OUT - bev;
  const s = new THREE.Shape();
  // shape x = sin(a)*r, y = cos(a)*r  (see rotateX below)
  const steps = Math.max(6, n * 6);
  const pt = (a, r) => [Math.sin(a) * r, Math.cos(a) * r];
  const inset = n >= SEGS ? 0 : bev / ro; // keep a hairline gap between runs
  s.moveTo(...pt(a0 + inset, ri));
  for (let i = 0; i <= steps; i++) { const a = a0 + inset + (a1 - a0 - 2 * inset) * (i / steps); s.lineTo(...pt(a, ro)); }
  for (let i = steps; i >= 0; i--) { const a = a0 + inset * 1.6 + (a1 - a0 - 3.2 * inset) * (i / steps); s.lineTo(...pt(a, ri)); }
  const g = new THREE.ExtrudeGeometry(s, { depth: THICK - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 4 });
  g.rotateX(Math.PI / 2);
  g.translate(0, -bev, 0);
  g.computeVertexNormals();
  return g;
}

function fullRingGeo() {
  const bev = 0.08;
  const s = new THREE.Shape(); s.absarc(0, 0, R_OUT - bev, 0, TAU, false);
  const h = new THREE.Path(); h.absarc(0, 0, R_IN + bev, 0, TAU, true); s.holes.push(h);
  const g = new THREE.ExtrudeGeometry(s, { depth: THICK - 2 * bev, bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 3, curveSegments: 64 });
  g.rotateX(Math.PI / 2); g.translate(0, -bev, 0);
  return g;
}

export class Renderer {
  constructor(canvas) {
    const r = this.r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NeutralToneMapping; r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.setClearColor(0x000000, 0);

    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(48, 1, 0.1, 200);
    this.buildEnv();
    this.scene.environmentIntensity = 0.55;

    const hemi = new THREE.HemisphereLight(0xffffff, 0x9988bb, 0.8); this.scene.add(hemi);
    const sun = this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 0.5; sc.far = 30;
    sun.shadow.radius = 4; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
    this.scene.add(sun); this.scene.add(sun.target);

    this.tower = new THREE.Group(); this.scene.add(this.tower);
    this.geos = []; for (let n = 1; n <= SEGS; n++) this.geos[n] = sectorGeo(n);
    this.fullGeo = fullRingGeo();
    this.splatTex = splatTex();
    this.glowTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);

    // ball
    this.ballMat = new THREE.MeshPhysicalMaterial({ color: 0xff7a1a, roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x000000 });
    this.ball = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 40, 28), this.ballMat);
    this.ball.castShadow = true; this.scene.add(this.ball);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: 0xff8a1e, transparent: true, opacity: 0, depthWrite: false }));
    this.halo.scale.setScalar(2.4); this.scene.add(this.halo);

    // particles: glossy (shards, droplets, confetti) + additive glow (fire, sparks)
    this.parts = this.makeParts(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshPhysicalMaterial({ roughness: 0.25, clearcoat: 1 }), 500, false);
    this.drops = this.makeParts(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1 }), 300, false);
    this.flames = this.makeParts(new THREE.SphereGeometry(1, 14, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }), 300, false);
    this.glows = this.makeParts(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.glowTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), 400, true);
    // soft normal-blended puffs for trails: overlap into one smooth tapering ribbon, never wash out to white
    this.puffTex = radialTex([[0, 'rgba(255,255,255,1)'], [0.5, 'rgba(255,255,255,0.92)'], [0.78, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
    this.puffs = this.makeParts(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: this.puffTex, transparent: true, depthWrite: false, toneMapped: false }), 500, 'puff');

    this.ringObjs = new Map();
    this.debris = [];
    this.splats = [];
    this.camY = 0; this.shake = 0; this.squash = 0; this.flash = 0;
    this.trailT = 0;
    this.theme = null;
    this.idle = 0;
    this.resize();
  }

  buildEnv() {
    // tiny studio scene baked into a PMREM env map: soft gradient + a few bright panels
    const pm = new THREE.PMREMGenerator(this.r);
    const es = new THREE.Scene();
    const sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, uniforms: {},
      vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
      fragmentShader: 'varying vec3 p; void main(){ float h = normalize(p).y; vec3 c = mix(vec3(0.55,0.6,0.75), vec3(1.0,0.98,0.96), smoothstep(-0.4,0.8,h)); gl_FragColor = vec4(c,1.0); }',
    }));
    es.add(sky);
    const panel = (x, y, z, w, h, k) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); es.add(m); };
    panel(0, 7, 4, 6, 3, 4); panel(-7, 2, 3, 2, 5, 2.5); panel(7, 3, -2, 3, 4, 2); panel(0, -3, 8, 8, 1, 1.2);
    this.scene.environment = pm.fromScene(es, 0.03).texture;
    pm.dispose();
  }

  makeParts(geo, mat, max, glow) {
    const m = new THREE.InstancedMesh(geo, mat, max);
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    m.setColorAt(0, new THREE.Color());
    m.frustumCulled = false; m.count = 0;
    if (!glow) m.castShadow = false;
    this.scene.add(m);
    return { mesh: m, list: [], max, glow };
  }

  emit(sys, o) {
    if (sys.list.length >= sys.max) sys.list.shift();
    sys.list.push({ x: o.x, y: o.y, z: o.z, vx: o.vx || 0, vy: o.vy || 0, vz: o.vz || 0, s: o.s || 0.1, life: o.life || 1, t: 0,
      col: new THREE.Color(o.col || '#fff'), g: o.g ?? 18, rx: Math.random() * 6, ry: Math.random() * 6, spin: o.spin ?? 8, shrink: o.shrink ?? true });
  }

  stepParts(sys, dt) {
    const dummy = this._d || (this._d = new THREE.Object3D());
    const m = sys.mesh; let n = 0;
    for (let i = sys.list.length - 1; i >= 0; i--) {
      const p = sys.list[i]; p.t += dt;
      if (p.t >= p.life) { sys.list.splice(i, 1); continue; }
      p.vy -= p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.985; p.vz *= 0.985;
      p.rx += p.spin * dt; p.ry += p.spin * 0.7 * dt;
    }
    for (const p of sys.list) {
      const k = 1 - p.t / p.life;
      const s = p.s * (p.shrink === 'lin' ? Math.pow(k, 0.8) : p.shrink ? Math.min(1, k * 2.2) : 1);
      dummy.position.set(p.x, p.y, p.z);
      if (sys.glow) dummy.quaternion.copy(this.cam.quaternion); else dummy.rotation.set(p.rx, p.ry, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix(); m.setMatrixAt(n, dummy.matrix);
      if (sys.glow === true) { const c = p.col.clone().multiplyScalar(k); m.setColorAt(n, c); } else m.setColorAt(n, p.col);
      n++;
    }
    m.count = n; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  setTheme(th) {
    this.theme = th;
    const mk = (col, o = {}) => new THREE.MeshPhysicalMaterial({ color: col, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, ...o });
    this.mats = {
      safe: mk(th.safe),
      red: mk(RED_COL, { emissive: new THREE.Color('#ff0022'), emissiveIntensity: 0.18, roughness: 0.15 }),
      goal: mk('#ffffff', { emissive: new THREE.Color('#fff2b0'), emissiveIntensity: 0.35 }),
      pole: mk(th.pole, { roughness: 0.3, clearcoat: 0.6 }),
      splat: new THREE.MeshStandardMaterial({ color: th.ball, map: this.splatTex, transparent: true, roughness: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
    };
    this.ballMat.color.set(th.ball);
    document.documentElement.style.setProperty('--bg1', th.bg[0]);
    document.documentElement.style.setProperty('--bg2', th.bg[1]);
    document.documentElement.style.setProperty('--ball', th.ball);
    document.documentElement.style.setProperty('--safe', th.safe);
  }

  // full rebuild for a new level / retry
  build(game, th) {
    this.setTheme(th);
    for (const o of this.ringObjs.values()) this.tower.remove(o.g);
    this.ringObjs.clear();
    for (const d of this.debris) this.scene.remove(d.m);
    this.debris = []; this.splats = [];
    if (this.pole) this.tower.remove(this.pole);
    this.poleLen = 0; this.pole = null;
    this.parts.list.length = 0; this.drops.list.length = 0; this.puffs.list.length = 0; this.flames.list.length = 0; this.glows.list.length = 0;
    this.camY = game.ball.y - 2.2; this.ballY = game.ball.y;
    this.ensurePole(game);
    this.shake = 0; this.flash = 0;
  }

  ensurePole(game) {
    const needed = game.mode === 'endless' ? (game.next + 40) * SPACING : (game.total + 2) * SPACING;
    if (this.pole && this.poleLen >= needed) return;
    if (this.pole) this.tower.remove(this.pole);
    const len = game.mode === 'endless' ? needed + 120 : game.total * SPACING + THICK + 0.3;
    this.pole = new THREE.Mesh(new THREE.CylinderGeometry(R_POLE, R_POLE, len + 20, 48, 1), this.mats.pole);
    this.pole.position.y = 20 - (len + 20) / 2;
    this.pole.receiveShadow = true; this.pole.castShadow = false;
    this.tower.add(this.pole); this.poleLen = len;
  }

  makeRing(r) {
    const g = new THREE.Group(); g.position.y = r.y;
    if (r.goal) {
      const m = new THREE.Mesh(this.fullGeo, this.mats.goal); m.receiveShadow = true; m.castShadow = true; g.add(m);
    } else {
      // merge runs of equal type into single smooth arcs
      const s = r.segs; let start = 0;
      while (start < SEGS && s[start] === s[(start + SEGS - 1) % SEGS]) start++;
      if (start === SEGS) start = 0;
      let k = 0;
      while (k < SEGS) {
        const i0 = (start + k) % SEGS, t = s[i0]; let n = 1;
        while (k + n < SEGS && s[(start + k + n) % SEGS] === t) n++;
        if (t !== GAP) {
          const m = new THREE.Mesh(this.geos[n], t === RED ? this.mats.red : this.mats.safe);
          m.rotation.y = i0 * SEG; m.castShadow = true; m.receiveShadow = true;
          m.userData = { type: t, mid: i0 * SEG + n * SEG / 2 };
          g.add(m);
        }
        k += n;
      }
    }
    this.tower.add(g);
    const o = { g, r };
    this.ringObjs.set(r.i, o);
    return o;
  }

  // adaptive quality for slow phones: step 1 drops the pixel ratio to 1, step 2 turns shadows off.
  // Fed the real frame time by main.js; ?hq=1 pins full quality (screenshots).
  setQuality(level) {
    if (level === this.quality) return;
    this.quality = level;
    if (level >= 1) this.r.setPixelRatio(1);
    if (level >= 2) { this.sun.castShadow = false; this.r.shadowMap.enabled = false; }
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false);
    this.cam.aspect = w / h;
    // keep the whole ring width in view on narrow portrait screens
    const tanH = Math.tan(THREE.MathUtils.degToRad(this.cam.fov / 2));
    const needW = 3.75 / (tanH * this.cam.aspect);
    this.dist = Math.max(12.5, needW);
    this.cam.updateProjectionMatrix();
  }

  // ---- event reactions
  splat(ringObj, angle, big, col) {
    const g = ringObj.g;
    const m = new THREE.Mesh(this.splatGeo || (this.splatGeo = new THREE.PlaneGeometry(1, 1)), col ? this.mats.splat.clone() : this.mats.splat);
    if (col) m.material.color.set(col);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * TAU;
    const s = (big ? 1.5 : 0.72) * (0.85 + Math.random() * 0.3);
    m.scale.set(s, s, s);
    // ring group rotates with r.off inside the tower; angle is ring-local
    m.position.set(Math.sin(angle) * R_BALL, 0.012, Math.cos(angle) * R_BALL);
    m.receiveShadow = true;
    g.add(m);
    this.splats.push(m);
    if (this.splats.length > 40) { const old = this.splats.shift(); old.parent && old.parent.remove(old); }
  }

  burstRing(o, power, game) {
    // detach every piece into world space and fling it outward
    const g = o.g; const pieces = [...g.children];
    g.updateMatrixWorld(true);
    const worldA = game.theta + o.r.off;
    for (const m of pieces) {
      if (m.userData.type === undefined) { g.remove(m); continue; }
      this.scene.attach(m);
      m.material = m.material.clone(); m.material.transparent = true;
      m.castShadow = false;
      const a = m.userData.mid + worldA;
      const sp = (4 + Math.random() * 3) * power;
      this.debris.push({ m, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: (1.5 + Math.random() * 2.5) * power, t: 0, life: 0.9,
        ax: (Math.random() - 0.5) * 6 * power, az: (Math.random() - 0.5) * 6 * power });
      if (power > 1.2) {
        for (let i = 0; i < 6; i++) {
          const aa = a + (Math.random() - 0.5) * 0.8, rr = R_IN + Math.random() * (R_OUT - R_IN);
          this.emit(this.parts, { x: Math.sin(aa) * rr, y: g.position.y, z: Math.cos(aa) * rr, vx: Math.sin(aa) * (6 + Math.random() * 8), vz: Math.cos(aa) * (6 + Math.random() * 8), vy: 3 + Math.random() * 6,
            s: 0.14 + Math.random() * 0.18, life: 0.8 + Math.random() * 0.4, col: m.userData.type === RED ? RED_COL : this.theme.safe, spin: 14 });
        }
      }
    }
    this.tower.remove(g);
    this.ringObjs.delete(o.r.i);
  }

  onEvent(e, game) {
    const bx = 0, by = game.ball.y, bz = R_BALL;
    const o = e.ring ? (this.ringObjs.get(e.ring.i) || this.makeRing(e.ring)) : null;
    if (e.type === 'bounce') {
      this.squash = 1;
      this.splat(o, e.angle, false);
      const n = e.soft ? 4 : 8;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 1.5 + Math.random() * 2.5;
        this.emit(this.drops, { x: bx, y: e.ring.y + 0.05, z: bz, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 2 + Math.random() * 3, s: 0.05 + Math.random() * 0.06, life: 0.45, col: this.theme.ball });
      }
    } else if (e.type === 'pass') {
      this.burstRing(o, 1, game);
      for (let i = 0; i < 4 + Math.min(e.streak, 6) * 2; i++) { const a = Math.random() * TAU, sp = 2 + Math.random() * 3; this.emit(this.flames, { x: bx, y: e.ring.y, z: bz, vx: Math.cos(a) * sp, vy: 1 + Math.random() * 2, vz: Math.sin(a) * sp, s: 0.06 + Math.random() * 0.05, life: 0.4, col: e.streak >= 2 ? '#fff3a0' : '#ffffff', g: 6 }); }
    } else if (e.type === 'smash') {
      this.burstRing(o, 1.9, game);
      this.shake = Math.max(this.shake, 0.55); this.flash = 1;
      for (let i = 0; i < 40; i++) {
        const a = Math.random() * TAU, sp = 3 + Math.random() * 9;
        this.emit(this.glows, { x: bx, y: e.ring.y, z: bz, vx: Math.cos(a) * sp, vy: Math.random() * 6, vz: Math.sin(a) * sp, s: 0.5 + Math.random() * 0.5, life: 0.5, col: i % 2 ? '#ff8a1e' : '#ffe14d', g: 4 });
      }
    } else if (e.type === 'fire') {
      for (let i = 0; i < 20; i++) { const a = Math.random() * TAU; this.emit(this.glows, { x: bx, y: by, z: bz, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, vz: 0, s: 0.6, life: 0.4, col: '#ff9a2e', g: 0 }); }
    } else if (e.type === 'death') {
      this.squash = 1.6;
      this.splat(o, e.angle, true);
      this.shake = Math.max(this.shake, 0.45);
      for (let i = 0; i < 26; i++) {
        const a = Math.random() * TAU, sp = 2 + Math.random() * 5;
        this.emit(this.drops, { x: bx, y: e.ring.y + 0.1, z: bz, vx: Math.cos(a) * sp, vz: Math.sin(a) * sp, vy: 3 + Math.random() * 5, s: 0.06 + Math.random() * 0.1, life: 0.9, col: this.theme.ball });
      }
    } else if (e.type === 'clear') {
      this.squash = 1; this.flash = 0.6;
      this.splat(o, e.angle, true);
      const cols = ['#ff4f8b', '#ffd23f', '#2fd8ff', '#7cff6b', '#b46bff', '#ffffff'];
      for (let i = 0; i < 90; i++) {
        const a = Math.random() * TAU, sp = 3 + Math.random() * 6;
        this.emit(this.parts, { x: Math.sin(a) * 1.5, y: e.ring.y + 0.4, z: Math.cos(a) * 1.5 + 0.5, vx: Math.sin(a) * sp, vz: Math.cos(a) * sp, vy: 7 + Math.random() * 9, s: 0.12 + Math.random() * 0.1, life: 1.8, col: cols[i % cols.length], g: 14, spin: 12, shrink: false });
      }
      this.goalFlash = 1;
    }
  }

  // ---- per frame
  frame(game, dt, state) {
    // create rings near the camera, drop the ones far above
    const lo = Math.max(0, game.next - 1), hi = Math.min(game.rings.length - 1, game.next + 9);
    for (let i = lo; i <= hi; i++) { const r = game.rings[i]; if (r.state === 'live' && !this.ringObjs.has(i)) this.makeRing(r); }
    for (const [i, o] of this.ringObjs) {
      if (o.r.state !== 'live' && i < game.next - 1) { this.tower.remove(o.g); this.ringObjs.delete(i); continue; }
      if (i < game.next - 3) { this.tower.remove(o.g); this.ringObjs.delete(i); continue; }
      o.g.rotation.y = o.r.off;

    }
    this.ensurePole(game);
    this.tower.rotation.y = game.theta;

    // ball
    const b = game.ball;
    this.squash = Math.max(0, this.squash - dt * 6);
    const sq = Math.sin(Math.min(1, this.squash) * Math.PI * 0.5) * 0.38 * Math.min(1.6, this.squash > 1 ? 1.4 : 1);
    const stretch = b.vy < 0 ? Math.min(0.22, (-b.vy / VMAX) * 0.22) : 0;
    const sy = 1 - sq + stretch, sxz = 1 + sq * 0.6 - stretch * 0.4;
    this.ball.scale.set(sxz, sy, sxz);
    this.ball.position.set(0, b.y - BALL_R * (1 - sy), R_BALL);
    this.ball.visible = game.alive || this.squash > 0.4 ? true : false;
    if (!game.alive) { this.ball.visible = true; this.ball.scale.set(1.5, 0.25, 1.5); this.ball.position.y = b.y - BALL_R * 0.75; }
    const fire = b.fire ? 1 : 0;
    this.ballMat.emissive.set(fire ? '#ff4a00' : '#000000');
    this.ballMat.color.set(fire ? '#ffb000' : this.theme.ball);
    this.ballMat.emissiveIntensity = fire ? 0.75 + 0.25 * Math.sin(game.t * 30) : 0;
    this.halo.position.copy(this.ball.position);
    this.halo.material.opacity += ((fire && game.alive ? 0.6 : 0) - this.halo.material.opacity) * Math.min(1, dt * 12);
    this.halo.scale.setScalar(fire ? 2.6 + 0.3 * Math.sin(game.t * 25) : 1.8);

    // trail while falling through / on fire: soft puffs laid along the path (continuous at any frame rate),
    // sitting just behind the ball so the ball itself stays readable
    const p = this.ball.position;
    const lastY = this.lastBallY ?? p.y; this.lastBallY = p.y;
    if (game.alive && (fire || (game.streak >= 1 && b.vy < -4)) && dt > 0) {
      const dist = Math.abs(p.y - lastY), n = Math.min(14, Math.max(1, Math.ceil(dist / 0.06)));
      for (let j = 0; j < n; j++) {
        const y = lastY + (p.y - lastY) * ((j + 1) / n);
        if (fire) {
          const c = ['#ff5a00', '#ff7a00', '#ff9a10'][Math.floor(Math.random() * 3)];
          this.emit(this.puffs, { x: p.x + (Math.random() - 0.5) * 0.08, y, z: p.z - 0.32, vx: (Math.random() - 0.5) * 0.6, vy: 0.4, vz: 0, s: BALL_R * (2.5 + Math.random() * 0.4), life: 0.17, col: c, g: 0, shrink: 'lin' });
          this.emit(this.puffs, { x: p.x, y, z: p.z - 0.3, s: BALL_R * 1.5, life: 0.12, col: '#ffe066', g: 0, shrink: 'lin' });
        } else {
          this.emit(this.puffs, { x: p.x, y, z: p.z - 0.3, s: BALL_R * 1.8, life: 0.16, col: this.theme.ball, g: 0, shrink: 'lin' });
        }
      }
      if (fire && Math.random() < 0.5) this.emit(this.glows, { x: p.x + (Math.random() - 0.5) * 0.5, y: p.y, z: p.z, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 3, s: 0.18, life: 0.35, col: '#ff8a1e', g: 0 });
    }

    // debris
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.t += dt;
      if (d.t >= d.life) { this.scene.remove(d.m); d.m.material.dispose(); this.debris.splice(i, 1); continue; }
      d.vy -= 14 * dt; d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
      d.m.rotation.x += d.ax * dt; d.m.rotation.z += d.az * dt;
      d.m.material.opacity = Math.max(0, 1 - Math.pow(d.t / d.life, 2));
    }
    this.stepParts(this.parts, dt); this.stepParts(this.drops, dt); this.stepParts(this.glows, dt); this.stepParts(this.flames, dt); this.stepParts(this.puffs, dt);

    // camera: only follows downward, never back up with a bounce
    const target = Math.min(this.ballY ?? b.y, b.y);
    this.ballY = target;
    let goalY = state === 'title' ? b.y - 2.2 + (this.cam.aspect > 0.9 ? 2.6 : 0) : this.ballY - 2.2;
    if (state === 'title') { this.ballY = b.y; }
    this.camY += (goalY - this.camY) * Math.min(1, dt * (game.ball.vy < -10 ? 9 : 6));
    this.shake = Math.max(0, this.shake - dt * 1.6);
    const sh = this.shake * this.shake * 0.9;
    const D = this.dist;
    const yOff = D * 0.42;
    this.cam.position.set((Math.random() - 0.5) * sh, this.camY + yOff + (Math.random() - 0.5) * sh, D);
    this.cam.lookAt(0, this.camY - D * 0.1, 0);
    this.sun.position.set(3, this.camY + 12, 6); this.sun.target.position.set(0, this.camY - 2, 0.6);
    this.flash = Math.max(0, this.flash - dt * 3);
    this.goalFlash = Math.max(0, (this.goalFlash || 0) - dt * 1.5);
    if (this.mats) this.mats.goal.emissiveIntensity = 0.3 + 0.15 * Math.sin(game.t * 5) + this.goalFlash * 1.5;
    this.r.toneMappingExposure = 1.0 + this.flash * 0.6;
    this.r.render(this.scene, this.cam);
  }

  // screen position of the ball (for DOM pop text)
  ballScreen() {
    const v = this.ball.position.clone().project(this.cam);
    return { x: (v.x * 0.5 + 0.5) * window.innerWidth, y: (-v.y * 0.5 + 0.5) * window.innerHeight };
  }
}
