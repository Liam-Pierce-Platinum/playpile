// Ink-on-paper drawing: the castle halls, the roof, the castle seen from
// outside, stick-ink figures (with the wardrobe on the hero), red ink splats
// and hanko stamps.
import { W, H, FLOOR, FLOORS } from './levels.js';

export const BRUSH = '"Yuji Syuku", "Noto Serif JP", serif';
export const DISPLAY = '"Shojumaru", "Yuji Syuku", serif';

export function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ------------------------------------------------------------ outside: sky, moon, distant land
export function drawSky(x, w, h, pal, R, opts = {}) {
  const g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, pal.sky[0]); g.addColorStop(1, pal.sky[1]);
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  const night = pal.paper.startsWith('#2') || pal.paper.startsWith('#1');
  if (night) { x.fillStyle = '#f2ead8'; for (let k = 0; k < w * h / 9000; k++) { x.globalAlpha = 0.2 + R() * 0.6; x.fillRect(R() * w, R() * h * 0.7, 2, 2); } }
  const sx = opts.sunX ?? w * 0.72, sy = opts.sunY ?? h * 0.26, sr = opts.sunR ?? Math.min(w, h) * 0.16;
  x.globalAlpha = 0.9; x.fillStyle = opts.moon || pal.sun;
  x.beginPath(); x.arc(sx, sy, sr, 0, 7); x.fill();
  x.globalAlpha = 0.25; x.lineWidth = 5; x.strokeStyle = opts.moon || pal.sun;
  for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(sx, sy, sr + 5 + R() * 8, R() * 6, R() * 6 + 4.5); x.stroke(); }
  // cloud streaks
  x.globalAlpha = night ? 0.35 : 0.25; x.strokeStyle = night ? '#0a0c14' : pal.paper; x.lineCap = 'round';
  for (let k = 0; k < 5; k++) { const cy = sy - sr + R() * sr * 2.4, cx = sx - sr * 2 + R() * sr * 3; x.lineWidth = 4 + R() * 8; x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + sr * (1 + R()), cy + (R() - 0.5) * 6); x.stroke(); }
  x.globalAlpha = 1;
  // far mountains, sinking lower the higher you are
  const drop = opts.drop || 0;
  for (const [base, amp, a] of [[h * 0.62, h * 0.18, 0.28], [h * 0.74, h * 0.12, 0.45]]) {
    x.fillStyle = pal.wash; x.globalAlpha = a;
    x.beginPath(); x.moveTo(0, h);
    for (let px = 0; px <= w + 30; px += 30) x.lineTo(px, base + drop - Math.abs(Math.sin(px * 0.006 + base)) * amp - R() * 14);
    x.lineTo(w, h); x.closePath(); x.fill();
  }
  x.globalAlpha = 1;
}

