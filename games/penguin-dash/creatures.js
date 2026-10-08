'use strict';
// creatures.js - the wider bestiary. Each kind brings its own sprite, spawn rule, brain and drawing.
//   open water: moon jelly, lion's mane jelly, sea lion, walrus, skua (a seabird), sleeper shark, narwhal
//   caverns:    anglerfish (a glowing lure in the dark), ice eel (strikes out of holes in the walls)
// game.js hands any enemy whose kind is in CREATURES to CREATURES[kind].update; render.js calls .draw.

// ---------------------------------------------------------------- shared helpers
function steerTo(e, tx, ty, want, turn, dt, accel = 1.8) {
  e.ang += clamp(angDiff(e.ang, Math.atan2(ty - e.y, tx - e.x)), -turn * dt, turn * dt);
  e.spd = lerp(e.spd || 0, want, Math.min(1, dt * accel));
  e.x += Math.cos(e.ang) * e.spd * dt; e.y += Math.sin(e.ang) * e.spd * dt;
}
function keepWet(e, hb, minY = 8) {
  if (e.y < minY) { e.y = minY; if (Math.sin(e.ang) < 0) e.ang = Math.atan2(Math.abs(Math.sin(e.ang)) * 0.3, Math.cos(e.ang)); }
  const by = bed(e.x) - hb - 3;
  if (e.y > by) { e.y = by; if (Math.sin(e.ang) > 0) e.ang = Math.atan2(-0.3, Math.cos(e.ang)); }
  if (e.x < 650) { e.x = 650; e.ang = 0; e.wp = null; }
  for (const b of bergs) { const n = pushOutBerg(e, hb + 2, b); if (n) { const tang = Math.atan2(n[0], -n[1]); e.ang += angDiff(e.ang, Math.cos(angDiff(tang, e.ang)) > 0 ? tang : tang + Math.PI) * 0.25; } }
}
const openWater = () => P.state === 'swim' && P.inv <= 0 && !P.cave;
function wander(e, S, dt, k = 1) {
  if (!e.wp || Math.hypot(e.wp[0] - e.x, e.wp[1] - e.y) < 20) {
    const wx = Math.max(700, e.home + (Math.random() - 0.5) * 500), lo = S.minY || 14, hi = Math.min(bed(wx) - S.hb - 14, S.maxY || 300);
    e.wp = [wx, lo + Math.random() * Math.max(6, hi - lo)];
  }
  steerTo(e, e.wp[0], e.wp[1], S.patrol * k, S.turn || 1.6, dt);
}
function biteCheck(e, S, reach = 0.42) {
  if (!openWater()) return;
  const mx = e.x + Math.cos(e.ang) * S.len * reach, my = e.y + Math.sin(e.ang) * S.len * reach;
  if (Math.hypot(P.x - mx, P.y - my) < R + S.hb * 0.7) killPenguin(e);
}
function stunPenguin(s) {
  if (P.stunImm > 0 || P.state !== 'swim') return;
  P.stun = s; P.stunImm = s + 0.9;
  addText(P.x, P.y - 14, 'STUNG!', '#d9c2ff', 1.2);
  SFX.tone(1500, 300, 0.25, 'sawtooth', 0.04);
  for (let i = 0; i < 10; i++) addPart(P.x, P.y, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 70, 0.5, '#e6dcff', 'spark');
}
function offscreenX(bias = 0.65) { return P.x + (Math.random() < bias ? 1 : -1) * (W / 2 + 60 + Math.random() * 220); }
function newCreature(kind, x, y, extra) {
  const e = { kind, x, y, ang: x > P.x ? Math.PI : 0, spd: 0, t: Math.random() * 10, home: x, st: 'patrol', stT: 0, cd: 0, chompT: 0, cool: 0, lungeT: 0, ...extra };
  enemies.push(e); return e;
}

// ---------------------------------------------------------------- sprite builders
// a long-bodied swimmer built like the seal/shark sprites: profile + colour function + fins
function makeBody(o, wag, open) {
  const L = o.len, M = 3, b = new Pix(L + M * 2, o.ht + M * 2), cy = o.cy + M, X = u => M + u * L;
  for (let x = 0; x < L; x++) {
    const u = x / (L - 1), h = bodyProfile(u, o.tail, o.blunt) * o.hb, c = cy + (u < 0.35 ? wag * (1 - u / 0.35) : 0);
    for (let y = 0; y < b.h; y++) { const v = (y + 0.5 - c) / h; if (Math.abs(v) < 1) b.set(x + M, y, o.color(u, v, x, y)); }
  }
  o.fins(b, X, cy, wag);
  if (open) {
    const m0 = o.mouth || 0.82;
    for (let x = Math.floor(X(m0)); x < X(1) + 1; x++) {
      const k = (x - X(m0)) / (X(1) - X(m0)), top = cy + 0.5 - k * 1.5, bot = cy + 1 + k * o.hb * 0.8;
      for (let y = Math.floor(top); y <= bot; y++) if (b.get(x, y)) b.set(x, y, (y === Math.floor(top) || y >= Math.floor(bot)) && x % 2 === 0 ? '#ffffff' : '#7a1426');
    }
  }
  b.volume(VOL_KEEP, 0.9); b.outline('auto');
  return b.canvas();
}
const bodyFrames = o => ({ shut: WAGS.map(w => makeBody(o, w, false)), open: WAGS.map(w => makeBody(o, w, true)) });

const NARWHAL = { len: 58, hb: 6.4, cy: 14, ht: 26, tail: 0.12, blunt: 0.5,
  color: (u, v, x, y) => v > 0.28 ? '#d6dade' : hash(x * 3, y * 5) > 0.74 && u > 0.12 ? '#4d565e' : u > 0.82 ? '#8d969e' : '#7a848d',
  fins: (b, X, cy, wag) => { b.tri(X(0.15), cy - 1, X(0), cy - 6 + wag, X(0), cy + 6 + wag, '#69737c'); b.tri(X(0.68), cy + 2, X(0.58), cy + 8, X(0.62), cy + 2, '#69737c'); b.set(X(0.88), cy - 1, '#0b0b14'); } };
