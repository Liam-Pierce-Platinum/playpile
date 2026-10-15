// Pure game logic: no DOM, no canvas. Node can run it (tools/botsim.mjs) and so can the page.
import { GROUND, COLORS, expand } from './levels.js';

export const K = {
  G: 100,          // gravity px/s^2
  THRUST: 285,     // flame push px/s^2 along facing
  KICK: 34,        // instant push on each fresh SPACE press
  ROT: 4.9,        // turn rate rad/s
  VMAX: 250, DRAG: 0.2,
  CHAIN_R: 34,     // a bursting firework lights anything this close
  RING_R: 11, TOUCH_R: 8,
  TOP: -40,
  LAND_V: 95,      // come down slower than this (px/s), roughly upright = safe touchdown
};

const fwd = (a) => [Math.sin(a), -Math.cos(a)];

export function makeWorld(L, opts = {}) {
  const lv = L ? expand(L) : null;
  const s = {
    lv, endless: !L, t: 0, score: 0, pops: 0, ringsGot: 0, events: [], done: false, dead: false, why: '',
    fuelMax: L ? L.fuel : 9, fuel: L ? L.fuel : 9, launched: false, groupN: 0, groups: {}, shapeDone: {}, hitstop: 0,
    r: { x: L ? L.start[0] : 40, y: (L ? L.start[1] : GROUND) - 8, vx: 0, vy: 0, a: 0, thr: false },
    buildings: [], rings: [], shells: [], wires: [], birds: [], via: [],
    w: L ? L.w : 1e9, left: 0, gen: 0, seed: opts.seed || 12345, dist: 0, outOfFuel: false,
  };
  if (lv) {
    s.buildings = lv.buildings.map(([x, w, h]) => ({ x, w, h, y: GROUND - h }));
    s.rings = lv.rings.map(([x, y]) => ({ x, y, got: false, t: 0 }));
    s.shells = lv.shells.map((o, i) => ({ ...o, st: 0, t: 0, id: i, g: 0 }));
    s.wires = lv.wires.map(mkWire);
    s.birds = lv.birds.map(([x, y, range, sp], i) => ({ x0: x, y0: y, x, y, range, sp, ph: i * 1.7, dir: 1 }));
    s.via = lv.via.map(([x, y]) => ({ x, y }));
    s.popsNeed = lv.pops; s.shellsTotal = s.shells.length;
  } else {
    s.buildings.push({ x: 0, w: 70, h: 20, y: GROUND - 20 }); s.r.y = GROUND - 28; s.r.x = 35;
    s.gen = 90; genEndless(s, 700);
  }
  return s;
}

function mkWire([x1, y1, x2, y2, sag]) {
  const pts = [];
  for (let i = 0; i <= 14; i++) { const u = i / 14; pts.push([x1 + (x2 - x1) * u, y1 + (y2 - y1) * u + sag * 4 * u * (1 - u)]); }
  return { pts, x1: Math.min(x1, x2), x2: Math.max(x1, x2) };
}

function rnd(s) { s.seed = (s.seed * 16807) % 2147483647; return s.seed / 2147483647; }

// Endless: build the city in chunks ahead of the rocket. Gets busier with distance.
function genEndless(s, until) {
  while (s.gen < until) {
    const d = Math.min(1, s.gen / 6000), x = s.gen;
    const w = 26 + Math.floor(rnd(s) * 30), h = 20 + Math.floor(rnd(s) * (50 + 70 * d));
    const b = { x: x + 40, w, h, y: GROUND - h };
    const prev = s.buildings[s.buildings.length - 1];
    s.buildings.push(b);
    if (prev && rnd(s) < 0.15 + 0.35 * d && b.x - (prev.x + prev.w) < 140) s.wires.push(mkWire([prev.x + prev.w - 3, prev.y - 8, b.x + 3, b.y - 8, 10 + rnd(s) * 8]));
    const gapX = x + 40 + w + 30;
    const rr = rnd(s);
    if (rr < 0.55) s.rings.push({ x: gapX + rnd(s) * 30, y: 40 + rnd(s) * 95, got: false, t: 0 });
    else {
      const n = 2 + Math.floor(rnd(s) * 5), cx = gapX + 20, cy = 30 + rnd(s) * 60, c0 = Math.floor(rnd(s) * 6);
      for (let i = 0; i < n; i++) s.shells.push({ x: cx + (i % 3) * 13 + (rnd(s) - 0.5) * 4, y: cy + Math.floor(i / 3) * 11, c: COLORS[(c0 + i) % 6], shape: -1, st: 0, t: 0, id: s.shells.length, g: 0 });
    }
    if (rnd(s) < 0.1 + 0.4 * d) s.birds.push({ x0: gapX + 30, y0: 40 + rnd(s) * 90, x: gapX, y: 80, range: 20 + rnd(s) * 25, sp: 1.2 + rnd(s) * 1.4 * (1 + d), ph: rnd(s) * 6, dir: 1 });
    s.gen += 40 + w + 70 + Math.floor(rnd(s) * 50) - Math.floor(30 * d);
  }
}

