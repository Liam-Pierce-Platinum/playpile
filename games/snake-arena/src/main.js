// SNAKE ARENA - bioluminescent snake brawl in a dark sea. three.js, no build step.
import * as THREE from '../vendor/three.module.js';

const Q = new URLSearchParams(location.search);
const AUTO = Q.has('auto'), MUTE = Q.has('mute');
const R = 120, CELL = 3, OFF = R + 12, GN = Math.ceil((2 * OFF) / CELL);
const MAXSEG = 9000, MAXO = 2600, AMBIENT = 750, NBOTS = 24, MAXP = 1200;
const TAU = Math.PI * 2;
const rnd = (a = 1, b) => (b === undefined ? Math.random() * a : a + Math.random() * (b - a));
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const wrapA = (a) => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
const $ = (id) => document.getElementById(id);

// ---------- progression ----------
const save = { best: 0, pearls: 0, skin: 0, runs: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem('snake_arena_v1')) || {}); } catch (e) {}
const persist = () => { try { localStorage.setItem('snake_arena_v1', JSON.stringify(save)); } catch (e) {} };
const SKINS = [
  { name: 'Lantern Eel', c: ['#3ff6ff', '#1a8cff'], need: 0 },
  { name: 'Coral Ribbon', c: ['#ff3fd2', '#ff8a3f'], need: 50 },
  { name: 'Toxin Worm', c: ['#b6ff3f', '#2fff9a'], need: 150 },
  { name: 'Ember Siphon', c: ['#ffb03f', '#ff3f3f'], need: 350 },
  { name: 'Void Violet', c: ['#a46bff', '#ff6bf0'], need: 700 },
  { name: 'Prism Leviathan', c: ['#ffffff', '#ffffff'], need: 1200, prism: true },
];
const RANKS = [['Plankton', 0], ['Krill', 50], ['Shrimp', 150], ['Eel', 350], ['Anglerfish', 700], ['Siphonophore', 1200], ['Leviathan', 2000]];
const rankOf = (p) => { let i = 0; while (i + 1 < RANKS.length && p >= RANKS[i + 1][1]) i++; return i; };
const SYL = ['lu', 'mi', 'na', 'ab', 'ys', 'cor', 'al', 'fin', 'glo', 'vel', 'ra', 'thy', 'ka', 'zo', 'nem', 'ia', 'tor', 'ul', 'dre', 'sha'];
const NOUN = ['Lantern', 'Drifter', 'Ribbon', 'Siphon', 'Gulper', 'Wisp', 'Hatchet', 'Viper', 'Jelly', 'Comb', 'Abyss', 'Tide'];
const botName = () => { const s = SYL[rnd(20) | 0] + SYL[rnd(20) | 0]; return Math.random() < 0.5 ? s[0].toUpperCase() + s.slice(1) : NOUN[rnd(12) | 0] + ' ' + s; };

