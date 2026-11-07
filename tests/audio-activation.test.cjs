const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');

const mobile = readFileSync(join(__dirname, '../games/_shared/mobile.js'), 'utf8');

function gameFrame() {
  const listeners = new Map();
  const document = { hidden: false };
  class NativeAudio extends EventTarget {
    state = 'suspended';
    resumeCalls = 0;
    failFirst = true;
    setState(state) {
      this.state = state;
      this.dispatchEvent(new Event('statechange'));
    }
    async resume() {
      this.resumeCalls++;
      if (this.failFirst) {
        this.failFirst = false;
        throw new Error('Browser has not granted activation yet');
      }
      this.setState('running');
    }
  }
  const window = {
    AudioContext: NativeAudio,
    webkitAudioContext: NativeAudio,
    addEventListener(type, callback) { listeners.set(type, callback); },
  };
  window.self = window;
  window.top = {};
  runInNewContext(mobile, { window, document, location: { hostname: 'localhost' }, navigator: {}, matchMedia: () => ({ matches: false }) });
  return { window, document, NativeAudio, fire(type, isTrusted = true) { listeners.get(type)({ type, isTrusted }); } };
}

test('mobile gesture release retries activation for suspended Web Audio, even after an initial denial', () => {
  const { window, NativeAudio, fire } = gameFrame();
  assert.equal(window.AudioContext, window.webkitAudioContext);
  const gameSound = new window.webkitAudioContext();
  assert.ok(gameSound instanceof NativeAudio);
  fire('touchend', false);
  assert.equal(gameSound.resumeCalls, 0);
  fire('pointerup');
  assert.equal(gameSound.state, 'suspended');
  fire('touchend');
  assert.equal(gameSound.resumeCalls, 2);
  assert.equal(gameSound.state, 'running');
});

test('interrupted sound recovers on return without undoing a game pause or restarting a closed context', () => {
  const { window, document, fire } = gameFrame();
  const gameSound = new window.AudioContext();
  gameSound.failFirst = false;
  fire('click');
  gameSound.setState('interrupted');
  document.hidden = true;
  fire('touchend');
  assert.equal(gameSound.resumeCalls, 1);
  document.hidden = false;
  fire('click');
  assert.equal(gameSound.resumeCalls, 2);
  gameSound.setState('suspended');
  fire('click');
  assert.equal(gameSound.state, 'suspended');
  gameSound.setState('closed');
  fire('click');
  assert.equal(gameSound.resumeCalls, 2);
});
