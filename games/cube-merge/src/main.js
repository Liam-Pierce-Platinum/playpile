// CUBE MERGE - number-cube snakes in a crystal arena. Eat cubes <= your head, equal pairs merge.
import * as THREE from '../vendor/three.module.js';

const Q = new URLSearchParams(location.search);
const MUTE = Q.has('mute');
const R = 58, MAXI = 900;
const lg = (v) => Math.log2(v);
const size = (v) => 0.9 + 0.13 * lg(v);
const hueOf = (v) => (lg(v) * 0.618 + 0.52) % 1;
const rnd = (a, b) => a + Math.random() * (b - a);
let store = {}; try { store = JSON.parse(localStorage.getItem('cubemerge') || '{}'); } catch (e) {}
const save = () => { try { localStorage.setItem('cubemerge', JSON.stringify(store)); } catch (e) {} };

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
const cam = new THREE.PerspectiveCamera(50, 1, 0.5, 600);
const U = { uTime: { value: 0 } };

const GLSL = `
vec3 hsv(float h,float s,float v){vec3 k=clamp(abs(mod(h*6.+vec3(0.,4.,2.),6.)-3.)-1.,0.,1.);return v*mix(vec3(1.),k,s);}
float h31(vec3 p){return fract(sin(dot(p,vec3(12.9898,78.233,37.719)))*43758.5453);}
vec3 env(vec3 d){
  float y=d.y;
  vec3 c=mix(vec3(0.015,0.01,0.04),vec3(0.16,0.07,0.32),smoothstep(-0.3,0.9,y));
  c+=vec3(0.05,0.18,0.3)*smoothstep(0.2,-0.2,abs(y-0.12));
  c+=vec3(1.,0.92,0.85)*pow(max(dot(d,normalize(vec3(0.45,0.75,0.35))),0.),60.)*6.;
  c+=vec3(0.5,0.8,1.)*pow(max(dot(d,normalize(vec3(-0.6,0.5,-0.4))),0.),30.)*2.5;
  float strip=smoothstep(0.93,1.,sin(d.x*7.+d.y*3.)*sin(d.z*7.-d.y*4.));
  c+=vec3(0.9,0.7,1.)*strip*1.4;
  return c;}`;

// sky dome
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: U,
  vertexShader: `varying vec3 vD;void main(){vD=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: GLSL + `varying vec3 vD;uniform float uTime;void main(){vec3 d=normalize(vD);vec3 c=env(d)*0.55;
    vec3 g=floor(d*180.);float s=h31(g);c+=vec3(0.8,0.85,1.)*step(0.996,s)*(0.6+0.4*sin(uTime*3.+s*60.));gl_FragColor=vec4(c,1.);}`,
})));

// crystal floor
const floor = new THREE.Mesh(new THREE.CircleGeometry(R + 30, 96), new THREE.ShaderMaterial({
  uniforms: Object.assign({ uR: { value: R } }, U),
  vertexShader: `varying vec3 vW;void main(){vec4 w=modelMatrix*vec4(position,1.);vW=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: GLSL + `varying vec3 vW;uniform float uR,uTime;
  vec2 h2(vec2 p){p=vec2(dot(p,vec2(127.1,311.7)),dot(p,vec2(269.5,183.3)));return fract(sin(p)*43758.5453);}
  void main(){
    vec2 p=vW.xz*0.38; vec2 ip=floor(p),fp=fract(p); float f1=8.,f2=8.; vec2 id=vec2(0.);
    for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 g=vec2(i,j);vec2 o=h2(ip+g);vec2 r=g+o-fp;float d=dot(r,r);
      if(d<f1){f2=f1;f1=d;id=ip+g;}else if(d<f2)f2=d;}
    float e=sqrt(f2)-sqrt(f1); float hh=h2(id).x;
    vec3 n=normalize(vec3((h2(id+7.).x-.5)*0.6,1.,(h2(id+3.).y-.5)*0.6));
    vec3 V=normalize(vW-cameraPosition); vec3 Rf=reflect(V,n);
    float fres=0.04+0.96*pow(1.-max(dot(-V,n),0.),5.);
    vec3 c=hsv(0.68+hh*0.25,0.6,0.05)+env(Rf)*(0.12+fres*0.5);
    c+=hsv(0.5+hh*0.4,0.7,1.)*smoothstep(0.06,0.0,e)*(0.22+0.15*sin(uTime*1.5+hh*40.));
    float r=length(vW.xz);
    c+=vec3(0.5,0.9,1.)*smoothstep(1.4,0.,abs(r-uR))*1.6;
    c*=mix(1.,0.18,smoothstep(uR,uR+4.,r));
    gl_FragColor=vec4(c,1.);}`,
}));
floor.rotation.x = -Math.PI / 2; scene.add(floor);

