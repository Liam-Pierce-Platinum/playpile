import assert from 'node:assert/strict';
import { setImmediate as settle } from 'node:timers/promises';
import test from 'node:test';

const endpoint = 'https://engagement.example.workers.dev/collect';
let uuidCounter = 0;
let documentCounter = 0;

class BrowserEvents {
  listeners = new Map();

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatch(type, properties = {}) {
    for (const listener of this.listeners.get(type) || []) {
      listener({ type, isTrusted: true, target: this, ...properties });
    }
  }
}

async function withBrowser(options, run) {
  let elapsed = 0;
  let focused = true;
  const baseTime = options.time ?? 2_000_000_000_000;
  const stored = options.stored ?? new Map();
  const reports = [];
  const timers = new Map();
  let gamepads = options.gamepads;
  let gamepadReads = 0;
  let onFrameVisibilityChange;
  const sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: key => stored.delete(key),
  };
  const send = (url, body) => {
    assert.equal(url, endpoint);
    const record = JSON.parse(body);
    assert.deepEqual(Object.keys(record).sort(), record.game ? ['game', 'ms', 'page', 'playMs', 'visit'] : ['ms', 'page', 'playMs', 'visit']);
    assert.ok(Number.isInteger(record.ms) && record.ms >= 0);
    assert.ok(Number.isInteger(record.playMs) && record.playMs >= 0 && record.playMs <= record.ms);
    reports.push(record);
  };
  const navigator = {
    globalPrivacyControl: options.gpc ?? false,
    doNotTrack: options.dnt ?? '0',
    sendBeacon(url, body) {
      send(url, body);
      return true;
    },
  };
  if (gamepads) navigator.getGamepads = () => { gamepadReads++; return gamepads; };
  const frame = options.frame ? Object.assign(new BrowserEvents(), {
    hidden: true,
    contentWindow: new BrowserEvents(),
    contentDocument: new BrowserEvents(),
  }) : null;
  const document = Object.assign(new BrowserEvents(), {
    hidden: false,
    visibilityState: 'visible',
    hasFocus: () => focused,
    getElementById: id => id === 'frame' ? frame : null,
    querySelector: selector => selector === '#frame' || selector === 'iframe#frame' ? frame : null,
  });
  const window = Object.assign(new BrowserEvents(), { document, navigator, sessionStorage });
  const crypto = {
    randomUUID: () => '00000000-0000-4000-8000-' + String(++uuidCounter).padStart(12, '0'),
  };
  const location = { hostname: 'playpile.net', origin: 'https://playpile.net', pathname: options.path ?? (options.frame ? '/play/sky-aces-plane-dogfight-game/' : '/') };
  Object.assign(window, { self: window, top: options.embedded ? {} : window, crypto, location });
  class ClockDate extends Date {
    static now() { return baseTime + elapsed; }
  }
  const globals = {
    window, document, navigator, sessionStorage, crypto, location, Date: ClockDate,
    performance: { now: () => elapsed },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe() { onFrameVisibilityChange = this.callback; }
    },
    fetch(url, { body }) {
      send(url, body);
      return Promise.resolve({ ok: true });
    },
    setInterval(callback, delay) {
      const id = timers.size + 1;
      timers.set(id, { callback, delay, next: elapsed + delay });
      return id;
    },
    clearInterval: id => timers.delete(id),
  };
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
    if (!(key in window)) window[key] = value;
  }

  const browser = {
    reports,
    setGamepads(value) { gamepads = value; },
    get gamepadReads() { return gamepadReads; },
    async advance(milliseconds) {
      const end = elapsed + milliseconds;
      for (;;) {
        const timer = [...timers.values()].filter(timer => timer.next <= end)
          .sort((a, b) => a.next - b.next)[0];
        if (!timer) break;
        elapsed = timer.next;
        timer.next += timer.delay;
        timer.callback();
        await settle();
      }
      elapsed = end;
    },
    async active(isTrusted = true) {
      document.dispatch('pointerdown', { isTrusted });
      window.dispatch('pointerdown', { isTrusted });
      await settle();
    },
    async frameInput(isTrusted = true) {
      frame.contentDocument.dispatch('pointerdown', { isTrusted });
      frame.contentWindow.dispatch('pointerdown', { isTrusted });
      await settle();
    },
    async frameReload() {
      onFrameVisibilityChange([{ attributeName: 'src' }]);
      frame.contentDocument = new BrowserEvents();
      frame.dispatch('load');
      await settle();
    },
    async frameVisible(visible) {
      frame.hidden = !visible;
      onFrameVisibilityChange();
      await settle();
    },
    async frameFocus(hasFocus) {
      document.activeElement = hasFocus ? frame : null;
      frame.contentWindow.dispatch(hasFocus ? 'focus' : 'blur');
      await settle();
    },
    async visible(visible) {
      document.hidden = !visible;
      document.visibilityState = visible ? 'visible' : 'hidden';
      focused = visible;
      document.dispatch('visibilitychange');
      await settle();
    },
    async focus(hasFocus) {
      focused = hasFocus;
      window.dispatch(hasFocus ? 'focus' : 'blur');
      await settle();
    },
    async pagehide() {
      window.dispatch('pagehide', { persisted: false });
      await settle();
    },
  };
  try {
    const { startEngagement } = await import('../site/engagement.js?document=' + ++documentCounter);
    startEngagement(endpoint);
    await settle();
    await run(browser);
  } finally {
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
}

