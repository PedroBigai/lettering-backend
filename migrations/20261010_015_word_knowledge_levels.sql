UPDATE user_word_progress
SET level = CASE
  WHEN successes >= 25 THEN 6
  WHEN successes >= 20 THEN 5
  WHEN successes >= 15 THEN 4
  WHEN successes >= 10 THEN 3
  WHEN successes >= 5 THEN 2
  WHEN successes >= 1 THEN 1
  ELSE 0
END;
