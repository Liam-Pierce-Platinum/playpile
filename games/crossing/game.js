// =====================================================================
// CROSSING - a road, a river, and five holes to fill
// =====================================================================
//
// The 1981 one. Two halves that look the same and play as opposites, and
// that inversion is the whole joke:
//
//   ON THE ROAD, touching anything kills you.
//   ON THE RIVER, touching nothing kills you.
//
// You spend the bottom half avoiding everything that moves and the top
// half desperate to land on it, and the moment of turning that instinct
// around at the bank is where the game lives.
//
// THE RIVER CARRIES YOU. Standing on a log means drifting with it, which
// is what makes the far bank hard: you have to account for where you will
// be by the time you get there, not where you are. Drift off the side and
// you are gone.
//
// Movement is a HOP, not a walk - one square at a time, committed, with a
// short animation you cannot cancel. That is what makes it a puzzle about
// timing rather than a game about steering.
import { Deck, clamp } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const CELL = 44;
const COLS = 15, LANES = 13;
const TOP = 30;
const D = new Deck({ key: 'crossing', w: COLS * CELL, h: TOP + (LANES + 1) * CELL, bg: '#0a0e14' });

const HOP = 0.13;                      // seconds per hop
const TIME = 32;                       // seconds a life lasts

// Row 0 is the home bank at the top, row 13 is the start kerb.
// 1-5 river, 6 the median, 7-11 road, 12 the verge, 13 the kerb.
const RIVER = [1, 2, 3, 4, 5];
const ROAD = [7, 8, 9, 10, 11];

let frog, lanes, homes, score, lives, level, over, started, dead, msg, msgT, clock;

const rowY = (r) => TOP + r * CELL;

function reset(full) {
  if (full) { score = 0; lives = 4; level = 1; homes = [false, false, false, false, false]; }
  over = false; dead = 0; msg = ''; msgT = 0;
  makeLanes();
  place();
}

function place() {
  frog = { c: Math.floor(COLS / 2), r: LANES, x: Math.floor(COLS / 2) * CELL, y: rowY(LANES),
           hop: 0, fx: 0, fy: 0, dir: 0, on: null, dead: false };
  clock = TIME;
}

function makeLanes() {
  lanes = {};
  const sp = 1 + (level - 1) * 0.16;
  // the road: cars, each lane its own direction and speed
  const road = [
    { n: 3, w: 1.0, v: 82, col: '#e8c34a', kind: 'car' },
    { n: 2, w: 1.6, v: -64, col: '#6fd4e0', kind: 'truck' },
    { n: 3, w: 1.0, v: 104, col: '#d95757', kind: 'car' },
    { n: 4, w: 1.0, v: -128, col: '#a56fd4', kind: 'car' },
    { n: 2, w: 2.2, v: 58, col: '#e08a3c', kind: 'truck' },
  ];
  ROAD.forEach((r, i) => {
    const s = road[i];
    lanes[r] = { kind: 'road', v: s.v * sp, col: s.col, type: s.kind,
                 items: spread(s.n, s.w) };
  });
  // the river: logs and turtles
  const river = [
    { n: 3, w: 3.0, v: 62, kind: 'log' },
    { n: 4, w: 2.0, v: -78, kind: 'turtle' },
    { n: 2, w: 4.0, v: 48, kind: 'log' },
    { n: 4, w: 2.0, v: -96, kind: 'turtle' },
    { n: 3, w: 3.0, v: 70, kind: 'log' },
  ];
  RIVER.forEach((r, i) => {
    const s = river[i];
    lanes[r] = { kind: 'river', v: s.v * sp, type: s.kind, items: spread(s.n, s.w) };
  });
}

/** n items of width w cells, spaced evenly round the row with a jitter */
function spread(n, w) {
  const gap = (COLS * CELL) / n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push({ x: i * gap + Math.random() * gap * 0.3, w: w * CELL, dive: Math.random() * 6 });
  }
  return out;
}

// ---- input -----------------------------------------------------------
function hop(dx, dy) {
  if (over || frog.hop > 0 || frog.dead) return;
  const nr = frog.r + dy;
  if (nr < 0 || nr > LANES) return;
  frog.fx = frog.x; frog.fy = frog.y;
  frog.r = nr;
  frog.x = clamp(frog.x + dx * CELL, -CELL, (COLS - 1) * CELL + CELL);
  frog.y = rowY(nr);
  frog.hop = HOP;
  frog.on = null;
  if (dy < 0) { score += 10; D.beep(520, 0.05, 'square', 0.04, 160); }
  else D.beep(380, 0.05, 'square', 0.03);
  if (dx) frog.dir = dx > 0 ? 1 : 3;
  if (dy) frog.dir = dy < 0 ? 0 : 2;
}
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') hop(0, -1);
  if (k === 'ArrowDown' || k === 's' || k === 'S') hop(0, 1);
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') hop(-1, 0);
  if (k === 'ArrowRight' || k === 'd' || k === 'D') hop(1, 0);
});
let touch = null;
addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; });
addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.hypot(dx, dy) < 20) { hop(0, -1); touch = null; return; }
  if (Math.abs(dx) > Math.abs(dy)) hop(Math.sign(dx), 0); else hop(0, Math.sign(dy));
  touch = null;
});