function surfaceTop(s, x) {
  let top = GROUND;
  for (const b of s.buildings) if (x >= b.x && x < b.x + b.w && b.y < top) top = b.y;
  return top;
}
function inBuilding(s, x, y) {
  if (y >= GROUND) return true;
  for (const b of s.buildings) if (x >= b.x && x < b.x + b.w && y >= b.y) return true;
  return false;
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let u = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - ax - dx * u, py - ay - dy * u);
}

function emit(s, e) { s.events.push(e); }

function crash(s, why) {
  if (s.dead || s.done) return;
  s.dead = true; s.why = why; s.r.thr = false;
  emit(s, { k: 'crash', x: s.r.x, y: s.r.y, why });
}

function ignite(s, sh, group, delay) {
  if (sh.st !== 0) return;
  sh.st = 1; sh.t = delay; sh.g = group;
  emit(s, { k: 'lit', x: sh.x, y: sh.y });
}

// input: { left, right, thrust, kick } (kick = SPACE was freshly pressed this step)
export function step(s, inp, dt) {
  s.events.length = 0;
  if (s.hitstop > 0) { s.hitstop -= dt; dt *= 0.15; }
  const r = s.r;
  s.t += dt;
  // birds and shells move even before launch so the scene is alive
  for (const b of s.birds) {
    const nx = b.x0 + Math.sin(s.t * b.sp + b.ph) * b.range;
    b.dir = nx >= b.x ? 1 : -1; b.x = nx; b.y = b.y0 + Math.sin(s.t * b.sp * 2.3 + b.ph) * 4;
  }
  for (const r2 of s.rings) if (r2.got) r2.t += dt;
  updateShells(s, dt);
  if (s.dead) return;
  if (s.done) { const k = Math.max(0, 1 - 3 * dt); r.vx *= k; r.vy *= k; r.x += r.vx * dt; r.y += r.vy * dt; r.thr = false; return; }

  if (inp.left) r.a -= K.ROT * dt;
  if (inp.right) r.a += K.ROT * dt;
  const [fx, fy] = fwd(r.a);
  r.thr = false;
  if (!s.done && s.fuel > 0 && (inp.thrust || inp.kick)) {
    if (!s.launched) { s.launched = true; emit(s, { k: 'launch' }); }
    if (inp.kick) { r.vx += fx * K.KICK; r.vy += fy * K.KICK; s.fuel -= 0.12; emit(s, { k: 'kick', x: r.x, y: r.y }); }
    if (inp.thrust) { r.thr = true; r.vx += fx * K.THRUST * dt; r.vy += fy * K.THRUST * dt; s.fuel -= dt; }
    if (s.fuel <= 0) { s.fuel = 0; if (!s.outOfFuel) { s.outOfFuel = true; emit(s, { k: 'nofuel' }); } }
  }
  if (!s.launched) return;
  r.vy += K.G * dt;
  const drag = 1 - K.DRAG * dt; r.vx *= drag; r.vy *= drag;
  const sp = Math.hypot(r.vx, r.vy);
  if (sp > K.VMAX) { r.vx *= K.VMAX / sp; r.vy *= K.VMAX / sp; }
  const tail0 = r.y + Math.cos(r.a) * 5;
  r.x += r.vx * dt; r.y += r.vy * dt;
  // soft touchdown: come down slow and roughly upright on the street or a roof and you rest there
  // (lander-style forgiveness). Hard or sideways hits still crash.
  const top = surfaceTop(s, r.x), tail1 = r.y + Math.cos(r.a) * 5;
  if (tail1 >= top - 0.3 && tail0 <= top + 1.5 && Math.cos(r.a) > 0.72 && r.vy < K.LAND_V && Math.abs(r.vx) < K.LAND_V) {
    r.y = top - Math.cos(r.a) * 5 - 0.6; if (r.vy > 25 && !r.landed) emit(s, { k: 'land', x: r.x, y: top });
    r.vy = 0; r.vx *= Math.max(0, 1 - 7 * dt); r.landed = true;
  } else r.landed = false;
  if (r.landed && s.fuel <= 0 && Math.abs(r.vx) < 8) { crash(s, 'OUT OF FUEL'); return; }
  if (r.x < s.left + 6) { r.x = s.left + 6; r.vx = Math.abs(r.vx) * 0.3; }
  if (r.x > s.w - 6) { r.x = s.w - 6; r.vx = -Math.abs(r.vx) * 0.3; }
  if (r.y < K.TOP) { r.y = K.TOP; r.vy = Math.max(r.vy, 0); }

  // collision points: nose, middle, tail
  const pts = [[r.x + fx * 7, r.y + fy * 7], [r.x, r.y], [r.x - fx * 5, r.y - fy * 5]];
  for (const [px, py] of pts) if (inBuilding(s, px, py)) { crash(s, py >= GROUND - 0.5 ? 'HIT THE STREET' : 'HIT A BUILDING'); return; }
  for (const w of s.wires) {
    if (r.x < w.x1 - 10 || r.x > w.x2 + 10) continue;
    for (let i = 0; i < w.pts.length - 1; i++) for (const [px, py] of pts)
      if (segDist(px, py, w.pts[i][0], w.pts[i][1], w.pts[i + 1][0], w.pts[i + 1][1]) < 1.6) { crash(s, 'SNAGGED A WIRE'); return; }
  }
  for (const b of s.birds) if (Math.hypot(b.x - r.x, b.y - r.y) < 6.5 || Math.hypot(b.x - pts[0][0], b.y - pts[0][1]) < 5) { crash(s, 'BIRD STRIKE'); return; }

  for (const g of s.rings) if (!g.got && Math.hypot(g.x - r.x, g.y - r.y) < K.RING_R) {
    g.got = true; s.ringsGot++; s.score += 200; s.fuel = Math.min(s.fuelMax, s.fuel + (s.endless ? 2.2 : 0.4));
    emit(s, { k: 'ring', x: g.x, y: g.y, n: s.ringsGot });
  }
  // touch a firework, or blast it with the flame cone behind you
  for (const sh of s.shells) {
    if (sh.st !== 0) continue;
    const dx = sh.x - r.x, dy = sh.y - r.y, d = Math.hypot(dx, dy);
    let hit = d < K.TOUCH_R;
    if (!hit && r.thr && d < 30) { const along = -(dx * fx + dy * fy); hit = along > 4 && Math.abs(dx * fy - dy * fx) < 4 + along * 0.35; }
    if (hit) { s.groupN++; s.groups[s.groupN] = 0; ignite(s, sh, s.groupN, 0.04); }
  }
  if (s.endless) {
    s.dist = Math.max(s.dist, r.x);
    s.left = Math.max(s.left, s.dist - 420);
    genEndless(s, r.x + 700);
    if (s.buildings.length > 40) { s.buildings = s.buildings.filter((b) => b.x + b.w > s.left - 60); s.rings = s.rings.filter((g) => g.x > s.left - 60); s.shells = s.shells.filter((h) => h.x > s.left - 60 || h.st === 1); s.wires = s.wires.filter((w) => w.x2 > s.left - 60); s.birds = s.birds.filter((b) => b.x0 > s.left - 80); }
  } else if (!s.done && s.ringsGot === s.rings.length && s.pops >= s.popsNeed) {
    s.done = true; const bonus = Math.round(s.fuel * 100); s.score += bonus;
    emit(s, { k: 'clear', bonus });
  }
}

