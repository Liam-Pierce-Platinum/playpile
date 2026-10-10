// All the painting: a cached sunset backdrop, the street, the crane, every
// block by material, the wrecking ball, particles and popups. Flat,
// bold-outlined, illustrative shapes in world units (y up).
import { MATS, DISTRICTS } from './levels.js';

export const OUT = '#1d1630';
const TILE = 64;

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
export function mix(a, b, t) { const A = hex(a), B = hex(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }

// ------------------------------------------------------------------ material tiles
function tile(draw) { const c = document.createElement('canvas'); c.width = c.height = TILE; draw(c.getContext('2d')); return c; }
function makeTiles(ctx) {
  const P = {};
  const pat = (name, c) => { const p = ctx.createPattern(c, 'repeat'); p.setTransform(new DOMMatrix().scale(1 / TILE)); P[name] = p; };
  for (const m of ['brick', 'stack']) {
    const M = MATS.brick, r = rng(m === 'brick' ? 7 : 9);
    pat(m, tile((g) => {
      g.fillStyle = M.dark; g.fillRect(0, 0, TILE, TILE);
      for (let row = 0; row < 4; row++) for (let i = -1; i < 3; i++) {
        const x = i * 32 + (row % 2 ? 16 : 0);
        g.fillStyle = mix(M.col, r() < 0.5 ? M.lite : M.dark, r() * 0.25);
        g.fillRect(x + 1.5, row * 16 + 1.5, 29, 13);
      }
    }));
  }
  pat('stucco', tile((g) => { const r = rng(3); g.fillStyle = MATS.stucco.col; g.fillRect(0, 0, TILE, TILE); g.fillStyle = 'rgba(120,80,40,.10)'; for (let i = 0; i < 40; i++) g.fillRect(r() * TILE, r() * TILE, 2, 2); g.fillStyle = 'rgba(120,80,40,.18)'; g.fillRect(0, 31, TILE, 2); }));
  pat('concrete', tile((g) => { const r = rng(5); g.fillStyle = MATS.concrete.col; g.fillRect(0, 0, TILE, TILE); g.fillStyle = 'rgba(60,50,90,.12)'; for (let i = 0; i < 30; i++) g.fillRect(r() * TILE, r() * TILE, 2, 2); g.fillStyle = 'rgba(60,50,90,.14)'; g.fillRect(0, 0, TILE, 1.5); }));
  pat('wood', tile((g) => { g.fillStyle = MATS.wood.col; g.fillRect(0, 0, TILE, TILE); g.fillStyle = MATS.wood.dark; for (let y = 0; y < TILE; y += 16) g.fillRect(0, y, TILE, 2); g.strokeStyle = 'rgba(80,40,15,.35)'; g.lineWidth = 1; for (let y = 6; y < TILE; y += 16) { g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(20, y + 3, 40, y - 3, 64, y + 1); g.stroke(); } }));
  pat('metal', tile((g) => { g.fillStyle = MATS.metal.col; g.fillRect(0, 0, TILE, TILE); for (let x = 0; x < TILE; x += 8) { g.fillStyle = MATS.metal.lite; g.fillRect(x, 0, 3, TILE); g.fillStyle = MATS.metal.dark; g.fillRect(x + 5, 0, 2, TILE); } }));
  pat('roof', tile((g) => { g.fillStyle = '#6e3446'; g.fillRect(0, 0, TILE, TILE); g.fillStyle = '#4e2234'; for (let y = 0; y < TILE; y += 16) { g.fillRect(0, y, TILE, 3); for (let x = (y / 16) % 2 ? 8 : 0; x < TILE; x += 16) g.fillRect(x, y, 2, 16); } }));
  return P;
}

// ------------------------------------------------------------------ backdrop
function backdrop(W, H, gy, d, dpr) {
  const c = document.createElement('canvas'); c.width = Math.ceil(W * dpr); c.height = Math.ceil(H * dpr);
  const g = c.getContext('2d'); g.scale(dpr, dpr);
  const D = DISTRICTS[d], r = rng(11 + d * 31);
  const hz = Math.max(H * 0.35, gy);
  const sky = g.createLinearGradient(0, 0, 0, hz);
  sky.addColorStop(0, D.sky[0]); sky.addColorStop(0.45, D.sky[1]); sky.addColorStop(0.78, D.sky[2]); sky.addColorStop(1, D.sky[3]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // stars up top
  g.fillStyle = 'rgba(255,240,220,.55)';
  for (let i = 0; i < 40; i++) { const y = r() * hz * 0.35; g.globalAlpha = 0.6 * (1 - y / (hz * 0.35)); g.fillRect(r() * W, y, 1.5, 1.5); }
  g.globalAlpha = 1;
  // sun with retro stripes
  const sr = Math.min(W, H) * 0.17, sx = W * 0.7, sy = hz - sr * 0.55;
  const glow = g.createRadialGradient(sx, sy, sr * 0.5, sx, sy, sr * 3);
  glow.addColorStop(0, 'rgba(255,220,150,.55)'); glow.addColorStop(1, 'rgba(255,160,120,0)');
  g.fillStyle = glow; g.fillRect(0, 0, W, H);
  g.save(); g.beginPath(); g.arc(sx, sy, sr, 0, Math.PI * 2); g.clip();
  const sg = g.createLinearGradient(0, sy - sr, 0, sy + sr); sg.addColorStop(0, D.sun); sg.addColorStop(1, '#ff9a5c');
  g.fillStyle = sg; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) { const yy = sy + sr * (0.1 + i * 0.16); g.fillRect(sx - sr, yy, sr * 2, 2 + i * 1.6); }
  g.restore();
  // clouds
  for (let i = 0; i < 7; i++) {
    const cx = r() * W, cy = hz * (0.18 + r() * 0.5), w = 60 + r() * 160, h = 10 + r() * 14;
    g.fillStyle = mix(D.sky[2], '#ffffff', 0.25 + r() * 0.2); g.globalAlpha = 0.55;
    roundRect(g, cx - w / 2, cy - h / 2, w, h, h / 2); g.fill();
    roundRect(g, cx - w * 0.2, cy - h * 1.1, w * 0.45, h * 1.1, h / 2); g.fill();
    g.fillStyle = mix(D.sky[1], '#000000', 0.1); g.globalAlpha = 0.35;
    roundRect(g, cx - w / 2 + 8, cy + h * 0.15, w - 16, h * 0.35, h * 0.2); g.fill();
    g.globalAlpha = 1;
  }
  // haze
  const hzg = g.createLinearGradient(0, hz - H * 0.25, 0, hz);
  hzg.addColorStop(0, 'rgba(0,0,0,0)'); hzg.addColorStop(1, D.haze + '88');
  g.fillStyle = hzg; g.fillRect(0, hz - H * 0.25, W, H * 0.25);
  // far and near skylines
  const unit = Math.max(8, Math.min(W, H) / 40);
  for (const layer of [0, 1]) {
    const col = layer ? D.near : D.far;
    let x = -20;
    while (x < W + 20) {
      const bw = unit * (2 + r() * 4) * (layer ? 1.3 : 1), bh = unit * (layer ? 3 + r() * 7 : 5 + r() * 12) * (d === 1 ? 1.4 : 1);
      const top = hz - bh;
      g.fillStyle = col; g.fillRect(x, top, bw, bh + 4);
      if (d === 0 && r() < 0.25) { g.beginPath(); g.moveTo(x, top); g.lineTo(x + bw / 2, top - bw * 0.6); g.lineTo(x + bw, top); g.fill(); }
      if (d === 0 && r() < 0.2) { g.fillRect(x + bw * 0.3, top - unit * 1.4, bw * 0.4, unit * 1.4); g.fillRect(x + bw * 0.25, top - unit * 1.9, bw * 0.5, unit * 0.6); }
      if (d === 1 && r() < 0.35) { g.fillRect(x + bw * 0.45, top - unit * 3, unit * 0.18, unit * 3); }
      if (d === 1 && r() < 0.25) { g.fillRect(x + bw * 0.15, top - unit * 1.5, bw * 0.7, unit * 1.5); }
      if (d === 2 && r() < 0.35) { const cw = unit * 0.8; g.fillRect(x + bw * 0.3, top - unit * 6, cw, unit * 6); g.fillStyle = 'rgba(255,230,210,.18)'; for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + bw * 0.3 + cw / 2 + k * unit * 1.1, top - unit * 6.5 - k * unit * 0.7, unit * (0.6 + k * 0.3), 0, Math.PI * 2); g.fill(); } g.fillStyle = col; }
      if (d === 2 && r() < 0.2) { g.beginPath(); g.arc(x + bw / 2, hz, bw * 0.55, Math.PI, 0); g.fill(); }
      // windows
      g.fillStyle = layer ? 'rgba(255,214,140,.55)' : 'rgba(255,214,160,.28)';
      for (let wy = top + unit * 0.6; wy < hz - unit * 0.6; wy += unit * 0.9) for (let wx = x + unit * 0.4; wx < x + bw - unit * 0.5; wx += unit * 0.8) if (r() < 0.22) g.fillRect(wx, wy, unit * 0.35, unit * 0.4);
      x += bw + (layer ? r() * unit * 0.8 : r() * unit * 0.3);
    }
  }
  return c;
}

