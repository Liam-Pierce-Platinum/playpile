// Pure simulation: table, puck, mallets, goals, bot. No DOM, so Node can run it
// (tools/sim.mjs plays thousands of bot-vs-bot points headlessly).
//
// Coordinates: the table is always W x H "units", portrait, y down.
// Side 0 = bottom player (P1, you). Side 1 = top player (bot or P2).
// Side 0 defends the goal at y = H, side 1 defends the goal at y = 0.

export const W = 600;
export let H = 1000;            // table length adapts to the screen shape (1000..1250), see setLength
export function setLength(h, g) {
  const k = h / H;
  H = h;
  if (g) { for (const o of [g.puck, ...g.m]) { o.y *= k; if (o.ty != null) o.ty *= k; } g.anchor = null; }
}
export const GOAL = 240;          // goal mouth width
export const PR = 27;             // puck radius
export const MR = 45;             // mallet radius
export const MAXP = 2500;         // puck speed cap (units/s)
export const HUMAN_SPEED = 8000;  // max mallet speed when following a pointer
const WALL_E = 0.9, HIT_E = 0.86, FRICTION = 0.22;

export const DIFF = {
  easy:   { speed: 800,  react: 0.26, err: 130, strike: 520,  predict: false, defY: 150, aggro: 0.55 },
  medium: { speed: 1600, react: 0.11, err: 60,  strike: 900,  predict: false, defY: 125, aggro: 0.8 },
  hard:   { speed: 2050, react: 0.08, err: 40,  strike: 1400, predict: true,  defY: 110, aggro: 1 },
};

export function createGame(opts = {}) {
  const g = {
    mode: opts.mode || 'bot',             // 'bot' | '2p' | 'demo' (bot vs bot)
    diff: opts.diff || 'medium',
    diff0: opts.diff0 || opts.diff || 'medium', // P1 bot level in demo/tests
    target: opts.target || 7,
    score: [0, 0],
    puck: { x: W / 2, y: H * 0.68, vx: 0, vy: 0, inGoal: 0 },
    m: [mallet(W / 2, H - 120), mallet(W / 2, 120)],
    bot: [botState(), botState()],
    phase: 'play',                        // 'play' | 'goal' | 'over'
    phaseT: 0,
    lastScorer: -1,
    winner: -1,
    t: 0,
    events: [],
    stats: { hits: [0, 0], top: 0, rallies: 0, longest: 0, rally: 0 },
    rng: opts.seed != null ? mulberry(opts.seed) : Math.random,
  };
  return g;
}

function mallet(x, y) { return { x, y, vx: 0, vy: 0, tx: x, ty: y, cool: 0 }; }
function botState() { return { timer: 0, tx: 0, ty: 0, aim: 0, strikeT: 0, yieldT: 0 }; }

function mulberry(a) {
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// clamp a mallet target into its own half
export function clampTarget(side, x, y) {
  x = Math.max(MR, Math.min(W - MR, x));
  if (side === 0) y = Math.max(H / 2, Math.min(H - MR, y));
  else y = Math.max(MR, Math.min(H / 2, y));
  return [x, y];
}

export function setTarget(g, side, x, y) {
  const [cx, cy] = clampTarget(side, x, y);
  g.m[side].tx = cx; g.m[side].ty = cy;
}

export function isBot(g, side) {
  if (g.mode === 'demo') return true;
  return g.mode === 'bot' && side === 1;
}

// ---------------------------------------------------------------- step
export function step(g, dt) {
  g.t += dt;
  if (g.phase === 'goal' || g.phase === 'over') {
    g.phaseT += dt;
    // mallets still move during the goal pause (feels alive)
    for (let s = 0; s < 2; s++) { if (isBot(g, s)) botThink(g, s, dt, true); }
    moveMallets(g, dt, 1);
    if (g.phase === 'goal' && g.phaseT > 1.15) {
      if (g.score[0] >= g.target || g.score[1] >= g.target) {
        g.phase = 'over'; g.phaseT = 0;
        g.winner = g.score[0] > g.score[1] ? 0 : 1;
        g.events.push({ type: 'over', winner: g.winner });
      } else serve(g, g.lastScorer === 0 ? 1 : 0);
    }
    return;
  }
  for (let s = 0; s < 2; s++) { if (isBot(g, s)) botThink(g, s, dt, false); }

  const p = g.puck;
  const fastest = Math.max(Math.hypot(p.vx, p.vy), HUMAN_SPEED * 0.6);
  const n = Math.max(4, Math.min(40, Math.ceil(fastest * dt / (PR * 0.35))));
  const h = dt / n;
  // desired mallet displacement this frame (speed-limited)
  const disp = g.m.map((m, s) => {
    let dx = m.tx - m.x, dy = m.ty - m.y;
    const lim = (isBot(g, s) ? DIFF[s === 1 ? g.diff : g.diff0].speed * (g.bot[s].strikeT > 0 ? 1.25 : 1) : HUMAN_SPEED) * dt;
    const d = Math.hypot(dx, dy);
    if (d > lim) { dx *= lim / d; dy *= lim / d; }
    m.vx = dx / dt; m.vy = dy / dt;
    m.cool -= dt;
    return [dx / n, dy / n];
  });
  const fr = Math.exp(-FRICTION * h);
  for (let i = 0; i < n; i++) {
    for (let s = 0; s < 2; s++) { g.m[s].x += disp[s][0]; g.m[s].y += disp[s][1]; }
    p.x += p.vx * h; p.y += p.vy * h;
    p.vx *= fr; p.vy *= fr;
    for (let s = 0; s < 2; s++) collideMallet(g, s);
    walls(g);
    for (let s = 0; s < 2; s++) if (unsqueeze(g, s)) { const m = g.m[s]; m.vx = m.vy = 0; p.vx *= 0.6; p.vy *= 0.6; disp[s][0] = disp[s][1] = 0; }
    if (g.phase !== 'play') break;
  }
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > g.stats.top) g.stats.top = sp;
  antiStall(g, dt);
}

