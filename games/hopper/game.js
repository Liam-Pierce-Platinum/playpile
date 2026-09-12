// =====================================================================
// HOPPER - one button, one long night, and a city that keeps arriving
// =====================================================================
//
// Liam: *"better graphics for hopper with character customization and
// leaderboard and back to city setting"*.
//
// So it is back on the rooftops, where it started - but drawn properly
// this time. Everything goes into a 240x126 buffer and is blown up with
// smoothing off, which is what makes it pixel art rather than small
// shapes: hard edges, no sub-pixel crawl, a fixed palette.
//
// WHAT MAKES A CITY AT NIGHT READ AS ONE:
//   THREE DEPTHS. A far skyline that barely moves, a middle band of
//   towers with lit windows, and the roofs you are actually on. Parallax
//   does more for depth than any amount of detail on one layer.
//   LIGHT COMES FROM SIGNS, not from the sky. Neon on the middle band,
//   window squares in warm yellow, and a moon. The sky itself is nearly
//   black at the top and dirty orange at the horizon, because that is
//   what a city sky does to light.
//   ROOFS ARE MADE OF STUFF. Water towers, AC units, vents, aerials,
//   parapets, and a fire escape down the front of a building, so the
//   silhouette is never a plain rectangle.
//
// THE RUNNER IS YOURS: cap, jacket and trousers in colours you pick on
// the home screen, plus three jackets that unlock on coins collected.
// The choice is saved, so it is your runner next time too.
//
// The rule that keeps it fair is unchanged: a gap is never wider than
// the jump can clear at the current speed, a long gap is always followed
// by a wide roof, and nothing sits on the lip of a roof where you cannot
// see it before you land.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'hopper', w: 760, h: 400, bg: '#0b0f18' });

const PW = 240, PH = 126;
const buf = document.createElement('canvas');
buf.width = PW; buf.height = PH;
const b = buf.getContext('2d');
b.imageSmoothingEnabled = false;
D.g.imageSmoothingEnabled = false;

// ---- the palette -----------------------------------------------------
const C = {
  skyTop: '#131427', skyMid: '#2c2340', skyLow: '#6b3b46', skyHaze: '#9c5a4a',
  farTower: '#241f39', midTower: '#2e2745', nearTower: '#1b1729',
  roof:   '#3a3350', roofTop:'#4a4366', roofLip:'#5d5580',
  wall:   '#241f36', wallLo: '#1a1628',
  win:    '#ffd08a', winDim: '#8a6a46', winOff:'#191428',
  steel:  '#5a6276', steelLo:'#3d4454',
  ink:    '#120f1c',
  neonA:  '#ff5c8a', neonB:  '#4dd2ff', neonC: '#ffd166',
  coin:   '#ffd166', coinHi: '#fff0b0',
  moon:   '#fdf6d8',
};

// ---- what the runner looks like --------------------------------------
const CAPS = ['#e2584a', '#4dc9ff', '#ffd166', '#57d38c', '#b07cff', '#e7ecf3'];
const JACKETS = [
  { id: 'red',    col: '#e2584a', lo: '#b03c33', name: 'RED',     need: 0 },
  { id: 'blue',   col: '#3f6fd8', lo: '#2d4fa0', name: 'BLUE',    need: 0 },
  { id: 'green',  col: '#3fa05a', lo: '#2d7742', name: 'GREEN',   need: 0 },
  { id: 'white',  col: '#dfe4ee', lo: '#a8adbb', name: 'WHITE',   need: 40 },
  { id: 'gold',   col: '#e8b64a', lo: '#b08430', name: 'GOLD',    need: 150 },
  { id: 'neon',   col: '#ff3dbb', lo: '#c2228c', name: 'NEON',    need: 400 },
];
const LEGS = ['#3a4a6a', '#2f3340', '#5a4030', '#3f3a52'];

