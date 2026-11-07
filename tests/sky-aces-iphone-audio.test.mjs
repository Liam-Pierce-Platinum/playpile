import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { setTimeout as sleep } from 'node:timers/promises';
import { GAMES } from '../site/catalogue.js';

let fixtureId = 0;

async function waitFor(check, message) {
  const deadline = performance.now() + 3000;
  while (!check() && performance.now() < deadline) await sleep(20);
  assert.equal(check(), true, message);
}

const waitForAudio = game => waitFor(game.audioReady, 'the rendering clock should confirm audio is ready');

async function withAudio({ ios = true, session = true, contexts: plans = [], legacyPlayFailures = 0 }, run) {
  const calls = [];
  const contexts = [];
  const media = [];
  const navigator = { userAgent: ios ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' : 'Desktop Chrome' };
  if (session) {
    let type = 'auto';
    navigator.audioSession = {
      get type() { return type; },
      set type(value) { type = value; calls.push(`session:${value}`); },
    };
  }

  const param = (value = 0) => ({
    value,
    setValueAtTime(v) { this.value = v; },
    setTargetAtTime(v) { this.value = v; },
    exponentialRampToValueAtTime() {},
    cancelScheduledValues() {},
  });
  class AudioNode {
    gain = param();
    frequency = param();
    Q = param();
    threshold = param();
    ratio = param();
    connect(target) { return target; }
    disconnect() {}
    start() { this.started = true; }
    stop() {}
  }

  class AudioContext extends EventTarget {
    constructor() {
      super();
      this.plan = plans[contexts.length] || {};
      this.state = this.plan.state || 'suspended';
      calls.push('context');
      contexts.push(this);
    }

    sampleRate = 100;
    destination = new AudioNode();
    oscillators = [];
    bufferSources = [];
    clockAt = performance.now();
    elapsed = 0;

    get currentTime() {
      return this.elapsed + (this.state === 'running' && !this.plan.stalled ? (performance.now() - this.clockAt) / 1000 : 0);
    }

    changeState(state) {
      this.elapsed = this.currentTime;
      this.clockAt = performance.now();
      this.state = state;
      this.dispatchEvent(new Event('statechange'));
    }

    resume() {
      calls.push('resume');
      if (this.plan.hang) return new Promise(() => {});
      this.changeState('running');
      return Promise.resolve();
    }

    suspend() { this.changeState('suspended'); return Promise.resolve(); }
    close() { this.changeState('closed'); return Promise.resolve(); }
    createGain() { return new AudioNode(); }
    createDynamicsCompressor() { return new AudioNode(); }
    createBiquadFilter() { return new AudioNode(); }
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
    createOscillator() { const node = new AudioNode(); this.oscillators.push(node); return node; }
    createBufferSource() { const node = new AudioNode(); this.bufferSources.push(node); return node; }
  }

  class Audio extends EventTarget {
    constructor(src) { super(); this.src = src; media.push(this); }
    paused = true;
    loop = false;
    readyState = 4;
    play() {
      calls.push('media:play');
      if (legacyPlayFailures > 0) {
        legacyPlayFailures--;
        return Promise.reject(new DOMException('Media playback requires a tap', 'NotAllowedError'));
      }
      this.paused = false;
      queueMicrotask(() => { if (!this.paused) this.dispatchEvent(new Event('playing')); });
      return Promise.resolve();
    }
    pause() { this.paused = true; calls.push('media:pause'); }
    setAttribute(name, value) { this[name] = value; }
  }

  const document = Object.assign(new EventTarget(), {
    hidden: false,
    createElement: () => new Audio(),
    body: { append() {}, appendChild() {} },
  });
  const window = Object.assign(new EventTarget(), { navigator, AudioContext, Audio });
  const globals = { window, document, navigator, Audio };
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  for (const [key, value] of Object.entries(globals)) {
    Object.defineProperty(globalThis, key, { value, configurable: true });
  }

  let game;
  try {
    game = await import(`../games/sky-aces/src/audio.js?fixture=${++fixtureId}`);
    await run({ game, calls, contexts, media, document, window });
  } finally {
    try { game?.setMuted(true); } finally {
      for (const key of Object.keys(globals)) {
        if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
        else delete globalThis[key];
      }
    }
  }
}

test('iPhone chooses media playback on the activating tap and schedules both score and effects', async () => {
  await withAudio({}, async ({ game, calls, contexts, media }) => {
    assert.equal(contexts.length, 0);
    game.initAudio({ explicit: true });
    assert.deepEqual(calls.slice(0, 3), ['session:playback', 'context', 'resume']);
    assert.equal(media.length, 0);
    await waitForAudio(game);

    const [context] = contexts;
    const before = context.oscillators.length;
    game.updateMusic(0.85);
    assert.ok(context.oscillators.slice(before).some(node => node.started), 'score notes reached the graph');
    const effectsBefore = context.bufferSources.length;
    game.sGun();
    assert.ok(context.bufferSources.slice(effectsBefore).some(node => node.started), 'gun audio reached the graph');

    game.setMuted(true);
    assert.equal(game.isMuted(), true);
    const effectCount = context.bufferSources.length;
    game.initAudio({ explicit: true });
    game.sGun();
    assert.equal(context.bufferSources.length, effectCount, 'activating audio cannot override mute');
  });
});

test('an iPhone can recover on another explicit tap when the audio clock stalls or resume hangs', async () => {
  for (const plan of [{ state: 'running', stalled: true }, { state: 'interrupted', hang: true }]) {
    await withAudio({ contexts: [plan] }, async ({ game, contexts }) => {
      game.initAudio({ explicit: true });
      assert.equal(contexts[0].state, plan.state);
      assert.equal(game.audioReady(), false, 'the playback clock has not advanced');
      await waitFor(() => game.audioStatus() === 'retry', 'stalled audio should offer a retry');
      game.initAudio({ explicit: true });
      await waitForAudio(game);
      assert.equal(contexts.length, 2);
      assert.equal(contexts[0].state, 'closed');
    });
  }
});

test('older iPhone starts its media route on the tap and pauses it when hidden or muted', async () => {
  await withAudio({ session: false }, async ({ game, calls, media, document }) => {
    game.initAudio({ explicit: true });
    assert.ok(calls.includes('media:play'), 'native play ran before leaving the user activation');
    assert.equal(media.length, 1);
    assert.equal(media[0].loop, true);
    const carrier = readFileSync(new URL(media[0].src));
    assert.equal(carrier.toString('ascii', 0, 4), 'RIFF');
    assert.equal(carrier.toString('ascii', 8, 12), 'WAVE');
    assert.equal(carrier.readUInt32LE(4) + 8, carrier.length);
    assert.ok(carrier.length > 44 && carrier.subarray(44).every(sample => sample === 0), 'the PCM carrier is silent');
    await waitForAudio(game);
    assert.equal(media[0].paused, false);

    document.hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    assert.equal(media[0].paused, true);
    assert.equal(game.audioReady(), false);

    document.hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    game.initAudio({ explicit: true });
    await waitForAudio(game);
    game.setMuted(true);
    assert.equal(media[0].paused, true);
  });
});

test('desktop audio does not claim the iPhone playback route', async () => {
  await withAudio({ ios: false }, async ({ game, calls, media }) => {
    game.initAudio({ explicit: true });
    await waitForAudio(game);
    assert.deepEqual(calls, ['context', 'resume']);
    assert.equal(media.length, 0);
  });
});

test('a rejected legacy media route keeps Retry Sound available when Web Audio is already running', async () => {
  await withAudio({ session: false, legacyPlayFailures: 1 }, async ({ game, calls, contexts, media }) => {
    game.initAudio({ explicit: true });
    await waitFor(() => game.audioStatus() === 'retry', 'the legacy route should report an activation failure');
    assert.equal(contexts[0].state, 'running');
    assert.equal(game.audioReady(), false);
    assert.equal(media[0].paused, true);

    game.initAudio({ explicit: true });
    await waitForAudio(game);
    assert.equal(calls.filter(call => call === 'media:play').length, 2);
    assert.equal(media[0].paused, false);
  });
});

test('the shipped iframe and each audio importer load the same versioned Sky Aces graph', () => {
  const origin = 'https://playpile.net/games/';
  const gameUrl = new URL(GAMES.find(game => game.slug === 'sky-aces').web, origin);
  const version = gameUrl.searchParams.get('v');
  assert.ok(version, 'the arcade must bypass a cached game document');

  const read = path => readFileSync(new URL(`../games/sky-aces/${path}`, import.meta.url), 'utf8');
  const html = read('index.html');
  const entry = html.match(/<script type="module" src="([^"]+)"/)?.[1];
  assert.equal(entry, `src/main.js?v=${version}`);
  const main = read('src/main.js');
  for (const module of ['game', 'ui']) assert.ok(main.includes(`'./${module}.js?v=${version}'`));
  for (const module of ['main', 'game', 'ui']) {
    const audio = read(`src/${module}.js`).match(/\bfrom\s+['"](\.\/audio\.js[^'"]*)['"]/)?.[1];
    assert.equal(audio, `./audio.js?v=${version}`, `${module} must share the same audio instance`);
  }
});
