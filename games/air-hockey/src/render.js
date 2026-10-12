// Canvas drawing: view transform (portrait upright, landscape on its side),
// the cached neon table, glow sprites, trail, particles and screen text.
import { W, H, GOAL, PR, MR } from './game.js'; // H is a live binding (table length adapts)

export const COL = { p1: '#2ef2ff', p2: '#ff3d9a', puck: '#fff36b', line: '#7b5cff' };
const RGB = { p1: '46,242,255', p2: '255,61,154', puck: '255,243,107' };
const B = 30; // rail thickness in table units

export const view = { cw: 1, ch: 1, dpr: 1, s: 1, ox: 0, oy: 0, land: false };

export function layout(cw, ch, dpr) {
  view.cw = cw; view.ch = ch; view.dpr = dpr;
  view.land = cw > ch * 1.05;
  const pad = Math.min(cw, ch) < 500 ? 4 : 14;
  if (view.land) {
    view.s = Math.min((cw - pad * 2) / (H + B * 2), (ch - pad * 2) / (W + B * 2));
    view.ox = (cw - H * view.s) / 2; view.oy = (ch - W * view.s) / 2;
  } else {
    view.s = Math.min((cw - pad * 2) / (W + B * 2), (ch - pad * 2) / (H + B * 2));
    view.ox = (cw - W * view.s) / 2; view.oy = (ch - H * view.s) / 2;
  }
}

export function toScreen(x, y) {
  return view.land ? [view.ox + (H - y) * view.s, view.oy + x * view.s] : [view.ox + x * view.s, view.oy + y * view.s];
}
export function toTable(sx, sy) {
  return view.land ? [(sy - view.oy) / view.s, H - (sx - view.ox) / view.s] : [(sx - view.ox) / view.s, (sy - view.oy) / view.s];
}
// canvas transform that maps table units to device pixels (plus a screen-space shake)
export function tableTransform(ctx, shx = 0, shy = 0) {
  const { s, dpr, ox, oy } = view;
  if (view.land) ctx.setTransform(0, s * dpr, -s * dpr, 0, (ox + H * s + shx) * dpr, (oy + shy) * dpr);
  else ctx.setTransform(s * dpr, 0, 0, s * dpr, (ox + shx) * dpr, (oy + shy) * dpr);
}

