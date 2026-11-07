import assert from 'node:assert/strict';
import test from 'node:test';
import { createFeedback } from '../games/_shared/feedback-sfx.js';

test('a new game sound bus waits for activation, routes effects and silences muted or hidden games', async () => {
  const contexts = [];
  const params = value => ({ value, setValueAtTime(v) { this.value = v; }, setTargetAtTime(v) { this.value = v; }, exponentialRampToValueAtTime() {} });
  class Node {
    gain = params(1);
    frequency = params(0);
    connect(next) { this.target = next; return next; }
    start() { this.started = true; }
    stop() { this.stopped = true; }
  }
  class Audio {
    constructor() { contexts.push(this); }
    state = 'suspended';
    currentTime = 3;
    sampleRate = 100;
    destination = new Node();
    oscillators = [];
    effects = [];
    gains = [];
    createGain() { const node = new Node(); this.gains.push(node); return node; }
    createOscillator() { const node = new Node(); this.oscillators.push(node); return node; }
    createBufferSource() { const node = new Node(); this.effects.push(node); return node; }
    createBiquadFilter() { return new Node(); }
    createBuffer(channels, size) { return { getChannelData: () => new Float32Array(size) }; }
    async resume() { this.state = 'running'; }
  }
  class Events {
    listeners = new Map();
    addEventListener(type, listener) { this.listeners.set(type, listener); }
    fire(type, isTrusted = true) { this.listeners.get(type)?.({ isTrusted, stopPropagation() {} }); }
  }
  const button = Object.assign(new Events(), { style: {}, attrs: {}, setAttribute(k,v) { this.attrs[k] = v; } });
  const document = Object.assign(new Events(), { hidden: false, body: { append() {} }, createElement: () => button });
  const storage = new Map();
  const previous = Object.getOwnPropertyDescriptors(globalThis);
  const globals = { document, window: { AudioContext: Audio }, localStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v) } };
  for (const [key,value] of Object.entries(globals)) Object.defineProperty(globalThis,key,{ value, configurable:true });
  try {
    const game = createFeedback('test');
    game.shot('boom');
    document.fire('pointerup', false);
    assert.equal(contexts.length, 0);
    document.fire('touchend');
    const [audio] = contexts;
    assert.equal(audio.state, 'running');
    assert.equal(audio.gains[0].target, audio.destination);
    game.shot('boom');
    assert.ok(audio.oscillators[0].started && audio.oscillators[0].stopped);
    assert.ok(audio.effects[0].started && audio.effects[0].stopped);
    game.motor(true, 100, 0.5);
    const engine = audio.oscillators.at(-1);
    assert.ok(engine.started);
    const engineGain = engine.target.target;
    assert.ok(engineGain.gain.value > 0);
    game.motor(false);
    assert.equal(engineGain.gain.value, 0);
    button.fire('click');
    game.shot('pop');
    assert.equal(button.attrs['aria-pressed'], 'true');
    assert.equal(storage.get('pd.test.feedbackMuted'), '1');
    assert.equal(audio.gains[0].gain.value, 0);
    assert.equal(audio.effects.length, 1);
    button.fire('click');
    game.shot('crack');
    assert.equal(audio.effects.length, 2);
    document.hidden = true;
    document.fire('visibilitychange');
    game.shot('crack');
    assert.equal(audio.gains[0].gain.value, 0);
    assert.equal(audio.effects.length, 2);
  } finally {
    for (const key of Object.keys(globals)) {
      if (previous[key]) Object.defineProperty(globalThis,key,previous[key]);
      else delete globalThis[key];
    }
  }
});
