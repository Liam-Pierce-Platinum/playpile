// Everything drawn at a low internal resolution (H=180) and scaled up with nearest-neighbour.
import { GROUND } from './levels.js';
import { text } from './font.js';
import { DEFAULT_LOOK, buildSprite, skinFrames, FLAMES, RAINBOW_HUES, hsl } from './cosmetics.js';

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

// ---------- the equipped look (garage) ----------
export let LOOK = { ...DEFAULT_LOOK };
let clock = 0;
export function setLook(l) { LOOK = { ...DEFAULT_LOOK, ...l }; }
export function setClock(t) { clock = t; }
const RAINBOW = RAINBOW_HUES.map((h) => ramp(hsl(h, 0.95, 0.58)));
const rainbowRamp = (i = 0) => RAINBOW[(Math.floor(clock * 12) + i) % RAINBOW.length];
const flameDef = (look = LOOK) => FLAMES[look.flame] || FLAMES.classic;

// ---------- rocket (pixel sprite rotated by nearest sampling, then outlined) ----------
const sprCache = new Map();
export function spriteFor(look = LOOK) {
  const fr = skinFrames(look), f = fr > 1 ? Math.floor(clock * 10) % fr : 0;
  const key = look.skin + '|' + look.nose + '|' + look.fins + '|' + f;
  let g = sprCache.get(key);
  if (!g) { g = buildSprite(look, f); if (sprCache.size > 400) sprCache.clear(); sprCache.set(key, g); }
  return g;
}
const RN = 10, RG = new Array((RN * 2 + 1) ** 2);
export function drawRocket(ctx, x, y, a, flash, look = LOOK) {
  const spr = spriteFor(look);
  const X0 = Math.floor(x), Y0 = Math.floor(y), fx = x - X0, fy = y - Y0, ca = Math.cos(a), sa = Math.sin(a), N = RN * 2 + 1;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const dx = i - RN + 0.5 - fx, dy = j - RN + 0.5 - fy;
    const sx = Math.floor(dx * ca + dy * sa + 3.5), sy = Math.floor(-dx * sa + dy * ca + 7.5);
    const c = sy >= 0 && sy < 15 && sx >= 0 && sx < 7 ? spr[sy][sx] : null;
    RG[j * N + i] = c ? (flash ? '#ffffff' : c) : null;
  }
  ctx.fillStyle = INK;
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    if (RG[j * N + i]) continue;
    if ((i > 0 && RG[j * N + i - 1]) || (i < N - 1 && RG[j * N + i + 1]) || (j > 0 && RG[(j - 1) * N + i]) || (j < N - 1 && RG[(j + 1) * N + i])) ctx.fillRect(X0 + i - RN, Y0 + j - RN, 1, 1);
  }
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const c = RG[j * N + i]; if (c) { ctx.fillStyle = c; ctx.fillRect(X0 + i - RN, Y0 + j - RN, 1, 1); } }
}

