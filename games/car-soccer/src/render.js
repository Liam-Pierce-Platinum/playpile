// Canvas drawing: arena (pre-rendered layer), cars, ball, particles, HUD.
// World space is y-up; the world transform flips it so everything is drawn in world units.
import { W, H, GH, GD, CR, BALL_R, POLY, FLOOR, GY, GT, LEDGE_Y, BASIN, RAMP_END, floorY } from './arena.js';
import { L, HH, WHEEL_R } from './physics.js';
import { fx } from './fx.js';

export const TEAM = [
  { main: '#2b8cff', light: '#9fd0ff', dark: '#0d3d8f', glow: '#3aa3ff', name: 'BLUE' },
  { main: '#ff8a1f', light: '#ffd09a', dark: '#8f3a05', glow: '#ff9a35', name: 'ORANGE' },
];
const FONT = '"Arial Black", "Segoe UI Black", Impact, system-ui, sans-serif';

let cv, ctx, dpr = 1, cw = 0, ch = 0;
export const cam = { x: 0, y: H / 2, s: 0.4, init: false };
let layer = null, layerS = 0;
const LX0 = -W / 2 - GD - 420, LX1 = W / 2 + GD + 420, LY0 = -420, LY1 = H + 420;

export function initRender(canvas) { cv = canvas; ctx = cv.getContext('2d'); resize(); }
export function resize() {
  dpr = Math.min(2, window.devicePixelRatio || 1);
  cw = Math.round(window.innerWidth * dpr); ch = Math.round(window.innerHeight * dpr);
  cv.width = cw; cv.height = ch;
  cam.init = false;
}
export function screenInfo() { return { cw, ch, dpr }; }

// ---------- camera ----------
// focus: list of {x,y,w} points. The view shows the whole arena when the screen is big enough,
// otherwise it follows the weighted focus and keeps the ball in frame.
export const PORTRAIT_FLOOR = 0.64;
export function updateCamera(dt, focus, ball, zoomBias = 1, fitAll = false) {
  const cssW = cw / dpr, cssH = ch / dpr;
  const fullW = W + 2 * GD + 160, fullH = H + 200;
  const full = Math.min(cw / fullW, ch / fullH);
  const cssMin = Math.min(cw, ch) / dpr;
  // css px per world unit: big screens see most of the pitch, phones get a closer follow-cam
  const minS = cssMin < 500 ? (cw > ch ? 0.34 : 0.3) : cssMin < 800 ? 0.46 : 0.5;
  let s = fitAll && cw > ch ? full : Math.max(full, minS * dpr);
  const portrait = ch > cw * 1.2;
  // portrait: the whole arena height fits in the upper ~2/3, thumbs get the band under the floor
  if (portrait) s = Math.max(full, Math.min(cw / 1000, 0.5 * ch / (H + 100)));
  s *= zoomBias;
  let fx_ = 0, fy = 0, wsum = 0;
  for (const f of focus) { fx_ += f.x * f.w; fy += f.y * f.w; wsum += f.w; }
  fx_ /= wsum || 1; fy /= wsum || 1;
  const vw = cw / s, vh = ch / s;
  // keep the ball inside the view with a margin
  const mx = vw / 2 - 260, my = vh / 2 - 200;
  if (ball) {
    if (mx > 0) fx_ = Math.max(ball.x - mx, Math.min(ball.x + mx, fx_));
    if (my > 0) fy = Math.max(ball.y - my, Math.min(ball.y + my, fy));
  }
  const xr = (W / 2 + GD + 80) - vw / 2;
  const tx = xr > 0 ? Math.max(-xr, Math.min(xr, fx_)) : 0;
  const yLo = (cssMin < 500 && cw > ch ? -110 : -60) + vh / 2, yHi = H + 60 - vh / 2;
  let ty = yLo < yHi ? Math.max(yLo, Math.min(yHi, fy)) : H / 2 - 20;
  if (portrait && s * (H + 60) < ch * 0.6) ty = (PORTRAIT_FLOOR - 0.5) * ch / s;   // floor line at a fixed height
  if (!cam.init) { cam.x = tx; cam.y = ty; cam.s = s; cam.init = true; }
  const k = 1 - Math.exp(-dt * 6);
  cam.x += (tx - cam.x) * k; cam.y += (ty - cam.y) * k; cam.s += (s - cam.s) * (1 - Math.exp(-dt * 4));
  void cssW; void cssH;
}
export function worldToScreen(x, y) { return [(x - cam.x) * cam.s + cw / 2, (cam.y - y) * cam.s + ch / 2]; }

