// GOLF ORBIT - launch a golf ball across little resort-island planets.
import * as THREE from 'three';
import { unlock, sfx, toggleMute } from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------- save ----------
const UPS = [
  { k: 'power', name: 'Driver', desc: 'launch power', base: 25, max: 12 },
  { k: 'bounce', name: 'Spring Core', desc: 'bouncier ball', base: 30, max: 12 },
  { k: 'glide', name: 'Aero Dimples', desc: 'less drag', base: 30, max: 12 },
  { k: 'magnet', name: 'Starfish Magnet', desc: 'grab radius', base: 20, max: 10 },
  { k: 'rocket', name: 'Pocket Rocket', desc: 'mid-air boosts', base: 60, max: 5 },
];
let save = { best: 0, coins: 0, runs: 0, lv: { power: 0, bounce: 0, glide: 0, magnet: 0, rocket: 0 } };
try { const s = JSON.parse(localStorage.getItem('golf_orbit') || 'null'); if (s && s.lv) save = Object.assign(save, s, { lv: Object.assign(save.lv, s.lv) }); } catch (e) {}
const persist = () => { try { localStorage.setItem('golf_orbit', JSON.stringify(save)); } catch (e) {} };
const cost = (u) => Math.round(u.base * Math.pow(1.55, save.lv[u.k]));

// ---------- renderer ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.autoClear = false;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 1, 3000);
scene.add(new THREE.HemisphereLight(0xbff4ff, 0xffd9a0, 1.1));
const sunL = new THREE.DirectionalLight(0xfff0d0, 2.0); sunL.position.set(-35, 60, 70); scene.add(sunL);
const SUN = new THREE.Vector3(-0.35, 0.6, 0.7).normalize();

const GLSL_NOISE = `
float h3(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float n3(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
  return mix(mix(mix(h3(i),h3(i+vec3(1,0,0)),f.x),mix(h3(i+vec3(0,1,0)),h3(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(h3(i+vec3(0,0,1)),h3(i+vec3(1,0,1)),f.x),mix(h3(i+vec3(0,1,1)),h3(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm3(vec3 p){ float a=.5,s=0.; for(int i=0;i<4;i++){ s+=a*n3(p); p*=2.03; a*=.5; } return s; }`;

// ---------- sky + sea backdrop (screen pass) ----------
const bgScene = new THREE.Scene(), bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const bgU = { uRes: { value: new THREE.Vector2(1, 1) }, uOff: { value: new THREE.Vector2() }, uTime: { value: 0 }, uWarm: { value: 0 } };
bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
  uniforms: bgU, depthTest: false, depthWrite: false,
  vertexShader: 'void main(){ gl_Position = vec4(position.xy,0.,1.); }',
  fragmentShader: `uniform vec2 uRes, uOff; uniform float uTime, uWarm;
  float hs(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
  float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
    return mix(mix(hs(i),hs(i+vec2(1,0)),f.x),mix(hs(i+vec2(0,1)),hs(i+vec2(1,1)),f.x),f.y); }
  float fb(vec2 p){ float a=.5,s=0.; for(int i=0;i<5;i++){ s+=a*vn(p); p=p*2.02+vec2(3.1,1.7); a*=.5; } return s; }
  vec3 clouds(vec3 col, vec2 uv, float asp, float hy, float par, float sc, float th){
    vec2 cp = vec2(uv.x*asp*sc + uOff.x*par + uTime*0.01, (uv.y-hy)*sc*2.6);
    float band = smoothstep(0.02,0.14,uv.y-hy)*smoothstep(0.7,0.25,uv.y-hy);
    float c = fb(cp)*(0.55+0.7*band);
    float m = smoothstep(th, th+0.05, c);
    float lit = clamp((c - fb(cp - vec2(0.,0.12))*(0.55+0.7*band))*5.+0.55, 0., 1.);
    vec3 cc = mix(mix(vec3(0.72,0.8,0.97), vec3(0.95,0.6,0.7), uWarm), mix(vec3(1.), vec3(1.,0.9,0.75), uWarm), lit);
    return mix(col, cc, m);
  }
  void main(){
    vec2 uv = gl_FragCoord.xy/uRes; float asp = uRes.x/uRes.y;
    float hy = clamp(0.3 - uOff.y*0.0016, 0.1, 0.46);
    vec3 top = mix(vec3(0.02,0.5,0.9), vec3(0.3,0.24,0.62), uWarm);
    vec3 hor = mix(vec3(0.6,0.94,1.), vec3(1.,0.63,0.42), uWarm);
    vec2 sun = vec2(0.8, mix(0.8, hy+0.13, uWarm));
    vec3 col;
    if (uv.y > hy) {
      col = mix(hor, top, pow((uv.y-hy)/(1.-hy), 0.62));
      float sd = length(vec2((uv.x-sun.x)*asp, uv.y-sun.y));
      col += vec3(1.,0.8,0.45)*0.45*exp(-sd*5.);
      col = mix(col, vec3(1.,0.98,0.86), smoothstep(0.062,0.054,sd));
      col = clouds(col, uv, asp, hy, 0.00025, 1.2, 0.6);
      col = clouds(col, uv, asp, hy, 0.0007, 2.0, 0.57);
      // far islands on the horizon
      float ix = uv.x*asp*3. + uOff.x*0.0004; float isl = max(0., vn(vec2(ix,7.))-0.62)*0.08;
      if (uv.y < hy + isl) col = mix(vec3(0.2,0.55,0.55), hor, 0.45);
    } else {
      float k = (hy-uv.y)/hy;
      col = mix(vec3(0.3,0.9,0.92), vec3(0.0,0.36,0.72), pow(k,0.55));
      float z = 1./(k+0.05);
      vec2 wp = vec2(uv.x*asp*z*0.6 + uOff.x*0.002, z*1.2 + uTime*0.25);
      col += (vn(wp*vec2(2.,1.2))-0.5)*0.1*(k+0.3);
      float gl = smoothstep(0.82, 0.9, vn(wp*vec2(7.,3.)+vec2(uTime*1.3,0.))) * exp(-pow((uv.x-sun.x)*asp*2.2/(0.25+k),2.));
      col += gl*vec3(1.,0.95,0.7);
      col = mix(col, hor, exp(-k*25.)*0.7);
    }
    gl_FragColor = vec4(col,1.);
  }`,
})));

