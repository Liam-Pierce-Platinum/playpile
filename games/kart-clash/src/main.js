// KART CLASH - glossy toy-plastic arena kart battle. three.js, no build step.
import * as THREE from '../vendor/three.module.js';
import * as AU from './audio.js';

const Q = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
const H = 40, KR = 1.25, MATCH = 120;

// ---------- save / progression ----------
const SAVE_KEY = 'kart_clash_v1';
const save = { xp: 0, level: 1, paint: 0, matches: 0, wins: 0, bestKills: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY) || '{}')); } catch (e) { /* private mode */ }
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };
const xpFor = (lv) => 100 + lv * 60;
const PAINTS = [
  { n: 'Cherry', c: 0xff3b3b, a: 0xffd23a, lv: 1 }, { n: 'Sky', c: 0x2f8cff, a: 0xffffff, lv: 2 },
  { n: 'Lime', c: 0x5ad13a, a: 0x2a2f3a, lv: 3 }, { n: 'Tangerine', c: 0xff8a1c, a: 0x3a7bff, lv: 4 },
  { n: 'Grape', c: 0x9a4dff, a: 0x7cf0d0, lv: 6 }, { n: 'Bubblegum', c: 0xff5fb8, a: 0xfff2a0, lv: 8 },
  { n: 'Gold Rush', c: 0xffc61a, a: 0xd83a3a, lv: 10 }, { n: 'Midnight', c: 0x283a6e, a: 0xff6bd0, lv: 13 },
];
if (!PAINTS[save.paint] || PAINTS[save.paint].lv > save.level) save.paint = 0;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.82;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 600);
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });

// studio-light environment -> the glossy specular highlights on every plastic part
(function env() {
  const es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.BoxGeometry(30, 20, 30), new THREE.MeshBasicMaterial({ color: 0x7d84a3, side: THREE.BackSide })));
  const panel = (w, h, c, x, y, z, rx, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.set(rx, ry, 0); es.add(m); };
  panel(14, 3, new THREE.Color(7, 7, 7), 0, 9.5, 0, Math.PI / 2, 0);
  panel(3, 14, new THREE.Color(5, 5, 5), 6, 9.5, 0, Math.PI / 2, 0);
  panel(6, 6, new THREE.Color(5, 4.2, 3.2), -14.5, 4, 0, 0, Math.PI / 2);
  panel(5, 8, new THREE.Color(2.4, 2.9, 4), 14.5, 5, -4, 0, -Math.PI / 2);
  panel(30, 30, new THREE.Color(1.1, 0.85, 0.7), 0, -9.5, 0, Math.PI / 2, 0);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(es, 0.03).texture; pm.dispose();
})();

// sky dome: soft playroom gradient
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  vertexShader: 'varying vec3 vp; void main(){ vp = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
  fragmentShader: 'varying vec3 vp; void main(){ float h = normalize(vp).y; vec3 c = mix(vec3(1.,.86,.92), vec3(.52,.78,1.), smoothstep(-.05,.55,h)); c = mix(c, vec3(1.,.95,.8), pow(max(0.,1.-abs(h)*3.),3.)*.5); gl_FragColor = vec4(c,1.); }',
})));
scene.fog = new THREE.Fog(0xf3d6e6, 170, 430);
scene.add(new THREE.HemisphereLight(0xffffff, 0xffc9b0, 0.4));
const sun = new THREE.DirectionalLight(0xfff1de, 2.6);
sun.position.set(28, 55, 18); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -50, right: 50, top: 50, bottom: -50, near: 10, far: 140 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
scene.add(sun);

// ---------- glossy injection-molded plastic ----------
// Physical clearcoat + a custom shader patch: tinted fresnel rim (light scattering through
// the plastic edge) and a faint wrap-light so shadow sides glow with their own colour.
const WHITE = new THREE.Color(1, 1, 1);
function plastic(color, o = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color, roughness: o.r ?? 0.3, metalness: 0, clearcoat: o.cc ?? 1, clearcoatRoughness: o.ccr ?? 0.05,
    envMapIntensity: o.env ?? 1, specularIntensity: 0.6, map: o.map || null, transparent: !!o.op, opacity: o.op ?? 1,
  });
  const rim = new THREE.Color(color).lerp(WHITE, 0.55);
  m.onBeforeCompile = (s) => {
    s.uniforms.rimC = { value: rim };
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 rimC;')
      .replace('#include <opaque_fragment>', `
        float kcF = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 2.6);
        outgoingLight += rimC * kcF * 0.32 + diffuseColor.rgb * 0.04;
        #include <opaque_fragment>`);
  };
  return m;
}

// rounded slab (plan-view rounded rect, bevelled edges) - the toy-brick primitive
function rr(w, l, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -l / 2; r = Math.min(r, w / 2, l / 2);
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r); s.lineTo(x + w, y + l - r);
  s.quadraticCurveTo(x + w, y + l, x + w - r, y + l); s.lineTo(x + r, y + l); s.quadraticCurveTo(x, y + l, x, y + l - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y); return s;
}
function slab(w, l, h, r = 0.2, bev = 0.12) {
  const g = new THREE.ExtrudeGeometry(rr(w - 2 * bev, l - 2 * bev, r), { depth: Math.max(0.01, h - 2 * bev), bevelEnabled: true, bevelThickness: bev, bevelSize: bev, bevelSegments: 4, curveSegments: 6 });
  g.rotateX(-Math.PI / 2); g.translate(0, bev, 0); return g;
}
const mesh = (g, m, x = 0, y = 0, z = 0, parent = scene) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.castShadow = o.receiveShadow = true; parent.add(o); return o; };

