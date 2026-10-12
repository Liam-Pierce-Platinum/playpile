// Vector drawing: axes, logs, apples, background, HUD text.
const TAU = Math.PI * 2;
export const INK = '#2a1608';

export function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------------------------------------------------------------- axe
// Local frame: the cutting edge is at the top (y≈0), handle hangs down to y=len.
function headPath(c, shape) {
  c.beginPath();
  switch (shape) {
    case 'broad':
      c.moveTo(8, 36); c.lineTo(8, 27); c.quadraticCurveTo(24, 22, 29, 8); c.quadraticCurveTo(0, -9, -29, 8);
      c.quadraticCurveTo(-24, 22, -8, 27); c.lineTo(-8, 36); break;
    case 'double':
      c.moveTo(8, 36); c.lineTo(8, 25); c.quadraticCurveTo(28, 28, 27, 5); c.quadraticCurveTo(0, -4, -27, 5);
      c.quadraticCurveTo(-28, 28, -8, 25); c.lineTo(-8, 36); break;
    case 'tomahawk':
      c.moveTo(6, 36); c.lineTo(6, 24); c.quadraticCurveTo(13, 16, 15, 4); c.quadraticCurveTo(0, -4, -15, 4);
      c.quadraticCurveTo(-13, 16, -6, 24); c.lineTo(-6, 36); break;
    case 'cleaver':
      c.moveTo(8, 36); c.lineTo(8, 31); c.lineTo(19, 31); c.lineTo(19, 3); c.quadraticCurveTo(0, 0, -19, 3);
      c.lineTo(-19, 31); c.lineTo(-8, 31); c.lineTo(-8, 36); break;
    default: // classic bearded
      c.moveTo(8, 36); c.lineTo(8, 26); c.quadraticCurveTo(17, 18, 22, 6); c.quadraticCurveTo(2, -6, -22, 10);
      c.quadraticCurveTo(-25, 27, -15, 32); c.quadraticCurveTo(-10, 29, -8, 26); c.lineTo(-8, 36);
  }
  c.closePath();
}
function edgePath(c, shape) {
  c.beginPath();
  switch (shape) {
    case 'broad': c.moveTo(29, 8); c.quadraticCurveTo(0, -9, -29, 8); break;
    case 'double': c.moveTo(27, 5); c.quadraticCurveTo(0, -4, -27, 5); break;
    case 'tomahawk': c.moveTo(15, 4); c.quadraticCurveTo(0, -4, -15, 4); break;
    case 'cleaver': c.moveTo(19, 3); c.quadraticCurveTo(0, 0, -19, 3); break;
    default: c.moveTo(22, 6); c.quadraticCurveTo(2, -6, -22, 10);
  }
}

