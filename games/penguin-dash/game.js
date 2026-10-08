'use strict';
// PENGUIN DASH - pixel-art arctic side-scroller.
// The whole game draws into a 400x225 canvas that CSS scales up with nearest-neighbour,
// so every sprite, polygon and HUD glyph lands on the low-res pixel grid.

const W = 400, H = 225;
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
cv.width = W; cv.height = H;
ctx.imageSmoothingEnabled = false;

function fit() {
  let s = Math.min(innerWidth / W, innerHeight / H);
  if (s >= 2) s = Math.floor(s);
  cv.style.width = W * s + 'px';
  cv.style.height = H * s + 'px';
}
addEventListener('resize', fit); fit();

// ---------------------------------------------------------------- utils
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function hash(x, y) { let h = (x * 374761393 + y * 668265263) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
function angDiff(a, b) { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; }
function makeCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  if (k < 0) { r *= 1 + k; g *= 1 + k; b *= 1 + k; } else { r += (255 - r) * k; g += (255 - g) * k; b += (255 - b) * k; }
  return '#' + ((1 << 24) | (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b)).toString(16).slice(1);
}

const SELOUT = new Map();
function selOut(col) {
  let v = SELOUT.get(col);
  if (!v) {
    const a = parseInt(shade(col, -0.72).slice(1), 16), b = 0x0b1020, k = 0.45;
    const ch = s => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
    v = '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
    SELOUT.set(col, v);
  }
  return v;
}
// Pixel buffer used to build every sprite once at load.
class Pix {
  constructor(w, h) { this.w = w; this.h = h; this.d = new Array(w * h).fill(null); }
  set(x, y, c) { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.d[y * this.w + x] = c; }
  get(x, y) { x = Math.floor(x); y = Math.floor(y); return (x >= 0 && y >= 0 && x < this.w && y < this.h) ? this.d[y * this.w + x] : null; }
  tri(ax, ay, bx, by, cx, cy, c) {
    const x0 = Math.floor(Math.min(ax, bx, cx)), x1 = Math.ceil(Math.max(ax, bx, cx));
    const y0 = Math.floor(Math.min(ay, by, cy)), y1 = Math.ceil(Math.max(ay, by, cy));
    const s = (px, py, qx, qy, rx, ry) => (px - rx) * (qy - ry) - (qx - rx) * (py - ry);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const px = x + 0.5, py = y + 0.5;
      const d1 = s(px, py, ax, ay, bx, by), d2 = s(px, py, bx, by, cx, cy), d3 = s(px, py, cx, cy, ax, ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (!(neg && pos)) this.set(x, y, c);
    }
  }
  // c = a colour, or 'auto' for a selective outline: a dark version of whatever it borders,
  // pulled toward navy. Softer and more finished than one flat outline colour.
  outline(c) {
    const o = this.d.slice();
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.d[y * this.w + x]) continue;
      const n = this.get(x, y + 1) || this.get(x - 1, y) || this.get(x + 1, y) || this.get(x, y - 1);
      if (n) o[y * this.w + x] = c === 'auto' ? selOut(n) : c;
    }
    this.d = o;
  }
  // Light from above: brighten the top of every column, darken the bottom, then add a 1px
  // darker "thickness" under lower edges. Flat pixel sprites read as rounded 3D bodies.
  volume(keep = VOL_KEEP, strength = 1) {
    const w = this.w, h = this.h, d = this.d, o = d.slice();
    for (let x = 0; x < w; x++) {
      let top = -1, bot = -1;
      for (let y = 0; y < h; y++) if (d[y * w + x]) { if (top < 0) top = y; bot = y; }
      if (top < 0 || bot - top < 2) continue;
      for (let y = top; y <= bot; y++) {
        const c = d[y * w + x]; if (!c || keep.has(c)) continue;
        const t = (y - top) / (bot - top);
        const k = (t < 0.16 ? 0.3 : t < 0.34 ? 0.1 : t > 0.84 ? -0.32 : t > 0.66 ? -0.14 : 0) * strength;
        if (k) o[y * w + x] = shade(c, k);
      }
    }
    for (let y = h - 2; y >= 0; y--) for (let x = 0; x < w; x++) {
      const c = d[y * w + x];
      if (c && !d[(y + 1) * w + x] && !keep.has(c)) o[(y + 1) * w + x] = shade(c, -0.5);
    }
    this.d = o;
  }
  canvas() {
    const c = makeCanvas(this.w, this.h), g = c.getContext('2d');
    const img = g.createImageData(this.w, this.h), px = img.data;
    for (let i = 0; i < this.d.length; i++) {
      const col = this.d[i];
      if (!col) continue;
      const n = parseInt(col.slice(1), 16);
      px[i * 4] = n >> 16; px[i * 4 + 1] = (n >> 8) & 255; px[i * 4 + 2] = n & 255; px[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return c;
  }
}

const VOL_KEEP = new Set(['#ffffff', '#0b0b14', '#0a0d14', '#0b0d14', '#f2e6a0', '#7a1426', '#e8384f', '#ffd040', '#ffd23f']);

// ---------------------------------------------------------------- 3x5 pixel font
const FONT = {
  A: '111101111101101', B: '110101110101110', C: '111100100100111', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '111100101101111', H: '101101111101101', I: '111010010010111', J: '001001001101111',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '111101101101111',
  P: '111101111100100', Q: '111101101111001', R: '110101110101101', S: '111100111001111', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111',
  '4': '101101111001001', '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
  '9': '111101111001111', '.': '000000000000010', ',': '000000000010100', '!': '010010010000010', '?': '111001011000010',
  ':': '000010000010000', '-': '000000111000000', '+': '000010111010000', '/': '001001010100100', '<': '001010100010001',
  '>': '100010001010100', "'": '010010000000000', '(': '010100100100010', ')': '010001001001010', '=': '000111000111000',
  '*': '000101010101000', ' ': '000000000000000',
};
function textWidth(s, sc = 1) { return s.length * 4 * sc - sc; }
function drawText(s, x, y, col = '#fff', sc = 1, align = 'left', sh = '#0b1020') {
  s = String(s).toUpperCase();
  if (align === 'center') x -= Math.floor(textWidth(s, sc) / 2);
  else if (align === 'right') x -= textWidth(s, sc);
  x = Math.round(x); y = Math.round(y);
  for (const pass of sh ? [0, 1] : [1]) {
    ctx.fillStyle = pass ? col : sh;
    const o = pass ? 0 : sc;
    for (let i = 0; i < s.length; i++) {
      const g = FONT[s[i]] || FONT['?'];
      for (let p = 0; p < 15; p++) if (g[p] === '1') ctx.fillRect(x + i * 4 * sc + (p % 3) * sc + o, y + Math.floor(p / 3) * sc + o, sc, sc);
    }
  }
}

// ---------------------------------------------------------------- penguin skins
const OUTLINE = '#0b1020';
const SKINS = [
  { name: 'EMPEROR', back: '#1d2335', belly: '#f6f2e8', beak: '#f2a03a', feet: '#3a3f52', cheek: '#ffc94a' },
  { name: 'ADELIE', back: '#151a28', belly: '#ffffff', beak: '#2b2f3d', feet: '#ffb3a6', cheek: '#ff9fb5', acc: 'scarf' },
  { name: 'ROCKHOPPER', back: '#262b38', belly: '#f7f4ee', beak: '#e2483a', feet: '#ff9f8a', cheek: '#ff9fb5', acc: 'crest' },
  { name: 'GENTOO', back: '#2a2f3f', belly: '#fbf8f2', beak: '#ff6a2b', feet: '#ff8a3b', cheek: '#ffa9b9', acc: 'brow' },
  { name: 'LITTLE BLUE', back: '#4f7fc0', belly: '#eef5ff', beak: '#2f3442', feet: '#f2c3c9', cheek: '#ffb3c7' },
  { name: 'BUBBLEGUM', back: '#ff7db4', belly: '#fff2f8', beak: '#ffb340', feet: '#ff9f40', cheek: '#ff4f8f', acc: 'bow', accCol: '#9b6bff' },
  { name: 'SANTA', back: '#1d2335', belly: '#f6f2e8', beak: '#f2a03a', feet: '#f2a03a', cheek: '#ff9fb5', acc: 'hat' },
  { name: 'GOLDIE', back: '#d99a22', belly: '#fff6d6', beak: '#ff7a2b', feet: '#ff7a2b', cheek: '#ffcf6a', acc: 'crown' },
  { name: 'MINTY', back: '#2fae8f', belly: '#f2fff9', beak: '#ffb340', feet: '#ff9f40', cheek: '#ff9fb5', acc: 'bow', accCol: '#ffe14a' },
  // unlockable (see SKIN_GOALS in menus.js)
  { name: 'KING', back: '#1b2130', belly: '#fbf7ee', beak: '#2b2f3d', feet: '#30343f', cheek: '#ff9a2b', mark: 'king' },
  { name: 'MACARONI', back: '#202533', belly: '#f7f3ea', beak: '#d0603a', feet: '#ff9f8a', cheek: '#ff9fb5', acc: 'macaroni' },
  { name: 'CHINSTRAP', back: '#2a2f3c', belly: '#ffffff', beak: '#2b2f3d', feet: '#ffb3a6', cheek: '#ffffff', mark: 'chin' },
  { name: 'MAGELLANIC', back: '#1f2430', belly: '#f8f6f0', beak: '#3a3f4a', feet: '#3a3f52', cheek: '#ffb3c7', mark: 'magellanic' },
  { name: 'AFRICAN', back: '#262a33', belly: '#f6f2ea', beak: '#2b2f3d', feet: '#3a3f52', cheek: '#ff8fa8', mark: 'african' },
  { name: 'ROYAL', back: '#232835', belly: '#ffffff', beak: '#e88a50', feet: '#ffb3a6', cheek: '#ffffff', mark: 'royal' },
  { name: 'YELLOW-EYED', back: '#4a5568', belly: '#f6f4ec', beak: '#d8c8b0', feet: '#ffb3a6', cheek: '#ffd23f', mark: 'yelloweye' },
  { name: 'NINJA', back: '#121419', belly: '#3d424c', beak: '#5a5f6a', feet: '#2a2e36', cheek: '#3d424c', acc: 'ninja' },
  { name: 'PIRATE', back: '#1d2335', belly: '#f6f2e8', beak: '#f2a03a', feet: '#f2a03a', cheek: '#ff9fb5', acc: 'pirate' },
  { name: 'VIKING', back: '#2a2f3f', belly: '#fbf8f2', beak: '#f2a03a', feet: '#ff8a3b', cheek: '#ffa9b9', acc: 'viking' },
  { name: 'GENTLEMAN', back: '#1d2335', belly: '#f6f2e8', beak: '#f2a03a', feet: '#3a3f52', cheek: '#ff9fb5', acc: 'tophat' },
  { name: 'GHOST', back: '#aeb9c4', belly: '#f2f6f9', beak: '#c9d3dc', feet: '#c9d3dc', cheek: '#dfe7ee', ghost: true },
  { name: 'RAINBOW', back: '#ff5a7a', belly: '#ffffff', beak: '#ffd23f', feet: '#ffb340', cheek: '#ff9fb5', rainbow: true },
];
const RAINBOW_HUES = ['#ff5a7a', '#ff9a3a', '#ffd23f', '#5fd38a', '#4fa8ff', '#a77bff'];
// body markings, as pixel overrides for the standing / front sprites and a rule for the 3D swimmer
const MARKS = {
  stand: {
    king: [[6, 3, 'O'], [6, 4, 'O'], [5, 4, 'O'], [6, 5, 'O'], [7, 5, 'O'], [8, 5, 'O'], [7, 6, 'O'], [8, 6, 'O']],
    chin: [[6, 2, 'W'], [5, 3, 'W'], [6, 3, 'W'], [7, 3, 'W'], [5, 4, 'W'], [6, 4, 'W'], [7, 4, 'K'], [8, 4, 'K'], [9, 4, 'K'], [4, 4, 'K']],
    magellanic: [[6, 1, 'W'], [7, 1, 'W'], [5, 2, 'W'], [5, 3, 'W'], [5, 4, 'W'], [5, 5, 'W'], [5, 7, 'K'], [6, 7, 'K'], [7, 7, 'K'], [8, 7, 'K'], [9, 7, 'K']],
    african: [[5, 6, 'K'], [6, 6, 'K'], [7, 6, 'K'], [8, 6, 'K'], [9, 6, 'K'], [7, 9, 'K'], [8, 10, 'K'], [6, 11, 'K']],
    royal: [[6, 2, 'W'], [5, 3, 'W'], [6, 3, 'W'], [5, 4, 'W'], [6, 4, 'W'], [8, 1, 'O'], [7, 0, 'O'], [6, 0, 'O'], [5, -1, 'O']],
    yelloweye: [[6, 1, 'Y'], [5, 2, 'Y'], [4, 2, 'Y'], [6, 2, 'Y'], [7, 2, 'Y'], [9, 2, 'Y']],
  },
  front: {
    king: [[2, 3, 'O'], [9, 3, 'O'], [4, 5, 'O'], [5, 5, 'O'], [6, 5, 'O'], [7, 5, 'O']],
    chin: [[3, 2, 'W'], [8, 2, 'W'], [3, 4, 'K'], [4, 4, 'K'], [5, 4, 'K'], [6, 4, 'K'], [7, 4, 'K'], [8, 4, 'K']],
    magellanic: [[3, 1, 'W'], [8, 1, 'W'], [2, 2, 'W'], [9, 2, 'W'], [3, 7, 'K'], [4, 7, 'K'], [5, 7, 'K'], [6, 7, 'K'], [7, 7, 'K'], [8, 7, 'K']],
    african: [[3, 6, 'K'], [4, 6, 'K'], [5, 6, 'K'], [6, 6, 'K'], [7, 6, 'K'], [8, 6, 'K'], [5, 9, 'K'], [7, 10, 'K']],
    royal: [[2, 2, 'W'], [9, 2, 'W'], [3, 1, 'O'], [8, 1, 'O'], [2, 0, 'O'], [9, 0, 'O']],
    yelloweye: [[3, 1, 'Y'], [4, 1, 'Y'], [7, 1, 'Y'], [8, 1, 'Y'], [3, 2, 'Y'], [8, 2, 'Y']],
  },
  // (u along the body, m = angle around it from the back) -> palette key or null
  roll: {
    king: (u, m) => (u > 0.76 && u < 0.84 && Math.abs(Math.abs(Math.sin(m)) - 1) < 0.08) || (u > 0.62 && u < 0.76 && Math.cos(m) < -0.35) ? 'O' : null,
    chin: (u, m) => u > 0.74 && Math.cos(m) < 0.3 ? (u < 0.84 && Math.abs(Math.cos(m) + 0.6) < 0.13 ? 'K' : 'W') : null,
    magellanic: (u, m) => u > 0.7 && u < 0.74 && Math.cos(m) > -0.4 ? 'W' : u > 0.58 && u < 0.62 && Math.cos(m) < -0.1 ? 'K' : null,
    african: (u, m) => (u > 0.6 && u < 0.64 && Math.cos(m) < -0.1) || (u < 0.58 && u > 0.2 && Math.cos(m) < -0.3 && hash(Math.round(u * 40), Math.round(m * 6 + 40)) > 0.82) ? 'K' : null,
    royal: (u, m) => u > 0.74 && Math.cos(m) < 0.35 ? 'W' : null,
    yelloweye: (u, m) => u > 0.8 && u < 0.9 && Math.abs(Math.sin(m)) > 0.75 && Math.cos(m) > -0.25 ? 'Y' : null,
  },
};

const STAND_ROWS = [
  '....KKKK......',
  '...KKKKKK.....',
  '...KKKKEeK....',
  '...KKKKCWWBBBq',
  '...KKKKWWWBb..',
  '..KKKKWWWW....',
  '..KKKWWWWW....',
  '.KKKKWWWWW....',
  '.KKKKWWWWW....',
  '.KKKKWWWWW....',
  '..KKKWWWWW....',
  '..KKKWWWW.....',
  '...KKWWW......',
  '...FF.FF......',
];
const FRONT_ROWS = [
  '....KKKK....',
  '...KKKKKK...',
  '..KWeWWeWK..',
  '..KCWBBWCK..',
  '..KKWWWWKK..',
  '.KKWWWWWWKK.',
  'KKKWWWWWWKKK',
  'KK.WWWWWW.KK',
  'K..WWWWWW..K',
  '..KWWWWWWK..',
  '..KWWWWWWK..',
  '..KKWWWWKK..',
  '...KWWWWK...',
  '...FF..FF...',
];
const span = (y, x0, x1, ch) => { const a = []; for (let x = x0; x <= x1; x++) a.push([x, y, ch]); return a; };
const ACC = {
  stand: {
    macaroni: [[8, 1, 'O'], [7, 0, 'O'], [6, 0, 'O'], [5, -1, 'O'], [4, -1, 'O'], [3, -1, 'O'], [2, 0, 'O'], [1, 0, 'O'], [1, 1, 'O']],
    ninja: [...span(1, 3, 8, 'R'), [2, 1, 'R'], [1, 2, 'R'], [0, 2, 'R'], [1, 3, 'R']],
    pirate: [...span(0, 4, 7, 'R'), ...span(1, 3, 8, 'R'), [5, 1, 'w'], [7, 0, 'w'], [2, 1, 'R'], [1, 2, 'R'], [6, 2, 'e'], [7, 2, 'e'], [8, 2, 'e']],
    viking: [...span(-1, 3, 8, 'M'), ...span(0, 4, 7, 'M'), [5, -2, 'M'], [6, -2, 'M'], [2, -1, 'H'], [1, -2, 'H'], [1, -3, 'H'], [9, -1, 'H'], [10, -2, 'H'], [10, -3, 'H']],
    tophat: [...span(-1, 2, 9, 'k'), ...span(-2, 4, 7, 'R'), ...span(-3, 4, 7, 'k'), ...span(-4, 4, 7, 'k'), ...span(-5, 4, 7, 'k'), ...span(-6, 4, 7, 'k')],
    crest: [[8, 1, 'Y'], [9, 1, 'Y'], [7, 0, 'Y'], [6, -1, 'Y'], [8, -1, 'Y'], [5, -1, 'Y']],
    brow: [[6, 1, 'W'], [7, 1, 'W'], [8, 1, 'W']],
    hat: [...span(-1, 3, 8, 'w'), ...span(-2, 4, 7, 'R'), ...span(-3, 3, 5, 'R'), ...span(-4, 2, 3, 'R'), [0, -5, 'w'], [1, -5, 'w'], [0, -4, 'w'], [1, -4, 'w']],
    bow: [[4, -1, 'P'], [5, -1, 'P'], [6, -1, 'p'], [7, -1, 'P'], [8, -1, 'P'], [4, -2, 'P'], [5, -2, 'P'], [7, -2, 'P'], [8, -2, 'P']],
    crown: [...span(-1, 4, 7, 'G'), [4, -2, 'G'], [4, -3, 'G'], [7, -2, 'G'], [7, -3, 'G'], [5, -2, 'G'], [6, -2, 'G'], [5, -1, 'r'], [6, -1, 'r']],
    scarf: [...span(5, 2, 9, 'R'), [2, 6, 'R'], [1, 6, 'R'], [1, 7, 'R'], [0, 8, 'R']],
  },
  front: {
    macaroni: [[3, 1, 'O'], [2, 0, 'O'], [1, 0, 'O'], [0, 1, 'O'], [8, 1, 'O'], [9, 0, 'O'], [10, 0, 'O'], [11, 1, 'O']],
    ninja: [...span(1, 2, 9, 'R'), [10, 2, 'R'], [11, 3, 'R'], [11, 4, 'R']],
    pirate: [...span(0, 4, 7, 'R'), ...span(1, 3, 8, 'R'), [5, 1, 'w'], [7, 0, 'w'], [3, 2, 'e'], [4, 2, 'e'], [5, 2, 'e'], [10, 1, 'R'], [11, 2, 'R']],
    viking: [...span(-1, 2, 9, 'M'), ...span(-2, 4, 7, 'M'), [5, -3, 'M'], [6, -3, 'M'], [1, -1, 'H'], [0, -2, 'H'], [0, -3, 'H'], [10, -1, 'H'], [11, -2, 'H'], [11, -3, 'H']],
    tophat: [...span(-1, 2, 9, 'k'), ...span(-2, 4, 7, 'R'), ...span(-3, 4, 7, 'k'), ...span(-4, 4, 7, 'k'), ...span(-5, 4, 7, 'k'), ...span(-6, 4, 7, 'k')],
    crest: [[3, 1, 'Y'], [2, 0, 'Y'], [1, -1, 'Y'], [8, 1, 'Y'], [9, 0, 'Y'], [10, -1, 'Y']],
    brow: [[3, 2, 'W'], [8, 2, 'W']],
    hat: [...span(-1, 3, 8, 'w'), ...span(-2, 4, 7, 'R'), ...span(-3, 5, 7, 'R'), ...span(-4, 7, 8, 'R'), [9, -5, 'w'], [10, -5, 'w'], [9, -4, 'w'], [10, -4, 'w']],
    bow: [[3, -1, 'P'], [4, -1, 'P'], [5, -1, 'p'], [6, -1, 'p'], [7, -1, 'P'], [8, -1, 'P'], [3, -2, 'P'], [8, -2, 'P']],
    crown: [...span(-1, 4, 7, 'G'), [4, -2, 'G'], [4, -3, 'G'], [7, -2, 'G'], [7, -3, 'G'], [5, -2, 'G'], [6, -2, 'G'], [5, -1, 'r'], [6, -1, 'r']],
    scarf: [...span(5, 1, 10, 'R'), [9, 6, 'R'], [9, 7, 'R'], [10, 8, 'R']],
  },
};
const PAD = 6;
// ---- the swimming penguin as a tiny 3D body: a round-sectioned torpedo, 16px long.
// Each frame is the body rolled by angle th around its own length (0 = belly down, side on),
// so turning round and the dash barrel roll play through real frames, not a squashed sprite.
const ROLL_N = 12, FLAP_N = 6, PL = 18, BEAK_L = 5;
// a plump body (widest a little behind the middle), a short neck, a round head
const penguinRadius = u => {
  const body = 3.9 * Math.sqrt(Math.max(0, 1 - ((u - 0.42) / 0.45) ** 2));
  const head = 3.0 * Math.sqrt(Math.max(0, 1 - ((u - 0.85) / 0.16) ** 2));
  return Math.max(body, head, u >= 0 && u < 0.12 ? 1.1 : 0);
};
// where a sprite's body centre sits in its canvas, and how far ahead of it the beak tip is
const ROLL_AX = PAD + 3 + PL / 2, ROLL_AY = PAD + 5, BEAK_TIP = PL / 2 + BEAK_L - 0.5;
const ROLL_ACC = { // accessories as points on the body: [u along body, angle around it (0 = back), height off the skin, colour]
  crest: [1, -1].flatMap(s => [0, 1, 2, 3, 4].map(k => [0.84 - k * 0.04, s * (Math.PI / 2 - 0.6), k * 0.45, 'Y'])),
  brow: [1, -1].flatMap(s => [0.84, 0.87, 0.9].map(u => [u, s * (Math.PI / 2 - 0.85), 0, 'W'])),
  scarf: [...Array.from({ length: 22 }, (_, i) => [0.715 + (i % 2) * 0.03, i / 22 * Math.PI * 2, 0.15, 'R']), ...[0, 1, 2, 3].map(k => [0.67 - k * 0.05, 0.15, 0.6 + k * 0.35, 'R'])],
  hat: [
    ...[0.79, 0.83, 0.87, 0.91, 0.95].flatMap(u => [-0.75, -0.4, 0, 0.4, 0.75].map(m => [u, m, 0.5 + (1 - Math.abs(m) / 0.8) * 1.1 * (1 - (u - 0.79) / 0.3), 'R'])),
    ...[-0.9, -0.45, 0, 0.45, 0.9].map(m => [0.77, m, 0.45, 'w']),
    [0.72, 0, 1.6, 'R'], [0.67, 0, 2.2, 'R'], [0.62, 0, 2.8, 'w'], [0.59, 0, 2.8, 'w'], [0.62, 0, 3.4, 'w'],
  ],
  bow: [[0.86, 0.5, 1.1, 'P'], [0.86, 0.5, 1.8, 'P'], [0.86, -0.5, 1.1, 'P'], [0.86, -0.5, 1.8, 'P'], [0.86, 0, 0.9, 'p']],
  crown: [...[0.8, 0.84, 0.88, 0.92].flatMap(u => [-0.5, 0, 0.5].map(m => [u, m, 0.6, 'G'])), [0.8, 0, 1.7, 'G'], [0.86, 0, 1.7, 'G'], [0.92, 0, 1.7, 'G'], [0.86, 0, 0.7, 'r']],
  macaroni: [1, -1].flatMap(s => [0, 1, 2, 3, 4, 5, 6].map(k => [0.87 - k * 0.035, s * (Math.PI / 2 - 0.75 + k * 0.05), k * 0.42, 'O'])),
  ninja: [...Array.from({ length: 20 }, (_, i) => [0.8 + (i % 2) * 0.03, i / 20 * Math.PI * 2, 0.15, 'R']), [0.74, 0.1, 0.9, 'R'], [0.68, 0.2, 1.5, 'R'], [0.62, 0.3, 2.1, 'R'], [0.56, 0.35, 2.6, 'R']],
  pirate: [...[0.8, 0.84, 0.88, 0.92, 0.95].flatMap((u, j) => [-0.9, -0.45, 0, 0.45, 0.9].map((m, i) => [u, m, 0.3, (i + j) % 4 === 0 ? 'w' : 'R'])), [0.74, 0.3, 1.0, 'R'], [0.68, 0.35, 1.6, 'R'], [0.88, Math.PI / 2 - 0.55, 0.05, 'e'], [0.9, Math.PI / 2 - 0.55, 0.05, 'e']],
  viking: [...[0.8, 0.84, 0.88, 0.92, 0.95].flatMap(u => [-0.8, -0.4, 0, 0.4, 0.8].map(m => [u, m, 0.45, 'M'])), ...[1, -1].flatMap(s => [[0.86, s * 0.95, 1.0, 'H'], [0.88, s * 1.0, 1.8, 'H'], [0.91, s * 1.05, 2.5, 'H'], [0.94, s * 1.05, 3.0, 'H']])],
  tophat: [...[-1.2, -0.8, -0.4, 0, 0.4, 0.8, 1.2].map(m => [0.86, m, 0.3, 'k']), ...[1, 2, 3, 4, 5].flatMap(e => [0.82, 0.86, 0.9].map(u => [u, 0, e, e === 1 ? 'R' : 'k']))],
};
function renderRoll(skin, pal, th, phase) {
  const mk = MARKS.roll[skin.mark];
  const Wd = PL + BEAK_L + 4 + PAD * 2, Hd = 10 + PAD * 2, b = new Pix(Wd, Hd);
  const X0 = PAD + 3, CY = PAD + 5 - 0.45 * Math.sin(phase); // the body bobs a little with each stroke
  const behind = [], front = [];
  // a point on (or just off) the body surface -> screen x, y and depth toward the viewer
  const put = (u, m, extra, col) => {
    const r = penguinRadius(clamp(u, 0, 1)) + extra, a = m + th;
    (r * Math.sin(a) >= -0.1 ? front : behind).push([X0 + u * PL, CY - r * Math.cos(a), col, r * Math.sin(a)]);
  };
  // flippers are wings: long, broad at the root, beating up and down through a big arc,
  // swept back on the recovery stroke
  const flap = Math.sin(phase), sweep = 0.045 + 0.016 * Math.cos(phase);
  for (const s of [1, -1]) {
    const mf = s * (Math.PI / 2 + 1.15 * flap);
    for (let k = 0; k < 8; k++) {
      const u = 0.64 - k * sweep, ex = 0.2 + k * 0.48;
      put(u, mf, ex, k > 5 ? shade(pal.D, 0.18) : pal.D);
      if (k < 4) put(u - 0.025, mf, ex - 0.35, pal.D);
    }
  }
  // feet tucked together behind the tail as a rudder, with a small kick
  for (const s of [1, -1]) for (let k = 1; k <= 3; k++) put(-k * 0.045, Math.PI + s * 0.28, -0.4 + 0.25 * Math.cos(phase + s * 0.8), pal.F);
  put(-0.03, 0.3, -0.5, pal.K); // tail point
  for (const [x, y, col] of behind) b.set(x, y, col);
  // the body, lit from above and in front so it reads as round
  for (let x = 0; x < Wd; x++) {
    const u = (x + 0.5 - X0) / PL; if (u < 0 || u > 1) continue;
    const r = penguinRadius(u);
    for (let y = 0; y < Hd; y++) {
      const yc = y + 0.5 - CY; if (Math.abs(yc) >= r) continue;
      const al = Math.acos(clamp(-yc / r, -1, 1)), m = al - th;
      let base = Math.cos(m) > (u > 0.74 ? -0.35 : -0.12) ? pal.K : pal.W; // dark head and back, white throat and belly
      if (mk) { const key = mk(u, m); if (key) base = pal[key]; }
      const lit = 0.55 * Math.cos(al) + 0.75 * Math.sin(al);
      b.set(x, y, shade(base, clamp((lit - 0.62) * 0.7, base === pal.W ? -0.28 : -0.4, 0.24)));
    }
  }
  // face: eyes and cheeks sit on the sides of the head, so they swing round as it rolls
  for (const s of [1, -1]) {
    const a = s * (Math.PI / 2 - 0.5) + th, sa = Math.sin(a);
    if (sa > 0.25) {
      const r = penguinRadius(0.88) * 0.8, ex = X0 + 0.88 * PL, ey = CY - r * Math.cos(a);
      if (sa > 0.6) b.set(ex - 1, ey, '#ffffff');
      b.set(ex, ey, '#0b0b14');
    }
    const ac = s * (Math.PI / 2 + 0.1) + th;
    if (Math.sin(ac) > 0.35) { const cy0 = CY - penguinRadius(0.8) * 0.85 * Math.cos(ac); b.set(X0 + 0.8 * PL, cy0, pal.C); b.set(X0 + 0.76 * PL, cy0, pal.C); }
  }
  // beak: a long, pointed cone out of the front of the head, sitting a little toward the throat
  const yb = CY + 0.7 * Math.cos(th), xe = X0 + PL - 1;
  for (let i = 0; i <= BEAK_L; i++) {
    const rr = 1.15 * (1 - i / (BEAK_L + 0.6)) + 0.1, x = xe + i;
    for (let y = Math.floor(yb - rr); y <= Math.ceil(yb + rr); y++) {
      const d = y + 0.5 - yb; if (Math.abs(d) > rr) continue;
      b.set(x, y, i === BEAK_L ? pal.q : d < 0 ? shade(pal.B, 0.12) : pal.b);
    }
  }
  for (const [u, m, ex, ch] of ROLL_ACC[skin.acc] || []) put(u, m, ex, pal[ch]);
  front.sort((p, q) => p[3] - q[3]);
  for (const [x, y, col] of front) b.set(x, y, col);
  b.outline('auto');
  return b.canvas();
}
function buildPenguin(skin) {
  const accCol = skin.accCol || '#ff8fc4';
  const pal = {
    K: skin.back, W: skin.belly, E: '#ffffff', e: '#0b0b14', B: skin.beak, F: skin.feet, C: skin.cheek,
    D: shade(skin.back, skin.back === '#151a28' ? 0.25 : -0.3), R: '#e8384f', w: '#ffffff', Y: '#ffd23f',
    P: accCol, p: shade(accCol, -0.35), G: '#ffd040', r: '#e8384f', b: shade(skin.beak, -0.25), q: shade(skin.beak, -0.45),
    O: '#ff9a2b', M: '#9aa3ab', H: '#efe3c2', k: '#16181d',
  };
  // flip = flipper pixels, feet = foot pixels ('.' entries erase), marks = body markings
  const make = (rows, flip, acc, feet, marks) => {
    const b = new Pix(rows[0].length + PAD * 2, rows.length + PAD * 2);
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') b.set(x + PAD, y + PAD, pal[row[x]]); });
    (marks || []).forEach(([x, y, ch]) => b.set(x + PAD, y + PAD, pal[ch]));
    (feet || []).forEach(([x, y, ch]) => b.set(x + PAD, y + PAD, ch === '.' ? null : pal[ch]));
    flip.forEach(([x, y]) => b.set(x + PAD, y + PAD, pal.D));
    (acc || []).forEach(([x, y, ch]) => b.set(x + PAD, y + PAD, pal[ch]));
    b.volume(VOL_KEEP, 0.8);
    b.outline('auto');
    return b.canvas();
  };
  const st = ACC.stand[skin.acc], ms = MARKS.stand[skin.mark];
  const out = {
    stand: [
      make(STAND_ROWS, [[3, 6], [3, 7], [3, 8], [2, 9]], st, null, ms),
      make(STAND_ROWS, [[3, 6], [2, 7], [1, 8], [0, 8]], st, null, ms),
      make(STAND_ROWS, [[3, 6], [2, 6], [1, 5], [0, 4]], st, null, ms), // flipper flap up
    ],
    front: make(FRONT_ROWS, [], ACC.front[skin.acc], null, MARKS.front[skin.mark]),
    _roll: null,
  };
  // roll[r][f]: r = roll step (ROLL_N per full turn), f = flipper stroke frame. Built the first time
  // a skin swims, so 22 skins don't all have to be rendered before the game can start.
  Object.defineProperty(out, 'roll', { get() { return this._roll || (this._roll = Array.from({ length: ROLL_N }, (_, r) => Array.from({ length: FLAP_N }, (_, f) => renderRoll(skin, pal, r / ROLL_N * Math.PI * 2, f / FLAP_N * Math.PI * 2)))); } });
  return out;
}
// rainbow cycles through six builds of itself
const PENGUIN_SPR = SKINS.map(sk => sk.rainbow ? RAINBOW_HUES.map(h => buildPenguin({ ...sk, back: h, rainbow: false })) : buildPenguin(sk));

// ---------------------------------------------------------------- sea creature sprites
function bodyProfile(u, tail, blunt) {
  if (u < tail) return 0.2;
  const t = (u - tail) / (1 - tail);
  return Math.max(0.2, Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), blunt));
}

