// Look-ahead bot: the sim is deterministic, so it just tries every short input plan,
// simulates it, and keeps the one that leaves the mirror worst off. Used by the tests
// (proves every stage is winnable) and as the attract-mode player behind the title.
import { step, cloneState, W } from './sim.js';

const A = [{}, { l: 1 }, { r: 1 }, { j: 1 }, { j: 1, l: 1 }, { j: 1, r: 1 }, { p: 1 }, { h: 1 }, { l: 1, h: 1 }, { r: 1, h: 1 }, { l: 1, p: 1 }, { r: 1, p: 1 }];
const B = [{}, { l: 1 }, { r: 1 }, { j: 1 }, { p: 1 }, { h: 1 }];
const HOLD = 10;

// buttons are pressed for the first 3 frames of a plan, then released so the next plan can press again
const at = (a, i) => (i < 3 ? a : { l: a.l, r: a.r });
function run(s, st, inp, n) { for (let i = 0; i < n && s.phase === 'fight'; i++) step(s, st, at(inp, i)); return s; }

// rollout policy: close the distance and swing heavy - asks 'what if we just brawl from here?'
function brawl(s, st, n) {
  for (let i = 0; i < n && s.phase === 'fight'; i++) {
    const [me, mi] = s.f, d = mi.x - me.x;
    step(s, st, Math.abs(d) > 95 ? (d > 0 ? { r: 1 } : { l: 1 }) : i % 8 < 2 ? { h: 1 } : {});
  }
  return s;
}

function score(s, st) {
  const [me, mi] = s.f;
  let v = (me.hp / me.hpMax - mi.hp / mi.hpMax) * 100;
  if (s.phase !== 'fight') v += s.winner === 0 ? 500 : s.winner === 1 ? -500 : 0;
  // gentle shaping: mirror near its hazards is good, me near mine is bad; keep within striking range
  let dm = 1e9, dp = 1e9;
  for (const hx of st.hazX) { dm = Math.min(dm, Math.abs(mi.x - hx)); dp = Math.min(dp, Math.abs(me.x - hx)); }
  v += -Math.min(dm, 400) * 0.012 + Math.min(dp, 400) * 0.006;
  v -= Math.abs(Math.abs(me.x - mi.x) - 70) * 0.002;
  return v;
}

export function makeBot(seed = 1) {
  let plan = {}, left = 0, r = seed;
  const rnd = () => (((r = (Math.imul(r, 1103515245) + 12345) & 0x7fffffff)) / 0x7fffffff);
  return function think(s, st) {
    if (s.phase !== 'fight') return {};
    if (left > 0) { left--; return at(plan, HOLD - 1 - left); }
    let best = -1e9, bestA = A[0];
    for (const a of A) {
      const s1 = run(cloneState(s), st, a, HOLD);
      let bb = -1e9;
      for (const b of B) {
        const s2 = run(cloneState(s1), st, b, HOLD);
        brawl(s2, st, 50);
        bb = Math.max(bb, score(s2, st));
      }
      bb += rnd() * 0.01;
      if (bb > best) { best = bb; bestA = a; }
    }
    plan = bestA; left = HOLD - 1;
    return at(plan, 0);
  };
}
