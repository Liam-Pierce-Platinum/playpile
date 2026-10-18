// SLOPE RUSH - roll down an endless neon slope. Game loop, world dressing, input, HUD.
import * as THREE from '../vendor/three.module.js';
import { Track, PALETTES, SECTOR, R } from './track.js';
import { Post } from './post.js';
import { Sfx } from './audio.js';

THREE.ColorManagement.enabled = false;
const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
renderer.outputColorSpace = THREE.LinearSRGBColorSpace; renderer.toneMapping = THREE.NoToneMapping;
const post = new Post(renderer);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 2600);
const U = { colA: { value: new THREE.Color(...PALETTES[0].a) }, colB: { value: new THREE.Color(...PALETTES[0].b) }, fog: { value: new THREE.Color(...PALETTES[0].sky) }, ball: { value: new THREE.Vector3() }, time: { value: 0 } };
const SKINS = [
  { name: 'PLASMA', c: [0.3, 1.0, 1.0], need: 0 }, { name: 'HOTLINE', c: [1.0, 0.25, 0.8], need: 40 }, { name: 'SOLAR', c: [1.0, 0.75, 0.2], need: 120 },
  { name: 'VOID', c: [0.6, 0.35, 1.0], need: 250 }, { name: 'TOXIC', c: [0.6, 1.0, 0.2], need: 450 }, { name: 'PRISM', c: [1, 1, 1], need: 800 },
];
let save = { best: 0, volts: 0, skin: 0, runs: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem('slope_rush_v1') || '{}')); } catch (e) {}
const persist = () => { try { localStorage.setItem('slope_rush_v1', JSON.stringify(save)); } catch (e) {} };

