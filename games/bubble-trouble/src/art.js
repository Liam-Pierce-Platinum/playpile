// Everything is drawn with canvas vectors; tiles are cached as sprites at device resolution.
import { T } from './levels.js';

export const THEMES = [
  { sky: ['#ff9fcf', '#ffe9d6'], far: '#f7b7d8', mid: '#ee8fc0', win: '#ffe0f0', body: '#d4699f', body2: '#e07fb0', frost: '#fff6fb', drip: '#ffd7ea', sun: '#fff3a8' },
  { sky: ['#86d3ff', '#f4edff'], far: '#b3d1ff', mid: '#8fb2f2', win: '#e8f4ff', body: '#3fb79c', body2: '#5cc9ae', frost: '#fffbe9', drip: '#ffe9f3', sun: '#ffffff' },
  { sky: ['#ffb36b', '#ffd6e6'], far: '#f4bf9b', mid: '#e3967c', win: '#fff0d8', body: '#7d4c39', body2: '#91604a', frost: '#ff9fd0', drip: '#ffc1e0', sun: '#fff1a0' },
  { sky: ['#c6f26b', '#fff9c9'], far: '#d3ec92', mid: '#abd46d', win: '#fbffe0', body: '#e2a72a', body2: '#efbd45', frost: '#ffffff', drip: '#fff6c0', sun: '#ffffff' },
  { sky: ['#6d55c9', '#ff9ec7'], far: '#7f63c8', mid: '#5e46a8', win: '#ffd9f1', body: '#43378a', body2: '#53479d', frost: '#bdeeff', drip: '#e2f7ff', sun: '#ffe6f4' },
  { sky: ['#2c1e57', '#ff6f9f'], far: '#4b2f7a', mid: '#36215f', win: '#ffb3d6', body: '#5a2f6e', body2: '#6b3a80', frost: '#d6ff7a', drip: '#efffb0', sun: '#ffe36b' },
];
const SPR = ['#ff4f8b', '#4fd1ff', '#ffe14f', '#7dff8a', '#b88cff', '#ffffff'];

let th = THEMES[0], themeI = 0, cache = {}, cacheK = 0, sky = null;
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

export function setTheme(i) { themeI = i; th = THEMES[i]; cache = {}; sky = makeSkyline(i); }
export function theme() { return th; }

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
export { rr };

function sprite(key, k, draw) {
  if (cacheK !== k) { cache = {}; cacheK = k; }
  if (cache[key]) return cache[key];
  const n = Math.ceil(T * k) + 2, cv = document.createElement('canvas'); cv.width = n; cv.height = n;
  const c = cv.getContext('2d'); c.scale(n / T, n / T); draw(c); cache[key] = cv; return cv;
}

function drawBody(c, v) {
  c.fillStyle = th.body; c.fillRect(0, 0, T, T);
  c.save(); c.globalAlpha = 0.18; c.fillStyle = th.body2;
  for (let i = -2; i < 3; i++) { c.beginPath(); c.moveTo(i * 16, 0); c.lineTo(i * 16 + 8, 0); c.lineTo(i * 16 + 8 + T, T); c.lineTo(i * 16 + T, T); c.fill(); }
  c.restore();
  const r = rng(v * 97 + 3); c.fillStyle = 'rgba(255,255,255,0.10)';
  for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(r() * T, r() * T, 1 + r() * 1.5, 0, 7); c.fill(); }
}
function drawFrost(c, v) {
  const r = rng(v * 31 + 7);
  c.fillStyle = 'rgba(0,0,0,0.12)'; c.beginPath(); c.moveTo(0, 0); c.lineTo(T, 0); c.lineTo(T, 12);
  const pts = []; for (let x = T; x >= 0; x -= 8) pts.push([x, 9 + r() * 4 + (r() < 0.3 ? 8 + r() * 6 : 0)]);
  for (const [x, y] of pts) c.lineTo(x, y + 2); c.closePath(); c.fill();
  c.fillStyle = th.frost; c.beginPath(); c.moveTo(0, -2); c.lineTo(T, -2); c.lineTo(T, 10);
  for (const [x, y] of pts) c.quadraticCurveTo(x + 4, y + 3, x, y); c.closePath(); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillRect(0, 1, T, 2);
  for (let i = 0; i < 4; i++) { c.save(); c.translate(3 + r() * (T - 6), 4 + r() * 4); c.rotate(r() * 3); c.fillStyle = SPR[(r() * SPR.length) | 0]; rr(c, -2.5, -1, 5, 2, 1); c.fill(); c.restore(); }
}

