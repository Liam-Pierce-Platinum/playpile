import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../site/catalogue.js';
import { SCORES, GAME_MUSIC } from '../games/_shared/game-scores.js';
import { arrangement } from '../games/_shared/catalogue-score.js';

test('every game has exactly one score source, including native rhythm tracks', () => {
  const expected = GAMES.map(game => game.slug).sort();
  const actual = [...GAME_MUSIC, ...Object.keys(SCORES)].sort();
  assert.deepEqual(actual, expected);
  for (const slug of ['beat-dash', 'parry', 'freeze-run', 'sky-aces', 'ski-mountain']) {
    assert.ok(GAME_MUSIC.has(slug), slug);
    assert.equal(SCORES[slug], undefined);
  }
});

test('new scores have distinct melodies, playable pitches, and a varied complete loop', () => {
  const titles = new Set(), firstBars = new Set();
  for (const [slug, score] of Object.entries(SCORES)) {
    assert.ok(!titles.has(score[0]), slug);
    titles.add(score[0]);
    const { bpm, steps, notesAt } = arrangement(score);
    assert.ok(bpm >= 60 && bpm <= 165, slug);
    assert.equal(steps, 128, slug);
    const pattern = Array.from({length:steps}, (_,i)=>notesAt(i));
    const signature = JSON.stringify(pattern.slice(0,8));
    assert.ok(!firstBars.has(signature), slug);
    firstBars.add(signature);
    assert.notDeepEqual(pattern.slice(0,32),pattern.slice(64,96),slug);
    for (const [pitch, voice, gain, duration] of pattern.flat()) {
      assert.ok(Number.isFinite(pitch) && pitch >= 24 && pitch <= 112, slug);
      assert.ok(['sine','triangle','square','sawtooth'].includes(voice), slug);
      assert.ok(gain > 0 && gain <= 0.2 && duration * (30/bpm) > 0.018, slug);
    }
  }
});
