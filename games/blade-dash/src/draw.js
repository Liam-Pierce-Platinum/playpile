// Ink-on-paper drawing: the paper, painted backdrops, brush-stroke ground,
// stick-ink samurai figures, red ink splats and hanko stamps.
import { W, H, FLOOR } from './levels.js';

export const BRUSH = '"Yuji Syuku", "Noto Serif JP", serif';
export const DISPLAY = '"Shojumaru", "Yuji Syuku", serif';

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ------------------------------------------------------------ backdrop (pre-rendered once per room)
export function paintRoom(stage, pal) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const R = seeded(stage.n * 31 + 7 + stage.chapter * 1000);
  // paper
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.paper); g.addColorStop(1, pal.paper2);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // sun / moon
  const sx = 860 + R() * 200, sy = 170 + R() * 60, sr = 95 + R() * 30;
  x.globalAlpha = stage.chapter === 2 ? 0.9 : 0.85;
  x.fillStyle = pal.sun; x.beginPath(); x.arc(sx, sy, sr, 0, Math.PI * 2); x.fill();
  x.globalAlpha = 0.25; x.lineWidth = 6; x.strokeStyle = pal.sun;
  for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(sx + (R() - 0.5) * 6, sy + (R() - 0.5) * 6, sr + 4 + R() * 6, R() * 6, R() * 6 + 4.5); x.stroke(); }
  x.globalAlpha = 1;
  if (stage.chapter === 2) { // stars
    x.fillStyle = pal.ink;
    for (let k = 0; k < 90; k++) { x.globalAlpha = 0.2 + R() * 0.5; x.fillRect(R() * W, R() * 420, 2, 2); }
    x.globalAlpha = 1;
  }
  // two ranges of ink-wash mountains
  for (const [base, amp, alpha] of [[430, 150, 0.18], [520, 110, 0.32]]) {
    x.fillStyle = pal.wash; x.globalAlpha = alpha;
    x.beginPath(); x.moveTo(0, H);
    let y = base;
    for (let px = 0; px <= W + 40; px += 40) { y = base - Math.abs(Math.sin(px * 0.004 + R() * 0.6 + base)) * amp - R() * 30; x.lineTo(px, y); }
    x.lineTo(W, H); x.closePath(); x.fill();
    // misty bottom
    const m = x.createLinearGradient(0, base - 40, 0, base + 120);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, pal.paper2);
    x.globalAlpha = 0.8; x.fillStyle = m; x.fillRect(0, base - 40, W, 200);
  }
  x.globalAlpha = 1;
  // chapter scenery
  x.strokeStyle = pal.ink; x.fillStyle = pal.ink; x.lineCap = 'round';
  if (stage.chapter === 0) {
    for (let k = 0; k < 14; k++) {
      const bx = R() * W, w = 10 + R() * 12, a = 0.08 + R() * 0.25;
      x.globalAlpha = a; x.lineWidth = w;
      x.beginPath(); x.moveTo(bx, H); x.lineTo(bx + (R() - 0.5) * 30, -10); x.stroke();
      x.lineWidth = 2; x.globalAlpha = a * 1.4;
      for (let y = H - 40; y > 0; y -= 70 + R() * 40) { x.beginPath(); x.moveTo(bx - w / 2 - 2, y); x.lineTo(bx + w / 2 + 2, y - 3); x.stroke(); }
      for (let l = 0; l < 4; l++) {
        const ly = 80 + R() * 400, dir = R() < 0.5 ? -1 : 1;
        x.globalAlpha = a * 1.2;
        x.beginPath(); x.ellipse(bx + dir * 26, ly, 26, 5, dir * 0.4, 0, Math.PI * 2); x.fill();
      }
    }
  } else if (stage.chapter === 1) {
    // a castle on the far hill
    const cx = 200 + R() * 260, cy = 420;
    x.globalAlpha = 0.42;
    const tiers = [[150, 30], [120, 28], [92, 26], [64, 24]];
    let y = cy;
    x.fillRect(cx - 80, cy, 160, 60);
    for (const [w, h] of tiers) {
      x.beginPath(); x.moveTo(cx - w / 2 - 22, y); x.quadraticCurveTo(cx - w / 2, y - 8, cx - w / 2 + 12, y - h); x.lineTo(cx + w / 2 - 12, y - h); x.quadraticCurveTo(cx + w / 2, y - 8, cx + w / 2 + 22, y); x.closePath(); x.fill();
      x.fillRect(cx - w / 2 + 16, y - h - 22, w - 32, 22);
      y -= h + 22;
    }
    // cherry branch from the corner
    x.globalAlpha = 0.85; x.lineWidth = 9;
    x.beginPath(); x.moveTo(W + 10, 40); x.quadraticCurveTo(W - 160, 60, W - 300, 150); x.stroke();
    x.lineWidth = 4; x.beginPath(); x.moveTo(W - 160, 80); x.quadraticCurveTo(W - 210, 130, W - 230, 190); x.stroke();
    x.fillStyle = '#f2a0b8';
    for (let k = 0; k < 60; k++) { x.globalAlpha = 0.6 + R() * 0.4; x.beginPath(); x.arc(W - 330 + R() * 320, 30 + R() * 190, 3 + R() * 6, 0, 7); x.fill(); }
  } else {
    // torii gate and lanterns
    const tx = 180 + R() * 200;
    x.globalAlpha = 0.45; x.fillStyle = pal.accent;
    x.fillRect(tx, 300, 16, 240); x.fillRect(tx + 180, 300, 16, 240);
    x.beginPath(); x.moveTo(tx - 40, 300); x.quadraticCurveTo(tx + 98, 270, tx + 236, 300); x.lineTo(tx + 236, 318); x.quadraticCurveTo(tx + 98, 290, tx - 40, 318); x.closePath(); x.fill();
    x.fillRect(tx - 10, 340, 216, 12);
  }
  x.globalAlpha = 1;
  // ground: fat brush masses with ragged tops
  const inkG = (x0, x1) => {
    x.fillStyle = pal.ink;
    x.beginPath(); x.moveTo(x0, H + 5);
    x.lineTo(x0 - 2, FLOOR + 6);
    for (let px = x0; px <= x1; px += 12) x.lineTo(px, FLOOR - 2 + (R() - 0.5) * 5);
    x.lineTo(x1 + 2, FLOOR + 6); x.lineTo(x1, H + 5); x.closePath(); x.fill();
    x.globalAlpha = 0.18; x.strokeStyle = pal.paper; x.lineWidth = 2;
    for (let k = 0; k < (x1 - x0) / 30; k++) { const sx2 = x0 + R() * (x1 - x0), sy2 = FLOOR + 10 + R() * 60; x.beginPath(); x.moveTo(sx2, sy2); x.lineTo(sx2 + 20 + R() * 40, sy2 + (R() - 0.5) * 4); x.stroke(); }
    x.globalAlpha = 1;
    if (stage.chapter === 0) { // grass tufts
      x.strokeStyle = pal.ink; x.lineWidth = 2;
      for (let px = x0 + 6; px < x1 - 6; px += 9 + R() * 14) { x.beginPath(); x.moveTo(px, FLOOR); x.lineTo(px + (R() - 0.5) * 8, FLOOR - 6 - R() * 9); x.stroke(); }
    }
  };
  for (const [a, b] of stage.floor) inkG(a, b);
  // spikes in the gaps
  for (let k = 0; k < stage.floor.length - 1; k++) {
    const a = stage.floor[k][1], b = stage.floor[k + 1][0];
    x.fillStyle = pal.ink;
    for (let px = a + 4; px < b - 4; px += 18) { x.beginPath(); x.moveTo(px, H); x.lineTo(px + 9, H - 34 - R() * 10); x.lineTo(px + 18, H); x.fill(); }
  }
  // floating platforms: thick brush strokes
  for (const p of stage.plats) {
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
    // dripping ink under the platform
    for (let k = 0; k < 3; k++) { const dx = p.x + 20 + R() * (p.w - 40); x.beginPath(); x.moveTo(dx - 3, p.y + p.h - 2); x.quadraticCurveTo(dx, p.y + p.h + 14 + R() * 12, dx + 3, p.y + p.h - 2); x.fill(); }
  }
  // paper grain on top of everything
  const img = x.getImageData(0, 0, W, H), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.globalAlpha = 0.06; x.strokeStyle = pal.ink; x.lineWidth = 1;
  for (let k = 0; k < 140; k++) { const fx = R() * W, fy = R() * H; x.beginPath(); x.moveTo(fx, fy); x.quadraticCurveTo(fx + 8, fy + R() * 10, fx + 20 + R() * 20, fy + (R() - 0.5) * 8); x.stroke(); }
  x.globalAlpha = 1;
  const v = x.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(40,20,10,0.28)');
  x.fillStyle = v; x.fillRect(0, 0, W, H);
  return c;
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
};
export function lerpPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t] : a[k] + (b[k] - a[k]) * t;
  return o;
}
export function pose(name) { return POSES[name]; }

