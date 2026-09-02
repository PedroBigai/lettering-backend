import type { RequestHandler } from 'express';
import { getAuthModule } from '../getModule';
import { ApiError } from '../errors';

export const authenticate: RequestHandler = (request, response, next) => {
  const authorization = request.header('authorization');

  if (!authorization?.startsWith('Bearer ')) {
    next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
    return;
  }

  const token = authorization.slice('Bearer '.length).trim();
  if (!token) {
    next(new ApiError(401, 'AUTHENTICATION_REQUIRED', 'Authentication is required'));
    return;
  }

  try {
    response.locals.userId = getAuthModule(request).verifyAuthToken(token);
    next();
  } catch (error) {
    next(error);
  }
};
