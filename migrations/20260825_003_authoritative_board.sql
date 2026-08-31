ALTER TABLE matches
  ADD COLUMN board_rows TINYINT UNSIGNED NOT NULL DEFAULT 12 AFTER status,
  ADD COLUMN board_columns TINYINT UNSIGNED NOT NULL DEFAULT 9 AFTER board_rows,
  ADD COLUMN min_word_length TINYINT UNSIGNED NOT NULL DEFAULT 3 AFTER board_columns,
  ADD COLUMN max_players TINYINT UNSIGNED NOT NULL DEFAULT 1 AFTER min_word_length,
  ADD COLUMN rules_version VARCHAR(20) NOT NULL DEFAULT '1' AFTER max_players,
  ADD CONSTRAINT matches_board_rows_positive CHECK (board_rows > 0),
  ADD CONSTRAINT matches_board_columns_positive CHECK (board_columns > 0),
  ADD CONSTRAINT matches_min_word_length_valid CHECK (
    min_word_length > 0 AND min_word_length <= board_columns
  ),
  ADD CONSTRAINT matches_max_players_positive CHECK (max_players > 0),
  ADD CONSTRAINT matches_rules_version_not_blank CHECK (TRIM(rules_version) <> '');

UPDATE matches
SET max_players = 2
WHERE mode = 'versus';

ALTER TABLE match_players
  ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'waiting' AFTER user_id,
  ADD COLUMN board_version INTEGER NOT NULL DEFAULT 0 AFTER level_reached,
  ADD COLUMN game_time_ms INTEGER NOT NULL DEFAULT 0 AFTER board_version,
  ADD CONSTRAINT match_players_status_valid CHECK (
    status IN ('waiting', 'playing', 'game_over', 'left')
  ),
  ADD CONSTRAINT match_players_board_version_non_negative CHECK (board_version >= 0),
  ADD CONSTRAINT match_players_game_time_non_negative CHECK (game_time_ms >= 0);

UPDATE match_players
SET status = CASE
  WHEN finished_at IS NULL THEN 'playing'
  ELSE 'game_over'
END;

CREATE TABLE match_letters (
  id CHAR(36) PRIMARY KEY,
  match_player_id CHAR(36) NOT NULL,
  sequence_number INTEGER NOT NULL,
  letter VARCHAR(5) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'queued',
  row_position TINYINT UNSIGNED NULL,
  column_position TINYINT UNSIGNED NULL,
  generated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  activated_at DATETIME(3) NULL,
  placed_at DATETIME(3) NULL,
  cleared_at DATETIME(3) NULL,
  CONSTRAINT match_letters_match_player_fk
    FOREIGN KEY (match_player_id) REFERENCES match_players(id) ON DELETE CASCADE,
  CONSTRAINT match_letters_player_sequence_unique
    UNIQUE (match_player_id, sequence_number),
  CONSTRAINT match_letters_player_cell_unique
    UNIQUE (match_player_id, row_position, column_position),
  CONSTRAINT match_letters_sequence_positive CHECK (sequence_number > 0),
  CONSTRAINT match_letters_letter_not_blank CHECK (TRIM(letter) <> ''),
  CONSTRAINT match_letters_status_valid CHECK (
    status IN ('queued', 'active', 'placed', 'cleared', 'discarded')
  ),
  CONSTRAINT match_letters_row_valid CHECK (
    row_position IS NULL OR row_position BETWEEN 0 AND 11
  ),
  CONSTRAINT match_letters_column_valid CHECK (
    column_position IS NULL OR column_position BETWEEN 0 AND 8
  ),
  CONSTRAINT match_letters_position_matches_status CHECK (
    (status = 'placed' AND row_position IS NOT NULL AND column_position IS NOT NULL)
    OR
    (status <> 'placed' AND row_position IS NULL AND column_position IS NULL)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX match_letters_player_status_sequence_idx
  ON match_letters (match_player_id, status, sequence_number);

ALTER TABLE game_words
  ADD COLUMN board_version INTEGER NOT NULL DEFAULT 0 AFTER points_earned,
  ADD COLUMN cells JSON NULL AFTER game_time_ms,
  ADD CONSTRAINT game_words_board_version_non_negative CHECK (board_version >= 0);

-- Registros anteriores não possuem o snapshot das células que formaram a palavra.
UPDATE game_words
SET cells = JSON_ARRAY()
WHERE cells IS NULL;

ALTER TABLE game_words
  MODIFY COLUMN cells JSON NOT NULL;
