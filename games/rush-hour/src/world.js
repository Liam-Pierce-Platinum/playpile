// ONE connected road for all ten stages. The centre line is integrated from a curvature profile
// (straights, sweepers, bends, S-curves, chicanes, hairpin switchbacks) sampled every metre, so the
// whole road is a few typed arrays. Meshes are built in 160 m chunks ahead of the player and disposed
// behind, so memory and frame time stay flat. Stage look (time of day, weather, theme, traffic) blends
// across each checkpoint.
// Road space: s = distance along the road, lat = metres right of the divider (lat 0). Same-direction
// lanes j = 0..3 sit at lat > 0 (j = 0 is the fast lane), oncoming lanes j = -1, -2 at lat < 0.
// World: forward at heading th is (sin th, 0, -cos th), right is (cos th, 0, sin th). Ground is flat.
import * as THREE from '../vendor/three.module.js';
import { boxesGeo } from './cars.js';
import { STAGES } from './stages.js';

export const LANE_W = 3.7;
const PRE = 500, POST = 1500, NS = STAGES.length;
const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a, b, t) => a + (b - a) * t;
export function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

// ---------------------------------------------------------------- the road
export function makeRoad() {
  const B = [0]; for (const st of STAGES) B.push(B[B.length - 1] + st.len);
  const END = B[NS], N = PRE + END + POST;
  const K = new Float32Array(N), BK = new Float32Array(N);
  const X = new Float64Array(N), Z = new Float64Array(N), TH = new Float64Array(N);
  const corners = [];
  const stageAt = (s) => { for (let i = NS - 1; i > 0; i--) if (s >= B[i]) return i; return 0; };

  // lane counts with tapers at the checkpoints (lanes that end close 90 m before it, new lanes open after)
  const laneCount = (s, nOf) => {
    const i = stageAt(s);
    for (const k of [i, i + 1]) {
      if (k < 1 || k >= NS) continue;
      const na = nOf(k - 1), nb = nOf(k), b = B[k];
      if (na > nb && s > b - 90 && s < b + 30) return lerp(na, nb, smooth((s - (b - 90)) / 120));
      if (nb > na && s > b - 30 && s < b + 90) return lerp(na, nb, smooth((s - (b - 30)) / 120));
    }
    return nOf(i);
  };
  const sameOf = (k) => STAGES[k].lanes, oncOf = (k) => STAGES[k].onc || 2;
  const sameN = (s) => laneCount(s, sameOf), oncN = (s) => laneCount(s, oncOf);
  const edgeR = (s) => sameN(s) * LANE_W, edgeL = (s) => -oncN(s) * LANE_W;
  // median wall on divided stages, with a 30 m crossover gap every 640 m
  const wall = (s) => { const i = stageAt(s); if (STAGES[i].onc) return false; const l = s - B[i]; return l < 0 || (l % 640) < 610; };

  // ---- grid of centre samples (every 4 m) for crossing checks and keeping scenery off the road
  const CELL = 40, grid = new Map();
  const gkey = (cx, cz) => (cx + 20000) * 40000 + (cz + 20000);
  const gridAdd = (i, list) => { const k = gkey(Math.floor(X[i] / CELL), Math.floor(Z[i] / CELL)); let a = grid.get(k); if (!a) grid.set(k, (a = [])); a.push(i); if (list) list.push(a); };
  function eachNear(x, z, rad, fn) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), r = Math.ceil(rad / CELL);
    for (let dx = -r; dx <= r; dx++) for (let dz = -r; dz <= r; dz++) { const a = grid.get(gkey(cx + dx, cz + dz)); if (a) for (const i of a) if (fn(i) === false) return; }
  }
  function integrate(a, b) { for (let i = Math.max(1, a); i < b; i++) { const k = K[i - 1], tm = TH[i - 1] + k * 0.5; X[i] = X[i - 1] + Math.sin(tm); Z[i] = Z[i - 1] - Math.cos(tm); TH[i] = TH[i - 1] + k; } }
  X[0] = 0; Z[0] = PRE; TH[0] = 0;

  function genStage(si, seed) {
    const st = STAGES[si], R = rng(seed);
    const a = B[si] + PRE, b = B[si + 1] + PRE;
    K.fill(0, a, b); BK.fill(0, a, b);
    const cs = [];
    let p = a + (si === 0 ? 240 : 170), th = TH[a];
    const stop = b - 260; // straight run-out into the next checkpoint
    const wR = st.lanes * LANE_W + 4.5, wL = (st.onc || 2) * LANE_W + 4.5;
    const minR = (d) => (d > 0 ? wR : wL) + 12;
    const arcLen = (Rr, ang, d) => ang * Math.max(Rr, minR(d)) + 2;
    const arc = (Rr, ang, d, bank, kind, sign) => {
      Rr = Math.max(Rr, minR(d));
      const k = d / Rr, len = ang * Rr, ramp = Math.min(50, len * 0.35), total = Math.round(len + ramp);
      for (let x = 0; x < total; x++) { const f = x < ramp ? x / ramp : x > total - ramp ? (total - x) / ramp : 1; K[p + x] = k * f; BK[p + x] = bank * f; }
      cs.push({ s0: p - PRE, s1: p + total - PRE, d, R: Rr, kind, sign });
      p += total; th += d * ang;
    };
    const pickDir = () => (Math.abs(th) > 0.35 ? (R() < 0.85 ? -Math.sign(th) : Math.sign(th)) : R() < 0.5 ? -1 : 1);
    const [wS, wB, wSc, wC, wH] = st.turns, tot = wS + wB + wSc + wC + wH, tg = st.tight, offc = si >= 4;
    while (p < stop) {
      p += Math.round(st.str[0] + R() * (st.str[1] - st.str[0]));
      let r = R() * tot; const d = pickDir();
      if ((r -= wS) < 0) {
        const Rr = (300 + R() * 120) * tg, an = 0.45 + R() * 0.45, ob = offc && R() < 0.5;
        if (p + arcLen(Rr, an, d) * 1.4 < stop) arc(Rr, an, d, ob ? d * 0.05 : -d * 0.035, ob ? 'offcamber' : 'sweeper', ob);
      } else if ((r -= wB) < 0) {
        const Rr = (115 + R() * 65) * tg, an = 0.8 + R() * 0.7, ob = offc && R() < 0.3;
        if (p + arcLen(Rr, an, d) * 1.4 < stop) arc(Rr, an, d, ob ? d * 0.04 : -d * 0.02, ob ? 'offcamber' : 'bend', true);
      } else if ((r -= wSc) < 0) {
        const Rr = (100 + R() * 50) * tg, an = 0.6 + R() * 0.35;
        if (p + (arcLen(Rr, an, d) + arcLen(Rr, an, -d)) * 1.4 + 20 < stop) { arc(Rr, an, d, 0, 'scurve', true); p += Math.round(R() * 20); arc(Rr, an, -d, 0, 'scurve', false); }
      } else if ((r -= wC) < 0) {
        const Rr = (55 + R() * 20) * tg, an = 0.38 + R() * 0.14;
        if (p + arcLen(Rr, an * 4, 1) * 1.6 < stop) { arc(Rr, an, d, 0, 'chicane', true); arc(Rr, an * 2, -d, 0, 'chicane', false); arc(Rr, an, d, 0, 'chicane', false); }
      } else { // hairpin switchback: there and back
        const Rr = (36 + R() * 8) * tg, an = 2.9 + R() * 0.24, d1 = Math.abs(th) > 0.3 ? -Math.sign(th) : d;
        if (p + (arcLen(Rr, an, d1) + arcLen(Rr, an, -d1)) * 1.4 + 200 < stop) { arc(Rr, an, d1, 0, 'hairpin', true); p += Math.round(110 + R() * 80); arc(Rr, an, -d1, 0, 'hairpin', true); }
      }
    }
    integrate(a, b + 1);
    // the road must never cross or crowd itself: every new sample keeps clear of all earlier road
    const thr = Math.max(40, wR + wL + 6), touched = [];
    for (let i = a; i < b; i += 4) {
      let bad = false;
      eachNear(X[i], Z[i], thr, (j) => { if (j < i - 260 && Math.hypot(X[j] - X[i], Z[j] - Z[i]) < thr) { bad = true; return false; } });
      if (bad) { for (const arr of touched) { while (arr.length && arr[arr.length - 1] >= a) arr.pop(); } return false; }
      gridAdd(i, touched);
    }
    corners.push(...cs);
    return true;
  }
  integrate(1, PRE + 1);
  for (let i = 0; i < PRE; i += 4) gridAdd(i);
  for (let si = 0; si < NS; si++) {
    let ok = false;
    for (let t = 0; t < 60 && !ok; t++) ok = genStage(si, 1000 + si * 131 + t * 7);
    if (!ok) { K.fill(0, B[si] + PRE, B[si + 1] + PRE); BK.fill(0, B[si] + PRE, B[si + 1] + PRE); integrate(B[si] + PRE, B[si + 1] + PRE + 1); for (let i = B[si] + PRE; i < B[si + 1] + PRE; i += 4) gridAdd(i); }
  }
  integrate(END + PRE, N);
  for (let i = END + PRE; i < N; i += 4) gridAdd(i);

  const at = (A, s) => { let f = s + PRE; if (f < 0) f = 0; else if (f > N - 1.001) f = N - 1.001; const i = f | 0, t = f - i; return A[i] + (A[i + 1] - A[i]) * t; };
  const T = {
    B, END, STAGES, corners, stageAt, sameN, oncN, edgeL, edgeR, wall,
    curv: (s) => at(K, s), bank: (s) => at(BK, s),
    laneLat: (j) => (j + 0.5) * LANE_W,
    laneOf: (lat) => Math.max(-2, Math.min(3, Math.floor(lat / LANE_W))),
    laneOpen(j, s) { return j >= 0 ? j < Math.floor(sameN(s) + 1e-6) : -j <= Math.floor(oncN(s) + 1e-6); },
    // stage blend at s: a -> b with weight w across +-150 m of each checkpoint
    mix(s) {
      const i = stageAt(s);
      if (i > 0 && s < B[i] + 150) return { a: i - 1, b: i, w: smooth((s - B[i] + 150) / 300) };
      if (i < NS - 1 && s > B[i + 1] - 150) return { a: i, b: i + 1, w: smooth((s - B[i + 1] + 150) / 300) };
      return { a: i, b: i, w: 0 };
    },
    param(s, key, def = 0) { const m = T.mix(s), va = STAGES[m.a][key] ?? def, vb = STAGES[m.b][key] ?? def; return lerp(+va, +vb, m.w); },
    bankY(s, lat) {
      const b = at(BK, s); if (b > -1e-4 && b < 1e-4) return 0;
      const lo = edgeL(s) - 4.5, hi = edgeR(s) + 4.5, l = Math.max(lo, Math.min(hi, lat));
      return b > 0 ? b * (l - lo) : b * (l - hi);
    },
    frame(s) { const th = at(TH, s); return { x: at(X, s), y: 0, z: at(Z, s), th, yaw: -th, rx: Math.cos(th), rz: Math.sin(th), k: at(K, s), b: at(BK, s), pitch: 0 }; },
    pos(s, lat, h = 0, out = new THREE.Vector3()) {
      const th = at(TH, s);
      return out.set(at(X, s) + lat * Math.cos(th), T.bankY(s, lat) + h, at(Z, s) + lat * Math.sin(th));
    },
    // would a prop of radius r at world (x, z) sit on (or too near) any part of the road?
    blocked(x, z, r) {
      let hit = false; const zz = z;
      eachNear(x, zz, 30 + r, (i) => {
        const th = TH[i], dx = x - X[i], dz = zz - Z[i];
        const along = dx * Math.sin(th) - dz * Math.cos(th), lat = dx * Math.cos(th) + dz * Math.sin(th);
        if (Math.abs(along) > 2.2 + r) return;
        const s = i - PRE;
        if (lat > edgeL(s) - 5 - r && lat < edgeR(s) + 5 + r) { hit = true; return false; }
      });
      return hit;
    },
  };
  return T;
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, rep) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
  if (rep) t.repeat.set(rep[0], rep[1]);
  return t;
}
function asphaltTex() {
  const t = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5d6066'; g.fillRect(0, 0, w, h);
    const r = rng(7);
    for (let i = 0; i < 9000; i++) { const v = (r() * 60 - 30) | 0; g.fillStyle = `rgba(${124 + v},${126 + v},${132 + v},${0.1 + r() * 0.15})`; g.fillRect((r() * w) | 0, (r() * h) | 0, 1 + ((r() * 2) | 0), 1 + ((r() * 2) | 0)); }
    g.fillStyle = 'rgba(0,0,0,0.09)'; for (let i = 0; i < 8; i++) g.fillRect((r() * w) | 0, 0, 6 + r() * 10, h);
  });
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
  return t;
}
function groundTex() {
  const t = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h); const r = rng(11);
    for (let i = 0; i < 2600; i++) { const v = 200 + ((r() * 55) | 0); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect((r() * w) | 0, (r() * h) | 0, 2 + ((r() * 4) | 0), 2 + ((r() * 4) | 0)); }
  });
  t.repeat.set(150, 150);
  return t;
}
function windowTex() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); const r = rng(5);
    for (let y = 4; y < h - 4; y += 8) for (let x = 3; x < w - 3; x += 8) { g.fillStyle = r() < 0.25 ? '#6f8396' : '#3d4c5c'; g.fillRect(x, y, 5, 5); }
  });
}
function emissiveWindowTex() {
  return canvasTex(64, 128, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h); const r = rng(3);
    for (let y = 4; y < h - 4; y += 8) for (let x = 3; x < w - 3; x += 8) { const lit = r() < 0.45; const c = r() < 0.5 ? '#ffcf6e' : '#a9d4ff'; if (lit) { g.fillStyle = c; g.fillRect(x, y, 5, 5); } }
  });
}
function poolTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,214,150,1)'); gr.addColorStop(0.5, 'rgba(255,190,120,0.45)'); gr.addColorStop(1, 'rgba(255,170,100,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const texCache = new Map();
function boardTex(txt, bg, fg = '#fff', w = 256, h = 64, font = 34) {
  const key = txt + bg + fg + w + h;
  if (texCache.has(key)) return texCache.get(key);
  const t = canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 3; g.strokeRect(4, 4, w - 8, h - 8);
    g.fillStyle = fg; g.font = `bold ${font}px Arial Black, Arial`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const lines = txt.split('\n'); lines.forEach((l, i) => g.fillText(l, w / 2, h / 2 + 2 + (i - (lines.length - 1) / 2) * font * 1.1));
  });
  t.magFilter = THREE.LinearFilter;
  texCache.set(key, t); return t;
}
function chevronTex(dir) {
  const t = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#e8392b'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff'; g.beginPath();
    const p = dir > 0 ? [[14, 8], [36, 8], [54, 32], [36, 56], [14, 56], [32, 32]] : [[50, 8], [28, 8], [10, 32], [28, 56], [50, 56], [32, 32]];
    g.moveTo(...p[0]); for (const q of p.slice(1)) g.lineTo(...q); g.closePath(); g.fill();
  });
  t.magFilter = THREE.LinearFilter; return t;
}