// ---------------------------------------------------------------- table cache
let tableCv = null;
export function buildTable() {
  tableCv = document.createElement('canvas');
  tableCv.width = Math.round(view.cw * view.dpr); tableCv.height = Math.round(view.ch * view.dpr);
  const c = tableCv.getContext('2d');
  tableTransform(c);
  // rail body
  rr(c, -B, -B, W + B * 2, H + B * 2, 46);
  const rg = c.createLinearGradient(0, -B, 0, H + B);
  rg.addColorStop(0, '#191433'); rg.addColorStop(0.5, '#0f0d22'); rg.addColorStop(1, '#191433');
  c.fillStyle = rg; c.fill();
  // surface
  rr(c, 0, 0, W, H, 22);
  const sg = c.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, H * 0.62);
  sg.addColorStop(0, '#121a3e'); sg.addColorStop(0.6, '#0a0f29'); sg.addColorStop(1, '#060818');
  c.fillStyle = sg; c.fill();
  c.save(); rr(c, 0, 0, W, H, 22); c.clip();
  // air holes
  c.fillStyle = 'rgba(160,180,255,0.07)';
  for (let y = 25; y < H; y += 28) for (let x = 20 + ((y / 28) % 2) * 14; x < W; x += 28) { c.beginPath(); c.arc(x, y, 1.6, 0, Math.PI * 2); c.fill(); }
  // half tints
  const t1 = c.createLinearGradient(0, H, 0, H / 2); t1.addColorStop(0, `rgba(${RGB.p1},0.10)`); t1.addColorStop(1, `rgba(${RGB.p1},0)`);
  c.fillStyle = t1; c.fillRect(0, H / 2, W, H / 2);
  const t2 = c.createLinearGradient(0, 0, 0, H / 2); t2.addColorStop(0, `rgba(${RGB.p2},0.10)`); t2.addColorStop(1, `rgba(${RGB.p2},0)`);
  c.fillStyle = t2; c.fillRect(0, 0, W, H / 2);
  c.restore();

  const glowLine = (path, color, w = 4) => {
    c.save(); c.strokeStyle = color; c.lineCap = 'round';
    c.shadowColor = color; c.shadowBlur = 18 * view.s * view.dpr;
    c.lineWidth = w; path(); c.stroke();
    c.shadowBlur = 0; c.lineWidth = w * 0.4; c.strokeStyle = 'rgba(255,255,255,0.75)'; path(); c.stroke();
    c.restore();
  };
  // centre line + circle
  glowLine(() => { c.beginPath(); c.moveTo(6, H / 2); c.lineTo(W - 6, H / 2); }, COL.line, 5);
  glowLine(() => { c.beginPath(); c.arc(W / 2, H / 2, 92, 0, Math.PI * 2); }, COL.line, 4);
  c.fillStyle = COL.line; c.beginPath(); c.arc(W / 2, H / 2, 9, 0, Math.PI * 2); c.fill();
  // goal creases
  glowLine(() => { c.beginPath(); c.arc(W / 2, 0, 128, 0, Math.PI); }, COL.p2, 4);
  glowLine(() => { c.beginPath(); c.arc(W / 2, H, 128, Math.PI, Math.PI * 2); }, COL.p1, 4);
  // faceoff dots
  for (const [x, y, col] of [[W * 0.25, H * 0.3, COL.p2], [W * 0.75, H * 0.3, COL.p2], [W * 0.25, H * 0.7, COL.p1], [W * 0.75, H * 0.7, COL.p1]]) {
    c.save(); c.globalAlpha = 0.5; glowLine(() => { c.beginPath(); c.arc(x, y, 14, 0, Math.PI * 2); }, col, 2.5); c.restore();
  }
  // outer rail neon, broken at the goals
  const g0 = W / 2 - GOAL / 2, g1 = W / 2 + GOAL / 2;
  glowLine(() => {
    c.beginPath();
    c.moveTo(g1, 0); c.lineTo(W - 22, 0); c.arcTo(W, 0, W, 22, 22); c.lineTo(W, H / 2);
    c.moveTo(g0, 0); c.lineTo(22, 0); c.arcTo(0, 0, 0, 22, 22); c.lineTo(0, H / 2);
  }, COL.p2, 6);
  glowLine(() => {
    c.beginPath();
    c.moveTo(g1, H); c.lineTo(W - 22, H); c.arcTo(W, H, W, H - 22, 22); c.lineTo(W, H / 2);
    c.moveTo(g0, H); c.lineTo(22, H); c.arcTo(0, H, 0, H - 22, 22); c.lineTo(0, H / 2);
  }, COL.p1, 6);
  // goal pockets
  for (const [y, col, dir] of [[0, COL.p2, -1], [H, COL.p1, 1]]) {
    c.fillStyle = '#020208'; c.fillRect(g0, y + (dir < 0 ? -B + 4 : 0), GOAL, B - 4);
    const gg = c.createLinearGradient(0, y, 0, y + dir * (B - 4));
    gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)');
    c.globalAlpha = 0.35; c.fillStyle = gg; c.fillRect(g0, y + (dir < 0 ? -B + 4 : 0), GOAL, B - 4); c.globalAlpha = 1;
    for (const x of [g0, g1]) { c.fillStyle = '#fff'; c.shadowColor = col; c.shadowBlur = 14 * view.s * view.dpr; c.beginPath(); c.arc(x, y, 6, 0, Math.PI * 2); c.fill(); c.shadowBlur = 0; }
  }
}

function rr(c, x, y, w, h, r) {
  c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}

