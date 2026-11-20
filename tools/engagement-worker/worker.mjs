const ORIGINS = new Set(['https://playpile.net', 'https://www.playpile.net']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256;
const MAX_PAGE_MS = 8 * 60 * 60 * 1000;
// Canonical IDs from site/catalogue.js. Keep this self-contained for dashboard deploys.
const GAMES = new Set([
  'harbor-rush', 'neon-repo', 'skyline-stunt-club',
  'lukes-diner', 'bladeborn', 'ironsight', 'blade-dash-story', 'egg-wars', 'kart-clash',
  'slope-rush', 'tunnel-dive', 'bridge-race', 'hole-feast', 'stick-swing', 'moto-stunt',
  'drift-tower', 'eggy-road', 'stunt-city', 'crazy-cattle', 'freeze-run', 'archer-duel',
  'rooftop-duel', 'snake-arena', 'paper-land', 'cube-merge', 'getaway-flop', 'block-world',
  'sky-climb', 'golf-orbit', 'time-shooter', 'subway-run', 'marble-roll', 'rush-hour',
  'mirror-duel', 'bubble-trouble', 'pizza-panic', 'toy-soldier-blitz', 'ski-mountain',
  'dodgeball-dash', 'roof-run', 'firework-frenzy', 'pursued', 'deep-dive', 'sky-aces',
  'auto-arena', 'tiny-knight', 'the-mark', 'chibi-clash', 'spelldelve', 'frontline',
  'curveball', 'helix-drop', 'axe-throw', 'car-soccer', 'tank-duel', 'sumo-slam', 'prism',
  'home-run', 'air-hockey', 'strike', 'word-blitz', 'beat-dash', 'neon-swarm', 'pinball',
  'mini-golf', 'graze', 'lanternfall', 'bailout', 'twister-io', 'block-royale', 'bannerfall',
  'stack-attack', 'snowball-royale', 'wrecking-ball', 'mower-madness', 'sushi-conveyor',
  'bomb-squad', 'grapple-goblin', 'parry', 'one-tile', 'derby', 'touge-drift', 'blade-dash',
  'tiny-harbor', 'highrise', 'kickback', 'exposure', 'dungeon-quest', 'apex', 'nascar',
  'night-shift', 'grind-city', 'southpaw', 'inkvale', 'penguin-dash', 'stack', 'drifter',
  'merge', 'pipeworks', 'sweep', 'quickdraw', 'hoops', 'spike', 'crossing',
]);

const UPSERT = `
  INSERT INTO engagement_pages (visit_id, page_id, active_ms, play_ms, game_id, visitor_id, last_seen_at)
  VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  ON CONFLICT (visit_id, page_id) DO UPDATE SET
    active_ms = MAX(engagement_pages.active_ms, excluded.active_ms),
    play_ms = COALESCE(MAX(engagement_pages.play_ms, excluded.play_ms),
                       engagement_pages.play_ms, excluded.play_ms),
    game_id = COALESCE(engagement_pages.game_id, excluded.game_id),
    last_seen_at = CASE
      WHEN excluded.active_ms > engagement_pages.active_ms
        OR excluded.play_ms > COALESCE(engagement_pages.play_ms, 0)
      THEN CURRENT_TIMESTAMP ELSE engagement_pages.last_seen_at END
  WHERE (engagement_pages.game_id IS NULL OR excluded.game_id IS NULL
         OR engagement_pages.game_id = excluded.game_id)
    AND engagement_pages.visitor_id IS excluded.visitor_id
    AND (excluded.active_ms > engagement_pages.active_ms
     OR (excluded.play_ms IS NOT NULL AND
         (engagement_pages.play_ms IS NULL OR excluded.play_ms > engagement_pages.play_ms))
     OR (engagement_pages.game_id IS NULL AND excluded.game_id IS NOT NULL))
`;

function respond(status, origin, body = null) {
  const headers = { 'Cache-Control': 'no-store' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers.Vary = 'Origin';
  }
  return new Response(body, { status, headers });
}

async function readSmallBody(request) {
  if (Number(request.headers.get('Content-Length')) > MAX_BODY_BYTES) return null;
  if (!request.body) return '';

  const buffer = new Uint8Array(MAX_BODY_BYTES);
  const reader = request.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) return new TextDecoder().decode(buffer.subarray(0, size));
      if (size + value.byteLength > MAX_BODY_BYTES) {
        void reader.cancel().catch(() => {});
        return null;
      }
      buffer.set(value, size);
      size += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

function validPayload(payload) {
  if (!payload || typeof payload !== 'object') return false;
  const hasPlay = Object.hasOwn(payload, 'playMs');
  const hasGame = Object.hasOwn(payload, 'game');
  const allowed = new Set(['visit', 'page', 'ms', 'playMs', 'game', 'visitor']);
  if (Object.keys(payload).some(key => !allowed.has(key))) return false;
  if (hasGame && (!hasPlay || !GAMES.has(payload.game))) return false;
  if (Object.hasOwn(payload, 'visitor') &&
      (typeof payload.visitor !== 'string' || !UUID.test(payload.visitor))) return false;
  const { visit, page, ms, playMs } = payload;
  return typeof visit === 'string' && UUID.test(visit) && typeof page === 'string' && UUID.test(page) &&
    Number.isInteger(ms) && ms >= 0 && ms <= MAX_PAGE_MS &&
    (!hasPlay || (Number.isInteger(playMs) && playMs >= 0 && playMs <= ms));
}

// This public feed contains only the order of known games, shared by all players.
async function popularGames(request, env, ctx) {
  const key = new URL('/popular', request.url).href;
  const cache = globalThis.caches?.default;
  const cached = await cache?.match(key).catch(() => undefined);
  if (cached) return cached;

  try {
    const { results } = await env.DB.prepare(`
      SELECT game_id FROM engagement_game_plays
      WHERE first_recorded_at >= datetime('now', '-7 days')
      GROUP BY game_id
      ORDER BY COUNT(*) DESC, SUM(play_ms) DESC, game_id
    `).all();
    const games = results.map(row => row.game_id).filter(game => GAMES.has(game));
    const response = Response.json({ games }, { headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=900',
    } });
    if (cache && ctx) ctx.waitUntil(cache.put(key, response.clone()).catch(() => {}));
    return response;
  } catch {
    return respond(503, '*');
  }
}

export default {
  async fetch(request, env, ctx) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/health') return respond(200, null, 'OK');
    if (pathname === '/popular') {
      return request.method === 'GET' ? popularGames(request, env, ctx) : respond(405, '*');
    }
    if (pathname !== '/collect') return respond(404);

    const origin = request.headers.get('Origin');
    if (!ORIGINS.has(origin)) return respond(403);
    if (request.method !== 'POST') return respond(405, origin);
    if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'text/plain') {
      return respond(415, origin);
    }

    let payload;
    try {
      const body = await readSmallBody(request);
      if (body === null) return respond(413, origin);
      payload = JSON.parse(body);
    } catch {
      return respond(400, origin);
    }
    if (!validPayload(payload)) return respond(400, origin);

    const { visit, page, ms, playMs, game, visitor } = payload;
    try {
      await env.DB.prepare(UPSERT).bind(visit.toLowerCase(), page.toLowerCase(), ms, playMs ?? null,
        game ?? null, visitor?.toLowerCase() ?? null).run();
      return respond(204, origin);
    } catch {
      return respond(503, origin);
    }
  },
};