// ---------- world dressing ----------
const sky = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, uniforms: { uFog: U.fog, uA: U.colA },
  vertexShader: `varying vec3 vP; void main(){ vP=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform vec3 uFog,uA; varying vec3 vP; void main(){ float h=vP.y; vec3 top=vec3(0.01,0.0,0.03);
    vec3 c=mix(uFog*1.3, top, smoothstep(-0.02,0.45,h)); c+=uA*exp(-abs(h-0.01)*28.0)*0.35; gl_FragColor=vec4(c,1.); }`,
}));
sky.renderOrder = -3; scene.add(sky);
const sun = new THREE.Mesh(new THREE.PlaneGeometry(300, 300), new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, uniforms: { uTime: U.time, uA: U.colA },
  vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform float uTime; uniform vec3 uA; varying vec2 vUv; void main(){ vec2 p=vUv-0.5; float r=length(p);
    float disc=1.0-smoothstep(0.33,0.336,r); float y=vUv.y; vec3 c=mix(vec3(2.4,0.25,0.9), vec3(2.8,2.0,0.3), smoothstep(0.2,0.8,y));
    float band=step(0.5, fract(y*14.0 - uTime*0.4)); float cut = y<0.52 ? band*smoothstep(0.52,0.18,y)*1.4 : 0.0; disc*=1.0-clamp(cut,0.,1.);
    float glow=exp(-max(r-0.3,0.0)*9.0)*0.5; gl_FragColor=vec4(c*disc + uA*glow*(1.0-disc), max(disc, glow)); }`,
}));
sun.renderOrder = -2; scene.add(sun);
const starG = new THREE.BufferGeometry(); { const P = [], C = []; for (let i = 0; i < 700; i++) { const a = Math.random() * 6.283, e = 0.05 + Math.random() * 1.3; P.push(Math.cos(a) * Math.cos(e) * 900, Math.sin(e) * 900, Math.sin(a) * Math.cos(e) * 900); const b = 0.6 + Math.random() * 1.8; C.push(b, b * 0.9, b * 1.1); }
  starG.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); starG.setAttribute('color', new THREE.Float32BufferAttribute(C, 3)); }
const stars = new THREE.Points(starG, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })); stars.renderOrder = -2; scene.add(stars);
// far neon floor + wireframe mountains (vertex-displaced grid)
const floor = new THREE.Mesh(new THREE.PlaneGeometry(1800, 1800, 180, 180).rotateX(-Math.PI / 2), new THREE.ShaderMaterial({
  uniforms: { uA: U.colA, uB: U.colB, uFog: U.fog, uC: { value: new THREE.Vector2() }, uTime: U.time },
  vertexShader: `uniform vec2 uC; varying vec3 vW; varying float vDist; varying float vH;
    void main(){ vec4 w=modelMatrix*vec4(position,1.); float side=abs(w.x-uC.x);
     float m=smoothstep(45.,140.,side); float n=abs(sin(w.x*0.045+sin(w.z*0.013))*sin(w.z*0.031+w.x*0.011))+0.5*abs(sin(w.x*0.11+w.z*0.07));
     float h=m*n*70.0*(0.6+0.4*smoothstep(140.,400.,side)); w.y+=h; vH=h; vW=w.xyz; vec4 mv=viewMatrix*w; vDist=-mv.z; gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uA,uB,uFog; varying vec3 vW; varying float vDist; varying float vH;
    void main(){ vec2 g=vW.xz/10.0; vec2 f=abs(fract(g-0.5)-0.5)/max(fwidth(g),vec2(1e-4)); float line=1.0-min(min(f.x,f.y),1.0);
     vec3 c=vec3(0.015,0.0,0.03)+mix(uB,uA,clamp(vH/50.0,0.,1.))*line*1.6; c=mix(c,uFog*1.3,smoothstep(80.,880.,vDist)); gl_FragColor=vec4(c,1.); }`,
}));
floor.frustumCulled = false; scene.add(floor);

// ball + trail + particles
const skinCol = new THREE.Color();
const ballMat = new THREE.ShaderMaterial({ uniforms: { uC: { value: skinCol }, uTime: U.time },
  vertexShader: `varying vec3 vN; varying vec3 vO; varying vec3 vV; void main(){ vO=position; vN=normalize(normalMatrix*normal); vec4 mv=modelViewMatrix*vec4(position,1.); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
  fragmentShader: `uniform vec3 uC; uniform float uTime; varying vec3 vN; varying vec3 vO; varying vec3 vV; void main(){ float rim=pow(clamp(1.0-dot(vN,vV),0.0,1.0),2.2);
    float s=smoothstep(0.82,1.0,abs(sin(vO.y*18.0))); float m=smoothstep(0.9,1.0,abs(sin(atan(vO.z,vO.x)*3.0)));
    vec3 c=uC*0.18+uC*rim*3.5+uC*max(s,m)*1.6+vec3(1.)*pow(max(dot(vN,normalize(vec3(0.3,0.8,0.5))),0.),24.)*1.5; gl_FragColor=vec4(c,1.); }` });
const ball = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), ballMat); scene.add(ball);
const TN = 44, trailPos = new Float32Array(TN * 2 * 3), trailA = new Float32Array(TN * 2), trailPts = [];
const trailG = new THREE.BufferGeometry(); trailG.setAttribute('position', new THREE.BufferAttribute(trailPos, 3)); trailG.setAttribute('a', new THREE.BufferAttribute(trailA, 1));
{ const idx = []; for (let i = 0; i < TN - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trailG.setIndex(idx); }
const trail = new THREE.Mesh(trailG, new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uC: { value: skinCol } },
  vertexShader: `attribute float a; varying float vA; void main(){ vA=a; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform vec3 uC; varying float vA; void main(){ float a=clamp(vA,0.,1.); gl_FragColor=vec4(uC*2.2*a, a); }` }));
