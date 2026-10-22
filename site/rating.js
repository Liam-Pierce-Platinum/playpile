// =====================================================================
// PLAYPILE :: site/rating.js - STAR RATINGS
// =====================================================================
//
// One to five stars on every game page, one vote per visitor per game,
// changeable. The average and the count are only ever REAL: they come
// from the shared database, or they are not shown at all.
//
// THE DATABASE is the same Firebase project the accounts use
// (site/cloud.json, see ACCOUNTS.md). Until that file has an apiKey and
// a projectId, the stars still work but only for you: your vote is kept
// in this browser and the page says so. No average is shown, and none is
// ever made up - a fake rating is the one thing that gets a site's
// search listing penalised.
//
// HOW A VOTE IS STORED
//   ratings/{game}/votes/{uid} = { stars: 1..5 (int), updated: server time }
// {uid} is a Firebase ANONYMOUS account made silently for this browser,
// so the security rules can insist that a browser only ever writes its
// own one document per game - that is the "one vote per browser" rule,
// enforced on the server, not just here. The rules also refuse anything
// that is not a whole number from 1 to 5, and a change within 5 seconds
// of the last one. The average is a server-side count/avg aggregation
// over the votes, so no client can write a fake total either.
//
// THE CARDS show compact stars from /site/ratings.json, a snapshot the
// build (tools/deploy.mjs) takes from the same database. The build also
// puts schema.org AggregateRating into a game's page - but only once it
// has at least 3 real votes.
const K_VOTES = 'pprate.votes';    // not pd.*: account.js syncs pd.* keys, and a vote is per browser
const K_AUTH = 'pprate.auth';
const K_LOG = 'pprate.log';
export const MIN_PUBLIC = 3;       // votes before an average goes into search results

const rd = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
const wr = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } };

export const myVote = (slug) => +(rd(K_VOTES, {})[slug] || 0);
function keepMine(slug, n) { const v = rd(K_VOTES, {}); v[slug] = n; wr(K_VOTES, v); }

// ---- the cloud config, read once ---------------------------------------
let cfgP = null;
export function cloudConfig() {
  if (!cfgP) cfgP = (async () => {
    try {
      const stop = new AbortController();
      const t = setTimeout(() => stop.abort(), 5000);
      const r = await fetch('/site/cloud.json', { cache: 'no-store', signal: stop.signal });
      const txt = await r.text();
      clearTimeout(t);
      if (!r.ok) return null;
      const j = JSON.parse(txt);
      if (!j.apiKey || !j.projectId || j.ratings === false) return null;
      return {
        key: j.apiKey, project: j.projectId,
        fs: j.firestoreHost || 'https://firestore.googleapis.com',
        id: j.authHost || 'https://identitytoolkit.googleapis.com',
        tok: j.tokenHost || 'https://securetoken.googleapis.com',
      };
    } catch (e) { return null; }
  })();
  return cfgP;
}
const docs = (c) => c.fs + '/v1/projects/' + c.project + '/databases/(default)/documents';

// ---- the shared numbers ------------------------------------------------
// one aggregation query: how many votes, and their average. 1 read per
// 1000 votes on Firebase's meter, so it is cheap enough for every page view.
export async function aggregate(c, slug) {
  const r = await fetch(docs(c) + '/ratings/' + slug + ':runAggregationQuery?key=' + c.key, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId: 'votes' }] },
      aggregations: [{ alias: 'n', count: {} }, { alias: 'a', avg: { field: { fieldPath: 'stars' } } }],
    } }),
  });
  if (!r.ok) throw new Error('aggregate ' + r.status);
  const j = await r.json();
  const f = (Array.isArray(j) ? j[0] : j)?.result?.aggregateFields || {};
  const n = +(f.n?.integerValue || 0);
  const a = f.a?.doubleValue != null ? +f.a.doubleValue : f.a?.integerValue != null ? +f.a.integerValue : 0;
  return { n, a: n ? a : 0 };
}

// ---- an anonymous account for this browser -----------------------------
async function token(c) {
  const s = rd(K_AUTH, null);
  if (s && s.idToken && s.exp > Date.now() + 60000) return s;
  if (s && s.refreshToken) {
    const r = await fetch(c.tok + '/v1/token?key=' + c.key, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=refresh_token&refresh_token=' + encodeURIComponent(s.refreshToken),
    });
    if (r.ok) {
      const j = await r.json();
      const out = { uid: j.user_id, idToken: j.id_token, refreshToken: j.refresh_token, exp: Date.now() + (+j.expires_in || 3600) * 1000 };
      wr(K_AUTH, out); return out;
    }
  }
  const r = await fetch(c.id + '/v1/accounts:signUp?key=' + c.key, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ returnSecureToken: true }),
  });
  if (!r.ok) throw new Error('signup ' + r.status);
  const j = await r.json();
  const out = { uid: j.localId, idToken: j.idToken, refreshToken: j.refreshToken, exp: Date.now() + (+j.expiresIn || 3600) * 1000 };
  wr(K_AUTH, out);
  return out;
}

