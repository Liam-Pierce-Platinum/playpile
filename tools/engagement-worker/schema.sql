CREATE TABLE IF NOT EXISTS engagement_pages (
  visit_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  active_ms INTEGER NOT NULL CHECK (active_ms BETWEEN 0 AND 28800000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  play_ms INTEGER CHECK (play_ms BETWEEN 0 AND active_ms),
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
