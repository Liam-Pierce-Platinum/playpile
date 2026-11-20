# Private engagement reports

The Worker accepts small telemetry beacons, serves `/health`, and supplies the
catalogue's public popularity order at `GET /popular`. This feed returns an
array of game slugs in the `games` field. It orders games by distinct engaged
visits first recorded in the past seven days, then active play time, then slug.
Browsers and the edge can reuse the response for 15 minutes.

Read detailed reports in the authenticated Cloudflare D1 Studio for
`playpile-engagement`. Returning-browser reports use an optional random browser
identifier only after the visitor chooses to allow it.

## Per-game metrics

Run `game-report.sql`, or query `engagement_game_summary`. Each row identifies a
game by its stable catalogue slug and gives:

- `plays`: visits with positive active gameplay for that game, after trusted game
  input. A game page opening without gameplay does not count.
- `total_active_minutes`: cumulative focused, visible game time after game input.
- `avg_minutes_per_play`: total active minutes divided by plays.
- `longest_play_minutes`: the largest total for one visit to that game.

A visit is the existing tab-scoped visit, renewed after a 30-minute inactivity gap.
Reopening/reloading the same game within that visit does not add another play;
its active time is added to that visit/game total. Different games in one visit
each get their own play. These are engaged game visits, not individual rounds,
unique people, or verified completed games. Testing by the owner is not excluded.
Hidden/unfocused time and time after the 90-second input inactivity limit are
excluded by the client. GPC and Do Not Track suppress collection.

Beacons report cumulative page totals. The database keeps each page's maximum,
so retries and out-of-order delivery do not duplicate minutes. A page's first
known game identity cannot be changed to a different game by a later beacon.
The Worker allowlist must be updated when adding catalogue games; the worker test
checks that every current catalogue ID is accepted.

Historical rows with no game ID stay in the existing site-wide reports but are
excluded from per-game reports. Per-game history begins with this deployment.
The optional date query selects cohorts by the first stored page record that
eventually recorded positive gameplay. That timestamp is the page's first beacon,
not an exact play-start timestamp. Full visit/game minutes are included even if
the visit crosses the reporting boundary; the current cumulative schema cannot
split minutes exactly at midnight. Times in D1 are UTC.

## Deployment order

1. For an existing database with `play_ms`, run `migrate-game-metrics.sql` once in
   D1 Studio. Confirm `PRAGMA table_info(engagement_pages)` contains `game_id`.
   For a new empty database use `schema.sql` instead.
2. Deploy the self-contained `worker.mjs`, keeping the existing `DB` binding.
3. Deploy the client. Older clients remain accepted with a null game ID.
4. Verify a new, controlled game visit appears in `engagement_game_summary` and
   ordinary page openings do not add a play. Treat QA traffic as testing data.

An application rollback can keep the additive column and views in place.
Do not rerun the `ALTER TABLE` on a migrated database or delete historical data.

Run relevant backend tests with:
`node --test tests/engagement-worker.test.mjs tests/engagement-game-database.test.mjs tests/engagement-visitor-database.test.mjs`

## Returning-browser reports

Run `visitor-report.sql` in private D1 Studio. Keep browser IDs and session details
private; reports do not have a public API. Available views:

- `engagement_visitor_visits`: one row per browser ID and visit, with first/last
  seen timestamps, active/play milliseconds, and a lifetime `session_number`.
- `engagement_visitor_summary`: sessions, return sessions, first/last seen,
  total active/play minutes, average active minutes per session, longest active
  session, average play minutes per measured session, and longest play session.
- `engagement_visitor_games`: that browser's lifetime plays and play minutes by
  game. A reload in the same visit adds minutes but not a second play.
- `engagement_visitor_coverage`: tracked, identifiable and anonymous visit counts,
  identifiable visit percentage, identifiable and returning browser counts,
  return sessions, and returning browser percentage.

A returning browser has at least two distinct visits under the same identifier;
it can return later the same day. `return_sessions` is sessions minus one, not the
number of different days. These are the existing tab-based visits with a
30-minute inactivity gap. A new tab can therefore be another visit. This is not
a unique-person metric or a claim that someone left and returned on another day.

The returning-browser percentage divides returning identifiable browser IDs by
all identifiable browser IDs. Anonymous visits are excluded from both sides;
they remain visible in coverage. The denominator is an opted-in subset of site
traffic, so its rate cannot be treated as the return rate for everyone. Lifetime
coverage includes historical anonymous visits from before this feature. Use the
dated coverage query from the launch date to assess current collection coverage.
When there are no identified browsers, the percentage is `NULL`, not zero.

The client stores a random ID for at most 90 days after consent. A cleared browser,
expired or replaced ID, private browsing, another device/profile, or opt-out can
break continuity and make a later visit appear new. There is no cross-device or
account matching, fingerprinting, or historical identity reconstruction. Opt-out
stops future identified collection; previously stored totals are not relabeled.
GPC and Do Not Track suppress collection. Owner/test traffic is not excluded.

The client allocates a new page and visit at consent or identity boundaries. The
Worker requires an exact match of the stored and submitted visitor ID for every
existing page, including null. It ignores identity-changing updates: anonymous
totals cannot later be attached to an ID, and subsequent anonymous activity
cannot be appended to an identified page. This also applies to zero-time pages.
Older clients continue to insert anonymous rows and update their own anonymous
pages. Only a new page can start with a different identity.

`last_seen_at` is generated by the server on insertion or when cumulative active
or play time increases. A duplicate, stale retry, or game-metadata-only update
does not make a browser look recently active. It is a receipt time with the usual
beacon delay, not an exact last input time. Timestamps are UTC. Old rows receive
neither visitor IDs nor fabricated last-seen timestamps.

Date reports select sessions whose first stored record is within the UTC bounds.
They use lifetime session numbers, so a session in the window can be a return to
an earlier one outside it. Full cumulative session minutes are included even if
the session crosses the boundary. New and returning browser counts can overlap
when a browser starts and returns within the same window. These are observed
session cohorts, not exact calendar-minute totals or a fixed-day retention rate.

### Deploy returning-browser tracking

1. For the existing database that already has `game_id`, run
   `migrate-returning-visitors.sql` once in D1 Studio. Check that `visitor_id` and
   `last_seen_at` exist and historical `visitor_id` values are null. A new empty
   database uses the complete `schema.sql` instead.
2. Deploy `worker.mjs` with the unchanged `DB` binding, then deploy the client.
3. Verify anonymous visits remain anonymous, consent starts a new visit/page,
   repeated reports do not inflate totals, and a second visit with the same
   consenting browser ID produces one return session. QA traffic remains in
   reports as test activity; the production schema has no test-traffic flag.

The migration is additive and preserves per-game and site-wide views. A code
rollback can leave the new columns and views in place. Do not rerun the ALTERs,
attach identities to older records, or discard existing telemetry.
