// Standalone driving games without an authored notice slot. Their embedded
// versions use the cabinet's own notice area.
const generatedMenu = '#ui > .scrim:is(.title,.pause,.over,.result,.results,.fail) > :first-child';
const menus = new Map([
  ['apex', '#menuMode, #pause .inner, #results .inner'],
  ['nascar', '#menuMode, #pause .inner, #results .inner'],
  ['bailout', generatedMenu],
  ['derby', generatedMenu],
  ['mower-madness', generatedMenu],
  ['touge-drift', generatedMenu],
  ['car-soccer', '#title, #pause, #results'],
  ['drift-tower', '#menu, #over'],
  ['eggy-road', '#menu, #over, #garage'],
  ['kart-clash', '#menu .panel, #result .panel'],
  ['moto-stunt', '#menu, #pause, #result'],
  ['night-shift', '#title .title-inner, #pause .panel, #results .panel'],
  ['pizza-panic', '#title, #card .panel'],
  ['rush-hour', '#title, #pause .panel, #result .panel'],
  ['stunt-city', '#title, #card, #garage'],
]);

export function drivingPrivacyMenu(pathname) {
  const route = /^\/games\/([a-z0-9-]+)(?:\/|\/index\.html)?$/.exec(pathname);
  return route && menus.get(route[1]);
}

export function mountDrivingPrivacy(panel, selector) {
  const dialog = document.createElement('dialog');
  dialog.setAttribute('aria-label', 'Repeat-visit privacy choices');
  dialog.style.cssText = 'position:fixed;inset:0;margin:auto;box-sizing:border-box;width:min(480px,calc(100% - 24px));height:fit-content;max-height:calc(100% - 24px);overflow:auto;overscroll-behavior:contain;touch-action:pan-y;padding:0;border:0;border-radius:12px;background:#152b2c;color:white;';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = 'Back to game';
  close.style.cssText = 'display:block;min-height:44px;margin:4px 0 0;padding:0 6px;border:0;background:transparent;color:white;text-decoration:underline;font:14px system-ui;cursor:pointer;';
  close.addEventListener('click', () => dialog.close());
  panel.append(close);
  dialog.append(panel);
  document.body.append(dialog);
  // Keep the game's keyboard shortcuts from interpreting an answer as a
  // restart, resume or other driving input. The dialog keeps native Tab/Escape.
  for (const type of ['keydown', 'keyup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'click']) {
    dialog.addEventListener(type, event => event.stopPropagation());
  }
  const controlSelector = '[data-driving-privacy]';
  const insertMenuButtons = () => {
    for (const menu of document.querySelectorAll(selector)) {
      if (menu.querySelector(controlSelector)) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.drivingPrivacy = '';
      button.setAttribute('aria-haspopup', 'dialog');
      button.textContent = 'Privacy choices';
      button.style.cssText = 'display:block;position:static;box-sizing:border-box;align-self:center;justify-self:center;width:fit-content;min-height:44px;margin:0 auto;padding:4px 8px;border:0;background:transparent;color:inherit;text-decoration:underline;font:14px/1.3 system-ui;letter-spacing:normal;text-transform:none;box-shadow:none;cursor:pointer;';
      button.addEventListener('click', event => {
        event.stopPropagation();
        dialog.showModal();
      });
      menu.append(button);
    }
  };
  insertMenuButtons();
  let observer;
  if (selector === generatedMenu) {
    // These four games replace their menu as a direct child of #ui.
    observer = new MutationObserver(insertMenuButtons);
    observer.observe(document.getElementById('ui'), { childList: true });
  }
  return () => {
    observer?.disconnect();
    if (dialog.open) dialog.close();
    dialog.remove();
    for (const button of document.querySelectorAll(controlSelector)) button.remove();
  };
}
