// ui.js - hand-made widgets: paper cards, painted buttons, text helpers.
// Everything is drawn in the 1280x720 logical space.

import { rng, rgba, rgb, shade, paperCard, ellipsePts, dab, ink, makeCanvas, wash, tracePoly, splat } from './paint.js';
import { SS } from './sprites.js';

export const FONT_T = "'Fell', 'IM Fell English SC', Georgia, serif";
export const FONT = "'Hand', 'Patrick Hand', 'Comic Sans MS', sans-serif";
export const INKC = '#2a2230';
export const PAPER = '#f3e9d2';

export function text(g, s, x, y, o = {}) {
  g.save();
  g.font = `${o.size ?? 18}px ${o.title ? FONT_T : FONT}`;
  g.textAlign = o.align ?? 'left';
  g.textBaseline = o.base ?? 'alphabetic';
  if (o.shadow) { g.fillStyle = o.shadow; g.fillText(s, x + 1.5, y + 1.5); }
  if (o.stroke) { g.strokeStyle = o.stroke; g.lineWidth = o.strokeW ?? 3; g.lineJoin = 'round'; g.strokeText(s, x, y); }
  g.fillStyle = o.color ?? INKC;
  g.globalAlpha *= o.alpha ?? 1;
  g.fillText(s, x, y);
  g.restore();
}

export function measure(g, s, size = 18, title = false) {
  g.save(); g.font = `${size}px ${title ? FONT_T : FONT}`; const w = g.measureText(s).width; g.restore(); return w;
}

// word-wrap into lines no wider than w
export function wrap(g, s, w, size = 18, title = false) {
  g.save(); g.font = `${size}px ${title ? FONT_T : FONT}`;
  const out = [];
  for (const para of String(s).split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const t = line ? line + ' ' + word : word;
      if (g.measureText(t).width > w && line) { out.push(line); line = word; } else line = t;
    }
    out.push(line);
  }
  g.restore();
  return out;
}
export function para(g, s, x, y, w, o = {}) {
  const size = o.size ?? 18, lh = o.lh ?? size * 1.25;
  const lines = wrap(g, s, w, size, o.title);
  lines.forEach((l, i) => text(g, l, x, y + i * lh, o));
  return lines.length * lh;
}

// ----- cached paper cards (painting a card each frame is too slow)
const cardCache = new Map();
export function card(g, x, y, w, h, o = {}) {
  const key = `${w | 0}x${h | 0}:${o.tint || ''}:${o.fill || ''}:${o.seed || 0}:${o.shadow !== false}`;
  let c = cardCache.get(key);
  if (!c) {
    c = makeCanvas((w + 16) * SS, (h + 16) * SS);
    const cg = c.getContext('2d');
    cg.scale(SS, SS); cg.translate(6, 6);
    paperCard(cg, 0, 0, w, h, rng(o.seed ?? (w * 7 + h)), o);
    // a little watercolor bloom so cards aren't flat
    const R = rng((o.seed ?? 3) + w);
    cg.save(); cg.globalAlpha = 0.5;
    wash(cg, ellipsePts(w * 0.75, h * 0.8, w * 0.35, h * 0.3, 10), o.tint ? rgb(o.tint) : [214, 190, 150], R, { layers: 5, alpha: 0.05, amt: 0.4, edge: 0 });
    cg.restore();
    if (cardCache.size > 200) cardCache.clear();
    cardCache.set(key, c);
  }
  g.drawImage(c, x - 6, y - 6, w + 16, h + 16);
}

