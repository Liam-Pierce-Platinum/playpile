'use strict';
// render.js - draws the world and the in-game HUD.
// Everything expensive is painted once at load into offscreen canvases (ordered-dither
// gradients, clouds, mountain ranges, ground texture, shore, ice); each frame just
// scrolls and blits them, so the game stays at 60fps.

// ---------------------------------------------------------------- painting helpers
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];
const dith = (a, x, y) => a > bayer(x, y); // draw this pixel at "opacity" a?
function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
// Paint a canvas pixel by pixel; fn(x, y) returns a hex colour or null for transparent.
function paint(w, h, fn) {
  const c = makeCanvas(w, h), g = c.getContext('2d'), img = g.createImageData(w, h), d = img.data, cache = {};
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const col = fn(x, y); if (!col) continue;
    const rgb = cache[col] || (cache[col] = rgbOf(col)), i = (y * w + x) * 4;
    d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// ordered-dither pick along a palette ramp (t in 0..1)
function ramp(stops, t, x, y) {
  const p = clamp(t, 0, 1) * (stops.length - 1), i = Math.floor(p);
  return stops[Math.min(stops.length - 1, p - i > bayer(x, y) ? i + 1 : i)];
}
// blend two hex colours (t 0..1)
function mixHex(a, b, t) {
  const A = rgbOf(a), B = rgbOf(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
// a dark silhouette of any sprite (fish book, logo shadow)
function silhouette(img, col) {
  const c = makeCanvas(img.width, img.height), g = c.getContext('2d');
  g.drawImage(img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = col; g.fillRect(0, 0, c.width, c.height);
  return c;
}
const TAU = Math.PI * 2;

// ---------------------------------------------------------------- 5x7 font for headings and numbers
const BIG = {
  A: '01110100011000111111100011000110001', B: '11110100011000111110100011000111110', C: '01110100011000010000100001000101110',
  D: '11110100011000110001100011000111110', E: '11111100001000011110100001000011111', F: '11111100001000011110100001000010000',
  G: '01110100011000010111100011000101111', H: '10001100011000111111100011000110001', I: '01110001000010000100001000010001110',
  J: '00111000100001000010000101001001100', K: '10001100101010011000101001001010001', L: '10000100001000010000100001000011111',
  M: '10001110111010110101100011000110001', N: '10001100011100110101100111000110001', O: '01110100011000110001100011000101110',
  P: '11110100011000111110100001000010000', Q: '01110100011000110001101011001001101', R: '11110100011000111110101001001010001',
  S: '01111100001000001110000010000111110', T: '11111001000010000100001000010000100', U: '10001100011000110001100011000101110',
  V: '10001100011000110001100010101000100', W: '10001100011000110101101011010101010', X: '10001100010101000100010101000110001',
  Y: '10001100010101000100001000010000100', Z: '11111000010001000100010001000011111',
  '0': '01110100011001110101110011000101110', '1': '00100011000010000100001000010001110', '2': '01110100010000100010001000100011111',
  '3': '11111000100010000010000011000101110', '4': '00010001100101010010111110001000010', '5': '11111100001111000001000011000101110',
  '6': '00110010001000011110100011000101110', '7': '11111000010001000100010000100001000', '8': '01110100011000101110100011000101110',
  '9': '01110100011000101111000010001001100', '!': '00100001000010000100001000000000100', '?': '01110100010000100010001000000000100',
  '.': '00000000000000000000000000110001100', '-': '00000000000000011111000000000000000', "'": '00100001000100000000000000000000000',
  ':': '00000011000110000000011000110000000', '/': '00001000100001000100010001000010000', '+': '00000001000010011111001000010000000',
  '<': '00010001000100010000010000010000010', '>': '01000001000001000001000100010001000', ' ': '00000000000000000000000000000000000',
  '%': '11001110010001000100010001001110011',
};
function bigWidth(s, sc = 1) { return s.length * 6 * sc - sc; }
function drawBig(s, x, y, col = '#fff', sc = 1, align = 'left', sh = '#0b0e12') {
  s = String(s).toUpperCase();
  if (align === 'center') x -= Math.floor(bigWidth(s, sc) / 2);
  else if (align === 'right') x -= bigWidth(s, sc);
  x = Math.round(x); y = Math.round(y);
  for (const pass of sh ? [0, 1] : [1]) {
    ctx.fillStyle = pass ? col : sh;
    const o = pass ? 0 : sc;
    for (let i = 0; i < s.length; i++) {
      const g = BIG[s[i]] || BIG['?'];
      for (let p = 0; p < 35; p++) if (g[p] === '1') ctx.fillRect(x + i * 6 * sc + (p % 5) * sc + o, y + Math.floor(p / 5) * sc + o, sc, sc);
    }
  }
}
// wrap small-font text to a pixel width
function wrapText(s, maxW) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (textWidth(t) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur);
  return lines;
}

// ---------------------------------------------------------------- sky, sun, clouds
const SKY_H = 380;
const SKY_NEAR = paint(W, SKY_H, (x, y) => ramp(['#2b2f36', '#343940', '#3e444b', '#4a5057', '#575d64', '#656a70', '#74797e', '#85898d', '#979a9d', '#a9acae'], Math.pow(y / SKY_H, 1.5), x, y));
const SKY_FAR = paint(W, SKY_H, (x, y) => ramp(['#1b1e23', '#22262c', '#2a2e34', '#33373d', '#3c4147', '#464b51', '#52565b', '#5e6266', '#6a6e71', '#77797c'], Math.pow(y / SKY_H, 1.5), x, y));
const SUN = paint(72, 72, (x, y) => {
  const d = Math.hypot(x - 35.5, y - 35.5) / 36;
  if (d < 0.17) return '#eef0f1';
  if (d < 0.23) return '#d8dcdf';
  return d < 1 && dith(Math.pow(1 - d, 2.4) * 0.95, x, y) ? '#b9bec2' : null;
});
const CLOUD_W = 640;
function makeClouds(seed, cy, puff, cols) {
  const r = mulberry32(seed), ph = Array.from({ length: 7 }, () => r() * TAU), T = TAU / CLOUD_W;
  const amount = x => clamp((Math.sin(x * T * 3 + ph[5]) + 0.6 * Math.sin(x * T * 7 + ph[6]) + 0.55) * 1.4, 0, 1);
  const top = x => cy - amount(x) * puff * (0.55 + 0.45 * (0.55 * Math.sin(x * T * 5 + ph[0]) + 0.3 * Math.sin(x * T * 11 + ph[1]) + 0.15 * Math.sin(x * T * 23 + ph[2]))) - 2.5 * amount(x) * Math.abs(Math.sin(x * T * 41 + ph[3]));
  const bot = x => cy + amount(x) * (3 + 1.5 * Math.sin(x * T * 9 + ph[4]));
  return paint(CLOUD_W, cy + 8, (x, y) => {
    const t0 = top(x), b0 = bot(x);
    if (b0 - t0 < 1.5 || y < t0 || y > b0) return null;
    if (y - t0 < 1.2) return cols[0];
    const u = (y - t0) / (b0 - t0);
    if (u < 0.25 && dith(1 - u / 0.25, x, y)) return cols[0];
    return u > 0.6 && dith((u - 0.6) / 0.4, x, y) ? cols[2] : cols[1];
  });
}
const CLOUDS = [
  { img: makeClouds(11, 30, 22, ['#9a9ea2', '#85898e', '#74787d']), par: 0.04, speed: 1.6, y: 150 },
  { img: makeClouds(23, 24, 16, ['#83878c', '#6c7075', '#5d6166']), par: 0.09, speed: 3.2, y: 118 },
  { img: makeClouds(37, 20, 12, ['#a7aaad', '#8f9296', '#7c8085']), par: 0.16, speed: 5.5, y: 86 },
];

// ---------------------------------------------------------------- mountains + horizon
const MTN_W = 960;
function makeRange(seed, H0, c) {
  const r = mulberry32(seed), ph = [r() * TAU, r() * TAU, r() * TAU];
  const peak = (x, k, p) => 1 - Math.abs(Math.sin(Math.PI * x * k / MTN_W + p));
  const hs = new Float32Array(MTN_W);
  for (let x = 0; x < MTN_W; x++) hs[x] = H0 * (0.5 * peak(x, 2, ph[0]) ** 1.6 + 0.32 * peak(x, 5, ph[1]) ** 1.4 + 0.18 * peak(x, 11, ph[2])) + 4;
  const HH = Math.ceil(H0 + 8);
  const img = paint(MTN_W, HH, (x, y) => {
    const top = HH - hs[x]; if (y < top) return null;
    const depth = y - top, alt = hs[x] / H0;
    const lit = hs[(x + 1) % MTN_W] - hs[(x + MTN_W - 1) % MTN_W] < 0; // faces turned toward the sun (right)
    const snowDepth = alt > 0.42 ? (alt - 0.42) * H0 * 0.55 + 2 + hash(x, seed) * 2 : (depth < 1 ? 1 : 0);
    let col;
    if (depth < snowDepth) col = lit ? c.snow : c.snowS;
    else if (depth < snowDepth + 7 && hash(x, Math.floor(y / 2) + seed) > 0.72) col = lit ? c.snow : c.snowS; // snow gullies
    else col = lit ? c.rock : c.rockS;
    const hz = (y - (HH - H0 * 0.6)) / (H0 * 0.6); // atmospheric haze toward the base, in soft steps
    if (hz > 0) col = mixHex(col, c.haze, Math.round(clamp(hz, 0, 1) * 5) / 5 * 0.9);
    return col;
  });
  return { img, HH };
}
const RANGES = [
  { ...makeRange(301, 78, { rock: '#71777d', rockS: '#666c72', snow: '#aeb3b7', snowS: '#9ba0a5', haze: '#8b9094' }), par: 0.1, drop: 8 },
  { ...makeRange(302, 58, { rock: '#565c63', rockS: '#4a5056', snow: '#cdd1d4', snowS: '#aab0b5', haze: '#7d8287' }), par: 0.22, drop: 5 },
  { ...makeRange(303, 30, { rock: '#8f989f', rockS: '#7c858d', snow: '#e4e8eb', snowS: '#c8ced3', haze: '#9ca2a7' }), par: 0.42, drop: 2 },
];
const HAZE = (() => {
  const c = makeCanvas(W, 26), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 26);
  gr.addColorStop(0, 'rgba(162,167,171,0)'); gr.addColorStop(1, 'rgba(162,167,171,0.75)');
  g.fillStyle = gr; g.fillRect(0, 0, W, 26); return c;
})();
const HORIZON_W = 1200;
const HORIZON = (() => {
  const r = mulberry32(55), shapes = [];
  for (let i = 0; i < 9; i++) shapes.push({ x: r() * HORIZON_W, w: 12 + r() * 40, h: 4 + r() * 12, p: 0.3 + r() * 0.4 });
  return paint(HORIZON_W, 18, (x, y) => {
    for (const s of shapes) {
      let dx = x - s.x; if (dx < -HORIZON_W / 2) dx += HORIZON_W; if (dx > HORIZON_W / 2) dx -= HORIZON_W;
      const u = dx / s.w; if (u < -0.5 || u > 0.5) continue;
      const pk = u < s.p - 0.5 ? (u + 0.5) / s.p : (0.5 - u) / (1 - s.p);
      if (y >= 18 - s.h * Math.min(1, pk * 1.8)) return u < s.p - 0.5 ? '#cdd2d6' : '#adb4ba';
    }
    return null;
  });
})();

// ---------------------------------------------------------------- water + underwater light
const WATER_H = 700;
const WATER = paint(W, WATER_H, (x, y) => ramp(['#7d8a94', '#6b7882', '#5c6872', '#4f5a64', '#444e57', '#3a434b', '#313940', '#293037', '#22282e', '#1c2126', '#171b1f'], Math.pow(y / WATER_H, 0.75), x, y));
const RAYS = paint(220, 170, (x, y) => {
  const fade = Math.pow(1 - y / 170, 1.6);
  for (const [b0, bw] of [[20, 9], [70, 5], [112, 12], [170, 6]]) {
    const cx = b0 + y * 0.42, w = bw + y * 0.07, d = Math.abs(x - cx) / w;
    if (d < 1 && dith((1 - d) * fade * 0.9, x, y)) return '#dfe5e9';
  }
  return null;
});
const DEPTH_FOG = (() => {
  const c = makeCanvas(1, 520), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, 520);
  gr.addColorStop(0, 'rgba(20,25,30,0)'); gr.addColorStop(0.35, 'rgba(18,22,27,0.25)'); gr.addColorStop(1, 'rgba(10,12,15,0.6)');
  g.fillStyle = gr; g.fillRect(0, 0, 1, 520); return c;
})();
const VIGNETTE = (() => {
  const c = makeCanvas(W, H), g = c.getContext('2d'), gr = g.createRadialGradient(W / 2, H / 2, H * 0.45, W / 2, H / 2, W * 0.62);
  gr.addColorStop(0, 'rgba(8,10,13,0)'); gr.addColorStop(1, 'rgba(8,10,13,0.5)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H); return c;
})();
const MSNOW = []; { const r = mulberry32(71); for (let i = 0; i < 70; i++) MSNOW.push([r() * W, r() * H, 0.3 + r() * 0.7, r() * TAU]); }
const SNOWF = []; { const r = mulberry32(5); for (let i = 0; i < 150; i++) SNOWF.push([r() * W, r() * H, 0.35 + r() * 0.85, r() * TAU]); }

// ---------------------------------------------------------------- seabed texture
const GT_W = 256, GT_H = 220;
const GROUND = paint(GT_W, GT_H, (x, y) => {
  if (y === 0) return hash(x, 3) > 0.7 ? '#9aa0a6' : '#878d94';
  if (y < 3) return hash(x, y) > 0.5 ? '#6f757c' : '#646a71';
  const wav = y + 3 * Math.sin(x * TAU * 2 / GT_W) + 2 * Math.sin(x * TAU * 5 / GT_W + 1);
  if (Math.floor(wav) % 19 === 0 && y > 8) return '#363b41';
  let col = ramp(['#596067', '#4c5259', '#41464c', '#373c41', '#2e3237', '#272a2e'], Math.pow(y / GT_H, 0.8), x, y);
  const cx = (x >> 3) * 8 + 4, cy = (y >> 3) * 8 + 4;
  if (hash(x >> 3, (y >> 3) + 50) > 0.78) {
    const dx = x - cx - (hash(x >> 3, 9) - 0.5) * 3, dy = (y - cy) * 1.5, d2 = dx * dx + dy * dy;
    if (d2 < 7) col = dy < -0.8 ? '#787e85' : d2 > 4 ? '#3c4147' : '#5c6269';
  }
  return col;
});

// caves: repaint with a darker, dithered interior, a lit rim and glowing crystals
for (const c of caves) {
  c.crystals = [];
  const w = c.x1 - c.x0, h = c.y1 - c.y0;
  c.img = paint(w, h, (x, y) => {
    const wx = c.x0 + x + 0.5, wy = c.y0 + y + 0.5;
    if (wy < bed(wx)) return null;
    const d = tunnelDepth(c, wx, wy)[0];
    // open water inside the tunnel: cold blue-grey, a touch lighter than the rock so it reads as space
    if (d > 2) {
      if (hash(x >> 1, y >> 1) > 0.975) return '#4a5864';
      return ramp(['#3f4c57', '#36424c', '#2e3942', '#283139', '#222a31'], clamp((d - 2) / 20, 0, 1) * 0.5 + clamp((wy - bed(wx)) / 140, 0, 1) * 0.5, x, y);
    }
    if (d > 1) return '#616a72';
    if (d > 0) return hash(x, y) > 0.4 ? '#9aa3ab' : '#7b848c';
    // the rock wall: a crisp dark edge, crystals, then shadow fading out into the seabed
    if (d > -2) return '#15181b';
    if (d > -5 && hash(x * 3, y * 5) > 0.93) { const col = hash(y, x) > 0.5 ? '#9ff6ff' : '#c9a2ff'; c.crystals.push([wx, wy, col]); return col; }
    if (wy > bed(wx) + 3 && dith((1 + d / 26) * 0.9, x, y)) return hash(x >> 2, y >> 2) > 0.8 ? '#2c3035' : '#202327';
    return null;
  });
}

// ---------------------------------------------------------------- the home shore
const SHORE_Y0 = SHELF_Y - 10, SHORE_W = -SHELF_L + 8, SHORE_H = 330;
const mound = wx => Math.max(0, 9 * Math.exp(-(((wx + 270) / 45) ** 2)) + 6 * Math.exp(-(((wx + 330) / 30) ** 2)) + 5 * Math.exp(-(((wx + 560) / 60) ** 2)));
const ICICLES = [[0, 6], [1, 3], [2, 9], [3, 4], [-3, 5], [-7, 3], [-11, 7], [-16, 4], [-22, 6], [-29, 3]];
const SHORE = paint(SHORE_W, SHORE_H, (x, y) => {
  const wx = x + SHELF_L, wy = y + SHORE_Y0;
  const top = SHELF_Y - Math.round(mound(wx));
  if (wx >= 0) { // snow lip hangs over the cliff
    if (wx < 4 && wy >= SHELF_Y - 1 && wy < SHELF_Y + 3 - wx) return wy === SHELF_Y - 1 ? '#ffffff' : '#e6ebee';
  }
  for (const [ix, len] of ICICLES) if (wx === ix && wy >= SHELF_Y + 2 && wy < SHELF_Y + 2 + len) return wy === SHELF_Y + 1 + len ? '#ffffff' : '#d4dde3';
  if (wx >= 0 || wy < top) return null;
  const dTop = wy - top;
  if (dTop < 1) return '#ffffff';
  if (dTop < 4) return hash(wx, wy) > 0.93 ? '#ffffff' : '#eef1f3';
  if (dTop < 6) return dith(1 - (dTop - 4) / 2, wx, wy) ? '#e2e7ea' : '#cfd7dd';
  if (wy < SHELF_Y + 1 && wy >= SHELF_Y - 1) return '#e9edf0';
  // footprints from the igloo to the edge
  let col;
  if (wy < 0) {
    col = (Math.floor((wx * 0.6 + wy) / 8) + Math.floor(hash(Math.floor((wx * 0.6 + wy) / 8), 4) * 3)) % 4 === 0 ? '#bccad3' : '#c9d2d8';
    if (wx > -3) col = '#e4e9ec';
  } else {
    col = ramp(['#a9b5be', '#93a1ab', '#7e8c97', '#6a7883', '#59666f'], wy / 170, wx, wy);
    if (wx > -3) col = '#c3ced5';
    if (wy < 2) col = '#e2e8ec';
  }
  if (((Math.floor(wx * 0.37 + wy * 1.1)) % 29 === 0) && hash(wx >> 2, wy >> 2) > 0.55) col = wy < 0 ? '#a6b2bb' : '#7a8893';
  return col;
});
const IGLOO2 = (() => {
  const w = 50, h = 28;
  return paint(w, h + 1, (x, y) => {
    const dx = (x + 0.5 - w / 2) / (w / 2), dy = (h - y - 0.5) / h, r = dx * dx + dy * dy;
    if (r > 1) return null;
    if (r > 0.9) return '#8d9aa4';
    const ddx = (x + 0.5 - w / 2) / 7.5, ddy = (h - y - 0.5) / 12, door = ddx * ddx + ddy * ddy;
    if (door < 1) return door < 0.45 ? '#ffd08a' : door < 0.8 ? '#f0a85a' : '#b06a36';
    if (door < 1.35) return '#c9d2d9';
    const row = Math.floor(y / 5), mortar = y % 5 === 0 || (x + row * 4) % 9 === 0;
    if (mortar) return '#aab6bf';
    return dx > 0.25 ? '#f3f6f8' : dx > -0.3 ? '#e2e8ec' : '#cfd7dd';
  });
})();
const GLOW_WARM = paint(64, 64, (x, y) => { const d = Math.hypot(x - 31.5, y - 31.5) / 32; return d < 1 && dith(Math.pow(1 - d, 2) * 0.8, x, y) ? '#ffb85e' : null; });
const LANTERN_X = -112, SIGN_X = -18;

// icebergs: snow faces split by a ridge (sun on the right), translucent body below the water
for (const b of bergs) {
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0, inside = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) inside[y * bw + x] = pointInPoly(b.pts, b.x0 + x + 0.5, b.y0 + y + 0.5) ? 1 : 0;
  const I = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && inside[y * bw + x];
  const edgeDist = (x, y) => { for (let r = 1; r <= 5; r++) if (!I(x - r, y) || !I(x + r, y) || !I(x, y - r) || !I(x, y + r)) return r; return 6; };
  const peak = b.pts[0];
  b.img = paint(bw, bh, (x, y) => {
    if (!I(x, y)) return null;
    const wx = b.x0 + x, wy = b.y0 + y, e = edgeDist(x, y);
    if (wy < 0) {
      const ridge = peak[0] + (wy - peak[1]) * 0.18 + Math.sin(wy * 0.3) * 1.5, lit = wx > ridge;
      if (e === 1) return lit ? '#ffffff' : '#a9b4bd';
      if (Math.abs(wx - ridge) < 1) return '#ffffff';
      let col = lit ? (dith(clamp((wx - ridge) / 25, 0, 1), x, y) ? '#f3f6f8' : '#e3e9ed') : (dith(clamp((ridge - wx) / 30, 0, 1), x, y) ? '#bfc9d0' : '#cfd7dd');
      if (((wx + Math.floor(wy * 1.7)) % 13 === 0) && hash(wx >> 3, wy >> 3) > 0.5) col = lit ? '#d6dee3' : '#b0bbc3';
      return col;
    }
    if (wy < 2) return '#e8eef2';
    if (e === 1) return '#dbe4ea';
    if (e === 2) return '#bccbd4';
    let col = ramp(['#b2c1cb', '#9cadb9', '#8597a5', '#718493', '#617482', '#566876'], wy / (b.D + 10), x, y);
    if (e >= 5 && dith(0.5, x, y)) col = shade(col, -0.08);
    if (hash(wx >> 1, 77) > 0.86 && hash(wx, wy >> 2) > 0.3) col = shade(col, 0.1);
    return col;
  });
}
// prettier ice floes (same footprint as the physics: top -5, bottom +8)
function prettyFloe(w) {
  const b = new Pix(w + 2, 16);
  for (let Y = 0; Y < 13; Y++) for (let X = 0; X < w; X++) {
    const cut = Y > 8 ? Y - 8 : 0;
    if (X < cut || X >= w - cut) continue;
    if (Y === 0 && (X === 0 || X === w - 1)) continue;
    let col;
    if (Y === 0) col = '#ffffff';
    else if (Y < 3) col = hash(X, Y + w) > 0.9 ? '#ffffff' : '#eef1f4';
    else if (Y < 5) col = X > w * 0.65 ? '#bdc7cf' : '#d3dbe1';
    else col = ramp(['#a9b7c1', '#97a7b2', '#8596a2', '#788a96'], (Y - 5) / 8, X, Y);
    b.set(X + 1, Y + 1, col);
  }
  if (w > 24) for (let X = 3; X < w - 3; X += 7 + (X % 3)) b.set(X + 1, 0, '#ffffff'); // little snow bumps
  b.outline('#6b7b87');
  return b.canvas();
}
for (const f of floes) f.img = prettyFloe(f.w);
// where each iceberg meets the water, for foam
for (const b of bergs) {
  b.wl = [];
  let inside = false, start = 0;
  for (let x = b.x0; x <= b.x1 + 1; x++) {
    const i = pointInPoly(b.pts, x + 0.5, 0.5);
    if (i && !inside) start = x;
    if (!i && inside) b.wl.push([start, x]);
    inside = i;
  }
}
// seaweed colour ramps, computed once instead of per pixel per frame
for (const w of weeds) w.ramp = [-0.3, -0.18, -0.06, 0.06, 0.16, 0.26].map(k => shade(w.col, k));

// animated caustic light for the seabed: a network of bright lines, 8 frames, tiled
const CA_W = 160, CA_H = 12;
const CAUSTICS = Array.from({ length: 8 }, (_, f) => {
  const t = f / 8 * TAU;
  return paint(CA_W, CA_H, (x, y) => {
    const X = x * TAU / CA_W, Y = y / CA_H;
    const v = Math.abs(Math.sin(X * 3 + t) + Math.sin(X * 5 - Y * 3 + t * 2) * 0.7 + Math.sin(X * 7 + Y * 4 - t) * 0.5);
    return v < 0.22 && dith(1 - y / CA_H, x, y) ? '#e8f0f4' : null;
  });
});
// foreground kelp: dark, tall, closer than everything else - only in the kelp forests
const FG_KELP = []; { const r = mulberry32(606); for (let x = 1000; x < 9000; x += 140 + r() * 260) if (x < 3800 || (x > 6500 && x < 8800)) FG_KELP.push({ x, h: 60 + r() * 70, ph: r() * 6 }); }
function drawForeground() {
  ctx.fillStyle = '#121a17';
  for (const k of FG_KELP) {
    const x0 = Math.round((k.x - cam.x) * 1.3 + W / 2), base = sy(bed(k.x)) + 30; // moves faster than the world: it is closer
    if (x0 < -40 || x0 > W + 40 || base - k.h > H) continue;
    ctx.globalAlpha = 0.82;
    for (let i = 0; i < k.h; i++) {
      const sway = Math.sin(time * 1.1 + k.ph + i * 0.08) * (i / k.h) * 12;
      ctx.fillRect(Math.round(x0 + sway), base - i, 4, 1);
      if (i % 9 === 4) ctx.fillRect(Math.round(x0 + sway) + ((i / 9 | 0) % 2 ? 4 : -4), base - i, 4, 2);
    }
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- view
let OX = 0, OY = 0; // world -> screen offset (top-left of the view)
const sx = x => Math.round(x - OX), sy = y => Math.round(y - OY);
let farK = 0, caveDark = 0;
function setView(shx = 0, shy = 0) {
  OX = Math.round(cam.x - W / 2) + shx; OY = Math.round(cam.y - H / 2) + shy;
}
const tile = (img, x, y, period) => {
  let px = ((x % period) + period) % period - period;
  for (; px < W; px += period) ctx.drawImage(img, Math.round(px), Math.round(y));
};

// ---------------------------------------------------------------- background
function drawSky() {
  const wl = sy(0);
  ctx.fillStyle = farK > 0.5 ? '#1b1e23' : '#2b2f36'; ctx.fillRect(0, 0, W, Math.max(0, wl));
  const skyY = wl - SKY_H;
  ctx.drawImage(SKY_NEAR, 0, skyY);
  if (farK > 0.01) { ctx.globalAlpha = farK; ctx.drawImage(SKY_FAR, 0, skyY); ctx.globalAlpha = 1; }
  // pale sun behind the overcast, hidden as the storm gathers
  const sunY = Math.round(wl - 112 - (wl - 150) * 0.5);
  if (sunY > -72 && sunY < wl) { ctx.globalAlpha = 0.8 * (1 - farK * 0.85); ctx.drawImage(SUN, 300, sunY); ctx.globalAlpha = 1; }
  for (const L of CLOUDS) tile(L.img, -(OX * L.par + time * L.speed * (1 + farK)), wl - L.y - (wl - 150) * 0.25, CLOUD_W);
  for (const R of RANGES) tile(R.img, -OX * R.par, wl - R.HH + R.drop, MTN_W);
  ctx.drawImage(HAZE, 0, wl - 26);
  tile(HORIZON, -OX * 0.6, wl - 17, HORIZON_W);
}

function drawWater() {
  const wl = sy(0);
  if (wl >= H) return;
  ctx.drawImage(WATER, 0, wl);
  if (wl + WATER_H < H) { ctx.fillStyle = '#171b1f'; ctx.fillRect(0, wl + WATER_H, W, H - wl - WATER_H); }
  // light shafts from the surface, swaying
  ctx.globalAlpha = (0.16 + 0.05 * Math.sin(time * 0.7)) * (1 - farK * 0.6);
  for (let k = 0; k < 3; k++) {
    const x = ((k * 260 - OX * 0.55 + Math.sin(time * 0.4 + k) * 14) % 780 + 780) % 780 - 220;
    ctx.drawImage(RAYS, Math.round(x), wl);
  }
  ctx.globalAlpha = 1;
  // distant underwater ridges for depth
  ctx.fillStyle = '#3d474f'; ctx.globalAlpha = 0.45;
  for (let x = 0; x < W; x += 2) {
    const wx = x + OX * 0.55;
    const top = sy(bed(x + OX) * 0.72 + 8 - 18 * Math.sin(wx * 0.011) - 9 * Math.sin(wx * 0.037 + 2));
    if (top < H) ctx.fillRect(x, Math.max(wl + 2, top), 2, H - Math.max(wl + 2, top));
  }
  ctx.globalAlpha = 1;
  // marine snow drifting in the water column
  ctx.fillStyle = '#c3cbd1';
  for (const [x0, y0, z, ph] of MSNOW) {
    const x = Math.floor(((x0 - OX * z + Math.sin(time * 0.5 + ph) * 4) % W + W) % W);
    const y = Math.floor(((y0 - OY * z + time * 3 * z) % H + H) % H);
    if (y <= wl + 3) continue;
    ctx.globalAlpha = 0.25 + z * 0.35; ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
}

function drawSeabed() {
  const cf = CAUSTICS[Math.floor(time * 6) % CAUSTICS.length];
  for (let x = 0; x < W; x++) {
    const wx = x + OX; if (wx < 0) continue;
    const bw = bed(wx), by = sy(bw); if (by >= H) continue;
    const h = Math.min(GT_H, H - by);
    ctx.drawImage(GROUND, ((wx % GT_W) + GT_W) % GT_W, 0, 1, h, x, by, 1, h);
    if (by + GT_H < H) { ctx.fillStyle = '#272a2e'; ctx.fillRect(x, by + GT_H, 1, H - by - GT_H); }
    if (bw < 260) { ctx.globalAlpha = 0.4 * (1 - bw / 260) * (1 - farK * 0.7); ctx.drawImage(cf, ((wx % CA_W) + CA_W) % CA_W, 0, 1, CA_H, x, by - 1, 1, CA_H); ctx.globalAlpha = 1; }
  }
  for (const c of caves) {
    const x = sx(c.x0); if (x > W || x + c.img.width < 0) continue;
    ctx.drawImage(c.img, x, sy(c.y0));
  }
  for (const d of decor) {
    const x = sx(d.x); if (x < -12 || x > W + 12) continue;
    const y = sy(bed(d.x)); if (y > H + 5 || y < -10) continue;
    if (d.type === 'rock') {
      const w = 6 + Math.floor(d.s * 9);
      ctx.fillStyle = '#4d535a'; ctx.fillRect(x, y - 3, w, 4); ctx.fillRect(x + 1, y - 5, w - 2, 2);
      ctx.fillStyle = '#6c737a'; ctx.fillRect(x + 1, y - 5, Math.ceil(w / 2), 1); ctx.fillRect(x, y - 3, 1, 1);
      ctx.fillStyle = '#3a3f45'; ctx.fillRect(x + w - 2, y - 2, 2, 2);
    } else if (d.type === 'star') { ctx.fillStyle = d.col; ctx.fillRect(x + 2, y - 5, 1, 2); ctx.fillRect(x, y - 3, 5, 1); ctx.fillRect(x + 1, y - 2, 3, 1); ctx.fillRect(x + 1, y - 1, 1, 1); ctx.fillRect(x + 3, y - 1, 1, 1); ctx.fillStyle = shade(d.col, 0.3); ctx.fillRect(x + 2, y - 3, 1, 1); }
    else if (d.type === 'shell') { ctx.fillStyle = '#e8cfd6'; ctx.fillRect(x, y - 2, 4, 2); ctx.fillRect(x + 1, y - 3, 2, 1); ctx.fillStyle = '#c4a0ab'; ctx.fillRect(x + 1, y - 2, 1, 2); }
    else if (d.type === 'urchin') { ctx.fillStyle = '#6a4a8a'; ctx.fillRect(x, y - 3, 5, 3); ctx.fillRect(x + 1, y - 4, 3, 1); ctx.fillStyle = '#9b80b8'; ctx.fillRect(x - 1, y - 4, 1, 1); ctx.fillRect(x + 5, y - 4, 1, 1); ctx.fillRect(x + 2, y - 6, 1, 1); ctx.fillRect(x + 1, y - 3, 1, 1); }
    else { const sw = Math.round(Math.sin(time * 2 + d.x) * 1); ctx.fillStyle = d.col; ctx.fillRect(x, y - 3, 4, 3); ctx.fillRect(x - 1 + sw, y - 5, 1, 2); ctx.fillRect(x + 1 + sw, y - 6, 1, 3); ctx.fillRect(x + 3 + sw, y - 5, 1, 2); ctx.fillStyle = shade(d.col, 0.35); ctx.fillRect(x + 1 + sw, y - 6, 1, 1); }
  }
  for (const w of weeds) {
    const x0 = sx(w.x); if (x0 < -30 || x0 > W + 30) continue;
    const base = sy(bed(w.x)); if (base - w.h > H || base < -5) continue;
    for (let i = 0; i < w.h; i++) {
      const k = i / w.h;
      const sway = Math.sin(time * 1.4 + w.ph + i * 0.11) * k * Math.min(9, w.h * 0.16);
      const px = Math.round(x0 + sway), py = base - i;
      if (py < -2 || py > H) continue;
      ctx.fillStyle = w.ramp[Math.min(5, Math.floor(k * 5 + (i % 4 < 2 ? 0.5 : 0)))];
      ctx.fillRect(px, py, 2, 1);
      if (w.leaf && i % 5 === 2 && i > 3) { ctx.fillStyle = w.ramp[Math.min(5, Math.floor(k * 5) + 1)]; ctx.fillRect(px + ((i / 5 | 0) % 2 ? 2 : -2), py, 2, 1); }
      if (w.bulbs && i % 9 === 8) { ctx.fillStyle = '#b9c98a'; ctx.fillRect(px + 2, py, 2, 2); ctx.fillStyle = '#dbe6b4'; ctx.fillRect(px + 2, py, 1, 1); }
    }
  }
}

// ---------------------------------------------------------------- the shore and the colony
let colonyCheer = 0;
function drawShore() {
  const x0 = sx(SHELF_L);
  if (x0 > W || sx(8) < 0) return;
  ctx.drawImage(SHORE, x0, sy(SHORE_Y0));
  const top = sy(SHELF_Y);
  // igloo with warm light spilling from the door
  const ix = sx(IGLOO_X) - 25;
  ctx.drawImage(IGLOO2, ix, top - 28);
  const flick = 0.3 + 0.06 * Math.sin(time * 9) + 0.04 * Math.sin(time * 23);
  ctx.globalAlpha = flick; ctx.drawImage(GLOW_WARM, ix + 25 - 32, top - 40); ctx.globalAlpha = 1;
  // lantern post
  const lx = sx(LANTERN_X);
  ctx.fillStyle = '#4a3a2e'; ctx.fillRect(lx, top - 24, 2, 24); ctx.fillRect(lx - 3, top - 24, 6, 1);
  ctx.fillStyle = '#2a2420'; ctx.fillRect(lx - 3, top - 22, 1, 5); ctx.fillRect(lx + 4, top - 22, 1, 5); ctx.fillRect(lx - 3, top - 23, 8, 1); ctx.fillRect(lx - 3, top - 17, 8, 1);
  ctx.fillStyle = '#ffd890'; ctx.fillRect(lx - 2, top - 22, 6, 5); ctx.fillStyle = '#fff2c9'; ctx.fillRect(lx, top - 21, 2, 3);
  ctx.globalAlpha = flick * 1.2; ctx.drawImage(GLOW_WARM, lx - 31, top - 52); ctx.globalAlpha = flick * 0.5;
  ctx.fillStyle = '#ffcf8a'; ctx.fillRect(lx - 14, top, 30, 1); ctx.fillRect(lx - 8, top + 1, 18, 1);
  ctx.globalAlpha = 1;
  // signpost
  const gx = sx(SIGN_X);
  ctx.fillStyle = '#4a3a2e'; ctx.fillRect(gx + 9, top - 10, 2, 10);
  ctx.fillStyle = '#2a2420'; ctx.fillRect(gx - 1, top - 19, 22, 10);
  ctx.fillStyle = '#7a5d44'; ctx.fillRect(gx, top - 18, 20, 8);
  ctx.fillStyle = '#8f6f53'; ctx.fillRect(gx, top - 18, 20, 1);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(gx - 1, top - 20, 22, 1);
  drawText('HOME', gx + 10, top - 16, '#f3e6d4', 1, 'center', null);
  // the pile on its wooden crate
  const px = sx(PILE_X);
  ctx.fillStyle = '#2a2420'; ctx.fillRect(px - 18, top - 6, 36, 6);
  ctx.fillStyle = '#7a5d44'; ctx.fillRect(px - 17, top - 5, 34, 5);
  ctx.fillStyle = '#5e4633'; ctx.fillRect(px - 17, top - 3, 34, 1); ctx.fillRect(px - 9, top - 5, 1, 5); ctx.fillRect(px + 8, top - 5, 1, 5);
  ctx.fillStyle = '#ffffff'; ctx.fillRect(px - 17, top - 6, 34, 1);
  drawPile(px, top - 5);
  // the colony: three friends waiting at home who cheer when food arrives
  for (let i = 0; i < 3; i++) {
    const cxw = [-162, -140, -86][i], sk = (skinIdx + 2 + i * 2) % SKINS.length;
    const ph = time * (1 + i * 0.13) + i * 2;
    const hopY = colonyCheer > 0 ? -Math.round(Math.abs(Math.sin(colonyCheer * 11 + i)) * 4) : 0;
    const st = colonyCheer > 0 ? 'cheer' : Math.sin(ph * 0.7) > 0.95 ? 'flap' : 'stand';
    drawPenguinAt(sk, sx(cxw), top - 7 + hopY, st, 0, Math.sin(ph * 0.21 + i) > -0.6 ? 1 : -1, ph);
  }
  if (mode === 'play' && P && P.carry) drawText('V', px, top - 40 - Math.round(Math.abs(Math.sin(time * 4)) * 4), '#ffd23f', 1, 'center');
}

function drawPile(px, ground) {
  const list = pileFish ? pileFish.slice(-70) : [];
  let i = 0;
  for (let row = 0; i < list.length; row++) {
    const n = Math.max(1, 6 - row);
    for (let c = 0; c < n && i < list.length; c++, i++) {
      const img = fishImg(list[i], 1);
      const x = px - Math.floor(n * 5) + c * 10 + Math.floor(hash(i, 1) * 3) + 5;
      const y = ground - 3 - row * 4;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y));
      if (hash(i, 2) > 0.5) ctx.scale(-1, 1);
      ctx.rotate((hash(i, 3) - 0.5) * 0.5);
      ctx.drawImage(img, -Math.floor(img.width / 2), -Math.floor(img.height / 2)); ctx.restore();
    }
  }
}

// ---------------------------------------------------------------- sprites
function drawSprite(img, x, y, ang, flipY, ax, ay, squash = 1) {
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(ang);
  ctx.scale(1, (flipY ? -1 : 1) * squash);
  ctx.drawImage(img, -ax, -ay);
  ctx.restore();
}
// state: swim | air | stand | walk | flap | cheer | front ; roll: 0..1 through a dash barrel roll;
// sc: pixel scale; flip: {vis, t} - the body rolls over (t 0..1) when the penguin turns round
function drawPenguinAt(skin, x, y, state, ang, face, anim, alpha = 1, roll = 0, sc = 1, flip = null) {
  let spr = PENGUIN_SPR[skin];
  if (Array.isArray(spr)) spr = spr[Math.floor(time * 5) % spr.length];
  ctx.globalAlpha = alpha * (SKINS[skin].ghost ? 0.7 : 1);
  if (state === 'swim' || state === 'air') {
    // a full wing stroke while swimming; in the air the flippers hold out and give the odd flap
    const fr = state === 'swim' ? Math.floor(anim * 7) % FLAP_N : [1, 1, 1, 2, 1, 0][Math.floor(anim * 6) % 6];
    // facing left = the body rolled half a turn; turning round and the dash roll play the roll frames
    let R = flip ? (flip.vis > 0 ? 0 : Math.PI) + Math.PI * Math.max(0, flip.t) : (Math.cos(ang) < 0 ? Math.PI : 0);
    R += roll * TAU;
    const ri = ((Math.round(R / (TAU / ROLL_N)) % ROLL_N) + ROLL_N) % ROLL_N;
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang); ctx.scale(sc, sc);
    ctx.drawImage(spr.roll[ri][fr], -ROLL_AX, -ROLL_AY);
    ctx.restore();
  } else if (state === 'front') {
    ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(sc, sc);
    ctx.drawImage(spr.front, -(PAD + 6), -(PAD + 7));
    ctx.restore();
  } else {
    const moving = state === 'walk';
    const fr = moving ? Math.floor(anim * 6) % 2 : (state === 'flap' || state === 'cheer') ? (Math.floor(anim * 8) % 2 ? 2 : 0) : 0;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y + (moving && fr ? -sc : 0)));
    ctx.scale(face < 0 ? -sc : sc, sc);
    ctx.drawImage(spr.stand[fr], -(PAD + 6), -(PAD + 7));
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// the catch, held crosswise in the beak. Drawn BEFORE the penguin, so the head and beak overlap it
// and the fish sticks out above and below the beak, clamped (swimming, flying and standing)
function drawHeldFish(c, x, y, state, ang, face, flipVis, sc = 1) {
  const img = fishImg(c, Math.floor(time * 6) % 4);
  let bx, by, fa;
  if (state === 'swim' || state === 'air') {
    const ca = Math.cos(ang), sa = Math.sin(ang), bel = flipVis > 0 ? 1 : -1;
    const tip = BEAK_TIP - 1.5; // grip just behind the tip
    bx = x + (ca * tip - sa * 0.7 * bel) * sc; by = y + (sa * tip + ca * 0.7 * bel) * sc;
    fa = ang + bel * Math.PI / 2 + Math.sin(time * 9) * 0.12; // hangs across the beak, wriggling
  } else {
    bx = x + face * 5.5 * sc; by = y - 3.5 * sc;
    fa = Math.PI / 2 + face * 0.25 + Math.sin(time * 9) * 0.12;
  }
  ctx.save(); ctx.translate(Math.round(bx), Math.round(by)); ctx.rotate(fa); ctx.scale(sc, sc);
  ctx.drawImage(img, -Math.floor(img.width * 0.42), -Math.floor(img.height / 2));
  ctx.restore();
}

function drawPlayer() {
  if (!P || P.state === 'dead') return;
  if (P.inv > 0 && Math.floor(P.inv * 10) % 2 === 0) return;
  const onIce = P.state === 'land' || P.state === 'floe';
  const st = onIce ? (P.turnT > 0 ? 'front' : Math.abs(mouseWorld().x - P.x) > 3 ? 'walk' : 'stand') : P.state;
  const roll = P.dashT > 0 ? 1 - P.dashT / DASH_T : 0, flip = { vis: P.flipVis, t: P.flipT };
  groundShadow(P.x, P.y, 14);
  if (P.dashT > 0) for (let i = 2; i < P.trail.length; i += 2) { const t = P.trail[i]; drawPenguinAt(skinIdx, t.x - OX, t.y - OY, P.state, t.a, P.face, P.anim, 0.25 * (1 - i / 8), roll, 1, flip); }
  if (P.carry) drawHeldFish(P.carry, P.x - OX, P.y - OY, onIce ? 'stand' : P.state, P.angle, P.face, P.flipVis);
  drawPenguinAt(skinIdx, P.x - OX, P.y - OY, st, P.angle, P.face, P.anim, 1, roll, 1, flip);
  if (P.state === 'swim' && P.dashCD > 0) {
    const k = 1 - P.dashCD / diff.dashCD, n = Math.floor(k * 12);
    ctx.fillStyle = '#bfe3ff';
    for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + i / 12 * TAU; ctx.fillRect(Math.round(P.x - OX + Math.cos(a) * 13), Math.round(P.y - OY + Math.sin(a) * 13), 1, 1); }
  }
}

