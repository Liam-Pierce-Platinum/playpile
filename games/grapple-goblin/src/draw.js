// GRAPPLE GOBLIN - all the painting. Crisp cartoon shapes with dark ink outlines,
// parallax cave layers, glows. Everything is in world units unless it says screen.
import { THEMES, FLOOR, MUSH_TOP } from './levels.js';

export const INK = '#1b1226';
export const HAZARD = '#ff3d4e';
const TAU = Math.PI * 2;
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ------------------------------------------------------------ glow sprites
const glowCache = new Map();
export function glow(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, color); g.addColorStop(0.35, color + '88'); g.addColorStop(1, color + '00');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}
export function drawGlow(c, x, y, r, color, a = 1) {
  c.globalAlpha = a; c.globalCompositeOperation = 'lighter';
  c.drawImage(glow(color), x - r, y - r, r * 2, r * 2);
  c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
}

// ------------------------------------------------------------ parallax layers
export const TILE_W = 1600, TILE_Y0 = -320, TILE_H = 1360;
export function makeLayers(ti, k) {
  const P = THEMES[ti];
  const mk = () => { const c = document.createElement('canvas'); c.width = Math.ceil(TILE_W * k); c.height = Math.ceil(TILE_H * k); const x = c.getContext('2d'); x.scale(k, k); x.translate(0, -TILE_Y0); return [c, x]; };
  const [far, f] = mk(), [mid, m] = mk();
  const R = (i) => hash(i * 7.31 + ti * 101);
  const wrap = (fn) => { for (const o of [-TILE_W, 0, TILE_W]) { f.save(); f.translate(o, 0); fn(); f.restore(); } };
  const wrapM = (fn) => { for (const o of [-TILE_W, 0, TILE_W]) { m.save(); m.translate(o, 0); fn(); m.restore(); } };
  // far: light shafts, big hanging and rising rock silhouettes
  if (ti === 0 || ti === 3) wrap(() => {
    for (let i = 0; i < 4; i++) {
      const x = R(i + 40) * TILE_W, g = f.createLinearGradient(x, -100, x + 260, 700);
      g.addColorStop(0, ti === 0 ? 'rgba(200,255,170,0.10)' : 'rgba(200,240,255,0.10)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      f.fillStyle = g; f.beginPath(); f.moveTo(x, -100); f.lineTo(x + 90, -100); f.lineTo(x + 360, 720); f.lineTo(x + 180, 720); f.fill();
    }
  });
  const spikeShape = (x, x2, base, tip, ctx, up) => {
    ctx.beginPath(); ctx.moveTo(x, base);
    const mx = (x + x2) / 2;
    ctx.quadraticCurveTo(x + (mx - x) * 0.6, base + (tip - base) * 0.6, mx, tip);
    ctx.quadraticCurveTo(x2 - (x2 - mx) * 0.6, base + (tip - base) * 0.6, x2, base);
    ctx.closePath(); ctx.fill();
  };
  wrap(() => {
    f.fillStyle = P.bg1;
    f.fillRect(-10, TILE_Y0, TILE_W + 20, 330 + 20);
    f.fillRect(-10, 880, TILE_W + 20, 520);
    for (let i = 0; i < 16; i++) { const x = R(i) * TILE_W, w = 60 + R(i + 1) * 140; spikeShape(x - w / 2, x + w / 2, 0, 140 + R(i + 2) * 230, f); }
    for (let i = 0; i < 12; i++) { const x = R(i + 20) * TILE_W, w = 90 + R(i + 21) * 170; spikeShape(x - w / 2, x + w / 2, 900, 900 - 160 - R(i + 22) * 260, f); }
    // a few columns
    for (let i = 0; i < 2; i++) { const x = R(i + 60) * TILE_W; f.beginPath(); f.moveTo(x - 50, 0); f.quadraticCurveTo(x - 10, 420, x - 46, 900); f.lineTo(x + 46, 900); f.quadraticCurveTo(x + 10, 420, x + 50, 0); f.fill(); }
  });
  // mid: closer formations with a rim light, plus the theme's glowing things
  wrapM(() => {
    m.fillStyle = P.bg2; m.strokeStyle = P.rim + '30'; m.lineWidth = 3;
    m.fillRect(-10, TILE_Y0, TILE_W + 20, 290 + 10);
    m.fillRect(-10, 930, TILE_W + 20, 520);
    for (let i = 0; i < 11; i++) { const x = R(i + 80) * TILE_W, w = 70 + R(i + 81) * 120; spikeShape(x - w / 2, x + w / 2, -30, 80 + R(i + 82) * 150, m); }
    for (let i = 0; i < 9; i++) { const x = R(i + 100) * TILE_W, w = 110 + R(i + 101) * 200; spikeShape(x - w / 2, x + w / 2, 940, 940 - 110 - R(i + 102) * 220, m); m.stroke(); }
  });
  wrapM(() => {
    if (ti === 0) { // glowing mushroom clusters and vines
      for (let i = 0; i < 7; i++) {
        const x = R(i + 120) * TILE_W, y = 760 + R(i + 121) * 120;
        for (let j = 0; j < 3; j++) {
          const mx = x + j * 22 - 22, h = 20 + R(i * 3 + j) * 30;
          m.fillStyle = '#2d5a3a'; m.fillRect(mx - 2, y - h, 4, h);
          m.fillStyle = '#9dff8a'; m.beginPath(); m.ellipse(mx, y - h, 12, 6, 0, Math.PI, 0); m.fill();
          drawGlowOn(m, mx, y - h, 40, '#7dff9a', 0.35);
        }
      }
      m.strokeStyle = '#2f6a3a'; m.lineWidth = 4;
      for (let i = 0; i < 12; i++) { const x = R(i + 140) * TILE_W, l = 120 + R(i + 141) * 260; m.beginPath(); m.moveTo(x, 0); m.bezierCurveTo(x + 20, l * 0.4, x - 20, l * 0.7, x + 6, l); m.stroke(); }
    } else if (ti === 1) { // crystal clusters
      for (let i = 0; i < 9; i++) {
        const x = R(i + 160) * TILE_W, y = i % 2 ? 860 + R(i) * 60 : 120 + R(i) * 80, up = i % 2 ? -1 : 1;
        const col = i % 3 ? '#7ff0ff' : '#e28bff';
        drawGlowOn(m, x, y + up * -30, 150, col, 0.32);
        for (let j = 0; j < 4; j++) {
          const cx = x + (j - 1.5) * 26, h = (50 + R(i * 5 + j) * 90) * -up, w = 14 + R(j + i) * 10, lean = (j - 1.5) * 0.15;
          m.fillStyle = col + 'cc'; m.strokeStyle = '#1a0f3a'; m.lineWidth = 3; m.beginPath(); m.moveTo(cx - w, y); m.lineTo(cx - w * 0.7 + lean * h, y + h * 0.8); m.lineTo(cx + lean * h * 1.2, y + h); m.lineTo(cx + w * 0.7 + lean * h, y + h * 0.8); m.lineTo(cx + w, y); m.fill(); m.stroke();
          m.fillStyle = '#ffffff55'; m.beginPath(); m.moveTo(cx - w * 0.2, y); m.lineTo(cx + lean * h * 1.2, y + h); m.lineTo(cx + w * 0.3, y); m.fill();
        }
      }
    } else if (ti === 2) { // lava falls and mine scaffolds
      for (let i = 0; i < 3; i++) {
        const x = R(i + 180) * TILE_W;
        drawGlowOn(m, x, 500, 260, '#ff6a1a', 0.3);
        m.globalAlpha = 0.55;
        const g = m.createLinearGradient(x, 0, x, 900); g.addColorStop(0, '#ffd25a'); g.addColorStop(1, '#ff4a12');
        m.fillStyle = g; m.beginPath(); m.moveTo(x - 14, 0); m.quadraticCurveTo(x - 24, 450, x - 18, 900); m.lineTo(x + 18, 900); m.quadraticCurveTo(x + 24, 450, x + 14, 0); m.fill();
        m.globalAlpha = 1;
      }
      m.strokeStyle = '#2a120b'; m.lineWidth = 10;
      for (let i = 0; i < 4; i++) {
        const x = R(i + 200) * TILE_W;
        m.beginPath(); m.moveTo(x, 940); m.lineTo(x, 420); m.moveTo(x + 160, 940); m.lineTo(x + 160, 420); m.moveTo(x - 20, 440); m.lineTo(x + 180, 440); m.moveTo(x, 700); m.lineTo(x + 160, 460); m.stroke();
      }
    } else { // ice formations
      for (let i = 0; i < 14; i++) {
        const x = R(i + 220) * TILE_W, l = 60 + R(i + 221) * 160;
        m.fillStyle = '#bfe8ff55'; m.beginPath(); m.moveTo(x - 16, 60); m.lineTo(x, 60 + l); m.lineTo(x + 16, 60); m.fill();
      }
      for (let i = 0; i < 5; i++) drawGlowOn(m, R(i + 240) * TILE_W, 300 + R(i + 241) * 400, 200, '#8fe8ff', 0.18);
    }
  });
  return { far, mid, k };
}
function drawGlowOn(c, x, y, r, col, a) { c.globalAlpha = a; c.globalCompositeOperation = 'lighter'; c.drawImage(glow(col), x - r, y - r, r * 2, r * 2); c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1; }

// ------------------------------------------------------------ terrain
export function drawSolid(c, s, t, vb) {
  const P = THEMES[s.theme || 0];
  if (s.kind === 'mush') return drawMush(c, s, P, t, vb);
  if (s.kind === 'wall') {
    c.fillStyle = P.rock2; c.fillRect(s.x, -900, s.w, 2600);
    c.strokeStyle = INK; c.lineWidth = 5; c.beginPath();
    const ex = s.x < 0 ? s.x + s.w : s.x;
    c.moveTo(ex, -900); for (let y = -900; y < 1700; y += 40) c.lineTo(ex + (hash(y + ex) - 0.5) * 14, y); c.stroke();
    return;
  }
  const x0 = s.x, x1 = s.x + s.w, y = s.y, bot = Math.min(s.y + s.h, vb + 20);
  const L = Math.max(x0, -1e9), Rr = x1;
  const outline = () => {
    c.beginPath();
    c.moveTo(x0 - 2, bot);
    c.lineTo(x0 - 2, y + 18);
    c.quadraticCurveTo(x0 - 2, y, x0 + 14, y - 1);
    for (let x = Math.ceil((x0 + 30) / 28) * 28; x < x1 - 20; x += 28) c.lineTo(x, y + (hash(x) - 0.5) * 5);
    c.lineTo(x1 - 14, y - 1);
    c.quadraticCurveTo(x1 + 2, y, x1 + 2, y + 18);
    c.lineTo(x1 + 2, bot);
    c.closePath();
  };
  outline();
  const g = c.createLinearGradient(0, y, 0, y + 520);
  g.addColorStop(0, P.rock); g.addColorStop(0.42, P.rock2); g.addColorStop(1, P.bg0);
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  // stones in the rock
  c.fillStyle = 'rgba(0,0,0,0.13)';
  for (let x = Math.floor(x0 / 70) * 70; x < x1; x += 70) {
    const h1 = hash(x * 0.37 + 3), yy = y + 40 + h1 * 120;
    if (yy > bot) continue;
    c.beginPath(); c.ellipse(x + h1 * 40, yy, 16 + h1 * 14, 9 + h1 * 6, 0, 0, TAU); c.fill();
  }
  c.fillStyle = 'rgba(255,255,255,0.08)';
  for (let x = Math.floor(x0 / 90) * 90 + 30; x < x1; x += 90) { const h1 = hash(x + 9); c.beginPath(); c.ellipse(x, y + 70 + h1 * 90, 10, 5, 0, 0, TAU); c.fill(); }
  if (P.key === 'lava') { // glowing cracks
    c.strokeStyle = '#ff8a2a'; c.lineWidth = 2.5; c.globalAlpha = 0.55 + 0.25 * Math.sin(t * 2 + x0);
    for (let x = Math.floor(x0 / 160) * 160 + 50; x < x1 - 30; x += 160) { const h1 = hash(x); c.beginPath(); c.moveTo(x, y + 30); c.lineTo(x + 14, y + 60 + h1 * 30); c.lineTo(x - 6, y + 100 + h1 * 40); c.lineTo(x + 10, y + 150); c.stroke(); }
    c.globalAlpha = 1;
  }
  c.restore();
  outline();
  c.strokeStyle = INK; c.lineWidth = 4; c.lineJoin = 'round'; c.stroke();
  // the cap on top
  if (s.kind === 'track') { drawTrack(c, x0, x1, y, P); return; }
  topCap(c, x0, x1, y, P, t);
}
function topCap(c, x0, x1, y, P, t) {
  c.lineWidth = 3; c.strokeStyle = INK; c.lineJoin = 'round';
  if (P.key === 'moss' || P.key === 'ice') {
    const snow = P.key === 'ice';
    c.beginPath();
    c.moveTo(x0 - 6, y + 4);
    c.quadraticCurveTo(x0 - 6, y - 8, x0 + 10, y - 8);
    for (let x = Math.ceil((x0 + 20) / 24) * 24; x < x1 - 14; x += 24) c.lineTo(x, y - 8 - hash(x + 1) * (snow ? 6 : 4));
    c.lineTo(x1 - 10, y - 8);
    c.quadraticCurveTo(x1 + 6, y - 8, x1 + 6, y + 4);
    // drips along the underside
    for (let x = x1; x > x0; x -= 34) {
      const d = 6 + hash(x * 1.7) * (snow ? 16 : 12);
      c.quadraticCurveTo(x - 9, y + 6 + d, x - 17, y + 6);
      c.lineTo(x - 34 > x0 ? x - 34 : x0 - 6, y + 5);
    }
    c.closePath();
    c.fillStyle = P.top; c.fill(); c.stroke();
    c.strokeStyle = snow ? '#ffffff' : '#c9ff8a'; c.lineWidth = 2.5; c.globalAlpha = 0.8;
    c.beginPath(); c.moveTo(x0 + 10, y - 4); c.lineTo(x1 - 10, y - 4); c.stroke(); c.globalAlpha = 1;
    if (!snow) { // grass tufts
      c.strokeStyle = P.top2; c.lineWidth = 2.5;
      for (let x = Math.ceil(x0 / 47) * 47 + 12; x < x1 - 12; x += 47) {
        const h1 = hash(x * 2.3), sw = Math.sin(t * 2 + x * 0.05) * 2;
        c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x - 4 + sw, y - 16 - h1 * 8); c.moveTo(x + 3, y - 6); c.lineTo(x + 6 + sw, y - 14 - h1 * 6); c.stroke();
      }
      c.fillStyle = '#ffe266';
      for (let x = Math.ceil(x0 / 131) * 131 + 40; x < x1 - 20; x += 131) { c.beginPath(); c.arc(x, y - 12, 3.2, 0, TAU); c.fill(); }
    } else {
      // icicles off the ends
      c.fillStyle = '#d8f3ff';
      for (const ex of [x0 + 4, x1 - 4]) for (let i = 0; i < 2; i++) { const xx = ex + (ex < x1 - 10 ? i * 12 : -i * 12); c.beginPath(); c.moveTo(xx - 5, y + 8); c.lineTo(xx, y + 30 + i * 10); c.lineTo(xx + 5, y + 8); c.closePath(); c.fill(); c.stroke(); }
    }
  } else if (P.key === 'crystal') {
    c.strokeStyle = P.rim; c.lineWidth = 3; c.beginPath(); c.moveTo(x0 + 6, y + 3); c.lineTo(x1 - 6, y + 3); c.stroke();
    for (let x = Math.ceil(x0 / 113) * 113 + 30; x < x1 - 30; x += 113) {
      const h1 = hash(x), h = 16 + h1 * 22, col = h1 > 0.5 ? '#8af6ff' : '#e49bff';
      drawGlow(c, x, y - h * 0.5, 34, col, 0.45);
      c.strokeStyle = INK; c.lineWidth = 2.5; c.fillStyle = col;
      c.beginPath(); c.moveTo(x - 7, y + 2); c.lineTo(x - 6, y - h * 0.7); c.lineTo(x, y - h); c.lineTo(x + 6, y - h * 0.7); c.lineTo(x + 7, y + 2); c.closePath(); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(x + 6, y + 2); c.lineTo(x + 12, y - h * 0.45); c.lineTo(x + 16, y + 2); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ffffffaa'; c.fillRect(x - 3, y - h * 0.7, 2.5, h * 0.6);
    }
  } else { // lava: dark basalt lip with a warm rim
    c.beginPath(); c.moveTo(x0 - 3, y + 8); c.lineTo(x0 - 3, y - 3);
    for (let x = Math.ceil(x0 / 30) * 30; x < x1; x += 30) c.lineTo(x, y - 3 - hash(x) * 4);
    c.lineTo(x1 + 3, y - 3); c.lineTo(x1 + 3, y + 8); c.closePath();
    c.fillStyle = P.top; c.fill(); c.stroke();
    c.strokeStyle = '#ffb35a'; c.globalAlpha = 0.7; c.lineWidth = 2; c.beginPath(); c.moveTo(x0 + 4, y - 1); c.lineTo(x1 - 4, y - 1); c.stroke(); c.globalAlpha = 1;
  }
}
function drawTrack(c, x0, x1, y, P) {
  c.fillStyle = '#5a3a24'; c.strokeStyle = INK; c.lineWidth = 2.5;
  for (let x = x0 + 14; x < x1 - 10; x += 34) { c.fillRect(x, y - 8, 14, 8); c.strokeRect(x, y - 8, 14, 8); }
  c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(x0, y - 10); c.lineTo(x1, y - 10); c.stroke();
  c.strokeStyle = '#c9c4be'; c.lineWidth = 3; c.beginPath(); c.moveTo(x0, y - 10); c.lineTo(x1, y - 10); c.stroke();
  // the bumper at the end
  const bx = x1 - 24;
  c.fillStyle = '#d23a2a'; c.fillRect(bx, y - 44, 22, 36); c.lineWidth = 3; c.strokeStyle = INK; c.strokeRect(bx, y - 44, 22, 36);
  c.fillStyle = '#fff2e0'; c.fillRect(bx, y - 34, 22, 7); c.fillRect(bx, y - 20, 22, 7);
  c.strokeRect(bx, y - 44, 22, 36);
}
function drawMush(c, s, P, t, vb) {
  const cx = s.x + s.w / 2, top = s.y, sq = s.sq || 0;
  const bounce = Math.sin(sq * Math.PI * 3) * sq;
  // stalk
  c.fillStyle = '#efe2c8'; c.strokeStyle = INK; c.lineWidth = 3.5;
  c.beginPath(); c.moveTo(cx - 16, Math.min(vb, top + 400)); c.quadraticCurveTo(cx - 22, top + 60, cx - 13, top + 8); c.lineTo(cx + 13, top + 8); c.quadraticCurveTo(cx + 22, top + 60, cx + 16, Math.min(vb, top + 400)); c.closePath(); c.fill(); c.stroke();
  c.save(); c.translate(cx, top + 10); c.scale(1 + bounce * 0.25, 1 - bounce * 0.35);
  drawGlow(c, 0, -10, 90, P.mush, 0.25);
  c.fillStyle = P.mush;
  c.beginPath(); c.moveTo(-64, 2); c.bezierCurveTo(-66, -46, 66, -46, 64, 2); c.quadraticCurveTo(0, 14, -64, 2); c.closePath(); c.fill(); c.lineWidth = 4; c.stroke();
  c.fillStyle = P.mushSpot;
  for (const [x, y, r] of [[-34, -14, 8], [0, -26, 10], [34, -14, 8], [-14, -6, 5], [18, -6, 5]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(-26, -26, 16, 6, -0.4, 0, TAU); c.fill();
  c.restore();
}
export function drawCeiling(c, w, vx0, vx1, t) {
  const pts = w.L.ceil;
  let i0 = 0;
  while (i0 < pts.length - 1 && pts[i0 + 1].x < vx0 - 150) i0++;
  let i1 = i0;
  while (i1 < pts.length - 1 && pts[i1].x < vx1 + 150) i1++;
  if (i1 <= i0) return;
  const P = THEMES[pts[i0].theme];
  c.beginPath();
  c.moveTo(pts[i0].x, -1200);
  c.lineTo(pts[i0].x, pts[i0].y);
  for (let i = i0; i < i1; i++) {
    const a = pts[i], b = pts[i + 1];
    c.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  c.lineTo(pts[i1].x, pts[i1].y);
  c.lineTo(pts[i1].x, -1200);
  c.closePath();
  const g = c.createLinearGradient(0, -420, 0, 110);
  g.addColorStop(0, P.bg0); g.addColorStop(0.55, P.rock2); g.addColorStop(1, P.rock);
  c.fillStyle = g; c.fill();
  c.save(); c.clip();
  c.fillStyle = 'rgba(0,0,0,0.16)';
  for (let x = Math.floor(vx0 / 80) * 80; x < vx1; x += 80) { const cy = w.ceilY(x); for (let r = 0; r < 4; r++) { const h1 = hash(x * 0.71 + r * 13); c.beginPath(); c.ellipse(x + h1 * 30 + r * 20, cy - 30 - h1 * 50 - r * 90, 20 + h1 * 12, 10, 0, 0, TAU); c.fill(); } }
  c.restore();
  c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
  if (P.key === 'moss' || P.key === 'ice') {
    c.fillStyle = P.key === 'moss' ? P.top2 : '#e6f6ff'; c.strokeStyle = INK; c.lineWidth = 2.5;
    for (let x = Math.floor(vx0 / 46) * 46; x < vx1; x += 46) { const cy = w.ceilY(x + 23), d1 = 6 + hash(x) * 10; c.beginPath(); c.moveTo(x, w.ceilY(x) - 3); c.quadraticCurveTo(x + 23, cy + d1 * 2, x + 46, w.ceilY(x + 46) - 3); c.closePath(); c.fill(); c.stroke(); }
  }
  // hanging decor
  for (let i = i0; i < i1; i++) {
    const a = pts[i], th = THEMES[a.theme], x = a.x + 30, y = w.ceilY(x) - 2, s = a.s;
    if (s < 0.45) { // stalactite
      const l = 22 + s * 90, wd = 14 + s * 20;
      c.fillStyle = th.key === 'ice' ? '#cfeeff' : th.rock; c.lineWidth = 3;
      c.beginPath(); c.moveTo(x - wd, y); c.quadraticCurveTo(x - wd * 0.3, y + l * 0.5, x, y + l); c.quadraticCurveTo(x + wd * 0.3, y + l * 0.5, x + wd, y); c.closePath(); c.fill(); c.stroke();
      if (th.key === 'ice') { c.fillStyle = '#ffffffaa'; c.fillRect(x - 4, y + 3, 3, l * 0.5); }
    } else if (th.key === 'moss' && s < 0.8) {
      const l = 40 + (s - 0.45) * 300, sw = Math.sin(t * 1.3 + x) * 6;
      c.strokeStyle = '#3f8f2c'; c.lineWidth = 3.5;
      c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x + sw, y + l * 0.6, x + sw * 1.5, y + l); c.stroke();
      c.fillStyle = '#8cdb4c';
      for (let k = 1; k < 4; k++) { const yy = y + (l * k) / 4, xx = x + sw * (k / 4) * 1.2; c.beginPath(); c.ellipse(xx + (k % 2 ? 5 : -5), yy, 6, 3, k % 2 ? 0.5 : -0.5, 0, TAU); c.fill(); }
    } else if (th.key === 'crystal' && s < 0.8) {
      const l = 24 + (s - 0.45) * 90, col = s > 0.62 ? '#8af6ff' : '#e49bff';
      drawGlow(c, x, y + l * 0.5, 40, col, 0.5);
      c.fillStyle = col; c.lineWidth = 2.5;
      c.beginPath(); c.moveTo(x - 8, y); c.lineTo(x - 6, y + l * 0.7); c.lineTo(x, y + l); c.lineTo(x + 6, y + l * 0.7); c.lineTo(x + 8, y); c.closePath(); c.fill(); c.stroke();
    } else if (th.key === 'lava' && s < 0.7) {
      drawGlow(c, x, y + 10, 30, '#ff7a2a', 0.4);
    }
  }
}
export function drawPit(c, p, t, vb) {
  const P = THEMES[p.theme], x0 = p.x0 - 4, x1 = p.x1 + 4, w = x1 - x0;
  c.fillStyle = P.pitCol; c.fillRect(x0, 640, w, vb - 640 + 20);
  if (P.pit === 'lava') {
    const g = c.createLinearGradient(0, 470, 0, 670);
    g.addColorStop(0, 'rgba(255,110,30,0)'); g.addColorStop(1, 'rgba(255,110,30,0.38)');
    c.fillStyle = g; c.fillRect(x0, 470, w, 200);
    c.beginPath(); c.moveTo(x0, vb + 20);
    for (let x = x0; x <= x1 + 10; x += 20) c.lineTo(x, 662 + Math.sin(x * 0.03 + t * 2.2) * 4 + Math.sin(x * 0.011 - t) * 3);
    c.lineTo(x1, vb + 20); c.closePath();
    const lg = c.createLinearGradient(0, 655, 0, 760); lg.addColorStop(0, '#ffe066'); lg.addColorStop(0.25, '#ff8a1e'); lg.addColorStop(1, '#a8200a');
    c.fillStyle = lg; c.fill(); c.strokeStyle = INK; c.lineWidth = 3.5; c.stroke();
    c.fillStyle = '#fff2a0';
    for (let i = 0; i < w / 90; i++) {
      const ph = (t * 0.7 + hash(i + p.x0)) % 1, bx = x0 + hash(i * 3 + p.x0) * w;
      c.globalAlpha = 1 - ph; c.beginPath(); c.arc(bx, 668 - ph * 10, 3 + ph * 6, 0, TAU); c.fill();
    }
    c.globalAlpha = 1;
  } else if (P.pit === 'water') {
    c.beginPath(); c.moveTo(x0, vb + 20);
    for (let x = x0; x <= x1 + 10; x += 20) c.lineTo(x, 668 + Math.sin(x * 0.04 + t * 1.5) * 3);
    c.lineTo(x1, vb + 20); c.closePath();
    const lg = c.createLinearGradient(0, 665, 0, 760); lg.addColorStop(0, '#2b6c9a'); lg.addColorStop(1, '#06182e');
    c.fillStyle = lg; c.fill(); c.strokeStyle = INK; c.lineWidth = 3.5; c.stroke();
    spikesRow(c, x0 + 10, x1 - 10, 690, 640, '#cdeeff', '#ffffff', p.x0);
    c.strokeStyle = 'rgba(200,240,255,0.5)'; c.lineWidth = 2;
    for (let x = x0 + 20; x < x1 - 30; x += 70) { c.beginPath(); c.moveTo(x + Math.sin(t + x) * 6, 676); c.lineTo(x + 26 + Math.sin(t + x) * 6, 676); c.stroke(); }
  } else if (P.pit === 'shards') {
    drawGlow(c, (x0 + x1) / 2, 690, Math.min(260, w * 0.6), '#ff5cd6', 0.3);
    spikesRow(c, x0 + 8, x1 - 8, 700, 646, '#ff79e0', '#ffd0f6', p.x0);
  } else {
    spikesRow(c, x0 + 8, x1 - 8, 700, 648, '#b8b2a4', '#efe9da', p.x0);
  }
}
function spikesRow(c, x0, x1, base, tip, col, hi, seed) {
  c.lineJoin = 'round';
  const n = Math.max(2, Math.round((x1 - x0) / 30));
  const step = (x1 - x0) / n;
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 3;
  c.beginPath();
  for (let i = 0; i < n; i++) {
    const x = x0 + i * step, h = tip + hash(i + seed) * 22;
    c.moveTo(x, base); c.lineTo(x + step / 2, h); c.lineTo(x + step, base);
  }
  c.fill();
  c.fillStyle = HAZARD; c.beginPath();
  for (let i = 0; i < n; i++) { const x = x0 + i * step, h = tip + hash(i + seed) * 22, m = x + step / 2, ty = h + (base - h) * 0.4; c.moveTo(m - step * 0.2, ty); c.lineTo(m, h); c.lineTo(m + step * 0.2, ty); }
  c.fill();
  c.beginPath();
  for (let i = 0; i < n; i++) { const x = x0 + i * step, h = tip + hash(i + seed) * 22; c.moveTo(x, base); c.lineTo(x + step / 2, h); c.lineTo(x + step, base); }
  c.stroke();
  c.strokeStyle = hi; c.lineWidth = 2;
  c.beginPath();
  for (let i = 0; i < n; i++) { const x = x0 + i * step, h = tip + hash(i + seed) * 22; c.moveTo(x + step / 2 - 1, h + 6); c.lineTo(x + step * 0.3, base - 10); }
  c.stroke();
}
export function drawSpikes(c, s) {
  const P = THEMES[s.theme], up = s.dir === 'up';
  const n = Math.max(1, Math.round(s.w / 24)), step = s.w / n;
  const base = up ? s.y + s.h : s.y, tip = up ? s.y : s.y + s.h;
  c.fillStyle = P.key === 'crystal' ? '#ff79e0' : P.key === 'ice' ? '#7d97b4' : '#c7c2b5';
  c.strokeStyle = INK; c.lineWidth = 3; c.lineJoin = 'round';
  c.beginPath();
  for (let i = 0; i < n; i++) { const x = s.x + i * step; c.moveTo(x, base); c.lineTo(x + step / 2, tip); c.lineTo(x + step, base); }
  c.fill();
  // hazard-red tips: real spikes never look like the decorative stalactites or an anchor mount
  c.fillStyle = HAZARD; c.beginPath();
  for (let i = 0; i < n; i++) { const x = s.x + i * step, m = x + step / 2, ty = tip + (base - tip) * 0.45; c.moveTo(m - step * 0.225, ty); c.lineTo(m, tip); c.lineTo(m + step * 0.225, ty); }
  c.fill();
  c.beginPath();
  for (let i = 0; i < n; i++) { const x = s.x + i * step; c.moveTo(x, base); c.lineTo(x + step / 2, tip); c.lineTo(x + step, base); }
  c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2; c.beginPath();
  for (let i = 0; i < n; i++) { const x = s.x + i * step; c.moveTo(x + step / 2 - 1, tip + (up ? 5 : -5)); c.lineTo(x + step * 0.3, base + (up ? -5 : 5)); }
  c.stroke();
  c.fillStyle = P.rock2; c.fillRect(s.x - 2, up ? base - 3 : base - 2, s.w + 4, 5);
}

// ------------------------------------------------------------ anchors, pickups, props
export function drawAnchor(c, a, w, t, target) {
  if (a.state === 'gone') return;
  const P = THEMES[a.theme];
  let x = a.x, y = a.y;
  if (a.state === 'crack') { const k = Math.min(1, a.crack / 1.35 + (a.breakT > 0 ? 0.6 : 0)); x += Math.sin(t * 70) * 2.5 * k; y += Math.cos(t * 83) * 1.5 * k; }
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (a.move) {
    const m = a.move, ax0 = a.bx - m.dx, ay0 = a.by - m.dy, ax1 = a.bx + m.dx, ay1 = a.by + m.dy;
    c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.moveTo(ax0, ay0); c.lineTo(ax1, ay1); c.stroke();
    c.strokeStyle = '#a7b0c0'; c.lineWidth = 4; c.stroke();
    for (const [ex, ey] of [[ax0, ay0], [ax1, ay1]]) {
      const cy = w.ceilY(ex);
      chain(c, ex, cy, ex, ey - 4);
      c.fillStyle = '#d6dbe4'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(ex, ey, 6, 0, TAU); c.fill(); c.stroke();
    }
    c.fillStyle = '#5b6578'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.roundRect(x - 13, y - 9, 26, 12, 4); c.fill(); c.stroke();
    ring(c, x, y + 12, a, P);
  } else if (a.type === 'crystal') {
    const bob = Math.sin(t * 2 + a.id) * 4;
    drawGlow(c, x, y + bob, 60, a.crumble ? '#ff8a3a' : '#9af4ff', 0.6);
    c.save(); c.translate(x, y + bob); c.rotate(Math.sin(t + a.id) * 0.1);
    c.fillStyle = a.crumble ? '#ffa04a' : '#8af6ff'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -24); c.lineTo(13, -6); c.lineTo(8, 16); c.lineTo(-8, 16); c.lineTo(-13, -6); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ffffffb0'; c.beginPath(); c.moveTo(0, -24); c.lineTo(-5, -6); c.lineTo(-3, 12); c.lineTo(-8, 16); c.lineTo(-13, -6); c.closePath(); c.fill();
    c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-13, -6); c.lineTo(13, -6); c.stroke();
    if (a.crumble) { crackLines(c, 0, 0, 12); crackLines(c, 5, -10, 9); }
    c.restore();
    if (a.crumble) countdown(c, x, y + bob, a, 28);
  } else if (a.type === 'beam') {
    const cy = w.ceilY(x);
    c.fillStyle = '#7a4a28'; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.rect(x - 7, cy - 20, 14, y - cy + 6); c.fill(); c.stroke();
    c.beginPath(); c.roundRect(x - 44, y - 24, 88, 16, 3); c.fill(); c.stroke();
    c.strokeStyle = '#4a2a14'; c.lineWidth = 2; c.beginPath(); c.moveTo(x - 38, y - 16); c.lineTo(x + 38, y - 16); c.stroke();
    c.fillStyle = '#c9c4be'; c.beginPath(); c.arc(x - 34, y - 16, 2.5, 0, TAU); c.arc(x + 34, y - 16, 2.5, 0, TAU); c.fill();
    if (a.crumble) crackLines(c, x, y - 16, 20);
    ring(c, x, y, a, P);
  } else if (a.type === 'icicle' || (a.type === 'ring' && a.id % 3 === 1)) {
    // a chain down to a rounded bolt plate (round, never pointed: pointed things are spikes)
    const cy = w.ceilY(x) - 2, ice = a.type === 'icicle';
    chain(c, x - 9, cy, x - 9, y - 22); chain(c, x + 9, cy, x + 9, y - 22);
    c.fillStyle = a.crumble ? '#b06a4a' : ice ? '#bfe4fa' : P.rock; c.strokeStyle = INK; c.lineWidth = 3;
    c.beginPath(); c.roundRect(x - 19, y - 30, 38, 17, 8.5); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.roundRect(x - 14, y - 27, 22, 4, 2); c.fill();
    c.fillStyle = '#d6dbe4'; c.beginPath(); c.arc(x - 10, y - 21, 2.6, 0, TAU); c.arc(x + 10, y - 21, 2.6, 0, TAU); c.fill();
    if (a.crumble) crackLines(c, x + 2, y - 22, 12);
    ring(c, x, y + 2, a, P);
  } else {
    const cy = w.ceilY(x);
    chain(c, x, cy, x, y - 10);
    ring(c, x, y, a, P);
  }
  if (target) {
    c.save(); c.translate(a.x, a.y); c.rotate(t * 2.5);
    c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 2.5; c.setLineDash([7, 7]);
    c.beginPath(); c.arc(0, 0, 26 + Math.sin(t * 8) * 2, 0, TAU); c.stroke(); c.setLineDash([]);
    c.restore();
  }
}
function chain(c, x0, y0, x1, y1) {
  c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = '#9aa2ae'; c.lineWidth = 2.5; c.setLineDash([6, 4]); c.stroke(); c.setLineDash([]);
}
function ring(c, x, y, a, P) {
  const gold = a.crumble ? '#ff6a2a' : '#ffcc3a';
  c.strokeStyle = INK; c.lineWidth = 8; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.stroke();
  c.strokeStyle = gold; c.lineWidth = 4.5; c.stroke();
  c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 11, -2.6, -1.6); c.stroke();
  if (a.crumble) {
    // two jagged dark cracks right through the ring
    c.strokeStyle = INK; c.lineWidth = 2.6; c.beginPath();
    c.moveTo(x + 4, y - 15); c.lineTo(x + 1, y - 9); c.lineTo(x + 6, y - 6); c.lineTo(x + 2, y - 1);
    c.moveTo(x - 15, y + 3); c.lineTo(x - 9, y + 1); c.lineTo(x - 7, y + 6); c.lineTo(x - 2, y + 5);
    c.stroke();
    countdown(c, x, y, a, 19);
  }
}
// the time a cracked anchor has left, as a shrinking arc (red when nearly gone)
function countdown(c, x, y, a, r) {
  if (a.state !== 'crack') return;
  const left = clamp(1 - a.crack / 1.35, 0, 1);
  c.lineCap = 'round';
  c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + TAU * left); c.stroke();
  c.strokeStyle = left < 0.35 ? HAZARD : '#ffffff'; c.lineWidth = 3.5; c.stroke();
}
function crackLines(c, x, y, s) {
  c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); c.moveTo(x - s * 0.6, y - s * 0.5); c.lineTo(x - s * 0.1, y); c.lineTo(x - s * 0.4, y + s * 0.5); c.moveTo(x - s * 0.1, y); c.lineTo(x + s * 0.5, y + s * 0.15); c.stroke();
}
export function drawCoin(c, x, y, t, ph, sc = 1) {
  const sp = Math.cos(t * 3.2 + ph), w = Math.max(0.42, Math.abs(sp));
  c.save(); c.translate(x, y); c.scale(w * sc, sc);
  c.fillStyle = sp > 0 ? '#ffd23a' : '#f0a81e'; c.strokeStyle = INK; c.lineWidth = 3 / Math.max(0.4, w);
  c.beginPath(); c.arc(0, 0, 11, 0, TAU); c.fill(); c.stroke();
  c.strokeStyle = '#c47d10'; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 6.5, 0, TAU); c.stroke();
  c.fillStyle = '#fff6c0'; c.beginPath(); c.ellipse(-4, -4, 3, 2, -0.6, 0, TAU); c.fill();
  c.restore();
}
export function drawGem(c, x, y, t, col, big = false, noGlow = false) {
  const s = big ? 1.9 : 1, bob = noGlow ? 0 : Math.sin(t * 2.4 + x) * 3;
  if (!noGlow) {
    if (big) { const pulse = Math.pow(Math.max(0, Math.sin(t * 2.2 + x * 0.01)), 10); drawGlow(c, x, y + bob, 56, col, 0.14 + 0.5 * pulse); }
    else drawGlow(c, x, y + bob, 46, col, 0.7);
  }
  c.save(); c.translate(x, y + bob); c.scale(s, s);
  if (big) { c.rotate(Math.sin(t) * 0.08); c.globalAlpha = 0.5; c.strokeStyle = '#ffffff'; c.lineWidth = 1.5; for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + t * 0.6; c.beginPath(); c.moveTo(Math.cos(a) * 17, Math.sin(a) * 17); c.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); c.stroke(); } c.globalAlpha = 1; }
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 2.5 / s * (big ? 1.4 : 1);
  c.beginPath(); c.moveTo(-12, -4); c.lineTo(-6, -11); c.lineTo(6, -11); c.lineTo(12, -4); c.lineTo(0, 13); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.65)'; c.beginPath(); c.moveTo(-12, -4); c.lineTo(-6, -11); c.lineTo(-1, -4); c.closePath(); c.fill();
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.beginPath(); c.moveTo(0, 13); c.lineTo(5, -4); c.lineTo(12, -4); c.closePath(); c.fill();
  c.strokeStyle = INK; c.lineWidth = 1.5 / s; c.beginPath(); c.moveTo(-12, -4); c.lineTo(12, -4); c.moveTo(-6, -11); c.lineTo(-1, -4); c.lineTo(0, 13); c.moveTo(6, -11); c.lineTo(5, -4); c.stroke();
  const tw = (t * 1.3 + x * 0.01) % 2;
  if (tw < 0.4) { const k = Math.sin((tw / 0.4) * Math.PI); c.fillStyle = '#fff'; star(c, 7, -9, 5 * k); }
  c.restore();
}
export function star(c, x, y, r) {
  c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU, rr = i % 2 ? r * 0.3 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
}
export function drawFlag(c, f, t) {
  const x = f.x, y = FLOOR;
  c.strokeStyle = INK; c.lineWidth = 6; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 86); c.stroke();
  c.strokeStyle = '#8a5a34'; c.lineWidth = 3; c.stroke();
  c.fillStyle = '#ffcc3a'; c.strokeStyle = INK; c.lineWidth = 2.5; c.beginPath(); c.arc(x, y - 88, 5, 0, TAU); c.fill(); c.stroke();
  const up = f.on ? Math.min(1, f.t * 3) : 0, fy = y - 30 - up * 50;
  c.fillStyle = f.on ? '#5ee06a' : '#e8473a';
  c.beginPath(); c.moveTo(x + 2, fy - 16);
  for (let i = 0; i <= 6; i++) { const k = i / 6; c.lineTo(x + 2 + k * 42, fy - 16 + Math.sin(t * 6 - k * 4) * 3 * k + k * 16 * 0); }
  c.lineTo(x + 44, fy + 2 + Math.sin(t * 6 - 4) * 3);
  for (let i = 6; i >= 0; i--) { const k = i / 6; c.lineTo(x + 2 + k * 42, fy + 4 + Math.sin(t * 6 - k * 4) * 3 * k); }
  c.closePath(); c.fill(); c.stroke();
  if (f.on) { c.fillStyle = '#fff'; star(c, x + 20, fy - 6, 5); if (f.t < 0.6) drawGlow(c, x + 20, fy - 6, 70 * (1 - f.t), '#9dff8a', 0.8); }
}
export function drawChest(c, ch, t) {
  const x = ch.x, y = FLOOR;
  drawGlow(c, x, y - 40, ch.open ? 160 : 90 + Math.sin(t * 3) * 10, '#ffcc3a', ch.open ? 0.8 : 0.45);
  c.strokeStyle = INK; c.lineWidth = 3.5; c.lineJoin = 'round';
  c.fillStyle = '#9a5a2c'; c.beginPath(); c.roundRect(x - 40, y - 46, 80, 46, 5); c.fill(); c.stroke();
  c.fillStyle = '#ffcc3a'; c.fillRect(x - 40, y - 30, 80, 7); c.strokeRect(x - 40, y - 30, 80, 7);
  c.fillRect(x - 30, y - 46, 8, 46); c.strokeRect(x - 30, y - 46, 8, 46); c.fillRect(x + 22, y - 46, 8, 46); c.strokeRect(x + 22, y - 46, 8, 46);
  if (ch.open) {
    c.fillStyle = '#ffe066'; c.beginPath(); c.ellipse(x, y - 46, 36, 10, 0, 0, TAU); c.fill(); c.stroke();
    c.save(); c.translate(x - 40, y - 46); c.rotate(-1.9 - Math.sin(Math.min(1, ch.t * 3) * Math.PI) * 0.2);
    c.fillStyle = '#a8653a'; c.beginPath(); c.roundRect(0, -26, 80, 26, [12, 12, 2, 2]); c.fill(); c.stroke(); c.restore();
  } else {
    const wob = Math.sin(t * 5) * 1.5;
    c.save(); c.translate(x, y - 46 + wob * 0.3);
    c.fillStyle = '#a8653a'; c.beginPath(); c.roundRect(-42, -26, 84, 26, [14, 14, 2, 2]); c.fill(); c.stroke();
    c.fillStyle = '#ffcc3a'; c.fillRect(-32, -24, 8, 24); c.strokeRect(-32, -24, 8, 24); c.fillRect(24, -24, 8, 24); c.strokeRect(24, -24, 8, 24);
    c.beginPath(); c.roundRect(-7, -8, 14, 16, 3); c.fill(); c.stroke();
    c.restore();
  }
}
export function drawCart(c, k, t) {
  const x = k.x, y = FLOOR - 10;
  c.save(); c.translate(x, y);
  if (k.state === 'crash') c.rotate(0.12);
  c.strokeStyle = INK; c.lineWidth = 3.5; c.lineJoin = 'round';
  c.fillStyle = '#6f7684';
  c.beginPath(); c.moveTo(-34, -46); c.lineTo(34, -46); c.lineTo(28, -10); c.lineTo(-28, -10); c.closePath(); c.fill(); c.stroke();
  c.fillStyle = '#8c95a6'; c.fillRect(-36, -50, 72, 8); c.strokeRect(-36, -50, 72, 8);
  c.fillStyle = '#c9c4be'; for (const rx of [-24, -8, 8, 24]) { c.beginPath(); c.arc(rx, -28, 2.5, 0, TAU); c.fill(); }
  const rot = k.x / 12;
  for (const wx of [-18, 18]) {
    c.fillStyle = '#3a3f4a'; c.beginPath(); c.arc(wx, -6, 9, 0, TAU); c.fill(); c.stroke();
    c.strokeStyle = '#9aa2ae'; c.lineWidth = 2; c.beginPath(); c.moveTo(wx + Math.cos(rot) * 6, -6 + Math.sin(rot) * 6); c.lineTo(wx - Math.cos(rot) * 6, -6 - Math.sin(rot) * 6); c.stroke();
    c.strokeStyle = INK; c.lineWidth = 3.5;
  }
  c.restore();
}
export function drawBat(c, b, t) {
  const flap = Math.sin(t * 18 + b.phase * 3);
  drawGlow(c, b.x, b.y, 62, '#ff3d4e', 0.42);
  c.save(); c.translate(b.x, b.y); c.scale(b.dir, 1);
  c.strokeStyle = INK; c.lineWidth = 3; c.lineJoin = 'round';
  c.fillStyle = '#7a4aa8';
  for (const s of [-1, 1]) {
    c.beginPath(); c.moveTo(s * 6, -2);
    c.quadraticCurveTo(s * 20, -16 - flap * 12, s * 34, -6 - flap * 16);
    c.quadraticCurveTo(s * 28, 0, s * 26, 4 - flap * 4);
    c.quadraticCurveTo(s * 18, 0, s * 14, 6);
    c.quadraticCurveTo(s * 10, 2, s * 6, 6);
    c.closePath(); c.fill(); c.stroke();
  }
  c.fillStyle = '#8c5ab8'; c.beginPath(); c.ellipse(0, 0, 11, 12, 0, 0, TAU); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-8, -8); c.lineTo(-6, -18); c.lineTo(-1, -10); c.moveTo(8, -8); c.lineTo(6, -18); c.lineTo(1, -10); c.fill(); c.stroke();
  // a bright hazard rim so it pops off dark rock
  c.strokeStyle = '#ff7a86'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(0, 0, 8.5, 9.5, 0, 3.4, 5.6); c.stroke();
  drawGlow(c, 0.5, -2, 14, '#ff3d4e', 0.9);
  c.fillStyle = '#ff4a5a'; c.beginPath(); c.arc(-4, -2, 3.6, 0, TAU); c.arc(5, -2, 3.6, 0, TAU); c.fill();
  c.fillStyle = '#fff2c0'; c.beginPath(); c.arc(-3, -2.4, 1.5, 0, TAU); c.arc(6, -2.4, 1.5, 0, TAU); c.fill();
  c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-3, 5); c.lineTo(-1.5, 9); c.lineTo(0, 5); c.moveTo(1, 5); c.lineTo(2.5, 9); c.lineTo(4, 5); c.fill();
  c.restore();
}
export function drawWind(c, z, t) {
  const active = !z.period || ((t + z.phase) % z.period) <= z.on;
  const soon = z.period && !active && z.period - ((t + z.phase) % z.period) < 1;
  if (!active && !soon) return;
  const up = z.fx === 0 && z.fy < 0, col = THEMES[z.theme].key === 'ice' ? '#ffffff' : '#e8fff4';
  if (up) {
    const g = c.createLinearGradient(z.x, 0, z.x + z.w, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(220,255,250,0.10)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(z.x, z.y - 20, z.w, z.h + 20);
  }
  c.strokeStyle = col; c.lineCap = 'round';
  const n = up ? 16 : 22;
  for (let i = 0; i < n; i++) {
    const h1 = hash(i * 3.1 + z.x), h2 = hash(i * 7.7 + z.x);
    c.globalAlpha = up ? 0.45 * (0.5 + h2 * 0.5) : (soon ? 0.22 : 0.85) * (0.6 + h2 * 0.4);
    c.lineWidth = up ? 2 + h1 * 2 : soon ? 2.5 : 4 + h1 * 3;
    if (!up) c.strokeStyle = soon ? '#dff4ff' : '#bfe8ff';
    if (up) {
      const x = z.x + 10 + h1 * (z.w - 20) + Math.sin(t * 3 + i) * 6, y = z.y + z.h - ((t * (380 + h2 * 200) + h2 * z.h) % z.h), l = 30 + h2 * 50;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + l); c.stroke();
    } else {
      const y = z.y + 30 + h1 * (z.h - 120), x = z.x + z.w - ((t * (700 + h2 * 300) + h2 * z.w) % z.w), l = 50 + h2 * 80;
      c.beginPath(); c.moveTo(x, y + Math.sin(x * 0.02) * 6); c.quadraticCurveTo(x + l / 2, y - 6, x + l, y + Math.sin((x + l) * 0.02) * 6); c.stroke();
    }
  }
  c.globalAlpha = 1;
}
export function drawCover(c, f, t, near, ceilY) {
  const P = THEMES[f.theme];
  c.save();
  c.globalAlpha = near ? 0.38 : 1;
  c.lineJoin = 'round';
  const shade = (path) => {
    path(); c.fillStyle = P.rock; c.fill();
    path(); c.fillStyle = 'rgba(8,4,14,0.42)'; c.fill();
    c.save(); path(); c.clip();
    c.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 0; i < 9; i++) { const h1 = hash(f.seed + i * 3.3), h2 = hash(f.seed + i * 5.9); c.beginPath(); c.ellipse(f.x - 110 + h1 * 220, f.y - 140 + h2 * 260, 9 + h1 * 9, 5 + h2 * 4, h1, 0, TAU); c.fill(); }
    c.fillStyle = 'rgba(255,255,255,0.07)';
    for (let i = 0; i < 6; i++) { const h1 = hash(f.seed + i * 7.1 + 1), h2 = hash(f.seed + i * 2.7 + 4); c.beginPath(); c.ellipse(f.x - 100 + h1 * 200, f.y - 120 + h2 * 230, 6 + h1 * 6, 3, 0, 0, TAU); c.fill(); }
    c.restore();
    path(); c.strokeStyle = INK; c.lineWidth = 4; c.stroke();
  };
  if (f.low) {
    const rocks = [[-78, 52, 46], [62, 50, 52], [-28, 34, 58], [24, 20, 54], [-6, 70, 70]];
    for (const [dx, dy, r] of rocks) {
      shade(() => { c.beginPath(); c.ellipse(f.x + dx, f.y + dy, r, r * 0.8, dx * 0.004, 0, TAU); });
      c.strokeStyle = P.rim + 'b0'; c.lineWidth = 3.5; c.beginPath(); c.ellipse(f.x + dx, f.y + dy, r * 0.82, r * 0.62, 0, 3.4, 4.9); c.stroke();
    }
  } else {
    const top = Math.min(f.y - 120, (ceilY || 40) - 10);
    for (const [dx, wd, l] of [[-56, 44, 95], [52, 40, 105], [0, 62, 150], [-100, 30, 60], [96, 30, 70]]) {
      const x = f.x + dx, y2 = f.y - 60 + l;
      shade(() => { c.beginPath(); c.moveTo(x - wd, top); c.bezierCurveTo(x - wd, top + (y2 - top) * 0.5, x - wd * 0.25, y2 - 20, x, y2); c.bezierCurveTo(x + wd * 0.25, y2 - 20, x + wd, top + (y2 - top) * 0.5, x + wd, top); c.closePath(); });
      c.strokeStyle = P.rim + 'a0'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(x - wd * 0.6, top + 20); c.quadraticCurveTo(x - wd * 0.5, (top + y2) / 2, x - 4, y2 - 14); c.stroke();
    }
  }
  c.restore();
  // a twinkle peeks out every couple of seconds
  const tw = (t * 0.5 + f.seed) % 2.2;
  if (tw < 0.35) { c.fillStyle = '#fff'; star(c, f.x + (f.low ? 30 : -24), f.y + (f.low ? -18 : 38), 10 * Math.sin((tw / 0.35) * Math.PI)); }
}

