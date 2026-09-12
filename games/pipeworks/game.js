// =====================================================================
// PIPEWORKS - turn the pipes and get the water across
// =====================================================================
//
// Liam: *"multiple levels on pipeworks better graphics"*.
//
// SIX NAMED STAGES, each with its own room, its own palette and one new
// idea, so that "bigger grid" is not the only thing that ever changes:
//
//   1 THE CELLAR    plain pipe, small grid. Learn the turn.
//   2 THE WATERWORKS bigger, and the clock is tighter.
//   3 THE BOILER     some pipes are BOLTED DOWN - they cannot be turned,
//                    so the route has to be built around them.
//   4 THE ROOF       CROSSOVERS appear: a piece that carries water both
//                    ways at once and is never wrong.
//   5 THE FOUNDRY    bolted pipes and crossovers together, on a big grid.
//   6 THE DEEP       all of it, biggest grid, fastest water. Clear it and
//                    the stages start again one size larger.
//
// The generator is unchanged where it matters: the ANSWER is laid first
// as a random walk from inlet to outlet, the rest is filled with decoys,
// and every piece is then spun - so every board is solvable, and solvable
// in the number of turns it took to scramble it. A bolted piece is only
// ever laid ON the answer path and left unspun, so it is a hint rather
// than an obstacle. That distinction is the whole difference between a
// constraint and a trap.
//
// The graphics are the second half of the ask: pipes are now cased metal
// with a lighter bore and bolted flanges at the joints, the water fills
// them as a moving front rather than switching colour, the room behind is
// tiled and lit, and the rising flood has a surface that moves.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'pipeworks', w: 560, h: 640, bg: '#0d1117' });

const N = 1, E = 2, S = 4, W = 8;
const OPP = { [N]: S, [E]: W, [S]: N, [W]: E };
const DIRS = [[N, 0, -1], [E, 1, 0], [S, 0, 1], [W, -1, 0]];

// ---- the stages ------------------------------------------------------
//
// Liam: *"the pipeworks level one is kind of hard but I like it add in an
// infinte level genertor that slowly gets mroe hard"*.
//
// So: the six hand-made rooms below are the opening, and the first one is
// eight seconds longer than it was - it is the room where you learn what
// a turn costs, and it should not be tight. After those six the generator
// takes over and never stops.
//
// SLOWLY is the word that matters. The generated stages step ONE row or
// column every third stage and creep the bolt and crossover chances up by
// half a percent a stage, so the difficulty curve is felt over ten
// stages rather than jumped between two. The clock is derived from the
// board's own size, so a bigger room is never automatically a shorter
// one - what makes it harder is that there is more to turn.
const STAGES = [
  { name: 'THE CELLAR',     cols: 5, rows: 5, secs: 52, bolts: 0,   cross: 0,
    tile: '#2a2119', grout: '#1b150f', pipe: '#8a8f98', bore: '#5d636c', water: '#5fc8f5' },
  { name: 'THE WATERWORKS', cols: 6, rows: 6, secs: 46, bolts: 0,   cross: 0,
    tile: '#1c2a30', grout: '#121c21', pipe: '#8f9aa2', bore: '#5f6a72', water: '#6fe0e8' },
  { name: 'THE BOILER',     cols: 6, rows: 6, secs: 44, bolts: 0.18, cross: 0,
    tile: '#301d1a', grout: '#201210', pipe: '#a08772', bore: '#6d5a4b', water: '#ffb35c' },
  { name: 'THE ROOF',       cols: 7, rows: 6, secs: 48, bolts: 0,   cross: 0.14,
    tile: '#23303f', grout: '#18222e', pipe: '#9fb0bd', bore: '#6b7a86', water: '#8fd0ff' },
  { name: 'THE FOUNDRY',    cols: 7, rows: 7, secs: 52, bolts: 0.16, cross: 0.12,
    tile: '#2b2630', grout: '#1c1822', pipe: '#b09a86', bore: '#6f6055', water: '#ffd166' },
  { name: 'THE DEEP',       cols: 8, rows: 7, secs: 54, bolts: 0.14, cross: 0.14,
    tile: '#14232b', grout: '#0d181e', pipe: '#7f97a4', bore: '#54666f', water: '#57d3ff' },
];

