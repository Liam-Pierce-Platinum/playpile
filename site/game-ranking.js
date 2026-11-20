// The shared feed contains only game slugs. Personal scores come from the active
// PlayPile profile's existing save, including saves made before ranking existed.
const FEED = 'https://playpile-engagement.liamlikescows.workers.dev/popular';
const CACHE = 'pp.popular-games.v1';
const STATS = 'pd.site.stats';
const RECENT = 'pd.recent';
const DAY = 86400000;
const FRESH = 15 * 60000;
const RETRY = 60000;
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function read(key, storage) {
  try { return JSON.parse(globalThis[storage].getItem(key)); } catch { return null; }
}

function positive(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function readPersonalScores() {
  const games = read(STATS, 'localStorage')?.games;
  const recent = read(RECENT, 'localStorage');
  const scores = new Map();
  const recentScores = new Map();
  if (Array.isArray(recent)) {
    for (const slug of recent.slice(0, 12)) {
      if (typeof slug === 'string' && slugPattern.test(slug) && !recentScores.has(slug)) {
        recentScores.set(slug, 1 / (1 + recentScores.size / 6));
      }
    }
  }
  const now = Date.now();
  for (const [slug, stat] of Object.entries(games || {})) {
    const plays = positive(stat?.plays), seconds = positive(stat?.secs);
    if ((!plays && !seconds) || !slugPattern.test(slug)) continue;
    const last = positive(stat.last);
    const ageDays = last ? Math.max(0, Math.floor((now - last) / DAY)) : Infinity;
    const recency = 0.15 + 0.85 * Math.pow(0.5, ageDays / 30);
    // Repeated plays matter most. Time adds a smaller, capped bonus in ten-minute steps.
    const frequency = 0.38 + 0.4 * Math.log2(Math.min(32, Math.max(1, plays)));
    const duration = 0.06 * Math.log2(1 + Math.min(30, Math.floor(seconds / 600)));
    scores.set(slug, recency * (frequency + duration + 0.12 * (recentScores.get(slug) || 0)));
  }
  // Older saves may have only the twelve-game recent list, without counters or dates.
  for (const [slug, position] of recentScores) {
    if (!scores.has(slug)) scores.set(slug, 0.38 * position);
  }
  return scores;
}

function validSlugs(games) {
  if (!Array.isArray(games) || games.length > 1000 ||
      !games.every(slug => typeof slug === 'string' && slug.length <= 120 && slugPattern.test(slug))) return null;
  return [...new Set(games)];
}

function loadFeed() {
  const saved = read(CACHE, 'sessionStorage');
  const age = Date.now() - saved?.at;
  const slugs = validSlugs(saved?.games);
  return slugs && age >= 0 && age < DAY ? { at: saved.at, games: slugs } : { at: 0, games: [] };
}

function communityScores(slugs) {
  return new Map(slugs.map((slug, index) => [slug, 1 / Math.log2(index + 2)]));
}

let feed = loadFeed();
let community = communityScores(feed.games);
let personal;
let pending, retryAfter = 0, refreshTimer;
const subscribers = new Set();

/** Preserve the supplied collection and its original order wherever scores tie. */
export function rankGames(games, { popularOnly = false } = {}) {
  if (!popularOnly) personal ??= readPersonalScores();
  const score = game => (community.get(game.slug) || 0) + (popularOnly ? 0 : personal.get(game.slug) || 0);
  return games.slice().sort((a, b) => score(b) - score(a));
}

function announce() { for (const callback of subscribers) callback(); }

function refreshPersonal() {
  const next = readPersonalScores();
  const changed = !personal || next.size !== personal.size || [...next].some(([slug, score]) => personal.get(slug) !== score);
  personal = next;
  if (changed) announce();
}

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  if (!subscribers.size || document.hidden) return;
  const next = Math.max(feed.at + FRESH, retryAfter);
  refreshTimer = setTimeout(refreshFeed, Math.max(1, next - Date.now()));
}

async function refreshFeed() {
  if (pending) return;
  const now = Date.now();
  if (feed.at && now - feed.at >= DAY) {
    const hadGames = feed.games.length > 0;
    feed = { at: 0, games: [] };
    community = new Map();
    if (hadGames) announce();
  }
  if (now < Math.max(feed.at + FRESH, retryAfter)) return scheduleRefresh();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  pending = true;
  try {
    const response = await fetch(FEED, { credentials: 'omit', referrerPolicy: 'no-referrer', signal: controller.signal });
    if (!response.ok) return;
    const games = validSlugs((await response.json())?.games);
    if (!games) return;
    const changed = games.length !== feed.games.length || games.some((slug, i) => slug !== feed.games[i]);
    feed = { at: Date.now(), games };
    community = communityScores(games);
    try { sessionStorage.setItem(CACHE, JSON.stringify(feed)); } catch { /* In-memory ranking still works. */ }
    if (changed) announce();
  } catch { /* Use the last good feed while the service is unavailable. */ }
  finally {
    clearTimeout(timeout);
    pending = false;
    retryAfter = Date.now() + RETRY;
    scheduleRefresh();
  }
}

function resume() {
  if (document.hidden) return clearTimeout(refreshTimer);
  refreshPersonal();
  refreshFeed();
}

function storageChanged(event) {
  if (!event.key || event.key === STATS || event.key === RECENT) refreshPersonal();
}

export function onRankingChange(callback) {
  const first = !subscribers.size;
  subscribers.add(callback);
  if (first) {
    personal = readPersonalScores();
    window.addEventListener('pp-account', refreshPersonal);
    window.addEventListener('pp-progress', refreshPersonal);
    window.addEventListener('storage', storageChanged);
    window.addEventListener('pageshow', resume);
    document.addEventListener('visibilitychange', resume);
    if (!document.hidden) refreshFeed();
  }
  return () => {
    subscribers.delete(callback);
    if (subscribers.size) return;
    clearTimeout(refreshTimer);
    window.removeEventListener('pp-account', refreshPersonal);
    window.removeEventListener('pp-progress', refreshPersonal);
    window.removeEventListener('storage', storageChanged);
    window.removeEventListener('pageshow', resume);
    document.removeEventListener('visibilitychange', resume);
  };
}
