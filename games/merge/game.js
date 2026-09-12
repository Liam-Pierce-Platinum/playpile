// =====================================================================
// MERGE - drop them in, match two, get a bigger one
// =====================================================================
//
// Liam: *"better graphics and slightly more difficult for merge"*.
//
// THE LOOK. The pieces were flat discs, which is the version of this game
// everybody has already played on a free-to-play site. They are now
// FRUIT: each size is its own thing with its own highlight, its own rim
// shade and its own leaf or stalk, drawn with the same three passes that
// make anything round look round -
//
//   a radial base (light where the light is, dark at the far rim),
//   a soft occlusion arc at the bottom where it sits on what is under it,
//   one hard specular dot, off-centre, in the direction of the light.
//
// - and the jar is now a jar: wooden feet, a glass front with a vertical
// sheen down one side, and a rim that catches the light. The background
// is warm rather than another shade of the same near-black, so the fruit
// separates from it without needing outlines.
//
// HARDER, in three ways that all push the same direction - the jar fills
// sooner, so the decision of where to put a piece matters earlier:
//   the jar is NARROWER (a piece takes up proportionally more of it),
//   the grace over the line is 1.2 seconds rather than 2,
//   and the fifth size is now in the drop pool, so you are occasionally
//   handed something big and have to find a home for it.
import { Deck, clamp, rnd, pick } from '../_deck/deck.js';
import { Board } from '../_deck/board.js';
import { Home } from '../_deck/home.js';

const D = new Deck({ key: 'merge', w: 420, h: 640, bg: '#2a1f1a' });

// ---------------------------------------------------------------------
// A THOUSAND STAGES
// ---------------------------------------------------------------------
//
// Liam: *"mak it have a thousand evolution stages"*.
//
// The eleven hand-made fruit below are stages 1-11 and stay exactly as
// they were. Everything above them is GENERATED, because a thousand
// hand-drawn fruit is not a thing anybody wants to look at and, more
// importantly, because size cannot keep growing: a jar 320 px wide runs
// out of room at about stage 12, so a game that only got bigger would
// end there whatever the art was.
//
// So the chain WRAPS. Every eleven stages is a CYCLE: the radius runs
// back down to the smallest and starts climbing again, and the new cycle
// is marked instead -
//
//   cycle 1  the plain fruit (1-11)
//   cycle 2  each fruit wears a RING, and the palette turns over
//   cycle 3  a ring and a CROWN of pips
//   cycle 4+ the ring count goes up, then the pip count, then both
//
// - and the stage NUMBER is printed on anything past the first cycle, so
// a small piece that is worth thousands is obviously not a cherry. A
// merge is therefore always legible (two identical things become one
// thing) and the jar never runs out of room, which is what lets the
// chain run to a thousand rather than to eleven.
const CYCLE = 11;
const STAGES = 1000;

/** everything about stage `t`, made on demand and cached */
const tierCache = new Map();
function tier(t) {
  t = Math.min(t, STAGES - 1);
  if (tierCache.has(t)) return tierCache.get(t);
  const base = BASE[t % CYCLE];
  const cycle = Math.floor(t / CYCLE);
  let v;
  if (cycle === 0) v = { ...base, stage: t + 1, rings: 0, pips: 0 };
  else {
    // the hue walks on by a third of the wheel per cycle, so two cycles
    // are never confusable, and the value grows geometrically
    const hueShift = (cycle * 113) % 360;
    v = {
      r: base.r,
      col: shiftHue(base.col, hueShift),
      dark: shiftHue(base.dark, hueShift),
      kind: base.kind,
      pts: Math.round(base.pts * Math.pow(2.6, cycle)),
      stage: t + 1,
      rings: Math.min(3, 1 + Math.floor((cycle - 1) / 3)),
      pips: (cycle - 1) % 3,
    };
  }
  tierCache.set(t, v);
  return v;
}

