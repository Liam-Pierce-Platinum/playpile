// =====================================================================
// SNAKE - the one everybody has already played, with the one rule that
//         makes it worth playing again
// =====================================================================
//
// Straight Snake is solved. You learn to fold it into a boustrophedon and
// then it is not a game any more, it is a chore with a timer. So the
// board fights back: EVERY FIFTH APPLE LEAVES A BLOCK WHERE IT WAS EATEN.
//
// That one line changes the whole shape of it. The neat fold stops being
// safe, because the lane you were going to come back down now has a wall
// in it, and the board you are playing on at apple forty is a board you
// built yourself out of forty decisions. It also means the difficulty is
// emergent rather than a speed slider - it gets harder because of where
// you chose to eat, not because a number went up.
//
// The golden apple is the other half: worth five, but it rots, and the
// route to it is usually the route you would not otherwise take.
//
// TURNS ARE QUEUED, NOT APPLIED. At nine cells a second a human presses
// left-then-up inside one frame all the time, and a game that reads the
// key directly throws the first one away and you die facing the wrong
// way. Two are buffered, which is what makes it feel fair at speed.
import { Deck, clamp } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const CELL = 24;
const COLS = 25, ROWS = 23;
const TOP = 30;                             // the HUD bar
const D = new Deck({ key: 'snake', w: COLS * CELL, h: TOP + ROWS * CELL, bg: '#0a0e14' });

const GOLD_EVERY = 7;                       // apples between golden ones
const BLOCK_EVERY = 5;                      // apples between wall blocks
const GOLD_LIFE = 7.0;                      // seconds before it rots

let snake, dir, queue, food, gold, blocks, score, eaten, over, started;
let stepT, stepEvery, grow, dead;

function reset() {
  snake = [];
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  for (let i = 3; i >= 0; i--) snake.push({ x: cx - i, y: cy });
  dir = { x: 1, y: 0 };
  queue = [];
  blocks = [];
  score = 0; eaten = 0; grow = 0;
  over = false; dead = 0;
  stepT = 0; stepEvery = 0.135;
  gold = null;
  food = spawn();
}

/** a free cell, not under the snake, a block, or the other apple */
function spawn() {
  const free = [];
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (snake.some((s) => s.x === x && s.y === y)) continue;
      if (blocks.some((b) => b.x === x && b.y === y)) continue;
      if (gold && gold.x === x && gold.y === y) continue;
      free.push({ x, y });
    }
  }
  // A FULL BOARD IS A WIN, NOT A CRASH. It is nearly unreachable, but
  // "nearly" is not "never" and spawn() returning undefined would throw
  // inside the draw loop rather than ending the run.
  if (!free.length) { over = true; return { x: 0, y: 0 }; }
  return free[Math.floor(Math.random() * free.length)];
}

// ---- input ----------------------------------------------------------
// Queued, up to two deep. See the note at the top.
function turn(x, y) {
  const last = queue.length ? queue[queue.length - 1] : dir;
  if (last.x === -x && last.y === -y) return;     // no reversing into yourself
  if (last.x === x && last.y === y) return;       // already going that way
  if (queue.length < 2) queue.push({ x, y });
}
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') turn(0, -1);
  if (k === 'ArrowDown' || k === 's' || k === 'S') turn(0, 1);
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') turn(-1, 0);
  if (k === 'ArrowRight' || k === 'd' || k === 'D') turn(1, 0);
});
// swipe, for a phone
let touch = null;
addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; });
addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.hypot(dx, dy) < 24) return;
  if (Math.abs(dx) > Math.abs(dy)) turn(Math.sign(dx), 0); else turn(0, Math.sign(dy));
  touch = null;
});

// ---- one move of the snake ------------------------------------------
function advance() {
  if (queue.length) dir = queue.shift();
  const head = snake[snake.length - 1];
  const nx = head.x + dir.x, ny = head.y + dir.y;

  // the walls
  if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) return die();
  if (blocks.some((b) => b.x === nx && b.y === ny)) return die();
  // ITS OWN TAIL - but the LAST cell is leaving this move unless we are
  // growing, so following your own tail round a corner is legal, which is
  // how it works in every good version of this.
  const body = grow > 0 ? snake : snake.slice(1);
  if (body.some((s) => s.x === nx && s.y === ny)) return die();

  snake.push({ x: nx, y: ny });
  if (grow > 0) grow--; else snake.shift();

  // eating
  if (nx === food.x && ny === food.y) {
    eaten++;
    score += 10;
    grow += 2;
    D.beep(520 + Math.min(600, eaten * 12), 0.05, 'square', 0.05, 180);
    // THE BLOCK GOES WHERE THE APPLE WAS. That is the whole design: the
    // board is a record of where you have been greedy.
    if (eaten % BLOCK_EVERY === 0) blocks.push({ x: nx, y: ny, born: D.t });
    if (eaten % GOLD_EVERY === 0 && !gold) gold = { ...spawn(), born: D.t };
    food = spawn();
    stepEvery = Math.max(0.062, 0.135 - eaten * 0.0022);
  } else if (gold && nx === gold.x && ny === gold.y) {
    score += 50; grow += 3; gold = null;
    D.beep(880, 0.16, 'triangle', 0.07, 420);
  }
}

function die() {
  over = true; dead = D.t;
  D.noise(0.3, 0.09, 260);
  D.beep(180, 0.4, 'saw', 0.05, -120);
}

