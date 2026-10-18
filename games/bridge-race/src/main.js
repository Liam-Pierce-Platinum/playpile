// BRIDGE RACE - collect your colour of bricks, build a bridge up to the next floor before the rivals.
import * as THREE from '../vendor/three.module.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------- save ----------
const HATS = [
  { name: 'None', cost: 0 }, { name: 'Party cone', cost: 30 }, { name: 'Bow', cost: 60 },
  { name: 'Bunny ears', cost: 90 }, { name: 'Crown', cost: 130 }, { name: 'Halo', cost: 180 },
];
let S = { level: 1, coins: 0, hats: [0], hat: 0 };
try { const s = JSON.parse(localStorage.getItem('bridge_race_v1')); if (s && s.level) S = Object.assign(S, s); } catch (e) {}
const save = () => { try { localStorage.setItem('bridge_race_v1', JSON.stringify(S)); } catch (e) {} };

// ---------- sound ----------
let AC = null, muted = Q.has('mute');
function ac() { if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } if (AC && AC.state === 'suspended') AC.resume(); return AC; }
function tone(f, dur, type = 'triangle', vol = 0.12, f2 = 0, delay = 0) {
  if (muted) return; const a = ac(); if (!a) return;
  const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination); o.start(t); o.stop(t + dur + 0.02);
}
const SFX = {
  pick: (n) => tone(520 + Math.min(n, 30) * 22, 0.09, 'sine', 0.1, 900 + n * 20),
  place: (k) => { tone(180 + k * 28, 0.12, 'triangle', 0.13); tone(360 + k * 56, 0.06, 'sine', 0.05, 0, 0.03); },
  bump: () => { tone(160, 0.3, 'sawtooth', 0.08, 50); tone(90, 0.25, 'sine', 0.15, 40); },
  block: () => tone(140, 0.12, 'square', 0.04, 110),
  win: () => [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.25, 'triangle', 0.12, 0, i * 0.09)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.3, 'sine', 0.1, 0, i * 0.12)),
  ui: () => tone(660, 0.07, 'sine', 0.08, 880),
};

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
$('app').appendChild(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

const SKY_TOP = new THREE.Color(0xa9bdf7), SKY_MID = new THREE.Color(0xf9c9dc), SKY_BOT = new THREE.Color(0xffe3c8);
const SUN = new THREE.Vector3(-0.45, 0.85, -0.3).normalize();

// Matte clay shader: wrapped diffuse, sky/ground hemisphere tint, soft rim, per-object vertical gradient, height fog, grain.
const CLAY_V = `varying vec3 vN; varying vec3 vW; varying float vLy; uniform float uH;
void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); vLy=position.y/uH; gl_Position=projectionMatrix*viewMatrix*w; }`;
const CLAY_F = `varying vec3 vN; varying vec3 vW; varying float vLy;
uniform vec3 uColor; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uSun; uniform float uOpacity; uniform float uGrad; uniform float uGlow;
void main(){
  vec3 n=normalize(vN); vec3 V=normalize(cameraPosition-vW);
  float wrap=pow(clamp(dot(n,uSun)*0.5+0.5,0.0,1.0),1.5);
  vec3 hemi=mix(uBot*0.9,uTop,n.y*0.5+0.5);
  vec3 col=uColor*(0.42+0.7*wrap);
  col*=mix(vec3(1.0),hemi*1.2,0.38);
  col*=mix(1.0-uGrad,1.0,clamp(vLy*0.5+0.5,0.0,1.0));
  float rim=pow(1.0-max(dot(n,V),0.0),2.6);
  col+=mix(uMid,vec3(1.0),0.5)*rim*0.28;
  float sh=pow(max(dot(reflect(-uSun,n),V),0.0),18.0); col+=sh*0.06;
  col+=uColor*uGlow;
  float d=length(cameraPosition-vW);
  float f=smoothstep(45.0,140.0,d); f=max(f,smoothstep(-3.0,-22.0,vW.y)*0.9);
  col=mix(col,mix(uMid,uBot,0.4),f);
  col+=(fract(sin(dot(gl_FragCoord.xy,vec2(12.9898,78.233)))*43758.5453)-0.5)/180.0;
  gl_FragColor=vec4(col,uOpacity);
  #include <colorspace_fragment>
}`;
const matCache = {};
function clay(hex, o = {}) {
  const key = hex + JSON.stringify(o); if (matCache[key]) return matCache[key];
  const m = new THREE.ShaderMaterial({
    vertexShader: CLAY_V, fragmentShader: CLAY_F, transparent: (o.opacity ?? 1) < 1, depthWrite: (o.opacity ?? 1) >= 1,
    uniforms: { uColor: { value: new THREE.Color(hex) }, uTop: { value: SKY_TOP }, uMid: { value: SKY_MID }, uBot: { value: SKY_BOT }, uSun: { value: SUN },
      uOpacity: { value: o.opacity ?? 1 }, uGrad: { value: o.grad ?? 0.12 }, uH: { value: o.h ?? 1 }, uGlow: { value: o.glow ?? 0 } },
  });
  return (matCache[key] = m);
}

// rounded box with analytic normals
function rbox(w, h, d, r) {
  const g = new THREE.BoxGeometry(1, 1, 1, 8, 8, 8), p = g.attributes.position, nrm = g.attributes.normal;
  const half = [w / 2, h / 2, d / 2], v = new THREE.Vector3(), inner = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    const c = [p.getX(i), p.getY(i), p.getZ(i)], q = [0, 0, 0], ih = [0, 0, 0];
    for (let a = 0; a < 3; a++) {
      const s = Math.sign(c[a]), t = Math.abs(c[a]) * 2; ih[a] = half[a] - r;
      q[a] = s * (t <= 0.25 ? (t / 0.25) * ih[a] : ih[a] + ((t - 0.25) / 0.75) * r);
    }
    v.set(q[0], q[1], q[2]); inner.set(THREE.MathUtils.clamp(v.x, -ih[0], ih[0]), THREE.MathUtils.clamp(v.y, -ih[1], ih[1]), THREE.MathUtils.clamp(v.z, -ih[2], ih[2]));
    const n = v.clone().sub(inner); if (n.lengthSq() < 1e-9) n.set(0, 1, 0); n.normalize();
    v.copy(inner).addScaledVector(n, r); p.setXYZ(i, v.x, v.y, v.z); nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  uniforms: { uTop: { value: SKY_TOP }, uMid: { value: SKY_MID }, uBot: { value: SKY_BOT }, uSun: { value: SUN } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying vec3 vW; uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBot; uniform vec3 uSun;
  void main(){ vec3 d=normalize(vW-cameraPosition); float h=d.y;
    vec3 c=mix(mix(uMid,uBot,0.4)*0.98,uMid,smoothstep(-0.35,0.08,h)); c=mix(c,uTop,smoothstep(0.08,0.75,h));
    c+=vec3(1.0,0.95,0.85)*pow(max(dot(d,normalize(vec3(-uSun.x,0.25,0.9))),0.0),6.0)*0.25;
    gl_FragColor=vec4(c,1.0);
    #include <colorspace_fragment>
  }`,
}));
scene.add(sky);

// blob shadow
const shadowMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false,
  vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
  fragmentShader: `varying vec2 vU; void main(){ float d=length(vU-0.5)*2.0; gl_FragColor=vec4(0.42,0.3,0.55,smoothstep(1.0,0.2,d)*0.3); }` });
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// ---------- layout constants ----------
const N = 14, SD = 0.8, RISE = 0.32, LEN = N * SD, FH = N * RISE, D = 12, HW = 8, LX = [-5, 0, 5], LW = 1.6;
const COLORS = [0xff7f95, 0x5fb6ff, 0xffc04d, 0xa98bff];
const NAMES = ['You', 'Sky', 'Butter', 'Lilac'];
const FLOOR_COL = [0xfff1e4, 0xcdf2e0, 0xffe0d0, 0xe2dcff, 0xd6f0ff, 0xffe8f1];
const brickGeo = rbox(0.56, 0.18, 0.34, 0.06), stepGeo = rbox(1.56, 0.3, 0.76, 0.09);
const ghostMat = clay(0xffffff, { opacity: 0.38 });
const brickMat = (i) => (i < 0 ? clay(0xf3eef8) : clay(COLORS[i]));

let world, floors, stairs, spots, loose, chars, player, gaps, level, state = 'play', winner = null, T = 0, endT = 0, auto = Q.has('auto'), shake = 0;
const parts = [], confetti = [];

function buildLevel(L) {
  if (world) scene.remove(world);
  world = new THREE.Group(); scene.add(world);
  level = L; gaps = Math.min(2 + Math.floor((L - 1) / 2), 5);
  floors = []; stairs = []; spots = []; loose = []; chars = []; winner = null; state = 'play';
  for (let i = 0; i <= gaps; i++) {
    const zA = i * (D + LEN), y = i * FH, fin = i === gaps;
    floors.push({ zA, zB: zA + D, y });
    const m = new THREE.Mesh(rbox(HW * 2, 1.4, D, 0.6), clay(fin ? 0xfff0b0 : FLOOR_COL[i % FLOOR_COL.length], { grad: 0.35, h: 0.7 }));
    m.position.set(0, y - 0.7, zA + D / 2); world.add(m);
    const lip = new THREE.Mesh(rbox(HW * 2 + 0.6, 0.5, D + 0.6, 0.25), clay(0xffffff, { grad: 0.25, h: 0.25 }));
    lip.position.set(0, y - 1.55, zA + D / 2); world.add(lip);
    if (fin) {
      const arch = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.45, 16, 48, Math.PI), clay(0xffb3c4, { grad: 0.2, h: 4 }));
      arch.position.set(0, y, zA + 6); world.add(arch);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 2, 0.5, 40), clay(0xffffff));
      pod.position.set(0, y + 0.25, zA + 6); world.add(pod);
      for (let k = 0; k < 2; k++) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.7, 24, 16), clay([0xff9fb5, 0xa9c8ff][k])); b.position.set(k ? 4.2 : -4.2, y + 0.6, zA + 6); world.add(b); }
    }
  }
  for (let g = 0; g < gaps; g++) {
    stairs.push(LX.map((x) => {
      const arr = [];
      for (let k = 0; k < N; k++) {
        const top = floors[g].y + (k + 1) * RISE, m = new THREE.Mesh(stepGeo, ghostMat);
        m.position.set(x, top - 0.15, floors[g].zB + (k + 0.5) * SD); world.add(m);
        arr.push({ mesh: m, owner: null, pop: 0 });
      }
      for (const sx of [-0.9, 0.9]) { // soft rails
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, Math.hypot(LEN, FH), 8), clay(0xffffff, { opacity: 0.7 }));
        rail.position.set(x + sx, floors[g].y + FH / 2 + 0.6, floors[g].zB + LEN / 2); rail.rotation.x = Math.atan2(LEN, FH); world.add(rail);
      }
      return arr;
    }));
    // brick spots on floor g
    const cols = []; for (let i = 0; i < 36; i++) cols.push(i % 4);
    cols.sort(() => Math.random() - 0.5);
    let n = 0;
    for (let r = 0; r < 5; r++) for (let cx = 0; cx < 7; cx++) {
      const x = -6 + cx * 2 + (Math.random() - 0.5) * 0.4, z = floors[g].zA + 1.6 + r * 2.0 + (Math.random() - 0.5) * 0.4;
      const c = cols[n++], m = new THREE.Mesh(brickGeo, brickMat(c)); m.position.set(x, floors[g].y + 0.12, z); m.rotation.y = Math.random() * 3; world.add(m);
      spots.push({ x, z, g, c, mesh: m, on: true, t: 0, s: 1 });
    }
  }
  // clouds
  for (let i = 0; i < 36; i++) {
    const cl = new THREE.Group(), w = 0.6 + Math.random() * 1.4;
    for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.SphereGeometry((1.2 + Math.random()) * w, 18, 12), clay(0xffffff, { grad: 0.35, h: 2 })); s.position.set((k - 1.5) * 1.4 * w, Math.random() * 0.6 * w, (Math.random() - 0.5) * w); cl.add(s); }
    const z = Math.random() * (gaps + 1) * (D + LEN) * 1.1 - 10, side = Math.random() < 0.5 ? -1 : 1;
    cl.position.set(side * (19 + Math.random() * 30), -9 - Math.random() * 10 + z * FH / (D + LEN) * 0.6, z); cl.userData.sp = 0.2 + Math.random() * 0.3; world.add(cl);
  }
  // racers
  const sp = Math.min(2.75 + L * 0.12, 3.95);
  for (let i = 0; i < 4; i++) {
    const c = makeChar(i); c.x = [-1.5, -4.5, 1.5, 4.5][i]; c.z = 0.8; c.y = 0; c.speed = i === 0 ? 4.4 : sp * (0.94 + Math.random() * 0.12);
    c.locn = loc(c.x, c.z); chars.push(c);
  }
  player = chars[0];
  const race = $('race'); race.innerHTML = '<b></b>' + chars.map((c, i) => `<i class="${i ? '' : 'me'}" style="background:#${COLORS[i].toString(16)}"></i>`).join('');
  $('lvl').textContent = 'LEVEL ' + L;
  $('end').classList.add('hide');
  $('hint').style.opacity = L === 1 ? 1 : 0;
}

function makeChar(i) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const bm = clay(COLORS[i], { grad: 0.3, h: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.38, 0.5, 8, 18), bm); torso.position.y = 0.66; body.add(torso);
  const eyeM = clay(0x3b3256), cheekM = clay(0xffb0c0);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), eyeM); e.position.set(s * 0.14, 0.95, 0.33); e.scale.y = 1.4; body.add(e);
    const ch = new THREE.Mesh(new THREE.SphereGeometry(0.07, 12, 8), cheekM); ch.position.set(s * 0.24, 0.84, 0.29); ch.scale.set(1, 0.6, 0.4); body.add(ch);
  }
  const hands = [-1, 1].map((s) => { const h = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 10), bm); h.position.set(s * 0.46, 0.55, 0.05); body.add(h); return h; });
  const feet = [-1, 1].map((s) => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), clay(0xffffff)); f.scale.set(1, 0.6, 1.3); f.position.set(s * 0.17, 0.07, 0.02); root.add(f); return f; });
  const back = new THREE.Group(); back.position.set(0, 0.38, -0.46); body.add(back);
  const sh = new THREE.Mesh(shadowGeo, shadowMat); sh.scale.setScalar(1.3); world.add(sh);
  const hat = new THREE.Group(); hat.position.y = 1.28; body.add(hat);
  if (i === 0) setHat(hat, S.hat);
  world.add(root);
  return { i, color: i, isPlayer: i === 0, root, body, hands, feet, back, hat, sh, x: 0, z: 0, y: 0, ground: 0, face: 0, dir: 0, speed: 3, bricks: 0, stack: [],
    stun: 0, bumpCd: 0, sq: 0, phase: Math.random() * 6, moving: false, block: 0, ai: { lane: null, laneG: -1, mode: 'collect', want: 6 } };
}
function setHat(g, h) {
  g.clear();
  const M = (c) => clay(c);
  if (h === 1) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.5, 20), M(0xa9e5c8)); c.position.y = 0.2; c.rotation.z = 0.15; g.add(c); const p = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M(0xffffff)); p.position.set(-0.04, 0.47, 0); g.add(p); }
  if (h === 2) for (const s of [-1, 1]) { const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 14, 10), M(0xff9fd0)); b.scale.set(1.3, 0.8, 0.6); b.position.set(s * 0.14, 0, 0.1); g.add(b); }
  if (h === 3) for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.4, 6, 12), M(0xffffff)); e.position.set(s * 0.15, 0.2, 0); e.rotation.z = -s * 0.2; g.add(e); }
  if (h === 4) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.2, 0.22, 10, 1, true), clay(0xffd36b)); c.material.side = THREE.DoubleSide; c.position.y = 0.02; g.add(c); for (let k = 0; k < 5; k++) { const j = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M(0xff9fb5)); j.position.set(Math.sin(k * 1.256) * 0.24, 0.15, Math.cos(k * 1.256) * 0.24); g.add(j); } }
  if (h === 5) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.04, 8, 28), clay(0xfff2a0, { glow: 0.5 })); t.rotation.x = Math.PI / 2; t.position.y = 0.25; g.add(t); }
}

// ---------- world queries ----------
function loc(x, z) {
  for (let i = 0; i < floors.length; i++) { const f = floors[i]; if (z >= f.zA && z <= f.zB && Math.abs(x) <= HW - 0.35) return { t: 0, i, h: f.y }; }
  for (let g = 0; g < gaps; g++) {
    const zs = floors[g].zB;
    if (z > zs && z < zs + LEN) {
      for (let j = 0; j < 3; j++) if (Math.abs(x - LX[j]) <= LW / 2 - 0.25) { const k = Math.min(N - 1, Math.floor((z - zs) / SD)); return { t: 1, g, j, k, h: floors[g].y + (k + 1) * RISE }; }
      return null;
    }
  }
  return null;
}
function tryPos(c, x, z) {
  const n = loc(x, z); if (!n) return false; const cur = c.locn;
  if (n.t === 1) {
    const st = stairs[n.g][n.j][n.k];
    const climbing = (cur.t === 0 && cur.i === n.g) || (cur.t === 1 && cur.g === n.g && n.k > cur.k);
    if (climbing && st.owner !== c) {
      if (c.bricks > 0) paint(st, c, n.k); else { if (c.block <= 0 && c.isPlayer) SFX.block(); c.block = 0.4; return false; }
    }
  }
  c.x = x; c.z = z; c.ground = n.h; c.locn = n; return true;
}
function paint(st, c, k) {
  st.owner = c; st.mesh.material = brickMat(c.color); st.pop = 1; c.bricks--;
  const b = c.stack.pop(); if (b) c.back.remove(b);
  puff(st.mesh.position, c.color, 6);
  if (c.isPlayer) SFX.place(k);
}
function addBrick(c, from) {
  c.bricks++; c.sq = 1;
  if (c.stack.length < 32) {
    const m = new THREE.Mesh(brickGeo, brickMat(c.color)); c.back.add(m);
    c.root.updateMatrixWorld(true); m.position.copy(c.back.worldToLocal(from.clone()));
    m.userData.t = 0; m.userData.from = m.position.clone(); c.stack.push(m);
  }
  if (c.isPlayer) SFX.pick(c.bricks);
}
function puff(p, ci, n) {
  for (let k = 0; k < n; k++) {
    let m = parts.find((q) => q.life <= 0);
    if (!m) { m = { mesh: new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), ghostMat), life: 0, v: new THREE.Vector3() }; scene.add(m.mesh); parts.push(m); }
    m.mesh.material = ci < 0 ? clay(0xffffff) : clay(COLORS[ci]); m.mesh.visible = true; m.mesh.position.copy(p); m.mesh.position.y += 0.15;
    m.v.set((Math.random() - 0.5) * 3, 1.5 + Math.random() * 2, (Math.random() - 0.5) * 3); m.life = 0.5 + Math.random() * 0.3;
  }
}

// ---------- AI (also drives the player in ?auto mode) ----------
function nearestBrick(c, g) {
  let best = null, bd = 1e9;
  for (const s of spots) if (s.on && s.g === g && s.c === c.color) { const d = (s.x - c.x) ** 2 + (s.z - c.z) ** 2; if (d < bd) { bd = d; best = s; } }
  for (const s of loose) if (s.landed && s.g === g) { const d = (s.x - c.x) ** 2 + (s.z - c.z) ** 2 - 4; if (d < bd) { bd = d; best = s; } }
  return best;
}
function think(c) {
  const n = c.locn, g = n.t === 0 ? n.i : n.g;
  if (n.t === 0 && g === gaps) return { x: -c.x, z: floors[g].zA + 6 - c.z };
  if (c.ai.laneG !== g) {
    let bj = 0, bs = -1e9;
    for (let j = 0; j < 3; j++) { const st = stairs[g][j]; let s = Math.random() * 3 - Math.abs(LX[j] - c.x) * 0.15; for (const q of st) s += q.owner === c ? 2 : q.owner ? -0.4 : 0; if (s > bs) { bs = s; bj = j; } }
    c.ai.lane = bj; c.ai.laneG = g; c.ai.mode = 'collect'; c.ai.want = 0;
  }
  const lane = c.ai.lane, steps = stairs[g][lane];
  const needed = steps.reduce((a, q) => a + (q.owner === c ? 0 : 1), 0);
  if (!c.ai.want) c.ai.want = c.isPlayer ? 99 : 5 + Math.floor(Math.random() * 7) + Math.min(level, 6);
  if (n.t === 1) {
    const next = n.k + 1 < N ? steps[n.k + 1] : null;
    if (c.ai.mode === 'climb' && (!next || next.owner === c || c.bricks > 0)) return { x: (LX[lane] - c.x) * 3, z: 1 };
    c.ai.mode = 'collect'; c.ai.want = 0; return { x: 0, z: -1 };
  }
  if (c.ai.mode === 'collect' && c.bricks >= Math.min(needed, c.ai.want)) c.ai.mode = 'climb';
  if (c.ai.mode === 'climb' && c.bricks === 0 && needed > 0) { c.ai.mode = 'collect'; c.ai.want = 0; }
  const zB = floors[g].zB;
  if (c.ai.mode === 'collect') {
    const b = nearestBrick(c, g);
    if (b) return { x: b.x - c.x, z: b.z - c.z };
    if (c.bricks > 0) c.ai.mode = 'climb'; else return { x: 0, z: 0 };
  }
  if (Math.abs(c.x - LX[lane]) < 0.25 && c.z > zB - 2) return { x: (LX[lane] - c.x) * 3, z: 1 };
  return { x: LX[lane] - c.x, z: zB - 1.2 - c.z };
}

// ---------- input ----------
const keys = {}; let joy = null;
addEventListener('keydown', (e) => {
  keys[e.code] = true; ac();
  if (e.code === 'KeyM') muted = !muted;
  if (e.code === 'Escape') toggleMenu();
  if ((e.code === 'Enter' || e.code === 'Space') && state === 'end' && T - endT > 1) nextFromEnd();
});
addEventListener('keyup', (e) => (keys[e.code] = false));
const cv = renderer.domElement;
cv.addEventListener('pointerdown', (e) => { ac(); joy = { id: e.pointerId, x: e.clientX, y: e.clientY, dx: 0, dy: 0 }; const j = $('joy'); j.style.display = 'block'; j.style.left = e.clientX + 'px'; j.style.top = e.clientY + 'px'; });
addEventListener('pointermove', (e) => { if (!joy || e.pointerId !== joy.id) return; let dx = e.clientX - joy.x, dy = e.clientY - joy.y; const l = Math.hypot(dx, dy); if (l > 45) { dx *= 45 / l; dy *= 45 / l; } joy.dx = dx; joy.dy = dy; $('knob').style.transform = `translate(${dx}px,${dy}px)`; });
const up = (e) => { if (joy && e.pointerId === joy.id) { joy = null; $('joy').style.display = 'none'; $('knob').style.transform = ''; } };
addEventListener('pointerup', up); addEventListener('pointercancel', up);
function inputDir() {
  let x = 0, z = 0;
  if (keys.KeyW || keys.ArrowUp) z += 1; if (keys.KeyS || keys.ArrowDown) z -= 1;
  if (keys.KeyA || keys.ArrowLeft) x += 1; if (keys.KeyD || keys.ArrowRight) x -= 1;
  if (joy && Math.hypot(joy.dx, joy.dy) > 6) { x = -joy.dx / 45; z = -joy.dy / 45; }
  return { x, z };
}

// ---------- update ----------
const tmpV = new THREE.Vector3();
function update(dt) {
  T += dt;
  if (state === 'play') {
    for (const c of chars) {
      c.bumpCd -= dt; c.block -= dt;
      if (c.stun > 0) { c.stun -= dt; c.moving = false; continue; }
      const d = c.isPlayer && !auto ? inputDir() : think(c);
      let l = Math.hypot(d.x, d.z);
      if (l > 0.05) {
        const m = Math.min(l, 1) / l, sp = c.speed * dt, dx = d.x * m, dz = d.z * m;
        if (!tryPos(c, c.x + dx * sp, c.z + dz * sp)) { if (!tryPos(c, c.x + dx * sp, c.z)) tryPos(c, c.x, c.z + dz * sp); }
        c.dir = Math.atan2(dx, dz); c.moving = true;
      } else c.moving = false;
      // pickups
      if (c.locn.t === 0) {
        for (const s of spots) if (s.on && s.g === c.locn.i && s.c === c.color && (s.x - c.x) ** 2 + (s.z - c.z) ** 2 < 0.5) { s.on = false; s.t = 3 + Math.random() * 2; s.mesh.visible = false; addBrick(c, s.mesh.position); }
        for (let k = loose.length - 1; k >= 0; k--) { const s = loose[k]; if (s.landed && s.g === c.locn.i && (s.x - c.x) ** 2 + (s.z - c.z) ** 2 < 0.5) { world.remove(s.mesh); loose.splice(k, 1); addBrick(c, s.mesh.position); } }
        if (c.locn.i === gaps && c.z > floors[gaps].zA + 2.5 && !winner) finish(c);
      }
    }
    // bumps
    for (let a = 0; a < 4; a++) for (let b = a + 1; b < 4; b++) {
      const A = chars[a], B = chars[b];
      if (A.locn.t || B.locn.t || A.locn.i !== B.locn.i) continue;
      const dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz);
      if (d < 0.8 && d > 1e-4) {
        const p = (0.8 - d) / 2 / d; tryPos(A, A.x - dx * p, A.z - dz * p); tryPos(B, B.x + dx * p, B.z + dz * p);
        if (A.bumpCd <= 0 && B.bumpCd <= 0 && !A.stun && !B.stun && A.bricks !== B.bricks) {
          const lose = A.bricks < B.bricks ? A : B;
          if (lose.bricks > 0) { drop(lose); A.bumpCd = B.bumpCd = 1.5; if (A.isPlayer || B.isPlayer) { SFX.bump(); shake = 0.35; } }
        }
      }
    }
  }
  if (state === 'end' && T - endT > 1.1 && $('end').classList.contains('hide')) $('end').classList.remove('hide');
  // spots
  for (const s of spots) {
    if (!s.on) { s.t -= dt; if (s.t <= 0) { s.on = true; s.mesh.visible = true; s.s = 0; } }
    else { s.s = Math.min(1, s.s + dt * 4); s.mesh.scale.setScalar(s.s < 1 ? s.s * 1.2 : 1); s.mesh.position.y = floors[s.g].y + 0.14 + Math.sin(T * 2 + s.x) * 0.03; }
  }
  for (const s of loose) {
    if (s.landed) continue;
    s.vy -= 22 * dt; s.x += s.vx * dt; s.z += s.vz * dt; s.y += s.vy * dt;
    s.x = THREE.MathUtils.clamp(s.x, -HW + 0.7, HW - 0.7); s.z = THREE.MathUtils.clamp(s.z, floors[s.g].zA + 0.6, floors[s.g].zB - 0.6);
    const gy = floors[s.g].y + 0.1; if (s.y <= gy && s.vy < 0) { s.y = gy; s.landed = true; }
    s.mesh.position.set(s.x, s.y, s.z); s.mesh.rotation.y += dt * 8;
  }
  // stairs pop
  for (const lanes of stairs) for (const lane of lanes) for (const st of lane) if (st.pop > 0) { st.pop = Math.max(0, st.pop - dt * 4); st.mesh.scale.set(1 + st.pop * 0.15, 1 + st.pop * 0.6, 1 + st.pop * 0.15); }
  // chars visuals
  for (const c of chars) {
    c.y += (c.ground - c.y) * Math.min(1, dt * 14);
    let da = c.dir - c.face; da = Math.atan2(Math.sin(da), Math.cos(da)); c.face += da * Math.min(1, dt * 12);
    if (c.moving) c.phase += dt * 13;
    const bob = c.moving ? Math.abs(Math.sin(c.phase)) * 0.08 : Math.sin(T * 3 + c.i) * 0.015;
    c.sq = Math.max(0, c.sq - dt * 5);
    c.root.position.set(c.x, c.y, c.z);
    c.root.rotation.y = c.face + (c.stun > 0 ? c.stun * 14 : 0) + (c.block > 0 ? Math.sin(T * 50) * 0.12 : 0);
    c.body.position.y = bob; c.body.scale.set(1 + c.sq * 0.12, 1 - c.sq * 0.1, 1 + c.sq * 0.12);
    c.body.rotation.x = c.moving ? 0.12 : 0;
    c.hands.forEach((h, k) => (h.position.z = 0.05 + (c.moving ? Math.sin(c.phase + k * Math.PI) * 0.18 : 0)));
    c.feet.forEach((f, k) => { f.position.z = 0.02 + (c.moving ? Math.sin(c.phase + k * Math.PI) * 0.2 : 0); f.position.y = 0.07 + (c.moving ? Math.max(0, Math.cos(c.phase + k * Math.PI)) * 0.08 : 0); });
    c.stack.forEach((m, k) => {
      const tgt = tmpV.set(0, k * 0.19, 0);
      if (m.userData.t < 1) { m.userData.t = Math.min(1, m.userData.t + dt * 5); const t = m.userData.t; m.position.lerpVectors(m.userData.from, tgt, t); m.position.y += Math.sin(t * Math.PI) * 0.8; }
      else { m.position.copy(tgt); m.position.x = Math.sin(c.phase * 0.5 + k * 0.4) * 0.012 * k * (c.moving ? 1 : 0.2); }
    });
    c.sh.position.set(c.x, c.ground + 0.02, c.z); c.sh.scale.setScalar(1.3 - (c.y - c.ground));
  }
  for (const p of parts) if (p.life > 0) { p.life -= dt; p.v.y -= 9 * dt; p.mesh.position.addScaledVector(p.v, dt); p.mesh.scale.setScalar(Math.max(0.01, p.life * 2)); if (p.life <= 0) p.mesh.visible = false; }
  for (const f of confetti) if (f.life > 0) { f.life -= dt; f.v.y = Math.max(-2.5, f.v.y - 6 * dt); f.mesh.position.addScaledVector(f.v, dt); f.mesh.rotation.x += dt * f.r; f.mesh.rotation.z += dt * f.r * 0.7; if (f.life <= 0) f.mesh.visible = false; }
  world.children.forEach((o) => { if (o.userData.sp) o.position.x += Math.sin(T * 0.2 + o.position.z) * o.userData.sp * dt; });
}
function drop(c) {
  const n = Math.min(c.bricks, 20), g = c.locn.i;
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(brickGeo, brickMat(-1)); world.add(m);
    const a = Math.random() * 6.28, v = 2 + Math.random() * 3;
    loose.push({ mesh: m, g, x: c.x, z: c.z, y: c.y + 0.8 + k * 0.1, vx: Math.cos(a) * v, vz: Math.sin(a) * v, vy: 4 + Math.random() * 3, landed: false });
  }
  c.bricks = 0; c.stack.forEach((m) => c.back.remove(m)); c.stack = []; c.stun = 1.0; c.ai.mode = 'collect'; c.ai.want = 0;
  puff(new THREE.Vector3(c.x, c.y + 0.5, c.z), c.color, 10);
}
function finish(c) {
  winner = c; state = 'end'; endT = T;
  const win = c.isPlayer, reward = win ? 20 + level * 5 : 5;
  S.coins += reward; if (win) S.level = level + 1; save();
  $('endT').textContent = win ? '1st place!' : NAMES[c.i] + ' won';
  $('endS').textContent = (win ? 'You reached the top first.' : 'They built their bridge faster.') + ' +' + reward + ' coins';
  $('nextBtn').textContent = win ? 'Next level' : 'Retry';
  if (win) { SFX.win(); burst(c); } else SFX.lose();
}
function burst(c) {
  for (let k = 0; k < 90; k++) {
    let f = confetti.find((q) => q.life <= 0);
    if (!f) { f = { mesh: new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.1), null), life: 0, v: new THREE.Vector3() }; scene.add(f.mesh); confetti.push(f); }
    const m = clay(COLORS[k % 4]); f.mesh.material = m; m.side = THREE.DoubleSide;
    f.mesh.visible = true; f.mesh.position.set(c.x, c.y + 1.2, c.z);
    f.v.set((Math.random() - 0.5) * 7, 5 + Math.random() * 6, (Math.random() - 0.5) * 7); f.life = 2.5 + Math.random(); f.r = 4 + Math.random() * 8;
  }
}
function nextFromEnd() { SFX.ui(); buildLevel(winner && winner.isPlayer ? level + 1 : level); }

// ---------- camera / hud / loop ----------
const camPos = new THREE.Vector3(0, 9, -8), camLook = new THREE.Vector3();
function frame(dt) {
  const p = player, port = innerWidth < innerHeight;
  const back = port ? 11 : 8.5, upY = port ? 11 : 8.5;
  camPos.lerp(tmpV.set(p.x * 0.6, p.y + upY, p.z - back), Math.min(1, dt * 4));
  camLook.lerp(tmpV.set(p.x * 0.75, p.y + 0.6, p.z + 3), Math.min(1, dt * 6));
  shake = Math.max(0, shake - dt);
  camera.position.copy(camPos); camera.position.x += (Math.random() - 0.5) * shake; camera.position.y += (Math.random() - 0.5) * shake;
  camera.lookAt(camLook); sky.position.copy(camera.position);
  const fz = floors[gaps].zA + 2.5, dots = $('race').querySelectorAll('i');
  chars.forEach((c, k) => (dots[k].style.left = Math.max(0, Math.min(100, (c.z / fz) * 100)) + '%'));
  const b = $('bubble'); tmpV.set(p.x, p.y + 1.75 + Math.min(p.stack.length, 32) * 0.19 * 0.4, p.z).project(camera);
  b.style.left = (tmpV.x * 0.5 + 0.5) * innerWidth + 'px'; b.style.top = (-tmpV.y * 0.5 + 0.5) * innerHeight + 'px';
  b.textContent = p.bricks; b.classList.toggle('empty', p.bricks === 0 && p.locn.t === 1);
  $('coins').textContent = S.coins;
  if (level === 1 && p.locn.t === 1) $('hint').style.opacity = 0;
}
const clock = new THREE.Clock();
function loop() {
  const dt = Math.min(clock.getDelta(), 0.05);
  if (state !== 'menu') update(dt);
  frame(dt); renderer.render(scene, camera); requestAnimationFrame(loop);
}

// ---------- menu ----------
let prevState = 'play';
function drawMenu() {
  $('mCoins').textContent = S.coins; $('mLvl').textContent = S.level;
  $('hats').innerHTML = HATS.map((h, i) => `<button data-h="${i}" class="${S.hat === i ? 'on' : ''} ${S.hats.includes(i) ? '' : 'lock'}">${h.name}<br>${S.hats.includes(i) ? (S.hat === i ? 'worn' : 'wear') : h.cost + ' coins'}</button>`).join('');
}
$('hats').addEventListener('click', (e) => {
  const bt = e.target.closest('button'); if (!bt) return; const i = +bt.dataset.h;
  if (!S.hats.includes(i)) { if (S.coins < HATS[i].cost) { SFX.block(); return; } S.coins -= HATS[i].cost; S.hats.push(i); }
  S.hat = i; save(); setHat(player.hat, i); SFX.ui(); drawMenu();
});
function toggleMenu(force) {
  const open = force ?? $('menu').classList.contains('hide');
  if (open) { if (state !== 'menu') prevState = state; state = 'menu'; drawMenu(); $('menu').classList.remove('hide'); }
  else { state = prevState; $('menu').classList.add('hide'); }
}
$('menuBtn').onclick = () => { SFX.ui(); toggleMenu(); };
$('playBtn').onclick = () => { SFX.ui(); toggleMenu(false); };
$('nextBtn').onclick = nextFromEnd;
$('endMenu').onclick = () => { $('end').classList.add('hide'); buildLevel(winner && winner.isPlayer ? level + 1 : level); toggleMenu(true); };

buildLevel(S.level);
if (Q.has('title')) toggleMenu(true);
loop();

// test hooks
window.__G = {
  get state() { return state; }, get chars() { return chars; }, get winner() { return winner ? winner.i : null; }, get level() { return level; }, get gaps() { return gaps; },
  set auto(v) { auto = v; }, start: (L) => buildLevel(L), next: nextFromEnd,
  fast(sec, dt = 1 / 30) { for (let t = 0; t < sec && state === 'play'; t += dt) update(dt); frame(1); },
  painted: () => stairs.flat(2).filter((s) => s.owner).length,
};
