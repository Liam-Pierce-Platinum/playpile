// Rendering: arena, floor, crowd, players, balls, juice. Canvas 2D in world units (court = 960 x 540).
const CW = 960, CH = 540, MID = CW / 2, PR = 15, BR = 9;
const OUT = 'rgba(14,16,30,0.92)';
const FONT = (s) => `italic 900 ${s}px "Arial Black", "Segoe UI Black", Arial, sans-serif`;
let floor = null, fans = [], vig = null, vigKey = '';

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function shade(hex, k) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; const f = (v) => Math.max(0, Math.min(255, Math.round(k > 0 ? v + (255 - v) * k : v * (1 + k)))); return `rgb(${f(r)},${f(g)},${f(b)})`; }
function seeded(s) { return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

export function buildArt(G) {
  if (!floor) floor = makeFloor();
  const r = seeded(1234 + G.rung * 7);
  const pal = [G.home.c, G.home.c, G.enemy.c, G.enemy.c, '#ffffff', '#d8dde8', '#ffd23f', '#3b4258', '#e63946'];
  const skins = ['#f3cfae', '#e0a978', '#b67a4f', '#8a5634', '#5e3a22'];
  fans = [];
  for (let row = 0; row < 5; row++) {
    const y = -34 - row * 23;
    for (let x = -100; x < CW + 100; x += 17 + r() * 4) {
      if (r() < 0.1) continue;
      fans.push({ x: x + r() * 4, y, row, col: pal[(r() * pal.length) | 0], skin: skins[(r() * 5) | 0], ph: r() * 6.28, hair: r() < 0.5 ? '#2b1d14' : '#5b3a1e' });
    }
  }
}

function makeFloor() {
  const S = 2, f = document.createElement('canvas'); f.width = CW * S; f.height = CH * S;
  const c = f.getContext('2d'); c.scale(S, S);
  const r = seeded(77);
  c.fillStyle = '#d29c5c'; c.fillRect(0, 0, CW, CH);
  const ROW = 18;
  for (let y = 0; y < CH; y += ROW) {
    let x = -r() * 200;
    while (x < CW) {
      const len = 140 + r() * 220, l = (r() - 0.5) * 0.12;
      c.fillStyle = shade('#d29c5c', l); c.fillRect(x, y, len, ROW);
      c.strokeStyle = 'rgba(120,70,25,0.08)'; c.lineWidth = 0.6;
      for (let k = 0; k < 3; k++) { const gy = y + 3 + r() * (ROW - 6); c.beginPath(); c.moveTo(x, gy); c.bezierCurveTo(x + len * 0.3, gy + (r() - 0.5) * 3, x + len * 0.6, gy + (r() - 0.5) * 3, x + len, gy); c.stroke(); }
      c.fillStyle = 'rgba(90,50,15,0.32)'; c.fillRect(x, y, 1, ROW);
      x += len;
    }
    c.fillStyle = 'rgba(90,50,15,0.22)'; c.fillRect(0, y, CW, 0.8);
  }
  const g = c.createLinearGradient(0, 0, CW, CH); g.addColorStop(0, 'rgba(255,255,255,0.10)'); g.addColorStop(0.5, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0.06)');
  c.fillStyle = g; c.fillRect(0, 0, CW, CH);
  // paint
  c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 5; c.strokeRect(2.5, 2.5, CW - 5, CH - 5);
  c.lineWidth = 6; c.beginPath(); c.moveTo(MID, 0); c.lineTo(MID, CH); c.stroke();
  c.lineWidth = 3; for (const ax of [MID - 170, MID + 170]) { c.setLineDash([16, 10]); c.beginPath(); c.moveTo(ax, 0); c.lineTo(ax, CH); c.stroke(); }
  c.setLineDash([]);
  c.fillStyle = 'rgba(255,255,255,0.10)'; c.beginPath(); c.arc(MID, CH / 2, 74, 0, 7); c.fill();
  c.lineWidth = 4; c.beginPath(); c.arc(MID, CH / 2, 74, 0, 7); c.stroke();
  c.lineWidth = 2.5; c.beginPath(); c.arc(MID, CH / 2, 20, 0, 7); c.stroke();
  for (const bx of [70, CW - 70]) { c.lineWidth = 3; c.beginPath(); c.moveTo(bx, 0); c.lineTo(bx, CH); c.stroke(); }
  return f;
}

function drawArena(c, G, t) {
  // apron + stands
  c.fillStyle = '#262d45'; c.fillRect(-140, -20, CW + 280, CH + 120);
  c.fillStyle = '#1b2033'; c.fillRect(-140, -200, CW + 280, 182);
  for (let i = 0; i < 6; i++) { c.fillStyle = i % 2 ? '#20263b' : '#252c44'; c.fillRect(-140, -40 - i * 23, CW + 280, 23); }
  const cheer = Math.min(1.5, G.cheer);
  for (const f of fans) {
    const hop = Math.max(0, Math.sin(t * 11 + f.ph)) * cheer * 5 + Math.sin(t * 2 + f.ph) * 0.6;
    const y = f.y - hop, k = 1 - f.row * 0.1;
    c.globalAlpha = k;
    c.fillStyle = f.col; rr(c, f.x - 6, y - 6, 12, 11, 4); c.fill();
    if (cheer > 0.6 && Math.sin(f.ph * 3) > 0) { c.strokeStyle = f.skin; c.lineWidth = 2.2; c.lineCap = 'round'; c.beginPath(); c.moveTo(f.x - 5, y - 4); c.lineTo(f.x - 8, y - 14); c.moveTo(f.x + 5, y - 4); c.lineTo(f.x + 8, y - 14); c.stroke(); }
    c.fillStyle = f.skin; c.beginPath(); c.arc(f.x, y - 10, 4.6, 0, 7); c.fill();
    c.fillStyle = f.hair; c.beginPath(); c.arc(f.x, y - 11.5, 4.6, Math.PI, 0); c.fill();
  }
  c.globalAlpha = 1;
  const sg = c.createLinearGradient(0, -200, 0, -20); sg.addColorStop(0, 'rgba(10,12,20,0.85)'); sg.addColorStop(1, 'rgba(10,12,20,0)');
  c.fillStyle = sg; c.fillRect(-140, -200, CW + 280, 180);
  // ad boards along the top
  c.fillStyle = '#12162a'; c.fillRect(-140, -22, CW + 280, 12);
  c.font = FONT(8); c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let x = -60, i = 0; x < CW + 100; x += 160, i++) { c.fillStyle = i % 2 ? G.home.c : '#ffd23f'; c.fillText(i % 3 === 1 ? 'GO ' + G.enemy.short + '!' : 'DODGEBALL DASH', x, -16); }
  // benches
  for (const [bx, col] of [[-48, G.home.c], [CW + 48, G.enemy.c]]) {
    c.fillStyle = 'rgba(0,0,0,0.25)'; rr(c, bx - 16, 128, 34, 200, 6); c.fill();
    c.fillStyle = '#6e4a2c'; rr(c, bx - 14, 124, 28, 196, 6); c.fill();
    c.fillStyle = '#8b6038'; rr(c, bx - 14, 124, 28, 8, 4); c.fill();
    c.fillStyle = col; c.fillRect(bx - 14, 316, 28, 4);
  }
  // scorer's table
  c.fillStyle = 'rgba(0,0,0,0.3)'; rr(c, MID - 86, CH + 34, 176, 30, 5); c.fill();
  c.fillStyle = '#151a2c'; rr(c, MID - 88, CH + 28, 176, 30, 5); c.fill();
  c.fillStyle = G.home.c; c.fillRect(MID - 84, CH + 44, 84, 10); c.fillStyle = G.enemy.c; c.fillRect(MID, CH + 44, 84, 10);
  c.fillStyle = '#fff'; c.font = FONT(9); c.fillText(G.score[0] + '  -  ' + G.score[1], MID, CH + 36);
  // boards around the court
  c.fillStyle = '#141829'; rr(c, -12, -12, CW + 24, CH + 24, 10); c.fill();
  c.fillStyle = '#39445f'; rr(c, -9, -9, CW + 18, CH + 18, 8); c.fill();
}