// ---------------------------------------------------------------- palettes
const TOD = {
  day: { top: '#3b7fd9', hor: '#cfe6f7', fog: '#c4dcec', fogN: 140, fogF: 620, hemiS: '#dcefff', hemiG: '#6f7f4a', hemi: 1.15, sun: '#fff1d6', sunI: 2.4, sunDir: [-0.5, 1, 0.35], night: 0, glow: 0.3, sunVis: 1, sunCol: '#fffbe6', sunR: 28 },
  sunset: { top: '#33266b', hor: '#ff9a4d', fog: '#e8876a', fogN: 120, fogF: 560, hemiS: '#ffc59a', hemiG: '#5b3b4a', hemi: 0.95, sun: '#ffb26b', sunI: 2.1, sunDir: [0.3, 0.35, -1], night: 0.15, glow: 0.6, sunVis: 1, sunCol: '#ffd9a0', sunR: 60 },
  night: { top: '#03050d', hor: '#1b2340', fog: '#0f1426', fogN: 60, fogF: 380, hemiS: '#6a7cb8', hemiG: '#2a2630', hemi: 0.95, sun: '#8fa6ff', sunI: 0.45, sunDir: [0.4, 1, 0.2], night: 1, glow: 1, sunVis: 0, sunCol: '#fffbe6', sunR: 28 },
  storm: { top: '#2b3138', hor: '#7d8790', fog: '#6c757e', fogN: 50, fogF: 330, hemiS: '#b4c0cc', hemiG: '#44473f', hemi: 1.0, sun: '#dfe6ee', sunI: 0.95, sunDir: [-0.3, 1, 0.2], night: 0.45, glow: 0.8, sunVis: 0, sunCol: '#fffbe6', sunR: 28 },
};
const THEME = {
  suburb: { ground: '#5f8f3e', shoulder: '#7d7a70', ring: 'low' },
  city: { ground: '#5c5f63', shoulder: '#6c6c6a', ring: 'city' },
  industrial: { ground: '#6b6650', shoulder: '#77736a', ring: 'low' },
  country: { ground: '#87974a', shoulder: '#8a7d5f', ring: 'low' },
  canyon: { ground: '#b8693e', shoulder: '#9c6a4a', ring: 'canyon' },
};
const cA = new THREE.Color(), cB = new THREE.Color();
const lerpCol = (out, a, b, w) => out.copy(cA.set(a)).lerp(cB.set(b), w);