export function drawBubble(c, x, y, text, t) {
  const s = 1 + Math.sin(t * 9) * 0.06;
  c.save(); c.translate(x, y); c.scale(s, s);
  c.font = "22px 'Lilita One', sans-serif"; c.textAlign = 'center'; c.textBaseline = 'middle';
  const w = c.measureText(text).width + 24;
  c.fillStyle = '#fff6c8'; c.strokeStyle = INK; c.lineWidth = 3.5; c.lineJoin = 'round';
  c.beginPath(); c.roundRect(-w / 2, -17, w, 34, 14); c.moveTo(-8, 16); c.lineTo(-2, 28); c.lineTo(6, 16); c.fill(); c.stroke();
  c.fillStyle = '#fff6c8'; c.fillRect(-7, 12, 12, 6);
  c.fillStyle = INK; c.fillText(text, 0, 1);
  c.restore();
}

// ------------------------------------------------------------ the rope and the goblin
export function drawRope(c, hx, hy, ax, ay, slack, wob, t, hookTip) {
  const dx = ax - hx, dy = ay - hy, d = Math.hypot(dx, dy) || 1, nx = -dy / d, ny = dx / d;
  const pts = [], N = 14, wv = wob * Math.sin(t * 46) * 9;
  for (let i = 0; i <= N; i++) {
    const k = i / N, s = Math.sin(k * Math.PI);
    pts.push([hx + dx * k + nx * s * wv, hy + dy * k + ny * s * wv + s * slack]);
  }
  const path = () => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i <= N; i++) c.lineTo(pts[i][0], pts[i][1]); };
  c.lineCap = 'round'; c.lineJoin = 'round';
  path(); c.strokeStyle = INK; c.lineWidth = 6.5; c.stroke();
  c.strokeStyle = slack > 2 ? '#c89452' : '#e8b468'; c.lineWidth = 3.2; c.stroke();
  c.strokeStyle = '#8a5a2c'; c.lineWidth = 3.2; c.setLineDash([3, 6]); c.lineDashOffset = -t * 20; c.stroke(); c.setLineDash([]);
  if (hookTip) drawHookHead(c, ax, ay, Math.atan2(dy, dx));
}
export function drawHookHead(c, x, y, ang) {
  c.save(); c.translate(x, y); c.rotate(ang);
  c.strokeStyle = INK; c.lineWidth = 6; c.lineCap = 'round';
  c.beginPath(); c.moveTo(-6, 0); c.lineTo(6, 0); c.moveTo(6, 0); c.quadraticCurveTo(10, -9, 3, -12); c.moveTo(6, 0); c.quadraticCurveTo(10, 9, 3, 12); c.stroke();
  c.strokeStyle = '#d6dbe4'; c.lineWidth = 3; c.stroke();
  c.restore();
}