// ---------- audio ----------
let AC = null, master = null, boostGain = null;
function audio() {
  if (MUTE) return null;
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      master = AC.createGain(); master.gain.value = 0.55; master.connect(AC.destination);
      // ambient drone
      const lp = AC.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 320; lp.connect(master);
      const dg = AC.createGain(); dg.gain.value = 0.05; dg.connect(lp);
      for (const f of [55, 82.4, 55.4]) { const o = AC.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(dg); o.start(); }
      // boost hiss
      const buf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const ns = AC.createBufferSource(); ns.buffer = buf; ns.loop = true;
      const bp = AC.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
      boostGain = AC.createGain(); boostGain.gain.value = 0; ns.connect(bp); bp.connect(boostGain); boostGain.connect(master); ns.start();
      audio.noise = buf;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function blip(f, dur, type = 'sine', vol = 0.1, slide = 1) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * slide, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
}
function boom(vol = 0.35) {
  if (!AC || AC.state !== 'running') return;
  const t = AC.currentTime, s = AC.createBufferSource(), f = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = audio.noise; f.type = 'lowpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(80, t + 0.8);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  s.connect(f); f.connect(g); g.connect(master); s.start(t); s.stop(t + 1);
  blip(120, 0.9, 'sine', vol * 0.8, 0.3);
}
const sfx = {
  eat: (c) => blip(520 * Math.pow(1.06, Math.min(c, 24)), 0.07, 'sine', 0.06, 1.6),
  kill: () => { blip(660, 0.25, 'triangle', 0.12, 1.5); setTimeout(() => blip(990, 0.3, 'triangle', 0.1, 1.5), 70); },
  level: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, 0.35, 'sine', 0.08), i * 80)),
  die: () => boom(0.4),
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.setClearColor(0x000206);
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.5, 900);
const U = { uTime: { value: 0 }, uScale: { value: 1 }, uHead: { value: new THREE.Vector3(0, 12, 0) }, uR: { value: R } };
function resize() {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  U.uScale.value = (innerHeight * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
}
addEventListener('resize', resize); resize();

// water: animated caustics, drifting murk, a light pool around the player, a pulsing boundary
const water = new THREE.Mesh(new THREE.PlaneGeometry(760, 760), new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying vec3 vW; uniform float uTime; uniform vec3 uHead; uniform float uR;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
  float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.03;a*=.5;}return s;}
  float caust(vec2 uv,float t){ vec2 p=mod(uv*6.2831,6.2831)-250.; vec2 i=p; float c=1.; float k=.005;
    for(int n=0;n<4;n++){ float tt=t*(1.-(3.5/float(n+1))); i=p+vec2(cos(tt-i.x)+sin(tt+i.y),sin(tt-i.y)+cos(tt+i.x));
      c+=1./length(vec2(p.x/(sin(i.x+tt)/k),p.y/(cos(i.y+tt)/k))); }
    c/=4.; c=1.17-pow(c,1.4); return clamp(pow(abs(c),8.),0.,3.); }
  void main(){ vec2 w=vW.xz; float d=length(w); float t=uTime;
    float n=fbm(w*.022+vec2(t*.02,-t*.015));
    vec3 col=mix(vec3(.002,.007,.018),vec3(.006,.035,.065),n);
    float c=caust(w*.009+n*.05,t*.35);
    col+=vec3(.02,.2,.24)*c*.55*(.3+n);
    vec2 cell=floor(w*.5); float sp=h(cell); vec2 fp=fract(w*.5)-.5;
    col+=vec3(.2,.9,1.)*smoothstep(.06,0.,length(fp))*step(.985,sp)*(.5+.5*sin(t*2.+sp*40.))*.5;
    float hd=length(w-uHead.xz); col+=vec3(.015,.1,.14)*exp(-hd*hd/(uHead.y*uHead.y*1.5));
    float e=d-uR;
    col+=vec3(.5,.04,.25)*smoothstep(uR-22.,uR,d)*.12;
    if(e>0.) col=mix(col,vec3(.02,0.,.01),clamp(e/5.,0.,1.));
    col+=vec3(1.,.18,.55)*exp(-e*e*.5)*(.75+.25*sin(atan(w.y,w.x)*60.-t*3.));
    gl_FragColor=vec4(col,1.); }`,
}));
water.rotation.x = -Math.PI / 2; scene.add(water);

// shared additive glow sprite material (orbs, body halos, particles, marine snow)
const glowMat = new THREE.ShaderMaterial({
  uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  vertexShader: `attribute float aSize; attribute vec3 aCol; varying vec3 vC; uniform float uScale;
    void main(){ vC=aCol; vec4 mv=modelViewMatrix*vec4(position,1.); gl_PointSize=aSize*uScale/-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `varying vec3 vC; void main(){ vec2 p=gl_PointCoord-.5; float d=dot(p,p)*4.; float a=exp(-d*4.)*.55+exp(-d*30.)*.9; if(a<.01) discard; gl_FragColor=vec4(vC*a,1.); }`,
});
function pool(n) {
  const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n);
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aCol', new THREE.BufferAttribute(col, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const o = new THREE.Points(g, glowMat); o.frustumCulled = false; g.setDrawRange(0, 0); scene.add(o);
  return { g, pos, col, size, n, k: 0,
    put(x, y, z, r, gg, b, s) { if (this.k >= n) return; const i = this.k++; pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; col[i * 3] = r; col[i * 3 + 1] = gg; col[i * 3 + 2] = b; size[i] = s; },
    flush() { g.setDrawRange(0, this.k); for (const a of ['position', 'aCol', 'aSize']) g.attributes[a].needsUpdate = true; this.k = 0; } };
}
const orbPts = pool(MAXO), haloPts = pool(MAXSEG), fxPts = pool(MAXP), snowPts = pool(900);

// snake bodies: one instanced translucent-jelly sphere mesh for every segment of every snake
const sphere = new THREE.SphereGeometry(1, 16, 10);
const glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(MAXSEG), 1); glowAttr.setUsage(THREE.DynamicDrawUsage);
sphere.setAttribute('aGlow', glowAttr);
const body = new THREE.InstancedMesh(sphere, new THREE.ShaderMaterial({
  uniforms: U,
  vertexShader: `attribute float aGlow; varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vG; varying float vY;
    void main(){ mat4 m=modelMatrix*instanceMatrix; vec4 wp=m*vec4(position,1.); vN=normalize(mat3(m)*normal); vV=normalize(cameraPosition-wp.xyz);
      vC=instanceColor; vG=aGlow; vY=position.y; gl_Position=projectionMatrix*viewMatrix*wp; }`,
  fragmentShader: `varying vec3 vN; varying vec3 vV; varying vec3 vC; varying float vG; varying float vY;
    void main(){ vec3 n=normalize(vN); float f=pow(1.-clamp(dot(n,normalize(vV)),0.,1.),2.2);
      float spot=smoothstep(.6,.97,vY);
      vec3 c=vC*.06+vC*f*1.5+vC*spot*(.3+vG*1.8)+vec3(.6,.9,1.)*pow(f,5.)*.25+vC*vG*.25;
      c*=.5+.5*smoothstep(-1.,.5,vY);
      gl_FragColor=vec4(c,1.); }`,
}), MAXSEG);
body.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
body.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAXSEG * 3), 3); body.instanceColor.setUsage(THREE.DynamicDrawUsage);
body.frustumCulled = false; body.count = 0; scene.add(body);

