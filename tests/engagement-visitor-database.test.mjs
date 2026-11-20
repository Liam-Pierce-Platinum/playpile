import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import worker from '../tools/engagement-worker/worker.mjs';

const read = name => readFileSync(new URL('../tools/engagement-worker/' + name, import.meta.url), 'utf8');
const uuid = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
const plain = value => JSON.parse(JSON.stringify(value));

function setup(migrate = false) {
  const db = new DatabaseSync(':memory:');
  if (migrate) {
    db.exec(`CREATE TABLE engagement_pages (
      visit_id TEXT NOT NULL, page_id TEXT NOT NULL,
      active_ms INTEGER NOT NULL CHECK(active_ms BETWEEN 0 AND 28800000),
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      play_ms INTEGER CHECK(play_ms BETWEEN 0 AND active_ms), game_id TEXT,
      PRIMARY KEY(visit_id,page_id));`);
    db.prepare('INSERT INTO engagement_pages VALUES (?,?,?,CURRENT_TIMESTAMP,?,?)')
      .run(uuid(999), uuid(999), 180000, 120000, 'apex');
    const gameViews = read('schema.sql').split('CREATE INDEX IF NOT EXISTS engagement_game_visit')[1]
      .split('CREATE INDEX IF NOT EXISTS engagement_visitor_visit')[0];
    db.exec('CREATE INDEX IF NOT EXISTS engagement_game_visit' + gameViews);
    db.exec(read('migrate-returning-visitors.sql'));
  } else db.exec(read('schema.sql'));
  const env = { DB: { prepare: sql => ({ bind: (...params) => ({ run: async () => db.prepare(sql).run(...params) }) }) } };
  async function send({ visit = 1, page = 1, ms = 60000, playMs = 30000, game, visitor } = {}) {
    const body = { visit: uuid(visit), page: uuid(page), ms };
    if (playMs !== undefined) body.playMs = playMs;
    if (game !== undefined) body.game = game;
    if (visitor !== undefined) body.visitor = uuid(visitor);
    const request = new Request('https://worker.example/collect', {
      method: 'POST', headers: { Origin: 'https://playpile.net', 'Content-Type': 'text/plain' }, body: JSON.stringify(body),
    });
    assert.equal((await worker.fetch(request, env)).status, 204);
  }
  const row = page => plain(db.prepare('SELECT * FROM engagement_pages WHERE page_id=?').get(uuid(page)));
  const view = name => plain(db.prepare('SELECT * FROM ' + name).all());
  const time = (page, first, last = first) => db.prepare('UPDATE engagement_pages SET created_at=?,last_seen_at=? WHERE page_id=?').run(first, last, uuid(page));
  return { db, send, row, view, time };
}

