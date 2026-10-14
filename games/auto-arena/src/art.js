// art.js - paints every unit, item and trait icon once into cached canvases.
// The Inkvale technique, cleaned up: a flat light underpaint so sprites read
// solid at phone size, a watercolour wash with a darker pooled edge on top,
// then a crisp, slightly breathing ink outline.

import { rng, rgba, shade, mix, hex, ellipsePts, deform, tracePoly, ink, makeCanvas, INK } from './paint.js';
import { UNITS, UNIT, MINION, ITEMS, TRAITS } from './data.js';

export const SPR = 128;           // sprite design space
const SCALE = 2;                  // painted at 2x for crisp hi-dpi
const cache = new Map();

// ---------------------------------------------------------------- brush helpers
// one solid-looking watercolour part with an ink outline
function part(g, pts, col, R, o = {}) {
  const c = typeof col === 'string' ? col : hex(col);
  const base = o.flat ? pts : deform(pts, 1, 0.03, R);
  g.save();
  // underpaint
  tracePoly(g, base);
  g.fillStyle = rgba(shade(c, o.light ?? 0.18), o.alpha ?? 1);
  g.fill();
  // wash: pooled darker pigment toward the bottom-right, lifted highlight top-left
  g.save();
  tracePoly(g, base); g.clip();
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const p of base) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const w = x1 - x0, h = y1 - y0;
  for (let i = 0; i < 4; i++) {
    const sh = ellipsePts(x0 + w * (0.62 + R() * 0.15), y0 + h * (0.7 + R() * 0.15), w * (0.55 + R() * 0.2), h * (0.45 + R() * 0.15), 12);
    tracePoly(g, deform(sh, 2, 0.25, R));
    g.fillStyle = rgba(shade(c, -0.22), 0.16);
    g.fill();
  }
  const hl = ellipsePts(x0 + w * 0.32, y0 + h * 0.28, w * 0.28, h * 0.2, 10);
  tracePoly(g, deform(hl, 2, 0.3, R));
  g.fillStyle = rgba(shade(c, 0.55), 0.35); g.fill();
  // granulation specks
  for (let i = 0; i < w * h / 30; i++) { g.fillStyle = rgba(shade(c, -0.35), R() * 0.14); g.fillRect(x0 + R() * w, y0 + R() * h, 0.8, 0.8); }
  g.restore();
  if (o.ink !== false) ink(g, base, R, { w: o.w ?? 1.5, jitter: 0.12, closed: true, step: 3, color: o.inkCol ?? INK });
  g.restore();
  return base;
}
const E = (cx, cy, rx, ry, n = 22, rot = 0) => ellipsePts(cx, cy, rx, ry, n, rot);
const line = (g, pts, R, w = 1.5, col = INK) => ink(g, pts.map(p => Array.isArray(p) ? { x: p[0], y: p[1] } : p), R, { w, jitter: 0.1, step: 3, color: col });
function dot(g, x, y, r, col = INK) { g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); }
function eye(g, x, y, r = 2.6, glow = null) {
  if (glow) { g.fillStyle = rgba(glow, 0.35); g.beginPath(); g.arc(x, y, r * 2, 0, 7); g.fill(); dot(g, x, y, r, glow); return; }
  dot(g, x, y, r * 1.25, '#fbf6ea'); dot(g, x + r * 0.35, y, r * 0.85, INK); dot(g, x + r * 0.55, y - r * 0.4, r * 0.3, '#fff');
}
const poly = a => a.map(([x, y]) => ({ x, y }));

