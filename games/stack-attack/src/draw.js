// All the art: cartoon food with chunky outlines, the diner backdrop, the gull.
// Food is drawn in a local frame: origin at the bottom centre, "up" is -y.
export const O = '#3b1e14';      // outline ink
export const LW = 4;             // outline width
const TAU = Math.PI * 2;

// a rounded box with a wobbly edge (superellipse + noise)
function blob(ctx, cx, cy, rx, ry, n = 5, amp = 0, freq = 9, seed = 0, steps = 72) {
  ctx.beginPath();
  for (let k = 0; k <= steps; k++) {
    const th = (k / steps) * TAU;
    const c = Math.cos(th), s = Math.sin(th);
    const ex = Math.sign(c) * Math.pow(Math.abs(c), 2 / n), ey = Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    const nz = amp * (Math.sin(th * freq + seed) * 0.6 + Math.sin(th * freq * 1.7 + seed * 2.3) * 0.4);
    const x = cx + ex * (rx + nz), y = cy + ey * (ry + nz);
    if (k === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}
function ink(ctx, fill, lw = LW) {
  ctx.fillStyle = fill; ctx.fill();
  ctx.lineWidth = lw; ctx.strokeStyle = O; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.stroke();
}
function vgrad(ctx, y0, y1, stops) {
  const g = ctx.createLinearGradient(0, y0, 0, y1);
  stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
  return g;
}
function shine(ctx, x, y, rx, ry, a = 0.45) {
  ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill(); ctx.restore();
}

const SEEDS = [[-0.55, 0.42], [-0.3, 0.7], [-0.05, 0.5], [0.22, 0.78], [0.45, 0.45], [0.12, 0.25], [-0.38, 0.22], [0.6, 0.2], [-0.15, 0.85], [0.35, 0.6]];

export function drawFood(ctx, kind, w, h, o = {}) {
  const skin = o.skin, seed = o.seed || 0, t = o.t || 0;
  const hw = w / 2;
  switch (kind) {
    case 'bun': {
      ctx.beginPath();
      ctx.moveTo(-hw + 8, -h);
      ctx.lineTo(hw - 8, -h);
      ctx.quadraticCurveTo(hw + 1, -h, hw, -h + 9);
      ctx.bezierCurveTo(hw, -h * 0.25, hw - 16, 0, hw - 34, 0);
      ctx.lineTo(-hw + 34, 0);
      ctx.bezierCurveTo(-hw + 16, 0, -hw, -h * 0.25, -hw, -h + 9);
      ctx.quadraticCurveTo(-hw - 1, -h, -hw + 8, -h);
      ctx.closePath();
      ink(ctx, skinFill(ctx, skin, -h, 0));
      // the cut face
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ffe9bb'; ctx.fillRect(-hw, -h - 2, w, 10);
      ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(-hw, -h + 8, w, 3);
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.beginPath(); ctx.moveTo(-hw + 4, -h + 8.5); ctx.lineTo(hw - 4, -h + 8.5); ctx.stroke();
      shine(ctx, -hw * 0.5, -h * 0.42, hw * 0.22, 3.5, skin && skin.gloss ? 0.55 : 0.32);
      break;
    }
    case 'top': {
      ctx.beginPath();
      ctx.moveTo(-hw, -7);
      ctx.bezierCurveTo(-hw, -h * 0.98, -hw * 0.55, -h, 0, -h);
      ctx.bezierCurveTo(hw * 0.55, -h, hw, -h * 0.98, hw, -7);
      ctx.quadraticCurveTo(hw, 0, hw - 9, 0);
      ctx.lineTo(-hw + 9, 0);
      ctx.quadraticCurveTo(-hw, 0, -hw, -7);
      ctx.closePath();
      ink(ctx, skinFill(ctx, skin, -h, 0, true));
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#ffe9bb'; ctx.fillRect(-hw, -7, w, 10);
      if (skin && skin.rainbow) {
        const cols = ['#ff6fa8', '#ffb347', '#ffe95c', '#7be37b', '#5ec8ff', '#a98bff'];
        for (let i = 0; i < 6; i++) { ctx.fillStyle = cols[i]; ctx.globalAlpha = 0.55; ctx.fillRect(-hw, -h + i * (h - 8) / 6, w, (h - 8) / 6 + 1); }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.beginPath(); ctx.moveTo(-hw + 3, -7); ctx.lineTo(hw - 3, -7); ctx.stroke();
      // seeds / salt
      if (skin && skin.seed) {
        ctx.fillStyle = skin.seed; ctx.strokeStyle = 'rgba(59,30,20,0.55)'; ctx.lineWidth = 1.2;
        for (const [u, v] of SEEDS) {
          const x = u * hw * 0.92, top = -7 - (h - 7) * Math.sqrt(Math.max(0, 1 - u * u));
          const y = -7 + (top + 7) * (0.3 + v * 0.62);
          ctx.beginPath();
          if (skin.salt) ctx.rect(x - 2.5, y - 2.5, 5, 5);
          else ctx.ellipse(x, y, 4.6, 2.4, u * 0.9, 0, TAU);
          ctx.fill(); ctx.stroke();
        }
      }
      if (skin && skin.salt) { // pretzel slashes
        ctx.strokeStyle = skin.light; ctx.lineWidth = 3;
        for (const u of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(u * hw - 10, -h * 0.55); ctx.lineTo(u * hw + 10, -h * 0.75); ctx.stroke(); }
      }
      shine(ctx, -hw * 0.38, -h * 0.72, hw * 0.28, 7, skin && skin.gloss ? 0.6 : 0.4);
      shine(ctx, -hw * 0.68, -h * 0.5, 4, 3, 0.5);
      if (skin && skin.sparkle) sparkle(ctx, hw * 0.45, -h * 0.75, 7 + 3 * Math.sin(t * 6));
      break;
    }
    case 'patty': {
      blob(ctx, 0, -h / 2, hw, h / 2, 5, 1.6, 23, seed);
      ink(ctx, vgrad(ctx, -h, 0, ['#a9622f', '#7a3c1c', '#4f230f']));
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(40,14,4,0.5)'; ctx.lineWidth = 3;
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(i * 24 - 6, -h + 2); ctx.lineTo(i * 24 + 6, -h + 7); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,190,120,0.35)';
      for (let i = 0; i < 9; i++) { const x = ((i * 37 + seed * 13) % w) - hw; ctx.fillRect(x, -h * 0.45 + (i % 3) * 4, 3, 2); }
      ctx.restore();
      shine(ctx, -hw * 0.45, -h + 5, hw * 0.25, 2.2, 0.28);
      break;
    }
    case 'cheese': {
      const d = [[hw * 0.42, 15], [hw * 0.02, 9], [-hw * 0.46, 13]];
      ctx.beginPath();
      ctx.moveTo(-hw, -h);
      ctx.lineTo(hw, -h);
      ctx.lineTo(hw + 7, 9);
      ctx.lineTo(hw - 12, 0);
      for (const [x, L] of d) {
        ctx.lineTo(x + 8, 0);
        ctx.bezierCurveTo(x + 8, L * 0.6, x + 6, L, x, L);
        ctx.bezierCurveTo(x - 6, L, x - 8, L * 0.6, x - 8, 0);
      }
      ctx.lineTo(-hw + 12, 0);
      ctx.lineTo(-hw - 7, 10);
      ctx.closePath();
      ink(ctx, '#ffc52b');
      ctx.fillStyle = '#ffe476'; ctx.fillRect(-hw + 4, -h + 2, w - 8, 2.5);
      shine(ctx, d[0][0] - 2, d[0][1] - 5, 2, 3, 0.6);
      break;
    }
    case 'lettuce': {
      blob(ctx, 0, -h / 2, hw + 2, h / 2 + 2, 3.2, 2.8, 31, seed, 120);
      ink(ctx, vgrad(ctx, -h, 0, ['#9ae35e', '#5bbf38', '#3e9b28']));
      ctx.strokeStyle = '#c4f08f'; ctx.lineWidth = 2.5; ctx.beginPath();
      for (let x = -hw + 10; x <= hw - 10; x += 4) { const y = -h / 2 + Math.sin(x * 0.12 + seed) * 2.5; if (x === -hw + 10) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.stroke();
      break;
    }
    case 'tomato': {
      blob(ctx, 0, -h / 2, hw, h / 2, 6, 0.4, 7, seed);
      ink(ctx, '#e5352a');
      blob(ctx, 0, -h / 2, hw - 6, h / 2 - 3, 6, 0, 1, 0);
      ctx.fillStyle = '#ff7b5f'; ctx.fill();
      ctx.fillStyle = '#ffe9a6';
      for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.ellipse(i * hw * 0.2, -h / 2, 3.4, 1.8, 0.4, 0, TAU); ctx.fill(); }
      shine(ctx, -hw * 0.5, -h + 3.5, hw * 0.2, 1.6, 0.5);
      break;
    }
    case 'onion': {
      for (let i = -1; i <= 1; i++) {
        blob(ctx, i * w * 0.31, -h / 2 + (i === 0 ? -1 : 0), w * 0.2, h / 2 + 0.5, 4, 0, 1, 0);
        ink(ctx, '#f6ebff', 3.5);
        ctx.strokeStyle = '#a65ac4'; ctx.lineWidth = 2.5;
        blob(ctx, i * w * 0.31, -h / 2 + (i === 0 ? -1 : 0), w * 0.2 - 5, h / 2 - 3, 4, 0, 1, 0); ctx.stroke();
      }
      break;
    }
    case 'pickles': {
      for (let i = 0; i < 4; i++) {
        const x = -hw + w * (0.14 + i * 0.24);
        blob(ctx, x, -h / 2, w * 0.12, h / 2 + 1, 2.4, 1, 11, i + seed);
        ink(ctx, '#80bd3d', 3.5);
        ctx.fillStyle = '#c9ec7a';
        for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(x - 8 + k * 8, -h / 2 + (k % 2 ? 1.5 : -1.5), 1.6, 0, TAU); ctx.fill(); }
      }
      break;
    }
    case 'bacon': {
      const top = (x) => -h + Math.sin(x * 0.075 + seed) * 4;
      ctx.beginPath();
      for (let x = -hw; x <= hw; x += 4) ctx.lineTo(x, top(x));
      for (let x = hw; x >= -hw; x -= 4) ctx.lineTo(x, top(x) + h + 1);
      ctx.closePath();
      ink(ctx, '#d4433a');
      ctx.strokeStyle = '#ffb7a3'; ctx.lineWidth = 3;
      for (const f of [0.32, 0.7]) { ctx.beginPath(); for (let x = -hw + 4; x <= hw - 4; x += 4) ctx.lineTo(x, top(x) + h * f); ctx.stroke(); }
      break;
    }
    case 'egg': {
      blob(ctx, 0, -h * 0.4, hw, h * 0.42, 2.6, 2.4, 7, seed);
      ink(ctx, '#fffaf0');
      ctx.beginPath(); ctx.ellipse(0, -h * 0.62, w * 0.2, h * 0.62, 0, Math.PI, 0); ctx.closePath();
      const g = ctx.createRadialGradient(-6, -h, 2, 0, -h * 0.6, w * 0.22);
      g.addColorStop(0, '#ffe066'); g.addColorStop(1, '#ff9d0a');
      ink(ctx, g, 3.5);
      shine(ctx, -9, -h * 0.95, 5, 3, 0.75);
      break;
    }
    case 'boot': {
      ctx.beginPath();
      ctx.moveTo(-hw, -h); ctx.lineTo(-hw + w * 0.48, -h); ctx.lineTo(-hw + w * 0.5, -h * 0.42);
      ctx.bezierCurveTo(hw * 0.4, -h * 0.42, hw, -h * 0.35, hw, -h * 0.12);
      ctx.lineTo(hw, 0); ctx.lineTo(-hw, 0); ctx.closePath();
      ink(ctx, vgrad(ctx, -h, 0, ['#9b6a3d', '#6d4421']));
      ctx.fillStyle = '#2c1a0e'; ctx.fillRect(-hw + 2, -8, w - 4, 6);
      ctx.fillStyle = '#e7d3a7';
      for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(-hw + w * 0.4, -h + 9 + i * 8, 2.3, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = O; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-hw, -h + 5); ctx.lineTo(-hw + w * 0.48, -h + 5); ctx.stroke();
      break;
    }
    case 'fish': {
      ctx.beginPath();
      ctx.moveTo(-hw, -h); ctx.lineTo(-hw + w * 0.2, -h / 2); ctx.lineTo(-hw, 0); ctx.closePath();
      ink(ctx, '#5b93b8', 3.5);
      ctx.beginPath(); ctx.ellipse(w * 0.08, -h / 2, w * 0.38, h / 2, 0, 0, TAU);
      ink(ctx, vgrad(ctx, -h, 0, ['#7db6d8', '#a9d5e8', '#e6f3f7']));
      ctx.strokeStyle = O; ctx.lineWidth = 3;
      const ex = w * 0.3, ey = -h * 0.6;
      ctx.beginPath(); ctx.moveTo(ex - 4, ey - 4); ctx.lineTo(ex + 4, ey + 4); ctx.moveTo(ex + 4, ey - 4); ctx.lineTo(ex - 4, ey + 4); ctx.stroke();
      ctx.beginPath(); ctx.arc(w * 0.4, -h * 0.32, 4, 0.2, Math.PI - 0.2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(-w * 0.05, -h * 0.98); ctx.quadraticCurveTo(w * 0.05, -h * 1.3, w * 0.15, -h * 0.98); ctx.stroke();
      break;
    }
    case 'sock': {
      ctx.beginPath();
      ctx.moveTo(-hw, -h); ctx.lineTo(-hw + w * 0.42, -h); ctx.lineTo(-hw + w * 0.42, -h * 0.45);
      ctx.lineTo(hw - 10, -h * 0.45); ctx.quadraticCurveTo(hw, -h * 0.45, hw, -h * 0.2); ctx.quadraticCurveTo(hw, 0, hw - 12, 0);
      ctx.lineTo(-hw + 8, 0); ctx.quadraticCurveTo(-hw, 0, -hw, -8); ctx.closePath();
      ink(ctx, '#f5f0e6');
      ctx.save(); ctx.clip();
      ctx.fillStyle = '#e8412c';
      for (let i = 0; i < 4; i++) ctx.fillRect(-hw, -h + i * 8, w, 4);
      ctx.fillStyle = '#2fb7b0'; ctx.fillRect(hw - 22, -h, 30, h);
      ctx.restore();
      ctx.lineWidth = LW; ctx.strokeStyle = O; ctx.stroke();
      break;
    }
  }
  if (o.sauced) drawSauce(ctx, w, h, o.sauced, seed);
}

function skinFill(ctx, skin, y0, y1, dome) {
  const s = skin || { base: '#f0a33c', dark: '#c9772a', light: '#ffd27a' };
  return vgrad(ctx, y0, y1, dome ? [s.light, s.base, s.dark] : [s.base, s.dark]);
}
function sparkle(ctx, x, y, r) {
  ctx.save(); ctx.fillStyle = '#fff'; ctx.beginPath();
  ctx.moveTo(x, y - r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.quadraticCurveTo(x, y, x, y + r); ctx.quadraticCurveTo(x, y, x - r, y); ctx.quadraticCurveTo(x, y, x, y - r);
  ctx.fill(); ctx.restore();
}
// ketchup drips over the top edge of a sauced piece
export function drawSauce(ctx, w, h, col, seed) {
  const c = col === true ? '#d8231b' : col;
  ctx.beginPath();
  ctx.moveTo(-w * 0.36, -h - 2);
  ctx.lineTo(w * 0.36, -h - 2);
  const drips = [0.3, 0.1, -0.12, -0.3];
  ctx.lineTo(w * 0.36, -h + 2);
  for (const u of drips) {
    const x = u * w, L = 6 + ((seed * 7 + u * 31) % 1 + 1) * 6;
    ctx.lineTo(x + 5, -h + 2); ctx.quadraticCurveTo(x + 5, -h + L, x, -h + L + 2); ctx.quadraticCurveTo(x - 5, -h + L, x - 5, -h + 2);
  }
  ctx.lineTo(-w * 0.36, -h + 2); ctx.closePath();
  ctx.fillStyle = c; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = O; ctx.stroke();
  shine(ctx, -w * 0.2, -h - 0.5, 8, 1.2, 0.6);
}
export function drawSauceBlob(ctx, r, col, t) {
  ctx.beginPath();
  ctx.moveTo(0, -r * 1.7);
  ctx.bezierCurveTo(r * 0.6, -r * 0.9, r, -r * 0.4, r, 0);
  ctx.arc(0, 0, r, 0, Math.PI);
  ctx.bezierCurveTo(-r, -r * 0.4, -r * 0.6, -r * 0.9, 0, -r * 1.7);
  ink(ctx, col, 3.5);
  shine(ctx, -r * 0.35, -r * 0.2, r * 0.22, r * 0.35, 0.65);
}

// ----------------------------------------------------------------- backdrop
export function paintBackdrop(ctx, VW, VH, gy, colL, colW) {
  // wall
  ctx.fillStyle = '#a6e3d8'; ctx.fillRect(0, 0, VW, VH);
  ctx.fillStyle = '#9adbd0';
  for (let x = 0; x < VW; x += 46) ctx.fillRect(x, 0, 22, gy);
  // upper trim
  ctx.fillStyle = '#f15b4c'; ctx.fillRect(0, 0, VW, 22);
  ctx.fillStyle = '#fff6e2'; ctx.fillRect(0, 22, VW, 8);
  // windows
  const winY = gy - 470, winH = 230;
  const nWin = Math.max(2, Math.round(VW / 330));
  const step = VW / nWin;
  for (let i = 0; i < nWin; i++) {
    const wx = i * step + step * 0.14, ww = step * 0.72;
    roundRect(ctx, wx - 10, winY - 10, ww + 20, winH + 20, 22); ctx.fillStyle = '#d9d9d9'; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = '#5e6b70'; ctx.stroke();
    ctx.save(); roundRect(ctx, wx, winY, ww, winH, 14); ctx.clip();
    ctx.fillStyle = vgrad(ctx, winY, winY + winH, ['#6fc7ff', '#bfe9ff', '#ffe9c4']); ctx.fillRect(wx, winY, ww, winH);
    // clouds
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let k = 0; k < 2; k++) { const cx = wx + ww * (0.25 + k * 0.5 + (i % 2) * 0.1), cy = winY + 40 + k * 26; for (const [dx, dy, r] of [[0, 0, 18], [18, -8, 20], [36, 0, 16], [16, 6, 18]]) { ctx.beginPath(); ctx.arc(cx + dx, cy + dy, r, 0, TAU); ctx.fill(); } }
    // city
    ctx.fillStyle = '#86b9cf';
    for (let x = wx - 10, k = i * 7; x < wx + ww; k++) { const bw = 26 + (k * 37) % 30, bh = 40 + (k * 53) % 90; ctx.fillRect(x, winY + winH - bh, bw, bh); x += bw + 4; }
    ctx.fillStyle = '#6aa3bd';
    for (let x = wx - 20, k = i * 5 + 3; x < wx + ww; k++) { const bw = 30 + (k * 41) % 30, bh = 20 + (k * 29) % 50; ctx.fillRect(x, winY + winH - bh, bw, bh); x += bw + 10; }
    ctx.restore();
    ctx.lineWidth = 4; ctx.strokeStyle = '#5e6b70'; ctx.beginPath(); ctx.moveTo(wx + ww / 2, winY); ctx.lineTo(wx + ww / 2, winY + winH); ctx.stroke();
    shine(ctx, wx + ww * 0.25, winY + 30, 20, 50, 0.18);
    // awning over the window
    const aw = 8, sw = (ww + 30) / aw;
    for (let k = 0; k < aw; k++) {
      ctx.fillStyle = k % 2 ? '#fff6e2' : '#f15b4c';
      ctx.beginPath(); const ax = wx - 15 + k * sw;
      ctx.moveTo(ax, winY - 34); ctx.lineTo(ax + sw, winY - 34); ctx.lineTo(ax + sw, winY - 12); ctx.arc(ax + sw / 2, winY - 12, sw / 2, 0, Math.PI); ctx.closePath(); ctx.fill();
    }
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(59,30,20,0.6)'; ctx.strokeRect(wx - 15, winY - 34, ww + 30, 0.1);
  }
  // neon sign between windows (in the upper wall)
  // pendant lamps
  for (let i = 0; i < nWin + 1; i++) {
    const lx = i * step; if (lx < 30 || lx > VW - 30) continue;
    ctx.strokeStyle = '#3b3b3b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(lx, 30); ctx.lineTo(lx, 120); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(lx - 34, 152); ctx.quadraticCurveTo(lx - 30, 118, lx, 118); ctx.quadraticCurveTo(lx + 30, 118, lx + 34, 152); ctx.closePath();
    ctx.fillStyle = '#f15b4c'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.stroke();
    const g = ctx.createRadialGradient(lx, 158, 2, lx, 170, 120); g.addColorStop(0, 'rgba(255,240,180,0.55)'); g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g; ctx.fillRect(lx - 120, 150, 240, 140);
    ctx.fillStyle = '#fff4b8'; ctx.beginPath(); ctx.ellipse(lx, 153, 18, 5, 0, 0, TAU); ctx.fill();
  }
  // checker wainscot
  const cy0 = gy - 150, cs = 22;
  ctx.fillStyle = '#fff6e2'; ctx.fillRect(0, cy0, VW, gy - cy0);
  ctx.fillStyle = '#6dbdb2';
  for (let y = cy0, r = 0; y < gy; y += cs, r++) for (let x = (r % 2) * cs; x < VW; x += cs * 2) ctx.fillRect(x, y, cs, cs);
  ctx.fillStyle = '#c9d3d6'; ctx.fillRect(0, cy0 - 12, VW, 12);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, cy0 - 12, VW, 3);
  // counter top
  ctx.fillStyle = vgrad(ctx, gy - 4, gy + 26, ['#ffffff', '#e9e4da', '#cfc8bb']); ctx.fillRect(0, gy - 4, VW, 30);
  ctx.fillStyle = '#9aa6aa'; ctx.fillRect(0, gy + 26, VW, 8);
  ctx.fillStyle = '#eef3f4'; ctx.fillRect(0, gy + 26, VW, 2);
  // counter front
  ctx.fillStyle = vgrad(ctx, gy + 34, VH, ['#ef4a3b', '#c7302a']); ctx.fillRect(0, gy + 34, VW, VH - gy - 34);
  ctx.fillStyle = '#b3bfc2';
  for (let k = 1; k <= 3; k++) { ctx.fillRect(0, gy + 34 + k * 26, VW, 5); }
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  for (let k = 1; k <= 3; k++) { ctx.fillRect(0, gy + 34 + k * 26, VW, 1.5); }
  // stool tops peeking up from below
  for (let x = 70; x < VW; x += 230) {
    ctx.beginPath(); ctx.ellipse(x, VH + 8, 70, 30, 0, Math.PI, 0); ctx.fillStyle = '#e8412c'; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = O; ctx.stroke();
    ctx.fillStyle = '#d0d8da'; ctx.fillRect(x - 74, VH - 2, 148, 10);
    shine(ctx, x - 26, VH - 12, 20, 4, 0.4);
  }
  // soft focus on the play column edges
  const vg = ctx.createRadialGradient(VW / 2, VH * 0.45, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.45, Math.max(VW, VH) * 0.8);
  vg.addColorStop(0, 'rgba(40,20,10,0)'); vg.addColorStop(1, 'rgba(40,20,10,0.28)');
  ctx.fillStyle = vg; ctx.fillRect(0, 0, VW, VH);
}

export function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
}