const ENEMY = {
  seal: { len: 36, hb: 4.6, cy: 9, ht: 18, tail: 0.12, blunt: 0.45, patrol: 60, chase: 150, lunge: 225, turn: 3.0, sight: 180, lungeRange: 60, minY: 8, name: 'SEAL', smart: true },
  shark: { len: 46, hb: 5.6, cy: 12, ht: 22, tail: 0.14, blunt: 0.55, patrol: 55, chase: 150, lunge: 250, turn: 1.75, sight: 220, lungeRange: 80, minY: 12, name: 'SHARK', caller: true },
  orca: { len: 60, hb: 7.6, cy: 19, ht: 32, tail: 0.12, blunt: 0.42, patrol: 70, chase: 166, lunge: 285, turn: 2.1, sight: 265, lungeRange: 90, minY: 14, name: 'ORCA' },
  squid: { len: 78, hb: 12, cy: 22, ht: 44, name: 'GIANT SQUID', reachMax: 115 },
  crab: { len: 46, hb: 10, cy: 13, ht: 26, name: 'GIANT CRAB' },
};
// difficulty: predator speed, how many, lives, dash recharge, and how many points a fish is worth
const DIFFS = [
  { name: 'EASY', col: '#7be0b8', enemySpd: 0.86, cap: 0.7, lives: 4, dashCD: 1.6, pts: 0.75, alert: 380, guard: 1.25 },
  { name: 'NORMAL', col: '#ffffff', enemySpd: 1, cap: 1, lives: 3, dashCD: 2.0, pts: 1, alert: 520, guard: 1 },
  { name: 'HARD', col: '#ff8a8a', enemySpd: 1.1, cap: 1.35, lives: 2, dashCD: 2.4, pts: 1.5, alert: 700, guard: 0.8 },
];
// upgrades: top swimming speed and how heavy a fish you can lift (kg)
const SPEED_LV = [118, 131, 144, 156, 168, 180];
const CARRY_LV = [3, 4.5, 6.5, 9, 12, 16];
const UPGRADE_COST = [5, 12, 24, 42, 70];
let diff = DIFFS[1], upSpeed = 0, upCarry = 0;

