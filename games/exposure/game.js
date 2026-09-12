/* =====================================================================
   EXPOSURE
   =====================================================================
   The deck is pitch black. Your muzzle flash is the only real light, and
   the flash FREEZES: firing lights the room for an instant and that
   instant stays on screen while everything real keeps moving in the dark.

   Built to handset rules on purpose - 240x160, playable on a d-pad and
   two buttons, one indexed palette, every pixel written into a buffer:

     - two four-step ramps and nothing in between. Cold means it is a
       photograph and already out of date. Warm means it is live.
     - light falls off in DITHERED steps, never a smooth gradient, so
       the edge of what you can see is a texture you can read.
     - the picture does not fade out. It rots down the ramp a step at a
       time until there is nothing left of it.

   Three lights, three bargains:
     the flash    one frozen frame, wide, and every crawler hears it
     the match    live and dim, but you have to stand still for it
     the glow     an arm's length, always on, free

   Every deck is a checkpoint. Dying puts you back at the top of the deck
   you died on with what you walked in carrying.
   ===================================================================== */
(function () {
'use strict';

/* ---- the handset ---------------------------------------------------- */
const W = 240, H = 160, TILE = 10, COLS = 24, ROWS = 16;

/* ---- palette: sixteen entries, fixed ---------------------------------
   Nothing in this game picks a colour at runtime. */
const PAL = [
  '#05070a',                                   //  0  the dark
  '#131b25', '#2b3a4c', '#5b768f', '#b6cbdc',  //  1-4  COLD: the photograph
  '#1c1207', '#5c3a18', '#a86c2a', '#ffcf8a',  //  5-8  WARM: live light
  '#fff6e2',                                   //  9  muzzle
  '#6fd0b4',                                   // 10  the hatch
  '#e8c46a',                                   // 11  ammo and matches
  '#d4553c',                                   // 12  damage
  '#8a94a8',                                   // 13  interface
  '#3c4657',                                   // 14  interface, quiet
  '#e6ecf5',                                   // 15  interface, loud
];
const COLD = [1, 2, 3, 4];
const WARM = [5, 6, 7, 8];

/* ---- the framebuffer -------------------------------------------------- */
const cv = document.getElementById('screen');
cv.width = W; cv.height = H;
const ctx = cv.getContext('2d');
ctx.imageSmoothingEnabled = false;
const img = ctx.createImageData(W, H);
const img32 = new Uint32Array(img.data.buffer);
const RGBA = PAL.map((h) => {
  const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16);
  return (255 << 24) | (b << 16) | (g << 8) | r;          // little-endian ABGR
});
const fb = new Uint8Array(W * H);

/* the held exposure: a level 1-4 per pixel, and what that pixel was */
const photoLv = new Uint8Array(W * H);
const photoKind = new Uint8Array(W * H);   // 0 room, 1 crawler, 2 hatch, 3 drop
const MASK = new Uint8Array(W * H);

/* ordered dither. Light steps down through this instead of blending,
   which is the whole reason the edge of a light reads as a texture. */
const BAYER = [
  0, 8, 2, 10,
  12, 4, 14, 6,
  3, 11, 1, 9,
  15, 7, 13, 5,
];

/* ---- writing into the buffer ------------------------------------------ */
function px(x, y, c) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  fb[y * W + x] = c;
}
function fill(x, y, w, h, c) {
  const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
  const x1 = Math.min(W, (x + w) | 0), y1 = Math.min(H, (y + h) | 0);
  for (let yy = y0; yy < y1; yy++) fb.fill(c, yy * W + x0, yy * W + x1);
}
/* a brightness 0..1 becomes a step on a four-step ramp, dithered between */
function step4(x, y, k) {
  if (k <= 0) return 0;
  const lv = Math.min(3.999, k * 4);
  const base = lv | 0;
  return base + (BAYER[(y & 3) * 4 + (x & 3)] / 16 < lv - base ? 1 : 0);
}

/* ---- sprites ----------------------------------------------------------
   '.' is transparent, 1-4 is a step on whichever ramp is handed in. */
