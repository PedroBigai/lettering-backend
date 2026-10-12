ALTER TABLE flashcard_decks
  ADD COLUMN share_code CHAR(12) NULL AFTER name,
  ADD UNIQUE KEY flashcard_decks_share_code_unique (share_code);