function genEnemy(kind, wag, open) {
  const S = ENEMY[kind], L = S.len, M = 3;
  const b = new Pix(L + M * 2, S.ht + M * 2);
  const cy = S.cy + M;
  const X = u => M + u * L;
  const wagAt = x => { const u = (x - M) / L; return u < 0.35 ? wag * (1 - u / 0.35) : 0; };
  // body
  for (let x = 0; x < L; x++) {
    const u = x / (L - 1), h = bodyProfile(u, S.tail, S.blunt) * S.hb, c = cy + wagAt(x + M);
    for (let y = 0; y < b.h; y++) {
      const yc = y + 0.5, v = (yc - c) / h;
      if (Math.abs(v) >= 1) continue;
      let col;
      if (kind === 'shark') col = v > 0.2 ? '#e4ecf0' : v > -0.05 ? '#9fb3c5' : v < -0.7 ? '#4f6b86' : '#61809c';
      else if (kind === 'orca') {
        col = '#15171f';
        if (v > 0.3 + 0.18 * Math.sin(u * 22) && u > 0.3 && u < 0.93) col = '#f2f5f7';
        if (u > 0.38 && u < 0.52 && v < -0.55) col = '#6d7480';
        const ex = (x + M - X(0.79)) / 4.2, ey = (yc - (c - S.hb * 0.42)) / 1.6;
        if (ex * ex + ey * ey < 1) col = '#f2f5f7';
      } else {
        col = v > 0.3 ? '#c8cfd8' : v < -0.6 ? '#6f7885' : '#828b98';
        if (v < 0.35 && u > 0.18 && u < 0.78 && hash(x * 3, y * 7) > 0.8) col = '#565d69';
      }
      b.set(x + M, y, col);
    }
  }
  // fins
  if (kind === 'shark') {
    const fin = '#55728f';
    b.tri(X(0.43), cy - S.hb * 0.9, X(0.48), cy - S.hb - 7, X(0.6), cy - S.hb * 0.85, fin);
    b.tri(X(0.19), cy - 2, X(0.16), cy - 4.5, X(0.24), cy - 2, fin);
    b.tri(X(0.14), cy - 1, X(0), cy - 10 + wag, X(0.07), cy + wag * 0.5, fin);
    b.tri(X(0.14), cy + 1, X(0.01), cy + 7 + wag, X(0.07), cy + wag * 0.5, fin);
    b.tri(X(0.6), cy + 2, X(0.5), cy + 9, X(0.55), cy + 2, fin);
    for (const gu of [0.71, 0.74, 0.77]) for (let y = -1; y <= 1; y++) b.set(X(gu), cy + y, '#46607a');
    b.set(X(0.86), cy - 2, '#0a0d14'); b.set(X(0.86), cy - 3, '#ffffff');
  } else if (kind === 'orca') {
    const k = '#15171f';
    b.tri(X(0.43), cy - S.hb * 0.9, X(0.46), cy - S.hb - 11, X(0.55), cy - S.hb * 0.85, k);
    b.tri(X(0.15), cy - 1, X(0), cy - 4 + wag, X(0), cy + 4 + wag, k);
    b.tri(X(0.66), cy + 3, X(0.55), cy + 11, X(0.6), cy + 3, k);
    b.set(X(0.83), cy - 1, '#ffffff'); b.set(X(0.82), cy - 1, '#0a0d14');
  } else {
    const fl = '#666d79';
    b.tri(X(0.13), cy - 1, X(0), cy - 5 + wag, X(0.03), cy + wag, fl);
    b.tri(X(0.13), cy + 1, X(0), cy + 5 + wag, X(0.03), cy + wag, fl);
    b.tri(X(0.63), cy + 2, X(0.52), cy + 7, X(0.56), cy + 2, fl);
    b.set(X(0.85), cy - 2, '#0b0d14'); b.set(X(0.86), cy - 2, '#0b0d14'); b.set(X(0.85), cy - 1, '#0b0d14'); b.set(X(0.86), cy - 1, '#0b0d14');
    b.set(X(0.86), cy - 2, '#ffffff');
  }
  // mouth
  const m0 = kind === 'orca' ? 0.84 : 0.8;
  if (open) {
    for (let x = Math.floor(X(m0)); x < X(1) + 1; x++) {
      const k = (x - X(m0)) / (X(1) - X(m0));
      const top = cy + 0.5 - k * 1.5, bot = cy + 1 + k * (kind === 'orca' ? 6 : 5);
      for (let y = Math.floor(top); y <= bot; y++) {
        if (!b.get(x, y)) continue;
        const edge = y === Math.floor(top) || y >= Math.floor(bot);
        b.set(x, y, edge && (x % 2 === 0) ? '#ffffff' : '#7a1426');
      }
    }
  } else {
    for (let x = Math.floor(X(m0 + 0.04)); x < X(0.98); x++) b.set(x, cy + 1.5, kind === 'orca' ? '#3a3f4a' : '#2c3a4a');
  }
  b.volume(kind === 'orca' ? new Set([...VOL_KEEP, '#15171f', '#f2f5f7']) : VOL_KEEP, 0.9);
  b.outline('auto');
  return b.canvas();
}
// Giant squid body: pointed finned mantle at the back, big-eyed head at the front.
// Its arms are drawn live every frame (see drawSquidArms) so they can writhe and reach.
function genSquid(wag) {
  const S = ENEMY.squid, M = 3, L = S.len, k = L / 46, b = new Pix(L + M * 2, S.ht + M * 2), cy = S.cy + M;
  const top = '#8c4c58', belly = '#b97884', spot = '#6a3440';
  for (let x = 0; x < L; x++) {
    const u = x / (L - 1);
    const h = (u < 0.72 ? 1.5 + u / 0.72 * 5 : 6.5 * Math.sqrt(Math.max(0, 1 - ((u - 0.86) / 0.15) ** 2))) * k;
    const c = cy + (u < 0.3 ? wag * 0.5 * (1 - u / 0.3) : 0);
    for (let y = 0; y < b.h; y++) {
      const v = (y + 0.5 - c) / Math.max(h, 0.5);
      if (Math.abs(v) >= 1) continue;
      let col = v > 0.3 ? belly : top;
      if (v < 0.4 && hash(x * 5, y * 3) > 0.78) col = spot;
      b.set(x + M, y, col);
    }
  }
  b.tri(M, cy + wag * 0.5 * k, M + 12 * k, cy - 9 * k - wag * k, M + 15 * k, cy, '#7a3e4a');
  b.tri(M, cy + wag * 0.5 * k, M + 12 * k, cy + 9 * k - wag * k, M + 15 * k, cy, '#7a3e4a');
  const ex = M + L * 0.86, ey = cy - 2 * k, er = 2.4 * k;
  for (let y = -4; y <= 4; y++) for (let x = -4; x <= 4; x++) if (x * x + y * y < er * er) b.set(ex + x, ey + y, '#f2e6a0');
  for (let y = -1; y <= 1; y++) for (let x = -1; x <= 0; x++) b.set(ex + x, ey + y, '#0b0b14');
  b.set(ex - 1, ey - 1, '#ffffff');
  b.volume(VOL_KEEP, 0.9);
  b.outline('auto');
  return b.canvas();
}
const WAGS = [-2, -1, 0, 1, 2, 1, 0, -1];
const ENEMY_SPR = {};
for (const k of ['seal', 'shark', 'orca']) ENEMY_SPR[k] = { shut: WAGS.map(w => genEnemy(k, w, false)), open: WAGS.map(w => genEnemy(k, w, true)) };
{ const sq = WAGS.map(w => genSquid(w)); ENEMY_SPR.squid = { shut: sq, open: sq }; }