// the rooms the generator names once it is past the hand-made six
const DEEPER = ['THE SUMP', 'THE CISTERN', 'THE HEADER TANK', 'THE RISER',
                'THE CULVERT', 'THE AQUEDUCT', 'THE OUTFALL', 'THE RESERVOIR',
                'THE PUMPING HALL', 'THE UNDERCROFT'];
const ROMAN = (n) => ['', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n % 10] || String(n);

/**
 * What stage `n` (0-based) is.
 *
 * The first six are the written rooms. After that it is generated, and
 * the ramp is deliberately gentle: a row or column every third stage, and
 * half a percent more bolts and crossovers per stage, both capped. The
 * palette rotates so two consecutive generated rooms never look alike.
 */
function stageAt(n) {
  if (n < STAGES.length) return STAGES[n];
  const k = n - STAGES.length;                       // 0, 1, 2, ...
  const grow = Math.floor(k / 3);
  const hue = (k * 47) % 360;
  const paint = (l, s) => 'hsl(' + hue + ' ' + s + '% ' + l + '%)';
  return {
    name: DEEPER[k % DEEPER.length] + (k >= DEEPER.length ? ' ' + ROMAN(Math.floor(k / DEEPER.length) + 1) : ''),
    cols: Math.min(11, 8 + Math.floor(grow / 1.5)),
    rows: Math.min(9, 7 + Math.floor(grow / 2)),
    // THE BOARD STOPS GROWING, THE CLOCK DOES NOT.
    //
    // Size and bolt density both hit a cap around stage 31 - past that an
    // 11x9 board of 24% bolted pipe is as much as the screen and the
    // puzzle can carry. So from there the pressure moves to the clock,
    // which takes a quarter of a second off every stage, for ever, down
    // to a floor of 26 seconds. That is what keeps stage 200 harder than
    // stage 100 without either of them being unreadable.
    secs: Math.max(26, 50 - Math.max(0, k - 24) * 0.25),
    bolts: Math.min(0.24, 0.12 + k * 0.005),
    cross: Math.min(0.22, 0.10 + k * 0.005),
    tile: paint(14, 22), grout: paint(9, 20),
    pipe: paint(62, 12), bore: paint(40, 10),
    water: paint(66, 78),
    generated: true,
  };
}

let S_, cols, rows, cell, ox, oy, grid, stage, ring, score, flow, water, over, won, started, msg, msgT, turns, best;

function reset(next) {
  if (next) { stage++; }
  S_ = stageAt(stage);
  ring = 0;
  cols = S_.cols; rows = S_.rows;
  cell = Math.min(Math.floor(470 / cols), Math.floor(420 / rows), 74);
  ox = (D.W - cols * cell) / 2; oy = 132;
  grid = build();
  flow = null; water = 0; over = false; won = false; turns = 0;
}

const drown = () => S_.secs + rows * 1.2;

