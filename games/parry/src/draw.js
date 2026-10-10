// All the art. Bold flat-colour vector shapes with a chunky ink outline:
// backdrops (pre-rendered per stage), characters, projectiles and rings.

export const INK = '#1a1424';
const TAU = Math.PI * 2;

export const PAL = {
  forest: { sky: ['#7fcbe6', '#d4f1ef'], far: '#5ea65a', far2: '#86c06a', ground: '#7cc35a', ground2: '#6ab24c', path: '#e6c88c', path2: '#bf9a5e', deco: '#2f8f48', deco2: '#20703a', accent: '#ffd23f', style: 'dirt' },
  castle: { sky: ['#5b3b7a', '#f39a62'], far: '#3a2648', far2: '#55396a', ground: '#8d8598', ground2: '#7d7589', path: '#bdb3c6', path2: '#8e839c', deco: '#5c4a6e', deco2: '#43344f', accent: '#ffb347', style: 'cobble' },
  desert: { sky: ['#ffc76e', '#fff0c2'], far: '#e8a453', far2: '#f2bd6a', ground: '#f3c877', ground2: '#e8b462', path: '#d39a56', path2: '#b47a3e', deco: '#3a9a6a', deco2: '#287650', accent: '#ff6b3d', style: 'sand' },
  dojo: { sky: ['#141a3d', '#2b3270'], far: '#2a2140', far2: '#f3e3bf', ground: '#8f5d3a', ground2: '#7d4f30', path: '#d6c58a', path2: '#a8955c', deco: '#c8323c', deco2: '#8f1f28', accent: '#ff5a64', style: 'tatami' },
  frozen: { sky: ['#9fd0ee', '#eaf7ff'], far: '#7fa9c9', far2: '#ffffff', ground: '#eef6fb', ground2: '#dce9f2', path: '#b7d3e6', path2: '#86aecb', deco: '#2c5f6e', deco2: '#1d4552', accent: '#3fc8ff', style: 'ice' },
  docks: { sky: ['#ff7f5a', '#ffd88a'], far: '#3b2a40', far2: '#5a3d52', ground: '#2a90a4', ground2: '#227b8e', path: '#bb8550', path2: '#8a5a32', deco: '#6b4a32', deco2: '#4a3222', accent: '#ffd23f', style: 'plank' },
  volcano: { sky: ['#2a0e12', '#8a2a14'], far: '#1a0d10', far2: '#33191a', ground: '#3d3131', ground2: '#302626', path: '#5e4945', path2: '#2a1f1f', deco: '#ff6a1a', deco2: '#ffb01f', accent: '#ffb01f', style: 'basalt' },
  citadel: { sky: ['#1c1236', '#4a2f6e'], far: '#120a22', far2: '#2a1d44', ground: '#4c4070', ground2: '#41365f', path: '#2e2448', path2: '#d8b45a', deco: '#6a5a96', deco2: '#2a2244', accent: '#ffd84d', style: 'marble' },
};

// ---------------------------------------------------------------- helpers
export function rr(c, x, y, w, h, r) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); }
function fs(c, fill, lw) { c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = INK; c.stroke(); } }
export function capsule(c, x1, y1, x2, y2, w, fill, lw = 3) {
  c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = w + lw * 2; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
  c.strokeStyle = fill; c.lineWidth = w; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
}
function circ(c, x, y, r, fill, lw = 3) { c.beginPath(); c.arc(x, y, r, 0, TAU); fs(c, fill, lw); }
function ell(c, x, y, rx, ry, fill, lw = 3, rot = 0) { c.beginPath(); c.ellipse(x, y, rx, ry, rot, 0, TAU); fs(c, fill, lw); }
function poly(c, pts, fill, lw = 3) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); fs(c, fill, lw); }
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
export function shade(hex, k) { // k<0 darker, k>0 lighter
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k);
  return '#' + ((1 << 24) + (f(r) << 16) + (f(g) << 8) + f(b)).toString(16).slice(1);
}

// ---------------------------------------------------------------- backdrops
export function makeBackdrop(bg, L, dpr) {
  const P = PAL[bg], { W, H, hy, cx, cy, u } = L;
  const cv = document.createElement('canvas'); cv.width = Math.ceil(W * dpr); cv.height = Math.ceil(H * dpr);
  const c = cv.getContext('2d'); c.scale(dpr, dpr); c.lineJoin = 'round'; c.lineCap = 'round';
  const R = rng(bg.length * 977 + 3);
  // sky
  const g = c.createLinearGradient(0, 0, 0, hy + 20); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]);
  c.fillStyle = g; c.fillRect(0, 0, W, hy + 30);
  FAR[bg](c, L, P, R);
  // ground
  if (bg === 'docks') drawWater(c, L, P, R);
  else {
    const gg = c.createLinearGradient(0, hy, 0, H); gg.addColorStop(0, shade(P.ground, 0.12)); gg.addColorStop(0.25, P.ground); gg.addColorStop(1, shade(P.ground, -0.06));
    c.fillStyle = gg; c.fillRect(0, hy, W, H - hy);
    c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, hy); c.lineTo(W, hy); c.stroke();
    for (let i = 0; i < 70; i++) { // ground blobs
      const x = R() * W, y = hy + 8 + R() * (H - hy), s = (8 + R() * 26) * u * (0.6 + (y - hy) / (H - hy));
      c.fillStyle = P.ground2; c.beginPath(); c.ellipse(x, y, s, s * 0.45, 0, 0, TAU); c.fill();
    }
  }
  crossPath(c, L, P, R);
  // props in the four quadrants, sorted back to front
  const props = [];
  const pw = L.pw;
  for (let tries = 0; props.length < 15 && tries < 500; tries++) {
    const x = R() * W, y = hy + 14 * u + R() * (H - hy);
    const dx = Math.abs(x - cx), dy = Math.abs(y - cy);
    const vHalf = pw * (0.35 + 0.35 * (y - hy) / (H - hy)) + 46 * u;
    if (dx < vHalf || dy < pw * 0.55 + 42 * u) continue;
    if (Math.hypot(dx / 1.3, dy) < 200 * u) continue;
    if (props.some((p) => Math.hypot(p.x - x, (p.y - y) * 1.5) < 92 * u)) continue;
    props.push({ x, y, r: R() });
  }
  props.sort((a, b) => a.y - b.y);
  for (const p of props) PROP[bg](c, p.x, p.y, u * (0.75 + 0.5 * (p.y - hy) / (H - hy)) * (0.85 + p.r * 0.35), P, p.r);
  // vignette
  const v = c.createRadialGradient(cx, cy, Math.min(W, H) * 0.3, cx, cy, Math.max(W, H) * 0.75);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,5,20,0.35)');
  c.fillStyle = v; c.fillRect(0, 0, W, H);
  return cv;
}