// ----- buttons. Returns the rect so callers can hit-test.
export function button(g, b, hover, o = {}) {
  const { x, y, w, h } = b;
  const press = hover && o.down;
  g.save();
  if (press) g.translate(0, 1.5);
  card(g, x, y, w, h, { tint: o.tint ?? '#b8862a', fill: o.disabled ? '#ddd3bf' : (hover ? '#fbf3df' : '#f1e5c8'), seed: o.seed ?? (w | 0) });
  text(g, b.label, x + w / 2, y + h / 2 + (o.size ?? 22) * 0.33, { size: o.size ?? 22, align: 'center', title: o.title ?? true, color: o.disabled ? '#8a8070' : (o.color ?? INKC) });
  if (hover && !o.disabled) {
    g.strokeStyle = rgba(o.tint ?? '#b8862a', 0.55); g.lineWidth = 2;
    g.strokeRect(x + 3, y + 3, w - 6, h - 6);
  }
  g.restore();
  return b;
}

export function hit(b, x, y) { return b && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h; }
export function hitCircle(cx, cy, r, x, y) { return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; }

// ----- painted icons used in the HUD
const glyphCache = new Map();
export function glyph(name, size = 22) {
  const key = name + size;
  if (glyphCache.has(key)) return glyphCache.get(key);
  const c = makeCanvas(size * SS, size * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  const R = rng(name.length * 13 + size);
  const r = size / 2;
  g.translate(r, r);
  const fill = (pts, col, a = 0.4) => { dab(g, pts, rgb(col), R, { layers: 4, alpha: a, amt: 0.06 }); ink(g, [...pts, pts[0]], R, { w: 0.9, jitter: 0.15 }); };
  switch (name) {
    case 'heart': {
      const pts = [];
      for (let i = 0; i < 24; i++) { const t = i / 24 * Math.PI * 2; pts.push({ x: 16 * Math.sin(t) ** 3 * r / 18, y: -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * r / 18 }); }
      fill(pts, '#c8443a', 0.45);
      break;
    }
    case 'coin': fill(ellipsePts(0, 0, r * 0.82, r * 0.82, 16), '#e0b440', 0.45); ink(g, ellipsePts(0, 0, r * 0.55, r * 0.55, 14), R, { closed: true, w: 0.6, color: '#8a6a20' }); break;
    case 'skull': fill(ellipsePts(0, -1, r * 0.75, r * 0.7, 14), '#e8e0cc', 0.5); g.fillStyle = INKC; g.beginPath(); g.arc(-r * 0.3, -r * 0.1, r * 0.17, 0, 7); g.arc(r * 0.3, -r * 0.1, r * 0.17, 0, 7); g.fill(); break;
    case 'star': case 'starEmpty': {
      const pts = [];
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r * 0.92; pts.push({ x: Math.cos(a) * rr, y: Math.sin(a) * rr }); }
      if (name === 'star') fill(pts, '#f0c040', 0.5); else { g.globalAlpha = 0.5; ink(g, [...pts, pts[0]], R, { w: 1, jitter: 0.15 }); }
      break;
    }
    case 'sword': ink(g, [{ x: -r * 0.6, y: r * 0.6 }, { x: r * 0.6, y: -r * 0.6 }], R, { w: 2, color: '#7a8894' }); ink(g, [{ x: -r * 0.6, y: r * 0.1 }, { x: -r * 0.1, y: r * 0.6 }], R, { w: 1.6, color: '#8a6a3a' }); break;
    case 'shield': fill([{ x: -r * 0.7, y: -r * 0.7 }, { x: r * 0.7, y: -r * 0.7 }, { x: r * 0.7, y: 0 }, { x: 0, y: r * 0.85 }, { x: -r * 0.7, y: 0 }], '#7a8a9a'); break;
    case 'magicshield': fill([{ x: -r * 0.7, y: -r * 0.7 }, { x: r * 0.7, y: -r * 0.7 }, { x: r * 0.7, y: 0 }, { x: 0, y: r * 0.85 }, { x: -r * 0.7, y: 0 }], '#8a6ac8'); break;
    case 'clock': fill(ellipsePts(0, 0, r * 0.8, r * 0.8, 14), '#e8dcc0'); ink(g, [{ x: 0, y: 0 }, { x: 0, y: -r * 0.5 }], R, { w: 1 }); ink(g, [{ x: 0, y: 0 }, { x: r * 0.35, y: r * 0.1 }], R, { w: 1 }); break;
    case 'range': ink(g, ellipsePts(0, 0, r * 0.8, r * 0.6, 16), R, { closed: true, w: 1, color: '#4a6a8a' }); g.fillStyle = '#4a6a8a'; g.beginPath(); g.arc(0, 0, 2, 0, 7); g.fill(); break;
    case 'boot': fill([{ x: -r * 0.4, y: -r * 0.7 }, { x: r * 0.1, y: -r * 0.7 }, { x: r * 0.1, y: r * 0.2 }, { x: r * 0.75, y: r * 0.35 }, { x: r * 0.75, y: r * 0.7 }, { x: -r * 0.4, y: r * 0.7 }], '#8a6a48'); break;
    case 'lock': fill([{ x: -r * 0.6, y: -r * 0.1 }, { x: r * 0.6, y: -r * 0.1 }, { x: r * 0.6, y: r * 0.75 }, { x: -r * 0.6, y: r * 0.75 }], '#a08a5a'); ink(g, [{ x: -r * 0.35, y: -r * 0.1 }, { x: -r * 0.35, y: -r * 0.55 }, { x: r * 0.35, y: -r * 0.55 }, { x: r * 0.35, y: -r * 0.1 }], R, { w: 1.3 }); break;
    case 'flag': ink(g, [{ x: -r * 0.4, y: r * 0.85 }, { x: -r * 0.4, y: -r * 0.85 }], R, { w: 1.5, color: '#5a4030' }); fill([{ x: -r * 0.4, y: -r * 0.85 }, { x: r * 0.8, y: -r * 0.5 }, { x: -r * 0.4, y: -r * 0.05 }], '#c8443a'); break;
    case 'wing': fill([{ x: -r * 0.8, y: r * 0.3 }, { x: 0, y: -r * 0.7 }, { x: r * 0.8, y: -r * 0.6 }, { x: r * 0.3, y: r * 0.1 }, { x: r * 0.6, y: r * 0.4 }], '#8aa0b8'); break;
  }
  const out = { c, size };
  glyphCache.set(key, out);
  return out;
}
export function drawGlyph(g, name, x, y, size = 22) {
  const gl = glyph(name, size);
  g.drawImage(gl.c, x - size / 2, y - size / 2, size, size);
}