// ---------------------------------------------------------------- sprites
const sprites = {};
const GLOW = 22;
function sprite(kind) {
  const key = kind + '|' + view.s.toFixed(3) + '|' + view.dpr;
  if (sprites[key]) return sprites[key];
  const r = kind === 'puck' ? PR : MR, k = view.s * view.dpr;
  const size = Math.ceil((r + GLOW) * 2 * k);
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const c = cv.getContext('2d');
  c.scale(k, k); c.translate(r + GLOW, r + GLOW);
  const col = kind === 'puck' ? COL.puck : COL[kind];
  const rgb = kind === 'puck' ? RGB.puck : RGB[kind];
  c.shadowColor = col; c.shadowBlur = 20 * k;
  if (kind === 'puck') {
    c.fillStyle = `rgba(${rgb},0.25)`; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.lineWidth = 6; c.strokeStyle = col; c.beginPath(); c.arc(0, 0, r - 3, 0, 7); c.stroke();
    c.shadowBlur = 0;
    c.fillStyle = '#1a1a08'; c.beginPath(); c.arc(0, 0, r - 7, 0, 7); c.fill();
    c.lineWidth = 2.5; c.strokeStyle = `rgba(${rgb},0.9)`; c.beginPath(); c.arc(0, 0, r - 13, 0, 7); c.stroke();
    c.fillStyle = '#fffbe0'; c.beginPath(); c.arc(0, 0, 4.5, 0, 7); c.fill();
  } else {
    c.fillStyle = `rgba(${rgb},0.18)`; c.beginPath(); c.arc(0, 0, r, 0, 7); c.fill();
    c.lineWidth = 8; c.strokeStyle = col; c.beginPath(); c.arc(0, 0, r - 4, 0, 7); c.stroke();
    c.shadowBlur = 0;
    const ig = c.createRadialGradient(-6, -6, 2, 0, 0, r - 8);
    ig.addColorStop(0, `rgba(${rgb},0.35)`); ig.addColorStop(1, 'rgba(6,6,20,0.95)');
    c.fillStyle = ig; c.beginPath(); c.arc(0, 0, r - 8, 0, 7); c.fill();
    c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(0, 0, r - 4, 0, 7); c.stroke();
    // handle knob
    c.shadowColor = col; c.shadowBlur = 12 * k;
    c.fillStyle = col; c.beginPath(); c.arc(0, 0, 17, 0, 7); c.fill();
    c.shadowBlur = 0;
    const kg = c.createRadialGradient(-5, -5, 1, 0, 0, 15);
    kg.addColorStop(0, '#ffffff'); kg.addColorStop(0.5, col); kg.addColorStop(1, col);
    c.fillStyle = kg; c.beginPath(); c.arc(0, 0, 14, 0, 7); c.fill();
  }
  sprites[key] = cv;
  return cv;
}