// gem geometry: chamfered faceted cube
function gemGeo() {
  const g = new THREE.BoxGeometry(1, 1, 1, 2, 2, 2), p = g.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i); const l1 = Math.abs(v.x) + Math.abs(v.y) + Math.abs(v.z);
    if (l1 > 1.12) v.multiplyScalar(1.12 / l1);
    if (Math.abs(v.y) > 0.49 && Math.abs(v.x) < 0.01 && Math.abs(v.z) < 0.01) v.y *= 0.9; // table dip
    p.setXYZ(i, v.x, v.y, v.z);
  }
  const n = g.toNonIndexed(); n.computeVertexNormals(); return n;
}
const gemMat = new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `attribute float aHue;attribute float aGlow;varying vec3 vW,vN;varying float vHue,vGlow;
    void main(){mat4 m=modelMatrix*instanceMatrix;vec4 w=m*vec4(position,1.);vW=w.xyz;vN=normalize(mat3(m)*normal);vHue=aHue;vGlow=aGlow;
    gl_Position=projectionMatrix*viewMatrix*w;}`,
  fragmentShader: GLSL + `varying vec3 vW,vN;varying float vHue,vGlow;uniform float uTime;
    void main(){
      vec3 N=normalize(vN),V=normalize(vW-cameraPosition);
      vec3 tint=hsv(vHue,0.75,1.);
      float fh=h31(floor(N*7.+0.5)+floor(vHue*20.));
      vec3 Ni=normalize(N+vec3(fh-.5,fract(fh*7.)-.5,fract(fh*13.)-.5)*0.9);
      vec3 rr=reflect(refract(V,N,1./2.30),-Ni),rg=reflect(refract(V,N,1./2.40),-Ni),rb=reflect(refract(V,N,1./2.52),-Ni);
      vec3 refr=vec3(env(rr).r,env(rg).g,env(rb).b);
      float fres=0.06+0.94*pow(1.-max(dot(-V,N),0.),4.);
      vec3 c=refr*tint*2.6+tint*(0.3+0.25*max(N.y,0.))+env(reflect(V,N))*fres*1.2;
      c+=vec3(1.)*pow(max(sin(uTime*2.+fh*50.),0.),40.)*0.8*step(0.5,fh);
      c+=tint*vGlow*1.6+vec3(1.)*vGlow*vGlow*0.6;
      gl_FragColor=vec4(c,1.);}`,
});
const gemGeom = gemGeo();
const aHue = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
const aGlow = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
gemGeom.setAttribute('aHue', aHue); gemGeom.setAttribute('aGlow', aGlow);
const gems = new THREE.InstancedMesh(gemGeom, gemMat, MAXI); gems.frustumCulled = false; scene.add(gems);