// ---- the rate limit on this side -----------------------------------------
// The server refuses a change within 5 s of the last one; this keeps an
// honest visitor from ever hitting that, and stops a stuck finger from
// sending fifty writes: at most 8 changes per game per hour.
function allowed(slug) {
  const now = Date.now();
  const log = rd(K_LOG, {});
  const mine = (log[slug] || []).filter((t) => now - t < 3600e3);
  if (mine.length >= 8) return 'You have changed this rating a lot. Try again later.';
  if (mine.length && now - mine[mine.length - 1] < 6000) return 'wait';
  return '';
}
function logged(slug) { const log = rd(K_LOG, {}); log[slug] = [...(log[slug] || []).filter((t) => Date.now() - t < 3600e3), Date.now()]; wr(K_LOG, log); }

export async function castVote(c, slug, n) {
  if (!(Number.isInteger(n) && n >= 1 && n <= 5)) throw new Error('bad vote');
  const t = await token(c);
  const name = 'projects/' + c.project + '/databases/(default)/documents/ratings/' + slug + '/votes/' + t.uid;
  const r = await fetch(docs(c) + ':commit?key=' + c.key, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t.idToken },
    body: JSON.stringify({ writes: [{
      update: { name, fields: { stars: { integerValue: String(n) } } },
      updateTransforms: [{ fieldPath: 'updated', setToServerValue: 'REQUEST_TIME' }],
    }] }),
  });
  if (!r.ok) throw new Error('vote ' + r.status);
}

// ---------------------------------------------------------------------
// THE WIDGET ON A GAME PAGE
// ---------------------------------------------------------------------
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.6l2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.2l-5.8 3.2 1.2-6.5L2.6 9.4l6.5-.8z"/></svg>';
const WORDS = ['', 'Bad', 'Not great', 'OK', 'Good', 'Great'];
const fmt = (a) => (Math.round(a * 10) / 10).toFixed(1);
const plural = (n) => n.toLocaleString('en') + (n === 1 ? ' rating' : ' ratings');

export function starsHtml(a, cls = '') {
  // five stars, filled to the average (to a tenth), for read-only display
  const pct = Math.max(0, Math.min(100, (a / 5) * 100));
  return '<span class="rt-show ' + cls + '" aria-hidden="true"><span class="rt-bg">' + STAR.repeat(5) + '</span>'
    + '<span class="rt-fg" style="width:' + pct.toFixed(1) + '%">' + STAR.repeat(5) + '</span></span>';
}