const SAVE = 'pd.hopper.';
const load = (k, d) => { try { const v = localStorage.getItem(SAVE + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } };
const save = (k, v) => { try { localStorage.setItem(SAVE + k, JSON.stringify(v)); } catch (e) {} };

let kit = load('kit', { cap: 0, jacket: 0, legs: 0 });
let coinsEver = load('coins', 0);

const G = 1800, JUMP = -430, HOLD = -1050, MAXHOLD = 0.22;
const SCROLL = 1 / 3.4;

let p, roofs, hazards, far, mid, signs, stars, dist, speed, over, started, held, shakeY, coins, got;

function reset() {
  p = { x: 46, y: 0, vy: 0, onGround: true, dive: false, run: 0 };
  roofs = [{ x: -20, w: 150, y: 92, kind: 'flat', props: [] }];
  hazards = []; coins = [];
  dist = 0; speed = 250; over = false; held = 0; shakeY = 0; got = 0;
  far = Array.from({ length: 22 }, (_, i) => ({ x: i * 20 + rnd(-5, 5), w: rnd(12, 26), h: rnd(16, 44) }));
  mid = Array.from({ length: 14 }, (_, i) => ({ x: i * 30 + rnd(-6, 6), w: rnd(20, 38), h: rnd(30, 70),
                                                seed: Math.floor(rnd(0, 999)) }));
  signs = Array.from({ length: 5 }, () => ({ x: rnd(0, PW), y: rnd(40, 78),
                                             w: rnd(8, 16), h: rnd(14, 26),
                                             col: pick([C.neonA, C.neonB, C.neonC]), blink: rnd(0, 6) }));
  stars = Array.from({ length: 40 }, () => ({ x: rnd(0, PW), y: rnd(0, 44), b: rnd(0.2, 0.8) }));
  while (last().x + last().w < PW + 90) addRoof();
  p.y = roofs[0].y - 13;
}

const last = () => roofs[roofs.length - 1];

function addRoof() {
  const L = last();
  const reach = (speed * SCROLL) * 0.84;
  const gap = rnd(16, Math.min(reach * 0.72, 52));
  const step = pick([0, 0, -12, -20, 10, 18]);
  const y = clamp(L.y + step, 50, 104);
  const w = gap > 40 ? rnd(58, 96) : rnd(34, 78);
  const r = { x: L.x + L.w + gap, w, y, kind: pick(['flat', 'flat', 'tar', 'gravel']), props: [] };

  // the things that make a roof a roof, placed away from both lips
  const n = Math.floor(w / 26);
  for (let i = 0; i < n; i++) {
    const px = r.x + 10 + i * 24 + rnd(-4, 4);
    if (px > r.x + w - 12) break;
    r.props.push({ x: px, kind: pick(['tank', 'ac', 'vent', 'aerial', 'hatch', 'ac']) });
  }
  roofs.push(r);

  if (Math.random() < 0.45 && w > 44) {
    hazards.push({ x: r.x + rnd(w * 0.35, w * 0.65), y: r.y,
                   kind: pick(['sign', 'pigeon', 'crate', 'pipe']) });
  }
  if (gap > 26 && Math.random() < 0.7) {
    const k = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < k; i++) {
      const t = (i + 1) / (k + 1);
      coins.push({ x: L.x + L.w + gap * t, y: Math.min(L.y, y) - 22 - Math.sin(t * Math.PI) * 14,
                   got: false, spin: rnd(0, 6) });
    }
  }
  if (roofs.length > 30) roofs.shift();
}

