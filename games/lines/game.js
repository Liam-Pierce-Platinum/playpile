// =====================================================================
// LINES - seven shapes, ten columns, and gravity
// =====================================================================
//
// The falling-block game. Everyone knows it, which means the only thing
// that matters is whether the FEEL is right, and the feel of this genre
// lives in four details that are invisible until they are missing:
//
//   LOCK DELAY. A piece that lands does not freeze instantly - it gets
//   half a second in which it can still be slid or spun, and any move
//   that succeeds resets that clock (fifteen times, then it sets
//   regardless, or you could stall for ever). This is the single biggest
//   difference between a version that feels modern and one that feels
//   like 1989. Without it, every fast drop is a commitment.
//
//   A BAG, NOT A DICE. The next piece is drawn from a shuffled bag of all
//   seven, refilled when empty. True random gives you four S-pieces in a
//   row and a drought of the long one, which reads as the game cheating.
//   With a bag the longest possible wait is twelve pieces and the game is
//   fair in a way you can feel without being able to name.
//
//   KICKS. A rotation that would overlap something is retried a few cells
//   to the side and up before being refused, so spinning against a wall
//   or into a notch works instead of silently doing nothing.
//
//   A GHOST. The outline showing where it will land. It removes counting
//   without removing decisions.
//
// Scoring is the standard one: more for more lines at once, doubled for a
// back-to-back four, and a combo for clearing on consecutive pieces.
import { Deck, clamp } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const COLS = 10, ROWS = 20, CELL = 28;
const TOP = 30;
const PANE = 150;                      // the side panel: hold and next
const D = new Deck({ key: 'lines', w: COLS * CELL + PANE, h: TOP + ROWS * CELL, bg: '#0a0e14' });

const OX = 0, OY = TOP;                // where the well starts

