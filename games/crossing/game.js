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
import * as A from './art.js';

const CELL = 44;
const COLS = 15;
const VIEW = 14;                       // rows of world visible at once
const TOP = 30;                        // the HUD bar
const W = COLS * CELL;
const D = new Deck({ key: 'crossing', w: W, h: TOP + VIEW * CELL, bg: A.P.ink });

// ---------------------------------------------------------------------
// THE PIXEL BUFFER
// ---------------------------------------------------------------------
// The world is drawn at HALF the cabinet's resolution and blitted up with
// smoothing off, which is what makes this pixel art rather than smooth
// shapes that happen to be square. art.js has the long version of why;
// the short version is that a buffer with no sub-pixels in it cannot be
// drawn into off the grid, so nothing here has to remember to snap.
//
// It is one canvas, made once. Nothing in the frame allocates.
const PX = A.PX;
const BW = W / PX, BH = (TOP + VIEW * CELL) / PX;   // 330 x 323
const TOP_A = TOP / PX, CELL_A = A.CELL_A;
const buf = document.createElement('canvas');
buf.width = BW; buf.height = BH;
const bc = buf.getContext('2d');           // "buffer context"
bc.imageSmoothingEnabled = false;
const SPR = A.buildSprites();

// THE EDGE THAT KILLS YOU. The camera's row is always the bottom row of
// the screen, so this is a fixed band up the bottom of the canvas: the
// light going out of the world behind you. It used to be a
// createLinearGradient, which is the one thing you cannot have in pixel
// art - a smooth ramp is visibly not made of pixels. Ten hard bands of
// increasing alpha with a dithered row on each seam is the pixel-art
// answer, and the strings are built once because a colour string per band
// per frame is 600 strings a second for nothing.
const EDGE_H = 5;                                    // art px per band
const EDGE = [];
for (let i = 0; i < 10; i++) EDGE.push('rgba(36,27,43,' + (0.08 + i * 0.098).toFixed(3) + ')');

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
    // Which of the two greens this verge is, and which tree each slot
    // grows. Both are LOOKS ONLY - decided here rather than in draw()
    // because a verge that changed shade every frame would strobe.
    lane.dark = Math.random() < 0.5;
    lane.tree = {};
    for (const c of lane.trees) lane.tree[c] = Math.floor(Math.random() * 3);
    return lane;
  }

  lane.dir = Math.random() < 0.5 ? 1 : -1;
  if (type === 'road') {
    const truck = Math.random() < 0.3;
    lane.itemW = (truck ? 1.7 + Math.random() * 0.8 : 1.0) * CELL;
    lane.v = lane.dir * (truck ? 55 + Math.random() * 45 : 75 + Math.random() * 75) * sp;
    lane.truck = truck;                      // drawn as a cab and a box
    lane.paint = pick(A.CAR_PAINT);
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
//
// Everything from here on paints into `bc`, the half-resolution buffer,
// in whole art pixels, and the last thing draw() does is blit that buffer
// over the cabinet canvas at 2x with smoothing off.
const P = A.P;
const dot = A.px;                       // a rectangle of whole art pixels

/** lay a ground texture across the row. 5 blits: the tile is 3 cells wide. */
function tile(img, y) { for (let x = 0; x < BW; x += img.width) bc.drawImage(img, x, y); }

/** the moving surface of a river row, two layers at different speeds */
function waves(lane, y, r) {
  const v = lane.v / PX;                            // art pixels per second
  const a = Math.round(D.t * v * 0.55), c = Math.round(D.t * v * 0.30);
  const y1 = y + 4 + (r % 3), y2 = y + 13 + (r % 4);
  for (let x = ((a % 31) + 31) % 31 - 31; x < BW; x += 31) {
    dot(bc, x, y1, 8, 1, P.wat2);
    dot(bc, x + 2, y1 + 1, 5, 1, P.wat1);
  }
  for (let x = ((c % 47) + 47) % 47 - 47; x < BW; x += 47) {
    dot(bc, x, y2, 6, 1, P.wat2);
    dot(bc, x + 1, y2 + 1, 4, 1, P.wat1);
  }
}

function draw(g) {
  const first = Math.max(0, Math.floor(camRow) - 1);
  const last = Math.floor(camRow) + VIEW + 1;

  dot(bc, 0, 0, BW, BH, P.ink);

  // ---- pass one: the ground -----------------------------------------
  //
  // Rounding each row's top edge on its own is safe because rows are
  // exactly CELL apart, so every row rounds with the same fractional
  // offset and no one-pixel seam can open between them as the camera
  // creeps. That is also why the camera creeping looks like scrolling
  // rather than like the world wobbling.
  for (let r = first; r <= last; r++) {
    const lane = rows[r];
    if (!lane) continue;
    const y = Math.round(rowY(r) / PX);
    if (y > BH || y + CELL_A < 0) continue;
    const up = rows[r + 1], down = rows[r - 1];     // r+1 is drawn ABOVE r

    if (lane.type === 'grass') {
      tile(SPR.grass[lane.dark ? 1 : 0], y);
    } else if (lane.type === 'river') {
      tile(SPR.water, y);
      waves(lane, y, r);
      // A BANK WHEREVER THE WATER STOPS. Without it a four-row river is
      // one undifferentiated blue field and you cannot see where it is
      // safe to land; the foam line is the edge of the bank you are
      // jumping off, and it costs two rows of pixels.
      if (!up || up.type !== 'river') {
        dot(bc, 0, y, BW, 1, P.wat4); dot(bc, 0, y + 1, BW, 1, P.foam);
      }
      if (!down || down.type !== 'river') {
        dot(bc, 0, y + CELL_A - 2, BW, 1, P.foam);
        dot(bc, 0, y + CELL_A - 1, BW, 1, P.wat4);
      }
    } else {
      tile(SPR.tarmac[r & 1], y);
      // A LANE LINE ONLY WHERE THERE IS ANOTHER LANE. Dashes between two
      // road rows, a solid painted edge and a kerb lip where the band
      // stops - which is what tells you at a glance how many lanes deep
      // the road you are about to step into is. The old version drew the
      // same dashes on every row edge including the kerb, so a one-lane
      // road and a four-lane road looked identical.
      if (up && up.type === 'road') {
        dot(bc, 0, y, BW, 1, P.ink);
        for (let x = 3; x < BW; x += 18) dot(bc, x, y + 1, 9, 1, P.paint2);
      } else {
        dot(bc, 0, y, BW, 1, P.ink);
        dot(bc, 0, y + 1, BW, 1, P.tar1);
        dot(bc, 0, y + 2, BW, 1, P.paint2);
      }
      if (!down || down.type !== 'road') {
        dot(bc, 0, y + CELL_A - 3, BW, 1, P.paint2);
        dot(bc, 0, y + CELL_A - 2, BW, 1, P.tar1);
        dot(bc, 0, y + CELL_A - 1, BW, 1, P.ink);
      }
    }
  }

  // ---- pass two: everything standing on the ground -------------------
  //
  // Backwards, from the top of the screen down. A tree is taller than its
  // cell and pokes into the row above, and that row is FURTHER AWAY, so
  // it has to have been drawn already. Done in one pass with the ground,
  // the next row's grass painted the tops off every tree.
  for (let r = last; r >= first; r--) {
    const lane = rows[r];
    if (!lane) continue;
    const y = Math.round(rowY(r) / PX);
    if (y > BH || y + CELL_A < -8) continue;

    if (lane.type === 'grass') {
      for (const c of lane.trees) {
        const s = SPR.trees[(lane.tree && lane.tree[c]) || 0];
        bc.drawImage(s, c * CELL_A, y + CELL_A - s.height);
      }
      continue;
    }

    for (const it of lane.items) {
      if (it.x > W + 8 || it.x + lane.itemW < -8) continue;
      const x = Math.round(it.x / PX), w = Math.round(lane.itemW / PX);
      if (lane.type === 'road') {
        dot(bc, x + 3, y + 19, w - 5, 2, P.ink2);       // contact shadow
        A.car(bc, x, y + 2, w, 14, lane.paint, lane.dir, lane.truck);
      } else if (lane.kind === 'log') {
        dot(bc, x + 1, y + 18, w - 2, 2, P.wat4);       // the log's shadow
        A.log(bc, x, y + 3, w, 16);
      } else {
        const n = Math.round(lane.itemW / CELL);
        const s = diving(it) ? SPR.turtleDive : SPR.turtle[lane.dir > 0 ? 0 : 1];
        for (let k = 0; k < n; k++) bc.drawImage(s, x + k * CELL_A, y);
      }
    }
  }

  // ---- the frog ------------------------------------------------------
  if (!player.dead || Math.floor(D.t * 12) % 2) {
    let py = player.r, vx = player.x;
    if (player.hop > 0) {
      const t = 1 - player.hop / HOP;
      vx = player.fx + (player.x - player.fx) * t;
      py = player.fy + (player.r - player.fy) * t;
    }
    const lift = player.hop > 0 ? Math.sin((1 - player.hop / HOP) * Math.PI) * 8 : 0;
    const fx = Math.round(vx / PX), fy = Math.round(rowY(py) / PX);
    // The shadow stays on the ground while the frog leaves it. A four
    // art-pixel hop is small, and without something staying behind it
    // just looks like the sprite twitching upward.
    const on = rows[player.r];
    if (on && on.type === 'river') dot(bc, fx + 4, fy + 19, 14, 1, P.foam);
    else dot(bc, fx + 4, fy + 17, 14, 3, P.ink2);
    bc.drawImage((player.dead ? SPR.frogDead : SPR.frog)[player.dir],
                 fx, fy - Math.round(lift / PX));
  }

  // ---- the dark creeping up behind you -------------------------------
  let ey = BH - EDGE.length * EDGE_H;
  for (let i = 0; i < EDGE.length; i++) {
    dot(bc, 0, ey, BW, EDGE_H, EDGE[i]);
    // a dithered row on each seam: without it the ten bands read as ten
    // stripes, with it they read as one soft fade made out of pixels,
    // which is how a pixel-art gradient is done
    if (i) {
      bc.fillStyle = EDGE[i];
      for (let x = i & 1; x < BW; x += 2) bc.fillRect(x, ey - 1, 1, 1);
    }
    ey += EDGE_H;
  }

  // ---- the HUD -------------------------------------------------------
  dot(bc, 0, 0, BW, TOP_A, P.ink);
  dot(bc, 0, 0, BW, 1, P.ink2);
  dot(bc, 0, TOP_A - 1, BW, 1, P.ink3);
  A.text(bc, 'SCORE', 5, 6, P.uiDim, 1);
  A.text(bc, score, 5 + A.textW('SCORE') + 5, 3, P.ui1, 2);
  A.text(bc, D.best, BW - 5, 3, P.ui3, 2, 'right');
  A.text(bc, 'BEST', BW - 8 - A.textW(String(D.best), 2) - A.textW('BEST'), 6, P.uiDim, 1);

  if (msgT > 0 && !over) A.text(bc, msg, BW / 2, BH / 2, P.ui2, 2, 'center');
  if (!moved && !over) {
    A.text(bc, 'UP TO GO', BW / 2, BH - 28, P.ui4, 1, 'center');
    A.text(bc, 'THE BOTTOM OF THE SCREEN IS RISING', BW / 2, BH - 18, P.uiDim, 1, 'center');
  }

  // ---- and up onto the cabinet ---------------------------------------
  // Set every frame rather than once: the cabinet does not own this flag
  // and nothing promises another game or a context reset has not cleared
  // it. It is a boolean assignment, not a state change worth avoiding.
  g.imageSmoothingEnabled = false;
  g.drawImage(buf, 0, 0, D.W, D.H);
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
  // STAND HIM ON SOMETHING. Row 31 is whatever the generator felt like,
  // and about half the time that is open water or a live lane - so the
  // card for the game was a GAME OVER screen with the wash over it, taken
  // a frame after the shutter opened. Walk out from 31 to the nearest
  // verge with a free column on it. Only ?shot does this; it is the
  // photographer moving the subject, not the game.
  let r = 31, col = 7;
  for (let d = 0; d <= 5; d++) {
    const cand = [31 + d, 31 - d];
    let found = false;
    for (const cr of cand) {
      const lane = rows[cr];
      if (!lane || lane.type !== 'grass') continue;
      for (let c = 7; c < COLS; c++) if (!blocked(cr, c)) { r = cr; col = c; found = true; break; }
      if (found) break;
    }
    if (found) break;
  }
  player.r = r; player.x = col * CELL; player.dir = 0;
  camRow = r - 5;
}

D.run(step);