// ---------- geometry helpers ----------
function merge(parts) {
  let n = 0; parts.forEach((g) => (n += g.attributes.position.count));
  const P = new Float32Array(n * 3), C = new Float32Array(n * 3); let o = 0;
  for (const g of parts) { P.set(g.attributes.position.array, o * 3); C.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const m = new THREE.BufferGeometry(); m.setAttribute('position', new THREE.BufferAttribute(P, 3)); m.setAttribute('color', new THREE.BufferAttribute(C, 3)); m.computeVertexNormals(); return m;
}
function paint(g, fn) { g = g.index ? g.toNonIndexed() : g; const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i), i); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); g.deleteAttribute('normal'); g.deleteAttribute('uv'); return g; }
const palmGeo = (() => {
  const trunk = paint(new THREE.CylinderGeometry(0.22, 0.42, 6, 7, 8, true), (c, x, y) => c.set(Math.floor((y + 3) * 2.2) % 2 ? 0x9a6a3a : 0x7a4e28));
  const tp = trunk.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i) + 3; tp.setXYZ(i, tp.getX(i) + 0.06 * y * y, y, tp.getZ(i)); }
  const parts = [trunk], top = new THREE.Vector3(0.06 * 36, 6, 0);
  for (let l = 0; l < 8; l++) {
    const a = (l / 8) * Math.PI * 2 + 0.3, L = 3.6 + (l % 3) * 0.5, verts = [], cols = [], S = 7;
    const pt = (t, s) => { const w = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.55 * s, r = t * L, y = 1.1 * t - 2.4 * t * t;
      return [top.x + Math.cos(a) * r - Math.sin(a) * w, top.y + y - Math.abs(w) * 0.25, top.z + Math.sin(a) * r + Math.cos(a) * w]; };
    for (let i = 0; i < S; i++) { const t0 = i / S, t1 = (i + 1) / S;
      const q = [pt(t0, -1), pt(t0, 0), pt(t1, -1), pt(t1, 0), pt(t0, 1), pt(t1, 1)];
      [[q[0], q[1], q[2]], [q[2], q[1], q[3]], [q[1], q[4], q[3]], [q[3], q[4], q[5]]].forEach((tri, j) => tri.forEach((v) => { verts.push(...v);
        const g = new THREE.Color().setHSL(0.27 + 0.03 * (l % 2), 0.75, 0.32 + 0.12 * t0 + (j % 2) * 0.05); cols.push(g.r, g.g, g.b); })); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); parts.push(g);
  }
  parts.push(paint(new THREE.SphereGeometry(0.35, 6, 4).translate(top.x + 0.2, top.y - 0.3, 0.2), (c) => c.set(0x5a3a1a)));
  parts.push(paint(new THREE.SphereGeometry(0.33, 6, 4).translate(top.x - 0.2, top.y - 0.35, -0.1), (c) => c.set(0x6a4520)));
  return merge(parts);
})();
const umbGeo = (() => {
  const cone = paint(new THREE.ConeGeometry(2.1, 0.9, 10, 1, true).translate(0, 3.2, 0), (c, x, y, z, i) => c.set(Math.floor(i / 3) % 2 ? 0xfffaf0 : 0xff4a3a));
  const pole = paint(new THREE.CylinderGeometry(0.07, 0.07, 3.4, 5).translate(0, 1.6, 0), (c) => c.set(0xfffaf0));
  const towel = paint(new THREE.BoxGeometry(1.0, 0.06, 2.0).translate(1.2, 0.05, 0), (c, x, y, z) => c.set(Math.floor((z + 1) * 3) % 2 ? 0x2fb5ff : 0xffd34a));
  return merge([cone, pole, towel]);
})();
const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });

// ---------- planets ----------
const sphereGeo = new THREE.SphereGeometry(1, 72, 48);
const haloGeo = new THREE.PlaneGeometry(1, 1);
const haloMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: 'varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying vec2 vU; void main(){ float d = length(vU-.5)*2.; float g = smoothstep(1.,0.72,d)*smoothstep(0.6,0.74,d); gl_FragColor = vec4(vec3(0.7,0.95,1.)*g*0.55,1.); }' });
const planetVS = `varying vec3 vN; varying vec3 vW; void main(){ vN = normal; vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`;
const planetFS = `uniform vec4 uA, uP; uniform float uB, uSeed, uTime, uBall; uniform vec3 uSun;
varying vec3 vN; varying vec3 vW; ${GLSL_NOISE}
void main(){
  vec3 n = normalize(vN), V = normalize(cameraPosition - vW), L = uSun;
  float diff = max(dot(n,L),0.); diff = mix(diff, floor(diff*4.)/4.+.125, .35);
  vec3 col; float sea = 0., spec;
  if (uBall > .5) {
    float s = floor((atan(n.x, n.z)+3.14159)/6.28318*6. + uTime*.05);
    s = mod(s, 6.);
    col = s<1.?vec3(1.,.25,.2):s<2.?vec3(1.):s<3.?vec3(.15,.5,1.):s<4.?vec3(1.,.82,.15):s<5.?vec3(1.):vec3(.2,.8,.35);
    if (abs(n.y) > .9) col = vec3(1.);
    col *= .5 + .7*diff; spec = pow(max(dot(n, normalize(L+V)),0.), 40.); col += spec*.8;
  } else {
    float th = atan(n.y, n.x);
    float rim = uB + dot(uA, sin(vec4(1.,2.,3.,4.)*th + uP));
    float hn = uB + (fbm3(n*2.3 + uSeed) - .47)*1.9;
    float h = mix(rim, hn, smoothstep(.15,.85,abs(n.z)));
    if (h < 0.) {
      sea = 1.;
      col = mix(vec3(.02,.4,.78), vec3(.15,.9,.86), smoothstep(-.5,0.,h));
      col += (n3(n*16. + vec3(uTime*.5,0.,uTime*.3)) - .5)*.08;
      float foam = smoothstep(-.09,-.02,h) * (.6+.4*sin(uTime*2.5 + th*30. + h*60.));
      col = mix(col, vec3(1.), clamp(foam,0.,1.)*.85);
    } else if (h < .18) {
      col = mix(vec3(1.,.87,.6), vec3(.98,.78,.5), n3(n*40.));
    } else {
      col = mix(vec3(.22,.7,.24), vec3(.5,.86,.28), fbm3(n*7. + uSeed));
      col = mix(col, vec3(.08,.45,.25), smoothstep(.5,.9,h));
    }
    col *= .5 + .72*diff;
    col += vec3(.04,.1,.16)*(1.-diff);
    vec3 H = normalize(L+V);
    spec = pow(max(dot(n,H),0.), sea>.5?70.:18.) * (sea>.5 ? .5 + 1.1*n3(n*45.+uTime) : .12);
    col += spec*vec3(1.,.95,.8);
  }
  float fr = pow(1.-max(dot(n,V),0.), 3.);
  col = mix(col, vec3(.75,.96,1.), fr*.6);
  gl_FragColor = vec4(col,1.);
}`;
const planets = [];
const KIND_E = [0.7, 0.4, 0.55, 1.12], KIND_F = [0.04, 0.3, 0.14, 0.0], KIND_ROLL = [0.15, 1.4, 0.6, 0];
function rimH(p, th) { let h = p.b; for (let k = 0; k < 4; k++) h += p.a[k] * Math.sin((k + 1) * th + p.p[k]); return h; }
function kindAt(p, th) { if (p.ball) return 3; const h = rimH(p, th); return h < 0 ? 0 : h < 0.18 ? 1 : 2; }
function addPlanet(x, y, R, opts = {}) {
  const p = { x, y, R, ball: !!opts.ball, gs: opts.ball ? 10 : 14, b: opts.b ?? rnd(-0.15, 0.25), a: [rnd(0.2, 0.5), rnd(0.1, 0.4), rnd(0.05, 0.3), rnd(0, 0.2)], p: [0, 1, 2, 3].map(() => rnd(0, 6.28)), seed: rnd(0, 50) };
  if (opts.homeTop) p.p[0] = Math.PI / 2 - Math.PI / 2; // sin(th + 0) peaks at th = pi/2
  const mat = new THREE.ShaderMaterial({ vertexShader: planetVS, fragmentShader: planetFS, uniforms: {
    uA: { value: new THREE.Vector4(...p.a) }, uP: { value: new THREE.Vector4(...p.p) }, uB: { value: p.b }, uSeed: { value: p.seed }, uTime: shared.uTime, uBall: { value: p.ball ? 1 : 0 }, uSun: { value: SUN } } });
  const g = new THREE.Group(); g.position.set(x, y, 0);
  const s = new THREE.Mesh(sphereGeo, mat); s.scale.setScalar(R); g.add(s);
  const halo = new THREE.Mesh(haloGeo, haloMat); halo.scale.setScalar(R * 2.8); g.add(halo);
  if (!p.ball) {
    const n = Math.floor(R * 0.9), up = new THREE.Vector3(0, 1, 0);
    for (let i = 0; i < n; i++) {
      const th = rnd(0, Math.PI * 2), h = rimH(p, th), ph = rnd(-0.22, 0.22);
      let geo = null, sc = 1;
      if (h > 0.26 && Math.random() < 0.55) { geo = palmGeo; sc = rnd(0.6, 1.15) * clamp(R / 25, 0.6, 1.2); }
      else if (h > 0.03 && h < 0.15 && Math.random() < 0.35) { geo = umbGeo; sc = 0.7; }
      if (!geo) continue;
      const d = new THREE.Vector3(Math.cos(th) * Math.cos(ph), Math.sin(th) * Math.cos(ph), Math.sin(ph));
      const m = new THREE.Mesh(geo, vcMat); m.position.copy(d).multiplyScalar(R * 0.995); m.quaternion.setFromUnitVectors(up, d); m.rotateY(rnd(0, 6.28)); m.scale.setScalar(sc); g.add(m);
    }
  }
  scene.add(g); p.g = g; p.mat = mat; planets.push(p); return p;
}
const shared = { uTime: { value: 0 } };

