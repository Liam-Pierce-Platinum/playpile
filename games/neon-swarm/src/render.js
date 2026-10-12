// Canvas renderer: warped grid, neon vector shapes drawn additively, streak
// particles, then a cheap bloom (the frame downsampled twice and laid back on
// top with 'lighter'). Touch sticks are drawn after the bloom so they stay flat.
import { W, H } from './game.js';
import { PAL } from './fx.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    this.b1 = document.createElement('canvas'); this.b1x = this.b1.getContext('2d');
    this.b2 = document.createElement('canvas'); this.b2x = this.b2.getContext('2d');
    this.hasFilter = typeof this.ctx.filter === 'string';
    this.cam = { x: W / 2, y: H / 2 };
    this.time = 0;
    this.quality = 1; // drops to 0 (no bloom blur level 2) if frames get slow
    this.resize();
  }
  resize() {
    const dpr = this.lowRes ? 1 : Math.min(window.devicePixelRatio || 1, 1.75);
    const cw = window.innerWidth, ch = window.innerHeight;
    this.cw = cw; this.ch = ch; this.dpr = dpr;
    this.c.width = Math.round(cw * dpr); this.c.height = Math.round(ch * dpr);
    this.b1.width = Math.max(1, Math.round(this.c.width / 4)); this.b1.height = Math.max(1, Math.round(this.c.height / 4));
    this.b2.width = Math.max(1, Math.round(this.c.width / 10)); this.b2.height = Math.max(1, Math.round(this.c.height / 10));
    // constant visible world AREA so phones (portrait or landscape) and big
    // monitors all see about the same amount of the arena
    // (touch screens get a closer camera: bigger shapes for thumbs + small screens)
    const area = matchMedia('(pointer: coarse)').matches ? 650000 : 1000000;
    this.scale = Math.max(0.52, Math.sqrt(cw * ch / area));
  }
  view() { return { vw: this.cw / this.scale, vh: this.ch / this.scale }; }
  follow(g, dt, snap = false) {
    const { vw, vh } = this.view();
    const p = g.p;
    const tx = vw >= W + 120 ? W / 2 : Math.min(Math.max(p.x, vw / 2 - 60), W - vw / 2 + 60);
    const ty = vh >= H + 120 ? H / 2 : Math.min(Math.max(p.y, vh / 2 - 60), H - vh / 2 + 60);
    const k = snap ? 1 : 1 - Math.exp(-dt * 6);
    this.cam.x += (tx - this.cam.x) * k; this.cam.y += (ty - this.cam.y) * k;
  }

  draw(g, input, dt) {
    this.time += dt;
    const ctx = this.ctx, dpr = this.dpr, s = this.scale * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    ctx.fillStyle = '#020309'; ctx.fillRect(0, 0, this.c.width, this.c.height);
    // camera + shake
    const sh = g.shake * g.shake * 16;
    const ox = (Math.random() - 0.5) * sh, oy = (Math.random() - 0.5) * sh;
    const tx = this.c.width / 2 - (this.cam.x + ox) * s, ty = this.c.height / 2 - (this.cam.y + oy) * s;
    ctx.setTransform(s, 0, 0, s, tx, ty);
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';

    this.drawGrid(ctx, g);
    // arena border
    ctx.strokeStyle = 'rgba(120,150,255,0.9)'; ctx.lineWidth = 3;
    ctx.strokeRect(-3, -3, W + 6, H + 6);
    ctx.strokeStyle = 'rgba(80,110,255,0.35)'; ctx.lineWidth = 9;
    ctx.strokeRect(-6, -6, W + 12, H + 12);

    this.drawGeoms(ctx, g);
    for (const e of g.enemies) if (!e.dead) this.drawEnemy(ctx, e, g);
    this.drawBullets(ctx, g);
    this.drawPlayer(ctx, g);
    this.drawParticles(ctx, g.fx);
    this.drawRings(ctx, g.fx);
    this.drawTexts(ctx, g.fx);

    // bloom
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.bloom(ctx);
    // full-screen flash (bomb / death)
    if (g.flash > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = g.flash * 0.35; ctx.fillStyle = '#9fc8ff'; ctx.fillRect(0, 0, this.c.width, this.c.height); ctx.globalAlpha = 1; }
    ctx.globalCompositeOperation = 'source-over';
    // vignette
    if (!this.vig || this.vigW !== this.c.width || this.vigH !== this.c.height) {
      this.vigW = this.c.width; this.vigH = this.c.height;
      const gr = ctx.createRadialGradient(this.vigW / 2, this.vigH / 2, Math.min(this.vigW, this.vigH) * 0.35, this.vigW / 2, this.vigH / 2, Math.hypot(this.vigW, this.vigH) * 0.6);
      gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)');
      this.vig = gr;
    }
    ctx.fillStyle = this.vig; ctx.fillRect(0, 0, this.c.width, this.c.height);
    this.drawEdgeMarks(ctx, g, s, tx, ty);
    if (input) { this.drawSticks(ctx, input); if (!input.touch && input.mouse.seen) this.drawReticle(ctx, input, g); }
  }

  bloom(ctx) {
    const b1 = this.b1, b2 = this.b2;
    this.b1x.globalCompositeOperation = 'copy';
    this.b1x.imageSmoothingEnabled = true;
    this.b1x.drawImage(this.c, 0, 0, b1.width, b1.height);
    this.b2x.globalCompositeOperation = 'copy';
    if (this.hasFilter && this.quality > 0) this.b2x.filter = 'blur(2px)';
    this.b2x.drawImage(b1, 0, 0, b2.width, b2.height);
    this.b2x.filter = 'none';
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.6; ctx.drawImage(b1, 0, 0, this.c.width, this.c.height);
    ctx.globalAlpha = 0.85; ctx.drawImage(b2, 0, 0, this.c.width, this.c.height);
    ctx.globalAlpha = 1;
  }

  drawGrid(ctx, g) {
    const G = g.grid, cols = G.cols, rows = G.rows, x = G.x, y = G.y;
    const e = Math.min(1, G.energy * 0.5);
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      for (let r = 0; r < rows; r++) {
        if ((r % 4 === 0) !== (pass === 1)) continue;
        let i = r * cols; ctx.moveTo(x[i], y[i]);
        for (let c = 1; c < cols; c++) { i++; ctx.lineTo(x[i], y[i]); }
      }
      for (let c = 0; c < cols; c++) {
        if ((c % 4 === 0) !== (pass === 1)) continue;
        let i = c; ctx.moveTo(x[i], y[i]);
        for (let r = 1; r < rows; r++) { i += cols; ctx.lineTo(x[i], y[i]); }
      }
      if (pass === 0) { ctx.strokeStyle = `rgba(40,70,200,${0.22 + e * 0.15})`; ctx.lineWidth = 1.2; }
      else { ctx.strokeStyle = `rgba(70,110,255,${0.42 + e * 0.2})`; ctx.lineWidth = 2; }
      ctx.stroke();
    }
  }

  drawGeoms(ctx, g) {
    ctx.strokeStyle = PAL[3]; ctx.lineWidth = 2;
    ctx.beginPath();
    for (const o of g.geoms) {
      if (o.life < 1 && Math.floor(o.life * 10) % 2 === 0) continue;
      const c = Math.cos(o.ang) * 7, s = Math.sin(o.ang) * 7, c2 = Math.cos(o.ang) * 3.5, s2 = Math.sin(o.ang) * 3.5;
      ctx.moveTo(o.x + c, o.y + s); ctx.lineTo(o.x - s2, o.y + c2); ctx.lineTo(o.x - c, o.y - s); ctx.lineTo(o.x + s2, o.y - c2); ctx.closePath();
    }
    ctx.stroke();
  }

  drawBullets(ctx, g) {
    ctx.beginPath();
    for (const b of g.bullets) { ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - b.vx * 0.016, b.y - b.vy * 0.016); }
    ctx.strokeStyle = 'rgba(255,170,60,0.55)'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = PAL[9]; ctx.lineWidth = 2; ctx.stroke();
  }

  drawPlayer(ctx, g) {
    const p = g.p;
    if (!p.alive) return;
    // invulnerable: flicker between dim and full instead of vanishing, so a
    // newcomer always knows where they are (the ship used to disappear on
    // alternate frames right when a run starts)
    const blink = p.inv > 0 && Math.floor(p.inv * 14) % 2 === 0;
    if (blink) ctx.globalAlpha = 0.45;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.ang); ctx.scale(1.25, 1.25);
    ctx.beginPath();
    ctx.moveTo(16, 0); ctx.lineTo(-2, -13); ctx.lineTo(-11, -9); ctx.lineTo(-3, 0); ctx.lineTo(-11, 9); ctx.lineTo(-2, 13); ctx.closePath();
    ctx.strokeStyle = 'rgba(255,200,120,0.5)'; ctx.lineWidth = 6; ctx.stroke();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.restore();
    ctx.globalAlpha = 1;
    if (p.inv > 0) { ctx.beginPath(); ctx.arc(p.x, p.y, 26 + (1 - Math.min(1, p.inv / 2)) * 4, 0, TAU); ctx.strokeStyle = 'rgba(160,220,255,' + (0.3 + 0.3 * Math.min(1, p.inv)) + ')'; ctx.lineWidth = 2.5; ctx.stroke(); }
  }

  drawEnemy(ctx, e, g) {
    const col = PAL[e.col];
    let k = 1, alpha = 1;
    if (e.spawn > 0) {
      const f = e.spawn / e.spawnFull;
      k = 1 + f * 1.6; alpha = (Math.floor(e.spawn * 16) % 2 ? 0.9 : 0.35) * (1 - f * 0.4);
    }
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = 2.6;
    const r = e.r * k;
    ctx.save(); ctx.translate(e.x, e.y);
    switch (e.type) {
      case 'wander': case 'mini': {
        ctx.rotate(e.ang);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
          const a = i * TAU / 4, c = Math.cos(a), s = Math.sin(a);
          ctx.moveTo(0, 0); ctx.lineTo(c * r, s * r); ctx.lineTo(c * r * 0.3 - s * r * 0.75, s * r * 0.3 + c * r * 0.75); ctx.closePath();
        }
        ctx.stroke();
        break;
      }
      case 'grunt': {
        const pulse = 1 + Math.sin(e.t * 9) * 0.12;
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.moveTo(r * 1.15 * pulse, 0); ctx.lineTo(0, -r * 0.8 / pulse); ctx.lineTo(-r * 1.15 * pulse, 0); ctx.lineTo(0, r * 0.8 / pulse); ctx.closePath(); ctx.stroke();
        ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(r * 0.5, 0); ctx.lineTo(0, -r * 0.35); ctx.lineTo(-r * 0.5, 0); ctx.lineTo(0, r * 0.35); ctx.closePath(); ctx.stroke();
        break;
      }
      case 'dodger': {
        ctx.rotate(e.ang);
        ctx.strokeRect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
        ctx.rotate(Math.PI / 4); ctx.lineWidth = 1.8;
        ctx.strokeRect(-r * 0.55, -r * 0.55, r * 1.1, r * 1.1);
        break;
      }
      case 'split': {
        ctx.rotate(e.ang);
        ctx.strokeRect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6);
        ctx.beginPath(); ctx.moveTo(-r * 0.8, -r * 0.8); ctx.lineTo(r * 0.8, r * 0.8); ctx.moveTo(r * 0.8, -r * 0.8); ctx.lineTo(-r * 0.8, r * 0.8); ctx.stroke();
        break;
      }
      case 'spark': {
        ctx.rotate(e.ang);
        ctx.beginPath(); ctx.moveTo(r * 1.2, 0); ctx.lineTo(-r * 0.7, -r * 0.9); ctx.lineTo(-r * 0.7, r * 0.9); ctx.closePath(); ctx.stroke();
        break;
      }
      case 'snake': {
        ctx.restore(); ctx.save();
        // tail: chain of shrinking diamonds
        ctx.beginPath();
        const n = e.segs.length;
        for (let i = n - 1; i >= 0; i--) {
          const sg = e.segs[i], prev = i ? e.segs[i - 1] : e;
          const a = Math.atan2(prev.y - sg.y, prev.x - sg.x), sz = 8.5 * (1 - i / n * 0.6);
          const c = Math.cos(a), s = Math.sin(a);
          ctx.moveTo(sg.x + c * sz, sg.y + s * sz); ctx.lineTo(sg.x - s * sz * 0.55, sg.y + c * sz * 0.55);
          ctx.lineTo(sg.x - c * sz, sg.y - s * sz); ctx.lineTo(sg.x + s * sz * 0.55, sg.y - c * sz * 0.55); ctx.closePath();
        }
        ctx.lineWidth = 1.8; ctx.strokeStyle = e.spawn > 0 ? col : 'rgba(255,170,40,0.9)'; ctx.stroke();
        ctx.translate(e.x, e.y); ctx.rotate(e.ang);
        ctx.strokeStyle = col; ctx.lineWidth = 2.8;
        ctx.beginPath(); ctx.moveTo(r * 1.3, 0); ctx.lineTo(-r * 0.4, -r); ctx.lineTo(-r * 0.9, 0); ctx.lineTo(-r * 0.4, r); ctx.closePath(); ctx.stroke();
        break;
      }
      case 'hole': {
        const act = e.active;
        const pulse = act ? 1 + Math.sin(e.t * (6 + e.fed)) * 0.08 : 1;
        const rr = r * pulse;
        ctx.strokeStyle = act ? PAL[6] : 'rgba(255,80,80,0.75)';
        ctx.lineWidth = act ? 3.4 : 2.4;
        ctx.beginPath(); ctx.arc(0, 0, rr, 0, TAU); ctx.stroke();
        ctx.strokeStyle = act ? PAL[8] : 'rgba(255,140,60,0.5)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, rr * 0.62, 0, TAU); ctx.stroke();
        // spinning dashed halo
        ctx.rotate(e.ang);
        ctx.strokeStyle = act ? 'rgba(255,90,60,0.7)' : 'rgba(255,90,60,0.3)'; ctx.lineWidth = 2;
        for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(0, 0, rr * 1.35, i * TAU / 6, i * TAU / 6 + 0.55); ctx.stroke(); }
        if (act && e.fed > 6) { ctx.strokeStyle = 'rgba(255,255,255,' + (0.3 + 0.3 * Math.sin(e.t * 20)) + ')'; ctx.beginPath(); ctx.arc(0, 0, rr * 0.3, 0, TAU); ctx.stroke(); }
        break;
      }
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  drawParticles(ctx, fx) {
    const { x, y, vx, vy, life, full, col, n } = fx;
    ctx.lineWidth = 2.3;
    for (let c = 0; c < PAL.length; c++) {
      let any = false;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        if (col[i] !== c) continue;
        any = true;
        const k = Math.min(1, life[i] / full[i] * 2.2) * 0.045;
        ctx.moveTo(x[i], y[i]); ctx.lineTo(x[i] - vx[i] * k - 0.5, y[i] - vy[i] * k);
      }
      if (any) { ctx.strokeStyle = PAL[c]; ctx.stroke(); }
    }
  }
  drawRings(ctx, fx) {
    for (const r of fx.rings) {
      const k = r.t / r.dur;
      ctx.globalAlpha = (1 - k) * 0.9;
      ctx.strokeStyle = PAL[r.col]; ctx.lineWidth = r.w * (1 - k * 0.6);
      ctx.beginPath(); ctx.arc(r.x, r.y, Math.max(1, r.r), 0, TAU); ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  drawTexts(ctx, fx) {
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const t of fx.texts) {
      ctx.globalAlpha = Math.min(1, (1 - t.t / t.dur) * 2);
      ctx.font = `700 ${t.size}px Orbitron, 'Trebuchet MS', sans-serif`;
      ctx.fillStyle = t.col; ctx.fillText(t.str, t.x, t.y);
    }
    ctx.globalAlpha = 1;
  }

  // little coloured arrows on the screen edge for nearby enemies you cannot see
  // (matters most on phones, where the camera is closer)
  drawEdgeMarks(ctx, g, s, tx, ty) {
    if (!g.p.alive) return;
    const Wc = this.c.width, Hc = this.c.height, m = 12 * this.dpr;
    let n = 0;
    ctx.globalCompositeOperation = 'lighter';
    for (const e of g.enemies) {
      if (e.dead || n > 40) continue;
      const sx = e.x * s + tx, sy = e.y * s + ty;
      if (sx > -10 && sx < Wc + 10 && sy > -10 && sy < Hc + 10) continue;
      const d = Math.hypot(e.x - g.p.x, e.y - g.p.y);
      if (d > 700) continue;
      n++;
      const cx = Math.min(Math.max(sx, m), Wc - m), cy = Math.min(Math.max(sy, m), Hc - m);
      const a = Math.atan2(sy - cy, sx - cx);
      const k = 1 - d / 700, z = (5 + k * 5) * this.dpr;
      ctx.globalAlpha = 0.25 + k * 0.7;
      ctx.fillStyle = PAL[e.col];
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * z, cy + Math.sin(a) * z);
      ctx.lineTo(cx + Math.cos(a + 2.4) * z, cy + Math.sin(a + 2.4) * z);
      ctx.lineTo(cx + Math.cos(a - 2.4) * z, cy + Math.sin(a - 2.4) * z);
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // desktop aim reticle (the OS cursor is hidden over the arena during play)
  drawReticle(ctx, input, g) {
    const d = this.dpr, x = input.mouse.x * d, y = input.mouse.y * d, r = 11 * d;
    const spin = this.time * 2;
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 2 * d; ctx.strokeStyle = "rgba(255,210,120,0.95)";
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 2 * d; ctx.strokeStyle = "rgba(255,170,60,0.6)";
    for (let i = 0; i < 4; i++) {
      const a = spin + i * Math.PI / 2, c = Math.cos(a), s = Math.sin(a);
      ctx.beginPath(); ctx.moveTo(x + c * r * 1.35, y + s * r * 1.35); ctx.lineTo(x + c * r * 1.9, y + s * r * 1.9); ctx.stroke();
    }
    ctx.fillStyle = "#fff"; ctx.fillRect(x - d, y - d, 2 * d, 2 * d);
    ctx.globalCompositeOperation = "source-over";
  }

  drawSticks(ctx, input) {
    const dpr = this.dpr;
    for (const st of [input.left, input.right]) {
      if (!st.active) continue;
      const R = input.stickR * dpr;
      ctx.beginPath(); ctx.arc(st.ox * dpr, st.oy * dpr, R, 0, TAU);
      ctx.strokeStyle = 'rgba(255,255,255,0.28)'; ctx.lineWidth = 2 * dpr; ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      ctx.beginPath(); ctx.arc((st.ox + st.dx * input.stickR) * dpr, (st.oy + st.dy * input.stickR) * dpr, R * 0.42, 0, TAU);
      ctx.fillStyle = st === input.right ? 'rgba(255,200,90,0.35)' : 'rgba(120,200,255,0.35)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.stroke();
    }
  }
}
