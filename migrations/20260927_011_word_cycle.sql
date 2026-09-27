ALTER TABLE match_players
  ADD COLUMN word_cycle JSON NULL AFTER board_version;

CREATE TABLE user_word_progress (
  user_id CHAR(36) NOT NULL,
  theme VARCHAR(30) NOT NULL,
  normalized_word VARCHAR(50) NOT NULL,
  level TINYINT UNSIGNED NOT NULL DEFAULT 0,
  due_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  exposures INT UNSIGNED NOT NULL DEFAULT 0,
  successes INT UNSIGNED NOT NULL DEFAULT 0,
  last_seen_at DATETIME(3) NULL,
  last_success_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, theme, normalized_word),
  CONSTRAINT user_word_progress_user_fk FOREIGN KEY (user_id)
    REFERENCES users(id) ON DELETE CASCADE,
  INDEX user_word_progress_due_idx (user_id, theme, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
