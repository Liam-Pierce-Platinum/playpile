// =====================================================================
// SWEEP - minesweeper on a clock, at the size and difficulty you pick
// =====================================================================
//
// Liam: *"better graphics on sweeper much harder and make it so
// difficulty and level size can be selected"*.
//
// SIZE AND DIFFICULTY ARE NOW YOURS. Four of each, chosen on the way in
// and remembered between runs, and they are genuinely different games:
// a BRUTAL board is 26% mines, which is over the density where logic
// alone always gets you home, and the clock is short enough that being
// certain costs more than it is worth.
//
//       SMALL 7x7    TINY 9x9     LARGE 12x10   HUGE 16x12
//       EASY 11%     NORMAL 16%   HARD 21%      BRUTAL 26%
//
// Everything else about the run is unchanged and is why this is not just
// minesweeper: the boards come one after another, the clock carries the
// pressure, and your score is how deep you got.
//
// Two rules that stay, because without them the difficulty is fake:
//   THE FIRST CLICK IS ALWAYS SAFE, and so are its eight neighbours. A
//   26% board where click one can kill you is a coin toss, not a game.
//   CLICKING A SATISFIED NUMBER CLEARS AROUND IT. At this speed, being
//   made to click every known-empty square by hand is the difficulty.
//
// The look: every tile is a real bevel - lit top-left, shadowed
// bottom-right, and pressed tiles invert that - which is the whole reason
// the original reads as a grid of BUTTONS. Numbers have the classic
// colours because everybody already knows them.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board, playerName } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'sweep', w: 560, h: 660, bg: '#151a21' });

const SIZES = [
  { name: 'SMALL', cols: 7, rows: 7 },
  { name: 'TINY',  cols: 9, rows: 9 },
  { name: 'LARGE', cols: 12, rows: 10 },
  { name: 'HUGE',  cols: 16, rows: 12 },
];
const LEVELS = [
  { name: 'EASY',   density: 0.11, time: 1.35 },
  { name: 'NORMAL', density: 0.16, time: 1.00 },
  { name: 'HARD',   density: 0.21, time: 0.80 },
  { name: 'BRUTAL', density: 0.26, time: 0.66 },
];

let sizeI = 1, levelI = 1;
try {
  sizeI = clamp(+localStorage.getItem('pd.sweep.size') || 1, 0, 3);
  levelI = clamp(+localStorage.getItem('pd.sweep.level') || 1, 0, 3);
} catch (e) {}

let cols, rows, mines, cell, ox, oy, board, first, boardNo, score, left, time, over, started, menu, boom;
let elapsed = 0, lastRecord = '', recordT = 0;

function reset(keepScore) {
  if (!keepScore) { score = 0; boardNo = 1; }
  const S = SIZES[sizeI], L = LEVELS[levelI];
  // the board grows as the run goes on, on top of whatever size was chosen
  cols = Math.min(20, S.cols + Math.floor((boardNo - 1) / 2));
  rows = Math.min(14, S.rows + Math.floor((boardNo - 1) / 3));
  mines = Math.round(cols * rows * (L.density + (boardNo - 1) * 0.004));
  cell = Math.min(Math.floor(500 / cols), Math.floor(430 / rows), 46);
  ox = (D.W - cols * cell) / 2; oy = 150;
  board = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({
    mine: false, open: false, flag: false, n: 0, pop: 0,
  })));
  first = true; over = false; boom = null; elapsed = 0;
  left = mines;
  time = (16 + cols * rows * 0.5) * L.time;
}

function lay(sx, sy) {
  let placed = 0, guard = 0;
  while (placed < mines && guard++ < 20000) {
    const x = Math.floor(rnd(0, cols)), y = Math.floor(rnd(0, rows));
    if (board[y][x].mine) continue;
    if (Math.abs(x - sx) <= 1 && Math.abs(y - sy) <= 1) continue;
    board[y][x].mine = true; placed++;
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const a = x + dx, b = y + dy;
      if (a >= 0 && b >= 0 && a < cols && b < rows && board[b][a].mine) n++;
    }
    board[y][x].n = n;
  }
}

function open(x, y) {
  if (x < 0 || y < 0 || x >= cols || y >= rows) return;
  const c = board[y][x];
  if (c.open || c.flag) return;
  if (first) { lay(x, y); first = false; }
  c.open = true; c.pop = 1;
  if (c.mine) { over = true; boom = { x, y }; D.record(score); D.noise(0.6, 0.09, 180); return; }
  score += 2;
  D.beep(400 + c.n * 45, 0.03, 'square', 0.028);
  if (c.n === 0) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (dx || dy) open(x + dx, y + dy);
  check();
}

