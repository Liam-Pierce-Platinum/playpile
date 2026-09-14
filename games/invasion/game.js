// =====================================================================
// INVASION - five rows of them, coming down
// =====================================================================
//
// The 1978 one, and the thing worth copying from it is not the aliens, it
// is the TEMPO. Two details do all of that work and both are accidents of
// the original hardware that turned out to be the design:
//
//   THEY GET FASTER AS YOU KILL THEM. The machine could only redraw so
//   many sprites per frame, so a screen with five aliens left ran at six
//   times the speed of a full one. That is the entire arc of the game:
//   it starts as a shooting gallery and ends as a panic, and it does it
//   without a difficulty curve existing anywhere in the code. Here it is
//   explicit - the march interval is a function of how many are left.
//
//   ONE SHOT AT A TIME. You cannot hold the trigger. Every shot is a
//   commitment you have to wait out, which is what makes the bunkers
//   worth hiding behind and makes a missed shot cost something.
//
// THE BUNKERS ERODE PER PIXEL, not per hit. Each one is a little grid of
// blocks and a shot takes out the block it touches, so they wear away
// into exactly the shapes they do in the arcade - and your OWN shots eat
// them from underneath, which is the detail people remember.
import { Deck, clamp } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'invasion', w: 720, h: 620, bg: '#05070b' });
const TOP = 30;
const GROUND = D.H - 40;

const COLS = 11, ROWS = 5;
const AW = 30, AH = 22, GAPX = 16, GAPY = 14;

let ship, aliens, shot, bombs, bunkers, ufo, score, lives, wave, over, started;
let marchT, marchDir, marchStep, dead, flap, msg, msgT, ufoT;

const ALIEN_ROW = [3, 2, 2, 1, 1];            // which sprite each row uses
const ROW_SCORE = [30, 20, 20, 10, 10];

function reset(full) {
  ship = { x: D.W / 2, w: 40, h: 16, cool: 0 };
  shot = null; bombs = [];
  if (full) { score = 0; lives = 3; wave = 1; }
  over = false; dead = 0; msg = ''; msgT = 0;
  ufo = null; ufoT = 12 + Math.random() * 10;
  makeWave();
  makeBunkers();
}

function makeWave() {
  aliens = [];
  const x0 = (D.W - (COLS * AW + (COLS - 1) * GAPX)) / 2;
  const y0 = TOP + 56 + Math.min(4, wave - 1) * 18;      // they start lower each wave
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      aliens.push({ x: x0 + c * (AW + GAPX), y: y0 + r * (AH + GAPY), r, alive: true });
    }
  }
  marchDir = 1; marchT = 0; marchStep = 0; flap = 0;
}

function makeBunkers() {
  bunkers = [];
  const shape = [
    '..######..',
    '.########.',
    '##########',
    '##########',
    '###....###',
    '##......##',
  ];
  for (let b = 0; b < 4; b++) {
    const bx = 74 + b * (D.W - 148) / 3 - 40;
    const by = GROUND - 120;
    const blocks = [];
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x] === '#') blocks.push({ x: bx + x * 8, y: by + y * 8, hp: 1 });
      }
    }
    bunkers.push(blocks);
  }
}

// ---- the march -------------------------------------------------------
function march() {
  const alive = aliens.filter((a) => a.alive);
  if (!alive.length) {
    // the wave is cleared
    wave++;
    score += 100;
    msg = 'WAVE ' + wave; msgT = 1.6;
    D.beep(700, 0.3, 'triangle', 0.06, 400);
    makeWave();
    shot = null; bombs = [];
    return;
  }

  const minX = Math.min(...alive.map((a) => a.x));
  const maxX = Math.max(...alive.map((a) => a.x + AW));
  let drop = false;
  if (marchDir > 0 && maxX + 14 >= D.W - 10) drop = true;
  if (marchDir < 0 && minX - 14 <= 10) drop = true;

  if (drop) {
    marchDir *= -1;
    for (const a of aliens) a.y += 18;
  } else {
    for (const a of aliens) a.x += marchDir * 14;
  }
  flap ^= 1;
  // the four-note march, dropping a tone each step
  D.beep([110, 98, 87, 78][marchStep % 4], 0.07, 'square', 0.035);
  marchStep++;

  // have they landed?
  if (alive.some((a) => a.y + AH >= GROUND - 8)) end('THEY LANDED');
}

/** the whole arc of the game is in this one line - see the note at the top */
function marchEvery() {
  const n = aliens.filter((a) => a.alive).length;
  const full = COLS * ROWS;
  const t = n / full;
  return clamp(0.06 + t * 0.62, 0.055, 0.7) * Math.pow(0.9, wave - 1);
}

