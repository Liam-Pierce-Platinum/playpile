// Sprites: monsters come from the part-based creature engine (src/creature.js); this file
// caches them as canvases (+ a white hit-flash copy) and draws eggs and move icons.
// Every sprite: { cv, flash, w, h, ax, footY }. ax = body centre x, footY = ground row.
// Sprites face RIGHT; flip for left.
import { SPECIES_BY_ID, TYPES, RARITY } from './data.js';
import { Grid, hex2rgb, rgb2hex, mix, dk, lt } from './pix.js';
import { renderForm, FRAMES } from './creature.js';
export { Grid, hex2rgb, rgb2hex, mix, dk, lt, FRAMES };

const cache = new Map();
const formCache = new Map();
export function sprite(spId, stage, frame = 'idle0') {
  const key = spId + '|' + stage + '|' + frame;
  let s = cache.get(key);
  if (!s) {
    const fk = spId + '|' + stage;
    let F = formCache.get(fk);
    if (!F) { const sp = SPECIES_BY_ID[spId]; F = renderForm(sp.forms[stage], TYPES[sp.type].col, spId + stage); formCache.set(fk, F); }
    const g = F.frames[frame] || F.frames.idle0;
    s = { cv: g.toCanvas(), w: F.w, h: F.h, ax: F.ax, footY: F.footY };
    const f = document.createElement('canvas'); f.width = s.w; f.height = s.h;
    const fc = f.getContext('2d'); fc.drawImage(s.cv, 0, 0); fc.globalCompositeOperation = 'source-in'; fc.fillStyle = '#ffffff'; fc.fillRect(0, 0, s.w, s.h);
    s.flash = f;
    cache.set(key, s);
  }
  return s;
}

// A big crisp preview for menus: a fixed-size box (44*scale px square) with the sprite
// standing on its bottom edge, so cards line up whatever the creature's size class.
// Sprites bigger than the box are scaled down to fit.
export function portrait(spId, stage, scale = 3, frame = 'idle0') {
  const s = sprite(spId, stage, frame);
  const cv = document.createElement('canvas'); cv.width = s.w; cv.height = s.h;
  cv.getContext('2d').drawImage(s.cv, 0, 0);
  const box = 44 * scale, sc = Math.min(scale, box / Math.max(s.w, s.h));
  cv.className = 'px'; cv.style.width = Math.round(s.w * sc) + 'px'; cv.style.height = Math.round(s.h * sc) + 'px';
  const wrap = document.createElement('div'); wrap.className = 'pbox';
  wrap.style.cssText = 'display:inline-flex;align-items:flex-end;justify-content:center;max-width:100%;width:' + box + 'px;height:' + box + 'px';
  wrap.append(cv); return wrap;
}

// Eggs for the gacha reveal.
export function eggCanvas(rarity, crack = 0) {
  const g = new Grid(24, 28);
  const c = RARITY[rarity].col;
  g.ell(12, 16, 8.5, 10.5, (nx, ny) => { const l = -(nx * 0.6 + ny * 0.8); return l > 0.5 ? lt(c, 0.5) : l < -0.4 ? dk(c, 0.3) : c; });
  for (const [x, y] of [[8, 12], [15, 9], [16, 18], [9, 21], [12, 15]]) { g.rect(x, y, 2, 2, lt(c, 0.75)); }
  g.ell(9, 10, 1.5, 2, '#ffffff');
  if (crack > 0) { const pts = [[4, 15], [7, 13], [9, 16], [12, 12], [14, 16], [17, 13], [20, 15]]; for (let i = 0; i < Math.min(pts.length - 1, crack * 2); i++) g.line(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], '#2a1840'); }
  g.outline('#2a1840');
  return g.toCanvas();
}

// 14x14 move icons: type-coloured tile with a glyph for the move kind.
const iconCache = new Map();
export function moveIcon(move) {
  const key = move.name; if (iconCache.has(key)) return iconCache.get(key);
  const g = new Grid(14, 14); const T = TYPES[move.type];
  g.rect(1, 1, 12, 12, T.col); g.rect(1, 1, 12, 2, T.light); g.rect(1, 11, 12, 2, T.dark);
  const ink = '#1e1426', w = '#ffffff';
  switch (move.kind) {
    case 'proj': g.ell(8.5, 6.5, 2.2, 2.2, w); g.line(3, 7, 6, 7, ink); g.line(3, 5, 5, 5, ink); break;
    case 'melee': for (let i = 0; i < 3; i++) g.line(4 + i * 2, 10, 7 + i * 2, 3, i === 1 ? w : ink); break;
    case 'dash': g.poly([[3, 4], [8, 4], [8, 2], [12, 7], [8, 12], [8, 10], [3, 10]], w); break;
    case 'nova': g.ell(7, 7, 4.6, 4.6, w); g.ell(7, 7, 3, 3, T.col); g.ell(7, 7, 1, 1, ink); break;
    case 'zone': g.ell(7, 8, 4.5, 2.6, ink); g.ell(7, 8, 3, 1.5, T.col); g.line(7, 2, 7, 7, w); g.line(6, 5, 7, 7, w); g.line(8, 5, 7, 7, w); break;
    case 'heal': g.rect(6, 3, 2, 8, w); g.rect(3, 6, 8, 2, w); break;
    case 'buff': g.poly([[7, 2], [12, 7], [9, 7], [9, 11], [5, 11], [5, 7], [2, 7]], w); break;
  }
  g.outline('#1e1426');
  const cv = g.toCanvas(); iconCache.set(key, cv); return cv;
}
