// Throw search with the real physics. Used by the in-game bot (?bot=1) and tools/solve.mjs.
import { L } from './physics.js';

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

export function evalThrow(sim, th) {
  const s = sim.clone(); s.throwBall(th); const st = s.run(8); return st.length;
}

// returns { throw, standing }
export function searchThrow(sim, { n = 140, seed = 1, spinBias = null } = {}) {
  const r = rng(seed);
  let best = null, bestN = 99;
  const pins = sim.pins.filter((p) => !sim.isDown(p));
  const cx = pins.length ? pins.reduce((a, p) => a + p.x, 0) / pins.length : 0;
  const sample = () => {
    const x = (r() * 2 - 1) * 0.42, spin = spinBias !== null ? spinBias + (r() - 0.5) * 0.3 : (r() * 2 - 1) * 0.8, speed = 6.5 + r() * 3.5;
    const tx = cx + (r() * 2 - 1) * 0.35;
    // rough hook compensation: lateral drift ~ spin * 0.35 m
    const angle = Math.max(-0.05, Math.min(0.05, Math.atan((tx - x - spin * 0.2) / -L.headZ)));
    return { x, angle, speed, spin };
  };
  for (let i = 0; i < n; i++) {
    const th = sample(); const k = evalThrow(sim, th);
    if (k < bestN) { bestN = k; best = th; if (k === 0 && i > n / 3) break; }
  }
  // local refine
  for (let i = 0; i < n / 2 && bestN > 0; i++) {
    const th = { x: Math.max(-0.42, Math.min(0.42, best.x + (r() - 0.5) * 0.06)), angle: Math.max(-0.05, Math.min(0.05, best.angle + (r() - 0.5) * 0.004)), speed: best.speed + (r() - 0.5) * 0.8, spin: best.spin + (r() - 0.5) * 0.15 };
    const k = evalThrow(sim, th); if (k < bestN) { bestN = k; best = th; }
  }
  return { throw: best, standing: bestN };
}
