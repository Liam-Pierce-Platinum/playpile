// Flat kawaii art, all drawn with canvas paths: food, plates, customers, chef,
// cat, restaurants, belts and order bubbles. Everything has a plum outline.
import { DISHES, COLORS, TAGS } from './data.js';

export const OUT = '#3b2340';
export const FONT = "'Fredoka', 'Trebuchet MS', sans-serif";
export const DISPLAY = "'Mochiy Pop One', 'Fredoka', sans-serif";
const TAU = Math.PI * 2;

export function rr(c, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function ell(c, x, y, rx, ry, rot = 0) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, TAU); }
function fillStroke(c, fill, lw, stroke = OUT) { c.fillStyle = fill; c.fill(); if (lw) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
function face(c, x, y, s, mood = 'happy') {
  // tiny food face: two dots, blush and a mouth
  c.fillStyle = OUT;
  ell(c, x - 6 * s, y, 1.9 * s, 2.3 * s); c.fill();
  ell(c, x + 6 * s, y, 1.9 * s, 2.3 * s); c.fill();
  c.fillStyle = 'rgba(255,110,140,.55)';
  ell(c, x - 10 * s, y + 3.5 * s, 2.6 * s, 1.6 * s); c.fill();
  ell(c, x + 10 * s, y + 3.5 * s, 2.6 * s, 1.6 * s); c.fill();
  c.strokeStyle = OUT; c.lineWidth = 1.4 * s; c.lineCap = 'round';
  c.beginPath();
  if (mood === 'o') { ell(c, x, y + 3.5 * s, 1.6 * s, 2 * s); c.fillStyle = OUT; c.fill(); }
  else { c.arc(x, y + 1.5 * s, 2.4 * s, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke(); }
}
export function star(c, x, y, r, inner = 0.45, n = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n, rad = i % 2 ? r * inner : r;
    c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  c.closePath();
}
export function sparkle(c, x, y, r, col = '#fff') {
  c.fillStyle = col;
  c.beginPath();
  c.moveTo(x, y - r); c.quadraticCurveTo(x, y, x + r, y); c.quadraticCurveTo(x, y, x, y + r);
  c.quadraticCurveTo(x, y, x - r, y); c.quadraticCurveTo(x, y, x, y - r); c.fill();
}
export function heart(c, x, y, r, col = '#ff5f8f') {
  c.beginPath();
  c.moveTo(x, y + r * 0.9);
  c.bezierCurveTo(x - r * 1.4, y - r * 0.1, x - r * 0.6, y - r * 1.1, x, y - r * 0.35);
  c.bezierCurveTo(x + r * 0.6, y - r * 1.1, x + r * 1.4, y - r * 0.1, x, y + r * 0.9);
  fillStroke(c, col, r * 0.22);
}
export function coin(c, x, y, r, label) {
  ell(c, x, y + r * 0.18, r, r); c.fillStyle = '#c98a12'; c.fill();
  ell(c, x, y, r, r); fillStroke(c, '#ffd23f', Math.max(1.5, r * 0.18));
  ell(c, x - r * 0.25, y - r * 0.3, r * 0.35, r * 0.2, -0.6); c.fillStyle = 'rgba(255,255,255,.7)'; c.fill();
  if (label != null) {
    c.fillStyle = OUT; c.font = `700 ${Math.round(r * 1.25)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(label, x, y + r * 0.08);
  } else {
    c.strokeStyle = '#c98a12'; c.lineWidth = r * 0.16; ell(c, x, y, r * 0.55, r * 0.55); c.stroke();
  }
}

// ------------------------------------------------------------------ food
// drawn for a plate of radius 40 at s = 1, centred a little above the plate centre
export function drawDish(c, key, x, y, s, t = 0, faces = true) {
  c.save(); c.translate(x, y); c.scale(s, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = 2.6;
  switch (key) {
    case 'salmon': case 'ebi': case 'tamago': {
      // rice
      rr(c, -23, -6, 46, 18, 9); fillStroke(c, '#fffaf0', lw);
      c.fillStyle = '#efe6d6'; rr(c, -19, 6, 38, 4, 2); c.fill();
      if (key === 'salmon') {
        c.beginPath(); c.moveTo(-27, -4); c.quadraticCurveTo(-28, -17, -14, -18); c.lineTo(20, -17); c.quadraticCurveTo(30, -16, 27, -4); c.quadraticCurveTo(0, 2, -27, -4); c.closePath();
        fillStroke(c, '#ff8a5c', lw);
        c.strokeStyle = '#ffd5c0'; c.lineWidth = 2.4;
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 9 - 3, -16); c.quadraticCurveTo(i * 9 + 1, -10, i * 9 - 2, -3); c.stroke(); }
        if (faces) face(c, 0, -9, 0.9);
      } else if (key === 'ebi') {
        c.beginPath(); c.moveTo(-22, -4); c.quadraticCurveTo(-24, -18, -6, -18); c.lineTo(16, -16); c.quadraticCurveTo(22, -12, 20, -4); c.quadraticCurveTo(0, 1, -22, -4); c.closePath();
        fillStroke(c, '#ff9f86', lw);
        c.strokeStyle = '#ff5e4a'; c.lineWidth = 3;
        for (let i = -1; i <= 2; i++) { c.beginPath(); c.moveTo(i * 9 - 4, -17); c.lineTo(i * 9 - 4, -4); c.stroke(); }
        // tail fan
        c.beginPath(); c.moveTo(19, -10); c.lineTo(31, -20); c.lineTo(33, -9); c.lineTo(31, 0); c.closePath(); fillStroke(c, '#ff5e4a', lw);
        if (faces) face(c, -8, -10, 0.85);
      } else {
        rr(c, -24, -22, 48, 18, 5); fillStroke(c, '#ffd23f', lw);
        c.fillStyle = '#ffe680'; rr(c, -20, -20, 40, 5, 2); c.fill();
        c.fillStyle = '#28323a'; c.fillRect(-5, -23, 10, 33); c.strokeStyle = OUT; c.lineWidth = 1.6; c.strokeRect(-5, -23, 10, 33);
        if (faces) { face(c, -14, -13, 0.7); }
      }
      break;
    }
    case 'tuna': case 'kappa': {
      const core = key === 'tuna' ? '#ff4f6e' : '#7bd65a';
      const pcs = [[-15, -3], [15, -3], [0, 6]];
      for (const [px, py] of pcs) {
        rr(c, px - 12, py - 12, 24, 14, 3); fillStroke(c, '#2b3a3f', lw);
        ell(c, px, py - 12, 12, 6.5); fillStroke(c, '#fffaf0', lw);
        ell(c, px, py - 12, 5, 3); c.fillStyle = core; c.fill();
        if (key === 'kappa') { c.fillStyle = '#e8ffc8'; ell(c, px, py - 12, 2, 1.2); c.fill(); }
      }
      if (faces) { c.save(); c.fillStyle = '#fff'; face(c, 0, 4, 0.7); c.restore(); }
      break;
    }
    case 'edamame': {
      ell(c, 0, 0, 25, 10); fillStroke(c, '#5aa9d6', lw);
      c.beginPath(); c.ellipse(0, 0, 25, 10, 0, 0, Math.PI); c.lineTo(-25, 0); c.fillStyle = '#5aa9d6'; c.fill();
      c.beginPath(); c.moveTo(-25, 0); c.quadraticCurveTo(-22, 14, 0, 15); c.quadraticCurveTo(22, 14, 25, 0); fillStroke(c, '#4592bf', lw);
      ell(c, 0, 0, 25, 10); c.strokeStyle = OUT; c.lineWidth = lw; c.stroke();
      const pods = [[-12, -4, -0.4], [6, -6, 0.3], [-2, -10, -0.1], [13, -2, 0.6], [-16, -9, 0.2]];
      for (const [px, py, a] of pods) {
        c.save(); c.translate(px, py); c.rotate(a);
        rr(c, -11, -5, 22, 10, 5); fillStroke(c, '#8fd94f', 2.2);
        c.fillStyle = '#b5ec7a'; ell(c, -5, -1, 3, 2.4); c.fill(); ell(c, 1, -1, 3, 2.4); c.fill(); ell(c, 7, -1, 2.6, 2.2); c.fill();
        c.restore();
      }
      if (faces) face(c, 1, 6, 0.75);
      break;
    }
    case 'ramen': {
      // steam
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 3;
      for (let i = -1; i <= 1; i++) {
        const ph = t * 2 + i * 1.7, sx = i * 11;
        c.globalAlpha = 0.45 + 0.35 * Math.sin(ph);
        c.beginPath(); c.moveTo(sx, -16); c.bezierCurveTo(sx + 6, -24, sx - 6, -30, sx + Math.sin(ph) * 3, -40); c.stroke();
      }
      c.globalAlpha = 1;
      c.beginPath(); c.moveTo(-29, -8); c.quadraticCurveTo(-27, 16, 0, 17); c.quadraticCurveTo(27, 16, 29, -8); c.closePath(); fillStroke(c, '#ff5f5f', lw);
      c.strokeStyle = '#ffd6d6'; c.lineWidth = 2; c.beginPath(); c.moveTo(-18, 4); c.lineTo(-12, 8); c.lineTo(-6, 4); c.lineTo(0, 8); c.lineTo(6, 4); c.lineTo(12, 8); c.lineTo(18, 4); c.stroke();
      ell(c, 0, -8, 29, 9); fillStroke(c, '#f7c46c', lw);
      c.strokeStyle = '#ffe9a6'; c.lineWidth = 2;
      for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-20, -10 + i * 2.5); c.bezierCurveTo(-10, -14 + i * 2.5, -4, -6 + i * 2.5, 6, -10 + i * 2.5); c.stroke(); }
      ell(c, 12, -10, 7, 5); fillStroke(c, '#fff', 1.8); ell(c, 12, -10, 3.5, 2.6); c.fillStyle = '#ffb21f'; c.fill();
      ell(c, -12, -9, 6, 4); fillStroke(c, '#fff', 1.8); c.strokeStyle = '#ff7fae'; c.lineWidth = 1.5; c.beginPath(); c.arc(-12, -9, 2.4, 0, 5); c.stroke();
      c.fillStyle = '#2b3a3f'; c.save(); c.translate(1, -15); c.rotate(-0.15); c.fillRect(-4, -9, 9, 12); c.restore();
      c.strokeStyle = '#c9874a'; c.lineWidth = 3; c.beginPath(); c.moveTo(18, -6); c.lineTo(34, -30); c.moveTo(22, -5); c.lineTo(38, -27); c.stroke();
      if (faces) face(c, 0, 6, 0.8);
      break;
    }
    case 'gyoza': {
      const g = [[-15, 0, -0.15], [15, 0, 0.15], [0, -6, 0]];
      for (const [px, py, a] of g) {
        c.save(); c.translate(px, py); c.rotate(a);
        c.beginPath(); c.moveTo(-15, 4); c.quadraticCurveTo(-14, -14, 0, -15); c.quadraticCurveTo(14, -14, 15, 4); c.quadraticCurveTo(0, 9, -15, 4); c.closePath();
        fillStroke(c, '#ffe7b8', lw);
        c.beginPath(); c.moveTo(-14, 3); c.quadraticCurveTo(0, 8, 14, 3); c.quadraticCurveTo(0, 12, -14, 3); c.fillStyle = '#d98b3a'; c.fill();
        c.strokeStyle = '#e8c48a'; c.lineWidth = 1.6;
        for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 4, -14); c.lineTo(i * 4.5, -9); c.stroke(); }
        c.restore();
      }
      if (faces) face(c, 0, -3, 0.75);
      break;
    }
    case 'dango': {
      c.strokeStyle = '#c9874a'; c.lineWidth = 3.5; c.beginPath(); c.moveTo(-30, 8); c.lineTo(30, -12); c.stroke();
      const b = [[-15, 3, '#ff9fc4'], [0, -2, '#fffaf0'], [15, -7, '#9be38a']];
      for (const [px, py, col] of b) { ell(c, px, py, 9.5, 9.5); fillStroke(c, col, lw); c.fillStyle = 'rgba(255,255,255,.7)'; ell(c, px - 3, py - 4, 3, 2); c.fill(); }
      if (faces) face(c, 0, -1, 0.6);
      break;
    }
  }
  c.restore();
}

export function drawPlate(c, x, y, r, color, gold, t = 0) {
  const ry = r * 0.42;
  c.fillStyle = 'rgba(40,20,50,.28)'; ell(c, x + 3, y + ry * 0.55, r * 1.02, ry * 0.95); c.fill();
  let rim, rimD;
  if (gold) {
    const g = c.createLinearGradient(x - r, y, x + r, y);
    g.addColorStop(0, '#ffcf3a'); g.addColorStop(0.45 + 0.2 * Math.sin(t * 3), '#fff6b8'); g.addColorStop(1, '#f0a81a');
    rim = g; rimD = '#c27d0b';
  } else { rim = COLORS[color].c; rimD = COLORS[color].d; }
  ell(c, x, y + r * 0.08, r, ry); c.fillStyle = rimD; c.fill();
  ell(c, x, y, r, ry); c.fillStyle = rim; c.fill(); c.lineWidth = 2.6; c.strokeStyle = OUT; c.stroke();
  ell(c, x, y - ry * 0.02, r * 0.72, ry * 0.68); c.fillStyle = gold ? '#fff8d8' : '#fffdf8'; c.fill();
  c.strokeStyle = 'rgba(59,35,64,.25)'; c.lineWidth = 1.5; c.stroke();
  c.beginPath(); c.ellipse(x, y, r * 0.88, ry * 0.85, 0, Math.PI * 1.1, Math.PI * 1.5); c.strokeStyle = 'rgba(255,255,255,.6)'; c.lineWidth = 2; c.stroke();
}

export function drawPlateFull(c, p, x, y, r, t, showPrice = true) {
  drawPlate(c, x, y, r, p.color, p.gold, t);
  drawDish(c, p.dish, x, y - r * 0.1, r / 40, t + (p.seed || 0));
  if (p.gold) {
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * 2.1 + (p.seed || 0);
      sparkle(c, x + Math.cos(a) * r * 1.05, y - r * 0.45 + Math.sin(a * 1.3) * r * 0.45, 4 + 3 * Math.abs(Math.sin(t * 5 + i)), '#fff6b0');
    }
  }
  if (showPrice) coin(c, x + r * 0.78, y + r * 0.22, r * 0.2, DISHES[p.dish].price);
}

// --------------------------------------------------------------- people
const SKIN = ['#ffe0c7', '#f7caa5', '#e8ab7e', '#c98a5e', '#9a6442', '#ffd9b8'];
const HAIR = ['#3b2340', '#5a3a2a', '#1f1f2e', '#c96b3b', '#e8c25a', '#ff7fae', '#6aa7ff', '#9b5ad6', '#d9d0c8'];
const SHIRT = ['#ff6b6b', '#4fa8ff', '#5fd08a', '#ffd23f', '#b48cff', '#ff9a5c', '#3cc8b4', '#ff7fae', '#7a8cff'];
export function randomLook(rng = Math.random) {
  const pick = (a) => a[Math.floor(rng() * a.length)];
  return { skin: pick(SKIN), hair: pick(HAIR), shirt: pick(SHIRT), style: Math.floor(rng() * 6), glasses: rng() < 0.2, hat: pick(SHIRT) };
}

// mood: 'happy' | 'ok' | 'meh' | 'grumpy' | 'angry' | 'eat' | 'shock'
export function drawPerson(c, x, y, R, look, mood, t, kind = 'normal') {
  c.save(); c.translate(x, y);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = Math.max(2.5, R * 0.07);
  const sumo = kind === 'sumo', critic = kind === 'critic';
  // body
  const bw = sumo ? R * 2.7 : R * 2.05;
  c.beginPath();
  c.moveTo(-bw / 2, R * 3.2);
  c.lineTo(-bw / 2, R * 1.35); c.quadraticCurveTo(-bw / 2, R * 0.72, -bw / 2 + R * 0.65, R * 0.72);
  c.lineTo(bw / 2 - R * 0.65, R * 0.72); c.quadraticCurveTo(bw / 2, R * 0.72, bw / 2, R * 1.35); c.lineTo(bw / 2, R * 3.2); c.closePath();
  fillStroke(c, sumo ? look.skin : critic ? '#2b2440' : look.shirt, lw);
  if (sumo) {
    c.strokeStyle = 'rgba(59,35,64,.35)'; c.lineWidth = lw * 0.7;
    c.beginPath(); c.arc(-R * 0.45, R * 1.5, R * 0.35, 0.2, Math.PI - 0.2); c.stroke();
    c.beginPath(); c.arc(R * 0.45, R * 1.5, R * 0.35, 0.2, Math.PI - 0.2); c.stroke();
  } else if (critic) {
    c.beginPath(); c.moveTo(-R * 0.35, R * 0.72); c.lineTo(0, R * 1.5); c.lineTo(R * 0.35, R * 0.72); c.closePath(); fillStroke(c, '#fff', lw * 0.6);
    c.beginPath(); c.moveTo(-R * 0.12, R * 0.9); c.lineTo(R * 0.12, R * 0.9); c.lineTo(R * 0.06, R * 1.45); c.lineTo(-R * 0.06, R * 1.45); c.closePath(); fillStroke(c, '#ff4f6e', lw * 0.5);
    // gold VIP badge
    c.save(); c.translate(-R * 0.62, R * 1.12); star(c, 0, 0, R * 0.22); fillStroke(c, '#ffd23f', lw * 0.5); c.restore();
  } else {
    c.beginPath(); c.moveTo(-R * 0.3, R * 0.74); c.quadraticCurveTo(0, R * 1.05, R * 0.3, R * 0.74); c.strokeStyle = 'rgba(59,35,64,.4)'; c.lineWidth = lw * 0.7; c.stroke();
  }
  const HR = sumo ? R * 1.12 : R;
  const angry = mood === 'angry';
  // hair behind the head
  c.fillStyle = look.hair;
  if (sumo) { /* topknot drawn after */ }
  else if (look.style === 3) { ell(c, -HR * 0.95, HR * 0.25, HR * 0.32, HR * 0.6, 0.3); fillStroke(c, look.hair, lw); ell(c, HR * 0.95, HR * 0.25, HR * 0.32, HR * 0.6, -0.3); fillStroke(c, look.hair, lw); }
  else if (look.style === 0) { rr(c, -HR * 1.05, -HR * 0.3, HR * 2.1, HR * 1.25, HR * 0.4); fillStroke(c, look.hair, lw); }
  // head
  ell(c, 0, 0, HR * 1.04, HR * 0.96); fillStroke(c, look.skin, lw);
  if (angry) { c.globalAlpha = 0.35 + 0.15 * Math.sin(t * 20); ell(c, 0, 0, HR * 1.04, HR * 0.96); c.fillStyle = '#ff3b3b'; c.fill(); c.globalAlpha = 1; }
  // ears
  ell(c, -HR * 1.02, HR * 0.12, HR * 0.16, HR * 0.2); fillStroke(c, look.skin, lw * 0.8);
  ell(c, HR * 1.02, HR * 0.12, HR * 0.16, HR * 0.2); fillStroke(c, look.skin, lw * 0.8);
  // hair on top
  c.fillStyle = look.hair;
  if (sumo) {
    c.beginPath(); c.arc(0, -HR * 0.1, HR * 1.0, Math.PI * 1.05, Math.PI * 1.95); c.quadraticCurveTo(0, -HR * 0.55, -HR * 0.97, -HR * 0.25); c.closePath(); fillStroke(c, '#1f1f2e', lw);
    ell(c, 0, -HR * 1.05, HR * 0.28, HR * 0.18); fillStroke(c, '#1f1f2e', lw);
    ell(c, HR * 0.1, -HR * 1.2, HR * 0.34, HR * 0.13, -0.2); fillStroke(c, '#1f1f2e', lw);
  } else if (critic) {
    c.beginPath(); c.arc(0, -HR * 0.15, HR * 0.98, Math.PI * 1.1, Math.PI * 1.9); c.quadraticCurveTo(0, -HR * 0.55, -HR * 0.92, -HR * 0.45); c.closePath(); fillStroke(c, '#d9d0c8', lw);
    ell(c, HR * 0.1, -HR * 0.85, HR * 0.95, HR * 0.32, -0.15); fillStroke(c, '#b8283e', lw);
    ell(c, HR * 0.05, -HR * 1.12, HR * 0.1, HR * 0.08); fillStroke(c, '#b8283e', lw * 0.7);
  } else {
    switch (look.style) {
      case 0: case 3: {
        c.beginPath(); c.moveTo(-HR * 1.02, HR * 0.1); c.quadraticCurveTo(-HR * 1.1, -HR * 1.02, 0, -HR * 1.02); c.quadraticCurveTo(HR * 1.1, -HR * 1.02, HR * 1.02, HR * 0.1);
        c.quadraticCurveTo(HR * 0.8, -HR * 0.4, HR * 0.45, -HR * 0.38); c.quadraticCurveTo(HR * 0.2, -HR * 0.2, 0, -HR * 0.42); c.quadraticCurveTo(-HR * 0.3, -HR * 0.2, -HR * 0.55, -HR * 0.4); c.quadraticCurveTo(-HR * 0.85, -HR * 0.35, -HR * 1.02, HR * 0.1);
        fillStroke(c, look.hair, lw);
        if (look.style === 3) { ell(c, -HR * 0.75, -HR * 0.62, HR * 0.14, HR * 0.14); fillStroke(c, '#ff7fae', lw * 0.6); }
        break;
      }
      case 1: {
        c.beginPath(); c.moveTo(-HR * 1.0, -HR * 0.05);
        const n = 6;
        for (let i = 0; i <= n; i++) { const a = Math.PI + (i / n) * Math.PI; const rr2 = i % 2 ? HR * 1.0 : HR * 1.3; c.lineTo(Math.cos(a) * rr2, Math.sin(a) * rr2 * 0.95 - HR * 0.05); }
        c.lineTo(HR * 1.0, -HR * 0.05); c.quadraticCurveTo(0, -HR * 0.6, -HR * 1.0, -HR * 0.05); c.closePath();
        fillStroke(c, look.hair, lw); break;
      }
      case 2: {
        ell(c, 0, -HR * 1.05, HR * 0.42, HR * 0.36); fillStroke(c, look.hair, lw);
        c.beginPath(); c.arc(0, -HR * 0.05, HR * 1.0, Math.PI * 1.02, Math.PI * 1.98); c.quadraticCurveTo(HR * 0.3, -HR * 0.55, 0, -HR * 0.45); c.quadraticCurveTo(-HR * 0.4, -HR * 0.55, -HR * 1.0, -HR * 0.1); c.closePath();
        fillStroke(c, look.hair, lw); break;
      }
      case 4: {
        c.beginPath(); c.arc(0, -HR * 0.12, HR * 1.0, Math.PI * 1.0, Math.PI * 2.0); c.closePath(); fillStroke(c, look.hat, lw);
        rr(c, -HR * 0.2, -HR * 0.32, HR * 1.6, HR * 0.24, HR * 0.12); fillStroke(c, look.hat, lw);
        ell(c, 0, -HR * 1.1, HR * 0.12, HR * 0.1); fillStroke(c, '#fff', lw * 0.6);
        break;
      }
      default: {
        c.beginPath(); c.arc(0, -HR * 0.05, HR * 1.0, Math.PI * 1.08, Math.PI * 1.92); c.quadraticCurveTo(HR * 0.4, -HR * 0.62, -HR * 0.2, -HR * 0.5); c.quadraticCurveTo(-HR * 0.6, -HR * 0.4, -HR * 0.97, -HR * 0.3); c.closePath();
        fillStroke(c, look.hair, lw);
      }
    }
  }
  // face
  const ey = HR * 0.1, ex = HR * 0.36, es = HR / 44;
  c.strokeStyle = OUT; c.fillStyle = OUT; c.lineWidth = lw;
  const closed = mood === 'happy' || mood === 'eat';
  if (critic && mood !== 'happy' && mood !== 'eat') {
    // sunglasses
    rr(c, -ex - 13 * es, ey - 8 * es, 24 * es, 16 * es, 6 * es); c.fillStyle = '#1f1f2e'; c.fill();
    rr(c, ex - 11 * es, ey - 8 * es, 24 * es, 16 * es, 6 * es); c.fill();
    c.beginPath(); c.moveTo(-ex + 11 * es, ey - 3 * es); c.lineTo(ex - 11 * es, ey - 3 * es); c.stroke();
    c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(-ex - 8 * es, ey - 5 * es, 6 * es, 3 * es); c.fillRect(ex - 6 * es, ey - 5 * es, 6 * es, 3 * es);
  } else if (closed) {
    c.beginPath(); c.arc(-ex, ey + 3 * es, 7 * es, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.beginPath(); c.arc(ex, ey + 3 * es, 7 * es, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  } else if (mood === 'shock') {
    c.lineWidth = lw * 0.9;
    for (const sx of [-ex, ex]) { c.beginPath(); c.moveTo(sx - 5 * es, ey - 5 * es); c.lineTo(sx + 5 * es, ey + 5 * es); c.moveTo(sx + 5 * es, ey - 5 * es); c.lineTo(sx - 5 * es, ey + 5 * es); c.stroke(); }
  } else {
    const blink = (Math.sin(t * 1.3 + look.skin.length) > 0.985) ? 0.15 : 1;
    ell(c, -ex, ey, 5.2 * es, 7 * es * blink); c.fill(); ell(c, ex, ey, 5.2 * es, 7 * es * blink); c.fill();
    c.fillStyle = '#fff'; ell(c, -ex + 1.8 * es, ey - 2.6 * es, 1.8 * es, 1.8 * es); c.fill(); ell(c, ex + 1.8 * es, ey - 2.6 * es, 1.8 * es, 1.8 * es); c.fill();
    if (look.glasses) { c.lineWidth = lw * 0.7; c.strokeStyle = OUT; ell(c, -ex, ey, 11 * es, 10 * es); c.stroke(); ell(c, ex, ey, 11 * es, 10 * es); c.stroke(); c.beginPath(); c.moveTo(-ex + 11 * es, ey); c.lineTo(ex - 11 * es, ey); c.stroke(); }
  }
  // brows
  if (mood === 'grumpy' || angry) {
    const k = angry ? 1.4 : 1;
    c.lineWidth = lw * 1.1; c.strokeStyle = OUT;
    c.beginPath(); c.moveTo(-ex - 9 * es, ey - 14 * es); c.lineTo(-ex + 7 * es, ey - (9 - 4 * k) * es); c.stroke();
    c.beginPath(); c.moveTo(ex + 9 * es, ey - 14 * es); c.lineTo(ex - 7 * es, ey - (9 - 4 * k) * es); c.stroke();
  }
  // blush
  c.fillStyle = mood === 'happy' || mood === 'eat' ? 'rgba(255,90,130,.55)' : 'rgba(255,120,140,.35)';
  ell(c, -HR * 0.6, HR * 0.38, HR * 0.17, HR * 0.1); c.fill(); ell(c, HR * 0.6, HR * 0.38, HR * 0.17, HR * 0.1); c.fill();
  // mouth
  const my = HR * 0.45;
  c.strokeStyle = OUT; c.lineWidth = lw;
  if (critic) { c.fillStyle = '#d9d0c8'; c.beginPath(); c.moveTo(0, my - 8 * es); c.quadraticCurveTo(-16 * es, my - 10 * es, -20 * es, my); c.quadraticCurveTo(-10 * es, my - 4 * es, 0, my - 4 * es); c.quadraticCurveTo(10 * es, my - 4 * es, 20 * es, my); c.quadraticCurveTo(16 * es, my - 10 * es, 0, my - 8 * es); fillStroke(c, '#d9d0c8', lw * 0.6); }
  switch (mood) {
    case 'happy':
      c.beginPath(); c.moveTo(-9 * es, my - 1 * es); c.quadraticCurveTo(0, my + 16 * es, 9 * es, my - 1 * es); c.closePath(); fillStroke(c, '#c2334d', lw * 0.8);
      c.fillStyle = '#ff8fa8'; ell(c, 0, my + 6 * es, 4 * es, 2.5 * es); c.fill(); break;
    case 'eat': {
      const ch = Math.sin(t * 18) * 2 * es;
      c.fillStyle = 'rgba(255,90,130,.4)'; ell(c, -HR * 0.5, HR * 0.4, HR * 0.24, HR * 0.2); c.fill(); ell(c, HR * 0.5, HR * 0.4, HR * 0.24, HR * 0.2); c.fill();
      c.beginPath(); c.moveTo(-8 * es, my + ch); c.quadraticCurveTo(-4 * es, my + 5 * es, 0, my + ch); c.quadraticCurveTo(4 * es, my + 5 * es, 8 * es, my + ch); c.stroke(); break;
    }
    case 'ok': c.beginPath(); c.arc(0, my - 3 * es, 6 * es, 0.2 * Math.PI, 0.8 * Math.PI); c.stroke(); break;
    case 'meh': c.beginPath(); c.moveTo(-6 * es, my + 1 * es); c.lineTo(6 * es, my + 1 * es); c.stroke(); break;
    case 'grumpy': c.beginPath(); c.arc(0, my + 6 * es, 7 * es, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke(); break;
    case 'shock': ell(c, 0, my + 2 * es, 5 * es, 7 * es); fillStroke(c, '#c2334d', lw * 0.8); break;
    case 'angry': {
      rr(c, -11 * es, my - 4 * es, 22 * es, 10 * es, 4 * es); fillStroke(c, '#fff', lw * 0.8);
      c.beginPath(); c.moveTo(-11 * es, my + 1 * es); c.lineTo(11 * es, my + 1 * es); c.lineWidth = lw * 0.5; c.stroke();
      break;
    }
  }
  if (mood === 'grumpy' || mood === 'meh') {
    // sweat drop
    c.fillStyle = '#8fd0ff'; c.beginPath(); const sx = HR * 0.85, sy = -HR * 0.35 + Math.sin(t * 4) * 2;
    c.moveTo(sx, sy - 9 * es); c.quadraticCurveTo(sx + 7 * es, sy + 2 * es, sx, sy + 5 * es); c.quadraticCurveTo(sx - 7 * es, sy + 2 * es, sx, sy - 9 * es); fillStroke(c, '#8fd0ff', lw * 0.5);
  }
  if (angry) {
    // anger mark
    c.save(); c.translate(HR * 0.75, -HR * 0.7); c.strokeStyle = '#ff2f4f'; c.lineWidth = lw * 1.1;
    for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 2); c.beginPath(); c.moveTo(4 * es, 4 * es); c.quadraticCurveTo(4 * es, 11 * es, 11 * es, 11 * es); c.stroke(); }
    c.restore();
  }
  c.restore();
}

export function drawChef(c, x, y, R, t, cooking, ready) {
  c.save(); c.translate(x, y);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = Math.max(2.5, R * 0.07);
  const bob = Math.sin(t * 3) * R * 0.03;
  // body: white jacket
  c.beginPath(); c.moveTo(-R * 1.15, R * 3); c.lineTo(-R * 1.1, R * 1.3); c.quadraticCurveTo(-R * 1.05, R * 0.72, -R * 0.4, R * 0.72); c.lineTo(R * 0.4, R * 0.72); c.quadraticCurveTo(R * 1.05, R * 0.72, R * 1.1, R * 1.3); c.lineTo(R * 1.15, R * 3); c.closePath();
  fillStroke(c, '#ffffff', lw);
  c.beginPath(); c.moveTo(-R * 0.4, R * 0.72); c.lineTo(R * 0.25, R * 1.9); c.strokeStyle = OUT; c.lineWidth = lw * 0.7; c.stroke();
  c.fillStyle = '#3cc8b4'; rr(c, -R * 1.12, R * 1.95, R * 2.24, R * 0.28, R * 0.1); c.fill();
  // arm + knife
  const chop = cooking ? Math.abs(Math.sin(t * 22)) : 0;
  c.save(); c.translate(R * 0.95, R * 1.35); c.rotate(-0.9 + chop * 0.7);
  rr(c, -R * 0.2, -R * 0.2, R * 0.4, R * 0.95, R * 0.2); fillStroke(c, '#ffffff', lw);
  ell(c, 0, R * 0.85, R * 0.2, R * 0.2); fillStroke(c, '#ffe0c7', lw * 0.8);
  c.fillStyle = '#e8eef5'; c.beginPath(); c.moveTo(-R * 0.06, R * 0.95); c.lineTo(R * 0.12, R * 1.75); c.lineTo(R * 0.28, R * 1.7); c.lineTo(R * 0.12, R * 0.9); c.closePath(); fillStroke(c, '#e8eef5', lw * 0.6);
  c.restore();
  c.translate(0, bob);
  ell(c, 0, 0, R * 1.04, R * 0.96); fillStroke(c, '#ffe0c7', lw);
  ell(c, -R * 1.02, R * 0.12, R * 0.16, R * 0.2); fillStroke(c, '#ffe0c7', lw * 0.8);
  ell(c, R * 1.02, R * 0.12, R * 0.16, R * 0.2); fillStroke(c, '#ffe0c7', lw * 0.8);
  // hair + headband
  c.beginPath(); c.arc(0, -R * 0.05, R * 1.0, Math.PI * 1.05, Math.PI * 1.95); c.quadraticCurveTo(0, -R * 0.5, -R * 0.97, -R * 0.25); c.closePath(); fillStroke(c, '#3b2340', lw);
  c.beginPath(); c.moveTo(-R * 1.03, -R * 0.28); c.quadraticCurveTo(0, -R * 0.72, R * 1.03, -R * 0.28); c.lineTo(R * 0.98, -R * 0.02); c.quadraticCurveTo(0, -R * 0.45, -R * 0.98, -R * 0.02); c.closePath(); fillStroke(c, '#fff', lw);
  ell(c, 0, -R * 0.38, R * 0.14, R * 0.14); c.fillStyle = '#ff4f5f'; c.fill();
  const fl = Math.sin(t * 6) * 0.2;
  c.save(); c.translate(R * 0.98, -R * 0.15); c.rotate(0.5 + fl);
  rr(c, 0, -R * 0.08, R * 0.55, R * 0.16, R * 0.08); fillStroke(c, '#fff', lw * 0.7); c.rotate(0.5); rr(c, 0, -R * 0.08, R * 0.45, R * 0.16, R * 0.08); fillStroke(c, '#fff', lw * 0.7);
  c.restore();
  // face
  c.strokeStyle = OUT; c.lineWidth = lw;
  const ex = R * 0.36, ey = R * 0.15, es = R / 44;
  if (ready || cooking) {
    c.beginPath(); c.arc(-ex, ey + 3 * es, 7 * es, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
    c.beginPath(); c.arc(ex, ey + 3 * es, 7 * es, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
  } else {
    c.fillStyle = OUT; ell(c, -ex, ey, 5 * es, 6.5 * es); c.fill(); ell(c, ex, ey, 5 * es, 6.5 * es); c.fill();
    c.fillStyle = '#fff'; ell(c, -ex + 1.8 * es, ey - 2.4 * es, 1.7 * es, 1.7 * es); c.fill(); ell(c, ex + 1.8 * es, ey - 2.4 * es, 1.7 * es, 1.7 * es); c.fill();
  }
  c.fillStyle = 'rgba(255,90,130,.5)'; ell(c, -R * 0.6, R * 0.4, R * 0.17, R * 0.1); c.fill(); ell(c, R * 0.6, R * 0.4, R * 0.17, R * 0.1); c.fill();
  c.beginPath(); c.moveTo(-9 * es, R * 0.44); c.quadraticCurveTo(0, R * 0.44 + 14 * es, 9 * es, R * 0.44); c.closePath(); fillStroke(c, '#c2334d', lw * 0.8);
  c.restore();
}

// cat: state 'walk' | 'stalk' | 'run' | 'shoo'; dir = 1 faces right
export function drawCat(c, x, y, s, t, state, dir, carrying) {
  c.save(); c.translate(x, y); c.scale(s * dir, s);
  c.lineJoin = 'round'; c.lineCap = 'round';
  const lw = 2.6;
  const crouch = state === 'stalk' ? 6 : 0;
  const leg = state === 'walk' || state === 'run' ? Math.sin(t * (state === 'run' ? 30 : 14)) * 5 : 0;
  // tail
  c.strokeStyle = OUT; c.lineWidth = 9; c.beginPath(); c.moveTo(-26, -6 + crouch); c.quadraticCurveTo(-46, -10, -42 + Math.sin(t * 5) * 6, -34 + crouch); c.stroke();
  c.strokeStyle = '#ffa24c'; c.lineWidth = 5; c.stroke();
  // legs
  c.fillStyle = '#ffa24c';
  for (const [lx, ph] of [[-16, 1], [-6, -1], [10, 1], [19, -1]]) { rr(c, lx - 4, -2 + crouch * 0.5, 8, 14 + ph * leg * 0.5 - crouch * 0.4, 4); fillStroke(c, '#ffa24c', 2); }
  // body
  ell(c, -2, -8 + crouch, 28, 15 - crouch * 0.3); fillStroke(c, '#ffa24c', lw);
  c.strokeStyle = '#e07a26'; c.lineWidth = 3;
  for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(-6 + i * 9, -22 + crouch); c.lineTo(-8 + i * 9, -12 + crouch); c.stroke(); }
  ell(c, 4, -2 + crouch, 14, 6); c.fillStyle = '#ffe2c4'; c.fill();
  // head
  const hy = -22 + crouch * 1.4, hx = 26;
  c.beginPath(); c.moveTo(hx - 14, hy - 8); c.lineTo(hx - 12, hy - 26); c.lineTo(hx - 2, hy - 13); c.closePath(); fillStroke(c, '#ffa24c', lw);
  c.beginPath(); c.moveTo(hx + 14, hy - 8); c.lineTo(hx + 12, hy - 26); c.lineTo(hx + 2, hy - 13); c.closePath(); fillStroke(c, '#ffa24c', lw);
  ell(c, hx, hy, 17, 15); fillStroke(c, '#ffa24c', lw);
  c.fillStyle = '#ff9fb8'; c.beginPath(); c.moveTo(hx - 12, hy - 12); c.lineTo(hx - 11, hy - 21); c.lineTo(hx - 6, hy - 14); c.fill();
  c.fillStyle = OUT;
  if (state === 'shoo') {
    c.strokeStyle = OUT; c.lineWidth = 2.4;
    c.beginPath(); c.moveTo(hx - 9, hy - 4); c.lineTo(hx - 3, hy); c.lineTo(hx - 9, hy + 3); c.stroke();
    c.beginPath(); c.moveTo(hx + 12, hy - 4); c.lineTo(hx + 6, hy); c.lineTo(hx + 12, hy + 3); c.stroke();
  } else {
    ell(c, hx - 6, hy - 1, 2.6, state === 'stalk' ? 1.6 : 3.4); c.fill(); ell(c, hx + 8, hy - 1, 2.6, state === 'stalk' ? 1.6 : 3.4); c.fill();
  }
  c.fillStyle = '#ff6b8a'; ell(c, hx + 1, hy + 4, 2.4, 1.6); c.fill();
  c.strokeStyle = OUT; c.lineWidth = 1.4; c.beginPath(); c.moveTo(hx + 1, hy + 5); c.quadraticCurveTo(hx - 2, hy + 9, hx - 5, hy + 7); c.moveTo(hx + 1, hy + 5); c.quadraticCurveTo(hx + 4, hy + 9, hx + 7, hy + 7); c.stroke();
  c.beginPath(); c.moveTo(hx + 14, hy + 3); c.lineTo(hx + 24, hy + 1); c.moveTo(hx + 14, hy + 6); c.lineTo(hx + 24, hy + 7); c.moveTo(hx - 12, hy + 3); c.lineTo(hx - 21, hy + 1); c.stroke();
  if (carrying) { c.save(); c.translate(hx + 10, hy + 14); c.scale(dir, 1); drawPlate(c, 0, 0, 20, carrying.color, carrying.gold, t); drawDish(c, carrying.dish, 0, -2, 0.5, t, false); c.restore(); }
  c.restore();
}

// ------------------------------------------------------------ bubbles
export function drawOrderIcon(c, item, x, y, s, t) {
  c.save(); c.translate(x, y);
  const k = item.kind;
  if (k !== 'dish') s = Math.min(s, 1.2);
  if (k === 'dish') drawDish(c, item.dish, 0, 2 * s, 0.62 * s, t, false);
  else if (k === 'tag') {
    drawDish(c, TAGS[item.tag].icon, 0, 13 * s, 0.56 * s, t, false);
    c.font = `800 ${Math.max(10, Math.round(11 * s))}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    const label = 'ANY ' + TAGS[item.tag].name.replace('any ', '').replace('something ', '').toUpperCase();
    const w = c.measureText(label).width + 10 * s;
    const lh = Math.max(15, 15 * s);
    rr(c, -w / 2, -14 * s - lh / 2, w, lh, lh / 2); fillStroke(c, '#ff6b6b', 1.8);
    c.fillStyle = '#fff'; c.fillText(label, 0, -14 * s + 1);
  } else {
    // a big plate in the wanted colour; the label says what else matters
    drawPlate(c, 0, 6 * s, 25 * s, item.color, false, t);
    c.fillStyle = COLORS[item.color].d; c.font = `700 ${Math.round(17 * s)}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText('?', 0, 4 * s);
    const fs = Math.max(11, Math.round(12 * s));
    c.font = `800 ${fs}px ${FONT}`;
    if (k === 'combo') {
      // "under N coins": white pill with "<N" and a coin
      const label = `< ${item.max}`, w = c.measureText(label).width + fs * 1.9, h = fs + 7, py = -16 * s;
      rr(c, -w / 2, py - h / 2, w, h, h / 2); fillStroke(c, '#fff', 2);
      c.fillStyle = OUT; c.textAlign = 'left'; c.fillText(label, -w / 2 + 6, py + 1);
      coin(c, w / 2 - fs * 0.7 - 2, py, fs * 0.62);
    } else {
      const w = c.measureText('ANY').width + 12, h = fs + 6, py = -16 * s;
      rr(c, -w / 2, py - h / 2, w, h, h / 2); fillStroke(c, COLORS[item.color].d, 2);
      c.fillStyle = '#fff'; c.fillText('ANY', 0, py + 1);
    }
  }
  if (item.done) {
    ell(c, 0, 0, 16 * s, 16 * s); c.fillStyle = 'rgba(95,208,138,.92)'; c.fill(); c.lineWidth = 2; c.strokeStyle = OUT; c.stroke();
    c.strokeStyle = '#fff'; c.lineWidth = 3.4 * s; c.lineCap = 'round'; c.beginPath(); c.moveTo(-7 * s, 0); c.lineTo(-2 * s, 6 * s); c.lineTo(8 * s, -6 * s); c.stroke();
  }
  c.restore();
}

export function drawBubble(c, x, y, w, h, tailX, tailY, pat, t, glow) {
  c.save();
  const shake = pat < 0.25 ? Math.sin(t * 40) * 1.6 : 0;
  c.translate(shake, 0);
  if (glow) { c.shadowColor = '#ffd23f'; c.shadowBlur = 18; }
  // tail dots
  c.fillStyle = '#fff'; c.lineWidth = 2.5; c.strokeStyle = OUT;
  const dx = tailX - x, dy = tailY - (y + h / 2);
  for (const [f, r] of [[0.45, 6], [0.8, 4]]) { ell(c, x + dx * f, y + h / 2 + dy * f, r, r); c.fill(); c.stroke(); }
  rr(c, x - w / 2, y - h / 2, w, h, Math.min(22, h / 2)); c.fillStyle = '#fff'; c.fill(); c.stroke();
  c.shadowBlur = 0;
  // patience bar along the bottom of the bubble
  const bw = w - 24, bx = x - bw / 2, by = y + h / 2 - 12;
  rr(c, bx, by, bw, 7, 3.5); c.fillStyle = '#efe4f2'; c.fill();
  const col = pat > 0.55 ? '#5fd08a' : pat > 0.28 ? '#ffc23f' : '#ff4f5f';
  if (pat > 0.01) { rr(c, bx, by, Math.max(7, bw * pat), 7, 3.5); c.fillStyle = col; c.fill(); }
  c.restore();
}

// ------------------------------------------------------------ the room
export function drawLantern(c, x, y, s, col, t, label) {
  c.save(); c.translate(x, y); c.rotate(Math.sin(t * 1.3 + x) * 0.06); c.scale(s, s);
  c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -60); c.lineTo(0, -26); c.stroke();
  c.fillStyle = '#3b2340'; rr(c, -12, -28, 24, 7, 2); c.fill(); rr(c, -12, 21, 24, 7, 2); c.fill();
  ell(c, 0, 0, 22, 25); fillStroke(c, col, 2.5);
  c.strokeStyle = 'rgba(59,35,64,.25)'; c.lineWidth = 1.5;
  for (const yy of [-12, 0, 12]) { c.beginPath(); c.ellipse(0, yy, 21 * Math.cos(Math.asin(Math.min(1, Math.abs(yy) / 25))), 3, 0, 0, Math.PI); c.stroke(); }
  c.fillStyle = 'rgba(255,255,220,.35)'; ell(c, -7, -8, 6, 10); c.fill();
  if (label) { c.fillStyle = '#fff'; c.font = `700 16px ${DISPLAY}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, 0, 1); }
  c.restore();
}

export function drawRoom(c, P, L, t, vb, place, extras) {
  const { x0, y0, x1, y1 } = vb;
  const cy = L.counterY;
  if (place === 0) {
    // night sky strip at the very top, wooden stall wall
    c.fillStyle = P.wall; c.fillRect(x0, y0, x1 - x0, cy - y0 + 4);
    for (let x = Math.floor(x0 / 46) * 46; x < x1; x += 46) { c.fillStyle = (x / 46) % 2 ? P.wall2 : P.wall; c.fillRect(x, y0, 46, cy - y0); c.fillStyle = 'rgba(59,35,64,.12)'; c.fillRect(x, y0, 2, cy - y0); }
    // noren curtain across the top
    const ny = L.top + 4;
    c.fillStyle = '#e8434a'; c.fillRect(x0, y0, x1 - x0, ny - y0 + 28);
    const fw = 92;
    for (let x = Math.floor(x0 / fw) * fw; x < x1; x += fw) {
      const sw = Math.sin(t * 1.4 + x * 0.01) * 3;
      c.beginPath(); c.moveTo(x + 2, ny); c.lineTo(x + fw - 2, ny); c.lineTo(x + fw - 2 + sw, ny + 46); c.lineTo(x + 2 + sw, ny + 46); c.closePath(); fillStroke(c, '#e8434a', 2.5);
      ell(c, x + fw / 2 + sw * 0.6, ny + 22, 13, 13); c.fillStyle = '#fff2e0'; c.fill();
    }
    c.fillStyle = '#7a4a2a'; c.fillRect(x0, ny - 8, x1 - x0, 10);
    for (let i = 0; i < L.seats.length - 1; i++) drawLantern(c, (L.seats[i] + L.seats[i + 1]) / 2, L.headY - L.headR * 1.0, L.headR / 44 * 0.9, '#ff5f5f', t, i % 2 ? '寿' : '司');
  } else if (place === 1) {
    c.fillStyle = P.wall; c.fillRect(x0, y0, x1 - x0, cy - y0 + 4);
    // window with city lights
    const wy = L.top + 30, wh = cy - wy - 30;
    c.fillStyle = '#0d0820'; c.fillRect(x0, wy, x1 - x0, wh);
    for (let i = 0; i < 40; i++) {
      const bx = x0 + ((i * 97) % Math.max(1, (x1 - x0))), bh = 40 + ((i * 53) % 120), bw = 40 + (i * 31) % 50;
      c.fillStyle = i % 3 ? '#1d1440' : '#251a52'; c.fillRect(bx, wy + wh - bh, bw, bh);
      for (let j = 0; j < 8; j++) { if ((i * 7 + j * 3) % 5 === 0) continue; c.fillStyle = (i + j) % 4 ? '#ffd86b' : '#6bf2ff'; c.globalAlpha = 0.5 + 0.3 * Math.sin(t + i + j); c.fillRect(bx + 6 + (j % 3) * 11, wy + wh - bh + 8 + Math.floor(j / 3) * 14, 5, 6); }
      c.globalAlpha = 1;
    }
    c.fillStyle = 'rgba(255,79,216,.08)'; c.fillRect(x0, wy, x1 - x0, wh);
    c.strokeStyle = P.wall2; c.lineWidth = 10; c.strokeRect(x0 - 10, wy, x1 - x0 + 20, wh);
    for (let x = Math.floor(x0 / 260) * 260 + 130; x < x1; x += 260) { c.fillStyle = P.wall2; c.fillRect(x - 5, wy, 10, wh); }
    // neon signs between seats
    const signs = [['寿司', '#ff4fd8'], ['OPEN', '#6bf2ff'], ['鮨', '#ffd23f'], ['ラーメン', '#7dff8a']];
    c.textAlign = 'center'; c.textBaseline = 'middle';
    for (let i = 0; i < L.seats.length - 1; i++) {
      const [txt, col] = signs[i % signs.length];
      const sx = (L.seats[i] + L.seats[i + 1]) / 2, sy = L.headY - L.headR * 0.8;
      const fl = Math.sin(t * 7 + i * 3) > 0.96 ? 0.4 : 1;
      c.save(); c.globalAlpha = fl; c.shadowColor = col; c.shadowBlur = 20; c.font = `400 ${Math.round(L.headR * 0.55)}px ${DISPLAY}`;
      c.fillStyle = col; c.fillText(txt, sx, sy); c.shadowBlur = 0; c.fillStyle = '#fff'; c.globalAlpha = fl * 0.6; c.fillText(txt, sx, sy);
      c.restore();
    }
    c.fillStyle = '#ff4fd8'; c.shadowColor = '#ff4fd8'; c.shadowBlur = 16; c.fillRect(x0, L.top + 18, x1 - x0, 5); c.shadowBlur = 0;
  } else if (place === 2) {
    const g = c.createLinearGradient(0, y0, 0, cy);
    g.addColorStop(0, '#bfe6ff'); g.addColorStop(1, '#ffe3ee');
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, cy - y0 + 4);
    // hills and blossom trees
    c.fillStyle = '#c9ecc0'; c.beginPath(); c.moveTo(x0, cy); for (let x = x0; x <= x1; x += 40) c.lineTo(x, cy - 70 - Math.sin(x * 0.006) * 30); c.lineTo(x1, cy); c.fill();
    for (let i = -2; i < 12; i++) {
      const tx = i * 170 + 60, ty = cy - 120 - (i % 2) * 30;
      if (tx < x0 - 120 || tx > x1 + 120) continue;
      c.fillStyle = '#8a5a44'; rr(c, tx - 7, ty, 14, cy - ty, 5); c.fill();
      c.fillStyle = i % 2 ? '#ffb3cf' : '#ffc4da';
      for (const [ox, oy, r] of [[-40, -10, 40], [0, -35, 48], [40, -8, 40], [0, 10, 36]]) { ell(c, tx + ox, ty + oy, r, r * 0.85); c.fill(); }
    }
    // pavilion beam and posts
    c.fillStyle = '#c0543e'; c.fillRect(x0, L.top - 6, x1 - x0, 26); c.fillStyle = '#9a3a2a'; c.fillRect(x0, L.top + 16, x1 - x0, 6);
    c.fillStyle = '#c0543e'; c.fillRect(x0 + 6, L.top, 22, cy - L.top); c.fillRect(x1 - 28, L.top, 22, cy - L.top);
    for (let i = 0; i < L.seats.length - 1; i++) drawLantern(c, (L.seats[i] + L.seats[i + 1]) / 2, L.headY - L.headR * 1.1, L.headR / 44 * 0.8, '#fff3e0', t);
  } else {
    const g = c.createLinearGradient(0, y0, 0, cy);
    g.addColorStop(0, '#5b4b9e'); g.addColorStop(0.5, '#ff8f7a'); g.addColorStop(1, '#ffc27a');
    c.fillStyle = g; c.fillRect(x0, y0, x1 - x0, cy - y0 + 4);
    const sunY = cy - 120;
    ell(c, (x0 + x1) / 2, sunY, 70, 70); c.fillStyle = '#ffe28a'; c.fill();
    // far shore
    c.fillStyle = '#4b3a6e'; c.beginPath(); c.moveTo(x0, cy - 70); for (let x = x0; x <= x1; x += 30) c.lineTo(x, cy - 80 - Math.abs(Math.sin(x * 0.01)) * 30); c.lineTo(x1, cy - 60); c.lineTo(x0, cy - 60); c.fill();
    // water
    const wg = c.createLinearGradient(0, cy - 65, 0, cy);
    wg.addColorStop(0, '#ff9f8a'); wg.addColorStop(1, '#6a5aa8');
    c.fillStyle = wg; c.fillRect(x0, cy - 65, x1 - x0, 70);
    c.strokeStyle = 'rgba(255,240,200,.6)'; c.lineWidth = 2.5;
    for (let i = 0; i < 30; i++) { const wx = x0 + ((i * 137 + t * 25) % (x1 - x0 + 60)) - 30, wy = cy - 55 + (i % 5) * 11; c.beginPath(); c.moveTo(wx, wy); c.lineTo(wx + 16 + (i % 3) * 8, wy); c.stroke(); }
    // floating lanterns
    for (let i = 0; i < 6; i++) {
      const lx = x0 + ((i * 263 + t * 12) % (x1 - x0 + 80)) - 40, ly = cy - 40 + (i % 3) * 12 + Math.sin(t * 2 + i) * 2;
      c.fillStyle = '#ffd86b'; c.shadowColor = '#ffb347'; c.shadowBlur = 14; rr(c, lx - 7, ly - 10, 14, 12, 3); c.fill(); c.shadowBlur = 0;
    }
    // roof beam
    c.fillStyle = P.wall; c.fillRect(x0, y0, x1 - x0, L.top + 22 - y0); c.fillStyle = P.wall2; c.fillRect(x0, L.top + 16, x1 - x0, 8);
    c.fillStyle = P.wall; c.fillRect(x0 + 4, L.top, 20, cy - L.top); c.fillRect(x1 - 24, L.top, 20, cy - L.top);
    for (let i = 0; i < L.seats.length - 1; i++) drawLantern(c, (L.seats[i] + L.seats[i + 1]) / 2, L.headY - L.headR * 1.1, L.headR / 44 * 0.85, i % 2 ? '#ffb347' : '#ff6b6b', t);
  }
  if (extras.lanterns) {
    // the bunting decoration (shop upgrade)
    const by = L.top + 30;
    c.strokeStyle = OUT; c.lineWidth = 2; c.beginPath();
    for (let x = x0; x <= x1; x += 10) c.lineTo(x, by + Math.sin((x - x0) / (x1 - x0) * Math.PI * 6) * 6 + 6);
    c.stroke();
    const cols = ['#ff6b6b', '#ffd23f', '#5fd08a', '#4fa8ff', '#ff7fae'];
    for (let x = Math.floor(x0 / 40) * 40, i = 0; x < x1; x += 40, i++) {
      const yy = by + Math.sin((x - x0) / (x1 - x0) * Math.PI * 6) * 6 + 6;
      c.beginPath(); c.moveTo(x - 10, yy); c.lineTo(x + 10, yy); c.lineTo(x, yy + 20); c.closePath(); fillStroke(c, cols[i % cols.length], 1.6);
    }
  }
}