function drawFloor(c, G) {
  c.drawImage(floor, 0, 0, CW, CH);
  const tint = (x0, w, col, dir) => { const g = c.createLinearGradient(dir > 0 ? x0 : x0 + w, 0, dir > 0 ? x0 + w : x0, 0); g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.16; c.fillStyle = g; c.fillRect(x0, 0, w, CH); c.globalAlpha = 1; };
  tint(0, MID, G.home.c, 1); tint(MID, MID, G.enemy.c, -1);
  c.globalAlpha = 0.07; c.fillStyle = '#ffffff'; c.font = FONT(64); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.save(); c.translate(MID / 2 - 20, CH / 2); c.rotate(-Math.PI / 2); c.fillText(G.home.name, 0, 0); c.restore();
  c.save(); c.translate(MID + MID / 2 + 20, CH / 2); c.rotate(Math.PI / 2); c.fillText(G.enemy.short, 0, 0); c.restore();
  c.globalAlpha = 1;
  // overhead light pools
  c.globalCompositeOperation = 'lighter';
  for (const [lx, ly] of [[240, 200], [720, 200], [480, 400]]) { const g = c.createRadialGradient(lx, ly, 10, lx, ly, 330); g.addColorStop(0, 'rgba(255,240,215,0.10)'); g.addColorStop(1, 'rgba(255,240,215,0)'); c.fillStyle = g; c.fillRect(lx - 330, ly - 330, 660, 660); }
  c.globalCompositeOperation = 'source-over';
  const eg = c.createRadialGradient(MID, CH / 2, 200, MID, CH / 2, 620); eg.addColorStop(0, 'rgba(30,15,0,0)'); eg.addColorStop(1, 'rgba(30,15,0,0.28)');
  c.fillStyle = eg; c.fillRect(0, 0, CW, CH);
}

