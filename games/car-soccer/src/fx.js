// Particles, camera shake, hit-stop, popups and goal explosions. World coords (y up).
export const fx = {
  parts: [], rings: [], popups: [], flash: 0, flashCol: '#fff', trauma: 0, hitstop: 0, slowmo: 0, zoomPunch: 0,
};
const MAX = 900;

export function resetFx() { fx.parts.length = 0; fx.rings.length = 0; fx.popups.length = 0; fx.flash = 0; fx.trauma = 0; fx.hitstop = 0; fx.slowmo = 0; fx.zoomPunch = 0; }

export function part(o) {
  if (fx.parts.length >= MAX) fx.parts.shift();
  fx.parts.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0.5, max: 0.5, size: 6, col: '#fff', type: 'dot', g: 0, drag: 2, rot: 0, vr: 0, add: true, ...o, max: o.life || 0.5 });
}
export function ring(x, y, col, r0, r1, life, width = 10) { fx.rings.push({ x, y, col, r0, r1, life, max: life, width }); }
export function shake(a) { fx.trauma = Math.min(1, fx.trauma + a); }
export function popup(text, col, opts = {}) {
  fx.popups.push({ text, col, t: 0, life: opts.life || 1.3, size: opts.size || 1, y: opts.y ?? 0.32, sub: opts.sub || '' });
  if (fx.popups.length > 3) fx.popups.shift();
}

export function sparks(x, y, nx, ny, power, col = '#fff') {
  const n = Math.min(40, 8 + power / 70);
  for (let i = 0; i < n; i++) {
    const a = Math.atan2(ny, nx) + (Math.random() - 0.5) * 2.2;
    const s = 300 + Math.random() * (400 + power * 0.6);
    part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.25 + Math.random() * 0.35, size: 3 + Math.random() * 4, col: Math.random() < 0.5 ? col : '#fff', type: 'streak', drag: 4, g: -600 });
  }
  ring(x, y, col, 10, 60 + power * 0.05, 0.3, 8);
}
export function dust(x, y, nx, ny, n = 8) {
  for (let i = 0; i < n; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const tx = -ny * side, ty = nx * side;
    const s = 80 + Math.random() * 220;
    part({ x, y, vx: tx * s + nx * 60, vy: ty * s + ny * 60, life: 0.4 + Math.random() * 0.3, size: 10 + Math.random() * 14, col: 'rgba(160,190,255,0.35)', type: 'smoke', add: false, drag: 3 });
  }
}
export function boostPuff(x, y, vx, vy, cols, big) {
  const c = cols[(Math.random() * cols.length) | 0];
  part({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: vx + (Math.random() - 0.5) * 120, vy: vy + (Math.random() - 0.5) * 120, life: 0.22 + Math.random() * 0.2, size: (big ? 16 : 11) + Math.random() * 8, col: c, type: 'glow', drag: 5 });
  if (Math.random() < 0.35) part({ x, y, vx: vx * 0.5, vy: vy * 0.5 + 40, life: 0.6, size: 14 + Math.random() * 10, col: 'rgba(120,130,170,0.18)', type: 'smoke', add: false, drag: 2 });
}