// ---------------------------------------------------------------- prop geometry (shared, built once)
function propGeos() {
  const trees = [boxesGeo([[0, 1.2, 0, 0.5, 2.4, 0.5, '#5b3f2a'], [0, 3.2, 0, 3.2, 2.0, 3.2, '#3f7a35'], [0, 4.5, 0, 2.2, 1.2, 2.2, '#4c8c3d'], [0.3, 5.3, 0.2, 1.1, 0.6, 1.1, '#5a9e45']]),
    boxesGeo([[0, 1, 0, 0.45, 2, 0.45, '#4f3624'], [0, 2.6, 0, 3, 1.2, 3, '#2f5f34'], [0, 3.7, 0, 2.2, 1.1, 2.2, '#356b38'], [0, 4.7, 0, 1.4, 1, 1.4, '#3c773e'], [0, 5.5, 0, 0.7, 0.7, 0.7, '#428242']]),
    boxesGeo([[0, 0.6, 0, 2.2, 1.2, 1.8, '#4a7d34'], [0.5, 1.3, 0.2, 1.2, 0.6, 1.2, '#56903c']])];
  const bldDims = [[16, 34, 16], [22, 60, 18], [14, 22, 24], [26, 90, 22], [30, 14, 40]];
  const bld = bldDims.map(([w, h, d]) => {
    const g = new THREE.BoxGeometry(w, h, d); g.translate(0, h / 2, 0);
    const uv = g.attributes.uv, nrm = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) { const top = Math.abs(nrm.getY(i)) > 0.5, side = Math.abs(nrm.getX(i)) > 0.5 ? d : w; uv.setXY(i, top ? 0.02 : uv.getX(i) * side / 8, top ? 0.02 : uv.getY(i) * h / 16); }
    return g;
  });
  const house = [boxesGeo([[0, 1.6, 0, 8, 3.2, 7, '#e8dcc6'], [0, 3.8, 0, 8.6, 1.2, 7.6, '#8c3b2e'], [0, 4.8, 0, 6, 0.8, 5, '#9c4434'], [-2.2, 1.2, -3.52, 1.4, 2.2, 0.1, '#6b4a33'], [1.8, 1.9, -3.52, 1.8, 1.2, 0.1, '#3d4c5c']]),
    boxesGeo([[0, 1.6, 0, 7, 3.2, 8, '#c9d6de'], [0, 3.6, 0, 7.4, 0.8, 8.4, '#3f4a55'], [2, 1.9, -4.02, 1.8, 1.2, 0.1, '#3d4c5c'], [-1.6, 1.2, -4.02, 1.2, 2.2, 0.1, '#7a5636']])];
  const ware = [boxesGeo([[0, 4, 0, 24, 8, 18, '#a7a196'], [0, 8.3, 0, 24.4, 0.6, 18.4, '#6a6d70'], [-6, 2.2, -9.05, 5, 4.4, 0.1, '#5a5f66'], [6, 2.2, -9.05, 5, 4.4, 0.1, '#5a5f66']]),
    boxesGeo([[0, 1.3, 0, 2.4, 2.6, 12, '#c0492f'], [0, 3.9, 0, 2.4, 2.6, 12, '#2f6fa8'], [3, 1.3, 0, 2.4, 2.6, 12, '#d9a520']]),
    boxesGeo([[0, 9, 0, 3, 18, 3, '#8d8f91'], [0, 18.5, 0, 4, 1, 4, '#c0492f']])];
  const rock = [boxesGeo([[0, 5, 0, 10, 10, 9, '#b4643a'], [1, 11, -0.5, 7, 4, 7, '#c27446'], [-0.5, 14, 0, 4, 3, 5, '#cf8250']]),
    boxesGeo([[0, 9, 0, 14, 18, 12, '#a85c36'], [0, 19.5, 0, 10, 3, 9, '#bd6c40'], [2, 22, 1, 5, 2.5, 4, '#cd7b4c']]),
    boxesGeo([[0, 1, 0, 3, 2, 2.5, '#9c5a38'], [0.5, 2.3, 0, 1.6, 0.8, 1.4, '#b06640']])];
  return {
    trees, bld, bldDims, house, ware, rock,
    post: boxesGeo([[0, 0.45, 0, 0.12, 0.9, 0.12, '#7d838a']]),
    signPost: boxesGeo([[0, 0.8, 0, 0.12, 1.6, 0.12, '#5d636a']]),
    lamp: boxesGeo([[0, 4.5, 0, 0.22, 9, 0.22, '#6d7379'], [-1.2, 9, 0, 2.6, 0.18, 0.2, '#6d7379']]),
    lampHead: boxesGeo([[-2.3, 8.85, 0, 0.8, 0.14, 0.34, '#ffffff']], { ao: 1 }),
    gantryLeg: boxesGeo([[0, 3.6, 0, 0.4, 7.2, 0.4, '#8a9096']]),
    cushion: boxesGeo([[0, 0.45, 0, 0.7, 0.9, 1.6, '#e9b41c'], [0, 0.45, -0.81, 0.72, 0.5, 0.02, '#1b1b1b']]),
    chevron: new THREE.PlaneGeometry(1.1, 1.1).translate(0, 1.75, 0),
    pool: new THREE.PlaneGeometry(13, 13).rotateX(-Math.PI / 2),
  };
}

