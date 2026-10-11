// Drawing. Order: baked forest floor -> ground effects -> y-sorted figures ->
// the 92% darkness layer with every light cut out of it (destination-out) ->
// additive glows (wisps, embers, sparks) -> glowing eyes in the dark -> fog ->
// numbers -> screen overlays and the HUD.
import { SPR, PLAYER, SS, iconCanvas, buildSprites } from './sprites.js';
import { CH } from './world.js';
import { ENEMY, UP, RUN_LEN, PHASES } from './data.js';
import { makeCanvas, TAU, clamp, fmtTime, fmtNum } from './util.js';

const FONT_B = "'Caveat Brush', 'Georgia', serif";
const FONT_N = "'Alegreya', 'Georgia', serif";
const EYES = {
  moth: [[-2, -17], [2, -17]], wolf: [[22.5, -20.5], [25.5, -20.5]], tree: [[-4, -42], [7, -42]], wraith: [[4, -37], [8, -36]],
  brood: [[-7, -26], [3, -29], [-1, -21]], stag: [[33, -61], [36, -60.5]], warden: [[3, -108], [13, -106]], lumen: [],
};
const FPS = { moth: 14, wolf: 9, tree: 4, wraith: 6, brood: 3, stag: 8, warden: 5, lumen: 16 };
const HOVER = { moth: 8, wraith: 6, lumen: 10 };