// ----------------------------------------------------------------- seagull
export function drawGull(ctx, flap, carrying, face) {
  ctx.save(); ctx.scale(face, 1);
  const wy = Math.sin(flap) * 26;
  // back wing
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.quadraticCurveTo(-30, -20 - wy * 0.7, -62, -8 - wy); ctx.quadraticCurveTo(-30, 2, -6, 4); ctx.closePath();
  ink(ctx, '#dfe6ea', 3.5);
  // body
  ctx.beginPath(); ctx.ellipse(0, 0, 34, 18, -0.08, 0, TAU); ink(ctx, '#ffffff', 4);
  // tail
  ctx.beginPath(); ctx.moveTo(-30, -4); ctx.lineTo(-52, -12); ctx.lineTo(-48, 6); ctx.closePath(); ink(ctx, '#bfc9ce', 3.5);
  // head
  ctx.beginPath(); ctx.arc(30, -12, 14, 0, TAU); ink(ctx, '#ffffff', 4);
  // beak
  ctx.beginPath(); ctx.moveTo(41, -14); ctx.lineTo(62, -9); ctx.lineTo(41, -5); ctx.closePath(); ink(ctx, '#ffb31a', 3);
  ctx.fillStyle = '#e8412c'; ctx.beginPath(); ctx.arc(55, -9, 2, 0, TAU); ctx.fill();
  // mean eye
  ctx.fillStyle = O; ctx.beginPath(); ctx.arc(34, -15, 3, 0, TAU); ctx.fill();
  ctx.strokeStyle = O; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(27, -22); ctx.lineTo(40, -18); ctx.stroke();
  // front wing
  ctx.beginPath(); ctx.moveTo(2, -4); ctx.quadraticCurveTo(-14, -30 - wy, -48, -20 - wy * 1.3); ctx.quadraticCurveTo(-18, 0, 2, 6); ctx.closePath();
  ink(ctx, '#eef2f4', 3.5);
  ctx.fillStyle = '#3b3b3b'; ctx.beginPath(); ctx.arc(-44, -19 - wy * 1.3, 5, 0, TAU); ctx.fill();
  // feet
  ctx.strokeStyle = '#ffb31a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-4, 16); ctx.lineTo(-8, 26); ctx.moveTo(6, 16); ctx.lineTo(4, 26); ctx.stroke();
  ctx.restore();
}

