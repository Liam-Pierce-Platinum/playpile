// ONE TILE - pixel renderer. Everything is drawn into a small low-res buffer (1 px = 1 game pixel)
// which main.js scales up by a whole number with nearest-neighbour. Palette: Endesga 32.
import { tile, guardAt, camAt, laserOn, DIR8, isHide } from './sim.js';

export const T = 16;
export const PAL = {
  rust: '#be4a2f', orange2: '#d77643', sand: '#ead4aa', tan: '#e4a672', brown: '#b86f50', dbrown: '#733e39', plum: '#3e2731',
  dred: '#a22633', red: '#e43b44', orange: '#f77622', gold: '#feae34', yellow: '#fee761', green: '#63c74d', dgreen: '#3e8948',
  forest: '#265c42', teal: '#193c3e', blue: '#124e89', sky: '#0099db', cyan: '#2ce8f5', white: '#ffffff', lgrey: '#c0cbdc',
  grey: '#8b9bb4', slate: '#5a6988', navy: '#3a4466', dnavy: '#262b44', black: '#181425', hot: '#ff0044', purple: '#68386c',
  pink: '#b55088', salmon: '#f6757a', skin: '#e8b796', skin2: '#c28569',
};

export const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; return [c, x]; };
const hash = (x, y, s = 0) => { let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
export const R = (b, x, y, w, h, c) => { b.fillStyle = c; b.fillRect(x | 0, y | 0, w, h); };

// ---------- tiny 3x5 digit font (for step numbers on the board) ----------
const DIG = {
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001',
  5: '111100111001111', 6: '111100111101111', 7: '111001010010010', 8: '111101111101111', 9: '111101111001111',
};
export function digits(b, str, x, y, c, outline = PAL.black) {
  str = String(str); const w = str.length * 4 - 1;
  const each = (fn) => { for (let i = 0; i < str.length; i++) { const g = DIG[str[i]]; if (!g) continue; for (let p = 0; p < 15; p++) if (g[p] === '1') fn(x + i * 4 + (p % 3), y + ((p / 3) | 0)); } };
  if (outline) { b.fillStyle = outline; each((px, py) => b.fillRect(px - 1, py - 1, 3, 3)); }
  b.fillStyle = c; each((px, py) => b.fillRect(px, py, 1, 1));
  return w;
}

// ---------- sprites from pixel maps ----------
const KEY = {
  k: PAL.black, h: PAL.dnavy, s: PAL.skin, S: PAL.skin2, w: PAL.white, x: PAL.dnavy, p: PAL.navy, f: PAL.black, e: PAL.white,
  t: PAL.tan, T: PAL.brown, c: PAL.blue, C: PAL.teal, u: PAL.blue, U: PAL.navy, n: PAL.dnavy, y: PAL.gold, g: PAL.lgrey, r: PAL.red,
};
function sprite(rows, map = KEY) {
  const [c, x] = mk(rows[0].length, rows.length);
  rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = map[r[i]]; if (col) { x.fillStyle = col; x.fillRect(i, j, 1, 1); } } });
  return c;
}
function flip(c) { const [o, x] = mk(c.width, c.height); x.translate(c.width, 0); x.scale(-1, 1); x.drawImage(c, 0, 0); return o; }
function tint(c, col, a = 1) { const [o, x] = mk(c.width, c.height); x.drawImage(c, 0, 0); x.globalCompositeOperation = 'source-in'; x.globalAlpha = a; x.fillStyle = col; x.fillRect(0, 0, c.width, c.height); return o; }

// Thief: cat burglar, beanie + eye mask, striped shirt, swag sack. 12 x 15, feet on the last row.
const TH_D = [
  '....kkkk....',
  '...khhhhk...',
  '..khhhhhhk..',
  '..khhhhhhk..',
  '..kssssssk..',
  '..khehhehk..',
  '..kssSSssk..',
  '...kssssk.tk',
  '..kwwwwwwktT',
  '.kxxxxxxxxtT',
  '.kwwwwwwwwkk',
  '.skxxxxxxks.',
  '..kppppppk..',
];
const TH_U = [
  '....kkkk....',
  '...khhhhk...',
  '..khhhhhhk..',
  '..khhhhhhk..',
  '..khhhhhhk..',
  '..khhhhhhk..',
  '..kSssssSk..',
  '.kkttttttkk.',
  'ktTttttttTtk',
  'ktTTttttTTtk',
  'kwkTTTTTTkwk',
  '.skxxxxxxks.',
  '..kppppppk..',
];
const TH_R = [
  '....kkkk....',
  '...khhhhk...',
  '..khhhhhhk..',
  '..khhhhhhk..',
  '..kssssssk..',
  '..khhhhhek..',
  '..kssssssSk.',
  '.kk.kssssk..',
  'ktTkwwwwwk..',
  'ktTkxxxxxks.',
  'kTTkwwwwwk..',
  '.kkkxxxxxk..',
  '...kppppk...',
];
const LEGS_FB = [['..kpk..kpk..', '..kfk..kfk..'], ['..kpk...kpk.', '..kfk...kfk.'], ['.kpk...kpk..', '.kfk...kfk..']];
const LEGS_S = [['...kpkkpk...', '...kfkkfk...'], ['..kpk..kpk..', '..kfk...kfk.'], ['...kpkpk....', '...kfkfk....']];

