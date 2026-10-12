// The headless bot's brain: samples shots, simulates each one with the real
// physics and keeps the best. Used by tools/*.mjs through window.__G.bot().
import { simulate, GW, GH } from './physics.js';

export function planShot(setup, preT, opts = {}) {
  const n = opts.samples || 900;
  let a = (opts.seed || 1) >>> 0 || 1;
  const r = () => { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; };
  let best = null;
  const tg = setup.targets || [];
  for (let i = 0; i < n; i++) {
    let tx, ty;
    if (tg.length && r() < 0.5) { const t = tg[Math.floor(r() * tg.length)]; tx = t.x + (r() - 0.5) * t.r; ty = t.y + (r() - 0.5) * t.r; }
    else { tx = (r() * 2 - 1) * (GW - 0.2); ty = 0.2 + r() * (GH - 0.4); }
    // the bot compensates wind crudely by aiming against it
    const shot = { tx, ty, speed: 18 + r() * 15, bend: (r() * 2 - 1) * 4.5 };
    const res = simulate(setup, preT, shot);
    const sc = res.s.pts + (res.s.result === 'goal' ? 0 : -1000) - Math.abs(shot.bend) * 0.01;
    if (!best || sc > best.sc) best = { sc, shot, s: res.s };
  }
  return best;
}