// ---- dying and scoring ------------------------------------------------
function die(why) {
  if (frog.dead) return;
  frog.dead = true; dead = D.t; msg = why; msgT = 1.4;
  D.noise(0.35, 0.09, 220);
  lives--;
  if (lives <= 0) { over = true; msg = 'GAME OVER'; }
}

function reachedHome(slot) {
  if (homes[slot]) { die('ALREADY THERE'); return; }
  homes[slot] = true;
  score += 50 + Math.round(clock) * 10;
  D.beep(880, 0.22, 'triangle', 0.07, 400);
  if (homes.every(Boolean)) {
    score += 1000;
    level++;
    homes = [false, false, false, false, false];
    msg = 'LEVEL ' + level; msgT = 1.8;
    makeLanes();
  }
  place();
}

// ---- drawing ---------------------------------------------------------
const HOME_X = (i) => (i * 3 + 1) * CELL;

function draw(g) {
  // the bands
  g.fillStyle = '#12202e'; g.fillRect(0, rowY(0), D.W, CELL);              // home bank
  g.fillStyle = '#12304a'; g.fillRect(0, rowY(1), D.W, CELL * 5);          // river
  g.fillStyle = '#2a3342'; g.fillRect(0, rowY(6), D.W, CELL);              // median
  g.fillStyle = '#191d24'; g.fillRect(0, rowY(7), D.W, CELL * 5);          // road
  g.fillStyle = '#2a3342'; g.fillRect(0, rowY(12), D.W, CELL * 2);         // verge + kerb

  // lane markings
  for (const r of [8, 9, 10, 11]) {
    for (let x = 0; x < D.W; x += 34) {
      g.fillStyle = 'rgba(255,255,255,.10)';
      g.fillRect(x, rowY(r) - 1, 18, 2);
    }
  }

  // the five holes
  for (let i = 0; i < 5; i++) {
    const x = HOME_X(i);
    g.fillStyle = homes[i] ? '#4fc26a' : '#0a1620';
    g.beginPath();
    if (g.roundRect) g.roundRect(x + 3, rowY(0) + 5, CELL - 6, CELL - 10, 6);
    else g.rect(x + 3, rowY(0) + 5, CELL - 6, CELL - 10);
    g.fill();
    if (homes[i]) frogShape(g, x + CELL / 2, rowY(0) + CELL / 2, 0, '#2f8f4a');
  }

  // the water traffic
  for (const r of RIVER) {
    const L = lanes[r];
    for (const it of L.items) {
      const y = rowY(r) + 6;
      for (const ox of [-COLS * CELL, 0, COLS * CELL]) {
        const x = it.x + ox;
        if (x > D.W || x + it.w < 0) continue;
        if (L.type === 'log') {
          g.fillStyle = '#6b4a2f';
          g.beginPath();
          if (g.roundRect) g.roundRect(x, y, it.w, CELL - 12, 8); else g.rect(x, y, it.w, CELL - 12);
          g.fill();
          g.fillStyle = 'rgba(0,0,0,.22)';
          for (let k = 1; k < it.w / CELL; k++) g.fillRect(x + k * CELL, y, 2, CELL - 12);
        } else {
          // turtles, which dive - and a diving turtle will not hold you
          const under = diving(it);
          g.globalAlpha = under ? 0.30 : 1;
          g.fillStyle = under ? '#2d5a4a' : '#3f9070';
          const n = Math.round(it.w / CELL);
          for (let k = 0; k < n; k++) {
            g.beginPath(); g.arc(x + k * CELL + CELL / 2, y + (CELL - 12) / 2, CELL * 0.32, 0, 7); g.fill();
          }
          g.globalAlpha = 1;
        }
      }
    }
  }

  // the cars
  for (const r of ROAD) {
    const L = lanes[r];
    for (const it of L.items) {
      for (const ox of [-COLS * CELL, 0, COLS * CELL]) {
        const x = it.x + ox;
        if (x > D.W || x + it.w < 0) continue;
        const y = rowY(r) + 8;
        g.fillStyle = L.col;
        g.beginPath();
        if (g.roundRect) g.roundRect(x, y, it.w, CELL - 16, 5); else g.rect(x, y, it.w, CELL - 16);
        g.fill();
        // a windscreen, so it has a front
        g.fillStyle = 'rgba(0,0,0,.35)';
        const wx = L.v > 0 ? x + it.w - 13 : x + 5;
        g.fillRect(wx, y + 3, 8, CELL - 22);
      }
    }
  }

  // the frog
  if (!frog.dead || Math.floor(D.t * 12) % 2) {
    let px = frog.x, py = frog.y;
    if (frog.hop > 0) {
      const t = 1 - frog.hop / HOP;
      px = frog.fx + (frog.x - frog.fx) * t;
      py = frog.fy + (frog.y - frog.fy) * t;
    }
    const lift = frog.hop > 0 ? Math.sin((1 - frog.hop / HOP) * Math.PI) * 7 : 0;
    frogShape(g, px + CELL / 2, py + CELL / 2 - lift, frog.dir, frog.dead ? '#d95757' : '#7fe08a');
  }

  // the clock
  const f = clamp(clock / TIME, 0, 1);
  g.fillStyle = '#1b2430'; g.fillRect(D.W - 214, D.H - 20, 200, 10);
  g.fillStyle = f < 0.25 ? '#d95757' : '#4fc26a';
  g.fillRect(D.W - 214, D.H - 20, 200 * f, 10);
  D.text('TIME', D.W - 224, D.H - 11, 10, '#8b96a8', 'right');

  D.hud('SCORE ' + score + '   LEVEL ' + level,
        '🐸'.repeat(Math.max(0, lives - 1)) + '   BEST ' + D.best);
  if (msgT > 0 && !over) D.text(msg, D.W / 2, D.H / 2, 24, '#ff9f43', 'center');
}