export function drawTiles(c, L, x0, x1, k) {
  const g = L.g;
  for (let y = 0; y < L.h; y++) for (let x = x0; x <= x1; x++) {
    if (x < 0 || x >= L.w) continue;
    const t = g[y][x]; if (t === '.') continue;
    const px = x * T, py = y * T, v = (x * 7 + y * 3) % 4;
    if (t === '#') {
      c.drawImage(sprite('b' + v, k, (cc) => drawBody(cc, v)), px, py, T + 0.06, T + 0.06);
      const up = y > 0 ? g[y - 1][x] : '.';
      if (up !== '#' && up !== 'B') c.drawImage(sprite('f' + v, k, (cc) => drawFrost(cc, v)), px, py, T + 0.06, T + 0.06);
      if (x > 0 && g[y][x - 1] !== '#') { c.fillStyle = 'rgba(255,255,255,0.16)'; c.fillRect(px, py, 3, T); }
      if (x < L.w - 1 && g[y][x + 1] !== '#') { c.fillStyle = 'rgba(0,0,0,0.16)'; c.fillRect(px + T - 4, py, 4, T); }
      if (y < L.h - 1 && g[y + 1][x] !== '#') { c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(px, py + T - 5, T, 5); }
    } else if (t === '=') c.drawImage(sprite('w', k, drawWafer), px, py, T + 0.06, T + 0.06);
    else if (t === 'B') c.drawImage(sprite('c', k, drawCrate), px, py, T, T);
    else if (t === '^') c.drawImage(sprite('s' + (v & 1), k, (cc) => drawSpike(cc, v & 1)), px, py, T, T);
  }
}
function drawWafer(c) {
  c.fillStyle = 'rgba(0,0,0,0.15)'; rr(c, 0, 3, T, 12, 3); c.fill();
  c.fillStyle = '#e9b46a'; rr(c, 0, 0, T, 12, 3); c.fill();
  c.fillStyle = '#fff3dc'; c.fillRect(0, 5, T, 2.5);
  c.strokeStyle = 'rgba(140,80,30,0.35)'; c.lineWidth = 1;
  for (let x = 4; x < T; x += 6) { c.beginPath(); c.moveTo(x, 1); c.lineTo(x, 11); c.stroke(); }
  c.fillStyle = 'rgba(255,255,255,0.45)'; c.fillRect(2, 1, T - 4, 1.5);
}
function drawCrate(c) {
  c.fillStyle = '#c23f7a'; rr(c, 1, 1, T - 2, T - 2, 5); c.fill();
  c.fillStyle = '#ff6fae'; rr(c, 3, 3, T - 6, T - 6, 4); c.fill();
  c.fillStyle = '#ff9fcb';
  for (const [x, y, r] of [[10, 11, 4], [21, 9, 3], [20, 21, 5], [10, 22, 3]]) { c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(8.5, 9.5, 1.3, 0, 7); c.arc(18.5, 19.5, 1.5, 0, 7); c.fill();
  c.strokeStyle = '#a02e62'; c.lineWidth = 2; rr(c, 1, 1, T - 2, T - 2, 5); c.stroke();
}
function drawSpike(c, v) {
  const cols = v ? ['#7fe8ff', '#c9a6ff'] : ['#c9a6ff', '#7fe8ff'];
  const xs = [[3, 14, 16], [12, 22, 22], [22, 12, 30]];
  xs.forEach(([x, h, x2], i) => {
    const cx = (x + x2) / 2 + (i === 1 ? 0 : 0), hw = 6;
    c.fillStyle = cols[i & 1]; c.beginPath(); c.moveTo(cx - hw, T); c.lineTo(cx, T - h - 6); c.lineTo(cx + hw, T); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.moveTo(cx - hw + 2, T); c.lineTo(cx, T - h - 4); c.lineTo(cx - 1, T); c.fill();
  });
}

// ---------- sky + candy skyline (vector, drawn each frame)
function makeSkyline(i) {
  const r = rng(i * 1337 + 11), layers = [];
  for (let l = 0; l < 2; l++) {
    const list = []; let x = 0;
    while (x < 2400) {
      const w = 60 + r() * 90, h = (l ? 120 : 180) + r() * (l ? 140 : 160);
      list.push({ x, w, h, kind: (r() * 4) | 0, stripe: r() < 0.4, ant: r() < 0.35, seed: (r() * 1e6) | 0 });
      x += w + 6 + r() * 30;
    }
    layers.push({ list, span: x, par: l ? 0.45 : 0.2 });
  }
  const clouds = []; for (let c = 0; c < 7; c++) clouds.push({ x: r() * 2000, y: 30 + r() * 150, s: 0.6 + r() * 0.8 });
  return { layers, clouds };
}
export function drawSky(c, camX, camY, viewW, viewH, k, t) {
  const g = c.createLinearGradient(0, camY, 0, camY + viewH); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  c.fillStyle = g; c.fillRect(camX, camY, viewW, viewH);
  // sun
  c.save(); c.translate(camX + viewW * 0.78, camY + viewH * 0.22);
  c.fillStyle = th.sun; c.globalAlpha = 0.35; c.beginPath(); c.arc(0, 0, 70, 0, 7); c.fill();
  c.globalAlpha = 0.9; c.beginPath(); c.arc(0, 0, 44, 0, 7); c.fill(); c.restore();
  // clouds
  c.fillStyle = 'rgba(255,255,255,0.75)';
  for (const cl of sky.clouds) {
    const x = camX + ((cl.x - camX * 0.08 + t * 6) % 2200 + 2200) % 2200 - 200, y = cl.y + camY * 0.2;
    c.beginPath(); c.arc(x, y, 22 * cl.s, 0, 7); c.arc(x + 26 * cl.s, y - 10 * cl.s, 28 * cl.s, 0, 7); c.arc(x + 56 * cl.s, y, 22 * cl.s, 0, 7); c.rect(x, y, 56 * cl.s, 22 * cl.s * 0.9); c.fill();
  }
  const ground = 480;
  sky.layers.forEach((Ly, li) => {
    const off = camX * (1 - Ly.par), k0 = Math.floor(camX * Ly.par / Ly.span);
    for (let rep = k0 - 1; rep <= k0 + 1; rep++) for (const b of Ly.list) {
      const sx = off + b.x + rep * Ly.span; // world x
      if (sx + b.w < camX - 20 || sx > camX + viewW + 20) continue;
      building(c, sx, ground - 40 - b.h + li * 20, b, li);
    }
  });
  // haze
  const hz = c.createLinearGradient(0, 300, 0, 480); hz.addColorStop(0, 'rgba(255,255,255,0)'); hz.addColorStop(1, 'rgba(255,255,255,0.35)');
  c.fillStyle = hz; c.fillRect(camX, 300, viewW, 180);
}
function building(c, x, y, b, li) {
  const col = li ? th.mid : th.far, w = b.w, h = b.h + 100;
  c.fillStyle = col;
  if (b.kind === 0) { rr(c, x, y, w, h, 14); c.fill(); }
  else if (b.kind === 1) { c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + w * 0.4); c.arc(x + w / 2, y + w * 0.4, w / 2, Math.PI, 0); c.lineTo(x + w, y + h); c.fill(); } // dome
  else if (b.kind === 2) { c.fillRect(x, y + 18, w, h); c.beginPath(); for (let i = 0; i < 4; i++) c.arc(x + w / 8 + i * w / 4, y + 18, w / 8, Math.PI, 0); c.fill(); } // cupcake top
  else { c.fillRect(x + w * 0.1, y, w * 0.8, h); c.fillRect(x, y + 30, w, h); }
  if (b.ant) { c.fillRect(x + w / 2 - 2, y - 40, 4, 44); c.beginPath(); c.arc(x + w / 2, y - 44, 9, 0, 7); c.fill(); }
  if (b.stripe) { c.fillStyle = 'rgba(255,255,255,0.12)'; for (let s = 0; s < w; s += 20) c.fillRect(x + s, y + 30, 8, h); }
  if (li) {
    const r = rng(b.seed); c.fillStyle = th.win;
    for (let wy = y + 44; wy < 440; wy += 30) for (let wx = x + 12; wx < x + w - 18; wx += 22) if (r() < 0.55) { c.globalAlpha = 0.35 + r() * 0.4; rr(c, wx, wy, 10, 14, 5); c.fill(); }
    c.globalAlpha = 1;
  }
}