// ---------- arena ----------
const boxes = [], circles = [], studs = [];
const BRICK = [0xff4040, 0xffcf2e, 0x2f8cff, 0x45c85a, 0xff8a1c, 0xf6f4ee];
const brickMats = BRICK.map((c) => plastic(c));
function brick(x, z, w, d, h, ci, collide = true) {
  const m = mesh(slab(w, d, h, 0.18, 0.1), brickMats[ci % BRICK.length], x, 0, z);
  for (let i = 0; i < Math.round(w); i++) for (let j = 0; j < Math.round(d); j++) studs.push([x - w / 2 + 0.5 + i, h, z - d / 2 + 0.5 + j, BRICK[ci % BRICK.length]]);
  if (collide) boxes.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  return m;
}
// baseplate floor: per-stud colour map + procedural stud normal map
(function floor() {
  const cm = document.createElement('canvas'); cm.width = cm.height = 80; const cx = cm.getContext('2d');
  for (let y = 0; y < 80; y++) for (let x = 0; x < 80; x++) {
    const u = x - 39.5, v = y - 39.5, ch = Math.max(Math.abs(u), Math.abs(v));
    let c = '#5fcfa8';
    if (ch < 8) c = ((Math.floor((u + 40) / 2) + Math.floor((v + 40) / 2)) % 2) ? '#fff6ea' : '#ff6f8e';
    else if (ch > 23 && ch < 29) c = (ch > 25.4 && ch < 26.6 && (Math.floor((u + v + 80) / 3) % 2)) ? '#ffffff' : '#ffc93d';
    else if (Math.abs(Math.abs(u) - 34) < 4 && Math.abs(Math.abs(v) - 34) < 4) c = '#b08cff';
    cx.fillStyle = c; cx.fillRect(x, y, 1, 1);
  }
  const map = new THREE.CanvasTexture(cm); map.colorSpace = THREE.SRGBColorSpace; map.magFilter = THREE.NearestFilter; map.generateMipmaps = false; map.minFilter = THREE.LinearFilter;
  const N = 64, hgt = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const d = Math.hypot(x + 0.5 - 32, y + 0.5 - 32), e = Math.min(x, y, N - 1 - x, N - 1 - y);
    hgt[y * N + x] = (d < 16 ? 1 : d < 19 ? (19 - d) / 3 : 0) * (1 - Math.max(0, d - 13) * 0) + (e < 1 ? -0.25 : 0);
  }
  const nc = document.createElement('canvas'); nc.width = nc.height = N; const nx = nc.getContext('2d'), img = nx.createImageData(N, N);
  const at = (x, y) => hgt[((y + N) % N) * N + ((x + N) % N)];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    let a = -(at(x + 1, y) - at(x - 1, y)) * 2.2, b = (at(x, y + 1) - at(x, y - 1)) * 2.2, c = 1; const l = Math.hypot(a, b, c); a /= l; b /= l; c /= l;
    const i = (y * N + x) * 4; img.data[i] = (a * 0.5 + 0.5) * 255; img.data[i + 1] = (b * 0.5 + 0.5) * 255; img.data[i + 2] = (c * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  nx.putImageData(img, 0, 0);
  const nm = new THREE.CanvasTexture(nc); nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(80, 80); nm.anisotropy = 8;
  const fm = plastic(0xffffff, { r: 0.36, cc: 0.6, ccr: 0.12, map }); fm.normalMap = nm; fm.normalScale.set(1.2, 1.2);
  const f = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), fm); f.rotation.x = -Math.PI / 2; f.receiveShadow = true; scene.add(f);
  const base = mesh(slab(84, 84, 0.6, 0.6, 0.25), plastic(0x3fae8f), 0, -0.62, 0); base.castShadow = false;
  const rug = new THREE.Mesh(new THREE.CircleGeometry(400, 48), new THREE.MeshStandardMaterial({ color: 0xa8d0f0, roughness: 1 }));
  rug.rotation.x = -Math.PI / 2; rug.position.y = -0.63; rug.receiveShadow = true; scene.add(rug);
})();
// perimeter wall of bricks (bounds handle collision)
for (let i = -H; i < H; i += 4) {
  const c = ((i + H) / 4) | 0;
  brick(i + 2, -H - 1, 4, 2, 2.2, c, false); brick(i + 2, H + 1, 4, 2, 2.2, c + 2, false);
  brick(-H - 1, i + 2, 2, 4, 2.2, c + 1, false); brick(H + 1, i + 2, 2, 4, 2.2, c + 3, false);
}
for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
  brick(sx * 18, sz * 12, 8, 2, 2.4, sx > 0 ? 0 : 2); brick(sx * 12, sz * 18, 2, 8, 2.4, sz > 0 ? 3 : 1);
  const px = sx * 30, pz = sz * 30; circles.push({ x: px, z: pz, r: 2 });
  for (let k = 0; k < 3; k++) mesh(new THREE.CylinderGeometry(2 - k * 0.15, 2 - k * 0.1, 1.1, 28), brickMats[(k + (sx + 2) + sz) & 3], px, 0.55 + k * 1.1, pz);
}
brick(28, 0, 2, 10, 2.4, 4); brick(-28, 0, 2, 10, 2.4, 1); brick(0, 28, 10, 2, 2.4, 2); brick(0, -28, 10, 2, 2.4, 3);
circles.push({ x: 0, z: 0, r: 3.3 });
for (let k = 0; k < 5; k++) mesh(new THREE.CylinderGeometry(3.3 - k * 0.45, 3.3 - k * 0.4, 1.2, 36), brickMats[k], 0, 0.6 + k * 1.2, 0);
mesh(new THREE.SphereGeometry(1.1, 24, 16), brickMats[5], 0, 6.6, 0);
// giant toys outside the arena: we're tiny karts on a kid's playroom floor
[[-70, -40, 18, 10, 9, 0], [75, -55, 12, 24, 12, 2], [-60, 70, 22, 12, 7, 3], [90, 40, 10, 10, 20, 1], [10, -95, 30, 12, 10, 4], [-110, 0, 14, 14, 14, 5]].forEach(([x, z, w, d, h, c]) => {
  mesh(slab(w, d, h, 1, 0.6), brickMats[c], x, -0.6, z);
  for (let i = 0; i < w / 4; i++) for (let j = 0; j < d / 4; j++) mesh(new THREE.CylinderGeometry(1.3, 1.3, 1, 24), brickMats[c], x - w / 2 + 2 + i * 4, h - 0.1, z - d / 2 + 2 + j * 4);
});
mesh(new THREE.SphereGeometry(14, 48, 32), plastic(0xff5fb8), 70, 13.4, 70);
mesh(new THREE.TorusGeometry(10, 3.5, 24, 48), plastic(0xffcf2e), -80, 3, -85).rotation.x = Math.PI / 2;
// studs: one instanced draw
(function () {
  const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.3, 0.22, 16), plastic(0xffffff), studs.length);
  const m4 = new THREE.Matrix4(), col = new THREE.Color();
  studs.forEach(([x, y, z, c], i) => { m4.makeTranslation(x, y + 0.1, z); im.setMatrixAt(i, m4); im.setColorAt(i, col.set(c)); });
  im.castShadow = im.receiveShadow = true; scene.add(im);
})();