test('visitor migration leaves history anonymous and game summaries intact', async () => {
  const { db, send, row, view } = setup(true);
  try {
    assert.equal(row(999).visitor_id, null);
    assert.equal(row(999).last_seen_at, null);
    assert.equal(view('engagement_game_summary')[0].total_active_minutes, 2);
    await send({ page: 1, game: 'apex' });
    assert.equal(row(1).visitor_id, null);
    assert.match(row(1).last_seen_at, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    assert.deepEqual(view('engagement_visitor_summary'), []);
    const coverage = view('engagement_visitor_coverage')[0];
    assert.equal(coverage.tracked_visits, 2);
    assert.equal(coverage.anonymous_visits, 2);
    assert.equal(coverage.identifiable_browsers, 0);
    assert.equal(coverage.returning_browser_percent, null);
  } finally { db.close(); }
});

test('same-day visits are returns; reloads and navigation remain one browser session', async () => {
  const { db, send, view, time } = setup();
  try {
    await send({ visit: 1, page: 1, ms: 120000, playMs: 60000, game: 'apex', visitor: 100 });
    await send({ visit: 1, page: 2, ms: 180000, playMs: 120000, game: 'apex', visitor: 100 });
    await send({ visit: 2, page: 3, ms: 420000, playMs: 300000, game: 'apex', visitor: 100 });
    time(1, '2026-11-19 10:00:00', '2026-11-19 10:02:00');
    time(2, '2026-11-19 10:02:00', '2026-11-19 10:05:00');
    time(3, '2026-11-19 13:00:00', '2026-11-19 13:07:00');
    const summary = view('engagement_visitor_summary')[0];
    assert.equal(summary.sessions, 2);
    assert.equal(summary.return_sessions, 1);
    assert.equal(summary.total_active_minutes, 12);
    assert.equal(summary.total_play_minutes, 8);
    assert.equal(summary.avg_session_minutes, 6);
    assert.equal(summary.longest_session_minutes, 7);
    assert.equal(summary.first_seen_at, '2026-11-19 10:00:00');
    assert.equal(summary.last_seen_at, '2026-11-19 13:07:00');
    assert.deepEqual(view('engagement_visitor_visits').map(v => v.session_number), [1, 2]);
    const game = view('engagement_visitor_games')[0];
    assert.equal(game.plays, 2);
    assert.equal(game.total_play_minutes, 8);
    assert.equal(game.avg_minutes_per_play, 4);
    assert.equal(game.longest_play_minutes, 5);
  } finally { db.close(); }
});

test('duplicate, out-of-order and metadata-only beacons do not advance last seen or totals', async () => {
  const { db, send, row, time } = setup();
  try {
    const body = { visitor: 100, ms: 120000, playMs: 60000 };
    await send(body);
    time(1, '2000-01-01 00:00:00');
    await send(body);
    await send({ ...body, ms: 60000, playMs: 30000 });
    await send({ ...body, game: 'apex' });
    assert.equal(row(1).game_id, 'apex');
    assert.equal(row(1).active_ms, 120000);
    assert.equal(row(1).play_ms, 60000);
    assert.equal(row(1).last_seen_at, '2000-01-01 00:00:00');
    await send({ ...body, playMs: 90000, game: 'apex' });
    assert.equal(row(1).play_ms, 90000);
    assert.equal(row(1).last_seen_at, db.prepare('SELECT CURRENT_TIMESTAMP AS now').get().now);
    time(1, '2000-01-01 00:00:00');
    await send({ ...body, ms: 180000, game: 'apex' });
    assert.equal(row(1).active_ms, 180000);
    assert.equal(row(1).play_ms, 90000);
    assert.equal(row(1).last_seen_at, db.prepare('SELECT CURRENT_TIMESTAMP AS now').get().now);
  } finally { db.close(); }
});

test('identity is immutable including null so consent cannot relabel accumulated time', async () => {
  const { db, send, row, view, time } = setup();
  try {
    await send({ visitor: undefined });
    time(1, '2000-01-01 00:00:00');
    await send({ visitor: 100, ms: 120000, playMs: 60000 });
    assert.equal(row(1).visitor_id, null);
    assert.equal(row(1).active_ms, 60000);
    assert.equal(row(1).last_seen_at, '2000-01-01 00:00:00');
    await send({ visit: 2, page: 2, visitor: 100 });
    const original = row(2);
    await send({ visit: 2, page: 2, visitor: 101, ms: 120000, playMs: 60000 });
    await send({ visit: 2, page: 2, ms: 180000, playMs: 120000 });
    assert.deepEqual(row(2), original);
    await send({ visit: 3, page: 3, ms: 0, playMs: 0 });
    await send({ visit: 3, page: 3, ms: 60000, visitor: 100 });
    assert.equal(row(3).visitor_id, null, 'even an anonymous zero-time page needs a fresh identity boundary');
    await send({ visit: 4, page: 4, visitor: 101 });
    assert.deepEqual(view('engagement_visitor_summary').map(v => [v.visitor_id, v.sessions]), [[uuid(100), 1], [uuid(101), 1]]);
  } finally { db.close(); }
});

test('return percentage denominator is identifiable browsers and anonymous visits remain visible as coverage', async () => {
  const { db, send, view } = setup();
  try {
    await send({ visit: 1, page: 1, visitor: 100 });
    await send({ visit: 2, page: 2, visitor: 100 });
    await send({ visit: 3, page: 3, visitor: 101 });
    await send({ visit: 4, page: 4 });
    await send({ visit: 5, page: 5 });
    const coverage = view('engagement_visitor_coverage')[0];
    assert.deepEqual(coverage, {
      tracked_visits: 5, identified_visits: 3, anonymous_visits: 2, identified_visit_percent: 60,
      identifiable_browsers: 2, returning_browsers: 1, return_sessions: 1, returning_browser_percent: 50,
    });
    db.exec(read('visitor-report.sql'));
  } finally { db.close(); }
});

test('dated report uses lifetime session order and complete session totals at the boundary', async () => {
  const { db, send, time } = setup();
  try {
    await send({ visit: 1, page: 1, visitor: 100 });
    await send({ visit: 2, page: 2, visitor: 100 });
    await send({ visit: 3, page: 3, visitor: 101 });
    await send({ visit: 2, page: 4, visitor: 100 });
    time(1, '2026-11-18 10:00:00');
    time(2, '2026-11-19 23:59:00');
    time(3, '2026-11-19 10:00:00');
    time(4, '2026-11-20 00:01:00');
    const report = read('visitor-report.sql');
    const queryStart = report.indexOf('-- SELECT COUNT(*) AS identified_sessions');
    const queryEnd = report.indexOf(';', queryStart) + 1;
    const query = report.slice(queryStart, queryEnd).replace(/^-- /gm, '');
    const cohort = plain(db.prepare(query).get('2026-11-19 00:00:00', '2026-11-20 00:00:00'));
    assert.deepEqual(cohort, {
      identified_sessions: 2, identifiable_browsers: 2, new_browsers: 1, returning_browsers: 1,
      return_sessions: 1, returning_browser_percent: 50, active_minutes: 3, play_minutes: 1.5,
    });
    const coverageStart = report.indexOf('-- WITH visits AS');
    const coverageQuery = report.slice(coverageStart).replace(/^-- /gm, '');
    assert.equal(db.prepare(coverageQuery).get('2026-11-19 00:00:00', '2026-11-20 00:00:00').tracked_visits, 2);
  } finally { db.close(); }
});

test('empty reports expose zero counts and undefined percentages without inventing browsers', () => {
  const { db, view } = setup();
  try {
    assert.deepEqual(view('engagement_visitor_visits'), []);
    assert.deepEqual(view('engagement_visitor_games'), []);
    assert.deepEqual(view('engagement_visitor_coverage'), [{
      tracked_visits: 0, identified_visits: 0, anonymous_visits: 0, identified_visit_percent: null,
      identifiable_browsers: 0, returning_browsers: 0, return_sessions: 0, returning_browser_percent: null,
    }]);
  } finally { db.close(); }
});
