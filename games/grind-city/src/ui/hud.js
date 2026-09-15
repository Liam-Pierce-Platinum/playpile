// The HUD exists mostly to make the control model legible. The pad at the
// bottom is the important part: it shows where your weight is and which
// direction each flick would be read as. Without it the mouse feels like noise.

import { P } from '../art/palette.js';
import { text, textWidth } from './font.js';
import { TAU } from '../game/board.js';

export function drawHud(v, sk, board, score, park, t, cash, metres) {
  v.ui();
  const W = v.W, H = v.H;

  // ---- cash ----------------------------------------------------------------
  panel(v, 5, 5, 96, 24);
  text(v, 'CASH', 10, 8, P.ui3, { shadow: P.ink });
  text(v, '$' + (cash || 0), 10, 16, P.ui1, { shadow: P.ink });
  if (score.total > 0) text(v, '+' + score.total, 97, 16, P.good, { align: 'right', shadow: P.ink });

  // ---- legs ----------------------------------------------------------------
  // How much pop you have left. It sits directly under the cash because those
  // are the two numbers you actually watch, and it FLASHES when a pop was
  // refused -- otherwise running out reads as the game ignoring your input.
  if (sk.stamMax) {
    const w = 96, x = 5, y = 31;
    const k = Math.max(0, Math.min(1, sk.stam / sk.stamMax));
    const empty = k < 0.16;
    const flash = sk.stamFlash > 0 && Math.floor(t * 12) % 2 === 0;
    v.rect(x, y, w, 7, P.ink);
    v.rect(x + 1, y + 1, w - 2, 5, '#2a2532');
    const fill = flash ? '#ff5b4a' : empty ? '#c9603a' : k < 0.4 ? '#d8b04a' : P.good;
    v.rect(x + 1, y + 1, Math.round((w - 2) * k), 5, fill);
    // a tick every pop's worth, so the bar reads as a count and not a smear
    const pops = Math.max(1, Math.round(sk.stamMax / 16));
    for (let i = 1; i < pops; i++) {
      v.rect(x + 1 + Math.round((w - 2) * (i / pops)), y + 1, 1, 5, '#1d1826');
    }
    text(v, 'LEGS', x + 3, y - 7, P.ui3, { shadow: P.ink });
  }

  // ---- park name -----------------------------------------------------------
  text(v, park.name, W - 6, 8, P.ui4, { align: 'right', shadow: P.ink });
  if (metres >= 0) text(v, Math.round(metres) + 'M', W - 6, 24, P.ui1, { align: 'right', shadow: P.ink });
  const sp = Math.min(1, Math.abs(sk.v) / 235);
  v.rect(W - 62, 17, 56, 4, P.ink);
  v.rect(W - 61, 18, Math.round(54 * sp), 2, sp > 0.8 ? P.ui2 : P.ui3);

  // ---- the live line -------------------------------------------------------
  if (score.chain.length) {
    const line = score.chain.slice(-3).join(' + ');
    const y = 40;
    const w = textWidth(line, 1) + 10;
    panel(v, Math.round(W / 2 - w / 2), y - 4, w, 13);
    text(v, line, W / 2, y, P.ui4, { align: 'center', shadow: P.ink });
    text(v, '$' + Math.round(score.chainPts) + '  X' + score.mult, W / 2, y + 12, P.ui1,
      { align: 'center', shadow: P.ink });
    const hw = Math.round(60 * Math.min(1, score.hold / 1.5));
    v.rect(W / 2 - 30, y + 22, 60, 2, P.ink);
    v.rect(W / 2 - 30, y + 22, hw, 2, score.hold < 0.5 ? P.bad : P.good);
  }

  // ---- last trick flash ----------------------------------------------------
  if (score.flash > 0 && score.lastName) {
    const a = score.flash;
    const col = score.lastName === 'BAILED' ? P.bad : P.ui1;
    text(v, score.lastName, W / 2, 78 - Math.round(a * 5), col, {
      align: 'center', scale: a > 0.6 ? 2 : 1, outline: P.ink,
    });
  }

  // ---- the pad -------------------------------------------------------------
  pad(v, Math.round(W / 2), H - 22, board, sk);

  // ---- rotation dials, only while it matters --------------------------------
  if (sk.state === 'air') {
    dial(v, 46, H - 46, 'FLIP', board.roll, TAU, board.K.tolRoll, P.ui2);
    dial(v, 46, H - 32, 'SPIN', board.yaw, Math.PI, board.K.tolYaw, P.ui3);
    dial(v, 46, H - 18, 'PITCH', board.pitch, TAU, board.K.tolRoll, P.ui1);
    const ok = board.canLand();
    text(v, ok ? 'CLEAN' : 'SKETCHY', W - 8, H - 14, ok ? P.good : P.bad,
      { align: 'right', outline: P.ink });
  } else if (sk.state === 'grind') {
    text(v, sk.grind.name, W - 8, H - 14, P.ui3, { align: 'right', outline: P.ink });
  } else if (sk.state === 'ride' && sk.manualT > 0) {
    text(v, sk.manualName, W - 8, H - 14, P.ui3, { align: 'right', outline: P.ink });
  }
  void t;
}