// ------------------------------------------------------------ the halls (one long canvas per floor)
export function paintFloor(stage, pal) {
  const FW = stage.width;
  const c = document.createElement('canvas'); c.width = FW; c.height = H;
  const x = c.getContext('2d');
  const R = seeded(stage.f * 131 + 7);
  const night = stage.chapter >= 2;
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.paper); g.addColorStop(1, pal.paper2);
  x.fillStyle = g; x.fillRect(0, 0, FW, H);
  const wood = pal.wood;
  // window views and panels between the pillars
  for (let px = 0; px < FW; px += 320) {
    const bay = px % W === 0 ? 'door' : ['shoji', 'window', 'scroll', 'screen', 'shoji', 'window'][Math.floor(R() * 6)];
    const bx = px + 34, bw = 320 - 68;
    if (bay === 'window') {
      // a barred window with the outside far below
      const wx = bx + 40, wy = 190, ww = bw - 80, wh = 150;
      x.save(); x.beginPath(); x.rect(wx, wy, ww, wh); x.clip();
      x.translate(wx, wy);
      drawSky(x, ww, wh, pal, R, { sunX: ww * (0.3 + R() * 0.4), sunY: wh * 0.3, sunR: 22, drop: stage.f * 6 });
      x.restore();
      x.fillStyle = wood; x.globalAlpha = 0.85;
      for (let k = 1; k < 5; k++) x.fillRect(wx + ww * k / 5 - 3, wy, 6, wh);
      x.lineWidth = 8; x.strokeStyle = wood; x.strokeRect(wx, wy, ww, wh);
      x.globalAlpha = 1;
    } else if (bay === 'shoji') {
      x.fillStyle = night ? 'rgba(255,220,160,0.06)' : 'rgba(255,250,236,0.55)';
      x.fillRect(bx, 150, bw, 410);
      x.strokeStyle = wood; x.globalAlpha = 0.45; x.lineWidth = 3;
      for (let k = 0; k <= 4; k++) { x.beginPath(); x.moveTo(bx + bw * k / 4, 150); x.lineTo(bx + bw * k / 4, 560); x.stroke(); }
      for (let k = 0; k <= 6; k++) { x.beginPath(); x.moveTo(bx, 150 + 410 * k / 6); x.lineTo(bx + bw, 150 + 410 * k / 6); x.stroke(); }
      x.globalAlpha = 1;
    } else if (bay === 'scroll') {
      const sx = bx + bw / 2 - 45;
      x.fillStyle = night ? '#3a3f55' : '#f6eedb'; x.globalAlpha = 0.9; x.fillRect(sx, 170, 90, 280);
      x.fillStyle = wood; x.fillRect(sx - 8, 164, 106, 9); x.fillRect(sx - 8, 446, 106, 9);
      x.font = `56px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = pal.ink; x.globalAlpha = 0.75;
      const words = ['武', '忍', '刃', '風', '月', '炎', '誠', '影'];
      x.fillText(words[Math.floor(R() * words.length)], sx + 45, 250);
      x.fillText(words[Math.floor(R() * words.length)], sx + 45, 340);
      x.fillStyle = pal.accent; x.fillRect(sx + 56, 400, 18, 18);
      x.globalAlpha = 1;
    } else if (bay === 'screen') {
      // folding screen with ink waves
      const sy = 360, sh = 200;
      for (let k = 0; k < 4; k++) {
        const fx = bx + k * bw / 4;
        x.fillStyle = k % 2 ? pal.paper : pal.paper2; x.globalAlpha = 0.9; x.fillRect(fx, sy, bw / 4, sh);
        x.strokeStyle = wood; x.lineWidth = 3; x.strokeRect(fx, sy, bw / 4, sh);
      }
      x.strokeStyle = pal.wash; x.lineWidth = 3; x.globalAlpha = 0.7;
      for (let row = 0; row < 3; row++) for (let k = 0; k < 7; k++) { x.beginPath(); x.arc(bx + 20 + k * 36, sy + 70 + row * 50, 18, Math.PI, 0); x.stroke(); }
      x.globalAlpha = 1;
    }
    // pillar
    x.fillStyle = wood; x.globalAlpha = night ? 0.9 : 0.75;
    x.fillRect(px - 13, 40, 26, FLOOR - 40);
    x.globalAlpha = 1;
  }
  // head beam, ceiling, rafters, low wainscot
  x.fillStyle = wood;
  x.fillRect(0, 0, FW, 46);
  x.globalAlpha = 0.85; x.fillRect(0, 124, FW, 18);
  x.globalAlpha = 0.5; x.fillRect(0, 560, FW, FLOOR - 560);
  x.globalAlpha = 1;
  x.fillStyle = pal.paper2;
  for (let px = 20; px < FW; px += 80) { x.globalAlpha = 0.35; x.fillRect(px, 30, 30, 12); }
  x.globalAlpha = 1;
  // hanging lanterns
  for (let k = 0; k < FW / 500; k++) {
    const lx = 200 + R() * (FW - 400), ly = 200 + R() * 60;
    x.strokeStyle = wood; x.lineWidth = 2; x.beginPath(); x.moveTo(lx, 142); x.lineTo(lx, ly - 22); x.stroke();
    x.fillStyle = night ? '#ffb060' : '#f6e2b8'; x.globalAlpha = night ? 0.85 : 0.9;
    x.beginPath(); x.ellipse(lx, ly, 15, 22, 0, 0, 7); x.fill();
    x.globalAlpha = 1; x.fillStyle = wood; x.fillRect(lx - 9, ly - 24, 18, 5); x.fillRect(lx - 9, ly + 19, 18, 5);
    if (night) { const gl = x.createRadialGradient(lx, ly, 4, lx, ly, 120); gl.addColorStop(0, 'rgba(255,170,90,0.22)'); gl.addColorStop(1, 'rgba(255,170,90,0)'); x.fillStyle = gl; x.fillRect(lx - 120, ly - 120, 240, 240); }
  }
  // ground: fat brush masses with ragged tops, plank streaks
  for (const [x0, x1] of stage.floor) {
    x.fillStyle = pal.ink;
    x.beginPath(); x.moveTo(x0, H + 5);
    x.lineTo(x0 - 2, FLOOR + 6);
    for (let px = x0; px <= x1; px += 12) x.lineTo(px, FLOOR - 2 + (R() - 0.5) * 5);
    x.lineTo(x1 + 2, FLOOR + 6); x.lineTo(x1, H + 5); x.closePath(); x.fill();
    x.globalAlpha = 0.18; x.strokeStyle = pal.paper; x.lineWidth = 2;
    for (let k = 0; k < (x1 - x0) / 30; k++) { const sx2 = x0 + R() * (x1 - x0), sy2 = FLOOR + 10 + R() * 60; x.beginPath(); x.moveTo(sx2, sy2); x.lineTo(sx2 + 20 + R() * 40, sy2 + (R() - 0.5) * 4); x.stroke(); }
    x.globalAlpha = 1;
  }
  // spikes in the pits
  const fl = [...stage.floor].sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < fl.length - 1; k++) {
    const a = fl[k][1], b = fl[k + 1][0];
    if (b - a < 4) continue;
    x.fillStyle = pal.ink;
    for (let px = a + 4; px < b - 4; px += 18) { x.beginPath(); x.moveTo(px, H); x.lineTo(px + 9, H - 34 - R() * 10); x.lineTo(px + 18, H); x.fill(); }
  }
  // spring-trap plates
  for (const t of stage.traps) {
    x.fillStyle = pal.wash; x.globalAlpha = 0.9; x.fillRect(t.x, FLOOR - 3, t.w, 6);
    x.globalAlpha = 1; x.fillStyle = pal.paper2;
    for (let px = t.x + 8; px < t.x + t.w - 4; px += 16) { x.beginPath(); x.arc(px, FLOOR, 2, 0, 7); x.fill(); }
  }
  // floating beams, hung from the ceiling on ropes
  for (const p of stage.plats) {
    x.strokeStyle = pal.wash; x.lineWidth = 2; x.globalAlpha = 0.8;
    for (const rx of [p.x + 18, p.x + p.w - 18]) { x.beginPath(); x.moveTo(rx, 46); x.lineTo(rx, p.y); x.stroke(); }
    x.globalAlpha = 1;
    beam(x, p, pal, R);
  }
  // the stairs up, at the far right
  if (stage.stairs) {
    const sx = stage.stairs.x;
    x.fillStyle = pal.ink;
    x.beginPath(); x.moveTo(sx, FLOOR);
    const steps = 9;
    for (let k = 0; k < steps; k++) { const yy = FLOOR - (k + 1) * (FLOOR - 70) / steps, xx = sx + k * 210 / steps; x.lineTo(xx, yy); x.lineTo(xx + 210 / steps, yy); }
    x.lineTo(FW, 46); x.lineTo(FW, FLOOR); x.closePath(); x.globalAlpha = 0.85; x.fill(); x.globalAlpha = 1;
    x.fillStyle = pal.accent; x.font = `46px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('上', sx - 30, 200);
  }
  // outer wall on the left, around the window you break in through
  x.fillStyle = wood; x.fillRect(0, 0, 34, FLOOR);
  grain(x, FW, R, pal);
  return c;
}

