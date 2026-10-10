// All the drawing: the static ground and prop layers (painted once per garden),
// the animated things (mower, gnomes, dog, cats, sprinklers, flowers, trees) and the HUD.
import { rng, CELL } from './lawn.js';

export const M = 80; // margin painted around the lawn
const TAU = Math.PI * 2;
export const FONT = "'Lilita One', 'Arial Black', sans-serif";
const SHADOW = 'rgba(16, 48, 8, 0.32)';
const SUN = [9, 11]; // shadow offset: the sun is top-left

function rr(x, c, y, w, h, r) { x.beginPath(); x.roundRect(c, y, w, h, r); }
function circ(x, cx, cy, r) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); }
function shapePath(x, s, pad = 0) {
  x.beginPath();
  if (s.t === 'r') x.roundRect(s.x - pad, s.y - pad, s.w + pad * 2, s.h + pad * 2, Math.min(6 + pad, s.w / 2, s.h / 2));
  else x.arc(s.x, s.y, s.r + pad, 0, TAU);
}
const mix = (a, b, t) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const r = ((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t, g = ((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t, bl = (pa & 255) * (1 - t) + (pb & 255) * t;
  return `rgb(${r | 0},${g | 0},${bl | 0})`;
};

// ------------------------------------------------------------------ static layers
export function buildStatic(lv) {
  const W = lv.w + M * 2, H = lv.h + M * 2;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
  const ground = mk(), props = mk();
  const g = ground.getContext('2d'), p = props.getContext('2d');
  g.translate(M, M); p.translate(M, M);
  const r = rng(lv.w * 7 + lv.h);
  surround(g, lv, r);
  // shadows first, so everything else sits on top of them
  g.fillStyle = SHADOW;
  const solidRects = [...(lv.houses || []), ...(lv.hedges || []), ...(lv.walls || []), ...(lv.sheds || []), ...(lv.tents || []), ...(lv.kennels || []), ...(lv.keep || [])];
  for (const s of solidRects) { rr(g, s.x + SUN[0], s.y + SUN[1], s.w, s.h, 6); g.fill(); }
  for (const s of lv.towers || []) { circ(g, s.x + SUN[0] * 1.4, s.y + SUN[1] * 1.4, s.r); g.fill(); }
  for (const [x, y, cr] of lv.trees || []) { g.beginPath(); g.ellipse(x + 20, y + 24, cr * 0.95, cr * 0.85, 0, 0, TAU); g.fill(); }
  for (const s of lv.goals || []) { g.fillStyle = 'rgba(16,48,8,0.18)'; g.fillRect(s.x + 6, s.y + 8, s.w, s.h); g.fillStyle = SHADOW; }
  // ground surfaces
  for (const s of lv.patios || []) patio(g, s, r);
  for (const s of lv.paths || []) path(g, s, r);
  for (const s of lv.sand || []) sand(g, s, r);
  for (const s of lv.beds || []) bed(g, s, r, lv);
  for (const s of lv.water || []) water(g, s, r);
  for (const s of lv.fountains || []) fountainBase(g, s);
  if (lv.lines === 'football') pitchLines(g, lv);
  if (lv.flag) { const [x, y] = lv.flag; g.fillStyle = 'rgba(200,255,160,0.18)'; circ(g, x, y, 90); g.fill(); g.fillStyle = '#1c2a12'; circ(g, x, y, 9); g.fill(); g.fillStyle = '#ffffff55'; circ(g, x - 1, y - 1, 9); g.lineWidth = 2; g.strokeStyle = '#ffffff66'; g.stroke(); }
  for (const s of lv.slopes || []) slope(g, s);
  // tall props
  for (const s of lv.hedges || []) hedge(p, s, r);
  for (const s of lv.walls || []) wall(p, s, r, lv);
  for (const s of lv.keep || []) keep(p, s, r);
  for (const s of lv.towers || []) tower(p, s);
  for (const s of lv.houses || []) roof(p, s, s.roof || '#c8553d', r);
  for (const s of lv.sheds || []) shed(p, s);
  for (const s of lv.tents || []) tent(p, s);
  for (const s of lv.kennels || []) kennel(p, s);
  for (const s of lv.goals || []) goal(p, s, lv);
  border(p, g, lv, r);
  return { ground, props };
}

function surround(g, lv, r) {
  const { w, h } = lv, th = lv.theme;
  const col = { suburb: '#c9c3b5', estate: '#d9ccab', golf: '#3d7a2c', pitch: '#bf5a40', castle: '#a89f8e' }[th];
  g.fillStyle = col; g.fillRect(-M, -M, w + M * 2, h + M * 2);
  if (th === 'suburb') { // paving slabs
    g.strokeStyle = 'rgba(0,0,0,0.08)'; g.lineWidth = 2;
    for (let x = -M; x < w + M; x += 40) { g.beginPath(); g.moveTo(x, -M); g.lineTo(x, h + M); g.stroke(); }
    for (let y = -M; y < h + M; y += 40) { g.beginPath(); g.moveTo(-M, y); g.lineTo(w + M, y); g.stroke(); }
  } else if (th === 'estate' || th === 'castle') { // gravel / cobbles
    for (let i = 0; i < (w + h) * 9; i++) {
      const x = -M + r() * (w + M * 2), y = -M + r() * (h + M * 2);
      if (x > -2 && x < w + 2 && y > -2 && y < h + 2) continue;
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(60,40,20,0.13)';
      if (th === 'castle') { g.beginPath(); g.ellipse(x, y, 4 + r() * 4, 3 + r() * 3, r() * 3, 0, TAU); g.fill(); } else g.fillRect(x, y, 2 + r() * 2, 2 + r() * 2);
    }
  } else if (th === 'golf') {
    g.lineCap = 'round';
    for (let i = 0; i < (w + h) * 10; i++) {
      const x = -M + r() * (w + M * 2), y = -M + r() * (h + M * 2);
      if (x > -2 && x < w + 2 && y > -2 && y < h + 2) continue;
      g.strokeStyle = r() < 0.5 ? '#2f6a22' : '#4a8a36'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 6, y - 5 - r() * 5); g.stroke();
    }
  } else if (th === 'pitch') { // running track lanes
    g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 2;
    for (let k = 1; k < 4; k++) { const d = 16 + k * 16; g.beginPath(); g.roundRect(-d, -d, w + d * 2, h + d * 2, d); g.stroke(); }
  }
  g.clearRect(0, 0, w, h);
}

function path(g, s, r) {
  g.fillStyle = '#a99c82'; rr(g, s.x, s.y, s.w, s.h, 3); g.fill();
  const vert = s.h > s.w;
  const L = vert ? s.h : s.w, Wd = vert ? s.w : s.h;
  let a = 2;
  while (a < L - 2) {
    const len = Math.min(L - 2 - a, 22 + r() * 16);
    const split = Wd > 40 && r() < 0.6;
    const parts = split ? [[2, Wd * (0.35 + r() * 0.3)], [0, 0]] : [[2, Wd - 4]];
    if (split) { parts[1] = [parts[0][1] + 3, Wd - parts[0][1] - 5]; parts[0][1] -= 2; }
    for (const [o, wd] of parts) {
      const x = vert ? s.x + o : s.x + a, y = vert ? s.y + a : s.y + o, ww = vert ? wd : len - 3, hh = vert ? len - 3 : wd;
      g.fillStyle = mix('#e4d8bd', '#cfc1a2', r()); rr(g, x, y, ww, hh, 4); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.25)'; rr(g, x, y, ww, 2.5, 2); g.fill();
    }
    a += len;
  }
}
function patio(g, s, r) {
  g.fillStyle = '#8f8676'; g.fillRect(s.x, s.y, s.w, s.h);
  for (let y = s.y; y < s.y + s.h; y += 42) for (let x = s.x; x < s.x + s.w; x += 42) {
    g.fillStyle = mix('#d8cdb8', '#c4b79c', r()); g.fillRect(x + 2, y + 2, Math.min(40, s.x + s.w - x - 2), Math.min(40, s.y + s.h - y - 2));
  }
  // a table and chairs
  const cx = s.x + s.w * 0.5, cy = s.y + s.h * 0.5;
  g.fillStyle = SHADOW; circ(g, cx + 6, cy + 8, 26); g.fill();
  g.fillStyle = '#ffffff'; circ(g, cx, cy, 24); g.fill(); g.fillStyle = '#e8453c';
  for (let i = 0; i < 8; i += 2) { g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, 24, (i / 8) * TAU, ((i + 1) / 8) * TAU); g.fill(); }
  g.fillStyle = '#c33'; circ(g, cx, cy, 3); g.fill();
}
function sand(g, s, r) {
  shapePath(g, s, 4); g.fillStyle = '#c9b27a'; g.fill();
  shapePath(g, s); g.fillStyle = '#efdca6'; g.fill();
  g.save(); shapePath(g, s); g.clip();
  g.strokeStyle = 'rgba(160,130,70,0.35)'; g.lineWidth = 1.5;
  const cx = s.t === 'r' ? s.x + s.w / 2 : s.x, cy = s.t === 'r' ? s.y + s.h / 2 : s.y;
  for (let k = 8; k < 200; k += 9) { g.beginPath(); g.arc(cx, cy, k, 0, TAU); g.stroke(); }
  g.restore();
}
function bed(g, s, r) {
  shapePath(g, s, 3); g.fillStyle = '#9b7a55'; g.fill();
  shapePath(g, s); g.fillStyle = '#6a472b'; g.fill();
  g.save(); shapePath(g, s); g.clip();
  const bx = s.t === 'r' ? s.x : s.x - s.r, by = s.t === 'r' ? s.y : s.y - s.r, bw = s.t === 'r' ? s.w : s.r * 2, bh = s.t === 'r' ? s.h : s.r * 2;
  for (let i = 0; i < bw * bh / 30; i++) { g.fillStyle = r() < 0.5 ? '#5a3a22' : '#7d5838'; g.fillRect(bx + r() * bw, by + r() * bh, 2 + r() * 3, 2 + r() * 2); }
  g.restore();
}
function water(g, s, r) {
  shapePath(g, s, 7); g.fillStyle = '#b5ab96'; g.fill();
  // pebble rim
  if (s.t === 'c') for (let a = 0; a < TAU; a += 0.16) { g.fillStyle = mix('#cfc6b2', '#9a917e', r()); circ(g, s.x + Math.cos(a) * (s.r + 4), s.y + Math.sin(a) * (s.r + 4), 4 + r() * 2.5); g.fill(); }
  shapePath(g, s);
  const cx = s.t === 'r' ? s.x + s.w / 2 : s.x, cy = s.t === 'r' ? s.y + s.h / 2 : s.y, rad = s.t === 'r' ? Math.max(s.w, s.h) / 2 : s.r;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
  gr.addColorStop(0, '#2b7fb8'); gr.addColorStop(0.7, '#3b9ad0'); gr.addColorStop(1, '#6fc3e6');
  g.fillStyle = s.t === 'r' ? '#3592c8' : gr; g.fill();
  if (s.t === 'c') for (let i = 0; i < 4; i++) { // lily pads
    const a = r() * TAU, d = s.r * (0.4 + r() * 0.45), x = s.x + Math.cos(a) * d, y = s.y + Math.sin(a) * d, pr = 8 + r() * 5;
    g.fillStyle = '#4f9e3a'; g.beginPath(); g.moveTo(x, y); g.arc(x, y, pr, a + 0.4, a + TAU - 0.1); g.fill();
    if (r() < 0.6) { g.fillStyle = '#ffb7d0'; circ(g, x + 2, y - 2, 3.5); g.fill(); }
  }
}
function fountainBase(g, s) {
  g.fillStyle = '#b8ae9a'; circ(g, s.x, s.y, s.r + 4); g.fill();
  g.fillStyle = '#e9e2d2'; circ(g, s.x, s.y, s.r); g.fill();
  const gr = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r - 8);
  gr.addColorStop(0, '#5fb6e2'); gr.addColorStop(1, '#3b93c8');
  g.fillStyle = gr; circ(g, s.x, s.y, s.r - 9); g.fill();
  g.fillStyle = '#d8d0c0'; circ(g, s.x, s.y, s.r * 0.22); g.fill();
  g.fillStyle = '#f2ece0'; circ(g, s.x - 2, s.y - 2, s.r * 0.16); g.fill();
}
function pitchLines(g, lv) {
  const { w, h } = lv, m = 26;
  g.strokeStyle = 'rgba(255,255,255,0.88)'; g.lineWidth = 5;
  g.strokeRect(m, m, w - m * 2, h - m * 2);
  g.beginPath(); g.moveTo(w / 2, m); g.lineTo(w / 2, h - m); g.stroke();
  circ(g, w / 2, h / 2, 80); g.stroke();
  g.fillStyle = '#fff'; circ(g, w / 2, h / 2, 5); g.fill();
  for (const side of [0, 1]) {
    const x0 = side ? w - m : m, d = side ? -1 : 1;
    g.strokeRect(Math.min(x0, x0 + d * 150), h / 2 - 170, 150, 340);
    g.strokeRect(Math.min(x0, x0 + d * 56), h / 2 - 80, 56, 160);
    circ(g, x0 + d * 104, h / 2, 4); g.fill();
    g.beginPath(); g.arc(x0 + d * 104, h / 2, 80, side ? Math.PI - 0.93 + Math.PI : -0.93, side ? Math.PI + 0.93 + Math.PI : 0.93); g.stroke();
  }
}
function slope(g, s) {
  const a = (s.dir * Math.PI) / 180, dx = Math.cos(a), dy = Math.sin(a);
  const cx = s.x + s.w / 2, cy = s.y + s.h / 2, L = Math.abs(dx) * s.w / 2 + Math.abs(dy) * s.h / 2;
  const gr = g.createLinearGradient(cx - dx * L, cy - dy * L, cx + dx * L, cy + dy * L);
  gr.addColorStop(0, 'rgba(255,255,220,0.22)'); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(10,40,0,0.3)');
  g.fillStyle = gr; rr(g, s.x, s.y, s.w, s.h, 40); g.fill();
  // downhill chevrons
  g.save(); rr(g, s.x, s.y, s.w, s.h, 40); g.clip();
  g.strokeStyle = 'rgba(255,255,230,0.42)'; g.lineWidth = 5; g.lineCap = 'round'; g.lineJoin = 'round';
  for (let y = s.y + 40; y < s.y + s.h; y += 80) for (let x = s.x + 40; x < s.x + s.w; x += 80) {
    g.save(); g.translate(x, y); g.rotate(a);
    g.beginPath(); g.moveTo(-6, -12); g.lineTo(6, 0); g.lineTo(-6, 12); g.stroke();
    g.restore();
  }
  g.restore();
}

