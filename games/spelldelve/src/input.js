// Keyboard + mouse + touch input, folded into one small struct the game reads each frame.
import { Audio } from './audio.js';

export const input = { mx: 0, mz: 0, aimX: 0, aimZ: 0, fire: false, cast: [false, false, false, false], dash: false, autoAim: false,
  mouseX: 0, mouseY: 0, hasMouse: false, touch: false };
const keys = new Set();
let dashQueued = false;
const touchState = { stickId: null, sx: 0, sy: 0, x: 0, y: 0, fire: false, cast: [false, false, false, false] };
const handlers = { grimoire: null, pause: null, mute: null };

export function initInput(canvas, h) {
  Object.assign(handlers, h);
  addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === ' ' || k === 'tab' || k.startsWith('arrow')) e.preventDefault();
    if (!keys.has(k)) {
      if (k === ' ' || k === 'shift') dashQueued = true;
      if (k === 'tab' || k === 'g') handlers.grimoire && handlers.grimoire();
      if (k === 'escape' || k === 'p') handlers.pause && handlers.pause();
      if (k === 'm') handlers.mute && handlers.mute();
    }
    keys.add(k);
    input.touch = false;
    Audio.init();
  });
  addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => { keys.clear(); input.fire = false; mouseR = false; });
  let mouseL = false, mouseR = false;
  canvas.addEventListener('mousemove', (e) => { input.mouseX = e.clientX; input.mouseY = e.clientY; input.hasMouse = true; input.touch = false; });
  canvas.addEventListener('mousedown', (e) => {
    Audio.init(); input.touch = false;
    input.mouseX = e.clientX; input.mouseY = e.clientY; input.hasMouse = true;
    if (e.button === 0) mouseL = true; if (e.button === 2) mouseR = true;
  });
  addEventListener('mouseup', (e) => { if (e.button === 0) mouseL = false; if (e.button === 2) mouseR = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  input._mouse = () => ({ l: mouseL, r: mouseR });

  // touch: left half of the screen = floating stick
  canvas.addEventListener('touchstart', (e) => {
    Audio.init(); input.touch = true;
    for (const t of e.changedTouches) {
      if (touchState.stickId === null && t.clientX < innerWidth * 0.5) {
        touchState.stickId = t.identifier; touchState.sx = touchState.x = t.clientX; touchState.sy = touchState.y = t.clientY;
        showStick(true);
      }
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === touchState.stickId) { touchState.x = t.clientX; touchState.y = t.clientY; }
    e.preventDefault();
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === touchState.stickId) { touchState.stickId = null; showStick(false); } };
  canvas.addEventListener('touchend', end); canvas.addEventListener('touchcancel', end);

  // touch buttons
  const bind = (id, on, off) => {
    const el = document.getElementById(id); if (!el) return;
    el.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); Audio.init(); input.touch = true; el.classList.add('down'); on(); }, { passive: false });
    const up = (e) => { e.preventDefault(); el.classList.remove('down'); off && off(); };
    el.addEventListener('touchend', up); el.addEventListener('touchcancel', up);
    el.addEventListener('mousedown', (e) => { e.preventDefault(); on(); }); el.addEventListener('mouseup', () => off && off());
  };
  bind('tb-fire', () => (touchState.fire = true), () => (touchState.fire = false));
  for (let i = 0; i < 4; i++) bind('tb-s' + (i + 1), () => (touchState.cast[i] = true), () => (touchState.cast[i] = false));
  bind('tb-dash', () => (dashQueued = true));
}

function showStick(on) {
  const base = document.getElementById('stick'); if (!base) return;
  base.style.display = on ? 'block' : 'none';
  if (on) { base.style.left = touchState.sx + 'px'; base.style.top = touchState.sy + 'px'; }
}

export function pollInput() {
  let mx = 0, mz = 0;
  if (keys.has('w') || keys.has('arrowup')) mz -= 1;
  if (keys.has('s') || keys.has('arrowdown')) mz += 1;
  if (keys.has('a') || keys.has('arrowleft')) mx -= 1;
  if (keys.has('d') || keys.has('arrowright')) mx += 1;
  if (touchState.stickId !== null) {
    const dx = touchState.x - touchState.sx, dy = touchState.y - touchState.sy, d = Math.hypot(dx, dy), R = 55;
    const k = Math.min(1, d / R);
    if (d > 6) { mx = (dx / d) * k; mz = (dy / d) * k; }
    const knob = document.getElementById('knob');
    if (knob) { const c = Math.min(d, R); knob.style.transform = `translate(${d ? (dx / d) * c : 0}px, ${d ? (dy / d) * c : 0}px)`; }
  }
  input.mx = mx; input.mz = mz;
  const m = input._mouse ? input._mouse() : { l: false, r: false };
  input.fire = m.l || touchState.fire || keys.has('j');
  input.cast[0] = m.r || touchState.cast[0] || keys.has('1');
  input.cast[1] = keys.has('q') || touchState.cast[1] || keys.has('2');
  input.cast[2] = keys.has('e') || touchState.cast[2] || keys.has('3');
  input.cast[3] = keys.has('r') || touchState.cast[3] || keys.has('4');
  input.dash = dashQueued; dashQueued = false;
  input.autoAim = input.touch || !input.hasMouse;
  return input;
}