const SPR = {
  crawlerA: [
    '..333..',
    '.34443.',
    '3444443',
    '3411143',
    '.34443.',
    '3.3.3.3',
  ],
  crawlerB: [
    '..333..',
    '.34443.',
    '3444443',
    '3411143',
    '.34443.',
    '.3.3.3.',
  ],
  body: [
    '.444.',
    '44444',
    '43334',
    '44444',
    '.4.4.',
  ],
  ammo: [
    '.333.',
    '34443',
    '34443',
    '.333.',
  ],
  match: [
    '.444.',
    '.343.',
    '..3..',
    '..3..',
    '..3..',
  ],
  hatch: [
    '4444444',
    '4.....4',
    '4.333.4',
    '4.3.3.4',
    '4.333.4',
    '4.....4',
    '4444444',
  ],
};
function blit(spr, x, y, ramp) {
  for (let r = 0; r < spr.length; r++) {
    const row = spr[r];
    for (let c = 0; c < row.length; c++) {
      if (row[c] === '.') continue;
      px(x + c, y + r, ramp[(+row[c]) - 1]);
    }
  }
}

/* ---- a 3x5 font, drawn into the same buffer as everything else -------- */
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6],
  E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3], H: [5, 5, 7, 5, 5],
  I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7],
  M: [5, 7, 7, 5, 5], N: [5, 7, 7, 7, 5], O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4],
  Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2],
  U: [5, 5, 5, 5, 3], V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5],
  Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7],
  0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7], 2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6],
  4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 2, 2, 2],
  8: [7, 5, 7, 5, 7], 9: [7, 5, 7, 1, 6],
  ' ': [0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 2], '-': [0, 0, 7, 0, 0], ':': [0, 2, 0, 2, 0],
  '/': [1, 1, 2, 4, 4], '!': [2, 2, 2, 0, 2], '+': [0, 2, 7, 2, 0], '%': [5, 1, 2, 4, 5],
};
function text(str, x, y, c) {
  let X = x | 0;
  for (const ch of String(str).toUpperCase()) {
    const g = FONT[ch] || FONT['-'];
    for (let r = 0; r < 5; r++)
      for (let b = 0; b < 3; b++)
        if (g[r] & (4 >> b)) px(X + b, y + r, c);
    X += 4;
  }
  return X;
}
const textW = (s) => String(s).length * 4;
const centre = (s, y, c) => text(s, ((W - textW(s)) / 2) | 0, y, c);

/* ---- a seeded generator, so a deck is a place and not a lottery ------- */
let seed = 1;
function srand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  let x = seed;
  x ^= x >>> 15; x = Math.imul(x, 2246822519);
  x ^= x >>> 13; x = Math.imul(x, 3266489917);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
const ri = (n) => Math.floor(srand() * n);

/* ======================================================================= */
const G = {};

function makeDeck(n) {
  seed = 20260906 + n * 7919;
  const grid = new Uint8Array(COLS * ROWS).fill(1);
  const rooms = [];
  for (let t = 0; t < 140 && rooms.length < 5 + Math.min(3, n); t++) {
    const w = 3 + ri(4), h = 3 + ri(3);
    const x = 1 + ri(COLS - w - 2), y = 1 + ri(ROWS - h - 2);
    let clash = false;
    for (const r of rooms)
      if (x < r.x + r.w + 2 && x + w + 2 > r.x && y < r.y + r.h + 2 && y + h + 2 > r.y) clash = true;
    if (clash) continue;
    rooms.push({ x, y, w, h, cx: x + (w >> 1), cy: y + (h >> 1) });
  }
  const carve = (gx, gy) => {
    if (gx > 0 && gy > 0 && gx < COLS - 1 && gy < ROWS - 1) grid[gy * COLS + gx] = 0;
  };
  for (const r of rooms)
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) carve(x, y);
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i];
    for (let x = Math.min(a.cx, b.cx); x <= Math.max(a.cx, b.cx); x++) carve(x, a.cy);
    for (let y = Math.min(a.cy, b.cy); y <= Math.max(a.cy, b.cy); y++) carve(b.cx, y);
  }

  const mid = (r) => ({ x: r.cx * TILE + 5, y: r.cy * TILE + 5 });
  const crawlers = [];
  for (let i = 0; i < 4 + n; i++) {
    const r = rooms[1 + ri(rooms.length - 1)];
    crawlers.push({
      x: (r.x + ri(r.w)) * TILE + 5, y: (r.y + ri(r.h)) * TILE + 5,
      hp: 1, flare: 0, think: srand() * 2, step: srand() * 4,
      knowX: -1, knowY: -1, knowT: 0,
    });
  }
  const drops = [];
  for (let i = 0; i < 3 + ri(2); i++) {
    const r = rooms[ri(rooms.length)];
    drops.push({ x: (r.x + ri(r.w)) * TILE + 5, y: (r.y + ri(r.h)) * TILE + 5,
      kind: i % 3 === 2 ? 'match' : 'ammo' });
  }
  return { grid, rooms, start: mid(rooms[0]), hatch: mid(rooms[rooms.length - 1]), crawlers, drops };
}