function hedge(p, s, r) {
  p.save(); rr(p, s.x, s.y, s.w, s.h, 10); p.fillStyle = '#245a22'; p.fill(); p.clip();
  const n = (s.w * s.h) / 40;
  for (let i = 0; i < n; i++) {
    const x = s.x + r() * s.w, y = s.y + r() * s.h, t = r();
    p.fillStyle = t < 0.3 ? '#2b6927' : t < 0.6 ? '#347a2e' : t < 0.85 ? '#3f8a36' : '#55a344';
    circ(p, x, y, 4 + r() * 5); p.fill();
  }
  const gr = p.createLinearGradient(s.x, s.y, s.x + s.w * 0.3, s.y + s.h);
  gr.addColorStop(0, 'rgba(255,255,200,0.2)'); gr.addColorStop(1, 'rgba(0,20,0,0.25)');
  p.fillStyle = gr; p.fillRect(s.x, s.y, s.w, s.h);
  p.restore();
  rr(p, s.x, s.y, s.w, s.h, 10); p.strokeStyle = 'rgba(15,45,10,0.6)'; p.lineWidth = 2; p.stroke();
}
function stoneBlocks(p, s, r, base) {
  p.fillStyle = base; p.fillRect(s.x, s.y, s.w, s.h);
  for (let y = s.y; y < s.y + s.h; y += 14) {
    const off = ((y - s.y) / 14) % 2 ? 12 : 0;
    for (let x = s.x - off; x < s.x + s.w; x += 24) {
      p.fillStyle = mix('#c4bcac', '#9e9584', r());
      p.fillRect(Math.max(s.x, x + 1), y + 1, Math.min(22, s.x + s.w - x - 1, x + 23 - s.x), Math.min(12, s.y + s.h - y - 1));
    }
  }
}
function wall(p, s, r) {
  stoneBlocks(p, s, r, '#7d7568');
  // crenellations along the lawn side
  p.fillStyle = '#d6cfbf';
  const horiz = s.w > s.h;
  if (horiz) for (let x = s.x + 4; x < s.x + s.w - 10; x += 26) { p.fillRect(x, s.y + s.h - 14, 14, 14); p.fillStyle = '#d6cfbf'; }
  p.fillStyle = 'rgba(0,0,0,0.25)'; p.fillRect(s.x, s.y + s.h - 3, s.w, 3);
}
function keep(p, s, r) {
  stoneBlocks(p, s, r, '#6f685c');
  p.fillStyle = '#5a5249'; p.fillRect(s.x + 22, s.y + 22, s.w - 44, s.h - 44);
  p.fillStyle = '#7a3a2e'; p.fillRect(s.x + 30, s.y + 30, s.w - 60, s.h - 60);
  p.strokeStyle = 'rgba(0,0,0,0.25)'; p.lineWidth = 2;
  for (let y = s.y + 36; y < s.y + s.h - 30; y += 8) { p.beginPath(); p.moveTo(s.x + 30, y); p.lineTo(s.x + s.w - 30, y); p.stroke(); }
  p.fillStyle = '#d6cfbf';
  for (let x = s.x + 4; x < s.x + s.w - 10; x += 24) { p.fillRect(x, s.y + 4, 12, 12); p.fillRect(x, s.y + s.h - 16, 12, 12); }
  // a flag
  p.fillStyle = '#3a2a1a'; p.fillRect(s.x + s.w / 2 - 2, s.y + s.h / 2 - 30, 4, 30);
  p.fillStyle = '#e8453c'; p.beginPath(); p.moveTo(s.x + s.w / 2 + 2, s.y + s.h / 2 - 30); p.lineTo(s.x + s.w / 2 + 34, s.y + s.h / 2 - 22); p.lineTo(s.x + s.w / 2 + 2, s.y + s.h / 2 - 14); p.fill();
}
function tower(p, s) {
  p.fillStyle = '#7d7568'; circ(p, s.x, s.y, s.r); p.fill();
  p.fillStyle = '#a69e8e'; circ(p, s.x, s.y, s.r - 8); p.fill();
  p.fillStyle = '#5c544a'; circ(p, s.x, s.y, s.r - 20); p.fill();
  p.fillStyle = '#d6cfbf';
  for (let a = 0; a < TAU; a += TAU / 14) { p.save(); p.translate(s.x + Math.cos(a) * (s.r - 6), s.y + Math.sin(a) * (s.r - 6)); p.rotate(a); p.fillRect(-5, -6, 10, 12); p.restore(); }
}
function roof(p, s, col, r) {
  const horiz = s.w >= s.h;
  rr(p, s.x - 4, s.y - 4, s.w + 8, s.h + 8, 4); p.fillStyle = mix(col, '#000000', 0.45); p.fill();
  // two pitched halves, the sunny one lighter
  p.fillStyle = mix(col, '#ffffff', 0.12);
  if (horiz) p.fillRect(s.x, s.y, s.w, s.h / 2); else p.fillRect(s.x, s.y, s.w / 2, s.h);
  p.fillStyle = mix(col, '#000000', 0.12);
  if (horiz) p.fillRect(s.x, s.y + s.h / 2, s.w, s.h / 2); else p.fillRect(s.x + s.w / 2, s.y, s.w / 2, s.h);
  p.strokeStyle = 'rgba(0,0,0,0.16)'; p.lineWidth = 2;
  if (horiz) for (let y = s.y + 8; y < s.y + s.h; y += 9) { p.beginPath(); p.moveTo(s.x, y); p.lineTo(s.x + s.w, y); p.stroke(); }
  else for (let x = s.x + 8; x < s.x + s.w; x += 9) { p.beginPath(); p.moveTo(x, s.y); p.lineTo(x, s.y + s.h); p.stroke(); }
  // tile staggers
  p.strokeStyle = 'rgba(0,0,0,0.08)';
  if (horiz) for (let y = s.y; y < s.y + s.h; y += 9) for (let x = s.x + ((y / 9) % 2) * 9; x < s.x + s.w; x += 18) { p.beginPath(); p.moveTo(x, y); p.lineTo(x, y + 9); p.stroke(); }
  p.fillStyle = mix(col, '#000000', 0.35);
  if (horiz) p.fillRect(s.x, s.y + s.h / 2 - 3, s.w, 6); else p.fillRect(s.x + s.w / 2 - 3, s.y, 6, s.h);
  // chimney
  const cx = s.x + s.w * 0.72, cy = s.y + s.h * 0.22;
  p.fillStyle = SHADOW; p.fillRect(cx + 6, cy + 8, 26, 22);
  p.fillStyle = '#9a4a34'; p.fillRect(cx, cy, 26, 22); p.fillStyle = '#7a3624'; p.fillRect(cx + 5, cy + 5, 16, 12);
  p.fillStyle = '#2a1a12'; p.fillRect(cx + 8, cy + 8, 10, 6);
  // skylight
  p.fillStyle = '#9fd6f0'; p.fillRect(s.x + s.w * 0.25, s.y + s.h * 0.6, 34, 22); p.strokeStyle = '#555'; p.lineWidth = 3; p.strokeRect(s.x + s.w * 0.25, s.y + s.h * 0.6, 34, 22);
}
function shed(p, s) {
  rr(p, s.x - 3, s.y - 3, s.w + 6, s.h + 6, 3); p.fillStyle = '#5a3a22'; p.fill();
  p.fillStyle = '#8a5a34'; p.fillRect(s.x, s.y, s.w, s.h / 2); p.fillStyle = '#764a2a'; p.fillRect(s.x, s.y + s.h / 2, s.w, s.h / 2);
  p.strokeStyle = 'rgba(0,0,0,0.2)'; p.lineWidth = 2;
  for (let x = s.x + 10; x < s.x + s.w; x += 11) { p.beginPath(); p.moveTo(x, s.y); p.lineTo(x, s.y + s.h); p.stroke(); }
  p.fillStyle = '#4a2e1a'; p.fillRect(s.x, s.y + s.h / 2 - 2, s.w, 4);
}
function tent(p, s) {
  rr(p, s.x, s.y, s.w, s.h, 6); p.fillStyle = '#fff'; p.fill();
  p.save(); rr(p, s.x, s.y, s.w, s.h, 6); p.clip();
  p.fillStyle = '#e8453c';
  for (let x = s.x; x < s.x + s.w; x += 28) p.fillRect(x, s.y, 14, s.h);
  const gr = p.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.2)');
  p.fillStyle = gr; p.fillRect(s.x, s.y, s.w, s.h);
  p.restore();
  p.fillStyle = '#ffc93c'; for (const fx of [0.2, 0.5, 0.8]) { circ(p, s.x + s.w * fx, s.y + s.h / 2, 5); p.fill(); }
  p.strokeStyle = '#a82a24'; p.lineWidth = 2; rr(p, s.x, s.y, s.w, s.h, 6); p.stroke();
}
function kennel(p, s) {
  roof(p, { ...s }, '#b0573a', rng(3));
  // bowl
  p.fillStyle = SHADOW; circ(p, s.x - 18 + 4, s.y + s.h - 6 + 5, 11); p.fill();
  p.fillStyle = '#3d7fd1'; circ(p, s.x - 18, s.y + s.h - 6, 11); p.fill(); p.fillStyle = '#8a5a34'; circ(p, s.x - 18, s.y + s.h - 6, 7); p.fill();
}
function goal(p, s) {
  p.save(); p.strokeStyle = 'rgba(255,255,255,0.55)'; p.lineWidth = 1;
  for (let x = s.x; x <= s.x + s.w; x += 6) { p.beginPath(); p.moveTo(x, s.y); p.lineTo(x, s.y + s.h); p.stroke(); }
  for (let y = s.y; y <= s.y + s.h; y += 6) { p.beginPath(); p.moveTo(s.x, y); p.lineTo(s.x + s.w, y); p.stroke(); }
  p.restore();
  p.strokeStyle = '#ffffff'; p.lineWidth = 6; p.strokeRect(s.x + 3, s.y + 3, s.w - 6, s.h - 6);
}
function border(p, g, lv, r) {
  const { w, h, theme } = lv;
  if (theme === 'suburb') { // white picket fence
    for (const [x0, y0, x1, y1] of [[-8, -8, w + 8, -8], [-8, h + 8, w + 8, h + 8], [-8, -8, -8, h + 8], [w + 8, -8, w + 8, h + 8]]) {
      g.strokeStyle = SHADOW; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + 6, y0 + 8); g.lineTo(x1 + 6, y1 + 8); g.stroke();
      p.strokeStyle = '#d9d2c4'; p.lineWidth = 6; p.beginPath(); p.moveTo(x0, y0); p.lineTo(x1, y1); p.stroke();
      const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / 14);
      for (let i = 0; i <= n; i++) {
        const x = x0 + ((x1 - x0) * i) / n, y = y0 + ((y1 - y0) * i) / n;
        p.fillStyle = '#ffffff'; p.fillRect(x - 3.5, y - 3.5, 7, 7); p.fillStyle = 'rgba(0,0,0,0.12)'; p.fillRect(x - 3.5, y + 1.5, 7, 2);
      }
    }
  } else if (theme === 'estate') {
    for (const s of [{ x: -30, y: -30, w: w + 60, h: 26 }, { x: -30, y: h + 4, w: w + 60, h: 26 }, { x: -30, y: -30, w: 26, h: h + 60 }, { x: w + 4, y: -30, w: 26, h: h + 60 }]) {
      g.fillStyle = SHADOW; g.fillRect(s.x + 8, s.y + 10, s.w, s.h); hedge(p, s, r);
    }
  } else if (theme === 'castle') {
    for (const s of [{ x: -34, y: -34, w: w + 68, h: 30 }, { x: -34, y: h + 4, w: w + 68, h: 30 }, { x: -34, y: -34, w: 30, h: h + 68 }, { x: w + 4, y: -34, w: 30, h: h + 68 }]) {
      g.fillStyle = SHADOW; g.fillRect(s.x + 8, s.y + 10, s.w, s.h); stoneBlocks(p, s, r, '#7d7568');
    }
  } else if (theme === 'pitch') {
    p.strokeStyle = '#f2f2f2'; p.lineWidth = 4; p.strokeRect(-10, -10, w + 20, h + 20);
    p.fillStyle = '#9aa0a8'; for (let x = -10; x <= w + 10; x += 60) { p.fillRect(x - 3, -13, 6, 6); p.fillRect(x - 3, h + 7, 6, 6); }
  } else if (theme === 'golf') {
    p.strokeStyle = 'rgba(255,255,255,0.8)'; p.lineWidth = 2; p.setLineDash([10, 6]); p.strokeRect(-8, -8, w + 16, h + 16); p.setLineDash([]);
    p.fillStyle = '#fff'; for (let x = -8; x <= w + 8; x += 100) { circ(p, x, -8, 4); p.fill(); circ(p, x, h + 8, 4); p.fill(); }
  }
}

