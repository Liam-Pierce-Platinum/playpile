// All the sprites, drawn in a soft 3/4 top-down view with a plum ink outline.
import { wallHeight, clamp } from './world.js';

export const INK = '#2c2846';
export const SHADOW = 'rgba(48,56,124,.3)';
export const COATS = ['#e5483d', '#f4b931', '#23a6a0', '#8c5bd6', '#f07c2a', '#4fae4f', '#ec6aa6', '#3d7be0'];
export const SKINS = ['#f7d5bd', '#eab68f', '#c98e64', '#8d5a3b'];
export const HAIRS = ['#4a2e1f', '#e0b356', '#2b2220', '#b5562b', '#6b4a3a'];
export const TEAM = ['#3d8bff', '#ff4b4b'];

export function shade(hex, f) {
  const p = parseInt(hex.slice(1), 16);
  let r = p >> 16, g = (p >> 8) & 255, b = p & 255;
  if (f < 0) { r *= 1 + f; g *= 1 + f; b *= 1 + f * 0.6; } else { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

export const HATS = {
  beanie: { name: 'Beanie', price: 0 },
  bobble: { name: 'Bobble hat', price: 0 },
  earmuffs: { name: 'Earmuffs', price: 40 },
  santa: { name: 'Santa hat', price: 80 },
  topper: { name: 'Top hat', price: 120 },
  bunny: { name: 'Bunny ears', price: 150 },
  antlers: { name: 'Antlers', price: 180 },
  viking: { name: 'Viking helmet', price: 240 },
  crown: { name: 'Snow crown', price: 400 },
};
export const SCARVES = {
  red: { name: 'Red', a: '#e23b3b', b: null, price: 0 },
  white: { name: 'Cream', a: '#f4ecd8', b: null, price: 0 },
  mint: { name: 'Mint stripe', a: '#58d1b0', b: '#ffffff', price: 30 },
  candy: { name: 'Candy cane', a: '#ffffff', b: '#e23b3b', price: 50 },
  sun: { name: 'Sunshine', a: '#ffcf3a', b: '#ff8a2a', price: 70 },
  royal: { name: 'Royal', a: '#5b4bd8', b: '#ffcf3a', price: 110 },
  rainbow: { name: 'Rainbow', a: 'rainbow', b: null, price: 200 },
};
const RAINBOW = ['#ff5a5a', '#ffb43a', '#ffe23a', '#5ad16a', '#3ab0ff', '#9a6aff'];

// ------------------------------------------------------------ kids
export function drawKid(c, k, T, opts = {}) {
  const fx = Math.cos(k.face), fy = Math.sin(k.face);
  c.save();
  c.translate(k.x, k.y);
  if (k.invuln > 0 && Math.floor(T * 14) % 2) c.globalAlpha = 0.4;
  if (k.fade != null) c.globalAlpha *= k.fade;
  const lying = k.prone > 0 || k.ko;
  // ring + shadow
  if (!opts.noRing) {
    c.lineWidth = k.isPlayer ? 3.5 : 2.5; c.strokeStyle = k.ring; c.globalAlpha *= 0.9;
    c.beginPath(); c.ellipse(0, 1, lying ? 26 : 18, lying ? 10 : 7.5, 0, 0, 7); c.stroke();
    c.globalAlpha /= 0.9;
  }
  c.fillStyle = SHADOW; c.beginPath(); c.ellipse(6, 1, lying ? 26 : 15, lying ? 8 : 5.5, 0, 0, 7); c.fill();
  if (lying) {
    const s = k.lieDir >= 0 ? 1 : -1;
    c.translate(0, -7); c.rotate(s * 1.42); c.translate(0, 22);
  }
  const sq = k.squash || 0;
  c.scale(1 + sq, 1 - sq);
  const bob = lying ? 0 : Math.abs(Math.sin(k.step)) * 2.2;
  const back = fy < -0.4 && !lying;
  const side = fx >= 0 ? 1 : -1;
  const sc = SCARVES[k.scarf] || SCARVES.red;
  c.lineJoin = 'round'; c.lineCap = 'round';
  // boots
  const st = Math.sin(k.step) * (k.moving && !lying ? 3.2 : 0);
  c.fillStyle = '#3a3048'; c.strokeStyle = INK; c.lineWidth = 2;
  for (const [bx, o] of [[-5.5, st], [5.5, -st]]) { c.beginPath(); c.ellipse(bx, -3 + o * 0.6, 5, 3.6, 0, 0, 7); c.fill(); c.stroke(); }
  // scarf tail behind body when seen from the front
  const tail = () => {
    const tx = side * 6 - k.vx * 0.035 + Math.sin(T * 9 + k.id) * 2, ty = -10 - k.vy * 0.02;
    c.lineWidth = 6; c.strokeStyle = INK; c.beginPath(); c.moveTo(side * 6, -26 - bob); c.quadraticCurveTo(side * 9, -18 - bob, tx, ty - bob); c.stroke();
    c.lineWidth = 3.6; c.strokeStyle = sc.a === 'rainbow' ? RAINBOW[0] : sc.a; c.stroke();
    if (sc.b) { c.strokeStyle = sc.b; c.lineWidth = 3.6; c.setLineDash([2.5, 3.5]); c.stroke(); c.setLineDash([]); }
  };
  if (!back) tail();
  // arms (behind body for the far arm)
  const coat = k.coat, coatD = shade(coat, -0.25);
  const armL = { x: -13, y: -15 - bob }, armR = { x: 13, y: -15 - bob };
  const hand = side > 0 ? armR : armL;
  if (k.ballRef) { armL.x = -9 + fx * 10; armL.y = -16 + fy * 6 - bob; armR.x = 9 + fx * 10; armR.y = -16 + fy * 6 - bob; }
  else if (k.charging) { hand.x = -fx * 12 + side * 8; hand.y = -34 - bob - (k.chargeAmt || 0) * 4; }
  else if (k.throwAnim > 0) { hand.x = fx * 19; hand.y = -20 + fy * 9 - bob; }
  else if (k.scoopT > 0) { armL.x = -7 + fx * 6; armL.y = -4; armR.x = 7 + fx * 6; armR.y = -4; }
  const drawArm = (a, sx) => {
    c.strokeStyle = INK; c.lineWidth = 9; c.beginPath(); c.moveTo(sx, -21 - bob); c.lineTo(a.x, a.y); c.stroke();
    c.strokeStyle = coat; c.lineWidth = 6; c.stroke();
    c.fillStyle = sc.a === 'rainbow' ? '#ff5a5a' : (sc.a === '#ffffff' || sc.a === '#f4ecd8' ? shade(coat, -0.35) : sc.a); c.strokeStyle = INK; c.lineWidth = 2;
    c.beginPath(); c.arc(a.x, a.y, 4.4, 0, 7); c.fill(); c.stroke();
  };
  // body
  c.fillStyle = coat; c.strokeStyle = INK; c.lineWidth = 2.2;
  c.beginPath(); c.roundRect(-12, -29 - bob, 24, 26, [11, 11, 8, 8]); c.fill(); c.stroke();
  c.save(); c.beginPath(); c.roundRect(-12, -29 - bob, 24, 26, [11, 11, 8, 8]); c.clip();
  c.fillStyle = coatD; c.fillRect(-12, -12 - bob, 24, 12); c.fillRect(6, -29 - bob, 8, 30);
  c.fillStyle = 'rgba(255,255,255,.25)'; c.beginPath(); c.ellipse(-6, -24 - bob, 4, 6, 0.3, 0, 7); c.fill();
  if (!back) { c.strokeStyle = shade(coat, -0.45); c.lineWidth = 1.6; c.beginPath(); c.moveTo(fx * 3, -24 - bob); c.lineTo(fx * 3, -5 - bob); c.stroke(); c.fillStyle = '#fff'; for (const yy of [-19, -12]) { c.beginPath(); c.arc(fx * 3, yy - bob, 1.3, 0, 7); c.fill(); } }
  c.fillStyle = 'rgba(255,255,255,.9)'; c.fillRect(-12, -6 - bob, 24, 3);
  c.restore();
  if (k.ballRef || k.scoopT > 0) { drawArm(armL, -9); drawArm(armR, 9); }
  else { drawArm(side > 0 ? armL : armR, side > 0 ? -9 : 9); drawArm(hand, side > 0 ? 9 : -9); }
  if (k.charging) { c.fillStyle = '#fff'; c.strokeStyle = '#8ea0cc'; c.lineWidth = 1.5; c.beginPath(); c.arc(hand.x, hand.y - 4, 5 + (k.chargeAmt || 0) * 1.5, 0, 7); c.fill(); c.stroke(); }
  // scarf band
  c.fillStyle = sc.a === 'rainbow' ? RAINBOW[2] : sc.a; c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); c.roundRect(-11.5, -31 - bob, 23, 7, 3.5); c.fill(); c.stroke();
  if (sc.a === 'rainbow') RAINBOW.forEach((col, i) => { c.fillStyle = col; c.fillRect(-10 + i * 3.4, -30 - bob, 3.4, 5); });
  else if (sc.b) { c.fillStyle = sc.b; for (let i = -9; i < 10; i += 6) c.fillRect(i, -30 - bob, 2.5, 5); }
  if (back) tail();
  // head
  const hy = -40 - bob;
  c.fillStyle = k.skin; c.strokeStyle = INK; c.lineWidth = 2.2;
  c.beginPath(); c.arc(0, hy, 11.5, 0, 7); c.fill(); c.stroke();
  if (back) { c.fillStyle = k.hair; c.beginPath(); c.arc(0, hy + 1, 10.4, 0, 7); c.fill(); }
  else {
    const ex = fx * 4.2, ey = hy + 1 + Math.max(0, fy) * 1.5;
    c.fillStyle = k.hair; c.beginPath(); c.ellipse(ex * 0.2, hy - 7, 10, 4.5, 0, Math.PI, 0); c.fill();
    if (k.ko || k.stun > 0.3) {
      c.strokeStyle = INK; c.lineWidth = 1.8;
      for (const s of [-1, 1]) { const x = ex + s * 4.2; c.beginPath(); c.moveTo(x - 2, ey - 2); c.lineTo(x + 2, ey + 2); c.moveTo(x + 2, ey - 2); c.lineTo(x - 2, ey + 2); c.stroke(); }
    } else {
      c.fillStyle = INK;
      for (const s of [-1, 1]) { if (Math.abs(fx) > 0.8 && s === -side) continue; c.beginPath(); c.ellipse(ex + s * 4.2, ey, 1.7, 2.3, 0, 0, 7); c.fill(); }
    }
    c.fillStyle = 'rgba(255,110,120,.5)';
    for (const s of [-1, 1]) { if (Math.abs(fx) > 0.8 && s === -side) continue; c.beginPath(); c.arc(ex + s * 7, ey + 3.5, 2.4, 0, 7); c.fill(); }
    c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath();
    if (k.charging || k.throwAnim > 0) c.arc(ex, ey + 5, 1.8, 0, 7); else c.arc(ex, ey + 4, 2.4, 0.2, Math.PI - 0.2);
    c.stroke();
  }
  drawHat(c, k.hat, 0, hy, back, T, k.hatColor || coat, side);
  // snow splat on the face
  if (k.splatT > 0) {
    c.globalAlpha *= clamp(k.splatT / 0.4, 0, 1);
    c.fillStyle = '#fff'; c.strokeStyle = '#a9b8de'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(k.splatX || 2, hy + 1, 7, 0, 7); c.fill(); c.stroke();
    for (let i = 0; i < 5; i++) { const a = i * 1.26 + k.id; c.beginPath(); c.arc((k.splatX || 2) + Math.cos(a) * 8, hy + 1 + Math.sin(a) * 7, 2.2, 0, 7); c.fill(); }
  }
  c.restore();
  // stun stars + hp pips, not rotated
  c.save(); c.translate(k.x, k.y);
  if (k.fade != null) c.globalAlpha = k.fade;
  if ((k.stun > 0 || k.ko) && !k.out) {
    for (let i = 0; i < 3; i++) { const a = T * 6 + i * 2.09; star(c, Math.cos(a) * 13, (lying ? -26 : -56) + Math.sin(a) * 4, 3.4, '#ffd23f'); }
  }
  if (k.flash > 0) { c.globalAlpha = k.flash * 3; c.fillStyle = '#fff'; c.beginPath(); c.roundRect(-13, -30, 26, 28, 10); c.fill(); c.beginPath(); c.arc(0, -40, 12.5, 0, 7); c.fill(); c.globalAlpha = 1; }
  if (!opts.noPips && !k.ko && !k.out) {
    const y = -66;
    if (!k.isPlayer) for (let i = 0; i < k.maxhp; i++) {
      const x = (i - (k.maxhp - 1) / 2) * 7.5;
      c.fillStyle = i < k.hp ? (k.isPlayer ? '#ffd23f' : k.ring) : 'rgba(30,25,50,.35)';
      c.strokeStyle = INK; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, 2.8, 0, 7); c.fill(); c.stroke();
    }
    if (k.isPlayer && opts.arrow) { const b = Math.sin(T * 6) * 3; c.fillStyle = '#ffd23f'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.moveTo(-7, y - 18 + b); c.lineTo(7, y - 18 + b); c.lineTo(0, y - 9 + b); c.closePath(); c.fill(); c.stroke(); }
  }
  c.restore();
}

