// Particles, popups, banners, shake, hit-stop and slow motion. Everything a
// game event should FEEL like lives here; render.js only draws it.
import { ARROWS, byId } from './cosmetics.js';

const rand = (a, b) => a + Math.random() * (b - a);

export class FX {
  constructor() { this.reset(); this.reduced = false; }
  reset() {
    this.parts = []; this.pops = []; this.rings = []; this.banners = [];
    this.shake = 0; this.flash = 0; this.flashCol = '255,255,255';
    this.vig = 0; this.blur = 0; this.chroma = 0;
    this.hitstop = 0; this.slow = 0;
    this.squash = 0; this.readyPulse = 0;
    this.deathT = -1; this.scrapeAcc = 0;
  }
  // game-time multiplier for main.js: hit-stop freezes, then a slow-mo ease back
  timeScale() {
    if (this.hitstop > 0) return 0;
    if (this.slow > 0) return 0.28 + 0.72 * (1 - this.slow / 0.5) ** 2;
    return 1;
  }
  update(dtReal, dtGame) {
    this.hitstop = Math.max(0, this.hitstop - dtReal);
    if (this.hitstop <= 0) this.slow = Math.max(0, this.slow - dtReal);
    this.shake *= Math.pow(0.0009, dtReal);
    if (this.shake < 0.2) this.shake = 0;
    this.flash = Math.max(0, this.flash - dtReal * 3.2);
    this.vig = Math.max(0, this.vig - dtReal * 1.6);
    this.blur = Math.max(0, this.blur - dtReal);
    this.chroma = Math.max(0, this.chroma - dtReal * 2.2);
    this.squash = Math.max(0, this.squash - dtReal * 9);
    this.readyPulse += dtReal;
    const dt = dtGame;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts[i] = this.parts[this.parts.length - 1]; this.parts.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(p.drag, dt); p.vy *= Math.pow(p.drag, dt);
      p.vy += p.g * dt;
      p.rot += p.vr * dt;
    }
    for (let i = this.pops.length - 1; i >= 0; i--) { const p = this.pops[i]; p.life -= dtReal; p.y -= 30 * dtReal; if (p.life <= 0) this.pops.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { const r = this.rings[i]; r.t += dtReal; if (r.t >= r.max) this.rings.splice(i, 1); }
    for (let i = this.banners.length - 1; i >= 0; i--) { const b = this.banners[i]; b.t += dtReal; if (b.t >= b.max) this.banners.splice(i, 1); }
  }
  part(o) {
    if (this.parts.length > 900) return;
    this.parts.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 2, col: '#fff', type: 'spark', drag: 0.05, g: 0, rot: 0, vr: 0, len: 6 }, o));
  }
  burst(x, y, n, col, spd, life, type = 'spark', size = 2, ang = null, spread = Math.PI * 2) {
    for (let i = 0; i < n; i++) {
      const a = ang == null ? Math.random() * Math.PI * 2 : ang + (Math.random() - 0.5) * spread;
      const s = spd * rand(0.35, 1);
      const l = life * rand(0.6, 1);
      this.part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: l, max: l, col, type, size: size * rand(0.6, 1.2), len: rand(4, 10) * size / 2 });
    }
  }
  pop(x, y, text, col = '#fff', size = 16, life = 0.7) { this.pops.push({ x, y, text, col, size, life, max: life }); }
  ring(x, y, col, max = 0.5, r1 = 120, width = 6, chroma = false) { this.rings.push({ x, y, col, t: 0, max, r1, width, chroma }); }
  banner(text, sub, col, max = 1.3) { this.banners.length = 0; this.banners.push({ text, sub, col, t: 0, max }); }
  kick(s) { if (!this.reduced) this.shake = Math.max(this.shake, s); }

  // ---------------------------------------------------------------- events
  onEvent(type, d, g, look) {
    const acc = look.accent, p = g.p;
    switch (type) {
      case 'turn': this.squash = 1; break;
      case 'graze': {
        const k = Math.min(d.combo, 40);
        const n = 5 + Math.floor(k / 3);
        const ang = Math.atan2(p.y - d.y, p.x - d.x);
        this.burst(d.x, d.y, n, '#ffffff', 260 + k * 9, 0.32 + k * 0.006, 'spark', 1.5 + k * 0.05, Math.PI + ang * 0.2, 2.4);
        this.burst(d.x, d.y, Math.ceil(n / 2), acc, 180 + k * 6, 0.45, 'dot', 1.6 + k * 0.04);
        this.pop(p.x + 10, p.y - 24, '+' + d.pts, d.mult >= 5 ? '#fff' : acc, 12 + Math.min(8, d.mult), 0.55);
        break;
      }
      case 'scrape':
        this.scrapeAcc += 1;
        if (this.scrapeAcc > 2) { this.scrapeAcc = 0; this.burst(d.x, d.y, 1, '#ffffff', 220, 0.18, 'spark', 1.2, Math.PI, 1.2); }
        break;
      case 'mult':
        this.vig = d.mult >= 5 ? 1 : 0.6;
        if (d.mult % 5 === 0) this.banner('x' + d.mult, 'MULTIPLIER', '#ffffff', 1.0);
        break;
      case 'comboLost': break;
      case 'phaseReady': this.ring(p.x, p.y, '#ffffff', 0.45, 60, 3); this.burst(p.x, p.y, 14, acc, 220, 0.4, 'dot', 2); break;
      case 'phase':
        this.hitstop = 0.12; this.slow = 0.5; this.blur = 0.42; this.chroma = 1; this.flash = 0.55; this.flashCol = '255,255,255';
        this.kick(7);
        this.ring(d.nx, d.ny, '#ffffff', 0.6, 260, 10, true);
        this.ring(d.nx, d.ny, acc, 0.8, 420, 4);
        this.burst(d.nx, d.ny, 40, '#ffffff', 600, 0.6, 'spark', 2.4);
        this.burst(d.nx, d.ny, 26, acc, 380, 0.8, 'dot', 2.6);
        this.pop(p.x, p.y - 40, 'PHASE  +' + d.bonus, '#ffffff', 26, 1.1);
        break;
      case 'phaseThrough':
        this.ring(d.x, d.y, acc, 0.4, 120, 4, true);
        this.burst(d.x, d.y, 16, '#ffffff', 400, 0.4, 'spark', 2);
        this.pop(d.x, d.y - 30, '+' + d.bonus, acc, 18, 0.8);
        break;
      case 'death': this.death(d, g, look); break;
      case 'portal':
        this.ring(d.x, p.y, look.portalCol(d.kind), 0.5, 160, 5);
        this.burst(d.x, p.y, 18, look.portalCol(d.kind), 300, 0.5, 'dot', 2.2);
        break;
      case 'tier': this.banner('SPEED UP', 'TIER ' + (d.tier + 1), look.accent, 1.6); this.flash = 0.35; this.flashCol = '255,255,255'; break;
      case 'checkpoint': this.ring(d.x, d.y, '#5dff9b', 0.5, 70, 3); break;
      case 'finish':
        for (let i = 0; i < 4; i++) this.burst(p.x + 40, p.y, 30, ['#ffffff', acc, '#ffd34d', '#ff5fa2'][i], 600, 1.4, i % 2 ? 'sq' : 'spark', 3);
        this.flash = 0.5; this.flashCol = '255,255,255';
        break;
      case 'start': this.deathT = -1; this.parts.length = 0; this.rings.length = 0; this.slow = 0; this.hitstop = 0; break;
    }
  }

  death(d, g, look) {
    const p = g.p, acc = look.accent, style = look.death;
    this.kick(16); this.flash = 0.5; this.flashCol = '255,255,255'; this.deathT = 0;
    this.hitstop = 0.06;
    // arrow outline shatters into its own line segments
    const shape = byId(ARROWS, look.arrow).pts, sz = p.mini ? 8 : 13;
    const ang = p.up ? -Math.PI / 4 : Math.PI / 4;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < shape.length; i++) {
      const a = shape[i], b = shape[(i + 1) % shape.length];
      const ax = p.x + (a[0] * ca - a[1] * sa) * sz, ay = p.y + (a[0] * sa + a[1] * ca) * sz;
      const bx = p.x + (b[0] * ca - b[1] * sa) * sz, by = p.y + (b[0] * sa + b[1] * ca) * sz;
      const mx = (ax + bx) / 2, my = (ay + by) / 2;
      const out = Math.atan2(my - p.y, mx - p.x);
      for (let k = 0; k < 2; k++) {
        const l = 1.0 + Math.random() * 0.5;
        this.part({ type: 'frag', x: mx, y: my, vx: Math.cos(out) * rand(120, 320) + g.vx * 0.25, vy: Math.sin(out) * rand(120, 320) - 60, g: 520, drag: 0.4, life: l, max: l, rot: Math.atan2(by - ay, bx - ax), vr: rand(-14, 14), len: Math.hypot(bx - ax, by - ay) * 0.55, col: k ? acc : '#ffffff', size: 2.2 });
      }
    }
    if (style === 'nova') {
      this.ring(p.x, p.y, '#ffffff', 0.7, 300, 12, true); this.ring(p.x, p.y, acc, 0.9, 480, 5);
      this.burst(p.x, p.y, 70, '#ffffff', 700, 0.8, 'spark', 2.4);
    } else if (style === 'pixel') {
      this.burst(p.x, p.y, 60, acc, 420, 1.1, 'sq', 4); this.burst(p.x, p.y, 30, '#ffffff', 300, 0.9, 'sq', 3);
      for (const q of this.parts) if (q.type === 'sq') q.g = 500;
    } else if (style === 'glitch') {
      this.chroma = 1.2; this.blur = 0.25;
      this.burst(p.x, p.y, 40, '#ff2a6d', 500, 0.6, 'spark', 2.2); this.burst(p.x, p.y, 40, '#2af6ff', 500, 0.6, 'spark', 2.2);
      for (let i = 0; i < 12; i++) this.part({ type: 'slice', x: p.x + rand(-60, 60), y: p.y + rand(-60, 60), vx: rand(-200, 200), life: 0.35, max: 0.35, len: rand(30, 120), size: rand(3, 9), col: i % 2 ? '#ff2a6d' : '#2af6ff' });
    } else {
      this.burst(p.x, p.y, 34, '#ffffff', 520, 0.6, 'spark', 2.2);
      this.burst(p.x, p.y, 20, acc, 300, 0.8, 'dot', 2.4);
      this.ring(p.x, p.y, acc, 0.45, 140, 4);
    }
  }
}