// the customer's face on the ticket: mood 0 (furious) .. 1 (delighted)
export function drawFace(ctx, x, y, r, mood, hue, t) {
  ctx.save(); ctx.translate(x, y);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU);
  ink(ctx, hue, 3.5);
  // hair tuft
  ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.85); ctx.quadraticCurveTo(0, -r * 1.5, r * 0.3, -r * 0.9); ctx.lineWidth = 3; ctx.strokeStyle = O; ctx.stroke();
  const angry = mood < 0.3, happy = mood > 0.65;
  ctx.fillStyle = O;
  const ey = -r * 0.15;
  if (happy) { ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-r * 0.35, ey + 2, r * 0.14, Math.PI, 0); ctx.stroke(); ctx.beginPath(); ctx.arc(r * 0.35, ey + 2, r * 0.14, Math.PI, 0); ctx.stroke(); }
  else { ctx.beginPath(); ctx.arc(-r * 0.35, ey, r * 0.11, 0, TAU); ctx.arc(r * 0.35, ey, r * 0.11, 0, TAU); ctx.fill(); }
  if (angry) { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-r * 0.55, ey - r * 0.35); ctx.lineTo(-r * 0.15, ey - r * 0.18); ctx.moveTo(r * 0.55, ey - r * 0.35); ctx.lineTo(r * 0.15, ey - r * 0.18); ctx.stroke(); }
  ctx.lineWidth = 3; ctx.beginPath();
  const my = r * 0.4, curve = (mood - 0.45) * r * 0.9;
  ctx.moveTo(-r * 0.38, my); ctx.quadraticCurveTo(0, my + curve, r * 0.38, my); ctx.stroke();
  if (happy) { ctx.fillStyle = 'rgba(255,90,90,0.35)'; ctx.beginPath(); ctx.arc(-r * 0.6, r * 0.2, r * 0.16, 0, TAU); ctx.arc(r * 0.6, r * 0.2, r * 0.16, 0, TAU); ctx.fill(); }
  if (angry) { ctx.fillStyle = 'rgba(255,60,40,' + (0.25 + 0.15 * Math.sin(t * 10)) + ')'; ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill(); }
  ctx.restore();
}

