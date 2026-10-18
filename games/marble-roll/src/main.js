// MARBLE ROLL - roll a glass marble down polished-stone sky courses.
import * as THREE from '../vendor/three.module.js';
import { Sfx } from './audio.js';

const $ = (id) => document.getElementById(id);
const Q = new URLSearchParams(location.search);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const NLEV = 15, R = 0.5, STEP = 1 / 120;
function rng(s) { return () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV'];

// ---------- save ----------
const DEF = { unlocked: 1, gems: 0, skin: 0, owned: [0], stars: {} };
let save; try { save = { ...DEF, ...JSON.parse(localStorage.getItem('marble_roll') || '{}') }; } catch (e) { save = { ...DEF }; }
const persist = () => { try { localStorage.setItem('marble_roll', JSON.stringify(save)); } catch (e) {} };
const sfx = new Sfx(Q.has('mute'));

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 900);
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.fov = camera.aspect < 0.8 ? 74 : 62; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

const THEMES = [
  { name: 'Dawn', top: '#5f72c9', hor: '#ffc7a6', sun: '#fff0d0', sd: [0.5, 0.22, -0.8], base: '#f3efe8', vein: '#8a8ca2', trim: '#d8b26a', obs: '#2c4f86', obv: '#c9d6f0', gem: '#ff5fa8', fog: '#f0c4b6', cloud: '#ffe8de', li: 2.4 },
  { name: 'Noon', top: '#2a78dc', hor: '#c4e6ff', sun: '#ffffff', sd: [0.3, 0.75, -0.45], base: '#3d8c72', vein: '#e9f6ec', trim: '#ece4cf', obs: '#a8323f', obv: '#f4c7c7', gem: '#ffcf33', fog: '#cfe8ff', cloud: '#ffffff', li: 3.0 },
  { name: 'Sunset', top: '#36276a', hor: '#ff875a', sun: '#ffcf88', sd: [-0.6, 0.1, -0.75], base: '#ebbcb3', vein: '#7a3046', trim: '#f2c27a', obs: '#1e2a3c', obv: '#e2a35a', gem: '#56f0ff', fog: '#f0977a', cloud: '#ffb59a', li: 2.2 },
  { name: 'Dusk', top: '#04051a', hor: '#2c336f', sun: '#a6b8ff', sd: [0.4, 0.32, -0.8], base: '#17171d', vein: '#d9b25f', trim: '#d9b25f', obs: '#5a2fa0', obv: '#e7c8ff', gem: '#78ffb0', fog: '#262d60', cloud: '#3c4890', li: 1.6, stars: 1 },
];
const SKINS = [
  { name: 'Clear Eye', tint: '#ffffff', vane: '#3aa0ff', cost: 0 },
  { name: 'Ruby', tint: '#ff4d64', vane: '#ffe08a', cost: 30 },
  { name: 'Cobalt', tint: '#5a86ff', vane: '#ffffff', cost: 60 },
  { name: 'Jade', tint: '#45e09c', vane: '#13503c', cost: 100 },
  { name: 'Amber', tint: '#ffad3a', vane: '#7a2a00', cost: 150 },
  { name: 'Opal Night', tint: '#9d7cff', vane: '#ff6fd0', cost: 220 },
];

// ---------- sky + clouds (custom shaders) ----------
const SKY_F = `uniform vec3 top, hor, sun, sunDir; uniform float stars; varying vec3 vDir;
float h3(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
void main(){ vec3 d = normalize(vDir); float y = d.y;
  vec3 c = mix(hor, top, smoothstep(-0.02, 0.65, y));
  c = mix(c, hor * 0.85, smoothstep(0.0, -0.5, y));
  float s = max(dot(d, normalize(sunDir)), 0.0);
  c += sun * (pow(s, 1400.0) * 9.0 + pow(s, 14.0) * 0.4 + pow(s, 3.0) * 0.08);
  if (stars > 0.0) { vec3 g = floor(d * 240.0); c += vec3(step(0.996, h3(g))) * stars * smoothstep(0.02, 0.3, y) * (0.5 + h3(g + 3.0)); }
  gl_FragColor = vec4(c, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;
const SKY_V = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_Position = p.xyww; }`;
function skyMat(th) {
  return new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, vertexShader: SKY_V, fragmentShader: SKY_F,
    uniforms: { top: { value: new THREE.Color(th.top) }, hor: { value: new THREE.Color(th.hor) }, sun: { value: new THREE.Color(th.sun) },
      sunDir: { value: new THREE.Vector3(...th.sd).normalize() }, stars: { value: th.stars || 0 } } });
}
const dome = new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), skyMat(THEMES[0]));
dome.frustumCulled = false; dome.renderOrder = -10; scene.add(dome);

const cloudMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  uniforms: { time: { value: 0 }, col: { value: new THREE.Color() }, fogc: { value: new THREE.Color() }, cam: { value: new THREE.Vector3() }, sunDir: { value: new THREE.Vector3() } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform float time; uniform vec3 col, fogc, cam, sunDir; varying vec3 vW;
  float hs(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(hs(i), hs(i+vec2(1,0)), f.x), mix(hs(i+vec2(0,1)), hs(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++){ v += a * ns(p); p = p * 2.03 + 1.7; a *= 0.5; } return v; }
  void main(){ vec2 p = vW.xz * 0.016 + vec2(time * 0.012, time * 0.005);
    float n = fbm(p), d = smoothstep(0.35, 0.78, n);
    float lit = 0.72 + 0.45 * clamp(fbm(p * 1.9 + sunDir.xz * 0.6) - n * 0.4 + 0.3, 0.0, 1.0);
    vec3 c = col * lit;
    float dist = length(vW.xz - cam.xz);
    c = mix(c, fogc, smoothstep(90.0, 380.0, dist) * 0.9);
    gl_FragColor = vec4(c, mix(0.55, 1.0, d) * (1.0 - smoothstep(380.0, 470.0, dist)));
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }` });
const clouds = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), cloudMat);
clouds.rotation.x = -Math.PI / 2; scene.add(clouds);

const hemi = new THREE.HemisphereLight(0xffffff, 0xffffff, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.5); sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 16, bottom: -16, near: 1, far: 80 });
sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.03; scene.add(sun, sun.target);
scene.fog = new THREE.Fog(0xffffff, 70, 300);

const pmrem = new THREE.PMREMGenerator(renderer);
const envCache = {};
function envFor(i) {
  if (envCache[i]) return envCache[i];
  const s = new THREE.Scene(); s.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat(THEMES[i])));
  return envCache[i] = pmrem.fromScene(s, 0.01).texture;
}

// ---------- polished stone: procedural tileable marble + triplanar mapping ----------
function hexRGB(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function marbleTex(base, vein, seed) {
  const S = 256, r = rng(seed * 31 + 7), cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d'), img = g.createImageData(S, S), B = hexRGB(base), V = hexRGB(vein);
  const oct = [4, 8, 16, 32].map((p) => ({ p, a: Float32Array.from({ length: p * p }, r) }));
  const fbm = (u, v) => { let s = 0, amp = 0.5; for (const o of oct) { const p = o.p, A = o.a, x = u * p, y = v * p, xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), G = (a, b) => A[(a % p) + (b % p) * p];
    s += amp * ((G(xi, yi) * (1 - sx) + G(xi + 1, yi) * sx) * (1 - sy) + (G(xi, yi + 1) * (1 - sx) + G(xi + 1, yi + 1) * sx) * sy); amp *= 0.5; } return s / 0.9375; };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S, n = fbm(u, v), n2 = fbm((u + 0.37) % 1, (v + 0.61) % 1);
    const v1 = Math.pow(1 - Math.abs(Math.sin((u + v) * Math.PI * 4 + n * 9)), 16);
    const v2 = Math.pow(1 - Math.abs(Math.sin((u * 3 - v) * Math.PI * 2 + n2 * 7)), 34) * 0.6;
    const k = Math.min(1, v1 + v2) * 0.85, cl = 0.9 + 0.2 * (n2 - 0.5), i = (y * S + x) * 4;
    for (let c = 0; c < 3; c++) img.data[i + c] = clamp(B[c] * cl * (1 - k) + V[c] * k, 0, 255);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function stoneMat(tex, color, rough, scale = 0.11) {
  const m = new THREE.MeshPhysicalMaterial({ map: tex, color, roughness: rough, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 1.1 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vTP; varying vec3 vTN;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTP = (modelMatrix * vec4(transformed, 1.0)).xyz; vTN = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vTP; varying vec3 vTN;')
      .replace('#include <map_fragment>', `vec3 bw = pow(abs(vTN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec4 tx = texture2D(map, vTP.zy * ${scale}) * bw.x + texture2D(map, vTP.xz * ${scale}) * bw.y + texture2D(map, vTP.xy * ${scale}) * bw.z;
        diffuseColor *= tx;`);
  };
  return m;
}
const matCache = {};
function mats(i) {
  if (matCache[i]) return matCache[i];
  const th = THEMES[i], tex = marbleTex(th.base, th.vein, i + 1), otex = marbleTex(th.obs, th.obv, i + 11);
  const rock = stoneMat(tex, new THREE.Color(th.base).lerp(new THREE.Color(th.fog), 0.25), 0.28, 0.2); rock.flatShading = true;
  return matCache[i] = {
    stone: stoneMat(tex, 0xffffff, 0.14), rock, obs: stoneMat(otex, 0xffffff, 0.08, 0.3),
    brass: new THREE.MeshPhysicalMaterial({ color: th.trim, metalness: 1, roughness: 0.18, clearcoat: 0.5 }),
    gem: new THREE.MeshPhysicalMaterial({ color: th.gem, transmission: 0.9, thickness: 0.5, ior: 2.1, roughness: 0, emissive: th.gem, emissiveIntensity: 0.35, flatShading: true }),
  };
}

// ---------- the marble: glass sphere with a twisted cat's-eye vane inside ----------
const ballMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.02, transmission: 1, thickness: 1.0, ior: 1.5,
  attenuationDistance: 1.1, attenuationColor: new THREE.Color('#ffffff'), clearcoat: 1, clearcoatRoughness: 0.01, envMapIntensity: 1.4 });
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 48, 32), ballMat); ball.castShadow = true; scene.add(ball);
const vaneMat = new THREE.MeshStandardMaterial({ color: 0x3aa0ff, emissive: 0x3aa0ff, emissiveIntensity: 0.35, roughness: 0.35, side: THREE.DoubleSide });
{
  const vg = new THREE.PlaneGeometry(0.8, 0.34, 32, 6), p = vg.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i) * (1 - Math.abs(x) * 0.9), a = x * 3.4; p.setXYZ(i, x, y * Math.cos(a), y * Math.sin(a)); }
  vg.computeVertexNormals();
  for (let k = 0; k < 3; k++) { const v = new THREE.Mesh(vg, vaneMat); v.rotation.x = k * Math.PI / 3; ball.add(v); }
}
function applySkin() { const s = SKINS[save.skin] || SKINS[0]; ballMat.attenuationColor.set(s.tint); ballMat.color.set(s.tint).lerp(new THREE.Color(1, 1, 1), 0.55); vaneMat.color.set(s.vane); vaneMat.emissive.set(s.vane); }
applySkin();

// ---------- particles ----------
const PN = 500, pPos = new Float32Array(PN * 3).fill(-9999), pCol = new Float32Array(PN * 3), pBase = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN);
let pI = 0;
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const spr = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#fff'); gr.addColorStop(0.25, '#fffc'); gr.addColorStop(1, '#fff0'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: 0.32, map: spr, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
points.frustumCulled = false; scene.add(points);
const _c = new THREE.Color();
function burst(p, color, n, spd, up = 2) {
  for (let k = 0; k < n; k++) {
    const i = pI++ % PN; _c.set(Array.isArray(color) ? color[k % color.length] : color);
    pPos[i * 3] = p.x; pPos[i * 3 + 1] = p.y; pPos[i * 3 + 2] = p.z;
    const a = Math.random() * 6.283, b = Math.random() * 2 - 1, s = spd * (0.4 + Math.random() * 0.6), q = Math.sqrt(1 - b * b);
    pVel[i * 3] = Math.cos(a) * q * s; pVel[i * 3 + 1] = b * s + up; pVel[i * 3 + 2] = Math.sin(a) * q * s;
    pBase[i * 3] = _c.r; pBase[i * 3 + 1] = _c.g; pBase[i * 3 + 2] = _c.b; pLife[i] = 1;
  }
}
function updParticles(dt) {
  for (let i = 0; i < PN; i++) {
    if (pLife[i] <= 0) continue;
    pLife[i] -= dt * 0.9; const l = Math.max(0, pLife[i]);
    if (l <= 0) { pPos[i * 3 + 1] = -9999; continue; }
    pVel[i * 3 + 1] -= 5 * dt;
    for (let c = 0; c < 3; c++) { pPos[i * 3 + c] += pVel[i * 3 + c] * dt; pCol[i * 3 + c] = pBase[i * 3 + c] * l; }
  }
  pGeo.attributes.position.needsUpdate = true; pGeo.attributes.color.needsUpdate = true;
}

// ---------- level generation ----------
let levelGroup = null, L = null, cols = [], kins = [];
const _up = new THREE.Vector3(0, 1, 0);
function addBox(c, q, sx, sy, sz, mat, kind = 'floor') {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), mat); mesh.position.copy(c); mesh.quaternion.copy(q);
  mesh.receiveShadow = true; mesh.castShadow = kind !== 'floor'; levelGroup.add(mesh);
  const col = { p: c.clone(), q: q.clone(), h: new THREE.Vector3(sx / 2, sy / 2, sz / 2), kind, bounce: kind === 'obs' ? 0.55 : 0.04, mesh, v: null, wy: 0 };
  col.rad = col.h.length(); cols.push(col); return col;
}
function plank(a, b, w, M, h = 0.7) {
  const A = new THREE.Vector3(a.x, a.y, a.z), B = new THREE.Vector3(b.x, b.y, b.z), dir = B.clone().sub(A);
  let len = dir.length(); dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, _up).normalize(), up = new THREE.Vector3().crossVectors(right, dir);
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, dir.clone().negate()));
  if (Math.abs(a.y - b.y) > 0.01) len += 0.3;
  const c = A.clone().add(B).multiplyScalar(0.5).addScaledVector(up, -h / 2);
  const col = addBox(c, q, w, h, len, M.stone);
  for (const s of [-1, 1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, len), M.brass); t.position.set(s * (w / 2 + 0.06), h / 2 - 0.11, 0); col.mesh.add(t); }
}
function buildLevel(n) {
  if (levelGroup) { levelGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); }); scene.remove(levelGroup); }
  levelGroup = new THREE.Group(); scene.add(levelGroup); cols = []; kins = [];
  const ti = n % THEMES.length, th = THEMES[ti], M = mats(ti); applyTheme(ti);
  const r = rng(n * 977 + 13), rand = (a, b) => a + (b - a) * r(), pick = (a) => a[Math.floor(r() * a.length)];
  const diff = Math.min(1, n / 11), W = 4.6 - diff * 1.5;
  const pts = [{ x: 0, y: 0, z: 2 }], segs = [], obs = [], cps = [0], holes = [];
  const cur = () => pts[pts.length - 1];
  const go = (dx, dy, len, w, gap = false) => { const c = cur(); pts.push({ x: c.x + dx, y: c.y + dy, z: c.z - len }); segs.push({ w, gap }); };
  const side = () => { const x = cur().x; return x > 3 ? -1 : x < -3 ? 1 : (r() < 0.5 ? -1 : 1); };
  const pool = ['straight', 'shift', 'zig', 'drop'];
  if (n >= 1) pool.push('narrow', 'sweeper'); if (n >= 2) pool.push('gap', 'shift'); if (n >= 3) pool.push('pushers', 'pillars');
  if (n >= 5) pool.push('narrowshift', 'sweeper2', 'gap'); if (n >= 8) pool.push('pushers', 'narrowshift', 'pillars');
  go(0, 0, 12, 5);
  const count = 6 + Math.floor(n * 0.7); let last = '';
  for (let k = 0; k < count; k++) {
    let t = pick(pool); if (t === last) t = pick(pool); last = t;
    switch (t) {
      case 'straight': go(0, 0, rand(8, 13), W); break;
      case 'shift': go(side() * rand(3, 5), 0, rand(8, 11), W); break;
      case 'zig': { const s = side(), a = rand(2.5, 4); go(s * a, 0, 8, W); go(-s * a * 2, 0, 13, W); go(s * a, 0, 8, W); break; }
      case 'drop': go(0, -rand(2, 3.2), 8, W); go(0, 0, 5, W); break;
      case 'narrow': go(0, 0, 3, W); go(0, 0, rand(8, 12), 1.5 - diff * 0.2); go(0, 0, 3, W); break;
      case 'narrowshift': go(0, 0, 3, W); go(side() * 3, 0, 9, 1.5); go(0, 0, 3, W); break;
      case 'gap': go(0, 0, 6, W); go(0, 0.7, 3, W); go(0, -1.4, 3 + diff * 1.4, W, true); go(0, 0, 6, Math.max(W, 4)); break;
      case 'sweeper': { go(0, 0, 3, W); const c = cur(); go(0, 0, 12, 5.5); obs.push({ type: 'sweep', x: c.x, y: c.y, z: c.z - 6, spd: (1.3 + diff * 1.2) * (r() < 0.5 ? -1 : 1), ph: r() * 6 }); go(0, 0, 3, W); break; }
      case 'sweeper2': { go(0, 0, 3, W); const c = cur(), s = r() < 0.5 ? -1 : 1; go(0, 0, 17, 5.5);
        obs.push({ type: 'sweep', x: c.x, y: c.y, z: c.z - 5, spd: (1.4 + diff) * s, ph: 0 }, { type: 'sweep', x: c.x, y: c.y, z: c.z - 12, spd: -(1.4 + diff) * s, ph: 1.5 }); go(0, 0, 3, W); break; }
      case 'pushers': { go(0, 0, 3, W); const c = cur(); go(0, 0, 15, 4.6);
        for (let i = 0; i < 3; i++) obs.push({ type: 'push', x: c.x, y: c.y, z: c.z - 3.5 - i * 4, amp: 1.5, spd: 1.3 + diff * 1.1 + i * 0.2, ph: r() * 6 }); go(0, 0, 3, W); break; }
      case 'pillars': { go(0, 0, 3, W); const c = cur(); go(0, 0, 14, 6);
        for (let row = 0; row < 3; row++) { const z = c.z - 3 - row * 4, hole = Math.floor(r() * 3); holes.push({ z, x: c.x + (hole - 1) * 2 });
          for (let j = 0; j < 3; j++) if (j !== hole) obs.push({ type: 'pillar', x: c.x + (j - 1) * 2, y: c.y, z }); }
        go(0, 0, 3, W); break; }
    }
    if (k % 3 === 2 && k < count - 1) cps.push(pts.length - 1);
  }
  go(0, 0, 14, 6);
  // planks + flat junction pads
  for (let i = 0; i < segs.length; i++) if (!segs[i].gap) plank(pts[i], pts[i + 1], segs[i].w, M);
  const flat = (i) => i < 0 || i >= segs.length || segs[i].gap || Math.abs(pts[i].y - pts[i + 1].y) < 0.01;
  const real = (i) => i >= 0 && i < segs.length && !segs[i].gap;
  for (let i = 0; i < pts.length; i++) {
    if (!(real(i - 1) || real(i)) || !flat(i - 1) || !flat(i)) continue;
    const w = Math.max(real(i - 1) ? segs[i - 1].w : 0, real(i) ? segs[i].w : 0), p = pts[i];
    addBox(new THREE.Vector3(p.x, p.y - 0.36, p.z), new THREE.Quaternion(), w, 0.7, w, M.stone);
  }
  // obstacles
  const qI = new THREE.Quaternion();
  for (const o of obs) {
    if (o.type === 'pillar') { const c = addBox(new THREE.Vector3(o.x, o.y + 0.7, o.z), qI, 1.1, 1.4, 1.1, M.obs, 'obs');
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.16, 1.3), M.brass); cap.position.y = 0.78; c.mesh.add(cap); }
    if (o.type === 'sweep') {
      const piv = addBox(new THREE.Vector3(o.x, o.y + 0.75, o.z), qI, 0.7, 1.5, 0.7, M.obs, 'obs');
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.14, 24), M.brass); cap.position.y = 0.8; piv.mesh.add(cap);
      const c = addBox(new THREE.Vector3(o.x, o.y + 0.42, o.z), qI, 5.2, 0.55, 0.45, M.obs, 'obs');
      for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.6, 0.5), M.brass); e.position.x = s * 2.6; c.mesh.add(e); }
      c.wy = o.spd; c.upd = (t) => c.q.setFromAxisAngle(_up, o.ph + o.spd * t); kins.push(c);
    }
    if (o.type === 'push') {
      const c = addBox(new THREE.Vector3(o.x, o.y + 0.5, o.z), qI, 1.3, 1.0, 1.3, M.obs, 'obs'); c.v = new THREE.Vector3();
      c.upd = (t) => { const a = o.ph + o.spd * t; c.p.x = o.x + o.amp * Math.sin(a); c.v.x = o.amp * o.spd * Math.cos(a); }; kins.push(c);
    }
  }
  // gems along the path
  const gemGeo = new THREE.OctahedronGeometry(0.26, 0); const gems = [];
  for (let i = 1; i < segs.length - 1; i++) {
    if (segs[i].gap || r() < 0.35) continue;
    const a = pts[i], b = pts[i + 1], f = rand(0.25, 0.75), off = (r() * 2 - 1) * Math.max(0, segs[i].w / 2 - 0.6);
    const m = new THREE.Mesh(gemGeo, M.gem); m.position.set(a.x + (b.x - a.x) * f + off, a.y + (b.y - a.y) * f + 0.75, a.z + (b.z - a.z) * f);
    m.castShadow = true; levelGroup.add(m); gems.push({ m, taken: false });
  }
  // checkpoint arches + finish portal
  const rings = cps.slice(1).map((pi) => { const p = pts[pi], m = new THREE.Mesh(new THREE.TorusGeometry(2.7, 0.1, 12, 64), M.brass.clone());
    m.position.set(p.x, p.y - 0.2, p.z); m.material.emissive = new THREE.Color(th.trim); m.material.emissiveIntensity = 0; levelGroup.add(m); return m; });
  const fin = cur(), finZ = fin.z + 6;
  const arch = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.22, 16, 72), M.brass); arch.position.set(fin.x, fin.y - 0.3, finZ); levelGroup.add(arch);
  const portal = new THREE.Mesh(new THREE.CircleGeometry(3.3, 64), portalMat); portal.position.copy(arch.position); levelGroup.add(portal);
  for (const s of [-1, 1]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.5, 4.6, 20), M.stone); col.position.set(fin.x + s * 4.1, fin.y + 1.6, finZ); col.castShadow = true; levelGroup.add(col);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.2), M.brass); cap.position.y = 2.4; col.add(cap); }
  // floating rock islands
  let minY = 0; for (const p of pts) minY = Math.min(minY, p.y);
  for (let i = 0; i < 26; i++) {
    const p = pts[Math.floor(r() * pts.length)], s = rand(2, 7), g = new THREE.IcosahedronGeometry(1, 2), pa = g.attributes.position;
    for (let j = 0; j < pa.count; j++) { let x = pa.getX(j), y = pa.getY(j), z = pa.getZ(j); const d = 1 + 0.22 * Math.sin(x * 3.1 + y * 1.7 + i) * Math.cos(z * 2.3 + x + i);
      y = y > 0 ? y * 0.45 : y * 1.6; pa.setXYZ(j, x * d, y * d, z * d); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, M.rock); m.scale.setScalar(s); const sd = r() < 0.5 ? -1 : 1;
    m.position.set(p.x + sd * rand(14, 55), p.y + rand(-22, 6), p.z + rand(-10, 10)); m.rotation.y = r() * 6; levelGroup.add(m);
    if (r() < 0.45) { const hh = rand(0.6, 1.4), c = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, hh, 16), M.stone); c.position.y = 0.45 + hh / 2; m.add(c); }
  }
  clouds.position.y = minY - 24;
  L = { n, pts, segs, cps, holes, gems, rings, finZ, finY: fin.y, minY, portal, len: pts[0].z - finZ, diff };
}
const portalMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
  uniforms: { time: { value: 0 }, col: { value: new THREE.Color('#ffe2a0') } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform float time; uniform vec3 col; varying vec2 vUv;
    void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0, a = atan(p.y, p.x);
      float sw = 0.5 + 0.5 * sin(a * 6.0 + r * 14.0 - time * 3.0);
      float k = smoothstep(1.0, 0.2, r) * (0.25 + 0.5 * sw) + smoothstep(0.75, 1.0, r) * smoothstep(1.0, 0.95, r) * 1.5;
      gl_FragColor = vec4(col * k * 0.8, 1.0); }` });

function applyTheme(i) {
  const th = THEMES[i];
  scene.environment = envFor(i);
  const u = dome.material.uniforms; u.top.value.set(th.top); u.hor.value.set(th.hor); u.sun.value.set(th.sun); u.sunDir.value.set(...th.sd).normalize(); u.stars.value = th.stars || 0;
  scene.fog.color.set(th.fog); hemi.color.set(th.top).lerp(new THREE.Color(1, 1, 1), 0.5); hemi.groundColor.set(th.cloud);
  sun.color.set(th.sun); sun.intensity = th.li; cloudMat.uniforms.col.value.set(th.cloud); cloudMat.uniforms.fogc.value.set(th.fog);
  cloudMat.uniforms.sunDir.value.copy(u.sunDir.value); portalMat.uniforms.col.value.set(th.trim);
}

// ---------- simulation ----------
const pos = new THREE.Vector3(), vel = new THREE.Vector3(), camLook = new THREE.Vector3();
let grounded = false, groundY = 0, simT = 0, state = 'play', falls = 0, runGems = 0, cpIdx = 0, shake = 0, gemChain = 0, airT = 0, finT = 0;
const _l = new THREE.Vector3(), _iq = new THREE.Quaternion(), _n = new THREE.Vector3(), _ax = new THREE.Vector3(), _qq = new THREE.Quaternion();
function collide(c) {
  _l.copy(pos).sub(c.p); if (_l.lengthSq() > (c.rad + R) * (c.rad + R)) return;
  _iq.copy(c.q).invert(); _l.applyQuaternion(_iq);
  const h = c.h, cx = clamp(_l.x, -h.x, h.x), cy = clamp(_l.y, -h.y, h.y), cz = clamp(_l.z, -h.z, h.z);
  _n.set(_l.x - cx, _l.y - cy, _l.z - cz); const d = _n.length(); let pen;
  if (d > 1e-6) { if (d >= R) return; _n.divideScalar(d); pen = R - d; }
  else { const dx = h.x - Math.abs(_l.x), dy = h.y - Math.abs(_l.y), dz = h.z - Math.abs(_l.z);
    if (dy <= dx && dy <= dz) { _n.set(0, Math.sign(_l.y) || 1, 0); pen = dy + R; } else if (dx <= dz) { _n.set(Math.sign(_l.x) || 1, 0, 0); pen = dx + R; } else { _n.set(0, 0, Math.sign(_l.z) || 1); pen = dz + R; } }
  _n.applyQuaternion(c.q); pos.addScaledVector(_n, pen);
  let svx = 0, svz = 0; if (c.v) { svx = c.v.x; svz = c.v.z; }
  if (c.wy) { svx += c.wy * (pos.z - c.p.z); svz -= c.wy * (pos.x - c.p.x); }
  const vn = (vel.x - svx) * _n.x + vel.y * _n.y + (vel.z - svz) * _n.z;
  if (vn < 0) {
    vel.addScaledVector(_n, -vn * (1 + c.bounce));
    if (c.kind === 'obs') { vel.addScaledVector(_n, 1.5); if (-vn > 1.5) { sfx.clink(-vn); shake = Math.max(shake, 0.12); burst(pos.clone().addScaledVector(_n, -R), '#fff6d8', 6, 2, 0.5); } }
    else if (-vn > 4) { sfx.thud(-vn); shake = Math.max(shake, Math.min(0.25, -vn * 0.02)); }
  }
  if (_n.y > 0.6) { grounded = true; groundY = pos.y; }
}
function centerAt(z) {
  const P = L.pts; if (z >= P[0].z) return P[0];
  for (let i = 0; i < P.length - 1; i++) if (z <= P[i].z && z >= P[i + 1].z) { const f = (P[i].z - z) / (P[i].z - P[i + 1].z || 1); return { x: P[i].x + (P[i + 1].x - P[i].x) * f, y: P[i].y + (P[i + 1].y - P[i].y) * f }; }
  return P[P.length - 1];
}

// ---------- input ----------
const keys = {}; let ptr = null;
addEventListener('keydown', (e) => {
  keys[e.code] = true; sfx.init();
  if (e.code === 'KeyM') toggleMute();
  if (e.code === 'KeyR' && state !== 'menu') startLevel(L.n);
  if (e.code === 'Escape') state === 'menu' ? closeMenu() : openMenu();
  if ((e.code === 'Enter' || e.code === 'Space') && state === 'done' && !$('done').classList.contains('hide')) nextLevel();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => { sfx.init(); ptr = { id: e.pointerId, x0: e.clientX, x: e.clientX }; try { canvas.setPointerCapture(e.pointerId); } catch (_) {} });
canvas.addEventListener('pointermove', (e) => { if (ptr && ptr.id === e.pointerId) { ptr.x = e.clientX; const lim = Math.min(innerWidth, 900) * 0.2; if (Math.abs(ptr.x - ptr.x0) > lim) ptr.x0 = ptr.x - Math.sign(ptr.x - ptr.x0) * lim; } });
const endPtr = (e) => { if (ptr && ptr.id === e.pointerId) ptr = null; };
canvas.addEventListener('pointerup', endPtr); canvas.addEventListener('pointercancel', endPtr);
function readInput() {
  let f = (keys.KeyW || keys.ArrowUp) ? 1 : 0; const b = (keys.KeyS || keys.ArrowDown) ? 1 : 0;
  let s = ((keys.KeyD || keys.ArrowRight) ? 1 : 0) - ((keys.KeyA || keys.ArrowLeft) ? 1 : 0);
  if (ptr) { f = 1; s = clamp((ptr.x - ptr.x0) / (Math.min(innerWidth, 900) * 0.16), -1, 1); }
  return { f, s, b };
}
function botInput() {
  let tx = centerAt(pos.z - 2.5).x, best = 1e9;
  for (const h of L.holes) { const d = pos.z - h.z; if (d > -0.8 && d < 7 && d < best) { best = d; tx = h.x; } }
  return { f: 1, s: clamp((tx - pos.x) * 1.3 - vel.x * 0.4, -1, 1), b: 0 };
}

function step(dt) {
  simT += dt;
  for (const c of kins) c.upd(simT);
  let inp = { f: 0, s: 0, b: 0 };
  if (state === 'play') { inp = G.bot ? botInput() : readInput(); if (inp.f || inp.s) hideHint(); }
  const acc = grounded ? 24 : 7;
  vel.z += (-inp.f + inp.b * 0.8) * acc * dt; vel.x += inp.s * acc * 0.95 * dt;
  if (state === 'done') { vel.x *= 1 - 3 * dt; vel.z *= 1 - 2.5 * dt; }
  else if (grounded) { vel.z *= 1 - 2.2 * dt; vel.x *= 1 - 3.2 * dt; } else { vel.x *= 1 - 0.3 * dt; }
  vel.y -= 24 * dt; pos.addScaledVector(vel, dt);
  grounded = false; for (const c of cols) collide(c);
  airT = grounded ? 0 : airT + dt;
  const sp = Math.hypot(vel.x, vel.z);
  if (sp > 1e-3) { _ax.set(vel.z, 0, -vel.x).normalize(); _qq.setFromAxisAngle(_ax, sp * dt / R); ball.quaternion.premultiply(_qq); }
  if (state !== 'play') return;
  for (const g of L.gems) if (!g.taken && g.m.position.distanceToSquared(pos) < 0.75) {
    g.taken = true; g.m.visible = false; runGems++; sfx.gem(gemChain++); burst(g.m.position, [THEMES[L.n % 4].gem, '#ffffff'], 18, 3, 1); hudGems();
  }
  for (let k = cpIdx + 1; k < L.cps.length; k++) { const p = L.pts[L.cps[k]];
    if (pos.z < p.z && Math.abs(pos.x - p.x) < 4 && pos.y > p.y - 1) { cpIdx = k; const ring = L.rings[k - 1]; ring.material.emissiveIntensity = 1.2; sfx.check(); burst(pos, THEMES[L.n % 4].trim, 24, 4, 2); } }
  if (pos.z < L.finZ && pos.y > L.finY - 1.5) finish();
  if (pos.y < L.minY - 14) respawn();
}
function respawn() {
  falls++; sfx.fall(); const p = L.pts[L.cps[cpIdx]];
  pos.set(p.x, p.y + R + 0.05, p.z - 1); vel.set(0, 0, 0); airT = 0; gemChain = 0;
  const fl = $('flash'); fl.style.transition = 'none'; fl.style.opacity = 0.7; requestAnimationFrame(() => { fl.style.transition = 'opacity .6s'; fl.style.opacity = 0; });
  snapCam(); shake = 0.3;
}
function finish() {
  state = 'done'; finT = 0; const n = L.n, stars = falls === 0 ? 3 : falls <= 2 ? 2 : 1;
  save.gems += runGems; save.stars[n] = Math.max(save.stars[n] || 0, stars); save.unlocked = Math.min(NLEV, Math.max(save.unlocked, n + 2)); persist();
  sfx.win(); burst(pos, ['#ffe08a', '#ff7fb5', '#7fe8ff', '#ffffff', '#a8ff9a'], 140, 9, 4); shake = 0.2;
  $('dTitle').textContent = 'Course ' + ROMAN[n] + ' cleared';
  $('dStars').innerHTML = [0, 1, 2].map((i) => `<span class="${i < stars ? '' : 'dim'}">&#9733;</span>`).join('');
  $('dInfo').textContent = `${runGems} gem${runGems === 1 ? '' : 's'} · ${falls} fall${falls === 1 ? '' : 's'}`;
  $('bNext').textContent = n + 1 < NLEV ? 'Next ▶' : 'All clear ✦';
  setTimeout(() => { if (state === 'done') $('done').classList.remove('hide'); }, 1100);
}

// ---------- camera ----------
const camOff = new THREE.Vector3(0, 2.7, 5.8);
function snapCam() { camera.position.copy(pos).add(camOff); camLook.copy(pos).add(new THREE.Vector3(0, 0.3, -4)); camera.lookAt(camLook); }
function updCam(dt) {
  const falling = airT > 0.5 && pos.y < groundY - 2.5;
  if (!falling) { const tgt = pos.clone().add(camOff); const k = 1 - Math.exp(-6 * dt); camera.position.lerp(tgt, k); camera.position.y += (tgt.y - camera.position.y) * k; }
  camLook.lerp(pos.clone().add(new THREE.Vector3(0, 0.3, -4)), 1 - Math.exp(-8 * dt));
  camera.lookAt(camLook);
  if (shake > 0) { camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake; shake = Math.max(0, shake - dt * 0.8); }
  const sp = Math.hypot(vel.x, vel.z), base = camera.aspect < 0.8 ? 74 : 62; camera.fov += (base + sp * 0.9 - camera.fov) * (1 - Math.exp(-3 * dt)); camera.updateProjectionMatrix();
}

// ---------- flow / UI ----------
let hintTimer = 0;
function hideHint() { if (hintTimer > 1.2) $('hint').classList.add('gone'); }
function hudGems() { $('gems').innerHTML = '&#9670; ' + (save.gems + runGems); }
function startLevel(n) {
  n = clamp(n, 0, NLEV - 1); buildLevel(n); state = 'play'; falls = 0; runGems = 0; cpIdx = 0; gemChain = 0; simT = 0; airT = 0;
  pos.set(0, R + 0.05, 0); vel.set(0, 0, 0); snapCam();
  $('lvl').textContent = ROMAN[n] + ' · ' + THEMES[n % 4].name; $('done').classList.add('hide'); $('menu').classList.add('hide');
  hintTimer = 0; $('hint').classList.toggle('gone', n > 0); hudGems();
}
function nextLevel() { sfx.click(); if (L.n + 1 < NLEV) startLevel(L.n + 1); else openMenu(); }
let selLevel = 0, menuPrev = null;
function openMenu() { if (state === 'menu') return; menuPrev = state; state = 'menu'; selLevel = Math.min(save.unlocked - 1, L ? L.n : 0); renderMenu(); $('menu').classList.remove('hide'); $('done').classList.add('hide'); }
function closeMenu() { if (menuPrev === 'play') { state = 'play'; $('menu').classList.add('hide'); } else startLevel(selLevel); }
function renderMenu() {
  $('mGems').innerHTML = '&#9670; ' + save.gems;
  $('grid').innerHTML = ROMAN.map((r, i) => `<button data-l="${i}" ${i >= save.unlocked ? 'disabled' : ''} class="${i === selLevel ? 'sel' : ''}">${r}<small>${'★'.repeat(save.stars[i] || 0) || '&nbsp;'}</small></button>`).join('');
  $('skins').innerHTML = SKINS.map((s, i) => { const own = save.owned.includes(i);
    return `<button data-s="${i}" class="${save.skin === i ? 'on' : ''}"><span class="dot" style="background:radial-gradient(circle at 35% 30%,#fff,${s.tint} 45%,${s.vane})"></span>${s.name}<br><small>${save.skin === i ? 'equipped' : own ? 'owned' : '&#9670; ' + s.cost}</small></button>`; }).join('');
}
$('grid').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b || b.disabled) return; sfx.click(); startLevel(+b.dataset.l); });
$('skins').addEventListener('click', (e) => { const b = e.target.closest('button'); if (!b) return; const i = +b.dataset.s, s = SKINS[i];
  if (!save.owned.includes(i)) { if (save.gems < s.cost) { sfx.thud(6); return; } save.gems -= s.cost; save.owned.push(i); sfx.win(); }
  else sfx.click(); save.skin = i; persist(); applySkin(); renderMenu(); hudGems(); });