/* ---- CHECKPOINTS ------------------------------------------------------
   The deck is the unit of progress, so it is also the unit of loss. The
   checkpoint is stamped on arrival, which means it always records a deck
   as you found it and never as you wrecked it. */
function newRun() {
  G.check = { deck: 1, score: 0, ammo: 12, matches: 4 };
  G.deaths = 0;
  restoreCheckpoint();
}
function restoreCheckpoint() {
  G.deckNo = G.check.deck;
  G.score = G.check.score;
  G.ammo = G.check.ammo;
  G.matches = G.check.matches;
  G.hp = 3;
  G.dead = false; G.won = false;
  loadDeck(true);
}
function loadDeck(retry) {
  G.check = {
    deck: G.deckNo, score: G.score,
    ammo: Math.max(6, G.ammo), matches: Math.max(2, G.matches),
  };
  G.ammo = G.check.ammo; G.matches = G.check.matches;

  const d = makeDeck(G.deckNo);
  G.grid = d.grid; G.rooms = d.rooms;
  G.x = d.start.x; G.y = d.start.y;
  G.hatch = d.hatch; G.crawlers = d.crawlers; G.drops = d.drops;
  G.bullets = []; G.sparks = [];
  G.aim = 0; G.aimMode = 'keys';
  photoLv.fill(0); photoKind.fill(0);
  G.photoAge = 99;                            // you arrive with no picture
  G.flashX = G.x; G.flashY = G.y;
  G.muzzle = 0; G.match = 0; G.matchX = 0; G.matchY = 0;
  G.hurt = 0; G.t = 0; G.shots = 0; G.hits = 0;
  G.banner = 2.2;
  message(retry && G.deaths ? 'DECK ' + G.deckNo + ' AGAIN' : 'DECK ' + G.deckNo, 2);
}
let msg = '', msgT = 0;
function message(s, t) { msg = s; msgT = t; }

const solid = (gx, gy) =>
  gx < 0 || gy < 0 || gx >= COLS || gy >= ROWS || G.grid[gy * COLS + gx] === 1;
const solidAt = (x, y) => solid((x / TILE) | 0, (y / TILE) | 0);

/* ---- what a light can reach -------------------------------------------
   March rays until they hit a wall, marking a small brush, and use that
   as a mask. Nothing is ever drawn through a wall. */
function lightMask(x, y, R) {
  const x0 = Math.max(0, (x - R - 2) | 0), x1 = Math.min(W, (x + R + 3) | 0);
  const y0 = Math.max(0, (y - R - 2) | 0), y1 = Math.min(H, (y + R + 3) | 0);
  for (let yy = y0; yy < y1; yy++) MASK.fill(0, yy * W + x0, yy * W + x1);
  const N = Math.max(64, Math.ceil(R * 7));
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    const dx = Math.cos(a), dy = Math.sin(a);
    for (let d = 0; d <= R; d++) {
      const cx = (x + dx * d) | 0, cy = (y + dy * d) | 0;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) break;
      MASK[cy * W + cx] = 1;
      if (cx + 1 < W) MASK[cy * W + cx + 1] = 1;
      if (cy + 1 < H) MASK[(cy + 1) * W + cx] = 1;
      if (solid((cx / TILE) | 0, (cy / TILE) | 0)) break;
    }
  }
  return [x0, y0, x1, y1];
}
function clearLine(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy) / 3);
  for (let i = 1; i < n; i++)
    if (solidAt(x0 + dx * i / n, y0 + dy * i / n)) return false;
  return true;
}

