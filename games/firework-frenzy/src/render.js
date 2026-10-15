// Everything drawn at a low internal resolution (H=180) and scaled up with nearest-neighbour.
import { GROUND } from './levels.js';
import { text } from './font.js';

export const H = 180;
const INK = '#0b0716';
const FIRE = ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f3c', '#b8283a', '#4a1430'];
const SMOKE = ['#6a5a80', '#4a3e60', '#2e2642'];

function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgb(r, g, b) { return '#' + ((1 << 24) | (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0))).toString(16).slice(1); }
export function shade(c, f) { const [r, g, b] = hex(c); return f < 1 ? rgb(r * f, g * f, b * f) : rgb(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)); }
const rampCache = {};
function ramp(c) { return rampCache[c] || (rampCache[c] = ['#ffffff', shade(c, 1.5), c, shade(c, 0.75), shade(c, 0.5), shade(c, 0.3)]); }

let hash = (n) => { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); return ((n ^ (n >>> 15)) >>> 0) / 4294967296; };

// ---------- background ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const SKY = ['#0d0724', '#160b33', '#211040', '#30164d', '#45205a', '#5e2a64', '#7a3768'];
let sky = null, skyW = 0, far = null, mid = null, stars = [];
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

export function buildBackground(W) {
  if (sky && skyW === W) return;
  skyW = W; sky = mkCanvas(W, H);
  const g = sky.getContext('2d');
  for (let y = 0; y < H; y++) {
    const v = Math.pow(y / H, 1.4) * (SKY.length - 1);
    const i = Math.floor(v), f = v - i;
    for (let x = 0; x < W; x++) {
      const th = BAYER[(y & 3) * 4 + (x & 3)] / 16;
      g.fillStyle = SKY[Math.min(SKY.length - 1, f > th ? i + 1 : i)];
      g.fillRect(x, y, 1, 1);
    }
  }
  // moon
  const mx = W - 64, my = 30;
  for (let y = -10; y <= 10; y++) for (let x = -10; x <= 10; x++) {
    const d = Math.hypot(x, y);
    if (d < 9.5) { g.fillStyle = d > 8 ? '#cfc4e8' : (x + y > 4 ? '#e8e0f7' : '#fbf6ff'); g.fillRect(mx + x, my + y, 1, 1); }
  }
  g.fillStyle = '#d8cdee'; [[-3, -2, 2], [3, 3, 2], [-1, 5, 1], [4, -4, 1]].forEach(([x, y, r]) => g.fillRect(mx + x, my + y, r + 1, r + 1));
  stars = []; for (let i = 0; i < W * 0.35; i++) stars.push([Math.floor(hash(i * 7 + 1) * W), Math.floor(hash(i * 13 + 5) * 120), hash(i * 3 + 9)]);
  far = skyline(640, 0x1f, '#2a1844', '#3d2a5c', 0.25, 30, 85, 11);
  mid = skyline(640, 0x7, '#1d1133', '#9a6a58', 0.16, 16, 50, 23);
}
function skyline(w, seed, body, win, winP, hmin, hmax, sd) {
  const c = mkCanvas(w, H), g = c.getContext('2d');
  let x = 0, k = seed;
  while (x < w) {
    const bw = 14 + Math.floor(hash(k++ * sd) * 26), bh = hmin + Math.floor(hash(k++ * sd + 3) * (hmax - hmin));
    const top = GROUND - bh;
    g.fillStyle = body; g.fillRect(x, top, bw, H - top);
    if (hash(k * 5) < 0.3) { g.fillRect(x + (bw >> 1), top - 6, 1, 6); } // spire
    if (hash(k * 9) < 0.25) { g.fillRect(x + 2, top - 3, bw - 4, 3); }
    g.fillStyle = win;
    for (let wy = top + 3; wy < GROUND - 3; wy += 4) for (let wx = x + 2; wx < x + bw - 2; wx += 3) if (hash(wx * 31 + wy * 17 + seed) < winP) g.fillRect(wx, wy, 1, 2);
    x += bw + Math.floor(hash(k++) * 4);
  }
  return c;
}