const WALRUS = { len: 54, hb: 9, cy: 15, ht: 32, tail: 0.1, blunt: 0.32,
  color: (u, v, x) => v > 0.4 ? '#a9846b' : x % 6 === 0 && v < 0.35 && u > 0.2 ? '#73543e' : u > 0.85 ? '#97735c' : '#8a6650',
  fins: (b, X, cy, wag) => {
    b.tri(X(0.12), cy - 1, X(0), cy - 6 + wag, X(0.02), cy + wag, '#6e5040'); b.tri(X(0.12), cy + 1, X(0), cy + 6 + wag, X(0.03), cy + wag, '#6e5040');
    b.tri(X(0.7), cy + 4, X(0.6), cy + 12, X(0.64), cy + 4, '#6e5040');
    for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 3; dx++) b.set(X(0.94) + dx, cy + 1 + dy, (dx + dy) % 2 ? '#c9a98e' : '#e6d6c0');
    for (let y = cy + 4; y < cy + 12; y++) { b.set(X(0.93), y, '#f2ead8'); b.set(X(0.97), y, '#e2d8c2'); }
    b.set(X(0.86), cy - 4, '#0b0b14');
  } };
const SEALION = { len: 40, hb: 4.8, cy: 10, ht: 22, tail: 0.12, blunt: 0.5, mouth: 0.84,
  color: (u, v) => v > 0.3 ? '#8f7462' : u > 0.8 ? '#7a6252' : '#6b5446',
  fins: (b, X, cy, wag) => {
    b.tri(X(0.66), cy + 2, X(0.48), cy + 11, X(0.58), cy + 2, '#56443a');
    b.tri(X(0.12), cy - 1, X(0), cy - 5 + wag, X(0.03), cy + wag, '#56443a'); b.tri(X(0.12), cy + 1, X(0), cy + 5 + wag, X(0.03), cy + wag, '#56443a');
    b.set(X(0.85), cy - 5, '#56443a'); b.set(X(0.88), cy - 2, '#0b0b14'); b.set(X(0.89), cy - 2, '#0b0b14'); b.set(X(0.89), cy - 3, '#ffffff');
    b.set(X(0.98), cy, '#e0d2c4'); b.set(X(0.98), cy + 1, '#e0d2c4');
  } };
const SLEEPER = { len: 84, hb: 9, cy: 18, ht: 36, tail: 0.14, blunt: 0.62, mouth: 0.84,
  color: (u, v, x, y) => hash(x * 7, y * 3) > 0.95 ? '#7d848c' : v > 0.35 ? '#646a72' : hash(x >> 1, y >> 1) > 0.8 ? '#41464e' : '#50565f',
  fins: (b, X, cy, wag) => {
    const f = '#454a52';
    b.tri(X(0.42), cy - 7, X(0.46), cy - 11, X(0.52), cy - 7, f); b.tri(X(0.25), cy - 4, X(0.27), cy - 7, X(0.31), cy - 4, f);
    b.tri(X(0.14), cy - 1, X(0), cy - 12 + wag, X(0.06), cy + wag * 0.5, f); b.tri(X(0.14), cy + 1, X(0.02), cy + 8 + wag, X(0.07), cy + wag * 0.5, f);
    b.tri(X(0.66), cy + 4, X(0.56), cy + 12, X(0.6), cy + 4, f);
    b.set(X(0.88), cy - 3, '#d9e4ea');
  } };
const CR_SPR = { narwhal: bodyFrames(NARWHAL), walrus: bodyFrames(WALRUS), sealion: bodyFrames(SEALION), sleeper: bodyFrames(SLEEPER) };

// jellies: a translucent bell in four pulse frames (tentacles are drawn live)
function genBell(w, h, cols) {
  const W2 = Math.ceil(w) + 4, H2 = Math.ceil(h) + 5, b = new Pix(W2, H2), cx = W2 / 2, by = h + 2;
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const dx = (x + 0.5 - cx) / (w / 2), dy = (y + 0.5 - by) / h;
    if (dx * dx + dy * dy >= 1 || y + 0.5 > by + 1) continue;
    const r = dx * dx + dy * dy;
    let c = r > 0.72 ? cols.rim : r > 0.35 ? cols.body : cols.inner;
    if (y + 0.5 > by) c = (x % 2) ? cols.rim : cols.lobe;
    b.set(x, y, c);
  }
  if (cols.gonad) for (const ox of [-2.5, 2.5]) { b.set(cx + ox - 0.5, by - h * 0.45, cols.gonad); b.set(cx + ox + 0.5, by - h * 0.45, cols.gonad); b.set(cx + ox, by - h * 0.35, cols.gonad); }
  b.outline(cols.out);
  return b.canvas();
}
const MOON_COL = { rim: '#f3efff', body: '#d8cff8', inner: '#c6b9f0', lobe: '#e9e2ff', gonad: '#ef9fd2', out: '#8a7cc4' };
const LION_COL = { rim: '#e89a68', body: '#c86a40', inner: '#b25a34', lobe: '#8e3c22', gonad: null, out: '#5e2414' };
const JELLY_SPR = {
  jelly: [[13, 6], [12, 6.5], [10.5, 7.5], [12, 6.5]].map(([w, h]) => genBell(w, h, MOON_COL)),
  lionsmane: [[24, 9], [22, 9.5], [20, 10.5], [22, 9.5]].map(([w, h]) => genBell(w, h, LION_COL)),
};

