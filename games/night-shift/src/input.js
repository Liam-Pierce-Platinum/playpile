// ===================== TOKYO SLIDE :: INPUT =====================
// Three schemes at once, OR-ed into the same four values, so nothing
// downstream ever asks which device it came from.
//   PC       WASD / arrows, SPACE handbrake
//   TOUCH    a real steering wheel you rotate with a finger, plus pedals
//   GAMEPAD  stick + triggers

export class Input {
  constructor() {
    this.steer = 0; this.throttle = 0; this.brake = 0; this.handbrake = false;
    this.keys = new Set();
    // aiming is a screen position, resolved to a world angle by the game -
    // the renderer is the only thing that knows the camera
    this.aimX = 0; this.aimY = 0; this.aimHas = false;
    this.fire = false;
    this.touch = { steer: 0, walkY: 0, gas: false, brake: false, hand: false, active: false };
    this.wheelAngle = 0;
    this.pressed = new Set();
    this.isTouch = matchMedia('(pointer: coarse)').matches;
    this.bindKeys();
    this.bindWheel();
    this.bindPedals();
  }

  bindKeys() {
    addEventListener('keydown', e => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      this.keys.add(k);
      this.pressed.add(k);
      if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => { this.keys.clear(); this.fire = false; });

    const cv = document.getElementById('game');
    const toBuf = (e) => {
      const g = window.NIGHTSHIFT;
      if (!g || !g.renderer) return;
      const r = cv.getBoundingClientRect();
      this.aimX = (e.clientX - r.left) / r.width * g.renderer.vw;
      this.aimY = (e.clientY - r.top) / r.height * g.renderer.vh;
      this.aimHas = true;
    };
    addEventListener('mousemove', toBuf);
    addEventListener('mousedown', e => { if (e.button === 0) { toBuf(e); this.fire = true; } });
    addEventListener('mouseup', e => { if (e.button === 0) this.fire = false; });
    let aimPointer = null;
    cv.addEventListener('pointerdown', e => {
      if (!this.isTouch || e.pointerType === 'mouse' || aimPointer !== null) return;
      e.preventDefault(); aimPointer = e.pointerId; cv.setPointerCapture(aimPointer); toBuf(e);
    });
    cv.addEventListener('pointermove', e => { if (e.pointerId === aimPointer) toBuf(e); });
    for (const event of ['pointerup','pointercancel','lostpointercapture']) cv.addEventListener(event, e => { if (e.pointerId === aimPointer) aimPointer = null; });
    addEventListener('blur', () => { aimPointer = null; });
    addEventListener('contextmenu', e => e.preventDefault());
  }

  bindWheel() {
    const zone = document.getElementById('wheel-zone');
    const wheel = document.getElementById('wheel');
    const walkKnob = document.getElementById('walk-knob');
    if (!zone) return;
    let id = null, lastAng = 0, driving = true;
    const centre = () => {
      const r = zone.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const ang = (e, c) => Math.atan2(e.clientY - c.y, e.clientX - c.x);

    zone.addEventListener('pointerdown', e => {
      if (id !== null) return;
      id = e.pointerId;
      zone.setPointerCapture(id);
      driving = window.NIGHTSHIFT?.mode === 'drive';
      lastAng = ang(e, centre());
      this.touch.active = true;
      e.preventDefault();
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId !== id) return;
      const c = centre();
      if (!driving) {
        const dx = e.clientX - c.x, dy = e.clientY - c.y;
        const radius = Math.max(zone.clientWidth * .36, Math.hypot(dx, dy));
        this.touch.steer = dx / radius; this.touch.walkY = dy / radius;
        walkKnob.style.transform = `translate(${22 * dx / radius}px,${22 * dy / radius}px)`;
        return;
      }
      const a = ang(e, c);
      let d = a - lastAng;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      lastAng = a;
      const LIMIT = Math.PI * 0.78;              // ~140 degrees of lock
      this.wheelAngle = Math.max(-LIMIT, Math.min(LIMIT, this.wheelAngle + d));
      this.touch.steer = this.wheelAngle / LIMIT;
      wheel.style.transform = `rotate(${this.wheelAngle}rad)`;
      e.preventDefault();
    });
    const up = e => {
      if (e && e.pointerId !== id) return;
      id = null;
      this.touch.active = false;
      if (!driving || !e) {
        this.touch.steer = this.touch.walkY = this.wheelAngle = 0;
        wheel.style.transform = walkKnob.style.transform = '';
      }
    };
    for (const event of ['pointerup','pointercancel','lostpointercapture']) zone.addEventListener(event, up);
    addEventListener('blur', () => up());
    this.releaseWheel = () => up();
    this._wheelEl = wheel;
  }

