const STORAGE_KEY = 'pp.engagement.visit';
const IDLE_MS = 90_000;
const VISIT_GAP_MS = 30 * 60_000;
const REPORT_INTERVAL = 30_000;
const MAX_PAGE_MS = 8 * 60 * 60_000;
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove'];
const CAPTURE = { capture: true, passive: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let started = false;

export function startEngagement(endpoint) {
  if (started || navigator.globalPrivacyControl || navigator.doNotTrack === '1' || !globalThis.crypto?.randomUUID) return;
  started = true;

  const visible = () => document.visibilityState === 'visible';
  const focused = () => visible() && document.hasFocus();
  const standalone = location.pathname?.startsWith('/games/');
  const frame = document.getElementById('frame');
  const gameFocused = () => standalone || (frame && !frame.hidden && document.activeElement === frame);
  const freshVisit = () => ({ id: crypto.randomUUID(), last: Date.now() });
  function readVisit() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      const age = Date.now() - saved?.last;
      if (UUID.test(saved?.id || '') && age >= 0 && age < VISIT_GAP_MS) return saved;
    } catch { /* Tracking still works for the current page. */ }
    return freshVisit();
  }

  let visit = readVisit();
  let page = crypto.randomUUID();
  let activeMs = 0, delivered = -1, sending;
  let gameMs = 0, deliveredPlay = -1;
  let lastSample = performance.now();
  let idleAt = lastSample + IDLE_MS;
  let gameIdleAt = idleAt;
  let running = focused();
  let playing = running && gameFocused();

  function saveVisit() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(visit)); } catch {}
  }

  function sample(now = performance.now()) {
    if (running) {
      const end = Math.min(now, idleAt);
      activeMs += Math.max(0, end - lastSample);
      if (playing) gameMs += Math.max(0, Math.min(end, gameIdleAt) - lastSample);
    }
    lastSample = now;
  }

  function updatePlay(now, gameInput = false) {
    const next = running && focused() && gameFocused();
    if (next && (!playing || gameInput)) gameIdleAt = now + IDLE_MS;
    playing = next;
  }

  function syncPlay() {
    const now = performance.now();
    sample(now);
    updatePlay(now);
  }

  function report(final = false) {
    syncPlay();
    saveVisit();
    const ms = Math.min(MAX_PAGE_MS, Math.floor(activeMs));
    const playMs = Math.min(ms, Math.floor(gameMs));
    if ((ms <= delivered && playMs <= deliveredPlay) || (!final && sending === page)) return;
    const reportPage = page;
    const body = JSON.stringify({ visit: visit.id, page: reportPage, ms, playMs });
    const acknowledge = () => {
      if (page !== reportPage) return;
      delivered = Math.max(delivered, ms);
      deliveredPlay = Math.max(deliveredPlay, playMs);
    };
    if (final && navigator.sendBeacon?.(endpoint, body)) { acknowledge(); return; }
    sending = reportPage;
    fetch(endpoint, { method: 'POST', body, credentials: 'omit', keepalive: true })
      .then(response => { if (response.ok) acknowledge(); })
      .catch(() => {})
      .finally(() => { if (sending === reportPage) sending = undefined; });
  }

  function newPage(nextVisit) {
    visit = nextVisit;
    page = crypto.randomUUID();
    activeMs = 0;
    delivered = -1;
    gameMs = 0;
    deliveredPlay = -1;
  }

  function activity(event, gameInput = false) {
    if ((event && !event.isTrusted) || !visible()) return;
    const now = performance.now();
    sample(now);
    if (Date.now() - visit.last >= VISIT_GAP_MS) {
      report(true);
      newPage(freshVisit());
      saveVisit();
    }
    visit.last = Date.now();
    idleAt = now + IDLE_MS;
    running = true;
    updatePlay(now, gameInput || Boolean(standalone && event));
  }

  function pause() {
    sample();
    running = false;
    playing = false;
    if (activeMs > 0 || delivered >= 0) report(true);
  }

  function updateFocus() {
    if (focused()) activity();
    else pause();
  }

  for (const type of ACTIVITY) window.addEventListener(type, activity, CAPTURE);
  document.addEventListener('visibilitychange', updateFocus);
  window.addEventListener('focus', updateFocus);
  window.addEventListener('blur', updateFocus);
  window.addEventListener('pagehide', pause);
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    const saved = readVisit();
    if (saved.id !== visit.id) newPage(saved);
    else visit = saved;
    updateFocus();
  });

  // The portal and its game are same-origin, but game input does not bubble
  // to the cabinet page. Capture activity in both and count the time once.
  const watched = new WeakSet();
  const gameActivity = event => activity(event, true);
  const gameFocusChanged = () => queueMicrotask(syncPlay);
  function watchGame() {
    syncPlay();
    try {
      const game = frame.contentDocument;
      if (!game || watched.has(game)) return;
      watched.add(game);
      for (const type of ACTIVITY) game.addEventListener(type, gameActivity, CAPTURE);
      frame.contentWindow.addEventListener('focus', gameFocusChanged);
      frame.contentWindow.addEventListener('blur', gameFocusChanged);
    } catch { /* An inaccessible iframe does not affect the cabinet. */ }
  }
  if (frame) {
    document.addEventListener('focusin', gameFocusChanged);
    frame.addEventListener('focus', gameFocusChanged);
    new MutationObserver(syncPlay).observe(frame, { attributes: true, attributeFilter: ['hidden'] });
    frame.addEventListener('load', watchGame);
    watchGame();
  }

  saveVisit();
  if (running) report();
  setInterval(() => { if (running) report(); }, REPORT_INTERVAL);
}
