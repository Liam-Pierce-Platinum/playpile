// TUNNEL DIVE - op-art kaleidoscope tunnel runner. Rotate the tunnel, slip through the gaps.
import * as THREE from '../vendor/three.module.js';
import { Sound } from './audio.js';

const Q = new URLSearchParams(location.search);
const TAU = Math.PI * 2, R = 4, NS = 12, STEP = TAU / NS, PZ = -2, FAR = -150;
const $ = (id) => document.getElementById(id);
const store = { get(k, d) { try { const v = localStorage.getItem('tdive_' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('tdive_' + k, JSON.stringify(v)); } catch {} } };
const wrap = (a) => ((a % TAU) + TAU) % TAU;
const sdiff = (a, b) => { let d = wrap(a - b); return d > Math.PI ? d - TAU : d; };

// ---------- renderer + post ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const rt = new THREE.WebGLRenderTarget(4, 4, { samples: 4 });
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xffffff);
const camera = new THREE.PerspectiveCamera(78, 1, 0.1, 400);
camera.position.set(0, -1.1, 3.2);
const world = new THREE.Group(); scene.add(world);

const post = new THREE.ShaderMaterial({
  uniforms: { tex: { value: rt.texture }, blur: { value: 0 }, inv: { value: 0 }, t: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, ab: { value: 0 } },
  vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=vec4(position.xy,0.,1.); }',
  fragmentShader: `uniform sampler2D tex; uniform float blur, inv, t, ab; uniform vec2 res; varying vec2 v;
  float h(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
  void main(){
    vec2 c=vec2(.5,.56), d=v-c; float r=length(d);
    vec2 uv=c+d*(1.-.06*r*r);                     // slight barrel
    float acc=0., w=0.;
    for(int i=0;i<10;i++){ float k=float(i)/9.; float s=1.-blur*k*r*.55;
      acc+=texture2D(tex,c+(uv-c)*s).r*(1.-k*.5); w+=1.-k*.5; }
    float col=acc/w;
    float split=texture2D(tex,c+(uv-c)*(1.+ab*.02)).r;  // mono "ghost" on impact
    col=mix(col,split,ab*.5);
    col=mix(col,1.-col,inv);
    col*=1.-smoothstep(.45,1.05,r)*.85;               // vignette
    col+=(h(v*res+t)-.5)*.09;                         // grain
    gl_FragColor=vec4(vec3(col),1.);
  }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

// ---------- tunnel ----------
const PAT = 4; // pattern modes
const tunnelU = { t: { value: 0 }, travel: { value: 0 }, rot: { value: 0 }, mode: { value: 0 }, mode2: { value: 1 }, mixm: { value: 0 }, beat: { value: 0 } };
const tunnel = new THREE.Mesh(new THREE.CylinderGeometry(R, R, 170, 96, 60, true), new THREE.ShaderMaterial({
  uniforms: tunnelU, side: THREE.BackSide,
  vertexShader: 'varying vec3 wp; varying float vz; void main(){ vec4 w=modelMatrix*vec4(position,1.); wp=w.xyz; vec4 m=viewMatrix*w; vz=-m.z; gl_Position=projectionMatrix*m; }',
  fragmentShader: `uniform float t, travel, rot, mode, mode2, mixm, beat; varying vec3 wp; varying float vz;
  #define TAU 6.2831853
  float sq(float x){ float f=clamp(fwidth(x),1e-4,.12); return clamp((abs(fract(x)-.5)-.25)/f+.5,0.,1.); }
  float pat(float m, float a, float z){
    float A=a/TAU;
    if(m<.5){ // warped checker
      float u=A*16.+sin(z*.21+t*.6)*.35, w=z*.42+sin(a*3.+t)*.25; float x=sq(u), y=sq(w); return abs(x-y);
    } else if(m<1.5){ // moire rings
      return sq(z*.55+.6*sin(a*4.+z*.11-t*.8)+.25*sin(a*9.));
    } else if(m<2.5){ // twin spirals
      float s1=sq(A*10.+z*.09), s2=sq(-A*10.+z*.09+t*.05); return abs(s1-s2);
    } else { // hypnotic radial fan with pulses
      float fan=sq(A*24.+sin(z*.08+t*.5)*1.5); float ring=sq(z*.18-t*.4); return mix(fan,1.-fan,ring);
    }
  }
  void main(){
    float a=atan(wp.y,wp.x)-rot; float z=-wp.z+travel;
    float c=mix(pat(mode,a,z),pat(mode2,a,z),mixm);
    float fog=smoothstep(14.,130.,vz);
    c=mix(c,1.,fog);
    c=mix(c,1.,beat*.12*(1.-fog));
    gl_FragColor=vec4(vec3(c),1.);
  }`,
}));
tunnel.rotation.x = Math.PI / 2; tunnel.position.z = -75; scene.add(tunnel);

// ---------- barriers ----------
const wedgeGeo = new THREE.RingGeometry(1.25, R + 0.05, 10, 4, 0, STEP);
const barMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 } }, side: THREE.DoubleSide,
  vertexShader: 'varying vec3 lp; varying float vz; void main(){ lp=position; vec4 m=modelViewMatrix*vec4(position,1.); vz=-m.z; gl_Position=projectionMatrix*m; }',
  fragmentShader: `uniform float t; varying vec3 lp; varying float vz;
  void main(){
    float r=length(lp.xy), a=atan(lp.y,lp.x);
    float e=min(min(a, ${STEP.toFixed(5)}-a)*r, min(r-1.25, ${R.toFixed(2)}-r));
    float f=fwidth(e);
    float stripe=fract(r*2.2 - t*1.5); float sf=fwidth(r*2.2);
    float s=smoothstep(.5-sf,.5+sf,stripe);
    float c=s;
    c=mix(1.,c,smoothstep(.20-f,.20+f,e));   // white rim
    c=mix(0.,c,smoothstep(.09-f,.09+f,e));   // black outline
    float fog=smoothstep(30.,140.,vz);
    gl_FragColor=vec4(vec3(mix(c,1.,fog)),1.);
  }`,
});
const gemGeo = new THREE.OctahedronGeometry(0.42, 0);
const gemMat = new THREE.ShaderMaterial({
  uniforms: { t: { value: 0 } },
  vertexShader: 'varying vec3 n; varying float vz; void main(){ n=normalize(normalMatrix*normal); vec4 m=modelViewMatrix*vec4(position,1.); vz=-m.z; gl_Position=projectionMatrix*m; }',
  fragmentShader: 'uniform float t; varying vec3 n; varying float vz; void main(){ float c=step(.5,fract((n.x+n.y)*3.+t*2.)); c=mix(c,1.,smoothstep(30.,140.,vz)); gl_FragColor=vec4(vec3(c),1.); }',
});

// ---------- player ----------
const ship = new THREE.Group();
{
  const body = new THREE.Mesh(new THREE.ConeGeometry(0.32, 1.1, 4), new THREE.MeshBasicMaterial({ color: 0x000000 }));
  body.rotation.x = -Math.PI / 2; body.rotation.y = Math.PI / 4; body.scale.set(1.25, 1, 0.45);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(body.geometry), new THREE.LineBasicMaterial({ color: 0xffffff }));
  body.add(edge); ship.add(body);
  const trail = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 2.4), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    vertexShader: 'varying vec2 v; void main(){ v=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }',
    fragmentShader: 'uniform float t; varying vec2 v; void main(){ float s=step(.5,fract(v.y*8.+t*10.)); gl_FragColor=vec4(vec3(s),v.y*.9); }',
    uniforms: { t: { value: 0 } },
  }));
  trail.rotation.x = -Math.PI / 2; trail.position.z = 1.6; ship.add(trail); ship.userData.trail = trail;
}
ship.scale.setScalar(1.5); ship.position.set(0, -R + 0.55, PZ); scene.add(ship);

// shards on crash
const shards = [];
const shardGeo = new THREE.TetrahedronGeometry(0.22);
const shardMats = [new THREE.MeshBasicMaterial({ color: 0 }), new THREE.MeshBasicMaterial({ color: 0xffffff })];
function burst(n, at, speed) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(shardGeo, shardMats[i & 1]); m.position.copy(at);
    m.userData.v = new THREE.Vector3((Math.random() - .5) * speed, Math.random() * speed * .8, (Math.random() - .3) * speed);
    m.userData.life = 1 + Math.random(); scene.add(m); shards.push(m);
  }
}

// ---------- game state ----------
const G = window.__G = {
  state: 'play', dist: 0, score: 0, level: 1, speed: 26, rot: 0, rotVel: 0, input: 0, obs: [], gems: [], spawnZ: -40,
  freeC: 0, mult: 1, streak: 0, best: store.get('best', 0), bestZone: store.get('zone', 1), t: 0, grace: 1.2,
  autopilot: Q.has('bot') || Q.has('title'), attract: Q.has('title'), passed: 0, closes: 0, gemsGot: 0, runs: 0, shake: 0, flash: 0, slow: 1, deadT: 0,
};
const snd = new Sound(Q.has('mute'));

function playerLocal(o) { return wrap(-Math.PI / 2 - G.rot - o.ang); }
function blockedAt(o, la) { return o.mask[Math.floor(wrap(la) / STEP) % NS]; }

function makeMask() {
  const L = G.level, m = new Array(NS).fill(1), r = Math.random();
  G.freeC = (G.freeC + Math.floor(Math.random() * 9) - 4 + NS) % NS;
  const c = G.freeC; let kind;
  if (L >= 2 && r < 0.18) { kind = 'spokes'; for (let i = 0; i < NS; i++) m[i] = (i + c) % 2; }
  else if (r < 0.36) { kind = 'half'; for (let i = 0; i < NS; i++) m[i] = 0; for (let i = 0; i < 6 + Math.min(L, 3); i++) m[(c + 3 + i) % NS] = 1; m[c] = 0; }
  else if (L >= 3 && r < 0.52) { kind = 'twin'; const w = Math.max(1, 3 - (L >> 2)); for (let i = -w + 1; i < w; i++) { m[(c + i + NS) % NS] = 0; m[(c + 6 + i + NS) % NS] = 0; } m[c] = 0; m[(c + 6) % NS] = 0; if (w === 1) { m[(c + 1) % NS] = 0; m[(c + 7) % NS] = 0; } }
  else { kind = 'gap'; const w = Math.max(2, 5 - (L >> 1)); for (let i = 0; i < w; i++) m[(c + i - (w >> 1) + NS) % NS] = 0; }
  const spin = L >= 3 && Math.random() < Math.min(0.5, 0.1 + L * 0.05) ? (Math.random() < .5 ? -1 : 1) * (0.5 + Math.min(L, 10) * 0.08) : 0;
  return { m, kind, spin };
}

function spawn(z) {
  const { m, kind, spin } = makeMask();
  const g = new THREE.Group();
  for (let i = 0; i < NS; i++) if (m[i]) { const w = new THREE.Mesh(wedgeGeo, barMat); w.rotation.z = i * STEP; g.add(w); }
  g.position.z = z; world.add(g);
  const o = { z, mask: m, kind, spin, ang: Math.random() * 0 , g, done: false };
  G.obs.push(o);
  // a gem in the next free lane, sometimes
  if (Math.random() < 0.45) {
    const free = []; for (let i = 0; i < NS; i++) if (!m[i]) free.push(i);
    const s = free[(Math.random() * free.length) | 0];
    const gm = new THREE.Mesh(gemGeo, gemMat);
    const gz = z + 7, la = s * STEP + STEP / 2;
    gm.position.set(Math.cos(la) * (R - 0.75), Math.sin(la) * (R - 0.75), gz);
    world.add(gm); G.gems.push({ z: gz, la, m: gm, spin: 0, done: false });
  }
}

function clearRun() {
  for (const o of G.obs) world.remove(o.g); for (const g of G.gems) world.remove(g.m);
  G.obs = []; G.gems = [];
}

function reset() {
  clearRun();
  Object.assign(G, { state: 'play', dist: 0, score: 0, level: 1, speed: 26, rotVel: 0, spawnZ: -45, mult: 1, streak: 0, grace: 1.0, passed: 0, closes: 0, gemsGot: 0, slow: 1, deadT: 0 });
  G.runs++; ship.visible = true; if (!G.attract) $('panel').className = 'hide';
  setZone(1, true); if (!G.attract) snd.levelUp();
}

const ZONES = ['CHECKER', 'MOIRE', 'SPIRAL', 'FAN'];
let lastMode = 0;
function setZone(L, quiet) {
  G.level = L;
  const mode = (L - 1) % PAT;
  tunnelU.mode.value = lastMode; tunnelU.mode2.value = mode; tunnelU.mixm.value = quiet ? 1 : 0; lastMode = mode;
  $('zone').textContent = 'ZONE ' + L;
  if (!quiet) { banner('ZONE ' + L, ZONES[mode]); snd.levelUp(); G.flash = 0.6; }
}
let bannerT = 0;
function banner(a, b) { const el = $('banner'); el.innerHTML = a + (b ? `<div style="font-size:.22em;letter-spacing:.6em">${b}</div>` : ''); el.className = 'on'; bannerT = 1.6; }
let popT = 0;
function pop(txt) { const el = $('pop'); el.textContent = txt; el.className = 'on'; popT = 0.7; }

function die() {
  G.state = 'dead'; G.deadT = 0; G.slow = 0.15; G.shake = 1; G.flash = 1; snd.crash();
  burst(28, ship.position, 9); ship.visible = false;
  const s = Math.floor(G.score), nb = s > G.best;
  if (nb) { G.best = s; store.set('best', s); }
  if (G.level > G.bestZone) { G.bestZone = G.level; store.set('zone', G.level); }
  setTimeout(() => { if (G.attract) reset(); else showPanel('over', nb); }, 900);
}

function showPanel(kind, nb) {
  const p = $('panel'); p.className = '';
  if (kind === 'title') {
    p.innerHTML = `<h1>TUNNEL<br>DIVE</h1><div class="stripe"></div><p>ROTATE THE TUNNEL. THREAD THE GAPS.</p><p>A / D · ◀ ▶ · OR HOLD LEFT / RIGHT SIDE</p><p>BEST ${G.best} · DEEPEST ZONE ${G.bestZone}</p><button id="go">DIVE</button>`;
  } else {
    p.innerHTML = `<h1>${nb ? 'NEW BEST' : 'WIPEOUT'}</h1><div class="stripe"></div><div class="big">${Math.floor(G.score)}</div><p>ZONE ${G.level} · ${G.passed} GATES · ${G.closes} CLOSE CALLS · ${G.gemsGot} PRISMS</p><p>BEST ${G.best} · DEEPEST ZONE ${G.bestZone}</p><button id="go">DIVE AGAIN</button><p style="opacity:.6">SPACE / TAP</p>`;
  }
  $('go').onclick = (e) => { e.stopPropagation(); snd.unlock(); G.autopilot = Q.has('bot'); G.attract = false; reset(); };
  G.panel = kind;
}

// ---------- input ----------
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true; snd.unlock();
  if (e.code === 'KeyM') snd.toggle();
  if ((e.code === 'Space' || e.code === 'Enter') && G.state === 'dead' && G.deadT > 0.6) reset();
  if ((e.code === 'Space' || e.code === 'Enter') && G.panel === 'title' && $('panel').className !== 'hide') { G.autopilot = false; G.attract = false; reset(); }
  if (e.code === 'KeyP' || e.code === 'Escape') { if (G.state === 'play') { G.state = 'pause'; banner('PAUSED'); } else if (G.state === 'pause') { G.state = 'play'; bannerT = 0.01; } }
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const touches = new Map();
addEventListener('pointerdown', (e) => {
  snd.unlock();
  if (G.state === 'dead' && G.deadT > 0.6 && e.target.id !== 'go') { reset(); return; }
  touches.set(e.pointerId, e.clientX < innerWidth / 2 ? -1 : 1);
});
addEventListener('pointerup', (e) => touches.delete(e.pointerId));
addEventListener('pointercancel', (e) => touches.delete(e.pointerId));
addEventListener('blur', () => { for (const k in keys) keys[k] = false; touches.clear(); });

function readInput() {
  let d = 0;
  if (keys.KeyA || keys.ArrowLeft) d -= 1; if (keys.KeyD || keys.ArrowRight) d += 1;
  for (const v of touches.values()) d += v;
  return Math.max(-1, Math.min(1, d));
}

// bot: steer toward the reachable free lane of the next gate
function botInput() {
  const o = G.obs.find((o) => !o.done && o.z < PZ);
  if (!o) return 0;
  const tArr = (PZ - o.z) / G.speed;
  const cur = playerLocal(o) - o.spin * tArr; // where the player sits in the gate frame on arrival if still
  let best = null, bd = 1e9;
  for (let i = 0; i < NS; i++) if (!o.mask[i]) { const d = sdiff(i * STEP + STEP / 2, cur); if (Math.abs(d) < Math.abs(bd)) { bd = d; best = i; } }
  if (best == null || Math.abs(bd) < 0.06) return 0;
  return bd > 0 ? 1 : -1; // +local angle == input +1 (rot decreases)
}

// ---------- loop ----------
function resize() {
  const w = innerWidth, h = innerHeight, pr = renderer.getPixelRatio();
  renderer.setSize(w, h, false); rt.setSize(w * pr, h * pr);
  camera.aspect = w / h; camera.fov = w / h < 0.8 ? 96 : 78; camera.updateProjectionMatrix();
  post.uniforms.res.value.set(w, h);
}
addEventListener('resize', resize); resize();

function step(rdt) {
  G.slow += (1 - G.slow) * Math.min(1, rdt * (G.state === 'dead' ? 0.8 : 3));
  const dt = G.state === 'pause' ? 0 : rdt * G.slow;
  G.t += dt;
  const T = G.t;
  tunnelU.t.value = T; barMat.uniforms.t.value = T; gemMat.uniforms.t.value = T; ship.userData.trail.material.uniforms.t.value = T;
  tunnelU.mixm.value = Math.min(1, tunnelU.mixm.value + dt * 0.8);

  if (G.state === 'play') {
    const inp = G.autopilot ? botInput() : readInput();
    G.input = inp;
    const target = -inp * (4.4 + Math.min(G.level, 8) * 0.12);
    G.rotVel += (target - G.rotVel) * Math.min(1, dt * 14);
    G.speed = Math.min(72, 26 + (G.level - 1) * 4 + (G.dist % 700) / 700 * 3);
    G.dist += G.speed * dt * 0.5;
    G.score += G.speed * dt * 0.5 * G.mult;
    const L = 1 + Math.floor(G.dist / 700);
    if (L !== G.level) setZone(L);
    G.grace -= dt;
  } else {
    G.rotVel *= Math.pow(0.02, dt);
  }
  G.rot += G.rotVel * dt;
  if (G.state === 'dead') G.deadT += rdt;

  const sp = G.state === 'pause' ? 0 : G.speed * (G.state === 'dead' ? 0.15 : 1);
  tunnelU.travel.value += sp * dt; tunnelU.rot.value = G.rot; world.rotation.z = G.rot;

  // spawn
  if (G.state === 'play') {
    G.spawnZ += sp * dt;
    const gap = G.speed * Math.max(0.62, 1.15 - G.level * 0.05);
    while (G.spawnZ > FAR) { spawn(G.spawnZ); G.spawnZ -= gap; }
  }
  for (const o of G.obs) {
    o.z += sp * dt; o.ang += o.spin * dt; o.g.position.z = o.z; o.g.rotation.z = o.ang;
    if (!o.done && o.z >= PZ && G.state === 'play') {
      o.done = true;
      const la = playerLocal(o);
      if (blockedAt(o, la) || blockedAt(o, la - 0.07) || blockedAt(o, la + 0.07)) { die(); }
      else {
        G.passed++; G.streak++; snd.pass();
        if (blockedAt(o, la - 0.27) || blockedAt(o, la + 0.27)) { G.closes++; G.score += 25 * G.mult; pop('CLOSE +' + 25 * G.mult); snd.close(); G.flash = Math.max(G.flash, 0.25); }
        G.mult = Math.min(8, 1 + Math.floor(G.streak / 10));
      }
    }
  }
  for (const g of G.gems) {
    g.z += sp * dt; g.m.position.z = g.z; g.m.rotation.y += dt * 3; g.m.rotation.x += dt * 1.7;
    if (!g.done && g.z >= PZ && G.state === 'play') {
      g.done = true;
      if (Math.abs(sdiff(g.la, -Math.PI / 2 - G.rot)) < 0.33) { G.gemsGot++; G.score += 50 * G.mult; G.streak += 3; pop('PRISM +' + 50 * G.mult); snd.gem(); g.m.visible = false; burst(6, ship.position, 4); }
    }
  }
  G.obs = G.obs.filter((o) => { if (o.z > 8) { world.remove(o.g); return false; } return true; });
  G.gems = G.gems.filter((g) => { if (g.z > 8) { world.remove(g.m); return false; } return true; });

  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i], u = s.userData; u.life -= rdt;
    s.position.addScaledVector(u.v, rdt); u.v.y -= 9 * rdt; s.rotation.x += rdt * 8; s.rotation.y += rdt * 5;
    if (u.life <= 0) { scene.remove(s); shards.splice(i, 1); }
  }

  // camera + ship juice
  ship.rotation.z = -G.rotVel * 0.09; ship.position.y = -R + 0.55 + Math.sin(T * 9) * 0.03;
  G.shake *= Math.pow(0.03, rdt); G.flash *= Math.pow(0.02, rdt);
  const sh = G.shake * 0.35;
  camera.position.set((Math.random() - .5) * sh, -1.1 + (Math.random() - .5) * sh, 3.2);
  camera.lookAt(0, -1.5, -30); camera.rotation.z += G.rotVel * 0.015;
  camera.fov += ((innerWidth / innerHeight < 0.8 ? 96 : 78) + (G.speed - 26) * 0.25 - camera.fov) * Math.min(1, rdt * 3); camera.updateProjectionMatrix();
  post.uniforms.blur.value = 0.15 + (G.speed - 26) / 46 * 0.5 + G.shake * 0.6;
  post.uniforms.inv.value = Math.min(1, G.flash);
  post.uniforms.ab.value = G.shake; post.uniforms.t.value = T;
  tunnelU.beat.value = snd.beat || 0;

  // hud
  $('score').textContent = Math.floor(G.score);
  $('mult').textContent = 'x' + G.mult;
  $('best').textContent = 'BEST ' + G.best;
  if (bannerT > 0 && (bannerT -= rdt) <= 0) $('banner').className = '';
  if (popT > 0 && (popT -= rdt) <= 0) $('pop').className = '';
  if (G.t > 6) $('hint').style.opacity = 0;
  snd.tick(G.state === 'play' ? 120 + G.level * 4 : 0);
}

function render() { renderer.setRenderTarget(rt); renderer.render(scene, camera); renderer.setRenderTarget(null); renderer.render(postScene, postCam); }
G.fast = (sec, dt = 1 / 60) => { for (let s = 0; s < sec; s += dt) step(dt); render(); };
G.reset = reset;
let last = performance.now();
function frame(now) { const rdt = Math.min(0.05, (now - last) / 1000); last = now; step(rdt); render(); requestAnimationFrame(frame); }
setZone(1, true);
if (Q.has('title')) showPanel('title');
requestAnimationFrame(frame);
