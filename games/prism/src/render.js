// Canvas drawing: neon shapes with cheap glow (wide faint stroke + crisp stroke).
import { CX, R_BALL, COLS, primsNear } from './world.js';

export const SKINS = [
  { id: 'classic', name: 'CLASSIC', cost: 0 },
  { id: 'comet', name: 'COMET', cost: 25 },
  { id: 'halo', name: 'HALO', cost: 60 },
  { id: 'spark', name: 'SPARK', cost: 120 },
  { id: 'prism', name: 'PRISM', cost: 200 },
  { id: 'pulse', name: 'PULSE', cost: 350 },
];

const dust = [];
for (let i = 0; i < 90; i++) dust.push({ x: Math.random(), y: Math.random(), z: 0.15 + Math.random() * 0.5, r: Math.random() * 1.4 + 0.3 });

export function view(cw, ch) {
  const s = Math.min(cw / 360, ch / 600);
  // ball sits low enough that the whole next obstacle is in view on wide screens;
  // the last ~85 units of a fatal fall happen just below the bottom edge
  const anchor = Math.max(ch * 0.45, ch - 185 * s);
  return { s, anchor, cw, ch };
}

function star5(ctx, x, y, R, rot) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = rot + i * Math.PI / 5 - Math.PI / 2, r = i % 2 ? R * 0.45 : R;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.closePath();
}

function strokePrim(ctx, p, extra) {
  ctx.beginPath();
  if (p.k === 0) { ctx.lineCap = 'butt'; ctx.lineWidth = p.th + extra; ctx.arc(p.cx, p.cy, p.R, p.a0, p.a0 + p.span); ctx.stroke(); }
  else if (p.k === 1) { ctx.lineCap = 'round'; ctx.lineWidth = p.th + extra; ctx.moveTo(p.x1, p.y1); ctx.lineTo(p.x2, p.y2); ctx.stroke(); }
  else if (p.k === 2) { ctx.lineCap = 'butt'; ctx.lineWidth = p.th + extra; ctx.moveTo(p.x1 + 1, p.y); ctx.lineTo(p.x2 - 1, p.y); ctx.stroke(); }
  else if (p.k === 3) { ctx.arc(p.x, p.y, p.r + extra / 2, 0, Math.PI * 2); ctx.fill(); }
}

