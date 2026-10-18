// FREEZE RUN - run while the giant Marigold looks away, freeze when she turns.
import * as THREE from 'three';
import { sfx } from './audio.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const PAL = ['#ff9fb2', '#9ad7ff', '#c4b5ff', '#ffd36e', '#8fe0b4', '#ffb38a', '#a7f0e8', '#f5b8ff'];
const INK = new THREE.Color('#3b2d4a');
const FOG = new THREE.Color('#fbe3e8');
const HALF_W = 14;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene();
scene.background = FOG.clone();
const cam = new THREE.PerspectiveCamera(60, 1, 0.1, 600);
function resize() { renderer.setSize(innerWidth, innerHeight, false); cam.aspect = innerWidth / innerHeight; cam.fov = cam.aspect < 0.8 ? 74 : 60; cam.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- custom materials: two-band toon + ink hull ----------
const LDIR = new THREE.Vector3(0.45, 0.85, 0.35).normalize();
const fogU = { uFog: { value: FOG }, uFogNear: { value: 70 }, uFogFar: { value: 260 } };
const toonCache = new Map();
function toon(hex, glow = 0) {
  const k = hex + glow; if (toonCache.has(k)) return toonCache.get(k);
  const c = new THREE.Color(hex), sh = c.clone().lerp(new THREE.Color('#7a5c9a'), 0.32);
  const m = new THREE.ShaderMaterial({
    uniforms: { uColor: { value: c }, uShade: { value: sh }, uL: { value: LDIR }, uGlow: { value: glow }, ...fogU },
    vertexShader: `varying vec3 vN; varying vec3 vW;
      void main(){ vec4 w = modelMatrix*vec4(position,1.); vW=w.xyz; vN=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `uniform vec3 uColor,uShade,uL,uFog; uniform float uFogNear,uFogFar,uGlow; varying vec3 vN; varying vec3 vW;
      void main(){ vec3 n=normalize(vN); float d=dot(n,uL);
        vec3 c=mix(uShade,uColor,smoothstep(-0.04,0.04,d));
        c=mix(c,min(c+vec3(0.13),vec3(1.)),smoothstep(0.86,0.9,d));
        vec3 V=normalize(cameraPosition-vW); float rim=1.-max(dot(n,V),0.);
        c+=smoothstep(0.62,0.7,rim)*0.07;
        c=mix(c,uColor*1.15,uGlow);
        float f=smoothstep(uFogNear,uFogFar,length(vW-cameraPosition)); gl_FragColor=vec4(mix(c,uFog,f),1.); }`,
  });
  toonCache.set(k, m); return m;
}
const inkMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, uniforms: { uW: { value: 0.045 }, uInk: { value: INK }, ...fogU },
  vertexShader: `uniform float uW; varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position+normal*uW,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform vec3 uInk,uFog; uniform float uFogNear,uFogFar; varying vec3 vW; void main(){ float f=smoothstep(uFogNear,uFogFar,length(vW-cameraPosition)); gl_FragColor=vec4(mix(uInk,uFog,f),1.); }`,
});
const inkThick = inkMat.clone(); inkThick.uniforms = { ...inkMat.uniforms, uW: { value: 0.14 } };
function mesh(geo, hex, ink = inkMat, glow = 0) {
  const g = new THREE.Group(); const m = new THREE.Mesh(geo, toon(hex, glow)); g.add(m);
  if (ink) g.add(new THREE.Mesh(geo, ink));
  g.userData.m = m; return g;
}
const shadowMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
  vertexShader: `varying vec2 vU; void main(){ vU=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec2 vU; void main(){ float d=length(vU-.5)*2.; gl_FragColor=vec4(0.36,0.22,0.45,(1.-smoothstep(.55,1.,d))*0.32); }`,
});
const shadowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
function blob(s) { const m = new THREE.Mesh(shadowGeo, shadowMat); m.scale.set(s, 1, s); m.position.y = 0.02; return m; }
function blobAt(s, x, z) { const m = blob(s); m.position.set(x, 0.02, z); return m; }

// ---------- sky ----------
scene.add(new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false,
  vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vP; void main(){ float h=vP.y; vec3 c=mix(vec3(.984,.89,.91),vec3(.78,.84,1.),smoothstep(0.,.5,h));
    float sun=1.-smoothstep(.06,.065,distance(vP,normalize(vec3(-.3,.32,-1.)))); c=mix(c,vec3(1.,.93,.7),sun);
    float ring=1.-smoothstep(.0,.006,abs(distance(vP,normalize(vec3(-.3,.32,-1.)))-.09)); c=mix(c,vec3(1.,.93,.7),ring*.8);
    gl_FragColor=vec4(c,1.); }`,
})));

// ---------- ground (field shader) ----------
const groundU = { uLen: { value: 80 }, ...fogU };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(900, 900).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: groundU,
  vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `uniform float uLen,uFogNear,uFogFar; uniform vec3 uFog; varying vec3 vW;
    void main(){ vec2 p=vW.xz; float hw=${HALF_W.toFixed(1)};
      float inF=step(abs(p.x),hw)*step(-uLen-8.,p.y)*step(p.y,10.);
      vec3 f=mix(vec3(.66,.89,.80),vec3(.60,.85,.75),step(.5,fract(p.x/4.)));
      vec2 g=fract(p/3.)-.5; f=mix(f,vec3(.76,.94,.87),(1.-smoothstep(.09,.11,length(g)))*.7);
      f=mix(f,vec3(1.,.97,.92),1.-smoothstep(.42,.5,abs(p.y)));
      float fin=1.-smoothstep(.95,1.05,abs(p.y+uLen)); float ch=mod(floor(p.x*.8)+floor((p.y+uLen)*.8+.5),2.);
      f=mix(f,mix(vec3(1.,.55,.62),vec3(1.,.97,.92),ch),fin);
      f=mix(f,vec3(1.,.97,.92),smoothstep(hw-.75,hw-.65,abs(p.x)));
      vec3 o=vec3(.99,.84,.75); vec2 q=fract(p/5.+vec2(.5*step(.5,fract(p.y/10.)),0.))-.5;
      o=mix(o,vec3(.97,.76,.70),1.-smoothstep(.16,.18,length(q)));
      vec3 c=mix(o,f,inF);
      float fg=smoothstep(uFogNear,uFogFar,length(vW-cameraPosition)); gl_FragColor=vec4(mix(c,uFog,fg),1.); }`,
}));
scene.add(ground);

