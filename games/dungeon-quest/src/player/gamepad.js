// NINTENDO 64 CONTROLLER SUPPORT.
//
// The keyboard scheme is untouched; this runs alongside it and ORs into the
// same action names, so nothing downstream knows or cares which one you used.
//
// The layout is the real console's, because that is what it was designed for:
//
//   ANALOG STICK      move
//   C-BUTTONS         the four-button diamond on the right --
//                       C-up    jump
//                       C-down  block
//                       C-left  attack
//                       C-right special
//   A  (blue)         pick up / talk / open a chest / confirm   [= SPACE]
//   B  (green)        the satchel                               [= E]
//   D-PAD (black)     move the highlight around a menu -- and, with no menu
//                     open, swing the CAMERA around the player
//   L                 switch target; L L releases the lock  [= TAB]
//   Z                 run
//   R                 crouch
//   START             level select, once the game is finished
//
// USB adapters disagree wildly about which index a C-button lands on: some
// report them as buttons 2-5, some as a second stick on axes 2/3 or 2/5, some
// as a hat. Every C direction below therefore accepts SEVERAL sources and ORs
// them, which is why one table covers most adapters instead of one per brand.

const DEAD = 0.32;          // analog stick dead zone
const C_AXIS = 0.55;        // how far a "C stick" has to move to count as a press
const DOUBLE_FRAMES = 20;   // ~0.33s at 60fps: the double-tap window

/** Sources for one logical button: gamepad button indices, and axis tests. */
const MAP = {
  // the C diamond
  jump: { buttons: [3, 12, 2], axes: [[3, -1], [5, -1]] },   // C-up
  block: { buttons: [0, 13, 5], axes: [[3, 1], [5, 1]] },    // C-down
  // 4 is deliberately NOT here. It used to be a third fallback for C-left, but
  // L lives on 4 and a button that both attacks and switches target is neither.
  attack: { buttons: [2, 14], axes: [[2, -1], [4, -1]] },     // C-left
  special: { buttons: [1, 15, 3], axes: [[2, 1], [4, 1]] },  // C-right
  // A and B
  interact: { buttons: [0] },
  satchel: { buttons: [1] },
  // shoulders. L is DELIBERATELY not a run button any more: it is the pad's
  // TAB, and a button that both sprints and switches target is neither.
  run: { buttons: [6, 7] },        // Z (and the second trigger, on pads with one)
  crouch: { buttons: [5] },        // R
  levelSelect: { buttons: [9] },   // START
  cycleTarget: { buttons: [4, 10, 11] },   // L, or a stick click
};

/**
 * A face-button pad (an Xbox/PlayStation-style controller) has no C cluster,
 * so the same four actions fall back onto its face diamond. The indices above
 * already cover that: 3 is the top button, 0 the bottom, 2 the left, 1 the
 * right. The cost is that A doubles as C-down on such a pad, which is why
 * `interact` is checked FIRST and consumes the press.
 */
const DPAD = { up: [12], down: [13], left: [14], right: [15] };

export class GamepadInput {
  constructor() {
    this.pad = null;
    this.only = null;      // pin to one pad index, for player two
    this.connected = false;
    this.held = new Set();
    this.pressed = new Set();
    this.prev = new Set();
    this.moveX = 0;
    this.moveY = 0;
    this.onConnect = null;
    // TAB TAB releases the lock on a keyboard. The pad needs its own timer for
    // that, because "pressed this frame" says nothing about how long ago.
    this.lastPress = new Map();
    this.doubles = new Set();
    this.clock = 0;

    addEventListener('gamepadconnected', (e) => {
      this.connected = true;
      this.onConnect?.(e.gamepad?.id || 'controller', true);
    });
    addEventListener('gamepaddisconnected', () => {
      this.connected = false;
      this.held.clear();
      this.pressed.clear();
      this.onConnect?.('', false);
    });
  }

  /** The first pad that is actually reporting. */
  poll() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    if (this.only != null) {
      // pinned: player two reads ONLY its own pad, or nothing at all, so the
      // two players can never steal each other's buttons
      let n = 0;
      for (const g of pads) {
        if (!g || !g.connected) continue;
        if (n === this.only) { pad = g; break; }
        n++;
      }
    } else {
      for (const g of pads) if (g && g.connected) { pad = g; break; }
    }
    this.pad = pad;
    if (!pad) {
      if (this.connected) { this.connected = false; this.onConnect?.('', false); }
      this.held.clear();
      this.pressed.clear();
      this.moveX = this.moveY = 0;
      return;
    }
    if (!this.connected) { this.connected = true; this.onConnect?.(pad.id, true); }

    const b = pad.buttons, ax = pad.axes;
    const down = (i) => !!(b[i] && (b[i].pressed || b[i].value > 0.5));
    const axis = (i, dir) => ax.length > i && ax[i] * dir > C_AXIS;

    this.prev = this.held;
    const now = new Set();

    for (const [name, src] of Object.entries(MAP)) {
      let on = false;
      for (const i of src.buttons || []) if (down(i)) { on = true; break; }
      if (!on) for (const [i, d] of src.axes || []) if (axis(i, d)) { on = true; break; }
      if (on) now.add(name);
    }
    // A is both "confirm" and, on a face-button pad, C-down. Confirm wins.
    if (now.has('interact')) now.delete('block');
    if (now.has('satchel')) now.delete('special');

    for (const [name, idx] of Object.entries(DPAD)) {
      for (const i of idx) if (down(i)) { now.add('dpad' + name[0].toUpperCase() + name.slice(1)); break; }
    }

    this.held = now;
    this.pressed = new Set([...now].filter(n => !this.prev.has(n)));

    // the analog stick, with a dead zone and the corners squared off so a
    // full diagonal is not faster than a full straight line
    let x = ax[0] || 0, y = ax[1] || 0;
    const len = Math.hypot(x, y);
    if (len < DEAD) { x = 0; y = 0; }
    else {
      const k = Math.min(1, (len - DEAD) / (1 - DEAD)) / len;
      x *= k; y *= k;
    }
    this.moveX = x;
    this.moveY = y;

    // Polling happens once a frame, so counting frames is clock enough and
    // saves threading a timestamp in from the game loop.
    this.clock++;
    this.doubles.clear();
    for (const name of this.pressed) {
      const was = this.lastPress.get(name);
      if (was != null && this.clock - was <= DOUBLE_FRAMES) {
        this.doubles.add(name);
        this.lastPress.delete(name);      // three taps is not two doubles
      } else {
        this.lastPress.set(name, this.clock);
      }
    }
  }

  /** Pressed twice inside the window -- the pad's TAB TAB. */
  doubleTapped(name) { return this.doubles.has(name); }

  /**
   * Eat a press so nothing downstream sees it this frame.
   *
   * The menu layer runs BEFORE the game loop, and `pressed` is not cleared
   * until the end of the frame. Without this, B closing the satchel let the
   * play loop see the same B press and open it straight back up.
   */
  consume(name) { this.pressed.delete(name); }

  action(name) { return this.held.has(name); }
  pressedAction(name) { return this.pressed.has(name); }

  /** Menu movement, as one-shot presses. */
  navPressed() {
    return {
      up: this.pressed.has('dpadUp'),
      down: this.pressed.has('dpadDown'),
      left: this.pressed.has('dpadLeft'),
      right: this.pressed.has('dpadRight'),
      confirm: this.pressed.has('interact'),
      back: this.pressed.has('satchel'),
    };
  }
}
