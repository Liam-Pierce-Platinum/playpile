// Keyboard + mouse, and an N64 controller alongside them.
//
// The pad ORs into the same action names the keyboard uses, so every system
// downstream -- the controller, the menus, the dragon -- is written once and
// works with either. Neither device disables the other; you can put the pad
// down mid-fight and keep going on the keys.
import { GamepadInput } from './gamepad.js';

//
// WASD moves. The arrow keys are the action buttons -- laid out like a face
// pad: up jumps, left attacks, down blocks, right is the special.

export const KEYS = {
  moveUp: ['KeyW'],
  moveDown: ['KeyS'],
  moveLeft: ['KeyA'],
  moveRight: ['KeyD'],

  jump: ['ArrowUp'],
  attack: ['ArrowLeft'],
  block: ['ArrowDown'],
  special: ['ArrowRight'],

  interact: ['Space'],
  satchel: ['KeyE'],
  levelSelect: ['KeyQ'],
  drinkPotion: ['Digit1'],
  throwPotion: ['Digit2'],
  useFood: ['Digit3'],   // quick-eat the best thing you carry
  crouch: ['KeyC'],
  cycleTarget: ['Tab'],
  run: ['ShiftLeft', 'ShiftRight'],
  togglePanel: ['KeyH'],
};

/** How long a second tap still counts as a double-tap. */
const DOUBLE_TAP_WINDOW = 0.30;

/** Human-readable labels, for the HUD and the title screen. */
export const KEY_LABELS = {
  move: 'W A S D',
  jump: '↑',
  attack: '←',
  block: '↓',
  special: '→',
  interact: 'SPACE',
  drinkPotion: '1',
  throwPotion: '2',
};

const PREVENT = new Set([
  'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab',
]);

export class Input {
  constructor(dom) {
    this.dom = dom;
    this.keys = new Set();
    this.justPressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.locked = false;
    this.dragging = false;
    this.mouseButtons = new Set();
    this.justClicked = new Set();
    this.sensitivity = 0.0028;
    this.enabled = true;
    this.pad = new GamepadInput();
    this.lastTap = new Map();       // code -> timestamp of previous press
    this.doubleTaps = new Set();    // codes double-tapped this frame

    addEventListener('keydown', (e) => {
      if (PREVENT.has(e.code)) e.preventDefault();
      if (e.repeat || !this.enabled) return;
      this.keys.add(e.code);
      this.justPressed.add(e.code);

      const now = performance.now() / 1000;
      const prev = this.lastTap.get(e.code);
      if (prev !== undefined && now - prev <= DOUBLE_TAP_WINDOW) {
        this.doubleTaps.add(e.code);
        this.lastTap.delete(e.code);        // a triple tap is not two doubles
      } else {
        this.lastTap.set(e.code, now);
      }
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseButtons.clear(); });

    dom.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      this.mouseButtons.add(e.button);
      this.justClicked.add(e.button);
      if (e.button === 0 && !this.locked) this.dragging = true;
      if (e.button === 1) e.preventDefault();
    });
    addEventListener('mouseup', (e) => {
      this.mouseButtons.delete(e.button);
      if (e.button === 0) this.dragging = false;
    });
    dom.addEventListener('contextmenu', (e) => e.preventDefault());

    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (!this.locked && !this.dragging) return;
      this.mouseDX += e.movementX * this.sensitivity;
      this.mouseDY += e.movementY * this.sensitivity;
    });

    dom.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      this.wheel += Math.sign(e.deltaY);
      e.preventDefault();
    }, { passive: false });

    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === dom;
    });
  }

  requestLock() { if (!this.locked) this.dom.requestPointerLock?.(); }
  releaseLock() { if (this.locked) document.exitPointerLock?.(); }

  /** Movement as a -1..1 pair. y is forward. Analog stick wins if it is moved. */
  axis() {
    const px = this.pad.moveX, py = this.pad.moveY;
    if (px || py) return { x: px, y: -py };   // pad y is screen-down
    let x = 0, y = 0;
    if (this.action('moveUp')) y += 1;
    if (this.action('moveDown')) y -= 1;
    if (this.action('moveRight')) x += 1;
    if (this.action('moveLeft')) x -= 1;
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }

  /** Is any key bound to this action currently held? */
  action(name) {
    if (this.pad.action(name)) return true;
    const codes = KEYS[name];
    if (!codes) return false;
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  }

  /** Was any key bound to this action pressed this frame? */
  pressedAction(name) {
    if (this.pad.pressedAction(name)) return true;
    const codes = KEYS[name];
    if (!codes) return false;
    for (const c of codes) if (this.justPressed.has(c)) return true;
    return false;
  }

  /** Was any key bound to this action double-tapped this frame? */
  doubleTapped(name) {
    if (this.pad.doubleTapped?.(name)) return true;
    const codes = KEYS[name];
    if (!codes) return false;
    for (const c of codes) if (this.doubleTaps.has(c)) return true;
    return false;
  }

  down(code) { return this.keys.has(code); }
  pressed(code) { return this.justPressed.has(code); }
  clicked(btn) { return this.justClicked.has(btn); }

  /** Read the pad. Call once at the START of each frame, before anything else. */
  beginFrame() { this.pad.poll(); }

  /** Consume per-frame deltas. Call once at the END of each frame. */
  endFrame() {
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.wheel = 0;
    this.justPressed.clear();
    this.justClicked.clear();
    this.doubleTaps.clear();
  }
}
