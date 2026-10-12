// Keyboard, mouse and touch. The camera looks "north" (toward -z), so screen
// up is -z and screen right is +x for every input device.
export class Input {
  constructor() {
    this.keys = new Set();
    this.mode = 'solo';
    this.touch = { active: false, id: -1, ox: 0, oy: 0, x: 0, z: 0, dash: false };
    this.mouseDash = false;
    this.usedTouch = false;
    this.onAny = null;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (this.isGameKey(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (this.isGameKey(e.code)) e.preventDefault();
      if (this.onKey) this.onKey(e.code, e);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.mouseDash = false; this.touch.dash = false; this.touch.active = false; this.resetStick(); });
  }

  isGameKey(c) {
    return ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'ShiftRight', 'Slash'].includes(c);
  }

  bindTouch(zone, stick, knob, btn) {
    this.stickEl = stick; this.knobEl = knob;
    const T = this.touch;
    const R = 56;
    const move = (x, y) => {
      let dx = x - T.ox, dy = y - T.oy;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        // drag the base along so the stick never "runs out"
        T.ox += (dx / l) * (l - R); T.oy += (dy / l) * (l - R);
        dx = x - T.ox; dy = y - T.oy;
      }
      const k = Math.min(1, Math.hypot(dx, dy) / R);
      const ll = Math.hypot(dx, dy) || 1;
      T.x = k < 0.12 ? 0 : (dx / ll) * k; T.z = k < 0.12 ? 0 : (dy / ll) * k;
      stick.style.transform = `translate(${T.ox}px, ${T.oy}px)`;
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (T.active) return;
      e.preventDefault();
      this.usedTouch = true;
      T.active = true; T.id = e.pointerId; T.ox = e.clientX; T.oy = e.clientY;
      stick.classList.add('on');
      move(e.clientX, e.clientY);
      try { zone.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
    });
    zone.addEventListener('pointermove', (e) => { if (T.active && e.pointerId === T.id) move(e.clientX, e.clientY); });
    const end = (e) => { if (e.pointerId === T.id) { T.active = false; T.id = -1; this.resetStick(); } };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); this.usedTouch = true; T.dash = true; btn.classList.add('down'); try { btn.setPointerCapture(e.pointerId); } catch (er) { /* fine */ } });
    const up = () => { T.dash = false; btn.classList.remove('down'); };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }

  resetStick() {
    const T = this.touch;
    T.x = 0; T.z = 0;
    if (this.stickEl) { this.stickEl.classList.remove('on'); this.knobEl.style.transform = 'translate(0px,0px)'; }
  }

  axis(up, down, left, right) {
    const k = this.keys;
    let x = (k.has(right) ? 1 : 0) - (k.has(left) ? 1 : 0);
    let z = (k.has(down) ? 1 : 0) - (k.has(up) ? 1 : 0);
    const l = Math.hypot(x, z);
    if (l > 1) { x /= l; z /= l; }
    return { x, z };
  }

  // the input for human slot `pid` (0 or 1)
  read(pid) {
    const k = this.keys;
    if (this.mode === '2p') {
      if (pid === 0) { const a = this.axis('KeyW', 'KeyS', 'KeyA', 'KeyD'); return { ...a, dash: k.has('Space') || k.has('KeyF') || k.has('ShiftLeft') }; }
      const a = this.axis('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
      return { ...a, dash: k.has('Enter') || k.has('ShiftRight') || k.has('Slash') || k.has('NumpadEnter') || k.has('Numpad0') };
    }
    let a = this.axis('KeyW', 'KeyS', 'KeyA', 'KeyD');
    if (!a.x && !a.z) a = this.axis('ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight');
    const T = this.touch;
    if (T.x || T.z) a = { x: T.x, z: T.z };
    return { ...a, dash: k.has('Space') || k.has('Enter') || k.has('KeyJ') || k.has('KeyK') || this.mouseDash || T.dash };
  }
}
