// =====================================================================
// RALLY - the oldest one there is, played properly
// =====================================================================
//
// Two bats and a ball. The entire game is in one decision the original
// made and most copies get wrong: WHERE THE BALL HITS THE BAT DECIDES
// WHERE IT GOES. Hit it with the middle and it comes straight back; hit
// it with the end and it leaves at an angle. That is the whole skill, and
// without it a rally is just two rectangles waiting for a rounding error.
//
// Three things on top, all of them from the arcade originals:
//
//   THE BALL SPEEDS UP THROUGH A RALLY and resets on a point, so a long
//   exchange gets genuinely frightening and the pressure is self-made.
//
//   THE BAT CARRIES THE BALL WITH IT. Moving as you make contact adds
//   some of your own speed to the ball sideways - a cut shot. It means a
//   good player can do things a stationary one cannot.
//
//   THE COMPUTER IS NOT PERFECT ON PURPOSE. It tracks the ball with a
//   reaction delay and a deliberate aim error, both of which shrink as
//   the difficulty rises. A bat that simply matches the ball's Y is
//   unbeatable and no fun; this one can be wrong-footed by a hard angle,
//   which is the point of having angles.
import { Deck, clamp } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'rally', w: 760, h: 480, bg: '#0a0e14' });
const TOP = 30;
const FLOOR = TOP, CEIL = D.H;
const BAT_H = 78, BAT_W = 11, BAT_X = 26;
const WIN = 11;

let L, R, ball, over, started, twoPlayer, diff, msg, msgT, rally, serveT;

const newBat = (x) => ({ x, y: (FLOOR + CEIL) / 2 - BAT_H / 2, vy: 0, score: 0 });

function reset(two, level) {
  twoPlayer = two; diff = level;
  L = newBat(BAT_X);
  R = newBat(D.W - BAT_X - BAT_W);
  over = false; msg = ''; msgT = 0;
  serve(Math.random() < 0.5 ? -1 : 1);
}

function serve(dir) {
  rally = 0;
  serveT = 0.9;
  ball = {
    x: D.W / 2, y: (FLOOR + CEIL) / 2,
    vx: dir * 300, vy: (Math.random() * 2 - 1) * 110, r: 7,
  };
}

/** speed grows with the rally, so a long exchange gets dangerous */
const speedOf = () => 300 + Math.min(340, rally * 17) + diff * 30;

function point(who) {
  if (who === 'L') L.score++; else R.score++;
  D.beep(who === 'L' ? 660 : 300, 0.2, 'triangle', 0.06, who === 'L' ? 200 : -120);
  if (L.score >= WIN || R.score >= WIN) {
    over = true;
    msg = L.score > R.score ? 'YOU WIN' : (twoPlayer ? 'RIGHT WINS' : 'YOU LOSE');
    msgT = 99;
  } else {
    serve(who === 'L' ? 1 : -1);
  }
}

// ---- the computer ----------------------------------------------------
//
// It aims at where the ball WILL be, not where it is, but with a
// reaction delay and an error that both come down as the difficulty goes
// up. The error is re-rolled once per incoming ball rather than every
// frame, or it would just jitter and average out to perfect.
let aiAim = 0, aiSeen = 0, aiLast = 0;

function think(dt) {
  const react = [0.26, 0.16, 0.085][diff];
  const err = [70, 42, 16][diff];
  const speed = [420, 560, 760][diff];

  if (ball.vx > 0) {
    // re-roll the target when the ball turns towards it
    if (aiLast <= 0) { aiSeen = 0; aiAim = predict() + (Math.random() * 2 - 1) * err; }
    aiLast = 1;
    aiSeen += dt;
    if (aiSeen >= react) {
      const want = aiAim - BAT_H / 2;
      const d = clamp(want - R.y, -speed * dt, speed * dt);
      R.vy = d / dt; R.y += d;
    } else R.vy = 0;
  } else {
    aiLast = 0;
    // drift back to the middle between rallies
    const want = (FLOOR + CEIL) / 2 - BAT_H / 2;
    const d = clamp(want - R.y, -speed * 0.35 * dt, speed * 0.35 * dt);
    R.vy = d / dt; R.y += d;
  }
  R.y = clamp(R.y, FLOOR, CEIL - BAT_H);
}

/** where the ball will cross the right-hand bat, bounces included */
function predict() {
  let x = ball.x, y = ball.y, vx = ball.vx, vy = ball.vy;
  let guard = 0;
  while (x < R.x && guard++ < 400) {
    const tx = (R.x - x) / vx;
    const ty = vy > 0 ? (CEIL - ball.r - y) / vy : (FLOOR + ball.r - y) / vy;
    if (vy !== 0 && ty < tx) { x += vx * ty; y += vy * ty; vy = -vy; }
    else { y += vy * tx; break; }
  }
  return clamp(y, FLOOR + 10, CEIL - 10);
}

// ---- physics ---------------------------------------------------------
function hit(bat, side) {
  // WHERE on the bat, from -1 at the top to +1 at the bottom
  const rel = clamp(((ball.y - bat.y) / BAT_H) * 2 - 1, -1, 1);
  const angle = rel * 0.92;                    // up to ~53 degrees
  rally++;
  const s = speedOf();
  ball.vx = side * Math.cos(angle) * s;
  ball.vy = Math.sin(angle) * s + bat.vy * 0.22;   // the bat carries it
  ball.x = side > 0 ? bat.x + BAT_W + ball.r : bat.x - ball.r;
  D.beep(300 + Math.abs(rel) * 320, 0.035, 'square', 0.05);
}

