import assert from 'node:assert/strict';
import test from 'node:test';

async function loadUI(t) {
  const globals = { document: new EventTarget(), window: new EventTarget(), navigator: { userAgent: 'Test' } };
  for (const [name, value] of Object.entries(globals)) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  return (await import('../games/sky-aces/src/ui.js')).UI;
}

test('Sky Aces leaves the finished match before showing Hangar or Menu', async t => {
  const UI = await loadUI(t);
  const screens = [];
  const ui = Object.create(UI.prototype);
  ui.app = { state: 'results', quit: panel => screens.push(`leave for ${panel}`) };
  ui.hangar = () => screens.push('show hangar');
  ui.title = () => screens.push('show title');

  ui.act('hangar');
  ui.act('title');
  ui.app.state = 'menu';
  ui.act('hangar');
  ui.act('title');

  assert.deepEqual(screens, ['leave for hangar', 'leave for title', 'show hangar', 'show title']);
});

test('Sky Aces keeps the Hangar drawing buffer and camera in step with the card', async t => {
  const UI = await loadUI(t);
  const sizes = [];
  const aspects = [];
  const ui = Object.create(UI.prototype);
  ui.pv = {
    r: { setSize: (...args) => sizes.push(args) },
    cam: { updateProjectionMatrix() { aspects.push(this.aspect); } },
  };

  ui.resizePreview({ clientWidth: 330, clientHeight: 139 });
  ui.resizePreview({ clientWidth: 728, clientHeight: 220 });
  ui.resizePreview({ clientWidth: 728, clientHeight: 220 });
  ui.resizePreview({ clientWidth: 0, clientHeight: 0 });

  assert.deepEqual(sizes, [[330, 139, false], [728, 220, false]]);
  assert.deepEqual(aspects, [330 / 139, 728 / 220]);
});