export function drawBackground(ctx, W, camX, t) {
  ctx.drawImage(sky, 0, 0);
  for (const [x, y, p] of stars) {
    const tw = Math.sin(t * (1 + p * 3) + p * 40);
    if (tw > -0.6) { ctx.fillStyle = tw > 0.85 ? '#ffffff' : p > 0.7 ? '#c9b8ff' : '#8e7fb8'; ctx.fillRect((x - camX * 0.02 + W * 10) % W | 0, y, 1, 1); }
    if (p > 0.96 && tw > 0.7) { ctx.fillStyle = '#6a5a9a'; ctx.fillRect(((x - camX * 0.02 + W * 10) % W | 0) - 1, y, 3, 1); ctx.fillRect(((x - camX * 0.02 + W * 10) % W | 0), y - 1, 1, 3); }
  }
  tile(ctx, far, camX * 0.15, W, 22); tile(ctx, mid, camX * 0.38, W, 10);
}
function tile(ctx, img, off, W, dy) { let x = -Math.floor(off % img.width); if (x > 0) x -= img.width; for (; x < W; x += img.width) ctx.drawImage(img, x, dy); }

// ---------- buildings ----------
const BODY = ['#3a3058', '#433664', '#4a3560', '#353e64', '#3f2d52'];
const bcache = new WeakMap();
function buildingImg(b) {
  let c = bcache.get(b); if (c) return c;
  const w = b.w, h = Math.ceil(H - b.y) + 2, k = Math.floor(b.x * 7 + b.w * 131 + b.h * 17);
  c = mkCanvas(w + 2, h + 4); const g = c.getContext('2d');
  const body = BODY[k % BODY.length];
  g.fillStyle = INK; g.fillRect(0, 3, w + 2, h);
  g.fillStyle = body; g.fillRect(1, 4, w, h);
  g.fillStyle = shade(body, 1.25); g.fillRect(1, 4, 1, h);              // lit edge
  g.fillStyle = shade(body, 0.7); g.fillRect(w, 4, 1, h);               // shadow edge
  g.fillStyle = shade(body, 1.45); g.fillRect(0, 2, w + 2, 2);          // roof ledge
  g.fillStyle = INK; g.fillRect(0, 1, w + 2, 1);
  const lit = ['#ffd27a', '#ffe9a8', '#ffb85c', '#7ad7ff'];
  const cols = Math.floor((w - 4) / 5), ox = Math.floor((w - cols * 5 + 2) / 2) + 1;
  for (let wy = 9, r = 0; wy < h - 6; wy += 7, r++) for (let cI = 0; cI < cols; cI++) {
    const p = hash(k + r * 97 + cI * 13);
    const wx = ox + cI * 5;
    if (p < 0.38) { const col = lit[Math.floor(hash(k + r * 7 + cI) * (p < 0.04 ? 4 : 3))]; g.fillStyle = col; g.fillRect(wx, wy, 3, 4); g.fillStyle = shade(col, 0.8); g.fillRect(wx, wy + 3, 3, 1); }
    else { g.fillStyle = shade(body, 0.6); g.fillRect(wx, wy, 3, 4); g.fillStyle = shade(body, 0.85); g.fillRect(wx, wy, 1, 1); }
  }
  bcache.set(b, c); return c;
}
export function drawBuildings(ctx, s, camX, W, t) {
  for (const b of s.buildings) {
    if (b.x + b.w < camX - 4 || b.x > camX + W + 4) continue;
    ctx.drawImage(buildingImg(b), Math.round(b.x - camX) - 1, Math.round(b.y) - 3);
    if (Math.sin(t * 3 + b.x) > 0.2) { ctx.fillStyle = '#ff3b4f'; ctx.fillRect(Math.round(b.x - camX + b.w - 2), Math.round(b.y) - 1, 1, 1); }
  }
}
export function drawGround(ctx, camX, W) {
  ctx.fillStyle = '#3a2f52'; ctx.fillRect(0, GROUND, W, 1);
  ctx.fillStyle = '#231b36'; ctx.fillRect(0, GROUND + 1, W, 3);
  ctx.fillStyle = '#130d22'; ctx.fillRect(0, GROUND + 4, W, H - GROUND - 4);
  ctx.fillStyle = '#5a4a6e'; for (let x = -Math.floor(camX % 16); x < W; x += 16) ctx.fillRect(x, GROUND + 6, 6, 1);
}