// Guard: blue uniform, peaked cap with gold badge, torch. 12 x 15.
const GU_D = [
  '...kkkkkk...',
  '..kccccccck.',
  '..kccyyccck.',
  '.kCCCCCCCCk.',
  '..kssssssk..',
  '..kskssksk..',
  '..kssSSssk..',
  '..kkssssk...',
  '.kuuuuuuuuk.',
  '.kuuuyuuuuk.',
  'skuuuuuuuuks',
  '.kUUUUUUUUk.',
  '..knnnnnnk..',
];
const GU_U = [
  '...kkkkkk...',
  '..kccccccck.',
  '..kccccccck.',
  '..kccccccck.',
  '..kSSSSSSk..',
  '..kSSSSSSk..',
  '..kSssssSk..',
  '..kkssssk...',
  '.kuuuuuuuuk.',
  '.kuuuuuuuuk.',
  'skuUuuuuUuks',
  '.kUUUUUUUUk.',
  '..knnnnnnk..',
];
const GU_R = [
  '...kkkkkk...',
  '..kccccccck.',
  '..kccccyyck.',
  '..kcccccCCCk',
  '..kSssssssk.',
  '..kSsssksk..',
  '..kSsssssSk.',
  '...kssssk...',
  '..kuuuuuuk..',
  '..kuuuuuyks.',
  '..kuuuuuuk..',
  '..kUUUUUUk..',
  '...knnnnk...',
];
const GL_FB = [['..knk..knk..', '..kfk..kfk..'], ['..knk...knk.', '..kfk...kfk.'], ['.knk...knk..', '.kfk...kfk..']];
const GL_S = [['...knkknk...', '...kfkkfk...'], ['..knk..knk..', '..kfk...kfk.'], ['...knknk....', '...kfkfk....']];

function body(top, legs) { return sprite(top.concat(legs)); }
const SPR = {};
export function buildSprites() {
  for (const [name, D, U, Rr, LF, LS] of [['th', TH_D, TH_U, TH_R, LEGS_FB, LEGS_S], ['gu', GU_D, GU_U, GU_R, GL_FB, GL_S]]) {
    for (let f = 0; f < 3; f++) {
      SPR[name + 'D' + f] = body(D, LF[f]); SPR[name + 'U' + f] = body(U, LF[f]);
      SPR[name + 'R' + f] = body(Rr, LS[f]); SPR[name + 'L' + f] = flip(SPR[name + 'R' + f]);
    }
  }
  for (const k of Object.keys(SPR)) { SPR[k + '_w'] = tint(SPR[k], PAL.white); SPR[k + '_r'] = tint(SPR[k], PAL.hot); }
}
export const getSpr = n => SPR[n];

// ---------- themes ----------
export const THEME = {
  bank: { card: PAL.navy, floorA: PAL.lgrey, floorB: '#b3bed2', grout: PAL.grey, vein: PAL.white, wallTop: PAL.navy, wallFace: PAL.dnavy, wallEdge: PAL.slate, trim: PAL.gold, rug: PAL.dred, rugB: PAL.gold, bg: PAL.black, name: 'BANK' },
  museum: { card: PAL.forest, floorA: PAL.brown, floorB: '#a9654a', grout: PAL.dbrown, vein: PAL.skin2, wallTop: PAL.forest, wallFace: PAL.teal, wallEdge: PAL.dgreen, trim: PAL.gold, rug: PAL.dred, rugB: PAL.red, bg: PAL.black, name: 'MUSEUM' },
  casino: { card: PAL.dred, floorA: PAL.purple, floorB: '#5e3360', grout: PAL.plum, vein: PAL.pink, wallTop: PAL.dred, wallFace: PAL.plum, wallEdge: PAL.red, trim: PAL.gold, rug: PAL.dnavy, rugB: PAL.gold, bg: PAL.black, name: 'CASINO' },
  penthouse: { card: PAL.blue, floorA: PAL.dbrown, floorB: '#6a3934', grout: PAL.plum, vein: PAL.brown, wallTop: PAL.black, wallFace: PAL.dnavy, wallEdge: PAL.navy, trim: PAL.sky, rug: PAL.sand, rugB: PAL.grey, bg: PAL.black, name: 'PENTHOUSE' },
};