/* ---- how a room is shaded ---------------------------------------------
   One function for both the flash and live light, so a wall always has
   the same form and only the ramp underneath it changes. */
function roomLevel(wx, wy, lx, ly, R) {
  const gx = (wx / TILE) | 0, gy = (wy / TILE) | 0;
  const d = Math.hypot(wx - lx, wy - ly);
  if (d > R) return 0;
  let k = 1 - (d / R) * (d / R) * 0.86;
  if (solid(gx, gy)) {
    k *= 0.74;
    /* the face of a wall - the side actually turned toward you - catches
       the light hard. Without this a room is one flat grey mass and you
       cannot tell architecture from floor. */
    if (!solid(gx, gy + 1) && wy % TILE >= TILE - 3) k *= 2.4;
    else if (wy % TILE === 0) k *= 1.3;
  } else {
    /* floor sits well below wall, so a room reads as a dark space with
       bright edges rather than a filled rectangle */
    k *= 0.30;
    if (wx % TILE === 0 || wy % TILE === 0) k *= 1.85;      // deck plating
  }
  return k < 0 ? 0 : k > 1 ? 1 : k;
}

/* ---- THE EXPOSURE ------------------------------------------------------
   One frame of the world, lit from where you stood, written down as
   levels on the cold ramp, and then left alone to rot. */
function expose(x, y, R) {
  const box = lightMask(x, y, R);
  photoLv.fill(0); photoKind.fill(0);
  for (let yy = box[1]; yy < box[3]; yy++) for (let xx = box[0]; xx < box[2]; xx++) {
    const i = yy * W + xx;
    if (!MASK[i]) continue;
    const lv = step4(xx, yy, roomLevel(xx, yy, x, y, R));
    if (lv > 0) photoLv[i] = lv;
  }
  /* the things in the room, caught where they were standing at the
     instant of the flash. This is the whole game, in one loop. */
  const stamp = (sx, sy, spr, kind) => {
    for (let r = 0; r < spr.length; r++) for (let c = 0; c < spr[r].length; c++) {
      const ch = spr[r][c];
      if (ch === '.') continue;
      const xx = (sx + c) | 0, yy = (sy + r) | 0;
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
      const i = yy * W + xx;
      if (!MASK[i]) continue;
      const d = Math.hypot(xx - x, yy - y);
      if (d > R) continue;
      photoLv[i] = Math.max(1, Math.round((+ch) * Math.max(0.4, 1 - (d / R) * 0.75)));
      photoKind[i] = kind;
    }
  };
  for (const c of G.drops) stamp(c.x - 2, c.y - 2, c.kind === 'ammo' ? SPR.ammo : SPR.match, 3);
  stamp(G.hatch.x - 3, G.hatch.y - 3, SPR.hatch, 2);
  for (const c of G.crawlers) if (c.hp > 0) stamp(c.x - 3, c.y - 3, SPR.crawlerA, 1);

  G.photoAge = 0; G.flashX = x; G.flashY = y;
}

/* ---- input -------------------------------------------------------------
   Everything is playable on a d-pad and two buttons. The mouse is a
   convenience and never a requirement. */
const keys = {};
addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  if (G.dead || G.won) {
    if (e.code === 'KeyZ' || e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyR') afterEnd();
    return;
  }
  if (e.code === 'KeyZ' || e.code === 'Space') fire();
  if (e.code === 'KeyX' || e.code === 'KeyF') strikeMatch();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

const mouse = { x: W / 2, y: H / 2 };
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  mouse.x = (e.clientX - r.left) / r.width * W;
  mouse.y = (e.clientY - r.top) / r.height * H;
}
cv.addEventListener('mousemove', (e) => { toLogical(e); G.aimMode = 'mouse'; });
cv.addEventListener('mousedown', (e) => {
  toLogical(e); G.aimMode = 'mouse';
  if (G.dead || G.won) { afterEnd(); return; }
  if (e.button === 2) strikeMatch(); else fire();
});
cv.addEventListener('contextmenu', (e) => e.preventDefault());

function afterEnd() {
  if (G.won) newRun();
  else restoreCheckpoint();               // straight back to the top of this deck
}

