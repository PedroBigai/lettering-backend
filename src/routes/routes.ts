import { Router } from 'express';
import { getMe } from '../controllers/getMe';
import { postAuth } from '../controllers/postAuth';
import { postRegisterUser } from '../controllers/postRegisterUser';
import { postMatch } from '../controllers/postMatch';
import { getMatch } from '../controllers/getMatch';
import { getMatches } from '../controllers/getMatches';
import { getMatchState } from '../controllers/getMatchState';
import { postLeaveMatch } from '../controllers/postLeaveMatch';
import { postPauseMatch } from '../controllers/postPauseMatch';
import { postMatchPiece } from '../controllers/postMatchPiece';
import { postResumeMatch } from '../controllers/postResumeMatch';
import { postConfirmMatchWord } from '../controllers/postConfirmMatchWord';
import { authenticate } from '../server/middlewares/authenticate';
import { rateLimit } from '../server/middlewares/rateLimit';

export function createApiRouter(includeMatchRoutes = true) {
  const router = Router();
  const limitLogin = rateLimit({
    windowMs: 15 * 60 * 1_000,
    maxRequests: 10,
    key: (request) =>
      `${request.ip ?? 'unknown'}:${String(request.body?.email ?? '').toLowerCase()}`,
  });
  const limitMatchCreation = rateLimit({
    windowMs: 60 * 1_000,
    maxRequests: 10,
    key: (_request, response) => String(response.locals.userId ?? 'unknown'),
  });

  router.post('/auth/register', postRegisterUser);
  router.post('/auth/login', limitLogin, postAuth);
  router.get('/auth/me', authenticate, getMe);

  if (includeMatchRoutes) {
    router.post(
      '/matches',
      authenticate,
      limitMatchCreation,
      postMatch,
    );
    router.get('/matches', authenticate, getMatches);
    router.get(
      '/matches/:matchId/state',
      authenticate,
      getMatchState,
    );
    router.post(
      '/matches/:matchId/pieces/place',
      authenticate,
      postMatchPiece,
    );
    router.post(
      '/matches/:matchId/words/confirm',
      authenticate,
      postConfirmMatchWord,
    );
    router.post(
      '/matches/:matchId/leave',
      authenticate,
      postLeaveMatch,
    );
    router.post('/matches/:matchId/pause', authenticate, postPauseMatch);
    router.post('/matches/:matchId/resume', authenticate, postResumeMatch);
    router.get('/matches/:matchId', authenticate, getMatch);
  }

  return router;
}