export function mountRating(el, g) {
  if (!el) return;
  const slug = g.slug;
  let mine = myVote(slug), preview = 0, agg = null, cloud = null, busy = false, note = '';

  el.innerHTML = '<div class="rt">'
    + '<div class="rt-you"><span class="rt-k" id="rt-k">Rate ' + g.title.replace(/[<>&"]/g, '') + '</span>'
    + '<div class="rt-stars" role="radiogroup" aria-labelledby="rt-k">'
    + [1, 2, 3, 4, 5].map((n) => '<button type="button" role="radio" data-n="' + n + '" aria-label="' + n + (n === 1 ? ' star' : ' stars') + ' - ' + WORDS[n] + '">' + STAR + '</button>').join('')
    + '</div><span class="rt-me" aria-live="polite"></span></div>'
    + '<div class="rt-agg" aria-live="polite"></div></div>';
  const btns = [...el.querySelectorAll('.rt-stars button')];
  const meEl = el.querySelector('.rt-me'), aggEl = el.querySelector('.rt-agg');
  const group = el.querySelector('.rt-stars');

  function paint() {
    const lit = preview || mine;
    btns.forEach((b, i) => {
      b.classList.toggle('on', i < lit);
      b.classList.toggle('pv', !!preview && i < preview);
      b.setAttribute('aria-checked', String(i + 1 === mine));
      b.tabIndex = (mine ? i + 1 === mine : i === 0) ? 0 : -1;
    });
    if (preview) meEl.textContent = WORDS[preview];
    else if (note) meEl.textContent = note;
    else if (mine) meEl.textContent = 'You gave it ' + mine + (cloud ? '' : ' · saved on this device');
    else meEl.textContent = cloud ? 'Tap a star' : 'Tap a star · saved on this device';
    if (!cloud) { aggEl.innerHTML = ''; return; }
    if (!agg) { aggEl.innerHTML = '<span class="rt-dim">Loading ratings…</span>'; return; }
    aggEl.innerHTML = agg.n
      ? '<b class="rt-avg">' + fmt(agg.a) + '</b>' + starsHtml(agg.a) + '<span class="rt-n">' + plural(agg.n) + '</span>'
        + '<span class="sr">Rated ' + fmt(agg.a) + ' out of 5 from ' + plural(agg.n) + '</span>'
      : '<span class="rt-dim">No ratings yet. Be the first.</span>';
  }

  // hover (mouse) and press-and-drag (touch) preview the stars; the vote
  // is a click, or lifting the finger. A touch's own trailing click is ignored.
  let touched = false;
  const starAt = (e) => { const b = (e.pointerType === 'mouse' ? e.target : document.elementFromPoint(e.clientX, e.clientY))?.closest?.('.rt-stars button'); return b && btns.includes(b) ? +b.dataset.n : 0; };
  group.addEventListener('pointermove', (e) => { const n = starAt(e); if (n && n !== preview) { preview = n; paint(); } });
  group.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    try { group.releasePointerCapture(e.pointerId); } catch (x) { /* not captured */ }
    preview = starAt(e); paint();
  });
  group.addEventListener('pointerup', (e) => {
    if (e.pointerType === 'mouse') return;
    const n = starAt(e) || preview; preview = 0;
    if (n) { touched = true; setTimeout(() => { touched = false; }, 700); vote(n); } else paint();
  });
  group.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { preview = 0; paint(); } });
  group.addEventListener('pointercancel', () => { preview = 0; paint(); });
  btns.forEach((b) => b.addEventListener('click', () => {
    if (touched) { touched = false; return; }
    preview = 0; vote(+b.dataset.n);
  }));
  // a radio group: arrows move and choose, as a screen reader expects
  group.addEventListener('keydown', (e) => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 0;
    if (!d) return;
    e.preventDefault(); e.stopPropagation();
    const n = Math.max(1, Math.min(5, (mine || 0) + d));
    vote(n); btns[n - 1].focus();
  });

  let lastVoteAt = 0;
  async function vote(n) {
    if (busy || n === mine && Date.now() - lastVoteAt < 1500) return;
    const old = mine;
    if (!cloud) { mine = n; keepMine(slug, n); note = ''; paint(); return; }
    const why = allowed(slug);
    if (why && why !== 'wait') { note = why; paint(); return; }
    if (why === 'wait') { note = 'One moment…'; paint(); setTimeout(() => { note = ''; vote(n); }, 6000 - (Date.now() - (rd(K_LOG, {})[slug] || []).slice(-1)[0])); return; }
    busy = true; mine = n; keepMine(slug, n); note = 'Saving…'; paint();
    try {
      await castVote(cloud, slug, n);
      logged(slug); lastVoteAt = Date.now();
      // show the new truth straight away (it is the real total with your
      // real vote in it), then read it back from the server to be sure
      if (agg) {
        if (old) agg = { n: agg.n, a: agg.n ? (agg.a * agg.n - old + n) / agg.n : n };
        else agg = { n: agg.n + 1, a: (agg.a * agg.n + n) / (agg.n + 1) };
      }
      note = 'Thanks! You gave it ' + n + '.';
      setTimeout(() => refresh(), 1500);
    } catch (e) {
      mine = old; keepMine(slug, old);
      note = 'Could not save your rating. Try again in a moment.';
    }
    busy = false; paint();
    setTimeout(() => { if (note.startsWith('Thanks') || note.startsWith('Could')) { note = ''; paint(); } }, 4000);
  }

  async function refresh() {
    try { agg = await aggregate(cloud, slug); } catch (e) { agg = agg || null; if (!agg) aggEl.innerHTML = ''; }
    paint();
  }

  paint();
  cloudConfig().then((c) => { cloud = c; paint(); if (c) refresh(); });
}

// ---------------------------------------------------------------------
// COMPACT STARS ON THE CARDS (from the build's snapshot)
// ---------------------------------------------------------------------
let snapP = null;
export function ratingsSnapshot() {
  if (!snapP) snapP = fetch('/site/ratings.json', { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : {})).then((j) => (j && j.games) || {}).catch(() => ({}));
  return snapP;
}
export function decorateCards(root = document) {
  ratingsSnapshot().then((R) => {
    if (!Object.keys(R).length) return;
    for (const c of root.querySelectorAll('.card[data-slug]')) {
      const r = R[c.dataset.slug];
      if (!r || !r.n || c.querySelector('.cstar')) continue;
      const th = c.querySelector('.thumb'); if (!th) continue;
      const s = document.createElement('span');
      s.className = 'cstar';
      s.setAttribute('aria-label', 'Rated ' + fmt(r.a) + ' out of 5 by ' + plural(r.n));
      s.innerHTML = STAR + fmt(r.a) + '<small>(' + (r.n > 999 ? Math.round(r.n / 100) / 10 + 'k' : r.n) + ')</small>';
      th.appendChild(s);
    }
  });
}
