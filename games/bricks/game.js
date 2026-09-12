// =====================================================================
// BRICKS - breakout, with a paddle that shrinks as you dawdle
// =====================================================================
//
// Breakout is a solved design and the temptation is to add things to it.
// The two changes here are both about the same problem, which is that
// the last four bricks of a level are the boring part:
//
//   THE PADDLE SHRINKS on a timer inside a level, and comes back to full
//   width on a clear. So the level gets harder the longer you take, and
//   hunting the last brick with an inch of paddle is a real cost.
//
//   DROPS FALL FROM BRICKS, and you have to leave the ball to get them.
//   Every powerup is therefore a decision rather than a gift.
//
// The angle off the paddle is the classic one - where you hit it, not
// what angle it came in at - because that is the rule that turns the
// game from luck into aim.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'bricks', w: 640, h: 480, bg: '#080b11' });
const COLS = 10, ROWS = 6, BW = 56, BH = 18, TOP = 62, GAP = 4;
const PAD_FULL = 104, PAD_MIN = 46;

let bricks, balls, pad, drops, lives, score, level, over, started, msg, msgT;
let padBy = "mouse", lastMouse = 0;

function reset(full) {
  if (full) { score = 0; lives = 3; level = 1; }
  pad = { x: D.W / 2, w: PAD_FULL, y: D.H - 28, laser: 0 };
  drops = []; over = false; msg = ''; msgT = 0;
  makeLevel();
  serve();
}

function makeLevel() {
  bricks = [];
  const ox = (D.W - (COLS * (BW + GAP) - GAP)) / 2;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      // a row of steel every level from 2, and it moves down the wall as
      // the levels go up so the same shot never clears the same wall
      const steel = level > 1 && r === (level % ROWS);
      if (!steel && Math.random() < 0.06) continue;      // holes to shoot through
      bricks.push({
        x: ox + c * (BW + GAP), y: TOP + r * (BH + GAP), w: BW, h: BH,
        hp: steel ? 2 : 1, steel,
        hue: steel ? 210 : (14 + r * 26) % 360,
      });
    }
  }
}

function serve() {
  balls = [{ x: pad.x, y: pad.y - 12, vx: 0, vy: 0, r: 6, stuck: true }];
}

function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }
  if (over) {
    draw(g);
    D.card(msg, ['score ' + score, 'wall ' + level, 'best ' + board.best],
           'click for the home screen');
    if (D.tapped()) { home.finish(score, { level }); started = false; }
    return;
  }

  // ---- paddle -------------------------------------------------------
  // THE LAST INPUT YOU USED IS THE ONE THAT DRIVES THE PADDLE.
  //
  // This used to set the paddle from the mouse every frame and then nudge
  // it with the keys, so the next frame put it straight back under the
  // pointer: the arrow keys moved it about seven pixels and it snapped
  // home. Keys win while they are held; the mouse takes over the moment
  // it actually moves, rather than merely existing at a position.
  // THE MOUSE IS CHECKED FIRST, so that moving it always takes the paddle
  // back. The first version only looked at the mouse when no key was
  // down, which meant a key the browser never delivered a keyup for (lose
  // focus while it is held and the keyup goes somewhere else) drove the
  // paddle into the wall and NOTHING could get it back. The engine now
  // clears held keys when focus goes, and this is the second line of
  // defence: the hand you are actually using wins.
  const kL = D.held('ArrowLeft', 'KeyA', 'a', 'A');
  const kR = D.held('ArrowRight', 'KeyD', 'd', 'D');
  if (D.mouse.x !== lastMouse) padBy = 'mouse';
  else if (kL || kR) padBy = 'key';
  if (padBy === 'key' && (kL || kR)) pad.x += ((kR ? 1 : 0) - (kL ? 1 : 0)) * 520 * dt;
  else if (padBy === 'mouse') pad.x = D.mouse.x;
  lastMouse = D.mouse.x;
  pad.x = clamp(pad.x, pad.w / 2, D.W - pad.w / 2);
  // the shrink: about 25 seconds from full to minimum
  pad.w = Math.max(PAD_MIN, pad.w - (PAD_FULL - PAD_MIN) / 25 * dt);

  if (D.tapped()) for (const b of balls) if (b.stuck) {
    b.stuck = false;
    const a = -Math.PI / 2 + rnd(-0.5, 0.5);
    const sp = 300 + level * 12;
    b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
    D.beep(660, 0.06, 'square', 0.05);
  }

  // ---- balls --------------------------------------------------------
  for (const b of balls) {
    if (b.stuck) { b.x = pad.x; b.y = pad.y - 12; continue; }
    // STEPPED, so a fast ball cannot pass through a brick between frames
    const steps = Math.ceil(Math.hypot(b.vx, b.vy) * dt / 6) || 1;
    for (let s = 0; s < steps; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx); D.beep(300, .03, 'square', .03); }
      if (b.x > D.W - b.r) { b.x = D.W - b.r; b.vx = -Math.abs(b.vx); D.beep(300, .03, 'square', .03); }
      if (b.y < 34 + b.r) { b.y = 34 + b.r; b.vy = Math.abs(b.vy); D.beep(300, .03, 'square', .03); }

      // paddle: WHERE it hits decides the angle
      if (b.vy > 0 && b.y + b.r > pad.y && b.y - b.r < pad.y + 12 &&
          b.x > pad.x - pad.w / 2 - b.r && b.x < pad.x + pad.w / 2 + b.r) {
        const t = clamp((b.x - pad.x) / (pad.w / 2), -1, 1);
        const a = -Math.PI / 2 + t * 1.05;
        const sp = Math.min(560, Math.hypot(b.vx, b.vy) * 1.012);
        b.vx = Math.cos(a) * sp; b.vy = Math.sin(a) * sp;
        b.y = pad.y - b.r;
        D.beep(440, 0.05, 'square', 0.05);
      }

      for (let i = 0; i < bricks.length; i++) {
        const k = bricks[i];
        if (b.x + b.r < k.x || b.x - b.r > k.x + k.w ||
            b.y + b.r < k.y || b.y - b.r > k.y + k.h) continue;
        // which face - the smaller overlap is the one it came through
        const ox = Math.min(b.x + b.r - k.x, k.x + k.w - (b.x - b.r));
        const oy = Math.min(b.y + b.r - k.y, k.y + k.h - (b.y - b.r));
        if (ox < oy) b.vx = -b.vx; else b.vy = -b.vy;
        k.hp--;
        if (k.hp <= 0) {
          bricks.splice(i, 1);
          score += k.steel ? 25 : 10;
          D.beep(520 + rnd(0, 120), 0.05, 'triangle', 0.05, -160);
          if (Math.random() < 0.13) drops.push({
            x: k.x + k.w / 2, y: k.y + k.h / 2, vy: 110,
            kind: pick(['wide', 'multi', 'slow', 'life', 'wide', 'multi']),
          });
        } else { D.beep(180, 0.05, 'square', 0.05); }
        break;
      }
    }
  }
  balls = balls.filter((b) => b.y < D.H + 40);

  if (!balls.length) {
    lives--;
    D.noise(0.3, 0.07, 240);
    if (lives <= 0) { over = true; msg = 'GAME OVER'; D.record(score); }
    else { pad.w = Math.max(pad.w, PAD_FULL * 0.8); serve(); }
  }

  // ---- drops --------------------------------------------------------
  for (const d of drops) d.y += d.vy * dt;
  drops = drops.filter((d) => {
    if (d.y > D.H) return false;
    if (d.y > pad.y - 8 && Math.abs(d.x - pad.x) < pad.w / 2 + 10) {
      take(d.kind); return false;
    }
    return true;
  });

  if (!bricks.length) {
    level++; score += 100;
    msg = 'WALL ' + level; msgT = 1.6;
    pad.w = PAD_FULL;
    makeLevel(); serve();
    D.beep(700, 0.16, 'triangle', 0.06, 400);
  }
  if (msgT > 0) msgT -= dt;

  draw(g);
}

