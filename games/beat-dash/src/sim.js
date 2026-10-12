// BEAT DASH simulation. Pure, deterministic, no DOM: the game, the solver and
// the headless tests all run this same code at a fixed 240 Hz tick.
//
// World units: 1 unit = 1 grid block. y is up. The floor is y = 0.
// grav = 1 means gravity pulls down, grav = -1 means the cube runs on ceilings.

export const DT = 1 / 240;
export const PH = {
  G: 100,      // gravity (units/s^2)
  J: 21,       // jump velocity -> 2.2 blocks high, 0.42 s in the air
  PAD: 30,     // jump pad launch -> 4.5 blocks high
  ORB: 20.5,   // jump orb (mid-air jump)
  FLIP: 6,     // push toward the new floor after a flip orb
  VMAX: 32,    // terminal speed
  SNAP: 0.22,  // landing forgiveness: you land if your feet were this close above the top
};

// ---- level compile --------------------------------------------------------
// A level's `parts` is a list of numbers (empty columns) and ascii chunks.
// Chunk rows are separated by '/', top row first, bottom row is y = 0.
//   #  block            ^  spike (floor side)   v  spike hanging from above
//   i  small spike      !  small hanging spike
//   P  jump pad (floor) p  jump pad on a ceiling
//   o  jump orb         f  flip orb (flips gravity)
//   U  portal: gravity up (run on ceilings)   D  portal: gravity back down
//   .  empty
export const KEY = (cx, cy) => cx * 128 + cy;

export function compile(def) {
  const solid = new Set();
  const things = new Map(); // key -> object
  const list = [];          // every non-block object, sorted by x, for drawing
  let x = 0, maxY = 0;
  const add = (ch, cx, cy) => {
    if (ch === '.' || ch === ' ') return;
    if (ch === '#') { solid.add(KEY(cx, cy)); if (cy > maxY) maxY = cy; return; }
    const map = { '^': ['spike', 1], 'v': ['spike', -1], 'i': ['small', 1], '!': ['small', -1],
      'P': ['pad', 1], 'p': ['pad', -1], 'o': ['orb', 0], 'f': ['flip', 0], 'U': ['portal', -1], 'D': ['portal', 1] };
    const m = map[ch];
    if (!m) throw new Error('bad char ' + ch + ' in level ' + def.name + ' at x ' + cx);
    const o = { t: m[0], d: m[1], x: cx, y: cy, id: list.length };
    list.push(o); things.set(KEY(cx, cy), o);
    if (cy > maxY) maxY = cy;
  };
  for (const part of def.parts) {
    if (typeof part === 'number') { x += part; continue; }
    // every piece starts on a beat (4 blocks), so the hazards hit with the kick
    x = Math.ceil(x / 4) * 4;
    const rows = part.split('/');
    const w = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, ri) => {
      const cy = rows.length - 1 - ri;
      for (let i = 0; i < row.length; i++) add(row[i], x + i, cy);
    });
    x += w;
  }
  const length = x + 6;
  const speed = def.bpm / 15; // exactly 4 blocks per beat
  const draw = list.slice().sort((a, b) => a.x - b.x);
  return { def, name: def.name, solid, things, list, draw, length, speed, bpm: def.bpm, maxY,
    // a sorted array of solid cells for fast drawing
    blocks: [...solid].map((k) => ({ x: Math.floor(k / 128), y: k % 128 })).sort((a, b) => a.x - b.x || a.y - b.y) };
}

// ---- run state ------------------------------------------------------------
export function newRun(L, from) {
  if (from) return clone(from);
  return { x: 0, y: 0, vy: 0, grav: 1, grounded: true, dead: false, done: false,
    held: false, buf: false, used: [], tick: 0, jumps: 0, rot: 0 };
}
export function clone(s) {
  return { x: s.x, y: s.y, vy: s.vy, grav: s.grav, grounded: s.grounded, dead: s.dead, done: s.done,
    held: s.held, buf: s.buf, used: s.used.slice(), tick: s.tick, jumps: s.jumps, rot: s.rot };
}

const overlap = (ax0, ay0, ax1, ay1, bx0, by0, bx1, by1) => ax0 < bx1 && ax1 > bx0 && ay0 < by1 && ay1 > by0;
const E = 1e-6;