function drawIce() {
  const wl = sy(0);
  for (const b of bergs) {
    const x = sx(b.x0); if (x > W || x + b.img.width < 0) continue;
    ctx.drawImage(b.img, x, sy(b.y0));
    for (const [a, c] of b.wl) for (const ex of [a, c]) foam(sx(ex), wl, ex === a ? -1 : 1);
  }
  for (const f of floes) {
    const x = sx(f.x - f.w / 2) - 1; if (x > W || x < -80) continue;
    ctx.drawImage(f.img, x, sy(floeTop(f, time)) - 1 + Math.round(Math.sin(time * 40) * (f.shake || 0) * 1.5));
    foam(x, wl, -1); foam(x + f.w + 2, wl, 1);
  }
}
function foam(x, wl, dir) {
  ctx.fillStyle = '#eef2f4';
  for (let k = 0; k < 4; k++) {
    if (Math.sin(time * 5 + x * 0.7 + k * 1.9) < 0.1) continue;
    ctx.fillRect(x + dir * (k * 2 + 1) - (dir < 0 ? 1 : 0), wl - 1 + (k % 2), k < 2 ? 2 : 1, 1);
  }
}

function drawCreatures() {
  for (let m = 250; m * 10 < WORLD_END; m += 250) { // distance buoys
    const x = sx(m * 10); if (x < -20 || x > W + 20) continue;
    const y = sy(0) + Math.round(Math.sin(time * 2 + m) * 1);
    ctx.fillStyle = OUTLINE; ctx.fillRect(x - 3, y - 9, 7, 12); ctx.fillRect(x, y - 12, 1, 3);
    ctx.fillStyle = '#c4504a'; ctx.fillRect(x - 2, y - 8, 5, 4); ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillStyle = '#e8e8e8'; ctx.fillRect(x - 2, y - 4, 5, 3);
    ctx.fillStyle = '#e07a70'; ctx.fillRect(x - 2, y - 8, 1, 4);
    if (Math.floor(time * 2 + m) % 2) { ctx.fillStyle = '#ffd890'; ctx.fillRect(x, y - 13, 1, 1); ctx.globalAlpha = 0.3; ctx.fillRect(x - 1, y - 14, 3, 3); ctx.globalAlpha = 1; }
    drawText(m + 'M', x, y - 21, '#e8e8e8', 1, 'center');
  }
  for (const r of rings) { // bubble rings: an upright loop of bubbles that shimmers
    const x = sx(r.x), y = sy(r.y); if (x < -20 || x > W + 20 || y < -20 || y > H + 20) continue;
    ctx.globalAlpha = 0.12; ctx.fillStyle = '#9ff6ff'; ctx.fillRect(x - 5, y - 11, 11, 23); ctx.globalAlpha = 1;
    for (let k = 0; k < 18; k++) {
      const a = k / 18 * TAU + r.t * 1.5, bx = x + Math.cos(a) * 4 * Math.cos(r.ang) - Math.sin(a) * 10 * Math.sin(r.ang), by = y + Math.cos(a) * 4 * Math.sin(r.ang) + Math.sin(a) * 10 * Math.cos(r.ang);
      ctx.fillStyle = k % 3 ? '#dff4ff' : '#ffffff'; ctx.fillRect(Math.round(bx), Math.round(by), k % 4 ? 1 : 2, k % 4 ? 1 : 2);
    }
  }
  for (const f of fishes) {
    const x = sx(f.x), y = sy(f.y); if (x < -24 || x > W + 24 || y < -20 || y > H + 20) continue;
    groundShadow(f.x, f.y, fishLen(f));
    const img = fishImg(f, Math.floor(f.t * 8) % 4), T = FISH[f.type];
    if (T.glow && Math.sin(f.t * 3) > -0.3) { ctx.globalAlpha = 0.16; ctx.fillStyle = T.glow; ctx.fillRect(x - 7, y - 4, 14, 8); ctx.fillRect(x - 5, y - 6, 10, 12); ctx.globalAlpha = 1; }
    drawSprite(img, x, y, f.ang, Math.cos(f.ang) < 0, img.width / 2, img.height / 2);
    if ((f.shiny || f.type === 'golden') && Math.sin(f.t * 5) > 0.6) { ctx.fillStyle = '#fff6b0'; ctx.fillRect(x + Math.round(Math.sin(f.t * 3) * 7), y - 5, 1, 1); ctx.fillRect(x - Math.round(Math.cos(f.t * 4) * 6), y + 4, 1, 1); }
  }
  for (const e of enemies) {
    const S = ENEMY[e.kind], x = sx(e.x), y = sy(e.y);
    if (x < -140 || x > W + 140 || y < -100 || y > H + 100) continue;
    if (x > 0 && x < W && y > 0 && y < H && !STATS.seen[e.kind]) { STATS.seen[e.kind] = 1; saveStats(); addText(e.x, e.y - 22, 'NEW CREATURE: ' + ENEMY[e.kind].name, '#c9a2ff', 2); }
    if (CREATURES[e.kind]) { CREATURES[e.kind].draw(e, x, y); continue; }
    if (e.kind === 'squid') { drawGiantSquid(e, x, y); continue; }
    if (e.kind === 'crab') { drawCrab(e, x, y); continue; }
    groundShadow(e.x, e.y, S.len);
    const set = (e.lungeT > 0 || e.chompT > 0.3) ? ENEMY_SPR[e.kind].open : ENEMY_SPR[e.kind].shut;
    const img = set[Math.floor(e.t * (e.spd / 18 + 3)) % set.length];
    drawSprite(img, x, y, e.ang, Math.cos(e.ang) < 0, img.width / 2, S.cy + 3);
  }
}
// a soft shadow on the seabed under anything swimming close to it
function groundShadow(wx, wy, len) {
  const by = bed(wx), h = by - wy;
  if (h < 0 || h > 70) return;
  const c = caveAt(wx); if (c && wy > by) return;
  const k = 1 - h / 70, w = Math.max(2, Math.round(len * (0.9 - h / 140))), x = sx(wx), y = sy(by);
  ctx.fillStyle = '#0c0e11';
  ctx.globalAlpha = 0.35 * k; ctx.fillRect(x - (w >> 1), y, w, 1);
  ctx.globalAlpha = 0.2 * k; ctx.fillRect(x - (w >> 2), y + 1, w >> 1, 1); ctx.fillRect(x - (w >> 1) - 1, y, 1, 1); ctx.fillRect(x + (w >> 1), y, 1, 1);
  ctx.globalAlpha = 1;
}
function thickLine(x0, y0, x1, y1, w, col) {
  ctx.fillStyle = col;
  const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0))), o = w / 2;
  for (let i = 0; i <= n; i++) { const t = i / n; ctx.fillRect(Math.round(x0 + (x1 - x0) * t - o), Math.round(y0 + (y1 - y0) * t - o), w, w); }
}
// ---- giant crab: shaded carapace sprite, legs and claws drawn live so they can walk and snap
const CRAB_BODY = (() => {
  const w = 50, h = 28, b = new Pix(w, h), cx = 25, cy = 16;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - cx) / 19, dy = (y + 0.5 - cy) / (y + 0.5 < cy ? 9 : 6);
    if (dx * dx + dy * dy > 1) continue;
    let col = '#9a4b3f';
    if (hash(x >> 1, y >> 1) > 0.82 && dy < 0.5) col = '#7a3428';
    if (dy > 0.55) col = '#b86a52';
    b.set(x, y, col);
  }
  for (let x = 9; x < 41; x += 3) b.set(x, cy - Math.round(9 * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / 19) ** 2))) - 1, '#9a4b3f'); // spiny rim
  for (const ex of [19, 30]) { // eye stalks
    for (let y = 3; y < 8; y++) b.set(ex, y, '#8a4438');
    b.set(ex, 2, '#0b0b14'); b.set(ex + 1, 2, '#0b0b14'); b.set(ex, 1, '#0b0b14'); b.set(ex + 1, 1, '#ffffff');
  }
  for (let x = 21; x < 29; x++) b.set(x, cy + 4, '#5e2a22');
  b.volume(VOL_KEEP, 1.1);
  b.outline(OUTLINE);
  return b.canvas();
})();
function drawCrab(e, x, y) {
  const fy = y + 10;
  for (const side of [-1, 1]) for (let i = 0; i < 3; i++) { // legs
    const ph = e.walk * 1.4 + i * 2.1 + (side > 0 ? 1 : 0), lift = Math.max(0, Math.sin(ph)) * 3;
    const rx = x + side * (6 + i * 5), ry = y + 3, kx = rx + side * 9, ky = ry - 5 - lift, fx = rx + side * (15 + i * 2) + Math.cos(ph) * 2;
    thickLine(rx, ry, kx, ky, 2, '#7a3a30'); thickLine(kx, ky, fx, fy - lift * 0.5, 1, '#8a4438');
  }
  ctx.drawImage(CRAB_BODY, Math.round(x - 25), Math.round(y - 16));
  for (const cl of e.claws) { // arms + pincers
    const ox = x + cl.side * 15, oy = y - 4, cx = sx(cl.x), cy = sy(cl.y);
    const ex2 = (ox + cx) / 2 + cl.side * 3, ey2 = (oy + cy) / 2 - 6;
    thickLine(ox, oy, ex2, ey2, 3, '#7a3a30'); thickLine(ex2, ey2, cx, cy, 3, '#8a4438');
    ctx.fillStyle = '#6e2a22'; ctx.fillRect(cx - 4, cy - 3, 8, 7);
    ctx.fillStyle = '#a8584a'; ctx.fillRect(cx - 3, cy - 3, 7, 5);
    ctx.fillStyle = '#c87a62'; ctx.fillRect(cx - 2, cy - 3, 4, 1);
    const a = cl.aim, op = cl.open * 0.75 + 0.08;
    for (const s of [-1, 1]) {
      const ja = a + s * op, jx = cx + Math.cos(ja) * 10, jy = cy + Math.sin(ja) * 10;
      thickLine(cx + Math.cos(a) * 3, cy + Math.sin(a) * 3, jx, jy, 2, s < 0 ? '#c06a58' : '#a8584a');
      ctx.fillStyle = '#ead6c8'; ctx.fillRect(Math.round(jx), Math.round(jy), 1, 1);
    }
    if (cl.st === 'raise' && Math.floor(time * 12) % 2) { ctx.fillStyle = '#ff6f7e'; ctx.globalAlpha = 0.5; ctx.fillRect(cx - 5, cy - 4, 10, 9); ctx.globalAlpha = 1; }
  }
}
// ---- giant squid: eight writhing arms, two feeding tentacles that coil, then lash out
function drawGiantSquid(e, x, y) {
  const S = ENEMY.squid, ca = Math.cos(e.ang), sa = Math.sin(e.ang);
  const hx = x + ca * S.len * 0.42, hy = y + sa * S.len * 0.42, wind = e.atk === 'wind';
  for (let k = 0; k < 8; k++) {
    const len = (wind ? 18 : 26) + (k % 3) * 4, spread = (k - 3.5) * (wind ? 0.22 : 0.12);
    let px = hx, py = hy;
    for (let i = 0; i < len; i++) {
      const a = e.ang + spread + Math.sin(e.t * 6 + i * 0.3 + k * 1.7) * 0.55 * (i / len);
      px += Math.cos(a); py += Math.sin(a);
      ctx.fillStyle = i < len * 0.35 ? '#7a3e4a' : i < len * 0.7 ? '#8c4c58' : '#a8606c';
      const s = i < len * 0.3 ? 3 : i < len * 0.7 ? 2 : 1;
      ctx.fillRect(Math.round(px - s / 2), Math.round(py - s / 2), s, s);
    }
  }
  if (e.ext > 0 && e.tipX !== undefined) { // the lash
    const tx = sx(e.tipX), ty = sy(e.tipY), nx = -(ty - hy), ny = tx - hx, nl = Math.hypot(nx, ny) || 1;
    for (const s of [-1, 1]) {
      const ox = nx / nl * 3 * s, oy = ny / nl * 3 * s;
      thickLine(hx + ox, hy + oy, tx + ox * 0.3, ty + oy * 0.3, 2, '#a8606c');
      ctx.fillStyle = '#c97a86'; ctx.fillRect(Math.round(tx + ox * 0.3) - 2, Math.round(ty + oy * 0.3) - 2, 5, 5);
      ctx.fillStyle = '#e8b0b8'; ctx.fillRect(Math.round(tx + ox * 0.3) - 1, Math.round(ty + oy * 0.3) - 2, 2, 1);
    }
  } else { // feeding tentacles coiled (wind-up) or trailing
    for (const s of [-1, 1]) {
      let px = hx, py = hy; const len = wind ? 16 : 34;
      for (let i = 0; i < len; i++) {
        const a = e.ang + s * (wind ? 0.9 + i * 0.12 : 0.1) + Math.sin(e.t * 4 + i * 0.25) * 0.3 * (i / len);
        px += Math.cos(a); py += Math.sin(a);
        ctx.fillStyle = '#a8606c'; ctx.fillRect(Math.round(px), Math.round(py), 2, 2);
      }
      ctx.fillStyle = wind && Math.floor(time * 14) % 2 ? '#ff6f7e' : '#c97a86'; ctx.fillRect(Math.round(px) - 2, Math.round(py) - 2, 5, 5);
    }
  }
  const img = ENEMY_SPR.squid.shut[Math.floor(e.t * 5) % 8];
  drawSprite(img, x, y, e.ang, Math.cos(e.ang) < 0, img.width / 2, S.cy + 3);
  if (wind) { // the eye flares before a strike
    const exw = x + ca * S.len * 0.36 - sa * -4 * (Math.cos(e.ang) < 0 ? -1 : 1), eyw = y + sa * S.len * 0.36 + ca * -4 * (Math.cos(e.ang) < 0 ? -1 : 1);
    ctx.globalAlpha = 0.6; ctx.fillStyle = '#ff6f7e'; ctx.fillRect(Math.round(exw) - 3, Math.round(eyw) - 3, 6, 6); ctx.globalAlpha = 1;
  }
}
// stand-ins so menus can show a guard without a live game
function fakeGuard(kind) {
  if (kind === 'squid') return { kind, ang: 0, t: time, atk: Math.sin(time) > 0.6 ? 'wind' : 'idle', ext: 0 };
  return { kind, t: time, walk: time * 4, claws: [-1, 1].map(side => ({ side, st: 'rest', aim: side > 0 ? -0.7 : -Math.PI + 0.7, open: 0.4 + 0.3 * Math.sin(time * 3 + side), x: 0, y: 0 })) };
}
function drawGuardAt(kind, x, y, sc = 1) {
  const e = fakeGuard(kind);
  ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc);
  const ox = OX, oy = OY; OX = 0; OY = 0;
  if (kind === 'squid') drawGiantSquid(e, 0, 0);
  else { for (const cl of e.claws) { const r = 22; cl.x = cl.side * 15 + Math.cos(cl.aim) * r; cl.y = -4 + Math.sin(cl.aim) * r; } drawCrab(e, 0, 0); }
  OX = ox; OY = oy; ctx.restore();
}
function drawParticles() {
  const wl = sy(0);
  for (const p of parts) {
    const x = sx(p.x), y = sy(p.y);
    if (x < -20 || x > W + 20 || y < -4 || y > H + 4) continue;
    ctx.fillStyle = p.col;
    if (p.kind === 'ring') { // a shark's call spreading through the water
      const k = 1 - p.life / p.max, r = 6 + k * 60;
      ctx.globalAlpha = (1 - k) * 0.7;
      for (let i = 0; i < 40; i++) { const a = i / 40 * TAU; ctx.fillRect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1); }
      continue;
    }
    if (p.kind === 'ripple') { // two crests running apart on the surface
      const k = 1 - p.life / p.max, r = Math.round(3 + k * 16);
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.fillRect(x - r - 2, wl, 3, 1); ctx.fillRect(x + r, wl, 3, 1);
      ctx.globalAlpha = (1 - k) * 0.5; ctx.fillRect(x - Math.round(r * 0.6), wl + 1, 2, 1); ctx.fillRect(x + Math.round(r * 0.6), wl + 1, 2, 1);
      continue;
    }
    ctx.globalAlpha = p.kind === 'bubble' ? 0.75 : clamp(p.life / p.max * 1.5, 0, 1);
    if (p.kind === 'bubble') { if (p.life > p.max * 0.5) { ctx.fillRect(x, y, 2, 2); ctx.globalAlpha = 0.9; ctx.fillStyle = '#ffffff'; ctx.fillRect(x, y, 1, 1); } else ctx.fillRect(x, y, 1, 1); }
    else if (p.kind === 'spark') { ctx.fillRect(x, y, 1, 1); if (p.life > p.max * 0.5) { ctx.fillRect(x - 1, y, 3, 1); ctx.fillRect(x, y - 1, 1, 3); } }
    else if (p.kind === 'feather') { ctx.fillRect(x, y, 2, 1); }
    else ctx.fillRect(x, y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawSurfaceAndFog() {
  const wl = sy(0);
  if (wl < H) {
    // deeper = darker, and the far sea is gloomier
    ctx.globalAlpha = 1 - caveDark * 0.55; // in a cavern the darkness mask takes over from depth fog
    ctx.drawImage(DEPTH_FOG, 0, 0, 1, 520, 0, wl, W, 520);
    if (wl + 520 < H) { ctx.fillStyle = 'rgba(10,12,15,0.6)'; ctx.fillRect(0, wl + 520, W, H - wl - 520); }
    ctx.globalAlpha = 1;
    if (farK > 0.01) { ctx.fillStyle = 'rgba(14,17,21,' + (farK * 0.22).toFixed(3) + ')'; ctx.fillRect(0, Math.max(0, wl), W, H - Math.max(0, wl)); }
    // the surface: crest, trough, and a glittering reflection band
    const t4 = Math.floor(time * 4);
    for (let x = 0; x < W; x++) {
      const wx = x + OX;
      const off = Math.round(Math.sin(wx * 0.06 + time * 2.2) * 0.8 + Math.sin(wx * 0.021 - time * 1.3) * 0.7 * (1 + farK));
      ctx.fillStyle = '#e4e9ec'; ctx.fillRect(x, wl + off - 1, 1, 1);
      ctx.fillStyle = '#a3afb7'; ctx.fillRect(x, wl + off, 1, 1);
      for (let r = 1; r < 4; r++) if (hash((wx >> 1) + r * 31, t4 + r) > 0.72 + r * 0.06) { ctx.fillStyle = r === 1 ? '#b8c2c9' : '#97a3ac'; ctx.fillRect(x, wl + off + r, 2, 1); }
      if (hash(Math.floor(wx / 3), Math.floor(time * 3)) > 0.95) { ctx.fillStyle = '#ffffff'; ctx.fillRect(x, wl + off - 1, 2, 1); }
    }
  }
  // inside a cavern it gets dark: only a pool of light around the penguin
  caveDark = lerp(caveDark, mode === 'play' && P && P.cave ? 1 : 0, 0.06);
  if (caveDark > 0.02 && P) drawDarkness(0.78 * caveDark);
  drawCrystals();
  if (caveDark > 0.02) drawGuardsLit(caveDark);
  for (const e of enemies) { const C = CREATURES[e.kind]; if (C && C.glow) { const x = sx(e.x), y = sy(e.y); if (x > -30 && x < W + 30 && y > -30 && y < H + 30) C.glow(e, x, y); } }
}

// cavern darkness: a dark layer with soft holes cut out for the penguin's light and each guarded room's glow
const DARK = makeCanvas(W, H), dg = DARK.getContext('2d');
function drawDarkness(a) {
  dg.globalCompositeOperation = 'source-over'; dg.clearRect(0, 0, W, H);
  dg.fillStyle = 'rgba(5,6,10,' + a.toFixed(3) + ')'; dg.fillRect(0, 0, W, H);
  dg.globalCompositeOperation = 'destination-out';
  const hole = (wx, wy, r0, r1, k) => {
    const x = wx - OX, y = wy - OY; if (x < -r1 || x > W + r1 || y < -r1 || y > H + r1) return;
    const g = dg.createRadialGradient(x, y, r0, x, y, r1);
    g.addColorStop(0, 'rgba(0,0,0,' + k + ')'); g.addColorStop(1, 'rgba(0,0,0,0)');
    dg.fillStyle = g; dg.fillRect(x - r1, y - r1, r1 * 2, r1 * 2);
  };
  hole(P.x, P.y, 60, 200, 1);
  for (const c of caves) for (const r of c.rooms) if (r.guard || r.treasure) hole(r.x, r.y, r.r * 0.5, r.r * 1.9, 0.8);
  ctx.drawImage(DARK, 0, 0);
  for (const c of caves) for (const r of c.rooms) { // a faint cold glow in the treasure rooms
    if (!r.treasure) continue;
    const x = r.x - OX, y = r.y - OY; if (x < -r.r || x > W + r.r || y < -r.r || y > H + r.r) continue;
    const g = ctx.createRadialGradient(x, y, 4, x, y, r.r * 1.2);
    g.addColorStop(0, 'rgba(150,235,255,0.10)'); g.addColorStop(1, 'rgba(150,235,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r.r * 1.2, y - r.r * 1.2, r.r * 2.4, r.r * 2.4);
  }
}
// guards must always be readable: redraw them over the darkness
function drawGuardsLit(k) {
  ctx.globalAlpha = 0.75 * k;
  for (const e of enemies) {
    if (!e.guard) continue;
    const x = sx(e.x), y = sy(e.y); if (x < -140 || x > W + 140 || y < -100 || y > H + 100) continue;
    if (e.kind === 'squid') drawGiantSquid(e, x, y); else drawCrab(e, x, y);
  }
  ctx.globalAlpha = 1;
}
// cavern crystals are light sources: drawn after the darkness so they glow through it
function drawCrystals() {
  for (const c of caves) {
    if (sx(c.x1) < 0 || sx(c.x0) > W) continue;
    for (let i = 0; i < c.crystals.length; i++) {
      const [cx, cy, col] = c.crystals[i], px = sx(cx), py = sy(cy);
      if (px < -4 || px > W + 4 || py < -4 || py > H + 4) continue;
      const a = 0.22 + 0.16 * Math.sin(time * 2 + i * 1.7);
      ctx.fillStyle = col;
      ctx.globalAlpha = a; ctx.fillRect(px - 1, py - 1, 3, 3);
      if (i % 3 === 0) { ctx.globalAlpha = a * 0.6; ctx.fillRect(px - 3, py, 7, 1); ctx.fillRect(px, py - 3, 1, 7); }
      ctx.globalAlpha = 0.9; ctx.fillRect(px, py, 1, 1);
    }
  }
  ctx.globalAlpha = 1;
}

function drawSnow() {
  const wl = sy(0), n = Math.floor(70 + farK * 80), wind = 8 + farK * 46;
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < n; i++) {
    const [x0, y0, z, ph] = SNOWF[i];
    const x = Math.floor(((x0 + Math.sin(time * 0.8 + ph) * 6 - OX * z * 0.6 + time * wind * z) % W + W) % W);
    const y = Math.floor(((y0 + time * (12 + farK * 18) * z - OY * z * 0.6) % H + H) % H);
    if (y >= wl) continue;
    ctx.globalAlpha = 0.35 + z * 0.5;
    ctx.fillRect(x, y, z > 0.95 ? 2 : 1, z > 1.1 ? 2 : 1);
  }
  ctx.globalAlpha = 1;
}

function drawTexts() { for (const t of texts) drawText(t.s, sx(t.x), sy(t.y), t.col, 1, 'center'); }

// the whole world, back to front. extra(): hook for scenes to draw between the
// creatures and the water's surface (the home screen's leaping fish and hero).
function drawWorld(withPlayer, extra) {
  drawSky();
  drawWater();
  drawSeabed();
  drawShore();
  drawIce();
  drawCreatures();
  if (withPlayer) drawPlayer();
  if (extra) extra();
  drawForeground();
  drawSurfaceAndFog();
  drawParticles();
  drawSnow();
  drawTexts();
  ctx.drawImage(VIGNETTE, 0, 0);
}

// ---------------------------------------------------------------- HUD
function frameBox(x, y, w, h, fill = 'rgba(16,19,24,0.8)', edge = '#8f99a2') {
  ctx.fillStyle = fill; ctx.fillRect(x + 1, y, w - 2, h); ctx.fillRect(x, y + 1, 1, h - 2); ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = edge;
  ctx.fillRect(x + 1, y, w - 2, 1); ctx.fillRect(x + 1, y + h - 1, w - 2, 1); ctx.fillRect(x, y + 1, 1, h - 2); ctx.fillRect(x + w - 1, y + 1, 1, h - 2);
  ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
}
function drawHUD() {
  // lives + dash
  frameBox(4, 4, 62, 24);
  const hearts = Math.max(3, diff.lives);
  for (let i = 0; i < hearts; i++) ctx.drawImage(i < lives ? HEART : HEART_EMPTY, 8 + i * (hearts > 3 ? 8 : 10), 7);
  drawText('DASH', 8, 19, '#c9d6df', 1, 'left', null);
  ctx.fillStyle = '#0b0e12'; ctx.fillRect(25, 19, 37, 5);
  const dk = 1 - P.dashCD / diff.dashCD;
  ctx.fillStyle = dk >= 1 ? '#7be0b8' : '#5d7d96'; ctx.fillRect(26, 20, Math.round(35 * dk), 3);
  if (dk >= 1) { ctx.fillStyle = '#c8ffe9'; ctx.fillRect(26, 20, 35, 1); }
  // the beak: what you're carrying
  frameBox(68, 4, 24, 24, 'rgba(16,19,24,0.8)', P.carry ? '#ffd23f' : '#8f99a2');
  if (P.carry) {
    const img = fishImg(P.carry, Math.floor(time * 6) % 4);
    ctx.drawImage(img, 80 - Math.floor(img.width / 2), 14 - Math.floor(img.height / 2));
    const lf = loadFrac();
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(71, 23, 18, 3);
    ctx.fillStyle = lf > 0.75 ? '#ff8a6e' : lf > 0.45 ? '#ffd23f' : '#7be0b8'; ctx.fillRect(72, 24, Math.max(1, Math.round(16 * lf)), 1);
    drawText('+' + fishVal(P.carry) + '  ' + fishKg(P.carry) + 'KG', 68, 31, '#ffd23f', 1, 'left');
  } else { ctx.fillStyle = '#4b545c'; ctx.fillRect(77, 15, 6, 1); drawText('MAX ' + carryLimit() + 'KG', 68, 31, '#8f99a2', 1, 'left'); }
  // the pile
  frameBox(W / 2 - 38, 4, 76, 20);
  ctx.drawImage(FISH_SPR.herring[1][Math.floor(time * 4) % 4], W / 2 - 34, 8);
  drawBig(pile, W / 2 + 14, 8, '#ffd23f', 1, 'center');
  if (streak > 1 && streakT > 0) {
    drawText('STREAK X' + (1 + Math.min(streak - 1, 4) * 0.25), W / 2, 27, '#ff9a6e', 1, 'center');
    ctx.fillStyle = '#0b0e12'; ctx.fillRect(W / 2 - 20, 34, 40, 3);
    ctx.fillStyle = '#ff9a6e'; ctx.fillRect(W / 2 - 19, 35, Math.round(38 * streakT / STREAK_TIME), 1);
  } else drawText(pileFish.length + ' FISH HOME', W / 2, 27, '#c9d6df', 1, 'center');
  if (P.stun > 0) drawBig('STUNNED', P.x - OX, P.y - OY - 22, Math.floor(time * 8) % 2 ? '#e6dcff' : '#b48cff', 1, 'center');
  else if (P.boost > 0) drawText('BOOST', P.x - OX, P.y - OY - 18, '#9ff6ff', 1, 'center');
  // distance + zone
  frameBox(W - 78, 4, 74, 20);
  drawBig(Math.max(0, Math.round(P.x / 10)) + 'M', W - 8, 8, '#ffffff', 1, 'right');
  drawText('OUT', W - 74, 11, '#8f99a2', 1, 'left', null);
  drawText(zoneName(P.x), W - 5, 27, P.cave ? '#c9a2ff' : P.x > 11000 ? '#ff9a9a' : '#bfe3ff', 1, 'right');
  // journey bar along the bottom
  const bx0 = 44, bx1 = W - 44, by = H - 7, X = wx => Math.round(bx0 + clamp(wx / WORLD_END, 0, 1) * (bx1 - bx0));
  ctx.fillStyle = 'rgba(11,14,18,0.75)'; ctx.fillRect(bx0 - 3, by - 3, bx1 - bx0 + 6, 7);
  ctx.fillStyle = '#4b545c'; ctx.fillRect(bx0, by, bx1 - bx0, 1);
  ctx.fillStyle = '#8f99a2'; ctx.fillRect(bx0, by, X(Math.max(deepest, 0)) - bx0, 1);
  for (let m = 250; m * 10 < WORLD_END; m += 250) { ctx.fillStyle = '#6c757d'; ctx.fillRect(X(m * 10), by - 1, 1, 3); }
  for (const c of caves) { ctx.fillStyle = '#b48cff'; ctx.fillRect(X(c.x0) - 1, by - 1, 3, 3); }
  if (STATS.bestDist > 0) { ctx.fillStyle = '#ffd23f'; ctx.fillRect(X(STATS.bestDist), by - 2, 1, 5); }
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(bx0 - 2, by - 2, 3, 3); ctx.fillStyle = '#c4504a'; ctx.fillRect(bx0 - 2, by - 2, 3, 1);
  const pxm = X(P.x);
  ctx.fillStyle = OUTLINE; ctx.fillRect(pxm - 2, by - 3, 5, 6);
  ctx.fillStyle = SKINS[skinIdx].back; ctx.fillRect(pxm - 1, by - 2, 3, 4);
  ctx.fillStyle = P.carry && Math.floor(time * 4) % 2 ? '#ffd23f' : SKINS[skinIdx].belly; ctx.fillRect(pxm, by - 1, 2, 2);
  drawText('0M', bx0 - 6, by - 2, '#8f99a2', 1, 'right', null);
  drawText((WORLD_END / 10) + 'M', bx1 + 6, by - 2, '#8f99a2', 1, 'left', null);
  // home arrow when the shore is off-screen
  if (sx(0) < -10) {
    const y = clamp(sy(-20), 36, H - 30);
    const c = P.carry && Math.floor(time * 4) % 2 ? '#ffd23f' : '#ffffff';
    ctx.fillStyle = OUTLINE; ctx.fillRect(3, y - 4, 6, 9);
    ctx.fillStyle = c;
    for (let i = 0; i < 4; i++) ctx.fillRect(4 + i, y - i, 1, i * 2 + 1);
    drawText('HOME', 10, y - 2, c);
  }
  // threat markers for chasers off-screen
  for (const e of enemies) {
    if (e.state !== 'chase' && e.state !== 'lunge' && e.state !== 'alerted' && e.st !== 'aim' && e.st !== 'charge' && e.st !== 'swoop' && e.st !== 'sprint') continue;
    const x = sx(e.x), y = sy(e.y);
    if (x >= 0 && x < W && y >= 0 && y < H) continue;
    if (Math.floor(time * 6) % 2) drawBig('!', clamp(x, 6, W - 10), clamp(y, 34, H - 22), '#ff5a6e', 1, 'center');
  }
  // tips
  let tip = '';
  if (P.carry && P.state !== 'land') tip = Math.floor(time * 2) % 2 ? 'BRING IT HOME!' : '';
  else if (P.state === 'land' && P.carry) tip = 'WADDLE TO THE PILE!';
  else if (P.state === 'land' && playT < 12) tip = 'MOVE THE MOUSE TO WADDLE - CLICK TO HOP IN';
  else if (P.state === 'floe') tip = 'SAFE ON THE ICE - CLICK TO HOP';
  else if (playT < 20 && P.state === 'swim') tip = 'SWIM TO THE MOUSE - CLICK OR SPACE TO DASH';
  if (tip) drawText(tip, W / 2, H - 19, P.carry ? '#ffd23f' : '#ffffff', 1, 'center');
}