function chord(x, y) {
  const c = board[y][x];
  if (!c.open || !c.n) return;
  let f = 0;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const a = x + dx, b = y + dy;
    if (a >= 0 && b >= 0 && a < cols && b < rows && board[b][a].flag) f++;
  }
  if (f !== c.n) return;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
    if (dx || dy) open(x + dx, y + dy);
}

function check() {
  let closed = 0;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++)
    if (!board[y][x].open && !board[y][x].mine) closed++;
  if (!closed) {
    score += 60 + Math.round(time) * 3 + mines * 2;

    // ---- THE BOARD IS A TIME, AND IT IS WRITTEN HERE ----------------
    //
    // Liam: *"add leader board on time to complete level to sweep"*.
    //
    // A run is several boards, so there is no single number at the end to
    // put up - the thing worth recording is how fast ONE board fell. It
    // goes on the leaderboard for the size and difficulty it was played
    // at, because a 7x7 EASY clear and a 16x12 BRUTAL clear are not the
    // same achievement and putting them in one table makes the table
    // meaningless.
    const t = +(elapsed).toFixed(1);
    const b = timeBoard();
    if (b.qualifies(t)) {
      b.submit(t, playerName(), { board: boardNo, cols, rows, mines });
      lastRecord = 'FASTEST YET  ' + t.toFixed(1) + 's';
      recordT = 2.4;
    } else {
      lastRecord = t.toFixed(1) + 's';
      recordT = 1.6;
    }

    boardNo++;
    D.beep(720, 0.2, 'triangle', 0.06, 420);
    reset(true);
  }
}

/** one leaderboard per size-and-difficulty, so the times are comparable */
const timeBoard = () => new Board('sweep.' + SIZES[sizeI].name + '.' + LEVELS[levelI].name,
  { lower: true, unit: 'TIME', format: (v) => v.toFixed(1) + 's' });

// ---------------------------------------------------------------------
function step(dt, g) {
  if (menu) { drawMenu(g); return; }
  if (over) {
    draw(g, true);
    D.card('BOOM', ['score ' + score, 'board ' + boardNo,
                    SIZES[sizeI].name + ' · ' + LEVELS[levelI].name],
           'click for the home screen');
    if (D.tapped()) { home.finish(null); menu = true; }
    return;
  }
  if (D.shot) { draw(g); return; }

  time -= dt;
  if (!first) elapsed += dt;        // the clock on THIS board, from the first click
  if (recordT > 0) recordT -= dt;
  if (time <= 0) { over = true; D.record(score); D.noise(0.6, 0.09, 180); }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = board[y][x];
    if (c.pop > 0) c.pop = Math.max(0, c.pop - dt * 5);
  }
  draw(g);
}

// ---- the menu, which is the shared home screen with pickers in it ----
//
// The size and difficulty rows are drawn INTO the home screen's panel
// slot rather than being a second, different-looking front page. The
// leaderboard beside them is the one for the combination currently
// selected, so changing the difficulty changes the times you are looking
// at - which is the only way a per-difficulty board makes sense.
const btns = [];
function drawMenu(g) {
  btns.length = 0;
  g.fillStyle = '#151a21'; g.fillRect(0, 0, D.W, D.H);
  for (let y = 0; y < D.H; y += 24) for (let x = 0; x < D.W; x += 24) {
    g.fillStyle = (x + y) % 48 ? 'rgba(255,255,255,.014)' : 'rgba(0,0,0,.10)';
    g.fillRect(x, y, 23, 23);
  }
  home.o.board = timeBoard();
  home.step(D.dt);
}

function row(g, list, sel, y, fn, left, width) {
  const w = Math.min(118, ((width || D.W) - 24) / list.length - 8), gap = 8;
  const total = list.length * w + (list.length - 1) * gap;
  let x = left !== undefined ? left : (D.W - total) / 2;
  for (let i = 0; i < list.length; i++) {
    const on = i === sel;
    bevel(g, x, y, w, 54, on ? '#2f4256' : '#1e2632', !on);
    if (on) { g.strokeStyle = '#ff9f43'; g.lineWidth = 2; g.strokeRect(x + 1, y + 1, w - 2, 52); }
    D.text(list[i].name, x + w / 2, y + 26, 13, on ? '#ffffff' : '#8b96a8', 'center');
    D.text(list[i].cols ? list[i].cols + '×' + list[i].rows
                        : Math.round(list[i].density * 100) + '% mines',
           x + w / 2, y + 44, 10, on ? '#cbd6e4' : '#5a6577', 'center');
    btns.push({ x, y, w, h: 54, fn: () => fn(i) });
    x += w + gap;
  }
}

function save() {
  D.beep(420, 0.05, 'square', 0.04);
  try {
    localStorage.setItem('pd.sweep.size', String(sizeI));
    localStorage.setItem('pd.sweep.level', String(levelI));
  } catch (e) {}
}