// The seven, each as its rotations. Written as coordinate lists rather
// than as matrices because the kick table below works on cells.
const SHAPES = {
  I: { col: '#4ec3d9', cells: [[[0,1],[1,1],[2,1],[3,1]], [[2,0],[2,1],[2,2],[2,3]],
                               [[0,2],[1,2],[2,2],[3,2]], [[1,0],[1,1],[1,2],[1,3]]] },
  J: { col: '#4f7fd4', cells: [[[0,0],[0,1],[1,1],[2,1]], [[1,0],[2,0],[1,1],[1,2]],
                               [[0,1],[1,1],[2,1],[2,2]], [[1,0],[1,1],[0,2],[1,2]]] },
  L: { col: '#e08a3c', cells: [[[2,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[1,2],[2,2]],
                               [[0,1],[1,1],[2,1],[0,2]], [[0,0],[1,0],[1,1],[1,2]]] },
  O: { col: '#e8c34a', cells: [[[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]],
                               [[1,0],[2,0],[1,1],[2,1]], [[1,0],[2,0],[1,1],[2,1]]] },
  S: { col: '#6fc76f', cells: [[[1,0],[2,0],[0,1],[1,1]], [[1,0],[1,1],[2,1],[2,2]],
                               [[1,1],[2,1],[0,2],[1,2]], [[0,0],[0,1],[1,1],[1,2]]] },
  T: { col: '#a56fd4', cells: [[[1,0],[0,1],[1,1],[2,1]], [[1,0],[1,1],[2,1],[1,2]],
                               [[0,1],[1,1],[2,1],[1,2]], [[1,0],[0,1],[1,1],[1,2]]] },
  Z: { col: '#d95757', cells: [[[0,0],[1,0],[1,1],[2,1]], [[2,0],[1,1],[2,1],[1,2]],
                               [[0,1],[1,1],[1,2],[2,2]], [[1,0],[0,1],[1,1],[0,2]]] },
};
const NAMES = Object.keys(SHAPES);

// Wall kicks: the offsets tried, in order, when a rotation collides.
// A simplified version of the standard table - enough for the spins that
// matter (against a wall, and into a T-slot) without the whole thing.
const KICKS = [[0,0], [-1,0], [1,0], [0,-1], [-1,-1], [1,-1], [0,-2], [-2,0], [2,0]];

let well, cur, hold, canHold, bag, next, score, lines, level, over, started;
let fallT, lockT, lockMoves, clearing, clearRows, combo, b2b, dead;

function reset() {
  well = Array.from({ length: ROWS }, () => new Array(COLS).fill(null));
  bag = []; next = [];
  for (let i = 0; i < 3; i++) next.push(fromBag());
  hold = null; canHold = true;
  score = 0; lines = 0; level = 1;
  combo = -1; b2b = false;
  over = false; dead = 0;
  clearing = 0; clearRows = [];
  spawn();
}

/** one piece out of a shuffled bag of all seven - see the note at the top */
function fromBag() {
  if (!bag.length) {
    bag = NAMES.slice();
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop();
}

function spawn(name) {
  const n = name || next.shift();
  if (!name) next.push(fromBag());
  cur = { name: n, r: 0, x: 3, y: -1 };
  fallT = 0; lockT = 0; lockMoves = 0;
  // TOP OUT: if the new piece has nowhere to be, the run is over.
  if (hits(cur.x, cur.y, cur.r)) { over = true; dead = D.t; D.noise(0.4, 0.1, 200); }
}

const cellsOf = (p) => SHAPES[p.name].cells[p.r];

/** would the piece overlap the wall, the floor or a settled block? */
function hits(x, y, r) {
  for (const [cx, cy] of SHAPES[cur.name].cells[r]) {
    const gx = x + cx, gy = y + cy;
    if (gx < 0 || gx >= COLS || gy >= ROWS) return true;
    if (gy >= 0 && well[gy][gx]) return true;
  }
  return false;
}

/** a move that worked resets the lock clock - this is what lock delay IS */
function moved() {
  if (lockT > 0 && lockMoves < 15) { lockT = 0; lockMoves++; }
}

function move(dx) {
  if (over || clearing) return;
  if (!hits(cur.x + dx, cur.y, cur.r)) { cur.x += dx; moved(); D.beep(220, 0.02, 'square', 0.02); }
}

function rotate(d) {
  if (over || clearing) return;
  const r = (cur.r + d + 4) % 4;
  for (const [kx, ky] of KICKS) {
    if (!hits(cur.x + kx, cur.y + ky, r)) {
      cur.x += kx; cur.y += ky; cur.r = r;
      moved(); D.beep(420, 0.03, 'square', 0.03);
      return;
    }
  }
}

function softDrop() {
  if (over || clearing) return;
  if (!hits(cur.x, cur.y + 1, cur.r)) { cur.y++; score += 1; fallT = 0; }
}

function hardDrop() {
  if (over || clearing) return;
  let n = 0;
  while (!hits(cur.x, cur.y + 1, cur.r)) { cur.y++; n++; }
  score += n * 2;
  D.beep(140, 0.06, 'square', 0.05, -60);
  settle();
}

function swapHold() {
  if (over || clearing || !canHold) return;
  const was = hold;
  hold = cur.name;
  canHold = false;
  if (was) spawn(was); else spawn();
  D.beep(600, 0.05, 'triangle', 0.04);
}

/** the piece stops being yours and becomes part of the well */
function settle() {
  for (const [cx, cy] of cellsOf(cur)) {
    const gy = cur.y + cy, gx = cur.x + cx;
    if (gy < 0) { over = true; dead = D.t; return; }
    well[gy][gx] = SHAPES[cur.name].col;
  }
  canHold = true;

  // which rows are full?
  clearRows = [];
  for (let y = 0; y < ROWS; y++) if (well[y].every(Boolean)) clearRows.push(y);

  if (clearRows.length) {
    const n = clearRows.length;
    lines += n;
    combo++;
    const base = [0, 100, 300, 500, 800][n] * level;
    // a four, or a four straight after a four, is worth half again
    const isBig = n === 4;
    const bonus = isBig && b2b ? base * 0.5 : 0;
    score += base + bonus + Math.max(0, combo) * 50 * level;
    b2b = isBig;
    level = 1 + Math.floor(lines / 10);
    clearing = 0.28;
    D.beep(n === 4 ? 880 : 520 + n * 90, 0.18, 'triangle', 0.06, n === 4 ? 500 : 200);
    if (n === 4) D.noise(0.2, 0.05, 900);
  } else {
    combo = -1;
    spawn();
  }
}

function finishClear() {
  // drop everything above each cleared row
  for (const y of clearRows.sort((a, b) => a - b)) {
    well.splice(y, 1);
    well.unshift(new Array(COLS).fill(null));
  }
  clearRows = [];
  spawn();
}

// ---- input -----------------------------------------------------------
// Held left/right auto-repeats after a delay, the way it must.
let repeat = { dir: 0, t: 0 };
addEventListener('keydown', (e) => {
  if (!started || e.repeat) return;
  const k = e.key;
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') { move(-1); repeat = { dir: -1, t: -0.17 }; }
  if (k === 'ArrowRight' || k === 'd' || k === 'D') { move(1); repeat = { dir: 1, t: -0.17 }; }
  if (k === 'ArrowUp' || k === 'x' || k === 'X') rotate(1);
  if (k === 'z' || k === 'Z' || k === 'Control') rotate(-1);
  if (k === 'Shift' || k === 'c' || k === 'C') swapHold();
  if (k === ' ') hardDrop();
});
addEventListener('keyup', (e) => {
  const k = e.key;
  if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && repeat.dir === -1) repeat.dir = 0;
  if ((k === 'ArrowRight' || k === 'd' || k === 'D') && repeat.dir === 1) repeat.dir = 0;
});

// ---- drawing ---------------------------------------------------------
function cell(g, x, y, col, ghost) {
  const px = OX + x * CELL, py = OY + y * CELL;
  if (ghost) {
    g.strokeStyle = col; g.globalAlpha = 0.34; g.lineWidth = 2;
    g.strokeRect(px + 2.5, py + 2.5, CELL - 5, CELL - 5);
    g.globalAlpha = 1;
    return;
  }
  g.fillStyle = col;
  g.fillRect(px + 1, py + 1, CELL - 2, CELL - 2);
  g.fillStyle = 'rgba(255,255,255,.22)';
  g.fillRect(px + 1, py + 1, CELL - 2, 3);
  g.fillStyle = 'rgba(0,0,0,.20)';
  g.fillRect(px + 1, py + CELL - 4, CELL - 2, 3);
}

function mini(g, name, x, y, s = 16) {
  if (!name) return;
  const sh = SHAPES[name];
  for (const [cx, cy] of sh.cells[0]) {
    g.fillStyle = sh.col;
    g.fillRect(x + cx * s, y + cy * s, s - 2, s - 2);
    g.fillStyle = 'rgba(255,255,255,.2)';
    g.fillRect(x + cx * s, y + cy * s, s - 2, 2);
  }
}

function draw(g) {
  // the well
  g.fillStyle = '#0d131c';
  g.fillRect(OX, OY, COLS * CELL, ROWS * CELL);
  for (let y = 0; y <= ROWS; y++) {
    g.fillStyle = 'rgba(255,255,255,.035)';
    g.fillRect(OX, OY + y * CELL, COLS * CELL, 1);
  }
  for (let x = 0; x <= COLS; x++) {
    g.fillStyle = 'rgba(255,255,255,.035)';
    g.fillRect(OX + x * CELL, OY, 1, ROWS * CELL);
  }

  // settled blocks
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) if (well[y][x]) cell(g, x, y, well[y][x]);
  }

  // the rows going out
  if (clearing > 0) {
    const f = clearing / 0.28;
    for (const y of clearRows) {
      g.fillStyle = 'rgba(255,255,255,' + (0.15 + f * 0.7).toFixed(3) + ')';
      const w = COLS * CELL * f;
      g.fillRect(OX + (COLS * CELL - w) / 2, OY + y * CELL, w, CELL);
    }
  }

  if (!over && !clearing && cur) {
    // the ghost
    let gy = cur.y;
    while (!hits(cur.x, gy + 1, cur.r)) gy++;
    for (const [cx, cy] of cellsOf(cur)) {
      if (gy + cy >= 0) cell(g, cur.x + cx, gy + cy, SHAPES[cur.name].col, true);
    }
    // the piece
    for (const [cx, cy] of cellsOf(cur)) {
      if (cur.y + cy >= 0) cell(g, cur.x + cx, cur.y + cy, SHAPES[cur.name].col);
    }
  }

  // ---- the side panel ----
  const PX = COLS * CELL + 14;
  g.fillStyle = 'rgba(255,255,255,.03)';
  g.fillRect(COLS * CELL, OY, PANE, ROWS * CELL);

  D.text('HOLD', PX, OY + 26, 11, '#8b96a8');
  g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(PX, OY + 34, 108, 74);
  if (hold) {
    g.globalAlpha = canHold ? 1 : 0.35;
    mini(g, hold, PX + 14, OY + 50);
    g.globalAlpha = 1;
  }

  D.text('NEXT', PX, OY + 142, 11, '#8b96a8');
  for (let i = 0; i < next.length; i++) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(PX, OY + 150 + i * 78, 108, 70);
    mini(g, next[i], PX + 14, OY + 166 + i * 78, i === 0 ? 16 : 13);
  }

  D.text('LINES', PX, OY + 410, 11, '#8b96a8');
  D.text(String(lines), PX, OY + 434, 22, '#e7ecf3');
  D.text('LEVEL', PX, OY + 470, 11, '#8b96a8');
  D.text(String(level), PX, OY + 494, 22, '#ff9f43');
  if (combo > 0) D.text(combo + 'x COMBO', PX, OY + 528, 12, '#7fe08a');
  if (b2b) D.text('BACK TO BACK', PX, OY + 548, 10, '#e8c34a');

  D.hud('SCORE ' + score, 'BEST ' + D.best);
}

