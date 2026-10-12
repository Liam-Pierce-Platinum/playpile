// Particles, screen shake, flashes and floating text. World-space.
const rnd = (a, b) => a + Math.random() * (b - a);

export class Fx {
  constructor() { this.p = []; this.texts = []; this.shakeAmt = 0; this.flash = 0; this.rings = []; }
  clear() { this.p.length = 0; this.texts.length = 0; this.rings.length = 0; this.shakeAmt = 0; this.flash = 0; }
  shake(a) { this.shakeAmt = Math.min(40, Math.max(this.shakeAmt, a)); }
  explosion(x, y, r, terrain, wind) {
    const k = r / 40;
    this.rings.push({ x, y, r: r * 0.3, max: r * 1.9, t: 0, life: 0.35 + 0.1 * k });
    this.rings.push({ x, y, r: 4, max: r * 1.0, t: 0, life: 0.34 + 0.06 * k, fill: true });
    this.flash = Math.min(1, this.flash + 0.25 + 0.2 * k);
    // fireball blobs
    for (let i = 0; i < 10 + 8 * k; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(30, 160) * k;
      this.p.push({ t: 'fire', x: x + Math.cos(a) * r * 0.3, y: y + Math.sin(a) * r * 0.3, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: rnd(0.35, 0.75) + 0.1 * k, age: 0, s: rnd(0.35, 0.65) * r });
    }
    // smoke
    for (let i = 0; i < 6 + 6 * k; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(10, 70) * k;
      this.p.push({ t: 'smoke', x: x + Math.cos(a) * r * 0.5, y: y + Math.sin(a) * r * 0.4, vx: Math.cos(a) * s + wind * 3, vy: Math.sin(a) * s - rnd(20, 60), life: rnd(1.2, 2.4) + k * 0.4, age: rnd(-0.15, 0), s: rnd(0.35, 0.6) * r });
    }
    // dirt chunks in the terrain colour
    for (let i = 0; i < 14 + 12 * k; i++) {
      const a = -Math.PI / 2 + rnd(-1.3, 1.3), s = rnd(180, 520) * Math.sqrt(k);
      const sx = x + rnd(-r, r) * 0.6, sy = y + rnd(-r, r) * 0.4;
      this.p.push({ t: 'chunk', x: sx, y: sy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.8, 1.6), age: 0, s: rnd(3, 7) * Math.min(1.6, k), rot: rnd(0, 6), vr: rnd(-12, 12), col: terrain ? terrain.colorAt(sx, Math.max(sy, terrain.topAt(sx) + 2)) : '#7a5030' });
    }
    // sparks
    for (let i = 0; i < 12 + 6 * k; i++) {
      const a = Math.random() * Math.PI * 2, s = rnd(250, 650) * Math.sqrt(k);
      this.p.push({ t: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(0.2, 0.45), age: 0 });
    }
    this.shake(5 + r * 0.22);
  }
  muzzle(x, y, ang) {
    for (let i = 0; i < 10; i++) {
      const a = ang + rnd(-0.35, 0.35), s = rnd(80, 260);
      this.p.push({ t: i < 5 ? 'fire' : 'smoke', x, y, vx: Math.cos(a) * s, vy: -Math.sin(a) * s, life: i < 5 ? 0.2 : rnd(0.5, 0.9), age: 0, s: i < 5 ? 8 : rnd(7, 12) });
    }
  }
  trail(x, y, col) { this.p.push({ t: 'trail', x, y, vx: 0, vy: -8, life: 0.6, age: 0, s: 3.5, col }); }
  dust(x, y, n = 8) {
    for (let i = 0; i < n; i++) this.p.push({ t: 'smoke', x: x + rnd(-14, 14), y, vx: rnd(-50, 50), vy: rnd(-40, -10), life: rnd(0.4, 0.8), age: 0, s: rnd(5, 10), dust: true });
  }
  ember(x, y) { this.p.push({ t: 'spark', x, y, vx: rnd(-30, 30), vy: rnd(-120, -40), life: rnd(0.3, 0.6), age: 0 }); }
  // ay = anchor (the tank's y): the renderer spreads the offset from it when tanks are drawn bigger
  text(x, y, str, col = '#fff', size = 30, life = 1.2, ay = null) { this.texts.push({ x, y, str, col, size, life, age: 0, ay }); }
  update(dt, wind, terrain) {
    this.shakeAmt *= Math.pow(0.0025, dt);
    if (this.shakeAmt < 0.2) this.shakeAmt = 0;
    this.flash *= Math.pow(0.002, dt);
    const ps = this.p;
    for (let i = ps.length - 1; i >= 0; i--) {
      const q = ps[i];
      q.age += dt;
      if (q.age >= q.life) { ps[i] = ps[ps.length - 1]; ps.pop(); continue; }
      if (q.age < 0) continue;
      if (q.t === 'chunk') {
        q.vy += 900 * dt; q.x += q.vx * dt; q.y += q.vy * dt; q.rot += q.vr * dt;
        if (terrain && q.vy > 0 && terrain.solid(q.x, q.y)) { q.vy *= -0.3; q.vx *= 0.5; q.y -= 2; q.vr *= 0.5; }
      } else if (q.t === 'smoke') {
        q.vx += (wind * 6 - q.vx) * dt * 0.8; q.vy += (-25 - q.vy) * dt * 1.2;
        q.x += q.vx * dt; q.y += q.vy * dt;
      } else if (q.t === 'fire') {
        q.vx *= Math.pow(0.05, dt); q.vy *= Math.pow(0.05, dt); q.vy -= 60 * dt; q.x += q.vx * dt; q.y += q.vy * dt;
      } else if (q.t === 'spark') {
        q.vy += 600 * dt; q.vx *= Math.pow(0.3, dt); q.x += q.vx * dt; q.y += q.vy * dt;
      } else { q.x += q.vx * dt; q.y += q.vy * dt; }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t >= r.life) this.rings.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.age += dt; t.y -= 40 * dt * Math.max(0, 1 - t.age); if (t.age >= t.life) this.texts.splice(i, 1); }
  }
  busy() { return this.rings.length > 0 || this.p.some((q) => q.t === 'chunk' && q.age < q.life * 0.5); }
}
