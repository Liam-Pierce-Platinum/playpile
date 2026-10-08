// =====================================================================
// DRIFTER - asteroids, where the gun and the engine share a tank
// =====================================================================
//
// Asteroids is a game about two resources you never think about: your
// position and your ammunition, both of which are infinite. Making them
// ONE FINITE THING changes every decision in it. Shooting a rock is
// still trivial. Shooting every rock, and then having nothing left to
// stop yourself with, is how the game ends - so the question stops being
// "can I hit it" and becomes "is this one worth a shot".
//
// Fuel regenerates, slowly while you are flying and quickly while you
// are still, which is the same trade one more time: the safest thing to
// do is stop moving, and stopping moving in a field of drifting rocks is
// not safe at all.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'drifter', w: 720, h: 540, bg: '#05070c' });
// HARDER, on Liam's note that it was too easy - and specifically harder
// in the direction the game is about. Everything below costs FUEL:
// shooting more, thrusting more, and getting it back more slowly. So the
// tank runs down faster and the choice of whether a rock is worth a shot
// comes round sooner, which is the game. The rocks themselves are also
// quicker and there is one more of them per wave.
const SHOT_COST = 6, THRUST_COST = 12;   // per second, for thrust

let ship, rocks, shots, bits, stars, score, wave, lives, over, started, inv;
let hyperHeld = false;
let rings = [], shake = 0;   // SHIFT is a press, not a hold - see hyperspace below

// ---- TOUCH ----------------------------------------------------------
//
// Turning was keys only, so on a phone the ship pointed one way for
// ever. Every finger counts, so one thumb can turn while the other
// thrusts: the LEFT and RIGHT THIRDS turn, the MIDDLE of the lower half
// thrusts, and a quick TAP anywhere fires. Only a quick tap - the cabinet
// counts every touch as a press, and a finger put down to turn should not
// spend 6 fuel on a shot nobody asked for.
let touchMode = false, fingers = [], touchShots = 0;
const downAt = new Map();
const readFingers = (e) => {
  const r = D.cv.getBoundingClientRect();
  fingers = [...e.touches].map((t) => ({ x: (t.clientX - r.left) / r.width * D.W,
                                         y: (t.clientY - r.top) / r.height * D.H }));
};
D.cv.addEventListener('touchstart', (e) => {
  touchMode = true; readFingers(e);
  for (const t of e.changedTouches) downAt.set(t.identifier, performance.now());
});
D.cv.addEventListener('touchmove', readFingers);
addEventListener('touchend', (e) => {
  readFingers(e);
  for (const t of e.changedTouches) {
    if (performance.now() - (downAt.get(t.identifier) || 0) < 220) touchShots++;
    downAt.delete(t.identifier);
  }
});
addEventListener('touchcancel', (e) => { readFingers(e); downAt.clear(); });
addEventListener('mousedown', () => { touchMode = false; });
addEventListener('keydown', () => { touchMode = false; });
const finger = (f) => fingers.some(f);

function reset(full) {
  if (full) { score = 0; wave = 1; lives = 3; }
  ship = { x: D.W / 2, y: D.H / 2, vx: 0, vy: 0, a: -Math.PI / 2, fuel: 100 };
  rocks = []; shots = []; bits = []; rings = []; over = false; inv = 2.2; touchShots = 0;
  // three depths of star, drifting at three speeds, so space has depth
  // even when the ship is sitting still
  stars = Array.from({ length: 140 }, () => {
    const z = Math.random();
    return { x: rnd(D.W), y: rnd(D.H), z, b: 0.15 + z * 0.6, tw: rnd(6.28) };
  });
  spawnWave();
}

function spawnWave() {
  const n = 4 + Math.min(8, wave);
  for (let i = 0; i < n; i++) {
    // never on top of the ship - a wave that starts inside you is not a
    // wave, it is a death
    let x, y, tries = 0;
    do { x = rnd(D.W); y = rnd(D.H); tries++; }
    while (Math.hypot(x - ship.x, y - ship.y) < 160 && tries < 40);
    rocks.push(makeRock(x, y, 3));
  }
}