$('bPlay').onclick = () => { sfx.init(); sfx.click(); menuPrev === 'play' ? closeMenu() : startLevel(selLevel); };
$('bPause').onclick = () => { sfx.init(); openMenu(); };
$('bNext').onclick = nextLevel; $('bRetry').onclick = () => { sfx.click(); startLevel(L.n); }; $('bMenu2').onclick = () => { sfx.click(); openMenu(); };
function toggleMute() { sfx.setMuted(!sfx.muted); $('bMute').classList.toggle('off', sfx.muted); }
$('bMute').onclick = () => toggleMute(); $('bMute').classList.toggle('off', sfx.muted);

// ---------- loop ----------
let lastT = performance.now(), accT = 0, wall = 0;
function visuals(dt) {
  wall += dt; hintTimer += dt;
  ball.position.copy(pos);
  for (const c of kins) { c.mesh.position.copy(c.p); c.mesh.quaternion.copy(c.q); }
  for (const g of L.gems) if (!g.taken) { g.m.rotation.y += dt * 2; g.m.position.y += Math.sin(wall * 3 + g.m.position.z) * 0.002; }
  L.portal.rotation.z += dt * 0.3; portalMat.uniforms.time.value = wall; cloudMat.uniforms.time.value = wall;
  if (state === 'menu') { const a = wall * 0.15; camera.position.set(pos.x + Math.sin(a) * 9, pos.y + 4, pos.z + Math.cos(a) * 9); camera.lookAt(pos); }
  else updCam(dt);
  dome.position.copy(camera.position); cloudMat.uniforms.cam.value.copy(camera.position); clouds.position.x = camera.position.x; clouds.position.z = camera.position.z;
  const sd = dome.material.uniforms.sunDir.value; sun.position.copy(pos).addScaledVector(sd, 30); sun.target.position.copy(pos);
  if (Math.hypot(vel.x, vel.z) > 9 && grounded && Math.random() < 0.3) burst(pos.clone().add(new THREE.Vector3(0, -0.4, 0.3)), '#ffffff', 1, 0.6, 0.4);
  updParticles(dt);
  sfx.roll(Math.hypot(vel.x, vel.z), grounded && state !== 'menu');
  $('fill').style.width = (clamp((L.pts[0].z - pos.z) / L.len, 0, 1) * 100).toFixed(1) + '%';
}
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
  if (state !== 'menu') { accT += dt; while (accT >= STEP) { step(STEP); accT -= STEP; } }
  visuals(dt); renderer.render(scene, camera);
}

// test hooks (headless bot / screenshots)
const G = window.__G = {
  bot: Q.has('bot'), NLEV,
  get state() { return state; }, start: (n) => startLevel(n),
  fast(sec) { for (let i = 0; i < sec / STEP && state === 'play'; i++) step(STEP); visuals(STEP); },
  put: (x, y, z) => { pos.set(x, y, z); vel.set(0, 0, -8); }, cols: () => cols.filter((c) => Math.abs(c.p.z + 230) < 12).map((c) => [c.kind, +c.p.x.toFixed(1), +c.p.y.toFixed(2), +c.p.z.toFixed(1), +(c.h.x*2).toFixed(1), +(c.h.y*2).toFixed(2), +(c.h.z*2).toFixed(1)]),
  dbg: () => ({ z: pos.z, x: pos.x, cp: cpIdx, pts: L.pts, segs: L.segs, holes: L.holes }),
  info: () => ({ state, level: L.n, falls, gems: runGems, prog: +((L.pts[0].z - pos.z) / L.len).toFixed(2), y: +pos.y.toFixed(2) }),
};

startLevel(Q.has('level') ? +Q.get('level') - 1 : save.unlocked - 1);
if (Q.has('title')) openMenu();
requestAnimationFrame(frame);