function limb(c, x0, y0, x1, y1, col, w) {
  c.lineCap = 'round'; c.strokeStyle = OUT; c.lineWidth = w + 2.4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  c.strokeStyle = col; c.lineWidth = w; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
}

function drawPlayer(c, p, G, T) {
  const fx = Math.cos(p.face), fy = Math.sin(p.face);
  const mv = Math.min(1, Math.hypot(p.vx, p.vy) / 140), sw = Math.sin(p.walk) * mv;
  const back = fy < -0.4, seated = p.out && p.seated;
  c.save(); c.translate(p.x, p.y);
  if (p.out && p.knockT <= 0) c.globalAlpha = 0.8;
  if (p.inv > 0 && ((G.t * 16) | 0) % 2) c.globalAlpha = 0.45;
  const rot = Math.atan2(Math.sin(p.spin), Math.cos(p.spin));
  if (Math.abs(rot) > 0.01) { c.translate(0, -22); c.rotate(rot); c.translate(0, 22); }
  const sq = p.squash; c.scale(1 + sq * 0.6, 1 - sq * 0.6);
  if (seated) c.translate(0, 5);
  // legs
  if (seated) { limb(c, -4.5, -16, -6 + fx * 3, -6, p.skin, 4.6); limb(c, 4.5, -16, 6 + fx * 3, -6, p.skin, 4.6); }
  else for (const [hx, o] of [[-4.5, sw], [4.5, -sw]]) {
    const fx2 = hx + o * fx * 6, fy2 = -1 + o * fy * 3;
    limb(c, hx, -16, fx2, fy2 - 2, p.skin, 4.6);
    c.fillStyle = '#ffffff'; c.strokeStyle = OUT; c.lineWidth = 1.3; c.beginPath(); c.ellipse(fx2 + fx * 1.5, fy2, 4.2, 2.6, 0, 0, 7); c.fill(); c.stroke();
  }
  // shorts
  c.fillStyle = T.c2; c.strokeStyle = OUT; c.lineWidth = 1.5; rr(c, -9, -23, 18, 10, 4); c.fill(); c.stroke();
  // arms: hand targets
  const px = -fy, py = fx;
  let hL = [-11 + sw * fx * 4, -20 + sw * fy * 2], hR = [11 - sw * fx * 4, -20 - sw * fy * 2];
  if (p.out && p.knockT > 0) { hL = [-14, -48]; hR = [14, -48]; }
  else if (p.catchT > 0) { hL = [fx * 15 - px * 9, fy * 7 - 28 - py * 4]; hR = [fx * 15 + px * 9, fy * 7 - 28 + py * 4]; }
  else if (p.charging) { const w = p.charge; hR = [-fx * (8 + w * 8) + px * 8, -fy * (4 + w * 4) - 36 - w * 4]; hL = [fx * 14, fy * 6 - 30]; }
  else if (p.throwT > 0) { hR = [fx * 22, fy * 10 - 30]; hL = [-fx * 8 - 8, -22]; }
  else if (p.hold) { hL = [fx * 13 - px * 7, fy * 7 - 20 - py * 3]; hR = [fx * 13 + px * 7, fy * 7 - 20 + py * 3]; }
  const arms = () => { limb(c, -9, -34, hL[0], hL[1], p.skin, 4); limb(c, 9, -34, hR[0], hR[1], p.skin, 4); c.fillStyle = p.skin; c.beginPath(); c.arc(hL[0], hL[1], 2.6, 0, 7); c.arc(hR[0], hR[1], 2.6, 0, 7); c.fill(); };
  if (back) arms();
  // torso
  c.fillStyle = T.c; c.strokeStyle = OUT; c.lineWidth = 1.6; rr(c, -10, -39, 20, 18, 6); c.fill();
  c.save(); rr(c, -10, -39, 20, 18, 6); c.clip(); c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(4 - fx * 3, -40, 8, 20); c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(-10, -39, 20, 4); c.fillStyle = T.a; c.fillRect(-10, -25, 20, 2); c.restore();
  rr(c, -10, -39, 20, 18, 6); c.stroke();
  c.fillStyle = T.a; c.font = FONT(8); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(p.num), 0, -31);
  if (!back) arms();
  // head
  const hx = fx * 1.6, hy = -47;
  c.fillStyle = p.skin; c.strokeStyle = OUT; c.lineWidth = 1.6; c.beginPath(); c.arc(hx, hy, 8.6, 0, 7); c.fill();
  c.save(); c.beginPath(); c.arc(hx, hy, 8.6, 0, 7); c.clip();
  c.fillStyle = p.hair;
  if (back) c.fillRect(hx - 10, hy - 10, 20, 20);
  else { const ca = -Math.PI / 2 - fx * 0.9, sp = 1.5; c.beginPath(); c.moveTo(hx + Math.cos(ca) * 3, hy + Math.sin(ca) * 3); c.arc(hx - fx * 1.5, hy - 1, 9.5, ca - sp, ca + sp); c.closePath(); c.fill(); }
  c.fillStyle = T.a; c.fillRect(hx - 10, hy - 4.2, 20, 2.6);
  c.restore();
  c.beginPath(); c.arc(hx, hy, 8.6, 0, 7); c.stroke();
  if (!back) {
    const ex = hx + fx * 4, ey = hy + 1.5 + fy * 1.2, spread = 2.9 * (1 - Math.abs(fx) * 0.55);
    c.fillStyle = '#16121a';
    if (p.out && p.knockT > 0) { c.font = FONT(6); c.fillText('x x', ex, ey); }
    else { c.beginPath(); c.arc(ex - spread, ey, 1.25, 0, 7); c.arc(ex + spread, ey, 1.25, 0, 7); c.fill(); }
  }
  c.restore();
}

