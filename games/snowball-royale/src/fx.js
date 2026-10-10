// Particles (snow chunks, puffs, breath, flakes, stars) and pop-up words.
import { INK, star } from './draw.js';
import { rand } from './world.js';

export class FX {
  constructor() { this.parts = []; this.pops = []; }
  clear() { this.parts.length = 0; this.pops.length = 0; }
  add(p) { if (this.parts.length < 900) this.parts.push(p); }
  // chunks of snow flying out in a ring (z = height)
  burst(x, y, z, n, o = {}) {
    const sp = o.speed || 160, col = o.col || '#ffffff';
    for (let i = 0; i < n; i++) {
      const a = o.dir != null ? o.dir + rand(-o.spread || -1, o.spread || 1) : rand(0, 6.283), v = rand(0.3, 1) * sp;
      this.add({ k: 'chunk', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.7, vz: rand(80, 260) * (o.up || 1), life: rand(0.5, 1.1), max: 1.1, r: rand(1.6, 4.2) * (o.size || 1), col });
    }
  }
  puff(x, y, z, r = 14, n = 5, col = 'rgba(255,255,255,.85)') {
    for (let i = 0; i < n; i++) this.add({ k: 'puff', x: x + rand(-r, r) * 0.6, y: y + rand(-r, r) * 0.4, z: z + rand(0, r * 0.5), vx: rand(-30, 30), vy: rand(-20, 10), vz: rand(10, 40), life: rand(0.35, 0.7), max: 0.7, r: r * rand(0.4, 0.8), col });
  }
  breath(x, y, face) {
    this.add({ k: 'breath', x, y, z: 0, vx: Math.cos(face) * 26, vy: Math.sin(face) * 10 - 14, vz: 0, life: 1.1, max: 1.1, r: 3 });
  }
  // snow falling from a tree canopy
  dump(x, y, R) {
    for (let i = 0; i < 70; i++) { const a = rand(0, 6.283), d = Math.sqrt(Math.random()) * R; this.add({ k: 'chunk', x: x + Math.cos(a) * d, y: y + Math.sin(a) * d * 0.6, z: rand(40, 120), vx: rand(-20, 20), vy: rand(-10, 10), vz: rand(-60, 20), life: rand(0.7, 1.3), max: 1.3, r: rand(2, 5), col: '#ffffff' }); }
    this.puff(x, y, 30, R * 0.6, 10);
  }
  stars(x, y, z, n = 6) { for (let i = 0; i < n; i++) { const a = rand(0, 6.283), v = rand(120, 260); this.add({ k: 'star', x, y, z, vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.6, vz: rand(120, 260), life: 0.8, max: 0.8, r: rand(3, 5), col: '#ffd23f' }); } }
  text(x, y, txt, col = '#fff', size = 22, life = 0.9) { this.pops.push({ x, y, txt, col, size, life, max: life, vy: -60 }); if (this.pops.length > 30) this.pops.shift(); }
  update(dt) {
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 'chunk' || p.k === 'star') {
        p.vz -= 900 * dt; p.z += p.vz * dt;
        if (p.z <= 0) { p.z = 0; p.vz *= -0.25; p.vx *= 0.6; p.vy *= 0.6; }
      } else if (p.k === 'puff') { p.z += p.vz * dt; p.r += dt * 18; p.vx *= 0.95; }
      else if (p.k === 'breath') { p.r += dt * 9; p.vx *= 0.96; p.vy *= 0.97; }
    }
    for (let i = this.pops.length - 1; i >= 0; i--) { const t = this.pops[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= 0.92; if (t.life <= 0) this.pops.splice(i, 1); }
  }
  draw(c) {
    for (const p of this.parts) {
      const a = Math.min(1, p.life / p.max * 2);
      if (p.k === 'chunk') {
        c.globalAlpha = a; c.fillStyle = p.col;
        c.beginPath(); c.arc(p.x, p.y - p.z, p.r, 0, 7); c.fill();
        if (p.r > 2.5) { c.fillStyle = 'rgba(140,155,210,.6)'; c.beginPath(); c.arc(p.x + p.r * 0.3, p.y - p.z + p.r * 0.3, p.r * 0.5, 0, 3.14); c.fill(); }
      } else if (p.k === 'puff') {
        c.globalAlpha = a * 0.7; c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y - p.z, p.r, 0, 7); c.fill();
      } else if (p.k === 'breath') {
        c.globalAlpha = (p.life / p.max) * 0.55; c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x, p.y, p.r, 0, 7); c.arc(p.x + p.r * 0.7, p.y - p.r * 0.3, p.r * 0.7, 0, 7); c.fill();
      } else if (p.k === 'star') { c.globalAlpha = a; star(c, p.x, p.y - p.z, p.r, p.col); }
    }
    c.globalAlpha = 1;
  }
  drawPops(c) {
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.lineJoin = 'round';
    for (const t of this.pops) {
      const age = t.max - t.life, pop = age < 0.12 ? 0.6 + age / 0.12 * 0.6 : age < 0.2 ? 1.2 - (age - 0.12) / 0.08 * 0.2 : 1;
      c.globalAlpha = Math.min(1, t.life / 0.25);
      c.font = `700 ${Math.round(t.size * pop)}px Fredoka, sans-serif`;
      c.lineWidth = Math.max(3, t.size * 0.22); c.strokeStyle = INK; c.strokeText(t.txt, t.x, t.y);
      c.fillStyle = t.col; c.fillText(t.txt, t.x, t.y);
    }
    c.globalAlpha = 1;
  }
}
