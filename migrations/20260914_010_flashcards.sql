CREATE TABLE flashcard_decks (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(60) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (TRIM(name) <> ''),
  INDEX flashcard_decks_owner_idx (user_id, deleted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE flashcard_cards (
  id CHAR(36) PRIMARY KEY,
  deck_id CHAR(36) NOT NULL,
  word VARCHAR(80) NOT NULL,
  translation VARCHAR(160) NOT NULL,
  normalized_word VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
  due_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  interval_days DOUBLE NOT NULL DEFAULT 0,
  ease DOUBLE NOT NULL DEFAULT 2.5,
  reviews INT UNSIGNED NOT NULL DEFAULT 0,
  lapses INT UNSIGNED NOT NULL DEFAULT 0,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  last_reviewed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  deleted_at DATETIME(3) NULL,
  active_word VARCHAR(255) COLLATE utf8mb4_bin GENERATED ALWAYS AS
    (CASE WHEN deleted_at IS NULL THEN normalized_word ELSE NULL END) STORED,
  FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  CHECK (TRIM(word) <> '' AND TRIM(translation) <> ''),
  CHECK (interval_days >= 0 AND ease BETWEEN 1.3 AND 3.5),
  UNIQUE KEY flashcard_cards_word_unique (deck_id, active_word),
  INDEX flashcard_cards_due_idx (deck_id, deleted_at, due_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE flashcard_sessions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  deck_id CHAR(36) NULL,
  review_type VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'in_progress',
  card_ids JSON NOT NULL,
  remaining_card_ids JSON NOT NULL,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  last_activity_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id),
  CHECK (review_type IN ('due', 'all')),
  CHECK (status IN ('in_progress', 'completed', 'ended', 'abandoned')),
  CHECK ((status = 'in_progress' AND finished_at IS NULL) OR
         (status <> 'in_progress' AND finished_at IS NOT NULL)),
  INDEX flashcard_sessions_owner_idx (user_id, started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE flashcard_reviews (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36) NOT NULL,
  card_id CHAR(36) NOT NULL,
  word VARCHAR(80) NOT NULL,
  translation VARCHAR(160) NOT NULL,
  rating VARCHAR(10) NOT NULL,
  previous_interval_days DOUBLE NOT NULL,
  interval_days DOUBLE NOT NULL,
  previous_ease DOUBLE NOT NULL,
  ease DOUBLE NOT NULL,
  due_at DATETIME(3) NOT NULL,
  reviewed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (session_id) REFERENCES flashcard_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (card_id) REFERENCES flashcard_cards(id),
  CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  UNIQUE KEY flashcard_reviews_session_card_unique (session_id, card_id),
  INDEX flashcard_reviews_card_time_idx (card_id, reviewed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
