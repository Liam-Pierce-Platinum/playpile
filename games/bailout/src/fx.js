// Particles and pop-up text. World-space unless noted.
import { OUTLINE, TAU } from './util.js';

export class FX {
  constructor() { this.parts = []; this.pops = []; this.flyers = []; }
  clear() { this.parts.length = 0; this.pops.length = 0; this.flyers.length = 0; }
  add(p) { if (this.parts.length < 700) this.parts.push(p); }
  dust(x, y, n, col, spread = 1, vx0 = 0) {
    for (let i = 0; i < n; i++) this.add({ k: 'dust', x: x + (Math.random() - 0.5) * 20, y, vx: vx0 * 0.3 + (Math.random() - 0.5) * 160 * spread, vy: -Math.random() * 110 * spread, r: 6 + Math.random() * 9, life: 0.5 + Math.random() * 0.4, t: 0, col });
  }
  sparks(x, y, n, vx0 = 0, vy0 = 0) {
    for (let i = 0; i < n; i++) this.add({ k: 'spark', x, y, vx: vx0 * 0.5 + (Math.random() - 0.5) * 300, vy: vy0 * 0.3 - Math.random() * 260, life: 0.25 + Math.random() * 0.3, t: 0, col: Math.random() < 0.5 ? '#ffd23f' : '#ffffff' });
  }
  debris(x, y, n, cols, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = (200 + Math.random() * 500) * power;
      this.add({ k: 'chunk', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, w: 6 + Math.random() * 12, h: 4 + Math.random() * 7, life: 1.4 + Math.random(), t: 0, col: cols[i % cols.length] });
    }
  }
  fire(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, sp = Math.random() * 380;
      this.add({ k: 'fire', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, r: 14 + Math.random() * 22, life: 0.35 + Math.random() * 0.35, t: 0 });
    }
    for (let i = 0; i < n / 2; i++) this.add({ k: 'smoke', x: x + (Math.random() - 0.5) * 60, y: y + (Math.random() - 0.5) * 40, vx: (Math.random() - 0.5) * 80, vy: -60 - Math.random() * 80, r: 18 + Math.random() * 20, life: 1 + Math.random() * 0.8, t: 0 });
  }
  smoke(x, y, col = 'rgba(60,60,70,0.45)') { this.add({ k: 'smoke', x, y, vx: (Math.random() - 0.5) * 30, vy: -40 - Math.random() * 30, r: 6 + Math.random() * 6, life: 0.7, t: 0, col }); }
  ring(x, y, col = '#ffffff', r1 = 120) { this.add({ k: 'ring', x, y, r: 10, r1, life: 0.35, t: 0, col }); }
  confetti(x, y, n) {
    const cols = ['#ffd23f', '#e8433a', '#2ef2ff', '#36c46a', '#ff3dbb', '#ffffff'];
    for (let i = 0; i < n; i++) this.add({ k: 'conf', x, y, vx: (Math.random() - 0.5) * 700, vy: -300 - Math.random() * 600, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, life: 2 + Math.random(), t: 0, col: cols[i % cols.length] });
  }
  speedline(x, y, vx, vy) { this.add({ k: 'line', x, y, vx: vx * 0.2, vy: vy * 0.2, dx: -vx * 0.06, dy: -vy * 0.06, life: 0.18, t: 0 }); }
  pop(text, x, y, col = '#ffd23f', size = 34, life = 1.0) { this.pops.push({ text, x, y, col, size, t: 0, life, vy: -70 }); }
  // screen-space flyer (time bonus flying into the timer)
  fly(text, sx, sy, tx, ty, col, onArrive) { this.flyers.push({ text, sx, sy, tx, ty, col, t: 0, life: 0.75, onArrive }); }

  update(dt, windAt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.t += dt;
      if (p.t >= p.life) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (p.k === 'spark' || p.k === 'chunk') p.vy += 1400 * dt;
      if (p.k === 'conf') { p.vy += 700 * dt; p.vx *= 1 - 1.5 * dt; }
      if (p.k === 'dust' || p.k === 'smoke') { p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt; }
      if (p.k === 'fire') { p.vx *= 1 - 5 * dt; p.vy *= 1 - 5 * dt; }
      if (p.vr) p.rot += p.vr * dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; }
    }
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; p.y += p.vy * dt; p.vy *= 1 - 3 * dt; if (p.t > p.life) this.pops.splice(i, 1); }
    for (let i = this.flyers.length - 1; i >= 0; i--) { const f = this.flyers[i]; f.t += dt; if (f.t > f.life) { this.flyers.splice(i, 1); if (f.onArrive) f.onArrive(); } }
  }

  draw(ctx, front) {
    for (const p of this.parts) {
      const u = p.t / p.life;
      switch (p.k) {
        case 'dust': if (front) break; ctx.globalAlpha = (1 - u) * 0.8; ctx.fillStyle = p.col; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.6 + u), 0, TAU); ctx.fill(); break;
        case 'smoke': if (front) break; ctx.globalAlpha = (1 - u) * 0.6; ctx.fillStyle = p.col || 'rgba(70,64,80,1)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.7 + u * 1.2), 0, TAU); ctx.fill(); break;
        case 'spark': if (!front) break; ctx.globalAlpha = 1 - u; ctx.strokeStyle = p.col; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke(); break;
        case 'chunk': if (!front) break; ctx.globalAlpha = u > 0.8 ? (1 - u) * 5 : 1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.strokeRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore(); break;
        case 'fire': if (!front) break; ctx.globalAlpha = 1 - u; ctx.fillStyle = u < 0.3 ? '#fff1a8' : u < 0.6 ? '#ffb02e' : '#ff5a1f'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1 - u * 0.5), 0, TAU); ctx.fill(); break;
        case 'ring': if (!front) break; ctx.globalAlpha = 1 - u; ctx.strokeStyle = p.col; ctx.lineWidth = 8 * (1 - u) + 1; ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (p.r1 - p.r) * u, 0, TAU); ctx.stroke(); break;
        case 'conf': if (!front) break; ctx.globalAlpha = u > 0.8 ? (1 - u) * 5 : 1; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col; ctx.fillRect(-5, -3, 10, 6); ctx.restore(); break;
        case 'line': if (!front) break; ctx.globalAlpha = (1 - u) * 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.dx, p.y + p.dy); ctx.stroke(); break;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawPops(ctx, s) {
    for (const p of this.pops) {
      const u = p.t / p.life;
      const sc = u < 0.12 ? 0.4 + (u / 0.12) * 0.8 : u < 0.22 ? 1.2 - ((u - 0.12) / 0.1) * 0.2 : 1;
      ctx.save(); ctx.translate(p.x, p.y); ctx.scale(sc / s, sc / s);
      ctx.globalAlpha = u > 0.75 ? (1 - u) * 4 : 1;
      outlined(ctx, p.text, 0, 0, p.size, p.col);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
  drawFlyers(ctx) {
    for (const f of this.flyers) {
      const u = Math.min(1, f.t / f.life), e = u * u * (3 - 2 * u);
      const x = f.sx + (f.tx - f.sx) * e, y = f.sy + (f.ty - f.sy) * e - Math.sin(u * Math.PI) * 60;
      ctx.save(); ctx.translate(x, y); const sc = 1.3 - u * 0.5; ctx.scale(sc, sc);
      outlined(ctx, f.text, 0, 0, 30, f.col); ctx.restore();
    }
  }
}

export function outlined(ctx, text, x, y, size, col, align = 'center', base = 'middle') {
  ctx.font = `${size}px "Lilita One", "Arial Black", sans-serif`;
  ctx.textAlign = align; ctx.textBaseline = base;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = Math.max(4, size * 0.2);
  ctx.strokeText(text, x, y + size * 0.06);
  ctx.strokeText(text, x, y);
  ctx.fillStyle = col; ctx.fillText(text, x, y);
}