const isWallCh = c => c === '#' || c === '@';
function floorTile(b, th, theme, x, y, px, py) {
  const v = hash(x, y);
  if (theme === 'bank') { // polished marble slabs, 2x2-tile pattern
    const alt = (x + y) % 2 === 0; R(b, px, py, T, T, alt ? th.floorA : th.floorB);
    R(b, px, py, T, 1, th.grout); R(b, px, py, 1, T, th.grout);
    if (v < 0.5) { b.fillStyle = alt ? '#d6deea' : '#c4cddd'; for (let i = 0; i < 6; i++) b.fillRect(px + 3 + i + ((v * 10) | 0) % 4, py + 4 + ((i * i) % 5) + ((v * 7) | 0), 1, 1); }
    if (alt) { R(b, px + 1, py + 1, 3, 1, PAL.white); R(b, px + 1, py + 1, 1, 2, PAL.white); }
  } else if (theme === 'museum') { // herringbone-ish parquet
    R(b, px, py, T, T, th.floorA);
    const o = (x % 2) * 4;
    for (let i = 0; i < 4; i++) { R(b, px, py + ((i * 4 + o) % 16), T, 1, th.grout); R(b, px + ((i * 7 + y * 5 + x * 3) % 16), py + i * 4, 1, 4, th.grout); }
    if (v < 0.4) R(b, px + 2 + ((v * 30) | 0) % 10, py + 6, 3, 1, th.vein);
  } else if (theme === 'casino') { // patterned carpet
    R(b, px, py, T, T, th.floorA);
    const c = (x + y) % 2 ? th.vein : PAL.dred;
    for (let i = 0; i < 4; i++) { R(b, px + 7 - i, py + 3 + i, 1, 1, c); R(b, px + 8 + i, py + 3 + i, 1, 1, c); R(b, px + 7 - i, py + 12 - i, 1, 1, c); R(b, px + 8 + i, py + 12 - i, 1, 1, c); }
    R(b, px + 7, py + 7, 2, 2, PAL.gold); R(b, px, py, 1, 1, PAL.gold); R(b, px + 15, py + 15, 1, 1, PAL.plum);
  } else { // penthouse walnut planks
    R(b, px, py, T, T, th.floorA);
    for (let i = 0; i < 4; i++) { R(b, px, py + i * 4 + 3, T, 1, th.grout); R(b, px + ((i * 5 + x * 7 + y * 3) % 13) + 1, py + i * 4, 1, 3, th.grout); }
    if (v < 0.5) R(b, px + 3, py + 1 + ((v * 8) | 0) * 1, 5, 1, th.vein);
  }
}
function rugTile(b, th, w, x, y, px, py) {
  R(b, px, py, T, T, th.rug);
  const isR = (xx, yy) => tile(w, xx, yy) === ',';
  if (!isR(x, y - 1)) R(b, px, py + 1, T, 1, th.rugB);
  if (!isR(x, y + 1)) R(b, px, py + 14, T, 1, th.rugB);
  if (!isR(x - 1, y)) R(b, px + 1, py, 1, T, th.rugB);
  if (!isR(x + 1, y)) R(b, px + 14, py, 1, T, th.rugB);
  if ((x + y) % 2) R(b, px + 6, py + 6, 4, 4, th.rugB);
}
const FACE = 6; // wall front-face height in px (three-quarter look)
function wallTile(b, th, theme, w, x, y, px, py) {
  const below = tile(w, x, y + 1), belowWall = isWallCh(below) || below === 'R' || below === 'B' || below === 'Y';
  R(b, px, py, T, T, th.wallTop);
  // inner pattern on wall tops
  if (theme === 'bank') { R(b, px + 2, py + 2, 12, 1, PAL.slate); }
  else if (theme === 'museum') { if ((x + y) % 2) R(b, px + 3, py + 3, 10, 1, '#2f6d4f'); }
  else if (theme === 'casino') { R(b, px, py + 7, T, 1, PAL.rust); }
  else { if (hash(x, y) < 0.3) R(b, px + 4, py + 5, 1, 1, PAL.navy); }
  const solid = (xx, yy) => { const t = tile(w, xx, yy); return isWallCh(t) || t === 'X'; };
  if (solid(x - 1, y) && solid(x + 1, y) && solid(x, y - 1) && solid(x, y + 1) && solid(x - 1, y - 1) && solid(x + 1, y + 1) && solid(x + 1, y - 1) && solid(x - 1, y + 1)) {
    b.fillStyle = th.wallEdge; for (let i = 0; i < 4; i++) b.fillRect(px + ((i * 4 + y * 2) % 16), py + i * 4 + 1, 2, 1);
  }
  // edges where the top meets the room
  const open = (xx, yy) => { const t = tile(w, xx, yy); return !(isWallCh(t) || t === 'R' || t === 'B' || t === 'Y' || t === 'X') && xx >= 0 && yy >= 0 && xx < w.W && yy < w.H; };
  if (open(x - 1, y)) R(b, px, py, 1, T, th.wallEdge);
  if (open(x + 1, y)) R(b, px + 15, py, 1, T, th.wallEdge);
  if (open(x, y - 1)) R(b, px, py, T, 1, th.wallEdge);
  if (!belowWall && y + 1 < w.H) { // front face
    R(b, px, py + T - FACE, T, FACE, th.wallFace);
    R(b, px, py + T - FACE, T, 1, th.trim);
    if (theme === 'penthouse') { for (let i = 0; i < 3; i++) if (hash(x, y, i) < 0.6) R(b, px + 2 + i * 5, py + T - 4, 2, 2, hash(x, y, i + 5) < 0.5 ? PAL.yellow : PAL.gold); }
    else if (theme === 'casino') { for (let i = 0; i < 4; i++) R(b, px + 2 + i * 4, py + T - 3, 1, 1, (i + x) % 2 ? PAL.gold : PAL.yellow); }
    else if (theme === 'museum') { R(b, px + 4, py + T - 4, 8, 2, PAL.forest); R(b, px + 5, py + T - 4, 6, 1, PAL.gold); }
    else { R(b, px, py + T - 2, T, 1, PAL.black); }
  }
}
function shadowBelow(b, w, x, y, px, py) {
  const up = tile(w, x, y - 1);
  if (isWallCh(up) || up === 'R' || up === 'B' || up === 'Y' || up === '$' || up === 'o') { b.fillStyle = 'rgba(24,20,37,0.35)'; b.fillRect(px, py, T, 3); b.fillStyle = 'rgba(24,20,37,0.18)'; b.fillRect(px, py + 3, T, 2); }
  const left = tile(w, x - 1, y); if (isWallCh(left)) { b.fillStyle = 'rgba(24,20,37,0.2)'; b.fillRect(px, py, 2, T); }
}

