-- Apply ONCE to the existing database after migrate-play-time.sql.
-- Historical rows stay unassigned; no game identity can be reconstructed for them.
ALTER TABLE engagement_pages ADD COLUMN game_id TEXT;

CREATE INDEX IF NOT EXISTS engagement_game_visit ON engagement_pages(game_id, visit_id);

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
