// ONE TILE - the rules. Pure, deterministic, shared by the game and tools/solve.mjs.
// Everything happens in TICKS. Tick t -> t+1: the thief does plan step t, every guard,
// camera and laser advances one step of its loop, then we check if the thief is seen.

export const DIRS = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };
export const DIR8 = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], UL: [-1, -1], UR: [1, -1], DL: [-1, 1], DR: [1, 1] };
export const ACTS = ['U', 'D', 'L', 'R', 'W'];
export const CONE_SPREAD = 0.35;  // cone half-width = 0.5 + 0.35*distance: widths 1,3,3,3 for a range-4 guard
export const KEY_COLORS = ['r', 'b', 'y'];

// Map legend (see README):
//  # wall   o pillar/statue/slot machine (solid, blocks sight)   T table/case/sofa (solid, see-through)
//  . floor  , rug (just looks)   S start   X exit   $ safe (solid, blocks sight)
//  g gem / c cash bag (optional loot)   r b y keycards   R B Y doors (need the card; always block sight)
//  h plant / k locker (hide: cones can't see you there; guards never walk on it)
//  G guard start (floor)   @ wall-mounted camera (a wall)
const SOLID = new Set(['#', 'o', 'T', '$', '@']);
const OPAQUE = new Set(['#', 'o', '$', '@', 'R', 'B', 'Y']);

function gcd(a, b) { return b ? gcd(b, a % b) : a; }
function lcm(a, b) { return a / gcd(a, b) * b; }

export function parseLevel(def) {
  const rows = def.map;
  const H = rows.length, W = Math.max(...rows.map(r => r.length));
  rows.forEach((r, i) => { if (r.length !== W) throw new Error(def.name + ': row ' + i + ' is ' + r.length + ' wide, not ' + W); });
  const tiles = [];
  const w = { def, W, H, tiles, loot: [], keys: [], guards: [], cams: [], lasers: [], crack: def.crack ?? 3 };
  const gStarts = [], cStarts = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let ch = rows[y][x] ?? '#';
    if (ch === 'S') { w.start = { x, y }; ch = '.'; }
    else if (ch === 'X') { w.exit = { x, y }; }
    else if (ch === '$') { w.safe = { x, y }; }
    else if (ch === 'g' || ch === 'c') { w.loot.push({ x, y, kind: ch }); ch = '.'; }
    else if (ch === 'r' || ch === 'b' || ch === 'y') { w.keys.push({ x, y, color: ch }); ch = '.'; }
    else if (ch === 'G') { gStarts.push({ x, y }); ch = '.'; }
    else if (ch === '@') { cStarts.push({ x, y }); }
    tiles.push(ch);
  }
  if (!w.start || !w.exit || !w.safe) throw new Error(def.name + ': needs S, X and $');
  // compact key colour bits: only the colours this level uses
  w.keyColors = KEY_COLORS.filter(c => w.keys.some(k => k.color === c));
  w.keyBit = c => 1 << w.keyColors.indexOf(c);

  (def.guards || []).forEach((g, i) => {
    const s = gStarts[i]; if (!s) throw new Error(def.name + ': guard ' + i + ' has no G on the map');
    w.guards.push(buildGuard(w, s, g, i));
  });
  if (gStarts.length !== (def.guards || []).length) throw new Error(def.name + ': G count != guards');
  (def.cams || []).forEach((c, i) => {
    const s = cStarts[i]; if (!s) throw new Error(def.name + ': camera ' + i + ' has no @');
    w.cams.push(buildCam(s, c));
  });
  if (cStarts.length !== (def.cams || []).length) throw new Error(def.name + ': @ count != cams');
  (def.lasers || []).forEach(l => w.lasers.push(buildLaser(w, l)));

  let P = 1;
  for (const g of w.guards) P = lcm(P, g.frames.length);
  for (const c of w.cams) P = lcm(P, c.frames.length);
  for (const l of w.lasers) P = lcm(P, l.period);
  w.P = P;
  precompute(w);
  if (danger(w, 0, w.start.x, w.start.y, w.start.x, w.start.y)) throw new Error(def.name + ': start tile is watched');
  return w;
}