/** the answer first, then the decoys, then the scramble */
function build() {
  const g = Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
  const start = { x: 0, y: Math.floor(rnd(0, rows)) };
  const end = { x: cols - 1, y: Math.floor(rnd(0, rows)) };
  const seen = new Set([start.y * cols + start.x]);
  const path = [start];
  let cur = { ...start }, guard = 0;
  while (!(cur.x === end.x && cur.y === end.y) && guard++ < 1200) {
    const opts = DIRS.map(([bit, dx, dy]) => ({ bit, x: cur.x + dx, y: cur.y + dy }))
      .filter((o) => o.x >= 0 && o.y >= 0 && o.x < cols && o.y < rows && !seen.has(o.y * cols + o.x));
    if (!opts.length) break;
    opts.sort((a, b2) => (Math.abs(a.x - end.x) + Math.abs(a.y - end.y))
                       - (Math.abs(b2.x - end.x) + Math.abs(b2.y - end.y)));
    const o = Math.random() < 0.66 ? opts[0] : pick(opts);
    seen.add(o.y * cols + o.x);
    path.push({ x: o.x, y: o.y, from: o.bit });
    cur = { x: o.x, y: o.y };
  }
  if (!(cur.x === end.x && cur.y === end.y)) return build();

  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    let bits = 0;
    if (i > 0) bits |= OPP[path[i].from];
    if (i < path.length - 1) bits |= path[i + 1].from;
    if (i === 0) bits |= W;
    if (i === path.length - 1) bits |= E;
    // A BOLTED PIECE IS ALWAYS ON THE ANSWER and always already correct.
    // Bolting a decoy would be a piece that can never be right, which is
    // not a puzzle, it is a wall with a pipe painted on it.
    const bolted = i > 0 && i < path.length - 1 && Math.random() < S_.bolts;
    g[p.y][p.x] = { bits, onPath: true, bolted, turn: 0 };
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (g[y][x]) continue;
    const cross = Math.random() < S_.cross;
    g[y][x] = { bits: cross ? (N | E | S | W)
                            : pick([N | S, E | W, N | E, N | W, S | E, S | W, N | E | S]),
                onPath: false, bolted: false, cross, turn: 0 };
  }
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (g[y][x].bolted) continue;
    const n = Math.floor(rnd(0, 4));
    for (let i = 0; i < n; i++) g[y][x].bits = rot(g[y][x].bits);
    g[y][x].turn = -n * Math.PI / 2;
  }
  g.start = start; g.end = end;
  return g;
}

const rot = (b) => ((b << 1) | (b >> 3)) & 15;

function connected() {
  const out = new Set();
  const key = (x, y) => y * cols + x;
  const q = [[grid.start.x, grid.start.y]];
  out.add(key(grid.start.x, grid.start.y));
  while (q.length) {
    const [x, y] = q.pop();
    const c = grid[y][x];
    for (const [bit, dx, dy] of DIRS) {
      if (!(c.bits & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (!(grid[ny][nx].bits & OPP[bit]) || out.has(key(nx, ny))) continue;
      out.add(key(nx, ny)); q.push([nx, ny]);
    }
  }
  return out;
}
const solved = () => connected().has(grid.end.y * cols + grid.end.x)
  && (grid[grid.end.y][grid.end.x].bits & E);

function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }
  if (over) {
    draw(g);
    D.card('SPILLED',
           ['score ' + score, 'stage ' + (stage + 1) + ' - ' + S_.name, 'record ' + board.best],
           'click for the home screen');
    if (D.tapped()) { home.finish(score, { stage: stage + 1 }); started = false; }
    return;
  }
  if (D.shot) { draw(g); return; }

  water += dt;

  if (!flow) {
    if (D.tapped()) {
      const mx = Math.floor((D.mouse.x - ox) / cell), my = Math.floor((D.mouse.y - oy) / cell);
      if (mx >= 0 && my >= 0 && mx < cols && my < rows) {
        const c = grid[my][mx];
        if (c.bolted) { D.beep(120, 0.07, 'square', 0.05); msg = 'BOLTED DOWN'; msgT = 0.9; }
        else {
          c.bits = rot(c.bits); c.turn += Math.PI / 2; turns++;
          D.beep(300 + rnd(0, 60), 0.04, 'square', 0.035);
          if (solved()) release();
        }
      }
    }
    if (D.held(' ', 'Space') && solved()) release();
    if (water > drown()) { over = true; won = false; D.record(score); D.noise(0.5, 0.08, 200); }
  } else {
    flow.t += dt * 3.0;
    if (flow.t >= flow.cells.length + 2) {
      const bonus = Math.max(0, Math.round((drown() - water) * 12));
      score += 100 * (stage + 1) + bonus;
      D.record(score);
      msg = S_.name + ' CLEAR   +' + (100 * (stage + 1) + bonus); msgT = 2.2;
      D.beep(760, 0.22, 'triangle', 0.06, 420);
      reset(true);
    }
  }

  for (const c of (grid.flat ? [] : [])) {}    // (no per-cell state to tick)
  if (msgT > 0) msgT -= dt;
  draw(g);
}

