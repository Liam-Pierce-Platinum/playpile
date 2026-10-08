// =====================================================================
// GRIND CITY :: src/ui/fit.js - EVERY MENU FITS THE WINDOW IT IS IN
// =====================================================================
//
// The menus are laid out for a desktop window. Inside PLAYPILE's player
// the frame is about 700 x 400, and the main screen came out wider than
// that - SHOP was cut off the right-hand edge and the park cards ran off
// the bottom (2026-10-07). Scrolling a game menu is not an answer.
//
// So whichever panel is showing is measured at full size and shrunk with
// CSS zoom until it fits, never grown. zoom rather than transform: zoom
// changes the layout box too, so the overlay's centring and every click
// still land where they look. Re-measured when the window changes size
// and when an overlay is shown or hidden.
const PAD = 24;

function fitOne(plate) {
  plate.style.zoom = '';
  const w = plate.scrollWidth, h = plate.scrollHeight;
  if (!w || !h) return;
  // Always fit the WIDTH - a menu cut off at the side cannot be reached.
  // Fit the height too when that keeps the text readable; a menu that
  // would have to shrink below 70% to fit top to bottom scrolls instead
  // (the overlay is overflow:auto, and safe-centred in style.css so the
  // top of a tall one is not pushed off the screen).
  const kw = (innerWidth - PAD) / w, kh = (innerHeight - PAD) / h;
  const k = Math.min(1, kw, kh >= 0.7 ? kh : 1);
  if (k < 0.995) plate.style.zoom = String(Math.max(0.5, k));
}

export function fitAll() {
  for (const o of document.querySelectorAll('.overlay:not(.hidden)')) {
    for (const p of o.querySelectorAll(':scope > .plate')) fitOne(p);
  }
}

let queued = false;
const soon = () => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; fitAll(); });
};
addEventListener('resize', soon);
// only for changes inside a menu - the HUD changes every frame, and
// re-measuring the menus every frame for it would be pure waste
new MutationObserver((list) => {
  if (list.some((m) => m.target.closest && m.target.closest('.overlay'))) soon();
}).observe(document.body, {
  subtree: true, attributes: true, attributeFilter: ['class'], childList: true,
});
soon();