  bindPedals() {
    const hook = (elId, set) => {
      const el = document.getElementById(elId);
      if (!el) return;
      let pointer = null;
      const on = e => { if (pointer !== null) return; pointer = e.pointerId; el.setPointerCapture(pointer); set(true); el.classList.add('on'); e.preventDefault(); };
      const off = e => { if (e && e.pointerId !== pointer) return; pointer = null; set(false); el.classList.remove('on'); };
      el.addEventListener('pointerdown', on);
      for (const event of ['pointerup','pointercancel','lostpointercapture']) el.addEventListener(event, off);
      addEventListener('blur', () => off());
    };
    hook('pedal-gas', v => this.touch.gas = v);
    hook('pedal-brake', v => this.touch.brake = v);
    hook('pedal-hand', v => this.touch.hand = v);
    hook('btn-sprint', v => v ? this.keys.add('shift') : this.keys.delete('shift'));
    hook('btn-fire', v => this.fire = v);
    document.getElementById('btn-down-floor')?.addEventListener('click', () => this.pressed.add('q'));
    document.getElementById('btn-touch-reload')?.addEventListener('click', () => this.pressed.add('r'));
    const use = document.getElementById('btn-use');
    use?.addEventListener('click', () => { this.useTap = true; });

  }

  // Called once at the top of every frame.
  poll(dt) {
    const k = this.keys;
    let steer = 0, throttle = 0, brake = 0, hand = false;
    if (this.isTouch) {
      const mode = window.NIGHTSHIFT?.mode || 'drive';
      if (mode !== this.touchMode) {
        this.releaseWheel?.(); this.touchMode = mode;
        document.getElementById('touch').dataset.mode = mode;
      }
    }

    // ---- keyboard ----
    if (k.has('a') || k.has('arrowleft') || k.has('q')) steer -= 1;
    if (k.has('d') || k.has('arrowright')) steer += 1;
    if (k.has('w') || k.has('arrowup') || k.has('z')) throttle = 1;
    if (k.has('s') || k.has('arrowdown')) brake = 1;
    if (k.has(' ')) hand = true;

    // ---- touch ----
    if (Math.abs(this.touch.steer) > 0.001) steer += this.touch.steer;
    if (this.touch.gas) throttle = 1;
    if (this.touch.brake) brake = 1;
    if (this.touch.hand) hand = true;

    // ---- gamepad ----
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.12) steer += ax;
      const rt = p.buttons[7] ? p.buttons[7].value : 0;
      const lt = p.buttons[6] ? p.buttons[6].value : 0;
      if (rt > 0.05) throttle = Math.max(throttle, rt);
      if (lt > 0.05) brake = Math.max(brake, lt);
      if (p.buttons[0] && p.buttons[0].pressed) hand = true;
      break;
    }

    // Spring the on-screen wheel back when nobody is holding it.
    if (!this.touch.active && Math.abs(this.wheelAngle) > 0.001) {
      this.wheelAngle *= Math.pow(0.0006, dt);
      if (Math.abs(this.wheelAngle) < 0.01) this.wheelAngle = 0;
      this.touch.steer = this.wheelAngle / (Math.PI * 0.78);
      if (this._wheelEl) this._wheelEl.style.transform = `rotate(${this.wheelAngle}rad)`;
    }

    this.steer = Math.max(-1, Math.min(1, steer));
    this.throttle = Math.max(0, Math.min(1, throttle));
    this.brake = Math.max(0, Math.min(1, brake));
    this.handbrake = hand;

    // On foot the same two axes mean something different: W and S walk you up
    // and down the world rather than working a throttle and a brake. Keeping
    // it on one pair of keys is the point - you never stop to think about
    // which mode you are in.
    let wy = 0;
    if (k.has('w') || k.has('arrowup') || k.has('z')) wy -= 1;
    if (k.has('s') || k.has('arrowdown')) wy += 1;
    if (this.touch.gas) wy -= 1;
    if (this.touch.brake) wy += 1;
    this.walkY = this.touch.walkY || wy;
  }

  // Edge-triggered key check, cleared each frame by endFrame().
  hit(key) {
    if (key === 'use') {
      const got = this.pressed.has('f') || this.pressed.has('e') || this.useTap;
      this.useTap = false;
      return !!got;
    }
    return this.pressed.has(key);
  }
  down(key) { return this.keys.has(key); }
  endFrame() { this.pressed.clear(); }
}