// ---------- characters
export function drawPlayer(c, p, t, hurtFlash) {
  const cx = p.x + p.w / 2, by = p.y + p.h;
  const base = 14 * (1 + p.infl * 0.55);
  const rx = base * p.sx, ry = base * p.sy;
  if (p.inv > 0 && Math.floor(t * 20) % 2 === 0) c.globalAlpha = 0.45;
  // slam afterimages
  for (let i = 0; i < p.trail.length; i++) { const q = p.trail[i]; c.fillStyle = `rgba(255,90,160,${0.08 + i * 0.04})`; c.beginPath(); c.ellipse(q.x, q.y, rx * 0.9, ry * 0.9, 0, 0, 7); c.fill(); }
  // wall gum strands
  if (p.wall) {
    const wx = p.wall > 0 ? p.x + p.w + 2 : p.x - 2;
    c.strokeStyle = '#ff8fc4'; c.lineWidth = 3; c.lineCap = 'round';
    for (const dy of [-16, -6, 4]) { c.beginPath(); c.moveTo(cx, by - 12 + dy * 0.5); c.quadraticCurveTo((cx + wx) / 2, by - 8 + dy + 6, wx, by - 12 + dy); c.stroke(); }
  }
  const cy = by - ry;
  // shadow-ish rim
  c.fillStyle = '#d43a7e'; c.beginPath(); c.ellipse(cx, cy + 1.5, rx + 1.5, ry + 1, 0, 0, 7); c.fill();
  const g = c.createRadialGradient(cx - rx * 0.35, cy - ry * 0.45, 2, cx, cy, Math.max(rx, ry) * 1.1);
  g.addColorStop(0, '#ffc2e0'); g.addColorStop(0.45, '#ff7ab5'); g.addColorStop(1, '#ff3f8f');
  c.fillStyle = hurtFlash ? '#fff' : g; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, 7); c.fill();
  // glossy bubble when inflated
  if (p.infl > 0.05) {
    c.save(); c.globalAlpha = p.infl * 0.55; c.strokeStyle = '#fff'; c.lineWidth = 2;
    c.beginPath(); c.ellipse(cx, cy, rx + 5, ry + 5, 0, 0, 7); c.stroke(); c.globalAlpha = p.infl * 0.15; c.fillStyle = '#fff'; c.fill(); c.restore();
  }
  c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(cx - rx * 0.42, cy - ry * 0.5, rx * 0.22, ry * 0.14, -0.5, 0, 7); c.fill();
  c.beginPath(); c.arc(cx - rx * 0.12, cy - ry * 0.72, 1.6, 0, 7); c.fill();
  // face
  const fx = cx + p.face * rx * 0.28, fy = cy - ry * 0.05 + Math.max(-3, Math.min(3, p.vy * 0.004));
  const blink = (t % 3.4) < 0.1;
  const ex = rx * 0.3;
  for (const s of [-1, 1]) {
    const x = fx + s * ex;
    if (p.inv > 1.0) { c.strokeStyle = '#3a1030'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 3, fy - 3); c.lineTo(x + 3, fy + 3); c.moveTo(x + 3, fy - 3); c.lineTo(x - 3, fy + 3); c.stroke(); continue; }
    c.fillStyle = '#fff'; c.beginPath(); c.ellipse(x, fy - 2, 4.2, blink ? 0.8 : 5.4, 0, 0, 7); c.fill();
    if (!blink) { c.fillStyle = '#2a0f2a'; c.beginPath(); c.ellipse(x + p.face * 1.4, fy - 1 + (p.slam ? 2 : 0), 2.4, 3.2, 0, 0, 7); c.fill(); c.fillStyle = '#fff'; c.beginPath(); c.arc(x + p.face * 1.4 - 0.8, fy - 2.4, 0.9, 0, 7); c.fill(); }
  }
  c.fillStyle = 'rgba(255,60,120,0.45)'; c.beginPath(); c.ellipse(fx - ex - 4, fy + 5, 3, 1.8, 0, 0, 7); c.ellipse(fx + ex + 4, fy + 5, 3, 1.8, 0, 0, 7); c.fill();
  c.fillStyle = '#5a1838';
  if (p.blow) { c.beginPath(); c.arc(fx + p.face * 2, fy + 7, 2.6, 0, 7); c.fill(); }
  else if (p.slam) { c.fillRect(fx - 3 + p.face * 2, fy + 6, 6, 2); }
  else { c.lineWidth = 1.8; c.strokeStyle = '#5a1838'; c.beginPath(); c.arc(fx + p.face * 2, fy + 4, 3.2, 0.2, Math.PI - 0.2); c.stroke(); }
  c.globalAlpha = 1;
}