// ---------- pre-rendered arena ----------
function buildLayer(s) {
  layerS = s;
  const c = document.createElement('canvas');
  c.width = Math.ceil((LX1 - LX0) * s); c.height = Math.ceil((LY1 - LY0) * s);
  const g = c.getContext('2d');
  g.setTransform(s, 0, 0, -s, -LX0 * s, LY1 * s);
  // stands
  const bg = g.createLinearGradient(0, LY0, 0, LY1);
  bg.addColorStop(0, '#05060f'); bg.addColorStop(0.5, '#0b0b22'); bg.addColorStop(1, '#130a2c');
  g.fillStyle = bg; g.fillRect(LX0, LY0, LX1 - LX0, LY1 - LY0);
  // crowd: rows of little heads
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = H + 60; y < LY1; y += 34) {
    for (let x = LX0; x < LX1; x += 26 + rnd() * 6) {
      const side = x < 0 ? 0 : 1, r = rnd();
      g.fillStyle = r < 0.22 ? (side ? 'rgba(255,138,31,0.55)' : 'rgba(43,140,255,0.55)') : `rgba(${90 + r * 60},${90 + r * 50},${130 + r * 60},0.35)`;
      g.beginPath(); g.arc(x, y + rnd() * 8, 9 + rnd() * 3, 0, Math.PI * 2); g.fill();
    }
  }
  for (const side of [-1, 1]) {
    for (let x = W / 2 + 80; x < LX1 - LX0; x += 30) {
      for (let y = GT + 70; y < H + 40; y += 34) {
        const r = rnd();
        g.fillStyle = r < 0.25 ? (side > 0 ? 'rgba(255,138,31,0.5)' : 'rgba(43,140,255,0.5)') : `rgba(${90 + r * 60},${90 + r * 50},${130 + r * 60},0.3)`;
        g.beginPath(); g.arc(side * (x + rnd() * 6), y + rnd() * 8, 9 + rnd() * 3, 0, Math.PI * 2); g.fill();
      }
    }
  }
  // stadium lights along the roof
  for (let x = -W / 2; x <= W / 2; x += 200) {
    const lg = g.createRadialGradient(x, H + 300, 0, x, H + 300, 120);
    lg.addColorStop(0, 'rgba(255,255,255,0.9)'); lg.addColorStop(0.2, 'rgba(200,220,255,0.35)'); lg.addColorStop(1, 'rgba(200,220,255,0)');
    g.fillStyle = lg; g.fillRect(x - 120, H + 180, 240, 240);
  }
  // ground under the arena
  const gg = g.createLinearGradient(0, 0, 0, LY0);
  gg.addColorStop(0, '#1a1b3a'); gg.addColorStop(1, '#07070f');
  g.fillStyle = gg; g.fillRect(LX0, LY0, LX1 - LX0, -LY0);
  // the bowl's concrete body under the ramps and goal ledges
  const sg = g.createLinearGradient(0, GT, 0, LY0);
  sg.addColorStop(0, '#20224a'); sg.addColorStop(0.5, '#141634'); sg.addColorStop(1, '#07070f');
  g.fillStyle = sg; g.beginPath(); g.moveTo(FLOOR[0][0] - 400, LY0); g.lineTo(FLOOR[0][0] - 400, GY);
  FLOOR.forEach(([x, y]) => g.lineTo(x, y)); g.lineTo(FLOOR[FLOOR.length - 1][0] + 400, GY); g.lineTo(FLOOR[FLOOR.length - 1][0] + 400, LY0); g.closePath(); g.fill();
  // structural ribs under the ramps
  g.strokeStyle = 'rgba(120,140,220,0.07)'; g.lineWidth = 6;
  for (const side of [-1, 1]) for (let x = BASIN + 80; x < W / 2 + GD; x += 120) {
    g.beginPath(); g.moveTo(side * x, floorY(side * x) - 40); g.lineTo(side * x, -200); g.stroke();
  }
  const path = () => { g.beginPath(); POLY.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); };
  // wall frame (thick, metallic)
  path(); g.lineJoin = 'round';
  g.strokeStyle = '#1c2148'; g.lineWidth = 110; g.stroke();
  g.strokeStyle = '#2a3168'; g.lineWidth = 60; g.stroke();
  // field
  path();
  const fg = g.createLinearGradient(0, 0, 0, H);
  fg.addColorStop(0, '#16205a'); fg.addColorStop(0.35, '#121a48'); fg.addColorStop(1, '#0c1236');
  g.fillStyle = fg; g.fill();
  g.save(); path(); g.clip();
  // team halves tint
  const tg = g.createLinearGradient(-W / 2 - GD, 0, W / 2 + GD, 0);
  tg.addColorStop(0, 'rgba(43,140,255,0.16)'); tg.addColorStop(0.46, 'rgba(43,140,255,0.03)');
  tg.addColorStop(0.54, 'rgba(255,138,31,0.03)'); tg.addColorStop(1, 'rgba(255,138,31,0.16)');
  g.fillStyle = tg; g.fillRect(-W / 2 - GD, -60, W + 2 * GD, H + 60);
  // hex grid
  g.strokeStyle = 'rgba(140,170,255,0.06)'; g.lineWidth = 3;
  const hr = 70, hw = hr * Math.sqrt(3);
  for (let row = 0, y = 0; y < H + hr; row++, y += hr * 1.5) {
    for (let x = -W / 2 - GD - hw + (row % 2 ? hw / 2 : 0); x < W / 2 + GD + hw; x += hw) {
      g.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + (k * Math.PI) / 3; const px = x + Math.cos(a) * hr, py = y + Math.sin(a) * hr; k ? g.lineTo(px, py) : g.moveTo(px, py); }
      g.closePath(); g.stroke();
    }
  }
  // light beams from the roof
  for (const bx of [-700, 0, 700]) {
    const lb = g.createLinearGradient(0, H, 0, 0);
    lb.addColorStop(0, 'rgba(180,210,255,0.10)'); lb.addColorStop(1, 'rgba(180,210,255,0)');
    g.fillStyle = lb; g.beginPath(); g.moveTo(bx - 60, H); g.lineTo(bx + 60, H); g.lineTo(bx + 260, 0); g.lineTo(bx - 260, 0); g.closePath(); g.fill();
  }
  // centre markings
  g.strokeStyle = 'rgba(220,235,255,0.22)'; g.lineWidth = 8; g.setLineDash([40, 30]);
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, H); g.stroke(); g.setLineDash([]);
  g.lineWidth = 8; g.beginPath(); g.arc(0, 0, 260, 0, Math.PI); g.stroke();
  g.fillStyle = 'rgba(220,235,255,0.35)'; g.beginPath(); g.arc(0, 0, 22, 0, Math.PI); g.fill();
  // goal boxes
  for (const side of [-1, 1]) {
    const team = TEAM[side < 0 ? 0 : 1];
    const x0 = side * W / 2, x1 = side * (W / 2 + GD);
    const ng = g.createLinearGradient(x0, 0, x1, 0);
    ng.addColorStop(0, team.main + '22'); ng.addColorStop(1, team.main + '66');
    g.fillStyle = ng; g.fillRect(Math.min(x0, x1), GY, GD, GH);
    // net
    g.save(); g.beginPath(); g.rect(Math.min(x0, x1), GY, GD, GH); g.clip();
    g.strokeStyle = team.light + '55'; g.lineWidth = 3;
    for (let k = -GH; k < GD + GH; k += 34) {
      g.beginPath(); g.moveTo(x0 + side * k, GY); g.lineTo(x0 + side * (k + GH), GT); g.stroke();
      g.beginPath(); g.moveTo(x0 + side * (k + GH), GY); g.lineTo(x0 + side * k, GT); g.stroke();
    }
    g.restore();
    // goal line on the ledge
    g.fillStyle = team.light; g.fillRect(x0 - 6, GY - 4, 12, 18);
    // kickoff spot on the ledge
    g.fillStyle = 'rgba(220,235,255,0.35)'; g.beginPath(); g.arc(side * (W / 2 - 170), floorY(side * (W / 2 - 170)), 16, 0, Math.PI); g.fill();
  }
  g.restore();
  // floor strip
  g.strokeStyle = 'rgba(150,200,255,0.14)'; g.lineWidth = 50; g.lineJoin = 'round';
  g.beginPath(); FLOOR.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke();
  // ramp tick marks (read the curve) and a steel coping rail on each lip
  g.strokeStyle = 'rgba(170,210,255,0.16)'; g.lineWidth = 4;
  for (const side of [-1, 1]) for (let x = BASIN + 50; x < RAMP_END; x += 70) {
    const y = floorY(x), e = 3, sl = (floorY(x + e) - floorY(x - e)) / (2 * e), l = Math.hypot(1, sl);
    const nx = -side * sl / l, ny = 1 / l;
    g.beginPath(); g.moveTo(side * x - nx * 6, y - ny * 6); g.lineTo(side * x + nx * 22, y + ny * 22); g.stroke();
  }
  for (const side of [-1, 1]) {
    const lx = side * (RAMP_END - 40), ly = floorY(lx), la = Math.atan((floorY(lx + 3) - floorY(lx - 3)) / 6);
    g.fillStyle = '#c9d6ff'; g.beginPath(); g.ellipse(lx, ly - 2, 46, 7, la, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.ellipse(lx, ly + 1, 40, 2.5, la, 0, Math.PI * 2); g.fill();
  }
  // neon boundary: blue left half, orange right half, white glow
  const bgr = g.createLinearGradient(-W / 2, 0, W / 2, 0);
  bgr.addColorStop(0, TEAM[0].glow); bgr.addColorStop(0.45, '#9fb8ff'); bgr.addColorStop(0.55, '#ffd0b0'); bgr.addColorStop(1, TEAM[1].glow);
  path(); g.strokeStyle = bgr; g.globalAlpha = 0.18; g.lineWidth = 46; g.stroke();
  g.globalAlpha = 0.45; g.lineWidth = 20; g.stroke();
  g.globalAlpha = 1; g.lineWidth = 7; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2.5; g.stroke();
  // goal frames (crossbar + post)
  for (const side of [-1, 1]) {
    const team = TEAM[side < 0 ? 0 : 1];
    const x0 = side * W / 2;
    g.lineCap = 'round';
    for (const [w, a] of [[44, 0.2], [24, 0.5], [11, 1]]) {
      g.strokeStyle = team.glow; g.globalAlpha = a; g.lineWidth = w;
      g.beginPath(); g.moveTo(x0 + side * GD, GT); g.lineTo(x0, GT); g.lineTo(x0, GT + 40); g.stroke();
    }
    g.globalAlpha = 1; g.strokeStyle = '#fff'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(x0 + side * GD, GT); g.lineTo(x0, GT); g.stroke();
    // goal-mouth floor lip
    g.globalAlpha = 0.9; g.strokeStyle = team.glow; g.lineWidth = 6; g.beginPath(); g.moveTo(x0 + side * GD, GY); g.lineTo(x0, GY); g.stroke(); g.globalAlpha = 1;
  }
  layer = c;
}