// ---------------------------------------------------------------- heads (facing right)
function head(g, sp, x, y, r, d, R) {
  const c = d.col, a = d.acc;
  switch (sp) {
    case 'mouse':
      part(g, E(x - r * 0.55, y - r * 0.8, r * 0.5, r * 0.5), c, R); part(g, E(x - r * 0.55, y - r * 0.8, r * 0.28, r * 0.28), '#e8a0a0', R, { ink: false });
      part(g, poly([[x - r, y], [x - r * 0.6, y - r * 0.8], [x + r * 0.3, y - r * 0.7], [x + r * 1.5, y + r * 0.15], [x + r * 0.2, y + r * 0.8], [x - r * 0.7, y + r * 0.6]]), c, R);
      dot(g, x + r * 1.45, y + r * 0.12, r * 0.16); eye(g, x + r * 0.35, y - r * 0.15);
      line(g, [[x + r * 1.2, y + r * 0.25], [x + r * 1.8, y + r * 0.45]], R, 0.7); break;
    case 'imp':
      part(g, poly([[x - r * 0.4, y - r * 0.6], [x - r * 0.75, y - r * 1.6], [x - r * 0.05, y - r * 0.8]]), a, R);
      part(g, poly([[x + r * 0.2, y - r * 0.7], [x + r * 0.35, y - r * 1.65], [x + r * 0.7, y - r * 0.55]]), a, R);
      part(g, E(x, y, r * 1.05, r * 0.95), c, R);
      eye(g, x + r * 0.5, y - r * 0.1, 2.6, '#fff4a0'); line(g, [[x + r * 0.2, y + r * 0.45], [x + r * 0.8, y + r * 0.35]], R, 1.2); break;
    case 'wolf': case 'fox': {
      const ear = sp === 'fox' ? 1.15 : 0.95;
      part(g, poly([[x - r * 0.6, y - r * 0.4], [x - r * 0.5, y - r * 1.5 * ear], [x - r * 0.0, y - r * 0.6]]), c, R);
      part(g, poly([[x - r * 0.9, y + r * 0.1], [x - r * 0.7, y - r * 0.7], [x + r * 0.3, y - r * 0.75], [x + r * 1.0, y - r * 0.2], [x + r * 1.75, y + r * 0.15], [x + r * 1.4, y + r * 0.5], [x + r * 0.2, y + r * 0.8], [x - r * 0.6, y + r * 0.6]]), c, R);
      if (sp === 'fox') part(g, poly([[x + r * 0.3, y + r * 0.2], [x + r * 1.7, y + r * 0.2], [x + r * 1.3, y + r * 0.5], [x + r * 0.2, y + r * 0.75]]), d.acc, R, { w: 1 });
      part(g, poly([[x - r * 0.2, y - r * 0.5], [x + r * 0.05, y - r * 1.55 * ear], [x + r * 0.45, y - r * 0.55]]), c, R);
      dot(g, x + r * 1.7, y + r * 0.12, r * 0.17); eye(g, x + r * 0.45, y - r * 0.2, 2.4); break;
    }
    case 'skull': {
      part(g, poly([[x - r * 0.95, y - r * 0.1], [x - r * 0.7, y - r * 0.85], [x + r * 0.3, y - r * 1.0], [x + r * 1.0, y - r * 0.4], [x + r * 1.05, y + r * 0.3], [x + r * 0.7, y + r * 0.5], [x + r * 0.75, y + r * 0.95], [x - r * 0.1, y + r * 0.95], [x - r * 0.3, y + r * 0.5], [x - r * 0.9, y + r * 0.4]]), c, R, { light: 0.35 });
      g.fillStyle = INK; tracePoly(g, deform(E(x + r * 0.45, y - r * 0.05, r * 0.3, r * 0.34, 10), 1, 0.1, R)); g.fill();
      eye(g, x + r * 0.45, y - r * 0.05, 1.6, d.id === 'lantern' ? '#f2b23a' : d.id === 'drowned' ? '#7fd0e0' : '#c890ff');
      for (let i = 0; i < 3; i++) line(g, [[x + r * (0.05 + i * 0.25), y + r * 0.62], [x + r * (0.05 + i * 0.25), y + r * 0.9]], R, 0.9);
      break;
    }
    case 'frog': case 'toad': {
      const wide = sp === 'toad' ? 1.15 : 1;
      part(g, poly([[x - r * 1.0 * wide, y + r * 0.3], [x - r * 0.8, y - r * 0.5], [x + r * 0.3, y - r * 0.6], [x + r * 1.25 * wide, y + r * 0.1], [x + r * 1.1 * wide, y + r * 0.65], [x - r * 0.6, y + r * 0.8]]), c, R);
      part(g, E(x - r * 0.25, y - r * 0.6, r * 0.42, r * 0.42), c, R); part(g, E(x + r * 0.45, y - r * 0.55, r * 0.42, r * 0.42), c, R);
      eye(g, x - r * 0.2, y - r * 0.62, 2.4); eye(g, x + r * 0.5, y - r * 0.58, 2.4);
      line(g, [[x - r * 0.3, y + r * 0.35], [x + r * 0.5, y + r * 0.42], [x + r * 1.05, y + r * 0.2]], R, 1.1);
      if (sp === 'toad') for (let i = 0; i < 4; i++) dot(g, x - r * 0.6 + R() * r * 1.4, y + R() * r * 0.4, 1.2, rgba(shade(c, -0.4), 0.7));
      break;
    }
    case 'cat': {
      part(g, poly([[x - r * 0.75, y - r * 0.2], [x - r * 0.65, y - r * 1.4], [x - r * 0.05, y - r * 0.7]]), c, R);
      part(g, E(x + r * 0.1, y, r * 1.0, r * 0.88), c, R);
      part(g, poly([[x + r * 0.15, y - r * 0.65], [x + r * 0.55, y - r * 1.45], [x + r * 0.85, y - r * 0.35]]), c, R);
      eye(g, x + r * 0.55, y - r * 0.1, 2.5, d.id === 'sable' ? '#f2c14e' : '#b8f070');
      dot(g, x + r * 1.05, y + r * 0.25, 1.4, '#e8a0a0');
      line(g, [[x + r * 0.9, y + r * 0.4], [x + r * 1.6, y + r * 0.3]], R, 0.6); line(g, [[x + r * 0.9, y + r * 0.5], [x + r * 1.55, y + r * 0.62]], R, 0.6);
      if (d.id === 'sable') part(g, poly([[x - r * 0.4, y - r * 0.85], [x - r * 0.3, y - r * 1.5], [x - r * 0.05, y - r * 1.1], [x + r * 0.2, y - r * 1.6], [x + r * 0.4, y - r * 1.1], [x + r * 0.65, y - r * 1.45], [x + r * 0.6, y - r * 0.8]]), '#f2c14e', R, { w: 1.1 });
      break;
    }
    case 'ghost': {
      part(g, poly([[x - r * 0.9, y + r * 0.9], [x - r * 1.0, y - r * 0.2], [x - r * 0.4, y - r * 1.0], [x + r * 0.5, y - r * 1.0], [x + r * 1.0, y - r * 0.2], [x + r * 0.9, y + r * 0.9]]), c, R, { light: 0.3, alpha: 0.95 });
      eye(g, x + r * 0.15, y - r * 0.15, 2.2, '#ffb050'); eye(g, x + r * 0.65, y - r * 0.15, 2.2, '#ffb050');
      part(g, E(x + r * 0.4, y + r * 0.4, r * 0.2, r * 0.25), INK, R, { light: 0, ink: false }); break;
    }
    case 'sprout': {
      part(g, E(x, y, r * 0.95, r * 0.9), c, R);
      line(g, [[x, y - r * 0.85], [x + r * 0.1, y - r * 1.5]], R, 1.6, '#3a6a2a');
      part(g, poly([[x + r * 0.1, y - r * 1.4], [x - r * 0.9, y - r * 1.9], [x - r * 0.3, y - r * 1.25]]), '#6aa84a', R, { w: 1.1 });
      part(g, poly([[x + r * 0.1, y - r * 1.45], [x + r * 1.1, y - r * 2.0], [x + r * 0.7, y - r * 1.2]]), '#7ab85a', R, { w: 1.1 });
      eye(g, x + r * 0.45, y - r * 0.05, 2.3); dot(g, x + r * 0.2, y + r * 0.35, 1.8, rgba('#e88a8a', 0.6)); break;
    }
    case 'boar': {
      part(g, poly([[x - r * 0.7, y - r * 0.4], [x - r * 0.4, y - r * 1.3], [x - r * 0.05, y - r * 0.7]]), c, R);
      part(g, poly([[x - r * 1.0, y + r * 0.2], [x - r * 0.8, y - r * 0.75], [x + r * 0.4, y - r * 0.85], [x + r * 1.5, y - r * 0.1], [x + r * 1.6, y + r * 0.55], [x + r * 0.4, y + r * 0.95], [x - r * 0.7, y + r * 0.7]]), c, R);
      part(g, E(x + r * 1.55, y + r * 0.22, r * 0.28, r * 0.36), shade(c, 0.2), R);
      dot(g, x + r * 1.55, y + r * 0.12, 1.1); dot(g, x + r * 1.6, y + r * 0.35, 1.1);
      part(g, poly([[x + r * 1.05, y + r * 0.55], [x + r * 1.3, y - r * 0.15], [x + r * 1.25, y + r * 0.6]]), '#f4ecd8', R, { w: 1 });
      eye(g, x + r * 0.55, y - r * 0.3, 2.2); break;
    }
    case 'seal': {
      part(g, poly([[x - r * 0.9, y + r * 0.4], [x - r * 0.7, y - r * 0.7], [x + r * 0.4, y - r * 0.8], [x + r * 1.5, y], [x + r * 1.4, y + r * 0.6], [x - r * 0.3, y + r * 0.9]]), c, R);
      part(g, poly([[x - r * 0.5, y - r * 0.65], [x - r * 1.3, y - r * 1.4], [x - r * 0.8, y - r * 0.2]]), d.acc, R, { w: 1 }); // fin mane
      eye(g, x + r * 0.5, y - r * 0.25, 2.6); dot(g, x + r * 1.45, y + r * 0.15, 1.6);
      line(g, [[x + r * 1.1, y + r * 0.4], [x + r * 1.7, y + r * 0.55]], R, 0.6); break;
    }
    case 'owl': {
      part(g, E(x, y, r * 1.05, r * 1.0), c, R);
      part(g, poly([[x - r * 0.75, y - r * 0.6], [x - r * 0.9, y - r * 1.45], [x - r * 0.2, y - r * 0.85]]), c, R);
      part(g, poly([[x + r * 0.35, y - r * 0.85], [x + r * 0.75, y - r * 1.5], [x + r * 0.9, y - r * 0.5]]), c, R);
      part(g, E(x - r * 0.15, y - r * 0.1, r * 0.42, r * 0.42), '#f0e6c8', R, { w: 1 }); part(g, E(x + r * 0.55, y - r * 0.1, r * 0.42, r * 0.42), '#f0e6c8', R, { w: 1 });
      eye(g, x - r * 0.12, y - r * 0.1, 2.2, d.acc); eye(g, x + r * 0.58, y - r * 0.1, 2.2, d.acc);
      part(g, poly([[x + r * 0.15, y + r * 0.2], [x + r * 0.45, y + r * 0.2], [x + r * 0.3, y + r * 0.6]]), '#e8b04a', R, { w: 1 }); break;
    }
    case 'human': {
      part(g, E(x, y, r * 0.92, r * 1.0), c, R);
      eye(g, x + r * 0.45, y - r * 0.1, 2.2); line(g, [[x + r * 0.3, y + r * 0.5], [x + r * 0.7, y + r * 0.45]], R, 1);
      dot(g, x + r * 0.95, y + r * 0.1, 1.5, rgba(shade(c, -0.25), 0.9));
      if (d.id === 'gloamking') {
        part(g, poly([[x - r * 0.95, y - r * 0.2], [x - r * 1.1, y + r * 1.0], [x - r * 0.5, y + r * 0.9], [x - r * 0.6, y - r * 0.4]]), '#e8e4ee', R, { w: 1 }); // pale hair
        part(g, poly([[x - r * 0.8, y - r * 0.75], [x - r * 0.75, y - r * 1.7], [x - r * 0.35, y - r * 1.15], [x, y - r * 1.85], [x + r * 0.35, y - r * 1.15], [x + r * 0.75, y - r * 1.7], [x + r * 0.8, y - r * 0.75]]), d.acc, R);
        dot(g, x, y - r * 1.2, 2, '#8a3ac8');
      } else part(g, poly([[x - r * 0.95, y + r * 0.1], [x - r * 0.9, y - r * 0.8], [x + r * 0.2, y - r * 1.05], [x + r * 0.9, y - r * 0.5], [x + r * 0.2, y - r * 0.6], [x - r * 0.3, y - r * 0.2]]), '#8a4a2a', R, { w: 1.1 });
      break;
    }
    case 'mushroom': {
      part(g, E(x, y + r * 0.2, r * 0.75, r * 0.85), '#efe4cc', R);
      part(g, poly([[x - r * 1.5, y - r * 0.2], [x - r * 1.0, y - r * 1.1], [x, y - r * 1.5], [x + r * 1.0, y - r * 1.1], [x + r * 1.5, y - r * 0.2]]), '#b84a3a', R);
      for (const [px, py] of [[-0.7, -0.6], [0.1, -1.05], [0.75, -0.55]]) part(g, E(x + r * px, y + r * py, r * 0.2, r * 0.15), '#f4ecd8', R, { w: 0.8 });
      eye(g, x + r * 0.35, y + r * 0.2, 2.1); line(g, [[x + r * 0.1, y + r * 0.65], [x + r * 0.5, y + r * 0.6]], R, 0.9); break;
    }
    case 'crab': {
      part(g, E(x, y + r * 0.1, r * 1.15, r * 0.8), c, R);
      line(g, [[x + r * 0.1, y - r * 0.5], [x + r * 0.15, y - r * 1.2]], R, 1.4); line(g, [[x + r * 0.6, y - r * 0.45], [x + r * 0.75, y - r * 1.15]], R, 1.4);
      eye(g, x + r * 0.15, y - r * 1.3, 2.3); eye(g, x + r * 0.75, y - r * 1.25, 2.3);
      line(g, [[x + r * 0.3, y + r * 0.4], [x + r * 0.8, y + r * 0.35]], R, 1); break;
    }
    case 'golem': {
      part(g, poly([[x - r * 1.0, y - r * 0.9], [x + r * 0.9, y - r * 1.0], [x + r * 1.05, y + r * 0.85], [x - r * 0.95, y + r * 0.95]]), c, R);
      g.fillStyle = INK; g.fillRect(x - r * 0.2, y - r * 0.25, r * 1.1, r * 0.35);
      eye(g, x + r * 0.15, y - r * 0.08, 1.8, d.id === 'mourn' ? '#c8a0ff' : '#ffd060'); eye(g, x + r * 0.65, y - r * 0.08, 1.8, d.id === 'mourn' ? '#c8a0ff' : '#ffd060');
      for (let i = 0; i < 3; i++) dot(g, x - r * 0.75 + i * r * 0.7, y + r * 0.7, 1.4, shade(c, -0.4).map ? hex(shade(c, -0.4)) : INK);
      if (d.id === 'mourn') part(g, poly([[x - r * 0.5, y - r * 0.95], [x - r * 0.2, y - r * 1.6], [x + r * 0.3, y - r * 1.6], [x + r * 0.55, y - r * 0.95]]), d.acc, R, { w: 1.1 });
      break;
    }
    case 'bird': {
      part(g, E(x, y, r * 0.95, r * 0.9), c, R);
      part(g, poly([[x - r * 0.4, y - r * 0.7], [x - r * 0.9, y - r * 1.45], [x - r * 0.1, y - r * 0.9]]), d.acc, R, { w: 1 });
      part(g, poly([[x + r * 0.75, y - r * 0.15], [x + r * 1.75, y + r * 0.15], [x + r * 0.75, y + r * 0.4]]), '#e8b04a', R, { w: 1.1 });
      eye(g, x + r * 0.4, y - r * 0.2, 2.4); break;
    }
    case 'fish': {
      part(g, poly([[x - r * 0.4, y - r * 0.6], [x - r * 0.1, y - r * 1.55], [x + r * 0.4, y - r * 1.2], [x + r * 0.5, y - r * 0.6]]), d.acc, R, { w: 1 });
      part(g, poly([[x - r * 0.95, y + r * 0.3], [x - r * 0.8, y - r * 0.7], [x + r * 0.5, y - r * 0.8], [x + r * 1.35, y + r * 0.05], [x + r * 0.6, y + r * 0.9], [x - r * 0.4, y + r * 0.85]]), c, R);
      eye(g, x + r * 0.55, y - r * 0.2, 2.6); line(g, [[x + r * 0.8, y + r * 0.35], [x + r * 1.15, y + r * 0.25]], R, 1);
      for (let i = 0; i < 3; i++) line(g, [[x - r * (0.5 - i * 0.2), y - r * 0.1], [x - r * (0.4 - i * 0.2), y + r * 0.35]], R, 0.6, rgba(shade(c, -0.4), 0.7));
      if (d.id === 'abyss') part(g, poly([[x - r * 0.7, y - r * 0.7], [x - r * 0.6, y - r * 1.4], [x - r * 0.3, y - r * 0.95], [x, y - r * 1.55], [x + r * 0.3, y - r * 0.95], [x + r * 0.55, y - r * 1.3], [x + r * 0.55, y - r * 0.75]]), d.acc, R, { w: 1.1 });
      break;
    }
    case 'bear': {
      part(g, E(x - r * 0.55, y - r * 0.8, r * 0.38, r * 0.38), c, R);
      part(g, poly([[x - r * 1.0, y + r * 0.2], [x - r * 0.8, y - r * 0.75], [x + r * 0.4, y - r * 0.85], [x + r * 1.1, y - r * 0.2], [x + r * 1.55, y + r * 0.3], [x + r * 1.0, y + r * 0.8], [x - r * 0.6, y + r * 0.75]]), c, R);
      part(g, E(x + r * 1.15, y + r * 0.25, r * 0.45, r * 0.35), shade(c, 0.35), R, { w: 1 });
      dot(g, x + r * 1.5, y + r * 0.15, 2); eye(g, x + r * 0.45, y - r * 0.25, 2.2);
      for (let i = 0; i < 4; i++) part(g, poly([[x - r * 0.8 + i * r * 0.4, y - r * 0.7], [x - r * 0.7 + i * r * 0.4, y - r * 1.15], [x - r * 0.5 + i * r * 0.4, y - r * 0.75]]), d.acc, R, { w: 0.8 });
      break;
    }
    case 'treant': {
      part(g, poly([[x - r * 0.9, y + r * 0.9], [x - r * 1.0, y - r * 0.5], [x - r * 0.3, y - r * 0.9], [x + r * 0.6, y - r * 0.8], [x + r * 1.0, y - r * 0.2], [x + r * 0.9, y + r * 0.9]]), c, R);
      for (let i = 0; i < 4; i++) line(g, [[x - r * 0.7 + i * r * 0.45, y - r * 0.5], [x - r * 0.65 + i * r * 0.45 + R() * 2, y + r * 0.8]], R, 0.7, rgba(shade(c, -0.45), 0.8));
      for (let i = 0; i < 6; i++) part(g, E(x - r * 0.8 + R() * r * 1.6, y - r * 1.0 - R() * r * 0.6, r * 0.45, r * 0.32, 10), i % 2 ? d.acc : shade(d.acc, -0.15), R, { w: 0.9 });
      eye(g, x + r * 0.2, y - r * 0.1, 2, '#fff4a0'); eye(g, x + r * 0.65, y - r * 0.1, 2, '#fff4a0'); break;
    }
    case 'wisp': {
      g.save(); const gr = g.createRadialGradient(x, y, 1, x, y, r * 2.2); gr.addColorStop(0, rgba(d.acc, 0.7)); gr.addColorStop(1, rgba(d.acc, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 2.2, 0, 7); g.fill(); g.restore();
      part(g, poly([[x - r * 0.9, y + r * 0.6], [x - r * 0.95, y - r * 0.3], [x - r * 0.4, y - r * 1.0], [x - r * 0.1, y - r * 1.9], [x + r * 0.3, y - r * 0.9], [x + r * 0.95, y - r * 0.3], [x + r * 0.85, y + r * 0.6], [x, y + r * 1.0]]), c, R, { light: 0.35 });
      eye(g, x - r * 0.05, y, 2.2, '#2a4a2a'); eye(g, x + r * 0.5, y, 2.2, '#2a4a2a'); break;
    }
    case 'stag': {
      for (const s of [-1, 1]) line(g, [[x - r * 0.1 + s * r * 0.2, y - r * 0.7], [x - r * 0.3 + s * r * 0.5, y - r * 1.6], [x - r * 0.7 + s * r * 0.6, y - r * 2.1]], R, 2, hex(shade(d.acc, -0.2)));
      line(g, [[x - r * 0.4, y - r * 1.4], [x - r * 1.0, y - r * 1.6]], R, 1.6, hex(shade(d.acc, -0.2))); line(g, [[x + r * 0.35, y - r * 1.3], [x + r * 0.8, y - r * 1.85]], R, 1.6, hex(shade(d.acc, -0.2)));
      part(g, poly([[x - r * 0.8, y + r * 0.2], [x - r * 0.6, y - r * 0.75], [x + r * 0.3, y - r * 0.8], [x + r * 1.6, y + r * 0.15], [x + r * 1.4, y + r * 0.6], [x + r * 0.2, y + r * 0.8], [x - r * 0.5, y + r * 0.6]]), c, R);
      part(g, poly([[x - r * 0.6, y - r * 0.5], [x - r * 1.2, y - r * 0.9], [x - r * 0.4, y - r * 0.15]]), c, R, { w: 1 });
      dot(g, x + r * 1.55, y + r * 0.25, 1.8); eye(g, x + r * 0.5, y - r * 0.2, 2.3); break;
    }
    case 'dragon': {
      part(g, poly([[x - r * 0.5, y - r * 0.6], [x - r * 1.3, y - r * 1.5], [x - r * 0.1, y - r * 0.85]]), d.acc, R);
      part(g, poly([[x - r * 1.0, y + r * 0.3], [x - r * 0.8, y - r * 0.7], [x + r * 0.4, y - r * 0.85], [x + r * 1.9, y - r * 0.15], [x + r * 1.9, y + r * 0.3], [x + r * 0.9, y + r * 0.45], [x + r * 1.7, y + r * 0.75], [x + r * 0.1, y + r * 0.95], [x - r * 0.7, y + r * 0.75]]), c, R);
      part(g, poly([[x + r * 0.1, y - r * 0.75], [x + r * 0.2, y - r * 1.6], [x + r * 0.55, y - r * 0.75]]), d.acc, R);
      eye(g, x + r * 0.65, y - r * 0.35, 2.4, '#ffb040'); dot(g, x + r * 1.75, y - r * 0.02, 1.4, '#e0602e'); break;
    }
    default: part(g, E(x, y, r, r), c, R); eye(g, x + r * 0.4, y - r * 0.1);
  }
}

// ---------------------------------------------------------------- gear
function weapon(g, d, x, y, R) {
  const a = d.acc, cls = d.cls, id = d.id;
  if (id === 'gravedig') { line(g, [[x - 2, y + 18], [x + 10, y - 22]], R, 2.6, '#6a4a2a'); part(g, poly([[x + 6, y - 22], [x + 18, y - 32], [x + 20, y - 20], [x + 12, y - 16]]), '#9aa0a8', R, { w: 1.1 }); return; }
  if (cls === 'knight') {
    line(g, [[x - 4, y + 4], [x + 22, y - 28]], R, 3.2, '#e8e4dc'); line(g, [[x - 4, y + 4], [x + 22, y - 28]], R, 1, INK);
    line(g, [[x - 6, y - 4], [x + 6, y + 6]], R, 2.4, hex(shade(a, -0.3)));
  } else if (cls === 'mage') {
    line(g, [[x - 2, y + 22], [x + 8, y - 30]], R, 2.6, '#6a4a2a');
    g.save(); const gr = g.createRadialGradient(x + 9, y - 34, 1, x + 9, y - 34, 12); gr.addColorStop(0, rgba(a, 0.9)); gr.addColorStop(1, rgba(a, 0)); g.fillStyle = gr; g.beginPath(); g.arc(x + 9, y - 34, 12, 0, 7); g.fill(); g.restore();
    part(g, E(x + 9, y - 34, 5, 5), a, R, { w: 1.1, light: 0.4 });
  } else if (cls === 'ranger') {
    g.save(); g.lineCap = 'round';
    ink(g, Array.from({ length: 12 }, (_, i) => { const t = -1.1 + i / 11 * 2.2; return { x: x + 6 + Math.cos(t) * 16, y: y - 6 + Math.sin(t) * 22 }; }), R, { w: 2.6, color: '#7a4a2a', jitter: 0.05 });
    line(g, [[x + 6 + Math.cos(-1.1) * 16, y - 6 + Math.sin(-1.1) * 22], [x + 6 + Math.cos(1.1) * 16, y - 6 + Math.sin(1.1) * 22]], R, 0.7, '#3a3030');
    g.restore();
  } else if (cls === 'rogue') {
    line(g, [[x, y], [x + 16, y - 10]], R, 2.6, '#e8e4dc'); line(g, [[x - 2, y - 4], [x + 3, y + 4]], R, 2, '#6a4a2a');
  } else if (cls === 'undead' || id === 'minion') {
    if (id === 'drowned') { part(g, poly([[x, y + 2], [x + 22, y - 18], [x + 24, y - 14], [x + 4, y + 6]]), '#c8ccd0', R, { w: 1 }); part(g, E(x + 1, y + 3, 4, 3), a, R, { w: 0.9 }); }
    else { line(g, [[x - 2, y + 4], [x + 18, y - 22]], R, 2.6, '#c8c0a8'); line(g, [[x - 6, y - 2], [x + 4, y + 6]], R, 2, '#6a5a4a'); }
  }
}

function biped(g, d, R) {
  const cx = 60, gy = 116;
  const garb = d.garb, c = d.col, cls = d.cls;
  const big = 1 + (d.cost - 1) * 0.06;
  const bw = 17 * big, bh = 19 * big;
  const hy = gy - 26 - bh * 1.55, hr = 15 * big;
  // back arm / shield side / cape
  if (cls === 'knight' && d.cost >= 4 || d.id === 'gloamking') part(g, poly([[cx - 4, gy - 50], [cx - 26, gy - 2], [cx - 2, gy - 6]]), d.id === 'gloamking' ? '#5a2a7a' : hex(shade(garb, -0.2)), R);
  if (cls === 'ranger') part(g, poly([[cx - 18, gy - 52], [cx - 10, gy - 56], [cx - 4, gy - 30], [cx - 12, gy - 28]]), '#7a4a2a', R, { w: 1.1 }); // quiver
  // legs
  part(g, E(cx - 7, gy - 7, 5, 8), shade(garb, -0.35), R, { w: 1.2 });
  part(g, E(cx + 7, gy - 7, 5, 8), shade(garb, -0.35), R, { w: 1.2 });
  // torso / robe
  if (cls === 'mage') part(g, poly([[cx - 6, gy - 26 - bh * 1.15], [cx + 6, gy - 26 - bh * 1.15], [cx + bw + 3, gy - 6], [cx - bw - 3, gy - 6]]), garb, R);
  else if (cls === 'undead' && d.species === 'skull') {
    part(g, poly([[cx - bw * 0.9, gy - 16 - bh * 1.5], [cx + bw * 0.9, gy - 16 - bh * 1.5], [cx + bw, gy - 10], [cx + bw * 0.5, gy - 14], [cx, gy - 8], [cx - bw * 0.5, gy - 14], [cx - bw, gy - 10]]), garb, R);
    for (let i = 0; i < 3; i++) line(g, [[cx - 8, gy - 30 - bh * 0.4 - i * 6], [cx + 8, gy - 30 - bh * 0.4 - i * 6]], R, 1.2, '#e9e2cf');
  } else part(g, E(cx, gy - 18 - bh * 0.55, bw, bh), garb, R);
  // belt / trim
  line(g, [[cx - bw * 0.85, gy - 18 - bh * 0.25], [cx + bw * 0.85, gy - 18 - bh * 0.25]], R, 2, hex(shade(d.acc, -0.25)));
  if (cls === 'rogue') part(g, poly([[cx - bw, gy - 22 - bh * 1.05], [cx + bw, gy - 24 - bh * 1.05], [cx + bw + 8, gy - 16 - bh * 0.9], [cx - bw, gy - 16 - bh * 0.95]]), hex(shade(garb, 0.1)), R, { w: 1 }); // scarf
  // shield (knights) drawn behind the head side
  if (cls === 'knight') {
    const sx = cx - 15, sy = gy - 30;
    const pts = poly([[sx - 12, sy - 18], [sx + 12, sy - 18], [sx + 12, sy + 2], [sx, sy + 16], [sx - 12, sy + 2]]);
    part(g, pts, d.acc, R, { w: 1.8 });
    part(g, E(sx, sy - 3, 5, 5), d.id === 'pip' ? '#a8743a' : hex(mix(d.acc, d.garb, 0.6)), R, { w: 1 });
  }
  // head
  head(g, d.species, cx + 2, hy, hr, d, R);
  // hats & hoods
  if (cls === 'knight' && !['golem', 'treant', 'human'].includes(d.species) && d.id !== 'bram') {
    part(g, poly([[cx + 2 - hr * 0.95, hy - hr * 0.35], [cx + 2 - hr * 0.7, hy - hr * 1.1], [cx + 2 + hr * 0.4, hy - hr * 1.25], [cx + 2 + hr * 0.95, hy - hr * 0.55], [cx + 2 + hr * 0.6, hy - hr * 0.35]]), d.acc, R, { w: 1.4 });
    if (d.id === 'pip') part(g, poly([[cx - 2, hy - hr * 1.15], [cx + 4, hy - hr * 1.9], [cx + 8, hy - hr * 1.2]]), '#c84a3a', R, { w: 1 });
  }
  if (cls === 'mage' && !['skull', 'wisp', 'fish'].includes(d.species) && d.id !== 'sprig') {
    part(g, poly([[cx + 2 - hr * 1.35, hy - hr * 0.55], [cx + 2 + hr * 1.35, hy - hr * 0.55], [cx + 2 + hr * 0.5, hy - hr * 0.9], [cx + 2 - hr * 0.3, hy - hr * 2.6], [cx + 2 - hr * 1.3, hy - hr * 2.9], [cx + 2 - hr * 0.6, hy - hr * 0.95]]), garb, R);
    for (let i = 0; i < 3; i++) dot(g, cx - 4 + i * 5, hy - hr * (1.2 + i * 0.35), 1.2, d.acc);
  }
  if (cls === 'mage' && d.species === 'skull') part(g, poly([[cx + 2 - hr * 1.3, hy - hr * 0.6], [cx + 2 + hr * 1.3, hy - hr * 0.6], [cx + 2 + hr * 0.2, hy - hr * 1.0], [cx - hr * 0.8, hy - hr * 2.3], [cx - hr * 0.6, hy - hr * 0.95]]), garb, R);
  if (cls === 'ranger' && !['bird', 'treant'].includes(d.species)) part(g, poly([[cx + 2 - hr * 1.1, hy + hr * 0.4], [cx + 2 - hr * 1.15, hy - hr * 0.6], [cx + 2 - hr * 0.3, hy - hr * 1.3], [cx + 2 + hr * 0.7, hy - hr * 1.0], [cx + 2 + hr * 0.15, hy - hr * 0.6], [cx + 2 - hr * 0.5, hy + hr * 0.2]]), hex(shade(garb, -0.05)), R);
  if (cls === 'rogue' && d.species !== 'crab') { g.save(); g.fillStyle = rgba(INK, 0.85); g.fillRect(cx + 2 - hr * 0.2, hy - hr * 0.35, hr * 1.3, hr * 0.4); g.restore(); eye(g, cx + 2 + hr * 0.5, hy - hr * 0.15, 2, '#f0f0f0'); }
  if (d.id === 'drowned') part(g, poly([[cx + 2 - hr * 1.3, hy - hr * 0.7], [cx + 2 - hr * 0.4, hy - hr * 1.5], [cx + 2 + hr * 0.4, hy - hr * 1.6], [cx + 2 + hr * 1.3, hy - hr * 0.7], [cx + 2, hy - hr * 0.95]]), '#2a2a3a', R);
  if (d.id === 'bonelord') part(g, poly([[cx + 2 - hr * 0.8, hy - hr * 0.8], [cx + 2 - hr * 0.7, hy - hr * 1.6], [cx + 2 - hr * 0.3, hy - hr * 1.1], [cx + 2, hy - hr * 1.7], [cx + 2 + hr * 0.3, hy - hr * 1.1], [cx + 2 + hr * 0.7, hy - hr * 1.6], [cx + 2 + hr * 0.8, hy - hr * 0.8]]), d.acc, R, { w: 1.1 });
  // front arm + weapon
  part(g, E(cx + bw * 0.75, gy - 24 - bh * 0.6, 4.5, 9, 14, -0.5), cls === 'undead' && d.species === 'skull' ? '#e9e2cf' : garb, R, { w: 1.1 });
  weapon(g, d, cx + bw * 0.9, gy - 20 - bh * 0.6, R);
}

function quad(g, d, R) {
  const cx = 58, gy = 116, c = d.col;
  const big = 1 + (d.cost - 1) * 0.07;
  const bw = 27 * big, bh = 15 * big, by = gy - 14 - bh;
  // tail
  if (d.species === 'dragon') part(g, poly([[cx - bw * 0.8, by], [cx - bw * 1.6, by - 14], [cx - bw * 1.75, by - 22], [cx - bw * 1.45, by - 8], [cx - bw * 0.8, by + 8]]), c, R);
  else if (d.species === 'fox') part(g, E(cx - bw * 1.1, by - 6, 13, 7, 16, -0.5), c, R);
  else if (d.species !== 'bear') part(g, E(cx - bw * 1.0, by - 3, 9, 4, 12, -0.6), c, R);
  // far legs
  for (const lx of [-0.55, 0.45]) part(g, E(cx + bw * lx + 4, gy - 9, 4.5, 10), shade(c, -0.3), R, { w: 1.2 });
  // wings
  if (d.species === 'dragon') part(g, poly([[cx - 6, by - 6], [cx - 30, by - 44], [cx - 10, by - 38], [cx + 2, by - 48], [cx + 10, by - 30], [cx + 12, by - 8]]), hex(shade(c, 0.1)), R);
  // body
  part(g, E(cx, by, bw, bh), c, R);
  if (d.species === 'bear') for (let i = 0; i < 5; i++) part(g, poly([[cx - bw * 0.7 + i * bw * 0.32, by - bh * 0.6], [cx - bw * 0.6 + i * bw * 0.32, by - bh * 1.3], [cx - bw * 0.4 + i * bw * 0.32, by - bh * 0.7]]), d.acc, R, { w: 0.9 });
  if (d.species === 'dragon') for (let i = 0; i < 4; i++) part(g, poly([[cx - bw * 0.6 + i * bw * 0.35, by - bh * 0.85], [cx - bw * 0.5 + i * bw * 0.35, by - bh * 1.35], [cx - bw * 0.35 + i * bw * 0.35, by - bh * 0.9]]), d.acc, R, { w: 0.9 });
  if (d.species === 'seal') for (let i = 0; i < 3; i++) line(g, [[cx - bw * 0.6 + i * 12, by + 2], [cx - bw * 0.5 + i * 12 + 6, by - 4]], R, 0.8, rgba('#ffffff', 0.6));
  // near legs
  for (const lx of [-0.65, 0.55]) part(g, E(cx + bw * lx, gy - 8, 5, 11), shade(c, -0.12), R, { w: 1.3 });
  // head
  const hr = 14 * big;
  head(g, d.species, cx + bw * 0.85, by - bh * 0.85, hr, d, R);
  if (d.id === 'cinder') for (let i = 0; i < 3; i++) part(g, poly([[cx - bw * 1.25 - 4 + i * 5, by - 10], [cx - bw * 1.2 + i * 5, by - 24 - i * 3], [cx - bw * 1.1 + 2 + i * 5, by - 10]]), i === 1 ? '#f2c14e' : '#e0602e', R, { w: 0.9, light: 0.3 });
}

function floater(g, d, R) {
  const cx = 62, gy = 108, c = d.col;
  const big = 1 + (d.cost - 1) * 0.07;
  if (d.species === 'skull' || d.species === 'fish') {
    // hooded robe trailing into a wisp
    const top = gy - 50 * big;
    part(g, poly([[cx - 16 * big, top + 8], [cx + 16 * big, top + 8], [cx + 20 * big, gy - 14], [cx + 8, gy - 4], [cx, gy - 12], [cx - 10, gy], [cx - 20 * big, gy - 12]]), d.garb, R);
    head(g, d.species, cx + 3, top - 4, 15 * big, d, R);
    if (d.species === 'skull') part(g, poly([[cx - 18 * big, top + 2], [cx - 12, top - 22 * big], [cx + 10, top - 26 * big], [cx + 20 * big, top - 4], [cx + 6, top - 8], [cx - 6, top + 10]]), d.garb, R);
    if (d.id === 'lantern') { line(g, [[cx + 18, top + 18], [cx + 26, top + 22]], R, 1.6); part(g, poly([[cx + 21, top + 22], [cx + 31, top + 22], [cx + 33, top + 38], [cx + 19, top + 38]]), '#f2b23a', R, { w: 1.2, light: 0.4 }); dot(g, cx + 26, top + 30, 3, '#fff4c0'); }
    if (d.id === 'abyss') { for (let i = 0; i < 4; i++) ink(g, Array.from({ length: 8 }, (_, k) => ({ x: cx - 12 + i * 8 + Math.sin(k * 0.9 + i) * 4, y: gy - 10 + k * 3 })), R, { w: 2.2, color: hex(shade(c, -0.2)), jitter: 0.1 }); weapon(g, { ...d, cls: 'mage' }, cx + 20, top + 30, R); }
  } else if (d.species === 'ghost') {
    // a cinder spirit: tall smoky body, ragged hem, ember heart
    const top = gy - 64;
    const body = poly([[cx - 4, top], [cx + 12, top + 6], [cx + 19, top + 24], [cx + 20, gy - 18], [cx + 14, gy - 6], [cx + 8, gy - 14], [cx + 2, gy - 2], [cx - 5, gy - 12], [cx - 12, gy - 3], [cx - 16, gy - 16], [cx - 19, top + 26], [cx - 15, top + 7]]);
    g.save(); const gr = g.createRadialGradient(cx, gy - 34, 2, cx, gy - 34, 34); gr.addColorStop(0, rgba(d.acc, 0.35)); gr.addColorStop(1, rgba(d.acc, 0)); g.fillStyle = gr; g.beginPath(); g.arc(cx, gy - 34, 34, 0, 7); g.fill(); g.restore();
    part(g, body, c, R, { light: 0.1 });
    part(g, E(cx - 18, gy - 34, 5, 10, 12, 0.5), c, R, { w: 1.1 }); part(g, E(cx + 20, gy - 36, 5, 10, 12, -0.5), c, R, { w: 1.1 });
    part(g, E(cx + 1, gy - 30, 6, 7, 12), d.acc, R, { w: 1, light: 0.3 }); dot(g, cx + 1, gy - 30, 2.5, '#fff0b0');
    g.fillStyle = INK; g.beginPath(); g.ellipse(cx - 3, top + 18, 3.6, 4.6, 0, 0, 7); g.ellipse(cx + 8, top + 18, 3.6, 4.6, 0, 0, 7); g.fill();
    eye(g, cx - 3, top + 18, 1.6, '#ffb050'); eye(g, cx + 8, top + 18, 1.6, '#ffb050');
  } else head(g, d.species, cx, gy - 40 * big, 22 * big, d, R);
}

// ---------------------------------------------------------------- public sprite API
export function unitSprite(id) {
  const key = 'u:' + id;
  if (cache.has(key)) return cache.get(key);
  const d = id === 'minion' ? { ...MINION, cls: 'undead' } : UNIT[id];
  const cv = makeCanvas(SPR * SCALE, SPR * SCALE);
  const g = cv.getContext('2d');
  g.scale(SCALE, SCALE);
  const R = rng(id.split('').reduce((s, ch) => s * 31 + ch.charCodeAt(0), 7) >>> 0);
  if (d.body === 'quad') quad(g, d, R); else if (d.body === 'float') floater(g, d, R); else biped(g, d, R);
  cache.set(key, cv);
  return cv;
}

// soft ground shadow + team-coloured ink ring
export function drawUnitAt(g, id, x, y, size, o = {}) {
  const spr = unitSprite(id);
  const s = size / SPR;
  g.save();
  g.translate(x, y);
  // shadow
  g.fillStyle = 'rgba(40,28,30,0.22)';
  g.beginPath(); g.ellipse(0, 0, size * 0.32, size * 0.09, 0, 0, Math.PI * 2); g.fill();
  if (o.ring) {
    g.strokeStyle = o.ring; g.lineWidth = Math.max(1.5, size * 0.025);
    g.beginPath(); g.ellipse(0, 0, size * 0.33, size * 0.1, 0, 0, Math.PI * 2); g.stroke();
  }
  const sq = o.squash || 0;
  g.scale((o.flip ? -1 : 1) * (1 + sq), 1 - sq);
  if (o.alpha != null) g.globalAlpha *= o.alpha;
  if (o.rot) g.rotate(o.rot);
  g.drawImage(spr, -SPR * 0.47 * s, -SPR * 0.91 * s, size, size);
  if (o.flash) { g.globalCompositeOperation = 'source-atop'; }
  g.restore();
}

// ---------------------------------------------------------------- icons
// small inked symbols for traits and items, drawn live (cheap paths)
export function icon(g, kind, x, y, r, col = INK, fill = null) {
  g.save(); g.translate(x, y); g.lineJoin = 'round'; g.lineCap = 'round';
  g.strokeStyle = col; g.lineWidth = Math.max(1.2, r * 0.16); g.fillStyle = fill || col;
  const P = (pts, close = true, f = false) => { g.beginPath(); pts.forEach(([a, b], i) => i ? g.lineTo(a * r, b * r) : g.moveTo(a * r, b * r)); if (close) g.closePath(); if (f) g.fill(); g.stroke(); };
  switch (kind) {
    case 'knight': case 'plate': P([[-0.7, -0.75], [0.7, -0.75], [0.7, 0.1], [0, 0.85], [-0.7, 0.1]], true, !!fill); break;
    case 'mage': case 'rod': P([[0, -0.9], [0.2, -0.25], [0.85, 0], [0.2, 0.25], [0, 0.9], [-0.2, 0.25], [-0.85, 0], [-0.2, -0.25]], true, !!fill); break;
    case 'beast': g.beginPath(); g.ellipse(0, 0.3, r * 0.42, r * 0.36, 0, 0, 7); fill && g.fill(); g.stroke(); for (const [a, b] of [[-0.6, -0.3], [-0.22, -0.7], [0.22, -0.7], [0.6, -0.3]]) { g.beginPath(); g.arc(a * r, b * r, r * 0.16, 0, 7); g.fill(); } break;
    case 'undead': g.beginPath(); g.arc(0, -0.15 * r, r * 0.62, Math.PI, 0); g.lineTo(0.45 * r, 0.75 * r); g.lineTo(-0.45 * r, 0.75 * r); g.closePath(); fill && g.fill(); g.stroke(); g.fillStyle = fill ? '#fff' : col; g.beginPath(); g.arc(-0.24 * r, -0.05 * r, r * 0.15, 0, 7); g.arc(0.24 * r, -0.05 * r, r * 0.15, 0, 7); g.fill(); break;
    case 'ranger': P([[-0.8, 0.8], [0.6, -0.6]], false); P([[0.2, -0.75], [0.75, -0.75], [0.75, -0.2]], false); P([[-0.8, 0.8], [-0.8, 0.4]], false); P([[-0.8, 0.8], [-0.4, 0.8]], false); break;
    case 'rogue': case 'sword': P([[-0.7, 0.7], [0.55, -0.55]], false); P([[0.55, -0.55], [0.8, -0.8]], false); P([[-0.55, 0.25], [-0.25, 0.55]], false); break;
    case 'sylvan': case 'heart': if (kind === 'heart') { g.beginPath(); g.moveTo(0, 0.8 * r); g.bezierCurveTo(-1.1 * r, -0.1 * r, -0.5 * r, -0.95 * r, 0, -0.35 * r); g.bezierCurveTo(0.5 * r, -0.95 * r, 1.1 * r, -0.1 * r, 0, 0.8 * r); fill && g.fill(); g.stroke(); } else { g.beginPath(); g.moveTo(-0.7 * r, 0.7 * r); g.quadraticCurveTo(-0.8 * r, -0.7 * r, 0.8 * r, -0.8 * r); g.quadraticCurveTo(0.7 * r, 0.7 * r, -0.7 * r, 0.7 * r); fill && g.fill(); g.stroke(); P([[-0.7, 0.7], [0.3, -0.3]], false); } break;
    case 'ember': g.beginPath(); g.moveTo(0, -0.9 * r); g.quadraticCurveTo(0.9 * r, 0, 0.45 * r, 0.6 * r); g.quadraticCurveTo(0, 0.95 * r, -0.45 * r, 0.6 * r); g.quadraticCurveTo(-0.8 * r, 0.1 * r, -0.2 * r, -0.3 * r); g.quadraticCurveTo(0, -0.5 * r, 0, -0.9 * r); fill && g.fill(); g.stroke(); break;
    case 'tide': case 'tear': if (kind === 'tear') { g.beginPath(); g.moveTo(0, -0.9 * r); g.quadraticCurveTo(0.75 * r, 0.1 * r, 0.5 * r, 0.5 * r); g.arc(0, 0.35 * r, 0.52 * r, 0.2, Math.PI - 0.2); g.quadraticCurveTo(-0.75 * r, 0.1 * r, 0, -0.9 * r); fill && g.fill(); g.stroke(); } else { for (const yy of [-0.35, 0.3]) { g.beginPath(); g.moveTo(-0.85 * r, yy * r); g.quadraticCurveTo(-0.45 * r, (yy - 0.45) * r, 0, yy * r); g.quadraticCurveTo(0.45 * r, (yy + 0.45) * r, 0.85 * r, yy * r); g.stroke(); } } break;
    case 'gloom': g.beginPath(); g.arc(0, 0, r * 0.8, 0.6, Math.PI * 2 - 0.6); g.quadraticCurveTo(0.1 * r, 0, Math.cos(0.6) * 0.8 * r, Math.sin(0.6) * 0.8 * r); fill && g.fill(); g.stroke(); break;
    case 'quill': P([[-0.8, 0.8], [0.7, -0.7]], false); g.beginPath(); g.moveTo(0.7 * r, -0.7 * r); g.quadraticCurveTo(0.1 * r, -0.6 * r, -0.4 * r, 0.3 * r); g.quadraticCurveTo(0.5 * r, 0.1 * r, 0.7 * r, -0.7 * r); fill && g.fill(); g.stroke(); break;
    case 'thorn': g.beginPath(); g.arc(0, 0, r * 0.45, 0, 7); fill && g.fill(); g.stroke(); for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; P([[Math.cos(a) * 0.45, Math.sin(a) * 0.45], [Math.cos(a) * 0.9, Math.sin(a) * 0.9]], false); } break;
    case 'fang': g.beginPath(); g.moveTo(-0.6 * r, -0.7 * r); g.quadraticCurveTo(0, -0.95 * r, 0.6 * r, -0.7 * r); g.quadraticCurveTo(0.2 * r, 0.1 * r, 0, 0.9 * r); g.quadraticCurveTo(-0.2 * r, 0.1 * r, -0.6 * r, -0.7 * r); fill && g.fill(); g.stroke(); break;
    case 'nib': P([[0, -0.9], [0.55, 0], [0.15, 0.85], [-0.15, 0.85], [-0.55, 0]], true, !!fill); g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0.05 * r, r * 0.13, 0, 7); g.fill(); break;
    case 'feather': g.beginPath(); g.moveTo(-0.7 * r, 0.85 * r); g.quadraticCurveTo(-0.6 * r, -0.4 * r, 0.75 * r, -0.85 * r); g.quadraticCurveTo(0.4 * r, 0.4 * r, -0.7 * r, 0.85 * r); fill && g.fill(); g.stroke(); break;
    case 'gold': g.beginPath(); g.arc(0, 0, r * 0.8, 0, 7); g.fillStyle = '#e8b83a'; g.fill(); g.strokeStyle = '#8a5a1a'; g.stroke(); g.beginPath(); g.arc(0, 0, r * 0.45, 0, 7); g.stroke(); break;
    case 'life': g.beginPath(); g.moveTo(0, 0.8 * r); g.bezierCurveTo(-1.1 * r, -0.1 * r, -0.5 * r, -0.95 * r, 0, -0.35 * r); g.bezierCurveTo(0.5 * r, -0.95 * r, 1.1 * r, -0.1 * r, 0, 0.8 * r); g.fillStyle = fill || '#c8402e'; g.fill(); g.strokeStyle = '#6a1a1a'; g.stroke(); break;
    case 'trophy': g.fillStyle = fill || '#e8b83a'; g.beginPath(); g.moveTo(-0.6 * r, -0.8 * r); g.lineTo(0.6 * r, -0.8 * r); g.quadraticCurveTo(0.6 * r, 0.1 * r, 0, 0.25 * r); g.quadraticCurveTo(-0.6 * r, 0.1 * r, -0.6 * r, -0.8 * r); g.fill(); g.strokeStyle = '#6a4a1a'; g.stroke(); g.fillRect(-0.12 * r, 0.2 * r, 0.24 * r, 0.4 * r); g.fillRect(-0.4 * r, 0.6 * r, 0.8 * r, 0.22 * r); break;
    case 'star': { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); g.fillStyle = fill || col; g.fill(); g.strokeStyle = 'rgba(42,34,48,0.8)'; g.lineWidth = Math.max(0.8, r * 0.14); g.stroke(); break; }
    case 'reroll': g.beginPath(); g.arc(0, 0, r * 0.7, -0.3, Math.PI * 1.5); g.stroke(); P([[0, -0.95], [0.3, -0.7], [0, -0.45]], false); break;
    case 'up': P([[-0.6, 0.1], [0, -0.6], [0.6, 0.1]], false); P([[0, -0.6], [0, 0.8]], false); break;
    case 'lock': g.beginPath(); g.arc(0, -0.2 * r, r * 0.4, Math.PI, 0); g.stroke(); g.fillRect(-0.6 * r, -0.2 * r, 1.2 * r, 0.95 * r); break;
    case 'unlock': g.beginPath(); g.arc(0, -0.4 * r, r * 0.4, Math.PI, -0.2); g.stroke(); g.fillRect(-0.6 * r, -0.2 * r, 1.2 * r, 0.95 * r); break;
    case 'sound': P([[-0.8, -0.3], [-0.4, -0.3], [0.1, -0.75], [0.1, 0.75], [-0.4, 0.3], [-0.8, 0.3]], true, true); g.beginPath(); g.arc(0.15 * r, 0, r * 0.45, -0.8, 0.8); g.stroke(); g.beginPath(); g.arc(0.15 * r, 0, r * 0.75, -0.8, 0.8); g.stroke(); break;
    case 'mute': P([[-0.8, -0.3], [-0.4, -0.3], [0.1, -0.75], [0.1, 0.75], [-0.4, 0.3], [-0.8, 0.3]], true, true); P([[0.35, -0.35], [0.85, 0.35]], false); P([[0.85, -0.35], [0.35, 0.35]], false); break;
    case 'speed': P([[-0.8, -0.6], [-0.1, 0], [-0.8, 0.6]], true, true); P([[0, -0.6], [0.7, 0], [0, 0.6]], true, true); break;
    case 'menu': for (const yy of [-0.5, 0, 0.5]) P([[-0.7, yy], [0.7, yy]], false); break;
    case 'sell': g.beginPath(); g.arc(0, 0, r * 0.8, 0, 7); g.stroke(); P([[-0.35, -0.35], [0.35, 0.35]], false); P([[0.35, -0.35], [-0.35, 0.35]], false); break;
    default: g.beginPath(); g.arc(0, 0, r * 0.7, 0, 7); g.stroke();
  }
  g.restore();
}

export const COST_COL = { 1: '#9a9488', 2: '#4f8a52', 3: '#3d7fb8', 4: '#8a4ab8', 5: '#d0a030' };
export function preload() { for (const u of UNITS) unitSprite(u.id); unitSprite('minion'); }
export { ITEMS, TRAITS };

// a flat-colour copy of a sprite, for hit flashes and drag ghosts
export function silhouette(id, col = '#ffffff') {
  const key = 's:' + id + col;
  if (cache.has(key)) return cache.get(key);
  const src = unitSprite(id);
  const cv = makeCanvas(src.width, src.height);
  const g = cv.getContext('2d');
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = col; g.fillRect(0, 0, cv.width, cv.height);
  cache.set(key, cv);
  return cv;
}
export function drawSil(g, id, x, y, size, col, alpha, flip) {
  const s = size / SPR;
  g.save(); g.translate(x, y); if (flip) g.scale(-1, 1); g.globalAlpha *= alpha;
  g.drawImage(silhouette(id, col), -SPR * 0.47 * s, -SPR * 0.91 * s, size, size);
  g.restore();
}