function gumWrap(c, cx, cy, r, t) {
  c.fillStyle = 'rgba(255,110,180,0.82)';
  c.beginPath();
  for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28 + t; c.moveTo(cx + Math.cos(a) * r * 0.7 + r * 0.45, cy + Math.sin(a) * r * 0.6); c.arc(cx + Math.cos(a) * r * 0.7, cy + Math.sin(a) * r * 0.6, r * 0.45, 0, 7); }
  c.fill();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(cx - r * 0.4, cy - r * 0.4, r * 0.15, 0, 7); c.fill();
}
function angryEyes(c, x, y, face, s = 1, dizzy = false, t = 0) {
  for (const k of [-1, 1]) {
    const ex = x + face * 3 * s + k * 5 * s;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex, y, 3.6 * s, 0, 7); c.fill();
    if (dizzy) { c.strokeStyle = '#333'; c.lineWidth = 1.2 * s; c.beginPath(); c.arc(ex, y, 2 * s, t * 8, t * 8 + 4.5); c.stroke(); }
    else { c.fillStyle = '#222'; c.beginPath(); c.arc(ex + face * 1.2 * s, y + 0.6 * s, 1.9 * s, 0, 7); c.fill(); }
    if (!dizzy) { c.strokeStyle = '#3a2a00'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(ex - 4 * s, y - 5 * s + (k < 0 ? -1.5 : 1.5) * s * -1); c.lineTo(ex + 4 * s, y - 5 * s + (k < 0 ? 1.5 : -1.5) * s * -1); c.stroke(); }
  }
}
export function drawEnemy(c, e, t) {
  const cx = e.x + e.w / 2, by = e.y + e.h, gum = e.gum > 0;
  const wob = gum ? Math.sin(t * 20) * (e.gum < 1.2 ? 1.5 : 0.4) : 0;
  c.save(); c.translate(cx + wob, by); c.scale(1 / e.sq, e.sq);
  if (e.type === 'w') {
    const step = gum ? 0 : Math.sin(e.t * 14);
    c.fillStyle = '#5b8a1e'; c.beginPath(); c.ellipse(-6, -1 + Math.max(0, step) * -2, 4, 2.5, 0, 0, 7); c.ellipse(6, -1 + Math.max(0, -step) * -2, 4, 2.5, 0, 0, 7); c.fill();
    const g = c.createLinearGradient(0, -26, 0, 0); g.addColorStop(0, '#e6ff6a'); g.addColorStop(1, '#8fd12f');
    c.fillStyle = g; c.beginPath(); c.moveTo(-13, -3); c.quadraticCurveTo(-14, -24, 0, -27); c.quadraticCurveTo(14, -24, 13, -3); c.closePath(); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.6)'; for (const [x, y] of [[-6, -18], [4, -22], [8, -12], [-9, -9], [0, -8]]) c.fillRect(x, y, 1.6, 1.6);
    angryEyes(c, 0, -14, e.face, 0.85, gum, t);
  } else if (e.type === 'h') {
    c.rotate(e.face * 0.25 + (e.on ? 0 : e.vy * 0.0008));
    const g = c.createLinearGradient(-12, -24, 12, 0); g.addColorStop(0, '#d79bff'); g.addColorStop(1, '#8a3ee0');
    c.fillStyle = g; c.beginPath(); c.ellipse(-4, -12, 9, 12, 0.5, 0, 7); c.ellipse(5, -11, 9, 11, -0.4, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-6, -19, 4, 2, -0.4, 0, 7); c.fill();
    angryEyes(c, 0, -13, e.face, 0.8, gum, t);
  } else {
    const flap = Math.sin(t * 40) * 0.6;
    c.fillStyle = 'rgba(220,245,255,0.75)';
    c.save(); c.translate(-2, -20); c.rotate(-0.6 + flap); c.beginPath(); c.ellipse(0, -7, 5, 9, 0, 0, 7); c.fill(); c.restore();
    c.save(); c.translate(4, -20); c.rotate(0.6 - flap); c.beginPath(); c.ellipse(0, -7, 5, 9, 0, 0, 7); c.fill(); c.restore();
    c.fillStyle = '#ffb92e'; c.beginPath(); c.ellipse(0, -12, 13, 10, 0, 0, 7); c.fill();
    c.fillStyle = '#6b3a12'; c.fillRect(-5, -21, 3.5, 18); c.fillRect(2, -21, 3.5, 18);
    c.beginPath(); c.moveTo(-e.face * 13, -13); c.lineTo(-e.face * 19, -11); c.lineTo(-e.face * 13, -9); c.fill();
    angryEyes(c, e.face * 5, -14, e.face, 0.7, gum, t);
  }
  c.restore();
  if (gum) gumWrap(c, cx + wob, by - 12, 16, t * 0.5);
}

