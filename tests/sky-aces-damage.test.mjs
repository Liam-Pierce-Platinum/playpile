import assert from 'node:assert/strict';
import test from 'node:test';

test('Sky Aces hit damage completes for single, multiple and unpainted hull materials', async t => {
  for (const [name, value] of Object.entries({ document: new EventTarget(), window: new EventTarget(), navigator: { userAgent: 'Test' } })) {
    const original = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { value, configurable: true });
    t.after(() => {
      if (original) Object.defineProperty(globalThis, name, original);
      else delete globalThis[name];
    });
  }
  const { Game } = await import('../games/sky-aces/src/game.js');
  const { makePlane } = await import('../games/sky-aces/src/models.js?v=hangar-2');
  const { planeById } = await import('../games/sky-aces/src/meta.js?v=hangar-2');
  const hull = makePlane('sparrow', planeById('sparrow').colors, 0xe8433a, 2);
  assert.ok(Array.isArray(hull.children[0].material), 'the shipped flying boat uses multiple hull materials');
  const hullColor = hull.children[0].material.find(material => material.color).color.getHex();
  const originalRandom = Math.random;
  Math.random = () => 0;
  t.after(() => { Math.random = originalRandom; });

  const variants = [
    { name: 'shipped flying boat', model: hull, color: hullColor },
    { name: 'single painted material', model: { children: [{ material: { color: { getHex: () => 0xbe292b } } }] }, color: 0xbe292b },
    { name: 'empty model', model: { children: [] }, color: 0x777777 },
    { name: 'unpainted material', model: { children: [{ material: [{}] }] }, color: 0x777777 },
  ];
  for (const variant of variants) {
    await t.test(variant.name, () => {
      const debris = [];
      const killed = [];
      const game = Object.create(Game.prototype);
      game.authority = true;
      game.mode = 'endless';
      game.listeners = [];
      game.fx = { spark() {}, debrisBurst(...args) { debris.push(args); } };
      game.kill = (...args) => killed.push(args);
      const owner = { isPlayer: true };
      const position = {};
      const target = {
        kind: 'fighter', model: variant.model, vel: {},
        damage(amount, by, match) {
          assert.equal(amount, 6);
          assert.equal(by, owner);
          assert.equal(match, game);
          return true;
        },
      };
      const events = [];
      game.on((type, data) => events.push({ type, data }));

      game.hitPlane(target, 6, owner, position);

      assert.deepEqual(debris, [[position, target.vel, variant.color, 1]]);
      assert.deepEqual(events, [{ type: 'hit', data: { target, dmg: 6 } }]);
      assert.deepEqual(killed, [[target, owner, 'guns']]);
    });
  }
});
