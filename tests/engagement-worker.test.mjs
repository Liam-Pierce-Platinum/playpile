import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../tools/engagement-worker/worker.mjs';
import { GAMES } from '../site/catalogue.js';

const ORIGIN = 'https://playpile.net';
const VISIT = '0d3f536c-c428-4a77-a4db-d71cb0c59ea1';
const PAGE = '10d52c9c-bff5-42d5-bf9a-68fbd41a241d';
const payload = { visit: VISIT, page: PAGE, ms: 12345 };

function collect(body = JSON.stringify(payload), options = {}) {
  const { origin = ORIGIN, contentType = 'text/plain;charset=UTF-8', length } = options;
  const headers = { 'Content-Type': contentType };
  if (origin !== null) headers.Origin = origin;
  if (length !== undefined) headers['Content-Length'] = length;
  return new Request('https://worker.example/collect', { method: 'POST', headers, body });
}

function database() {
  const writes = [];
  return {
    writes,
    env: { DB: { prepare: sql => ({ bind: (...params) => ({ run: async () => { writes.push({ sql, params }); } }) }) } },
  };
}

test('engagement worker accepts both production origins and preserves missing play time', async () => {
  const { writes, env } = database();
  for (const origin of [ORIGIN, 'https://www.playpile.net']) {
    const response = await worker.fetch(collect(JSON.stringify({ ...payload, visit: VISIT.toUpperCase() }), { origin }), env);
    assert.equal(response.status, 204);
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.equal(response.headers.get('Vary'), 'Origin');
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
  }
  assert.equal(writes.length, 2);
  for (const { sql, params } of writes) {
    assert.deepEqual(params, [VISIT, PAGE, 12345, null, null, null]);
    assert.match(sql, /ON CONFLICT \(visit_id, page_id\) DO UPDATE/);
    assert.match(sql, /MAX\(engagement_pages\.active_ms, excluded\.active_ms\)/);
  }
});

test('visitor UUID is optional, canonicalized, and fits alongside every game at maximum totals', async () => {
  const { writes, env } = database();
  for (const { slug } of GAMES) {
    const body = JSON.stringify({ ...payload, ms: 28800000, playMs: 28800000, game: slug, visitor: VISIT.toUpperCase() });
    assert.ok(Buffer.byteLength(body) <= 256, slug);
    assert.equal((await worker.fetch(collect(body), env)).status, 204);
    assert.equal(writes.at(-1).params[5], VISIT);
  }
  const count = writes.length;
  for (const visitor of ['', null, 12, [], {}, 'person@example.com', 'not-a-uuid']) {
    assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, visitor })), env)).status, 400);
  }
  for (const key of ['last_seen_at', 'created_at', 'timestamp']) {
    assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, [key]: '2099-01-01' })), env)).status, 400);
  }
  assert.equal(writes.length, count);
});

test('per-game beacons accept every canonical catalogue ID and reject arbitrary attribution', async () => {
  const { writes, env } = database();
  for (const { slug } of GAMES) {
    const body = JSON.stringify({ ...payload, playMs: 5000, game: slug });
    assert.ok(Buffer.byteLength(body) <= 256);
    assert.equal((await worker.fetch(collect(body), env)).status, 204, slug);
    assert.equal(writes.at(-1).params[4], slug);
  }
  const count = writes.length;
  for (const game of ['', null, 12, [], {}, 'nonexistent', '/games/apex/', 'APEX', 'apex?user=123']) {
    assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, playMs: 5000, game })), env)).status, 400);
  }
  assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, game: 'apex' })), env)).status, 400);
  assert.equal(writes.length, count);
});

test('engagement worker accepts only cumulative play time within dwell time', async () => {
  const { writes, env } = database();
  for (const playMs of [0, 5_000, payload.ms]) {
    assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, playMs })), env)).status, 204);
  }
  for (const playMs of [-1, 1.5, '5000', null, payload.ms + 1]) {
    assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, playMs })), env)).status, 400);
  }
  assert.deepEqual(writes.map(write => write.params[3]), [0, 5_000, payload.ms]);
});

test('engagement worker rejects invalid and oversized beacons without writing to D1', async () => {
  const { writes, env } = database();
  const cases = [
    [collect(undefined, { origin: 'http://playpile.net' }), 403],
    [collect(undefined, { origin: 'https://playpile.net.example' }), 403],
    [collect(undefined, { origin: null }), 403],
    [collect(undefined, { contentType: 'application/json' }), 415],
    [collect(undefined, { length: '257' }), 413],
    [collect('x'.repeat(257)), 413],
    [collect('broken JSON'), 400],
    [collect('null'), 400],
    [collect(JSON.stringify({ ...payload, path: '/' })), 400],
    [collect(JSON.stringify({ ...payload, page: 'not-a-uuid' })), 400],
    ...[-1, 1.5, 28800001, '12345'].map(ms => [collect(JSON.stringify({ ...payload, ms })), 400]),
  ];
  for (const [request, status] of cases) assert.equal((await worker.fetch(request, env)).status, status);
  assert.deepEqual(writes, []);

  for (const ms of [0, 28800000]) {
    assert.equal((await worker.fetch(collect(JSON.stringify({ ...payload, ms })), env)).status, 204);
  }
  assert.deepEqual(writes.map(write => write.params[2]), [0, 28800000]);
});

test('engagement worker serves a plain health check and exposes no reports or failures', async () => {
  const health = await worker.fetch(new Request('https://worker.example/health'), {});
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'OK');

  const report = await worker.fetch(new Request('https://worker.example/report'), {});
  assert.equal(report.status, 404);
  assert.equal(await report.text(), '');

  const read = await worker.fetch(new Request('https://worker.example/collect', { headers: { Origin: ORIGIN } }), {});
  assert.equal(read.status, 405);

  const failure = await worker.fetch(collect(), {});
  assert.equal(failure.status, 503);
  assert.equal(await failure.text(), '');
});

test('public popularity shares one cache key and leaves private reports closed on errors', async t => {
  const entries = new Map();
  const pending = [];
  const ctx = { waitUntil: work => pending.push(work) };
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  t.after(() => original ? Object.defineProperty(globalThis, 'caches', original) : delete globalThis.caches);
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    match: async key => entries.get(key)?.clone(),
    put: async (key, value) => entries.set(key, value),
  } } });
  const url = 'https://worker.example/popular';
  const noData = await worker.fetch(new Request(url), {}, ctx);
  assert.equal(noData.status, 503);
  assert.equal(noData.headers.get('Cache-Control'), 'no-store');
  const env = { DB: { prepare: () => ({ all: async () => ({ results: [{ game_id: 'apex' }, { game_id: 'unknown' }] }) }) } };
  const live = await worker.fetch(new Request(url+'?irrelevant=1'), env, ctx);
  assert.deepEqual(await live.json(), { games: ['apex'] });
  await Promise.all(pending);
  assert.deepEqual([...entries.keys()], [url]);
  const cached = await worker.fetch(new Request(url+'?other=2'), {}, ctx);
  assert.deepEqual(await cached.json(), { games: ['apex'] });
  assert.equal((await worker.fetch(new Request(url, { method: 'POST' }), {}, ctx)).status, 405);
});