export function drawBoss(c, B, t) {
  const cx = B.x + B.w / 2, by = B.y + B.h, s = 1;
  const shake = B.st === 'charge' && B.t < 0.6 ? Math.sin(t * 60) * 2 : 0;
  c.save(); c.translate(cx + shake, by); c.scale(B.h / 84 / B.sq, B.h / 84 * B.sq);
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.ellipse(0, 0, 44, 7, 0, 0, 7); c.fill();
  const g = c.createRadialGradient(-14, -64, 8, 0, -42, 60); g.addColorStop(0, '#fff7a0'); g.addColorStop(0.6, '#ffd92e'); g.addColorStop(1, '#e8a400');
  c.fillStyle = B.flash > 0 ? '#ffffff' : g;
  c.beginPath(); c.moveTo(-44, -6); c.quadraticCurveTo(-50, -70, 0, -84); c.quadraticCurveTo(50, -70, 44, -6); c.quadraticCurveTo(0, 4, -44, -6); c.fill();
  c.fillStyle = 'rgba(255,255,255,0.6)'; const r = rng(5);
  for (let i = 0; i < 26; i++) { const a = r() * 6.28, d = r() * 36; c.fillRect(Math.cos(a) * d - 1, -40 + Math.sin(a) * d * 0.9 - 1, 2.2, 2.2); }
  // crown
  c.fillStyle = '#ff4f9a'; c.beginPath(); c.moveTo(-22, -78); c.lineTo(-22, -96); c.lineTo(-11, -86); c.lineTo(0, -102); c.lineTo(11, -86); c.lineTo(22, -96); c.lineTo(22, -78); c.closePath(); c.fill();
  c.fillStyle = '#7fe8ff'; c.beginPath(); c.arc(0, -86, 3.5, 0, 7); c.fill();
  // face
  const f = B.face, dz = B.st === 'dizzy';
  angryEyes(c, f * 6, -48, f, 2.2, dz, t);
  c.fillStyle = '#5a2a00'; c.beginPath(); c.ellipse(f * 6, -24, 16, B.st === 'spit' ? 10 : 6, 0, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(f * 6 - 10, -29); c.lineTo(f * 6 - 6, -21); c.lineTo(f * 6 - 2, -29); c.moveTo(f * 6 + 2, -29); c.lineTo(f * 6 + 6, -21); c.lineTo(f * 6 + 10, -29); c.fill();
  c.restore();
  if (dz) for (let i = 0; i < 3; i++) { const a = t * 4 + i * 2.1; star(c, cx + Math.cos(a) * 34, B.y - 18 + Math.sin(a) * 8, 6, '#fff36b'); }
}

export function star(c, x, y, r, col, rot = 0) {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + i * Math.PI / 5 - Math.PI / 2, rr2 = i & 1 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
  c.fill();
}

export function drawItem(c, it, t) {
  const bob = Math.sin(t * 3 + it.x * 0.05) * 3;
  if (it.type === 'o') {
    const cols = [['#ff5fa2', '#ffd1e6'], ['#4fc3ff', '#d4f1ff'], ['#ffd84f', '#fff4c7'], ['#7ee07a', '#dcffd9']][((it.x / 32) | 0) % 4];
    c.save(); c.translate(it.x, it.y + bob); c.rotate(Math.sin(t * 2 + it.x) * 0.3);
    c.fillStyle = cols[0]; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-12, -6); c.lineTo(-12, 6); c.fill(); c.beginPath(); c.moveTo(6, 0); c.lineTo(12, -6); c.lineTo(12, 6); c.fill();
    c.beginPath(); c.arc(0, 0, 7, 0, 7); c.fill();
    c.strokeStyle = cols[1]; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 4, 0.5, 2.6); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(-2.5, -2.5, 1.6, 0, 7); c.fill();
    c.restore();
  } else if (it.type === 'G') {
    c.save(); c.translate(it.x, it.y + bob);
    c.fillStyle = 'rgba(255,230,80,0.3)'; c.beginPath(); c.arc(0, 0, 18 + Math.sin(t * 5) * 2, 0, 7); c.fill();
    const g = c.createRadialGradient(-4, -5, 1, 0, 0, 13); g.addColorStop(0, '#fffbe0'); g.addColorStop(0.5, '#ffd23a'); g.addColorStop(1, '#e09200');
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill();
    star(c, 0, 1, 5, 'rgba(255,255,255,0.9)', t);
    c.restore();
  } else if (it.type === 'H') {
    c.save(); c.translate(it.x, it.y + bob); const s = 1 + Math.sin(t * 6) * 0.08; c.scale(s, s); heart(c, 0, 0, 11, '#ff3f7f'); c.restore();
  }
}
export function heart(c, x, y, r, col, empty) {
  c.beginPath(); c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45);
  c.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  if (empty) { c.fillStyle = 'rgba(0,0,0,0.25)'; c.fill(); c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.stroke(); return; }
  c.fillStyle = col; c.fill(); c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.ellipse(x - r * 0.42, y - r * 0.3, r * 0.22, r * 0.14, -0.6, 0, 7); c.fill();
}