function aimAngle() {
  return G.aimMode === 'mouse' ? Math.atan2(mouse.y - G.y, mouse.x - G.x) : G.aim;
}
function fire() {
  if (G.ammo <= 0) { message('EMPTY', 1); snd(120, 60, 'square', 0.03); return; }
  G.ammo--; G.shots++;
  const a = aimAngle();
  G.bullets.push({ x: G.x + Math.cos(a) * 5, y: G.y + Math.sin(a) * 5,
    vx: Math.cos(a) * 230, vy: Math.sin(a) * 230, life: 1.2 });
  G.muzzle = 0.1;
  expose(G.x, G.y, 104);
  tellThem(G.x, G.y, 1);                  // the flash goes both ways
  snd(760, 70, 'square', 0.045, 180);
}
function strikeMatch() {
  if (G.match > 0 || G.matches <= 0) { snd(140, 50, 'square', 0.02); return; }
  G.matches--; G.match = 2.6; G.matchX = G.x; G.matchY = G.y;
  tellThem(G.x, G.y, 0.5);
  message('MATCH', 0.8);
  snd(300, 180, 'triangle', 0.035, 520);
}
function tellThem(x, y, strength) {
  for (const c of G.crawlers) {
    if (c.hp <= 0) continue;
    if (Math.hypot(c.x - x, c.y - y) > 200 * strength) continue;
    if (!clearLine(c.x, c.y, x, y)) continue;
    c.knowX = x; c.knowY = y; c.knowT = 6 * strength;
  }
}

function move(o, dx, dy, r) {
  if (!solidAt(o.x + dx + Math.sign(dx) * r, o.y - r + 1)
    && !solidAt(o.x + dx + Math.sign(dx) * r, o.y + r - 1)) o.x += dx;
  if (!solidAt(o.x - r + 1, o.y + dy + Math.sign(dy) * r)
    && !solidAt(o.x + r - 1, o.y + dy + Math.sign(dy) * r)) o.y += dy;
}

/* ---- sound -------------------------------------------------------------- */
let AC = null;
function snd(freq, ms, type, vol, slide) {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, AC.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, AC.currentTime + ms / 1000);
    g.gain.value = vol === undefined ? 0.05 : vol;
    g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + ms / 1000);
    o.connect(g).connect(AC.destination);
    o.start(); o.stop(AC.currentTime + ms / 1000);
  } catch (e) { /* no audio, no problem */ }
}

