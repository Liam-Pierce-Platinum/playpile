import assert from 'node:assert/strict';
import test from 'node:test';
import { GAMES } from '../site/catalogue.js';
import { seoSlug, OLD_SEO } from '../site/seo.js';
import { gameForPath } from '../site/engagement-games.js';

test('every game and its canonical and legacy aliases report the same stable ID', () => {
  for (const game of GAMES) {
    for (const alias of [game.slug, seoSlug(game), OLD_SEO[game.slug]].filter(Boolean)) {
      assert.equal(gameForPath(`/play/${alias}/`), game.slug);
      assert.equal(gameForPath(`/play/${alias}/index.html`), game.slug);
    }
    assert.equal(gameForPath(`/games/${game.slug}/`), game.slug);
    assert.equal(gameForPath(`/games/${game.slug}/index.html`), game.slug);
  }
});

test('non-game paths and unknown names are never attributed to a game', () => {
  for (const path of ['/', '/browse/', '/site/guides/sky-aces.html', '/games/_shared/', '/games/made-up/',
    '/play/made-up/', '/play/sky-aces/extra', '/games/sky-aces/assets/', '/play/sky-aces/?secret=value']) {
    assert.equal(gameForPath(path), null, path);
  }
});