function beam(x, p, pal, R) {
  x.fillStyle = pal.ink;
  x.beginPath();
  x.moveTo(p.x - 6, p.y + 4);
  for (let px = p.x; px <= p.x + p.w; px += 10) x.lineTo(px, p.y - 1 + (R() - 0.5) * 4);
  x.lineTo(p.x + p.w + 8, p.y + 6);
  for (let px = p.x + p.w; px >= p.x; px -= 14) x.lineTo(px, p.y + p.h + (R() - 0.5) * 8 - (px === p.x ? 4 : 0));
  x.closePath(); x.fill();
  x.globalAlpha = 0.2; x.strokeStyle = pal.paper; x.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) { const yy = p.y + 6 + R() * (p.h - 10); x.beginPath(); x.moveTo(p.x + R() * 30, yy); x.lineTo(p.x + p.w - R() * 30, yy + (R() - 0.5) * 3); x.stroke(); }
  x.globalAlpha = 1;
}

function grain(x, w, R, pal) {
  const img = x.getImageData(0, 0, w, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.06; x.strokeStyle = pal.ink; x.lineWidth = 1;
  for (let k = 0; k < w / 9; k++) { const fx = R() * w, fy = R() * H; x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + 8, fy + R() * 10, fx + 20 + R() * 20, fy + (R() - 0.5) * 8); x.stroke(); }
  x.globalAlpha = 1;
}

// ------------------------------------------------------------ the roof
export function paintRoof(stage, pal) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const R = seeded(999);
  drawSky(x, W, H, pal, R, { sunX: 640, sunY: 250, sunR: 190, drop: 160 });
  // the land far below
  x.fillStyle = '#0a0c14'; x.globalAlpha = 0.6;
  for (let k = 0; k < 40; k++) { const bx = R() * W, bh = 10 + R() * 26; x.fillRect(bx, 600 - bh, 14 + R() * 30, bh + 40); }
  x.globalAlpha = 1;
  // roof: tiled slope
  x.fillStyle = '#0b0d16';
  x.beginPath(); x.moveTo(-10, H + 5); x.lineTo(-10, FLOOR + 4);
  for (let px = 0; px <= W; px += 12) x.lineTo(px, FLOOR - 2 + (R() - 0.5) * 3);
  x.lineTo(W + 10, FLOOR + 4); x.lineTo(W + 10, H + 5); x.closePath(); x.fill();
  x.strokeStyle = pal.ink; x.globalAlpha = 0.22; x.lineWidth = 2;
  for (let px = 10; px < W; px += 28) { x.beginPath(); x.moveTo(px, FLOOR + 4); x.quadraticCurveTo(px + 6, FLOOR + 40, px - 4, H); x.stroke(); }
  x.globalAlpha = 1;
  x.fillStyle = pal.ink; x.fillRect(0, FLOOR - 6, W, 6);
  // shachihoko (the golden fish) on both ends of the ridge
  for (const [sx, d] of [[30, 1], [W - 30, -1]]) {
    x.save(); x.translate(sx, FLOOR - 6); x.scale(d, 1);
    x.fillStyle = '#c9962a';
    x.beginPath(); x.moveTo(-12, 0); x.quadraticCurveTo(-18, -40, 6, -62); x.quadraticCurveTo(20, -70, 22, -52); x.quadraticCurveTo(8, -46, 10, -30); x.quadraticCurveTo(16, -10, 12, 0); x.closePath(); x.fill();
    x.restore();
  }
  // eaves as platforms
  for (const p of stage.plats) {
    x.fillStyle = '#0b0d16';
    x.beginPath(); x.moveTo(p.x - 30, p.y + 22); x.quadraticCurveTo(p.x, p.y + 4, p.x + 10, p.y); x.lineTo(p.x + p.w - 10, p.y); x.quadraticCurveTo(p.x + p.w, p.y + 4, p.x + p.w + 30, p.y + 22); x.lineTo(p.x + p.w + 20, p.y + 30); x.lineTo(p.x - 20, p.y + 30); x.closePath(); x.fill();
    x.fillStyle = pal.ink; x.fillRect(p.x, p.y - 2, p.w, 4);
    x.strokeStyle = pal.ink; x.globalAlpha = 0.3; x.lineWidth = 1.5;
    for (let px = p.x; px < p.x + p.w; px += 14) { x.beginPath(); x.moveTo(px, p.y + 4); x.lineTo(px, p.y + 26); x.stroke(); }
    x.globalAlpha = 1;
  }
  // ridge pole the princess is tied to
  x.fillStyle = '#3a2a1e'; x.fillRect(1180, 400, 12, FLOOR - 400);
  grain(x, W, R, pal);
  return c;
}