// ---------- coins (starfish) + float rings ----------
const starShape = new THREE.Shape();
for (let i = 0; i <= 10; i++) { const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.55 : 1.25; i ? starShape.lineTo(Math.cos(a) * r, Math.sin(a) * r) : starShape.moveTo(Math.cos(a) * r, Math.sin(a) * r); }
const starGeo = new THREE.ExtrudeGeometry(starShape, { depth: 0.3, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.15, bevelSegments: 2 }).center();
const starMat = new THREE.MeshStandardMaterial({ color: 0xffa82b, emissive: 0xc04a10, emissiveIntensity: 0.45, roughness: 0.35, metalness: 0.2 });
const ringGeo = paint(new THREE.TorusGeometry(3.4, 1.0, 10, 28), (c, x, y) => c.set(Math.floor(((Math.atan2(y, x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? 0xfffaf0 : 0xff3d2e));
ringGeo.computeVertexNormals();
const ringMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, metalness: 0 });
const coins = [], rings = [];
function addCoin(x, y) { const m = new THREE.Mesh(starGeo, starMat); m.position.set(x, y, 0); m.rotation.z = rnd(0, 6); scene.add(m); coins.push({ x, y, m, t: rnd(0, 6) }); }
function addRing(x, y, a) { const m = new THREE.Mesh(ringGeo, ringMat); m.position.set(x, y, 0); m.rotation.set(0, 0.85, a); scene.add(m); rings.push({ x, y, a, m, used: false }); }

// ---------- ball, trail, aim arrow ----------
const BR = 1.2;
const dimple = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256);
  for (let j = 0; j < 14; j++) for (let i = 0; i < 18; i++) { const px = i * 14.2 + (j % 2) * 7, py = j * 18.3 + 9; const g = x.createRadialGradient(px, py, 0, px, py, 6); g.addColorStop(0, '#999'); g.addColorStop(1, '#fff'); x.fillStyle = g; x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; })();
const ballM = new THREE.Mesh(new THREE.SphereGeometry(BR, 32, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35, bumpMap: dimple, bumpScale: 1.5, emissive: 0x334455, emissiveIntensity: 0.25 }));
scene.add(ballM);
const TN = 48, trailPos = new Float32Array(TN * 2 * 3), trailA = new Float32Array(TN * 2), hist = [];
const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailGeo.setAttribute('a', new THREE.BufferAttribute(trailA, 1));
const tIdx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; tIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailGeo.setIndex(tIdx);
const trail = new THREE.Mesh(trailGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: 'attribute float a; varying float vA; void main(){ vA = a; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying float vA; void main(){ gl_FragColor = vec4(mix(vec3(1.,.42,.3), vec3(1.,1.,.92), vA), vA*.85); }' }));
trail.frustumCulled = false; scene.add(trail);
const arrowShape = new THREE.Shape([[0, -0.35], [3.5, -0.35], [3.5, -0.9], [5.2, 0], [3.5, 0.9], [3.5, 0.35], [0, 0.35]].map(([x, y]) => new THREE.Vector2(x, y)));
const arrow = new THREE.Mesh(new THREE.ShapeGeometry(arrowShape), new THREE.MeshBasicMaterial({ color: 0xff4a3a, transparent: true, opacity: 0.9, depthTest: false }));
arrow.renderOrder = 5; scene.add(arrow);
const tee = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.5, 1.1, 8), new THREE.MeshLambertMaterial({ color: 0xff4a3a })); scene.add(tee);

// ---------- particles ----------
const PN = 700, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pMax = new Float32Array(PN);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3)); pGeo.setAttribute('size', new THREE.BufferAttribute(pSize, 1));
const pts = new THREE.Points(pGeo, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, vertexColors: true,
  vertexShader: 'attribute float size; varying vec3 vC; void main(){ vC = color; vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = size*400./-mv.z; gl_Position = projectionMatrix*mv; }',
  fragmentShader: 'varying vec3 vC; void main(){ float d = length(gl_PointCoord-.5); if(d>.5) discard; gl_FragColor = vec4(vC, smoothstep(.5,.3,d)); }' }));