export const tile = (w, x, y) => (x < 0 || y < 0 || x >= w.W || y >= w.H) ? '#' : w.tiles[y * w.W + x];
export const isOpaque = (w, x, y) => OPAQUE.has(tile(w, x, y));
export const isHide = (w, x, y) => { const t = tile(w, x, y); return t === 'h' || t === 'k'; };
export function thiefCanEnter(w, x, y, keys) {
  const t = tile(w, x, y);
  if (SOLID.has(t)) return false;
  if (t === 'R' || t === 'B' || t === 'Y') return !!(keys & keyBitFor(w, t.toLowerCase()));
  return true;
}
function keyBitFor(w, c) { const i = w.keyColors.indexOf(c); return i < 0 ? 0 : 1 << i; }
const guardCanEnter = (w, x, y) => { const t = tile(w, x, y); return t === '.' || t === ',' || t === 'X'; };

// Guard route: U D L R = step (and face that way), u d l r = turn to face that way (takes a tick),
// '.' = stand still. The route must end where it began, facing the same way.
function buildGuard(w, s, g, idx) {
  let x = s.x, y = s.y, f = g.face || 'R';
  const frames = [{ x, y, f }];
  const seq = []; for (const m of g.route.replace(/\s+/g, '').matchAll(/([UDLRudlr.])(\d*)/g)) for (let i = 0; i < (m[2] ? +m[2] : 1); i++) seq.push(m[1]);
  for (const ch of seq) {
    if ('UDLR'.includes(ch)) { const [dx, dy] = DIRS[ch]; x += dx; y += dy; f = ch; if (!guardCanEnter(w, x, y)) throw new Error(w.def.name + ': guard ' + idx + ' walks into ' + tile(w, x, y) + ' at ' + x + ',' + y); }
    else if ('udlr'.includes(ch)) f = ch.toUpperCase();
    else if (ch !== '.') throw new Error('bad route char ' + ch);
    frames.push({ x, y, f });
  }
  const last = frames.pop();
  if (last.x !== s.x || last.y !== s.y || last.f !== frames[0].f) throw new Error(w.def.name + ': guard ' + idx + ' route does not loop (ends ' + last.x + ',' + last.y + ' ' + last.f + ')');
  const k = (g.skip || 0) % frames.length;           // skip: start the loop k ticks in (the G marks tick 0 of the route)
  return { frames: frames.slice(k).concat(frames.slice(0, k)), r: g.r ?? 4, kind: 'guard' };
}

// Camera: seq like 'D3 DR2 R3' = face D for 3 ticks, DR for 2, ... then repeat.
function buildCam(s, c) {
  const frames = [];
  for (const part of c.seq.trim().split(/\s+/)) {
    const m = part.match(/^([UDLR]{1,2})(\d+)$/); if (!m) throw new Error('bad cam seq ' + part);
    for (let i = 0; i < +m[2]; i++) frames.push(m[1]);
  }
  const k = (c.skip || 0) % frames.length;
  return { x: s.x, y: s.y, frames: frames.slice(k).concat(frames.slice(0, k)), r: c.r ?? 5, kind: 'cam' };
}

// Laser: a straight run of tiles from (x1,y1) to (x2,y2). On when (t + phase) % period < on.
function buildLaser(w, l) {
  const tiles = [];
  const dx = Math.sign(l.x2 - l.x1), dy = Math.sign(l.y2 - l.y1);
  let x = l.x1, y = l.y1;
  for (;;) { tiles.push([x, y]); if (x === l.x2 && y === l.y2) break; x += dx; y += dy; }
  return { tiles, period: l.period, on: l.on, phase: l.phase || 0, horiz: dy === 0 };
}
export const laserOn = (l, t) => ((t + l.phase) % l.period + l.period) % l.period < l.on;

// Line of sight between tile centres. Walls, pillars, safes and doors block it.
// The two end tiles never block (a camera sits inside its wall tile).
export function los(w, x0, y0, x1, y1) {
  const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 8);
  for (let i = 1; i < n; i++) {
    const fx = x0 + 0.5 + (x1 - x0) * i / n + 1e-4, fy = y0 + 0.5 + (y1 - y0) * i / n + 2e-4;
    const tx = Math.floor(fx), ty = Math.floor(fy);
    if ((tx === x0 && ty === y0) || (tx === x1 && ty === y1)) continue;
    if (isOpaque(w, tx, ty)) return false;
  }
  return true;
}