// skua: a brown seabird, four wingbeat frames, facing right
function genSkua(f) {
  const b = new Pix(28, 20), cx = 13, cy = 10;
  const wingY = [-8, -2, 6, -1][f];
  b.tri(cx - 1, cy - 1, cx + 4, cy - 1, cx - 7, cy + wingY, '#4f3e31');
  for (let y = 0; y < 20; y++) for (let x = 0; x < 28; x++) {
    const dx = (x + 0.5 - cx) / 6.5, dy = (y + 0.5 - cy) / 2.8;
    if (dx * dx + dy * dy < 1) b.set(x, y, dy > 0.3 ? '#7a6452' : '#5e4a3c');
    const hx = (x + 0.5 - cx - 6.5) / 2.4, hy = (y + 0.5 - cy + 1) / 2.2;
    if (hx * hx + hy * hy < 1) b.set(x, y, '#4a3a2e');
  }
  b.tri(cx - 6, cy - 1, cx - 11, cy - 2, cx - 11, cy + 1, '#4a3a2e');
  b.set(cx + 9, cy - 1, '#2a2420'); b.set(cx + 10, cy - 1, '#2a2420'); b.set(cx + 10, cy, '#2a2420');
  b.set(cx + 7, cy - 2, '#0b0b14');
  const tx = cx - 7, ty = cy + wingY; b.set(tx + 1, ty + (wingY < 0 ? 1 : -1), '#e8e0d4'); b.set(tx + 2, ty + (wingY < 0 ? 2 : -2), '#e8e0d4');
  b.volume(VOL_KEEP, 0.7); b.outline('auto');
  return b.canvas();
}
const SKUA_SPR = [0, 1, 2, 3].map(genSkua);

// anglerfish: round dark body, a cavern of a mouth
function genAngler(open) {
  const w = 30, h = 24, b = new Pix(w, h), cx = 13, cy = 13;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (x + 0.5 - cx) / 11, dy = (y + 0.5 - cy) / 8;
    if (dx * dx + dy * dy > 1) continue;
    b.set(x, y, dy > 0.35 ? '#4a4250' : hash(x * 3, y * 5) > 0.85 ? '#3d3644' : '#2f2a33');
  }
  b.tri(4, cy, 0, cy - 6, 0, cy + 6, '#2a2530');
  b.tri(14, cy - 7, 18, cy - 10, 20, cy - 6, '#2a2530');
  if (open) {
    for (let x = 17; x < 27; x++) for (let y = cy - 4; y <= cy + 7; y++) {
      const k = (x - 17) / 9, top = cy - 1 - k * 3, bot = cy + 2 + k * 5;
      if (y < top || y > bot) continue;
      b.set(x, y, (y === Math.ceil(top) || y === Math.floor(bot)) && x % 2 ? '#efe6d8' : '#5a1020');
    }
  } else for (let x = 18; x < 26; x++) { b.set(x, cy + 1, '#1a161d'); if (x % 2) b.set(x, cy + (x % 4 === 1 ? 0 : 2), '#efe6d8'); }
  b.set(20, cy - 4, '#d8f0ff'); b.set(21, cy - 4, '#0b0b14');
  b.volume(VOL_KEEP, 0.8); b.outline('auto');
  return b.canvas();
}
const ANGLER_SPR = [genAngler(false), genAngler(true)];

// ---------------------------------------------------------------- cavern ambush spots, fixed per cave
for (const c of caves) {
  c.ambush = [];
  const main = c.chains[0], cr = mulberry32(900 + c.x0);
  const nearRoom = (x, y) => c.rooms.some(r => Math.hypot(r.x - x, r.y - y) < r.r + 45);
  for (let i = 0; i < 4; i++) {
    const p = main[6 + Math.floor((i + cr() * 0.7) / 4 * (main.length - 12))];
    if (nearRoom(p[0], p[1])) continue;
    c.ambush.push({ kind: 'angler', x: p[0], y: floorAt(c, p[0], p[1]) - 9, face: cr() < 0.5 ? -1 : 1 });
  }
  for (let i = 0; i < 6; i++) {
    const p = main[5 + Math.floor((i + cr()) / 6 * (main.length - 10))], step = cr() < 0.5 ? -1 : 1;
    if (nearRoom(p[0], p[1])) continue;
    let y = p[1];
    for (let k = 0; k < 70 && tunnelDepth(c, p[0], y)[0] > 1; k++) y += step;
    c.ambush.push({ kind: 'eel', x: p[0], y, dir: step > 0 ? -Math.PI / 2 : Math.PI / 2 });
  }
}
function stockAmbush() {
  for (const c of caves) {
    if (P.x < c.x0 - 1200 || P.x > c.x1 + 1200) continue;
    for (const a of c.ambush) if (!enemies.includes(a.ref)) a.ref = newCreature(a.kind, a.x, a.y, { cave: c, face: a.face, dir: a.dir, aim: a.dir, st: a.kind === 'eel' ? 'hide' : 'idle', ext: 0, warn: 0, cavern: true });
  }
}