// ---- input on the board ---------------------------------------------
addEventListener('contextmenu', (e) => e.preventDefault());
D.cv.addEventListener('mousedown', (e) => {
  if (menu || over || !started) return;
  const r = D.cv.getBoundingClientRect();
  const mx = Math.floor(((e.clientX - r.left) / r.width * D.W - ox) / cell);
  const my = Math.floor(((e.clientY - r.top) / r.height * D.H - oy) / cell);
  if (mx < 0 || my < 0 || mx >= cols || my >= rows) return;
  const c = board[my][mx];
  if (e.button === 2) {
    if (c.open) return;
    c.flag = !c.flag; left += c.flag ? -1 : 1;
    D.beep(c.flag ? 640 : 380, 0.05, 'sine', 0.04);
  } else if (c.open) chord(mx, my);
  else open(mx, my);
});
let touchT = 0, touchCell = null;
D.cv.addEventListener('touchstart', (e) => {
  if (menu || over || !started) return;
  const r = D.cv.getBoundingClientRect(), t = e.touches[0];
  touchCell = {
    mx: Math.floor(((t.clientX - r.left) / r.width * D.W - ox) / cell),
    my: Math.floor(((t.clientY - r.top) / r.height * D.H - oy) / cell),
  };
  touchT = performance.now();
}, { passive: true });
D.cv.addEventListener('touchend', () => {
  if (!touchCell || menu || over || !started) return;
  const { mx, my } = touchCell;
  touchCell = null;
  if (mx < 0 || my < 0 || mx >= cols || my >= rows) return;
  const c = board[my][mx];
  if (performance.now() - touchT > 360) {
    if (!c.open) { c.flag = !c.flag; left += c.flag ? -1 : 1; D.beep(640, .05, 'sine', .04); }
  } else if (c.open) chord(mx, my);
  else open(mx, my);
});

// =====================================================================
// the drawing
// =====================================================================
const NCOL = ['', '#4dc9ff', '#57d38c', '#ff9f43', '#ff6b8b', '#b07cff', '#ffd166', '#e7ecf3', '#8b96a8'];

/** a raised or sunken panel, which is what a minesweeper tile IS */
function bevel(g, x, y, w, h, col, raised = true) {
  g.fillStyle = col; g.fillRect(x, y, w, h);
  g.fillStyle = raised ? 'rgba(255,255,255,.26)' : 'rgba(0,0,0,.30)';
  g.fillRect(x, y, w, 2); g.fillRect(x, y, 2, h);
  g.fillStyle = raised ? 'rgba(0,0,0,.40)' : 'rgba(255,255,255,.07)';
  g.fillRect(x, y + h - 2, w, 2); g.fillRect(x + w - 2, y, 2, h);
}

function draw(g, reveal) {
  if (!board) return;
  g.fillStyle = '#151a21'; g.fillRect(0, 0, D.W, D.H);
  for (let y = 0; y < D.H; y += 24) for (let x = 0; x < D.W; x += 24) {
    g.fillStyle = (x + y) % 48 ? 'rgba(255,255,255,.012)' : 'rgba(0,0,0,.10)';
    g.fillRect(x, y, 23, 23);
  }

  // the case the board sits in
  g.fillStyle = '#0f141a';
  g.fillRect(ox - 10, oy - 10, cols * cell + 20, rows * cell + 20);
  bevel(g, ox - 10, oy - 10, cols * cell + 20, rows * cell + 20, '#1b232e');

  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = board[y][x], px = ox + x * cell, py = oy + y * cell, s = cell - 2;
    if (c.open || (reveal && c.mine)) {
      bevel(g, px, py, s, s, c.mine ? (boom && boom.x === x && boom.y === y ? '#7a1c2c' : '#3a1c24') : '#222c38', false);
      if (c.mine) mine(g, px + s / 2, py + s / 2, s);
      else if (c.n) {
        const pop = c.pop || 0;
        D.text(String(c.n), px + s / 2, py + s / 2 + s * 0.20,
               Math.round(s * (0.52 + pop * 0.12)), NCOL[c.n], 'center');
      }
    } else {
      bevel(g, px, py, s, s, '#35475d');
      if (c.flag) flag(g, px + s / 2, py + s / 2, s);
    }
  }

  // the clock, as a bar over the board
  const S = SIZES[sizeI], L = LEVELS[levelI];
  const full = (16 + cols * rows * 0.5) * L.time;
  const t = clamp(time / full, 0, 1);
  g.fillStyle = 'rgba(0,0,0,.45)'; g.fillRect(ox - 10, oy - 28, cols * cell + 20, 8);
  g.fillStyle = t < 0.25 ? '#ff6b8b' : '#4dc9ff';
  g.fillRect(ox - 10, oy - 28, (cols * cell + 20) * t, 8);

  D.hud('SCORE ' + (score || 0) + '   BOARD ' + boardNo,
        'MINES ' + left + '   ' + S.name + '·' + L.name);
  D.text(Math.max(0, Math.ceil(time)) + 's', D.W / 2, oy - 36, 12, '#8b96a8', 'center');
}