function blocked(x, z, pad = 0) {
  if (Math.abs(x) > H - pad || Math.abs(z) > H - pad) return true;
  for (const b of boxes) if (x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) return true;
  for (const c of circles) if ((x - c.x) ** 2 + (z - c.z) ** 2 < (c.r + pad) ** 2) return true;
  return false;
}
function collide(o, r) {
  let hit = false;
  for (const b of boxes) {
    const cx = clamp(o.x, b.x0, b.x1), cz = clamp(o.z, b.z0, b.z1); let dx = o.x - cx, dz = o.z - cz; const d2 = dx * dx + dz * dz;
    if (d2 < r * r) { const d = Math.sqrt(d2) || 1e-4; if (d2 === 0) { dx = 0; dz = o.z > (b.z0 + b.z1) / 2 ? 1 : -1; } hit = push(o, dx / d, dz / d, r - d) || hit; }
  }
  for (const c of circles) { const dx = o.x - c.x, dz = o.z - c.z, d = Math.hypot(dx, dz); if (d < c.r + r) hit = push(o, dx / d, dz / d, c.r + r - d) || hit; }
  if (o.x > H - r) hit = push(o, -1, 0, o.x - (H - r)) || hit; if (o.x < -H + r) hit = push(o, 1, 0, -H + r - o.x) || hit;
  if (o.z > H - r) hit = push(o, 0, -1, o.z - (H - r)) || hit; if (o.z < -H + r) hit = push(o, 0, 1, -H + r - o.z) || hit;
  return hit;
}
function push(o, nx, nz, pen) {
  o.x += nx * pen; o.z += nz * pen; const vn = o.vx * nx + o.vz * nz;
  if (vn < 0) { o.vx -= vn * nx * 1.4; o.vz -= vn * nz * 1.4; return vn < -6; } return false;
}

// ---------- karts ----------
const dark = plastic(0x23262e, { r: 0.5, ccr: 0.2 }), whiteM = plastic(0xf4f2ec), skin = plastic(0xffd6a0), visorM = plastic(0x152040, { r: 0.05 });
const TIRE = new THREE.CylinderGeometry(0.48, 0.48, 0.42, 22).rotateZ(Math.PI / 2), HUB = new THREE.CylinderGeometry(0.22, 0.22, 0.46, 12).rotateZ(Math.PI / 2);
function buildKart(color, accent) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body); scene.add(g);
  const bm = plastic(color), am = plastic(accent);
  mesh(slab(1.8, 2.8, 0.55, 0.38, 0.17), bm, 0, 0.32, 0, body);
  mesh(slab(1.25, 1.0, 0.36, 0.3, 0.12), bm, 0, 0.82, 0.78, body);
  const bp = mesh(new THREE.CapsuleGeometry(0.22, 1.45, 4, 12), am, 0, 0.45, 1.45, body); bp.rotation.z = Math.PI / 2;
  mesh(slab(2.0, 0.55, 0.14, 0.2, 0.05), am, 0, 1.45, -1.3, body);
  mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6), dark, 0.55, 1.15, -1.3, body); mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.6), dark, -0.55, 1.15, -1.3, body);
  mesh(slab(0.95, 0.8, 0.55, 0.25, 0.1), dark, 0, 0.75, -0.4, body);
  mesh(new THREE.CylinderGeometry(0.3, 0.38, 0.62, 16), am, 0, 1.25, -0.3, body);
  mesh(new THREE.SphereGeometry(0.34, 20, 14), skin, 0, 1.78, -0.28, body);
  mesh(new THREE.SphereGeometry(0.42, 22, 14, 0, Math.PI * 2, 0, Math.PI * 0.58), bm, 0, 1.8, -0.3, body);
  mesh(new THREE.SphereGeometry(0.2, 16, 10), visorM, 0, 1.8, 0.02, body).scale.set(1.5, 0.62, 0.7);
  const sw = mesh(new THREE.TorusGeometry(0.22, 0.05, 8, 20), dark, 0, 1.2, 0.22, body); sw.rotation.x = -0.9;
  for (const s of [-0.35, 0.35]) mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.5, 12).rotateX(Math.PI / 2), whiteM, s, 0.62, -1.5, body);
  const wheels = [], fronts = [];
  for (const [x, z] of [[0.98, 0.95], [-0.98, 0.95], [0.98, -0.95], [-0.98, -0.95]]) {
    const piv = new THREE.Group(); piv.position.set(x, 0.48, z); g.add(piv);
    const spin = new THREE.Group(); piv.add(spin); mesh(TIRE, dark, 0, 0, 0, spin); mesh(HUB, am, 0, 0, 0, spin);
    wheels.push(spin); if (z > 0) fronts.push(piv);
  }
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.5, 1.75, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.55, depthWrite: false }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; g.add(ring);
  return { g, body, bm, am, wheels, fronts, ring };
}
const NAMES = ['Bolt', 'Pip', 'Nugget', 'Ziggy', 'Moxie', 'Tango', 'Sprocket', 'Wobble', 'Fizz'];
const BOTC = [[0x2f8cff, 0xffffff], [0x45c85a, 0xffcf2e], [0xff8a1c, 0x2a2f3a], [0x9a4dff, 0x7cf0d0], [0xff5fb8, 0xffffff], [0xffc61a, 0xd83a3a], [0x22c7d6, 0xff4040]];
const SPAWNS = [[34, 34], [-34, 34], [34, -34], [-34, -34], [20, 0], [-20, 0], [0, 20], [0, -20]];
const karts = [];
function makeKart(name, c, a, isPlayer) {
  const k = { name, color: c, isPlayer, m: buildKart(c, a), x: 0, z: 0, vx: 0, vz: 0, a: 0, v: 0, hp: 100, alive: true, rt: 0, inv: 0, weapon: null, ammo: 0, cool: 0,
    kills: 0, deaths: 0, streak: 0, lastBy: null, flash: 0, steerVis: 0, lean: 0, ai: { stuck: 0, rev: 0, side: Math.random() < 0.5 ? 1 : -1, mineT: 0 }, skill: 0.5, label: null };
  if (!isPlayer) {
    const el = document.createElement('div'); el.className = 'tag'; el.innerHTML = `<b>${name}</b><i><s></s></i>`; $('tags').appendChild(el);
    el.style.setProperty('--c', '#' + c.toString(16).padStart(6, '0')); k.label = el;
  }
  karts.push(k); return k;
}
const P = makeKart('YOU', PAINTS[save.paint].c, PAINTS[save.paint].a, true);
const order = [...BOTC].sort(() => Math.random() - 0.5), nm = [...NAMES].sort(() => Math.random() - 0.5);
for (let i = 0; i < 5; i++) makeKart(nm[i], order[i][0], order[i][1], false);
function paintPlayer() { const p = PAINTS[save.paint]; P.color = p.c; P.m.bm.color.set(p.c); P.m.am.color.set(p.a); P.m.ring.material.color.set(p.c); }

