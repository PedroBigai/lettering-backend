export interface Flashcard {
  id: string; word: string; translation: string; dueAt: number;
  intervalDays: number; ease: number; reviews: number; lapses: number;
  lastReviewedAt: number | null; version: number;
}
export interface FlashcardDeck { id: string; name: string; published: boolean; cards: Flashcard[] }
export interface ShopFlashcardDeck {
  id: string; name: string; owner: string; ownerId: string; cardCount: number;
  likes: number; likedByUser: boolean;
}
export interface ShopFlashcardDeckDetails extends ShopFlashcardDeck {
  cards: Array<{ word: string; translation: string }>;
}
export interface FlashcardSession {
  id: string; deckId: string | null; reviewType: 'due' | 'all';
  status: string; cardIds: string[]; remainingCardIds: string[];
}
export type Rating = 'again' | 'hard' | 'good' | 'easy';
