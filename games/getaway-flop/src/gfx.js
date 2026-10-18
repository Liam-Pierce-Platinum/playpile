// Rubber-hose 1930s look: banded toon shading with screen-space ink hatching, ink rims,
// depth-edge ink lines + two-strip colour grade + film grain/flicker/scratches + iris wipe in post.
import * as THREE from 'three';

export const INK = new THREE.Color(0x1b130d);
export const PAPER = new THREE.Color(0xeee0bd);
const LIGHT = new THREE.Vector3(0.5, 0.85, 0.6).normalize();
export const SPH = new THREE.SphereGeometry(1, 20, 14);
export const BOX = new THREE.BoxGeometry(1, 1, 1);
export const CYL = new THREE.CylinderGeometry(1, 1, 1, 18);

const VS = `varying vec3 vN; varying vec3 vW; varying vec3 vV;
void main(){ vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal); vV = cameraPosition - w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w; }`;
const FS = `uniform vec3 uColor, uColor2, uLight, uInk, uPaper; uniform float uPattern, uRim, uFog;
varying vec3 vN; varying vec3 vW; varying vec3 vV;
float h21(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec3 n = normalize(vN); vec3 v = normalize(vV);
  float d = dot(n, uLight);
  float band = d > 0.5 ? 1.0 : (d > -0.05 ? 0.74 : 0.5);
  vec3 base = uColor;
  if (uPattern > 0.5 && uPattern < 1.5) {            // tenement windows on the street-facing side
    if (n.z > 0.5) { vec2 g = vec2(vW.x * 0.85, vW.y * 0.7 + 0.3); vec2 f = fract(g); vec2 id = floor(g);
      float win = step(0.22, f.x) * step(f.x, 0.78) * step(0.18, f.y) * step(f.y, 0.72);
      float lit = step(0.72, h21(id));
      vec3 wc = mix(uColor2, vec3(1.0, 0.86, 0.48), lit);
      float sill = step(0.12, f.y) * step(f.y, 0.18) * step(0.18, f.x) * step(f.x, 0.82);
      base = mix(base, wc, win); base = mix(base, uInk * 1.6, sill * 0.7); }
  } else if (uPattern > 1.5 && uPattern < 2.5) {     // awning stripes
    base = mix(uColor, uColor2, step(0.5, fract(vW.x * 1.4)));
  } else if (uPattern > 2.5) {                        // planks
    base *= 0.82 + 0.18 * step(0.07, fract(vW.x * 2.0 + vW.z * 0.5));
  }
  vec3 col = base * band;
  if (band < 0.6) { float h = fract((gl_FragCoord.x + gl_FragCoord.y) / 5.0); col = mix(col, uInk, step(0.7, h) * 0.85); }
  else if (band < 0.9) { float h = fract((gl_FragCoord.x - gl_FragCoord.y) / 7.0); col = mix(col, uInk, step(0.86, h) * 0.55); }
  if (uRim > 0.5 && dot(n, v) < 0.3) col = uInk;
  float fd = clamp((length(vV) - 28.0) / 55.0, 0.0, 0.72) * uFog;
  col = mix(col, uPaper, fd);
  gl_FragColor = vec4(col, 1.0);
}`;

const cache = new Map();
export function toon(color, o = {}) {
  const key = color + '|' + (o.color2 ?? 0) + '|' + (o.pattern ?? 0) + '|' + (o.rim ?? 1) + '|' + (o.fog ?? 1);
  let m = cache.get(key);
  if (!m) {
    m = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(color) }, uColor2: { value: new THREE.Color(o.color2 ?? 0x2a3a3a) },
        uPattern: { value: o.pattern ?? 0 }, uRim: { value: o.rim ?? 1 }, uFog: { value: o.fog ?? 1 },
        uLight: { value: LIGHT }, uInk: { value: INK }, uPaper: { value: PAPER },
      }, vertexShader: VS, fragmentShader: FS,
    });
    cache.set(key, m);
  }
  return m;
}