// ---------------------------------------------------------------- frame
export function drawFrame(ctx, g, fx, opts) {
  const { cw, ch, dpr } = view;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, cw * dpr, ch * dpr);
  // background glow behind the table
  const bg = ctx.createRadialGradient(cw * dpr / 2, ch * dpr / 2, 10, cw * dpr / 2, ch * dpr / 2, Math.max(cw, ch) * dpr * 0.7);
  bg.addColorStop(0, '#120f2c'); bg.addColorStop(1, '#05060f');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, cw * dpr, ch * dpr);
  const shx = (Math.random() - 0.5) * fx.shake * 2, shy = (Math.random() - 0.5) * fx.shake * 2;
  if (tableCv) ctx.drawImage(tableCv, shx * dpr, shy * dpr);
  tableTransform(ctx, shx, shy);

  // effects stay inside the table + rail
  ctx.save(); rr(ctx, -B, -B, W + B * 2, H + B * 2, 46); ctx.clip();
  // goal flash
  for (const f of fx.flashes) {
    const a = Math.max(0, f.life / f.max);
    const y = f.side === 0 ? 0 : H, dir = f.side === 0 ? 1 : -1;
    const gr = ctx.createLinearGradient(0, y, 0, y + dir * 380);
    gr.addColorStop(0, `rgba(${f.rgb},${0.65 * a})`); gr.addColorStop(1, `rgba(${f.rgb},0)`);
    ctx.fillStyle = gr; ctx.fillRect(0, f.side === 0 ? 0 : H - 380, W, 380);
  }

  ctx.globalCompositeOperation = 'lighter';
  // puck trail: one tapered ribbon, hotter and wider with speed
  const tr = fx.trail;
  if (tr.length > 2) {
    const head = tr[tr.length - 1], sp = Math.min(1, head.sp / 2200);
    if (sp > 0.1) {
      const L = [], R = [];
      for (let i = 0; i < tr.length; i++) {
        const a = tr[Math.max(0, i - 1)], b = tr[Math.min(tr.length - 1, i + 1)];
        let nx = -(b.y - a.y), ny = b.x - a.x; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
        const k = i / (tr.length - 1), w = PR * 0.8 * k * k * (0.6 + sp * 0.4);
        L.push([tr[i].x + nx * w, tr[i].y + ny * w]); R.push([tr[i].x - nx * w, tr[i].y - ny * w]);
      }
      const tail = tr[0];
      const gr = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      const core = ctx.createLinearGradient(tail.x, tail.y, head.x, head.y);
      core.addColorStop(0, 'rgba(255,255,255,0)'); core.addColorStop(1, `rgba(255,255,255,${0.8 * sp})`);
      gr.addColorStop(0, `rgba(${RGB.puck},0)`);
      gr.addColorStop(1, `rgba(${RGB.puck},${0.22 + 0.33 * sp})`);
      ctx.fillStyle = gr; ctx.beginPath(); ctx.moveTo(L[0][0], L[0][1]);
      for (const q of L) ctx.lineTo(q[0], q[1]);
      for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = core; ctx.lineWidth = 3 + sp * 3; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(tail.x, tail.y);
      for (const q of tr) ctx.lineTo(q.x, q.y); ctx.stroke();
    }
  }
  // rail flashes
  for (const r of fx.rails) {
    const a = Math.max(0, r.life / r.max) * r.k, L = 70 + 90 * r.k;
    const vert = r.x <= 1 || r.x >= W - 1;
    ctx.lineCap = 'round';
    for (const [w, al] of [[16, 0.25], [6, 0.9]]) {
      ctx.strokeStyle = `rgba(${RGB.puck},${a * al})`; ctx.lineWidth = w; ctx.beginPath();
      if (vert) { ctx.moveTo(r.x, r.y - L / 2); ctx.lineTo(r.x, r.y + L / 2); } else { ctx.moveTo(r.x - L / 2, r.y); ctx.lineTo(r.x + L / 2, r.y); }
      ctx.stroke();
    }
  }
  // mallet motion smear
  for (let s = 0; s < 2; s++) {
    const m = g.m[s], sp = Math.hypot(m.vx, m.vy);
    if (sp > 700) {
      const k = Math.min(1, (sp - 700) / 2500);
      ctx.strokeStyle = `rgba(${s === 0 ? RGB.p1 : RGB.p2},${0.1 * k})`; ctx.lineWidth = MR * 1.3; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(m.x - m.vx * 0.025, m.y - m.vy * 0.025); ctx.stroke();
    }
  }
  // rings (kept on the playing surface so a goal shockwave never spills over the rail)
  if (fx.rings.length) {
    ctx.save(); rr(ctx, 0, 0, W, H, 22); ctx.clip();
    for (const r of fx.rings) {
      const a = Math.max(0, r.life / r.max);
      ctx.strokeStyle = `rgba(${r.rgb},${a * 0.9})`; ctx.lineWidth = 3 + 8 * a;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.restore();
  }
  // particles
  for (const p of fx.parts) {
    const a = Math.max(0, p.life / p.max);
    ctx.strokeStyle = `rgba(${p.rgb},${a})`; ctx.lineWidth = p.size * (0.4 + a * 0.6); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02); ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();

  const pk = g.puck;
  // coach hint on the player's mallet until they move it
  if (opts.coach > 0) {
    const m = g.m[0], t = performance.now() / 1000, a = opts.coach;
    for (let i = 0; i < 2; i++) {
      const ph = (t * 1.1 + i * 0.5) % 1;
      ctx.strokeStyle = `rgba(${RGB.p1},${a * (1 - ph) * 0.9})`; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(m.x, m.y, MR + 8 + ph * 60, 0, Math.PI * 2); ctx.stroke();
    }
    const dx = pk.x - m.x, dy = pk.y - m.y, d = Math.hypot(dx, dy);
    if (d > MR + PR + 40) {
      const ux = dx / d, uy = dy / d, bob = Math.sin(t * 6) * 6;
      const x0 = m.x + ux * (MR + 18 + bob), y0 = m.y + uy * (MR + 18 + bob);
      const x1 = m.x + ux * Math.min(d - PR - 14, MR + 70 + bob), y1 = m.y + uy * Math.min(d - PR - 14, MR + 70 + bob);
      ctx.strokeStyle = `rgba(255,255,255,${a * 0.85})`; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1);
      ctx.moveTo(x1 - ux * 16 - uy * 12, y1 - uy * 16 + ux * 12); ctx.lineTo(x1, y1); ctx.lineTo(x1 - ux * 16 + uy * 12, y1 - uy * 16 - ux * 12);
      ctx.stroke();
    }
  }
  // puck + mallets
  if (!(g.phase !== 'play' && pk.inGoal)) {
    const sp = sprite('puck'), d = (PR + GLOW) * 2;
    ctx.drawImage(sp, pk.x - d / 2, pk.y - d / 2, d, d);
  }
  for (let s = 0; s < 2; s++) {
    const m = g.m[s], sp = sprite(s === 0 ? 'p1' : 'p2'), d = (MR + GLOW) * 2;
    const pulse = fx.pulse[s] > 0 ? 1 + fx.pulse[s] * 0.12 : 1;
    ctx.drawImage(sp, m.x - d / 2 * pulse, m.y - d / 2 * pulse, d * pulse, d * pulse);
  }

  // ---- screen space: scores + texts
  ctx.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr);
  const sz = Math.max(28, 78 * view.s);
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (let s = 0; s < 2; s++) {
    const [x, y] = toScreen(W - 62, s === 0 ? H / 2 + 74 : H / 2 - 74);
    const punch = 1 + Math.max(0, fx.scorePunch[s]) * 0.9;
    ctx.save(); ctx.translate(x, y);
    if (opts.flipTop && s === 1 && !view.land) ctx.rotate(Math.PI);
    ctx.scale(punch, punch);
    ctx.font = `700 ${sz * 1.25}px Rajdhani, "Arial Black", sans-serif`;
    ctx.globalAlpha = 0.28 + Math.max(0, fx.scorePunch[s]) * 0.7;
    ctx.fillStyle = s === 0 ? COL.p1 : COL.p2;
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
    ctx.fillText(String(g.score[s]), 0, 0);
    ctx.restore();
  }
  for (const t of fx.texts) {
    const a = Math.min(1, t.life / 0.25), age = t.max - t.life;
    const sc = age < 0.18 ? 0.4 + (age / 0.18) * 0.8 : 1.2 - Math.min(0.2, (age - 0.18) * 0.6);
    ctx.save(); ctx.translate(t.x, t.y);
    if (t.rot) ctx.rotate(t.rot);
    ctx.globalAlpha = a;
    ctx.font = t.small ? `700 ${t.size}px Rajdhani, sans-serif` : `900 ${t.size}px Orbitron, sans-serif`;
    const tw = ctx.measureText(t.text).width, fit = t.maxW && tw * 1.2 > t.maxW ? t.maxW / (tw * 1.2) : 1;
    ctx.scale(sc * fit, sc * fit);
    ctx.fillStyle = '#fff'; ctx.shadowColor = t.color; ctx.shadowBlur = 30;
    ctx.fillText(t.text, 0, 0);
    ctx.shadowBlur = 0; ctx.lineWidth = Math.max(2, t.size * 0.04); ctx.strokeStyle = t.color; ctx.strokeText(t.text, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(t.text, 0, 0);
    ctx.restore();
  }
  if (opts.coach > 0) {
    const m = g.m[0], [x, y] = toScreen(m.x, view.land ? m.y : Math.min(H - 22, m.y + MR + 34));
    const lx = view.land ? x : x, ly = view.land ? y - (MR + 40) * view.s : y;
    ctx.globalAlpha = opts.coach; ctx.font = `700 ${Math.max(15, Math.min(22, 26 * view.s))}px Rajdhani, sans-serif`;
    ctx.fillStyle = '#fff'; ctx.shadowColor = COL.p1; ctx.shadowBlur = 12;
    ctx.fillText(opts.touch ? 'DRAG YOUR MALLET' : 'MOVE THE MOUSE', lx, ly); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
  }
  if (opts.dim) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = `rgba(3,3,12,${opts.dim})`; ctx.fillRect(0, 0, cw * dpr, ch * dpr); }
}