function drawBall(c, b, G) {
  const x = b.x, y = b.y - b.z;
  if (b.state === 'live' && b.trail.length > 1) {
    const col = b.team === 0 ? G.home.c : G.enemy.c, n = b.trail.length;
    c.lineCap = 'round'; c.strokeStyle = col === '#3a3a46' ? '#ffd23f' : col;
    for (let i = 1; i < n; i++) { const k = i / n; c.globalAlpha = k * 0.55; c.lineWidth = BR * 2 * k * 0.95; c.beginPath(); c.moveTo(b.trail[i - 1].x, b.trail[i - 1].y); c.lineTo(b.trail[i].x, b.trail[i].y); c.stroke(); }
    c.globalAlpha = 1;
  }
  const g = c.createRadialGradient(x - 3, y - 3.5, 1, x, y, BR);
  g.addColorStop(0, '#ff8f7f'); g.addColorStop(0.45, '#e3262f'); g.addColorStop(1, '#8a0c14');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, BR, 0, 7); c.fill();
  c.save(); c.beginPath(); c.arc(x, y, BR, 0, 7); c.clip(); c.translate(x, y); c.rotate(b.spin);
  c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 1.3;
  c.beginPath(); c.arc(BR * 1.25, 0, BR * 0.95, 0, 7); c.stroke(); c.beginPath(); c.arc(-BR * 1.25, 0, BR * 0.95, 0, 7); c.stroke();
  c.restore();
  c.strokeStyle = 'rgba(60,0,8,0.9)'; c.lineWidth = 1.3; c.beginPath(); c.arc(x, y, BR, 0, 7); c.stroke();
  c.fillStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.ellipse(x - 3, y - 4, 2.6, 1.6, -0.5, 0, 7); c.fill();
  if (b.state === 'live') { c.strokeStyle = 'rgba(255,255,255,0.75)'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, BR + 3, 0, 7); c.stroke(); }
}