function step(dt, g) {
  if (!started) { draw(); blit(); home.step(dt); return; }
  if (over) {
    draw(); blit();
    D.card('DOWN', [Math.floor(dist) + ' m', got + ' coins', 'record ' + board.best + ' m'],
           'click for the home screen');
    if (D.tapped()) { home.finish(Math.floor(dist), { coins: got }); started = false; }
    return;
  }
  if (D.shot) { draw(); blit(); D.hud(Math.floor(dist) + ' M', '✦ ' + got); return; }

  speed = 250 + Math.min(320, dist * 0.24);
  dist += speed * dt / 12;

  const pressing = D.mouse.down || D.held(' ', 'Space', 'ArrowUp', 'w', 'KeyW');
  if (D.tapped() && p.onGround) { p.vy = JUMP; p.onGround = false; held = 0;
                                  D.beep(430, 0.08, 'square', 0.045, 240); }
  if (!p.onGround && pressing && held < MAXHOLD && p.vy < 0) { p.vy += HOLD * dt; held += dt; }
  p.dive = D.held('ArrowDown', 's', 'KeyS', 'Shift') && !p.onGround;
  p.vy += (p.dive ? G * 2.6 : G) * dt;
  p.y += p.vy * dt * SCROLL * 3.4;

  const move = speed * dt * SCROLL;
  for (const r of roofs) { r.x -= move; for (const q of r.props) q.x -= move; }
  for (const h of hazards) h.x -= move;
  for (const c of coins) c.x -= move;
  for (const t of far) { t.x -= move * 0.06; if (t.x + t.w < -6) { t.x += 22 * 20; t.h = rnd(16, 44); } }
  for (const t of mid) { t.x -= move * 0.17; if (t.x + t.w < -8) { t.x += 14 * 30; t.h = rnd(30, 70); } }
  for (const s of signs) { s.x -= move * 0.17; if (s.x + s.w < -8) { s.x = PW + rnd(0, 60); s.y = rnd(40, 78); } }
  while (last().x + last().w < PW + 90) addRoof();
  hazards = hazards.filter((h) => h.x > -20);
  coins = coins.filter((c) => c.x > -12 && !c.got);

  const under = roofs.find((r) => p.x + 5 > r.x && p.x - 5 < r.x + r.w);
  p.onGround = false;
  if (under && p.vy >= 0 && p.y >= under.y - 13 && p.y < under.y + 14) {
    p.y = under.y - 13; p.vy = 0; p.onGround = true;
    if (p.dive) { shakeY = 2; D.noise(0.09, 0.04, 1200); }
  }
  p.run += p.onGround ? speed * dt * 0.05 : 0;
  if (p.y > PH + 30) { over = true; finish(); }

  for (const h of hazards) {
    if (h.kind === 'pigeon') h.x -= 26 * dt * SCROLL * 3.4;
    const hh = h.kind === 'pigeon' ? 9 : h.kind === 'pipe' ? 8 : 14;
    const hy = h.kind === 'pigeon' ? h.y - 30 : h.y - hh;
    if (Math.abs(h.x - p.x) < 7 && p.y + 6 > hy && p.y - 7 < hy + hh) { over = true; finish(); }
  }
  for (const c of coins) {
    if (!c.got && Math.abs(c.x - p.x) < 8 && Math.abs(c.y - p.y) < 9) {
      c.got = true; got++; coinsEver++; save('coins', coinsEver);
      D.beep(820, 0.07, 'triangle', 0.05, 280);
    }
    c.spin += dt * 7;
  }

  shakeY *= 0.82;
  draw(); blit();
  D.hud(Math.floor(dist) + ' M', '✦ ' + got + '   BEST ' + board.best + ' M');
}

function finish() { D.record(Math.floor(dist)); D.noise(0.4, 0.07, 200); }

// =====================================================================
// the drawing
// =====================================================================
function px(x, y, w, h, col) { b.fillStyle = col; b.fillRect(x | 0, y | 0, Math.max(1, w | 0), Math.max(1, h | 0)); }

function draw() {
  // ---- sky ----------------------------------------------------------
  const grad = b.createLinearGradient(0, 0, 0, PH);
  grad.addColorStop(0, C.skyTop);
  grad.addColorStop(0.42, C.skyMid);
  grad.addColorStop(0.78, C.skyLow);
  grad.addColorStop(1, C.skyHaze);
  b.fillStyle = grad; b.fillRect(0, 0, PW, PH);
  for (const s of stars || []) { b.fillStyle = 'rgba(255,255,255,' + s.b * 0.5 + ')'; b.fillRect(s.x | 0, s.y | 0, 1, 1); }
  px(196, 14, 12, 12, C.moon);
  px(194, 16, 16, 8, C.moon);
  px(200, 16, 4, 4, '#e8e0c0');

  // ---- far skyline --------------------------------------------------
  for (const t of far || []) {
    px(t.x, 96 - t.h, t.w, t.h + 40, C.farTower);
    if ((t.x | 0) % 3 === 0) px(t.x + t.w / 2 - 1, 96 - t.h - 5, 2, 5, C.farTower);
  }
  // ---- middle band, with lit windows and neon -----------------------
  for (const t of mid || []) {
    px(t.x, 104 - t.h, t.w, t.h + 40, C.midTower);
    px(t.x, 104 - t.h, t.w, 1, '#3a3155');
    let s = t.seed;
    for (let wy = 104 - t.h + 5; wy < 112; wy += 7) {
      for (let wx = t.x + 3; wx < t.x + t.w - 3; wx += 6) {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        const lit = (s >> 16) % 5;
        px(wx, wy, 3, 4, lit === 0 ? C.win : lit === 1 ? C.winDim : C.winOff);
      }
    }
  }
  for (const s of signs || []) {
    const on = Math.sin(D.t * 3 + s.blink) > -0.4;
    px(s.x, s.y, s.w, s.h, on ? s.col : '#2a2438');
    if (on) {
      b.globalAlpha = 0.25; px(s.x - 2, s.y - 2, s.w + 4, s.h + 4, s.col); b.globalAlpha = 1;
      px(s.x + 2, s.y + 2, s.w - 4, s.h - 4, '#1a1628');
    }
  }

  b.save(); b.translate(0, shakeY | 0);
  for (const r of roofs || []) roof(r);
  for (const h of hazards || []) hazard(h);
  for (const c of coins || []) if (!c.got) coin(c);
  if (p) runner(p.x, p.y, p);
  b.restore();
}