export function drawAxe(c, sk, x, y, rot, s = 1, alpha = 1) {
  c.save();
  c.translate(x, y); c.rotate(rot); if (s !== 1) c.scale(s, s);
  if (alpha < 1) c.globalAlpha = alpha;
  c.lineJoin = 'round'; c.lineCap = 'round';
  const len = 150;
  // handle
  if (sk.glow) { c.shadowColor = sk.glow; c.shadowBlur = 16; }
  rr(c, -6, 30, 12, len - 30, 6);
  c.fillStyle = sk.handle; c.fill();
  c.shadowBlur = 0;
  if (sk.stripe) {
    c.save(); rr(c, -6, 30, 12, len - 30, 6); c.clip();
    c.fillStyle = sk.stripe;
    for (let yy = 30; yy < len + 10; yy += 16) { c.beginPath(); c.moveTo(-8, yy); c.lineTo(8, yy - 8); c.lineTo(8, yy - 2); c.lineTo(-8, yy + 6); c.fill(); }
    c.restore();
  }
  c.fillStyle = 'rgba(255,255,255,0.28)'; rr(c, -3.5, 40, 3, len - 58, 1.5); c.fill();
  // grip wrap
  c.fillStyle = sk.wrap; rr(c, -7, len - 40, 14, 30, 4); c.fill();
  c.strokeStyle = 'rgba(0,0,0,0.3)'; c.lineWidth = 1.6;
  for (let yy = len - 34; yy < len - 10; yy += 6) { c.beginPath(); c.moveTo(-7, yy); c.lineTo(7, yy + 3); c.stroke(); }
  c.strokeStyle = INK; c.lineWidth = 3;
  rr(c, -6, 30, 12, len - 30, 6); c.stroke();
  rr(c, -7, len - 40, 14, 30, 4); c.stroke();
  // pommel
  c.beginPath(); c.arc(0, len, 7, 0, TAU); c.fillStyle = sk.handle; c.fill(); c.stroke();
  // feathers
  if (sk.feathers) {
    sk.feathers.forEach((col, i) => {
      c.save(); c.translate(6, 46 + i * 7); c.rotate(0.5 + i * 0.25);
      c.beginPath(); c.ellipse(0, 16, 5, 15, 0, 0, TAU); c.fillStyle = col; c.fill();
      c.lineWidth = 2; c.stroke(); c.beginPath(); c.moveTo(0, 2); c.lineTo(0, 28); c.lineWidth = 1.2; c.stroke();
      c.restore();
    });
    c.lineWidth = 3;
  }
  // head
  if (sk.glow) { c.shadowColor = sk.glow; c.shadowBlur = 18; }
  headPath(c, sk.shape); c.fillStyle = sk.head; c.fill();
  c.shadowBlur = 0;
  c.save(); headPath(c, sk.shape); c.clip();
  c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(0, -10, 40, 60); // shaded half
  edgePath(c, sk.shape); c.strokeStyle = sk.edge; c.lineWidth = 9; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.moveTo(-14, 8); c.lineTo(-6, 6); c.lineTo(-9, 20); c.lineTo(-15, 20); c.fill();
  c.restore();
  headPath(c, sk.shape); c.strokeStyle = INK; c.lineWidth = 3; c.stroke();
  if (sk.shape === 'cleaver') { c.beginPath(); c.arc(12, 23, 3.5, 0, TAU); c.fillStyle = INK; c.fill(); }
  // collar (the eye of the axe)
  rr(c, -9, 26, 18, 13, 3); c.fillStyle = '#3d4249'; c.fill(); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(-6, 28.5, 12, 2.5);
  c.restore();
}

// ---------------------------------------------------------------- apple
export function drawApple(c, x, y, rot, r = 15, half = 0) {
  c.save(); c.translate(x, y); c.rotate(rot);
  c.lineJoin = 'round';
  if (half) { // a sliced half: clip one side, show the flesh
    c.beginPath(); c.rect(half < 0 ? -r - 4 : 0, -r - 10, r + 4, 2 * r + 14); c.clip();
  }
  c.beginPath();
  c.moveTo(0, -r * 0.7);
  c.bezierCurveTo(r * 0.6, -r * 1.2, r * 1.25, -r * 0.5, r * 1.0, r * 0.25);
  c.bezierCurveTo(r * 0.85, r * 0.95, r * 0.3, r * 1.1, 0, r * 0.9);
  c.bezierCurveTo(-r * 0.3, r * 1.1, -r * 0.85, r * 0.95, -r * 1.0, r * 0.25);
  c.bezierCurveTo(-r * 1.25, -r * 0.5, -r * 0.6, -r * 1.2, 0, -r * 0.7);
  c.closePath();
  c.fillStyle = '#e8322b'; c.fill();
  c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
  if (half) {
    c.fillStyle = '#fff3c8'; c.beginPath(); c.ellipse(0, r * 0.1, 3, r * 0.75, 0, 0, TAU); c.fill();
  } else {
    c.fillStyle = 'rgba(255,255,255,0.55)'; c.beginPath(); c.ellipse(-r * 0.45, -r * 0.2, r * 0.18, r * 0.3, 0.4, 0, TAU); c.fill();
  }
  c.strokeStyle = INK; c.lineWidth = 3; c.lineCap = 'round';
  c.beginPath(); c.moveTo(0, -r * 0.65); c.quadraticCurveTo(1, -r * 1.1, 4, -r * 1.35); c.stroke();
  c.beginPath(); c.moveTo(3, -r * 1.05); c.quadraticCurveTo(r * 0.7, -r * 1.6, r * 1.0, -r * 1.05); c.quadraticCurveTo(r * 0.5, -r * 0.8, 3, -r * 1.05);
  c.fillStyle = '#5fb83a'; c.fill(); c.lineWidth = 2; c.stroke();
  c.restore();
}

// ---------------------------------------------------------------- log
function knot(c, x, y, rx, ry, col) {
  c.beginPath(); c.ellipse(x, y, rx, ry, 0.3, 0, TAU); c.fillStyle = col; c.fill();
  c.beginPath(); c.ellipse(x, y, rx * 0.5, ry * 0.5, 0.3, 0, TAU); c.fillStyle = INK; c.globalAlpha *= 0.6; c.fill(); c.globalAlpha /= 0.6;
}

