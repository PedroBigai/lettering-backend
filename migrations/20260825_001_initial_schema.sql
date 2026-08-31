CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  username VARCHAR(30) NOT NULL UNIQUE,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT users_username_not_blank CHECK (TRIM(username) <> ''),
  CONSTRAINT users_email_not_blank CHECK (TRIM(email) <> ''),
  CONSTRAINT users_email_normalized CHECK (email = LOWER(TRIM(email)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS games (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  language VARCHAR(10) NOT NULL,
  mode VARCHAR(30) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  level_reached INTEGER NOT NULL DEFAULT 1,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  CONSTRAINT games_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT games_language_not_blank CHECK (TRIM(language) <> ''),
  CONSTRAINT games_mode_not_blank CHECK (TRIM(mode) <> ''),
  CONSTRAINT games_score_non_negative CHECK (score >= 0),
  CONSTRAINT games_level_positive CHECK (level_reached >= 1),
  CONSTRAINT games_finished_after_start CHECK (
    finished_at IS NULL OR finished_at >= started_at
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS game_words (
  id CHAR(36) PRIMARY KEY,
  game_id CHAR(36) NOT NULL,
  formed_word VARCHAR(80) NOT NULL,
  points_earned INTEGER NOT NULL,
  game_time_ms INTEGER,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT game_words_game_fk FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
  CONSTRAINT game_words_formed_word_not_blank CHECK (TRIM(formed_word) <> ''),
  CONSTRAINT game_words_points_non_negative CHECK (points_earned >= 0),
  CONSTRAINT game_words_time_non_negative CHECK (
    game_time_ms IS NULL OR game_time_ms >= 0
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX games_user_started_at_idx
  ON games (user_id, started_at DESC);

CREATE INDEX games_leaderboard_idx
  ON games (finished_at, score DESC);

CREATE INDEX game_words_game_created_at_idx
  ON game_words (game_id, created_at);
