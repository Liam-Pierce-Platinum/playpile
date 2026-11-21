import test from 'node:test';
import assert from 'node:assert/strict';
import { hitsBarrel, hitsHammer } from '../games/moto-stunt/src/contacts.js';

test('a helmet can pass beyond the upper corner of a Moto Stunt barrel', () => {
  const barrel = { x: 10, y: 2 };
  assert.equal(hitsBarrel([10.9, 3.59], 0.25, barrel), false);
  assert.equal(hitsBarrel([10, 3.5], 0.25, barrel), true);
  assert.equal(hitsBarrel([10.75, 2.6], 0.25, barrel), true);
  assert.equal(hitsBarrel([11, 2.6], 0.42, barrel), false);
});

test('hammer strikes account for the size of the wheel or rider part', () => {
  assert.equal(hitsHammer([1.22, 0], 0.25, 0, 0), false);
  assert.equal(hitsHammer([1.22, 0], 0.42, 0, 0), true);
});
