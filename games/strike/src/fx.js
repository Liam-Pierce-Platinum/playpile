// 2D overlay: swipe trail, sparks, rings, confetti. Drawn on a canvas above the 3D view.
export class FX {
  constructor(cv) { this.cv = cv; this.g = cv.getContext('2d'); this.parts = []; this.trail = []; this.resize(); }
  resize() { const d = Math.min(window.devicePixelRatio || 1, 2); this.d = d; this.cv.width = window.innerWidth * d; this.cv.height = window.innerHeight * d; this.cv.style.width = window.innerWidth + 'px'; this.cv.style.height = window.innerHeight + 'px'; }
  sparks(x, y, n, cols = ['#fff', '#ffe14a', '#5cf0ff', '#ff5ce1'], power = 1) {
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = (120 + Math.random() * 420) * power; this.parts.push({ k: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, life: 0.35 + Math.random() * 0.35, t: 0, c: cols[i % cols.length] }); }
  }
  ring(x, y, c = '#fff', max = 160) { this.parts.push({ k: 'ring', x, y, life: 0.45, t: 0, c, max }); }
  confetti(n = 140) {
    const W = window.innerWidth, cols = ['#ff2bd6', '#2de2ff', '#ffe14a', '#b6ff2e', '#ffffff', '#ff6a1f'];
    for (let i = 0; i < n; i++) this.parts.push({ k: 'conf', x: Math.random() * W, y: -20 - Math.random() * 200, vx: (Math.random() - 0.5) * 120, vy: 140 + Math.random() * 260, life: 2.6 + Math.random(), t: 0, c: cols[i % cols.length], r: Math.random() * 6, vr: (Math.random() - 0.5) * 12, w: 6 + Math.random() * 6 });
  }
  burst(x, y, n = 70) {
    const cols = ['#ff2bd6', '#2de2ff', '#ffe14a', '#ffffff'];
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 700; this.parts.push({ k: 'conf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 200, life: 1.4 + Math.random(), t: 0, c: cols[i % 4], r: Math.random() * 6, vr: (Math.random() - 0.5) * 14, w: 5 + Math.random() * 6, drag: 1 }); }
  }
  update(dt) {
    for (const p of this.parts) {
      p.t += dt;
      if (p.k === 'spark') { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 1 - 2 * dt; }
      if (p.k === 'conf') { if (p.drag) { p.vx *= 1 - 2.2 * dt; p.vy = p.vy * (1 - 2.2 * dt) + 500 * dt; } else { p.vx += Math.sin(p.t * 3 + p.r) * 60 * dt; } p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; }
    }
    this.parts = this.parts.filter((p) => p.t < p.life);
    const now = performance.now();
    this.trail = this.trail.filter((q) => now - q.t < 380);
  }
  draw() {
    const g = this.g, d = this.d; g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, this.cv.width, this.cv.height);
    if (this.trail.length > 1) {
      const now = performance.now();
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 1; i < this.trail.length; i++) {
          const a = this.trail[i - 1], b = this.trail[i], age = Math.max(0, 1 - (now - b.t) / 380);
          g.strokeStyle = pass ? `rgba(255,255,255,${age})` : `rgba(92,240,255,${age * 0.5})`;
          g.lineWidth = (pass ? 4 : 16) * (0.4 + age * 0.6);
          g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        }
      }
    }
    for (const p of this.parts) {
      const k = 1 - p.t / p.life;
      if (p.k === 'spark') { g.strokeStyle = p.c; g.globalAlpha = k; g.lineWidth = 3; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); g.stroke(); }
      else if (p.k === 'ring') { const e = 1 - Math.pow(1 - p.t / p.life, 3); g.strokeStyle = p.c; g.globalAlpha = k; g.lineWidth = 6 * k + 1; g.beginPath(); g.arc(p.x, p.y, e * p.max, 0, 7); g.stroke(); }
      else if (p.k === 'conf') { g.globalAlpha = Math.min(1, k * 2); g.fillStyle = p.c; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-p.w / 2, -p.w / 4, p.w, Math.max(1, p.w / 2 * Math.abs(Math.cos(p.t * 8 + p.r)))); g.restore(); }
    }
    g.globalAlpha = 1;
  }
}