// ---------- items / projectiles / fx ----------
const qc = document.createElement('canvas'); qc.width = qc.height = 128; { const c = qc.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 128, 128); c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 10; c.strokeRect(8, 8, 112, 112); c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 6; c.font = '900 96px Arial Black, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.strokeText('?', 64, 70); c.fillText('?', 64, 70); }
const qTex = new THREE.CanvasTexture(qc); qTex.colorSpace = THREE.SRGBColorSpace;
const ITEMS = [[0, 9], [0, -9], [9, 0], [-9, 0], [22, 22], [-22, 22], [22, -22], [-22, -22], [35, 0], [-35, 0], [0, 35], [0, -35]].map(([x, z], i) => {
  const mat = plastic(0xffffff, { map: qTex, r: 0.2 }); const o = mesh(new THREE.BoxGeometry(1.5, 1.5, 1.5), mat, x, 1.4, z); o.castShadow = true;
  return { x, z, on: true, t: 0, o, mat, ph: i };
});
const WEAPONS = ['rocket', 'rocket', 'rocket', 'pellet', 'pellet', 'pellet', 'mine', 'mine', 'shock', 'shock'];
const WNAME = { rocket: 'ROCKET', pellet: 'GUMBALL GUN', mine: 'POP MINE', shock: 'BOING WAVE' };
const WAMMO = { rocket: 1, pellet: 12, mine: 2, shock: 1 };
const projs = [], rocketG = new THREE.Group();
const ROCK_B = new THREE.CapsuleGeometry(0.22, 0.7, 4, 10).rotateX(Math.PI / 2), ROCK_N = new THREE.SphereGeometry(0.24, 12, 8);
const redM = plastic(0xff3030), yelM = plastic(0xffe14a), mineM = plastic(0xff3b6b);
const GUM = new THREE.SphereGeometry(0.22, 12, 8), gumMats = [0xff4fa0, 0x48d0ff, 0xffe14a, 0x6ef06e].map((c) => plastic(c, { r: 0.15 }));
const MINE_G = new THREE.SphereGeometry(0.55, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);

// confetti chips (instanced)
const CH = 600, chipIM = new THREE.InstancedMesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), plastic(0xffffff), CH);
chipIM.castShadow = true; chipIM.frustumCulled = false; scene.add(chipIM);
const chips = Array.from({ length: CH }, () => ({ l: 0, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, r: 0, s: 1 }));
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
for (let i = 0; i < CH; i++) { chipIM.setMatrixAt(i, _m.makeScale(0, 0, 0)); chipIM.setColorAt(i, _c.set(0xffffff)); }
let chipI = 0;
function burst(x, y, z, n, colors, sp = 9) {
  for (let i = 0; i < n; i++) {
    const ci = chipI, c = chips[ci]; chipI = (chipI + 1) % CH;
    Object.assign(c, { l: rnd(0.8, 1.6), x, y, z, vx: rnd(-1, 1) * sp, vy: rnd(4, 12), vz: rnd(-1, 1) * sp, r: rnd(0, 6), s: rnd(0.6, 1.4) });
    chipIM.setColorAt(ci, _c.set(colors[i % colors.length]));
  }
  chipIM.instanceColor.needsUpdate = true;
}
const pops = [];
function pop(x, z, r, color, ring = false) {
  const m = ring ? new THREE.Mesh(new THREE.TorusGeometry(1, 0.25, 8, 40), new THREE.MeshBasicMaterial({ color, transparent: true }))
    : new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), plastic(color, { op: 0.85 }));
  if (ring) m.rotation.x = Math.PI / 2; m.position.set(x, ring ? 0.6 : 1, z); scene.add(m); pops.push({ m, t: 0, r, ring });
}

// ---------- HUD helpers ----------
let shake = 0, hitstop = 0;
const feed = $('feed');
function feedMsg(html) { const d = document.createElement('div'); d.innerHTML = html; feed.prepend(d); setTimeout(() => d.remove(), 4000); while (feed.children.length > 4) feed.lastChild.remove(); }
function banner(t, cls = '') { const b = $('banner'); b.textContent = t; b.className = 'show ' + cls; clearTimeout(banner.h); banner.h = setTimeout(() => (b.className = ''), 1100); }
const floats = [];
function floatTxt(x, y, z, t, col) { const d = document.createElement('div'); d.className = 'float'; d.textContent = t; d.style.color = col; $('tags').appendChild(d); floats.push({ d, p: new THREE.Vector3(x, y, z), t: 0 }); }
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

