// =====================================================================
// CROSSING - an endless road, and something behind you
// =====================================================================
//
// Liam: *"the way it should work is its infinite and the player has to
// move while the camera gets closer getting points from getting further
// and further"*.
//
// So this is no longer the 1981 board with five holes to fill and a life
// counter. The world goes UP forever, generated a row at a time as it
// comes into view, and the score is simply the furthest row you have
// stood on. There is no level and there is no finish.
//
// WHAT MAKES IT A GAME IS THE CAMERA.
// It creeps upward on its own, faster the further you get, and the bottom
// edge of the screen is lethal. That is the whole design: you are never
// allowed to wait for a gap, only to choose which gap to take. Standing
// still is a slow death, so the pressure comes from the thing that is
// chasing you rather than from a countdown in the corner.
//
// The two halves still play as opposites, which is the joke worth keeping:
//
//   ON THE ROAD, touching anything kills you.
//   ON THE RIVER, touching nothing kills you.
//
// Movement is a HOP, not a walk - one square, committed, with a short
// animation you cannot cancel, so it is a game about timing rather than
// steering.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const CELL = 44;
const COLS = 15;
const VIEW = 14;                       // rows of world visible at once
const TOP = 30;                        // the HUD bar
const W = COLS * CELL;
const D = new Deck({ key: 'crossing', w: W, h: TOP + VIEW * CELL, bg: '#0a0e14' });

const HOP = 0.12;                      // seconds per hop
const LEAD = 8;                         // the player is never more than VIEW-LEAD rows up
const MARGIN = 70;                     // how far off screen traffic lives

let rows, player, camRow, maxRow, score, over, started, dead, msg, msgT, moved;

// Row r is drawn with row `camRow` sitting on the bottom edge.
const rowY = (r) => TOP + (VIEW - 1 - (r - camRow)) * CELL;

// ---------------------------------------------------------------------
// the world, one row at a time
// ---------------------------------------------------------------------
//
// Rows are made in BANDS - three lanes of road, then a verge, then four
// of river - because a road one lane deep is not a road, it is a car you
// step over. The band is chosen once and then filled in, which is the
// only reason the thing reads as a landscape.
let band = { type: 'grass', left: 4 };

function bandFor(r) {
  if (band.left > 0) { band.left--; return band.type; }
  // grass always follows water or traffic, so there is somewhere to stand
  // and think, and it gets rarer the further out you are
  const rest = r < 20 ? 0.55 : clamp(0.42 - r * 0.0006, 0.16, 0.42);
  if (band.type !== 'grass' && Math.random() < rest) {
    band = { type: 'grass', left: Math.random() < 0.35 ? 1 : 0 };
  } else {
    const water = clamp(0.28 + r * 0.0009, 0.28, 0.5);
    band = Math.random() < water
      ? { type: 'river', left: 1 + Math.floor(Math.random() * 3) }
      : { type: 'road', left: 1 + Math.floor(Math.random() * 3) };
  }
  return band.type;
}

const CAR_COLS = ['#e8c34a', '#6fd4e0', '#d95757', '#a56fd4', '#e08a3c', '#7fe08a'];