function makeRock(x, y, size) {
  const sp = rnd(26, 58) + wave * 4.5;
  const a = rnd(Math.PI * 2);
  // a lumpy outline, made once and kept, so a rock is the same rock as
  // it tumbles rather than boiling
  const pts = [];
  const n = 9 + size * 2;
  for (let i = 0; i < n; i++) pts.push(rnd(0.72, 1.15));
  const craters = Array.from({ length: size + 1 }, () => {
    const th = rnd(6.28), d = rnd(0.1, 0.5);
    return { x: Math.cos(th) * d, y: Math.sin(th) * d, r: rnd(0.12, 0.24) };
  });
  return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size,
           r: size * 15, a: rnd(6.28), spin: rnd(-1.1, 1.1), pts, craters };
}

function wrap(o) {
  if (o.x < -20) o.x += D.W + 40; if (o.x > D.W + 20) o.x -= D.W + 40;
  if (o.y < -20) o.y += D.H + 40; if (o.y > D.H + 20) o.y -= D.H + 40;
}

function step(dt, g) {
  if (!started) {
    // the field keeps drifting behind the home screen (it used to say so
    // here and then sit perfectly still)
    for (const r of rocks) { r.x += r.vx * dt * 0.5; r.y += r.vy * dt * 0.5; r.a += r.spin * dt * 0.5; wrap(r); }
    draw(g);
    home.step(dt);
    return;
  }
  if (over) {
    draw(g);
    D.card('LOST', ['score ' + score, 'wave ' + wave, 'best ' + board.best],
           'click for the home screen');
    if (D.tapped()) { home.finish(score, { wave }); started = false; }
    return;
  }

  // ---- ship ---------------------------------------------------------
  const third = D.W / 3;
  if (D.held('a', 'A', 'ArrowLeft') || finger((f) => f.x < third)) ship.a -= 3.4 * dt;
  if (D.held('d', 'D', 'ArrowRight') || finger((f) => f.x > third * 2)) ship.a += 3.4 * dt;
  const wantThrust = D.held('w', 'W', 'ArrowUp') || (touchMode
    ? finger((f) => f.x >= third && f.x <= third * 2 && f.y > D.H * 0.5)
    : D.mouse.down && D.mouse.y > D.H * 0.5);
  ship.thrusting = wantThrust && ship.fuel > 1;
  if (ship.thrusting) {
    ship.vx += Math.cos(ship.a) * 250 * dt;
    ship.vy += Math.sin(ship.a) * 250 * dt;
    ship.fuel = Math.max(0, ship.fuel - THRUST_COST * dt);
    if (D.frame % 3 === 0) bits.push({ x: ship.x - Math.cos(ship.a) * 12, y: ship.y - Math.sin(ship.a) * 12,
      vx: -Math.cos(ship.a) * 90 + rnd(-30, 30), vy: -Math.sin(ship.a) * 90 + rnd(-30, 30),
      life: 0.4, col: '#ff9f43' });
  }
  const speed = Math.hypot(ship.vx, ship.vy);
  // FUEL BACK: 11/s standing still, about 2.4/s at full tilt.
  ship.fuel = Math.min(100, ship.fuel + (11 - clamp(speed / 20, 0, 8.6)) * dt);
  ship.vx *= (1 - 0.16 * dt); ship.vy *= (1 - 0.16 * dt);
  ship.x += ship.vx * dt; ship.y += ship.vy * dt; wrap(ship);
  if (inv > 0) inv -= dt;

  let fire = D.tapped();
  if (touchMode) { fire = touchShots; }   // the press was the touchstart; the shot is the tap
  touchShots = 0;
  if (fire && ship.fuel >= SHOT_COST) {
    ship.fuel -= SHOT_COST;
    shots.push({ x: ship.x + Math.cos(ship.a) * 13, y: ship.y + Math.sin(ship.a) * 13,
                 vx: ship.vx + Math.cos(ship.a) * 430, vy: ship.vy + Math.sin(ship.a) * 430, life: 1.15 });
    D.beep(880, 0.05, 'square', 0.04, -500);
  }
  // ONCE PER PRESS. Tested as held, it fired again every frame the tank
  // was over 30, and a full tank was gone in three frames.
  const shift = D.held('Shift');
  const hyper = shift && !hyperHeld; hyperHeld = shift;
  if (hyper && ship.fuel > 30) {   // hyperspace, at a price
    ship.fuel -= 30; ship.x = rnd(D.W); ship.y = rnd(D.H); ship.vx = ship.vy = 0;
    inv = 0.8; D.noise(0.2, 0.05, 900);
  }

  // ---- shots and rocks ----------------------------------------------
  for (const s of shots) { s.px = s.x; s.py = s.y; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; wrap(s); }
  shots = shots.filter((s) => s.life > 0);

  for (const r of rocks) { r.x += r.vx * dt; r.y += r.vy * dt; r.a += r.spin * dt; wrap(r); }

  for (let i = rocks.length - 1; i >= 0; i--) {
    const r = rocks[i];
    let hit = -1;
    for (let j = 0; j < shots.length; j++) {
      if (Math.hypot(shots[j].x - r.x, shots[j].y - r.y) < r.r) { hit = j; break; }
    }
    if (hit >= 0) {
      shots.splice(hit, 1); rocks.splice(i, 1);
      score += r.size === 3 ? 20 : r.size === 2 ? 50 : 100;
      D.noise(0.18, 0.05, 400 + r.size * 200);
      for (let k = 0; k < 6 + r.size * 4; k++) bits.push({ x: r.x, y: r.y, vx: rnd(-150, 150), vy: rnd(-150, 150),
        life: rnd(0.3, 0.8), col: ROCK_COL[r.size] });
      rings.push({ x: r.x, y: r.y, t: 0, r: r.r * 1.6, col: ROCK_COL[r.size] });
      shake = Math.max(shake, r.size * 2);
      if (r.size > 1) for (let k = 0; k < 2; k++) {
        const n = makeRock(r.x, r.y, r.size - 1);
        n.vx += rnd(-40, 40); n.vy += rnd(-40, 40);
        rocks.push(n);
      }
      continue;
    }
    if (inv <= 0 && Math.hypot(ship.x - r.x, ship.y - r.y) < r.r + 8) {
      lives--; inv = 2.4; D.noise(0.5, 0.08, 200); shake = 12;
      rings.push({ x: ship.x, y: ship.y, t: 0, r: 70, col: '#ff6b8b' });
      for (let k = 0; k < 20; k++) bits.push({ x: ship.x, y: ship.y, vx: rnd(-200, 200), vy: rnd(-200, 200),
        life: rnd(0.4, 1), col: '#ff6b8b' });
      ship.x = D.W / 2; ship.y = D.H / 2; ship.vx = ship.vy = 0; ship.fuel = Math.max(ship.fuel, 55);
      if (lives <= 0) { over = true; D.record(score); }   // the board is written when he leaves the card
    }
  }

  for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
  for (const q of rings) q.t += dt * 2.4;
  rings = rings.filter((q) => q.t < 1);
  shake *= Math.pow(0.0015, dt);
  if (shake < 0.3) shake = 0;
  bits = bits.filter((b) => b.life > 0);

  if (!rocks.length) { wave++; score += 100; ship.fuel = 100; spawnWave();
    D.beep(600, 0.2, 'triangle', 0.05, 400); }

  draw(g);
}