export function star(c, x, y, r, col) {
  c.fillStyle = col; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath();
  for (let i = 0; i < 10; i++) { const a = -1.57 + i * 0.628, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill(); c.stroke();
}

export function drawHat(c, type, x, y, back, T, col, side = 1) {
  c.save(); c.translate(x, y); c.strokeStyle = INK; c.lineWidth = 2; c.lineJoin = 'round';
  const dome = (color, band) => {
    c.fillStyle = color; c.beginPath(); c.arc(0, -2, 12.4, Math.PI, 0); c.lineTo(12.4, 0); c.lineTo(-12.4, 0); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.22)'; c.beginPath(); c.ellipse(-4, -9, 4, 2.5, -0.4, 0, 7); c.fill();
    if (band) { c.fillStyle = band; c.beginPath(); c.roundRect(-13.5, -4, 27, 7, 3.5); c.fill(); c.stroke(); }
  };
  switch (type) {
    case 'bobble':
      dome(col, shade(col, -0.25));
      c.fillStyle = '#fff'; c.beginPath(); c.arc(0, -16, 5.5, 0, 7); c.fill(); c.stroke();
      break;
    case 'earmuffs':
      c.strokeStyle = INK; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 12.5, Math.PI + 0.2, -0.2); c.stroke(); c.strokeStyle = '#c84c8a'; c.lineWidth = 2.6; c.stroke();
      c.fillStyle = '#ff9ccf'; c.strokeStyle = INK; c.lineWidth = 2;
      for (const s of [-1, 1]) { c.beginPath(); c.arc(s * 12, 1, 5.5, 0, 7); c.fill(); c.stroke(); }
      break;
    case 'santa': {
      dome('#e0322c');
      const flop = Math.sin(T * 3) * 2;
      c.fillStyle = '#e0322c'; c.beginPath(); c.moveTo(-9, -10); c.quadraticCurveTo(2, -26, side * 16 + flop, -16); c.lineTo(8, -8); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#fff'; c.beginPath(); c.arc(side * 16 + flop, -15, 4.5, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(-14, -4, 28, 7, 3.5); c.fill(); c.stroke();
      break;
    }
    case 'topper':
      c.fillStyle = '#2a2433'; c.beginPath(); c.ellipse(0, -6, 15, 4.5, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.roundRect(-9, -26, 18, 20, 2); c.fill(); c.stroke();
      c.fillStyle = '#e0322c'; c.fillRect(-8, -11, 16, 4);
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -26, 9, 2.5, 0, 0, 7); c.fill();
      break;
    case 'bunny':
      for (const s of [-1, 1]) { c.save(); c.translate(s * 5, -8); c.rotate(s * 0.2 + Math.sin(T * 4 + s) * 0.06); c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -10, 4.6, 11, 0, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#ffb3cf'; c.beginPath(); c.ellipse(0, -10, 2, 7, 0, 0, 7); c.fill(); c.restore(); }
      c.strokeStyle = INK; c.lineWidth = 4; c.beginPath(); c.arc(0, 0, 12, Math.PI + 0.3, -0.3); c.stroke(); c.strokeStyle = '#fff'; c.lineWidth = 2; c.stroke();
      break;
    case 'antlers':
      c.strokeStyle = '#6b4224'; c.lineWidth = 3.5; c.lineCap = 'round';
      for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 6, -8); c.lineTo(s * 12, -22); c.moveTo(s * 9, -15); c.lineTo(s * 16, -16); c.moveTo(s * 11, -19); c.lineTo(s * 8, -26); c.stroke(); }
      dome('#8c5a32', '#6b4224');
      c.fillStyle = '#e23b3b'; c.beginPath(); c.arc(0, -15, 3, 0, 7); c.fill();
      break;
    case 'viking':
      for (const s of [-1, 1]) { c.fillStyle = '#f5ecd2'; c.beginPath(); c.moveTo(s * 10, -6); c.quadraticCurveTo(s * 22, -10, s * 19, -24); c.quadraticCurveTo(s * 16, -12, s * 7, -11); c.closePath(); c.fill(); c.stroke(); }
      dome('#9aa3b5', '#7b8396');
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, -12, 2.2, 0, 7); c.fill();
      break;
    case 'crown':
      c.fillStyle = '#ffd23f';
      c.beginPath(); c.moveTo(-11, -4); c.lineTo(-11, -16); c.lineTo(-5.5, -9); c.lineTo(0, -19); c.lineTo(5.5, -9); c.lineTo(11, -16); c.lineTo(11, -4); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#3ab0ff'; c.beginPath(); c.arc(0, -8, 2.2, 0, 7); c.fill(); c.fillStyle = '#ff4b6b'; c.beginPath(); c.arc(-6.5, -7, 1.6, 0, 7); c.arc(6.5, -7, 1.6, 0, 7); c.fill();
      c.fillStyle = 'rgba(255,255,255,.8)'; star(c, 8 + Math.sin(T * 2) * 2, -18, 2.2, '#fff');
      break;
    default: // beanie
      dome(col, shade(col, -0.3));
      c.strokeStyle = shade(col, -0.3); c.lineWidth = 1.3; for (let i = -8; i <= 8; i += 4) { c.beginPath(); c.moveTo(i, -4); c.lineTo(i * 0.7, -12); c.stroke(); }
  }
  c.restore();
}