function roof(r) {
  const x = r.x | 0, y = r.y | 0, w = r.w | 0;
  // the building front, with windows
  px(x, y + 5, w, PH - y, C.wall);
  px(x, y + 5, 2, PH - y, C.wallLo);
  for (let wy = y + 12; wy < PH; wy += 12) {
    for (let wx = x + 5; wx < x + w - 6; wx += 11) {
      const lit = ((wx * 7 + wy * 13) % 6) < 2;
      px(wx, wy, 6, 7, lit ? C.win : C.winOff);
      if (lit) px(wx, wy, 6, 1, C.coinHi);
    }
  }
  // the parapet and the roof deck
  px(x, y, w, 5, C.roof);
  px(x, y, w, 2, C.roofTop);
  px(x, y, 2, 5, C.roofLip);
  px(x + w - 2, y, 2, 5, C.roofLip);
  if (r.kind === 'gravel') for (let i = 0; i < w; i += 3) px(x + i, y + 2, 1, 1, '#5a5378');
  for (const q of r.props || []) prop(q, y);
}

function prop(q, y) {
  const x = q.x | 0;
  if (q.kind === 'tank') {                       // a water tower
    px(x - 5, y - 18, 11, 11, '#6b5340');
    px(x - 5, y - 18, 11, 2, '#8a6b52');
    px(x - 6, y - 21, 13, 3, '#4e3d2f');
    px(x - 4, y - 7, 2, 7, '#4e3d2f'); px(x + 2, y - 7, 2, 7, '#4e3d2f');
  } else if (q.kind === 'ac') {
    px(x - 6, y - 8, 13, 8, C.steel);
    px(x - 6, y - 8, 13, 2, '#70788c');
    px(x - 3, y - 6, 7, 4, C.steelLo);
  } else if (q.kind === 'vent') {
    px(x - 3, y - 10, 6, 10, C.steelLo);
    px(x - 5, y - 13, 10, 3, C.steel);
  } else if (q.kind === 'aerial') {
    px(x, y - 20, 1, 20, C.steelLo);
    px(x - 4, y - 20, 9, 1, C.steelLo);
    px(x - 3, y - 16, 7, 1, C.steelLo);
    if (Math.sin(D.t * 4) > 0) px(x, y - 22, 1, 1, C.neonA);
  } else {                                        // roof hatch
    px(x - 5, y - 5, 11, 5, '#4a4260');
    px(x - 5, y - 6, 11, 1, '#6a6088');
  }
}