// static furniture
function pillar(b, theme, px, py, x, y) {
  if (theme === 'bank') { // marble column
    R(b, px + 2, py + 12, 12, 3, PAL.grey); R(b, px + 4, py - 2, 8, 15, PAL.lgrey); R(b, px + 5, py - 2, 1, 14, PAL.white); R(b, px + 9, py - 2, 1, 14, PAL.grey); R(b, px + 3, py - 4, 10, 3, PAL.white); R(b, px + 3, py - 2, 10, 1, PAL.grey); R(b, px + 2, py + 14, 12, 1, PAL.slate);
  } else if (theme === 'museum') { // bust on a plinth
    R(b, px + 3, py + 6, 10, 9, PAL.sand); R(b, px + 3, py + 6, 10, 1, PAL.white); R(b, px + 11, py + 7, 2, 8, PAL.tan); R(b, px + 3, py + 14, 10, 1, PAL.brown);
    R(b, px + 5, py - 1, 6, 7, PAL.lgrey); R(b, px + 4, py + 3, 8, 3, PAL.lgrey); R(b, px + 6, py - 3, 4, 3, PAL.lgrey); R(b, px + 6, py, 1, 1, PAL.slate); R(b, px + 9, py, 1, 1, PAL.slate); R(b, px + 9, py - 2, 2, 6, PAL.grey);
  } else if (theme === 'casino') { // slot machine
    R(b, px + 2, py - 3, 12, 18, PAL.dred); R(b, px + 2, py - 3, 12, 1, PAL.red); R(b, px + 3, py - 1, 10, 6, PAL.black);
    const sym = [PAL.gold, PAL.red, PAL.green]; for (let i = 0; i < 3; i++) R(b, px + 4 + i * 3, py + 1, 2, 2, sym[(i + x + y) % 3]);
    R(b, px + 3, py + 7, 10, 2, PAL.gold); R(b, px + 4, py + 10, 8, 3, PAL.plum); R(b, px + 14, py, 1, 6, PAL.lgrey); R(b, px + 14, py - 2, 2, 2, PAL.red); R(b, px + 2, py + 14, 12, 1, PAL.black);
  } else { // tall indoor tree in a planter
    R(b, px + 3, py + 9, 10, 6, PAL.dnavy); R(b, px + 3, py + 9, 10, 1, PAL.slate); R(b, px + 7, py + 3, 2, 7, PAL.dbrown);
    R(b, px + 2, py - 4, 12, 9, PAL.forest); R(b, px + 3, py - 5, 9, 3, PAL.dgreen); R(b, px + 4, py - 3, 3, 2, PAL.green); R(b, px + 9, py, 3, 2, PAL.dgreen);
  }
}
function table(b, theme, w, x, y, px, py) {
  const tt = (xx, yy) => tile(w, xx, yy) === 'T';
  const style = w.def.tStyle || theme;
  if (style === 'pool') {
    R(b, px, py, T, T, PAL.sky);
    if (!tt(x, y - 1)) { R(b, px, py, T, 3, PAL.lgrey); R(b, px, py + 3, T, 2, PAL.blue); }
    if (!tt(x, y + 1)) R(b, px, py + 14, T, 2, PAL.lgrey);
    if (!tt(x - 1, y)) R(b, px, py, 2, T, PAL.lgrey);
    if (!tt(x + 1, y)) R(b, px + 14, py, 2, T, PAL.lgrey);
    return;
  }
  if (style === 'museum') { // glass display case on a plinth (you can see through it)
    R(b, px + 1, py + 9, 14, 6, PAL.dbrown); R(b, px + 1, py + 9, 14, 1, PAL.brown);
    b.fillStyle = 'rgba(44,232,245,0.22)'; b.fillRect(px + 1, py, 14, 9);
    R(b, px + 1, py, 14, 1, PAL.cyan); R(b, px + 1, py, 1, 9, PAL.lgrey); R(b, px + 14, py, 1, 9, PAL.lgrey); R(b, px + 3, py + 1, 1, 6, PAL.white);
    const c = [PAL.gold, PAL.salmon, PAL.green, PAL.sky][(x * 3 + y) % 4]; R(b, px + 6, py + 5, 4, 4, c); R(b, px + 7, py + 4, 2, 1, c);
    return;
  }
  // a run of T tiles reads as one surface: bank desk, casino felt, penthouse sofa
  const top = { bank: PAL.dbrown, casino: PAL.dgreen, penthouse: PAL.tan }[style] || PAL.dbrown;
  const edge = { bank: PAL.brown, casino: PAL.dbrown, penthouse: PAL.skin2 }[style] || PAL.brown;
  R(b, px, py + 1, T, 13, top);
  if (!tt(x, y - 1)) R(b, px, py + 1, T, 2, edge);
  if (!tt(x, y + 1)) { R(b, px, py + 12, T, 3, edge); R(b, px, py + 15, T, 1, PAL.black); }
  if (!tt(x - 1, y)) R(b, px, py + 1, 2, 14, edge);
  if (!tt(x + 1, y)) R(b, px + 14, py + 1, 2, 14, edge);
  if (style === 'casino') { if ((x + y) % 2) { R(b, px + 5, py + 6, 3, 4, PAL.white); R(b, px + 6, py + 7, 1, 1, PAL.red); } else { R(b, px + 8, py + 5, 4, 2, PAL.red); R(b, px + 8, py + 7, 4, 2, PAL.black); } }
  else if (style === 'bank') { if ((x + y) % 2) { R(b, px + 4, py + 4, 6, 4, PAL.white); R(b, px + 5, py + 5, 4, 1, PAL.grey); } else { R(b, px + 9, py + 3, 2, 5, PAL.gold); R(b, px + 7, py + 3, 6, 2, PAL.forest); } }
  else { R(b, px + 2, py + 4, 12, 7, PAL.sand); R(b, px + 2, py + 4, 12, 1, PAL.white); R(b, px + 7, py + 4, 1, 7, PAL.tan); if ((x + y) % 3 === 0) R(b, px + 4, py + 6, 2, 2, PAL.salmon); }
}
function plant(b, px, py, x, y) {
  R(b, px + 4, py + 10, 8, 5, PAL.rust); R(b, px + 4, py + 10, 8, 1, PAL.orange2); R(b, px + 5, py + 15, 6, 1, PAL.dbrown);
  const leaf = [[2, 2], [6, -1], [10, 2], [4, 5], [8, 5], [1, 6], [11, 6], [6, 3]];
  for (const [lx, ly] of leaf) { R(b, px + lx, py + ly, 4, 4, PAL.dgreen); R(b, px + lx + 1, py + ly, 2, 1, PAL.green); }
  R(b, px + 3, py + 8, 10, 2, PAL.forest);
}
function locker(b, px, py) {
  R(b, px + 2, py - 4, 12, 19, PAL.slate); R(b, px + 2, py - 4, 12, 1, PAL.grey); R(b, px + 7, py - 4, 1, 19, PAL.navy); R(b, px + 13, py - 4, 1, 19, PAL.navy);
  for (let i = 0; i < 3; i++) { R(b, px + 3, py - 2 + i * 2, 3, 1, PAL.dnavy); R(b, px + 9, py - 2 + i * 2, 3, 1, PAL.dnavy); }
  R(b, px + 6, py + 5, 1, 2, PAL.gold); R(b, px + 8, py + 5, 1, 2, PAL.gold); R(b, px + 2, py + 14, 12, 1, PAL.black);
}

