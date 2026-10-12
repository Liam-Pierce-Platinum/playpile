// Look-ahead autoplay: obstacles are pure functions of time, so the bot runs the
// exact same advance() forward over every tap / no-tap sequence (dead branches
// pruned) and takes the first move of the path that climbs highest.
import { advance, JUMP, DT } from './world.js';

export const DEC = 14;        // steps between decisions (~0.117 s)
const DEPTH = 11, BUDGET = 6000;

export function plan(g, budget = BUDGET) {
  if (!g.st.started) return { tap: true, nodes: 0, stuck: false };   // waiting on the start line is free, so never stall there
  const obs = g.obs;
  let nodes = 0;
  const run = (s0, tapNow) => {
    const s = { ...s0 };
    if (tapNow) { s.started = true; s.vy = -JUMP; }
    for (let k = 0; k < DEC; k++) if (advance(s, obs, DT) < 0) return null;
    return s;
  };
  // best reachable value from s with d decisions left (lower = higher up)
  const best = (s, d) => {
    if (d === 0 || nodes > budget) return s.focus * 10 + s.y;
    let b = Infinity;
    for (const t of [true, false]) {
      nodes++;
      const n = run(s, t);
      if (n) b = Math.min(b, best(n, d - 1));
    }
    return b;
  };
  let pick = null, val = Infinity;
  for (const t of [true, false]) {
    const n = run(g.st, t);
    if (!n) continue;
    const v = best(n, DEPTH - 1);
    if (v < val) { val = v; pick = t; }
  }
  return { tap: !!pick, nodes, stuck: pick === null || val === Infinity };
}
