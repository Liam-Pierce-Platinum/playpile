-- Private D1 Studio: lifetime ranking. No public analytics endpoint is exposed.
SELECT game_id, plays, total_active_minutes, avg_minutes_per_play, longest_play_minutes
FROM engagement_game_summary
ORDER BY plays DESC, total_active_minutes DESC, game_id;

-- Optional date cohort: bind UTC start and exclusive UTC end (YYYY-MM-DD HH:MM:SS).
-- These are visit/game cohorts by first recorded qualifying page, not minutes
-- restricted to that calendar interval. A visit crossing midnight stays together.
-- SELECT game_id, COUNT(*) AS plays,
--        ROUND(SUM(play_ms) / 60000.0, 2) AS total_active_minutes,
--        ROUND(AVG(play_ms) / 60000.0, 2) AS avg_minutes_per_play,
--        ROUND(MAX(play_ms) / 60000.0, 2) AS longest_play_minutes
-- FROM engagement_game_plays
-- WHERE first_recorded_at >= ?1 AND first_recorded_at < ?2
-- GROUP BY game_id
-- ORDER BY plays DESC, total_active_minutes DESC, game_id;