function frogShape(g, x, y, dir, col) {
  g.save();
  g.translate(x, y);
  g.rotate(dir * Math.PI / 2);
  g.fillStyle = col;
  g.beginPath();
  if (g.roundRect) g.roundRect(-11, -9, 22, 19, 6); else g.rect(-11, -9, 22, 19);
  g.fill();
  // legs
  g.fillRect(-15, -2, 5, 11); g.fillRect(10, -2, 5, 11);
  // eyes
  g.fillStyle = '#0a0e14';
  g.beginPath(); g.arc(-5, -6, 2.6, 0, 7); g.fill();
  g.beginPath(); g.arc(5, -6, 2.6, 0, 7); g.fill();
  g.restore();
}

/** turtles dive on a cycle, and a diving one is not a platform */
const diving = (it) => ((D.t + it.dive) % 6) > 4.6;

// ---- the loop --------------------------------------------------------
function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }
  if (msgT > 0) msgT -= dt;

  if (!over && !frog.dead) {
    // traffic
    for (const r of [...RIVER, ...ROAD]) {
      const L = lanes[r];
      for (const it of L.items) {
        it.x += L.v * dt;
        const span = COLS * CELL;
        if (it.x > span) it.x -= span + it.w;
        if (it.x + it.w < 0) it.x += span + it.w;
      }
    }

    if (frog.hop > 0) frog.hop -= dt;

    clock -= dt;
    if (clock <= 0) die('TOO SLOW');

    // where is the frog standing?
    if (frog.hop <= 0) {
      const r = frog.r;
      if (r === 0) {
        // the home bank - only the five holes count
        let slot = -1;
        for (let i = 0; i < 5; i++) if (Math.abs(frog.x - HOME_X(i)) < CELL * 0.6) slot = i;
        if (slot >= 0) reachedHome(slot); else die('MISSED THE HOLE');
      } else if (RIVER.includes(r)) {
        // ON THE RIVER, TOUCHING NOTHING KILLS YOU
        const L = lanes[r];
        let riding = null;
        for (const it of L.items) {
          if (L.type === 'turtle' && diving(it)) continue;
          for (const ox of [-COLS * CELL, 0, COLS * CELL]) {
            const x = it.x + ox;
            if (frog.x + CELL * 0.5 > x && frog.x + CELL * 0.5 < x + it.w) riding = L;
          }
        }
        if (!riding) die('DROWNED');
        else {
          frog.x += L.v * dt;                     // the river carries you
          if (frog.x < -CELL * 0.6 || frog.x > D.W - CELL * 0.4) die('WASHED AWAY');
        }
      } else if (ROAD.includes(r)) {
        // ON THE ROAD, TOUCHING ANYTHING KILLS YOU
        const L = lanes[r];
        for (const it of L.items) {
          for (const ox of [-COLS * CELL, 0, COLS * CELL]) {
            const x = it.x + ox;
            if (frog.x + CELL * 0.72 > x && frog.x + CELL * 0.28 < x + it.w) die('SQUASHED');
          }
        }
      }
    }
  }

  if (frog.dead && !over && D.t - dead > 1.0) place();

  draw(g);

  if (over) {
    D.card('GAME OVER', [score + ' points',
                         'level ' + level + '   ·   ' + homes.filter(Boolean).length + '/5 home'],
           'click or SPACE for the board');
    if (D.t - dead > 0.7 && D.tapped()) { home.finish(score, { level }); started = false; }
  }
}

const board = new Board('crossing', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'CROSSING',
  lines: ['on the road, touching anything kills you',
          'on the river, touching NOTHING kills you',
          'the logs carry you - aim for where you will be'],
  board,
  buttons: [{ label: 'PLAY', sub: 'arrows to hop · five holes to fill',
              fn: () => { reset(true); started = true; } }],
  hint: 'ARROWS or W A S D to hop · swipe on a phone · P pause · R restart',
});

reset(true); started = false;

if (D.shot) {
  started = true;
  score = 2340; level = 2; lives = 4;
  homes = [true, false, true, false, false];
  frog.r = 4; frog.y = rowY(4); frog.x = 6 * CELL; frog.dir = 0;
  for (const r of [...RIVER, ...ROAD]) for (const it of lanes[r].items) it.x += Math.random() * 60;
}

D.run(step);