export function buildBackground(w, theme) {
  const th = THEME[theme];
  const [c, b] = mk(w.W * T, w.H * T);
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const ch = tile(w, x, y), px = x * T, py = y * T;
    if (isWallCh(ch)) continue;
    if (ch === ',') rugTile(b, th, w, x, y, px, py); else floorTile(b, th, theme, x, y, px, py);
    shadowBelow(b, w, x, y, px, py);
  }
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) { const ch = tile(w, x, y); if (isWallCh(ch)) wallTile(b, th, theme, w, x, y, x * T, y * T); }
  // exit doorway (always in the outer wall or a wall)
  return c;
}
// things with height are drawn sorted with the actors
export function staticProps(w) {
  const out = [];
  for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
    const ch = tile(w, x, y);
    if (ch === 'o' || ch === 'T' || ch === 'h' || ch === 'k') out.push({ x, y, ch });
  }
  return out;
}
export function drawProp(b, w, theme, p, ox, oy, time, hidingHere) {
  const px = ox + p.x * T, py = oy + p.y * T;
  if (p.ch === 'o') pillar(b, theme, px, py, p.x, p.y);
  else if (p.ch === 'T') table(b, theme, w, p.x, p.y, px, py);
  else if (p.ch === 'h') { if (hidingHere) { b.save(); b.translate(px + 8, py + 15); b.rotate(Math.sin(time * 18) * 0.04); b.translate(-px - 8, -py - 15); plant(b, px, py, p.x, p.y); b.restore(); } else plant(b, px, py, p.x, p.y); }
  else if (p.ch === 'k') locker(b, px, py);
}

