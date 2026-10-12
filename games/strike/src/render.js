// three.js neon bowling alley: lane, gutters, pins, ball, fake planar reflections, cameras.
import * as THREE from '../vendor/three.module.js';
import { L, PIN_SPOTS } from './physics.js';

const LANE_W = 1.054, LANE_LEN = 19.25, GUT_R = 0.12, CAP_W = 0.3;
const PITCH = LANE_W + GUT_R * 2 * 2 + CAP_W; // lane to lane spacing (approx)

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function laneTexture() {
  const W = 256, H = 2048, c = canvas(W, H), g = c.getContext('2d');
  // maple base with a warm gradient (pin deck end is lighter)
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#f2c98e'); grd.addColorStop(0.07, '#e9b977'); grd.addColorStop(0.08, '#d9a463'); grd.addColorStop(1, '#c98c4c');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  // grain streaks
  let seed = 7; const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1400; i++) {
    const x = r() * W, y = r() * H, len = 40 + r() * 260;
    g.strokeStyle = `rgba(${120 + r() * 40},${60 + r() * 30},${20},${0.04 + r() * 0.07})`;
    g.lineWidth = 0.6 + r() * 1.2; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 2, y + len); g.stroke();
  }
  // 39 boards
  const bw = W / 39;
  for (let i = 0; i < 39; i++) {
    g.fillStyle = `rgba(${r() > 0.5 ? '255,230,190' : '120,60,20'},${0.04 + r() * 0.05})`; g.fillRect(i * bw, 0, bw, H);
    g.fillStyle = 'rgba(90,45,15,0.35)'; g.fillRect(i * bw, 0, 0.8, H);
  }
  // board joints on the deck / head (staggered)
  for (let i = 0; i < 39; i++) for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(90,45,15,0.35)'; g.fillRect(i * bw, ((i * 37 + k * 700) % H), bw, 1); }
  const zy = (z) => H * (1 - (-z) / LANE_LEN);
  const bx = (board) => W - board * bw + bw / 2; // boards counted from the right
  // target arrows at 15 ft (V shape), boards 5..35 step 5
  for (let b = 5; b <= 35; b += 5) {
    const off = Math.abs(b - 20) / 5, y = zy(-(4.57 + off * 0.3));
    g.fillStyle = '#18111f'; g.beginPath(); g.moveTo(bx(b), y - 26); g.lineTo(bx(b) - 4.5, y + 8); g.lineTo(bx(b) + 4.5, y + 8); g.closePath(); g.fill();
    g.fillStyle = '#ff3ad6'; g.beginPath(); g.moveTo(bx(b), y - 22); g.lineTo(bx(b) - 2.5, y + 5); g.lineTo(bx(b) + 2.5, y + 5); g.closePath(); g.fill();
  }
  // dots at 7 ft
  for (const b of [3, 5, 8, 11, 14, 26, 29, 32, 35, 37]) { g.fillStyle = '#18111f'; g.beginPath(); g.arc(bx(b), zy(-2.13), 3, 0, 7); g.fill(); }
  // pin spots
  for (const s of PIN_SPOTS) { g.fillStyle = 'rgba(60,20,40,0.55)'; g.beginPath(); g.ellipse((s.x / LANE_W + 0.5) * W, zy(s.z), 7, 1.2, 0, 0, 7); g.fill(); }
  // foul line
  g.fillStyle = '#ff2b5a'; g.fillRect(0, H - 4, W, 4);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}