// The cone: a tile is seen if, measured from the watcher's tile, it is 1..r tiles ahead
// ("along") and no more than 0.5 + 0.4*along tiles to the side, with clear line of sight.
// For a guard looking right with r=4 that is 1 tile at distance 1, then 3 wide at 2, 3 and 4.
export function coneTiles(w, sx, sy, f, r) {
  const [fx, fy] = DIR8[f]; const len = Math.hypot(fx, fy); const ux = fx / len, uy = fy / len;
  const out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    const along = dx * ux + dy * uy; if (along < 0.5 || along > r + 0.01) continue;
    const side = Math.abs(dx * uy - dy * ux); if (side > 0.5 + CONE_SPREAD * along) continue;
    const x = sx + dx, y = sy + dy; if (x < 0 || y < 0 || x >= w.W || y >= w.H) continue;
    if (isOpaque(w, x, y)) continue;
    if (!los(w, sx, sy, x, y)) continue;
    out.push(x, y);
  }
  return out;
}

export const guardAt = (g, t) => g.frames[((t % g.frames.length) + g.frames.length) % g.frames.length];
export const camAt = (c, t) => c.frames[((t % c.frames.length) + c.frames.length) % c.frames.length];

// Per tick-of-the-loop masks. bit 1 guard cone, 2 camera cone, 4 laser, 8 guard body.
function precompute(w) {
  w.mask = []; w.cones = [];
  for (let tm = 0; tm < w.P; tm++) {
    const m = new Uint8Array(w.W * w.H); const cones = [];
    w.guards.forEach((g, i) => { const fr = guardAt(g, tm); const c = coneTiles(w, fr.x, fr.y, fr.f, g.r); cones.push(c); for (let k = 0; k < c.length; k += 2) m[c[k + 1] * w.W + c[k]] |= 1; m[fr.y * w.W + fr.x] |= 8; });
    w.cams.forEach((cm, i) => { const c = coneTiles(w, cm.x, cm.y, camAt(cm, tm), cm.r); cones.push(c); for (let k = 0; k < c.length; k += 2) m[c[k + 1] * w.W + c[k]] |= 2; });
    for (const l of w.lasers) if (laserOn(l, tm)) for (const [x, y] of l.tiles) m[y * w.W + x] |= 4;
    w.mask.push(m); w.cones.push(cones);
  }
}

// Is the thief caught at the END of tick t, standing on (x,y), having been on (px,py) at t-1?
// Returns null or { type: 'guard'|'cam'|'laser'|'bump'|'swap', who }.
export function danger(w, t, x, y, px, py) {
  const tm = ((t % w.P) + w.P) % w.P, m = w.mask[tm][y * w.W + x];
  if (m === 0 && !w.guards.length) return null;
  const hiding = isHide(w, x, y);
  if (m & 8) return { type: 'bump', who: w.guards.findIndex(g => { const f = guardAt(g, t); return f.x === x && f.y === y; }) };
  for (let i = 0; i < w.guards.length; i++) {          // swapping tiles with a guard
    const a = guardAt(w.guards[i], t), b = guardAt(w.guards[i], t - 1);
    if (a.x === px && a.y === py && b.x === x && b.y === y) return { type: 'swap', who: i };
  }
  if (m & 4) return { type: 'laser', who: w.lasers.findIndex(l => laserOn(l, t) && l.tiles.some(([lx, ly]) => lx === x && ly === y)) };
  if (hiding) return null;
  if (m & 1) return { type: 'guard', who: w.guards.findIndex((g, i) => { const c = w.cones[tm][i]; for (let k = 0; k < c.length; k += 2) if (c[k] === x && c[k + 1] === y) return true; return false; }) };
  if (m & 2) return { type: 'cam', who: w.cams.findIndex((cm, i) => { const c = w.cones[tm][w.guards.length + i]; for (let k = 0; k < c.length; k += 2) if (c[k] === x && c[k + 1] === y) return true; return false; }) };
  return null;
}

export const adjSafe = (w, x, y) => Math.abs(x - w.safe.x) + Math.abs(y - w.safe.y) === 1;
export const allLootMask = w => (1 << w.loot.length) - 1;

export function initState(w) {
  return { x: w.start.x, y: w.start.y, t: 0, crack: 0, keys: 0, loot: 0, won: false, caught: null, face: 'D' };
}