pts.frustumCulled = false; scene.add(pts);
let pHead = 0;
function burst(x, y, n, col, spd, size = 1, life = 0.8, dir = null) {
  const c = new THREE.Color(col);
  for (let k = 0; k < n; k++) { const i = pHead; pHead = (pHead + 1) % PN; let a = rnd(0, 6.28), s = rnd(0.3, 1) * spd;
    let vx = Math.cos(a) * s, vy = Math.sin(a) * s; if (dir) { vx = vx * 0.5 + dir[0] * s; vy = vy * 0.5 + dir[1] * s; }
    pPos.set([x, y, rnd(-1, 1)], i * 3); pVel.set([vx, vy, rnd(-0.3, 0.3) * spd], i * 3); pCol.set([c.r * rnd(0.85, 1.1), c.g * rnd(0.85, 1.1), c.b * rnd(0.85, 1.1)], i * 3);
    pSize[i] = size * rnd(0.6, 1.3); pLife[i] = pMax[i] = life * rnd(0.6, 1.2); }
}
function updParticles(dt) {
  for (let i = 0; i < PN; i++) { if (pLife[i] <= 0) { pSize[i] = 0; continue; } pLife[i] -= dt; const j = i * 3;
    pVel[j] *= 0.97; pVel[j + 1] = pVel[j + 1] * 0.97 - 6 * dt; pVel[j + 2] *= 0.97; pPos[j] += pVel[j] * dt; pPos[j + 1] += pVel[j + 1] * dt; pPos[j + 2] += pVel[j + 2] * dt;
    if (pLife[i] <= 0) pSize[i] = 0; }
  pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = pGeo.attributes.size.needsUpdate = true;
}

// ---------- UI ----------
const ZONES = ['Tee Island', 'Coral Key', 'Mango Atoll', 'Papaya Point', 'Lagoon Nine', 'Hibiscus Reef', 'Coconut Cay', 'Sunset Shoals', 'Pelican Isle', 'Driftwood Bay', 'Marlin Rock', 'Far Horizon'];
const ZONE_LEN = 350;
let toastT = 0;
function toast(big, small = '') { $('toast').innerHTML = big + (small ? `<small>${small}</small>` : ''); $('toast').classList.add('on'); toastT = 1.6; }
const tmpV = new THREE.Vector3();
function pop(x, y, text, color = '#fff') {
  tmpV.set(x, y, 0).project(camera); const r = canvas.getBoundingClientRect();
  const d = document.createElement('div'); d.textContent = text;
  d.style.cssText = `position:absolute;left:${(tmpV.x * 0.5 + 0.5) * r.width}px;top:${(-tmpV.y * 0.5 + 0.5) * r.height}px;transform:translate(-50%,-50%);font:italic 900 22px Georgia,serif;color:${color};-webkit-text-stroke:1.5px #c0392b;paint-order:stroke fill;pointer-events:none;transition:all .8s ease-out;`;
  $('card').appendChild(d); requestAnimationFrame(() => { d.style.top = parseFloat(d.style.top) - 50 + 'px'; d.style.opacity = '0'; }); setTimeout(() => d.remove(), 850);
}
function hudUpd() {
  $('dist').innerHTML = Math.floor(G.dist).toLocaleString() + '<small> m</small>';
  $('best').textContent = 'best ' + Math.floor(save.best).toLocaleString() + ' m';
  $('coinN').textContent = save.coins + (G.state === 'fly' || G.state === 'aim1' || G.state === 'aim2' ? G.runCoins : 0);
  $('rockets').textContent = '▲'.repeat(G.rockets);
}
function buildShop() {
  $('shop').innerHTML = '';
  for (const u of UPS) { const lv = save.lv[u.k], c = cost(u), b = document.createElement('button'); b.className = 'up';
    b.innerHTML = `${u.name}<span class="lv">Lv ${lv}/${u.max} &middot; ${u.desc}</span><span class="c">${lv >= u.max ? 'MAX' : '★ ' + c}</span>`;
    b.disabled = lv >= u.max || save.coins < c; b.onclick = (e) => { e.stopPropagation(); buy(u.k); }; $('shop').appendChild(b); }
}
function buy(k) { const u = UPS.find((x) => x.k === k), c = cost(u); if (save.lv[k] >= u.max || save.coins < c) return false; save.coins -= c; save.lv[k]++; persist(); sfx.buy(); buildShop(); hudUpd(); return true; }

// ---------- game ----------
const G = { state: 'aim1', t: 0, ang: 45, pw: 0, dist: 0, maxX: 0, runCoins: 0, rockets: 0, zone: 0, combo: 0, skips: 0, shake: 0, slow: 1, slowT: 0, stall: 0, stopT: 0, lastBounce: 0,
  pos: new THREE.Vector2(), vel: new THREE.Vector2(), genX: 0, genY: 0, home: null, perfect: false };
