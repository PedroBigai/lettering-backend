ALTER TABLE flashcard_decks
  DROP INDEX flashcard_decks_share_code_unique,
  DROP COLUMN share_code,
  ADD COLUMN published_at DATETIME(3) NULL AFTER name,
  ADD INDEX flashcard_decks_shop_idx (published_at, deleted_at);

CREATE TABLE flashcard_deck_likes (
  deck_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (deck_id, user_id),
  FOREIGN KEY (deck_id) REFERENCES flashcard_decks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX flashcard_deck_likes_user_idx (user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