// ---------- dynamic objects ----------
export function drawSafe(b, px, py, crack, need, open, time, cracking) {
  R(b, px + 1, py + 13, 14, 2, 'rgba(24,20,37,0.4)');
  R(b, px + 1, py - 2, 14, 16, PAL.slate); R(b, px + 1, py - 2, 14, 1, PAL.lgrey); R(b, px + 1, py - 1, 1, 14, PAL.grey); R(b, px + 14, py - 1, 1, 15, PAL.navy); R(b, px + 1, py + 13, 14, 1, PAL.dnavy);
  if (open) {
    R(b, px + 3, py, 10, 11, PAL.black); R(b, px + 4, py + 7, 8, 3, PAL.gold); R(b, px + 5, py + 6, 3, 1, PAL.yellow);
    R(b, px - 3, py - 1, 5, 13, PAL.grey); R(b, px - 3, py - 1, 5, 1, PAL.lgrey); R(b, px - 2, py + 4, 2, 2, PAL.navy);
    return;
  }
  R(b, px + 3, py, 10, 11, PAL.grey); R(b, px + 3, py, 10, 1, PAL.lgrey);
  // dial
  const cx = px + 8, cy = py + 5;
  R(b, cx - 3, cy - 3, 7, 7, PAL.dnavy); R(b, cx - 2, cy - 2, 5, 5, PAL.lgrey); R(b, cx - 1, cy - 1, 3, 3, PAL.white);
  const a = (cracking ? time * 14 : 0) + crack * 2.1;
  R(b, Math.round(cx + Math.cos(a) * 2), Math.round(cy + Math.sin(a) * 2), 1, 1, PAL.red);
  R(b, px + 11, py + 8, 2, 2, PAL.gold);
  // progress pips
  for (let i = 0; i < need; i++) R(b, px + 3 + i * 3, py + 11, 2, 1, i < crack ? PAL.green : PAL.dnavy);
}
// 3x5 letters for the EXIT sign
const LET = { E: '111100110100111', X: '101101010101101', I: '111010010010111', T: '111010010010010' };
function word(b, str, x, y, c) {
  for (let i = 0; i < str.length; i++) { const g = LET[str[i]]; for (let p = 0; p < 15; p++) if (g[p] === '1') R(b, x + i * 4 + (p % 3), y + ((p / 3) | 0), 1, 1, c); }
}
export function drawExit(b, px, py, ready, time) {
  // the getaway door: shut and locked (red sign) until the safe is cracked, then the two
  // halves slide apart, the sign turns green and an arrow bounces over it. Stand on it to win.
  const open = ready ? Math.min(1, 0.6 + 0.4 * Math.abs(Math.sin(time * 2))) : 0;
  R(b, px - 1, py - 1, T + 2, T + 2, PAL.black);                       // frame
  R(b, px, py, T, T, ready ? PAL.dgreen : PAL.dnavy);                  // the way out behind the doors
  if (ready) { const g = Math.floor(time * 4) % 2; R(b, px + 3, py + 3, 10, 10, g ? PAL.green : PAL.dgreen); R(b, px + 5, py + 5, 6, 6, PAL.yellow); }
  const slide = Math.round(open * 6);
  const leaf = (x, w) => { R(b, x, py, w, T, PAL.slate); R(b, x, py, w, 1, PAL.lgrey); R(b, x, py + T - 1, w, 1, PAL.navy); R(b, x + 1, py + 3, w - 2, 4, PAL.grey); };
  if (8 - slide > 0) { leaf(px, 8 - slide); leaf(px + 8 + slide, 8 - slide); }
  if (!ready) {                                                         // padlock on the seam
    R(b, px + 6, py + 7, 4, 1, PAL.gold); R(b, px + 5, py + 8, 1, 2, PAL.gold); R(b, px + 10, py + 8, 1, 2, PAL.gold);
    R(b, px + 5, py + 10, 6, 4, PAL.gold); R(b, px + 7, py + 11, 2, 2, PAL.dbrown);
  }
}
// drawn after the plan route so step numbers never cover it
export function drawExitSign(b, px, py, ready, time) {
  // lit EXIT sign above the door
  const sy = py - 9;
  R(b, px - 1, sy, 18, 8, PAL.black);
  R(b, px, sy + 1, 16, 6, ready ? PAL.forest : PAL.dred);
  word(b, 'EXIT', px + 1, sy + 2, ready ? (Math.floor(time * 3) % 2 ? PAL.white : PAL.yellow) : PAL.salmon);
  if (ready) {                                                          // bouncing arrow pointing at the door
    const ay = sy - 7 + Math.round(Math.abs(Math.sin(time * 5)) * -3);
    R(b, px + 6, ay, 4, 3, PAL.yellow); R(b, px + 4, ay + 3, 8, 1, PAL.yellow); R(b, px + 5, ay + 4, 6, 1, PAL.yellow); R(b, px + 7, ay + 5, 2, 1, PAL.yellow);
  }
}
const KCOL = { r: PAL.red, b: PAL.sky, y: PAL.gold };
export function drawDoor(b, px, py, color, open, unlocked) {
  const c = KCOL[color];
  R(b, px, py, T, T, PAL.dnavy);
  if (open) { R(b, px, py, 3, T, c); R(b, px + 13, py, 3, T, c); R(b, px + 3, py, 10, T, PAL.black); return; }
  R(b, px + 1, py, 14, T, c); R(b, px + 1, py, 14, 1, PAL.white); R(b, px + 7, py, 2, T, PAL.dnavy);
  R(b, px + 3, py + 5, 3, 4, PAL.black); R(b, px + 4, py + 6, 1, 1, unlocked ? PAL.green : PAL.red);
  R(b, px + 10, py + 5, 3, 4, PAL.black); R(b, px + 11, py + 6, 1, 1, unlocked ? PAL.green : PAL.red);
}
export function drawKeycard(b, px, py, color, time) {
  const bob = Math.round(Math.sin(time * 4 + px) * 1);
  R(b, px + 4, py + 12, 8, 2, 'rgba(24,20,37,0.35)');
  R(b, px + 3, py + 4 + bob, 10, 7, PAL.black); R(b, px + 4, py + 5 + bob, 8, 5, KCOL[color]); R(b, px + 4, py + 6 + bob, 8, 1, PAL.black); R(b, px + 5, py + 8 + bob, 3, 1, PAL.white);
  if (Math.floor(time * 2) % 3 === 0) R(b, px + 11, py + 4 + bob, 1, 1, PAL.white);
}
export function drawLoot(b, px, py, kind, time) {
  const bob = Math.round(Math.sin(time * 3 + px * 0.3) * 1);
  R(b, px + 4, py + 12, 8, 2, 'rgba(24,20,37,0.35)');
  if (kind === 'g') {
    const y = py + 3 + bob;
    R(b, px + 5, y, 6, 2, PAL.cyan); R(b, px + 4, y + 2, 8, 2, PAL.sky); R(b, px + 5, y + 4, 6, 2, PAL.blue); R(b, px + 6, y + 6, 4, 1, PAL.blue); R(b, px + 7, y + 7, 2, 1, PAL.navy);
    R(b, px + 6, y, 2, 1, PAL.white); R(b, px + 5, y + 2, 2, 1, PAL.white);
    const s = (time * 2 + px) % 3; if (s < 0.5) { R(b, px + 12, y - 1, 1, 3, PAL.white); R(b, px + 11, y, 3, 1, PAL.white); }
  } else {
    const y = py + 3 + bob;
    R(b, px + 4, y + 3, 8, 8, PAL.tan); R(b, px + 3, y + 5, 10, 5, PAL.tan); R(b, px + 5, y + 10, 6, 1, PAL.brown); R(b, px + 11, y + 4, 1, 6, PAL.brown);
    R(b, px + 6, y + 1, 4, 2, PAL.brown); R(b, px + 5, y, 6, 1, PAL.tan);
    const S$ = ['.111', '1...', '.11.', '...1', '111.']; S$.forEach((row, j) => { for (let i = 0; i < 4; i++) if (row[i] === '1') R(b, px + 6 + i, y + 4 + j, 1, 1, PAL.forest); }); R(b, px + 8, y + 3, 1, 7, PAL.forest);
  }
}
export function drawCamera(b, px, py, face, time, alert) {
  const [dx, dy] = DIR8[face];
  const cx = px + 8, cy = py + 8;
  R(b, cx - 3, cy - 3, 6, 6, PAL.dnavy); R(b, cx - 2, cy - 2, 4, 4, PAL.lgrey);
  // lens body pointing along facing
  for (let i = 1; i <= 4; i++) R(b, Math.round(cx - 1 + dx * i), Math.round(cy - 1 + dy * i), 3, 3, i === 4 ? PAL.black : PAL.grey);
  R(b, Math.round(cx + dx * 5), Math.round(cy + dy * 5), 1, 1, PAL.cyan);
  if (alert || Math.floor(time * 2) % 2) R(b, cx - 1, cy - 1, 2, 2, PAL.hot);
}

