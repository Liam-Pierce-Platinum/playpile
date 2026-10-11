// The jewel-box look: enamel gem blocks (cached sprites + animated gold/foil overlays),
// the velvet background, tarot charm cards with procedural emblems, outlined numbers.
import { COLORS, RARITY } from './data.js';

export const FONT = "'Lilita One', 'Arial Black', sans-serif";
export const UIFONT = "'Nunito', 'Segoe UI', sans-serif";

// ---------------------------------------------------------------- colour utils
const hexRgb = h => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
export function mix(h, k, to = 255) { // k>0 toward white (or `to`), k<0 toward black
  const c = hexRgb(h), t = k >= 0 ? to : 0, a = Math.abs(k);
  return `rgb(${c.map(v => Math.round(v + (t - v) * a)).join(',')})`;
}
export const rgba = (h, a) => { const c = hexRgb(h); return `rgba(${c[0]},${c[1]},${c[2]},${a})`; };

export function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// outlined chunky number/text
export function otext(g, s, x, y, size, fill, opts = {}) {
  g.font = `${opts.weight || ''} ${size}px ${opts.font || FONT}`;
  g.textAlign = opts.align || 'center'; g.textBaseline = opts.base || 'middle';
  g.lineJoin = 'round';
  if (opts.shadow !== false) { g.fillStyle = 'rgba(5,2,14,.55)'; g.fillText(s, x, y + Math.max(2, size * 0.08)); }
  g.lineWidth = opts.lw ?? Math.max(3, size * 0.16); g.strokeStyle = opts.stroke || '#120826'; g.strokeText(s, x, y);
  g.fillStyle = fill; g.fillText(s, x, y);
}
export const fmt = n => Math.floor(n).toLocaleString('en-US');
export function short(n) {
  n = Math.floor(n);
  if (n < 100000) return fmt(n);
  if (n < 1e6) return (n / 1000).toFixed(n < 1e5 ? 1 : 0) + 'K';
  if (n < 1e9) return (n / 1e6).toFixed(2).replace(/\.?0+$/, '') + 'M';
  return n.toExponential(2).replace('e+', 'e');
}

// ---------------------------------------------------------------- blocks
const SPR = new Map();
const MATCOL = { gold: '#ffc23a', stone: '#82808f' };
function blockSprite(ci, mat, s, hp, dpr) {
  const key = `${ci}|${mat}|${s}|${hp}|${dpr}`;
  let c = SPR.get(key);
  if (c) return c;
  if (SPR.size > 600) SPR.clear();
  c = document.createElement('canvas');
  const pad = Math.ceil(s * 0.12);
  c.width = Math.ceil((s + pad * 2) * dpr); c.height = Math.ceil((s + pad * 2) * dpr);
  const g = c.getContext('2d');
  g.scale(dpr, dpr); g.translate(pad, pad);
  paintBlock(g, s, ci, mat, hp);
  c.pad = pad;
  SPR.set(key, c);
  return c;
}
function paintBlock(g, s, ci, mat, hp) {
  const base = MATCOL[mat] || COLORS[ci % 7].h;
  const ins = Math.max(1, s * 0.045), x = ins, y = ins, w = s - ins * 2, r = s * 0.2;
  // drop shadow
  g.fillStyle = 'rgba(4,1,12,.45)'; rrect(g, x, y + s * 0.06, w, w, r); g.fill();
  if (mat === 'glass') {
    const gr = g.createLinearGradient(0, y, 0, y + w);
    gr.addColorStop(0, rgba(base, 0.55)); gr.addColorStop(1, rgba(base, 0.22));
    rrect(g, x, y, w, w, r); g.fillStyle = gr; g.fill();
    g.save(); rrect(g, x, y, w, w, r); g.clip();
    g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = Math.max(1, s * 0.05);
    g.beginPath(); g.moveTo(x + w * 0.15, y + w * 1.0); g.lineTo(x + w * 0.95, y + w * 0.1); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.3)'; g.lineWidth = Math.max(1, s * 0.025);
    g.beginPath(); g.moveTo(x + w * 0.38, y + w * 1.05); g.lineTo(x + w * 1.05, y + w * 0.32); g.stroke();
    g.restore();
    rrect(g, x + 0.5, y + 0.5, w - 1, w - 1, r); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1.2; g.stroke();
    return;
  }
  // body: vertical enamel gradient
  const gr = g.createLinearGradient(0, y, 0, y + w);
  if (mat === 'gold') { gr.addColorStop(0, '#fff2a8'); gr.addColorStop(0.4, '#ffc43a'); gr.addColorStop(0.75, '#d68a00'); gr.addColorStop(1, '#8a5200'); }
  else { gr.addColorStop(0, mix(base, 0.32)); gr.addColorStop(0.45, base); gr.addColorStop(1, mix(base, -0.38)); }
  rrect(g, x, y, w, w, r); g.fillStyle = gr; g.fill();
  // table facet (inner face), slightly brighter, so it reads as a cut gem
  const f = s * 0.15, fw = w - f * 2;
  const gf = g.createLinearGradient(0, y + f, 0, y + f + fw);
  gf.addColorStop(0, mix(base, 0.22)); gf.addColorStop(1, mix(base, -0.08));
  rrect(g, x + f, y + f * 0.8, fw, fw, r * 0.55); g.fillStyle = gf; g.fill();
  // bevel shading: darker bottom band
  g.save(); rrect(g, x, y, w, w, r); g.clip();
  const gb = g.createLinearGradient(0, y + w * 0.7, 0, y + w);
  gb.addColorStop(0, 'rgba(0,0,0,0)'); gb.addColorStop(1, 'rgba(10,0,30,.35)');
  g.fillStyle = gb; g.fillRect(x, y + w * 0.7, w, w * 0.3);
  // gloss
  const gg = g.createRadialGradient(x + w * 0.3, y + w * 0.22, 0, x + w * 0.3, y + w * 0.22, w * 0.5);
  gg.addColorStop(0, 'rgba(255,255,255,.42)'); gg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gg; g.fillRect(x, y, w, w);
  if (mat === 'stone') {
    let sd = 7;
    const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    for (let k = 0; k < 26; k++) { g.fillStyle = rnd() < 0.5 ? 'rgba(20,18,30,.35)' : 'rgba(255,255,255,.18)'; const d = s * (0.03 + rnd() * 0.04); g.fillRect(x + rnd() * w, y + rnd() * w, d, d); }
    if (hp === 1) {
      g.strokeStyle = 'rgba(15,10,25,.85)'; g.lineWidth = Math.max(1.2, s * 0.05); g.lineJoin = 'miter';
      g.beginPath(); g.moveTo(x + w * 0.2, y); g.lineTo(x + w * 0.45, y + w * 0.35); g.lineTo(x + w * 0.32, y + w * 0.55); g.lineTo(x + w * 0.62, y + w); g.stroke();
      g.beginPath(); g.moveTo(x + w * 0.45, y + w * 0.35); g.lineTo(x + w * 0.85, y + w * 0.45); g.stroke();
    }
  }
  if (mat === 'gem') {
    g.strokeStyle = 'rgba(255,255,255,.45)'; g.lineWidth = Math.max(1, s * 0.03);
    const cx = x + w / 2, cy = y + w / 2, d = w * 0.3;
    g.beginPath(); g.moveTo(cx, cy - d); g.lineTo(cx + d, cy); g.lineTo(cx, cy + d); g.lineTo(cx - d, cy); g.closePath(); g.stroke();
    for (const [a, b] of [[x, y], [x + w, y], [x + w, y + w], [x, y + w]]) { g.beginPath(); g.moveTo(a, b); g.lineTo(cx + (a - cx) * 0.42, cy + (b - cy) * 0.42); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,.9)'; star4(g, cx + d * 0.6, cy - d * 0.7, s * 0.09);
  }
  g.restore();
  // 1px top highlight + outline
  g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(x + r * 0.9, y + 1); g.lineTo(x + w - r * 0.9, y + 1); g.stroke();
  rrect(g, x + 0.5, y + 0.5, w - 1, w - 1, r); g.strokeStyle = 'rgba(8,2,20,.45)'; g.stroke();
}
function star4(g, x, y, r) {
  g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r);
  g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
}

