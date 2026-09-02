import type { AuthModule } from '../modules/authModule';
import type { MatchModule } from '../modules/matchModule';

export interface AppDependencies {
  authModule?: AuthModule;
  matchModule?: MatchModule;
  allowedOrigins?: readonly string[];
  enableRequestLogging?: boolean;
}
