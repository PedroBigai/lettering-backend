ALTER TABLE matches
  ADD COLUMN target_word_count SMALLINT UNSIGNED NULL AFTER theme;

-- Partidas temáticas criadas antes desta migração passam a usar o menor objetivo.
UPDATE matches
SET target_word_count = 5
WHERE mode = 'learning' AND target_word_count IS NULL;

ALTER TABLE matches
  ADD CONSTRAINT matches_target_word_count_valid CHECK (
    (mode = 'learning' AND target_word_count IN (5, 10, 25, 50))
    OR (mode <> 'learning' AND target_word_count IS NULL)
  );

ALTER TABLE match_players
  DROP CHECK match_players_status_valid;

ALTER TABLE match_players
  ADD CONSTRAINT match_players_status_valid CHECK (
    status IN ('waiting', 'playing', 'paused', 'game_over', 'completed', 'left')
  );

CREATE INDEX matches_ranking_filter_idx
  ON matches (mode, theme, target_word_count, status, finished_at);
