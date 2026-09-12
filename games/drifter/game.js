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

function reset(full) {
  if (full) { score = 0; wave = 1; lives = 3; }
  ship = { x: D.W / 2, y: D.H / 2, vx: 0, vy: 0, a: -Math.PI / 2, fuel: 100 };
  rocks = []; shots = []; bits = []; over = false; inv = 2.2;
  stars = Array.from({ length: 90 }, () => ({ x: rnd(D.W), y: rnd(D.H), b: rnd(0.15, 0.7) }));
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
  return { x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, size,
           r: size * 15, a: rnd(6.28), spin: rnd(-1.1, 1.1), pts };
}

function wrap(o) {
  if (o.x < -20) o.x += D.W + 40; if (o.x > D.W + 20) o.x -= D.W + 40;
  if (o.y < -20) o.y += D.H + 40; if (o.y > D.H + 20) o.y -= D.H + 40;
}

function step(dt, g) {
  if (!started) {
    draw(g);              // the field keeps drifting behind the home screen
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
  if (D.held('a', 'A', 'ArrowLeft')) ship.a -= 3.4 * dt;
  if (D.held('d', 'D', 'ArrowRight')) ship.a += 3.4 * dt;
  const wantThrust = D.held('w', 'W', 'ArrowUp') || (D.mouse.down && D.mouse.y > D.H * 0.5);
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

  if (D.tapped() && ship.fuel >= SHOT_COST) {
    ship.fuel -= SHOT_COST;
    shots.push({ x: ship.x + Math.cos(ship.a) * 13, y: ship.y + Math.sin(ship.a) * 13,
                 vx: ship.vx + Math.cos(ship.a) * 430, vy: ship.vy + Math.sin(ship.a) * 430, life: 1.15 });
    D.beep(880, 0.05, 'square', 0.04, -500);
  }
  if (D.held('Shift') && ship.fuel > 30) {   // hyperspace, at a price
    ship.fuel -= 30; ship.x = rnd(D.W); ship.y = rnd(D.H); ship.vx = ship.vy = 0;
    inv = 0.8; D.noise(0.2, 0.05, 900);
  }

  // ---- shots and rocks ----------------------------------------------
  for (const s of shots) { s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt; wrap(s); }
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
      for (let k = 0; k < 8; k++) bits.push({ x: r.x, y: r.y, vx: rnd(-120, 120), vy: rnd(-120, 120),
        life: rnd(0.3, 0.7), col: '#8b96a8' });
      if (r.size > 1) for (let k = 0; k < 2; k++) {
        const n = makeRock(r.x, r.y, r.size - 1);
        n.vx += rnd(-40, 40); n.vy += rnd(-40, 40);
        rocks.push(n);
      }
      continue;
    }
    if (inv <= 0 && Math.hypot(ship.x - r.x, ship.y - r.y) < r.r + 8) {
      lives--; inv = 2.4; D.noise(0.5, 0.08, 200);
      for (let k = 0; k < 20; k++) bits.push({ x: ship.x, y: ship.y, vx: rnd(-200, 200), vy: rnd(-200, 200),
        life: rnd(0.4, 1), col: '#ff6b8b' });
      ship.x = D.W / 2; ship.y = D.H / 2; ship.vx = ship.vy = 0; ship.fuel = Math.max(ship.fuel, 55);
      if (lives <= 0) { over = true; D.record(score); }   // the board is written when he leaves the card
    }
  }

  for (const b of bits) { b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
  bits = bits.filter((b) => b.life > 0);

  if (!rocks.length) { wave++; score += 100; ship.fuel = 100; spawnWave();
    D.beep(600, 0.2, 'triangle', 0.05, 400); }

  draw(g);
}

function draw(g) {
  for (const s of stars) { g.fillStyle = 'rgba(200,220,255,' + s.b + ')'; g.fillRect(s.x, s.y, 1.6, 1.6); }

  g.lineWidth = 1.6; g.strokeStyle = '#9fb0c6';
  for (const r of rocks) {
    g.save(); g.translate(r.x, r.y); g.rotate(r.a);
    g.beginPath();
    for (let i = 0; i < r.pts.length; i++) {
      const th = i / r.pts.length * Math.PI * 2, rr = r.r * r.pts[i];
      i ? g.lineTo(Math.cos(th) * rr, Math.sin(th) * rr) : g.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
    }
    g.closePath(); g.stroke(); g.restore();
  }

  for (const b of bits) { g.fillStyle = b.col; g.globalAlpha = clamp(b.life, 0, 1); g.fillRect(b.x, b.y, 2.4, 2.4); }
  g.globalAlpha = 1;
  g.fillStyle = '#fff';
  for (const s of shots) g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3);

  if (ship && (!over) && (inv <= 0 || Math.floor(D.t * 12) % 2)) {
    g.save(); g.translate(ship.x, ship.y); g.rotate(ship.a);
    g.strokeStyle = '#e7ecf3'; g.lineWidth = 1.8;
    g.beginPath(); g.moveTo(14, 0); g.lineTo(-9, 8); g.lineTo(-4, 0); g.lineTo(-9, -8);
    g.closePath(); g.stroke();
    if (ship.thrusting) {
      g.strokeStyle = '#ff9f43'; g.beginPath();
      g.moveTo(-5, 4); g.lineTo(-13 - Math.random() * 7, 0); g.lineTo(-5, -4); g.stroke();
    }
    g.restore();
  }

  // the tank, which is the game
  const fw = 150;
  g.fillStyle = '#131b26'; g.fillRect(D.W - fw - 12, 38, fw, 8);
  g.fillStyle = ship && ship.fuel < 25 ? '#ff6b8b' : '#4dc9ff';
  g.fillRect(D.W - fw - 12, 38, fw * (ship ? ship.fuel / 100 : 0), 8);
  D.text('FUEL', D.W - fw - 20, 46, 10, '#5a6577', 'right');

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
  hint: 'A D turn · W thrust · SPACE fire · SHIFT hyperspace · P pause',
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