// ------------------------------------------------------------ snowballs
export function drawSnowball(c, b) {
  const z = b.z;
  c.fillStyle = 'rgba(48,56,124,.25)';
  c.beginPath(); c.ellipse(b.x + z * 0.25, b.y + 1, 5 - Math.min(2, z / 60), 2.4, 0, 0, 7); c.fill();
  const r = b.big ? 7 : 5.6;
  // motion streak
  c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = r * 1.4; c.lineCap = 'round';
  c.beginPath(); c.moveTo(b.x, b.y - z); c.lineTo(b.x - b.dx * 14, b.y - z - b.dy * 14 + (b.lob ? b.dz * 0.02 : 0)); c.stroke();
  c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 1.8;
  c.beginPath(); c.arc(b.x, b.y - z, r, 0, 7); c.fill(); c.stroke();
  c.fillStyle = 'rgba(150,165,215,.6)'; c.beginPath(); c.arc(b.x + 1.5, b.y - z + 1.5, r * 0.55, 0, 3.14); c.fill();
}

export function drawBigBall(c, b, T) {
  const r = b.r, cy = b.y - r * 0.82;
  c.fillStyle = SHADOW; c.beginPath(); c.ellipse(b.x + r * 0.35, b.y + 1, r * 1.05, r * 0.36, 0, 0, 7); c.fill();
  const g = c.createRadialGradient(b.x - r * 0.4, cy - r * 0.45, r * 0.1, b.x, cy, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#eef2fb'); g.addColorStop(1, '#b4c3e6');
  c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 2.4;
  c.beginPath(); c.arc(b.x, cy, r, 0, 7); c.fill(); c.stroke();
  // speckles + twigs that roll round with it
  c.save(); c.beginPath(); c.arc(b.x, cy, r - 1, 0, 7); c.clip();
  for (let i = 0; i < 9; i++) {
    const a = i * 2.3 + b.seed, ring = 0.25 + (i % 3) * 0.25;
    const ph = b.rot + a;
    const px = b.x + Math.cos(a * 1.7) * r * ring, py = cy + Math.sin(ph) * r * 0.85;
    if (Math.cos(ph) < 0) continue;
    c.fillStyle = i % 4 === 0 ? '#5d4a34' : 'rgba(130,145,200,.55)';
    c.beginPath(); c.ellipse(px, py, i % 4 === 0 ? 3.5 : 2, 1.5, a, 0, 7); c.fill();
  }
  c.restore();
  if (b.r > 22) { c.fillStyle = 'rgba(255,255,255,.7)'; c.beginPath(); c.ellipse(b.x - r * 0.38, cy - r * 0.42, r * 0.22, r * 0.12, -0.6, 0, 7); c.fill(); }
}

// ------------------------------------------------------------ walls
export function drawWallShadow(c, wl) {
  const h = wallHeight(wl);
  c.strokeStyle = SHADOW; c.lineCap = 'round'; c.lineWidth = wl.r * 2;
  c.beginPath(); c.moveTo(wl.x1 + h * 0.6, wl.y1 + 3); c.lineTo(wl.x2 + h * 0.6, wl.y2 + 3); c.stroke();
}
// a packed snow-block wall: footprint box extruded up by its height
export function drawWall(c, wl, T) {
  const h = wallHeight(wl), sh = wl.shake > 0 ? Math.sin(T * 80) * wl.shake * 6 : 0;
  const L = Math.hypot(wl.x2 - wl.x1, wl.y2 - wl.y1) || 1, ux = (wl.x2 - wl.x1) / L, uy = (wl.y2 - wl.y1) / L;
  const r = wl.r, nx = -uy * r, ny = ux * r, ex = ux * 4, ey = uy * 4;
  const P = [[wl.x1 + nx - ex, wl.y1 + ny - ey], [wl.x2 + nx + ex, wl.y2 + ny + ey], [wl.x2 - nx + ex, wl.y2 - ny + ey], [wl.x1 - nx - ex, wl.y1 - ny - ey]];
  c.save(); c.translate(sh, 0); c.lineJoin = 'round'; c.lineWidth = 2.4; c.strokeStyle = INK;
  const quad = (a, b, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.lineTo(b[0], b[1] - h); c.lineTo(a[0], a[1] - h); c.closePath(); c.fill(); c.stroke(); };
  // side faces that face the camera (outward normal points down-screen)
  for (let i = 0; i < 4; i++) {
    const a = P[i], b = P[(i + 1) % 4];
    const ox = b[1] - a[1], oy = -(b[0] - a[0]);
    const cx = (P[0][0] + P[2][0]) / 2, cy = (P[0][1] + P[2][1]) / 2, mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
    const outY = ox * mx + oy * my > 0 ? oy : -oy;
    if (outY > 0.01) {
      const lit = (ox * mx + oy * my > 0 ? ox : -ox) < 0;
      quad(a, b, lit ? '#d9e2f6' : '#b3c1e4');
      // block seams on the face
      const fl = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.round(fl / 26));
      c.save(); c.strokeStyle = 'rgba(110,128,190,.45)'; c.lineWidth = 1.4;
      for (let k = 1; k < n; k++) { const t = k / n, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t; c.beginPath(); c.moveTo(x, y - 2); c.lineTo(x, y - h + 2); c.stroke(); }
      if (h > 14) { c.beginPath(); c.moveTo(a[0], a[1] - h / 2); c.lineTo(b[0], b[1] - h / 2); c.stroke(); }
      c.restore();
    }
  }
  // top
  c.fillStyle = '#f7faff'; c.beginPath();
  P.forEach(([x, y], i) => (i ? c.lineTo(x, y - h) : c.moveTo(x, y - h)));
  c.closePath(); c.fill(); c.stroke();
  // lumpy snow on top
  c.fillStyle = '#ffffff';
  for (let s = 8; s < L; s += 14) { const x = wl.x1 + ux * s, y = wl.y1 + uy * s - h; c.beginPath(); c.ellipse(x, y - 1, 7, 5, 0, 0, 7); c.fill(); }
  c.fillStyle = 'rgba(150,165,215,.35)';
  for (let s = 14; s < L; s += 14) { const x = wl.x1 + ux * s + nx * 0.4, y = wl.y1 + uy * s + ny * 0.4 - h; c.beginPath(); c.arc(x, y, 1.6, 0, 7); c.fill(); }
  // bites out of a damaged wall
  const dmg = 1 - wl.hp / wl.max;
  if (dmg > 0.05) {
    const n = Math.floor(dmg * 8);
    for (let i = 0; i < n; i++) {
      const s = ((wl.seed * (i + 3) * 37) % 1000) / 1000 * L, side = i % 2 ? 0.7 : -0.7;
      const x = wl.x1 + ux * s + nx * side, y = wl.y1 + uy * s + ny * side - h;
      c.fillStyle = '#9aaad6'; c.beginPath(); c.arc(x, y + 1, 3.5 + (i % 3), 0, 7); c.fill();
      c.fillStyle = '#7f90c2'; c.beginPath(); c.arc(x + 0.8, y + 2, 2 + (i % 2), 0, 7); c.fill();
    }
  }
  c.restore();
}