function updateShells(s, dt) {
  for (const sh of s.shells) {
    if (sh.st !== 1) continue;
    sh.t -= dt;
    if (sh.t > 0) continue;
    sh.st = 2; s.pops++;
    const n = ++s.groups[sh.g];
    const pts = 50 * n; s.score += pts;
    if (s.endless) s.fuel = Math.min(s.fuelMax, s.fuel + 0.35);
    if (n >= 3) s.hitstop = 0.05;
    emit(s, { k: 'pop', x: sh.x, y: sh.y, c: sh.c, n, pts });
    for (const o of s.shells) if (o.st === 0) { const d = Math.hypot(o.x - sh.x, o.y - sh.y); if (d < K.CHAIN_R) ignite(s, o, sh.g, 0.09 + d / 420); }
    if (sh.shape >= 0 && !s.shapeDone[sh.shape] && s.shells.every((o) => o.shape !== sh.shape || o.st === 2)) {
      s.shapeDone[sh.shape] = true; s.score += 1000;
      const mine = s.shells.filter((o) => o.shape === sh.shape);
      emit(s, { k: 'shape', x: mine.reduce((a, o) => a + o.x, 0) / mine.length, y: mine.reduce((a, o) => a + o.y, 0) / mine.length });
    }
  }
}

// Stars: 1 = cleared, 2 = every firework burst, 3 = also kept a quarter of the fuel.
export function starsFor(s) {
  if (!s.done) return 0;
  let n = 1; if (s.pops >= s.shellsTotal) { n++; if (s.fuel >= s.fuelMax * 0.25) n++; }
  return n;
}