export class Renderer {
  constructor(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d');
    this.dark = makeCanvas(8, 8); this.dctx = this.dark.getContext('2d');
    this.cam = { x: 0, y: 0 }; this.fireflies = []; this.glows = new Map(); this.sorted = [];
    this.farSil = true; this.burnTint = true;   // perf A/B hooks (__G.R.farSil / __G.R.burnTint = false)
    this.stampSoft = this.stamp([[0, 1], [0.5, 0.8], [1, 0]]);
    this.stampLamp = this.stamp([[0, 1], [0.55, 0.98], [0.78, 0.75], [0.92, 0.3], [1, 0]]);
    this.resize();
  }
  stamp(stops) {
    const c = makeCanvas(256, 256), g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(0,0,0,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return c;
  }
  glow(col) {
    let c = this.glows.get(col);
    if (c) return c;
    c = makeCanvas(64, 64); const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, col); gr.addColorStop(0.25, col.replace(/[\d.]+\)$/, '0.45)')); gr.addColorStop(1, col.replace(/[\d.]+\)$/, '0)'));
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    this.glows.set(col, c);
    return c;
  }
  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = window.innerWidth; this.H = window.innerHeight;
    this.c.width = Math.round(this.W * this.dpr); this.c.height = Math.round(this.H * this.dpr);
    this.zoom = clamp(Math.sqrt(this.W * this.H) / 680, 0.7, 1.9);
    this.ds = 0.5;
    this.dark.width = Math.ceil(this.W * this.ds); this.dark.height = Math.ceil(this.H * this.ds);
    this.buildVignette();
    const want = Math.max(1, Math.min(4, Math.round(this.zoom * this.dpr * 4) / 4));
    if (want !== this.sprScale) { this.sprScale = want; buildSprites(want); this.eyeSpr = {}; }
  }
  buildVignette() {
    const W = this.W, H = this.H, c = this.vig = makeCanvas(W * this.dpr, H * this.dpr), g = c.getContext('2d');
    g.scale(this.dpr, this.dpr);
    const gr = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
    gr.addColorStop(0, 'rgba(2,3,8,0)'); gr.addColorStop(1, 'rgba(2,3,8,0.78)');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    // overhanging branches in the corners, storybook framing
    g.fillStyle = '#020309'; g.strokeStyle = '#020309'; g.lineCap = 'round';
    const branch = (x, y, a, len, w, depth) => {
      const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len;
      g.lineWidth = w; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + ex) / 2 + Math.sin(a) * len * 0.15, (y + ey) / 2 - Math.cos(a) * len * 0.15, ex, ey); g.stroke();
      if (depth > 0) { branch(ex, ey, a - 0.5, len * 0.62, w * 0.62, depth - 1); branch(ex, ey, a + 0.42, len * 0.55, w * 0.6, depth - 1); }
      else for (let i = 0; i < 5; i++) { const la = a + (i - 2) * 0.6; g.beginPath(); g.ellipse(ex + Math.cos(la) * 7, ey + Math.sin(la) * 7, 8, 3.2, la, 0, TAU); g.fill(); }
    };
    const s = Math.min(W, H) / 700;
    branch(-10, -10, 0.45, 150 * s, 13 * s, 3);
    branch(-10, 60 * s, 0.1, 110 * s, 9 * s, 2);
    branch(W + 10, -10, Math.PI - 0.5, 160 * s, 14 * s, 3);
    branch(W + 10, 90 * s, Math.PI - 0.15, 90 * s, 8 * s, 2);
    // ferns at the bottom corners
    const fern = (x, y, a, len) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * 0.5, -len * 0.2, len, 0); g.stroke();
      for (let i = 1; i < 12; i++) { const t = i / 12, px = len * t, py = -len * 0.2 * Math.sin(t * Math.PI), q = (1 - t) * len * 0.2 + 4 * s; for (const sd of [-1, 1]) { g.beginPath(); g.ellipse(px + q * 0.5, py + sd * q * 0.5, q * 0.6, q * 0.22, sd * 0.9, 0, TAU); g.fill(); } }
      g.restore();
    };
    for (let i = 0; i < 4; i++) { fern(-10, H + 10, -0.4 - i * 0.28, (140 - i * 18) * s); fern(W + 10, H + 10, Math.PI + 0.4 + i * 0.28, (130 - i * 16) * s); }
  }

  // world -> screen helpers
  sx(x) { return (x - this.cam.x) * this.zoom + this.W / 2; }
  sy(y) { return (y - this.cam.y) * this.zoom + this.H / 2; }

  draw(g, dt, ui) {
    const ctx = this.ctx, z = this.zoom, dpr = this.dpr, W = this.W, H = this.H, p = g.p;
    g.viewHW = W / 2 / z; g.viewHH = H / 2 / z;
    // camera
    const lead = 0.18;
    this.cam.x += (p.x + p.vx * lead - this.cam.x) * Math.min(1, dt * 6);
    this.cam.y += (p.y - 12 + p.vy * lead - this.cam.y) * Math.min(1, dt * 6);
    if (Math.hypot(this.cam.x - p.x, this.cam.y - p.y) > 900) { this.cam.x = p.x; this.cam.y = p.y; }
    let shx = 0, shy = 0;
    if (g.shake > 0 && ui.shake !== false) { shx = (Math.random() - 0.5) * g.shake; shy = (Math.random() - 0.5) * g.shake; }
    const cx = this.cam.x + shx / z, cy = this.cam.y + shy / z;
    const a = z * dpr, tx = dpr * (W / 2 - cx * z), ty = dpr * (H / 2 - cy * z);
    this.T = [a, tx, ty];
    const setW = () => ctx.setTransform(a, 0, 0, a, tx, ty);
    const hw = g.viewHW + 40, hh = g.viewHH + 40;
    const t = g.lightT;

    // ---- ground ----
    this.pm && this.pm('ground');
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    setW();
    ctx.imageSmoothingEnabled = true;
    const c0x = Math.floor((cx - hw) / CH), c1x = Math.floor((cx + hw) / CH), c0y = Math.floor((cy - hh) / CH), c1y = Math.floor((cy + hh) / CH);
    const glowPts = [];
    for (let j = c0y; j <= c1y; j++) for (let i = c0x; i <= c1x; i++) {
      const ch = g.world.chunk(i, j);
      ctx.drawImage(ch.canvas, i * CH, j * CH, CH + 0.6, CH + 0.6);
      for (const gl of ch.glows) glowPts.push(gl);
    }
    // warm pool of lamplight on the ground (under the darkness)
    const lc = g.lantern === 'green' ? ['rgba(150,255,140,', 'rgba(60,214,138,'] : ['rgba(255,190,105,', 'rgba(255,120,50,'];
    const R = g.R;
    if (this.tint !== 'none') {
      // warm the ground under the lamp (shifts the teal floor toward amber before the light adds on)
      ctx.globalCompositeOperation = this.tint || 'color';
      const wr = g.lantern === 'cone' ? R * 0.6 : R;
      const wg = ctx.createRadialGradient(p.x, p.y - 14, 0, p.x, p.y - 14, wr);
      wg.addColorStop(0, g.lantern === 'green' ? 'rgba(160,255,120,0.5)' : 'rgba(255,170,80,0.55)'); wg.addColorStop(0.75, g.lantern === 'green' ? 'rgba(120,230,120,0.3)' : 'rgba(255,140,60,0.3)'); wg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = wg; ctx.beginPath(); ctx.arc(p.x, p.y - 14, wr, 0, TAU); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter';
    this.lightPool(ctx, g, lc, 1);
    ctx.globalCompositeOperation = 'source-over';

    // ---- ground effects ----
    this.pm && this.pm('geff');
    for (const zn of g.zones) {
      const k = Math.min(1, zn.t / 0.15), fade = Math.min(1, (zn.life - zn.t) / 0.4);
      if (zn.kind === 'thorn') this.drawThorn(ctx, zn.x, zn.y, zn.r * k, zn.rot, fade);
      if (zn.kind === 'fire') { ctx.globalAlpha = 0.55 * fade; ctx.fillStyle = '#2a0e04'; ctx.beginPath(); ctx.ellipse(zn.x, zn.y, zn.r * k, zn.r * k * 0.6, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    }
    if (g.ws.briar && g.ws.briar.pos) { const P = g.ws.briar.pos; for (let i = 0; i < P.length; i += 2) this.drawThorn(ctx, P[i], P[i + 1], 18, g.ws.briar.a + i, 1); }
    for (const gr of g.grasps) {
      const k = Math.min(1, gr.t / gr.fire);
      ctx.fillStyle = `rgba(90,10,40,${0.35 + 0.3 * k})`; ctx.beginPath(); ctx.ellipse(gr.x, gr.y, gr.r, gr.r * 0.62, 0, 0, TAU); ctx.fill();
    }
    for (const k of g.pickups) this.drawPickup(ctx, k, t);

    // ---- figures, sorted by y ----
    this.pm && this.pm('figs');
    const S = this.sorted; S.length = 0;
    const A = g.E.a;
    for (let i = 0; i < g.E.n; i++) { const e = A[i]; if (e.dead) continue; if (Math.abs(e.x - cx) > hw + 60 || Math.abs(e.y - cy) > hh + 120) continue; S.push(e); }
    S.push(p);
    S.sort((u, v) => u.y - v.y);
    // shadows first
    const shR = (R * (g.lantern === 'cone' ? 2.3 : 1.25)) ** 2;
    for (const e of S) {
      if (e !== p && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > shR && e.mass < 20) continue;
      const r = e === p ? 11 : e.r;
      ctx.globalAlpha = e === p ? 0.8 : 0.65;
      ctx.drawImage(SPR.shadow, e.x - r * 1.25, e.y - r * 0.38, r * 2.5, r * 0.76);
    }
    ctx.globalAlpha = 1;
    // figures deep in the dark are only eyes; skip drawing them (cheap and on-theme)
    const bw0 = g.ws.beacon || g.ws.lighthouse;
    const visR = Math.max(R * (g.lantern === 'cone' ? 2.5 : 1.8), bw0 && bw0.beams && bw0.beams[0] ? bw0.beams[0].len + 40 : 0, 200);
    const visR2 = visR * visR, allVis = g.state === 'dawn' || g.state === 'over';
    const runes = g.zones.filter((z) => z.kind === 'rune' && !z.follow);
    const burnPulse = 0.3 + 0.12 * Math.sin(t * 16);
    let farN = 0; const farR2 = (visR * 1.7) ** 2;   // faint silhouettes only in the near field, at most 40 a frame
    for (const e of S) {
      if (e === p) { this.drawPlayer(ctx, g); continue; }
      // deep in the dark small things are eyes only; the big shapes (trees, nests, the Stag, the Warden) keep a faint
      // silhouette at any distance so the horde's shape and gaps still read
      let far = false;
      if (!allVis && !e.lit && e.mass < 20 && e.type !== 'lumen' && (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > visR2 && !runes.some((z) => (e.x - z.x) ** 2 + (e.y - z.y) ** 2 < (z.r * 1.6) ** 2)) {
        if (!this.farSil || (e.type !== 'tree' && e.type !== 'brood') || farN >= 40 || (e.x - p.x) ** 2 + (e.y - p.y) ** 2 > farR2) continue;
        far = true; farN++;
      }
      const spr = SPR[e.type];
      const fps = (e.st === 'dash' || e.st === 'lunge') ? FPS[e.type] * 2 : FPS[e.type];
      const f = Math.floor(e.t * fps) % 4;
      const big = e.mass >= 20, L = e.face < 0;
      let sx = 1, sy = 1;
      if (e.st === 'wind') { sx = 1.12; sy = 0.84; }
      else if (e.st === 'dash' || e.st === 'lunge') { sx = 1.15; sy = 0.92; }
      if (e.stun > 0) sy *= 0.94;
      const hov = HOVER[e.type] ? HOVER[e.type] + Math.sin(e.t * 3 + e.orb) * 3 : 0;
      const img = L ? spr.framesL[f] : spr.frames[f];
      const ax = L ? spr.w - spr.ax : spr.ax, dx = e.x - ax * sx, dy = e.y - hov - spr.ay * sy, dw = spr.w * sx, dh = spr.h * sy;
      if (far) { ctx.globalAlpha = 0.13; ctx.drawImage(L ? spr.flashL[f] : spr.flash[f], dx, dy, dw, dh); ctx.globalAlpha = 1; continue; }
      ctx.drawImage(img, dx, dy, dw, dh);
      // the Warden is self-lit: its rim stays on outside the lantern so the body reads, not just the eyes
      if (e.type === 'warden') { ctx.globalAlpha = 0.16 + 0.05 * Math.sin(t * 2); ctx.drawImage(L ? spr.flashL[f] : spr.flash[f], dx, dy, dw, dh); ctx.globalAlpha = 1; }
      if (e.lit && this.burnTint && g.state === 'play') { ctx.globalAlpha = big ? burnPulse * 0.7 : burnPulse; ctx.drawImage(L ? spr.burnL[f] : spr.burn[f], dx, dy, dw, dh); ctx.globalAlpha = 1; }
      if (e.flash > 0) { ctx.globalAlpha = Math.min(1, e.flash / 0.09) * (big ? 0.55 : 0.65); ctx.drawImage(L ? spr.flashL[f] : spr.flash[f], dx, dy, dw, dh); ctx.globalAlpha = 1; }
    }

    // ---- darkness ----
    this.pm && this.pm('dark');
    const dawnK = g.state === 'dawn' ? g.dawnK : 0;
    let darkA = 0.92 * (1 - dawnK);
    if (g.state === 'dying') darkA = 0.92 + 0.08 * g.deathK;
    if (g.state === 'over' && !g.result?.dawn) darkA = 0.98;
    if (g.state === 'over' && g.result?.dawn) darkA = 0;
    if (darkA > 0.01) {
      const d = this.dctx, k = this.ds;
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalCompositeOperation = 'source-over';
      d.clearRect(0, 0, this.dark.width, this.dark.height);
      d.fillStyle = `rgba(7,10,20,${darkA})`; d.fillRect(0, 0, this.dark.width, this.dark.height);
      d.globalCompositeOperation = 'destination-out';
      d.setTransform(z * k, 0, 0, z * k, k * (W / 2 - cx * z), k * (H / 2 - cy * z));
      this.cutLights(d, g, t);
      if (g.creep > 0.02) this.creepers(d, g, t);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(this.dark, 0, 0, this.c.width, this.c.height);
      setW();
    }

    // ---- additive glows ----
    this.pm && this.pm('glows');
    ctx.globalCompositeOperation = 'lighter';
    // lantern flame halo
    const hand = this.handPos(g);
    const fl = 1 + Math.sin(t * 13) * 0.08 + Math.sin(t * 7.3) * 0.06;
    const deathFade = g.state === 'dying' ? 1 - g.deathK : 1;
    if (deathFade > 0) {
      ctx.globalAlpha = 0.9 * deathFade;
      const gc = g.lantern === 'green' ? 'rgba(150,255,140,1)' : 'rgba(255,200,110,1)';
      ctx.drawImage(this.glow(gc), hand[0] - 30 * fl, hand[1] - 30 * fl, 60 * fl, 60 * fl);
      ctx.globalAlpha = 0.35 * deathFade;
      ctx.drawImage(this.glow(gc), hand[0] - 80 * fl, hand[1] - 80 * fl, 160 * fl, 160 * fl);
      ctx.globalAlpha = 1;
    }
    // glow caps in the moss
    for (const gl of glowPts) {
      const pu = 0.55 + 0.45 * Math.sin(t * 1.3 + gl.ph);
      ctx.globalAlpha = 0.5 * pu;
      const s = gl.s * 7;
      ctx.drawImage(this.glow(gl.col === '#5ff2d0' ? 'rgba(95,242,208,1)' : gl.col === '#9fd0ff' ? 'rgba(159,208,255,1)' : gl.col === '#9dffb0' ? 'rgba(157,255,176,1)' : 'rgba(111,230,255,1)'), gl.x - s, gl.y - gl.s - s, s * 2, s * 2);
    }
    ctx.globalAlpha = 1;
    this.drawAmbient(ctx, g, dt, cx, cy, hw, hh, t);
    // fire zones
    for (const zn of g.zones) {
      if (zn.kind !== 'fire') continue;
      const k = Math.min(1, zn.t / 0.15), fade = Math.min(1, (zn.life - zn.t) / 0.5);
      const fk = 0.8 + 0.2 * Math.sin(t * 18 + zn.x);
      ctx.globalAlpha = 0.85 * fade;
      const r = zn.r * k * 1.5 * fk;
      ctx.drawImage(this.glow(zn.ign ? 'rgba(255,120,40,1)' : 'rgba(255,140,50,1)'), zn.x - r, zn.y - r * 0.8, r * 2, r * 1.6);
      ctx.globalAlpha = fade;
      this.flameTongue(ctx, zn.x, zn.y, zn.r * k * 0.55, t * 9 + zn.x, '#ffb347');
    }
    ctx.globalAlpha = 1;
    // runes
    for (const zn of g.zones) if (zn.kind === 'rune') this.drawRune(ctx, zn, t);
    // rings (flicker pulses, bell tolls)
    for (const r of g.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * (r.dmg ? 0.7 : 0.9) * Math.min(1, r.r / 40);
      ctx.strokeStyle = r.col; ctx.lineWidth = r.w * (1 - k * 0.6);
      ctx.beginPath(); ctx.ellipse(r.x, r.y - 10, r.r, r.r * (r.bell ? 0.7 : 0.82), 0, 0, TAU); ctx.stroke();
      if (r.bell) { ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(r.x, r.y - 10, r.r * 0.8, r.r * 0.56, 0, 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1;
    // beacon beams
    const bw = g.ws.beacon || g.ws.lighthouse;
    if (bw && bw.beams) for (const b of bw.beams) this.drawBeam(ctx, p.x, p.y - 14, b, 0.35);
    // prism beams
    for (const b of g.beams) {
      const k = 1 - b.t / b.life;
      ctx.globalAlpha = k; ctx.strokeStyle = b.col; ctx.lineWidth = 9 * k + 2;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x2, b.y2); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2 * k + 1; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // wisps
    const ww = g.ws.wisps || g.ws.sunwheel;
    if (ww && ww.pos) {
      const big = !!g.ws.sunwheel, child = g.charKey === 'child';
      for (let i = 0; i < ww.pos.length; i += 2) {
        const x = ww.pos[i], y = ww.pos[i + 1] - 10, s = (big ? 30 : 22) * (1 + 0.1 * Math.sin(t * 20 + i));
        ctx.drawImage(this.glow(child ? 'rgba(200,255,120,1)' : big ? 'rgba(255,220,120,1)' : 'rgba(255,150,60,1)'), x - s, y - s, s * 2, s * 2);
        ctx.drawImage(this.glow('rgba(255,250,220,1)'), x - 5, y - 5, 10, 10);
      }
    }
    if (g.pilot && g.ws.pilot) { const w = g.ws.pilot; ctx.drawImage(this.glow('rgba(140,200,255,1)'), w.x - 16, w.y - 16, 32, 32); ctx.drawImage(this.glow('rgba(255,255,255,1)'), w.x - 4, w.y - 4, 8, 8); }
    // shield moths
    const mw = g.ws.moths || g.ws.lunar;
    if (mw && mw.list) for (const m of mw.list) {
      if (!m.alive) continue;
      ctx.globalAlpha = 0.8; ctx.drawImage(this.glow('rgba(220,210,255,1)'), m.x - 16, m.y - 16, 32, 32); ctx.globalAlpha = 1;
      const fw = Math.abs(Math.sin(t * 22 + m.a * 3));
      ctx.fillStyle = '#f1ecff';
      ctx.beginPath(); ctx.ellipse(m.x - 3.5 * fw, m.y, 4 * fw + 1, 3, 0.4, 0, TAU); ctx.ellipse(m.x + 3.5 * fw, m.y, 4 * fw + 1, 3, -0.4, 0, TAU); ctx.fill();
    }
    // firefly bolts
    for (let i = 0; i < g.bolts.n; i++) {
      const b = g.bolts.a[i];
      ctx.strokeStyle = 'rgba(230,255,120,0.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); for (let k = 0; k < b.trail.length; k += 2) ctx.lineTo(b.trail[k], b.trail[k + 1]); ctx.stroke();
      ctx.drawImage(this.glow('rgba(220,255,110,1)'), b.x - 13, b.y - 13, 26, 26);
      ctx.drawImage(this.glow('rgba(255,255,230,1)'), b.x - 4, b.y - 4, 8, 8);
    }
    // embers (xp)
    for (let i = 0; i < g.embers.n; i++) {
      const m = g.embers.a[i];
      if (Math.abs(m.x - cx) > hw || Math.abs(m.y - cy) > hh) continue;
      const s = (m.v >= 10 ? 15 : m.v >= 5 ? 12 : m.v >= 2 ? 9.5 : 7.5) * (0.85 + 0.15 * Math.sin(t * 6 + i));
      const col = m.v >= 10 ? 'rgba(255,120,200,1)' : m.v >= 5 ? 'rgba(255,90,60,1)' : m.v >= 2 ? 'rgba(255,170,60,1)' : 'rgba(255,200,90,1)';
      ctx.drawImage(this.glow(col), m.x - s, m.y - 4 - s, s * 2, s * 2);
      ctx.fillStyle = '#fff4d0'; ctx.fillRect(m.x - 1.2, m.y - 5.2, 2.4, 2.4);
    }
    // chest glow
    for (const k of g.pickups) { const s = 46 + Math.sin(t * 4) * 6; ctx.globalAlpha = 0.7; ctx.drawImage(this.glow(k.kind === 'chest' ? 'rgba(255,210,100,1)' : 'rgba(120,255,150,1)'), k.x - s, k.y - 10 - s, s * 2, s * 2); }
    ctx.globalAlpha = 1;
    // lumen moths glow gold
    for (const e of S) if (e.type === 'warden' || e.type === 'stag') { const w = e.type === 'warden', s = w ? 150 : 90, pu = (w ? 0.5 : 0.35) + 0.1 * Math.sin(t * 3); ctx.globalAlpha = pu; ctx.drawImage(this.glow(w ? 'rgba(130,70,255,1)' : 'rgba(255,160,60,1)'), e.x - s, e.y - s * 0.55 - (w ? 80 : 50), s * 2, s * 1.1); if (w) { ctx.globalAlpha = 0.35; ctx.drawImage(this.glow('rgba(190,140,255,1)'), e.x - 90, e.y - 150, 180, 180); } ctx.globalAlpha = 1; }
    for (const e of S) if (e.type === 'lumen') { const s = 34 + Math.sin(t * 8) * 5; ctx.drawImage(this.glow('rgba(255,220,100,1)'), e.x - s, e.y - 20 - s, s * 2, s * 2); }
    // ignited enemies (witchfire / wildfire)
    for (const e of S) if (e !== p && e.ign > 0 && !e.lit) { const s = e.r * 1.6; ctx.globalAlpha = 0.6; ctx.drawImage(this.glow(g.lantern === 'green' ? 'rgba(120,255,110,1)' : 'rgba(255,120,40,1)'), e.x - s, e.y - e.r - s, s * 2, s * 2); }
    ctx.globalAlpha = 1;
    // sparks
    for (let i = 0; i < g.parts.n; i++) {
      const q = g.parts.a[i], k = q.life / q.max;
      ctx.globalAlpha = k;
      const s = q.size * (0.5 + k);
      ctx.fillStyle = q.col; ctx.fillRect(q.x - s / 2, q.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
    // boss orbs: bright things on black (a 20 Minutes Till Dawn rule) - violet core, additive halo, a short trail
    for (let i = 0; i < g.orbs.n; i++) {
      const o = g.orbs.a[i];
      const tr = o.trail || [];
      for (let k = 0; k < tr.length; k += 2) { const kk = 1 - k / 2 / 5; ctx.globalAlpha = 0.35 * kk; const s = 9 * kk + 3; ctx.drawImage(this.glow('rgba(170,110,255,1)'), tr[k] - s, tr[k + 1] - s, s * 2, s * 2); }
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.glow('rgba(160,100,255,1)'), o.x - 24, o.y - 24, 48, 48);
      ctx.drawImage(this.glow('rgba(220,190,255,1)'), o.x - 12, o.y - 12, 24, 24);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < g.orbs.n; i++) { const o = g.orbs.a[i]; ctx.fillStyle = '#c9a6ff'; ctx.beginPath(); ctx.arc(o.x, o.y, 7, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff6ff'; ctx.beginPath(); ctx.arc(o.x - 1.5, o.y - 1.5, 2.6, 0, TAU); ctx.fill(); }
    // grasp telegraphs on top so they read in the dark: a bright red dashed ring that fills over the fuse (Archero-style)
    for (const gr of g.grasps) {
      const k = Math.min(1, gr.t / gr.fire);
      ctx.strokeStyle = gr.done ? 'rgba(220,140,255,0.95)' : '#ff6a6a'; ctx.lineWidth = gr.done ? 6 : 3;
      ctx.setLineDash(gr.done ? [] : [12, 7]); ctx.lineDashOffset = -t * 40;
      ctx.beginPath(); ctx.ellipse(gr.x, gr.y, gr.r, gr.r * 0.62, 0, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = `rgba(255,80,90,${0.25 + 0.2 * k})`; ctx.beginPath(); ctx.ellipse(gr.x, gr.y, gr.r * k, gr.r * 0.62 * k, 0, 0, TAU); ctx.fill();
      if (!gr.done) { ctx.strokeStyle = '#ffd0d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(gr.x, gr.y, gr.r * k, gr.r * 0.62 * k, 0, 0, TAU); ctx.stroke(); }
      if (gr.done) this.drawHands(ctx, gr);
    }

    // ---- eyes in the dark ----
    this.pm && this.pm('eyes');
    ctx.globalCompositeOperation = 'lighter';
    const fogOn = g.mapKey === 'marsh';
    const eyeFade = Math.max(visR, 300);
    for (const e of S) {
      if (e === p) continue;
      const eyes = EYES[e.type]; if (!eyes.length) continue;
      let al = e.lit ? 0.45 : 1;
      // eyes brighten as they near the edge of the light, so the direction of the horde reads
      if (!e.lit && e.mass < 20) { const d = Math.hypot(e.x - p.x, e.y - p.y); al *= clamp(1.25 - (d - R) / eyeFade, 0.4, 1); }
      if (fogOn) al *= 1 - 0.85 * g.world.fogAt(e.x, e.y);
      if (al < 0.05) continue;
      const blink = Math.sin(e.t * 0.9 + e.orb * 5) > 0.985 ? 0.15 : 1;
      const hov = HOVER[e.type] ? HOVER[e.type] + Math.sin(e.t * 3 + e.orb) * 3 : 0;
      const wind = e.st === 'wind';
      const big = wind || e.st === 'lunge' ? 1.8 : 1;
      const es = this.eyeSprite(e.type);
      ctx.globalAlpha = al * blink;
      const fl = e.face < 0 ? -1 : 1, ex = e.x + es.cx * fl, ey = e.y - hov + es.cy;
      ctx.drawImage(es.c, ex - es.hw * big, ey - es.hh * big, es.hw * 2 * big, es.hh * 2 * big);
      // a wolf winding up flares amber: the dash is telegraphed from the dark
      if (wind && e.type === 'wolf') { ctx.globalAlpha = 0.9; ctx.drawImage(this.glow('rgba(255,170,40,1)'), ex - 22, ey - 22, 44, 44); }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // ---- marsh fog ----
    this.pm && this.pm('fog');
    if (fogOn) {
      for (const f of g.world.fogs) {
        ctx.globalAlpha = 0.22 + 0.06 * Math.sin(t * 0.4 + f.ph);
        ctx.drawImage(this.glow('rgba(150,175,180,1)'), f.x - f.r, f.y - f.r * 0.7, f.r * 2, f.r * 1.4);
      }
      ctx.globalAlpha = 1;
    }

    // ---- floating numbers ----
    this.pm && this.pm('nums');
    if (ui.numbers !== false) {
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let i = 0; i < g.nums.n; i++) {
        const n = g.nums.a[i], k = n.t / 0.7;
        const pop = k < 0.15 ? 0.6 + k / 0.15 * 0.6 : 1.2 - (k - 0.15) * 0.3;
        ctx.globalAlpha = k > 0.6 ? (1 - k) / 0.4 : 1;
        ctx.font = `800 ${Math.round(12 * n.size * pop)}px ${FONT_N}`;
        const y = n.y - k * 22;
        ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(20,8,2,0.85)'; ctx.strokeText(n.v, n.x, y);
        ctx.fillStyle = n.col; ctx.fillText(n.v, n.x, y);
      }
      ctx.globalAlpha = 1;
    }

    // ---- player health bar (under the figure) ----
    if (g.state === 'play' && !g.attract) {
      const k = clamp(p.hp / g.s.maxHp, 0, 1);
      ctx.fillStyle = 'rgba(10,6,4,0.75)'; ctx.fillRect(p.x - 17, p.y + 6, 34, 5);
      ctx.fillStyle = k < 0.3 ? '#ff4a3a' : '#e8503a'; ctx.fillRect(p.x - 16, p.y + 7, 32 * k, 3);
    }
    // the Grey Stag carries its own bar over its head (the HUD keeps one bar, for the Warden)
    const st = g.elite;
    if (st && !st.dead && st.st !== 'flee' && Math.abs(st.x - cx) < hw && Math.abs(st.y - cy) < hh) {
      const k = clamp(st.hp / st.maxhp, 0, 1), bx = st.x - 30, by = st.y - 118;
      ctx.fillStyle = 'rgba(10,6,4,0.8)'; ctx.fillRect(bx - 1, by - 1, 62, 7);
      ctx.fillStyle = '#ffb347'; ctx.fillRect(bx, by, 60 * k, 5);
      ctx.font = `12px ${FONT_B}`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
      this.label(ctx, 'GREY STAG · chest', st.x, by - 3, '#ffe2a8');
    }
    // one-time callouts float under the player
    if (g.hints.length && g.state === 'play') {
      const h = g.hints[0];
      const al = h.t < 0.25 ? h.t / 0.25 : h.t > h.life - 0.5 ? (h.life - h.t) / 0.5 : 1;
      ctx.globalAlpha = al; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `italic 700 14px ${FONT_N}`;
      this.label(ctx, h.text, p.x, p.y + 30 - Math.min(1, h.t / 0.4) * 6, '#fff1d6');
      ctx.globalAlpha = 1;
    }

    // ---- screen space ----
    this.pm && this.pm('screen');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    // dawn: the sun comes up on the right
    if (dawnK > 0 || (g.state === 'over' && g.result?.dawn)) {
      const k = g.state === 'over' ? 1 : dawnK;
      ctx.globalCompositeOperation = 'lighter';
      const gr = ctx.createRadialGradient(W * 1.05, H * 0.2, 0, W * 1.05, H * 0.2, Math.max(W, H) * (0.4 + k * 1.1));
      gr.addColorStop(0, `rgba(255,220,150,${0.75 * k})`); gr.addColorStop(0.4, `rgba(255,140,90,${0.35 * k})`); gr.addColorStop(1, 'rgba(255,100,120,0)');
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = dawnK > 0 ? 1 - dawnK * 0.7 : 1;
    ctx.drawImage(this.vig, 0, 0, W, H);
    ctx.globalAlpha = 1;
    if (p.hurtT > 0) {
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(170,10,10,${p.hurtT * 1.4})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (g.state === 'play' && !g.attract && p.hp / g.s.maxHp < 0.3) {
      const pu = 0.18 + 0.12 * Math.sin(t * 6);
      const gr = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.6);
      gr.addColorStop(0, 'rgba(160,0,0,0)'); gr.addColorStop(1, `rgba(150,0,0,${pu})`);
      ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    }
    if (g.flash > 0) { ctx.fillStyle = `rgba(${g.flashCol},${Math.min(0.7, g.flash)})`; ctx.fillRect(0, 0, W, H); }
    // death stamp: slams in 0.6 s after the light goes out, stays until the result card
    if ((g.state === 'dying' && g.dyingReal > 0.6) || (g.state === 'over' && g.result && !g.result.dawn)) {
      const k = g.state === 'over' ? 1 : Math.min(1, (g.dyingReal - 0.6) / 0.16);
      const sc = 1.7 - 0.7 * (1 - Math.pow(1 - k, 3));
      ctx.save(); ctx.globalAlpha = Math.min(1, k * 2); ctx.translate(W / 2, H * 0.42); ctx.rotate(-0.05); ctx.scale(sc, sc);
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.min(72, W / 8)}px ${FONT_B}`;
      ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(8,4,2,0.95)'; ctx.strokeText('The light went out', 0, 0);
      ctx.fillStyle = '#ffd9a8'; ctx.fillText('The light went out', 0, 0);
      ctx.restore();
    }
    if (!g.attract && ui.hud !== false && g.state !== 'over') this.hud(ctx, g, ui, t);
    if (ui.stick) this.drawStick(ctx, ui.stick);
    this.pm && this.pm('end');
  }

  lightPool(ctx, g, lc, mul) {
    const p = g.p, R = g.R;
    if (R < 2) return;
    if (g.lantern === 'cone') {
      const L = R * 2.25;
      ctx.save(); ctx.beginPath(); ctx.moveTo(p.x, p.y - 14); ctx.arc(p.x, p.y - 14, L, p.aim - 0.46, p.aim + 0.46); ctx.closePath(); ctx.clip();
      const gr = ctx.createRadialGradient(p.x, p.y - 14, 0, p.x, p.y - 14, L);
      gr.addColorStop(0, lc[0] + 0.3 * mul + ')'); gr.addColorStop(0.6, lc[1] + 0.14 * mul + ')'); gr.addColorStop(1, lc[1] + '0)');
      ctx.fillStyle = gr; ctx.fillRect(p.x - L, p.y - 14 - L, L * 2, L * 2); ctx.restore();
    }
    const r = g.lantern === 'cone' ? R * 0.5 : R;
    const gr = ctx.createRadialGradient(p.x, p.y - 14, 0, p.x, p.y - 14, r);
    gr.addColorStop(0, lc[0] + 0.32 * mul + ')'); gr.addColorStop(0.55, lc[0] + 0.16 * mul + ')'); gr.addColorStop(0.85, lc[1] + 0.09 * mul + ')'); gr.addColorStop(1, lc[1] + '0)');
    ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(p.x, p.y - 14, r, 0, TAU); ctx.fill();
  }

  cutLights(d, g, t) {
    const p = g.p, R = g.R;
    const st = (img, x, y, r, al = 1) => { d.globalAlpha = al; d.drawImage(img, x - r, y - r, r * 2, r * 2); };
    if (R > 1) {
      if (g.lantern === 'cone') {
        const L = R * 2.25;
        for (const [w, al] of [[0.5, 0.45], [0.42, 1]]) {
          d.save(); d.beginPath(); d.moveTo(p.x, p.y - 14); d.arc(p.x, p.y - 14, L * 1.05, p.aim - w, p.aim + w); d.closePath(); d.clip();
          st(this.stampSoft, p.x, p.y - 14, L * 1.05, al); d.restore();
        }
        st(this.stampLamp, p.x, p.y - 14, R * 0.5);
      } else st(this.stampLamp, p.x, p.y - 14, R);
    }
    const ww = g.ws.wisps || g.ws.sunwheel;
    if (ww && ww.pos) for (let i = 0; i < ww.pos.length; i += 2) st(this.stampSoft, ww.pos[i], ww.pos[i + 1] - 10, g.ws.sunwheel ? 70 : g.charKey === 'child' ? 62 : 42, 0.85);
    if (g.pilot && g.ws.pilot) st(this.stampSoft, g.ws.pilot.x, g.ws.pilot.y, 34, 0.7);
    for (const zn of g.zones) {
      if (zn.kind === 'fire') st(this.stampSoft, zn.x, zn.y, zn.r * 2.6, 0.75 * Math.min(1, (zn.life - zn.t) / 0.5));
      else if (zn.kind === 'rune') st(this.stampSoft, zn.x, zn.y, zn.r * 1.5, 0.7 * Math.min(1, (zn.life - zn.t) / 0.4));
    }
    for (const r of g.rings) {
      const k = r.t / r.life;
      d.globalAlpha = (1 - k) * 0.8; d.strokeStyle = '#000'; d.lineWidth = 26;
      d.beginPath(); d.ellipse(r.x, r.y - 10, r.r, r.r * 0.82, 0, 0, TAU); d.stroke();
    }
    const bw = g.ws.beacon || g.ws.lighthouse;
    if (bw && bw.beams) for (const b of bw.beams) {
      d.save(); d.beginPath(); d.moveTo(p.x, p.y - 14); d.arc(p.x, p.y - 14, b.len, b.a - b.half, b.a + b.half); d.closePath(); d.clip();
      st(this.stampSoft, p.x, p.y - 14, b.len, 1); d.restore();
    }
    for (const b of g.beams) { d.globalAlpha = 1 - b.t / b.life; d.strokeStyle = '#000'; d.lineWidth = 30; d.beginPath(); d.moveTo(b.x, b.y); d.lineTo(b.x2, b.y2); d.stroke(); }
    for (let i = 0; i < g.bolts.n; i++) { const b = g.bolts.a[i]; st(this.stampSoft, b.x, b.y, 40, 0.7); }
    for (const k of g.pickups) st(this.stampSoft, k.x, k.y - 8, 70, 0.8);
    for (let i = 0; i < g.E.n; i++) { const e = g.E.a[i]; if (e.dead) continue; if (e.type === 'lumen') st(this.stampSoft, e.x, e.y - 18, 60, 0.75); else if (e.type === 'warden') st(this.stampSoft, e.x, e.y - 80, 150, 0.8); else if (e.type === 'stag') st(this.stampSoft, e.x, e.y - 50, 90, 0.45); }
    for (let i = 0; i < g.orbs.n; i++) { const o = g.orbs.a[i]; st(this.stampSoft, o.x, o.y, 22, 0.8); }
    const mw = g.ws.moths || g.ws.lunar;
    if (mw && mw.list) for (const m of mw.list) if (m.alive) st(this.stampSoft, m.x, m.y, 26, 0.6);
    d.globalAlpha = 1;
  }

  // Moonless mode: fingers of shadow reach in over the edge of the light
  creepers(d, g, t) {
    const p = g.p, R = g.R, k = g.creep;
    d.globalCompositeOperation = 'source-over'; d.globalAlpha = 1;
    d.fillStyle = 'rgba(4,5,12,' + (0.85 * k).toFixed(3) + ')';
    const n = 22;
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + Math.sin(t * 0.7 + i) * 0.08, reach = R * (0.32 + 0.22 * Math.sin(t * 1.3 + i * 2.1)) * k, w = 0.16;
      const x0 = p.x + Math.cos(a) * R * 1.05, y0 = p.y - 14 + Math.sin(a) * R * 1.05;
      const x1 = p.x + Math.cos(a) * (R - reach), y1 = p.y - 14 + Math.sin(a) * (R - reach);
      d.beginPath();
      d.moveTo(p.x + Math.cos(a - w) * R * 1.05, p.y - 14 + Math.sin(a - w) * R * 1.05);
      d.quadraticCurveTo(x0 + Math.cos(a + 1.6) * 12, y0 + Math.sin(a + 1.6) * 12, x1, y1);
      d.quadraticCurveTo(x0 - Math.cos(a + 1.6) * 12, y0 - Math.sin(a + 1.6) * 12, p.x + Math.cos(a + w) * R * 1.05, p.y - 14 + Math.sin(a + w) * R * 1.05);
      d.closePath(); d.fill();
    }
  }
  handPos(g) {
    const p = g.p, pf = PLAYER[g.charKey];
    const bob = g.p.moving ? [0, -1.6, 0, -1.6][Math.floor(g.p.walkT) % 4] : 0;
    return [p.x + pf.hand[0] * p.face, p.y + pf.hand[1] + bob + 6];
  }
  drawPlayer(ctx, g) {
    const p = g.p, pf = PLAYER[g.charKey], [a, tx, ty] = this.T;
    const f = p.moving ? Math.floor(p.walkT) % 4 : 0;
    const breathe = p.moving ? 1 : 1 + Math.sin(g.lightT * 2.4) * 0.025;
    if (p.inv > 0 && Math.floor(p.inv * 20) % 2 === 0 && g.state === 'play') ctx.globalAlpha = 0.5;
    ctx.setTransform(a * p.face, 0, 0, a * breathe, tx + a * p.x, ty + a * p.y);
    ctx.drawImage(pf.frames[f], -pf.ax, -pf.ay, pf.w, pf.h);
    ctx.globalAlpha = 1;
    ctx.setTransform(a, 0, 0, a, tx, ty);
    // the lantern, swinging a little
    const [hx, hy] = this.handPos(g);
    const sw = Math.sin(g.lightT * (p.moving ? 9 : 2)) * (p.moving ? 0.25 : 0.08);
    ctx.save(); ctx.translate(hx, hy - 4); ctx.rotate(sw);
    ctx.strokeStyle = '#1a120c'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, -5); ctx.lineTo(0, 0); ctx.stroke();
    ctx.fillStyle = '#2a1c10'; ctx.fillRect(-4, 0, 8, 2);
    const gl = g.lantern === 'green' ? '#b8ff9a' : '#ffe7a0';
    const fade = g.state === 'dying' ? 1 - g.deathK : 1;
    ctx.fillStyle = fade > 0.1 ? gl : '#3a3020'; ctx.fillRect(-3.4, 2, 6.8, 7.5);
    ctx.fillStyle = '#2a1c10'; ctx.fillRect(-4, 9.5, 8, 2); ctx.fillRect(-0.6, 2, 1.2, 7.5);
    ctx.restore();
  }
  drawThorn(ctx, x, y, r, rot, al) {
    ctx.globalAlpha = al;
    ctx.fillStyle = '#16301c';
    ctx.beginPath(); ctx.ellipse(x, y - r * 0.4, r * 1.05, r * 0.8, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#2c5a30';
    ctx.beginPath(); ctx.ellipse(x - r * 0.3, y - r * 0.6, r * 0.6, r * 0.5, 0, 0, TAU); ctx.ellipse(x + r * 0.35, y - r * 0.5, r * 0.55, r * 0.45, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#d8c9a0'; ctx.lineWidth = 1.3;
    ctx.beginPath();
    for (let i = 0; i < 7; i++) { const a = rot + i * 0.9, bx = x + Math.cos(a) * r * 0.8, by = y - r * 0.4 + Math.sin(a) * r * 0.6; ctx.moveTo(bx, by); ctx.lineTo(bx + Math.cos(a) * 5, by + Math.sin(a) * 4 - 2); }
    ctx.stroke();
    ctx.fillStyle = '#c84a6a'; ctx.beginPath(); ctx.arc(x + Math.cos(rot) * r * 0.3, y - r * 0.8, 2, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawPickup(ctx, k, t) {
    if (k.kind === 'chest') {
      const b = Math.abs(Math.sin(t * 3)) * 4;
      ctx.fillStyle = 'rgba(0,0,0,0.4)'; ctx.beginPath(); ctx.ellipse(k.x, k.y, 16, 5, 0, 0, TAU); ctx.fill();
      ctx.save(); ctx.translate(k.x, k.y - b);
      ctx.fillStyle = '#5a3418'; ctx.fillRect(-14, -16, 28, 16);
      ctx.fillStyle = '#7a4a22'; ctx.beginPath(); ctx.moveTo(-15, -16); ctx.quadraticCurveTo(0, -30, 15, -16); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e8b04a'; ctx.fillRect(-15, -17, 30, 3); ctx.fillRect(-2.5, -20, 5, 9); ctx.fillRect(-14, -3, 28, 2);
      ctx.fillStyle = '#fff1b0'; ctx.fillRect(-1, -17, 2, 4);
      ctx.restore();
    } else {
      ctx.save(); ctx.translate(k.x, k.y - 4 - Math.sin(t * 4) * 2);
      ctx.fillStyle = '#e05a4a'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, TAU); ctx.fill();
      ctx.fillStyle = '#6b4a2a'; ctx.fillRect(-2, -10, 4, 5);
      ctx.fillStyle = '#fff'; ctx.fillRect(-3, -1, 6, 2); ctx.fillRect(-1, -3, 2, 6);
      ctx.restore();
    }
  }
  flameTongue(ctx, x, y, s, ph, col) {
    ctx.fillStyle = col;
    for (let i = -1; i <= 1; i++) {
      const h = s * (1.4 + 0.5 * Math.sin(ph + i * 2.1)), bx = x + i * s * 0.55;
      ctx.beginPath(); ctx.moveTo(bx - s * 0.35, y); ctx.quadraticCurveTo(bx - s * 0.3, y - h * 0.6, bx + Math.sin(ph * 1.3 + i) * s * 0.2, y - h); ctx.quadraticCurveTo(bx + s * 0.3, y - h * 0.6, bx + s * 0.35, y); ctx.fill();
    }
  }
  drawRune(ctx, zn, t) {
    const k = Math.min(1, zn.t / 0.2), fade = Math.min(1, (zn.life - zn.t) / 0.4), r = zn.r * k;
    const big = zn.follow;
    ctx.globalAlpha = (big ? 0.55 : 0.85) * fade;
    ctx.drawImage(this.glow('rgba(80,230,180,1)'), zn.x - r * 1.1, zn.y - r * 0.75, r * 2.2, r * 1.5);
    ctx.save(); ctx.translate(zn.x, zn.y); ctx.scale(1, 0.62); ctx.rotate((zn.rot || 0) + t * (big ? 0.4 : 0.9));
    ctx.strokeStyle = big ? '#ffe9a8' : '#9dffd9'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, TAU); ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3; ctx.lineTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); } ctx.closePath();
    for (let i = 0; i < 3; i++) { const a = i * TAU / 3 + Math.PI / 3; ctx.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); ctx.lineTo(Math.cos(a + TAU / 3) * r * 0.78, Math.sin(a + TAU / 3) * r * 0.78); }
    ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = i * TAU / 8; ctx.save(); ctx.rotate(a); ctx.translate(r * 0.89, 0); ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, 0); ctx.lineTo(-3, 3); ctx.moveTo(0, -4); ctx.lineTo(0, 4); ctx.stroke(); ctx.restore(); }
    ctx.restore();
    ctx.globalAlpha = 1;
  }
  drawBeam(ctx, x, y, b, al) {
    ctx.save();
    ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, b.len, b.a - b.half, b.a + b.half); ctx.closePath(); ctx.clip();
    const gr = ctx.createRadialGradient(x, y, 0, x, y, b.len);
    gr.addColorStop(0, `rgba(255,236,170,${al})`); gr.addColorStop(0.7, `rgba(255,190,90,${al * 0.5})`); gr.addColorStop(1, 'rgba(255,160,60,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - b.len, y - b.len, b.len * 2, b.len * 2);
    ctx.restore();
  }
  drawHands(ctx, gr) {
    const k = clamp((gr.t - gr.fire) / 0.5, 0, 1), up = Math.sin(k * Math.PI);
    ctx.fillStyle = '#0b0614'; ctx.strokeStyle = '#b89cff'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU, x = gr.x + Math.cos(a) * gr.r * 0.55, y = gr.y + Math.sin(a) * gr.r * 0.34, h = 34 * up;
      ctx.beginPath(); ctx.moveTo(x - 5, y); ctx.lineTo(x - 3, y - h); ctx.lineTo(x - 6, y - h - 8); ctx.lineTo(x, y - h - 4); ctx.lineTo(x + 6, y - h - 8); ctx.lineTo(x + 3, y - h); ctx.lineTo(x + 5, y); ctx.closePath(); ctx.fill(); ctx.stroke();
    }
  }
  // both eyes of a type baked into one small sprite (one draw per enemy)
  eyeSprite(type) {
    let es = this.eyeSpr[type];
    if (es) return es;
    const eyes = EYES[type], col = ENEMY[type].eye, r = ENEMY[type].r;
    const sz = r > 30 ? 9 : r > 18 ? 7 : 5.5;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const [x, y] of eyes) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, hw = (x1 - x0) / 2 + sz, hh = (y1 - y0) / 2 + sz, K = 3;
    const c = makeCanvas(hw * 2 * K, hh * 2 * K), g = c.getContext('2d');
    g.scale(K, K); g.globalCompositeOperation = 'lighter';
    const gl = this.eyeGlow(col);
    for (const [x, y] of eyes) { const px = x - cx + hw, py = y - cy + hh; g.drawImage(gl, px - sz, py - sz, sz * 2, sz * 2); g.fillStyle = '#ffffff'; g.fillRect(px - 0.8, py - 0.8, 1.6, 1.6); }
    es = this.eyeSpr[type] = { c, cx, cy, hw, hh };
    return es;
  }
  eyeGlow(col) {
    const k = 'eye' + col;
    let c = this.glows.get(k);
    if (c) return c;
    const n = parseInt(col.slice(1), 16);
    c = this.glow(`rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},1)`);
    this.glows.set(k, c);
    return c;
  }
  drawAmbient(ctx, g, dt, cx, cy, hw, hh, t) {
    const F = this.fireflies;
    while (F.length < 34) F.push({ x: cx + (Math.random() - 0.5) * hw * 2, y: cy + (Math.random() - 0.5) * hh * 2, ph: Math.random() * TAU, vx: 0, vy: 0 });
    for (const f of F) {
      f.vx += (Math.random() - 0.5) * 60 * dt; f.vy += (Math.random() - 0.5) * 60 * dt; f.vx *= 0.98; f.vy *= 0.98;
      f.x += f.vx * dt; f.y += f.vy * dt;
      if (Math.abs(f.x - cx) > hw || Math.abs(f.y - cy) > hh) { f.x = cx + (Math.random() - 0.5) * hw * 2; f.y = cy + (Math.random() - 0.5) * hh * 2; }
      const pu = Math.max(0, Math.sin(t * 1.6 + f.ph));
      ctx.globalAlpha = pu * 0.8;
      ctx.drawImage(this.glow('rgba(210,255,120,1)'), f.x - 7, f.y - 7, 14, 14);
    }
    ctx.globalAlpha = 1;
  }
  drawStick(ctx, s) {
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#ffe2a8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(s.ox, s.oy, 54, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,226,168,0.55)'; ctx.beginPath(); ctx.arc(s.ox + s.dx * 54, s.oy + s.dy * 54, 22, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------------------------------- HUD ----------------------------------
  hud(ctx, g, ui, t) {
    const W = this.W, H = this.H, top = ui.safeTop || 0;
    // short landscape (a phone on its side): everything shrinks into the top 20% and nothing prints over the player
    const compact = H < 520 && W > H;
    // XP bar
    const k = clamp(g.xp / g.need, 0, 1);
    const xh = compact ? 8 : 12;
    ctx.fillStyle = 'rgba(8,6,16,0.75)'; ctx.fillRect(0, top, W, xh);
    const gr = ctx.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#ff8a3d'); gr.addColorStop(1, '#ffe27a');
    ctx.fillStyle = gr; ctx.fillRect(0, top, W * this.xpShow(g, k), xh);
    ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fillRect(0, top, W * this.xpShow(g, k), 3);
    ctx.font = `800 ${compact ? 11 : 13}px ${FONT_N}`; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3; ctx.strokeStyle = '#120a04'; ctx.strokeText('LV ' + g.level, W - 8, top + xh / 2); ctx.fillStyle = '#fff2d0'; ctx.fillText('LV ' + g.level, W - 8, top + xh / 2);
    // moon timer (on short landscape phones the card and chest overlays need that space)
    const overlay = g.state === 'chest' || g.state === 'levelup';
    if (!(overlay && H < 520)) this.moonTimer(ctx, g, W / 2, top + (compact ? 10 : 16), t, compact);
    // slots
    const small = W < 520;
    const s1 = compact ? 22 : small ? 26 : 32, s2 = compact ? 18 : small ? 20 : 24;
    let x = 10, y = top + (compact ? 14 : 20);
    for (let i = 0; i < 6; i++) {
      const id = g.actives[i];
      this.slot(ctx, x, y, s1, id, id ? (UP[id].kind === 'evo' ? -1 : g.items[id]) : 0, id ? UP[id].max : 0);
      x += s1 + 4;
      if (small && !compact && i === 2) { x = 10; y += s1 + 10; }
    }
    if (compact) { x += 6; for (let i = 0; i < 4; i++) { const id = g.passives[i]; this.slot(ctx, x, y + 2, s2, id, id ? g.items[id] : 0, 5); x += s2 + 4; } }
    else { x = 10; y += s1 + 10; for (let i = 0; i < 4; i++) { const id = g.passives[i]; this.slot(ctx, x, y, s2, id, id ? g.items[id] : 0, 5); x += s2 + 4; } }
    // kills + embers (top right)
    ctx.textAlign = 'right'; ctx.font = `800 ${compact ? 13 : small ? 15 : 18}px ${FONT_N}`;
    const ky = top + (compact ? 20 : 30), kdy = compact ? 16 : 24;
    this.label(ctx, fmtNum(g.kills), W - 12, ky, '#ffe9c0');
    const kw = ctx.measureText(fmtNum(g.kills)).width;
    this.skull(ctx, W - 22 - kw, ky);
    this.label(ctx, fmtNum(g.embersGot), W - 12, ky + kdy, '#ffc36a');
    const ew = ctx.measureText(fmtNum(g.embersGot)).width;
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(this.glow('rgba(255,170,60,1)'), W - 30 - ew, ky + kdy - 8, 16, 16); ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#fff4d0'; ctx.fillRect(W - 23.5 - ew, ky + kdy - 1.5, 3, 3);
    // one boss bar: the Night Warden's (the Stag carries its own over its head)
    const e = g.boss;
    if (e && !e.dead) {
      const bw = Math.min(compact ? 300 : 440, W - 40), bx = W / 2 - bw / 2, kk = clamp(e.hp / e.maxhp, 0, 1);
      if (compact) {
        const by = top + 74;
        ctx.fillStyle = 'rgba(10,4,16,0.85)'; ctx.fillRect(bx - 1, by - 1, bw + 2, 6);
        const g2 = ctx.createLinearGradient(bx, 0, bx + bw, 0); g2.addColorStop(0, '#7a2cff'); g2.addColorStop(1, '#ff3b6b');
        ctx.fillStyle = g2; ctx.fillRect(bx, by, bw * kk, 4);
      } else {
        const by = top + 132;
        ctx.textAlign = 'center'; ctx.font = `22px ${FONT_B}`;
        this.label(ctx, 'THE NIGHT WARDEN', W / 2, by, '#d9c4ff');
        ctx.fillStyle = 'rgba(10,4,16,0.85)'; ctx.fillRect(bx - 2, by + 12, bw + 4, 12);
        const g2 = ctx.createLinearGradient(bx, 0, bx + bw, 0); g2.addColorStop(0, '#7a2cff'); g2.addColorStop(1, '#ff3b6b');
        ctx.fillStyle = g2; ctx.fillRect(bx, by + 14, bw * kk, 8);
      }
    }
    // banner
    if (g.banner && g.banner.text && g.state !== 'chest' && g.state !== 'levelup') {
      const bt = g.banner.t, dur = g.banner.big ? 3 : 2.6;
      if (bt < dur) {
        const al = bt < 0.2 ? bt / 0.2 : bt > dur - 0.5 ? (dur - bt) / 0.5 : 1;
        const sc = bt < 0.2 ? 1.25 - bt / 0.2 * 0.25 : 1;
        const byy = compact ? H * 0.72 : Math.max(top + 200, H * (g.banner.big ? 0.32 : 0.28));
        ctx.save(); ctx.globalAlpha = al; ctx.translate(W / 2, byy); ctx.scale(sc, sc);
        ctx.textAlign = 'center';
        const fs = g.banner.big ? Math.min(compact ? 40 : 54, W / 11) : Math.min(compact ? 22 : 28, W / 18);
        ctx.font = `${fs}px ${FONT_B}`;
        ctx.lineWidth = g.banner.big ? 7 : 5; ctx.strokeStyle = 'rgba(10,6,4,0.9)'; ctx.strokeText(g.banner.text, 0, 0);
        ctx.fillStyle = g.banner.big ? '#ffe2a8' : '#fff1d6'; ctx.fillText(g.banner.text, 0, 0);
        ctx.restore();
      }
    }
    // off-screen pointers: chests, golden moths, the boss
    const targets = [];
    for (const kk of g.pickups) if (kk.kind === 'chest') targets.push([kk.x, kk.y, '#ffd36b']);
    for (let i = 0; i < g.E.n; i++) { const e = g.E.a[i]; if (!e.dead && e.st !== 'flee' && (e.type === 'lumen' || e.type === 'warden' || e.type === 'stag')) targets.push([e.x, e.y - 20, e.type === 'lumen' ? '#ffe27a' : e.type === 'warden' ? '#c9a8ff' : '#ffb347']); }
    for (const [wx, wy, col] of targets) {
      const sx = this.sx(wx), sy = this.sy(wy);
      if (sx > 20 && sx < W - 20 && sy > 70 && sy < H - 20) continue;
      const ax = clamp(sx, 26, W - 26), ay = clamp(sy, 80, H - 26), an = Math.atan2(sy - H / 2, sx - W / 2);
      ctx.save(); ctx.translate(ax, ay); ctx.rotate(an);
      ctx.fillStyle = col; ctx.strokeStyle = '#120a04'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-8, -10); ctx.lineTo(-3, 0); ctx.lineTo(-8, 10); ctx.closePath(); ctx.stroke(); ctx.fill();
      ctx.restore();
    }
  }
  xpShow(g, k) { this._xp = this._xp === undefined ? k : this._xp + (k - this._xp) * 0.25; if (k < this._xp - 0.3) this._xp = k; return this._xp; }
  label(ctx, s, x, y, col) { ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(12,6,2,0.9)'; ctx.strokeText(s, x, y); ctx.fillStyle = col; ctx.fillText(s, x, y); }
  skull(ctx, x, y) {
    ctx.fillStyle = '#e8dcc0'; ctx.beginPath(); ctx.arc(x, y - 2, 6, 0, TAU); ctx.fill(); ctx.fillRect(x - 3.5, y + 1, 7, 5);
    ctx.fillStyle = '#120a04'; ctx.fillRect(x - 3.5, y - 3, 2.5, 2.5); ctx.fillRect(x + 1, y - 3, 2.5, 2.5);
  }
  slot(ctx, x, y, s, id, lv, max) {
    ctx.fillStyle = id ? 'rgba(242,226,192,0.92)' : 'rgba(20,14,24,0.55)';
    ctx.strokeStyle = id ? '#3a2412' : 'rgba(255,230,180,0.25)'; ctx.lineWidth = 2;
    rr(ctx, x, y, s, s, 6); ctx.fill(); ctx.stroke();
    if (!id) return;
    ctx.drawImage(iconCanvas(id, s * 2), x + 1, y + 1, s - 2, s - 2);
    if (lv === -1) { ctx.strokeStyle = '#ffcc4a'; ctx.lineWidth = 2.5; rr(ctx, x - 1, y - 1, s + 2, s + 2, 7); ctx.stroke(); return; }
    const n = max, pw = (s - 4) / n;
    for (let i = 0; i < n; i++) { ctx.fillStyle = i < lv ? '#ffb347' : 'rgba(20,10,4,0.6)'; ctx.fillRect(x + 2 + i * pw, y + s + 2, pw - 1.2, 3); }
  }
  moonTimer(ctx, g, cx, y, t, compact) {
    const w = compact ? 112 : this.W < 520 ? 160 : 210, h = compact ? 30 : this.W < 520 ? 44 : 54, k = clamp(g.time / RUN_LEN, 0, 1);
    ctx.save();
    ctx.beginPath(); ctx.ellipse(cx, y + h, w / 2, h, 0, Math.PI, TAU); ctx.closePath(); ctx.clip();
    const sky = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    sky.addColorStop(0, 'rgba(10,14,40,0.85)'); sky.addColorStop(0.7, 'rgba(20,20,54,0.85)'); sky.addColorStop(1, `rgba(${80 + 150 * k},${40 + 70 * k},${70},0.9)`);
    ctx.fillStyle = sky; ctx.fillRect(cx - w / 2, y, w, h);
    // stars
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    for (let i = 0; i < 14; i++) { const sx = cx - w / 2 + ((i * 53) % w), sy = y + 6 + ((i * 29) % (h - 14)); if (Math.sin(t * 2 + i) > -0.3) ctx.fillRect(sx, sy, 1.3, 1.3); }
    // horizon treeline
    ctx.fillStyle = '#05070d';
    ctx.beginPath(); ctx.moveTo(cx - w / 2, y + h);
    for (let i = 0; i <= 28; i++) { const xx = cx - w / 2 + i * w / 28; ctx.lineTo(xx, y + h - 6 - (i % 2 ? 7 : 1) - ((i * 7) % 5)); }
    ctx.lineTo(cx + w / 2, y + h); ctx.fill();
    // the moon, setting toward the right
    const ms = compact ? 0.6 : 1;
    const ang = Math.PI * (1 - k * 0.92) , mx = cx + Math.cos(ang) * (w / 2 - 18 * ms), my = y + h - 6 * ms - Math.sin(ang) * (h - 16 * ms);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(this.glow('rgba(200,210,255,1)'), mx - 26 * ms, my - 26 * ms, 52 * ms, 52 * ms);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#f4f0dc'; ctx.beginPath(); ctx.arc(mx, my, 8.5 * ms, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(18,20,50,0.95)'; ctx.beginPath(); ctx.arc(mx - 4 * ms, my - 2 * ms, 7.5 * ms, 0, TAU); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,226,168,0.55)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(cx, y + h, w / 2, h, 0, Math.PI, TAU); ctx.stroke();
    // time
    const left = Math.max(0, RUN_LEN - g.time);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `800 ${compact ? 16 : 22}px ${FONT_N}`;
    this.label(ctx, fmtTime(g.time), cx, y + h + (compact ? 11 : 14), left < 30 ? '#ffd27a' : '#fff4dc');
    if (compact) return;   // the phase line is hidden on short screens
    ctx.font = `15px ${FONT_B}`;
    this.label(ctx, left > 0 ? PHASES[g.phase].name + ' · dawn in ' + fmtTime(left) : 'Dawn', cx, y + h + 34, '#d9c9a8');
  }
}

function rr(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
