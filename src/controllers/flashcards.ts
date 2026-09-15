import type { Request, Response } from 'express';
import { flashcardActionSchema } from '../schemas/flashcardSchemas';
import { getFlashcardModule } from '../server/getModule';

export async function getFlashcards(request: Request, response: Response) {
  response.json(await getFlashcardModule(request).getState(response.locals.userId as string));
}
export async function postFlashcardAction(request: Request, response: Response) {
  const input = flashcardActionSchema.parse(request.body ?? {});
  response.json(await getFlashcardModule(request).execute(response.locals.userId as string, input));
}