function drawAim(c, G, H) {
  const h = G.human; if (!h || h.out || !h.hold || G.state !== 'play' || G.auto) return;
  const power = h.charging ? Math.max(0.12, h.charge) : 0.3, sp = 560 + 640 * power;
  let x = h.x + Math.cos(h.face) * (PR + BR + 2), y = h.y + Math.sin(h.face) * (PR + BR + 2), vx = Math.cos(h.face) * sp, vy = Math.sin(h.face) * sp, z = 26, vz = 30, cu = H.humanCurve(h);
  const dt = 1 / 60, col = h.charging ? (h.charge >= 1 ? '255,80,60' : '255,210,63') : '255,255,255';
  const pts = [];
  for (let i = 0; i < 70; i++) {
    const v = Math.hypot(vx, vy), k = 760 * cu * (v / 1000);
    const ax = -vy / v * k, ay = vx / v * k; vx += ax * dt; vy += ay * dt; cu *= Math.exp(-dt * 0.9);
    vx *= Math.exp(-dt * 0.12); vy *= Math.exp(-dt * 0.12); vz -= 120 * dt; z += vz * dt; x += vx * dt; y += vy * dt;
    if (x < 0 || x > CW || y < 0 || y > CH || z < 5) break;
    pts.push(x, y - z);
  }
  if (pts.length < 4) return;
  c.save(); c.lineCap = 'round'; c.setLineDash([2, 9]); c.lineDashOffset = -G.t * 60;
  c.strokeStyle = 'rgba(' + col + ',' + (h.charging ? 0.9 : 0.4) + ')'; c.lineWidth = h.charging ? 4 : 3;
  c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.stroke();
  c.setLineDash([]); const ex = pts[pts.length - 2], ey = pts[pts.length - 1];
  c.lineWidth = 2; c.beginPath(); c.arc(ex, ey, 6, 0, 7); c.stroke(); c.restore();
}