// ---------- static scenery (rebuilt per level) ----------
const G_SPH = new THREE.SphereGeometry(1, 28, 18), G_CAP = new THREE.CapsuleGeometry(0.42, 0.55, 6, 16);
const G_CYL = new THREE.CylinderGeometry(1, 1, 1, 24), G_CONE = new THREE.ConeGeometry(1, 1, 32);
let world = new THREE.Group(); scene.add(world);
function buildScenery(len) {
  scene.remove(world); world = new THREE.Group(); scene.add(world);
  for (let z = 12; z > -len - 30; z -= 9) for (const s of [-1, 1]) {
    const x = s * (HALF_W + 4 + Math.sin(z * 1.3) * 1.5);
    const k = Math.abs(Math.round(z / 9)) % 3;
    if (k === 0) { // lollipop tree
      const st = mesh(G_CYL, '#fff8ef'); st.scale.set(0.25, 4, 0.25); st.position.set(x, 2, z);
      const top = mesh(G_SPH, PAL[(Math.abs(z) / 9 | 0) % PAL.length], inkThick); top.scale.setScalar(2.3); top.position.set(x, 5.6, z);
      world.add(st, top, blobAt(4, x, z));
    } else if (k === 1) { // pill pillar
      const p = mesh(new THREE.CapsuleGeometry(1.2, 3 + (z & 3), 6, 18), PAL[(Math.abs(z) / 3 | 0) % PAL.length], inkThick); p.position.set(x, 2.8, z);
      world.add(p, blobAt(4, x, z));
    } else { // bean bush
      const b = mesh(G_SPH, '#8fe0b4', inkThick); b.scale.set(2.6, 1.4, 1.8); b.position.set(x, 0.9, z); world.add(b);
    }
  }
  // finish arch
  const arch = mesh(new THREE.TorusGeometry(HALF_W, 0.7, 14, 60, Math.PI), '#ff9fb2', inkThick); arch.position.set(0, 0, -len); world.add(arch);
  // clouds
  for (let i = 0; i < 14; i++) {
    const c = new THREE.Group(), cx = rand(-140, 140), cz = rand(-len - 220, -60), cy = rand(35, 80);
    for (let j = 0; j < 3; j++) { const s = mesh(G_SPH, '#ffffff', null); s.scale.set(rand(8, 13), rand(4, 6), 6); s.position.set(j * 9 - 9, j === 1 ? 2 : 0, 0); c.add(s); }
    c.position.set(cx, cy, cz); world.add(c);
  }
}