function makeRow(r) {
  const type = r < 4 ? 'grass' : bandFor(r);
  const sp = clamp(1 + r * 0.007, 1, 2.7);          // everything speeds up
  const lane = { r, type, items: [] };

  if (type === 'grass') {
    // trees, which are scenery and a wall at the same time. Never a solid
    // line of them, or the row cannot be crossed at all.
    lane.trees = new Set();
    const n = r < 4 ? 0 : Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) lane.trees.add(Math.floor(Math.random() * COLS));
    if (lane.trees.size > COLS - 4) lane.trees.delete([...lane.trees][0]);
    lane.tint = Math.random() < 0.5 ? '#1b2e1f' : '#1f3423';
    return lane;
  }

  lane.dir = Math.random() < 0.5 ? 1 : -1;
  if (type === 'road') {
    const truck = Math.random() < 0.3;
    lane.itemW = (truck ? 1.7 + Math.random() * 0.8 : 1.0) * CELL;
    lane.v = lane.dir * (truck ? 55 + Math.random() * 45 : 75 + Math.random() * 75) * sp;
    lane.col = pick(CAR_COLS);
    lane.gap = [CELL * 2.2, CELL * 6.5];
  } else {
    const turtle = Math.random() < 0.42;
    lane.kind = turtle ? 'turtle' : 'log';
    lane.itemW = (turtle ? 2 + Math.floor(Math.random() * 2) : 2 + Math.floor(Math.random() * 3)) * CELL;
    lane.v = lane.dir * (45 + Math.random() * 55) * sp;
    // A river gap you cannot cross is a dead row, so water gaps are kept
    // tight - the difficulty in the water is the drift, not the spacing.
    lane.gap = [CELL * 1.1, CELL * 2.6];
  }
  prefill(lane);
  return lane;
}

/**
 * Fill a lane across the whole screen before it is ever seen.
 *
 * THIS IS WHERE THE OLD VERSION WENT WRONG. It kept a fixed number of
 * items per lane and wrapped them round with `x -= span + w`, then drew
 * each one three times at -span, 0 and +span. A log halfway off the right
 * edge therefore also poked in at the left, and the instant it wrapped
 * that left-hand copy jumped sideways by its own width and vanished -
 * which from the player's seat is a log disappearing at the edge of the
 * screen for no reason, sometimes out from under them.
 *
 * There is no wrapping here at all. Traffic is spawned off one side and
 * deleted off the other, well outside the screen, so nothing ever changes
 * position except by driving.
 */
function prefill(lane) {
  let x = -lane.itemW - rnd(0, lane.gap[1]);
  while (x < W + lane.itemW) {
    lane.items.push({ x, dive: rnd(6) });
    x += lane.itemW + rnd(lane.gap[0], lane.gap[1]);
  }
  lane.next = rnd(lane.gap[0], lane.gap[1]);
}

function ensureRows(upTo) {
  for (let r = rows.length; r <= upTo; r++) rows.push(makeRow(r));
}

// ---------------------------------------------------------------------
// input
// ---------------------------------------------------------------------
function blocked(r, c) {
  if (c < 0 || c >= COLS) return true;
  const lane = rows[r];
  return !!(lane && lane.trees && lane.trees.has(c));
}

function hop(dx, dy) {
  if (over || player.hop > 0 || player.dead || !started) return;
  const nr = player.r + dy;
  if (nr < 0) return;
  ensureRows(nr + VIEW + 3);
  const nc = Math.round(player.x / CELL) + dx;
  if (blocked(nr, dx ? nc : Math.round(player.x / CELL))) { D.beep(150, 0.05, 'square', 0.03); return; }

  player.fx = player.x; player.fy = player.r;
  player.r = nr;
  player.x = clamp(player.x + dx * CELL, -CELL * 0.4, (COLS - 1) * CELL + CELL * 0.4);
  player.hop = HOP;
  moved = true;
  if (dy > 0 && nr > maxRow) {
    maxRow = nr; score = nr;
    D.beep(480 + Math.min(600, nr * 3), 0.05, 'square', 0.04, 160);
  } else {
    D.beep(320, 0.04, 'square', 0.03);
  }
  player.dir = dy > 0 ? 0 : dy < 0 ? 2 : dx > 0 ? 1 : 3;
}