// ---- THE LOOK (2026-10-07) ------------------------------------------
// It was grey outlines on black - correct Asteroids, and the plainest
// thing on the site. Now it is a vector arcade screen: a nebula painted
// once behind three depths of drifting stars, rocks that are solid with a
// glowing rim and craters, a ship and shots that glow, and a ring and a
// shake when something breaks. Same shapes, same rules, same hitboxes.
const ROCK_COL = { 3: '#7fb2ff', 2: '#b58cff', 1: '#ff8cc8' };
const NEB = (() => {
  const c = document.createElement('canvas'); c.width = D.W; c.height = D.H;
  const x = c.getContext('2d');
  x.fillStyle = '#04060d'; x.fillRect(0, 0, D.W, D.H);
  const blob = (cx, cy, r, col) => {
    const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = gr; x.fillRect(0, 0, D.W, D.H);
  };
  blob(D.W * 0.18, D.H * 0.25, 340, 'rgba(84,40,140,.30)');
  blob(D.W * 0.85, D.H * 0.75, 380, 'rgba(20,90,130,.30)');
  blob(D.W * 0.55, D.H * 0.45, 260, 'rgba(160,50,110,.13)');
  blob(D.W * 0.95, D.H * 0.1, 200, 'rgba(40,70,160,.22)');
  return c;
})();