// number atlas labels
const ATL = document.createElement('canvas'); ATL.width = 1024; ATL.height = 512;
{ const x = ATL.getContext('2d'); x.textAlign = 'center'; x.textBaseline = 'middle';
  for (let k = 1; k <= 32; k++) { const v = 2 ** k, cx = ((k - 1) % 8) * 128 + 64, cy = Math.floor((k - 1) / 8) * 128 + 64;
    const s = v >= 1e6 ? (v / 1048576).toFixed(0) + 'M' : v >= 1e4 ? Math.round(v / 1024) + 'K' : '' + v;
    x.font = `900 ${s.length > 3 ? 40 : 54}px Trebuchet MS, sans-serif`; x.lineWidth = 9; x.strokeStyle = '#120626';
    x.strokeText(s, cx, cy); x.fillStyle = '#fff'; x.fillText(s, cx, cy); } }
const atlasTex = new THREE.CanvasTexture(ATL); atlasTex.colorSpace = THREE.SRGBColorSpace;
const lblGeo = new THREE.PlaneGeometry(1, 1); const aTile = new THREE.InstancedBufferAttribute(new Float32Array(MAXI), 1);
lblGeo.setAttribute('aTile', aTile);
const labels = new THREE.InstancedMesh(lblGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { map: { value: atlasTex } },
  vertexShader: `attribute float aTile;varying vec2 vUv;void main(){vec3 c=(modelMatrix*instanceMatrix*vec4(0.,0.,0.,1.)).xyz;float s=length(instanceMatrix[0].xyz);
    vec3 r=vec3(viewMatrix[0][0],viewMatrix[1][0],viewMatrix[2][0]),u=vec3(viewMatrix[0][1],viewMatrix[1][1],viewMatrix[2][1]);
    vec3 w=c+(r*position.x+u*position.y)*s;float t=aTile;vUv=(vec2(mod(t,8.),3.-floor(t/8.))+uv)/vec2(8.,4.);gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
  fragmentShader: `uniform sampler2D map;varying vec2 vUv;void main(){vec4 t=texture2D(map,vUv);if(t.a<0.05)discard;gl_FragColor=t;}`,
}), MAXI); labels.frustumCulled = false; labels.renderOrder = 2; scene.add(labels);

// shard particles
const PN = 1200, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pLife = new Float32Array(PN), pVel = new Float32Array(PN * 3);
const pGeo = new THREE.BufferGeometry(); pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('life', new THREE.BufferAttribute(pLife, 1));
const parts = new THREE.Points(pGeo, new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
  vertexShader: `attribute float life;varying vec3 vC;varying float vL;void main(){vC=color;vL=life;vec4 mv=modelViewMatrix*vec4(position,1.);gl_PointSize=life>0.?(18.+30.*life)*(30./-mv.z):0.;gl_Position=projectionMatrix*mv;}`,
  fragmentShader: `varying vec3 vC;varying float vL;void main(){vec2 p=abs(gl_PointCoord-.5)*2.;float s=max(1.-(p.x*6.+p.y),0.)+max(1.-(p.y*6.+p.x),0.);s+=max(1.-length(p)*2.,0.)*0.5;gl_FragColor=vec4(vC*s*vL,1.);}`,
})); parts.frustumCulled = false; scene.add(parts);
let pI = 0; const tmpC = new THREE.Color();
function burst(x, y, z, v, n = 16, sp = 7) {
  tmpC.setHSL(hueOf(v), 0.9, 0.65);
  for (let i = 0; i < n; i++) { const k = pI++ % PN; pPos.set([x, y, z], k * 3); pCol.set([tmpC.r, tmpC.g, tmpC.b], k * 3); pLife[k] = 1;
    const a = Math.random() * 6.283, u = rnd(0.2, 1); pVel.set([Math.cos(a) * sp * u, rnd(4, 11), Math.sin(a) * sp * u], k * 3); }
}

// ---------- audio ----------
let AC = null;
function tone(f, d = 0.12, type = 'triangle', vol = 0.15, slide = 0) {
  if (MUTE || !AC) return; const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f * slide), t + d);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + d); o.connect(g).connect(AC.destination); o.start(t); o.stop(t + d + 0.02);
}
const sfx = {
  eat: () => tone(880 + Math.random() * 200, 0.06, 'sine', 0.07),
  merge: (v) => { const f = 220 * 2 ** (lg(v) / 5); tone(f, 0.25, 'triangle', 0.16); tone(f * 1.5, 0.3, 'sine', 0.08); tone(f * 4, 0.12, 'sine', 0.04); },
  bump: () => tone(140, 0.1, 'square', 0.05, 0.6),
  kill: () => { tone(330, 0.15, 'sawtooth', 0.08, 2); tone(660, 0.4, 'triangle', 0.12, 1.5); },
  die: () => tone(300, 0.9, 'sawtooth', 0.15, 0.1),
  level: () => [0, 4, 7, 12].forEach((s, i) => setTimeout(() => tone(330 * 2 ** (s / 12), 0.5, 'triangle', 0.12), i * 90)),
};
function initAudio() { if (!AC && !MUTE) try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} if (AC && AC.state === 'suspended') AC.resume(); }

// ---------- game state ----------
const NAMES = ['Quartzy', 'Opaline', 'Bismuth', 'Garnet', 'Peridot', 'Topaz Tom', 'Lapis', 'Jasper', 'Onyx', 'Beryl', 'Zircon', 'Iolite'];
const G = { state: 'play', t: 0, level: 1, score: 0, snakes: [], loose: [], me: null, auto: false, shake: 0, kills: 0 };
window.__G = G;
const target = () => 2 ** (6 + G.level);

class Snake {
  constructor(name, bot, x, z, vals) {
    this.name = name; this.bot = bot; this.x = x; this.z = z; this.a = Math.random() * 6.283; this.ta = this.a;
    this.segs = vals.map((v) => ({ v, pop: 0, x, z })); this.trail = [{ x, z }]; this.alive = true; this.boost = 1; this.boosting = false;
    this.think = 0; this.bump = 0; this.shield = bot ? 0 : 3; this.aggro = 0.3;
  }
  get head() { return this.segs[0].v; }
  get total() { return this.segs.reduce((s, q) => s + q.v, 0); }
  add(v) {
    this.segs.push({ v, pop: 0.6, x: this.x, z: this.z });
    this.segs.sort((a, b) => b.v - a.v);
    let merged = true;
    while (merged) { merged = false;
      for (let i = 0; i < this.segs.length - 1; i++) if (this.segs[i].v === this.segs[i + 1].v) {
        const s = this.segs[i]; s.v *= 2; s.pop = 1; this.segs.splice(i + 1, 1); merged = true;
        this.segs.sort((a, b) => b.v - a.v); onMerge(this, s); break; } }
  }
}
function onMerge(sn, s) {
  if (sn !== G.me) return;
  burst(s.x, size(s.v), s.z, s.v, 22, 9); sfx.merge(s.v); G.shake = Math.min(1, G.shake + 0.15 + lg(s.v) * 0.02); popText(s.x, s.z, s.v, hueOf(s.v));
}
function spawnLoose(x, z, v) { G.loose.push({ x: x ?? rnd(-1, 1) * R * 0.95, z: z ?? rnd(-1, 1) * R * 0.95, v, spin: Math.random() * 6, vx: 0, vz: 0 }); }
function looseValue() { const r = Math.random(), b = Math.max(1, G.level - 2); return 2 ** (b + (r < 0.5 ? 0 : r < 0.8 ? 1 : r < 0.95 ? 2 : 3)); }
function fillLoose() { while (G.loose.length < 150) { let x, z; do { x = rnd(-R, R); z = rnd(-R, R); } while (x * x + z * z > R * R * 0.9); spawnLoose(x, z, looseValue()); } }
function randSpot() { const a = Math.random() * 6.283, r = rnd(10, R - 8); return [Math.cos(a) * r, Math.sin(a) * r]; }
function botVals() { const top = Math.max(1, Math.floor(rnd(G.level, G.level + 3.5))); const out = [2 ** top]; for (let k = top - 1; k >= 1; k--) if (Math.random() < 0.55) out.push(2 ** k); return out; }
function spawnBot(name) { const [x, z] = randSpot(); const b = new Snake(name, true, x, z, botVals()); b.aggro = Math.min(0.9, 0.25 + G.level * 0.1); G.snakes.push(b); return b; }

function startRun(lvl) {
  G.level = lvl; G.state = 'play'; G.score = 0; G.kills = 0; G.loose = []; G.snakes = []; G.t0 = G.t; G.bestHead = 2;
  G.me = new Snake('YOU', false, 0, 0, [2 ** Math.max(1, lvl)]); G.snakes.push(G.me);
  for (let i = 0; i < 9; i++) spawnBot(NAMES[i]);
  fillLoose(); over.classList.add('hide'); updHud();
}
function killSnake(s, by) {
  s.alive = false;
  for (const q of s.segs) { spawnLoose(q.x + rnd(-1, 1), q.z + rnd(-1, 1), q.v); if (by === G.me || s === G.me) burst(q.x, 1, q.z, q.v, 8, 6); }
  if (s === G.me) { sfx.die(); G.shake = 1; endRun(by); }
  else { if (by === G.me) { G.kills++; sfx.kill(); G.shake = 0.6; popText(s.x, s.z, 'KO ' + s.name, 0.0); }
    setTimeout(() => { G.snakes = G.snakes.filter((q) => q !== s); if (G.state === 'play') spawnBot(s.name); }, 2500); }
}
function endRun(by) {
  G.state = 'dead';
  store.best = Math.max(store.best || 0, G.score); store.bestHead = Math.max(store.bestHead || 0, G.bestHead); save();
  setTimeout(() => showCard('SHATTERED', `${by ? 'Crushed by ' + by.name + ' (' + by.head + ')' : ''}\nScore ${G.score} · best cube ${G.bestHead} · KOs ${G.kills}\nBest ever ${store.best} · unlocked level ${store.unlock || 1}`, 'AGAIN'), 900);
}

// ---------- AI ----------
function aiThink(s) {
  let best = null, bd = 1e9;
  for (const c of G.loose) { if (c.v > s.head) continue; const d = (c.x - s.x) ** 2 + (c.z - s.z) ** 2 - c.v * 3; if (d < bd) { bd = d; best = c; } }
  let tx = best ? best.x : 0, tz = best ? best.z : 0; s.boosting = false;
  for (const o of G.snakes) { if (o === s || !o.alive) continue; const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (o.head > s.head && d < 9) { tx = s.x - (o.x - s.x); tz = s.z - (o.z - s.z); s.boosting = true; break; }
    if (o.head < s.head && d < 14 && Math.random() < s.aggro) { tx = o.x + Math.cos(o.a) * 3; tz = o.z + Math.sin(o.a) * 3; s.boosting = d < 8; } }
  if (Math.hypot(s.x, s.z) > R - 7) { tx = 0; tz = 0; }
  s.ta = Math.atan2(tz - s.z, tx - s.x);
}

// ---------- simulation ----------
function step(dt) {
  G.t += dt; if (G.state !== 'play') { stepFx(dt); return; }
  for (const s of G.snakes) {
    if (!s.alive) continue;
    if (s.bot || G.auto) { s.think -= dt; if (s.think <= 0) { s.think = 0.2 + Math.random() * 0.15; aiThink(s); } }
    let da = ((s.ta - s.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI; const tr = 3.6 * dt; s.a += Math.max(-tr, Math.min(tr, da));
    const boosting = s.boosting && s.boost > 0.05; s.boost = Math.max(0, Math.min(1, s.boost + (boosting ? -0.5 : 0.18) * dt));
    const sp = (boosting ? 16 : 9.5) * (s.bump > 0 ? 0.4 : 1); s.bump -= dt; s.shield -= dt;
    s.x += Math.cos(s.a) * sp * dt; s.z += Math.sin(s.a) * sp * dt;
    const r = Math.hypot(s.x, s.z); if (r > R - 0.5) { s.x *= (R - 0.5) / r; s.z *= (R - 0.5) / r; s.a += Math.PI * 0.6; s.ta = s.a; }
    const last = s.trail[0]; if ((last.x - s.x) ** 2 + (last.z - s.z) ** 2 > 0.04) { s.trail.unshift({ x: s.x, z: s.z }); if (s.trail.length > 1600) s.trail.pop(); }
    // place segments along trail
    let need = 0, ti = 0, acc = 0, px = s.x, pz = s.z;
    s.segs[0].x = s.x; s.segs[0].z = s.z;
    for (let i = 1; i < s.segs.length; i++) {
      need += (size(s.segs[i - 1].v) + size(s.segs[i].v)) * 0.52;
      while (ti < s.trail.length - 1) { const a = s.trail[ti], b = s.trail[ti + 1], d = Math.hypot(b.x - a.x, b.z - a.z);
        if (acc + d >= need) { const f = (need - acc) / d; px = a.x + (b.x - a.x) * f; pz = a.z + (b.z - a.z) * f; break; } acc += d; ti++; px = b.x; pz = b.z; }
      const q = s.segs[i]; q.x += (px - q.x) * Math.min(1, dt * 20); q.z += (pz - q.z) * Math.min(1, dt * 20);
    }
    for (const q of s.segs) q.pop = Math.max(0, q.pop - dt * 2.5);
  }
  // collisions: heads vs loose
  for (const s of G.snakes) { if (!s.alive) continue; const hr = size(s.head) * 0.55;
    for (let i = G.loose.length - 1; i >= 0; i--) { const c = G.loose[i], rr = hr + size(c.v) * 0.5, dx = c.x - s.x, dz = c.z - s.z;
      if (dx * dx + dz * dz < rr * rr) {
        if (c.v <= s.head) { G.loose.splice(i, 1); s.add(c.v); if (s === G.me) { sfx.eat(); G.score += c.v; burst(c.x, 0.6, c.z, c.v, 5, 3); } }
        else { const d = Math.hypot(dx, dz) || 1; c.vx = dx / d * 6; c.vz = dz / d * 6; if (s === G.me && s.bump <= 0) sfx.bump(); s.bump = 0.25; } } } }
  // heads vs other snakes
  for (const s of G.snakes) { if (!s.alive) continue; const hr = size(s.head) * 0.55;
    for (const o of G.snakes) { if (o === s || !o.alive || !s.alive) continue;
      for (let j = 0; j < o.segs.length; j++) { const q = o.segs[j], rr = hr + size(q.v) * 0.5;
        if ((q.x - s.x) ** 2 + (q.z - s.z) ** 2 > rr * rr) continue;
        if (j === 0) { if (s.head > o.head && !(o.shield > 0)) killSnake(o, s); else if (s.head < o.head && !(s.shield > 0)) killSnake(s, o); else { s.a += 2.5; o.a -= 2.5; s.ta = s.a; o.ta = o.a; } }
        else if (s.head >= q.v) { const cut = o.segs.splice(j); s.add(cut[0].v); if (s === G.me) { G.score += cut[0].v; sfx.kill(); }
          for (const c of cut.slice(1)) spawnLoose(c.x, c.z, c.v); }
        else { s.a += Math.PI * 0.7; s.ta = s.a; s.bump = 0.3; if (s === G.me) sfx.bump(); }
        break; } } }
  for (const c of G.loose) { c.x += c.vx * dt; c.z += c.vz * dt; c.vx *= 0.9; c.vz *= 0.9; c.spin += dt * 0.6; }
  fillLoose();
  const me = G.me; if (me.alive) { G.bestHead = Math.max(G.bestHead, me.head);
    if (me.head >= target()) { G.level++; store.unlock = Math.max(store.unlock || 1, G.level); save(); sfx.level(); banner('LEVEL ' + G.level + ' · CRYSTAL x' + target());
      for (const b of G.snakes) if (b.bot) { b.aggro = Math.min(0.9, 0.25 + G.level * 0.1); if (b.head < me.head / 4) b.add(me.head / 4); } } }
  stepFx(dt);
}
function stepFx(dt) {
  for (let k = 0; k < PN; k++) if (pLife[k] > 0) { pLife[k] -= dt * 1.3; pVel[k * 3 + 1] -= 22 * dt;
    pPos[k * 3] += pVel[k * 3] * dt; pPos[k * 3 + 1] = Math.max(0.05, pPos[k * 3 + 1] + pVel[k * 3 + 1] * dt); pPos[k * 3 + 2] += pVel[k * 3 + 2] * dt; }
  G.shake = Math.max(0, G.shake - dt * 2.2);
}
G.fast = (sec) => { for (let i = 0; i < sec * 30; i++) step(1 / 30); };

// ---------- render ----------
const M = new THREE.Matrix4(), P = new THREE.Vector3(), Sc = new THREE.Vector3(), Qt = new THREE.Quaternion(), E = new THREE.Euler(), M2 = new THREE.Matrix4();
let camX = 0, camZ = 0, camH = 14;
function draw() {
  let n = 0;
  const put = (x, z, v, rotY, rotX, glow, pop) => { if (n >= MAXI) return; const s = size(v) * (1 + pop * 0.45);
    P.set(x, s * 0.5 + 0.05 + Math.sin(G.t * 2 + x) * 0.04, z); E.set(rotX, rotY, 0); Qt.setFromEuler(E); Sc.set(s, s, s); M.compose(P, Qt, Sc); gems.setMatrixAt(n, M);
    aHue.array[n] = hueOf(v); aGlow.array[n] = glow + pop * 0.8;
    P.y = s + 0.35 + 0.15 * s; Qt.identity(); const ls = 0.55 + 0.25 * s; Sc.set(ls, ls, ls); M2.compose(P, Qt, Sc); labels.setMatrixAt(n, M2); aTile.array[n] = lg(v) - 1; n++; };
  for (const c of G.loose) put(c.x, c.z, c.v, c.spin, 0, c.v > (G.me ? G.me.head : 2) ? 0 : 0.12, 0);
  for (const s of G.snakes) if (s.alive) s.segs.forEach((q, i) => put(q.x, q.z, q.v, -s.a, 0, (i === 0 ? 0.35 + 0.25 * Math.sin(G.t * 6) : 0.05) + (s.shield > 0 ? 0.5 + 0.5 * Math.sin(G.t * 20) : 0), q.pop));
  gems.count = n; labels.count = n;
  gems.instanceMatrix.needsUpdate = labels.instanceMatrix.needsUpdate = aHue.needsUpdate = aGlow.needsUpdate = aTile.needsUpdate = true;
  pGeo.attributes.position.needsUpdate = pGeo.attributes.life.needsUpdate = pGeo.attributes.color.needsUpdate = true;
  const me = G.me; if (me) { const k = 0.08; camX += (me.x - camX) * k; camZ += (me.z - camZ) * k; camH += ((12 + me.segs.length * 0.4 + size(me.head) * 2.2) - camH) * 0.03; }
  const sh = G.shake * G.shake * 0.8;
  cam.position.set(camX + rnd(-sh, sh), camH, camZ + camH * 0.8 + rnd(-sh, sh)); cam.lookAt(camX, 0, camZ);
  U.uTime.value = G.t; renderer.render(scene, cam);
}

// ---------- HUD ----------
const $ = (id) => document.getElementById(id), over = $('over');
let hudT = 0;
function updHud() {
  if (!G.me) return; $('score').textContent = 'SCORE ' + G.score; $('head').textContent = G.me.head;
  $('lvl').textContent = `LEVEL ${G.level} · reach ${target()}`; $('bar').firstChild.style.width = Math.min(100, (lg(G.me.head) / lg(target())) * 100) + '%';
  const top = G.snakes.filter((s) => s.alive).sort((a, b) => b.total - a.total).slice(0, 6);
  $('board').innerHTML = top.map((s, i) => `<li class="${s === G.me ? 'me' : ''}"><span>${i + 1}. ${s.name}</span><b>${s.head}</b></li>`).join('');
}
function popText(x, z, txt, hue) {
  const v = new THREE.Vector3(x, 2, z).project(cam); if (v.z > 1) return;
  const d = document.createElement('div'); d.className = 'pop'; d.textContent = typeof txt === 'number' ? txt + '!' : txt;
  d.style.color = `hsl(${hue * 360},100%,75%)`; d.style.left = (v.x * 0.5 + 0.5) * innerWidth + 'px'; d.style.top = (-v.y * 0.5 + 0.5) * innerHeight + 'px';
  $('pops').appendChild(d); setTimeout(() => d.remove(), 900);
}
let banT; function banner(t) { const b = $('banner'); b.textContent = t; b.classList.add('on'); clearTimeout(banT); banT = setTimeout(() => b.classList.remove('on'), 1800); }
function showCard(title, text, btn) { $('otitle').textContent = title; $('otext').textContent = text; $('go').textContent = btn; over.classList.remove('hide'); }
$('go').addEventListener('click', (e) => { e.stopPropagation(); initAudio(); startRun(G.state === 'dead' ? (store.unlock > 1 ? Math.max(1, store.unlock - 1) : 1) : 1); });

// ---------- input ----------
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
let ptr = null, keys = {};
function aimAt(cx, cy) { ndc.set(cx / innerWidth * 2 - 1, -cy / innerHeight * 2 + 1); ray.setFromCamera(ndc, cam);
  if (ray.ray.intersectPlane(plane, hit) && G.me) G.me.ta = Math.atan2(hit.z - G.me.z, hit.x - G.me.x); }
canvas.addEventListener('pointermove', (e) => { ptr = [e.clientX, e.clientY]; });
canvas.addEventListener('pointerdown', (e) => { initAudio(); ptr = [e.clientX, e.clientY]; if (e.pointerType === 'mouse' && G.me) G.me.boosting = true; else document.body.classList.add('touch'); });
addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse' && G.me) G.me.boosting = false; });
const bb = $('boost');
bb.addEventListener('pointerdown', (e) => { e.stopPropagation(); initAudio(); if (G.me) G.me.boosting = true; });
bb.addEventListener('pointerup', () => { if (G.me) G.me.boosting = false; });
addEventListener('keydown', (e) => { keys[e.code] = true; initAudio(); if (e.code === 'Space') { if (G.state === 'dead' && !over.classList.contains('hide')) $('go').click(); else if (G.me) G.me.boosting = true; } if (e.code === 'Enter' && !over.classList.contains('hide')) $('go').click(); });
addEventListener('keyup', (e) => { keys[e.code] = false; if (e.code === 'Space' && G.me) G.me.boosting = false; });
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.me && G.me.alive && G.state === 'play' && !G.auto) {
    const turn = (keys.KeyA || keys.ArrowLeft ? -1 : 0) + (keys.KeyD || keys.ArrowRight ? 1 : 0);
    if (turn) { G.me.ta = G.me.a + turn * 1.2; ptr = null; } else if (ptr) aimAt(ptr[0], ptr[1]);
  }
  step(dt); draw(); hudT -= dt; if (hudT <= 0) { hudT = 0.2; updHud(); }
  requestAnimationFrame(frame);
}
G.draw = draw; G.startRun = startRun; G.killSnake = killSnake;
startRun(1);
if (Q.has('title')) { G.state = 'title'; showCard('CUBE MERGE', 'Grow a snake of living gemstones.\nEat cubes up to your head\'s value - equal pairs fuse into bigger crystals.\nBite smaller snakes, dodge bigger heads.', 'PLAY'); }
requestAnimationFrame(frame);