// ------------------------------------------------------------ the castle from outside
// Tier k (0 = bottom) is floor k + 1. Returns the tier geometry so cutscenes can put figures on it.
export const TIER_H = 150;
export function tierBox(k, cx) {
  const w = 620 - k * 26;
  return { x0: cx - w / 2, x1: cx + w / 2, top: -(k + 1) * TIER_H, bot: -k * TIER_H, w };
}
export function drawCastle(x, cx, baseY, pal, opts = {}) {
  const tiers = FLOORS;
  x.save(); x.translate(0, baseY);
  // stone base
  x.fillStyle = '#4a4440';
  x.beginPath(); x.moveTo(cx - 420, 160); x.lineTo(cx - 340, 0); x.lineTo(cx + 340, 0); x.lineTo(cx + 420, 160); x.closePath(); x.fill();
  x.strokeStyle = '#2a2420'; x.lineWidth = 2;
  for (let r = 0; r < 4; r++) { x.beginPath(); x.moveTo(cx - 340 - r * 20, r * 40); x.lineTo(cx + 340 + r * 20, r * 40); x.stroke(); }
  for (let k = 0; k < tiers; k++) {
    const b = tierBox(k, cx);
    const lit = opts.lit && opts.lit(k);
    x.fillStyle = k % 2 ? '#efe6d4' : '#e6dcc6';
    x.fillRect(b.x0 + 16, b.top + 34, b.w - 32, TIER_H - 34);
    // windows
    for (let wx = b.x0 + 50; wx < b.x1 - 60; wx += 90) {
      x.fillStyle = lit ? '#ffb24a' : '#1a1410';
      x.fillRect(wx, b.top + 66, 34, 44);
    }
    // broken window marker for floors you've cleared
    if (opts.broken && opts.broken(k)) { x.strokeStyle = '#c8281e'; x.lineWidth = 3; x.beginPath(); x.moveTo(b.x0 + 46, b.top + 62); x.lineTo(b.x0 + 88, b.top + 114); x.moveTo(b.x0 + 88, b.top + 62); x.lineTo(b.x0 + 46, b.top + 114); x.stroke(); }
    // curved roof eave on top of the tier
    x.fillStyle = '#16120f';
    const ex = 42, y0 = b.top + 34;
    x.beginPath(); x.moveTo(b.x0 - ex, y0 + 6); x.quadraticCurveTo(b.x0 + 10, y0 - 4, b.x0 + 30, y0 - 26); x.lineTo(b.x1 - 30, y0 - 26); x.quadraticCurveTo(b.x1 - 10, y0 - 4, b.x1 + ex, y0 + 6); x.lineTo(b.x1 + ex - 10, y0 + 14); x.lineTo(b.x0 - ex + 10, y0 + 14); x.closePath(); x.fill();
  }
  // top roof and the ridge
  const tb = tierBox(tiers - 1, cx);
  x.fillStyle = '#16120f';
  x.beginPath(); x.moveTo(tb.x0 - 50, tb.top + 10); x.quadraticCurveTo(cx, tb.top - 90, tb.x1 + 50, tb.top + 10); x.closePath(); x.fill();
  x.fillStyle = '#c9962a'; x.fillRect(cx - 120, tb.top - 50, 12, 18); x.fillRect(cx + 108, tb.top - 50, 12, 18);
  x.restore();
}

// ------------------------------------------------------------ figures
// Joint poses (facing right, feet at 0,0, y up is negative).
const POSES = {
  idle: { hip: [0, -40], neck: [3, -72], kneeA: [-9, -20], footA: [-13, 0], kneeB: [11, -21], footB: [15, 0], handA: [18, -50], handB: [12, -48], sword: -0.6 },
  walkA: { hip: [0, -41], neck: [3, -73], kneeA: [-12, -21], footA: [-20, 0], kneeB: [12, -22], footB: [18, -2], handA: [16, -52], handB: [8, -50], sword: -0.8 },
  walkB: { hip: [0, -40], neck: [3, -72], kneeA: [4, -21], footA: [2, 0], kneeB: [-2, -22], footB: [-4, -1], handA: [14, -52], handB: [10, -50], sword: -0.7 },
  air: { hip: [0, -44], neck: [4, -76], kneeA: [-4, -30], footA: [-14, -16], kneeB: [12, -30], footB: [4, -14], handA: [20, -56], handB: [14, -54], sword: -0.3 },
  dash: { hip: [0, -40], neck: [16, -66], kneeA: [-14, -26], footA: [-34, -18], kneeB: [-4, -22], footB: [-24, -6], handA: [36, -58], handB: [30, -56], sword: 0 },
  slash: { hip: [0, -40], neck: [10, -70], kneeA: [-10, -20], footA: [-20, 0], kneeB: [14, -18], footB: [22, 0], handA: [26, -60], handB: [20, -58], sword: 0.9 },
  raise: { hip: [0, -40], neck: [-3, -72], kneeA: [-11, -20], footA: [-17, 0], kneeB: [10, -21], footB: [16, 0], handA: [2, -100], handB: [-2, -98], sword: -2.3 },
  aim: { hip: [0, -40], neck: [-2, -72], kneeA: [-10, -20], footA: [-14, 0], kneeB: [10, -20], footB: [14, 0], handA: [24, -60], handB: [6, -60], sword: 0 },
  crouch: { hip: [0, -26], neck: [8, -56], kneeA: [-14, -16], footA: [-12, 0], kneeB: [14, -18], footB: [12, 0], handA: [22, -36], handB: [16, -34], sword: -1.2 },
  climb: { hip: [0, -40], neck: [2, -72], kneeA: [10, -30], footA: [6, -18], kneeB: [10, -14], footB: [4, 0], handA: [8, -100], handB: [10, -84], sword: -1.6 },
  stagger: { hip: [0, -38], neck: [-10, -66], kneeA: [-12, -20], footA: [-20, 0], kneeB: [8, -20], footB: [16, 0], handA: [-16, -46], handB: [-4, -40], sword: 1.9 },
};
export function lerpPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t] : a[k] + (b[k] - a[k]) * t;
  return o;
}
export function pose(name) { return POSES[name]; }

