import type { Request } from 'express';
import type { AuthModule } from '../modules/authModule';
import type { MatchModule } from '../modules/matchModule';

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
