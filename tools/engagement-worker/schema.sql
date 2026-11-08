CREATE TABLE IF NOT EXISTS engagement_pages (
  visit_id TEXT NOT NULL,
  page_id TEXT NOT NULL,
  active_ms INTEGER NOT NULL CHECK (active_ms BETWEEN 0 AND 28800000),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
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
