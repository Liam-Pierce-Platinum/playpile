// Keyboard + mouse (pointer lock) and touch (left stick, right-side look drag, buttons).
// Produces one snapshot per frame; one-shot presses are latched until read.
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.latch = new Set();
    this.dx = 0; this.dy = 0; this.mouseBack = false; this.locked = false;
    this.sens = 0.0022; this.touch = false;
    this.stick = { id: null, x: 0, y: 0, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.tbtn = new Set();
    this.canvas = canvas;
    this.bot = null;          // test hook: a function returning a snapshot
    addEventListener('keydown', e => {
      if (e.repeat) { if (['Space', 'ControlLeft', 'ControlRight'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.latch.add(e.code);
      if (['Space', 'ControlLeft', 'ControlRight', 'Tab', 'KeyQ'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', e => { if (this.locked) { this.dx += e.movementX; this.dy += e.movementY; } });
    addEventListener('mousedown', e => {
      if (!this.locked) return;
      if (e.button === 0) this.latch.add('Mouse0');
      if (e.button === 1) { this.mouseBack = true; e.preventDefault(); }
      if (e.button === 2) this.latch.add('Mouse2');
    });
    addEventListener('mouseup', e => { if (e.button === 1) this.mouseBack = false; });
    addEventListener('contextmenu', e => e.preventDefault());
    document.addEventListener('pointerlockchange', () => { this.locked = document.pointerLockElement === canvas; if (this.onLock) this.onLock(this.locked); });
    // ---- touch ----
    const zone = document.getElementById('stickzone'), stick = document.getElementById('stick'), knob = stick.querySelector('i');
    zone.addEventListener('pointerdown', e => {
      e.preventDefault(); this.touch = true;
      const s = this.stick; s.id = e.pointerId; s.ox = e.clientX; s.oy = e.clientY; s.x = s.y = 0;
      stick.style.display = 'block'; stick.style.left = (e.clientX - 60) + 'px'; stick.style.top = (e.clientY - 60) + 'px'; stick.style.bottom = 'auto';
      knob.style.transform = '';
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', e => {
      const s = this.stick; if (e.pointerId !== s.id) return;
      let x = (e.clientX - s.ox) / 50, y = (e.clientY - s.oy) / 50; const l = Math.hypot(x, y); if (l > 1.25) { x *= 1.25 / l; y *= 1.25 / l; }
      s.x = x; s.y = y; knob.style.transform = `translate(${x * 40}px, ${y * 40}px)`;
    });
    const endStick = e => { const s = this.stick; if (e.pointerId !== s.id) return; s.id = null; s.x = s.y = 0; stick.style.display = 'none'; };
    zone.addEventListener('pointerup', endStick); zone.addEventListener('pointercancel', endStick);
    // look: any touch on the right part of the screen that is not a button
    canvas.addEventListener('pointerdown', e => {
      if (e.pointerType !== 'touch') return;
      this.touch = true; const L = this.look; L.id = e.pointerId; L.x = e.clientX; L.y = e.clientY;
    });
    addEventListener('pointermove', e => {
      const L = this.look; if (e.pointerId !== L.id) return;
      this.dx += (e.clientX - L.x) * 2.2; this.dy += (e.clientY - L.y) * 2.2; L.x = e.clientX; L.y = e.clientY;
    });
    const endLook = e => { if (e.pointerId === this.look.id) this.look.id = null; };
    addEventListener('pointerup', endLook); addEventListener('pointercancel', endLook);
    for (const b of document.querySelectorAll('#tbtns .tb')) {
      const k = b.dataset.k;
      b.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation(); this.touch = true;
        if (k === 'sprint') { this.sprintToggle = !this.sprintToggle; b.classList.toggle('on', this.sprintToggle); }
        else { this.tbtn.add(k); this.latch.add('T' + k); b.classList.add('on'); }
      });
      const up = () => { this.tbtn.delete(k); if (k !== 'sprint') b.classList.remove('on'); };
      b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', up);
    }
  }
  lock() { try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) {} }
  unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
  pressed(code) { if (this.latch.has(code)) { this.latch.delete(code); return true; } return false; }
  clear() { this.latch.clear(); this.dx = this.dy = 0; }
  read() {
    if (this.bot) return this.bot();
    const k = this.keys;
    let mx = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let mz = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    let sprint = k.has('ShiftLeft') || k.has('ShiftRight');
    if (this.stick.id !== null) {
      mx = this.stick.x; mz = -this.stick.y;
      const l = Math.hypot(mx, mz);
      if (l > 1.05) sprint = true;   // push the stick to the rim to sprint
      if (l > 1) { mx /= l; mz /= l; }
    }
    if (this.sprintToggle) sprint = true;
    const out = {
      mx, mz, sprint,
      jump: this.pressed('Space') || this.pressed('Tjump'),
      slide: this.pressed('ControlLeft') || this.pressed('ControlRight') || this.pressed('KeyC') || this.pressed('Tslide'),
      slideHeld: k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC') || this.tbtn.has('slide'),
      use: this.pressed('KeyE') || this.pressed('KeyF') || this.pressed('Tuse'),
      shove: this.pressed('Mouse0') || this.pressed('Tshove'),
      back: k.has('KeyQ') || this.mouseBack || this.tbtn.has('back'),
      lookDX: this.dx * this.sens, lookDY: this.dy * this.sens,
    };
    this.dx = this.dy = 0;
    return out;
  }
}
