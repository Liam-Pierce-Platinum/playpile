// fx.js - paint-y effects: splats, bursts, puffs, sparks. Textures are
// painted once and reused; particles are cheap structs drawn each frame.

import { rng, rgb, rgba, shade, ellipsePts, wash, splat, makeCanvas, ink } from './paint.js';
import { SS } from './sprites.js';

const tex = new Map();
function texture(key, w, h, paint) {
  if (tex.has(key)) return tex.get(key);
  const c = makeCanvas(w * SS, h * SS);
  const g = c.getContext('2d');
  g.scale(SS, SS);
  g.translate(w / 2, h / 2);
  paint(g);
  const t = { c, w, h };
  tex.set(key, t);
  return t;
}

// an ink splat (death stain), a few variants per colour
export function splatTex(col, v = 0) {
  return texture(`splat:${col}:${v}`, 60, 40, g => {
    const R = rng(v * 31 + col.length * 7 + col.charCodeAt(1));
    splat(g, 0, 0, 11, col, R, { layers: 9, alpha: 0.16, drops: 7, squash: 0.6 });
    splat(g, (R() - 0.5) * 6, (R() - 0.5) * 3, 6, shade(rgb(col), -0.3), R, { layers: 5, alpha: 0.16, drops: 2, squash: 0.6 });
  });
}
// explosion burst: hot centre, ochre ring, grey smoky edge
export function burstTex(kind = 'fire', v = 0) {
  return texture(`burst:${kind}:${v}`, 80, 80, g => {
    const R = rng(v * 13 + kind.length);
    const cols = kind === 'frost' ? ['#ffffff', '#bfe8ff', '#6aa8d8'] : kind === 'magic' ? ['#c0d8ff', '#8a7ae0', '#4a3a8a'] : kind === 'holy' ? ['#fff6c8', '#f0d070', '#d8a040'] : kind === 'green' ? ['#e0ffc0', '#8ac060', '#4a7a3a'] : kind === 'ink' ? ['#8a7ab0', '#4a3a68', '#1e1828'] : ['#fff0b0', '#f0a040', '#c05a2a'];
    wash(g, ellipsePts(0, 0, 32, 30, 12), '#6a625a', R, { layers: 10, alpha: 0.07, amt: 0.5, edge: 0.4, depth: 3 });
    wash(g, ellipsePts(0, 0, 25, 23, 12), cols[2], R, { layers: 10, alpha: 0.1, amt: 0.45, edge: 0.6, depth: 3 });
    wash(g, ellipsePts(0, 0, 17, 15, 12), cols[1], R, { layers: 10, alpha: 0.13, amt: 0.4, edge: 0.3, depth: 3 });
    wash(g, ellipsePts(0, 0, 9, 8, 10), cols[0], R, { layers: 8, alpha: 0.2, amt: 0.3, edge: 0, depth: 2 });
  });
}
export function puffTex(col = '#c8c0b4', v = 0) {
  return texture(`puff:${col}:${v}`, 40, 40, g => {
    const R = rng(v * 17 + 3);
    wash(g, ellipsePts(0, 0, 14, 12, 10), col, R, { layers: 8, alpha: 0.1, amt: 0.5, edge: 0.5, depth: 3 });
  });
}
export function scorchTex(v = 0) {
  return texture(`scorch:${v}`, 80, 50, g => {
    const R = rng(v * 7 + 1);
    wash(g, ellipsePts(0, 0, 26, 15, 12), '#3a2e28', R, { layers: 8, alpha: 0.07, amt: 0.6, edge: 0.4, depth: 3 });
  });
}
export function ringTex(col) {
  return texture(`ring:${col}`, 120, 80, g => {
    const R = rng(5);
    ink(g, ellipsePts(0, 0, 54, 34, 40), R, { closed: true, w: 2.4, color: col, jitter: 0.5 });
  });
}