// marine snow
const snow = []; for (let i = 0; i < 900; i++) snow.push({ x: rnd(-70, 70), y: rnd(0.5, 30), z: rnd(-70, 70), s: rnd(0.08, 0.28), p: rnd(TAU) });

// ---------- world state ----------
let T = 0, state = 'title', snakes = [], player = null, uid = 0, deadT = 0, timeScale = 1, shake = 0, spawnT = 0;
const stats = { runs: 0, deaths: 0, bestMass: 0, kills: 0, eaten: 0 };
let run = { kills: 0, maxMass: 0, milestone: 0, combo: 0, comboT: 0, by: '' };
const MILES = [[50, 'GLOWING'], [120, 'LUMINOUS'], [250, 'RADIANT'], [500, 'ABYSSAL'], [1000, 'LEVIATHAN'], [2000, 'ELDER TIDE']];
const segN = (s) => Math.min(220, Math.floor(10 + s.mass * 0.55));
const rad = (s) => 0.45 + Math.sqrt(s.mass) * 0.045;
const tmpC = new THREE.Color();

function palette(skin) { const k = SKINS[skin] || SKINS[0]; return { a: new THREE.Color(k.c[0]), b: new THREE.Color(k.c[1]), prism: !!k.prism }; }
function botPal() { const h = Math.random(); return { a: new THREE.Color().setHSL(h, 1, 0.55), b: new THREE.Color().setHSL((h + 0.07) % 1, 1, 0.42), prism: Math.random() < 0.04 }; }
function mkSnake(bot, pal, name, x, z, mass) {
  const s = { id: uid++, bot, pal, name, pts: [], ang: rnd(TAU), tgt: 0, mass, alive: true, boost: false, kills: 0, ai: { t: rnd(0.2), orb: -1, hunt: null }, shield: bot ? 0.6 : 2.2, dropT: 0 };
  s.tgt = s.ang; for (let i = 0; i < 12; i++) s.pts.push({ x: x - Math.cos(s.ang) * i * 0.3, z: z - Math.sin(s.ang) * i * 0.3 });
  snakes.push(s); return s;
}
function segColor(s, i, out) {
  if (s.pal.prism) return out.setHSL((i * 0.025 + T * 0.15) % 1, 1, 0.55);
  return out.copy(((i / 3) | 0) % 2 ? s.pal.b : s.pal.a);
}

// spatial grids (linked lists in typed arrays)
const cellS = new Int32Array(GN * GN), nxtS = new Int32Array(MAXSEG), sX = new Float32Array(MAXSEG), sZ = new Float32Array(MAXSEG), sR = new Float32Array(MAXSEG), sO = new Array(MAXSEG);
const cellO = new Int32Array(GN * GN).fill(-1), nxtO = new Int32Array(MAXO); cellS.fill(-1);
const cellIx = (v) => ((v + OFF) / CELL) | 0;
function buildSegGrid() {
  cellS.fill(-1); let k = 0;
  for (const s of snakes) { if (!s.alive) continue; const r = rad(s);
    for (let i = 0; i < s.pts.length && k < MAXSEG; i++) { const p = s.pts[i], cx = cellIx(p.x), cz = cellIx(p.z); if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue;
      const c = cz * GN + cx; sX[k] = p.x; sZ[k] = p.z; sR[k] = r; sO[k] = s; nxtS[k] = cellS[c]; cellS[c] = k; k++; } }
}
function anySeg(x, z, rr, self) { // true if a segment of another snake is within rr (+its radius)
  const x0 = Math.max(0, cellIx(x - rr - 3)), x1 = Math.min(GN - 1, cellIx(x + rr + 3)), z0 = Math.max(0, cellIx(z - rr - 3)), z1 = Math.min(GN - 1, cellIx(z + rr + 3));
  for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) for (let k = cellS[cz * GN + cx]; k >= 0; k = nxtS[k]) {
    if (sO[k] === self) continue; const dx = sX[k] - x, dz = sZ[k] - z, q = rr + sR[k]; if (dx * dx + dz * dz < q * q) return sO[k]; }
  return null;
}

// orbs (struct of arrays)
const oX = new Float32Array(MAXO), oZ = new Float32Array(MAXO), oV = new Float32Array(MAXO), oP = new Float32Array(MAXO), oC = new Float32Array(MAXO * 3), oA = new Uint8Array(MAXO), oAmb = new Uint8Array(MAXO);
let ambient = 0; const free = []; for (let i = MAXO - 1; i >= 0; i--) free.push(i);
const AMB_COL = ['#3ff6ff', '#2fffc0', '#a46bff', '#ff6bd8', '#b6ff8a', '#6bb8ff'].map((c) => new THREE.Color(c));
function addOrb(x, z, v, col, amb = 0) {
  if (!free.length || x * x + z * z > (R - 1) * (R - 1)) return; const i = free.pop();
  oX[i] = x; oZ[i] = z; oV[i] = v; oP[i] = rnd(TAU); oA[i] = 1; oAmb[i] = amb; oC[i * 3] = col.r; oC[i * 3 + 1] = col.g; oC[i * 3 + 2] = col.b; if (amb) ambient++;
}
function eatOrb(i) { oA[i] = 0; if (oAmb[i]) ambient--; free.push(i); }
function spawnAmbient() { const a = rnd(TAU), d = Math.sqrt(Math.random()) * (R - 3); const big = Math.random() < 0.06; addOrb(Math.cos(a) * d, Math.sin(a) * d, big ? 4 : 1, AMB_COL[rnd(AMB_COL.length) | 0], 1); }
function buildOrbGrid() {
  cellO.fill(-1);
  for (let i = 0; i < MAXO; i++) { if (!oA[i]) continue; const cx = cellIx(oX[i]), cz = cellIx(oZ[i]); if (cx < 0 || cz < 0 || cx >= GN || cz >= GN) continue; const c = cz * GN + cx; nxtO[i] = cellO[c]; cellO[c] = i; }
}