function hazard(h) {
  const x = h.x | 0, y = h.y | 0;
  if (h.kind === 'sign') {
    px(x - 1, y - 14, 2, 14, C.steelLo);
    px(x - 9, y - 24, 19, 11, C.neonA);
    px(x - 7, y - 22, 15, 7, '#2a1220');
    px(x - 5, y - 20, 4, 3, C.neonC);
  } else if (h.kind === 'crate') {
    px(x - 6, y - 12, 13, 12, '#7a5a3a');
    px(x - 6, y - 12, 13, 2, '#96724c');
    px(x - 6, y - 6, 13, 1, '#5c4429');
  } else if (h.kind === 'pipe') {
    px(x - 7, y - 8, 15, 5, C.steel);
    px(x - 7, y - 8, 15, 1, '#79839a');
    px(x - 8, y - 9, 3, 7, C.steelLo);
  } else {                                        // pigeon, incoming
    const f = Math.sin(D.t * 16) * 2 | 0;
    px(x - 3, y - 30, 7, 4, '#8a8fa8');
    px(x - 6, y - 31 + f, 4, 2, '#a8aec4');
    px(x + 3, y - 31 - f, 4, 2, '#a8aec4');
    px(x + 4, y - 29, 2, 1, C.neonC);
  }
}

function coin(c) {
  const w = Math.abs(Math.cos(c.spin)) * 5 + 1 | 0;
  px(c.x - w / 2, c.y - 3, w, 6, C.coin);
  px(c.x - w / 2, c.y - 3, w, 1, C.coinHi);
}

/** the runner, in whatever he is wearing */
function runner(x, y, s) {
  x |= 0; y |= 0;
  const J = JACKETS[kit.jacket] || JACKETS[0];
  const legCol = LEGS[kit.legs] || LEGS[0];
  const cap = CAPS[kit.cap] || CAPS[0];

  // the shadow of where he will land
  const under = (roofs || []).find((r) => s && s.x > r.x && s.x < r.x + r.w);
  if (under && s && !s.onGround) { b.globalAlpha = 0.28; px(x - 4, under.y - 1, 8, 2, C.ink); b.globalAlpha = 1; }

  if (s && s.onGround) {
    const k = Math.sin(s.run) * 2 | 0;
    px(x - 4, y + 6, 3, 4 + k, legCol);
    px(x + 1, y + 6, 3, 4 - k, legCol);
  } else {
    px(x - 4, y + 6, 3, s && s.dive ? 2 : 5, legCol);
    px(x + 1, y + 6, 3, s && s.dive ? 2 : 3, legCol);
  }
  px(x - 4, y - 2, 8, 8, J.col);                  // jacket
  px(x - 4, y - 2, 8, 1, '#ffffff22');
  px(x - 4, y + 3, 8, 1, J.lo);
  px(x + 4, y, 2, 4, '#f0c49a');                  // hand
  px(x - 3, y - 8, 6, 6, '#f0c49a');              // head
  px(x - 4, y - 10, 8, 2, cap);                   // cap
  px(x - 6, y - 9, 9, 1, cap);                    // peak
  px(x + 1, y - 6, 1, 1, C.ink);                  // eye
}

function blit() {
  D.g.imageSmoothingEnabled = false;
  D.g.drawImage(buf, 0, 0, PW, PH, 0, 0, D.W, D.H);
}

// =====================================================================
// the home screen, with the wardrobe in it
// =====================================================================
const board = new Board('hopper', { unit: 'DISTANCE', format: (v) => v + ' m' });

/** a row of colour chips; returns the boxes it drew */
function chips(Dd, list, sel, x, y, size, colOf) {
  const out = [];
  for (let i = 0; i < list.length; i++) {
    const bx = x + i * (size + 6);
    const locked = list[i].need !== undefined && coinsEver < list[i].need;
    Dd.g.fillStyle = locked ? '#2a2f3a' : (colOf ? colOf(list[i]) : list[i]);
    Dd.g.fillRect(bx, y, size, size);
    if (i === sel) {
      Dd.g.strokeStyle = '#ffd166'; Dd.g.lineWidth = 2;
      Dd.g.strokeRect(bx - 2, y - 2, size + 4, size + 4);
    }
    if (locked) {
      // A LOCK, NOT A PRICE TAG. Three prices written across three 14px
      // chips ran into each other and read as one long number; the cost
      // only matters when you are actually looking at that one, so it is
      // shown above the chip the pointer is on.
      Dd.g.fillStyle = 'rgba(255,255,255,.35)';
      Dd.g.fillRect(bx + size / 2 - 2, y + size / 2 - 1, 4, 5);
      Dd.g.fillRect(bx + size / 2 - 1, y + size / 2 - 4, 2, 3);
      const over = Dd.mouse.x > bx && Dd.mouse.x < bx + size && Dd.mouse.y > y && Dd.mouse.y < y + size;
      if (over) Dd.text('✦' + list[i].need, bx + size / 2, y - 4, 9, '#ffd166', 'center');
    }
    out.push({ x: bx, y, w: size, h: size, i, locked });
  }
  return out;
}