function panel(v, x, y, w, h) {
  v.rect(x, y, w, h, 'rgba(26,20,32,0.72)');
  v.frame(x, y, w, h, P.ink2);
}

// A little compass of the gestures, with your weight sitting on it.
function pad(v, cx, cy, board, sk) {
  const R = 13;                          // pad radius -- deliberately small
  const S = R / board.K.clampR;          // pad units -> pixels
  const air = sk.state === 'air';

  v.rect(cx - R - 4, cy - R - 4, (R + 4) * 2, (R + 4) * 2, 'rgba(26,20,32,0.6)');
  v.frame(cx - R - 4, cy - R - 4, (R + 4) * 2, (R + 4) * 2, P.ink2);

  // the deck, seen from above: tail on the left, nose on the right. Which half
  // your weight is over is what decides which way a sideways flick spins it.
  const hw = Math.round(R * 0.92);
  v.rect(cx - hw, cy - 3, hw * 2, 6, P.ink);
  v.rect(cx - hw + 1, cy - 2, hw * 2 - 2, 4, P.con4);
  const tip = Math.round(board.B.tip * S);
  v.rect(cx - hw + 1, cy - 2, hw - tip, 4, P.con2);          // tail zone
  v.rect(cx + tip, cy - 2, hw - tip, 4, P.con2);             // nose zone
  v.rect(cx - tip, cy - 2, tip * 2, 4, P.ink3);              // the middle

  // the settle ring: bring it home, or just stop, and you land
  const cr = Math.max(3, Math.round(board.K.centre * S));
  const home = board.settled > 0.5 || board.idle > 0.2;
  v.ring(cx, cy, cr, home ? P.good : P.ink3);
  if (home && air) v.ring(cx, cy, cr + 2, P.good);

  if (board.charge > 0.02) {
    const r = 2 + board.charge * 6;
    v.disc(cx, cy, r, board.charge > 0.85 ? P.ui1 : P.ui2);
    v.disc(cx, cy, Math.max(1, r - 2), P.ui4);
  }

  // your weight. p positive means pressing DOWN, which is down the screen.
  const px = cx + clamp(board.r, -1.42, 1.42) * S;
  const py = cy + clamp(board.p, -1.42, 1.42) * S;
  v.line(cx, cy, px, py, P.ink3);
  v.disc(px, py, 4, P.ink);
  v.disc(px, py, 3, (board.settled > 0.5 || board.idle > 0.2) ? P.good : P.ui4);
  if (board.catching > 0.05) v.ring(px, py, 5 + board.catching * 4, P.ui3);

  if (board.gestureT > 0) {
    text(v, board.gesture, cx, cy - R - 12, P.ui1, { align: 'center', outline: P.ink });
  } else if (!air && board.charge > 0.5) {
    text(v, 'NOW UP', cx, cy - R - 12, P.ui1, { align: 'center', outline: P.ink });
  }
}

// A wrapped bar showing how far this axis is from a landable angle.
function dial(v, x, y, label, angle, period, tol, col) {
  const w = 54;
  text(v, label, x - 4, y - 2, P.ui4, { align: 'right', tracking: 0, outline: P.ink });
  v.rect(x, y, w, 7, P.ink);
  v.rect(x + 1, y + 1, w - 2, 5, P.ink2);
  const tw = Math.max(2, Math.round((tol / period) * w * 2));
  v.rect(x + 1, y + 1, tw, 5, P.good);
  v.rect(x + w - 1 - tw, y + 1, tw, 5, P.good);
  const frac = mod(angle, period) / period;
  v.rect(Math.round(x + 1 + frac * (w - 3)), y - 1, 2, 9, col);
  const turns = Math.round(angle / period);
  if (turns) text(v, (turns > 0 ? '+' : '') + turns, x + w + 4, y, col, { tracking: 0 });
}

function clamp(a, lo, hi) { return a < lo ? lo : a > hi ? hi : a; }
function mod(a, b) { return ((a % b) + b) % b; }