function shiftHue(hex, deg) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) / 255, g2 = ((n >> 8) & 255) / 255, b2 = (n & 255) / 255;
  const mx = Math.max(r, g2, b2), mn = Math.min(r, g2, b2), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === r) h = ((g2 - b2) / d) % 6;
    else if (mx === g2) h = (b2 - r) / d + 2;
    else h = (r - g2) / d + 4;
  }
  h = (h * 60 + deg + 360) % 360;
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs((h / 60) % 2 - 1)), m = l - c / 2;
  let rr, gg, bb;
  if (h < 60) [rr, gg, bb] = [c, x, 0];
  else if (h < 120) [rr, gg, bb] = [x, c, 0];
  else if (h < 180) [rr, gg, bb] = [0, c, x];
  else if (h < 240) [rr, gg, bb] = [0, x, c];
  else if (h < 300) [rr, gg, bb] = [x, 0, c];
  else [rr, gg, bb] = [c, 0, x];
  const hx = (v) => Math.round((v + m) * 255).toString(16).padStart(2, '0');
  return '#' + hx(rr) + hx(gg) + hx(bb);
}

// the eleven hand-made ones, which are also the shape of every cycle
const BASE = [
  { r: 13, col: '#ff6b8b', dark: '#c23a5c', kind: 'cherry', pts: 1 },
  { r: 17, col: '#ff9f43', dark: '#c66a13', kind: 'berry',  pts: 3 },
  { r: 22, col: '#ffd166', dark: '#c89a24', kind: 'plum',   pts: 6 },
  { r: 27, col: '#a8e05f', dark: '#6ba327', kind: 'lime',   pts: 10 },
  { r: 33, col: '#57d38c', dark: '#22945a', kind: 'apple',  pts: 15 },
  { r: 40, col: '#4dc9ff', dark: '#1a86bb', kind: 'plum',   pts: 21 },
  { r: 47, col: '#6f8cff', dark: '#3149c4', kind: 'apple',  pts: 28 },
  { r: 55, col: '#b07cff', dark: '#6f38c4', kind: 'melon',  pts: 36 },
  { r: 63, col: '#ff7cf0', dark: '#c033ab', kind: 'melon',  pts: 45 },
  { r: 72, col: '#ffe9a8', dark: '#c9ab52', kind: 'melon',  pts: 55 },
  { r: 82, col: '#ff5a4a', dark: '#a8241a', kind: 'melon',  pts: 100 },
];
// NARROWER THAN IT WAS (372 -> 320), which is most of the extra difficulty
const JAR = { x: 50, y: 118, w: 320, h: 500 };
const LINE = JAR.y + 26;
const GRAV = 1500;
const GRACE = 1.2;

let balls, next, queued, score, over, started, dropT, overT, pops, shake, best;

function reset() {
  balls = []; score = 0; over = false; dropT = 0; overT = 0; pops = []; shake = 0; best = 1;
  next = roll(); queued = roll();
}
// THE FIFTH SIZE IS IN THE POOL NOW, rarely. Being handed an apple when
// the jar is half full is the moment this game gets interesting.
const roll = () => Math.random() < 0.09 ? 4 : Math.floor(rnd(0, 4));

function add(x, y, t, vx = 0, vy = 0) {
  balls.push({ x, y, vx, vy, t, r: tier(t).r, born: D.t, spin: rnd(0, 6.28), vs: rnd(-1, 1) });
}