// ---------- props ----------
export function drawWires(ctx, s, camX, t) {
  for (const w of s.wires) {
    if (w.x2 < camX - 4 || w.x1 > camX + 500) continue;
    ctx.fillStyle = '#9a8ab8';
    for (let i = 0; i < w.pts.length - 1; i++) {
      const [ax, ay] = w.pts[i], [bx, by] = w.pts[i + 1], n = Math.ceil(Math.max(Math.abs(bx - ax), Math.abs(by - ay)));
      for (let j = 0; j <= n; j++) ctx.fillRect(Math.round(ax + (bx - ax) * j / n - camX), Math.round(ay + (by - ay) * j / n), 1, 1);
    }
    for (const [x, y] of [w.pts[0], w.pts[14]]) { ctx.fillStyle = '#5c4f74'; ctx.fillRect(Math.round(x - camX) - 1, Math.round(y) - 1, 3, 3); }
    // a spark that runs along the live wire
    const u = (t * 0.7 + w.x1 * 0.013) % 1, p = w.pts[Math.floor(u * 14)], q = w.pts[Math.floor(u * 14) + 1], f = u * 14 % 1;
    const sx = Math.round(p[0] + (q[0] - p[0]) * f - camX), sy = Math.round(p[1] + (q[1] - p[1]) * f);
    ctx.fillStyle = '#7ad7ff'; ctx.fillRect(sx - 1, sy, 3, 1); ctx.fillRect(sx, sy - 1, 1, 3); ctx.fillStyle = '#ffffff'; ctx.fillRect(sx, sy, 1, 1);
  }
}

const BIRD = [['x.....x', '.x...x.', '..xox..', '...x...'], ['.......', '..xox..', '.x...x.', 'x.....x']];
export function drawBirds(ctx, s, camX, t) {
  for (const b of s.birds) {
    const fr = BIRD[Math.floor(t * 8 + b.ph * 3) % 2], x0 = Math.round(b.x - camX) - 3, y0 = Math.round(b.y) - 2;
    for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) {
      const c = fr[y][b.dir > 0 ? x : 6 - x]; if (c === '.') continue;
      ctx.fillStyle = INK; ctx.fillRect(x0 + x, y0 + y + 1, 1, 1);
    }
    for (let y = 0; y < 4; y++) for (let x = 0; x < 7; x++) {
      const c = fr[y][b.dir > 0 ? x : 6 - x]; if (c === '.') continue;
      ctx.fillStyle = c === 'o' ? '#ffffff' : '#c8bede'; ctx.fillRect(x0 + x, y0 + y, 1, 1);
    }
  }
}

const SHELL = ['.hcc.', 'hcccd', 'ccccd', 'cccdd', '.ddd.'];
export function drawShells(ctx, s, camX, t) {
  for (const sh of s.shells) {
    if (sh.st === 2) continue;
    const bob = sh.st === 1 ? (Math.random() * 2 - 1) : Math.round(Math.sin(t * 2 + sh.id) * 1);
    const x0 = Math.round(sh.x - camX) - 2, y0 = Math.round(sh.y) - 2 + bob;
    if (x0 < -10 || x0 > 1000) continue;
    glow(ctx, x0 + 2, y0 + 2, sh.st === 1 ? 9 : 6, sh.c, sh.st === 1 ? 0.5 : 0.18);
    const cs = { h: shade(sh.c, 1.6), c: sh.c, d: shade(sh.c, 0.62) };
    ctx.fillStyle = INK; ctx.fillRect(x0, y0 - 1, 5, 7); ctx.fillRect(x0 - 1, y0 + 1, 7, 3);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) { const k = SHELL[y][x]; if (k === '.') continue; ctx.fillStyle = sh.st === 1 && Math.floor(t * 30) % 2 ? '#ffffff' : cs[k]; ctx.fillRect(x0 + x, y0 + y, 1, 1); }
    ctx.fillStyle = '#c9a070'; ctx.fillRect(x0 + 2, y0 - 2, 1, 2);
    const sp = sh.st === 1 || Math.sin(t * 9 + sh.id * 2) > 0.3;
    if (sp) { ctx.fillStyle = sh.st === 1 ? '#ffffff' : '#ffd23f'; ctx.fillRect(x0 + 2, y0 - 3, 1, 1); if (sh.st === 1) { ctx.fillRect(x0 + 1, y0 - 4, 1, 1); ctx.fillRect(x0 + 3, y0 - 4, 1, 1); } }
  }
}