// ---- drawing ---------------------------------------------------------
const px = (c) => c * CELL;
const py = (c) => TOP + c * CELL;

function draw(g) {
  // the board, faintly checked so the grid reads without being loud
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if ((x + y) % 2) continue;
      g.fillStyle = 'rgba(255,255,255,.017)';
      g.fillRect(px(x), py(y), CELL, CELL);
    }
  }

  // the blocks you built
  for (const b of blocks) {
    const age = clamp((D.t - b.born) * 3, 0, 1);
    g.fillStyle = '#3b4658';
    const s = CELL * (0.55 + 0.45 * age);
    const o = (CELL - s) / 2;
    g.fillRect(px(b.x) + o, py(b.y) + o, s, s);
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.fillRect(px(b.x) + o, py(b.y) + o, s, 3);
  }

  // the apple
  const pulse = 1 + Math.sin(D.t * 6) * 0.06;
  g.fillStyle = '#e0503f';
  circle(g, px(food.x) + CELL / 2, py(food.y) + CELL / 2, CELL * 0.33 * pulse);
  g.fillStyle = '#5c8a3a';
  g.fillRect(px(food.x) + CELL / 2 - 1, py(food.y) + CELL * 0.18, 3, 5);

  // the golden one, which is running out
  if (gold) {
    const left = 1 - (D.t - gold.born) / GOLD_LIFE;
    g.fillStyle = left < 0.3 && Math.floor(D.t * 8) % 2 ? '#6b5a20' : '#e8c34a';
    circle(g, px(gold.x) + CELL / 2, py(gold.y) + CELL / 2, CELL * 0.35 * pulse);
    // the timer ring
    g.strokeStyle = '#e8c34a'; g.lineWidth = 2;
    g.beginPath();
    g.arc(px(gold.x) + CELL / 2, py(gold.y) + CELL / 2, CELL * 0.46,
          -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, left));
    g.stroke();
  }

  // the snake, drawn back to front so the head sits on top
  for (let i = 0; i < snake.length; i++) {
    const s = snake[i];
    const t = i / Math.max(1, snake.length - 1);
    const head = i === snake.length - 1;
    g.fillStyle = head ? '#7fe08a' : `hsl(${138 - t * 16} 42% ${28 + t * 20}%)`;
    const m = head ? 1 : 2;
    g.beginPath();
    if (g.roundRect) g.roundRect(px(s.x) + m, py(s.y) + m, CELL - m * 2, CELL - m * 2, head ? 7 : 5);
    else g.rect(px(s.x) + m, py(s.y) + m, CELL - m * 2, CELL - m * 2);
    g.fill();
    if (head) {
      // eyes, looking the way it is going
      g.fillStyle = '#0a0e14';
      const ex = dir.x * 4, ey = dir.y * 4;
      const nx2 = -dir.y * 4, ny2 = dir.x * 4;
      const cx = px(s.x) + CELL / 2, cy = py(s.y) + CELL / 2;
      circle(g, cx + ex + nx2, cy + ey + ny2, 2.2);
      circle(g, cx + ex - nx2, cy + ey - ny2, 2.2);
    }
  }

  D.hud('SCORE ' + score + '   LEN ' + snake.length,
        'BLOCKS ' + blocks.length + '   BEST ' + D.best);
}

function circle(g, x, y, r) { g.beginPath(); g.arc(x, y, r, 0, 7); g.fill(); }

// ---- the loop --------------------------------------------------------
function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }

  if (!over) {
    if (gold && D.t - gold.born > GOLD_LIFE) gold = null;
    stepT += dt;
    while (stepT >= stepEvery) { stepT -= stepEvery; if (!over) advance(); }
  }

  draw(g);

  if (over) {
    D.card('CAUGHT', [
      score + ' points   ·   ' + eaten + ' apples',
      'you left ' + blocks.length + ' blocks on the board',
    ], 'click or SPACE for the board');
    if (D.t - dead > 0.6 && D.tapped()) { home.finish(score, { len: snake.length }); started = false; }
  }
}

const board = new Board('snake', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'SNAKE',
  lines: ['every fifth apple leaves a block where you ate it',
          'so the board you are playing is one you built',
          'the golden one is worth five, and it rots'],
  board,
  buttons: [{ label: 'PLAY', sub: 'arrows or W A S D · swipe on a phone',
              fn: () => { reset(); started = true; } }],
  hint: 'ARROWS or W A S D to turn · P pause · R restart · F fullscreen',
});

reset(); started = false;

// the card on the home page: mid-run, with a board that has some history
if (D.shot) {
  started = true;
  eaten = 17; score = 260;
  blocks = [{ x: 6, y: 5, born: -9 }, { x: 14, y: 9, born: -9 }, { x: 9, y: 15, born: -9 }];
  snake = [];
  for (let i = 0; i < 14; i++) snake.push({ x: 4 + i, y: 11 });
  for (let i = 1; i < 5; i++) snake.push({ x: 17, y: 11 - i });
  dir = { x: 0, y: -1 };
  food = { x: 20, y: 4 };
  gold = { x: 11, y: 18, born: D.t - 2 };
  // AND FREEZE IT. The card is a still, and a snake that keeps moving for
  // the 900 ms before the shutter opens runs into the wall it was pointed
  // at and gets photographed on its own game-over card - which is exactly
  // what happened. Posing the board and then stopping the clock is the
  // only version of this that cannot be got wrong by timing.
  stepEvery = 1e9;
}

D.run(step);