// ------------------------------------------------------------------ sprites
const FLOWER_COLS = ['#ff5d8f', '#ffd23f', '#ff8c42', '#b38cff', '#ffffff', '#e8453c'];
let flowerSprites = null;
function flowerSprite(i) {
  if (!flowerSprites) {
    flowerSprites = FLOWER_COLS.map((col) => {
      const c = document.createElement('canvas'); c.width = c.height = 22; const x = c.getContext('2d');
      x.translate(11, 11);
      x.fillStyle = '#2f7a2a'; for (let k = 0; k < 3; k++) { x.beginPath(); x.ellipse(Math.cos(k * 2.1 + 0.5) * 6, Math.sin(k * 2.1 + 0.5) * 6, 4.5, 2.4, k * 2.1 + 0.5, 0, TAU); x.fill(); }
      x.fillStyle = 'rgba(0,0,0,0.18)'; for (let k = 0; k < 5; k++) { circ(x, Math.cos(k * 1.256) * 3.6 + 1, Math.sin(k * 1.256) * 3.6 + 1.5, 3.2); x.fill(); }
      x.fillStyle = col; for (let k = 0; k < 5; k++) { circ(x, Math.cos(k * 1.256) * 3.6, Math.sin(k * 1.256) * 3.6, 3.2); x.fill(); }
      x.fillStyle = col === '#ffd23f' ? '#c0602a' : '#ffd23f'; circ(x, 0, 0, 2.3); x.fill();
      return c;
    });
  }
  return flowerSprites[i % flowerSprites.length];
}
export function drawFlowers(x, flowers, t) {
  for (const f of flowers) {
    if (!f.alive) { x.fillStyle = '#3d6b2a'; x.fillRect(f.x - 1, f.y - 1, 2, 3); continue; }
    const sw = Math.sin(t * 2 + f.ph) * 0.8;
    x.drawImage(flowerSprite(f.c), f.x - 11 + sw, f.y - 11);
  }
}