// draw one block. t = time, used for the gold sweep and foil shimmer.
export function block(g, x, y, s, ci, mat, t = 0, dpr = 1, o = {}) {
  if (mat === 'void') { voidCell(g, x, y, s); return; }
  const m = mat === 'n' ? '' : mat;
  const spr = blockSprite(ci, m === 'foil' ? '' : m, Math.round(s), o.hp || 0, dpr);
  const pad = spr.pad * s / Math.round(s);
  g.drawImage(spr, x - pad, y - pad, s + pad * 2, s + pad * 2);
  if (m === 'gold' || m === 'foil') {
    const ins = s * 0.045, w = s - ins * 2;
    g.save(); rrect(g, x + ins, y + ins, w, w, s * 0.2); g.clip();
    if (m === 'gold') {
      const p = ((t * 0.55 + (x + y) * 0.0016) % 1.6) - 0.3;
      const bx = x - s + p * s * 3;
      const gr = g.createLinearGradient(bx, y, bx + s * 0.8, y + s);
      gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,240,.75)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, y, s, s);
    } else {
      // the rainbow sheet is a cached sprite per hue phase (24 steps), not a 7-stop gradient per block
      const off = (t * 90 + x * 0.6 + y * 0.4) % 360;
      const spr = foilSprite(Math.round(off / 15) % 24, Math.round(s), dpr);
      g.globalCompositeOperation = 'overlay'; g.drawImage(spr, x, y, s, s);
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.18; g.drawImage(spr, x, y, s, s);
    }
    g.restore();
  }
}
const FOIL = new Map();
function foilSprite(ph, s, dpr) {
  const key = `${ph}|${s}|${dpr}`;
  let c = FOIL.get(key);
  if (c) return c;
  if (FOIL.size > 200) FOIL.clear();
  c = document.createElement('canvas'); c.width = Math.ceil(s * dpr); c.height = Math.ceil(s * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const gr = g.createLinearGradient(0, 0, s, s);
  for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, `hsla(${(ph * 15 + k * 60) % 360},100%,65%,.55)`);
  g.fillStyle = gr; g.fillRect(0, 0, s, s);
  FOIL.set(key, c);
  return c;
}
function voidCell(g, x, y, s) {
  g.save();
  rrect(g, x + 1, y + 1, s - 2, s - 2, s * 0.15); g.fillStyle = '#05030b'; g.fill(); g.clip();
  g.strokeStyle = 'rgba(255,77,109,.18)'; g.lineWidth = 2;
  for (let k = -s; k < s; k += s / 4) { g.beginPath(); g.moveTo(x + k, y + s); g.lineTo(x + k + s, y); g.stroke(); }
  g.restore();
}
export function ghostBlock(g, x, y, s, hex, a) {
  const ins = s * 0.06;
  rrect(g, x + ins, y + ins, s - ins * 2, s - ins * 2, s * 0.2);
  g.fillStyle = rgba(hex, a * 0.35); g.fill();
  g.strokeStyle = rgba(hex, a); g.lineWidth = 2; g.stroke();
}

