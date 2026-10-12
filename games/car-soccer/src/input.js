// Keyboard, gamepad and touch -> per-player input {x, y, jump, boost}.
const keys = new Set();
const pressedOnce = new Set();
export const touch = { active: false, x: 0, y: 0, jump: false, boost: false, used: false };

const SOLO = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'],
  jump: ['Space', 'KeyJ', 'KeyZ'], boost: ['ShiftLeft', 'ShiftRight', 'KeyK', 'KeyX'],
};
const P1 = {
  left: ['KeyA'], right: ['KeyD'], up: ['KeyW'], down: ['KeyS'],
  jump: ['Space', 'KeyF'], boost: ['ShiftLeft', 'KeyG'],
};
const P2 = {
  left: ['ArrowLeft'], right: ['ArrowRight'], up: ['ArrowUp'], down: ['ArrowDown'],
  jump: ['Enter', 'NumpadEnter', 'Slash', 'Numpad0'], boost: ['ShiftRight', 'Period', 'NumpadDecimal'],
};
const GAME_KEYS = new Set([...Object.values(SOLO).flat(), ...Object.values(P1).flat(), ...Object.values(P2).flat()]);

export function initInput(onKey) {
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) pressedOnce.add(e.code);
    keys.add(e.code);
    onKey && onKey(e);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());
}
export function anyPressed(...codes) { return codes.some((c) => pressedOnce.has(c)); }
export function clearPressed() { pressedOnce.clear(); }

const down = (list) => list.some((k) => keys.has(k));
function fromMap(m) {
  const x = (down(m.right) ? 1 : 0) - (down(m.left) ? 1 : 0);
  const y = (down(m.up) ? 1 : 0) - (down(m.down) ? 1 : 0);
  return { x, y, jump: down(m.jump), boost: down(m.boost) };
}
function pad(i) {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const g = pads && pads[i];
  if (!g) return null;
  const dz = (v) => (Math.abs(v) < 0.25 ? 0 : v);
  let x = dz(g.axes[0] || 0), y = -dz(g.axes[1] || 0);
  const b = (n) => g.buttons[n] && g.buttons[n].pressed;
  if (b(14)) x = -1; if (b(15)) x = 1; if (b(12)) y = 1; if (b(13)) y = -1;
  return { x, y, jump: b(0) || b(3), boost: b(1) || b(7) || b(5) };
}
function merge(a, b) {
  if (!b) return a;
  return { x: Math.abs(b.x) > Math.abs(a.x) ? b.x : a.x, y: Math.abs(b.y) > Math.abs(a.y) ? b.y : a.y, jump: a.jump || b.jump, boost: a.boost || b.boost };
}
// player 0 / 1 input for the given mode ('bot' = solo, '2p' = shared keyboard)
export function readInput(player, mode) {
  if (mode === '2p') return merge(fromMap(player === 0 ? P1 : P2), pad(player));
  let r = merge(fromMap(SOLO), pad(0));
  if (touch.used) r = merge(r, { x: touch.x, y: touch.y, jump: touch.jump, boost: touch.boost });
  return r;
}

// ---- touch: floating joystick on the left half, JUMP / BOOST buttons on the right ----
export function initTouch(el, onAnyTouch) {
  const base = el.querySelector('.stick'), knob = el.querySelector('.knob');
  const bJump = el.querySelector('.b-jump'), bBoost = el.querySelector('.b-boost');
  let stickId = null, ox = 0, oy = 0;
  const R = 60;
  const setKnob = (dx, dy) => { knob.style.transform = `translate(${dx}px, ${dy}px)`; };
  const btn = (b, id) => b && b.classList.toggle('on', id);
  const state = new Map(); // touch id -> 'jump' | 'boost'
  const hitBtn = (t) => {
    for (const [b, name] of [[bJump, 'jump'], [bBoost, 'boost']]) {
      const r = b.getBoundingClientRect();
      const pad = 18;
      if (t.clientX > r.left - pad && t.clientX < r.right + pad && t.clientY > r.top - pad && t.clientY < r.bottom + pad) return name;
    }
    return null;
  };
  const refresh = () => {
    touch.jump = [...state.values()].includes('jump');
    touch.boost = [...state.values()].includes('boost');
    btn(bJump, touch.jump); btn(bBoost, touch.boost);
  };
  const start = (e) => {
    touch.used = true;
    document.body.classList.add('touchmode');
    onAnyTouch && onAnyTouch(e);
    for (const t of e.changedTouches) {
      const name = hitBtn(t);
      if (name) { state.set(t.identifier, name); continue; }
      if (stickId === null && t.clientX < window.innerWidth * 0.55) {
        stickId = t.identifier; ox = t.clientX; oy = t.clientY;
        base.style.left = ox + 'px'; base.style.top = oy + 'px'; base.classList.add('on'); setKnob(0, 0);
      } else if (t.clientX >= window.innerWidth * 0.55) {
        state.set(t.identifier, 'jump');   // a tap anywhere on the right = jump
      }
    }
    refresh();
    if (e.cancelable) e.preventDefault();
  };
  const move = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) {
        let dx = t.clientX - ox, dy = t.clientY - oy;
        const l = Math.hypot(dx, dy);
        if (l > R) {               // the base follows the thumb so the stick never "runs out"
          ox += (dx / l) * (l - R); oy += (dy / l) * (l - R);
          base.style.left = ox + 'px'; base.style.top = oy + 'px';
          dx = t.clientX - ox; dy = t.clientY - oy;
        }
        setKnob(dx, dy);
        const nx = dx / R, ny = -dy / R;
        touch.x = Math.abs(nx) < 0.18 ? 0 : Math.max(-1, Math.min(1, nx * 1.25));
        touch.y = Math.abs(ny) < 0.25 ? 0 : Math.max(-1, Math.min(1, ny * 1.25));
      } else if (state.has(t.identifier)) {
        const name = hitBtn(t);
        if (name) state.set(t.identifier, name);
      }
    }
    refresh();
    if (e.cancelable) e.preventDefault();
  };
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === stickId) { stickId = null; touch.x = touch.y = 0; base.classList.remove('on'); setKnob(0, 0); base.style.left = base.style.top = ''; }
      state.delete(t.identifier);
    }
    refresh();
  };
  el.addEventListener('touchstart', start, { passive: false });
  el.addEventListener('touchmove', move, { passive: false });
  el.addEventListener('touchend', end);
  el.addEventListener('touchcancel', end);
}
