# Private engagement reports

The public Worker only accepts small telemetry beacons and serves `/health`.
Read reports in the authenticated Cloudflare D1 Studio for `playpile-engagement`.
There is no public report endpoint and no new visitor identifier.

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
`node --test tests/engagement-worker.test.mjs tests/engagement-game-database.test.mjs`
