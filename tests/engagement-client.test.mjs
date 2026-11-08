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
  const sessionStorage = {
    getItem: key => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, String(value)),
    removeItem: key => stored.delete(key),
  };
  const send = (url, body) => {
    assert.equal(url, endpoint);
    const record = JSON.parse(body);
    assert.deepEqual(Object.keys(record).sort(), ['ms', 'page', 'visit']);
    assert.ok(Number.isInteger(record.ms) && record.ms >= 0);
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
  const frame = options.frame ? Object.assign(new BrowserEvents(), {
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
  const location = { hostname: 'playpile.net', origin: 'https://playpile.net' };
  Object.assign(window, { self: window, top: window, crypto, location });
  class ClockDate extends Date {
    static now() { return baseTime + elapsed; }
  }
  const globals = {
    window, document, navigator, sessionStorage, crypto, location, Date: ClockDate,
    performance: { now: () => elapsed },
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
    async frameInput() {
      frame.contentDocument.dispatch('pointerdown');
      frame.contentWindow.dispatch('pointerdown');
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
    await browser.frameInput();
    await browser.advance(12_000);
    await browser.pagehide();
    assert.equal(browser.reports.at(-1)?.ms, 102_000, 'input in the game frame resumes the same page');
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
