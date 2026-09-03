ALTER TABLE matches
  ADD COLUMN theme VARCHAR(30) NULL AFTER mode;

ALTER TABLE matches
  ADD CONSTRAINT matches_mode_valid CHECK (
    mode IN ('classic', 'learning', 'hardcore', 'versus')
  );

ALTER TABLE matches
  ADD CONSTRAINT matches_theme_valid CHECK (
    theme IS NULL OR theme IN (
      'animals', 'objects', 'verbs', 'food', 'places',
      'adjectives', 'colors', 'nature', 'professions'
    )
  );