const EXPLOSIONS = {
  classic(x, y, col) {
    for (let i = 0; i < 140; i++) {
      const a = Math.random() * Math.PI * 2, s = 300 + Math.random() * 1500;
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.6 + Math.random() * 0.9, size: 4 + Math.random() * 8, col: Math.random() < 0.6 ? col : '#fff', type: 'streak', drag: 2.2, g: -500 });
    }
    ring(x, y, col, 40, 900, 0.7, 40); ring(x, y, '#fff', 20, 600, 0.5, 18);
  },
  fireworks(x, y, col) {
    const cols = [col, '#ffd23f', '#ff4fd8', '#5effa1', '#fff'];
    for (let k = 0; k < 6; k++) {
      const bx = x + (Math.random() - 0.5) * 700, by = y + 200 + Math.random() * 500, c = cols[k % cols.length], d = k * 0.12;
      for (let i = 0; i < 50; i++) {
        const a = (i / 50) * Math.PI * 2, s = 350 + Math.random() * 300;
        part({ x: bx, y: by, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 + Math.random() * 0.6, size: 5, col: c, type: 'dot', drag: 1.5, g: -350, delay: d });
      }
      ring(bx, by, c, 10, 280, 0.6, 10);
    }
    EXPLOSIONS.classic(x, y, col);
  },
  shockwave(x, y, col) {
    for (let k = 0; k < 5; k++) ring(x, y, k % 2 ? '#fff' : col, 30, 600 + k * 350, 0.6 + k * 0.15, 50 - k * 7);
    for (let i = 0; i < 90; i++) {
      const a = Math.random() * Math.PI * 2, s = 1200 + Math.random() * 1400;
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.4, size: 6, col: '#fff', type: 'streak', drag: 3 });
    }
  },
  confetti(x, y, col) {
    const cols = ['#ff4f6d', '#ffd23f', '#3fd0ff', '#7dff6a', '#c77dff', '#fff'];
    for (let i = 0; i < 220; i++) {
      const a = Math.PI / 2 + (Math.random() - 0.5) * 2.4, s = 600 + Math.random() * 1300;
      part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1.6 + Math.random() * 1.2, size: 9 + Math.random() * 7, col: cols[i % cols.length], type: 'confetti', drag: 2.6, g: -700, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20, add: false });
    }
    ring(x, y, col, 40, 700, 0.6, 30);
  },
  vortex(x, y, col) {
    for (let i = 0; i < 160; i++) {
      const a = Math.random() * Math.PI * 2, r = 500 + Math.random() * 400;
      part({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r, vx: -Math.cos(a) * r * 2.2 - Math.sin(a) * 900, vy: -Math.sin(a) * r * 2.2 + Math.cos(a) * 900, life: 0.45, size: 5, col: i % 3 ? col : '#fff', type: 'streak', drag: 0 });
    }
    setTimeout(() => EXPLOSIONS.shockwave(x, y, col), 420);
  },
  lightning(x, y, col) {
    for (let k = 0; k < 9; k++) {
      let px = x, py = y; const a = Math.random() * Math.PI * 2;
      for (let s = 0; s < 9; s++) {
        px += Math.cos(a) * 80 + (Math.random() - 0.5) * 90; py += Math.sin(a) * 80 + (Math.random() - 0.5) * 90;
        part({ x: px, y: py, vx: 0, vy: 0, life: 0.35 + s * 0.03, size: 16, col: s % 2 ? '#fff' : col, type: 'glow', drag: 0 });
      }
    }
    EXPLOSIONS.classic(x, y, col);
    fx.flash = 1;
  },
};
export const EXPLOSION_NAMES = Object.keys(EXPLOSIONS);
export function goalExplosion(kind, x, y, col) {
  (EXPLOSIONS[kind] || EXPLOSIONS.classic)(x, y, col);
  fx.flash = Math.max(fx.flash, 0.85); fx.flashCol = col;
  shake(1); fx.zoomPunch = 1;
}
export function demoBlast(x, y, col) {
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2, s = 200 + Math.random() * 900;
    part({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.6, size: 8 + Math.random() * 14, col: Math.random() < 0.5 ? '#ffb347' : col, type: 'glow', drag: 2.5, g: -200 });
  }
  for (let i = 0; i < 20; i++) part({ x, y, vx: (Math.random() - 0.5) * 500, vy: Math.random() * 400, life: 1.2, size: 30 + Math.random() * 30, col: 'rgba(60,60,80,0.35)', type: 'smoke', add: false, drag: 1.5 });
  ring(x, y, '#ffb347', 20, 420, 0.5, 26);
  shake(0.7);
}

export function updateFx(dt) {
  for (let i = fx.parts.length - 1; i >= 0; i--) {
    const p = fx.parts[i];
    if (p.delay > 0) { p.delay -= dt; continue; }
    p.life -= dt;
    if (p.life <= 0) { fx.parts.splice(i, 1); continue; }
    const k = Math.max(0, 1 - p.drag * dt);
    p.vx *= k; p.vy *= k; p.vy += p.g * dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
  }
  for (let i = fx.rings.length - 1; i >= 0; i--) { const r = fx.rings[i]; r.life -= dt; if (r.life <= 0) fx.rings.splice(i, 1); }
  for (let i = fx.popups.length - 1; i >= 0; i--) { const p = fx.popups[i]; p.t += dt; if (p.t > p.life) fx.popups.splice(i, 1); }
  fx.trauma = Math.max(0, fx.trauma - dt * 1.6);
  fx.flash = Math.max(0, fx.flash - dt * 2.5);
  fx.zoomPunch = Math.max(0, fx.zoomPunch - dt * 1.5);
}