// a circular cooldown wipe (paint darkening clockwise)
export function cooldownWipe(g, x, y, r, frac) {
  if (frac <= 0) return;
  g.save();
  g.fillStyle = 'rgba(30,22,34,0.55)';
  g.beginPath(); g.moveTo(x, y);
  g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * frac);
  g.closePath(); g.fill();
  g.restore();
}

// hand-drawn health bar
export function hpBar(g, x, y, w, frac, col = '#c8443a') {
  g.save();
  g.fillStyle = 'rgba(40,30,40,0.55)';
  g.fillRect(x - w / 2 - 1, y - 1, w + 2, 4.5);
  g.fillStyle = frac > 0.5 ? '#7aa84a' : frac > 0.25 ? '#d8a83a' : col;
  g.fillRect(x - w / 2, y, w * Math.max(0, frac), 2.5);
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(x - w / 2, y, w * Math.max(0, frac), 0.9);
  g.restore();
}

// painted ink "banner" across the middle, used for wave/boss announcements
export function bannerText(g, s, y, alpha, o = {}) {
  g.save();
  g.globalAlpha = alpha;
  const w = measure(g, s, o.size ?? 44, true) + 80;
  card(g, 640 - w / 2, y - 34, w, 56, { tint: o.tint ?? '#2a2230', fill: '#efe2c4', seed: 9 });
  text(g, s, 640, y + 6, { size: o.size ?? 44, align: 'center', title: true, color: o.color ?? INKC });
  g.restore();
}