// ------------------------------------------------------------ trees
export function drawTree(c, t, T, alpha = 1) {
  const s = t.s;
  c.save(); c.translate(t.x, t.y); c.globalAlpha = alpha;
  if (t.shake > 0) c.rotate(Math.sin(T * 50) * t.shake * 0.06);
  c.fillStyle = '#6b4428'; c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); c.roundRect(-5 * s, -18 * s, 10 * s, 20 * s, 2); c.fill(); c.stroke();
  const tiers = [[54, -12, 46], [44, -40, 44], [32, -68, 40], [20, -94, 34]];
  for (let i = 0; i < tiers.length; i++) {
    const [tw, yb, th] = tiers[i], w = tw * s, y0 = yb * s, y1 = (yb - th) * s;
    c.fillStyle = i % 2 ? '#2f6150' : '#285646'; c.strokeStyle = INK; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(-w, y0); c.quadraticCurveTo(0, y0 + 8 * s, w, y0); c.lineTo(0, y1); c.closePath(); c.fill(); c.stroke();
    c.fillStyle = 'rgba(20,45,40,.35)'; c.beginPath(); c.moveTo(w * 0.15, y1 + 6 * s); c.lineTo(w, y0); c.quadraticCurveTo(w * 0.5, y0 + 5 * s, w * 0.15, y0 + 3 * s); c.closePath(); c.fill();
    // snow load on each tier
    const f = 0.62 * t.snow;
    if (f > 0.05) {
      c.fillStyle = '#f6f9ff';
      const yl = y1 + (y0 - y1) * f, wl = w * f;
      c.beginPath(); c.moveTo(0, y1 - 1); c.lineTo(-wl - 2, yl);
      const n = 4;
      for (let k = 0; k <= n; k++) { const x = -wl + (2 * wl * k) / n; c.quadraticCurveTo(x - wl / n, yl + 7 * s, x, yl + (k % 2 ? 1 : 4) * s); }
      c.lineTo(0, y1 - 1); c.fill();
      c.fillStyle = 'rgba(160,175,220,.5)'; c.beginPath(); c.moveTo(1, y1 + 3); c.lineTo(wl, yl); c.lineTo(wl * 0.4, yl + 2 * s); c.closePath(); c.fill();
    }
  }
  c.restore();
}