function physics(dt) {
  if (serveT > 0) { serveT -= dt; return; }
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  if (ball.y - ball.r < FLOOR) { ball.y = FLOOR + ball.r; ball.vy = Math.abs(ball.vy); D.beep(500, 0.02, 'square', 0.03); }
  if (ball.y + ball.r > CEIL) { ball.y = CEIL - ball.r; ball.vy = -Math.abs(ball.vy); D.beep(500, 0.02, 'square', 0.03); }

  if (ball.vx < 0 && ball.x - ball.r <= L.x + BAT_W && ball.x > L.x
      && ball.y > L.y - ball.r && ball.y < L.y + BAT_H + ball.r) hit(L, 1);
  if (ball.vx > 0 && ball.x + ball.r >= R.x && ball.x < R.x + BAT_W
      && ball.y > R.y - ball.r && ball.y < R.y + BAT_H + ball.r) hit(R, -1);

  if (ball.x < -30) point('R');
  if (ball.x > D.W + 30) point('L');
}

// ---- drawing ---------------------------------------------------------
function draw(g) {
  // the net
  for (let y = FLOOR + 8; y < CEIL - 8; y += 22) {
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(D.W / 2 - 2, y, 4, 12);
  }

  for (const [b, col] of [[L, '#6fd4e0'], [R, twoPlayer ? '#e08a3c' : '#d95757']]) {
    g.fillStyle = col;
    g.beginPath();
    if (g.roundRect) g.roundRect(b.x, b.y, BAT_W, BAT_H, 5); else g.rect(b.x, b.y, BAT_W, BAT_H);
    g.fill();
  }

  if (serveT > 0) {
    // a countdown that also tells you which way it is going
    g.globalAlpha = 0.35 + Math.sin(D.t * 14) * 0.2;
  }
  g.fillStyle = '#fff';
  g.beginPath(); g.arc(ball.x, ball.y, ball.r, 0, 7); g.fill();
  g.globalAlpha = 1;

  // the score, big, behind everything
  D.text(String(L.score), D.W / 2 - 60, FLOOR + 76, 54, 'rgba(255,255,255,.13)', 'right');
  D.text(String(R.score), D.W / 2 + 60, FLOOR + 76, 54, 'rgba(255,255,255,.13)', 'left');

  D.hud((twoPlayer ? 'W S' : 'YOU') + '  ' + L.score + ' — ' + R.score + '  '
        + (twoPlayer ? '↑ ↓' : ['EASY', 'FAIR', 'HARD'][diff]),
        'RALLY ' + rally + '   FIRST TO ' + WIN);

  if (msgT > 0) {
    D.text(msg, D.W / 2, D.H / 2, 30, '#ff9f43', 'center');
  }
}

// ---- the loop --------------------------------------------------------
function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }

  if (!over) {
    // player one: W/S, or the mouse if it moved last
    const sp = 620;
    let v = 0;
    if (D.held('w', 'W', 'ArrowUp') && !twoPlayer) v -= 1;
    if (D.held('s', 'S', 'ArrowDown') && !twoPlayer) v += 1;
    if (twoPlayer) { if (D.held('w', 'W')) v -= 1; if (D.held('s', 'S')) v += 1; }
    if (v) { const d = v * sp * dt; L.vy = v * sp; L.y = clamp(L.y + d, FLOOR, CEIL - BAT_H); }
    else if (Math.abs(D.mouse.dy) > 0.01 || D.mouse.down) {
      const want = clamp(D.mouse.y - BAT_H / 2, FLOOR, CEIL - BAT_H);
      L.vy = (want - L.y) / Math.max(dt, 0.001);
      L.y = want;
    } else L.vy = 0;

    if (twoPlayer) {
      let v2 = 0;
      if (D.held('ArrowUp')) v2 -= 1;
      if (D.held('ArrowDown')) v2 += 1;
      R.vy = v2 * sp;
      R.y = clamp(R.y + v2 * sp * dt, FLOOR, CEIL - BAT_H);
    } else think(dt);

    physics(dt);
    if (msgT > 0 && msgT < 90) msgT -= dt;
  }

  draw(g);

  if (over) {
    D.card(msg, [L.score + ' — ' + R.score,
                 twoPlayer ? 'two players' : ['easy', 'fair', 'hard'][diff]],
           'click or SPACE for the board');
    if (D.tapped()) {
      // only a one-player win goes on the board, and the score is the
      // margin: 11-2 is a better result than 11-9 and should read as one
      home.finish(twoPlayer ? null : (L.score > R.score ? (L.score - R.score) * 10 + diff * 40 : null),
                  { diff: ['easy', 'fair', 'hard'][diff] });
      started = false;
    }
  }
}

const board = new Board('rally', { unit: 'MARGIN' });
const home = new Home(D, {
  title: 'RALLY',
  lines: ['where the ball hits the bat decides the angle it leaves at',
          'move as you hit it and you cut it sideways',
          'the ball gets faster the longer the rally goes on'],
  board,
  buttons: [
    { label: 'EASY', sub: 'he is slow to react', fn: () => { reset(false, 0); started = true; } },
    { label: 'FAIR', sub: 'a real game', fn: () => { reset(false, 1); started = true; } },
    { label: 'HARD', sub: 'he barely misses', fn: () => { reset(false, 2); started = true; } },
    { label: 'TWO PLAYERS', sub: 'W S against the arrow keys', fn: () => { reset(true, 1); started = true; } },
  ],
  hint: 'W S or the MOUSE · arrows for player two · P pause · R restart',
});

reset(false, 1); started = false;

if (D.shot) {
  started = true;
  L.score = 7; R.score = 5; rally = 14;
  L.y = 210; R.y = 120;
  // slow and central, so it is still in open play when the shutter opens
  // rather than having been scored past somebody
  ball = { x: 392, y: 250, vx: -210, vy: -120, r: 7 };
  serveT = 0;
}

D.run(step);