export function drawTree(x, tr, t, see) {
  const [tx, ty, R] = tr.d;
  if (!tr.blobs) {
    const r = rng(tx * 13 + ty);
    tr.blobs = [];
    for (let i = 0; i < 9; i++) { const a = r() * TAU, d = r() * R * 0.55; tr.blobs.push([Math.cos(a) * d, Math.sin(a) * d, R * (0.35 + r() * 0.25), r()]); }
  }
  const sw = Math.sin(t * 0.8 + tx) * 2;
  x.save(); x.globalAlpha = see ? 0.5 : 1;
  x.fillStyle = '#245c22'; circ(x, tx + sw * 0.5, ty, R); x.fill();
  for (const [bx, by, br] of tr.blobs) { x.fillStyle = '#2f7329'; circ(x, tx + bx + sw, ty + by, br); x.fill(); }
  for (const [bx, by, br] of tr.blobs) { x.fillStyle = '#3f8d35'; circ(x, tx + bx + sw - br * 0.18, ty + by - br * 0.2, br * 0.75); x.fill(); }
  for (const [bx, by, br, k] of tr.blobs) { if (k < 0.5) continue; x.fillStyle = '#5cab47'; circ(x, tx + bx + sw - br * 0.35, ty + by - br * 0.38, br * 0.4); x.fill(); }
  x.restore();
}

