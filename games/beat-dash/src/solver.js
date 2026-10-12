// Depth-first solver over hold / release decisions. It proves a level can be
// beaten and gives the headless bot (and the menu's "watch" mode) a perfect
// run. `gran` is how many 240 Hz ticks each decision lasts: a level that still
// solves with coarse decisions (12+ ticks = 50 ms) has human-sized windows.
import { newRun, clone, step } from './sim.js';

export function solve(L, { gran = 8, maxNodes = 400000, from = null, horizon = 0, lazy = false } = {}) {
  const root = newRun(L, from);
  const failed = new Set();
  const key = (s) => s.tick + '|' + Math.round(s.y * 40) + '|' + Math.round(s.vy * 4) + '|' + s.grav + '|' + (s.grounded ? 1 : 0) + (s.buf ? 1 : 0) + (s.held ? 1 : 0) + '|' + s.used.join(',');
  const stack = [{ s: root, opt: 0, held: null }];
  let nodes = 0, best = 0;
  while (stack.length) {
    const top = stack[stack.length - 1];
    if (top.opt > 1) { failed.add(key(top.s)); stack.pop(); continue; }
    // prefer to keep doing what we were doing (fewer, more human inputs), release first at the start
    const prev = top.held === null ? false : top.held;
    const first = lazy ? false : prev;
    const held = top.opt++ === 0 ? first : !first;
    const s = clone(top.s);
    for (let i = 0; i < gran && !s.dead && !s.done; i++) step(L, s, held);
    if (++nodes > maxNodes) break;
    if (s.x > best) best = s.x;
    if (s.dead) continue;
    if (horizon && s.tick - root.tick >= horizon) return { ok: true, nodes };
    if (s.done) {
      const inputs = stack.slice(1).map((f) => f.held);
      inputs.push(held);
      const ticks = [];
      for (const h of inputs) for (let i = 0; i < gran; i++) ticks.push(h ? 1 : 0);
      return { ok: true, ticks, nodes, best: L.length };
    }
    if (failed.has(key(s))) continue;
    stack.push({ s, opt: 0, held });
  }
  return { ok: false, nodes, best };
}
