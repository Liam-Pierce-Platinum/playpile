// Canvas 2D renderer at full device pixel ratio. Neon comes from additive
// blending ('lighter') of stacked strokes, never per-frame shadowBlur.
import { H, clamp, lerp, hexToRgb, rgba, mixRgb } from './util.js';
import { Course } from './course.js';
import { ARROWS, byId } from './cosmetics.js';
import { COMBO_TIME } from './game.js';

export const PORTAL_COL = { mini: '#ff6ad5', grav: '#ffe14d', speed: '#5dff9b', mirror: '#ff8a3d' };
const FONT = "'Fredoka', 'Trebuchet MS', system-ui, sans-serif";
const WHITE = [255, 255, 255];
export const HUD_STRIP = 60; // HUD strip height in u-pixels

export class Renderer {
  constructor(canvas) {
    this.cv = canvas;
    this.c = canvas.getContext('2d');
    this.buf = document.createElement('canvas');
    this.bc = this.buf.getContext('2d');
    this.sprites = new Map();
    this.bokeh = Array.from({ length: 22 }, (_, i) => ({ x: Math.random(), y: Math.random(), z: 0.04 + Math.random() * 0.22, r: 18 + Math.random() * 80, a: 0.04 + Math.random() * 0.1, hue: i % 3, ph: Math.random() * 6 }));
    this.mirrorK = 1;
    this.scoreBump = 0; this.lastScore = 0;
    this.trail = [];
    this.tmpObs = [];
    this.deathOverlay = null;
  }
  resize(w, h, dpr) {
    this.W = w; this.H = h; this.dpr = dpr;
    this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr);
    this.buf.width = this.cv.width; this.buf.height = this.cv.height;
    this.portrait = h > w * 1.1;
    let coarse = false; try { coarse = matchMedia('(pointer: coarse)').matches; } catch (e) { /* no matchMedia */ }
    this.u = clamp(Math.min(h / 520, w / 820), coarse ? 1.0 : 0.72, 1.7); // HUD scale (never below 1.0 on touch screens)
    this.narrow = w / this.u < 640;        // phones: one-line corner text, bar beside the pause button
    this.strip = HUD_STRIP * this.u;       // HUD strip above the play area (GD-style letterbox)
    // the outer 14 units top and bottom are always wall, so the strip may cover them
    if (this.portrait) {
      this.s = w / 360;
      this.oy = Math.max(this.strip - 14 * this.s, (h - H * this.s) / 2);
    } else {
      this.s = Math.min((h - this.strip) / (H - 28), w / 470);
      this.oy = this.strip - 14 * this.s + Math.max(0, (h - this.strip - (H - 28) * this.s) / 2);
    }
    this.viewW = w / this.s;
    // static overlays: scanlines + vignette
    const mk = () => { const c = document.createElement('canvas'); c.width = this.cv.width; c.height = this.cv.height; return c; };
    this.scan = mk(); const sc = this.scan.getContext('2d');
    sc.fillStyle = 'rgba(255,255,255,0.022)';
    const step = Math.max(3, Math.round(3 * dpr));
    for (let y = 0; y < this.scan.height; y += step) sc.fillRect(0, y, this.scan.width, Math.max(1, Math.round(dpr * 0.8)));
    this.vign = mk(); const vc = this.vign.getContext('2d');
    const gr = vc.createRadialGradient(this.vign.width / 2, this.vign.height / 2, Math.min(this.vign.width, this.vign.height) * 0.35, this.vign.width / 2, this.vign.height / 2, Math.hypot(this.vign.width, this.vign.height) * 0.6);
    gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.62)');
    vc.fillStyle = gr; vc.fillRect(0, 0, this.vign.width, this.vign.height);
  }
  sprite(col) {
    let s = this.sprites.get(col);
    if (s) return s;
    s = document.createElement('canvas'); s.width = s.height = 64;
    const c = s.getContext('2d'), g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    const rgb = hexToRgb(col);
    g.addColorStop(0, rgba(rgb, 1)); g.addColorStop(0.35, rgba(rgb, 0.45)); g.addColorStop(1, rgba(rgb, 0));
    c.fillStyle = g; c.fillRect(0, 0, 64, 64);
    this.sprites.set(col, s);
    return s;
  }

  // ======================================================================
  draw(st) {
    const { g, fx, look, t } = st;
    const c = this.c, dpr = this.dpr, W = this.W, Hh = this.H, s = this.s;
    const p = g.p, a = st.alpha || 0;
    const px = lerp(p.ox ?? p.x, p.x, a), py = lerp(p.oy ?? p.y, p.y, a);
    const acc = look.accent, accRgb = hexToRgb(acc);
    const mk = p.mirror ? -1 : 1;
    this.mirrorK += (mk - this.mirrorK) * Math.min(1, st.dt * 9);
    if (Math.abs(this.mirrorK) < 0.04) this.mirrorK = Math.sign(this.mirrorK || 1) * 0.04;
    const k = this.mirrorK;
    const anchor = this.portrait ? 0.17 : 0.3;
    const camX = px - this.viewW * anchor;
    const shx = fx.shake ? (Math.random() - 0.5) * fx.shake * 2 : 0, shy = fx.shake ? (Math.random() - 0.5) * fx.shake * 2 : 0;
    const x0 = camX - 40, x1 = camX + this.viewW + 40;

    // ---------------- background (screen space)
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.globalCompositeOperation = 'source-over';
    const bg = c.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, '#1c1050'); bg.addColorStop(0.45, '#0d0830'); bg.addColorStop(1, '#030209');
    c.fillStyle = bg; c.fillRect(0, 0, W, Hh);
    const horizon = this.oy + (H / 2) * s;
    c.globalCompositeOperation = 'lighter';
    const hg = c.createRadialGradient(W / 2, horizon, 0, W / 2, horizon, Math.max(W, Hh) * 0.65);
    hg.addColorStop(0, rgba(accRgb, 0.16)); hg.addColorStop(1, rgba(accRgb, 0));
    c.fillStyle = hg; c.fillRect(0, 0, W, Hh);
    // parallax grids
    for (const [sp, par, al] of [[150, 0.18, 0.05], [75, 0.4, 0.035]]) {
      const step = sp * s, off = -((camX * par * s) % step);
      c.strokeStyle = rgba(accRgb, al); c.lineWidth = 1;
      c.beginPath();
      for (let x = off; x < W; x += step) { const sx = W / 2 + (x - W / 2) * k; c.moveTo(sx, 0); c.lineTo(sx, Hh); }
      for (let y = (horizon % step) - step; y < Hh; y += step) { c.moveTo(0, y); c.lineTo(W, y); }
      c.stroke();
    }
    // bokeh
    for (const b of this.bokeh) {
      const bx = ((b.x * W - camX * s * b.z) % (W + 200) + W + 200) % (W + 200) - 100;
      const by = ((b.y * Hh - t * 8 * b.z * 10) % (Hh + 200) + Hh + 200) % (Hh + 200) - 100;
      const col = b.hue === 0 ? acc : b.hue === 1 ? '#ffffff' : '#7b5cff';
      c.globalAlpha = b.a * (0.75 + 0.25 * Math.sin(t * 0.7 + b.ph));
      const r = b.r * this.u;
      c.drawImage(this.sprite(col), W / 2 + (bx - W / 2) * k - r, by - r, r * 2, r * 2);
    }
    c.globalAlpha = 1;
    // music waveform along the horizon (nothing vertical inside the tunnel)
    const bands = st.bands || [];
    if (bands.length) {
      const n = bands.length;
      for (const [amp, al] of [[9, 0.28], [16, 0.09]]) {
        c.strokeStyle = rgba(accRgb, al); c.lineWidth = 1.2; c.lineJoin = 'round';
        c.beginPath();
        for (let i = 0; i <= n; i++) {
          const v = bands[(i * 7) % n] || 0, x = (i / n) * W, y = horizon + (i % 2 ? 1 : -1) * v * v * amp * s;
          i ? c.lineTo(x, y) : c.moveTo(x, y);
        }
        c.stroke();
      }
    }
    // horizon line
    c.fillStyle = rgba(accRgb, 0.22); c.fillRect(0, horizon - 0.5, W, 1);
    c.globalCompositeOperation = 'source-over';

    // ---------------- world
    const e = W / 2 - camX * s * k - (k * W) / 2 + shx;
    // beat pulse: a tiny zoom around the arrow on every kick
    const kick = st.beatPulse || 0, z = fx.reduced ? 0 : 0.011 * kick;
    const pvx = W / 2 + (anchor * W - W / 2) * k, pvy = horizon;
    const wt = () => c.setTransform(dpr * s * k * (1 + z), 0, 0, dpr * s * (1 + z), dpr * (e * (1 + z) - pvx * z), dpr * ((this.oy + shy) * (1 + z) - pvy * z));
    this.kick = kick;
    wt();
    const ppx = 1 / s; // world units per css pixel
    const course = g.course;

    // attempt label, GD style
    if (st.attemptLabel && g.startX < x1) {
      c.save(); c.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 + ((g.startX + 210 - camX) * s - W / 2) * k + shx), dpr * (this.oy + shy));
      c.font = `600 34px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillText(st.attemptLabel, 0, H / 2 - 4);
      c.restore(); wt();
    }

    // best marker
    if (st.bestX && st.bestX > x0 && st.bestX < x1) {
      c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2 * ppx; c.setLineDash([8 * ppx, 8 * ppx]);
      c.beginPath(); c.moveTo(st.bestX, 0); c.lineTo(st.bestX, H); c.stroke(); c.setLineDash([]);
      c.save(); c.setTransform(dpr, 0, 0, dpr, dpr * (W / 2 + ((st.bestX - camX) * s - W / 2) * k + shx), dpr * (this.oy + shy + (H / 2 - 150) * s));
      c.font = `700 ${12 * this.u}px ${FONT}`; c.textAlign = 'center'; c.fillStyle = 'rgba(255,255,255,0.7)'; c.fillText('BEST', 0, 0);
      c.restore(); wt();
    }

    // practice checkpoints
    if (g.practice) {
      for (const ck of course.checks) {
        if (ck.x < x0 || ck.x > x1 || ck.x === 0) continue;
        const on = ck.x <= g.checkX;
        this.diamond(c, ck.x, ck.y, 9, on ? '#5dff9b' : 'rgba(93,255,155,0.35)', ppx);
      }
    }

    // walls (with the graze band drawn just inside every edge)
    this.walls(c, course, x0, x1, accRgb, ppx, t, g.hitR + g.band);
    // obstacles
    const obs = course.obsInRange(x0 - 80, x1 + 80, this.tmpObs);
    for (const o of obs) { if (o.type === 'spike') this.spike(c, o, accRgb, ppx); }
    for (const o of obs) { if (o.type === 'saw') this.saw(c, o, accRgb, ppx, t); }
    // portals
    for (const pt of course.portals) if (pt.x > x0 - 60 && pt.x < x1 + 60) this.portal(c, pt, ppx, t);
    // finish gate
    if (course.finishX > x0 && course.finishX < x1) this.finishGate(c, course.finishX, ppx, t);

    // teach hold icon
    if (st.holdHint > 0 && p.alive) this.holdHint(c, course, px, py, st.holdHint, accRgb, ppx, t, g);

    // ghost
    if (st.ghost && p.alive) {
      const gy = g.ghostY(px);
      if (gy != null) {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = 'rgba(255,255,255,0.2)'; c.lineWidth = 3 * ppx; c.beginPath();
        for (let x = px - 240; x <= px; x += 8) { const y = g.ghostY(x); if (y == null) continue; x === px - 240 ? c.moveTo(x, y) : c.lineTo(x, y); }
        c.stroke();
        const gy2 = g.ghostY(px - 4) ?? gy;
        this.arrow(c, px, gy, Math.atan2(gy - gy2, 4), p.mini ? 8 : 13, look.arrow, 'rgba(255,255,255,0.32)', 'rgba(255,255,255,0.12)', 0, ppx);
        c.globalCompositeOperation = 'source-over';
      }
    }

    // trail + player
    const tcol = mixRgb(accRgb, WHITE, clamp((g.mult - 1) / 7, 0, 1));
    this.drawTrail(c, st.trail, tcol, look.trail, ppx, t, st.beat || 0);
    if (p.alive) {
      const m = p.mini ? 2 : 1;
      const ang = p.glide ? 0 : Math.atan2(p.up ? -m : m, 1);
      const sz = p.mini ? 8 : 13;
      // glow
      c.globalCompositeOperation = 'lighter';
      const gr = 34 * (p.mini ? 0.7 : 1) * (1 + (g.meter >= 1 ? 0.25 * Math.sin(t * 12) + 0.3 : 0));
      c.globalAlpha = 0.55; c.drawImage(this.sprite(g.meter >= 1 ? '#ffffff' : acc), px - gr, py - gr, gr * 2, gr * 2); c.globalAlpha = 1;
      c.globalCompositeOperation = 'source-over';
      const sq = fx.squash;
      const coreCol = p.grav < 0 ? PORTAL_COL.grav : acc;
      if (g.phasing) {
        c.globalCompositeOperation = 'lighter';
        this.arrow(c, px - 4, py, ang, sz, look.arrow, 'rgba(255,40,90,0.6)', null, sq, ppx);
        this.arrow(c, px + 4, py, ang, sz, look.arrow, 'rgba(40,220,255,0.6)', null, sq, ppx);
        c.globalCompositeOperation = 'source-over';
        this.arrow(c, px, py, ang, sz, look.arrow, 'rgba(255,255,255,0.75)', coreCol, sq, ppx);
      } else {
        this.arrow(c, px, py, ang, sz, look.arrow, '#ffffff', coreCol, sq, ppx);
      }
      if (g.meter >= 1 && !g.phasing) {
        c.globalCompositeOperation = 'lighter';
        c.strokeStyle = rgba(WHITE, 0.35 + 0.3 * Math.sin(t * 14)); c.lineWidth = 2 * ppx;
        c.beginPath(); c.arc(px, py, sz * 1.7 + 3 * Math.sin(t * 8), 0, Math.PI * 2); c.stroke();
        c.globalCompositeOperation = 'source-over';
      }
    }

    // particles
    c.globalCompositeOperation = 'lighter';
    for (const q of fx.parts) {
      const life = q.life / q.max;
      c.globalAlpha = Math.min(1, life * 1.6);
      if (q.type === 'spark') {
        const sp = Math.hypot(q.vx, q.vy) || 1;
        const L = Math.min(q.len * 2.4, sp * 0.03 + 2);
        c.strokeStyle = q.col; c.lineWidth = q.size * ppx * 1.2;
        c.beginPath(); c.moveTo(q.x, q.y); c.lineTo(q.x - (q.vx / sp) * L, q.y - (q.vy / sp) * L); c.stroke();
      } else if (q.type === 'frag') {
        c.strokeStyle = q.col; c.lineWidth = q.size * ppx; c.lineCap = 'round';
        const ca = Math.cos(q.rot) * q.len, sa = Math.sin(q.rot) * q.len;
        c.beginPath(); c.moveTo(q.x - ca, q.y - sa); c.lineTo(q.x + ca, q.y + sa); c.stroke(); c.lineCap = 'butt';
      } else if (q.type === 'sq') {
        c.fillStyle = q.col; const z = q.size * 1.4; c.fillRect(q.x - z / 2, q.y - z / 2, z, z);
      } else if (q.type === 'slice') {
        c.fillStyle = q.col; c.globalAlpha *= 0.5; c.fillRect(q.x - q.len / 2, q.y, q.len, q.size);
      } else {
        const z = q.size * 2.2;
        c.drawImage(this.sprite(q.col.startsWith('#') ? q.col : '#ffffff'), q.x - z * 2, q.y - z * 2, z * 4, z * 4);
      }
    }
    c.globalAlpha = 1;
    // shock rings (chromatic = split into R, G, B)
    for (const r of fx.rings) {
      const u = r.t / r.max, rad = r.r1 * (1 - Math.pow(1 - u, 3)), al = (1 - u);
      c.lineWidth = r.width * (1 - u * 0.7) * ppx * 1.5;
      if (r.chroma) {
        const cols = ['rgba(255,40,80,', 'rgba(60,255,120,', 'rgba(60,120,255,'];
        cols.forEach((cc, i) => { c.strokeStyle = cc + al + ')'; c.beginPath(); c.arc(r.x + (i - 1) * 5 * u * 3, r.y, rad * (1 + (i - 1) * 0.04), 0, Math.PI * 2); c.stroke(); });
      } else {
        c.strokeStyle = r.col; c.globalAlpha = al; c.beginPath(); c.arc(r.x, r.y, rad, 0, Math.PI * 2); c.stroke(); c.globalAlpha = 1;
      }
    }
    c.globalCompositeOperation = 'source-over';

    // popups (world positioned, screen sized)
    for (const q of fx.pops) {
      const sx = W / 2 + ((q.x - camX) * s - W / 2) * k + shx, sy = this.oy + q.y * s + shy;
      const u = 1 - q.life / q.max;
      const sc = u < 0.12 ? 0.6 + (u / 0.12) * 0.6 : 1.2 - Math.min(0.2, (u - 0.12) * 1.2);
      c.setTransform(dpr * sc, 0, 0, dpr * sc, dpr * sx, dpr * sy);
      c.globalAlpha = Math.min(1, (q.life / q.max) * 2.2);
      c.font = `700 ${q.size * this.u}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.lineWidth = 4 * this.u; c.strokeStyle = 'rgba(8,4,24,0.85)'; c.strokeText(q.text, 0, 0);
      c.fillStyle = q.col; c.fillText(q.text, 0, 0);
    }
    c.globalAlpha = 1;

    // ---------------- post
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (fx.blur > 0) {
      const sx = (W / 2 + ((px - camX) * s - W / 2) * k) * dpr, sy = (this.oy + py * s) * dpr;
      this.bc.setTransform(1, 0, 0, 1, 0, 0);
      this.bc.clearRect(0, 0, this.buf.width, this.buf.height);
      this.bc.drawImage(this.cv, 0, 0);
      const amt = fx.blur / 0.42;
      c.globalCompositeOperation = 'lighter';
      for (let i = 1; i <= 3; i++) {
        const z = 1 + 0.035 * i * amt;
        c.globalAlpha = 0.16 * amt;
        c.drawImage(this.buf, sx - sx * z, sy - sy * z, this.buf.width * z, this.buf.height * z);
      }
      if (fx.chroma > 0) {
        c.globalAlpha = 0.18 * fx.chroma;
        c.drawImage(this.buf, -7 * dpr * fx.chroma, 0); c.drawImage(this.buf, 7 * dpr * fx.chroma, 0);
      }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }
    c.drawImage(this.scan, 0, 0);
    c.drawImage(this.vign, 0, 0);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (fx.vig > 0) {
      const vg = c.createRadialGradient(W / 2, Hh / 2, Math.min(W, Hh) * 0.3, W / 2, Hh / 2, Math.hypot(W, Hh) * 0.6);
      vg.addColorStop(0, rgba(accRgb, 0)); vg.addColorStop(1, rgba(accRgb, 0.45 * fx.vig));
      c.globalCompositeOperation = 'lighter'; c.fillStyle = vg; c.fillRect(0, 0, W, Hh); c.globalCompositeOperation = 'source-over';
    }
    if (fx.flash > 0) { c.fillStyle = `rgba(${fx.flashCol},${fx.flash * 0.45})`; c.fillRect(0, 0, W, Hh); }

    if (st.hud) {
      this.hud(c, st, accRgb);
      for (const b of fx.banners) this.banner(c, b);
    }
  }

  // ---------------------------------------------------------------- walls
  walls(c, course, x0, x1, accRgb, ppx, t, bandIn) {
    for (const ceil of [true, false]) {
      const xs = ceil ? course.cx : course.fx, ys = ceil ? course.cy : course.fy;
      if (!xs.length) continue;
      let i0 = Math.max(0, Course.idx(xs, x0) - 1), i1 = Math.min(xs.length - 1, Course.idx(xs, x1) + 2);
      if (i1 <= i0) continue;
      const far = ceil ? -2400 : H + 2400;
      const shape = () => {
        c.beginPath(); c.moveTo(Math.min(x0, xs[i0]), far); c.lineTo(Math.min(x0, xs[i0]), ys[i0]);
        for (let i = i0; i <= i1; i++) c.lineTo(xs[i], ys[i]);
        c.lineTo(xs[i1], far); c.closePath();
      };
      const edge = (dy = 0) => { c.beginPath(); c.moveTo(Math.min(x0, xs[i0]), ys[i0] + dy); for (let i = i0; i <= i1; i++) c.lineTo(xs[i], ys[i] + dy); };
      // body
      const gr = c.createLinearGradient(0, ceil ? 0 : H, 0, H / 2);
      gr.addColorStop(0, '#05030f'); gr.addColorStop(1, rgba(mixRgb([10, 6, 30], accRgb, 0.22), 1));
      shape(); c.fillStyle = gr; c.fill();
      // hatch + inner outline, clipped to the wall
      c.save(); shape(); c.clip();
      c.strokeStyle = rgba(accRgb, 0.1); c.lineWidth = 1.5 * ppx; c.beginPath();
      const hx0 = Math.floor(xs[i0] / 26) * 26;
      for (let x = hx0 - 1300; x < xs[i1] + 10; x += 26) { c.moveTo(x, ceil ? -900 : H + 900); c.lineTo(x + 1350, ceil ? 450 : -900); }
      c.stroke();
      c.lineJoin = 'round';
      edge(); c.strokeStyle = rgba(accRgb, 0.10); c.lineWidth = 46 * ppx; c.stroke(); c.lineWidth = 20 * ppx; c.stroke();
      c.strokeStyle = rgba(accRgb, 0.2); c.lineWidth = 1.5 * ppx; edge(ceil ? -9 : 9); c.stroke();
      c.strokeStyle = rgba(accRgb, 0.07); edge(ceil ? -20 : 20); c.stroke();
      c.restore();
      // neon edge
      c.globalCompositeOperation = 'lighter'; c.lineJoin = 'round';
      edge(); c.strokeStyle = rgba(accRgb, 0.07); c.lineWidth = 14 * ppx; c.stroke();
      c.strokeStyle = rgba(accRgb, 0.16); c.lineWidth = 6 * ppx; c.stroke();
      c.strokeStyle = rgba(accRgb, 0.95); c.lineWidth = 2.2 * ppx; c.stroke();
      if (this.kick > 0.05) { c.strokeStyle = rgba(accRgb, 0.22 * this.kick); c.lineWidth = 9 * ppx; c.stroke(); }
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 0.9 * ppx; c.stroke();
      // graze band: a faint tinted strip inside the edge, bounded by a dashed line
      if (bandIn) {
        const dy = ceil ? bandIn : -bandIn;
        c.strokeStyle = rgba(accRgb, 0.05); c.lineWidth = bandIn; edge(dy / 2); c.stroke();
        c.strokeStyle = rgba(accRgb, 0.16); c.lineWidth = 1 * ppx; c.setLineDash([5 * ppx, 7 * ppx]); edge(dy); c.stroke(); c.setLineDash([]);
      }
      // corner sparks
      c.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = i0 + 1; i < i1; i++) {
        const turn = (ys[i] - ys[i - 1]) * (ys[i + 1] - ys[i]) < 0 || xs[i] === xs[i - 1] || xs[i] === xs[i + 1];
        if (turn) c.fillRect(xs[i] - 1.5 * ppx, ys[i] - 1.5 * ppx, 3 * ppx, 3 * ppx);
      }
      c.globalCompositeOperation = 'source-over';
    }
  }
  spike(c, o, accRgb, ppx) {
    const p = o.pts;
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.lineTo(p[4], p[5]); c.closePath();
    c.fillStyle = rgba(mixRgb([8, 5, 24], accRgb, 0.16), 1); c.fill();
    c.globalCompositeOperation = 'lighter';
    c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[2], p[3]); c.lineTo(p[4], p[5]);
    c.lineJoin = 'miter';
    c.strokeStyle = rgba(accRgb, 0.14); c.lineWidth = 7 * ppx; c.stroke();
    c.strokeStyle = rgba(accRgb, 0.95); c.lineWidth = 2 * ppx; c.stroke();
    c.strokeStyle = 'rgba(255,255,255,0.4)'; c.lineWidth = 0.8 * ppx; c.stroke();
    // inner chevron
    const mx = (p[0] + p[4]) / 2, my = (p[1] + p[5]) / 2;
    c.strokeStyle = rgba(accRgb, 0.25); c.lineWidth = 1.2 * ppx; c.beginPath();
    c.moveTo(lerp(p[0], p[2], 0.45) + (mx - p[0]) * 0.2, lerp(p[1], p[3], 0.45)); c.lineTo(lerp(mx, p[2], 0.2), lerp(my, p[3], 0.2) ); c.lineTo(lerp(p[4], p[2], 0.45) + (mx - p[4]) * 0.2, lerp(p[5], p[3], 0.45)); c.stroke();
    c.drawImage(this.sprite('#ffffff'), o.tip[0] - 7, o.tip[1] - 7, 14, 14);
    c.globalCompositeOperation = 'source-over';
  }
  saw(c, o, accRgb, ppx, t) {
    const n = Math.max(8, Math.round(o.r / 4)), rot = t * 5 * o.spin;
    c.save(); c.translate(o.x, o.y); c.rotate(rot);
    c.beginPath();
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2, a1 = ((i + 0.55) / n) * Math.PI * 2;
      c.lineTo(Math.cos(a0) * o.r * 0.84, Math.sin(a0) * o.r * 0.84);
      c.lineTo(Math.cos(a1) * o.r, Math.sin(a1) * o.r);
    }
    c.closePath();
    c.fillStyle = rgba(mixRgb([8, 5, 24], accRgb, 0.2), 1); c.fill();
    c.globalCompositeOperation = 'lighter';
    c.strokeStyle = rgba(accRgb, 0.14); c.lineWidth = 7 * ppx; c.stroke();
    c.strokeStyle = rgba(accRgb, 0.95); c.lineWidth = 2 * ppx; c.stroke();
    c.strokeStyle = rgba(accRgb, 0.45); c.lineWidth = 1.5 * ppx;
    c.beginPath(); c.arc(0, 0, o.r * 0.55, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 3; i++) { const a = (i / 3) * Math.PI * 2; c.beginPath(); c.moveTo(Math.cos(a) * o.r * 0.18, Math.sin(a) * o.r * 0.18); c.lineTo(Math.cos(a) * o.r * 0.55, Math.sin(a) * o.r * 0.55); c.stroke(); }
    c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.arc(0, 0, o.r * 0.12, 0, Math.PI * 2); c.fill();
    c.restore();
    c.globalCompositeOperation = 'source-over';
  }
  portal(c, pt, ppx, t) {
    const col = pt.on ? PORTAL_COL[pt.kind] : '#a9b8ff', rgb = hexToRgb(col);
    const y = pt.y, hh = 66, ww = 20;
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = rgba(rgb, 0.08); c.beginPath(); c.ellipse(pt.x, y, ww, hh, 0, 0, Math.PI * 2); c.fill();
    for (const [w, a] of [[12, 0.12], [5, 0.3], [2.2, 1]]) {
      c.strokeStyle = rgba(rgb, a); c.lineWidth = w * ppx;
      c.beginPath(); c.ellipse(pt.x, y, ww, hh, 0, 0, Math.PI * 2); c.stroke();
    }
    // flowing streaks
    c.strokeStyle = rgba(rgb, 0.5); c.lineWidth = 1.5 * ppx;
    for (let i = 0; i < 4; i++) {
      const u = ((t * 0.9 + i / 4) % 1);
      c.beginPath(); c.ellipse(pt.x, y, ww * (1 - u) + 2, hh * (1 - u * 0.6), 0, 0, Math.PI * 2); c.globalAlpha = u; c.stroke();
    }
    c.globalAlpha = 1;
    // glyph
    c.strokeStyle = '#ffffff'; c.lineWidth = 2.4 * ppx; c.lineCap = 'round'; c.lineJoin = 'round';
    const gx = pt.x, gy = y;
    c.fillStyle = 'rgba(10,6,30,0.75)'; c.beginPath(); c.arc(gx, gy, 15, 0, Math.PI * 2); c.fill();
    c.beginPath();
    if (pt.kind === 'speed') { for (const o of [-5, 3]) { c.moveTo(gx + o - 4, gy - 7); c.lineTo(gx + o + 3, gy); c.lineTo(gx + o - 4, gy + 7); } }
    else if (pt.kind === 'grav') { c.moveTo(gx - 6, gy - 2); c.lineTo(gx, gy - 9); c.lineTo(gx + 6, gy - 2); c.moveTo(gx - 6, gy + 2); c.lineTo(gx, gy + 9); c.lineTo(gx + 6, gy + 2); }
    else if (pt.kind === 'mini') { if (pt.on) { c.moveTo(gx - 8, gy - 8); c.lineTo(gx - 2, gy - 2); c.moveTo(gx + 8, gy + 8); c.lineTo(gx + 2, gy + 2); c.moveTo(gx - 2, gy - 6); c.lineTo(gx - 2, gy - 2); c.lineTo(gx - 6, gy - 2); } else { c.moveTo(gx - 2, gy - 2); c.lineTo(gx - 8, gy - 8); c.moveTo(gx + 2, gy + 2); c.lineTo(gx + 8, gy + 8); } }
    else if (pt.kind === 'mirror') { c.moveTo(gx - 10, gy); c.lineTo(gx + 10, gy); c.moveTo(gx - 5, gy - 5); c.lineTo(gx - 10, gy); c.lineTo(gx - 5, gy + 5); c.moveTo(gx + 5, gy - 5); c.lineTo(gx + 10, gy); c.lineTo(gx + 5, gy + 5); }
    c.stroke(); c.lineCap = 'butt';
    if (!pt.on) { c.strokeStyle = rgba(rgb, 0.9); c.beginPath(); c.moveTo(gx - 11, gy + 11); c.lineTo(gx + 11, gy - 11); c.stroke(); }
    c.globalCompositeOperation = 'source-over';
  }
  finishGate(c, x, ppx, t) {
    const sz = 15;
    for (let y = 0, r = 0; y < H; y += sz, r++) {
      for (let col = 0; col < 2; col++) {
        c.fillStyle = (r + col) % 2 ? 'rgba(255,255,255,0.85)' : 'rgba(10,8,30,0.85)';
        c.fillRect(x + col * sz, y, sz, sz);
      }
    }
    c.globalCompositeOperation = 'lighter';
    const g = c.createLinearGradient(x - 120, 0, x, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, `rgba(255,255,255,${0.12 + 0.05 * Math.sin(t * 6)})`);
    c.fillStyle = g; c.fillRect(x - 120, 0, 120, H);
    c.globalCompositeOperation = 'source-over';
  }
  diamond(c, x, y, r, col, ppx) {
    c.fillStyle = col; c.beginPath(); c.moveTo(x, y - r); c.lineTo(x + r * 0.7, y); c.lineTo(x, y + r); c.lineTo(x - r * 0.7, y); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1.2 * ppx; c.stroke();
  }
  holdHint(c, course, px, py, alpha, accRgb, ppx, t, g) {
    // a button icon that is pressed (filled, arrow up) when the safe line ahead climbs
    const ahead = course.pathY(px + 60), up = ahead < py - 2;
    const wantHold = g.p.grav > 0 ? up : !up;
    const x = px + 150, y = H / 2 + (py < H / 2 ? 85 : -85);
    const pulse = 0.5 + 0.5 * Math.sin(t * 8);
    c.globalAlpha = alpha;
    c.globalCompositeOperation = 'lighter';
    c.lineWidth = 3 * ppx;
    c.strokeStyle = rgba(accRgb, 0.9);
    c.fillStyle = wantHold ? rgba(accRgb, 0.35 + 0.25 * pulse) : 'rgba(255,255,255,0.03)';
    c.beginPath(); c.arc(x, y, 30, 0, Math.PI * 2); c.fill(); c.stroke();
    c.beginPath(); c.arc(x, y, 30 + (wantHold ? 10 * pulse : 4), 0, Math.PI * 2); c.strokeStyle = rgba(accRgb, 0.25); c.stroke();
    // finger dot + arrow
    c.strokeStyle = '#ffffff'; c.lineWidth = 3.5 * ppx; c.lineCap = 'round'; c.lineJoin = 'round';
    c.beginPath();
    const d = wantHold ? 1 : -1;
    c.moveTo(x, y + 12 * d); c.lineTo(x, y - 10 * d); c.moveTo(x - 9, y - 1 * d); c.lineTo(x, y - 11 * d); c.lineTo(x + 9, y - 1 * d);
    c.stroke(); c.lineCap = 'butt';
    c.globalCompositeOperation = 'source-over'; c.globalAlpha = 1;
  }

  arrow(c, x, y, ang, sz, shapeId, body, core, sq, ppx) {
    const pts = byId(ARROWS, shapeId).pts;
    c.save(); c.translate(x, y); c.rotate(ang); c.scale(sz * (1 - 0.32 * sq), sz * (1 + 0.3 * sq));
    c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath();
    c.fillStyle = body; c.fill();
    if (core) {
      c.scale(0.5, 0.5); c.translate(-0.15, 0);
      c.beginPath(); pts.forEach(([a, b], i) => (i ? c.lineTo(a, b) : c.moveTo(a, b))); c.closePath();
      c.fillStyle = core; c.fill();
    }
    c.restore();
  }

  drawTrail(c, tr, rgb, style, ppx, t, beat) {
    if (!tr || tr.length < 3) return;
    const n = tr.length;
    c.globalCompositeOperation = 'lighter';
    c.lineJoin = 'round'; c.lineCap = 'round';
    if (style === 'twin') {
      for (const side of [-1, 1]) {
        c.beginPath();
        for (let i = 0; i < n; i++) {
          const [x, y] = tr[i], [x2, y2] = tr[Math.min(n - 1, i + 1)];
          const dx = x2 - x, dy = y2 - y, l = Math.hypot(dx, dy) || 1;
          const off = 6 * (i / n);
          const qx = x - (dy / l) * off * side, qy = y + (dx / l) * off * side;
          i ? c.lineTo(qx, qy) : c.moveTo(qx, qy);
        }
        c.strokeStyle = rgba(rgb, 0.75); c.lineWidth = 2 * ppx; c.stroke();
      }
    } else if (style === 'dashes') {
      for (let i = 1; i < n; i++) {
        if (Math.floor(i / 3) % 2) continue;
        c.strokeStyle = rgba(rgb, 0.2 + 0.8 * (i / n)); c.lineWidth = (2 + 5 * (i / n)) * ppx;
        c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke();
      }
    } else if (style === 'prism') {
      for (let i = 1; i < n; i++) {
        c.strokeStyle = `hsla(${(i * 9 + t * 200) % 360},100%,65%,${0.15 + 0.85 * (i / n)})`; c.lineWidth = (1 + 7 * (i / n)) * ppx;
        c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke();
      }
    } else {
      // ribbon (also comet + pulse): tapered segments, glow pass then core
      const puls = style === 'pulse' ? 1 + 0.6 * Math.max(0, Math.cos(beat * Math.PI * 2)) : 1;
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < n; i++) {
          const u = i / n;
          c.strokeStyle = pass ? rgba(mixRgb(rgb, WHITE, 0.6), 0.9 * u) : rgba(rgb, 0.22 * u);
          c.lineWidth = (pass ? 0.6 + 2.6 * u : 2 + 11 * u * puls) * ppx * (pass ? 1 : 1);
          c.beginPath(); c.moveTo(tr[i - 1][0], tr[i - 1][1]); c.lineTo(tr[i][0], tr[i][1]); c.stroke();
        }
      }
    }
    c.lineCap = 'butt';
    c.globalCompositeOperation = 'source-over';
  }

  // ---------------------------------------------------------------- HUD
  hud(c, st, accRgb) {
    const { g, fx } = st, W = this.W, Hh = this.H, u = this.u;
    if (g.score !== this.lastScore) { this.scoreBump = 1; this.lastScore = g.score; }
    this.scoreBump = Math.max(0, this.scoreBump - st.dt * 5);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const showScore = !(g.mode !== 'run' && g.practice);
    const narrow = this.narrow, strip = this.strip, finite = g.course.length < Infinity;
    // the strip sits over the outer wall band; a soft darkening keeps text on dark
    const sg = c.createLinearGradient(0, 0, 0, strip * 1.3);
    sg.addColorStop(0, 'rgba(4,2,14,0.75)'); sg.addColorStop(1, 'rgba(4,2,14,0)');
    c.fillStyle = sg; c.fillRect(0, 0, W, strip * 1.3);
    // corner info: two lines on the right (wide) or one line along the strip's bottom (phones)
    const lines = st.corner || [];
    c.font = `600 ${(narrow ? 11 : 13) * u}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.75)';
    let cornerW = 0;
    if (narrow) { c.textAlign = 'center'; c.fillText(lines.join('  ·  '), W / 2, strip - 6 * u); }
    else { c.textAlign = 'right'; lines.forEach((l, i) => { cornerW = Math.max(cornerW, c.measureText(l).width); c.fillText(l, W - 16 * u, 20 * u + i * 19 * u); }); }
    c.textAlign = 'center';
    // progress bar (levels + daily): never runs into the corner column
    if (finite) {
      const by = 9 * u, bh = 5 * u;
      c.font = `700 ${12 * u}px ${FONT}`;
      const pct = Math.floor(g.progress * 100) + '%', pctW = c.measureText('100%').width;
      let bx, bw;
      if (narrow) { bx = 58 * u; bw = W - 16 * u - pctW - 8 * u - bx; }
      else { bw = Math.min(W * 0.4, 380 * u, W - 2 * (cornerW + 16 * u) - 2 * (pctW + 24 * u)); bx = (W - bw) / 2; }
      c.fillStyle = 'rgba(255,255,255,0.14)'; this.rr(c, bx, by, bw, bh, bh / 2); c.fill();
      c.fillStyle = rgba(accRgb, 1); this.rr(c, bx, by, Math.max(bh, bw * g.progress), bh, bh / 2); c.fill();
      if (st.bestProg) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(bx + bw * st.bestProg - 1, by - 3 * u, 2, bh + 6 * u); }
      c.textAlign = 'left'; c.fillStyle = '#fff'; c.fillText(pct, bx + bw + 8 * u, by + bh / 2 + 0.5);
      c.textAlign = 'center';
    }
    const mid = finite ? 36 * u : 31 * u; // score line
    const banner = fx.banners.length > 0; // the tier / multiplier banner takes the score's slot
    if (showScore && !banner) {
      const sc = 1 + this.scoreBump * 0.12;
      const fs = (narrow ? 30 : 34) * u;
      c.font = `700 ${fs}px ${FONT}`;
      const txt = g.score.toLocaleString('en-US');
      const sw = c.measureText(txt).width;
      const live = g.combo > 0;
      const pw = (live ? 78 : 50) * u, ph = 21 * u, gap = 10 * u;
      const x0 = W / 2 - (sw + gap + pw) / 2;
      // dark backing pill: saws buried in the ceiling and tall walls never show through the score
      const bh = fs * 1.15, bpad = 12 * u;
      c.fillStyle = 'rgba(6,3,20,0.62)'; this.rr(c, x0 - bpad, mid - bh / 2, sw + gap + pw + bpad * 2, bh, bh / 2); c.fill();
      c.save(); c.translate(x0 + sw / 2, mid); c.scale(sc, sc);
      c.globalCompositeOperation = 'lighter';
      c.lineWidth = 8 * u; c.strokeStyle = rgba(accRgb, 0.18); c.strokeText(txt, 0, 0);
      c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#ffffff'; c.fillText(txt, 0, 0);
      c.restore();
      // multiplier pill with combo timer
      const pxl = x0 + sw + gap, pyl = mid - ph / 2 + 1 * u;
      c.fillStyle = live ? rgba(accRgb, 0.22) : 'rgba(255,255,255,0.07)';
      this.rr(c, pxl, pyl, pw, ph, ph / 2); c.fill();
      if (live) {
        const left = clamp(1 - (g.t - g.lastGrazeT) / COMBO_TIME, 0, 1);
        c.save(); this.rr(c, pxl, pyl, pw, ph, ph / 2); c.clip();
        c.fillStyle = rgba(accRgb, 0.55); c.fillRect(pxl, pyl + ph - 3 * u, pw * left, 3 * u); c.restore();
        c.strokeStyle = rgba(accRgb, 0.9); c.lineWidth = 1.5 * u; this.rr(c, pxl, pyl, pw, ph, ph / 2); c.stroke();
      }
      c.font = `700 ${13 * u}px ${FONT}`; c.fillStyle = live ? '#fff' : 'rgba(255,255,255,0.45)';
      c.fillText('x' + g.mult + (live ? ' · ' + g.combo : ''), pxl + pw / 2, pyl + ph / 2 + 1);
    } else if (!showScore && !banner) {
      c.font = `700 ${16 * u}px ${FONT}`; c.fillStyle = '#5dff9b'; c.fillText('PRACTICE', W / 2, mid);
    }

    // phase meter along the bottom edge
    const mh = 6 * u, my = Hh - mh;
    c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(0, my, W, mh);
    const full = g.meter >= 1;
    const mw = W * (g.phasing ? Math.max(0, g.phaseLeft / 0.6) : g.meter);
    c.globalCompositeOperation = 'lighter';
    const mg = c.createLinearGradient(0, 0, W, 0);
    mg.addColorStop(0, rgba(accRgb, 0.5)); mg.addColorStop(1, full ? 'rgba(255,255,255,1)' : rgba(accRgb, 1));
    c.fillStyle = mg; c.fillRect(0, my, mw, mh);
    c.fillStyle = rgba(accRgb, 0.25); c.fillRect(0, my - 10 * u, mw, 10 * u);
    if (mw > 2) c.drawImage(this.sprite('#ffffff'), mw - 14 * u, my - 11 * u, 28 * u, 28 * u);
    for (let i = 1; i < 10; i++) { c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect((W * i) / 10 - 1, my, 2, mh); }
    c.globalCompositeOperation = 'source-over';
    if (full) {
      const pul = 0.6 + 0.4 * Math.sin(fx.readyPulse * 10);
      c.font = `700 ${14 * u}px ${FONT}`; c.textAlign = 'left'; c.fillStyle = `rgba(255,255,255,${pul})`;
      c.fillText('PHASE READY', 14 * u, my - 16 * u); c.textAlign = 'center';
      c.globalCompositeOperation = 'lighter'; c.fillStyle = `rgba(255,255,255,${0.12 * pul})`; c.fillRect(0, my - 26 * u, W, 26 * u); c.globalCompositeOperation = 'source-over';
    }

    // death overlay
    if (!g.p.alive && st.death) {
      const d = st.death, k = clamp(d.t / 0.18, 0, 1), e = 1 + (1 - k) * 0.5;
      c.save(); c.translate(W / 2, Hh / 2 - 10 * u); c.scale(e, e); c.globalAlpha = k;
      c.font = `700 ${56 * u}px ${FONT}`;
      c.globalCompositeOperation = 'lighter'; c.lineWidth = 10 * u; c.strokeStyle = rgba(accRgb, 0.25); c.strokeText(d.big, 0, 0); c.globalCompositeOperation = 'source-over';
      c.fillStyle = '#fff'; c.fillText(d.big, 0, 0);
      c.font = `700 ${18 * u}px ${FONT}`; c.fillStyle = d.record ? '#ffe14d' : 'rgba(255,255,255,0.8)';
      c.fillText(d.sub, 0, 44 * u);
      c.restore();
      c.font = `600 ${12 * u}px ${FONT}`; c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillText('TAP TO RETRY', W / 2, Hh / 2 + 70 * u);
    }
  }
  // Banners ("SPEED UP · TIER 2", "x5 MULTIPLIER", "PHASE READY") flash in
  // the HUD strip where the score sits, inside a dark pill: the arena is never covered.
  banner(c, b) {
    const W = this.W, u = this.u;
    const inn = clamp(b.t / 0.12, 0, 1), out = clamp((b.max - b.t) / 0.3, 0, 1);
    const sc = 1.35 - 0.35 * inn;
    const mid = this.strip * 0.52;
    const rgb = hexToRgb(b.col.startsWith('#') ? b.col : '#ffffff');
    const long = b.sub && b.sub.length > 12;
    c.save(); c.translate(W / 2, mid); c.scale(sc, sc); c.globalAlpha = Math.min(inn, out);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    const fs = (this.narrow ? 20 : 26) * u;
    c.font = `700 ${fs}px ${FONT}`;
    const main = b.text + (b.sub && !long ? '  ·  ' + b.sub : '');
    const tw = c.measureText(main).width;
    c.font = `600 ${11 * u}px ${FONT}`;
    const sw = long ? c.measureText(b.sub).width : 0;
    const pw = Math.max(tw, sw) + 36 * u, ph = (long ? 48 : 36) * u;
    c.fillStyle = 'rgba(6,3,20,0.82)'; this.rr(c, -pw / 2, -ph / 2, pw, ph, ph / 2); c.fill();
    c.strokeStyle = rgba(rgb, 0.8); c.lineWidth = 1.5 * u; this.rr(c, -pw / 2, -ph / 2, pw, ph, ph / 2); c.stroke();
    c.font = `700 ${fs}px ${FONT}`;
    c.globalCompositeOperation = 'lighter'; c.lineWidth = 8 * u; c.strokeStyle = rgba(rgb, 0.3); c.strokeText(main, 0, long ? -8 * u : 0);
    c.globalCompositeOperation = 'source-over'; c.fillStyle = '#fff'; c.fillText(main, 0, long ? -8 * u : 0);
    if (long) { c.font = `600 ${11 * u}px ${FONT}`; c.fillStyle = b.col; c.fillText(b.sub, 0, 12 * u); }
    c.restore();
  }
  rr(c, x, y, w, h, r) {
    c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
  }
}
