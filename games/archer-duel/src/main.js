// ARCHER DUEL - woodcut ragdoll archery. One module: render, ragdoll, arrows, bot, UI, sound.
import * as THREE from '../vendor/three.module.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

// ---------- online (PLAYPILE lobby) ----------
// The PLAYPILE play page opens this with ?pponline=host|guest and carries
// messages through ../../_shared/pplink.js. It is DUEL 2P with the host as
// RED and the guest as INDIGO, taking turns. A shot is sent as the angle
// and power it was loosed at, so both screens fly the same arrow - but the
// HOST IS THE REFEREE: it alone decides hits, damage, who goes down, the
// wind, whose turn it is and the score, and the guest is told. Opened on
// its own, NET is null and none of this runs.
const NET = Q.has('pponline') ? await import('../../_shared/pplink.js').then((m) => m.pplink()).catch(() => null) : null;
const GUEST = !!NET && !NET.host;
const MY = GUEST ? 1 : 0, OTHER = 1 - MY;
const ON = { peerReady: false, hiT: 0, got: false, setup: null, aimT: 0 };
const COL = { paper: 0xefe4cc, ink: 0x1b1714, red: 0xb8321f, blue: 0x2d3a5a, ochre: 0xc89b3c, moss: 0x5b6b3a, bone: 0xe6d6b3 };
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ---------- renderer / scene ----------
const canvas = $('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
const DPR = Math.min(devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
const scene = new THREE.Scene();
scene.background = new THREE.Color(COL.paper);
const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
const U = { px: { value: 1 / DPR }, L: { value: new THREE.Vector3(-0.45, 0.7, 0.55).normalize() }, ink: { value: new THREE.Color(COL.ink) }, paper: { value: new THREE.Color(COL.paper) }, time: { value: 0 } };

const NOISE = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
`;
const VS = `varying vec3 vN; varying vec3 vW;
void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`;
// Woodcut: flat ink tint in the light, carved gouge lines (wobbly, tapered) in the shade, cross-cuts in deep shade, paper nicks everywhere.
const FS = `uniform vec3 uTint,ink,paper,L; uniform float uAng,uDen,px,uLit; uniform vec2 uYG; varying vec3 vN; varying vec3 vW;
${NOISE}
float cut(vec2 sp,float a,float den,float w){ vec2 r=vec2(cos(a)*sp.x+sin(a)*sp.y,-sin(a)*sp.x+cos(a)*sp.y);
  float wob=noise(r*vec2(0.012,0.04))*1.8+noise(r*0.13)*0.18; float f=abs(fract(r.y/den+wob)-0.5)*2.;
  float taper=w*(0.65+0.7*noise(r*vec2(0.05,0.2)+3.1)); return step(0.02,w)*(1.-smoothstep(taper-0.14,taper+0.14,f)); }
void main(){ vec3 n=normalize(vN); float d=dot(n,L)*0.5+0.5; float t=d*uLit+(vW.y-uYG.x)*uYG.y;
  vec2 sp=gl_FragCoord.xy*px; t+=(noise(sp*0.3)-0.5)*0.16;
  float k=cut(sp,uAng,uDen,clamp((0.78-t)*1.15,0.,0.92));
  if(t<0.45) k=max(k,cut(sp+7.,uAng+1.15,uDen*0.85,clamp((0.45-t)*1.7,0.,0.85)));
  if(t<0.14) k=1.;
  vec3 c=mix(uTint,paper,step(0.94,noise(sp*0.8+17.))*0.55);
  gl_FragColor=vec4(mix(c,ink,k),1.); }`;
function wood(tint, o = {}) {
  return new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { ...U, uTint: { value: new THREE.Color(tint) }, uAng: { value: o.ang ?? 0.75 }, uDen: { value: o.den ?? 6 }, uLit: { value: o.lit ?? 1 }, uYG: { value: new THREE.Vector2(...(o.yg || [0, 0])) } }, side: o.side ?? THREE.FrontSide });
}
const inkMat = new THREE.MeshBasicMaterial({ color: COL.ink });
const hullMat = new THREE.MeshBasicMaterial({ color: COL.ink, side: THREE.BackSide });
function withHull(geo, mat, grow = 0.03) {
  const g = new THREE.Group(); const m = new THREE.Mesh(geo, mat); g.add(m);
  const h = new THREE.Mesh(geo, hullMat); h.userData.grow = grow; g.add(h); g.userData.hull = h; return g;
}

// sky: paper with wood-grain horizontal carving, a ringed vermilion sun
{
  const m = new THREE.ShaderMaterial({ uniforms: { ...U }, vertexShader: VS, fragmentShader: `uniform vec3 ink,paper; uniform float time; varying vec3 vW; varying vec3 vN; ${NOISE}
  void main(){ vec2 p=vW.xy; vec3 c=paper;
    float wob=noise(p*vec2(0.025,0.09))*3.2+sin(p.x*0.04+time*0.05)*1.2; float f=abs(fract((p.y+wob)/1.9)-0.5)*2.;
    float dens=0.08+0.1*smoothstep(40.,5.,p.y)*noise(p*vec2(0.02,0.3)+2.);
    c=mix(c,ink,(1.-smoothstep(dens-0.03,dens+0.03,f))*0.85);
    vec2 s=p-vec2(18.,34.); float r=length(s);
    if(r<11.){ float ring=abs(fract(r/1.4)-0.5)*2.; c=mix(vec3(0.72,0.2,0.12),paper,step(0.82,ring)*step(3.,r)); }
    if(abs(r-11.)<0.35) c=ink;
    c=mix(c,paper,step(0.95,noise(p*2.1))*0.5);
    gl_FragColor=vec4(c,1.); }` });
  const sky = new THREE.Mesh(new THREE.PlaneGeometry(400, 200), m); sky.position.set(0, 40, -70); scene.add(sky);
}
// mountain ridges: three carved silhouettes, far = pale indigo
function ridge(z, base, amp, tint, seed, den) {
  const s = new THREE.Shape(); const W = 160; s.moveTo(-W, -30);
  const pts = [];
  for (let x = -W; x <= W; x += 2) { const y = base + amp * (Math.sin(x * 0.045 + seed) * 0.5 + Math.sin(x * 0.11 + seed * 2.3) * 0.3 + Math.sin(x * 0.27 + seed * 5) * 0.12 + 0.6); pts.push(new THREE.Vector3(x, y, z + 0.05)); s.lineTo(x, y); }
  s.lineTo(W, -30);
  const mesh = new THREE.Mesh(new THREE.ShapeGeometry(s), wood(tint, { lit: 1.05, yg: [base + amp, 0.05], den, ang: 0.3 })); mesh.position.z = z; scene.add(mesh);
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: COL.ink })); scene.add(line);
}
ridge(-55, 2, 16, 0x8f98ad, 1.3, 7); ridge(-38, -1, 10, 0x55628a, 4.1, 6); ridge(-22, -4, 6, 0x4a5a3a, 2.2, 5);
const FLOOR = -5;
{
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(300, 80), wood(COL.moss, { lit: 1.0, ang: 0.05, den: 7 })); fl.rotation.x = -Math.PI / 2; fl.position.set(0, FLOOR, -20); scene.add(fl);
  const pineMat = wood(COL.moss, { lit: 0.85, ang: 1.2, den: 5 });
  for (let i = 0; i < 16; i++) {
    const t = new THREE.Group(); const h = rnd(3, 6);
    for (let k = 0; k < 3; k++) { const c = withHull(new THREE.ConeGeometry(h * 0.32 * (1 - k * 0.22), h * 0.5, 7), pineMat); c.position.y = h * 0.3 + k * h * 0.22; t.add(c); }
    t.position.set(rnd(-45, 45), FLOOR, rnd(-16, -4)); scene.add(t);
  }
}
const pillarMat = wood(COL.ochre, { ang: 1.35, den: 5.5 }); const capMat = wood(COL.moss, { ang: 0.2 });
const pillars = [];
function makePillar() {
  const g = new THREE.Group();
  const body = withHull(new THREE.BoxGeometry(2.8, 1, 2.2), pillarMat, 0.02); g.add(body);
  const cap = withHull(new THREE.BoxGeometry(3.2, 0.35, 2.6), capMat, 0.02); g.add(cap);
  scene.add(g); return { g, body, cap, x: 0, top: 0, hw: 1.6 };
}
function placePillar(P, x, top) {
  P.x = x; P.top = top; const h = top - FLOOR;
  P.body.scale.set(1, h, 1); P.body.position.set(0, FLOOR + h / 2 - top - 0.17, 0); P.cap.position.y = -0.175; P.g.position.set(x, top, 0);
  fixHulls(P.g);
}
function fixHulls(root) { root.traverse((o) => { if (o.userData.hull) { const h = o.userData.hull; const s = o.scale; const gr = h.userData.grow; h.scale.set(1 + gr * 2 / Math.max(0.1, s.x), 1 + gr * 2 / Math.max(0.1, s.y), 1 + gr * 2 / Math.max(0.1, s.z)); } }); }
pillars.push(makePillar(), makePillar());

// ---------- sound ----------
let AC = null, NB = null, muted = Q.has('mute');
function audio() {
  if (AC || muted) return; try { AC = new (window.AudioContext || window.webkitAudioContext)(); NB = AC.createBuffer(1, AC.sampleRate, AC.sampleRate); const d = NB.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; } catch (e) { AC = null; }
}
function tone(f0, f1, dur, type = 'sine', vol = 0.3, at = 0) {
  if (!AC || muted) return; const t = AC.currentTime + at; const o = AC.createOscillator(), g = AC.createGain(); o.type = type;
  o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, ftype, freq, vol = 0.3, at = 0, f1) {
  if (!AC || muted) return; const t = AC.currentTime + at; const s = AC.createBufferSource(); s.buffer = NB; const fl = AC.createBiquadFilter(); fl.type = ftype; fl.frequency.setValueAtTime(freq, t); if (f1) fl.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = AC.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur); s.connect(fl).connect(g).connect(AC.destination); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}
const SFX = {
  loose() { tone(190, 70, 0.22, 'triangle', 0.35); noise(0.25, 'bandpass', 2500, 0.18, 0, 600); },
  thunk() { tone(140, 60, 0.14, 'sine', 0.4); noise(0.08, 'lowpass', 900, 0.3); },
  hit() { tone(110, 45, 0.2, 'sine', 0.5); noise(0.16, 'bandpass', 700, 0.4); },
  head() { tone(110, 40, 0.3, 'sine', 0.6); noise(0.2, 'bandpass', 900, 0.45); tone(1400, 900, 0.25, 'square', 0.06); },
  draw() { noise(0.3, 'bandpass', 300, 0.06, 0, 1200); },
  win() { [392, 494, 587, 784].forEach((f, i) => tone(f, f, 0.3, 'triangle', 0.22, i * 0.12)); },
  lose() { [330, 262, 196, 147].forEach((f, i) => tone(f, f * 0.98, 0.35, 'triangle', 0.22, i * 0.16)); },
  click() { tone(600, 400, 0.06, 'square', 0.06); },
};

// ---------- ragdoll archers ----------
// points: 0 head 1 neck 2 pelvis 3 bowElbow 4 bowHand 5 drawElbow 6 drawHand 7 lKnee 8 lFoot 9 rKnee 10 rFoot
const STICKS = [[0, 1, 'head', 0.07, 0], [1, 2, 'torso', 0.16, 0], [1, 3, 'arm', 0.06, 0.16], [3, 4, 'arm', 0.055, 0.16], [1, 5, 'arm', 0.06, -0.16], [5, 6, 'arm', 0.055, -0.16], [2, 7, 'leg', 0.085, -0.09], [7, 8, 'leg', 0.075, -0.09], [2, 9, 'leg', 0.085, 0.09], [9, 10, 'leg', 0.075, 0.09]];
const GRAV = 16, STEP = 1 / 120;
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 10); const headGeo = new THREE.SphereGeometry(0.17, 16, 12);
const bowCurve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.06, 0.58, 0), new THREE.Vector3(0.26, 0, 0), new THREE.Vector3(-0.06, -0.58, 0));
const bowGeo = new THREE.TubeGeometry(bowCurve, 16, 0.028, 6); const bowHull = new THREE.TubeGeometry(bowCurve, 16, 0.05, 6);

function arrowMesh(tint) {
  const g = new THREE.Group();
  const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.8, 5), inkMat); sh.rotation.z = Math.PI / 2; sh.position.x = -0.4; g.add(sh);
  const hd = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.14, 5), inkMat); hd.rotation.z = -Math.PI / 2; hd.position.x = 0.0; g.add(hd);
  const fm = new THREE.MeshBasicMaterial({ color: tint, side: THREE.DoubleSide });
  for (const s of [1, -1]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.07), fm); f.position.set(-0.72, 0.04 * s, 0); f.rotation.x = s > 0 ? 0 : Math.PI; g.add(f); }
  return g;
}

class Archer {
  constructor(idx) {
    this.idx = idx; this.tint = idx ? COL.blue : COL.red; this.p = new Float32Array(22); this.o = new Float32Array(22); this.t = new Float32Array(22);
    this.limp = new Float32Array(11); this.rest = new Float32Array(STICKS.length); this.root = new THREE.Group(); scene.add(this.root);
    const body = wood(this.tint, { ang: idx ? -0.8 : 0.8, den: 4 }), skin = wood(COL.bone, { ang: 0.8, den: 4 });
    this.parts = STICKS.map(([, , kind, r]) => { const g = withHull(cylGeo, kind === 'torso' ? body : kind === 'arm' ? skin : body, 0.025); g.userData.r = r; this.root.add(g); return g; });
    this.headM = withHull(headGeo, skin, 0.03); this.root.add(this.headM);
    const hat = withHull(new THREE.ConeGeometry(0.3, 0.16, 12), wood(idx ? COL.ochre : COL.ink, { den: 3 }), 0.02); hat.position.y = 0.13; this.headM.add(hat);
    this.bow = new THREE.Group(); this.bow.add(new THREE.Mesh(bowGeo, wood(0x7a4a22, { den: 3 }))); this.bow.add(new THREE.Mesh(bowHull, hullMat)); this.root.add(this.bow);
    this.string = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3)), new THREE.LineBasicMaterial({ color: COL.ink })); this.root.add(this.string);
    this.nock = arrowMesh(this.tint); this.root.add(this.nock);
  }
  reset(x, y, f, hp) {
    this.f = f; this.bx = x; this.by = y; this.alive = true; this.maxHp = hp; this.hp = hp; this.ang = f > 0 ? 0.3 : Math.PI - 0.3; this.draw = 0; this.reload = 0.6; this.aimT = 0; this.limp.fill(0); this.flinch = 0; this.plan = null; this.wait = 1.2;
    this.pose(0); this.p.set(this.t); this.o.set(this.t);
    STICKS.forEach(([a, b], i) => { this.rest[i] = Math.hypot(this.t[a * 2] - this.t[b * 2], this.t[a * 2 + 1] - this.t[b * 2 + 1]); });
  }
  pose(time) {
    const T = this.t, f = this.f, x = this.bx, y = this.by, br = Math.sin(time * 2.2 + this.idx) * 0.012, set = (i, px, py) => { T[i * 2] = px; T[i * 2 + 1] = py; };
    const nx = x + f * 0.04, ny = y + 1.55 + br; set(1, nx, ny); set(0, nx + f * 0.03, ny + 0.24); set(2, x - f * 0.02, y + 1.0 + br * 0.5);
    set(8, x - 0.24, y); set(10, x + 0.24, y); set(7, x - 0.15, y + 0.52); set(9, x + 0.17, y + 0.52);
    const dx = Math.cos(this.ang), dy = Math.sin(this.ang);
    set(3, nx + dx * 0.32 - 0.02 * dy * f, ny - 0.05 + dy * 0.32); set(4, nx + dx * 0.62, ny - 0.05 + dy * 0.62);
    const pull = 0.12 + 0.48 * this.draw, hX = nx + dx * (0.62 - pull), hY = ny - 0.05 + dy * (0.62 - pull);
    set(6, hX, hY); const px = -dy * f, py = dx * f; set(5, (nx + hX) / 2 - dx * 0.12 + px * 0.16, (ny + hY) / 2 - dy * 0.12 + py * 0.16);
  }
  get handX() { return this.p[8]; } get handY() { return this.p[9]; }
  spawn(ang) { const nx = this.p[2], ny = this.p[3] - 0.05; return [nx + Math.cos(ang) * 0.72, ny + Math.sin(ang) * 0.72]; }
  step(dt, time) {
    if (this.alive) this.pose(time);
    const P = this.p, O = this.o, T = this.t;
    for (let i = 0; i < 11; i++) {
      const ix = i * 2, iy = ix + 1; const vx = (P[ix] - O[ix]) * 0.995, vy = (P[iy] - O[iy]) * 0.995; O[ix] = P[ix]; O[iy] = P[iy];
      P[ix] += vx; P[iy] += vy - GRAV * dt * dt * (this.alive ? 0.4 : 1);
      if (this.alive) { this.limp[i] = Math.max(0, this.limp[i] - dt); const k = (i === 8 || i === 10) ? 0.6 : this.limp[i] > 0 ? 0.012 : 0.09 - this.flinch * 0.3; P[ix] += (T[ix] - P[ix]) * k; P[iy] += (T[iy] - P[iy]) * k; }
    }
    this.flinch = Math.max(0, this.flinch - dt * 0.6);
    for (let it = 0; it < 3; it++) {
      STICKS.forEach(([a, b], s) => {
        const ax = a * 2, bx = b * 2; let dx = P[bx] - P[ax], dy = P[bx + 1] - P[ax + 1]; const d = Math.hypot(dx, dy) || 1e-4;
        const rest = this.alive ? Math.hypot(T[bx] - T[ax], T[bx + 1] - T[ax + 1]) : this.rest[s]; const k = (d - rest) / d * 0.5; dx *= k; dy *= k;
        P[ax] += dx; P[ax + 1] += dy; P[bx] -= dx; P[bx + 1] -= dy;
      });
      if (!this.alive) for (let i = 0; i < 11; i++) collide(P, O, i * 2);
    }
  }
  die(vx, vy, pts) {
    this.alive = false; STICKS.forEach(([a, b], i) => { this.rest[i] = Math.hypot(this.p[a * 2] - this.p[b * 2], this.p[a * 2 + 1] - this.p[b * 2 + 1]); });
    for (let i = 0; i < 11; i++) { const m = pts.includes(i) ? 0.0013 : 0.0005; this.o[i * 2] -= vx * m; this.o[i * 2 + 1] -= vy * m - 0.01; }
  }
  push(pts, vx, vy, m) { for (const i of pts) { this.o[i * 2] -= vx * m; this.o[i * 2 + 1] -= vy * m; } }
  render() {
    const P = this.p;
    STICKS.forEach(([a, b, , r, z], i) => {
      const g = this.parts[i]; const ax = P[a * 2], ay = P[a * 2 + 1], bx = P[b * 2], by = P[b * 2 + 1]; const len = Math.hypot(bx - ax, by - ay);
      g.position.set((ax + bx) / 2, (ay + by) / 2, z * this.f * (this.idx ? -1 : 1)); g.rotation.set(0, 0, Math.atan2(by - ay, bx - ax) - Math.PI / 2); g.scale.set(r, len + r, r);
      const h = g.userData.hull; h.scale.set(1 + 0.025 / r, 1 + 0.02 / (len + r), 1 + 0.025 / r);
    });
    const zo = 0;
    this.headM.position.set(P[0], P[1], zo); this.headM.rotation.z = Math.atan2(P[1] - P[3], P[0] - P[2]) - Math.PI / 2; this.headM.scale.x = this.f;
    const fa = Math.atan2(P[9] - P[7], P[8] - P[6]); const bz = 0.18 + zo; this.bow.position.set(P[8], P[9], bz); this.bow.rotation.z = fa;
    const c = Math.cos(fa), s = Math.sin(fa); const tx = (lx, ly) => [P[8] + lx * c - ly * s, P[9] + lx * s + ly * c];
    const [t1x, t1y] = tx(-0.06, 0.58), [t2x, t2y] = tx(-0.06, -0.58); const drawn = this.alive && this.draw > 0.05;
    const mx = drawn ? P[12] : (t1x + t2x) / 2, my = drawn ? P[13] : (t1y + t2y) / 2; const a = this.string.geometry.attributes.position;
    a.array.set([t1x, t1y, bz, mx, my, bz, t2x, t2y, bz]); a.needsUpdate = true; this.string.geometry.computeBoundingSphere();
    this.nock.visible = this.alive && this.reload <= 0;
    if (this.nock.visible) { this.nock.position.set(P[12] + Math.cos(fa) * 0.8, P[13] + Math.sin(fa) * 0.8, bz); this.nock.rotation.z = fa; }
  }
  hitTest(x, y) {
    const P = this.p; if (Math.hypot(x - P[0], y - P[1]) < 0.19) return { part: 'head', s: 0, pts: [0, 1] };
    let best = null, bd = 1e9;
    for (let s = 1; s < STICKS.length; s++) {
      const [a, b, kind, r] = STICKS[s]; const ax = P[a * 2], ay = P[a * 2 + 1], bx = P[b * 2], by = P[b * 2 + 1]; const dx = bx - ax, dy = by - ay;
      const t = clamp(((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1), 0, 1); const d = Math.hypot(x - ax - dx * t, y - ay - dy * t) - (r + 0.03);
      if (d < 0 && d < bd) { bd = d; best = { part: kind, s, pts: [a, b] }; }
    }
    return best;
  }
}
function collide(P, O, ix) {
  const x = P[ix], y = P[ix + 1];
  for (const pl of pillars) if (Math.abs(x - pl.x) < pl.hw && y < pl.top && y > pl.top - 0.8) { P[ix + 1] = pl.top; O[ix] += (x - O[ix]) * 0.4; return; }
  if (y < FLOOR) { P[ix + 1] = FLOOR; O[ix] += (x - O[ix]) * 0.4; }
}
const A = [new Archer(0), new Archer(1)]; fixHulls(scene);

// ---------- arrows & particles ----------
let arrows = [];
function fire(ar, ang, power, dmgMul = 1) {
  const sp = 12 + 23 * power; const [x, y] = ar.spawn(ang);
  const m = arrowMesh(ar.tint); scene.add(m);
  arrows.push({ x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, ang, owner: ar.idx, fly: true, m, life: 0, dmgMul, z: 0.18 });
  if (arrows.length > 40) { const old = arrows.find((a) => !a.fly); if (old) { scene.remove(old.m); arrows.splice(arrows.indexOf(old), 1); } }
  SFX.loose();
}
const dropGeo = new THREE.CircleGeometry(1, 9); const drops = [];
const dropMats = [new THREE.MeshBasicMaterial({ color: COL.red }), new THREE.MeshBasicMaterial({ color: COL.ink })];
function splat(x, y, vx, vy, n, z) {
  for (let i = 0; i < n; i++) {
    let d = drops.find((q) => q.life <= 0); if (!d) { if (drops.length > 120) continue; d = { m: new THREE.Mesh(dropGeo, dropMats[0]) }; scene.add(d.m); drops.push(d); }
    d.m.material = dropMats[Math.random() < 0.7 ? 0 : 1]; d.x = x; d.y = y; d.z = z + 0.3; d.vx = vx * rnd(0.05, 0.25) + rnd(-2.5, 2.5); d.vy = vy * rnd(0.05, 0.2) + rnd(0, 4); d.s = rnd(0.04, 0.11); d.life = rnd(0.5, 1.1); d.m.visible = true;
  }
}

// ---------- game state ----------
const BOTNAMES = ['Hob the Thatcher', 'Widow Rook', 'Brother Ash', 'Marrow Jack', 'The Reeve', 'Sable Wren', 'Old Gallowglass', 'Lady Tallow', 'Crook of Fenmoor', 'The Last Yeoman'];
const PERKS = [
  { id: 'dmg', n: 'Heavy Heads', d: 'Your arrows hit 25% harder.' }, { id: 'helm', n: 'Iron Cap', d: 'Headshots against you deal 40% less.' },
  { id: 'quick', n: 'Quick Nock', d: 'Reload 30% faster.' }, { id: 'hide', n: 'Thick Hide', d: '+30 max health.' },
  { id: 'twin', n: 'Twin Shaft', d: 'Each loose fires a second arrow.' }, { id: 'leech', n: 'Red Thirst', d: 'Heal 6 for every hit you land.' },
  { id: 'eye', n: 'Hawk Eye', d: 'Longer aiming guide.' }, { id: 'mend', n: 'Field Mend', d: 'Fully heal now, and +50% heal between stages.' },
];
const G = window.__G = { state: 'boot', mode: '1p', stage: 1, perks: {}, score: [0, 0], turn: 0, auto: false, t: 0, archers: A, get arrows() { return arrows; } };
let best = 1; try { best = +localStorage.getItem('archer_duel_best') || 1; } catch (e) {}
let wind = 0, bot = null, hitstop = 0, slow = 1, slowT = 0, shake = 0, endT = 0, camFocus = null, camZoom = 0, firstShot = true, turnWait = 0;
let playerHp = 100;
const pk = (id) => G.perks[id] || 0;

function setupRound() {
  arrows.forEach((a) => scene.remove(a.m)); arrows = []; drops.forEach((d) => { d.life = 0; d.m.visible = false; });
  const n = G.stage; let dist = G.mode === '1p' ? 12 + Math.min(n, 10) * 0.9 : rnd(13, 18);
  let h0 = rnd(0, 3), h1 = rnd(0, 3) + (G.mode === '1p' ? Math.min(n, 6) * 0.3 : 0);
  if (GUEST && ON.setup) ({ dist, h0, h1 } = ON.setup);
  placePillar(pillars[0], -dist / 2, h0); placePillar(pillars[1], dist / 2, h1);
  wind = G.mode === '1p' ? (n >= 3 ? rnd(-1, 1) * Math.min(5, (n - 2) * 0.8) : 0) : rnd(-2.5, 2.5);
  if (GUEST && ON.setup) { wind = ON.setup.wind; G.score = ON.setup.score.slice(); }
  if (NET && !GUEST && !ON.quiet) NET.send({ t: 'setup', dist, h0, h1, wind, score: G.score });
  const maxP = 100 + pk('hide') * 30;
  A[0].reset(-dist / 2, h0, 1, G.mode === '1p' ? maxP : 100); if (G.mode === '1p') A[0].hp = Math.min(maxP, playerHp);
  A[1].reset(dist / 2, h1, -1, G.mode === '1p' ? 70 + 12 * n : 100);
  bot = G.mode === '1p' ? { err: Math.max(0.022, 0.11 - 0.009 * n), reload: Math.max(1.25, 2.7 - 0.13 * n), head: Math.min(0.55, 0.1 + 0.04 * n), dmg: 1 + n * 0.04, wait: 2.2, plan: null } : null;
  $('n0').textContent = G.mode === '1p' ? 'YOU' : 'RED'; $('n1').textContent = G.mode === '1p' ? BOTNAMES[(n - 1) % BOTNAMES.length].toUpperCase() : 'INDIGO';
  $('stage').textContent = G.mode === '1p' ? 'STAGE ' + n : 'RED ' + G.score[0] + ' - ' + G.score[1] + ' INDIGO';
  G.turn = 0; turnWait = 0; endT = 0; camFocus = null; slow = 1; G.state = 'play'; hidePanel(); hud();
  if (NET) { $('n0').textContent = MY === 0 ? 'YOU' : 'FRIEND'; $('n1').textContent = MY === 1 ? 'YOU' : 'FRIEND'; $('stage').textContent = 'ONLINE ' + G.score[MY] + ' - ' + G.score[OTHER]; banner(G.turn === MY ? 'YOUR SHOT' : 'FRIEND SHOOTS FIRST'); }
  else if (G.mode === '2p') banner('RED TO SHOOT');
}
function hud() {
  $('hp0').style.width = Math.max(0, A[0].hp / A[0].maxHp * 100) + '%'; $('hp1').style.width = Math.max(0, A[1].hp / A[1].maxHp * 100) + '%';
  const w = Math.abs(wind); $('wind').textContent = w < 0.2 ? 'wind: calm' : 'wind ' + (wind < 0 ? '← ' : '') + w.toFixed(1) + (wind > 0 ? ' →' : '');
}
function banner(txt) { const p = $('pop'); p.textContent = txt; p.classList.remove('on'); void p.offsetWidth; p.classList.add('on'); }
function floatText(txt, x, y, red) {
  if (G.fasting) return;
  const v = new THREE.Vector3(x, y, 0).project(camera); const d = document.createElement('div');
  d.textContent = txt; d.style.cssText = `position:fixed;left:${(v.x * 0.5 + 0.5) * innerWidth}px;top:${(-v.y * 0.5 + 0.5) * innerHeight}px;transform:translate(-50%,-50%);font-weight:bold;font-size:22px;color:${red ? '#b8321f' : '#1b1714'};text-shadow:2px 2px 0 #efe4cc;pointer-events:none;transition:all .9s ease-out;`;
  document.body.appendChild(d); requestAnimationFrame(() => { d.style.top = parseFloat(d.style.top) - 60 + 'px'; d.style.opacity = '0'; }); setTimeout(() => d.remove(), 1000);
}

function hitArcher(a, ar, h) {
  const shooterIsPlayer = G.mode === '1p' && a.owner === 0;
  const base = { head: 45, torso: 24, arm: 12, leg: 14 }[h.part];
  let dmg = base * a.dmgMul;
  if (G.mode === '1p') { if (a.owner === 0) dmg *= 1 + pk('dmg') * 0.25; else { dmg *= bot.dmg; if (h.part === 'head') dmg *= Math.pow(0.6, pk('helm')); } }
  dmg = Math.round(dmg);
  if (!GUEST) ar.hp -= dmg;   // online, the guest's damage comes from the host
  if (shooterIsPlayer && pk('leech')) A[0].hp = Math.min(A[0].maxHp, A[0].hp + 6 * pk('leech'));
  // stick the arrow into the limb, in that limb's frame
  const [i, j] = STICKS[h.s]; const P = ar.p; const sa = Math.atan2(P[j * 2 + 1] - P[i * 2 + 1], P[j * 2] - P[i * 2]); const len = Math.hypot(P[j * 2] - P[i * 2], P[j * 2 + 1] - P[i * 2 + 1]) || 1;
  const sp = Math.hypot(a.vx, a.vy); const tx = a.x + a.vx / sp * 0.12, ty = a.y + a.vy / sp * 0.12; const rx = tx - P[i * 2], ry = ty - P[i * 2 + 1];
  a.stuck = { ar, s: h.s, u: (rx * Math.cos(sa) + ry * Math.sin(sa)) / len, v: -rx * Math.sin(sa) + ry * Math.cos(sa), rel: a.ang - sa }; a.fly = false;
  for (const q of h.pts) ar.limp[q] = 0.45; ar.flinch = 0.18; ar.push(h.pts, a.vx, a.vy, 0.0012);
  const head = h.part === 'head'; splat(a.x, a.y, a.vx, a.vy, head ? 22 : 12, a.z); hitstop = head ? 0.12 : 0.06; shake = head ? 0.55 : 0.3;
  head ? SFX.head() : SFX.hit(); if (!GUEST) floatText((head ? 'HEADSHOT ' : '') + '-' + dmg, a.x, a.y + 0.4, true);
  if (NET && !GUEST) NET.send({ t: 'hit', who: ar.idx, hp: [A[0].hp, A[1].hp], dmg, head: head ? 1 : 0, x: a.x, y: a.y, down: ar.hp <= 0 && ar.alive ? 1 : 0, vx: a.vx, vy: a.vy, pts: h.pts });
  if (ar.hp <= 0 && ar.alive) {
    ar.hp = 0; ar.die(a.vx, a.vy, h.pts); slow = 0.22; slowT = 1.3; camFocus = ar; endT = 2.2; G.state = 'dying';
    banner(head ? 'PINNED!' : 'DOWN!');
  }
  hud();
}
function stepArrows(dt) {
  for (let k = arrows.length - 1; k >= 0; k--) {
    const a = arrows[k];
    if (a.stuck && a.stuck.ar) {
      const st = a.stuck, [i, j] = STICKS[st.s], P = st.ar.p; const sa = Math.atan2(P[j * 2 + 1] - P[i * 2 + 1], P[j * 2] - P[i * 2]); const len = Math.hypot(P[j * 2] - P[i * 2], P[j * 2 + 1] - P[i * 2 + 1]);
      const c = Math.cos(sa), s = Math.sin(sa), lu = st.u * len; a.x = P[i * 2] + lu * c - st.v * s; a.y = P[i * 2 + 1] + lu * s + st.v * c; a.ang = sa + st.rel; continue;
    }
    if (!a.fly) continue;
    a.life += dt; a.vx += wind * dt; a.vy -= GRAV * dt; const ox = a.x, oy = a.y; a.x += a.vx * dt; a.y += a.vy * dt; a.ang = Math.atan2(a.vy, a.vx);
    for (let sub = 1; sub <= 3 && a.fly; sub++) {
      const x = ox + (a.x - ox) * sub / 3, y = oy + (a.y - oy) * sub / 3;
      for (const ar of A) { if (ar.idx === a.owner && a.life < 0.4) continue; const h = ar.hitTest(x, y); if (h) { a.x = x; a.y = y; hitArcher(a, ar, h); break; } }
      if (!a.fly) break;
      for (const pl of pillars) if (Math.abs(x - pl.x) < pl.hw && y < pl.top && y > FLOOR) { a.x = x; a.y = y; a.fly = false; a.stuck = { ground: 1 }; SFX.thunk(); splat(x, y, 0, 2, 4, a.z); }
      if (a.fly && y < FLOOR) { a.x = x; a.y = FLOOR + 0.05; a.fly = false; a.stuck = { ground: 1 }; SFX.thunk(); }
    }
    if (a.fly && (Math.abs(a.x) > 90 || a.life > 8)) { scene.remove(a.m); arrows.splice(k, 1); a.fly = false; }
    if (!a.fly && !a.ended) { a.ended = true; if (G.mode === "2p" && a.owner === G.turn && G.state === "play") turnWait = 0.7; }
  }
}

// bot aim: brute-force a ballistic solve against the true wind, then miss by skill-scaled noise
function simY(ar, ang, sp, tx) {
  let [x, y] = ar.spawn(ang); let vx = Math.cos(ang) * sp, vy = Math.sin(ang) * sp; const dt = 1 / 60;
  for (let i = 0; i < 400; i++) { vx += wind * dt; vy -= GRAV * dt; x += vx * dt; y += vy * dt; if ((vx > 0 && x >= tx) || (vx < 0 && x <= tx)) return y; if (y < FLOOR) return null; }
  return null;
}
function solve(ar, tx, ty) {
  let best = null;
  for (let pw = 0.4; pw <= 1.001; pw += 0.05) for (let a = -0.5; a <= 1.25; a += 0.02) {
    const ang = ar.f > 0 ? a : Math.PI - a; const y = simY(ar, ang, 12 + 23 * pw, tx); if (y == null) continue;
    const e = Math.abs(y - ty) + a * 0.05; if (!best || e < best.e) best = { e, ang, pw };
  }
  return best || { ang: ar.f > 0 ? 0.6 : Math.PI - 0.6, pw: 1 };
}
function brain(ar, foe, skill, dt) {
  // skill = {err, reload, head}; ar.plan = draw-in-progress
  if (!ar.alive || !foe.alive) { ar.draw = Math.max(0, ar.draw - dt * 3); return; }
  if (!ar.plan) {
    if (ar.reload > 0) return; ar.wait = (ar.wait ?? 0.4) - dt; if (ar.wait > 0) return;
    const head = Math.random() < skill.head; const tx = head ? foe.p[0] : (foe.p[2] + foe.p[4]) / 2, ty = head ? foe.p[1] : (foe.p[3] + foe.p[5]) / 2;
    const s = solve(ar, tx, ty); ar.plan = { ang: s.ang + rnd(-1, 1) * skill.err, pw: clamp(s.pw + rnd(-1, 1) * skill.err * 0.6, 0.3, 1), t: 0 }; ar.from = ar.ang; SFX.draw();
  }
  const pl = ar.plan; pl.t += dt; const k = Math.min(1, pl.t / 0.7); ar.ang = ar.from + (pl.ang - ar.from) * k; ar.draw = pl.pw * k;
  if (k >= 1) { fire(ar, pl.ang, pl.pw, 1); ar.plan = null; ar.draw = 0; ar.reload = skill.reload; ar.wait = rnd(0.1, 0.6); }
}

// ---------- input ----------
let drag = null;
const dots = new THREE.InstancedMesh(new THREE.SphereGeometry(0.05, 6, 4), inkMat, 24); dots.count = 0; dots.frustumCulled = false; scene.add(dots);
function ctrl() { return G.mode === '2p' ? A[G.turn] : A[0]; }
canvas.addEventListener('pointerdown', (e) => { audio(); if (AC && AC.state === 'suspended') AC.resume(); if (G.state !== 'play' || G.auto) return; const ar = ctrl(); if (NET && G.turn !== MY) return; if (!ar.alive || (G.mode === '2p' && turnWait > 0) || arrows.some((a) => a.fly && G.mode === '2p')) return; drag = { x: e.clientX, y: e.clientY, ar, pw: 0 }; SFX.draw(); });
addEventListener('pointermove', (e) => {
  if (!drag) return; const dx = drag.x - e.clientX, dy = e.clientY - drag.y; const len = Math.hypot(dx, dy); if (len < 6) return;
  const f = drag.ar.f; let ang = Math.atan2(dy, dx); let rel = f > 0 ? ang : Math.PI - ang; rel = Math.atan2(Math.sin(rel), Math.cos(rel)); rel = clamp(rel, -1.2, 1.45);
  drag.ar.ang = f > 0 ? rel : Math.PI - rel; drag.pw = Math.min(1, len / (Math.min(innerWidth, innerHeight) * 0.32)); drag.ar.draw = drag.pw;
  if (NET && performance.now() - ON.aimT > 66) { ON.aimT = performance.now(); NET.send({ t: 'aim', ang: drag.ar.ang, draw: drag.pw }); }
});
function release() {
  if (!drag) return; const ar = drag.ar; const pw = drag.pw; drag = null; ar.draw = 0; dots.count = 0;
  if (G.state !== 'play' || pw < 0.12 || !ar.alive || ar.reload > 0) return;
  playerLoose(ar, ar.ang, pw);
}
function playerLoose(ar, ang, pw) {
  const twin = G.mode === '1p' && pk('twin');
  if (NET) NET.send({ t: 'shot', ang, pw });
  fire(ar, ang, pw); if (twin) setTimeout(() => ar.alive && fire(ar, ang + 0.035, pw * 0.97, 0.7), 90);
  ar.reload = G.mode === '1p' ? 0.85 * Math.pow(0.7, pk('quick')) : 0;
  if (firstShot) { firstShot = false; $('tip').style.opacity = '0'; }
}
addEventListener('pointerup', release); addEventListener('pointercancel', release);
function preview() {
  if (!drag || drag.pw < 0.05) { dots.count = 0; return; }
  const ar = drag.ar; let [x, y] = ar.spawn(ar.ang); const sp = 12 + 23 * drag.pw; let vx = Math.cos(ar.ang) * sp, vy = Math.sin(ar.ang) * sp; const dt = 0.02; const n = G.mode === '1p' ? 9 + pk('eye') * 9 : 12; const M = new THREE.Matrix4(); let c = 0;
  for (let i = 0; i < n * 2 && c < 24; i++) { vx += wind * dt; vy -= GRAV * dt; x += vx * dt; y += vy * dt; if (i % 2) { const s = 1 - c / (n + 2); M.makeScale(s, s, s).setPosition(x, y, 0.3); dots.setMatrixAt(c++, M); } }
  dots.count = c; dots.instanceMatrix.needsUpdate = true;
}

// ---------- panels ----------
const panel = $('panel');
function hidePanel() { panel.classList.add('hidden'); panel.innerHTML = ''; }
function show(html, binds) { panel.innerHTML = html; panel.classList.remove('hidden'); for (const [sel, fn] of Object.entries(binds)) panel.querySelectorAll(sel).forEach((el, i) => el.onclick = () => { SFX.click(); fn(i); }); }
function menu() {
  G.state = 'menu';
  show(`<h1>ARCHER<br>DUEL</h1><p>Pull back, loose, and pin your rival to the hill. Heads hit hardest.</p>
  <button class="btn red" id="b1">LADDER &middot; 1P</button><button class="btn" id="b2">DUEL &middot; 2P</button><p>best ladder stage: ${best}</p>`, { '#b1': () => startLadder(), '#b2': () => start2P() });
}
function startLadder() { G.mode = '1p'; G.stage = 1; G.perks = {}; playerHp = 100; setupRound(); }
function start2P() { G.mode = '2p'; G.score = [0, 0]; setupRound(); }
function roundOver() {
  const won = A[1].hp <= 0;
  if (G.mode === '2p') {
    G.score[won ? 0 : 1]++; SFX.win(); G.state = 'result';
    if (NET) { ON.lastW = won ? 0 : 1; NET.send({ t: 'over', score: G.score, w: ON.lastW }); onlineResult(); return; }
    show(`<h2>${won ? 'RED' : 'INDIGO'} TAKES IT</h2><p>RED ${G.score[0]} &mdash; ${G.score[1]} INDIGO</p><button class="btn red" id="r">NEXT DUEL</button><button class="btn" id="m">MENU</button>`, { '#r': () => setupRound(), '#m': menu });
    return;
  }
  if (won) {
    SFX.win(); G.state = 'perk'; const missing = A[0].maxHp - A[0].hp; playerHp = A[0].hp + missing * (0.4 + pk('mend') * 0.5);
    if (G.stage + 1 > best) { best = G.stage + 1; try { localStorage.setItem('archer_duel_best', best); } catch (e) {} }
    const pool = PERKS.slice().sort(() => Math.random() - 0.5).slice(0, 3); G.offer = pool;
    show(`<h2>STAGE ${G.stage} CLEARED</h2><p>Choose a blessing for the road.</p><div class="cards">${pool.map((p) => `<div class="card"><b>${p.n}${pk(p.id) ? ' +' : ''}</b>${p.d}</div>`).join('')}</div>`, { '.card': (i) => choosePerk(i) });
  } else {
    SFX.lose(); G.state = 'result';
    show(`<h2>FALLEN AT STAGE ${G.stage}</h2><p>best: stage ${best}</p><button class="btn red" id="r">AGAIN</button><button class="btn" id="m">MENU</button>`, { '#r': startLadder, '#m': menu });
  }
}
function choosePerk(i) { const p = G.offer[i]; G.perks[p.id] = pk(p.id) + 1; if (p.id === 'mend') playerHp = 999; if (p.id === 'hide') playerHp += 30; G.stage++; setupRound(); }
G.choosePerk = choosePerk; G.startLadder = startLadder; G.start2P = start2P; G.menu = menu;
G.aimAt = (i) => solve(A[i], A[1 - i].p[2], A[1 - i].p[3]);   // test hook: a shot from archer i at the other's chest
$('menuBtn').onclick = () => { SFX.click(); if (NET) { onlineMenu(); return; } menu(); };
$('muteBtn').onclick = () => { muted = !muted; $('muteBtn').style.opacity = muted ? 0.4 : 1; if (!muted) audio(); };
if (muted) $('muteBtn').style.opacity = 0.4;

// ---------- loop ----------
let acc = 0;
function simStep(dt) {
  G.t += dt; U.time.value = G.t;
  for (const ar of A) { ar.reload = Math.max(0, ar.reload - dt); ar.step(dt, G.t); }
  if (G.state === 'play' || G.state === 'dying') {
    if (G.mode === '1p') { brain(A[1], A[0], bot, dt); if (G.auto) brain(A[0], A[1], { err: 0.03, reload: 0.85, head: 0.3 }, dt); }
    else if (G.auto && G.state === 'play' && turnWait <= 0 && !arrows.some((a) => a.fly)) { const ar = A[G.turn], foe = A[1 - G.turn]; const s = solve(ar, foe.p[2], foe.p[3]); fire(ar, s.ang + rnd(-0.03, 0.03), s.pw); }
  }
  stepArrows(dt);
  if (turnWait > 0) { turnWait -= dt; if (turnWait <= 0 && G.state === 'play' && !GUEST) { G.turn = 1 - G.turn; wind = clamp(wind + rnd(-1, 1), -3, 3); hud(); if (NET) { NET.send({ t: 'turn', turn: G.turn, wind }); banner(G.turn === MY ? 'YOUR SHOT' : 'FRIEND TO SHOOT'); } else banner(G.turn ? 'INDIGO TO SHOOT' : 'RED TO SHOOT'); } }
  for (const d of drops) if (d.life > 0) { d.life -= dt; d.vy -= GRAV * dt; d.x += d.vx * dt; d.y += d.vy * dt; if (d.y < FLOOR) d.vy = d.vx = 0; }
}
function update(dtReal) {
  if (hitstop > 0) { hitstop -= dtReal; return; }
  if (slowT > 0) { slowT -= dtReal; if (slowT <= 0) slow = 1; }
  acc += dtReal * slow; let n = 0; while (acc >= STEP && n++ < 30) { simStep(STEP); acc -= STEP; }
  if (G.state === 'dying' && !GUEST) { endT -= dtReal; if (endT <= 0) roundOver(); }
  shake = Math.max(0, shake - dtReal * 1.6);
}
const camPos = new THREE.Vector3(0, 3, 30), camLook = new THREE.Vector3();
function frameCam(dtReal) {
  const x0 = A[0].bx, x1 = A[1].bx, cx = (x0 + x1) / 2, cy = (A[0].by + A[1].by) / 2 + 1.6; const aspect = innerWidth / innerHeight;
  const w = Math.abs(x1 - x0) + 4, h = Math.max(7.5, w / aspect); let dist = h / 2 / Math.tan(THREE.MathUtils.degToRad(17.5));
  let tx = cx, ty = cy; if (camFocus) { const k = 0.45; tx += (camFocus.p[2] - cx) * k; ty += (camFocus.p[3] - cy) * k; dist *= 0.6; }
  const l = 1 - Math.pow(0.02, dtReal); camPos.lerp(new THREE.Vector3(tx, ty + 1.2, dist), l); camLook.lerp(new THREE.Vector3(tx, ty, 0), l);
  camera.position.copy(camPos); camera.position.x += rnd(-1, 1) * shake * 0.4; camera.position.y += rnd(-1, 1) * shake * 0.4; camera.lookAt(camLook);
}
function draw(dtReal) {
  for (const ar of A) ar.render();
  for (const a of arrows) { a.m.position.set(a.x, a.y, a.z); a.m.rotation.z = a.ang; }
  for (const d of drops) { d.m.visible = d.life > 0; if (d.life > 0) { d.m.position.set(d.x, d.y, d.z); d.m.scale.setScalar(d.s * Math.min(1, d.life * 2)); } }
  preview(); frameCam(dtReal); renderer.render(scene, camera);
}
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
let last = performance.now();
function loop(now) { const dt = Math.min(0.05, (now - last) / 1000); last = now; update(dt); draw(dt); requestAnimationFrame(loop); }
G.fast = (sec) => { G.fasting = true; for (let i = 0; i < sec * 120; i++) update(STEP); G.fasting = false; draw(0.5); };
G.loose = (ang, pw) => playerLoose(ctrl(), ang, pw);

// ---------- online: the wire ----------
function onlineResult() {
  const iWon = ON.lastW === MY;
  if (GUEST) (iWon ? SFX.win : SFX.lose)();   // the host already heard roundOver's
  show(`<h2>${iWon ? 'YOU TAKE IT' : 'FRIEND TAKES IT'}</h2><p>YOU ${G.score[MY]} &mdash; ${G.score[OTHER]} FRIEND</p>`
    + `<button class="btn red" id="r">${GUEST ? 'ASK FOR THE NEXT DUEL' : 'NEXT DUEL'}</button><button class="btn" id="m">LEAVE</button>`,
  { '#r': () => { if (!GUEST) setupRound(); else { NET.send({ t: 'next' }); const b = $('r'); if (b) b.textContent = 'WAITING FOR HOST…'; } }, '#m': () => NET.leave() });
}
function onlineMenu() {
  if (G.state === 'result' || G.state === 'wait') return;
  show('<h2>ONLINE DUEL</h2><p>The duel carries on while this is open.</p><button class="btn red" id="b">BACK TO THE DUEL</button><button class="btn" id="l">LEAVE MATCH</button>',
    { '#b': hidePanel, '#l': () => NET.leave() });
}
if (NET) {
  NET.onmsg = (d) => {
    if (!d) return;
    // both ways: the other archer drawing, and loosing
    if (d.t === 'aim') { const ar = A[OTHER]; ar.ang = d.ang; ar.draw = d.draw; return; }
    if (d.t === 'shot') { const ar = A[OTHER]; ar.ang = d.ang; ar.draw = 0; fire(ar, d.ang, d.pw); return; }
    if (!GUEST) {
      if (d.t === 'hi' && G.state === 'wait') start2P();
      else if (d.t === 'next' && G.state === 'result') setupRound();
      return;
    }
    if (d.t === 'setup') { ON.got = true; ON.setup = d; G.mode = '2p'; setupRound(); }
    else if (d.t === 'turn') { G.turn = d.turn; wind = d.wind; turnWait = 0; hud(); banner(G.turn === MY ? 'YOUR SHOT' : 'FRIEND TO SHOOT'); }
    else if (d.t === 'hit') {
      A[0].hp = d.hp[0]; A[1].hp = d.hp[1]; hud();
      floatText((d.head ? 'HEADSHOT ' : '') + '-' + d.dmg, d.x, d.y + 0.4, true);
      const ar = A[d.who];
      if (d.down && ar.alive) {
        ar.hp = 0; ar.die(d.vx, d.vy, d.pts); slow = 0.22; slowT = 1.3; camFocus = ar; endT = 2.2; G.state = 'dying';
        banner(d.head ? 'PINNED!' : 'DOWN!'); hud();
      }
    } else if (d.t === 'over') { G.score = d.score.slice(); ON.lastW = d.w; G.state = 'result'; onlineResult(); }
  };
  // the guest says hello until the host answers with an arena
  if (GUEST) setInterval(() => { if (!ON.got) NET.send({ t: 'hi' }); }, 500);
}
if (NET) { G.mode = '2p'; G.score = [0, 0]; ON.quiet = true; setupRound(); ON.quiet = false; G.state = 'wait'; if (GUEST) NET.send({ t: 'hi' }); show('<h1>ARCHER<br>DUEL</h1><p>ONLINE &middot; ' + (GUEST ? 'joining the host&rsquo;s hill&hellip;' : 'waiting for your friend&rsquo;s game to load&hellip;') + '</p>', {}); }
else if (Q.has('title')) { G.mode = '1p'; setupRound(); menu(); } else startLadder();
requestAnimationFrame(loop);