test('duration is cumulative per page and excludes hidden and unfocused intervals', async () => {
  await withBrowser({}, async browser => {
    await browser.active();
    await browser.advance(12_000);
    await browser.visible(false);
    assert.equal(browser.reports.at(-1)?.ms, 12_000, 'hiding the page flushes time already spent');
    await browser.advance(30_000);
    assert.equal(browser.reports.at(-1)?.ms, 12_000);
    await browser.visible(true);
    await browser.active();
    await browser.advance(7_000);
    await browser.focus(false);
    await browser.advance(30_000);
    await browser.focus(true);
    await browser.active();
    await browser.advance(3_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1)?.ms, 22_000);
    assert.equal(new Set(browser.reports.map(report => report.visit)).size, 1);
    assert.equal(new Set(browser.reports.map(report => report.page)).size, 1);
  });
});

test('idle time is capped and trusted gameplay input restarts the clock', async () => {
  await withBrowser({ frame: true }, async browser => {
    await browser.active();
    await browser.advance(120_000);
    assert.equal(browser.reports.at(-1)?.ms, 90_000, 'the visible idle tab must not count indefinitely');
    await browser.active(false);
    await browser.advance(30_000);
    assert.equal(browser.reports.at(-1)?.ms, 90_000, 'untrusted input cannot resume the timer');
    await browser.frameVisible(true);
    await browser.frameFocus(true);
    await browser.frameInput();
    await browser.advance(12_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1)?.ms, 102_000, 'input in the game frame resumes the same page');
    assert.equal(browser.reports.at(-1)?.playMs, 12_000);
  });
});

test('cabinet play time requires a visible, focused game and ignores activity outside it', async () => {
  await withBrowser({ frame: true }, async browser => {
    await browser.advance(10_000);
    await browser.frameVisible(true);
    await browser.advance(5_000);
    await browser.frameFocus(true);
    await browser.frameInput();
    await browser.advance(60_000);
    await browser.active();
    await browser.advance(40_000);
    assert.equal(browser.reports.at(-1).playMs, 75_000);
    await browser.frameInput();
    await browser.advance(10_000);
    await browser.frameFocus(false);
    await browser.advance(5_000);
    await browser.frameFocus(true);
    await browser.advance(3_000);
    await browser.frameVisible(false);
    await browser.advance(2_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).ms, 135_000);
    assert.equal(browser.reports.at(-1).playMs, 103_000);
  });
});

test('a standalone game starts play time only after trusted input', async () => {
  await withBrowser({ path: '/games/sky-aces/' }, async browser => {
    await browser.advance(10_000);
    await browser.visible(false);
    await browser.advance(5_000);
    await browser.visible(true);
    await browser.active();
    await browser.advance(5_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).ms, 15_000);
    assert.equal(browser.reports.at(-1).playMs, 5_000);
    assert.equal(browser.reports.at(-1).game, 'sky-aces');
  });
});

test('internal navigation keeps one visit and inactivity starts a new visit', async () => {
  const stored = new Map();
  async function open(time) {
    let report;
    await withBrowser({ stored, time }, async browser => {
      await browser.active();
      await browser.advance(4_000);
      await browser.pagehide();
      report = browser.reports.at(-1);
    });
    return report;
  }
  const start = 2_000_000_000_000;
  const home = await open(start);
  const game = await open(start + 4_000);
  const later = await open(start + 31 * 60_000);
  assert.equal(home.ms, 4_000);
  assert.equal(game.ms, 4_000);
  assert.equal(home.visit, game.visit);
  assert.notEqual(home.page, game.page);
  assert.notEqual(game.visit, later.visit);
});

test('GPC and Do Not Track suppress duration reports', async () => {
  for (const options of [{ gpc: true }, { dnt: '1' }]) {
    await withBrowser(options, async browser => {
      await browser.active();
      await browser.advance(40_000);
      await browser.pagehide();
      assert.deepEqual(browser.reports, []);
    });
  }
});

test('opening and focusing a game is not a play; untrusted input is ignored', async () => {
  await withBrowser({ frame: true }, async browser => {
    await browser.frameVisible(true);
    await browser.frameFocus(true);
    await browser.advance(30_000);
    await browser.frameInput(false);
    await browser.advance(30_000);
    assert.equal(browser.reports.at(-1).playMs, 0);
    assert.equal(browser.reports.at(-1).game, 'sky-aces');
    await browser.frameInput();
    await browser.advance(4_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 4_000);
  });
});

