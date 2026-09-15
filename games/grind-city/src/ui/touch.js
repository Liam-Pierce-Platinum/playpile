// =====================================================================
// GRIND CITY :: touch.js - THE FINGER IS THE BOARD
// =====================================================================
//
// About sixty-five per cent of CrazyGames' traffic is a phone, and this
// game was mouse-only, so two thirds of the platform could not play it
// at all. That is the single biggest thing standing between it and a
// launch, and it is worth saying plainly why it is cheap to fix HERE and
// would be expensive in almost any other game:
//
//   THE ONE LOAD-BEARING IDEA OF THIS GAME IS THAT THE MOUSE IS THE
//   BOARD. Two numbers - where your foot is and how hard you are
//   pressing - come out of pointer movement, and a slide-versus-flick
//   SPEED GATE is what separates moving your foot from flicking it.
//
// A finger dragged across glass produces exactly the same two numbers,
// with exactly the same distinction between a slide and a flick, and it
// does it more directly than a mouse does: you are literally putting
// your foot on the board and shoving it. Nothing in board.js changes.
//
// WHAT DOES NOT TRANSLATE, and what is done about it:
//
//   pointer lock   Does not exist on a phone, and the game leans on it
//                  for both the movement deltas and the pause. On touch
//                  the lock flow is skipped entirely - `touchmove` feeds
//                  the same `mdx`/`mdy` the mouse feeds, and pausing is
//                  a button.
//   A and D push   Two thumb pads, bottom left. Push is held, not
//                  tapped, so they are pads rather than buttons.
//   grabs 1-5      One GRAB pad, bottom right, holding the pose the
//                  player last chose. Five separate grab buttons on a
//                  phone screen is five things to miss.
//   space / R      Small pads: pick the board up, and bail out.
//
// The pad only exists on a touch device. It is not a mobile MODE - the
// same build serves both, and a laptop with a touchscreen gets the mouse
// controls and no pad, because `pointer: coarse` is false there.

/** Is this a device whose primary pointer is a finger? */
export function isTouch() {
  if (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches) return true;
  return (navigator.maxTouchPoints || 0) > 1 && !matchMedia('(pointer: fine)').matches;
}

// =====================================================================
// HOW MUCH BOARD A PIXEL OF FINGER IS WORTH: exactly one pixel's worth.
// =====================================================================
//
// This was 1.35, boosted further on narrow screens, on the reasoning
// that a phone is smaller than a monitor so the same finger travel has
// to mean more board. That reasoning is wrong, and test/flick.mjs shows
// why: every gesture over-rotated. A kickflip came out a DOUBLE
// kickflip, a 360 shove-it came out a 540, and only 7 of the 18 named
// tricks landed what the sheet that teaches them says.
//
// The trick sheets are authored in these units - the same units the
// mouse delivers - and the slide-versus-flick gate is calibrated to
// them. Anything other than 1.0 is a thumb on the scale.
//
//     gain 1.35   7/18 land what the sheet says
//     gain 1.00  18/18
//     gain 0.80   3/18
//
// So a finger pixel is a mouse pixel. A phone player has to flick as
// hard as a mouse player does, which is what every gesture-driven game
// on a phone asks, and every trick in the game is reachable.
const TOUCH_GAIN = 1.0;

const PADS = [
  { id: 'tp-left', label: '◀', row: 'l', act: 'pushL' },
  { id: 'tp-right', label: '▶', row: 'l', act: 'pushR' },
  { id: 'tp-grab', label: 'GRAB', row: 'r', act: 'grab' },
  { id: 'tp-carry', label: 'CARRY', row: 'r', act: 'carry' },
  { id: 'tp-bail', label: 'BAIL', row: 'r', act: 'bail' },
  { id: 'tp-pause', label: '‖', row: 'p', act: 'pause' },
];

/**
 * Build the pad and wire it up.
 *
 * `api` is what main.js is willing to have poked:
 *   move(dx, dy)   the same two numbers the mouse produces
 *   push(side, on) A / D
 *   grab(on)       hold a grab pose
 *   carry()        space
 *   bail()         R
 *   pause()        the pause menu
 *   playing()      true only while a run is actually running
 */
export function installTouch(canvas, api) {
  if (!isTouch()) return null;
  document.body.classList.add('touch');

  const root = document.createElement('div');
  root.id = 'touchpad';
  root.className = 'hidden';
  const rows = { l: mk('tp-row tp-l'), r: mk('tp-row tp-r'), p: mk('tp-row tp-p') };
  for (const k in rows) root.appendChild(rows[k]);
  const btn = {};
  for (const p of PADS) {
    const b = mk('tp-btn');
    b.id = p.id;
    b.textContent = p.label;
    rows[p.row].appendChild(b);
    btn[p.act] = b;
  }
  document.body.appendChild(root);

  function mk(cls) { const d = document.createElement('div'); d.className = cls; return d; }

  // ---- the pads ------------------------------------------------------
  //
  // touchstart/touchend rather than click: a click fires on release, and
  // a push you cannot HOLD is not a push. `touchcancel` matters too -
  // drag your thumb off the pad mid-push and without it you keep pushing
  // forever.
  const bind = (el, on, off) => {
    const down = (e) => { e.preventDefault(); e.stopPropagation(); on(); };
    const up = (e) => { e.preventDefault(); e.stopPropagation(); if (off) off(); };
    el.addEventListener('touchstart', down, { passive: false });
    el.addEventListener('touchend', up, { passive: false });
    el.addEventListener('touchcancel', up, { passive: false });
  };
  bind(btn.pushL, () => api.push('left', true), () => api.push('left', false));
  bind(btn.pushR, () => api.push('right', true), () => api.push('right', false));
  bind(btn.grab, () => api.grab(true), () => api.grab(false));
  bind(btn.carry, () => api.carry());
  bind(btn.bail, () => api.bail());
  bind(btn.pause, () => api.pause());

  // ---- THE BOARD ------------------------------------------------------
  //
  // Anything that is not a pad is board surface. The finger's DELTA goes
  // straight into the same accumulator the mouse writes to, so the speed
  // gate in board.js sees a flick as a flick without knowing what made
  // it.
  //
  // It is tracked by identifier, not by "the first touch": a player
  // holding PUSH with their left thumb and flicking with their right is
  // the normal way to hold a phone, and reading touches[0] would swap
  // the two the moment the pushing thumb landed second.
  let id = null, lx = 0, ly = 0;
  // ---- SENSITIVITY --------------------------------------------------
  //
  // Overridable so test/flick.mjs can sweep it: the right value is not a
  // matter of taste, it is whatever makes a gesture from the trick sheets
  // land the trick the sheet names.
  const scale = () => {
    if (window.__touchScale) return window.__touchScale;
    return TOUCH_GAIN;
  };
  canvas.addEventListener('touchstart', (e) => {
    if (!api.playing()) return;
    if (id !== null) return;
    const t = e.changedTouches[0];
    id = t.identifier; lx = t.clientX; ly = t.clientY;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (id === null || !api.playing()) return;
    for (const t of e.changedTouches) {
      if (t.identifier !== id) continue;
      const k = scale();
      api.move((t.clientX - lx) * k, (t.clientY - ly) * k);
      lx = t.clientX; ly = t.clientY;
    }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === id) id = null;
  };
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });

  // the browser's own gestures are all wrong here: a two-finger pinch
  // zooms the page, a swipe down pulls the address bar back, and a long
  // press selects the canvas
  for (const ev of ['gesturestart', 'gesturechange', 'contextmenu'])
    document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });

  return {
    show(on) { root.classList.toggle('hidden', !on); },
    root,
  };
}
