ALTER TABLE match_players
  ADD COLUMN lives_remaining TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER level_reached,
  ADD CONSTRAINT match_players_lives_valid CHECK (lives_remaining BETWEEN 0 AND 3);
