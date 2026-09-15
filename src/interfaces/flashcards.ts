export interface Flashcard {
  id: string; word: string; translation: string; dueAt: number;
  intervalDays: number; ease: number; reviews: number; lapses: number;
  lastReviewedAt: number | null; version: number;
}
export interface FlashcardDeck { id: string; name: string; cards: Flashcard[] }
export interface FlashcardSession {
  id: string; deckId: string | null; reviewType: 'due' | 'all';
  status: string; cardIds: string[]; remainingCardIds: string[];
}
export type Rating = 'again' | 'hard' | 'good' | 'easy';
