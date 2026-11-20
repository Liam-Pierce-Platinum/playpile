import assert from 'node:assert/strict';
import test from 'node:test';
import { mountDrivingView, drivingFrameBudget } from '../games/_shared/city-art/driving-view.js';

function scene(t, search = '') {
  const document = { activeElement: null };
  for (const [name, value] of Object.entries({ document, location: { search }, innerWidth: 390, innerHeight: 844 })) {
    const before = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => before ? Object.defineProperty(globalThis, name, before) : delete globalThis[name]);
  }
  class Canvas extends EventTarget {
    cloneNode() { return new Canvas(); }
    removeAttribute() {}
    replaceWith(node) { this.replacement = node; }
    focus() { document.activeElement = this; }
  }
  const canvas = new Canvas();
  const views = [];
  return {
    canvas, document, views,
    create2D: () => ({ type: '2d', resize(w, h) { this.size = [w, h]; } }),
    ready: (view, surface) => views.push({ view, surface }),
  };
}

test('forcing 2D starts the game without downloading any 3D modules', async t => {
  const s = scene(t, '?graphics=canvas');
  const load = t.mock.fn();
  await mountDrivingView(s.canvas, load, s.create2D, s.ready);
  assert.equal(load.mock.callCount(), 0);
  assert.equal(s.views[0].surface, s.canvas);
  assert.equal(s.views[0].view.type, '2d');
});

test('a failed 3D dependency initializes an independent render surface', async t => {
  const s = scene(t);
  await mountDrivingView(s.canvas, async () => { throw Error('download failed'); }, s.create2D, s.ready);
  assert.equal(s.views[0].surface, s.canvas.replacement);
  assert.deepEqual(s.views[0].view.size, [390, 844]);
});

test('losing the GPU replaces the view once and preserves game focus', async t => {
  const s = scene(t);
  const gpu = { dispose: t.mock.fn() };
  await mountDrivingView(s.canvas, async () => () => gpu, s.create2D, s.ready);
  s.canvas.focus();
  s.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  s.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(gpu.dispose.mock.callCount(), 1);
  assert.equal(s.views.length, 2);
  assert.equal(s.views[0].view, gpu);
  assert.equal(s.views[1].view.type, '2d');
  assert.equal(s.document.activeElement, s.views[1].surface);
});

test('a GPU cleanup error still restores the playable 2D surface', async t => {
  const s = scene(t);
  const gpu = { dispose() { throw Error('context unavailable'); } };
  await mountDrivingView(s.canvas, async () => () => gpu, s.create2D, s.ready);
  s.canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
  assert.equal(s.views[1].view.type, '2d');
});

test('a delayed 3D download cannot replace the running fallback', async t => {
  const s = scene(t);
  let expire, finish;
  const originalTimer = globalThis.setTimeout;
  t.mock.method(globalThis, 'setTimeout', callback => {
    expire = callback;
    return originalTimer(() => {}, 60000);
  });
  const factory = t.mock.fn();
  const loading = mountDrivingView(s.canvas, () => new Promise(resolve => { finish = resolve; }), s.create2D, s.ready);
  expire();
  await loading;
  finish(factory);
  await Promise.resolve();
  assert.equal(factory.mock.callCount(), 0);
  assert.equal(s.views.length, 1);
  assert.equal(s.views[0].view.type, '2d');
});

test('sustained low frame rates lower render cost and sustained recovery restores quality', () => {
  let ratio = 1.5, time = 0;
  const renderer = {
    shadowMap: { autoUpdate: true },
    getPixelRatio: () => ratio,
    setPixelRatio: value => { ratio = value; },
  };
  const adjust = drivingFrameBudget(renderer);
  const run = (count, gap) => { for (let i = 0; i < count; i++) adjust(time += gap); };
  run(60, 16.7);
  run(1, 2000);
  assert.equal(ratio, 1.5);
  run(20, 500);
  assert.equal(ratio, 1.5 * 0.65);
  assert.equal(renderer.shadowMap.autoUpdate, false);
  run(45, 16.7);
  assert.equal(ratio, 1.5 * 0.65);
  run(1100, 16.7);
  assert.equal(ratio, 1.5);
  assert.equal(renderer.shadowMap.autoUpdate, true);
});