export function drawBelt(c, x0, x1, y, h, off, P, dir, slow) {
  const top = y - h / 2;
  // back rail
  rr(c, x0, top - 8, x1 - x0, 12, 6); fillStroke(c, '#c9d3e0', 2.5);
  // surface
  c.fillStyle = P.belt; c.fillRect(x0, top, x1 - x0, h);
  c.save(); c.beginPath(); c.rect(x0, top, x1 - x0, h); c.clip();
  const sp = 34;
  c.strokeStyle = 'rgba(255,255,255,.09)'; c.lineWidth = 3;
  const o = ((off % sp) + sp) % sp;
  for (let x = x0 - sp + o; x < x1 + sp; x += sp) {
    c.beginPath();
    if (dir > 0) { c.moveTo(x - 8, top + 6); c.lineTo(x + 4, y); c.lineTo(x - 8, top + h - 6); }
    else { c.moveTo(x + 8, top + 6); c.lineTo(x - 4, y); c.lineTo(x + 8, top + h - 6); }
    c.stroke();
  }
  if (slow) { c.fillStyle = 'rgba(120,200,255,.15)'; c.fillRect(x0, top, x1 - x0, h); }
  c.restore();
  c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x0, top, x1 - x0, 6);
  // front rail + face
  rr(c, x0, top + h - 4, x1 - x0, 14, 6); fillStroke(c, '#dfe7f0', 2.5);
  c.fillStyle = '#fff'; c.fillRect(x0 + 8, top + h - 1, x1 - x0 - 16, 2.5);
  c.fillStyle = 'rgba(59,35,64,.25)'; c.fillRect(x0 + 4, top + h + 10, x1 - x0 - 8, 4);
}