export function draw(ctx, g, V, opt = {}) {
  const { s, anchor, cw, ch } = V, dpr = opt.dpr || 1;
  const t = g.st.t, cam = g.cam;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#06040c'; ctx.fillRect(0, 0, cw, ch);
  // star dust parallax
  ctx.fillStyle = '#ffffff';
  for (const d of dust) {
    const y = ((d.y * ch - cam * s * d.z * 0.35) % ch + ch) % ch;
    ctx.globalAlpha = 0.15 + d.z * 0.5;
    ctx.fillRect(d.x * cw, y, d.r, d.r);
  }
  ctx.globalAlpha = 1;
  // world transform
  const sh = g.shake, ox = sh ? (Math.random() - 0.5) * sh : 0, oy = sh ? (Math.random() - 0.5) * sh : 0;
  ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (cw / 2 - CX * s + ox), dpr * (anchor - cam * s + oy));
  const top = cam - anchor / s - 40, bot = cam + (ch - anchor) / s + 40;
  const midY = (top + bot) / 2, halfH = (bot - top) / 2;

  // obstacles
  const ps = primsNear(g.obs, t, midY, halfH).slice();
  ctx.globalAlpha = 0.16;
  for (const p of ps) { ctx.strokeStyle = ctx.fillStyle = COLS[p.col]; strokePrim(ctx, p, 14); }
  ctx.globalAlpha = 0.28;
  for (const p of ps) { ctx.strokeStyle = ctx.fillStyle = COLS[p.col]; strokePrim(ctx, p, 6); }
  ctx.globalAlpha = 1;
  for (const p of ps) { ctx.strokeStyle = ctx.fillStyle = COLS[p.col]; strokePrim(ctx, p, 0); }
  ctx.globalAlpha = 0.35; ctx.strokeStyle = ctx.fillStyle = '#ffffff';
  for (const p of ps) {
    if (p.k === 3) { ctx.beginPath(); ctx.arc(p.x - 2, p.y - 2, 2.2, 0, 7); ctx.fill(); continue; }
    ctx.beginPath(); ctx.lineWidth = Math.max(2, p.th * 0.18);
    if (p.k === 0) { ctx.lineCap = 'butt'; ctx.arc(p.cx, p.cy, p.R - p.th * 0.22, p.a0 + 0.02, p.a0 + p.span - 0.02); }
    else if (p.k === 1) { ctx.lineCap = 'round'; ctx.moveTo(p.x1, p.y1 - p.th * 0.2); ctx.lineTo(p.x2, p.y2 - p.th * 0.2); }
    else { ctx.lineCap = 'butt'; ctx.moveTo(p.x1 + 3, p.y - p.th * 0.22); ctx.lineTo(p.x2 - 3, p.y - p.th * 0.22); }
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // hubs
  for (const o of g.obs) {
    if (o.cy < top - 200 || o.cy > bot + 200) continue;
    if (o.type === 'cross') hub(ctx, o.hx, o.cy);
    if (o.type === 'cross2') { hub(ctx, CX - 90, o.cy); hub(ctx, CX + 90, o.cy); }
  }

  // stars + switch orbs
  for (const o of g.obs) {
    if (o.cy < top - 200 || o.cy > bot + 200) continue;
    if (!o.star.taken) {
      const pul = 1 + Math.sin(g.time * 5 + o.id) * 0.08;
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.18; star5(ctx, o.star.x, o.star.y, 22 * pul, g.time * 0.8); ctx.fill();
      ctx.globalAlpha = 1; star5(ctx, o.star.x, o.star.y, 14 * pul, g.time * 0.8); ctx.fill();
    }
    if (o.sw && o.id >= g.st.swId) {
      const a = g.time * 2.4, x = o.sw.x, y = o.sw.y, r = 13;
      ctx.globalAlpha = 0.2; ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, 7); ctx.fill();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = COLS[i]; ctx.beginPath(); ctx.moveTo(x, y);
        ctx.arc(x, y, r, a + i * Math.PI / 2, a + (i + 1) * Math.PI / 2); ctx.closePath(); ctx.fill();
      }
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, r + 1, 0, 7); ctx.stroke();
    }
  }

  // trail + ball
  const skin = opt.skin || 'classic';
  const bc = COLS[g.st.col];
  if (g.alive) {
    const tr = g.trail, n = tr.length, use = skin === 'comet' || skin === 'prism' ? n : Math.min(n, 9);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = n - use; i < n; i++) {
      const k = (i - (n - use) + 1) / use;
      const c = skin === 'prism' ? COLS[(i + (g.time * 12 | 0)) % 4] : COLS[tr[i].col];
      ctx.globalAlpha = k * (skin === 'comet' ? 0.45 : 0.3);
      ctx.fillStyle = c; ctx.beginPath(); ctx.arc(CX, tr[i].y, R_BALL * (0.3 + 0.7 * k), 0, 7); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    const y = g.st.y;
    const st = g.stretch * 0.28, sq = g.squash * 0.3;
    const sx = 1 - st * 0.6 + sq, sy = 1 + st - sq * 0.8;
    ctx.save(); ctx.translate(CX, y); ctx.scale(sx, sy);
    ctx.fillStyle = bc;
    ctx.globalAlpha = 0.18; ctx.beginPath(); ctx.arc(0, 0, R_BALL + 10, 0, 7); ctx.fill();
    ctx.globalAlpha = 0.35; ctx.beginPath(); ctx.arc(0, 0, R_BALL + 4, 0, 7); ctx.fill();
    ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(0, 0, R_BALL, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(-3.5, -3.5, 3.6, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    if (skin === 'halo') {
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = 0.8;
      ctx.beginPath(); ctx.ellipse(0, 0, R_BALL + 7, (R_BALL + 7) * 0.4, g.time * 2, 0, 7); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
    if (!g.st.started && !opt.demo) {
      const k = 0.5 + 0.5 * Math.sin(g.time * 5);
      ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.5 + 0.5 * k;
      ctx.font = '700 15px "Trebuchet MS", system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(opt.touch ? 'TAP TO JUMP' : 'TAP / SPACE TO JUMP', CX, y + 48);
      ctx.globalAlpha = 0.85; ctx.fillStyle = bc; ctx.font = '800 13px "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText('ONLY PASS YOUR OWN COLOUR', CX, y + 68);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.moveTo(CX - 8, y + 26 + k * 4); ctx.lineTo(CX, y + 18 + k * 4); ctx.lineTo(CX + 8, y + 26 + k * 4);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  // shock rings
  for (const q of g.rings) {
    const k = q.t / q.max, r = q.r0 + (q.r1 - q.r0) * (1 - (1 - k) * (1 - k));
    ctx.strokeStyle = COLS[q.col]; ctx.globalAlpha = 1 - k; ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 7); ctx.stroke();
  }
  // particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.parts) {
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.4); ctx.fillStyle = p.col;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + 0.6 * k), 0, 7); ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';
  // floaters
  ctx.textAlign = 'center'; ctx.font = '800 18px "Trebuchet MS", system-ui, sans-serif';
  for (const f of g.floats) { ctx.globalAlpha = 1 - f.t / 0.9; ctx.fillStyle = '#ffffff'; ctx.fillText(f.txt, f.x, f.y); }
  ctx.globalAlpha = 1;

  // screen space: vignette, flash, milestone
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (!V.vig || V.vig.w !== cw || V.vig.h !== ch) {
    const gr = ctx.createRadialGradient(cw / 2, ch / 2, Math.min(cw, ch) * 0.3, cw / 2, ch / 2, Math.max(cw, ch) * 0.75);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.65)');
    V.vig = { w: cw, h: ch, gr };
  }
  ctx.fillStyle = V.vig.gr; ctx.fillRect(0, 0, cw, ch);
  if (g.flash > 0) { ctx.globalAlpha = g.flash * 0.5; ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, cw, ch); ctx.globalAlpha = 1; }
  if (g.milestone > 0 && !opt.demo) {
    const k = 1 - g.milestone / 1.4, sc = 1 + (1 - Math.min(1, k * 4)) * 0.6;
    ctx.save(); ctx.translate(cw / 2, ch * 0.32); ctx.scale(sc, sc);
    ctx.globalAlpha = Math.min(1, g.milestone * 2);
    ctx.textAlign = 'center'; ctx.font = `900 ${Math.round(46 * Math.min(1.4, s))}px "Trebuchet MS", system-ui, sans-serif`;
    ctx.fillStyle = COLS[(g.score / 10) % 4 | 0]; ctx.fillText(g.score + '!', 0, 0);
    ctx.restore(); ctx.globalAlpha = 1;
  }
}