function drop() {
  // only the BOTTOM alien in a column can fire - anything else would be
  // shooting through its own friends
  const cols = new Map();
  for (const a of aliens) {
    if (!a.alive) continue;
    const key = Math.round(a.x / 4);
    if (!cols.has(key) || a.y > cols.get(key).y) cols.set(key, a);
  }
  const list = [...cols.values()];
  if (!list.length) return;
  const a = list[Math.floor(Math.random() * list.length)];
  bombs.push({ x: a.x + AW / 2, y: a.y + AH, vy: 180 + wave * 14 + Math.random() * 40, kind: Math.random() < 0.4 ? 1 : 0 });
}

function end(why) {
  over = true; dead = D.t; msg = why;
  D.noise(0.5, 0.1, 180);
}

function hitBunker(x, y) {
  for (const blocks of bunkers) {
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i];
      if (x >= b.x && x < b.x + 8 && y >= b.y && y < b.y + 8) {
        // take out a small cluster, so erosion looks bitten rather than pixelly
        for (let j = blocks.length - 1; j >= 0; j--) {
          const o = blocks[j];
          if (Math.abs(o.x - b.x) <= 8 && Math.abs(o.y - b.y) <= 8 && Math.random() < 0.7) blocks.splice(j, 1);
        }
        return true;
      }
    }
  }
  return false;
}

// ---- drawing ---------------------------------------------------------
// The aliens are drawn from strings, which is the cheapest way to get
// something that reads as a specific creature rather than a rectangle.
const SPRITES = {
  1: [['..#....#..', '...#..#...', '..######..', '.##.##.##.', '##########', '#.######.#', '#.#....#.#', '...##.##..'],
      ['..#....#..', '#..#..#..#', '#.######.#', '###.##.###', '##########', '.########.', '..#....#..', '.#......#.']],
  2: [['...####...', '.########.', '###.##.###', '##########', '..#.##.#..', '.##.##.##.', '##......##', '..##..##..'],
      ['...####...', '.########.', '###.##.###', '##########', '..#.##.#..', '.##.##.##.', '.#.####.#.', '#.#....#.#']],
  3: [['....##....', '...####...', '..######..', '.##.##.##.', '##########', '..#.##.#..', '.#.#..#.#.', '#.#....#.#'],
      ['....##....', '...####...', '..######..', '.##.##.##.', '##########', '..#.##.#..', '.#......#.', '..#....#..']],
};
const ROW_COL = ['#e05a5a', '#e0a14a', '#e0a14a', '#6fd4e0', '#6fd4e0'];

function sprite(g, art, x, y, w, h, col) {
  const cw = w / art[0].length, ch = h / art.length;
  g.fillStyle = col;
  for (let r = 0; r < art.length; r++) {
    for (let c = 0; c < art[r].length; c++) {
      if (art[r][c] === '#') g.fillRect(x + c * cw, y + r * ch, Math.ceil(cw), Math.ceil(ch));
    }
  }
}

function draw(g) {
  // the ground line
  g.fillStyle = '#2f6b3f';
  g.fillRect(0, GROUND + 6, D.W, 2);

  for (const a of aliens) {
    if (!a.alive) continue;
    sprite(g, SPRITES[ALIEN_ROW[a.r]][flap], a.x, a.y, AW, AH, ROW_COL[a.r]);
  }

  if (ufo) {
    g.fillStyle = '#d95cc8';
    g.beginPath();
    if (g.ellipse) g.ellipse(ufo.x, ufo.y, 22, 8, 0, 0, 7); else g.arc(ufo.x, ufo.y, 14, 0, 7);
    g.fill();
    g.fillStyle = '#f0a8e4';
    g.fillRect(ufo.x - 8, ufo.y - 11, 16, 6);
  }

  for (const blocks of bunkers) {
    g.fillStyle = '#4fc26a';
    for (const b of blocks) g.fillRect(b.x, b.y, 8, 8);
  }

  // the ship
  g.fillStyle = '#e7ecf3';
  g.fillRect(ship.x - ship.w / 2, GROUND - ship.h, ship.w, ship.h - 6);
  g.fillRect(ship.x - 4, GROUND - ship.h - 8, 8, 10);
  g.fillStyle = '#6fd4e0';
  g.fillRect(ship.x - ship.w / 2, GROUND - 6, ship.w, 6);

  if (shot) { g.fillStyle = '#fff'; g.fillRect(shot.x - 1.5, shot.y, 3, 14); }
  for (const b of bombs) {
    g.fillStyle = b.kind ? '#e0a14a' : '#e05a5a';
    if (b.kind) {
      // a zigzag one, for variety
      const w = Math.sin((b.y + D.t * 300) * 0.25) * 3;
      g.fillRect(b.x - 1.5 + w, b.y, 3, 10);
    } else g.fillRect(b.x - 1.5, b.y, 3, 12);
  }

  D.hud('SCORE ' + score + '   WAVE ' + wave,
        '▲'.repeat(Math.max(0, lives - 1)) + '   BEST ' + D.best);

  if (msgT > 0) D.text(msg, D.W / 2, D.H / 2 - 30, 26, '#ff9f43', 'center');
}