// particles
const fx = []; for (let i = 0; i < MAXP; i++) fx.push({ l: 0 });
let fxi = 0;
function burst(x, z, col, n, sp, size = 0.5, up = 4) {
  for (let j = 0; j < n; j++) { const p = fx[fxi = (fxi + 1) % MAXP], a = rnd(TAU), v = rnd(0.3, 1) * sp;
    Object.assign(p, { x, y: 0.5, z, vx: Math.cos(a) * v, vy: rnd(0.5, 1) * up, vz: Math.sin(a) * v, l: rnd(0.5, 1.1), m: 1, r: col.r, g: col.g, b: col.b, s: size * rnd(0.6, 1.4) }); p.m = p.l; }
}

// ---------- spawning ----------
function safeSpot(minFromPlayer = 22) {
  for (let t = 0; t < 40; t++) { const a = rnd(TAU), d = Math.sqrt(Math.random()) * (R - 18), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (anySeg(x, z, 10, null)) continue; if (player && player.alive && Math.hypot(player.pts[0].x - x, player.pts[0].z - z) < minFromPlayer) continue; return [x, z]; }
  return [rnd(-40, 40), rnd(-40, 40)];
}
function spawnBot() { const [x, z] = safeSpot(); const m = Math.random() < 0.15 ? rnd(150, 420) : rnd(10, 70); mkSnake(true, botPal(), botName(), x, z, m); }

// ---------- AI ----------
function danger(s, ang, look) {
  const h = s.pts[0], r = rad(s), c = Math.cos(ang), sn = Math.sin(ang);
  for (const f of [0.3, 0.65, 1]) { const x = h.x + c * look * f, z = h.z + sn * look * f;
    if (x * x + z * z > (R - 3) * (R - 3)) return 1; if (anySeg(x, z, r + 0.9, s)) return 1; }
  return 0;
}
function think(s, dt) {
  const ai = s.ai; ai.t -= dt; if (ai.t > 0) return; ai.t = 0.07 + rnd(0.06);
  const h = s.pts[0], r = rad(s); let tx = 0, tz = 0, hunt = false;
  // hunt: cut in front of a nearby smaller-or-similar snake
  let best = null, bd = 24 * 24;
  for (const o of snakes) { if (o === s || !o.alive) continue; const dx = o.pts[0].x - h.x, dz = o.pts[0].z - h.z, d = dx * dx + dz * dz; if (d < bd && s.mass > o.mass * 0.7 && s.mass > 25) { bd = d; best = o; } }
  if (best && (ai.hunt === best || Math.random() < 0.35)) { ai.hunt = best; const lead = 5 + rad(best) * 4; tx = best.pts[0].x + Math.cos(best.ang) * lead; tz = best.pts[0].z + Math.sin(best.ang) * lead; hunt = true; }
  else {
    ai.hunt = null;
    if (ai.orb < 0 || !oA[ai.orb] || Math.random() < 0.08) { // pick the juiciest nearby orb
      let bi = -1, bs = 0; const x0 = Math.max(0, cellIx(h.x - 15)), x1 = Math.min(GN - 1, cellIx(h.x + 15)), z0 = Math.max(0, cellIx(h.z - 15)), z1 = Math.min(GN - 1, cellIx(h.z + 15));
      for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) for (let i = cellO[cz * GN + cx]; i >= 0; i = nxtO[i]) {
        const dx = oX[i] - h.x, dz = oZ[i] - h.z, ahead = dx * Math.cos(s.ang) + dz * Math.sin(s.ang) > 0 ? 1.6 : 1; const sc = (oV[i] * ahead) / (Math.sqrt(dx * dx + dz * dz) + 2); if (sc > bs) { bs = sc; bi = i; } }
      if (bi < 0) for (let t = 0; t < 20; t++) { const i = rnd(MAXO) | 0; if (oA[i]) { bi = i; break; } }
      ai.orb = bi;
    }
    if (ai.orb >= 0) { tx = oX[ai.orb]; tz = oZ[ai.orb]; }
  }
  let ta = Math.atan2(tz - h.z, tx - h.x);
  const d0 = Math.hypot(h.x, h.z); if (d0 > R - 16) ta = Math.atan2(-h.z, -h.x) + rnd(-0.5, 0.5);
  const look = 5 + r * 5 + (s.boost ? 7 : 0);
  let ba = ta, bscore = 1e9;
  for (const off of [0, 0.5, -0.5, 1.1, -1.1, 1.8, -1.8, 2.6, -2.6]) { const a = (off === 0 ? ta : s.ang + off); const sc = danger(s, a, look) * 10 + Math.abs(wrapA(a - ta)); if (sc < bscore) { bscore = sc; ba = a; } }
  s.tgt = ba;
  s.boost = bscore < 10 && ((hunt && s.mass > 20 && bd < 18 * 18) || (s.mass > 80 && Math.random() < 0.03));
}