// ---------------------------------------------------------------- world (streamed)
export function buildWorld(scene, T) {
  const root = new THREE.Group(); scene.add(root);
  const PG = propGeos();
  const night0 = TOD.day;
  scene.fog = new THREE.Fog(night0.fog, night0.fogN, night0.fogF);
  scene.background = new THREE.Color(night0.fog);

  // ---- sky dome + sun + distant silhouette rings, all follow the camera
  const skyG = new THREE.SphereGeometry(900, 24, 12), skyY = [];
  { const p = skyG.attributes.position; for (let i = 0; i < p.count; i++) skyY.push(Math.max(0, p.getY(i) / 900)); }
  skyG.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(skyY.length * 3), 3));
  const sky = new THREE.Mesh(skyG, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -10; root.add(sky);
  const sunDisc = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#fffbe6', fog: false, depthWrite: false, transparent: true }));
  sunDisc.renderOrder = -9; sky.add(sunDisc);
  const R0 = rng(99), rings = {};
  for (const kind of ['low', 'city', 'canyon']) {
    const list = [];
    for (let i = 0; i < 90; i++) {
      const a = (i / 90) * Math.PI * 2, r = 760 + R0() * 60;
      const tall = kind === 'city' ? 30 + R0() * 150 : kind === 'canyon' ? 60 + R0() * 110 : 25 + R0() * 60;
      const w = kind === 'city' ? 30 + R0() * 40 : 60 + R0() * 70;
      list.push([Math.cos(a) * r, tall / 2 - 10, Math.sin(a) * r, w, tall, w, '#ffffff', false]);
    }
    const m = new THREE.Mesh(boxesGeo(list), new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, transparent: true, depthWrite: false }));
    m.renderOrder = -8; sky.add(m); rings[kind] = m;
  }

  // ---- lights + ground
  const hemi = new THREE.HemisphereLight('#fff', '#888', 1); root.add(hemi);
  const sunL = new THREE.DirectionalLight('#fff', 2);
  sunL.castShadow = true; sunL.shadow.mapSize.set(1024, 1024);
  const sc = sunL.shadow.camera; sc.left = -30; sc.right = 30; sc.top = 30; sc.bottom = -30; sc.near = 1; sc.far = 160;
  sunL.shadow.bias = -0.0005; sunL.shadow.normalBias = 0.03;
  root.add(sunL, sunL.target);
  const sunDir = new THREE.Vector3(0, 1, 0);
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTex(), color: '#5f8f3e' });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2), groundMat);
  ground.position.y = -0.12; ground.receiveShadow = true; root.add(ground);

  // ---- shared materials (never disposed; chunks only own geometry)
  const asphalt = asphaltTex();
  const MATS = {
    road: new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.92, metalness: 0, emissive: '#ffffff', emissiveMap: asphalt, emissiveIntensity: 0 }),
    shoulder: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    mark: new THREE.MeshBasicMaterial({ color: '#eceee8', side: THREE.DoubleSide }),
    yel: new THREE.MeshBasicMaterial({ color: '#e8b923', side: THREE.DoubleSide }),
    rail: new THREE.MeshLambertMaterial({ color: '#b7bcc2', side: THREE.DoubleSide }),
    wall: new THREE.MeshLambertMaterial({ color: '#c3c0b8', side: THREE.DoubleSide }),
  };
  const voxMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const bldMat = new THREE.MeshLambertMaterial({ map: windowTex(), emissiveMap: emissiveWindowTex(), emissive: '#ffffff', emissiveIntensity: 0 });
  const lampHeadMat = new THREE.MeshBasicMaterial({ color: '#d9dde0' });
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const chevMat = { 1: new THREE.MeshBasicMaterial({ map: chevronTex(1), side: THREE.DoubleSide }), [-1]: new THREE.MeshBasicMaterial({ map: chevronTex(-1), side: THREE.DoubleSide }) };
  const signGeo = new THREE.PlaneGeometry(3.4, 1.7);
  const BCOL = ['#d8cfc0', '#b8c2cc', '#c9a98a', '#9ea7b0', '#e3ddd2', '#a88f78'];
  const shoulderCols = Object.fromEntries(Object.entries(THEME).map(([k, v]) => [k, new THREE.Color(v.shoulder)]));

  // ---------------------------------------------------------------- chunks
  const CH = 160, chunks = new Map(), STEP = 2;
  const v0 = new THREE.Vector3(), v1 = new THREE.Vector3(), dummy = new THREE.Object3D(), tmpC = new THREE.Color();
  const themeAt = (s, R) => { const m = T.mix(s); return STAGES[R() < m.w ? m.b : m.a].theme; };

  function buildChunk(ci) {
    const s0 = ci * CH, s1 = s0 + CH, R = rng(ci * 7919 + 1013);
    const grp = new THREE.Group(), geos = [], lamps = [];
    const bufs = {};
    const buf = (k) => bufs[k] || (bufs[k] = { pos: [], col: [], uv: [], idx: [], n: 0 });
    // a ribbon between two points per s (fn fills v0, v1; returns false for a gap)
    const ribbon = (key, fn, colFn, vs = 8, a = s0, b = s1) => {
      const g = buf(key); let first = true;
      for (let s = a; s <= b + 1e-6; s += STEP) {
        const u = fn(s, v0, v1);
        if (u === false) { first = true; continue; }
        g.pos.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z);
        const c = colFn ? colFn(s) : null; if (c) g.col.push(c.r, c.g, c.b, c.r, c.g, c.b); else g.col.push(1, 1, 1, 1, 1, 1);
        const ua = (u && u[0]) || 0, ub = (u && u[1]) || 1;
        g.uv.push(ua / vs, s / vs, ub / vs, s / vs);
        if (!first) { const q = g.n - 2; g.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
        g.n += 2; first = false;
      }
    };
    const flat = (key, la, lb, h, vs, colFn, cond) => ribbon(key, (s, A, Bv) => {
      if (cond && !cond(s)) return false;
      const l0 = la(s), l1 = lb(s); T.pos(s, l0, h, A); T.pos(s, l1, h, Bv); return [l0, l1];
    }, colFn, vs);
    const shCol = (s) => { const m = T.mix(s); return tmpC.copy(shoulderCols[STAGES[m.a].theme]).lerp(shoulderCols[STAGES[m.b].theme], m.w); };
    const eL = T.edgeL, eR = T.edgeR;

    // road, shoulders, skirts down to the ground where the road is banked
    flat('road', eL, eR, 0, 14);
    flat('shoulder', (s) => eL(s) - 3, eL, -0.03, 8, shCol);
    flat('shoulder', eR, (s) => eR(s) + 3, -0.03, 8, shCol);
    for (const sd of [-1, 1]) ribbon('shoulder', (s, A, Bv) => {
      if (Math.abs(T.bank(s)) < 1e-3) return false;
      const l = sd < 0 ? eL(s) - 3 : eR(s) + 3; T.pos(s, l, -0.03, A); Bv.copy(A); Bv.y = -0.14; return null;
    }, shCol);
    // edge lines, centre: double yellow on two-way, median wall (with white lines) on divided stretches
    flat('mark', (s) => eL(s) + 0.15, (s) => eL(s) + 0.35, 0.02, 8);
    flat('mark', (s) => eR(s) - 0.35, (s) => eR(s) - 0.15, 0.02, 8);
    const two = (s) => !T.wall(s), wl = (s) => T.wall(s);
    flat('yel', () => -0.28, () => -0.1, 0.02, 8, null, two);
    flat('yel', () => 0.1, () => 0.28, 0.02, 8, null, two);
    flat('mark', () => -0.62, () => -0.45, 0.02, 8, null, wl);
    flat('mark', () => 0.45, () => 0.62, 0.02, 8, null, wl);
    const prof = [[-0.3, 0], [-0.14, 0.32], [-0.1, 0.9], [0.1, 0.9], [0.14, 0.32], [0.3, 0]];
    for (let k = 0; k < prof.length - 1; k++) ribbon('wall', (s, A, Bv) => { if (!T.wall(s)) return false; T.pos(s, prof[k][0], prof[k][1], A); T.pos(s, prof[k + 1][0], prof[k + 1][1], Bv); return null; });
    // guard rails (both outer edges)
    for (const sd of [-1, 1]) {
      const lat = (s) => (sd < 0 ? eL(s) - 1.2 : eR(s) + 1.2);
      const pr = [[0, 0.45], [0, 0.85], [0.08 * sd, 0.85], [0.08 * sd, 0.45]];
      for (let k = 0; k < 3; k++) ribbon('rail', (s, A, Bv) => { const l = lat(s); T.pos(s, l + pr[k][0], pr[k][1], A); T.pos(s, l + pr[k + 1][0], pr[k + 1][1], Bv); return null; });
    }
    // lane dashes (only between lanes that both exist here)
    {
      const g = buf('mark'), a = Math.ceil(s0 / 12) * 12;
      for (let s = a; s < s1; s += 12) {
        const ls = [];
        for (let k = 1; k <= 3; k++) if (T.laneOpen(k, s) && T.laneOpen(k, s + 3.5)) ls.push(k * LANE_W);
        if (T.laneOpen(-2, s) && T.laneOpen(-2, s + 3.5)) ls.push(-LANE_W);
        for (const lat of ls) {
          const q = g.n;
          for (const [ds, dl] of [[0, -0.1], [0, 0.1], [3.5, -0.1], [3.5, 0.1]]) { T.pos(s + ds, lat + dl, 0.02, v0); g.pos.push(v0.x, v0.y, v0.z); g.col.push(1, 1, 1); g.uv.push(0, 0); }
          g.idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); g.n += 4;
        }
      }
    }
    for (const k in bufs) {
      const b = bufs[k]; if (!b.n) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      geo.setIndex(b.idx); geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, MATS[k]); m.receiveShadow = true; m.castShadow = k === 'rail' || k === 'wall';
      grp.add(m); geos.push(geo);
    }

    // ---- instanced props: place(geo, mat, [[s, lat, h, yaw, scale, color, ground]])
    const place = (geo, mat, list, shadow = false) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach(([s, lat, h, yaw, sc, col, gnd], i) => {
        const th = T.frame(s).th; T.pos(s, lat, h || 0, dummy.position); if (gnd) dummy.position.y = h || 0;
        dummy.rotation.set(0, -th + (yaw || 0), 0);
        if (Array.isArray(sc)) dummy.scale.set(sc[0], sc[1], sc[2]); else dummy.scale.setScalar(sc || 1);
        dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
        if (col) im.setColorAt(i, tmpC.set(col));
      });
      im.castShadow = shadow; im.receiveShadow = true; im.computeBoundingSphere();
      grp.add(im); geos.push(im);
    };
    const posts = [], lampL = [], pools = [], cush = [];
    for (let s = Math.ceil(s0 / 4) * 4; s < s1; s += 4) { posts.push([s, eL(s) - 1.25, 0], [s, eR(s) + 1.25, 0]); }
    for (let s = Math.ceil(s0 / 40) * 40; s < s1; s += 40) {
      const right = (Math.round(s / 40) & 1) === 0, lat = right ? eR(s) + 2.2 : eL(s) - 2.2;
      lampL.push([s, lat, 0, right ? 0 : Math.PI]);
      const head = right ? eR(s) - 0.1 : eL(s) + 0.1;
      const p = T.pos(s, head, 8.7); lamps.push([p.x, p.y, p.z, s, p.y - 8.7]);
      if (Math.abs(T.bank(s)) < 0.004) pools.push([s, right ? eR(s) - 3 : eL(s) + 3, 0.05]);
    }
    for (let s = s0; s < s1; s += 2) if (T.wall(s) !== T.wall(s - 2)) cush.push([T.wall(s) ? s + 0.8 : s - 2.8, 0, 0, T.wall(s) ? 0 : Math.PI]);
    place(PG.post, voxMat, posts);
    place(PG.lamp, voxMat, lampL, true);
    place(PG.lampHead, lampHeadMat, lampL);
    place(PG.pool, poolMat, pools);
    place(PG.cushion, voxMat, cush, true);

    // corner chevrons on the outside of every real bend + a warning sign before it
    const chev = { 1: [], [-1]: [] }, sposts = [];
    for (const c of T.corners) {
      if (c.s1 < s0 - 200 || c.s0 > s1 + 200) continue;
      if (c.R < 240) for (let s = Math.ceil((c.s0 + 15) / 13) * 13; s < c.s1 - 10; s += 13) {
        if (s < s0 || s >= s1) continue;
        const lat = c.d > 0 ? eL(s) - 2.3 : eR(s) + 2.3;
        chev[c.d].push([s, lat, 0, 0, 1]); sposts.push([s, lat, 0]);
      }
      const ws = c.s0 - 150;
      if (c.sign && ws >= s0 && ws < s1 && c.R < 260) {
        const label = { hairpin: 'HAIRPIN', chicane: 'CHICANE', scurve: 'S-BENDS', offcamber: 'OFF-CAMBER', bend: c.R < 110 ? 'SHARP BEND' : 'BEND', sweeper: 'BEND' }[c.kind];
        const arrow = c.d > 0 ? '>>' : '<<';
        const mesh = new THREE.Mesh(signGeo, new THREE.MeshBasicMaterial({ map: boardTex(c.d > 0 ? `${label} ${arrow}` : `${arrow} ${label}`, '#f2c218', '#111', 256, 128, 30) }));
        const lat = eR(ws) + 3.2; T.pos(ws, lat, 2.6, mesh.position); mesh.rotation.y = -T.frame(ws).th; grp.add(mesh);
        sposts.push([ws, lat - 1.2, 0, 0, [1, 1.1, 1]], [ws, lat + 1.2, 0, 0, [1, 1.1, 1]]);
        geos.push({ dispose: () => mesh.material.dispose() });
      }
    }
    place(PG.chevron, chevMat[1], chev[1]); place(PG.chevron, chevMat[-1], chev[-1]); place(PG.signPost, voxMat, sposts);

    // gantries with distance boards, checkpoint arches, the finish arch
    const legs = [];
    const beam = (s, y = 7.2) => {
      const L = eL(s), Rr = eR(s), m = new THREE.Mesh(new THREE.BoxGeometry(Rr - L + 4, 0.4, 0.4), MATS.rail);
      T.pos(s, (L + Rr) / 2, y, m.position); m.rotation.y = -T.frame(s).th; grp.add(m); geos.push(m.geometry);
      legs.push([s, L - 1.8, 0], [s, Rr + 1.8, 0]);
    };
    const board = (s, lat, y, w, h, tex) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
      T.pos(s, lat, y, m.position); m.rotation.y = -T.frame(s).th; grp.add(m); geos.push(m.geometry, { dispose: () => m.material.dispose() });
    };
    for (let i = 0; i < NS; i++) for (let l = 700; l < STAGES[i].len - 300; l += 700) {
      const s = T.B[i] + l; if (s < s0 || s >= s1) continue;
      beam(s);
      const km = ((STAGES[i].len - l) / 1000).toFixed(1);
      board(s, eR(s) - LANE_W, 6.6, 8, 2, boardTex((i === NS - 1 ? 'FINISH ' : 'CHECKPOINT ') + km + ' km', '#1f6b3a', '#fff', 320, 64, 30));
    }
    for (let k = 1; k <= NS; k++) {
      const s = T.B[k]; if (s < s0 || s >= s1) continue;
      const fin = k === NS, L = eL(s), Rr = eR(s), col = fin ? '#e8392b' : '#1f63d6';
      for (const lat of [L - 2, Rr + 2]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(1.2, 9, 1.2), new THREE.MeshLambertMaterial({ color: col })); T.pos(s, lat, 4.5, leg.position); leg.rotation.y = -T.frame(s).th; grp.add(leg); geos.push(leg.geometry, { dispose: () => leg.material.dispose() }); }
      board(s, (L + Rr) / 2, 9, Rr - L + 5.2, 2.4, boardTex(fin ? 'FINISH' : 'CHECKPOINT', col, '#fff', 512, 64, 40));
      if (!fin) board(s, (L + Rr) / 2, 6.9, Math.min(16, Rr - L + 2), 1.6, boardTex(`STAGE ${k + 1}  ${STAGES[k].name.toUpperCase()}`, '#111', '#ffcf3a', 512, 64, 30));
      const line = new THREE.Mesh(new THREE.PlaneGeometry(Rr - L, 3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: fin ? '#ffffff' : '#ffcf3a', transparent: true, opacity: 0.85 }));
      T.pos(s, (L + Rr) / 2, 0.035, line.position); line.rotation.y = -T.frame(s).th; grp.add(line); geos.push(line.geometry, { dispose: () => line.material.dispose() });
    }
    place(PG.gantryLeg, voxMat, legs, true);

    // ---- roadside scenery by theme (blended across checkpoints), never on or near any part of the road
    const L = { tree: [[], [], []], bld: PG.bld.map(() => []), house: [[], []], ware: [[], [], []], rock: [[], [], []] };
    const tryAdd = (list, s, lat, rad, rest) => { T.pos(s, lat, 0, v0); if (!T.blocked(v0.x, v0.z, rad)) list.push([s, lat, ...rest]); };
    for (let s = s0; s < s1; s += 9) {
      const th = themeAt(s, R);
      for (const sd of [-1, 1]) {
        const edge = sd < 0 ? -eL(s) + 6 : eR(s) + 6;
        if (th === 'city') {
          if (R() < 0.55) { const k = (R() * PG.bld.length) | 0, dm = PG.bldDims[k]; tryAdd(L.bld[k], s, sd * (edge + 8 + R() * 14 + dm[0] / 2), Math.max(dm[0], dm[2]) * 0.6, [0, 0, [1, 0.8 + R() * 0.5, 1], BCOL[(R() * BCOL.length) | 0], true]); }
          if (R() < 0.12) tryAdd(L.tree[2], s, sd * (edge - 1.5), 1.5, [0, R() * 3, 0.8, null, true]);
        } else if (th === 'suburb') {
          if (R() < 0.3) tryAdd(L.house[(R() * 2) | 0], s, sd * (edge + 10 + R() * 18), 5.5, [0, sd > 0 ? -Math.PI / 2 : Math.PI / 2, 1, null, true]);
          if (R() < 0.5) tryAdd(L.tree[(R() * 3) | 0], s + R() * 6, sd * (edge + 1 + R() * 40), 2, [0, R() * 3, 0.8 + R() * 0.6, null, true]);
        } else if (th === 'industrial') {
          if (R() < 0.22) tryAdd(L.ware[0], s, sd * (edge + 16 + R() * 20), 15, [0, Math.PI / 2, 1, null, true]);
          if (R() < 0.18) tryAdd(L.ware[1], s, sd * (edge + 4 + R() * 6), 6, [0, 0, 1, null, true]);
          if (R() < 0.03) tryAdd(L.ware[2], s, sd * (edge + 30 + R() * 30), 3, [0, 0, 1, null, true]);
          if (R() < 0.15) tryAdd(L.tree[2], s, sd * (edge + 1), 1.5, [0, R() * 3, 1, null, true]);
        } else if (th === 'country') {
          if (R() < 0.6) tryAdd(L.tree[(R() * 3) | 0], s + R() * 6, sd * (edge + 2 + R() * 60), 2, [0, R() * 3, 0.8 + R() * 0.8, null, true]);
          if (R() < 0.04) tryAdd(L.house[0], s, sd * (edge + 25 + R() * 30), 5.5, [0, R() * 3, 1, null, true]);
        } else if (th === 'canyon') {
          if (R() < 0.7) { const k = R() < 0.5 ? 0 : 1; tryAdd(L.rock[k], s, sd * (edge + 6 + R() * 26), k ? 9 : 6, [-1, R() * 3, 0.8 + R() * 0.7, null, true]); }
          if (R() < 0.25) tryAdd(L.rock[2], s, sd * (edge + 0.5 + R() * 4), 2, [0, R() * 3, 0.6 + R() * 0.8, null, true]);
        }
      }
    }
    L.tree.forEach((l, i) => place(PG.trees[i], voxMat, l, true));
    L.bld.forEach((l, i) => place(PG.bld[i], bldMat, l));
    L.house.forEach((l, i) => place(PG.house[i], voxMat, l, true));
    L.ware.forEach((l, i) => place(PG.ware[i], voxMat, l, true));
    L.rock.forEach((l, i) => place(PG.rock[i], voxMat, l, true));

    root.add(grp);
    return { grp, lamps, dispose() { root.remove(grp); for (const g of geos) g.dispose(); } };
  }

  // ---- rain (global, density follows the weather blend)
  const RN = 1400, rainPos = new Float32Array(RN * 6);
  const rainG = new THREE.BufferGeometry(); rainG.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(rainG, new THREE.LineBasicMaterial({ color: '#c9d4df', transparent: true, opacity: 0.45 }));
  rain.frustumCulled = false; root.add(rain);
  const Rr = rng(5), drops = Array.from({ length: RN }, () => [Rr() * 80 - 40, Rr() * 30, Rr() * 100 - 70]);

  const env = { night: 0, wet: 0, glow: 0.3 };
  let lastKey = '';
  const W = {
    root, sunL, sunDir, env, chunks, buildMax: 0,
    // build missing chunks around ps (nearest first, at most 'budget' per call) and drop far ones
    stream(ps, budget = Infinity) {
      const lo = Math.floor((ps - 480) / CH), hi = Math.floor((ps + 1050) / CH);
      for (const [ci, c] of chunks) if (ci < lo || ci > hi) { c.dispose(); chunks.delete(ci); }
      const c0 = Math.floor(ps / CH);
      for (let d = 0; d <= hi - lo && budget > 0; d++) for (const ci of d ? [c0 + d, c0 - d] : [c0]) {
        if (ci < lo || ci > hi || chunks.has(ci) || budget <= 0) continue;
        const t0 = performance.now(); chunks.set(ci, buildChunk(ci)); budget--; W.buildMax = Math.max(W.buildMax, performance.now() - t0);
      }
    },
    clear() { for (const c of chunks.values()) c.dispose(); chunks.clear(); },
    *lamps() { for (const c of chunks.values()) yield* c.lamps; },
    // blend the look (sky, fog, light, wet road, lit windows) for the player's position
    setEnv(s) {
      const m = T.mix(s), key = m.a + ':' + m.b + ':' + m.w.toFixed(3);
      if (key === lastKey) return env; lastKey = key;
      const A = STAGES[m.a], Bs = STAGES[m.b], ta = TOD[A.tod], tb = TOD[Bs.tod], w = m.w;
      const n = (k) => lerp(ta[k], tb[k], w);
      const fogC = lerpCol(new THREE.Color(), ta.fog, tb.fog, w);
      scene.fog.color.copy(fogC); scene.background.copy(fogC); scene.fog.near = n('fogN'); scene.fog.far = n('fogF');
      const top = lerpCol(new THREE.Color(), ta.top, tb.top, w), hor = lerpCol(new THREE.Color(), ta.hor, tb.hor, w);
      const ca = skyG.attributes.color, c = new THREE.Color();
      for (let i = 0; i < skyY.length; i++) { c.copy(hor).lerp(top, Math.pow(skyY[i], 0.55)); ca.setXYZ(i, c.r, c.g, c.b); }
      ca.needsUpdate = true;
      lerpCol(hemi.color, ta.hemiS, tb.hemiS, w); lerpCol(hemi.groundColor, ta.hemiG, tb.hemiG, w); hemi.intensity = n('hemi');
      lerpCol(sunL.color, ta.sun, tb.sun, w); sunL.intensity = n('sunI');
      sunDir.set(...ta.sunDir).normalize().lerp(new THREE.Vector3(...tb.sunDir).normalize(), w).normalize();
      sunDisc.material.opacity = n('sunVis'); sunDisc.visible = sunDisc.material.opacity > 0.01;
      lerpCol(sunDisc.material.color, ta.sunCol, tb.sunCol, w); sunDisc.scale.setScalar(n('sunR'));
      sunDisc.position.copy(sunDir).multiplyScalar(850); sunDisc.lookAt(0, 0, 0);
      const night = n('night'), wet = lerp(A.rain ? 1 : 0, Bs.rain ? 1 : 0, w);
      env.night = night; env.wet = wet; env.glow = n('glow');
      const ringCol = hor.clone().lerp(top, 0.18 + night * 0.12).multiplyScalar(0.82 - night * 0.22);
      for (const k in rings) {
        const wa = THEME[A.theme].ring === k ? 1 - w : 0, wb = THEME[Bs.theme].ring === k ? w : 0;
        rings[k].material.opacity = wa + wb; rings[k].visible = wa + wb > 0.01; rings[k].material.color.copy(ringCol);
      }
      lerpCol(groundMat.color, THEME[A.theme].ground, THEME[Bs.theme].ground, w);
      // road: dry matte -> wet, slightly glossy; a little self-light at night so it never goes black
      const road = MATS.road;
      road.roughness = lerp(0.92, 0.42, wet); road.color.setRGB(1 - wet * 0.18, 1 - wet * 0.16, 1 - wet * 0.1);
      road.emissiveIntensity = 0.05 * night + 0.07 * wet * Math.max(night, 0.45);
      road.emissive.setRGB(0.75 + 0.25 * (1 - wet), 0.8, 0.95);
      MATS.mark.color.set(night > 0.5 ? '#d9dbe0' : '#eceee8');
      bldMat.emissiveIntensity = night * 0.9;
      lampHeadMat.color.copy(lerpCol(c, '#d9dde0', '#ffe2a6', Math.min(1, night * 1.6)));
      poolMat.opacity = Math.max(0, night - 0.3) * 0.45 + wet * night * 0.15;
      rain.material.color.copy(lerpCol(c, '#c9d4df', '#8ea2c8', night));
      rain.geometry.setDrawRange(0, Math.round(RN * wet) * 2); rain.visible = wet > 0.01;
      return env;
    },
    update(cam, px, py, pz, v, dt) {
      sky.position.copy(cam.position);
      ground.position.x = Math.round(cam.position.x / 20) * 20; ground.position.z = Math.round(cam.position.z / 20) * 20;
      sunL.position.set(px + sunDir.x * 60, py + sunDir.y * 60, pz + sunDir.z * 60);
      sunL.target.position.set(px, py, pz);
      if (rain.visible) {
        const fall = 26 * dt, back = v * dt, n = Math.round(RN * env.wet);
        for (let i = 0; i < n; i++) {
          const q = drops[i]; q[1] -= fall; q[2] += back;
          if (q[1] < 0 || q[2] > 8) { q[1] = 8 + Math.random() * 22; q[2] = -Math.random() * 90 - 5; q[0] = Math.random() * 60 - 30; }
          const x = cam.position.x + q[0], y = cam.position.y - 2 + q[1], z = cam.position.z + q[2];
          const k = i * 6; rainPos[k] = x; rainPos[k + 1] = y; rainPos[k + 2] = z; rainPos[k + 3] = x; rainPos[k + 4] = y + 0.9; rainPos[k + 5] = z - 0.04 * v * 0.3;
        }
        rainG.attributes.position.needsUpdate = true;
      }
    },
  };
  return W;
}