// 20 open-water species (each lives between min..max world x; worth more the farther out)
// plus 3 that only live in the deep caverns.
// [key, name, val, len, hb, top, belly, fin, stripe, extras, minX, maxX, weight]
const FISH_LIST = [
  ['sprat', 'SPRAT', 1, 9, 2.2, '#a9b4bf', '#eef2f5', '#8a96a3', null, {}, 500, 4000, 10],
  ['capelin', 'CAPELIN', 1, 10, 2, '#6f8f8a', '#e9efe9', '#5a7a74', '#a8c7c0', {}, 500, 4500, 9],
  ['smelt', 'SMELT', 2, 11, 2.2, '#8fb5a8', '#f1f5f2', '#6f9588', '#cfe8dd', {}, 900, 6000, 7],
  ['sandeel', 'SAND EEL', 2, 15, 1.4, '#b9b08a', '#f3f0e2', '#9a9170', null, { eel: 1 }, 900, 6000, 6],
  ['herring', 'HERRING', 3, 12, 2.6, '#3f6fb0', '#e2ecf7', '#2f5a94', '#9bd0ff', {}, 2000, 8000, 8],
  ['polarcod', 'POLAR COD', 3, 12, 2.8, '#7a6f62', '#ece6dc', '#62584d', null, { spots: '#5a5045' }, 2000, 8000, 7],
  ['mackerel', 'MACKEREL', 4, 13, 2.8, '#2f8a7a', '#eef4f2', '#246b5f', '#bfe8de', { bars: '#173f39' }, 3000, 10000, 7],
  ['sculpin', 'SCULPIN', 4, 11, 3.4, '#8a5a3a', '#e8c9a8', '#6b4128', null, { spots: '#5a3420', spiny: 1, round: 1 }, 3000, 10000, 5],
  ['char', 'ARCTIC CHAR', 5, 14, 3, '#5f7484', '#ff8f6a', '#4d5f6d', '#ffb69c', { spots: '#ffd9c9' }, 4000, 12000, 6],
  ['pollock', 'POLLOCK', 5, 15, 3, '#5d6b52', '#e9eedd', '#4b5742', '#c9d4b2', {}, 4500, 12000, 6],
  ['salmon', 'SALMON', 6, 16, 3.3, '#7d8fa6', '#ffb08a', '#6a7a90', '#ff7f6a', { spots: '#3b4656' }, 6000, 14000, 6],
  ['lumpfish', 'LUMPFISH', 7, 12, 4.2, '#6f9a4a', '#c9e08a', '#557a36', null, { round: 1, spots: '#9fcf6a' }, 6500, 14000, 4],
  ['haddock', 'HADDOCK', 7, 16, 3.2, '#6b6f78', '#e6e8ec', '#4f535b', '#2f3238', {}, 7000, 15000, 5],
  ['wolffish', 'WOLFFISH', 9, 20, 3, '#6e7f8f', '#c9d2da', '#55636f', null, { bars: '#3d4853', eel: 1 }, 8500, 17000, 4],
  ['ratfish', 'RATFISH', 10, 16, 3, '#b9a6c9', '#efe8f5', '#9a86ab', null, { spots: '#ffffff', bigeye: 1 }, 9500, 18000, 4],
  ['halibut', 'HALIBUT', 12, 18, 4.6, '#7a6a55', '#efe9df', '#5f513f', null, { spots: '#5a4b38', round: 1 }, 10500, 21000, 3],
  ['lantern', 'LANTERNFISH', 12, 11, 2.6, '#2b3550', '#5b6a8f', '#1f2840', null, { glow: '#8ff7ff', bigeye: 1 }, 11000, 21000, 4],
  ['toothfish', 'TOOTHFISH', 15, 19, 3.6, '#4d5560', '#b8c0c9', '#3b424b', null, {}, 12500, 21000, 3],
  ['opah', 'SILVER KING', 20, 17, 5, '#c9505a', '#f2d2d6', '#e8384f', null, { spots: '#ffffff', round: 1 }, 14000, 21000, 2],
  ['golden', 'GOLDEN FISH', 30, 14, 3.4, '#f7c531', '#fff1a8', '#e08a1a', '#ffe46a', {}, 15000, 21000, 1.5],
  ['whiting', 'BLUE WHITING', 3, 12, 2.4, '#6a8aa8', '#e6eef6', '#4e6e8c', '#a8c4dc', {}, 2500, 9000, 7],
  ['eelpout', 'EELPOUT', 5, 17, 2.4, '#8a7a62', '#e0d4c0', '#6e5e48', null, { eel: 1, spots: '#5e4e38' }, 5500, 13000, 4],
  ['plaice', 'PLAICE', 6, 15, 4.4, '#8a7a5a', '#e8e0cc', '#6e6046', null, { spots: '#e0702a', round: 1 }, 5000, 12000, 4],
  ['redfish', 'REDFISH', 8, 14, 3.4, '#c8503c', '#f0b090', '#a83a2a', '#e07a5a', { spiny: 1, bigeye: 1 }, 7500, 16000, 4],
  ['tusk', 'TUSK', 8, 17, 3, '#7a6a58', '#e2d6c4', '#5e5040', '#a89478', {}, 8000, 17000, 3],
  ['ling', 'LING', 9, 22, 2.6, '#6f7a62', '#d8dcc8', '#56604a', null, { eel: 1, bars: '#4a5440' }, 9000, 18000, 3],
  ['snailfish', 'SNAILFISH', 11, 13, 3.4, '#d9b8c4', '#f4e4ea', '#c098a8', null, { round: 1, bigeye: 1 }, 10000, 19000, 3],
  ['grenadier', 'GRENADIER', 13, 18, 3, '#8a8f98', '#d4d8de', '#6c727b', null, { bigeye: 1, eel: 1 }, 12000, 21000, 3],
  ['icefish', 'ICEFISH', 14, 17, 2.8, '#d8e4ec', '#f4f8fb', '#b8c8d4', null, { glow: '#ffffff', bigeye: 1 }, 11500, 21000, 3],
  ['skate', 'ARCTIC SKATE', 16, 20, 4.8, '#7a7468', '#e6e2d8', '#5e584c', null, { spots: '#5a544a', skate: 1 }, 11000, 21000, 2],
  // cavern-only
  ['ghost', 'CAVE GHOST', 25, 13, 2.8, '#c9d6e0', '#f4f8fb', '#9fb0bf', null, { glow: '#ffffff', bigeye: 1, cave: 1 }, 0, 0, 5],
  ['crystal', 'CRYSTAL FISH', 40, 12, 3.2, '#8ff7ff', '#e6fdff', '#5fc9e0', '#c8ffff', { glow: '#ffffff', cave: 1 }, 0, 0, 3],
  ['abyss', 'ABYSS KING', 60, 20, 4.4, '#5a2f7a', '#c08fff', '#3f1f5a', '#ff8fd8', { glow: '#ffd23f', bigeye: 1, cave: 1 }, 0, 0, 1],
  ['glasseel', 'GLASS EEL', 35, 18, 1.6, '#c8f0f4', '#eefcff', '#a0dce4', null, { eel: 1, glow: '#ffffff', cave: 1 }, 0, 0, 4],
  ['pearl', 'PEARL FISH', 45, 11, 3, '#f0ece4', '#ffffff', '#d8d0c0', '#fff6e0', { glow: '#fff6e0', cave: 1 }, 0, 0, 2],
  ['starsnout', 'STAR SNOUT', 75, 16, 4, '#3a2f5a', '#8a78c8', '#28204a', '#d0b8ff', { glow: '#ffd23f', bigeye: 1, spiny: 1, cave: 1 }, 0, 0, 0.6],
];
const FISH = {};
for (const [key, name, val, len, hb, top, belly, fin, stripe, ex, min, max, w] of FISH_LIST)
  FISH[key] = { key, name, val, len, hb, top, belly, fin, stripe, ...ex, min, max, w, speed: 40 + val * 1.6 };
const SIZES = [0.75, 1, 1.35], SIZE_VAL = [0.5, 1, 2], SIZE_NAME = ['LITTLE ', '', 'BIG '];

function genFish(t, wag, sc, shiny) {
  const L = Math.max(6, Math.round(t.len * sc)), hb = t.hb * sc, M = 3, hgt = Math.ceil(hb * 2) + 4;
  const b = new Pix(L + M * 2, hgt + M * 2), cy = M + hgt / 2;
  const top = shiny ? shade(t.top, 0.45) : t.top, belly = shiny ? shade(t.belly, 0.5) : t.belly, fin = shiny ? '#ffd23f' : t.fin;
  const tail = t.eel ? 0.1 : 0.22, blunt = t.round ? 0.3 : t.eel ? 0.9 : 0.6;
  for (let x = 0; x < L; x++) {
    const u = x / (L - 1), off = u < 0.3 ? wag * (1 - u / 0.3) : 0;
    const h = t.skate ? (u < 0.42 ? 0.7 : Math.max(0.7, hb * (1 - Math.abs(u - 0.7) / 0.3))) : bodyProfile(u, tail, blunt) * hb, c = cy + off;
    for (let y = 0; y < b.h; y++) {
      const v = (y + 0.5 - c) / h;
      if (Math.abs(v) >= 1 || (u < tail && !t.skate)) continue;
      let col = v > 0.15 ? belly : (t.stripe && v > -0.25) ? t.stripe : top;
      if (t.bars && x % 4 === 0 && v < 0.15 && u > 0.3 && u < 0.85) col = t.bars;
      if (t.spots && v < 0.3 && hash(x * 11 + t.len, y * 5) > 0.8) col = t.spots;
      if (t.glow && v > 0.45 && x % 3 === 0) col = t.glow;
      b.set(x + M, y, col);
    }
  }
  if (!t.skate) b.tri(M + L * (tail + 0.04), cy, M, cy - hb - 0.5 + wag, M, cy + hb + 0.5 + wag, fin);
  if (t.eel) for (let x = Math.floor(L * 0.25); x < L * 0.85; x++) b.set(M + x, cy - bodyProfile(x / (L - 1), tail, blunt) * hb - 1, fin);
  else {
    const fh = t.spiny ? 3 : 1.5;
    b.tri(M + L * 0.42, cy - hb + 0.5, M + L * 0.55, cy - hb - fh, M + L * 0.66, cy - hb + 0.5, fin);
  }
  const ex = M + L * 0.8;
  if (t.bigeye) { b.set(ex, cy - 1, '#ffffff'); b.set(ex - 1, cy - 1, '#0b0b14'); b.set(ex, cy - 2, '#0b0b14'); b.set(ex - 1, cy - 2, '#0b0b14'); }
  else b.set(ex, cy - 1, '#0b0b14');
  b.volume(VOL_KEEP, 0.9);
  b.outline(shiny ? '#c98a10' : 'auto');
  return b.canvas();
}
// FISH_SPR[key][size][frame], FISH_SHINY[key][frame]
const FISH_SPR = {}, FISH_SHINY = {};
for (const k in FISH) {
  FISH_SPR[k] = SIZES.map(sc => [-1, 0, 1, 0].map(w => genFish(FISH[k], w, sc, false)));
  FISH_SHINY[k] = [-1, 0, 1, 0].map(w => genFish(FISH[k], w, 1.1, true));
}
const fishImg = (c, fr) => c.shiny ? FISH_SHINY[c.type][fr] : FISH_SPR[c.type][c.size][fr];
const fishVal = c => Math.max(1, Math.round(FISH[c.type].val * SIZE_VAL[c.size] * (c.shiny ? 3 : 1)));
const fishName = c => (c.shiny ? 'SHINY ' : '') + SIZE_NAME[c.size] + FISH[c.type].name;
const fishLen = c => FISH[c.type].len * (c.shiny ? 1.1 : SIZES[c.size]);
// weight in kg: grows with body area and with size squared
const fishKg = c => { const T = FISH[c.type], s = c.shiny ? 1.1 : SIZES[c.size]; return Math.round(T.len * T.hb / 12 * s * s * 10) / 10; };

// little HUD icons
function iconFromRows(rows, pal) {
  const b = new Pix(rows[0].length + 2, rows.length + 2);
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] !== '.') b.set(x + 1, y + 1, pal[r[x]]); });
  b.outline('auto'); return b.canvas();
}
const HEART = iconFromRows(['.RR.RR.', 'RwRRRRR', 'RRRRRRR', '.RRRRR.', '..RRR..', '...R...'], { R: '#ff4f6d', w: '#ffd0da' });
const HEART_EMPTY = iconFromRows(['.RR.RR.', 'R..R..R', 'R.....R', '.R...R.', '..R.R..', '...R...'], { R: '#5a6178' });

// ---------------------------------------------------------------- world
const WORLD_END = 20000, SHELF_L = -700, SHELF_Y = -12, PILE_X = -44, IGLOO_X = -190;
const rng = mulberry32(20261005);
const bedArr = new Float32Array(WORLD_END + 400);
for (let x = 0; x < bedArr.length; x++) {
  bedArr[x] = 62 + clamp(x * 0.16, 0, 340) + 9 * Math.sin(x * 0.011) + 5 * Math.sin(x * 0.037 + 1) + 3 * Math.sin(x * 0.093 + 2);
}
function bed(x) { if (x < 0) return bedArr[0]; const i = x | 0; return i >= bedArr.length ? bedArr[bedArr.length - 1] : bedArr[i]; }

function pointInPoly(p, x, y) {
  let ins = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const xi = p[i][0], yi = p[i][1], xj = p[j][0], yj = p[j][1];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) ins = !ins;
  }
  return ins;
}

// ---- icebergs: big, slippery, solid. Can't stand on them, can't jump up through them.
const bergs = [];
function makeBerg(cx, w, D, Hh) {
  const j = () => (rng() - 0.5) * 0.16;
  const pts = [
    [cx + w * (0.05 + j()), -Hh], [cx + w * (0.3 + j()), -Hh * 0.62], [cx + w * (0.5 + j()), -Hh * 0.3], [cx + w * 0.68, 0],
    [cx + w, D * 0.3], [cx + w * (0.75 + j()), D * 0.75], [cx + w * 0.25, D], [cx - w * 0.3, D * (0.88 + j())],
    [cx - w * (0.85 + j()), D * 0.6], [cx - w, D * 0.22], [cx - w * 0.62, 0], [cx - w * (0.45 + j()), -Hh * 0.35],
    [cx - w * (0.2 + j()), -Hh * 0.75],
  ];
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
  const bw = x1 - x0, bh = y1 - y0, b = new Pix(bw, bh);
  const inside = new Uint8Array(bw * bh);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) inside[y * bw + x] = pointInPoly(pts, x0 + x + 0.5, y0 + y + 0.5) ? 1 : 0;
  const ins = (x, y) => x >= 0 && y >= 0 && x < bw && y < bh && inside[y * bw + x];
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) {
    if (!ins(x, y)) continue;
    const wx = x0 + x, wy = y0 + y, s = (wx - cx) / w;
    const edge = !ins(x - 1, y) || !ins(x + 1, y) || !ins(x, y - 1) || !ins(x, y + 1);
    const facet = Math.floor((wx * 0.6 + wy) / 9 + hash(Math.floor((wx * 0.6 + wy) / 9), 3) * 2) % 3;
    let col;
    if (wy < 0) {
      col = s < -0.25 ? '#f6f8f9' : s < 0.15 ? '#e2e7eb' : '#c4ccd3';
      if (facet === 1 && s > -0.25) col = s < 0.15 ? '#d8dee3' : '#b3bcc4';
      if (edge) col = s < 0.1 ? '#ffffff' : '#9aa6b0';
    } else {
      const d = wy / D;
      col = d < 0.3 ? '#a3b4c0' : d < 0.65 ? '#8799a7' : '#6e808f';
      if (s > 0.2) col = shade(col, -0.12);
      if (facet === 1) col = shade(col, 0.08);
      if (edge) col = '#c9d4dc';
    }
    b.set(x, y, col);
  }
  // a few cracks
  for (let k = 0; k < 7; k++) {
    let px = cx + (rng() - 0.5) * w, py = -Hh * 0.3 + rng() * D * 0.8;
    for (let s = 0; s < 14; s++) { px += rng() - 0.3; py += 1; if (ins(Math.floor(px - x0), Math.floor(py - y0))) b.set(px - x0, py - y0, py < 0 ? '#b3bcc4' : '#5f7180'); }
  }
  return { cx, w, D, Hh, pts, x0, y0, x1, y1, img: b.canvas() };
}
{
  let x = 1500;
  while (x < WORLD_END - 400) {
    if (rng() < 0.8) {
      const w = 90 + rng() * 80;
      const D = Math.min(130 + rng() * 140, bed(x) - 45);
      bergs.push(makeBerg(x, w, D, 55 + rng() * 55));
    }
    x += 900 + rng() * 1100;
  }
}

