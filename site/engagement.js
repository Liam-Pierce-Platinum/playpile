import { gameForPath } from './engagement-games.js';
import { visitorCode, analyticsChoice, privacyBlocked, isAudienceStorageKey, showAnalyticsChoice } from './audience.js';

const STORAGE_KEY = 'pp.engagement.visit';
const IDLE_MS = 90_000;
const VISIT_GAP_MS = 30 * 60_000;
const REPORT_INTERVAL = 30_000;
const GAMEPAD_INTERVAL = 1_000;
const MAX_PAGE_MS = 8 * 60 * 60_000;
const ACTIVITY = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'touchmove'];
const CAPTURE = { capture: true, passive: true };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let started = false;

export function startEngagement(endpoint) {
  if (started || window.self !== window.top) return;
  analyticsChoice(); // Remove an existing browser code if privacy signals forbid it.
  if (privacyBlocked() || !globalThis.crypto?.randomUUID) return;
  started = true;

  const visible = () => document.visibilityState === 'visible';
  const focused = () => visible() && document.hasFocus();
  const gameId = gameForPath(location.pathname);
  const standalone = Boolean(gameId && location.pathname?.startsWith('/games/'));
  const frame = document.getElementById('frame');
  const gameFocused = () => Boolean(gameId && (standalone || (frame && !frame.hidden && document.activeElement === frame)));
  // This identity is immutable for a page record. A changed choice starts a new
  // record, so previous anonymous time can never become linked retroactively.
  let pageVisitor = visitorCode();
  const freshVisit = () => ({ id: crypto.randomUUID(), last: Date.now(), visitor: pageVisitor });
  function readVisit() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY));
      const age = Date.now() - saved?.last;
      if (UUID.test(saved?.id || '') && age >= 0 && age < VISIT_GAP_MS && (saved.visitor ?? null) === pageVisitor) return saved;
    } catch { /* Tracking still works for the current page. */ }
    return freshVisit();
  }

  let visit = readVisit();
  let page = crypto.randomUUID();
  let activeMs = 0, delivered = -1, sending;
  let gameMs = 0, deliveredPlay = -1;
  let lastSample = performance.now();
  let idleAt = lastSample + IDLE_MS;
  let gameIdleAt = 0;
  let hasGameInput = false;
  let running = focused();
  let playing = false;

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
    if (next && gameInput) {
      hasGameInput = true;
      gameIdleAt = now + IDLE_MS;
    }
    // Focus changes alone never start a play or extend the input idle window.
    playing = next && hasGameInput && now < gameIdleAt;
  }

  function syncPlay() {
    if (!ensureIdentity()) return;
    const now = performance.now();
    sample(now);
    updatePlay(now);
  }

  function resetGameInput() {
    hasGameInput = false;
    gameIdleAt = 0;
    playing = false;
  }

  function report(final = false) {
    if (!ensureIdentity()) return;
    syncPlay();
    saveVisit();
    const ms = Math.min(MAX_PAGE_MS, Math.floor(activeMs));
    const playMs = Math.min(ms, Math.floor(gameMs));
    if ((ms <= delivered && playMs <= deliveredPlay) || (!final && sending === page)) return;
    const reportPage = page;
    const body = JSON.stringify({ visit: visit.id, page: reportPage, ms, playMs, ...(gameId ? { game: gameId } : {}), ...(pageVisitor ? { visitor: pageVisitor } : {}) });
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
    lastSample = performance.now();
    resetGameInput();
  }

  function ensureIdentity() {
    const next = visitorCode();
    if (next !== pageVisitor) {
      // Storage events arrive after another tab changes consent. Never send an
      // old ID after revocation or attach pending time to the replacement ID.
      // The unreported remainder (normally <=30 seconds) is discarded here.
      pageVisitor = next;
      newPage(freshVisit());
      saveVisit();
    }
    if (privacyBlocked()) { running = false; playing = false; return false; }
    return true;
  }

  function activity(event, gameInput = false) {
    if ((event && !event.isTrusted) || !visible() || !ensureIdentity()) return;
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
    if (!ensureIdentity()) return;
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
  window.addEventListener('pp-analytics-choice-changing', () => report(true));
  window.addEventListener('pp-analytics-choice-changed', () => {
    if (ensureIdentity() && running) report();
  });
  window.addEventListener('storage', event => {
    if (!isAudienceStorageKey(event.key)) return;
    ensureIdentity();
    try {
      document.getElementById('pp-analytics-choice')?.remove();
      showAnalyticsChoice();
    } catch { /* Optional UI must never interrupt a game. */ }
  });
  window.addEventListener('pageshow', event => {
    if (!event.persisted) return;
    if (!ensureIdentity()) return;
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
      // A reloaded game must receive input again before its loading/menu time
      // contributes to the existing page's cumulative play timer.
      resetGameInput();
      watched.add(game);
      for (const type of ACTIVITY) game.addEventListener(type, gameActivity, CAPTURE);
      frame.contentWindow.addEventListener('focus', gameFocusChanged);
      frame.contentWindow.addEventListener('blur', gameFocusChanged);
    } catch { /* An inaccessible iframe does not affect the cabinet. */ }
  }
  if (frame) {
    document.addEventListener('focusin', gameFocusChanged);
    frame.addEventListener('focus', gameFocusChanged);
    new MutationObserver((changes = []) => {
      syncPlay();
      if (changes.some(change => change.attributeName === 'src')) resetGameInput();
    }).observe(frame, { attributes: true, attributeFilter: ['hidden', 'src'] });
    frame.addEventListener('load', watchGame);
    watchGame();
  }

  // Controller input does not dispatch DOM events. Sample it at most once a
  // second, only while the actual game is visible and focused. A connected
  // controller at rest (including small axis drift) must not keep a visit alive.
  if (gameId && typeof navigator.getGamepads === 'function') {
    setInterval(() => {
      if (!focused() || !gameFocused()) return;
      try {
        const active = Array.from(navigator.getGamepads() || []).some(pad => pad && pad.connected && (
          pad.buttons.some(button => button.pressed || button.value > 0.2) ||
          pad.axes.some(axis => Math.abs(axis) > 0.2)
        ));
        if (active) activity(undefined, true);
      } catch { /* Gamepad access can be disabled by browser permissions policy. */ }
    }, GAMEPAD_INTERVAL);
  }

  saveVisit();
  try { showAnalyticsChoice(); } catch { /* Optional UI must never interrupt a game. */ }
  if (running) report();
  setInterval(() => { if (running) report(); }, REPORT_INTERVAL);
}