export function roundRect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

// ------------------------------------------------------------------ renderer
export class Renderer {
  constructor(ctx) { this.ctx = ctx; this.tiles = makeTiles(ctx); this.bgKey = ''; this.bg = null; this.t = 0; }

  // camera: s px per unit (css px), cx/cy world centre, W/H css px
  setCam(cam, W, H, dpr) { this.cam = cam; this.W = W; this.H = H; this.dpr = dpr; }
  sx(x) { return (x - this.cam.x) * this.cam.s + this.W / 2 + this.cam.ox; }
  sy(y) { return this.H / 2 - (y - this.cam.y) * this.cam.s + this.cam.oy; }
  world() { const c = this.cam, k = this.dpr * c.s; this.ctx.setTransform(k, 0, 0, -k, (this.W / 2 + c.ox - c.x * c.s) * this.dpr, (this.H / 2 + c.oy + c.y * c.s) * this.dpr); }
  local(x, y, a, flipText) {
    const c = this.cam, k = this.dpr * c.s, co = Math.cos(a), si = Math.sin(a);
    const e = (this.W / 2 + c.ox + (x - c.x) * c.s) * this.dpr, f = (this.H / 2 + c.oy - (y - c.y) * c.s) * this.dpr;
    if (flipText) this.ctx.setTransform(k * co, -k * si, k * si, k * co, e, f);
    else this.ctx.setTransform(k * co, -k * si, -k * si, -k * co, e, f);
  }
  screen() { this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); }

  background(d) {
    const gy = Math.round(this.sy(0) / 8) * 8;
    const key = `${this.W}x${this.H}:${d}:${gy}:${this.dpr}`;
    if (key !== this.bgKey) { this.bg = backdrop(this.W, this.H, gy, d, this.dpr); this.bgKey = key; }
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.drawImage(this.bg, 0, 0);
  }

  street(x0, x1) {
    const g = this.ctx; this.world();
    g.fillStyle = '#2b2440'; g.fillRect(x0, -30, x1 - x0, 30);
    g.fillStyle = '#75628a'; g.fillRect(x0, -0.32, x1 - x0, 0.32);
    g.fillStyle = '#5a4a70'; g.fillRect(x0, -0.42, x1 - x0, 0.1);
    g.fillStyle = '#f5c451';
    for (let x = Math.floor(x0 / 2.4) * 2.4; x < x1; x += 2.4) g.fillRect(x, -1.35, 1.2, 0.12);
    g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(x0, -0.62, x1 - x0, 0.2);
  }

  crane(cr, balls, spiked) {
    const g = this.ctx; this.world();
    const lw = Math.max(1.3 / (this.cam.s), 0.05);
    const Y = '#ffc233', YD = '#d99a12';
    const mx = cr.mastX, top = cr.jibY;
    g.lineJoin = 'round'; g.lineCap = 'round';
    // footing
    g.fillStyle = '#9c94ae'; g.strokeStyle = OUT; g.lineWidth = lw;
    g.fillRect(mx - 1.1, -0.1, 2.2, 0.55); g.strokeRect(mx - 1.1, -0.1, 2.2, 0.55);
    // mast lattice
    const mw = 0.5;
    g.strokeStyle = OUT; g.lineWidth = lw * 3.2; this.lattice(mx - mw, 0.45, mx + mw, top, true);
    g.strokeStyle = Y; g.lineWidth = lw * 1.6; this.lattice(mx - mw, 0.45, mx + mw, top, true);
    // tower head + ties
    g.strokeStyle = OUT; g.lineWidth = lw * 0.9;
    g.beginPath(); g.moveTo(mx, top + 3); g.lineTo(cr.jibEnd - 1, top + 0.75); g.moveTo(mx, top + 3); g.lineTo(cr.cjEnd + 0.4, top + 0.5); g.moveTo(mx, top + 3); g.lineTo(mx + (cr.jibEnd - mx) * 0.45, top + 0.75); g.stroke();
    g.fillStyle = Y; g.beginPath(); g.moveTo(mx - mw, top + 0.7); g.lineTo(mx, top + 3.1); g.lineTo(mx + mw, top + 0.7); g.closePath(); g.fill(); g.lineWidth = lw; g.stroke();
    // jib truss
    g.strokeStyle = OUT; g.lineWidth = lw * 3.2; this.lattice(mx - 0.2, top, cr.jibEnd, top + 0.75, false);
    g.strokeStyle = Y; g.lineWidth = lw * 1.6; this.lattice(mx - 0.2, top, cr.jibEnd, top + 0.75, false);
    // counter-jib + weights
    g.fillStyle = YD; g.fillRect(cr.cjEnd, top + 0.15, mx - cr.cjEnd, 0.45); g.strokeStyle = OUT; g.lineWidth = lw; g.strokeRect(cr.cjEnd, top + 0.15, mx - cr.cjEnd, 0.45);
    g.fillStyle = '#8c84a0'; for (let i = 0; i < 3; i++) { g.fillRect(cr.cjEnd + 0.2 + i * 0.62, top - 1.1, 0.56, 1.25); g.strokeRect(cr.cjEnd + 0.2 + i * 0.62, top - 1.1, 0.56, 1.25); }
    // cab
    g.fillStyle = Y; g.fillRect(mx + 0.5, top - 1.25, 1.2, 1.15); g.strokeRect(mx + 0.5, top - 1.25, 1.2, 1.15);
    g.fillStyle = '#9fe3ff'; g.fillRect(mx + 0.95, top - 0.95, 0.62, 0.6); g.strokeRect(mx + 0.95, top - 0.95, 0.62, 0.6);
    g.fillStyle = '#ff5a5f'; g.beginPath(); g.arc(cr.jibEnd - 0.1, top + 0.95, 0.12, 0, 7); g.fill();
    if (Math.sin(this.t * 5) > 0) { g.fillStyle = 'rgba(255,90,95,.35)'; g.beginPath(); g.arc(cr.jibEnd - 0.1, top + 0.95, 0.4, 0, 7); g.fill(); }
    // trolley
    const tx = cr.x, ty = top - 0.05;
    g.fillStyle = '#3d3a5c'; g.fillRect(tx - 0.45, ty - 0.38, 0.9, 0.38); g.strokeRect(tx - 0.45, ty - 0.38, 0.9, 0.38);
    g.fillStyle = OUT; g.beginPath(); g.arc(tx - 0.25, ty, 0.1, 0, 7); g.arc(tx + 0.25, ty, 0.1, 0, 7); g.fill();
    // cable(s)
    const b = balls[0];
    const ang = Math.atan2(b.x - tx, ty - 0.38 - b.y);
    const ax = b.x - Math.sin(ang) * (b.r + 0.32), ay = b.y + Math.cos(ang) * (b.r + 0.32);
    g.strokeStyle = OUT; g.lineWidth = lw * 1.5;
    g.beginPath(); g.moveTo(tx - 0.12, ty - 0.38); g.lineTo(ax - 0.05, ay); g.moveTo(tx + 0.12, ty - 0.38); g.lineTo(ax + 0.05, ay); g.stroke();
    // hook block
    this.local(ax, ay, -ang);
    g.fillStyle = Y; g.fillRect(-0.2, -0.1, 0.4, 0.34); g.strokeStyle = OUT; g.lineWidth = lw; g.strokeRect(-0.2, -0.1, 0.4, 0.34);
    g.fillStyle = OUT; g.fillRect(-0.05, -0.32 + 0.1, 0.1, 0.22);
    // chain to ball 2
    if (balls[1]) {
      const b2 = balls[1]; this.world();
      const dx = b2.x - b.x, dy = b2.y - b.y, d = Math.hypot(dx, dy), n = Math.max(3, Math.round(d / 0.32));
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = b.x + dx * t, y = b.y + dy * t;
        this.local(x, y, Math.atan2(dy, dx) + (i % 2 ? Math.PI / 2 : 0));
        g.strokeStyle = OUT; g.lineWidth = lw * 2.6; g.beginPath(); g.ellipse(0, 0, 0.17, 0.09, 0, 0, 7); g.stroke();
        g.strokeStyle = '#8c88a8'; g.lineWidth = lw * 1.2; g.stroke();
      }
    }
    for (const bb of balls) this.ball(bb, spiked);
  }
  lattice(x0, y0, x1, y1, vertical) {
    const g = this.ctx;
    g.beginPath();
    if (vertical) {
      g.moveTo(x0, y0); g.lineTo(x0, y1); g.moveTo(x1, y0); g.lineTo(x1, y1);
      const step = x1 - x0; let y = y0, s = 0;
      g.moveTo(x0, y0);
      while (y < y1) { y = Math.min(y1, y + step); g.lineTo(s ? x0 : x1, y); s ^= 1; }
    } else {
      g.moveTo(x0, y0); g.lineTo(x1, y0); g.moveTo(x0, y1); g.lineTo(x1, y1);
      const step = (y1 - y0); let x = x0, s = 0; g.moveTo(x0, y0);
      while (x < x1) { x = Math.min(x1, x + step); g.lineTo(x, s ? y0 : y1); s ^= 1; }
      g.moveTo(x1, y0); g.lineTo(x1, y1);
    }
    g.stroke();
  }
  ball(b, spiked) {
    const g = this.ctx, r = b.r, lw = Math.max(1.3 / this.cam.s, 0.05);
    const sq = (b.data && b.data.sq) || 0, sa = (b.data && b.data.sqA) || 0;
    const squash = (rel) => { if (sq > 0.005) { g.rotate(rel); g.scale(1 - sq, 1 + sq * 0.6); g.rotate(-rel); } };
    this.local(b.x, b.y, b.a); squash(sa - b.a);
    if (spiked) {
      g.fillStyle = '#c9c6dc'; g.strokeStyle = OUT; g.lineWidth = lw;
      for (let i = 0; i < 10; i++) {
        const a = i / 10 * Math.PI * 2;
        g.beginPath(); g.moveTo(Math.cos(a - 0.22) * r * 0.9, Math.sin(a - 0.22) * r * 0.9); g.lineTo(Math.cos(a) * (r + 0.32), Math.sin(a) * (r + 0.32)); g.lineTo(Math.cos(a + 0.22) * r * 0.9, Math.sin(a + 0.22) * r * 0.9); g.closePath(); g.fill(); g.stroke();
      }
    }
    g.fillStyle = '#2f2d44'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.08)'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(-r * 0.95, 0); g.lineTo(r * 0.95, 0); g.stroke();
    // lighting stays upright: draw it in world orientation
    this.local(b.x, b.y, 0); squash(sa);
    g.fillStyle = '#4c4968'; g.beginPath(); g.arc(-r * 0.12, r * 0.12, r * 0.8, 0, 7); g.fill();
    g.fillStyle = '#2f2d44'; g.beginPath(); g.arc(r * 0.05, -r * 0.05, r * 0.72, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,190,140,.55)'; g.beginPath(); g.ellipse(-r * 0.42, r * 0.42, r * 0.22, r * 0.13, 0.8, 0, 7); g.fill();
    g.strokeStyle = OUT; g.lineWidth = lw * 1.6; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
  }

  // ---------------------------------------------------------------- blocks
  body(b) {
    const d = b.data; if (!d || !d.mat) return;
    const g = this.ctx, M = MATS[d.mat], hw = b.hw, hh = b.hh;
    const lw = Math.max(1.2 / this.cam.s, 0.04);
    this.local(b.x, b.y, b.a);
    const dmg = 1 - Math.max(0, d.hp) / d.hpMax;
    const part = d.part;
    g.lineWidth = lw; g.strokeStyle = OUT;
    if (d.mat === 'glass') return this.glass(b, d, hw, hh, lw, dmg);
    if (part === 'car') return this.car(b, d, hw, hh, lw);
    if (part === 'tank') return this.tank(b, d, hw, hh, lw);
    if (part === 'watertank') return this.watertank(b, d, hw, hh, lw);
    if (part === 'lamp') return this.lamp(b, d, hw, hh, lw);
    if (part === 'billboard' || part === 'signband') return this.sign(b, d, hw, hh, lw);
    if (part === 'clock') return this.clock(b, d, hw, hh, lw);
    let fill;
    if (part === 'roof') fill = this.tiles.roof;
    else if (d.mat === 'brick') fill = d.band ? M.dark : this.tiles.brick;
    else if (this.tiles[d.mat]) fill = this.tiles[d.mat];
    else fill = M.col;
    g.fillStyle = fill; g.fillRect(-hw, -hh, hw * 2, hh * 2);
    if (d.mat === 'steel') {
      // I-beam: flanges along the long side
      const long = hw >= hh;
      g.fillStyle = M.dark;
      if (long) { g.fillRect(-hw, hh - Math.min(0.06, hh * 0.35), hw * 2, Math.min(0.06, hh * 0.35)); g.fillRect(-hw, -hh, hw * 2, Math.min(0.06, hh * 0.35)); }
      else { g.fillRect(hw - Math.min(0.06, hw * 0.35), -hh, Math.min(0.06, hw * 0.35), hh * 2); g.fillRect(-hw, -hh, Math.min(0.06, hw * 0.35), hh * 2); }
      g.fillStyle = M.lite;
      const n = Math.floor((long ? hw : hh) * 2 / 0.6);
      for (let i = 0; i <= n; i++) { const t = -1 + (2 * i) / Math.max(1, n); if (long) g.fillRect(t * hw * 0.85 - 0.025, -0.025, 0.05, 0.05); else g.fillRect(-0.025, t * hh * 0.85 - 0.025, 0.05, 0.05); }
    } else if (part === 'cornice') {
      g.fillStyle = 'rgba(255,255,255,.22)'; g.fillRect(-hw, hh * 0.2, hw * 2, hh * 0.8);
      g.fillStyle = 'rgba(0,0,0,.25)'; for (let x = -hw + 0.1; x < hw - 0.1; x += 0.3) g.fillRect(x, -hh, 0.14, hh * 0.7);
    } else if (part === 'antenna') {
      g.fillStyle = Math.sin(this.t * 4 + b.id) > 0.3 ? '#ff4d5a' : '#7a2030'; g.beginPath(); g.arc(0, hh, 0.13, 0, 7); g.fill();
    } else if (part === 'spandrel' || part === 'slab') {
      g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(-hw, hh - Math.min(0.07, hh * 0.5), hw * 2, Math.min(0.07, hh * 0.5));
    } else if (part === 'crate') {
      g.strokeStyle = MATS.wood.dark; g.lineWidth = lw * 1.4; g.strokeRect(-hw + 0.06, -hh + 0.06, hw * 2 - 0.12, hh * 2 - 0.12);
      g.beginPath(); g.moveTo(-hw + 0.06, -hh + 0.06); g.lineTo(hw - 0.06, hh - 0.06); g.stroke(); g.strokeStyle = OUT; g.lineWidth = lw;
    }
    // light from the setting sun: top edge lit, bottom shaded
    if (hh > 0.12 || hw > 0.12) {
      g.fillStyle = 'rgba(255,214,170,.20)'; g.fillRect(-hw, hh - Math.min(hh * 0.4, 0.09), hw * 2, Math.min(hh * 0.4, 0.09));
      g.fillStyle = 'rgba(30,10,40,.22)'; g.fillRect(-hw, -hh, hw * 2, Math.min(hh * 0.4, 0.07));
      g.fillStyle = 'rgba(30,10,40,.12)'; g.fillRect(hw - Math.min(hw * 0.4, 0.07), -hh, Math.min(hw * 0.4, 0.07), hh * 2);
    }
    if (dmg > 0.25) this.cracks(d, hw, hh, dmg, lw);
    g.strokeRect(-hw, -hh, hw * 2, hh * 2);
  }
  cracks(d, hw, hh, dmg, lw) {
    const g = this.ctx;
    if (!d.cr) {
      const r = rng(Math.floor(d.seed * 1e9)); d.cr = [];
      for (let k = 0; k < 3; k++) {
        const side = Math.floor(r() * 4); let x = side < 2 ? (side ? hw : -hw) : (r() * 2 - 1) * hw, y = side < 2 ? (r() * 2 - 1) * hh : (side === 2 ? hh : -hh);
        const pts = [x, y];
        for (let i = 0; i < 4; i++) { x += (-x * 0.35) + (r() - 0.5) * 0.3; y += (-y * 0.35) + (r() - 0.5) * 0.3; pts.push(x, y); }
        d.cr.push(pts);
      }
    }
    g.strokeStyle = 'rgba(25,10,30,.7)'; g.lineWidth = lw * 1.2;
    const n = dmg > 0.7 ? 3 : dmg > 0.45 ? 2 : 1;
    for (let k = 0; k < n; k++) { const p = d.cr[k]; g.beginPath(); g.moveTo(p[0], p[1]); for (let i = 2; i < p.length; i += 2) g.lineTo(p[i], p[i + 1]); g.stroke(); }
    g.strokeStyle = OUT; g.lineWidth = lw;
  }
  glass(b, d, hw, hh, lw, dmg) {
    const g = this.ctx;
    if (!d.gc) {
      const t = Math.max(0, Math.min(1, d.hy / 22));
      d.gc = d.lit ? (d.part === 'shop' ? '#ffcf85' : '#ffd98a') : d.part === 'curtain' ? mix('#2c58a8', '#5d9be6', t) : mix('#2a3f6b', '#5b78b5', t);
    }
    g.fillStyle = d.gc; g.fillRect(-hw, -hh, hw * 2, hh * 2);
    if (d.part === 'curtain' && !d.lit) {
      // the sunset reflected in the facade: diagonal bands laid out in world space so they run across panes
      g.save(); g.beginPath(); g.rect(-hw, -hh, hw * 2, hh * 2); g.clip();
      const off = d.hx + 0.55 * d.hy;
      const k0 = Math.floor((off - hw - 0.55 * hh) / 7) * 7;
      for (let k = k0; k < off + hw + 0.55 * hh + 7; k += 7) {
        const a = k - off, b = a + 2.4;
        g.fillStyle = 'rgba(255,170,130,.55)';
        g.beginPath(); g.moveTo(a - 0.55 * -hh, -hh); g.lineTo(b - 0.55 * -hh, -hh); g.lineTo(b - 0.55 * hh, hh); g.lineTo(a - 0.55 * hh, hh); g.closePath(); g.fill();
        g.fillStyle = 'rgba(255,230,190,.35)';
        g.beginPath(); g.moveTo(a + 0.3 + 0.55 * hh, -hh); g.lineTo(a + 0.75 + 0.55 * hh, -hh); g.lineTo(a + 0.75 - 0.55 * hh, hh); g.lineTo(a + 0.3 - 0.55 * hh, hh); g.closePath(); g.fill();
      }
      g.restore();
    }
    if (d.part === 'shop') {
      g.fillStyle = 'rgba(120,60,30,.35)'; g.fillRect(-hw, -hh, hw * 2, hh * 0.35);
      g.fillStyle = 'rgba(90,40,60,.3)'; for (let x = -hw + 0.2; x < hw - 0.2; x += 0.45) g.fillRect(x, -hh + hh * 0.35, 0.22, 0.18 + ((x * 7) % 0.2));
    }
    // reflection streak
    g.fillStyle = d.part === 'curtain' ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.22)';
    g.beginPath(); g.moveTo(-hw * 0.6, hh); g.lineTo(-hw * 0.15, hh); g.lineTo(-hw * 0.75, -hh); g.lineTo(-hw, -hh); g.lineTo(-hw, -hh * 0.4); g.closePath(); g.fill();
    // mullions
    g.strokeStyle = d.part === 'curtain' ? 'rgba(30,20,50,.55)' : '#efe6d6'; g.lineWidth = lw * 1.3;
    g.beginPath(); g.moveTo(0, -hh); g.lineTo(0, hh); if (d.part !== 'curtain') { g.moveTo(-hw, hh * 0.15); g.lineTo(hw, hh * 0.15); } g.stroke();
    if (dmg > 0.2) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = lw; g.beginPath(); for (let i = 0; i < 6; i++) { const a = i + d.seed * 6; g.moveTo(hw * 0.2, -hh * 0.1); g.lineTo(hw * 0.2 + Math.cos(a) * hw, -hh * 0.1 + Math.sin(a) * hh); } g.stroke(); }
    g.strokeStyle = OUT; g.lineWidth = lw; g.strokeRect(-hw, -hh, hw * 2, hh * 2);
  }
  car(b, d, hw, hh, lw) {
    const g = this.ctx, k = d.crumple || 0;
    if (d.flip) g.scale(-1, 1);
    const body = k > 0.5 ? mix(d.hue, '#3a3050', (k - 0.5) * 0.9) : d.hue;
    // wheels
    g.fillStyle = OUT; g.beginPath(); g.arc(-0.58, -hh + 0.17, 0.17, 0, 7); g.arc(0.58, -hh + 0.17, 0.17, 0, 7); g.fill();
    g.fillStyle = '#8c88a8'; g.beginPath(); g.arc(-0.58, -hh + 0.17, 0.07, 0, 7); g.arc(0.58, -hh + 0.17, 0.07, 0, 7); g.fill();
    // cabin (squashes as it crumples)
    const roof = hh - k * 0.3;
    g.fillStyle = body; g.beginPath(); g.moveTo(-0.55, 0.02); g.lineTo(-0.32 + k * 0.1, roof); g.lineTo(0.3 - k * 0.15, roof - k * 0.06); g.lineTo(0.62, 0.02); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = k > 0.3 ? '#cfe9f5' : '#9fe3ff';
    g.beginPath(); g.moveTo(-0.45, 0.06); g.lineTo(-0.3 + k * 0.1, roof - 0.06); g.lineTo(-0.02, roof - 0.06); g.lineTo(-0.02, 0.06); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(0.04, 0.06); g.lineTo(0.04, roof - 0.06 - k * 0.04); g.lineTo(0.27 - k * 0.15, roof - 0.06 - k * 0.05); g.lineTo(0.5, 0.06); g.closePath(); g.fill();
    // lower body
    g.fillStyle = body; roundRect(g, -hw, -hh + 0.16, hw * 2, 0.32 - k * 0.04, 0.1); g.fill(); g.stroke();
    g.fillStyle = '#fff1b8'; g.fillRect(hw - 0.12, -hh + 0.32, 0.1, 0.08);
    g.fillStyle = '#ff4d5a'; g.fillRect(-hw + 0.02, -hh + 0.32, 0.08, 0.08);
    if (k > 0.15) { g.strokeStyle = 'rgba(20,10,30,.6)'; g.beginPath(); g.moveTo(-0.3, -0.05); g.lineTo(-0.1, -0.2); g.lineTo(0.1, -0.08); if (k > 0.5) { g.moveTo(0.2, 0.1); g.lineTo(0.45, -0.15); } g.stroke(); g.strokeStyle = OUT; }
    if (d.alarm > 0 && Math.sin(this.t * 20) > 0) { g.fillStyle = 'rgba(255,190,60,.8)'; g.beginPath(); g.arc(hw - 0.07, -hh + 0.36, 0.18, 0, 7); g.arc(-hw + 0.06, -hh + 0.36, 0.18, 0, 7); g.fill(); }
  }
  tank(b, d, hw, hh, lw) {
    const g = this.ctx, M = MATS.tank;
    const hot = d.hp < d.hpMax * 0.99 && Math.sin(this.t * 25) > 0;
    g.fillStyle = hot ? '#ff9a3c' : M.col; roundRect(g, -hw, -hh, hw * 2, hh * 2, hw * 0.7); g.fill(); g.stroke();
    g.fillStyle = '#fff4e0'; g.fillRect(-hw, -hh * 0.18, hw * 2, hh * 0.36);
    g.fillStyle = M.dark; g.beginPath(); g.moveTo(0, -hh * 0.14); g.quadraticCurveTo(hw * 0.32, hh * 0.04, 0, hh * 0.15); g.quadraticCurveTo(-hw * 0.32, hh * 0.04, 0, -hh * 0.14); g.fill();
    g.fillStyle = 'rgba(255,255,255,.3)'; g.fillRect(-hw * 0.6, -hh * 0.8, hw * 0.22, hh * 1.5);
    g.fillStyle = '#3d3a5c'; g.fillRect(-0.08, hh, 0.16, 0.12); g.strokeRect(-0.08, hh, 0.16, 0.12);
  }
  watertank(b, d, hw, hh, lw) {
    const g = this.ctx, M = MATS.water;
    const ind = d.ind;
    g.fillStyle = ind ? '#7f97ad' : M.col; g.fillRect(-hw, -hh, hw * 2, hh * 2);
    g.fillStyle = ind ? '#3e5266' : M.dark;
    for (const y of [-0.7, -0.15, 0.4]) g.fillRect(-hw, y * hh, hw * 2, 0.07);
    if (!ind) { g.fillStyle = 'rgba(0,0,0,.14)'; for (let x = -hw + 0.2; x < hw; x += 0.25) g.fillRect(x, -hh, 0.03, hh * 2); }
    g.fillStyle = 'rgba(255,214,170,.22)'; g.fillRect(-hw, -hh, hw * 0.35, hh * 2);
    g.strokeRect(-hw, -hh, hw * 2, hh * 2);
    g.fillStyle = ind ? '#5d7189' : '#5a3a2a'; g.beginPath(); g.moveTo(-hw - 0.1, hh); g.lineTo(0, hh + 0.65); g.lineTo(hw + 0.1, hh); g.closePath(); g.fill(); g.stroke();
    if (ind) { this.local(b.x, b.y, b.a, true); g.fillStyle = '#fff4e0'; g.font = `700 0.32px Bungee, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('H2O', 0, 0.12); }
  }
  lamp(b, d, hw, hh, lw) {
    const g = this.ctx;
    g.fillStyle = '#3d3a5c'; g.fillRect(-hw, -hh, hw * 2, hh * 2); g.strokeRect(-hw, -hh, hw * 2, hh * 2);
    g.strokeStyle = '#3d3a5c'; g.lineWidth = 0.08; g.beginPath(); g.moveTo(0, hh - 0.04); g.quadraticCurveTo(0.05, hh + 0.3, 0.42, hh + 0.22); g.stroke();
    g.fillStyle = '#ffe9a8'; g.beginPath(); g.arc(0.45, hh + 0.14, 0.1, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,220,140,.18)'; g.beginPath(); g.arc(0.45, hh + 0.1, 0.55, 0, 7); g.fill();
  }
  sign(b, d, hw, hh, lw) {
    const g = this.ctx, bb = d.part === 'billboard';
    g.fillStyle = bb ? d.hue : '#2f2a4a'; g.fillRect(-hw, -hh, hw * 2, hh * 2);
    if (bb) { g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.moveTo(-hw, -hh); g.lineTo(-hw + 0.8, hh); g.lineTo(-hw + 1.4, hh); g.lineTo(-hw + 0.6, -hh); g.fill(); }
    g.strokeRect(-hw, -hh, hw * 2, hh * 2);
    this.local(b.x, b.y, b.a, true);
    const txt = d.text || '';
    const fs = bb ? Math.min(hh * 0.9, (hw * 2 * 0.9) / Math.max(4, txt.length * 0.62)) : Math.min(hh * 1.25, (hw * 1.8) / Math.max(3, txt.length * 0.66));
    g.font = `400 ${fs}px Bungee, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = bb ? OUT : d.hue; g.fillText(txt, 0, fs * 0.06);
  }
  clock(b, d, hw, hh, lw) {
    const g = this.ctx;
    g.fillStyle = this.tiles.brick; g.fillRect(-hw, -hh, hw * 2, hh * 2); g.strokeRect(-hw, -hh, hw * 2, hh * 2);
    const r = Math.min(hw, hh) * 0.82;
    g.fillStyle = '#fff4e0'; g.beginPath(); g.arc(0, 0, r, 0, 7); g.fill(); g.lineWidth = lw * 1.5; g.stroke();
    g.fillStyle = OUT; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.fillRect(Math.cos(a) * r * 0.8 - 0.03, Math.sin(a) * r * 0.8 - 0.03, 0.06, 0.06); }
    const t = this.t * 0.2;
    g.lineWidth = lw * 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.sin(t) * r * 0.75, Math.cos(t) * r * 0.75); g.moveTo(0, 0); g.lineTo(Math.sin(t / 12 + 1) * r * 0.5, Math.cos(t / 12 + 1) * r * 0.5); g.stroke();
    g.lineWidth = lw;
  }

  // ---------------------------------------------------------------- particles
  particles(fx) {
    const g = this.ctx; this.world();
    for (const d of fx.dust) {
      const k = d.t / d.life;
      g.globalAlpha = (1 - k) * (1 - k) * 0.75;
      g.fillStyle = d.col; g.beginPath(); g.arc(d.x, d.y, d.r, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    for (const p of fx.p) {
      const k = p.t / p.life;
      if (p.k === 0) {
        this.local(p.x, p.y, p.a); g.globalAlpha = k > 0.8 ? (1 - k) * 5 : 1;
        g.fillStyle = p.col; g.fillRect(-p.s, -p.s * 0.7, p.s * 2, p.s * 1.4);
        g.strokeStyle = OUT; g.lineWidth = Math.max(0.02, 0.8 / this.cam.s); g.strokeRect(-p.s, -p.s * 0.7, p.s * 2, p.s * 1.4);
      } else if (p.k === 1) {
        this.local(p.x, p.y, p.a); g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1;
        const glint = Math.sin(p.a * 2 + p.ph) > 0.85;
        g.fillStyle = glint ? '#ffffff' : 'rgba(190,240,255,.85)';
        g.beginPath(); g.moveTo(-p.s, -p.s * 0.6); g.lineTo(p.s, -p.s * 0.2); g.lineTo(-p.s * 0.2, p.s); g.closePath(); g.fill();
        if (glint) { g.fillStyle = 'rgba(255,255,255,.5)'; g.fillRect(-p.s * 2, -0.012, p.s * 4, 0.024); g.fillRect(-0.012, -p.s * 2, 0.024, p.s * 4); }
      }
    }
    g.globalAlpha = 1; this.world();
    g.lineCap = 'round';
    for (const p of fx.p) {
      const k = p.t / p.life;
      if (p.k === 2) {
        g.strokeStyle = k < 0.4 ? '#fff7c2' : '#ffb347'; g.lineWidth = 0.06 * (1 - k) + 0.02;
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke();
      } else if (p.k === 3) {
        g.globalAlpha = 1 - k;
        g.fillStyle = k < 0.25 ? '#fff3b0' : k < 0.5 ? '#ffb347' : k < 0.75 ? '#e8553a' : '#5a4060';
        g.beginPath(); g.arc(p.x, p.y, p.s * (0.6 + k), 0, 7); g.fill();
      } else if (p.k === 4) {
        g.globalAlpha = 1 - k * 0.6; g.fillStyle = '#9fe3ff'; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill();
      } else if (p.k === 5) {
        g.globalAlpha = 0.35 * (1 - k); g.fillStyle = '#d9c8d8'; g.beginPath(); g.arc(p.x, p.y, p.s, 0, 7); g.fill();
      }
    }
    g.globalAlpha = 1;
    for (const r of fx.rings) {
      const k = r.t / r.life; g.globalAlpha = 1 - k; g.strokeStyle = r.col; g.lineWidth = 0.25 * (1 - k) + 0.05;
      g.beginPath(); g.arc(r.x, r.y, r.r * (0.2 + k * 0.9), 0, 7); g.stroke();
    }
    g.globalAlpha = 1;
  }

  popups(fx) {
    const g = this.ctx; this.screen();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const base = Math.max(14, Math.min(26, this.cam.s * 0.65));
    for (const p of fx.pops) {
      const k = p.t / p.life;
      const pop = p.t < 0.12 ? 1 + (0.12 - p.t) * 5 : 1;
      const fs = base * p.size * pop;
      g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
      g.font = `400 ${fs}px Bungee, sans-serif`;
      const x = this.sx(p.x), y = this.sy(p.y);
      g.lineWidth = fs * 0.22; g.strokeStyle = OUT; g.lineJoin = 'round'; g.strokeText(p.text, x, y);
      g.fillStyle = p.col; g.fillText(p.text, x, y);
    }
    g.globalAlpha = 1;
  }
}