function drawPart(c, q) {
  const k = q.t / q.life;
  if (q.type === 'ring') { c.strokeStyle = q.col; c.globalAlpha = 1 - k; c.lineWidth = 3.5 * (1 - k) + 0.5; c.beginPath(); c.ellipse(q.x, q.y - 4, q.size * (0.3 + 0.7 * k), q.size * 0.45 * (0.3 + 0.7 * k), 0, 0, 7); c.stroke(); }
  else if (q.type === 'dust') { c.fillStyle = q.col + (0.35 * (1 - k)) + ')'; c.beginPath(); c.arc(q.x, q.y, q.size * (0.6 + k), 0, 7); c.fill(); }
  else if (q.type === 'star') { c.globalAlpha = 1 - k * k; c.fillStyle = q.col; c.save(); c.translate(q.x, q.y - q.z); c.rotate(q.rot); const s = q.size * 1.6; c.beginPath(); for (let i = 0; i < 8; i++) { const r = i % 2 ? s * 0.4 : s; c.lineTo(Math.cos(i * Math.PI / 4) * r, Math.sin(i * Math.PI / 4) * r); } c.fill(); c.restore(); }
  else if (q.type === 'conf') { c.globalAlpha = Math.min(1, (1 - k) * 3); c.fillStyle = q.col; c.save(); c.translate(q.x, q.y); c.rotate(q.rot); c.fillRect(-q.size / 2, -q.size / 4, q.size, q.size / 2); c.restore(); }
  else { c.globalAlpha = 1 - k; c.fillStyle = q.col; c.beginPath(); c.arc(q.x, q.y - q.z, q.size * (1 - k * 0.5), 0, 7); c.fill(); }
  c.globalAlpha = 1;
}

function bigText(c, text, x, y, size, col, scale = 1, alpha = 1) {
  c.save(); c.globalAlpha = alpha; c.translate(x, y); c.scale(scale, scale); c.transform(1, 0, -0.15, 1, 0, 0);
  c.font = FONT(size); c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.strokeStyle = 'rgba(12,14,26,0.95)'; c.lineWidth = size * 0.22; c.strokeText(text, 0, 0);
  c.fillStyle = col; c.fillText(text, 0, 0); c.restore();
}