// ---------------------------------------------------------------- background
// The velvet (gradient + grain + vignette) is painted once per size. The five drifting
// light blobs are the only animated part and they are drawn on a quarter-resolution layer
// that is scaled up, so a phone frame costs 1/16 of the full-screen gradient fills.
let BG = null;
export function background(g, w, h, t, dpr, energy = 0) {
  if (!BG || BG.w !== w || BG.h !== h || BG.dpr !== dpr) {
    const c = document.createElement('canvas'); c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const b = c.getContext('2d'); b.scale(dpr, dpr);
    const gr = b.createLinearGradient(0, 0, w * 0.6, h);
    gr.addColorStop(0, '#1a0f2e'); gr.addColorStop(1, '#0d1630');
    b.fillStyle = gr; b.fillRect(0, 0, w, h);
    // fine velvet grain
    const id = b.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 9; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    b.putImageData(id, 0, 0);
    // vignette is static too
    const v = b.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(2,0,10,.55)');
    b.fillStyle = v; b.fillRect(0, 0, w, h);
    const lw = Math.max(1, Math.ceil(w / 4)), lh = Math.max(1, Math.ceil(h / 4));
    const lc = document.createElement('canvas'); lc.width = lw; lc.height = lh;
    BG = { c, w, h, dpr, lc, lg: lc.getContext('2d'), lw, lh };
  }
  g.drawImage(BG.c, 0, 0, w, h);
  // drifting soft light blobs on the low-res layer
  const L = BG.lg, lw = BG.lw, lh = BG.lh;
  L.globalCompositeOperation = 'source-over'; L.clearRect(0, 0, lw, lh);
  L.globalCompositeOperation = 'lighter';
  const blobs = [['#a66bff', 0.11], ['#2fd3c5', 0.07], ['#ff7ad9', 0.07], ['#4c7dff', 0.09], ['#ffb020', 0.04]];
  const R = Math.max(lw, lh) * 0.42;
  blobs.forEach(([col, a], k) => {
    const bx = lw * (0.5 + 0.42 * Math.sin(t * 0.05 * (1 + k * 0.3) + k * 2.1));
    const by = lh * (0.5 + 0.38 * Math.cos(t * 0.04 * (1 + k * 0.25) + k * 1.3));
    const gr = L.createRadialGradient(bx, by, 0, bx, by, R);
    gr.addColorStop(0, rgba(col, a * (1 + energy * 0.8))); gr.addColorStop(1, rgba(col, 0));
    L.fillStyle = gr; L.fillRect(0, 0, lw, lh);
  });
  g.save(); g.globalCompositeOperation = 'lighter'; g.imageSmoothingEnabled = true;
  g.drawImage(BG.lc, 0, 0, w, h);
  g.restore();
}

// glassy panel
export function panel(g, x, y, w, h, r = 14, a = 1) {
  rrect(g, x, y, w, h, r);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, `rgba(255,255,255,${0.07 * a})`); gr.addColorStop(1, `rgba(255,255,255,${0.025 * a})`);
  g.fillStyle = gr; g.fill();
  g.strokeStyle = `rgba(255,255,255,${0.1 * a})`; g.lineWidth = 1; g.stroke();
}