function limb(x, a, b, c, w) { x.lineWidth = w; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.stroke(); }
const isLight = (c) => { if (!c) return false; const n = parseInt(c.slice(1), 16); return ((n >> 16) & 255) * 0.3 + ((n >> 8) & 255) * 0.59 + (n & 255) * 0.11 > 150; };

// the robe: a gi over the torso flaring into hakama at the knees, with a pattern
function drawRobe(x, P, o, L) {
  const col = L.robe || o.ink;
  if (!L.robe && (!L.pattern || L.pattern === 'plain')) return;   // the plain ink robe is the original stick figure
  const path = () => {
    x.beginPath();
    x.moveTo(P.neck[0] - 9, P.neck[1] + 3); x.lineTo(P.neck[0] + 9, P.neck[1] + 3);
    x.lineTo(P.hip[0] + 12, P.hip[1]); x.lineTo(P.kneeB[0] + 9, P.kneeB[1] + 4);
    x.lineTo(P.kneeA[0] - 9, P.kneeA[1] + 4); x.lineTo(P.hip[0] - 12, P.hip[1]); x.closePath();
  };
  x.save();
  path(); x.fillStyle = col; x.fill();
  if (L.pattern && L.pattern !== 'plain') {
    x.clip();
    const pc = isLight(col) ? '#16120f' : '#f4efe4';
    x.fillStyle = pc; x.strokeStyle = pc; x.globalAlpha *= 0.55; x.lineWidth = 1.6;
    const y0 = P.neck[1] - 4, y1 = Math.max(P.kneeA[1], P.kneeB[1]) + 8;
    if (L.pattern === 'stripes') for (let xx = -30; xx < 30; xx += 6) { x.fillRect(xx, y0, 2.4, y1 - y0); }
    else if (L.pattern === 'checks') for (let yy = y0; yy < y1; yy += 6) for (let xx = -30; xx < 30; xx += 6) { if (((xx + 30) / 6 + (yy - y0) / 6) % 2 < 1) x.fillRect(xx, yy, 6, 6); }
    else if (L.pattern === 'dots') for (let yy = y0; yy < y1; yy += 7) for (let xx = -30 + ((yy / 7) % 2) * 3.5; xx < 30; xx += 7) { x.beginPath(); x.arc(xx, yy, 1.6, 0, 7); x.fill(); }
    else if (L.pattern === 'waves') for (let yy = y0; yy < y1 + 6; yy += 6) for (let xx = -30 + ((yy / 6) % 2) * 4; xx < 30; xx += 8) { x.beginPath(); x.arc(xx, yy, 4, Math.PI, 0); x.stroke(); }
    else if (L.pattern === 'cranes') for (const [cx, cy] of [[-4, P.neck[1] + 10], [5, P.hip[1] - 6], [-3, P.hip[1] + 10]]) { x.beginPath(); x.moveTo(cx - 6, cy); x.quadraticCurveTo(cx, cy - 6, cx + 6, cy); x.quadraticCurveTo(cx, cy - 2, cx - 6, cy); x.fill(); x.fillStyle = '#c8281e'; x.fillRect(cx - 1, cy - 3, 2, 2); x.fillStyle = pc; }
  }
  x.restore();
  x.save(); path(); x.strokeStyle = o.ink; x.lineWidth = 1.6; x.stroke(); x.restore();
}

