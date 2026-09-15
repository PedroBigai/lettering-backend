const assert = require('node:assert/strict');
const test = require('node:test');
const { scheduleFlashcard } = require('../dist/modules/game/flashcardScheduler');
const { flashcardActionSchema } = require('../dist/schemas/flashcardSchemas');

test('flashcards preserve scheduling rules and increment version without mutating the card', () => {
  const card = { id: 'card', word: 'DOG', translation: 'cachorro', dueAt: 0,
    intervalDays: 0, ease: 2.5, reviews: 0, lapses: 0, lastReviewedAt: null, version: 0 };
  const now = 1000000;
  assert.deepEqual(['again', 'hard', 'good', 'easy'].map(rating => scheduleFlashcard(card, rating, now).dueAt - now),
    [60000, 600000, 86400000, 345600000]);
  const first = scheduleFlashcard(card, 'good', now);
  assert.ok(scheduleFlashcard(first, 'good', now).intervalDays > first.intervalDays);
  const failed = scheduleFlashcard(first, 'again', now);
  assert.equal(failed.lapses, 1);
  assert.equal(failed.version, 2);
  assert.equal(card.reviews, 0);
  assert.equal(card.version, 0);
});

test('flashcard commands reject client scheduling values and invalid ratings', () => {
  const input = { action: 'review', id: 'b9b7fa6d-9d8d-445b-a30b-0ed887c97c9e',
    sessionId: 'b9b7fa6d-9d8d-445b-a30b-0ed887c97c9f', cardId: 'b9b7fa6d-9d8d-445b-a30b-0ed887c97c90',
    version: 0, rating: 'good' };
  assert.equal(flashcardActionSchema.safeParse(input).success, true);
  assert.equal(flashcardActionSchema.safeParse({ ...input, dueAt: 0 }).success, false);
  assert.equal(flashcardActionSchema.safeParse({ ...input, rating: 'correct' }).success, false);
  assert.equal(flashcardActionSchema.safeParse({ ...input, version: -1 }).success, false);
});