export function drawSpring(c, s, t) {
  const comp = s.t > 0 ? Math.sin(s.t * 30) * s.t * 20 : 0;
  const x = s.x + 16, by = s.y + T, top = by - 14 - comp;
  c.strokeStyle = '#3a2340'; c.lineWidth = 3;
  c.beginPath(); for (let i = 0; i <= 6; i++) c.lineTo(x + (i % 2 ? 7 : -7), by - (by - top) * (i / 6)); c.stroke();
  c.fillStyle = '#ff4f6d'; rr(c, x - 13, top - 6, 26, 7, 3.5); c.fill(); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x - 9, top - 5, 12, 1.5);
}
export function drawCheck(c, ch, t) {
  const x = ch.x + 16, by = ch.y + T;
  c.fillStyle = '#fff'; c.fillRect(x - 1.5, by - 52, 3, 52);
  c.save(); c.translate(x, by - 60); c.rotate(ch.on ? t * 3 : 0);
  const n = 8; for (let i = 0; i < n; i++) { c.fillStyle = ch.on ? (i & 1 ? '#ff4f9a' : '#fff') : (i & 1 ? '#aaa' : '#ddd'); c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 13, i / n * 6.28, (i + 1) / n * 6.28); c.fill(); }
  c.restore();
}
export function drawSign(c, s, near, t) {
  const x = s.x + 16, by = s.y + T;
  c.fillStyle = '#b07040'; c.fillRect(x - 2, by - 26, 4, 26);
  c.fillStyle = '#fff3dc'; rr(c, x - 12, by - 40, 24, 18, 5); c.fill(); c.fillStyle = '#ff4f9a'; c.font = 'bold 13px sans-serif'; c.textAlign = 'center'; c.fillText('!', x, by - 26);
  if (!near) return;
  c.font = 'bold 12px "Arial Rounded MT Bold", "Nunito", system-ui, sans-serif';
  const w = c.measureText(s.text).width + 22, y = by - 82 + Math.sin(t * 3) * 2;
  c.fillStyle = 'rgba(60,20,70,0.88)'; rr(c, x - w / 2, y, w, 26, 13); c.fill();
  c.beginPath(); c.moveTo(x - 6, y + 25); c.lineTo(x, y + 33); c.lineTo(x + 6, y + 25); c.fill();
  c.fillStyle = '#fff'; c.fillText(s.text, x, y + 17);
}
export function drawExit(c, E, t, open) {
  const x = E.x, y = E.y, w = E.w;
  c.save(); if (!open) c.globalAlpha = 0.35;
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.beginPath(); c.ellipse(x + w / 2, y + E.h, 26, 5, 0, 0, 7); c.fill();
  c.fillStyle = '#e8304f'; rr(c, x + 6, y + 40, w - 12, 32, 6); c.fill();
  c.fillStyle = '#ffd23a'; c.fillRect(x + w / 2 - 6, y + 52, 12, 8); c.fillStyle = '#b81e3a'; c.fillRect(x + 6, y + 40, w - 12, 5);
  c.fillStyle = 'rgba(210,240,255,0.55)'; c.beginPath(); c.arc(x + w / 2, y + 22, 23, 0, 7); c.fill();
  const r = rng(9), cols = ['#ff4f8b', '#4fd1ff', '#ffe14f', '#7dff8a', '#b88cff'];
  for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = r() * 16; c.fillStyle = cols[i % 5]; c.beginPath(); c.arc(x + w / 2 + Math.cos(a) * d, y + 26 + Math.sin(a) * d * 0.7, 4.5, 0, 7); c.fill(); }
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2.5; c.beginPath(); c.arc(x + w / 2, y + 22, 23, 3.6, 4.6); c.stroke();
  c.fillStyle = '#e8304f'; rr(c, x + w / 2 - 9, y - 6, 18, 8, 3); c.fill();
  if (open) { const a = (Math.sin(t * 4) + 1) / 2; c.fillStyle = `rgba(255,255,255,${0.2 + a * 0.3})`; star(c, x + w / 2 + 18, y - 2, 6, '#fff7b0', t); }
  c.restore();
}
