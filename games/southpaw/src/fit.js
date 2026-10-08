// =====================================================================
// SOUTHPAW :: src/fit.js - EVERY MENU FITS THE WINDOW IT IS IN
// =====================================================================
//
// The menus are laid out for a desktop window. Inside PLAYPILE's player
// the frame can be as small as 700 x 400, and the home screen's buttons
// ran off the bottom - LOCKER ROOM and HOW TO BOX could not be reached
// (2026-10-07). So whatever is showing is measured at full size and
// shrunk with CSS zoom until it fits, never grown. zoom, not transform:
// it changes the layout box too, so the centring and every click still
// land where they look.
const PAD = 20;
const PARTS = ':scope > .plate, :scope > .home-left, :scope > .home-right';

function fitOne(el, availH) {
  el.style.zoom = '';
  const w = el.scrollWidth, h = el.scrollHeight;
  if (!w || !h) return;
  const home = el.classList.contains('home-left') || el.classList.contains('home-right');
  // the two home columns share the width, so only their height is fitted
  const kw = home ? 1 : (innerWidth - PAD) / w;
  const k = Math.min(1, kw, availH / h);
  if (k < 0.995) el.style.zoom = String(Math.max(0.5, k));
}

export function fitAll() {
  for (const o of document.querySelectorAll('.overlay:not(.hidden)')) {
    const cs = getComputedStyle(o);
    const availH = innerHeight - PAD - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    for (const p of o.querySelectorAll(PARTS)) fitOne(p, availH);
  }
}

let queued = false;
const soon = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; fitAll(); });
};
addEventListener('resize', soon);
// only for changes inside a menu - the fight redraws constantly, and
// re-measuring the menus every frame for it would be pure waste
new MutationObserver((list) => {
  if (list.some((m) => m.target.closest && m.target.closest('.overlay'))) soon();
}).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true });
soon();