trail.frustumCulled = false; scene.add(trail);
const PN = 500, pPos = new Float32Array(PN * 3), pCol = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN); let pNext = 0;
const pG = new THREE.BufferGeometry(); pG.setAttribute('position', new THREE.BufferAttribute(pPos, 3)); pG.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
const parts = new THREE.Points(pG, new THREE.PointsMaterial({ size: 0.22, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); parts.frustumCulled = false; scene.add(parts);
function burst(p, n, col, spd, up = 0) {
  for (let i = 0; i < n; i++) { const j = pNext++ % PN; pPos[j * 3] = p.x; pPos[j * 3 + 1] = p.y; pPos[j * 3 + 2] = p.z;
    const a = Math.random() * 6.283, e = Math.random() * 2 - 1, v = spd * (0.3 + Math.random());
    pVel[j * 3] = Math.cos(a) * Math.sqrt(1 - e * e) * v; pVel[j * 3 + 1] = e * v + up; pVel[j * 3 + 2] = Math.sin(a) * Math.sqrt(1 - e * e) * v;
    pLife[j] = 0.6 + Math.random() * 0.8; pCol[j * 3] = col[0] * 3; pCol[j * 3 + 1] = col[1] * 3; pCol[j * 3 + 2] = col[2] * 3; }
}

// ---------- game state ----------
const track = new Track(scene, U);
const sfx = new Sfx(Q.has('mute'));
const G = window.__G = { state: 'play', demo: false, auto: Q.has('auto'), t: 0, track, ball: null, shake: 0, flash: 0, pal: 0, runs: [], deaths: 0 };
const keys = {}; let touchSteer = 0, deadT = 0;
function newBall() { return { s: 2, x: 0, y: track.gy(2) + R, vx: 0, vy: 0, air: false, speed: 17, alive: true, bonus: 0, volts: 0, sector: 0, cause: '' }; }
function startRun(demo) {
  G.demo = demo; G.state = 'play'; track.reset((Math.random() * 1e9) | 0); G.ball = newBall(); trailPts.length = 0; deadT = 0;
  for (let i = 0; i < 4; i++) track.update(0, 0);
  G.pal = 0; setPalette(0, true); $('over').classList.add('hide'); $('title').classList.toggle('hide', !demo); $('hud').classList.toggle('hide', demo);
  sfx.music = !demo || !!sfx.ctx; banner(demo ? '' : PALETTES[0].name, 'SECTOR 1');
}
function setPalette(i, instant) { G.palTarget = PALETTES[i % PALETTES.length]; if (instant) { U.colA.value.setRGB(...G.palTarget.a); U.colB.value.setRGB(...G.palTarget.b); U.fog.value.setRGB(...G.palTarget.sky); } }
function score() { return Math.floor(G.ball.s) + G.ball.bonus; }
function die(cause) {
  const b = G.ball; if (!b.alive) return; b.alive = false; b.cause = cause; G.state = 'dead'; deadT = 0; G.deaths++;
  if (cause === 'crash') { burst(ball.position, 140, skinCol.toArray(), 9, 2); ball.visible = false; G.shake = 1.0; G.flash = 0.5; sfx.die(); } else sfx.fall();
  sfx.music = false;
  G.runs.push({ score: score(), s: Math.floor(b.s), cause, volts: b.volts });
  if (G.demo) return;
  const sc = score(), nb = sc > save.best; if (nb) save.best = sc; save.volts += b.volts; save.runs++; persist();
  $('oScore').textContent = sc; $('oBest').textContent = nb ? 'NEW BEST!' : 'BEST ' + save.best; $('oCause').textContent = cause === 'crash' ? 'SHATTERED' : 'FELL INTO THE VOID';
  $('oVolts').textContent = '+' + b.volts + ' ◆  (' + save.volts + ' total)';
  const nx = SKINS.find((k) => k.need > save.volts); $('oNext').textContent = nx ? 'next ball "' + nx.name + '" at ' + nx.need + ' ◆' : 'all balls unlocked';
  renderSkins();
}
function banner(a, b) { const el = $('banner'); el.innerHTML = a ? `<b>${b}</b><span>${a}</span>` : ''; el.classList.remove('show'); void el.offsetWidth; if (a) el.classList.add('show'); }
function pop(txt, col) { const el = document.createElement('div'); el.className = 'pop'; el.textContent = txt; el.style.color = col || ''; $('pops').appendChild(el); setTimeout(() => el.remove(), 900); }

function autoSteer(b) {
  const curU = b.x - track.cx(b.s); let best = 0, bestSc = -1e9; const hw = track.hw(b.s + 8);
  for (let i = 0; i <= 16; i++) {
    const u = (i / 16 * 2 - 1) * (hw - 0.25); let sc = -Math.abs(u - curU) * 0.4 - Math.abs(u) * 0.05;
    for (let j = 1; j <= 8; j++) { const s = b.s + j * b.speed * 0.07 + 0.3;
      if (!track.solidAt(s, u) && !track.rowEmpty(s)) sc -= 12 / (1 + j * 0.15);
      if (track.obsAt(s, u)) sc -= 14 / (1 + j * 0.15); }
    if (sc > bestSc) { bestSc = sc; best = u; }
  }
  const tv = (best - curU) * 5 + track.cxd(b.s) * b.speed; return Math.max(-1, Math.min(1, (tv - b.vx) * 0.35));
}
function step(dt) {
  G.t += dt; U.time.value = G.t; const b = G.ball;
  // palette blend
  const P = G.palTarget, k = 1 - Math.exp(-dt * 2);
  U.colA.value.lerp(new THREE.Color(...P.a), k); U.colB.value.lerp(new THREE.Color(...P.b), k); U.fog.value.lerp(new THREE.Color(...P.sky), k);
  if (G.state === 'play') {
    const spd = b.speed = Math.min(46, 17 + b.s * 0.0065);
    b.s += spd * dt;
    let steer = (keys.right ? 1 : 0) - (keys.left ? 1 : 0) + touchSteer;
    if (G.auto || G.demo) steer = autoSteer(b);
    steer = Math.max(-1, Math.min(1, steer));
    const latMax = 8 + spd * 0.13;
    b.vx += steer * 58 * dt; if (Math.abs(steer) < 0.05) b.vx *= 1 - Math.min(1, 5 * dt);
    b.vx = Math.max(-latMax, Math.min(latMax, b.vx)); b.x += b.vx * dt;
    const u = b.x - track.cx(b.s), gy = track.gy(b.s), solid = track.solidAt(b.s, u);
    if (!b.air) { if (solid) b.y = gy + R; else { b.air = true; b.vy = track.gyd(b.s) * spd; } }
    if (b.air) {
      b.vy -= 32 * dt; b.y += b.vy * dt;
      if (solid && b.vy < 0 && b.y - R <= gy && b.y - R > gy - 0.9) {
        const imp = -b.vy + track.gyd(b.s) * spd; b.air = false; b.y = gy + R;
        if (imp > 3) { G.shake = Math.min(0.6, imp * 0.04); sfx.land(imp); burst(new THREE.Vector3(b.x, gy + 0.05, -b.s), 24, U.colB.value.toArray(), 4, 1); }
      }
      if (b.y < gy - 7) die('fell');
    }
    if (b.alive && track.obsAt(b.s, u, b.y - R - gy)) die('crash');
    if (b.alive) {
      track.obstacles(b.s, (o) => { if (!o.passed && b.s > o.s + o.hz) { o.passed = true; if (Math.abs(u - o.u) < o.hx + R + 0.35 && !b.air) { b.bonus += 5; G.near = (G.near || 0) + 1; if (!G.demo) { pop('CLOSE +5', '#ff4d6d'); sfx.near(); } } } });
      for (const p of track.take(b.s, u, b.y - gy)) { b.volts++; b.bonus += 10; burst(p, 30, [1, 0.85, 0.2], 5); if (!G.demo) { sfx.pickup(); pop('+10 ◆', '#ffd84d'); } }
      const sec = Math.floor(b.s / SECTOR);
      if (sec > b.sector) { b.sector = sec; setPalette(sec); G.flash = 0.35; if (!G.demo) { sfx.sector(); banner(PALETTES[sec % PALETTES.length].name, 'SECTOR ' + (sec + 1)); } }
    }
    if (b.alive) track.update(b.s, G.t);
  } else if (G.state === 'dead') {
    deadT += dt; if (b.cause === 'fell') { b.vy -= 32 * dt; b.y += b.vy * dt; b.s += b.speed * dt * 0.6; b.x += b.vx * dt; }
    if (G.demo && deadT > 1.2) startRun(true);
    if (!G.demo && deadT > 0.7) $('over').classList.remove('hide');
  }
  // particles
  for (let i = 0; i < PN; i++) if (pLife[i] > 0) { pLife[i] -= dt; pVel[i * 3 + 1] -= 9 * dt; for (let a = 0; a < 3; a++) pPos[i * 3 + a] += pVel[i * 3 + a] * dt; const f = Math.max(0, 1 - dt * 1.6); pCol[i * 3] *= f; pCol[i * 3 + 1] *= f; pCol[i * 3 + 2] *= f; if (pLife[i] <= 0) pPos[i * 3 + 1] = -1e6; }
  pG.attributes.position.needsUpdate = true; pG.attributes.color.needsUpdate = true;
  G.shake *= Math.exp(-dt * 6); G.flash *= Math.exp(-dt * 4);
  sfx.intensity = Math.min(1, b.s / 1200); sfx.update(G.state === 'play' ? b.speed : 0, !b.air);
}
const tmpV = new THREE.Vector3(), look = new THREE.Vector3();
function visuals(dt) {
  const b = G.ball;
  ball.position.set(b.x, b.y, -b.s); ball.rotation.x -= b.speed * dt / R * (G.state === 'play' ? 1 : 0.3); ball.rotation.z = -b.vx * 0.05;
  if (G.state === 'play') ball.visible = true;
  U.ball.value.copy(ball.position);
  skinCol.setRGB(...SKINS[G.demo ? (Math.floor(G.t / 6) % SKINS.length) : save.skin].c);
  if (G.state === 'play') { trailPts.unshift(ball.position.clone()); if (trailPts.length > TN) trailPts.pop(); }
  for (let i = 0; i < TN; i++) { const p = trailPts[Math.min(i, trailPts.length - 1)] || ball.position, w = R * 0.85 * (1 - i / TN);
    trailPos.set([p.x - w, p.y - R * 0.6, p.z, p.x + w, p.y - R * 0.6, p.z], i * 6); const a = (1 - i / TN) * (trailPts.length ? 0.9 : 0); trailA[i * 2] = a; trailA[i * 2 + 1] = a; }
  trailG.attributes.position.needsUpdate = true; trailG.attributes.a.needsUpdate = true;
  // camera
  const s = b.s, falling = G.state === 'dead' && b.cause === 'fell';
  if (!falling) {
    tmpV.set(b.x * 0.75 + track.cx(s - 6) * 0.25, Math.max(b.y, track.gy(s) + R) + 3.1, -(s - 7.2));
    camera.position.x += (tmpV.x - camera.position.x) * (1 - Math.exp(-dt * 7)); camera.position.y += (tmpV.y - camera.position.y) * (1 - Math.exp(-dt * 9)); camera.position.z = tmpV.z;
  }
  look.set(b.x * 0.8 + track.cx(s + 14) * 0.2, falling ? b.y : track.gy(s + 10) + 0.8, -(s + 12));
  if (falling) look.set(b.x, b.y, -b.s);
  camera.lookAt(look); camera.rotateZ(-b.vx * 0.007);
  if (G.shake > 0.01) { camera.position.x += (Math.random() - 0.5) * G.shake * 0.5; camera.position.y += (Math.random() - 0.5) * G.shake * 0.5; }
  const fov = 66 + (b.speed - 17) * 0.5; if (Math.abs(camera.fov - fov) > 0.05) { camera.fov += (fov - camera.fov) * 0.1; camera.updateProjectionMatrix(); }
  sky.position.copy(camera.position); stars.position.copy(camera.position);
  sun.position.set(camera.position.x, camera.position.y + 35, camera.position.z - 560);
  floor.position.set(Math.round(camera.position.x / 10) * 10, track.gy(s) - 34, Math.round(camera.position.z / 10) * 10);
  floor.material.uniforms.uC.value.set(track.cx(s + 60), 0);
  post.mC.uniforms.flash.value = G.flash; post.mC.uniforms.flashCol.value.copy(U.colA.value); post.mC.uniforms.aber.value = 0.01 + (b.speed - 17) * 0.0009 + G.shake * 0.05;
  // HUD
  if (!G.demo) { $('score').textContent = score(); $('best').textContent = 'BEST ' + Math.max(save.best, G.state === 'play' ? score() : 0); $('volts').textContent = '◆ ' + (save.volts + (G.state === 'play' ? b.volts : 0)); $('spd').style.width = ((b.speed - 17) / 29 * 100).toFixed(1) + '%'; $('kmh').textContent = Math.round(b.speed * 3.6) + ' KM/H'; }
}
function render() { post.render(scene, camera, G.t); }
function resize() { const pr = Math.min(window.devicePixelRatio || 1, 1.5), w = innerWidth, h = innerHeight; renderer.setPixelRatio(pr); renderer.setSize(w, h, false); post.setSize(Math.floor(w * pr), Math.floor(h * pr)); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- input ----------
const KMAP = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right' };
function action() {
  sfx.init();
  if (G.state === 'dead' && !G.demo && deadT > 0.7) startRun(false);
  else if (G.state === 'play' && !G.demo) sfx.music = true;
}
addEventListener('keydown', (e) => {
  if (KMAP[e.code]) { keys[KMAP[e.code]] = true; e.preventDefault(); }
  if (e.code === 'Space' || e.code === 'Enter') { e.preventDefault(); if (G.demo) { sfx.init(); startRun(false); } else action(); }
  else if (KMAP[e.code]) action();
  if (e.code === 'KeyM') { sfx.init(); sfx.setMute(!sfx.muted); }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !G.demo && (G.state === 'play' || G.state === 'paused')) { G.state = G.state === 'play' ? 'paused' : 'play'; $('pause').classList.toggle('hide', G.state !== 'paused'); }
});
addEventListener('keyup', (e) => { if (KMAP[e.code]) keys[KMAP[e.code]] = false; });
const touches = new Map();
const updTouch = () => { let s = 0; for (const x of touches.values()) s += x < innerWidth / 2 ? -1 : 1; touchSteer = Math.max(-1, Math.min(1, s)); };
canvas.addEventListener('touchstart', (e) => { e.preventDefault(); for (const t of e.changedTouches) touches.set(t.identifier, t.clientX); updTouch(); action(); }, { passive: false });
canvas.addEventListener('touchmove', (e) => { e.preventDefault(); for (const t of e.changedTouches) touches.set(t.identifier, t.clientX); updTouch(); }, { passive: false });
const tEnd = (e) => { for (const t of e.changedTouches) touches.delete(t.identifier); updTouch(); };
canvas.addEventListener('touchend', tEnd); canvas.addEventListener('touchcancel', tEnd);
canvas.addEventListener('mousedown', () => action());
$('over').addEventListener('pointerdown', (e) => { e.preventDefault(); action(); });
$('play').addEventListener('click', () => { sfx.init(); startRun(false); });
document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'play' && !G.demo) { G.state = 'paused'; $('pause').classList.remove('hide'); } });
$('pause').addEventListener('pointerdown', () => { G.state = 'play'; $('pause').classList.add('hide'); });
function renderSkins() {
  $('skins').innerHTML = SKINS.map((k, i) => { const ok = save.volts >= k.need, c = `rgb(${k.c.map((v) => Math.round(v * 255)).join(',')})`;
    return `<button class="skin${i === save.skin ? ' on' : ''}${ok ? '' : ' locked'}" data-i="${i}" style="--c:${c}"><i></i>${ok ? k.name : k.need + ' ◆'}</button>`; }).join('');
  $('tBest').textContent = 'BEST ' + save.best + '  ·  ◆ ' + save.volts;
}
$('skins').addEventListener('click', (e) => { const b = e.target.closest('.skin'); if (!b) return; const i = +b.dataset.i; if (save.volts >= SKINS[i].need) { save.skin = i; persist(); renderSkins(); } });
renderSkins();

// ---------- loop ----------
G.step = step; G.visuals = visuals; G.render = render; G.startRun = startRun;
G.fast = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) { step(dt); visuals(dt); if (G.state !== 'play') break; } };
let last = performance.now();
function frame(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (G.state !== 'paused') step(dt); visuals(dt); render(); requestAnimationFrame(frame); }
startRun(Q.has('title'));
requestAnimationFrame(frame);