function hub(ctx, x, y) {
  ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.9;
  ctx.beginPath(); ctx.arc(x, y, 7, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
  ctx.fillStyle = '#06040c'; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill();
}

// small looping preview of a ball style for the title's style picker (112x112 canvas)
export function drawSkin(c, skin, t, locked) {
  const W = c.canvas.width, m = W / 2;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, W);
  c.globalAlpha = locked ? 0.35 : 1;
  const ci = (t * 0.8 | 0) % 4, col = COLS[ci], R = 22, y = m + Math.sin(t * 4) * 8;
  if (skin === 'comet' || skin === 'prism') {
    for (let i = 6; i > 0; i--) {
      c.globalAlpha = (locked ? 0.35 : 1) * (0.5 - i * 0.07); c.fillStyle = skin === 'prism' ? COLS[(i + (t * 10 | 0)) % 4] : col;
      c.beginPath(); c.arc(m, y + i * 7, R * (1 - i * 0.11), 0, 7); c.fill();
    }
    c.globalAlpha = locked ? 0.35 : 1;
  }
  c.fillStyle = col; c.globalAlpha *= 0.25; c.beginPath(); c.arc(m, y, R + 10, 0, 7); c.fill();
  c.globalAlpha = locked ? 0.35 : 1; c.beginPath(); c.arc(m, y, R, 0, 7); c.fill();
  c.fillStyle = '#fff'; c.globalAlpha *= 0.55; c.beginPath(); c.arc(m - 7, y - 7, 7, 0, 7); c.fill();
  c.globalAlpha = locked ? 0.35 : 1;
  if (skin === 'halo') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.ellipse(m, y, R + 13, (R + 13) * 0.4, t * 2, 0, 7); c.stroke(); }
  if (skin === 'spark') for (let i = 0; i < 6; i++) {
    const a = t * 3 + i, d = R + 8 + ((t * 40 + i * 9) % 18);
    c.fillStyle = ['#ffe53b', '#fff', '#ff2e93'][i % 3]; c.fillRect(m + Math.cos(a) * d - 2, y + Math.sin(a) * d - 2, 4, 4);
  }
  if (skin === 'pulse') { const k = (t * 1.6) % 1; c.strokeStyle = col; c.globalAlpha *= 1 - k; c.lineWidth = 4; c.beginPath(); c.arc(m, y, R + 4 + k * 22, 0, 7); c.stroke(); }
  c.globalAlpha = 1;
  if (locked) { c.fillStyle = '#fff'; c.font = '900 26px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('\u{1F512}', m, m); }
}