/** a line drawn twice: wide and faint for the glow, then thin and bright */
function glowLine(g, col, w, path) {
  g.strokeStyle = col; g.globalAlpha = 0.22; g.lineWidth = w * 4; path(); g.stroke();
  g.globalAlpha = 1; g.lineWidth = w; path(); g.stroke();
}

function draw(g) {
  const sx = shake ? rnd(-shake, shake) : 0, sy = shake ? rnd(-shake, shake) : 0;
  g.drawImage(NEB, 0, 0);
  for (const s of stars) {
    s.x -= (4 + s.z * 14) * D.dt;
    if (s.x < 0) s.x += D.W;
    const a = s.b * (0.75 + 0.25 * Math.sin(D.t * 2 + s.tw));
    g.fillStyle = 'rgba(210,225,255,' + a.toFixed(2) + ')';
    const sz = s.z > 0.85 ? 2 : 1.2;
    g.fillRect(s.x, s.y, sz, sz);
  }

  g.save(); g.translate(sx, sy);
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const r of rocks) {
    g.save(); g.translate(r.x, r.y); g.rotate(r.a);
    const outline = () => {
      g.beginPath();
      for (let i = 0; i < r.pts.length; i++) {
        const th = i / r.pts.length * Math.PI * 2, rr = r.r * r.pts[i];
        i ? g.lineTo(Math.cos(th) * rr, Math.sin(th) * rr) : g.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
      g.closePath();
    };
    const gr = g.createRadialGradient(-r.r * 0.35, -r.r * 0.35, 0, 0, 0, r.r * 1.15);
    gr.addColorStop(0, '#2a3048'); gr.addColorStop(1, '#0b0e18');
    outline(); g.fillStyle = gr; g.fill();
    g.lineWidth = 1.2;
    for (const c of r.craters || []) {
      g.beginPath(); g.arc(c.x * r.r, c.y * r.r, c.r * r.r, 0, 6.28);
      g.fillStyle = 'rgba(0,0,0,.28)'; g.fill();
      g.beginPath(); g.arc(c.x * r.r, c.y * r.r, c.r * r.r, 3.6, 5.6);
      g.strokeStyle = 'rgba(160,180,230,.18)'; g.stroke();
    }
    glowLine(g, ROCK_COL[r.size], 1.8, outline);
    g.restore();
  }

  for (const q of rings) {
    g.globalAlpha = 1 - q.t; g.strokeStyle = q.col; g.lineWidth = 2;
    g.beginPath(); g.arc(q.x, q.y, q.r * (0.3 + q.t * 0.9), 0, 6.28); g.stroke();
  }
  g.globalAlpha = 1;
  for (const b of bits) {
    g.fillStyle = b.col; g.globalAlpha = clamp(b.life * 1.6, 0, 1);
    g.fillRect(b.x - 1.4, b.y - 1.4, 2.8, 2.8);
    g.globalAlpha *= 0.25; g.fillRect(b.x - 3, b.y - 3, 6, 6);
  }
  g.globalAlpha = 1;
  for (const s of shots) {
    // a streak back to where it was last frame - unless it just wrapped
    // round the screen, when that would be a line across the whole field
    const wrapped = s.px === undefined || Math.abs(s.px - s.x) > 60 || Math.abs(s.py - s.y) > 60;
    const px = wrapped ? s.x - s.vx * 0.02 : s.px, py = wrapped ? s.y - s.vy * 0.02 : s.py;
    glowLine(g, '#ffe58a', 2.4, () => { g.beginPath(); g.moveTo(px, py); g.lineTo(s.x, s.y); });
    g.fillStyle = '#fff'; g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);
  }

  if (ship && (!over) && (inv <= 0 || Math.floor(D.t * 12) % 2)) {
    g.save(); g.translate(ship.x, ship.y); g.rotate(ship.a);
    if (ship.thrusting) {
      const L = 16 + Math.random() * 10;
      const fl = g.createLinearGradient(-4, 0, -4 - L, 0);
      fl.addColorStop(0, 'rgba(255,240,180,.95)'); fl.addColorStop(0.4, 'rgba(255,150,60,.8)');
      fl.addColorStop(1, 'rgba(255,60,40,0)');
      g.fillStyle = fl;
      g.beginPath(); g.moveTo(-5, 5); g.lineTo(-4 - L, 0); g.lineTo(-5, -5); g.closePath(); g.fill();
    }
    const hull = () => { g.beginPath(); g.moveTo(14, 0); g.lineTo(-9, 8); g.lineTo(-4, 0); g.lineTo(-9, -8); g.closePath(); };
    hull(); g.fillStyle = '#0f2a3a'; g.fill();
    glowLine(g, '#6ff0ff', 1.8, hull);
    g.fillStyle = '#d8fbff'; g.fillRect(3, -1.5, 4, 3);       // the canopy
    g.restore();
  }
  g.restore();

  // the tank, which is the game
  const fw = 150, low = ship && ship.fuel < 25, f = ship ? ship.fuel / 100 : 0;
  g.fillStyle = 'rgba(19,27,38,.85)'; g.fillRect(D.W - fw - 12, 38, fw, 8);
  if (!low || Math.floor(D.t * 4) % 2) {
    g.fillStyle = low ? '#ff6b8b' : '#4dc9ff';
    g.fillRect(D.W - fw - 12, 38, fw * f, 8);
    g.globalAlpha = 0.25; g.fillRect(D.W - fw - 12, 36, fw * f, 12); g.globalAlpha = 1;
  }
  D.text(low ? 'FUEL LOW' : 'FUEL', D.W - fw - 20, 46, 10, low ? '#ff6b8b' : '#7d8aa0', 'right');

  D.hud('SCORE ' + score + '   WAVE ' + wave,
        '▲ '.repeat(Math.max(0, lives)) + '  BEST ' + D.best);
}

const board = new Board('drifter', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'DRIFTER',
  lines: ['the gun and the engine share one tank',
          'shooting is fuel you cannot steer with later',
          'sit still and it fills faster - and sitting still is not safe'],
  board,
  buttons: [{ label: 'FLY', sub: 'three ships, waves until they get you', fn: () => { started = true; reset(true); } }],
  hint: matchMedia('(pointer: coarse)').matches
    ? 'HOLD a side to turn · HOLD bottom middle to thrust · TAP to fire'
    : 'A D turn · W thrust · SPACE fire · SHIFT hyperspace · P pause',
});

reset(true); started = false;

if (D.shot) {
  started = true; score = 3180; wave = 4;
  rocks = [makeRock(150, 140, 3), makeRock(560, 180, 2), makeRock(430, 400, 3), makeRock(120, 420, 1)];
  ship.x = 330; ship.y = 300; ship.a = -0.7; ship.thrusting = true; ship.fuel = 62;
  shots = [{ x: 380, y: 240, vx: 400, vy: -300, life: 1 }, { x: 420, y: 200, vx: 400, vy: -300, life: 1 }];
  inv = 0;
}

D.run(step);