export function drawRings(ctx, s, camX, t) {
  for (const g of s.rings) {
    const cx = Math.round(g.x - camX), cy = Math.round(g.y);
    if (cx < -20 || cx > 1000) continue;
    if (g.got) {
      if (g.t > 0.45) continue;
      const k = 1 + g.t * 5; ctx.fillStyle = g.t < 0.15 ? '#ffffff' : '#ffd23f';
      for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; ctx.fillRect(Math.round(cx + Math.cos(a) * 5 * k), Math.round(cy + Math.sin(a) * 11 * k), 1, 1); }
      continue;
    }
    glow(ctx, cx, cy, 13, '#ffd23f', 0.14);
    for (let pass = 0; pass < 2; pass++) for (let i = 0; i < 44; i++) {
      const a = i / 44 * Math.PI * 2, x = Math.round(cx + Math.cos(a) * (5 - pass)), y = Math.round(cy + Math.sin(a) * (11 - pass));
      const sh = (Math.sin(a * 2 - t * 5) + 1) / 2;
      ctx.fillStyle = pass ? (sh > 0.7 ? '#fff3a0' : '#ffd23f') : (Math.cos(a) > 0.3 ? '#b8792a' : '#e8a93a');
      ctx.fillRect(x, y, 1, 1);
    }
    ctx.fillStyle = INK; ctx.fillRect(cx - 1, cy + 12, 3, 1);
  }
}

// ---------- rocket (pixel sprite rotated by nearest sampling, then outlined) ----------
const ROCKET = [
  '...Y...',
  '..RRr..',
  '..RRr..',
  '..WWw..',
  '..BBb..',
  '..WWw..',
  '..BBb..',
  '..WWw..',
  '..RRr..',
  '.oRRro.',
  'ooRRroo',
  'o.kkk.o',
  '...s...',
  '...s...',
  '...S...',
];
const RC = { Y: '#ffe066', R: '#ff5a5f', r: '#b8283a', W: '#fff6ea', w: '#c9bcd6', B: '#4fb0ff', b: '#2a6ad0', o: '#ff9a3c', k: '#3a3048', s: '#c9a070', S: '#8a6a4a' };
const RN = 10, RG = new Array((RN * 2 + 1) ** 2);
export function drawRocket(ctx, x, y, a, flash) {
  const X0 = Math.floor(x), Y0 = Math.floor(y), fx = x - X0, fy = y - Y0, ca = Math.cos(a), sa = Math.sin(a), N = RN * 2 + 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = i - RN + 0.5 - fx, dy = j - RN + 0.5 - fy;
    const sx = Math.floor(dx * ca + dy * sa + 3.5), sy = Math.floor(-dx * sa + dy * ca + 7.5);
    const ch = sy >= 0 && sy < 15 && sx >= 0 && sx < 7 ? ROCKET[sy][sx] : '.';
    RG[j * N + i] = ch === '.' ? null : (flash ? '#ffffff' : RC[ch]);
  }
  ctx.fillStyle = INK;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (RG[j * N + i]) continue;
    if ((i > 0 && RG[j * N + i - 1]) || (i < N - 1 && RG[j * N + i + 1]) || (j > 0 && RG[(j - 1) * N + i]) || (j < N - 1 && RG[(j + 1) * N + i])) ctx.fillRect(X0 + i - RN, Y0 + j - RN, 1, 1);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = RG[j * N + i]; if (c) { ctx.fillStyle = c; ctx.fillRect(X0 + i - RN, Y0 + j - RN, 1, 1); } }
}

// ---------- glow (blocky, posterized) ----------
const gcache = {};
export function glow(ctx, x, y, r, c, a) {
  r = Math.max(2, Math.round(r));
  const key = c + r; let img = gcache[key];
  if (!img) {
    img = mkCanvas(r * 2 + 1, r * 2 + 1); const g = img.getContext('2d'); g.fillStyle = c;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const d = Math.hypot(i, j) / r; if (d > 1) continue; const lvl = d < 0.35 ? 1 : d < 0.65 ? 0.55 : 0.25; g.globalAlpha = lvl; g.fillRect(i + r, j + r, 1, 1); }
    gcache[key] = img;
  }
  const o = ctx.globalAlpha, op = ctx.globalCompositeOperation;
  ctx.globalAlpha = Math.min(1, a); ctx.globalCompositeOperation = 'lighter';
  ctx.drawImage(img, Math.round(x) - r, Math.round(y) - r);
  ctx.globalAlpha = o; ctx.globalCompositeOperation = op;
}