export function drawShadow(x, cx, cy, rx, ry, a = 0.3) { x.fillStyle = `rgba(16,48,8,${a})`; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, TAU); x.fill(); }

const COATS = ['#3d6fd1', '#3fa34d', '#ffc93c', '#8a4fd8'];
export function drawGnome(x, gn, t) {
  const z = gn.z || 0;
  drawShadow(x, gn.x + 3, gn.y + 4, 10 * (1 - Math.min(z, 200) / 400), 5 * (1 - Math.min(z, 200) / 400));
  x.save(); x.translate(gn.x, gn.y - z);
  if (gn.spin) x.rotate(gn.spin);
  const wob = gn.wob > 0 ? Math.sin(gn.wob * 40) * gn.wob * 0.6 : 0;
  x.rotate(wob);
  // body
  x.fillStyle = COATS[gn.c % COATS.length]; rr(x, -8, -10, 16, 14, 6); x.fill();
  x.fillStyle = '#5a3a22'; x.fillRect(-8, -2, 16, 3);
  x.fillStyle = '#3a2a1a'; rr(x, -8, 3, 7, 4, 2); x.fill(); rr(x, 1, 3, 7, 4, 2); x.fill();
  // beard and face
  x.fillStyle = '#ffffff'; x.beginPath(); x.moveTo(-7, -14); x.lineTo(7, -14); x.lineTo(0, -1); x.closePath(); x.fill();
  x.fillStyle = '#f6c6a0'; circ(x, 0, -16, 5.5); x.fill();
  x.fillStyle = '#e88b7a'; circ(x, 0, -14.5, 2.2); x.fill();
  x.fillStyle = '#1f1f1f'; circ(x, -2.2, -17, 0.9); x.fill(); circ(x, 2.2, -17, 0.9); x.fill();
  // hat
  x.fillStyle = '#e8453c'; x.beginPath(); x.moveTo(-7, -18); x.lineTo(7, -18); x.lineTo(1.5, -33); x.closePath(); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.moveTo(-5, -19); x.lineTo(-1, -19); x.lineTo(0.8, -30); x.closePath(); x.fill();
  x.restore();
}

export function drawToy(x, toy, t) {
  if (toy.gone) return;
  const { x: px, y: py, kind } = toy;
  drawShadow(x, px + 4, py + 5, kind === 'golf' ? 5 : 11, kind === 'golf' ? 3 : 7, 0.28);
  x.save(); x.translate(px, py);
  if (kind === 'ball') {
    const cols = ['#e8453c', '#ffffff', '#3d6fd1', '#ffffff', '#ffc93c', '#ffffff'];
    for (let i = 0; i < 6; i++) { x.fillStyle = cols[i]; x.beginPath(); x.moveTo(0, 0); x.arc(0, 0, 11, (i / 6) * TAU + toy.rot, ((i + 1) / 6) * TAU + toy.rot); x.fill(); }
    x.fillStyle = 'rgba(255,255,255,0.5)'; circ(x, -3.5, -3.5, 3.5); x.fill();
  } else if (kind === 'duck') {
    x.fillStyle = '#ffd23f'; x.beginPath(); x.ellipse(0, 0, 11, 8, 0, 0, TAU); x.fill();
    x.fillStyle = '#ffdf6a'; circ(x, 7, -2, 5.5); x.fill();
    x.fillStyle = '#ff8c42'; x.beginPath(); x.moveTo(11, -3); x.lineTo(17, -1); x.lineTo(11, 1); x.fill();
    x.fillStyle = '#222'; circ(x, 8.5, -4, 1.2); x.fill();
    x.fillStyle = '#f0c030'; x.beginPath(); x.ellipse(-2, 1, 5, 3, -0.3, 0, TAU); x.fill();
  } else if (kind === 'truck') {
    x.rotate(0.4);
    x.fillStyle = '#222'; for (const [wx, wy] of [[-9, -8], [-9, 6], [6, -8], [6, 6]]) x.fillRect(wx, wy, 6, 3);
    x.fillStyle = '#3d6fd1'; rr(x, -12, -7, 15, 14, 2); x.fill();
    x.fillStyle = '#ffc93c'; rr(x, 3, -6, 9, 12, 3); x.fill();
    x.fillStyle = '#9fd6f0'; x.fillRect(8, -4, 3, 8);
  } else if (kind === 'golf') {
    x.fillStyle = '#ffffff'; circ(x, 0, 0, 5); x.fill(); x.fillStyle = 'rgba(0,0,0,0.12)'; circ(x, 1, 1, 3); x.fill();
  } else if (kind === 'cone') {
    x.fillStyle = '#ff7a1f'; x.fillRect(-11, -11, 22, 22); x.fillStyle = '#ff9a4a'; circ(x, 0, 0, 9); x.fill();
    x.fillStyle = '#ffffff'; circ(x, 0, 0, 6); x.fill(); x.fillStyle = '#ff7a1f'; circ(x, 0, 0, 3.5); x.fill();
  }
  x.restore();
}

export function drawFuel(x, f, t) {
  if (f.gone) return;
  const b = Math.sin(t * 4 + f.x) * 2.5;
  const pulse = 0.5 + 0.5 * Math.sin(t * 6);
  x.strokeStyle = `rgba(255,230,120,${0.35 + pulse * 0.4})`; x.lineWidth = 3; circ(x, f.x, f.y, 20 + pulse * 3); x.stroke();
  drawShadow(x, f.x + 4, f.y + 6, 11, 6);
  x.save(); x.translate(f.x, f.y + b - 4); x.rotate(-0.15);
  x.fillStyle = '#a82a24'; rr(x, -10, -12, 20, 24, 4); x.fill();
  x.fillStyle = '#e8453c'; rr(x, -10, -13, 20, 22, 4); x.fill();
  x.fillStyle = '#ff7a6c'; rr(x, -7, -10, 6, 16, 2); x.fill();
  x.fillStyle = '#2a2a2a'; rr(x, 3, -17, 6, 6, 2); x.fill();
  x.strokeStyle = '#a82a24'; x.lineWidth = 3; x.beginPath(); x.moveTo(-6, -13); x.lineTo(-6, -17); x.lineTo(1, -17); x.stroke();
  x.restore();
}

export function drawSprinkler(x, s, t) {
  const up = s.up;
  drawShadow(x, s.x + 2, s.y + 3, 6 + up * 2, 4 + up, 0.3);
  x.fillStyle = '#4a4f55'; circ(x, s.x, s.y, 6.5); x.fill();
  x.fillStyle = '#7a8088'; circ(x, s.x, s.y, 4.5); x.fill();
  if (up > 0) {
    x.save(); x.translate(s.x, s.y - up * 6); x.rotate(s.ang);
    x.fillStyle = '#c99a2e'; rr(x, -3, -3, 12, 6, 2); x.fill();
    x.fillStyle = '#e8c45a'; circ(x, 0, 0, 4); x.fill();
    x.restore();
  }
}

