// Particles: dust, mud, sparks, glass, smoke (grey to black), fire, plus floating score popups.
import { TAU } from './util.js';

const MAX = 1100;
export class FX {
  constructor() { this.p = []; this.wind = { x: 18, y: -10 }; }
  add(q) { if (this.p.length >= MAX) this.p.splice(0, 40); this.p.push(q); }
  sparks(x, y, nx, ny, n, v) {
    for (let k = 0; k < n; k++) {
      const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.4, s = v * (0.3 + Math.random() * 0.9);
      this.add({ t: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.35, max: 0.6, drag: 0.9 });
    }
  }
  dust(x, y, n, spread, col = 'dust', vx = 0, vy = 0) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * TAU, s = spread * Math.random();
      this.add({ t: col, x: x + (Math.random() - 0.5) * 8, y: y + (Math.random() - 0.5) * 8, vx: Math.cos(a) * s + vx, vy: Math.sin(a) * s + vy, life: 0.8 + Math.random() * 0.9, max: 1.7, s: 6 + Math.random() * 8, drag: 0.94 });
    }
  }
  mud(x, y, n, vx, vy) {
    for (let k = 0; k < n; k++) this.add({ t: 'mud', x, y, vx: vx * 0.4 + (Math.random() - 0.5) * 220, vy: vy * 0.4 + (Math.random() - 0.5) * 220, life: 0.45 + Math.random() * 0.3, max: 0.75, s: 2 + Math.random() * 2.5, drag: 0.9 });
  }
  glass(x, y, n, vx, vy) {
    for (let k = 0; k < n; k++) this.add({ t: 'glass', x, y, vx: vx * 0.3 + (Math.random() - 0.5) * 260, vy: vy * 0.3 + (Math.random() - 0.5) * 260, life: 0.5 + Math.random() * 1.5, max: 2, drag: 0.86, a: Math.random() * 3 });
  }
  smoke(x, y, dark, vx = 0, vy = 0) {
    this.add({ t: dark ? 'bsmoke' : 'smoke', x, y, vx: vx * 0.2 + (Math.random() - 0.5) * 25, vy: vy * 0.2 + (Math.random() - 0.5) * 25, life: 1.6 + Math.random() * 1.2, max: 2.8, s: 5 + Math.random() * 4, drag: 0.97 });
  }
  fire(x, y, vx = 0, vy = 0) {
    this.add({ t: 'fire', x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: vx * 0.3 + (Math.random() - 0.5) * 40, vy: vy * 0.3 + (Math.random() - 0.5) * 40, life: 0.35 + Math.random() * 0.35, max: 0.7, s: 4 + Math.random() * 5, drag: 0.92 });
  }
  boom(x, y) {
    for (let k = 0; k < 26; k++) this.fire(x, y, (Math.random() - 0.5) * 500, (Math.random() - 0.5) * 500);
    for (let k = 0; k < 12; k++) { const a = Math.random() * TAU, s = 60 + Math.random() * Math.random() * 600; this.smoke(x, y, true, Math.cos(a) * s, Math.sin(a) * s); }
    this.add({ t: 'ring', x, y, vx: 0, vy: 0, life: 0.45, max: 0.45 });
  }
  update(dt) {
    const w = this.wind;
    for (const q of this.p) {
      const k = Math.pow(q.drag || 0.95, dt * 60);
      q.vx *= k; q.vy *= k;
      if (q.t === 'smoke' || q.t === 'bsmoke') { q.vx += w.x * dt; q.vy += w.y * dt; }
      q.x += q.vx * dt; q.y += q.vy * dt; q.life -= dt;
    }
    let j = 0; for (const q of this.p) if (q.life > 0) this.p[j++] = q; this.p.length = j;
  }
  // under the cars: dust, mud, glass on the ground
  drawUnder(x) {
    for (const q of this.p) {
      const a = q.life / q.max;
      if (q.t === 'dust') { x.fillStyle = `rgba(196,160,116,${a * 0.32})`; x.beginPath(); x.arc(q.x, q.y, q.s * (2.4 - a * 1.4), 0, TAU); x.fill(); }
      else if (q.t === 'mudd') { x.fillStyle = `rgba(90,64,40,${a * 0.35})`; x.beginPath(); x.arc(q.x, q.y, q.s * (2.4 - a * 1.4), 0, TAU); x.fill(); }
      else if (q.t === 'glass') { x.fillStyle = `rgba(210,235,255,${Math.min(1, a * 2) * 0.85})`; x.fillRect(q.x - 1, q.y - 1, 2, 2); }
      else if (q.t === 'mud') { x.fillStyle = `rgba(70,48,28,${Math.min(1, a * 2)})`; x.beginPath(); x.arc(q.x, q.y, q.s, 0, TAU); x.fill(); }
    }
  }
  // over the cars: smoke, fire, sparks
  drawOver(x) {
    for (const q of this.p) {
      const a = q.life / q.max;
      if (q.t === 'smoke') { x.fillStyle = `rgba(150,150,154,${a * 0.3})`; x.beginPath(); x.arc(q.x, q.y, q.s * (2.9 - a * 1.9), 0, TAU); x.fill(); }
      else if (q.t === 'bsmoke') { x.fillStyle = `rgba(30,28,28,${a * 0.34})`; x.beginPath(); x.arc(q.x, q.y, q.s * (2.9 - a * 1.9), 0, TAU); x.fill(); }
    }
    x.globalCompositeOperation = 'lighter';
    for (const q of this.p) {
      const a = q.life / q.max;
      if (q.t === 'fire') {
        const r = q.s * (0.6 + a);
        x.fillStyle = `rgba(255,${Math.floor(120 + a * 110)},40,${a * 0.75})`; x.beginPath(); x.arc(q.x, q.y, r, 0, TAU); x.fill();
        x.fillStyle = `rgba(255,240,180,${a * 0.5})`; x.beginPath(); x.arc(q.x, q.y, r * 0.45, 0, TAU); x.fill();
      } else if (q.t === 'spark') {
        x.strokeStyle = `rgba(255,${200 + Math.floor(a * 55)},120,${Math.min(1, a * 2)})`; x.lineWidth = 1.6;
        x.beginPath(); x.moveTo(q.x, q.y); x.lineTo(q.x - q.vx * 0.025, q.y - q.vy * 0.025); x.stroke();
      } else if (q.t === 'ring') {
        x.strokeStyle = `rgba(255,220,150,${a * 0.8})`; x.lineWidth = 6 * a; x.beginPath(); x.arc(q.x, q.y, 20 + (1 - a) * 140, 0, TAU); x.stroke();
      }
    }
    x.globalCompositeOperation = 'source-over';
  }
}
