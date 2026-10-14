// Input: mouse aim (pointer lock = absolute aim, no lock = cursor offset steers), keyboard direct
// flight (W/S pitch, A/D roll), and touch (virtual stick + buttons). Produces one state per frame.
import { clamp } from './util.js';

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas; this.settings = settings;
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, dx: 0, dy: 0, inside: false, left: false, right: false, moved: false };
    this.locked = false;
    this.edges = new Set();
    this.touch = { stick: null, sx: 0, sy: 0, fire: false, boost: false, active: false };
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);
    const kd = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if (!this.keys.has(e.code)) this.edges.add(e.code);
      this.keys.add(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    };
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.inside = true; this.mouse.moved = true;
      if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; }
    });
    document.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) { this.mouse.right = true; this.edges.add('Mouse2'); }
      if (this.settings.ctrl === 'mouse' && !this.locked && !this.isTouch && !this.noLock) { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (x) { /* */ } }
    });
    window.addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }

  /** wire the on-screen touch controls (elements built by the UI) */
  bindTouch(root) {
    const stick = root.querySelector('#stick'), knob = root.querySelector('#knob');
    const area = root.querySelector('#stickArea');
    let sid = null, ox = 0, oy = 0;
    const R = 60;
    area.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0]; sid = t.identifier; ox = t.clientX; oy = t.clientY;
      stick.style.left = ox + 'px'; stick.style.top = oy + 'px'; stick.classList.add('on');
      this.touch.sx = 0; this.touch.sy = 0; this.touch.active = true;
    }, { passive: false });
    area.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier !== sid) continue;
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx *= R / d; dy *= R / d; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.touch.sx = dx / R; this.touch.sy = dy / R;
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; this.touch.sx = this.touch.sy = 0; this.touch.active = false; knob.style.transform = ''; stick.classList.remove('on'); }
    };
    area.addEventListener('touchend', end); area.addEventListener('touchcancel', end);
    const hold = (id, key) => {
      const el = root.querySelector(id);
      el.addEventListener('touchstart', (e) => { e.preventDefault(); this.touch[key] = true; el.classList.add('on'); }, { passive: false });
      const up = (e) => { e.preventDefault(); this.touch[key] = false; el.classList.remove('on'); };
      el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    };
    hold('#tFire', 'fire'); hold('#tBoost', 'boost');
    const tap = (id, code) => root.querySelector(id).addEventListener('touchstart', (e) => { e.preventDefault(); this.edges.add(code); }, { passive: false });
    tap('#tMsl', 'TouchMissile'); tap('#tRoll', 'TouchRoll');
  }

  edge(code) { return this.edges.has(code); }
  down(code) { return this.keys.has(code); }

  /** read and reset the per-frame state */
  read(dt) {
    const k = this.keys, s = this.settings;
    const inv = s.invert ? -1 : 1;
    const st = {
      aimYaw: 0, aimPitch: 0, direct: false, pitch: 0, roll: 0, yaw: 0,
      fire: k.has('Space') || this.mouse.left || this.touch.fire,
      boost: k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.boost,
      missile: this.edge('Mouse2') || this.edge('KeyF') || this.edge('KeyR') || this.edge('TouchMissile'),
      rollL: this.edge('KeyQ'), rollR: this.edge('KeyE'), rollAny: this.edge('TouchRoll'),
      lookBack: k.has('KeyC'),
    };
    // keyboard direct flight (always available; overrides mouse aim while held)
    const up = k.has('KeyS') || k.has('ArrowDown'), dn = k.has('KeyW') || k.has('ArrowUp');
    const lf = k.has('KeyA') || k.has('ArrowLeft'), rt = k.has('KeyD') || k.has('ArrowRight');
    if (up || dn || lf || rt || s.ctrl === 'keys') {
      st.direct = true;
      st.pitch = ((up ? 1 : 0) - (dn ? 1 : 0)) * inv;
      st.roll = (rt ? 1 : 0) - (lf ? 1 : 0);
    }
    const sens = 0.0022 * (s.sens || 1);
    if (this.touch.active) {
      // the stick steers the aim point like a joystick (rate)
      const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
      st.aimYaw = -dz(this.touch.sx) * 2.0 * dt * (s.sens || 1);
      st.aimPitch = -dz(this.touch.sy) * 1.6 * dt * (s.sens || 1) * inv;
    } else if (this.locked) {
      st.aimYaw = -this.mouse.dx * sens; st.aimPitch = -this.mouse.dy * sens * inv;
    } else if (s.ctrl === 'mouse' && this.mouse.inside && this.mouse.moved && !this.isTouch) {
      // no pointer lock: the cursor's offset from the centre steers (rate), with a dead zone
      const w = innerWidth, h = innerHeight;
      const ox = (this.mouse.x - w / 2) / (Math.min(w, h) * 0.45), oy = (this.mouse.y - h / 2) / (Math.min(w, h) * 0.45);
      const dz = (v) => { const a = Math.abs(v); return a < 0.06 ? 0 : Math.sign(v) * Math.min(1, (a - 0.06) / 0.94); };
      st.aimYaw = -dz(ox) * 2.2 * dt * (s.sens || 1); st.aimPitch = -dz(oy) * 1.8 * dt * (s.sens || 1) * inv;
    }
    this.mouse.dx = 0; this.mouse.dy = 0;
    this.edges.clear();
    st.aimPitch = clamp(st.aimPitch, -0.5, 0.5);
    return st;
  }
  /** grab the mouse right away when a run starts from a click (desktop, mouse aim) */
  lock() {
    if (this.isTouch || this.noLock || this.settings.ctrl !== 'mouse' || this.locked) return;
    try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* not allowed here */ }
  }
  unlock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* */ } }
}