/* ---- step ---------------------------------------------------------------- */
function step(dt) {
  if (G.dead || G.won) return;
  G.t += dt;
  G.photoAge += dt;
  if (G.muzzle > 0) G.muzzle -= dt;
  if (G.hurt > 0) G.hurt -= dt;
  if (G.banner > 0) G.banner -= dt;

  let mx = 0, my = 0;
  if (keys.KeyA || keys.ArrowLeft) mx--;
  if (keys.KeyD || keys.ArrowRight) mx++;
  if (keys.KeyW || keys.ArrowUp) my--;
  if (keys.KeyS || keys.ArrowDown) my++;
  const lock = !!(keys.ShiftLeft || keys.ShiftRight);
  const m = Math.hypot(mx, my);
  if (m) {
    if (!lock) {
      /* the gun points where you last walked, snapped to eight - a d-pad
         has eight directions and so does the aim */
      G.aimMode = 'keys';
      G.aim = Math.round(Math.atan2(my, mx) / (Math.PI / 4)) * (Math.PI / 4);
    }
    const sp = (lock ? 40 : 62) * dt;
    move(G, (mx / m) * sp, (my / m) * sp, 3);
    if (G.match > 0) { G.match = 0; message('MATCH OUT', 0.9); }
  }
  if (G.match > 0) G.match -= dt;

  /* ---- bullets --------------------------------------------------------- */
  for (const b of G.bullets) {
    for (let k = 0; k < 4; k++) {
      b.x += b.vx * dt / 4; b.y += b.vy * dt / 4;
      if (solidAt(b.x, b.y)) {
        b.dead = true;
        for (let i = 0; i < 3; i++)
          G.sparks.push({ x: b.x, y: b.y, vx: (Math.random() - .5) * 50, vy: (Math.random() - .5) * 50, life: 0.2 });
        snd(190, 50, 'square', 0.025, 90);
        break;
      }
      for (const c of G.crawlers) {
        if (c.hp <= 0) continue;
        if (Math.abs(c.x - b.x) > 4 || Math.abs(c.y - b.y) > 4) continue;
        c.hp = 0; c.flare = 0.45; b.dead = true;
        G.hits++; G.score += 100;
        for (let i = 0; i < 8; i++)
          G.sparks.push({ x: c.x, y: c.y, vx: (Math.random() - .5) * 90, vy: (Math.random() - .5) * 90, life: 0.45 });
        snd(520, 140, 'sawtooth', 0.05, 110);
        break;
      }
      if (b.dead) break;
    }
    b.life -= dt;
  }
  G.bullets = G.bullets.filter((b) => !b.dead && b.life > 0);

  /* ---- crawlers: they only ever know where the light was ---------------- */
  for (const c of G.crawlers) {
    if (c.hp <= 0) { c.flare -= dt; continue; }
    c.knowT -= dt;
    const near = Math.hypot(c.x - G.x, c.y - G.y);
    let tx = c.knowX, ty = c.knowY, sp = 30;
    if (near < 26 && clearLine(c.x, c.y, G.x, G.y)) { tx = G.x; ty = G.y; sp = 52; }
    else if (c.knowT <= 0) {
      c.think -= dt;
      if (c.think <= 0) {
        c.think = 1.6 + Math.random() * 2.6;
        const r = G.rooms[(Math.random() * G.rooms.length) | 0];
        c.knowX = r.cx * TILE + 5; c.knowY = r.cy * TILE + 5; c.knowT = 5;
      }
      tx = c.knowX; ty = c.knowY; sp = 18;
    }
    if (tx >= 0) {
      const dx = tx - c.x, dy = ty - c.y, d = Math.hypot(dx, dy) || 1;
      if (d > 4) { move(c, (dx / d) * sp * dt, (dy / d) * sp * dt, 3); c.step += sp * dt * 0.12; }
    }
    if (near < 7 && G.hurt <= 0) {
      G.hp--; G.hurt = 1.3;
      c.knowX = G.x; c.knowY = G.y; c.knowT = 3;
      snd(90, 260, 'sawtooth', 0.07, 50);
      if (G.hp <= 0) { G.dead = true; G.deaths++; }
    }
  }
  G.crawlers = G.crawlers.filter((c) => c.hp > 0 || c.flare > 0);

  for (const c of G.drops) {
    if (Math.hypot(c.x - G.x, c.y - G.y) < 7) {
      c.taken = true;
      if (c.kind === 'ammo') { G.ammo += 5; message('+5 ROUNDS', 1.2); }
      else { G.matches += 2; message('+2 MATCHES', 1.2); }
      snd(700, 90, 'triangle', 0.04, 1050);
    }
  }
  G.drops = G.drops.filter((c) => !c.taken);

  for (const p of G.sparks) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
  G.sparks = G.sparks.filter((p) => p.life > 0);

  G.clearDeck = !G.crawlers.some((c) => c.hp > 0);
  if (G.clearDeck && Math.hypot(G.hatch.x - G.x, G.hatch.y - G.y) < 8) {
    G.score += 500 + G.ammo * 25;
    G.deckNo++;
    if (G.deckNo > 5) { G.won = true; return; }
    snd(300, 200, 'triangle', 0.05, 800);
    loadDeck(false);                        // and the checkpoint moves with you
  }
}

/* ---- live light -----------------------------------------------------------
   The same shading as the flash on the warm ramp, redrawn every frame. */