// inset board well. The well (fill, inner shadow, 64 empty cells) and the streak glow are
// pre-rendered sprites per size, so no shadowBlur runs per frame.
const WELL = new Map();
const GLOWPAD = 60;
function wellSprite(s, cell, n, dpr) {
  const key = `${s}|${cell}|${n}|${dpr}`;
  let c = WELL.get(key);
  if (c) return c;
  if (WELL.size > 12) WELL.clear();
  const pad = cell * 0.22, r = cell * 0.45, P = Math.ceil(pad) + 2;
  c = document.createElement('canvas'); c.width = Math.ceil((s + P * 2) * dpr); c.height = Math.ceil((s + P * 2) * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.translate(P, P);
  const x = 0, y = 0;
  rrect(g, x - pad, y - pad, s + pad * 2, s + pad * 2, r);
  const gr = g.createLinearGradient(0, y - pad, 0, y + s + pad);
  gr.addColorStop(0, '#0b0619'); gr.addColorStop(1, '#130c27');
  g.fillStyle = gr; g.fill();
  g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1.5; g.stroke();
  g.save(); rrect(g, x - pad, y - pad, s + pad * 2, s + pad * 2, r); g.clip();
  g.shadowColor = 'rgba(0,0,0,.85)'; g.shadowBlur = cell * 0.4; g.shadowOffsetY = cell * 0.08;
  g.beginPath();
  g.rect(x - pad - 200, y - pad - 200, s + pad * 2 + 400, s + pad * 2 + 400);
  g.moveTo(x - pad + r, y - pad); g.arcTo(x - pad, y - pad, x - pad, y + s + pad, r); g.arcTo(x - pad, y + s + pad, x + s + pad, y + s + pad, r);
  g.arcTo(x + s + pad, y + s + pad, x + s + pad, y - pad, r); g.arcTo(x + s + pad, y - pad, x - pad, y - pad, r); g.closePath();
  g.fillStyle = '#000'; g.fill('evenodd');
  g.restore();
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const cx = x + i * cell, cy = y + j * cell;
    rrect(g, cx + cell * 0.06, cy + cell * 0.06, cell * 0.88, cell * 0.88, cell * 0.18);
    g.fillStyle = 'rgba(255,255,255,.028)'; g.fill();
    g.strokeStyle = 'rgba(255,255,255,.045)'; g.lineWidth = 1; g.stroke();
  }
  c.P = P;
  WELL.set(key, c);
  return c;
}
const GLOW = new Map();
function glowSprite(s, cell, hex, dpr) {
  const key = `${s}|${cell}|${hex}|${dpr}`;
  let c = GLOW.get(key);
  if (c) return c;
  if (GLOW.size > 24) GLOW.clear();
  const pad = cell * 0.22, r = cell * 0.45, P = GLOWPAD;
  c = document.createElement('canvas'); c.width = Math.ceil((s + P * 2) * dpr); c.height = Math.ceil((s + P * 2) * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr); g.translate(P, P);
  g.shadowColor = hex; g.shadowBlur = 44;
  rrect(g, -pad, -pad, s + pad * 2, s + pad * 2, r); g.strokeStyle = rgba(hex, 0.85); g.lineWidth = 4.5; g.stroke();
  g.shadowBlur = 0; rrect(g, -pad, -pad, s + pad * 2, s + pad * 2, r); g.strokeStyle = rgba(hex, 0.5); g.lineWidth = 2; g.stroke();
  c.P = P;
  GLOW.set(key, c);
  return c;
}
export function boardWell(g, x, y, s, cell, n, glowHex, glow, dpr = 1) {
  if (glow > 0.02) {
    const gs = glowSprite(s, cell, glowHex, dpr), P = gs.P;
    g.save(); g.globalAlpha = Math.min(1, glow);
    g.drawImage(gs, x - P, y - P, s + P * 2, s + P * 2);
    g.restore();
  }
  const ws = wellSprite(s, cell, n, dpr), P = ws.P;
  g.drawImage(ws, x - P, y - P, s + P * 2, s + P * 2);
}

