// Keyboard + mouse, gamepad, and floating twin sticks for touch.
// Desktop: WASD moves, mouse aims (always firing), arrows aim too.
// Touch: left half = move stick, right half = aim/fire stick. With no thumb
// on the right half the ship auto-aims at the nearest enemy.
export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.mouse = { x: 0, y: 0, seen: false };
    this.left = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
    this.right = { active: false, id: -1, ox: 0, oy: 0, dx: 0, dy: 0 };
    this.stickR = 56;
    // touch mode (auto-aim, sticks, BOMB button): on from the start on a
    // coarse-pointer device, and switched on by ANY touch, including the tap on
    // PLAY, so the ship is already auto-firing before the thumb reaches the arena
    this.touch = matchMedia('(pointer: coarse)').matches;
    addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch' || e.pointerType === 'pen') this.touch = true; else if (e.pointerType === 'mouse') this.touch = false; }, { capture: true });
    this.lastAim = [1, 0];
    this.onBomb = null; this.onKey = null; this.onTouchStart = null;
    this.padBomb = false;
    addEventListener('keydown', (e) => {
      if (e.repeat) { if (/Arrow|Space/.test(e.code)) e.preventDefault(); return; }
      this.keys.add(e.code);
      if (/Arrow|Space/.test(e.code)) e.preventDefault();
      if (this.onKey) this.onKey(e.code, e);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => { this.keys.clear(); this.release(this.left); this.release(this.right); });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true;
        if (e.button === 2 && this.onBomb) this.onBomb();
        return;
      }
      this.touch = true;
      if (this.onTouchStart) this.onTouchStart();
      const st = e.clientX < innerWidth / 2 ? this.left : this.right;
      if (st.active) return;
      st.active = true; st.id = e.pointerId; st.ox = e.clientX; st.oy = e.clientY; st.dx = st.dy = 0;
      try { canvas.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { this.mouse.x = e.clientX; this.mouse.y = e.clientY; this.mouse.seen = true; return; }
      for (const st of [this.left, this.right]) {
        if (!st.active || st.id !== e.pointerId) continue;
        let dx = e.clientX - st.ox, dy = e.clientY - st.oy;
        const d = Math.hypot(dx, dy), R = this.stickR;
        if (d > R) { // drag the base along so the stick never "runs out"
          st.ox = e.clientX - dx / d * R; st.oy = e.clientY - dy / d * R;
          dx = dx / d * R; dy = dy / d * R;
        }
        st.dx = dx / R; st.dy = dy / R;
      }
    });
    const up = (e) => { for (const st of [this.left, this.right]) if (st.id === e.pointerId) this.release(st); };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }
  release(st) { st.active = false; st.id = -1; st.dx = st.dy = 0; }

  // fill game.inp from whatever the player is touching
  read(g, ren) {
    const inp = g.inp, k = this.keys;
    let mx = 0, my = 0, ax = 0, ay = 0, aim = false;
    if (k.has('KeyA')) mx -= 1; if (k.has('KeyD')) mx += 1;
    if (k.has('KeyW')) my -= 1; if (k.has('KeyS')) my += 1;
    let kax = 0, kay = 0;
    if (k.has('ArrowLeft')) kax -= 1; if (k.has('ArrowRight')) kax += 1;
    if (k.has('ArrowUp')) kay -= 1; if (k.has('ArrowDown')) kay += 1;
    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let padAim = false;
    for (const pd of pads) {
      if (!pd) continue;
      const dz = (v) => (Math.abs(v) < 0.2 ? 0 : v);
      mx += dz(pd.axes[0] || 0); my += dz(pd.axes[1] || 0);
      const rx = dz(pd.axes[2] || 0), ry = dz(pd.axes[3] || 0);
      if (Math.hypot(rx, ry) > 0.3) { ax = rx; ay = ry; aim = padAim = true; }
      const b = pd.buttons;
      const bomb = (b[0] && b[0].pressed) || (b[6] && b[6].pressed) || (b[7] && b[7].pressed) || (b[4] && b[4].pressed) || (b[5] && b[5].pressed);
      if (bomb && !this.padBomb && this.onBomb) this.onBomb();
      this.padBomb = !!bomb;
      if (b[9] && b[9].pressed && !this.padStart && this.onKey) this.onKey('Escape');
      this.padStart = !!(b[9] && b[9].pressed);
      break;
    }
    if (this.left.active) { mx += this.left.dx; my += this.left.dy; }
    const p = g.p;
    if (padAim) { /* done */ }
    else if (this.right.active && Math.hypot(this.right.dx, this.right.dy) > 0.25) { ax = this.right.dx; ay = this.right.dy; aim = true; }
    else if (kax || kay) { ax = kax; ay = kay; aim = true; }
    else if (this.touch) {
      // auto-aim at the nearest live enemy
      // longer reach in the opening 15 s so a one-thumb phone player is
      // shooting something from the first seconds (first kill was 4-5 s)
      let best = null, bd = g.t < 15 ? 1200 : 440;
      for (const e of g.enemies) {
        if (e.dead || e.spawn > 0) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y) + (e.type === 'hole' && !e.active ? 260 : 0);
        if (d < bd) { bd = d; best = e; }
      }
      // the turret swings toward it at a capped rate (~7 rad/s) instead of
      // snapping, so one-thumb play helps a beginner without playing for them
      if (best) {
        const want = Math.atan2(best.y - p.y, best.x - p.x);
        let cur = Math.atan2(this.lastAim[1], this.lastAim[0]), d = want - cur;
        while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
        cur += Math.max(-0.12, Math.min(0.12, d));
        ax = Math.cos(cur); ay = Math.sin(cur); aim = true;
      }
    } else if (this.mouse.seen) {
      const wx = ren.cam.x + (this.mouse.x - ren.cw / 2) / ren.scale;
      const wy = ren.cam.y + (this.mouse.y - ren.ch / 2) / ren.scale;
      ax = wx - p.x; ay = wy - p.y; aim = Math.hypot(ax, ay) > 4;
    }
    if (aim) this.lastAim = [ax, ay];
    inp.mx = mx; inp.my = my; inp.ax = ax; inp.ay = ay; inp.aim = aim;
  }
}
