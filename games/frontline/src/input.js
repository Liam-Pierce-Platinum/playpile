// Keyboard + mouse (pointer lock) + touch controls -> a simple input state the player
// controller reads each frame.
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set(); // edge-triggered this frame
    this.mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0 };
    this.locked = false;
    this.touch = { active: false, mx: 0, mz: 0, lookId: null, moveId: null, fire: false, aim: false };
    this.enabled = true;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (['Tab', 'Space'].includes(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code); this.pressed.add(e.code);
      if (['Tab', 'Space', 'ControlLeft', 'KeyW', 'KeyS', 'KeyA', 'KeyD'].includes(e.code) && this.locked) e.preventDefault();
      if (e.code === 'Tab') e.preventDefault();
    });
    addEventListener('keyup', (e) => { this.keys.delete(e.code); });
    addEventListener('blur', () => { this.keys.clear(); this.mouse.left = this.mouse.right = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      this.pressed.add('Mouse' + e.button);
    });
    addEventListener('mouseup', (e) => { if (e.button === 0) this.mouse.left = false; if (e.button === 2) this.mouse.right = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => { if (this.locked) { this.mouse.dx += e.movementX || 0; this.mouse.dy += e.movementY || 0; } });
    addEventListener('wheel', (e) => { if (this.locked) this.mouse.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (this.onLockChange) this.onLockChange(this.locked);
    });
    this.setupTouch();
  }
  lock() {
    if (this.isTouch) return;
    try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed */ }
  }
  unlock() { try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ } }
  down(c) { return this.keys.has(c); }
  hit(c) { return this.pressed.has(c); }
  endFrame() { this.pressed.clear(); this.mouse.dx = 0; this.mouse.dy = 0; this.mouse.wheel = 0; }
  setupTouch() {
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window && navigator.maxTouchPoints > 0;
    const ui = document.getElementById('touch');
    if (!ui) return;
    if (!this.isTouch) { ui.style.display = 'none'; return; }
    ui.style.display = '';
    document.body.classList.add('touch');
    const stick = document.getElementById('stick'), knob = document.getElementById('knob');
    const T = this.touch;
    let sx = 0, sy = 0;
    const btn = (id, on, off) => { const b = document.getElementById(id); if (!b) return; b.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); on(); }, { passive: false }); b.addEventListener('touchend', (e) => { e.preventDefault(); e.stopPropagation(); if (off) off(); }, { passive: false }); };
    btn('t-fire', () => { T.fire = true; this.mouse.left = true; }, () => { T.fire = false; this.mouse.left = false; });
    btn('t-aim', () => { T.aim = !T.aim; this.mouse.right = T.aim; });
    btn('t-reload', () => this.pressed.add('KeyR'));
    btn('t-jump', () => this.pressed.add('Space'));
    btn('t-crouch', () => { if (this.keys.has('KeyC')) this.keys.delete('KeyC'); else this.keys.add('KeyC'); });
    btn('t-nade', () => this.pressed.add('KeyG'));
    btn('t-swap', () => this.pressed.add('KeyQ'));
    btn('t-use', () => { this.pressed.add('KeyE'); this.keys.add('KeyE'); }, () => this.keys.delete('KeyE'));
    btn('t-pause', () => this.pressed.add('Pause'));
    btn('t-sprint', () => { if (this.keys.has('ShiftLeft')) this.keys.delete('ShiftLeft'); else this.keys.add('ShiftLeft'); });
    let lx = 0, ly = 0;
    addEventListener('touchstart', (e) => {
      for (const t of e.changedTouches) {
        if (t.target.closest && t.target.closest('.tbtn')) continue;
        if (t.target.closest && t.target.closest('.panel')) continue;
        if (t.clientX < innerWidth * 0.4 && T.moveId === null) { T.moveId = t.identifier; sx = t.clientX; sy = t.clientY; stick.style.left = (sx - 60) + 'px'; stick.style.top = (sy - 60) + 'px'; stick.classList.add('on'); }
        else if (T.lookId === null) { T.lookId = t.identifier; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === T.moveId) {
          let dx = t.clientX - sx, dy = t.clientY - sy; const L = Math.hypot(dx, dy), m = 50;
          if (L > m) { dx = dx / L * m; dy = dy / L * m; }
          knob.style.transform = `translate(${dx}px,${dy}px)`;
          T.mx = dx / m; T.mz = dy / m;
        } else if (t.identifier === T.lookId) { this.mouse.dx += (t.clientX - lx) * 2.2; this.mouse.dy += (t.clientY - ly) * 2.2; lx = t.clientX; ly = t.clientY; }
      }
    }, { passive: true });
    const end = (e) => { for (const t of e.changedTouches) { if (t.identifier === T.moveId) { T.moveId = null; T.mx = T.mz = 0; knob.style.transform = ''; stick.classList.remove('on'); } if (t.identifier === T.lookId) T.lookId = null; } };
    addEventListener('touchend', end); addEventListener('touchcancel', end);
  }
}