let chipRows = [];
const home = new Home(D, {
  title: 'HOPPER',
  lines: ['hold the button to jump higher, tap it to hop',
          'press down to dive and land early',
          'coins over the gaps unlock what you can wear'],
  board,
  buttons: [{ label: 'RUN', sub: 'the city does not stop', fn: () => { started = true; reset(); } }],
  hint: 'SPACE or CLICK to jump · DOWN to dive · P pause',
  panel: {
    draw: (Dd, x, y, w) => {
      Dd.text('YOUR RUNNER', x, y + 12, 10, '#5a6577');
      Dd.text('✦ ' + coinsEver + ' collected', x + w - 4, y + 12, 10, '#ffd166', 'right');
      chipRows = [];
      Dd.text('CAP', x, y + 34, 9, '#8b96a8');
      chipRows.push({ key: 'cap', boxes: chips(Dd, CAPS, kit.cap, x + 42, y + 24, 14) });
      Dd.text('JACKET', x, y + 60, 9, '#8b96a8');
      chipRows.push({ key: 'jacket', boxes: chips(Dd, JACKETS, kit.jacket, x + 42, y + 50, 14, (j) => j.col) });
      Dd.text('LEGS', x, y + 86, 9, '#8b96a8');
      chipRows.push({ key: 'legs', boxes: chips(Dd, LEGS, kit.legs, x + 42, y + 76, 14) });
      // and him, wearing it, drawn at four times the size
      const sx = x + w - 52, sy = y + 30;
      Dd.g.imageSmoothingEnabled = false;
      const prev = document.createElement('canvas');
      prev.width = 20; prev.height = 24;
      const pg = prev.getContext('2d');
      const oldB = b.canvas;                       // draw the runner into the preview
      drawRunnerInto(pg, 10, 16);
      Dd.g.drawImage(prev, 0, 0, 20, 24, sx, sy, 60, 72);
      return 112;
    },
    click: (Dd) => {
      for (const row of chipRows) {
        for (const bx of row.boxes) {
          if (Dd.mouse.x > bx.x && Dd.mouse.x < bx.x + bx.w &&
              Dd.mouse.y > bx.y && Dd.mouse.y < bx.y + bx.h) {
            if (bx.locked) { Dd.noise(0.12, 0.05, 400); return; }
            kit[row.key] = bx.i; save('kit', kit);
            Dd.beep(620, 0.06, 'triangle', 0.05, 160);
            return;
          }
        }
      }
    },
  },
});

/** the same runner, drawn into any context - used by the wardrobe preview */
function drawRunnerInto(g2, x, y) {
  const J = JACKETS[kit.jacket] || JACKETS[0];
  const legCol = LEGS[kit.legs] || LEGS[0];
  const cap = CAPS[kit.cap] || CAPS[0];
  const P2 = (a, c, w, h, col) => { g2.fillStyle = col; g2.fillRect(a, c, w, h); };
  P2(x - 4, y + 6, 3, 5, legCol); P2(x + 1, y + 6, 3, 5, legCol);
  P2(x - 4, y - 2, 8, 8, J.col);
  P2(x - 4, y + 3, 8, 1, J.lo);
  P2(x + 4, y, 2, 4, '#f0c49a');
  P2(x - 3, y - 8, 6, 6, '#f0c49a');
  P2(x - 4, y - 10, 8, 2, cap);
  P2(x - 6, y - 9, 9, 1, cap);
  P2(x + 1, y - 6, 1, 1, C.ink);
}

reset(); started = false;

if (D.shot) {
  started = true; dist = 428; speed = 340; got = 12;
  p.y = 58; p.vy = -120; p.onGround = false;
  hazards.push({ x: 150, y: roofs[1] ? roofs[1].y : 92, kind: 'sign' });
  coins.push({ x: 96, y: 52, got: false, spin: 1 }, { x: 112, y: 48, got: false, spin: 2 });
}

D.run(step);
