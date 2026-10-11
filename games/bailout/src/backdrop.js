// Procedural parallax backgrounds: sky gradient, sun/moon, and three
// silhouette layers per world (far mountains, mid set pieces, near props),
// generated once from a seed. Each layer is baked ONCE into an offscreen tile
// (rebaked only if the zoom changes a lot) and blitted with its parallax
// offset, so a frame costs a handful of drawImage calls on every world. Only
// the sun pulse, the neon signs and the volcano crater stay live.
import { rng, mix, OUTLINE } from './util.js';

const TW = 2200; // tile width in layer units
const TILE_BELOW = 16; // layer units kept below the baseline in the baked tile

function ridge(r, n, base, amp, jag) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const x = (i / n) * TW;
    const y = -base - amp * (0.5 + 0.5 * Math.sin(i * 0.9 + r() * 0.6)) - r() * jag;
    pts.push([x, y]);
  }
  pts[n][1] = pts[0][1];
  return pts;
}

export class Backdrop {
  constructor(themeKey, T) {
    this.key = themeKey; this.T = T;
    const r = rng(themeKey.length * 977 + 3);
    this.layers = [];
    this.stars = [];
    for (let i = 0; i < 90; i++) this.stars.push([r(), r() * 0.6, r() * 1.6 + 0.4, r()]);
    this.clouds = [];
    for (let i = 0; i < 7; i++) this.clouds.push({ x: r() * TW, y: -380 - r() * 220, w: 140 + r() * 180, h: 30 + r() * 26 });
    const L = (p, color, shapes, fill = true) => this.layers.push({ p, color, shapes, fill, top: layerTop(shapes), img: null, haze: null });
    this.cacheScale = 0;
    switch (themeKey) {
      case 'canyon': {
        // far: flat-topped mesas
        const m = []; let x = 0;
        while (x < TW) { const w = 160 + r() * 260, h = 140 + r() * 140; m.push({ k: 'mesa', x, w, h }); x += w + 40 + r() * 160; }
        L(0.05, T.far, m);
        const b = []; x = 60;
        while (x < TW) { const w = 120 + r() * 200, h = 160 + r() * 200; b.push({ k: r() < 0.2 ? 'arch' : 'butte', x, w, h }); x += w + 120 + r() * 240; }
        L(0.16, T.mid, b);
        const n = []; x = 0;
        while (x < TW) { n.push(r() < 0.55 ? { k: 'cactus', x, h: 60 + r() * 70 } : { k: 'rock', x, w: 60 + r() * 120, h: 30 + r() * 50 }); x += 90 + r() * 220; }
        L(0.36, T.near, n);
        break;
      }
      case 'junk': {
        L(0.05, T.far, [{ k: 'ridge', pts: ridge(r, 26, 90, 70, 30) }, { k: 'crane', x: 500, h: 330 }, { k: 'crane', x: 1600, h: 280 }]);
        const s = []; let x = 0;
        while (x < TW) { const n = 1 + Math.floor(r() * 3); s.push({ k: 'cars', x, n, c: r.pick(['#a8643a', '#8a4b2e', '#3f7f7a', '#c47b48', '#5f8f8a']) , c2: r.pick(['#b8543a', '#4f8582', '#c9925a']) }); x += 170 + r() * 220; }
        L(0.17, T.mid, s);
        const n = []; x = 0;
        while (x < TW) { n.push(r() < 0.5 ? { k: 'tyres', x, n: 2 + Math.floor(r() * 3) } : { k: 'post', x, h: 70 + r() * 40 }); x += 110 + r() * 180; }
        L(0.36, T.near, n);
        break;
      }
      case 'glacier': {
        L(0.05, T.far, [{ k: 'peaks', pts: ridge(r, 18, 140, 160, 120), cap: true }]);
        const s = []; let x = 0;
        while (x < TW) { s.push(r() < 0.5 ? { k: 'spire', x, w: 50 + r() * 60, h: 120 + r() * 160 } : { k: 'pine', x, h: 90 + r() * 70 }); x += 70 + r() * 160; }
        L(0.17, T.mid, s);
        const n = []; x = 0;
        while (x < TW) { n.push(r() < 0.6 ? { k: 'pine', x, h: 70 + r() * 60 } : { k: 'drift', x, w: 120 + r() * 140, h: 30 + r() * 30 }); x += 80 + r() * 170; }
        L(0.36, T.near, n);
        break;
      }
      case 'volcano': {
        L(0.04, T.far, [{ k: 'volcano', x: 700, w: 900, h: 330 }, { k: 'ridge', pts: ridge(r, 22, 60, 50, 40) }]);
        const s = []; let x = 0;
        while (x < TW) { s.push({ k: 'crag', x, w: 70 + r() * 90, h: 130 + r() * 170, seed: r() }); x += 110 + r() * 180; }
        L(0.16, T.mid, s);
        const n = []; x = 0;
        while (x < TW) { n.push({ k: 'rock', x, w: 70 + r() * 140, h: 40 + r() * 60, glow: r() < 0.5 }); x += 120 + r() * 200; }
        L(0.36, T.near, n);
        break;
      }
      case 'neon': {
        const f = []; let x = 0;
        while (x < TW) { const w = 70 + r() * 90, h = 160 + r() * 260; f.push({ k: 'tower', x, w, h, win: Array.from({ length: 40 }, () => [r(), r(), r() < 0.5 ? '#ffd76a' : '#2ef2ff', r() < 0.35]) }); x += w + 6 + r() * 30; }
        L(0.05, T.far, f);
        const s = []; x = 0;
        while (x < TW) { const w = 110 + r() * 120, h = 120 + r() * 160; s.push({ k: 'block', x, w, h, sign: r() < 0.7 ? r.pick(['#ff3dbb', '#2ef2ff', '#ffe05a', '#7dff6a']) : null, sy: r() }); x += w + 30 + r() * 90; }
        L(0.16, T.mid, s);
        const n = []; x = 0;
        while (x < TW) { n.push(r() < 0.5 ? { k: 'palm', x, h: 110 + r() * 60 } : { k: 'lamp', x, h: 120 }); x += 160 + r() * 200; }
        L(0.36, T.near, n);
        break;
      }
    }
  }

