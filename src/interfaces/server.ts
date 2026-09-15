import type { AuthModule } from '../modules/authModule';
import type { MatchModule } from '../modules/matchModule';
import type { FlashcardModule } from '../modules/flashcardModule';

export interface AppDependencies {
  authModule?: AuthModule;
  matchModule?: MatchModule;
  flashcardModule?: FlashcardModule;
  allowedOrigins?: readonly string[];
  enableRequestLogging?: boolean;
}