export function drawHatch(c, x, y, h, P, side, t, flap) {
  const w = 74, top = y - h / 2 - 22;
  const xx = side < 0 ? x - w : x;
  rr(c, xx, top, w, h + 40, 10); fillStroke(c, P.counter2, 3);
  c.fillStyle = 'rgba(0,0,0,.45)'; rr(c, xx + 8, top + 12, w - 16, h + 18, 6); c.fill();
  // little curtain flaps
  for (let i = 0; i < 3; i++) {
    const fx = xx + 8 + i * ((w - 16) / 3), fw = (w - 16) / 3 - 2;
    const sw = Math.sin(t * 8 + i) * flap * 8;
    c.beginPath(); c.moveTo(fx, top + 12); c.lineTo(fx + fw, top + 12); c.lineTo(fx + fw + sw, top + 12 + h * 0.62); c.lineTo(fx + sw, top + 12 + h * 0.62); c.closePath(); fillStroke(c, P.accent, 2);
  }
  c.fillStyle = P.counter2; rr(c, xx - 4, top - 6, w + 8, 14, 6); fillStroke(c, P.counter2, 3);
}

// decorations bought in the shop
export function drawDeco(c, kind, x, y, s, t) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round';
  if (kind === 'cat') {
    const wave = Math.sin(t * 5) * 0.4;
    rr(c, -20, -34, 40, 36, 14); fillStroke(c, '#fff', 2.5);
    ell(c, 0, -44, 20, 17); fillStroke(c, '#fff', 2.5);
    c.beginPath(); c.moveTo(-16, -52); c.lineTo(-14, -66); c.lineTo(-5, -58); c.closePath(); fillStroke(c, '#fff', 2.5);
    c.beginPath(); c.moveTo(16, -52); c.lineTo(14, -66); c.lineTo(5, -58); c.closePath(); fillStroke(c, '#fff', 2.5);
    c.save(); c.translate(17, -36); c.rotate(-0.4 + wave); rr(c, -6, -22, 12, 24, 6); fillStroke(c, '#fff', 2.5); c.restore();
    ell(c, 0, -22, 10, 8); fillStroke(c, '#ffd23f', 2.2);
    c.fillStyle = '#ff4f5f'; c.fillRect(-18, -36, 36, 4);
    c.strokeStyle = OUT; c.lineWidth = 2.2; c.beginPath(); c.arc(-7, -44, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); c.beginPath(); c.arc(7, -44, 4, Math.PI * 1.1, Math.PI * 1.9); c.stroke();
    c.fillStyle = 'rgba(255,90,130,.5)'; ell(c, -12, -38, 4, 2.5); c.fill(); ell(c, 12, -38, 4, 2.5); c.fill();
  } else if (kind === 'bonsai') {
    c.beginPath(); c.moveTo(-26, -14); c.lineTo(26, -14); c.lineTo(20, 2); c.lineTo(-20, 2); c.closePath(); fillStroke(c, '#4fa8ff', 2.5);
    c.strokeStyle = '#7a4a2a'; c.lineWidth = 7; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, -14); c.quadraticCurveTo(-10, -30, 4, -44); c.stroke();
    c.fillStyle = '#5fd08a'; for (const [ox, oy, r] of [[-14, -46, 15], [10, -52, 17], [18, -38, 12], [-2, -60, 12]]) { ell(c, ox, oy, r, r * 0.75); fillStroke(c, '#5fd08a', 2.2); }
  } else if (kind === 'koi') {
    rr(c, -34, -46, 68, 48, 8); c.fillStyle = 'rgba(140,210,255,.55)'; c.fill(); c.lineWidth = 3; c.strokeStyle = OUT; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-28, -42, 8, 36);
    for (let i = 0; i < 2; i++) {
      const fx = Math.sin(t * 1.2 + i * 3) * 18, fy = -26 + i * 12, d = Math.cos(t * 1.2 + i * 3) > 0 ? 1 : -1;
      c.save(); c.translate(fx, fy); c.scale(d, 1);
      ell(c, 0, 0, 9, 5); fillStroke(c, i ? '#ff8a3c' : '#fff', 1.6); c.fillStyle = '#ff4f3c'; ell(c, 2, -1, 3, 2); c.fill();
      c.beginPath(); c.moveTo(-8, 0); c.lineTo(-14, -5); c.lineTo(-14, 5); c.closePath(); fillStroke(c, i ? '#ff8a3c' : '#fff', 1.4);
      c.restore();
    }
    c.fillStyle = '#7a4a2a'; rr(c, -36, 0, 72, 6, 3); c.fill();
  }
  c.restore();
}

