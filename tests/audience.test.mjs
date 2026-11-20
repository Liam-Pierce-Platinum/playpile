import assert from 'node:assert/strict';
import test from 'node:test';
import { analyticsChoice, setAnalyticsChoice, visitorCode } from '../site/audience.js';

const DAY = 86400000;
let sequence = 0;
function browser(run) {
  const stored = new Map(), events = [];
  let now = 2_000_000_000_000;
  const nav = { globalPrivacyControl: false, doNotTrack: '0' };
  class ClockDate extends Date { static now() { return now; } }
  const globals = {
    navigator: nav,
    localStorage: {
      getItem: key => stored.get(key) ?? null,
      setItem: (key, value) => stored.set(key, value),
      removeItem: key => stored.delete(key),
    },
    crypto: { randomUUID: () => '00000000-0000-4000-8000-' + String(++sequence).padStart(12, '0') },
    window: { dispatchEvent: event => events.push(event.type) },
    Date: ClockDate,
  };
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true });
  try { run({ stored, events, nav, advance: ms => { now += ms; } }); }
  finally {
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
      else delete globalThis[key];
    }
  }
}

test('unset and declined choices create no persistent browser ID', () => browser(({ stored }) => {
  assert.equal(analyticsChoice(), null);
  assert.equal(visitorCode(), null);
  assert.equal(stored.size, 0);
  setAnalyticsChoice(false);
  assert.equal(visitorCode(), null);
  assert.equal(stored.has('pp.analytics.visitor'), false);
}));

test('Allow creates a stable code and repeating Allow does not renew identity or expiry', () => browser(({ stored, events, advance }) => {
  setAnalyticsChoice(true);
  const code = visitorCode();
  const before = [...stored.entries()];
  advance(30 * DAY);
  assert.equal(visitorCode(), code);
  setAnalyticsChoice(true);
  assert.equal(visitorCode(), code);
  assert.deepEqual([...stored.entries()], before);
  assert.deepEqual(events, ['pp-analytics-choice-changing', 'pp-analytics-choice-changed']);
}));

test('absolute 90-day expiry requires a new choice and never silently renews consent', () => browser(({ stored, advance }) => {
  setAnalyticsChoice(true);
  const code = visitorCode();
  advance(89 * DAY);
  assert.equal(visitorCode(), code);
  advance(DAY);
  assert.equal(analyticsChoice(), null);
  assert.equal(visitorCode(), null);
  assert.equal(stored.has('pp.analytics.visitor'), false);
  setAnalyticsChoice(true);
  assert.notEqual(visitorCode(), code);
}));

test('withdrawal removes the browser code and a later allowance creates a new code', () => browser(({ stored }) => {
  setAnalyticsChoice(true);
  const code = visitorCode();
  setAnalyticsChoice(false);
  assert.equal(visitorCode(), null);
  assert.equal(stored.has('pp.analytics.visitor'), false);
  setAnalyticsChoice(true);
  assert.notEqual(visitorCode(), code);
}));

test('privacy signals override consent and remove any previous code', () => {
  for (const signal of ['globalPrivacyControl', 'doNotTrack']) browser(({ stored, nav }) => {
    setAnalyticsChoice(true);
    assert.ok(visitorCode());
    nav[signal] = signal === 'doNotTrack' ? '1' : true;
    assert.equal(analyticsChoice(), false);
    assert.equal(visitorCode(), null);
    assert.equal(stored.has('pp.analytics.visitor'), false);
  });
});

test('blocked storage is safe and cannot produce an unpersisted visitor identity', () => browser(() => {
  const fail = () => { throw Error('blocked'); };
  Object.defineProperty(globalThis, 'localStorage', { value: { getItem: fail, setItem: fail, removeItem: fail }, configurable: true });
  assert.doesNotThrow(() => setAnalyticsChoice(true));
  assert.equal(visitorCode(), null);
}));
