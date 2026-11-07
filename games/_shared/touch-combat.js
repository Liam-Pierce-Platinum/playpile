// Two-thumb movement and camera input for the 3D combat games.
export const touchCombat = matchMedia('(pointer: coarse)').matches;

export function mountTouchCombat({ move, look, actions, onMenu }) {
  const hud = document.createElement('div');
  hud.className = 'combat-touch';
  hud.hidden = true;
  hud.innerHTML = '<div class="combat-joystick" aria-hidden="true"><i></i></div><button class="combat-menu" type="button">Pause</button><div class="combat-actions" aria-label="Touch actions"></div>';
  document.body.append(hud);
  const stick = hud.firstElementChild;
  const knob = stick.firstElementChild;
  const menu = hud.querySelector('.combat-menu');
  const held = new Map();
  let movement, camera;

  function resetMovement() {
    movement = null;
    stick.classList.remove('held');
    stick.style.removeProperty('left');
    stick.style.removeProperty('top');
    knob.style.transform = '';
    move(0, 0);
  }

  function endPointer(e) {
    if (movement?.id === e.pointerId) resetMovement();
    if (camera?.id === e.pointerId) camera = null;
    held.get(e.pointerId)?.();
    held.delete(e.pointerId);
  }

  function capture(e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return false;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    return true;
  }

  hud.addEventListener('pointerdown', e => {
    if (e.target !== hud || hud.classList.contains('cinematic') || !capture(e)) return;
    const point = { id: e.pointerId, x: e.clientX, y: e.clientY };
    if (point.x < hud.clientWidth * 0.45 && !movement) {
      movement = point;
      stick.style.left = `${Math.max(38, point.x)}px`;
      stick.style.top = `${Math.min(hud.clientHeight - 38, point.y)}px`;
      stick.classList.add('held');
    } else if (point.x >= hud.clientWidth * 0.45 && !camera) camera = point;
  });

  hud.addEventListener('pointermove', e => {
    if (movement?.id === e.pointerId) {
      const dx = e.clientX - movement.x;
      const dy = e.clientY - movement.y;
      const scale = Math.max(34, Math.hypot(dx, dy));
      knob.style.transform = `translate(${22 * dx / scale}px, ${22 * dy / scale}px)`;
      move(dx / scale, dy / scale);
    } else if (camera?.id === e.pointerId) {
      look(e.clientX - camera.x, e.clientY - camera.y);
      camera.x = e.clientX;
      camera.y = e.clientY;
    }
  });

  for (const action of actions) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = action.label;
    if (action.primary) button.className = 'primary-action';
    button.addEventListener('pointerdown', e => {
      if (button.classList.contains('held') || !capture(e)) return;
      button.classList.add('held');
      held.set(e.pointerId, () => {
        button.classList.remove('held');
        action.up?.();
      });
      action.down();
    });
    button.addEventListener('click', e => {
      if (e.detail !== 0) return;
      action.down();
      action.up?.();
    });
    hud.querySelector('.combat-actions').append(button);
  }

  menu.addEventListener('click', onMenu);
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) hud.addEventListener(event, endPointer);
  function release() {
    if (movement) resetMovement();
    camera = null;
    for (const up of held.values()) up();
    held.clear();
  }
  addEventListener('blur', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

  return (enabled, cinematic = false) => {
    const wasCinematic = hud.classList.contains('cinematic');
    if ((!enabled && !hud.hidden) || (cinematic && !wasCinematic)) release();
    if (hud.hidden === enabled) hud.hidden = !enabled;
    if (cinematic !== wasCinematic) {
      hud.classList.toggle('cinematic', cinematic);
      menu.textContent = cinematic ? 'Skip' : 'Pause';
    }
  };
}