test('repeated focus changes cannot extend the last genuine game input', async () => {
  await withBrowser({ frame: true }, async browser => {
    await browser.frameVisible(true);
    await browser.frameFocus(true);
    await browser.frameInput();
    await browser.advance(30_000);
    await browser.focus(false);
    await browser.advance(120_000);
    await browser.focus(true);
    await browser.advance(30_000);
    await browser.frameFocus(false);
    await browser.frameFocus(true);
    await browser.active();
    await browser.advance(30_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 30_000);
    await browser.frameInput();
    await browser.advance(3_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 33_000);
  });
});

test('game reload keeps the visit but requires fresh game input', async () => {
  await withBrowser({ frame: true }, async browser => {
    await browser.frameVisible(true);
    await browser.frameFocus(true);
    await browser.frameInput();
    await browser.advance(10_000);
    await browser.frameReload();
    await browser.advance(30_000);
    assert.equal(browser.reports.at(-1).playMs, 10_000);
    await browser.frameInput();
    await browser.advance(5_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 15_000);
    assert.equal(new Set(browser.reports.map(record => record.visit)).size, 1);
  });
});

test('a new visit clears the previous game input latch', async () => {
  await withBrowser({ frame: true }, async browser => {
    await browser.frameVisible(true);
    await browser.frameFocus(true);
    await browser.frameInput();
    await browser.advance(10_000);
    await browser.focus(false);
    const previousVisit = browser.reports.at(-1).visit;
    await browser.advance(31 * 60_000);
    await browser.focus(true);
    await browser.advance(30_000);
    assert.notEqual(browser.reports.at(-1).visit, previousVisit);
    assert.equal(browser.reports.at(-1).playMs, 0);
    await browser.frameInput();
    await browser.advance(5_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 5_000);
  });
});

test('unknown game paths cannot create attributed play and child frames do not report', async () => {
  await withBrowser({ frame: true, path: '/play/not-a-game/' }, async browser => {
    await browser.frameVisible(true);
    await browser.frameFocus(true);
    await browser.frameInput();
    await browser.advance(5_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 0);
    assert.equal(browser.reports.at(-1).game, undefined);
  });
  await withBrowser({ embedded: true, path: '/games/sky-aces/' }, async browser => {
    await browser.active();
    await browser.advance(30_000);
    await browser.pagehide();
    assert.deepEqual(browser.reports, []);
  });
});

test('controller buttons and axes keep active play running beyond 90 seconds', async () => {
  for (const pad of [
    { connected: true, buttons: [{ pressed: true, value: 1 }], axes: [0, 0] },
    { connected: true, buttons: [{ pressed: false, value: 0.5 }], axes: [0, 0] },
    { connected: true, buttons: [], axes: [0, -0.5] },
  ]) {
    await withBrowser({ path: '/games/sky-aces/', gamepads: [null, pad] }, async browser => {
      await browser.advance(120_000);
      await browser.pagehide();
      assert.equal(browser.reports.at(-1).playMs, 119_000, 'play starts at the first one-second controller sample');
      assert.equal(browser.gamepadReads, 120, 'polling is bounded to once per second');
    });
  }
});

test('neutral controllers and small axis drift do not start or indefinitely extend play', async () => {
  const neutral = { connected: true, buttons: [{ pressed: false, value: 0.1 }], axes: [0.1, -0.2] };
  await withBrowser({ path: '/games/sky-aces/', gamepads: [neutral] }, async browser => {
    await browser.advance(120_000);
    assert.equal(browser.reports.at(-1).playMs, 0);
    browser.setGamepads([{ connected: true, buttons: [{ pressed: true, value: 1 }], axes: [] }]);
    await browser.advance(10_000);
    browser.setGamepads([neutral]);
    await browser.advance(120_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1).playMs, 99_000, 'idle grace ends 90 seconds after the last controller input');
  });
});

test('controllers are not polled for hidden or unfocused games', async () => {
  const pad = { connected: true, buttons: [{ pressed: true, value: 1 }], axes: [] };
  await withBrowser({ frame: true, gamepads: [pad] }, async browser => {
    await browser.advance(10_000);
    assert.equal(browser.gamepadReads, 0, 'unopened games ignore controllers');
    await browser.frameVisible(true);
    await browser.advance(10_000);
    assert.equal(browser.gamepadReads, 0, 'a visible iframe without focus ignores controllers');
    await browser.frameFocus(true);
    await browser.advance(10_000);
    await browser.visible(false);
    const before = browser.reports.at(-1).playMs;
    const reads = browser.gamepadReads;
    await browser.advance(120_000);
    assert.equal(browser.gamepadReads, reads);
    assert.equal(browser.reports.at(-1).playMs, before);
    await browser.visible(true);
    await browser.focus(false);
    await browser.advance(10_000);
    assert.equal(browser.gamepadReads, reads, 'an unfocused tab does not poll a held button');
  });
});