// ---- ice floes: floating blocks you can hop onto and hide on
const floes = [], FLOE_BOTTOM = 8;
function makeFloeImg(w) {
  const b = new Pix(w + 2, 15);
  for (let y = 0; y < 13; y++) for (let x = 0; x < w; x++) {
    if ((y === 0 || y === 12) && (x === 0 || x === w - 1)) continue;
    let col = y === 0 ? '#ffffff' : y < 4 ? "#eef1f4" : y < 5 ? "#d3dade" : '#a9b7c2';
    if (y > 4 && (x + y) % 9 === 0) col = '#bcc7cf';
    if (y === 1 && hash(x, w) > 0.85) col = '#ffffff';
    b.set(x + 1, y + 1, col);
  }
  b.outline('#7f8f9c');
  return b.canvas();
}
{
  let x = 300;
  while (x < WORLD_END - 100) {
    x += 180 + rng() * 300;
    const w = Math.round(40 + rng() * 30);
    if (bergs.some(b => Math.abs(x - b.cx) < b.w + w + 30)) continue;
    floes.push({ x, w, ph: rng() * 6, img: makeFloeImg(w), top: -5 });
  }
}

// ---- caverns: deep, branching tunnel networks cut into the seabed, only far out.
// Each cave is a set of chains (centre-line points with a radius); open space = union of capsules.
// Side branches end in big treasure rooms guarded by a giant squid or a giant crab.
const caves = [];
{
  const cr = mulberry32(4242);
  const plan = [[12200, 2300], [15000, 2200], [17600, 2100]];
  plan.forEach(([x0, len], ci) => {
    const chains = [], rooms = [], main = [];
    const deepest = 470 + cr() * 130;
    main.push([x0, bed(x0) - 6, 15], [x0 + 12, bed(x0 + 12) + 30, 16], [x0 + 34, bed(x0 + 34) + 72, 18]);
    let x = x0 + 75, y = bed(x0) + 110, k = 0;
    while (x < x0 + len - 130) {
      const prog = (x - x0) / len, dive = Math.sin(prog * Math.PI) * deepest;
      const room = k > 3 && cr() < 0.13;
      const r = room ? 46 + cr() * 18 : 18 + cr() * 9;
      main.push([x, y, r]);
      if (room) rooms.push({ x, y, r, treasure: false });
      x += 46 + cr() * 40; k++;
      y = clamp(lerp(y, bed(x) + 70 + dive, 0.35) + (cr() - 0.5) * 70, bed(x) + 58, bed(x) + 70 + deepest);
    }
    const xe = x0 + len;
    main.push([xe - 34, bed(xe - 34) + 72, 18], [xe - 12, bed(xe - 12) + 30, 16], [xe, bed(xe) - 6, 15]);
    chains.push(main);
    // side branches that dive down to the treasure rooms
    for (let b = 0; b < 3; b++) {
      const from = main[5 + Math.floor((b + cr() * 0.8) / 3 * (main.length - 11))];
      const br = [[from[0], from[1], 18]], dirx = cr() < 0.5 ? -1 : 1;
      let bx = from[0], by = from[1];
      for (let s = 0; s < 5; s++) { bx += dirx * (28 + cr() * 26); by += 24 + cr() * 30; br.push([bx, by, 16 + cr() * 6]); }
      const rr = 60 + cr() * 18;
      bx += dirx * rr * 0.55; by += rr * 0.45;
      br.push([bx, by, rr]);
      rooms.push({ x: bx, y: by, r: rr, treasure: true });
      chains.push(br);
    }
    // guards: every treasure room has one; a few plain rooms get a crab
    let ti = ci;
    for (const r of rooms) {
      if (r.treasure) r.guard = ti++ % 2 ? 'crab' : 'squid';
      else if (cr() < 0.45) r.guard = 'crab';
    }
    // segments + a coarse x-bucket index so depth tests only look at nearby segments
    const segs = [];
    for (const ch of chains) for (let i = 0; i < ch.length - 1; i++) {
      const [ax, ay, ar] = ch[i], [bx2, by2, br2] = ch[i + 1];
      segs.push({ ax, ay, ar, bx: bx2, by: by2, br: br2, dx: bx2 - ax, dy: by2 - ay, l2: (bx2 - ax) ** 2 + (by2 - ay) ** 2 || 1 });
    }
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    for (const ch of chains) for (const [px, py, r] of ch) { bx0 = Math.min(bx0, px - r); bx1 = Math.max(bx1, px + r); by0 = Math.min(by0, py - r); by1 = Math.max(by1, py + r); }
    const cave = { chains, rooms, segs, x0: Math.floor(bx0) - 30, x1: Math.ceil(bx1) + 30, y0: Math.floor(by0) - 4, y1: Math.ceil(by1) + 30, buckets: new Map() };
    segs.forEach((s, i) => {
      const lo = Math.floor((Math.min(s.ax, s.bx) - Math.max(s.ar, s.br) - 32) / 64), hi = Math.floor((Math.max(s.ax, s.bx) + Math.max(s.ar, s.br) + 32) / 64);
      for (let b = lo; b <= hi; b++) { if (!cave.buckets.has(b)) cave.buckets.set(b, []); cave.buckets.get(b).push(i); }
    });
    caves.push(cave);
  });
}
// distance from (x,y) to the tunnel wall: >0 means that far inside the tunnel
function tunnelDepth(c, x, y) {
  let best = -Infinity, bx = 0, by = 0;
  const list = c.buckets.get(Math.floor(x / 64));
  if (!list) return [-999, x, y];
  for (const i of list) {
    const s = c.segs[i];
    const t = clamp(((x - s.ax) * s.dx + (y - s.ay) * s.dy) / s.l2, 0, 1);
    const cx = s.ax + s.dx * t, cy = s.ay + s.dy * t, r = s.ar + (s.br - s.ar) * t;
    const d = r - Math.hypot(x - cx, y - cy);
    if (d > best) { best = d; bx = cx; by = cy; }
  }
  return [best, bx, by];
}
function caveAt(x) { for (const c of caves) if (x > c.x0 && x < c.x1) return c; return null; }
function inCave(o) { const c = caveAt(o.x); return c && o.y > bed(o.x) - 2 && tunnelDepth(c, o.x, o.y)[0] > 0 ? c : null; }
// the floor under a point inside a cave
function floorAt(c, x, y) { let yy = y; for (let k = 0; k < 140 && tunnelDepth(c, x, yy)[0] > 3; k++) yy++; return yy; }
for (const c of caves) for (const r of c.rooms) r.floor = floorAt(c, r.x, r.y);
// ---- seaweed + seabed decor
const weeds = [], decor = [];
{
  const greens = ['#4f7a62', '#5f8a70', '#45685a', '#7a9068', '#6e6648', '#58807a'];
  let x = 20;
  while (x < WORLD_END) {
    x += 8 + rng() * 34;
    const kelp = x > 1200 && x < 3500;
    if (rng() > (kelp ? 0.9 : 0.55)) continue;
    const tall = kelp ? 30 + rng() * 70 : 8 + rng() * 34;
    weeds.push({ x, h: Math.round(tall), col: greens[Math.floor(rng() * greens.length)], ph: rng() * 6, bulbs: rng() < 0.45, leaf: rng() < 0.6 });
  }
  x = 30;
  while (x < WORLD_END) {
    x += 25 + rng() * 90;
    const r = rng();
    decor.push({ x, type: r < 0.35 ? 'rock' : r < 0.55 ? 'star' : r < 0.72 ? 'shell' : r < 0.86 ? 'urchin' : 'anemone', s: rng(), col: ['#c98a72', '#c97a92', '#c9a272', '#9a7ab5'][Math.floor(rng() * 4)] });
  }
}
// keep cave mouths clear of plants and rocks
const nearMouth = x => caves.some(c => { const m = c.chains[0]; return Math.abs(x - m[0][0]) < 22 || Math.abs(x - m[m.length - 1][0]) < 22; });
for (const arr of [weeds, decor]) for (let i = arr.length - 1; i >= 0; i--) if (nearMouth(arr[i].x)) arr.splice(i, 1);
// ---------------------------------------------------------------- collision helpers
function closestOnSeg(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  let t = l2 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; t = clamp(t, 0, 1);
  return [ax + dx * t, ay + dy * t];
}
// Push a circle out of an iceberg. Returns outward normal or null.
function pushOutBerg(o, r, b) {
  if (o.x < b.x0 - r || o.x > b.x1 + r || o.y < b.y0 - r || o.y > b.y1 + r) return null;
  const p = b.pts; let best = Infinity, bx = 0, by = 0;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const [cx, cy] = closestOnSeg(o.x, o.y, p[j][0], p[j][1], p[i][0], p[i][1]);
    const d = (cx - o.x) ** 2 + (cy - o.y) ** 2;
    if (d < best) { best = d; bx = cx; by = cy; }
  }
  const d = Math.sqrt(best), inside = pointInPoly(p, o.x, o.y);
  if (!inside && d >= r) return null;
  let nx, ny;
  if (d < 1e-4) { nx = Math.sign(o.x - b.cx) || 1; ny = 0; }
  else if (inside) { nx = (bx - o.x) / d; ny = (by - o.y) / d; }
  else { nx = (o.x - bx) / d; ny = (o.y - by) / d; }
  o.x = bx + nx * r; o.y = by + ny * r;
  return [nx, ny];
}
function pushOutRect(o, r, x0, y0, x1, y1) {
  const cx = clamp(o.x, x0, x1), cy = clamp(o.y, y0, y1);
  let dx = o.x - cx, dy = o.y - cy, d = Math.hypot(dx, dy);
  if (d >= r) return null;
  if (d < 1e-4) { // centre inside: leave by the nearest side
    const opts = [[o.x - x0, -1, 0], [x1 - o.x, 1, 0], [o.y - y0, 0, -1], [y1 - o.y, 0, 1]].sort((a, b) => a[0] - b[0])[0];
    dx = opts[1]; dy = opts[2];
    o.x = opts[1] ? (opts[1] < 0 ? x0 - r : x1 + r) : o.x;
    o.y = opts[2] ? (opts[2] < 0 ? y0 - r : y1 + r) : o.y;
    return [dx, dy];
  }
  dx /= d; dy /= d; o.x = cx + dx * r; o.y = cy + dy * r;
  return [dx, dy];
}
// Seabed collision with cave tunnels carved out. Returns the push direction or null.
function groundCollide(o, r) {
  const by = bed(o.x);
  if (o.y <= by - r) return null;
  const c = caveAt(o.x);
  if (c) {
    const [d, cx, cy] = tunnelDepth(c, o.x, o.y);
    if (d >= r) return null;
    // either back into the tunnel, or up onto the seabed: whichever is the smaller move
    const upMove = o.y - (by - r), inMove = r - d;
    if (inMove < upMove || o.y > by + r) {
      const dx = cx - o.x, dy = cy - o.y, l = Math.hypot(dx, dy) || 1;
      o.x += dx / l * inMove; o.y += dy / l * inMove;
      return [dx / l, dy / l];
    }
  }
  o.y = by - r;
  return [0, -1];
}
function floeTop(f, t) { return f.top + Math.round(Math.sin(t * 1.6 + f.ph) * 0.8); }

// ---------------------------------------------------------------- audio
const SFX = {
  c: null, on: true,
  init() { if (!this.c) { try { this.c = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } } if (this.c && this.c.state === 'suspended') this.c.resume(); },
  tone(f0, f1, dur, type = 'square', vol = 0.05, delay = 0) {
    if (!this.c || !this.on) return;
    const c = this.c, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
  },
  noise(dur, f0, f1, vol = 0.06) {
    if (!this.c || !this.on) return;
    const c = this.c, t = c.currentTime, n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = buf; f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(c.destination); s.start(t);
  },
  splash(big) { this.noise(big ? 0.35 : 0.2, 1400, 250, big ? 0.09 : 0.05); },
  dash() { this.noise(0.2, 500, 2600, 0.06); this.tone(320, 640, 0.12, 'triangle', 0.03); },
  grab() { this.tone(700, 1400, 0.08, 'square', 0.04); },
  deposit() { [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.1, 'square', 0.035, i * 0.07)); },
  chomp() { this.tone(200, 50, 0.3, 'sawtooth', 0.08); this.noise(0.18, 400, 120, 0.09); },
  hop() { this.tone(420, 760, 0.08, 'triangle', 0.04); },
  lunge() { this.tone(120, 70, 0.35, 'sawtooth', 0.025); },
  land() { this.tone(260, 180, 0.05, 'triangle', 0.04); },
  click() { this.tone(900, 900, 0.04, 'square', 0.03); },
  over() { [392, 330, 262, 196].forEach((f, i) => this.tone(f, f * 0.98, 0.18, 'triangle', 0.05, i * 0.16)); },
};