function take(kind) {
  D.beep(880, 0.12, 'triangle', 0.06, 300);
  if (kind === 'wide') pad.w = Math.min(PAD_FULL * 1.5, pad.w + 40);
  if (kind === 'slow') for (const b of balls) { b.vx *= 0.72; b.vy *= 0.72; }
  if (kind === 'life') { lives++; score += 50; }
  if (kind === 'multi') {
    const src = balls.filter((b) => !b.stuck);
    for (const b of src.slice(0, 2)) {
      for (const a of [-0.5, 0.5]) {
        const sp = Math.hypot(b.vx, b.vy), th = Math.atan2(b.vy, b.vx) + a;
        balls.push({ x: b.x, y: b.y, vx: Math.cos(th) * sp, vy: Math.sin(th) * sp, r: 6, stuck: false });
      }
    }
  }
  msg = kind.toUpperCase(); msgT = 1.1;
}

const DROPCOL = { wide: '#57d38c', multi: '#ff9f43', slow: '#4dc9ff', life: '#ff6b8b' };

function draw(g) {
  for (const k of bricks) {
    g.fillStyle = k.steel ? (k.hp > 1 ? '#5b6d80' : '#3f4d5c')
                          : 'hsl(' + k.hue + ' 58% 52%)';
    g.fillRect(k.x, k.y, k.w, k.h);
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.fillRect(k.x, k.y, k.w, 3);
  }
  for (const d of drops) {
    g.fillStyle = DROPCOL[d.kind];
    g.fillRect(d.x - 9, d.y - 5, 18, 10);
    D.text(d.kind[0].toUpperCase(), d.x, d.y + 4, 9, '#0a0e14', 'center');
  }
  g.fillStyle = '#e7ecf3';
  g.fillRect(pad.x - pad.w / 2, pad.y, pad.w, 9);
  g.fillStyle = '#ff9f43';
  g.fillRect(pad.x - 2, pad.y, 4, 9);
  for (const b of balls) {
    g.fillStyle = '#fff';
    g.beginPath(); g.arc(b.x, b.y, b.r, 0, 7); g.fill();
  }
  D.hud('SCORE ' + score + '   WALL ' + level,
        '♥ '.repeat(Math.max(0, lives)) + '  BEST ' + D.best);
  if (msgT > 0) D.text(msg, D.W / 2, D.H / 2, 22, '#ff9f43', 'center');
}

const board = new Board('bricks', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'BRICKS',
  lines: ['the paddle shrinks the longer a wall takes',
          'where the ball hits the paddle decides the angle',
          'drops are worth leaving the ball for'],
  board,
  buttons: [{ label: 'PLAY', sub: 'three balls, walls until you miss', fn: () => { started = true; reset(true); } }],
  hint: 'MOUSE or A D to move · CLICK to launch · P pause',
});

reset(true); started = false;

// the card on the home page: a wall halfway down, a ball in flight
if (D.shot) {
  started = true; level = 2; score = 1240; makeLevel();
  bricks = bricks.filter((k, i) => i % 7 !== 0 && k.y < TOP + 4 * (BH + GAP));
  balls = [{ x: D.W * 0.42, y: D.H * 0.62, vx: 240, vy: -260, r: 6, stuck: false }];
  drops = [{ x: D.W * 0.62, y: D.H * 0.44, vy: 110, kind: 'multi' }];
  pad.x = D.W * 0.55;
}

D.run(step);