// The short jet of flame pixels right behind the nozzle, plus its glow.
export function drawJet(ctx, r, cx, look = LOOK) {
  const fx = Math.sin(r.a), fy = -Math.cos(r.a), fd = flameDef(look);
  if (r.thr) {
    const cols = fd.rainbow ? rainbowRamp() : fd.cols;
    for (let k = 0; k < 5; k++) {
      const fl = Math.random() * 1.5;
      ctx.fillStyle = fd.rainbow ? RAINBOW[(k + Math.floor(clock * 14)) % RAINBOW.length][Math.min(3, k > 1 ? 2 : 1)] : cols[Math.min(6, k + (Math.random() < 0.3 ? 1 : 0))];
      ctx.fillRect(Math.round(r.x - fx * (6 + k * 1.6 + fl) - cx), Math.round(r.y - fy * (6 + k * 1.6 + fl)), k < 2 ? 2 : 1, k < 2 ? 2 : 1);
    }
    glow(ctx, r.x - fx * 8 - cx, r.y - fy * 8, 10, fd.rainbow ? rainbowRamp()[2] : fd.glow, 0.5);
  } else glow(ctx, r.x - fx * 5 - cx, r.y - fy * 5, 5, fd.rainbow ? rainbowRamp()[1] : fd.cols[2], 0.25);
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
    spawn({ x, y, vx: Math.cos(a) * v + (o.vx || 0), vy: Math.sin(a) * v + (o.vy || 0), life, max: life, c: typeof cols === 'function' ? cols() : cols, g: o.g ?? 60, drag: o.drag ?? 2.2, sz: o.sz || 1, crackle: o.crackle || 0, trail: o.trail || 0, shape: o.shape, nolight: o.nolight });
  }
}
export function firework(x, y, c, big = 1) {
  const cols = ramp(c);
  sparks(x, y, Math.round(46 * big), 95 * big, cols, { even: true, life: 1.1, g: 40, drag: 2.0, trail: 1 });
  sparks(x, y, Math.round(24 * big), 45 * big, cols, { life: 0.9, g: 30 });
  sparks(x, y, Math.round(10 * big), 70 * big, ['#ffffff', '#fff3a0', '#ffd23f'], { life: 1.4, g: 50, crackle: 1 });
  spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 20 * big, c: [c] });
}
// Sparks thrown out along a shape (unit points), all at the same speed, so the shape holds as it grows.
function shapeBurst(x, y, pts, sp, cols, o = {}) {
  for (const [ux, uy] of pts) {
    const life = (o.life || 1.2) * (0.92 + Math.random() * 0.12), j = 1 + (Math.random() - 0.5) * 0.04;
    spawn({ x, y, vx: ux * sp * j, vy: uy * sp * j, life, max: life, c: typeof cols === 'function' ? cols() : cols, g: o.g ?? 22, drag: o.drag ?? 1.7, sz: 1, trail: o.trail || 0, crackle: o.crackle || 0 });
  }
}
const ringPts = (n, r = 1) => Array.from({ length: n }, (_, i) => [Math.cos(i / n * Math.PI * 2) * r, Math.sin(i / n * Math.PI * 2) * r]);
const HEART_PTS = Array.from({ length: 40 }, (_, i) => { const t = i / 40 * Math.PI * 2; return [Math.sin(t) ** 3, -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) / 16]; });
const SMILE_PTS = [...ringPts(30), [-0.35, -0.3], [-0.35, -0.38], [0.35, -0.3], [0.35, -0.38], ...Array.from({ length: 9 }, (_, i) => { const t = Math.PI * (0.2 + 0.6 * i / 8); return [Math.cos(t) * 0.55, Math.sin(t) * 0.5]; })];
const GOLD = ['#ffffff', '#fff3a0', '#ffd23f', '#e8a93a', '#b8792a', '#6a3a1a'];
const SILVER = ['#ffffff', '#ffffff', '#e8eef8', '#c9d4e8', '#8e9ab8', '#4a5068'];
const randRainbow = () => RAINBOW[Math.floor(Math.random() * RAINBOW.length)];
// The burst style YOU equipped: used for the fireworks your rocket sets off.
export function burst(x, y, c, big = 1, style = LOOK.burst) {
  switch (style) {
    case 'ring':
      shapeBurst(x, y, ringPts(44), 88 * big, ramp(c), { life: 1.2, trail: 1 });
      shapeBurst(x, y, ringPts(24), 46 * big, ['#ffffff', '#ffffff', '#fff3a0', shade(c, 1.5), c, shade(c, 0.5)], { life: 1.0 });
      spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 20 * big, c: [c] }); break;
    case 'willow':
      sparks(x, y, Math.round(56 * big), 72 * big, GOLD, { even: true, life: 2.1, g: 58, drag: 1.5, trail: 1 });
      sparks(x, y, Math.round(14 * big), 30 * big, GOLD, { life: 1.4, g: 40 });
      spawn({ x, y, vx: 0, vy: 0, life: 0.2, max: 0.2, flash: 22 * big, c: ['#ffd23f'] }); break;
    case 'heart': {
      const pink = ['#ffffff', '#ffd0e0', '#ff8ab0', '#ff4f8d', '#c02a6a', '#6a1040'];
      shapeBurst(x, y, HEART_PTS, 62 * big, pink, { life: 1.3, trail: 1 });
      shapeBurst(x, y, HEART_PTS.filter((_, i) => i % 3 === 0), 30 * big, ['#ffffff', '#ffffff', '#ffd0e0', '#ff8ab0', '#ff4f8d'], { life: 1.0 });
      spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 18 * big, c: ['#ff4f8d'] }); break;
    }
    case 'smiley': {
      const yel = ['#ffffff', '#fff3a0', '#ffe066', '#ffd23f', '#e8a93a', '#8a5a1a'];
      shapeBurst(x, y, SMILE_PTS, 70 * big, yel, { life: 1.35, g: 14 });
      spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 18 * big, c: ['#ffd23f'] }); break;
    }
    case 'glitter':
      sparks(x, y, Math.round(40 * big), 80 * big, SILVER, { even: true, life: 1.2, g: 35, drag: 2, crackle: 1 });
      sparks(x, y, Math.round(30 * big), 60 * big, SILVER, { life: 1.6, g: 25, crackle: 1 });
      sparks(x, y, Math.round(10 * big), 50 * big, ['#ffffff', '#fff3a0', '#c9b8ff'], { life: 1.1, g: 10, shape: 'star' });
      spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 20 * big, c: ['#ffffff'] }); break;
    case 'rainbow':
      sparks(x, y, Math.round(50 * big), 95 * big, randRainbow, { even: true, life: 1.15, g: 40, drag: 2.0, trail: 1 });
      sparks(x, y, Math.round(24 * big), 45 * big, randRainbow, { life: 0.9, g: 30 });
      spawn({ x, y, vx: 0, vy: 0, life: 0.16, max: 0.16, flash: 22 * big, c: [RAINBOW[Math.floor(Math.random() * RAINBOW.length)][2]] }); break;
    case 'supernova': {
      shapeBurst(x, y, ringPts(56), 110 * big, () => randRainbow(), { life: 1.1, trail: 1 });
      sparks(x, y, Math.round(20 * big), 50 * big, ['#ffffff', '#ffffff', '#fff3a0', '#ffd23f'], { life: 0.8, g: 20 });
      for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2 + Math.random() * 0.4, v = 55 * big, l = 0.45 + Math.random() * 0.15; spawn({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: l, max: l, c: ['#ffffff', '#fff3a0', '#ffd23f'], g: 30, drag: 1.5, sz: 2, pop: 1 }); }
      spawn({ x, y, vx: 0, vy: 0, life: 0.22, max: 0.22, flash: 30 * big, c: ['#ffffff'] }); break;
    }
    default: firework(x, y, c, big);
  }
}
export function smoke(x, y, n) { for (let i = 0; i < n; i++) { const l = 0.8 + Math.random() * 0.8; spawn({ x: x + (Math.random() - 0.5) * 6, y: y + (Math.random() - 0.5) * 6, vx: (Math.random() - 0.5) * 20, vy: -10 - Math.random() * 15, life: l, max: l, c: SMOKE, g: -5, drag: 1.5, sz: 2, nolight: 1 }); } }
export function flame(x, y, dir, vx, vy, n, look = LOOK) {
  const fd = flameDef(look);
  sparks(x, y, n, 110, fd.rainbow ? () => rainbowRamp(Math.floor(Math.random() * 3)) : fd.cols, { dir, spread: 0.55, life: 0.35, g: 20, drag: 3, vx: vx * 0.5, vy: vy * 0.5 });
  if (fd.shape === 'heart' && Math.random() < 0.18 * n) sparks(x, y, 1, 55, ['#ffffff', '#ffd0e0', '#ff8ab0', '#ff4f8d', '#c02a6a'], { dir, spread: 0.8, life: 0.7, g: -25, drag: 3, vx: vx * 0.4, vy: vy * 0.4, shape: 'heart' });
  if (fd.shape === 'star' && Math.random() < 0.3 * n) sparks(x, y, 1, 70, ['#ffffff', '#ffffff', '#fff3a0', '#ffd23f', '#c9b8ff'], { dir, spread: 1.4, life: 0.5, g: 30, drag: 2.5, vx: vx * 0.4, vy: vy * 0.4, shape: 'star' });
}
// the little embers that drip from the nozzle while you coast
export function idleSpark(x, y, look = LOOK) { const fd = flameDef(look), c = fd.rainbow ? rainbowRamp() : fd.cols; sparks(x, y, 1, 15, [c[1], c[3], c[5]], { life: 0.3, g: 30 }); }
export { FIRE };

