// Canvas renderer. The static course (grass, green, rails, sand, water beds, decorations) is
// drawn once per hole/resize into an offscreen layer; moving things are drawn every frame.
import { R, RAIL, CUP_R, moverAt, polyIn } from './physics.js';

const TAU = Math.PI * 2;
export const BALL_COLORS = ['#ffffff', '#ff6fae', '#ffb43c', '#46d3ff'];
const PORTAL_COLORS = ['#a35cff', '#ff8a1f', '#22d3a8'];

export function makeView(cw, ch, b, pad) {
  const bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const aw = cw - pad.l - pad.r, ah = ch - pad.t - pad.b;
  const sN = Math.min(aw / bw, ah / bh), sR = Math.min(aw / bh, ah / bw);
  const rot = sR > sN * 1.12;
  const s = rot ? sR : sN;
  const cx = pad.l + aw / 2, cy = pad.t + ah / 2, wcx = (b.x0 + b.x1) / 2, wcy = (b.y0 + b.y1) / 2;
  const v = { s, rot, cw, ch };
  if (!rot) Object.assign(v, { a: s, b: 0, c: 0, d: s, e: cx - s * wcx, f: cy - s * wcy, sdx: 0, sdy: 1 });
  else Object.assign(v, { a: 0, b: -s, c: s, d: 0, e: cx - s * wcy, f: cy + s * wcx, sdx: -1, sdy: 0 });
  v.toWorld = (sx, sy) => (rot ? [(v.f - sy) / s, (sx - v.e) / s] : [(sx - v.e) / s, (sy - v.f) / s]);
  v.toScreen = (x, y) => [v.a * x + v.c * y + v.e, v.b * x + v.d * y + v.f];
  return v;
}

function rng(seed) { let a = seed >>> 0 || 1; return () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }; }
function path(ctx, p) { ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]); ctx.closePath(); }
function shapePath(ctx, s) { if (s.c) { ctx.beginPath(); ctx.arc(s.c[0], s.c[1], s.c[2], 0, TAU); } else path(ctx, s); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }
function segDist(x, y, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
  let t = l2 ? ((x - a[0]) * dx + (y - a[1]) * dy) / l2 : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - a[0] - dx * t, y - a[1] - dy * t);
}