// One tick. Returns { s: newState, ev: [...] }. Never mutates the input.
export function step(w, s, act) {
  const n = { ...s, t: s.t + 1 }; const ev = [];
  if (s.won || s.caught) return { s, ev };
  if (act !== 'W') {
    const [dx, dy] = DIRS[act]; const nx = s.x + dx, ny = s.y + dy; n.face = act;
    if (thiefCanEnter(w, nx, ny, s.keys)) {
      n.x = nx; n.y = ny; ev.push({ e: 'move' });
      const tt = tile(w, nx, ny); if (tt === 'R' || tt === 'B' || tt === 'Y') ev.push({ e: 'door' });
      w.keys.forEach(k => { if (k.x === nx && k.y === ny && !(n.keys & w.keyBit(k.color))) { n.keys |= w.keyBit(k.color); ev.push({ e: 'key', color: k.color }); } });
      w.loot.forEach((l, i) => { if (l.x === nx && l.y === ny && !(n.loot & (1 << i))) { n.loot |= 1 << i; ev.push({ e: 'loot', i }); } });
    } else ev.push({ e: 'bump' });
  } else {
    ev.push({ e: 'wait' });
    if (adjSafe(w, s.x, s.y) && s.crack < w.crack) { n.crack = s.crack + 1; ev.push({ e: n.crack === w.crack ? 'open' : 'crack' }); }
  }
  const d = danger(w, n.t, n.x, n.y, s.x, s.y);
  if (d) { n.caught = { ...d, t: n.t }; ev.push({ e: 'caught', d }); return { s: n, ev }; }
  if (n.x === w.exit.x && n.y === w.exit.y && n.crack >= w.crack) { n.won = true; ev.push({ e: 'win' }); }
  return { s: n, ev };
}

// Run a whole plan. Returns the list of states (index = tick) and the final result.
export function runPlan(w, plan) {
  let s = initState(w); const states = [s];
  for (const a of plan) { s = step(w, s, a).s; states.push(s); if (s.won || s.caught) break; }
  return { states, final: s, won: s.won, caught: s.caught };
}

export function starsFor(w, final, par) {
  return [!!final.won, !!final.won && final.t <= par, !!final.won && (final.loot === allLootMask(w))];
}

// For the planner: walk the whole plan WITHOUT stopping when seen, so the timeline can show
// where the thief would be on every tick. states[t].danger says if that tick would be fatal.
// Stops at a win (the plan is over once you are out).
export function tracePlan(w, plan) {
  let s = initState(w); const states = [{ ...s, danger: null, act: null }]; let firstFail = -1;
  for (let i = 0; i < plan.length; i++) {
    const free = { ...s, caught: null };
    const r = step(w, free, plan[i]); const n = r.s; const d = n.caught ? { type: n.caught.type, who: n.caught.who } : null;
    const clean = { ...n, caught: null, danger: d, act: plan[i], ev: r.ev };
    if (d) { clean.won = false; if (firstFail < 0) firstFail = n.t; }
    // if the thief is "caught" step() skipped the win check; redo it for the trace
    if (d && n.x === w.exit.x && n.y === w.exit.y && n.crack >= w.crack) clean.wouldWin = true;
    states.push(clean); s = { ...clean, won: false };
    if (clean.won) break;
  }
  return { states, firstFail, wins: states[states.length - 1].won && firstFail < 0 };
}

// Shortest walk between two tiles for click-to-route (ignores guards; doors need the card).
export function route(w, from, to, keys) {
  if (from.x === to.x && from.y === to.y) return [];
  const prev = new Map(); const k = (x, y) => y * w.W + x; prev.set(k(from.x, from.y), null);
  let q = [from];
  while (q.length) {
    const nq = [];
    for (const p of q) for (const a of ['U', 'D', 'L', 'R']) {
      const [dx, dy] = DIRS[a]; const x = p.x + dx, y = p.y + dy; const kk = k(x, y);
      if (prev.has(kk) || !thiefCanEnter(w, x, y, keys)) continue;
      prev.set(kk, { p, a });
      if (x === to.x && y === to.y) { const out = []; let c = kk; while (prev.get(c)) { const e = prev.get(c); out.push(e.a); c = k(e.p.x, e.p.y); } return out.reverse(); }
      nq.push({ x, y });
    }
    q = nq;
  }
  return null;
}