// ---- the loop --------------------------------------------------------
function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }
  if (msgT > 0) msgT -= dt;

  if (!over) {
    // the ship
    const sp = 320;
    if (D.held('ArrowLeft', 'a', 'A')) ship.x -= sp * dt;
    if (D.held('ArrowRight', 'd', 'D')) ship.x += sp * dt;
    if (D.mouse.down || Math.abs(D.mouse.dx) > 0.01) ship.x = D.mouse.x;
    ship.x = clamp(ship.x, ship.w / 2 + 6, D.W - ship.w / 2 - 6);

    // ONE SHOT AT A TIME - the whole economy of the game
    if ((D.held(' ', 'Space') || D.mouse.down) && !shot) {
      shot = { x: ship.x, y: GROUND - ship.h - 12 };
      D.beep(880, 0.06, 'square', 0.04, -400);
    }

    if (shot) {
      shot.y -= 620 * dt;
      if (hitBunker(shot.x, shot.y)) shot = null;
      else if (shot.y < TOP) shot = null;
      else {
        for (const a of aliens) {
          if (!a.alive) continue;
          if (shot.x > a.x && shot.x < a.x + AW && shot.y > a.y && shot.y < a.y + AH) {
            a.alive = false; shot = null;
            score += ROW_SCORE[a.r];
            D.noise(0.1, 0.05, 1200);
            D.beep(520, 0.07, 'square', 0.04, -260);
            break;
          }
        }
      }
      if (shot && ufo && Math.abs(shot.x - ufo.x) < 24 && Math.abs(shot.y - ufo.y) < 12) {
        score += ufo.worth; ufo = null; shot = null;
        D.beep(1000, 0.25, 'triangle', 0.07, 600);
      }
    }

    // the march
    marchT += dt;
    if (marchT >= marchEvery()) { marchT = 0; march(); }

    // bombs
    const alive = aliens.filter((a) => a.alive).length;
    if (Math.random() < dt * (0.7 + wave * 0.25) && bombs.length < 2 + Math.floor(wave / 2)) drop();
    for (let i = bombs.length - 1; i >= 0; i--) {
      const b = bombs[i];
      b.y += b.vy * dt;
      if (hitBunker(b.x, b.y)) { bombs.splice(i, 1); continue; }
      if (b.y > GROUND) { bombs.splice(i, 1); continue; }
      if (b.y > GROUND - ship.h - 10 && Math.abs(b.x - ship.x) < ship.w / 2) {
        bombs.splice(i, 1);
        lives--;
        D.noise(0.4, 0.09, 200);
        if (lives <= 0) end('GAME OVER');
        else { msg = String(lives) + ' LEFT'; msgT = 1.2; bombs = []; shot = null; }
        continue;
      }
      // a bomb and your shot can cancel
      if (shot && Math.abs(b.x - shot.x) < 6 && Math.abs(b.y - shot.y) < 12) {
        bombs.splice(i, 1); shot = null; D.noise(0.08, 0.04, 1500);
      }
    }

    // the saucer
    ufoT -= dt;
    if (ufoT <= 0 && !ufo) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      ufo = { x: dir > 0 ? -30 : D.W + 30, y: TOP + 26, vx: dir * 130, worth: [50, 100, 150, 300][Math.floor(Math.random() * 4)] };
      ufoT = 16 + Math.random() * 14;
    }
    if (ufo) {
      ufo.x += ufo.vx * dt;
      if (D.frame % 8 === 0) D.beep(420 + Math.sin(D.t * 9) * 120, 0.05, 'sine', 0.02);
      if (ufo.x < -50 || ufo.x > D.W + 50) ufo = null;
    }
  }

  draw(g);

  if (over) {
    D.card(msg, [score + ' points', 'wave ' + wave], 'click or SPACE for the board');
    if (D.t - dead > 0.7 && D.tapped()) { home.finish(score, { wave }); started = false; }
  }
}

const board = new Board('invasion', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'INVASION',
  lines: ['they march faster the fewer of them are left',
          'one shot at a time - a miss costs you the wait',
          'the bunkers wear away, and your own shots eat them too'],
  board,
  buttons: [{ label: 'PLAY', sub: 'arrows or mouse · space to fire',
              fn: () => { reset(true); started = true; } }],
  hint: '← → or MOUSE to move · SPACE or CLICK to fire · P pause · R restart',
});

reset(true); started = false;

if (D.shot) {
  started = true;
  score = 1870; wave = 2; lives = 3;
  for (const a of aliens) if (a.r > 2 || Math.random() < 0.45) a.alive = false;
  for (const a of aliens) a.y += 40;
  shot = { x: 300, y: 300 };
  bombs = [{ x: 420, y: 340, vy: 200, kind: 0 }, { x: 180, y: 260, vy: 200, kind: 1 }];
  ufo = { x: 520, y: TOP + 26, vx: -130, worth: 150 };
  for (const blocks of bunkers) for (let i = blocks.length - 1; i >= 0; i--) if (Math.random() < 0.3) blocks.splice(i, 1);
}

D.run(step);