function crossPath(c, L, P, R) {
  const { W, H, hy, cx, cy, pw, u } = L;
  const topW = pw * 0.36, botW = pw * 0.75;
  c.beginPath();
  c.moveTo(cx - topW, hy); c.lineTo(cx + topW, hy); c.lineTo(cx + botW, H + 10); c.lineTo(cx - botW, H + 10); c.closePath();
  c.rect(-10, cy - pw * 0.42, W + 20, pw * 0.84);
  c.ellipse(cx, cy, pw * 1.65, pw * 1.12, 0, 0, TAU);
  c.fillStyle = P.path; c.fill('nonzero');
  // edges
  c.save(); c.clip('nonzero');
  // texture
  const st = P.style;
  c.strokeStyle = P.path2; c.fillStyle = P.path2; c.lineWidth = 2 * u;
  if (st === 'dirt') { for (let i = 0; i < 160; i++) { const x = R() * W, y = hy + R() * (H - hy); c.globalAlpha = 0.5; c.beginPath(); c.ellipse(x, y, 3 * u + R() * 4 * u, 2 * u, 0, 0, TAU); c.fill(); } c.globalAlpha = 1; }
  if (st === 'cobble' || st === 'marble') {
    const s = st === 'cobble' ? 22 * u : 46 * u;
    for (let y = hy; y < H + s; y += s * 0.7) for (let x = ((y / s) % 2) * s * 0.5 - s; x < W + s; x += s) {
      if (st === 'cobble') { c.globalAlpha = 0.55; rr(c, x + 2, y + 2, s - 4, s * 0.7 - 4, 5 * u); c.stroke(); }
      else { c.globalAlpha = 0.35; c.strokeStyle = shade(P.path, 0.25); c.strokeRect(x, y, s, s * 0.7); }
    }
    c.globalAlpha = 1;
  }
  if (st === 'sand') { c.globalAlpha = 0.45; for (let i = 0; i < 40; i++) { const x = R() * W, y = hy + R() * (H - hy); c.beginPath(); c.moveTo(x - 30 * u, y); c.quadraticCurveTo(x, y - 6 * u, x + 30 * u, y); c.stroke(); } c.globalAlpha = 1; }
  if (st === 'tatami') { c.globalAlpha = 0.6; const s = 58 * u; for (let y = hy; y < H; y += s) for (let x = cx - s * 8 + ((y / s | 0) % 2) * s; x < W; x += s * 2) { c.strokeRect(x, y, s * 2, s); } c.globalAlpha = 1; }
  if (st === 'ice') { c.globalAlpha = 0.6; for (let i = 0; i < 30; i++) { let x = R() * W, y = hy + R() * (H - hy); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 50 * u; y += (R() - 0.5) * 30 * u; c.lineTo(x, y); } c.stroke(); } c.globalAlpha = 1; }
  if (st === 'plank') { c.globalAlpha = 0.7; const s = 14 * u; for (let y = cy - pw; y < cy + pw; y += s) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } for (let x = cx - pw * 2; x < cx + pw * 2; x += s) { c.beginPath(); c.moveTo(x, hy); c.lineTo(x, H); c.stroke(); } c.globalAlpha = 1; }
  if (st === 'basalt') { c.lineWidth = 2.5 * u; for (let i = 0; i < 26; i++) { let x = R() * W, y = hy + R() * (H - hy); c.strokeStyle = i % 3 ? P.path2 : P.deco; c.globalAlpha = i % 3 ? 0.7 : 0.8; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (R() - 0.5) * 60 * u; y += (R() - 0.5) * 30 * u; c.lineTo(x, y); } c.stroke(); } c.globalAlpha = 1; }
  c.restore();
  // inlay at the centre
  c.lineWidth = 3 * u; c.strokeStyle = P.path2;
  c.beginPath(); c.ellipse(cx, cy, pw * 1.65, pw * 1.12, 0, 0, TAU); c.stroke();
  c.globalAlpha = 0.5; c.beginPath(); c.ellipse(cx, cy, pw * 1.2, pw * 0.8, 0, 0, TAU); c.stroke(); c.globalAlpha = 1;
  // outline of the cross
  c.strokeStyle = INK; c.lineWidth = 3;
  c.beginPath(); c.moveTo(cx - topW, hy); c.lineTo(cx - topW - (botW - topW) * (cy - pw * 0.42 - hy) / (H - hy), cy - pw * 0.42); c.stroke();
  c.beginPath(); c.moveTo(cx + topW, hy); c.lineTo(cx + topW + (botW - topW) * (cy - pw * 0.42 - hy) / (H - hy), cy - pw * 0.42); c.stroke();
  const kx = (y) => topW + (botW - topW) * (y - hy) / (H - hy);
  c.beginPath(); c.moveTo(cx - kx(cy + pw * 0.42), cy + pw * 0.42); c.lineTo(cx - botW, H + 4); c.stroke();
  c.beginPath(); c.moveTo(cx + kx(cy + pw * 0.42), cy + pw * 0.42); c.lineTo(cx + botW, H + 4); c.stroke();
  c.beginPath(); c.moveTo(-4, cy - pw * 0.42); c.lineTo(cx - pw * 1.2, cy - pw * 0.42); c.moveTo(cx + pw * 1.2, cy - pw * 0.42); c.lineTo(W + 4, cy - pw * 0.42); c.stroke();
  c.beginPath(); c.moveTo(-4, cy + pw * 0.42); c.lineTo(cx - pw * 1.2, cy + pw * 0.42); c.moveTo(cx + pw * 1.2, cy + pw * 0.42); c.lineTo(W + 4, cy + pw * 0.42); c.stroke();
}

function drawWater(c, L, P, R) {
  const { W, H, hy, u } = L;
  c.fillStyle = P.ground; c.fillRect(0, hy, W, H - hy);
  c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, hy); c.lineTo(W, hy); c.stroke();
  c.strokeStyle = shade(P.ground, 0.25); c.lineWidth = 3 * u;
  for (let i = 0; i < 60; i++) { const x = R() * W, y = hy + 10 + R() * (H - hy); const s = (10 + R() * 20) * u; c.beginPath(); c.moveTo(x - s, y); c.quadraticCurveTo(x - s / 2, y - 5 * u, x, y); c.quadraticCurveTo(x + s / 2, y - 5 * u, x + s, y); c.stroke(); }
}