function release() {
  const path = [];
  const seenSet = new Set();
  const key = (x, y) => y * cols + x;
  const walk = (x, y) => {
    path.push([x, y]); seenSet.add(key(x, y));
    const c = grid[y][x];
    for (const [bit, dx, dy] of DIRS) {
      if (!(c.bits & bit)) continue;
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      if (!(grid[ny][nx].bits & OPP[bit]) || seenSet.has(key(nx, ny))) continue;
      walk(nx, ny);
    }
  };
  walk(grid.start.x, grid.start.y);
  flow = { cells: path, t: 0 };
  D.beep(200, 0.3, 'sine', 0.05, 300);
}

// =====================================================================
// the drawing
// =====================================================================
function draw(g) {
  if (!grid) return;
  const wet = flow ? new Set(flow.cells.slice(0, Math.floor(flow.t)).map(([x, y]) => y * cols + x)) : null;

  // the room: tiles and a warm lamp over the board
  g.fillStyle = S_.grout; g.fillRect(0, 0, D.W, D.H);
  const T = 28;
  for (let y = 0; y < D.H; y += T) for (let x = 0; x < D.W; x += T) {
    g.fillStyle = S_.tile;
    g.fillRect(x + 1, y + 1, T - 2, T - 2);
  }
  const lamp = g.createRadialGradient(D.W / 2, oy + rows * cell / 2, 20,
                                      D.W / 2, oy + rows * cell / 2, D.W * 0.75);
  lamp.addColorStop(0, 'rgba(255,236,190,.10)');
  lamp.addColorStop(1, 'rgba(0,0,0,.35)');
  g.fillStyle = lamp; g.fillRect(0, 0, D.W, D.H);

  // the flood, rising from the bottom, with a moving surface
  const lvl = clamp(water / drown(), 0, 1);
  const top = D.H - lvl * (D.H - 64);
  g.fillStyle = 'rgba(30,90,140,.42)';
  g.fillRect(0, top, D.W, D.H - top);
  g.fillStyle = 'rgba(140,220,255,.55)';
  for (let x = 0; x < D.W; x += 4) {
    g.fillRect(x, top + Math.sin(x * 0.06 + D.t * 3) * 2.5, 4, 2);
  }

  // the board's plate
  g.fillStyle = 'rgba(8,12,18,.55)';
  g.fillRect(ox - 8, oy - 8, cols * cell + 16, rows * cell + 16);

  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    const c = grid[y][x];
    const px = ox + x * cell, py = oy + y * cell, s = cell - 2;
    g.fillStyle = (x + y) % 2 ? 'rgba(255,255,255,.03)' : 'rgba(0,0,0,.12)';
    g.fillRect(px, py, s, s);
    if (c.bolted) { g.fillStyle = 'rgba(255,180,90,.07)'; g.fillRect(px, py, s, s); }
    pipe(g, c, px, py, s, wet && wet.has(y * cols + x));
  }

  // inlet and outlet, as valves on the wall
  const sx = ox + grid.start.x * cell, sy = oy + grid.start.y * cell;
  const ex = ox + grid.end.x * cell, ey = oy + grid.end.y * cell;
  valve(g, sx - 12, sy + cell / 2 - 1, '#57d38c');
  valve(g, ex + cell + 10, ey + cell / 2 - 1, '#ff9f43');
  D.text('IN', sx - 14, sy + cell / 2 + 24, 9, '#57d38c', 'center');
  D.text('OUT', ex + cell + 12, ey + cell / 2 + 24, 9, '#ff9f43', 'center');

  // the header
  D.hud('SCORE ' + (score || 0), flow ? 'FLOWING' :
        Math.max(0, Math.ceil(drown() - water)) + 's   BEST ' + D.best);
  D.text(S_.name, D.W / 2, 58, 15, '#e7ecf3', 'center');
  D.text('STAGE ' + (stage + 1) + ' · ' + cols + '×' + rows, D.W / 2, 78, 10, '#8b96a8', 'center');
  // the clock, as a bar under the title
  const t = clamp(1 - water / drown(), 0, 1);
  g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(ox, 92, cols * cell, 6);
  g.fillStyle = t < 0.25 ? '#ff6b8b' : S_.water;
  g.fillRect(ox, 92, cols * cell * t, 6);

  if (msgT > 0) D.text(msg, D.W / 2, 116, 13, '#57d38c', 'center');
}