// ---------------------------------------------------------------- input
const mouse = { sx: W / 2, sy: H / 2, down: false };
let clickQueued = false;
function toScreen(e) { const r = cv.getBoundingClientRect(); mouse.sx = (e.clientX - r.left) / r.width * W; mouse.sy = (e.clientY - r.top) / r.height * H; }
addEventListener('mousemove', toScreen);
cv.addEventListener('mousedown', e => { toScreen(e); SFX.init(); if (e.button === 0) { clickQueued = true; mouse.down = true; } });
addEventListener('mouseup', () => { mouse.down = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
const keys = {};
addEventListener('keydown', e => {
  SFX.init();
  if (e.code === 'Space') { e.preventDefault(); if (!keys.Space && mode === 'play') clickQueued = true; }
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });

// ---------------------------------------------------------------- state
let mode = 'menu', time = 0, shake = 0;
let skinIdx = 0, best = 0;
try { skinIdx = clamp(parseInt(localStorage.getItem('pd_skin') || '0', 10) || 0, 0, SKINS.length - 1); best = parseInt(localStorage.getItem('pd_best') || '0', 10) || 0; } catch (e) { }
function saveSkin() { try { localStorage.setItem('pd_skin', skinIdx); } catch (e) { } }
const cam = { x: 60, y: -20 };
let P, lives, pile, pileFish, enemies, fishes, parts, texts, spawnT, fishT, playT, newBest, deepest;
let rings = [], streak = 0, streakT = 0;
const STREAK_TIME = 90; // bring the next fish home within this many seconds to keep the streak

function newGame() {
  P = {
    x: PILE_X + 24, y: SHELF_Y - 7, vx: 0, vy: 0, state: 'land', face: 1, angle: 0, carry: null, dashCD: 0, dashT: 0, inv: 1.5,
    deadT: 0, anim: 0, floe: null, fx: 0, trail: [], bubT: 0, flipVis: 1, flipTo: 1, flipT: 0, turnT: 0, heavyT: 0,
    stun: 0, stunImm: 0, boost: 0,
  };
  rings = []; streak = 0; streakT = 0;
  lives = diff.lives; pile = 0; pileFish = []; enemies = []; fishes = []; parts = []; texts = [];
  spawnT = 0; fishT = 0; playT = 0; newBest = false; deepest = 0;
  cam.x = P.x + 120; cam.y = -10;
  mode = 'play';
}

// ---------------------------------------------------------------- particles + floating text
function addPart(x, y, vx, vy, life, col, kind = 'dot', size = 1) { parts.push({ x, y, vx, vy, life, max: life, col, kind, size }); }
function splash(x, speed) {
  const n = clamp(Math.floor(speed / 18), 3, 16);
  for (let i = 0; i < n; i++) addPart(x + (Math.random() - 0.5) * 8, -1, (Math.random() - 0.5) * 70, -40 - Math.random() * speed * 0.6, 0.8, Math.random() < 0.5 ? '#ffffff' : '#bfe8ff', 'drop');
  for (let i = 0; i < n / 2; i++) addPart(x + (Math.random() - 0.5) * 10, 4 + Math.random() * 6, (Math.random() - 0.5) * 20, -10, 1 + Math.random(), '#dff4ff', 'bubble');
  addPart(x, 0, 0, 0, 1.1, '#d9e0e5', 'ripple');
  if (speed > 160) addPart(x, 0, 0, 0, 1.5, '#d9e0e5', 'ripple');
  SFX.splash(speed > 160);
}
function addText(x, y, s, col = '#fff', life = 1.2) { texts.push({ x, y, s, col, life, max: life }); }

// ---------------------------------------------------------------- zones + spawning
const ZONES = [[0, 'HOME'], [1200, 'SHALLOWS'], [3500, 'KELP BAY'], [7000, 'OPEN WATER'], [11000, 'THE DEEP GREY'], [15000, 'ICEBERG ALLEY'], [Infinity, 'ORCA TERRITORY']];
function zoneName(x) { if (P && P.cave) return 'SUNKEN CAVERN'; if (x < 0) return 'HOME'; for (const [lim, n] of ZONES.slice(1)) if (x < lim) return n; }
function enemyCap(x) { return Math.round((x < 600 ? 0 : x < 1500 ? 1 : x < 3500 ? 2 : x < 7000 ? 3 : x < 11000 ? 4 : x < 15000 ? 5 : 6) * diff.cap); }
function pickEnemy(x) { const r = Math.random(); return x < 2500 ? 'seal' : x < 6000 ? (r < 0.55 ? 'seal' : 'shark') : (r < 0.4 ? 'seal' : 'shark'); }
function pickWeighted(list) {
  let tot = 0; for (const t of list) tot += t.w;
  let r = Math.random() * tot;
  for (const t of list) { r -= t.w; if (r <= 0) return t.key; }
  return list[list.length - 1].key;
}
const OPEN_FISH = Object.values(FISH).filter(t => !t.cave), CAVE_FISH = Object.values(FISH).filter(t => t.cave);
function pickFish(x) { const ok = OPEN_FISH.filter(t => x >= t.min && x <= t.max); return ok.length ? pickWeighted(ok) : 'sprat'; }
function rollFish(type) {
  const r = Math.random();
  return { type, size: r < 0.3 ? 0 : r < 0.82 ? 1 : 2, shiny: Math.random() < 0.035 };
}
function inBerg(x, y, pad) { return bergs.some(b => x > b.x0 - pad && x < b.x1 + pad && y > b.y0 - pad && y < b.y1 + pad && pointInPoly(b.pts, x, y)); }
function addFish(c, x, y, ang, cave, room) { fishes.push({ ...c, x, y, ang, spd: FISH[c.type].speed * 0.4, wt: Math.random() * 2, t: Math.random() * 10, cave, room }); }

function spawnFish() {
  const side = Math.random() < 0.5 ? -1 : 1;
  const x = P.x + side * (W / 2 + 40 + Math.random() * 300);
  if (x < 500 || x > WORLD_END - 40) return;
  const type = pickFish(x), v = FISH[type].val, n = v <= 2 ? 3 + Math.floor(Math.random() * 3) : v <= 5 ? 2 + Math.floor(Math.random() * 2) : 1;
  const y = 16 + Math.random() * (Math.min(bed(x) - 14, 300) - 16);
  const hd = Math.random() < 0.5 ? 0 : Math.PI;
  for (let i = 0; i < n; i++) {
    const fx = x + (Math.random() - 0.5) * 24, fy = y + (Math.random() - 0.5) * 14;
    if (inBerg(fx, fy, 6) || fy > bed(fx) - 8) continue;
    addFish(rollFish(type), fx, fy, hd + (Math.random() - 0.5) * 0.4, null, null);
  }
}
function makeGuard(c, room) {
  const g = { kind: room.guard, guard: true, cave: c, room, x: room.x, y: room.y, ang: 0, t: Math.random() * 10, spd: 0, state: 'guard', chompT: 0, cool: 0, lungeT: 0 };
  if (g.kind === 'squid') Object.assign(g, { atk: 'idle', atkT: 1, ext: 0, aimX: room.x, aimY: room.y });
  else Object.assign(g, { y: room.floor - 10, walk: 0, claws: [-1, 1].map(side => ({ side, st: 'rest', t: 0.4 + Math.random() * 0.5, ext: 0, open: 0.2, aim: side > 0 ? -0.7 : -Math.PI + 0.7, x: 0, y: 0 })) });
  return g;
}
// keep each nearby cavern's rooms stocked with rare fish, and their guards awake
function stockCaves() {
  for (const c of caves) {
    if (P.x < c.x0 - 1200 || P.x > c.x1 + 1200) continue;
    for (const room of c.rooms) {
      if (room.guard && !enemies.includes(room.guardRef)) { room.guardRef = makeGuard(c, room); enemies.push(room.guardRef); }
      const want = room.treasure ? 4 : room.guard ? 2 : 1;
      if (fishes.filter(f => f.room === room).length >= want) continue;
      for (let k = 0; k < 10; k++) {
        const a = Math.random() * TAU2, rr = Math.random() * room.r * 0.55, fx = room.x + Math.cos(a) * rr, fy = room.y + Math.sin(a) * rr;
        if (tunnelDepth(c, fx, fy)[0] < 7 || Math.hypot(fx - P.x, fy - P.y) < 60) continue;
        addFish(rollFish(pickWeighted(CAVE_FISH)), fx, fy, Math.random() * TAU2, c, room);
        break;
      }
    }
  }
}
const TAU2 = Math.PI * 2;
function spawnEnemy() {
  const side = Math.random() < 0.65 ? 1 : -1;
  const x = P.x + side * (W / 2 + 60 + Math.random() * 220);
  if (x < 700 || x > WORLD_END - 40) return;
  const kind = pickEnemy(x), S = ENEMY[kind];
  const y = S.minY + 10 + Math.random() * (Math.min(bed(x) - 20, 300) - S.minY - 10);
  if (inBerg(x, y, 30)) return;
  enemies.push({ kind, x, y, ang: side > 0 ? Math.PI : 0, spd: S.patrol, state: 'patrol', lungeT: 0, cool: 0, chompT: 0, wp: null, t: Math.random() * 10, home: x, warned: false, mem: 0, flank: Math.random() < 0.5 ? -1 : 1, alertT: 0, callCD: 0 });
}
// orcas are rare, and always come as a pack of three or four
function spawnOrcaPack() {
  const side = Math.random() < 0.7 ? 1 : -1, x = P.x + side * (W / 2 + 140 + Math.random() * 200);
  if (x < 8000 || x > WORLD_END - 80) return;
  const y = 60 + Math.random() * 100;
  const pack = { members: [], mem: 0 }, n = Math.random() < 0.3 ? 4 : 3;
  for (let i = 0; i < n; i++) {
    const e = { kind: 'orca', x: x + side * i * 34, y: y + (i % 2 ? 22 : -22) * Math.ceil(i / 2), ang: side > 0 ? Math.PI : 0, spd: ENEMY.orca.patrol, state: 'patrol', lungeT: 0, cool: 0, chompT: 0, wp: null, t: Math.random() * 10, home: x, warned: false, mem: 0, flank: 0, alertT: 0, pack, role: i };
    pack.members.push(e); enemies.push(e);
  }
  addText(P.x + side * 150, 30, 'ORCA PACK!', '#ff8a8a', 2);
}

// ---------------------------------------------------------------- penguin
const TURN_RATE = 7.5; // rad/s the penguin can swing its heading (seal 3, shark 1.75, orca 2.1)
const SWIM_DRAG = 2.5, DASH_IMPULSE = 235, DASH_T = 0.4, GRAV = 470, BREACH_BOOST = 1.22, R = 5;
const carryLimit = () => CARRY_LV[upCarry];
const loadFrac = () => P.carry ? clamp(fishKg(P.carry) / carryLimit(), 0, 1) : 0;
function mouseWorld() { return { x: cam.x - W / 2 + mouse.sx, y: cam.y - H / 2 + mouse.sy }; }

function hop(mw) {
  let dx = mw.x - P.x, dy = mw.y - P.y; const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const k = 1 - loadFrac() * 0.3;
  P.vx = dx * 200 * k; P.vy = Math.min(dy * 200, -110) * k;
  if (P.state === 'floe' && P.floe) P.y = floeTop(P.floe, time) - R - 3;
  P.state = 'air'; P.floe = null; SFX.hop();
}

function killPenguin(e) {
  P.killer = e ? e.kind : null; streak = 0; streakT = 0;
  P.state = 'dead'; P.deadT = 0; lives--; shake = 0.5;
  SFX.chomp();
  addText(P.x, P.y - 14, e && e.kind === 'crab' ? 'SNIP!' : 'CHOMP!', '#ff6f8a', 1.4);
  for (let i = 0; i < 14; i++) addPart(P.x, P.y, (Math.random() - 0.5) * 90, (Math.random() - 0.5) * 90, 1 + Math.random(), Math.random() < 0.5 ? '#ffffff' : SKINS[skinIdx].back, 'feather');
  for (let i = 0; i < 10; i++) addPart(P.x, P.y, (Math.random() - 0.5) * 40, -20 - Math.random() * 30, 1.5, '#dff4ff', 'bubble');
  if (P.carry) { addText(P.x, P.y - 24, 'LOST THE ' + fishName(P.carry), '#ffd0da', 1.6); P.carry = null; }
  if (e) { e.chompT = 0.6; e.cool = 2; if (!e.guard) e.state = 'patrol'; e.lungeT = 0; }
}

function updatePenguin(dt) {
  const mw = mouseWorld();
  const click = clickQueued; clickQueued = false;
  P.dashCD = Math.max(0, P.dashCD - dt); P.dashT = Math.max(0, P.dashT - dt); P.inv = Math.max(0, P.inv - dt);
  P.turnT = Math.max(0, P.turnT - dt); P.heavyT = Math.max(0, P.heavyT - dt);
  P.stun = Math.max(0, P.stun - dt); P.stunImm = Math.max(0, P.stunImm - dt); P.boost = Math.max(0, P.boost - dt);
  // flippers beat faster the harder the penguin swims
  P.anim += P.state === 'swim' ? dt * (0.5 + Math.hypot(P.vx, P.vy) / 110) : dt;

  if (P.state === 'dead') {
    P.deadT += dt;
    if (P.deadT > 1.8) {
      if (lives <= 0) { gameOver(); return; }
      P.x = PILE_X + 24; P.y = SHELF_Y - 7; P.vx = P.vy = 0; P.state = 'land'; P.inv = 2.2; P.trail = []; P.cave = null; P.flipT = 0; P.flipVis = 1;
      addText(P.x, P.y - 16, lives === 1 ? 'LAST LIFE!' : lives + ' LIVES LEFT', '#ffd23f', 1.6);
    }
    return;
  }

  const prevY = P.y, load = loadFrac();
  if (P.state === 'swim') {
    // top speed comes from the speed upgrade; a heavy fish drags it down
    // a jellyfish sting slows you right down; a bubble ring shoots you along
    const vmax = SPEED_LV[upSpeed] * (1 - 0.35 * load) * (P.stun > 0 ? 0.45 : 1) * (P.boost > 0 ? 1.5 : 1), acc = vmax * SWIM_DRAG;
    if (P.stun > 0 && Math.random() < dt * 14) addPart(P.x + (Math.random() - 0.5) * 12, P.y + (Math.random() - 0.5) * 10, 0, 0, 0.25, '#e6dcff', 'spark');
    if (P.boost > 0 && Math.random() < dt * 30) addPart(P.x - Math.cos(P.angle) * 9, P.y - Math.sin(P.angle) * 9, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, 0.8, '#dff4ff', 'bubble');
    let dx = mw.x - P.x, dy = mw.y - P.y; const d = Math.hypot(dx, dy);
    if (d > 3) {
      // bank: swing the velocity itself round toward the mouse (keeping most of the speed),
      // much faster than any predator can turn. Slower = even tighter. A hard reversal
      // whips round faster still and only bleeds a little speed - that's the juke.
      const sp = Math.hypot(P.vx, P.vy);
      if (sp > 4 && d > 6) {
        const cur = Math.atan2(P.vy, P.vx), da = angDiff(cur, Math.atan2(dy, dx));
        const rate = TURN_RATE * (1 + clamp(1 - sp / 220, 0, 1) * 0.6) * (Math.abs(da) > 1.6 ? 1.5 : 1) * (P.stun > 0 ? 0.5 : 1);
        const step = clamp(da, -rate * dt, rate * dt), ns = sp * (Math.abs(da) > 1.6 ? Math.exp(-0.9 * dt) : 1);
        P.vx = Math.cos(cur + step) * ns; P.vy = Math.sin(cur + step) * ns;
      }
      const k = acc * Math.min(1, d / 50);
      P.vx += dx / d * k * dt; P.vy += dy / d * k * dt;
    }
    if (click && P.dashCD <= 0 && P.stun <= 0) {
      let ux = dx, uy = dy, ud = d;
      if (ud < 8) { ux = P.vx; uy = P.vy; ud = Math.hypot(ux, uy) || 1; if (ud < 2) { ux = P.face; uy = 0; ud = 1; } }
      const imp = DASH_IMPULSE * (1 - 0.45 * load), keep = Math.hypot(P.vx, P.vy) * 0.6;
      P.vx = ux / ud * (keep + imp); P.vy = uy / ud * (keep + imp);
      const sp = Math.hypot(P.vx, P.vy), cap = 390 * (1 - 0.3 * load); if (sp > cap) { P.vx *= cap / sp; P.vy *= cap / sp; }
      P.dashCD = diff.dashCD; P.dashT = DASH_T; SFX.dash();
      for (let i = 0; i < 8; i++) addPart(P.x, P.y, -P.vx * 0.2 + (Math.random() - 0.5) * 40, -P.vy * 0.2 + (Math.random() - 0.5) * 40, 0.7, '#dff4ff', 'bubble');
    } else if (click && P.dashCD > 0) SFX.tone(160, 140, 0.05, 'square', 0.02);
    const drag = P.dashT > 0 ? 0.7 : SWIM_DRAG;
    P.vx *= Math.exp(-drag * dt); P.vy *= Math.exp(-drag * dt);
    P.x += P.vx * dt; P.y += P.vy * dt;
    P.bubT -= dt * Math.hypot(P.vx, P.vy) / 60;
    if (P.bubT <= 0) { P.bubT = 0.35; addPart(P.x - Math.cos(P.angle) * 8, P.y - Math.sin(P.angle) * 8, (Math.random() - 0.5) * 8, -12, 1.4, '#dff4ff', 'bubble'); }
    const n = groundCollide(P, R);
    if (n) { const vn = P.vx * n[0] + P.vy * n[1]; if (vn < 0) { P.vx -= n[0] * vn * 1.3; P.vy -= n[1] * vn * 1.3; } }
    if (P.x < R) { P.x = R; if (P.vx < 0) P.vx *= -0.3; }
    if (P.x > WORLD_END - R) { P.x = WORLD_END - R; if (P.vx > 0) P.vx *= -0.3; }
    const cave = inCave(P);
    if (cave && !P.cave) addText(P.x, P.y - 14, cave.seen ? 'THE CAVERN...' : 'A SUNKEN CAVERN! TREASURE... AND GUARDS', '#c08fff', 2.4);
    if (cave) cave.seen = true;
    P.cave = cave;
    if (P.y < 0) { // breach! momentum carries straight into the air, with a little kick
      P.state = 'air';
      if (P.vy < -40) P.vy = Math.max(P.vy * BREACH_BOOST, -440);
      if (Math.abs(P.vy) > 40) splash(P.x, Math.abs(P.vy));
    }
  } else if (P.state === 'air') {
    P.vy += GRAV * (1 + load * 0.25) * dt;
    const ax = clamp(mw.x - P.x, -1, 1) * 130;
    P.vx += ax * dt; P.vx *= Math.exp(-0.15 * dt);
    P.x += P.vx * dt; P.y += P.vy * dt;
    // a little forgiving at the shore's edge: a near miss still counts as a landing
    if (P.x < 6 && P.vy >= 0 && prevY + R <= SHELF_Y + 3 && P.y + R >= SHELF_Y) {
      P.x = Math.min(P.x, -1);
      P.state = 'land'; P.y = SHELF_Y - 7; P.vy = 0; P.vx = 0; SFX.land();
      for (let i = 0; i < 5; i++) addPart(P.x, SHELF_Y, (Math.random() - 0.5) * 40, -20 - Math.random() * 20, 0.5, '#ffffff', 'drop');
    } else if (P.x < R && P.y + R > SHELF_Y) { P.x = R; if (P.vx < 0) P.vx = 0; }
    if (P.state === 'air' && P.vy >= 0) {
      for (const f of floes) {
        if (Math.abs(P.x - f.x) > f.w / 2 + 5) continue;
        const top = floeTop(f, time);
        if (prevY + R <= top + 3 && P.y + R >= top) {
          P.state = 'floe'; P.floe = f; P.fx = clamp(P.x - f.x, -f.w / 2 + 1, f.w / 2 - 1); P.vx = P.vy = 0; SFX.land();
          for (let i = 0; i < 5; i++) addPart(P.x, top, (Math.random() - 0.5) * 40, -20 - Math.random() * 20, 0.5, '#ffffff', 'drop');
          break;
        }
      }
    }
    if (P.state === 'air' && P.y > 0 && P.vy > 0) { P.state = 'swim'; splash(P.x, Math.abs(P.vy)); P.vy *= 0.6; P.vx *= 0.85; }
    if (P.x > WORLD_END - R) { P.x = WORLD_END - R; P.vx = -Math.abs(P.vx) * 0.3; }
  } else if (P.state === 'land' || P.state === 'floe') {
    const dx = mw.x - P.x, nf = Math.sign(dx);
    if (Math.abs(dx) > 3) {
      if (nf !== P.face) P.turnT = 0.16; // turn through a front-facing pose
      P.face = nf;
      if (P.turnT <= 0) { if (P.state === 'land') P.x += nf * 58 * (1 - load * 0.4) * dt; else P.fx += nf * 42 * dt; }
    }
    if (P.state === 'land') {
      P.x = Math.max(P.x, SHELF_L + 20); P.y = SHELF_Y - 7;
      if (P.x > 1) { P.state = 'air'; P.vx = 30; P.vy = -40; P.y = SHELF_Y - R; }
    } else {
      const f = P.floe;
      P.x = f.x + P.fx; P.y = floeTop(f, time) - 7;
      if (Math.abs(P.fx) > f.w / 2 + 1) { P.state = 'air'; P.vx = Math.sign(P.fx) * 30; P.vy = -30; P.floe = null; }
    }
    if (click && (P.state === 'land' || P.state === 'floe')) hop(mw);
  }

  // icebergs: slippery and solid
  if (P.state === 'swim' || P.state === 'air') {
    for (const b of bergs) {
      const n = pushOutBerg(P, R, b);
      if (!n) continue;
      const vn = P.vx * n[0] + P.vy * n[1];
      if (vn < 0) { P.vx -= n[0] * vn * 1.15; P.vy -= n[1] * vn * 1.15; }
      if (P.y < 0) { P.vx += Math.sign(P.x - b.cx) * 260 * dt; if (P.vy < 0 && n[1] < -0.3) P.vy = Math.max(P.vy, 10); }
    }
    for (const f of floes) {
      const top = floeTop(f, time);
      if (P.state === 'air' && P.y + R < top + 2) continue;
      const n = pushOutRect(P, R, f.x - f.w / 2, top, f.x + f.w / 2, FLOE_BOTTOM);
      if (!n) continue;
      const vn = P.vx * n[0] + P.vy * n[1];
      if (vn < 0) { P.vx -= n[0] * vn; P.vy -= n[1] * vn; }
    }
  }

  // facing: in water and air the body rolls over to turn round instead of snapping
  if (P.state === 'swim' || P.state === 'air') {
    const sp = Math.hypot(P.vx, P.vy);
    if (sp > 6) { const target = Math.atan2(P.vy, P.vx); P.angle += angDiff(P.angle, target) * Math.min(1, dt * (P.state === 'air' ? 9 : 18)); P.face = Math.cos(P.angle) >= 0 ? 1 : -1; }
    const want = Math.cos(P.angle) < 0 ? -1 : 1;
    if (P.flipT > 0) { P.flipT += dt / 0.18; if (P.flipT >= 1) { P.flipT = 0; P.flipVis = P.flipTo; } }
    else if (want !== P.flipVis) { P.flipT = 0.001; P.flipTo = want; }
    P.trail.unshift({ x: P.x, y: P.y, a: P.angle }); if (P.trail.length > 8) P.trail.pop();
  } else { P.angle = P.face > 0 ? 0 : Math.PI; P.flipVis = P.face; P.flipT = 0; P.trail.length = 0; }

  deepest = Math.max(deepest, P.x);

  // grab fish (if you're strong enough to lift it)
  if (!P.carry && (P.state === 'swim' || P.state === 'air')) {
    const bx = P.x + Math.cos(P.angle) * 8, by = P.y + Math.sin(P.angle) * 8;
    for (let i = 0; i < fishes.length; i++) {
      const f = fishes[i];
      if (Math.hypot(f.x - bx, f.y - by) >= 6 + fishLen(f) * 0.3) continue;
      const kg = fishKg(f);
      if (kg > carryLimit()) {
        if (P.heavyT <= 0) { P.heavyT = 1.4; addText(P.x, P.y - 14, 'TOO HEAVY! ' + kg + 'KG (MAX ' + carryLimit() + 'KG)', '#ff9a9a', 1.4); SFX.tone(200, 120, 0.12, 'square', 0.03); }
        continue;
      }
      P.carry = { type: f.type, size: f.size, shiny: f.shiny }; fishes.splice(i, 1); SFX.grab(); onFishCaught(P.carry);
      const v = fishVal(P.carry);
      addText(P.x, P.y - 12, '+' + v + ' ' + fishName(P.carry), P.carry.shiny || v >= 20 ? '#ffd23f' : '#ffffff', 1.6);
      if (kg > carryLimit() * 0.6) addText(P.x, P.y - 20, 'HEAVY - ' + kg + 'KG', '#ffcf8a', 1.4);
      for (let k = 0; k < (P.carry.shiny ? 16 : 6); k++) addPart(bx, by, (Math.random() - 0.5) * 50, (Math.random() - 0.5) * 50, 0.6, '#ffe46a', 'spark');
      break;
    }
  }
  // drop the catch on the pile
  if (P.carry && P.state === 'land' && Math.abs(P.x - PILE_X) < 30) {
    // streak: keep bringing fish home without getting eaten and each one is worth more (up to x2)
    streak = streakT > 0 ? streak + 1 : 1; streakT = STREAK_TIME;
    const mult = 1 + Math.min(streak - 1, 4) * 0.25, v = Math.round(fishVal(P.carry) * mult);
    pile += v; pileFish.push(P.carry); onFishHome(P.carry, v); P.carry = null; SFX.deposit();
    addText(PILE_X, SHELF_Y - 34, '+' + v, '#ffd23f', 1.6);
    if (streak > 1) addText(PILE_X, SHELF_Y - 54, 'STREAK X' + mult, '#ff9a6e', 1.8);
    for (let k = 0; k < 14; k++) addPart(PILE_X, SHELF_Y - 10, (Math.random() - 0.5) * 80, -30 - Math.random() * 60, 1, ['#ffd23f', '#ff8fc4', '#9bd0ff'][k % 3], 'spark');
    if (pile > best) { best = pile; newBest = true; try { localStorage.setItem('pd_best', best); } catch (e) { } }
  }
}

function gameOver() { mode = 'over'; SFX.over(); onGameOver(); }

// ---------------------------------------------------------------- cavern guards
// Giant squid: hovers in its room, winds up, then lashes two long tentacles at where you were.
// Giant crab: scuttles along the room floor and snaps its claws, one at a time.
function updateGuard(e, dt, exposed) {
  const S = ENEMY[e.kind], room = e.room, c = e.cave, slow = diff.guard;
  const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
  const near = exposed && P.cave === c && Math.hypot(P.x - room.x, P.y - room.y) < room.r + 110;
  e.t += dt; e.chompT = Math.max(0, e.chompT - dt);
  if (e.kind === 'squid') {
    const hx = room.x + Math.cos(e.t * 0.4) * room.r * 0.3, hy = room.y + Math.sin(e.t * 0.53) * room.r * 0.22;
    const tx = near ? lerp(hx, P.x, 0.3) : hx, ty = near ? lerp(hy, P.y, 0.3) : hy;
    e.x = lerp(e.x, tx, Math.min(1, dt * 0.7)); e.y = lerp(e.y, ty, Math.min(1, dt * 0.7));
    const face = near ? Math.atan2(dy, dx) : (Math.cos(e.t * 0.25) > 0 ? -0.2 : Math.PI + 0.2);
    e.ang += clamp(angDiff(e.ang, face), -1.8 * dt, 1.8 * dt);
    e.headX = e.x + Math.cos(e.ang) * S.len * 0.42; e.headY = e.y + Math.sin(e.ang) * S.len * 0.42;
    e.atkT -= dt;
    if (e.atk === 'idle') { if (near && dist < S.reachMax + 30 && e.atkT <= 0) { e.atk = 'wind'; e.atkT = 0.75 * slow; SFX.tone(150, 80, 0.6, 'sawtooth', 0.03); } }
    else if (e.atk === 'wind') { e.aimX = P.x + P.vx * 0.12; e.aimY = P.y + P.vy * 0.12; if (e.atkT <= 0) { e.atk = 'lash'; e.atkT = 0.3; SFX.noise(0.22, 300, 1600, 0.07); } }
    else if (e.atk === 'lash') { if (e.atkT <= 0) { e.atk = 'recover'; e.atkT = 0.9 * slow; } }
    else if (e.atkT <= 0) { e.atk = 'idle'; e.atkT = (0.5 + Math.random() * 0.7) * slow; }
    e.ext = e.atk === 'lash' ? 1 - e.atkT / 0.3 : e.atk === 'recover' ? Math.max(0, e.atkT / (0.9 * slow)) : 0;
    if (e.ext > 0) {
      const ax = e.aimX - e.headX, ay = e.aimY - e.headY, al = Math.hypot(ax, ay) || 1, reach = Math.min(al + 12, S.reachMax) * e.ext;
      e.tipX = e.headX + ax / al * reach; e.tipY = e.headY + ay / al * reach;
      if (exposed && e.atk === 'lash') { const [qx, qy] = closestOnSeg(P.x, P.y, e.headX, e.headY, e.tipX, e.tipY); if (Math.hypot(P.x - qx, P.y - qy) < R + 3) killPenguin(e); }
    }
    if (exposed && P.state === 'swim' && dist < S.hb + R + 2) killPenguin(e);
  } else {
    const tx = near ? clamp(P.x, room.x - room.r * 0.6, room.x + room.r * 0.6) : room.x + Math.sin(e.t * 0.35) * room.r * 0.4;
    const sp = near ? 34 / slow : 14, mv = clamp(tx - e.x, -sp * dt, sp * dt);
    e.x += mv; if (Math.abs(mv) > 0.01) e.walk += dt * 9;
    e.y = lerp(e.y, floorAt(c, e.x, room.y) - 10, Math.min(1, dt * 8));
    for (const cl of e.claws) {
      cl.t -= dt;
      const ox = e.x + cl.side * 15, oy = e.y - 4;
      if (cl.st === 'rest') {
        cl.ext = lerp(cl.ext, 0, dt * 6); cl.open = lerp(cl.open, 0.2, dt * 4);
        cl.aim += angDiff(cl.aim, cl.side > 0 ? -0.7 : -Math.PI + 0.7) * Math.min(1, dt * 3);
        if (cl.t <= 0 && near && Math.hypot(P.x - ox, P.y - oy) < 88 && e.claws.every(o => o === cl || o.st === 'rest' || o.st === 'back')) { cl.st = 'raise'; cl.t = 0.5 * slow; }
      } else if (cl.st === 'raise') {
        cl.open = lerp(cl.open, 1, dt * 8); cl.ext = lerp(cl.ext, 0.15, dt * 5);
        cl.aim += angDiff(cl.aim, Math.atan2(P.y - oy, P.x - ox)) * Math.min(1, dt * 10);
        if (cl.t <= 0) { cl.st = 'snap'; cl.t = 0.18; SFX.tone(700, 240, 0.08, 'square', 0.04); }
      } else if (cl.st === 'snap') {
        const k = 1 - Math.max(0, cl.t) / 0.18; cl.ext = k; cl.open = 1 - k;
        if (cl.t <= 0) { cl.st = 'back'; cl.t = 0.5 * slow; SFX.noise(0.08, 2200, 900, 0.05); }
      } else if (cl.t <= 0) { cl.st = 'rest'; cl.t = (0.3 + Math.random() * 0.5) * slow; }
      else cl.ext = lerp(cl.ext, 0, dt * 4);
      const reach = 12 + cl.ext * 52;
      cl.x = ox + Math.cos(cl.aim) * reach; cl.y = oy + Math.sin(cl.aim) * reach;
      if (exposed && P.state === 'swim' && cl.st === 'snap' && Math.hypot(P.x - cl.x, P.y - cl.y) < 9) killPenguin(e);
    }
    if (exposed && P.state === 'swim' && Math.abs(P.x - e.x) < 18 && Math.abs(P.y - e.y) < 10) killPenguin(e);
  }
}

// ---------------------------------------------------------------- open-water predators
function updateEnemies(dt) {
  const exposed = P.state === 'swim' && P.inv <= 0, spdK = diff.enemySpd;
  // where will an airborne penguin splash down? (null if it is landing somewhere safe)
  let landX = null;
  if (P.state === 'air' && P.inv <= 0) {
    const t = (P.vy + Math.sqrt(Math.max(0, P.vy * P.vy + 2 * GRAV * Math.max(0, -P.y)))) / GRAV;
    landX = P.x + P.vx * t;
    if (landX < 650 || floes.some(f => Math.abs(landX - f.x) < f.w / 2 + 4)) landX = null;
  }
  // packs share what any one of them knows
  const packs = new Set();
  for (const e of enemies) if (e.pack) packs.add(e.pack);
  for (const pk of packs) { pk.mem = Math.max(0, pk.mem - dt); pk.members = pk.members.filter(m => enemies.includes(m)); }

  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i], S = ENEMY[e.kind];
    if (e.guard) {
      if (Math.abs(e.x - P.x) > 2600) { enemies.splice(i, 1); continue; }
      updateGuard(e, dt, exposed);
      continue;
    }
    if (CREATURES[e.kind]) { if (CREATURES[e.kind].update(e, dt) === false) enemies.splice(i, 1); if (P.state === 'dead' && e === enemies[i]) e.chompT = 0.6; continue; }
    e.t += dt; e.chompT = Math.max(0, e.chompT - dt); e.alertT = Math.max(0, (e.alertT || 0) - dt); e.callCD = Math.max(0, (e.callCD || 0) - dt);
    if (Math.abs(e.x - P.x) > 1300) { enemies.splice(i, 1); continue; }
    const dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy) || 1;
    const sees = exposed && !P.cave && dist < S.sight * (e.alertT > 0 ? 1.4 : 1);
    e.mem = sees ? 2.2 : Math.max(0, (e.mem || 0) - dt);
    if (sees && e.pack) e.pack.mem = 3;
    const hunting = exposed && !P.cave && (sees || e.mem > 0 || (e.pack && e.pack.mem > 0));
    // a shark that spots you calls every predator nearby to come and look
    if (S.caller && sees && e.callCD <= 0) {
      e.callCD = 1.6;
      let called = 0;
      for (const o of enemies) {
        if (o === e || o.guard || CREATURES[o.kind] || Math.hypot(o.x - e.x, o.y - e.y) > diff.alert) continue;
        if (!(o.alertT > 0) && o.state !== 'chase') { addText(o.x, o.y - 14, '?!', '#ff9a6e', 0.9); called++; }
        o.alertT = 6; o.alertX = P.x; o.alertY = P.y;
      }
      addPart(e.x, e.y, 0, 0, 0.9, '#ff6f7e', 'ring');
      if (called) SFX.tone(110, 70, 0.4, 'sine', 0.06);
    }
    let tx, ty, want;
    if (e.lungeT > 0) {
      e.lungeT -= dt; want = S.lunge;
      tx = P.x; ty = P.y;
      e.minD = Math.min(e.minD || 999, Math.hypot(P.x - e.x, P.y - e.y));
      if (e.lungeT <= 0) {
        e.cool = 0.95; e.state = 'patrol';
        if (P.state === 'swim' && e.minD < 40) { addText(P.x, P.y - 16, 'JUKED!', '#7be0b8', 0.9); SFX.tone(500, 900, 0.08, 'triangle', 0.03); }
        e.minD = 999;
      }
    } else if (e.cool > 0) {
      e.cool -= dt; want = S.patrol * 0.7;
      tx = e.x + Math.cos(e.ang) * 50; ty = e.y + Math.sin(e.ang) * 50;
    } else if (hunting) {
      if (e.state !== 'chase' && !e.warned) { e.warned = true; addText(e.x, e.y - 14, '!', '#ff4f6d', 0.8); }
      e.state = 'chase'; want = S.chase;
      const lead = clamp(dist / S.chase, 0, 0.9); // aim at where the penguin is going to be
      tx = P.x + P.vx * lead; ty = P.y + P.vy * lead;
      if (e.pack && dist > 70) {
        // pack roles: one drives straight in, two box you in from above and below, one cuts ahead
        const sp = Math.hypot(P.vx, P.vy) || 1, px = -P.vy / sp, py = P.vx / sp;
        if (e.role === 1) { tx += px * 60; ty += py * 60; }
        else if (e.role === 2) { tx -= px * 60; ty -= py * 60; }
        else if (e.role === 3) { tx += P.vx * 0.8; ty += P.vy * 0.8; }
        ty = Math.max(ty, S.minY + 4);
      } else if (S.smart && dist > 55) { // seals swing wide and come in from the side
        const off = Math.min(45, dist * 0.35) * e.flank;
        tx += -dy / dist * off; ty += dx / dist * off;
      }
      if (dist < S.lungeRange && Math.abs(angDiff(e.ang, Math.atan2(dy, dx))) < 0.5) { e.lungeT = 0.5; e.state = 'lunge'; SFX.lunge(); }
    } else if (e.alertT > 0) {
      // answering a shark's call: head for where you were seen
      e.state = 'alerted'; want = S.chase * 0.95;
      tx = e.alertX; ty = clamp(e.alertY, S.minY + 6, bed(e.alertX) - 14);
      if (Math.hypot(tx - e.x, ty - e.y) < 40) e.alertT = Math.min(e.alertT, 1.2);
    } else if (landX !== null && Math.abs(landX - e.x) < S.sight * (S.smart ? 1.8 : 1.2)) {
      e.state = 'ambush'; want = S.chase * (S.smart ? 1 : 0.8);
      tx = landX; ty = S.minY + (S.smart ? 8 : 20);
    } else {
      e.state = 'patrol'; e.warned = false; want = S.patrol;
      const lead = e.pack && e.pack.members[0];
      if (P.state !== 'dead' && P.state !== 'swim' && dist < S.sight * 1.5 && P.x > 600) {
        const rad = S.smart ? 30 : 70;
        tx = P.x + Math.sin(e.t * (S.smart ? 1.2 : 0.7) + e.home) * rad;
        ty = clamp((S.smart ? 18 : 45) + Math.sin(e.t) * 8, S.minY + 4, bed(P.x) - 14);
      } else if (lead && lead !== e) { // pack formation behind the leader
        const side = e.role % 2 ? 1 : -1;
        tx = lead.x - Math.cos(lead.ang) * 30 * Math.ceil(e.role / 2) + Math.sin(lead.ang) * 22 * side;
        ty = lead.y - Math.sin(lead.ang) * 30 * Math.ceil(e.role / 2) - Math.cos(lead.ang) * 22 * side;
        want = S.patrol * 1.15;
      } else {
        if (!e.wp || Math.hypot(e.wp[0] - e.x, e.wp[1] - e.y) < 20) {
          const wx = Math.max(700, e.home + (Math.random() - 0.5) * 400);
          e.wp = [wx, S.minY + 10 + Math.random() * Math.max(10, Math.min(bed(wx) - 24, 300) - S.minY - 10)];
        }
        [tx, ty] = e.wp;
      }
    }
    want *= spdK;
    if (!e.lungeT && (e.state === 'chase' || e.state === 'alerted' || e.state === 'ambush')) want = Math.min(want, SPEED_LV[upSpeed] * (e.kind === 'orca' ? 1.06 : 1) * Math.min(1, spdK));
    const turn = e.lungeT > 0 ? S.turn * 0.35 : S.turn;
    e.ang += clamp(angDiff(e.ang, Math.atan2(ty - e.y, tx - e.x)), -turn * dt, turn * dt);
    e.spd = lerp(e.spd, want, Math.min(1, dt * (e.lungeT > 0 ? 6 : 1.8)));
    e.x += Math.cos(e.ang) * e.spd * dt; e.y += Math.sin(e.ang) * e.spd * dt;
    if (e.y < S.minY) { e.y = S.minY; if (Math.sin(e.ang) < 0) e.ang = Math.atan2(Math.abs(Math.sin(e.ang)) * 0.3, Math.cos(e.ang)); }
    const by = bed(e.x) - S.hb - 3;
    if (e.y > by) { e.y = by; if (Math.sin(e.ang) > 0) e.ang = Math.atan2(-0.3, Math.cos(e.ang)); }
    if (e.x < 650) { e.x = 650; e.ang = angDiff(0, e.ang) > 0 ? 0.3 : -0.3; e.wp = null; }
    for (const b of bergs) {
      const n = pushOutBerg(e, S.hb + 2, b);
      if (n) { const tang = Math.atan2(n[0], -n[1]); e.ang += angDiff(e.ang, Math.cos(angDiff(tang, e.ang)) > 0 ? tang : tang + Math.PI) * Math.min(1, dt * 6); }
    }
    if (exposed) {
      const reach = S.len * 0.42, mx = e.x + Math.cos(e.ang) * reach, my = e.y + Math.sin(e.ang) * reach;
      if (Math.hypot(P.x - mx, P.y - my) < R + S.hb * 0.7) killPenguin(e);
    }
  }
}