// ---------------------------------------------------------------- emblems
const P = {
  poly(g, pts) { g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); },
  circ(g, x, y, r) { g.moveTo(x + r, y); g.arc(x, y, r, 0, Math.PI * 2); },
  rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); },
  star(g, n, r1, r2, rot = -Math.PI / 2) { for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, r = i % 2 ? r2 : r1; i ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); },
};
const blocks = (g, cells, s = 0.42) => { for (const [x, y] of cells) P.rr(g, x * s - s * 0.46, y * s - s * 0.46, s * 0.92, s * 0.92, s * 0.2); };
// each returns nothing; it adds subpaths. `line` emblems are stroked thick instead of filled.
const EM = {
  hand: g => { P.rr(g, -0.45, -0.1, 0.8, 0.85, 0.2); for (let k = 0; k < 4; k++) P.rr(g, -0.45 + k * 0.2, -0.75, 0.16, 0.75, 0.08); P.rr(g, 0.25, 0.05, 0.5, 0.22, 0.1); },
  coin: g => { P.circ(g, 0, 0, 0.8); },
  corner: g => blocks(g, [[-1, -1], [-1, 0], [-1, 1], [0, 1], [1, 1]], 0.5),
  arrowR: g => P.poly(g, [-0.8, -0.25, 0.1, -0.25, 0.1, -0.65, 0.85, 0, 0.1, 0.65, 0.1, 0.25, -0.8, 0.25]),
  arrowU: g => P.poly(g, [-0.25, 0.8, -0.25, -0.1, -0.65, -0.1, 0, -0.85, 0.65, -0.1, 0.25, -0.1, 0.25, 0.8]),
  fish: g => { g.ellipse(-0.1, 0, 0.55, 0.38, 0, 0, Math.PI * 2); P.poly(g, [0.35, 0, 0.85, -0.45, 0.85, 0.45]); },
  anvil: g => P.poly(g, [-0.85, -0.45, 0.6, -0.45, 0.85, -0.2, 0.3, -0.05, 0.25, 0.35, 0.55, 0.6, -0.55, 0.6, -0.25, 0.35, -0.3, -0.05, -0.85, -0.2]),
  twin: g => { P.rr(g, -0.8, -0.6, 0.85, 0.85, 0.2); P.rr(g, -0.05, -0.25, 0.85, 0.85, 0.2); },
  frame: g => { P.rr(g, -0.8, -0.8, 1.6, 1.6, 0.25); P.rr(g, -0.42, -0.42, 0.84, 0.84, 0.12); },
  jar: g => { P.rr(g, -0.55, -0.4, 1.1, 1.2, 0.3); P.rr(g, -0.42, -0.75, 0.84, 0.3, 0.08); },
  bar: g => blocks(g, [[-1.5, 0], [-0.5, 0], [0.5, 0], [1.5, 0]], 0.42),
  square: g => blocks(g, [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]], 0.62),
  bolt: g => P.poly(g, [0.2, -0.9, -0.55, 0.12, -0.05, 0.12, -0.25, 0.9, 0.55, -0.15, 0.05, -0.15]),
  flame: g => { g.moveTo(0, -0.9); g.bezierCurveTo(0.5, -0.35, 0.75, 0.05, 0.6, 0.4); g.bezierCurveTo(0.45, 0.85, -0.45, 0.85, -0.6, 0.4); g.bezierCurveTo(-0.72, 0.05, -0.35, -0.2, -0.2, -0.45); g.bezierCurveTo(-0.05, -0.2, 0.05, -0.5, 0, -0.9); g.closePath(); },
  plus: g => P.poly(g, [-0.25, -0.8, 0.25, -0.8, 0.25, -0.25, 0.8, -0.25, 0.8, 0.25, 0.25, 0.25, 0.25, 0.8, -0.25, 0.8, -0.25, 0.25, -0.8, 0.25, -0.8, -0.25, -0.25, -0.25]),
  tag: g => { P.poly(g, [-0.8, -0.35, 0.3, -0.35, 0.8, 0, 0.3, 0.35, -0.8, 0.35]); P.circ(g, 0.3, 0, 0.1); },
  spiral: 'line',
  heart: g => { g.moveTo(0, 0.8); g.bezierCurveTo(-0.9, 0.15, -0.95, -0.55, -0.45, -0.7); g.bezierCurveTo(-0.15, -0.78, 0, -0.5, 0, -0.38); g.bezierCurveTo(0, -0.5, 0.15, -0.78, 0.45, -0.7); g.bezierCurveTo(0.95, -0.55, 0.9, 0.15, 0, 0.8); g.closePath(); },
  eye: g => { g.moveTo(-0.9, 0); g.quadraticCurveTo(0, -0.85, 0.9, 0); g.quadraticCurveTo(0, 0.85, -0.9, 0); g.closePath(); P.circ(g, 0, 0, 0.3); },
  leaf: g => { g.moveTo(-0.7, 0.7); g.quadraticCurveTo(-0.75, -0.65, 0.75, -0.75); g.quadraticCurveTo(0.65, 0.75, -0.7, 0.7); g.closePath(); },
  wave: 'line', spiralL: 'line',
  moon: g => { g.arc(0, 0, 0.8, Math.PI * 0.3, Math.PI * 1.7, false); g.arc(0.35, -0.1, 0.62, Math.PI * 1.55, Math.PI * 0.45, true); g.closePath(); },
  star: g => P.star(g, 5, 0.9, 0.4),
  flower: g => { for (let k = 0; k < 5; k++) { const a = k * Math.PI * 0.4 - Math.PI / 2; P.circ(g, Math.cos(a) * 0.45, Math.sin(a) * 0.45, 0.36); } },
  seven: 'text:7', cross: g => { P.rr(g, -0.85, -0.2, 1.7, 0.4, 0.1); P.rr(g, -0.2, -0.85, 0.4, 1.7, 0.1); },
  wheel: g => { P.circ(g, 0, 0, 0.85); P.circ(g, 0, 0, 0.6); for (let k = 0; k < 4; k++) { g.save(); g.rotate(k * Math.PI / 4); P.rr(g, -0.62, -0.06, 1.24, 0.12, 0.05); g.restore(); } },
  rings: 'line', nugget: g => P.poly(g, [-0.75, 0.2, -0.45, -0.45, 0.1, -0.65, 0.65, -0.35, 0.85, 0.2, 0.4, 0.6, -0.35, 0.6]),
  flask: g => P.poly(g, [-0.2, -0.85, 0.2, -0.85, 0.2, -0.3, 0.75, 0.6, 0.6, 0.8, -0.6, 0.8, -0.75, 0.6, -0.2, -0.3]),
  fan: g => { g.moveTo(0, 0.6); g.arc(0, 0.6, 1.2, -Math.PI * 0.82, -Math.PI * 0.18); g.closePath(); },
  pane: g => { P.rr(g, -0.75, -0.75, 1.5, 1.5, 0.15); },
  vault: g => { P.rr(g, -0.8, -0.8, 1.6, 1.6, 0.2); P.circ(g, 0, 0, 0.42); },
  hourglass: g => P.poly(g, [-0.6, -0.85, 0.6, -0.85, 0.08, 0, 0.6, 0.85, -0.6, 0.85, -0.08, 0]),
  chest: g => { P.rr(g, -0.8, -0.15, 1.6, 0.9, 0.12); g.moveTo(-0.8, -0.2); g.quadraticCurveTo(0, -0.95, 0.8, -0.2); g.closePath(); },
  book: g => { P.poly(g, [-0.85, -0.6, -0.05, -0.45, -0.05, 0.75, -0.85, 0.6]); P.poly(g, [0.85, -0.6, 0.05, -0.45, 0.05, 0.75, 0.85, 0.6]); },
  loop: 'line', clock: g => { P.circ(g, 0, 0, 0.85); },
  rocket: g => { g.moveTo(0, -0.9); g.quadraticCurveTo(0.45, -0.4, 0.3, 0.45); g.lineTo(-0.3, 0.45); g.quadraticCurveTo(-0.45, -0.4, 0, -0.9); g.closePath(); P.poly(g, [-0.3, 0.1, -0.6, 0.65, -0.25, 0.5]); P.poly(g, [0.3, 0.1, 0.6, 0.65, 0.25, 0.5]); },
  scroll: g => { P.rr(g, -0.6, -0.7, 1.2, 1.4, 0.1); P.rr(g, -0.8, -0.85, 1.6, 0.3, 0.15); P.rr(g, -0.8, 0.55, 1.6, 0.3, 0.15); },
  pick: g => { g.moveTo(-0.85, -0.3); g.quadraticCurveTo(0, -0.95, 0.85, -0.3); g.quadraticCurveTo(0, -0.62, -0.85, -0.3); g.closePath(); P.poly(g, [-0.1, -0.6, 0.1, -0.6, 0.12, 0.9, -0.12, 0.9]); },
  // a block with a bite taken out of it (the Glutton), with an eye hole
  mouth: g => { P.poly(g, [-0.75, -0.85, 0.55, -0.85, 0.85, -0.55, 0.85, -0.3, 0.2, 0.02, 0.85, 0.34, 0.85, 0.55, 0.55, 0.85, -0.75, 0.85, -0.85, 0.75, -0.85, -0.75]); P.circ(g, -0.35, -0.38, 0.15); },
  snow: g => { for (let k = 0; k < 3; k++) { g.save(); g.rotate(k * Math.PI / 3); P.rr(g, -0.88, -0.09, 1.76, 0.18, 0.08); g.restore(); } P.circ(g, 0, 0, 0.25); },
  shard: g => { P.poly(g, [-0.2, -0.9, 0.35, -0.1, -0.05, 0.3]); P.poly(g, [0.5, -0.5, 0.85, 0.3, 0.3, 0.15]); P.poly(g, [-0.75, 0.0, -0.1, 0.5, -0.5, 0.85]); },
  prism: g => P.poly(g, [0, -0.85, 0.85, 0.7, -0.85, 0.7]),
  broom: g => { P.poly(g, [0.75, -0.9, 0.88, -0.78, 0.05, 0.1, -0.08, -0.03]); P.poly(g, [-0.15, -0.15, 0.2, 0.2, -0.3, 0.85, -0.85, 0.3]); },
  chain: 'line', ticket: g => { g.moveTo(-0.85, -0.45); g.lineTo(0.85, -0.45); g.arc(0.85, 0, 0.18, -Math.PI / 2, Math.PI / 2, true); g.lineTo(-0.85, 0.45); g.arc(-0.85, 0, 0.18, Math.PI / 2, -Math.PI / 2, true); g.closePath(); },
  bag: g => { g.moveTo(-0.25, -0.5); g.bezierCurveTo(-0.95, 0, -0.85, 0.85, 0, 0.85); g.bezierCurveTo(0.85, 0.85, 0.95, 0, 0.25, -0.5); g.closePath(); P.poly(g, [-0.35, -0.85, 0.35, -0.85, 0.2, -0.5, -0.2, -0.5]); },
  crownS: g => P.poly(g, [-0.85, 0.6, -0.85, -0.45, -0.4, 0, 0, -0.75, 0.4, 0, 0.85, -0.45, 0.85, 0.6]),
  crown: g => { P.poly(g, [-0.9, 0.65, -0.8, -0.55, -0.4, -0.05, 0, -0.85, 0.4, -0.05, 0.8, -0.55, 0.9, 0.65]); },
  mountain: g => { P.poly(g, [-0.9, 0.7, -0.25, -0.6, 0.35, 0.7]); P.poly(g, [-0.05, 0.7, 0.45, -0.2, 0.92, 0.7]); },
  dozer: g => { P.rr(g, -0.55, -0.5, 0.75, 0.6, 0.1); P.rr(g, -0.75, 0.15, 1.1, 0.5, 0.25); P.poly(g, [0.45, -0.55, 0.9, -0.55, 0.9, 0.7, 0.45, 0.7, 0.62, 0.1]); },
  house: g => P.poly(g, [0, -0.85, 0.85, -0.1, 0.62, -0.1, 0.62, 0.8, -0.62, 0.8, -0.62, -0.1, -0.85, -0.1]),
  stone: g => P.poly(g, [-0.45, -0.8, 0.45, -0.8, 0.88, 0, 0.45, 0.8, -0.45, 0.8, -0.88, 0]),
  mirror: g => { g.ellipse(0, -0.2, 0.55, 0.68, 0, 0, Math.PI * 2); P.rr(g, -0.12, 0.42, 0.24, 0.5, 0.08); },
  note: g => { g.ellipse(-0.35, 0.55, 0.32, 0.24, -0.4, 0, Math.PI * 2); P.rr(g, -0.12, -0.85, 0.16, 1.4, 0.06); P.poly(g, [-0.02, -0.85, 0.65, -0.5, 0.65, -0.25, -0.02, -0.55]); },
  sun: g => P.star(g, 12, 0.92, 0.6),
  rot: 'line', bomb: g => { P.circ(g, -0.1, 0.15, 0.68); P.rr(g, 0.15, -0.75, 0.3, 0.45, 0.08); },
  dot: g => blocks(g, [[0, 0]], 1.1), undo: 'line',
  deck: g => { P.rr(g, -0.7, -0.5, 1.1, 1.35, 0.15); P.rr(g, -0.4, -0.85, 1.1, 1.35, 0.15); },
};
const LINE = {
  spiral: g => { for (let a = 0; a < Math.PI * 5; a += 0.2) { const r = 0.08 + a * 0.05; a ? g.lineTo(Math.cos(a) * r, Math.sin(a) * r) : g.moveTo(r, 0); } },
  wave: g => { for (const dy of [-0.35, 0.3]) { g.moveTo(-0.85, dy); g.bezierCurveTo(-0.45, dy - 0.4, -0.15, dy + 0.4, 0.15, dy); g.bezierCurveTo(0.45, dy - 0.4, 0.65, dy + 0.3, 0.85, dy); } },
  rings: g => { for (const r of [0.25, 0.52, 0.8]) { g.moveTo(r, 0); g.arc(0, 0, r, 0, Math.PI * 2); } },
  loop: g => { g.arc(0, 0, 0.6, -Math.PI * 0.15, Math.PI * 1.25); g.moveTo(0.62, -0.6); g.lineTo(0.55, -0.2); g.lineTo(0.15, -0.3); },
  chain: g => { g.ellipse(-0.3, -0.3, 0.42, 0.28, Math.PI / 4, 0, Math.PI * 2); g.moveTo(0.72, 0.3); g.ellipse(0.3, 0.3, 0.42, 0.28, Math.PI / 4, 0, Math.PI * 2); },
  rot: g => { g.arc(0, 0, 0.6, Math.PI * 0.1, Math.PI * 1.6); g.moveTo(0.05, -0.85); g.lineTo(0.25, -0.55); g.lineTo(-0.05, -0.35); },
  undo: g => { g.moveTo(-0.6, -0.3); g.lineTo(0.3, -0.3); g.arc(0.3, 0.15, 0.45, -Math.PI / 2, Math.PI / 2); g.lineTo(-0.3, 0.6); g.moveTo(-0.3, -0.62); g.lineTo(-0.65, -0.3); g.lineTo(-0.3, 0.02); },
};
export function emblem(g, key, cx, cy, r, col) {
  g.save(); g.translate(cx, cy); g.scale(r, r);
  let def = EM[key] ?? EM.star;
  g.beginPath();
  const lw = 0.11;
  if (def === 'line') {
    LINE[key](g);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.lineWidth = 0.36; g.strokeStyle = '#120826'; g.stroke();
    g.lineWidth = 0.2; g.strokeStyle = col; g.stroke();
    g.lineWidth = 0.06; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke();
    g.restore(); return;
  }
  if (typeof def === 'string') {
    g.font = `1.7px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineWidth = 0.22; g.lineJoin = 'round'; g.strokeStyle = '#120826'; g.strokeText(def.slice(5), 0, 0.08);
    const gr = g.createLinearGradient(0, -0.8, 0, 0.8); gr.addColorStop(0, mix(col, 0.45)); gr.addColorStop(1, mix(col, -0.2));
    g.fillStyle = gr; g.fillText(def.slice(5), 0, 0.08);
    g.restore(); return;
  }
  def(g);
  const gr = g.createLinearGradient(0, -0.9, 0, 0.9);
  gr.addColorStop(0, mix(col, 0.45)); gr.addColorStop(0.5, col); gr.addColorStop(1, mix(col, -0.35));
  g.lineJoin = 'round'; g.lineWidth = lw * 2.2; g.strokeStyle = '#120826'; g.stroke();
  g.fillStyle = gr; g.fill('evenodd');
  g.save(); g.clip('evenodd');
  const gl = g.createRadialGradient(-0.35, -0.45, 0, -0.35, -0.45, 0.9);
  gl.addColorStop(0, 'rgba(255,255,255,.5)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gl; g.fillRect(-1, -1, 2, 2);
  g.restore();
  g.lineWidth = 0.04; g.strokeStyle = 'rgba(255,255,255,.35)'; g.stroke();
  // details
  if (key === 'coin') { g.font = `1.05px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = mix(col, -0.45); g.fillText('$', 0, 0.06); }
  if (key === 'clock') { g.strokeStyle = '#120826'; g.lineWidth = 0.13; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -0.55); g.moveTo(0, 0); g.lineTo(0.38, 0.12); g.stroke(); }
  if (key === 'pane') { g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 0.09; g.beginPath(); g.moveTo(-0.5, 0.6); g.lineTo(0.55, -0.45); g.stroke(); }
  if (key === 'prism') { ['#ff4d6d', '#ffb020', '#7ee05a', '#4c7dff'].forEach((c, k) => { g.strokeStyle = c; g.lineWidth = 0.08; g.beginPath(); g.moveTo(0.1, 0.1 + k * 0.1); g.lineTo(0.95, 0.35 + k * 0.17); g.stroke(); }); }
  if (key === 'bomb') { g.fillStyle = '#ffd36b'; P.star(g, 6, 0.22, 0.09); g.save(); g.translate(0.35, -0.85); g.beginPath(); P.star(g, 6, 0.22, 0.09); g.fill(); g.restore(); }
  g.restore();
}

