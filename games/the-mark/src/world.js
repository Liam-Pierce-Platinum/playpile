// Venue builder: five locations, each a plaza the crowd lives in, dressed with props,
// surrounding buildings, lighting presets (time of day), sky and weather.
import * as THREE from '../vendor/three.module.js';
import { makeRng } from './util.js';

const TOD = {
  morning: { top: 0x6ea6e0, bot: 0xf6d9b4, sun: 0xffe0b5, sunI: 2.6, el: 24, az: -50, hs: 0xcfe0ff, hg: 0x6b5a48, hI: 1.15, fog: 0xe6d3b8, fn: 90, ff: 320, exp: 1.0, lamps: false },
  noon: { top: 0x3f86de, bot: 0xd2e6f6, sun: 0xfff6e6, sunI: 3.0, el: 58, az: -30, hs: 0xd6e8ff, hg: 0x76664f, hI: 1.15, fog: 0xd4e3f0, fn: 110, ff: 360, exp: 0.95, lamps: false },
  dusk: { top: 0x2c3870, bot: 0xf29455, sun: 0xffa060, sunI: 2.2, el: 9, az: 60, hs: 0x9c8fc4, hg: 0x5a4436, hI: 1.25, fog: 0xc58a6a, fn: 80, ff: 300, exp: 1.08, lamps: true },
  night: { top: 0x05091a, bot: 0x1d2850, sun: 0xa8bcff, sunI: 0.9, el: 40, az: 30, hs: 0x7a8cc4, hg: 0x34323a, hI: 1.35, fog: 0x121a30, fn: 70, ff: 260, exp: 1.2, lamps: true },
  fog: { top: 0xa9b3bb, bot: 0xc9cfd3, sun: 0xffffff, sunI: 1.1, el: 40, az: -20, hs: 0xe0e6ea, hg: 0x707070, hI: 1.6, fog: 0xbfc6cb, fn: 30, ff: 150, exp: 1.0, lamps: true },
  rain: { top: 0x46525e, bot: 0x7d8893, sun: 0xdfe6ee, sunI: 1.1, el: 50, az: -40, hs: 0xc2ccd6, hg: 0x4c4f55, hI: 1.6, fog: 0x6f7984, fn: 45, ff: 220, exp: 1.05, lamps: true, rain: true },
};

const texCache = {};
function canvasTex(key, w, h, draw, srgb = true) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  texCache[key] = t; return t;
}
function rep(tex, x, y) { const t = tex.clone(); t.repeat.set(x, y); t.needsUpdate = true; return t; }