// ------------------------------------------------------------------ particle system
export class FX {
  constructor() { this.ps = []; this.decals = []; this.shake = 0; }
  add(p) { p.t = 0; this.ps.push(p); return p; }
  decal(d) { d.t = 0; this.decals.push(d); if (this.decals.length > 140) this.decals.shift(); }
  update(dt) {
    for (const p of this.ps) {
      p.t += dt;
      if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.g) p.vy += p.g * dt; if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; } }
    }
    this.ps = this.ps.filter(p => p.t < p.life);
    for (const d of this.decals) d.t += dt;
    this.decals = this.decals.filter(d => d.t < d.life);
    this.shake = Math.max(0, this.shake - dt * 18);
  }
  drawDecals(g) {
    for (const d of this.decals) {
      const a = Math.min(1, (d.life - d.t) / 2.5) * (d.alpha ?? 1);
      g.globalAlpha = a;
      const T = d.tex;
      const s = d.s ?? 1;
      g.drawImage(T.c, d.x - T.w * s / 2, d.y - T.h * s / 2, T.w * s, T.h * s);
    }
    g.globalAlpha = 1;
  }
  draw(g, layer) {
    for (const p of this.ps) {
      if ((p.layer ?? 'top') !== layer) continue;
      const f = p.t / p.life;
      switch (p.k) {
        case 'tex': {
          const s = (p.s0 ?? 0.3) + ((p.s1 ?? 1) - (p.s0 ?? 0.3)) * Math.sqrt(f);
          g.globalAlpha = (p.a ?? 1) * (1 - f) ** (p.fade ?? 1.2);
          const T = p.tex;
          g.drawImage(T.c, p.x - T.w * s / 2, p.y - T.h * s / 2, T.w * s, T.h * s);
          break;
        }
        case 'drop': {
          g.globalAlpha = 1 - f * f;
          g.fillStyle = p.col;
          g.beginPath(); g.arc(p.x, p.y, p.r * (1 - f * 0.5), 0, 7); g.fill();
          break;
        }
        case 'spark': {
          g.globalAlpha = 1 - f;
          g.strokeStyle = p.col; g.lineWidth = p.w ?? 1.2; g.lineCap = 'round';
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); g.stroke();
          break;
        }
        case 'text': {
          g.globalAlpha = f < 0.8 ? 1 : (1 - f) * 5;
          g.font = `${p.size ?? 16}px 'Hand', sans-serif`;
          g.textAlign = 'center';
          g.lineWidth = 3; g.strokeStyle = 'rgba(243,233,210,0.9)'; g.lineJoin = 'round';
          g.strokeText(p.text, p.x, p.y - f * 24);
          g.fillStyle = p.col ?? '#2a2230';
          g.fillText(p.text, p.x, p.y - f * 24);
          break;
        }
        case 'ring': {
          const r = p.r0 + (p.r1 - p.r0) * f;
          g.globalAlpha = (1 - f) * (p.a ?? 0.8);
          g.strokeStyle = p.col; g.lineWidth = p.w ?? 2;
          g.beginPath(); g.ellipse(p.x, p.y, r, r * 0.62, 0, 0, 7); g.stroke();
          break;
        }
        case 'bolt': {
          // jagged lightning, re-jittered each frame
          g.globalAlpha = 1 - f;
          for (const [w, col] of [[5, 'rgba(120,170,255,0.35)'], [2.2, 'rgba(190,220,255,0.9)'], [0.9, '#ffffff']]) {
            g.strokeStyle = col; g.lineWidth = w; g.lineJoin = 'round';
            g.beginPath();
            for (let i = 0; i < p.pts.length - 1; i++) {
              const a = p.pts[i], b = p.pts[i + 1];
              if (i === 0) g.moveTo(a.x, a.y);
              const n = 5;
              for (let k = 1; k <= n; k++) {
                const t = k / n;
                const j = k === n ? 0 : (Math.random() - 0.5) * 12;
                g.lineTo(a.x + (b.x - a.x) * t + j, a.y + (b.y - a.y) * t + j * 0.6);
              }
            }
            g.stroke();
          }
          break;
        }
        case 'line': {
          g.globalAlpha = (1 - f) * (p.a ?? 1);
          g.strokeStyle = p.col; g.lineWidth = p.w ?? 1.5; g.lineCap = 'round';
          g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x2, p.y2); g.stroke();
          break;
        }
        case 'corpse': {
          // the body tips over backwards and soaks into the page
          const tip = Math.min(1, f * 2.2);
          const ease = 1 - (1 - tip) * (1 - tip);
          g.save();
          g.globalAlpha = Math.max(0, 1 - f * f * 1.4);
          g.translate(p.x, p.y + (p.fly ? f * 30 : 0));
          g.scale(p.face * p.kk, p.kk * (1 - f * 0.25));
          g.rotate(-ease * 1.35);
          g.drawImage(p.spr.c, -p.spr.ax, -p.spr.ay, p.spr.w, p.spr.h);
          g.restore();
          break;
        }
        case 'leaf': {
          g.globalAlpha = 1 - f;
          g.fillStyle = p.col;
          g.save(); g.translate(p.x, p.y); g.rotate(p.t * 5 + p.x);
          g.beginPath(); g.ellipse(0, 0, 2.6, 1.2, 0, 0, 7); g.fill(); g.restore();
          break;
        }
        case 'roots': {
          g.globalAlpha = Math.min(1, (p.life - p.t) * 2) * 0.9;
          g.strokeStyle = '#5a7a3a'; g.lineWidth = 1.6; g.lineCap = 'round';
          const grow = Math.min(1, p.t * 4);
          for (let i = 0; i < p.n; i++) {
            const a = (i / p.n) * Math.PI * 2 + p.seed;
            const rx = Math.cos(a) * p.r * 0.7, ry = Math.sin(a) * p.r * 0.4;
            g.beginPath(); g.moveTo(p.x + rx, p.y + ry);
            g.quadraticCurveTo(p.x + rx * 0.5, p.y + ry - 10 * grow, p.x + rx * 0.3, p.y + ry - 16 * grow);
            g.stroke();
          }
          break;
        }
      }
    }
    g.globalAlpha = 1;
  }
}