const cam = { x: 0, y: 0, z: 40 };
function clearWorld() {
  for (const p of planets) { scene.remove(p.g); p.mat.dispose(); } planets.length = 0;
  for (const c of coins) scene.remove(c.m); coins.length = 0; for (const r of rings) scene.remove(r.m); rings.length = 0;
}
function genAhead() {
  while (G.genX < G.maxX + 900) {
    const far = clamp(G.genX / 4000, 0, 1), isBall = Math.random() < 0.09 && G.genX > 200;
    const R = isBall ? rnd(7, 12) : rnd(10, 36), gap = rnd(18, 60) * (1 + far * 0.6);
    G.genY = clamp(G.genY + rnd(-30, 30), -50, 50);
    const x = G.genX + R, y = G.genY + rnd(-20, 20);
    addPlanet(x, y, R, { ball: isBall });
    // starfish arc in the gap after this planet
    const gx = x + R + gap * 0.5, gy = y + rnd(-10, 40), n = 4 + Math.floor(Math.random() * 5);
    if (Math.random() < 0.75) for (let i = 0; i < n; i++) { const t = i / (n - 1) - 0.5; addCoin(gx + t * gap * 0.7, gy + 10 * (1 - 4 * t * t)); }
    if (Math.random() < 0.3) addRing(x, y + R + rnd(12, 26), rnd(-0.3, 0.4));
    G.genX = x + R + gap;
  }
  // forget the world far behind
  for (let i = planets.length - 1; i >= 0; i--) if (planets[i].x + planets[i].R < G.pos.x - 400 && planets[i] !== G.home) { scene.remove(planets[i].g); planets[i].mat.dispose(); planets.splice(i, 1); }
  for (let i = coins.length - 1; i >= 0; i--) if (coins[i].x < G.pos.x - 300) { scene.remove(coins[i].m); coins.splice(i, 1); }
}
function newRun() {
  clearWorld();
  G.home = addPlanet(0, -30, 30, { b: 0.55, homeTop: true });
  G.genX = 75; G.genY = 0; G.maxX = 0;
  Object.assign(G, { state: 'aim1', t: 0, dist: 0, runCoins: 0, rockets: save.lv.rocket, zone: 0, combo: 0, skips: 0, stall: 0, stopT: 0, slow: 1, slowT: 0, perfect: false });
  G.pos.set(0, BR + 0.6); G.vel.set(0, 0); hist.length = 0;
  genAhead();
  $('panel').classList.add('hide'); $('meter').classList.remove('hide'); $('meterLbl').textContent = 'ANGLE'; $('sweet').style.display = 'none';
  $('stampName').textContent = ZONES[0]; tee.visible = arrow.visible = true; tee.position.set(0, 0.2, 0);
  cam.x = 8; cam.y = 6; cam.z = 40; hudUpd();
}
function launch() {
  const f = G.perfect ? 1.15 : G.pw;
  const sp = 42 * (1 + 0.12 * save.lv.power) * (0.35 + 0.65 * f), a = (G.ang * Math.PI) / 180;
  G.vel.set(Math.cos(a) * sp, Math.sin(a) * sp); G.state = 'fly'; G.lastLaunch = performance.now();
  arrow.visible = false; $('meter').classList.add('hide');
  sfx.hit(f); G.shake = 0.6 + f * 0.6; burst(G.pos.x, G.pos.y, 26, 0xfffaf0, 18, 1.1, 0.6); burst(G.pos.x, G.pos.y - 0.6, 14, 0x6ad84a, 10, 0.8, 0.8);
  if (G.perfect) { toast('PERFECT!', 'sweet spot +15%'); G.slow = 0.25; G.slowT = 0.35; }
}
function action() {
  unlock();
  if (G.state === 'aim1') { G.state = 'aim2'; G.t = 0; $('meterLbl').textContent = 'POWER'; $('sweet').style.display = ''; sfx.tick(); }
  else if (G.state === 'aim2') { G.perfect = G.pw >= 0.84 && G.pw <= 0.94; launch(); }
  else if (G.state === 'fly' && G.rockets > 0) {
    G.rockets--; const v = G.vel.clone(); if (v.length() < 1) v.set(1, 0.3); v.normalize().add(new THREE.Vector2(0.7, 0.3)).normalize();
    G.vel.addScaledVector(v, 17); sfx.rocket(); G.shake = 0.4; burst(G.pos.x, G.pos.y, 30, 0xff7a2a, 14, 1.3, 0.5, [-v.x, -v.y]); G.stopT = 0; hudUpd();
  } else if (G.state === 'over' || G.state === 'title') { newRun(); }
}
function endRun() {
  G.state = 'over'; sfx.end();
  const distC = Math.floor(G.dist / 5), earned = G.runCoins + distC; save.coins += earned; save.runs++;
  const rec = G.dist > save.best; if (rec) save.best = G.dist; persist();
  $('ptitle').textContent = ZONES[G.zone].toUpperCase();
  $('presult').innerHTML = `<b>${Math.floor(G.dist).toLocaleString()} m</b>${rec ? ' &mdash; new record!' : ''}<br>★ ${G.runCoins} starfish + ★ ${distC} distance = <b>★ ${earned}</b>`;
  buildShop(); $('panel').classList.remove('hide'); $('go').textContent = 'Tee off again ▶'; hudUpd();
}
function stepFly(dt) {
  const v = G.vel, p = G.pos; let contact = false;
  for (const pl of planets) {
    const dx = p.x - pl.x, dy = p.y - pl.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2), R = pl.R;
    if (d < R * 6) { const fade = 1 - clamp((d - R * 3.5) / (R * 2.5), 0, 1), a = (pl.gs * R * R / Math.max(d2, R * R)) * fade; v.x -= (dx / d) * a * dt; v.y -= (dy / d) * a * dt; }
    if (d < R + BR) {
      const nx = dx / d, ny = dy / d; p.set(pl.x + nx * (R + BR), pl.y + ny * (R + BR)); const vn = v.x * nx + v.y * ny, kind = kindAt(pl, Math.atan2(ny, nx)); contact = true;
      if (vn < -2.5) {
        const e = kind === 3 ? KIND_E[3] : Math.min(0.93, KIND_E[kind] + 0.035 * save.lv.bounce);
        v.x -= (1 + e) * vn * nx; v.y -= (1 + e) * vn * ny;
        const tn = v.x * -ny + v.y * nx, tl = tn * (1 - KIND_F[kind]); v.x += (tl - tn) * -ny; v.y += (tl - tn) * nx;
        bounceFx(pl, kind, -vn, p.x - nx * BR, p.y - ny * BR, nx, ny);
      } else {
        if (vn < 0) { v.x -= vn * nx; v.y -= vn * ny; }
        const sp = v.length(), dec = (KIND_ROLL[kind] * sp + 1.5 * (kind === 1 ? 2 : 1)) * dt; if (sp > 0) v.multiplyScalar(Math.max(0, sp - dec) / sp);
      }
    }
  }
  v.y -= 7 * dt;
  const drag = Math.max(0.008, 0.045 * (1 - 0.075 * save.lv.glide)); v.multiplyScalar(1 - drag * dt);
  p.addScaledVector(v, dt);
  // rings
  for (const r of rings) if (!r.used && Math.hypot(p.x - r.x, p.y - r.y) < 3.6) { r.used = true; const dir = new THREE.Vector2(Math.cos(r.a), Math.sin(r.a));
    G.vel.addScaledVector(dir, 24); sfx.boost(); G.shake = 0.5; toast('FLOATIE BOOST!'); burst(r.x, r.y, 40, 0xff3d2e, 16, 1.0, 0.7); burst(r.x, r.y, 20, 0xffffff, 12, 1.0, 0.7); }
  // starfish
  const mag = 5 + 2 * save.lv.magnet;
  for (let i = coins.length - 1; i >= 0; i--) { const c = coins[i], dx = p.x - c.x, dy = p.y - c.y, d = Math.hypot(dx, dy);
    if (d < mag + 3) { c.x += (dx / d) * Math.min(d, 90 * dt); c.y += (dy / d) * Math.min(d, 60 * dt); }
    if (d < BR + 1.4) { G.runCoins++; G.combo++; sfx.coin(G.combo); burst(c.x, c.y, 10, 0xffc040, 8, 0.8, 0.5); scene.remove(c.m); coins.splice(i, 1); } }
  // progress, end conditions
  if (p.x > G.maxX + 1) { G.maxX = p.x; G.stall = 0; } else G.stall += dt;
  G.dist = Math.max(0, G.maxX);
  const sp = v.length();
  if (contact && sp < 2.5) G.stopT += dt; else if (!contact && sp < 3.5) G.stopT += dt * 0.6; else G.stopT = 0;
  if (p.y < -170) { burst(p.x, p.y, 60, 0xdff9ff, 25, 1.4, 1); sfx.bounce(0, 40); }
  if (G.stopT > 0.8 || G.stall > 4.5 || p.y < -170 || !isFinite(p.x)) endRun();
  const z = Math.min(ZONES.length - 1, Math.floor(G.dist / ZONE_LEN));
  genAhead();
  if (z > G.zone) { G.zone = z; toast('Greetings from', ZONES[z] + '!'); $('stampName').textContent = ZONES[z]; $('stamp').classList.add('pop'); setTimeout(() => $('stamp').classList.remove('pop'), 400); sfx.zone(); burst(p.x, p.y + 4, 50, [0xff4a3a, 0xffcf5a, 0x2fd0d6][z % 3], 20, 1.2, 1.2); }
}
function bounceFx(pl, kind, vn, x, y, nx, ny) {
  const now = G.simT; if (now - G.lastBounce < 0.12) return; G.lastBounce = now;
  sfx.bounce(kind, vn); G.shake = Math.max(G.shake, Math.min(0.7, vn / 40));
  const dir = [nx, ny];
  if (kind === 0) { burst(x, y, 24, 0xdff9ff, vn * 0.5 + 6, 1.0, 0.9, dir); burst(x, y, 12, 0x2fd0d6, vn * 0.4 + 4, 0.9, 0.8, dir); G.skips++; if (G.skips >= 2) { G.runCoins++; pop(x, y + 3, 'SKIP x' + G.skips, '#bff'); } }
  else if (kind === 1) { burst(x, y, 18, 0xffe0a0, vn * 0.35 + 3, 0.8, 0.7, dir); G.skips = 0; }
  else if (kind === 3) { burst(x, y, 30, 0xffcf5a, vn * 0.6 + 8, 1.0, 0.7, dir); pop(x, y + 3, 'BOING!', '#ffcf5a'); G.skips = 0; }
  else { burst(x, y, 14, 0x5fd34a, vn * 0.35 + 3, 0.8, 0.8, dir); G.skips = 0; }
}
G.simT = 0;
function step(dt) {
  G.simT += dt; G.t += dt;
  if (G.state === 'aim1') { G.ang = 45 + 34 * Math.sin(G.t * 2.2); }
  else if (G.state === 'aim2') { G.pw = 0.5 - 0.5 * Math.cos(G.t * 3.1); }
  else if (G.state === 'fly') { stepFly(dt); }
}
function syncVisuals(dt, real) {
  shared.uTime.value += real; bgU.uTime.value += real;
  ballM.position.set(G.pos.x, G.pos.y, 0);
  if (G.state === 'fly') { ballM.rotation.z -= G.vel.x * dt / BR; ballM.rotation.x += G.vel.y * dt / BR * 0.3; }
  // trail
  if (G.state === 'fly') { hist.unshift([G.pos.x, G.pos.y]); if (hist.length > TN) hist.pop(); } else if (G.state !== 'over') hist.length = 0;
  for (let i = 0; i < TN; i++) { const h = hist[Math.min(i, hist.length - 1)] || [G.pos.x, G.pos.y], h2 = hist[Math.min(i + 1, hist.length - 1)] || h;
    let tx = h[0] - h2[0], ty = h[1] - h2[1]; const l = Math.hypot(tx, ty) || 1; const w = BR * 0.85 * (1 - i / TN); const nx = (-ty / l) * w, ny = (tx / l) * w;
    trailPos.set([h[0] + nx, h[1] + ny, -0.1, h[0] - nx, h[1] - ny, -0.1], i * 6); const a = hist.length > 1 ? 1 - i / TN : 0; trailA[i * 2] = trailA[i * 2 + 1] = a; }
  trailGeo.attributes.position.needsUpdate = trailGeo.attributes.a.needsUpdate = true;
  // aim arrow + meter
  if (G.state === 'aim1' || G.state === 'aim2') { arrow.position.set(G.pos.x, G.pos.y, 1.5); arrow.rotation.z = (G.ang * Math.PI) / 180;
    const s = G.state === 'aim2' ? 0.8 + G.pw * 1.4 : 1.1; arrow.scale.set(s, 1, 1);
    $('fill').style.width = (G.state === 'aim1' ? ((G.ang - 11) / 68) * 100 : G.pw * 100) + '%'; }
  for (const c of coins) { c.t += real; c.m.position.set(c.x, c.y + Math.sin(c.t * 2) * 0.3, 0); c.m.rotation.y = c.t * 1.8; }
  for (const r of rings) { r.m.rotation.y = 0.85 + Math.sin(shared.uTime.value + r.x) * 0.25; r.m.scale.setScalar(r.used ? Math.max(0.01, r.m.scale.x - real * 3) : 1 + Math.sin(shared.uTime.value * 4) * 0.04); }
  updParticles(real);
  // camera
  let tx, ty, tz;
  if (G.state === 'title') { tx = 40 + Math.sin(shared.uTime.value * 0.1) * 30; ty = 5; tz = 95; }
  else if (G.state === 'aim1' || G.state === 'aim2') { tx = G.pos.x + 10; ty = G.pos.y + 5; tz = 38; }
  else { const sp = G.vel.length(), lead = clamp(sp * 0.35, 0, 35); tx = G.pos.x + (G.vel.x / (sp || 1)) * lead; ty = G.pos.y + (G.vel.y / (sp || 1)) * lead * 0.6; tz = clamp(60 + sp * 1.3, 60, 190); if (G.state === 'over') tz = 75; }
  const k = 1 - Math.exp(-real * 3); cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.z += (tz - cam.z) * k * 0.6;
  G.shake = Math.max(0, G.shake - real * 2); const sh = G.shake * G.shake * 2.5;
  camera.position.set(cam.x - cam.z * 0.06 + rnd(-sh, sh), cam.y + cam.z * 0.16 + rnd(-sh, sh), cam.z); camera.lookAt(cam.x, cam.y, 0);
  bgU.uOff.value.set(cam.x, cam.y); bgU.uWarm.value = clamp(G.dist / 3800, 0, 0.85);
  if (toastT > 0) { toastT -= real; if (toastT <= 0) $('toast').classList.remove('on'); }
}
function resize() { const r = canvas.parentElement.getBoundingClientRect(); renderer.setSize(r.width, r.height, false); camera.aspect = r.width / r.height; camera.updateProjectionMatrix(); const pr = renderer.getPixelRatio(); bgU.uRes.value.set(r.width * pr, r.height * pr); }
addEventListener('resize', resize);
let last = performance.now(), acc = 0, hudT = 0;
function frame(now) {
  requestAnimationFrame(frame);
  let real = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.slowT > 0) { G.slowT -= real; if (G.slowT <= 0) G.slow = 1; }
  acc += real * G.slow; let n = 0; const H = 1 / 120;
  while (acc >= H && n < 12) { step(H); acc -= H; n++; } if (n >= 12) acc = 0;
  syncVisuals(real * G.slow, real);
  if ((hudT -= real) < 0) { hudT = 0.08; hudUpd(); }
  renderer.clear(); renderer.render(bgScene, bgCam); renderer.render(scene, camera);
}

// ---------- input ----------
canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); action(); });
addEventListener('keydown', (e) => { if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (!e.repeat) action(); } if (e.code === 'KeyM') toggleMute(); });
$('go').onclick = (e) => { e.stopPropagation(); unlock(); sfx.tick(); newRun(); };
$('panel').addEventListener('pointerdown', (e) => e.stopPropagation());

// ---------- boot ----------
resize(); newRun();
if (Q.has('title')) {
  G.state = 'title'; $('meter').classList.add('hide'); arrow.visible = false;
  $('ptitle').textContent = 'GOLF ORBIT';
  $('presult').innerHTML = 'Drive a golf ball across a chain of tiny resort planets.<br>Tap to set <b style="font-size:15px">angle</b>, tap again for <b style="font-size:15px">power</b>.<br>Skip on the sea, ride floaties, grab starfish, buy upgrades.';
  $('shop').innerHTML = ''; $('go').textContent = 'Tee off ▶'; $('panel').classList.remove('hide');
}
requestAnimationFrame(frame);

// test hooks
window.__G = Object.assign(G, { action, buy, newRun, save: () => save, fast(sec) { const H = 1 / 120; for (let i = 0; i < sec * 120; i++) step(H); syncVisuals(H, H); }, planets, coins });
