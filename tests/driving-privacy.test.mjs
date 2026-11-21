import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GAMES } from '../site/catalogue.js';
import { drivingPrivacyMenu } from '../site/driving-privacy.js';

test('standalone driving games present privacy choices in an existing game menu', async () => {
  const driving = GAMES.filter(game =>
    game.cat === 'Driving' || ['night-shift', 'car-soccer'].includes(game.slug));
  for (const { slug } of driving) {
    const pathname = '/games/' + slug;
    const page = await readFile(new URL('..' + pathname + '/index.html', import.meta.url), 'utf8');
    const authoredSlot = page.includes('data-playpile-notices');
    for (const suffix of ['', '/', '/index.html']) {
      assert.equal(Number(authoredSlot) + Number(Boolean(drivingPrivacyMenu(pathname + suffix))), 1, slug);
    }
    assert.ok(!drivingPrivacyMenu('/play/' + slug + '/'), slug);
  }
});

test('the driving menu presenter excludes other games and site pages', () => {
  for (const { slug, cat } of GAMES) {
    if (cat !== 'Driving' && !['night-shift', 'car-soccer'].includes(slug)) {
      assert.ok(!drivingPrivacyMenu('/games/' + slug + '/'), slug);
    }
  }
  for (const path of ['/', '/settings/', '/games/apex/src/main.js', '/play/apex-f1-racing-game/']) {
    assert.ok(!drivingPrivacyMenu(path), path);
  }
});