export function drawSnowman(c, s, T) {
  const sh = s.shake > 0 ? Math.sin(T * 70) * s.shake * 4 : 0;
  c.save(); c.translate(s.x + sh, s.y);
  c.fillStyle = SHADOW; c.beginPath(); c.ellipse(16, 2, 32, 9, 0, 0, 7); c.fill();
  const ball = (y, r) => { const g = c.createRadialGradient(-r * 0.35, y - r * 0.4, 1, 0, y, r); g.addColorStop(0, '#fff'); g.addColorStop(1, '#bfcdea'); c.fillStyle = g; c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.arc(0, y, r, 0, 7); c.fill(); c.stroke(); };
  const hp = s.hp;
  ball(-20, 23);
  if (hp > 2) ball(-50, 16);
  if (hp > 2) { c.fillStyle = INK; for (const y of [-56, -48, -40]) { c.beginPath(); c.arc(0, y + 2, 2, 0, 7); c.fill(); } }
  // stick arms
  if (hp > 2) { c.strokeStyle = '#5a3a22'; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(-14, -52); c.lineTo(-32, -66); c.lineTo(-36, -74); c.moveTo(-26, -61); c.lineTo(-33, -60); c.moveTo(14, -52); c.lineTo(34, -60); c.moveTo(27, -57); c.lineTo(31, -66); c.stroke(); }
  if (hp > 4) {
    ball(-74, 12);
    c.fillStyle = INK; c.beginPath(); c.arc(-4, -77, 1.8, 0, 7); c.arc(4, -77, 1.8, 0, 7); c.fill();
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.arc(i * 2.6, -69 + Math.abs(i) * -0.8, 1.1, 0, 7); c.fill(); }
    c.fillStyle = '#f07c2a'; c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.moveTo(0, -75); c.lineTo(-14, -71); c.lineTo(0, -71.5); c.closePath(); c.fill(); c.stroke();
    // scarf + hat
    c.fillStyle = '#e23b3b'; c.beginPath(); c.roundRect(-13, -66, 26, 6, 3); c.fill(); c.stroke();
    c.beginPath(); c.roundRect(6, -64, 6, 16, 3); c.fill(); c.stroke();
    c.fillStyle = '#2a2433'; c.beginPath(); c.ellipse(0, -84, 14, 3.5, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.roundRect(-8, -100, 16, 16, 2); c.fill(); c.stroke();
    c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -100, 8, 2.2, 0, 0, 7); c.fill();
  } else if (hp > 2) {
    c.fillStyle = '#f07c2a'; c.beginPath(); c.moveTo(18, -6); c.lineTo(4, -2); c.lineTo(18, -1); c.closePath(); c.fill();
  }
  c.restore();
}