function approachTexture() {
  const c = canvas(256, 256), g = c.getContext('2d');
  g.fillStyle = '#b07a44'; g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 39; i++) { g.fillStyle = `rgba(90,45,15,${0.2 + (i % 3) * 0.08})`; g.fillRect(i * 256 / 39, 0, 1, 256); }
  for (const x of [0.2, 0.35, 0.5, 0.65, 0.8]) { g.fillStyle = '#1a1022'; g.beginPath(); g.arc(x * 256, 140, 4, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function glowTexture(inner = 'rgba(255,255,255,1)') {
  const c = canvas(128, 128), g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, inner); r.addColorStop(0.35, 'rgba(255,255,255,0.35)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}
function stripTexture() { // soft horizontal band for neon tube glow
  const c = canvas(4, 64), g = c.getContext('2d');
  const r = g.createLinearGradient(0, 0, 0, 64);
  r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.5, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 4, 64); return new THREE.CanvasTexture(c);
}
function shadowTexture() {
  const c = canvas(64, 64), g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(0.6, 'rgba(0,0,0,0.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
}

function maskingTexture() {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#12062a'); bg.addColorStop(1, '#2a0a45');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // starfield
  let s = 3; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 160; i++) { g.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.6})`; g.fillRect(r() * W, r() * H, 2, 2); }
  const neon = (col, w, fn) => { g.save(); g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 28; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round'; fn(); g.restore(); g.save(); g.strokeStyle = '#fff'; g.lineWidth = w * 0.35; g.lineCap = 'round'; g.lineJoin = 'round'; fn(); g.restore(); };
  // sweeping orbit rings
  neon('#ff2bd6', 10, () => { g.beginPath(); g.ellipse(W / 2, H * 0.62, 430, 120, -0.05, 0, Math.PI * 2); g.stroke(); });
  neon('#2de2ff', 8, () => { g.beginPath(); g.ellipse(W / 2, H * 0.62, 360, 80, 0.06, 0, Math.PI * 2); g.stroke(); });
  // big bolt
  neon('#ffe14a', 12, () => { g.beginPath(); g.moveTo(560, 40); g.lineTo(470, 250); g.lineTo(540, 250); g.lineTo(450, 470); g.lineTo(640, 200); g.lineTo(565, 200); g.lineTo(640, 40); g.closePath(); g.stroke(); });
  // little pins silhouettes
  for (const [x, col] of [[180, '#2de2ff'], [260, '#ff2bd6'], [764, '#ff2bd6'], [844, '#2de2ff']]) neon(col, 7, () => { g.beginPath(); g.moveTo(x, 420); g.quadraticCurveTo(x - 34, 330, x - 12, 280); g.quadraticCurveTo(x - 4, 250, x - 12, 225); g.arc(x, 215, 13, Math.PI * 0.85, Math.PI * 0.15); g.quadraticCurveTo(x + 4, 250, x + 12, 280); g.quadraticCurveTo(x + 34, 330, x, 420); g.stroke(); });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ceilingTexture() {
  const W = 256, H = 160, c = canvas(W, H), g = c.getContext('2d');
  const neon = (col, w, x, y, ww, hh) => { g.save(); g.strokeStyle = col; g.shadowColor = col; g.shadowBlur = 16; g.lineWidth = w; g.strokeRect(x, y, ww, hh); g.restore(); g.save(); g.strokeStyle = '#fff'; g.lineWidth = w * 0.35; g.strokeRect(x, y, ww, hh); g.restore(); };
  g.fillStyle = 'rgba(40,10,70,0.55)'; g.fillRect(14, 14, W - 28, H - 28);
  neon('#ff2bd6', 7, 14, 14, W - 28, H - 28); neon('#2de2ff', 5, 34, 34, W - 68, H - 68);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function monitorTexture() {
  const W = 512, H = 216, c = canvas(W, H), g = c.getContext('2d');
  const bg = g.createLinearGradient(0, 0, W, H); bg.addColorStop(0, '#1a0638'); bg.addColorStop(1, '#06203a'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  g.font = 'italic 900 92px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = '#ff2bd6'; g.shadowBlur = 24; g.fillStyle = '#fff'; g.fillText('STRIKE', W / 2, H / 2 - 12);
  g.shadowBlur = 0; g.font = '700 26px system-ui, sans-serif'; g.fillStyle = '#5cf0ff'; g.fillText('NEON  LANES', W / 2, H - 34);
  for (let x = 0; x < W; x += 4) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, x, W, 1); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function ballTexture(a, b) {
  const W = 512, H = 256, c = canvas(W, H), g = c.getContext('2d');
  const ca = new THREE.Color(a), cb = new THREE.Color(b);
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = x / W * Math.PI * 2, v = y / H * Math.PI;
    const n = Math.sin(u * 3 + Math.sin(v * 4 + u) * 2.2) + Math.sin(v * 5 - u * 2 + Math.sin(u * 5) * 0.8) * 0.7 + Math.sin((u + v) * 7) * 0.25;
    let t = 0.5 + 0.5 * Math.tanh(n * 1.6);
    const sparkle = ((x * 73856093 ^ y * 19349663) % 997) / 997 > 0.996 ? 0.6 : 0;
    const i = (y * W + x) * 4;
    img.data[i] = Math.min(255, (cb.r + (ca.r - cb.r) * t + sparkle) * 255);
    img.data[i + 1] = Math.min(255, (cb.g + (ca.g - cb.g) * t + sparkle) * 255);
    img.data[i + 2] = Math.min(255, (cb.b + (ca.b - cb.b) * t + sparkle) * 255);
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  // finger holes
  g.fillStyle = '#05030a';
  for (const [x, y, r] of [[118, 78, 13], [148, 70, 13], [132, 120, 16]]) { g.beginPath(); g.ellipse(x, y, r * 0.6, r, 0, 0, 7); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function pinGeometry(step = 0.006, segs = 40) {
  // profile (y, r) in metres - regulation-ish pin, 15 in tall, 4.77 in belly
  const prof = [[0, 0], [0, 0.026], [0.012, 0.031], [0.05, 0.047], [0.1, 0.058], [0.14, 0.0605], [0.18, 0.057], [0.22, 0.046], [0.255, 0.032], [0.275, 0.025], [0.29, 0.0235], [0.31, 0.025], [0.335, 0.0285], [0.355, 0.0275], [0.37, 0.021], [0.378, 0.011], [0.381, 0]];
  // densify (Catmull-ish linear resample) + add sharp stripe boundaries
  const ys = [];
  for (let y = 0; y <= 0.381; y += step) ys.push(y);
  for (const b of [0.262, 0.272, 0.283, 0.295]) { ys.push(b - 0.0004, b + 0.0004); }
  ys.push(0.381); ys.sort((a, b) => a - b);
  const rAt = (y) => { for (let i = 1; i < prof.length; i++) if (y <= prof[i][0] && prof[i][0] > prof[i - 1][0]) { const t = (y - prof[i - 1][0]) / (prof[i][0] - prof[i - 1][0]); const s = t * t * (3 - 2 * t) * 0.3 + t * 0.7; return prof[i - 1][1] + (prof[i][1] - prof[i - 1][1]) * s; } return 0; };
  const pts = [new THREE.Vector2(0, 0)].concat(ys.map((y) => new THREE.Vector2(Math.max(0.0005, rAt(Math.max(y, 0.0001))), y)));
  pts[pts.length - 1].x = 0.0005;
  const geo = new THREE.LatheGeometry(pts, segs);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i); const red = (y > 0.262 && y < 0.272) || (y > 0.283 && y < 0.295);
    col[i * 3] = red ? 0.85 : 0.97; col[i * 3 + 1] = red ? 0.04 : 0.96; col[i * 3 + 2] = red ? 0.12 : 0.95;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}

function envMap(renderer) {
  const s = new THREE.Scene();
  s.background = new THREE.Color('#07040f');
  const add = (w, h, x, y, z, col, ry = 0, rx = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: col, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; m.rotation.x = rx; s.add(m); };
  add(30, 1.2, 0, 6, -6, new THREE.Color(2.2, 2.2, 2.4), 0, Math.PI / 2); // ceiling light strip
  add(30, 0.8, 0, 6, 0, new THREE.Color(2, 2, 2.2), 0, Math.PI / 2);
  add(20, 1.2, -8, 2, 0, new THREE.Color(2.6, 0.3, 2.2), Math.PI / 2);
  add(20, 1.2, 8, 2, 0, new THREE.Color(0.3, 2.2, 2.8), -Math.PI / 2);
  add(10, 3, 0, 2, -12, new THREE.Color(1.2, 0.5, 2.0));
  add(10, 3, 0, 2, 12, new THREE.Color(0.6, 0.3, 1.0), Math.PI);
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(s, 0.03); pm.dispose();
  return rt.texture;
}

export class Renderer {
  constructor(container) {
    const r = this.r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(r.domElement);
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color('#090514');
    scene.fog = new THREE.Fog('#090514', 22, 48);
    scene.environment = envMap(r);
    this.cam = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
    this.camPos = new THREE.Vector3(0, 1.0, 2.4); this.camLook = new THREE.Vector3(0, 0, -14);
    this.shake = 0; this.time = 0;
    this.tex = { glow: glowTexture(), strip: stripTexture(), shadow: shadowTexture() };
    this.build();
    this.resize();
  }

  build() {
    const S = this.scene;
    S.add(new THREE.HemisphereLight('#6a4cff', '#1a0820', 0.7));
    const key = new THREE.DirectionalLight('#ffffff', 1.4); key.position.set(1.5, 6, 4); S.add(key);
    const deck = new THREE.SpotLight('#fff2e0', 40, 8, 0.75, 0.6, 1.2); deck.position.set(0, 3.2, -16.6); deck.target.position.set(0, 0, -18.8); S.add(deck, deck.target);
    for (const [x, z, c] of [[-1.2, -6, '#ff2bd6'], [1.2, -6, '#2de2ff'], [-1.2, -14, '#ff2bd6'], [1.2, -14, '#2de2ff']]) { const p = new THREE.PointLight(c, 3, 7, 1.5); p.position.set(x, 0.6, z); S.add(p); }

    const laneTex = laneTexture();
    this.laneMat = new THREE.MeshPhysicalMaterial({ map: laneTex, roughness: 0.2, clearcoat: 0.75, clearcoatRoughness: 0.05, transparent: true, opacity: 0.8, envMapIntensity: 0.45 });
    // neighbour lanes use Phong (no env-map sampling): they fill most of the screen and the PBR + PMREM shader was the frame-time hog
    const sideLaneMat = new THREE.MeshPhongMaterial({ map: laneTex, color: '#8a7064', specular: '#2a2018', shininess: 18 });
    const appMat = new THREE.MeshStandardMaterial({ map: approachTexture(), roughness: 0.35, envMapIntensity: 0.7 });
    appMat.map.wrapS = appMat.map.wrapT = THREE.RepeatWrapping; appMat.map.repeat.set(1, 3);
    const gutMat = new THREE.MeshStandardMaterial({ color: '#1c1530', metalness: 0.55, roughness: 0.32, envMapIntensity: 0.55, side: THREE.DoubleSide });
    const sideGutMat = new THREE.MeshPhongMaterial({ color: '#1c1530', specular: '#6a5a9a', shininess: 50, side: THREE.DoubleSide });
    const sideAppMat = new THREE.MeshPhongMaterial({ map: appMat.map, specular: '#3a2a1a', shininess: 30 });
    const capMat = new THREE.MeshPhongMaterial({ color: '#16101f', specular: '#3a3050', shininess: 40 });
    const pinMat = this.pinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05 });
    this.pinGeo = pinGeometry(0.01, 28); // main pins: ~2.6k tris each
    const farPinGeo = pinGeometry(0.024, 14); // neighbour lanes: seen small, ~600 tris, one instanced draw
    const farPinMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.3, envMapIntensity: 0.8 });
    const farPins = new THREE.InstancedMesh(farPinGeo, farPinMat, 6 * PIN_SPOTS.length); let farN = 0; const fm = new THREE.Matrix4();
    const black = new THREE.MeshBasicMaterial({ color: '#030106' });

    // dark floor under everything (what the transparent lane shows through)
    const under = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), black); under.rotation.x = -Math.PI / 2; under.position.set(0, -0.7, -10); S.add(under);

    const neons = ['#ff2bd6', '#2de2ff'];
    for (let li = -3; li <= 3; li++) {
      const x0 = li * PITCH, main = li === 0;
      const lane = new THREE.Mesh(new THREE.PlaneGeometry(LANE_W, LANE_LEN), main ? this.laneMat : sideLaneMat);
      lane.rotation.x = -Math.PI / 2; lane.position.set(x0, 0, -LANE_LEN / 2); S.add(lane);
      const app = new THREE.Mesh(new THREE.PlaneGeometry(PITCH, 6), main ? appMat : sideAppMat); app.rotation.x = -Math.PI / 2; app.position.set(x0, -0.001, 3); S.add(app);
      for (const sx of [-1, 1]) {
        const g = new THREE.Mesh(new THREE.CylinderGeometry(GUT_R, GUT_R, LANE_LEN, main ? 24 : 12, 1, true, -Math.PI / 2, Math.PI), main ? gutMat : sideGutMat);
        g.rotation.x = Math.PI / 2; g.rotation.y = 0; g.position.set(x0 + sx * (LANE_W / 2 + GUT_R), 0, -LANE_LEN / 2);
        // open side up: cylinder theta measured from +z; after rotation.x the open half must face +y
        S.add(g);
        // neon edge along the gutter lip
        const col = neons[(sx + 1) / 2];
        const tube = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, LANE_LEN), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(main ? 2.2 : 1.2) }));
        tube.position.set(x0 + sx * (LANE_W / 2 + GUT_R * 2 + 0.012), 0.02, -LANE_LEN / 2); S.add(tube);
        const glow = new THREE.Mesh(new THREE.PlaneGeometry(0.22, LANE_LEN), new THREE.MeshBasicMaterial({ color: col, map: this.tex.strip, transparent: true, opacity: main ? 0.55 : 0.3, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.material.map = this.stripH || (this.stripH = (() => { const t = this.tex.strip.clone(); t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; t.needsUpdate = true; return t; })());
        glow.rotation.x = -Math.PI / 2; glow.position.set(tube.position.x, 0.025, tube.position.z); S.add(glow);
      }
      // ball return cap between lanes (every other gap)
      const cap = new THREE.Mesh(new THREE.BoxGeometry(CAP_W, 0.05, LANE_LEN), capMat); cap.position.set(x0 + PITCH / 2, 0.0, -LANE_LEN / 2); S.add(cap);
      // kickbacks and pit
      for (const sx of [-1, 1]) {
        const kb = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.75, 2.6), capMat); kb.position.set(x0 + sx * (L.wallX + 0.06), 0.37, -18.6); S.add(kb);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 2.6), new THREE.MeshBasicMaterial({ color: new THREE.Color(neons[(sx + 1) / 2]).multiplyScalar(2) })); edge.position.set(kb.position.x, 0.75, -18.6); S.add(edge);
      }
      const pit = new THREE.Mesh(new THREE.BoxGeometry(PITCH, 0.02, 1.4), black); pit.position.set(x0, -0.25, -L.pitZ * -1 - 0.75); S.add(pit);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(PITCH, 0.9), new THREE.MeshStandardMaterial({ color: '#0d0618', roughness: 0.9 })); curtain.position.set(x0, 0.2, -20.3); S.add(curtain);
      // masking unit art
      const mask = new THREE.Mesh(new THREE.PlaneGeometry(PITCH - 0.04, 1.3), new THREE.MeshBasicMaterial({ map: this.maskTex || (this.maskTex = maskingTexture()), color: main ? '#ffffff' : '#9a8aa8' }));
      mask.position.set(x0, 1.38, -19.0); S.add(mask);
      // static pins on the neighbour lanes
      if (!main) for (const sp of PIN_SPOTS) { fm.makeTranslation(x0 + sp.x, 0, sp.z); farPins.setMatrixAt(farN++, fm); }
      // light pool on the deck
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 2.2), new THREE.MeshBasicMaterial({ map: this.tex.glow, color: '#ffd9b0', transparent: true, opacity: main ? 0.22 : 0.12, blending: THREE.AdditiveBlending, depthWrite: false }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x0, 0.004, -18.6); S.add(pool);
    }
    S.add(farPins);
    // ceiling with light strips + back wall glow
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshStandardMaterial({ color: '#120a20', roughness: 1 })); ceil.rotation.x = Math.PI / 2; ceil.position.set(0, 2.6, -10); S.add(ceil);
    const panelTex = ceilingTexture();
    for (let li = -3; li <= 3; li++) for (const z of [-0.6, -6.5, -10.5]) { const pn = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.9), new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, color: li === 0 ? '#ffffff' : '#9a8ab8' })); pn.rotation.x = Math.PI / 2; pn.position.set(li * PITCH, 2.58, z); S.add(pn); }
    for (let z = 0; z > -22; z -= 3.2) { const st = new THREE.Mesh(new THREE.PlaneGeometry(14, 0.08), new THREE.MeshBasicMaterial({ color: '#b8a8ff' })); st.rotation.x = Math.PI / 2; st.position.set(0, 2.58, z); S.add(st); }
    // hanging overhead score monitors + neon arch over the lanes (fills the top of a portrait screen)
    const monTex = monitorTexture();
    for (let li = -3; li <= 3; li++) {
      const mon = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.06), new THREE.MeshStandardMaterial({ color: '#0c0716', roughness: 0.4 }));
      mon.position.set(li * PITCH, 2.25, -3.2); mon.rotation.x = 0.12; S.add(mon);
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.42), new THREE.MeshBasicMaterial({ map: monTex, color: li === 0 ? '#ffffff' : '#8a7aa0' }));
      scr.position.set(0, 0, 0.045); mon.add(scr);
      const back = new THREE.Mesh(scr.geometry, scr.material); back.position.set(0, 0, -0.045); back.rotateY(Math.PI); mon.add(back);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.4), capMat); rod.position.set(li * PITCH, 2.6, -3.2); S.add(rod);
    }
    for (const [y, col] of [[2.2, '#ff2bd6'], [2.32, '#2de2ff']]) { const arch = new THREE.Mesh(new THREE.BoxGeometry(16, 0.025, 0.025), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(2) })); arch.position.set(0, y, -19.05); S.add(arch); }
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 3), new THREE.MeshBasicMaterial({ color: '#160828' })); wall.position.set(0, 1.4, -20.4); S.add(wall);

    // main pins + reflections
    this.pins = []; this.pinRefl = []; this.pinShadow = [];
    const shMat = new THREE.MeshBasicMaterial({ map: this.tex.shadow, transparent: true, depthWrite: false });
    const reflMat = pinMat.clone(); reflMat.color = new THREE.Color('#9a8aa0');
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(this.pinGeo, pinMat); S.add(m); this.pins.push(m);
      const rm = new THREE.Mesh(this.pinGeo, reflMat); S.add(rm); this.pinRefl.push(rm);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), shMat); sh.rotation.x = -Math.PI / 2; S.add(sh); this.pinShadow.push(sh);
    }
    // ball
    this.ballGeo = new THREE.SphereGeometry(L.ballR, 48, 32);
    this.ballMat = new THREE.MeshPhysicalMaterial({ roughness: 0.18, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.3 });
    this.ball = new THREE.Mesh(this.ballGeo, this.ballMat); S.add(this.ball);
    this.ballRefl = new THREE.Mesh(this.ballGeo, this.ballMat.clone()); this.ballRefl.material.color = new THREE.Color('#8a7a90'); S.add(this.ballRefl);
    this.ballShadow = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), shMat); this.ballShadow.rotation.x = -Math.PI / 2; S.add(this.ballShadow);
    this.ballGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.6), new THREE.MeshBasicMaterial({ map: this.tex.glow, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ballGlow.rotation.x = -Math.PI / 2; S.add(this.ballGlow);
    this.ballQ = new THREE.Quaternion();
    // aim arrow
    const ac = canvas(64, 512), ag = ac.getContext('2d');
    const grd = ag.createLinearGradient(0, 512, 0, 0); grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    ag.fillStyle = grd; for (let y = 60; y < 512; y += 46) { ag.beginPath(); ag.moveTo(32, y - 26); ag.lineTo(12, y); ag.lineTo(22, y); ag.lineTo(22, y + 14); ag.lineTo(42, y + 14); ag.lineTo(42, y); ag.lineTo(52, y); ag.closePath(); ag.fill(); }
    const at = new THREE.CanvasTexture(ac);
    this.arrow = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 10), new THREE.MeshBasicMaterial({ map: at, color: '#5cf0ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.arrow.geometry.translate(0, 5, 0); this.arrow.rotation.order = 'YXZ';
    S.add(this.arrow); this.arrow.visible = false;
    // predicted path dots
    this.pathDots = [];
    const dotMat = new THREE.MeshBasicMaterial({ map: this.tex.glow, color: '#5cf0ff', transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 60; i++) { const d = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.09), dotMat.clone()); d.rotation.x = -Math.PI / 2; d.visible = false; S.add(d); this.pathDots.push(d); }
    // pinsetter sweep bar
    this.sweep = new THREE.Group();
    const bar = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.5, 0.22, 0.05), new THREE.MeshStandardMaterial({ color: '#1d1430', metalness: 0.6, roughness: 0.3 }));
    const barGlow = new THREE.Mesh(new THREE.BoxGeometry(LANE_W + 0.5, 0.02, 0.06), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffe14a').multiplyScalar(2) }));
    barGlow.position.y = -0.11; this.sweep.add(bar, barGlow); this.sweep.position.set(0, 1.2, -17.9); S.add(this.sweep);
  }

  setPath(pts) {
    for (let i = 0; i < this.pathDots.length; i++) {
      const d = this.pathDots[i], p = pts && pts[i];
      d.visible = !!p; if (!p) continue;
      d.position.set(p.x, 0.008, p.z);
      const far = Math.min(1, Math.max(0, (-p.z - 9) / 9));
      d.material.opacity = (p.gutter ? 0.25 : 0.95) * (1 - far * 0.75);
      d.material.color.set(p.gutter ? '#ff4a6a' : '#5cf0ff');
      const sc = 1 + (-p.z) * 0.05; d.scale.setScalar(sc);
    }
  }

  setBall(skin) {
    if (this.ballMat.map) this.ballMat.map.dispose();
    this.ballMat.map = ballTexture(skin.a, skin.b); this.ballMat.needsUpdate = true;
    this.ballRefl.material.map = this.ballMat.map; this.ballRefl.material.needsUpdate = true;
    this.ballGlow.material.color.set(skin.glow);
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.r.setSize(w, h, false); this.r.domElement.style.width = w + 'px'; this.r.domElement.style.height = h + 'px';
    this.w = w; this.h = h;
    const aspect = w / h; this.cam.aspect = aspect;
    // keep ~34 deg of horizontal view in portrait; cap vertical fov in landscape
    const hf = 31 * Math.PI / 180, vf = 2 * Math.atan(Math.tan(hf / 2) / aspect) * 180 / Math.PI;
    this.baseFov = Math.max(36, Math.min(72, vf));
    this.cam.fov = this.baseFov; this.cam.updateProjectionMatrix();
  }

  // pose all meshes from the sim. vis: { pinsDrop, sweepY, hideFallen, aim:{x,angle} }
  sync(sim, ballState, dt, vis = {}) {
    this.time += dt;
    const byN = new Map(sim.pins.map((p) => [p.n, p]));
    const q = new THREE.Quaternion(), ax = new THREE.Vector3();
    for (let i = 0; i < 10; i++) {
      const m = this.pins[i], rm = this.pinRefl[i], sh = this.pinShadow[i];
      const p = byN.get(i + 1);
      const show = !!p && !(p.gone && p.y < -0.6) && !(vis.hideFallen && sim.isDown(p));
      m.visible = rm.visible = sh.visible = show;
      if (!show) continue;
      if (p.gone && p.y > -1) { p.y -= dt * 2.5; }
      ax.set(p.dz, 0, -p.dx).normalize();
      q.setFromAxisAngle(ax, p.th);
      if (p.down) { const sq = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(p.dx, 0, p.dz), p.spinY); q.premultiply(sq); }
      const drop = vis.pinsDrop || 0, yy = p.y + Math.sin(p.th) * 0.061 + drop + (p.gutter ? -0.07 : 0);
      const fade = vis.fallScale !== undefined && sim.isDown(p) ? vis.fallScale : 1;
      m.position.set(p.x, yy, p.z); m.quaternion.copy(q); m.scale.setScalar(fade);
      rm.visible = show && !p.gone && !p.gutter && p.z > L.deckEnd;
      rm.position.set(p.x, -yy, p.z); rm.quaternion.set(-q.x, q.y, -q.z, q.w); rm.scale.set(fade, -fade, fade);
      sh.position.set(p.x + p.dx * Math.sin(p.th) * 0.15, 0.003, p.z + p.dz * Math.sin(p.th) * 0.15); sh.scale.setScalar(1 + Math.sin(p.th) * 0.8);
      sh.visible = show && !p.gone && drop < 0.05;
    }
    const b = ballState;
    this.ball.visible = this.ballRefl.visible = this.ballShadow.visible = this.ballGlow.visible = !!b && !b.hidden;
    if (b && !b.hidden) {
      const y = b.y !== undefined ? b.y : L.ballR;
      // roll: integrate rotation from motion
      const mx = b.x - (this._bx ?? b.x), mz = b.z - (this._bz ?? b.z); this._bx = b.x; this._bz = b.z;
      const dist = Math.hypot(mx, mz);
      if (dist > 1e-5 && dist < 1) {
        const axis = new THREE.Vector3(-mz, 0, mx).normalize(); // up x motion
        this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, dist / L.ballR));
      }
      if (b.spinVis) this.ballQ.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), b.spinVis * dt * 6));
      this.ball.position.set(b.x, y, b.z); this.ball.quaternion.copy(this.ballQ);
      const inLane = !b.gutter && b.z > L.deckEnd;
      this.ballRefl.visible = inLane; this.ballRefl.position.set(b.x, -y, b.z);
      this.ballRefl.quaternion.set(-this.ballQ.x, this.ballQ.y, -this.ballQ.z, this.ballQ.w); this.ballRefl.scale.set(1, -1, 1);
      this.ballShadow.position.set(b.x, b.gutter ? -0.1 : 0.003, b.z); this.ballShadow.visible = b.z > L.pitZ;
      this.ballGlow.position.set(b.x, b.gutter ? -0.09 : 0.005, b.z); this.ballGlow.material.opacity = 0.25 + Math.sin(this.time * 4) * 0.08;
    }
    // aim arrow
    if (vis.aim) {
      this.arrow.visible = true;
      this.arrow.position.set(vis.aim.x, 0.006, -0.55); this.arrow.rotation.set(0, 0, 0); this.arrow.rotateY(-vis.aim.angle); this.arrow.rotateX(-Math.PI / 2);
      this.arrow.material.opacity = vis.aim.alpha ?? 0.8;
    } else this.arrow.visible = false;
    this.sweep.position.y = vis.sweepY ?? 1.2; this.sweep.visible = this.sweep.position.y < 1.19;
  }

  // camera: target position and look point, smoothed
  camera(pos, look, k, dt) {
    const a = 1 - Math.exp(-k * dt);
    this.camPos.lerp(pos, a); this.camLook.lerp(look, a);
    const c = this.cam; c.position.copy(this.camPos);
    if (this.shake > 0.001) {
      const s = this.shake; c.position.x += (Math.random() - 0.5) * s * 0.06; c.position.y += (Math.random() - 0.5) * s * 0.05;
      this.shake *= Math.exp(-dt * 7);
    }
    c.lookAt(this.camLook);
  }
  snapCamera(pos, look) { this.camPos.copy(pos); this.camLook.copy(look); this.cam.position.copy(pos); this.cam.lookAt(look); }

  project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.cam);
    return { x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h, behind: v.z > 1 };
  }
  // screen -> point on lane plane (y=0)
  unproject(sx, sy) {
    const v = new THREE.Vector3((sx / this.w) * 2 - 1, -(sy / this.h) * 2 + 1, 0.5).unproject(this.cam);
    const d = v.sub(this.cam.position).normalize(); const t = -this.cam.position.y / d.y;
    return { x: this.cam.position.x + d.x * t, z: this.cam.position.z + d.z * t };
  }

  render() { this.r.render(this.scene, this.cam); }
}
export { THREE };