export function drawMud(x, m) {
  if (m.wet <= 0.02) return;
  const w = Math.min(1, m.wet), S = m.size;
  // one merged puddle (a union of blobs filled once, so overlaps never darken into lumps)
  const blobPath = (k, ox, oy) => { x.beginPath(); for (const [bx, by, br] of m.blobs) { const cx = m.x + bx * S + ox, cy = m.y + by * S + oy, r = br * S * k; x.moveTo(cx + r, cy); x.arc(cx, cy, r, 0, TAU); } };
  x.save();
  x.globalAlpha = w * 0.9; blobPath(1.08, 0, 0); x.fillStyle = '#4e3520'; x.fill();
  blobPath(0.96, 0, 0); x.fillStyle = '#6e4b2b'; x.fill();
  x.globalAlpha = w * 0.55; blobPath(0.62, -S * 0.04, -S * 0.05); x.fillStyle = '#86603a'; x.fill();
  // wet sheen
  x.globalAlpha = w * 0.5; x.fillStyle = '#d8eef6';
  m.blobs.forEach(([bx, by, br], i) => { if (i % 3) return; x.beginPath(); x.ellipse(m.x + bx * S - br * S * 0.25, m.y + by * S - br * S * 0.3, br * S * 0.26, br * S * 0.09, -0.5, 0, TAU); x.fill(); });
  x.restore();
}

export function drawDog(x, d, t) {
  const corgi = d.corgi;
  drawShadow(x, d.x + 5, d.y + 7, 18, 10);
  x.save(); x.translate(d.x, d.y); x.rotate(d.a);
  const run = d.state === 'chase' || d.state === 'home' ? Math.sin(t * 22) : 0;
  const body = corgi ? '#e08a3a' : '#c98a4b', dark = corgi ? '#b8642a' : '#8a5a2e';
  // legs
  x.fillStyle = dark;
  for (const [lx, ly, ph] of [[8, -8, 0], [8, 8, 1], [-9, -8, 1], [-9, 8, 0]]) x.fillRect(lx + (ph ? run : -run) * 4 - 3, ly - 2.5 + (ly > 0 ? 1 : -1), 6, 5);
  // tail
  const wag = Math.sin(t * (d.state === 'happy' ? 30 : 12)) * 0.6;
  x.save(); x.translate(-15, 0); x.rotate(wag); x.fillStyle = body; rr(x, -12, -2.5, 13, 5, 3); x.fill(); x.restore();
  x.fillStyle = body; x.beginPath(); x.ellipse(0, 0, 17, 10, 0, 0, TAU); x.fill();
  if (corgi) { x.fillStyle = '#fff3e0'; x.beginPath(); x.ellipse(4, 0, 9, 6, 0, 0, TAU); x.fill(); }
  else { x.fillStyle = dark; x.beginPath(); x.ellipse(-4, -3, 6, 4, 0.4, 0, TAU); x.fill(); }
  // head
  x.fillStyle = body; circ(x, 16, 0, 8.5); x.fill();
  x.fillStyle = corgi ? '#fff3e0' : '#e0b07a'; x.beginPath(); x.ellipse(23, 0, 5, 4, 0, 0, TAU); x.fill();
  x.fillStyle = '#222'; circ(x, 27, 0, 2); x.fill();
  // ears
  x.fillStyle = dark;
  if (corgi) { for (const s of [-1, 1]) { x.beginPath(); x.moveTo(12, s * 4); x.lineTo(13, s * 12); x.lineTo(18, s * 6); x.fill(); } }
  else for (const s of [-1, 1]) { x.beginPath(); x.ellipse(13, s * 8, 6, 3, s * 0.5 + run * 0.2 * s, 0, TAU); x.fill(); }
  if (d.state === 'happy') { x.fillStyle = '#ff6b8a'; x.beginPath(); x.ellipse(27, 4, 3, 2, 0.5, 0, TAU); x.fill(); }
  x.restore();
}

export function drawCat(x, c, t) {
  if (c.state === 'sleep' || c.state === 'alert') {
    drawShadow(x, c.x + 3, c.y + 4, 14, 10);
    x.save(); x.translate(c.x, c.y);
    const br = 1 + Math.sin(t * 2.2 + c.x) * 0.04;
    x.scale(br, br);
    x.fillStyle = c.col; circ(x, 0, 0, 12); x.fill();
    x.strokeStyle = c.stripe; x.lineWidth = 2.5;
    for (let a = -1; a <= 1; a++) { x.beginPath(); x.arc(0, 0, 8, a * 0.6 - 0.2, a * 0.6 + 0.2); x.stroke(); }
    x.fillStyle = c.col; circ(x, 7, 6, 6.5); x.fill();
    // ears
    x.beginPath(); x.moveTo(3, 4); x.lineTo(5, -1); x.lineTo(8, 2); x.fill(); x.beginPath(); x.moveTo(9, 2); x.lineTo(13, 0); x.lineTo(12, 5); x.fill();
    // tail wrapped round
    x.strokeStyle = c.col; x.lineWidth = 5; x.lineCap = 'round'; x.beginPath(); x.arc(0, 0, 13, 0.9, 2.9); x.stroke();
    if (c.state === 'alert') { x.fillStyle = '#ffd23f'; circ(x, 6, 5, 1.6); x.fill(); circ(x, 10, 5, 1.6); x.fill(); }
    else { x.strokeStyle = '#333'; x.lineWidth = 1; x.beginPath(); x.moveTo(5, 5); x.lineTo(7, 5); x.moveTo(9, 5); x.lineTo(11, 5); x.stroke(); }
    x.restore();
    if (c.state === 'sleep') {
      x.font = `16px ${FONT}`; x.fillStyle = 'rgba(255,255,255,0.85)'; x.strokeStyle = 'rgba(30,60,30,0.6)'; x.lineWidth = 3;
      for (let k = 0; k < 2; k++) { const ph = (t * 0.6 + k * 0.5 + c.x * 0.01) % 1; x.globalAlpha = 1 - ph; x.strokeText('z', c.x + 12 + ph * 10, c.y - 12 - ph * 22); x.fillText('z', c.x + 12 + ph * 10, c.y - 12 - ph * 22); }
      x.globalAlpha = 1;
    } else { drawPop(x, '!', c.x, c.y - 26, 22, '#ffd23f'); }
    return;
  }
  const z = c.z || 0;
  drawShadow(x, c.x + 3, c.y + 5, 14, 7);
  x.save(); x.translate(c.x, c.y - z); x.rotate(c.a + (c.spin || 0));
  const run = Math.sin(t * 28);
  x.fillStyle = c.col;
  for (const [lx, ly, ph] of [[7, -6, 0], [7, 6, 1], [-7, -6, 1], [-7, 6, 0]]) x.fillRect(lx + (ph ? run : -run) * 4 - 2.5, ly - 2, 5, 4);
  x.strokeStyle = c.col; x.lineWidth = 4; x.lineCap = 'round'; x.beginPath(); x.moveTo(-12, 0); x.quadraticCurveTo(-20, run * 6, -26, run * 3); x.stroke();
  x.beginPath(); x.ellipse(0, 0, 13, 7, 0, 0, TAU); x.fill();
  x.strokeStyle = c.stripe; x.lineWidth = 2; for (const sx of [-6, -1, 4]) { x.beginPath(); x.moveTo(sx, -6); x.lineTo(sx, 6); x.stroke(); }
  x.fillStyle = c.col; circ(x, 13, 0, 6.5); x.fill();
  x.beginPath(); x.moveTo(11, -4); x.lineTo(13, -10); x.lineTo(16, -4); x.fill(); x.beginPath(); x.moveTo(11, 4); x.lineTo(13, 10); x.lineTo(16, 4); x.fill();
  x.restore();
}