// ---------- trails (behind the rocket while it flies) ----------
let ribbon = [];
export function resetTrail() { ribbon = []; }
export function trail(r, dt, alive, look = LOOK) {
  const fx = Math.sin(r.a), fy = -Math.cos(r.a), tx = r.x - fx * 8, ty = r.y - fy * 8;
  const st = look.trail;
  for (const p of ribbon) p.age += dt;
  while (ribbon.length && ribbon[0].age > (st === 'comet' ? 0.75 : 0.55)) ribbon.shift();
  if (!alive) return;
  if (st === 'smoke') { if (r.thr && Math.random() < dt * 8) smoke(tx, ty, 1); }
  else if (st === 'puffs') { if (r.thr && Math.random() < dt * 11) { const l = 1.1 + Math.random() * 0.6; spawn({ x: tx + (Math.random() - 0.5) * 4, y: ty + (Math.random() - 0.5) * 4, vx: (Math.random() - 0.5) * 10, vy: -6 - Math.random() * 6, life: l, max: l, c: ['#ffffff', '#ece6f6', '#c8bede', '#9a8ab8'], g: -3, drag: 1.5, sz: 3, nolight: 1, alpha: 0.85 }); } }
  else if (st === 'bubbles') { if (Math.random() < dt * 10) { const l = 1.0 + Math.random() * 0.6; spawn({ x: tx + (Math.random() - 0.5) * 4, y: ty, vx: (Math.random() - 0.5) * 12, vy: -8 - Math.random() * 8, life: l, max: l, c: ['#e8fbff', '#9de8ff', '#7ad7ff', '#3fa0d0'], g: -12, drag: 1.2, sz: 1, shape: 'ring', nolight: 1, alpha: 1 }); } }
  else if (st === 'stardust') { if (Math.random() < dt * 34) { const l = 0.7 + Math.random() * 0.7; spawn({ x: tx + (Math.random() - 0.5) * 5, y: ty + (Math.random() - 0.5) * 5, vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8, life: l, max: l, c: ['#ffffff', '#fff3a0', '#c9b8ff', '#8e7fb8', '#4a3e70'], g: 3, drag: 2, sz: 1, shape: Math.random() < 0.25 ? 'star' : undefined }); } }
  else if (st === 'ribbon' || st === 'comet') {
    const last = ribbon[ribbon.length - 1];
    if (!last || Math.hypot(last.x - tx, last.y - ty) > 0.8) ribbon.push({ x: tx, y: ty, age: 0 });
    if (st === 'comet' && Math.random() < dt * 30) sparks(tx, ty, 1, 18, GOLD, { life: 0.5, g: 15 });
  }
}
const RIBBON_COLS = ['#ffffff', '#ffd0f0', '#ff8ad8', '#ff4fd8', '#c77dff', '#7a2fd0', '#3a1a70'];
const COMET_COLS = ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f3c', '#b8283a', '#4a1430'];
export function drawTrail(ctx, camX, look = LOOK) {
  if (ribbon.length < 2) return;
  const comet = look.trail === 'comet', cols = comet ? COMET_COLS : RIBBON_COLS, maxAge = comet ? 0.75 : 0.55;
  const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  for (let i = ribbon.length - 1; i > 0; i--) {
    const a = ribbon[i], b = ribbon[i - 1], k = a.age / maxAge;
    ctx.fillStyle = cols[Math.min(cols.length - 1, Math.floor(k * cols.length))];
    const w = k < (comet ? 0.35 : 0.2) ? 2 : 1, n = Math.max(1, Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))));
    for (let j = 0; j < n; j++) ctx.fillRect(Math.round(a.x + (b.x - a.x) * j / n - camX - (w >> 1)), Math.round(a.y + (b.y - a.y) * j / n - (w >> 1)), w, w);
    if (comet && k < 0.5 && i % 3 === 0) glow(ctx, a.x - camX, a.y, 4, '#ff9a3c', 0.35 * (1 - k));
  }
  ctx.globalCompositeOperation = op;
}

