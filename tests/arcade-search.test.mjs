import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GAMES, search } from '../site/arcade-shell.js';

const slugs = query => search(query).map(game => game.slug);

test('search accepts pasted titles and ranks the exact title first', () => {
  assert.equal(slugs(' BLADE DASH: CASTLE ')[0], 'blade-dash-story');
  assert.equal(slugs('Lukes Diner')[0], 'lukes-diner');
  assert.equal(slugs('Luke’s Diner')[0], 'lukes-diner');
  assert.equal(slugs('merge')[0], 'merge');
  assert.equal(slugs('').length, GAMES.length);
  assert.deepEqual(slugs('no-matches-xyz'), []);
});

test('genre and visual style aliases work together without confusing similar styles', () => {
  assert.ok(slugs('racing games').includes('apex'));
  assert.ok(slugs('sports').includes('hoops'));
  assert.ok(slugs('first-person shooter').includes('frontline'));
  assert.ok(!slugs('first-person shooter').includes('archer-duel'));
  assert.ok(slugs('pixel art boxing').includes('southpaw'));
  assert.ok(slugs('pixel art').includes('crossing'));
  assert.ok(slugs('3-D voxel').includes('block-world'));
  assert.ok(slugs('watercolor strategy').includes('inkvale'));
  assert.ok(slugs('low-poly').includes('frontline'));
  assert.deepEqual(slugs('PlayStation 1 style'), ['highrise']);
});

test('search uses shared multiplayer metadata for online and same-device games', () => {
  assert.ok(slugs('play with friends').includes('air-hockey'));
  assert.ok(slugs('multiplayer').includes('car-soccer'));
  assert.ok(slugs('online').includes('air-hockey'));
  assert.ok(!slugs('online').includes('car-soccer'));
});
