// Keyboard + mouse + touch, all mapped to game-space (480x270) coordinates.
export const GW = 480, GH = 270;
export const input = {
  keys: new Set(), pressed: new Set(),
  mouse: { x: GW / 2, y: GH / 2, down: false, moved: -99, clicked: false },
  touch: false, stick: null, stickVec: { x: 0, y: 0 }, held: new Set(),
  buttons: [], // [{id, x, y, r}] laid out by the battle HUD for touch
  canvas: null,
};
const now = () => performance.now() / 1000;
function toGame(cx, cy) {
  const r = input.canvas.getBoundingClientRect();
  return { x: ((cx - r.left) / r.width) * GW, y: ((cy - r.top) / r.height) * GH };
}
export function initInput(canvas) {
  input.canvas = canvas;
  addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) && e.target === document.body) e.preventDefault();
    if (!input.keys.has(e.code)) input.pressed.add(e.code);
    input.keys.add(e.code);
  });
  addEventListener('keyup', (e) => input.keys.delete(e.code));
  addEventListener('blur', () => { input.keys.clear(); input.held.clear(); input.mouse.down = false; });
  canvas.addEventListener('mousemove', (e) => { const p = toGame(e.clientX, e.clientY); input.mouse.x = p.x; input.mouse.y = p.y; input.mouse.moved = now(); });
  canvas.addEventListener('mousedown', (e) => { if (e.button === 0) { input.mouse.down = true; input.mouse.clicked = true; input.mouse.moved = now(); } });
  addEventListener('mouseup', () => { input.mouse.down = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  const tStart = (e) => {
    e.preventDefault(); input.touch = true;
    for (const t of e.changedTouches) {
      const p = toGame(t.clientX, t.clientY);
      const b = input.buttons.find((b) => Math.hypot(b.x - p.x, b.y - p.y) < b.r + 8);
      if (b) { input.pressed.add(b.id); input.held.add(b.id); b.touch = t.identifier; continue; }
      if (p.x < GW * 0.5 && !input.stick) input.stick = { id: t.identifier, ox: p.x, oy: p.y, x: p.x, y: p.y };
    }
  };
  const tMove = (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (input.stick && t.identifier === input.stick.id) {
        const p = toGame(t.clientX, t.clientY); input.stick.x = p.x; input.stick.y = p.y;
        let dx = p.x - input.stick.ox, dy = p.y - input.stick.oy; const d = Math.hypot(dx, dy), R = 26;
        if (d > R) { input.stick.ox += (dx / d) * (d - R); input.stick.oy += (dy / d) * (d - R); dx = (dx / d) * R; dy = (dy / d) * R; }
        input.stickVec.x = dx / R; input.stickVec.y = dy / R;
      }
    }
  };
  const tEnd = (e) => {
    for (const t of e.changedTouches) {
      if (input.stick && t.identifier === input.stick.id) { input.stick = null; input.stickVec.x = input.stickVec.y = 0; }
      for (const b of input.buttons) if (b.touch === t.identifier) { input.held.delete(b.id); b.touch = null; }
    }
  };
  canvas.addEventListener('touchstart', tStart, { passive: false });
  canvas.addEventListener('touchmove', tMove, { passive: false });
  canvas.addEventListener('touchend', tEnd); canvas.addEventListener('touchcancel', tEnd);
}
export function mouseRecent() { return !input.touch && now() - input.mouse.moved < 2.5; }
export function endFrame() { input.pressed.clear(); input.mouse.clicked = false; }
export function moveVec() {
  const k = input.keys;
  let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
  let y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
  if (input.stick) { x = input.stickVec.x; y = input.stickVec.y; }
  const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; }
  return { x, y };
}