// ---------- the watcher: giant Marigold ----------
const W = { group: new THREE.Group(), head: new THREE.Group(), eyes: [], beam: null, rot: Math.PI, target: Math.PI };
(function buildWatcher() {
  const g = W.group;
  const dress = mesh(G_CONE, '#c4b5ff', inkThick); dress.scale.set(6, 10, 6); dress.position.y = 5; g.add(dress);
  const hem = mesh(new THREE.TorusGeometry(5.6, 0.7, 12, 40), '#fff8ef', inkThick); hem.rotation.x = Math.PI / 2; hem.position.y = 0.6; g.add(hem);
  for (const s of [-1, 1]) { const a = mesh(new THREE.CapsuleGeometry(0.9, 5, 6, 14), '#ffe6cf', inkThick); a.position.set(s * 3.2, 7, 0); a.rotation.z = s * 0.5; g.add(a); }
  const h = W.head; h.position.y = 12.5; g.add(h);
  const face = mesh(G_SPH, '#ffe6cf', inkThick); face.scale.setScalar(3.6); h.add(face);
  for (let i = 0; i < 12; i++) { // petals ring
    const a = i / 12 * Math.PI * 2, p = mesh(G_SPH, i % 2 ? '#ffb347' : '#ffc96b', inkThick);
    p.scale.set(1.7, 1.7, 0.9); p.position.set(Math.cos(a) * 4.4, Math.sin(a) * 4.4, -0.8); h.add(p);
  }
  const back = mesh(G_SPH, '#ffb347', inkThick); back.scale.set(3.3, 3.3, 1.2); back.position.z = -2.5; h.add(back);
  for (const s of [-1, 1]) {
    const e = mesh(G_SPH, '#3b2d4a', null); e.scale.set(0.45, 0.7, 0.3); e.position.set(s * 1.2, 0.5, 3.35); h.add(e); W.eyes.push(e.userData.m);
    const b = mesh(G_SPH, '#ff9fb2', null); b.scale.set(0.6, 0.35, 0.2); b.position.set(s * 2.0, -0.6, 3.05); h.add(b);
  }
  const mouth = mesh(new THREE.TorusGeometry(0.6, 0.14, 8, 20, Math.PI), '#3b2d4a', null); mouth.rotation.z = Math.PI; mouth.position.set(0, -0.9, 3.45); h.add(mouth);
  W.beam = new THREE.Mesh(new THREE.ConeGeometry(16, 60, 40, 1, true).translate(0, -30, 0).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a93', transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  W.beam.position.z = 3; h.add(W.beam);
  g.add(blob(14)); scene.add(g);
})();
const eyeOn = toon('#ff4f74', 0.9), eyeOff = toon('#3b2d4a');

// ---------- runners ----------
const runners = []; let player = null;
function makeRunner(color, isPlayer) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const torso = mesh(G_CAP, color); torso.position.y = 0.85; body.add(torso);
  const head = mesh(G_SPH, '#ffe6cf'); head.scale.setScalar(0.36); head.position.y = 1.62; body.add(head);
  const feet = [-1, 1].map((s) => { const f = mesh(G_SPH, '#fff8ef'); f.scale.set(0.16, 0.12, 0.22); f.position.set(s * 0.2, 0.12, 0); body.add(f); return f; });
  if (isPlayer) {
    const hat = mesh(G_CONE, '#ff7a93'); hat.scale.set(0.32, 0.5, 0.32); hat.position.y = 2.1; body.add(hat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.7, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#ff7a93', transparent: true, opacity: 0.9, depthWrite: false }));
    ring.position.y = 0.03; g.add(ring);
  }
  g.add(blob(1.3)); scene.add(g);
  return { g, body, feet, color, isPlayer, x: 0, z: 0, v: 0, vx: 0, dead: false, done: false, phase: Math.random() * 6, react: 0.3, caution: 0.2, resumeAt: 0, lane: 0, top: rand(5.4, 6.8), num: 0, finishT: 0, deadT: 0 };
}

// ---------- effects: confetti + splats + dust ----------
const CONF = 500, confMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.14), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), CONF);
confMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); confMesh.frustumCulled = false; scene.add(confMesh);
const conf = []; for (let i = 0; i < CONF; i++) { conf.push({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }); confMesh.setColorAt(i, new THREE.Color(PAL[i % PAL.length])); }
let confI = 0; const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), ZERO = new THREE.Vector3(0, 0, 0);
function burst(x, y, z, n, power = 6) { for (let i = 0; i < n; i++) { const c = conf[confI++ % CONF]; c.life = rand(1.2, 2.2); c.p.set(x, y, z); c.v.set(rand(-1, 1) * power, rand(3, 9), rand(-1, 1) * power); c.w.set(rand(-9, 9), rand(-9, 9), rand(-9, 9)); } }
const DUST = 60, dustMesh = new THREE.InstancedMesh(G_SPH, toon('#fff8ef'), DUST); dustMesh.frustumCulled = false; scene.add(dustMesh);
const dust = Array.from({ length: DUST }, () => ({ life: 0, p: new THREE.Vector3() })); let dustI = 0;
function puff(x, z) { const d = dust[dustI++ % DUST]; d.life = 0.5; d.p.set(x + rand(-0.2, 0.2), 0.15, z + 0.3); }
let splats = new THREE.Group(); scene.add(splats);
const splatGeo = new THREE.CircleGeometry(1, 10).rotateX(-Math.PI / 2);
function splat(x, z, color) { const m = new THREE.Mesh(splatGeo, new THREE.MeshBasicMaterial({ color, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3 })); m.position.set(x, 0.03, z); m.rotation.y = rand(0, 6); m.scale.setScalar(rand(0.9, 1.3)); splats.add(m); }
function stepFx(dt) {
  for (let i = 0; i < CONF; i++) {
    const c = conf[i];
    if (c.life > 0) { c.life -= dt; c.v.y -= 14 * dt; c.v.multiplyScalar(1 - 1.5 * dt); c.p.addScaledVector(c.v, dt); if (c.p.y < 0.05) { c.p.y = 0.05; c.v.set(0, 0, 0); c.w.multiplyScalar(0.9); } c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt; _q.setFromEuler(c.r); _m.compose(c.p, _q, _s.setScalar(c.life > 0.3 ? 1 : c.life / 0.3)); }
    else _m.compose(c.p, _q, ZERO);
    confMesh.setMatrixAt(i, _m);
  }
  confMesh.instanceMatrix.needsUpdate = true;
  for (let i = 0; i < DUST; i++) { const d = dust[i]; if (d.life > 0) { d.life -= dt; d.p.y += dt * 0.8; } _m.compose(d.p, _q.identity(), _s.setScalar(d.life > 0 ? 0.08 + (0.5 - d.life) * 0.5 : 0)); dustMesh.setMatrixAt(i, _m); }
  dustMesh.instanceMatrix.needsUpdate = true;
}