const FAR = {
  forest(c, L, P, R) {
    const { W, hy, u } = L;
    circ(c, W * 0.8, hy * 0.42, 34 * u, '#fff3b0', 0);
    for (const [k, col] of [[0.0, P.far2], [1, P.far]]) {
      c.beginPath(); c.moveTo(0, hy);
      for (let x = 0; x <= W + 60; x += 60 * u) c.lineTo(x, hy - (k ? 18 : 40) * u - Math.sin(x * 0.01 + k * 2) * 14 * u - R() * 6 * u);
      c.lineTo(W, hy); c.closePath(); fs(c, col, 3);
    }
    for (let x = R() * 30; x < W; x += 34 * u + R() * 30 * u) { const s = (10 + R() * 10) * u; circ(c, x, hy - 14 * u - R() * 8 * u, s, P.deco, 2.5); }
  },
  castle(c, L, P, R) {
    const { W, hy, cx, u } = L;
    circ(c, W * 0.18, hy * 0.5, 26 * u, '#ffe3a8', 0);
    // wall with crenellations
    const top = hy - 46 * u;
    c.beginPath(); c.moveTo(0, hy); c.lineTo(0, top);
    for (let x = 0; x < W; x += 24 * u) { c.lineTo(x, top - 10 * u); c.lineTo(x + 12 * u, top - 10 * u); c.lineTo(x + 12 * u, top); c.lineTo(x + 24 * u, top); }
    c.lineTo(W, hy); c.closePath(); fs(c, P.far2, 3);
    for (const tx of [cx - 120 * u, cx + 120 * u]) {
      rr(c, tx - 26 * u, hy - 96 * u, 52 * u, 96 * u, 2); fs(c, P.far, 3);
      poly(c, [tx - 34 * u, hy - 94 * u, tx, hy - 140 * u, tx + 34 * u, hy - 94 * u], '#7a3050', 3);
      rr(c, tx - 6 * u, hy - 70 * u, 12 * u, 18 * u, 6 * u); fs(c, '#ffcf6a', 2);
      // banner
      poly(c, [tx + 26 * u, hy - 80 * u, tx + 44 * u, hy - 80 * u, tx + 44 * u, hy - 44 * u, tx + 35 * u, hy - 52 * u, tx + 26 * u, hy - 44 * u], '#c8323c', 2.5);
    }
    // gate arch where the up lane enters
    c.beginPath(); c.moveTo(cx - 30 * u, hy); c.lineTo(cx - 30 * u, hy - 34 * u); c.arc(cx, hy - 34 * u, 30 * u, Math.PI, 0); c.lineTo(cx + 30 * u, hy); c.closePath(); fs(c, '#1d1226', 3);
    c.strokeStyle = '#4a3a2a'; c.lineWidth = 2 * u; for (let x = cx - 22 * u; x <= cx + 22 * u; x += 11 * u) { c.beginPath(); c.moveTo(x, hy - 50 * u); c.lineTo(x, hy - 22 * u); c.stroke(); }
  },
  desert(c, L, P, R) {
    const { W, hy, u } = L;
    circ(c, W * 0.25, hy * 0.45, 40 * u, '#fff8d0', 0);
    poly(c, [W * 0.62, hy, W * 0.7, hy - 70 * u, W * 0.78, hy], P.far, 3);
    poly(c, [W * 0.7, hy - 70 * u, W * 0.78, hy, W * 0.74, hy], shade(P.far, -0.15), 0);
    poly(c, [W * 0.76, hy, W * 0.81, hy - 42 * u, W * 0.86, hy], P.far, 3);
    c.beginPath(); c.moveTo(0, hy); for (let x = 0; x <= W; x += 20) c.lineTo(x, hy - 14 * u - Math.sin(x * 0.006) * 12 * u); c.lineTo(W, hy); c.closePath(); fs(c, P.far2, 3);
  },
  dojo(c, L, P, R) {
    const { W, hy, cx, u } = L;
    // back wall: lit shoji screens with a round moon window in the middle
    c.fillStyle = P.far; c.fillRect(0, 0, W, hy);
    const pane = 54 * u;
    for (let x = -((cx % pane)); x < W; x += pane) {
      rr(c, x + 4 * u, hy * 0.18, pane - 8 * u, hy * 0.82 - 6 * u, 2); fs(c, P.far2, 3);
      c.strokeStyle = shade(P.far2, -0.3); c.lineWidth = 2 * u;
      for (let k = 1; k < 4; k++) { const yy = hy * 0.18 + (hy * 0.82 - 6 * u) * k / 4; c.beginPath(); c.moveTo(x + 4 * u, yy); c.lineTo(x + pane - 4 * u, yy); c.stroke(); }
      c.beginPath(); c.moveTo(x + pane / 2, hy * 0.18); c.lineTo(x + pane / 2, hy - 6 * u); c.stroke();
    }
    const mr = Math.min(hy * 0.42, 60 * u);
    circ(c, cx, hy * 0.55, mr + 6 * u, '#3a2a40', 3);
    const mg = c.createLinearGradient(0, hy * 0.55 - mr, 0, hy * 0.55 + mr); mg.addColorStop(0, P.sky[0]); mg.addColorStop(1, P.sky[1]);
    circ(c, cx, hy * 0.55, mr, mg, 3);
    circ(c, cx + mr * 0.25, hy * 0.5, mr * 0.45, '#fff4d8', 0);
    c.fillStyle = '#3a2a40'; c.fillRect(0, 0, W, hy * 0.14); c.strokeStyle = INK; c.lineWidth = 3; c.strokeRect(-2, -2, W + 4, hy * 0.14 + 2);
  },
  frozen(c, L, P, R) {
    const { W, hy, u } = L;
    for (const [k, col] of [[0, '#b8d4ea'], [1, P.far]]) {
      c.beginPath(); c.moveTo(0, hy);
      let x = -20; while (x < W + 40) { const h = (k ? 50 : 80) * u + R() * 40 * u; c.lineTo(x + 40 * u, hy - h); c.lineTo(x + 80 * u, hy - h * 0.3); x += 80 * u; }
      c.lineTo(W, hy); c.closePath(); fs(c, col, 3);
    }
    for (let x = R() * 20; x < W; x += 22 * u + R() * 26 * u) { const h = (18 + R() * 14) * u; poly(c, [x - 9 * u, hy, x, hy - h, x + 9 * u, hy], P.deco, 2.5); }
  },
  docks(c, L, P, R) {
    const { W, hy, u } = L;
    circ(c, W * 0.5, hy - 4 * u, 46 * u, '#ffe9a6', 0);
    c.fillStyle = '#e8708a'; c.fillRect(0, hy - 8 * u, W, 8 * u);
    for (const sx of [W * 0.18, W * 0.82]) { // ships
      const s = u;
      poly(c, [sx - 60 * s, hy - 12 * s, sx + 60 * s, hy - 12 * s, sx + 44 * s, hy + 2, sx - 44 * s, hy + 2], P.far, 3);
      capsule(c, sx, hy - 12 * s, sx, hy - 92 * s, 4 * s, P.far, 2);
      poly(c, [sx + 4 * s, hy - 88 * s, sx + 44 * s, hy - 54 * s, sx + 4 * s, hy - 24 * s], '#f3e3c3', 3);
      poly(c, [sx - 4 * s, hy - 80 * s, sx - 34 * s, hy - 40 * s, sx - 4 * s, hy - 30 * s], '#e8d4b0', 3);
      poly(c, [sx, hy - 92 * s, sx + 18 * s, hy - 88 * s, sx, hy - 84 * s], '#1a1424', 0);
    }
  },
  volcano(c, L, P, R) {
    const { W, hy, cx, u } = L;
    const vx = W * 0.68;
    poly(c, [vx - 220 * u, hy, vx - 40 * u, hy - 120 * u, vx + 40 * u, hy - 120 * u, vx + 220 * u, hy], P.far, 3);
    poly(c, [vx - 40 * u, hy - 120 * u, vx - 10 * u, hy - 108 * u, vx + 14 * u, hy - 118 * u, vx + 40 * u, hy - 120 * u, vx + 20 * u, hy - 96 * u, vx - 26 * u, hy - 92 * u], '#ff6a1a', 2.5);
    c.strokeStyle = '#ff6a1a'; c.lineWidth = 5 * u; c.beginPath(); c.moveTo(vx - 6 * u, hy - 100 * u); c.quadraticCurveTo(vx - 30 * u, hy - 50 * u, vx - 70 * u, hy); c.stroke();
    for (let i = 0; i < 5; i++) circ(c, vx - 20 * u + i * 12 * u, hy - 130 * u - i * 22 * u, (16 + i * 6) * u, 'rgba(60,40,40,0.7)', 0);
    c.beginPath(); c.moveTo(0, hy); for (let x = 0; x <= W; x += 30) c.lineTo(x, hy - 10 * u - Math.abs(Math.sin(x * 0.02)) * 18 * u); c.lineTo(W, hy); c.closePath(); fs(c, P.far2, 3);
  },
  citadel(c, L, P, R) {
    const { W, hy, cx, u } = L;
    for (let i = 0; i < 9; i++) ell(c, R() * W, hy * (0.15 + R() * 0.5), (60 + R() * 80) * u, (14 + R() * 12) * u, 'rgba(90,70,130,0.55)', 0);
    const spire = (x, h, w) => {
      rr(c, x - w / 2, hy - h, w, h, 1); fs(c, P.far, 3);
      poly(c, [x - w / 2 - 6 * u, hy - h, x, hy - h - w * 1.6, x + w / 2 + 6 * u, hy - h], P.far2, 3);
      for (let k = 0; k < 3; k++) { rr(c, x - 3 * u, hy - h + 14 * u + k * 22 * u, 6 * u, 10 * u, 3 * u); fs(c, '#ffd84d', 0); }
    };
    spire(cx - 170 * u, 80 * u, 30 * u); spire(cx + 170 * u, 90 * u, 30 * u); spire(cx - 80 * u, 110 * u, 36 * u); spire(cx + 80 * u, 104 * u, 36 * u); spire(cx, 150 * u, 46 * u);
    c.fillStyle = P.far; c.fillRect(0, hy - 30 * u, W, 30 * u); c.strokeStyle = INK; c.lineWidth = 3; c.beginPath(); c.moveTo(0, hy - 30 * u); c.lineTo(W, hy - 30 * u); c.stroke();
  },
};

