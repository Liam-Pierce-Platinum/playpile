-- Apply once to a database created before play-time tracking.
ALTER TABLE engagement_pages ADD COLUMN play_ms INTEGER CHECK (play_ms BETWEEN 0 AND active_ms);

CREATE VIEW IF NOT EXISTS engagement_visit_totals AS
SELECT MIN(created_at) AS first_recorded_at, SUM(active_ms) AS active_ms,
       SUM(play_ms) AS play_ms, COUNT(*) AS recorded_pages, COUNT(play_ms) AS play_measured_pages
FROM engagement_pages
GROUP BY visit_id;
