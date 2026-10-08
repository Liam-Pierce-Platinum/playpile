// The keyboard, turned into a fighter's intent.
//
//   A / D           move left and right          W / S   move up and back in the ring
//   ARROWS          punches:  LEFT jab, UP cross, RIGHT hook, DOWN uppercut.
//                   Tap them in a rhythm and they chain into combos.
//   hold SPACE      GO LOW. Every punch goes to the body instead of the head.
//                   Combos still chain, so you can mix levels mid-combo.
//   SHIFT (hold)    guard high.  SHIFT + SPACE (or SHIFT + DOWN): guard low,
//                   the same key that sends your own punches low.
//   Q               slip - lean back (beats straights, uppercuts, overhands)
//   E               duck - drop under (beats straights and hooks)
//   F               STAR PUNCH, when you have a star
//   when knocked down: mash the arrows to get up

import { emptyIntent } from './fight.js';

const PUNCH = { left: ['straight', 'lead'], up: ['straight', 'rear'], right: ['hook', 'lead'], down: ['upper', 'rear'] };
const NAME = { left: 'JAB', up: 'CROSS', right: 'HOOK', down: 'UPPERCUT' };

export function createInput(target = window) {
  const down = new Set();
  const pressed = [];            // edge presses since last poll, in order
  // aimHeld = SPACE is down (the HUD shows LOW); lastGesture names the last body shot
  const I = { down, aimHeld: false, trail: [], lastGesture: '', gestureT: 9, enabled: true };

  const MAP = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  function kd(e) {
    if (!I.enabled) return;
    const k = e.code;
    if (MAP[k] || k === 'Space') e.preventDefault();
    if (down.has(k)) return;
    down.add(k);
    pressed.push(k);
  }
  function ku(e) { down.delete(e.code); }
  target.addEventListener('keydown', kd);
  target.addEventListener('keyup', ku);
  window.addEventListener('blur', () => down.clear());

  // Called once a frame. Returns the intent for this frame.
  I.poll = function (dt) {
    const it = emptyIntent();
    I.gestureT += dt;
    const has = (c) => down.has(c);
    it.mx = (has('KeyD') ? 1 : 0) - (has('KeyA') ? 1 : 0);
    it.mz = (has('KeyW') ? 1 : 0) - (has('KeyS') ? 1 : 0);
    I.aimHeld = has('Space');
    it.guard = has('ShiftLeft') || has('ShiftRight');
    it.low = it.guard && (I.aimHeld || has('ArrowDown'));
    it.crouch = I.aimHeld;
    it.run = has('KeyE');          // wrestling: hold to run the ropes
    it.arrows = [];                // raw arrow presses, for wrestling and sumo
    it.grab = false;

    for (const k of pressed.splice(0)) {
      if (k === 'Space') it.grab = true;
      if (k === 'KeyQ') it.slip = true;
      else if (k === 'KeyE') it.duck = true;
      else if (k === 'KeyF') it.star = true;
      if (MAP[k]) {
        it.mash++;
        it.arrows.push(MAP[k]);
        if (it.guard) continue;                // arrows do not punch while you block
        const d = MAP[k], [kind, hand] = PUNCH[d];
        const target = I.aimHeld ? 'body' : 'head';
        it.punches.push({ kind, hand, target });
        I.lastGesture = I.aimHeld ? 'BODY ' + NAME[d] : '';
        I.gestureT = 0;
      }
    }
    return it;
  };

  I.clear = () => { down.clear(); pressed.length = 0; };
  I.dispose = () => { target.removeEventListener('keydown', kd); target.removeEventListener('keyup', ku); };
  return I;
}