// the tea cup, soy dish and chopsticks in front of each seat
export function drawSetting(c, x, y, t, s) {
  c.save(); c.translate(x, y); c.scale(s, s); c.lineJoin = 'round';
  // soy dish
  ell(c, -52, 2, 15, 6); fillStroke(c, '#fff', 2.2); ell(c, -52, 1.5, 9, 3.4); c.fillStyle = '#5a2e1e'; c.fill();
  // chopsticks on a rest
  c.strokeStyle = OUT; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(-30, 6); c.lineTo(10, 0); c.stroke();
  c.strokeStyle = '#ff9a5c'; c.lineWidth = 3; c.stroke();
  c.strokeStyle = OUT; c.lineWidth = 6; c.beginPath(); c.moveTo(-28, 9); c.lineTo(12, 4); c.stroke(); c.strokeStyle = '#ff9a5c'; c.lineWidth = 3; c.stroke();
  // tea cup
  c.beginPath(); c.moveTo(38, -14); c.lineTo(62, -14); c.lineTo(60, 6); c.quadraticCurveTo(50, 10, 40, 6); c.closePath(); fillStroke(c, '#9fd8a8', 2.4);
  ell(c, 50, -14, 12, 4); fillStroke(c, '#c8f0c0', 2.2);
  c.strokeStyle = 'rgba(59,35,64,.25)'; c.lineWidth = 2; c.beginPath(); c.moveTo(41, -4); c.lineTo(59, -4); c.stroke();
  c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2.2; c.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2);
  c.beginPath(); c.moveTo(48, -20); c.bezierCurveTo(53, -26, 44, -30, 50, -38); c.stroke();
  c.restore();
}