// ---------------------------------------------------------------- fish
function updateFish(dt) {
  for (let i = fishes.length - 1; i >= 0; i--) {
    const f = fishes[i], T = FISH[f.type];
    f.t += dt;
    if (Math.abs(f.x - P.x) > (f.cave ? 2400 : 1000)) { fishes.splice(i, 1); continue; }
    const dx = f.x - P.x, dy = f.y - P.y, d = Math.hypot(dx, dy);
    let want = T.speed * 0.45;
    if (d < 48 && P.state === 'swim') {
      f.ang += angDiff(f.ang, Math.atan2(dy, dx)) * Math.min(1, dt * 5); want = T.speed * 1.5;
    } else {
      f.wt -= dt;
      if (f.wt <= 0) { f.wt = 1 + Math.random() * 2.5; f.ang += (Math.random() - 0.5) * 1.6; }
      if (!f.cave) f.ang += angDiff(f.ang, Math.cos(f.ang) >= 0 ? 0 : Math.PI) * dt * 0.6;
    }
    if (f.room && Math.hypot(f.x - f.room.x, f.y - f.room.y) > f.room.r * 0.7) f.ang += angDiff(f.ang, Math.atan2(f.room.y - f.y, f.room.x - f.x)) * Math.min(1, dt * 4);
    if (!f.cave && T.val <= 3 && !(d < 48 && P.state === 'swim')) {
      let ax = 0, ay = 0, cx = 0, cy = 0, n = 0;
      for (const o of fishes) {
        if (o === f || o.type !== f.type) continue;
        const ox = o.x - f.x, oy = o.y - f.y, od = ox * ox + oy * oy;
        if (od > 34 * 34) continue;
        ax += Math.cos(o.ang); ay += Math.sin(o.ang); cx += ox; cy += oy; n++;
        if (od < 36) { f.x -= ox * dt * 2; f.y -= oy * dt * 2; } // personal space
      }
      if (n) {
        const want2 = Math.atan2(ay / n + cy / n * 0.03, ax / n + cx / n * 0.03);
        f.ang += angDiff(f.ang, want2) * Math.min(1, dt * 1.6);
      }
    }
    f.spd = lerp(f.spd || want, want, Math.min(1, dt * 3));
    f.x += Math.cos(f.ang) * f.spd * dt; f.y += Math.sin(f.ang) * f.spd * dt;
    if (f.cave) {
      const [dd, cx, cy] = tunnelDepth(f.cave, f.x, f.y);
      if (dd < 4) { const l = Math.hypot(cx - f.x, cy - f.y) || 1; f.x += (cx - f.x) / l * (4 - dd); f.y += (cy - f.y) / l * (4 - dd); f.ang = Math.atan2(cy - f.y, cx - f.x); }
      continue;
    }
    if (f.y < 10) { f.y = 10; f.ang = Math.atan2(0.4, Math.cos(f.ang)); }
    const by = bed(f.x) - 6;
    if (f.y > by) { f.y = by; f.ang = Math.atan2(-0.4, Math.cos(f.ang)); }
    if (f.x < 500) { f.x = 500; f.ang = 0; }
    for (const b of bergs) { const n = pushOutBerg(f, 3, b); if (n) f.ang = Math.atan2(n[1], n[0]); }
  }
}