const PROP = {
  forest(c, x, y, s, P, r) {
    if (r < 0.65) { // round tree
      ell(c, x, y, 30 * s, 9 * s, 'rgba(0,0,0,0.18)', 0);
      capsule(c, x, y, x, y - 30 * s, 9 * s, '#7a4a2a', 3);
      circ(c, x - 14 * s, y - 44 * s, 22 * s, P.deco2, 3); circ(c, x + 14 * s, y - 46 * s, 22 * s, P.deco2, 3); circ(c, x, y - 62 * s, 26 * s, P.deco, 3);
      circ(c, x - 6 * s, y - 70 * s, 8 * s, shade(P.deco, 0.25), 0);
    } else { // bush with flowers
      ell(c, x, y - 8 * s, 24 * s, 14 * s, P.deco, 3); circ(c, x - 8 * s, y - 14 * s, 3 * s, '#ff6a8a', 0); circ(c, x + 9 * s, y - 10 * s, 3 * s, '#fff', 0);
    }
  },
  castle(c, x, y, s, P, r) {
    if (r < 0.5) { // torch post
      capsule(c, x, y, x, y - 44 * s, 6 * s, '#4a3a2a', 3);
      poly(c, [x - 9 * s, y - 44 * s, x + 9 * s, y - 44 * s, x + 6 * s, y - 52 * s, x - 6 * s, y - 52 * s], '#3a3040', 2.5);
    } else { // crate stack
      rr(c, x - 18 * s, y - 30 * s, 36 * s, 30 * s, 2); fs(c, '#a0703f', 3);
      c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 18 * s, y - 30 * s); c.lineTo(x + 18 * s, y); c.stroke();
    }
  },
  desert(c, x, y, s, P, r) {
    if (r < 0.55) { // cactus
      ell(c, x, y, 18 * s, 6 * s, 'rgba(0,0,0,0.15)', 0);
      capsule(c, x, y, x, y - 54 * s, 14 * s, P.deco, 3);
      capsule(c, x - 7 * s, y - 28 * s, x - 18 * s, y - 28 * s, 9 * s, P.deco, 3); capsule(c, x - 18 * s, y - 28 * s, x - 18 * s, y - 44 * s, 9 * s, P.deco, 3);
      capsule(c, x + 7 * s, y - 36 * s, x + 16 * s, y - 36 * s, 9 * s, P.deco, 3); capsule(c, x + 16 * s, y - 36 * s, x + 16 * s, y - 48 * s, 9 * s, P.deco, 3);
      capsule(c, x, y - 4 * s, x, y - 54 * s, 14 * s, P.deco, 0);
    } else { // sandstone rocks
      poly(c, [x - 24 * s, y, x - 18 * s, y - 20 * s, x + 2 * s, y - 26 * s, x + 22 * s, y - 14 * s, x + 26 * s, y], '#c8804a', 3);
    }
  },
  dojo(c, x, y, s, P, r) {
    if (r < 0.6) { // paper lantern on a stand
      capsule(c, x, y, x, y - 40 * s, 4 * s, '#3a2418', 2.5);
      ell(c, x, y - 56 * s, 14 * s, 18 * s, P.deco, 3);
      c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 14 * s, y - 56 * s); c.lineTo(x + 14 * s, y - 56 * s); c.stroke();
      ell(c, x, y - 56 * s, 6 * s, 12 * s, 'rgba(255,220,140,0.5)', 0);
    } else { // bonsai pot
      rr(c, x - 16 * s, y - 14 * s, 32 * s, 14 * s, 3 * s); fs(c, '#4a5a8a', 3);
      capsule(c, x, y - 14 * s, x + 6 * s, y - 34 * s, 5 * s, '#5a3a24', 2.5);
      ell(c, x + 6 * s, y - 38 * s, 20 * s, 9 * s, '#3a8a5a', 3);
    }
  },
  frozen(c, x, y, s, P, r) {
    if (r < 0.7) { // snowy pine
      ell(c, x, y, 22 * s, 7 * s, 'rgba(0,30,60,0.15)', 0);
      capsule(c, x, y, x, y - 14 * s, 7 * s, '#5a3a2a', 3);
      for (let k = 0; k < 3; k++) { const yy = y - 12 * s - k * 18 * s, w = (28 - k * 7) * s; poly(c, [x - w, yy, x, yy - 30 * s, x + w, yy], P.deco, 3); poly(c, [x - w * 0.45, yy - 16 * s, x, yy - 30 * s, x + w * 0.45, yy - 16 * s], '#fff', 0); }
    } else { // ice crystal rock
      poly(c, [x - 16 * s, y, x - 10 * s, y - 30 * s, x, y - 40 * s, x + 8 * s, y - 26 * s, x + 18 * s, y], '#a8e4ff', 3);
    }
  },
  docks(c, x, y, s, P, r) {
    if (r < 0.5) { // mooring post
      capsule(c, x, y, x, y - 22 * s, 10 * s, P.deco, 3);
      ell(c, x, y, 16 * s, 5 * s, 'rgba(255,255,255,0.4)', 0);
    } else { // floating barrel
      ell(c, x, y, 20 * s, 6 * s, 'rgba(255,255,255,0.35)', 0);
      rr(c, x - 14 * s, y - 24 * s, 28 * s, 26 * s, 6 * s); fs(c, '#9a6438', 3);
      c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x - 14 * s, y - 16 * s); c.lineTo(x + 14 * s, y - 16 * s); c.moveTo(x - 14 * s, y - 6 * s); c.lineTo(x + 14 * s, y - 6 * s); c.stroke();
    }
  },
  volcano(c, x, y, s, P, r) {
    if (r < 0.6) { // jagged rock with a glowing seam
      poly(c, [x - 26 * s, y, x - 14 * s, y - 34 * s, x + 2 * s, y - 22 * s, x + 12 * s, y - 42 * s, x + 26 * s, y], '#251b1c', 3);
      c.strokeStyle = '#ff6a1a'; c.lineWidth = 3 * s; c.beginPath(); c.moveTo(x - 6 * s, y - 2 * s); c.lineTo(x + 2 * s, y - 18 * s); c.lineTo(x + 10 * s, y - 30 * s); c.stroke();
    } else { // lava pool
      ell(c, x, y, 34 * s, 12 * s, '#ff6a1a', 3); ell(c, x - 4 * s, y - 2 * s, 18 * s, 5 * s, '#ffd04a', 0);
    }
  },
  citadel(c, x, y, s, P, r) {
    if (r < 0.6) { // pillar with brazier
      rr(c, x - 12 * s, y - 60 * s, 24 * s, 60 * s, 2); fs(c, P.deco, 3);
      rr(c, x - 16 * s, y - 66 * s, 32 * s, 8 * s, 2); fs(c, P.deco2, 3);
      ell(c, x, y - 70 * s, 12 * s, 6 * s, '#c070ff', 0);
    } else { // gold-trimmed rubble
      poly(c, [x - 20 * s, y, x - 14 * s, y - 16 * s, x + 10 * s, y - 20 * s, x + 20 * s, y], P.deco, 3);
    }
  },
};

// live ambient layer drawn over the backdrop every frame
export function ambient(c, bg, L, t, beatPulse, flashCol) {
  const { W, H, hy, u } = L;
  if (bg === 'frozen') { c.fillStyle = '#fff'; for (let i = 0; i < 60; i++) { const x = (i * 97.3 + t * (20 + (i % 5) * 8)) % (W + 20) - 10, y = (i * 53.1 + t * (40 + (i % 7) * 10)) % (H + 20) - 10; c.globalAlpha = 0.7; c.beginPath(); c.arc(x, y, (1.5 + (i % 3)) * u, 0, TAU); c.fill(); } c.globalAlpha = 1; }
  if (bg === 'volcano') { for (let i = 0; i < 40; i++) { const x = (i * 131.7 + Math.sin(t + i) * 30) % W, y = H - ((i * 71.3 + t * (30 + (i % 6) * 12)) % (H + 40)); c.fillStyle = i % 2 ? '#ffb01f' : '#ff6a1a'; c.globalAlpha = 0.8; c.fillRect(x, y, 3 * u, 3 * u); } c.globalAlpha = 1; }
  if (bg === 'forest') { for (let i = 0; i < 14; i++) { const x = (i * 157 + t * 26 + Math.sin(t * 1.3 + i) * 30) % (W + 40) - 20, y = (i * 89 + t * 34) % (H + 40) - 20; c.save(); c.translate(x, y); c.rotate(t * 2 + i); ell(c, 0, 0, 6 * u, 3 * u, i % 2 ? '#e8a23a' : '#9ccf4a', 1.5); c.restore(); } }
  if (bg === 'desert') { c.strokeStyle = 'rgba(255,240,200,0.5)'; c.lineWidth = 2 * u; for (let i = 0; i < 16; i++) { const x = (i * 211 + t * 160) % (W + 200) - 100, y = hy + (i * 67) % (H - hy); c.beginPath(); c.moveTo(x, y); c.lineTo(x + 60 * u, y); c.stroke(); } }
  if (bg === 'dojo') { for (let i = 0; i < 12; i++) { const x = (i * 173 + t * 22 + Math.sin(t + i) * 20) % (W + 40) - 20, y = (i * 113 + t * 30) % (H + 40) - 20; c.save(); c.translate(x, y); c.rotate(t + i); ell(c, 0, 0, 5 * u, 3 * u, '#ffb0c8', 1.5); c.restore(); } }
  if (bg === 'docks') { c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3 * u; for (let i = 0; i < 18; i++) { const x = (i * 149 + t * 18) % (W + 60) - 30, y = hy + 20 + (i * 83) % (H - hy); c.beginPath(); c.moveTo(x - 16 * u, y + Math.sin(t * 2 + i) * 2); c.quadraticCurveTo(x, y - 6 * u, x + 16 * u, y + Math.sin(t * 2 + i) * 2); c.stroke(); } }
  if (bg === 'citadel') {
    c.strokeStyle = 'rgba(190,180,255,0.35)'; c.lineWidth = 1.5 * u;
    for (let i = 0; i < 70; i++) { const x = (i * 61.7 + t * 120) % (W + 60) - 30, y = (i * 97.1 + t * 700) % (H + 40) - 20; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 6 * u, y + 18 * u); c.stroke(); }
    const fl = Math.max(0, Math.sin(t * 0.9) * Math.sin(t * 2.3) - 0.92) * 10;
    if (fl > 0) { c.fillStyle = `rgba(220,210,255,${Math.min(0.5, fl)})`; c.fillRect(0, 0, W, H); }
  }
}

