import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LANGUAGES, MESSAGES } from '../site/arcade-locales.js';
import { localizedGameQuery, translate } from '../site/arcade-locale.js';
import { search } from '../site/arcade-shell.js';

test('campaign languages have the site navigation, controls and fallback copy', () => {
  assert.deepEqual(LANGUAGES.map(([code]) => code), ['en', 'ms', 'km', 'id', 'lo', 'my', 'fil', 'th', 'pt', 'vi', 'hi', 'ur', 'ar', 'es']);
  for (const [code] of LANGUAGES) {
    for (const key of ['browse', 'categories', 'profile', 'settings', 'searchGames', 'returnTitle', 'play', 'englishContent']) {
      assert.ok(MESSAGES[code][key], code + ': ' + key);
    }
    if (code !== 'en') assert.notEqual(MESSAGES[code].englishContent, MESSAGES.en.englishContent, code);
  }
  assert.equal(translate('browse', {}, 'unsupported'), 'Browse Games');
  assert.equal(translate('resultCount', { count: 1, query: 'PS1' }, 'es'), '1 resultado para «PS1»');
});

test('translated search labels find catalogue games without changing game names', () => {
  assert.equal(localizedGameQuery('Carreras 3D', 'es'), 'driving 3d');
  assert.equal(localizedGameQuery('เกมแข่งรถ', 'th'), 'driving');
  assert.equal(localizedGameQuery('فن البكسل', 'ar'), 'pixel art');
  assert.equal(localizedGameQuery("Luke's Diner", 'es'), "Luke's Diner");
  assert.ok(search(localizedGameQuery('Carreras 3D', 'es')).length > 0);
  assert.deepEqual(search(localizedGameQuery('فن البكسل', 'ar')), search('pixel art'));
});