function step(dt, g) {
  if (!started) { draw(g); home.step(dt); return; }
  if (over) {
    draw(g);
    D.card('FULL', ['score ' + score, 'best stage ' + best, 'record ' + board.best],
           'click for the home screen');
    if (D.tapped()) { home.finish(score, { stage: best }); started = false; }
    return;
  }

  const aimX = clamp(D.mouse.x, JAR.x + tier(next).r + 2, JAR.x + JAR.w - tier(next).r - 2);
  dropT -= dt;
  if (D.tapped() && dropT <= 0 && !D.shot) {
    add(aimX, JAR.y - 6, next, 0, 60);
    next = queued; queued = roll();
    dropT = 0.30;
    D.beep(300, 0.05, 'sine', 0.04);
  }

  // ---- the simulation, in substeps ----------------------------------
  const SUB = 3, h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    for (const ball of balls) {
      ball.vy += GRAV * h;
      ball.x += ball.vx * h; ball.y += ball.vy * h;
      ball.spin += ball.vs * h;
      if (ball.x - ball.r < JAR.x) { ball.x = JAR.x + ball.r; ball.vx = Math.abs(ball.vx) * 0.35; }
      if (ball.x + ball.r > JAR.x + JAR.w) { ball.x = JAR.x + JAR.w - ball.r; ball.vx = -Math.abs(ball.vx) * 0.35; }
      if (ball.y + ball.r > JAR.y + JAR.h) {
        ball.y = JAR.y + JAR.h - ball.r; ball.vy = -Math.abs(ball.vy) * 0.18; ball.vx *= 0.86;
      }
    }
    for (let i = 0; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], c = balls[j];
        const dx = c.x - a.x, dy = c.y - a.y;
        const d = Math.hypot(dx, dy), min = a.r + c.r;
        if (d >= min || d === 0) continue;
        if (a.t === c.t && a.t < STAGES - 1) {
          const t = a.t + 1;
          const x = (a.x + c.x) / 2, y = (a.y + c.y) / 2;
          balls.splice(j, 1); balls.splice(i, 1);
          add(x, y, t, (a.vx + c.vx) * 0.3, (a.vy + c.vy) * 0.3 - 60);
          score += tier(t).pts;
          if (t + 1 > best) best = t + 1;      // the furthest up the chain this run got
          burst(x, y, tier(t));
          shake = Math.min(5, 1 + t * 0.4);
          D.beep(240 + t * 70, 0.10, 'triangle', 0.05, 200);
          i = Math.max(-1, i - 1);
          break;
        }
        const nx = dx / d, ny = dy / d, push = min - d;
        const ma = c.r / (a.r + c.r), mc = a.r / (a.r + c.r);
        a.x -= nx * push * ma; a.y -= ny * push * ma;
        c.x += nx * push * mc; c.y += ny * push * mc;
        const rel = (c.vx - a.vx) * nx + (c.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -rel * 0.42;
          a.vx -= nx * imp * ma; a.vy -= ny * imp * ma;
          c.vx += nx * imp * mc; c.vy += ny * imp * mc;
        }
      }
    }
    for (const ball of balls) {
      ball.vx *= 0.999; ball.vs *= 0.98;
      if (Math.abs(ball.vx) < 3) ball.vx = 0;
      if (Math.abs(ball.vy) < 3 && ball.y + ball.r > JAR.y + JAR.h - 1) ball.vy = 0;
    }
  }

  const above = balls.some((ball) => ball.y - ball.r < LINE && D.t - ball.born > 0.9 && Math.abs(ball.vy) < 40);
  overT = above ? overT + dt : 0;
  if (overT > GRACE) { over = true; D.record(score); D.noise(0.5, 0.08, 220); }

  for (const q of pops) { q.life -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 700 * dt; }
  pops = pops.filter((q) => q.life > 0);
  shake *= 0.86;

  draw(g, aimX);
}

function burst(x, y, T) {
  for (let i = 0; i < 12; i++) {
    const a = rnd(0, 6.283), sp = rnd(80, 260);
    pops.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
                life: rnd(0.25, 0.55), col: i % 3 ? T.col : '#fff', r: rnd(2, 5) });
  }
}