// One 240 Hz tick. `ev` (optional) receives juice events: [name, x, y, extra].
export function step(L, s, held, ev) {
  if (s.dead || s.done) return s;
  // input edge -> click buffer (used by orbs). Releasing clears it.
  if (held && !s.held) s.buf = true;
  if (!held) s.buf = false;
  s.held = held;

  // ground jump (holding keeps jumping every time you land)
  if (s.grounded && held) {
    s.vy = PH.J * s.grav; s.grounded = false; s.buf = false; s.jumps++;
    if (ev) ev.push(['jump', s.x, s.y]);
  }

  const wasGrounded = s.grounded;
  const prevY = s.y;
  s.vy -= PH.G * s.grav * DT;
  if (s.vy > PH.VMAX) s.vy = PH.VMAX;
  if (s.vy < -PH.VMAX) s.vy = -PH.VMAX;
  s.y += s.vy * DT;
  s.x += L.speed * DT;
  s.tick++;
  s.grounded = false;

  // floor
  if (s.y < 0) {
    s.y = 0;
    if (s.grav === 1) { if (s.vy < 0) s.vy = 0; s.grounded = true; }
    else if (s.vy < 0) s.vy = 0;
  }

  // solid blocks (grid cells around the cube)
  const cx0 = Math.floor(s.x) - 1, cx1 = Math.floor(s.x + 1);
  const cy0 = Math.max(0, Math.floor(s.y) - 1), cy1 = Math.floor(s.y + 1) + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        if (!L.solid.has(KEY(cx, cy))) continue;
        if (!overlap(s.x, s.y, s.x + 1, s.y + 1, cx + E, cy + E, cx + 1 - E, cy + 1 - E)) continue;
        if (s.grav === 1) {
          const top = cy + 1;
          if (s.vy <= 0 && prevY >= top - PH.SNAP && !L.solid.has(KEY(cx, cy + 1))) {
            s.y = top; s.vy = 0; s.grounded = true; continue;
          }
          if (s.vy > 0 && prevY + 1 <= cy + 0.25 && !L.solid.has(KEY(cx, cy - 1))) { s.y = cy - 1; s.vy = 0; continue; }
        } else {
          const bot = cy;
          if (s.vy >= 0 && prevY + 1 <= bot + PH.SNAP && !L.solid.has(KEY(cx, cy - 1))) {
            s.y = bot - 1; s.vy = 0; s.grounded = true; continue;
          }
          if (s.vy < 0 && prevY >= cy + 0.75 && !L.solid.has(KEY(cx, cy + 1))) { s.y = cy + 1; s.vy = 0; continue; }
        }
        // inner hitbox: running into a wall is death
        if (pass === 1 && overlap(s.x + 0.3, s.y + 0.3, s.x + 0.7, s.y + 0.7, cx, cy, cx + 1, cy + 1)) {
          s.dead = true; if (ev) ev.push(['die', s.x, s.y]); return s;
        }
      }
    }
  }
  if (s.grounded && !wasGrounded && ev) ev.push(['land', s.x, s.y, s.grav]);

  // objects
  for (let cx = cx0; cx <= cx1 + 1; cx++) {
    for (let cy = Math.max(0, cy0 - 1); cy <= cy1 + 1; cy++) {
      const o = L.things.get(KEY(cx, cy));
      if (!o) continue;
      const t = o.t;
      if (t === 'spike' || t === 'small') {
        const h = t === 'spike' ? 0.42 : 0.2;
        const y0 = o.d === 1 ? cy : cy + 1 - h;
        if (overlap(s.x + 0.04, s.y + 0.04, s.x + 0.96, s.y + 0.96, cx + 0.38, y0, cx + 0.62, y0 + h)) {
          s.dead = true; if (ev) ev.push(['die', s.x, s.y]); return s;
        }
      } else if (s.used.includes(o.id)) {
        continue;
      } else if (t === 'pad') {
        const y0 = o.d === 1 ? cy : cy + 0.75;
        if (overlap(s.x, s.y, s.x + 1, s.y + 1, cx + 0.1, y0, cx + 0.9, y0 + 0.25)) {
          s.vy = PH.PAD * s.grav; s.grounded = false; s.used.push(o.id);
          if (ev) ev.push(['pad', cx + 0.5, cy + (o.d === 1 ? 0.1 : 0.9)]);
        }
      } else if (t === 'orb' || t === 'flip') {
        if (s.buf && Math.abs(s.x + 0.5 - (cx + 0.5)) < 0.95 && Math.abs(s.y + 0.5 - (cy + 0.5)) < 0.95) {
          s.buf = false; s.used.push(o.id); s.grounded = false;
          if (t === 'orb') s.vy = PH.ORB * s.grav;
          else { s.grav = -s.grav; s.vy = -s.grav * PH.FLIP; }
          if (ev) ev.push([t, cx + 0.5, cy + 0.5]);
        }
      } else if (t === 'portal') {
        if (s.grav !== o.d && overlap(s.x, s.y, s.x + 1, s.y + 1, cx + 0.2, cy - 1, cx + 0.8, cy + 2)) {
          s.grav = o.d; s.vy *= 0.5; s.grounded = false; s.used.push(o.id);
          if (ev) ev.push(['portal', cx + 0.5, cy + 0.5, o.d]);
        }
      }
    }
  }
  if (s.used.length > 8) s.used = s.used.filter((id) => L.list[id].x > s.x - 3);

  if (s.y > L.maxY + 8) { s.dead = true; if (ev) ev.push(['die', s.x, s.y]); return s; }
  if (s.x >= L.length) { s.done = true; if (ev) ev.push(['done', s.x, s.y]); }

  // cube spin: turns while airborne, settles to a flat face on the ground
  if (s.grounded) {
    const q = Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2);
    s.rot += (q - s.rot) * 0.35;
  } else {
    s.rot += 6.9 * DT * s.grav;
  }
  return s;
}

export function progress(L, s) { return Math.max(0, Math.min(1, s.x / L.length)); }