// ---------------------------------------------------------------- the creatures
const CREATURES = {
  jelly: {
    spec: { name: 'MOON JELLY', len: 14, hb: 6 },
    max: x => x >= 2000 && x <= 14000 ? 8 : 0, chance: 0.3,
    spawn() {
      const x = offscreenX(0.6), y = 30 + Math.random() * Math.max(20, Math.min(bed(x) - 50, 220) - 30), n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) newCreature('jelly', x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 50, { vy: 0, ph: Math.random() * 3 });
    },
    update(e, dt) { return updateJelly(e, dt, false); },
    draw(e, x, y) { drawJelly(e, x, y, false); },
  },
  lionsmane: {
    spec: { name: "LION'S MANE", len: 26, hb: 10 },
    max: x => x >= 8000 ? (x > 14000 ? 2 : 1) : 0, chance: 0.05,
    spawn() { const x = offscreenX(0.6); newCreature('lionsmane', x, 40 + Math.random() * 120, { vy: 0, ph: Math.random() * 3, big: true }); },
    update(e, dt) { return updateJelly(e, dt, true); },
    draw(e, x, y) { drawJelly(e, x, y, true); },
  },
  sealion: {
    spec: { name: 'SEA LION', len: 40, hb: 4.8, cy: 10, patrol: 50, sight: 150, turn: 2.6, minY: 10 },
    max: x => x >= 3000 && x <= 13000 ? (x > 7000 ? 2 : 1) : 0, chance: 0.07,
    spawn() { const x = offscreenX(); newCreature('sealion', x, 20 + Math.random() * Math.max(10, Math.min(bed(x) - 30, 200) - 20)); },
    update(e, dt) {
      const S = this.spec, k = diff.enemySpd;
      e.t += dt; if (Math.abs(e.x - P.x) > 1400) return false;
      const ex = openWater(), dist = Math.hypot(P.x - e.x, P.y - e.y);
      if (e.st === 'sprint') {
        e.stT -= dt; steerTo(e, P.x + P.vx * 0.3, P.y + P.vy * 0.3, 178 * k, 3.2, dt, 3);
        if (e.stT <= 0 || !ex) { e.st = 'tired'; e.stT = 2.6; addText(e.x, e.y - 12, 'PANT...', '#c9d2d9', 0.9); }
      } else if (e.st === 'tired') {
        e.stT -= dt; steerTo(e, e.x + Math.cos(e.ang) * 40, e.y - 3, 32 * k, 1, dt);
        if (e.stT <= 0) e.st = 'patrol';
      } else {
        wander(e, S, dt, k);
        if (ex && dist < S.sight) { e.st = 'sprint'; e.stT = 2.2; addText(e.x, e.y - 14, '!', '#ff4f6d', 0.8); }
      }
      keepWet(e, S.hb, S.minY);
      if (e.st === 'sprint') biteCheck(e, S, 0.44);
    },
    draw(e, x, y) { bodyDraw(e, x, y, CR_SPR.sealion, SEALION, e.st === 'sprint', e.st === 'sprint' ? 22 : 8); },
  },
  walrus: {
    spec: { name: 'WALRUS', len: 54, hb: 9, cy: 15, sight: 110 },
    max: x => x >= 4000 && x <= 15000 ? 1 : 0, chance: 0.05,
    spawn() {
      const f = floes.find(f => Math.abs(f.x - P.x) > W / 2 + 40 && Math.abs(f.x - P.x) < 700);
      if (f) newCreature('walrus', f.x, 24, { floe: f });
    },
    update(e, dt) {
      const S = this.spec, k = diff.enemySpd;
      e.t += dt; e.cd = Math.max(0, e.cd - dt); if (Math.abs(e.x - P.x) > 1400) return false;
      const ex = openWater(), dist = Math.hypot(P.x - e.x, P.y - e.y);
      const target = P.state === 'floe' && P.floe && Math.abs(P.floe.x - e.x) < 280 ? P.floe : null;
      if (e.st === 'bump') {
        e.stT -= dt; const f = e.bumpFloe; f.shake = 1;
        steerTo(e, f.x, 15, 30, 3, dt);
        if (e.stT <= 0) {
          f.shake = 0; e.st = 'loaf'; e.cd = 4.5;
          if (P.state === 'floe' && P.floe === f) {
            P.state = 'air'; P.floe = null; P.vy = -210; P.vx = (Math.random() < 0.5 ? -1 : 1) * (60 + Math.random() * 80);
            addText(P.x, P.y - 16, 'BUMPED OFF!', '#ffcf8a', 1.3); SFX.tone(90, 55, 0.35, 'square', 0.07); shake = 0.25;
          }
        }
      } else if (target && e.cd <= 0) {
        steerTo(e, target.x, 16, 105 * k, 2.6, dt);
        if (Math.abs(e.x - target.x) < 12 && e.y < 28) { e.st = 'bump'; e.stT = 1.1 * diff.guard; e.bumpFloe = target; addText(target.x, -18, '!!', '#ffcf8a', 0.9); SFX.tone(70, 60, 0.6, 'sine', 0.06); }
      } else if (ex && dist < S.sight) {
        if (e.lungeT > 0) { e.lungeT -= dt; steerTo(e, P.x, P.y, 185 * k, 1.2, dt, 6); }
        else steerTo(e, P.x, P.y, 92 * k, 1.8, dt);
        if (dist < 36 && e.cd <= 0 && e.lungeT <= 0) { e.lungeT = 0.4; e.cd = 1.8; }
      } else {
        const f = e.floe || floes.find(f => Math.abs(f.x - e.x) < 400);
        e.floe = f;
        if (f) steerTo(e, f.x + Math.sin(e.t * 0.4) * 22, 22, 28, 1.4, dt); else steerTo(e, e.x + 30, 30, 25, 1, dt);
      }
      keepWet(e, S.hb, 12);
      if (ex) biteCheck(e, S, 0.44);
    },
    draw(e, x, y) { bodyDraw(e, x, y, CR_SPR.walrus, WALRUS, e.lungeT > 0, 6); },
  },
  skua: {
    spec: { name: 'SKUA', len: 20, hb: 4 },
    max: x => x >= 1500 ? (x > 9000 ? 2 : 1) : 0, chance: 0.04,
    spawn() { const x = offscreenX(0.5); newCreature('skua', x, -120 - Math.random() * 30, { st: 'circle', vx: 0, vy: 0, face: 1 }); },
    update(e, dt) {
      e.t += dt; if (Math.abs(e.x - P.x) > 1600) return false;
      const fly = (tx, ty, spd) => {
        const dx = tx - e.x, dy = ty - e.y, d = Math.hypot(dx, dy) || 1, kk = Math.min(1, dt * 3);
        e.vx += (dx / d * spd - e.vx) * kk; e.vy += (dy / d * spd - e.vy) * kk;
        e.x += e.vx * dt; e.y += e.vy * dt; if (Math.abs(e.vx) > 5) e.face = Math.sign(e.vx);
      };
      const exposedAir = P.carry && P.state !== 'swim' && P.state !== 'dead' && P.x > 150;
      if (e.st === 'circle') {
        fly(P.x + Math.cos(e.t * 0.8) * 90, -110 + Math.sin(e.t * 1.3) * 18, 120);
        if (exposedAir && Math.abs(P.x - e.x) < 230) { e.st = 'swoop'; addText(e.x, e.y + 10, 'SKREE!', '#ffcf8a', 0.9); SFX.tone(1800, 900, 0.25, 'sawtooth', 0.03); }
      } else if (e.st === 'swoop') {
        fly(P.x + P.vx * 0.2, P.y + P.vy * 0.2 - 2, 235 * diff.enemySpd);
        if (!exposedAir) e.st = 'circle';
        else if (Math.hypot(P.x - e.x, P.y - e.y) < 10) {
          e.carry = P.carry; P.carry = null; e.st = 'flee'; e.fleeDir = Math.random() < 0.5 ? -1 : 1;
          addText(P.x, P.y - 16, 'THIEF! HIT IT TO GET IT BACK', '#ff9a9a', 1.8); SFX.tone(400, 200, 0.2, 'square', 0.05);
        }
      } else {
        fly(e.x + e.fleeDir * 200, -190, 140);
        if (e.carry && P.state === 'air' && !P.carry && Math.hypot(P.x - e.x, P.y - e.y) < 13) {
          P.carry = e.carry; e.carry = null; e.st = 'circle';
          addText(P.x, P.y - 16, 'GOT IT BACK!', '#7be0b8', 1.4); SFX.grab();
          for (let i = 0; i < 8; i++) addPart(e.x, e.y, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 80, 0.8, '#8a6a52', 'feather');
        }
        if (e.y < -300) return false;
      }
      e.y = Math.min(e.y, -6);
    },
    draw(e, x, y) {
      const img = SKUA_SPR[e.st === 'swoop' ? 1 : Math.floor(e.t * 9) % 4];
      if (e.carry) { const f = fishImg(e.carry, 1); ctx.save(); ctx.translate(x + e.face * 9, y + 3); ctx.rotate(Math.PI / 2); ctx.drawImage(f, -2, -f.height / 2); ctx.restore(); }
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(e.face < 0 ? -1 : 1, 1); ctx.drawImage(img, -13, -10); ctx.restore();
    },
  },
  sleeper: {
    spec: { name: 'SLEEPER SHARK', len: 84, hb: 9, cy: 18, sight: 130 },
    max: x => x >= 7000 && bed(x) > 300 ? 1 : 0, chance: 0.04,
    spawn() { const x = offscreenX(); newCreature('sleeper', x, bed(x) - 35); },
    update(e, dt) {
      const S = this.spec, k = diff.enemySpd;
      e.t += dt; if (Math.abs(e.x - P.x) > 1400) return false;
      const ex = openWater(), dx = P.x - e.x, dy = P.y - e.y, dist = Math.hypot(dx, dy);
      if (e.st === 'gulp') { e.stT -= dt; e.spd = 240 * k; e.x += Math.cos(e.ang) * e.spd * dt; e.y += Math.sin(e.ang) * e.spd * dt; if (e.stT <= 0) { e.st = 'rest'; e.stT = 2.2; } }
      else if (e.st === 'rest') { e.stT -= dt; steerTo(e, e.x + Math.cos(e.ang) * 40, bed(e.x) - 35, 15, 0.8, dt); if (e.stT <= 0) e.st = 'patrol'; }
      else if (ex && dist < S.sight && P.y > bed(P.x) - 170) {
        steerTo(e, P.x, P.y, 50 * k, 1.1, dt);
        if (dist < 64 && Math.abs(angDiff(e.ang, Math.atan2(dy, dx))) < 0.6) { e.st = 'gulp'; e.stT = 0.45; SFX.lunge(); }
      } else {
        if (!e.wp || Math.hypot(e.wp[0] - e.x, e.wp[1] - e.y) < 20) { const wx = e.home + (Math.random() - 0.5) * 500; e.wp = [wx, bed(wx) - 28 - Math.random() * 30]; }
        steerTo(e, e.wp[0], e.wp[1], 22, 0.8, dt);
      }
      keepWet(e, S.hb, 60);
      biteCheck(e, S, 0.45);
    },
    draw(e, x, y) { bodyDraw(e, x, y, CR_SPR.sleeper, SLEEPER, e.st === 'gulp', 4); },
  },
  narwhal: {
    spec: { name: 'NARWHAL', len: 58, hb: 6.4, cy: 14, patrol: 45, sight: 260, turn: 1.6, minY: 16 },
    max: x => x >= 9000 ? (x > 15000 ? 2 : 1) : 0, chance: 0.04,
    spawn() { const x = offscreenX(); newCreature('narwhal', x, 30 + Math.random() * Math.max(10, Math.min(bed(x) - 40, 220) - 30)); },
    update(e, dt) {
      const S = this.spec, k = diff.enemySpd;
      e.t += dt; if (Math.abs(e.x - P.x) > 1400) return false;
      const ex = openWater(), dist = Math.hypot(P.x - e.x, P.y - e.y);
      if (e.st === 'aim') {
        e.stT -= dt; e.spd = lerp(e.spd, 0, dt * 4);
        e.ang += clamp(angDiff(e.ang, Math.atan2(P.y + P.vy * 0.25 - e.y, P.x + P.vx * 0.25 - e.x)), -3 * dt, 3 * dt);
        e.x += Math.cos(e.ang) * e.spd * dt; e.y += Math.sin(e.ang) * e.spd * dt;
        if (e.stT <= 0) { e.st = 'charge'; e.stT = 1.3; e.minD = 999; SFX.noise(0.4, 400, 2400, 0.08); }
      } else if (e.st === 'charge') {
        e.stT -= dt; e.spd = lerp(e.spd, 340 * k, Math.min(1, dt * 8));
        e.x += Math.cos(e.ang) * e.spd * dt; e.y += Math.sin(e.ang) * e.spd * dt;
        e.minD = Math.min(e.minD, dist);
        const hit = e.y < 8 || e.y > bed(e.x) - 10 || bergs.some(b => pushOutBerg({ x: e.x, y: e.y }, 6, b));
        if (e.stT <= 0 || hit) {
          e.st = 'tired'; e.stT = 1.6;
          if (P.state !== 'dead' && e.minD < 70) onDodge();
          if (hit) { shake = Math.max(shake, 0.15); for (let i = 0; i < 6; i++) addPart(e.x, e.y, (Math.random() - 0.5) * 60, (Math.random() - 0.5) * 60, 0.6, '#dfe7ec', 'bubble'); }
        }
      } else if (e.st === 'tired') {
        e.stT -= dt; steerTo(e, e.x + Math.cos(e.ang) * 30, e.y, 25, 1, dt);
        if (e.stT <= 0) e.st = 'patrol';
      } else {
        wander(e, S, dt, k);
        if (ex && dist < S.sight && dist > 50) { e.st = 'aim'; e.stT = 0.9 * diff.guard; addText(e.x, e.y - 14, '!', '#ff4f6d', 0.9); SFX.tone(1800, 2400, 0.15, 'triangle', 0.03); }
      }
      if (e.st !== 'charge') keepWet(e, S.hb, S.minY);
      if (e.st === 'charge' && openWater()) {
        const ca = Math.cos(e.ang), sa = Math.sin(e.ang), nx = e.x + ca * S.len * 0.5, ny = e.y + sa * S.len * 0.5;
        const [qx, qy] = closestOnSeg(P.x, P.y, e.x - ca * 20, e.y - sa * 20, nx + ca * 26, ny + sa * 26);
        if (Math.hypot(P.x - qx, P.y - qy) < R + 2.5) killPenguin(e);
      }
    },
    draw(e, x, y) {
      const S = this.spec, ca = Math.cos(e.ang), sa = Math.sin(e.ang), nx = x + ca * S.len * 0.5, ny = y + sa * S.len * 0.5;
      bodyDraw(e, x, y, CR_SPR.narwhal, NARWHAL, false, e.st === 'charge' ? 26 : 6);
      for (let i = 0; i < 26; i++) { // the spiral tusk
        const px = Math.round(nx + ca * i), py = Math.round(ny + sa * i);
        ctx.fillStyle = OUTLINE; ctx.fillRect(px, py - 1, 1, 3);
        ctx.fillStyle = i % 3 === 0 ? '#b8ab8c' : '#efe6cf'; ctx.fillRect(px, py, 1, 1);
      }
      if (e.st === 'aim') { // the glint that runs up the tusk before a charge
        const g = Math.floor((1 - e.stT / (0.9 * diff.guard)) * 26) % 26;
        ctx.fillStyle = '#ffffff'; ctx.fillRect(Math.round(nx + ca * g) - 1, Math.round(ny + sa * g) - 1, 3, 3);
      }
    },
  },
  angler: {
    spec: { name: 'ANGLERFISH', len: 26, hb: 8 },
    update(e, dt) {
      e.t += dt; e.cd = Math.max(0, e.cd - dt); if (Math.abs(e.x - P.x) > 2600) return false;
      const mx = e.x + e.face * 11, my = e.y + 2, d = Math.hypot(P.x - mx, P.y - my);
      const ex = P.state === 'swim' && P.inv <= 0 && P.cave === e.cave;
      if (e.st === 'idle') { if (ex && d < 34 && e.cd <= 0) { e.st = 'snap'; e.stT = 0.14 * diff.guard; } }
      else if (e.st === 'snap') { e.stT -= dt; if (e.stT <= 0) { e.st = 'bite'; e.stT = 0.2; SFX.tone(300, 110, 0.12, 'square', 0.05); } }
      else { e.stT -= dt; if (ex && d < 14) killPenguin(e); if (e.stT <= 0) { e.st = 'idle'; e.cd = 1.3; } }
    },
    draw(e, x, y) {
      const img = ANGLER_SPR[e.st === 'idle' ? 0 : 1], f = e.face || 1;
      ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(f, 1); ctx.drawImage(img, -13, -13); ctx.restore();
      const [lx, ly] = anglerLure(e, x, y);
      for (let i = 0; i <= 8; i++) { const t = i / 8; ctx.fillStyle = '#3a3440'; ctx.fillRect(Math.round(x + f * (4 + (lx - x - f * 4) * t / f)), Math.round(y - 7 + (ly - y + 7) * t - Math.sin(t * Math.PI) * 4), 1, 1); }
    },
    glow(e, x, y) {
      const [lx, ly] = anglerLure(e, x, y), p = 0.5 + 0.5 * Math.sin(time * 3 + e.t);
      if (!LURE_GLOW) LURE_GLOW = paint(23, 23, (gx, gy) => { const d = Math.hypot(gx - 11, gy - 11) / 11.5; return d < 1 && dith(Math.pow(1 - d, 1.7) * 0.95, gx, gy) ? '#9ff6ff' : null; });
      ctx.globalAlpha = 0.45 + 0.35 * p; ctx.drawImage(LURE_GLOW, lx - 11, ly - 11);
      ctx.globalAlpha = 1; ctx.fillStyle = '#9ff6ff'; ctx.fillRect(lx - 1, ly - 1, 3, 3); ctx.fillRect(lx - 2, ly, 5, 1); ctx.fillRect(lx, ly - 2, 1, 5);
      ctx.fillStyle = '#ffffff'; ctx.fillRect(lx, ly, 1, 1);
    },
  },
  eel: {
    spec: { name: 'ICE EEL', len: 30, hb: 3 },
    update(e, dt) {
      e.t += dt; e.cd = Math.max(0, e.cd - dt); if (Math.abs(e.x - P.x) > 2600) return false;
      const ex = P.state === 'swim' && P.inv <= 0 && P.cave === e.cave, d = Math.hypot(P.x - e.x, P.y - e.y);
      e.alert = ex && d < 80;
      if (e.st === 'hide') {
        e.ext = lerp(e.ext, 0, Math.min(1, dt * 6));
        if (ex && d < 58) e.warn += dt; else e.warn = 0;
        if (e.warn > 0.35 * diff.guard && e.cd <= 0) { // eyes glint first, then it strikes
          e.st = 'out'; e.stT = 0.22; e.warn = 0;
          e.aim = e.dir + clamp(angDiff(e.dir, Math.atan2(P.y - e.y, P.x - e.x)), -0.7, 0.7);
          SFX.tone(900, 300, 0.1, 'sawtooth', 0.03);
        }
      } else if (e.st === 'out') { e.stT -= dt; e.ext = 1 - Math.max(0, e.stT) / 0.22; if (e.stT <= 0) { e.st = 'hold'; e.stT = 0.3; } }
      else if (e.st === 'hold') { e.stT -= dt; if (e.stT <= 0) { e.st = 'back'; e.stT = 0.5; } }
      else { e.stT -= dt; e.ext = Math.max(0, e.stT / 0.5); if (e.stT <= 0) { e.st = 'hide'; e.cd = 1.4 * diff.guard; } }
      const reach = 50 * e.ext;
      e.hx = e.x + Math.cos(e.aim) * reach; e.hy = e.y + Math.sin(e.aim) * reach;
      if (ex && e.ext > 0.3 && (e.st === 'out' || e.st === 'hold') && Math.hypot(P.x - e.hx, P.y - e.hy) < R + 4) killPenguin(e);
    },
    draw(e, x, y) {
      ctx.fillStyle = '#07080a'; ctx.fillRect(x - 3, y - 2, 7, 5); ctx.fillRect(x - 2, y - 3, 5, 7);
      if (e.ext <= 0.02) return;
      const hx = x + (e.hx - e.x), hy = y + (e.hy - e.y), n = Math.max(2, Math.ceil(Math.hypot(hx - x, hy - y) / 2));
      const px = -Math.sin(e.aim), py = Math.cos(e.aim);
      let lx = x, ly = y;
      for (let i = 1; i <= n; i++) {
        const t = i / n, w = Math.sin(t * Math.PI * 2 + time * 14) * 2.2 * (1 - t);
        const cx = x + (hx - x) * t + px * w, cy = y + (hy - y) * t + py * w;
        thickLine(lx, ly, cx, cy, 3, '#6f8a7c'); ctx.fillStyle = '#b9c9b0'; ctx.fillRect(Math.round(cx), Math.round(cy + 1), 1, 1);
        lx = cx; ly = cy;
      }
      ctx.fillStyle = OUTLINE; ctx.fillRect(Math.round(hx) - 3, Math.round(hy) - 3, 6, 6);
      ctx.fillStyle = '#9ab0a2'; ctx.fillRect(Math.round(hx) - 2, Math.round(hy) - 2, 4, 4);
      ctx.fillStyle = '#ffef9a'; ctx.fillRect(Math.round(hx + Math.cos(e.aim)), Math.round(hy - 1), 1, 1);
      if (e.st === 'out' || e.st === 'hold') { ctx.fillStyle = '#5a1020'; ctx.fillRect(Math.round(hx + Math.cos(e.aim) * 2), Math.round(hy + Math.sin(e.aim) * 2), 2, 2); }
    },
    glow(e, x, y) {
      if (!e.alert || e.st !== 'hide') return;
      if (Math.floor(time * 10) % 3 === 0) return;
      ctx.fillStyle = '#ffef9a'; ctx.fillRect(x - 2, y, 1, 1); ctx.fillRect(x + 1, y, 1, 1);
      ctx.globalAlpha = 0.3; ctx.fillRect(x - 3, y - 1, 6, 3); ctx.globalAlpha = 1;
    },
  },
};
// register names/sizes so the rest of the game (results card, HUD) can talk about them
for (const k in CREATURES) ENEMY[k] = Object.assign({ cy: 10, ht: 20, len: 20, hb: 5 }, CREATURES[k].spec);