// ---- autopilot (test bot + title-screen demo) ----
export function botTargets(s) {
  const t = [];
  for (const g of s.rings) t.push({ kind: 'ring', o: g, x: g.x, y: g.y });
  const seen = new Set();
  for (const sh of s.shells) {
    if (seen.has(sh)) continue;
    const comp = [sh], q = [sh]; seen.add(sh);
    while (q.length) { const a = q.pop(); for (const b of s.shells) if (!seen.has(b) && Math.hypot(a.x - b.x, a.y - b.y) < K.CHAIN_R - 2) { seen.add(b); comp.push(b); q.push(b); } }
    comp.sort((a, b) => a.x - b.x);
    t.push({ kind: 'shell', comp, o: comp[0], x: comp[0].x, y: comp[0].y });
  }
  for (const v of s.via) t.push({ kind: 'via', o: v, x: v.x, y: v.y });
  t.sort((a, b) => a.x - b.x || (a.order || 0) - (b.order || 0));
  return t;
}

export function botInput(s, bot) {
  const r = s.r;
  if (!bot.list || s.endless) bot.list = botTargets(s);
  const live = (t) => t.kind === 'ring' ? !t.o.got : t.kind === 'shell' ? t.comp.some((o) => o.st === 0) : !t.o.done;
  while (bot.list.length && !live(bot.list[0])) bot.list.shift();
  let T = bot.list[0];
  if (T && T.kind === 'via' && Math.hypot(T.x - r.x, T.y - r.y) < 12) { T.o.done = true; bot.list.shift(); T = bot.list[0]; }
  if (T && T.kind === 'shell') { const o = T.comp.find((q) => q.st === 0); T.x = o.x; T.y = o.y; }
  let tx, ty;
  if (T) { tx = T.x; ty = T.y; } else { tx = r.x + 60; ty = 70; }
  // route over buildings that stand between us and the target
  const dir = Math.sign(tx - r.x) || 1;
  let best = null, climb = null;
  for (const b of s.buildings) {
    const near = dir > 0 ? b.x : b.x + b.w, far = dir > 0 ? b.x + b.w : b.x;
    const between = dir > 0 ? (b.x + b.w > r.x - 4 && b.x < tx) : (b.x < r.x + 4 && b.x + b.w > tx);
    if (!between) continue;
    const u = Math.max(0, Math.min(1, (near - r.x) / ((tx - r.x) || 1))), ly = r.y + (ty - r.y) * u;
    if (ly < b.y - 12 && Math.min(ty, r.y) < b.y - 12 && Math.max(ty, r.y) < b.y + 4 && !(r.y > b.y - 12 && Math.abs(near - r.x) < 50)) continue;
    if (tx > b.x - 4 && tx < b.x + b.w + 4) continue; // target is right above/inside: let the rest handle it
    const dd = Math.abs(near - r.x);
    if (!best || dd < best.dd) best = { b, near, far, dd };
  }
  if (best) {
    const { b, near, far } = best;
    if (r.y < b.y - 10 || (dir > 0 ? r.x > b.x - 2 : r.x < b.x + b.w + 2)) { tx = far + dir * 14; ty = Math.min(ty, b.y - 16); }
    else if (Math.abs(near - r.x) < 60) { climb = [Math.max(-35, Math.min(35, (near - dir * 16 - r.x) * 2)), r.y > b.y - 4 ? -85 : -40]; tx = far; }
    else { tx = near - dir * 14; ty = b.y - 24; }
  }
  // never sink onto a wire we are flying above
  for (const w of s.wires) if (r.x > w.x1 - 8 && r.x < w.x2 + 8) { const u = Math.max(0, Math.min(1, (r.x - w.pts[0][0]) / (w.pts[14][0] - w.pts[0][0]))), wy = w.pts[Math.round(u * 14)][1]; if (r.y < wy) ty = Math.min(ty, wy - 20); }
  // dodge birds near where we'll be in a moment
  for (const bd of s.birds) {
    const px = r.x + r.vx * 0.3, py = r.y + r.vy * 0.3;
    if (Math.hypot(bd.x - px, bd.y - py) < 26) { ty = bd.y + (r.y < bd.y ? -30 : 30); tx = r.x + (tx - r.x) * 0.3; }
  }
  const dx = tx - r.x, dy = ty - r.y, d = Math.hypot(dx, dy) || 1;
  const cap = bot.cap || 110, sp = Math.min(cap, 25 + d * 1.6);
  let vdx = (dx / d) * sp, vdy = (dy / d) * sp;
  if (climb) [vdx, vdy] = climb;
  const ax = (vdx - r.vx) * 3, ay = (vdy - r.vy) * 3 - K.G;
  const want = Math.atan2(ax, -ay);
  let diff = want - r.a; diff = Math.atan2(Math.sin(diff), Math.cos(diff));
  const mag = Math.hypot(ax, ay);
  return { left: diff < -0.05, right: diff > 0.05, thrust: Math.abs(diff) < 0.45 && mag > 60, kick: false };
}