function drawHead(x, hx, hy, o, L) {
  const hat = L.hat || 'kasa';
  x.fillStyle = o.ink;
  if (hat !== 'hood') { x.beginPath(); x.arc(hx, hy, 10, 0, Math.PI * 2); x.fill(); }
  const tail = (col) => { x.strokeStyle = col; x.lineWidth = 3; x.beginPath(); x.moveTo(hx - 8, hy - 3); x.lineTo(hx - 21, hy + 3 + Math.sin(o.t * 12) * 3); x.moveTo(hx - 8, hy - 2); x.lineTo(hx - 19, hy + 9 + Math.sin(o.t * 12 + 1) * 3); x.stroke(); };
  if (hat === 'kasa') {
    x.fillStyle = o.ink;
    x.beginPath(); x.moveTo(hx - 24, hy - 2); x.quadraticCurveTo(hx, hy - 26, hx + 24, hy - 2); x.quadraticCurveTo(hx, hy - 7, hx - 24, hy - 2); x.fill();
    x.strokeStyle = L.scarf || o.accent; x.lineWidth = 3; x.beginPath(); x.moveTo(hx - 8, hy - 2); x.lineTo(hx - 20, hy + 4 + Math.sin(o.t * 12) * 3); x.stroke();
  } else if (hat === 'band') {
    x.fillStyle = L.scarf || o.accent; x.fillRect(hx - 10, hy - 6, 20, 4.5);
    tail(L.scarf || o.accent);
  } else if (hat === 'hood') {
    x.fillStyle = o.hood || o.ink; x.beginPath(); x.arc(hx - 1, hy - 1, 12.5, 0, 7); x.fill();
    x.beginPath(); x.moveTo(hx - 10, hy - 6); x.quadraticCurveTo(hx - 22, hy - 4, hx - 26, hy + 6 + Math.sin(o.t * 9) * 2); x.lineTo(hx - 8, hy + 2); x.fill();
    x.fillStyle = o.eyes || '#f4efe4'; x.fillRect(hx + 1, hy - 3.5, 10, 3.2);
    if (o.eyes) { x.fillStyle = o.eyes; x.beginPath(); x.arc(hx + 7, hy - 2, 2.2, 0, 7); x.fill(); }
  } else if (hat === 'topknot') {
    x.fillStyle = o.ink; x.beginPath(); x.ellipse(hx - 2, hy - 12, 5, 3.5, -0.3, 0, 7); x.fill();
    x.fillRect(hx - 9, hy - 11, 4, 6);
  } else if (hat === 'kabuto') {
    x.fillStyle = o.ink; x.beginPath(); x.arc(hx, hy - 3, 13.5, Math.PI, 0); x.fill();
    x.fillRect(hx - 16, hy - 4, 32, 4);
    x.strokeStyle = '#e0aa30'; x.lineWidth = 3.5;
    x.beginPath(); x.moveTo(hx - 4, hy - 14); x.quadraticCurveTo(hx - 18, hy - 26, hx - 8, hy - 38); x.moveTo(hx + 4, hy - 14); x.quadraticCurveTo(hx + 18, hy - 26, hx + 10, hy - 38); x.stroke();
  } else if (hat === 'oni') {
    x.fillStyle = '#e8dcc0'; x.strokeStyle = o.ink; x.lineWidth = 1.5;
    for (const d of [-1, 1]) { x.beginPath(); x.moveTo(hx + d * 4 - 3, hy - 8); x.quadraticCurveTo(hx + d * 10, hy - 20, hx + d * 6, hy - 27); x.lineTo(hx + d * 4 + 4, hy - 8); x.closePath(); x.fill(); x.stroke(); }
  }
  // mask (on the face side, +x)
  const m = L.mask || 'none';
  if (m === 'cloth') { x.fillStyle = '#3a3440'; x.beginPath(); x.moveTo(hx - 2, hy); x.lineTo(hx + 11, hy - 1); x.lineTo(hx + 9, hy + 8); x.lineTo(hx - 3, hy + 9); x.closePath(); x.fill(); }
  else if (m === 'kitsune') {
    x.fillStyle = '#fbf6ec'; x.strokeStyle = o.ink; x.lineWidth = 1.3;
    x.beginPath(); x.moveTo(hx - 3, hy - 9); x.lineTo(hx + 7, hy - 6); x.lineTo(hx + 17, hy + 2); x.lineTo(hx + 6, hy + 8); x.lineTo(hx - 3, hy + 7); x.closePath(); x.fill(); x.stroke();
    x.fillStyle = '#c8281e'; x.fillRect(hx + 3, hy - 4, 5, 1.8); x.beginPath(); x.arc(hx + 16, hy + 2, 1.6, 0, 7); x.fill();
    x.beginPath(); x.moveTo(hx - 1, hy - 9); x.lineTo(hx + 2, hy - 17); x.lineTo(hx + 5, hy - 8); x.fill();
  } else if (m === 'oni') {
    x.fillStyle = '#b3201a'; x.beginPath(); x.ellipse(hx + 4, hy + 1, 8.5, 9.5, 0, 0, 7); x.fill();
    x.fillStyle = '#ffe9b0'; x.fillRect(hx + 3, hy - 4, 4, 2.4);
    x.fillStyle = '#fbf6ec'; x.beginPath(); x.moveTo(hx + 4, hy + 5); x.lineTo(hx + 6, hy + 10); x.lineTo(hx + 8, hy + 5); x.fill();
  } else if (m === 'menpo') {
    x.fillStyle = '#5c5e66'; x.beginPath(); x.moveTo(hx - 2, hy + 1); x.lineTo(hx + 12, hy); x.lineTo(hx + 9, hy + 9); x.lineTo(hx - 2, hy + 10); x.closePath(); x.fill();
    x.strokeStyle = '#1a1a1e'; x.lineWidth = 1; for (const yy of [3, 6]) { x.beginPath(); x.moveTo(hx + 2, hy + yy); x.lineTo(hx + 10, hy + yy); x.stroke(); }
  }
}

