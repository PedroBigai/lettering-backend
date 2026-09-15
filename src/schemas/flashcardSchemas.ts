import { z } from 'zod';
const id = z.string().uuid();
const name = z.string().trim().min(1).max(60);
const card = { word: z.string().trim().min(1).max(80), translation: z.string().trim().min(1).max(160) };
export const flashcardActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createDeck'), id, name }).strict(),
  z.object({ action: z.literal('renameDeck'), id, name }).strict(),
  z.object({ action: z.literal('deleteDeck'), id }).strict(),
  z.object({ action: z.literal('createCard'), id, deckId: id, ...card }).strict(),
  z.object({ action: z.literal('editCard'), id, deckId: id, version: z.number().int().nonnegative(), ...card }).strict(),
  z.object({ action: z.literal('deleteCard'), id, deckId: id }).strict(),
  z.object({ action: z.literal('startSession'), id, deckId: id.nullable(), reviewType: z.enum(['due', 'all']) }).strict(),
  z.object({ action: z.literal('review'), id, sessionId: id, cardId: id,
    version: z.number().int().nonnegative(), rating: z.enum(['again', 'hard', 'good', 'easy']) }).strict(),
  z.object({ action: z.literal('finishSession'), id }).strict(),
]);
export type FlashcardAction = z.infer<typeof flashcardActionSchema>;
