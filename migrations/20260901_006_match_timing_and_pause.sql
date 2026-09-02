ALTER TABLE match_players
  DROP CHECK match_players_status_valid;

ALTER TABLE match_players
  MODIFY COLUMN status VARCHAR(20) NOT NULL,
  ADD COLUMN paused_at DATETIME(3) NULL AFTER game_time_ms,
  ADD COLUMN total_paused_ms BIGINT UNSIGNED NOT NULL DEFAULT 0 AFTER paused_at,
  ADD COLUMN last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) AFTER total_paused_ms,
  ADD CONSTRAINT match_players_status_valid CHECK (
    status IN ('waiting', 'playing', 'paused', 'game_over', 'left')
  ),
  ADD CONSTRAINT match_players_pause_state_valid CHECK (
    (status = 'paused' AND paused_at IS NOT NULL)
    OR (status <> 'paused' AND paused_at IS NULL)
  );

UPDATE match_players
SET last_activity_at = COALESCE(finished_at, joined_at);

CREATE INDEX match_players_status_activity_idx
  ON match_players (status, last_activity_at);
