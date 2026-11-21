import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GAMES } from '../site/catalogue.js';
import { playUrl } from '../site/pages.js';

const drivingGames = GAMES.filter(game =>
  game.cat === 'Driving' || ['night-shift', 'car-soccer'].includes(game.slug));

for (const game of drivingGames) {
  test(`${game.title} places first-visit notices below the game controls`, async () => {
    const file = new URL('..' + playUrl(game) + 'index.html', import.meta.url);
    const html = await readFile(file, 'utf8');
    const slot = '<div data-playpile-notices></div>';
    assert.equal(html.split(slot).length - 1, 1);
    assert.match(html, /<div class="stagebar">[\s\S]*?<\/div>\s*<div data-playpile-notices><\/div>/);
    assert.ok(html.indexOf(slot) > html.indexOf('<iframe id="frame"'));
  });
}
