import assert from 'node:assert/strict';
import { test } from 'node:test';
import worker from '../tools/engagement-worker/worker.mjs';

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

test('engagement worker accepts both production origins and binds only cumulative page time', async () => {
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
    assert.deepEqual(params, [VISIT, PAGE, 12345]);
    assert.match(sql, /ON CONFLICT \(visit_id, page_id\) DO UPDATE/);
    assert.match(sql, /MAX\(engagement_pages\.active_ms, excluded\.active_ms\)/);
  }
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
