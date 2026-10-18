// Pure 2D swing physics + level generator + bot. No rendering. Deterministic.
export const GRAV = -30, RANGE = 13, KILL_Y = -9, R = 0.45, LEVELS = 30, DT = 1 / 120;

function rng(s) { return () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function genRaw(n, seed) {
  const r = rng(seed), L = { n, hooks: [], pads: [], walls: [], plats: [{ x0: -8, x1: 2, y: 0 }] };
  let x = 7;
  const count = Math.min(5 + Math.floor(n * 0.6), 18);
  for (let i = 0; i < count; i++) {
    if (n >= 3 && i > 0 && i < count - 1 && r() < 0.2) { L.pads.push({ x0: x - 2, x1: x + 4, y: -4 }); x += 9; continue; }
    const y = 6.5 + r() * 4;
    const h = { x, y, bx: x, by: y, mx: 0, my: 0, sp: 0, ph: r() * 6.28 };
    if (n >= 8 && r() < 0.3) { if (r() < 0.5) h.my = 1 + r() * 1.5; else h.mx = 1 + r() * 1.5; h.sp = 0.8 + r(); }
    L.hooks.push(h);
    const gap = 7.5 + r() * 2.5 + Math.min(n, 25) * 0.1;
    if (n >= 5 && i < count - 1 && r() < 0.25) {
      if (n >= 11 && r() < 0.45) L.walls.push({ x0: x + gap * 0.55, x1: x + gap * 0.55 + 0.9, y0: 14 + r() * 2, y1: 40 }); // ceiling blade
      else L.walls.push({ x0: x + gap * 0.5, x1: x + gap * 0.5 + 0.9, y0: -12, y1: -1 + r() * 2.5 }); // floor pillar
    }
    x += gap;
  }
  L.goalX = x + 1; L.plats.push({ x0: x - 1, x1: x + 12, y: 0 }); L.end = x + 12;
  return L;
}

export function newState(L) {
  for (const h of L.hooks) { h.x = h.bx; h.y = h.by; }
  return { L, t: 0, p: { x: 0, y: R, vx: 0, vy: 0, rot: 0, av: 0 }, hook: null, len: 0, ground: true, dead: false, won: false, ev: [], spin: 0, flips: 0, hooks: 0 };
}

export function pickHook(S) {
  const p = S.p; let best = null, bd = 1e9;
  for (const h of S.L.hooks) {
    if (h.x < p.x - 2.5) continue;
    const d = Math.hypot(h.x - p.x, h.y - p.y);
    const score = d - (h.x > p.x ? 1.5 : 0);
    if (d < RANGE && score < bd) { bd = score; best = h; }
  }
  return best;
}

export function step(S, dt, press) {
  if (S.dead || S.won) return;
  const p = S.p, L = S.L; S.t += dt;
  for (const h of L.hooks) if (h.sp) { h.x = h.bx + h.mx * Math.sin(S.t * h.sp + h.ph); h.y = h.by + h.my * Math.sin(S.t * h.sp * 1.3 + h.ph); }
  if (press && !S.hook) {
    const h = pickHook(S);
    if (h) { S.hook = h; S.len = Math.max(2.5, Math.hypot(h.x - p.x, h.y - p.y)); S.ground = false; S.hooks++; S.ev.push('hook');
      if (p.vy < 0 && p.vx > 0) { p.vx += 1.5; } }
  } else if (!press && S.hook) { S.hook = null; S.ev.push('release'); p.vx += 0.6; p.vy += 1.2; }
  if (!S.ground) p.vy += GRAV * dt;
  const px = p.x, py = p.y;
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (S.hook) {
    const h = S.hook, dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy);
    S.len = Math.max(2.5, S.len - 1.2 * dt); // slight reel-in pumps energy
    if (d > S.len) {
      const nx = dx / d, ny = dy / d; p.x = h.x + nx * S.len; p.y = h.y + ny * S.len;
      const vr = p.vx * nx + p.vy * ny; if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; }
    }
    S.ground = false;
  }
  const sp = Math.hypot(p.vx, p.vy); if (sp > 42) { p.vx *= 42 / sp; p.vy *= 42 / sp; }
  // platforms
  if (!S.hook) for (const pl of L.plats) {
    if (p.x > pl.x0 && p.x < pl.x1 && p.vy <= 0 && py - R >= pl.y - 0.05 && p.y - R < pl.y) {
      p.y = pl.y + R; if (!S.ground && p.vy < -6) S.ev.push('land'); p.vy = 0; S.ground = true;
    }
  }
  if (S.ground) {
    p.vx *= Math.pow(0.04, dt); let on = false;
    for (const pl of L.plats) if (p.x > pl.x0 && p.x < pl.x1 && Math.abs(p.y - R - pl.y) < 0.1) on = true;
    if (!on) S.ground = false;
  }
  for (const pd of L.pads) {
    if (p.x > pd.x0 && p.x < pd.x1 && p.vy < 0 && py - R >= pd.y - 0.05 && p.y - R < pd.y) {
      p.y = pd.y + R; p.vy = Math.max(-p.vy * 1.05, 24); p.vx = Math.max(p.vx, 7); S.ev.push('bounce'); pd.hit = S.t;
    }
  }
  for (const w of L.walls) {
    if (p.x + R > w.x0 && p.x - R < w.x1 && p.y + R > w.y0 && p.y - R < w.y1) {
      const ox = Math.min(p.x + R - w.x0, w.x1 - (p.x - R)), oy = Math.min(p.y + R - w.y0, w.y1 - (p.y - R));
      if (ox < oy) { if (px < (w.x0 + w.x1) / 2) { p.x = w.x0 - R; } else p.x = w.x1 + R; p.vx *= -0.35; }
      else { if (py > (w.y0 + w.y1) / 2) { p.y = w.y1 + R; p.vy = Math.abs(p.vy) * 0.4; } else { p.y = w.y0 - R; p.vy = -Math.abs(p.vy) * 0.4; } }
      S.ev.push('bonk'); if (S.hook) S.hook = null;
    }
  }
  // spin
  if (S.hook) { const a = Math.atan2(p.x - S.hook.x, S.hook.y - p.y); p.av = 0; const d = a - p.rot; p.rot += (Math.atan2(Math.sin(d), Math.cos(d))) * Math.min(1, dt * 14); }
  else if (S.ground) { p.rot *= Math.pow(0.001, dt); S.spin = 0; }
  else { p.av = -p.vx * 0.55; p.rot += p.av * dt; S.spin += p.av * dt; if (Math.abs(S.spin) > Math.PI * 2) { S.spin = 0; S.flips++; S.ev.push('flip'); } }
  if (p.y < KILL_Y) { S.dead = true; S.ev.push('dead'); }
  if (p.x > L.goalX && p.y > -1) { S.won = true; S.ev.push('win'); }
}

