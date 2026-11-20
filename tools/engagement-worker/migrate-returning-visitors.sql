-- Apply ONCE after migrate-game-metrics.sql. Existing rows remain anonymous.
-- Do not backfill identities or invent last-seen timestamps for old records.
ALTER TABLE engagement_pages ADD COLUMN visitor_id TEXT;
ALTER TABLE engagement_pages ADD COLUMN last_seen_at TEXT;

CREATE INDEX IF NOT EXISTS engagement_visitor_visit ON engagement_pages(visitor_id, visit_id);

CREATE VIEW IF NOT EXISTS engagement_visitor_visits AS
WITH visits AS (
  SELECT visitor_id, visit_id, MIN(created_at) AS first_seen_at,
         MAX(COALESCE(last_seen_at, created_at)) AS last_seen_at,
         SUM(active_ms) AS active_ms, SUM(play_ms) AS play_ms
  FROM engagement_pages WHERE visitor_id IS NOT NULL
  GROUP BY visitor_id, visit_id
)
SELECT *, ROW_NUMBER() OVER (
  PARTITION BY visitor_id ORDER BY first_seen_at, visit_id
) AS session_number
FROM visits;

CREATE VIEW IF NOT EXISTS engagement_visitor_summary AS
SELECT visitor_id, COUNT(*) AS sessions, COUNT(*) - 1 AS return_sessions,
       MIN(first_seen_at) AS first_seen_at, MAX(last_seen_at) AS last_seen_at,
       ROUND(SUM(active_ms) / 60000.0, 2) AS total_active_minutes,
       ROUND(SUM(play_ms) / 60000.0, 2) AS total_play_minutes,
       ROUND(AVG(active_ms) / 60000.0, 2) AS avg_session_minutes,
       ROUND(MAX(active_ms) / 60000.0, 2) AS longest_session_minutes,
       ROUND(AVG(play_ms) / 60000.0, 2) AS avg_play_minutes_per_session,
       ROUND(MAX(play_ms) / 60000.0, 2) AS longest_play_minutes,
       COUNT(play_ms) AS sessions_with_play_measurement
FROM engagement_visitor_visits GROUP BY visitor_id;

CREATE VIEW IF NOT EXISTS engagement_visitor_games AS
WITH plays AS (
  SELECT visitor_id, game_id, visit_id, SUM(play_ms) AS play_ms,
         MIN(created_at) AS first_seen_at,
         MAX(COALESCE(last_seen_at, created_at)) AS last_seen_at
  FROM engagement_pages
  WHERE visitor_id IS NOT NULL AND game_id IS NOT NULL AND play_ms > 0
  GROUP BY visitor_id, game_id, visit_id
)
SELECT visitor_id, game_id, COUNT(*) AS plays,
       ROUND(SUM(play_ms) / 60000.0, 2) AS total_play_minutes,
       ROUND(AVG(play_ms) / 60000.0, 2) AS avg_minutes_per_play,
       ROUND(MAX(play_ms) / 60000.0, 2) AS longest_play_minutes,
       MIN(first_seen_at) AS first_seen_at, MAX(last_seen_at) AS last_seen_at
FROM plays GROUP BY visitor_id, game_id;

CREATE VIEW IF NOT EXISTS engagement_visitor_coverage AS
WITH visits AS (
  SELECT visit_id, MAX(visitor_id IS NOT NULL) AS identified
  FROM engagement_pages GROUP BY visit_id
), coverage AS (
  SELECT COUNT(*) AS tracked_visits, COALESCE(SUM(identified), 0) AS identified_visits,
         COALESCE(SUM(identified = 0), 0) AS anonymous_visits,
         ROUND(100.0 * SUM(identified) / NULLIF(COUNT(*), 0), 2) AS identified_visit_percent
  FROM visits
), browsers AS (
  SELECT COUNT(*) AS identifiable_browsers,
         COALESCE(SUM(sessions > 1), 0) AS returning_browsers,
         COALESCE(SUM(return_sessions), 0) AS return_sessions,
         ROUND(100.0 * SUM(sessions > 1) / NULLIF(COUNT(*), 0), 2) AS returning_browser_percent
  FROM engagement_visitor_summary
)
SELECT * FROM coverage CROSS JOIN browsers;
