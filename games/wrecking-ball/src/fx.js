// Particles in world units (y up): dust, chunks, glass shards, sparks, fire,
// smoke, water, shock rings and floating money popups. Hard-capped pools.
const MAXP = 1600, MAXD = 160;
const rnd = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor() { this.p = []; this.dust = []; this.pops = []; this.rings = []; this.flash = 0; }
  clear() { this.p.length = 0; this.dust.length = 0; this.pops.length = 0; this.rings.length = 0; this.flash = 0; }
  add(o) { if (this.p.length >= MAXP) this.p.splice(0, 80); this.p.push(o); return o; }

  // brick / concrete / wood chunks
  chunks(x, y, n, col, speed = 5, size = 0.12) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(0.3, 1) * speed;
      this.add({ k: 0, x: x + rnd(-0.3, 0.3), y: y + rnd(-0.3, 0.3), vx: Math.cos(a) * v, vy: Math.sin(a) * v + speed * 0.4, a: Math.random() * 6, w: rnd(-10, 10), s: size * rnd(0.6, 1.5), col, t: 0, life: rnd(1.4, 2.6) });
    }
  }
  shards(x, y, n, hw = 0.5, hh = 0.5, vx = 0, vy = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(1, 6);
      this.add({ k: 1, x: x + rnd(-hw, hw), y: y + rnd(-hh, hh), vx: vx * 0.5 + Math.cos(a) * v, vy: vy * 0.5 + Math.sin(a) * v + 2, a: Math.random() * 6, w: rnd(-14, 14), s: rnd(0.06, 0.2), t: 0, life: rnd(1.2, 2.4), ph: Math.random() * 6 });
    }
  }
  sparks(x, y, n, nx = 0, ny = 1, speed = 9) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(ny, nx) + rnd(-1.3, 1.3), v = rnd(0.4, 1) * speed;
      this.add({ k: 2, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rnd(0.25, 0.6) });
    }
  }
  fire(x, y, n, r = 1) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = rnd(0.5, 1) * 7 * r;
      this.add({ k: 3, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 2, s: rnd(0.4, 0.9) * r, t: 0, life: rnd(0.4, 0.9) });
    }
  }
  water(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0.2, Math.PI - 0.2), v = rnd(2, 9);
      this.add({ k: 4, x: x + rnd(-0.6, 0.6), y: y + rnd(-0.5, 0.5), vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: rnd(0.06, 0.16), t: 0, life: rnd(0.8, 1.6) });
    }
  }
  smoke(x, y, s = 0.5) { this.add({ k: 5, x, y, vx: rnd(0.3, 0.9), vy: rnd(0.8, 1.4), s, t: 0, life: rnd(3, 4.5) }); }
  puff(x, y, r, col, n = 1, vy = 0.6) {
    for (let i = 0; i < n; i++) {
      if (this.dust.length >= MAXD) this.dust.shift();
      this.dust.push({ x: x + rnd(-r, r) * 0.5, y: y + rnd(-r, r) * 0.4, vx: rnd(-1.4, 1.4), vy: rnd(0, vy * 2), r: r * rnd(0.5, 1), g: rnd(0.8, 1.6), col, t: 0, life: rnd(1.4, 2.6) });
    }
  }
  ring(x, y, r, col = '#fff6d0') { this.rings.push({ x, y, r, col, t: 0, life: 0.45 }); }
  pop(x, y, text, col, size = 1) {
    for (const p of this.pops) if (p.t < 0.3 && p.merge && Math.abs(p.x - x) < 2 && Math.abs(p.y - y) < 2 && p.col === col && typeof p.v === 'number' && typeof text === 'number') {
      p.v += text; p.text = money(p.v); p.t = Math.min(p.t, 0.1); p.size = Math.min(1.8, 0.8 + Math.log10(1 + p.v / 5000) * 0.5); return;
    }
    const isNum = typeof text === 'number';
    if (!isNum) for (const p of this.pops) if (p.text === text && p.t < 0.5 && Math.abs(p.x - x) < 5) { p.t = 0; p.size = Math.min(2.2, p.size + 0.15); return; }
    this.pops.push({ x, y, v: isNum ? text : 0, text: isNum ? money(text) : text, col, size: isNum ? Math.min(1.8, 0.8 + Math.log10(1 + text / 5000) * 0.5) : size, t: 0, life: isNum ? 1.1 : 1.6, merge: isNum });
    if (this.pops.length > 40) this.pops.shift();
  }

  update(dt, groundY = 0) {
    const g = -20;
    for (let i = this.p.length - 1; i >= 0; i--) {
      const p = this.p[i];
      p.t += dt;
      if (p.t > p.life) { this.p.splice(i, 1); continue; }
      if (p.k === 3) { p.vx *= 1 - 3 * dt; p.vy = p.vy * (1 - 3 * dt) + 4 * dt; }
      else if (p.k === 5) { p.vx += 0.2 * dt; p.s += 0.35 * dt; }
      else { p.vy += g * dt * (p.k === 2 ? 0.6 : 1); }
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.w) p.a += p.w * dt;
      if ((p.k === 0 || p.k === 1 || p.k === 4) && p.y < groundY + 0.05) {
        p.y = groundY + 0.05;
        if (p.k === 4) { p.t = p.life; continue; }
        p.vy *= -0.35; p.vx *= 0.6; p.w *= 0.5;
      }
    }
    for (let i = this.dust.length - 1; i >= 0; i--) {
      const d = this.dust[i]; d.t += dt;
      if (d.t > d.life) { this.dust.splice(i, 1); continue; }
      d.x += d.vx * dt; d.y += d.vy * dt; d.vx *= 1 - 1.5 * dt; d.vy *= 1 - 1.2 * dt; d.r += d.g * dt * (1 - d.t / d.life);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dt; if (r.t > r.life) this.rings.splice(i, 1); }
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.t += dt; p.y += dt * (p.t < 0.2 ? 3 : 0.8); if (p.t > p.life) this.pops.splice(i, 1); }
    this.flash = Math.max(0, this.flash - dt * 3);
  }
}

export function money(v) {
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + 'M';
  if (v >= 1e3) return '$' + Math.round(v / 1e3) + 'K';
  return '$' + Math.round(v);
}