// ------------------------------------------------------------ fixed props
export function drawRect(c, q, T) {
  c.save(); c.lineJoin = 'round';
  const { x, y, w, h } = q, H = q.h3;
  switch (q.kind) {
    case 'shed': {
      c.fillStyle = '#7a5038'; c.strokeStyle = INK; c.lineWidth = 2.5;
      c.beginPath(); c.rect(x, y + h - H, w, H); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(40,20,10,.35)'; c.lineWidth = 2; for (let px = x + 14; px < x + w; px += 14) { c.beginPath(); c.moveTo(px, y + h - H + 2); c.lineTo(px, y + h); c.stroke(); }
      c.fillStyle = '#4a2e1e'; c.strokeStyle = INK; c.lineWidth = 2; c.beginPath(); c.rect(x + w * 0.62, y + h - H + 12, 30, H - 12); c.fill(); c.stroke();
      c.fillStyle = '#ffd88a'; c.beginPath(); c.rect(x + 18, y + h - H + 14, 34, 22); c.fill(); c.stroke();
      c.strokeStyle = INK; c.beginPath(); c.moveTo(x + 35, y + h - H + 14); c.lineTo(x + 35, y + h - H + 36); c.moveTo(x + 18, y + h - H + 25); c.lineTo(x + 52, y + h - H + 25); c.stroke();
      // roof with snow
      c.fillStyle = '#5a3b2a'; c.beginPath(); c.rect(x - 8, y - H + 6, w + 16, h + 2); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.roundRect(x - 6, y - H + 4, w + 12, h - 4, 8); c.fill();
      c.fillStyle = '#c7d3ee'; c.beginPath(); c.rect(x - 6, y - H + 4 + h * 0.45, w + 12, 3); c.fill();
      for (let px = x; px < x + w; px += 18) { c.fillStyle = '#f6f9ff'; c.beginPath(); c.arc(px + 6, y - H + h + 2, 6, 0, 3.14); c.fill(); }
      // icicles
      c.fillStyle = '#dff1ff'; for (let px = x + 4; px < x + w; px += 11) { c.beginPath(); c.moveTo(px, y - H + h + 6); c.lineTo(px + 3, y - H + h + 14 + (px % 7)); c.lineTo(px + 6, y - H + h + 6); c.fill(); }
      break;
    }
    case 'greenhouse': {
      c.fillStyle = 'rgba(190,230,240,.55)'; c.strokeStyle = '#e8f0ff'; c.lineWidth = 3;
      c.beginPath(); c.rect(x, y + h - H, w, H); c.fill(); c.stroke();
      c.fillStyle = 'rgba(80,140,90,.6)'; for (let px = x + 10; px < x + w - 10; px += 22) { c.beginPath(); c.arc(px + 6, y + h - 10, 8, 0, 7); c.fill(); }
      c.strokeStyle = '#e8f0ff'; c.lineWidth = 2; for (let px = x + 28; px < x + w; px += 28) { c.beginPath(); c.moveTo(px, y + h - H); c.lineTo(px, y + h); c.stroke(); }
      c.fillStyle = 'rgba(200,235,250,.6)'; c.strokeStyle = '#e8f0ff'; c.beginPath(); c.rect(x, y - H, w, h); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.roundRect(x + 4, y - H + 4, w - 8, h * 0.5, 8); c.fill();
      c.strokeStyle = INK; c.lineWidth = 2; c.strokeRect(x, y - H, w, h + H);
      break;
    }
    case 'hedge': {
      c.fillStyle = '#244a3a'; c.strokeStyle = INK; c.lineWidth = 2.4;
      c.beginPath(); c.roundRect(x, y + h - H, w, H, 6); c.fill(); c.stroke();
      c.fillStyle = 'rgba(70,120,90,.5)'; for (let px = x + 8; px < x + w; px += 14) { c.beginPath(); c.arc(px, y + h - H * 0.5 + ((px * 7) % 9) - 4, 5, 0, 7); c.fill(); }
      c.fillStyle = '#2e5c48'; c.beginPath(); c.roundRect(x, y - H, w, h + 4, 6); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.roundRect(x + 3, y - H + 2, w - 6, h - 4, 6); c.fill();
      for (let px = x + 6; px < x + w - 4; px += 13) { c.beginPath(); c.arc(px, y - H + h - 3, 5, 0, 3.14); c.fill(); }
      break;
    }
    case 'bench': {
      c.fillStyle = SHADOW; c.fillRect(x + 8, y + h - 4, w, 8);
      c.strokeStyle = INK; c.lineWidth = 2;
      c.fillStyle = '#3a3048'; for (const lx of [x + 8, x + w - 14]) { c.fillRect(lx, y + h - 12, 6, 12); c.strokeRect(lx, y + h - 12, 6, 12); }
      c.fillStyle = '#9a6640'; c.beginPath(); c.roundRect(x, y - 12, w, h, 4); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(40,20,10,.4)'; for (let py = y - 4; py < y + h - 12; py += 8) { c.beginPath(); c.moveTo(x + 3, py); c.lineTo(x + w - 3, py); c.stroke(); }
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.roundRect(x + 6, y - 13, w - 22, h * 0.55, 6); c.fill();
      break;
    }
    case 'bed': {
      c.fillStyle = '#7a5038'; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.rect(x, y + h - H, w, H); c.fill(); c.stroke();
      c.fillStyle = '#5b3d2a'; c.beginPath(); c.rect(x, y - H, w, h); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.roundRect(x + 4, y - H + 3, w - 8, h - 6, 8); c.fill();
      c.fillStyle = '#4c8a46'; for (let i = 0; i < 4; i++) { const px = x + 14 + i * (w - 28) / 3, py = y - H + h / 2; c.beginPath(); c.ellipse(px, py, 5, 3, 0.5, 0, 7); c.fill(); }
      break;
    }
    case 'frame': {
      const legs = [[x, y], [x + w, y], [x, y + h], [x + w, y + h]];
      c.lineCap = 'round';
      const bar = (x1, y1, x2, y2, col) => { c.strokeStyle = INK; c.lineWidth = 7; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = col; c.lineWidth = 4; c.stroke(); };
      for (const [lx, ly] of legs) bar(lx, ly, lx, ly - 60, '#e23b3b');
      bar(x, y - 60, x + w, y - 60, '#3d7be0'); bar(x, y + h - 60, x + w, y + h - 60, '#3d7be0');
      for (let px = x + 20; px < x + w; px += 24) bar(px, y - 60, px, y + h - 60, '#ffcf3a');
      c.strokeStyle = '#f6f9ff'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, y + h - 63); c.lineTo(x + w, y + h - 63); c.stroke();
      break;
    }
    case 'compost': {
      c.fillStyle = '#2e5040'; c.strokeStyle = INK; c.lineWidth = 2;
      c.beginPath(); c.rect(x, y + h - H, w, H); c.fill(); c.stroke();
      c.fillStyle = '#3a6450'; c.beginPath(); c.rect(x, y - H, w, h); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.roundRect(x + 4, y - H + 3, w - 8, h - 8, 8); c.fill();
      break;
    }
  }
  c.restore();
}

