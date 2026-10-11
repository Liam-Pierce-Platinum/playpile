// Three ways to move: WASD/arrows, click-and-hold toward the cursor, or a
// floating one-thumb stick (touch anywhere and drag).
export class Input {
  constructor(canvas) {
    this.keys = new Set(); this.mouse = null; this.stick = null; this.any = false;
    window.addEventListener('keydown', (e) => { this.keys.add(e.code); this.any = true; });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => { this.keys.clear(); this.mouse = null; this.stick = null; });
    canvas.addEventListener('pointerdown', (e) => {
      this.any = true;
      if (e.pointerType === 'mouse') { if (e.button === 0) this.mouse = { x: e.clientX, y: e.clientY }; }
      else if (!this.stick) this.stick = { id: e.pointerId, ox: e.clientX, oy: e.clientY, dx: 0, dy: 0 };
      try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* ignore */ }
      e.preventDefault();
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerType === 'mouse') { if (this.mouse) { this.mouse.x = e.clientX; this.mouse.y = e.clientY; } }
      else if (this.stick && this.stick.id === e.pointerId) {
        let dx = (e.clientX - this.stick.ox) / 54, dy = (e.clientY - this.stick.oy) / 54;
        const m = Math.hypot(dx, dy);
        if (m > 1) {
          // drag the base along so the thumb never runs off the stick
          this.stick.ox += (dx / m) * (m - 1) * 54; this.stick.oy += (dy / m) * (m - 1) * 54; dx /= m; dy /= m;
        }
        this.stick.dx = dx; this.stick.dy = dy;
      }
    });
    const up = (e) => {
      if (e.pointerType === 'mouse') this.mouse = null;
      else if (this.stick && this.stick.id === e.pointerId) this.stick = null;
    };
    canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  clear() { this.mouse = null; this.stick = null; }
  vector(psx, psy) {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;
    if (x || y) { const m = Math.hypot(x, y); return { x: x / m, y: y / m }; }
    if (this.stick) { const m = Math.hypot(this.stick.dx, this.stick.dy); if (m > 0.12) return { x: this.stick.dx, y: this.stick.dy }; return { x: 0, y: 0 }; }
    if (this.mouse) {
      const dx = this.mouse.x - psx, dy = this.mouse.y - psy, d = Math.hypot(dx, dy);
      if (d < 10) return { x: 0, y: 0 };
      const m = Math.min(1, d / 70);
      return { x: dx / d * m, y: dy / d * m };
    }
    return { x: 0, y: 0 };
  }
}
