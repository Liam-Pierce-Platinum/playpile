const ORIGINS = new Set(['https://playpile.net', 'https://www.playpile.net']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_BODY_BYTES = 256;
const MAX_PAGE_MS = 8 * 60 * 60 * 1000;

const UPSERT = `
  INSERT INTO engagement_pages (visit_id, page_id, active_ms, play_ms)
  VALUES (?, ?, ?, ?)
  ON CONFLICT (visit_id, page_id) DO UPDATE SET
    active_ms = MAX(engagement_pages.active_ms, excluded.active_ms),
    play_ms = COALESCE(MAX(engagement_pages.play_ms, excluded.play_ms),
                       engagement_pages.play_ms, excluded.play_ms)
  WHERE excluded.active_ms > engagement_pages.active_ms
     OR (excluded.play_ms IS NOT NULL AND
         (engagement_pages.play_ms IS NULL OR excluded.play_ms > engagement_pages.play_ms))
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
  if (Object.keys(payload).length !== (hasPlay ? 4 : 3)) return false;
  const { visit, page, ms, playMs } = payload;
  return typeof visit === 'string' && UUID.test(visit) && typeof page === 'string' && UUID.test(page) &&
    Number.isInteger(ms) && ms >= 0 && ms <= MAX_PAGE_MS &&
    (!hasPlay || (Number.isInteger(playMs) && playMs >= 0 && playMs <= ms));
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (request.method === 'GET' && pathname === '/health') return respond(200, null, 'OK');
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

    const { visit, page, ms, playMs } = payload;
    try {
      await env.DB.prepare(UPSERT).bind(visit.toLowerCase(), page.toLowerCase(), ms, playMs ?? null).run();
      return respond(204, origin);
    } catch {
      return respond(503, origin);
    }
  },
};