export function drawPost(c, p, T) {
  c.save(); c.translate(p.x, p.y); c.strokeStyle = INK; c.lineWidth = 2; c.lineJoin = 'round';
  switch (p.kind) {
    case 'lamp': {
      c.fillStyle = '#2f2d3e'; c.beginPath(); c.roundRect(-3.5, -96, 7, 96, 2); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, 0, 8, 3, 0, 0, 7); c.fill(); c.stroke();
      const g = c.createRadialGradient(0, -104, 2, 0, -104, 40); g.addColorStop(0, 'rgba(255,220,150,.75)'); g.addColorStop(1, 'rgba(255,200,120,0)');
      c.fillStyle = g; c.beginPath(); c.arc(0, -104, 40, 0, 7); c.fill();
      c.fillStyle = '#ffe6a8'; c.beginPath(); c.roundRect(-8, -114, 16, 18, 3); c.fill(); c.stroke();
      c.fillStyle = '#2f2d3e'; c.beginPath(); c.moveTo(-11, -114); c.lineTo(0, -124); c.lineTo(11, -114); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -120, 7, 3, 0, 0, 7); c.fill();
      break;
    }
    case 'bath':
      c.fillStyle = SHADOW; c.beginPath(); c.ellipse(10, 2, 20, 6, 0, 0, 7); c.fill();
      c.fillStyle = '#a49a90'; c.beginPath(); c.roundRect(-6, -22, 12, 22, 3); c.fill(); c.stroke();
      c.beginPath(); c.ellipse(0, -24, 19, 8, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#bfe3f3'; c.beginPath(); c.ellipse(0, -25, 14, 5, 0, 0, 7); c.fill();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(-5, -26, 7, 3, 0, 0, 7); c.fill();
      break;
    case 'bin':
      c.fillStyle = '#2e5c48'; c.beginPath(); c.roundRect(-11, -26, 22, 26, 4); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -26, 12, 5, 0, 0, 7); c.fill(); c.stroke();
      break;
    case 'hoop':
      c.fillStyle = '#5a5f70'; c.beginPath(); c.roundRect(-3, -110, 6, 110, 2); c.fill(); c.stroke();
      c.fillStyle = '#f2f2f2'; c.beginPath(); c.rect(-22, -136, 44, 30); c.fill(); c.stroke();
      c.strokeStyle = '#e8562a'; c.lineWidth = 3; c.beginPath(); c.ellipse(0, -106, 10, 4, 0, 0, 7); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -137, 22, 3, 0, 0, 7); c.fill();
      break;
    case 'scarecrow':
      c.fillStyle = '#8a6a3a'; c.beginPath(); c.rect(-3, -70, 6, 70); c.fill(); c.stroke();
      c.beginPath(); c.rect(-30, -58, 60, 5); c.fill(); c.stroke();
      c.fillStyle = '#5a6ab0'; c.beginPath(); c.moveTo(-16, -58); c.lineTo(16, -58); c.lineTo(12, -28); c.lineTo(-12, -28); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#e8c98a'; c.beginPath(); c.arc(0, -70, 10, 0, 7); c.fill(); c.stroke();
      c.fillStyle = INK; c.fillRect(-5, -72, 3, 3); c.fillRect(2, -72, 3, 3);
      c.fillStyle = '#6a4a2a'; c.beginPath(); c.ellipse(0, -78, 16, 4, 0, 0, 7); c.fill(); c.stroke(); c.beginPath(); c.roundRect(-8, -90, 16, 12, 4); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -90, 8, 2.5, 0, 0, 7); c.fill(); c.beginPath(); c.ellipse(-20, -59, 9, 2.5, 0, 0, 7); c.fill();
      break;
    case 'bandstand': {
      const r = p.r;
      c.fillStyle = '#a49a90'; c.beginPath(); c.ellipse(0, 0, r + 6, (r + 6) * 0.5, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#c8bdb2'; c.beginPath(); c.ellipse(0, -10, r + 6, (r + 6) * 0.5, 0, 0, 7); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.ellipse(0, -10, r, r * 0.46, 0, 0, 7); c.fill();
      for (let i = 0; i < 8; i++) { const a = i * 0.785 + 0.39; const px = Math.cos(a) * r * 0.92, py = -10 + Math.sin(a) * r * 0.45; c.fillStyle = '#ece6dc'; c.beginPath(); c.rect(px - 3, py - 92, 6, 92); c.fill(); c.stroke(); }
      c.fillStyle = '#3d6a5a'; c.beginPath(); c.ellipse(0, -104, r + 14, (r + 14) * 0.42, 0, 0, 7); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(-r - 14, -104); c.lineTo(0, -152); c.lineTo(r + 14, -104); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#f6f9ff'; c.beginPath(); c.moveTo(-r - 8, -108); c.quadraticCurveTo(0, -100, r + 8, -108); c.lineTo(0, -150); c.closePath(); c.fill();
      c.fillStyle = '#ffd23f'; c.beginPath(); c.arc(0, -154, 4, 0, 7); c.fill(); c.stroke();
      c.strokeStyle = 'rgba(255,215,140,.8)'; c.lineWidth = 2; c.setLineDash([3, 6]); c.beginPath(); c.ellipse(0, -100, r + 12, (r + 12) * 0.42, 0, 0, 3.14); c.stroke(); c.setLineDash([]);
      break;
    }
  }
  c.restore();
}