// a customer waiting at the counter (wide screens): mood 0..1, joy/yuck 0..1 for reactions
const SHIRTS = ['#ff7aa8', '#5ec8ff', '#ffb347', '#a98bff', '#7be37b', '#ff6b5a'];
export function drawCustomer(ctx, x, y, o) {
  const t = o.t, shirt = SHIRTS[o.seed % SHIRTS.length];
  const hop = -Math.abs(Math.sin(o.joy * Math.PI * 3)) * 40 * o.joy;
  const shake = o.yuck > 0 ? Math.sin(t * 50) * 6 * o.yuck : 0;
  const breathe = Math.sin(t * 2.2 + o.seed) * 3;
  ctx.save(); ctx.translate(x + shake, y + hop);
  // body
  ctx.beginPath(); ctx.moveTo(-70, 10); ctx.bezierCurveTo(-74, -120 - breathe, 74, -120 - breathe, 70, 10); ctx.closePath();
  ink(ctx, shirt, 4.5);
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.ellipse(-30, -70, 14, 30, -0.3, 0, TAU); ctx.fill();
  // collar + bow tie
  ctx.beginPath(); ctx.moveTo(-16, -96 - breathe); ctx.lineTo(0, -80 - breathe); ctx.lineTo(16, -96 - breathe); ink(ctx, '#fffaee', 3);
  ctx.beginPath(); ctx.moveTo(0, -84 - breathe); ctx.lineTo(-14, -92 - breathe); ctx.lineTo(-14, -76 - breathe); ctx.closePath(); ctx.moveTo(0, -84 - breathe); ctx.lineTo(14, -92 - breathe); ctx.lineTo(14, -76 - breathe); ctx.closePath(); ink(ctx, '#e8412c', 3);
  // head
  const hy = -150 - breathe;
  const hue = o.yuck > 0.2 ? '#b8e08a' : o.hue;
  drawFace(ctx, 0, hy, 50, o.joy > 0.1 ? 1 : o.yuck > 0.1 ? 0 : o.mood, hue, t);
  // hat or hair by seed
  const kind = o.seed % 3;
  if (kind === 0) { ctx.beginPath(); ctx.ellipse(0, hy - 44, 46, 12, 0, 0, TAU); ink(ctx, '#3b5bdb', 3.5); ctx.beginPath(); ctx.moveTo(-34, hy - 44); ctx.quadraticCurveTo(0, hy - 92, 34, hy - 44); ctx.closePath(); ink(ctx, '#4c6ef5', 3.5); }
  else if (kind === 1) { ctx.beginPath(); ctx.arc(-30, hy - 34, 18, 0, TAU); ctx.arc(30, hy - 34, 18, 0, TAU); ctx.arc(0, hy - 46, 22, 0, TAU); ink(ctx, '#6b3f2a', 3.5); }
  else { ctx.beginPath(); ctx.ellipse(0, hy - 30, 54, 10, 0, 0, TAU); ink(ctx, '#2d2a32', 3.5); ctx.beginPath(); ctx.rect(-30, hy - 76, 60, 46); ink(ctx, '#2d2a32', 3.5); ctx.fillStyle = '#e8412c'; ctx.fillRect(-28, hy - 44, 56, 9); }
  // arms on the counter
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(s * 58, -60); ctx.quadraticCurveTo(s * 92, -20, s * 60, 4); ctx.lineWidth = 22; ctx.strokeStyle = O; ctx.lineCap = 'round'; ctx.stroke();
    ctx.lineWidth = 15; ctx.strokeStyle = shirt; ctx.stroke();
    ctx.beginPath(); ctx.arc(s * 56, 4, 14, 0, TAU); ink(ctx, o.hue, 3.5);
  }
  // speech bubble
  if (o.say) {
    ctx.font = '700 22px "Fredoka", sans-serif';
    const w = ctx.measureText(o.say).width + 30;
    ctx.save(); ctx.translate(0, hy - 120); ctx.scale(o.sayK, o.sayK);
    roundRect(ctx, -w / 2, -24, w, 44, 18); ink(ctx, '#ffffff', 3.5);
    ctx.beginPath(); ctx.moveTo(-10, 18); ctx.lineTo(0, 36); ctx.lineTo(10, 18); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.fillStyle = O; ctx.textAlign = 'center'; ctx.fillText(o.say, 0, 6);
    ctx.restore();
  }
  ctx.restore();
}