// Draws the log centred at the current origin.
export function drawLog(c, L, R, rot, time, dmg = 0, flash = 0) {
  c.save();
  c.rotate(rot);
  c.lineJoin = 'round';
  // bark with a bumpy edge
  c.beginPath();
  for (let i = 0; i <= 90; i++) {
    const a = (i / 90) * TAU;
    const r = R + 2.6 * Math.sin(a * 11) + 1.6 * Math.sin(a * 23 + 1);
    if (i) c.lineTo(Math.cos(a) * r, Math.sin(a) * r); else c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  if (L.style === 'ember') { c.shadowColor = '#ff6a1f'; c.shadowBlur = 30 + 10 * Math.sin(time * 5); }
  if (L.style === 'gold') { c.shadowColor = '#ffe27a'; c.shadowBlur = 26; }
  c.fillStyle = L.bark; c.fill(); c.shadowBlur = 0;
  c.lineWidth = 4.5; c.strokeStyle = INK; c.stroke();
  // bark grooves
  c.strokeStyle = L.barkDark; c.lineWidth = 3; c.lineCap = 'round';
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * TAU + 0.13 * Math.sin(i * 7);
    const r0 = R - 11 + (i % 3) * 1.5, r1 = R - 3;
    c.beginPath(); c.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); c.lineTo(Math.cos(a + 0.03) * r1, Math.sin(a + 0.03) * r1); c.stroke();
  }
  if (L.style === 'birch') {
    c.fillStyle = '#f3ede2';
    for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3; c.beginPath(); c.arc(0, 0, R - 6, a, a + 0.25); c.arc(0, 0, R - 2, a + 0.25, a, true); c.fill(); }
  }
  if (L.style === 'moss') {
    c.fillStyle = '#6fa63a';
    for (let i = 0; i < 10; i++) { const a = i * 0.63 + 0.2; const rr2 = 7 + (i % 3) * 3; c.beginPath(); c.arc(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), rr2, 0, TAU); c.fill(); }
    c.strokeStyle = INK; c.lineWidth = 2;
    for (let i = 0; i < 10; i++) { const a = i * 0.63 + 0.2; const rr2 = 7 + (i % 3) * 3; c.beginPath(); c.arc(Math.cos(a) * (R - 3), Math.sin(a) * (R - 3), rr2, a - 1.6, a + 1.6); c.stroke(); }
  }
  // end-grain face
  const r2 = R - 14;
  c.beginPath(); c.arc(0, 0, r2, 0, TAU);
  const g = c.createRadialGradient(0, 0, r2 * 0.1, 0, 0, r2);
  g.addColorStop(0, L.wood); g.addColorStop(1, L.ring);
  c.fillStyle = g; c.fill();
  c.lineWidth = 3; c.strokeStyle = L.barkDark; c.stroke();
  // growth rings, slightly off centre so the spin reads
  c.strokeStyle = L.ring; c.lineWidth = 2.4; c.globalAlpha = 0.7;
  for (let k = 1; k <= 5; k++) {
    const rr2 = (r2 * k) / 6;
    c.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * TAU, w = rr2 + 1.8 * Math.sin(a * 5 + k);
      const px = Math.cos(a) * w + k * 1.4, py = Math.sin(a) * w - k * 0.8;
      if (i) c.lineTo(px, py); else c.moveTo(px, py);
    }
    c.stroke();
  }
  c.globalAlpha = 1;
  // knots
  knot(c, r2 * 0.52, r2 * 0.22, 9, 6, L.ring);
  if (L.style === 'knots') { knot(c, -r2 * 0.4, r2 * 0.45, 12, 8, L.ring); knot(c, -r2 * 0.2, -r2 * 0.6, 8, 6, L.ring); }
  // heartwood
  c.beginPath(); c.arc(2, -1, 4, 0, TAU); c.fillStyle = L.barkDark; c.fill();
  // cracks grow as it fills with axes
  const nCr = 1 + Math.floor(dmg * 4);
  c.strokeStyle = L.style === 'ember' ? '#ffb03a' : INK; c.lineWidth = L.style === 'ember' ? 3 : 2.2; c.globalAlpha = 0.75;
  if (L.style === 'ember') { c.shadowColor = '#ff7a1f'; c.shadowBlur = 10; }
  for (let i = 0; i < nCr; i++) {
    const a = i * 2.4 + 0.7;
    c.beginPath(); c.moveTo(Math.cos(a) * 10, Math.sin(a) * 10);
    for (let j = 1; j <= 4; j++) { const rj = 10 + (r2 - 18) * (j / 4), aj = a + (j % 2 ? 0.08 : -0.06); c.lineTo(Math.cos(aj) * rj, Math.sin(aj) * rj); }
    c.stroke();
  }
  c.globalAlpha = 1; c.shadowBlur = 0;
  // boss dressing
  if (L.style === 'bands') {
    c.beginPath(); c.arc(0, 0, R - 6, 0, TAU); c.lineWidth = 11; c.strokeStyle = '#6b7580'; c.stroke();
    c.lineWidth = 2.5; c.strokeStyle = INK;
    c.beginPath(); c.arc(0, 0, R - 0.5, 0, TAU); c.stroke(); c.beginPath(); c.arc(0, 0, R - 11.5, 0, TAU); c.stroke();
    c.fillStyle = '#c9d1d8';
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; c.beginPath(); c.arc(Math.cos(a) * (R - 6), Math.sin(a) * (R - 6), 2.6, 0, TAU); c.fill(); }
  }
  if (L.style === 'ice') {
    c.fillStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9; const x = Math.cos(a) * (R - 4), y = Math.sin(a) * (R - 4);
      c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a + 0.4) * 14, y + Math.sin(a + 0.4) * 14); c.lineTo(x + Math.cos(a - 0.5) * 9, y + Math.sin(a - 0.5) * 9); c.fill();
    }
  }
  if (L.style === 'gold') {
    c.fillStyle = '#fffbe0';
    for (let i = 0; i < 5; i++) {
      const a = i * 1.3 + time * 0.3, rr2 = r2 * (0.3 + 0.12 * i), s = 3 + 3 * Math.abs(Math.sin(time * 3 + i));
      const x = Math.cos(a) * rr2, y = Math.sin(a) * rr2;
      c.beginPath(); c.moveTo(x, y - s * 2); c.lineTo(x + s * 0.5, y); c.lineTo(x, y + s * 2); c.lineTo(x - s * 0.5, y); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x - s * 2, y); c.lineTo(x, y + s * 0.5); c.lineTo(x + s * 2, y); c.lineTo(x, y - s * 0.5); c.closePath(); c.fill();
    }
  }
  if (L.face) drawFace(c, r2, time, L.style);
  c.restore();
  // fixed lighting: highlight top-left, shade bottom-right
  const lg = c.createLinearGradient(-R, -R, R, R);
  lg.addColorStop(0, 'rgba(255,240,210,0.22)'); lg.addColorStop(0.5, 'rgba(255,240,210,0)'); lg.addColorStop(1, 'rgba(40,10,0,0.22)');
  c.beginPath(); c.arc(0, 0, R + 2, 0, TAU); c.fillStyle = lg; c.fill();
  if (flash > 0) { c.beginPath(); c.arc(0, 0, R + 3, 0, TAU); c.fillStyle = `rgba(255,255,255,${0.35 * flash})`; c.fill(); }
}

