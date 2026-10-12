// One run of PRISM: spawning, stars, switches, death, effects, camera.
import { CX, R_BALL, JUMP, DT, GAP, PICK, COLS, makeRng, makeObstacle, poolFor, advance } from './world.js';

export const MODES = {
  classic: { name: 'CLASSIC', start: 0, speed: 1 },
  rush: { name: 'RUSH', start: 9, speed: 1.25 },
};

export function newGame(mode, seed, hooks = {}) {
  const M = MODES[mode] || MODES.classic;
  const r = makeRng(seed);
  const g = {
    mode, seed, r, hooks,
    st: { y: 0, vy: 0, col: 0, started: false, t: 0, focus: 0, swId: 0 },
    obs: [], nextId: 0, nextBottom: -170, lastType: '', chainCol: 0,
    score: 0, alive: true, deadT: 0, deathKind: '', time: 0,
    cam: 0, shake: 0, hitstop: 0, flash: 0,
    parts: [], rings: [], floats: [], trail: [],
    chain: 0, chainT: 0, squash: 0, stretch: 0, popT: 0, taps: 0, passed: 0,
    milestone: 0,
  };
  // first obstacle decides the starting colour
  spawn(g, M, true);
  g.st.col = g.chainCol = g.obs[0].cols[(r() * g.obs[0].cols.length) | 0];
  // onboarding: the first ring waits (frozen until the first tap) with the
  // ball's own colour facing it, so tap #1 always goes through
  const o0 = g.obs[0];
  // ...and the opposite quadrant is your colour too, so the way OUT the top is
  // open as well (a 4-colour first ring meant hovering ~3 s inside it, and
  // every steady tapper died on the top band right after the first star)
  if (o0.type === 'ring') { const i = o0.cols.indexOf(g.st.col), j = (i + 2) % 4; o0.cols[j] = g.st.col; }
  if (o0.type === 'ring') o0.ph = Math.PI / 2 - (o0.cols.indexOf(g.st.col) + 0.5) * (Math.PI / 2) - o0.w * 1.4;   // your colour centred bottom+top mid-crossing (~1.4 s)
  g.M = M;
  while (g.nextBottom > -1400) spawn(g, M);
  return g;
}

function spawn(g, M, first) {
  const n = g.nextId + M.start;
  let type;
  if (first && M.start === 0) type = 'ring';
  else {
    const pool = poolFor(n).filter((t) => t !== g.lastType);
    type = pool[(g.r() * pool.length) | 0];
  }
  const o = makeObstacle(type, 0, g.r, n, M.speed * (first && M.start === 0 ? 0.35 /* tutorial ring */ : first ? 0.8 : 1));
  const cy = o.cy = g.nextBottom - o.hh;   // prims read o.cy live
  o.id = g.nextId++;
  o.star = { x: CX, y: cy, taken: false };
  if (!first) {
    const choices = o.cols.filter((c) => c !== g.chainCol);
    const col = choices[(g.r() * choices.length) | 0];
    o.sw = { x: CX, y: g.nextBottom + GAP / 2, col, taken: false };
    g.chainCol = col;
  }
  g.nextBottom = cy - o.hh - GAP;
  g.lastType = type;
  g.obs.push(o);
}

export function tap(g) {
  if (!g.alive) return false;
  g.st.started = true;
  g.st.vy = -JUMP;
  g.stretch = 1; g.taps++;
  g.hooks.sfx && g.hooks.sfx('jump');
  return true;
}

function burst(g, x, y, col, n, sp, life, size) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, v = sp * (0.35 + Math.random() * 0.65);
    g.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life, max: life, col, size: size * (0.6 + Math.random() * 0.8), g: 0 });
  }
}

export function step(g, dt = DT) {
  g.time += dt;
  // effects always run
  for (const p of g.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt; p.vx *= 0.985; p.vy *= 0.985; p.life -= dt; }
  g.parts = g.parts.filter((p) => p.life > 0);
  for (const q of g.rings) q.t += dt;
  g.rings = g.rings.filter((q) => q.t < q.max);
  for (const f of g.floats) { f.t += dt; f.y -= 40 * dt; }
  g.floats = g.floats.filter((f) => f.t < 0.9);
  g.shake = Math.max(0, g.shake - dt * 40);
  g.flash = Math.max(0, g.flash - dt * 3);
  g.squash = Math.max(0, g.squash - dt * 5);
  g.stretch = Math.max(0, g.stretch - dt * 6);
  g.popT = Math.max(0, g.popT - dt * 4);
  g.chainT -= dt; if (g.chainT <= 0) g.chain = 0;
  if (g.milestone > 0) g.milestone -= dt;

  if (g.hitstop > 0) { g.hitstop -= dt; return; }
  if (!g.alive) { g.deadT += dt; return; }

  const st = g.st, M = g.M;
  const ev = advance(st, g.obs, dt);
  if (g.hooks.botTick) g.hooks.botTick(g);
  // trail
  if (st.started) { g.trail.push({ y: st.y, col: st.col }); if (g.trail.length > 26) g.trail.shift(); }
  if (ev === 1) {
    g.squash = 1;
    g.rings.push({ x: CX, y: st.y, col: st.col, t: 0, max: 0.45, r0: 14, r1: 90 });
    burst(g, CX, st.y, COLS[st.col], 14, 260, 0.45, 3);
    g.shake = Math.max(g.shake, 4);
    g.hooks.sfx && g.hooks.sfx('switch');
  } else if (ev < 0) {
    die(g, ev === -1 ? 'hit' : 'fall');
    return;
  }
  // stars
  for (const o of g.obs) {
    if (!o.star.taken && Math.abs(st.y - o.star.y) < R_BALL + PICK) {
      o.star.taken = true; g.score++; g.chain++; g.chainT = 2.6; g.popT = 1;
      burst(g, CX, o.star.y, '#ffffff', 16, 240, 0.5, 2.6);
      burst(g, CX, o.star.y, COLS[st.col], 8, 160, 0.6, 3);
      g.floats.push({ x: CX + 26, y: o.star.y - 6, t: 0, txt: '+1' });
      g.shake = Math.max(g.shake, 3);
      g.hooks.sfx && g.hooks.sfx('star', g.chain);
      if (g.score % 10 === 0) { g.milestone = 1.4; g.flash = 0.35; g.hooks.sfx && g.hooks.sfx('milestone'); }
    }
  }
  // camera eases to the focus
  g.cam += (st.focus - g.cam) * Math.min(1, dt * 9);
  // stream obstacles
  while (g.nextBottom > st.focus - 1400) spawn(g, M);
  g.obs = g.obs.filter((o) => o.cy - o.hh < st.focus + 600);
}

function die(g, kind) {
  g.alive = false; g.deathKind = kind; g.deadT = 0;
  g.hitstop = kind === 'hit' ? 0.09 : 0;
  g.shake = 16; g.flash = 0.6;
  const y = g.st.y;
  for (let i = 0; i < 4; i++) burst(g, CX, y, COLS[i], 9, 420, 0.9, 5);
  for (const p of g.parts) if (p.max === 0.9) p.g = 500;
  g.rings.push({ x: CX, y, col: g.st.col, t: 0, max: 0.6, r0: 10, r1: 150 });
  g.hooks.sfx && g.hooks.sfx('die');
  g.hooks.onDeath && g.hooks.onDeath(g);
}
