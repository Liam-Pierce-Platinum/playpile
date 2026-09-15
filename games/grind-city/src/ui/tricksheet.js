// THE TRICK SHEETS.
//
// Each entry is a looping little film of the gesture. It is not a recording:
// the script below is fed into a REAL board object, one pad delta per frame,
// exactly the way your mouse feeds it. So the deck you see rolling is the deck
// the physics would give you, and if the control model ever changes the sheets
// change with it instead of quietly lying.
//
// A script is a list of [frames, mx, my] in mouse pixels. SLIDE steps are slow
// (under the flick threshold, so they only move your foot); FLICK steps are
// fast. That contrast is the thing the sheets exist to teach.
//
// Every script here was found by feeding candidates to the real board and
// reading back the name the game gave them, and test/names.mjs --check runs
// that comparison so a sheet can never quietly drift into teaching the wrong
// gesture. Sheets marked `teach` demonstrate a technique rather than a named
// trick, so they are exempt.

import { createView } from '../render/view.js';
import { createBoard } from '../game/board.js';
import { drawBoard } from '../art/board3d.js';
import { P } from '../art/palette.js';
import { text } from './font.js';

const HOLD = [26, 0, 0];

export const SHEETS = [
  {
    name: 'OLLIE',
    how: 'On the ground: push DOWN to compress, then bring it back UP. The longer you hold it down, the bigger the pop.',
    ground: true, teach: true,
    script: [[20, 0, 22], [2, 0, -70], HOLD],
  },
  {
    name: 'KICKFLIP',
    how: 'SLIDE your weight out over the NOSE, then FLICK sideways, fast. Slow is positioning, fast is the flick.',
    script: [[15, 9, 0], [4, 72, 0], [40, 0, 0]],
  },
  {
    name: 'HEELFLIP',
    how: 'The same flick, but with your weight over the TAIL. Which end you are over is the only thing that picks the direction.',
    script: [[15, -11, 0], [4, 72, 0], [40, 0, 0]],
  },
  {
    name: 'DOUBLE KICKFLIP',
    how: 'A kickflip with a much harder flick -- roughly half again as fast. Anything less and it only goes round once.',
    script: [[15, 11, 0], [4, 118, 0], [40, 0, 0]],
  },
  {
    name: 'DOUBLE HEELFLIP',
    how: 'The same, over the tail. It wants a genuinely violent flick.',
    script: [[15, -13, 0], [4, 160, 0], [40, 0, 0]],
  },
  {
    name: 'TRIPLE KICKFLIP',
    how: 'As hard as you can flick it. Then let go and let the settle catch it.',
    script: [[15, 11, 0], [4, 180, 0], [40, 0, 0]],
  },
  {
    name: 'BACKSIDE SHOVE-IT',
    how: 'Weight in the MIDDLE, then a SHORT, LIGHT push DOWN. Nudge toward the tail first to pick the side. Press any harder and it goes all the way round to a 360.',
    script: [[4, -6, 0], [3, 0, 34], [40, 0, 0]],
  },
  {
    name: 'FRONTSIDE SHOVE-IT',
    how: 'The same short push, nudged toward the NOSE first.',
    script: [[4, 6, 0], [3, 0, 34], [40, 0, 0]],
  },
  {
    name: 'BACKSIDE 360 SHOVE-IT',
    how: 'The same press, harder and held a little longer -- about twice the push of a 180.',
    script: [[4, -6, 0], [5, 0, 58], [40, 0, 0]],
  },
  {
    name: 'FRONTSIDE 360 SHOVE-IT',
    how: 'And that one nudged the other way.',
    script: [[4, 6, 0], [5, 0, 58], [40, 0, 0]],
  },
  {
    name: 'IMPOSSIBLE',
    how: 'Push DOWN with your weight out over a TIP instead of in the middle, and it wraps end over end.',
    script: [[15, 9, 0], [8, 0, 58], [40, 0, 0]],
  },
  {
    name: 'VARIAL KICKFLIP',
    how: 'Nudge to the TAIL, a SHORT press, then out to the NOSE and flick. Spin first, flip second -- and keep the press small or you get a tre.',
    script: [[3, -6, 0], [2, 0, 46], [7, 12, 0], [4, 70, 0], [34, 0, 0]],
  },
  {
    name: 'HARDFLIP',
    how: 'A varial with the shove going the OTHER way: nudge to the NOSE, short press, then flick off the nose.',
    script: [[3, 6, 0], [2, 0, 46], [7, 12, 0], [4, 70, 0], [34, 0, 0]],
  },
  {
    name: 'INWARD HEELFLIP',
    how: 'Nudge to the TAIL, short press, then flick off the TAIL. The heelflip cousin of the hardflip.',
    script: [[3, -6, 0], [2, 0, 46], [7, -12, 0], [4, 70, 0], [34, 0, 0]],
  },
  {
    name: 'TRE FLIP',
    how: 'A full 360 shove plus a kickflip. Nudge to the tail, press DOWN properly, then get out to the NOSE and flick while it is still turning.',
    script: [[3, -6, 0], [4, 0, 52], [7, 12, 0], [4, 76, 0], [34, 0, 0]],
  },
  {
    name: 'LASER FLIP',
    how: 'The tre flip mirrored: same 360 press, but you get out to the TAIL to flick instead of the nose.',
    script: [[3, -6, 0], [4, 0, 52], [7, -12, 0], [4, 76, 0], [34, 0, 0]],
  },
  {
    name: 'PIERCE FLIP',
    how: 'Set your foot out over the NOSE and hold it there. Press DOWN to wrap the deck end over end, then FLICK it while it is still going over. It rolls right onto its graphic and comes back down on the wheels.',
    script: [[10, 12, 0], [4, 0, 46], [3, 12, 0], [4, 64, 0], [34, 0, 0]],
  },
  {
    name: 'PIERCE HEELFLIP',
    how: 'The same thing over the TAIL. Foot out to the tail, press to wrap it, flick before it settles.',
    script: [[10, -12, 0], [4, 0, 46], [3, -12, 0], [4, 64, 0], [34, 0, 0]],
  },
  {
    name: 'DOUBLE PIERCE',
    how: 'Hold the press much longer and it wraps twice before you flick it. Same foot, same flick, far more patience.',
    script: [[10, 12, 0], [12, 0, 70], [3, 12, 0], [4, 64, 0], [34, 0, 0]],
  },
  {
    name: 'CATCH IT',
    how: 'Pull UP to catch the deck, or just STOP. Either way it settles onto a clean angle -- and once it is a sixth of the way round, letting go COMPLETES the turn instead of abandoning it.',
    teach: true,
    script: [[15, 9, 0], [4, 72, 0], [10, 0, 0], [4, 0, -60], [30, 0, 0]],
  },
  {
    name: 'GRIND',
    how: 'Ollie onto a bar. Whatever angle the deck is at when it lands is the trick, and where your weight is decides nosegrind from 5-0.',
    rail: true, teach: true,
    script: [[20, 0, 22], [2, 0, -70], HOLD],
  },
  {
    name: 'STOMP ONTO A RAIL',
    how: 'Passing over a bar in the air? Push DOWN hard and you drop onto it. Where your weight is as it lands picks the grind: out over the nose is a NOSEGRIND, back over the tail is a 5-0, in the middle is a 50-50.',
    rail: true, teach: true,
    script: [[30, 0, 74], HOLD],
  },
];