// draw a figure at (px, py) feet; o = { pose, face, rot, scale, ink, paper, accent, kind, t, look }
export function drawFigure(x, px, py, o) {
  const P = o.pose, s = o.scale || 1;
  x.save();
  x.translate(px, py);
  if (o.rot) { x.translate(0, -40 * s); x.rotate(o.rot); x.translate(0, 40 * s); }
  x.scale(s * o.face, s);
  x.strokeStyle = o.ink; x.fillStyle = o.ink; x.lineCap = 'round'; x.lineJoin = 'round';
  const k = o.kind || 'player';
  if (k === 'flyer') { drawLantern(x, o); x.restore(); return; }
  if (k === 'princess') { drawPrincess(x, o); x.restore(); return; }
  const L = o.look || {};
  const hero = k === 'player' || k === 'ninja';
  limb(x, P.hip, P.kneeA, P.footA, 7);
  x.lineWidth = 11; x.beginPath(); x.moveTo(P.hip[0], P.hip[1]); x.lineTo(P.neck[0], P.neck[1]); x.stroke();
  if (k === 'general') {
    x.fillStyle = o.ink;
    x.beginPath(); x.moveTo(P.neck[0] - 16, P.neck[1] + 4); x.lineTo(P.neck[0] + 16, P.neck[1] + 4); x.lineTo(P.hip[0] + 14, P.hip[1] + 6); x.lineTo(P.hip[0] - 14, P.hip[1] + 6); x.closePath(); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 2;
    for (let i = 1; i < 4; i++) { const yy = P.neck[1] + 4 + (P.hip[1] - P.neck[1]) * i / 4; x.beginPath(); x.moveTo(-13, yy); x.lineTo(13, yy); x.stroke(); }
    x.strokeStyle = o.ink;
  }
  limb(x, P.hip, P.kneeB, P.footB, 7);
  if (hero) {
    drawRobe(x, P, o, L);
    // sash knot at the hip
    const sc = L.sash || o.accent;
    x.strokeStyle = sc; x.lineWidth = 5; x.lineCap = 'butt';
    const ang = Math.atan2(P.neck[1] - P.hip[1], P.neck[0] - P.hip[0]) + Math.PI / 2;
    const hy = P.hip[1] - 4, hxx = P.hip[0] + (P.neck[0] - P.hip[0]) * 0.1;
    x.beginPath(); x.moveTo(hxx - Math.cos(ang) * 11, hy - Math.sin(ang) * 11); x.lineTo(hxx + Math.cos(ang) * 11, hy + Math.sin(ang) * 11); x.stroke();
    x.lineWidth = 3; x.lineCap = 'round';
    x.beginPath(); x.moveTo(hxx - 8, hy); x.lineTo(hxx - 16, hy + 10 + Math.sin(o.t * 10) * 2); x.stroke();
    x.strokeStyle = o.ink;
  }
  if (k === 'bomber') {
    x.save(); x.translate(P.neck[0] - 18, P.neck[1] + 16);
    x.fillStyle = o.ink; x.beginPath(); x.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 3; x.beginPath(); x.moveTo(-14, -6); x.lineTo(14, -6); x.moveTo(-14, 7); x.lineTo(14, 7); x.stroke();
    x.strokeStyle = o.ink; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -19); x.quadraticCurveTo(6, -28, 2, -34); x.stroke();
    x.fillStyle = (o.t * 12) % 2 < 1 ? '#ffcf3a' : o.accent; x.beginPath(); x.arc(2, -35, 4, 0, 7); x.fill();
    x.restore();
  }
  // arms
  x.strokeStyle = o.ink; x.lineWidth = 6;
  x.beginPath(); x.moveTo(P.neck[0], P.neck[1] + 4); x.lineTo((P.neck[0] + P.handB[0]) / 2 - 4, (P.neck[1] + P.handB[1]) / 2 + 6); x.lineTo(P.handB[0], P.handB[1]); x.stroke();
  x.beginPath(); x.moveTo(P.neck[0], P.neck[1] + 4); x.lineTo((P.neck[0] + P.handA[0]) / 2, (P.neck[1] + P.handA[1]) / 2 + 8); x.lineTo(P.handA[0], P.handA[1]); x.stroke();
  // weapon
  if (hero || k === 'general' || k === 'grunt' || k === 'bomber') {
    const len = k === 'player' ? 46 : k === 'ninja' ? 54 : k === 'general' ? 56 : 30;
    const a = P.sword;
    const hx = P.handA[0], hy = P.handA[1];
    x.strokeStyle = o.ink; x.lineWidth = hero ? 3.5 : 5;
    x.beginPath(); x.moveTo(hx - Math.cos(a) * 8, hy - Math.sin(a) * 8); x.lineTo(hx + Math.cos(a) * len, hy + Math.sin(a) * len); x.stroke();
    if (hero) { x.strokeStyle = k === 'ninja' ? o.accent : o.paper; x.lineWidth = 1.2; x.beginPath(); x.moveTo(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6 - 1); x.lineTo(hx + Math.cos(a) * (len - 4), hy + Math.sin(a) * (len - 4) - 1); x.stroke(); }
    x.strokeStyle = o.ink;
  } else if (k === 'archer') {
    x.lineWidth = 3; x.beginPath(); x.arc(P.handA[0] - 6, P.handA[1], 26, -1.2, 1.2); x.stroke();
    x.lineWidth = 1; x.beginPath(); x.moveTo(P.handA[0] - 6 + Math.cos(-1.2) * 26, P.handA[1] + Math.sin(-1.2) * 26); x.lineTo(P.handB[0] - (o.draw || 0) * 14, P.handB[1]); x.lineTo(P.handA[0] - 6 + Math.cos(1.2) * 26, P.handA[1] + Math.sin(1.2) * 26); x.stroke();
  } else if (k === 'shield') {
    x.fillStyle = o.ink; x.fillRect(P.handA[0] - 2, P.handA[1] - 28, 12, 56);
    x.fillStyle = o.accent; x.beginPath(); x.arc(P.handA[0] + 4, P.handA[1], 5, 0, 7); x.fill();
  }
  // head
  const hx = P.neck[0] + 2, hy = P.neck[1] - 13;
  if (hero) drawHead(x, hx, hy, o, L);
  else {
    x.fillStyle = o.mask; x.strokeStyle = o.ink; x.lineWidth = 3;
    x.beginPath(); x.arc(hx, hy, k === 'general' ? 13 : 11, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = o.accent;
    x.beginPath(); x.moveTo(hx + 1, hy - 3); x.lineTo(hx + 8, hy - 1); x.lineTo(hx + 1, hy + 1); x.fill();
    x.beginPath(); x.moveTo(hx - 6, hy - 3); x.lineTo(hx - 1, hy - 1); x.lineTo(hx - 6, hy + 1); x.fill();
    x.fillStyle = o.ink;
    if (k === 'general') {
      x.beginPath(); x.arc(hx, hy - 4, 15, Math.PI, 0); x.fill();
      x.strokeStyle = o.accent; x.lineWidth = 4;
      x.beginPath(); x.moveTo(hx - 6, hy - 14); x.quadraticCurveTo(hx - 22, hy - 30, hx - 12, hy - 40); x.moveTo(hx + 6, hy - 14); x.quadraticCurveTo(hx + 22, hy - 30, hx + 12, hy - 40); x.stroke();
    } else if (k === 'archer') {
      x.beginPath(); x.moveTo(hx - 16, hy - 6); x.lineTo(hx, hy - 22); x.lineTo(hx + 16, hy - 6); x.closePath(); x.fill();
    } else {
      x.fillRect(hx - 12, hy - 9, 24, 5);
      x.lineWidth = 3; x.strokeStyle = o.ink; x.beginPath(); x.moveTo(hx - 10, hy - 6); x.lineTo(hx - 22, hy - 2 + Math.sin(o.t * 8) * 3); x.stroke();
    }
  }
  x.restore();
}