function mine(g, x, y, s) {
  const r = s * 0.24;
  g.strokeStyle = '#ff9f43'; g.lineWidth = Math.max(1.5, s * 0.06);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * 6.283;
    g.beginPath();
    g.moveTo(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7);
    g.lineTo(x + Math.cos(a) * r * 1.5, y + Math.sin(a) * r * 1.5);
    g.stroke();
  }
  g.fillStyle = '#ffd9a8';
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  g.fillStyle = '#3a1c24';
  g.beginPath(); g.arc(x, y, r * 0.72, 0, 7); g.fill();
  g.fillStyle = 'rgba(255,255,255,.5)';
  g.beginPath(); g.arc(x - r * 0.28, y - r * 0.3, r * 0.2, 0, 7); g.fill();
}

function flag(g, x, y, s) {
  g.fillStyle = '#6b7684';
  g.fillRect(x - s * 0.04, y - s * 0.26, s * 0.08, s * 0.52);
  g.fillStyle = '#8b96a8';
  g.fillRect(x - s * 0.20, y + s * 0.22, s * 0.40, s * 0.07);
  g.fillStyle = '#ff6b8b';
  g.beginPath();
  g.moveTo(x - s * 0.02, y - s * 0.28);
  g.lineTo(x + s * 0.28, y - s * 0.12);
  g.lineTo(x - s * 0.02, y + s * 0.02);
  g.closePath(); g.fill();
}

const home = new Home(D, {
  title: 'SWEEP',
  lines: ['minesweeper on a clock, boards one after another',
          'your first click is always safe - nothing after it is',
          'the board beside this is the best TIMES at these settings'],
  board: timeBoard(),
  buttons: [{ label: 'SWEEP', sub: 'clear it before the clock runs out',
              fn: () => { menu = false; started = true; reset(false);
                          D.beep(500, .08, 'triangle', .05, 200); } }],
  hint: 'LEFT click clears · RIGHT click flags · click a number to clear round it',
  wash: 'rgba(21,26,33,.92)',
  panel: {
    draw: (Dd, x, y, w) => {
      Dd.text('BOARD SIZE', x, y + 12, 10, '#5a6577');
      row(Dd.g, SIZES, sizeI, y + 20, () => {}, x, w);
      Dd.text('DIFFICULTY', x, y + 96, 10, '#5a6577');
      row(Dd.g, LEVELS, levelI, y + 104, () => {}, x, w);
      const S = SIZES[sizeI], L = LEVELS[levelI];
      Dd.text(S.cols + '×' + S.rows + '  ·  ' + Math.round(S.cols * S.rows * L.density)
              + ' mines  ·  ' + Math.round(L.density * 100) + '%', x, y + 180, 12, '#e7ecf3');
      Dd.text(L.name === 'BRUTAL' ? 'past the density where logic alone is enough'
            : L.name === 'HARD' ? 'you will have to guess sometimes'
            : L.name === 'NORMAL' ? 'the classic mix' : 'room to think',
              x, y + 198, 10, '#8b96a8');
      return 210;
    },
    // the picker rows record their own hit boxes while drawing, so the
    // click handler only has to ask which one was under the pointer
    click: (Dd) => {
      for (let i = 0; i < btns.length; i++) {
        const b = btns[i];
        if (Dd.mouse.x > b.x && Dd.mouse.x < b.x + b.w && Dd.mouse.y > b.y && Dd.mouse.y < b.y + b.h) {
          if (i < SIZES.length) sizeI = i; else levelI = i - SIZES.length;
          save();
          home.o.board = timeBoard();
          return;
        }
      }
    },
  },
});

menu = true; started = false;
reset(false);

if (D.shot) {
  menu = false; started = true; sizeI = 2; levelI = 2; boardNo = 3; reset(true);
  score = 318;
  open(Math.floor(cols / 2), Math.floor(rows / 2));
  for (let i = 0; i < 6; i++) {
    const x = Math.floor(rnd(0, cols)), y = Math.floor(rnd(0, rows));
    if (!board[y][x].open) { board[y][x].flag = true; left--; }
  }
  for (let i = 0; i < 8; i++) {
    const x = Math.floor(rnd(0, cols)), y = Math.floor(rnd(0, rows));
    if (!board[y][x].mine && !board[y][x].flag) open(x, y);
  }
  over = false; score = 318;
}

D.run(step);
