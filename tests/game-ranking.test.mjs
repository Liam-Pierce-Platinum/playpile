import assert from 'node:assert/strict';
import { test } from 'node:test';

const catalogue = ['new', 'racing', 'puzzle', 'sports'].map(slug => ({ slug }));
const slugs = list => list.map(game => game.slug);
const day = 86400000;
let instance = 0;

async function fixture(t, { games = {}, recent = [], cached, fetcher } = {}) {
  function storage() {
    const entries = new Map();
    return { getItem: k => entries.get(k) ?? null, setItem: (k, v) => entries.set(k, v) };
  }
  const local = storage(), session = storage(), win = new EventTarget(), doc = new EventTarget();
  local.setItem('pd.site.stats', JSON.stringify({ games }));
  local.setItem('pd.recent', JSON.stringify(recent));
  if (cached) session.setItem('pp.popular-games.v1', JSON.stringify(cached));
  const requests = [];
  const subscriptions = [];
  t.after(() => subscriptions.forEach(off => off()));
  for (const [name, value] of Object.entries({window: win, document: doc, localStorage: local, sessionStorage: session,
    fetch: async (...args) => { requests.push(args); return fetcher ? fetcher() : { ok: false }; },
  })) {
    const saved = Object.getOwnPropertyDescriptor(globalThis, name);
    Object.defineProperty(globalThis, name, { configurable: true, value });
    t.after(() => saved ? Object.defineProperty(globalThis, name, saved) : delete globalThis[name]);
  }
  const { rankGames, onRankingChange } = await import(`../site/game-ranking.js?test=${instance++}`);
  return { rankGames, subscribe: fn => subscriptions.push(onRankingChange(fn)), win, local, session, requests };
}

test('cold and offline rankings retain candidate order, and exact ties are stable', async t => {
  const f = await fixture(t);
  assert.deepEqual(slugs(f.rankGames(catalogue)), slugs(catalogue));
  const before = [...catalogue];
  f.subscribe(() => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(f.rankGames(catalogue), before);
  assert.deepEqual(catalogue, before);
});

test('real aggregate ordering is shared, frequent recent games rise only for their profile', async t => {
  const f = await fixture(t, {
    games: { sports: { plays: 8, secs: 900, last: Date.now() }, new: { plays: 1, last: Date.now() - 180 * day } },
    fetcher: () => ({ ok: true, json: async () => ({ games: ['racing','puzzle','racing'] }) }),
  });
  let changes = 0;
  f.subscribe(() => changes++);
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(slugs(f.rankGames(catalogue)), ['sports','racing','puzzle','new']);
  assert.deepEqual(slugs(f.rankGames(catalogue, { popularOnly: true })), ['racing','puzzle','new','sports']);
  assert.deepEqual(slugs(f.rankGames([catalogue[2], catalogue[0]])), ['puzzle','new']);
  const [url, opts] = f.requests[0];
  assert.equal(new URL(url).search, '');
  assert.equal(opts.credentials, 'omit');
  assert.equal(opts.referrerPolicy, 'no-referrer');
  assert.equal(opts.body, undefined);
  f.local.setItem('pd.site.stats','{}');
  f.win.dispatchEvent(new Event('pp-account'));
  assert.deepEqual(slugs(f.rankGames(catalogue)), ['racing','puzzle','new','sports']);
  f.win.dispatchEvent(new Event('pp-progress'));
  assert.equal(changes, 2);
});

test('legacy recent games work and a failed refresh preserves bounded last-good popularity', async t => {
  const f = await fixture(t, {recent:['sports','sports','puzzle'], cached:{at:Date.now()-day/2, games:['racing']},
    fetcher: () => ({ok:true, json:async()=>({games:['bad slug']})})});
  f.subscribe(() => {});
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(slugs(f.rankGames(catalogue)), ['racing','sports','puzzle','new']);
  assert.equal(f.requests.length, 1);
});

test('expired aggregates and damaged saves fall back to the original collection', async t => {
  const f = await fixture(t, {cached:{at:Date.now()-2*day,games:['sports']}});
  f.local.setItem('pd.site.stats', '{bad JSON');
  f.local.setItem('pd.recent','{}');
  assert.deepEqual(slugs(f.rankGames(catalogue)), slugs(catalogue));
});