// ---------------------------------------------------------------- update
function updatePlay(dt) {
  playT += dt;
  updatePenguin(dt);
  if (mode !== 'play') return;
  updateEnemies(dt);
  updateFish(dt);
  updateParts(dt);

  spawnT -= dt;
  if (spawnT <= 0) {
    spawnT = 0.6;
    const roamers = enemies.filter(e => !e.guard && !e.pack && !CREATURES[e.kind]).length;
    spawnCreatures();
    if (roamers < enemyCap(P.x)) spawnEnemy();
    const packs = new Set(enemies.filter(e => e.pack).map(e => e.pack)).size;
    if (!P.cave && P.x > 8000 && packs < (P.x > 15000 ? 2 : 1) && Math.random() < 0.022 * diff.cap) spawnOrcaPack();
  }
  fishT -= dt;
  if (fishT <= 0) {
    fishT = 0.5;
    const cap = P.x < 1500 ? 3 : P.x < 3500 ? 7 : P.x < 7000 ? 11 : 15;
    if (fishes.filter(f => !f.cave).length < cap) spawnFish();
    stockCaves();
    stockAmbush();
  }
  updateRings(dt);
  streakT = Math.max(0, streakT - dt);

  // camera leads the momentum a little
  const tx = P.x + P.vx * 0.22, ty = P.y * 0.92 + P.vy * 0.1;
  cam.x = lerp(cam.x, tx, Math.min(1, dt * 4.5)); cam.y = lerp(cam.y, ty, Math.min(1, dt * 4.5));
  cam.x = clamp(cam.x, SHELF_L + W / 2 + 10, WORLD_END + 60 - W / 2);
  cam.y = clamp(cam.y, -330 + H / 2, Math.max(bed(cam.x), P.y) + 70 - H / 2);
  shake = Math.max(0, shake - dt);
}

// bubble rings: swim through one for a burst of speed and a fresh dash
function updateRings(dt) {
  if (P.x > 800 && !P.cave && rings.filter(r => Math.abs(r.x - P.x) < 900).length < 3 && Math.random() < dt * 0.5) {
    const x = P.x + (Math.random() < 0.7 ? 1 : -1) * (W / 2 + 40 + Math.random() * 300);
    const y = 25 + Math.random() * Math.max(20, Math.min(bed(x) - 40, 240) - 25);
    if (x < WORLD_END - 40 && !inBerg(x, y, 20)) rings.push({ x, y, t: Math.random() * 6, ang: (Math.random() - 0.5) * 0.8 });
  }
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt; r.y += Math.sin(r.t * 1.3) * 4 * dt;
    if (Math.abs(r.x - P.x) > 1200) { rings.splice(i, 1); continue; }
    if (P.state === 'swim' && Math.hypot(P.x - r.x, P.y - r.y) < 9) {
      P.boost = 2.2; P.dashCD = 0; P.stun = 0;
      addText(r.x, r.y - 14, 'BOOST!', '#9ff6ff', 1);
      SFX.tone(700, 1400, 0.12, 'triangle', 0.04); SFX.tone(1050, 2100, 0.15, 'triangle', 0.03, 0.06);
      for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; addPart(r.x + Math.cos(a) * 4, r.y + Math.sin(a) * 9, Math.cos(a) * 40, Math.sin(a) * 40 - 10, 1, '#dff4ff', 'bubble'); }
      rings.splice(i, 1);
    }
  }
}

function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.life -= dt;
    if (p.life <= 0) { parts.splice(i, 1); continue; }
    if (p.kind === 'ripple' || p.kind === 'ring') continue;
    if (p.kind === 'bubble') { p.vy -= 30 * dt; p.vx *= 0.96; if (p.y < 1) { parts.splice(i, 1); continue; } }
    else if (p.kind === 'drop') { p.vy += 380 * dt; if (p.y > 1 && p.vy > 0) { parts.splice(i, 1); continue; } }
    else if (p.kind === 'feather') { p.vx *= 0.94; p.vy = p.vy * 0.94 + (p.y < 0 ? 40 : -6) * dt; }
    else { p.vx *= 0.92; p.vy *= 0.92; }
    p.x += p.vx * dt; p.y += p.vy * dt;
  }
  for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y -= 14 * dt; if (t.life <= 0) texts.splice(i, 1); }
}
