// Particle pool on typed arrays (thousands of streaks, no garbage) plus
// expanding shockwave rings. Particles bounce off the arena walls and can be
// tugged by black holes.
export const PAL = [
  '#ffffff', // 0 white
  '#8f6bff', // 1 violet (pinwheel)
  '#3cc8ff', // 2 cyan (chaser)
  '#5dff6a', // 3 green (dodger / geoms)
  '#ff52d9', // 4 pink (splitter)
  '#ffd23c', // 5 yellow (snake)
  '#ff4040', // 6 red (black hole)
  '#9fe8ff', // 7 ice (sparks)
  '#ff9a2e', // 8 orange
  '#fff6a8', // 9 bullet yellow
  '#5a7dff', // 10 blue
];

export class FX {
  constructor(max = 3200) {
    this.max = max; this.n = 0;
    this.x = new Float32Array(max); this.y = new Float32Array(max);
    this.vx = new Float32Array(max); this.vy = new Float32Array(max);
    this.life = new Float32Array(max); this.full = new Float32Array(max);
    this.col = new Uint8Array(max); this.w = new Float32Array(max);
    this.rings = [];
    this.texts = [];
  }
  add(x, y, vx, vy, life, col, w = 2) {
    let i;
    if (this.n < this.max) i = this.n++;
    else i = (Math.random() * this.max) | 0; // full: overwrite a random one
    this.x[i] = x; this.y[i] = y; this.vx[i] = vx; this.vy[i] = vy;
    this.life[i] = this.full[i] = life; this.col[i] = col; this.w[i] = w;
  }
  burst(x, y, col, count, speed, life = 0.9, w = 2, mix = -1) {
    for (let k = 0; k < count; k++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.25 + Math.random() * Math.random() * 1.1);
      const c = mix >= 0 && Math.random() < 0.35 ? mix : col;
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.7), c, w);
    }
  }
  cone(x, y, ang, spread, col, count, speed, life = 0.4) {
    for (let k = 0; k < count; k++) {
      const a = ang + (Math.random() - 0.5) * spread, s = speed * (0.4 + Math.random() * 0.8);
      this.add(x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.5 + Math.random() * 0.6), col, 1.6);
    }
  }
  ring(x, y, col, r1, dur, w = 4) { this.rings.push({ x, y, col, r: 0, r1, t: 0, dur, w }); }
  text(x, y, str, col = '#fff', size = 22) { this.texts.push({ x, y, str, col, size, t: 0, dur: 1.0 }); }
  update(dt, W, H, holes) {
    const { x, y, vx, vy, life } = this;
    const drag = Math.pow(0.12, dt); // strong drag: fast pop then hang
    for (let i = 0; i < this.n; i++) {
      life[i] -= dt;
      if (life[i] <= 0) { // swap-remove
        const j = --this.n;
        x[i] = x[j]; y[i] = y[j]; vx[i] = vx[j]; vy[i] = vy[j]; life[i] = life[j]; this.full[i] = this.full[j]; this.col[i] = this.col[j]; this.w[i] = this.w[j];
        i--; continue;
      }
      for (let h = 0; h < holes.length; h++) {
        const o = holes[h], dx = o.x - x[i], dy = o.y - y[i], d2 = dx * dx + dy * dy;
        if (d2 < 90000 && d2 > 1) { const f = 60000 / (d2 + 2000) * dt * 60; const d = Math.sqrt(d2); vx[i] += dx / d * f; vy[i] += dy / d * f; }
      }
      vx[i] *= drag; vy[i] *= drag;
      x[i] += vx[i] * dt; y[i] += vy[i] * dt;
      if (x[i] < 0) { x[i] = 0; vx[i] = -vx[i]; } else if (x[i] > W) { x[i] = W; vx[i] = -vx[i]; }
      if (y[i] < 0) { y[i] = 0; vy[i] = -vy[i]; } else if (y[i] > H) { y[i] = H; vy[i] = -vy[i]; }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt;
      const k = r.t / r.dur; r.r = r.r1 * (1 - (1 - k) * (1 - k) * (1 - k));
      if (r.t >= r.dur) this.rings.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.t += dt; t.y -= 30 * dt;
      if (t.t >= t.dur) this.texts.splice(i, 1);
    }
  }
  clear() { this.n = 0; this.rings.length = 0; this.texts.length = 0; }
}