let LURE_GLOW = null; // built on first use (paint() lives in render.js)
function anglerLure(e, x, y) { const f = e.face || 1; return [Math.round(x + f * 15 + Math.sin(time * 1.3 + e.t) * 1.5), Math.round(y - 13 + Math.sin(time * 2 + e.t) * 1.5)]; }
function bodyDraw(e, x, y, set, o, open, rate) {
  groundShadow(e.x, e.y, o.len);
  const img = (open ? set.open : set.shut)[Math.floor(e.t * rate) % 8];
  drawSprite(img, x, y, e.ang, Math.cos(e.ang) < 0, img.width / 2, o.cy + 3);
}
function updateJelly(e, dt, big) {
  e.t += dt; if (Math.abs(e.x - P.x) > 1400) return false;
  const period = big ? 2.2 : 1.5, ph = (e.t + e.ph) % period;
  e.pulse = ph / period;
  if (ph < dt) e.vy -= big ? 10 : 16;
  e.vy += (big ? 3 : 5) * dt; e.vy *= Math.exp(-1.2 * dt);
  e.x += Math.sin(e.t * 0.25 + e.ph) * 5 * dt; e.y += e.vy * dt;
  e.y = clamp(e.y, 18, bed(e.x) - (big ? 70 : 26));
  if (openWater()) {
    const dx = P.x - e.x, dy = P.y - e.y, bw = big ? 12 : 6;
    const inBell = (dx / (bw + R)) ** 2 + (dy / (bw * 0.6 + R)) ** 2 < 1;
    const inTent = Math.abs(dx) < bw * 0.85 + 3 && dy > 0 && dy < (big ? 55 : 16);
    if (inBell || inTent) stunPenguin(big ? 2.4 : 1.5);
  }
}
function drawJelly(e, x, y, big) {
  const frames = JELLY_SPR[big ? 'lionsmane' : 'jelly'], p = e.pulse || 0;
  const img = frames[p < 0.12 ? 2 : p < 0.25 ? 1 : p > 0.85 ? 3 : 0];
  const n = big ? 14 : 5, bw = big ? 10 : 5, len = big ? 50 : 14;
  ctx.globalAlpha = 0.1; ctx.fillStyle = big ? '#ff9a6a' : '#cfc2ff'; ctx.fillRect(x - bw - 4, y - 8, bw * 2 + 8, 14); ctx.globalAlpha = 1;
  for (let i = 0; i < n; i++) {
    const tx = x - bw + (i / (n - 1)) * bw * 2, L = len * (0.7 + 0.3 * hash(i, 3));
    ctx.fillStyle = big ? (i % 3 ? '#e8a070' : '#c86a40') : '#ece4ff';
    for (let k = 0; k < L; k += 1) {
      ctx.globalAlpha = 0.55 * (1 - k / L) + 0.15;
      ctx.fillRect(Math.round(tx + Math.sin(time * 2 + k * 0.25 + i) * k * 0.08 - e.vy * k * 0.01), Math.round(y + 1 + k), 1, 1);
    }
  }
  ctx.globalAlpha = 0.85; ctx.drawImage(img, Math.round(x - img.width / 2), Math.round(y - img.height + 3)); ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- spawning (called every 0.6s from updatePlay)
function spawnCreatures() {
  for (const k in CREATURES) {
    const C = CREATURES[k]; if (!C.spawn) continue;
    const base = C.max(P.x); if (!base) continue;
    const cap = Math.max(1, Math.round(base * diff.cap));
    if (enemies.filter(e => e.kind === k).length >= cap || Math.random() > C.chance * diff.cap) continue;
    C.spawn();
  }
}

// ---------------------------------------------------------------- the bestiary (fish book > creatures, and how-to-play)
const BESTIARY = [
  ['seal', 'SEAL', 'FROM 70M', 'AS FAST AS YOU AND SMART: IT CUTS YOU OFF AND WAITS UNDER WHERE YOU WILL LAND.'],
  ['shark', 'SHARK', 'FROM 250M', 'AS FAST AS YOU, TURNS WIDE. WHEN IT SEES YOU IT CALLS EVERY HUNTER NEARBY.'],
  ['jelly', 'MOON JELLY', '200M TO 1400M', 'DRIFTS IN CLUSTERS. ITS STING STUNS YOU: SLOW, AND NO DASH FOR A MOMENT.'],
  ['sealion', 'SEA LION', '300M TO 1300M', 'SPRINTS FASTER THAN YOU FOR TWO SECONDS, THEN HAS TO REST. OUTLAST IT.'],
  ['walrus', 'WALRUS', '400M TO 1500M', 'LOAFS UNDER ICE FLOES AND WILL BUMP YOU OFF ONE, STRAIGHT INTO THE WATER.'],
  ['skua', 'SKUA', 'FROM 150M', 'A SEABIRD AND A THIEF. STEALS YOUR FISH WHEN YOU LEAP OR REST. HIT IT IN THE AIR TO GET IT BACK.'],
  ['sleeper', 'SLEEPER SHARK', 'DEEP SEABED, FROM 700M', 'HUGE AND SLOW, HUGS THE BOTTOM. GULPS ANYTHING THAT DIVES TOO CLOSE.'],
  ['orca', 'ORCA', 'FROM 800M, RARE', 'FASTER THAN YOU. HUNTS IN PACKS OF 3 OR 4 THAT BOX YOU IN.'],
  ['lionsmane', "LION'S MANE", 'FROM 800M', 'A GIANT JELLY WITH LONG TRAILING TENTACLES. A LONG, NASTY STING.'],
  ['narwhal', 'NARWHAL', 'FROM 900M', 'AIMS, THEN CHARGES IN A STRAIGHT LINE. WATCH FOR THE GLINT ON THE TUSK AND SIDESTEP.'],
  ['angler', 'ANGLERFISH', 'CAVERNS', 'WAITS IN THE DARK BEHIND A GLOWING LURE. DO NOT GO TOWARD THE LIGHT.'],
  ['eel', 'ICE EEL', 'CAVERNS', 'HIDES IN HOLES IN THE TUNNEL WALLS. GLINTING EYES MEAN IT IS ABOUT TO STRIKE.'],
  ['squid', 'GIANT SQUID', 'CAVERN TREASURE ROOMS', 'GUARDS TREASURE. WINDS UP, THEN LASHES ITS TENTACLES WHERE YOU WERE.'],
  ['crab', 'GIANT CRAB', 'CAVERN TREASURE ROOMS', 'GUARDS TREASURE. RAISES A CLAW, THEN SNAPS IT SHUT.'],
];
// a picture of any creature, centred at screen (x, y), for menus and the results card
function creaturePortrait(kind, x, y, sc = 1) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.scale(sc, sc);
  const ox = OX, oy = OY; OX = 0; OY = 0;
  const fake = { kind, x: 0, y: 0, ang: 0, t: time, st: 'patrol', stT: 1, ext: 0.8, aim: -0.4, dir: -0.4, hx: 0, hy: 0, face: 1, pulse: (time % 1.5) / 1.5, vy: 0, carry: null, alert: true };
  if (kind === 'squid' || kind === 'crab') drawGuardAt(kind, 0, 0, 1);
  else if (ENEMY_SPR[kind]) { const img = ENEMY_SPR[kind].shut[Math.floor(time * 8) % 8]; ctx.drawImage(img, -img.width / 2, -(ENEMY[kind].cy + 3)); }
  else if (kind === 'eel') { fake.x = -14; fake.y = 8; fake.hx = 10; fake.hy = -6; fake.aim = -0.6; CREATURES.eel.draw(fake, -14, 8); }
  else if (kind === 'angler') { CREATURES.angler.draw(fake, 0, 0); CREATURES.angler.glow(fake, 0, 0); }
  else if (kind === 'skua') { fake.t = time; CREATURES.skua.draw(fake, 0, 0); }
  else { const C = CREATURES[kind]; if (kind === 'jelly' || kind === 'lionsmane') { fake.y = kind === 'lionsmane' ? -10 : -2; C.draw(fake, 0, fake.y); } else { fake.t = time; C.draw(fake, 0, 0); } }
  OX = ox; OY = oy; ctx.restore();
}