// Princess Hana: a kimono bell, wide sleeves, gold obi, hair bun and pin
function drawPrincess(x, o) {
  const sway = Math.sin(o.t * 2) * 1.5;
  x.fillStyle = o.kimono || '#d8506a'; x.strokeStyle = '#16120f'; x.lineWidth = 2;
  x.beginPath(); x.moveTo(-6, -70); x.lineTo(6, -70); x.quadraticCurveTo(14, -30, 20 + sway, 0); x.lineTo(-20 + sway, 0); x.quadraticCurveTo(-14, -30, -6, -70); x.closePath(); x.fill(); x.stroke();
  // flowers
  x.fillStyle = '#fbe6ee';
  for (const [fx, fy] of [[-8, -20], [6, -12], [-2, -36], [10, -30]]) { x.beginPath(); x.arc(fx, fy, 2.4, 0, 7); x.fill(); }
  // sleeves (tied: hands behind)
  x.fillStyle = o.kimono || '#d8506a';
  x.beginPath(); x.moveTo(-6, -66); x.lineTo(-22, -52); x.lineTo(-18, -38); x.lineTo(-6, -48); x.closePath(); x.fill(); x.stroke();
  x.fillStyle = '#e0aa30'; x.fillRect(-11, -50, 22, 8);
  // head
  x.fillStyle = '#fbf2e2'; x.beginPath(); x.arc(2, -80, 9, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#16120f'; x.beginPath(); x.arc(-2, -84, 9, Math.PI * 0.9, Math.PI * 2.1); x.fill();
  x.beginPath(); x.arc(-4, -94, 6, 0, 7); x.fill();
  x.strokeStyle = '#e0aa30'; x.lineWidth = 2; x.beginPath(); x.moveTo(-12, -98); x.lineTo(6, -90); x.stroke();
  x.fillStyle = '#c8281e'; x.beginPath(); x.arc(-12, -98, 2.6, 0, 7); x.fill();
  if (o.tied) { x.strokeStyle = '#8a7050'; x.lineWidth = 2; for (const yy of [-56, -30, -12]) { x.beginPath(); x.moveTo(-22, yy); x.lineTo(20, yy + 2); x.stroke(); } }
}

function drawLantern(x, o) {
  const bob = Math.sin(o.t * 3) * 4;
  x.translate(0, -40 + bob);
  x.fillStyle = o.mask; x.strokeStyle = o.ink; x.lineWidth = 3;
  x.beginPath(); x.ellipse(0, 0, 20, 26, 0, 0, Math.PI * 2); x.fill(); x.stroke();
  x.lineWidth = 1.5;
  for (const yy of [-14, -5, 5, 14]) { x.beginPath(); x.ellipse(0, yy, 19 * Math.cos(Math.asin(Math.min(1, Math.abs(yy) / 26))), 2.5, 0, 0, Math.PI); x.stroke(); }
  x.fillStyle = o.ink; x.fillRect(-10, -30, 20, 6); x.fillRect(-10, 24, 20, 6);
  x.fillStyle = o.accent; x.beginPath(); x.moveTo(-9, -6); x.lineTo(-2, -3); x.lineTo(-9, -1); x.fill(); x.beginPath(); x.moveTo(9, -6); x.lineTo(2, -3); x.lineTo(9, -1); x.fill();
  x.beginPath(); x.ellipse(0, 9, 5, 7, 0, 0, Math.PI * 2); x.fill();
  x.strokeStyle = o.accent; x.lineWidth = 2;
  for (const dx of [-5, 0, 5]) { x.beginPath(); x.moveTo(dx, 30); x.lineTo(dx + Math.sin(o.t * 5 + dx) * 4, 44); x.stroke(); }
}

// red ink splat, stamped onto the decal layer
export function splat(x, px, py, size, color, dirX = 0, dirY = 0) {
  x.fillStyle = color;
  x.globalAlpha = 0.9;
  x.beginPath(); x.arc(px, py, size * (0.5 + Math.random() * 0.3), 0, 7); x.fill();
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * Math.PI * 2, d = size * (0.4 + Math.random() * 1.6);
    const sx = px + Math.cos(a) * d + dirX * d * 0.8, sy = py + Math.sin(a) * d + dirY * d * 0.8;
    x.beginPath(); x.arc(sx, sy, Math.random() * size * 0.28 + 1, 0, 7); x.fill();
  }
  for (let k = 0; k < 4; k++) {
    const a = Math.atan2(dirY, dirX) + (Math.random() - 0.5) * 0.8, d = size * (1.5 + Math.random() * 2);
    x.beginPath(); x.ellipse(px + Math.cos(a) * d, py + Math.sin(a) * d, 2 + Math.random() * 4, 1.2, a, 0, 7); x.fill();
  }
  x.globalAlpha = 1;
}

// a red hanko stamp with a kanji
export function stamp(x, cx, cy, size, ch, color, paper, rot = -0.12) {
  x.save(); x.translate(cx, cy); x.rotate(rot);
  x.fillStyle = color;
  x.beginPath(); x.roundRect(-size / 2, -size / 2, size, size, size * 0.12); x.fill();
  x.strokeStyle = paper; x.lineWidth = size * 0.04; x.strokeRect(-size * 0.4, -size * 0.4, size * 0.8, size * 0.8);
  x.fillStyle = paper; x.font = `${Math.round(size * 0.62)}px ${BRUSH}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(ch, 0, size * 0.04);
  x.restore();
}
