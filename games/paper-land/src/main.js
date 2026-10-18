// PAPER LAND - cut-paper territory game. Grid sim + one shader that draws every paper layer and its drop shadow.
import * as THREE from '../vendor/three.module.js';
import { audio, sfx, unlock } from './audio.js';

const N = 100, QS = new URLSearchParams(location.search);
const PAL = ['#ef6f5e', '#4fb3a9', '#f2c14e', '#9b8ce0', '#7ec27a', '#5aa6e0', '#e88fb6', '#a5b04a', '#e8945a', '#6b7fa3'];
const NAMES = ['Snip', 'Crease', 'Folda', 'Tabby', 'Glue', 'Origo', 'Pulp', 'Washi', 'Kami'];
const owner = new Uint8Array(N * N), trail = new Uint8Array(N * N), counts = new Int32Array(16);
const texData = new Uint8Array(N * N * 4);
let save = { lvl: 1, best: 1, skin: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem('paperland') || '{}')); } catch (e) {}
const store = () => { try { localStorage.setItem('paperland', JSON.stringify(save)); } catch (e) {} };

// ---------- renderer / scene ----------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
const scene = new THREE.Scene(); scene.background = new THREE.Color('#3b2f27');
const camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
scene.add(new THREE.HemisphereLight('#fff6e8', '#8a7560', 1.6));
const sun = new THREE.DirectionalLight('#ffffff', 1.6); sun.position.set(-40, 80, -50); scene.add(sun);