addEventListener('keydown', (e) => {
  if (e.repeat) return;
  const k = e.key;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') hop(0, 1);
  if (k === 'ArrowDown' || k === 's' || k === 'S') hop(0, -1);
  if (k === 'ArrowLeft' || k === 'a' || k === 'A') hop(-1, 0);
  if (k === 'ArrowRight' || k === 'd' || k === 'D') hop(1, 0);
});
let touch = null;
addEventListener('touchstart', (e) => { const t = e.touches[0]; touch = { x: t.clientX, y: t.clientY }; });
addEventListener('touchend', (e) => {
  if (!touch) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touch.x, dy = t.clientY - touch.y;
  if (Math.hypot(dx, dy) < 20) { hop(0, 1); touch = null; return; }
  if (Math.abs(dx) > Math.abs(dy)) hop(Math.sign(dx), 0); else hop(0, -Math.sign(dy));
  touch = null;
});

// ---------------------------------------------------------------------
// starting, and stopping
// ---------------------------------------------------------------------
function reset() {
  rows = [];
  band = { type: 'grass', left: 4 };
  camRow = 0; maxRow = 0; score = 0;
  over = false; dead = 0; msg = ''; msgT = 0; moved = false;
  ensureRows(VIEW + 4);
  player = { r: 1, x: Math.floor(COLS / 2) * CELL, hop: 0, fx: 0, fy: 1, dir: 0, dead: false };
}

// ONE LIFE. An endless game with four lives is really four short games,
// and the run is the unit here - the whole point is how far you got.
function die(why) {
  if (player.dead) return;
  player.dead = true; over = true; dead = D.t; msg = why;
  D.noise(0.35, 0.09, 220);
  D.record(score);
}

/** turtles dive on a cycle, and a diving one will not hold you */
const diving = (it) => ((D.t + it.dive) % 6) > 4.6;

// ---------------------------------------------------------------------
// drawing
// ---------------------------------------------------------------------
function draw(g) {
  const first = Math.floor(camRow) - 1, last = Math.floor(camRow) + VIEW + 1;

  for (let r = Math.max(0, first); r <= last; r++) {
    const lane = rows[r];
    if (!lane) continue;
    const y = rowY(r);
    if (y > D.H || y + CELL < TOP) continue;

    if (lane.type === 'grass') {
      g.fillStyle = lane.tint; g.fillRect(0, y, W, CELL);
    } else if (lane.type === 'river') {
      g.fillStyle = '#12304a'; g.fillRect(0, y, W, CELL);
      // a little surface movement, so still water does not look like tile
      g.fillStyle = 'rgba(255,255,255,.05)';
      for (let x = ((D.t * lane.v * 0.3) % 52 + 52) % 52 - 52; x < W; x += 52) {
        g.fillRect(x, y + 8 + (r % 3) * 9, 22, 2);
      }
    } else {
      g.fillStyle = '#191d24'; g.fillRect(0, y, W, CELL);
      g.fillStyle = 'rgba(255,255,255,.10)';
      for (let x = 0; x < W; x += 34) g.fillRect(x, y + CELL - 1, 18, 2);
    }

    if (lane.type === 'grass') {
      for (const c of lane.trees) tree(g, c * CELL + CELL / 2, y + CELL, r + c);
      continue;
    }

    for (const it of lane.items) {
      if (it.x > W + 8 || it.x + lane.itemW < -8) continue;
      if (lane.type === 'road') {
        g.fillStyle = lane.col;
        D.box(it.x, y + 8, lane.itemW, CELL - 16, lane.col, 5);
        g.fillStyle = 'rgba(0,0,0,.35)';
        g.fillRect(lane.v > 0 ? it.x + lane.itemW - 13 : it.x + 5, y + 11, 8, CELL - 22);
      } else if (lane.kind === 'log') {
        D.box(it.x, y + 6, lane.itemW, CELL - 12, '#6b4a2f', 8);
        g.fillStyle = 'rgba(0,0,0,.22)';
        for (let k = 1; k < lane.itemW / CELL; k++) g.fillRect(it.x + k * CELL, y + 6, 2, CELL - 12);
      } else {
        const under = diving(it);
        g.globalAlpha = under ? 0.30 : 1;
        g.fillStyle = under ? '#2d5a4a' : '#3f9070';
        const n = Math.round(lane.itemW / CELL);
        for (let k = 0; k < n; k++) {
          g.beginPath(); g.arc(it.x + k * CELL + CELL / 2, y + CELL / 2, CELL * 0.32, 0, 7); g.fill();
        }
        g.globalAlpha = 1;
      }
    }
  }

  // THE EDGE THAT KILLS YOU, drawn so it is never a surprise: a dark band
  // creeping up the bottom of the screen with the light going out of it.
  const edge = rowY(camRow) + CELL;
  const grad = g.createLinearGradient(0, edge - 90, 0, edge);
  grad.addColorStop(0, 'rgba(10,14,20,0)');
  grad.addColorStop(1, 'rgba(10,14,20,.92)');
  g.fillStyle = grad; g.fillRect(0, edge - 90, W, 92);

  // the frog
  if (!player.dead || Math.floor(D.t * 12) % 2) {
    let py = player.r, px = player.x;
    if (player.hop > 0) {
      const t = 1 - player.hop / HOP;
      px = player.fx + (player.x - player.fx) * t;
      py = player.fy + (player.r - player.fy) * t;
    }
    const lift = player.hop > 0 ? Math.sin((1 - player.hop / HOP) * Math.PI) * 8 : 0;
    frogShape(g, px + CELL / 2, rowY(py) + CELL / 2 - lift,
              player.dir, player.dead ? '#d95757' : '#7fe08a');
  }

  D.hud('SCORE ' + score, 'BEST ' + D.best);
  if (msgT > 0 && !over) D.text(msg, W / 2, D.H / 2, 22, '#ff9f43', 'center');
  if (!moved && !over) {
    D.text('UP to go · the bottom of the screen is rising',
           W / 2, D.H - 9, 12, '#8b96a8', 'center');
  }
}