// the mower, top-down, pointing along +x
export function drawMower(x, m, t, spec) {
  const deck = spec.deck, hw = deck / 2, monster = spec.monster;
  x.save(); x.translate(m.x, m.y);
  x.save(); x.rotate(m.a);
  // shadow
  x.fillStyle = 'rgba(16,48,8,0.32)'; rr(x, -26 + 6, -hw - 2 + 8, 26 + 30, deck + 4, 10); x.fill();
  x.scale(m.sx, m.sy);
  // rear tyres
  const wR = monster ? [24, 15] : [16, 9], wy = monster ? 22 : 15;
  for (const s of [-1, 1]) {
    x.fillStyle = '#1e1f22'; rr(x, -26, s * wy - wR[1] / 2 - (s > 0 ? 0 : 0), wR[0], wR[1] + (monster ? 4 : 0), 4); x.fill();
    x.fillStyle = '#3a3c40'; const tread = (m.roll * (monster ? 0.6 : 1)) % 5;
    for (let k = -26 + tread; k < -26 + wR[0]; k += 5) x.fillRect(k, s * wy - wR[1] / 2, 2, wR[1] + (monster ? 4 : 0));
  }
  // deck
  x.fillStyle = '#2f3338'; rr(x, 2, -hw, 28, deck, 9); x.fill();
  x.fillStyle = '#4f565e'; rr(x, 4, -hw + 2, 24, deck - 4, 7); x.fill();
  // spinning blades
  if (m.blades) {
    x.strokeStyle = 'rgba(220,230,235,0.35)'; x.lineWidth = 2.5;
    const nb = Math.max(1, Math.round(deck / 30));
    for (let b = 0; b < nb; b++) {
      const by = -hw + (deck / nb) * (b + 0.5), a0 = t * 40 + b;
      x.beginPath(); x.moveTo(16 + Math.cos(a0) * 11, by + Math.sin(a0) * 11); x.lineTo(16 - Math.cos(a0) * 11, by - Math.sin(a0) * 11); x.stroke();
    }
  }
  x.fillStyle = 'rgba(255,255,255,0.2)'; rr(x, 4, -hw + 2, 24, 4, 2); x.fill();
  // side chute (right side = +y)
  x.fillStyle = '#25282c'; rr(x, 8, hw - 3, 14, 9, 3); x.fill();
  // front casters
  x.fillStyle = '#1e1f22'; for (const s of [-1, 1]) { rr(x, 24, s * (hw - 4) - 3, 8, 6, 2); x.fill(); }
  // body
  const body = m.flash > 0 ? '#ffffff' : spec.body;
  x.fillStyle = spec.dark; rr(x, -24, -14, 38, 28, 8); x.fill();
  x.fillStyle = body; rr(x, -24, -14, 37, 26, 8); x.fill();
  // hood with grille
  x.fillStyle = spec.dark; rr(x, 2, -10, 11, 20, 4); x.fill();
  x.fillStyle = body; rr(x, 1, -10, 10, 19, 4); x.fill();
  x.strokeStyle = 'rgba(0,0,0,0.3)'; x.lineWidth = 1.2; for (let k = -6; k <= 6; k += 3) { x.beginPath(); x.moveTo(3, k); x.lineTo(9, k); x.stroke(); }
  x.fillStyle = 'rgba(255,255,255,0.3)'; rr(x, -22, -12, 30, 5, 3); x.fill();
  if (spec.gold) { x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(-14 + Math.sin(t * 2) * 10, -12, 3, 24); }
  // exhaust
  x.fillStyle = '#6b6f75'; rr(x, -30, -12, 8, 4, 2); x.fill();
  // seat
  x.fillStyle = '#2a2a2e'; rr(x, -22, -10, 13, 20, 5); x.fill();
  x.fillStyle = '#3a3a40'; rr(x, -20, -8, 9, 16, 4); x.fill();
  // steering wheel
  x.strokeStyle = '#1f1f22'; x.lineWidth = 2.5; circ(x, -1, 0, 5.5); x.stroke();
  // driver: polo shirt, arms to the wheel
  x.fillStyle = '#3d9ad1'; x.beginPath(); x.ellipse(-13, 0, 6, 9, 0, 0, TAU); x.fill();
  x.strokeStyle = '#f2c29b'; x.lineWidth = 3.5; x.lineCap = 'round';
  const st = m.steerVis * 2;
  x.beginPath(); x.moveTo(-12, -7); x.lineTo(-2, -4 + st); x.moveTo(-12, 7); x.lineTo(-2, 4 + st); x.stroke();
  x.restore();
  // sun hat (doesn't scale with the squash, sits a bit back, wobbles)
  x.rotate(m.a);
  const hx = -13 + m.hatX, hy = m.hatY;
  x.fillStyle = 'rgba(16,48,8,0.25)'; circ(x, hx + 4, hy + 5, 13); x.fill();
  x.fillStyle = '#f3d27a'; circ(x, hx, hy, 13); x.fill();
  x.strokeStyle = 'rgba(160,110,40,0.35)'; x.lineWidth = 1; circ(x, hx, hy, 10.5); x.stroke(); circ(x, hx, hy, 12.5); x.stroke();
  x.fillStyle = '#e6bd5a'; circ(x, hx, hy, 7.5); x.fill();
  x.strokeStyle = '#ff5d8f'; x.lineWidth = 2.5; circ(x, hx, hy, 7.5); x.stroke();
  x.fillStyle = '#ff5d8f'; x.beginPath(); x.ellipse(hx - 9, hy + 4, 4, 2, 0.6, 0, TAU); x.fill();
  x.fillStyle = 'rgba(255,255,255,0.35)'; circ(x, hx - 2, hy - 2.5, 3.2); x.fill();
  x.restore();
}

