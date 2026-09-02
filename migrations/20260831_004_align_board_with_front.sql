-- Alinha a matriz oficial ao tabuleiro atualmente utilizado pelo frontend: 10 x 9.
-- A inclusão da nova constraint falhará caso existam letras posicionadas nas
-- antigas linhas 10 ou 11, evitando descartar ou mover estado de jogo em silêncio.

UPDATE matches
SET board_rows = 10
WHERE board_rows = 12;

ALTER TABLE matches
  MODIFY COLUMN board_rows TINYINT UNSIGNED NOT NULL DEFAULT 10;

ALTER TABLE match_letters
  DROP CHECK match_letters_row_valid;

ALTER TABLE match_letters
  ADD CONSTRAINT match_letters_row_valid CHECK (
    row_position IS NULL OR row_position BETWEEN 0 AND 9
  );