const tex = new THREE.DataTexture(texData, N, N, THREE.RGBAFormat); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.needsUpdate = true;
const groundU = { map: { value: tex }, N: { value: N }, pal: { value: PAL.map((c) => new THREE.Color(c).convertLinearToSRGB()) }, pulseId: { value: -1 }, pulse: { value: 0 } };
const ground = new THREE.Mesh(new THREE.PlaneGeometry(N + 80, N + 80).rotateX(-Math.PI / 2).translate(N / 2, 0, N / 2), new THREE.ShaderMaterial({
  uniforms: groundU,
  vertexShader: `varying vec2 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `
  varying vec2 vW; uniform sampler2D map; uniform vec3 pal[10]; uniform float N, pulseId, pulse;
  float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
  float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
  float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<4;i++){s+=a*vn(p);p*=2.07;a*=.5;}return s;}
  vec2 wob(vec2 w){ return w + (vec2(vn(w*1.1),vn(w*1.1+31.7))-.5)*0.75 + (vec2(vn(w*4.3),vn(w*4.3+9.1))-.5)*0.16; }
  // layer: -1 table, 0 board, 1 territory, 2 trail
  vec3 cellAt(vec2 w){ vec2 q = wob(w); if(q.x<0.||q.y<0.||q.x>=N||q.y>=N) return vec3(-1.,0.,0.);
    vec2 t = floor(texture2D(map,(floor(q)+.5)/N).rg*255.+.5); return vec3(t.y>0.?2.:(t.x>0.?1.:0.), t); }
  vec3 palAt(float o){ int oi=int(o); vec3 p=pal[0]; for(int i=0;i<10;i++){ if(i==oi-1) p=pal[i]; } return p; }
  void main(){
    vec3 c = cellAt(vW); float L = c.x, o = c.y, tr = c.z;
    float grain = fbm(vW*6.)*.6 + fbm(vW*23.)*.4;
    float fib = smoothstep(.62,.7,vn(vec2(vW.x*2.5+vW.y*9.,vW.y*.8)));
    vec3 col;
    if(L<-.5){ col = vec3(.55,.42,.3)*(.85+.25*grain); }
    else if(L<.5){ col = vec3(.97,.94,.87)*(.94+.08*grain);
      vec2 g = .5-abs(fract(vW)-.5), fw = fwidth(vW); float line = 1.-smoothstep(0.,1.2,min(g.x/fw.x,g.y/fw.y)); col = mix(col, vec3(.62,.75,.85), line*.3*clamp(.25/max(fw.x,fw.y),0.,1.)); }
    else {
      col = palAt(o)*(.88+.16*grain);
      float m = mod(o,3.);
      if(m<.5) col *= 1.-.05*step(.5,fract((vW.x+vW.y)*1.2));
      else if(m<1.5){ vec2 d=fract(vW*1.5)-.5; col *= 1.-.06*step(length(d),.18); }
      if(abs(o-pulseId)<.5) col = mix(col, vec3(1.), pulse*.45);
      if(L>1.5){ col = mix(palAt(tr), vec3(1.), .45)*(.92+.1*grain); col *= 1.-.08*step(.85,fract((vW.x-vW.y)*2.)); }
    }
    col *= 1. - fib*.04;
    // drop shadow from higher paper layers toward the light
    vec2 sd = normalize(vec2(.62,.78)); float sh = 0.;
    for(int k=1;k<=4;k++){ float d = float(k)*.22; float Ls = cellAt(vW - sd*d).x; sh += step(L+.5,Ls)*(1.15-d*.6); }
    if(L<-.5 && cellAt(vW - sd*.6).x>-.5) sh += .5;
    col *= 1. - clamp(sh,0.,2.)*.17;
    // cut edges: lit rim facing the light, dark rim facing away
    if(L>.5){ if(cellAt(vW - sd*.09).x < L) col *= 1.18; if(cellAt(vW + sd*.09).x < L) col *= .82; }
    if(L>-.5 && L<.5 && cellAt(vW + sd*.12).x < L) col *= .8;
    gl_FragColor = vec4(col,1.);
  }`,
}));
scene.add(ground);

// confetti
const CN = 500, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.32, 0.2), new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }), CN);
conf.instanceMatrix.setUsage(THREE.DynamicDrawUsage); scene.add(conf);
const cp = Array.from({ length: CN }, () => ({ life: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, vr: 0 }));
let cpi = 0; const dummy = new THREE.Object3D(), tmpC = new THREE.Color();
for (let i = 0; i < CN; i++) { dummy.scale.setScalar(0); dummy.updateMatrix(); conf.setMatrixAt(i, dummy.matrix); conf.setColorAt(i, tmpC.set('#fff')); }
function burst(x, z, color, n, power = 1) {
  for (let k = 0; k < n; k++) {
    const p = cp[cpi]; conf.setColorAt(cpi, tmpC.set(Math.random() < 0.25 ? '#fbf6ea' : color)); cpi = (cpi + 1) % CN;
    const a = Math.random() * 6.283, s = (1 + Math.random() * 3) * power;
    Object.assign(p, { life: 1.6 + Math.random(), x, y: 0.5, z, vx: Math.cos(a) * s, vy: 4 + Math.random() * 5 * power, vz: Math.sin(a) * s, r: Math.random() * 6, vr: (Math.random() - 0.5) * 14 });
  }
  conf.instanceColor.needsUpdate = true;
}
function tickConf(dt) {
  for (let i = 0; i < CN; i++) {
    const p = cp[i]; if (p.life <= 0) continue;
    p.life -= dt; p.vy -= 9 * dt; p.vx *= 0.97; p.vz *= 0.97; if (p.vy < -1.5) p.vy = -1.5 + Math.sin(p.r) * 0.3;
    p.x += p.vx * dt; p.y = Math.max(0.03, p.y + p.vy * dt); p.z += p.vz * dt; if (p.y > 0.05) p.r += p.vr * dt;
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.r, p.r * 0.7, p.r * 0.3); dummy.scale.setScalar(Math.max(0, Math.min(1, p.life * 2)));
    if (p.y <= 0.05) dummy.rotation.set(-Math.PI / 2, 0, p.r);
    dummy.updateMatrix(); conf.setMatrixAt(i, dummy.matrix);
  }
  conf.instanceMatrix.needsUpdate = true;
}

// paper tokens
const shadowTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const r = g.createRadialGradient(32, 32, 4, 32, 32, 32); r.addColorStop(0, 'rgba(40,25,15,.55)'); r.addColorStop(1, 'rgba(40,25,15,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
function makeToken(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const m = new THREE.MeshLambertMaterial({ color, flatShading: true }), w = new THREE.MeshLambertMaterial({ color: '#fbf6ea', flatShading: true });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.68, 0.26, 7), m); base.position.y = 0.13; body.add(base);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.36, 1.1, 3), w); nose.rotation.z = -Math.PI / 2; nose.position.set(0.25, 0.42, 0); body.add(nose);
  const fin = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 3), m); fin.position.set(-0.15, 0.6, 0); fin.scale.z = 0.35; body.add(fin);
  const sh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
  sh.position.set(0.35, 0.02, 0.45); g.add(sh); g.userData = { body };
  g.scale.setScalar(1.4); scene.add(g); return g;
}

// ---------- sim ----------
const ents = [];
let state = 'title', L = null, level = 1, dirty = false, time = 0, pulseT = 0, shake = 0, deadT = 0;
const stats = { captures: 0, deaths: 0, kills: 0, wins: 0 };
const idx = (i, j) => j * N + i;
function setOwner(c, id) { const o = owner[c]; if (o === id) return; if (o) counts[o]--; owner[c] = id; if (id) counts[id]++; texData[c * 4] = id; dirty = true; }
function setTrail(c, id) { trail[c] = id; texData[c * 4 + 1] = id; dirty = true; }
const pct = (id) => (counts[id] * 100) / (N * N);

function claimDisc(e, ci, cj, r) {
  for (let j = cj - 3; j <= cj + 3; j++) for (let i = ci - 3; i <= ci + 3; i++) if (i >= 0 && j >= 0 && i < N && j < N && (i - ci) ** 2 + (j - cj) ** 2 <= r * r) { const c = idx(i, j); if (!trail[c]) setOwner(c, e.id); }
}
function findSpawn() {
  for (let t = 0; t < 300; t++) {
    const i = 6 + ((Math.random() * (N - 12)) | 0), j = 6 + ((Math.random() * (N - 12)) | 0);
    let ok = true;
    for (let b = -4; b <= 4 && ok; b++) for (let a = -4; a <= 4; a++) { const c = idx(i + a, j + b); if (owner[c] || trail[c]) { ok = false; break; } }
    if (ok && ents.every((e) => !e.alive || (e.x - i) ** 2 + (e.z - j) ** 2 > 144)) return [i, j];
  }
  return [10 + ((Math.random() * 80) | 0), 10 + ((Math.random() * 80) | 0)];
}
function spawn(e, at) {
  const [i, j] = at || findSpawn();
  Object.assign(e, { x: i + 0.5, z: j + 0.5, alive: true, trail: [], cell: idx(i, j), h: Math.random() * 6.283, respawn: 0, ai: { mode: 'home', leg: 0, dist: 0, t: 0, home: null } });
  e.th = e.h; claimDisc(e, i, j, 2.6); e.tok.visible = true;
}
function capture(e) {
  const id = e.id, before = counts[id];
  for (const c of e.trail) { setTrail(c, 0); setOwner(c, id); }
  e.trail.length = 0;
  const seen = new Uint8Array(N * N), q = new Int32Array(N * N); let qh = 0, qt = 0;
  const push = (c) => { if (!seen[c] && owner[c] !== id) { seen[c] = 1; q[qt++] = c; } };
  for (let k = 0; k < N; k++) { push(idx(k, 0)); push(idx(k, N - 1)); push(idx(0, k)); push(idx(N - 1, k)); }
  while (qh < qt) { const c = q[qh++], i = c % N, j = (c / N) | 0; if (i > 0) push(c - 1); if (i < N - 1) push(c + 1); if (j > 0) push(c - N); if (j < N - 1) push(c + N); }
  for (let c = 0; c < N * N; c++) if (!seen[c] && owner[c] !== id) setOwner(c, id);
  const gain = counts[id] - before;
  if (e.isPlayer) {
    stats.captures++; pulseT = 1; groundU.pulseId.value = id; sfx('capture', gain / 20); shake = Math.min(0.5, 0.1 + gain / 400);
    if (gain > 4) popText('+' + ((gain * 100) / (N * N)).toFixed(1) + '%', e.x, e.z, PAL[e.ci]); burst(e.x, e.z, PAL[e.ci], Math.min(60, 8 + ((gain / 6) | 0)), 0.8);
  }
}
function kill(e, by) {
  if (!e.alive) return;
  e.alive = false; e.respawn = 3; e.killer = by;
  for (const c of e.trail) setTrail(c, 0); e.trail.length = 0;
  for (let c = 0; c < N * N; c++) if (owner[c] === e.id) setOwner(c, 0);
  burst(e.x, e.z, PAL[e.ci], 70, 1.3); e.tok.visible = false;
  if (by) by.kills++;
  if (e.isPlayer) { stats.deaths++; sfx('crumple'); shake = 0.8; deadT = 1.3; state = 'dying'; }
  else if (by && by.isPlayer) { stats.kills++; sfx('snip'); popText('SNIP! ' + e.name, e.x, e.z, '#fff'); shake = 0.35; }
}
function enterCell(e, i, j) {
  if (i < 0 || j < 0 || i >= N || j >= N) { stats.wall = (stats.wall || 0) + 1; kill(e, null); return; }
  const c = idx(i, j); e.cell = c;
  const t = trail[c];
  if (t === e.id && e.trail.lastIndexOf(c) >= e.trail.length - 3) return; // grazing the cell just laid is not a cut
  if (t) { if (t === e.id) { stats.self = (stats.self || 0) + 1; kill(e, null); return; } const v = ents.find((x) => x.id === t); if (v) kill(v, e); }
  if (owner[c] === e.id) { if (e.trail.length) capture(e); }
  else { if (!e.trail.length && e.isPlayer) sfx('leave'); setTrail(c, e.id); e.trail.push(c); }
}

// ---------- AI (bots; also drives the player with ?auto=1 or __G.auto = true) ----------
const cellOf = (x, z) => (x < 0 || z < 0 || x >= N || z >= N ? -1 : idx(x | 0, z | 0));
function badAt(e, x, z) { const c = cellOf(x, z); return c < 0 || trail[c] === e.id; }
function steer(e, want) {
  for (const o of [0, 0.45, -0.45, 0.9, -0.9, 1.5, -1.5, 2.2, -2.2, 3.1]) {
    const a = want + o, dx = Math.cos(a), dz = Math.sin(a); let ok = true;
    for (const d of [0.9, 1.7, 2.6]) if (badAt(e, e.x + dx * d, e.z + dz * d)) { ok = false; break; }
    if (ok) return a;
  }
  return want;
}
function scanHome(e) {
  // nearest home cell reachable in a straight line without crossing my own trail
  let best = 1e9, bx = 0, bz = 0, sx = 0, sz = 0, n = 0, fb = 1e9, fx = 0, fz = 0;
  const clear = (x, z) => { const dx = x - e.x, dz = z - e.z, len = Math.hypot(dx, dz), s = Math.ceil(len / 0.5);
    for (let k = 2; k < s; k++) { const c = cellOf(e.x + (dx * k) / s, e.z + (dz * k) / s); if (c >= 0 && trail[c] === e.id) return false; } return true; };
  const chk = e.trail.length > 0;
  for (let c = 0; c < N * N; c++) if (owner[c] === e.id) {
    const i = c % N, j = (c / N) | 0; sx += i; sz += j; n++;
    const d = (i + 0.5 - e.x) ** 2 + (j + 0.5 - e.z) ** 2;
    if (d < fb) { fb = d; fx = i + 0.5; fz = j + 0.5; }
    if (d < best && (!chk || (c % 3 === 0 || d < 9) && clear(i + 0.5, j + 0.5))) { best = d; bx = i + 0.5; bz = j + 0.5; }
  }
  if (best === 1e9) { bx = fx; bz = fz; }
  e.ai.home = n ? { x: bx, z: bz, cx: sx / n + 0.5, cz: sz / n + 0.5 } : null;
}
function think(e, dt) {
  const a = e.ai, sk = e.skill; a.t -= dt; a.dist += e.speed * dt;
  const inHome = owner[e.cell] === e.id;
  if (a.t <= 0) {
    a.t = 0.12; scanHome(e);
    if (e.trail.length) {
      let danger = false; const R = 2.5 + 6 * sk + e.trail.length * 0.04;
      for (const o of ents) { if (o === e || !o.alive) continue;
        if ((o.x - e.x) ** 2 + (o.z - e.z) ** 2 < R * R) { danger = true; break; }
        for (let k = 0; k < e.trail.length; k += 2) { const c = e.trail[k]; if ((o.x - (c % N) - 0.5) ** 2 + (o.z - ((c / N) | 0) - 0.5) ** 2 < (R * 0.6) ** 2) { danger = true; break; } }
        if (danger) break; }
      if (danger || e.trail.length > 18 + 40 * sk) a.mode = 'back';
    }
    if (a.mode !== 'back' && a.mode !== 'hunt' && e.trail.length < 10 && Math.random() < sk * 0.5) {
      for (const o of ents) { if (o === e || !o.alive || o.trail.length < 4) continue;
        const c = o.trail[(o.trail.length / 2) | 0], x = (c % N) + 0.5, z = ((c / N) | 0) + 0.5;
        if ((x - e.x) ** 2 + (z - e.z) ** 2 < 64) { a.mode = 'hunt'; a.prey = o; a.pc = c; break; } }
    }
  }
  let want = e.th;
  if (a.mode === 'hunt') {
    if (!a.prey.alive || trail[a.pc] !== a.prey.id) a.mode = e.trail.length ? 'back' : 'home';
    else want = Math.atan2(((a.pc / N) | 0) + 0.5 - e.z, (a.pc % N) + 0.5 - e.x);
  }
  if (a.mode === 'home') {
    if (!inHome) a.mode = 'back';
    else { const hm = a.home; let base = hm ? Math.atan2(e.z - hm.cz, e.x - hm.cx) : Math.random() * 6.28;
      if (hm && (e.z - hm.cz) ** 2 + (e.x - hm.cx) ** 2 < 1) base = Math.random() * 6.28;
      const tx = e.x + Math.cos(base) * 15, tz = e.z + Math.sin(base) * 15; if (tx < 4 || tz < 4 || tx > N - 4 || tz > N - 4) base = Math.atan2(N / 2 - e.z, N / 2 - e.x) + (Math.random() - 0.5);
      a.mode = 'out'; a.leg = 0; a.dist = 0; a.sign = Math.random() < 0.5 ? 1 : -1; a.dir = base + (Math.random() - 0.5) * 0.8;
      a.lens = [2 + Math.random() * 3, 3 + (4 + Math.random() * 8) * (0.5 + sk), 3 + (3 + Math.random() * 8) * (0.5 + sk)]; }
  }
  if (a.mode === 'out') {
    if (!inHome && a.dist > a.lens[a.leg]) { a.leg++; a.dist = 0; a.dir += a.sign * Math.PI / 2; if (a.leg >= a.lens.length) a.mode = 'back'; }
    const tx = e.x + Math.cos(a.dir) * 3, tz = e.z + Math.sin(a.dir) * 3; if (tx < 2 || tz < 2 || tx > N - 2 || tz > N - 2) { a.dir += a.sign * Math.PI / 2; a.leg++; a.dist = 0; if (a.leg >= a.lens.length) a.mode = 'back'; }
    want = a.dir;
  }
  if (a.mode === 'back') { if (a.home) want = Math.atan2(a.home.z - e.z, a.home.x - e.x); if (!e.trail.length && inHome) a.mode = 'home'; }
  e.th = steer(e, want);
}

// ---------- input ----------
const keys = {}; let ptr = null, touch0 = null, touchDir = null, autoP = QS.has('auto');
const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), v3 = new THREE.Vector3(), v2 = new THREE.Vector2();
addEventListener('keydown', (e) => { keys[e.code] = true; unlock(); });
addEventListener('keyup', (e) => { keys[e.code] = false; });
canvas.addEventListener('pointerdown', (e) => { unlock(); if (e.pointerType !== 'mouse') touch0 = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') ptr = { x: e.clientX, y: e.clientY };
  else if (touch0) { const dx = e.clientX - touch0.x, dy = e.clientY - touch0.y; if (dx * dx + dy * dy > 144) { touchDir = Math.atan2(dy, dx); if (dx * dx + dy * dy > 3600) { touch0.x += dx * 0.3; touch0.y += dy * 0.3; } } }
});
addEventListener('pointerup', () => { touch0 = null; });
function playerInput(p) {
  const kx = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0), kz = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (kx || kz) { p.th = Math.atan2(kz, kx); ptr = null; touchDir = null; return; }
  if (touchDir !== null) { p.th = touchDir; return; }
  if (ptr) { v2.set((ptr.x / innerWidth) * 2 - 1, -(ptr.y / innerHeight) * 2 + 1); ray.setFromCamera(v2, camera);
    if (ray.ray.intersectPlane(plane, v3)) { const dx = v3.x - p.x, dz = v3.z - p.z; if (dx * dx + dz * dz > 0.6) p.th = Math.atan2(dz, dx); } }
}

// ---------- game flow ----------
const $ = (id) => document.getElementById(id);
let player = null;
const camPos = new THREE.Vector3(N / 2, 0, N / 2);
function levelCfg(lv) { return { bots: Math.min(2 + lv, 9), target: Math.min(15 + 5 * lv, 60), skill: Math.min(1, 0.3 + 0.08 * lv), bspeed: Math.min(6.6, 5.6 + 0.12 * lv) }; }
function start(lv) {
  level = lv; L = levelCfg(lv); owner.fill(0); trail.fill(0); counts.fill(0); texData.fill(0); dirty = true;
  for (const e of ents) scene.remove(e.tok); ents.length = 0;
  const cols = [save.skin, ...PAL.map((_, i) => i).filter((i) => i !== save.skin)];
  for (let k = 0; k <= L.bots; k++) {
    const e = { id: k + 1, ci: cols[k], isPlayer: k === 0, name: k === 0 ? 'You' : NAMES[k - 1], speed: k === 0 ? 6.4 : L.bspeed, skill: k === 0 ? 0.9 : L.skill * (0.7 + Math.random() * 0.3), kills: 0, best: 0 };
    groundU.pal.value[e.id - 1].set(PAL[e.ci]).convertLinearToSRGB(); e.tok = makeToken(PAL[e.ci]); ents.push(e);
    spawn(e, k === 0 ? [N >> 1, N >> 1] : null);
  }
  player = ents[0]; state = 'play'; $('card').classList.add('hide'); $('hud').classList.remove('hide');
  $('lvl').textContent = 'LEVEL ' + lv; $('goal').style.left = L.target + '%'; $('fill').style.background = PAL[player.ci];
  camPos.set(player.x, 0, player.z);
}
function showCard(title, text, btn, fn) {
  $('ctitle').textContent = title; $('ctext').innerHTML = text; $('cbtn').textContent = btn; $('cbtn').onclick = () => { unlock(); sfx('click'); fn(); };
  const sk = $('skins'); sk.innerHTML = '';
  PAL.slice(0, 7).forEach((c, i) => { const s = document.createElement('span'); s.style.background = c; const open = i < save.best; if (!open) s.className = 'lock'; else if (i === save.skin) s.className = 'sel';
    s.onclick = () => { if (!open) return; save.skin = i; store(); sfx('click'); showCard(title, text, btn, fn); }; sk.appendChild(s); });
  $('card').classList.remove('hide');
}
function step(dt) {
  time += dt; pulseT = Math.max(0, pulseT - dt * 1.5); groundU.pulse.value = pulseT;
  if (state === 'dying') { deadT -= dt; if (deadT <= 0) { state = 'dead'; const k = player.killer;
    showCard('CUT!', (k ? 'Snipped by <b>' + k.name + '</b>.' : 'You tore your own trail.') + '<br>Best land: ' + player.best.toFixed(1) + '% / goal ' + L.target + '%', 'TRY AGAIN', () => start(level)); } }
  if (state !== 'play' && state !== 'dying') return;
  if (state === 'play') { if (autoP) think(player, dt); else playerInput(player); }
  for (const e of ents) {
    if (!e.alive) { if (!e.isPlayer && (e.respawn -= dt) <= 0) spawn(e); continue; }
    if (!e.isPlayer) think(e, dt);
    let d = e.th - e.h; d = Math.atan2(Math.sin(d), Math.cos(d)); const tr = 9 * dt; e.h += Math.max(-tr, Math.min(tr, d)); e.turn = d;
    const dist = e.speed * dt, n = Math.ceil(dist / 0.4);
    for (let s = 0; s < n && e.alive; s++) {
      e.x += Math.cos(e.h) * (dist / n); e.z += Math.sin(e.h) * (dist / n);
      const i = Math.floor(e.x), j = Math.floor(e.z), c = i >= 0 && j >= 0 && i < N && j < N ? idx(i, j) : -1;
      if (c !== e.cell) enterCell(e, i, j);
    }
  }
  // head-on bumps: whoever is outside their land (longer trail first) tears
  for (let a = 0; a < ents.length; a++) for (let b = a + 1; b < ents.length; b++) {
    const A = ents[a], B = ents[b]; if (!A.alive || !B.alive || (A.x - B.x) ** 2 + (A.z - B.z) ** 2 > 0.64) continue;
    const sa = owner[A.cell] === A.id, sb = owner[B.cell] === B.id;
    if (sa && sb) continue; if (sa) kill(B, A); else if (sb) kill(A, B); else if (A.trail.length >= B.trail.length) kill(A, B); else kill(B, A);
  }
  if (player.alive) { const p = pct(player.id); player.best = Math.max(player.best, p);
    if (state === 'play' && p >= L.target) { state = 'won'; stats.wins++; sfx('win');
      for (let k = 0; k < 6; k++) burst(player.x + (Math.random() - 0.5) * 8, player.z + (Math.random() - 0.5) * 8, PAL[(Math.random() * 10) | 0], 30, 1.5);
      const lv = level; save.lvl = lv + 1; const unlocked = lv + 1 > save.best && lv < 7; save.best = Math.max(save.best, lv + 1); store();
      setTimeout(() => { if (state === 'won' && level === lv) showCard('LEVEL ' + lv + ' CLEARED', 'You covered ' + p.toFixed(1) + '% of the sheet.<br>Snips: ' + player.kills + (unlocked ? '<br><b>New paper colour unlocked!</b>' : ''), 'NEXT LEVEL', () => start(lv + 1)); }, 1400); } }
}

// ---------- render loop ----------
function resize() { const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const pops = $('pops');
function popText(t, x, z, color) { v3.set(x, 1, z).project(camera); const d = document.createElement('div'); d.className = 'pop'; d.textContent = t; d.style.color = color;
  d.style.left = ((v3.x + 1) / 2) * innerWidth + 'px'; d.style.top = ((1 - v3.y) / 2) * innerHeight - 40 + 'px'; pops.appendChild(d); setTimeout(() => d.remove(), 1100); }
let hudT = 0;
function hud(dt) {
  if ((hudT -= dt) > 0 || !player) return; hudT = 0.25;
  const p = pct(player.id); $('fill').style.width = Math.min(100, p) + '%'; $('pct').textContent = p.toFixed(1) + '% / ' + L.target + '%';
  const rows = ents.filter((e) => e.alive).sort((a, b) => counts[b.id] - counts[a.id]).slice(0, 5);
  $('board').innerHTML = rows.map((e) => `<li style="${e.isPlayer ? 'font-weight:900' : ''}"><i style="background:${PAL[e.ci]}"></i>${e.name}<b>${pct(e.id).toFixed(1)}%</b></li>`).join('');
}
function draw(dt) {
  if (dirty) { tex.needsUpdate = true; dirty = false; }
  for (const e of ents) { if (!e.alive) continue; const t = e.tok, b = t.userData.body;
    t.position.set(e.x, 0, e.z); b.rotation.set(Math.max(-0.35, Math.min(0.35, (e.turn || 0) * 0.4)), -e.h, 0, 'YXZ'); b.position.y = 0.06 + Math.abs(Math.sin(time * 9 + e.id)) * 0.08; }
  if (player) { const k = 1 - Math.exp(-dt * 5); camPos.x += (player.x - camPos.x) * k; camPos.z += (player.z - camPos.z) * k; }
  const hgt = innerHeight > innerWidth ? 34 : 24;
  shake = Math.max(0, shake - dt * 1.8); const sx = (Math.random() - 0.5) * shake, sz = (Math.random() - 0.5) * shake;
  camera.position.set(camPos.x + sx, hgt, camPos.z + hgt * 0.62 + sz); camera.lookAt(camPos.x, 0, camPos.z + 1);
  tickConf(dt); hud(dt); renderer.render(scene, camera);
}
let last = performance.now();
function frame(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); draw(dt); requestAnimationFrame(frame); }
$('mute').onclick = () => { audio.muted = !audio.muted; $('mute').style.opacity = audio.muted ? 0.4 : 1; };
if (audio.muted) $('mute').style.opacity = 0.4;

if (QS.has('title')) { start(save.lvl); state = 'title'; $('hud').classList.add('hide'); showCard('PAPER LAND', 'Cut out the biggest piece of the sheet.<br>Level ' + save.lvl + ' &middot; goal ' + levelCfg(save.lvl).target + '%', 'PLAY', () => start(save.lvl)); }
else start(save.lvl);
requestAnimationFrame(frame);

window.__G = { start, stats, ents, pct, N, get state() { return state; }, get level() { return level; }, get player() { return player; }, set auto(v) { autoP = v; },
  fast(sec, dt = 1 / 30) { for (let t = 0; t < sec; t += dt) { step(dt); tickConf(dt); } draw(0.016); } };