export function drawPop(x, text, px, py, size, col, alpha = 1, scale = 1) {
  x.save(); x.globalAlpha = alpha; x.translate(px, py); x.scale(scale, scale);
  x.font = `${size}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineJoin = 'round'; x.lineWidth = size * 0.28; x.strokeStyle = '#1d3a16'; x.strokeText(text, 0, 0);
  x.fillStyle = col; x.fillText(text, 0, 0);
  x.restore();
}

// a big centred message, wrapped onto lines (or shrunk) to fit maxW
export function drawBanner(x, text, cx, cy, size, col, alpha, scale, maxW) {
  x.font = `${size}px ${FONT}`;
  let lines = [text];
  if (x.measureText(text).width > maxW) {
    const words = text.split(' ');
    if (words.length < 3) size *= maxW / x.measureText(text).width;
    else {
      lines = []; let cur = '';
      for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
      lines.push(cur);
    }
  }
  lines.forEach((l, i) => drawPop(x, l, cx, cy + (i - (lines.length - 1) / 2) * size * 1.1, size, col, alpha, scale));
}

// ------------------------------------------------------------------ HUD
function pill(x, px, py, w, h, fill = 'rgba(255,248,226,0.95)') {
  x.fillStyle = 'rgba(20,50,15,0.35)'; rr(x, px + 3, py + 4, w, h, h / 2); x.fill();
  x.fillStyle = fill; rr(x, px, py, w, h, h / 2); x.fill();
  x.strokeStyle = '#1d3a16'; x.lineWidth = 3; rr(x, px, py, w, h, h / 2); x.stroke();
}
export function fmtTime(s) { s = Math.max(0, Math.ceil(s)); return `${(s / 60) | 0}:${String(s % 60).padStart(2, '0')}`; }

export function drawHUD(x, G, W, H) {
  const narrow = W < 600, sc = narrow ? W / 470 : Math.min(1, W / 760, H / 520), touch = G.touchUI;
  x.save(); x.scale(sc, sc);
  const w = W / sc, h = H / sc;
  const lv = G.lv;
  // timer
  const low = G.clock < 10 && G.mode === 'play';
  const pulse = low ? 1 + Math.max(0, Math.sin(G.t * 10)) * 0.06 : 1;
  x.save(); x.translate(14, 14);
  pill(x, 0, 0, 132, 52, low ? '#ffe0d8' : undefined);
  x.translate(66, 27); x.scale(pulse, pulse);
  x.font = `34px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = low ? '#d8302a' : '#1d3a16';
  x.fillText(fmtTime(G.clock), 10, 1);
  // little clock icon
  x.strokeStyle = x.fillStyle; x.lineWidth = 3; circ(x, -40, 0, 11); x.stroke();
  x.beginPath(); x.moveTo(-40, 0); x.lineTo(-40, -7); x.moveTo(-40, 0); x.lineTo(-35, 2); x.stroke();
  x.restore();
  if (G.timeFlash > 0) drawPop(x, G.timeFlashText, 80, 84, 26, '#ff5a4a', Math.min(1, G.timeFlash * 2), 1 + (1 - Math.min(1, G.timeFlash * 1.5)) * 0.4);
  // fuel
  x.save(); x.translate(14, 74);
  pill(x, 0, 0, 132, 26);
  const fu = G.fuel / 100;
  x.fillStyle = '#e3dcc6'; rr(x, 30, 7, 92, 12, 6); x.fill();
  x.fillStyle = fu < 0.2 ? (Math.sin(G.t * 12) > 0 ? '#e8453c' : '#ff9a8a') : fu < 0.45 ? '#ff9a3c' : '#ffc93c';
  if (fu > 0) { rr(x, 30, 7, Math.max(8, 92 * fu), 12, 6); x.fill(); }
  x.fillStyle = '#e8453c'; rr(x, 10, 6, 13, 15, 3); x.fill(); x.fillStyle = '#2a2a2a'; x.fillRect(17, 3, 4, 4);
  x.restore();
  // cut meter
  const mw = narrow ? w - 44 : Math.min(380, w - 330), mx = w / 2 - mw / 2, my = narrow ? 112 : 16;
  pill(x, mx - 8, my - 4, mw + 16, 46);
  const pct = G.lawn.pct, tgt = lv.target;
  x.fillStyle = '#d9d2bc'; rr(x, mx, my + 4, mw, 18, 9); x.fill();
  const fillW = Math.min(1, pct) * mw;
  if (fillW > 2) {
    const gr = x.createLinearGradient(0, my, 0, my + 22);
    const done = pct >= tgt;
    gr.addColorStop(0, done ? '#ffe36a' : '#9be064'); gr.addColorStop(1, done ? '#f2b630' : '#4fa637');
    x.fillStyle = gr; rr(x, mx, my + 4, Math.max(18, fillW), 18, 9); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.35)'; rr(x, mx + 4, my + 6, Math.max(10, fillW - 8), 5, 3); x.fill();
  }
  // target flag
  const tx = mx + tgt * mw;
  x.fillStyle = '#1d3a16'; x.fillRect(tx - 1.5, my, 3, 26);
  x.fillStyle = '#e8453c'; x.beginPath(); x.moveTo(tx + 1.5, my); x.lineTo(tx + 14, my + 5); x.lineTo(tx + 1.5, my + 10); x.fill();
  x.font = `14px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'middle'; x.fillStyle = '#1d3a16';
  x.fillText(`CUT ${Math.floor(pct * 100)}%`, mx + 2, my + 33);
  x.textAlign = 'right';
  const sp = G.stripePct, sOk = sp >= lv.stripeT;
  x.fillStyle = sOk ? '#2f8a2a' : '#7a6a4a';
  x.fillText(`STRIPES ${Math.round(sp * 100)}% ${sOk ? '★' : '/ ' + Math.round(lv.stripeT * 100) + '%'}`, mx + mw - 2, my + 33);
  // score + multiplier
  x.save();
  x.textAlign = 'right'; x.textBaseline = 'top';
  const sx = w - 74 / sc;
  x.font = `30px ${FONT}`; x.lineJoin = 'round'; x.lineWidth = 7; x.strokeStyle = '#1d3a16';
  const sTxt = Math.round(G.shownScore).toLocaleString('en-US');
  x.save(); x.translate(sx, 14); const sb = 1 + G.scorePop * 0.25; x.scale(sb, sb);
  x.strokeText(sTxt, 0, 0); x.fillStyle = '#fff8e2'; x.fillText(sTxt, 0, 0); x.restore();
  if (G.mult > 1) {
    const mt = `x${G.mult.toFixed(1)} STRIPE CHAIN`;
    x.font = `16px ${FONT}`; x.lineWidth = 5; x.strokeText(mt, sx, 50); x.fillStyle = '#ffd23f'; x.fillText(mt, sx, 50);
  }
  if (G.flowersHit > 0) { x.font = `14px ${FONT}`; x.lineWidth = 4; const ft = `✿ ${G.flowersHit} flowers mowed`; x.strokeText(ft, sx, G.mult > 1 ? 72 : 50); x.fillStyle = '#ff9ab8'; x.fillText(ft, sx, G.mult > 1 ? 72 : 50); }
  x.restore();
  // clog warning
  if (G.m.clog > 0) drawPop(x, 'CLOGGED!', w / 2, h * 0.3, 34, '#ff9a3c', 1, 1 + Math.sin(G.t * 20) * 0.05);
  if (G.fuel <= 0 && G.mode === 'play') drawPop(x, 'OUT OF FUEL!', w / 2, h * 0.3 + 40, 26, '#ff6a5a', 0.6 + 0.4 * Math.sin(G.t * 8));
  x.restore();
  // minimap
  drawMinimap(x, G, W, H, touch, narrow ? (my + 52) * sc : 96 * sc, sc);
}

function drawMinimap(x, G, W, H, touch, topY, sc) {
  const lv = G.lv, L = G.lawn;
  const mw = touch ? Math.min(120, W * 0.15) : Math.min(150, W * 0.2), mh = mw * (lv.h / lv.w);
  const px = W - mw - 14, py = touch ? topY + 8 : H - mh - 14;
  x.save();
  x.globalAlpha = 0.92;
  x.fillStyle = 'rgba(20,50,15,0.4)'; rr(x, px + 2, py + 3, mw + 8, mh + 8, 8); x.fill();
  x.fillStyle = '#fff8e2'; rr(x, px - 4, py - 4, mw + 8, mh + 8, 8); x.fill();
  x.beginPath(); x.rect(px, py, mw, mh); x.clip();
  x.drawImage(L.cutCv, px, py, mw, mh);
  x.drawImage(L.tallCv, px, py, mw, mh);
  x.drawImage(G.st.ground, M * (mw / lv.w) * -1 + px, M * (mh / lv.h) * -1 + py, (lv.w + M * 2) * (mw / lv.w), (lv.h + M * 2) * (mh / lv.h));
  x.drawImage(G.st.props, M * (mw / lv.w) * -1 + px, M * (mh / lv.h) * -1 + py, (lv.w + M * 2) * (mw / lv.w), (lv.h + M * 2) * (mh / lv.h));
  const k = mw / lv.w;
  x.fillStyle = '#e8453c'; circ(x, px + G.m.x * k, py + G.m.y * k, 4); x.fill();
  x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke();
  if (G.hint && G.hintOn) { x.fillStyle = '#ffd23f'; circ(x, px + G.hint[0] * k, py + G.hint[1] * k, 3 + Math.sin(G.t * 8)); x.fill(); }
  for (const d of G.dogs) { x.fillStyle = '#8a5a2e'; circ(x, px + d.x * k, py + d.y * k, 3); x.fill(); }
  x.restore();
}