function drawFace(c, r2, time, style) {
  const ey = -r2 * 0.12, ex = r2 * 0.36;
  const blink = Math.sin(time * 1.3) > 0.97 ? 0.15 : 1;
  const glow = style === 'ember' ? '#ffcf3a' : style === 'ice' ? '#e9fbff' : '#fff6e0';
  for (const sx of [-1, 1]) {
    c.save(); c.translate(sx * ex, ey); c.scale(1, blink);
    c.beginPath(); c.ellipse(0, 0, 15, 12, 0, 0, TAU); c.fillStyle = glow; c.fill();
    c.lineWidth = 3; c.strokeStyle = INK; c.stroke();
    c.beginPath(); c.arc(-sx * 3, 2, 5.5, 0, TAU); c.fillStyle = INK; c.fill();
    c.restore();
    c.beginPath(); c.moveTo(sx * (ex + 20), ey - 22); c.lineTo(sx * (ex - 14), ey - 11);
    c.lineWidth = 7; c.lineCap = 'round'; c.strokeStyle = INK; c.stroke();
  }
  // jagged grimace
  c.beginPath(); const my = r2 * 0.32, mw = r2 * 0.34;
  c.moveTo(-mw, my);
  for (let i = 1; i <= 6; i++) c.lineTo(-mw + (2 * mw * i) / 6, my + (i % 2 ? -7 : 2));
  c.lineWidth = 5; c.strokeStyle = INK; c.stroke();
}

