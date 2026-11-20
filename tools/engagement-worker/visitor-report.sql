-- Private D1 Studio only. Browser identifiers must not be published.
-- Lifetime coverage includes pre-launch anonymous visits. For adoption since
-- launch, use the dated coverage query below with an explicit UTC start.
SELECT * FROM engagement_visitor_coverage;

-- One row per consenting browser ID (not per person).
SELECT * FROM engagement_visitor_summary ORDER BY sessions DESC, total_active_minutes DESC;

-- Optional details for one browser. Bind its UUID privately in D1 Studio.
-- SELECT visitor_id, visit_id, session_number, first_seen_at, last_seen_at,
--        ROUND(active_ms / 60000.0, 2) AS active_minutes,
--        ROUND(play_ms / 60000.0, 2) AS play_minutes
-- FROM engagement_visitor_visits WHERE visitor_id = ?1
-- ORDER BY first_seen_at, visit_id;
-- SELECT * FROM engagement_visitor_games WHERE visitor_id = ?1
-- ORDER BY plays DESC, total_play_minutes DESC;

-- Dated session-start cohort: bind inclusive UTC start and exclusive UTC end.
-- Keep session_number from the complete history so a first visit within this
-- window can still be a return to an earlier visit outside the window.
-- New and returning browser columns can overlap when both occur in the window.
-- Full session totals are included even when a session crosses the time boundary.
-- SELECT COUNT(*) AS identified_sessions,
--        COUNT(DISTINCT visitor_id) AS identifiable_browsers,
--        COUNT(DISTINCT CASE WHEN session_number = 1 THEN visitor_id END) AS new_browsers,
--        COUNT(DISTINCT CASE WHEN session_number > 1 THEN visitor_id END) AS returning_browsers,
--        SUM(session_number > 1) AS return_sessions,
--        ROUND(100.0 * COUNT(DISTINCT CASE WHEN session_number > 1 THEN visitor_id END)
--              / NULLIF(COUNT(DISTINCT visitor_id), 0), 2) AS returning_browser_percent,
--        ROUND(SUM(active_ms) / 60000.0, 2) AS active_minutes,
--        ROUND(SUM(play_ms) / 60000.0, 2) AS play_minutes
-- FROM engagement_visitor_visits
-- WHERE first_seen_at >= ?1 AND first_seen_at < ?2;

-- Dated visit coverage, including anonymous visits, using the same UTC bounds.
-- WITH visits AS (
--   SELECT visit_id, MIN(created_at) AS first_seen_at,
--          MAX(visitor_id IS NOT NULL) AS identified
--   FROM engagement_pages GROUP BY visit_id
-- )
-- SELECT COUNT(*) AS tracked_visits, COALESCE(SUM(identified), 0) AS identified_visits,
--        COALESCE(SUM(identified = 0), 0) AS anonymous_visits,
--        ROUND(100.0 * SUM(identified) / NULLIF(COUNT(*), 0), 2) AS identified_visit_percent
-- FROM visits WHERE first_seen_at >= ?1 AND first_seen_at < ?2;
