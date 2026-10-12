import type { Request, Response } from 'express';
import { z } from 'zod';
import { flashcardActionSchema } from '../schemas/flashcardSchemas';
import { getFlashcardModule } from '../server/getModule';

export async function getFlashcards(request: Request, response: Response) {
  response.json(await getFlashcardModule(request).getState(response.locals.userId as string));
}
export async function postFlashcardAction(request: Request, response: Response) {
  const input = flashcardActionSchema.parse(request.body ?? {});
  response.json(await getFlashcardModule(request).execute(response.locals.userId as string, input));
}
export async function getFlashcardShop(request: Request, response: Response) {
  response.json(await getFlashcardModule(request).getShop(response.locals.userId as string));
}
export async function getFlashcardShopDeck(request: Request, response: Response) {
  const deckId = z.string().uuid().parse(request.params.deckId);
  response.json(await getFlashcardModule(request).getShopDeck(response.locals.userId as string, deckId));
}
