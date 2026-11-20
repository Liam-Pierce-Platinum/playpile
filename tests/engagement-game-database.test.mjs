import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../tools/engagement-worker/worker.mjs';

const read = name => readFileSync(new URL('../tools/engagement-worker/' + name, import.meta.url), 'utf8');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');

function setup(migrated = false) {
  const db = new DatabaseSync(':memory:');
  if (migrated) {
    db.exec(`CREATE TABLE engagement_pages (
      visit_id TEXT NOT NULL, page_id TEXT NOT NULL,
      active_ms INTEGER NOT NULL CHECK(active_ms BETWEEN 0 AND 28800000),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      play_ms INTEGER CHECK(play_ms BETWEEN 0 AND active_ms),
      PRIMARY KEY(visit_id,page_id));`);
    db.prepare('INSERT INTO engagement_pages VALUES (?,?,?,CURRENT_TIMESTAMP,?)').run(uuid(999), uuid(999), 180000, 120000);
    db.exec(read('migrate-game-metrics.sql'));
    db.exec(read('migrate-returning-visitors.sql'));
  } else db.exec(read('schema.sql'));
  const env = { DB: { prepare: sql => ({ bind: (...params) => ({ run: async () => db.prepare(sql).run(...params) }) }) } };
  async function send(visit, page, ms, playMs, game) {
    const body = { visit: uuid(visit), page: uuid(page), ms };
    if (playMs !== undefined) body.playMs = playMs;
    if (game !== undefined) body.game = game;
    const request = new Request('https://worker.example/collect', {
      method: 'POST', headers: { Origin: 'https://playpile.net', 'Content-Type': 'text/plain' }, body: JSON.stringify(body),
    });
    assert.equal((await worker.fetch(request, env)).status, 204);
  }
  const summary = () => db.prepare('SELECT game_id, plays, total_active_minutes, avg_minutes_per_play, longest_play_minutes FROM engagement_game_summary ORDER BY game_id').all().map(row => ({ ...row }));
  return { db, send, summary };
}

test('migration preserves historical data and excludes unassigned and unplayed pages', async () => {
  const { db, send, summary } = setup(true);
  try {
    assert.equal(db.prepare('SELECT play_ms FROM engagement_pages').get().play_ms, 120000);
    assert.equal(db.prepare('SELECT game_id FROM engagement_pages').get().game_id, null);
    await send(1, 1, 60000, 0, 'apex');
    await send(2, 2, 60000, 60000);
    await send(3, 3, 60000);
    assert.deepEqual(summary(), []);
    assert.equal(db.prepare('SELECT COUNT(*) AS count FROM engagement_pages').get().count, 4);
    await send(1, 1, 120000, 60000, 'apex');
    assert.deepEqual(summary(), [{ game_id: 'apex', plays: 1, total_active_minutes: 1, avg_minutes_per_play: 1, longest_play_minutes: 1 }]);
  } finally { db.close(); }
});

test('duplicate and out-of-order cumulative beacons never add play counts or minutes', async () => {
  const { db, send, summary } = setup();
  try {
    await send(1, 1, 180000, 120000, 'apex');
    await send(1, 1, 180000, 120000, 'apex');
    await send(1, 1, 90000, 60000, 'apex');
    // An older client retry may omit game and playMs, but cannot erase attribution.
    await send(1, 1, 180000);
    assert.deepEqual(summary(), [{ game_id: 'apex', plays: 1, total_active_minutes: 2, avg_minutes_per_play: 2, longest_play_minutes: 2 }]);
    await send(1, 1, 240000, 150000, 'apex');
    assert.equal(summary()[0].total_active_minutes, 2.5);
  } finally { db.close(); }
});

test('reloads share a game play within a visit while different visits and games stay distinct', async () => {
  const { db, send, summary } = setup();
  try {
    await send(1, 1, 120000, 60000, 'apex');
    await send(1, 2, 180000, 120000, 'apex');
    await send(2, 3, 360000, 300000, 'apex');
    await send(1, 4, 180000, 180000, 'curveball');
    assert.deepEqual(summary(), [
      { game_id: 'apex', plays: 2, total_active_minutes: 8, avg_minutes_per_play: 4, longest_play_minutes: 5 },
      { game_id: 'curveball', plays: 1, total_active_minutes: 3, avg_minutes_per_play: 3, longest_play_minutes: 3 },
    ]);
    const sql = read('game-report.sql').replace(/^--.*$/gm, '').trim();
    assert.equal(db.prepare(sql).all().length, 2);
  } finally { db.close(); }
});

test('first known game is immutable even when a later beacon carries larger totals', async () => {
  const { db, send, summary } = setup();
  try {
    await send(1, 1, 30000, 0);
    await send(1, 1, 30000, 0, 'apex');
    await send(1, 1, 120000, 60000, 'apex');
    await send(1, 1, 240000, 180000, 'curveball');
    assert.deepEqual(summary(), [{ game_id: 'apex', plays: 1, total_active_minutes: 1, avg_minutes_per_play: 1, longest_play_minutes: 1 }]);
  } finally { db.close(); }
});

test('date cohort keeps a visit/game together across the boundary and excludes later starts', async () => {
  const { db, send } = setup();
  try {
    await send(1, 1, 120000, 60000, 'apex');
    await send(1, 2, 180000, 120000, 'apex');
    await send(2, 3, 180000, 120000, 'apex');
    db.prepare('UPDATE engagement_pages SET created_at=? WHERE page_id=?').run('2026-11-19 23:59:00', uuid(1));
    for (const page of [2, 3]) db.prepare('UPDATE engagement_pages SET created_at=? WHERE page_id=?').run('2026-11-20 00:01:00', uuid(page));
    const cohort = db.prepare('SELECT COUNT(*) AS plays,SUM(play_ms) AS play_ms FROM engagement_game_plays WHERE first_recorded_at >= ? AND first_recorded_at < ?').get('2026-11-19 00:00:00', '2026-11-20 00:00:00');
    assert.deepEqual({ ...cohort }, { plays: 1, play_ms: 180000 });
  } finally { db.close(); }
});

test('public popularity ranks recent engaged visits, deduplicates reloads and exposes only game slugs', async () => {
  const { db, send } = setup();
  const env = { DB: { prepare: sql => ({ all: async () => ({ results: db.prepare(sql).all() }) }) } };
  const readFeed = () => worker.fetch(new Request('https://worker.example/popular'), env);
  try {
    assert.deepEqual(await (await readFeed()).json(), { games: [] });
    await send(1, 1, 1500, 1500, 'apex');
    await send(1, 2, 1500, 1500, 'apex');
    await send(2, 3, 1250, 1250, 'curveball');
    await send(3, 4, 1250, 1250, 'curveball');
    await send(4, 5, 5000, 5000, 'drifter');
    await send(5, 6, 3000, 3000, 'grind-city');
    await send(6, 7, 5000, 0, 'inkvale');
    await send(7, 8, 10000, 10000, 'stack');
    db.prepare("UPDATE engagement_pages SET created_at=datetime('now','-8 days') WHERE page_id=?").run(uuid(8));
    const response = await readFeed();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), '*');
    assert.equal(response.headers.get('cache-control'), 'public, max-age=900');
    assert.deepEqual(await response.json(), { games: ['curveball', 'drifter', 'apex', 'grind-city'] });
  } finally { db.close(); }
});