// --- one looping demo --------------------------------------------------------
function makeDemo(canvas, sheet) {
  const v = createView(canvas, { fixed: { w: 86, h: 48, scale: 2 } });
  const board = createBoard();
  const frames = [];
  for (const [n, mx, my] of sheet.script) for (let i = 0; i < n; i++) frames.push([mx, my]);
  return { v, board, frames, i: 0, trail: [], sheet };
}

function stepDemo(d, look) {
  const DT = 1 / 60;
  if (d.i >= d.frames.length) {
    d.i = 0; d.board.reset(); d.trail.length = 0;
  }
  const f = d.frames[d.i++];
  d.board.feed(f[0], f[1]);
  d.board.update(DT, d.sheet.ground ? 'ground' : 'air');
  d.trail.push([d.board.r, d.board.p]);
  if (d.trail.length > 26) d.trail.shift();

  const v = d.v;
  v.ui();
  v.rect(0, 0, v.W, v.H, '#221b2a');
  for (let y = 0; y < v.H; y += 4) v.rect(0, y, v.W, 1, '#271f31');

  // a scrap of ground or a bar for the ones that need one
  if (d.sheet.ground) { v.rect(0, 40, v.W, 8, P.con4); v.rect(0, 40, v.W, 2, P.con2); }
  if (d.sheet.rail) { v.rect(4, 36, v.W - 8, 3, P.ink); v.rect(4, 36, v.W - 8, 1, P.met1); }

  // the deck itself
  drawBoard(v, 30, 21, d.board.roll, d.board.yaw, d.board.pitch, 1.4, { look: look.deck });

  // the pad, with the path your hand took
  const px = 68, py = 21, R = 12;
  v.rect(px - R - 2, py - R - 2, (R + 2) * 2, (R + 2) * 2, '#1a1420');
  v.frame(px - R - 2, py - R - 2, (R + 2) * 2, (R + 2) * 2, P.ink2);
  v.rect(px - R + 1, py - 2, (R - 1) * 2, 4, P.con4);
  v.ring(px, py, 3, P.ink3);
  for (let i = 1; i < d.trail.length; i++) {
    const a = d.trail[i - 1], b = d.trail[i];
    v.line(px + a[0] * R * 0.7, py + a[1] * R * 0.7,
      px + b[0] * R * 0.7, py + b[1] * R * 0.7, P.ui3);
  }
  const cur = d.trail[d.trail.length - 1] || [0, 0];
  v.disc(px + cur[0] * R * 0.7, py + cur[1] * R * 0.7, 2, P.ui1);

  // the read-out sits along the bottom, clear of the deck
  if (d.board.gestureT > 0) {
    text(v, d.board.gesture, 3, v.H - 8, P.ui1, { tracking: 0, outline: P.ink });
  }
  v.present();
}

// --- the screen ---------------------------------------------------------------
let demos = [];
let running = false;
let lookRef = null;

export function buildSheets(listEl, look) {
  lookRef = look;
  demos = [];
  listEl.innerHTML = '';
  for (const sheet of SHEETS) {
    const row = document.createElement('div');
    row.className = 'sheet';
    const c = document.createElement('canvas');
    row.appendChild(c);
    const txt = document.createElement('div');
    txt.className = 'sheettext';
    const b = document.createElement('b'); b.textContent = sheet.name; txt.appendChild(b);
    const s = document.createElement('small'); s.textContent = sheet.how; txt.appendChild(s);
    row.appendChild(txt);
    listEl.appendChild(row);
    demos.push(makeDemo(c, sheet));
  }
}

export function setSheetLook(look) { lookRef = look; }

export function startSheets() {
  if (running) return;
  running = true;
  const tick = () => {
    if (!running) return;
    for (const d of demos) stepDemo(d, lookRef);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

export function stopSheets() { running = false; }
