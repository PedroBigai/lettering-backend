CREATE TABLE matches (
  id CHAR(36) PRIMARY KEY,
  language VARCHAR(10) NOT NULL,
  mode VARCHAR(30) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'waiting',
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT matches_language_not_blank CHECK (TRIM(language) <> ''),
  CONSTRAINT matches_mode_not_blank CHECK (TRIM(mode) <> ''),
  CONSTRAINT matches_status_valid CHECK (
    status IN ('waiting', 'in_progress', 'finished', 'cancelled')
  ),
  CONSTRAINT matches_finished_after_start CHECK (
    finished_at IS NULL OR (started_at IS NOT NULL AND finished_at >= started_at)
  )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE match_players (
  id CHAR(36) PRIMARY KEY,
  match_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  level_reached INTEGER NOT NULL DEFAULT 1,
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  CONSTRAINT match_players_match_fk
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE,
  CONSTRAINT match_players_user_fk
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT match_players_score_non_negative CHECK (score >= 0),
  CONSTRAINT match_players_level_positive CHECK (level_reached >= 1),
  CONSTRAINT match_players_finished_after_join CHECK (
    finished_at IS NULL OR finished_at >= joined_at
  ),
  CONSTRAINT match_players_match_user_unique UNIQUE (match_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Preserva partidas já registradas: cada jogo antigo se torna uma partida.
INSERT INTO matches (
  id,
  language,
  mode,
  status,
  started_at,
  finished_at,
  created_at
)
SELECT
  id,
  language,
  mode,
  CASE WHEN finished_at IS NULL THEN 'in_progress' ELSE 'finished' END,
  started_at,
  finished_at,
  started_at
FROM games;

-- Preserva o resultado individual usando o antigo game.id como participante.
INSERT INTO match_players (
  id,
  match_id,
  user_id,
  score,
  level_reached,
  joined_at,
  finished_at
)
SELECT
  id,
  id,
  user_id,
  score,
  level_reached,
  started_at,
  finished_at
FROM games;

ALTER TABLE game_words
  DROP FOREIGN KEY game_words_game_fk;

DROP INDEX game_words_game_created_at_idx ON game_words;

ALTER TABLE game_words
  CHANGE COLUMN game_id match_player_id CHAR(36) NOT NULL,
  ADD CONSTRAINT game_words_match_player_fk
    FOREIGN KEY (match_player_id) REFERENCES match_players(id) ON DELETE CASCADE;

DROP TABLE games;

CREATE INDEX matches_status_created_at_idx
  ON matches (status, created_at);

CREATE INDEX match_players_user_joined_at_idx
  ON match_players (user_id, joined_at DESC);

CREATE INDEX match_players_leaderboard_idx
  ON match_players (finished_at, score DESC);

CREATE INDEX game_words_match_player_created_at_idx
  ON game_words (match_player_id, created_at);