function tree(g, x, base, seed) {
  const h = 26 + (seed * 37 % 16);
  g.fillStyle = '#3d2c1e';
  g.fillRect(x - 3, base - 12, 6, 12);
  g.fillStyle = seed % 2 ? '#2f6b34' : '#35793a';
  g.beginPath();
  g.moveTo(x, base - h - 10); g.lineTo(x + 15, base - 8); g.lineTo(x - 15, base - 8);
  g.closePath(); g.fill();
}

function frogShape(g, x, y, dir, col) {
  g.save();
  g.translate(x, y);
  g.rotate(dir * Math.PI / 2);
  g.fillStyle = col;
  g.beginPath();
  if (g.roundRect) g.roundRect(-11, -9, 22, 19, 6); else g.rect(-11, -9, 22, 19);
  g.fill();
  g.fillRect(-15, -2, 5, 11); g.fillRect(10, -2, 5, 11);
  g.fillStyle = '#0a0e14';
  g.beginPath(); g.arc(-5, -6, 2.6, 0, 7); g.fill();
  g.beginPath(); g.arc(5, -6, 2.6, 0, 7); g.fill();
  g.restore();
}

// ---------------------------------------------------------------------
// the loop
// ---------------------------------------------------------------------
function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }
  if (msgT > 0) msgT -= dt;

  if (!over) {
    ensureRows(Math.floor(camRow) + VIEW + 4);

    // ---- traffic: spawn one side, delete the other, never wrap --------
    for (let r = Math.max(0, Math.floor(camRow) - 2); r < rows.length; r++) {
      const lane = rows[r];
      if (!lane || lane.type === 'grass') continue;
      for (const it of lane.items) it.x += lane.v * dt;

      // `items` is always sorted left to right, so which end leaves and
      // which end fills depends only on which way the lane runs.
      if (lane.v > 0) {
        while (lane.items.length && lane.items[lane.items.length - 1].x > W + MARGIN) lane.items.pop();
        const head = lane.items.length ? lane.items[0].x : 0;
        // once the last one spawned is fully on screen, put another behind it
        if (head > -lane.itemW) {
          lane.items.unshift({ x: head - lane.itemW - lane.next, dive: rnd(6) });
          lane.next = rnd(lane.gap[0], lane.gap[1]);
        }
      } else {
        while (lane.items.length && lane.items[0].x + lane.itemW < -MARGIN) lane.items.shift();
        const tail = lane.items.length ? lane.items[lane.items.length - 1].x : W - lane.itemW;
        if (tail + lane.itemW < W) {
          lane.items.push({ x: tail + lane.itemW + lane.next, dive: rnd(6) });
          lane.next = rnd(lane.gap[0], lane.gap[1]);
        }
      }
    }

    if (player.hop > 0) player.hop -= dt;

    // ---- the camera, which is the opponent ---------------------------
    //
    // It does not move until the first hop, so nobody dies reading the
    // instructions, and it never falls more than LEAD rows behind - which
    // is what stops a good player from banking a safe lead and idling.
    if (moved) {
      const creep = Math.min(1.7, 0.30 + maxRow * 0.0055);
      camRow += creep * dt;
    }
    camRow = Math.max(camRow, player.r - (VIEW - LEAD));
    if (player.r < camRow - 0.35) die('CAUGHT UP');

    // ---- what is the frog standing on? -------------------------------
    if (!over && player.hop <= 0) {
      const lane = rows[player.r];
      if (lane && lane.type === 'river') {
        // ON THE RIVER, TOUCHING NOTHING KILLS YOU
        let riding = false;
        const cx = player.x + CELL * 0.5;
        for (const it of lane.items) {
          if (lane.kind === 'turtle' && diving(it)) continue;
          if (cx > it.x && cx < it.x + lane.itemW) riding = true;
        }
        if (!riding) die('DROWNED');
        else {
          player.x += lane.v * dt;                   // the river carries you
          if (player.x < -CELL * 0.6 || player.x > W - CELL * 0.4) die('WASHED AWAY');
        }
      } else if (lane && lane.type === 'road') {
        // ON THE ROAD, TOUCHING ANYTHING KILLS YOU
        for (const it of lane.items) {
          if (player.x + CELL * 0.72 > it.x && player.x + CELL * 0.28 < it.x + lane.itemW) die('SQUASHED');
        }
      } else if (lane) {
        // back on land: line up with the grid again, but never inside a
        // tree - being carried out of the water into one would wedge you
        let c = clamp(Math.round(player.x / CELL), 0, COLS - 1);
        if (blocked(player.r, c)) {
          for (let k = 1; k < COLS; k++) {
            if (!blocked(player.r, c - k)) { c -= k; break; }
            if (!blocked(player.r, c + k)) { c += k; break; }
          }
        }
        player.x += (c * CELL - player.x) * Math.min(1, dt * 14);
      }
    }
  }

  draw(g);

  if (over) {
    D.card('GAME OVER', [msg, score + ' rows'], 'click or SPACE for the board');
    if (D.t - dead > 0.7 && D.tapped()) { home.finish(score, { rows: score }); started = false; }
  }
}

const board = new Board('crossing', { unit: 'ROWS' });
const home = new Home(D, {
  title: 'CROSSING',
  lines: ['it never ends - the score is how far you got',
          'the bottom of the screen is rising, so you cannot wait',
          'on the road touching anything kills you · on the river, nothing does'],
  board,
  buttons: [{ label: 'PLAY', sub: 'arrows to hop · keep going up',
              fn: () => { reset(); started = true; } }],
  hint: 'ARROWS or W A S D to hop · swipe on a phone · P pause · R restart',
});

reset(); started = false;

if (D.shot) {
  started = true; moved = true;
  camRow = 26; maxRow = 31; score = 31;
  ensureRows(Math.floor(camRow) + VIEW + 4);
  player.r = 31; player.x = 7 * CELL; player.dir = 0;
}

D.run(step);