// =====================================================================
// the drawing
// =====================================================================
function draw(g, aimX) {
  // a warm room rather than another near-black rectangle
  const bg = g.createLinearGradient(0, 0, 0, D.H);
  bg.addColorStop(0, '#37281f'); bg.addColorStop(0.55, '#2a1f1a'); bg.addColorStop(1, '#1d1512');
  g.fillStyle = bg; g.fillRect(0, 0, D.W, D.H);
  // a table the jar stands on
  g.fillStyle = '#4a3222'; g.fillRect(0, JAR.y + JAR.h + 16, D.W, D.H);
  g.fillStyle = '#5a3d29'; g.fillRect(0, JAR.y + JAR.h + 16, D.W, 4);

  g.save();
  g.translate(rnd(-shake, shake), rnd(-shake, shake));

  // ---- the jar, behind --------------------------------------------
  g.fillStyle = 'rgba(10,14,20,.55)';
  g.fillRect(JAR.x, JAR.y, JAR.w, JAR.h);
  // the glass sheen down the left, and a soft one on the right
  const sheen = g.createLinearGradient(JAR.x, 0, JAR.x + JAR.w, 0);
  sheen.addColorStop(0, 'rgba(255,255,255,.10)');
  sheen.addColorStop(0.12, 'rgba(255,255,255,.03)');
  sheen.addColorStop(0.8, 'rgba(255,255,255,0)');
  sheen.addColorStop(1, 'rgba(255,255,255,.06)');
  g.fillStyle = sheen; g.fillRect(JAR.x, JAR.y, JAR.w, JAR.h);

  // the line, which reddens as you sit over it
  const danger = clamp(overT / GRACE, 0, 1);
  g.strokeStyle = danger > 0 ? 'rgba(255,107,139,' + (0.35 + danger * 0.65) + ')'
                             : 'rgba(220,200,170,.28)';
  g.setLineDash([7, 7]); g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(JAR.x, LINE); g.lineTo(JAR.x + JAR.w, LINE); g.stroke();
  g.setLineDash([]);

  for (const ball of balls || []) fruit(g, ball);

  for (const q of pops || []) {
    g.globalAlpha = clamp(q.life * 2.4, 0, 1);
    g.fillStyle = q.col;
    g.beginPath(); g.arc(q.x, q.y, q.r, 0, 7); g.fill();
  }
  g.globalAlpha = 1;

  // ---- the jar, in front -------------------------------------------
  g.lineWidth = 4;
  g.strokeStyle = '#7b5c3f';
  g.beginPath();
  g.moveTo(JAR.x - 2, JAR.y); g.lineTo(JAR.x - 2, JAR.y + JAR.h);
  g.lineTo(JAR.x + JAR.w + 2, JAR.y + JAR.h); g.lineTo(JAR.x + JAR.w + 2, JAR.y);
  g.stroke();
  g.fillStyle = '#8a6845';
  g.fillRect(JAR.x - 10, JAR.y + JAR.h, JAR.w + 20, 14);
  g.fillStyle = '#a07c53';
  g.fillRect(JAR.x - 10, JAR.y + JAR.h, JAR.w + 20, 4);
  g.fillStyle = '#7b5c3f';
  g.fillRect(JAR.x - 14, JAR.y - 10, JAR.w + 28, 10);
  g.fillStyle = '#9b7750';
  g.fillRect(JAR.x - 14, JAR.y - 10, JAR.w + 28, 3);

  g.restore();

  // ---- what is coming ----------------------------------------------
  if (started && !over && aimX !== undefined) {
    g.strokeStyle = 'rgba(255,235,200,.16)'; g.lineWidth = 1;
    g.setLineDash([4, 6]);
    g.beginPath(); g.moveTo(aimX, JAR.y); g.lineTo(aimX, JAR.y + JAR.h); g.stroke();
    g.setLineDash([]);
    g.globalAlpha = dropT > 0 ? 0.4 : 1;
    fruit(g, { x: aimX, y: JAR.y - 30, r: tier(next).r, t: next, spin: 0 });
    g.globalAlpha = 1;
    D.text('NEXT', D.W - 74, 60, 9, '#b8a288');
    fruit(g, { x: D.W - 36, y: 62, r: Math.min(16, tier(queued).r), t: queued, spin: 0 });
  }

  D.hud('SCORE ' + (score || 0), 'BEST ' + D.best);
}