// ---------- combat ----------
function damage(k, dmg, by, nx = 0, nz = 0, kb = 0) {
  if (!k.alive || k.inv > 0 || G.state !== 'play') return;
  k.hp -= dmg; k.flash = 0.18; k.lastBy = by; k.vx += nx * kb; k.vz += nz * kb;
  if (k.isPlayer) { shake = Math.max(shake, 0.5); AU.sfx.hit(); }
  if (by === P && k !== P) { floatTxt(k.x, 2.6, k.z, '-' + dmg, '#ffe14a'); if (k.hp > 0) AU.sfx.hit(); }
  if (k.hp <= 0) wreck(k, by);
}
function wreck(k, by) {
  k.alive = false; k.hp = 0; k.deaths++; k.rt = 2.6; k.streak = 0; k.weapon = null; k.m.g.visible = false;
  burst(k.x, 1, k.z, 40, [k.color, 0x23262e, 0xffffff, 0xffe14a], 11); pop(k.x, k.z, 4.5, 0xffb020);
  const dP = Math.hypot(P.x - k.x, P.z - k.z); shake = Math.max(shake, clamp(1.4 - dP / 30, 0, 1.2)); AU.sfx.boom(clamp(1.2 - dP / 60, 0.25, 1));
  const killer = by && by !== k ? by : null;
  if (killer) {
    killer.kills++; killer.streak++;
    if (killer === P) {
      hitstop = 0.09; AU.sfx.ko(); floatTxt(k.x, 3.4, k.z, '+1 KO', '#ffffff');
      banner(killer.streak >= 4 ? 'RAMPAGE!' : killer.streak === 3 ? 'TRIPLE KO!' : killer.streak === 2 ? 'DOUBLE KO!' : 'KO!', 'ko');
    }
  }
  feedMsg(killer ? `<b style="color:${hex(killer.color)}">${killer.name}</b> bonked <b style="color:${hex(k.color)}">${k.name}</b>` : `<b style="color:${hex(k.color)}">${k.name}</b> wiped out`);
  if (k.isPlayer) { AU.sfx.wreck(); banner(killer ? 'BONKED BY ' + killer.name.toUpperCase() : 'WIPED OUT', 'bad'); }
}
function explode(x, z, r, inner, outer, owner, color = 0xff9a1c) {
  pop(x, z, r, color); burst(x, 0.8, z, 18, [color, 0xffe14a, 0xffffff], 8);
  const dP = Math.hypot(P.x - x, P.z - z); shake = Math.max(shake, clamp(1 - dP / 35, 0, 0.9)); AU.sfx.boom(clamp(1 - dP / 70, 0.2, 1));
  for (const k of karts) {
    if (k === owner || !k.alive) continue; const dx = k.x - x, dz = k.z - z, d = Math.hypot(dx, dz);
    if (d < r) damage(k, d < r * 0.45 ? inner : outer, owner, dx / (d || 1), dz / (d || 1), 14);
  }
}
function fire(k) {
  if (!k.weapon || k.cool > 0 || !k.alive || G.state !== 'play') return;
  const fx = Math.sin(k.a), fz = Math.cos(k.a), w = k.weapon;
  if (w === 'rocket') {
    const o = new THREE.Group(); mesh(ROCK_B, redM, 0, 0, 0, o); mesh(ROCK_N, whiteM, 0, 0, 0.5, o); scene.add(o);
    projs.push({ w, x: k.x + fx * 2, z: k.z + fz * 2, vx: fx * 40, vz: fz * 40, owner: k, life: 2.5, o }); AU.sfx.rocket(); k.cool = 0.4; k.v -= 3;
  } else if (w === 'pellet') {
    const sp = rnd(-0.04, 0.04), o = mesh(GUM, gumMats[(Math.random() * 4) | 0], 0, 0, 0);
    projs.push({ w, x: k.x + fx * 2, z: k.z + fz * 2, vx: Math.sin(k.a + sp) * 58 + k.vx * 0.5, vz: Math.cos(k.a + sp) * 58 + k.vz * 0.5, owner: k, life: 0.8, o }); AU.sfx.pellet(); k.cool = 0.11;
  } else if (w === 'mine') {
    const o = new THREE.Group(); mesh(MINE_G, mineM, 0, 0, 0, o); mesh(new THREE.CylinderGeometry(0.75, 0.75, 0.12, 20), dark, 0, 0, 0, o); scene.add(o);
    projs.push({ w, x: k.x - fx * 2.2, z: k.z - fz * 2.2, vx: 0, vz: 0, owner: k, life: 25, arm: 0.6, o }); AU.sfx.mine(); k.cool = 0.5;
  } else if (w === 'shock') {
    pop(k.x, k.z, 9, k.color, true); AU.sfx.shock(); k.cool = 0.5;
    for (const o of karts) { if (o === k || !o.alive) continue; const dx = o.x - k.x, dz = o.z - k.z, d = Math.hypot(dx, dz); if (d < 8.5) damage(o, d < 4.5 ? 100 : 60, k, dx / d, dz / d, 26); }
    if (k.isPlayer) shake = Math.max(shake, 0.5);
  }
  if (--k.ammo <= 0) k.weapon = null;
}
function stepProjs(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i]; p.life -= dt; let boom = p.life <= 0;
    if (p.w === 'rocket') { // gentle homing toward the closest kart in a forward cone
      let best = null, bd = 30; const a = Math.atan2(p.vx, p.vz);
      for (const k of karts) if (k !== p.owner && k.alive) { const d = Math.hypot(k.x - p.x, k.z - p.z); if (d < bd && Math.abs(angDiff(a, Math.atan2(k.x - p.x, k.z - p.z))) < 0.6) { bd = d; best = k; } }
      if (best) { const na = a + clamp(angDiff(a, Math.atan2(best.x - p.x, best.z - p.z)), -2.2 * dt, 2.2 * dt); p.vx = Math.sin(na) * 40; p.vz = Math.cos(na) * 40; }
      if (Math.random() < 0.6) burst(p.x - p.vx * 0.02, 1, p.z - p.vz * 0.02, 1, [0xffffff, 0xffe9a0], 1);
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    if (p.w !== 'mine' && blocked(p.x, p.z)) boom = true;
    let hitK = null;
    if (p.w === 'mine') { p.arm -= dt; if (p.arm <= 0) for (const k of karts) if (k.alive && (k !== p.owner || p.arm < -2) && Math.hypot(k.x - p.x, k.z - p.z) < 2) hitK = k; }
    else for (const k of karts) if (k !== p.owner && k.alive && Math.hypot(k.x - p.x, k.z - p.z) < KR + 0.35) { hitK = k; break; }
    if (hitK && p.w === 'pellet') { damage(hitK, 14, p.owner, p.vx / 58, p.vz / 58, 3); burst(p.x, 1, p.z, 3, [0xff4fa0, 0xffffff], 3); boom = true; }
    else if (hitK || (boom && p.w !== 'pellet')) { if (p.w === 'mine') explode(p.x, p.z, 4, 100, 70, p.owner, 0xff3b6b); else explode(p.x, p.z, 4, 100, 60, p.owner); boom = true; }
    if (p.w === 'pellet' && boom && !hitK) burst(p.x, 1, p.z, 2, [0xffffff], 2);
    if (boom) { scene.remove(p.o); projs.splice(i, 1); continue; }
    p.o.position.set(p.x, p.w === 'mine' ? 0.1 : 1, p.z); if (p.w === 'rocket') p.o.rotation.y = Math.atan2(p.vx, p.vz);
    if (p.w === 'mine') p.o.children[0].material = (p.arm <= 0 && ((G.t * 4) | 0) % 2) ? yelM : mineM;
  }
}