// Safety net for bots: if the puck has sat in one small spot for 3 s (usually
// pinned in a corner by a bot), the bot backs off and the puck is popped out.
// A human holding the puck still is left alone - that is their call.
function antiStall(g, dt) {
  const p = g.puck;
  if (!g.anchor || Math.hypot(p.x - g.anchor.x, p.y - g.anchor.y) > 70) { g.anchor = { x: p.x, y: p.y, t: 0 }; return; }
  g.anchor.t += dt;
  if (g.anchor.t < 3) return;
  const owner = p.y > H / 2 ? 0 : 1;
  g.anchor = null;
  g.bot[owner].yieldT = 0.9;          // harmless for humans (bot state unused)
  if (!isBot(g, owner) && !g.assist) return; // g.assist: a test driver plays side 0
  const dx = W / 2 - p.x, dy = (owner === 0 ? H * 0.62 : H * 0.38) - p.y, d = Math.hypot(dx, dy) || 1;
  p.vx = dx / d * 420; p.vy = dy / d * 420;
  g.events.push({ type: 'nudge', x: p.x, y: p.y });
}

function moveMallets(g, dt) {
  for (let s = 0; s < 2; s++) {
    const m = g.m[s];
    let dx = m.tx - m.x, dy = m.ty - m.y;
    const lim = (isBot(g, s) ? DIFF[s === 1 ? g.diff : g.diff0].speed : HUMAN_SPEED) * dt;
    const d = Math.hypot(dx, dy);
    if (d > lim) { dx *= lim / d; dy *= lim / d; }
    m.x += dx; m.y += dy; m.vx = dx / dt; m.vy = dy / dt;
  }
}

function collideMallet(g, s) {
  const p = g.puck, m = g.m[s];
  let dx = p.x - m.x, dy = p.y - m.y;
  const d = Math.hypot(dx, dy), R = PR + MR;
  if (d >= R) return;
  let nx, ny;
  if (d < 1e-6) { nx = 0; ny = s === 0 ? -1 : 1; } else { nx = dx / d; ny = dy / d; }
  p.x = m.x + nx * R; p.y = m.y + ny * R;
  const rel = (p.vx - m.vx) * nx + (p.vy - m.vy) * ny;
  if (rel < 0) {
    p.vx -= (1 + HIT_E) * rel * nx; p.vy -= (1 + HIT_E) * rel * ny;
    capPuck(p);
    if (m.cool <= 0 && -rel > 40) {
      g.events.push({ type: 'hit', side: s, speed: -rel, x: p.x - nx * PR, y: p.y - ny * PR, nx, ny });
      g.stats.hits[s]++;
      if (g.lastHitter !== s) { g.stats.rally++; g.lastHitter = s; }
      m.cool = 0.07;
    }
  }
}

function capPuck(p) {
  const sp = Math.hypot(p.vx, p.vy);
  if (sp > MAXP) { p.vx *= MAXP / sp; p.vy *= MAXP / sp; }
}

// if a mallet pins the puck against a rail, the mallet gives way
function unsqueeze(g, s) {
  const p = g.puck, m = g.m[s];
  const dx = m.x - p.x, dy = m.y - p.y, d = Math.hypot(dx, dy), R = PR + MR;
  if (d >= R - 0.01) return false;
  const nx = d < 1e-6 ? 0 : dx / d, ny = d < 1e-6 ? (s === 0 ? 1 : -1) : dy / d;
  m.x = Math.max(MR, Math.min(W - MR, p.x + nx * R)); m.y = Math.max(MR, Math.min(H - MR, p.y + ny * R));
  return true;
}