const SHAPES = { heart: ['.x.x.', 'xxxxx', '.xxx.', '..x..'], star: ['.x.', 'xxx', '.x.'], ring: ['.x.', 'x.x', '.x.'] };
function drawShape(ctx, p, x, y) {
  const sh = SHAPES[p.shape], w = sh[0].length, h = sh.length, x0 = Math.round(x) - (w >> 1), y0 = Math.round(y) - (h >> 1);
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (sh[j][i] === 'x') ctx.fillRect(x0 + i, y0 + j, 1, 1);
  if (p.shape === 'star' && p.life > p.max * 0.5) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x0 + 1, y0 + 1, 1, 1); }
}

export function updateParticles(dt) {
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt;
    if (p.life <= 0) {
      if (p.pop) { const c = randRainbow(); sparks(p.x, p.y, 16, 42, c, { even: true, life: 0.7, g: 30, drag: 2 }); spawn({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.12, max: 0.12, flash: 10, c: [c[2]] }); }
      P[i] = P[P.length - 1]; P.pop(); continue;
    }
    const d = 1 - (p.drag || 0) * dt; p.vx *= d; p.vy *= d; p.vy += (p.g || 0) * dt;
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.trail && Math.random() < 0.35) spawn({ x: p.x, y: p.y, vx: 0, vy: 0, life: 0.25, max: 0.25, c: p.c.slice(2), g: 15, drag: 0 });
    if (p.crackle && p.life < p.max * 0.5 && Math.random() < 0.08) { p.life = 0; sparks(p.x, p.y, 4, 25, ['#ffffff', '#fff3a0'], { life: 0.2, g: 0 }); }
  }
}
export function drawParticles(ctx, camX) {
  ctx.globalCompositeOperation = 'source-over';
  for (const p of P) if (p.nolight) {
    const k = 1 - p.life / p.max; ctx.fillStyle = p.c[Math.min(p.c.length - 1, Math.floor(k * p.c.length))]; ctx.globalAlpha = (p.alpha || 0.5) * (1 - k);
    if (p.shape) drawShape(ctx, p, p.x - camX, p.y); else ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), p.sz, p.sz);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'lighter';
  for (const p of P) {
    if (p.nolight) continue;
    if (p.flash) { glow(ctx, p.x - camX, p.y, p.flash * (0.6 + p.life / p.max), p.c[0], p.life / p.max); glow(ctx, p.x - camX, p.y, p.flash * 0.4, '#ffffff', p.life / p.max); continue; }
    const k = 1 - p.life / p.max;
    ctx.fillStyle = p.c[Math.min(p.c.length - 1, Math.floor(k * p.c.length))];
    if (p.shape) drawShape(ctx, p, p.x - camX, p.y); else ctx.fillRect(Math.round(p.x - camX), Math.round(p.y), p.sz, p.sz);
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
// A little gold coin. frame 0-3 spins it (full, narrow, edge, narrow).
export function coinIcon(ctx, x, y, frame = 0, sc = 1) {
  const w = [5, 3, 1, 3][frame & 3], x0 = Math.round(x + (5 - w) / 2 * sc), y0 = Math.round(y);
  const px = (i, j, c) => { ctx.fillStyle = c; ctx.fillRect(x0 + i * sc, y0 + j * sc, sc, sc); };
  for (let j = 0; j < 5; j++) for (let i = 0; i < w; i++) { if (w === 5 && (j === 0 || j === 4) && (i === 0 || i === 4)) continue; ctx.fillStyle = INK; ctx.fillRect(x0 + i * sc + sc, y0 + j * sc + sc, sc, sc); }
  for (let j = 0; j < 5; j++) for (let i = 0; i < w; i++) {
    if (w === 5 && (j === 0 || j === 4) && (i === 0 || i === 4)) continue;
    px(i, j, w === 1 ? '#b8792a' : i === 0 ? '#fff3a0' : i === w - 1 ? '#b8792a' : j === 0 ? '#fff3a0' : '#ffd23f');
  }
  if (w === 5) { px(2, 1, '#e8a93a'); px(2, 2, '#e8a93a'); px(2, 3, '#e8a93a'); }
}
export function lockIcon(ctx, x, y, c = '#8e7fb8') {
  ctx.fillStyle = INK; ctx.fillRect(x, y + 3, 7, 6); ctx.fillRect(x + 1, y - 1, 5, 4);
  ctx.fillStyle = c; ctx.fillRect(x + 1, y + 4, 5, 4); ctx.fillRect(x + 1, y, 1, 4); ctx.fillRect(x + 5, y, 1, 4); ctx.fillRect(x + 2, y, 3, 1);
  ctx.fillStyle = INK; ctx.fillRect(x + 3, y + 5, 1, 2);
}
// Tiny picture of a burst style for the garage thumbnails.
export function burstIcon(ctx, style, cx, cy) {
  cx = Math.round(cx); cy = Math.round(cy);
  const dot = (x, y, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(cx + x), Math.round(cy + y), 1, 1); };
  const rb = (i) => RAINBOW[i % RAINBOW.length][2];
  switch (style) {
    case 'ring': ringPts(18).forEach(([x, y]) => dot(x * 8, y * 8, '#3fd0ff')); ringPts(10).forEach(([x, y]) => dot(x * 4, y * 4, '#ffffff')); break;
    case 'willow': for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; for (let k = 1; k < 7; k++) dot(Math.cos(a) * k * 1.3, Math.sin(a) * k * 1.1 + k * k * 0.14 - 2, GOLD[Math.min(5, k - 1)]); } break;
    case 'heart': HEART_PTS.forEach(([x, y], i) => i % 2 || dot(x * 8, y * 8 - 1, '#ff6aa0')); dot(0, 0, '#ffffff'); break;
    case 'smiley': SMILE_PTS.forEach(([x, y]) => dot(x * 8, y * 8, '#ffe066')); break;
    case 'glitter': for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 2 + (i * 37 % 7); dot(Math.cos(a) * r, Math.sin(a) * r, i % 3 ? '#c9d4e8' : '#ffffff'); } [[-5, -4], [4, 3], [3, -5]].forEach(([x, y]) => { dot(x, y, '#ffffff'); dot(x - 1, y, '#c9d4e8'); dot(x + 1, y, '#c9d4e8'); dot(x, y - 1, '#c9d4e8'); dot(x, y + 1, '#c9d4e8'); }); break;
    case 'rainbow': ringPts(21).forEach(([x, y], i) => dot(x * 8, y * 8, rb(i))); ringPts(12).forEach(([x, y], i) => dot(x * 4, y * 4, rb(i + 3))); break;
    case 'supernova': ringPts(20).forEach(([x, y], i) => dot(x * 8, y * 8, rb(i))); for (let j = 0; j < 4; j++) { const a = j * Math.PI / 2 + 0.6; ringPts(6).forEach(([x, y]) => dot(Math.cos(a) * 4 + x * 2, Math.sin(a) * 4 + y * 2, '#ffffff')); } break;
    default: for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; for (let k = 2; k < 9; k += 2) dot(Math.cos(a) * k, Math.sin(a) * k, k > 6 ? '#b8283a' : k > 4 ? '#ff4f6d' : '#ffb0c0'); } dot(0, 0, '#ffffff');
  }
}
