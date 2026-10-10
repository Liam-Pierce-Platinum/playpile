// Everything painted on the canvas: the desk, lamp, bomb casing, edge widgets, the
// eight module faces, the explosion and the soot. Module faces are drawn in a 220x220
// local box; GEO holds the shared geometry so hit tests match the art exactly.
import { SYMBOLS, MAZES, TAP_MAX } from './rules.js';
import { codeShown } from './modules.js';

export const SLOT = 220, GAP = 16, PAD = 30, RAIL = 74;
export const COL = { red: '#d9372c', blue: '#2e6fd9', yellow: '#f3c22f', white: '#ece6d8', black: '#232428', green: '#36c25a' };
const DARK = { red: '#7a1610', blue: '#163a7a', yellow: '#8a6a0c', white: '#8c877c', black: '#0a0a0b', green: '#145f28' };
const FONT = '"Black Ops One", Impact, sans-serif';
const MONO = '"Special Elite", "Courier New", monospace';
const SYMP = SYMBOLS.map(s => new Path2D(s));

// ---------- small helpers ----------
export function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function grad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; }
function bevel(c, x, y, w, h, r, top, bot, edge = 2) {
  rr(c, x, y, w, h, r); c.fillStyle = grad(c, x, y, x, y + h, [[0, top], [1, bot]]); c.fill();
  c.save(); rr(c, x, y, w, h, r); c.clip();
  c.lineWidth = edge * 2; c.strokeStyle = 'rgba(255,255,255,.16)'; rr(c, x + edge * .6, y + edge * .6, w, h, r); c.stroke();
  c.strokeStyle = 'rgba(0,0,0,.35)'; rr(c, x - edge * .6, y - edge * .6, w, h, r); c.stroke();
  c.restore();
}
function screw(c, x, y, r = 6, rot = 0.6) {
  const g = c.createRadialGradient(x - r * .4, y - r * .4, 0, x, y, r);
  g.addColorStop(0, '#d9dde0'); g.addColorStop(1, '#5b6166');
  c.beginPath(); c.arc(x, y + 1, r, 0, 7); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill();
  c.strokeStyle = '#3a3f44'; c.lineWidth = 1.6; c.beginPath();
  c.moveTo(x - Math.cos(rot) * r * .7, y - Math.sin(rot) * r * .7); c.lineTo(x + Math.cos(rot) * r * .7, y + Math.sin(rot) * r * .7); c.stroke();
}
function led(c, x, y, r, color, on) {
  c.beginPath(); c.arc(x, y, r + 3, 0, 7); c.fillStyle = '#1c1e21'; c.fill();
  const base = on ? color : '#2b2f33';
  const g = c.createRadialGradient(x - r * .35, y - r * .35, 0, x, y, r);
  g.addColorStop(0, on ? '#fff' : '#4a5056'); g.addColorStop(0.35, base); g.addColorStop(1, on ? shade(color, -0.35) : '#16181a');
  if (on) { c.save(); c.shadowColor = color; c.shadowBlur = 18; }
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill();
  if (on) c.restore();
}
function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const f = (v) => Math.max(0, Math.min(255, Math.round(k < 0 ? v * (1 + k) : v + (255 - v) * k)));
  return '#' + ((1 << 24) | (f(r) << 16) | (f(g) << 8) | f(b)).toString(16).slice(1);
}
function text(c, s, x, y, size, color, align = 'center', font = FONT) {
  c.font = `${size}px ${font}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillStyle = color; c.fillText(s, x, y);
}
function engraved(c, s, x, y, size, align = 'center') {
  text(c, s, x, y + 1, size, 'rgba(255,255,255,.12)', align); text(c, s, x, y, size, 'rgba(0,0,0,.55)', align);
}

// ---------- seven-segment LEDs ----------
const SEGS = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcfgd', '-': 'g', ' ': '' };
function seg(c, x, y, len, t, vert) {
  c.beginPath();
  if (!vert) { c.moveTo(x, y); c.lineTo(x + t / 2, y - t / 2); c.lineTo(x + len - t / 2, y - t / 2); c.lineTo(x + len, y); c.lineTo(x + len - t / 2, y + t / 2); c.lineTo(x + t / 2, y + t / 2); }
  else { c.moveTo(x, y); c.lineTo(x + t / 2, y + t / 2); c.lineTo(x + t / 2, y + len - t / 2); c.lineTo(x, y + len); c.lineTo(x - t / 2, y + len - t / 2); c.lineTo(x - t / 2, y + t / 2); }
  c.closePath(); c.fill();
}
export function digit(c, ch, x, y, w, h, on, off) {
  const t = w * 0.2, g = t * 0.25, hh = h / 2, lit = SEGS[ch] ?? '';
  const S = {
    a: [x + g, y, w - 2 * g, false], d: [x + g, y + h, w - 2 * g, false], g: [x + g, y + hh, w - 2 * g, false],
    f: [x, y + g, hh - 2 * g, true], b: [x + w, y + g, hh - 2 * g, true], e: [x, y + hh + g, hh - 2 * g, true], c: [x + w, y + hh + g, hh - 2 * g, true],
  };
  for (const k in S) {
    const on_ = lit.includes(k);
    c.fillStyle = on_ ? on : off;
    if (on_) { c.shadowColor = on; c.shadowBlur = 12; } else c.shadowBlur = 0;
    seg(c, S[k][0], S[k][1], S[k][2], t, S[k][3]);
  }
  c.shadowBlur = 0;
}
function segString(c, s, x, y, w, h, gap, on, off) {
  c.save(); c.transform(1, 0, -0.08, 1, y * 0.08, 0);
  let cx = x;
  for (const ch of s) {
    if (ch === ':' || ch === '.') {
      c.fillStyle = on; c.shadowColor = on; c.shadowBlur = 10;
      if (ch === ':') { c.fillRect(cx + 2, y + h * .28, w * .2, w * .2); c.fillRect(cx + 2, y + h * .66, w * .2, w * .2); }
      else c.fillRect(cx + 2, y + h - w * .2, w * .2, w * .2);
      c.shadowBlur = 0; cx += w * 0.45; continue;
    }
    digit(c, ch, cx, y, w, h, on, off); cx += w + gap;
  }
  c.restore();
}

// ---------- layout ----------
// Picks the grid (2x1, 3x1, 2x2, 3x2, 2x3...) that shows the bomb biggest in the given view.
export function layoutBomb(nMods, view = { w: 16, h: 9 }) {
  const n = nMods + 1;
  let best = null;
  for (const [cq, rq] of [[2, 1], [3, 1], [2, 2], [4, 1], [3, 2], [2, 3], [4, 2], [3, 3], [5, 2]]) {
    if (cq * rq < n) continue;
    const cw = cq * SLOT + (cq - 1) * GAP + PAD * 2, ch = rq * SLOT + (rq - 1) * GAP + PAD * 2 + RAIL;
    const sc = Math.min(view.w / cw, view.h / ch) * (1 - (cq * rq - n) * 0.04);
    if (!best || sc > best.sc + 1e-9) best = { sc, cq, rq };
  }
  const cols = best.cq, rows = best.rq;
  const W = cols * SLOT + (cols - 1) * GAP, H = rows * SLOT + (rows - 1) * GAP;
  const all = [];
  for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) all.push({ x: q * (SLOT + GAP), y: r * (SLOT + GAP) });
  const timerIdx = cols === 3 && rows === 2 ? 1 : 0;  const timer = all[timerIdx];
  const slots = all.filter((s, i) => i !== timerIdx);
  return { cols, rows, W, H, timer, slots, x0: -PAD, y0: -PAD - RAIL, cw: W + PAD * 2, ch: H + PAD * 2 + RAIL };
}

// ---------- desk + lamp ----------
let deskCache = null;
export function drawDesk(c, w, h, dpr) {
  const key = w + 'x' + h;
  if (!deskCache || deskCache.key !== key) {
    const cv = document.createElement('canvas'); cv.width = w * dpr; cv.height = h * dpr;
    const d = cv.getContext('2d'); d.scale(dpr, dpr);
    d.fillStyle = grad(d, 0, 0, w, h, [[0, '#4a2d1b'], [0.5, '#3a2215'], [1, '#26160d']]); d.fillRect(0, 0, w, h);
    // planks
    const pw = 190;
    for (let x = -40; x < w + pw; x += pw) {
      d.fillStyle = 'rgba(0,0,0,.28)'; d.fillRect(x, 0, 3, h);
      d.fillStyle = 'rgba(255,200,150,.05)'; d.fillRect(x + 3, 0, 2, h);
      let s = (x * 7919) % 97;
      for (let k = 0; k < 16; k++) {
        s = (s * 37 + 11) % 101;
        const gx = x + 10 + (s / 101) * (pw - 20);
        d.strokeStyle = k % 3 ? 'rgba(20,8,2,.22)' : 'rgba(255,190,130,.06)'; d.lineWidth = 1 + (k % 2);
        d.beginPath(); d.moveTo(gx, -10);
        for (let y = 0; y <= h + 20; y += 40) d.lineTo(gx + Math.sin(y * 0.011 + k + x) * 6 + Math.sin(y * 0.031 + k * 2) * 2, y);
        d.stroke();
      }
      // a knot now and then
      if (s % 3 === 0) { const ky = (s * 13) % h; d.strokeStyle = 'rgba(20,8,2,.25)'; for (let r = 4; r < 22; r += 5) { d.beginPath(); d.ellipse(x + pw / 2, ky, r * .6, r * 1.6, 0, 0, 7); d.stroke(); } }
    }
    // coffee ring
    d.strokeStyle = 'rgba(30,12,4,.35)'; d.lineWidth = 5; d.beginPath(); d.arc(w * 0.1, h * 0.84, 44, 0.3, 5.6); d.stroke();
    d.lineWidth = 2; d.beginPath(); d.arc(w * 0.1 + 6, h * 0.84 - 4, 40, 1.3, 5.2); d.stroke();
    deskCache = { key, cv };
  }
  c.drawImage(deskCache.cv, 0, 0, w, h);
}
export function drawLamp(c, w, h, cx, cy, t, flicker = 1) {
  // warm pool of light around the bomb
  const R = Math.max(w, h) * 0.75;
  const g = c.createRadialGradient(cx - 60, cy - 80, 20, cx, cy, R);
  g.addColorStop(0, `rgba(255,214,150,${0.30 * flicker})`); g.addColorStop(0.45, `rgba(255,170,90,${0.12 * flicker})`); g.addColorStop(1, 'rgba(0,0,0,0)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  // vignette
  const v = c.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.8);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(5,2,0,.7)');
  c.fillStyle = v; c.fillRect(0, 0, w, h);
}
export function drawLampHead(c, x, y, s) {
  // a desk lamp shade poking in from the top-left corner
  c.save(); c.translate(x, y); c.scale(s, s); c.rotate(0.55);
  c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.ellipse(20, 30, 120, 60, 0, 0, 7); c.fill();
  c.fillStyle = grad(c, -100, -60, 100, 40, [[0, '#1f4b3a'], [0.5, '#2f6e55'], [1, '#14332a']]);
  c.beginPath(); c.moveTo(-60, -90); c.lineTo(60, -90); c.lineTo(110, 30); c.quadraticCurveTo(0, 55, -110, 30); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,.25)'; c.lineWidth = 4; c.beginPath(); c.moveTo(-50, -84); c.lineTo(-96, 24); c.stroke();
  const b = c.createRadialGradient(0, 34, 2, 0, 34, 90);
  b.addColorStop(0, 'rgba(255,250,220,1)'); b.addColorStop(0.25, 'rgba(255,220,150,.9)'); b.addColorStop(1, 'rgba(255,180,90,0)');
  c.fillStyle = b; c.beginPath(); c.ellipse(0, 34, 104, 26, 0, 0, 7); c.fill();
  c.restore();
}

// ---------- casing + edge widgets ----------
export function drawCasing(c, L, w, t) {
  const { x0, y0, cw, ch } = L;
  // shadow
  c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 50; c.shadowOffsetX = 26; c.shadowOffsetY = 34;
  rr(c, x0, y0, cw, ch, 26); c.fillStyle = '#3c4146'; c.fill(); c.restore();
  bevel(c, x0, y0, cw, ch, 26, '#868d94', '#4a5056', 5);
  // brushed lines
  c.save(); rr(c, x0, y0, cw, ch, 26); c.clip();
  c.globalAlpha = 0.07; c.strokeStyle = '#fff'; c.lineWidth = 1;
  for (let y = y0; y < y0 + ch; y += 4) { c.beginPath(); c.moveTo(x0, y + Math.sin(y) * 1.5); c.lineTo(x0 + cw, y); c.stroke(); }
  c.globalAlpha = 1;
  // specular sweep from the lamp
  const sp = c.createLinearGradient(x0, y0, x0 + cw * 0.6, y0 + ch);
  sp.addColorStop(0, 'rgba(255,230,190,.28)'); sp.addColorStop(0.35, 'rgba(255,230,190,0)'); sp.addColorStop(1, 'rgba(0,0,0,.18)');
  c.fillStyle = sp; c.fillRect(x0, y0, cw, ch);
  c.restore();
  // rubber corner bumpers
  for (const [bx, by] of [[x0, y0], [x0 + cw, y0], [x0, y0 + ch], [x0 + cw, y0 + ch]]) {
    c.beginPath(); c.arc(bx, by, 17, 0, 7); c.fillStyle = '#1a1b1d'; c.fill();
    c.beginPath(); c.arc(bx - 3, by - 4, 10, 0, 7); c.fillStyle = 'rgba(255,255,255,.08)'; c.fill();
  }
  // hazard stripes on the side handles
  for (const side of [-1, 1]) {
    const hx = side < 0 ? x0 - 14 : x0 + cw - 8, hy = y0 + ch * 0.36, hw = 22, hh = ch * 0.34;
    c.save(); rr(c, hx, hy, hw, hh, 6); c.clip();
    c.fillStyle = '#f2b821'; c.fillRect(hx, hy, hw, hh);
    c.fillStyle = '#1b1b1b';
    for (let k = -2; k < hh / 14 + 2; k++) { c.beginPath(); c.moveTo(hx, hy + k * 28); c.lineTo(hx + hw, hy + k * 28 - 16); c.lineTo(hx + hw, hy + k * 28 - 2); c.lineTo(hx, hy + k * 28 + 14); c.fill(); }
    c.fillStyle = grad(c, hx, 0, hx + hw, 0, [[0, 'rgba(255,255,255,.3)'], [0.5, 'rgba(255,255,255,0)'], [1, 'rgba(0,0,0,.35)']]); c.fillRect(hx, hy, hw, hh);
    c.restore();
  }
  // rivets round the face
  for (let x = x0 + 56; x < x0 + cw - 40; x += 64) { screw(c, x, y0 + ch - 14, 4.5, x); }
  // recessed face well
  rr(c, -12, -12, L.W + 24, L.H + 24, 16); c.fillStyle = '#25282c'; c.fill();
  c.save(); rr(c, -12, -12, L.W + 24, L.H + 24, 16); c.clip();
  c.strokeStyle = 'rgba(0,0,0,.7)'; c.lineWidth = 10; rr(c, -16, -16, L.W + 30, L.H + 30, 18); c.stroke(); c.restore();
  drawRail(c, L, w, t);
}

function drawRail(c, L, w, t) {
  const y = -PAD - RAIL + 14, h = RAIL - 20;
  // rail channel
  rr(c, -10, y - 4, L.W + 20, h + 8, 10); c.fillStyle = 'rgba(0,0,0,.28)'; c.fill();
  let x = 0;
  // serial plate (a sticker)
  const sw = 150;
  c.save(); c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 6; c.shadowOffsetY = 2;
  rr(c, x, y, sw, h, 5); c.fillStyle = '#f4f0e4'; c.fill(); c.restore();
  c.fillStyle = '#c8281e'; c.fillRect(x, y, sw, 13);
  text(c, 'SERIAL NO.', x + 8, y + 7, 9.5, '#fff', 'left');
  text(c, w.serial, x + sw / 2, y + h / 2 + 7, 25, '#191919', 'center', MONO);
  x += sw + 12;
  // batteries
  const n = w.batteries;
  const bw = Math.max(64, n * 24 + 12);
  rr(c, x, y, bw, h, 6); c.fillStyle = '#18191b'; c.fill();
  text(c, n === 0 ? 'NO BATTERIES' : '', x + bw / 2, y + h / 2, 9, '#777');
  for (let i = 0; i < n; i++) {
    const bx = x + 7 + i * 24, by = y + 6;
    c.fillStyle = grad(c, bx, 0, bx + 20, 0, [[0, '#a5762a'], [0.4, '#f0c04a'], [1, '#7a5210']]); rr(c, bx, by + 4, 20, h - 16, 3); c.fill();
    c.fillStyle = grad(c, bx, 0, bx + 20, 0, [[0, '#2a2a2a'], [0.45, '#6a6a6a'], [1, '#1a1a1a']]); rr(c, bx, by + (h - 16) * 0.55 + 4, 20, (h - 16) * 0.45, 3); c.fill();
    c.fillStyle = '#bbb'; c.fillRect(bx + 6, by, 8, 4);
  }
  x += bw + 12;
  // indicators
  for (const ind of w.indicators) {
    const iw = 80;
    rr(c, x, y, iw, h, 6); c.fillStyle = '#d9d3c4'; c.fill();
    rr(c, x + 3, y + 3, iw - 6, h - 6, 4); c.fillStyle = '#26282b'; c.fill();
    led(c, x + 16, y + h / 2, 7, '#fff4c8', ind.lit);
    text(c, ind.label, x + 51, y + h / 2 + 1, 17, ind.lit ? '#fff' : '#9a9a9a', 'center', MONO);
    x += iw + 8;
  }
}

// ---------- module plates ----------
function plate(c, M, sel, statusCol) {
  c.save(); c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 10; c.shadowOffsetY = 4;
  rr(c, 4, 4, 212, 212, 12); c.fillStyle = '#3d4248'; c.fill(); c.restore();
  bevel(c, 4, 4, 212, 212, 12, '#5a6168', '#363b41', 3);
  screw(c, 16, 16, 5, 0.3); screw(c, 16, 204, 5, 1.2); screw(c, 204, 204, 5, 2.1);
  if (statusCol !== undefined) led(c, 196, 24, 8, statusCol || '#000', !!statusCol);
}
export function drawModule(c, M, ctx) {
  const a = M.anim;
  const status = a.strikeT > 0 && Math.floor(a.strikeT * 10) % 2 === 0 ? COL.red : (M.solved ? COL.green : null);
  c.save();
  if (a.bump > 0) { const k = 1 + Math.sin(a.bump * 20) * a.bump * 0.03; c.translate(110, 110); c.scale(k, k); c.translate(-110, -110); }
  plate(c, M, ctx.sel, M.needy ? undefined : status);
  DRAW[M.type](c, M, ctx);
  if (ctx.sel) {
    c.save(); c.shadowColor = '#ffc861'; c.shadowBlur = 16; c.strokeStyle = 'rgba(255,205,110,.95)'; c.lineWidth = 4;
    rr(c, 2, 2, 216, 216, 14); c.stroke(); c.restore();
  }
  if (M.solved && !M.needy) {
    c.fillStyle = `rgba(40,200,90,${0.08 + (a.solveT > 0 ? a.solveT * 0.3 : 0)})`; rr(c, 4, 4, 212, 212, 12); c.fill();
  }
  if (ctx.kb && ctx.sel) drawHints(c, M);
  c.restore();
}

// ---------- WIRES ----------
export const WIRE_X0 = 44, WIRE_X1 = 178;
export function wireY(i, n) { const sp = Math.min(34, 144 / (n - 1)); return 122 + (i - (n - 1) / 2) * sp; }
export function wirePts(M, i, steps = 24) {
  const n = M.data.colors.length, y = wireY(i, n), s = M.data.sag[i];
  const P = [[WIRE_X0, y], [88, y + 8 + s * 14], [136, y + 8 - s * 12], [WIRE_X1, y]], out = [];
  for (let k = 0; k <= steps; k++) {
    const t = k / steps, u = 1 - t;
    out.push([u * u * u * P[0][0] + 3 * u * u * t * P[1][0] + 3 * u * t * t * P[2][0] + t * t * t * P[3][0],
      u * u * u * P[0][1] + 3 * u * u * t * P[1][1] + 3 * u * t * t * P[2][1] + t * t * t * P[3][1]]);
  }
  return out;
}
function strokeWire(c, pts, color, hover) {
  const line = (dy = 0) => { c.beginPath(); pts.forEach(([x, y], k) => k ? c.lineTo(x, y + dy) : c.moveTo(x, y + dy)); };
  c.lineCap = 'round'; c.lineJoin = 'round';
  line(3); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 12; c.stroke();
  line(); c.strokeStyle = DARK[color]; c.lineWidth = 12.5; c.stroke();
  line(); c.strokeStyle = hover ? shade(COL[color], 0.25) : COL[color]; c.lineWidth = 9.5; c.stroke();
  line(-2.4); c.strokeStyle = color === 'black' ? 'rgba(255,255,255,.28)' : 'rgba(255,255,255,.55)'; c.lineWidth = 2.4; c.stroke();
}
const DRAW = {};
DRAW.wires = (c, M, ctx) => {
  const n = M.data.colors.length;
  for (const x of [WIRE_X0 - 18, WIRE_X1 - 4]) { bevel(c, x, 34, 22, 176, 6, '#2a2d31', '#1b1d20', 2); }
  for (let i = 0; i < n; i++) {
    const y = wireY(i, n);
    engraved(c, String(i + 1), 15, y + 1, 12);
    for (const x of [WIRE_X0 - 7, WIRE_X1 + 7]) { c.fillStyle = '#c8a24a'; c.beginPath(); c.arc(x, y, 6, 0, 7); c.fill(); c.fillStyle = '#8a6a20'; c.fillRect(x - 4, y - 1, 8, 2); }
  }
  for (let i = 0; i < n; i++) {
    const pts = wirePts(M, i), col = M.data.colors[i];
    const hov = ctx.hover && ctx.hover.k === 'wire' && ctx.hover.i === i && !M.cut[i];
    if (!M.cut[i]) { strokeWire(c, pts, col, hov); continue; }
    const k = M.anim['cut' + i] || 0; // 0..1 spring after cutting
    const droop = 10 + Math.sin(k * 14) * (1 - k) * 8;
    const half = pts.length / 2;
    const L = pts.slice(0, Math.floor(half) - 1).map(([x, y], j, arr) => [x, y + Math.pow(j / arr.length, 2) * droop]);
    const R = pts.slice(Math.ceil(half) + 1).map(([x, y], j, arr) => [x, y + Math.pow(1 - j / arr.length, 2) * droop]);
    strokeWire(c, L, col); strokeWire(c, R, col);
    for (const p of [L[L.length - 1], R[0]]) { c.fillStyle = '#e08a3c'; c.beginPath(); c.arc(p[0], p[1], 3.4, 0, 7); c.fill(); c.fillStyle = '#ffd09a'; c.beginPath(); c.arc(p[0] - 1, p[1] - 1, 1.3, 0, 7); c.fill(); }
  }
};

// ---------- BUTTON ----------
DRAW.button = (c, M, ctx) => {
  const d = M.data, cx = 96, cy = 120, down = M.down;
  // housing
  c.beginPath(); c.arc(cx, cy + 4, 70, 0, 7); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
  c.beginPath(); c.arc(cx, cy, 68, 0, 7); c.fillStyle = grad(c, 0, cy - 68, 0, cy + 68, [[0, '#6c737a'], [1, '#2a2e33']]); c.fill();
  c.beginPath(); c.arc(cx, cy, 60, 0, 7); c.fillStyle = '#141517'; c.fill();
  const press = down ? 1 : (M.anim.press || 0);
  const r = 56 - press * 3, oy = press * 4;
  const base = COL[d.color];
  c.save(); if (!down) { c.shadowColor = 'rgba(0,0,0,.6)'; c.shadowBlur = 8; c.shadowOffsetY = 6; }
  const g = c.createRadialGradient(cx - 20, cy - 24 + oy, 4, cx, cy + oy, r);
  g.addColorStop(0, shade(base, 0.55)); g.addColorStop(0.45, base); g.addColorStop(1, shade(base, -0.45));
  c.beginPath(); c.arc(cx, cy + oy, r, 0, 7); c.fillStyle = g; c.fill(); c.restore();
  if (ctx.hover && ctx.hover.k === 'button' && !down) { c.beginPath(); c.arc(cx, cy, r, 0, 7); c.fillStyle = 'rgba(255,255,255,.1)'; c.fill(); }
  c.beginPath(); c.ellipse(cx - 18, cy - 26 + oy, 20, 9, -0.5, 0, 7); c.fillStyle = 'rgba(255,255,255,.35)'; c.fill();
  const dark = d.color === 'white' || d.color === 'yellow';
  text(c, d.label, cx, cy + 3 + oy, d.label.length > 5 ? 19 : 23, dark ? '#2a2620' : '#fff6ea');
  // the strip
  const sx = 178, sy = 44, sh = 156, lit = down && M.held >= TAP_MAX;
  bevel(c, sx - 4, sy - 4, 28, sh + 8, 8, '#2a2d31', '#1a1c1f', 2);
  rr(c, sx, sy, 20, sh, 6);
  if (lit) {
    const pulse = 0.75 + Math.sin(ctx.t * 10) * 0.25;
    c.save(); c.shadowColor = COL[d.strip]; c.shadowBlur = 24 * pulse;
    c.fillStyle = grad(c, sx, 0, sx + 20, 0, [[0, shade(COL[d.strip], -0.2)], [0.5, shade(COL[d.strip], 0.4)], [1, shade(COL[d.strip], -0.2)]]); c.fill(); c.restore();
  } else { c.fillStyle = '#0f1012'; c.fill(); }
  c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(sx + 3, sy + 4, 4, sh - 8);
};

// ---------- SWITCHES ----------
export const swX = (i) => 30 + i * 40;
DRAW.switches = (c, M, ctx) => {
  engraved(c, 'UP', 110, 46, 12);
  for (let i = 0; i < 5; i++) {
    const x = swX(i), up = M.state[i], k = M.anim['sw' + i] || 0, hov = ctx.hover && ctx.hover.k === 'switch' && ctx.hover.i === i;
    bevel(c, x - 15, 60, 30, 96, 8, '#2a2d31', '#16181b', 2);
    rr(c, x - 4, 70, 8, 76, 4); c.fillStyle = '#060607'; c.fill();
    // lever from pivot (108) to end
    const ey = (up ? 76 : 140) + (up ? 1 : -1) * Math.sin(k * 12) * (1 - k) * 6;
    c.lineCap = 'round';
    c.strokeStyle = '#9aa1a8'; c.lineWidth = 7; c.beginPath(); c.moveTo(x, 108); c.lineTo(x, ey); c.stroke();
    c.strokeStyle = 'rgba(255,255,255,.5)'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 1.5, 108); c.lineTo(x - 1.5, ey); c.stroke();
    const col = COL[M.data.colors[i]];
    c.save(); c.shadowColor = 'rgba(0,0,0,.5)'; c.shadowBlur = 5; c.shadowOffsetY = 3;
    rr(c, x - 12, ey - 10, 24, 20, 6); c.fillStyle = grad(c, 0, ey - 10, 0, ey + 10, [[0, shade(col, 0.4)], [1, shade(col, -0.35)]]); c.fill(); c.restore();
    if (hov) { rr(c, x - 12, ey - 10, 24, 20, 6); c.strokeStyle = '#ffd98a'; c.lineWidth = 2; c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,.4)'; rr(c, x - 9, ey - 8, 18, 5, 3); c.fill();
    engraved(c, String(i + 1), x, 168, 12);
  }
  const hov = ctx.hover && ctx.hover.k === 'set', p = M.anim.press || 0;
  bevel(c, 62, 178 + p * 2, 96, 28, 8, hov ? '#e2463a' : '#c9362b', '#7f1b14', 2);
  text(c, 'SET', 110, 193 + p * 2, 18, '#fff3e6');
};

// ---------- KEYPAD ----------
export const keyRect = (i) => [26 + (i % 2) * 92, 36 + (i >> 1) * 90, 78, 80];
DRAW.keypad = (c, M, ctx) => {
  for (let i = 0; i < 4; i++) {
    const [x, y, w, h] = keyRect(i), p = (M.anim['k' + i] || 0), lit = M.lit[i], hov = ctx.hover && ctx.hover.k === 'key' && ctx.hover.i === i;
    rr(c, x - 3, y - 3, w + 6, h + 6, 10); c.fillStyle = '#16181a'; c.fill();
    const oy = p * 3 + (lit ? 2 : 0);
    rr(c, x, y + 5, w, h - 4, 8); c.fillStyle = '#9b9180'; c.fill();
    bevel(c, x, y + oy, w, h - 6, 8, hov ? '#fffaf0' : '#f1e8d4', '#cfc3a8', 2);
    // little light along the top of each key
    rr(c, x + 18, y + 7 + oy, w - 36, 7, 3); c.fillStyle = lit ? COL.green : '#3a3a36';
    if (lit) { c.save(); c.shadowColor = COL.green; c.shadowBlur = 10; c.fill(); c.restore(); } else c.fill();
    c.save(); c.translate(x + w / 2 - 25, y + 20 + oy); c.scale(2.5, 2.5);
    c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#1e1b16'; c.stroke(SYMP[M.data.syms[i]]);
    c.restore();
  }
};

// ---------- SIMON ----------
export const SIMON_POS = { red: [0, -50], blue: [50, 0], green: [0, 50], yellow: [-50, 0] };
DRAW.simon = (c, M, ctx) => {
  const cx = 110, cy = 120;
  c.beginPath(); c.arc(cx, cy, 92, 0, 7); c.fillStyle = '#17191c'; c.fill();
  c.beginPath(); c.arc(cx, cy, 92, 0, 7); c.strokeStyle = 'rgba(255,255,255,.08)'; c.lineWidth = 3; c.stroke();
  for (const col of ['red', 'blue', 'green', 'yellow']) {
    const [dx, dy] = SIMON_POS[col], lit = ctx.simonLit === col || M.anim.flash === col;
    const hov = ctx.hover && ctx.hover.k === 'pad' && ctx.hover.color === col;
    c.save(); c.translate(cx + dx, cy + dy); c.rotate(Math.PI / 4);
    const s = 46;
    if (lit) { c.shadowColor = COL[col]; c.shadowBlur = 34; }
    rr(c, -s / 2, -s / 2, s, s, 9);
    c.fillStyle = lit ? grad(c, -s / 2, -s / 2, s / 2, s / 2, [[0, shade(COL[col], 0.6)], [1, COL[col]]]) : grad(c, -s / 2, -s / 2, s / 2, s / 2, [[0, shade(COL[col], hov ? -0.2 : -0.4)], [1, shade(COL[col], -0.7)]]);
    c.fill(); c.shadowBlur = 0;
    c.fillStyle = 'rgba(255,255,255,.22)'; rr(c, -s / 2 + 5, -s / 2 + 5, s - 10, 8, 4); c.fill();
    c.restore();
  }
  // progress pips
  for (let k = 0; k < M.data.seq.length; k++) { c.beginPath(); c.arc(cx - (M.data.seq.length - 1) * 7 + k * 14, cy, 4, 0, 7); c.fillStyle = k < M.stage || M.solved ? COL.green : '#3a3e43'; c.fill(); }
};

// ---------- DIAL MAZE ----------
export const MZ = { x: 49, y: 39, s: 122, cell: 22, ox: 55, oy: 45 };
export const ARROWS = { up: [110, 22], down: [110, 184], left: [24, 100], right: [196, 100] };
const cellC = (i) => [MZ.ox + (i % 5) * MZ.cell + MZ.cell / 2, MZ.oy + ((i / 5) | 0) * MZ.cell + MZ.cell / 2];
DRAW.maze = (c, M, ctx) => {
  // bezel and screen
  c.beginPath(); c.arc(110, 100, 84, 0, 7); c.fillStyle = grad(c, 0, 16, 0, 184, [[0, '#6a7178'], [1, '#2b2f34']]); c.fill();
  rr(c, MZ.x - 4, MZ.y - 4, MZ.s + 8, MZ.s + 8, 14); c.fillStyle = '#0d0f10'; c.fill();
  rr(c, MZ.x, MZ.y, MZ.s, MZ.s, 10); c.fillStyle = grad(c, 0, MZ.y, 0, MZ.y + MZ.s, [[0, '#0f2a1c'], [1, '#08160f']]); c.fill();
  c.save(); rr(c, MZ.x, MZ.y, MZ.s, MZ.s, 10); c.clip();
  c.fillStyle = 'rgba(120,255,170,.04)'; for (let y = MZ.y; y < MZ.y + MZ.s; y += 3) c.fillRect(MZ.x, y, MZ.s, 1);
  for (let i = 0; i < 25; i++) { const [x, y] = cellC(i); c.fillStyle = 'rgba(110,255,160,.35)'; c.fillRect(x - 1.5, y - 1.5, 3, 3); }
  const ring = MAZES[M.data.maze].ring;
  { const [x, y] = cellC(ring); c.save(); c.shadowColor = '#5dff9a'; c.shadowBlur = 8; c.strokeStyle = '#6dffa6'; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y, 8, 0, 7); c.stroke(); c.restore(); }
  { const [x, y] = cellC(M.data.goal); c.save(); c.shadowColor = '#ff4a3a'; c.shadowBlur = 10; c.fillStyle = '#ff5a48'; c.beginPath(); c.moveTo(x, y - 7); c.lineTo(x + 7, y + 6); c.lineTo(x - 7, y + 6); c.closePath(); c.fill(); c.restore(); }
  { const [x, y] = cellC(M.pos), bump = M.anim.bumpDir; let bx = 0, by = 0;
    if (bump && M.anim.bumpT > 0) { const k = Math.sin(M.anim.bumpT * 30) * M.anim.bumpT * 6; bx = bump[0] * k; by = bump[1] * k; }
    c.save(); c.shadowColor = '#fff'; c.shadowBlur = 12; c.fillStyle = '#f4fff8'; c.fillRect(x - 5 + bx, y - 5 + by, 10, 10); c.restore(); }
  const gl = c.createLinearGradient(MZ.x, MZ.y, MZ.x + MZ.s, MZ.y + MZ.s); gl.addColorStop(0, 'rgba(255,255,255,.12)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)');
  c.fillStyle = gl; c.fillRect(MZ.x, MZ.y, MZ.s, MZ.s);
  c.restore();
  for (const [dir, [x, y]] of Object.entries(ARROWS)) {
    const hov = ctx.hover && ctx.hover.k === 'arrow' && ctx.hover.dir === dir, p = M.anim['a' + dir] || 0;
    c.beginPath(); c.arc(x, y + 2, 15, 0, 7); c.fillStyle = 'rgba(0,0,0,.5)'; c.fill();
    c.beginPath(); c.arc(x, y + p * 2, 14, 0, 7); c.fillStyle = grad(c, 0, y - 14, 0, y + 14, [[0, hov ? '#f0f0f0' : '#d4d7da'], [1, '#7d8389']]); c.fill();
    c.save(); c.translate(x, y + p * 2); c.rotate({ up: 0, right: Math.PI / 2, down: Math.PI, left: -Math.PI / 2 }[dir]);
    c.fillStyle = '#26292c'; c.beginPath(); c.moveTo(0, -7); c.lineTo(7, 5); c.lineTo(-7, 5); c.closePath(); c.fill(); c.restore();
  }
};

// ---------- CODE WHEEL ----------
export const wheelX = (i) => 22 + i * 45;
DRAW.code = (c, M, ctx) => {
  const d = M.data;
  for (let i = 0; i < 4; i++) {
    const x = wheelX(i), w = 40, y0 = 40, h = 124;
    rr(c, x - 3, y0 - 3, w + 6, h + 6, 8); c.fillStyle = '#121315'; c.fill();
    // drum
    c.save(); rr(c, x, y0, w, h, 6); c.clip();
    c.fillStyle = grad(c, 0, y0, 0, y0 + h, [[0, '#2b2620'], [0.3, '#cbbfa6'], [0.5, '#f4ecda'], [0.7, '#cbbfa6'], [1, '#2b2620']]); c.fillRect(x, y0, w, h);
    const spin = M.anim['w' + i] || 0; // -1..1 roll offset
    const cy = y0 + h / 2;
    for (let k = -2; k <= 2; k++) {
      const li = (M.pos[i] + k + 50) % 5, yy = cy + (k + spin) * 38, sc = Math.max(0, Math.cos((k + spin) * 0.75));
      c.save(); c.translate(x + w / 2, yy); c.scale(1, sc);
      text(c, d.wheels[i][li], 0, 1, 30, k === 0 ? '#1d1a15' : 'rgba(30,26,20,.55)'); c.restore();
    }
    c.restore();
    // window glass
    rr(c, x - 1, cy - 20, w + 2, 40, 4); c.strokeStyle = 'rgba(255,200,90,.85)'; c.lineWidth = 2; c.stroke();
    const hovU = ctx.hover && ctx.hover.k === 'wheel' && ctx.hover.i === i && ctx.hover.d < 0;
    const hovD = ctx.hover && ctx.hover.k === 'wheel' && ctx.hover.i === i && ctx.hover.d > 0;
    c.fillStyle = hovU ? '#ffd98a' : 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(x + w / 2, y0 + 6); c.lineTo(x + w / 2 + 7, y0 + 14); c.lineTo(x + w / 2 - 7, y0 + 14); c.fill();
    c.fillStyle = hovD ? '#ffd98a' : 'rgba(255,255,255,.55)'; c.beginPath(); c.moveTo(x + w / 2, y0 + h - 6); c.lineTo(x + w / 2 + 7, y0 + h - 14); c.lineTo(x + w / 2 - 7, y0 + h - 14); c.fill();
  }
  const hov = ctx.hover && ctx.hover.k === 'submit', p = M.anim.press || 0;
  bevel(c, 40, 176 + p * 2, 140, 30, 8, hov ? '#4c8ce0' : '#3a76c8', '#1d3f72', 2);
  text(c, 'SUBMIT', 110, 192 + p * 2, 17, '#eef5ff');
};

// ---------- VENT (needy) ----------
export const VALVE_X = [46, 110, 174], VALVE_Y = 166;
DRAW.vent = (c, M, ctx) => {
  engraved(c, 'VENT', 40, 26, 15);
  // stripes to say "needy"
  c.save(); rr(c, 150, 16, 54, 16, 4); c.clip(); c.fillStyle = '#f2b821'; c.fillRect(150, 16, 54, 16); c.fillStyle = '#1b1b1b';
  for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(150 + k * 12, 32); c.lineTo(158 + k * 12, 16); c.lineTo(164 + k * 12, 16); c.lineTo(156 + k * 12, 32); c.fill(); } c.restore();
  text(c, 'NEEDY', 177, 42, 9, '#c9c3b2');
  // countdown
  rr(c, 72, 48, 76, 44, 6); c.fillStyle = '#0c0b0a'; c.fill();
  const s = M.active ? String(Math.max(0, Math.ceil(M.left))).padStart(2, '0') : '--';
  segString(c, s, 82, 55, 22, 30, 8, M.active && M.left < 5 && Math.floor(ctx.t * 6) % 2 ? '#ff4a2e' : '#ffb02e', 'rgba(255,170,40,.08)');
  // lamp dome
  const on = M.active && (!M.blink || Math.floor(ctx.t * 3.2) % 2 === 0);
  const col = M.active ? COL[M.color] : '#333';
  c.beginPath(); c.arc(110, 120, 25, 0, 7); c.fillStyle = '#17181a'; c.fill();
  const g = c.createRadialGradient(103, 112, 2, 110, 120, 21);
  g.addColorStop(0, on ? '#fff' : '#5a5f64'); g.addColorStop(0.4, on ? col : '#33373b'); g.addColorStop(1, on ? shade(col, -0.5) : '#141618');
  if (on) { c.save(); c.shadowColor = col; c.shadowBlur = 30; }
  c.beginPath(); c.arc(110, 120, 20, 0, 7); c.fillStyle = g; c.fill();
  if (on) c.restore();
  // valves
  VALVE_X.forEach((x, i) => {
    const hov = ctx.hover && ctx.hover.k === 'valve' && ctx.hover.i === i, rot = (M.anim['v' + i] || 0) * 2.4;
    c.beginPath(); c.arc(x, VALVE_Y + 3, 22, 0, 7); c.fillStyle = 'rgba(0,0,0,.45)'; c.fill();
    c.save(); c.translate(x, VALVE_Y); c.rotate(rot);
    c.strokeStyle = hov ? '#ff7a62' : '#c8402f'; c.lineWidth = 6; c.beginPath(); c.arc(0, 0, 17, 0, 7); c.stroke();
    c.lineWidth = 4; for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.cos(k * 2.094) * 17, Math.sin(k * 2.094) * 17); c.stroke(); }
    c.fillStyle = '#d9d9d9'; c.beginPath(); c.arc(0, 0, 5, 0, 7); c.fill();
    c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 17, 3.6, 4.8); c.stroke();
    c.restore();
    engraved(c, 'LMR'[i], x, 200, 12);
  });
};

// ---------- TIMER ----------
export function drawTimer(c, G, t) {
  plate(c, { anim: {} }, false, undefined);
  rr(c, 18, 40, 184, 92, 10); c.fillStyle = '#0a0606'; c.fill();
  rr(c, 18, 40, 184, 92, 10); c.strokeStyle = '#000'; c.lineWidth = 3; c.stroke();
  const str = G.clockStr();
  const low = G.timeLeft < 10 && G.state === 'play';
  const flash = G.anim.strikeT > 0 && Math.floor(G.anim.strikeT * 12) % 2 === 0;
  const on = G.defused ? COL.green : (flash ? '#fff' : (low && Math.floor(t * 4) % 2 ? '#ff7a5c' : '#ff3524'));
  segString(c, str, 34, 56, 32, 60, 10, on, 'rgba(255,40,30,.07)');
  const gl = c.createLinearGradient(18, 40, 202, 132); gl.addColorStop(0, 'rgba(255,255,255,.1)'); gl.addColorStop(0.35, 'rgba(255,255,255,0)'); c.fillStyle = gl; rr(c, 18, 40, 184, 92, 10); c.fill();
  engraved(c, 'STRIKES', 110, 152, 12);
  for (let i = 0; i < 2; i++) {
    const x = 86 + i * 48, y = 182, lit = G.strikes > i;
    rr(c, x - 17, y - 17, 34, 34, 8); c.fillStyle = '#121315'; c.fill();
    if (lit) { c.save(); c.shadowColor = '#ff3020'; c.shadowBlur = 16; }
    c.strokeStyle = lit ? '#ff4030' : '#3a2a28'; c.lineWidth = 6; c.lineCap = 'round';
    c.beginPath(); c.moveTo(x - 8, y - 8); c.lineTo(x + 8, y + 8); c.moveTo(x + 8, y - 8); c.lineTo(x - 8, y + 8); c.stroke();
    if (lit) c.restore();
  }
  engraved(c, 'SQUAD-9', 40, 26, 11);
  led(c, 196, 24, 6, COL.red, G.state === 'play' && (t % 1) < 0.12);
}

// ---------- blank plate for unused slots ----------
export function drawBlank(c) {
  rr(c, 4, 4, 212, 212, 12); c.fillStyle = '#2e3237'; c.fill();
  bevel(c, 10, 10, 200, 200, 10, '#4c5258', '#33383d', 2);
  for (const [x, y] of [[24, 24], [196, 24], [24, 196], [196, 196]]) screw(c, x, y, 6, x * y);
}

// ---------- keyboard hints ----------
function cap(c, k, x, y) {
  c.font = `11px ${FONT}`; const w = Math.max(18, c.measureText(k).width + 10);
  rr(c, x - w / 2, y - 10, w, 20, 5); c.fillStyle = 'rgba(255,240,200,.95)'; c.fill(); c.strokeStyle = '#1b1b1b'; c.lineWidth = 1.5; c.stroke();
  text(c, k, x, y + 1, 11, '#1b1b1b');
}
function drawHints(c, M) {
  switch (M.type) {
    case 'wires': M.data.colors.forEach((_, i) => cap(c, String(i + 1), 110, wireY(i, M.data.colors.length) - 12)); break;
    case 'button': cap(c, 'SPACE', 96, 196); break;
    case 'switches': for (let i = 0; i < 5; i++) cap(c, String(i + 1), swX(i), 56); cap(c, 'ENTER', 182, 192); break;
    case 'keypad': for (let i = 0; i < 4; i++) { const [x, y] = keyRect(i); cap(c, String(i + 1), x + 12, y + 70); } break;
    case 'simon': cap(c, '↑', 110, 70); cap(c, '→', 160, 120); cap(c, '↓', 110, 170); cap(c, '←', 60, 120); break;
    case 'maze': cap(c, 'ARROWS', 110, 206); break;
    case 'code': cap(c, '← → ↑ ↓', 110, 28); cap(c, 'ENTER', 190, 192); if (M.anim.cursor !== undefined) { rr(c, wheelX(M.anim.cursor) - 5, 35, 50, 134, 9); c.strokeStyle = '#ffd98a'; c.lineWidth = 2; c.setLineDash([5, 4]); c.stroke(); c.setLineDash([]); } break;
    case 'vent': cap(c, 'Z', 46, 138); cap(c, 'X', 110, 138); cap(c, 'C', 174, 138); break;
  }
}

// ---------- hit tests (local 220x220 coords) ----------
export function hitModule(M, x, y) {
  switch (M.type) {
    case 'wires': {
      let best = -1, bd = 13;
      M.data.colors.forEach((_, i) => { if (M.cut[i]) return; for (const [px, py] of wirePts(M, i, 30)) { const dd = Math.hypot(px - x, py - y); if (dd < bd) { bd = dd; best = i; } } });
      return best >= 0 ? { k: 'wire', i: best } : null;
    }
    case 'button': return Math.hypot(x - 96, y - 120) < 62 ? { k: 'button' } : null;
    case 'switches':
      if (x > 60 && x < 160 && y > 174 && y < 210) return { k: 'set' };
      for (let i = 0; i < 5; i++) if (Math.abs(x - swX(i)) < 19 && y > 52 && y < 162) return { k: 'switch', i };
      return null;
    case 'keypad': for (let i = 0; i < 4; i++) { const [kx, ky, w, h] = keyRect(i); if (x > kx - 4 && x < kx + w + 4 && y > ky - 4 && y < ky + h + 4) return { k: 'key', i }; } return null;
    case 'simon': for (const [col, [dx, dy]] of Object.entries(SIMON_POS)) if (Math.abs(x - 110 - dx) + Math.abs(y - 120 - dy) < 36) return { k: 'pad', color: col }; return null;
    case 'maze': for (const [dir, [ax, ay]] of Object.entries(ARROWS)) if (Math.hypot(x - ax, y - ay) < 21) return { k: 'arrow', dir }; return null;
    case 'code':
      if (x > 40 && x < 180 && y > 172 && y < 210) return { k: 'submit' };
      for (let i = 0; i < 4; i++) if (x > wheelX(i) - 3 && x < wheelX(i) + 43 && y > 30 && y < 172) return { k: 'wheel', i, d: y < 102 ? -1 : 1 };
      return null;
    case 'vent': for (let i = 0; i < 3; i++) if (Math.hypot(x - VALVE_X[i], y - VALVE_Y) < 26) return { k: 'valve', i }; return null;
  }
  return null;
}

// ---------- explosion + soot (screen space) ----------
export function makeBoom(cx, cy, s) {
  const blobs = [], debris = [], puffs = [];
  for (let i = 0; i < 18; i++) { const a = Math.random() * 7, d = Math.random() * 120 * s; blobs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.8, r: (70 + Math.random() * 110) * s, delay: Math.random() * 0.18, col: ['#fff3b0', '#ffd23a', '#ff8a1e', '#ff4a1a', '#e02a12'][i % 5] }); }
  for (let i = 0; i < 26; i++) { const a = Math.random() * 7, v = (500 + Math.random() * 900) * s; debris.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 400 * s, r: Math.random() * 7, vr: (Math.random() - 0.5) * 18, w: (10 + Math.random() * 26) * s, h: (6 + Math.random() * 14) * s, col: ['#5a6168', '#3d4248', '#d9372c', '#2e6fd9', '#f3c22f', '#7a8086'][i % 6] }); }
  for (let i = 0; i < 16; i++) { const a = Math.random() * 7, d = Math.random() * 160 * s; puffs.push({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.7, r: (60 + Math.random() * 90) * s, vy: -(30 + Math.random() * 60) * s, delay: 0.25 + Math.random() * 0.3 }); }
  return { cx, cy, s, blobs, debris, puffs, t: 0 };
}
export function drawBoom(c, B, W, H, dt) {
  B.t += dt; const t = B.t;
  for (const p of B.puffs) {
    const k = t - p.delay; if (k < 0) continue;
    const r = p.r * Math.min(1, k * 2.2) * (1 + k * 0.25), a = Math.max(0, 1 - k / 2.4);
    c.fillStyle = `rgba(40,36,34,${0.85 * a})`; c.beginPath(); c.arc(p.x, p.y + p.vy * k, r, 0, 7); c.fill();
    c.fillStyle = `rgba(90,84,80,${0.5 * a})`; c.beginPath(); c.arc(p.x - r * 0.25, p.y + p.vy * k - r * 0.25, r * 0.55, 0, 7); c.fill();
  }
  for (const b of B.blobs) {
    const k = t - b.delay; if (k < 0) continue;
    const grow = Math.min(1, k * 7), shrink = Math.max(0, 1 - Math.max(0, k - 0.3) * 1.6);
    const r = b.r * grow * shrink; if (r <= 1) continue;
    c.fillStyle = '#2a1208'; c.beginPath(); c.arc(b.x, b.y, r + 6 * B.s, 0, 7); c.fill();
  }
  for (const b of B.blobs) {
    const k = t - b.delay; if (k < 0) continue;
    const grow = Math.min(1, k * 7), shrink = Math.max(0, 1 - Math.max(0, k - 0.3) * 1.6);
    const r = b.r * grow * shrink; if (r <= 1) continue;
    c.fillStyle = b.col; c.beginPath(); c.arc(b.x, b.y, r, 0, 7); c.fill();
    c.fillStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.arc(b.x - r * .3, b.y - r * .3, r * .35, 0, 7); c.fill();
  }
  for (const d of B.debris) {
    d.vy += 1600 * B.s * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.r += d.vr * dt;
    c.save(); c.translate(d.x, d.y); c.rotate(d.r); c.fillStyle = d.col; c.fillRect(-d.w / 2, -d.h / 2, d.w, d.h); c.strokeStyle = '#111'; c.lineWidth = 2; c.strokeRect(-d.w / 2, -d.h / 2, d.w, d.h); c.restore();
  }
  // comic burst
  if (t > 0.05 && t < 1.6) {
    const pop = Math.min(1, (t - 0.05) * 6), sc = (0.6 + pop * 0.5 + Math.sin(t * 30) * 0.02) * B.s, fade = Math.min(1, (1.6 - t) * 3);
    c.save(); c.globalAlpha = fade; c.translate(B.cx, B.cy - 30 * B.s); c.rotate(-0.12); c.scale(sc, sc);
    c.beginPath(); for (let i = 0; i < 28; i++) { const r = i % 2 ? 130 : 200, a = i / 28 * Math.PI * 2; c.lineTo(Math.cos(a) * r * 1.35, Math.sin(a) * r * 0.8); } c.closePath();
    c.fillStyle = '#ffe14a'; c.fill(); c.lineWidth = 10; c.strokeStyle = '#1a0d06'; c.stroke();
    c.font = `120px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.lineWidth = 16; c.strokeStyle = '#1a0d06'; c.strokeText('BOOM!', 0, 6); c.fillStyle = '#e8321e'; c.fillText('BOOM!', 0, 6);
    c.restore();
  }
  if (t < 0.25) { c.fillStyle = `rgba(255,250,235,${1 - t / 0.25})`; c.fillRect(0, 0, W, H); }
}
export function drawSoot(c, W, H, k, t, fx, fy) {
  // the screen goes sooty, then a pair of blinking eyes peers out
  c.fillStyle = `rgba(14,10,8,${0.88 * k})`; c.fillRect(0, 0, W, H);
  if (k <= 0.05) return;
  c.save(); c.globalAlpha = k;
  const cx = fx ?? W / 2, cy = fy ?? H * 0.3, s = Math.min(W, H) / 700;
  for (let i = 0; i < 9; i++) { c.fillStyle = 'rgba(60,52,46,.35)'; c.beginPath(); c.arc(cx + Math.sin(i * 2.3) * 260 * s, cy + Math.cos(i * 1.7) * 120 * s, (40 + (i * 13) % 50) * s, 0, 7); c.fill(); }
  const blink = (t % 2.6) > 2.45 ? 0.1 : 1;
  for (const side of [-1, 1]) {
    c.fillStyle = '#f6f1e6'; c.beginPath(); c.ellipse(cx + side * 58 * s, cy, 36 * s, 44 * s * blink, 0, 0, 7); c.fill();
    c.fillStyle = '#16100c'; c.beginPath(); c.arc(cx + side * 58 * s + Math.sin(t * 0.8) * 8 * s, cy + 6 * s * blink, 13 * s * blink, 0, 7); c.fill();
  }
  // frazzled hair puffs
  for (let i = 0; i < 7; i++) { const a = Math.PI + 0.25 + i * 0.45; c.strokeStyle = 'rgba(120,110,100,.5)'; c.lineWidth = 4 * s; c.beginPath(); c.moveTo(cx + Math.cos(a) * 130 * s, cy - 40 * s + Math.sin(a) * 80 * s); c.quadraticCurveTo(cx + Math.cos(a) * 170 * s, cy - 40 * s + Math.sin(a) * 110 * s + Math.sin(t * 3 + i) * 8 * s, cx + Math.cos(a) * 190 * s, cy - 40 * s + Math.sin(a) * 130 * s); c.stroke(); }
  // a little cough of smoke
  const ck = (t * 0.7) % 1;
  c.fillStyle = `rgba(150,140,130,${0.45 * (1 - ck)})`; c.beginPath(); c.arc(cx + 10 * s, cy + 90 * s - ck * 60 * s, (8 + ck * 26) * s, 0, 7); c.fill();
  c.restore();
}
export { text as drawText, codeShown, shade, segString };