// ---------------------------------------------------------------- characters
export const LOOKS = {
  hero: { body: '#3f6fe0', body2: '#2b4fae', skin: '#f2c49b', leg: '#3a2f45', trim: '#ffd23f', head: 'helm', cape: '#e0343f', size: 1.25 },
  archer: { body: '#4f9a3c', body2: '#3b7a2c', skin: '#f0b98e', leg: '#4a3a2a', trim: '#c8a24a', head: 'hood', hood: '#2f6f2a', weapon: 'bow' },
  swords: { body: '#c8402e', body2: '#8f2a1e', skin: '#e9b088', leg: '#3a2f45', trim: '#f3d36a', head: 'bandana', band: '#2a2a3a', weapon: 'sword' },
  axeman: { body: '#8a5a3a', body2: '#6a4028', skin: '#e9b088', leg: '#3a2f45', trim: '#c9d3e0', head: 'horns', weapon: 'axe' },
  mage: { body: '#6a3fb8', body2: '#4a2a8a', skin: '#f0c49b', leg: '#2a2040', trim: '#ffd23f', head: 'wizard', weapon: 'staff' },
  rogue: { body: '#9a3fd0', body2: '#6a2a98', skin: '#e9b088', leg: '#2a2040', trim: '#7df9ff', head: 'mask', weapon: 'sword', cape: '#5a2088' },
  ninja: { body: '#2c2c40', body2: '#1c1c2c', skin: '#e9b088', leg: '#1c1c2c', trim: '#e0343f', head: 'ninja', weapon: 'daggers' },
  ogre: { body: '#7a5a3a', body2: '#5a4028', skin: '#8fb04a', leg: '#4a3a2a', trim: '#c9d3e0', head: 'ogre', weapon: 'none', size: 1.35 },
  bomber: { body: '#6b4a2a', body2: '#4a3220', skin: '#7fbf4a', leg: '#3a2a20', trim: '#e0343f', head: 'goblin', weapon: 'bomb', size: 0.85 },
  // bosses
  brute: { body: '#e0a072', body2: '#b07a50', skin: '#e0a072', leg: '#5a3a2a', trim: '#8a4a2a', head: 'brute', weapon: 'bigaxe', size: 2.0, belt: '#5a3220' },
  knight: { body: '#9aa6b8', body2: '#6f7a8c', skin: '#9aa6b8', leg: '#5a6475', trim: '#2a5ac8', head: 'greathelm', weapon: 'greatsword', size: 2.0, tabard: '#2a5ac8' },
  ogreboss: { body: '#d08a4a', body2: '#a86a34', skin: '#c88a50', leg: '#6a3a6a', trim: '#ffd23f', head: 'turban', weapon: 'scimitar', size: 2.1, belt: '#8a2a6a' },
  sensei: { body: '#22222e', body2: '#14141c', skin: '#e9b088', leg: '#14141c', trim: '#e0343f', head: 'straw', weapon: 'katana', size: 1.9 },
  giant: { body: '#5a7a9a', body2: '#3f5a78', skin: '#a8d0e8', leg: '#3a4a5a', trim: '#e8f6ff', head: 'giant', weapon: 'club', size: 2.15 },
  captain: { body: '#b8282e', body2: '#8a1c22', skin: '#e9b088', leg: '#2a2030', trim: '#ffd23f', head: 'tricorn', weapon: 'cutlass', size: 1.95 },
  magma: { body: '#3a2a2a', body2: '#2a1c1c', skin: '#4a3434', leg: '#2a1c1c', trim: '#ff6a1a', head: 'magma', weapon: 'hammer', size: 2.15 },
  king: { body: '#2e2840', body2: '#1e1a2c', skin: '#2e2840', leg: '#1e1a2c', trim: '#ffd84d', head: 'crown', weapon: 'greatsword', size: 2.1, glow: '#c070ff' },
};

// f: { x, y, s, kind, view: 'front'|'back'|'side', flip, aim, raise, stride, sq, flash, alpha, shield, hurt, eye }
export function figure(c, f) {
  const Lk = LOOKS[f.kind] || LOOKS.swords;
  const s = f.s * (Lk.size || 1);
  const lw = 3.2;
  c.save();
  c.globalAlpha = f.alpha ?? 1;
  c.translate(f.x, f.y);
  // shadow
  c.fillStyle = 'rgba(10,0,30,0.25)'; c.beginPath(); c.ellipse(0, 0, 24 * s, 7 * s, 0, 0, TAU); c.fill();
  c.translate(0, -(f.lift || 0) * s);
  const sq = f.sq || 0; // squash: + = squash down, - = stretch up
  c.scale(s * (1 + sq * 0.5), s * (1 - sq));
  if (f.rot) c.rotate(f.rot);
  if (f.view === 'side' && f.flip) c.scale(-1, 1);
  const view = f.view;
  const st = f.stride || 0;
  const big = /brute|knight|ogreboss|giant|magma|ogre/.test(f.kind);
  const bw = big ? 19 : 15; // half body width
  const aim = f.aim ?? 0, raise = f.raise || 0;
  const wAng = aim - raise * 2.3;
  const shoulder = view === 'side' ? [4, -41] : [bw - 1, -41];
  const hand = [shoulder[0] + Math.cos(wAng) * 17, shoulder[1] + Math.sin(wAng) * 17];
  const flash = f.flash || 0;
  const col = (x) => flash > 0.01 ? mix(x, '#ffffff', flash) : x;

  // cape behind (front/side), on top for back view
  const cape = Lk.cape;
  const drawCape = () => {
    if (!cape) return;
    const wv = Math.sin((f.t || 0) * 6) * 3;
    if (view === 'side') poly(c, [-6, -46, -20 - wv, -8, -6, -12], col(cape), lw);
    else poly(c, [-bw + 1, -46, bw - 1, -46, bw + 4 + wv, -6, -bw - 4 - wv, -6], col(cape), lw);
  };
  if (view !== 'back') drawCape();
  // legs
  if (view === 'side') { capsule(c, -4, -20, -6 - st * 8, 0, 9, col(Lk.leg), lw); capsule(c, 4, -20, 6 + st * 8, 0, 9, col(Lk.leg), lw); }
  else { capsule(c, -7, -20, -8, -1 + Math.max(0, st) * -4, 9, col(Lk.leg), lw); capsule(c, 7, -20, 8, -1 + Math.max(0, -st) * -4, 9, col(Lk.leg), lw); }
  // back arm
  const offHand = view === 'side' ? [-8, -26] : [-bw - 5, -26];
  if (view === 'side') capsule(c, -2, -41, offHand[0], offHand[1], 8, col(Lk.body2), lw);
  // weapon behind body when held in the back view
  if (view === 'back') weapon(c, Lk.weapon, hand[0], hand[1], wAng, f, col, lw);
  // body
  const w2 = view === 'side' ? bw - 3 : bw;
  rr(c, -w2, -50, w2 * 2, 34, 8); fs(c, col(Lk.body), lw);
  if (Lk.tabard) { rr(c, -w2 * 0.55, -46, w2 * 1.1, 32, 3); fs(c, col(Lk.tabard), 2.4); }
  rr(c, -w2, -27, w2 * 2, 6, 2); fs(c, col(Lk.belt || Lk.trim), 2.4);
  if (Lk.kind === undefined && f.kind === 'magma') { c.strokeStyle = '#ff6a1a'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-8, -46); c.lineTo(-2, -36); c.lineTo(-9, -28); c.moveTo(6, -48); c.lineTo(10, -38); c.stroke(); }
  if (view !== 'side') capsule(c, -bw + 1, -41, offHand[0], offHand[1], 8, col(Lk.body2), lw);
  if (view === 'back') drawCape();
  // head
  head(c, Lk, view, f, col, lw);
  // weapon arm in front
  if (view !== 'back') {
    capsule(c, shoulder[0], shoulder[1], hand[0], hand[1], 8, col(Lk.body2), lw);
    weapon(c, Lk.weapon, hand[0], hand[1], wAng, f, col, lw);
    circ(c, hand[0], hand[1], 4.5, col(Lk.skin), 2.4);
  }
  if (f.shield) shield(c, f.shield, col, lw);
  c.restore();
}