function noiseFill(g, w, h, base, amt, n = 4000, r = makeRng(7)) {
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < n; i++) { const v = (r() - 0.5) * amt; g.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`; g.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3); }
}
const groundTex = {
  cobble: () => canvasTex('cobble', 512, 512, (g, w, h) => {
    const r = makeRng(3); noiseFill(g, w, h, '#857a6d', 0.12, 3000, r);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const ox = (y % 2) * 16; const c = 112 + r() * 40 | 0; g.fillStyle = `rgb(${c},${c - 8},${c - 18})`;
      g.beginPath(); g.roundRect(x * 32 + ox + 2, y * 32 + 2, 28, 28, 7); g.fill();
    }
  }),
  tile: () => canvasTex('tile', 512, 512, (g, w, h) => {
    const r = makeRng(4); g.fillStyle = '#9a968e'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const c = 170 + r() * 26 | 0; g.fillStyle = `rgb(${c},${c - 4},${c - 10})`; g.fillRect(x * 64 + 2, y * 64 + 2, 60, 60); }
  }),
  concrete: () => canvasTex('concrete', 512, 512, (g, w, h) => {
    noiseFill(g, w, h, '#8d8b86', 0.1, 5000); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
  }),
  grass: () => canvasTex('grass', 512, 512, (g, w, h) => {
    const r = makeRng(5); g.fillStyle = '#5c8a3a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const c = r(); g.fillStyle = c > 0.5 ? `rgba(130,170,70,${0.4 * r()})` : `rgba(40,70,25,${0.4 * r()})`; g.fillRect(r() * w, r() * h, 2, 5); }
  }),
  deck: () => canvasTex('deck', 512, 512, (g, w, h) => {
    const r = makeRng(6); for (let i = 0; i < 16; i++) { const c = 120 + r() * 30 | 0; g.fillStyle = `rgb(${c + 30},${c},${c - 30})`; g.fillRect(0, i * 32, w, 31); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(r() * w, i * 32, 2, 31); }
  }),
  asphalt: () => canvasTex('asphalt', 256, 256, (g, w, h) => noiseFill(g, w, h, '#3a3b3e', 0.12, 3000)),
};

function facadeTex(style, night) {
  return canvasTex('fac' + style + night, 256, 256, (g, w, h) => {
    const r = makeRng(10 + style);
    const walls = ['#b9a38a', '#a35f45', '#c8c2b4', '#8f9aa3', '#d6c7a2', '#6d7682'];
    g.fillStyle = walls[style % walls.length]; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) { g.fillStyle = `rgba(0,0,0,${r() * 0.06})`; g.fillRect(r() * w, r() * h, 3, 3); }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
      const lit = night && r() < 0.45;
      g.fillStyle = night ? (lit ? (r() < 0.5 ? '#ffd890' : '#ffefc8') : '#10141c') : (r() < 0.2 ? '#4d5a66' : '#2b3540');
      g.fillRect(x * 64 + 14, y * 64 + 12, 36, 40);
      if (!night) { g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x * 64 + 14, y * 64 + 12, 36, 6); }
      g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x * 64 + 12, y * 64 + 52, 40, 4);
    }
  });
}
function emissiveFacade(style) {
  return canvasTex('face' + style, 256, 256, (g, w, h) => {
    const r = makeRng(10 + style); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 1500; i++) r(); // keep sequence aligned with facadeTex
    for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { const lit = r() < 0.45; const c = r() < 0.5 ? '#ffc870' : '#ffe8b8'; r(); g.fillStyle = lit ? c : '#000'; g.fillRect(x * 64 + 14, y * 64 + 12, 36, 40); }
  });
}
function stripeTex(a, b) {
  return canvasTex('stripe' + a + b, 128, 32, (g, w, h) => { for (let i = 0; i < 8; i++) { g.fillStyle = i % 2 ? a : b; g.fillRect(i * 16, 0, 16, h); } g.fillStyle = 'rgba(0,0,0,.15)'; g.fillRect(0, h - 4, w, 4); });
}

function corrTex() {
  return canvasTex('corr', 128, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let i = 0; i < 32; i++) { g.fillStyle = i % 2 ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.1)'; g.fillRect(i * 4, 0, 2, h); } g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 3; g.strokeRect(2, 2, w - 4, h - 4); });
}
export function buildVenue(scene, kind, todName, seed) {
  const r = makeRng(seed);
  const T = TOD[todName] || TOD.noon;
  const night = todName === 'night' || todName === 'dusk' || todName === 'rain';
  const root = new THREE.Group(); scene.add(root);
  const V = { kind, tod: todName, T, root, obstacles: [], spots: { shop: [], sit: [], stand: [], vendor: [], dance: null, chat: [] }, exits: [], cams: [], landmarks: [], lamps: [], updaters: [], lights: [] };
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: o.r ?? 0.85, metalness: o.m ?? 0, ...o.x });
  const mats = {};
  const mat = (c, o) => mats[c + JSON.stringify(o || {})] || (mats[c + JSON.stringify(o || {})] = M(c, o));
  const box = (w, h, d, m, x, y, z, ry = 0, shadow = true) => {
    const me = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); me.position.set(x, y, z); me.rotation.y = ry;
    me.castShadow = shadow; me.receiveShadow = true; root.add(me); return me;
  };
  const cyl = (rt, rb, h, m, x, y, z, seg = 16) => { const me = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m); me.position.set(x, y, z); me.castShadow = true; me.receiveShadow = true; root.add(me); return me; };
  const obstacle = (x, z, w, d, pad = 0.35) => V.obstacles.push({ x0: x - w / 2 - pad, x1: x + w / 2 + pad, z0: z - d / 2 - pad, z1: z + d / 2 + pad });

  // ---------- lighting, sky, fog
  scene.background = null;
  scene.fog = new THREE.Fog(T.fog, T.fn, T.ff);
  const hemi = new THREE.HemisphereLight(T.hs, T.hg, T.hI); root.add(hemi);
  const sun = new THREE.DirectionalLight(T.sun, T.sunI);
  const el = (T.el * Math.PI) / 180, az = (T.az * Math.PI) / 180;
  sun.position.set(Math.sin(az) * Math.cos(el) * 80, Math.sin(el) * 80, -Math.cos(az) * Math.cos(el) * 80 + 10);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 220;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  root.add(sun); root.add(sun.target);
  const skyGeo = new THREE.SphereGeometry(600, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(T.top) }, bot: { value: new THREE.Color(T.bot) }, sunDir: { value: sun.position.clone().normalize() }, sunC: { value: new THREE.Color(T.sun) }, night: { value: todName === 'night' ? 1 : 0 } },
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }',
    fragmentShader: `uniform vec3 top, bot, sunC, sunDir; uniform float night; varying vec3 vP;
      float h(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
      void main(){ float y = clamp(vP.y*1.6+0.08,0.,1.); vec3 c = mix(bot, top, pow(y,0.7));
        float s = max(dot(vP, sunDir),0.); c += sunC * (pow(s, 900.)*2. + pow(s,12.)*0.25) * (1.-night*0.6);
        if(night>0.5){ vec3 q = floor(vP*400.); float st = step(0.9975, h(q)) * y; c += vec3(st); }
        gl_FragColor = vec4(c,1.); }`,
  });
  root.add(new THREE.Mesh(skyGeo, skyMat));

  // ---------- venue dimensions & camera
  const dims = { market: [56, 44], station: [60, 40], harbour: [60, 40], festival: [64, 48], party: [40, 32] }[kind];
  const [W, D] = dims; V.W = W; V.D = D;
  V.walk = { x0: -W / 2 + 0.6, x1: W / 2 - 0.6, z0: -D / 2 + 0.6, z1: D / 2 - 0.6 };
  const camCfg = { market: [0, 22, -35], station: [0, 21, -33], harbour: [0, 20, -33], festival: [0, 23, -38], party: [0, 14, -27] }[kind];
  V.camPos = new THREE.Vector3(...camCfg);
  V.lookAt = new THREE.Vector3(0, 0, kind === 'party' ? 2 : 4);
  const baseY = kind === 'party' ? -42 : 0; // the street level around the plaza

  // ---------- ground
  const gName = { market: 'cobble', station: 'tile', harbour: 'concrete', festival: 'grass', party: 'deck' }[kind];
  const wet = !!T.rain;
  const gMat = new THREE.MeshStandardMaterial({ map: rep(groundTex[gName](), W / 6, D / 6), roughness: wet ? 0.35 : 0.92, metalness: wet ? 0.15 : 0, color: 0xffffff });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), gMat); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; root.add(ground);
  V.ground = ground;
  // surrounding streets
  const street = new THREE.Mesh(kind === 'harbour' ? new THREE.PlaneGeometry(600, 300).translate(0, 150 - 10.5, 0) : new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: rep(groundTex.asphalt(), 60, 60), roughness: wet ? 0.4 : 0.95, metalness: wet ? 0.1 : 0 }));
  street.rotation.x = -Math.PI / 2; street.position.y = baseY - 0.02; street.receiveShadow = true; root.add(street);
  // kerb ring
  if (kind !== 'party') {
    const kerbM = mat(0x9c978c);
    box(W + 1, 0.18, 0.5, kerbM, 0, 0.05, -D / 2 - 0.25, 0, false); box(W + 1, 0.18, 0.5, kerbM, 0, 0.05, D / 2 + 0.25, 0, false);
    box(0.5, 0.18, D, kerbM, -W / 2 - 0.25, 0.05, 0, 0, false); box(0.5, 0.18, D, kerbM, W / 2 + 0.25, 0.05, 0, 0, false);
  }

  // ---------- helpers for props
  // facade materials are shared per style; the window grid is tiled through the UVs so every
  // building of a style can be merged into one draw call
  const facMats = {};
  const facMat = (style) => {
    if (facMats[style]) return facMats[style];
    const m = new THREE.MeshStandardMaterial({ map: facadeTex(style, false), roughness: 0.9 });
    if (night) { m.emissiveMap = emissiveFacade(style); m.emissive = new THREE.Color(todName === 'night' ? 0xffffff : 0x9a8a70); m.emissiveIntensity = todName === 'night' ? 1.1 : 0.6; }
    return (facMats[style] = m);
  };
  const building = (x, z, w, d, h, style, y0 = baseY, clutter = true) => {
    const side = facMat(style % 6);
    const roof = mat(0x5a5a5e);
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv.array, vy = Math.max(1, h / 7);
    for (let f = 0; f < 6; f++) { if (f === 2 || f === 3) continue; const ux = Math.max(1, (f < 2 ? d : w) / 7); for (let k = 0; k < 4; k++) { const i = (f * 4 + k) * 2; uv[i] *= ux; uv[i + 1] *= vy; } }
    const me = new THREE.Mesh(geo, [side, side, roof, roof, side, side]);
    me.position.set(x, y0 + h / 2, z); me.castShadow = true; me.receiveShadow = true; root.add(me);
    // cornice + rooftop clutter
    if (clutter) box(w + 0.4, 0.5, d + 0.4, mat(0x6f6a64), x, y0 + h + 0.25, z, 0, false);
    if (clutter && r() < 0.6) box(2 + r() * 2, 1.4, 2 + r() * 2, mat(0x8a8d90), x + (r() - 0.5) * w * 0.5, y0 + h + 1.2, z + (r() - 0.5) * d * 0.5, 0, false);
    if (clutter && r() < 0.4) cyl(1, 1, 2.4, mat(0x6b4e36), x + (r() - 0.5) * w * 0.4, y0 + h + 1.6, z + (r() - 0.5) * d * 0.4, 10);
    return me;
  };
  const tree = (x, z, s = 1, y = 0) => {
    cyl(0.15 * s, 0.22 * s, 2.2 * s, mat(0x5a3d26), x, y + 1.1 * s, z, 7);
    const f = new THREE.Mesh(new THREE.IcosahedronGeometry(1.5 * s, 1), mat(r() < 0.5 ? 0x3f7a35 : 0x4d8a3a, { x: { flatShading: true } }));
    f.position.set(x, y + 3 * s, z); f.castShadow = true; root.add(f);
    obstacle(x, z, 0.6, 0.6, 0.2);
  };
  const lampHead = (x, y, z) => {
    const on = T.lamps;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: on ? 0xffd28a : 0x000000, emissiveIntensity: on ? 2.2 : 0 }));
    head.position.set(x, y, z); root.add(head); V.lamps.push(head);
  };
  const lamp = (x, z) => { cyl(0.07, 0.1, 4.2, mat(0x2a2c30, { m: 0.5, r: 0.5 }), x, 2.1, z, 8); lampHead(x, 4.3, z); obstacle(x, z, 0.3, 0.3, 0.15); };
  const bench = (x, z, ry) => {
    const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = ry; root.add(g);
    const wood = mat(0x8a5a32), iron = mat(0x2a2a2e);
    const seat = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.45), wood); seat.position.set(0, 0.45, 0); g.add(seat);
    const back = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.4, 0.06), wood); back.position.set(0, 0.75, -0.22); g.add(back);
    for (const sx of [-0.85, 0.85]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.45, 0.4), iron); l.position.set(sx, 0.22, 0); g.add(l); }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const fx = Math.sin(ry), fz = Math.cos(ry);
    for (const s of [-0.5, 0.5]) V.spots.sit.push({ x: x + Math.cos(ry) * s + fx * 0.05, z: z - Math.sin(ry) * s + fz * 0.05, yaw: ry, h: 0.47 });
    const c = Math.abs(Math.cos(ry)) > 0.5; obstacle(x, z, c ? 1.9 : 0.5, c ? 0.5 : 1.9, 0.1);
  };
  const cctv = (x, z, h = 5.5) => {
    cyl(0.08, 0.1, h, mat(0x3a3c40, { m: 0.4, r: 0.5 }), x, h / 2, z, 8);
    const body = box(0.25, 0.22, 0.5, mat(0xe8e8e8), x, h + 0.1, z, 0, false);
    body.lookAt(0, h - 2.5, 0);
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 })); led.position.set(x, h + 0.3, z); led.userData.dyn = true; root.add(led);
    V.cams.push({ x, y: h, z, led });
    obstacle(x, z, 0.3, 0.3, 0.1);
  };
  const stall = (x, z, w, a, b, goods = true) => {
    // counter faces -z (toward the sniper) so shoppers stand in view
    box(w, 1.0, 1.2, mat(0x7a5233), x, 0.5, z, 0);
    for (const sx of [-w / 2 + 0.1, w / 2 - 0.1]) for (const sz of [-0.55, 1.4]) cyl(0.05, 0.05, 2.6, mat(0x5a4030), x + sx, 1.3, z + sz, 6);
    const aw = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.4, 2.6), new THREE.MeshStandardMaterial({ map: stripeTex(a, b), side: THREE.DoubleSide, roughness: 0.8 }));
    aw.position.set(x, 2.55, z + 0.55); aw.rotation.x = -Math.PI / 2 + 0.28; aw.castShadow = true; root.add(aw);
    if (goods) {
      const cols = [0xd23a2a, 0xf0a020, 0x6ab03a, 0xe8d050, 0x9a3ab0, 0xf06a30];
      for (let i = 0; i < Math.floor(w / 0.6); i++) {
        const cr = box(0.5, 0.18, 0.4, mat(0x9a7a50), x - w / 2 + 0.4 + i * 0.6, 1.09, z - 0.25, 0, false);
        const pile = new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), mat(cols[(((i + (x | 0)) % cols.length) + cols.length) % cols.length]));
        pile.scale.set(1.3, 0.55, 1); pile.position.set(cr.position.x, 1.22, z - 0.25); root.add(pile);
      }
    }
    obstacle(x, z + 0.4, w, 2.2, 0.25);
    V.spots.shop.push({ x: x - w / 4, z: z - 1.25, yaw: 0 }, { x: x + w / 4, z: z - 1.25, yaw: 0 });
    V.spots.vendor.push({ x, z: z + 1.0, yaw: Math.PI });
  };
  const exitAt = (x, z) => V.exits.push({ x, z });

  // ---------- venue specific dressing
  if (kind === 'market') {
    const cols = [['#c8302c', '#f3ecd8'], ['#2f6fbf', '#f3ecd8'], ['#2f8a3e', '#f3ecd8'], ['#e8a020', '#f6f0e0'], ['#7a3aa8', '#f3ecd8']];
    for (const zr of [-11, 12]) for (let i = 0; i < 6; i++) { const x = -21 + i * 8.4; if (zr === 12 && Math.abs(x) < 4) continue; const c = cols[(i + (zr > 0 ? 2 : 0)) % cols.length]; stall(x, zr, 4.2, c[0], c[1]); }
    // fountain
    const st = mat(0xb8b2a6);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.32, 10, 40), st); rim.rotation.x = Math.PI / 2; rim.position.set(0, 0.45, 1); rim.castShadow = true; root.add(rim);
    cyl(3.2, 3.3, 0.4, st, 0, 0.2, 1, 40);
    const water = cyl(3.0, 3.0, 0.05, new THREE.MeshStandardMaterial({ color: 0x3f8aa8, roughness: 0.1, metalness: 0.3 }), 0, 0.44, 1, 40);
    cyl(0.4, 0.6, 2.2, st, 0, 1.1, 1, 12); cyl(1.2, 0.3, 0.35, st, 0, 2.2, 1, 20); cyl(0.15, 0.2, 0.9, st, 0, 2.7, 1, 8);
    V.updaters.push((t) => { water.material.color.setHSL(0.54, 0.45, 0.42 + Math.sin(t * 2) * 0.02); });
    obstacle(0, 1, 7, 7, 0.3);
    V.landmarks.push({ name: 'fountain', x: 0, z: 1 });
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.3; const R = 6.8; bench(Math.sin(a) * R, 1 + Math.cos(a) * R, a); }
    for (const [x, z] of [[-24, -18], [24, -18], [-24, 19], [24, 19], [-12, 1], [12, 1]]) tree(x, z, 1.1);
    for (const [x, z] of [[-18, 2], [18, 2], [-6, -18], [6, -18], [-6, 19], [6, 19]]) lamp(x, z);
    cctv(-26.5, -1); cctv(26.5, -1); cctv(0, 20.5);
    V.landmarks.push({ name: 'north stalls', x: 0, z: 12 }, { name: 'south stalls', x: 0, z: -11 });
    exitAt(-W / 2, -17); exitAt(W / 2, -17); exitAt(-W / 2, 17); exitAt(W / 2, 17); exitAt(0, D / 2);
  } else if (kind === 'station') {
    V.walk.z1 = 11.5;
    // tracks + train beyond the platform edge
    box(W + 80, 1.2, 7, mat(0x3a3530), 0, -0.6, 15.2, 0, false);
    for (const tz of [13.6, 16.8]) for (const dz of [-0.72, 0.72]) box(W + 80, 0.12, 0.1, mat(0x9a9aa0, { m: 0.8, r: 0.3 }), 0, 0.05, tz + dz, 0, false);
    box(W + 80, 0.12, 0.6, mat(0xe8d020), 0, 0.02, 11.75, 0, false); // yellow line
    const trainMat = new THREE.MeshStandardMaterial({ map: canvasTex('train', 256, 64, (g, w, h) => { g.fillStyle = '#d9dde2'; g.fillRect(0, 0, w, h); g.fillStyle = '#c02a2a'; g.fillRect(0, 44, w, 8); for (let i = 0; i < 6; i++) { g.fillStyle = '#1d2733'; g.fillRect(8 + i * 42, 12, 30, 22); } }), roughness: 0.5, metalness: 0.2 });
    for (let c = 0; c < 4; c++) { const car = box(18, 3.6, 3.0, trainMat, -30 + c * 18.6, 2.0, 17, 0); car.material = trainMat; }
    box(W + 10, 0.3, 6, mat(0xa09a90), 0, 0.15, 22, 0, false); // far platform
    // glass canopy over the platform edge
    const glass = new THREE.MeshStandardMaterial({ color: 0xbfd8e8, transparent: true, opacity: 0.16, roughness: 0.1, metalness: 0.3, depthWrite: false });
    const can = new THREE.Mesh(new THREE.BoxGeometry(W - 6, 0.08, 6), glass); can.position.set(0, 5.6, 9); root.add(can);
    for (let x = -W / 2 + 4; x <= W / 2 - 4; x += 8) { cyl(0.18, 0.18, 5.6, mat(0x355a7a, { m: 0.6, r: 0.4 }), x, 2.8, 9, 10); obstacle(x, 9, 0.4, 0.4, 0.15); box(0.15, 0.25, 6, mat(0x355a7a), x, 5.55, 9, 0, false); }
    for (let x = -W / 2 + 3; x < W / 2 - 3; x += 2.5) V.spots.stand.push({ x: x + r() * 0.8, z: 10.6, yaw: 0 });
    // clock tower + departures board
    cyl(0.5, 0.6, 6, mat(0x4a4f58, { m: 0.4, r: 0.5 }), 0, 3, -2, 12);
    const face = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), new THREE.MeshStandardMaterial({ map: canvasTex('clock', 128, 128, (g) => { g.fillStyle = '#f4f0e4'; g.fillRect(0, 0, 128, 128); g.strokeStyle = '#222'; g.lineWidth = 6; g.beginPath(); g.arc(64, 64, 52, 0, 7); g.stroke(); g.beginPath(); g.moveTo(64, 64); g.lineTo(64, 24); g.moveTo(64, 64); g.lineTo(92, 74); g.stroke(); }), emissive: night ? 0xfff0c0 : 0, emissiveIntensity: 0.5 }));
    face.position.set(0, 6.6, -2); face.castShadow = true; root.add(face); obstacle(0, -2, 1.3, 1.3, 0.2);
    V.landmarks.push({ name: 'clock tower', x: 0, z: -2 });
    const board = box(6, 1.6, 0.25, new THREE.MeshStandardMaterial({ map: canvasTex('board', 256, 64, (g) => { g.fillStyle = '#101418'; g.fillRect(0, 0, 256, 64); g.fillStyle = '#ffb21a'; g.font = 'bold 11px monospace'; ['09:42  NORTHGATE   2', '09:48  RIVERSIDE  1', '09:55  AIRPORT    3', '10:02  OLD TOWN   2'].forEach((s, i) => g.fillText(s, 8, 14 + i * 14)); }), emissive: 0xffffff, emissiveIntensity: 0.35, emissiveMap: canvasTex('board', 1, 1, () => {}) }), -14, 3.4, -4, 0);
    board.material.emissiveMap = board.material.map;
    for (const sx of [-2.6, 2.6]) cyl(0.08, 0.08, 2.6, mat(0x333), -14 + sx, 1.3, -4, 6);
    obstacle(-14, -4, 6, 0.5, 0.2); V.landmarks.push({ name: 'departures board', x: -14, z: -4 });
    stall(16, -6, 4, '#2a5a3a', '#e8e2d0', false); V.landmarks.push({ name: 'coffee kiosk', x: 16, z: -6 });
    stall(-20, 4, 3.4, '#7a2a2a', '#e8e2d0', false);
    for (const [x, z, ry] of [[-8, 4, 0], [8, 4, 0], [-22, -12, Math.PI / 2], [22, -12, -Math.PI / 2], [6, -12, Math.PI], [-6, -12, Math.PI]]) bench(x, z, ry);
    for (const [x, z] of [[-27, -18], [27, -18]]) tree(x, z, 0.9);
    cctv(-28, 8); cctv(28, 8); cctv(10, -18);
    for (const [x, z] of [[-20, -14], [20, -14]]) lamp(x, z);
    exitAt(-W / 2, -14); exitAt(W / 2, -14); exitAt(-W / 2, 6); exitAt(W / 2, 6); exitAt(0, -D / 2);
  } else if (kind === 'harbour') {
    V.walk.z1 = 9.4;
    // water
    const nTex = canvasTex('waterN', 256, 256, (g, w, h) => { const rr = makeRng(9); g.fillStyle = 'rgb(128,128,255)'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { const v = rr(); g.fillStyle = `rgba(${v > 0.5 ? 170 : 90},${v > 0.5 ? 150 : 110},255,0.5)`; g.beginPath(); g.ellipse(rr() * w, rr() * h, 10 + rr() * 16, 2 + rr() * 3, 0, 0, 7); g.fill(); } }, false);
    const wn = rep(nTex, 40, 40);
    const wMat = new THREE.MeshStandardMaterial({ color: todName === 'night' ? 0x0d2230 : 0x1f4c62, roughness: 0.18, metalness: 0.35, normalMap: wn, normalScale: new THREE.Vector2(0.6, 0.6) });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 400), wMat); water.rotation.x = -Math.PI / 2; water.position.set(0, -1.1, 10 + 200); root.add(water);
    V.updaters.push((t) => { wn.offset.set(t * 0.01, t * 0.017); });
    box(W + 2, 1.2, 0.6, mat(0x8a857a), 0, -0.5, 10.2, 0, false); // quay wall
    for (let x = -W / 2 + 2; x < W / 2; x += 4) { cyl(0.18, 0.22, 0.6, mat(0x2a2c2e, { m: 0.5 }), x, 0.3, 9.7, 10); }
    // railing segments
    for (let x = -W / 2 + 4; x < W / 2 - 3; x += 6) { box(4.6, 0.06, 0.06, mat(0x2a3a44, { m: 0.5 }), x + 2.3, 1.0, 9.9, 0, false); for (const dx of [0, 4.6]) box(0.06, 1.0, 0.06, mat(0x2a3a44), x + dx, 0.5, 9.9, 0, false); V.spots.stand.push({ x: x + 1.2, z: 9.0, yaw: 0 }, { x: x + 3.4, z: 9.0, yaw: 0 }); }
    // boats
    const hullC = [0xc23a2a, 0x2a5aa0, 0xe8e2d0, 0x2a7a50];
    for (let i = 0; i < 5; i++) {
      const bx = -24 + i * 12 + r() * 3, bz = 14 + (i % 2) * 4, L = 7 + r() * 4;
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.9, L, 12, 1, false, 0, Math.PI), mat(hullC[i % 4]));
      hull.rotation.z = Math.PI / 2; hull.rotation.y = 0; hull.rotation.x = Math.PI; hull.position.set(bx, -0.4, bz); hull.castShadow = true; root.add(hull);
      box(L * 0.95, 0.12, 2.6, mat(0xb08a5a), bx, -0.38, bz, 0, false);
      box(L * 0.3, 1.4, 1.8, mat(0xf0ece2), bx - L * 0.15, 0.35, bz, 0);
      cyl(0.06, 0.08, 6, mat(0xd8d4c8), bx + L * 0.15, 2.6, bz, 6);
    }
    // crane
    const cm = mat(0xe0a020, { m: 0.3, r: 0.6 });
    for (const dx of [-1.5, 1.5]) for (const dz of [-1.5, 1.5]) box(0.4, 14, 0.4, cm, 34 + dx, 7, 4 + dz, 0);
    box(4, 1, 4, cm, 34, 14.5, 4, 0); box(24, 0.8, 0.8, cm, 28, 15.5, 6, -0.4);
    // crates
    const cc = [0x2a6aa0, 0xb03a2a, 0x3a8a4a, 0xc08a30];
    for (const [x, z, n] of [[-22, 3, 3], [-16, -15, 2], [21, -12, 3], [10, 4, 2]]) { for (let k = 0; k < n; k++) box(2.4, 2.4, 6, new THREE.MeshStandardMaterial({ color: cc[(k + (x | 0)) & 3], map: corrTex(), roughness: 0.7, metalness: 0.2 }), x + k * 2.5, 1.2, z, 0); obstacle(x + (n - 1) * 1.25, z, n * 2.5, 6, 0.3); }
    V.landmarks.push({ name: 'blue containers', x: -20, z: 3 }, { name: 'fish stalls', x: 0, z: -8 });
    stall(-5, -8, 4, '#2a6aa0', '#f0f0f0'); stall(3, -8, 4, '#2a6aa0', '#f0f0f0'); stall(-27 + 4, -6, 3.6, '#c04030', '#f0f0f0');
    for (const [x, ry] of [[-12, Math.PI], [-6, Math.PI], [6, Math.PI], [14, Math.PI]]) bench(x, 7.6, ry);
    // lighthouse in the distance
    cyl(2.4, 3.2, 22, mat(0xf0ece4), 70, 10, 120, 16); cyl(2.6, 2.6, 3, mat(0xc0302a), 70, 21, 120, 16);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.6, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff4c0 })); beacon.position.set(70, 23.5, 120); root.add(beacon);
    for (const [x, z] of [[-14, 8.6], [14, 8.6], [-24, -14], [24, -14], [0, -18]]) lamp(x, z);
    cctv(-28, -2); cctv(28, -4); cctv(0, 8.8, 5);
    exitAt(-W / 2, -15); exitAt(W / 2, -15); exitAt(-W / 2, 0); exitAt(W / 2, 1); exitAt(0, -D / 2);
  } else if (kind === 'festival') {
    // stage
    box(24, 1.4, 8, mat(0x26262c), 0, 0.7, 20.5, 0);
    const tm = mat(0x6a6e74, { m: 0.7, r: 0.4 });
    for (const sx of [-12, 12]) for (const sz of [17, 24]) box(0.35, 9, 0.35, tm, sx, 4.5, sz, 0);
    box(24.4, 0.5, 0.4, tm, 0, 9, 17, 0); box(24.4, 0.5, 0.4, tm, 0, 9, 24, 0);
    box(24, 7, 0.2, new THREE.MeshStandardMaterial({ color: 0x18122a, emissive: 0x30205a, emissiveIntensity: night ? 1 : 0.2 }), 0, 4.9, 24.2, 0);
    for (const sx of [-14.5, 14.5]) box(2.2, 4, 2, mat(0x1a1a1c), sx, 2, 18.5, 0);
    obstacle(0, 20.5, 31, 8, 0.4);
    // stage lights
    const lightCols = [0xff3a7a, 0x3ac8ff, 0xffd23a, 0x7a3aff, 0x3aff8a];
    const stageLights = [];
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshBasicMaterial({ color: lightCols[i % 5] }));
      s.position.set(-10 + i * 3.33, 8.6, 17.1); root.add(s); stageLights.push(s);
    }
    V.updaters.push((t) => stageLights.forEach((s, i) => { const k = 0.5 + 0.5 * Math.sin(t * 4 + i); s.material.color.setHex(lightCols[(i + Math.floor(t * 1.5)) % 5]).multiplyScalar(0.4 + k * 0.8); }));
    if (night || todName === 'dusk') { for (const x of [-7, 7]) { const pl = new THREE.PointLight(x < 0 ? 0xff3a9a : 0x3ac8ff, 60, 30, 1.6); pl.position.set(x, 8, 14); root.add(pl); V.lights.push(pl); } }
    V.spots.dance = { x: 0, z: 8, r: 8 };
    V.landmarks.push({ name: 'main stage', x: 0, z: 18 }, { name: 'dance floor', x: 0, z: 8 });
    // food tents both sides
    const tentC = [['#e04a3a', '#fff4e0'], ['#3a9ad8', '#fff4e0'], ['#f0b020', '#fff4e0'], ['#5ab048', '#fff4e0']];
    let ti = 0;
    for (const z of [-14, -5, 4]) { stall(-25, z, 4.4, ...tentC[ti++ % 4]); stall(25, z, 4.4, ...tentC[ti++ % 4]); }
    V.landmarks.push({ name: 'food tents', x: -25, z: -5 });
    // picnic tables -> sit spots
    for (const [x, z] of [[-12, -14], [-4, -16], [4, -16], [12, -14], [-14, -4], [14, -4]]) {
      box(2.2, 0.08, 0.9, mat(0x8a5a32), x, 0.75, z, 0); box(2.2, 0.06, 0.3, mat(0x8a5a32), x, 0.45, z - 0.75, 0); box(2.2, 0.06, 0.3, mat(0x8a5a32), x, 0.45, z + 0.75, 0);
      for (const sx of [-0.9, 0.9]) box(0.08, 0.75, 0.08, mat(0x5a3a22), x + sx, 0.37, z, 0, false);
      obstacle(x, z, 2.2, 0.9, 0.2);
      V.spots.sit.push({ x: x - 0.5, z: z - 0.78, yaw: 0, h: 0.47 }, { x: x + 0.5, z: z - 0.78, yaw: 0, h: 0.47 }, { x: x - 0.5, z: z + 0.78, yaw: Math.PI, h: 0.47 }, { x: x + 0.5, z: z + 0.78, yaw: Math.PI, h: 0.47 });
    }
    // bunting
    const flagG = new THREE.ConeGeometry(0.22, 0.45, 3); flagG.rotateX(Math.PI);
    for (const [ax, az, bx, bz] of [[-28, -20, 28, -20], [-28, -8, 28, -8], [-28, 4, -14, 14], [28, 4, 14, 14]]) {
      const n = Math.floor(Math.hypot(bx - ax, bz - az) / 0.9);
      const inst = new THREE.InstancedMesh(flagG, new THREE.MeshStandardMaterial({ roughness: 0.8 }), n);
      const m4 = new THREE.Matrix4(), col = new THREE.Color();
      for (let i = 0; i < n; i++) { const t = i / (n - 1); const y = 6.2 - Math.sin(t * Math.PI) * 1.4; m4.makeTranslation(ax + (bx - ax) * t, y, az + (bz - az) * t); inst.setMatrixAt(i, m4); inst.setColorAt(i, col.setHex(lightCols[i % 5])); }
      root.add(inst);
      for (const [px, pz] of [[ax, az], [bx, bz]]) cyl(0.08, 0.08, 6.4, mat(0x6a5a4a), px, 3.2, pz, 6);
    }
    // ferris wheel backdrop
    const fw = new THREE.Group(); fw.userData.dyn = true; fw.position.set(-48, 18, 62); root.add(fw);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15, 0.35, 8, 48), mat(0xe8e8f0, { m: 0.5 })); fw.add(ring);
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 15, 0.2), mat(0xd0d0d8)); sp.position.set(Math.cos(a) * 7.5, Math.sin(a) * 7.5, 0); sp.rotation.z = a + Math.PI / 2; fw.add(sp); const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.6, 1.6), mat(lightCols[i % 5], { x: { emissive: night ? lightCols[i % 5] : 0, emissiveIntensity: 0.5 } })); cab.position.set(Math.cos(a) * 15, Math.sin(a) * 15, 0); fw.add(cab); }
    for (const s of [-1, 1]) { const leg = box(0.6, 20, 0.6, mat(0xb0b0b8), -48 + s * 6, 9, 62, 0); leg.rotation.z = s * 0.3; }
    V.updaters.push((t) => { fw.rotation.z = t * 0.05; });
    for (const [x, z] of [[-30, 22], [30, 22], [-30, -22], [30, -22], [-20, 18], [20, 18]]) tree(x, z, 1.3);
    for (const [x, z] of [[-18, 0], [18, 0], [-8, -21], [8, -21]]) lamp(x, z);
    cctv(-31, -12); cctv(31, -12); cctv(-13, 16);
    exitAt(-W / 2, -18); exitAt(W / 2, -18); exitAt(-W / 2, 12); exitAt(W / 2, 12); exitAt(0, -D / 2);
  } else if (kind === 'party') {
    // terrace slab & glass railing
    box(W + 1, 1.2, D + 1, mat(0x8a8680), 0, -0.6, 0, 0, false);
    const glass = new THREE.MeshStandardMaterial({ color: 0xcde6f0, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false });
    for (const [x, z, w, d] of [[0, D / 2, W, 0.08], [-W / 2, 0, 0.08, D], [W / 2, 0, 0.08, D], [-W / 4 - 2, -D / 2, W / 2 - 4, 0.08], [W / 4 + 2, -D / 2, W / 2 - 4, 0.08]]) {
      const g = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), glass); g.position.set(x, 0.55, z); root.add(g);
      box(w + 0.08, 0.06, d + 0.08, mat(0xc0c4c8, { m: 0.8, r: 0.3 }), x, 1.12, z, 0, false);
    }
    // pool
    box(12, 0.25, 7, mat(0xe8e4dc), 0, 0.12, 0.5, 0, false);
    const pw = new THREE.Mesh(new THREE.PlaneGeometry(11, 6), new THREE.MeshStandardMaterial({ color: 0x3ab4d8, roughness: 0.05, metalness: 0.2, emissive: night ? 0x0a5a7a : 0x000000, emissiveIntensity: 1 }));
    pw.rotation.x = -Math.PI / 2; pw.position.set(0, 0.27, 0.5); root.add(pw);
    V.updaters.push((t) => { pw.material.color.setHSL(0.54, 0.62, 0.52 + Math.sin(t * 1.7) * 0.03); });
    obstacle(0, 0.5, 12, 7, 0.4);
    V.landmarks.push({ name: 'pool', x: 0, z: 0.5 });
    // loungers
    for (const x of [-4.5, -1.5, 1.5, 4.5]) for (const [z, ry] of [[-4.6, 0], [5.6, Math.PI]]) {
      box(0.75, 0.32, 1.9, mat(0xf2f0ea), x, 0.25, z, 0); obstacle(x, z, 0.75, 1.9, 0.1);
      V.spots.sit.push({ x, z: z + (ry ? -0.2 : 0.2), yaw: ry, h: 0.42 });
    }
    // bar
    box(7, 1.1, 1.0, mat(0x2a2024), -12, 0.55, 10, 0); box(7.2, 0.08, 1.2, mat(0xd8d2c8, { r: 0.3 }), -12, 1.14, 10, 0);
    box(7, 2.4, 0.4, mat(0x3a2a24), -12, 1.2, 12.5, 0);
    for (let i = 0; i < 10; i++) { const b = cyl(0.05, 0.06, 0.32, mat([0x2a8a3a, 0x8a2a2a, 0xd0b040][i % 3], { r: 0.2 }), -15 + i * 0.7, 2.6, 12.3, 6); b.castShadow = false; }
    obstacle(-12, 11, 7, 3.6, 0.3);
    for (let i = 0; i < 5; i++) V.spots.shop.push({ x: -14.8 + i * 1.4, z: 8.9, yaw: 0 });
    V.spots.vendor.push({ x: -13.5, z: 11.2, yaw: Math.PI }, { x: -10.5, z: 11.2, yaw: Math.PI });
    V.landmarks.push({ name: 'bar', x: -12, z: 10 });
    // DJ + dance floor
    box(3.4, 1.2, 1.4, mat(0x18181c), 12, 0.6, 13.6, 0); obstacle(12, 13.6, 3.4, 1.4, 0.3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 8), new THREE.MeshStandardMaterial({ map: canvasTex('dfloor', 128, 128, (g) => { for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.fillStyle = ['#ff4a8a', '#4ac8ff', '#ffd24a', '#8a4aff'][(x + y) % 4]; g.fillRect(x * 32 + 1, y * 32 + 1, 30, 30); } }), emissive: 0xffffff, emissiveIntensity: night ? 0.35 : 0.05, roughness: 0.4 }));
    floor.material.emissiveMap = floor.material.map;
    floor.rotation.x = -Math.PI / 2; floor.position.set(11.5, 0.02, 7.5); root.add(floor);
    V.spots.dance = { x: 11.5, z: 7.5, r: 3.8 };
    V.landmarks.push({ name: 'dance floor', x: 11.5, z: 7.5 });
    // string lights
    const bulbG = new THREE.SphereGeometry(0.05, 6, 4);
    const nb = 160; const bulbs = new THREE.InstancedMesh(bulbG, new THREE.MeshBasicMaterial({ color: 0xffe0a0 }), nb);
    const m4 = new THREE.Matrix4(); let bi = 0;
    for (let s = 0; s < 4; s++) { const z = -10 + s * 7; for (let i = 0; i < 40; i++) { const t = i / 39; m4.makeTranslation(-W / 2 + t * W, 4.6 - Math.sin(t * Math.PI) * 0.8, z); bulbs.setMatrixAt(bi++, m4); } }
    root.add(bulbs);
    for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (let s = 0; s < 4; s++) cyl(0.05, 0.05, 4.6, mat(0x222), x, 2.3, -10 + s * 7, 6);
    for (const [x, z] of [[-18, -14], [18, -14], [-18, 14], [5, 14], [-5, -14]]) { box(1.2, 0.8, 1.2, mat(0x4a4a4e), x, 0.4, z, 0); tree(x, z, 0.6, 0.8); }
    // stair huts = exits
    for (const x of [-17.5, 17.5]) { box(3, 2.8, 2.4, mat(0x6a6e74), x, 1.4, -D / 2 + 1.4, 0); obstacle(x, -D / 2 + 1.4, 3, 2.4, 0.2); }
    exitAt(-17.5, -D / 2 + 3.2); exitAt(17.5, -D / 2 + 3.2); exitAt(-W / 2 + 1, 14);
    cctv(-19.4, 4, 3.5); cctv(19.4, -2, 3.5); cctv(4, 15.6, 3.5);
    // city below: grid of buildings and lit streets
    for (let gx = -6; gx <= 6; gx++) for (let gz = -3; gz <= 8; gz++) {
      const x = gx * 26, z = gz * 26;
      if (Math.abs(x) < 30 && Math.abs(z) < 30) continue;
      if (Math.abs(x) < 20 && z < -20 && z > -50) continue;
      const h = 15 + r() * 55;
      building(x + (r() - 0.5) * 4, z + (r() - 0.5) * 4, 14 + r() * 6, 14 + r() * 6, h, (r() * 6) | 0);
    }
  }

  // ---------- surrounding buildings (all ground venues)
  if (kind !== 'party') {
    const gaps = V.exits.map((e) => e);
    const along = (x0, x1, z, depth, facing) => {
      let x = x0;
      while (x < x1) {
        const w = 7 + r() * 9; const cx = x + w / 2;
        const blocked = gaps.some((g) => facing === 'z' ? Math.abs(g.z - z) < 12 && Math.abs(g.x - cx) < w / 2 + 3 : false);
        if (!blocked) building(cx, z, w - 0.4, depth, 12 + r() * 20, (r() * 6) | 0);
        x += w;
      }
    };
    const alongZ = (z0, z1, x, depth) => {
      let z = z0;
      while (z < z1) {
        const w = 7 + r() * 9; const cz = z + w / 2;
        const blocked = gaps.some((g) => Math.abs(g.x - x) < 14 && Math.abs(g.z - cz) < w / 2 + 3);
        if (!blocked) building(x, cz, depth, w - 0.4, 12 + r() * 20, (r() * 6) | 0);
        z += w;
      }
    };
    const far = kind === 'harbour' ? null : kind === 'station' ? D / 2 + 14 : D / 2 + 10;
    if (far !== null) along(-W / 2 - 14, W / 2 + 14, far, 12, 'z');
    alongZ(-D / 2 - 20, kind === 'harbour' ? 10 : D / 2 + 6, -W / 2 - 10, 12);
    alongZ(-D / 2 - 20, kind === 'harbour' ? 10 : D / 2 + 6, W / 2 + 10, 12);
    // far skyline
    for (let i = 0; i < 26; i++) { const a = -1.1 + (i / 25) * 2.2; const R = 150 + r() * 80; building(Math.sin(a) * R, Math.cos(a) * R + 20, 18 + r() * 14, 18 + r() * 14, 20 + r() * 60, (r() * 6) | 0); }
  }

  // ---------- the sniper's own rooftop (foreground)
  const cp = V.camPos;
  const roofY = cp.y - 1.0;
  const roofM = mat(0x6b6660), parM = mat(0x8c857a);
  box(30, 0.4, 12.4, roofM, cp.x, roofY - 0.2, cp.z - 6.0, 0, false);
  box(30.6, 0.4, 0.22, parM, cp.x, roofY + 0.2, cp.z + 0.16, 0); // parapet the rifle rests on
  box(0.35, 0.5, 12.6, parM, cp.x - 15, roofY + 0.25, cp.z - 5.7, 0); box(0.35, 0.5, 12.6, parM, cp.x + 15, roofY + 0.25, cp.z - 5.7, 0);
  box(2.4, 1.6, 1.8, mat(0x9a9ea2, { m: 0.3, r: 0.6 }), cp.x - 9, roofY + 0.8, cp.z - 1.5, 0);
  box(1.2, 2.6, 1.2, mat(0x5a5e62), cp.x + 10, roofY + 1.3, cp.z - 2, 0);
  const bodyH = roofY - baseY;
  building(cp.x, cp.z - 6.0, 30, 12.4, bodyH - 0.4, 2, baseY, false);

  // ---------- night lamps: a few real point lights for warm pools
  if (T.lamps) {
    const L = V.lamps.slice(0, 6);
    for (const h of L) { const pl = new THREE.PointLight(0xffc880, todName === 'night' ? 26 : 14, 14, 1.5); pl.position.copy(h.position); pl.position.y -= 0.3; root.add(pl); V.lights.push(pl); }
  }

  // ---------- rain
  if (T.rain) {
    const N = 4000; const pos = new Float32Array(N * 6);
    for (let i = 0; i < N; i++) { const x = (r() - 0.5) * (W + 20), y = r() * 30, z = (r() - 0.5) * (D + 20) - 4; pos.set([x, y, z, x + 0.05, y - 0.7, z + 0.02], i * 6); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: 0xc8d4e0, transparent: true, opacity: 0.35 })); root.add(rain);
    V.updaters.push((t, dt) => { const a = g.attributes.position.array; for (let i = 0; i < N; i++) { let y = a[i * 6 + 1] - dt * 22; if (y < 0) y += 30; a[i * 6 + 1] = y; a[i * 6 + 4] = y - 0.7; } g.attributes.position.needsUpdate = true; });
  }

  // CCTV LEDs blink
  V.updaters.push((t) => { const on = Math.sin(t * 3) > 0; for (const c of V.cams) c.led.visible = on; });

  // siren light (shown during the siren event)
  const sirenL = new THREE.PointLight(0xff2020, 0, 40, 1.2); root.add(sirenL); V.siren = sirenL;
  V.sirenAt = V.exits[0];
  sirenL.position.set(V.sirenAt.x * 1.1, 3, V.sirenAt.z);

  // chat spots: open ground
  V.isFree = (x, z, pad = 0) => x > V.walk.x0 + pad && x < V.walk.x1 - pad && z > V.walk.z0 + pad && z < V.walk.z1 - pad && !V.obstacles.some((o) => x > o.x0 - pad && x < o.x1 + pad && z > o.z0 - pad && z < o.z1 + pad);
  V.randomFree = (rr, pad = 0.5) => { for (let i = 0; i < 200; i++) { const x = rr.range(V.walk.x0, V.walk.x1), z = rr.range(V.walk.z0, V.walk.z1); if (V.isFree(x, z, pad)) return { x, z }; } return { x: 0, z: -V.D / 2 + 3 }; };
  for (let i = 0; i < 18; i++) V.spots.chat.push(V.randomFree(r, 1.6));

  // ---------- merge every static mesh that shares a material into one draw call
  mergeStatic(root);

  V.update = (t, dt) => { for (const u of V.updaters) u(t, dt); };
  V.exposure = T.exp;
  V.dispose = () => { scene.remove(root); root.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); };
  return V;
}

// Bake static meshes (world transform applied) into one mesh per material + shadow flags.
// Objects flagged userData.dyn (or under a flagged group) are left alone.
function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map(), victims = [];
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || !o.visible) return;
    for (let a = o; a && a !== root; a = a.parent) if (a.userData.dyn) return;
    const g = o.geometry, at = g.attributes;
    if (!at.position || !at.normal || !at.uv || at.color) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m.isShaderMaterial || m.vertexColors)) return;
    victims.push(o);
    const total = g.index ? g.index.count : at.position.count;
    const groups = Array.isArray(o.material) ? g.groups : [{ start: 0, count: total, materialIndex: 0 }];
    const mw = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const nm = new THREE.Matrix3().getNormalMatrix(mw);
    for (const gr of groups) {
      const m = mats[gr.materialIndex]; if (!m) continue;
      const key = m.uuid + '|' + o.castShadow + '|' + o.receiveShadow;
      let b = buckets.get(key); if (!b) buckets.set(key, (b = { m, cast: o.castShadow, recv: o.receiveShadow, parts: [], n: 0 }));
      const count = Math.min(gr.count, total - gr.start);
      b.parts.push({ g, mw, nm, start: gr.start, count }); b.n += count;
    }
  });
  for (const o of victims) o.parent.remove(o);
  const v = new THREE.Vector3();
  for (const b of buckets.values()) {
    const pos = new Float32Array(b.n * 3), nor = new Float32Array(b.n * 3), uv = new Float32Array(b.n * 2);
    let k = 0;
    for (const p of b.parts) {
      const A = p.g.attributes, idx = p.g.index;
      for (let j = p.start; j < p.start + p.count; j++, k++) {
        const vi = idx ? idx.getX(j) : j;
        v.fromBufferAttribute(A.position, vi).applyMatrix4(p.mw); pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
        v.fromBufferAttribute(A.normal, vi).applyMatrix3(p.nm).normalize(); nor[k * 3] = v.x; nor[k * 3 + 1] = v.y; nor[k * 3 + 2] = v.z;
        uv[k * 2] = A.uv.getX(vi); uv[k * 2 + 1] = A.uv.getY(vi);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const me = new THREE.Mesh(g, b.m); me.castShadow = b.cast; me.receiveShadow = b.recv; me.matrixAutoUpdate = false;
    root.add(me);
  }
}