// ---------- vision cones and lasers ----------
export function drawCones(b, w, tm, ox, oy, time, onlyIdx = -1) {
  const cones = w.cones[((tm % w.P) + w.P) % w.P];
  cones.forEach((c, i) => {
    const next = onlyIdx === 'next';  // where the cones will be after your next step: red, no scan lines
    if (!next && onlyIdx >= 0 && i !== onlyIdx) return;
    const cam = i >= w.guards.length;
    const set = new Set(); for (let k = 0; k < c.length; k += 2) set.add(c[k] + ',' + c[k + 1]);
    const fill = next ? 'rgba(255,0,68,0.28)' : cam ? 'rgba(44,232,245,0.22)' : 'rgba(254,231,97,0.30)';
    const edge = next ? 'rgba(255,0,68,0.95)' : cam ? 'rgba(44,232,245,0.85)' : 'rgba(254,174,52,0.9)';
    for (let k = 0; k < c.length; k += 2) {
      const x = c[k], y = c[k + 1], px = ox + x * T, py = oy + y * T;
      b.fillStyle = fill; b.fillRect(px, py, T, T);
      // light scan lines so it reads as a beam over any floor
      b.fillStyle = cam ? 'rgba(255,255,255,0.10)' : 'rgba(255,255,255,0.12)';
      if (!next) for (let j = (Math.floor(time * 8) + x + y) % 4; j < T; j += 4) b.fillRect(px, py + j, T, 1);
      b.fillStyle = edge;
      if (!set.has(x + ',' + (y - 1))) b.fillRect(px, py, T, 1);
      if (!set.has(x + ',' + (y + 1))) b.fillRect(px, py + T - 1, T, 1);
      if (!set.has((x - 1) + ',' + y)) b.fillRect(px, py, 1, T);
      if (!set.has((x + 1) + ',' + y)) b.fillRect(px + T - 1, py, 1, T);
    }
  });
}
export function drawLasers(b, w, t, ox, oy, time) {
  for (const l of w.lasers) {
    const on = laserOn(l, t), soon = !on && laserOn(l, t + 1);
    const [x0, y0] = l.tiles[0], [x1, y1] = l.tiles[l.tiles.length - 1];
    const ax = ox + x0 * T + 8, ay = oy + y0 * T + 8, bx = ox + x1 * T + 8, by = oy + y1 * T + 8;
    // emitters just outside the run
    const ex = l.horiz ? 1 : 0, ey = l.horiz ? 0 : 1;
    const e1x = ax - ex * 9, e1y = ay - ey * 9, e2x = bx + ex * 9, e2y = by + ey * 9;
    for (const [qx, qy] of [[e1x, e1y], [e2x, e2y]]) { R(b, qx - 2, qy - 2, 5, 5, PAL.black); R(b, qx - 1, qy - 1, 3, 3, on ? PAL.hot : soon ? PAL.orange : PAL.dred); }
    if (l.horiz) {
      if (on) {
        b.fillStyle = 'rgba(255,0,68,0.22)'; b.fillRect(ax - 8, ay - 3, bx - ax + 16, 7);
        b.fillStyle = 'rgba(255,0,68,0.45)'; b.fillRect(ax - 8, ay - 1, bx - ax + 16, 3);
        R(b, ax - 8, ay, bx - ax + 16, 1, (Math.floor(time * 20) % 2) ? PAL.white : PAL.salmon);
      } else { b.fillStyle = soon ? 'rgba(247,118,34,0.9)' : 'rgba(162,38,51,0.55)'; for (let x = ax - 8; x < bx + 8; x += soon ? 2 : 4) b.fillRect(x, ay, 1, 1); }
    } else {
      if (on) {
        b.fillStyle = 'rgba(255,0,68,0.22)'; b.fillRect(ax - 3, ay - 8, 7, by - ay + 16);
        b.fillStyle = 'rgba(255,0,68,0.45)'; b.fillRect(ax - 1, ay - 8, 3, by - ay + 16);
        R(b, ax, ay - 8, 1, by - ay + 16, (Math.floor(time * 20) % 2) ? PAL.white : PAL.salmon);
      } else { b.fillStyle = soon ? 'rgba(247,118,34,0.9)' : 'rgba(162,38,51,0.55)'; for (let y = ay - 8; y < by + 8; y += soon ? 2 : 4) b.fillRect(ax, y, 1, 1); }
    }
  }
}