  // bake every layer's tile at roughly screen resolution; rebake only when the
  // needed scale drifts by more than ~30% (a couple of times per run at most)
  ensureCache(ls, dpr) {
    const want = Math.max(0.6, Math.min(1.25, ls * dpr));
    if (this.cacheScale && Math.abs(want / this.cacheScale - 1) < 0.3) return;
    this.cacheScale = want;
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      const cw = Math.ceil(TW * want), ch = Math.ceil((L.top + TILE_BELOW) * want);
      const c = L.img && L.img.width === cw && L.img.height === ch ? L.img : document.createElement('canvas');
      c.width = cw; c.height = ch;
      const g = c.getContext('2d');
      g.clearRect(0, 0, cw, ch);
      g.translate(0, L.top * want); g.scale(want, want);
      // draw the shapes three times, one tile apart, so anything crossing the tile edge wraps seamlessly
      for (const dx of [-TW, 0, TW]) { g.save(); g.translate(dx, 0); g.fillStyle = L.color; g.strokeStyle = L.color; this.drawShapes(g, L, li, 0, false); g.restore(); }
      L.img = c;
    }
  }

  draw(ctx, W, H, cam, s, t, dpr = 1) {
    const T = this.T;
    // sky (gradient built once per screen height)
    if (this.skyH !== H) { const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, T.sky[0]); g.addColorStop(0.55, T.sky[1]); g.addColorStop(1, T.sky[2]); this.skyG = g; this.skyH = H; }
    ctx.fillStyle = this.skyG; ctx.fillRect(0, 0, W, H);
    const night = this.key === 'neon' || this.key === 'volcano';
    if (night) {
      ctx.fillStyle = '#ffffff';
      for (const [x, y, z, ph] of this.stars) {
        ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t * 2 + ph * 9);
        const sx = ((x * W * 1.3 - cam.x * 0.01 * s) % W + W) % W;
        ctx.fillRect(sx, y * H, z, z);
      }
      ctx.globalAlpha = 1;
    }
    // sun / moon
    const sunX = W * 0.74, sunY = H * (night ? 0.2 : 0.22), sr = Math.min(W, H) * 0.09;
    ctx.fillStyle = T.sun; ctx.globalAlpha = 0.25;
    ctx.beginPath(); ctx.arc(sunX, sunY, sr * 1.6, 0, 7); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.beginPath(); ctx.arc(sunX, sunY, sr, 0, 7); ctx.fill();
    if (this.key === 'neon') { ctx.fillStyle = T.sky[1]; ctx.beginPath(); ctx.arc(sunX + sr * 0.45, sunY - sr * 0.2, sr * 0.85, 0, 7); ctx.fill(); }
    // horizon baseline moves a little with the camera
    const ls = s * 0.9;
    const base = (p) => Math.max(H * 0.35, Math.min(H * 1.05, H * 0.66 - (cam.y - cam.y0) * p * s * 0.9));
    // clouds (not at night)
    if (!night) {
      const b = base(0.03), off = -cam.x * 0.025 * s + t * 6 * s;
      ctx.fillStyle = '#ffffff';
      for (const c of this.clouds) {
        for (let k = -1; k <= 1; k++) {
          const x = (((c.x * ls + off) % (TW * ls)) + TW * ls) % (TW * ls) + k * TW * ls;
          if (x + c.w * ls < 0 || x > W) continue;
          this.cloud(ctx, x, b + c.y * ls, c.w * ls, c.h * ls);
        }
      }
    }
    this.ensureCache(ls, dpr);
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      const by = base(L.p);
      const off = -cam.x * L.p * s;
      const tw = TW * ls;
      const ox = ((off % tw) + tw) % tw - tw;
      const th = (L.top + TILE_BELOW) * ls, ty = by - L.top * ls;
      for (let x0 = ox; x0 < W; x0 += tw) {
        ctx.drawImage(L.img, x0, ty, tw + 1, th);
        // the few animated bits are drawn live on top of the baked tile
        if (L.live) { ctx.save(); ctx.translate(x0, by); ctx.scale(ls, ls); this.drawLive(ctx, L, t); ctx.restore(); }
      }
      ctx.fillStyle = L.color; ctx.fillRect(0, by + TILE_BELOW * ls - 2, W, H - by + 2);
      // atmospheric haze band at the foot of each layer (gradient in unit space, built once)
      if (!L.haze) { const hg = ctx.createLinearGradient(0, 0, 0, 1); hg.addColorStop(0, 'rgba(255,255,255,0)'); hg.addColorStop(1, hexA(T.haze, li === 0 ? 0.35 : 0.18)); L.haze = hg; }
      ctx.save(); ctx.translate(0, by - 120 * ls); ctx.scale(1, 130 * ls); ctx.fillStyle = L.haze; ctx.fillRect(0, 0, W, 1); ctx.restore();
    }
  }

  // live overlays: neon sign flicker, volcano crater pulse (everything else is baked)
  drawLive(ctx, L, t) {
    for (const sh of L.shapes) {
      if (sh.k === 'block' && sh.sign) {
        const { x, w, h } = sh;
        const sy = -h + 20 + sh.sy * (h - 80), sw = w * 0.7;
        const fl = Math.sin(t * 7 + x) > -0.92 ? 1 : 0.3;
        ctx.globalAlpha = 0.25 * fl; ctx.fillStyle = sh.sign; ctx.fillRect(x + w * 0.15 - 8, sy - 8, sw + 16, 46);
        ctx.globalAlpha = fl; ctx.strokeStyle = sh.sign; ctx.lineWidth = 4; ctx.strokeRect(x + w * 0.15, sy, sw, 30);
        ctx.fillRect(x + w * 0.15 + 10, sy + 12, sw * 0.5, 6);
        ctx.globalAlpha = 1;
      } else if (sh.k === 'volcano') {
        const { x, h } = sh;
        ctx.fillStyle = '#ff6a2a'; ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2);
        ctx.beginPath(); ctx.ellipse(x, -h, 66, 10, 0, 0, 7); ctx.fill();
        ctx.globalAlpha = 1;
      }
    }
  }

  cloud(ctx, x, y, w, h) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x + w * 0.25, y - h * 0.25, h * 0.75, Math.PI, Math.PI * 1.9);
    ctx.arc(x + w * 0.55, y - h * 0.55, h * 1.0, Math.PI * 1.15, Math.PI * 1.95);
    ctx.arc(x + w * 0.82, y - h * 0.2, h * 0.65, Math.PI * 1.2, Math.PI * 2);
    ctx.lineTo(x + w, y); ctx.closePath();
    ctx.globalAlpha = 0.92; ctx.fill(); ctx.globalAlpha = 1;
  }

  drawShapes(ctx, L, li, t, live = true) {
    const T = this.T, col = L.color;
    for (const sh of L.shapes) {
      if (sh.k === 'block' && sh.sign) L.live = true;
      if (sh.k === 'volcano') L.live = true;
      switch (sh.k) {
        case 'mesa': {
          ctx.beginPath(); ctx.moveTo(sh.x - 30, 0); ctx.lineTo(sh.x, -sh.h); ctx.lineTo(sh.x + sh.w, -sh.h); ctx.lineTo(sh.x + sh.w + 30, 0); ctx.fill();
          ctx.fillStyle = mix(col, '#ffffff', 0.18); ctx.fillRect(sh.x + 4, -sh.h, sh.w - 8, 10); ctx.fillStyle = col;
          break;
        }
        case 'butte': case 'arch': {
          ctx.beginPath(); ctx.moveTo(sh.x - 20, 0); ctx.lineTo(sh.x + 10, -sh.h * 0.85); ctx.lineTo(sh.x + 26, -sh.h); ctx.lineTo(sh.x + sh.w - 20, -sh.h); ctx.lineTo(sh.x + sh.w - 6, -sh.h * 0.8); ctx.lineTo(sh.x + sh.w + 24, 0);
          if (sh.k === 'arch') { const cx = sh.x + sh.w / 2; ctx.lineTo(cx + sh.w * 0.28, 0); ctx.arc(cx, 0, sh.w * 0.28, 0, Math.PI, true); }
          ctx.closePath(); ctx.fill();
          ctx.strokeStyle = mix(col, '#ffffff', 0.15); ctx.lineWidth = 5;
          for (let k = 1; k < 4; k++) { const y = -sh.h + k * sh.h * 0.22; ctx.beginPath(); ctx.moveTo(sh.x + 14 + k * 2, y); ctx.lineTo(sh.x + sh.w - 10 - k * 2, y); ctx.stroke(); }
          ctx.fillStyle = mix(col, '#ffffff', 0.2); ctx.fillRect(sh.x + 26, -sh.h, sh.w - 46, 8); ctx.fillStyle = col;
          break;
        }
        case 'cactus': {
          const h = sh.h, x = sh.x;
          ctx.lineCap = 'round'; ctx.lineWidth = 18; ctx.strokeStyle = col;
          ctx.beginPath(); ctx.moveTo(x, 4); ctx.lineTo(x, -h); ctx.stroke();
          ctx.lineWidth = 11;
          ctx.beginPath(); ctx.moveTo(x, -h * 0.45); ctx.lineTo(x - 20, -h * 0.45); ctx.lineTo(x - 20, -h * 0.75); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x, -h * 0.6); ctx.lineTo(x + 18, -h * 0.6); ctx.lineTo(x + 18, -h * 0.85); ctx.stroke();
          break;
        }
        case 'rock': {
          ctx.beginPath(); ctx.moveTo(sh.x, 4); ctx.lineTo(sh.x + sh.w * 0.15, -sh.h * 0.7); ctx.lineTo(sh.x + sh.w * 0.45, -sh.h); ctx.lineTo(sh.x + sh.w * 0.8, -sh.h * 0.6); ctx.lineTo(sh.x + sh.w, 4); ctx.fill();
          if (sh.glow) { ctx.strokeStyle = '#ff7a2a'; ctx.lineWidth = 3; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 3 + sh.x); ctx.beginPath(); ctx.moveTo(sh.x + sh.w * 0.3, -sh.h * 0.5); ctx.lineTo(sh.x + sh.w * 0.45, -sh.h * 0.2); ctx.lineTo(sh.x + sh.w * 0.6, -sh.h * 0.35); ctx.stroke(); ctx.globalAlpha = 1; }
          break;
        }
        case 'ridge': case 'peaks': {
          ctx.beginPath(); ctx.moveTo(0, 10);
          for (const [x, y] of sh.pts) ctx.lineTo(x, y);
          ctx.lineTo(TW, 10); ctx.closePath(); ctx.fill();
          if (sh.cap) {
            ctx.fillStyle = '#ffffff';
            const p = sh.pts;
            for (let i = 1; i < p.length - 1; i++) {
              if (p[i][1] < p[i - 1][1] && p[i][1] < p[i + 1][1]) {
                const [x, y] = p[i];
                ctx.beginPath(); ctx.moveTo(x, y);
                ctx.lineTo(x + (p[i + 1][0] - x) * 0.3, y + (p[i + 1][1] - y) * 0.3);
                ctx.lineTo(x + 8, y + 26); ctx.lineTo(x - 6, y + 18);
                ctx.lineTo(x + (p[i - 1][0] - x) * 0.3, y + (p[i - 1][1] - y) * 0.3);
                ctx.fill();
              }
            }
            ctx.fillStyle = col;
          }
          break;
        }
        case 'crane': {
          ctx.lineWidth = 10; ctx.lineCap = 'butt';
          ctx.beginPath(); ctx.moveTo(sh.x, 0); ctx.lineTo(sh.x, -sh.h); ctx.lineTo(sh.x + 220, -sh.h + 20); ctx.moveTo(sh.x - 60, -sh.h + 10); ctx.lineTo(sh.x, -sh.h); ctx.stroke();
          ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(sh.x + 190, -sh.h + 18); ctx.lineTo(sh.x + 190, -sh.h + 120); ctx.stroke();
          ctx.beginPath(); ctx.arc(sh.x + 190, -sh.h + 132, 16, Math.PI, 0); ctx.fill();
          break;
        }
        case 'cars': {
          let y = 0;
          for (let k = 0; k < sh.n; k++) {
            const w = 120 - k * 6, h = 36, x = sh.x + k * 7;
            ctx.fillStyle = k % 2 ? sh.c2 : sh.c;
            ctx.beginPath(); ctx.roundRect(x, y - h, w, h, 6); ctx.fill();
            ctx.fillStyle = 'rgba(27,27,42,0.35)'; ctx.fillRect(x + 14, y - h + 6, 30, 12); ctx.fillRect(x + 52, y - h + 6, 30, 12);
            ctx.fillStyle = 'rgba(27,27,42,0.6)'; ctx.beginPath(); ctx.arc(x + 22, y - 2, 9, 0, 7); ctx.arc(x + w - 22, y - 2, 9, 0, 7); ctx.fill();
            y -= h;
          }
          ctx.fillStyle = col;
          break;
        }
        case 'tyres': {
          for (let k = 0; k < sh.n; k++) { ctx.beginPath(); ctx.ellipse(sh.x, -10 - k * 20, 30, 11, 0, 0, 7); ctx.fill(); ctx.fillStyle = mix(col, '#000000', 0.3); ctx.beginPath(); ctx.ellipse(sh.x, -12 - k * 20, 14, 5, 0, 0, 7); ctx.fill(); ctx.fillStyle = col; }
          break;
        }
        case 'post': {
          ctx.fillRect(sh.x - 4, -sh.h, 8, sh.h + 4);
          ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.globalAlpha = 0.6;
          for (let k = 0; k < 9; k++) { ctx.beginPath(); ctx.moveTo(sh.x + k * 16, -sh.h + 8); ctx.lineTo(sh.x + k * 16 + 50, -8); ctx.moveTo(sh.x + k * 16 + 50, -sh.h + 8); ctx.lineTo(sh.x + k * 16, -8); ctx.stroke(); }
          ctx.globalAlpha = 1;
          ctx.fillRect(sh.x, -sh.h + 4, 150, 4);
          break;
        }
        case 'spire': {
          ctx.beginPath(); ctx.moveTo(sh.x, 4); ctx.lineTo(sh.x + sh.w * 0.35, -sh.h); ctx.lineTo(sh.x + sh.w * 0.6, -sh.h * 0.75); ctx.lineTo(sh.x + sh.w, 4); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.45)';
          ctx.beginPath(); ctx.moveTo(sh.x + sh.w * 0.35, -sh.h); ctx.lineTo(sh.x + sh.w * 0.45, 4); ctx.lineTo(sh.x + sh.w * 0.2, 4); ctx.fill();
          ctx.fillStyle = col;
          break;
        }
        case 'pine': {
          const h = sh.h, x = sh.x;
          ctx.fillRect(x - 4, -h * 0.2, 8, h * 0.2 + 4);
          for (let k = 0; k < 3; k++) {
            const y = -h * (0.15 + k * 0.28), w = h * (0.42 - k * 0.1);
            ctx.beginPath(); ctx.moveTo(x - w, y); ctx.lineTo(x, y - h * 0.4); ctx.lineTo(x + w, y); ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.beginPath(); ctx.moveTo(x - w * 0.45, y - h * 0.22); ctx.lineTo(x, y - h * 0.4); ctx.lineTo(x + w * 0.45, y - h * 0.22); ctx.lineTo(x, y - h * 0.27); ctx.fill(); ctx.fillStyle = col;
          }
          break;
        }
        case 'drift': { ctx.beginPath(); ctx.ellipse(sh.x, 0, sh.w / 2, sh.h, 0, Math.PI, 0); ctx.fill(); break; }
        case 'volcano': {
          const { x, w, h } = sh;
          ctx.beginPath(); ctx.moveTo(x - w / 2, 10); ctx.lineTo(x - 70, -h); ctx.lineTo(x + 70, -h); ctx.lineTo(x + w / 2, 10); ctx.fill();
          ctx.fillStyle = '#ff6a2a'; ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 2);
          ctx.beginPath(); ctx.ellipse(x, -h, 66, 10, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = '#ff6a2a'; ctx.lineWidth = 6; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x - 30, -h + 4); ctx.quadraticCurveTo(x - 60, -h * 0.6, x - 120, -h * 0.25); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(x + 24, -h + 4); ctx.quadraticCurveTo(x + 50, -h * 0.5, x + 70, -h * 0.1); ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = 'rgba(40,24,30,0.75)';
          for (let k = 0; k < 6; k++) { const py = -h - 40 - k * 46, px = x + Math.sin(0.4 + k) * 20 + k * 22; ctx.beginPath(); ctx.arc(px, py, 34 + k * 10, 0, 7); ctx.fill(); }
          ctx.fillStyle = col;
          break;
        }
        case 'crag': {
          const { x, w, h } = sh;
          ctx.beginPath(); ctx.moveTo(x, 6); ctx.lineTo(x + w * 0.2, -h * 0.6); ctx.lineTo(x + w * 0.38, -h); ctx.lineTo(x + w * 0.55, -h * 0.7); ctx.lineTo(x + w * 0.7, -h * 0.85); ctx.lineTo(x + w, 6); ctx.fill();
          ctx.strokeStyle = '#ff5a1f'; ctx.lineWidth = 2.5; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(t * 2 + sh.seed * 10);
          ctx.beginPath(); ctx.moveTo(x + w * 0.38, -h * 0.9); ctx.lineTo(x + w * 0.45, -h * 0.5); ctx.lineTo(x + w * 0.36, -h * 0.25); ctx.lineTo(x + w * 0.5, 0); ctx.stroke();
          ctx.globalAlpha = 1;
          break;
        }
        case 'tower': {
          const { x, w, h } = sh;
          ctx.fillRect(x, -h, w, h + 6);
          ctx.fillRect(x + w * 0.45, -h - 30, 3, 30);
          for (let i = 0; i < sh.win.length; i++) {
            const [a, b, c, on] = sh.win[i];
            if (!on) continue;
            ctx.fillStyle = c; ctx.globalAlpha = 0.55;
            ctx.fillRect(x + 6 + Math.floor(a * ((w - 16) / 10)) * 10, -h + 10 + Math.floor(b * ((h - 20) / 14)) * 14, 5, 7);
          }
          ctx.globalAlpha = 1; ctx.fillStyle = col;
          break;
        }
        case 'block': {
          const { x, w, h } = sh;
          ctx.fillRect(x, -h, w, h + 6);
          // the sign itself is live (it flickers): see drawLive
          break;
        }
        case 'palm': {
          const { x, h } = sh;
          ctx.lineWidth = 9; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(x, 4); ctx.quadraticCurveTo(x + 14, -h * 0.5, x + 4, -h); ctx.stroke();
          for (let k = 0; k < 6; k++) {
            const a = -Math.PI / 2 + (k - 2.5) * 0.55;
            ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(x + 4, -h);
            ctx.quadraticCurveTo(x + 4 + Math.cos(a) * 40, -h + Math.sin(a) * 40 - 10, x + 4 + Math.cos(a) * 64, -h + Math.sin(a) * 30 + 20); ctx.stroke();
          }
          break;
        }
        case 'lamp': {
          const { x, h } = sh;
          ctx.fillRect(x - 3, -h, 6, h + 4); ctx.fillRect(x - 3, -h, 30, 5);
          ctx.fillStyle = '#ffe9a0'; ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(x + 22, -h + 5); ctx.lineTo(x - 10, 0); ctx.lineTo(x + 60, 0); ctx.fill();
          ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(x + 24, -h + 7, 5, 0, 7); ctx.fill(); ctx.fillStyle = col;
          break;
        }
      }
    }
  }
}

// how far above the baseline a layer's tallest shape reaches (layer units)
function layerTop(shapes) {
  let top = 60;
  for (const sh of shapes) {
    let h = sh.h || 0;
    switch (sh.k) {
      case 'ridge': case 'peaks': h = -Math.min(...sh.pts.map((p) => p[1])) + 20; break;
      case 'volcano': h = sh.h + 40 + 5 * 46 + 84; break;
      case 'tower': h = sh.h + 36; break;
      case 'cars': h = sh.n * 36 + 6; break;
      case 'tyres': h = sh.n * 20 + 14; break;
      case 'crane': h = sh.h + 24; break;
      case 'cactus': case 'pine': case 'palm': case 'lamp': case 'post': h = sh.h + 12; break;
      default: h = (sh.h || 0) + 16;
    }
    if (h > top) top = h;
  }
  return Math.ceil(top + 8);
}

export function hexA(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
export { OUTLINE };