function drawLive(lx, ly, R, gain) {
  const box = lightMask(lx, ly, R);
  for (let yy = box[1]; yy < box[3]; yy++) for (let xx = box[0]; xx < box[2]; xx++) {
    const i = yy * W + xx;
    if (!MASK[i]) continue;
    const lv = step4(xx, yy, roomLevel(xx, yy, lx, ly, R) * gain);
    if (lv > 0) fb[i] = WARM[lv - 1];
  }
  for (const c of G.crawlers) {
    if (c.hp <= 0 || Math.hypot(c.x - lx, c.y - ly) > R) continue;
    blit(Math.floor(c.step) % 2 ? SPR.crawlerB : SPR.crawlerA, c.x - 3, c.y - 3, WARM);
  }
  for (const c of G.drops) {
    if (Math.hypot(c.x - lx, c.y - ly) > R) continue;
    blit(c.kind === 'ammo' ? SPR.ammo : SPR.match, c.x - 2, c.y - 2, [5, 6, 11, 11]);
  }
  if (G.clearDeck && Math.hypot(G.hatch.x - lx, G.hatch.y - ly) <= R)
    blit(SPR.hatch, G.hatch.x - 3, G.hatch.y - 3, [5, 6, 10, 10]);
}

/* ---- draw ------------------------------------------------------------------ */
function draw() {
  fb.fill(0);

  /* ---- the held exposure, rotting one step at a time --------------------- */
  const LIFE = 9;
  const age = Math.min(1, G.photoAge / LIFE);
  if (age < 1) {
    const drop = age * 3.4;
    const whole = drop | 0, frac = drop - whole;
    for (let y = 0; y < H; y++) {
      const row = (y & 3) * 4;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const lv = photoLv[i];
        if (!lv) continue;
        let out = lv - whole - (BAYER[row + (x & 3)] / 16 < frac ? 1 : 0);
        if (out <= 0) continue;
        if (out > 4) out = 4;
        const k = photoKind[i];
        /* a crawler in the picture holds its shape a little longer than
           the room does - but it is still the first thing you stop
           trusting, because it is the only thing that moved */
        fb[i] = k === 1 ? COLD[out > 2 ? 3 : 2]
          : k === 2 ? 10
          : k === 3 ? 11
          : COLD[out - 1];
      }
    }
  }

  /* ---- live light --------------------------------------------------------- */
  if (G.match > 0) {
    const flick = 0.74 + Math.sin(G.t * 29) * 0.08 + Math.sin(G.t * 13) * 0.05;
    drawLive(G.matchX, G.matchY, 48, Math.min(1, G.match) * flick);
  }
  /* THE GLOW: an arm's length, always on, enough to know that the thing
     you have just walked into is a wall */
  drawLive(G.x, G.y, 17, 1);

  /* ---- the muzzle: a hard dithered burst, no gradient ---------------------- */
  if (G.muzzle > 0) {
    const k = G.muzzle / 0.1;
    const R = 8 + 26 * k;
    const box = lightMask(G.x, G.y, R);
    for (let yy = box[1]; yy < box[3]; yy++) for (let xx = box[0]; xx < box[2]; xx++) {
      const i = yy * W + xx;
      if (!MASK[i]) continue;
      const d = Math.hypot(xx - G.x, yy - G.y);
      if (d <= R && step4(xx, yy, (1 - d / R) * k) >= 3) fb[i] = 9;
    }
  }
  for (const c of G.crawlers) {
    if (c.hp > 0 || c.flare <= 0) continue;
    const k = c.flare / 0.45, R = 4 + 16 * k;
    for (let yy = (c.y - R) | 0; yy <= c.y + R; yy++)
      for (let xx = (c.x - R) | 0; xx <= c.x + R; xx++) {
        const d = Math.hypot(xx - c.x, yy - c.y);
        if (d <= R && step4(xx, yy, (1 - d / R) * k) >= 3) px(xx, yy, WARM[2]);
      }
  }
  for (const p of G.sparks) px(p.x, p.y, p.life > 0.2 ? 9 : WARM[3]);
  for (const b of G.bullets) {
    px(b.x, b.y, 9);
    px(b.x - b.vx * 0.012, b.y - b.vy * 0.012, WARM[3]);
  }

  /* ---- you ----------------------------------------------------------------- */
  if (!(G.hurt > 0 && Math.floor(G.t * 14) % 2)) {
    blit(SPR.body, G.x - 2, G.y - 2, WARM);
    const a = aimAngle();
    for (let d = 3; d <= 5; d++) px(G.x + Math.cos(a) * d, G.y + Math.sin(a) * d, 9);
  }
  /* a ring where the last picture was taken from, so a stale photo is not
     just old - it is old AND shot from somewhere you have since left */
  if (age < 1 && Math.hypot(G.flashX - G.x, G.flashY - G.y) > 7) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      px(G.flashX + Math.cos(a) * 5, G.flashY + Math.sin(a) * 5, COLD[1]);
    }
  }

  hud(age);
  flush();
}

