// fx.js - particles, floating numbers, rings, beams and the ink-stain layer.
// Positions are in arena cells; draw() is handed the cell size and origin.
import { rng, splat, rgba, shade, makeCanvas, INK } from './paint.js';

const R = rng(99);
export class FX {
  constructor() { this.p = []; this.stain = null; this.sw = 0; this.sh = 0; this.cell = 1; }
  reset(cell) {
    this.p.length = 0; this.cell = cell;
    this.sw = Math.ceil(cell * 5 * 2); this.sh = Math.ceil(cell * 4 * 2);
    this.stain = makeCanvas(this.sw, this.sh);
  }
  // permanent ink splat on the arena floor (drawn at 2x)
  stainAt(x, y, r, col, alpha = 0.12) {
    if (!this.stain) return;
    const g = this.stain.getContext('2d');
    const c = this.cell * 2;
    splat(g, x * c, y * c, r * c, col, R, { alpha, layers: 6, drops: 5, squash: 0.55 });
  }
  add(o) { if (this.p.length < 500) this.p.push({ t: 0, vx: 0, vy: 0, g: 0, ...o }); }
  burst(x, y, col, n = 8, spd = 2.2, size = 0.06) {
    for (let i = 0; i < n; i++) {
      const a = R() * Math.PI * 2, s = spd * (0.4 + R() * 0.8);
      this.add({ k: 'dot', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7 - 1, g: 6, life: 0.45 + R() * 0.3, col, size: size * (0.6 + R() * 0.8) });
    }
  }
  num(x, y, text, col, big = false) { this.add({ k: 'num', x: x + (R() - 0.5) * 0.3, y: y - 0.9, vy: -1.1, life: big ? 1.0 : 0.75, text, col, big }); }
  ring(x, y, r, col) { this.add({ k: 'ring', x, y, r, col, life: 0.5 }); }
  boom(x, y, r, col) { this.add({ k: 'boom', x, y, r, col, life: 0.55 }); this.burst(x, y, col, 16, 3.5, 0.08); }
  beam(x, y, x2, y2, col, zig) { this.add({ k: 'beam', x, y, x2, y2, col, zig, life: 0.3 }); }
  slash(x, y, col = INK) { this.add({ k: 'slash', x, y, col, life: 0.22, a: R() * Math.PI }); }
  // call-outs: if another one is still fresh near this spot, stack this one above it instead of on top
  text(x, y, text, col) {
    let yy = y - 1.15;
    for (let n = 0; n < 4; n++) { if (!this.p.some(p => p.word && p.t < 0.6 && Math.abs(p.x - x) < 1.4 && Math.abs(p.y - yy) < 0.4)) break; yy -= 0.42; }
    this.add({ k: 'num', x, y: yy, vy: -0.6, life: 1.1, text, col, big: true, word: true });
  }

  update(dt) {
    for (const p of this.p) {
      p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.k === 'num') p.vy *= 0.92;
    }
    this.p = this.p.filter(p => p.t < p.life);
  }

  draw(g, ox, oy, c, font, mode = 'all') {
    g.save();
    if (this.stain && mode !== 'parts') { g.globalAlpha = 0.7; g.drawImage(this.stain, ox, oy, c * 5, c * 4); g.globalAlpha = 1; } // softer floor so late fights stay readable
    if (mode === 'stain') { g.restore(); return; }
    for (const p of this.p) {
      const k = p.t / p.life, X = ox + p.x * c, Y = oy + p.y * c;
      g.globalAlpha = Math.max(0, 1 - k * k);
      switch (p.k) {
        case 'dot': g.fillStyle = p.col; g.beginPath(); g.arc(X, Y - c * 0.3, Math.max(1, p.size * c * (1 - k * 0.5)), 0, 7); g.fill(); break;
        case 'ring': g.strokeStyle = p.col; g.lineWidth = Math.max(2, c * 0.06 * (1 - k)); g.beginPath(); g.ellipse(X, Y, p.r * c * (0.3 + k * 0.7), p.r * c * 0.5 * (0.3 + k * 0.7), 0, 0, 7); g.stroke(); break;
        case 'boom': {
          const rr = p.r * c * (0.4 + k * 0.7);
          g.fillStyle = rgba(p.col, 0.35 * (1 - k)); g.beginPath(); g.ellipse(X, Y, rr, rr * 0.55, 0, 0, 7); g.fill();
          g.strokeStyle = rgba(shade(p.col, -0.3), 0.8); g.lineWidth = Math.max(2, c * 0.05); g.stroke();
          break;
        }
        case 'beam': {
          g.strokeStyle = p.col; g.lineWidth = Math.max(2, c * 0.06) * (1 - k); g.lineCap = 'round';
          g.beginPath(); g.moveTo(X, Y - c * 0.35);
          const X2 = ox + p.x2 * c, Y2 = oy + p.y2 * c - c * 0.35;
          if (p.zig) { for (let i = 1; i < 6; i++) { const f = i / 6; g.lineTo(X + (X2 - X) * f + (R() - 0.5) * c * 0.25, Y - c * 0.35 + (Y2 - Y + c * 0.35) * f + (R() - 0.5) * c * 0.25); } }
          g.lineTo(X2, Y2); g.stroke();
          g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth *= 0.4; g.stroke();
          break;
        }
        case 'slash': {
          g.strokeStyle = p.col; g.lineCap = 'round'; g.lineWidth = Math.max(2, c * 0.07) * (1 - k);
          const L = c * 0.45, a = p.a;
          g.beginPath(); g.moveTo(X - Math.cos(a) * L, Y - c * 0.4 - Math.sin(a) * L * 0.6); g.quadraticCurveTo(X, Y - c * 0.55, X + Math.cos(a) * L, Y - c * 0.4 + Math.sin(a) * L * 0.6); g.stroke();
          break;
        }
        case 'num': {
          const size = Math.max(11, c * (p.big ? 0.3 : 0.2)) * (k < 0.15 ? 1 + (0.15 - k) * 3 : 1);
          g.font = `${p.word ? '' : 'bold '}${size | 0}px ${font}`; g.textAlign = 'center'; g.lineJoin = 'round';
          g.lineWidth = Math.max(2.5, size * 0.22); g.strokeStyle = 'rgba(250,244,230,0.95)'; g.strokeText(p.text, X, Y);
          g.fillStyle = p.col; g.fillText(p.text, X, Y);
          break;
        }
      }
    }
    g.restore();
  }
}