/** one piece: casing, bore, flange bolts, and the water in it */
function pipe(g, c, px, py, s, live) {
  const cx = px + s / 2, cy = py + s / 2, L = s / 2;
  const ends = DIRS.filter(([bit]) => c.bits & bit);

  // casing
  g.strokeStyle = S_.pipe; g.lineWidth = Math.max(7, s * 0.30); g.lineCap = 'butt';
  for (const [, dx, dy] of ends) {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * L, cy + dy * L); g.stroke();
  }
  g.fillStyle = S_.pipe;
  g.beginPath(); g.arc(cx, cy, Math.max(4, s * 0.16), 0, 7); g.fill();

  // bore - the darker inside, which is what the water fills
  g.strokeStyle = live ? S_.water : S_.bore;
  g.lineWidth = Math.max(3, s * 0.15);
  for (const [, dx, dy] of ends) {
    g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + dx * L, cy + dy * L); g.stroke();
  }
  g.fillStyle = live ? S_.water : S_.bore;
  g.beginPath(); g.arc(cx, cy, Math.max(2.5, s * 0.09), 0, 7); g.fill();
  if (live) {
    // a highlight travelling along the bore, so flowing water moves
    g.strokeStyle = 'rgba(255,255,255,.35)';
    g.lineWidth = Math.max(1, s * 0.05);
    for (const [, dx, dy] of ends) {
      const t = (D.t * 1.6) % 1;
      g.beginPath();
      g.moveTo(cx + dx * L * t, cy + dy * L * t);
      g.lineTo(cx + dx * L * Math.min(1, t + 0.25), cy + dy * L * Math.min(1, t + 0.25));
      g.stroke();
    }
  }

  // flange bolts at each open end
  g.fillStyle = 'rgba(0,0,0,.35)';
  for (const [, dx, dy] of ends) {
    const bx = cx + dx * (L - s * 0.11), by = cy + dy * (L - s * 0.11);
    g.beginPath(); g.arc(bx + dy * s * 0.11, by + dx * s * 0.11, Math.max(1, s * 0.035), 0, 7); g.fill();
    g.beginPath(); g.arc(bx - dy * s * 0.11, by - dx * s * 0.11, Math.max(1, s * 0.035), 0, 7); g.fill();
  }

  // a bolted piece wears its bolts where you can see them
  if (c.bolted) {
    g.fillStyle = '#ffb35c';
    for (const [ddx, ddy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      g.beginPath();
      g.arc(cx + ddx * s * 0.36, cy + ddy * s * 0.36, Math.max(1.5, s * 0.05), 0, 7);
      g.fill();
    }
  }
  if (c.cross) {                      // a crossover is drawn as a bridge
    g.strokeStyle = 'rgba(0,0,0,.30)';
    g.lineWidth = Math.max(1, s * 0.04);
    g.beginPath(); g.arc(cx, cy, s * 0.22, 0, 7); g.stroke();
  }
}

function valve(g, x, y, col) {
  g.fillStyle = col;
  g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill();
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(x - 7, y); g.lineTo(x + 7, y); g.stroke();
  g.beginPath(); g.moveTo(x, y - 7); g.lineTo(x, y + 7); g.stroke();
}

const board = new Board('pipeworks', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'PIPEWORKS',
  lines: ['turn the pipes, join the inlet to the outlet',
          'six rooms by hand, then it generates them for ever',
          'bolted pipes are already right - build around them'],
  board,
  buttons: [{ label: 'OPEN THE VALVE', sub: 'the rising water is the clock',
              fn: () => { started = true; stage = 0; score = 0; reset(false); } }],
  hint: 'CLICK a pipe to turn it · SPACE releases the water early for a bonus',
});

stage = 0; score = 0; started = false; msg = ''; msgT = 0;
reset(false);

if (D.shot) {
  started = true; stage = 3; score = 1240; reset(false);
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(rnd(0, cols)), y = Math.floor(rnd(0, rows));
    if (!grid[y][x].bolted) grid[y][x].bits = rot(grid[y][x].bits);
  }
  water = 12;
}

D.run(step);
