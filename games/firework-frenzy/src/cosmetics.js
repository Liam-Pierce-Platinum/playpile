// Rocket looks: the catalog (names, prices, unlocks) and the pixel data for every part.
// No DOM, so Node can load it too. render.js turns a "look" into a sprite and particles.

function hex(c) { const n = parseInt(c.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgb(r, g, b) { return '#' + ((1 << 24) | (Math.max(0, Math.min(255, r | 0)) << 16) | (Math.max(0, Math.min(255, g | 0)) << 8) | Math.max(0, Math.min(255, b | 0))).toString(16).slice(1); }
export function shade(c, f) { const [r, g, b] = hex(c); return f < 1 ? rgb(r * f, g * f, b * f) : rgb(r + (255 - r) * (f - 1), g + (255 - g) * (f - 1), b + (255 - b) * (f - 1)); }
export function hsl(h, s, l) {
  h = ((h % 360) + 360) % 360; const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return rgb((r + m) * 255, (g + m) * 255, (b + m) * 255);
}
const h3 = (x, y, f) => { let n = (x * 374761393 + y * 668265263 + f * 2147483647) | 0; n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };

// ---------- achievements ----------
export const ACH = {
  allclear: { name: 'CLEAR ALL 10 LEVELS' },
  chain10: { name: 'BURST A CHAIN OF 10' },
  far: { name: 'FLY 500M IN ENDLESS' },
  allstars: { name: '3-STAR EVERY LEVEL' },
};

// ---------- the catalog ----------
export const CATS = [['skin', 'BODY'], ['nose', 'NOSE'], ['fins', 'FINS'], ['flame', 'FLAME'], ['trail', 'TRAIL'], ['burst', 'BURST']];
export const CATALOG = {
  skin: [
    { id: 'classic', name: 'CLASSIC', price: 0, desc: 'RED, WHITE AND BLUE' },
    { id: 'candy', name: 'CANDY STRIPE', price: 100, desc: 'A SPINNING BARBER POLE' },
    { id: 'gold', name: 'SOLID GOLD', price: 150, desc: 'SHINES AS IT FLIES' },
    { id: 'chrome', name: 'CHROME', price: 200, desc: 'POLISHED TO A MIRROR' },
    { id: 'shark', name: 'SHARK', price: 250, desc: 'TEETH AND A DORSAL FIN' },
    { id: 'dragon', name: 'DRAGON', price: 300, desc: 'SCALES, SPINES, RED EYE' },
    { id: 'neon', name: 'NEON', price: 350, desc: 'GLOWS AND PULSES' },
    { id: 'galaxy', name: 'GALAXY', price: 450, desc: 'A SKY FULL OF STARS' },
    { id: 'prism', name: 'PRISM', price: 0, ach: 'allstars', desc: 'EVERY COLOUR AT ONCE' },
  ],
  nose: [
    { id: 'cone', name: 'CONE', price: 0, desc: 'THE CLASSIC POINT' },
    { id: 'needle', name: 'NEEDLE', price: 40, desc: 'LONG AND SHARP' },
    { id: 'dome', name: 'DOME', price: 60, desc: 'BLUNT AND ROUND' },
    { id: 'arrow', name: 'ARROWHEAD', price: 90, desc: 'BARBED TIP' },
    { id: 'crown', name: 'CROWN', price: 0, ach: 'allclear', desc: 'FOR THE SHOW RUNNER' },
  ],
  fins: [
    { id: 'swept', name: 'SWEPT', price: 0, desc: 'THE CLASSIC FINS' },
    { id: 'stubby', name: 'STUBBY', price: 40, desc: 'SHORT AND CUTE' },
    { id: 'delta', name: 'DELTA', price: 80, desc: 'BIG TRIANGLES' },
    { id: 'razor', name: 'RAZOR', price: 120, desc: 'LONG TRAILING BLADES' },
    { id: 'wings', name: 'WINGS', price: 160, desc: 'MID-BODY WINGS' },
  ],
  flame: [
    { id: 'classic', name: 'CLASSIC', price: 0, desc: 'HOT ORANGE FIRE' },
    { id: 'plasma', name: 'BLUE PLASMA', price: 80, desc: 'BURNS BLUE-WHITE' },
    { id: 'toxic', name: 'TOXIC', price: 80, desc: 'GLOWING GREEN' },
    { id: 'hearts', name: 'PIXEL HEARTS', price: 150, desc: 'PUFFS OF LOVE' },
    { id: 'sparkle', name: 'SPARKLER', price: 200, desc: 'WHITE-HOT TWINKLES' },
    { id: 'rainbow', name: 'RAINBOW', price: 300, desc: 'EVERY COLOUR' },
  ],
  trail: [
    { id: 'smoke', name: 'SMOKE', price: 0, desc: 'PURPLE SMOKE PUFFS' },
    { id: 'none', name: 'CLEAN', price: 0, desc: 'NO TRAIL AT ALL' },
    { id: 'puffs', name: 'CLOUD PUFFS', price: 50, desc: 'BIG WHITE PUFFS' },
    { id: 'bubbles', name: 'BUBBLES', price: 90, desc: 'FLOATING BUBBLES' },
    { id: 'stardust', name: 'STARDUST', price: 140, desc: 'TWINKLING DUST' },
    { id: 'ribbon', name: 'RIBBON', price: 200, desc: 'A PINK RIBBON' },
    { id: 'comet', name: 'COMET', price: 0, ach: 'far', desc: 'A BLAZING GOLD TAIL' },
  ],
  burst: [
    { id: 'classic', name: 'CLASSIC', price: 0, desc: 'EACH SHELL ITS COLOUR' },
    { id: 'ring', name: 'RINGS', price: 60, desc: 'DOUBLE RINGS' },
    { id: 'willow', name: 'GOLD WILLOW', price: 120, desc: 'LONG DRIPPING GOLD' },
    { id: 'heart', name: 'HEARTS', price: 150, desc: 'BURSTS INTO A HEART' },
    { id: 'smiley', name: 'SMILEY', price: 180, desc: 'A HAPPY FACE' },
    { id: 'glitter', name: 'GLITTER', price: 220, desc: 'CRACKLING SILVER' },
    { id: 'rainbow', name: 'RAINBOW', price: 280, desc: 'EVERY SPARK A COLOUR' },
    { id: 'supernova', name: 'SUPERNOVA', price: 0, ach: 'chain10', desc: 'BURSTS THAT BURST AGAIN' },
  ],
};
export const DEFAULT_LOOK = { skin: 'classic', nose: 'cone', fins: 'swept', flame: 'classic', trail: 'smoke', burst: 'classic' };
export const FREE = (it) => !it.ach && it.price === 0;
export function findItem(cat, id) { return (CATALOG[cat] || []).find((i) => i.id === id) || null; }

// ---------- rocket sprite: 7 wide x 15 tall ----------
// rows 0-2 nose, rows 3-10 body (3 px wide at cols 2-4), row 11 nozzle, rows 12-14 the stick.
// Fins sit beside the body. Each skin gives a palette (T tip, N/n nose, F/f fins, k nozzle) and a body pattern.
const C3 = (x, a, b, c) => x === 0 ? a : x === 1 ? b : c;
const tone3 = (x, c) => C3(x, shade(c, 1.3), c, shade(c, 0.62));
export const SKINS = {
  classic: {
    frames: 1, pal: { T: '#ffe066', N: '#ff5a5f', n: '#b8283a', F: '#ff9a3c', f: '#d0702a', k: '#3a3048' },
    body: (x, y) => { const k = 'WBWBWRRR'[y]; return k === 'W' ? (x < 2 ? '#fff6ea' : '#c9bcd6') : k === 'B' ? (x < 2 ? '#4fb0ff' : '#2a6ad0') : (x < 2 ? '#ff5a5f' : '#b8283a'); },
  },
  candy: {
    frames: 3, pal: { T: '#ffffff', N: '#ff4f6d', n: '#b8283a', F: '#ff8ab0', f: '#c0507a', k: '#4a2a3a' },
    body: (x, y, f) => (x + y + f) % 3 === 0 ? C3(x, '#ff7a90', '#ff4f6d', '#b8283a') : C3(x, '#ffffff', '#fff0f4', '#d8b8c8'),
  },
  gold: {
    frames: 14, pal: { T: '#ffffff', N: '#ffd23f', n: '#b8792a', F: '#e8a93a', f: '#9a6420', k: '#5a3a20' },
    body: (x, y, f) => {
      if (y === f || y === f - 1) return x < 2 ? '#ffffff' : '#fff3a0';
      if (y === 1 || y === 6) return C3(x, '#ffd23f', '#d89a2a', '#8a5a1a');
      return C3(x, '#fff3a0', '#ffd23f', '#b8792a');
    },
  },
  chrome: {
    frames: 14, pal: { T: '#ffffff', N: '#c9d4e8', n: '#6a7690', F: '#a8b4cc', f: '#5a6680', k: '#2e3448' },
    body: (x, y, f) => {
      if (x + y === f) return '#ffffff';
      if (y === 3) return C3(x, '#c9d4e8', '#9aa6c0', '#5a6680');
      return C3(x, '#e8eef8', '#c9d4e8', '#7a86a0');
    },
  },
  shark: {
    frames: 1, pal: { T: '#a8c4dc', N: '#7a9aba', n: '#3a5070', F: '#5a7a9a', f: '#3a5070', k: '#22303f' },
    body: (x, y) => {
      if (y === 0) return C3(x, '#ffffff', '#0b0716', '#4a6a8a');     // teeth + eye
      if (y === 1) return C3(x, '#e8f0f8', '#7a9aba', '#4a6a8a');
      if (y === 2 || y === 3) return C3(x, '#e8f0f8', '#2e4058', '#2e4058'); // gills
      return C3(x, '#e8f0f8', '#7a9aba', '#4a6a8a');
    },
    extra: (g) => { g[5][5] = '#5a7a9a'; g[6][5] = '#5a7a9a'; g[7][5] = '#3a5070'; g[7][6] = '#3a5070'; },
  },
  dragon: {
    frames: 1, pal: { T: '#e8e0c0', N: '#3fbf5a', n: '#1f6a34', F: '#d03a3a', f: '#8a1a2a', k: '#2a2a20' },
    body: (x, y) => {
      if (y === 0 && x === 1) return '#ff3b3b';                       // eye
      if (x === 0) return y % 2 ? '#ffe066' : '#e8b83a';              // belly plates
      if (x === 1) return y % 2 ? '#3fbf5a' : '#2a9a48';              // scales
      return '#1f6a34';
    },
    extra: (g) => { g[4][5] = '#d03a3a'; g[6][5] = '#d03a3a'; g[8][5] = '#d03a3a'; }, // back spines
  },
  neon: {
    frames: 8, pal: { T: '#ffffff', N: '#ff4fd8', n: '#a02a90', F: '#3fd0ff', f: '#2a8ad0', k: '#ff4fd8' },
    body: (x, y, f) => {
      const hi = f < 4;
      if (x === 0) return hi ? '#c8f8ff' : '#3fd0ff';
      if (x === 2) return hi ? '#3fd0ff' : '#2a8ad0';
      return (y + f) % 4 === 0 ? '#ff4fd8' : '#1a1030';
    },
  },
  galaxy: {
    frames: 8, pal: { T: '#ffffff', N: '#3a2a8a', n: '#1a0f4a', F: '#c77dff', f: '#7a2fd0', k: '#1a0f30' },
    body: (x, y, f) => {
      if (h3(x, y, f) > 0.86) return '#ffffff';
      const base = ['#5a3aaa', '#3a2a8a', '#2a1a6a', '#4a1f7a', '#6a2a8a', '#3a2080', '#2a1a6a', '#1a1050'][y];
      const c = h3(x + 5, y + 9, 0) < 0.28 ? '#c77dff' : base;
      return x === 2 ? shade(c, 0.65) : x === 0 ? shade(c, 1.15) : c;
    },
  },
  prism: {
    frames: 12, pal: (f) => ({ T: '#ffffff', N: hsl(f * 30, 0.9, 0.6), n: hsl(f * 30, 0.9, 0.35), F: hsl(f * 30 + 180, 0.9, 0.6), f: hsl(f * 30 + 180, 0.9, 0.38), k: '#2a2040' }),
    body: (x, y, f) => tone3(x, hsl(y * 40 + f * 30, 0.95, 0.58)),
  },
};
export const NOSES = {
  cone: ['...T...', '..NNn..', '..NNn..'],
  needle: ['...T...', '...N...', '..NNn..'],
  dome: ['.......', '..TNn..', '..NNn..'],
  arrow: ['...T...', '..NNn..', '.NNNnn.'],
  crown: ['..T.T..', '..TTT..', '..NNn..'],
};
const CROWN_GOLD = { T: '#ffd23f' };
export const FINS = {
  swept: [[9, '.F...f.'], [10, 'FF...ff'], [11, 'F.....f']],
  stubby: [[10, '.F...f.'], [11, '.F...f.']],
  delta: [[8, '.F...f.'], [9, '.F...f.'], [10, 'FF...ff'], [11, 'FF...ff'], [12, 'F.....f']],
  razor: [[9, '.F...f.'], [10, '.F...f.'], [11, 'F.....f'], [12, 'F.....f'], [13, 'F.....f']],
  wings: [[5, '.F...f.'], [6, 'FF...ff'], [7, 'F.....f'], [10, '.F...f.']],
};

export function skinFrames(look) { return (SKINS[look.skin] || SKINS.classic).frames; }
export function buildSprite(look, f = 0) {
  const sk = SKINS[look.skin] || SKINS.classic, pal = typeof sk.pal === 'function' ? sk.pal(f) : sk.pal;
  const g = Array.from({ length: 15 }, () => new Array(7).fill(null));
  for (let y = 0; y < 8; y++) for (let x = 0; x < 3; x++) g[3 + y][2 + x] = sk.body(x, y, f);
  for (let x = 2; x < 5; x++) g[11][x] = pal.k;
  g[12][3] = '#c9a070'; g[13][3] = '#c9a070'; g[14][3] = '#8a6a4a';
  const nose = NOSES[look.nose] || NOSES.cone, np = look.nose === 'crown' ? { ...pal, ...CROWN_GOLD } : pal;
  nose.forEach((row, j) => { for (let i = 0; i < 7; i++) if (row[i] !== '.') g[j][i] = np[row[i]]; });
  for (const [r, row] of FINS[look.fins] || FINS.swept) for (let i = 0; i < 7; i++) if (row[i] === 'F' || row[i] === 'f') g[r][i] = pal[row[i]];
  if (sk.extra) sk.extra(g, f);
  return g;
}

// ---------- flames ----------
export const FLAMES = {
  classic: { cols: ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f3c', '#b8283a', '#4a1430'], glow: '#ff9a3c' },
  plasma: { cols: ['#ffffff', '#e0f8ff', '#9de8ff', '#3fd0ff', '#2a7ad0', '#2a3a9a', '#141a50'], glow: '#3fa0ff' },
  toxic: { cols: ['#ffffff', '#f0ffc0', '#c8ff5c', '#9dff5c', '#3fbf3a', '#1f7a2a', '#0f3a1a'], glow: '#9dff5c' },
  hearts: { cols: ['#ffffff', '#ffe0ec', '#ffa8c8', '#ff6aa0', '#e83a7a', '#a01a50', '#4a0a2a'], glow: '#ff6aa0', shape: 'heart' },
  sparkle: { cols: ['#ffffff', '#ffffff', '#fff3a0', '#ffd23f', '#c9b8ff', '#8e7fb8', '#4a3e70'], glow: '#fff3a0', shape: 'star' },
  rainbow: { rainbow: true, cols: ['#ffffff', '#fff3a0', '#ffd23f', '#ff9a3c', '#ff4f3c', '#b8283a', '#4a1430'], glow: '#ff4fd8' },
};
export const RAINBOW_HUES = [0, 30, 55, 120, 195, 265, 310];
