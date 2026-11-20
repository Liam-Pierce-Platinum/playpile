CREATE TABLE IF NOT EXISTS engagement_pages (
  visit_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  active_ms INTEGER NOT NULL CHECK (active_ms BETWEEN 0 AND 28800000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  play_ms INTEGER CHECK (play_ms BETWEEN 0 AND active_ms),
  game_id TEXT,
  PRIMARY KEY (visit_id, page_id)
);

CREATE VIEW IF NOT EXISTS engagement_summary AS
WITH visit_totals AS (
  SELECT visit_id, SUM(active_ms) AS active_ms
  FROM engagement_pages
  GROUP BY visit_id
)
SELECT COUNT(*) AS visits, COALESCE(SUM(active_ms), 0) AS total_active_ms,
       AVG(active_ms) AS average_active_ms
FROM visit_totals;

-- Run in the private D1 console: SELECT * FROM engagement_summary;

CREATE VIEW IF NOT EXISTS engagement_visit_totals AS
SELECT MIN(created_at) AS first_recorded_at, SUM(active_ms) AS active_ms,
       SUM(play_ms) AS play_ms, COUNT(*) AS recorded_pages, COUNT(play_ms) AS play_measured_pages
FROM engagement_pages
GROUP BY visit_id;

-- For a weekly cohort, use the local week's start and end converted to UTC.
-- Bind the two timestamps as YYYY-MM-DD HH:MM:SS in the private D1 console.
-- SELECT COUNT(*) AS visits, SUM(recorded_pages) AS recorded_pages,
--        SUM(active_ms) AS total_active_ms, AVG(active_ms) AS average_active_ms,
--        SUM(play_ms) AS total_play_ms, AVG(play_ms) AS average_play_ms,
--        COUNT(play_ms) AS visits_with_play_measurement,
--        SUM(play_measured_pages) AS play_measured_pages
-- FROM engagement_visit_totals WHERE first_recorded_at >= ?1 AND first_recorded_at < ?2;

CREATE INDEX IF NOT EXISTS engagement_game_visit ON engagement_pages(game_id, visit_id);

-- One play is a visit with positive active gameplay for a named game.
-- Multiple pages/reloads of the same game in that visit remain one play.
CREATE VIEW IF NOT EXISTS engagement_game_plays AS
SELECT game_id, visit_id, MIN(created_at) AS first_recorded_at,
       SUM(play_ms) AS play_ms
FROM engagement_pages
WHERE game_id IS NOT NULL AND play_ms > 0
GROUP BY game_id, visit_id;

CREATE VIEW IF NOT EXISTS engagement_game_summary AS
SELECT game_id, COUNT(*) AS plays,
       ROUND(SUM(play_ms) / 60000.0, 2) AS total_active_minutes,
       ROUND(AVG(play_ms) / 60000.0, 2) AS avg_minutes_per_play,
       ROUND(MAX(play_ms) / 60000.0, 2) AS longest_play_minutes,
       MIN(first_recorded_at) AS first_recorded_at
FROM engagement_game_plays
GROUP BY game_id;