function inMouth(x) { return Math.abs(x - W / 2) < GOAL / 2; }

function walls(g) {
  const p = g.puck;
  // inside a goal channel: rails become the channel sides, then score
  if (p.y < PR || p.y > H - PR) {
    if (inMouth(p.x)) {
      posts(g);
      const lo = W / 2 - GOAL / 2 + PR, hi = W / 2 + GOAL / 2 - PR;
      if ((p.y < 0 || p.y > H) && (p.x < lo || p.x > hi)) {
        p.x = Math.max(lo, Math.min(hi, p.x)); p.vx = -p.vx * 0.5;
      }
      if (p.y < -PR * 0.6) return goal(g, 0);
      if (p.y > H + PR * 0.6) return goal(g, 1);
    } else {
      if (p.y < PR) { p.y = PR; if (p.vy < 0) bounce(g, 'y'); }
      if (p.y > H - PR) { p.y = H - PR; if (p.vy > 0) bounce(g, 'y'); }
    }
  }
  if (p.x < PR) { p.x = PR; if (p.vx < 0) bounce(g, 'x'); }
  if (p.x > W - PR) { p.x = W - PR; if (p.vx > 0) bounce(g, 'x'); }
}

function bounce(g, axis) {
  const p = g.puck;
  const sp = Math.abs(axis === 'x' ? p.vx : p.vy);
  if (axis === 'x') p.vx = -p.vx * WALL_E; else p.vy = -p.vy * WALL_E;
  if (sp > 90) g.events.push({ type: 'wall', speed: sp, x: p.x + (axis === 'x' ? (p.x < W / 2 ? -PR : PR) : 0), y: p.y + (axis === 'y' ? (p.y < H / 2 ? -PR : PR) : 0) });
}

function posts(g) {
  const p = g.puck;
  for (const px of [W / 2 - GOAL / 2, W / 2 + GOAL / 2]) {
    for (const py of [0, H]) {
      const dx = p.x - px, dy = p.y - py, d = Math.hypot(dx, dy);
      if (d < PR && d > 1e-6) {
        const nx = dx / d, ny = dy / d;
        p.x = px + nx * PR; p.y = py + ny * PR;
        const rel = p.vx * nx + p.vy * ny;
        if (rel < 0) {
          p.vx -= (1 + WALL_E) * rel * nx; p.vy -= (1 + WALL_E) * rel * ny;
          if (-rel > 90) g.events.push({ type: 'post', speed: -rel, x: px, y: py });
        }
      }
    }
  }
}

function goal(g, scorer) {
  g.score[scorer]++;
  g.lastScorer = scorer;
  g.phase = 'goal'; g.phaseT = 0;
  g.stats.longest = Math.max(g.stats.longest, g.stats.rally); g.stats.rally = 0; g.lastHitter = -1;
  const p = g.puck;
  g.events.push({ type: 'goal', scorer, x: p.x, y: scorer === 0 ? 0 : H, speed: Math.hypot(p.vx, p.vy) });
  p.vx = 0; p.vy = 0; p.inGoal = 1;
}

// puck is served to the side that conceded, sitting still in their half
export function serve(g, side) {
  const p = g.puck;
  p.x = W / 2; p.y = side === 0 ? H / 2 + 150 : H / 2 - 150; p.vx = 0; p.vy = 0; p.inGoal = 0;
  g.phase = 'play'; g.phaseT = 0;
  for (let s = 0; s < 2; s++) {
    const m = g.m[s], d = Math.hypot(m.x - p.x, m.y - p.y);
    if (d < PR + MR + 4) { m.y = side === 0 ? Math.min(H - MR, p.y + PR + MR + 6) : Math.max(MR, p.y - PR - MR - 6); m.ty = m.y; }
    g.bot[s].timer = 0;
  }
  g.events.push({ type: 'serve', side });
}

export function resetMatch(g) {
  g.score = [0, 0]; g.winner = -1; g.lastScorer = -1;
  g.stats = { hits: [0, 0], top: 0, rallies: 0, longest: 0, rally: 0 };
  g.m[0].x = g.m[0].tx = W / 2; g.m[0].y = g.m[0].ty = H - 120;
  g.m[1].x = g.m[1].tx = W / 2; g.m[1].y = g.m[1].ty = 120;
  g.t = 0;
  serve(g, 0);
  g.events.length = 0;
}