export function drawWorld(c, G, W, H, t, helpers) {
  const v = G.view, dpr = G.dpr;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#10131c'; c.fillRect(0, 0, W, H);
  const sx = (Math.random() - 0.5) * G.shake * 2, sy = (Math.random() - 0.5) * G.shake * 2;
  const z = 1 + G.zoom, cx = v.ox + MID * v.s, cy = v.oy + (CH / 2) * v.s;
  c.setTransform(dpr * z * v.s, 0, 0, dpr * z * v.s, dpr * (cx + (v.ox - cx) * z + sx), dpr * (cy + (v.oy - cy) * z + sy));
  drawArena(c, G, t);
  drawFloor(c, G);
  // shadows + rings
  for (const p of G.players) {
    if (p.out && p.seated) continue;
    c.fillStyle = 'rgba(30,15,0,0.28)'; c.beginPath(); c.ellipse(p.x, p.y, 14, 5.5, 0, 0, 7); c.fill();
    if (p.human && !p.out) {
      const pul = 0.5 + 0.5 * Math.sin(t * 6);
      c.strokeStyle = `rgba(255,210,63,${0.65 + pul * 0.35})`; c.lineWidth = 2.5; c.beginPath(); c.ellipse(p.x, p.y, 19, 8, 0, 0, 7); c.stroke();
    }
    if (p.charging) {
      const w = p.charge, col = w >= 1 ? (Math.sin(t * 30) > 0 ? '#ffffff' : '#ff4a3a') : `rgb(255,${Math.round(210 - w * 140)},${Math.round(63 - w * 40)})`;
      c.strokeStyle = col; c.lineWidth = 4; c.beginPath(); c.ellipse(p.x, p.y, 22, 9.5, 0, -Math.PI / 2, -Math.PI / 2 + w * Math.PI * 2); c.stroke();
    }
  }
  for (const b of G.balls) { const k = Math.max(0.2, 1 - b.z / 110); c.fillStyle = `rgba(30,15,0,${0.3 * k})`; c.beginPath(); c.ellipse(b.x, b.y, BR * (0.6 + 0.5 * k), BR * 0.45 * (0.6 + 0.5 * k), 0, 0, 7); c.fill(); }
  for (const q of G.parts) if (q.type === 'ring' || q.type === 'dust') drawPart(c, q);
  drawAim(c, G, helpers);
  // y-sorted bodies + balls
  const ents = [];
  for (const p of G.players) ents.push({ y: p.y, p });
  for (const b of G.balls) ents.push({ y: b.state === 'held' && b.owner ? b.owner.y + (Math.sin(b.owner.face) < -0.3 ? -1 : 1) : b.y, b });
  ents.sort((a, b) => a.y - b.y);
  for (const e of ents) {
    if (e.p) {
      const p = e.p; drawPlayer(c, p, G, p.team === 0 ? G.home : G.enemy);
      if (p.catchT > 0) { const k = p.catchT / 0.3; c.strokeStyle = `rgba(255,236,140,${0.4 + k * 0.6})`; c.lineWidth = 3; c.beginPath(); c.arc(p.x, p.y - 26, 22 + (1 - k) * 10, 0, 7); c.stroke(); }
      if (p.human && !p.out) { const by = p.y - 66 + Math.sin(t * 5) * 2.5; c.fillStyle = '#ffd23f'; c.strokeStyle = OUT; c.lineWidth = 1.5; c.beginPath(); c.moveTo(p.x - 6, by - 6); c.lineTo(p.x + 6, by - 6); c.lineTo(p.x, by + 2); c.closePath(); c.fill(); c.stroke(); }
    } else drawBall(c, e.b, G);
  }
  for (const q of G.parts) if (q.type !== 'ring' && q.type !== 'dust') drawPart(c, q);
  for (const tx of G.texts) { const k = tx.t / tx.life, pop = 1 + Math.max(0, 0.12 - tx.t) * 5; bigText(c, tx.text, tx.x, tx.y - k * 30, tx.size, tx.col, pop, k > 0.7 ? (1 - k) / 0.3 : 1); }
  if (G.state === 'countdown' && !G.demo) { const n = Math.ceil(G.cd / 0.6), f = (G.cd % 0.6) / 0.6; bigText(c, String(n), MID, CH / 2, 90, '#ffffff', 0.8 + f * 0.5, Math.min(1, f * 3)); }
  if (G.banner && !G.demo) {
    const b = G.banner, k = b.t / 1.3, pop = b.t < 0.15 ? 1.6 - b.t * 4 : 1, a = k > 0.75 ? (1 - k) / 0.25 : 1;
    c.globalAlpha = a * 0.6; c.fillStyle = '#0c0e1a'; c.fillRect(-140, CH / 2 - 44, CW + 280, 88); c.globalAlpha = 1;
    bigText(c, b.text, MID, CH / 2, 70, b.col, pop, a);
  }
  // screen space
  c.setTransform(1, 0, 0, 1, 0, 0);
  const key = W + 'x' + H;
  if (vigKey !== key) { vigKey = key; vig = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vig.addColorStop(0, 'rgba(0,0,0,0)'); vig.addColorStop(1, 'rgba(0,0,0,0.5)'); }
  c.fillStyle = vig; c.fillRect(0, 0, W, H);
  if (G.flash > 0) { c.globalAlpha = Math.min(0.45, G.flash * 1.3); c.fillStyle = G.flashCol; c.fillRect(0, 0, W, H); c.globalAlpha = 1; }
  if (G.joy) {
    const j = G.joy, d = dpr; let dx = j.x - j.sx, dy = j.y - j.sy; const l = Math.hypot(dx, dy); if (l > 50) { dx = dx / l * 50; dy = dy / l * 50; }
    c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 3 * d; c.beginPath(); c.arc(j.sx * d, j.sy * d, 50 * d, 0, 7); c.stroke();
    c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc((j.sx + dx) * d, (j.sy + dy) * d, 22 * d, 0, 7); c.fill();
  }
}