// ---------------------------------------------------------------- cards
export function rarityStroke(g, ri, x, y, w, h, t) {
  if (ri === 3) {
    const gr = g.createLinearGradient(x, y, x + w, y + h);
    const off = (t * 60) % 360;
    for (let k = 0; k <= 6; k++) gr.addColorStop(k / 6, `hsl(${(off + k * 60) % 360},95%,68%)`);
    return gr;
  }
  const R = RARITY[ri];
  const gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
  gr.addColorStop(0, mix(R.h, 0.35)); gr.addColorStop(0.5, R.h); gr.addColorStop(1, R.h2);
  return gr;
}
// Tarot-shaped charm card. o: {t, name, sub, glow, dim, label}
export function charmCard(g, x, y, w, h, def, o = {}) {
  const t = o.t || 0, r = w * 0.12;
  g.save();
  if (o.glow) { g.shadowColor = def.col; g.shadowBlur = 18 * o.glow; }
  rrect(g, x, y, w, h, r); g.fillStyle = rarityStroke(g, def.r, x, y, w, h, t); g.fill();
  g.restore();
  const b = Math.max(2.5, w * 0.06);
  rrect(g, x + b, y + b, w - b * 2, h - b * 2, r * 0.7);
  const gr = g.createLinearGradient(0, y, 0, y + h);
  gr.addColorStop(0, '#2a1a4a'); gr.addColorStop(1, '#120a26');
  g.fillStyle = gr; g.fill();
  g.save(); rrect(g, x + b, y + b, w - b * 2, h - b * 2, r * 0.7); g.clip();
  // starburst behind emblem
  const cx = x + w / 2, cy = y + h * (o.name ? 0.4 : 0.47);
  g.save(); g.translate(cx, cy); g.rotate(t * 0.15);
  g.fillStyle = rgba(def.col, 0.13);
  for (let k = 0; k < 12; k++) { g.rotate(Math.PI / 6); g.beginPath(); g.moveTo(0, 0); g.lineTo(w, -w * 0.13); g.lineTo(w, w * 0.13); g.fill(); }
  g.restore();
  const halo = g.createRadialGradient(cx, cy, 0, cx, cy, w * 0.5);
  halo.addColorStop(0, rgba(def.col, 0.35)); halo.addColorStop(1, rgba(def.col, 0));
  g.fillStyle = halo; g.fillRect(x, y, w, h);
  g.restore();
  // inner hairline + corner pips
  rrect(g, x + b * 2, y + b * 2, w - b * 4, h - b * 4, r * 0.5); g.strokeStyle = rgba(RARITY[def.r].h, 0.35); g.lineWidth = 1; g.stroke();
  g.fillStyle = RARITY[def.r].h;
  for (const [px, py] of [[x + b * 3.2, y + b * 3.2], [x + w - b * 3.2, y + b * 3.2]]) { g.save(); g.translate(px, py); g.rotate(Math.PI / 4); g.fillRect(-b * 0.55, -b * 0.55, b * 1.1, b * 1.1); g.restore(); }
  emblem(g, def.em, cx, cy, w * 0.27, def.col);
  if (o.name) {
    const fs = Math.max(9, Math.min(15, w * 0.13));
    g.font = `${fs}px ${FONT}`;
    const words = def.name.split(' ');
    const linesT = []; let cur = '';
    for (const wd of words) { const tt = cur ? cur + ' ' + wd : wd; if (g.measureText(tt).width > w * 0.84 && cur) { linesT.push(cur); cur = wd; } else cur = tt; }
    linesT.push(cur);
    linesT.forEach((s, k) => otext(g, s, cx, y + h * 0.8 + (k - (linesT.length - 1) / 2) * fs * 1.05, fs, '#fff', { lw: 3, shadow: false }));
  }
  if (o.label) otext(g, o.label, cx, y + h - b * 2 - 2, Math.max(10, w * 0.15), o.labelCol || '#fff', { base: 'bottom', lw: 3 });
  if (o.dim) { rrect(g, x, y, w, h, r); g.fillStyle = `rgba(10,5,20,${o.dim})`; g.fill(); }
}
// round rune-stone for glyphs
export function glyphStone(g, cx, cy, r, def, o = {}) {
  g.save();
  if (o.glow) { g.shadowColor = def.col; g.shadowBlur = 16 * o.glow; }
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);
  const gr = g.createLinearGradient(0, cy - r, 0, cy + r);
  gr.addColorStop(0, '#5a4a7a'); gr.addColorStop(1, '#241838');
  g.fillStyle = gr; g.fill();
  g.restore();
  g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.strokeStyle = rgba(def.col, 0.9); g.lineWidth = Math.max(2, r * 0.1); g.stroke();
  g.beginPath(); g.arc(cx, cy, r * 0.78, 0, Math.PI * 2); g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 1; g.stroke();
  emblem(g, def.em, cx, cy, r * 0.5, def.col);
}
export function emptySlot(g, x, y, w, h, r, label) {
  rrect(g, x, y, w, h, r);
  g.fillStyle = 'rgba(255,255,255,.025)'; g.fill();
  g.setLineDash([5, 5]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1.5; g.stroke(); g.setLineDash([]);
  if (label) { g.font = `${Math.max(9, w * 0.13)}px ${UIFONT}`; g.fillStyle = 'rgba(255,255,255,.22)'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, x + w / 2, y + h / 2); }
}
// a piece drawn as a little shape (deck-edit cards, tray)
export function pieceShape(g, cells, cx, cy, cell, ci, mat, t, dpr, gemIdx = -1, alpha = 1) {
  let w = 0, h = 0; for (const [x, y] of cells) { w = Math.max(w, x + 1); h = Math.max(h, y + 1); }
  const ox = cx - w * cell / 2, oy = cy - h * cell / 2;
  if (alpha < 1) g.globalAlpha = alpha;
  cells.forEach(([x, y], k) => block(g, ox + x * cell, oy + y * cell, cell, ci, k === gemIdx ? 'gem' : (mat || 'n'), t, dpr));
  g.globalAlpha = 1;
}