// ---------------------------------------------------------------- background
function pine(c, x, base, h, col) {
  c.fillStyle = col;
  c.fillRect(x - h * 0.04, base - h * 0.2, h * 0.08, h * 0.25);
  for (let i = 0; i < 3; i++) {
    const w = h * (0.34 - i * 0.07), y0 = base - h * 0.15 - i * h * 0.24, y1 = y0 - h * 0.42;
    c.beginPath(); c.moveTo(x - w, y0); c.lineTo(x, y1); c.lineTo(x + w, y0); c.closePath(); c.fill();
  }
}
export function paintBackground(c, W, H, sunX, sunY, sunR) {
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#ffcf85'); g.addColorStop(0.55, '#f6a35d'); g.addColorStop(1, '#dc6b3d');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  // warm sun glow behind the log
  const sg = c.createRadialGradient(sunX, sunY, sunR * 0.3, sunX, sunY, sunR * 2.6);
  sg.addColorStop(0, 'rgba(255,246,214,0.95)'); sg.addColorStop(0.35, 'rgba(255,230,170,0.45)'); sg.addColorStop(1, 'rgba(255,220,150,0)');
  c.fillStyle = sg; c.fillRect(0, 0, W, H);
  // soft rays
  c.save(); c.translate(sunX, sunY); c.fillStyle = 'rgba(255,248,225,0.10)';
  for (let i = 0; i < 12; i++) { c.rotate(TAU / 12); c.beginPath(); c.moveTo(0, 0); c.lineTo(-sunR * 0.5, -Math.max(W, H)); c.lineTo(sunR * 0.5, -Math.max(W, H)); c.fill(); }
  c.restore();
  // hills and pines, three layers
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const layers = [
    { y: 0.70, col: '#e08a55', h: 0.13 }, { y: 0.80, col: '#b8523a', h: 0.15 }, { y: 0.91, col: '#7a2f26', h: 0.17 },
  ];
  const unit = Math.min(W, H * 0.75);
  for (const Ly of layers) {
    const base = H * Ly.y;
    c.fillStyle = Ly.col;
    c.beginPath(); c.moveTo(0, H);
    for (let x = 0; x <= W + 20; x += 20) c.lineTo(x, base + Math.sin(x * 0.006 + Ly.y * 9) * H * 0.02);
    c.lineTo(W, H); c.closePath(); c.fill();
    const step = unit * 0.07;
    for (let x = -step * rnd(); x < W + step; x += step * (0.6 + rnd() * 0.8)) {
      const h = unit * Ly.h * (0.7 + rnd() * 0.6);
      pine(c, x, base + Math.sin(x * 0.006 + Ly.y * 9) * H * 0.02 + 4, h, Ly.col);
    }
  }
  c.fillStyle = '#4e1d1a'; c.fillRect(0, H * 0.965, W, H * 0.04);
}

// ---------------------------------------------------------------- text
export const FONT = "'Fredoka', 'Trebuchet MS', system-ui, sans-serif";
export function label(c, txt, x, y, size, fill = '#fff8ea', align = 'center', stroke = INK) {
  c.font = `700 ${size}px ${FONT}`; c.textAlign = align; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = Math.max(3, size * 0.18); c.strokeStyle = stroke;
  c.strokeText(txt, x, y); c.fillStyle = fill; c.fillText(txt, x, y);
}
export function coinIcon(c, x, y, r) {
  c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = '#ffc93a'; c.fill();
  c.lineWidth = 2.5; c.strokeStyle = INK; c.stroke();
  c.beginPath(); c.arc(x, y, r * 0.6, 0, TAU); c.strokeStyle = '#d99a14'; c.lineWidth = 2; c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.6)'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.2, 0, TAU); c.fill();
}

// Little axe for the throws-left counter: cream when ready, dark when used.
export function iconAxe(c, x, y, used) {
  c.save(); c.translate(x, y); c.rotate(-0.5);
  c.fillStyle = used ? 'rgba(42,22,8,0.35)' : '#fff8ea';
  c.strokeStyle = used ? 'rgba(42,22,8,0.0)' : INK; c.lineWidth = 2;
  rr(c, -2.5, -8, 5, 22, 2.5); c.fill(); c.stroke();
  c.beginPath(); c.moveTo(-2.5, -6); c.lineTo(-2.5, -11); c.quadraticCurveTo(-9, -14, -11, -18); c.quadraticCurveTo(0, -24, 9, -16); c.quadraticCurveTo(5, -12, 2.5, -11); c.lineTo(2.5, -6); c.closePath();
  c.fill(); c.stroke();
  c.restore();
}