// ---------- sim ----------
function killSnake(s, by) {
  if (!s.alive) return; s.alive = false;
  const n = s.pts.length, per = Math.max(1, (s.mass * 0.75) / Math.ceil(n / 2));
  for (let i = 0; i < n; i += 2) { const p = s.pts[i]; segColor(s, i, tmpC); addOrb(p.x + rnd(-0.6, 0.6), p.z + rnd(-0.6, 0.6), per, tmpC); }
  const near = player && player.alive ? Math.hypot(player.pts[0].x - s.pts[0].x, player.pts[0].z - s.pts[0].z) : 99;
  for (let i = 0; i < n; i += Math.max(1, (n / 30) | 0)) { segColor(s, i, tmpC); burst(s.pts[i].x, s.pts[i].z, tmpC, 2, 6, 0.8); }
  if (by) { by.kills++; if (by === player) { run.kills++; stats.kills++; sfx.kill(); shake = Math.max(shake, 0.6); popup('DEVOURED ' + s.name.toUpperCase(), '#ff9be6'); } }
  if (s === player) { stats.deaths++; run.by = by ? by.name : 'the abyss wall'; state = 'dead'; deadT = 0; timeScale = 0.25; shake = 1.4; sfx.die(); flash(); }
  else if (near < 30 && !by) boom(0.12);
}
function step(dt) {
  T += dt; U.uTime.value = T;
  for (const s of snakes) {
    if (!s.alive) continue;
    if (s === player && !AUTO) controlPlayer(s); else think(s, dt);
    const r = rad(s), turn = (4.6 / (1 + r * 0.55)) * dt * (s.boost ? 0.85 : 1);
    s.ang += clamp(wrapA(s.tgt - s.ang), -turn, turn); s.ang = wrapA(s.ang);
    const boosting = s.boost && s.mass > 12, sp = boosting ? 19 : 9.5, h = s.pts[0];
    h.x += Math.cos(s.ang) * sp * dt; h.z += Math.sin(s.ang) * sp * dt;
    if (boosting) { s.mass -= dt * (2.2 + s.mass * 0.012); s.dropT -= dt; if (s.dropT <= 0) { s.dropT = 0.09; const tl = s.pts[s.pts.length - 1]; segColor(s, s.pts.length - 1, tmpC); addOrb(tl.x + rnd(-0.3, 0.3), tl.z + rnd(-0.3, 0.3), 0.8, tmpC); } }
    if (s.shield > 0) s.shield -= dt;
    const n = segN(s); while (s.pts.length < n) { const l = s.pts[s.pts.length - 1]; s.pts.push({ x: l.x, z: l.z }); } if (s.pts.length > n) s.pts.length = n;
    const spc = r * 0.55;
    for (let i = 1; i < s.pts.length; i++) { const a = s.pts[i - 1], b = s.pts[i], dx = b.x - a.x, dz = b.z - a.z, d = Math.sqrt(dx * dx + dz * dz); if (d > spc) { const k = spc / d; b.x = a.x + dx * k; b.z = a.z + dz * k; } }
  }
  buildSegGrid(); buildOrbGrid();
  // collisions + eating
  for (const s of snakes) {
    if (!s.alive) continue; const h = s.pts[0], r = rad(s);
    if (h.x * h.x + h.z * h.z > R * R) { killSnake(s, null); continue; }
    if (s.shield <= 0) { const o = anySeg(h.x, h.z, r * 0.75, s); if (o) { killSnake(s, o); continue; } }
    const mr = r * 3 + 2.5, x0 = Math.max(0, cellIx(h.x - mr)), x1 = Math.min(GN - 1, cellIx(h.x + mr)), z0 = Math.max(0, cellIx(h.z - mr)), z1 = Math.min(GN - 1, cellIx(h.z + mr));
    for (let cz = z0; cz <= z1; cz++) for (let cx = x0; cx <= x1; cx++) for (let i = cellO[cz * GN + cx]; i >= 0; i = nxtO[i]) {
      if (!oA[i]) continue; const dx = h.x - oX[i], dz = h.z - oZ[i], d = Math.sqrt(dx * dx + dz * dz);
      if (d < r + 0.6) { s.mass += oV[i]; if (s === player) { stats.eaten++; run.combo = run.comboT > 0 ? run.combo + 1 : 0; run.comboT = 0.35; sfx.eat(run.combo); tmpC.setRGB(oC[i * 3], oC[i * 3 + 1], oC[i * 3 + 2]); burst(oX[i], oZ[i], tmpC, 2, 2, 0.35, 2); } eatOrb(i); }
      else if (d < mr) { const k = Math.min(1, (14 * dt) / d); oX[i] += dx * k; oZ[i] += dz * k; }
    }
  }
  snakes = snakes.filter((s) => s.alive);
  while (ambient < AMBIENT && free.length) spawnAmbient();
  spawnT -= dt; if (snakes.filter((s) => s.bot).length < NBOTS && spawnT <= 0) { spawnBot(); spawnT = 0.4; }
  for (const p of fx) if (p.l > 0) { p.l -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vx *= 0.96; p.vz *= 0.96; p.vy -= 3 * dt; if (p.y < 0.1) p.vy = Math.abs(p.vy) * 0.3; }
  run.comboT -= dt;
  if (state === 'play' && player) {
    run.maxMass = Math.max(run.maxMass, player.mass); stats.bestMass = Math.max(stats.bestMass, player.mass);
    if (run.milestone < MILES.length && player.mass >= MILES[run.milestone][0]) { popup(MILES[run.milestone][1], '#9ff'); sfx.level(); shake = Math.max(shake, 0.3); run.milestone++; }
  }
  if (state === 'dead') { deadT += dt / Math.max(timeScale, 0.25); if (deadT > 1.1 && $('card').classList.contains('hide') && !AUTO) showCard(); if (AUTO && deadT > 1.5) startRun(); }
}