// ---------- sprites ----------
const glowCache = new Map();
function glowSprite(col) {
  if (glowCache.has(col)) return glowCache.get(col);
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, col); rg.addColorStop(0.35, col + '88'); rg.addColorStop(1, col + '00');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  glowCache.set(col, c);
  return c;
}
function glow(x, y, r, col, a = 1) {
  ctx.globalAlpha = a; ctx.drawImage(glowSprite(col), x - r, y - r, r * 2, r * 2); ctx.globalAlpha = 1;
}

// ---------- ball ----------
function drawBall(b, heat, touchTeam) {
  const R = BALL_R;
  const gcol = touchTeam === 0 ? TEAM[0].glow : touchTeam === 1 ? TEAM[1].glow : '#bfe3ff';
  ctx.globalCompositeOperation = 'lighter';
  glow(b.x, b.y, R * 2.6, gcol, 0.45 + heat * 0.4);
  ctx.globalCompositeOperation = 'source-over';
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2);
  const bg = ctx.createRadialGradient(-R * 0.35, R * 0.4, R * 0.1, 0, 0, R);
  bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.55, '#dfe8f7'); bg.addColorStop(1, '#8796b8');
  ctx.fillStyle = bg; ctx.fill();
  ctx.save(); ctx.clip();
  // rotating panels, foreshortened toward the rim to read as a sphere
  ctx.fillStyle = 'rgba(40,52,90,0.85)';
  const panel = (px, py, r, sx, rot) => {
    ctx.save(); ctx.translate(px, py); ctx.rotate(rot); ctx.scale(sx, 1);
    ctx.beginPath();
    for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    ctx.closePath(); ctx.fill(); ctx.restore();
  };
  const rot = b.rot;
  panel(Math.cos(rot) * R * 0.05, Math.sin(rot) * R * 0.05, R * 0.24, 1, rot);
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * Math.PI * 2 + 0.3;
    panel(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78, R * 0.25, 0.55, a);
  }
  // seams
  ctx.strokeStyle = 'rgba(40,52,90,0.35)'; ctx.lineWidth = 3;
  for (let k = 0; k < 5; k++) {
    const a = rot + (k / 5) * Math.PI * 2 + 0.3;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * R * 0.22, Math.sin(a) * R * 0.22); ctx.lineTo(Math.cos(a) * R * 0.6, Math.sin(a) * R * 0.6); ctx.stroke();
  }
  ctx.restore();
  // shading + rim + specular
  const sh = ctx.createRadialGradient(-R * 0.3, R * 0.35, R * 0.3, 0, 0, R);
  sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.8, 'rgba(10,20,60,0.15)'); sh.addColorStop(1, 'rgba(10,20,60,0.5)');
  ctx.fillStyle = sh; ctx.beginPath(); ctx.arc(0, 0, R, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = 5; ctx.strokeStyle = heat > 0.05 ? `rgba(255,${180 - heat * 120},${80 - heat * 60},${0.5 + heat * 0.5})` : 'rgba(200,230,255,0.7)'; ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.ellipse(-R * 0.36, R * 0.42, R * 0.22, R * 0.12, 0.7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

// ---------- cars ----------
function bodyPath(kind) {
  ctx.beginPath();
  if (kind === 'dart') {
    ctx.moveTo(-68, -12); ctx.lineTo(-70, 6); ctx.quadraticCurveTo(-68, 13, -58, 14); ctx.lineTo(-36, 15);
    ctx.lineTo(-16, 29); ctx.quadraticCurveTo(-10, 32, 0, 32); ctx.lineTo(12, 32); ctx.quadraticCurveTo(20, 31, 26, 26);
    ctx.lineTo(46, 13); ctx.lineTo(66, 8); ctx.quadraticCurveTo(74, 4, 72, -4); ctx.lineTo(68, -12);
  } else if (kind === 'brute') {
    ctx.moveTo(-66, -16); ctx.lineTo(-68, 28); ctx.quadraticCurveTo(-68, 42, -54, 43); ctx.lineTo(8, 44);
    ctx.quadraticCurveTo(18, 43, 24, 36); ctx.lineTo(38, 20); ctx.lineTo(62, 18); ctx.quadraticCurveTo(70, 16, 70, 6); ctx.lineTo(68, -16);
  } else {
    ctx.moveTo(-66, -14); ctx.lineTo(-68, 8); ctx.quadraticCurveTo(-66, 17, -55, 17); ctx.lineTo(-34, 18);
    ctx.lineTo(-22, 35); ctx.quadraticCurveTo(-18, 40, -9, 40); ctx.lineTo(13, 40); ctx.quadraticCurveTo(22, 39, 26, 33);
    ctx.lineTo(38, 18); ctx.lineTo(60, 14); ctx.quadraticCurveTo(71, 10, 70, 0); ctx.lineTo(68, -14);
  }
  ctx.closePath();
}
function windowPath(kind) {
  ctx.beginPath();
  if (kind === 'dart') { ctx.moveTo(-12, 27); ctx.lineTo(14, 27); ctx.lineTo(30, 17); ctx.lineTo(-28, 17); }
  else if (kind === 'brute') { ctx.moveTo(-8, 38); ctx.lineTo(10, 38); ctx.lineTo(30, 22); ctx.lineTo(-8, 22); }
  else { ctx.moveTo(-15, 35); ctx.lineTo(13, 35); ctx.lineTo(29, 20); ctx.lineTo(-24, 20); }
  ctx.closePath();
}
const shadeCache = new Map();
function shade(hex, f) {
  const k = hex + f;
  if (shadeCache.has(k)) return shadeCache.get(k);
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  if (f > 0) { r += (255 - r) * f; g += (255 - g) * f; b += (255 - b) * f; } else { r *= 1 + f; g *= 1 + f; b *= 1 + f; }
  const out = `rgb(${r | 0},${g | 0},${b | 0})`;
  shadeCache.set(k, out);
  return out;
}
// style: {paint (hex or null), body, trailCols}
export function drawCar(c, style, t) {
  if (c.demo > 0) return;
  const team = TEAM[c.team];
  const col = style.paint || team.main;
  ctx.save();
  ctx.translate(c.x, c.y); ctx.rotate(c.a); ctx.scale(c.dir, 1);
  // air roll / barrel roll: seen side-on the car squashes through its own long axis
  if (c.rollT > 0 && c.rollDur > 0) { const k = Math.cos((1 - c.rollT / c.rollDur) * c.rollAng); ctx.scale(1, Math.abs(k) < 0.12 ? (k < 0 ? -0.12 : 0.12) : k); }
  // turn-around squash
  if (c.turnT > 0) ctx.scale(Math.max(0.2, Math.abs(Math.cos((c.turnT / 0.22) * Math.PI))), 1);
  const squash = c.landT > 0 ? 1 - c.landT * 0.6 : 1;
  ctx.scale(1 + (1 - squash) * 0.4, squash);
  // team under-glow
  ctx.globalCompositeOperation = 'lighter';
  glow(0, -10, 110, team.glow, 0.35);
  // boost flame
  if (c.boosting) {
    const cols = style.trailCols || [team.light, team.main];
    const len = 60 + Math.random() * 40 + (c.supersonic ? 30 : 0);
    const fg = ctx.createLinearGradient(-66, 0, -66 - len, 0);
    fg.addColorStop(0, '#ffffff'); fg.addColorStop(0.25, cols[0]); fg.addColorStop(0.6, cols[Math.min(2, cols.length - 1)]); fg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = fg;
    ctx.beginPath(); ctx.moveTo(-64, 12); ctx.quadraticCurveTo(-66 - len * 0.6, 14, -66 - len, 0); ctx.quadraticCurveTo(-66 - len * 0.6, -10, -64, -8); ctx.closePath(); ctx.fill();
    glow(-80, 2, 50, cols[1] || team.main, 0.8);
  }
  ctx.globalCompositeOperation = 'source-over';
  const big = style.body === 'brute';
  // wheels behind body
  const wr = big ? WHEEL_R + 3 : WHEEL_R;
  const wy = -HH + (c.landT > 0 ? 3 : 0);
  for (const wx of [-42, 42]) {
    ctx.fillStyle = '#0c0d14'; ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#3a3f55'; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = shade(team.main, 0.2); ctx.beginPath(); ctx.arc(wx, wy, wr * 0.42, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#11131c'; ctx.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      const a = -c.wheel * c.dir + (k * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(wx + Math.cos(a) * wr * 0.42, wy + Math.sin(a) * wr * 0.42); ctx.stroke();
    }
  }
  // body
  bodyPath(style.body);
  const gg = ctx.createLinearGradient(0, 44, 0, -16);
  gg.addColorStop(0, shade(col, 0.45)); gg.addColorStop(0.45, col); gg.addColorStop(1, shade(col, -0.55));
  ctx.fillStyle = gg; ctx.fill();
  ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(5,8,25,0.85)'; ctx.stroke();
  // lower skirt
  ctx.save(); bodyPath(style.body); ctx.clip();
  ctx.fillStyle = 'rgba(10,12,30,0.65)'; ctx.fillRect(-80, -20, 160, 12);
  // team stripe
  ctx.fillStyle = style.paint ? team.main : team.light;
  ctx.fillRect(-70, 0, 145, 5);
  // glossy band
  const hl = ctx.createLinearGradient(0, 40, 0, 10);
  hl.addColorStop(0, 'rgba(255,255,255,0.45)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = hl; ctx.fillRect(-80, 10, 160, 40);
  ctx.restore();
  // window
  windowPath(style.body);
  const wg = ctx.createLinearGradient(0, 38, 0, 18);
  wg.addColorStop(0, '#7fb6ff'); wg.addColorStop(1, '#0d1a3a');
  ctx.fillStyle = wg; ctx.fill();
  ctx.strokeStyle = 'rgba(5,8,25,0.9)'; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(8, 23); ctx.stroke();
  // headlight + taillight
  ctx.fillStyle = '#fff7c8'; ctx.beginPath(); ctx.ellipse(66, 6, 4, 3, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff2d55'; ctx.fillRect(-69, 4, 4, 7);
  ctx.globalCompositeOperation = 'lighter';
  glow(72, 6, 26, '#fff3b0', 0.5);
  ctx.globalCompositeOperation = 'source-over';
  // spoiler
  ctx.fillStyle = shade(col, -0.4); ctx.fillRect(-66, style.body === 'brute' ? 43 : 17, 16, 5);
  ctx.restore();
}

function drawShadow(x, y, w, a) {
  if (Math.abs(x) > W / 2 + GD) return;
  const fy = floorY(x);
  let h = y - fy;
  if (h > 700 || h < -60) return;
  h = Math.max(0, h);
  const k = Math.max(0, 1 - h / 700);
  const ang = Math.atan((floorY(x + 4) - floorY(x - 4)) / 8);
  ctx.fillStyle = `rgba(0,0,10,${0.45 * k * a})`;
  ctx.beginPath(); ctx.ellipse(x, fy + 2, w * (0.6 + 0.4 * k), 10 * k + 3, ang, 0, Math.PI * 2); ctx.fill();
}

// ---------- particles ----------
function drawParts(additive) {
  for (const p of fx.parts) {
    if (p.add !== additive || p.delay > 0) continue;
    const k = p.life / p.max;
    if (p.type === 'glow') {
      glow(p.x, p.y, p.size * (0.6 + k), p.col, k);
    } else if (p.type === 'streak') {
      ctx.strokeStyle = p.col; ctx.globalAlpha = Math.min(1, k * 1.5); ctx.lineWidth = p.size * (0.4 + k * 0.6);
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
    } else if (p.type === 'smoke') {
      ctx.globalAlpha = k; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, Math.PI * 2); ctx.fill();
    } else if (p.type === 'confetti') {
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.scale(1, Math.cos(p.rot * 2));
      ctx.globalAlpha = Math.min(1, k * 2); ctx.fillStyle = p.col; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    } else {
      ctx.globalAlpha = k; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

// ---------- frame ----------
// view: {ball, cars, styles, trail[], touchTeam, hud:{...}}
export function draw(view, dt) {
  // layer resolution follows the camera scale
  const want = Math.min(1.25, Math.max(0.2, Math.round(cam.s * 1.15 * 10) / 10));
  if (!layer || Math.abs(want - layerS) > 0.05) buildLayer(want);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#06070f'; ctx.fillRect(0, 0, cw, ch);
  const tr = fx.trauma * fx.trauma, t = performance.now() / 1000;
  const sx = tr * 34 * (Math.sin(t * 61) + Math.sin(t * 37.3) * 0.5), sy = tr * 34 * (Math.cos(t * 53) + Math.sin(t * 29.1) * 0.5);
  const s = cam.s * (1 + fx.zoomPunch * fx.zoomPunch * 0.06);
  ctx.setTransform(s, 0, 0, -s, cw / 2 - (cam.x + sx) * s, ch / 2 + (cam.y + sy) * s);
  // arena layer (drawn in world coords; its pixels are y-down so flip back)
  ctx.save(); ctx.scale(1, -1);
  ctx.drawImage(layer, LX0, -LY1, LX1 - LX0, LY1 - LY0);
  ctx.restore();
  const b = view.ball;
  // goal glow when the ball is near a goal
  for (const side of [-1, 1]) {
    const d = Math.abs(b.x - side * W / 2);
    if (d < 700) {
      ctx.globalCompositeOperation = 'lighter';
      glow(side * (W / 2 + GD / 2), GY + GH / 2, 330, TEAM[side < 0 ? 0 : 1].glow, (1 - d / 700) * 0.35);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  // shadows
  drawShadow(b.x, b.y - BALL_R, BALL_R, 1);
  for (const c of view.cars) if (c.demo <= 0) drawShadow(c.x, c.y - 38, 70, 0.8);
  drawParts(false);
  // ball trail
  if (view.trail && view.trail.length > 2) {
    ctx.globalCompositeOperation = 'lighter';
    const tc = view.touchTeam === 0 ? TEAM[0].glow : view.touchTeam === 1 ? TEAM[1].glow : '#bfe3ff';
    for (let i = 1; i < view.trail.length; i++) {
      const p0 = view.trail[i - 1], p1 = view.trail[i], k = i / view.trail.length;
      if (p1.sp < 1300) continue;
      ctx.strokeStyle = tc; ctx.globalAlpha = k * 0.5 * Math.min(1, (p1.sp - 1300) / 900);
      ctx.lineWidth = BALL_R * 1.4 * k; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  view.cars.forEach((c, i) => drawCar(c, view.styles[i], t));
  drawBall(b, Math.min(1, Math.max(0, (Math.hypot(b.vx, b.vy) - 1800) / 1500)), view.touchTeam);
  ctx.globalCompositeOperation = 'lighter';
  drawParts(true);
  for (const r of fx.rings) {
    const k = 1 - r.life / r.max;
    ctx.strokeStyle = r.col; ctx.globalAlpha = (1 - k) * 0.9; ctx.lineWidth = r.width * (1 - k * 0.7);
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * (1 - (1 - k) * (1 - k)), 0, Math.PI * 2); ctx.stroke();
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (fx.flash > 0) { ctx.globalAlpha = fx.flash * 0.55; ctx.fillStyle = fx.flashCol; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
  // vignette
  const vg = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.45, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,10,0.45)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, cw, ch);
  if (view.hud) drawHud(view);
}

// ---------- HUD ----------
function text(str, x, y, size, col, align = 'center', stroke = true, italic = true) {
  ctx.font = `${italic ? 'italic ' : ''}900 ${size}px ${FONT}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  if (stroke) { ctx.lineWidth = Math.max(3, size * 0.14); ctx.strokeStyle = 'rgba(5,6,20,0.85)'; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = col; ctx.fillText(str, x, y);
}
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function fmtTime(t) { t = Math.max(0, Math.ceil(t)); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; }

function boostGauge(x, y, r, v, team, label) {
  ctx.fillStyle = 'rgba(8,10,30,0.7)'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = r * 0.22; ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI * 0.75, Math.PI * 2.25); ctx.stroke();
  ctx.strokeStyle = v > 99 ? '#fff' : TEAM[team].glow;
  ctx.beginPath(); ctx.arc(x, y, r * 0.8, Math.PI * 0.75, Math.PI * (0.75 + 1.5 * v / 100)); ctx.stroke();
  text(String(Math.floor(v)), x, y - r * 0.04, r * 0.62, '#fff', 'center', false);
  text(label, x, y + r * 0.55, r * 0.24, 'rgba(255,255,255,0.7)', 'center', false, false);
}

function drawHud(view) {
  const h = view.hud, u = dpr, m = h.match;
  const small = cw / u < 640;
  // scoreboard
  const portrait = ch > cw * 1.2;
  const bw = (small ? 230 : 300) * u, bh = (small ? 48 : 58) * u, bx = cw / 2 - bw / 2, by = (portrait ? 60 : 10) * u;
  ctx.fillStyle = 'rgba(8,10,30,0.82)'; rr(bx, by, bw, bh, 14 * u); ctx.fill();
  const sw = bw * 0.3;
  ctx.fillStyle = TEAM[0].main; rr(bx, by, sw, bh, 14 * u); ctx.fill();
  ctx.fillStyle = TEAM[1].main; rr(bx + bw - sw, by, sw, bh, 14 * u); ctx.fill();
  const pulse = (k) => 1 + Math.max(0, h.scorePulse[k]) * 0.5;
  text(String(m.score[0]), bx + sw / 2, by + bh / 2, bh * 0.62 * pulse(0), '#fff');
  text(String(m.score[1]), bx + bw - sw / 2, by + bh / 2, bh * 0.62 * pulse(1), '#fff');
  const tcol = m.overtime ? '#ffd23f' : m.time < 10.5 && m.time > 0 ? (Math.floor(m.time * 2) % 2 ? '#ff5a5a' : '#fff') : '#fff';
  text(m.overtime ? '+' + fmtTime(m.otTime) : fmtTime(m.time), cw / 2, by + bh * 0.45, bh * 0.46, tcol, 'center', false);
  if (m.overtime) text('OVERTIME', cw / 2, by + bh * 0.86, bh * 0.17, '#ffd23f', 'center', false, false);
  // names
  text(h.names[0], bx + sw / 2, by + bh + 12 * u, 11 * u, TEAM[0].light, 'center', true, false);
  text(h.names[1], bx + bw - sw / 2, by + bh + 12 * u, 11 * u, TEAM[1].light, 'center', true, false);
  // boost gauges
  const gr = (small ? 34 : 46) * u;
  if (h.replay) {} else if (h.touch) boostGauge(gr + 14 * u, (portrait ? 10 * u : by) + gr * 0.85 + 4 * u, gr * 0.85, view.cars[0].boost, 0, 'BOOST');
  else boostGauge(gr + 22 * u, ch - gr - 22 * u, gr, view.cars[0].boost, 0, h.twoP ? 'P1 BOOST' : 'BOOST');
  if (h.twoP && !h.replay) boostGauge(cw - gr - 22 * u, ch - gr - 22 * u, gr, view.cars[1].boost, 1, 'P2 BOOST');
  // off-screen ball arrow
  const [bxs, bys] = worldToScreen(view.ball.x, view.ball.y);
  const mg = 30 * u;
  if (view.ball.y > -1000 && (bxs < -BALL_R * cam.s || bxs > cw + BALL_R * cam.s || bys < -BALL_R * cam.s || bys > ch + BALL_R * cam.s)) {
    const ax = Math.max(mg, Math.min(cw - mg, bxs)), ay = Math.max(mg + 70 * u, Math.min(ch - mg, bys));
    const a = Math.atan2(bys - ay, bxs - ax);
    ctx.save(); ctx.translate(ax, ay); ctx.rotate(a);
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(16 * u, 0); ctx.lineTo(-10 * u, 12 * u); ctx.lineTo(-10 * u, -12 * u); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  // off-screen own car(s): team-coloured chevron on the screen edge so you never lose yourself
  if (!h.replay) for (let i = 0; i < (h.twoP ? 2 : 1); i++) {
    const c = view.cars[i];
    if (!c || c.demo > 0) continue;
    const [xs, ys] = worldToScreen(c.x, c.y);
    const off = 40 * cam.s;
    if (xs > -off && xs < cw + off) continue;
    const right = xs >= cw + off, ex = right ? cw - 18 * u : 18 * u;
    const ey = Math.max(130 * u, Math.min(ch - 40 * u, ys));
    const pul = 1 + Math.sin(performance.now() / 120) * 0.08;
    ctx.save(); ctx.translate(ex, ey); ctx.scale(right ? pul : -pul, pul);
    ctx.fillStyle = TEAM[c.team].main; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2.5 * u;
    ctx.beginPath(); ctx.moveTo(12 * u, 0); ctx.lineTo(-10 * u, 15 * u); ctx.lineTo(-10 * u, -15 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
    text(h.twoP ? 'P' + (i + 1) : 'YOU', ex + (right ? -34 : 34) * u, ey, 12 * u, TEAM[c.team].light, 'center', true, false);
  }
  // popups
  for (const p of fx.popups) {
    const k = p.t / p.life;
    const sc = k < 0.12 ? 0.4 + (k / 0.12) * 0.8 : k < 0.2 ? 1.2 - ((k - 0.12) / 0.08) * 0.2 : 1;
    ctx.globalAlpha = k > 0.8 ? (1 - k) / 0.2 : 1;
    let sz = Math.min(cw / u * 0.16, 110) * u * p.size * sc;
    ctx.font = `italic 900 ${sz}px ${FONT}`;
    const tw = ctx.measureText(p.text).width;
    if (tw > cw * 0.9) sz *= (cw * 0.9) / tw;
    text(p.text, cw / 2, ch * p.y, sz, p.col);
    if (p.sub) text(p.sub, cw / 2, ch * p.y + sz * 0.75, sz * 0.32, '#fff', 'center', true, false);
    ctx.globalAlpha = 1;
  }
  if (h.countdown > 0) {
    const n = Math.ceil(h.countdown), f = h.countdown - Math.floor(h.countdown);
    text(String(n), cw / 2, ch * 0.42, Math.min(cw, ch) * (0.18 + f * 0.1), '#fff');
  } else if (h.go > 0) {
    ctx.globalAlpha = Math.min(1, h.go * 2);
    text('GO!', cw / 2, ch * 0.42, Math.min(cw, ch) * (0.22 + (0.5 - h.go) * 0.15), '#7dff6a');
    ctx.globalAlpha = 1;
  }
  if (h.replay) {
    const blink = Math.floor(performance.now() / 400) % 2;
    ctx.fillStyle = 'rgba(8,10,30,0.7)'; rr(14 * u, ch - 56 * u, 210 * u, 42 * u, 10 * u); ctx.fill();
    ctx.fillStyle = blink ? '#ff3b4f' : '#7a1020'; ctx.beginPath(); ctx.arc(36 * u, ch - 35 * u, 8 * u, 0, Math.PI * 2); ctx.fill();
    text('REPLAY', 52 * u, ch - 35 * u, 20 * u, '#fff', 'left', false);
    text(h.touch ? 'tap to skip' : 'press jump to skip', cw - 14 * u, ch - 30 * u, 13 * u, 'rgba(255,255,255,0.75)', 'right', true, false);
    ctx.lineWidth = 6 * u; ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.strokeRect(0, 0, cw, ch);
  }
  if (h.hint) {
    ctx.globalAlpha = Math.min(1, h.hint.t);
    const hs = (small ? 13 : 16) * u, hy = portrait ? ch * 0.34 : ch - (h.touch ? 150 : 40) * u;
    ctx.font = `900 ${hs}px ${FONT}`;
    // too wide for a small phone: one instruction per line instead of running off both edges
    const lines = ctx.measureText(h.hint.text).width > cw - 24 ? h.hint.text.split(/\s+·\s+/) : [h.hint.text];
    lines.forEach((ln, i) => text(ln, cw / 2, hy + (i - (lines.length - 1) / 2) * hs * 1.3, hs, 'rgba(255,255,255,0.9)', 'center', true, false));
    ctx.globalAlpha = 1;
  }
}

// small preview for the garage
export function drawPreview(canvas, style, team = 0) {
  const g = canvas.getContext('2d'), save = ctx;
  ctx = g;
  const w = canvas.width, h = canvas.height;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
  const s = Math.min(w / 220, h / 120);
  g.setTransform(s, 0, 0, -s, w / 2, h * 0.62);
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(0, -38, 80, 8, 0, 0, Math.PI * 2); g.fill();
  const t = performance.now() / 1000;
  drawCar({ x: 0, y: 0, a: 0, dir: 1, team, boosting: true, supersonic: false, wheel: t * 6, demo: 0, turnT: 0, landT: 0 }, style, t);
  ctx = save;
}
