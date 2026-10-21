// Ink-on-paper drawing: the paper, painted backdrops, brush-stroke ground,
// stick-ink samurai figures (and everything the player can wear), red ink
// splats, hanko stamps, fire vents and mon coins.
import { W, H, FLOOR } from './levels.js';

export const BRUSH = '"Yuji Syuku", "Noto Serif JP", serif';
export const DISPLAY = '"Shojumaru", "Yuji Syuku", serif';

function seeded(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 16807) % 2147483647) / 2147483647); }

// ------------------------------------------------------------ backdrop (pre-rendered once per room)
export function paintRoom(stage, pal) {
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const R = seeded(stage.n * 31 + 7 + stage.chapter * 1000);
  const ch = stage.chapter;
  // paper
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, pal.paper); g.addColorStop(1, pal.paper2);
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  // sun / moon
  const sx = 860 + R() * 200, sy = 170 + R() * 60, sr = 95 + R() * 30;
  x.globalAlpha = pal.dark ? 0.9 : ch === 3 ? 0.7 : 0.85;
  if (ch === 5) x.globalAlpha = 0.35;   // a moon behind storm cloud
  x.fillStyle = pal.sun; x.beginPath(); x.arc(sx, sy, ch === 4 ? sr * 1.3 : sr, 0, Math.PI * 2); x.fill();
  x.globalAlpha = 0.25; x.lineWidth = 6; x.strokeStyle = pal.sun;
  for (let k = 0; k < 3; k++) { x.beginPath(); x.arc(sx + (R() - 0.5) * 6, sy + (R() - 0.5) * 6, sr + 4 + R() * 6, R() * 6, R() * 6 + 4.5); x.stroke(); }
  x.globalAlpha = 1;
  if (ch === 2) { // stars
    x.fillStyle = pal.ink;
    for (let k = 0; k < 90; k++) { x.globalAlpha = 0.2 + R() * 0.5; x.fillRect(R() * W, R() * 420, 2, 2); }
    x.globalAlpha = 1;
  }
  if (ch === 5) { // storm clouds: heavy dry-brush bands
    for (let k = 0; k < 9; k++) {
      const cy = 40 + R() * 260, cx = R() * W, cw = 260 + R() * 420;
      x.globalAlpha = 0.18 + R() * 0.2; x.fillStyle = '#0a090c';
      x.beginPath(); x.ellipse(cx, cy, cw / 2, 26 + R() * 30, (R() - 0.5) * 0.1, 0, 7); x.fill();
    }
    x.globalAlpha = 1;
  }
  // two ranges of ink-wash mountains
  for (const [base, amp, alpha] of [[430, 150, 0.18], [520, 110, 0.32]]) {
    x.fillStyle = pal.wash; x.globalAlpha = alpha;
    x.beginPath(); x.moveTo(0, H);
    let y = base;
    const ridge = [];
    for (let px = 0; px <= W + 40; px += 40) { y = base - Math.abs(Math.sin(px * 0.004 + R() * 0.6 + base)) * amp - R() * 30; x.lineTo(px, y); ridge.push([px, y]); }
    x.lineTo(W, H); x.closePath(); x.fill();
    if (ch === 3) { // snow on the ridgeline
      x.globalAlpha = 0.85; x.strokeStyle = '#fbfcfc'; x.lineWidth = 7; x.lineJoin = 'round';
      x.beginPath(); ridge.forEach(([px, py], i) => (i ? x.lineTo(px, py + 3) : x.moveTo(px, py + 3))); x.stroke();
    }
    // misty bottom
    const m = x.createLinearGradient(0, base - 40, 0, base + 120);
    m.addColorStop(0, 'rgba(0,0,0,0)'); m.addColorStop(1, pal.paper2);
    x.globalAlpha = 0.8; x.fillStyle = m; x.fillRect(0, base - 40, W, 200);
  }
  x.globalAlpha = 1;
  // chapter scenery
  x.strokeStyle = pal.ink; x.fillStyle = pal.ink; x.lineCap = 'round';
  if (ch === 0) {
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
  } else if (ch === 1) {
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
  } else if (ch === 2) {
    // torii gate and lanterns
    const tx = 180 + R() * 200;
    x.globalAlpha = 0.45; x.fillStyle = pal.accent;
    x.fillRect(tx, 300, 16, 240); x.fillRect(tx + 180, 300, 16, 240);
    x.beginPath(); x.moveTo(tx - 40, 300); x.quadraticCurveTo(tx + 98, 270, tx + 236, 300); x.lineTo(tx + 236, 318); x.quadraticCurveTo(tx + 98, 290, tx - 40, 318); x.closePath(); x.fill();
    x.fillRect(tx - 10, 340, 216, 12);
  } else if (ch === 3) {
    // snowy pines: stacked ink tiers, each with a cap of snow
    for (let k = 0; k < 11; k++) {
      const bx = R() * W, base = 560 + R() * 80, hgt = 180 + R() * 220, a = 0.12 + R() * 0.3;
      x.globalAlpha = a; x.fillStyle = pal.ink;
      x.fillRect(bx - 4, base - 30, 8, 40);
      const tiers = 4 + Math.floor(R() * 2);
      for (let t = 0; t < tiers; t++) {
        const ty = base - 20 - t * hgt / tiers, tw = (tiers - t) * 18 + 16;
        x.fillStyle = pal.ink; x.globalAlpha = a;
        x.beginPath(); x.moveTo(bx - tw, ty); x.lineTo(bx, ty - hgt / tiers - 22); x.lineTo(bx + tw, ty); x.quadraticCurveTo(bx, ty - 10, bx - tw, ty); x.fill();
        x.fillStyle = '#fbfcfc'; x.globalAlpha = Math.min(1, a * 2.6);
        x.beginPath(); x.moveTo(bx - tw * 0.55, ty - hgt / tiers * 0.4 - 4); x.lineTo(bx, ty - hgt / tiers - 22); x.lineTo(bx + tw * 0.6, ty - hgt / tiers * 0.38 - 4); x.quadraticCurveTo(bx, ty - hgt / tiers * 0.6, bx - tw * 0.55, ty - hgt / tiers * 0.4 - 4); x.fill();
      }
    }
  } else if (ch === 4) {
    // a village burning on the horizon: roof silhouettes, flames, smoke columns
    for (let k = 0; k < 9; k++) {
      const hx = k * 150 + R() * 80 - 40, hw = 90 + R() * 60, hb = 560 + R() * 30, hh = 50 + R() * 40;
      x.globalAlpha = 0.45 + R() * 0.2; x.fillStyle = pal.ink;
      x.fillRect(hx, hb - hh, hw, hh + 40);
      x.beginPath(); x.moveTo(hx - 22, hb - hh); x.quadraticCurveTo(hx + hw / 2, hb - hh - 56, hx + hw + 22, hb - hh); x.closePath(); x.fill();
      if (R() < 0.7) { // flames licking off the roof
        const fx0 = hx + hw * (0.2 + R() * 0.6), fy = hb - hh - 30;
        for (const [col, sc, al] of [['#c8281e', 1, 0.75], ['#ff7a1a', 0.7, 0.85], ['#ffd23a', 0.4, 0.9]]) {
          x.fillStyle = col; x.globalAlpha = al;
          x.beginPath(); x.moveTo(fx0 - 34 * sc, fy + 20);
          x.quadraticCurveTo(fx0 - 30 * sc, fy - 50 * sc, fx0 - 6 * sc, fy - 90 * sc);
          x.quadraticCurveTo(fx0 + 4 * sc, fy - 40 * sc, fx0 + 14 * sc, fy - 70 * sc);
          x.quadraticCurveTo(fx0 + 36 * sc, fy - 30 * sc, fx0 + 34 * sc, fy + 20); x.fill();
        }
        // smoke rising and leaning with the wind
        x.fillStyle = pal.wash;
        for (let s = 0; s < 6; s++) { x.globalAlpha = 0.16 - s * 0.02; x.beginPath(); x.ellipse(fx0 - s * 26, fy - 110 - s * 60, 30 + s * 12, 22 + s * 8, 0, 0, 7); x.fill(); }
      }
    }
  } else if (ch === 5) {
    // the fortress: a stone wall across the back, a keep, banners, a lightning fork
    x.fillStyle = '#0c0b10'; x.globalAlpha = 0.7;
    x.fillRect(0, 470, W, 200);
    x.strokeStyle = pal.wash; x.lineWidth = 1.5; x.globalAlpha = 0.35;
    for (let row = 0; row < 6; row++) {
      const yy = 480 + row * 28; x.beginPath(); x.moveTo(0, yy); x.lineTo(W, yy); x.stroke();
      for (let bx = (row % 2) * 40; bx < W; bx += 80) { x.beginPath(); x.moveTo(bx, yy); x.lineTo(bx, yy + 28); x.stroke(); }
    }
    const kx = 260 + R() * 600;
    x.globalAlpha = 0.85; x.fillStyle = '#0c0b10';
    let ky = 470;
    for (const [w, h] of [[300, 50], [230, 44], [170, 40], [110, 36]]) {
      x.beginPath(); x.moveTo(kx - w / 2 - 30, ky); x.quadraticCurveTo(kx - w / 2, ky - 10, kx - w / 2 + 14, ky - h * 0.5); x.lineTo(kx + w / 2 - 14, ky - h * 0.5); x.quadraticCurveTo(kx + w / 2, ky - 10, kx + w / 2 + 30, ky); x.closePath(); x.fill();
      x.fillRect(kx - w / 2 + 20, ky - h - 12, w - 40, h - 4);
      x.strokeStyle = '#d8b04a'; x.globalAlpha = 0.6; x.lineWidth = 2;
      x.beginPath(); x.moveTo(kx - w / 2 - 28, ky - 1); x.quadraticCurveTo(kx, ky - 6, kx + w / 2 + 28, ky - 1); x.stroke();
      x.globalAlpha = 0.85;
      ky -= h + 10;
    }
    // nobori banners on the wall
    for (let k = 0; k < 6; k++) {
      const bx = 60 + k * 230 + R() * 40;
      x.globalAlpha = 0.8; x.strokeStyle = '#0c0b10'; x.lineWidth = 4;
      x.beginPath(); x.moveTo(bx, 470); x.lineTo(bx, 330); x.stroke();
      x.fillStyle = pal.accent; x.globalAlpha = 0.55;
      x.beginPath(); x.moveTo(bx + 2, 338); x.lineTo(bx + 30, 340); x.lineTo(bx + 28 + R() * 6, 440); x.lineTo(bx + 2, 436); x.fill();
      x.fillStyle = '#efe6d4'; x.globalAlpha = 0.5; x.beginPath(); x.arc(bx + 16, 362, 7, 0, 7); x.fill();
    }
    // a frozen lightning fork in the sky
    x.strokeStyle = '#efe6d4'; x.globalAlpha = 0.4; x.lineWidth = 3;
    let lx = 900 + R() * 300, ly = 0;
    x.beginPath(); x.moveTo(lx, ly);
    while (ly < 330) { lx += (R() - 0.5) * 60; ly += 30 + R() * 30; x.lineTo(lx, ly); }
    x.stroke();
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
    if (ch === 0) { // grass tufts
      x.strokeStyle = pal.ink; x.lineWidth = 2;
      for (let px = x0 + 6; px < x1 - 6; px += 9 + R() * 14) { x.beginPath(); x.moveTo(px, FLOOR); x.lineTo(px + (R() - 0.5) * 8, FLOOR - 6 - R() * 9); x.stroke(); }
    } else if (ch === 3) { // a lip of snow
      snowCap(x, R, x0, x1, FLOOR - 2);
    } else if (ch === 4) { // embers glowing in the ground
      for (let k = 0; k < (x1 - x0) / 40; k++) { x.fillStyle = R() < 0.5 ? '#ff7a1a' : '#c8281e'; x.globalAlpha = 0.5 + R() * 0.4; x.beginPath(); x.arc(x0 + R() * (x1 - x0), FLOOR + 6 + R() * 50, 1.5 + R() * 2.5, 0, 7); x.fill(); }
      x.globalAlpha = 1;
    } else if (ch === 5) { // wet stone: a pale sheen line
      x.strokeStyle = pal.wash; x.globalAlpha = 0.5; x.lineWidth = 2;
      x.beginPath(); x.moveTo(x0 + 4, FLOOR + 4); x.lineTo(x1 - 4, FLOOR + 4); x.stroke(); x.globalAlpha = 1;
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
    // dripping ink (or icicles) under the platform
    for (let k = 0; k < 3; k++) { const dx = p.x + 20 + R() * (p.w - 40); x.fillStyle = pal.ink; x.beginPath(); x.moveTo(dx - 3, p.y + p.h - 2); x.quadraticCurveTo(dx, p.y + p.h + 14 + R() * 12, dx + 3, p.y + p.h - 2); x.fill(); }
    if (ch === 3) snowCap(x, R, p.x, p.x + p.w, p.y - 1);
  }
  // fire-vent grates (the flames themselves are drawn live)
  for (const v of stage.vents || []) {
    x.fillStyle = '#0a0606'; x.fillRect(v.x - v.w / 2, FLOOR - 3, v.w, 8);
    x.strokeStyle = '#ff7a1a'; x.globalAlpha = 0.7; x.lineWidth = 2;
    for (let k = -2; k <= 2; k++) { x.beginPath(); x.moveTo(v.x + k * 11, FLOOR - 2); x.lineTo(v.x + k * 11, FLOOR + 4); x.stroke(); }
    x.globalAlpha = 1;
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

function snowCap(x, R, x0, x1, y) {
  x.fillStyle = '#fbfcfc';
  x.beginPath(); x.moveTo(x0 - 3, y + 2);
  for (let px = x0; px <= x1; px += 14) x.lineTo(px, y - 4 - R() * 4);
  x.lineTo(x1 + 3, y + 2);
  for (let px = x1; px >= x0; px -= 18) x.lineTo(px, y + 3 + R() * 5);
  x.closePath(); x.fill();
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
  guard: { hip: [0, -38], neck: [5, -70], kneeA: [-12, -18], footA: [-20, 0], kneeB: [14, -19], footB: [20, 0], handA: [20, -62], handB: [16, -58], sword: -1.45 },
  crouch: { hip: [0, -26], neck: [8, -56], kneeA: [-14, -14], footA: [-18, 0], kneeB: [16, -12], footB: [16, 0], handA: [22, -40], handB: [16, -38], sword: -0.2 },
};
export function lerpPose(a, b, t) {
  const o = {};
  for (const k of Object.keys(a)) o[k] = Array.isArray(a[k]) ? [a[k][0] + (b[k][0] - a[k][0]) * t, a[k][1] + (b[k][1] - a[k][1]) * t] : a[k] + (b[k] - a[k]) * t;
  return o;
}
export function pose(name) { return POSES[name]; }

function limb(x, a, b, c, w) { x.lineWidth = w; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.stroke(); }
function seg(x, a, b, w, col) { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }

// draw a figure at (px, py) feet
// o = { pose, face, rot, scale, ink, paper, accent, mask, kind, t, draw, outfit, trim, guard }
export function drawFigure(x, px, py, o) {
  const P = o.pose, s = o.scale || 1;
  x.save();
  x.translate(px, py);
  if (o.rot) { x.translate(0, -40 * s); x.rotate(o.rot); x.translate(0, 40 * s); }
  x.scale(s * o.face, s);
  x.strokeStyle = o.ink; x.fillStyle = o.ink; x.lineCap = 'round'; x.lineJoin = 'round';
  const k = o.kind || 'player';
  if (k === 'flyer') { drawLantern(x, o); x.restore(); return; }
  const fit = k === 'player' ? o.outfit : null;
  const robe = fit && fit.robe && fit.robe.color ? fit.robe : null;
  // back leg (with a hakama over the thigh), torso, front leg
  limb(x, P.hip, P.kneeA, P.footA, 7);
  if (robe) { seg(x, P.hip, P.kneeA, 12, o.ink); seg(x, P.hip, P.kneeA, 8, robe.color); x.strokeStyle = o.ink; }
  if (k === 'boss') drawCape(x, P, o);
  if (robe) {
    seg(x, P.hip, P.neck, 15, o.ink); seg(x, P.hip, P.neck, 11, robe.color);
    if (robe.pattern) robePattern(x, P, robe);
    x.strokeStyle = o.ink;
  } else { x.lineWidth = 11; x.beginPath(); x.moveTo(P.hip[0], P.hip[1]); x.lineTo(P.neck[0], P.neck[1]); x.stroke(); }
  if (k === 'general' || k === 'boss') { // armour plates
    const w = k === 'boss' ? 19 : 16;
    x.fillStyle = o.ink;
    x.beginPath(); x.moveTo(P.neck[0] - w, P.neck[1] + 4); x.lineTo(P.neck[0] + w, P.neck[1] + 4); x.lineTo(P.hip[0] + w - 2, P.hip[1] + 6); x.lineTo(P.hip[0] - w + 2, P.hip[1] + 6); x.closePath(); x.fill();
    x.strokeStyle = o.trim || o.accent; x.lineWidth = 2;
    for (let i = 1; i < 4; i++) { const yy = P.neck[1] + 4 + (P.hip[1] - P.neck[1]) * i / 4; x.beginPath(); x.moveTo(-w + 3, yy); x.lineTo(w - 3, yy); x.stroke(); }
    if (k === 'boss') { // shoulder guards (sode) and a skirt of plates
      x.fillStyle = o.ink;
      x.beginPath(); x.moveTo(P.neck[0] - 6, P.neck[1] + 2); x.lineTo(P.neck[0] - 28, P.neck[1] + 8); x.lineTo(P.neck[0] - 24, P.neck[1] + 26); x.lineTo(P.neck[0] - 4, P.neck[1] + 18); x.fill();
      x.beginPath(); x.moveTo(P.neck[0] + 6, P.neck[1] + 2); x.lineTo(P.neck[0] + 26, P.neck[1] + 8); x.lineTo(P.neck[0] + 22, P.neck[1] + 26); x.lineTo(P.neck[0] + 4, P.neck[1] + 18); x.fill();
      x.beginPath(); x.moveTo(P.hip[0] - 18, P.hip[1] + 4); x.lineTo(P.hip[0] + 18, P.hip[1] + 4); x.lineTo(P.hip[0] + 22, P.hip[1] + 20); x.lineTo(P.hip[0] - 22, P.hip[1] + 20); x.fill();
      x.strokeStyle = o.trim || o.accent; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(P.hip[0] - 20, P.hip[1] + 12); x.lineTo(P.hip[0] + 20, P.hip[1] + 12); x.stroke();
    }
    x.strokeStyle = o.ink;
  }
  limb(x, P.hip, P.kneeB, P.footB, 7);
  if (robe) { seg(x, P.hip, P.kneeB, 12, o.ink); seg(x, P.hip, P.kneeB, 8, robe.color); x.strokeStyle = o.ink; }
  if (fit && fit.sash) drawSash(x, P, fit.sash, o);
  if (k === 'bomber') { // barrel on the back
    x.save(); x.translate(P.neck[0] - 18, P.neck[1] + 16);
    x.fillStyle = o.ink; x.beginPath(); x.ellipse(0, 0, 15, 19, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 3; x.beginPath(); x.moveTo(-14, -6); x.lineTo(14, -6); x.moveTo(-14, 7); x.lineTo(14, 7); x.stroke();
    x.strokeStyle = o.ink; x.lineWidth = 2; x.beginPath(); x.moveTo(0, -19); x.quadraticCurveTo(6, -28, 2, -34); x.stroke();
    x.fillStyle = (o.t * 12) % 2 < 1 ? '#ffcf3a' : o.accent; x.beginPath(); x.arc(2, -35, 4, 0, 7); x.fill();
    x.restore();
  }
  // arms (sleeves in robe colour)
  const armB = [P.neck, [(P.neck[0] + P.handB[0]) / 2 - 4, (P.neck[1] + P.handB[1]) / 2 + 6], P.handB];
  const armA = [[P.neck[0], P.neck[1] + 4], [(P.neck[0] + P.handA[0]) / 2, (P.neck[1] + P.handA[1]) / 2 + 8], P.handA];
  x.strokeStyle = o.ink;
  limb(x, [armB[0][0], armB[0][1] + 4], armB[1], armB[2], 6);
  limb(x, armA[0], armA[1], armA[2], 6);
  if (robe) { seg(x, armA[0], armA[1], 9, o.ink); seg(x, armA[0], armA[1], 5.5, robe.color); x.strokeStyle = o.ink; }
  // weapon
  if (k === 'player' || k === 'general' || k === 'grunt' || k === 'bomber' || k === 'ninja' || k === 'boss') {
    const len = k === 'player' ? 46 : k === 'general' ? 56 : k === 'boss' ? 72 : k === 'ninja' ? 26 : 30;
    const a = P.sword;
    const hx = P.handA[0], hy = P.handA[1];
    const bl = fit && fit.blade && fit.blade.steel ? fit.blade : null;
    const x0 = hx - Math.cos(a) * 8, y0 = hy - Math.sin(a) * 8, x1 = hx + Math.cos(a) * len, y1 = hy + Math.sin(a) * len;
    if (bl) {
      x.save();
      if (bl.glow) { x.shadowColor = bl.glow; x.shadowBlur = 14; }
      seg(x, [x0, y0], [x1, y1], 6, o.ink);
      seg(x, [hx, hy], [x1, y1], 3.4, bl.steel);
      x.restore();
      seg(x, [hx + Math.cos(a) * 6, hy + Math.sin(a) * 6 - 1], [hx + Math.cos(a) * (len - 5), hy + Math.sin(a) * (len - 5) - 1], 1.2, bl.core);
    } else {
      x.strokeStyle = o.ink; x.lineWidth = k === 'player' ? 3.5 : k === 'boss' ? 6 : 5;
      x.beginPath(); x.moveTo(x0, y0); x.lineTo(x1, y1); x.stroke();
      if (k === 'player') seg(x, [hx + Math.cos(a) * 6, hy + Math.sin(a) * 6 - 1], [hx + Math.cos(a) * (len - 4), hy + Math.sin(a) * (len - 4) - 1], 1.2, o.paper);
      if (k === 'boss') seg(x, [hx + Math.cos(a) * 8, hy + Math.sin(a) * 8], [x1, y1], 1.6, o.trim || o.accent);
    }
    // tsuba (hand guard)
    if (k === 'player' || k === 'boss') { x.fillStyle = o.ink; x.beginPath(); x.ellipse(hx + Math.cos(a) * 2, hy + Math.sin(a) * 2, 2.2, 4.5, a, 0, 7); x.fill(); }
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
  if (k === 'player') drawHat(x, hx, hy, fit ? fit.hat.id : 'kasa', o);
  else if (k === 'ninja') {
    x.fillStyle = o.ink; x.beginPath(); x.arc(hx, hy, 11, 0, Math.PI * 2); x.fill();
    x.fillStyle = o.mask; x.fillRect(hx - 1, hy - 4, 11, 4.5);
    x.fillStyle = o.accent; x.fillRect(hx + 3, hy - 3, 2.5, 2.5); x.fillRect(hx + 7, hy - 3, 2.5, 2.5);
    x.strokeStyle = o.ink; x.lineWidth = 3; x.beginPath(); x.moveTo(hx - 8, hy - 4); x.quadraticCurveTo(hx - 18, hy - 2, hx - 24, hy + 4 + Math.sin(o.t * 10) * 4); x.stroke();
  } else {
    const mask = o.mask;
    x.fillStyle = mask; x.strokeStyle = o.ink; x.lineWidth = 3;
    x.beginPath(); x.arc(hx, hy, k === 'general' || k === 'boss' ? 13 : 11, 0, Math.PI * 2); x.fill(); x.stroke();
    x.fillStyle = o.accent;
    x.beginPath(); x.moveTo(hx + 1, hy - 3); x.lineTo(hx + 8, hy - 1); x.lineTo(hx + 1, hy + 1); x.fill();
    x.beginPath(); x.moveTo(hx - 6, hy - 3); x.lineTo(hx - 1, hy - 1); x.lineTo(hx - 6, hy + 1); x.fill();
    x.fillStyle = o.ink;
    if (k === 'general') { // horned helmet
      x.beginPath(); x.arc(hx, hy - 4, 15, Math.PI, 0); x.fill();
      x.strokeStyle = o.accent; x.lineWidth = 4;
      x.beginPath(); x.moveTo(hx - 6, hy - 14); x.quadraticCurveTo(hx - 22, hy - 30, hx - 12, hy - 40); x.moveTo(hx + 6, hy - 14); x.quadraticCurveTo(hx + 22, hy - 30, hx + 12, hy - 40); x.stroke();
    } else if (k === 'boss') { // great kabuto: dome, layered neck guard, a tall crest
      x.beginPath(); x.arc(hx, hy - 4, 17, Math.PI, 0); x.fill();
      for (let l = 0; l < 3; l++) { x.beginPath(); x.moveTo(hx - 4, hy - 2 + l * 6); x.lineTo(hx - 26 - l * 3, hy + 6 + l * 7); x.lineTo(hx - 22 - l * 3, hy + 11 + l * 7); x.lineTo(hx - 4, hy + 4 + l * 6); x.fill(); }
      x.strokeStyle = o.trim || '#e0b030'; x.lineWidth = 5;
      x.beginPath(); x.moveTo(hx + 2, hy - 16); x.quadraticCurveTo(hx - 26, hy - 30, hx - 22, hy - 56); x.moveTo(hx + 2, hy - 16); x.quadraticCurveTo(hx + 30, hy - 30, hx + 26, hy - 56); x.stroke();
      x.fillStyle = o.trim || '#e0b030'; x.beginPath(); x.arc(hx + 2, hy - 18, 4, 0, 7); x.fill();
    } else if (k === 'archer') {
      x.beginPath(); x.moveTo(hx - 16, hy - 6); x.lineTo(hx, hy - 22); x.lineTo(hx + 16, hy - 6); x.closePath(); x.fill();
    } else {
      x.fillRect(hx - 12, hy - 9, 24, 5);
      x.lineWidth = 3; x.strokeStyle = o.ink; x.beginPath(); x.moveTo(hx - 10, hy - 6); x.lineTo(hx - 22, hy - 2 + Math.sin(o.t * 8) * 3); x.stroke();
    }
  }
  x.restore();
}

function drawCape(x, P, o) {
  // a heavy war cloak (horo) billowing behind the boss
  const t = o.t || 0;
  x.fillStyle = o.trim ? o.trim : o.accent; x.globalAlpha *= 0.9;
  x.beginPath(); x.moveTo(P.neck[0] - 4, P.neck[1] + 2);
  x.quadraticCurveTo(P.neck[0] - 44 - Math.sin(t * 3) * 6, P.neck[1] + 6, P.hip[0] - 40 - Math.sin(t * 3 + 1) * 8, P.hip[1] + 30);
  x.lineTo(P.hip[0] - 6, P.hip[1] + 8); x.closePath(); x.fill();
  x.globalAlpha /= 0.9;
  x.strokeStyle = o.ink; x.lineWidth = 2; x.stroke();
}

function robePattern(x, P, robe) {
  const ax = P.hip[0], ay = P.hip[1], bx = P.neck[0], by = P.neck[1];
  const pt = (t) => [ax + (bx - ax) * t, ay + (by - ay) * t];
  x.fillStyle = robe.mark; x.strokeStyle = robe.mark;
  if (robe.pattern === 'wave') {
    x.lineWidth = 1.3;
    for (const t of [0.25, 0.55, 0.85]) { const [cx, cy] = pt(t); x.beginPath(); x.arc(cx, cy + 2, 3.6, Math.PI, 0); x.stroke(); }
  } else if (robe.pattern === 'sakura') {
    for (const t of [0.3, 0.7]) { const [cx, cy] = pt(t); for (let i = 0; i < 5; i++) { const a = i * 1.256; x.beginPath(); x.arc(cx + Math.cos(a) * 2.2, cy + Math.sin(a) * 2.2, 1.5, 0, 7); x.fill(); } }
  } else if (robe.pattern === 'bolt') {
    x.lineWidth = 1.8; const [c1x, c1y] = pt(0.9), [c2x, c2y] = pt(0.1);
    x.beginPath(); x.moveTo(c1x + 3, c1y); x.lineTo(c1x - 2, (c1y + c2y) / 2); x.lineTo(c1x + 3, (c1y + c2y) / 2 + 2); x.lineTo(c2x - 2, c2y); x.stroke();
  } else if (robe.pattern === 'crest') {
    const [cx, cy] = pt(0.6); x.lineWidth = 1.4; x.beginPath(); x.arc(cx, cy, 3.6, 0, 7); x.stroke();
    x.beginPath(); x.arc(cx, cy, 1.2, 0, 7); x.fill();
  }
}

function drawSash(x, P, sash, o) {
  const dx = P.neck[0] - P.hip[0], dy = P.neck[1] - P.hip[1], L = Math.hypot(dx, dy) || 1;
  const tx = dx / L, ty = dy / L, nx = -ty, ny = tx;
  const cx = P.hip[0] + tx * 5, cy = P.hip[1] + ty * 5;
  const a = [cx - nx * 8, cy - ny * 8], b = [cx + nx * 8, cy + ny * 8];
  seg(x, a, b, 7, o.ink); seg(x, a, b, sash.rope ? 4.5 : 4, sash.color);
  if (sash.rope) { x.strokeStyle = o.ink; x.lineWidth = 1; for (let i = -1; i <= 1; i++) { x.beginPath(); x.moveTo(cx + nx * i * 4 - tx * 2, cy + ny * i * 4 - ty * 2); x.lineTo(cx + nx * i * 4 + tx * 2, cy + ny * i * 4 + ty * 2); x.stroke(); } }
  // knot tails flutter behind
  const w = Math.sin((o.t || 0) * 11) * 2.5;
  const k0 = [cx - nx * 2 - 3, cy - ny * 2];
  for (const [ex, ey] of [[-12, 8 + w], [-9, 13 - w]]) { seg(x, k0, [k0[0] + ex, k0[1] + ey], 4.5, o.ink); seg(x, k0, [k0[0] + ex, k0[1] + ey], 2.2, sash.color); }
  x.strokeStyle = o.ink;
}

function drawHat(x, hx, hy, id, o) {
  const ink = o.ink, t = o.t || 0;
  x.fillStyle = ink; x.beginPath(); x.arc(hx, hy, 10, 0, Math.PI * 2); x.fill();
  if (id === 'kasa') {
    x.beginPath(); x.moveTo(hx - 24, hy - 2); x.quadraticCurveTo(hx, hy - 26, hx + 24, hy - 2); x.quadraticCurveTo(hx, hy - 7, hx - 24, hy - 2); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 3; x.beginPath(); x.moveTo(hx - 8, hy - 2); x.lineTo(hx - 20, hy + 4 + Math.sin(t * 12) * 3); x.stroke();
  } else if (id === 'hachimaki') {
    x.strokeStyle = '#f4efe4'; x.lineWidth = 3.5; x.beginPath(); x.arc(hx, hy, 9.5, Math.PI * 1.05, Math.PI * 1.9); x.stroke();
    x.fillStyle = o.accent; x.beginPath(); x.arc(hx + 6, hy - 7, 2.2, 0, 7); x.fill();
    x.strokeStyle = '#f4efe4'; x.lineWidth = 2.6;
    for (const [len, ph] of [[24, 0], [19, 1.4]]) { x.beginPath(); x.moveTo(hx - 9, hy - 4); x.quadraticCurveTo(hx - 9 - len * 0.5, hy - 6 + Math.sin(t * 13 + ph) * 3, hx - 9 - len, hy + Math.sin(t * 13 + ph + 1) * 4); x.stroke(); }
    // spiky hair over the band
    x.fillStyle = ink; x.beginPath(); x.moveTo(hx - 9, hy - 9); x.lineTo(hx - 4, hy - 17); x.lineTo(hx, hy - 10); x.lineTo(hx + 4, hy - 16); x.lineTo(hx + 8, hy - 9); x.fill();
  } else if (id === 'topknot') {
    x.beginPath(); x.arc(hx - 4, hy - 13, 4.5, 0, 7); x.fill();
    x.beginPath(); x.ellipse(hx - 1, hy - 17, 7, 2.4, -0.3, 0, 7); x.fill();
    x.strokeStyle = o.accent; x.lineWidth = 2; x.beginPath(); x.moveTo(hx - 7, hy - 10); x.lineTo(hx - 1, hy - 11); x.stroke();
  } else if (id === 'hood') {
    x.beginPath(); x.arc(hx, hy, 12, 0, Math.PI * 2); x.fill();
    x.fillStyle = o.paper; x.fillRect(hx - 1, hy - 4, 12, 4.5);
    x.fillStyle = ink; x.fillRect(hx + 4, hy - 3, 2.4, 2.4); x.fillRect(hx + 8, hy - 3, 2.4, 2.4);
    x.strokeStyle = ink; x.lineWidth = 4; x.beginPath(); x.moveTo(hx - 9, hy - 3); x.quadraticCurveTo(hx - 20, hy, hx - 27, hy + 6 + Math.sin(t * 12) * 4); x.stroke();
  } else if (id === 'kabuto') {
    x.beginPath(); x.arc(hx, hy - 3, 14, Math.PI, 0); x.fill();
    for (let l = 0; l < 2; l++) { x.beginPath(); x.moveTo(hx - 4, hy - 3 + l * 5); x.lineTo(hx - 20 - l * 2, hy + 3 + l * 6); x.lineTo(hx - 17 - l * 2, hy + 8 + l * 6); x.lineTo(hx - 4, hy + 2 + l * 5); x.fill(); }
    x.strokeStyle = '#e0b030'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(hx + 3, hy - 13); x.quadraticCurveTo(hx - 12, hy - 22, hx - 9, hy - 34); x.moveTo(hx + 3, hy - 13); x.quadraticCurveTo(hx + 18, hy - 22, hx + 15, hy - 34); x.stroke();
  } else if (id === 'oni') {
    x.fillStyle = '#c8281e'; x.strokeStyle = ink; x.lineWidth = 2;
    x.beginPath(); x.ellipse(hx + 3, hy, 9, 11, 0, 0, 7); x.fill(); x.stroke();
    x.fillStyle = '#f4efe4';
    x.beginPath(); x.moveTo(hx - 3, hy - 9); x.lineTo(hx - 6, hy - 22); x.lineTo(hx + 1, hy - 10); x.fill();
    x.beginPath(); x.moveTo(hx + 6, hy - 10); x.lineTo(hx + 10, hy - 23); x.lineTo(hx + 10, hy - 8); x.fill();
    x.fillStyle = '#ffd23a'; x.beginPath(); x.moveTo(hx + 4, hy - 4); x.lineTo(hx + 10, hy - 2); x.lineTo(hx + 4, hy); x.fill();
    x.fillStyle = '#f4efe4'; x.beginPath(); x.moveTo(hx + 3, hy + 5); x.lineTo(hx + 5, hy + 10); x.lineTo(hx + 7, hy + 5); x.fill();
    x.beginPath(); x.moveTo(hx + 7, hy + 5); x.lineTo(hx + 9, hy + 9); x.lineTo(hx + 10, hy + 5); x.fill();
  } else if (id === 'kitsune') {
    x.fillStyle = '#f7f2e8'; x.strokeStyle = ink; x.lineWidth = 2;
    x.beginPath(); x.moveTo(hx - 4, hy - 8); x.lineTo(hx - 3, hy - 21); x.lineTo(hx + 3, hy - 10); x.lineTo(hx + 7, hy - 21); x.lineTo(hx + 10, hy - 6); x.lineTo(hx + 16, hy + 2); x.lineTo(hx + 4, hy + 9); x.quadraticCurveTo(hx - 4, hy + 4, hx - 4, hy - 8); x.closePath(); x.fill(); x.stroke();
    x.strokeStyle = '#c8281e'; x.lineWidth = 1.8;
    x.beginPath(); x.moveTo(hx + 3, hy - 3); x.quadraticCurveTo(hx + 7, hy - 6, hx + 10, hy - 2); x.stroke();
    x.beginPath(); x.moveTo(hx - 2, hy - 15); x.lineTo(hx - 1, hy - 10); x.moveTo(hx + 7, hy - 16); x.lineTo(hx + 7, hy - 10); x.stroke();
    x.fillStyle = ink; x.beginPath(); x.arc(hx + 15, hy + 1, 1.6, 0, 7); x.fill();
  }
}

// the trailing scarf: pts are world points from the neck back
export function drawScarf(x, pts, it, ink) {
  if (!pts || pts.length < 2) return;
  const n = pts.length, cols = it.colors;
  x.lineCap = 'round'; x.lineJoin = 'round';
  if (it.edge || it.wisps) for (let i = 1; i < n; i++) { x.strokeStyle = ink; x.lineWidth = Math.max(1.5, it.w - i * (it.w - 1) / n) + 2; x.beginPath(); x.moveTo(pts[i - 1].x, pts[i - 1].y); x.lineTo(pts[i].x, pts[i].y); x.stroke(); }
  for (let i = 1; i < n; i++) {
    x.strokeStyle = cols[Math.min(cols.length - 1, Math.floor((i - 1) / (n - 1) * cols.length))];
    x.lineWidth = Math.max(1, it.w - i * (it.w - 1) / n);
    x.beginPath(); x.moveTo(pts[i - 1].x, pts[i - 1].y); x.lineTo(pts[i].x, pts[i].y); x.stroke();
  }
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

// a fire vent: state 'off' | 'warn' | 'burn', k = 0..1 through that state
export function drawVent(x, v, state, k, t) {
  if (state === 'warn') {
    x.fillStyle = '#6a5a50';
    for (let i = 0; i < 4; i++) { const ph = (t * 1.4 + i * 0.25) % 1; x.globalAlpha = (1 - ph) * 0.5 * Math.min(1, k * 3); x.beginPath(); x.arc(v.x + Math.sin(t * 3 + i) * 10, FLOOR - 8 - ph * 70, 7 + ph * 12, 0, 7); x.fill(); }
    x.globalAlpha = 0.4 + k * 0.5; x.fillStyle = '#ff7a1a'; x.fillRect(v.x - v.w / 2 + 4, FLOOR - 4, v.w - 8, 3);
    x.globalAlpha = 1;
    return;
  }
  if (state !== 'burn') return;
  const h = 160 * Math.min(1, k * 6) * (k > 0.85 ? (1 - k) / 0.15 : 1);
  for (const [col, sc, al] of [['#c8281e', 1, 0.85], ['#ff7a1a', 0.72, 0.9], ['#ffd23a', 0.42, 0.95]]) {
    x.fillStyle = col; x.globalAlpha = al;
    const w = v.w / 2 * sc + 6, f = Math.sin(t * 30 + sc * 9) * 6;
    x.beginPath(); x.moveTo(v.x - w, FLOOR);
    x.quadraticCurveTo(v.x - w - 6, FLOOR - h * 0.5, v.x - w * 0.3 + f, FLOOR - h * sc - 10);
    x.quadraticCurveTo(v.x + f * 0.5, FLOOR - h * 0.6 * sc, v.x + w * 0.4 - f, FLOOR - h * sc - 24);
    x.quadraticCurveTo(v.x + w + 6, FLOOR - h * 0.45, v.x + w, FLOOR); x.closePath(); x.fill();
  }
  x.globalAlpha = 1;
}

// a mon coin: gold disc with a square hole
export function drawCoin(x, cx, cy, r, ink = '#16120f') {
  x.save();
  x.fillStyle = '#e8b830'; x.strokeStyle = ink; x.lineWidth = Math.max(1.5, r * 0.22);
  x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.stroke();
  x.fillStyle = '#fff2b0'; x.beginPath(); x.arc(cx - r * 0.3, cy - r * 0.32, r * 0.28, 0, 7); x.fill();
  x.fillStyle = ink; x.fillRect(cx - r * 0.28, cy - r * 0.28, r * 0.56, r * 0.56);
  x.restore();
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