/** one piece of fruit: base, occlusion, specular, and its own trimming */
function fruit(g, ball) {
  const T = tier(ball.t), r = ball.r, x = ball.x, y = ball.y;

  // the shadow it casts into the pile
  g.fillStyle = 'rgba(0,0,0,.22)';
  g.beginPath(); g.arc(x + r * 0.10, y + r * 0.12, r, 0, 7); g.fill();

  // base: lit from the upper left
  const grad = g.createRadialGradient(x - r * 0.35, y - r * 0.38, r * 0.1, x, y, r);
  grad.addColorStop(0, mix(T.col, '#ffffff', 0.42));
  grad.addColorStop(0.55, T.col);
  grad.addColorStop(1, T.dark);
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();

  // the dark seat at the bottom, which is what makes a pile read as a pile
  g.fillStyle = 'rgba(0,0,0,.18)';
  g.beginPath(); g.arc(x, y + r * 0.30, r * 0.72, 0.25, Math.PI - 0.25); g.fill();

  // markings per kind, rotating with the piece
  g.save(); g.translate(x, y); g.rotate(ball.spin || 0);
  g.strokeStyle = 'rgba(0,0,0,.16)';
  if (T.kind === 'melon') {
    g.lineWidth = Math.max(1, r * 0.06);
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * Math.PI;
      g.beginPath(); g.ellipse(0, 0, r * 0.92, r * 0.92 * Math.abs(Math.cos(a)), a, 0, 7); g.stroke();
    }
  } else if (T.kind === 'apple' || T.kind === 'lime') {
    g.fillStyle = 'rgba(255,255,255,.10)';
    g.beginPath(); g.ellipse(-r * 0.3, r * 0.1, r * 0.26, r * 0.5, 0.4, 0, 7); g.fill();
  } else if (T.kind === 'berry') {
    g.fillStyle = 'rgba(0,0,0,.10)';
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * 6.283;
      g.beginPath(); g.arc(Math.cos(a) * r * 0.45, Math.sin(a) * r * 0.45, r * 0.24, 0, 7); g.fill();
    }
  }
  // stalk and leaf, on the smaller fruit
  if (r < 45) {
    g.strokeStyle = '#6b4a2c'; g.lineWidth = Math.max(1.4, r * 0.08); g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, -r * 0.92); g.lineTo(r * 0.12, -r * 1.18); g.stroke();
    g.fillStyle = '#57a83c';
    g.beginPath(); g.ellipse(r * 0.32, -r * 1.12, r * 0.24, r * 0.11, -0.5, 0, 7); g.fill();
  }
  g.restore();

  // one hard highlight, always in the same place relative to the light
  g.fillStyle = 'rgba(255,255,255,.55)';
  g.beginPath(); g.ellipse(x - r * 0.36, y - r * 0.40, r * 0.20, r * 0.14, -0.6, 0, 7); g.fill();

  // ---- what cycle it is from --------------------------------------
  // Past stage 11 the sizes start again, so the piece needs to say which
  // time round it is: rings round the rim, pips above it, and the stage
  // number on anything big enough to carry it. Without this a cherry
  // worth 1 and a cherry worth 4,700 look identical, and the whole point
  // of a thousand stages is that they do not.
  if (T.rings) {
    g.strokeStyle = 'rgba(255,255,255,.75)';
    g.lineWidth = Math.max(1, r * 0.07);
    for (let i = 0; i < T.rings; i++) {
      g.beginPath(); g.arc(x, y, r * (0.86 - i * 0.16), 0, 7); g.stroke();
    }
  }
  if (T.pips) {
    g.fillStyle = '#fff6d0';
    for (let i = 0; i < T.pips; i++) {
      const a = -Math.PI / 2 + (i - (T.pips - 1) / 2) * 0.5;
      g.beginPath();
      g.arc(x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05, Math.max(1.6, r * 0.11), 0, 7);
      g.fill();
    }
  }
  if (T.stage > CYCLE && r > 18) {
    D.text(String(T.stage), x, y + r * 0.16, Math.max(9, r * 0.42),
           'rgba(20,12,8,.72)', 'center');
  }
}

/** mix two hex colours, for the highlight end of the gradient */
function mix(a, bcol, t) {
  const pa = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16));
  const pb = [1, 3, 5].map((i) => parseInt(bcol.substr(i, 2), 16));
  return 'rgb(' + pa.map((v, i) => Math.round(v + (pb[i] - v) * t)).join(',') + ')';
}

const board = new Board('merge', { unit: 'SCORE' });
const home = new Home(D, {
  title: 'MERGE',
  lines: ['two of the same touch and become the next one up',
          'a thousand stages - past eleven the sizes start again',
          'and the rings tell you which time round it is'],
  board,
  buttons: [{ label: 'FILL THE JAR', sub: 'do not let it over the line', fn: () => { started = true; reset(); } }],
  hint: 'MOUSE to aim · CLICK to drop · P pause',
});

reset(); started = false;

if (D.shot) {
  started = true;
  const seed = [0, 0, 1, 2, 1, 3, 0, 4, 2, 5, 1, 0, 3, 6, 2, 1, 0, 4];
  let x = JAR.x + 40;
  for (const t of seed) {
    add(clamp(x, JAR.x + 40, JAR.x + JAR.w - 40), JAR.y + JAR.h - 40 - rnd(0, 180), t);
    x += rnd(-90, 110);
  }
  for (let i = 0; i < 240; i++) step(1 / 60, D.g);
  score = 486; over = false; overT = 0;
}

D.run(step);