function mix(a, b, k) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = (pa >> 16) + ((pb >> 16) - (pa >> 16)) * k, g = ((pa >> 8) & 255) + (((pb >> 8) & 255) - ((pa >> 8) & 255)) * k, bl = (pa & 255) + ((pb & 255) - (pa & 255)) * k;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
}

function eyes(c, view, y, angry, col = INK, glow) {
  if (view === 'back') return;
  c.fillStyle = col;
  const pts = view === 'side' ? [7] : [-5, 5];
  for (const x of pts) { c.beginPath(); c.ellipse(x, y, 2.2, 3, 0, 0, TAU); c.fill(); }
  if (glow) { c.fillStyle = glow; for (const x of pts) { c.beginPath(); c.arc(x, y, 1.4, 0, TAU); c.fill(); } }
  if (angry) {
    c.strokeStyle = INK; c.lineWidth = 2.6; c.beginPath();
    if (view === 'side') { c.moveTo(3, y - 6); c.lineTo(11, y - 3); }
    else { c.moveTo(-9, y - 6); c.lineTo(-2, y - 3.5); c.moveTo(9, y - 6); c.lineTo(2, y - 3.5); }
    c.stroke();
  }
}

function head(c, Lk, view, f, col, lw) {
  const hx = view === 'side' ? 2 : 0, hy = -62, r = 13;
  const H = Lk.head;
  const skin = col(Lk.skin);
  const sideK = view === 'side' ? 1 : 0;
  switch (H) {
    case 'helm': {
      circ(c, hx, hy, r, skin, lw);
      c.beginPath(); c.arc(hx, hy + 1, r + 1.5, Math.PI * 1.02, Math.PI * 1.98); c.lineTo(hx + r + 1.5, hy + 3); c.lineTo(hx - r - 1.5, hy + 3); c.closePath(); fs(c, col('#c9d3e0'), lw);
      if (view !== 'back') { rr(c, hx - (view === 'side' ? -2 : 9), hy - 1, view === 'side' ? 10 : 18, 4, 2); fs(c, INK, 0); c.fillStyle = '#fff'; c.fillRect(hx + (view === 'side' ? 6 : -6), hy, 3, 1.6); if (view !== 'side') c.fillRect(hx + 3, hy, 3, 1.6); }
      // plume
      c.beginPath(); c.moveTo(hx - (sideK ? 12 : 3), hy - r + 1); c.quadraticCurveTo(hx - (sideK ? 6 : 0), hy - r - 14, hx + (sideK ? 8 : 3), hy - r - 2); c.closePath(); fs(c, col(Lk.cape), lw);
      break;
    }
    case 'hood': {
      if (view === 'side') poly(c, [hx - 14, hy + 8, hx - 20, hy - 6, hx - 4, hy - 16, hx + 12, hy - 8, hx + 14, hy + 8], col(Lk.hood), lw);
      else circ(c, hx, hy - 1, r + 3, col(Lk.hood), lw);
      if (view !== 'back') { ell(c, hx + (sideK ? 6 : 0), hy + 2, view === 'side' ? 7 : 9, 8, skin, 2.4); eyes(c, view, hy + 1, true); }
      break;
    }
    case 'bandana': {
      circ(c, hx, hy, r, skin, lw);
      c.beginPath(); c.arc(hx, hy, r, Math.PI, 0); c.lineTo(hx + r, hy - 3); c.lineTo(hx - r, hy - 3); c.closePath(); fs(c, col(Lk.body), lw);
      if (view === 'side') poly(c, [hx - r, hy - 6, hx - r - 10, hy - 2, hx - r - 8, hy + 4], col(Lk.body), 2.4);
      eyes(c, view, hy + 2, true);
      break;
    }
    case 'horns': {
      circ(c, hx, hy, r, skin, lw);
      for (const sgn of view === 'side' ? [-1] : [-1, 1]) { c.beginPath(); c.moveTo(hx + sgn * 9, hy - 8); c.quadraticCurveTo(hx + sgn * 22, hy - 12, hx + sgn * 20, hy - 26); c.quadraticCurveTo(hx + sgn * 14, hy - 14, hx + sgn * 4, hy - 12); c.closePath(); fs(c, col('#f3ead6'), 2.6); }
      c.beginPath(); c.arc(hx, hy, r + 1, Math.PI, 0); c.closePath(); fs(c, col(Lk.trim), lw);
      eyes(c, view, hy + 3, true);
      if (view !== 'back') { c.beginPath(); c.moveTo(hx - 10 + sideK * 10, hy + 6); c.quadraticCurveTo(hx + sideK * 6, hy + 20, hx + 10, hy + 6); fs(c, col('#c87a3a'), 2.4); }
      break;
    }
    case 'wizard': {
      circ(c, hx, hy, r, skin, lw);
      eyes(c, view, hy + 2, true);
      if (view !== 'back') { c.beginPath(); c.moveTo(hx - 8 + sideK * 8, hy + 7); c.lineTo(hx + sideK * 8, hy + 22); c.lineTo(hx + 8, hy + 7); fs(c, col('#e8e8f0'), 2.4); }
      ell(c, hx, hy - 9, 20, 5, col(Lk.body2), lw);
      poly(c, [hx - 12, hy - 10, hx + 3, hy - 44, hx + 12, hy - 10], col(Lk.body), lw);
      circ(c, hx + 3, hy - 44, 3, col(Lk.trim), 2);
      break;
    }
    case 'mask': {
      circ(c, hx, hy, r + 2, col(Lk.cape), lw);
      if (view !== 'back') { ell(c, hx + sideK * 5, hy + 2, view === 'side' ? 7 : 9, 8, skin, 2.4); rr(c, hx - 10 + sideK * 6, hy - 2, view === 'side' ? 12 : 20, 6, 3); fs(c, INK, 0); c.fillStyle = Lk.trim; for (const x of view === 'side' ? [7] : [-4, 4]) c.fillRect(hx + x - 1.5, hy, 3, 2); }
      break;
    }
    case 'ninja': {
      circ(c, hx, hy, r, col(Lk.body), lw);
      if (view !== 'back') { rr(c, hx - 10 + sideK * 6, hy - 3, view === 'side' ? 11 : 20, 7, 3); fs(c, skin, 2); eyes(c, view, hy + 0.5, true); }
      if (view !== 'front') poly(c, [hx - r + 2, hy - 2, hx - r - 12, hy - 4, hx - r - 10, hy + 4], col(Lk.trim), 2.2);
      else { c.fillStyle = Lk.trim; c.fillRect(hx - r, hy - 8, r * 2, 3); }
      break;
    }
    case 'goblin': {
      for (const sgn of view === 'side' ? [-1] : [-1, 1]) poly(c, [hx + sgn * 9, hy - 4, hx + sgn * 26, hy - 12, hx + sgn * 10, hy + 4], skin, 2.6);
      circ(c, hx, hy, r, skin, lw);
      eyes(c, view, hy, true, '#ffe14d', INK);
      if (view !== 'back') { c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.moveTo(hx - 5 + sideK * 6, hy + 7); c.lineTo(hx + 5 + sideK * 4, hy + 7); c.stroke(); }
      break;
    }
    case 'ogre': case 'magma': case 'giant': {
      const rr2 = r + 4;
      circ(c, hx, hy + 2, rr2, skin, lw);
      if (H === 'magma') { c.strokeStyle = '#ff6a1a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(hx - 10, hy - 8); c.lineTo(hx - 3, hy - 2); c.lineTo(hx - 6, hy + 6); c.stroke(); }
      if (H === 'giant') { c.beginPath(); c.arc(hx, hy, rr2 + 1, Math.PI, 0); c.closePath(); fs(c, col('#c9d3e0'), lw); for (const sgn of view === 'side' ? [-1] : [-1, 1]) poly(c, [hx + sgn * 12, hy - 8, hx + sgn * 26, hy - 26, hx + sgn * 6, hy - 14], col('#f3ead6'), 2.4); }
      eyes(c, view, hy, true, H === 'magma' ? '#ffb01f' : INK);
      if (view !== 'back') { // tusks + beard for the giant
        if (H === 'giant') { c.beginPath(); c.moveTo(hx - 12 + sideK * 10, hy + 6); c.quadraticCurveTo(hx + sideK * 6, hy + 30, hx + 12, hy + 6); fs(c, col('#e8f6ff'), 2.4); }
        else for (const x of view === 'side' ? [8] : [-6, 6]) poly(c, [hx + x - 2.5, hy + 10, hx + x, hy + 3, hx + x + 2.5, hy + 10], '#fff8e0', 2);
      }
      break;
    }
    case 'brute': {
      circ(c, hx, hy, r + 2, skin, lw);
      c.beginPath(); c.arc(hx, hy, r + 2, Math.PI * 1.05, Math.PI * 1.95); c.lineTo(hx + r, hy - 4); c.lineTo(hx - r, hy - 4); c.closePath(); fs(c, col('#c8323c'), lw);
      if (view === 'side') poly(c, [hx - r, hy - 8, hx - r - 12, hy - 4, hx - r - 10, hy + 4], col('#c8323c'), 2.4);
      eyes(c, view, hy + 1, true);
      if (view !== 'back') { c.beginPath(); c.moveTo(hx - 12 + sideK * 10, hy + 6); c.quadraticCurveTo(hx + sideK * 6, hy + 26, hx + 12, hy + 6); fs(c, col('#5a3220'), 2.4); }
      break;
    }
    case 'greathelm': {
      rr(c, hx - r - 1, hy - r - 2, (r + 1) * 2, r * 2 + 6, 7); fs(c, col('#b8c2d2'), lw);
      if (view !== 'back') { rr(c, hx - (view === 'side' ? -2 : 10), hy - 3, view === 'side' ? 12 : 20, 4, 1); fs(c, INK, 0); c.fillStyle = '#7df9ff'; if (view === 'side') c.fillRect(hx + 8, hy - 2.5, 3, 2); else { c.fillRect(hx - 6, hy - 2.5, 3, 2); c.fillRect(hx + 3, hy - 2.5, 3, 2); } }
      c.beginPath(); c.moveTo(hx - 6, hy - r - 2); c.quadraticCurveTo(hx - 16, hy - r - 24, hx + 10, hy - r - 16); c.quadraticCurveTo(hx + 2, hy - r - 6, hx + 6, hy - r - 2); fs(c, col('#2a5ac8'), 2.6);
      break;
    }
    case 'turban': {
      circ(c, hx, hy + 1, r + 3, skin, lw);
      eyes(c, view, hy + 2, true);
      if (view !== 'back') for (const x of view === 'side' ? [8] : [-6, 6]) poly(c, [hx + x - 2.5, hy + 12, hx + x, hy + 5, hx + x + 2.5, hy + 12], '#fff8e0', 2);
      ell(c, hx, hy - 10, r + 6, 10, col('#f3ead6'), lw);
      circ(c, hx + (sideK ? 8 : 0), hy - 10, 4, '#3fd0a0', 2);
      break;
    }
    case 'straw': {
      circ(c, hx, hy, r, skin, lw);
      eyes(c, view, hy + 2, true, INK);
      if (view !== 'back') { c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(hx - 6 + sideK * 8, hy + 8); c.lineTo(hx + 6 + sideK * 4, hy + 8); c.stroke(); }
      poly(c, [hx - 30, hy - 4, hx, hy - 24, hx + 30, hy - 4], col('#d8b45a'), lw);
      c.strokeStyle = shade('#d8b45a', -0.3); c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx - 15, hy - 14); c.lineTo(hx + 15, hy - 14); c.stroke();
      break;
    }
    case 'tricorn': {
      circ(c, hx, hy, r + 1, skin, lw);
      eyes(c, view, hy + 2, true);
      if (view !== 'back') { // eyepatch + beard
        c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(hx - 12, hy - 4); c.lineTo(hx + 12, hy + 2); c.stroke();
        circ(c, hx + (view === 'side' ? 7 : 5), hy + 2, 4, INK, 0);
        c.beginPath(); c.moveTo(hx - 11 + sideK * 10, hy + 6); c.quadraticCurveTo(hx + sideK * 6, hy + 22, hx + 11, hy + 6); fs(c, col('#3a2418'), 2.4);
      }
      poly(c, [hx - 24, hy - 6, hx - 10, hy - 26, hx + 10, hy - 26, hx + 24, hy - 6, hx, hy - 12], col('#2a2030'), lw);
      circ(c, hx, hy - 17, 3.5, '#f3ead6', 1.5);
      break;
    }
    case 'crown': {
      circ(c, hx, hy, r + 1, col('#2e2840'), lw);
      if (view !== 'back') { rr(c, hx - 10 + sideK * 6, hy - 3, view === 'side' ? 12 : 20, 6, 2); fs(c, INK, 0); eyes(c, view, hy, false, Lk.glow); }
      poly(c, [hx - 14, hy - 9, hx - 14, hy - 26, hx - 7, hy - 17, hx, hy - 30, hx + 7, hy - 17, hx + 14, hy - 26, hx + 14, hy - 9], col(Lk.trim), lw);
      circ(c, hx, hy - 15, 2.6, '#c070ff', 0);
      break;
    }
    default: circ(c, hx, hy, r, skin, lw); eyes(c, view, hy, true);
  }
}

