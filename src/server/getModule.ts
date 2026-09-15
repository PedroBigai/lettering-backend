import type { Request } from 'express';
import type { AuthModule } from '../modules/authModule';
import type { MatchModule } from '../modules/matchModule';
import type { FlashcardModule } from '../modules/flashcardModule';

export function getFlashcardModule(request: Request): FlashcardModule {
  const module = request.app.locals.flashcardModule as FlashcardModule | undefined;
  if (!module) throw new Error('Flashcard module is not configured');
  return module;
}

export function getAuthModule(request: Request): AuthModule {
  const authModule = request.app.locals.authModule as AuthModule | undefined;
  if (!authModule) throw new Error('Auth module is not configured');
  return authModule;
}

export function getMatchModule(request: Request): MatchModule {
  const matchModule = request.app.locals.matchModule as MatchModule | undefined;
  if (!matchModule) throw new Error('Match module is not configured');
  return matchModule;
}
