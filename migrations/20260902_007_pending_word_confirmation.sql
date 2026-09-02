CREATE TABLE match_pending_words (
  match_player_id CHAR(36) PRIMARY KEY,
  formed_word VARCHAR(80) NOT NULL,
  direction VARCHAR(10) NOT NULL,
  points_earned INTEGER NOT NULL,
  board_version INTEGER NOT NULL,
  cells JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT match_pending_words_player_fk
    FOREIGN KEY (match_player_id) REFERENCES match_players(id) ON DELETE CASCADE,
  CONSTRAINT match_pending_words_word_not_blank CHECK (TRIM(formed_word) <> ''),
  CONSTRAINT match_pending_words_direction_valid CHECK (
    direction IN ('horizontal', 'vertical')
  ),
  CONSTRAINT match_pending_words_points_non_negative CHECK (points_earned >= 0),
  CONSTRAINT match_pending_words_board_version_non_negative CHECK (board_version >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