function hud(age) {
  /* rounds drawn as rounds. Nobody should have to read a number to know
     they are nearly out. */
  for (let i = 0; i < Math.min(20, G.ammo); i++) fill(3 + i * 3, H - 6, 1, 4, 11);
  if (!G.ammo && Math.floor(G.t * 3) % 2) text('EMPTY', 3, H - 7, 12);
  text('M' + G.matches, 3, H - 14, 13);
  for (let i = 0; i < 3; i++) fill(W - 7 - i * 6, H - 7, 4, 4, i < G.hp ? 12 : 14);
  const right = 'D' + G.deckNo + ' ' + G.score;
  text(right, W - 3 - textW(right), H - 14, 13);

  /* how stale the picture is - the core question, so it gets the top of
     the screen to itself */
  const left = Math.max(0, 1 - age);
  fill(W / 2 - 30, 3, 60, 2, 14);
  fill(W / 2 - 30, 3, (60 * left) | 0, 2, left > 0.35 ? COLD[3] : 12);
  centre(age >= 1 ? 'NO PICTURE' : G.photoAge.toFixed(1) + 'S OLD', 8, age >= 1 ? 12 : 13);

  if (G.banner > 0) centre('DECK ' + G.deckNo, 20, 15);
  else if (G.clearDeck) centre('CLEAR - FIND THE HATCH', 20, Math.floor(G.t * 3) % 2 ? 10 : 14);
  if (msgT > 0) centre(msg, H - 24, 15);

  if (G.dead) {
    fill(0, 52, W, 48, 0);
    fill(0, 52, W, 1, 14); fill(0, 99, W, 1, 14);
    centre('THE DARK GOT YOU', 58, 12);
    centre('CHECKPOINT DECK ' + G.check.deck, 70, 13);
    centre(G.check.ammo + ' ROUNDS  ' + G.check.matches + ' MATCHES', 78, 14);
    if (Math.floor(G.t * 2) % 2) centre('PRESS Z', 89, 15);
  } else if (G.won) {
    fill(0, 52, W, 48, 0);
    fill(0, 52, W, 1, 14); fill(0, 99, W, 1, 14);
    centre('YOU MADE THE SURFACE', 58, 10);
    centre('SCORE ' + G.score, 70, 15);
    centre('ACCURACY ' + (G.shots ? Math.round(G.hits / G.shots * 100) : 0) + '%', 78, 13);
    if (Math.floor(G.t * 2) % 2) centre('PRESS Z', 89, 15);
  }
}

function flush() {
  for (let i = 0; i < fb.length; i++) img32[i] = RGBA[fb[i]];
  ctx.putImageData(img, 0, 0);
}

/* ---- loop --------------------------------------------------------------- */
let last = performance.now(), acc = 0;
const STEP = 1 / 60;
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > 0.25) dt = 0.25;
  acc += dt;
  let guard = 0;
  while (acc >= STEP && guard++ < 6) {
    acc -= STEP;
    step(STEP);
    if (msgT > 0) msgT -= STEP;
    if (G.dead || G.won) G.t += STEP;            // keep the prompt blinking
  }
  draw();
}

function fit() {
  /* Measure the VIEWPORT, not the frame around the canvas - the frame
     shrink-wraps the canvas, so measuring it pins the scale at 1x for
     ever and the game renders postage-stamp sized. */
  const k = Math.max(1, Math.min(
    Math.floor((Math.min(window.innerWidth, 1280) - 60) / W),
    Math.floor((window.innerHeight - 260) / H)));
  cv.style.width = (W * k) + 'px';
  cv.style.height = (H * k) + 'px';
}
addEventListener('resize', fit);

newRun();
fit();
requestAnimationFrame(frame);

G.photoLv = photoLv;                 // handles for the test harness only
G.photoKind = photoKind;
G.COLS = COLS; G.ROWS = ROWS; G.TILE = TILE; G.W = W; G.H = H;
window.EXPOSURE = G;
})();