function limb(x, a, b, c, w) { x.lineWidth = w; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.stroke(); }

// draw a figure at (px, py) feet; o = { pose, face, rot, scale, ink, paper, accent, type, kind, t, scarf }
export function drawFigure(x, px, py, o) {
  const P = o.pose, s = o.scale || 1;
  x.save();
  x.translate(px, py);
  if (o.rot) { x.translate(0, -40 * s); x.rotate(o.rot); x.translate(0, 40 * s); }
  x.scale(s * o.face, s);
  x.strokeStyle = o.ink; x.fillStyle = o.ink; x.lineCap = 'round'; x.lineJoin = 'round';
  const k = o.kind || 'player';
  if (k === 'flyer') { drawLantern(x, o); x.restore(); return; }
  // back leg, torso, front leg
  limb(x, P.hip, P.kneeA, P.footA, 7);
  x.lineWidth = 11; x.beginPath(); x.moveTo(P.hip[0], P.hip[1]); x.lineTo(P.neck[0], P.neck[1]); x.stroke();
  if (k === 'general') { // armour plates
    x.fillStyle = o.ink;
    x.beginPath(); x.moveTo(P.neck[0] - 16, P.neck[1] + 4); x.lineTo(P.neck[0] + 16, P.neck[1] + 4); x.lineTo(P.hip[0] + 14, P.hip[1] + 6); x.lineTo(P.hip[0] - 14, P.hip[1] + 6); x.closePath(); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 2;
    for (let i = 1; i < 4; i++) { const yy = P.neck[1] + 4 + (P.hip[1] - P.neck[1]) * i / 4; x.beginPath(); x.moveTo(-13, yy); x.lineTo(13, yy); x.stroke(); }
    x.strokeStyle = o.ink;
  }
  limb(x, P.hip, P.kneeB, P.footB, 7);
  if (k === 'bomber') { // barrel on the back
    x.save(); x.translate(P.neck[0] - 18, P.neck[1] + 16);
    x.fillStyle = o.ink; x.beginPath(); x.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 3; x.beginPath(); x.moveTo(-14, -6); x.lineTo(14, -6); x.moveTo(-14, 7); x.lineTo(14, 7); x.stroke();
    x.strokeStyle = o.ink; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -19); x.quadraticCurveTo(6, -28, 2, -34); x.stroke();
    x.fillStyle = (o.t * 12) % 2 < 1 ? '#ffcf3a' : o.accent; x.beginPath(); x.arc(2, -35, 4, 0, 7); x.fill();
    x.restore();
  }
  // arms
  x.lineWidth = 6;
  x.beginPath(); x.moveTo(P.neck[0], P.neck[1] + 4); x.lineTo((P.neck[0] + P.handB[0]) / 2 - 4, (P.neck[1] + P.handB[1]) / 2 + 6); x.lineTo(P.handB[0], P.handB[1]); x.stroke();
  x.beginPath(); x.moveTo(P.neck[0], P.neck[1] + 4); x.lineTo((P.neck[0] + P.handA[0]) / 2, (P.neck[1] + P.handA[1]) / 2 + 8); x.lineTo(P.handA[0], P.handA[1]); x.stroke();
  // weapon
  if (k === 'player' || k === 'general' || k === 'grunt' || k === 'bomber') {
    const len = k === 'player' ? 46 : k === 'general' ? 56 : 30;
    const a = P.sword;
    const hx = P.handA[0], hy = P.handA[1];
    x.strokeStyle = o.ink; x.lineWidth = k === 'player' ? 3.5 : 5;
    x.beginPath(); x.moveTo(hx - Math.cos(a) * 8, hy - Math.sin(a) * 8); x.lineTo(hx + Math.cos(a) * len, hy + Math.sin(a) * len); x.stroke();
    if (k === 'player') { x.strokeStyle = o.paper; x.lineWidth = 1.2; x.beginPath(); x.moveTo(hx + Math.cos(a) * 6, hy + Math.sin(a) * 6 - 1); x.lineTo(hx + Math.cos(a) * (len - 4), hy + Math.sin(a) * (len - 4) - 1); x.stroke(); }
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
  if (k === 'player') {
    x.fillStyle = o.ink; x.beginPath(); x.arc(hx, hy, 10, 0, Math.PI * 2); x.fill();
    // straw hat (kasa)
    x.beginPath(); x.moveTo(hx - 24, hy - 2); x.quadraticCurveTo(hx, hy - 26, hx + 24, hy - 2); x.quadraticCurveTo(hx, hy - 7, hx - 24, hy - 2); x.fill();
    // headband tail
    x.strokeStyle = o.accent; x.lineWidth = 3; x.beginPath(); x.moveTo(hx - 8, hy - 2); x.lineTo(hx - 20, hy + 4 + Math.sin(o.t * 12) * 3); x.stroke();
  } else {
    const mask = o.mask;
    x.fillStyle = mask; x.strokeStyle = o.ink; x.lineWidth = 3;
    x.beginPath(); x.arc(hx, hy, k === 'general' ? 13 : 11, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = o.accent;
    x.beginPath(); x.moveTo(hx + 1, hy - 3); x.lineTo(hx + 8, hy - 1); x.lineTo(hx + 1, hy + 1); x.fill();
    x.beginPath(); x.moveTo(hx - 6, hy - 3); x.lineTo(hx - 1, hy - 1); x.lineTo(hx - 6, hy + 1); x.fill();
    x.fillStyle = o.ink;
    if (k === 'general') { // horned helmet
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

function drawLantern(x, o) {
  // floating paper-lantern ghost
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