// ---------- AI ----------
function think(k, dt) {
  const ai = k.ai; let tx, tz, target = null;
  if (!k.weapon) { let bd = 1e9; for (const b of ITEMS) if (b.on) { const d = Math.hypot(b.x - k.x, b.z - k.z); if (d < bd) { bd = d; tx = b.x; tz = b.z; } } }
  let td = 1e9;
  for (const o of karts) if (o !== k && o.alive) { let d = Math.hypot(o.x - k.x, o.z - k.z); if (o.isPlayer && !k.isPlayer) d *= 0.8; if (d < td) { td = d; target = o; } }
  if ((k.weapon || tx === undefined) && target) { const lead = k.weapon === 'pellet' ? 0.25 : 0.15; tx = target.x + target.vx * lead; tz = target.z + target.vz * lead; }
  if (tx === undefined) { tx = 0; tz = 18; }
  if (k.weapon === 'mine' && target && td < 10) { tx = k.x * 2 - target.x; tz = k.z * 2 - target.z; } // run, mine drops behind
  let diff = angDiff(k.a, Math.atan2(tx - k.x, tz - k.z));
  const look = 3.5 + Math.abs(k.v) * 0.22, a = k.a;
  if (blocked(k.x + Math.sin(a) * look, k.z + Math.cos(a) * look, 1.2)) {
    const l = blocked(k.x + Math.sin(a + 0.8) * look, k.z + Math.cos(a + 0.8) * look, 1.2), r = blocked(k.x + Math.sin(a - 0.8) * look, k.z + Math.cos(a - 0.8) * look, 1.2);
    diff = (l && !r) ? -1.5 : (!l && r) ? 1.5 : ai.side * 1.5;
  }
  let steer = clamp(diff * 2.4, -1, 1), thr = Math.abs(diff) > 1.7 ? 0.35 : 1;
  if (Math.abs(k.v) < 2.5 && ai.rev <= 0) { ai.stuck += dt; if (ai.stuck > 0.7) { ai.rev = 0.8; ai.stuck = 0; ai.side = -ai.side; } } else ai.stuck = 0;
  if (ai.rev > 0) { ai.rev -= dt; thr = -1; steer = ai.side; }
  let shoot = false;
  if (k.weapon && target) {
    const err = Math.abs(angDiff(k.a, Math.atan2(target.x - k.x, target.z - k.z))), tol = 0.32 - k.skill * 0.16;
    if (k.weapon === 'rocket') shoot = err < tol + 0.1 && td < 38 && clear(k, target);
    else if (k.weapon === 'pellet') shoot = err < tol && td < 26;
    else if (k.weapon === 'shock') shoot = td < 6.5;
    else if (k.weapon === 'mine') { ai.mineT += dt; shoot = (err > 2.3 && td < 14) || ai.mineT > 7; }
    shoot = shoot && Math.random() < dt * (3 + k.skill * 10);
  }
  if (!k.weapon) ai.mineT = 0;
  return { thr, steer, shoot };
}
function clear(a, b) { for (let i = 1; i < 8; i++) { const t = i / 8; if (blocked(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; } return true; }

// ---------- input ----------
const keys = {}; const touch = { thr: 0, steer: 0, fire: false };
addEventListener('keydown', (e) => {
  AU.unlock(); keys[e.code] = true;
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (G.state === 'result' && (e.code === 'Enter' || e.code === 'Space') && G.t > 1.2) newMatch();
  else if (G.state === 'menu' && e.code === 'Enter') newMatch();
  if (e.code === 'Escape' && (G.state === 'play' || G.state === 'count')) toMenu();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('pointerdown', () => AU.unlock());
(function touchUI() {
  const st = $('stick'), knob = $('knob'), fb = $('firebtn'); let id = null, ox = 0, oy = 0;
  const show = () => document.body.classList.add('touch');
  if (matchMedia('(pointer:coarse)').matches) show();
  addEventListener('touchstart', show, { once: true, passive: true });
  st.addEventListener('pointerdown', (e) => { id = e.pointerId; const r = st.getBoundingClientRect(); ox = r.left + r.width / 2; oy = r.top + r.height / 2; st.setPointerCapture(id); mv(e); });
  const mv = (e) => { if (e.pointerId !== id) return; let dx = (e.clientX - ox) / 55, dy = (e.clientY - oy) / 55; const l = Math.hypot(dx, dy); if (l > 1) { dx /= l; dy /= l; } touch.steer = -dx; touch.thr = clamp(-dy * 1.6 + 0.35, -1, 1); knob.style.transform = `translate(${dx * 40}px,${dy * 40}px)`; };
  st.addEventListener('pointermove', mv);
  const up = (e) => { if (e.pointerId !== id) return; id = null; touch.steer = 0; touch.thr = 0; knob.style.transform = ''; };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up);
  fb.addEventListener('pointerdown', (e) => { e.preventDefault(); touch.fire = true; }); fb.addEventListener('pointerup', () => (touch.fire = false)); fb.addEventListener('pointercancel', () => (touch.fire = false));
})();

// ---------- game state ----------
const G = window.__G = { state: 'menu', t: 0, time: MATCH, auto: false, karts, P, save, ITEMS, projs, PAINTS };
function spawn(k, i) {
  let best = SPAWNS[0], bs = -1;
  const cand = i === undefined ? SPAWNS : [SPAWNS[i % SPAWNS.length]];
  for (const s of cand) { let m = 1e9; for (const o of karts) if (o !== k && o.alive) m = Math.min(m, Math.hypot(o.x - s[0], o.z - s[1])); if (m > bs) { bs = m; best = s; } }
  Object.assign(k, { x: best[0], z: best[1], vx: 0, vz: 0, v: 0, a: Math.atan2(-best[0], -best[1]), hp: 100, alive: true, inv: i === undefined ? 2 : 0, weapon: null, ammo: 0, cool: 0, flash: 0 });
  k.m.g.visible = true;
}
function newMatch() {
  AU.sfx.click(); paintPlayer();
  for (const p of projs) scene.remove(p.o); projs.length = 0;
  const sk = clamp(0.3 + save.level * 0.05, 0.3, 0.95), idx = [0, 1, 2, 3, 4, 5, 6, 7].sort(() => Math.random() - 0.5);
  karts.forEach((k, i) => { k.kills = k.deaths = k.streak = 0; k.skill = clamp(sk + rnd(-0.1, 0.1), 0.2, 1); k.alive = false; });
  karts.forEach((k, i) => spawn(k, idx[i]));
  for (const b of ITEMS) { b.on = true; b.o.visible = true; }
  G.state = 'count'; G.t = 0; G.time = MATCH; G.lastBeep = -1;
  $('menu').classList.add('hide'); $('result').classList.add('hide'); $('hud').classList.remove('hide');
}
function toMenu() { G.state = 'menu'; G.t = 0; $('menu').classList.remove('hide'); $('result').classList.add('hide'); $('hud').classList.add('hide'); buildMenu(); }
function endMatch() {
  G.state = 'result'; G.t = 0; AU.engine(0, false);
  const rank = [...karts].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths), place = rank.indexOf(P) + 1;
  const gain = P.kills * 25 + (7 - place) * 15 + 20, oldLv = save.level;
  save.xp += gain; save.matches++; if (place === 1) save.wins++; save.bestKills = Math.max(save.bestKills, P.kills);
  while (save.xp >= xpFor(save.level)) { save.xp -= xpFor(save.level); save.level++; }
  persist();
  const unlocked = PAINTS.filter((p) => p.lv > oldLv && p.lv <= save.level);
  if (save.level > oldLv) setTimeout(() => AU.sfx.level(), 500); else if (place === 1) AU.sfx.ko();
  $('rtitle').textContent = place === 1 ? 'CHAMPION!' : place <= 3 ? `PODIUM - #${place}` : `#${place} - KEEP BONKING`;
  $('rlist').innerHTML = rank.map((k, i) => `<div class="row${k === P ? ' me' : ''}"><span>${i + 1}</span><i style="background:${hex(k.color)}"></i><b>${k.name}</b><em>${k.kills} KO</em><small>${k.deaths} out</small></div>`).join('');
  $('rxp').innerHTML = `+${gain} XP &middot; LEVEL ${save.level}${save.level > oldLv ? ' <b>LEVEL UP!</b>' : ''}<div class="bar"><s style="width:${(save.xp / xpFor(save.level) * 100).toFixed(0)}%"></s></div>` +
    (unlocked.length ? `<div class="unl">New paint: ${unlocked.map((p) => `<i style="background:${hex(p.c)}"></i>${p.n}`).join(' ')}</div>` : '');
  $('result').classList.remove('hide'); $('hud').classList.add('hide');
  G.result = { place, kills: P.kills, gain, level: save.level };
}
function buildMenu() {
  $('mlv').innerHTML = `LEVEL ${save.level} &middot; ${save.wins} wins / ${save.matches} matches &middot; best ${save.bestKills} KOs<div class="bar"><s style="width:${(save.xp / xpFor(save.level) * 100).toFixed(0)}%"></s></div>`;
  $('paints').innerHTML = PAINTS.map((p, i) => `<button class="sw${i === save.paint ? ' on' : ''}${p.lv > save.level ? ' lock' : ''}" data-i="${i}" style="--c:${hex(p.c)};--a:${hex(p.a)}" title="${p.n}">${p.lv > save.level ? 'LV' + p.lv : ''}</button>`).join('');
  $('paints').querySelectorAll('.sw').forEach((b) => b.onclick = () => { const i = +b.dataset.i; if (PAINTS[i].lv > save.level) return; save.paint = i; persist(); paintPlayer(); AU.sfx.click(); buildMenu(); });
}
$('play').onclick = () => { AU.unlock(); newMatch(); };
$('again').onclick = () => { AU.unlock(); newMatch(); };
$('garage').onclick = () => { AU.unlock(); toMenu(); };

// ---------- simulation ----------
function stepKart(k, dt, ctl) {
  if (!k.alive) { k.rt -= dt; if (k.rt <= 0 && G.state !== 'result') spawn(k); return; }
  k.inv = Math.max(0, k.inv - dt); k.cool -= dt; k.flash -= dt;
  const frozen = G.state === 'count';
  let thr = frozen ? 0 : ctl.thr, steer = frozen ? 0 : ctl.steer;
  if (thr < 0 && k.v > 1) thr *= 1.8;
  k.v += thr * 30 * dt; k.v -= k.v * 1.25 * dt; k.v = clamp(k.v, -9, 24);
  k.a += steer * 2.7 * clamp(k.v / 6, -1, 1) * dt;
  const fx = Math.sin(k.a), fz = Math.cos(k.a), grip = Math.min(1, 6.5 * dt);
  k.vx += (fx * k.v - k.vx) * grip; k.vz += (fz * k.v - k.vz) * grip;
  k.x += k.vx * dt; k.z += k.vz * dt;
  if (collide(k, KR)) { k.v *= 0.6; if (k.isPlayer) { shake = Math.max(shake, 0.25); AU.sfx.bump(); } burst(k.x + fx * 1.2, 0.6, k.z + fz * 1.2, 3, [0xffffff], 3); }
  k.v = k.vx * fx + k.vz * fz;
  if (ctl.shoot) fire(k);
  // items
  if (!k.weapon && G.state === 'play') for (const b of ITEMS) if (b.on && Math.hypot(b.x - k.x, b.z - k.z) < 1.9) {
    b.on = false; b.t = 5; b.o.visible = false; k.weapon = WEAPONS[(Math.random() * WEAPONS.length) | 0]; k.ammo = WAMMO[k.weapon]; k.cool = 0.25;
    burst(b.x, 1.4, b.z, 14, [0xff4040, 0xffcf2e, 0x2f8cff, 0x45c85a], 6); if (k.isPlayer) { AU.sfx.pickup(); banner(WNAME[k.weapon], 'item'); }
  }
  // visuals
  k.steerVis += (steer - k.steerVis) * Math.min(1, 10 * dt); k.lean += ((thr * 0.06) - k.lean) * Math.min(1, 6 * dt);
  const g = k.m.g; g.position.set(k.x, Math.abs(Math.sin(G.t * 18 + k.x)) * 0.03 * Math.min(1, Math.abs(k.v) / 10), k.z); g.rotation.y = k.a;
  k.m.body.rotation.z = -k.steerVis * 0.08 * clamp(k.v / 15, -1, 1); k.m.body.rotation.x = -k.lean;
  for (const w of k.m.wheels) w.rotation.x += k.v * dt / 0.48; for (const f of k.m.fronts) f.rotation.y = k.steerVis * 0.45;
  const fl = Math.max(0, k.flash) / 0.18; k.m.bm.emissive.setRGB(fl, fl, fl);
  g.visible = k.inv > 0 ? ((G.t * 14) | 0) % 2 === 0 : true;
}
function kartBumps() {
  for (let i = 0; i < karts.length; i++) for (let j = i + 1; j < karts.length; j++) {
    const a = karts[i], b = karts[j]; if (!a.alive || !b.alive) continue;
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
    if (d < KR * 2 && d > 0) {
      const nx = dx / d, nz = dz / d, pen = (KR * 2 - d) / 2; a.x -= nx * pen; a.z -= nz * pen; b.x += nx * pen; b.z += nz * pen;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) { a.vx += rv * nx * 0.9; a.vz += rv * nz * 0.9; b.vx -= rv * nx * 0.9; b.vz -= rv * nz * 0.9; if (rv < -8 && (a === P || b === P)) { AU.sfx.bump(); shake = Math.max(shake, 0.3); } }
    }
  }
}
function step(dt) {
  if (hitstop > 0) { hitstop -= dt; dt *= 0.12; }
  G.t += dt;
  if (G.state === 'count') {
    const n = 3 - Math.floor(G.t / 0.8);
    if (n !== G.lastBeep && n > 0) { G.lastBeep = n; banner(String(n), 'count'); AU.sfx.beep(false); }
    if (G.t >= 2.4) { G.state = 'play'; G.t = 0; banner('GO!', 'count'); AU.sfx.beep(true); }
  } else if (G.state === 'play') { G.time -= dt; if (G.time <= 0) { G.time = 0; endMatch(); } }
  const pc = (G.auto || G.state === 'menu') ? think(P, dt) : {
    thr: (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) || touch.thr,
    steer: (keys.KeyA || keys.ArrowLeft ? 1 : 0) - (keys.KeyD || keys.ArrowRight ? 1 : 0) || touch.steer,
    shoot: keys.Space || keys.KeyJ || keys.Enter || touch.fire,
  };
  for (const k of karts) stepKart(k, dt, k.isPlayer ? pc : think(k, dt));
  kartBumps(); stepProjs(dt);
  for (const b of ITEMS) {
    if (!b.on) { b.t -= dt; if (b.t <= 0) { b.on = true; b.o.visible = true; } }
    b.o.rotation.set(0.5, G.t * 1.6 + b.ph, 0.4); b.o.position.y = 1.5 + Math.sin(G.t * 3 + b.ph) * 0.25; b.mat.color.setHSL((G.t * 0.15 + b.ph * 0.08) % 1, 0.85, 0.6);
  }
  for (let i = 0; i < CH; i++) {
    const c = chips[i]; if (c.l <= 0) continue; c.l -= dt;
    c.vy -= 30 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; c.r += dt * 8;
    if (c.y < 0.07) { c.y = 0.07; c.vy *= -0.35; c.vx *= 0.6; c.vz *= 0.6; }
    const s = c.l <= 0 ? 0 : c.s * Math.min(1, c.l * 3);
    _q.setFromEuler(_e.set(c.r, c.r * 0.7, 0)); chipIM.setMatrixAt(i, _m.compose(_v.set(c.x, c.y, c.z), _q, _s.set(s, s, s)));
  }
  chipIM.instanceMatrix.needsUpdate = true;
  for (let i = pops.length - 1; i >= 0; i--) {
    const p = pops[i]; p.t += dt; const k = p.t / (p.ring ? 0.4 : 0.35);
    if (k >= 1) { scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose(); pops.splice(i, 1); continue; }
    const s = p.r * (p.ring ? k : 0.3 + Math.sqrt(k) * 0.7); p.m.scale.set(s, s, p.ring ? 1 : s); p.m.material.opacity = (1 - k) * 0.85;
  }
  if (G.state === 'play' || G.state === 'count') AU.engine(P.alive ? P.v : 0, true); else AU.engine(0, false);
  AU.music(true);
}

// ---------- camera + HUD ----------
const camPos = new THREE.Vector3(0, 30, -50), camLook = new THREE.Vector3();
let lbT = 0;
function render(dt) {
  if (G.state === 'menu') {
    const a = performance.now() * 0.00008; camPos.set(Math.sin(a) * 58, 30, Math.cos(a) * 58); camLook.set(0, 0, 0);
    camera.position.copy(camPos); camera.lookAt(camLook); camera.fov = 50;
  } else {
    const fx = Math.sin(P.a), fz = Math.cos(P.a), sp = Math.abs(P.v);
    const want = _v.set(P.x - fx * (9 + sp * 0.08), 5.6, P.z - fz * (9 + sp * 0.08));
    camPos.lerp(want, 1 - Math.exp(-6 * dt)); camLook.lerp(_s.set(P.x + fx * 5, 1.2, P.z + fz * 5), 1 - Math.exp(-9 * dt));
    camera.position.copy(camPos); camera.lookAt(camLook);
    camera.fov = 62 + sp * 0.35;
    if (shake > 0) { camera.position.x += rnd(-1, 1) * shake * 0.6; camera.position.y += rnd(-1, 1) * shake * 0.4; camera.position.z += rnd(-1, 1) * shake * 0.6; }
  }
  shake = Math.max(0, shake - dt * 2.5);
  camera.updateProjectionMatrix();
  renderer.render(scene, camera);
  // HUD
  if (G.state === 'play' || G.state === 'count') {
    const t = Math.ceil(G.time); $('timer').textContent = `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`; $('timer').classList.toggle('low', G.time < 10);
    $('ko').textContent = P.kills + ' KO';
    $('weapon').className = P.weapon ? 'w-' + P.weapon : 'empty';
    $('weapon').innerHTML = P.weapon ? `<b>${WNAME[P.weapon]}</b><span>${P.ammo > 1 ? 'x' + P.ammo : ''}</span>` : '<b>GRAB A ? BOX</b>';
    $('hp').style.width = Math.max(0, P.hp) + '%';
    if ((lbT -= dt) <= 0) {
      lbT = 0.25; const rank = [...karts].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
      $('board').innerHTML = rank.map((k, i) => `<div class="${k === P ? 'me' : ''}"><span>${i + 1}</span><i style="background:${hex(k.color)}"></i>${k.name}<b>${k.kills}</b></div>`).join('');
    }
    if (!P.alive) $('respawn').textContent = 'Respawning in ' + Math.max(0, P.rt).toFixed(1); $('respawn').classList.toggle('hide', P.alive);
  }
  const W = innerWidth / 2, Hh = innerHeight / 2;
  for (const k of karts) {
    if (!k.label) continue; const show = k.alive && G.state !== 'menu' && G.state !== 'result';
    if (show) { _v.set(k.x, 2.9, k.z).project(camera); const vis = _v.z < 1 && Math.abs(_v.x) < 1.1 && Math.abs(_v.y) < 1.1; k.label.style.display = vis ? '' : 'none'; if (vis) { k.label.style.transform = `translate(${(_v.x * W + W) | 0}px,${(-_v.y * Hh + Hh) | 0}px)`; k.label.lastChild.firstChild.style.width = k.hp + '%'; } }
    else k.label.style.display = 'none';
  }
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i]; f.t += dt; if (f.t > 0.9) { f.d.remove(); floats.splice(i, 1); continue; }
    _v.copy(f.p).setY(f.p.y + f.t * 2).project(camera); f.d.style.transform = `translate(${(_v.x * W + W) | 0}px,${(-_v.y * Hh + Hh) | 0}px) scale(${1 + Math.max(0, 0.3 - f.t)})`; f.d.style.opacity = 1 - f.t / 0.9;
  }
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  step(dt); render(dt);
}
G.fast = (sec, dt = 1 / 30) => { for (let t = 0; t < sec; t += dt) { step(dt); if (G.state === 'result' && G.stopOnResult) break; } render(dt); return G.state; };
G.newMatch = newMatch; G.toMenu = toMenu; G.render = () => render(1 / 60);

// land straight in play unless ?title
if (Q.has('title')) toMenu(); else { buildMenu(); newMatch(); }
requestAnimationFrame(frame);
