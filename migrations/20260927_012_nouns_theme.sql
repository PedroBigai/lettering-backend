ALTER TABLE matches DROP CHECK matches_theme_valid;

ALTER TABLE matches
  ADD CONSTRAINT matches_theme_valid CHECK (
    theme IS NULL OR theme IN (
      'animals', 'objects', 'verbs', 'food', 'places', 'nouns',
      'adjectives', 'colors', 'nature', 'professions'
    )
  );