// ---------- particles ----------
export const P = [];
export function spawn(o) { if (P.length < 3000) P.push(o); }
export function sparks(x, y, n, sp, cols, o = {}) {
  for (let i = 0; i < n; i++) {
    const a = o.dir != null ? o.dir + (Math.random() - 0.5) * (o.spread || 0.6) : Math.random() * Math.PI * 2;
    const v = sp * (o.even ? 0.85 + Math.random() * 0.15 : 0.3 + Math.random() * 0.7);
    const life = (o.life || 0.8) * (0.6 + Math.random() * 0.5);
    spawn({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), life, max: life, c: cols, g: o.g ?? 60, drag: o.drag ?? 2.2, sz: o.sz || 1, crackle: o.crackle || 0, trail: o.trail || 0 });
  }
}
export function firework(x, y, c, big = 1) {
  const cols = ramp(c);
  sparks(x, y, Math.round(46 * big), 95 * big, cols, { even: true, life: 1.1, g: 40, drag: 2.0, trail: 1 });
  sparks(x, y, Math.round(24 * big), 45 * big, cols, { life: 0.9, g: 30 });
  sparks(x, y, Math.round(10 * big), 70 * big, ['#ffffff', '#fff3a0', '#ffd23f'], { life: 1.4, g: 50, crackle: 1 });
  spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 20 * big, c: [c] });
}
export function smoke(x, y, n) { for (let i = 0; i < n; i++) { const l = 0.8 + Math.random() * 0.8; spawn({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15, life: l, max: l, c: SMOKE, g: -5, drag: 1.5, sz: 2, nolight: 1 }); } }
export function flame(x, y, dir, vx, vy, n) { sparks(x, y, n, 110, FIRE, { dir, spread: 0.55, life: 0.35, g: 20, drag: 3, vx: vx * 0.5, vy: vy * 0.5 }); }
export { FIRE };

export function updateParticles(dt) {
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt;
    if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
    const d = 1 - (p.drag || 0) * dt; p.vx *= d; p.vy *= d; p.vy += (p.g || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.trail && Math.random() < 0.35) spawn({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: p.c.slice(2), g: 15, drag: 0 });
    if (p.crackle && p.life < p.max * 0.5 && Math.random() < 0.08) { p.life = 0; sparks(p.x, p.y, 4, 25, ['#ffffff', '#fff3a0'], { life: 0.2, g: 0 }); }
  }
}
export function drawParticles(ctx, camX) {
  ctx.globalCompositeOperation = 'source-over';
  for (const p of P) if (p.nolight) { const k = 1 - p.life / p.max; ctx.fillStyle = p.c[Math.min(p.c.length - 1, Math.floor(k * p.c.length))]; ctx.globalAlpha = 0.5 * (1 - k); ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), p.sz, p.sz); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
  for (const p of P) {
    if (p.nolight) continue;
    if (p.flash) { glow(ctx, p.x - camX, p.y, p.flash * (0.6 + p.life / p.max), p.c[0], p.life / p.max); glow(ctx, p.x - camX, p.y, p.flash * 0.4, '#ffffff', p.life / p.max); continue; }
    const k = 1 - p.life / p.max;
    ctx.fillStyle = p.c[Math.min(p.c.length - 1, Math.floor(k * p.c.length))];
    ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), p.sz, p.sz);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- UI bits ----------
export function panel(ctx, x, y, w, h, col = '#1a1030') {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = INK; ctx.fillRect(x - 1, y - 2, w + 2, h + 4); ctx.fillRect(x - 2, y - 1, w + 4, h + 2);
  ctx.fillStyle = '#5a3f86'; ctx.fillRect(x, y - 1, w, h + 2); ctx.fillRect(x - 1, y, w + 2, h);
  ctx.fillStyle = col; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(col, 1.25); ctx.fillRect(x, y, w, 1);
}
export function button(ctx, b, sel, t) {
  const up = sel ? Math.round(Math.sin(t * 8)) : 0;
  panel(ctx, b.x, b.y - (sel ? 1 : 0), b.w, b.h, sel ? '#ff4f6d' : '#2a1a48');
  text(ctx, b.label, b.x + b.w / 2, b.y + (b.h - 5) / 2 - (sel ? 1 : 0) + up * 0, sel ? '#ffffff' : '#d8c8f0', { align: 'center' });
}
export function starIcon(ctx, x, y, on, sc = 1) {
  const S = ['..x..', '.xxx.', 'xxxxx', '.xxx.', '.x.x.'];
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (S[j][i] === 'x') {
    ctx.fillStyle = INK; ctx.fillRect(x + i * sc + 1, y + j * sc + 1, sc, sc);
  }
  for (let j = 0; j < 5; j++) for (let i = 0; i < 5; i++) if (S[j][i] === 'x') { ctx.fillStyle = on ? (j < 2 ? '#fff3a0' : '#ffd23f') : '#4a3a66'; ctx.fillRect(x + i * sc, y + j * sc, sc, sc); }
}
export { text };