// Scripted player: hook when falling toward a hook, let go on the upswing.
export function bot(S) {
  const p = S.p;
  if (S.hook) { const h = S.hook, a = Math.atan2(p.x - h.x, h.y - p.y); return !(a > 0.6 && p.vx > 0 && p.vy > 0); }
  if (S.ground) return !!pickHook(S) && S.t > 0.3;
  let pad = null; for (const pd of S.L.pads) if (pd.x1 > p.x && pd.x0 < p.x + 9) pad = pd;
  const h = pickHook(S);
  if (pad && (!h || h.x > pad.x0)) return false;
  if (!h) return false;
  return p.vy < 3 && h.y > p.y - 1;
}

export function simulate(L, tmax = 70) {
  const S = newState(L); let held = false;
  for (let i = 0; i < tmax / DT && !S.dead && !S.won; i++) { held = bot(S); step(S, DT, held); S.ev.length = 0; }
  return S;
}

const cache = {};
export function genLevel(n) {
  if (cache[n]) return cache[n];
  let L = null;
  for (let tr = 0; tr < 60; tr++) {
    const c = genRaw(n, n * 7919 + tr * 131 + 7), S = simulate(c);
    if (S.won) { c.par = S.t; L = c; break; }
  }
  if (!L) { L = genRaw(Math.min(n, 2), 1); L.par = simulate(L).t; L.n = n; }
  return (cache[n] = L);
}