function weapon(c, w, x, y, a, f, col, lw) {
  c.save(); c.translate(x, y); c.rotate(a);
  const steel = col('#e6edf5');
  switch (w) {
    case 'sword': case 'katana': case 'cutlass': case 'scimitar': {
      const len = w === 'katana' ? 40 : w === 'scimitar' ? 34 : 30;
      if (w === 'scimitar' || w === 'cutlass') { c.beginPath(); c.moveTo(4, -3); c.quadraticCurveTo(len * 0.7, -7, len + 4, -12); c.quadraticCurveTo(len * 0.6, 6, 4, 3); c.closePath(); fs(c, steel, lw); }
      else { c.beginPath(); c.moveTo(4, -3); c.lineTo(len, -2.5); c.lineTo(len + 6, 0); c.lineTo(len, 2.5); c.lineTo(4, 3); c.closePath(); fs(c, steel, lw); }
      rr(c, 0, -7, 4, 14, 1.5); fs(c, col('#ffd23f'), 2.2);
      rr(c, -9, -2.5, 9, 5, 2); fs(c, col('#5a3a2a'), 2);
      break;
    }
    case 'greatsword': {
      c.beginPath(); c.moveTo(6, -5); c.lineTo(52, -4); c.lineTo(62, 0); c.lineTo(52, 4); c.lineTo(6, 5); c.closePath(); fs(c, f.kind === 'king' ? col('#5a4a7a') : steel, lw);
      if (f.kind === 'king') { c.strokeStyle = '#c070ff'; c.lineWidth = 2; c.beginPath(); c.moveTo(10, 0); c.lineTo(52, 0); c.stroke(); }
      rr(c, 0, -10, 6, 20, 2); fs(c, col('#ffd23f'), 2.2); rr(c, -12, -3, 12, 6, 2); fs(c, col('#3a2a2a'), 2);
      break;
    }
    case 'axe': case 'bigaxe': {
      const k = w === 'bigaxe' ? 1.6 : 1;
      rr(c, -6, -2.5 * k, 34 * k, 5 * k, 2); fs(c, col('#7a4a2a'), lw);
      c.beginPath(); c.moveTo(24 * k, -3); c.quadraticCurveTo(36 * k, -16 * k, 34 * k, -2); c.lineTo(34 * k, 2); c.quadraticCurveTo(36 * k, 16 * k, 24 * k, 3); c.closePath(); fs(c, steel, lw);
      break;
    }
    case 'staff': {
      rr(c, -10, -2.5, 46, 5, 2); fs(c, col('#6a4a2a'), lw);
      const g = 0.6 + (f.raise || 0) * 0.8;
      circ(c, 40, 0, 7 * g + 2, '#ff8a2a', 2.5); circ(c, 40, 0, 4 * g, '#ffe14d', 0);
      break;
    }
    case 'daggers': {
      c.beginPath(); c.moveTo(2, -2); c.lineTo(18, 0); c.lineTo(2, 2); c.closePath(); fs(c, steel, 2.4);
      break;
    }
    case 'bow': {
      c.rotate(-a + (f.view === 'side' ? 0 : a)); // keep the bow upright-ish
      const pull = (f.raise || 0) * 8;
      c.beginPath(); c.moveTo(2, -22); c.quadraticCurveTo(16, 0, 2, 22); c.lineWidth = 7; c.strokeStyle = INK; c.stroke(); c.lineWidth = 3.5; c.strokeStyle = col('#9a6438'); c.stroke();
      c.strokeStyle = '#f3ead6'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(2, -22); c.lineTo(2 - pull, 0); c.lineTo(2, 22); c.stroke();
      if (f.raise > 0.1) { c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(2 - pull, 0); c.lineTo(22, 0); c.stroke(); }
      break;
    }
    case 'bomb': {
      if ((f.raise || 0) > 0.05 || f.holdBomb) { circ(c, 10, 0, 8, '#2a2a3a', 2.6); capsule(c, 14, -6, 18, -10, 2, '#c8a24a', 1); }
      break;
    }
    case 'club': {
      c.beginPath(); c.moveTo(-6, -3); c.lineTo(44, -9); c.quadraticCurveTo(52, 0, 44, 9); c.lineTo(-6, 3); c.closePath(); fs(c, col('#cfeaff'), lw);
      break;
    }
    case 'hammer': {
      rr(c, -8, -3, 44, 6, 2); fs(c, col('#4a3434'), lw);
      rr(c, 32, -14, 16, 28, 3); fs(c, col('#2a1c1c'), lw);
      c.fillStyle = '#ff6a1a'; c.fillRect(36, -8, 8, 3); c.fillRect(36, 4, 8, 3);
      break;
    }
  }
  c.restore();
}