// v: visual state from the game (rot, face, sq, ears, blink, run, onRope, armAng, mood, look)
export function drawGoblin(c, x, y, v, t) {
  c.save(); c.translate(x, y); c.rotate(v.rot);
  c.scale(v.face * 1.32, 1.32);
  const sq = v.sq;
  c.scale(1 / Math.sqrt(sq), sq);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const O = INK, skin = '#8ee05a', skinD = '#5aa83a';
  c.strokeStyle = O; c.lineWidth = 3;
  // legs
  const lp = v.run;
  let f1, f2;
  if (v.ground) { f1 = [-5 + Math.sin(lp) * 8, 20 - Math.max(0, Math.cos(lp)) * 4]; f2 = [5 - Math.sin(lp) * 8, 20 - Math.max(0, -Math.cos(lp)) * 4]; }
  else if (v.onRope) { const s = Math.sin(t * 9) * 2; f1 = [-9, 19 + s]; f2 = [3, 21 - s]; }
  else { f1 = [-10 - v.kick * 4, 16]; f2 = [6, 20 - v.kick * 6]; }
  for (const [fx, fy] of [f1, f2]) {
    c.strokeStyle = O; c.lineWidth = 6; c.beginPath(); c.moveTo(fx * 0.3, 8); c.lineTo(fx, fy); c.stroke();
    c.strokeStyle = skinD; c.lineWidth = 3; c.stroke();
    c.fillStyle = '#6b3a1c'; c.strokeStyle = O; c.lineWidth = 2.5; c.beginPath(); c.ellipse(fx + 3, fy + 1, 6, 3.5, 0, 0, TAU); c.fill(); c.stroke();
  }
  // back arm
  const arm = (ax, ay, hx, hy) => { c.strokeStyle = O; c.lineWidth = 6; c.beginPath(); c.moveTo(ax, ay); c.lineTo(hx, hy); c.stroke(); c.strokeStyle = skin; c.lineWidth = 3; c.stroke(); c.fillStyle = skin; c.strokeStyle = O; c.lineWidth = 2.5; c.beginPath(); c.arc(hx, hy, 3.6, 0, TAU); c.fill(); c.stroke(); };
  if (!v.onRope) arm(-6, -2, -14 + Math.sin(lp + 1) * 3, 7 + (v.ground ? 0 : -8 * v.kick));
  // body
  c.fillStyle = skin; c.strokeStyle = O; c.lineWidth = 3;
  c.beginPath(); c.ellipse(0, 2, 12, 13, 0, 0, TAU); c.fill();
  c.save(); c.clip();
  c.fillStyle = '#b5652e'; c.fillRect(-14, 1, 28, 16);
  c.fillStyle = '#6b3a1c'; c.fillRect(-14, 1, 28, 3.5);
  c.fillStyle = '#ffcc3a'; c.fillRect(-2, 0.5, 5, 4.5);
  c.fillStyle = '#c9f29a'; c.beginPath(); c.ellipse(3, -5, 6, 5, 0, 0, TAU); c.fill();
  c.restore();
  c.beginPath(); c.ellipse(0, 2, 12, 13, 0, 0, TAU); c.stroke();
  // satchel strap
  c.strokeStyle = '#6b3a1c'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-9, -6); c.lineTo(8, 8); c.stroke();
  // head
  const hy = -17;
  // ears (springy)
  const ear = (side, ang) => {
    c.save(); c.translate(side * 9, hy - 3); c.rotate(ang);
    c.fillStyle = skin; c.strokeStyle = O; c.lineWidth = 3;
    c.beginPath(); c.moveTo(0, -5); c.quadraticCurveTo(14, -10, 27, -2); c.quadraticCurveTo(14, 7, 0, 5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#ff9fb0'; c.beginPath(); c.moveTo(3, -2); c.quadraticCurveTo(13, -5, 21, -1); c.quadraticCurveTo(12, 3, 3, 2); c.closePath(); c.fill();
    c.restore();
  };
  ear(-1, Math.PI + 0.35 - v.earB);
  c.fillStyle = skin; c.strokeStyle = O; c.lineWidth = 3;
  c.beginPath(); c.ellipse(2, hy, 13, 12, 0, 0, TAU); c.fill(); c.stroke();
  ear(1, -0.35 + v.earF);
  // nose
  c.fillStyle = skinD; c.beginPath(); c.moveTo(11, hy - 1); c.quadraticCurveTo(24, hy + 1, 22, hy + 4); c.quadraticCurveTo(16, hy + 6, 11, hy + 4); c.closePath(); c.fill(); c.stroke();
  // eyes
  const lx = v.look[0], ly = v.look[1];
  const blink = v.blink > 0;
  for (const [ex, ey, r] of [[3, hy - 4, 5.6], [11, hy - 4.5, 4.6]]) {
    if (blink) { c.strokeStyle = O; c.lineWidth = 2.5; c.beginPath(); c.moveTo(ex - r, ey); c.quadraticCurveTo(ex, ey + 3, ex + r, ey); c.stroke(); continue; }
    c.fillStyle = '#fff'; c.strokeStyle = O; c.lineWidth = 2.5;
    c.beginPath(); c.ellipse(ex, ey, r, r * (v.mood === 'scared' ? 1.25 : 1.1), 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = O; c.beginPath(); c.arc(ex + lx * r * 0.42, ey + ly * r * 0.42, r * (v.mood === 'scared' ? 0.32 : 0.48), 0, TAU); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(ex + lx * r * 0.42 - 1, ey + ly * r * 0.42 - 1.4, 1.1, 0, TAU); c.fill();
  }
  // brows
  c.strokeStyle = O; c.lineWidth = 2.5;
  const bU = v.mood === 'whee' ? -2 : v.mood === 'scared' ? -3 : 0;
  c.beginPath(); c.moveTo(-1, hy - 11 + bU); c.lineTo(6, hy - 12 + bU - (v.mood === 'cheeky' ? 0 : 1)); c.moveTo(9, hy - 12 + bU); c.lineTo(15, hy - 10 + bU); c.stroke();
  // mouth
  c.fillStyle = '#5a1a2a';
  if (v.mood === 'whee' || v.mood === 'scared') {
    c.beginPath(); c.ellipse(9, hy + 7, 4.5, v.mood === 'whee' ? 4.5 : 3.5, 0, 0, TAU); c.fill(); c.stroke();
    c.fillStyle = '#ff7a8a'; c.beginPath(); c.ellipse(9, hy + 9, 2.5, 1.6, 0, 0, TAU); c.fill();
  } else {
    c.beginPath(); c.moveTo(3, hy + 5); c.quadraticCurveTo(9, hy + 11, 15, hy + 5); c.quadraticCurveTo(9, hy + 7.5, 3, hy + 5); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = '#fff'; c.fillRect(10, hy + 5.5, 2.6, 2.6);
  }
  c.fillStyle = 'rgba(255,110,130,0.45)'; c.beginPath(); c.ellipse(-1, hy + 3, 3, 2, 0, 0, TAU); c.fill();
  // front arm (reaches up the rope)
  if (v.onRope) arm(5, -4, v.hand[0], v.hand[1]);
  else arm(6, -2, 14 + Math.sin(lp) * 3, 6 + (v.ground ? 0 : -10 * v.kick));
  c.restore();
}