// ---- the loop --------------------------------------------------------
function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }

  if (!over) {
    if (clearing > 0) {
      clearing -= dt;
      if (clearing <= 0) { clearing = 0; finishClear(); }
    } else {
      // held left/right auto-repeat
      if (repeat.dir) {
        repeat.t += dt;
        while (repeat.t >= 0.045) { repeat.t -= 0.045; move(repeat.dir); }
      }
      // gravity
      const speed = Math.max(0.045, 0.8 * Math.pow(0.82, level - 1));
      const grounded = hits(cur.x, cur.y + 1, cur.r);
      if (grounded) {
        lockT += dt;
        if (lockT >= 0.5) settle();
      } else {
        lockT = 0; lockMoves = 0;
        fallT += dt;
        while (fallT >= speed && !hits(cur.x, cur.y + 1, cur.r)) { fallT -= speed; cur.y++; }
      }
      if (D.held('ArrowDown', 's', 'S')) softDrop();
    }
  }

  draw(g);

  if (over) {
    D.card('TOPPED OUT', [score + ' points', lines + ' lines   ·   level ' + level],
           'click or SPACE for the board');
    if (D.t - dead > 0.6 && D.tapped()) { home.finish(score, { lines }); started = false; }
  }
}

const board = new Board('lines', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'LINES',
  lines: ['a landed piece still has half a second to be slid or spun',
          'the next piece comes out of a shuffled bag of all seven',
          'four at once is worth double if you did it last time too'],
  board,
  buttons: [{ label: 'PLAY', sub: 'arrows to move · up to spin · space to drop',
              fn: () => { reset(); started = true; } }],
  hint: '← → move · ↑ / X spin · Z spin back · ↓ soft · SPACE drop · SHIFT hold',
});

reset(); started = false;

// the card on the home page: a well with some history and a piece falling
if (D.shot) {
  started = true;
  score = 14800; lines = 37; level = 4;
  const cols = ['#4f7fd4', '#e08a3c', '#6fc76f', '#a56fd4', '#d95757', '#4ec3d9', '#e8c34a'];
  for (let y = ROWS - 6; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (y === ROWS - 6 && x > 5) continue;
      if (x === 8 && y > ROWS - 4) continue;
      well[y][x] = cols[(x + y) % cols.length];
    }
  }
  cur = { name: 'T', r: 0, x: 4, y: 6 };
  next = ['I', 'L', 'S']; hold = 'O';
  combo = 2; b2b = true;
}

D.run(step);