// ---------------------------------------------------------------- bot
// The bot thinks in its own frame: own goal at y = 0, attacking toward y = H.
function toFrame(s, x, y) { return s === 1 ? [x, y] : [W - x, H - y]; }

export function botThink(g, s, dt, idle) {
  const P = DIFF[s === 1 ? g.diff : g.diff0];
  const b = g.bot[s], m = g.m[s];
  b.timer -= dt; b.strikeT -= dt; b.yieldT -= dt;
  if (b.yieldT > 0) { const P2 = DIFF[s === 1 ? g.diff : g.diff0]; if (s === 1) setTarget(g, s, W / 2, P2.defY * 0.6); else setTarget(g, s, W / 2, H - P2.defY * 0.6); return; }
  if (b.timer > 0) return;
  b.timer = P.react * (0.7 + g.rng() * 0.6);

  const [mx, my] = toFrame(s, m.x, m.y);
  let [px, py] = toFrame(s, g.puck.x, g.puck.y);
  let vx = s === 1 ? g.puck.vx : -g.puck.vx, vy = s === 1 ? g.puck.vy : -g.puck.vy;
  let tx, ty;
  const home = () => { tx = W / 2; ty = P.defY; };

  if (idle || g.phase !== 'play') {
    home();
  } else if (py < H / 2 + PR * 0.5 && !(vy > 650 && py > H * 0.3)) {
    // ---- attack: puck on our side (or on the line) and not already flying away
    if (b.strikeT <= 0 && g.t - (b.aimT ?? -9) > 1.0) {
      b.aimT = g.t;
      // choose a shot: straight at goal, or a bank off a rail
      const r = g.rng();
      if (r < 0.55) b.aim = W / 2 + (g.rng() - 0.5) * 2 * P.err;
      else b.aim = (r < 0.775 ? -W / 2 : W * 1.5) + (g.rng() - 0.5) * 2 * P.err; // mirrored goal = one-rail bank
    }
    let ax = b.aim - px, ay = (H + 40) - py;
    if (py < PR + MR * 0.9) { ax = (W / 2 - px) || 1; ay = Math.abs(ax) * 0.35 + 40; } // puck on our back rail: dig it out sideways
    let al = Math.hypot(ax, ay); ax /= al; ay /= al;
    const R = PR + MR;
    const bx = px - ax * (R + 8), by = py - ay * (R + 8);
    const along = (mx - px) * ax + (my - py) * ay; // <0 means mallet is behind the puck
    const side = (mx - px) * -ay + (my - py) * ax;
    if (along < -R * 0.55 && Math.hypot(mx - bx, my - by) < 34 + (1 - P.aggro) * 20) {
      // lined up: strike through the puck
      b.strikeT = 0.28;
      if (py < R * 1.3 && (px < R * 1.3 || px > W - R * 1.3)) { b.strikeT = 0.12; b.yieldT = 0.45; }
      tx = px + ax * 160; ty = py + ay * 160;
    } else if (b.strikeT > 0) {
      tx = px + ax * 160; ty = py + ay * 160;
    } else if (along > -R * 0.3) {
      // in front of the puck: go round it, never push it into our own goal
      const sgn = side >= 0 ? 1 : -1;
      tx = px - ay * sgn * (R + 16) - ax * R * 0.6;
      ty = py + ax * sgn * (R + 16) - ay * R * 0.6;
      if (Math.abs(px - W / 2) < GOAL && py < R * 1.6) { tx = px + (px < W / 2 ? 1 : -1) * (R + 6); ty = py; }
    } else {
      tx = bx; ty = by;
    }
    // slow, easy bots hang back when the puck is moving fast toward goal
    if (vy < -900 && P.aggro < 0.7) { tx = px + vx * 0.08; ty = Math.min(P.defY, py - R); }
  } else {
    // ---- defend: sit between the puck and our goal
    let ix = px;
    if (vy < -60) {
      // predict where it crosses our defence line
      const tHit = (py - P.defY) / -vy;
      ix = px + vx * tHit;
      if (P.predict) { // fold reflections off the rails
        const lo = PR, hi = W - PR, span = hi - lo;
        let u = (ix - lo) % (2 * span); if (u < 0) u += 2 * span;
        ix = lo + (u > span ? 2 * span - u : u);
      } else ix = Math.max(PR, Math.min(W - PR, ix));
      ix += (g.rng() - 0.5) * P.err * 0.6;
    }
    tx = W / 2 + (ix - W / 2) * 0.62;
    tx = Math.max(W / 2 - GOAL * 0.7, Math.min(W / 2 + GOAL * 0.7, tx));
    ty = P.defY;
  }
  if (s === 1) setTarget(g, s, tx, ty);
  else setTarget(g, s, W - tx, H - ty);
}
