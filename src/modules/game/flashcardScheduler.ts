import type { Flashcard, Rating } from '../../interfaces/flashcards';

// Same scheduling rules as the existing client, calculated with server time.
export function scheduleFlashcard(card: Flashcard, rating: Rating, now: number): Flashcard {
  let ease = card.ease;
  let intervalDays: number;
  switch (rating) {
    case 'again': intervalDays = 1 / 1440; ease = Math.max(1.3, ease - 0.2); break;
    case 'hard':
      intervalDays = card.intervalDays < 1 ? 10 / 1440 : Math.max(card.intervalDays + 1, Math.round(card.intervalDays * 1.2));
      ease = Math.max(1.3, ease - 0.15); break;
    case 'good': intervalDays = card.intervalDays < 1 ? 1 : Math.max(card.intervalDays + 1, Math.round(card.intervalDays * ease)); break;
    case 'easy':
      intervalDays = card.intervalDays < 1 ? 4 : Math.max(card.intervalDays + 2, Math.ceil(card.intervalDays * ease * 1.3));
      ease = Math.min(3.5, ease + 0.15); break;
  }
  intervalDays = Math.min(36500, intervalDays);
  return { ...card, ease, intervalDays, dueAt: now + Math.round(intervalDays * 86400000),
    reviews: card.reviews + 1, lapses: card.lapses + Number(rating === 'again'),
    lastReviewedAt: now, version: card.version + 1 };
}