// ---------------------------------------------------------------- roadworks: cones on a taper, concrete blocks, arrow board
export function makeZones(T) {
  const out = [];
  STAGES.forEach((st, i) => {
    if (!st.works) return;
    const R = rng((100 + i) * 31 + 7), gap = (st.len - 800) / st.works;
    for (let k = 0; k < st.works; k++) {
      const s0 = T.B[i] + 450 + k * gap + R() * gap * 0.4;
      out.push({ s0, s1: s0 + 140 + R() * 120, lane: (R() * st.lanes) | 0, lanes: st.lanes });
    }
  });
  return out;
}
export function buildWorks(root, T, zones) {
  const blocks = [], coneObjs = [];
  const coneGeo = boxesGeo([[0, 0.05, 0, 0.6, 0.1, 0.6, '#222'], [0, 0.3, 0, 0.38, 0.4, 0.38, '#ff6a00'], [0, 0.55, 0, 0.3, 0.12, 0.3, '#f4f4f4'], [0, 0.72, 0, 0.2, 0.22, 0.2, '#ff6a00']]);
  const blockGeo = boxesGeo([[0, 0.45, 0, 0.7, 0.9, 3.6, '#c9c6bf'], [0, 0.95, 0, 0.36, 0.1, 3.6, '#b0ada6'], [0, 0.6, 0, 0.72, 0.18, 3.62, '#d9531e']]);
  const boardGeo = boxesGeo([[0, 0.9, 0, 2.4, 1.6, 0.2, '#1b1b1b'], [0, 0.2, 0, 2.0, 0.4, 1.2, '#e9b41c']]);
  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  for (const z of zones) {
    const lat = T.laneLat(z.lane);
    z.open = z.lane < (z.lanes - 1) / 2 ? 1 : -1; // side the traffic merges to
    for (let i = 0; i <= 8; i++) coneObjs.push({ s: z.s0 - 48 + i * 6, lat: lat - z.open * 1.6 + z.open * (i / 8) * 3.2, h: 0, vs: 0, vl: 0, vy: 0, rot: 0 });
    for (let s = z.s0; s < z.s1; s += 3.8) blocks.push({ s, lat });
    for (let s = z.s0 + 8; s < z.s1; s += 12) coneObjs.push({ s, lat: lat + z.open * 1.6, h: 0, vs: 0, vl: 0, vy: 0, rot: 0 });
    z.board = { s: z.s0 - 6, lat };
  }
  for (const c of coneObjs) { c.s0 = c.s; c.lat0 = c.lat; }
  const coneMesh = new THREE.InstancedMesh(coneGeo, mat, Math.max(1, coneObjs.length)); coneMesh.castShadow = true;
  const blockMesh = new THREE.InstancedMesh(blockGeo, mat, Math.max(1, blocks.length)); blockMesh.castShadow = true; blockMesh.receiveShadow = true;
  const d = new THREE.Object3D();
  const setM = (im, i, s, lat, h, rx = 0, ry = 0, rz = 0) => { T.pos(s, lat, h, d.position); d.rotation.set(rx, -T.frame(s).th + ry, rz); d.updateMatrix(); im.setMatrixAt(i, d.matrix); };
  blocks.forEach((b, i) => setM(blockMesh, i, b.s, b.lat, 0)); blockMesh.count = blocks.length;
  const boards = new THREE.InstancedMesh(boardGeo, mat, Math.max(1, zones.length));
  zones.forEach((z, i) => setM(boards, i, z.board.s, z.board.lat, 0)); boards.count = zones.length;
  const arrowGeo = boxesGeo([[0, 0.95, 0.12, 1.6, 0.3, 0.05, '#ffffff']], { ao: 1 });
  const arrows = new THREE.InstancedMesh(arrowGeo, new THREE.MeshBasicMaterial({ color: '#ffb020' }), Math.max(1, zones.length));
  zones.forEach((z, i) => setM(arrows, i, z.board.s, z.board.lat, 0)); arrows.count = zones.length;
  for (const m of [blockMesh, boards, arrows]) m.computeBoundingSphere();
  coneMesh.frustumCulled = false;
  root.add(coneMesh, blockMesh, boards, arrows);
  const W = {
    cones: coneObjs, blocks, zones,
    syncCones() {
      coneObjs.forEach((c, i) => setM(coneMesh, i, c.s, c.lat, c.h, c.rot, c.rot * 0.7, c.rot * 0.4));
      coneMesh.count = coneObjs.length; coneMesh.instanceMatrix.needsUpdate = true;
    },
    reset() { for (const c of coneObjs) Object.assign(c, { s: c.s0, lat: c.lat0, h: 0, vs: 0, vl: 0, vy: 0, rot: 0, hit: false }); W.syncCones(); },
    flash(t) { arrows.material.color.set(Math.sin(t * 9) > 0 ? '#ffb020' : '#3a2a08'); },
    // is same-direction lane j closed by works at s (with lead-in for merging)?
    closed(j, s, lead = 0) { for (const z of zones) if (z.lane === j && s > z.s0 - 50 - lead && s < z.s1 + 5) return z; return null; },
  };
  W.syncCones();
  return W;
}