const PFS = `uniform sampler2D tC, tD; uniform vec2 uRes, uIrisC; uniform float uTime, uIris, uNear, uFar, uFlash; uniform vec3 uInk;
varying vec2 vUv;
float lin(float z){ return uNear * uFar / (uFar - z * (uFar - uNear)); }
float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main(){
  vec2 uv = vUv; uv.y += sin(uTime * 13.0) * 0.0006;
  vec3 c = texture2D(tC, uv).rgb;
  float d0 = lin(texture2D(tD, uv).r);
  vec2 px = max(1.0, uRes.y / 560.0) / uRes;
  float e = 0.0;
  e = max(e, abs(lin(texture2D(tD, uv + vec2(px.x, 0.0)).r) - d0));
  e = max(e, abs(lin(texture2D(tD, uv - vec2(px.x, 0.0)).r) - d0));
  e = max(e, abs(lin(texture2D(tD, uv + vec2(0.0, px.y)).r) - d0));
  e = max(e, abs(lin(texture2D(tD, uv - vec2(0.0, px.y)).r) - d0));
  c = mix(c, uInk, smoothstep(0.035, 0.07, e / d0));
  float gb = (c.g + c.b) * 0.5;                       // two-strip colour: reds + teals
  c = mix(c, vec3(c.r, gb * 1.03, gb * 0.92), 0.6);
  c = pow(c, vec3(1.08)) * vec3(1.05, 0.99, 0.88);
  c += (h(uv * uRes + fract(uTime * 7.0) * 113.0) - 0.5) * 0.08;
  c *= 0.965 + 0.035 * sin(uTime * 47.0) * sin(uTime * 11.0);
  float sx = h(vec2(floor(uTime * 12.0), 3.1));
  if (abs(uv.x - sx) < 0.0009 && h(vec2(floor(uTime * 12.0), 7.7)) > 0.55) c *= 0.55;
  float blot = h(floor(uv * vec2(90.0, 60.0)) + floor(uTime * 12.0));
  if (blot > 0.9993) c = mix(c, uInk, 0.7);
  vec2 q = uv - 0.5; c *= 1.0 - dot(q, q) * 1.25;
  c = mix(c, vec3(1.0, 0.95, 0.8), uFlash);
  vec2 a = (vUv - uIrisC) * vec2(uRes.x / uRes.y, 1.0);
  float ir = length(a);
  c = mix(c, uInk, smoothstep(uIris - 0.004, uIris + 0.004, ir));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.rt = new THREE.WebGLRenderTarget(4, 4, { depthTexture: new THREE.DepthTexture(4, 4) });
    this.u = {
      tC: { value: this.rt.texture }, tD: { value: this.rt.depthTexture }, uRes: { value: new THREE.Vector2(4, 4) },
      uTime: { value: 0 }, uIris: { value: 2 }, uIrisC: { value: new THREE.Vector2(0.5, 0.5) },
      uNear: { value: 0.5 }, uFar: { value: 200 }, uInk: { value: INK }, uFlash: { value: 0 },
    };
    const mat = new THREE.ShaderMaterial({ uniforms: this.u, fragmentShader: PFS, depthTest: false, depthWrite: false,
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }' });
    this.s = new THREE.Scene(); this.s.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.c = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  setSize() { const v = this.r.getDrawingBufferSize(new THREE.Vector2()); this.rt.setSize(v.x, v.y); this.u.uRes.value.copy(v); }
  render(scene, cam, t) {
    this.u.uTime.value = t; this.u.uNear.value = cam.near; this.u.uFar.value = cam.far;
    this.r.setRenderTarget(this.rt); this.r.render(scene, cam);
    this.r.setRenderTarget(null); this.r.render(this.s, this.c);
  }
}

// A bendy rubber hose limb: a tube along a quadratic bezier, rebuilt in place each frame.
export class Hose {
  constructor(r, mat, S = 10, R = 7) {
    this.r = r; this.S = S; this.R = R;
    const n = (S + 1) * R, geo = new THREE.BufferGeometry(), idx = [];
    this.pos = new Float32Array(n * 3); this.nor = new Float32Array(n * 3);
    for (let i = 0; i < S; i++) for (let j = 0; j < R; j++) {
      const a = i * R + j, b = i * R + (j + 1) % R, c = a + R, d = b + R; idx.push(a, c, b, b, c, d);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    this.geo = geo; this.mesh = new THREE.Mesh(geo, mat); this.mesh.frustumCulled = false;
  }
  set(ax, ay, bx, by, cx, cy, z) {
    const { S, R, r, pos, nor } = this;
    for (let i = 0; i <= S; i++) {
      const t = i / S, u = 1 - t;
      const px = u * u * ax + 2 * u * t * bx + t * t * cx, py = u * u * ay + 2 * u * t * by + t * t * cy;
      let dx = 2 * u * (bx - ax) + 2 * t * (cx - bx), dy = 2 * u * (by - ay) + 2 * t * (cy - by);
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const rr = r * (1 - 0.15 * Math.sin(t * Math.PI));
      for (let j = 0; j < R; j++) {
        const a = (j / R) * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), k = (i * R + j) * 3;
        const nx = -dy * ca, ny = dx * ca, nz = sa;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
        pos[k] = px + nx * rr; pos[k + 1] = py + ny * rr; pos[k + 2] = z + nz * rr;
      }
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.normal.needsUpdate = true;
  }
}

function m(geo, mat, x = 0, y = 0, z = 0, sx = 1, sy = sx, sz = sx) {
  const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.scale.set(sx, sy, sz); return o;
}
export const HAT_NAMES = ['Bare Noggin', 'Bowler', 'Stovepipe', 'Prop Beanie', 'Fez', 'Tin Crown'];

export function makeChar(color, hat) {
  const root = new THREE.Group(), facer = new THREE.Group(), body = new THREE.Group();
  root.add(facer); facer.add(body);
  const C = toon(color), dark = toon(new THREE.Color(color).multiplyScalar(0.5).getHex()), skin = toon(0xf3dcb0);
  const inkM = toon(0x1b130d, { rim: 0 }), white = toon(0xfff6e2), shoe = toon(0x3d2417), gold = toon(0xe8b23a);
  body.add(m(SPH, C, 0, 1.1, 0, 0.38, 0.4, 0.36));
  body.add(m(SPH, dark, 0, 0.84, 0, 0.42, 0.3, 0.4));
  for (const s of [-1, 1]) body.add(m(SPH, white, 0.36, 0.88, s * 0.13, 0.065));
  const head = new THREE.Group(); head.position.y = 1.72; body.add(head);
  head.add(m(SPH, C, 0, 0, 0, 0.4, 0.38, 0.38));
  head.add(m(SPH, skin, 0.13, -0.07, 0, 0.3, 0.26, 0.31));
  for (const s of [-1, 1]) {
    head.add(m(SPH, white, 0.28, 0.1, s * 0.11, 0.09, 0.15, 0.08));
    head.add(m(SPH, inkM, 0.35, 0.08, s * 0.11, 0.05, 0.11, 0.05));
    head.add(m(SPH, C, -0.05, 0.3, s * 0.3, 0.1, 0.16, 0.06)); // little ears
  }
  head.add(m(SPH, inkM, 0.44, -0.05, 0, 0.075, 0.065, 0.075));
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.026, 6, 12, Math.PI), inkM);
  mouth.position.set(0.37, -0.15, 0); mouth.rotation.set(0, Math.PI / 2, Math.PI); head.add(mouth);
  let prop = null;
  const hg = new THREE.Group(); hg.position.y = 0.3; hg.rotation.z = 0.12; head.add(hg);
  const hatC = toon(0x2e231b);
  if (hat === 1) { hg.add(m(SPH, hatC, 0, 0.02, 0, 0.27, 0.22, 0.27)); hg.add(m(CYL, hatC, 0, 0, 0, 0.4, 0.04, 0.4)); }
  if (hat === 2) { hg.add(m(CYL, hatC, 0, 0.3, 0, 0.24, 0.6, 0.24)); hg.add(m(CYL, toon(0xb8352a), 0, 0.08, 0, 0.245, 0.1, 0.245)); hg.add(m(CYL, hatC, 0, 0, 0, 0.4, 0.04, 0.4)); }
  if (hat === 3) {
    hg.add(m(SPH, toon(0xe8b23a), 0, -0.04, 0, 0.3, 0.2, 0.3)); hg.add(m(CYL, inkM, 0, 0.2, 0, 0.02, 0.2, 0.02));
    prop = new THREE.Group(); prop.position.y = 0.3; prop.add(m(BOX, toon(0xb8352a), 0, 0, 0, 0.5, 0.03, 0.09)); hg.add(prop);
  }
  if (hat === 4) {
    const fez = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.24, 0.32, 16), toon(0xb8352a)); fez.position.y = 0.1; hg.add(fez);
    hg.add(m(SPH, inkM, 0.12, 0.08, 0, 0.04, 0.12, 0.04));
  }
  if (hat === 5) {
    const cr = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.24, 0.18, 10, 1, true), gold); cr.material.side = THREE.DoubleSide; cr.position.y = 0.04; hg.add(cr);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; hg.add(m(SPH, gold, Math.cos(a) * 0.25, 0.17, Math.sin(a) * 0.25, 0.05)); }
  }
  const legs = [new Hose(0.075, inkM), new Hose(0.075, inkM)], arms = [new Hose(0.065, inkM), new Hose(0.065, inkM)];
  const shoes = [], gloves = [];
  for (let k = 0; k < 2; k++) {
    facer.add(legs[k].mesh, arms[k].mesh);
    const s = m(SPH, shoe, 0, 0, 0, 0.24, 0.13, 0.15); facer.add(s); shoes.push(s);
    const g = new THREE.Group(); g.add(m(SPH, white, 0, 0, 0, 0.14, 0.13, 0.13)); g.add(m(CYL, white, -0.12, 0, 0, 0.06, 0.08, 0.11)); g.children[1].rotation.z = Math.PI / 2;
    facer.add(g); gloves.push(g);
  }
  // weapons ride in the front glove
  const pop = new THREE.Group(); pop.add(m(CYL, toon(0x6b6f6a), 0.25, 0.04, 0, 0.06, 0.4, 0.06)); pop.children[0].rotation.z = Math.PI / 2;
  pop.add(m(BOX, toon(0x5a3420), 0.02, -0.08, 0, 0.1, 0.2, 0.08)); pop.add(m(SPH, toon(0xb8352a), 0.46, 0.04, 0, 0.07));
  const blun = new THREE.Group(); const bb = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.06, 0.7, 14, 1, true), toon(0xb08a3a));
  bb.material.side = THREE.DoubleSide; bb.rotation.z = -Math.PI / 2; bb.position.x = 0.4; blun.add(bb); blun.add(m(BOX, toon(0x5a3420), 0, -0.04, 0, 0.3, 0.12, 0.09));
  const pie = new THREE.Group(); pie.add(m(CYL, toon(0xb7b0a0), 0.12, 0.1, 0, 0.2, 0.06, 0.2)); pie.add(m(SPH, toon(0xfff2d0), 0.12, 0.15, 0, 0.19, 0.08, 0.19));
  for (const w of [pop, blun, pie]) { w.visible = false; gloves[1].add(w); }
  const pieFace = m(SPH, toon(0xfff2d0), 0.3, -0.02, 0, 0.18, 0.3, 0.34); pieFace.visible = false; head.add(pieFace);
  const stars = [];
  for (let i = 0; i < 3; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex(), depthWrite: false })); s.scale.setScalar(0.32); s.visible = false; root.add(s); stars.push(s); }
  return { root, facer, body, head, legs, arms, shoes, gloves, weap: { pop, blun, pie }, pieFace, prop, stars };
}

let _star = null;
function starTex() {
  if (_star) return _star;
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  x.translate(32, 32); x.beginPath();
  for (let i = 0; i < 10; i++) { const r = i % 2 ? 11 : 27, a = i / 10 * Math.PI * 2 - Math.PI / 2; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  x.closePath(); x.fillStyle = '#f2c23e'; x.fill(); x.lineWidth = 5; x.strokeStyle = '#1b130d'; x.stroke();
  return (_star = new THREE.CanvasTexture(c));
}

export function wordTex(word, fill = '#d8452a') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 160; const x = c.getContext('2d');
  x.translate(128, 80); x.beginPath();
  for (let i = 0; i < 26; i++) { const r = i % 2 ? 50 : 76, a = i / 26 * Math.PI * 2; x.lineTo(Math.cos(a) * r * 1.55, Math.sin(a) * r); }
  x.closePath(); x.fillStyle = '#f2c23e'; x.fill(); x.lineWidth = 7; x.strokeStyle = '#1b130d'; x.stroke();
  x.font = 'bold italic 52px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 9; x.strokeText(word, 0, 3); x.fillStyle = fill; x.fillText(word, 0, 3);
  return new THREE.CanvasTexture(c);
}

export function makeCar() {
  const g = new THREE.Group(), red = toon(0xb8352a), inkM = toon(0x1b130d, { rim: 0 }), chrome = toon(0xd9d2bf), glass = toon(0x2d4a48, { rim: 0 });
  const body = m(BOX, red, 0, 0.95, 0, 3.6, 0.8, 1.9); body.material = toon(0xb8352a, { rim: 0 }); g.add(body);
  g.add(m(BOX, toon(0xb8352a, { rim: 0 }), -0.3, 1.75, 0, 1.9, 0.85, 1.7));
  g.add(m(BOX, glass, 0.2, 1.8, 0, 0.9, 0.55, 1.75));
  g.add(m(BOX, glass, -0.85, 1.8, 0, 0.6, 0.55, 1.75));
  for (const s of [-1, 1]) g.add(m(CYL, chrome, 1.9, 1.05, s * 0.6, 0.2, 0.15, 0.2)).children;
  g.children.slice(-2).forEach((o) => (o.rotation.z = Math.PI / 2));
  g.add(m(BOX, chrome, 1.85, 0.55, 0, 0.15, 0.2, 2.0));
  const wheels = [];
  for (const x of [-1.2, 1.2]) for (const z of [-0.95, 0.95]) {
    const w = new THREE.Group(); w.position.set(x, 0.5, z);
    const t = m(CYL, inkM, 0, 0, 0, 0.5, 0.3, 0.5); t.rotation.x = Math.PI / 2; w.add(t);
    const hub = m(CYL, chrome, 0, 0, z > 0 ? 0.16 : -0.16, 0.26, 0.05, 0.26); hub.rotation.x = Math.PI / 2; w.add(hub);
    w.add(m(BOX, inkM, 0, 0, z > 0 ? 0.19 : -0.19, 0.42, 0.06, 0.04));
    g.add(w); wheels.push(w);
  }
  for (const x of [-1.2, 1.2]) g.add(m(SPH, red, x, 0.85, 0.95, 0.75, 0.4, 0.14), m(SPH, red, x, 0.85, -0.95, 0.75, 0.4, 0.14));
  return { g, wheels };
}
