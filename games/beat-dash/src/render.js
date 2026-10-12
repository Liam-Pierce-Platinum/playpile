// Canvas 2D renderer: neon geometry that pulses on the beat. Glow is faked
// with a wide low-alpha stroke under a thin bright one (no shadowBlur in the
// hot path), so it stays fast on phones.
import { KEY } from './sim.js';

export const PALETTES = [
  { name: 'Volt', a: '#7dff3a', b: '#00e5ff' },
  { name: 'Ember', a: '#ffcf33', b: '#ff4d6d' },
  { name: 'Ice', a: '#9be7ff', b: '#3a5bff' },
  { name: 'Rose', a: '#ff6bd6', b: '#ffe14d' },
  { name: 'Void', a: '#ffffff', b: '#8a2bff' },
  { name: 'Solar', a: '#ff8a00', b: '#fff04d' },
];

const hsl = (h, s, l, a = 1) => `hsla(${((h % 360) + 360) % 360},${s}%,${l}%,${a})`;

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.x = canvas.getContext('2d');
    this.W = 0; this.H = 0; this.U = 40; this.dpr = 1;
    this.resize();
  }
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    this.dpr = dpr; this.W = W; this.H = H;
    this.c.width = Math.round(W * dpr); this.c.height = Math.round(H * dpr);
    this.c.style.width = W + 'px'; this.c.style.height = H + 'px';
    this.portrait = H > W * 1.1;
    // portrait phones: smaller blocks and the cube further left so you still see ~13 blocks ahead
    this.U = Math.max(18, Math.min(H / 9.5, W / (this.portrait ? 14 : 15)));
    this.baseY = this.portrait ? H * 0.64 : H - 1.7 * this.U; // screen y of world y = camY
    this.lead = this.portrait ? 0.15 : 0.3;                     // player x as a fraction of the width
    this.viewW = W / this.U;
  }
  sx(wx, cam) { return (wx - cam.x) * this.U; }
  sy(wy, cam) { return this.baseY - (wy - cam.y) * this.U; }

  // ---- whole frame ----------------------------------------------------------
  draw(g) {
    const { x: ctx, W, H, U } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const cam = g.cam;
    const shx = g.shake > 0 ? (Math.random() - 0.5) * g.shake * U * 0.5 : 0;
    const shy = g.shake > 0 ? (Math.random() - 0.5) * g.shake * U * 0.5 : 0;
    const pulse = g.pulse; // 1 on the beat, decays to 0
    const hue = g.hue;
    this.background(g, hue, pulse);
    ctx.save();
    ctx.translate(shx, shy);
    if (g.L) {
      this.floor(g, hue, pulse);
      this.attemptText(g);
      this.tips(g);
      this.objects(g, hue, pulse);
      this.blocks(g, hue, pulse);
      this.checkpoints(g);
      this.particles(g);
      if (g.s && !g.s.dead && !g.hidePlayer) this.player(g);
    }
    ctx.restore();
    if (g.flash > 0) { // additive so it reads as a burst of light, not grey fog
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = hsl(hue, 100, 70, Math.min(0.7, g.flash * 0.8)); ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    if (g.L && g.hud) this.hud(g, hue);
  }

  background(g, hue, pulse) {
    const { x: ctx, W, H, U } = this;
    const gr = ctx.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, hsl(hue + 25, 85, 11 + pulse * 3));
    gr.addColorStop(0.75, hsl(hue - 5, 90, 26 + pulse * 6));
    gr.addColorStop(1, hsl(hue - 15, 95, 34 + pulse * 8));
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // far parallax squares
    const cam = g.cam;
    const S = U * 3.2;
    const ox = -((cam.x * U * 0.12) % S), oy = (cam.y * U * 0.12) % S;
    ctx.lineWidth = 2;
    for (let i = -1; i < W / S + 2; i++) {
      for (let j = -1; j < H / S + 1; j++) {
        const n = (i + Math.floor(cam.x * U * 0.12 / S)) * 7 + j * 13;
        if (((n * 2654435761) >>> 0) % 5 > 1) continue;
        const a = 0.07 + 0.1 * pulse;
        ctx.strokeStyle = hsl(hue + 30, 90, 70, a);
        ctx.strokeRect(ox + i * S + S * 0.15, oy + j * S + S * 0.15, S * 0.7, S * 0.7);
      }
    }
    // horizon sun (striped, synth style), slow parallax
    {
      const fy = this.sy(0, cam);
      const R0 = Math.min(W, H) * 0.32 * (1 + pulse * 0.03);
      const span = W * 2.2;
      const cx = (((W * 1.28 - cam.x * U * 0.03) % span) + span) % span - W * 0.6, cy = Math.min(fy, H) - R0 * 0.35;
      const sg = ctx.createLinearGradient(0, cy - R0, 0, cy + R0);
      sg.addColorStop(0, hsl(hue + 60, 100, 72, 0.55)); sg.addColorStop(1, hsl(hue - 20, 100, 55, 0.25));
      const halo = ctx.createRadialGradient(cx, cy, R0 * 0.8, cx, cy, R0 * 1.8);
      halo.addColorStop(0, hsl(hue + 40, 100, 65, 0.16 + 0.08 * pulse)); halo.addColorStop(1, hsl(hue + 40, 100, 65, 0));
      ctx.fillStyle = halo; ctx.fillRect(cx - R0 * 1.8, cy - R0 * 1.8, R0 * 3.6, R0 * 3.6);
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, R0, 0, Math.PI * 2); ctx.clip();
      ctx.fillStyle = sg; ctx.fillRect(cx - R0, cy - R0, R0 * 2, R0 * 2);
      // horizontal cut stripes (painted with the sky gradient), thicker toward the bottom
      ctx.fillStyle = gr;
      for (let k = 0; k < 7; k++) {
        const yy = cy + R0 * (0.05 + k * 0.14), th = R0 * (0.02 + k * 0.012);
        ctx.fillRect(cx - R0, yy, R0 * 2, th);
      }
      ctx.restore();
    }
    // drifting motes
    for (let k = 0; k < 26; k++) {
      const sp = 0.05 + (k % 5) * 0.03;
      const px = ((k * 977 - cam.x * U * sp) % (W + 40) + W + 40) % (W + 40) - 20;
      const py = (k * 613 % 1000) / 1000 * H * 0.8 + Math.sin(g.time * 0.7 + k) * 10;
      ctx.fillStyle = hsl(hue + 40, 100, 80, 0.12 + 0.25 * pulse * ((k % 3) / 2));
      const sz = 1.5 + (k % 4);
      ctx.fillRect(px, py, sz, sz);
    }
    // mid layer: tall bars that bounce on the beat
    const B = U * 1.4;
    const ox2 = -((cam.x * U * 0.35) % (B * 2));
    for (let i = -1; i < W / (B * 2) + 2; i++) {
      const k = i + Math.floor(cam.x * U * 0.35 / (B * 2));
      const h = (0.25 + 0.2 * Math.abs(Math.sin(k * 1.7))) * H * (0.6 + pulse * 0.4);
      ctx.fillStyle = hsl(hue + 10, 95, 55, 0.1 + 0.05 * pulse);
      ctx.fillRect(ox2 + i * B * 2, this.sy(0, cam) - h, B, h);
    }
  }

  floor(g, hue, pulse) {
    const { x: ctx, W, H, U } = this;
    const cam = g.cam;
    const fy = this.sy(0, cam);
    if (fy > H + 4) return;
    const gr = ctx.createLinearGradient(0, fy, 0, H);
    gr.addColorStop(0, hsl(hue, 70, 14)); gr.addColorStop(1, hsl(hue, 70, 5));
    ctx.fillStyle = gr; ctx.fillRect(-U, fy, W + U * 2, H - fy + U); // overdraw so screen shake never shows an edge
    // tiles
    ctx.strokeStyle = hsl(hue, 80, 60, 0.12); ctx.lineWidth = 1;
    const ox = -((cam.x * U) % (U * 2));
    ctx.beginPath();
    for (let x = ox; x < W; x += U * 2) { ctx.moveTo(x, fy); ctx.lineTo(x - U * 0.8, H); }
    ctx.stroke();
    // glowing line
    ctx.strokeStyle = hsl(hue, 100, 70, 0.25 + 0.2 * pulse); ctx.lineWidth = 8 + pulse * 6;
    ctx.beginPath(); ctx.moveTo(-U, fy); ctx.lineTo(W + U, fy); ctx.stroke();
    const lg = ctx.createLinearGradient(0, 0, W, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.strokeStyle = lg; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(-U, fy); ctx.lineTo(W + U, fy); ctx.stroke();
  }

  visible(g) {
    const x0 = g.cam.x - 2, x1 = g.cam.x + this.viewW + 2;
    return [x0, x1];
  }

  blocks(g, hue, pulse) {
    const { x: ctx, U } = this;
    const L = g.L, cam = g.cam;
    const [x0, x1] = this.visible(g);
    const B = L.blocks;
    let lo = 0, hi = B.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (B[m].x < x0) lo = m + 1; else hi = m; }
    const cells = [];
    for (let i = lo; i < B.length && B[i].x <= x1; i++) cells.push(B[i]);
    if (!cells.length) return;
    // fills
    ctx.fillStyle = hsl(hue, 60, 10, 0.92);
    ctx.beginPath();
    for (const b of cells) ctx.rect(this.sx(b.x, cam) - 0.5, this.sy(b.y + 1, cam) - 0.5, U + 1, U + 1);
    ctx.fill();
    // inner bevel squares
    ctx.strokeStyle = hsl(hue, 90, 65, 0.16 + pulse * 0.1); ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const b of cells) ctx.rect(this.sx(b.x, cam) + U * 0.2, this.sy(b.y + 1, cam) + U * 0.2, U * 0.6, U * 0.6);
    ctx.stroke();
    // exposed edges (merged outline)
    const S = L.solid;
    ctx.beginPath();
    for (const b of cells) {
      const X = this.sx(b.x, cam), Y = this.sy(b.y + 1, cam);
      if (!S.has(KEY(b.x, b.y + 1))) { ctx.moveTo(X, Y); ctx.lineTo(X + U, Y); }
      if (b.y > 0 && !S.has(KEY(b.x, b.y - 1))) { ctx.moveTo(X, Y + U); ctx.lineTo(X + U, Y + U); }
      if (!S.has(KEY(b.x - 1, b.y))) { ctx.moveTo(X, Y); ctx.lineTo(X, Y + U); }
      if (!S.has(KEY(b.x + 1, b.y))) { ctx.moveTo(X + U, Y); ctx.lineTo(X + U, Y + U); }
    }
    ctx.lineCap = 'round';
    ctx.strokeStyle = hsl(hue, 100, 65, 0.3 + 0.2 * pulse); ctx.lineWidth = U * 0.22;
    ctx.stroke();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, U * 0.06);
    ctx.stroke();
  }

  objects(g, hue, pulse) {
    const { x: ctx, U } = this;
    const L = g.L, cam = g.cam, s = g.s;
    const [x0, x1] = this.visible(g);
    const D = L.draw;
    let lo = 0, hi = D.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (D[m].x < x0) lo = m + 1; else hi = m; }
    const used = s ? s.used : [];
    const t = g.time;
    // spikes batched
    const spikes = [];
    for (let i = lo; i < D.length && D[i].x <= x1; i++) {
      const o = D[i];
      const X = this.sx(o.x, cam), Y = this.sy(o.y + 1, cam);
      if (o.t === 'spike' || o.t === 'small') { spikes.push(o); continue; }
      const cx = X + U / 2, cy = Y + U / 2;
      const spent = used.includes(o.id) || (g.spent && g.spent.has(o.id));
      if (o.t === 'pad') {
        const up = o.d === 1;
        const by = up ? Y + U : Y;
        ctx.fillStyle = spent ? 'rgba(255,220,60,0.35)' : '#ffd93d';
        ctx.beginPath();
        ctx.ellipse(cx, by, U * 0.42, U * (0.22 + 0.06 * pulse), 0, up ? Math.PI : 0, up ? Math.PI * 2 : Math.PI);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,230,120,0.35)'; ctx.lineWidth = U * 0.12; ctx.stroke();
        // rising sparks
        for (let k = 0; k < 3; k++) {
          const ph = (t * 1.6 + k / 3) % 1;
          ctx.fillStyle = `rgba(255,230,120,${0.6 * (1 - ph)})`;
          ctx.fillRect(cx - U * 0.3 + k * U * 0.27, by + (up ? -1 : 1) * ph * U * 1.2, U * 0.07, U * 0.07);
        }
      } else if (o.t === 'orb' || o.t === 'flip') {
        const col = o.t === 'orb' ? '#ffe14d' : '#4dd2ff';
        const r = U * (0.32 + 0.05 * pulse);
        ctx.globalAlpha = spent ? 0.35 : 1;
        const rg = ctx.createRadialGradient(cx, cy, r * 0.8, cx, cy, r * 2.2);
        rg.addColorStop(0, col + '88'); rg.addColorStop(1, col + '00');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(cx, cy, r * 2.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.3, r * 0.28, 0, Math.PI * 2); ctx.fill();
        // spinning dashed halo
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(t * 2.5);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.setLineDash([U * 0.15, U * 0.12]);
        ctx.beginPath(); ctx.arc(0, 0, r + U * 0.22, 0, Math.PI * 2); ctx.stroke();
        ctx.restore(); ctx.setLineDash([]);
        if (o.t === 'flip') { // arrows
          ctx.strokeStyle = '#06233a'; ctx.lineWidth = U * 0.07;
          ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy - r * 0.1); ctx.lineTo(cx, cy - r * 0.55); ctx.lineTo(cx + r * 0.45, cy - r * 0.1);
          ctx.moveTo(cx - r * 0.45, cy + r * 0.1); ctx.lineTo(cx, cy + r * 0.55); ctx.lineTo(cx + r * 0.45, cy + r * 0.1); ctx.stroke();
        }
        ctx.globalAlpha = 1;
      } else if (o.t === 'portal') {
        const col = o.d === -1 ? '#ffdd33' : '#33e1ff';
        const h = U * 1.5, w = U * 0.5;
        ctx.save(); ctx.translate(cx, cy);
        ctx.strokeStyle = col; ctx.globalAlpha = 0.25; ctx.lineWidth = U * 0.4;
        ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.globalAlpha = 1; ctx.lineWidth = U * 0.14;
        ctx.beginPath(); ctx.ellipse(0, 0, w, h, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(0, 0, w * 0.7, h * 0.85, 0, 0, Math.PI * 2); ctx.stroke();
        // flowing arrows showing the new gravity
        const dir = o.d === -1 ? -1 : 1;
        ctx.fillStyle = col;
        for (let k = 0; k < 3; k++) {
          const ph = ((t * 1.2 + k / 3) % 1) - 0.5;
          const ay = ph * h * 1.4 * dir;
          ctx.globalAlpha = 1 - Math.abs(ph) * 1.6;
          ctx.beginPath(); ctx.moveTo(-w * 0.45, ay - dir * U * 0.1); ctx.lineTo(0, ay + dir * U * 0.18); ctx.lineTo(w * 0.45, ay - dir * U * 0.1); ctx.fill();
        }
        ctx.restore(); ctx.globalAlpha = 1;
      }
    }
    if (spikes.length) {
      ctx.beginPath();
      for (const o of spikes) {
        const X = this.sx(o.x, cam), Y = this.sy(o.y + 1, cam);
        const h = (o.t === 'spike' ? 1 : 0.5) * U;
        if (o.d === 1) { ctx.moveTo(X + U * 0.06, Y + U); ctx.lineTo(X + U / 2, Y + U - h); ctx.lineTo(X + U * 0.94, Y + U); ctx.closePath(); }
        else { ctx.moveTo(X + U * 0.06, Y); ctx.lineTo(X + U / 2, Y + h); ctx.lineTo(X + U * 0.94, Y); ctx.closePath(); }
      }
      ctx.fillStyle = hsl(hue, 70, 8, 0.95); ctx.fill();
      ctx.lineJoin = 'round';
      ctx.strokeStyle = hsl(hue + 330, 100, 65, 0.35 + 0.25 * pulse); ctx.lineWidth = U * 0.2; ctx.stroke();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, U * 0.06); ctx.stroke();
    }
  }

  checkpoints(g) {
    if (!g.practice || !g.cps) return;
    const { x: ctx, U } = this;
    for (const cp of g.cps) {
      const X = this.sx(cp.s.x + 0.5, g.cam), Y = this.sy(cp.s.y + 0.5, g.cam);
      if (X < -U || X > this.W + U) continue;
      ctx.save(); ctx.translate(X, Y); ctx.rotate(Math.PI / 4);
      ctx.fillStyle = 'rgba(80,255,140,0.85)'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.fillRect(-U * 0.22, -U * 0.22, U * 0.44, U * 0.44); ctx.strokeRect(-U * 0.22, -U * 0.22, U * 0.44, U * 0.44);
      ctx.restore();
    }
  }

  player(g) {
    const { x: ctx, U } = this;
    const s = g.s, cam = g.cam, P = g.pal;
    // ghost trail in the air
    for (let i = 0; i < g.trail.length; i++) {
      const tr = g.trail[i];
      const a = (i / g.trail.length) * 0.35;
      ctx.save();
      ctx.translate(this.sx(tr.x + 0.5, cam), this.sy(tr.y + 0.5, cam)); ctx.rotate(tr.r);
      ctx.fillStyle = P.b; ctx.globalAlpha = a;
      const k = 0.5 + (i / g.trail.length) * 0.4;
      ctx.fillRect(-U * k / 2, -U * k / 2, U * k, U * k);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    const X = this.sx(s.x + 0.5, cam), Y = this.sy(s.y + 0.5, cam);
    const sq = g.squash || 0; // landing squash
    ctx.save();
    ctx.translate(X, Y + (s.grav === 1 ? 1 : -1) * sq * U * 0.12);
    ctx.scale(1 + sq * 0.18, 1 - sq * 0.22); // squash in screen space, before the spin
    ctx.rotate(s.rot);
    const w = U, h = U;
    // glow
    ctx.shadowColor = P.a; ctx.shadowBlur = U * (0.45 + 0.3 * g.pulse);
    ctx.fillStyle = '#05050c'; ctx.fillRect(-w / 2 - 2, -h / 2 - 2, w + 4, h + 4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = P.a; ctx.fillRect(-w / 2 + 1, -h / 2 + 1, w - 2, h - 2);
    ctx.fillStyle = '#05050c'; ctx.fillRect(-w * 0.3, -h * 0.3, w * 0.6, h * 0.6);
    ctx.fillStyle = P.b; ctx.fillRect(-w * 0.24, -h * 0.24, w * 0.48, h * 0.48);
    // eyes
    ctx.fillStyle = '#05050c';
    ctx.fillRect(-w * 0.16, -h * 0.12, w * 0.1, h * 0.14); ctx.fillRect(w * 0.06, -h * 0.12, w * 0.1, h * 0.14);
    ctx.restore();
  }

  particles(g) {
    const { x: ctx, U } = this;
    for (const p of g.parts) {
      const a = Math.max(0, p.life / p.max);
      const X = this.sx(p.x, g.cam), Y = this.sy(p.y, g.cam);
      ctx.globalAlpha = a;
      if (p.k === 'ring') {
        ctx.strokeStyle = p.c; ctx.lineWidth = Math.max(1, U * 0.12 * a);
        ctx.beginPath(); ctx.arc(X, Y, (1 - a) * p.sz * U + U * 0.2, 0, Math.PI * 2); ctx.stroke();
      } else {
        ctx.fillStyle = p.c;
        const sz = p.sz * U * (p.k === 'shrink' ? a : 1);
        ctx.save(); ctx.translate(X, Y); ctx.rotate(p.r || 0);
        ctx.fillRect(-sz / 2, -sz / 2, sz, sz); ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
  }

  attemptText(g) {
    if (!g.attemptLabel) return;
    const { x: ctx, U } = this;
    const X = this.sx(g.attemptLabel.x, g.cam), Y = this.sy(4.2, g.cam);
    if (X < -U * 10) return;
    ctx.font = `800 ${Math.round(U * 0.85)}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.lineWidth = U * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.strokeText(g.attemptLabel.text, X, Y);
    ctx.fillStyle = '#fff'; ctx.fillText(g.attemptLabel.text, X, Y);
  }

  tips(g) {
    if (!g.tips || !g.tips.length || !g.s || g.dead) return;
    const { x: ctx, U } = this;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const fs = Math.round(Math.max(15, U * 0.5));
    ctx.font = `800 ${fs}px Fredoka, system-ui, sans-serif`;
    for (const t of g.tips) {
      const X = this.sx(t.x, g.cam);
      if (X < -U * 6 || X > this.W + U * 6) continue;
      const Y = this.sy(t.y, g.cam);
      const bob = Math.sin(g.time * 7) * U * 0.08;
      // fades out as the cube reaches it
      const d = t.x - g.s.x;
      ctx.globalAlpha = Math.max(0, Math.min(1, (d + 1.5) / 2.5));
      ctx.lineWidth = fs * 0.28; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineJoin = 'round';
      ctx.strokeText(t.text, X, Y + bob);
      ctx.fillStyle = '#fff'; ctx.fillText(t.text, X, Y + bob);
      // arrow down to the thing
      const ay = this.sy(t.ay, g.cam), y0 = Y + fs * 0.75 + bob;
      if (ay - y0 > U * 0.4) {
        ctx.strokeStyle = '#ffe14d'; ctx.lineWidth = Math.max(3, U * 0.08); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(X, y0); ctx.lineTo(X, ay - U * 0.1);
        ctx.moveTo(X - U * 0.2, ay - U * 0.32); ctx.lineTo(X, ay - U * 0.1); ctx.lineTo(X + U * 0.2, ay - U * 0.32); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  hud(g, hue) {
    const { x: ctx, W, U } = this;
    const pct = g.pct;
    const narrow = W < 700;
    const bw = narrow ? W - 178 : Math.min(W * 0.5, 420), bh = 12, bx = narrow ? 14 : (W - bw) / 2, by = narrow ? 24 : 14;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, bx - 3, by - 3, bw + 6, bh + 6, 9); ctx.fill();
    const fill = ctx.createLinearGradient(bx, 0, bx + bw, 0);
    fill.addColorStop(0, g.practice ? '#38ff8a' : g.pal.a); fill.addColorStop(1, g.practice ? '#b5ffcf' : g.pal.b);
    ctx.fillStyle = fill;
    if (pct > 0) { roundRect(ctx, bx, by, Math.max(bh, bw * pct), bh, 6); ctx.fill(); }
    // best marker
    if (g.bestPct > 0 && g.bestPct < 100) {
      const mx = bx + bw * g.bestPct / 100;
      ctx.fillStyle = '#fff'; ctx.fillRect(mx - 1.5, by - 5, 3, bh + 10);
    }
    ctx.font = `700 ${16}px Fredoka, system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(Math.floor(pct * 100) + '%', bx + bw + 10, by + bh / 2 + 1);
    if (g.practice) {
      ctx.textAlign = 'center'; ctx.fillStyle = '#7dffaf'; ctx.font = '700 13px Fredoka, system-ui, sans-serif';
      ctx.fillText('PRACTICE', bx + bw / 2, by + bh + 16);
    }
    // where you died: a big % that punches in and drifts up
    if (g.deathPop && !g.banner) {
      const b = g.deathPop, age = b.max - b.t;
      ctx.save();
      ctx.translate(W / 2, this.H * 0.27 - age * 18);
      const sc = age < 0.08 ? 1.5 - age * 6 : 1;
      ctx.scale(sc, sc);
      ctx.globalAlpha = Math.min(1, b.t * 4);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = Math.round(Math.min(W * 0.22, U * 1.7));
      ctx.font = `800 ${fs}px Fredoka, system-ui, sans-serif`;
      ctx.lineWidth = fs * 0.16; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineJoin = 'round'; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = '#fff'; ctx.fillText(b.text, 0, 0);
      ctx.font = `700 ${Math.round(fs * 0.3)}px Fredoka, system-ui, sans-serif`;
      ctx.lineWidth = fs * 0.07; ctx.strokeText(b.sub, 0, fs * 0.66); ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillText(b.sub, 0, fs * 0.66);
      ctx.restore();
    }
    // centre banner (new best / level complete)
    if (g.banner && g.banner.t > 0) {
      const b = g.banner;
      const k = Math.min(1, b.t * 3) * Math.min(1, (b.max - b.t + 0.05) * 8);
      ctx.save();
      ctx.translate(W / 2, this.H * 0.36);
      const sc = 0.6 + 0.4 * Math.min(1, (b.max - b.t) * 7);
      ctx.scale(sc, sc);
      ctx.globalAlpha = Math.max(0, Math.min(1, k));
      ctx.textAlign = 'center';
      const fs = Math.round(Math.min(W / (b.text.length * 0.62), U * 1.5));
      ctx.font = `800 ${fs}px Fredoka, system-ui, sans-serif`;
      ctx.lineWidth = fs * 0.18; ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.strokeText(b.text, 0, 0);
      ctx.fillStyle = b.color || '#fff'; ctx.fillText(b.text, 0, 0);
      if (b.sub) {
        ctx.font = `700 ${Math.round(fs * 0.4)}px Fredoka, system-ui, sans-serif`;
        ctx.lineWidth = fs * 0.08; ctx.strokeText(b.sub, 0, fs * 0.7); ctx.fillStyle = '#fff'; ctx.fillText(b.sub, 0, fs * 0.7);
      }
      ctx.restore();
    }
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