// ---------- player input ----------
const ptr = { x: innerWidth / 2, y: innerHeight / 2, moved: false }, keys = {};
let boostHeld = false;
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit = new THREE.Vector3(), ndc = new THREE.Vector2();
function controlPlayer(s) {
  const turnKey = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
  if (turnKey) { s.tgt = s.ang + turnKey * 1.2; ptr.moved = false; }
  else if (ptr.moved) {
    ndc.set((ptr.x / innerWidth) * 2 - 1, -(ptr.y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
    if (ray.ray.intersectPlane(plane, hit)) { const h = s.pts[0]; if (Math.hypot(hit.x - h.x, hit.z - h.z) > 0.5) s.tgt = Math.atan2(hit.z - h.z, hit.x - h.x); }
  }
  s.boost = boostHeld || !!keys.Space || !!keys.KeyW || !!keys.ArrowUp;
}
const cvs = renderer.domElement;
cvs.addEventListener('pointermove', (e) => { ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = true; });
cvs.addEventListener('pointerdown', (e) => { audio(); ptr.x = e.clientX; ptr.y = e.clientY; ptr.moved = true; if (e.pointerType === 'touch') document.body.classList.add('touch'); else if (e.button === 0) boostHeld = true; });
addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') boostHeld = false; });
const bb = $('boost');
bb.addEventListener('pointerdown', (e) => { e.stopPropagation(); audio(); boostHeld = true; bb.setPointerCapture(e.pointerId); });
bb.addEventListener('pointerup', () => (boostHeld = false)); bb.addEventListener('pointercancel', () => (boostHeld = false));
addEventListener('keydown', (e) => { audio(); keys[e.code] = true; if (e.code === 'Space') e.preventDefault();
  if ((e.code === 'Space' || e.code === 'Enter') && !$('card').classList.contains('hide')) startRun(); if (e.code === 'Enter' && state === 'title') startRun(); });
addEventListener('keyup', (e) => (keys[e.code] = false));
if (matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');

// ---------- UI ----------
function popup(txt, color) { const d = document.createElement('div'); d.textContent = txt; d.style.color = color; $('pops').appendChild(d); setTimeout(() => d.remove(), 1700); }
function flash() { const f = $('flash'); f.style.transition = 'none'; f.style.opacity = 0.35; requestAnimationFrame(() => { f.style.transition = 'opacity .6s'; f.style.opacity = 0; }); }
function buildSkins() {
  const box = $('skins'); box.innerHTML = '';
  SKINS.forEach((k, i) => { const b = document.createElement('button'), lock = save.pearls < k.need;
    b.style.background = k.prism ? 'conic-gradient(#f3f,#3ff,#ff3,#f3f)' : `radial-gradient(circle at 35% 35%,#fff,${k.c[0]} 30%,${k.c[1]} 75%,#000)`;
    b.className = (i === save.skin ? 'sel ' : '') + (lock ? 'lock' : ''); b.title = k.name;
    b.onclick = () => { if (lock) { $('skinname').textContent = `${k.name} - unlocks at ${k.need} pearls`; return; } save.skin = i; persist(); buildSkins(); };
    box.appendChild(b); });
  $('skinname').textContent = SKINS[save.skin].name;
  const ri = rankOf(save.pearls); $('mstats').textContent = `Rank: ${RANKS[ri][0]} · ${save.pearls} pearls · best length ${save.best}`;
}
function showCard() {
  const len = Math.floor(run.maxMass), earned = Math.floor(run.maxMass / 5) + run.kills * 5, before = save.pearls, rb = rankOf(before);
  save.pearls += earned; save.best = Math.max(save.best, len); save.runs++; persist();
  const ra = rankOf(save.pearls), next = RANKS[ra + 1];
  $('cwhy').textContent = `Caught by ${run.by}.`; $('clen').textContent = len; $('ckills').textContent = run.kills; $('cbest').textContent = save.best;
  $('cpearl').textContent = `+${earned} pearls (${save.pearls} total)`;
  $('crank').textContent = next ? `${RANKS[ra][0]} → ${next[0]} at ${next[1]}` : `${RANKS[ra][0]} - the deepest rank`;
  const unl = SKINS.filter((k) => k.need > before && k.need <= save.pearls).map((k) => k.name);
  $('cunlock').textContent = (ra > rb ? `Rank up: ${RANKS[ra][0]}! ` : '') + (unl.length ? `Unlocked skin: ${unl.join(', ')}` : '');
  $('card').classList.remove('hide'); $('hud').classList.add('hide');
  const bar = $('cbar'); bar.style.width = '0'; const lo = RANKS[ra][1], hi = next ? next[1] : lo + 1;
  setTimeout(() => (bar.style.width = (next ? clamp(((save.pearls - lo) / (hi - lo)) * 100, 0, 100) : 100) + '%'), 50);
}
function startRun() {
  audio(); if (player && player.alive) player.alive = false; snakes = snakes.filter((s) => s.alive);
  const [x, z] = safeSpot(0); player = mkSnake(false, palette(save.skin), 'You', x, z, 10);
  run = { kills: 0, maxMass: 10, milestone: 0, combo: 0, comboT: 0, by: '' }; state = 'play'; timeScale = 1; stats.runs++;
  $('card').classList.add('hide'); $('menu').classList.add('hide'); $('hud').classList.remove('hide');
  $('hint').style.opacity = 0.55; setTimeout(() => ($('hint').style.opacity = 0), 6000);
}
function toTitle() { state = 'title'; if (player) player.alive = false; player = null; buildSkins(); $('card').classList.add('hide'); $('hud').classList.add('hide'); $('menu').classList.remove('hide'); }
$('play').onclick = startRun; $('again').onclick = startRun; $('tomenu').onclick = toTitle;

let lbT = 0;
const mini = $('mini').getContext('2d');
function hud(dt) {
  if (state !== 'play' || !player) return;
  $('len').textContent = Math.floor(player.mass); $('kills').textContent = run.kills + ' devoured';
  lbT -= dt; if (lbT > 0) return; lbT = 0.25;
  const sorted = [...snakes].sort((a, b) => b.mass - a.mass), me = sorted.indexOf(player) + 1;
  $('rank').textContent = `#${me} of ${sorted.length}`;
  let h = ''; sorted.slice(0, 6).forEach((s, i) => { h += `<div class="${s === player ? 'me' : ''}"><span>${i + 1}. ${s.name}</span><span>${Math.floor(s.mass)}</span></div>`; });
  if (me > 6) h += `<div class="me"><span>${me}. You</span><span>${Math.floor(player.mass)}</span></div>`;
  $('lb').innerHTML = h;
  mini.clearRect(0, 0, 132, 132); mini.fillStyle = 'rgba(0,20,30,.6)'; mini.beginPath(); mini.arc(66, 66, 64, 0, TAU); mini.fill();
  mini.strokeStyle = '#ff3f9a'; mini.lineWidth = 2; mini.stroke();
  for (const s of sorted.slice(0, 8)) { if (s === player) continue; mini.fillStyle = '#' + s.pal.a.getHexString(); mini.beginPath(); mini.arc(66 + (s.pts[0].x / R) * 62, 66 + (s.pts[0].z / R) * 62, 2 + rad(s), 0, TAU); mini.fill(); }
  mini.fillStyle = '#fff'; mini.beginPath(); mini.arc(66 + (player.pts[0].x / R) * 62, 66 + (player.pts[0].z / R) * 62, 3.5, 0, TAU); mini.fill();
}

// ---------- render ----------
const camPos = new THREE.Vector3(0, 120, 60), camLook = new THREE.Vector3(), focus = new THREE.Vector3();
let camH = 30;
function draw(rdt) {
  // camera
  if (player && (state === 'play' || state === 'dead')) {
    const h = player.pts[0], r = rad(player); focus.set(h.x, 0, h.z);
    const want = 24 + r * 15 + (player.alive && player.boost ? 4 : 0) + (state === 'dead' ? 8 : 0); camH += (want - camH) * Math.min(1, rdt * 2);
  } else { focus.set(Math.cos(T * 0.05) * 40, 0, Math.sin(T * 0.05) * 40); camH += (70 - camH) * Math.min(1, rdt); }
  camLook.lerp(focus, Math.min(1, rdt * 8));
  camPos.set(camLook.x, camH, camLook.z + camH * 0.55);
  camera.position.copy(camPos); camera.lookAt(camLook.x, 0, camLook.z - 1.5);
  if (shake > 0) { camera.position.x += rnd(-1, 1) * shake; camera.position.z += rnd(-1, 1) * shake; shake = Math.max(0, shake - rdt * 2.5); }
  U.uHead.value.set(camLook.x, player && player.alive ? 9 + rad(player) * 6 : 14, camLook.z);
  if (boostGain) boostGain.gain.setTargetAtTime(player && player.alive && player.boost && player.mass > 12 ? 0.06 : 0, AC.currentTime, 0.05);

  // snakes
  const m = body.instanceMatrix.array, ic = body.instanceColor.array, g = glowAttr.array; let k = 0;
  for (const s of snakes) {
    const r = rad(s), n = s.pts.length, flick = s.shield > 0 && ((T * 12) | 0) % 2 === 0 ? 0.35 : 1, bo = s.boost && s.mass > 12 ? 1 : 0;
    for (let i = n - 1; i >= 0 && k < MAXSEG - 4; i--) {
      const p = s.pts[i], tt = i / n, sc = r * (tt > 0.55 ? 1 - (tt - 0.55) * 1.3 : 1) * (i === 0 ? 1.15 : 1), y = r * 0.3 + Math.sin(i * 0.45 - T * 4) * 0.08 * r;
      const o = k * 16; m[o] = sc; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0; m[o + 4] = 0; m[o + 5] = sc; m[o + 6] = 0; m[o + 7] = 0; m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sc; m[o + 11] = 0; m[o + 12] = p.x; m[o + 13] = y; m[o + 14] = p.z; m[o + 15] = 1;
      segColor(s, i, tmpC); ic[k * 3] = tmpC.r * flick; ic[k * 3 + 1] = tmpC.g * flick; ic[k * 3 + 2] = tmpC.b * flick;
      const pulse = Math.pow(Math.max(0, Math.sin(i * 0.5 - T * (6 + bo * 8) + s.id)), 6);
      g[k] = pulse * (0.6 + bo) + (i === 0 ? 0.5 : 0); k++;
      if ((i & 1) === 0) { const hs = i === 0 ? 0.55 : 0.16 + pulse * 0.2 + bo * 0.12; haloPts.put(p.x, y + sc * 0.4, p.z, tmpC.r * hs * flick, tmpC.g * hs * flick, tmpC.b * hs * flick, sc * (i === 0 ? 6 : 4)); }
    }
    // eyes
    const h = s.pts[0], c = Math.cos(s.ang), sn = Math.sin(s.ang);
    for (const side of [-1, 1]) {
      if (k >= MAXSEG) break; const ex = h.x + c * r * 0.6 - sn * r * 0.5 * side, ez = h.z + sn * r * 0.6 + c * r * 0.5 * side, ey = r * 0.3 + r * 0.75, es = r * 0.3, o = k * 16;
      m.fill(0, o, o + 16); m[o] = es; m[o + 5] = es; m[o + 10] = es; m[o + 12] = ex; m[o + 13] = ey; m[o + 14] = ez; m[o + 15] = 1;
      ic[k * 3] = 0.9; ic[k * 3 + 1] = 1; ic[k * 3 + 2] = 1; g[k] = 1; k++;
      haloPts.put(ex, ey + es, ez, 0.25, 0.35, 0.35, es * 4);
    }
  }
  body.count = k; body.instanceMatrix.needsUpdate = true; body.instanceColor.needsUpdate = true; glowAttr.needsUpdate = true;
  // orbs
  for (let i = 0; i < MAXO; i++) { if (!oA[i]) continue; const pu = 1 + 0.3 * Math.sin(T * 3 + oP[i]), s = (0.7 + Math.sqrt(oV[i]) * 0.55) * pu;
    orbPts.put(oX[i], 0.35 + 0.15 * Math.sin(T * 2 + oP[i]), oZ[i], oC[i * 3] * 0.9, oC[i * 3 + 1] * 0.9, oC[i * 3 + 2] * 0.9, s); }
  for (const p of fx) if (p.l > 0) { const a = p.l / p.m; fxPts.put(p.x, p.y, p.z, p.r * a, p.g * a, p.b * a, p.s * (0.5 + a)); }
  for (const s of snow) { s.y -= rdt * 0.25; s.x += Math.sin(T * 0.3 + s.p) * rdt * 0.2; if (s.y < 0.3) s.y = 30;
    let dx = s.x - camLook.x, dz = s.z - camLook.z; if (dx > 70) s.x -= 140; if (dx < -70) s.x += 140; if (dz > 70) s.z -= 140; if (dz < -70) s.z += 140;
    const tw = 0.06 + 0.05 * Math.sin(T * 1.5 + s.p * 9); snowPts.put(s.x, s.y, s.z, tw * 0.6, tw, tw * 1.1, s.s); }
  orbPts.flush(); haloPts.flush(); fxPts.flush(); snowPts.flush();
  renderer.render(scene, camera);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  timeScale += (1 - timeScale) * Math.min(1, rdt * 1.5);
  const dt = rdt * timeScale; if (dt > 1 / 45) { step(dt / 2); step(dt / 2); } else step(dt);
  hud(rdt); draw(rdt);
}

// boot: straight into play unless ?title
for (let i = 0; i < NBOTS; i++) spawnBot();
while (ambient < AMBIENT) spawnAmbient();
for (let i = 0; i < 60; i++) step(1 / 30);
if (Q.has('title')) toTitle(); else startRun();
requestAnimationFrame(frame);

window.__G = {
  get state() { return state; }, get player() { return player; }, get snakes() { return snakes; }, stats, save,
  fast(sec) { for (let i = 0; i < sec * 30; i++) step(1 / 30); },
  killPlayer() { if (player && player.alive) killSnake(player, snakes.find((s) => s !== player) || null); },
  frame: () => draw(1 / 60),
};
