// Keyboard + touch -> one input state the world reads each frame.
export const input = { mx: 0, my: 0, act: false, boost: false, ping: false, pause: false, touch: false, keys: new Set(), stick: null };
const down = input.keys;
const edge = new Set();

export function initInput(onKey) {
  addEventListener('keydown', e => {
    if (e.repeat) { if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault(); return; }
    down.add(e.code); edge.add(e.code);
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    onKey && onKey(e);
  });
  addEventListener('keyup', e => down.delete(e.code));
  addEventListener('blur', () => down.clear());
  // ---- touch
  const zone = document.getElementById('stickzone'), base = document.getElementById('stickbase'), knob = document.getElementById('stickknob');
  let sid = null, ox = 0, oy = 0;
  const R = 46;
  zone.addEventListener('touchstart', e => {
    input.touch = true; document.body.classList.add('touch');
    const t = e.changedTouches[0]; sid = t.identifier; ox = t.clientX; oy = t.clientY;
    base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on'); knob.style.transform = 'translate(-50%,-50%)';
    input.stick = { x: 0, y: 0 }; e.preventDefault();
  }, { passive: false });
  zone.addEventListener('touchmove', e => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      let dx = t.clientX - ox, dy = t.clientY - oy; const l = Math.hypot(dx, dy);
      if (l > R) { dx *= R / l; dy *= R / l; }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      input.stick = { x: dx / R, y: dy / R };
    }
    e.preventDefault();
  }, { passive: false });
  const end = e => { for (const t of e.changedTouches) if (t.identifier === sid) { sid = null; input.stick = null; base.classList.remove('on'); } };
  zone.addEventListener('touchend', end); zone.addEventListener('touchcancel', end);
  const hold = (id, key) => {
    const el = document.getElementById(id);
    el.addEventListener('touchstart', e => { input.touch = true; document.body.classList.add('touch'); down.add(key); edge.add(key); el.classList.add('on'); e.preventDefault(); }, { passive: false });
    const up = e => { down.delete(key); el.classList.remove('on'); e.preventDefault(); };
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', e => { down.add(key); edge.add(key); });
    el.addEventListener('mouseup', e => down.delete(key)); el.addEventListener('mouseleave', e => down.delete(key));
  };
  try { if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0 && matchMedia('(hover: none)').matches) { input.touch = true; document.body.classList.add('touch'); } } catch (e) { /* old browser */ }
  hold('bAct', 'TouchAct'); hold('bBoost', 'TouchBoost'); hold('bPing', 'TouchPing');
  addEventListener('touchstart', () => { input.touch = true; document.body.classList.add('touch'); }, { passive: true });
}

export function pollInput() {
  const k = c => down.has(c);
  let x = (k('KeyD') || k('ArrowRight') ? 1 : 0) - (k('KeyA') || k('ArrowLeft') ? 1 : 0);
  let y = (k('KeyS') || k('ArrowDown') ? 1 : 0) - (k('KeyW') || k('ArrowUp') ? 1 : 0);
  if (x && y) { x *= 0.7071; y *= 0.7071; }
  if (input.stick) { const l = Math.hypot(input.stick.x, input.stick.y); if (l > 0.18) { x = input.stick.x; y = input.stick.y; } }
  input.mx = x; input.my = y;
  input.act = k('KeyE') || k('Space') || k('KeyJ') || k('Enter') && false || k('TouchAct');
  input.boost = k('ShiftLeft') || k('ShiftRight') || k('KeyK') || k('TouchBoost');
  input.ping = edge.has('KeyQ') || edge.has('KeyL') || edge.has('TouchPing');
  input.boostPressed = edge.has('ShiftLeft') || edge.has('ShiftRight') || edge.has('KeyK') || edge.has('TouchBoost');
  edge.clear();
  return input;
}