export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.ctx = canvas.getContext('2d');
    this.bg = document.createElement('canvas'); this.bgx = this.bg.getContext('2d');
    this.dpr = 1;
  }
  setWorld(w, view) {
    this.w = w; this.view = view;
    this.bg.width = this.cv.width; this.bg.height = this.cv.height;
    this.drawStatic();
  }
  setT(ctx) { const v = this.view; ctx.setTransform(v.a, v.b, v.c, v.d, v.e, v.f); }

  drawStatic() {
    const w = this.w, v = this.view, g = this.bgx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    // grass backdrop with soft diagonal mow bands (screen space)
    g.fillStyle = '#58b84f'; g.fillRect(0, 0, v.cw, v.ch);
    g.fillStyle = 'rgba(255,255,255,0.045)';
    const band = 70 * this.dpr;
    for (let x = -v.ch; x < v.cw + v.ch; x += band * 2) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + band, 0); g.lineTo(x + band - v.ch * 0.5, v.ch); g.lineTo(x - v.ch * 0.5, v.ch); g.fill(); }
    const vg = g.createRadialGradient(v.cw / 2, v.ch / 2, Math.min(v.cw, v.ch) * 0.3, v.cw / 2, v.ch / 2, Math.max(v.cw, v.ch) * 0.75);
    vg.addColorStop(0, 'rgba(0,40,0,0)'); vg.addColorStop(1, 'rgba(0,40,0,0.28)');
    g.fillStyle = vg; g.fillRect(0, 0, v.cw, v.ch);

    this.setT(g);
    const sd = (k) => [v.sdx * k, v.sdy * k];
    this.decor(g);

    // green: drop shadow, base, mow stripes
    g.save();
    const [ox, oy] = sd(10);
    g.translate(ox, oy); path(g, w.green); g.fillStyle = 'rgba(20,60,20,0.35)';
    g.filter = 'blur(' + Math.max(1, 6 * v.s) + 'px)'; g.fill(); g.filter = 'none';
    g.restore();
    path(g, w.green); g.fillStyle = '#7fd65b'; g.fill();
    g.save(); path(g, w.green); g.clip();
    g.fillStyle = '#8ade65';
    const { x0, y0, x1, y1 } = w.bounds;
    for (let x = x0 - 600; x < x1 + 600; x += 90) { g.beginPath(); g.moveTo(x, y0 - 10); g.lineTo(x + 45, y0 - 10); g.lineTo(x + 45 - 160, y1 + 10); g.lineTo(x - 160, y1 + 10); g.fill(); }
    // inner shade along the rails
    g.lineWidth = 2 * RAIL + 14; g.strokeStyle = 'rgba(30,90,20,0.16)'; path(g, w.green); g.stroke();
    g.restore();

    // ramps
    for (const r of w.ramps) {
      const [x, y, ww, hh] = r.r;
      const cx = x + ww / 2, cy = y + hh / 2, L = Math.abs(r.d[0]) * ww / 2 + Math.abs(r.d[1]) * hh / 2;
      const gr = g.createLinearGradient(cx - r.d[0] * L, cy - r.d[1] * L, cx + r.d[0] * L, cy + r.d[1] * L);
      gr.addColorStop(0, '#b6f08a'); gr.addColorStop(1, '#5fb845');
      g.fillStyle = gr; g.fillRect(x, y, ww, hh);
      g.fillStyle = 'rgba(255,255,255,0.25)';
      // contour lines
      g.strokeStyle = 'rgba(40,100,30,0.18)'; g.lineWidth = 2;
      for (let k = 1; k < 6; k++) {
        const f = k / 6;
        g.beginPath();
        if (r.d[0]) { const xx = x + ww * f; g.moveTo(xx, y); g.lineTo(xx, y + hh); } else { const yy = y + hh * f; g.moveTo(x, yy); g.lineTo(x + ww, yy); }
        g.stroke();
      }
    }
    // bowls
    for (const b of w.bowls) {
      const gr = g.createRadialGradient(b.c[0], b.c[1], 10, b.c[0], b.c[1], b.r);
      gr.addColorStop(0, '#4fa83a'); gr.addColorStop(0.7, '#72cc52'); gr.addColorStop(1, 'rgba(127,214,91,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(b.c[0], b.c[1], b.r, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(30,90,20,0.15)'; g.lineWidth = 2;
      for (const k of [0.35, 0.6, 0.85]) { g.beginPath(); g.arc(b.c[0], b.c[1], b.r * k, 0, TAU); g.stroke(); }
    }
    // sand: outline pass then fill pass so overlapping blobs merge
    if (w.sand.length) {
      g.lineJoin = 'round';
      for (const s of w.sand) { shapePath(g, s); g.lineWidth = 8; g.strokeStyle = '#d9b562'; g.stroke(); }
      for (const s of w.sand) { shapePath(g, s); g.fillStyle = '#f6dc95'; g.fill(); }
      g.save(); g.beginPath(); for (const s of w.sand) { if (s.c) { g.moveTo(s.c[0] + s.c[2], s.c[1]); g.arc(s.c[0], s.c[1], s.c[2], 0, TAU); } else { g.moveTo(s[0][0], s[0][1]); for (const p of s) g.lineTo(p[0], p[1]); g.closePath(); } } g.clip();
      const rn = rng(w.index * 7 + 3); g.fillStyle = 'rgba(190,150,70,0.35)';
      for (let i = 0; i < 260; i++) { const x = x0 + rn() * (x1 - x0), y = y0 + rn() * (y1 - y0); g.beginPath(); g.arc(x, y, 1.2 + rn() * 1.4, 0, TAU); g.fill(); }
      g.restore();
    }
    // water beds
    if (w.water.length) {
      for (const s of w.water) { shapePath(g, s); g.lineWidth = 12; g.strokeStyle = '#d8c48a'; g.lineJoin = 'round'; g.stroke(); }
      for (const s of w.water) { shapePath(g, s); g.lineWidth = 6; g.strokeStyle = '#9fe1ff'; g.stroke(); }
      for (const s of w.water) { shapePath(g, s); g.fillStyle = '#2f9ee8'; g.fill(); }
      g.save(); g.beginPath(); for (const s of w.water) { if (s.c) { g.moveTo(s.c[0] + s.c[2], s.c[1]); g.arc(s.c[0], s.c[1], s.c[2], 0, TAU); } else { g.moveTo(s[0][0], s[0][1]); for (const p of s) g.lineTo(p[0], p[1]); g.closePath(); } } g.clip();
      g.restore();
    }
    // belts (bed)
    for (const be of w.belts) {
      const [x, y, ww, hh] = be.r;
      rrect(g, x - 3, y - 3, ww + 6, hh + 6, 8); g.fillStyle = '#ffd23f'; g.fill();
      rrect(g, x, y, ww, hh, 6); g.fillStyle = '#4a5160'; g.fill();
    }
    // tee mat
    const [tx, ty] = w.tee;
    g.save(); g.translate(tx, ty);
    rrect(g, -26, -26, 52, 52, 10); g.fillStyle = 'rgba(40,110,30,0.35)'; g.fill();
    rrect(g, -22, -22, 44, 44, 8); g.fillStyle = '#69c84a'; g.fill();
    g.restore();
    // cup
    const [cx, cy] = w.cup;
    g.beginPath(); g.arc(cx, cy, CUP_R + 7, 0, TAU); g.fillStyle = 'rgba(255,255,255,0.18)'; g.fill();
    g.beginPath(); g.arc(cx, cy, CUP_R + 1.5, 0, TAU); g.fillStyle = '#f4f7f2'; g.fill();
    g.beginPath(); g.arc(cx, cy, CUP_R - 0.5, 0, TAU); g.fillStyle = '#1b2a1c'; g.fill();
    g.beginPath(); g.arc(cx + v.sdx * 3, cy + v.sdy * 3, CUP_R - 3, 0, TAU); g.fillStyle = '#0d150e'; g.fill();

    // rails: green outline + blocks
    this.rails(g, w.green, false);
    for (const b of w.blocks) this.rails(g, b, true);
    // bumpers (base)
    for (const b of w.bumpers) {
      g.beginPath(); g.arc(b.x + v.sdx * 5, b.y + v.sdy * 5, b.r + 2, 0, TAU); g.fillStyle = 'rgba(0,40,0,0.25)'; g.fill();
    }
  }

  rails(g, p, block) {
    const v = this.view;
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.save(); g.translate(v.sdx * 6, v.sdy * 6); path(g, p);
    g.strokeStyle = 'rgba(20,60,20,0.3)'; g.lineWidth = RAIL * 2 + 2; g.stroke();
    if (block) { g.fillStyle = 'rgba(20,60,20,0.3)'; g.fill(); }
    g.restore();
    if (block) {
      path(g, p); g.fillStyle = '#e57b52'; g.fill();
      g.save(); path(g, p); g.clip();
      g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 3;
      const xs = p.map((q) => q[0]), ys = p.map((q) => q[1]);
      const bx0 = Math.min(...xs), bx1 = Math.max(...xs), by0 = Math.min(...ys), by1 = Math.max(...ys);
      for (let y = by0; y < by1; y += 16) { g.beginPath(); g.moveTo(bx0, y); g.lineTo(bx1, y); g.stroke(); }
      g.restore();
    }
    path(g, p); g.strokeStyle = '#cfd8e3'; g.lineWidth = RAIL * 2; g.stroke();
    g.save(); g.translate(-v.sdx * 1.6, -v.sdy * 1.6); path(g, p); g.strokeStyle = '#ffffff'; g.lineWidth = RAIL * 2 - 4; g.stroke(); g.restore();
  }

  decor(g) {
    const w = this.w, v = this.view;
    const c0 = v.toWorld(0, 0), c1 = v.toWorld(v.cw, v.ch);
    const X0 = Math.min(c0[0], c1[0]) - 40, X1 = Math.max(c0[0], c1[0]) + 40, Y0 = Math.min(c0[1], c1[1]) - 40, Y1 = Math.max(c0[1], c1[1]) + 40;
    const rn = rng(w.index * 101 + 17);
    const items = [];
    const far = (x, y, m) => {
      if (polyIn(w.green, x, y)) return false;
      for (let i = 0; i < w.green.length; i++) if (segDist(x, y, w.green[i], w.green[(i + 1) % w.green.length]) < m) return false;
      for (const it of items) if (Math.hypot(it.x - x, it.y - y) < (it.r + m) * 0.8) return false;
      return true;
    };
    const area = (X1 - X0) * (Y1 - Y0);
    const nTree = Math.min(40, area / 26000);
    for (let i = 0; i < nTree * 4 && items.length < nTree; i++) {
      const x = X0 + rn() * (X1 - X0), y = Y0 + rn() * (Y1 - Y0), r = 26 + rn() * 26;
      if (far(x, y, r + 16)) items.push({ x, y, r, k: rn() < 0.6 ? 'tree' : 'bush', h: rn() });
    }
    const flowers = [];
    for (let i = 0; i < area / 2500; i++) {
      const x = X0 + rn() * (X1 - X0), y = Y0 + rn() * (Y1 - Y0);
      if (far(x, y, 18)) flowers.push({ x, y, c: ['#fff', '#ffe066', '#ff8fb1', '#b9a3ff'][(rn() * 4) | 0], s: 2 + rn() * 2 });
    }
    for (const f of flowers) {
      g.fillStyle = 'rgba(30,90,30,0.25)'; g.beginPath(); g.arc(f.x + v.sdx * 1.5, f.y + v.sdy * 1.5, f.s * 1.6, 0, TAU); g.fill();
      g.fillStyle = f.c; for (let k = 0; k < 5; k++) { const a = (k / 5) * TAU; g.beginPath(); g.arc(f.x + Math.cos(a) * f.s, f.y + Math.sin(a) * f.s, f.s * 0.8, 0, TAU); g.fill(); }
      g.fillStyle = '#ffb800'; g.beginPath(); g.arc(f.x, f.y, f.s * 0.6, 0, TAU); g.fill();
    }
    items.sort((a, b) => (a.y * v.sdy + a.x * v.sdx) - (b.y * v.sdy + b.x * v.sdx));
    for (const it of items) {
      const { x, y, r } = it;
      g.fillStyle = 'rgba(20,70,20,0.32)'; g.beginPath(); g.ellipse(x + v.sdx * r * 0.45, y + v.sdy * r * 0.45, r * 1.05, r * 1.05, 0, 0, TAU); g.fill();
      if (it.k === 'tree') {
        const cols = it.h < 0.5 ? ['#2f8f3a', '#3faa48', '#62c95e'] : ['#2b8b5c', '#38a86c', '#5cc98a'];
        g.fillStyle = cols[0]; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.fillStyle = cols[1]; g.beginPath(); g.arc(x - v.sdx * r * 0.12, y - v.sdy * r * 0.12, r * 0.82, 0, TAU); g.fill();
        g.fillStyle = cols[2]; g.beginPath(); g.arc(x - v.sdx * r * 0.3 - v.sdy * r * 0.2, y - v.sdy * r * 0.3 + v.sdx * r * 0.2, r * 0.42, 0, TAU); g.fill();
      } else {
        const cols = ['#3c9e3f', '#52b852', '#7ad86a'];
        for (let k = 0; k < 3; k++) {
          const a = it.h * 6 + k * 2.1, ox = Math.cos(a) * r * 0.35, oy = Math.sin(a) * r * 0.35;
          g.fillStyle = cols[0]; g.beginPath(); g.arc(x + ox, y + oy, r * 0.55, 0, TAU); g.fill();
        }
        for (let k = 0; k < 3; k++) {
          const a = it.h * 6 + k * 2.1, ox = Math.cos(a) * r * 0.3, oy = Math.sin(a) * r * 0.3;
          g.fillStyle = cols[1]; g.beginPath(); g.arc(x + ox - v.sdx * 3, y + oy - v.sdy * 3, r * 0.42, 0, TAU); g.fill();
        }
        if (it.h > 0.5) { g.fillStyle = '#ff6f91'; for (let k = 0; k < 4; k++) { const a = k * 1.7 + it.h * 9; g.beginPath(); g.arc(x + Math.cos(a) * r * 0.4, y + Math.sin(a) * r * 0.4, 3, 0, TAU); g.fill(); } }
      }
    }
  }

  // ---------------------------------------------------------------- frame
  draw(S) {
    const ctx = this.ctx, w = this.w, v = this.view, t = S.t, rt = S.rt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const shx = S.shake > 0 ? (Math.random() - 0.5) * S.shake * this.dpr : 0, shy = S.shake > 0 ? (Math.random() - 0.5) * S.shake * this.dpr : 0;
    ctx.drawImage(this.bg, shx, shy);
    ctx.setTransform(v.a, v.b, v.c, v.d, v.e + shx, v.f + shy);
    const sdx = v.sdx, sdy = v.sdy;

    // water shimmer
    if (w.water.length) {
      ctx.save(); ctx.beginPath();
      for (const s of w.water) { if (s.c) { ctx.moveTo(s.c[0] + s.c[2], s.c[1]); ctx.arc(s.c[0], s.c[1], s.c[2], 0, TAU); } else { ctx.moveTo(s[0][0], s[0][1]); for (const p of s) ctx.lineTo(p[0], p[1]); ctx.closePath(); } }
      ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 2.5; ctx.lineCap = 'round';
      const { x0, y0, x1, y1 } = w.bounds;
      for (let y = y0; y < y1; y += 34) for (let x = x0 + ((y / 34) % 2) * 40; x < x1; x += 80) {
        const ph = Math.sin(rt * 1.6 + x * 0.05 + y * 0.09);
        ctx.globalAlpha = 0.25 + 0.35 * Math.max(0, ph);
        const hx = v.rot ? 0 : 1, hy = v.rot ? 1 : 0, ux = -sdx * 4, uy = -sdy * 4, o = ph * 4;
        ctx.beginPath(); ctx.moveTo(x + hx * (o - 9), y + hy * (o - 9)); ctx.quadraticCurveTo(x + hx * o + ux, y + hy * o + uy, x + hx * (o + 9), y + hy * (o + 9)); ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.restore();
    }
    // belts: moving chevrons
    for (const be of w.belts) {
      const [x, y, ww, hh] = be.r;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip();
      const along = be.d[0] ? ww : hh, across = be.d[0] ? hh : ww;
      const off = (rt * be.s) % 40;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let a = -40; a < along + 40; a += 40) {
        const pa = a + off;
        ctx.beginPath();
        for (const k of [-1, 0, 1]) {
          const ac = across / 2 + k * across * 0.3, pp = pa - Math.abs(k) * 14;
          let px, py;
          if (be.d[0]) { px = be.d[0] > 0 ? x + pp : x + ww - pp; py = y + ac; } else { py = be.d[1] > 0 ? y + pp : y + hh - pp; px = x + ac; }
          k === -1 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
      }
      ctx.restore();
    }
    // ramps: downhill arrows
    for (const r of w.ramps) {
      const [x, y, ww, hh] = r.r;
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, ww, hh); ctx.clip();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      const along = r.d[0] ? ww : hh, across = r.d[0] ? hh : ww;
      const off = (rt * 30) % 60;
      for (let a = 0; a < along + 60; a += 60) for (let c = 40; c < across; c += 80) {
        const pa = a + off - 30;
        let px, py; if (r.d[0]) { px = r.d[0] > 0 ? x + pa : x + ww - pa; py = y + c; } else { py = r.d[1] > 0 ? y + pa : y + hh - pa; px = x + c; }
        ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(r.d[1], r.d[0]));
        ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -10); ctx.lineTo(-2, 0); ctx.lineTo(-6, 10); ctx.closePath(); ctx.fill(); ctx.restore();
      }
      ctx.restore();
    }
    // bowl swirl
    for (const b of w.bowls) {
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 3;
      for (let k = 0; k < 3; k++) { const a = rt * 0.8 + (k * TAU) / 3; ctx.beginPath(); ctx.arc(b.c[0], b.c[1], b.r * 0.72, a, a + 0.7); ctx.stroke(); }
    }
    // portals
    w.portals.forEach((p, i) => {
      for (const P of [p.a, p.b]) this.portal(ctx, P[0], P[1], PORTAL_COLORS[i % 3], rt, S.portalFlash?.[i] || 0);
    });
    // bumpers
    w.bumpers.forEach((b, i) => {
      const f = S.bumpFlash?.[i] || 0, rr = b.r * (1 + f * 0.18);
      ctx.beginPath(); ctx.arc(b.x, b.y, rr, 0, TAU); ctx.fillStyle = f > 0.01 ? '#ffd0e6' : '#ff4f98'; ctx.fill();
      ctx.beginPath(); ctx.arc(b.x, b.y, rr * 0.72, 0, TAU); ctx.fillStyle = '#ff82b8'; ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.x, b.y, rr - 1.5, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.arc(b.x - sdx * rr * 0.3 - sdy * rr * 0.25, b.y - sdy * rr * 0.3 + sdx * rr * 0.25, rr * 0.22, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
      if (f > 0.01) { ctx.globalAlpha = f; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(b.x, b.y, rr + (1 - f) * 22, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    });
    // movers
    for (const m of w.movers) {
      const p = moverAt(m, t), x = p.x - m.w / 2, y = p.y - m.h / 2;
      rrect(ctx, x + sdx * 7, y + sdy * 7, m.w, m.h, 6); ctx.fillStyle = 'rgba(20,60,20,0.3)'; ctx.fill();
      rrect(ctx, x, y, m.w, m.h, 6); ctx.fillStyle = '#ffc93c'; ctx.fill();
      ctx.save(); rrect(ctx, x, y, m.w, m.h, 6); ctx.clip();
      ctx.strokeStyle = '#3a3a48'; ctx.lineWidth = 7;
      for (let k = -m.h; k < m.w + m.h; k += 18) { ctx.beginPath(); ctx.moveTo(x + k, y); ctx.lineTo(x + k - m.h, y + m.h); ctx.stroke(); }
      ctx.restore();
      rrect(ctx, x, y, m.w, m.h, 6); ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    }

    // cup flag (screen space, pole points up the screen)
    this.flag(ctx, S);

    // balls
    for (const B of S.balls) this.ball(ctx, B, S);

    // windmills above balls
    for (const m of w.mills) this.mill(ctx, m, t);

    // aim
    if (S.aim) this.aim(ctx, S.aim, S.player.ball);
    if (S.hint) this.hint(ctx, S.hint, S.rt);

    // particles
    for (const p of S.parts) {
      const a = Math.max(0, p.life / p.max);
      ctx.globalAlpha = p.fade === false ? 1 : Math.min(1, a * 1.5);
      ctx.fillStyle = p.c;
      if (p.k === 'ring') { ctx.strokeStyle = p.c; ctx.lineWidth = 3 * a + 0.5; ctx.beginPath(); ctx.arc(p.x, p.y, p.r0 + (1 - a) * p.r1, 0, TAU); ctx.stroke(); }
      else if (p.k === 'conf') { ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s, -p.s * 0.5, p.s * 2, p.s); ctx.restore(); }
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s * (0.4 + 0.6 * a), 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;

    // screen-space text: name tags + floating texts
    ctx.setTransform(1, 0, 0, 1, shx, shy);
    const D = this.dpr;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const B of S.balls) {
      if (!B.tag || B.ball.sunk || B.hidden) continue;
      const [sx, sy] = v.toScreen(B.ball.x, B.ball.y);
      ctx.font = `700 ${11 * D}px Fredoka, 'Trebuchet MS', sans-serif`;
      const tw = ctx.measureText(B.tag).width + 10 * D;
      ctx.globalAlpha = 0.85;
      rrect(ctx, sx - tw / 2, sy - 30 * D, tw, 16 * D, 8 * D); ctx.fillStyle = B.color; ctx.fill();
      ctx.fillStyle = '#1b2440'; ctx.fillText(B.tag, sx, sy - 22 * D + 0.5);
      ctx.globalAlpha = 1;
    }
    for (const f of S.floats) {
      const a = Math.min(1, f.life / 0.3), k = 1 - f.life / f.max;
      const [sx, sy] = f.screen ? [f.x * D, f.y * D] : v.toScreen(f.x, f.y);
      const pop = f.big ? 1 + Math.max(0, 0.4 - k * 3) : 1;
      ctx.save(); ctx.translate(sx, sy - (f.big ? 0 : k * 40 * D)); ctx.scale(pop, pop);
      ctx.globalAlpha = a;
      ctx.font = `700 ${(f.size || 18) * D}px Fredoka, 'Trebuchet MS', sans-serif`;
      ctx.lineWidth = (f.big ? 9 : 5) * D; ctx.strokeStyle = f.stroke || '#1b2440'; ctx.lineJoin = 'round';
      ctx.strokeText(f.text, 0, 0); ctx.fillStyle = f.c || '#fff'; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  // finger demo: press near the ball, pull back away from the cup, the guide grows, let go
  hint(ctx, H, rt) {
    const v = this.view, D = this.dpr, ax = Math.cos(H.ang), ay = Math.sin(H.ang);
    const T = 2.0, k = (H.t % T) / T, fade = Math.min(1, (H.t - 0.35) * 3);
    const pull = k < 0.15 ? 0 : k < 0.6 ? (k - 0.15) / 0.45 : k < 0.72 ? 1 : 0;
    const press = k > 0.08 && k < 0.72;
    const pw = 0.25 + pull * 0.55;
    ctx.save(); ctx.globalAlpha = fade;
    if (pull > 0.02) {
      ctx.globalAlpha = fade * 0.75;
      this.aim(ctx, { ang: H.ang, power: pw, guide: { pts: H.g.pts, len: 70 + pw * 330 } }, { x: H.x, y: H.y });
      ctx.globalAlpha = fade;
    }
    if (k >= 0.72 && k < 0.85) { const q = (k - 0.72) / 0.13; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3 * (1 - q); ctx.beginPath(); ctx.arc(H.x, H.y, 12 + q * 24, 0, TAU); ctx.stroke(); }
    ctx.restore();
    // finger + label in screen space
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = fade;
    const [bx, by] = v.toScreen(H.x, H.y), [cx, cy] = v.toScreen(H.x + ax, H.y + ay);
    let dx = cx - bx, dy = cy - by; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
    const start = 26 * D, back = start + pull * 70 * D;
    const m = 26 * D, fx = Math.max(m, Math.min(v.cw - m, bx - dx * back)), fy = Math.max(m, Math.min(v.ch - m, by - dy * back));
    ctx.beginPath(); ctx.arc(fx, fy, (press ? 15 : 18) * D, 0, TAU); ctx.fillStyle = press ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)'; ctx.fill();
    ctx.lineWidth = 4 * D; ctx.strokeStyle = 'rgba(27,36,64,0.55)'; ctx.stroke();
    if (press) { ctx.beginPath(); ctx.arc(fx, fy, 24 * D, 0, TAU); ctx.lineWidth = 3 * D; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke(); }
    ctx.font = `700 ${15 * D}px Fredoka, 'Trebuchet MS', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(H.text).width + 24 * D;
    // label on the cup side of the ball, kept on screen and clear of the top bar
    let lx = bx + dx * 64 * D, ly = by + dy * 64 * D;
    if (Math.abs(dy) > 0.7) { lx = bx; ly = by + Math.sign(dy) * 70 * D; } else { lx = bx + Math.sign(dx) * (tw / 2 + 30 * D); ly = by - 34 * D; }
    lx = Math.max(tw / 2 + 8 * D, Math.min(v.cw - tw / 2 - 8 * D, lx)); ly = Math.max(84 * D, Math.min(v.ch - 24 * D, ly));
    rrect(ctx, lx - tw / 2, ly - 16 * D, tw, 32 * D, 16 * D); ctx.fillStyle = 'rgba(27,36,64,0.88)'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.fillText(H.text, lx, ly + 1 * D);
    ctx.restore();
  }

  portal(ctx, x, y, col, rt, flash) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, 30);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = 0.45 + flash * 0.5; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 30 + flash * 10, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.fillStyle = '#1d1440'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(x, y, 17, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2.5; ctx.lineCap = 'round';
    for (let k = 0; k < 3; k++) {
      const a = rt * 3 + (k * TAU) / 3;
      ctx.strokeStyle = k % 2 ? '#ffffff' : col;
      ctx.beginPath(); ctx.arc(x, y, 6 + k * 3.2, a, a + 2.2); ctx.stroke();
    }
  }

  mill(ctx, m, t) {
    const v = this.view;
    const [cx, cy] = m.c;
    // blades only show over the course (they would otherwise sweep across the lawn and the top bar)
    ctx.save(); path(ctx, this.w.green); ctx.clip();
    for (const pass of [0, 1]) {
      ctx.save();
      if (!pass) { ctx.translate(v.sdx * 14, v.sdy * 14); }
      for (let k = 0; k < m.n; k++) {
        const th = m.w * t + (k * TAU) / m.n;
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(th);
        if (!pass) { ctx.fillStyle = 'rgba(20,50,20,0.28)'; rrect(ctx, 0, -9, m.len + 4, 18, 5); ctx.fill(); }
        else {
          ctx.fillStyle = '#8a5a35'; rrect(ctx, 0, -3.5, m.len, 7, 3); ctx.fill();
          ctx.fillStyle = '#fffaf0'; rrect(ctx, m.len * 0.22, -10, m.len * 0.78, 14, 4); ctx.fill();
          ctx.strokeStyle = '#d6573c'; ctx.lineWidth = 2.5; rrect(ctx, m.len * 0.22, -10, m.len * 0.78, 14, 4); ctx.stroke();
          ctx.strokeStyle = 'rgba(214,87,60,0.5)'; ctx.lineWidth = 1.5;
          for (let s = m.len * 0.22 + 14; s < m.len - 4; s += 14) { ctx.beginPath(); ctx.moveTo(s, -10); ctx.lineTo(s, 4); ctx.stroke(); }
        }
        ctx.restore();
      }
      ctx.restore();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx + v.sdx * 4, cy + v.sdy * 4, m.hub + 4, 0, TAU); ctx.fillStyle = 'rgba(20,50,20,0.3)'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, m.hub + 3, 0, TAU); ctx.fillStyle = '#d6573c'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, m.hub - 3, 0, TAU); ctx.fillStyle = '#f07a5c'; ctx.fill();
    ctx.beginPath(); ctx.arc(cx, cy, 4, 0, TAU); ctx.fillStyle = '#fff3d6'; ctx.fill();
  }

  flag(ctx, S) {
    const v = this.view, D = this.dpr, [cx, cy] = this.w.cup;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const [sx, sy] = v.toScreen(cx, cy);
    const lift = S.flagLift || 0;
    const L = (54 + lift * 30) * D * Math.min(1.2, Math.max(0.6, v.s / D));
    // shadow of pole
    ctx.strokeStyle = 'rgba(10,40,10,0.25)'; ctx.lineWidth = 3 * D; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + L * 0.5, sy + L * 0.18); ctx.stroke();
    ctx.globalAlpha = S.flagAlpha ?? 1;
    ctx.strokeStyle = '#f2f2f2'; ctx.lineWidth = 3 * D;
    ctx.beginPath(); ctx.moveTo(sx, sy - 2 * D); ctx.lineTo(sx, sy - L); ctx.stroke();
    const fw = L * 0.55, fh = L * 0.34, top = sy - L;
    ctx.beginPath(); ctx.moveTo(sx + 1, top);
    for (let k = 0; k <= 8; k++) { const f = k / 8; ctx.lineTo(sx + f * fw, top + Math.sin(S.rt * 6 - f * 4) * 2.5 * D * f); }
    for (let k = 8; k >= 0; k--) { const f = k / 8; ctx.lineTo(sx + f * fw * (1 - 0.0), top + fh * (1 - f * 0.5) + Math.sin(S.rt * 6 - f * 4) * 2.5 * D * f - fh * f * 0.25); }
    ctx.closePath(); ctx.fillStyle = '#ff3b4f'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 ${fh * 0.62}px Fredoka, 'Trebuchet MS', sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(this.w.index + 1), sx + fw * 0.4, top + fh * 0.42);
    ctx.beginPath(); ctx.arc(sx, sy - L, 3 * D, 0, TAU); ctx.fillStyle = '#ffd23f'; ctx.fill();
    ctx.restore();
  }

  ball(ctx, B, S) {
    const b = B.ball, v = this.view;
    if (B.hidden) return;
    let r = R, x = b.x, y = b.y, alpha = B.ghost ? 0.72 : 1;
    if (b.sunk) { const k = Math.min(1, (B.sinkT || 0) / 0.25); r = R * (1 - k * 0.55); alpha *= 1 - k; if (alpha <= 0.01) return; }
    ctx.globalAlpha = alpha;
    // trail
    if (B.trail && B.trail.length > 1) {
      ctx.lineCap = 'round';
      for (let i = 1; i < B.trail.length; i++) {
        const a = i / B.trail.length;
        ctx.strokeStyle = B.ghost ? B.color : 'rgba(255,255,255,1)';
        ctx.globalAlpha = alpha * a * 0.35; ctx.lineWidth = R * 1.6 * a;
        ctx.beginPath(); ctx.moveTo(B.trail[i - 1][0], B.trail[i - 1][1]); ctx.lineTo(B.trail[i][0], B.trail[i][1]); ctx.stroke();
      }
      ctx.globalAlpha = alpha;
    }
    ctx.fillStyle = 'rgba(10,40,10,0.32)'; ctx.beginPath(); ctx.ellipse(x + v.sdx * 4, y + v.sdy * 4, r * 1.05, r * 1.05, 0, 0, TAU); ctx.fill();
    const sk = B.skin, col = sk && sk.p === 'rainbow' ? `hsl(${(S.rt * 120) % 360},90%,62%)` : B.color;
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    // rolling marks: features on the sphere slide along the travel direction and wrap round
    if (!B.ghost) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.clip();
      const ph = (B.spin || 0) / r, dir = B.dir || 0, ux = Math.cos(dir), uy = Math.sin(dir);
      const pat = sk ? sk.p : null;
      if (pat === 'stripe') {
        for (const o of [0, Math.PI]) { const c = Math.cos(ph + o); if (c < -0.2) continue; const d = Math.sin(ph + o) * r; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = r * 0.7 * Math.max(0.25, c); ctx.beginPath(); ctx.moveTo(x + ux * d - uy * r * 1.2, y + uy * d + ux * r * 1.2); ctx.lineTo(x + ux * d + uy * r * 1.2, y + uy * d - ux * r * 1.2); ctx.stroke(); }
      } else {
        const marks = pat === 'eight' || pat === 'star' ? [[0, 0]] : pat === 'dots' ? [[0, 0], [2.1, 0.5], [4.2, -0.5]] : [[0, 0.35], [0.5, -0.4], [Math.PI, 0]];
        for (const [o, side] of marks) {
          const c = Math.cos(ph + o); if (c <= 0) continue;
          const d = Math.sin(ph + o) * r * 0.85, mx = x + ux * d - uy * side * r, my = y + uy * d + ux * side * r;
          const rr = (pat === 'eight' ? 0.5 : pat === 'star' ? 0.55 : pat === 'dots' ? 0.3 : 0.16) * r;
          ctx.save(); ctx.translate(mx, my); ctx.rotate(dir); ctx.scale(Math.max(0.2, c), 1);
          if (pat === 'eight') { ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill(); ctx.fillStyle = '#22252e'; ctx.font = '700 ' + (rr * 1.5) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('8', 0, 0.5); }
          else if (pat === 'star') { ctx.fillStyle = '#ffd23f'; ctx.beginPath(); for (let k = 0; k < 10; k++) { const a = (k / 10) * TAU - Math.PI / 2, q = k % 2 ? rr * 0.45 : rr; ctx.lineTo(Math.cos(a) * q, Math.sin(a) * q); } ctx.fill(); }
          else { ctx.fillStyle = pat === 'dots' ? '#ffffff' : 'rgba(40,60,90,0.28)'; ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.fill(); }
          ctx.restore();
        }
      }
      ctx.restore();
    }
    const g = ctx.createRadialGradient(x - v.sdx * 3 - v.sdy * 2, y - v.sdy * 3 + v.sdx * 2, 0.5, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.35, 'rgba(255,255,255,0.15)'); g.addColorStop(0.75, 'rgba(255,255,255,0)'); g.addColorStop(1, B.ghost ? 'rgba(0,0,0,0.3)' : 'rgba(30,50,80,0.28)');
    if (B.ghost) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (!B.ghost) { ctx.lineWidth = 1.2; ctx.strokeStyle = 'rgba(30,50,80,0.35)'; ctx.stroke(); }
    ctx.globalAlpha = 1;
    // "your turn" pulse
    if (B.pulse && b.rest && !b.sunk) {
      const k = (S.rt * 1.4) % 1;
      ctx.globalAlpha = (1 - k) * 0.7; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(x, y, R + 4 + k * 16, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  aim(ctx, A, b) {
    const { ang, power, guide } = A;
    const col = power < 0.5 ? mix('#5ee86a', '#ffd23f', power * 2) : mix('#ffd23f', '#ff4b4b', (power - 0.5) * 2);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    // pull-back band behind the ball
    const back = 20 + power * 70;
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(27,36,64,0.35)'; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - dx * back, b.y - dy * back); ctx.stroke();
    ctx.strokeStyle = col; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(b.x - dx * (R + 2), b.y - dy * (R + 2)); ctx.lineTo(b.x - dx * back, b.y - dy * back); ctx.stroke();
    ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x - dx * back, b.y - dy * back, 6, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    // dotted guide
    if (guide) {
      let dist = 0, step = 14, total = guide.len;
      for (const segm of guide.pts.slice(1).map((p, i) => [guide.pts[i], p])) {
        const [p0, p1] = segm; const L = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
        for (let s = (step - (dist % step)) % step; s < L; s += step) {
          const k = (dist + s) / total; if (k > 1) break;
          const x = p0[0] + ((p1[0] - p0[0]) * s) / L, y = p0[1] + ((p1[1] - p0[1]) * s) / L;
          ctx.globalAlpha = 1 - k * 0.8;
          ctx.fillStyle = 'rgba(27,36,64,0.3)'; ctx.beginPath(); ctx.arc(x + 1.5, y + 1.5, 4.2 * (1 - k * 0.5), 0, TAU); ctx.fill();
          ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(x, y, 4 * (1 - k * 0.5), 0, TAU); ctx.fill();
        }
        dist += L;
      }
      ctx.globalAlpha = 1;
    }
    // power ring
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(27,36,64,0.3)'; ctx.beginPath(); ctx.arc(b.x, b.y, R + 11, 0, TAU); ctx.stroke();
    ctx.strokeStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, R + 11, ang + Math.PI - power * Math.PI, ang + Math.PI + power * Math.PI); ctx.stroke();
  }
}

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function mix(a, b, k) { const A = hex(a), B = hex(b); k = Math.max(0, Math.min(1, k)); return `rgb(${A.map((x, i) => Math.round(x + (B[i] - x) * k)).join(',')})`; }
function shade(c) { const [r, g, b] = hex(c); return `rgb(${(r * 0.7) | 0},${(g * 0.7) | 0},${(b * 0.7) | 0})`; }