// ---------- characters ----------
// (px,py) = top-left of the tile they stand on. Sprites are 12x15 with feet at the bottom of the tile.
export function drawThief(b, px, py, face, frame, { alpha = 1, sack = 0, white = false, red = false, hide = false } = {}) {
  const s = SPR['th' + face + frame + (white ? '_w' : red ? '_r' : '')];
  b.globalAlpha = alpha * (hide ? 0.45 : 1);
  if (!white && !red) { b.fillStyle = 'rgba(24,20,37,0.35)'; b.fillRect(px + 3, py + 13, 10, 2); }
  b.drawImage(s, Math.round(px + 2), Math.round(py + 1));
  if (sack > 0 && !white && !red && face !== 'U') { // swag sack grows with loot
    const sx = face === 'L' ? px + 10 : face === 'R' ? px - 1 : px + 11, sy = py + 4;
    R(b, sx, sy - sack, 4, 3 + sack, PAL.black); R(b, sx + 1, sy + 1 - sack, 2, 1 + sack, PAL.tan);
  }
  b.globalAlpha = 1;
}
export function drawGuard(b, px, py, face, frame, look, { alert = false, time = 0 } = {}) {
  const s = SPR['gu' + face + frame];
  b.fillStyle = 'rgba(24,20,37,0.35)'; b.fillRect(px + 3, py + 13, 10, 2);
  b.drawImage(s, Math.round(px + 2), Math.round(py + 1));
  // head glance: shift the cap 1px toward where he is about to look
  if (look && look !== face) { const [lx] = DIR8[look]; if (lx) R(b, px + 2 + (lx > 0 ? 10 : 2), py + 4, 1, 2, PAL.black); }
  // torch beam stub
  const [dx, dy] = DIR8[face];
  const hx = px + 8 + dx * 5, hy = py + 10 + dy * 3;
  R(b, Math.round(hx - 1), Math.round(hy - 1), 3, 3, PAL.dnavy); R(b, Math.round(hx + dx * 2), Math.round(hy + dy * 2), 2, 2, PAL.yellow);
  if (alert) bubble(b, px + 8, py - 9, '!', time);
}
export function bubble(b, cx, cy, ch, time) {
  const j = Math.round(Math.sin(time * 30) * 1);
  R(b, cx - 4, cy - 6 + j, 9, 10, PAL.black); R(b, cx - 3, cy - 5 + j, 7, 8, ch === '!' ? PAL.hot : PAL.white);
  R(b, cx - 1, cy + 3 + j, 3, 2, PAL.black);
  if (ch === '!') { R(b, cx, cy - 4 + j, 1, 4, PAL.white); R(b, cx, cy + 1 + j, 1, 1, PAL.white); }
  else { R(b, cx - 1, cy - 4 + j, 3, 1, PAL.black); R(b, cx + 1, cy - 3 + j, 1, 2, PAL.black); R(b, cx, cy + 1 + j, 1, 1, PAL.black); }
}

// patrol route ghost dots (so loops are readable at a glance)
export function drawPatrols(b, w, ox, oy) {
  w.guards.forEach(g => {
    const seen = new Set();
    for (const f of g.frames) { const k = f.x + ',' + f.y; if (seen.has(k)) continue; seen.add(k); b.fillStyle = 'rgba(254,174,52,0.35)'; b.fillRect(ox + f.x * T + 7, oy + f.y * T + 7, 2, 2); }
  });
}

// a spinning gold coin (the real-time mode's pick-ups) and a soft glow under the big loot
export function drawCoin(b, px, py, time) {
  const ph = time * 5 + (px + py) * 0.11, half = Math.max(1, Math.round(Math.abs(Math.cos(ph)) * 3));
  const cx = px + 8, cy = py + 7 + Math.round(Math.sin(time * 3 + px * 0.2));
  R(b, px + 5, py + 13, 6, 1, 'rgba(24,20,37,0.35)');
  R(b, cx - half - 1, cy - 2, half * 2 + 2, 6, PAL.black); R(b, cx - half, cy - 3, half * 2, 8, PAL.black);
  R(b, cx - half, cy - 2, half * 2, 6, PAL.gold); R(b, cx - half, cy - 2, half * 2, 1, PAL.yellow);
  if (half >= 2) R(b, cx - 1, cy - 1, 1, 4, PAL.orange);
  if (((time * 1.3 + px * 0.13 + py * 0.07) % 3) < 0.18) { R(b, cx + half + 1, cy - 5, 1, 3, PAL.white); R(b, cx + half, cy - 4, 3, 1, PAL.white); }
}
export function drawGlow(b, px, py, time, col) {
  const rr = 8 + Math.sin(time * 4 + px) * 1.5;
  const g = b.createRadialGradient(px + 8, py + 8, 1, px + 8, py + 8, rr + 3); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
  b.fillStyle = g; b.fillRect(px - 5, py - 5, T + 10, T + 10);
}
