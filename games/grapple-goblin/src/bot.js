// A simple autopilot: plays the title-screen attract run and the headless tests.
// It only ever decides "hold" or "let go", same as a player.
import { T, flingVel } from './world.js';
import { KILL_Y } from './levels.js';

// fling from the current state and see if we come down somewhere useful
function simulate(w, fromAnchor) {
  const g = w.g;
  let x = g.x, y = g.y, { vx, vy } = flingVel(g);
  const dt = 1 / 60;
  for (let i = 0; i < 90; i++) {
    const t = w.t + i * dt;
    vy += T.GRAV * dt;
    for (const z of w.L.winds) {
      if (x < z.x || x > z.x + z.w || y < z.y - 40 || y > z.y + z.h) continue;
      if (z.period && ((t + z.phase) % z.period) > z.on) continue;
      vx += z.fx * dt; vy += z.fy * Math.min(1, Math.max(0, (y - z.y) / 110)) * dt;
      if (z.fy < 0 && vy < -640) vy = -640;
    }
    x += vx * dt; y += vy * dt;
    if (y > KILL_Y - 10) return { ok: false };
    const cy = w.ceilY(x);
    if (y - T.R < cy) { y = cy + T.R; vy = Math.abs(vy) * 0.3; }
    for (const s of w.L.spikes) if (x > s.x - 16 && x < s.x + s.w + 16 && y > s.y - 18 && y < s.y + s.h + 18) return { ok: false };
    for (const b of w.L.bats) {
      const ph = (t * Math.PI * 2) / b.period + b.phase;
      const bx = (b.x0 + b.x1) / 2 + ((b.x1 - b.x0) / 2) * Math.sin(ph);
      if (Math.hypot(bx - x, b.y0 - y) < 46) return { ok: false };
    }
    for (const s of w.L.solids) {
      if (s.kind === 'wall' || x < s.x - 10 || x > s.x + s.w + 10 || y + T.R < s.y) continue;
      if (y - vy * dt + T.R <= s.y + 6) return { ok: x > g.x + 40 };   // came down on top
      return { ok: false };                                            // hit its side
    }
    if (i > 8 && vy > -260) {
      const a = w.pick(x, y, fromAnchor);
      if (a && a.x > (fromAnchor ? fromAnchor.x + 80 : g.x + 60) && a.state === 'ok') return { ok: true, a };
    }
  }
  return { ok: false };
}

export function botHold(w) {
  const g = w.g;
  if (!g.alive || w.done) return false;
  if (g.rope) {
    const r = g.rope, a = r.a;
    if (a.state === 'crack' && a.crack > T.CRUMBLE - 0.2) return false;
    if (r.t < 0.18) return true;
    if (g.vx > 80 && g.vy < -60) { if (simulate(w, a).ok) return false; }
    if (r.t > 6 && g.vx > 0 && g.vy < 0) return false;
    return true;
  }
  if (g.hook) return g.hook.state === 'out';
  if (g.riding) return false;
  const a = w.pick(g.x, g.y);
  if (!a || a.x < g.x + 30) return false;
  if (g.onGround) return !w.safeGround(g.x + 45);
  if (g.vy < -240) return false;
  // hooking an anchor level with you at speed throws you over the top: wait until it is above you
  if (g.vx > 600 && a.y > g.y - 60 && g.y < 470) return false;
  // flying fast and nearly under it: the hook would yank you straight up, so wait for the next one
  if (g.vx > 700 && a.x - g.x < g.vx * 0.14 && g.y < 500) return false;
  // falling toward something that will catch us anyway (a mushroom, a ledge)? let it
  const fx = g.x + g.vx * 0.3;
  for (const s of w.L.solids) if ((s.kind === 'mush' || s.kind === 'track') && fx > s.x + 10 && fx < s.x + s.w - 10 && s.y > g.y && s.y - g.y < 140) return false;
  return true;
}