function shield(c, sh, col, lw) {
  const { x, y, r, face } = sh;
  c.save(); c.translate(x, y);
  if (face === 'side') c.scale(0.42, 1);
  circ(c, 0, 0, r, col('#c9d3e0'), lw);
  circ(c, 0, 0, r * 0.78, col(sh.col || '#2b4fae'), 2.4);
  c.fillStyle = col('#ffd23f');
  c.beginPath(); c.moveTo(0, -r * 0.55); c.lineTo(r * 0.18, -r * 0.1); c.lineTo(r * 0.55, 0); c.lineTo(r * 0.18, r * 0.1); c.lineTo(0, r * 0.55); c.lineTo(-r * 0.18, r * 0.1); c.lineTo(-r * 0.55, 0); c.lineTo(-r * 0.18, -r * 0.1); c.closePath(); c.fill();
  c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
  if (sh.glow) { c.globalAlpha = sh.glow; circ(c, 0, 0, r + 3, 'rgba(255,255,255,0.9)', 0); c.globalAlpha = 1; }
  c.restore();
}

// ---------------------------------------------------------------- projectiles
export function projectile(c, type, x, y, ang, u, t, z = 0) {
  c.save();
  // ground shadow
  c.fillStyle = 'rgba(10,0,30,0.22)'; c.beginPath(); c.ellipse(x, y + 6 * u, (type === 'boulder' ? 26 : 12) * u, 5 * u, 0, 0, TAU); c.fill();
  c.translate(x, y - z); c.scale(u, u);
  switch (type) {
    case 'arrow': {
      c.rotate(ang);
      capsule(c, -26, 0, 10, 0, 3, '#c89a5a', 2.5);
      poly(c, [10, -6, 22, 0, 10, 6], '#e6edf5', 2.5);
      poly(c, [-26, 0, -34, -7, -22, -7, -18, 0, -22, 7, -34, 7], '#e0343f', 2.2);
      break;
    }
    case 'dagger': {
      c.rotate(ang + Math.sin(t * 30) * 0.15);
      poly(c, [-8, -4, 16, 0, -8, 4], '#e6edf5', 2.5); rr(c, -16, -3, 9, 6, 2); fs(c, '#3a2a40', 2);
      break;
    }
    case 'axe': {
      c.rotate(t * 18);
      rr(c, -16, -3, 32, 6, 2); fs(c, '#7a4a2a', 2.5);
      c.beginPath(); c.moveTo(8, -3); c.quadraticCurveTo(22, -18, 20, -2); c.lineTo(20, 2); c.quadraticCurveTo(22, 18, 8, 3); c.closePath(); fs(c, '#e6edf5', 2.8);
      break;
    }
    case 'fire': {
      c.rotate(ang);
      const wob = Math.sin(t * 40) * 3;
      c.globalAlpha = 0.35; circ(c, 0, 0, 30, '#ff8a2a', 0); c.globalAlpha = 1;
      poly(c, [0, -16, -34, -8 + wob, -24, 0, -40, 6 - wob, 0, 16], '#ff6a1a', 2.8);
      circ(c, 0, 0, 16, '#ff8a2a', 3); circ(c, 3, -2, 9, '#ffe14d', 0); circ(c, 5, -4, 4, '#fff8d0', 0);
      break;
    }
    case 'boulder': {
      c.rotate(t * 5);
      poly(c, [-26, -6, -18, -22, 2, -27, 20, -18, 27, 0, 20, 20, 0, 27, -20, 20], '#8a7a6a', 3.4);
      c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.moveTo(-10, -10); c.lineTo(2, -2); c.lineTo(-4, 12); c.moveTo(8, -16); c.lineTo(14, -6); c.stroke();
      circ(c, -8, -14, 5, '#a8988a', 0);
      break;
    }
    case 'bomb': {
      circ(c, 0, 0, 14, '#2a2a3a', 3.2);
      c.fillStyle = '#e0343f'; c.fillRect(-14, -3, 28, 6); c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(-14, -3, 28, 6);
      circ(c, -5, -6, 3.5, 'rgba(255,255,255,0.6)', 0);
      capsule(c, 6, -10, 11, -17, 3, '#c8a24a', 1.6);
      const sp = 4 + Math.sin(t * 50) * 2;
      circ(c, 12, -19, sp, '#ffe14d', 0); circ(c, 12, -19, sp * 0.5, '#fff', 0);
      break;
    }
  }
  c.restore();
}

// timing ring: closes from big to the target circle on the beat
export function ring(c, x, y, r, col, lw, alpha = 1, dash = null) {
  c.save(); c.globalAlpha = alpha;
  if (dash) c.setLineDash(dash);
  c.lineWidth = lw + 5; c.strokeStyle = '#1a1424'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.lineWidth = lw; c.strokeStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke();
  c.restore();
}

export function heart(c, x, y, s, fill, lw = 3) {
  c.beginPath();
  c.moveTo(x, y + s * 0.9);
  c.bezierCurveTo(x - s * 1.4, y, x - s * 0.9, y - s * 1.1, x, y - s * 0.45);
  c.bezierCurveTo(x + s * 0.9, y - s * 1.1, x + s * 1.4, y, x, y + s * 0.9);
  c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
}
export function star(c, x, y, r, fill, lw = 3) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr2 = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.closePath(); c.fillStyle = fill; c.fill(); c.lineWidth = lw; c.strokeStyle = INK; c.stroke();
}