export function drawWashing(c, d, T) {
  c.save(); c.strokeStyle = INK; c.lineWidth = 2;
  for (const x of [d.x1, d.x2]) { c.fillStyle = '#7a5038'; c.beginPath(); c.rect(x - 3, d.y1 - 70, 6, 70); c.fill(); c.stroke(); }
  c.strokeStyle = '#e8e4dc'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(d.x1, d.y1 - 66); c.quadraticCurveTo((d.x1 + d.x2) / 2, d.y1 - 52, d.x2, d.y1 - 66); c.stroke();
  const cols = ['#e5483d', '#3d7be0', '#f4b931', '#ec6aa6', '#4fae4f'];
  for (let i = 0; i < 5; i++) {
    const t = (i + 1) / 6, x = d.x1 + (d.x2 - d.x1) * t, y = d.y1 - 66 + Math.sin(t * Math.PI) * 13 * 1.05;
    c.save(); c.translate(x, y); c.rotate(Math.sin(T * 2 + i) * 0.08);
    c.fillStyle = cols[i]; c.strokeStyle = INK; c.lineWidth = 1.8;
    if (i % 2) { c.beginPath(); c.rect(-8, 0, 16, 18); c.fill(); c.stroke(); c.beginPath(); c.rect(-8, 18, 7, 8); c.rect(1, 18, 7, 8); c.fill(); c.stroke(); }
    else { c.beginPath(); c.moveTo(-12, 0); c.lineTo(12, 0); c.lineTo(9, 20); c.lineTo(-9, 20); c.closePath(); c.fill(); c.stroke(); }
    c.restore();
  }
  c.restore();
}

// ------------------------------------------------------------ the dog
export function drawDog(c, d, T) {
  c.save(); c.translate(d.x, d.y);
  const dir = d.vx >= 0 ? 1 : -1;
  c.fillStyle = SHADOW; c.beginPath(); c.ellipse(6, 1, 22, 6, 0, 0, 7); c.fill();
  c.scale(dir, 1);
  const run = Math.sin(T * 26) * 4;
  c.strokeStyle = INK; c.lineWidth = 2; c.lineCap = 'round';
  // legs
  c.strokeStyle = '#6a3e22'; c.lineWidth = 4;
  c.beginPath(); c.moveTo(-10, -10); c.lineTo(-12 - run, -1); c.moveTo(-6, -10); c.lineTo(-4 + run, -1); c.moveTo(8, -10); c.lineTo(10 + run, -1); c.moveTo(12, -10); c.lineTo(14 - run, -1); c.stroke();
  // tail
  c.strokeStyle = '#a8683a'; c.lineWidth = 4; c.beginPath(); c.moveTo(-16, -16); c.quadraticCurveTo(-24, -22 + Math.sin(T * 30) * 5, -26, -28); c.stroke();
  c.fillStyle = '#b8743f'; c.strokeStyle = INK; c.lineWidth = 2;
  c.beginPath(); c.ellipse(0, -15, 18, 8, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = '#f2e3cc'; c.beginPath(); c.ellipse(4, -11, 9, 3.5, 0, 0, 7); c.fill();
  c.fillStyle = '#e23b3b'; c.beginPath(); c.roundRect(10, -24, 5, 10, 2); c.fill();
  c.fillStyle = '#b8743f'; c.beginPath(); c.ellipse(18, -24, 8.5, 7.5, 0, 0, 7); c.fill(); c.stroke();
  c.beginPath(); c.ellipse(25, -21, 5, 3.5, 0, 0, 7); c.fill(); c.stroke();
  c.fillStyle = INK; c.beginPath(); c.arc(29, -22, 2, 0, 7); c.fill(); c.beginPath(); c.arc(19, -26, 1.6, 0, 7); c.fill();
  c.fillStyle = '#6a3e22'; c.beginPath(); c.ellipse(13, -27 + run * 0.4, 3.5, 7, -0.6, 0, 7); c.fill(); c.stroke();
  if (d.tongue) { c.fillStyle = '#ff7a9a'; c.beginPath(); c.ellipse(26, -16, 2.5, 4, 0, 0, 7); c.fill(); }
  c.restore();
}