// ---------- obstacles ----------
let obst = [];
function buildObstacles(n, len) {
  obst = [];
  for (let i = 0; i < n; i++) {
    const z = -rand(14, len - 10), x = rand(-HALF_W + 2, HALF_W - 2), r = rand(1.0, 1.6);
    const stem = mesh(G_CYL, '#fff8ef'); stem.scale.set(r * 0.5, 1.1, r * 0.5); stem.position.set(x, 0.55, z);
    const cap = mesh(G_SPH, PAL[i % PAL.length], inkThick); cap.scale.set(r * 1.1, r * 0.6, r * 1.1); cap.position.set(x, 1.2, z);
    world.add(stem, cap, blobAt(r * 2.6, x, z));
    obst.push({ x, z, r: r + 0.35, cap });
  }
}

// ---------- levels + progress ----------
const store = { get(k, d) { try { const v = localStorage.getItem('freezerun.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { localStorage.setItem('freezerun.' + k, JSON.stringify(v)); } catch {} } };
let unlocked = store.get('unlocked', 0), stars = store.get('stars', {});
const NAMED = 12;
function levelCfg(n) {
  return {
    len: 70 + n * 9, time: 34 + n * 6.5, bots: Math.min(18 + n * 3, 40),
    gMin: Math.max(1.5, 4 - n * 0.22), gMax: Math.max(2.6, 6.2 - n * 0.3),
    rMin: 1.5 + n * 0.05, rMax: 2.3 + n * 0.15, obstacles: n >= 2 ? Math.min(3 + n * 2, 26) : 0,
    fake: n >= 4 ? Math.min(0.2 + n * 0.04, 0.55) : 0, turn: Math.max(0.3, 0.5 - n * 0.018),
  };
}

// ---------- game state ----------
const G = window.__G = { state: 'boot', level: 0, t: 0, auto: Q.has('auto'), mute: Q.has('mute'), runners, levelCfg, NAMED };
let cfg, phase = 'intro', phaseT = 0, phaseDur = 3, songNotes = [], noteI = 0, fakeAt = -1, fakeT = -1, timeLeft = 0, slow = 1, shake = 0, endT = 0, stepClock = 0;
sfx.mute(G.mute);

function start(n) {
  G.level = n; cfg = levelCfg(n); G.state = 'play'; G.t = 0;
  for (const r of runners) scene.remove(r.g); runners.length = 0;
  scene.remove(splats); splats = new THREE.Group(); scene.add(splats);
  buildScenery(cfg.len); buildObstacles(cfg.obstacles, cfg.len); groundU.uLen.value = cfg.len;
  W.group.position.set(0, 0, -cfg.len - 12); W.rot = W.target = 0;
  player = makeRunner('#ff7a93', true); player.num = 1; player.x = 0; player.z = 7; runners.push(player);
  const used = new Set([1]);
  for (let i = 0; i < cfg.bots; i++) {
    const b = makeRunner(PAL[i % PAL.length], false); let num; do num = 2 + (Math.random() * 455 | 0); while (used.has(num)); used.add(num); b.num = num;
    b.x = b.lane = ((i % 10) - 4.5) * 2.6 + rand(-0.4, 0.4); b.z = 4 + Math.floor(i / 10) * 2.2 + rand(0, 0.5); runners.push(b);
  }
  phase = 'intro'; phaseT = 0; phaseDur = 3; timeLeft = cfg.time; slow = 1; endT = 0;
  $('card').classList.add('hide'); $('menu').classList.add('hide'); $('hint').classList.remove('off');
  $('lvl').textContent = 'LEVEL ' + (n + 1); $('feed').innerHTML = '';
  banner('3', ''); G.player = player;
}
G.start = start;

function setPhase(p) {
  phase = p; phaseT = 0;
  if (p === 'green') {
    phaseDur = rand(cfg.gMin, cfg.gMax); W.target = Math.PI;
    const step = clamp(phaseDur / 9, 0.2, 0.42); songNotes = []; for (let t = 0.15; t < phaseDur - 0.05; t += step) songNotes.push(t); noteI = 0;
    fakeAt = Math.random() < cfg.fake && phaseDur > 2.6 ? rand(0.8, phaseDur - 1.2) : -1; fakeT = -1;
    for (const r of runners) if (!r.isPlayer) { r.resumeAt = rand(0.05, 0.45); r.react = 0.12 + Math.random() ** 2 * 0.7; r.caution = rand(-0.15, 0.6); r.nervous = Math.random() < 0.4; }
    edge('green'); if (G.t > 3.5) banner('GO!', 'green');
  } else if (p === 'turning') { phaseDur = cfg.turn; W.target = 0; sfx.whoosh(); }
  else if (p === 'red') { phaseDur = rand(cfg.rMin, cfg.rMax); edge('red'); banner('FREEZE!', 'red'); sfx.buzz(); }
  else if (p === 'back') { phaseDur = 0.35; W.target = Math.PI; }
}

// ---------- input ----------
const keys = new Set(); let pointerDown = false, pointerX0 = 0, steerTouch = 0;
addEventListener('keydown', (e) => {
  keys.add(e.code); sfx.unlock();
  if (e.code === 'KeyM') { G.mute = !G.mute; sfx.mute(G.mute); }
  if (G.state === 'result' && endT > 0.6 && (e.code === 'Enter' || e.code === 'Space')) (G.won ? next() : start(G.level));
  if (G.state === 'result' && e.code === 'KeyR') start(G.level);
  if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
});
addEventListener('keyup', (e) => keys.delete(e.code));
const cv = $('c');
cv.addEventListener('pointerdown', (e) => { pointerDown = true; pointerX0 = e.clientX; steerTouch = 0; sfx.unlock(); });
addEventListener('pointermove', (e) => { if (pointerDown) steerTouch = clamp((e.clientX - pointerX0) / 60, -1, 1); });
addEventListener('pointerup', () => { pointerDown = false; steerTouch = 0; });
addEventListener('pointercancel', () => { pointerDown = false; steerTouch = 0; });
function wantRun() {
  if (G.auto) return phase === 'green' && fakeT < 0 && phaseDur - phaseT > 0.4 + (G.autoGreed || 0);
  if (G.forceRun) return true;
  return keys.has('Space') || keys.has('KeyW') || keys.has('ArrowUp') || pointerDown;
}
function steerIn() { if (G.auto) { let tx = player.x; for (const o of obst) if (o.z < player.z && player.z - o.z < 7 && Math.abs(o.x - player.x) < o.r + 0.7) tx = o.x + (player.x >= o.x ? 1 : -1) * (o.r + 1.4); return clamp((tx - player.x) * 0.8, -1, 1); } return (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + steerTouch; }

// ---------- UI ----------
let bannerTimer = 0;
function banner(txt, cls) { const b = $('banner'); b.textContent = txt; b.className = ''; void b.offsetWidth; b.className = 'pop ' + cls; }
function edge(c) { $('edge').className = c; }
function feed(txt) { const d = document.createElement('div'); d.textContent = txt; $('feed').prepend(d); while ($('feed').children.length > 5) $('feed').lastChild.remove(); }
function fmt(s) { s = Math.max(0, Math.ceil(s)); return (s / 60 | 0) + ':' + String(s % 60).padStart(2, '0'); }
function showCard(won) {
  G.state = 'result'; G.won = won; endT = 0; edge('');
  const finished = runners.filter((r) => r.done).sort((a, b) => a.finishT - b.finishT), alive = runners.filter((r) => !r.dead).length;
  let st = 0;
  if (won) { const f = timeLeft / cfg.time; st = 1 + (f > 0.22) + (f > 0.42); const prev = stars[G.level] || 0; if (st > prev) stars[G.level] = st; if (G.level + 1 > unlocked) unlocked = G.level + 1; store.set('stars', stars); store.set('unlocked', unlocked); sfx.win(); }
  else sfx.lose();
  $('cardTitle').textContent = won ? 'SAFE!' : (timeLeft <= 0 ? 'TIME UP' : 'CAUGHT!');
  $('cardTitle').style.color = won ? '#4cc38a' : '#ff7a93';
  $('cardStars').innerHTML = won ? [0, 1, 2].map((i) => (i < st ? '★' : '<i>★</i>')).join('') : '';
  $('cardSub').innerHTML = won ? `Finished <b>#${finished.indexOf(player) + 1}</b> &middot; ${fmt(timeLeft)} left<br>${runners.length - alive} runners eliminated` : (timeLeft <= 0 ? 'The bell rang before you crossed.' : 'She saw you move!') + `<br>Level ${G.level + 1}`;
  $('bNext').style.display = won ? '' : 'none'; $('bRetry').classList.toggle('main', !won);
  $('card').classList.remove('hide'); $('hint').classList.add('off');
}
function next() { start(G.level + 1); }
$('bRetry').onclick = () => start(G.level); $('bNext').onclick = next; $('bMenu').onclick = menu; $('bPlay').onclick = () => start(Math.min(unlocked, 999));
function menu() {
  G.state = 'menu'; $('card').classList.add('hide'); $('hint').classList.add('off'); edge('');
  const lv = $('levels'); lv.innerHTML = '';
  for (let i = 0; i < Math.max(NAMED, unlocked + 1); i++) {
    const b = document.createElement('button'), s = stars[i] || 0; b.innerHTML = `${i + 1}<small>${'★'.repeat(s) || '&nbsp;'}</small>`;
    b.disabled = i > unlocked; b.onclick = () => start(i); lv.appendChild(b);
  }
  $('totStars').textContent = '★ ' + Object.values(stars).reduce((a, b) => a + b, 0) + ' stars';
  $('menu').classList.remove('hide');
}

// ---------- simulation ----------
function eliminate(r) {
  r.dead = true; r.deadT = 0; r.v = 0; burst(r.x, 1, r.z, r.isPlayer ? 70 : 34); splat(r.x, r.z, r.color); sfx.pop(r.isPlayer ? 1 : clamp(1 - Math.abs(r.z - player.z) / 60, 0.15, 0.8));
  const d = Math.hypot(r.x - player.x, r.z - player.z); shake = Math.max(shake, r.isPlayer ? 0.6 : clamp(0.35 - d / 60, 0, 0.3));
  feed(r.isPlayer ? 'No. 001 - YOU' : 'No. ' + String(r.num).padStart(3, '0') + ' out');
  if (r.isPlayer) { slow = 0.3; G.state = 'dying'; endT = 0; edge('red'); }
}
function step(dt) {
  G.t += dt; phaseT += dt;
  // watcher phases
  if (phase === 'intro' && phaseT >= phaseDur) setPhase('green');
  else if (phase === 'intro') { const k = Math.ceil(phaseDur - phaseT); if (String(k) !== $('banner').textContent && k > 0) { banner(String(k), ''); sfx.tick(); } }
  else if (phase === 'green') {
    while (noteI < songNotes.length && phaseT >= songNotes[noteI]) { sfx.note(noteI, songNotes.length); noteI++; }
    if (fakeAt > 0 && fakeT < 0 && phaseT >= fakeAt) { fakeT = 0; sfx.fake(); }
    if (fakeT >= 0) { fakeT += dt; W.target = Math.PI * (fakeT < 0.3 ? 0.55 : 1); if (fakeT > 0.6) { fakeT = -1; fakeAt = -1; W.target = Math.PI; } }
    if (phaseT >= phaseDur) setPhase('turning');
  } else if (phase === 'turning' && phaseT >= phaseDur) setPhase('red');
  else if (phase === 'red' && phaseT >= phaseDur) setPhase('back');
  else if (phase === 'back' && phaseT >= phaseDur) setPhase('green');
  W.rot += (W.target - W.rot) * (1 - Math.exp(-dt * (phase === 'turning' ? 14 : 9)));
  const watching = phase === 'red' && phaseT > 0.1;
  if (G.state === 'play' && phase !== 'intro') { timeLeft -= dt; if (timeLeft <= 0) { timeLeft = 0; for (const r of runners) if (!r.dead && !r.done) eliminate(r); } }

  for (const r of runners) {
    if (r.dead) { r.deadT += dt; continue; }
    let run = false, sx = 0;
    if (r.done) { run = r.z > -cfg.len - 6; }
    else if (r.isPlayer) { run = G.state === 'play' && phase !== 'intro' && wantRun(); sx = G.state === 'play' ? steerIn() : 0; }
    else if (phase === 'green') run = phaseT >= r.resumeAt && !(fakeT >= 0 && r.nervous) && (phaseDur - phaseT > r.caution);
    else if (phase === 'turning') run = r.caution <= 0 && phaseT < r.react;
    else if (phase === 'red') run = r.caution <= 0 && phaseT + cfg.turn < r.react;
    // bots: steer to lane, dodge obstacles
    if (!r.isPlayer && !r.done) {
      let tx = r.lane;
      for (const o of obst) if (o.z < r.z && r.z - o.z < 6 && Math.abs(o.x - r.x) < o.r + 0.6) tx = o.x + (r.x >= o.x ? 1 : -1) * (o.r + 1.2);
      sx = clamp((tx - r.x) * 0.8, -1, 1);
    }
    const top = r.isPlayer ? 7.2 : r.top;
    r.v = run ? Math.min(top, r.v + 26 * dt) : Math.max(0, r.v - 46 * dt);
    r.vx += (sx * 4.5 * (r.v > 0.3 || r.isPlayer ? 1 : 0.4) - r.vx) * (1 - Math.exp(-dt * 10));
    r.z -= r.v * dt; r.x = clamp(r.x + r.vx * dt, -HALF_W + 0.8, HALF_W - 0.8);
    for (const o of obst) { const dx = r.x - o.x, dz = r.z - o.z, d = Math.hypot(dx, dz); if (d < o.r) { const k = (o.r - d) / (d || 1); r.x += dx * k; r.z += dz * k; if (r.isPlayer && r.v > 3) { r.v *= 0.4; sfx.bonk(); o.cap.scale.y *= 0.8; } } }
    if (!r.done && r.z < -cfg.len) { r.done = true; r.finishT = G.t; if (r.isPlayer) { G.state = 'safe'; endT = 0; banner('SAFE!', 'green'); burst(r.x, 1.5, r.z, 90, 8); sfx.cheer(); } }
    if (watching && !r.done && r.v > 0.35) eliminate(r);
    if (r.isPlayer && r.v > 2) { stepClock += dt * r.v; if (stepClock > 2.1) { stepClock = 0; sfx.step(); puff(r.x, r.z); } }
  }
  // separation between runners
  for (let i = 0; i < runners.length; i++) for (let j = i + 1; j < runners.length; j++) {
    const a = runners[i], b = runners[j]; if (a.dead || b.dead) continue;
    const dx = a.x - b.x, dz = a.z - b.z, d2 = dx * dx + dz * dz; if (d2 < 0.7 && d2 > 1e-6) { const d = Math.sqrt(d2), k = (0.84 - d) / d * 0.5; a.x += dx * k; a.z += dz * k; b.x -= dx * k; b.z -= dz * k; }
  }
  if (G.state === 'dying' || G.state === 'safe') { endT += dt; if (endT > (G.state === 'dying' ? 0.55 : 1.4)) showCard(G.state === 'safe'); }
  else if (G.state === 'result') endT += dt;
  stepFx(dt);
}
G.fast = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) step(dt); };
G.info = () => ({ state: G.state, level: G.level, phase, alive: runners.filter((r) => !r.dead).length, done: runners.filter((r) => r.done).length, total: runners.length, z: player.z.toFixed(1), len: cfg.len, timeLeft: timeLeft.toFixed(1) });

// ---------- render sync ----------
const camPos = new THREE.Vector3(0, 30, 40), camLook = new THREE.Vector3();
function sync(dt, rdt) {
  for (const r of runners) {
    if (r.dead) { const k = clamp(r.deadT * 6, 0, 1); r.g.visible = r.deadT < 0.25; r.body.scale.set(1 + k * 0.6, 1 - k * 0.7, 1 + k * 0.6); continue; }
    r.g.position.set(r.x, 0, r.z);
    const s = r.v / 7; r.phase += dt * (4 + r.v * 2.2);
    const bob = Math.abs(Math.sin(r.phase)) * 0.18 * s;
    r.body.position.y = bob; r.body.rotation.x = -0.28 * s; r.body.rotation.z = -r.vx * 0.05;
    r.body.scale.set(1 + 0.05 * s * Math.cos(r.phase * 2), 1 - 0.05 * s * Math.cos(r.phase * 2), 1);
    r.feet[0].position.z = Math.sin(r.phase) * 0.3 * s; r.feet[1].position.z = -Math.sin(r.phase) * 0.3 * s;
    if (r.v < 0.1 && phase === 'red' && !r.done) r.body.rotation.z = Math.sin(G.t * 40 + r.num) * 0.015; // trembling freeze
  }
  W.head.rotation.y = W.rot; W.group.children[0].rotation.y = W.rot * 0.15;
  const look = 1 - clamp(Math.abs(W.rot) / 1.2, 0, 1);
  for (const e of W.eyes) e.material = look > 0.6 ? eyeOn : eyeOff;
  W.beam.material.opacity = (phase === 'red' ? 0.16 + Math.sin(G.t * 10) * 0.03 : 0) * look;
  W.beam.rotation.y = Math.sin(G.t * 1.7) * 0.25;
  // camera
  const intro = phase === 'intro' ? 1 - clamp(phaseT / 2.6, 0, 1) : 0, ease = intro * intro * (3 - 2 * intro);
  const fwd = player.done ? 7 : 0;
  const tgt = new THREE.Vector3(player.x * 0.6, 4.6, player.z + 8.5 - fwd);
  tgt.lerp(new THREE.Vector3(0, 22, W.group.position.z + 34), ease);
  if (G.state === 'dying' || (G.state === 'result' && !G.won)) tgt.set(player.x + 2.5, 2.6, player.z + 5);
  camPos.lerp(tgt, 1 - Math.exp(-rdt * 5));
  const lk = new THREE.Vector3(player.x * 0.8, 1.6, player.z - 10).lerp(new THREE.Vector3(0, 10, W.group.position.z), ease);
  if (G.state === 'dying' || (G.state === 'result' && !G.won)) lk.set(player.x, 0.8, player.z);
  camLook.lerp(lk, 1 - Math.exp(-rdt * 6));
  shake = Math.max(0, shake - rdt * 1.4);
  cam.position.copy(camPos).add(new THREE.Vector3(rand(-1, 1), rand(-1, 1), 0).multiplyScalar(shake * 0.5));
  cam.lookAt(camLook);
  const baseF = cam.aspect < 0.8 ? 74 : 60; cam.fov += (baseF + (player.v / 7.2) * 7 - cam.fov) * (1 - Math.exp(-rdt * 4)); cam.updateProjectionMatrix();
  // hud
  $('timer').textContent = fmt(timeLeft); $('timer').classList.toggle('low', timeLeft < 8);
  $('alive').textContent = 'ALIVE ' + runners.filter((r) => !r.dead).length + '/' + runners.length;
  const pr = clamp((7 - player.z) / (cfg.len + 7), 0, 1); $('trackFill').style.width = pr * 100 + '%'; $('trackDot').style.left = pr * 100 + '%';
  if (player.v > 1 && G.t > 6) $('hint').classList.add('off');
}

// ---------- loop ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  if (G.paused) return;
  if (G.state !== 'menu' && cfg) { const dt = rdt * (G.state === 'dying' ? slow : 1); step(dt); sync(dt, rdt); }
  else { W.rot = Math.sin(now / 1500) * 0.4; W.head.rotation.y = W.rot; cam.position.set(Math.sin(now / 6000) * 20, 14, W.group.position.z + 40); cam.lookAt(0, 9, W.group.position.z); }
  renderer.render(scene, cam);
}
if (Q.has('title')) { cfg = levelCfg(0); buildScenery(cfg.len); groundU.uLen.value = cfg.len; W.group.position.set(0, 0, -cfg.len - 12); menu(); cfg = null; }
else start(Q.has('level') ? Math.max(0, +Q.get('level') - 1) : unlocked);
requestAnimationFrame(frame);
