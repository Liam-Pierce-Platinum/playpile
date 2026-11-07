// Keep a drag owned by the finger that began it, even if a second thumb lands.
export function bindPrimaryTouch(canvas, { down, move, up, cancel }) {
  let owner = null;
  const changed = event => Array.from(event.changedTouches).find(touch => touch.identifier === owner);
  canvas.addEventListener('touchstart', event => {
    if (event.cancelable) event.preventDefault();
    if (owner !== null) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    owner = touch.identifier;
    down(touch, event);
  }, { passive:false });
  canvas.addEventListener('touchmove', event => {
    if (event.cancelable) event.preventDefault();
    const touch = changed(event);
    if (touch) move(touch);
  }, { passive:false });
  window.addEventListener('touchend', event => {
    const touch = changed(event);
    if (!touch) return;
    owner = null;
    move(touch);
    up();
  });
  function release() {
    if (owner === null) return;
    owner = null;
    cancel();
  }
  window.addEventListener('touchcancel', event => { if (changed(event)) release(); });
  window.addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
}
